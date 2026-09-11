import 'server-only';

import { z } from 'zod';

import {
  leerSuscripcionesVivas,
  marcarNotificacionDescartada,
  marcarNotificacionEnviada,
  marcarNotificacionParaReintento,
  reclamarNotificacion,
  registrarExitoDeSuscripcion,
  registrarFalloDeSuscripcion,
  revocarSuscripcion,
  type CodigoDePush,
} from '@/lib/data/push';
import { claveDeColapso, esClaveDeTopicValida } from '@/lib/push/colapso';
import { decidir, ESPERAS_MS, TOPE_DE_INTENTOS } from '@/lib/push/errores';
import { construirPayload, TTL_SEGUNDOS, urgenciaDe } from '@/lib/push/payload';
import { enviar, TIMEOUT_MS, type RespuestaDePush } from '@/lib/push/envio';
import { origenDeLaAplicacion } from '@/lib/push/origen';
import { createAdminClient } from '@/lib/supabase/admin';

import { exigirSecretoCron, SecretoCronInvalido } from './_guard';

/**
 * EL WORKER DEL OUTBOX DE PUSH: una invocacion HTTP por notificacion, disparada
 * por el trigger `AFTER INSERT` de la migracion 17 y repescada por el cron de un
 * minuto.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ES LA SEGUNDA PIEZA DEL SISTEMA QUE HABLA CON EL EXTERIOR Y LA SEGUNDA MAS
 * VALIOSA COMO BLANCO.
 *
 * Es publica en internet, la autentica un SECRETO COMPARTIDO y no una cookie: no
 * hay usuario, no hay sesion y no hay RLS. Construye la fabrica administrativa,
 * que salta la RLS por completo, y habla con un servicio de terceros cuyo cuerpo
 * de respuesta es entrada NO confiable.
 *
 * ORDEN OBLIGADO DENTRO DEL CUERPO DE `POST`, Y NO ES OPCIONAL:
 *
 *     guard  →  fabrica administrativa
 *
 * El guardarrail 7 de `scripts/ci/check-service-role.sh` lo exige y lo comprueba
 * POR FUNCION, no por archivo. Invertirlo deja el cliente privilegiado
 * construido antes de saber quien pregunta.
 *
 * El handler se declara con la PALABRA CLAVE de funcion, no como una constante
 * con una funcion flecha asignada. El recorrido del guardarrail reconoce las dos
 * formas hoy, pero la de declaracion es la que estaba medida, y escribirla asi no
 * depende de que el segundo patron siga ahi. (El criterio de aceptacion cuenta
 * las apariciones de esa declaracion con un grep: por eso este parrafo describe
 * la forma en vez de escribirla.)
 *
 * SIN `GET`, Y SIN NINGUN OTRO METODO. Un endpoint que MUTA y responde a `GET`
 * es alcanzable por un prefetch del navegador, por un crawler o por el propio
 * prefetch de Next (T-05-25). Los metodos no exportados devuelven 405 solos.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── QUE NO SALE DE AQUI, NUNCA (T-05-04) ────────────────────────────────────
 *
 *   · EL `endpoint` DE LA SUSCRIPCION. Es una CREDENCIAL DE ENVIO: quien lo
 *     tiene puede escribirle avisos a ese telefono, y un log es para siempre.
 *   · SUS DOS CLAVES CRIPTOGRAFICAS, `p256dh` y `auth`.
 *   · EL `title` Y EL `body` DEL AVISO, que llevan el nombre del apartamento.
 *
 * La garantia no es la disciplina: es el tipo `LineaDeLogPush`, que NO TIENE
 * RANURA donde poner ninguna de las cuatro cosas. Meterlas tiene que ser un
 * error de compilacion. Mismo patron, y por la misma razon, que `LineaDeLog` en
 * el worker de sincronizacion de la Fase 3 y que `EntradaDePayload` en
 * `lib/push/payload.ts`.
 *
 * Y el codigo de acceso del apartamento no aparece por ninguna parte porque NO
 * PUEDE (D-06): la entrada de `construirPayload()` es un subconjunto cerrado de
 * la fila de `notifications` y no tiene donde ponerlo.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 60 s. Una notificacion puede tener varias suscripciones y cada envio lleva su
 * propio timeout de socket de diez segundos: el margen es para que el corte de
 * la plataforma —que no deja rastro— nunca llegue antes que el timeout
 * CONTROLADO de la libreria.
 *
 * Va en un `route.ts` y no en un archivo de acciones de servidor: un archivo con
 * la directiva de Server Action solo puede exportar funciones async y el build
 * de Next 15.5 se cae con un `export const` dentro (medido en el plan 02-14).
 */
export const maxDuration = 60;

/** El header por el que viaja el secreto. El mismo que pone el dispatcher. */
const HEADER_SECRETO = 'x-cron-secret';

/**
 * DE DONDE SALE EL ORIGEN ABSOLUTO DE LA APLICACION, Y POR QUE NO DE LA PETICION.
 *
 * `construirPayload()` necesita un origen absoluto para el destino de navegacion
 * del aviso, y lo recibe POR PARAMETRO a proposito (es lo que lo mantiene puro).
 *
 * La resolucion vive en `lib/push/origen.ts` DESDE EL PLAN 05-11, y no aqui,
 * porque desde ese plan hay DOS emisores de avisos: este drenaje y el aviso de
 * prueba del asistente de instalacion. Dos copias de una decision de seguridad
 * son dos copias que se desincronizan. El razonamiento completo —por que no se
 * deriva de `req.url` ni del header `Host`, y por que devolver `null` es
 * preferible a inventarse un origen— esta en la cabecera de aquel modulo.
 *
 * Aqui solo queda la consecuencia local: si devuelve `null`, no se envia nada y
 * la notificacion se reintenta con `configuracion_rota`.
 */

/** Lo unico que entra por el cuerpo de la peticion. Nada mas. */
const esquemaPeticion = z.object({ notification_id: z.uuid() });

/**
 * La UNICA forma de escribir en el log desde este archivo.
 *
 * NO TIENE RANURA PARA EL ENDPOINT DE LA SUSCRIPCION, NI PARA SUS CLAVES, NI
 * PARA EL TITULO NI PARA EL CUERPO DEL AVISO. Ver la cabecera del modulo: la
 * garantia de privacidad es el tipo, no la revision.
 *
 * `codigo` es un `CodigoDePush`, que es una union cerrada: tampoco por ahi entra
 * texto arbitrario del push service.
 */
type LineaDeLogPush = {
  notification_id: string;
  outcome: OutcomeDeDrenaje;
  codigo?: CodigoDePush;
  suscripciones?: number;
  entregadas?: number;
  revocadas?: number;
  http_status?: number;
  /**
   * Solo aparece cuando la clave de colapso no sirvio como cabecera `Topic` y el
   * aviso salio SIN colapso. Es un caso que hoy no puede ocurrir —`claveDeColapso()`
   * devuelve 22 caracteres del alfabeto correcto— y precisamente por eso se
   * registra en vez de callarse: si aparece, algo cambio.
   */
  colapso?: 'omitido';
};

/** Como termino el drenaje de ESTA notificacion. Union cerrada. */
type OutcomeDeDrenaje =
  /** Otra invocacion la reclamo antes. Es el caso normal, no un error. */
  | 'ya_procesada'
  /** El destinatario no tiene ninguna suscripcion viva (I6). */
  | 'sin_destino'
  /** Al menos una suscripcion acepto el aviso. */
  | 'enviado'
  /** Nadie acepto y queda otro intento. */
  | 'reintento'
  /** Nadie acepto y no queda nada que intentar. */
  | 'descartada'
  /** Configuracion global rota: se corto la corrida SIN revocar nada. */
  | 'abortada';

function registrar(linea: LineaDeLogPush): void {
  console.info(JSON.stringify({ worker: 'push-drain', ...linea }));
}

/** La respuesta hacia `pg_net`, que es fire-and-forget y nadie la lee. */
function responder(linea: LineaDeLogPush): Response {
  registrar(linea);
  return Response.json(linea, { status: 200 });
}

/**
 * La espera del reintento cuando no la dijo el push service: la misma tabla de
 * `lib/push/errores.ts`, leida de ahi y no repetida aqui.
 */
function esperaDeLaTabla(intento: number): number {
  const n = Math.min(Math.max(1, Math.trunc(intento)), TOPE_DE_INTENTOS);
  return ESPERAS_MS[n - 1];
}

/**
 * Drena UNA notificacion.
 *
 * El orden de los pasos no es narrativo: cada uno depende del anterior y dos de
 * ellos son la seguridad del endpoint entero.
 */
export async function POST(req: Request): Promise<Response> {
  // ── 1. EL GUARD, ANTES DE NADA ────────────────────────────────────────────
  // 401 SIN CUERPO: distinguir "no mandaste header" de "el secreto no coincide"
  // es informacion gratis para quien sondea el endpoint (T-05-01).
  try {
    exigirSecretoCron(req.headers.get(HEADER_SECRETO));
  } catch (e) {
    if (e instanceof SecretoCronInvalido) return new Response(null, { status: 401 });
    throw e;
  }

  // ── 2. EL CUERPO: SOLO UN IDENTIFICADOR DE NOTIFICACION ───────────────────
  const crudo: unknown = await req.json().catch(() => null);
  const revisado = esquemaPeticion.safeParse(crudo);
  if (!revisado.success) return new Response(null, { status: 400 });
  const notificationId = revisado.data.notification_id;

  // ── 3. LA FABRICA ADMINISTRATIVA ──────────────────────────────────────────
  // No hay alternativa: aqui no hay ningun usuario, y la cola no tiene grant
  // para nadie que sirva en este contexto.
  const admin = createAdminClient();

  // ── 4. EL RECLAMO, QUE ES LA IDEMPOTENCIA ─────────────────────────────────
  // Si no devuelve fila, otra invocacion ya la tomo o ya esta cerrada. Es el
  // caso NORMAL cuando el trigger inmediato y el cron de un minuto se cruzan.
  const n = await reclamarNotificacion(admin, notificationId);
  if (!n) return responder({ notification_id: notificationId, outcome: 'ya_procesada' });

  const intentos = n.push_attempts + 1;

  // ── 5. LAS SUSCRIPCIONES VIVAS DEL DESTINATARIO ───────────────────────────
  // CERO SUSCRIPCIONES NO ES UN NO-OP SILENCIOSO, A PROPOSITO: marcarla
  // `enviado` seria mentir, y esta fila es la que hace visible en el panel de
  // D-03 que un aseo confirmado no le va a sonar a nadie (I6, T-05-26).
  const subs = await leerSuscripcionesVivas(admin, n.recipient_id);
  if (subs.length === 0) {
    await marcarNotificacionDescartada(admin, {
      id: n.id,
      intentos,
      codigo: 'sin_suscripciones',
    });
    return responder({
      notification_id: n.id,
      outcome: 'sin_destino',
      codigo: 'sin_suscripciones',
      suscripciones: 0,
    });
  }

  // ── 6. EL ORIGEN ABSOLUTO ─────────────────────────────────────────────────
  // Sin el no se puede construir un destino de navegacion, y uno inventado
  // manda a la aseadora a otro sitio desde la pantalla de bloqueo. Es
  // configuracion rota: se reintenta y NO se toca ninguna suscripcion.
  const origen = origenDeLaAplicacion();
  if (origen === null) {
    await marcarNotificacionParaReintento(admin, {
      id: n.id,
      intentos,
      esperarMs: esperaDeLaTabla(intentos),
      codigo: 'configuracion_rota',
    });
    return responder({
      notification_id: n.id,
      outcome: 'abortada',
      codigo: 'configuracion_rota',
      suscripciones: subs.length,
    });
  }

  // ── 7. LA CLAVE DE COLAPSO, UNA SOLA VEZ ──────────────────────────────────
  // Es donde D-05 se aplica de verdad: la MISMA clave viaja en la cabecera
  // `Topic` (colapsa en el servidor de push, que es lo que cubre el telefono
  // apagado) y en el campo `tag` del cuerpo (colapsa en la bandeja del
  // dispositivo). Dos claves distintas dejarian las dos capas colapsando
  // distinto, en silencio.
  const clave = claveDeColapso(n);
  const colapsa = esClaveDeTopicValida(clave);
  const tag = colapsa ? clave : undefined;

  // ── 8. EL BUCLE POR SUSCRIPCION ───────────────────────────────────────────
  let entregadas = 0;
  let revocadas = 0;
  let abortada = false;
  let huboReintento = false;
  let esperaMaxima = 0;
  let ultimoCodigo: CodigoDePush | null = null;
  let ultimoStatus: number | undefined;

  for (const sub of subs) {
    // El cuerpo se construye POR SUSCRIPCION porque `soportaDeclarativo` es un
    // dato del dispositivo, no de la notificacion (D-07).
    let payload: string;
    try {
      payload = construirPayload(
        { id: n.id, type: n.type, title: n.title, body: n.body, url: n.url },
        { soportaDeclarativo: sub.soporta_declarativo, origen, tag },
      );
    } catch (e) {
      // Los tres codigos que el constructor puede lanzar son una lista cerrada y
      // no arrastran el cuerpo. Pasarse de tamano es un BUG de este lado y no se
      // reintenta: un cuerpo de mas de 4 KB lo sigue siendo en el quinto intento.
      // Cualquier otro (un origen que no es absoluto, una clave de colapso que
      // no cabe) es configuracion, y esa si se puede arreglar: se reintenta.
      const excedido = e instanceof Error && e.message === 'payload_excede_limite';
      const codigo: CodigoDePush = excedido ? 'payload_excede_limite' : 'configuracion_rota';

      if (excedido) {
        await marcarNotificacionDescartada(admin, { id: n.id, intentos, codigo });
      } else {
        await marcarNotificacionParaReintento(admin, {
          id: n.id,
          intentos,
          esperarMs: esperaDeLaTabla(intentos),
          codigo,
        });
      }
      return responder({
        notification_id: n.id,
        outcome: excedido ? 'descartada' : 'abortada',
        codigo,
        suscripciones: subs.length,
        entregadas,
        revocadas,
      });
    }

    // `enviar()` NO lanza por un fallo del push service: un `410` vuelve como
    // codigo. Lo unico que lanza es la CONFIGURACION de VAPID rota, y eso no
    // hace fallar una suscripcion: las hace fallar TODAS.
    let respuesta: RespuestaDePush;
    try {
      respuesta = await enviar(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        {
          ttl: TTL_SEGUNDOS,
          urgency: urgenciaDe(n.type),
          topic: tag,
          timeoutMs: TIMEOUT_MS,
        },
      );
    } catch {
      // El error original NO se registra: nombra la variable de configuracion.
      abortada = true;
      ultimoCodigo = 'configuracion_rota';
      break;
    }

    ultimoStatus = respuesta.statusCode;
    const decision = decidir(respuesta.statusCode, respuesta.body, respuesta.headers, intentos);

    switch (decision.tipo) {
      case 'entregado':
        entregadas += 1;
        await registrarExitoDeSuscripcion(admin, sub.id);
        break;

      // ── LA RAMA QUE SALVA LA FLOTA ──────────────────────────────────────
      // Se sale del bucle DE INMEDIATO y SIN REVOCAR NADA. Un `403` global por
      // una clave VAPID mal configurada, tratado como si fuera un `410`,
      // borraria las ocho suscripciones de la operacion en una sola corrida, y
      // en iOS no hay `pushsubscriptionchange`: no existe reparacion
      // automatica, hay que reinstalar la PWA en ocho telefonos a mano
      // (T-05-05).
      //
      // Esto REEMPLAZA la guarda de colapso por umbral del `05-RESEARCH.md`
      // §I3, y la desviacion esta escrita en el plan: cada invocacion procesa
      // UNA notificacion contra las suscripciones de UN destinatario, asi que
      // no hay radio de explosion que medir y el umbral seria codigo muerto o
      // se disparia en el caso legitimo (alguien reinstalo).
      case 'abortar_corrida':
        abortada = true;
        ultimoCodigo = decision.motivo;
        break;

      // Las DOS unicas entradas a la revocacion. `desactivar_suscripcion` nace
      // solo de un `404` o un `410`; `requiere_resuscripcion`, de un
      // `403 VapidPkHashMismatch`, y entra con su propio motivo porque la
      // suscripcion no esta muerta, esta DESALINEADA.
      case 'desactivar_suscripcion':
        revocadas += 1;
        ultimoCodigo = decision.motivo;
        await revocarSuscripcion(admin, { id: sub.id, motivo: decision.motivo });
        break;

      case 'requiere_resuscripcion':
        revocadas += 1;
        ultimoCodigo = 'clave_obsoleta';
        await revocarSuscripcion(admin, { id: sub.id, motivo: 'clave_obsoleta' });
        break;

      case 'reintentar':
        huboReintento = true;
        esperaMaxima = Math.max(esperaMaxima, decision.esperarMs);
        ultimoCodigo = decision.motivo;
        await registrarFalloDeSuscripcion(admin, sub.id, sub.failure_count);
        break;

      case 'descartar':
        ultimoCodigo = decision.motivo;
        await registrarFalloDeSuscripcion(admin, sub.id, sub.failure_count);
        break;

      // Defecto de este codigo. La suscripcion NO se toca: no fallo ella.
      case 'bug':
        ultimoCodigo = decision.motivo;
        break;
    }

    if (abortada) break;
  }

  // ── 9. EL ESTADO FINAL DE LA NOTIFICACION, UNA SOLA ESCRITURA ─────────────
  const base = {
    notification_id: n.id,
    suscripciones: subs.length,
    entregadas,
    revocadas,
    ...(ultimoStatus === undefined ? {} : { http_status: ultimoStatus }),
    ...(colapsa ? {} : { colapso: 'omitido' as const }),
  };

  if (abortada) {
    // Vuelve a la cola con backoff. La re-entrega al telefono que si acepto
    // —si lo hubo— la colapsa la cabecera `Topic`, que es exactamente para lo
    // que sirve.
    const codigo = ultimoCodigo ?? 'configuracion_rota';
    await marcarNotificacionParaReintento(admin, {
      id: n.id,
      intentos,
      esperarMs: esperaDeLaTabla(intentos),
      codigo,
    });
    return responder({ ...base, outcome: 'abortada', codigo });
  }

  // AL MENOS UNA ENTREGA ES SUFICIENTE: un aseador con dos telefonos y uno
  // muerto sigue enterado, y marcar la notificacion como fallida por el telefono
  // muerto la haria repetirse en el bueno.
  if (entregadas > 0) {
    await marcarNotificacionEnviada(admin, n.id, intentos);
    return responder({ ...base, outcome: 'enviado' });
  }

  if (huboReintento) {
    // `decidir()` ya dejo de proponer reintentos pasado `TOPE_DE_INTENTOS`, asi
    // que aqui no hace falta un segundo tope: llegar con `reintentar` significa
    // que queda intento. La espera es la MAYOR de las observadas, para no
    // martillear al push service que pidio mas tiempo.
    const codigo = ultimoCodigo ?? 'configuracion_rota';
    await marcarNotificacionParaReintento(admin, {
      id: n.id,
      intentos,
      esperarMs: esperaMaxima > 0 ? esperaMaxima : esperaDeLaTabla(intentos),
      codigo,
    });
    return responder({ ...base, outcome: 'reintento', codigo });
  }

  // Nadie acepto y no queda nada que intentar: todas revocadas, todas bug, o
  // los intentos agotados. `ultimoCodigo` solo puede ser nulo si el bucle no
  // decidio nada, y eso con `subs.length > 0` significa que no habia destino.
  const codigo = ultimoCodigo ?? 'sin_suscripciones';
  await marcarNotificacionDescartada(admin, { id: n.id, intentos, codigo });
  return responder({ ...base, outcome: 'descartada', codigo });
}
