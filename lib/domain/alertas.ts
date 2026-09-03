import type { Enums } from '@/lib/database.types';

/**
 * EL MOTOR DEL PANEL DE ALERTAS (DASH-04, DASH-05).
 *
 * Este módulo es puro: no importa React, ni `lucide-react`, ni nada de `app/`.
 * Devuelve NOMBRES de icono y etiquetas; quién los pinta es el componente
 * (plan 04-13). Misma regla que `lib/domain/properties.ts`.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA REGLA DURA, Y ES LA MÁS FÁCIL DE ROMPER POR ACCIDENTE (D-07, UI-SPEC §4.3)
 *
 *   EL COLOR NO CODIFICA EL TIPO DE ALERTA. PUNTO.
 *
 * Los doce iconos van en `text-status-warn`, las doce etiquetas en
 * `text-muted-foreground`, y ninguna entrada puede tener tamaño, peso ni fondo
 * propio. Prohibido rojo para "urgente", ámbar para "hora límite", gris para
 * "faltantes", un `border-left` de color por tipo o un `Badge` de color por
 * tipo.
 *
 * Por qué. "La misma jerarquía visual" (criterio 4 del ROADMAP) NO significa
 * que todas griten igual: significa que NINGUNA SE ESCONDE (D-05). El
 * anti-patrón que el requisito ataja es el clásico, urgentes en rojo grande
 * arriba y "faltantes" como texto gris al final que nadie lee. El tipo se
 * distingue por ICONO y ETIQUETA DE TEXTO, y la etiqueta es la que carga el
 * significado; el icono es solo el ancla de escaneo. Verificación operativa, no
 * opinión: una captura del panel en escala de grises tiene que seguir
 * distinguiendo los tipos (UI-SPEC §16.2).
 *
 * Si al añadir una entrada te nace la tentación de destacarla, esa tentación ES
 * el bug: estás reintroduciendo justo el problema que el requisito existe para
 * evitar. La aserción de homogeneidad de `alertas.test.ts` recorre el mapa
 * entero para que eso no pase en silencio.
 * ────────────────────────────────────────────────────────────────────────────
 */

/**
 * Los once valores de `notification_type`, copiados verbatim del enum generado
 * (`lib/database.types.ts`). Existe como array porque el tipo de TypeScript no
 * sobrevive a la compilación y los tests necesitan recorrerlo en runtime.
 *
 * El `satisfies` de abajo y la comprobación `_CubreElEnum` cierran las dos
 * direcciones: ningún valor inventado entra, y si la migración de mañana añade
 * un valor al enum, ESTE ARCHIVO DEJA DE COMPILAR. Es el punto: un tipo nuevo
 * sin entrada en el mapa tiene que ser un error de build, no una fila sin
 * rótulo descubierta en producción.
 */
export const TIPOS_DE_NOTIFICACION = [
  'asignacion',
  'no_puedo',
  'dano_reportado',
  'faltantes_reportados',
  'gasto_reportado',
  'aseo_completado',
  'hora_limite_vencida',
  'calendario_caido',
  'extension_sospechosa',
  'aseo_cancelado',
  'retencion_proxima',
] as const satisfies readonly Enums<'notification_type'>[];

/** Si esto deja de ser `true`, al enum le entró un valor que el array no tiene. */
type _CubreElEnum =
  Exclude<Enums<'notification_type'>, (typeof TIPOS_DE_NOTIFICACION)[number]> extends never
    ? true
    : never;
const _cubreElEnum: _CubreElEnum = true;
void _cubreElEnum;

/**
 * Las claves del panel: los once tipos persistidos más `urgente`, que NO es un
 * valor del enum porque no es una notificación. Se computa al leer desde
 * `cleanings.is_urgent` (UI-SPEC §11.1, fila 1).
 */
export type ClaveDeAlerta = Enums<'notification_type'> | 'urgente';

/**
 * Nombres de icono de lucide, lista cerrada (UI-SPEC §17.3).
 *
 * `Bell` NO estaba en las dos listas del contrato y se añade aquí con su razón:
 * es el icono del fallback genérico, y sin él un tipo desconocido tendría que
 * salir sin icono o desaparecer. Es una AMPLIACIÓN de la lista cerrada, no una
 * excepción a la regla de color: `Bell` va en el mismo `--status-warn` y al
 * mismo tamaño que los demás, así que no jerarquiza nada.
 */
export type IconoDeAlerta =
  | 'Zap'
  | 'ArrowLeftRight'
  | 'UserRoundX'
  | 'Hammer'
  | 'PackageOpen'
  | 'CalendarX'
  | 'Hourglass'
  | 'CircleSlash'
  | 'CircleCheck'
  | 'UserRoundCog'
  | 'History'
  | 'Bell';

/**
 * Lo que el mapa devuelve por tipo.
 *
 * NO TIENE, Y NO PUEDE TENER, NINGÚN CAMPO DE SEVERIDAD, PRIORIDAD NI ORDEN.
 * En cuanto exista `severidad: 'alta'`, el paso siguiente inevitable es ordenar
 * o colorear por ella, y ahí se acabó el criterio 4. Hay una aserción en el
 * test que lo comprueba por nombre de propiedad, precisamente porque un
 * comentario no impide nada.
 */
export type PresentacionDeAlerta = {
  /** Nombre del icono de lucide. El componente lo resuelve; este módulo no importa React. */
  icono: IconoDeAlerta;
  /** Etiqueta de tipo, 12/600 uppercase. Es la que carga el significado sin color. */
  etiqueta: string;
  /** Idéntica para TODAS las entradas. Es el único color del panel (§4.3). */
  claseIcono: 'text-status-warn';
  /** Idéntica para TODAS las entradas. */
  claseEtiqueta: 'text-muted-foreground';
  /** Idéntico para TODAS las entradas, en píxeles. */
  tamanoIcono: 16;
};

/** Los tres atributos visuales, escritos una sola vez. Repetirlos por entrada sería invitar a que uno se desvíe. */
const HOMOGENEO = {
  claseIcono: 'text-status-warn',
  claseEtiqueta: 'text-muted-foreground',
  tamanoIcono: 16,
} as const satisfies Omit<PresentacionDeAlerta, 'icono' | 'etiqueta'>;

/**
 * Fallback para un tipo que no esté en el mapa. `Bell` / `AVISO`.
 *
 * LA REGLA: nunca se descarta una fila por tipo desconocido. Filtrar los
 * desconocidos parece más limpio y es un bug silencioso, porque el enum crece
 * en migraciones y este archivo no. Una fila con rótulo genérico se ve y se
 * investiga; una fila que no se renderiza no existe.
 */
export const PRESENTACION_GENERICA: PresentacionDeAlerta = {
  icono: 'Bell',
  etiqueta: 'AVISO',
  ...HOMOGENEO,
};

/**
 * El mapa. Doce entradas: los once del enum más la computada `urgente`.
 *
 * POR QUÉ DOCE Y NO LOS SIETE DEL UI-SPEC §11.1. Medido con grep exhaustivo
 * sobre `supabase/migrations/*.sql` el 2026-09-03:
 *
 *   - `aseo_cancelado` es HOY el tipo que más filas produce en operación
 *     normal: cuatro variantes en `sync_feed_apply()` (migración 13, líneas
 *     949, 971, 993, 1015). El contrato de diseño no lo mapeaba.
 *   - `calendario_caido` tiene cinco productores (migración 13 línea 1065 y
 *     migración 14 líneas 289, 340, 410, 433).
 *   - `hora_limite_vencida` NO LO ESCRIBE NINGUNA MIGRACIÓN. El valor del enum
 *     existe y nada lo produce, por eso es obligatoriamente computado (ver
 *     `alertasComputadas`). No lo busques, no está.
 *   - `dano_reportado`, `faltantes_reportados` y `gasto_reportado` llegan en la
 *     Fase 6; `retencion_proxima`, en la Fase 9.
 *
 * Sin entrada, esas filas se caen del panel o salen sin rótulo, y las dos cosas
 * son bugs. AÑADIR TIPOS AL MAPA NO JERARQUIZA NADA: no cambia color, no cambia
 * tamaño, no cambia orden. Es una adición al contrato de diseño, no una
 * desviación del criterio 4.
 *
 * El discriminador fino de `aseo_cancelado` vive en `payload.motivo`
 * (`reserva_desaparecida`, `reserva_movida`, y sus dos variantes
 * `_no_cancelable`) y en `payload.scope` (`aseo` / `feed` / `job`). EL MAPA NO
 * LO USA para variar la presentación: el `title` y el `body` ya vienen
 * redactados en español desde la migración 13 y el panel los renderiza, no los
 * reescribe (UI-SPEC §0). Renderizar el slug crudo sería filtrar vocabulario de
 * máquina a la pantalla (T-04-12).
 */
export const MAPA_DE_ALERTAS: Record<ClaveDeAlerta, PresentacionDeAlerta> = {
  // Los siete del UI-SPEC §11.1, con sus iconos y etiquetas literales.
  urgente: { icono: 'Zap', etiqueta: 'URGENTE', ...HOMOGENEO },
  extension_sospechosa: {
    icono: 'ArrowLeftRight',
    etiqueta: 'EXTENSIÓN MAL CREADA',
    ...HOMOGENEO,
  },
  no_puedo: { icono: 'UserRoundX', etiqueta: 'NO PUEDO', ...HOMOGENEO },
  dano_reportado: { icono: 'Hammer', etiqueta: 'DAÑO', ...HOMOGENEO },
  faltantes_reportados: { icono: 'PackageOpen', etiqueta: 'FALTANTES', ...HOMOGENEO },
  calendario_caido: { icono: 'CalendarX', etiqueta: 'CALENDARIO CAÍDO', ...HOMOGENEO },
  hora_limite_vencida: {
    icono: 'Hourglass',
    etiqueta: 'HORA LÍMITE VENCIDA',
    ...HOMOGENEO,
  },

  // El que el motor emite de verdad y el contrato no listaba. `CircleSlash` es
  // el mismo icono que el estado "cancelado" del aseo (UI-SPEC §5): el admin lo
  // aprende una vez.
  aseo_cancelado: { icono: 'CircleSlash', etiqueta: 'ASEO CANCELADO', ...HOMOGENEO },

  // Los cuatro sin superficie propia hoy. Tienen entrada para que el día que
  // aparezca su productor el panel ya sepa rotularlos.
  asignacion: { icono: 'UserRoundCog', etiqueta: 'ASIGNACIÓN', ...HOMOGENEO },
  aseo_completado: { icono: 'CircleCheck', etiqueta: 'ASEO TERMINADO', ...HOMOGENEO },
  // `gasto_reportado` se queda con `Bell` a propósito: no hay ningún icono de
  // dinero en la lista cerrada de §17.3 y su productor no existe hasta la Fase
  // 6, que es cuando el contrato de diseño le asignará silueta propia. Inventar
  // un icono fuera de la lista ahora sería modificar el contrato a ciegas.
  gasto_reportado: { icono: 'Bell', etiqueta: 'GASTO', ...HOMOGENEO },
  retencion_proxima: { icono: 'History', etiqueta: 'RETENCIÓN', ...HOMOGENEO },
};

/**
 * Orden FIJO de los tipos para la lista del filtro (UI-SPEC §11.4).
 *
 * NO ES EL ORDEN DE LA LISTA DE ALERTAS, que es cronológico. Son dos cosas
 * distintas y confundirlas produce una lista de filtro que se reordena sola
 * según los conteos, que es inusable: la opción que buscas cambia de sitio cada
 * vez que entra una alerta.
 *
 * Arranca con los siete del contrato en su orden exacto, sigue con
 * `aseo_cancelado` (el más productivo hoy) y cierra con los cuatro que todavía
 * no tienen productor.
 */
export const ORDEN_DE_TIPOS = [
  'urgente',
  'extension_sospechosa',
  'no_puedo',
  'dano_reportado',
  'faltantes_reportados',
  'calendario_caido',
  'hora_limite_vencida',
  'aseo_cancelado',
  'asignacion',
  'aseo_completado',
  'gasto_reportado',
  'retencion_proxima',
] as const satisfies readonly ClaveDeAlerta[];

/**
 * Resuelve la presentación de una clave. Acepta `string` a propósito, no
 * `ClaveDeAlerta`: la fila llega de PostgREST y el tipo de TypeScript es una
 * promesa, no una garantía de runtime. Si el enum creció en la base y el
 * despliegue de la app va un commit por detrás, aquí llega una cadena que el
 * tipo dice que no existe.
 *
 * Devuelve SIEMPRE algo. Nunca `undefined`, nunca una fila descartada.
 */
export function presentacionDeAlerta(clave: string): PresentacionDeAlerta {
  return (
    (MAPA_DE_ALERTAS as Record<string, PresentacionDeAlerta | undefined>)[clave] ??
    PRESENTACION_GENERICA
  );
}
