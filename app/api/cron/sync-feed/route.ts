import 'server-only';

import { createHash } from 'node:crypto';

import { z } from 'zod';

import {
  aplicarSync,
  codigoHttp,
  registrarCorridaSinTrabajo,
  registrarFalloDeSync,
  type CodigoDeFallo,
  type ConteosDeCorrida,
  type OutcomeDeCorrida,
} from '@/lib/data/sync';
import { evaluarLectura } from '@/lib/domain/ical-guardas';
import { esquemaUrlIcal } from '@/lib/domain/ical-url.schema';
import { createAdminClient } from '@/lib/supabase/admin';

import { exigirSecretoCron, SecretoCronInvalido } from './_guard';

/**
 * EL WORKER: una invocacion HTTP por feed, disparada por `pg_cron` + `pg_net`.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESTA ES LA UNICA PIEZA DEL SISTEMA QUE HABLA CON EL EXTERIOR, Y ES EL BLANCO
 * DE MAS VALOR QUE HAY.
 *
 * Es publica en internet, la autentica un SECRETO COMPARTIDO y no una cookie:
 * no hay usuario, no hay sesion y no hay RLS. Construye la fabrica
 * administrativa, que salta la RLS por completo, y hace un `fetch` sobre una
 * direccion que escribio un admin. Los guardarrailes de CI lo tratan en
 * consecuencia y este archivo se escribe para satisfacerlos, no a pesar de ellos.
 *
 * ORDEN OBLIGADO DENTRO DEL CUERPO DE `POST`, Y NO ES OPCIONAL:
 *
 *     guard  →  fabrica administrativa  →  nombrar la tabla de secretos
 *
 * Los guardarrailes 7 y 8 de `scripts/ci/check-service-role.sh` lo exigen a la
 * vez, se satisfacen los dos con ese orden y SOLO con ese. Invertir las dos
 * primeras deja el cliente privilegiado construido antes de saber quien
 * pregunta; invertir las dos ultimas nombra la tabla de credenciales sin la
 * unica ruta que la base permite alcanzarla.
 *
 * `export async function POST`, NO `export const POST = ...`. El recorrido del
 * guardarrail 7 tambien reconoce ya la forma de constante (lo amplio el plan
 * 03-01), pero la forma de declaracion es la que estaba medida y la que el
 * comentario del script exige; escribirla asi cuesta cero y no depende de que
 * ese segundo patron siga ahi.
 *
 * SIN `GET`, Y SIN NINGUN OTRO METODO. Un endpoint que MUTA y responde a `GET`
 * es alcanzable por un prefetch del navegador, por un crawler o por el propio
 * prefetch de Next. Los metodos no exportados devuelven 405 solos.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── QUE NO SALE DE AQUI, NUNCA ──────────────────────────────────────────────
 *
 *   · EL CUERPO DEL FEED. El `DESCRIPTION` de cada evento reservado trae los
 *     ultimos cuatro digitos del telefono del huesped. La tentacion concreta es
 *     registrar el cuerpo crudo cuando el parseo falla, que es exactamente el
 *     caso en el que mas se querria verlo. No se hace.
 *   · LA DIRECCION DEL FEED. Es una credencial: un GET a ella revela la
 *     ocupacion completa del apartamento sin autenticarse (T-02-73). No se
 *     registra, no viaja a `last_error` —`registrarFalloDeSync` ni siquiera la
 *     acepta en su firma— y no vuelve en la respuesta. Si alguna vez hiciera
 *     falta para depurar, `enmascararUrlIcal()` de `lib/domain/ical-url.schema.ts`
 *     es la unica forma permitida.
 *   · EL MENSAJE DE UN ERROR DE RED O DE POSTGRES. Puede arrastrar la direccion
 *     entera. Lo que se registra es un codigo de una union cerrada.
 *
 * Lo unico que se registra es: `feed_id`, contadores, status HTTP y un codigo.
 * La garantia no es la disciplina: es el tipo `LineaDeLog`, que no tiene ranura
 * donde poner ninguna de las tres cosas de arriba.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 60 s, con `AbortSignal.timeout(15_000)` dentro. El margen es para el RPC y
 * para el registro de salud: un feed lento tiene que fallar por el timeout
 * CONTROLADO del fetch y no por el corte de la plataforma, que no deja rastro.
 *
 * Va en un `route.ts` y no en un archivo de acciones de servidor: un archivo con
 * la directiva de Server Action solo puede exportar funciones async y el build
 * de Next 15.5 se cae con un `export const` dentro (medido en el plan 02-14).
 * Aqui es configuracion de segmento legitima.
 */
export const maxDuration = 60;

/** El header por el que viaja el secreto compartido. */
const HEADER_SECRETO = 'x-cron-secret';

/** Quince segundos. Ver `maxDuration`. */
const TIMEOUT_MS = 15_000;

/**
 * Techo de cuerpo, 5 MiB. Un `.ics` de un apartamento con un ano de reservas
 * pesa decenas de KB, asi que sobra por dos ordenes de magnitud. El techo existe
 * porque `AbortSignal` cubre la LENTITUD, no el TAMANO: un servidor hostil puede
 * mandar un cuerpo interminable a toda velocidad y `res.text()` lo acumularia
 * entero en memoria.
 */
const MAX_BYTES = 5 * 1024 * 1024;

/** Lo unico que entra por el cuerpo de la peticion. Nada mas. */
const esquemaPeticion = z.object({ feed_id: z.uuid() });

/**
 * La UNICA forma de escribir en el log desde este archivo.
 *
 * NO TIENE RANURA PARA EL CUERPO, NI PARA LA DIRECCION DEL FEED, NI PARA EL
 * `DESCRIPTION`. Igual que `EventoNormalizado` en el normalizador: la garantia
 * de privacidad es el tipo, no la revision. Meter el cuerpo en un log tiene que
 * ser un error de compilacion.
 */
type LineaDeLog = {
  feed_id: string;
  outcome: OutcomeDeCorrida;
  codigo?: CodigoDeFallo;
  http_status?: number | null;
  event_count?: number;
  reservation_count?: number;
  block_count?: number;
  unknown_count?: number;
};

function registrar(linea: LineaDeLog): void {
  console.info(JSON.stringify({ worker: 'sync-feed', ...linea }));
}

/** La respuesta hacia `pg_net`, que es fire-and-forget y nadie la lee. */
function responder(linea: LineaDeLog): Response {
  registrar(linea);
  return Response.json(linea, { status: 200 });
}

/**
 * Lee el cuerpo por el LECTOR DEL STREAM, con presupuesto de bytes.
 *
 * No con `res.text()`: asi el techo se aplica DURANTE la descarga y no despues
 * de haberla acumulado entera, que es justo lo que se quiere evitar. Cuando se
 * pasa, se cancela el lector y se avisa; el cuerpo parcial se descarta sin
 * mirarlo.
 */
async function leerCuerpoAcotado(res: Response): Promise<{ cuerpo: string; excedido: boolean }> {
  const flujo = res.body;
  if (!flujo) return { cuerpo: '', excedido: false };

  const lector = flujo.getReader();
  const trozos: Uint8Array[] = [];
  let bytes = 0;
  let excedido = false;

  try {
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      if (!value) continue;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) {
        excedido = true;
        await lector.cancel();
        break;
      }
      trozos.push(value);
    }
  } finally {
    lector.releaseLock();
  }

  if (excedido) return { cuerpo: '', excedido: true };
  return { cuerpo: new TextDecoder('utf-8').decode(Buffer.concat(trozos)), excedido: false };
}

/**
 * Sincroniza UN feed.
 *
 * Ninguna de las guardas de abajo es decorativa: cada una es un camino por el
 * que una lectura degradada llegaria al RPC, y el RPC se creeria lo que le
 * cuenten. Un `304`, un cuerpo truncado o un feed que dejo de clasificar NO
 * pueden llamar a `sync_feed_apply()`, porque `disappeared_at` solo lo toca esa
 * funcion y solo debe tocarlo cuando hubo un cuerpo real que diffear.
 */
export async function POST(req: Request): Promise<Response> {
  // ── 1. EL GUARD, ANTES DE NADA ────────────────────────────────────────────
  // 401 SIN CUERPO: distinguir "no mandaste header" de "el secreto no coincide"
  // es informacion gratis para quien sondea el endpoint.
  try {
    exigirSecretoCron(req.headers.get(HEADER_SECRETO));
  } catch (e) {
    if (e instanceof SecretoCronInvalido) return new Response(null, { status: 401 });
    throw e;
  }

  // ── 2. EL CUERPO: SOLO UN IDENTIFICADOR DE FEED ───────────────────────────
  const crudo: unknown = await req.json().catch(() => null);
  const revisado = esquemaPeticion.safeParse(crudo);
  if (!revisado.success) return new Response(null, { status: 400 });
  const feedId = revisado.data.feed_id;

  // ── 3. LA FABRICA ADMINISTRATIVA ──────────────────────────────────────────
  // No hay alternativa: la tabla de secretos no tiene grant para `authenticated`
  // y aqui, ademas, no hay ningun usuario.
  const admin = createAdminClient();

  // ── 4. RECIEN AHORA, LA TABLA DE CREDENCIALES ─────────────────────────────
  // La direccion vive en `property_secrets.ical_url` y `calendar_feeds` NO tiene
  // columna de direccion: es una decision bloqueada de la Fase 1 y el
  // guardarrail 8 la vigila. Se llega por el apartamento, que es lo que las dos
  // tablas comparten.
  const { data: feed } = await admin
    .from('calendar_feeds')
    .select(
      'id, property_id, is_active, last_etag, last_payload_hash, last_event_count, consecutive_failures, properties!inner(property_secrets(ical_url))',
    )
    .eq('id', feedId)
    .maybeSingle();

  if (!feed) return new Response(null, { status: 404 });

  const fallosPrevios = feed.consecutive_failures;
  // `last_event_count` guarda RESERVAS, no eventos (decision del plan 02-14).
  // Es el operando de la guarda de colapso y por eso la comparacion de mas
  // abajo es homogenea. NO renombrar ni redefinir esa columna.
  const reservasAnteriores = feed.last_event_count ?? 0;

  if (!feed.is_active) {
    return responder({ feed_id: feedId, outcome: 'no_modificado', http_status: null });
  }

  // ── 5. LA DIRECCION, REVALIDADA CONTRA LA ALLOWLIST ───────────────────────
  // La escribio un admin y salio de la base, pero revalidar cuesta cero y cierra
  // el caso "alguien edito la fila por SQL". Es la PRIMERA mitad de la defensa
  // anti-SSRF; la segunda es `redirect: 'manual'` de abajo y ninguna sobra.
  const destino = esquemaUrlIcal.safeParse(feed.properties.property_secrets?.ical_url ?? '');
  if (!destino.success) {
    await registrarFalloDeSync(admin, {
      feedId,
      outcome: 'error',
      codigo: 'destino_no_permitido',
      httpStatus: null,
      fallosPrevios,
    });
    return responder({
      feed_id: feedId,
      outcome: 'error',
      codigo: 'destino_no_permitido',
      http_status: null,
    });
  }

  // ── 6. EL FETCH, CON SUS CUATRO PROTECCIONES ──────────────────────────────
  const fetchedAt = new Date().toISOString();
  let res: Response;
  try {
    res = await fetch(destino.data, {
      // Aborta la conexion de verdad. Un `Promise.race` con un temporizador
      // resuelve la promesa y deja el socket colgando.
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // SEGUNDA MITAD OBLIGATORIA DE LA DEFENSA ANTI-SSRF. Sin esto, la
      // allowlist de host se evade con un 302 hacia una direccion interna:
      // valida lo que el admin ESCRIBIO, no a donde TERMINA la peticion.
      // Medido y con test en el plan 02-14.
      redirect: 'manual',
      headers: feed.last_etag
        ? { Accept: 'text/calendar', 'If-None-Match': feed.last_etag }
        : { Accept: 'text/calendar' },
      cache: 'no-store',
    });
  } catch (e) {
    // El error original NO se registra: su mensaje puede llevar la direccion
    // entera del feed.
    const nombre = e instanceof Error ? e.name : '';
    const codigo: CodigoDeFallo =
      nombre === 'TimeoutError' || nombre === 'AbortError' ? 'timeout' : 'red';
    await registrarFalloDeSync(admin, {
      feedId,
      outcome: 'transporte',
      codigo,
      httpStatus: null,
      fallosPrevios,
    });
    return responder({ feed_id: feedId, outcome: 'transporte', codigo, http_status: null });
  }

  // ── 7. LAS GUARDAS, EN ORDEN, Y NINGUNA LLAMA AL RPC ──────────────────────

  // 304: EXITO CON CERO TRABAJO, y sobre todo CERO llamadas al RPC. No se
  // observo ninguna reserva, asi que no se puede concluir la ausencia de nada.
  // Hacer avanzar el contador de ausencias con un 304 cancelaria aseos justo
  // cuando el proveedor esta mas estable.
  if (res.status === 304) {
    await registrarCorridaSinTrabajo(admin, {
      feedId,
      outcome: 'no_modificado',
      httpStatus: 304,
    });
    return responder({ feed_id: feedId, outcome: 'no_modificado', http_status: 304 });
  }

  // Con `redirect: 'manual'` el 3xx llega aqui como respuesta con su status y no
  // se sigue. Se distingue del resto de no-2xx porque su causa es otra.
  if (res.status >= 300 && res.status < 400) {
    await registrarFalloDeSync(admin, {
      feedId,
      outcome: 'transporte',
      codigo: 'redirect_bloqueado',
      httpStatus: res.status,
      fallosPrevios,
    });
    return responder({
      feed_id: feedId,
      outcome: 'transporte',
      codigo: 'redirect_bloqueado',
      http_status: res.status,
    });
  }

  if (!res.ok) {
    const codigo = codigoHttp(res.status);
    await registrarFalloDeSync(admin, {
      feedId,
      outcome: 'transporte',
      codigo,
      httpStatus: res.status,
      fallosPrevios,
    });
    return responder({
      feed_id: feedId,
      outcome: 'transporte',
      codigo,
      http_status: res.status,
    });
  }

  const { cuerpo, excedido } = await leerCuerpoAcotado(res);

  if (excedido) {
    await registrarFalloDeSync(admin, {
      feedId,
      outcome: 'transporte',
      codigo: 'cuerpo_excede_5mib',
      httpStatus: res.status,
      fallosPrevios,
    });
    return responder({
      feed_id: feedId,
      outcome: 'transporte',
      codigo: 'cuerpo_excede_5mib',
      http_status: res.status,
    });
  }

  // ── 8. EL MISMO CUERPO QUE LA CORRIDA ANTERIOR ────────────────────────────
  // Airbnb reemite identico cada ~3 h. Cortar aqui ahorra el diff entero.
  //
  // PERO EL HASH SOLO CORTA SI YA HUBO UN DIFF DE VERDAD, Y ESO NO ES
  // PARANOIA: `guardarFeed` del plan 02-14 escribe `last_payload_hash` al
  // CONECTAR el calendario, sin haber llamado nunca al RPC. Sin esta segunda
  // condicion, un apartamento recien conectado veria su primer sync cortado por
  // el hash y NO GENERARIA NI UN ASEO hasta que el proveedor cambiara el cuerpo.
  const payloadHash = createHash('sha256').update(cuerpo).digest('hex');

  if (payloadHash === feed.last_payload_hash) {
    const { count } = await admin
      .from('feed_sync_runs')
      .select('id', { count: 'exact', head: true })
      .eq('feed_id', feedId)
      .eq('outcome', 'ok');

    if ((count ?? 0) > 0) {
      await registrarCorridaSinTrabajo(admin, {
        feedId,
        outcome: 'sin_cambios',
        httpStatus: res.status,
        etag: res.headers.get('etag'),
      });
      return responder({
        feed_id: feedId,
        outcome: 'sin_cambios',
        http_status: res.status,
      });
    }
  }

  // ── 9. LAS GUARDAS SOBRE EL CUERPO, INCLUIDA LA DE COLAPSO ────────────────
  // Viven en `lib/domain/ical-guardas.ts` porque ahi son medibles: dentro de
  // este handler haria falta red, base y secreto para ejercitarlas, y el senuelo
  // que demuestra que la guarda de colapso mira RESERVAS CLASIFICADAS y no
  // eventos quedaria sin comprobar. Ver el encabezado de ese archivo.
  const lectura = evaluarLectura({
    contentType: res.headers.get('content-type'),
    cuerpo,
    reservasAnteriores,
  });

  if (!lectura.usable) {
    const esColapso = lectura.motivo === 'cero_reservas_clasificadas';
    const outcome: OutcomeDeCorrida = esColapso ? 'colapso' : 'transporte';
    const conteos: ConteosDeCorrida | undefined = lectura.conteos ?? undefined;

    await registrarFalloDeSync(admin, {
      feedId,
      outcome,
      codigo: lectura.motivo,
      httpStatus: res.status,
      fallosPrevios,
      conteos,
    });
    return responder({
      feed_id: feedId,
      outcome,
      codigo: lectura.motivo,
      http_status: res.status,
      ...conteos,
    });
  }

  // ── 10. UNA SOLA LLAMADA AL RPC, CON TODO DENTRO DE UNA TRANSACCION ───────
  // Los eventos van TAL CUAL: bloqueos y desconocidos incluidos, porque el RPC
  // los necesita para contarlos y esos contadores son la telemetria que hace
  // visible el colapso la proxima vez.
  const { resultado, error } = await aplicarSync(admin, {
    feedId,
    eventos: lectura.eventos,
    fetchedAt,
    etag: res.headers.get('etag'),
    payloadHash,
    httpStatus: res.status,
  });

  if (error || !resultado) {
    // NADA quedo escrito, ni siquiera la salud: es una transaccion. Por eso hace
    // falta esta segunda llamada, corta, para registrar el fallo.
    //
    // Y SI ESTA TAMBIEN FALLA NO HAY LOGICA COMPENSATORIA, A PROPOSITO: el feed
    // se queda con su marca de reclamado y el lease de diez minutos lo devuelve
    // a la cola solo. El sistema converge sin codigo de compensacion, y eso es
    // exactamente lo que justifica no escribirlo.
    await registrarFalloDeSync(admin, {
      feedId,
      outcome: 'error',
      codigo: 'rpc_fallido',
      httpStatus: res.status,
      fallosPrevios,
      conteos: lectura.conteos,
    });
    return responder({
      feed_id: feedId,
      outcome: 'error',
      codigo: 'rpc_fallido',
      http_status: res.status,
      ...lectura.conteos,
    });
  }

  // La salud del exito la escribio el RPC DENTRO de su transaccion. Si estuviera
  // aqui, un worker que muriera en este punto dejaria el feed diffeado con su
  // marca de exito vieja y el watchdog alertaria de un feed sano.
  return responder({
    feed_id: feedId,
    outcome: 'ok',
    http_status: res.status,
    event_count: resultado.event_count,
    reservation_count: resultado.reservation_count,
    block_count: resultado.block_count,
    unknown_count: resultado.unknown_count,
  });
}
