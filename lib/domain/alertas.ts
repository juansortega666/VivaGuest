import type { Enums, Tables } from '@/lib/database.types';

import { UMBRAL_SYNC_CAIDA_MS, estadoDeSincronizacion } from './salud-sync';

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

// ───────────────────────────────────────────────────────────────────────────
// Las tres alertas computadas (UI-SPEC §11.2)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Una fila del panel, venga de `notifications` o de un cómputo al leer.
 *
 * Las dos procedencias producen EXACTAMENTE la misma estructura a propósito: el
 * componente no puede distinguirlas para pintarlas distinto ni aunque quiera.
 * Lo único que las separa es `atendible`, y eso no es presentación (ver abajo).
 */
export type Alerta = {
  /** Estable entre lecturas. Es la `key` de React y el ancla del `aria-label`. */
  id: string;
  clave: ClaveDeAlerta;
  /**
   * EL INSTANTE DEL HECHO, en milisegundos. Es el ÚNICO criterio de orden del
   * panel (D-06). No es "cuándo se leyó" ni "cuándo se insertó la fila": es
   * cuándo ocurrió lo que la alerta reporta, que para cada tipo sale de un
   * sitio distinto (§11.2).
   */
  ocurrioEnMs: number;
  /** Título ya redactado en español. El panel lo renderiza, no lo reescribe. */
  titulo: string;
  /** Texto completo para el atributo `title` del elemento (§11.3). */
  cuerpo: string;
  /** Nombre del apartamento, o `Todo el sistema` para la caída global. */
  apartamento: string;
  cleaningId: string | null;
  propertyId: string | null;
  /** Destino del clic (D-08). `null` solo si no hay a dónde llevar. */
  url: string | null;
  /**
   * EL DISCRIMINANTE, Y NO ES UNA DIFERENCIA DE JERARQUÍA.
   *
   * `true` solo para las alertas respaldadas por una fila de `notifications`,
   * que son las que tienen `read_at` y por lo tanto se pueden marcar como
   * atendidas. Las computadas son ESTADOS DERIVADOS que se apagan solos cuando
   * el hecho se resuelve: un botón de atender ahí sería un botón que miente,
   * porque la alerta reaparecería en la siguiente lectura.
   *
   * El componente reserva la ranura del botón igual en las dos (§11.3), así que
   * las filas no cambian de alto ni el punto de truncado baila. Y el reparto
   * sigue la PROCEDENCIA DEL DATO, no la importancia: entre las computadas
   * están urgente y hora límite vencida, que son las dos que más cuestan si se
   * pierden.
   */
  atendible: boolean;
};

/**
 * Lo mínimo de `cleanings` que hace falta para computar las dos alertas por
 * aseo. Es un `Pick` ampliado, no la fila entera.
 */
export type AseoParaAlertas = Pick<
  Tables<'cleanings'>,
  | 'id'
  | 'property_id'
  | 'is_managed'
  | 'state'
  | 'scheduled_date'
  | 'hora_limite'
  | 'is_urgent'
  | 'created_at'
> & {
  /** Nombre del apartamento, ya resuelto por el join de quien lee. */
  apartamento: string;
  /**
   * La hora límite del APARTAMENTO. Llega porque la consulta del panel ya trae
   * el join de `properties`, y está aquí declarada A PROPÓSITO aunque este
   * módulo no la use para nada:
   *
   *   EL VENCIMIENTO SE CALCULA CON `hora_limite` (la del ASEO), NUNCA CON
   *   ESTA.
   *
   * `cleanings.hora_limite` es un SNAPSHOT que el trigger de la migración 13
   * puso al crear el aseo, y APTO-05 permite pactar una hora distinta para un
   * aseo puntual. El UI-SPEC §11.2 dice `properties.hora_limite` y es un error
   * del contrato, corregido aquí y medido: el test cruza las dos horas en dos
   * filas y cambiar la fuente invierte exactamente ese resultado.
   */
  apartamentoHoraLimite: string;
};

/** Lo que `alertasComputadas` necesita. Todo entra por parámetro, nada se lee del reloj ni de la base. */
export type EntradaComputadas = {
  aseos: AseoParaAlertas[];
  /** `max(last_success_at)` sobre los feeds activos. `null` si ninguno sincronizó nunca. */
  maxUltimoExito: string | null;
  /** El instante actual en ms. Igual que en `estadoDeSincronizacion`: entra, no se lee. */
  ahoraMs: number;
  /** El día de negocio de hoy en Bogotá, `'YYYY-MM-DD'`. Sale de `hoyBog()` o de `today_bog()`. */
  hoy: string;
};

/** Estados en los que un aseo todavía puede hacerse, y por lo tanto todavía puede alertar. */
const ESTADOS_VIVOS: ReadonlySet<string> = new Set(['pendiente', 'en_curso']);

/**
 * Una marca `timestamptz` de la base, en milisegundos.
 *
 * LAS DOS NORMALIZACIONES SON LAS MISMAS QUE `estadoDeSincronizacion()` y por
 * las mismas razones, la segunda medida en rojo durante la Fase 3:
 *
 *   1. El separador. Postgres escribe `'2026-09-02 16:00:00+00'` con espacio;
 *      PostgREST devuelve `'2026-09-02T16:00:00+00:00'` con `T`.
 *   2. El desfase de dos dígitos. `+00` NO es ISO 8601 y
 *      `Date.parse('...T16:00:00+00')` devuelve `NaN`.
 *
 * Está duplicado a propósito en vez de exportarse desde `salud-sync.ts`: ese
 * módulo es deliberadamente pequeño y su superficie pública son el umbral y la
 * función de estado. Si aparece un tercer consumidor, se saca a `dates.ts`.
 */
function instanteDeLaBase(marca: string): number {
  return Date.parse(marca.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'));
}

/**
 * El instante en que vence la hora límite de un aseo, en milisegundos.
 *
 * `scheduled_date` es un `date` y `hora_limite` un `time`: las dos SIN zona. El
 * instante que representan es "ese día, a esa hora, en Bogotá", y la única
 * forma sin trampa de obtenerlo desde TypeScript es construir la cadena con el
 * DESFASE EXPLÍCITO y dejar que `Date.parse` haga el resto.
 *
 * POR QUÉ EL DESFASE EXPLÍCITO. Es lo que hace que el resultado no dependa de
 * la zona del proceso, que es el mismo truco (y la misma razón medida) por el
 * que `estadoDeSincronizacion()` normaliza el `+00` de Postgres a `+00:00`. Sin
 * él, el mismo aseo estaría vencido en Vercel y no en el portátil de quien
 * programa.
 *
 * PROHIBIDO `new Date('2026-09-04')`: un ISO de solo fecha se parsea como
 * MEDIANOCHE UTC, que en Bogotá es el día anterior. Es la misma regla ya escrita
 * en `lib/domain/dates.ts` y el mismo off-by-one por el que `fecha_aseo` se
 * modela como `date` y no como `timestamptz`.
 *
 * `-05:00` fijo es correcto porque Colombia no tiene DST desde 1993. Es
 * exactamente la razón por la que `TZ_BOGOTA` existe como única constante de
 * zona del repo: fuera de aquí, convertir instantes a mano sería un bug.
 *
 * Los segundos del `time` se recortan: `'11:30:00'` y `'11:30:45'` son la misma
 * hora límite operativa.
 */
export function venceEnMs(scheduledDate: string, horaLimite: string): number {
  return Date.parse(`${scheduledDate}T${horaLimite.slice(0, 5)}:00-05:00`);
}

/**
 * Las tres alertas que NO son filas de `notifications` (UI-SPEC §11.2).
 *
 * | Tipo                | Condición                                                              | Instante para el orden              |
 * |---------------------|------------------------------------------------------------------------|-------------------------------------|
 * | Urgente             | `is_urgent` y `is_managed` y estado vivo y `scheduled_date >= hoy`      | `cleanings.created_at`              |
 * | Hora límite vencida | `is_managed` y estado vivo y `venceEnMs(...) < ahoraMs`                 | el vencimiento                      |
 * | Calendario caído    | `estadoDeSincronizacion(maxUltimoExito, ahoraMs) === 'caida'`           | `maxUltimoExito + UMBRAL`           |
 *
 * SOBRE `hora_limite_vencida`: NO HAY DECISIÓN QUE TOMAR, es obligatoriamente
 * computada. El valor del enum existe y **nada lo escribe en ninguna
 * migración** (grep exhaustivo sobre `supabase/migrations/*.sql`, 2026-09-03).
 * Queda dicho aquí para que nadie pierda una tarde buscando el productor.
 *
 * SOBRE LA CAÍDA GLOBAL: coexiste con las notificaciones por feed que escribe
 * `feed_health_watchdog`, y no compite con ellas. Esas dicen QUÉ FEED FALLA, con
 * su `property_id`; esta dice QUE NO CORRE NADA, y no puede decir cuál feed
 * porque no es un feed. Son hechos distintos y el 04-CONTEXT pide literalmente
 * que las dos entren al mismo panel.
 *
 * Y esta mitad es LA ÚNICA CAPA DEL SISTEMA QUE PUEDE OBSERVAR QUE EL SCHEDULER
 * MURIÓ. Ninguna aserción dentro de la base puede observar la ausencia de
 * ejecución de la base: un watchdog agendado en `pg_cron` no corre si `pg_cron`
 * no corre, y un segundo watchdog que vigile al primero muere con él. Por eso
 * este cómputo existe: no es un vigilante, es una lectura, y la hace la página
 * que el admin abre de todas formas.
 */
export function alertasComputadas(entrada: EntradaComputadas): Alerta[] {
  const { aseos, maxUltimoExito, ahoraMs, hoy } = entrada;
  const alertas: Alerta[] = [];

  for (const a of aseos) {
    // `state` es `null` en las unidades de gestión externa, que están inertes
    // por CHECK (`cl_unmanaged_is_inert`). `is_managed` es la comprobación que
    // importa: sin ella el panel alertaría de unidades que VivaGuest NO OPERA,
    // y el admin no puede hacer nada al respecto. Una alerta sobre la que no se
    // puede actuar es ruido, y el ruido es lo que hace que se dejen de leer.
    const vivo = a.is_managed && a.state !== null && ESTADOS_VIVOS.has(a.state);
    if (!vivo) continue;

    // 1. URGENTE. Se acota a `scheduled_date >= hoy` porque su significado es
    //    "entra huésped el mismo día" (§18.4): pasada la fecha, ya no hay nada
    //    que apurar y la alerta que corresponde es la de hora límite vencida.
    if (a.is_urgent && a.scheduled_date >= hoy) {
      alertas.push({
        id: `urgente:${a.id}`,
        clave: 'urgente',
        ocurrioEnMs: instanteDeLaBase(a.created_at),
        titulo: 'Entra huésped el mismo día.',
        cuerpo: 'Entra huésped el mismo día. El aseo tiene que quedar listo antes de la hora límite.',
        apartamento: a.apartamento,
        cleaningId: a.id,
        propertyId: a.property_id,
        url: `/operacion#aseo-${a.id}`,
        atendible: false,
      });
    }

    // 2. HORA LÍMITE VENCIDA. Aquí NO se acota por fecha: un aseo de anteayer
    //    sin terminar es justo el que no se puede perder.
    const vence = venceEnMs(a.scheduled_date, a.hora_limite);
    if (vence < ahoraMs) {
      const hhmm = a.hora_limite.slice(0, 5);
      alertas.push({
        id: `hora_limite_vencida:${a.id}`,
        clave: 'hora_limite_vencida',
        ocurrioEnMs: vence,
        titulo: `La hora límite de las ${hhmm} pasó y el aseo no ha terminado.`,
        cuerpo: `La hora límite de las ${hhmm} pasó y el aseo no ha terminado.`,
        apartamento: a.apartamento,
        cleaningId: a.id,
        propertyId: a.property_id,
        url: `/operacion#aseo-${a.id}`,
        atendible: false,
      });
    }
  }

  // 3. CALENDARIO CAÍDO, GLOBAL. El umbral NO se reimplementa: se llama a
  //    `estadoDeSincronizacion()`, que ya está escrito, ya tiene sus tests y ya
  //    normaliza el `+00` de Postgres (que se midió en rojo en la Fase 3).
  if (estadoDeSincronizacion(maxUltimoExito, ahoraMs) === 'caida') {
    // El instante del hecho es CUÁNDO PASÓ A ESTAR CAÍDO, o sea la última
    // sincronización buena más el umbral. Usar `ahoraMs` haría que la alerta
    // saltara al tope de la lista en cada render, empujando hacia abajo hechos
    // más recientes que ella.
    //
    // Con `maxUltimoExito` nulo no hay ningún instante del que partir: es el
    // despliegue nuevo cuyo scheduler nunca corrió. Ahí el hecho es "ahora
    // mismo", y hay que escribirlo, porque `Date.parse(null)` sería `NaN` y una
    // alerta con instante `NaN` cae en un sitio arbitrario del orden.
    const marcaMs = maxUltimoExito === null ? null : instanteDeLaBase(maxUltimoExito);
    const ocurrioEnMs =
      marcaMs === null || Number.isNaN(marcaMs) ? ahoraMs : marcaMs + UMBRAL_SYNC_CAIDA_MS;

    alertas.push({
      // Sin `cleaning_id` ni `property_id` que lo hagan único, el id es fijo:
      // solo puede haber una alerta global a la vez, por definición.
      id: 'calendario_caido:sistema',
      clave: 'calendario_caido',
      ocurrioEnMs,
      // Copy literal del UI-SPEC §11.2. Las tres horas del texto son las mismas
      // de `UMBRAL_SYNC_CAIDA_MS`.
      titulo: 'Ningún calendario ha sincronizado en las últimas 3 horas.',
      cuerpo:
        'Ningún calendario ha sincronizado en las últimas 3 horas. Puede que el motor de sincronización esté detenido.',
      // El slot del apartamento dice esto porque la alerta NO ES DE NINGÚN
      // apartamento: es del sistema entero (§11.2).
      apartamento: 'Todo el sistema',
      cleaningId: null,
      propertyId: null,
      // Lleva al catálogo, que es donde se ven y se arreglan los feeds. D-08:
      // una alerta que no es accionable desde donde se ve es una notificación,
      // no una alerta.
      url: '/apartamentos',
      atendible: false,
    });
  }

  return alertas;
}
