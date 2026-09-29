import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Tables } from '@/lib/database.types';
import { hoyBog, sumarDias } from '@/lib/domain/dates';

/**
 * LA CAPA DE LECTURA DE LA PANTALLA DE OPERACIÓN (DASH-01, DASH-02, DASH-03,
 * DASH-07).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * UNA SOLA IDA A LA BASE, TRES SUPERFICIES.
 *
 * El carril ancho de los días, la bandeja "Sin confirmar" y la franja de chips
 * de carga NO son tres consultas: son tres proyecciones distintas del MISMO
 * conjunto de filas. Traerlas por separado serían tres viajes para los mismos
 * datos y, sobre todo, TRES INSTANTES DE LECTURA distintos. D-14 exige una sola
 * marca de tiempo en la cabecera, y con tres lecturas no hay respuesta honesta
 * a la pregunta "¿cuál de las tres se muestra?".
 *
 * Por eso `leerOperacion()` devuelve las filas crudas más el instante en que se
 * leyeron, y las tres proyecciones son funciones PURAS exportadas aparte que
 * operan sobre esas filas. Ahí es donde viven los tests unitarios: lo que
 * decide si el dashboard es correcto no es la consulta, es el filtro que se le
 * aplica encima.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * EL CLIENTE LLEGA POR PARÁMETRO y no se construye aquí, igual que en
 * `lib/data/apartamentos.ts` y `lib/data/aseadores.ts`. Así la misma función
 * sirve a un RSC (con el JWT del admin, filtrada por `cleanings_admin_all`) y a
 * un test de integración con el JWT que se quiera probar. Construirlo dentro
 * ataría el módulo a `next/headers`.
 *
 * NADA DE CLIENTE DE SERVICIO AQUÍ (T-04-06). `cleanings` tiene `grant select`
 * para `authenticated` y `cleanings_admin_all` ya deja ver todo al admin, así
 * que saltar la RLS no haría falta ni aunque estuviera permitido.
 * `scripts/ci/check-service-role.sh` rompe el build si esta capa importara la
 * fábrica administrativa.
 *
 * NINGUNA COLUMNA DE SECRETOS (T-04-11). El `select` de abajo es explícito y no
 * lleva `*`. Las dos credenciales del apartamento viven en otra tabla que no
 * tiene ningún grant, así que el código de acceso no es alcanzable desde esta
 * consulta ni por error.
 *
 * NADA DE CACHE, misma regla que el resto de `lib/data/`: son datos por usuario
 * y una entrada compartida se le sirve a otro.
 */

/**
 * El horizonte del bloque `Siguientes`: `hoy + 6`.
 *
 * DASH-01 pide los aseos "organizados por día", así que `Siguientes` agrupa por
 * día y no es una lista corrida: una lista de 31 filas pierde justo el ancla que
 * el requisito nombra. Cinco días (D+2 … D+6) es el horizonte con el que se
 * decide un suplente; más allá no hay ninguna decisión que tomar hoy, y por eso
 * lo que queda más lejos se CUENTA pero no se agrupa.
 */
export const HORIZONTE_DIAS = 6;

/**
 * CUÁNTOS DÍAS HACIA ATRÁS MIRA LA PANTALLA (D-08, criterio 7 del ROADMAP).
 *
 * Siete. Tres razones, y la tercera es la que decide (05-UI-SPEC §12.4):
 *
 *   1. SIN TOPE LA CONSULTA CRECE SIN LÍMITE. La retención del producto es de
 *      seis meses, así que un aseo huérfano de marzo se seguiría cargando en
 *      cada apertura del dashboard, para siempre y sin que nadie lo mire
 *      (T-05-54).
 *   2. UN ASEO SIN CERRAR DE HACE MÁS DE UNA SEMANA YA NO ES UNA ALERTA
 *      OPERATIVA, es higiene de datos: nadie va a mandar a alguien a limpiar un
 *      checkout de hace diez días. Lo que queda más atrás se CUENTA y se dice
 *      dónde verlo; no se esconde.
 *   3. SIETE DÍAS YA ES UNA VENTANA DE ESTE PRODUCTO: el toggle `Ver atendidas`
 *      del panel de alertas muestra las de los últimos siete (04-UI-SPEC §11.4).
 *      Reusar el número en vez de inventar otro evita que dos partes de la MISMA
 *      pantalla midan "reciente" distinto, que es la clase de incoherencia que
 *      nadie reporta y todo el mundo nota.
 */
export const VENTANA_ATRAS_DIAS = 7;

/** La etiqueta del chip de los aseos de hoy que no tienen a nadie (UI-SPEC §8.2). */
export const SIN_ASIGNAR = 'Sin asignar';

/**
 * Los estados que cuentan como trabajo VIVO del día.
 *
 * Deja fuera `cancelada` y `completada` a propósito: un chip de carga responde
 * "cuánto le queda por hacer a esta persona hoy", no "cuánto tocó". Contar lo
 * cancelado infla el número y manda a la aseadora libre al apartamento
 * equivocado.
 */
const ESTADOS_VIVOS: ReadonlySet<string> = new Set(['pendiente', 'en_curso']);

/** El apartamento tal como lo pinta la fila de aseo (UI-SPEC §7.1 y §7.5). */
export interface PropiedadDeAseo {
  id: string;
  nombre: string;
  gestion_vivaguest: boolean;
  /** Quien atiende la unidad informativa. Es lo que va en la columna A CARGO. */
  contacto_externo: string | null;
  hora_limite: string;
}

/** El aseador asignado, resuelto por embed. `null` en las filas sin asignar. */
export interface AseadorDeAseo {
  id: string;
  full_name: string;
}

/**
 * Una fila de la consulta única, con sus dos embeds resueltos.
 *
 * Las columnas son EXACTAMENTE las que la pantalla usa. `instrucciones`,
 * `pago_aseador` y `tarifa_huesped` no están porque el carril no las pinta: el
 * `Sheet` de confirmación las lee aparte cuando el admin abre un aseo concreto.
 */
export type FilaDeOperacion = Pick<
  Tables<'cleanings'>,
  | 'id'
  | 'scheduled_date'
  | 'state'
  | 'tipo'
  | 'hora_limite'
  | 'is_managed'
  | 'is_urgent'
  | 'needs_review'
  | 'review_reason'
  | 'cancel_reason'
  | 'confirmado_at'
  | 'num_huespedes'
  | 'started_at'
  | 'finished_at'
  | 'aseador_id'
  | 'property_id'
  | 'created_at'
> & {
  property: PropiedadDeAseo | null;
  aseador: AseadorDeAseo | null;
  /**
   * Quedó algún cuarto saltado, o alguna tarea que exige foto sin foto.
   *
   * NO es una columna de `cleanings`: se computa al leer. Materializarla
   * obligaría a sincronizarla desde tres sitios (el checklist, las fotos y los
   * saltos), y el día que uno de los tres se olvidara, el dashboard mentiría
   * sin que nadie lo notara.
   */
  sin_evidencia_completa: boolean;
};

/** Un día del carril ancho, con su cabecera propia (UI-SPEC §8.1). */
export interface GrupoDeDia {
  /** `'YYYY-MM-DD'`. Se formatea con `formatFechaBog()` al pintar. */
  fecha: string;
  filas: FilaDeOperacion[];
}

/**
 * Los tres bloques de UI-SPEC §8.1, el cuarto que trajo D-08, y las dos líneas
 * de lo que queda fuera de la ventana por cada lado.
 *
 * LOS CUATRO CAMPOS DE `Atrasados` SON DATOS, NO PRESENTACIÓN. Quién decide si
 * el bloque se pinta, en qué orden va y cómo se redacta su cabecera es el
 * componente; acá solo se dice qué hay.
 */
export interface BloquesDeAgenda {
  /**
   * Aseos VIVOS y gestionados con fecha anterior a hoy, dentro de la ventana de
   * `VENTANA_ATRAS_DIAS` (05-UI-SPEC §12.2). Agrupados POR DÍA y ascendentes: lo
   * más viejo primero.
   *
   * AL REVÉS QUE `siguientes`, SOLO SE EMITEN LOS DÍAS CON CONTENIDO. Un día
   * futuro vacío es información —no hay nada programado y el admin lo confirma—;
   * un día pasado vacío es que no había nada que hacer, y siete cabeceras en
   * cero serían un muro que entrena a saltarse el bloque justo cuando importa
   * (§12.3).
   */
  atrasados: GrupoDeDia[];
  hoy: GrupoDeDia;
  manana: GrupoDeDia;
  /** D+2 … D+6. Siempre cinco grupos, vacíos incluidos. */
  siguientes: GrupoDeDia[];
  /** `hoy + HORIZONTE_DIAS`, para la línea `Hay N aseos programados después del …`. */
  ultimoDiaDelHorizonte: string;
  /** Cuántos aseos quedan por detrás del horizonte. Se cuentan, no se agrupan. */
  masAllaDelHorizonte: number;
  /** `hoy - VENTANA_ATRAS_DIAS`, para la línea `Hay N aseos sin cerrar de antes del …`. */
  primerDiaDeLaVentana: string;
  /**
   * Cuántos aseos vivos quedan por detrás de la ventana. Se cuentan, no se
   * agrupan, exactamente como `masAllaDelHorizonte` por el otro extremo.
   */
  antesDeLaVentana: number;
  /**
   * La fecha del atrasado más antiguo DENTRO de la ventana, `null` si no hay
   * ninguno. La cabecera la usa para decir `3 aseos · el más viejo del 4 de
   * septiembre`: `3 aseos` a secas no es una decisión, porque tres de ayer y
   * tres de hace una semana son problemas distintos (§12.2).
   */
  masViejoAtrasado: string | null;
}

/** Un chip de la franja de carga. `aseadorId` nulo es el chip `Sin asignar`. */
export interface ChipDeCarga {
  aseadorId: string | null;
  nombre: string;
  conteo: number;
}

/** Un aseador tal como lo consume la franja de chips. */
export interface AseadorDeChip {
  id: string;
  full_name: string;
}

/** Lo que devuelve la consulta única: las filas y su único instante de lectura. */
export interface Operacion {
  filas: FilaDeOperacion[];
  /**
   * Día de negocio de Bogotá. Es el EJE de la ventana, no su límite inferior:
   * desde D-08 la consulta baja hasta `hoy - VENTANA_ATRAS_DIAS`.
   */
  hoy: string;
  /** `hoy + HORIZONTE_DIAS`. Límite superior de la ventana. */
  horizonte: string;
  /** El instante de la lectura, para la línea de frescura de D-14. */
  leidoEnMs: number;
}

/**
 * El `select` de la consulta única.
 *
 * ── EL ALIAS DE CLAVE FORÁNEA NO ES OPCIONAL ───────────────────────────────
 *
 * `cleanings` tiene DOS claves foráneas hacia `profiles`: `cleanings_aseador_id_fkey`
 * (el asignado) y `cleanings_confirmado_by_fkey` (quien confirmó). Un embed
 * `profiles(...)` sin calificar es AMBIGUO y PostgREST responde `PGRST201`
 * ("Could not embed because more than one relationship was found"). `damages`
 * tiene el mismo problema con `damages_reported_by_fkey` y `damages_resolved_by_fkey`.
 *
 * Y esto NO lo atrapa `tsc`: `lib/database.types.ts` tipa el embed pero no
 * valida la ambigüedad, así que el fallo aparece en el primer render y no al
 * compilar. Es exactamente la razón por la que existe
 * `operacion.integration.test.ts`: el contrato hay que medirlo contra PostgREST
 * de verdad, con un JWT de verdad.
 *
 * ── NO HAY N+1 ─────────────────────────────────────────────────────────────
 *
 * Un embed de PostgREST es un `LEFT JOIN LATERAL` dentro de UNA sola consulta,
 * no una consulta por fila. Los dos embeds no multiplican los viajes.
 *
 * ── LA RLS DEL EMBED TAMBIÉN APLICA (T-04-13) ──────────────────────────────
 *
 * El admin pasa `properties_admin_all` y `profiles_admin_all` y lo ve todo. Un
 * aseador no llega a esta ruta, pero si llegara vería solo sus filas por
 * `cleanings_cleaner_select` y `properties_cleaner_select` recortaría el embed a
 * los apartamentos de su ventana. No hay fuga por aquí.
 */
const SELECT_OPERACION = `
  id, scheduled_date, state, tipo, hora_limite, is_managed, is_urgent,
  needs_review, review_reason, cancel_reason, confirmado_at, num_huespedes,
  started_at, finished_at, aseador_id, property_id, created_at,
  property:properties!cleanings_property_id_fkey (
    id, nombre, gestion_vivaguest, contacto_externo, hora_limite
  ),
  aseador:profiles!cleanings_aseador_id_fkey ( id, full_name )
`;

/**
 * La consulta única que alimenta las tres superficies de `/operacion`.
 *
 * ── LA VENTANA SALE DEL DÍA DE NEGOCIO, NUNCA DE LA FECHA DEL PROCESO ──────
 *
 * El límite inferior cuelga de `hoyBog()`, el equivalente en TypeScript de
 * `public.today_bog()`. Vercel y el CI corren en UTC, así que pasadas las 19:00
 * de Bogotá un `new Date().toISOString().slice(0,10)` ya devuelve MAÑANA: la
 * ventana empezaría un día tarde y el aseo de esta noche desaparecería del
 * bloque `Hoy` durante las cinco horas en que nadie está mirando la pantalla
 * para descubrirlo. Señuelo corrido y medido en `operacion.test.ts`.
 *
 * Lo que D-08 cambió es SOLO EL DESPLAZAMIENTO, no ese razonamiento: el límite
 * inferior es `hoy - VENTANA_ATRAS_DIAS` en vez de `hoy`, y sigue saliendo del
 * día de negocio. Sin esa resta, un aseo de ayer vivo y vencido jamás llega a
 * `alertasComputadas()`, que no acota por fecha y nunca pudo demostrarlo: la
 * alerta que el producto promete no se pierde se perdía en la consulta, una
 * capa antes. Criterio 7 del ROADMAP.
 *
 * ── LOS CANCELADOS SE TRAEN Y SE FILTRAN EN MEMORIA ────────────────────────
 *
 * La cabecera del día lleva un toggle `Ver cancelados (N)` (UI-SPEC §8.1), así
 * que el conteo tiene que estar disponible: excluirlos en la consulta lo haría
 * imposible sin un segundo viaje. Si algún día el volumen lo justificara, la
 * alternativa en PostgREST sería `.or('state.is.null,state.neq.cancelada')`,
 * porque `.neq()` a secas descarta también los nulos de gestión externa. Esa
 * incomodidad es justo la razón por la que la regla transversal del proyecto
 * dice `is distinct from` en SQL. NO se implementa hoy; queda anotado.
 *
 * ── SOBRE EL ÍNDICE, SIN AFIRMAR DE MÁS ────────────────────────────────────
 *
 * `cleanings_agenda_idx` es `on (scheduled_date, state) where is_managed`, es
 * decir PARCIAL: NO cubre las filas de gestión externa, que DASH-07 sí necesita
 * mostrar. Con 34 unidades gestionadas y 5 informativas es irrelevante, pero no
 * se puede afirmar que esta consulta usa el índice.
 *
 * ── EL DÍA PEDIDO **AMPLÍA** LA VENTANA Y NO MUEVE SU EJE (D-05-1, plan 10-05) ─
 *
 * El selector de día de la pantalla puede pedir un día que cae fuera de los
 * catorce. Cuando eso pasa, el límite de ESE extremo se estira hasta el día
 * pedido y **el otro no se mueve**. El eje sigue siendo `hoyBog()` con sus dos
 * constantes.
 *
 * **Y esa es la decisión central del plan, no un detalle de implementación.** La
 * ventana de catorce días es la que alimenta `alertasComputadas()`, y en
 * particular la alerta de hora límite vencida, que es el criterio 7 del ROADMAP y
 * la única que NO se acota por fecha. Mover el eje al día seleccionado haría que
 * **navegar a un día pasado apagara las alertas de hoy**: el admin se iría a
 * revisar el martes y las tres alertas vivas de esta tarde desaparecerían de la
 * campana sin que nada lo dijera. Hay una unitaria que lo afirma por los dos
 * extremos, y su señuelo (mover el eje en vez de ampliar) es el señuelo
 * importante del plan.
 *
 * Toda comparación es entre cadenas `'YYYY-MM-DD'`: su orden lexicográfico
 * coincide con el cronológico y no se construye ningún `Date`.
 *
 * @param ahoraMs El instante de la lectura. Entra por parámetro para que la
 *   cabecera de frescura y las proyecciones compartan una sola marca (D-14).
 * @param diaPedido El día del selector, ya validado por `diaValido()`. `null`
 *   cuando la dirección no lo trae, y entonces la ventana es la de siempre.
 */
export async function leerOperacion(
  supabase: SupabaseClient<Database>,
  ahoraMs: number = Date.now(),
  diaPedido: string | null = null,
): Promise<Operacion> {
  const hoy = hoyBog();
  const horizonte = sumarDias(hoy, HORIZONTE_DIAS);
  const arranque = sumarDias(hoy, -VENTANA_ATRAS_DIAS);

  // Ampliar, nunca estrechar: el día pedido solo puede empujar un límite HACIA
  // AFUERA. Un día de dentro de la ventana deja los dos exactamente donde están.
  const desde = diaPedido !== null && diaPedido < arranque ? diaPedido : arranque;
  const hasta = diaPedido !== null && diaPedido > horizonte ? diaPedido : horizonte;

  const { data, error } = await supabase
    .from('cleanings')
    .select(SELECT_OPERACION)
    .gte('scheduled_date', desde)
    .lte('scheduled_date', hasta)
    .order('scheduled_date', { ascending: true })
    // Desempate dentro del día: la columna de horas de la tabla tiene que subir.
    // Las proyecciones de abajo CONSERVAN este orden y no reordenan por su
    // cuenta, salvo la bandeja, que tiene su propio contrato de orden.
    .order('hora_limite', { ascending: true });

  if (error) throw new Error(error.message);

  const filas = (data ?? []) as FilaSinMarca[];

  /**
   * LA MARCA DE EVIDENCIA INCOMPLETA, EN **UN** VIAJE MÁS Y NO EN N.
   *
   * ── LOS DOS CAMINOS, Y POR QUÉ SE DESCARTÓ EL OBVIO ──────────────────────
   *
   * El obvio es llamar `aseo_sin_evidencia_completa()` por fila. Son decenas de
   * aseos en la ventana, así que serían decenas de viajes de red en serie para
   * pintar una tabla: el mismo defecto que este archivo ya evita con sus otras
   * lecturas, y por la misma razón escrita allí.
   *
   * El elegido es `aseos_sin_evidencia_completa()` (migración 21), que recibe la
   * lista entera y devuelve el subconjunto. La evaluación por fila sigue
   * ocurriendo, pero **dentro de la base**, que es donde cuesta barato.
   *
   * Y esa función **no reimplementa la regla**: llama a la escalar. La regla ya
   * vive dos veces —SQL y `lib/domain/checklist.ts`— con un test de paridad que
   * las compara; una tercera copia no tendría ni ese test, y el síntoma de que
   * divergiera sería el dashboard diciendo que un aseo está completo mientras la
   * pantalla del aseador dice lo contrario.
   *
   * ── SI ESTA CONSULTA FALLA, LA TABLA SE PINTA IGUAL ─────────────────────
   *
   * La marca es una señal secundaria. Tumbar `/operacion` entera —que es la
   * pantalla desde la que el admin confirma y reasigna— porque una señal
   * accesoria no se pudo leer sería cambiar un dato que falta por una jornada
   * sin herramienta. Se degrada a `false`, que es lo que la fila decía antes de
   * esta fase.
   */
  const sinEvidencia = await marcarSinEvidencia(supabase, filas.map((f) => f.id));

  return {
    filas: filas.map((f) => ({ ...f, sin_evidencia_completa: sinEvidencia.has(f.id) })),
    hoy,
    horizonte,
    leidoEnMs: ahoraMs,
  };
}

/** La fila tal como la devuelve PostgREST, antes de que se le pegue la marca. */
type FilaSinMarca = Omit<FilaDeOperacion, 'sin_evidencia_completa'>;

async function marcarSinEvidencia(
  supabase: SupabaseClient<Database>,
  ids: string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();

  const { data, error } = await supabase.rpc('aseos_sin_evidencia_completa', {
    p_cleanings: ids,
  });

  // Ver arriba: la señal se degrada, la pantalla no.
  if (error || !data) return new Set();

  return new Set(data);
}

/**
 * LAS FILAS DE UN DÍA, Y NADA MÁS (plan 10-05).
 *
 * Es la proyección que sustituye a `agruparPorDia` cuando el eje de la pantalla
 * deja de ser "relativo a hoy" y pasa a ser el día del selector. Con un selector
 * de día, `Mañana` deja de tener significado.
 *
 * ── EL FILTRO ES SUYO Y NO SE DELEGA A LA CONSULTA ─────────────────────────
 *
 * Misma razón literal que ya tiene escrita la cabecera de `agruparPorDia`: **una
 * proyección que dependa de que su entrada venga filtrada es una proyección que
 * miente en cuanto alguien la reutiliza**. Y aquí no es teórico: la consulta trae
 * la ventana ENTERA de catorce días a propósito, porque de ella salen las alertas
 * y la cifra de desbordamiento del vistazo. Este filtro es el único sitio donde el
 * día seleccionado recorta.
 *
 * Comparación entre cadenas `'YYYY-MM-DD'`, nunca construyendo un `Date`.
 *
 * CONSERVA EL ORDEN DE ENTRADA (fecha y después hora límite, el de la consulta) y
 * NO MUTA el array que recibe: `filter` devuelve uno nuevo. `filas` es la misma
 * lista que alimenta el vistazo y las alertas, y reordenarla por debajo cambiaría
 * el orden de la pantalla entera.
 *
 * LOS CANCELADOS SE CONSERVAN, igual que en la consulta y por lo mismo: el
 * contador del toggle `Ver cancelados (N)` los necesita, y quien decide qué se
 * pinta es el componente.
 */
export function filasDelDia(filas: FilaDeOperacion[], dia: string): FilaDeOperacion[] {
  return filas.filter((f) => f.scheduled_date === dia);
}

/**
 * Los tres bloques del carril ancho (DASH-01), sobre las filas ya traídas.
 *
 * Toda comparación de fechas se hace sobre cadenas `'YYYY-MM-DD'` y NUNCA
 * construyendo un `Date`: el orden lexicográfico de esa forma coincide con el
 * cronológico, y un `new Date('2026-09-10')` se parsea como medianoche UTC y en
 * Bogotá renderiza el día anterior.
 *
 * Los cinco grupos de `Siguientes` se emiten SIEMPRE, vacíos incluidos: UI-SPEC
 * §8.1 pinta la cabecera del día con `0 aseos` porque que hoy no haya nada en un
 * día es información, no un día que se oculta.
 *
 * ── EL SEGUNDO FILTRO DE FECHA, QUE D-08 REESCRIBIÓ Y NO BORRÓ ────────────
 *
 * Hasta D-08 acá había un descarte de todo lo anterior a `hoy`, redundante con
 * el `.gte()` de la consulta, y su razón de existir era —y sigue siendo— que
 * esta función también la llaman los tests con filas armadas a mano: una
 * proyección que dependa de que su entrada venga filtrada es una proyección que
 * miente en cuanto alguien la reutiliza. Por eso el filtro es SUYO y no se puede
 * delegar a la consulta.
 *
 * Lo que cambió es a dónde van esas filas: a partir de D-08 **sí tienen sitio**,
 * el bloque `Atrasados`. Y ese es justo el motivo por el que ampliar solo la
 * consulta habría dejado el defecto intacto con apariencia de arreglado: las
 * filas habrían llegado y este descarte las habría vuelto a tirar, con el bloque
 * saliendo vacío y sin que nada avisara.
 *
 * Lo que NO cambió: un aseo anterior a `hoy` sigue sin colarse en `hoy`, en
 * `mañana`, en `siguientes` ni en el conteo del horizonte.
 */
export function agruparPorDia(filas: FilaDeOperacion[], hoy: string): BloquesDeAgenda {
  const manana = sumarDias(hoy, 1);
  const ultimoDiaDelHorizonte = sumarDias(hoy, HORIZONTE_DIAS);
  const primerDiaDeLaVentana = sumarDias(hoy, -VENTANA_ATRAS_DIAS);

  const bloqueHoy: GrupoDeDia = { fecha: hoy, filas: [] };
  const bloqueManana: GrupoDeDia = { fecha: manana, filas: [] };

  const siguientes: GrupoDeDia[] = [];
  for (let offset = 2; offset <= HORIZONTE_DIAS; offset += 1) {
    siguientes.push({ fecha: sumarDias(hoy, offset), filas: [] });
  }
  const porFecha = new Map(siguientes.map((grupo) => [grupo.fecha, grupo]));

  let masAllaDelHorizonte = 0;

  // Los días atrasados se descubren sobre la marcha (solo los que tienen algo),
  // así que se indexan en un mapa y se ordenan al final. Al revés que
  // `siguientes`, que es una rejilla fija de cinco días conocidos de antemano.
  const atrasadosPorFecha = new Map<string, GrupoDeDia>();
  let antesDeLaVentana = 0;

  for (const fila of filas) {
    const fecha = fila.scheduled_date;

    if (fecha < hoy) {
      // El contenido de `Atrasados` (§12.2): gestionado y con trabajo vivo. Un
      // aseo terminado o cancelado de ayer NO está atrasado, está cerrado, y una
      // unidad de gestión externa no la opera VivaGuest, así que no hay nada que
      // el admin pueda hacer con ella. Mismo predicado que usa
      // `alertasComputadas()` para decidir si alerta, y no por casualidad: la
      // alerta y la fila donde aterriza su clic tienen que aparecer juntas o no
      // aparecer (T-05-55).
      const vivo = fila.is_managed && fila.state !== null && ESTADOS_VIVOS.has(fila.state);
      if (!vivo) continue;

      // Fuera de la ventana se CUENTA y no se agrupa, igual que lo que queda más
      // allá del horizonte por el otro extremo (§12.4).
      if (fecha < primerDiaDeLaVentana) {
        antesDeLaVentana += 1;
        continue;
      }

      const grupo = atrasadosPorFecha.get(fecha);
      if (grupo) grupo.filas.push(fila);
      else atrasadosPorFecha.set(fecha, { fecha, filas: [fila] });
      continue;
    }

    if (fecha === hoy) {
      bloqueHoy.filas.push(fila);
      continue;
    }
    if (fecha === manana) {
      bloqueManana.filas.push(fila);
      continue;
    }

    const grupo = porFecha.get(fecha);
    // Sin grupo solo puede significar una cosa: la fecha pasó del horizonte.
    // Los días son discretos y los cinco intermedios están todos en el mapa.
    if (grupo) grupo.filas.push(fila);
    else masAllaDelHorizonte += 1;
  }

  // Ascendente: lo más viejo arriba. La comparación es entre cadenas
  // `'YYYY-MM-DD'`, cuyo orden lexicográfico coincide con el cronológico; no se
  // construye ningún `Date`.
  const atrasados = [...atrasadosPorFecha.values()].sort((a, b) =>
    a.fecha < b.fecha ? -1 : 1,
  );

  return {
    atrasados,
    hoy: bloqueHoy,
    manana: bloqueManana,
    siguientes,
    ultimoDiaDelHorizonte,
    masAllaDelHorizonte,
    primerDiaDeLaVentana,
    antesDeLaVentana,
    masViejoAtrasado: atrasados.length === 0 ? null : atrasados[0].fecha,
  };
}

/**
 * La bandeja "Sin confirmar" (DASH-02, ASEO-01).
 *
 * El filtro es el PREDICADO LITERAL del índice `cleanings_unconfirmed_idx`:
 * gestionado, `pendiente` y sin `confirmado_at`. Escribirlo igual no es
 * cosmética, es lo que hace que la bandeja de la pantalla y la que cuenta la
 * base sean la misma bandeja.
 *
 * ORDEN (UI-SPEC §9): `scheduled_date` ascendente; dentro de la MISMA fecha, los
 * urgentes primero y después por nombre de apartamento. **La urgencia adelanta
 * dentro del día, no salta días**: un urgente del viernes no va antes de uno
 * normal de hoy. Invertir esos dos criterios pondría arriba trabajo que todavía
 * no toca y dejaría abajo el de esta tarde.
 *
 * El desempate por nombre va con `localeCompare('es-CO')` y no con `<`: un
 * `sort()` a secas compara puntos de código UTF-16 y manda 'Álamos' después de
 * 'Zipaquirá'.
 *
 * No muta la entrada: `filter` ya devuelve un array nuevo y es ese el que se
 * ordena. `filas` es la misma lista que alimenta el carril ancho, y reordenarla
 * por debajo cambiaría el orden de la pantalla entera.
 */
export function bandejaSinConfirmar(filas: FilaDeOperacion[]): FilaDeOperacion[] {
  return filas
    .filter((f) => f.is_managed && f.state === 'pendiente' && f.confirmado_at === null)
    .sort((a, b) => {
      if (a.scheduled_date !== b.scheduled_date) {
        return a.scheduled_date < b.scheduled_date ? -1 : 1;
      }
      if (a.is_urgent !== b.is_urgent) return a.is_urgent ? -1 : 1;
      return nombreDelApartamento(a).localeCompare(nombreDelApartamento(b), 'es-CO');
    });
}

/**
 * Los chips de carga de HOY (DASH-03).
 *
 * Cuenta los aseos de hoy, GESTIONADOS y con estado VIVO, agrupados por
 * `aseador_id`. Quedan fuera los cancelados, los terminados y las filas de
 * gestión externa (que no tienen estado ni aseador por construcción).
 *
 * Se listan TODOS los aseadores activos, incluidos los que van en cero: "quién
 * está libre" es la mitad de la decisión del suplente, y ocultar los ceros deja
 * solo la otra mitad.
 *
 * `Sin asignar` se emite solo si su conteo es mayor que cero, y va SIEMPRE
 * último sin importar cuánto sume.
 *
 * UN ASEADOR QUE NO ESTÁ EN LA LISTA DE ACTIVOS PERO TIENE TRABAJO DE HOY
 * TAMBIÉN SALE, con el nombre que trae el embed. Es el caso de alguien
 * desactivado con aseos ya asignados: omitirlo haría que la suma de los chips no
 * cuadrara con las filas del día y que ese trabajo desapareciera de la vista
 * justo cuando hay que reasignarlo.
 */
export function cargaPorAseador(
  filas: FilaDeOperacion[],
  hoy: string,
  aseadoresActivos: AseadorDeChip[],
): ChipDeCarga[] {
  const conteos = new Map<string, number>();
  const nombres = new Map<string, string>();

  for (const aseador of aseadoresActivos) {
    conteos.set(aseador.id, 0);
    nombres.set(aseador.id, aseador.full_name);
  }

  let sinAsignar = 0;

  for (const fila of filas) {
    if (fila.scheduled_date !== hoy) continue;
    if (!fila.is_managed) continue;
    if (fila.state === null || !ESTADOS_VIVOS.has(fila.state)) continue;

    if (fila.aseador_id === null) {
      sinAsignar += 1;
      continue;
    }

    conteos.set(fila.aseador_id, (conteos.get(fila.aseador_id) ?? 0) + 1);
    if (!nombres.has(fila.aseador_id)) {
      // El embed puede venir nulo si la RLS no deja ver ese perfil. El id crudo
      // es feo en pantalla pero es cierto; inventar 'Desconocido' escondería
      // que hay trabajo asignado a alguien que esta sesión no puede resolver.
      nombres.set(fila.aseador_id, fila.aseador?.full_name ?? fila.aseador_id);
    }
  }

  const chips: ChipDeCarga[] = [...conteos.entries()]
    .map(([aseadorId, conteo]) => ({
      aseadorId,
      nombre: nombres.get(aseadorId) ?? aseadorId,
      conteo,
    }))
    .sort((a, b) => b.conteo - a.conteo || a.nombre.localeCompare(b.nombre, 'es-CO'));

  if (sinAsignar > 0) {
    chips.push({ aseadorId: null, nombre: SIN_ASIGNAR, conteo: sinAsignar });
  }

  return chips;
}

// ─────────────────────────────────────────────────────────────────────────────
// LAS TRES CONSULTAS AUXILIARES
//
// Van aparte de la consulta única porque leen OTRAS tablas: no son proyecciones
// del mismo conjunto de filas y no habría forma de traerlas en el mismo viaje.
// ─────────────────────────────────────────────────────────────────────────────

/** Una alerta del panel, tal como la pinta la fila de 64px de UI-SPEC §11.3. */
export type AlertaDelAdmin = Pick<
  Tables<'notifications'>,
  | 'id'
  | 'type'
  | 'title'
  | 'body'
  | 'url'
  | 'created_at'
  | 'read_at'
  | 'recipient_id'
  | 'cleaning_id'
  | 'property_id'
>;

/** Un aseador activo, para los chips de carga y el `Select` de reasignar. */
export type AseadorActivo = Pick<Tables<'profiles'>, 'id' | 'full_name' | 'is_active'>;

/**
 * Las alertas SIN ATENDER del admin, más reciente primero (DASH-04, DASH-05).
 *
 * El filtro (`recipient_id` + `read_at is null`) y el orden coinciden EXACTO con
 * `notifications_inbox_idx`, que es parcial `where read_at is null`.
 *
 * ── DOS COSAS QUE VAN A LLEGAR COMO REPORTE DE BUG ─────────────────────────
 *
 * 1. **El toggle `Ver atendidas` cae FUERA del índice parcial** y hace seq scan.
 *    Con un solo admin y decenas de notificaciones es irrelevante, pero conviene
 *    saberlo antes de que alguien lo mida y lo reporte como regresión.
 *
 * 2. **Cinco de las once notificaciones del sistema van a TODOS los admins
 *    activos, y `notifications.recipient_id` es NOT NULL.** No existe "una
 *    notificación para el rol": cada alerta se inserta una vez por admin activo,
 *    así que marcar una como atendida NO la marca para los demás. Es correcto por
 *    diseño, porque `read_at` es por destinatario, no por hecho.
 *
 * `userId` se pasa aunque `notifications_own_select` ya acote a `auth.uid()`: la
 * policy decide qué filas son visibles, el filtro decide qué índice se usa. Sin
 * él PostgREST no puede aprovechar `notifications_inbox_idx`.
 */
export async function leerAlertasDelAdmin(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<AlertaDelAdmin[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, title, body, url, created_at, read_at, recipient_id, cleaning_id, property_id')
    .eq('recipient_id', userId)
    .is('read_at', null)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  return data ?? [];
}

/** Ventana del toggle `Ver atendidas` (UI-SPEC §11.4): siete días. */
export const DIAS_DE_ATENDIDAS = 7;

/**
 * Las alertas YA ATENDIDAS del admin en los últimos siete días (UI-SPEC §11.4).
 *
 * Es la mitad de atrás del toggle `Ver atendidas`, y va en función aparte y no
 * como un parámetro de `leerAlertasDelAdmin()` a propósito: esa consulta calza
 * columna a columna con `notifications_inbox_idx`, que es PARCIAL
 * (`where read_at is null`), y meterle una rama que anule ese filtro haría que su
 * docstring dejara de ser cierta la mitad de las veces.
 *
 * **Esta consulta cae fuera del índice parcial y hace seq scan.** Con un admin y
 * decenas de notificaciones es irrelevante, pero conviene saberlo antes de que
 * alguien lo mida y lo reporte como regresión.
 *
 * ── LA VENTANA SE MIDE SOBRE `read_at`, NO SOBRE `created_at` ──────────────
 *
 * El toggle responde a "qué he cerrado yo últimamente", que es una pregunta sobre
 * CUÁNDO SE ATENDIÓ. Con `created_at` una alerta de hace dos meses atendida hoy
 * no aparecería, que es justo el caso en que el admin va a buscarla: acaba de
 * pulsar el botón y quiere deshacerlo.
 *
 * El ORDEN sigue siendo por `created_at` descendente, porque quien ordena el
 * panel es `mezclarAlertas()` por el instante del hecho (D-06) y esta lista entra
 * ahí. Pedirlo ordenado igualmente hace estable la lista entre dos lecturas.
 *
 * @param ahoraMs El instante de la lectura, el mismo de toda la pantalla (D-14).
 */
export async function leerAlertasAtendidas(
  supabase: SupabaseClient<Database>,
  userId: string,
  ahoraMs: number,
): Promise<AlertaDelAdmin[]> {
  const desde = new Date(ahoraMs - DIAS_DE_ATENDIDAS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('notifications')
    .select(
      'id, type, title, body, url, created_at, read_at, recipient_id, cleaning_id, property_id',
    )
    .eq('recipient_id', userId)
    .not('read_at', 'is', null)
    .gte('read_at', desde)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  return data ?? [];
}

/**
 * El `last_success_at` MÁS RECIENTE entre todos los feeds activos.
 *
 * Es la entrada de `estadoDeSincronizacion()`, que es la única capa del sistema
 * que no es ciega a su propia muerte: se computa AL LEER, así que se dispara
 * aunque no corra absolutamente nada dentro de la base.
 *
 * ── LA TRAMPA, Y NO ES OPCIONAL ────────────────────────────────────────────
 *
 * PostgREST no tiene `max()`. Se resuelve ordenando y quedándose con la primera
 * fila, y ahí aparece el detalle que lo rompe todo: **por defecto Postgres pone
 * los NULOS PRIMERO en orden descendente**. Un feed recién conectado que todavía
 * no corrió tiene `last_success_at` nulo, así que sin `nullsFirst: false` esta
 * función devolvería `null`, `estadoDeSincronizacion(null, …)` diría `'caida'` y
 * el panel pintaría la alerta global de calendario caído con el sistema
 * perfectamente sano. Conectar un apartamento nuevo dispararía una falsa alarma
 * permanente.
 *
 * El test de integración siembra exactamente ese escenario (un feed que nunca
 * sincronizó al lado de otro que sí) y quitar `nullsFirst: false` lo pone rojo.
 *
 * Devuelve `null` solo cuando de verdad ningún feed activo ha sincronizado
 * nunca, que es lo que `estadoDeSincronizacion()` interpreta como caída, y es la
 * lectura correcta: un sistema en el que nada ha sincronizado jamás no está sano.
 */
export async function leerUltimoExitoDeSync(
  supabase: SupabaseClient<Database>,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('calendar_feeds')
    .select('last_success_at')
    .eq('is_active', true)
    .order('last_success_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return data?.last_success_at ?? null;
}

/**
 * Los perfiles con rol `aseador` que están ACTIVOS.
 *
 * NO se reutiliza `listarAseadoresActivos` de `lib/data/apartamentos.ts` pese al
 * nombre: esa función devuelve activos E INACTIVOS a propósito, porque el
 * `Select` de responsable tiene que seguir mostrando a quien fue desactivado
 * para no borrar el dato en silencio (UI-SPEC §8.3). Aquí la pregunta es otra:
 * a quién se le puede asignar trabajo HOY, y a alguien desactivado no. Importar
 * la otra y filtrar en el llamante repetiría el filtro en cada consumidor.
 *
 * `is_active` viaja en la fila aunque siempre valga `true`: es lo que permite a
 * quien reciba esta lista afirmarlo sin volver a la base, y quita la tentación
 * de asumirlo.
 *
 * El orden va por `localeCompare` en la capa que pinta, no aquí: `order` de
 * PostgREST usa la colación de la base y los chips se reordenan por conteo de
 * todas formas. Se pide ordenado igualmente para que la lista sea estable entre
 * dos cargas de la misma pantalla.
 */
export async function leerAseadoresActivos(
  supabase: SupabaseClient<Database>,
): Promise<AseadorActivo[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, is_active')
    .eq('role', 'aseador')
    .eq('is_active', true)
    .order('full_name', { ascending: true });

  if (error) throw new Error(error.message);

  return data ?? [];
}

/** El nombre del apartamento, o cadena vacía si la RLS no dejó resolver el embed. */
function nombreDelApartamento(fila: FilaDeOperacion): string {
  return fila.property?.nombre ?? '';
}

/*
 * `sumarDias()` VIVÍA AQUÍ y desde el plan 05-13 vive en `lib/domain/dates.ts`,
 * que es donde ya estaban `hoyBog()` y `diaAnterior()`. El disparador fue que el
 * bloque del código de acceso (§9.3) necesita "mañana" para decidir su ventana:
 * con la copia privada de este archivo, el repo habría acabado con TRES
 * implementaciones de las mismas cuatro líneas, y de esas la que se queda atrás
 * nunca es la que alguien está mirando.
 *
 * La de `lib/test/aseos.ts` sí sigue aparte, y eso no cambia: ese archivo es del
 * arnés de pruebas, importa la fábrica administrativa sin guard, y nada bajo
 * `app/` puede arrastrarlo al bundle.
 */
