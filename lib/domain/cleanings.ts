import type { Tables } from '@/lib/database.types';

/**
 * UNICA derivacion de estado de aseo del repo (UI-SPEC §5).
 *
 * Mismo patron y misma razon que `estadoDeApartamento()` en `lib/domain/properties.ts`:
 * duplicar el `if` en un componente es exactamente como la UI se desincroniza de los
 * CHECK de la base (`cl_unmanaged_is_inert` y `cl_managed_has_state` de la migracion 04).
 * Si hay que cambiar la regla, se cambia aqui y en el CHECK, en el mismo commit.
 *
 * Este modulo es puro: no importa React, ni lucide, ni nada de `app/`. Devuelve el
 * NOMBRE del icono, no el componente, porque la lista de iconos es cerrada (UI-SPEC
 * §17.3) y quien monta la pantalla es quien importa de `lucide-react`.
 */

/** Las seis claves posibles: los cinco estados operativos mas la unidad externa. */
export type ClaveEstadoAseo =
  | 'sin_confirmar'
  | 'pendiente'
  | 'en_curso'
  | 'terminado'
  | 'cancelado'
  | 'externa';

/**
 * Los seis iconos de la lista cerrada de UI-SPEC §17.3 que usa esta derivacion.
 *
 * Es una union de literales y no un `string` a proposito: el contrato dice "lista
 * cerrada", y con `string` el dia que alguien escriba `'CheckCircle'` (que no existe en
 * lucide 1.x, el correcto es `CircleCheck`) el error saldria en el navegador y no en
 * `tsc`.
 */
export type IconoEstadoAseo =
  | 'Inbox'
  | 'Clock'
  | 'Play'
  | 'CircleCheck'
  | 'CircleSlash'
  | 'CircleDashed';

/**
 * Discriminante tipado que consume la UI.
 *
 * A diferencia de `EstadoApartamento`, este SI lleva icono y color, y no es una
 * incoherencia: `02-UI-SPEC.md` dejaba la presentacion al componente porque solo habia
 * un consumidor. Aqui hay cuatro (fila de la tabla, bandeja, panel de alertas e
 * historial del apartamento, planes 04-09 a 04-12) y repartir la misma tabla de seis
 * pares icono/color entre cuatro componentes es la misma clase de duplicacion que esta
 * funcion existe para evitar.
 *
 * El color viaja como CLASE de Tailwind, no como token CSS crudo, para que el consumidor
 * no tenga que traducir `--status-warn` a `text-status-warn`.
 */
export type EstadoAseo = {
  clave: ClaveEstadoAseo;
  icono: IconoEstadoAseo;
  etiqueta: string;
  clase: string;
};

/**
 * Lo minimo que hace falta para derivar el estado. Es un `Pick`, no la fila entera, para
 * poder llamarla con la fila embebida de una alerta, que no trae las 29 columnas de
 * `cleanings`.
 */
export type EntradaEstadoAseo = Pick<
  Tables<'cleanings'>,
  'is_managed' | 'state' | 'confirmado_at'
>;

/** Icono, etiqueta y color de UI-SPEC §5 y §4.4. Las etiquetas se muestran tal cual. */
const PRESENTACION: Record<ClaveEstadoAseo, Omit<EstadoAseo, 'clave'>> = {
  sin_confirmar: {
    icono: 'Inbox',
    etiqueta: 'Sin confirmar',
    clase: 'text-status-warn',
  },
  pendiente: {
    icono: 'Clock',
    etiqueta: 'Pendiente',
    clase: 'text-status-idle',
  },
  en_curso: {
    icono: 'Play',
    etiqueta: 'En curso',
    clase: 'text-status-progress',
  },
  terminado: {
    // El estado se llama `completada` en la base y `Terminado` en pantalla
    // (UI-SPEC §18.4). No se unifican: el enum es contrato de base y el copy es
    // contrato de pantalla.
    icono: 'CircleCheck',
    etiqueta: 'Terminado',
    clase: 'text-status-ok',
  },
  cancelado: {
    icono: 'CircleSlash',
    etiqueta: 'Cancelado',
    clase: 'text-muted-foreground',
  },
  externa: {
    // `CircleDashed` es reuso deliberado: la Fase 2 ya lo asigno a `Informativa` en la
    // tabla de apartamentos y es el mismo hecho de dominio (`gestion_vivaguest = false`).
    icono: 'CircleDashed',
    etiqueta: 'Gestión externa',
    clase: 'text-status-info',
  },
};

/**
 * Deriva el estado visible de un aseo.
 *
 * EL ORDEN DE EVALUACION ES PARTE DE LA REGLA, igual que en `estadoDeApartamento()`:
 * `is_managed` se mira PRIMERO. Una unidad de gestion externa llega con `state` nulo por
 * `cl_unmanaged_is_inert`, asi que un `switch` que conmute sobre `state` antes de mirar
 * `is_managed` no tiene ninguna rama honesta a la que mandarla. Hay un test que lo
 * fija.
 */
export function estadoDeAseo(c: EntradaEstadoAseo): EstadoAseo {
  const clave = derivarClave(c);
  return { clave, ...PRESENTACION[clave] };
}

function derivarClave(c: EntradaEstadoAseo): ClaveEstadoAseo {
  if (!c.is_managed) return 'externa';

  if (c.state === null) {
    // Inalcanzable por `cl_managed_has_state` (`not is_managed or state is not null`).
    // Se lanza en vez de inventar una clave porque una fila gestionada sin estado no
    // tiene ningun estado visible honesto, y un badge que miente sobre un aseo es peor
    // que una pantalla que se cae: la promesa del producto es que ningun aseo se pierda.
    // Tambien es lo que hace medible el senuelo del orden: si la guarda de `is_managed`
    // se mueve debajo del switch, una fila externa cae aqui y el test se pone rojo.
    throw new Error(
      'estadoDeAseo: aseo gestionado sin state, viola cl_managed_has_state',
    );
  }

  // Sin rama por defecto A PROPOSITO. El switch es exhaustivo sobre `cleaning_state`, y
  // el dia que la migracion anada un sexto valor al enum, `supabase gen types` lo trae a
  // `database.types.ts` y `tsc` rompe aqui con TS2366 en vez de dejar que el estado
  // nuevo se renderice como el que el `default` haya elegido.
  switch (c.state) {
    case 'pendiente':
      // `confirmado_at` es lo que separa la bandeja de DASH-02 del resto: un aseo
      // pendiente pero sin confirmar todavia no tiene numero de huespedes.
      return c.confirmado_at == null ? 'sin_confirmar' : 'pendiente';
    case 'en_curso':
      return 'en_curso';
    case 'completada':
      return 'terminado';
    case 'cancelada':
      return 'cancelado';
  }
}

/**
 * Copy de los slugs de `cancel_reason` (UI-SPEC §18.2).
 *
 * Vive aqui y no en el componente por la misma razon que la derivacion de estado: el
 * motivo se lee en el `title` de la celda ESTADO de la fila (§7.1) y tambien en el
 * historial del apartamento (§14), que son dos consumidores.
 */
const COPY_CANCEL_REASON: Readonly<Record<string, string>> = {
  reserva_desaparecida: 'La reserva desapareció del calendario.',
  reserva_movida: 'La reserva cambió de fecha.',
  cancelado_por_admin: 'Lo cancelaste tú.',
};

const COPY_CANCEL_GENERICO = 'Cancelado.';

/**
 * Copy de los slugs de `review_reason` (UI-SPEC §18.3).
 *
 * Los tres primeros dicen POR QUE el sync no cancelo el aseo solo, que es la informacion
 * que el admin necesita para decidir. "Ventana protegida" y "piso del feed" son los
 * candados 3 y 4 de la migracion 13; el copy los traduce sin nombrarlos.
 */
const COPY_REVIEW_REASON: Readonly<Record<string, string>> = {
  reserva_desaparecida_aseo_iniciado:
    'La reserva desapareció, pero el aseo ya había empezado.',
  reserva_desaparecida_ventana_protegida:
    'La reserva desapareció, pero el aseo es de hoy o de mañana.',
  reserva_desaparecida_bajo_piso:
    'La reserva desapareció, pero quedó por detrás de la ventana del calendario.',
  reserva_movida_aseo_iniciado: 'La reserva cambió de fecha, pero el aseo ya había empezado.',
  reserva_movida_ventana_protegida:
    'La reserva cambió de fecha, pero el aseo es de hoy o de mañana.',
  extension_sospechosa: 'Parece una extensión de estadía mal creada.',
};

const COPY_REVIEW_GENERICO = 'Este aseo necesita revisión.';

/**
 * Traduce un slug de `cancel_reason` a copy de pantalla.
 *
 * NUNCA devuelve el slug crudo, ni siquiera como respaldo (T-04-12). El respaldo
 * `MAPA[slug] ?? slug`, que es el reflejo natural al escribir esto, filtra vocabulario
 * interno del sync a la pantalla del admin y ademas mete texto de la base en el DOM sin
 * pasar por una lista cerrada. Un slug desconocido significa que hay un slug nuevo que
 * este mapa no conoce, y eso se arregla anadiendolo aqui, no imprimiendolo.
 *
 * `null` y `undefined` dan el mismo generico: en la base la columna es anulable y en el
 * cliente la fila puede venir sin ella.
 */
export function copyDeCancelReason(slug: string | null | undefined): string {
  return buscarCopy(COPY_CANCEL_REASON, slug, COPY_CANCEL_GENERICO);
}

/**
 * Traduce un slug de `review_reason` a copy de pantalla. Va en el `aria-label` y el
 * `title` del icono `Flag` de la senal inline (§5.2), y en la linea 2 de la alerta
 * cuando la notificacion no trae `title` propio (§11.3).
 *
 * Misma regla que `copyDeCancelReason`: nunca el slug crudo.
 */
export function copyDeReviewReason(slug: string | null | undefined): string {
  return buscarCopy(COPY_REVIEW_REASON, slug, COPY_REVIEW_GENERICO);
}

function buscarCopy(
  mapa: Readonly<Record<string, string>>,
  slug: string | null | undefined,
  generico: string,
): string {
  if (!slug) return generico;
  // `Object.hasOwn` y no `mapa[slug]` a secas: un slug que sea `constructor` o
  // `__proto__` devolveria un valor heredado del prototipo, que no es un string de copy.
  return Object.hasOwn(mapa, slug) ? mapa[slug] : generico;
}
