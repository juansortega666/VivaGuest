import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';
import { identificadorValido } from '@/lib/data/finanzas-detalle';
import { firmarRecibo, type ReciboFirmado } from '@/lib/data/recibos';
import {
  armarChecklist,
  progresoTotal,
  type FilaDeChecklist,
  type Progreso,
} from '@/lib/domain/checklist';

/**
 * LA LECTURA DEL PANEL LATERAL DE ASEO DEL ADMIN (08-UI-SPEC §10, criterio 4).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * CINCO LECTURAS Y UNA LATENCIA, QUE NO ES LO MISMO QUE UNA LECTURA.
 *
 * §10.4 regla 2 pide que "los cuatro grupos salgan de una sola lectura, no de
 * cuatro", y su argumento es la latencia: cuatro viajes por apertura es cuatro
 * veces la latencia. Eso SOLO es verdad si se encadenan. Aquí las cuatro
 * colecciones van en una sola espera en paralelo, así que cuestan una latencia,
 * no cuatro, y el espíritu de la regla queda cumplido sin pagar su coste.
 *
 * ── POR QUÉ EL REPARTO ES ASIMÉTRICO, Y NO ES ESTILO ──────────────────────
 *
 * Una función definer propiedad del superusuario corre saltando la seguridad a
 * nivel de fila ENTERA. Cada tabla que entra en su cuerpo es una tabla más cuya
 * protección pasa a depender de una sola línea en vez de depender de esa línea
 * MÁS su policy. El checklist, las fotos, los gastos y los daños ya tienen su
 * policy de admin funcionando desde la migración 08 (`cci_admin_all`,
 * `photos_admin_all`, `expenses_admin_all`, `damages_admin_all`): meterlos en la
 * definer no compraría ni una garantía y ampliaría el radio de un `where` mal
 * escrito. Es el corolario que la migración 09 dejó anotado con estas palabras:
 * dentro de una definer no hay red de seguridad, un `where` mal escrito no da un
 * error de permiso, DA LOS DATOS.
 *
 * Lo único que la definer recupera es lo que el grant por columna de la
 * migración 24 le cerró a todo el mundo: las dos cifras de dinero del aseo. Esa
 * es toda su razón de ser, y por eso trae la cabecera con ellas y nada más.
 *
 * ── EL ORDEN: LA DEFINER VA PRIMERO Y SOLA ────────────────────────────────
 *
 * Si devuelve cero filas, el aseo no existe o no se puede ver, y las otras
 * cuatro lecturas sobran. NO ES UNA FRONTERA DE SEGURIDAD (cada tabla tiene su
 * policy y la RLS responde igual de bien sin este atajo): es no hacer cuatro
 * viajes por nada.
 *
 * ── LO QUE ESTA CAPA NO HACE ──────────────────────────────────────────────
 *
 *   · No formatea dinero ni fechas. Eso es del componente, con los formateadores
 *     que ya existen.
 *   · No decide copy de ausencia. Devuelve la forma de los datos; el texto es de
 *     la pantalla.
 *   · NO ESCRIBE NINGUNA RAMA DE PERMISO DENEGADO. §10.4 regla 1: el panel no
 *     tiene ese estado. El layout del admin ya exige admin contra el servidor de
 *     autenticación y la definer vuelve a comprobarlo por dentro; si deniega es
 *     un defecto y se va por el `error.tsx` de la ruta. Una tercera copia de la
 *     misma regla sería un sitio más donde equivocarse.
 *
 * ── EL PRESUPUESTO, MEDIDO, Y LA PALANCA QUE NO SE TIRA TODAVÍA ───────────
 *
 * `/operacion` hace hoy 8 consultas y este panel le suma 5 más hasta 6 firmas.
 * Es la pantalla que más crece, la que menos margen tiene y la ÚNICA con
 * Realtime: ante cualquier evento de aseos se refresca, y con el panel abierto
 * eso repite las cinco lecturas Y las seis firmas. En una ráfaga de quince
 * eventos en una transacción son hasta 90 firmas de 300 segundos.
 *
 * No se arregla de entrada: se mide. Y la palanca, si molesta, NO es cambiar el
 * contrato de las seis firmas, es acotar el disparo del refresco, que es trabajo
 * de otro plan.
 *
 * La segunda palanca, escrita para que nadie la tome antes de tiempo: si la
 * medición dijera que cinco lecturas no alcanzan, se pliegan gastos y daños en
 * una segunda definer con forma de unión (tipo, concepto, monto, moneda), que es
 * exactamente la forma que `gastos_de_aseadora` ya tiene. No se hace hoy: la
 * recomendación del research es empezar por PostgREST, que es menos superficie
 * corriendo con salto de la seguridad de fila.
 *
 * EL CLIENTE LLEGA POR PARÁMETRO, como en todo `lib/data/`. Y aquí importa
 * doble: la firma se emite con los privilegios de quien llama, así que un
 * cliente construido aquí dentro decidiría por su cuenta con qué identidad se
 * firma.
 *
 * NADA DE CACHE, misma regla que el resto de `lib/data/`: son datos por usuario
 * y una entrada compartida se le sirve a otro.
 * ════════════════════════════════════════════════════════════════════════════
 */

type Cliente = SupabaseClient<Database>;

/** El nombre de la función de la base, en un solo sitio. */
export const RPC_DETALLE_DE_ASEO = 'detalle_de_aseo' as const;

/**
 * CUÁNTAS MINIATURAS SE FIRMAN POR APERTURA. Seis, nunca doce.
 *
 * Es la regla literal de `finanzas/pagos/page.tsx`: "solo se firman los recibos
 * DEL PAGO QUE SE ESTÁ MIRANDO: firmar los de las ocho filas de cada periodo al
 * cargar la página dejaría decenas de URL vivas en el navegador por si acaso".
 * Aquí es lo mismo con otra tira: la vida de la firma es
 * `VIDA_DE_LA_FIRMA_SEGUNDOS`, que ya vale 300, y cada firma de más es una URL
 * viva cinco minutos en el navegador por si acaso. Es T-08-19.
 *
 * El número sale de la geometría de §10.3 y no de un redondeo: seis miniaturas
 * de 64px con 8px de separación ocupan 424 de los 448 útiles del panel; siete
 * necesitarían 496 y no caben.
 *
 * ── LA OBSERVACIÓN QUE 08-07 TIENE QUE TENER DELANTE ──────────────────────
 *
 * Cuando hay MÁS de seis fotos, §10.3 pinta cinco miniaturas y una casilla de
 * conteo en la sexta posición, así que en ese caso la sexta firma no se llega a
 * usar: se emite exactamente una URL de más. Se firma igual, y a propósito, para
 * que esta capa no tenga que conocer la decisión de maquetación de la casilla
 * de `+{N}`. Si algún día esa URL de más molesta, el recorte es de una línea y
 * el sitio es este, no el componente.
 */
export const MINIATURAS_VISIBLES = 6;

/**
 * La cabecera del panel y su grupo de dinero, tal como los devuelve la definer.
 *
 * ── LOS NULOS QUE EL ARCHIVO DE TIPOS GENERADO NO DECLARA ─────────────────
 *
 * El generador del CLI NO marca la nulabilidad de las columnas de un
 * `returns table`: las declara todas no nulas. En la base no lo son, y este
 * panel se abre justo sobre los casos que lo demuestran:
 *
 *   · `estado` llega NULO en una unidad de gestión externa, porque
 *     `cl_unmanaged_is_inert` obliga a que su fila sea inerte.
 *   · `aseadorId` y `aseador` llegan nulos en un aseo sin asignar.
 *   · `iniciadoAt` llega nulo en un aseo pendiente, y `terminadoAt` en uno en
 *     curso.
 *
 * Por eso este tipo se escribe a mano con los nulos puestos, en vez de
 * propagarse del generado: si se confiara en el generado, el compilador diría
 * que `estado` siempre está y la pantalla se caería sobre el primer informativo.
 */
export interface CabeceraDelPanelDeAseo {
  aseoId: string;
  apartamentoId: string;
  apartamento: string;
  /**
   * El interruptor del grupo de dinero.
   *
   * La función NO filtra por gestión propia a propósito: un informativo devuelve
   * su fila con las tres cifras en cero, y es la PANTALLA la que decide no
   * pintar el grupo leyendo esta marca.
   */
  gestionPropia: boolean;
  /** Día calendario de negocio, en forma `YYYY-MM-DD`. Nunca un instante. */
  fecha: string;
  estado: Database['public']['Enums']['cleaning_state'] | null;
  aseadorId: string | null;
  /**
   * Nulo y no un texto de relleno cuando no hay nadie asignado: la fila que
   * pinta el vacío (`Sin asignar` en el color de aviso, la regla de
   * `FilaAseo.tsx`) es decisión de la pantalla, no de la consulta.
   */
  aseador: string | null;
  iniciadoAt: string | null;
  terminadoAt: string | null;
  /** Las tres cifras SALEN DEL ASEO, nunca del apartamento (FIN-01). */
  cobrado: number;
  pagado: number;
  margen: number;
}

/** Una foto de la tira de evidencia, con su sitio y el desenlace de su firma. */
export interface FotoDelPanel {
  fotoId: string;
  /**
   * LA POSICIÓN EN LA TIRA, EMPEZANDO EN CERO, Y VIAJA A PROPÓSITO.
   *
   * §10.3: una foto purgada o con firma fallida OCUPA SU SITIO en la tira, con
   * la casilla de "Foto no disponible". Hacerla desaparecer cambiaría el conteo
   * y haría creer que había menos evidencia, así que esta capa devuelve la
   * posición y el desenlace, y NO una lista filtrada de las que funcionaron.
   */
  posicion: number;
  /** `checklist`, `dano`, `gasto` o `faltante`. */
  tipo: string;
  /**
   * El cuarto, el concepto o la descripción a la que pertenece la foto, ya
   * resuelto contra las colecciones que esta misma lectura trajo.
   *
   * Es el título que §10.3 le pide al diálogo de la foto, y se resuelve aquí
   * para que el componente no tenga que cruzar tres listas ni hacer un sexto
   * viaje. Nulo cuando la foto no cuelga de nada con nombre.
   */
  etiqueta: string | null;
  /** El instante de captura declarado por el teléfono. Nulo si no vino. */
  tomadaAt: string | null;
  /** El instante en que la foto entró al sistema. Es el orden de la tira. */
  creadaAt: string;
  /** Firmada, sin evidencia o firma fallida. Los tres se pintan distinto. */
  firma: ReciboFirmado;
}

/** Una línea de gasto del grupo de reportes. */
export interface GastoDelPanel {
  gastoId: string;
  concepto: string;
  monto: number;
  moneda: string;
}

/** Una línea de daño del grupo de reportes. Un daño NO tiene monto. */
export interface DanoDelPanel {
  danoId: string;
  descripcion: string;
}

/** Todo lo que el panel de aseo necesita, sin que la pantalla derive nada. */
export interface PanelDeAseo {
  cabecera: CabeceraDelPanelDeAseo;
  /**
   * `hechas` y `total`, para pintar el `7/12` literal que fijó D8-4.
   *
   * ── EL CASO QUE PARECE UN ERROR Y NO LO ES ──────────────────────────────
   *
   * Las tareas del checklist SE MATERIALIZAN AL CONFIRMAR el aseo, no al
   * crearlo (`confirm_cleaning`, migración 04). Un aseo pendiente sin confirmar
   * devuelve cero filas y el progreso da cero de cero. La rama que la pantalla
   * tiene que distinguir es TOTAL IGUAL A CERO, no `hechas` igual a cero, que
   * sería un cero de doce perfectamente correcto.
   */
  progreso: Progreso;
  /** Como máximo `MINIATURAS_VISIBLES`, en el orden estable de la tira. */
  fotos: FotoDelPanel[];
  /**
   * CUÁNTAS FOTOS TIENE EL ASEO EN TOTAL, no cuántas se firmaron.
   *
   * Es un dato de pantalla (la casilla de `+{N}` de §10.3) y NO se puede derivar
   * de seis, así que la lista se lee entera y el conteo se conserva aparte del
   * recorte.
   */
  totalDeFotos: number;
  gastos: GastoDelPanel[];
  danos: DanoDelPanel[];
}

/**
 * Las columnas del checklist son EXACTAMENTE las que `FilaDeChecklist` declara.
 *
 * Enumeradas y nunca con comodín: con grants por columna, un comodín es una
 * bomba que estalla la próxima vez que alguien añada una columna sensible a la
 * tabla, y esa lección la pagó el plan 07-05.
 */
const SELECT_CHECKLIST =
  'id, property_room_id, room_label, task_label, requiere_foto, sort_order, done_at';

/**
 * Las de la foto. `storage_bucket` y `storage_path` entran porque el SERVIDOR
 * los necesita para firmar, y NO SALEN DE AQUÍ: lo único que viaja al navegador
 * es la URL ya firmada. Es la regla de la cabecera de `lib/data/recibos.ts`.
 */
const SELECT_FOTOS =
  'id, kind, checklist_item_id, expense_id, damage_id, storage_bucket, storage_path, taken_at, created_at';

/** Las del gasto. El monto es entero de pesos, sin subunidad. */
const SELECT_GASTOS = 'id, concepto, monto, moneda';

/** Las del daño. Sin monto, porque un daño no tiene: §10.2 lo pinta como vacío. */
const SELECT_DANOS = 'id, descripcion';

/**
 * Lee todo lo que el panel de aseo pinta, o `null` si no hay aseo que pintar.
 *
 * `null` cubre dos casos y los trata igual a propósito: el identificador no
 * tiene forma de identificador, o la definer no devolvió fila. Distinguirlos le
 * confirmaría la existencia del aseo a quien no puede verlo, que es el mismo
 * criterio de `leerAseoDelAseador` y de la ficha de la aseadora.
 *
 * UN ERROR DE VERDAD SÍ SE PROPAGA. Un fallo de conexión no es "este aseo no
 * existe": devolver `null` ahí pintaría el estado vacío y le diría al admin que
 * el aseo no está.
 */
export async function leerPanelDeAseo(
  supabase: Cliente,
  aseoId: string,
): Promise<PanelDeAseo | null> {
  /**
   * La forma se comprueba ANTES de consultar. El identificador llega de la
   * dirección, o sea de fuera, y sin esta guarda una cadena arbitraria llega a
   * Postgres como argumento de tipo identificador, responde `22P02` y la
   * pantalla se cae con un error de tipo que no sabe explicar.
   *
   * Se reusa el colador que ya existe en vez de escribir una cuarta copia de la
   * misma expresión regular.
   */
  const identificador = identificadorValido(aseoId);
  if (!identificador) return null;

  // ── (a) LA DEFINER, PRIMERO Y SOLA ────────────────────────────────────────
  //
  // Cero filas significa que no se renderiza el panel, y entonces las otras
  // cuatro lecturas sobran. Repetido aquí porque es lo que justifica que esta
  // espera NO esté dentro del `Promise.all` de abajo: no es una frontera de
  // seguridad, es no hacer cuatro viajes por nada.
  const { data: detalle, error: errorDetalle } = await supabase.rpc(RPC_DETALLE_DE_ASEO, {
    p_cleaning: identificador,
  });

  if (errorDetalle) throw new Error(errorDetalle.message);

  const fila = detalle?.[0];
  if (!fila) return null;

  // ── (b) LAS CUATRO COLECCIONES, EN PARALELO ───────────────────────────────
  //
  // Una sola espera, así que una sola latencia. Las cuatro van por RLS con las
  // policies de admin de la migración 08, y las cuatro proyecciones están
  // enumeradas: ni un comodín.
  const [checklist, fotos, gastos, danos] = await Promise.all([
    supabase.from('cleaning_checklist_items').select(SELECT_CHECKLIST).eq('cleaning_id', identificador),
    supabase
      .from('cleaning_photos')
      .select(SELECT_FOTOS)
      .eq('cleaning_id', identificador)
      // Una foto purgada no abre nada, y es lo que la Fase 9 va a empezar a
      // producir de verdad. El filtro no es cosmético.
      .is('deleted_at', null)
      // El desempate por identificador NO sobra: dos fotos subidas en la misma
      // cola de la aseadora pueden compartir instante de creación al milisegundo,
      // y sin él la tira se reordenaría entre aperturas del mismo panel.
      .order('created_at', { ascending: true })
      .order('id', { ascending: true }),
    supabase
      .from('expenses')
      .select(SELECT_GASTOS)
      .eq('cleaning_id', identificador)
      .order('created_at', { ascending: true }),
    supabase
      .from('damages')
      .select(SELECT_DANOS)
      .eq('cleaning_id', identificador)
      .order('created_at', { ascending: true }),
  ]);

  if (checklist.error) throw new Error(checklist.error.message);
  if (fotos.error) throw new Error(fotos.error.message);
  if (gastos.error) throw new Error(gastos.error.message);
  if (danos.error) throw new Error(danos.error.message);

  const tareas = (checklist.data ?? []) as FilaDeChecklist[];
  const todasLasFotos = fotos.data ?? [];
  const lineasDeGasto = gastos.data ?? [];
  const lineasDeDano = danos.data ?? [];

  // ── (c) EL PROGRESO SALE DEL DOMINIO, NO DE UNA CUENTA NUEVA ──────────────
  //
  // `progresoTotal(armarChecklist(...))` es LA MISMA función que usa la pantalla
  // del aseador. La cabecera de `lib/domain/checklist.ts` declara una duplicación
  // (la suya con `aseo_sin_evidencia_completa()` de la migración 18) y advierte
  // por escrito contra una tercera. Contarlo en SQL sería la tercera; contarlo en
  // el componente sería la cuarta. Es T-08-22.
  //
  // Los saltos de cuarto no entran: un cuarto saltado no tiene tareas que contar
  // y no mueve ninguno de los dos números del progreso.
  const progreso = progresoTotal(armarChecklist(tareas));

  // Los tres índices para resolver el título del diálogo de cada foto sin un
  // sexto viaje. Se construyen sobre lo que YA se leyó.
  const cuartoPorTarea = new Map(tareas.map((t) => [t.id, t.room_label]));
  const conceptoPorGasto = new Map(lineasDeGasto.map((g) => [g.id, g.concepto]));
  const descripcionPorDano = new Map(lineasDeDano.map((d) => [d.id, d.descripcion]));

  const etiquetaDe = (foto: (typeof todasLasFotos)[number]): string | null => {
    if (foto.checklist_item_id) return cuartoPorTarea.get(foto.checklist_item_id) ?? null;
    if (foto.expense_id) return conceptoPorGasto.get(foto.expense_id) ?? null;
    if (foto.damage_id) return descripcionPorDano.get(foto.damage_id) ?? null;
    return null;
  };

  // ── (d) LAS FIRMAS: EL RECORTE VA ANTES DE FIRMAR ─────────────────────────
  //
  // La lista se leyó entera porque el conteo total es un dato de pantalla; lo
  // que se recorta es lo que se FIRMA. `firmarRecibo()` distingue la ausencia de
  // evidencia del fallo de firma y no propaga el mensaje del almacenamiento, que
  // arrastra la ruta y el bucket (T-08-20): por eso se usa el helper que ya
  // existe y no se escribe una firma suelta aquí.
  const visibles = todasLasFotos.slice(0, MINIATURAS_VISIBLES);

  const firmadas: FotoDelPanel[] = await Promise.all(
    visibles.map(async (foto, posicion) => ({
      fotoId: foto.id,
      posicion,
      tipo: foto.kind,
      etiqueta: etiquetaDe(foto),
      tomadaAt: foto.taken_at,
      creadaAt: foto.created_at,
      firma: await firmarRecibo(supabase, {
        bucket: foto.storage_bucket,
        ruta: foto.storage_path,
      }),
    })),
  );

  // ── (e) LA FORMA DE SALIDA SE COMPONE CAMPO A CAMPO ───────────────────────
  //
  // Y no con propagación de la fila cruda: si la función de la base creciera una
  // columna mañana, se quedaría fuera del tipo en vez de propagarse sola hasta el
  // navegador del admin. Misma disciplina que `lib/data/finanzas-detalle.ts`.
  //
  // Los `?? null` NO son decorativos: ver el comentario de
  // `CabeceraDelPanelDeAseo` sobre los nulos que el archivo de tipos generado no
  // declara.
  return {
    cabecera: {
      aseoId: fila.cleaning_id,
      apartamentoId: fila.property_id,
      apartamento: fila.property_nombre,
      gestionPropia: fila.is_managed,
      fecha: fila.fecha_programada,
      estado: fila.estado ?? null,
      aseadorId: fila.aseador_id ?? null,
      aseador: fila.aseador_nombre ?? null,
      iniciadoAt: fila.iniciado_at ?? null,
      terminadoAt: fila.terminado_at ?? null,
      // Las tres llegan ya casteadas a entero ancho desde el cuerpo de la
      // definer (regla 4 de la migración 26), que es lo que impide que el cliente
      // las entregue como cadena y que el operador de suma las concatene en
      // silencio más arriba.
      cobrado: fila.cobrado,
      pagado: fila.pagado,
      margen: fila.margen,
    },
    progreso,
    fotos: firmadas,
    totalDeFotos: todasLasFotos.length,
    gastos: lineasDeGasto.map((g) => ({
      gastoId: g.id,
      concepto: g.concepto,
      monto: g.monto,
      moneda: g.moneda,
    })),
    danos: lineasDeDano.map((d) => ({
      danoId: d.id,
      descripcion: d.descripcion,
    })),
  };
}
