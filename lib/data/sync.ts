import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';
import type { ConteosDeLectura, MotivoDeLecturaInutil } from '@/lib/domain/ical-guardas';
import type { EventoNormalizado } from '@/lib/domain/ical-normalizar';

/**
 * La plomeria del worker de sincronizacion: la llamada al RPC y la escritura de
 * salud de lo que NO llego a diffearse.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESTE MODULO ES PLOMERIA Y TIENE QUE SEGUIR SIENDOLO.
 *
 * `aplicarSync` no transforma, no filtra y no reordena: toda decision de dominio
 * ya se tomo en `lib/domain/` (parseo, clasificacion, normalizacion) y toda
 * decision transaccional se toma dentro de `public.sync_feed_apply()`. Lo unico
 * que vive aqui es el backoff, que es aritmetica pura y por eso se puede probar.
 *
 * En particular: los eventos `bloqueo` y `desconocido` VIAJAN al RPC igual que
 * las reservas. El RPC los necesita para escribir `block_count` y
 * `unknown_count`, y esos dos contadores son la telemetria que hace visible el
 * colapso de formato. Filtrarlos aqui apagaria la senal temprana del Pitfall 5.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── POR QUE EL REGISTRO DE FALLO VIVE FUERA DEL RPC Y EL DE EXITO DENTRO ────
 *
 * La escritura de salud del EXITO va dentro de la transaccion del RPC. Si
 * estuviera fuera, un worker que muriera entre el commit del diff y la escritura
 * de salud dejaria el feed diffeado pero con su marca de exito vieja, y el
 * watchdog alertaria de un feed perfectamente sano. Es la fila "despues del
 * commit, antes de responder" de la tabla de fallo parcial del research, y es lo
 * que permite que esa fila diga "nada que hacer".
 *
 * El registro de FALLO no puede vivir dentro por definicion: la transaccion que
 * fallo se revirtio, asi que cualquier escritura suya se fue con ella. Por eso
 * es una segunda llamada, corta, y desde aqui.
 *
 * Y si ESA segunda llamada tambien falla, no hay logica compensatoria y no hace
 * falta: el feed se queda con su marca de reclamado, el lease de diez minutos lo
 * devuelve a la cola solo, y la corrida siguiente lo vuelve a intentar. El
 * sistema converge sin codigo de compensacion, y eso es exactamente lo que
 * justifica no escribirlo.
 *
 * ── LA CREDENCIAL NO ENTRA POR NINGUNA FIRMA DE ESTE ARCHIVO ────────────────
 *
 * Un GET a la direccion de exportacion del calendario revela la ocupacion
 * completa del apartamento sin autenticarse (T-02-73). Ninguna funcion de aqui
 * la recibe, exactamente igual que `registrarSaludDelFeed` en `lib/data/feeds.ts`:
 * si no entra por la firma, no puede acabar en `last_error` ni por un descuido ni
 * por una interpolacion copiada. `sync.test.ts` lo afirma leyendo el fuente.
 */

// ───────────────────────────────────────────────────────────────────────────
// Los codigos de fallo
// ───────────────────────────────────────────────────────────────────────────

/**
 * `calendar_feeds.last_error` guarda un CODIGO, nunca un mensaje libre ni un
 * trozo del cuerpo. Dos razones y las dos mandan:
 *
 *   1. El cuerpo del feed trae los ultimos cuatro digitos del telefono del
 *      huesped, y `last_error` es una columna que el admin ve en pantalla.
 *   2. Un mensaje de error de red o de Postgres puede arrastrar la direccion
 *      completa del feed, que es una credencial.
 *
 * Union cerrada, como `MotivoDeFallo` en `lib/data/feeds.ts`: cualquier otra
 * cadena es un error de compilacion. La rama de HTTP se construye con
 * `codigoHttp()` y su tipo solo admite un numero detras del prefijo, asi que
 * tampoco por ahi entra texto arbitrario.
 */
export type CodigoHttp = `http_${number}`;

/**
 * Los codigos de TRANSPORTE: nacen del `fetch`, no del cuerpo. Los del cuerpo
 * —HTML con 200, no es calendario, truncado, colapso— los define
 * `lib/domain/ical-guardas.ts` y se importan de ahi, para que la lista viva en
 * un solo sitio. La direccion de la dependencia es `data -> domain`.
 */
export type CodigoDeTransporte =
  /** Presupuesto de bytes agotado durante la descarga. */
  | 'cuerpo_excede_5mib'
  /** El proveedor respondio 3xx y no se sigue: es la segunda mitad anti-SSRF. */
  | 'redirect_bloqueado'
  /** El fetch no respondio dentro del limite. */
  | 'timeout'
  /** No se pudo establecer la conexion. Sin status que registrar. */
  | 'red'
  /** La direccion guardada dejo de pasar la allowlist. No se sale a la red. */
  | 'destino_no_permitido'
  /** El RPC lanzo. Nada quedo escrito, ni siquiera la salud. */
  | 'rpc_fallido';

export type CodigoDeFalloEnumerado = CodigoDeTransporte | MotivoDeLecturaInutil;

export type CodigoDeFallo = CodigoDeFalloEnumerado | CodigoHttp;

/**
 * El codigo de un status HTTP no 2xx. El numero lo produjo el propio `fetch`,
 * nunca el cuerpo del feed, asi que no hay ruta desde el dato personal hasta
 * esta cadena.
 */
export function codigoHttp(status: number): CodigoHttp {
  return `http_${status}`;
}

/**
 * Los seis valores de `feed_sync_runs.outcome`, impuestos por `fsr_outcome_ok`
 * en la migracion 11. `'ok'` lo escribe el RPC dentro de su transaccion; los
 * otros cinco los escribe este modulo, fuera de ella.
 */
export type OutcomeDeCorrida =
  | 'ok'
  | 'no_modificado'
  | 'sin_cambios'
  | 'transporte'
  | 'colapso'
  | 'error';

/** Los outcomes que el worker registra como fallo. */
export type OutcomeDeFallo = Extract<OutcomeDeCorrida, 'transporte' | 'colapso' | 'error'>;

/** Los outcomes de exito que no llegan a diffear nada. */
export type OutcomeSinTrabajo = Extract<OutcomeDeCorrida, 'no_modificado' | 'sin_cambios'>;

// ───────────────────────────────────────────────────────────────────────────
// El backoff
// ───────────────────────────────────────────────────────────────────────────

/** Cadencia normal de exito. Es la misma que escribe el RPC. */
const MINUTOS_EXITO = 30;

/** El piso: decision bloqueada de `03-CONTEXT.md`, "si falla, reintenta en 5 minutos". */
const PISO_MINUTOS = 5;

/** El techo: sin el, un feed muerto se consulta cada 30 s durante dias. */
const TECHO_MINUTOS = 60;

/**
 * Minutos hasta el proximo intento, dado cuantos fallos consecutivos llevaba el
 * feed ANTES de este.
 *
 * `greatest(5, least(2 ^ (fallos + 1), 60))`. Los dos limites tienen dueno:
 *
 *   · el PISO de 5 honra la decision bloqueada de `03-CONTEXT.md`. No es un
 *     exponencial puro: los dos primeros reintentos caen a los 5 minutos porque
 *     asi lo pidio el usuario, no porque la formula lo diga;
 *   · el TECHO de 60 evita el martilleo. Ademas hace la funcion total: sin el,
 *     `2 ** 5000` es `Infinity` y la fecha resultante seria invalida.
 *
 * La serie es 5, 5, 8, 16, 32, 60, 60, 60…
 *
 * `claimed_at` vuelve a nulo en las DOS ramas, exito y fallo: es lo que devuelve
 * el feed a la cola. Si el worker muere antes de escribirlo, el lease de diez
 * minutos lo hace igual.
 */
export function siguienteIntento(fallosConsecutivos: number): number {
  const previos = Math.max(0, Math.trunc(fallosConsecutivos));
  const exponencial = 2 ** (previos + 1);
  return Math.max(PISO_MINUTOS, Math.min(exponencial, TECHO_MINUTOS));
}

function enMinutos(minutos: number): string {
  return new Date(Date.now() + minutos * 60_000).toISOString();
}

// ───────────────────────────────────────────────────────────────────────────
// El RPC
// ───────────────────────────────────────────────────────────────────────────

/** Lo que devuelve `public.sync_feed_apply()`. Contadores, nada mas. */
export type ResultadoDeSync = {
  run_id: number;
  feed_id: string;
  property_id: string;
  outcome: 'ok';
  event_count: number;
  reservation_count: number;
  block_count: number;
  unknown_count: number;
  min_ends_on: string | null;
  max_ends_on: string | null;
  reconcile: boolean;
  reservations_inserted: number;
  reservations_updated: number;
  reservations_disappeared: number;
  cleanings_created: number;
  cleanings_relinked: number;
  cleanings_cancelled: number;
  reviews_flagged: number;
  uid_rotations: number;
};

export type ErrorDeBase = { code?: string; message?: string };

export type ParametrosDeSync = {
  feedId: string;
  /** Tal cual salen de `normalizarIcs()`. Reservas, bloqueos y desconocidos. */
  eventos: EventoNormalizado[];
  fetchedAt: string;
  etag: string | null;
  payloadHash: string;
  httpStatus: number;
};

/**
 * La UNICA llamada al RPC, con los eventos ya normalizados.
 *
 * Todo lo que el RPC hace —observar reservas, marcar ausentes, crear aseos,
 * cancelar con sus cuatro candados, recalcular urgencia, notificar y escribir la
 * salud— ocurre en UNA transaccion. Si lanza, nada quedo escrito.
 */
export async function aplicarSync(
  cliente: SupabaseClient<Database>,
  parametros: ParametrosDeSync,
): Promise<{ resultado: ResultadoDeSync | null; error: ErrorDeBase | null }> {
  // EL CAST ES SOBRE UN HUECO DEL GENERADOR DE TIPOS, NO SOBRE LA FIRMA REAL.
  // `supabase gen types` emite `p_etag: string` porque no expresa la nulabilidad
  // de los parametros de una funcion: en Postgres `text` admite `null`, y la
  // PRIMERA corrida de un feed no tiene etag que mandar. Mandar `''` en vez de
  // `null` guardaria un etag vacio y la corrida siguiente pediria
  // `If-None-Match: ""`, que es una cabecera valida y equivocada.
  const argumentos = {
    p_feed_id: parametros.feedId,
    // Sin `map`, sin `filter`, sin `sort`. Ver la cabecera del modulo.
    p_events: parametros.eventos,
    p_fetched_at: parametros.fetchedAt,
    p_etag: parametros.etag,
    p_payload_hash: parametros.payloadHash,
    p_http_status: parametros.httpStatus,
  } as unknown as Database['public']['Functions']['sync_feed_apply']['Args'];

  const { data, error } = await cliente.rpc('sync_feed_apply', argumentos);

  if (error) return { resultado: null, error };
  return { resultado: data as unknown as ResultadoDeSync, error: null };
}

// ───────────────────────────────────────────────────────────────────────────
// La salud de lo que no se diffeo
// ───────────────────────────────────────────────────────────────────────────

/**
 * Los contadores de la corrida, cuando hubo cuerpo que contar. Es el mismo tipo
 * que produce `contarPorClasificacion()` en el dominio: se reexporta con el
 * nombre de esta capa en vez de redeclararlo, porque dos copias de la misma
 * forma se desincronizan y la que se olvidaria de actualizar es esta.
 */
export type ConteosDeCorrida = ConteosDeLectura;

export type ParametrosDeFallo = {
  feedId: string;
  outcome: OutcomeDeFallo;
  codigo: CodigoDeFallo;
  /** `null` cuando no hubo respuesta: timeout o error de conexion. */
  httpStatus: number | null;
  /** Cuantos fallos consecutivos llevaba ANTES de este. */
  fallosPrevios: number;
  /**
   * Solo el colapso los tiene: hubo cuerpo y se clasifico, pero no se llamo al
   * RPC. Es la unica forma de que la bitacora muestre "quince eventos, cero
   * reservas", que es la senal que delata un cambio de formato del proveedor.
   */
  conteos?: ConteosDeCorrida;
};

/**
 * Registra un intento fallido: incrementa los fallos, aplica el backoff, escribe
 * el CODIGO y devuelve el feed a la cola.
 *
 * NO recibe la direccion del feed, y esa ausencia es la garantia. NO escribe
 * `last_success_at` ni `last_event_count`: no hubo exito y no se observo ninguna
 * reserva, asi que el conteo de la corrida anterior tiene que quedarse como
 * estaba. Pisarlo con cero convertiria cada fallo de transporte en un colapso
 * aparente para la corrida siguiente.
 */
export async function registrarFalloDeSync(
  cliente: SupabaseClient<Database>,
  parametros: ParametrosDeFallo,
): Promise<void> {
  const ahora = new Date().toISOString();

  await cliente
    .from('calendar_feeds')
    .update({
      last_attempt_at: ahora,
      last_http_status: parametros.httpStatus,
      last_error: parametros.codigo,
      consecutive_failures: parametros.fallosPrevios + 1,
      next_sync_at: enMinutos(siguienteIntento(parametros.fallosPrevios)),
      claimed_at: null,
    })
    .eq('id', parametros.feedId);

  await cliente.from('feed_sync_runs').insert({
    feed_id: parametros.feedId,
    outcome: parametros.outcome,
    http_status: parametros.httpStatus,
    event_count: parametros.conteos?.event_count ?? null,
    reservation_count: parametros.conteos?.reservation_count ?? null,
    block_count: parametros.conteos?.block_count ?? null,
    unknown_count: parametros.conteos?.unknown_count ?? null,
    finished_at: ahora,
  });
}

export type ParametrosSinTrabajo = {
  feedId: string;
  outcome: OutcomeSinTrabajo;
  httpStatus: number;
  /** Solo con `sin_cambios`: el proveedor puede reemitir el mismo cuerpo con otro etag. */
  etag?: string | null;
};

/**
 * La corrida que tuvo exito y no tuvo nada que hacer: un 304, o un cuerpo con el
 * mismo hash que el de la corrida anterior.
 *
 * ES EXITO Y HAY QUE ESCRIBIRLO COMO TAL. Airbnb reemite el mismo cuerpo cada
 * tres horas; si estas corridas no refrescaran la marca de exito, el watchdog de
 * obsolescencia alertaria de un feed que esta perfectamente vivo.
 *
 * Y NO SE LLAMA AL RPC. No se observo ninguna reserva, asi que no se puede
 * concluir la ausencia de nada: hacer avanzar el contador de ausencias con un
 * 304 cancelaria aseos justo cuando el proveedor esta mas estable (Pitfall 8).
 * Por eso tampoco se toca `last_event_count`.
 */
export async function registrarCorridaSinTrabajo(
  cliente: SupabaseClient<Database>,
  parametros: ParametrosSinTrabajo,
): Promise<void> {
  const ahora = new Date().toISOString();

  await cliente
    .from('calendar_feeds')
    .update({
      last_attempt_at: ahora,
      last_success_at: ahora,
      last_http_status: parametros.httpStatus,
      last_error: null,
      consecutive_failures: 0,
      next_sync_at: enMinutos(MINUTOS_EXITO),
      claimed_at: null,
      ...(parametros.etag === undefined ? {} : { last_etag: parametros.etag }),
    })
    .eq('id', parametros.feedId);

  await cliente.from('feed_sync_runs').insert({
    feed_id: parametros.feedId,
    outcome: parametros.outcome,
    http_status: parametros.httpStatus,
    finished_at: ahora,
  });
}
