import {
  CHK_UNMANAGED_IS_INERT,
  IDX_ONE_ACTIVE_PER_PROPERTY_DATE,
  IDX_ONE_LIVE_PER_RESERVATION,
  IDX_PROPERTIES_NOMBRE_UNIQ,
} from './constants';

/**
 * Forma mínima de un error de Postgres tal como lo devuelve supabase-js
 * (`PostgrestError`) o el driver directo. Se tipa laxo a propósito: el error puede
 * venir de una Server Action, de un RPC o del cliente, y ninguno garantiza la forma.
 */
export type DbErrorLike = { code?: string; message?: string };

const MENSAJE_GENERICO =
  'No se pudo completar la operación. Intenta de nuevo; si persiste, reporta el problema.';

const MENSAJE_NO_AUTORIZADO = 'No tienes permiso para esta operación.';

/**
 * Mapeo de nombre de índice único → mensaje de negocio.
 *
 * ASEO-07 exige un "mensaje de error explícito" y la base solo entrega
 * `duplicate key value violates unique constraint "…"` con SQLSTATE 23505. Se mapea
 * en la app y no en el RPC de creación porque el pipeline iCal de la Fase 3 inserta
 * por otra ruta y no pasaría por el RPC: mapear aquí cubre las dos rutas.
 */
const MENSAJES_UNIQUE: ReadonlyArray<readonly [string, string]> = [
  [
    IDX_ONE_ACTIVE_PER_PROPERTY_DATE,
    'Ya existe un aseo activo para ese apartamento en esa fecha.',
  ],
  [
    IDX_ONE_LIVE_PER_RESERVATION,
    'Ya existe un aseo vigente para esa reserva.',
  ],
  [IDX_PROPERTIES_NOMBRE_UNIQ, 'Ya existe un apartamento con ese nombre.'],
];

/** Mapeo de nombre de CHECK constraint → mensaje de negocio. */
const MENSAJES_CHECK: ReadonlyArray<readonly [string, string]> = [
  [
    CHK_UNMANAGED_IS_INERT,
    'Esa unidad es de gestión externa: no admite estado, aseador, instrucciones ni tarifas.',
  ],
];

function buscar(
  tabla: ReadonlyArray<readonly [string, string]>,
  message: string | undefined,
): string | undefined {
  if (!message) return undefined;
  for (const [nombre, mensaje] of tabla) {
    if (message.includes(nombre)) return mensaje;
  }
  return undefined;
}

/**
 * Traduce un error de Postgres a un mensaje en español listo para mostrar en la UI.
 *
 * Garantías:
 *  - Siempre devuelve un string. Nunca lanza, ni con `{}` ni con `null` disfrazado.
 *  - Nunca devuelve el texto crudo de Postgres, con una única excepción: `P0001`, que
 *    es el errcode con el que los RPC `SECURITY DEFINER` de este proyecto levantan
 *    mensajes de negocio ya redactados en español.
 *  - No filtra qué recurso se pidió en el caso de `42501` (permiso denegado): decirle
 *    a un aseador que existe la tabla `property_secrets` ya es información de más.
 */
export function mapDbError(e: DbErrorLike): string {
  const code = e?.code;
  const message = e?.message;

  switch (code) {
    case '23505': // unique_violation
      return buscar(MENSAJES_UNIQUE, message) ?? 'Ya existe un registro con esos datos.';

    case '23514': // check_violation
      return (
        buscar(MENSAJES_CHECK, message) ??
        'Los datos no cumplen una regla de negocio de la base de datos.'
      );

    case '23503': // foreign_key_violation
      return 'El registro referenciado no existe o está siendo usado por otro.';

    case '23502': // not_null_violation
      return 'Falta un dato obligatorio.';

    case '42501': // insufficient_privilege
    case 'PGRST301': // JWT inválido o expirado (PostgREST)
      return MENSAJE_NO_AUTORIZADO;

    case 'P0001': // raise exception desde un RPC: el mensaje ya viene redactado
      return message && message.trim().length > 0 ? message : MENSAJE_GENERICO;

    case 'PGRST116': // 0 filas donde se esperaba exactamente 1
      return 'No se encontró el registro solicitado.';

    default:
      return MENSAJE_GENERICO;
  }
}
