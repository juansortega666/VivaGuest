import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterAll, describe, expect, test } from 'vitest';

import type { Database } from '@/lib/database.types';
import { clienteAdminDePruebas } from '@/lib/test/clientes';
import {
  aseosDe,
  aseosVivosDe,
  correrSync,
  limpiarSync,
  sembrarFeed,
  sqlDePruebas,
} from '@/lib/test/sync';

/**
 * CRITERIO 2 DEL ROADMAP, DE PUNTA A PUNTA: el feed real entra por HTTP y sale
 * trabajo.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ES LA PRIMERA VEZ QUE EL LAZO COMPLETO SE MIDE JUNTO.
 *
 * Las aserciones de los planes 03-02 a 03-06 son por pieza: el parser contra
 * cadenas, el RPC contra `p_events` construidos a mano, las guardas contra
 * cuerpos literales. Ninguna de las tres ve la COSTURA, que es donde de verdad
 * se pierde un aseo:
 *
 *   servidor HTTP  →  fetch del worker  →  guardas del cuerpo  →  normalizador
 *   →  sync_feed_apply()  →  cleanings.scheduled_date
 *
 * Aquí no hay ni un solo doble. El cuerpo lo sirve un servidor de verdad, el
 * `fetch` lo hace el route handler de verdad, y la fecha del aseo sale de la
 * base de verdad.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Requiere `npx supabase start` y `.env.local` con `CRON_SHARED_SECRET`.
 */

const FIXTURES = resolve(process.cwd(), 'lib/domain/__fixtures__/ical');

function fixture(nombre: string): string {
  return readFileSync(resolve(FIXTURES, nombre), 'utf8');
}

const FEED_REAL = fixture('airbnb-real-anonimizado.ics');

/**
 * LAS QUINCE FECHAS, UNA A UNA Y ESCRITAS A MANO.
 *
 * No se derivan del archivo con un `grep` a propósito: derivarlas de la misma
 * fuente que se está probando es circular, y un parser que restara un día
 * seguiría casando consigo mismo. Son las quince del README de fixtures, que a
 * su vez salieron de la captura real del 2026-09-02.
 *
 * La primera, `2026-09-02`, es el día de la captura: el feed INCLUYE la reserva
 * que termina hoy. La última, `2027-01-04`, cruza el año.
 */
const QUINCE_FECHAS = [
  '2026-09-02',
  '2026-09-06',
  '2026-09-13',
  '2026-09-20',
  '2026-09-27',
  '2026-10-06',
  '2026-10-10',
  '2026-10-12',
  '2026-10-18',
  '2026-11-02',
  '2026-11-09',
  '2026-11-16',
  '2026-11-22',
  '2026-12-27',
  '2027-01-04',
] as const;

/** El turnover: sale una reserva y entra otra el mismo día. Es el caso urgente. */
const DIA_DEL_TURNOVER = '2026-10-10';

/**
 * Cambia el `DTSTAMP` de todo el feed sin tocar nada más.
 *
 * Existe por una razón concreta y medida en el propio worker: si el cuerpo
 * llega con el mismo sha256 que la corrida anterior, el worker corta con
 * `sin_cambios` y NO llama al RPC. Para probar que el RPC es idempotente hay
 * que llegar hasta él, y para eso el cuerpo tiene que ser distinto en algo que
 * el pipeline ignore. `DTSTAMP` no entra en el `payloadHash` del evento
 * —`hashDe([uid, startsOn, endsOn, summary, reservationCode])`— ni lo lee el
 * normalizador, así que es exactamente ese "algo".
 */
function conDtstamp(cuerpo: string, valor: string): string {
  return cuerpo.replace(/DTSTAMP:[0-9TZ]+/g, `DTSTAMP:${valor}`);
}

/** El día de negocio según la base, que es quien decide la ventana protegida. */
function hoyBogota(): string {
  return sqlDePruebas('select public.today_bog();')[0];
}

const MARIA = '00000000-0000-4000-8000-000000000002';
const ADMIN = '00000000-0000-4000-8000-000000000001';

afterAll(async () => {
  await limpiarSync();
});

// ════════════════════════════════════════════════════════════════════════════
// LAS QUINCE FECHAS
// ════════════════════════════════════════════════════════════════════════════

describe('el feed real produce quince aseos en las quince fechas exactas', () => {
  test('1 y 2: quince aseos, y cada fecha es el DTEND sin restar', async () => {
    const { propertyId, feedId } = await sembrarFeed();

    const corrida = await correrSync(feedId, FEED_REAL);

    expect(corrida.status).toBe(200);
    expect(corrida.cuerpo.outcome).toBe('ok');
    // CONTROL: el fetch de verdad ocurrió. Sin esto, un worker que no saliera a
    // la red y devolviera `ok` por otro camino pasaría las aserciones de abajo.
    expect(corrida.hits).toBe(1);

    const aseos = await aseosDe(propertyId);

    // LA ASERCIÓN ES FECHA A FECHA, NO POR CONTEO. Quince aseos desplazados un
    // día también son quince: el conteo solo no distingue lo correcto de lo que
    // manda a la aseadora con el huésped todavía dentro.
    expect(aseos.map((a) => a.scheduled_date)).toEqual([...QUINCE_FECHAS]);

    // La segunda mitad de la aserción 2, explícita: la reserva del 2026-08-30
    // al 2026-09-02 produce el aseo del 2026-09-02, que es el día de la captura.
    expect(aseos[0].scheduled_date).toBe('2026-09-02');
    expect(aseos.every((a) => a.origin === 'ical')).toBe(true);
  });

  test('3: correr el mismo feed tres veces deja quince aseos, no cuarenta y cinco', async () => {
    const { propertyId, feedId } = await sembrarFeed();

    const uno = await correrSync(feedId, FEED_REAL);
    expect(uno.cuerpo.outcome).toBe('ok');
    expect((await aseosDe(propertyId)).length).toBe(15);

    // El cuerpo cambia en lo que el pipeline ignora, así que el RPC se ejecuta
    // de verdad las tres veces. La idempotencia que se mide es la del diff, no
    // la del atajo por hash.
    const dos = await correrSync(feedId, conDtstamp(FEED_REAL, '20260903T010000Z'));
    expect(dos.cuerpo.outcome).toBe('ok');
    expect(dos.corrida?.cleanings_created).toBe(0);

    const tres = await correrSync(feedId, conDtstamp(FEED_REAL, '20260903T020000Z'));
    expect(tres.cuerpo.outcome).toBe('ok');
    expect(tres.corrida?.cleanings_created).toBe(0);

    const aseos = await aseosDe(propertyId);
    expect(aseos.length).toBe(15);
    expect(aseos.map((a) => a.scheduled_date)).toEqual([...QUINCE_FECHAS]);
    expect(aseos.filter((a) => a.state === 'cancelada').length).toBe(0);

    // Y el atajo por hash, medido aparte: el MISMO cuerpo no llega al RPC.
    const cuatro = await correrSync(feedId, conDtstamp(FEED_REAL, '20260903T020000Z'));
    expect(cuatro.cuerpo.outcome).toBe('sin_cambios');
    expect((await aseosDe(propertyId)).length).toBe(15);
  });

  test('4: bajo TZ=America/Bogota salen las mismas quince fechas', async () => {
    // `vitest.integration.config.ts` fija `TZ: 'UTC'`, que es la zona de CI, de
    // Vercel y de la sesión de la base. Bajo esa zona un `new Date('20260902')`
    // mal usado produce el día correcto y el error es SILENCIOSO en toda la
    // suite; solo aparece cuando una persona mira la agenda en Bogotá. Este
    // test es el que fuerza la otra zona.
    const original = process.env.TZ;
    process.env.TZ = 'America/Bogota';

    try {
      const { propertyId, feedId } = await sembrarFeed();
      const corrida = await correrSync(feedId, FEED_REAL);
      expect(corrida.cuerpo.outcome).toBe('ok');

      const aseos = await aseosDe(propertyId);
      expect(aseos.map((a) => a.scheduled_date)).toEqual([...QUINCE_FECHAS]);
    } finally {
      process.env.TZ = original;
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LA UNIDAD DE GESTIÓN EXTERNA (SYNC-11)
// ════════════════════════════════════════════════════════════════════════════

describe('un apartamento de gestión externa produce filas inertes', () => {
  test('5: quince filas sin estado, sin aseador, sin tarifa y sin urgencia', async () => {
    const { propertyId, feedId } = await sembrarFeed({ gestionada: false });

    const corrida = await correrSync(feedId, FEED_REAL);
    expect(corrida.cuerpo.outcome).toBe('ok');

    const aseos = await aseosDe(propertyId);
    expect(aseos.length).toBe(15);

    // Lo hace el trigger solo: `tg_cleanings_snapshot()` copia
    // `gestion_vivaguest` a `is_managed` y `cl_unmanaged_is_inert` fuerza el
    // resto. El pipeline de sync no sabe nada de esto y no tiene que saberlo.
    for (const aseo of aseos) {
      expect(aseo.is_managed).toBe(false);
      expect(aseo.state).toBeNull();
      expect(aseo.aseador_id).toBeNull();
      expect(aseo.tarifa_huesped).toBeNull();
      expect(aseo.pago_aseador).toBeNull();
      expect(aseo.is_urgent).toBe(false);
    }

    // CONTROL: la fila gestionada del mismo feed SÍ trae estado y tarifa. Sin
    // esto, un pipeline que dejara todo en nulo pasaría el bloque de arriba.
    const gestionada = await sembrarFeed({ gestionada: true });
    await correrSync(gestionada.feedId, FEED_REAL);
    const suyos = await aseosDe(gestionada.propertyId);
    expect(suyos.every((a) => a.is_managed)).toBe(true);
    expect(suyos.every((a) => a.state === 'pendiente')).toBe(true);
    expect(suyos.every((a) => a.tarifa_huesped === 120000)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// EL TURNOVER Y EL ASEO MANUAL
// ════════════════════════════════════════════════════════════════════════════

describe('urgencia y trabajo humano', () => {
  test('6: el turnover del 2026-10-10 es el único aseo urgente', async () => {
    const { propertyId, feedId } = await sembrarFeed();
    await correrSync(feedId, FEED_REAL);

    const aseos = await aseosDe(propertyId);
    const hoy = hoyBogota();

    // La urgencia se recalcula solo sobre `scheduled_date >= today_bog()`: un
    // aseo del pasado no se re-marca. La expectativa se construye con esa misma
    // regla en vez de con la fecha literal, para que el test siga diciendo la
    // verdad cuando el 2026-10-10 quede atrás en el calendario.
    for (const aseo of aseos) {
      const esperado = aseo.scheduled_date === DIA_DEL_TURNOVER && aseo.scheduled_date >= hoy;
      expect({ dia: aseo.scheduled_date, urgente: aseo.is_urgent }).toEqual({
        dia: aseo.scheduled_date,
        urgente: esperado,
      });
    }

    // CONTROL: la aserción de arriba no pasa por vacuidad. Hay exactamente un
    // día en el feed en el que un checkout y un check-in coinciden.
    expect(aseos.filter((a) => a.is_urgent).length).toBe(DIA_DEL_TURNOVER >= hoy ? 1 : 0);
  });

  test('7: un aseo manual preexistente en una fecha de checkout no se duplica ni se pisa', async () => {
    const { propertyId, feedId } = await sembrarFeed();
    const admin = clienteAdminDePruebas();

    const DIA = '2026-09-13';
    const CONFIRMADO = '2026-09-01T15:00:00.000Z';

    const { data: manual, error } = await admin
      .from('cleanings')
      .insert({
        property_id: propertyId,
        origin: 'manual',
        tipo: 'repaso',
        scheduled_date: DIA,
        num_huespedes: 3,
        instrucciones: 'Instrucciones del admin, no las toca el sync.',
        aseador_id: MARIA,
        confirmado_at: CONFIRMADO,
        confirmado_by: ADMIN,
      } as Database['public']['Tables']['cleanings']['Insert'])
      .select('id')
      .single();

    expect(error).toBeNull();
    expect(manual).not.toBeNull();

    await correrSync(feedId, FEED_REAL);

    const aseos = await aseosDe(propertyId);
    const deEseDia = aseos.filter((a) => a.scheduled_date === DIA);

    // `on conflict do nothing` sobre `cleanings_one_active_per_property_date`:
    // el choque con un aseo manual es LEGÍTIMO, no un error.
    expect(deEseDia.length).toBe(1);
    expect(deEseDia[0].id).toBe(manual?.id);
    expect(deEseDia[0].origin).toBe('manual');
    expect(deEseDia[0].tipo).toBe('repaso');
    expect(deEseDia[0].aseador_id).toBe(MARIA);
    expect(deEseDia[0].confirmado_at).not.toBeNull();
    expect(deEseDia[0].num_huespedes).toBe(3);
    // El sync tampoco lo re-apunta a la reserva: el paso (d) filtra por
    // `origin = 'ical'`.
    expect(deEseDia[0].reservation_id).toBeNull();

    // Y las otras catorce sí se crearon.
    expect(aseos.length).toBe(15);
    expect(aseos.map((a) => a.scheduled_date)).toEqual([...QUINCE_FECHAS]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LA BITÁCORA Y LA SALUD DEL FEED
// ════════════════════════════════════════════════════════════════════════════

describe('feed_sync_runs y calendar_feeds después de una corrida buena', () => {
  test('8 y 9: contadores, piso y techo del feed, cadencia de treinta minutos y lease suelto', async () => {
    const { feedId } = await sembrarFeed();
    const corrida = await correrSync(feedId, FEED_REAL);

    const fila = corrida.corrida;
    expect(fila).not.toBeNull();
    expect(fila?.outcome).toBe('ok');
    expect(fila?.http_status).toBe(200);
    expect(fila?.event_count).toBe(15);
    expect(fila?.reservation_count).toBe(15);
    // El feed real tiene CERO bloqueos del propietario y CERO desconocidos: los
    // quince eventos son `Reserved`. Si alguno de estos dos se moviera, el
    // clasificador cambió de opinión sobre el feed real.
    expect(fila?.block_count).toBe(0);
    expect(fila?.unknown_count).toBe(0);
    expect(fila?.cleanings_created).toBe(15);
    expect(fila?.cleanings_cancelled).toBe(0);

    // `min_ends_on` es el candado 4 del reconcile destructivo y la serie
    // temporal que contesta si la reserva que termina hoy desaparece hoy o
    // mañana. `max_ends_on` es hasta dónde llega la ventana del proveedor.
    expect(fila?.min_ends_on).toBe(QUINCE_FECHAS[0]);
    expect(fila?.max_ends_on).toBe(QUINCE_FECHAS[QUINCE_FECHAS.length - 1]);

    const feed = corrida.feed;

    // ES EL NÚMERO DE RESERVAS, NO DE EVENTOS. Costura del plan 02-14 y operando
    // de la guarda de colapso del plan 03-06. Aquí coinciden porque el feed real
    // no trae bloqueos; el archivo de transporte los separa.
    expect(feed.last_event_count).toBe(15);
    expect(feed.last_error).toBeNull();
    expect(feed.consecutive_failures).toBe(0);
    expect(feed.last_success_at).not.toBeNull();
    expect(feed.last_min_ends_on).toBe(QUINCE_FECHAS[0]);

    // `claimed_at` vuelve a nulo: es lo que devuelve el feed a la cola.
    expect(feed.claimed_at).toBeNull();

    // TREINTA MINUTOS EXACTOS desde el instante de la corrida. Se mide contra
    // `last_attempt_at`, que el RPC escribe con el mismo `p_fetched_at` de la
    // misma transacción, y no contra el reloj de este proceso.
    const desde = new Date(feed.last_attempt_at ?? 0).getTime();
    const hasta = new Date(feed.next_sync_at).getTime();
    const minutos = (hasta - desde) / 60_000;
    expect(minutos).toBeGreaterThan(29.5);
    expect(minutos).toBeLessThan(30.5);
  });

  test('CONTROL: los aseos vivos son los quince y ninguno nació cancelado', async () => {
    const { propertyId, feedId } = await sembrarFeed();
    await correrSync(feedId, FEED_REAL);

    const vivos = await aseosVivosDe(propertyId);
    expect(vivos.length).toBe(15);
  });
});
