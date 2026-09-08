import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Tables } from '@/lib/database.types';

/**
 * Las columnas de SALUD de `public.calendar_feeds`, y nada más (APTO-12).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * LA COSTURA CON LA FASE 3 PASA POR AQUÍ, Y ES ESTRUCTURAL, NO UNA CONVENCIÓN.
 *
 * Este módulo escribe SIETE columnas de `calendar_feeds` y NO CONOCE la
 * existencia de `calendar_reservations` ni la de `cleanings`. No es que "no las
 * toque por disciplina": no tiene forma de tocarlas, porque no las nombra. El
 * pipeline que persiste reservas y genera aseos es de la Fase 3, está bloqueado
 * por un prerequisito humano (capturar un `.ics` real) y NO se adelanta aquí.
 *
 * `lib/domain/feed.integration.test.ts` cuenta las filas de esas dos tablas
 * antes y después de escribir la salud, con un centinela sembrado para que la
 * igualdad no sea `0 === 0`. Si ese test se pone en rojo, alguien metió el
 * pipeline en esta rebanada.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ESTA FUNCIÓN NO RECIBE LA URL, A PROPÓSITO (T-02-73). La URL de exportación
 * es una credencial: un GET a ella revela la ocupación completa del apartamento
 * sin autenticarse. Vive en `property_secrets`, que es otra tabla y otro
 * cliente. Al no entrar por la firma, no hay forma de que acabe en `last_error`
 * ni en ninguna otra columna de aquí ni por descuido ni por un `${}` copiado.
 *
 * QUÉ CLIENTE. `calendar_feeds` SÍ es escribible con el JWT del admin: medido
 * en 02-RESEARCH §8.6, el upsert pasa. Por eso el cliente entra por parámetro y
 * la Server Action le pasa el del USUARIO, no el de servicio. Es lo contrario
 * de `property_secrets`, y la asimetría es del modelo de grants, no una
 * preferencia.
 */

/** El MVP solo sincroniza Airbnb. La columna admite `booking` y `otro`. */
export const PROVEEDOR_AIRBNB = 'airbnb' as const;

/**
 * `calendar_feeds_prop_provider_uniq`, el UNIQUE `(property_id, provider)` de
 * la migración 04. Es la clave natural del upsert: validar dos veces el mismo
 * apartamento actualiza la fila, no crea una segunda.
 */
export const CONFLICTO_FEED = 'property_id,provider';

/** Lo que la pantalla de APTO-12 lee al reabrirse (UI-SPEC §10.4, regla 4). */
export type FeedDeApartamento = Pick<
  Tables<'calendar_feeds'>,
  | 'id'
  | 'is_active'
  | 'last_attempt_at'
  | 'last_success_at'
  | 'last_http_status'
  | 'last_event_count'
  | 'last_error'
  | 'consecutive_failures'
>;

const COLUMNAS_SALUD =
  'id, is_active, last_attempt_at, last_success_at, last_http_status, last_event_count, last_error, consecutive_failures';

/**
 * Las siete columnas de salud, tal como quedan tras un intento de validación.
 *
 * `last_error` es TEXTO DE DIAGNÓSTICO: el status HTTP y el motivo, nunca la
 * URL. `resumirFallo()` de abajo es la única fuente de esas cadenas.
 */
export interface SaludDelFeed {
  last_attempt_at: string;
  last_success_at: string | null;
  last_http_status: number | null;
  last_event_count: number | null;
  last_payload_hash: string | null;
  last_error: string | null;
  consecutive_failures: number;
}

/** Los modos de falla que la pantalla distingue (UI-SPEC §10.3, estados 6 y 7). */
export type MotivoDeFallo =
  | 'no-encontrado'
  | 'rechazado'
  | 'servidor'
  | 'tiempo-agotado'
  | 'red'
  | 'redirigido'
  | 'no-es-ical';

/**
 * El texto que va a `last_error`. Es diagnóstico para quien mire la tabla en la
 * Fase 3, no el copy de pantalla: el copy por código vive en el componente.
 *
 * NO INTERPOLA NADA QUE VENGA DEL USUARIO. El status es un número que produjo
 * el propio `fetch`, y el motivo es un miembro de una unión cerrada. Ese es el
 * motivo por el que la URL no puede colarse aquí ni con un cambio descuidado.
 */
export function resumirFallo(motivo: MotivoDeFallo, status: number | null): string {
  const detalle: Record<MotivoDeFallo, string> = {
    'no-encontrado': 'el proveedor no reconoce el feed',
    rechazado: 'el proveedor rechazó la petición',
    servidor: 'el proveedor devolvió un error de servidor',
    'tiempo-agotado': 'no respondió dentro del límite de 10 s',
    red: 'no se pudo establecer la conexión',
    redirigido: 'respondió con una redirección y no se sigue',
    'no-es-ical': 'respondió 2xx con un cuerpo que no es un calendario',
  };
  const sufijo = status === null ? 'sin status' : `HTTP ${status}`;
  return `${motivo}: ${detalle[motivo]} (${sufijo})`;
}

/**
 * Upsert de las columnas de salud del feed de Airbnb de un apartamento.
 *
 * Se pasa `is_active: true` porque conectar un calendario es justamente
 * activarlo; `next_sync_at` se deja en su default (`now()`), que pone el feed en
 * la cola del cron de la Fase 3 sin que este plan tenga que saber nada de esa
 * cola.
 */
export async function registrarSaludDelFeed(
  cliente: SupabaseClient<Database>,
  propertyId: string,
  salud: SaludDelFeed,
): Promise<{ error: { code?: string; message?: string } | null }> {
  const { error } = await cliente.from('calendar_feeds').upsert(
    {
      property_id: propertyId,
      provider: PROVEEDOR_AIRBNB,
      is_active: true,
      ...salud,
    },
    { onConflict: CONFLICTO_FEED },
  );

  return { error };
}

/**
 * Registra el resultado de un intento de validación SOBRE UN FEED QUE YA
 * EXISTE. Si el apartamento no tiene feed, no escribe nada y devuelve `false`.
 *
 * ES UN `update`, NO UN `upsert`, Y ESA ES LA DIFERENCIA QUE IMPORTA. Validar
 * un link todavía no guardado no debe crear la fila: la columna 7 de la lista
 * (UI-SPEC §7.1) pinta `CalendarCheck` por la EXISTENCIA de un feed activo, así
 * que un upsert aquí haría que un apartamento apareciera con calendario
 * conectado solo porque alguien pegó un link y le dio a validar. La fila la
 * crea `guardarFeed`, que es cuando el admin de verdad conecta.
 *
 * Devuelve cuántas filas tocó para que el llamador no tenga que adivinarlo.
 */
export async function actualizarSaludSiExiste(
  cliente: SupabaseClient<Database>,
  propertyId: string,
  salud: SaludDelFeed,
): Promise<boolean> {
  const { data, error } = await cliente
    .from('calendar_feeds')
    .update(salud)
    .eq('property_id', propertyId)
    .eq('provider', PROVEEDOR_AIRBNB)
    .select('id');

  if (error) return false;
  return (data?.length ?? 0) > 0;
}

/**
 * El feed de Airbnb de un apartamento, o `null` si todavía no hay ninguno.
 *
 * Devuelve `null` también cuando la RLS no deja verlo: la pantalla trata los
 * dos casos igual, que es "no hay calendario conectado".
 */
export async function leerFeedDeApartamento(
  cliente: SupabaseClient<Database>,
  propertyId: string,
): Promise<FeedDeApartamento | null> {
  const { data, error } = await cliente
    .from('calendar_feeds')
    .select(COLUMNAS_SALUD)
    .eq('property_id', propertyId)
    .eq('provider', PROVEEDOR_AIRBNB)
    .maybeSingle();

  if (error) return null;
  return data ?? null;
}
