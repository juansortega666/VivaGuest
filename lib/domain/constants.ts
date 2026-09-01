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
