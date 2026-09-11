import 'server-only';

import webpush from 'web-push';

import { publicEnv, readServerSecret } from '@/lib/env';

import { esClaveDeTopicValida } from './colapso';

/**
 * LA SALIDA HACIA EL PUSH SERVICE. ES LO ÚNICO DE ESTA FASE QUE FIRMA ALGO.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * `enviar()` NO LANZA POR UN FALLO DEL PUSH SERVICE. NUNCA. (T-05-23)
 *
 * `web-push` RECHAZA la promesa ante cualquier respuesta que no sea 2xx, y una
 * suscripción revocada —un `410`— es la cosa más normal del mundo. El worker
 * procesa una notificación contra N suscripciones y una tanda contra hasta
 * quince notificaciones: sin el `try/catch`, el primer `410` mata la corrida
 * entera y las otras catorce no salen. Con un canal único y sin respaldo, eso
 * es un aseo que nadie sabe que tiene.
 *
 * Un fallo por suscripción es INFORMACIÓN, no una interrupción. Vuelve como
 * código, y `decidir()` en `errores.ts` es quien resuelve qué significa.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── LA EXCEPCIÓN, QUE ES DELIBERADA Y NO UNA GRIETA ─────────────────────────
 *
 * La CONFIGURACIÓN rota SÍ lanza, y la validación va a propósito FUERA del
 * `try`. Una clave ausente o un subject mal formado no hacen fallar una
 * suscripción: hacen fallar TODAS. Devolver un código las volvería quince
 * fallos individuales indistinguibles de una caída de red, cada uno gastando
 * sus cuatro reintentos. Es la misma decisión que `abortar_corrida` en
 * `errores.ts`, tomada un escalón antes.
 *
 * ── LO QUE NO SALE DE AQUÍ (T-05-04) ────────────────────────────────────────
 *
 * `RespuestaDePush` no tiene ranura para el destino de la suscripción ni para
 * sus dos claves criptográficas. El objeto de error de la librería SÍ los
 * expone, y la tentación concreta es devolverlo tal cual o hacerle un `spread`;
 * por eso la respuesta se construye CAMPO A CAMPO. Quien tiene ese destino
 * puede escribirle a ese teléfono: es una credencial de envío, y un log es para
 * siempre. Mismo patrón que `LineaDeLog` en el worker de la Fase 3.
 *
 * ── RUNTIME `nodejs`, NO `edge` ─────────────────────────────────────────────
 *
 * `web-push` necesita `node:crypto` para el ECDH, el HKDF y la firma ES256 del
 * JWT. No corre en Edge ni en Workers. Quien monte el route handler que use
 * este módulo tiene que declararlo.
 */

// ───────────────────────────────────────────────────────────────────────────
// Las variables
// ───────────────────────────────────────────────────────────────────────────

/**
 * La clave privada del par VAPID. Solo se nombra acá, y se lee con el helper
 * que rechaza por runtime cualquier nombre con prefijo público: un secreto con
 * ese prefijo se inlinea en el bundle del cliente (T-05-09).
 */
const VAR_CLAVE_PRIVADA = 'VAPID_PRIVATE_KEY';

/**
 * El contacto que Apple exige en el JWT. No es un secreto, pero es
 * configuración de servidor y no tiene por qué viajar al cliente.
 */
const VAR_SUBJECT = 'VAPID_SUBJECT';

/**
 * Diez segundos por intento.
 *
 * El `maxDuration` de un route handler de esta plataforma es de 60 s y una
 * notificación puede tener varias suscripciones: diez segundos por intento
 * dejan margen para las de una tanda sin que el corte de la plataforma —que no
 * deja rastro— llegue antes que el timeout controlado.
 *
 * Y es un timeout de SOCKET, no de respuesta completa: si el push service
 * manda datos a cuentagotas pero sigue mandando, no salta. Para lo que se
 * manda acá, unos cientos de bytes, la distinción no cambia nada.
 */
export const TIMEOUT_MS = 10_000;

/** Hosts que no pueden aparecer en el subject. Ver `validarSubject()`. */
const HOSTS_LOCALES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);

function esHostLocal(host: string): boolean {
  const h = host.toLowerCase();
  return HOSTS_LOCALES.has(h) || h.endsWith('.local') || h.endsWith('.localhost');
}

/**
 * El subject del JWT, validado antes de firmar nada.
 *
 * Tiene que ser un `mailto:` o un `https:` y NO puede apuntar a un host local.
 * La razón está documentada en el README de la librería: Safari rechaza el JWT
 * con `BadJwtToken` cuando el subject apunta a `localhost`. Ese error aparece
 * SOLO en producción y solo contra los teléfonos de Apple, que acá son la
 * mitad de la operación; la comprobación cuesta microsegundos y lo convierte en
 * un fallo inmediato, ruidoso y en el sitio correcto.
 *
 * El mensaje nombra la variable y la regla, pero NO el valor: un mensaje de
 * error acaba en un log, y el log se lee.
 */
function validarSubject(subject: string): string {
  const invalido = (regla: string) =>
    new Error(`${VAR_SUBJECT} inválido: ${regla}. Safari rechaza el JWT con BadJwtToken.`);

  if (subject.startsWith('mailto:')) {
    const direccion = subject.slice('mailto:'.length);
    const arroba = direccion.lastIndexOf('@');
    const dominio = arroba === -1 ? '' : direccion.slice(arroba + 1);
    if (arroba <= 0 || dominio.length === 0) throw invalido('el mailto: no lleva una dirección');
    if (esHostLocal(dominio)) throw invalido('el dominio del mailto: es local');
    return subject;
  }

  let u: URL;
  try {
    u = new URL(subject);
  } catch {
    throw invalido('tiene que ser un mailto: o una URL https:');
  }
  if (u.protocol !== 'https:') throw invalido('una URL tiene que ser https:');
  if (esHostLocal(u.hostname)) throw invalido('el host es local');
  return subject;
}

// ───────────────────────────────────────────────────────────────────────────
// La configuración, perezosa y memoizada
// ───────────────────────────────────────────────────────────────────────────

let configurado = false;

/**
 * Configura VAPID una sola vez por proceso.
 *
 * Perezosa y no en el ámbito del módulo a propósito: así importar este archivo
 * desde un test o desde una herramienta no exige tener el entorno completo, que
 * es lo que convierte una dependencia de configuración en un fallo de arranque
 * en sitios que no la necesitan.
 *
 * Se exporta para que el worker pueda exigirla UNA vez antes de la tanda, en
 * vez de descubrir la configuración rota a mitad de las quince.
 */
export function configurarVapid(): void {
  if (configurado) return;

  const subject = validarSubject(readServerSecret(VAR_SUBJECT));
  const { NEXT_PUBLIC_VAPID_PUBLIC_KEY } = publicEnv();
  const privada = readServerSecret(VAR_CLAVE_PRIVADA);

  webpush.setVapidDetails(subject, NEXT_PUBLIC_VAPID_PUBLIC_KEY, privada);
  configurado = true;
}

// ───────────────────────────────────────────────────────────────────────────
// El envío
// ───────────────────────────────────────────────────────────────────────────

/**
 * La respuesta del push service, y NADA MÁS.
 *
 * Estos tres campos son exactamente la entrada de `decidir()`. No hay un cuarto
 * y no puede haberlo: ver «lo que no sale de aquí» en la cabecera del módulo.
 */
export type RespuestaDePush = {
  statusCode: number;
  headers?: Record<string, string>;
  body?: string;
};

/** La suscripción, tal como la guarda `push_subscriptions`. */
export type SuscripcionDePush = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export type OpcionesDeEnvio = {
  /** Segundos de retención en el push service. De `TTL_SEGUNDOS`. */
  ttl: number;
  /** De `urgenciaDe()`. */
  urgency: 'high' | 'normal';
  /** La clave de colapso. Se omite si no cabe en la cabecera. */
  topic?: string;
  /** Timeout de socket. Por defecto `TIMEOUT_MS`. */
  timeoutMs: number;
};

/**
 * Manda un aviso a UNA suscripción y devuelve lo que dijo el push service.
 *
 * @throws solo si la configuración de VAPID está rota. Ver la cabecera.
 */
export async function enviar(
  sub: SuscripcionDePush,
  payload: string,
  opciones: OpcionesDeEnvio,
): Promise<RespuestaDePush> {
  // FUERA del try, y ese es el contrato: un fallo de configuración tiene que
  // salir por arriba y detener la corrida, no disfrazarse de fallo de red.
  configurarVapid();

  const peticion: webpush.RequestOptions = {
    TTL: opciones.ttl,
    urgency: opciones.urgency,
    timeout: opciones.timeoutMs,
  };

  // Una clave que no cabe en la cabecera devuelve `BadWebPushTopic`, que
  // `decidir()` clasifica como bug y descarta el aviso entero. Sin cabecera el
  // aviso sale igual: solo pierde el colapso en el servidor de push, que es un
  // precio infinitamente menor que no salir.
  if (opciones.topic !== undefined && esClaveDeTopicValida(opciones.topic)) {
    peticion.topic = opciones.topic;
  }

  try {
    const r = await webpush.sendNotification(sub, payload, peticion);
    return { statusCode: r.statusCode, headers: r.headers, body: r.body };
  } catch (e) {
    // Campo a campo, NUNCA un spread del objeto de error: `WebPushError`
    // arrastra el destino de la suscripción y ahí es donde se filtraría.
    const err = e as { statusCode?: number; headers?: Record<string, string>; body?: string };
    return {
      // Cero es un fallo de transporte puro —un socket cortado, un DNS que no
      // resuelve—, que nunca llegó a tener código HTTP. `decidir()` lo
      // clasifica como bug sin clasificar: no desactiva nada y queda escrito.
      statusCode: typeof err.statusCode === 'number' ? err.statusCode : 0,
      headers: err.headers,
      body: err.body,
    };
  }
}
