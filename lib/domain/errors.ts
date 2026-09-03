import {
  CHK_PROFILES_DEACTIVATION_COHERENT,
  CHK_PROPERTY_SECRETS_TIPO_CERRADURA_VALIDO,
  CHK_PROPS_ACTIVE_REQUIRES_OWNER,
  CHK_PROPS_ACTIVE_REQUIRES_RATES,
  CHK_PROPS_ASSIGNEES_ONLY_WHEN_MANAGED,
  CHK_PROPS_RATES_NONNEG,
  CHK_PROPS_SUPLENTE_DISTINCT,
  CHK_UNMANAGED_IS_INERT,
  IDX_CALENDAR_FEEDS_PROP_PROVIDER_UNIQ,
  IDX_MIC_GLOBAL_UNIQ,
  IDX_MIC_PROP_UNIQ,
  IDX_ONE_ACTIVE_PER_PROPERTY_DATE,
  IDX_ONE_LIVE_PER_RESERVATION,
  IDX_PROPERTIES_NOMBRE_UNIQ,
  IDX_PROPERTY_ROOMS_ETIQUETA_UNIQ,
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
  [
    IDX_PROPERTY_ROOMS_ETIQUETA_UNIQ,
    'Ya existe un cuarto con esa etiqueta en este apartamento.',
  ],
  [IDX_MIC_PROP_UNIQ, 'Ya existe un faltante con ese nombre.'],
  [IDX_MIC_GLOBAL_UNIQ, 'Ya existe un faltante con ese nombre.'],
  [
    IDX_CALENDAR_FEEDS_PROP_PROVIDER_UNIQ,
    'Este apartamento ya tiene un calendario de ese proveedor.',
  ],
];

/** Mapeo de nombre de CHECK constraint → mensaje de negocio. */
const MENSAJES_CHECK: ReadonlyArray<readonly [string, string]> = [
  [
    CHK_UNMANAGED_IS_INERT,
    'Esa unidad es de gestión externa: no admite estado, aseador, instrucciones ni tarifas.',
  ],
  // Los tres primeros son el paracaídas, no la red: `apartamento.schema.ts`
  // (UI-SPEC §8.2) impide que se disparen desde la pantalla. Si un usuario ve
  // alguno de estos mensajes, hay un hueco en la validación del formulario.
  [
    CHK_PROPS_ACTIVE_REQUIRES_RATES,
    'No se puede activar sin tarifa al huésped y pago al aseador.',
  ],
  [
    CHK_PROPS_ACTIVE_REQUIRES_OWNER,
    'No se puede activar sin un aseador responsable.',
  ],
  [
    CHK_PROPS_ASSIGNEES_ONLY_WHEN_MANAGED,
    'Una unidad de gestión externa no lleva responsable ni suplente.',
  ],
  [
    CHK_PROPS_SUPLENTE_DISTINCT,
    'El suplente no puede ser la misma persona que el responsable.',
  ],
  [CHK_PROPS_RATES_NONNEG, 'Las tarifas no pueden ser negativas.'],
  // Bug interno: no debería verse nunca. Se mapea igual para que, si aparece, al
  // menos no aparezca en inglés y con el nombre del constraint dentro.
  [CHK_PROFILES_DEACTIVATION_COHERENT, 'Estado de activación incoherente.'],
  [CHK_PROPERTY_SECRETS_TIPO_CERRADURA_VALIDO, 'Tipo de cerradura inválido.'],
];

/**
 * Mapeo de nombre de constraint → clave del campo del formulario.
 *
 * Es lo que permite que una Server Action devuelva `{ ok:false, error, campo }` y
 * que react-hook-form haga `setError(campo, …)` en vez de lanzar un toast
 * (UI-SPEC §9.4: "Error de base ligado a un campo → inline bajo ese campo, no en
 * toast"). Un constraint que no tiene un input al que apuntar NO se lista aquí:
 * su error va a toast, que es lo correcto.
 */
const CAMPOS_POR_CONSTRAINT: ReadonlyArray<readonly [string, string]> = [
  [IDX_PROPERTIES_NOMBRE_UNIQ, 'nombre'],
  [CHK_PROPS_ACTIVE_REQUIRES_RATES, 'tarifa_huesped'],
  [CHK_PROPS_RATES_NONNEG, 'tarifa_huesped'],
  [CHK_PROPS_ACTIVE_REQUIRES_OWNER, 'responsable_id'],
  [CHK_PROPS_ASSIGNEES_ONLY_WHEN_MANAGED, 'responsable_id'],
  [CHK_PROPS_SUPLENTE_DISTINCT, 'suplente_id'],
  [IDX_PROPERTY_ROOMS_ETIQUETA_UNIQ, 'etiqueta'],
  [IDX_MIC_PROP_UNIQ, 'nombre'],
  [IDX_MIC_GLOBAL_UNIQ, 'nombre'],
  [CHK_PROPERTY_SECRETS_TIPO_CERRADURA_VALIDO, 'tipo_cerradura'],
  [IDX_CALENDAR_FEEDS_PROP_PROVIDER_UNIQ, 'ical_url'],
  // ASEO-07 (D-19). Los diálogos de crear aseo manual (§12.3) y de reprogramar
  // (§12.2) tienen un campo de fecha, así que el 23505 del índice parcial
  // `unique (property_id, scheduled_date) where estado <> 'cancelado'` va inline
  // bajo ese campo, no a toast (§12.6).
  //
  // LA INTERPOLACIÓN NO VIVE ACÁ. `mapDbError()` solo ve el error de Postgres: no
  // conoce el nombre del apartamento ni la fecha, y no debe conocerlos. Es una
  // función pura de mapeo. El Server Action del plan 04-08 detecta el caso antes
  // de delegar y devuelve el mensaje interpolado junto con `campo: 'fecha'`.
  //
  // CONSECUENCIA SOBRE LAS RPC, que es el otro lado del mismo contrato: ni
  // `create_manual_cleaning` ni `reschedule_cleaning` pueden capturar el
  // `unique_violation` y relanzarlo como `P0001`. El nombre del índice
  // desaparecería del mensaje y este mapeo dejaría de reconocerlo, así que el
  // error volvería a toast sin que nada se pusiera rojo. Esa aserción vive en el
  // pgTAP del plan 04-01.
  [IDX_ONE_ACTIVE_PER_PROPERTY_DATE, 'fecha'],
  // `profiles_deactivation_coherent` y `cl_unmanaged_is_inert` quedan FUERA a
  // propósito: no hay campo en pantalla al que anclarlos. `one_live_per_reservation`
  // también: lo dispara el pipeline iCal, no un formulario.
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

/**
 * Forma mínima de un `AuthError` de GoTrue tal como lo devuelve supabase-js.
 * Trae `status` HTTP y un `code` propio del servicio, no un SQLSTATE.
 */
export type AuthErrorLike = {
  code?: string;
  status?: number;
  message?: string;
};

/**
 * Traduce un error de GoTrue a un mensaje en español listo para mostrar.
 *
 * Es un mapa SEPARADO de `mapDbError` y no una rama suya: `mapDbError` conmuta
 * sobre códigos de Postgres y estos son códigos de otro servicio, con otro
 * espacio de nombres. Fundirlos haría que un `code` colisionara con un SQLSTATE
 * el día que GoTrue añada uno numérico.
 *
 * Garantías:
 *  - Siempre devuelve un string. Nunca lanza.
 *  - NUNCA devuelve `e.message`: los mensajes de GoTrue vienen en inglés.
 */
export function mapAuthError(e: AuthErrorLike): string {
  switch (e?.code) {
    case 'invalid_credentials':
      // Password mala o email inexistente dan el MISMO código y el MISMO
      // mensaje. Ahí no hay enumeración de usuarios (UI-SPEC §12.1).
      return 'Email o contraseña incorrectos.';

    case 'user_banned':
      // NOTA DE SEGURIDAD, MEDIDA. `02-UI-SPEC.md` §12.1 justifica este copy
      // diciendo que GoTrue emite `user_banned` DESPUÉS de validar la contraseña
      // y que por eso "no enumera nada". Eso es FALSO: se midió contra un GoTrue
      // vivo y el código se emite ANTES de verificar la contraseña, así que este
      // mensaje SÍ es un oráculo de enumeración de cuentas desactivadas.
      //
      // El copy se mantiene igual; lo que se corrige es la razón. Se ACEPTA el
      // riesgo porque: es una herramienta interna de ~10 cuentas, no hay
      // registro público (`enable_signup = false`), hay rate limit de 30
      // intentos por 5 minutos por IP, y un aseador dado de baja tiene derecho a
      // entender por qué no entra en vez de creer que olvidó la contraseña.
      //
      // No citar la razón del UI-SPEC como si fuera un hecho medido.
      return 'Tu cuenta está desactivada. Contacta al administrador.';

    case 'email_exists':
      return 'Ya existe una cuenta con ese email.';

    case 'over_request_rate_limit':
      return 'Demasiados intentos. Espera unos minutos.';

    default:
      return MENSAJE_GENERICO;
  }
}

/**
 * Del nombre del constraint que viene en el mensaje de Postgres a la clave del
 * campo del formulario, para `setError(campo, …)` de react-hook-form.
 *
 * `undefined` significa "este error no tiene campo": la UI lo manda a toast y el
 * formulario conserva todo lo escrito (UI-SPEC §9.4).
 */
export function campoDeConstraint(message: string | undefined): string | undefined {
  return buscar(CAMPOS_POR_CONSTRAINT, message);
}
