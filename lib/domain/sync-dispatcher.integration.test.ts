import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterAll, describe, expect, test } from 'vitest';

import { correrSync, limpiarSync, sembrarFeed, sqlDePruebas } from '@/lib/test/sync';

/**
 * CRITERIO 1 DEL ROADMAP: CADA FEED SE LEE AISLADO Y UNO CAÍDO NO ARRASTRA A
 * LOS DEMÁS.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ES LA ASERCIÓN QUE JUSTIFICA TODA LA ARQUITECTURA DE FAN-OUT.
 *
 * Un bucle de `fetch` dentro de un solo worker es más corto de escribir y falla
 * de la peor manera posible: el feed número tres se cuelga quince segundos, los
 * treinta y uno que van detrás se quedan sin sincronizar esa vuelta, y el
 * síntoma —una agenda incompleta— no apunta a ninguna parte.
 *
 * `dispatch_feed_syncs()` no lee ningún feed: encola UNA petición HTTP por feed
 * vencido y vuelve. Cada feed acaba en su propia invocación, con su propia
 * transacción y su propio timeout. El aislamiento es estructural, no una
 * promesa del código de error.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── CÓMO SE MIDE SIN ROMPER LA BASE COMPARTIDA ──────────────────────────────
 *
 * El esquema `net` y `dispatch_feed_syncs()` NO son alcanzables por PostgREST:
 * la migración 14 revoca `execute` de `public` y no le da grant a
 * `service_role`. Se habla con la base como `postgres`, que es lo mismo que
 * hace `pg_cron` en producción.
 *
 * Y todo va dentro de un `begin … rollback`: los secretos de Vault se crean
 * dentro, así que el job de producción de la base local —que hoy falla cada
 * minuto justamente por falta de esos secretos— no los ve y no puede reclamar
 * los feeds del test a mitad de la medición. Ninguna petición HTTP sale de
 * verdad, porque el trabajador de `pg_net` no puede leer lo no confirmado. Ver
 * `sqlDePruebas` en `lib/test/sync.ts`.
 *
 * ── AVISO OPERATIVO, MEDIDO EN EL PLAN 03-07 ────────────────────────────────
 *
 * `net._http_response` se purga sola a las 6 horas (`pg_net.ttl`). Cualquier
 * aserción sobre "¿llegó el POST?" tiene que hacerse dentro de esa ventana, y
 * por eso aquí se consulta LA COLA en el mismo instante del despacho y no una
 * respuesta más tarde.
 *
 * ── LO QUE ESTE ARCHIVO NO PUEDE VERIFICAR, Y NO FINGE VERIFICAR ────────────
 *
 * Que el job de verdad corre cada minuto durante días. Ninguna suite de tests
 * mide eso: haría falta dejar corriendo el reloj. Se aproxima con el agendado
 * de segundos de `scripts/dev/sync-local.sh` (plan 03-07, medido) y se confirma
 * en la primera corrida real de producción. Lo que sí se afirma aquí es la
 * ARITMÉTICA de la cadencia y que la expresión agendada es la de un minuto.
 */

const FIXTURES = resolve(process.cwd(), 'lib/domain/__fixtures__/ical');
const FEED_REAL = readFileSync(resolve(FIXTURES, 'airbnb-real-anonimizado.ics'), 'utf8');

/** Los códigos de fallo de transporte. Union cerrada de `lib/data/sync.ts`. */
const CODIGOS_DE_TRANSPORTE = [
  'cuerpo_excede_5mib',
  'redirect_bloqueado',
  'timeout',
  'red',
  'destino_no_permitido',
  'rpc_fallido',
] as const;

/** El prólogo de todo guion: los dos secretos, dentro de la transacción. */
const PROLOGO = `
begin;
select vault.create_secret('http://127.0.0.1:1', 'app_base_url', 'prueba 03-08');
select vault.create_secret('secreto-de-prueba', 'cron_shared_secret', 'prueba 03-08');
`;

/**
 * Cuántas peticiones hay encoladas para cada uno de los feeds dados, en el
 * mismo orden. `body` es `bytea` en `net.http_request_queue`, de ahí la
 * conversión.
 *
 * Se filtra por los feeds de ESTE archivo y nunca se cuenta la cola entera: la
 * base es compartida y un conteo global sería una aserción sobre el estado de
 * otro.
 */
function contarEnCola(ids: string[]): string {
  return ids
    .map(
      (id) =>
        `select count(*) from net.http_request_queue where convert_from(body, 'utf8') like '%${id}%';`,
    )
    .join('\n');
}

function despachar(guionDeEscenario: string, cierre: string): number[] {
  const salida = sqlDePruebas(`${PROLOGO}${guionDeEscenario}
select public.dispatch_feed_syncs();
${cierre}
rollback;
`);
  // `vault.create_secret` devuelve un uuid cada uno, y `dispatch_feed_syncs()`
  // su contador. Lo que interesa son las líneas del cierre, que van al final.
  return salida.map((l) => Number(l)).filter((n) => Number.isFinite(n));
}

afterAll(async () => {
  await limpiarSync();
});

// ════════════════════════════════════════════════════════════════════════════
// EL FAN-OUT
// ════════════════════════════════════════════════════════════════════════════

describe('el fan-out encola una petición por feed vencido', () => {
  test('1: de tres feeds, solo el vencido produce una fila en la cola', async () => {
    const a = await sembrarFeed();
    const b = await sembrarFeed();
    const c = await sembrarFeed();

    const escenario = `
update public.calendar_feeds
   set next_sync_at = now() - interval '1 minute', claimed_at = null
 where id = '${a.feedId}';
update public.calendar_feeds
   set next_sync_at = now() + interval '30 minutes', claimed_at = null
 where id in ('${b.feedId}', '${c.feedId}');
`;

    const [enA, enB, enC] = despachar(
      escenario,
      contarEnCola([a.feedId, b.feedId, c.feedId]).concat(''),
    ).slice(-3);

    expect(enA).toBe(1);
    // CONTROL: los otros dos NO se despachan. Sin esta mitad, un dispatcher que
    // encolara todo pasaría la primera línea.
    expect(enB).toBe(0);
    expect(enC).toBe(0);
  });

  test('2: tres feeds vencidos producen tres POST, uno por feed', async () => {
    const a = await sembrarFeed();
    const b = await sembrarFeed();
    const c = await sembrarFeed();
    const ids = [a.feedId, b.feedId, c.feedId];

    const escenario = `
update public.calendar_feeds
   set next_sync_at = now() - interval '1 minute', claimed_at = null
 where id in ('${ids.join("', '")}');
`;

    const conteos = despachar(escenario, contarEnCola(ids)).slice(-3);

    // ES LO QUE AÍSLA LOS FEEDS POR CONSTRUCCIÓN: tres invocaciones HTTP
    // separadas, no un bucle dentro de una. Un feed colgado no comparte ni
    // proceso ni transacción con los otros.
    expect(conteos).toEqual([1, 1, 1]);
  });

  test('9: un feed inactivo no se despacha aunque esté vencido', async () => {
    const inactivo = await sembrarFeed({ activo: false });
    const activo = await sembrarFeed();

    const escenario = `
update public.calendar_feeds
   set next_sync_at = now() - interval '1 minute', claimed_at = null
 where id in ('${inactivo.feedId}', '${activo.feedId}');
`;

    const [enInactivo, enActivo] = despachar(
      escenario,
      contarEnCola([inactivo.feedId, activo.feedId]),
    ).slice(-2);

    expect(enInactivo).toBe(0);
    // CONTROL: el escenario sí despacha algo, así que el cero de arriba es por
    // `is_active` y no porque el dispatcher no hiciera nada.
    expect(enActivo).toBe(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// EL LEASE
// ════════════════════════════════════════════════════════════════════════════

describe('el lease de diez minutos', () => {
  test('4: dos despachos seguidos producen UNA sola petición para el mismo feed', async () => {
    const a = await sembrarFeed();

    const escenario = `
update public.calendar_feeds
   set next_sync_at = now() - interval '1 minute', claimed_at = null
 where id = '${a.feedId}';
`;

    // El segundo despacho va DENTRO de la misma transacción: ve el `claimed_at`
    // que acaba de escribir el primero y salta el feed. Es lo que protege al
    // worker que sobrevive a su propio intervalo: si el fetch tarda tres
    // minutos y el tick llega al minuto, sin lease habría dos invocaciones HTTP
    // para el mismo feed.
    const salida = sqlDePruebas(`${PROLOGO}${escenario}
select public.dispatch_feed_syncs();
select public.dispatch_feed_syncs();
${contarEnCola([a.feedId])}
rollback;
`);

    const numeros = salida.map((l) => Number(l)).filter((n) => Number.isFinite(n));
    expect(numeros[numeros.length - 1]).toBe(1);
  });

  test('5: con claimed_at de hace once minutos el feed vuelve a la cola', async () => {
    const a = await sembrarFeed();

    const escenario = `
update public.calendar_feeds
   set next_sync_at = now() - interval '1 minute',
       claimed_at   = now() - interval '11 minutes'
 where id = '${a.feedId}';
`;

    const [enCola] = despachar(escenario, contarEnCola([a.feedId])).slice(-1);
    expect(enCola).toBe(1);

    // CONTROL: con el lease FRESCO el mismo feed no se despacha. Sin esta
    // mitad, la de arriba pasaría con un dispatcher que ignorara `claimed_at`.
    const frescos = `
update public.calendar_feeds
   set next_sync_at = now() - interval '1 minute',
       claimed_at   = now() - interval '1 minute'
 where id = '${a.feedId}';
`;
    const [conLeaseFresco] = despachar(frescos, contarEnCola([a.feedId])).slice(-1);
    expect(conLeaseFresco).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LA ASERCIÓN CENTRAL DEL CRITERIO 1
// ════════════════════════════════════════════════════════════════════════════

describe('un feed caído no le quita el sync a ninguno de los otros', () => {
  test('3 y 8: A falla y entra en backoff, B tiene éxito y avanza treinta minutos', async () => {
    // A apunta a un puerto reservado y cerrado: la dirección es válida y no hay
    // nadie escuchando. Es la forma exacta del feed caído.
    const a = await sembrarFeed({ puertoMuerto: true });
    const b = await sembrarFeed();

    const caido = await correrSync(a.feedId, '');
    const sano = await correrSync(b.feedId, FEED_REAL);

    // ── LAS CUATRO COLUMNAS DE B ────────────────────────────────────────────
    // "B no falló" no es la aserción. La aserción es que B quedó exactamente
    // como si A no existiera.
    expect(sano.cuerpo.outcome).toBe('ok');
    expect(sano.feed.last_success_at).not.toBeNull();
    expect(sano.feed.consecutive_failures).toBe(0);
    expect(sano.feed.claimed_at).toBeNull();

    const desdeB = new Date(sano.feed.last_attempt_at ?? 0).getTime();
    const minutosB = (new Date(sano.feed.next_sync_at).getTime() - desdeB) / 60_000;
    expect(minutosB).toBeGreaterThan(29.5);
    expect(minutosB).toBeLessThan(30.5);

    // ── LAS TRES COLUMNAS DE A ──────────────────────────────────────────────
    expect(caido.cuerpo.outcome).toBe('transporte');
    expect(caido.feed.consecutive_failures).toBe(1);
    expect(CODIGOS_DE_TRANSPORTE).toContain(caido.feed.last_error);

    const desdeA = new Date(caido.feed.last_attempt_at ?? 0).getTime();
    const minutosA = (new Date(caido.feed.next_sync_at).getTime() - desdeA) / 60_000;
    expect(minutosA).toBeGreaterThan(4.5);
    expect(minutosA).toBeLessThan(5.5);

    // A NO PUEDE PARECER SANO ANTE EL WATCHDOG. `last_success_at` solo se
    // escribe en la rama de éxito: si también se escribiera al fallar, un feed
    // muerto nunca envejecería y la alerta por obsolescencia no llegaría jamás.
    expect(caido.feed.last_success_at).toBeNull();

    // Aserción 8: `claimed_at` vuelve a nulo en LAS DOS ramas. Es lo que
    // devuelve el feed a la cola.
    expect(caido.feed.claimed_at).toBeNull();
    expect(sano.feed.claimed_at).toBeNull();

    // Y el aislamiento, dicho como trabajo y no como columnas: B produjo sus
    // quince aseos mientras A estaba caído.
    expect(sano.corrida?.cleanings_created).toBe(15);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// EL BACKOFF
// ════════════════════════════════════════════════════════════════════════════

describe('el backoff de un feed que sigue caído', () => {
  test('7: la serie es 5, 5, 8, 16, 32 y 60 minutos, con techo en 60', async () => {
    const a = await sembrarFeed({ puertoMuerto: true });

    const medidos: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const corrida = await correrSync(a.feedId, '');
      expect(corrida.cuerpo.outcome).toBe('transporte');
      expect(corrida.feed.consecutive_failures).toBe(i + 1);

      const desde = new Date(corrida.feed.last_attempt_at ?? 0).getTime();
      const minutos = (new Date(corrida.feed.next_sync_at).getTime() - desde) / 60_000;
      medidos.push(Math.round(minutos));
    }

    // El PISO de 5 honra la decisión bloqueada de 03-CONTEXT.md: los dos
    // primeros reintentos caen a los 5 minutos porque así lo pidió el usuario,
    // no porque la fórmula lo diga. El TECHO de 60 evita que un feed muerto se
    // consulte cada 30 segundos durante días.
    expect(medidos).toEqual([5, 5, 8, 16, 32, 60]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LA CADENCIA
// ════════════════════════════════════════════════════════════════════════════

describe('la cadencia efectiva de un feed sano', () => {
  test('6: entre 30 y 31 minutos, y es aritmética sobre next_sync_at, no reloj real', async () => {
    const b = await sembrarFeed();
    const corrida = await correrSync(b.feedId, FEED_REAL);

    // ══════════════════════════════════════════════════════════════════════
    // EL ORIGEN ES `finished_at`, NO `last_attempt_at`, Y LA DIFERENCIA ES LO
    // QUE HACE QUE ESTA ASERCIÓN NO SEA INTERMITENTE.
    //
    // El RPC escribe `next_sync_at = now() + interval '30 minutes'` y
    // `last_attempt_at = p_fetched_at`, que es una marca tomada por el WORKER
    // en JavaScript ANTES del fetch. Restar la segunda de la primera no mide 30
    // minutos: mide 30 minutos MÁS la latencia del fetch MÁS la deriva entre el
    // reloj del proceso y el de la base. Medido en este equipo: el contenedor
    // va ~150 ms por delante del host, y con ese signo `peorCaso` sale 31.003 y
    // la aserción de abajo se pone roja sin que nada del código haya cambiado.
    //
    // `feed_sync_runs.finished_at` es `now()` de LA MISMA TRANSACCIÓN, así que
    // la resta es exactamente el intervalo que el RPC programó, sin reloj de
    // por medio. Es además lo que la aserción decía medir: "aritmética sobre
    // next_sync_at, no reloj real".
    // ══════════════════════════════════════════════════════════════════════
    const desde = new Date(corrida.corrida?.finished_at ?? 0).getTime();
    const espera = (new Date(corrida.feed.next_sync_at).getTime() - desde) / 60_000;

    // EL TICK NO ES LA CADENCIA: es la resolución con la que se mira la cola.
    // La expresión agendada se lee de la base porque de ella depende el número.
    const [expresion] = sqlDePruebas(
      "select schedule from cron.job where jobname = 'dispatch-feed-syncs';",
    );
    expect(expresion).toBe('* * * * *');

    const tick = 1;
    const peorCaso = espera + tick;

    expect(espera).toBeGreaterThan(29.5);
    expect(peorCaso).toBeLessThanOrEqual(31);

    // CONTRASTE, y es la razón de que el tick sea de un minuto y no de cinco:
    // con el tick de cinco que proponía `research/ARCHITECTURE.md` el peor caso
    // sería 35, y el criterio 1 de la fase dice 30.
    expect(espera + 5).toBeGreaterThan(31);
  });
});
