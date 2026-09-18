import { createHash, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { APIRequestContext, Page } from '@playwright/test';

import type { Database } from '@/lib/database.types';
import { contarPorClasificacion } from '@/lib/domain/ical-guardas';
import { normalizarIcs } from '@/lib/domain/ical-normalizar';

import { sumarDias, type Servicio } from './fixtures';

/**
 * EL ARNÉS DE LOS RECORRIDOS DE PUNTA A PUNTA (Fase 9).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUÉ EXISTE, Y ES UNA MEDICIÓN, NO UNA PREFERENCIA DE DISEÑO.
 *
 * Los 160 casos E2E de este repo siembran el aseo con un `insert` directo en
 * `cleanings` (`e2e/fixtures.ts`, `sembrarAseos()`). Ni uno arranca de un feed.
 * Eso quiere decir que la PRIMERA junta del Core Value —un checkout publicado en
 * el calendario que se convierte en un aseo— no la prueba nadie desde la
 * interfaz, y es justo la junta que decide si el producto existe: un checkout
 * que no se vuelve aseo es un aseo perdido.
 *
 * Este módulo es lo que permite escribir recorridos cuyo aseo NACE DEL FEED.
 * Por eso no expone ningún atajo para sembrar un aseo: si lo expusiera, la fase
 * entera perdería su razón de existir a la primera vez que alguien tuviera
 * prisa.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── EL TRANSPORTE ES HTTP, Y NO SE PUEDE IMPORTAR EL HANDLER ────────────────
 *
 * La sincronización se dispara con un `POST` al servidor que ya levantó
 * Playwright:
 *
 *     POST http://127.0.0.1:${PLAYWRIGHT_PORT}/api/cron/sync-feed
 *     x-cron-secret: <el secreto compartido>
 *     { "feed_id": "…" }
 *
 * NO se importa el `POST` de `app/api/cron/sync-feed/route.ts`, que es lo que sí
 * hace `correrSync()` de `lib/test/sync.ts` para las suites de integración. La
 * razón está medida y escrita en dos sitios más del repo: ese archivo empieza
 * con `import 'server-only'`, cuyo `index.js` es un `throw`, y el transpilador
 * de Playwright NO activa la condición `react-server` que lo neutraliza. Es la
 * misma razón por la que `e2e/global-setup.ts` construye su propio cliente de
 * servicio en vez de reutilizar la fábrica, y por la que `e2e/fixtures.ts` no
 * importa `lib/test/aseos.ts`.
 *
 * Y además es EL CAMINO FIEL: por HTTP con secreto compartido es exactamente lo
 * que hace `pg_net` en producción. El fan-out del dispatcher ya está probado en
 * `lib/domain/sync-dispatcher.integration.test.ts` y aquí no se repite.
 *
 * ── LA URL DEL FEED NO SALE DE AQUÍ ────────────────────────────────────────
 *
 * `sembrarUnidadDeRecorrido()` devuelve ids, nombres y tarifas. NUNCA la
 * dirección del feed: es una credencial —un GET a ella revela la ocupación
 * completa del apartamento sin autenticarse, T-02-73— y reexportarla sería
 * invitar a que un spec la interpole en un mensaje de aserción, que es donde
 * acaba impresa en la consola y en el reporte HTML. El servidor local que la
 * sirve vive en un registro interno indexado por feed, igual que en
 * `lib/test/sync.ts`, y `correrSync()` lo alcanza por el id.
 *
 * ── EL MODO DE FALLA QUE ESTE ARNÉS HACE RUIDOSO ───────────────────────────
 *
 * Si el proceso del SERVIDOR no ve `CRON_SHARED_SECRET`, el worker responde
 * **401 sin cuerpo** (es deliberado: distinguir "no mandaste header" de "el
 * secreto no coincide" es información gratis para quien sondea). Un 401 mudo en
 * la primera junta es indistinguible de un defecto del guard y cuesta una hora
 * de diagnóstico. Por eso `correrSync()` lanza con un mensaje que nombra la
 * variable Y el proceso que tiene que verla.
 *
 * ── EL AVISO DEL VAULT, QUE EXPLICA UN `hits` QUE NO CUADRA ────────────────
 *
 * Si el Vault del stack local tiene `app_base_url` y `cron_shared_secret` —los
 * siembra `scripts/dev/sync-local.sh`—, hay un `pg_cron` que puede estar
 * despachando corridas de verdad, contra el puerto que ese guion le dejó
 * escrito, que no tiene por qué ser el de esta suite. Este arnés no depende de
 * eso ni se rompe por eso: cada corrida se dispara a mano y el contador de hits
 * se mide por diferencia. Pero si algún día un `hits` sale en 2 donde debería
 * salir 1, mira ahí antes que al producto.
 *
 * ── EL ORDEN DE BORRADO NO ES NEGOCIABLE ───────────────────────────────────
 *
 *     cleanings  →  properties  →  auth.users
 *
 * `cleanings.property_id` y `properties.responsable_id` son `on delete restrict`
 * a propósito: borrar un apartamento con historial operativo tiene que doler.
 * Invertir un eslabón da `23503` y deja la base sucia para el archivo siguiente.
 * Y se borra SIEMPRE POR ID, nunca por tabla: el stack local es uno solo y lo
 * comparten todos los worktrees.
 */

// ───────────────────────────────────────────────────────────────────────────
// 1. EL PROVEEDOR LOCAL, UNO POR FEED
// ───────────────────────────────────────────────────────────────────────────

/** Lo que el proveedor va a servir en la próxima corrida. */
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
  /** Cuántas veces se pidió el feed. Es lo que delata un fetch que no ocurrió. */
  hits: number;
  respuesta: RespuestaDeFeed;
  /** Puerto muerto: se reservó y se cerró, así que nadie escucha ahí. */
  muerto: boolean;
  /**
   * Cabeceras de la ÚLTIMA petición, en minúsculas.
   *
   * Existe por una razón concreta y no por diagnóstico: una prueba del `304`
   * sirve el status desde aquí, así que sin esto un worker que NUNCA mandara
   * `If-None-Match` pasaría la aserción igual, porque el 304 se lo estaría
   * regalando el arnés.
   */
  cabeceras: Record<string, string>;
  /**
   * El cliente con el que se sembró este feed.
   *
   * Vive aquí y no en la firma de `correrSync()` porque la corrida ya tiene que
   * llevar el `request` de Playwright, y pedir además el cliente en cada llamada
   * sería ruido en el sitio donde más se lee.
   */
  servicio: Servicio;
};

/**
 * El registro es estado A NIVEL DE MÓDULO, al contrario que en `e2e/fixtures.ts`
 * y a propósito.
 *
 * Aquí es necesario: el servidor HTTP se levanta al SEMBRAR (la dirección tiene
 * que estar persistida antes de la primera corrida, así que el puerto se decide
 * entonces) y se usa al CORRER, que son dos llamadas distintas. La contrapartida
 * —con `workers: 1` Playwright reutiliza el proceso entre archivos de spec— se
 * paga con `limpiarRecorrido()` en el `afterAll` de cada archivo, que vacía el
 * registro entero.
 */
const registro = new Map<string, ServidorDeFeed>();
const propiedadesSembradas: string[] = [];
/** Solo los usuarios que creó ESTE arnés. Los prestados no se borran. */
const usuariosSembrados: string[] = [];
/** Corridas encadenadas por feed. Ver `correrSyncEncadenado`. */
const corridasPorFeed = new Map<string, number>();
/**
 * Los periodos de pago que un recorrido dejó cerrados, por su `periodo_desde`.
 *
 * La lista de `/finanzas/pagos` es ACUMULATIVA: un periodo cerrado sobrevive a la
 * corrida y se pinta como un bloque más en la siguiente. `finanzas.spec.ts`
 * afirma que hay exactamente dos bloques, así que esto no es higiene: es lo que
 * impide que este archivo ponga rojo otro.
 */
const periodosCerradosPorRecorrido: string[] = [];

async function levantar(): Promise<{ servidor: Server; puerto: number }> {
  const servidor = createServer();
  await new Promise<void>((listo) => servidor.listen(0, '127.0.0.1', listo));
  return { servidor, puerto: (servidor.address() as AddressInfo).port };
}

async function cerrar(servidor: Server): Promise<void> {
  await new Promise<void>((listo) => servidor.close(() => listo()));
}

// ───────────────────────────────────────────────────────────────────────────
// 2. EL CONSTRUCTOR DE `.ics`, CON LA FORMA REAL MEDIDA
// ───────────────────────────────────────────────────────────────────────────

/**
 * Un evento del feed, en desplazamientos de días contra el día de negocio.
 *
 * ── POR QUÉ NO SE ACEPTA UNA FECHA LITERAL, Y NO ES COMODIDAD ──────────────
 * Un `.ics` con fechas de septiembre deja de probar lo que dice en octubre: el
 * aseo se cae fuera de la ventana de `/operacion` y la aserción de pantalla pasa
 * a medir otra cosa sin que nadie se entere. El precedente y su razón están en
 * la cabecera de `e2e/calendario.spec.ts`. Aquí esa regla es ESTRUCTURAL: la
 * firma no admite una fecha escrita a mano.
 */
export type EventoDeRecorrido = {
  /** Días desde el día de negocio hasta el `DTSTART`, la última noche ocupada. */
  desde: number;
  /**
   * Días desde el día de negocio hasta el `DTEND`.
   *
   * EL `DTEND` ES EL DÍA DEL CHECKOUT Y ES EL DÍA DEL ASEO. Sin sumar ni restar.
   * El `DTEND;VALUE=DATE` de un evento de día completo es exclusivo en el
   * formato y coincide exactamente con el día en que el calendario libera el
   * apartamento.
   */
  hasta: number;
  uid: string;
  /**
   * El código de reserva. Su PRESENCIA es lo que hace la reserva y su AUSENCIA
   * lo que hace el bloqueo del propietario, porque así es como vienen los feeds
   * de verdad: medido sobre 830 snapshots, `DESCRIPTION` existe solo en los
   * `Reserved` (1708 de 1708) y el código vive únicamente dentro de esa URL.
   */
  codigo?: string;
};

/** `'2026-09-04'` → `'20260904'`, la forma del `DTEND;VALUE=DATE`. */
function compacta(iso: string): string {
  return iso.replaceAll('-', '');
}

/**
 * Un `.ics` con la forma real de Airbnb, medida en el research de la Fase 3
 * sobre 830 snapshots versionados y NO inventada:
 *
 *   · seis propiedades por `VEVENT` y ninguna más: `DTSTAMP`, `DTSTART`,
 *     `DTEND`, `SUMMARY`, `UID`, `DESCRIPTION`. Cero `X-`, cero `RRULE`, cero
 *     `VTIMEZONE`;
 *   · `SUMMARY` solo tiene dos valores: `Reserved` y `Airbnb (Not available)`;
 *   · `DESCRIPTION` solo en los `Reserved`, con el código dentro de la URL;
 *   · `CRLF` como terminador, que es lo que exige RFC 5545.
 *
 * @param hoy El día de negocio SEGÚN LA BASE (`diaDeNegocio()`). Nunca del reloj
 *   del proceso: entre las 19:00 y la medianoche de Bogotá, UTC ya cambió de día
 *   y un `new Date()` devolvería mañana.
 */
export function icsDe(
  hoy: string,
  eventos: EventoDeRecorrido[],
  opciones: { dtstamp?: string } = {},
): string {
  const dtstamp = opciones.dtstamp ?? '20260901T120000Z';

  const lineas = [
    'BEGIN:VCALENDAR',
    'PRODID:-//Airbnb Inc//Hosting Calendar 0.8.8//EN',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    `DTSTAMP:${dtstamp}`,
  ];

  for (const evento of eventos) {
    lineas.push(
      'BEGIN:VEVENT',
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${compacta(sumarDias(hoy, evento.desde))}`,
      `DTEND;VALUE=DATE:${compacta(sumarDias(hoy, evento.hasta))}`,
      `UID:${evento.uid}`,
      evento.codigo === undefined ? 'SUMMARY:Airbnb (Not available)' : 'SUMMARY:Reserved',
    );

    if (evento.codigo !== undefined) {
      lineas.push(
        `DESCRIPTION:Reservation URL: https://www.airbnb.com/hosting/reservations/details/${evento.codigo}`,
      );
    }

    lineas.push('END:VEVENT');
  }

  lineas.push('END:VCALENDAR');
  return lineas.join('\r\n');
}

// ───────────────────────────────────────────────────────────────────────────
// 3. LA SIEMBRA DE LA UNIDAD DEL RECORRIDO
// ───────────────────────────────────────────────────────────────────────────

/**
 * Las tarifas del recorrido, DISTINTAS de las de cualquier otro fixture del
 * repo (120 000/45 000 en `e2e/fixtures.ts` y `lib/test/sync.ts`, 137 731/41 117
 * y 152 909/48 211 en el sembrador financiero, 183 947/52 731 en
 * `e2e/operacion.spec.ts`).
 *
 * No es cosmética: el tramo del dinero tiene que poder afirmar que la cifra que
 * se pinta salió del SNAPSHOT DEL ASEO y no de la fila del apartamento. Con
 * tarifas repetidas, una pantalla que leyera la tabla equivocada daría el mismo
 * número y la aserción no miraría nada.
 */
const TARIFAS = { tarifaHuesped: 214_609, pagoAseador: 61_843 } as const;

export type OpcionesDeUnidad = {
  /** Va en el nombre del apartamento. Sirve para distinguir dos unidades del mismo spec. */
  etiqueta?: string;
  /** `false` produce una unidad de gestión externa (informativa). Por defecto `true`. */
  gestionada?: boolean;
  /**
   * El id de un usuario YA EXISTENTE que hace de responsable fija, en vez de
   * crear una.
   *
   * ── NO ES UN ADORNO, Y POR ESO ESTÁ DESDE EL PRIMER DÍA ──────────────────
   * El tramo del aseador de un recorrido se hace con el fixture `paginaAseador`,
   * que es la sesión del `aseador1` de `global-setup.ts`, y el tramo del push
   * con `contextoPersistente(browser, 'aseador1', …)`. Con una aseadora recién
   * creada por este sembrador NO HAY `storageState` con el que entrar, así que
   * el recorrido se quedaría sin su mitad de campo.
   *
   * Cuando se usa, el usuario prestado NO se borra en la limpieza: este arnés
   * solo borra lo que él creó.
   */
  responsable?: string;
  /**
   * El id de un usuario YA EXISTENTE que hace de suplente, en vez de crear una.
   *
   * ── LO PIDIÓ UNA ASERCIÓN, NO LA SIMETRÍA CON `responsable` ──────────────
   * El recorrido del Core Value afirma que confirmar asigna a la RESPONSABLE
   * FIJA, y esa aserción solo dice algo si las otras dos candidatas plausibles
   * —la suplente y quien confirmó— son personas CONOCIDAS contra las que se
   * puede comparar por id. Con una suplente anónima recién creada, la aserción
   * «no es la suplente» sigue siendo cierta, pero quien lea el rojo no sabe
   * contra quién se comparó. Con `aseador2` prestado, el mensaje puede nombrarla.
   *
   * Igual que la responsable prestada: NO se borra en la limpieza.
   */
  suplente?: string;
  /**
   * Reserva un puerto y lo cierra: la dirección es válida y nadie escucha. Es el
   * feed CAÍDO, y es lo que necesita el recorrido torcido del calendario que se
   * cae sin cancelar ni un aseo.
   */
  puertoMuerto?: boolean;
};

export interface UnidadDeRecorrido {
  propiedadId: string;
  feedId: string;
  nombre: string;
  cluster: string;
  gestionada: boolean;
  /** `null` en la unidad de gestión externa: `props_assignees_only_when_managed`. */
  responsable: { id: string; nombre: string } | null;
  suplente: { id: string; nombre: string } | null;
  /** Quién la atiende cuando no la gestiona VivaGuest. `null` en la gestionada. */
  contactoExterno: string | null;
  /**
   * Los dos cuartos, y son dos por una razón del checklist: `general` NO exige
   * foto y `habitacion` SÍ. Con un solo tipo, el tramo de la evidencia no podría
   * distinguir "no subió la foto que le tocaba" de "no había ninguna que subir".
   */
  cuartos: { general: string; habitacion: string };
  /** `null` en la externa: `cl_unmanaged_is_inert` exige que el aseo salga sin cifras. */
  tarifas: { tarifaHuesped: number; pagoAseador: number } | null;
  sufijo: string;
}

async function crearAseadora(
  servicio: Servicio,
  nombre: string,
  sufijo: string,
): Promise<{ id: string; nombre: string }> {
  const { data, error } = await servicio.auth.admin.createUser({
    email: `e2e.rec.${sufijo}@vivaguest.test`,
    password: `pw-${randomUUID()}`,
    // Sin esto GoTrue exigiría confirmación por correo.
    email_confirm: true,
    // El rol va en los DOS sitios y no es redundante: `app_metadata` viaja en el
    // JWT y lo lee el middleware; `user_metadata` es lo que lee
    // `tg_handle_new_user` para materializar la fila de `public.profiles`.
    app_metadata: { role: 'aseador' },
    user_metadata: { role: 'aseador', full_name: nombre },
  });

  if (error || !data.user) throw new Error(`No se pudo sembrar a ${nombre}: ${error?.message}`);
  usuariosSembrados.push(data.user.id);
  return { id: data.user.id, nombre };
}

/**
 * Crea la unidad completa del recorrido: aseadoras, apartamento, cuartos,
 * secreto con la dirección del proveedor local, y feed.
 *
 * Los cuartos NO son decorado. `confirmar_aseo()` (migración 09) materializa el
 * checklist cruzando `property_rooms` con `checklist_tasks`, así que una unidad
 * sin cuartos produce un aseo sin checklist y el tramo de la aseadora no tendría
 * nada que marcar: pasaría verde sin haber probado el checklist.
 */
export async function sembrarUnidadDeRecorrido(
  servicio: Servicio,
  opciones: OpcionesDeUnidad = {},
): Promise<UnidadDeRecorrido> {
  const sufijo = randomUUID().slice(0, 8);
  const gestionada = opciones.gestionada ?? true;
  const etiqueta = opciones.etiqueta ?? 'Unidad';
  const nombre = `E2E Rec ${etiqueta} ${sufijo}`;
  const cluster = `E2E Rec ${sufijo}`;

  // ── Las personas ────────────────────────────────────────────────────────
  let responsable: { id: string; nombre: string } | null = null;
  let suplente: { id: string; nombre: string } | null = null;

  if (gestionada) {
    responsable =
      opciones.responsable === undefined
        ? await crearAseadora(servicio, `Responsable ${sufijo}`, `r.${sufijo}`)
        : { id: opciones.responsable, nombre: '(prestada)' };
    suplente =
      opciones.suplente === undefined
        ? await crearAseadora(servicio, `Suplente ${sufijo}`, `s.${sufijo}`)
        : { id: opciones.suplente, nombre: '(prestada)' };
  }

  // ── El apartamento ──────────────────────────────────────────────────────
  // `hora_limite` distinta del default del schema a propósito: es lo que permite
  // afirmar que el aseo COPIÓ la del apartamento y no que coincidió con el
  // default. Las tres columnas de activación (tarifas + responsable) van juntas
  // o `props_active_requires_rates` y `props_active_requires_owner` la rechazan.
  const contactoExterno = gestionada ? null : `Administración Externa ${sufijo}`;

  const { data: propiedad, error: errorPropiedad } = await servicio
    .from('properties')
    .insert({
      nombre,
      cluster,
      gestion_vivaguest: gestionada,
      hora_limite: '10:15',
      is_active: true,
      ...(gestionada
        ? {
            tarifa_huesped: TARIFAS.tarifaHuesped,
            pago_aseador: TARIFAS.pagoAseador,
            responsable_id: responsable?.id,
            suplente_id: suplente?.id,
          }
        : { contacto_externo: contactoExterno }),
    })
    .select('id')
    .single();

  if (errorPropiedad || !propiedad) {
    throw new Error(`No se pudo sembrar el apartamento: ${errorPropiedad?.message}`);
  }
  propiedadesSembradas.push(propiedad.id);

  // ── Los cuartos ─────────────────────────────────────────────────────────
  const { data: tipos, error: errorTipos } = await servicio
    .from('room_types')
    .select('id, slug, sort_order')
    .in('slug', ['general', 'habitacion']);

  if (errorTipos || !tipos || tipos.length !== 2) {
    throw new Error(`No se pudieron leer los tipos de cuarto: ${errorTipos?.message}`);
  }

  const porSlug = new Map(tipos.map((t) => [t.slug, t]));
  const cuartos: Record<string, string> = {};

  for (const slug of ['general', 'habitacion'] as const) {
    const tipo = porSlug.get(slug);
    if (!tipo) throw new Error(`Falta el tipo de cuarto ${slug} en el catálogo.`);

    const { data: cuarto, error: errorCuarto } = await servicio
      .from('property_rooms')
      .insert({
        property_id: propiedad.id,
        room_type_id: tipo.id,
        etiqueta: slug === 'general' ? 'General' : 'Habitación 1',
        sort_order: tipo.sort_order,
      })
      .select('id')
      .single();

    if (errorCuarto || !cuarto) {
      throw new Error(`No se pudo sembrar el cuarto ${slug}: ${errorCuarto?.message}`);
    }
    cuartos[slug] = cuarto.id;
  }

  // ── El proveedor local y su dirección ───────────────────────────────────
  const { servidor, puerto } = await levantar();
  const muerto = opciones.puertoMuerto === true;
  if (muerto) await cerrar(servidor);

  // La forma es la real y es la que exige la allowlist: host de loopback, el
  // segmento `/calendar/ical/`, la extensión `.ics` y el `?s=`, que es la parte
  // secreta. `esquemaUrlIcal` admite `127.0.0.1` sobre `http:` por la concesión
  // de testeabilidad con candado de tres vueltas de `lib/domain/ical-url.schema.ts`,
  // que `playwright.config.ts` enciende con `NEXT_PUBLIC_VIVAGUEST_FEED_LOCAL`.
  // ESA ALLOWLIST NO SE TOCA: ampliarla sería abrir una SSRF por comodidad.
  const url = `http://127.0.0.1:${puerto}/calendar/ical/${sufijo}.ics?s=SECRETO${sufijo}`;

  const { error: errorSecreto } = await servicio
    .from('property_secrets')
    .upsert({ property_id: propiedad.id, ical_url: url }, { onConflict: 'property_id' });

  if (errorSecreto) throw new Error(`No se pudo sembrar la URL del feed: ${errorSecreto.message}`);

  const { data: feed, error: errorFeed } = await servicio
    .from('calendar_feeds')
    .insert({
      property_id: propiedad.id,
      provider: 'airbnb',
      is_active: true,
      // Hacia adelante: la corrida de este arnés se dispara a mano, y así el
      // dispatcher de `pg_cron` no ve el feed en su cola por accidente.
      next_sync_at: new Date(Date.now() + 60 * 60_000).toISOString(),
    })
    .select('id')
    .single();

  if (errorFeed || !feed) throw new Error(`No se pudo sembrar el feed: ${errorFeed?.message}`);

  const estado: ServidorDeFeed = {
    servidor,
    hits: 0,
    respuesta: { cuerpo: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n' },
    muerto,
    cabeceras: {},
    servicio,
  };

  if (!muerto) {
    servidor.on('request', (req, res) => {
      estado.hits += 1;
      estado.cabeceras = {};
      for (const [nombre_, valor] of Object.entries(req.headers)) {
        if (typeof valor === 'string') estado.cabeceras[nombre_.toLowerCase()] = valor;
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
  }

  registro.set(feed.id, estado);

  return {
    propiedadId: propiedad.id,
    feedId: feed.id,
    nombre,
    cluster,
    gestionada,
    responsable,
    suplente,
    contactoExterno,
    cuartos: { general: cuartos.general, habitacion: cuartos.habitacion },
    tarifas: gestionada ? { ...TARIFAS } : null,
    sufijo,
  };
}

/**
 * Deja el feed COMO LO DEJA EL ADMIN CUANDO CONECTA EL CALENDARIO, y sin esto
 * hay una guarda del worker que ninguna prueba de interfaz puede alcanzar.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESTA FUNCIÓN LA ESCRIBIÓ UN SEÑUELO QUE NO PUSO NADA EN ROJO.
 *
 * El bloque 8 de `app/api/cron/sync-feed/route.ts` corta con `sin_cambios`
 * cuando el sha256 del cuerpo coincide con `last_payload_hash`, PERO solo si ya
 * hubo una corrida `ok` antes. Esa segunda condición existe por un caso
 * concreto: `guardarFeed` escribe `last_payload_hash` AL CONECTAR el calendario,
 * sin haber llamado nunca al RPC, así que sin ella un apartamento recién
 * conectado vería su primer sync cortado por el hash y NO GENERARÍA NI UN ASEO
 * hasta que el proveedor cambiara el cuerpo.
 *
 * Medido: con el sembrador dejando `last_payload_hash` en nulo, quitar esa
 * segunda condición del worker deja los tres casos de `recorrido-core` EN VERDE.
 * O sea que el arnés no reproducía el estado de partida real y la guarda quedaba
 * sin ejercitar. Con esta función, el recorrido arranca donde arranca de verdad:
 * en un calendario que un admin ya validó.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Los dos valores salen del MISMO camino que en producción: el hash del cuerpo
 * y el conteo de reservas clasificadas, que es lo que `last_event_count` guarda
 * (reservas, no eventos) y lo que la pantalla del calendario le mostró al admin.
 */
export async function conectarFeed(feedId: string, cuerpo: string): Promise<void> {
  const estado = registro.get(feedId);
  if (!estado) throw new Error(`El feed ${feedId} no lo sembró este arnés.`);

  const ahora = new Date().toISOString();
  const { error } = await estado.servicio
    .from('calendar_feeds')
    .update({
      last_attempt_at: ahora,
      last_success_at: ahora,
      last_http_status: 200,
      last_event_count: contarPorClasificacion(normalizarIcs(cuerpo)).reservation_count,
      last_payload_hash: createHash('sha256').update(cuerpo).digest('hex'),
      last_error: null,
      consecutive_failures: 0,
    })
    .eq('id', feedId);

  if (error) throw new Error(`No se pudo marcar el feed como conectado: ${error.message}`);
}

// ───────────────────────────────────────────────────────────────────────────
// 4. LA CORRIDA, POR HTTP
// ───────────────────────────────────────────────────────────────────────────

export type FilaDeCorrida = Database['public']['Tables']['feed_sync_runs']['Row'];
export type FilaDeFeed = Database['public']['Tables']['calendar_feeds']['Row'];
export type FilaDeAseo = Database['public']['Tables']['cleanings']['Row'];

export type OpcionesDeCorrida = {
  contentType?: string;
  status?: number;
  location?: string;
  etag?: string;
};

export type ResultadoDeCorrida = {
  /** Status del worker, no del proveedor. 200 salvo guard o cuerpo malo. */
  status: number;
  /** El JSON del worker: `outcome`, código y los cuatro contadores. */
  cuerpo: Record<string, unknown>;
  /** La última fila de `feed_sync_runs` de este feed. */
  corrida: FilaDeCorrida | null;
  /** La fila del feed después de la corrida: salud, backoff y lease. */
  feed: FilaDeFeed;
  /** Peticiones que recibió el proveedor en ESTA corrida. */
  hits: number;
  /** Cabeceras de la última petición al proveedor. Ver `ServidorDeFeed.cabeceras`. */
  cabeceras: Record<string, string>;
};

/**
 * La base del servidor que levantó Playwright.
 *
 * `PLAYWRIGHT_PORT` es obligatorio en cualquier máquina con más de un checkout,
 * y `playwright.config.ts` lo explica con la medición: con el 3000 ocupado por
 * otro proyecto, `reuseExistingServer` reutiliza el ajeno sin avisar y la suite
 * entera mide otra aplicación.
 */
function baseDelServidor(): string {
  return `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? 3000}`;
}

/**
 * Corre el sync de UN feed: programa lo que el proveedor va a servir y hace el
 * `POST` por HTTP con el secreto compartido.
 *
 * El servidor local se levantó en `sembrarUnidadDeRecorrido()` y no aquí: la
 * dirección tiene que estar persistida ANTES de la primera corrida, así que el
 * puerto se decide al sembrar. Lo que esta función decide es QUÉ se sirve, que
 * es la variable que los recorridos mueven.
 */
export async function correrSync(
  request: APIRequestContext,
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
      'Falta CRON_SHARED_SECRET en el proceso del TEST.\n' +
        'Lo carga `cargarEnvLocal()` desde .env.local; llámalo en el beforeAll del spec.',
    );
  }

  const respuesta = await request.post(`${baseDelServidor()}/api/cron/sync-feed`, {
    headers: { 'content-type': 'application/json', 'x-cron-secret': secreto },
    data: { feed_id: feedId },
    // El worker declara `maxDuration = 60` y hace un fetch con timeout de 15 s.
    timeout: 60_000,
  });

  // ── EL 401 NO ES UN ROJO MUDO, Y ESTA ES LA ÚNICA RAZÓN POR LA QUE ESTE
  //    BLOQUE EXISTE ──────────────────────────────────────────────────────
  // El worker responde 401 SIN CUERPO a propósito. Sin este mensaje, un secreto
  // que el proceso del SERVIDOR no ve es indistinguible de un defecto del guard,
  // y el diagnóstico cuesta una hora buscando en el sitio equivocado.
  if (respuesta.status() === 401) {
    throw new Error(
      'El worker respondió 401 sin cuerpo.\n' +
        'Casi siempre es esto: CRON_SHARED_SECRET tiene que verlo el proceso del SERVIDOR\n' +
        `de Next (el que levanta playwright.config.ts en ${baseDelServidor()}), no solo el\n` +
        'proceso del test. `next start` carga .env.local; si lo arrancaste a mano con un\n' +
        'entorno recortado, la variable no llegó. Y si el valor difiere entre los dos\n' +
        'procesos, el guard niega igual.',
    );
  }

  const texto = await respuesta.text();
  const json: Record<string, unknown> = texto ? (JSON.parse(texto) as Record<string, unknown>) : {};

  const { data: corrida } = await estado.servicio
    .from('feed_sync_runs')
    .select('*')
    .eq('feed_id', feedId)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: feed, error: errorFeed } = await estado.servicio
    .from('calendar_feeds')
    .select('*')
    .eq('id', feedId)
    .single();

  if (errorFeed || !feed) throw new Error(`No se pudo releer el feed: ${errorFeed?.message}`);

  return {
    status: respuesta.status(),
    cuerpo: json,
    corrida: corrida ?? null,
    feed,
    hits: estado.hits - hitsAntes,
    cabeceras: { ...estado.cabeceras },
  };
}

/** Cambia el `DTSTAMP` de todo el feed sin tocar nada más. */
function conDtstamp(cuerpo: string, valor: string): string {
  return cuerpo.replace(/DTSTAMP:[0-9TZ]+/g, `DTSTAMP:${valor}`);
}

/**
 * Corre el sync ENCADENANDO: cada llamada sobre el mismo feed lleva un `DTSTAMP`
 * distinto, así que el atajo por hash del worker no la corta nunca y el RPC se
 * ejecuta de verdad todas las veces.
 *
 * ── POR QUÉ HACE FALTA, Y NO ES UN DETALLE ─────────────────────────────────
 * El bloque 8 de `route.ts` corta con `sin_cambios` cuando el sha256 del cuerpo
 * coincide con el de la corrida anterior. Servir el mismo texto dos veces NO
 * llega al RPC, así que una prueba de idempotencia escrita así estaría midiendo
 * EL ATAJO DEL WORKER y no el diff: un diff que duplicara aseos pasaría verde
 * igual. `DTSTAMP` es exactamente el campo que cambia el hash del cuerpo y no
 * entra en el `payloadHash` del evento —`hashDe([uid, startsOn, endsOn, summary,
 * reservationCode])`— ni lo lee el normalizador.
 *
 * El contador es POR FEED y arranca en cero al sembrar, así que dos recorridos
 * del mismo archivo no se pisan la secuencia.
 */
export async function correrSyncEncadenado(
  request: APIRequestContext,
  feedId: string,
  cuerpo: string,
  opciones: OpcionesDeCorrida = {},
): Promise<ResultadoDeCorrida> {
  const n = (corridasPorFeed.get(feedId) ?? 0) + 1;
  corridasPorFeed.set(feedId, n);

  // Marca válida y distinta por corrida. Con `n` hasta 86399 la hora sigue
  // siendo legal, y ningún recorrido encadena tantas.
  const hh = String(Math.floor(n / 3600) % 24).padStart(2, '0');
  const mm = String(Math.floor(n / 60) % 60).padStart(2, '0');
  const ss = String(n % 60).padStart(2, '0');

  return correrSync(request, feedId, conDtstamp(cuerpo, `20260903T${hh}${mm}${ss}Z`), opciones);
}

// ───────────────────────────────────────────────────────────────────────────
// 5. LECTURA Y LIMPIEZA
// ───────────────────────────────────────────────────────────────────────────

/** Los aseos del apartamento, en orden de fecha. Es la aserción de casi todo. */
export async function aseosDe(servicio: Servicio, propiedadId: string): Promise<FilaDeAseo[]> {
  const { data, error } = await servicio
    .from('cleanings')
    .select('*')
    .eq('property_id', propiedadId)
    .order('scheduled_date', { ascending: true });

  if (error) throw new Error(`No se pudieron leer los aseos: ${error.message}`);
  return data ?? [];
}

/** Aseos vivos: todo lo que no está cancelado. */
export async function aseosVivosDe(
  servicio: Servicio,
  propiedadId: string,
): Promise<FilaDeAseo[]> {
  return (await aseosDe(servicio, propiedadId)).filter((a) => a.state !== 'cancelada');
}

/**
 * Cierra los proveedores y borra lo sembrado, EN ORDEN DE FK.
 *
 * Idempotente: la segunda llamada no hace nada y no lanza, que es lo que permite
 * ponerla en un `afterAll` y también en el camino de error de un recorrido.
 *
 * Los servidores se cierran SIEMPRE, aunque el borrado falle: un `node:http`
 * olvidado deja el proceso de Playwright colgado al final de la suite, y el
 * síntoma —"la suite terminó pero el comando no vuelve"— no se parece en nada a
 * su causa.
 */
export async function limpiarRecorrido(servicio: Servicio): Promise<void> {
  for (const estado of registro.values()) {
    if (!estado.muerto) await cerrar(estado.servidor);
  }
  registro.clear();
  corridasPorFeed.clear();

  const propiedades = [...propiedadesSembradas];
  const usuarios = [...usuariosSembrados];
  const periodos = [...periodosCerradosPorRecorrido];
  propiedadesSembradas.length = 0;
  usuariosSembrados.length = 0;
  periodosCerradosPorRecorrido.length = 0;

  // 0. El cierre de periodo que dejó el recorrido del dinero, EN ORDEN:
  //    `cleaner_payouts.periodo_desde` referencia la cabecera con `on delete
  //    restrict`, así que borrarla primero da 23503. Las líneas del desglose caen
  //    por cascade desde el pago, y NO tienen clave foránea contra `cleanings`
  //    (migración 23, a propósito), así que el orden contra los aseos da igual.
  if (periodos.length > 0) {
    const pagos = await servicio
      .from('cleaner_payouts')
      .delete()
      .in('periodo_desde', periodos);
    if (pagos.error) throw new Error(`No se pudieron borrar los pagos: ${pagos.error.message}`);

    const cabeceras = await servicio
      .from('payout_periods')
      .delete()
      .in('periodo_desde', periodos);
    if (cabeceras.error) {
      throw new Error(`No se pudieron borrar los periodos: ${cabeceras.error.message}`);
    }
  }

  if (propiedades.length > 0) {
    // 1. Los aseos, por apartamento y no por la lista de ids que este módulo
    //    creó: los que nacieron del sync no están en ninguna lista.
    const aseos = await servicio.from('cleanings').delete().in('property_id', propiedades);
    if (aseos.error) throw new Error(`No se pudieron borrar los aseos: ${aseos.error.message}`);

    // 2. Los apartamentos. Feeds, reservas, secretos, cuartos, notificaciones y
    //    bitácora de corridas caen solos por cascade.
    const props = await servicio.from('properties').delete().in('id', propiedades);
    if (props.error) {
      throw new Error(`No se pudieron borrar los apartamentos: ${props.error.message}`);
    }
  }

  // 3. Las personas que ESTE arnés creó. `profiles` cae por cascade desde
  //    `auth.users`, y va al final porque `properties.responsable_id` referencia
  //    `profiles` con `on delete restrict`. Una responsable prestada
  //    (`opciones.responsable`) nunca entró en esta lista y no se toca.
  for (const id of usuarios) {
    await servicio.auth.admin.deleteUser(id);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// 6. LA ENTREGA DE UN PUSH AL SERVICE WORKER
// ───────────────────────────────────────────────────────────────────────────

/** Lo que el service worker acabó pintando en la bandeja del navegador. */
export type AvisoPintado = { title: string; body: string; data: unknown };

/**
 * Entrega un push al service worker por el protocolo de DevTools y devuelve lo
 * que se pintó.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESTE INSTRUMENTO ES GEMELO DEL `entregarPush()` DE
 * `e2e/push-instalacion.spec.ts`, Y LA DUPLICACIÓN ES DELIBERADA.
 *
 * No se puede importar del otro archivo: un spec que importa otro spec registra
 * los casos del importado UNA SEGUNDA VEZ, así que la suite contaría los seis
 * casos de push dos veces y `forbidOnly` dejaría de significar nada. Y no se
 * puede MOVER allá aquí, porque el plan 09-04 tiene prohibido tocar los specs
 * anteriores: el diff de este plan no puede incluir ninguna aserción existente.
 *
 * Vive en este módulo —que no es un spec— para que el día que alguien sí pueda
 * unificarlos, el sitio al que mover el otro ya exista.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── LAS DOS COSAS QUE HACEN QUE ESTO FUNCIONE, LAS DOS MEDIDAS EN LA FASE 5 ─
 *
 *   1. CONTEXTO PERSISTENTE (`contextoPersistente`): todo `browser.newContext()`
 *      es incógnito, y Chrome no implementa la API de push en incógnito.
 *   2. CANAL `chrome` y no el Chromium empaquetado, que no lleva las claves de
 *      API de Google (trampa 7 de `TESTING.md`).
 *
 * ── Y LA OBSERVACIÓN VA CONTRA EL REGISTRO, NO CONTRA UN ESPÍA ─────────────
 *
 * Se lee `registration.getNotifications()` DESDE la página en vez de parchear
 * `showNotification`. Un espía inyectado mide que se llamó a una función; esto
 * mide que la notificación EXISTE en el registro del navegador, que es la
 * propiedad de la que depende que Safari no revoque la suscripción.
 *
 * Se sondea con `expect.poll` y NO con `waitForFunction`: el predicado es
 * asíncrono, y `waitForFunction` da por buena la promesa en sí —que siempre es
 * un valor verdadero— y devuelve en el primer intento. Medido en la Fase 5: el
 * caso pasaba a verde sin haber leído una sola notificación.
 */
export async function entregarPushAlWorker(
  pagina: Page,
  datos: string,
): Promise<AvisoPintado[]> {
  const cdp = await pagina.context().newCDPSession(pagina);

  // El identificador de registro se obtiene suscribiéndose al evento que el
  // navegador emite AL HABILITAR el dominio con los registros que ya existen: la
  // página tiene que haber registrado su worker antes de llegar aquí.
  const encontrado = new Promise<string>((resolver, rechazar) => {
    const temporizador = setTimeout(
      () => rechazar(new Error('El navegador no reportó ningún registro de service worker en 15s')),
      15_000,
    );
    cdp.on('ServiceWorker.workerRegistrationUpdated', (evento) => {
      const vivo = evento.registrations.find((r) => !r.isDeleted);
      if (!vivo) return;
      clearTimeout(temporizador);
      resolver(vivo.registrationId);
    });
  });

  await cdp.send('ServiceWorker.enable');
  const registrationId = await encontrado;

  const leerBandeja = () =>
    pagina.evaluate(async () => {
      const registro = await navigator.serviceWorker.ready;
      return (await registro.getNotifications()).map((n) => ({
        title: n.title,
        body: n.body,
        data: n.data as unknown,
      }));
    });

  // ── LA ENTREGA SE REINTENTA UNA VEZ, Y LA ASERCIÓN NO SE AFLOJA ──────────
  //
  // `ServiceWorker.deliverPushMessage` es un disparo sin acuse: el protocolo
  // responde en cuanto acepta el mensaje, no cuando el worker lo procesa, y una
  // parte de las entregas se pierde sin dejar rastro. MEDIDO sobre el recorrido
  // del Core Value: **1 de cada 5 corridas** se quedaba en cero notificaciones
  // tras 15 s de sondeo. Es la misma intermitencia que `deferred-items.md` de la
  // Fase 8 tiene declarada para el caso E2 de `push-instalacion.spec.ts`, que usa
  // este mismo instrumento; aquí se reproduce con el archivo aislado.
  //
  // El reintento va sobre LA ENTREGA, nunca sobre la medida: quien llama sigue
  // exigiendo EXACTAMENTE una notificación. Si la primera entrega no se hubiera
  // perdido sino que solo fuera lenta, la segunda produciría DOS avisos y el caso
  // se pondría rojo diciéndolo, en vez de tapar que el modelo de fallo es otro.
  const ventanas = [15_000, 20_000];

  for (const ventana of ventanas) {
    await cdp.send('ServiceWorker.deliverPushMessage', {
      origin: new URL(pagina.url()).origin,
      registrationId,
      data: datos,
    });

    const limite = Date.now() + ventana;
    while (Date.now() < limite) {
      const lista = await leerBandeja();
      if (lista.length > 0) {
        // La bandeja se limpia aquí y no en un `afterEach`: una notificación
        // heredada pondría verde la próxima entrega sin haber entregado nada.
        await pagina.evaluate(async () => {
          const registro = await navigator.serviceWorker.ready;
          for (const n of await registro.getNotifications()) n.close();
        });
        await cdp.detach();
        return lista;
      }
      await pagina.waitForTimeout(250);
    }
  }

  await cdp.detach();
  throw new Error(
    'El service worker no mostró ninguna notificación tras DOS entregas por el protocolo de DevTools.\n' +
      'Dos entregas perdidas seguidas ya no son la intermitencia conocida: mira el handler de `push` del worker.',
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 7. EL CALENDARIO DEL CIERRE
// ───────────────────────────────────────────────────────────────────────────

/** Un periodo de pago, de cierre a cierre (D7-5). Las dos fechas son reales. */
export type PeriodoDeCierre = { desde: string; hasta: string };

/**
 * El periodo vencido que la pantalla de Pagos ofrece cerrar, PREGUNTÁNDOSELO AL
 * CALENDARIO DE LA BASE.
 *
 * No se llama a `public.periodo_pendiente_de_cierre()` aunque sea exactamente lo
 * que la pantalla consulta: esa función lleva guarda de admin y la comprueba
 * contra `profiles` en vivo, así que el cliente de servicio —que no es nadie—
 * choca con `no_autorizado`. Se reconstruye por el mismo camino que usa
 * `sembrarFinanzas()`: el periodo que contiene hoy, y el que termina el día
 * anterior a su comienzo. Dos periodos consecutivos son contiguos por definición
 * de D7-5, así que ese es el vencido más reciente.
 *
 * Queda REGISTRADO para que `limpiarRecorrido()` lo borre: la lista de
 * `/finanzas/pagos` es acumulativa, y un periodo cerrado que sobreviva a la
 * corrida se pinta como un bloque más en la siguiente. `finanzas.spec.ts` afirma
 * que hay exactamente dos bloques, así que dejarlo ahí rompería otro archivo con
 * un síntoma que no se parece en nada a su causa.
 */
export async function periodoVencidoSinCerrar(servicio: Servicio): Promise<PeriodoDeCierre> {
  const pedir = async (dia: string): Promise<PeriodoDeCierre> => {
    const { data, error } = await servicio.rpc('periodo_de_cierre', { p_dia: dia });
    if (error) throw new Error(`No se pudo resolver el periodo de ${dia}: ${error.message}`);
    const fila = (data ?? [])[0];
    if (!fila) throw new Error(`periodo_de_cierre(${dia}) no devolvió ninguna fila.`);
    return { desde: fila.periodo_desde, hasta: fila.periodo_hasta };
  };

  const { data: hoy, error: errorHoy } = await servicio.rpc('today_bog');
  if (errorHoy || !hoy) throw new Error(`No se pudo leer el día de negocio: ${errorHoy?.message}`);

  const enCurso = await pedir(hoy);
  const vencido = await pedir(sumarDias(enCurso.desde, -1));

  periodosCerradosPorRecorrido.push(vencido.desde);
  return vencido;
}

/** Días de calendario entre dos días de negocio. Negativo si `hasta` es anterior. */
function diasEntre(desde: string, hasta: string): number {
  const aMs = (dia: string) => {
    const [ano, mes, d] = dia.split('-').map(Number);
    return Date.UTC(ano, mes - 1, d);
  };
  return Math.round((aMs(hasta) - aMs(desde)) / 86_400_000);
}

/**
 * Mueve el calendario entero de un aseo YA TERMINADO hasta un día destino.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ES EL ÚNICO VIAJE EN EL TIEMPO DE TODA LA FASE, Y ESTÁ AQUÍ PORQUE LA BASE SE
 * NIEGA A CERRAR UN PERIODO QUE NO HA VENCIDO. CON RAZÓN.
 *
 * `public.cerrar_periodo()` rechaza con `periodo_no_vencido` cualquier rango
 * cuyo día de cierre no haya pasado ESTRICTAMENTE, y la interfaz ni siquiera
 * ofrece el botón salvo que `periodo_pendiente_de_cierre()` devuelva una fila.
 * Las dos cosas son correctas y ninguna se toca: cerrar por adelantado pagaría
 * trabajo que aún no ocurrió, y como un periodo cerrado NO SE RECALCULA NUNCA
 * (D7-3), ese error quedaría congelado para siempre en el bolsillo de alguien.
 *
 * O sea que un aseo terminado HOY pertenece al periodo en curso, y el periodo en
 * curso no se puede cerrar hasta dentro de semanas. Las alternativas eran tres:
 * no probar la última junta, probarla llamando al RPC por debajo de la interfaz,
 * o mover el aseo. Las dos primeras dejan sin probar justo lo que el dueño va a
 * tocar con el dedo, así que se mueve el aseo.
 *
 * ── QUÉ SE MUEVE Y POR QUÉ SE MUEVE TODO JUNTO ────────────────────────────
 *
 * `scheduled_date`, `confirmado_at`, `started_at` y `finished_at`, TODOS con el
 * mismo desplazamiento en días enteros. No se mueve solo `finished_at` —que es
 * lo único que decide la pertenencia al periodo (D7-8)— porque eso dejaría un
 * aseo «programado en septiembre y hecho en agosto», que es una fila que el
 * sistema no sabe producir, y porque `cl_completada_shape` exige
 * `finished_at >= started_at`. Con el calendario entero corrido, la fila sigue
 * siendo internamente coherente: es el mismo aseo, otro mes.
 *
 * Colombia no tiene horario de verano, así que restar días de 86 400 segundos
 * conserva la hora local: `public.dia_bog(finished_at)` aterriza exactamente en
 * el día destino y no en su víspera.
 *
 * ── LO QUE ESTO **NO** DEBILITA, Y ES LO QUE HACE QUE SEA ACEPTABLE ────────
 *
 *   · Las dos tarifas del aseo NO se mueven ni se recalculan. El trigger
 *     `tg_cleanings_snapshot()` REIMPONE los valores viejos en todo `UPDATE`
 *     sobre un aseo en estado terminal, incluso con la clave de servicio
 *     (BYPASSRLS no es «bypass triggers»). O sea que el snapshot de FIN-01 llega
 *     al cierre intacto, y este movimiento no lo puede falsear ni queriendo.
 *   · La regla que decide el periodo se ejercita DE VERDAD: el cierre lee
 *     `public.dia_bog(finished_at)` y no la fecha programada, y este aseo entra
 *     en el recibo porque ese instante cae dentro del rango.
 *   · El cierre lo dispara el ADMIN DESDE SU PANTALLA, con su RPC y sus dos
 *     guardas. Lo único que cambia es el mes en el que ocurrió el trabajo.
 * ════════════════════════════════════════════════════════════════════════════
 */
export async function adelantarElCalendarioDelAseo(
  servicio: Servicio,
  aseoId: string,
  diaDestino: string,
): Promise<void> {
  const { data: antes, error } = await servicio
    .from('cleanings')
    .select('scheduled_date, confirmado_at, started_at, finished_at')
    .eq('id', aseoId)
    .single();

  if (error || !antes) throw new Error(`No se pudo releer el aseo ${aseoId}: ${error?.message}`);

  if (antes.finished_at === null) {
    throw new Error(
      'adelantarElCalendarioDelAseo() solo vale sobre un aseo YA TERMINADO.\n' +
        'Sin `finished_at` no hay nada que mover y el aseo no entraría en ningún cierre.',
    );
  }

  const dias = diasEntre(antes.scheduled_date, diaDestino);
  const correr = (iso: string | null): string | null =>
    iso === null ? null : new Date(new Date(iso).getTime() + dias * 86_400_000).toISOString();

  const { error: errorUpdate } = await servicio
    .from('cleanings')
    .update({
      scheduled_date: diaDestino,
      confirmado_at: correr(antes.confirmado_at),
      started_at: correr(antes.started_at),
      finished_at: correr(antes.finished_at),
    })
    .eq('id', aseoId);

  if (errorUpdate) {
    throw new Error(`No se pudo mover el calendario del aseo: ${errorUpdate.message}`);
  }
}
