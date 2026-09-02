import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import type { Database } from '@/lib/database.types';
import type { EventoNormalizado } from '@/lib/domain/ical-normalizar';

import {
  aplicarSync,
  codigoHttp,
  registrarCorridaSinTrabajo,
  registrarFalloDeSync,
  siguienteIntento,
} from './sync';

/**
 * `lib/data/sync.ts` es PLOMERIA: la llamada al RPC y la escritura de salud del
 * fallo. Toda decision de dominio se tomo en `lib/domain/` y toda decision
 * transaccional se toma dentro del RPC. Estos tests defienden esa frontera,
 * ademas de los tres numeros del backoff.
 */

// ── Un cliente falso que registra lo que se le pide, sin red ni base ─────────

type Llamada = { tabla: string; verbo: string; valores: unknown; filtros: Record<string, unknown> };

type Espia = {
  cliente: SupabaseClient<Database>;
  rpc: { nombre: string; args: Record<string, unknown> }[];
  llamadas: Llamada[];
};

function espiar(respuestaRpc: unknown = { outcome: 'ok' }): Espia {
  const rpc: Espia['rpc'] = [];
  const llamadas: Llamada[] = [];

  const cadena = (registro: Llamada) => {
    const obj = {
      eq(columna: string, valor: unknown) {
        registro.filtros[columna] = valor;
        return obj;
      },
      then(resolver: (r: { data: null; error: null }) => unknown) {
        return Promise.resolve({ data: null, error: null }).then(resolver);
      },
    };
    return obj;
  };

  const cliente = {
    rpc(nombre: string, args: Record<string, unknown>) {
      rpc.push({ nombre, args });
      return Promise.resolve({ data: respuestaRpc, error: null });
    },
    from(tabla: string) {
      return {
        update(valores: unknown) {
          const registro: Llamada = { tabla, verbo: 'update', valores, filtros: {} };
          llamadas.push(registro);
          return cadena(registro);
        },
        insert(valores: unknown) {
          const registro: Llamada = { tabla, verbo: 'insert', valores, filtros: {} };
          llamadas.push(registro);
          return cadena(registro);
        },
      };
    },
  } as unknown as SupabaseClient<Database>;

  return { cliente, rpc, llamadas };
}

const FEED = '00000000-0000-4000-8000-000000000001';

function valores(espia: Espia, tabla: string, verbo: string): Record<string, unknown> {
  const l = espia.llamadas.find((x) => x.tabla === tabla && x.verbo === verbo);
  expect(l, `no hubo ${verbo} sobre ${tabla}`).toBeDefined();
  return (l as Llamada).valores as Record<string, unknown>;
}

// ── 1 a 3. El backoff ───────────────────────────────────────────────────────

describe('siguienteIntento', () => {
  it('el primer fallo reintenta a los 5 minutos: es la decision bloqueada de 03-CONTEXT.md', () => {
    expect(siguienteIntento(0)).toBe(5);
  });

  it('el piso de 5 y el exponencial dan 5, 5, 8, 16, 32 y 60', () => {
    expect([1, 2, 3, 4, 5].map(siguienteIntento)).toEqual([5, 8, 16, 32, 60]);
  });

  it('el techo de 60 impide que un feed muerto se consulte cada 30 s durante dias', () => {
    expect(siguienteIntento(20)).toBe(60);
    // Un exponencial sin techo desborda a Infinity mucho antes de eso.
    expect(siguienteIntento(5_000)).toBe(60);
  });

  it('un conteo negativo o fraccionario no rompe el piso', () => {
    expect(siguienteIntento(-3)).toBe(5);
    expect(siguienteIntento(2.7)).toBe(8);
  });
});

// ── 4 y 5. El registro del fallo ────────────────────────────────────────────

describe('registrarFalloDeSync', () => {
  it('incrementa los fallos, aplica el backoff, escribe un CODIGO y devuelve el feed a la cola', async () => {
    const espia = espiar();
    const antes = Date.now();

    await registrarFalloDeSync(espia.cliente, {
      feedId: FEED,
      outcome: 'transporte',
      codigo: codigoHttp(503),
      httpStatus: 503,
      fallosPrevios: 2,
    });

    const v = valores(espia, 'calendar_feeds', 'update');

    expect(v.consecutive_failures).toBe(3);
    expect(v.last_error).toBe('http_503');
    expect(v.last_http_status).toBe(503);
    // `claimed_at` a nulo es lo que devuelve el feed a la cola.
    expect(v.claimed_at).toBeNull();
    expect(v.last_attempt_at).toEqual(expect.any(String));

    // 8 minutos: `siguienteIntento(2)`.
    const proximo = Date.parse(v.next_sync_at as string);
    expect(proximo - antes).toBeGreaterThanOrEqual(8 * 60_000 - 5_000);
    expect(proximo - antes).toBeLessThanOrEqual(8 * 60_000 + 5_000);

    // NO toca last_success_at: el fallo no es un exito.
    expect(v).not.toHaveProperty('last_success_at');
    // NO toca last_event_count: no se observo ninguna reserva.
    expect(v).not.toHaveProperty('last_event_count');

    // El update va contra ESE feed y solo ese.
    expect(espia.llamadas[0].filtros).toEqual({ id: FEED });
  });

  it('deja la corrida en la bitacora con su outcome de la lista cerrada', async () => {
    const espia = espiar();

    await registrarFalloDeSync(espia.cliente, {
      feedId: FEED,
      outcome: 'colapso',
      codigo: 'cero_reservas_clasificadas',
      httpStatus: 200,
      fallosPrevios: 0,
      conteos: { event_count: 15, reservation_count: 0, block_count: 0, unknown_count: 15 },
    });

    const v = valores(espia, 'feed_sync_runs', 'insert');
    expect(v.feed_id).toBe(FEED);
    expect(v.outcome).toBe('colapso');
    expect(v.http_status).toBe(200);
    // La telemetria del colapso: quince eventos, cero reservas. Es la senal
    // temprana del Pitfall 5, y sin ella el colapso es invisible en la bitacora.
    expect(v.event_count).toBe(15);
    expect(v.reservation_count).toBe(0);
    expect(v.unknown_count).toBe(15);
    expect(v.finished_at).toEqual(expect.any(String));
  });

  it('NO acepta la URL en su firma: si no entra, no puede acabar en last_error', () => {
    const fuente = codigoDe('sync.ts');
    const firma = bloqueDeFirma(fuente, 'registrarFalloDeSync');
    expect(firma).not.toMatch(/url/i);
  });

  it('el modulo entero no nombra la URL fuera de los comentarios', () => {
    // La URL es una credencial (T-02-73). Misma regla que `registrarSaludDelFeed`
    // en `lib/data/feeds.ts`: la unica garantia solida es que el modulo no tenga
    // forma de nombrarla.
    //
    // ESTA ASERCION NO ES REDUNDANTE CON LA DE ARRIBA, Y SE MIDIO. El senuelo
    // —anadir un campo con la direccion del feed a `ParametrosDeFallo`— deja la
    // asercion de la FIRMA en VERDE, porque los parametros son un tipo con
    // nombre y la firma solo dice `parametros: ParametrosDeFallo`. El criterio
    // "verificable con grep sobre la firma" es, el solo, un falso verde. La que
    // cae es esta: 1 rojo de 12, y el rojo es el correcto.
    expect(codigoDe('sync.ts')).not.toMatch(/url/i);
  });
});

// ── 6. La llamada al RPC ────────────────────────────────────────────────────

const EVENTOS: EventoNormalizado[] = [
  {
    uid: 'a@airbnb.com',
    reservationCode: 'HME3F6BX75',
    summary: 'Reserved',
    startsOn: '2026-09-01',
    endsOn: '2026-09-06',
    clasificacion: 'reserva',
    payloadHash: 'a'.repeat(64),
  },
  {
    uid: 'b@airbnb.com',
    reservationCode: null,
    summary: 'Airbnb (Not available)',
    startsOn: '2026-09-10',
    endsOn: '2026-09-11',
    clasificacion: 'bloqueo',
    payloadHash: 'b'.repeat(64),
  },
];

describe('aplicarSync', () => {
  it('pasa los eventos TAL CUAL al RPC, sin transformar, filtrar ni reordenar', async () => {
    const espia = espiar({ outcome: 'ok', event_count: 2, reservation_count: 1 });

    await aplicarSync(espia.cliente, {
      feedId: FEED,
      eventos: EVENTOS,
      fetchedAt: '2026-09-02T12:00:00.000Z',
      etag: 'W/"abc"',
      payloadHash: 'c'.repeat(64),
      httpStatus: 200,
    });

    expect(espia.rpc).toHaveLength(1);
    expect(espia.rpc[0].nombre).toBe('sync_feed_apply');

    const args = espia.rpc[0].args;
    // Identidad estructural, no un conteo: el bloqueo tiene que llegar tambien.
    // Filtrarlo romperia block_count y con el la telemetria de la guarda.
    expect(args.p_events).toEqual(EVENTOS);
    expect(args.p_feed_id).toBe(FEED);
    expect(args.p_fetched_at).toBe('2026-09-02T12:00:00.000Z');
    expect(args.p_etag).toBe('W/"abc"');
    expect(args.p_payload_hash).toBe('c'.repeat(64));
    expect(args.p_http_status).toBe(200);
  });

  it('devuelve los contadores del RPC y ninguna escritura propia', async () => {
    const respuesta = {
      outcome: 'ok',
      event_count: 15,
      reservation_count: 15,
      cleanings_created: 15,
      cleanings_cancelled: 0,
    };
    const espia = espiar(respuesta);

    const r = await aplicarSync(espia.cliente, {
      feedId: FEED,
      eventos: EVENTOS,
      fetchedAt: '2026-09-02T12:00:00.000Z',
      etag: null,
      payloadHash: 'c'.repeat(64),
      httpStatus: 200,
    });

    expect(r.error).toBeNull();
    expect(r.resultado).toMatchObject(respuesta);
    // Toda la escritura de salud del EXITO vive dentro de la transaccion del
    // RPC. Si este modulo escribiera algo aparte, un worker que muriera en medio
    // dejaria el feed diffeado con `last_success_at` viejo.
    expect(espia.llamadas).toHaveLength(0);
  });
});

// ── 7. La corrida sin trabajo: 304 y cuerpo identico ────────────────────────

describe('registrarCorridaSinTrabajo', () => {
  it('un 304 es EXITO: refresca last_success_at y no toca last_event_count', async () => {
    const espia = espiar();
    const antes = Date.now();

    await registrarCorridaSinTrabajo(espia.cliente, {
      feedId: FEED,
      outcome: 'no_modificado',
      httpStatus: 304,
    });

    const v = valores(espia, 'calendar_feeds', 'update');
    expect(v.consecutive_failures).toBe(0);
    expect(v.last_error).toBeNull();
    expect(v.claimed_at).toBeNull();
    expect(v.last_success_at).toEqual(expect.any(String));
    // No se observo ninguna reserva, asi que no se puede concluir la ausencia
    // de nada: el conteo de la corrida anterior se queda como estaba.
    expect(v).not.toHaveProperty('last_event_count');

    // Cadencia de exito: 30 minutos, la misma que escribe el RPC.
    const proximo = Date.parse(v.next_sync_at as string);
    expect(proximo - antes).toBeGreaterThanOrEqual(30 * 60_000 - 5_000);

    const run = valores(espia, 'feed_sync_runs', 'insert');
    expect(run.outcome).toBe('no_modificado');
    expect(run.http_status).toBe(304);
  });

  it('con el cuerpo identico registra sin_cambios y actualiza el etag nuevo', async () => {
    const espia = espiar();

    await registrarCorridaSinTrabajo(espia.cliente, {
      feedId: FEED,
      outcome: 'sin_cambios',
      httpStatus: 200,
      etag: 'W/"nuevo"',
    });

    expect(valores(espia, 'calendar_feeds', 'update').last_etag).toBe('W/"nuevo"');
    expect(valores(espia, 'feed_sync_runs', 'insert').outcome).toBe('sin_cambios');
  });
});

// ── Utilidades de las aserciones estructurales ──────────────────────────────

/** El codigo del modulo SIN sus comentarios. Un comentario no es un uso. */
function codigoDe(archivo: string): string {
  const ruta = fileURLToPath(new URL(archivo, import.meta.url));
  return readFileSync(ruta, 'utf8')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l))
    .join('\n');
}

/** De `export async function <nombre>(` hasta el `)` que cierra la firma. */
function bloqueDeFirma(fuente: string, nombre: string): string {
  const i = fuente.indexOf(`function ${nombre}(`);
  expect(i, `no se encontro ${nombre}`).toBeGreaterThan(-1);
  const j = fuente.indexOf('\n)', i);
  return fuente.slice(i, j > -1 ? j : i + 2000);
}
