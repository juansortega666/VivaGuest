import type { Enums, Tables } from '@/lib/database.types';

import {
  type ConsumoDeStorage,
  formatearBytes,
  porcentajeUsado,
  superaElUmbral,
} from './almacenamiento';
import { formatFechaLargaBog } from './dates';
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
 * Los trece iconos van en `text-status-warn`, las trece etiquetas en
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
 * Las claves del panel: los once tipos persistidos más `urgente` y
 * `almacenamiento_lleno`, que NO son valores del enum porque no son
 * notificaciones. Se computan al leer, la primera desde `cleanings.is_urgent`
 * (UI-SPEC §11.1, fila 1) y la segunda desde `consumo_de_storage()` (RET-07).
 *
 * `almacenamiento_lleno` no es fila de `notifications` a propósito: es un
 * ESTADO, no un evento. Se apaga sola el día que el dueño suba el cupo, igual
 * que `urgente` se apaga al pasar la fecha. Persistirla obligaría a ir a borrar
 * la fila a mano, y nadie se va a acordar.
 */
export type ClaveDeAlerta = Enums<'notification_type'> | 'urgente' | 'almacenamiento_lleno';

/**
 * Nombres de icono de lucide, lista cerrada (UI-SPEC §17.3).
 *
 * `Bell` NO estaba en las dos listas del contrato y se añade aquí con su razón:
 * es el icono del fallback genérico, y sin él un tipo desconocido tendría que
 * salir sin icono o desaparecer. Es una AMPLIACIÓN de la lista cerrada, no una
 * excepción a la regla de color: `Bell` va en el mismo `--status-warn` y al
 * mismo tamaño que los demás, así que no jerarquiza nada.
 *
 * `HardDrive` se añade por lo mismo, para `almacenamiento_lleno` (RET-07), y
 * con el precedente de `Bell` nombrado. LA REGLA QUE NO SE TOCA NO ES "la lista
 * no crece", ES "EL COLOR NO CODIFICA EL TIPO": va en el mismo
 * `text-status-warn`, al mismo tamaño y con la misma clase de etiqueta que los
 * otros doce.
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
  | 'HardDrive'
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
 * El mapa. Trece entradas: los once del enum más las computadas `urgente` y
 * `almacenamiento_lleno`.
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

  // La segunda computada sin fila en `notifications` (RET-07). Ver `HardDrive`
  // arriba: es una ampliación declarada de la lista cerrada, no una excepción a
  // la regla de color.
  almacenamiento_lleno: { icono: 'HardDrive', etiqueta: 'ALMACENAMIENTO', ...HOMOGENEO },
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
  // AL FINAL, y no intercalada por afinidad temática con `retencion_proxima`.
  // El valor de este orden es que NO SE MUEVA: meter una opción en medio
  // reordenaría las que el admin ya aprendió de sitio.
  'almacenamiento_lleno',
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
  /**
   * El consumo de Storage, tal como lo devuelve `leerConsumoDeStorage()`.
   *
   * `null` SIGNIFICA "NO SE PUDO MEDIR", Y NO ES LO MISMO QUE CERO. Con `null`
   * no se emite alerta: afirmar que está lleno sin haberlo medido es tan falso
   * como afirmar que está vacío.
   *
   * Es un campo OBLIGATORIO y no opcional a propósito. Hay un solo consumidor
   * de producción (`/operacion`) y lo que se compra con esto es que no pueda
   * olvidarlo en silencio: sin el campo no compila, y una alerta que nunca se
   * emite porque nadie le pasó el dato es exactamente el bug que no se ve.
   */
  consumo: ConsumoDeStorage | null;
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
 * ¿ESTE ASEO TIENE LA HORA LÍMITE VENCIDA? Un solo predicado, dos consumidores.
 *
 * Lo usan la alerta computada de abajo y el `Hourglass` inline de `FilaAseo`
 * (05-UI-SPEC §12.5), y existe EXACTAMENTE para que no puedan divergir. Escribir
 * el `state in ('pendiente','en_curso')` a mano dentro del componente sería una
 * segunda verdad sobre el mismo dato, y la que se quedara atrás lo haría en
 * silencio: la fila diría que va tarde y el panel no, o al revés.
 *
 * `is_managed` no es redundante con el estado: una unidad de gestión externa
 * está inerte por `cl_unmanaged_is_inert` y VivaGuest no la opera, así que decir
 * que va tarde sería pedirle al admin algo que no puede hacer.
 *
 * PURA, como todo este módulo: el instante entra por parámetro y no se lee el
 * reloj. La pantalla lee el suyo UNA vez (D-14) y lo baja a las dos superficies,
 * que es lo que hace que digan lo mismo en el mismo render.
 */
export function horaLimiteVencida(
  aseo: Pick<AseoParaAlertas, 'is_managed' | 'state' | 'scheduled_date' | 'hora_limite'>,
  ahoraMs: number,
): boolean {
  const vivo = aseo.is_managed && aseo.state !== null && ESTADOS_VIVOS.has(aseo.state);
  return vivo && venceEnMs(aseo.scheduled_date, aseo.hora_limite) < ahoraMs;
}

/**
 * Las cuatro alertas que NO son filas de `notifications` (UI-SPEC §11.2 y RET-07).
 *
 * | Tipo                | Condición                                                              | Instante para el orden              |
 * |---------------------|------------------------------------------------------------------------|-------------------------------------|
 * | Urgente             | `is_urgent` y `is_managed` y estado vivo y `scheduled_date >= hoy`      | `cleanings.created_at`              |
 * | Hora límite vencida | `is_managed` y estado vivo y `venceEnMs(...) < ahoraMs`                 | el vencimiento                      |
 * | Calendario caído    | `estadoDeSincronizacion(maxUltimoExito, ahoraMs) === 'caida'`           | `maxUltimoExito + UMBRAL`           |
 * | Almacenamiento      | `consumo !== null` y `superaElUmbral(consumo)`                          | `consumo.cruceAt`                   |
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
  const { aseos, maxUltimoExito, ahoraMs, hoy, consumo } = entrada;
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
        // EL DÍA VA DENTRO DEL DESTINO (plan 10-05). Desde el rediseño de
        // `/operacion` la pantalla se filtra por un día, así que un ancla SIN día
        // aterriza en el día de HOY y no encuentra la fila de un aseo de otro día:
        // el clic se ve, se puede pulsar y no lleva a ninguna parte. El día sale de
        // `scheduled_date`, que la entrada ya trae; no hace falta leer nada.
        url: `/operacion?dia=${a.scheduled_date}#aseo-${a.id}`,
        atendible: false,
      });
    }

    // 2. HORA LÍMITE VENCIDA. Aquí NO se acota por fecha: un aseo de anteayer
    //    sin terminar es justo el que no se puede perder.
    //
    //    ESA LÍNEA YA ESTABA ESCRITA Y HASTA D-08 ERA CIERTA E INALCANZABLE: la
    //    entrada venía de `leerOperacion()`, que cortaba la ventana en `hoy`, así
    //    que esta rama jamás veía un aseo anterior. Ahora la consulta baja siete
    //    días y por fin es cierta de punta a punta. Criterio 7 del ROADMAP.
    //    Y LA CONDICIÓN SALE DEL MISMO PREDICADO que pinta el `Hourglass` de la
    //    fila, no de un `if` paralelo: la alerta y la fila donde aterriza su clic
    //    tienen que aparecer juntas o no aparecer (T-05-55). `vivo` ya es cierto
    //    acá arriba, así que la comprobación que `horaLimiteVencida` repite es
    //    redundante y barata; lo que compra es que haya un solo sitio donde esto
    //    esté escrito.
    if (horaLimiteVencida(a, ahoraMs)) {
      const vence = venceEnMs(a.scheduled_date, a.hora_limite);
      // ── LO ÚNICO QUE DISTINGUE UNA VIEJA DE UNA DE HOY ES EL COPY (§12.6) ──
      //
      // NI COLOR, NI JERARQUÍA, NI UN OCTAVO TIPO, y la tentación de destacarlas
      // es evidente, así que queda escrito por qué no:
      //
      //   1. La información YA ESTÁ Y ES MÁS PRECISA QUE UN COLOR: el tiempo
      //      relativo de la fila del panel dice `hace 2 días` contra
      //      `hace 40 min`. Eso es un dato exacto; un color es una categoría.
      //   2. EL ORDEN YA ES LA DISTINCIÓN: el instante de esta alerta es el
      //      vencimiento, así que una de anteayer cae sola más abajo en el orden
      //      descendente.
      //   3. EL CRITERIO 4 DE LA FASE 4 PROHÍBE la jerarquía visual dentro del
      //      panel. Su letra habla de jerarquía entre tipos; su espíritu es que
      //      ninguna alerta grite más que otra, y pintar de otro color las viejas
      //      es exactamente eso.
      //
      // De hoy, la hora: `11:30` responde "cuánto llevas tarde". De un día
      // anterior, la fecha: esa misma hora, de un día que ya pasó, no responde la
      // pregunta que el admin sí tiene, que es cuán viejo es esto.
      //
      // La fecha se formatea con el helper del proyecto y NUNCA construyendo un
      // instante a partir de la cadena: un ISO de solo fecha se parsea como
      // medianoche UTC, y en Bogotá el 1 de septiembre así renderiza el 31 de
      // agosto. Misma regla que ya está escrita en `dates.ts` y misma por la que
      // `fecha_aseo` se modela como `date`.
      //
      // Y es `formatFechaLargaBog` y no `formatFechaBog` porque esta última emite
      // el día de la semana (`vie, 4 de septiembre`), y detrás de "del" eso es
      // agramatical. `dates.ts` ya declara esa distinción y para qué existe.
      //
      // LOS DOS TÍTULOS VAN LITERALES, no compuestos de un tronco común: son el
      // contrato de copy de §12.6 y se leen de un vistazo contra su tabla. Un
      // sufijo compartido ahorraría siete palabras y costaría esa comprobación.
      const copy =
        a.scheduled_date < hoy
          ? `Se venció la hora límite del ${formatFechaLargaBog(a.scheduled_date)} y el aseo sigue sin terminar.`
          : `Se venció la hora límite de las ${a.hora_limite.slice(0, 5)} y el aseo sigue sin terminar.`;

      alertas.push({
        id: `hora_limite_vencida:${a.id}`,
        clave: 'hora_limite_vencida',
        ocurrioEnMs: vence,
        titulo: copy,
        cuerpo: copy,
        apartamento: a.apartamento,
        cleaningId: a.id,
        propertyId: a.property_id,
        // EL ANCLA ES LO QUE HACE OBLIGATORIO QUE EL ASEO SE RENDERICE (§12.1): si
        // no se renderiza en ningún sitio, esta URL resuelve a nada y el clic no
        // hace absolutamente nada ni avisa (T-05-55).
        //
        // HASTA EL PLAN 10-05 ESO LO GARANTIZABA EL BLOQUE `Atrasados`. Ahora lo
        // garantiza **el día metido en el destino**: el selector de día lleva la
        // pantalla al día del aseo y el ancla encuentra su tarjeta. Es una garantía
        // MÁS fuerte que la anterior, porque no depende de que un bloque exista ni
        // de que esté expandido. Y esta alerta es justo la que más lo necesita: su
        // rama NO se acota por fecha, así que su aseo casi siempre es de otro día.
        url: `/operacion?dia=${a.scheduled_date}#aseo-${a.id}`,
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

  // 4. ALMACENAMIENTO LLENO (RET-07). Misma forma que la caída global y por las
  //    mismas razones: es del sistema entero, no de ningún apartamento, y es un
  //    ESTADO que se apaga solo cuando el hecho se resuelve.
  //
  //    `consumo === null` ES "NO SE PUDO MEDIR", Y AHÍ NO SE ALERTA. Afirmar
  //    que está lleno sin haberlo medido es tan falso como afirmar que está
  //    vacío, y quien sí tiene que enterarse del fallo de lectura es el medidor
  //    de la cabecera, que lo dice con todas sus letras.
  if (consumo !== null && superaElUmbral(consumo)) {
    // El instante del hecho es CUÁNDO SE CRUZÓ EL UMBRAL: el `created_at` del
    // objeto en que la suma corrida lo pasó, que la base ya devuelve. Usar
    // `ahoraMs` haría que la alerta saltara al tope de la lista en cada render,
    // empujando hacia abajo hechos más recientes que ella. Es exactamente el
    // razonamiento del bloque de arriba.
    //
    // Con `cruceAt` nulo no hay instante del que partir (la base solo lo deja
    // nulo si no hay cruce, así que llegar aquí con nulo significa que el
    // veredicto y el instante discrepan). Ahí el hecho es "ahora mismo", y hay
    // que escribirlo, porque una alerta con instante `NaN` cae en un sitio
    // arbitrario del orden.
    const marcaMs = consumo.cruceAt === null ? null : instanteDeLaBase(consumo.cruceAt);
    const ocurrioEnMs = marcaMs === null || Number.isNaN(marcaMs) ? ahoraMs : marcaMs;

    // LA CIFRA REAL, NO UN ADJETIVO. "El almacenamiento está casi lleno" no
    // dice si quedan tres días o tres meses; `412 MB de 1 GB (40%)` sí.
    const titulo = `El almacenamiento va en ${formatearBytes(consumo.usadoBytes)} de ${formatearBytes(
      consumo.cupoBytes,
    )} (${porcentajeUsado(consumo)}%).`;

    alertas.push({
      // Fijo, como la caída global: solo puede haber una a la vez por
      // definición, y no hay `cleaning_id` ni `property_id` que la hagan única.
      id: 'almacenamiento_lleno:sistema',
      clave: 'almacenamiento_lleno',
      ocurrioEnMs,
      titulo,
      // EL SÍNTOMA ES LA MITAD DEL VALOR DE ESTA ALERTA. Sin él, el admin lee un
      // porcentaje y no sabe qué se rompe cuando llegue a 100.
      cuerpo: `${titulo} Cuando se llene, las aseadoras no van a poder subir las fotos de evidencia.`,
      apartamento: 'Todo el sistema',
      cleaningId: null,
      propertyId: null,
      // SIN URL, Y ESTÁ JUSTIFICADO. D-08 pide que una alerta sea accionable
      // desde donde se ve; aquí el remedio (subir el plan de Supabase, o el cupo
      // en `app_settings`) está FUERA de la aplicación. Un enlace a una pantalla
      // que no arregla nada sería peor que ninguno, y `Alerta.url` admite `null`
      // exactamente para esto.
      url: null,
      // No tiene fila en `notifications`, luego no tiene `read_at`, luego no se
      // puede atender. Un botón ahí sería un botón que miente: la alerta
      // reaparecería en la lectura siguiente.
      atendible: false,
    });
  }

  return alertas;
}

// ───────────────────────────────────────────────────────────────────────────
// Mezcla, orden, deduplicación y conteos (UI-SPEC §11.4)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Lo mínimo de `notifications` que el panel lee.
 *
 * SOBRE `read_at`, QUE NO ESTÁ EN ESTE `Pick` Y ES DELIBERADO. El panel NO usa
 * `read_at` como "leída": no hay negrita para las no leídas ni gris para las
 * leídas. Cualquier tratamiento de leído/no leído reintroduce exactamente la
 * jerarquía visual que el criterio 4 prohíbe, y además "leída" no es
 * "resuelta". `read_at` significa ATENDIDA, que es una acción explícita del
 * admin, y una alerta atendida SALE de la lista en vez de atenuarse.
 *
 * Por eso esta función recibe las notificaciones YA FILTRADAS por quien lee
 * (con `read_at is null`, o sin ese filtro si el admin activó "Ver atendidas").
 * QUÉ SE MUESTRA ES DECISIÓN DEL CONSUMIDOR; CÓMO SE ORDENA ES DECISIÓN DE
 * AQUÍ.
 */
export type NotificacionParaAlertas = Pick<
  Tables<'notifications'>,
  'id' | 'type' | 'title' | 'body' | 'url' | 'cleaning_id' | 'property_id' | 'created_at'
> & {
  /** Nombre del apartamento, ya resuelto por el join. `null` si la notificación no cuelga de ninguno. */
  apartamento: string | null;
};

/** Una fila de la lista del filtro por tipo (§11.4). */
export type ConteoDeTipo = {
  clave: ClaveDeAlerta;
  /** La del mapa, para que el filtro diga `Daño (3)` y no `dano_reportado (3)`. */
  etiqueta: string;
  conteo: number;
};

/**
 * METE EL DÍA EN UN DESTINO DE `/operacion` QUE LA BASE ESCRIBIÓ SIN ÉL (plan 10-05).
 *
 * `/operacion#aseo-abc` con el día `2026-09-24` sale `/operacion?dia=2026-09-24#aseo-abc`.
 *
 * ── POR QUÉ EXISTE, Y POR QUÉ NO SE ARREGLA EN LA BASE ───────────────────
 *
 * Las tres notificaciones de la migración 19 (`dano_reportado`, `gasto_reportado`,
 * `faltantes_reportados`) escriben `'/operacion#aseo-' || p_cleaning`. Desde el
 * rediseño, `/operacion` se filtra por un día, así que ese ancla aterriza en el día de
 * HOY y no encuentra la fila de un aseo de otro día.
 *
 * **Las tres se dejan como están.** Cambiarlas costaría una migración para arreglar un
 * enlace, y las filas YA ESCRITAS seguirían sin día de todas formas: una migración de
 * datos sobre `notifications.url` para una dirección es exactamente el tipo de cambio
 * que no se hace. El día se resuelve AL PRESENTAR.
 *
 * ── LAS CUATRO RAMAS DE NO HACER NADA, Y LAS CUATRO IMPORTAN ─────────────
 *
 *   1. `url` nula. No hay nada que reescribir (`almacenamiento_lleno`).
 *   2. `dia` ausente. Es el aseo que NO está en la ventana de catorce días que la
 *      campana lee. Se deja tal cual: la degradación de un ancla que no encuentra su
 *      fila es la que ya existía para un bloque de día colapsado, y es mejor que
 *      inventar un día.
 *   3. La ruta no es `/operacion`. La caída global de calendario apunta a
 *      `/apartamentos`, que no tiene selector de día: meterle un `?dia` sería
 *      ensuciar la dirección de otra pantalla con un parámetro que no gobierna.
 *   4. Ya trae un `dia`. No se pisa. Si algún día la base empieza a escribirlo, el que
 *      manda es el de la base, que es quien sabe de qué aseo habla.
 *
 * Es una función de CADENAS y no toca `URL` ni `URLSearchParams`: la entrada es una
 * ruta relativa, y `new URL('/operacion#x')` lanza sin una base.
 */
export function destinoConDia(
  url: string | null,
  dia: string | null | undefined,
): string | null {
  if (url === null || dia === null || dia === undefined) return url;
  if (!url.startsWith('/operacion')) return url;

  const corte = url.indexOf('#');
  const ruta = corte === -1 ? url : url.slice(0, corte);
  const ancla = corte === -1 ? '' : url.slice(corte);

  if (ruta.includes('dia=')) return url;

  return `${ruta}${ruta.includes('?') ? '&' : '?'}dia=${dia}${ancla}`;
}

/** Convierte una fila de `notifications` en una alerta del panel. */
function alertaDeNotificacion(n: NotificacionParaAlertas): Alerta {
  return {
    id: n.id,
    // Se copia tal cual, SIN validar contra el mapa. Un tipo que este
    // despliegue no conoce tiene que llegar entero hasta el componente, que lo
    // resolverá con `presentacionDeAlerta()` y su fallback.
    clave: n.type,
    ocurrioEnMs: instanteDeLaBase(n.created_at),
    // `title` y `body` YA VIENEN REDACTADOS EN ESPAÑOL desde las funciones de
    // la base. El panel los renderiza, no los reescribe (UI-SPEC §0). Son
    // strings planos y React los escapa por defecto; cero
    // `dangerouslySetInnerHTML` en toda la fase (T-04-10).
    titulo: n.title,
    cuerpo: n.body,
    // Cadena vacía y no un `Apartamento desconocido` inventado: el componente
    // decide cómo se ve un slot vacío, este módulo no rellena datos que no
    // tiene.
    apartamento: n.apartamento ?? '',
    cleaningId: n.cleaning_id,
    propertyId: n.property_id,
    url: n.url,
    // Tiene fila en `notifications`, luego tiene `read_at`, luego se puede
    // marcar como atendida.
    atendible: true,
  };
}

/**
 * La lista del panel: las notificaciones persistidas y las alertas computadas,
 * mezcladas en UNA SOLA LISTA PLANA ORDENADA CRONOLÓGICAMENTE.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * EL ORDEN ES EL CRITERIO 4 DEL ROADMAP, NO UNA PREFERENCIA (D-06).
 *
 * Cronológico DESCENDENTE por el instante en que ocurrió el hecho. Lo más
 * reciente arriba. NO por tipo. NO por severidad percibida. NO por procedencia
 * (persistida contra computada). NO por apartamento.
 *
 * Ordenar por severidad o por tipo reabre el criterio y el documento de diseño,
 * y no se resuelve en ejecución: es una decisión de producto que ya se tomó y
 * cuya razón está escrita en D-05. El anti-patrón concreto que este orden
 * ataja es urgentes arriba y "faltantes" al final, donde nadie los lee.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * DEDUPLICACIÓN. Una alerta computada se suprime si YA EXISTE una notificación
 * del mismo tipo Y con el mismo `cleaning_id`. Aplica a `hora_limite_vencida`.
 *
 * NO aplica a la caída global de calendario, que no tiene `cleaning_id`: si la
 * comparación no excluyera el nulo, `null === null` suprimiría la global cada
 * vez que el watchdog escribe su notificación por feed, que es JUSTO cuando las
 * dos son ciertas y tienen que coexistir (04-CONTEXT).
 *
 * Y tampoco puede activarse hoy para nada: `hora_limite_vencida` no lo escribe
 * ninguna migración. Se escribe porque es barata y porque la Fase 5 o la 9
 * pueden añadir el productor.
 *
 * @param notificaciones Filas de `notifications` YA filtradas por el consumidor
 *   según el toggle "Ver atendidas" (ver `NotificacionParaAlertas`).
 * @param computadas Lo que devuelve `alertasComputadas()`.
 */
export function mezclarAlertas(
  notificaciones: NotificacionParaAlertas[],
  computadas: Alerta[],
): Alerta[] {
  // Clave de deduplicación: tipo + aseo. Solo entran las notificaciones que
  // TIENEN `cleaning_id`; las de ámbito de feed o de sistema no pueden suprimir
  // nada porque no hablan del mismo hecho.
  const yaPersistidas = new Set(
    notificaciones
      .filter((n) => n.cleaning_id !== null)
      .map((n) => `${n.type} ${n.cleaning_id}`),
  );

  const supervivientes = computadas.filter(
    (c) => c.cleaningId === null || !yaPersistidas.has(`${c.clave} ${c.cleaningId}`),
  );

  return [...notificaciones.map(alertaDeNotificacion), ...supervivientes].sort(
    (a, b) =>
      // Descendente por instante. El desempate por id NO es cosmético: dos
      // hechos del mismo segundo existen (una corrida del sync inserta en
      // ráfaga), y sin él el orden dependería de la implementación de `sort` y
      // la lista bailaría entre renders sin que nada haya cambiado.
      b.ocurrioEnMs - a.ocurrioEnMs || a.id.localeCompare(b.id),
  );
}

/**
 * Conteo por tipo para la lista del filtro (§11.4).
 *
 * DOS REGLAS, LAS DOS DE USABILIDAD Y LAS DOS FÁCILES DE "optimizar" mal:
 *
 *  1. EL ORDEN ES EL FIJO DE `ORDEN_DE_TIPOS`, NUNCA POR CONTEO. Una lista de
 *     filtro que se reordena sola según los conteos es inusable: la opción que
 *     buscas cambia de sitio cada vez que entra una alerta, y en un panel que
 *     se refresca solo por Realtime eso pasa debajo del cursor.
 *  2. SE INCLUYEN LOS TIPOS EN CERO. Si los ceros se omitieran, el filtro
 *     tendría dos opciones ahora y cinco dentro de un minuto, con el mismo
 *     efecto de arriba.
 *
 * Un tipo desconocido cuenta en ninguna fila y NO añade una opción nueva: la
 * lista es de longitud fija por contrato. La fila sí se ve en el panel, con su
 * rótulo genérico; lo que no hace es inventar una entrada de filtro que nadie
 * sabe nombrar.
 */
export function conteosPorTipo(alertas: Alerta[]): ConteoDeTipo[] {
  const conteos = new Map<string, number>();
  for (const a of alertas) {
    conteos.set(a.clave, (conteos.get(a.clave) ?? 0) + 1);
  }

  return ORDEN_DE_TIPOS.map((clave) => ({
    clave,
    etiqueta: MAPA_DE_ALERTAS[clave].etiqueta,
    conteo: conteos.get(clave) ?? 0,
  }));
}
