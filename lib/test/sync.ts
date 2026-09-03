import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { POST } from '@/app/api/cron/sync-feed/route';
import type { Database } from '@/lib/database.types';

import { clienteAdminDePruebas, type ClienteVivaGuest } from './clientes';

/**
 * ARNÉS DE SIEMBRA, CORRIDA Y LIMPIEZA DEL PIPELINE DE SINCRONIZACIÓN.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * VIVE EN `lib/test/` A PROPÓSITO, Y ESA UBICACIÓN ES LA EXCEPCIÓN.
 *
 * `scripts/ci/check-service-role.sh` exceptúa `lib/test/` en los guardarraíles
 * 5, 7 y 8: aquí se importa la fábrica administrativa sin ningún guard y se
 * nombra la tabla de credenciales, las dos cosas a propósito. La razón es la de
 * siempre y no ha cambiado: un test que siembra con el MISMO cliente con el que
 * comprueba pasa aunque la policy esté mal escrita. La excepción es de
 * directorio y es deliberadamente estrecha; nada bajo `app/` importa este
 * archivo, así que nunca entra al bundle de producción.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── EL ORDEN DE BORRADO NO ES NEGOCIABLE, Y ES POR LO QUE ESTE COMENTARIO
 *    EXISTE ────────────────────────────────────────────────────────────────
 *
 * `cleanings.property_id` es `on delete RESTRICT` (migración 04, y es
 * deliberado: borrar un apartamento con historial operativo tiene que doler).
 * Así que un `delete` sobre `properties` con aseos colgando falla con 23503 y
 * deja la base sucia para el archivo siguiente. Los aseos van PRIMERO y los
 * apartamentos después:
 *
 *     cleanings  →  properties
 *
 * Todo lo demás cae solo por `cascade` desde `properties`: `calendar_feeds`,
 * `calendar_reservations`, `property_secrets`, `notifications` y
 * `feed_sync_runs` (esta última en cascada desde el feed).
 *
 * ── LA URL NO SALE DE AQUÍ ─────────────────────────────────────────────────
 *
 * `sembrarFeed` devuelve ids y nada más. La dirección del feed es una
 * credencial —un GET a ella revela la ocupación completa del apartamento sin
 * autenticarse, T-02-73— y reexportarla desde el arnés sería invitar a que un
 * spec la interpole en un mensaje de aserción. El servidor local que la sirve
 * se guarda en un registro interno, indexado por feed, y `correrSync` lo
 * alcanza por el id.
 */

// ───────────────────────────────────────────────────────────────────────────
// El servidor local que hace de proveedor
// ───────────────────────────────────────────────────────────────────────────

/**
 * Por qué un servidor HTTP de verdad y no un mock de `fetch`: el `fetch` lo hace
 * EL SERVIDOR dentro del route handler, y la única forma de ejercitarlo contra
 * cuerpos controlados es que haya algo escuchando. Es el mismo patrón que el
 * plan 02-14 y por la misma razón medida.
 *
 * `esquemaUrlIcal` admite `127.0.0.1` sobre `http:` cuando `NODE_ENV` no es
 * producción (concesión de testeabilidad con candado, documentada en
 * `lib/domain/ical-url.schema.ts`). Vitest corre con `NODE_ENV=test`.
 */
export type RespuestaDeFeed = {
  cuerpo: string;
  contentType?: string;
  status?: number;
  /** Solo para el caso de redirección: a dónde apunta el `Location`. */
  location?: string;
  etag?: string;
};

type ServidorDeFeed = {
  servidor: Server;
  puerto: number;
  /** Cuántas veces se pidió el feed. Es lo que delata un fetch que no ocurrió. */
  hits: number;
  respuesta: RespuestaDeFeed;
  /** Puerto muerto: se reservó y se cerró, así que nadie escucha ahí. */
  muerto: boolean;
  /**
   * Cabeceras de la ÚLTIMA petición que recibió este servidor, en minúsculas.
   *
   * Existe por una razón concreta: la prueba del `304` sirve el status desde
   * aquí, así que sin esto un worker que NUNCA mandara `If-None-Match` pasaría
   * la aserción igual, porque el 304 se lo estaría regalando el arnés. Con esto
   * se puede afirmar que el condicional salió de verdad y con el etag guardado.
   */
  cabeceras: Record<string, string>;
};

const registro = new Map<string, ServidorDeFeed>();
const propiedadesSembradas: string[] = [];
/** Corridas encadenadas por feed. Ver `correrDiff`. */
const corridasPorFeed = new Map<string, number>();

const CUERPO_POR_DEFECTO = 'BEGIN:VCALENDAR\nEND:VCALENDAR\n';

async function levantar(): Promise<{ servidor: Server; puerto: number }> {
  const servidor = createServer();
  await new Promise<void>((listo) => servidor.listen(0, '127.0.0.1', listo));
  const puerto = (servidor.address() as AddressInfo).port;
  return { servidor, puerto };
}

async function cerrar(servidor: Server): Promise<void> {
  await new Promise<void>((listo) => servidor.close(() => listo()));
}

// ───────────────────────────────────────────────────────────────────────────
// Siembra
// ───────────────────────────────────────────────────────────────────────────

export type OpcionesDeSiembra = {
  /** `false` produce una unidad de gestión externa (SYNC-11). Por defecto `true`. */
  gestionada?: boolean;
  /** `calendar_feeds.is_active`. Por defecto `true`. */
  activo?: boolean;
  /**
   * Reserva un puerto y lo cierra: la dirección es válida y nadie escucha. Es
   * el feed CAÍDO de la aserción central del criterio 1.
   */
  puertoMuerto?: boolean;
  /** `calendar_feeds.last_event_count`, que guarda RESERVAS. Operando del colapso. */
  reservasAnteriores?: number | null;
  /** Vence el feed hacia atrás para que el dispatcher lo vea en la cola. */
  vencido?: boolean;
};

export type FeedSembrado = {
  propertyId: string;
  feedId: string;
  /** El apartamento, para las aserciones que miran `cleanings.is_managed`. */
  gestionada: boolean;
};

/**
 * Crea un apartamento, su feed y su fila de secretos con la dirección apuntando
 * al servidor local de este proceso.
 *
 * NO devuelve la URL. Ver la cabecera del módulo.
 */
export async function sembrarFeed(opciones: OpcionesDeSiembra = {}): Promise<FeedSembrado> {
  const admin: ClienteVivaGuest = clienteAdminDePruebas();
  const gestionada = opciones.gestionada ?? true;
  const sufijo = randomUUID().slice(0, 8);

  const { data: propiedad, error: errorPropiedad } = await admin
    .from('properties')
    .insert({
      nombre: `Int Sync ${sufijo}`,
      cluster: 'Int Cluster Sync',
      gestion_vivaguest: gestionada,
      // Las tarifas viajan al aseo por `tg_cleanings_snapshot()`. En la unidad
      // externa se dejan nulas: `cl_unmanaged_is_inert` exige que el aseo salga
      // con las suyas nulas, y ponerlas aquí solo enturbiaría la aserción.
      ...(gestionada ? { tarifa_huesped: 120000, pago_aseador: 45000 } : { contacto_externo: `externo-${sufijo}` }),
    })
    .select('id')
    .single();

  if (errorPropiedad || !propiedad) {
    throw new Error(`No se pudo sembrar el apartamento: ${errorPropiedad?.message}`);
  }
  propiedadesSembradas.push(propiedad.id);

  const { servidor, puerto } = await levantar();
  const muerto = opciones.puertoMuerto === true;
  if (muerto) await cerrar(servidor);

  // La forma es la real: host, el segmento que exige la allowlist, `.ics` y el
  // `?s=` que es la parte secreta.
  const url = `http://127.0.0.1:${puerto}/calendar/ical/${sufijo}.ics?s=SECRETO${sufijo}`;

  const { error: errorSecreto } = await admin
    .from('property_secrets')
    .upsert({ property_id: propiedad.id, ical_url: url }, { onConflict: 'property_id' });

  if (errorSecreto) throw new Error(`No se pudo sembrar la URL del feed: ${errorSecreto.message}`);

  const { data: feed, error: errorFeed } = await admin
    .from('calendar_feeds')
    .insert({
      property_id: propiedad.id,
      provider: 'airbnb',
      is_active: opciones.activo ?? true,
      last_event_count: opciones.reservasAnteriores ?? null,
      next_sync_at: opciones.vencido
        ? new Date(Date.now() - 60_000).toISOString()
        : new Date(Date.now() + 60 * 60_000).toISOString(),
    })
    .select('id')
    .single();

  if (errorFeed || !feed) throw new Error(`No se pudo sembrar el feed: ${errorFeed?.message}`);

  if (!muerto) {
    const estado: ServidorDeFeed = {
      servidor,
      puerto,
      hits: 0,
      respuesta: { cuerpo: CUERPO_POR_DEFECTO },
      muerto: false,
      cabeceras: {},
    };
    servidor.on('request', (req, res) => {
      estado.hits += 1;
      estado.cabeceras = {};
      for (const [nombre, valor] of Object.entries(req.headers)) {
        if (typeof valor === 'string') estado.cabeceras[nombre.toLowerCase()] = valor;
      }
      const r = estado.respuesta;
      const status = r.status ?? 200;
      const cabeceras: Record<string, string> = {
        'Content-Type': r.contentType ?? 'text/calendar; charset=utf-8',
      };
      if (r.location) cabeceras.Location = r.location;
      if (r.etag) cabeceras.ETag = r.etag;
      res.writeHead(status, cabeceras);
      res.end(status === 304 ? undefined : r.cuerpo);
    });
    registro.set(feed.id, estado);
  } else {
    registro.set(feed.id, {
      servidor,
      puerto,
      hits: 0,
      respuesta: { cuerpo: '' },
      muerto: true,
      cabeceras: {},
    });
  }

  return { propertyId: propiedad.id, feedId: feed.id, gestionada };
}

// ───────────────────────────────────────────────────────────────────────────
// Corrida
// ───────────────────────────────────────────────────────────────────────────

export type FilaDeCorrida = Database['public']['Tables']['feed_sync_runs']['Row'];
export type FilaDeFeed = Database['public']['Tables']['calendar_feeds']['Row'];

export type ResultadoDeCorrida = {
  /** Status del route handler, no del proveedor. 200 salvo guard o cuerpo malo. */
  status: number;
  /** El JSON que devuelve el worker: outcome, código y contadores. */
  cuerpo: Record<string, unknown>;
  /** La última fila de `feed_sync_runs` de este feed. */
  corrida: FilaDeCorrida | null;
  /** La fila del feed después de la corrida: salud, backoff y lease. */
  feed: FilaDeFeed;
  /** Peticiones que recibió el servidor local en ESTA corrida. */
  hits: number;
};

export type OpcionesDeCorrida = {
  contentType?: string;
  status?: number;
  location?: string;
  etag?: string;
};

/**
 * Corre el sync de UN feed: pone el cuerpo que el proveedor va a servir, invoca
 * el route handler con el header del secreto compartido y devuelve el resultado
 * junto con la bitácora.
 *
 * El servidor se levantó en `sembrarFeed` y no aquí: la dirección tiene que
 * estar persistida ANTES de la primera corrida, así que el puerto se decide al
 * sembrar. Lo que esta función decide es QUÉ se sirve, que es la variable que
 * los specs mueven.
 */
export async function correrSync(
  feedId: string,
  cuerpo: string,
  opciones: OpcionesDeCorrida = {},
): Promise<ResultadoDeCorrida> {
  const estado = registro.get(feedId);
  if (!estado) throw new Error(`El feed ${feedId} no lo sembró este arnés.`);

  const hitsAntes = estado.hits;
  estado.respuesta = { cuerpo, ...opciones };

  const secreto = process.env.CRON_SHARED_SECRET;
  if (!secreto) {
    throw new Error(
      'Falta CRON_SHARED_SECRET en .env.local. Sin él el worker responde 401 sin cuerpo.',
    );
  }

  const peticion = new Request('http://localhost/api/cron/sync-feed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-cron-secret': secreto },
    body: JSON.stringify({ feed_id: feedId }),
  });

  const respuesta = await POST(peticion);
  const texto = await respuesta.text();
  const json: Record<string, unknown> = texto ? (JSON.parse(texto) as Record<string, unknown>) : {};

  const admin = clienteAdminDePruebas();

  const { data: corrida } = await admin
    .from('feed_sync_runs')
    .select('*')
    .eq('feed_id', feedId)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: feed, error: errorFeed } = await admin
    .from('calendar_feeds')
    .select('*')
    .eq('id', feedId)
    .single();

  if (errorFeed || !feed) throw new Error(`No se pudo releer el feed: ${errorFeed?.message}`);

  return {
    status: respuesta.status,
    cuerpo: json,
    corrida: corrida ?? null,
    feed,
    hits: estado.hits - hitsAntes,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// ENCADENAR CORRIDAS — lo que hace medible el comportamiento TEMPORAL
// ───────────────────────────────────────────────────────────────────────────

/**
 * Cambia el `DTSTAMP` de todo el feed sin tocar nada más.
 *
 * ES LO QUE PERMITE ENCADENAR CORRIDAS SOBRE EL MISMO CUERPO. El worker corta
 * con `sin_cambios` cuando el sha256 del cuerpo coincide con el de la corrida
 * anterior, así que servir el mismo texto dos veces NO llega al RPC y la
 * segunda ausencia nunca se produciría. `DTSTAMP` es exactamente el campo que
 * cambia el hash del cuerpo y NO entra en el `payloadHash` del evento
 * —`hashDe([uid, startsOn, endsOn, summary, reservationCode])`— ni lo lee el
 * normalizador.
 */
export function conDtstamp(cuerpo: string, valor: string): string {
  return cuerpo.replace(/DTSTAMP:[0-9TZ]+/g, `DTSTAMP:${valor}`);
}

/**
 * Quita el `VEVENT` cuyo `DTEND` es `dtend` (forma cruda, `YYYYMMDD`).
 *
 * Se construye QUITANDO TEXTO del feed y no regenerando uno con menos eventos,
 * y la diferencia importa: los códigos de reserva son la identidad de nivel 1
 * del diff, así que un feed regenerado con otros códigos no es "el mismo feed
 * con una reserva menos", es un feed entero de reservas nuevas.
 */
export function sinCheckout(cuerpo: string, dtend: string): string {
  const partes = cuerpo.split('BEGIN:VEVENT');
  const cabecera = partes[0];
  const bloques = partes.slice(1);
  const quedan = bloques.filter((b) => !b.includes(`DTEND;VALUE=DATE:${dtend}`));
  if (quedan.length !== bloques.length - 1) {
    throw new Error(`El feed no tiene exactamente un evento que termine el ${dtend}.`);
  }
  return cabecera + quedan.map((b) => `BEGIN:VEVENT${b}`).join('');
}

/**
 * Corre el sync ENCADENANDO: cada llamada sobre el mismo feed lleva un
 * `DTSTAMP` distinto, así que el atajo por hash del worker nunca la corta y el
 * RPC se ejecuta de verdad todas las veces.
 *
 * Es la función que usan las pruebas del diff destructivo, y la razón es que
 * TODO lo que miden solo existe entre corridas: la regla de las dos ausencias,
 * el 304 que no cuenta y la urgencia que se apaga sola son invisibles para
 * cualquier prueba de una sola pasada.
 *
 * El contador es POR FEED y arranca en cero al sembrar, así que dos specs del
 * mismo archivo no se pisan la secuencia.
 */
export async function correrDiff(
  feedId: string,
  cuerpo: string,
  opciones: OpcionesDeCorrida = {},
): Promise<ResultadoDeCorrida> {
  const n = (corridasPorFeed.get(feedId) ?? 0) + 1;
  corridasPorFeed.set(feedId, n);

  // Marca válida y distinta por corrida. Con `n` hasta 86399 la hora sigue
  // siendo legal, y ninguna prueba encadena tantas.
  const hh = String(Math.floor(n / 3600) % 24).padStart(2, '0');
  const mm = String(Math.floor(n / 60) % 60).padStart(2, '0');
  const ss = String(n % 60).padStart(2, '0');

  return correrSync(feedId, conDtstamp(cuerpo, `20260903T${hh}${mm}${ss}Z`), opciones);
}

/**
 * Las cabeceras de la última petición que recibió el servidor local del feed.
 *
 * Sirve para una sola cosa y es importante: afirmar que el `If-None-Match` que
 * justifica un `304` salió de verdad, con el etag que guardó la corrida
 * anterior. Sin esto, la prueba del 304 se estaría comprobando a sí misma.
 */
export function cabecerasDe(feedId: string): Record<string, string> {
  const estado = registro.get(feedId);
  if (!estado) throw new Error(`El feed ${feedId} no lo sembró este arnés.`);
  return { ...estado.cabeceras };
}

/** Los aseos del apartamento, en orden de fecha. Es la aserción de casi todo. */
export async function aseosDe(
  propertyId: string,
): Promise<Database['public']['Tables']['cleanings']['Row'][]> {
  const { data, error } = await clienteAdminDePruebas()
    .from('cleanings')
    .select('*')
    .eq('property_id', propertyId)
    .order('scheduled_date', { ascending: true });

  if (error) throw new Error(`No se pudieron leer los aseos: ${error.message}`);
  return data ?? [];
}

/** Aseos vivos, es decir todo lo que no está cancelado. */
export async function aseosVivosDe(
  propertyId: string,
): Promise<Database['public']['Tables']['cleanings']['Row'][]> {
  return (await aseosDe(propertyId)).filter((a) => a.state !== 'cancelada');
}

export async function cancelados(propertyId: string): Promise<number> {
  return (await aseosDe(propertyId)).filter((a) => a.state === 'cancelada').length;
}

/**
 * Las reservas observadas del apartamento, en orden de fin.
 *
 * `disappeared_at` es la columna que hace visible la regla de las dos
 * ausencias: en la primera corrida sin la reserva se escribe, y hasta la
 * segunda no se cancela nada.
 *
 * NO se selecciona `raw_description`, y no es por brevedad: esa columna no
 * existe justamente porque el `DESCRIPTION` del feed real trae los últimos
 * cuatro dígitos del teléfono del huésped. Nombrarla aquí invitaría a que un
 * spec la interpolara en un mensaje de aserción.
 */
export async function reservasDe(
  propertyId: string,
): Promise<Database['public']['Tables']['calendar_reservations']['Row'][]> {
  const { data, error } = await clienteAdminDePruebas()
    .from('calendar_reservations')
    .select('*')
    .eq('property_id', propertyId)
    .order('ends_on', { ascending: true });

  if (error) throw new Error(`No se pudieron leer las reservas: ${error.message}`);
  return data ?? [];
}

/**
 * Las notificaciones del apartamento.
 *
 * LA UNIDAD QUE SE CUENTA ES `dedupe_key`, NO LA FILA: el fan-out del RPC y del
 * watchdog es una fila POR ADMIN ACTIVO, porque `notifications.recipient_id` es
 * NOT NULL y no existe "una notificación para el rol". Contar filas ataría cada
 * aserción al número de admins de la semilla.
 */
export async function notificacionesDe(
  propertyId: string,
): Promise<Database['public']['Tables']['notifications']['Row'][]> {
  const { data, error } = await clienteAdminDePruebas()
    .from('notifications')
    .select('*')
    .eq('property_id', propertyId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`No se pudieron leer las notificaciones: ${error.message}`);
  return data ?? [];
}

/** Las `dedupe_key` distintas de un tipo de notificación. Ver `notificacionesDe`. */
export async function alertasLogicas(
  propertyId: string,
  tipo?: Database['public']['Enums']['notification_type'],
): Promise<string[]> {
  const filas = await notificacionesDe(propertyId);
  const claves = filas
    .filter((n) => tipo === undefined || n.type === tipo)
    .map((n) => n.dedupe_key)
    .filter((k): k is string => k !== null);
  return [...new Set(claves)].sort();
}

/**
 * La bitácora de estados de un aseo.
 *
 * `actor_id` nulo NO es una carencia: es el dato que distingue "lo canceló el
 * sync" de "lo canceló el admin". El trigger la escribe con `auth.uid()`, que
 * es nulo cuando quien escribe es la clave de servicio o un job de cron.
 */
export async function transicionesDe(
  cleaningId: string,
): Promise<Database['public']['Tables']['cleaning_state_transitions']['Row'][]> {
  const { data, error } = await clienteAdminDePruebas()
    .from('cleaning_state_transitions')
    .select('*')
    .eq('cleaning_id', cleaningId)
    .order('id', { ascending: true });

  if (error) throw new Error(`No se pudo leer la bitácora: ${error.message}`);
  return data ?? [];
}

// ───────────────────────────────────────────────────────────────────────────
// SQL directo contra el contenedor
// ───────────────────────────────────────────────────────────────────────────

/**
 * `dispatch_feed_syncs()` y el esquema `net` NO son alcanzables por PostgREST:
 * la migración 14 revoca `execute` de `public` (y con ello de `service_role`,
 * que no tiene grant propio) y `net` no está expuesto. La única forma honesta
 * de medir el fan-out es hablar con la base como `postgres`, que es exactamente
 * lo que hace `pg_cron` en producción.
 *
 * Se va por `docker exec` y no por un cliente de Postgres en npm a propósito:
 * es el mismo camino que ya usa `scripts/dev/sync-local.sh` y no añade una
 * dependencia al proyecto para tres consultas.
 *
 * ── EL GUION VA POR LA ENTRADA ESTÁNDAR, Y ESO ES LO QUE HABILITA EL PATRÓN
 *    QUE HACE DETERMINISTAS LAS PRUEBAS DEL DISPATCHER ────────────────────
 *
 * Con `-f -` el guion entero corre en UNA sesión, así que un `begin … rollback`
 * significa lo que dice. Eso permite medir el fan-out SIN EFECTOS:
 *
 *   · los dos secretos de Vault se crean DENTRO de la transacción, así que el
 *     job de producción —que corre en otra sesión y sigue fallando por falta de
 *     secretos— no los ve y no puede reclamar los feeds del test a mitad de la
 *     medición;
 *   · las filas que `pg_net` encola quedan visibles para nosotros y NO para su
 *     trabajador de fondo, que no puede leer lo no confirmado, así que ninguna
 *     petición HTTP sale de verdad;
 *   · el `rollback` deshace el `claimed_at`, el `next_sync_at` y la cola.
 *
 * La alternativa —desactivar el job compartido y volver a activarlo— toca
 * estado global de una base que comparten todos los worktrees y se queda a
 * medias si el proceso muere. Esta no toca nada.
 */
const CONTENEDOR = 'supabase_db_vivaguest';

export function sqlDePruebas(guion: string): string[] {
  const salida = execFileSync(
    'docker',
    [
      'exec',
      '-i',
      CONTENEDOR,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-qAtX',
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      '-',
    ],
    { encoding: 'utf8', input: guion },
  );
  return salida.split('\n').filter((l) => l.length > 0);
}

// ───────────────────────────────────────────────────────────────────────────
// Limpieza
// ───────────────────────────────────────────────────────────────────────────

/**
 * Cierra los servidores y borra lo sembrado, EN ORDEN.
 *
 * Ver la cabecera del módulo: `cleanings.property_id` es `on delete restrict`,
 * así que los aseos van antes que los apartamentos o el borrado falla con 23503.
 */
export async function limpiarSync(): Promise<void> {
  for (const estado of registro.values()) {
    if (!estado.muerto) await cerrar(estado.servidor);
  }
  registro.clear();
  corridasPorFeed.clear();

  if (propiedadesSembradas.length === 0) return;

  const admin = clienteAdminDePruebas();

  // 1. Los aseos. `on delete restrict` desde properties.
  const { error: errorAseos } = await admin
    .from('cleanings')
    .delete()
    .in('property_id', propiedadesSembradas);
  if (errorAseos) throw new Error(`No se pudieron borrar los aseos: ${errorAseos.message}`);

  // 2. Los apartamentos. Feeds, reservas, secretos, notificaciones y bitácora
  //    de corridas caen solos por cascade.
  const { error: errorPropiedades } = await admin
    .from('properties')
    .delete()
    .in('id', propiedadesSembradas);
  if (errorPropiedades) {
    throw new Error(`No se pudieron borrar los apartamentos: ${errorPropiedades.message}`);
  }

  propiedadesSembradas.length = 0;
}
