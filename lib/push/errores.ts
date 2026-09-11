/**
 * LA DECISIÓN DE ERROR DE PUSH, COMO FUNCIÓN PURA.
 *
 * Este módulo traduce la respuesta de un push service (APNs, FCM, Mozilla
 * autopush) a UNA decisión de una unión cerrada. No hace red, no lee reloj, no
 * lee aleatoriedad y no importa absolutamente nada: es aritmética y un orden de
 * ramas. Por eso se puede probar entero sin levantar nada.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * LA DISTINCIÓN QUE SOSTIENE TODO EL MÓDULO, Y NO ES SIMÉTRICA:
 *
 *   `404` y `410` significan  "ESTA SUSCRIPCIÓN MURIÓ".
 *   `400` y `403` significan  "TU CONFIGURACIÓN ESTÁ ROTA".
 *
 * Si un `403` masivo se trata como si fuera `410`, se borran las OCHO
 * suscripciones de la operación en una sola corrida y hay que reinstalar la PWA
 * en ocho teléfonos a mano. En iOS no hay `pushsubscriptionchange`, así que no
 * existe reparación automática: la única salida es que cada aseadora vuelva a
 * abrir la app y vuelva a dar permiso. Es el modo de fallo más caro de la fase
 * y es silencioso (T-05-05).
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── EL ORDEN DE LAS RAMAS ES PARTE DEL CONTRATO ─────────────────────────────
 *
 * La rama de `VapidPkHashMismatch` va ANTES que la rama genérica de `403`. No
 * es estilo: si se invierten, una suscripción creada con otra clave VAPID —que
 * no está muerta, está DESALINEADA— se leería como "configuración rota" y
 * abortaría la corrida entera por culpa de un solo teléfono. El test
 * `errores.test.ts` afirma las dos mitades de esa distinción por separado.
 *
 * ── EL `motivo` ES UNA UNIÓN CERRADA, NUNCA UN TROZO DEL CUERPO (T-05-22) ───
 *
 * El `motivo` acaba en `notifications.push_last_error`, que es una columna que
 * el admin ve en pantalla. El cuerpo de la respuesta es entrada NO CONFIABLE y
 * puede arrastrar texto arbitrario. Por eso `leerReason()` solo devuelve un
 * `reason` si es uno de los ocho que Apple documenta: cualquier otra cosa se
 * descarta y el motivo cae al código HTTP, que lo produjo el transporte y no el
 * cuerpo. Es la misma regla, y por la misma razón, que `CodigoDeFallo` en
 * `lib/data/sync.ts`.
 *
 * Fuente de la tabla: documentación de Apple sobre Web Push, consultada el
 * 2026-09-03 (`05-RESEARCH.md` §"Códigos de estado y de error de APNs").
 */

// ───────────────────────────────────────────────────────────────────────────
// Los motivos
// ───────────────────────────────────────────────────────────────────────────

/**
 * Los `reason` del JSON de respuesta que importan. Ocho nombres en las seis
 * filas de la tabla de Apple: `BadTtl`, `BadUrgency` y `BadWebPushTopic`
 * comparten fila porque comparten acción (son bug de código).
 *
 * Esta lista es la ALLOWLIST de lo que puede salir del cuerpo. Un `reason`
 * fuera de ella no se propaga: se ignora y el motivo pasa a ser el código HTTP.
 */
export const REASONS_DE_APNS = [
  'VapidPkHashMismatch',
  'BadJwtToken',
  'BadVapidPublicKey',
  'PayloadTooLarge',
  'TooManyRequests',
  'BadTtl',
  'BadUrgency',
  'BadWebPushTopic',
] as const;

export type ReasonDeApns = (typeof REASONS_DE_APNS)[number];

/** `http_410`, `http_503`. El número lo produjo el transporte, no el cuerpo. */
export type CodigoHttpPush = `http_${number}`;

/** Lo que no está en la tabla de Apple. Nunca cae en un `else` mudo. */
export type CodigoHttpSinClasificar = `http_${number}_no_clasificado`;

export type MotivoDePush =
  | ReasonDeApns
  | CodigoHttpPush
  | CodigoHttpSinClasificar
  | 'intentos_agotados';

function codigoHttp(status: number): CodigoHttpPush {
  return `http_${status}`;
}

// ───────────────────────────────────────────────────────────────────────────
// La decisión
// ───────────────────────────────────────────────────────────────────────────

/**
 * Las siete cosas que se pueden hacer con la respuesta de un push service.
 *
 * Unión cerrada y no cadenas sueltas, por la misma razón que `CodigoDeFallo` en
 * `lib/data/sync.ts`: el compilador es quien impide que aparezca un octavo caso
 * sin que nadie haya decidido qué hacer con él.
 */
export type DecisionPush =
  /** El push service aceptó el mensaje. NO significa entregado al dispositivo. */
  | { tipo: 'entregado' }
  /** La suscripción murió. Es la ÚNICA razón legítima para desactivarla. */
  | { tipo: 'desactivar_suscripcion'; motivo: MotivoDePush }
  /** Está viva pero se creó con otra clave VAPID. El cliente tiene que re-suscribirse. */
  | { tipo: 'requiere_resuscripcion'; motivo: MotivoDePush }
  /** Transitorio. Volver a intentar tras `esperarMs`. */
  | { tipo: 'reintentar'; esperarMs: number; motivo: MotivoDePush }
  /** Se acabaron los intentos. Lleva la notificación a `push_status = 'descartado'`. */
  | { tipo: 'descartar'; motivo: MotivoDePush }
  /** Defecto de este código. No se reintenta: reintentar un bug lo repite. */
  | { tipo: 'bug'; motivo: MotivoDePush }
  /** Configuración global rota. Si se sigue, no sale NINGUNA notificación. */
  | { tipo: 'abortar_corrida'; motivo: MotivoDePush };

// ───────────────────────────────────────────────────────────────────────────
// El backoff
// ───────────────────────────────────────────────────────────────────────────

/**
 * La política de backoff, ESCRITA COMO TABLA y no como fórmula opaca. Mismo
 * patrón que `siguienteIntento()` en `lib/data/sync.ts`, y por el mismo motivo:
 * una tabla se lee, se discute y se prueba casilla por casilla.
 *
 *     intento 1 ->     60 s
 *     intento 2 ->    300 s
 *     intento 3 ->    900 s
 *     intento 4 ->  3 600 s
 *     intento 5 -> descartar
 *
 * Cuatro casillas, ventana total de 4 860 s: una hora y veintiún minutos. El
 * número sale del producto y no de una convención. El `TTL` de un aviso de push
 * es de horas porque *"un aviso de 'te asignaron el aseo de mañana' que llega
 * tres días tarde es ruido"* (`05-RESEARCH.md`); seguir reintentando más allá
 * de esa ventana consume cuota contra un aviso que ya no sirve, y encima deja
 * la fila de `notifications` ocupando la cola del drenaje.
 *
 * ── SIN JITTER, A PROPÓSITO ────────────────────────────────────────────────
 * El caso que calibra este diseño son QUINCE notificaciones de una tanda, no
 * quince mil. No hay tormenta que dispersar. Añadir aleatoriedad haría el
 * módulo no determinista y obligaría al test a tolerar rangos, que es justo
 * como se cuelan los defectos de política: un rango ancho pasa en verde con la
 * tabla equivocada dentro.
 */
export const ESPERAS_MS: readonly number[] = Object.freeze([
  60_000,
  300_000,
  900_000,
  3_600_000,
]);

/**
 * Cuántos intentos llegan a programar un reintento. El intento
 * `TOPE_DE_INTENTOS + 1` que falle se descarta.
 *
 * Se exporta para que el worker del plan 05-06 y el test lean EL MISMO número y
 * nadie lo repita a mano en dos sitios.
 */
export const TOPE_DE_INTENTOS = ESPERAS_MS.length;

/**
 * El techo de lo que se acepta de la cabecera `Retry-After`. Una hora, por la
 * misma razón que la ventana total: más allá de eso el aviso ya no sirve, y un
 * push service que pide 24 horas no puede secuestrar la cola del drenaje.
 */
export const TOPE_DE_ESPERA_MS = 3_600_000;

/**
 * La espera de la cabecera, si es usable. `undefined` si no lo es.
 *
 * La lectura es insensible a mayúsculas porque `web-push` devuelve las
 * cabeceras tal como las entrega Node, y el caso de los nombres no está
 * garantizado por la RFC. Un `Retry-After` en formato fecha HTTP es legal y no
 * se soporta a propósito: cae al backoff propio, que es la respuesta segura.
 * Cero y negativo tampoco son esperas: reintentar ya mismo es martillear.
 */
function esperaDeCabecera(headers: Record<string, string> | undefined): number | undefined {
  if (!headers) return undefined;

  let crudo: string | undefined;
  for (const [clave, valor] of Object.entries(headers)) {
    if (clave.toLowerCase() === 'retry-after') {
      crudo = valor;
      break;
    }
  }
  if (crudo === undefined) return undefined;

  const segundos = Number(crudo);
  if (!Number.isFinite(segundos) || segundos <= 0) return undefined;

  return Math.min(segundos * 1000, TOPE_DE_ESPERA_MS);
}

/**
 * La rama de reintento, con su tope. Es la ÚNICA entrada a `descartar`: el tope
 * de intentos gobierna los transitorios y nada más. Un `410` con los intentos
 * agotados sigue siendo una suscripción muerta, no una notificación descartada.
 */
function programarReintento(
  intento: number,
  motivo: MotivoDePush,
  esperaSugeridaMs: number | undefined,
): DecisionPush {
  const n = Math.max(1, Math.trunc(intento));
  if (n > TOPE_DE_INTENTOS) {
    return { tipo: 'descartar', motivo: 'intentos_agotados' };
  }
  return {
    tipo: 'reintentar',
    esperarMs: esperaSugeridaMs ?? ESPERAS_MS[n - 1],
    motivo,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// El cuerpo
// ───────────────────────────────────────────────────────────────────────────

const REASONS: ReadonlySet<string> = new Set(REASONS_DE_APNS);

/**
 * El `reason` del cuerpo, SOLO si es uno de los ocho de la allowlist.
 *
 * Tolera un cuerpo ausente, vacío, que no es JSON, que es un JSON escalar, un
 * array, o un objeto sin la clave. Nada de eso lanza: el cuerpo lo escribe un
 * tercero y una excepción aquí tumbaría el drenaje de las otras catorce
 * notificaciones de la tanda.
 */
function leerReason(body: string | undefined): ReasonDeApns | undefined {
  if (!body) return undefined;

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return undefined;
  }

  if (typeof json !== 'object' || json === null || Array.isArray(json)) return undefined;

  const reason = (json as Record<string, unknown>).reason;
  if (typeof reason !== 'string') return undefined;

  return REASONS.has(reason) ? (reason as ReasonDeApns) : undefined;
}

// ───────────────────────────────────────────────────────────────────────────
// `decidir()`
// ───────────────────────────────────────────────────────────────────────────

/**
 * Qué hacer con la respuesta de un push service.
 *
 * `web-push` resuelve o rechaza con un objeto que expone `statusCode`,
 * `headers` y `body` (literal de su README). Esos tres, más el número de
 * intento que ya llevaba la fila de `notifications`, son la ÚNICA entrada.
 *
 * @param statusCode El código HTTP que devolvió el push service.
 * @param body       El cuerpo de la respuesta. Entrada NO confiable.
 * @param headers    Las cabeceras. Solo se mira `retry-after`.
 * @param intento    Qué número de intento acaba de fallar. El primero es 1.
 */
export function decidir(
  statusCode: number,
  body: string | undefined,
  headers: Record<string, string> | undefined,
  intento: number,
): DecisionPush {
  const reason = leerReason(body);

  // 1. Éxito. Aceptado por el push service, que no es lo mismo que entregado.
  if (statusCode >= 200 && statusCode < 300) {
    return { tipo: 'entregado' };
  }

  // 2. Suscripción muerta. LAS DOS ÚNICAS ENTRADAS a desactivar. Van antes que
  //    cualquier rama de `reason` porque son inequívocas: el endpoint ya no
  //    existe, y ningún `reason` puede resucitarlo.
  if (statusCode === 404 || statusCode === 410) {
    return { tipo: 'desactivar_suscripcion', motivo: codigoHttp(statusCode) };
  }

  // 3. ─────────────────────────────────────────────────────────────────────
  //    ESTA RAMA VA ANTES QUE LA GENÉRICA DE 403 Y ESE ORDEN ES EL CONTRATO.
  //
  //    La suscripción se creó con otra clave VAPID: no está muerta, está
  //    DESALINEADA. Si esta rama cayera después de la genérica, un solo
  //    teléfono con la clave vieja abortaría la corrida entera de los otros
  //    siete. Y si cayera dentro de la rama de `404`/`410`, se borraría una
  //    suscripción perfectamente viva.
  //    ─────────────────────────────────────────────────────────────────────
  if (statusCode === 403 && reason === 'VapidPkHashMismatch') {
    return { tipo: 'requiere_resuscripcion', motivo: reason };
  }

  // 4. Configuración global rota. El `reason` manda sobre el status: si el JWT
  //    o la clave pública están mal, NINGUNA notificación de la corrida va a
  //    salir, así que seguir es quemar los cuatro intentos de las quince.
  //    Un `403` sin `reason` legible entra aquí a propósito: lo desconocido en
  //    autenticación se trata como global, que es el lado seguro (no borra nada).
  if (reason === 'BadJwtToken' || reason === 'BadVapidPublicKey' || statusCode === 403) {
    return { tipo: 'abortar_corrida', motivo: reason ?? codigoHttp(statusCode) };
  }

  // 5. Bug de este código. No se reintenta: un payload de más de 4 KB lo sigue
  //    siendo en el quinto intento.
  if (statusCode === 400 || statusCode === 405 || statusCode === 413) {
    return { tipo: 'bug', motivo: reason ?? codigoHttp(statusCode) };
  }

  // 6. Demasiadas peticiones al mismo destino. Backoff, y NUNCA desactivar.
  if (statusCode === 429) {
    return programarReintento(intento, codigoHttp(statusCode), esperaDeCabecera(headers));
  }

  // 7. Transitorio del servidor. La cabecera también se respeta si viene.
  if (statusCode >= 500) {
    return programarReintento(intento, codigoHttp(statusCode), esperaDeCabecera(headers));
  }

  // 8. Fuera de la tabla de Apple. NO hay `else` mudo: el código queda escrito
  //    con su sufijo para que aparezca en `push_last_error` y alguien lo
  //    clasifique el día que salga.
  return { tipo: 'bug', motivo: `http_${statusCode}_no_clasificado` };
}
