import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';
import type { MotivoDePush } from '@/lib/push/errores';

/**
 * LA CAPA DE DATOS DEL OUTBOX DE PUSH: reclamo, estados y la UNICA puerta de
 * revocacion del sistema.
 *
 * Es el analogo de rol de `lib/data/sync.ts` para la otra cola del proyecto, y
 * se escribe con las mismas tres reglas, que ahi ya estan medidas:
 *
 *   1. El cliente entra POR PARAMETRO y no se construye aqui. Asi la misma
 *      funcion sirve al route handler y a un test de integracion con el cliente
 *      que se quiera, y este modulo no importa la fabrica administrativa.
 *   2. Lo que se escribe en una columna que un humano llega a ver es un CODIGO
 *      de una union cerrada, nunca un mensaje libre.
 *   3. Ninguna funcion recibe ni devuelve una credencial que no necesite.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * EL `endpoint` DE UNA SUSCRIPCION ES UNA CREDENCIAL DE ENVIO.
 *
 * Quien lo tiene puede escribirle avisos a ese telefono. Sale de aqui en UN solo
 * sitio —`leerSuscripcionesVivas()`, porque sin el no hay envio posible— y no
 * entra en la firma de ninguna otra funcion. En particular NO entra en ninguna
 * de las que escriben: si no cabe en la firma, no puede acabar en una columna ni
 * en un log ni por un descuido ni por una interpolacion copiada (T-05-04).
 * ════════════════════════════════════════════════════════════════════════════
 */

// ───────────────────────────────────────────────────────────────────────────
// El cliente
// ───────────────────────────────────────────────────────────────────────────

export type ClienteDePush = SupabaseClient<Database>;

// ───────────────────────────────────────────────────────────────────────────
// Los codigos
// ───────────────────────────────────────────────────────────────────────────

/**
 * LO UNICO QUE PUEDE ACABAR EN `notifications.push_last_error` Y EN
 * `push_subscriptions.revoked_reason`.
 *
 * Es la unica barrera entre un mensaje de error de la libreria de envio —que
 * arrastra el `endpoint` entero del objeto de error— y dos columnas que el admin
 * puede llegar a ver en el panel de D-03. Mismo criterio, y por la misma razon,
 * que `CodigoDeFallo` en `lib/data/sync.ts`.
 *
 * Se construye SOBRE `MotivoDePush` en vez de repetir sus catorce formas: esa
 * union ya esta cerrada y probada en `lib/push/errores.ts`, y dos copias de la
 * misma lista se desincronizan. Lo que se anade son los cinco motivos que nacen
 * en el worker y no en la respuesta del push service:
 *
 *   · `sin_suscripciones`      — el destinatario no tiene ningun dispositivo vivo.
 *   · `clave_obsoleta`         — la suscripcion se creo con otro par VAPID.
 *   · `payload_excede_limite`  — el constructor del cuerpo se paso de tamano.
 *   · `configuracion_rota`     — falta configuracion de servidor; no sale NADA.
 *   · `topico_invalido`        — la clave de colapso no cabe en la cabecera.
 *
 * Y uno que no nace en el worker sino EN EL TELEFONO, anadido en el plan 05-10:
 *
 *   · `baja_desde_el_telefono` — el propio navegador hizo `unsubscribe()`, y
 *     `revocarSuscripcionPropia()` de `app/(cleaner)/_actions.ts` lo escribe.
 *     Vive en esta union y no como cadena suelta en aquel archivo porque la
 *     regla 2 de este modulo es que `revoked_reason` solo lleva codigos de una
 *     lista cerrada: esa columna la puede llegar a ver el admin.
 */
export type CodigoDePush =
  | MotivoDePush
  | 'sin_suscripciones'
  | 'clave_obsoleta'
  | 'payload_excede_limite'
  | 'configuracion_rota'
  | 'topico_invalido'
  | 'baja_desde_el_telefono';

// ───────────────────────────────────────────────────────────────────────────
// El reclamo
// ───────────────────────────────────────────────────────────────────────────

/**
 * Cuanto se empuja `next_attempt_at` al reclamar. DOS minutos, y tiene que ser
 * estrictamente mayor que el minuto del tick de `dispatch-push-notifications`.
 *
 * Es el MISMO numero que escribe el bucle del dispatcher en la migracion 17, y
 * protege lo mismo: no los ticks solapados —`pg_cron` corre en serie, medido en
 * la Fase 3— sino EL WORKER SOBREVIVIENDO A SU PROPIO INTERVALO. Si un envio
 * tarda tres minutos porque el push service de Apple esta lento, sin este
 * empujon el tick de dentro de sesenta segundos despacharia una segunda
 * invocacion para la misma notificacion.
 */
export const LEASE_MS = 2 * 60_000;

/**
 * La fila que el worker necesita para armar el aviso. Es un subconjunto CERRADO
 * de `notifications`: justo lo que piden `claveDeColapso()` y `construirPayload()`,
 * mas el contador de intentos. `payload`, `read_at` y `property_id` no estan
 * porque el envio no los usa.
 */
export type NotificacionReclamada = {
  id: string;
  recipient_id: string;
  type: Database['public']['Enums']['notification_type'];
  title: string;
  body: string;
  url: string | null;
  cleaning_id: string | null;
  dedupe_key: string | null;
  push_attempts: number;
};

const COLUMNAS_DE_NOTIFICACION =
  'id, recipient_id, type, title, body, url, cleaning_id, dedupe_key, push_attempts';

/**
 * RECLAMA LA NOTIFICACION. ESTO ES LA IDEMPOTENCIA DEL SISTEMA ENTERO.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * El `update` filtra POR ESTADO (`push_status = 'pendiente'`) y devuelve la fila
 * con `returning`. Es UNA SOLA SENTENCIA, asi que dos invocaciones simultaneas
 * NO pueden reclamar la misma fila: PostgreSQL serializa la segunda sobre la
 * fila ya bloqueada, y cuando la deja pasar el predicado ya no se cumple. La
 * segunda no recibe nada y el llamador responde SIN ENVIAR.
 *
 * Es el equivalente de `for update skip locked` a nivel de PostgREST, y es lo
 * que hace INOFENSIVO que el trigger `AFTER INSERT` de la migracion 17 y el cron
 * de un minuto se solapen: los dos pueden invocar el worker para la misma
 * notificacion y solo uno manda el aviso (T-05-18, I5).
 *
 * QUITAR EL FILTRO DE ESTADO ES EL SENUELO: sin el, una notificacion ya enviada
 * se puede volver a reclamar y el aseador recibe el mismo aviso dos veces.
 * `push.test.ts` lo afirma leyendo los filtros de la sentencia.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Devuelve `null` cuando no hay nada que reclamar. No lanza: que otra invocacion
 * haya llegado antes es el caso NORMAL, no un error.
 */
export async function reclamarNotificacion(
  cliente: ClienteDePush,
  id: string,
): Promise<NotificacionReclamada | null> {
  const { data } = await cliente
    .from('notifications')
    .update({ next_attempt_at: new Date(Date.now() + LEASE_MS).toISOString() })
    .eq('id', id)
    .eq('push_status', 'pendiente')
    .select(COLUMNAS_DE_NOTIFICACION)
    .maybeSingle();

  return (data as NotificacionReclamada | null) ?? null;
}

// ───────────────────────────────────────────────────────────────────────────
// Las suscripciones vivas
// ───────────────────────────────────────────────────────────────────────────

/**
 * Lo unico que sale de `push_subscriptions` hacia el worker.
 *
 * `soporta_declarativo` es POR DISPOSITIVO y por eso viaja aqui: D-07 exige dos
 * formatos de cuerpo y el dato que elige la rama es de la suscripcion, no de la
 * notificacion. `failure_count` viaja porque `supabase-js` no sabe expresar
 * `failure_count = failure_count + 1` sin una consulta cruda, exactamente igual
 * que `fallosPrevios` en `registrarFalloDeSync()`.
 */
export type SuscripcionViva = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  soporta_declarativo: boolean;
  failure_count: number;
};

/**
 * Las suscripciones VIVAS del destinatario, servidas por el indice parcial
 * `push_subs_user_idx` de la migracion 06 (`where revoked_at is null`).
 *
 * Devuelve un arreglo vacio si no hay ninguna, y ese caso NO es un no-op: el
 * llamador tiene que marcarlo con `sin_suscripciones` (I6, T-05-26).
 */
export async function leerSuscripcionesVivas(
  cliente: ClienteDePush,
  userId: string,
): Promise<SuscripcionViva[]> {
  const { data } = await cliente
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, soporta_declarativo, failure_count')
    .eq('user_id', userId)
    .is('revoked_at', null);

  return (data as SuscripcionViva[] | null) ?? [];
}

// ───────────────────────────────────────────────────────────────────────────
// El estado de la notificacion
// ───────────────────────────────────────────────────────────────────────────

/**
 * La notificacion salio. `push_last_error` se limpia a proposito: una fila en
 * `enviado` que conservara el codigo del intento fallido anterior se leeria en
 * el panel de D-03 como «enviada pero con error», que es justo lo contrario de
 * lo que paso.
 *
 * BASTA CON UNA ENTREGA. Un aseador con dos telefonos y uno muerto sigue
 * enterado, y marcar la notificacion como fallida por el telefono muerto la
 * haria repetirse en el bueno.
 */
export async function marcarNotificacionEnviada(
  cliente: ClienteDePush,
  id: string,
  intentos: number,
): Promise<void> {
  await cliente
    .from('notifications')
    .update({ push_status: 'enviado', push_attempts: intentos, push_last_error: null })
    .eq('id', id);
}

export type ParametrosDeReintento = {
  id: string;
  intentos: number;
  /** De `decidir()`, o de la tabla `ESPERAS_MS`. Nunca inventado aqui. */
  esperarMs: number;
  codigo: CodigoDePush;
};

/**
 * Vuelve a dejar la notificacion en la cola con su backoff.
 *
 * `push_status` se reescribe a `'pendiente'` explicitamente aunque ya lo estaba:
 * el reclamo no lo cambia, pero escribirlo deja la sentencia legible por si sola
 * y no depende de que el reclamo siga siendo como es hoy.
 */
export async function marcarNotificacionParaReintento(
  cliente: ClienteDePush,
  p: ParametrosDeReintento,
): Promise<void> {
  await cliente
    .from('notifications')
    .update({
      push_status: 'pendiente',
      push_attempts: p.intentos,
      push_last_error: p.codigo,
      next_attempt_at: new Date(Date.now() + p.esperarMs).toISOString(),
    })
    .eq('id', p.id);
}

export type ParametrosDeDescarte = {
  id: string;
  intentos: number;
  codigo: CodigoDePush;
};

/**
 * La notificacion no va a salir y no se va a reintentar.
 *
 * EL CASO QUE EL PRODUCTO NO PUEDE TRATAR COMO SILENCIO (I6): un aseo confirmado
 * cuyo responsable no tiene ninguna suscripcion viva se marca aqui con
 * `codigo: 'sin_suscripciones'`, NUNCA como `enviado`. Marcarlo enviado seria
 * mentir, y esta es exactamente la fila que hace visible en el panel de D-03 que
 * a alguien no le va a sonar el telefono.
 */
export async function marcarNotificacionDescartada(
  cliente: ClienteDePush,
  p: ParametrosDeDescarte,
): Promise<void> {
  await cliente
    .from('notifications')
    .update({
      push_status: 'descartado',
      push_attempts: p.intentos,
      push_last_error: p.codigo,
    })
    .eq('id', p.id);
}

// ───────────────────────────────────────────────────────────────────────────
// La salud de la suscripcion
// ───────────────────────────────────────────────────────────────────────────

/** El push service acepto el mensaje. Reinicia el contador de fallos. */
export async function registrarExitoDeSuscripcion(
  cliente: ClienteDePush,
  id: string,
): Promise<void> {
  await cliente
    .from('push_subscriptions')
    .update({ last_success_at: new Date().toISOString(), failure_count: 0 })
    .eq('id', id);
}

/**
 * Un intento fallido contra ESTA suscripcion. NO la revoca y no puede hacerlo:
 * un fallo transitorio no es una suscripcion muerta.
 *
 * `fallosPrevios` entra por parametro por la misma razon que en
 * `registrarFalloDeSync()`: `supabase-js` no expresa `col = col + 1`, asi que el
 * valor se lee con la suscripcion y se incrementa aqui.
 */
export async function registrarFalloDeSuscripcion(
  cliente: ClienteDePush,
  id: string,
  fallosPrevios: number,
): Promise<void> {
  await cliente
    .from('push_subscriptions')
    .update({
      last_failure_at: new Date().toISOString(),
      failure_count: Math.max(0, Math.trunc(fallosPrevios)) + 1,
    })
    .eq('id', id);
}

export type ParametrosDeRevocacion = {
  id: string;
  /** `http_404`, `http_410` o `clave_obsoleta`. Nada mas llega aqui. */
  motivo: CodigoDePush;
};

/**
 * ════════════════════════════════════════════════════════════════════════════
 * LA UNICA PUERTA DE REVOCACION DEL SISTEMA.
 *
 * Solo la alcanzan dos decisiones de `decidir()`: `desactivar_suscripcion` (que
 * nace UNICAMENTE de un `404` o un `410`, es decir, del endpoint que ya no
 * existe) y `requiere_resuscripcion` (un `403 VapidPkHashMismatch`, que entra
 * aqui con `clave_obsoleta`).
 *
 * ES EL PUNTO DONDE UN DESCUIDO BORRA LA OPERACION ENTERA. Si un `403` masivo se
 * tratara como un `410`, se revocarian las ocho suscripciones de la operacion en
 * una sola corrida, y en iOS no hay `pushsubscriptionchange`: no existe
 * reparacion automatica, hay que reinstalar la PWA en ocho telefonos a mano. Por
 * eso `abortar_corrida` sale del bucle del worker ANTES de llegar aqui (T-05-05).
 *
 * Escribe EXACTAMENTE DOS COLUMNAS y no toca `notifications`: la suerte del
 * dispositivo y la del aviso son cosas distintas. `push.test.ts` cuenta las
 * claves.
 * ════════════════════════════════════════════════════════════════════════════
 */
export async function revocarSuscripcion(
  cliente: ClienteDePush,
  p: ParametrosDeRevocacion,
): Promise<void> {
  await cliente
    .from('push_subscriptions')
    .update({ revoked_at: new Date().toISOString(), revoked_reason: p.motivo })
    .eq('id', p.id);
}
