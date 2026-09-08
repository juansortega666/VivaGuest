/**
 * Constantes de dominio de VivaGuest.
 *
 * Fuente única de verdad para nombres que aparecen a la vez en SQL y en TypeScript
 * (estados, tipos de aseo, nombres de índice). Duplicar estos strings sueltos por el
 * código es exactamente cómo se desincronizan el schema y la app.
 */

/**
 * Zona horaria de negocio. Colombia no tiene DST desde 1993, así que es un offset fijo
 * UTC-5. Es la ÚNICA constante de zona horaria del repo.
 *
 * Regla transversal: prohibido `new Date()` para fechas de negocio. Las fechas de
 * negocio viajan como `'YYYY-MM-DD'` y en la base se resuelven con `public.today_bog()`,
 * nunca con `current_date` (la sesión corre en UTC: después de las 19:00 de Bogotá
 * `current_date` ya es mañana).
 */
export const TZ_BOGOTA = 'America/Bogota';

/** Estados de la máquina de estados del aseo. `null` = unidad de gestión externa. */
export const CLEANING_STATES = [
  'pendiente',
  'en_curso',
  'completada',
  'cancelada',
] as const;

export type CleaningState = (typeof CLEANING_STATES)[number];

/** Tipos de aseo. */
export const CLEANING_TYPES = ['normal', 'repaso', 'emergencia'] as const;

export type CleaningType = (typeof CLEANING_TYPES)[number];

/**
 * Nombre del índice único parcial que garantiza "máximo un aseo activo por apartamento
 * y fecha" (ASEO-07). `mapDbError()` lo usa para traducir el 23505 crudo de Postgres.
 */
export const IDX_ONE_ACTIVE_PER_PROPERTY_DATE =
  'cleanings_one_active_per_property_date';

/** Nombre del índice único parcial de "un aseo vivo por reserva". */
export const IDX_ONE_LIVE_PER_RESERVATION = 'cleanings_one_live_per_reservation';

/** Nombre del índice único de nombre de apartamento. */
export const IDX_PROPERTIES_NOMBRE_UNIQ = 'properties_nombre_uniq';

/**
 * Nombre del CHECK que fuerza que una unidad de gestión externa quede inerte
 * (sin estado, sin aseador, sin instrucciones, sin tarifas).
 */
export const CHK_UNMANAGED_IS_INERT = 'cl_unmanaged_is_inert';

// ---------------------------------------------------------------------------
// Constraints que el CRUD del catálogo (Fase 2) puede disparar.
//
// Los nombres son CONTRATO con la base: están copiados literalmente de
// `supabase/migrations/`, no de memoria. Un nombre inventado hace que
// `mapDbError()` caiga al mensaje genérico en silencio, y ese mensaje es un
// síntoma que nadie va a investigar. Verificación:
//   grep -rnoE 'constraint [a-z_]+' supabase/migrations/
//
// `IDX_` agrupa todo lo que produce un 23505 (índices únicos y UNIQUE de tabla,
// que Postgres respalda con un índice del mismo nombre); `CHK_`, todo lo que
// produce un 23514.
// ---------------------------------------------------------------------------

/** CHECK: una unidad gestionada no se activa sin tarifa al huésped Y pago al aseador. */
export const CHK_PROPS_ACTIVE_REQUIRES_RATES = 'props_active_requires_rates';

/**
 * CHECK: una unidad gestionada no se activa sin `responsable_id` **o**
 * `contacto_externo`. La UI es más estricta y exige `responsable_id` (APTO-08):
 * ver `apartamento.schema.ts`. La divergencia es deliberada.
 */
export const CHK_PROPS_ACTIVE_REQUIRES_OWNER = 'props_active_requires_owner';

/** CHECK: responsable y suplente solo existen bajo gestión VivaGuest. */
export const CHK_PROPS_ASSIGNEES_ONLY_WHEN_MANAGED =
  'props_assignees_only_when_managed';

/** CHECK: el suplente no puede ser la misma persona que el responsable. */
export const CHK_PROPS_SUPLENTE_DISTINCT = 'props_suplente_distinct';

/** CHECK: tarifa al huésped y pago al aseador no pueden ser negativos. */
export const CHK_PROPS_RATES_NONNEG = 'props_rates_nonneg';

/**
 * CHECK: `is_active = (deactivated_at is null)`. Si el usuario ve este error es
 * un bug de la app, no un dato mal escrito: la baja de un aseador tiene que
 * apagar el flag y sellar la fecha en la misma escritura.
 */
export const CHK_PROFILES_DEACTIVATION_COHERENT = 'profiles_deactivation_coherent';

/** CHECK: `tipo_cerradura in ('inteligente', 'llave_fisica')`. */
export const CHK_PROPERTY_SECRETS_TIPO_CERRADURA_VALIDO =
  'property_secrets_tipo_cerradura_valido';

/** UNIQUE `(property_id, etiqueta)`: no hay dos cuartos con la misma etiqueta. */
export const IDX_PROPERTY_ROOMS_ETIQUETA_UNIQ = 'property_rooms_etiqueta_uniq';

/** Índice único parcial del catálogo de faltantes POR apartamento. */
export const IDX_MIC_PROP_UNIQ = 'mic_prop_uniq';

/** Índice único parcial del catálogo GLOBAL de faltantes (`property_id is null`). */
export const IDX_MIC_GLOBAL_UNIQ = 'mic_global_uniq';

/**
 * UNIQUE `(property_id, provider)`: un feed por apartamento y proveedor. Dos
 * feeds de Airbnb para el mismo apartamento serían el mismo calendario dos veces.
 */
export const IDX_CALENDAR_FEEDS_PROP_PROVIDER_UNIQ =
  'calendar_feeds_prop_provider_uniq';
