import { execFileSync } from 'node:child_process';
import {
  createDecipheriv,
  createECDH,
  createHmac,
  randomBytes,
  randomUUID,
  type ECDH,
} from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import https, { createServer, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { POST } from '@/app/api/push/drain/route';
import type { Database } from '@/lib/database.types';

import { clienteAdminDePruebas, type ClienteVivaGuest } from './clientes';

/**
 * ARNÉS DEL PUSH SERVICE FALSO: SIEMBRA, RESPUESTAS HOSTILES A DEMANDA Y CORRIDA
 * DEL WORKER DE DRENAJE.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * VIVE EN `lib/test/` A PROPÓSITO, Y ESA UBICACIÓN ES LA EXCEPCIÓN.
 *
 * `scripts/ci/check-service-role.sh` exceptúa `lib/test/` en los guardarraíles
 * 5, 7 y 8: aquí se importa la fábrica administrativa sin ningún guard, a
 * propósito. La razón es la de siempre y no ha cambiado: un test que siembra con
 * el MISMO cliente con el que comprueba pasa aunque la policy esté mal escrita.
 * La excepción es de directorio y es deliberadamente estrecha; nada bajo `app/`
 * importa este archivo, así que nunca entra al bundle de producción y
 * `npm run build` lo confirma al no incluirlo en ningún chunk.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── EL SERVIDOR FALSO TIENE QUE HABLAR TLS, Y ESO ESTÁ MEDIDO ───────────────
 *
 * La pregunta que el plan mandaba comprobar antes de escribir nada era si
 * `web-push` acepta un endpoint `http://` local. **NO LO ACEPTA.** La razón está
 * en su propio código: `web-push-lib.js` hace `const https = require('https')` y
 * después `https.request(httpsOptions)` SIEMPRE, sin mirar el esquema del
 * endpoint. El esquema solo decide el `audience` del JWT de VAPID.
 *
 * Medido, no deducido. Sonda contra un `node:http` local con un endpoint
 * `http://127.0.0.1:<puerto>/push/abc`:
 *
 *     ERR code= EPROTO msg= write EPROTO …
 *     error:0A00010B:SSL routines:tls_validate_record_header:
 *     wrong version number
 *
 * El servidor no registró NI UNA petición: el fallo ocurre en el apretón de
 * manos. Un arnés montado sobre `http://` mediría siempre "fallo de transporte"
 * y jamás llegaría a la tabla de decisión de `lib/push/errores.ts`, que es
 * exactamente lo que esta suite viene a probar.
 *
 * De ahí la salida que el plan anticipa: servidor `node:https` con certificado
 * autofirmado, y un AGENTE PROPIO que confía en ESE certificado, instalado como
 * agente por defecto del proceso de prueba mientras el falso está levantado y
 * restaurado al cerrarlo.
 *
 *     LA VERIFICACIÓN DE TLS NO SE DESACTIVA. NUNCA. (T-05-29)
 *
 * Ni `rejectUnauthorized: false`, ni `NODE_TLS_REJECT_UNAUTHORIZED`, ni
 * `NODE_EXTRA_CA_CERTS`. Lo que se hace es AÑADIR una autoridad de confianza —el
 * certificado que este proceso acaba de generar— a un agente que sigue
 * validando cadena y identidad. El certificado lleva `subjectAltName=IP:127.0.0.1`
 * justamente porque sin ese SAN la comprobación de identidad de Node falla, que
 * es la prueba de que la comprobación sigue activa.
 *
 * El certificado se genera EN CALIENTE con `openssl` en un directorio temporal y
 * se borra al cerrar. No hay ninguna clave privada versionada en el repo, y no
 * puede haberla: un `key.pem` commiteado es un hallazgo de seguridad aunque solo
 * sirva para pruebas, porque nadie que lo encuentre después sabe que solo sirve
 * para pruebas.
 *
 * ── UN SOLO SERVIDOR, LA RUTA COMO DISCRIMINADOR ────────────────────────────
 *
 * `lib/test/sync.ts` levanta un servidor POR FEED porque la dirección del feed
 * es una credencial que tiene que estar persistida antes de la primera corrida.
 * Aquí el reparto es distinto: el destino de una suscripción también hay que
 * persistirlo antes, pero todas las suscripciones de una corrida tienen que
 * poder responder cosas distintas A LA VEZ (el caso `403` siembra dos y las dos
 * contestan). Un solo servidor con `/push/<id>` de discriminador da eso y además
 * hace trivial el contador de peticiones TOTALES, que es con lo que se mide la
 * idempotencia.
 *
 * ── LO QUE ESTE ARNÉS **NO** HACE ──────────────────────────────────────────
 *
 * No siembra aseadores, ni apartamentos, ni aseos. Eso es `lib/test/aseos.ts` y
 * se COMPONE con él, igual que `aseos-admin.integration.test.ts` compone el de
 * sync. Un segundo sitio que sepa sembrar usuarios es el sitio donde los dos se
 * desincronizan, y el que se queda atrás lo hace en silencio.
 *
 * ── EL ORDEN DE BORRADO ────────────────────────────────────────────────────
 *
 * `push_subscriptions` y `notifications` cuelgan de `profiles` con `cascade`, así
 * que borrar al usuario se las lleva. `limpiarPush()` va igualmente ANTES de
 * `limpiarAseos()` y borra POR ID: el stack local es UNO solo y compartido entre
 * worktrees, y un `delete` sobre la tabla entera se lleva por delante la semilla
 * de desarrollo y los datos del archivo siguiente de la suite.
 */

// ───────────────────────────────────────────────────────────────────────────
// El certificado, en caliente
// ───────────────────────────────────────────────────────────────────────────

type Certificado = { clave: string; publico: string; directorio: string };

/**
 * Genera un par autofirmado válido para `127.0.0.1`.
 *
 * `-addext subjectAltName=IP:127.0.0.1` NO es opcional: Node valida la identidad
 * del servidor contra los SAN, y un certificado con solo `CN` produce
 * `ERR_TLS_CERT_ALTNAME_INVALID`. Que haga falta es la evidencia de que la
 * verificación sigue encendida.
 */
function generarCertificado(): Certificado {
  const directorio = mkdtempSync(join(tmpdir(), 'vivaguest-push-falso-'));
  const rutaClave = join(directorio, 'key.pem');
  const rutaPublico = join(directorio, 'cert.pem');

  try {
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        rutaClave,
        '-out',
        rutaPublico,
        '-days',
        '1',
        '-subj',
        '/CN=127.0.0.1',
        '-addext',
        'subjectAltName=IP:127.0.0.1',
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
  } catch (e) {
    rmSync(directorio, { recursive: true, force: true });
    throw new Error(
      'No se pudo generar el certificado del push service falso con `openssl`.\n' +
        'Esta suite lo necesita porque `web-push` habla TLS siempre (ver la cabecera ' +
        'de lib/test/push.ts).\n' +
        `Detalle: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  return {
    clave: readFileSync(rutaClave, 'utf8'),
    publico: readFileSync(rutaPublico, 'utf8'),
    directorio,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// El servidor falso
// ───────────────────────────────────────────────────────────────────────────

/** Lo que el falso va a contestar. Por defecto, `201` sin cuerpo. */
export type RespuestaDePushFalso = {
  status?: number;
  body?: string;
  headers?: Record<string, string>;
};

type PeticionRecibida = {
  /** El cuerpo CIFRADO, tal cual llegó. */
  cuerpo: Buffer;
  /** Las cabeceras, en minúsculas. `TTL`, `Urgency`, `Topic`, `Authorization`. */
  cabeceras: Record<string, string>;
};

type EstadoDeDestino = {
  /** Cuántas peticiones recibió ESTE destino. Es lo que delata un envío que no ocurrió. */
  hits: number;
  respuesta: RespuestaDePushFalso;
  peticiones: PeticionRecibida[];
  /**
   * La clave privada del "dispositivo". Se guarda para poder DESCIFRAR el cuerpo
   * y afirmar sobre su contenido, que es lo que hace medible D-07.
   */
  ecdh: ECDH;
  /** El secreto de autenticación de la suscripción, en crudo. */
  authSecret: Buffer;
  /** El id de la fila de `push_subscriptions`. */
  subscriptionId: string;
};

const destinos = new Map<string, EstadoDeDestino>();
const notificacionesSembradas: string[] = [];

let servidor: Server | null = null;
let certificado: Certificado | null = null;
let base: string | null = null;
let agenteAnterior: https.Agent | null = null;
let agentePropio: https.Agent | null = null;
/** Peticiones a TODOS los destinos. Con esto se mide la idempotencia. */
let hitsTotales = 0;

/** Arranca el push service falso en un puerto efímero. Se cierra en `afterAll`. */
export async function levantarPushFalso(): Promise<{ url: string; cerrar(): Promise<void> }> {
  if (servidor) throw new Error('El push service falso ya está levantado.');

  certificado = generarCertificado();

  const s = createServer({ key: certificado.clave, cert: certificado.publico }, (req, res) => {
    const trozos: Buffer[] = [];
    req.on('data', (c: Buffer) => trozos.push(c));
    req.on('end', () => {
      const ruta = (req.url ?? '').replace(/^\/push\//, '');
      const estado = destinos.get(ruta);

      hitsTotales += 1;

      if (!estado) {
        // Un destino que este arnés no sembró. NO se responde 201 en silencio:
        // sería un envío a ninguna parte contado como entregado.
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ reason: 'UnknownDestination' }));
        return;
      }

      const cabeceras: Record<string, string> = {};
      for (const [nombre, valor] of Object.entries(req.headers)) {
        if (typeof valor === 'string') cabeceras[nombre.toLowerCase()] = valor;
      }

      estado.hits += 1;
      estado.peticiones.push({ cuerpo: Buffer.concat(trozos), cabeceras });

      const r = estado.respuesta;
      res.writeHead(r.status ?? 201, r.headers ?? {});
      res.end(r.body);
    });
  });

  await new Promise<void>((listo) => s.listen(0, '127.0.0.1', listo));
  const puerto = (s.address() as AddressInfo).port;
  servidor = s;
  base = `https://127.0.0.1:${puerto}`;

  // EL AGENTE PROPIO. Ver la cabecera del módulo: se AÑADE una autoridad de
  // confianza, no se apaga la verificación.
  agenteAnterior = https.globalAgent;
  agentePropio = new https.Agent({ ca: certificado.publico });
  https.globalAgent = agentePropio;

  // La asignación de arriba depende de que el import por defecto de un módulo
  // nativo sea el objeto de módulo de verdad. Si algún día deja de serlo, el
  // síntoma sería un error de TLS incomprensible en cada test; esto lo convierte
  // en un fallo que dice qué pasó.
  if (https.globalAgent !== agentePropio) {
    throw new Error(
      'No se pudo instalar el agente propio como agente por defecto: `web-push` no ' +
        'confiaría en el certificado del falso y todo envío fallaría en el apretón de manos.',
    );
  }

  return { url: base, cerrar: cerrarPushFalso };
}

async function cerrarPushFalso(): Promise<void> {
  if (agenteAnterior) {
    https.globalAgent = agenteAnterior;
    agenteAnterior = null;
  }
  agentePropio?.destroy();
  agentePropio = null;

  if (servidor) {
    const s = servidor;
    servidor = null;
    await new Promise<void>((listo) => s.close(() => listo()));
  }

  if (certificado) {
    rmSync(certificado.directorio, { recursive: true, force: true });
    certificado = null;
  }

  base = null;
  destinos.clear();
  hitsTotales = 0;
}

// ───────────────────────────────────────────────────────────────────────────
// Siembra de suscripciones
// ───────────────────────────────────────────────────────────────────────────

export type OpcionesDeSuscripcion = {
  /** El aseador (o admin) al que apunta la suscripción. */
  userId: string;
  /** La rama de D-07 que el test va a ejercitar. Por defecto `false`. */
  soportaDeclarativo?: boolean;
};

export type SuscripcionSembrada = {
  /** El id de la fila de `push_subscriptions`. */
  id: string;
  /**
   * El segmento de la ruta que identifica el destino en el falso. Es lo que se
   * pasa a `programarRespuesta()` y a `peticionesDe()`.
   *
   * NO se devuelve el endpoint completo, y es la misma regla que `sembrarFeed()`
   * aplica a la URL del feed: el endpoint es una CREDENCIAL DE ENVÍO (T-05-04) y
   * reexportarlo desde el arnés sería invitar a que un spec lo interpole en un
   * mensaje de aserción, que es un log y los logs son para siempre.
   */
  destino: string;
};

/**
 * Inserta una suscripción viva apuntando al falso.
 *
 * ── LAS CLAVES SON CRIPTOGRÁFICAMENTE VÁLIDAS, Y NO ES UN LUJO ─────────────
 *
 * `web-push` CIFRA el cuerpo con `p256dh` y `auth` antes de abrir el socket
 * (RFC 8291). Una cadena de relleno revienta dentro de `generateRequestDetails`,
 * la promesa se rechaza sin código HTTP, `enviar()` devuelve `statusCode: 0` y el
 * servidor falso no recibe NADA. Es un rojo que no dice nada y que además
 * atraviesa todos los casos por igual: con claves inválidas, el test del `410` y
 * el del `429` fallarían idénticos.
 *
 * Se generan con `node:crypto` a secas —`createECDH('prime256v1')` para el punto
 * público sin comprimir de 65 bytes, y `randomBytes(16)` para el secreto de
 * autenticación— y NO con `web-push`: su `generateVAPIDKeys()` produce el par del
 * SERVIDOR, que es otra cosa y no encaja en estas dos columnas.
 *
 * La privada se queda en memoria del arnés, indexada por destino, para poder
 * DESCIFRAR lo que reciba el falso. Ver `cuerpoDescifradoDe()`.
 */
export async function sembrarSuscripcion(
  opciones: OpcionesDeSuscripcion,
): Promise<SuscripcionSembrada> {
  if (!base) throw new Error('Hay que llamar a `levantarPushFalso()` antes de sembrar.');

  const admin: ClienteVivaGuest = clienteAdminDePruebas();
  const destino = randomUUID().slice(0, 8);

  const ecdh = createECDH('prime256v1');
  const p256dh = ecdh.generateKeys();
  const authSecret = randomBytes(16);

  const { data, error } = await admin
    .from('push_subscriptions')
    .insert({
      user_id: opciones.userId,
      endpoint: `${base}/push/${destino}`,
      p256dh: p256dh.toString('base64url'),
      auth: authSecret.toString('base64url'),
      soporta_declarativo: opciones.soportaDeclarativo ?? false,
      user_agent: 'VivaGuest Integration Suite',
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`No se pudo sembrar la suscripción: ${error?.message}`);
  }

  destinos.set(destino, {
    hits: 0,
    respuesta: {},
    peticiones: [],
    ecdh,
    authSecret,
    subscriptionId: data.id,
  });

  return { id: data.id, destino };
}

/**
 * Lo que el falso va a devolver a ese destino a partir de ahora.
 *
 * PERSISTE hasta que se vuelva a programar, y eso es deliberado: el caso del
 * `403` necesita que las DOS suscripciones de la corrida contesten lo mismo, y el
 * del `410` necesita que la respuesta siga en pie en la segunda corrida para que
 * "el contador no sube" signifique "no se intentó" y no "se intentó y le fue
 * bien".
 */
export function programarRespuesta(destino: string, respuesta: RespuestaDePushFalso): void {
  const estado = destinos.get(destino);
  if (!estado) throw new Error(`El destino ${destino} no lo sembró este arnés.`);
  estado.respuesta = respuesta;
}

/** Peticiones que recibió ESE destino: cuántas, con qué cabeceras y qué cuerpo. */
export function peticionesDe(destino: string): { hits: number; peticiones: PeticionRecibida[] } {
  const estado = destinos.get(destino);
  if (!estado) throw new Error(`El destino ${destino} no lo sembró este arnés.`);
  return { hits: estado.hits, peticiones: [...estado.peticiones] };
}

// ───────────────────────────────────────────────────────────────────────────
// El descifrado del cuerpo — lo que hace medible D-07
// ───────────────────────────────────────────────────────────────────────────

function hmacSha256(clave: Buffer, datos: Buffer): Buffer {
  return createHmac('sha256', clave).update(datos).digest();
}

/** HKDF de RFC 5869 con una sola ronda, que es todo lo que pide RFC 8188. */
function hkdf(sal: Buffer, ikm: Buffer, info: Buffer, largo: number): Buffer {
  const prk = hmacSha256(sal, ikm);
  return hmacSha256(prk, Buffer.concat([info, Buffer.of(1)])).subarray(0, largo);
}

/**
 * Descifra el cuerpo `aes128gcm` que recibió el falso.
 *
 * ── POR QUÉ SE DESCIFRA DE VERDAD EN VEZ DE MEDIR LA LONGITUD ──────────────
 *
 * El plan aceptaba como alternativa afirmar sobre la LONGITUD del cuerpo
 * cifrado, que difiere de forma estable entre las dos ramas de D-07. Se descartó
 * porque una longitud distinta no prueba que la rama declarativa lleve la clave
 * mágica: prueba que el JSON es más largo, y lo sería igual si la envoltura
 * estuviera mal formada. Descifrar cuesta veinticinco líneas de `node:crypto` y
 * convierte la aserción en la que el contrato pide de verdad.
 *
 * Se implementa con `node:crypto` a secas y NO importando `http_ece`, que es una
 * dependencia TRANSITIVA de `web-push`: depender del árbol interno de otro
 * paquete es una rotura silenciosa el día que ese paquete cambie de librería.
 *
 * El formato es RFC 8188 §2.1 más la derivación de RFC 8291 §3.4:
 *
 *     cuerpo = sal(16) ‖ rs(4) ‖ idlen(1) ‖ clave_pública_emisor(65) ‖ cifrado
 *
 * Un solo registro, porque el payload de esta fase no llega ni a 4 KB.
 */
export function cuerpoDescifradoDe(destino: string, indice = 0): string {
  const estado = destinos.get(destino);
  if (!estado) throw new Error(`El destino ${destino} no lo sembró este arnés.`);

  const peticion = estado.peticiones[indice];
  if (!peticion) {
    throw new Error(`El destino ${destino} no recibió una petición en la posición ${indice}.`);
  }

  const cuerpo = peticion.cuerpo;
  const sal = cuerpo.subarray(0, 16);
  const largoDelId = cuerpo.readUInt8(20);
  const publicoDelEmisor = cuerpo.subarray(21, 21 + largoDelId);
  const cifrado = cuerpo.subarray(21 + largoDelId);

  const publicoDelDispositivo = estado.ecdh.getPublicKey();
  const compartido = estado.ecdh.computeSecret(publicoDelEmisor);

  const ikm = hkdf(
    estado.authSecret,
    compartido,
    Buffer.concat([
      Buffer.from('WebPush: info\0', 'utf8'),
      publicoDelDispositivo,
      publicoDelEmisor,
    ]),
    32,
  );
  const cek = hkdf(sal, ikm, Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), 16);
  const nonce = hkdf(sal, ikm, Buffer.from('Content-Encoding: nonce\0', 'utf8'), 12);

  const etiqueta = cifrado.subarray(cifrado.length - 16);
  const descifrador = createDecipheriv('aes-128-gcm', cek, nonce);
  descifrador.setAuthTag(etiqueta);
  const plano = Buffer.concat([
    descifrador.update(cifrado.subarray(0, cifrado.length - 16)),
    descifrador.final(),
  ]);

  // Relleno de RFC 8188: ceros y, antes de ellos, el delimitador (`0x02` en el
  // último registro).
  let fin = plano.length;
  while (fin > 0 && plano[fin - 1] === 0) fin -= 1;
  return plano.subarray(0, fin - 1).toString('utf8');
}

// ───────────────────────────────────────────────────────────────────────────
// Siembra de notificaciones
// ───────────────────────────────────────────────────────────────────────────

export type FilaDeNotificacion = Database['public']['Tables']['notifications']['Row'];
export type FilaDeSuscripcion = Database['public']['Tables']['push_subscriptions']['Row'];

export type OpcionesDeNotificacion = {
  recipientId: string;
  type?: Database['public']['Enums']['notification_type'];
  title?: string;
  body?: string;
  url?: string | null;
};

/**
 * Una notificación pendiente de drenar, escrita directamente.
 *
 * Se escribe a mano y no a través de un RPC en los seis casos de comportamiento
 * del worker, porque esos casos miden EL DRENAJE y un RPC metería la máquina de
 * estados de los aseos en medio. El caso de punta a punta hace lo contrario a
 * propósito: ahí la notificación la escribe `confirm_cleaning` con el JWT del
 * admin, que es lo que se está midiendo.
 */
export async function sembrarNotificacion(
  opciones: OpcionesDeNotificacion,
): Promise<FilaDeNotificacion> {
  const { data, error } = await clienteAdminDePruebas()
    .from('notifications')
    .insert({
      recipient_id: opciones.recipientId,
      type: opciones.type ?? 'asignacion',
      title: opciones.title ?? 'Nuevo aseo asignado',
      body: opciones.body ?? 'Tienes un aseo asignado para hoy.',
      url: opciones.url === undefined ? `/aseos/${randomUUID()}` : opciones.url,
      dedupe_key: `int-push:${randomUUID()}`,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`No se pudo sembrar la notificación: ${error?.message}`);
  }
  notificacionesSembradas.push(data.id);
  return data;
}

/** Registra una notificación que creó un RPC, para que `limpiarPush()` la borre. */
export function registrarNotificacion(id: string): void {
  notificacionesSembradas.push(id);
}

// ───────────────────────────────────────────────────────────────────────────
// La corrida
// ───────────────────────────────────────────────────────────────────────────

export type ResultadoDeDrenaje = {
  /** Status del route handler, no del push service. 200 salvo guard o cuerpo malo. */
  status: number;
  /** El JSON que devuelve el worker: outcome, código y contadores. */
  cuerpo: Record<string, unknown>;
  /** La fila de `notifications` DESPUÉS de la corrida. */
  notificacion: FilaDeNotificacion;
  /** Las suscripciones del destinatario, revocadas incluidas. */
  suscripciones: FilaDeSuscripcion[];
  /** Peticiones que recibió el falso EN ESTA corrida, sumando todos los destinos. */
  hits: number;
};

export type OpcionesDeDrenaje = {
  /**
   * Que el worker conteste `ya_procesada` es legítimo en UN caso: la segunda
   * corrida de la prueba de idempotencia. En cualquier otro significa que ALGUIEN
   * MÁS reclamó la notificación —un `npm run dev` levantado mientras el Vault
   * local tiene los dos secretos, que es lo que dispara el trigger de la
   * migración 17— y entonces los contadores de esta suite dejan de medir lo que
   * dicen. Por eso el arnés lo convierte en un fallo explicado en vez de dejar
   * que salga como un `expect` desconcertante tres líneas más abajo.
   */
  esperaYaProcesada?: boolean;
};

/**
 * Invoca el worker de drenaje para UNA notificación y devuelve el estado después.
 *
 * Mismo contrato que `correrSync()`: se importa el `POST` del route handler y se
 * le pasa un `Request` con el header del secreto compartido. No se levanta
 * ningún servidor de Next: lo que se está probando es el handler, no el framework.
 */
export async function drenar(
  notificationId: string,
  opciones: OpcionesDeDrenaje = {},
): Promise<ResultadoDeDrenaje> {
  const hitsAntes = hitsTotales;

  const respuesta = await invocarDrenaje(notificationId);
  const texto = await respuesta.text();
  const json: Record<string, unknown> = texto ? (JSON.parse(texto) as Record<string, unknown>) : {};

  if (json.outcome === 'ya_procesada' && opciones.esperaYaProcesada !== true) {
    throw new Error(
      'El worker respondió `ya_procesada`: otra invocación reclamó esta notificación ' +
        'antes que el test.\n' +
        'Causa típica: hay un servidor de la aplicación escuchando y el Vault de la base ' +
        'local tiene `app_base_url` y `cron_shared_secret`, así que el trigger de la ' +
        'migración 17 despachó un drenaje de verdad.\n' +
        'Arréglalo corriendo esta suite sin `npm run dev` levantado.',
    );
  }

  const admin = clienteAdminDePruebas();

  const { data: notificacion, error: errorNotificacion } = await admin
    .from('notifications')
    .select('*')
    .eq('id', notificationId)
    .single();

  if (errorNotificacion || !notificacion) {
    throw new Error(`No se pudo releer la notificación: ${errorNotificacion?.message}`);
  }

  const { data: suscripciones, error: errorSuscripciones } = await admin
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', notificacion.recipient_id);

  if (errorSuscripciones) {
    throw new Error(`No se pudieron releer las suscripciones: ${errorSuscripciones.message}`);
  }

  return {
    status: respuesta.status,
    cuerpo: json,
    notificacion,
    suscripciones: suscripciones ?? [],
    hits: hitsTotales - hitsAntes,
  };
}

/**
 * El secreto compartido, con el mismo fallo ruidoso que `correrSync()`.
 *
 * Sin él el worker responde `401` SIN CUERPO, que es indistinguible de un defecto
 * del guard. El test fallaría por entorno diciendo que falla el código.
 */
function secretoDelCron(): string {
  const secreto = process.env.CRON_SHARED_SECRET;
  if (!secreto) {
    throw new Error(
      'Falta CRON_SHARED_SECRET en .env.local. Sin él el worker responde 401 sin cuerpo.',
    );
  }
  return secreto;
}

async function invocarDrenaje(notificationId: string): Promise<Response> {
  const cuerpo = JSON.stringify({ notification_id: notificationId });
  return POST(peticionDeDrenaje(cuerpo, secretoDelCron()));
}

/**
 * Construye la petición al worker. El secreto entra POR PARÁMETRO para que la
 * prueba del guard pueda mandar uno vacío, uno equivocado o ninguno sin que el
 * arnés se lo corrija por el camino.
 */
export function peticionDeDrenaje(cuerpo: string, secreto: string | null): Request {
  const cabeceras: Record<string, string> = { 'Content-Type': 'application/json' };
  if (secreto !== null) cabeceras['x-cron-secret'] = secreto;

  return new Request('http://localhost/api/push/drain', {
    method: 'POST',
    headers: cabeceras,
    body: cuerpo,
  });
}

/** El worker tal cual, para las pruebas del guard. */
export async function invocarWorker(peticion: Request): Promise<Response> {
  return POST(peticion);
}

// ───────────────────────────────────────────────────────────────────────────
// Limpieza
// ───────────────────────────────────────────────────────────────────────────

/**
 * Borra POR ID lo que sembró este arnés y cierra el servidor falso.
 *
 * IDEMPOTENTE: la segunda llamada no hace nada y no lanza, que es lo que permite
 * ponerla en un `afterAll` y también en el camino de error de un test.
 *
 * Nunca un `delete` sobre la tabla entera. Ver la cabecera del módulo.
 */
export async function limpiarPush(): Promise<void> {
  const admin = clienteAdminDePruebas();

  const suscripciones = [...destinos.values()].map((d) => d.subscriptionId);
  if (suscripciones.length > 0) {
    const { error } = await admin.from('push_subscriptions').delete().in('id', suscripciones);
    if (error) throw new Error(`No se pudieron borrar las suscripciones: ${error.message}`);
  }

  if (notificacionesSembradas.length > 0) {
    const { error } = await admin
      .from('notifications')
      .delete()
      .in('id', notificacionesSembradas);
    if (error) throw new Error(`No se pudieron borrar las notificaciones: ${error.message}`);
    notificacionesSembradas.length = 0;
  }

  await cerrarPushFalso();
}
