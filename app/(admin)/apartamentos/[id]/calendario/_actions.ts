'use server';

import 'server-only';

import { createHash } from 'node:crypto';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { NoAutorizado, exigirAdmin } from '@/lib/auth/guards';
import {
  actualizarSaludSiExiste,
  leerFeedDeApartamento,
  registrarSaludDelFeed,
  resumirFallo,
  type MotivoDeFallo,
  type SaludDelFeed,
} from '@/lib/data/feeds';
import type { ResultadoAccion } from '@/lib/domain/acciones';
import { hoyBog } from '@/lib/domain/dates';
import { mapDbError } from '@/lib/domain/errors';
import { previsualizarIcs } from '@/lib/domain/ical-preview';
import { esquemaUrlIcal, MENSAJE_FORMATO_INVALIDO } from '@/lib/domain/ical-url.schema';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * APTO-12 — validar en vivo y conectar el calendario de un apartamento.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * LA COSTURA CON LA FASE 3. REGLA DURA, NO UNA RECOMENDACIÓN.
 *
 * ESTE ARCHIVO NO ESCRIBE `calendar_reservations` Y NO CREA NINGÚN ASEO. Ni una
 * fila, ni por un camino indirecto. Lo que hace es DIAGNÓSTICO: traer el cuerpo
 * del feed, contar, y guardar dos cosas — la URL en `property_secrets` y las
 * columnas de SALUD de `calendar_feeds`, que existen exactamente para esto.
 *
 * El pipeline que persiste reservas y genera o cancela aseos es de la Fase 3, y
 * está bloqueado por un prerequisito humano (capturar un `.ics` real de la
 * cuenta de Airbnb de VivaGuest). Las preguntas que ese pipeline tiene que
 * responder —¿el `UID` es estable?, ¿la identidad va por código de reserva?,
 * ¿el upsert es por clave natural?— NO HACEN FALTA AQUÍ, porque aquí no se
 * persiste ninguna reserva.
 *
 * Y NADIE DEBE "ARREGLAR" LA DIVERGENCIA entre lo que cuenta este preview y lo
 * que contará el pipeline. El preview es deliberadamente MÁS LAXO
 * (`lib/domain/ical-preview.ts` lo explica). Reintroducir aquí la lógica de la
 * Fase 3 es exactamente lo que no se debe hacer.
 *
 * Lo sostiene un test: `lib/domain/feed.integration.test.ts` cuenta las filas de
 * las dos tablas antes y después de conectar, con un centinela sembrado para
 * que la igualdad no sea `0 === 0`.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── LA URL ES UNA CREDENCIAL (T-02-73) ──────────────────────────────────────
 * Un GET a la URL de exportación revela la ocupación completa del apartamento
 * SIN AUTENTICARSE. Consecuencias que este archivo respeta:
 *   · NO se escribe en ningún log. Ni `console.log`, ni `console.error`.
 *   · NO viaja a `last_error`: ahí van el status y el motivo, y los produce
 *     `resumirFallo()` de `lib/data/feeds.ts`, que ni siquiera recibe la URL.
 *   · NO se devuelve al cliente salvo por `revelarUrlIcal`, que es una acción
 *     explícita del admin (el botón `Mostrar`) y tiene su propio guard.
 *
 * ── LAS DOS MITADES DE LA DEFENSA ANTI-SSRF (T-02-72) ────────────────────────
 * El servidor hace `fetch` sobre una dirección que escribe un usuario.
 *   1. `esquemaUrlIcal` valida el host ANTES del fetch, parseando con `URL`.
 *   2. `redirect: 'manual'` en el fetch, porque la mitad 1 valida lo que el
 *      usuario ESCRIBE y no a dónde TERMINA la petición: un 302 hacia
 *      `169.254.169.254` o hacia el puerto de Supabase saltaría la allowlist
 *      entera. Un 3xx se trata como feed inalcanzable, que además es
 *      semánticamente correcto: Airbnb sirve el `.ics` directo.
 * Ninguna de las dos sobra y quitar cualquiera reabre el agujero.
 *
 * ── EL REPARTO DE CLIENTES ES DEL MODELO DE GRANTS, NO UNA PREFERENCIA ───────
 * ┌──────────────────┬───────────────────────┬──────────────────────────────┐
 * │ property_secrets │ cliente ADMINISTRATIVO│ 02-RESEARCH §8.6: `42501     │
 * │                  │                       │ permission denied` incluso   │
 * │                  │                       │ siendo admin con su JWT      │
 * │ calendar_feeds   │ cliente del USUARIO   │ §8.6: el upsert pasa         │
 * └──────────────────┴───────────────────────┴──────────────────────────────┘
 * Y `exigirAdmin()` es la PRIMERA sentencia de las tres actions, antes de
 * construir el cliente que salta la RLS. Un Server Action es un endpoint HTTP
 * público: sin el guard, `validarFeed` sería un proxy de fetch abierto a
 * cualquiera. Lo vigila el guardarraíl 7 de `scripts/ci/check-service-role.sh`.
 *
 * ── `maxDuration` ───────────────────────────────────────────────────────────
 * Está declarado al final de este archivo Y en `page.tsx`. La nota de allí
 * explica cuál de los dos es el que la plataforma lee.
 */

/** El timeout duro de UI-SPEC §10.3 estado 3. */
const TIMEOUT_MS = 10_000;

/**
 * Techo de cuerpo, 5 MiB (T-02-79). Un `.ics` de un apartamento con un año de
 * reservas pesa decenas de KB; 5 MiB es holgado por dos órdenes de magnitud.
 * Sin techo, un servidor hostil —o uno de Airbnb con un bug— puede mandar un
 * cuerpo interminable y `res.text()` lo acumula entero en memoria: el
 * `AbortSignal` cubre la lentitud, no el tamaño.
 */
const MAX_BYTES = 5 * 1024 * 1024;

/** El resultado que la pantalla convierte en uno de los siete estados. */
export type ResultadoValidacion =
  /** Estado 2. No hubo NINGUNA petición de red. */
  | { estado: 'formato-invalido'; mensaje: string }
  /** Ni sesión ni rol. La pantalla no debería llegar aquí. */
  | { estado: 'no-autorizado'; mensaje: string }
  /** Estado 4: 2xx, iCal parseable y al menos un evento futuro. */
  | {
      estado: 'valido';
      reservas: number;
      bloqueos: number;
      totalEventos: number;
      /** El `DTEND` tal cual, sin sumar ni restar un día. */
      proximoCheckout: string;
      dtstamp: string | null;
      httpStatus: number;
      payloadHash: string;
    }
  /** Estado 5: 2xx, iCal parseable, y NADA por delante. No es un error. */
  | {
      estado: 'sin-reservas';
      totalEventos: number;
      httpStatus: number;
      dtstamp: string | null;
      payloadHash: string;
    }
  /** Estado 6: 2xx con un cuerpo que no es un calendario. */
  | { estado: 'no-es-ical'; httpStatus: number }
  /** Estado 7: no-2xx, 3xx, timeout o error de red. */
  | { estado: 'inalcanzable'; motivo: MotivoDeFallo; httpStatus: number | null };

/** Lo que `guardarFeed` acepta guardar. El resto no validó (UI-SPEC §10.3). */
const esquemaResultadoGuardable = z.discriminatedUnion('estado', [
  z.object({
    estado: z.literal('valido'),
    reservas: z.number().int().min(0),
    httpStatus: z.number().int().min(200).max(299),
    payloadHash: z.string().regex(/^[0-9a-f]{64}$/),
  }),
  z.object({
    estado: z.literal('sin-reservas'),
    httpStatus: z.number().int().min(200).max(299),
    payloadHash: z.string().regex(/^[0-9a-f]{64}$/),
  }),
]);

const esquemaId = z.uuid();

/**
 * Lee el cuerpo con un techo de bytes.
 *
 * Se drena por el lector del stream en vez de con `res.text()` a secas para que
 * el techo se aplique DURANTE la descarga y no después de haberla acumulado
 * entera, que es justo lo que se quiere evitar.
 */
async function leerCuerpoAcotado(res: Response): Promise<string> {
  const cuerpo = res.body;
  if (!cuerpo) return '';

  const lector = cuerpo.getReader();
  const trozos: Uint8Array[] = [];
  let bytes = 0;

  try {
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      if (!value) continue;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) {
        await lector.cancel();
        break;
      }
      trozos.push(value);
    }
  } finally {
    lector.releaseLock();
  }

  return new TextDecoder('utf-8').decode(Buffer.concat(trozos));
}

/** Clasificación de UI-SPEC §10.3 estado 7, por familia de status. */
function motivoPorStatus(status: number): MotivoDeFallo {
  if (status >= 300 && status < 400) return 'redirigido';
  if (status === 404 || status === 410) return 'no-encontrado';
  if (status >= 500) return 'servidor';
  return 'rechazado';
}

/** La salud que corresponde a un resultado que NO es un 2xx con iCal. */
function saludDeFallo(
  motivo: MotivoDeFallo,
  status: number | null,
  fallosPrevios: number,
): SaludDelFeed {
  return {
    last_attempt_at: new Date().toISOString(),
    last_success_at: null,
    last_http_status: status,
    last_event_count: null,
    last_payload_hash: null,
    last_error: resumirFallo(motivo, status),
    consecutive_failures: fallosPrevios + 1,
  };
}

/**
 * Valida el link EN EL SERVIDOR y devuelve los cuatro hechos que APTO-12
 * necesita pintar. No guarda la URL: eso es `guardarFeed`.
 *
 * Si el apartamento YA tiene feed, registra el intento en sus columnas de
 * salud. Si no lo tiene, no escribe nada: crear la fila aquí haría que la
 * columna 7 de la lista dijera que hay calendario conectado por el mero hecho
 * de que alguien pegó un link y le dio a validar.
 */
export async function validarFeed(
  propertyId: string,
  url: string,
): Promise<ResultadoValidacion> {
  // ── 1. GUARD, ANTES DE NADA. Sin él esto es un proxy de fetch abierto ──────
  const contexto = await exigirAdmin().catch((e: unknown) => {
    if (e instanceof NoAutorizado) return null;
    throw e;
  });
  if (!contexto) {
    return { estado: 'no-autorizado', mensaje: 'No tienes permiso para esta operación.' };
  }
  const { supabase } = contexto;

  // ── 2. FORMATO. SIN NINGUNA PETICIÓN DE RED ───────────────────────────────
  // El orden es el que hace verdadero el estado 2 de UI-SPEC §10.3: un link mal
  // pegado se rechaza sin que el servidor hable con nadie. `e2e/calendario.spec.ts`
  // lo comprueba contando los hits del servidor local de fixtures.
  const revisadoId = esquemaId.safeParse(propertyId);
  const revisadaUrl = esquemaUrlIcal.safeParse(url);
  if (!revisadoId.success || !revisadaUrl.success) {
    return { estado: 'formato-invalido', mensaje: MENSAJE_FORMATO_INVALIDO };
  }

  const feedExistente = await leerFeedDeApartamento(supabase, revisadoId.data);
  const fallosPrevios = feedExistente?.consecutive_failures ?? 0;

  const anotar = async (salud: SaludDelFeed): Promise<void> => {
    if (!feedExistente) return;
    await actualizarSaludSiExiste(supabase, revisadoId.data, salud);
  };

  // ── 3. EL FETCH, CON LAS DOS DEFENSAS Y EL TIMEOUT DURO ───────────────────
  let res: Response;
  try {
    res = await fetch(revisadaUrl.data, {
      // `AbortSignal.timeout` y NO un `Promise.race` con `setTimeout`: el
      // primero aborta la conexión de verdad, el segundo resuelve la promesa y
      // deja el socket colgando hasta que el sistema lo cierre.
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // Segunda mitad de la defensa anti-SSRF. Ver la cabecera.
      redirect: 'manual',
      headers: { Accept: 'text/calendar, text/plain;q=0.9' },
      cache: 'no-store',
    });
  } catch (e) {
    // `AbortSignal.timeout` produce `TimeoutError`; un abort manual, `AbortError`.
    const nombre = e instanceof Error ? e.name : '';
    const motivo: MotivoDeFallo =
      nombre === 'TimeoutError' || nombre === 'AbortError' ? 'tiempo-agotado' : 'red';
    // El error original NO se registra: su `message` puede llevar la URL entera.
    await anotar(saludDeFallo(motivo, null, fallosPrevios));
    return { estado: 'inalcanzable', motivo, httpStatus: null };
  }

  // Con `redirect: 'manual'` un 3xx llega aquí como respuesta con su status, y
  // `res.ok` es false. La redirección NO se sigue.
  if (!res.ok) {
    const motivo = motivoPorStatus(res.status);
    await anotar(saludDeFallo(motivo, res.status, fallosPrevios));
    return { estado: 'inalcanzable', motivo, httpStatus: res.status };
  }

  // ── 4. EL ESCÁNER DEL PLAN 02-03 ──────────────────────────────────────────
  const cuerpo = await leerCuerpoAcotado(res);
  const preview = previsualizarIcs(cuerpo, hoyBog());

  if (!preview.ok) {
    // Estado 6: el modo de falla peligroso. Un feed muerto de Airbnb responde
    // 200 con HTML de error, y sin este corte el escáner reportaría "0
    // reservas" y el admin guardaría un link roto creyendo que sirve.
    await anotar(saludDeFallo('no-es-ical', res.status, fallosPrevios));
    return { estado: 'no-es-ical', httpStatus: res.status };
  }

  const payloadHash = createHash('sha256').update(cuerpo).digest('hex');

  // ── 5. ESTADO 4 vs ESTADO 5 ───────────────────────────────────────────────
  // El corte es "¿hay algo POR DELANTE?", es decir `proximoCheckout === null`, y
  // no `totalEventos === 0`. Airbnb solo exporta fechas futuras, pero un feed
  // con checkouts únicamente en el pasado SÍ trae eventos y no tiene ni un
  // checkout que mostrar: con el corte por `totalEventos` caería en el estado 4
  // con "0 reservas" y sin fecha, que es precisamente la ambigüedad que los dos
  // estados existen para separar (UI-SPEC §10.3 estado 4: "≥1 evento futuro";
  // 02-RESEARCH §4.5: "un apartamento con checkouts solo en el pasado da 0
  // eventos. Es correcto, no es un fallo del link → estado 5").
  const ahora = new Date().toISOString();

  if (preview.proximoCheckout === null) {
    await anotar({
      last_attempt_at: ahora,
      last_success_at: ahora,
      last_http_status: res.status,
      last_event_count: 0,
      last_payload_hash: payloadHash,
      last_error: null,
      consecutive_failures: 0,
    });
    return {
      estado: 'sin-reservas',
      totalEventos: preview.totalEventos,
      httpStatus: res.status,
      dtstamp: preview.dtstamp,
      payloadHash,
    };
  }

  await anotar({
    last_attempt_at: ahora,
    last_success_at: ahora,
    last_http_status: res.status,
    last_event_count: preview.reservas,
    last_payload_hash: payloadHash,
    last_error: null,
    consecutive_failures: 0,
  });

  return {
    estado: 'valido',
    reservas: preview.reservas,
    bloqueos: preview.bloqueos,
    totalEventos: preview.totalEventos,
    proximoCheckout: preview.proximoCheckout,
    dtstamp: preview.dtstamp,
    httpStatus: res.status,
    payloadHash,
  };
}

/**
 * Conecta el calendario: guarda la URL y deja la salud del feed en verde.
 *
 * LOS DOS CLIENTES EN UNA SOLA ACTION Y EL ORDEN ES EL CONTRATO:
 *   1. `exigirAdmin()` con el cliente del usuario.
 *   2. `property_secrets.ical_url` con `createAdminClient()`, que es la única
 *      ruta que la base permite.
 *   3. `calendar_feeds` con el cliente del USUARIO.
 *
 * `resultado` viaja desde el cliente y por eso pasa por Zod: son columnas de
 * diagnóstico y no autorizan nada, pero un `last_event_count` con una cadena
 * dentro sería un 22P02 en producción y un número inventado sería un dato falso
 * en la tabla que la Fase 3 va a leer. Solo se aceptan los dos estados que SÍ
 * validaron; los estados 6 y 7 no se guardan nunca (UI-SPEC §10.3).
 */
export async function guardarFeed(
  propertyId: string,
  url: string,
  resultado: unknown,
): Promise<ResultadoAccion> {
  // ── 1. GUARD ──────────────────────────────────────────────────────────────
  const contexto = await exigirAdmin().catch((e: unknown) => {
    if (e instanceof NoAutorizado) return null;
    throw e;
  });
  if (!contexto) {
    return { ok: false, error: 'No tienes permiso para esta operación.' };
  }
  const { supabase, user } = contexto;

  // ── 2. VALIDACIÓN ─────────────────────────────────────────────────────────
  const revisadoId = esquemaId.safeParse(propertyId);
  if (!revisadoId.success) {
    return { ok: false, error: 'No se pudo identificar el apartamento.' };
  }

  const revisadaUrl = esquemaUrlIcal.safeParse(url);
  if (!revisadaUrl.success) {
    return { ok: false, error: MENSAJE_FORMATO_INVALIDO, campo: 'ical_url' };
  }

  const revisado = esquemaResultadoGuardable.safeParse(resultado);
  if (!revisado.success) {
    return {
      ok: false,
      error: 'Solo se puede guardar un link que ya validó. Vuelve a validarlo.',
      campo: 'ical_url',
    };
  }

  // ── 3. LA URL: CLIENTE ADMINISTRATIVO, LA ÚNICA RUTA POSIBLE ──────────────
  // Con el JWT del admin esta escritura devuelve `42501 permission denied`. No
  // es la RLS: la migración 07 no otorga ningún privilegio de tabla sobre
  // property_secrets a `authenticated`, y el grant se evalúa antes que la
  // policy. El guardarraíl 8 de CI impone que esta línea use la fábrica.
  const admin = createAdminClient();

  const { error: errorSecreto } = await admin.from('property_secrets').upsert(
    {
      property_id: revisadoId.data,
      ical_url: revisadaUrl.data,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'property_id' },
  );

  if (errorSecreto) {
    // El mensaje del error de base se mapea; la URL no entra en él por ningún lado.
    return { ok: false, error: mapDbError(errorSecreto) };
  }

  // ── 4. LA SALUD: CLIENTE DEL USUARIO ──────────────────────────────────────
  // `last_event_count` guarda el número de RESERVAS, que es el que la pantalla
  // mostró y el que el admin verificó contra Airbnb. Así el estado 4 al reabrir
  // (UI-SPEC §10.4 regla 4) dice exactamente lo mismo que dijo al validar. La
  // Fase 3 puede redefinir la métrica; el preview es diagnóstico.
  const ahora = new Date().toISOString();
  const { error: errorFeed } = await registrarSaludDelFeed(supabase, revisadoId.data, {
    last_attempt_at: ahora,
    last_success_at: ahora,
    last_http_status: revisado.data.httpStatus,
    last_event_count: revisado.data.estado === 'valido' ? revisado.data.reservas : 0,
    last_payload_hash: revisado.data.payloadHash,
    last_error: null,
    consecutive_failures: 0,
  });

  if (errorFeed) return { ok: false, error: mapDbError(errorFeed) };

  revalidatePath(`/apartamentos/${revisadoId.data}/calendario`);
  revalidatePath('/apartamentos');

  return { ok: true, mensaje: 'Calendario conectado.' };
}

/**
 * Devuelve la URL guardada ENTERA. Es el botón `Mostrar` de UI-SPEC §10.4.
 *
 * ⚠️ ESTE ES UN ENDPOINT HTTP PÚBLICO QUE DEVUELVE UNA CREDENCIAL. El guard no
 * es defensa en profundidad aquí: es lo único que lo separa de una fuga, porque
 * el cliente administrativo salta la RLS por completo y no hay segunda capa
 * detrás (misma regla que `leerSecretos`, T-02-50).
 *
 * POR QUÉ ES UNA ACTION Y NO UN PROP DE LA PÁGINA, que sería lo obvio: si el
 * RSC pasara la URL entera al componente cliente para que el toggle la
 * mostrara, la cadena viajaría en la carga de React y estaría EN EL DOM desde
 * el primer render, escondida detrás de un `useState`. `e2e/calendario.spec.ts`
 * comprueba que el `?s=` no aparece en el HTML antes de pulsar `Mostrar`, y esa
 * aserción solo puede pasar honestamente si la URL no ha salido del servidor.
 *
 * Devuelve `null` tanto si no existe como si el llamador no es admin:
 * distinguirlos convertiría la función en un oráculo de qué ids existen.
 */
export async function revelarUrlIcal(propertyId: string): Promise<string | null> {
  const contexto = await exigirAdmin().catch((e: unknown) => {
    if (e instanceof NoAutorizado) return null;
    throw e;
  });
  if (!contexto) return null;

  const revisado = esquemaId.safeParse(propertyId);
  if (!revisado.success) return null;

  const admin = createAdminClient();

  const { data, error } = await admin
    .from('property_secrets')
    .select('ical_url')
    .eq('property_id', revisado.data)
    .maybeSingle();

  if (error) return null;
  return data?.ical_url ?? null;
}

/**
 * `maxDuration`, y por qué está aquí Y en `page.tsx`.
 *
 * Vercel Hobby permite 60 s por función, así que los 10 s del `AbortSignal` de
 * arriba caben de sobra; los 20 s de techo existen para que un feed lento falle
 * por el timeout CONTROLADO del fetch —con su copy de UI-SPEC §10.3— y no por
 * el corte de la plataforma, que no produce ningún mensaje.
 *
 * Next 15.5 acepta este `export const` en un archivo con la directiva de Server
 * Action (medido en este plan: el build pasa). Pero la configuración de segmento
 * que la plataforma lee es la de la ROUTE, y `_actions.ts` no es una route: los
 * archivos con `_` delante quedan fuera del enrutador. Por eso el valor que de
 * verdad aplica es el de `page.tsx`, que lo declara igual. Este de aquí es
 * documentación colocalizada con el `fetch` que lo necesita; borrar el de
 * `page.tsx` creyendo que este basta deja el techo en el default.
 */
export const maxDuration = 20;
