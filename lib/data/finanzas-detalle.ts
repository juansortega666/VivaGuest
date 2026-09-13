import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';

/**
 * LA CAPA DE LECTURA DEL DETALLE ASEO POR ASEO Y DE LA FICHA (FIN-02, FIN-05).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MISMO MOLDE QUE `lib/data/finanzas.ts`, Y POR LAS MISMAS RAZONES.
 *
 * Las cinco funciones de la base que consume este modulo (migraciones 26 y 27)
 * son `security definer` y comprueban el rol como PRIMERA sentencia de su
 * cuerpo. Esa es la frontera. Aqui no hay ninguna comprobacion propia: una
 * segunda copia de la misma regla no anade ninguna garantia —el dato ya viajo o
 * no viajo antes de llegar aqui— y si crea un sitio mas donde equivocarse.
 *
 * El cliente llega POR PARAMETRO, sin cache, y toda llamada comprueba su error
 * ANTES de devolver. Un respaldo silencioso en ceros seria peor que el fallo: un
 * detalle que dice `$ 0` sobre un mes que si facturo es una cifra falsa sobre la
 * que el dueno toma decisiones.
 *
 * ── LA TRAMPA QUE ESTE MODULO EXISTE PARA ATRAPAR ─────────────────────────
 *
 * `sum()` sobre enteros anchos devuelve en Postgres el tipo de precision
 * arbitraria, y el cliente lo entrega como CADENA para no perder precision. Dos
 * cadenas con el operador de suma se CONCATENAN (`'480000' + '60000'` es
 * `'48000060000'`) y el resultado sigue siendo perfectamente formateable, porque
 * el formateador de moneda funciona igual sobre texto y sobre numero. El sintoma
 * seria una fila de totales con miles de millones donde deberia haber cientos de
 * miles, **y la conciliacion contra los KPIs del Resumen se caeria sin que nada
 * dijera por que**.
 *
 * Por eso el colador de dinero vive AQUI, en la frontera donde llega la fila
 * cruda, y no en el componente que pinta. Es la misma regla que `enteroDeDinero`
 * de `lib/domain/finanzas.ts`, aplicada al otro punto de entrada: alli cuela lo
 * que agrega el dominio, aqui cuela lo que devuelve cada `returns table`.
 *
 * ── LA FORMA DE SALIDA SE COMPONE CAMPO A CAMPO ───────────────────────────
 *
 * Y no con propagacion del objeto crudo: si una funcion de la base creciera una
 * columna manana, se quedaria fuera del tipo en vez de propagarse sola hasta el
 * navegador del admin. Es la misma disciplina de `leerResumenFinanciero`.
 * ════════════════════════════════════════════════════════════════════════════
 */

type Cliente = SupabaseClient<Database>;

/**
 * Los nombres de las cinco funciones, como constantes exportadas.
 *
 * Asi el test puede afirmar CONTRA QUE se llamo sin volver a escribir el nombre,
 * y el repo conserva una sola ocurrencia literal de cada uno. `as const` es lo
 * que mantiene el tipo literal que la firma generada del cliente exige.
 */
export const RPC_RENTABILIDAD = 'rentabilidad_aseos' as const;
export const RPC_ASEOS_DE_ASEADORA = 'aseos_de_aseadora' as const;
export const RPC_GASTOS_DE_ASEADORA = 'gastos_de_aseadora' as const;
export const RPC_ASEO_EN_CURSO = 'aseo_en_curso_de_aseadora' as const;
export const RPC_PAGOS_DE_ASEADORA = 'pagos_de_aseadora' as const;

// ───────────────────────────────────────────────────────────────────────────
// COLADORES DE ENTRADA
// ───────────────────────────────────────────────────────────────────────────

/**
 * Rechaza todo lo que no sea un entero seguro de pesos.
 *
 * Cubre los cuatro casos reales: la cadena que devuelve la suma de enteros
 * anchos, el nulo de una agregacion sin `coalesce`, el `NaN` de restar dos
 * cadenas y el infinito. **El mensaje NOMBRA EL CAMPO**, porque sin el nombre el
 * diagnostico obliga a recorrer la funcion entera buscando cual de las columnas
 * se quedo sin el cast, y son varias.
 *
 * Se nombra tambien el tipo recibido: `'400000'` y `400000` se imprimen casi
 * igual en un mensaje de error, y el tipo es justo lo que distingue el defecto de
 * un dato correcto.
 */
function enteroDeDinero(valor: unknown, campo: string): number {
  if (typeof valor !== 'number' || !Number.isSafeInteger(valor)) {
    throw new TypeError(
      `El campo "${campo}" llegó como ${typeof valor} (${String(valor)}) y tiene que ser un entero. ` +
        'Es casi seguro una suma de enteros anchos sin cast en la consulta: el cliente la entrega ' +
        'como cadena y el operador de suma la concatena en silencio.',
    );
  }
  return valor;
}

/** Los tres valores del filtro de tipo, los mismos que valida la base. */
export const FILTROS_DE_TIPO = ['todos', 'con-gastos', 'con-danos'] as const;

export type FiltroDeTipo = (typeof FILTROS_DE_TIPO)[number];

/**
 * Normaliza el filtro de tipo que llega por la direccion de la pagina.
 *
 * **Cualquier cosa desconocida cae en `todos`, y no se lanza.** La base SI
 * levanta `P0001` ante un valor que no reconoce, y tiene razon en hacerlo: alli
 * un valor raro solo puede venir de un defecto del codigo. Aqui viene de una
 * direccion escrita a mano, y el contrato de este arbol es que una direccion mal
 * escrita ensena la pantalla y no un error. Es la misma regla que `normalizarRango`
 * del Resumen.
 */
export function normalizarFiltroDeTipo(valor: string | undefined): FiltroDeTipo {
  return FILTROS_DE_TIPO.includes(valor as FiltroDeTipo) ? (valor as FiltroDeTipo) : 'todos';
}

/** La forma canonica de un identificador de la base. Ocho, cuatro, cuatro, cuatro, doce. */
const FORMA_DE_IDENTIFICADOR =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Comprueba la FORMA de un identificador antes de que llegue a la base (T-07-56).
 *
 * No es una comprobacion de existencia y no pretende serlo: quien exista y quien
 * no lo decide Postgres con su RLS. Lo que evita es otra cosa muy concreta: una
 * cadena arbitraria en la direccion de la pagina llega al `returns table` como
 * argumento de tipo identificador, Postgres responde `22P02`, y la pantalla se
 * cae con un error de tipo que no sabe explicar. Con la forma comprobada, ese
 * mismo caso es un 404 limpio.
 *
 * Devuelve `null` en vez de lanzar para que quien llama decida: la pagina de la
 * ficha lo convierte en 404 y el filtro del detalle lo trata como "sin filtro".
 */
export function identificadorValido(valor: string | undefined): string | null {
  return valor && FORMA_DE_IDENTIFICADOR.test(valor) ? valor : null;
}

// ───────────────────────────────────────────────────────────────────────────
// EL DETALLE ASEO POR ASEO (FIN-02)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Una fila de `/finanzas/aseos`. Son las siete columnas de UI-SPEC §7.1, mas los
 * dos identificadores que la celda del apartamento necesita para enlazar.
 *
 * **LAS DOS FECHAS VAN SEPARADAS Y LAS DOS SON OBLIGATORIAS** (D7-8). Con una
 * sola, la senal de que un aseo de enero cayo en el pago de febrero no se puede
 * pintar, y el admin no tiene forma de explicar por que ese aseo aparece donde
 * aparece.
 *
 * `aseador` es nulo cuando el aseo no tiene persona asignada, y la base lo deja
 * nulo a proposito en vez de rellenarlo con un texto: un `Sin asignar` puesto en
 * la consulta seria un nombre inventado que ademas se ordenaria entre los reales.
 */
export type AseoDelDetalle = {
  aseoId: string;
  apartamentoId: string;
  apartamento: string;
  /** Dia de negocio en que estaba programado. */
  programado: string;
  /** Dia de negocio en que se hizo. Decide a que periodo pertenece. */
  ejecutado: string;
  aseadorId: string | null;
  aseador: string | null;
  cobrado: number;
  pagado: number;
  margen: number;
  tieneGasto: boolean;
  tieneDano: boolean;
};

/** Los tres filtros de §7.2, con el nulo significando «todos» en los dos primeros. */
export type FiltrosDelDetalle = {
  desde: string;
  hasta: string;
  apartamentoId?: string | null;
  aseadorId?: string | null;
  tipo: FiltroDeTipo;
};

/**
 * Las filas del detalle, ya ordenadas por la base (lo mas reciente primero).
 *
 * ── LOS DOS FILTROS OPCIONALES NO SE MANDAN CUANDO NO HAY ────────────────
 *
 * Se omiten del objeto de argumentos en vez de mandarse nulos, que es lo que
 * espera una funcion con `default null`: el nulo significa «todos» dentro de la
 * base, y omitir el argumento produce exactamente ese nulo sin que la firma
 * generada del cliente tenga que declarar la ranura como anulable.
 *
 * ── FIN-05 NO SE IMPLEMENTA AQUI, Y ESO ES LO CORRECTO ───────────────────
 *
 * Ninguna unidad de gestion externa llega a esta lista porque la funcion de la
 * base filtra por `is_managed`. **La pantalla ni siquiera recibe esas filas**, asi
 * que no hay nada que filtrar en TypeScript y no se intenta: un segundo filtro
 * aqui seria un sitio mas donde la regla puede divergir de la de Postgres.
 *
 * ── LA LISTA VACIA ES UN PERIODO SIN COINCIDENCIAS, NO UN DEFECTO ────────
 *
 * Al reves que el resumen agregado, aqui no hay ninguna fila que devolver cuando
 * nada coincide. La pantalla lo pinta con su estado vacio.
 */
export async function leerRentabilidadDeAseos(
  supabase: Cliente,
  filtros: FiltrosDelDetalle,
): Promise<AseoDelDetalle[]> {
  const { data, error } = await supabase.rpc(RPC_RENTABILIDAD, {
    p_desde: filtros.desde,
    p_hasta: filtros.hasta,
    p_filtro: filtros.tipo,
    ...(filtros.apartamentoId ? { p_property: filtros.apartamentoId } : {}),
    ...(filtros.aseadorId ? { p_aseador: filtros.aseadorId } : {}),
  });

  if (error) throw new Error(error.message);

  return (data ?? []).map((fila) => ({
    aseoId: fila.cleaning_id,
    apartamentoId: fila.property_id,
    apartamento: fila.property_nombre,
    programado: fila.fecha_programada,
    ejecutado: fila.fecha_ejecucion,
    aseadorId: fila.aseador_id,
    aseador: fila.aseador_nombre,
    cobrado: enteroDeDinero(fila.cobrado, 'cobrado'),
    pagado: enteroDeDinero(fila.pagado, 'pagado'),
    margen: enteroDeDinero(fila.margen, 'margen'),
    tieneGasto: fila.tiene_gasto,
    tieneDano: fila.tiene_dano,
  }));
}

/** La fila de totales del pie de §7.1. Es la conciliacion contra los KPIs. */
export type TotalesDelDetalle = {
  aseos: number;
  cobrado: number;
  pagado: number;
  margen: number;
};

/**
 * Totaliza LAS FILAS QUE SE ESTAN PINTANDO, y no otra consulta.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESTA ES LA DECISION QUE SOSTIENE LA CONCILIACION, Y NO ES DE ESTILO.
 *
 * La alternativa evidente es pedirle los totales a la base con una segunda
 * consulta agregada. **Es exactamente la clase de fallo mas caro de esta
 * pantalla:** dos consultas distintas —una por filas y otra agregada— que
 * divergen en un caso de borde (un aseo cancelado, uno de gestion externa, uno
 * que cruza el periodo) y dejan al dueno con dos cifras y ninguna forma de saber
 * cual vale. Cuando eso pasa, deja de creerle a las dos y vuelve al Excel, que
 * es lo que esta fase existe para reemplazar.
 *
 * Sumando las filas de la lista, el pie no puede contradecir a la tabla POR
 * CONSTRUCCION: cuenta lo que se ve y suma lo que se ve. Y el pie cuadra con los
 * KPIs del Resumen porque la funcion de la base usa la misma conversion de fecha
 * y el mismo filtro que `resumen_financiero`, que es donde esa garantia tiene que
 * vivir y donde pgTAP ya la afirma.
 *
 * El margen se suma y NO se recalcula como cobrado menos pagado: con enteros las
 * dos cuentas dan lo mismo, y sumar la columna que se pinta es lo que hace que el
 * pie sea literalmente la suma de su columna.
 * ════════════════════════════════════════════════════════════════════════════
 */
export function totalizarDetalle(filas: AseoDelDetalle[]): TotalesDelDetalle {
  return filas.reduce<TotalesDelDetalle>(
    (acc, fila) => ({
      aseos: acc.aseos + 1,
      cobrado: acc.cobrado + fila.cobrado,
      pagado: acc.pagado + fila.pagado,
      margen: acc.margen + fila.margen,
    }),
    { aseos: 0, cobrado: 0, pagado: 0, margen: 0 },
  );
}

/** Una opcion del combinado de apartamento de §7.2. */
export type ApartamentoDelFiltro = {
  id: string;
  nombre: string;
};

/**
 * Las unidades que el combinado de apartamento ofrece (FIN-05, T-07-53).
 *
 * **Ninguna unidad de gestion externa aparece, y no es que esten filtradas de la
 * lista: no existen para esta pantalla.** Un combinado que las ofrece promete un
 * filtro que siempre devuelve vacio, y el admin acaba preguntandose si el mes
 * esta mal en vez de entender que esa unidad no es negocio propio.
 *
 * NO se filtra por unidad activa, y es deliberado: un apartamento que se dio de
 * baja el mes pasado sigue teniendo aseos hechos en el periodo anterior, y
 * quitarlo del combinado dejaria esas filas sin forma de aislarlas.
 */
export async function listarApartamentosGestionados(
  supabase: Cliente,
): Promise<ApartamentoDelFiltro[]> {
  const { data, error } = await supabase
    .from('properties')
    .select('id, nombre')
    .eq('gestion_vivaguest', true)
    .order('nombre', { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((fila) => ({ id: fila.id, nombre: fila.nombre }));
}

// ───────────────────────────────────────────────────────────────────────────
// LA FICHA DE UNA PERSONA
// ───────────────────────────────────────────────────────────────────────────

/** La persona de la cabecera de §8.1. */
export type AseadoraDeLaFicha = {
  id: string;
  nombre: string;
};

/**
 * El nombre de la persona, para la cabecera de la ficha.
 *
 * `null` cuando el identificador no corresponde a ningun aseador, o cuando la
 * RLS no lo deja ver. **Los dos casos dan lo mismo a proposito**, igual que en la
 * ficha de apartamento: distinguirlos le confirmaria la existencia del perfil a
 * quien no puede verlo.
 *
 * Se filtra por rol: la ficha es de una aseadora, y un identificador de admin
 * pegado en la direccion tiene que dar 404 y no una ficha vacia con el nombre del
 * dueno arriba.
 */
export async function leerAseadoraDeLaFicha(
  supabase: Cliente,
  aseadoraId: string,
): Promise<AseadoraDeLaFicha | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('id', aseadoraId)
    .eq('role', 'aseador')
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return { id: data.id, nombre: data.full_name };
}

/**
 * Lo que responde el bloque «Ahora mismo» de §8.4.
 *
 * ── LO QUE ESTE TIPO NO DECLARA, Y NUNCA VA A DECLARAR ───────────────────
 *
 * Ninguna coordenada, ningun dato de ubicacion, ninguna marca de ultima conexion
 * y ningun indicador de presencia. No hay rastreo por posicion y no lo va a
 * haber. La funcion de la base tampoco los devuelve, asi que el dato no existe en
 * ninguna capa: **lo que no existe no se puede renderizar por accidente.**
 *
 * `enCurso` nulo significa que la persona no tiene ningun aseo empezado. Es el
 * segundo de los tres estados de la pantalla, no una ausencia de dato.
 */
export type AhoraMismo = {
  estaActiva: boolean;
  enCurso: {
    apartamento: string;
    /** Instante en que empezo el aseo. La pantalla pinta solo la hora. */
    iniciadoAt: string;
  } | null;
};

/**
 * Que esta haciendo una persona, con lo que el sistema ya sabe.
 *
 * ── CERO FILAS Y UNA FILA CON COLUMNAS NULAS SIGNIFICAN COSAS DISTINTAS ──
 *
 * La funcion devuelve SIEMPRE una fila si el perfil existe, porque `esta_activa`
 * hay que responderlo en los tres estados de la pantalla, y las columnas del aseo
 * vienen nulas cuando no hay ninguno en curso. **Cero filas solo puede significar
 * que ese identificador no es de ningun perfil**, y por eso se devuelve `null` en
 * vez de un objeto con la persona activa: inventarse ahi un `estaActiva: true`
 * pintaria «no tiene ningun aseo en curso» sobre una persona que no existe.
 */
export async function leerAhoraMismo(
  supabase: Cliente,
  aseadoraId: string,
): Promise<AhoraMismo | null> {
  const { data, error } = await supabase.rpc(RPC_ASEO_EN_CURSO, {
    p_aseador: aseadoraId,
  });

  if (error) throw new Error(error.message);

  const fila = data?.[0];
  if (!fila) return null;

  return {
    estaActiva: fila.esta_activa,
    enCurso:
      fila.property_nombre && fila.iniciado_at
        ? { apartamento: fila.property_nombre, iniciadoAt: fila.iniciado_at }
        : null,
  };
}

/**
 * Una linea del bloque 2 de la ficha. Cuatro columnas y ni una mas.
 *
 * **SIN COBRADO Y SIN MARGEN**, y no es porque la aseadora vaya a ver esta
 * pantalla (es del admin, y las funciones tienen su guarda). Es porque el
 * desglose que ve el admin y el que ve la aseadora en sus pagos tienen que ser EL
 * MISMO DOCUMENTO: si el admin ve una columna de mas, el dia que alguien reclame
 * van a estar comparando dos papeles distintos, y esa conversacion se gana o se
 * pierde antes de empezar.
 */
export type AseoDeLaFicha = {
  aseoId: string;
  apartamento: string;
  programado: string;
  ejecutado: string;
  pago: number;
};

/** Los aseos de una persona dentro del periodo, del mas reciente al mas antiguo. */
export async function leerAseosDeAseadora(
  supabase: Cliente,
  aseadoraId: string,
  rango: { desde: string; hasta: string },
): Promise<AseoDeLaFicha[]> {
  const { data, error } = await supabase.rpc(RPC_ASEOS_DE_ASEADORA, {
    p_aseador: aseadoraId,
    p_desde: rango.desde,
    p_hasta: rango.hasta,
  });

  if (error) throw new Error(error.message);

  return (data ?? []).map((fila) => ({
    aseoId: fila.cleaning_id,
    apartamento: fila.property_nombre,
    programado: fila.fecha_programada,
    ejecutado: fila.fecha_ejecucion,
    pago: enteroDeDinero(fila.pago, 'pago'),
  }));
}

/**
 * Una linea del bloque 4 de la ficha.
 *
 * `evidencia` nula significa que la foto ya no existe: o nunca la hubo, o se
 * purgo por antiguedad. **Es informacion, no un fallo**, y la pantalla lo dice sin
 * ofrecer el boton. Se conserva la ruta y el bucket SIN FIRMAR, porque firmar es
 * trabajo del servidor de la aplicacion y la ruta cruda nunca viaja al navegador.
 */
export type GastoDeLaFicha = {
  gastoId: string;
  apartamento: string;
  /** Dia de ejecucion del aseo al que pertenece el gasto. */
  fecha: string;
  concepto: string;
  monto: number;
  evidencia: { bucket: string; ruta: string } | null;
};

/** Los gastos que una persona reporto dentro del periodo. */
export async function leerGastosDeAseadora(
  supabase: Cliente,
  aseadoraId: string,
  rango: { desde: string; hasta: string },
): Promise<GastoDeLaFicha[]> {
  const { data, error } = await supabase.rpc(RPC_GASTOS_DE_ASEADORA, {
    p_aseador: aseadoraId,
    p_desde: rango.desde,
    p_hasta: rango.hasta,
  });

  if (error) throw new Error(error.message);

  return (data ?? []).map((fila) => ({
    gastoId: fila.expense_id,
    apartamento: fila.property_nombre,
    fecha: fila.fecha_ejecucion,
    concepto: fila.concepto,
    monto: enteroDeDinero(fila.monto, 'monto'),
    evidencia:
      fila.evidencia_bucket && fila.evidencia_path
        ? { bucket: fila.evidencia_bucket, ruta: fila.evidencia_path }
        : null,
  }));
}

/**
 * Una fila del bloque 3 de la ficha: un periodo cerrado y lo que se le pago.
 *
 * Lleva LAS DOS FECHAS REALES del periodo (D7-5) porque el periodo va de cierre a
 * cierre y no del 1 al 31. Un recibo que dice «enero» y cubre del 1 al 30 sin
 * decirlo es una discusion esperando a ocurrir.
 */
export type PagoDeLaFicha = {
  pagoId: string;
  desde: string;
  hasta: string;
  montoAseos: number;
  montoGastos: number;
  total: number;
  /** Instante en que se marco pagado, o `null` si sigue pendiente. */
  pagadoAt: string | null;
};

/**
 * TODOS los periodos cerrados de una persona, del mas reciente al mas antiguo.
 *
 * **NO RECIBE RANGO, Y LA AUSENCIA DEL ARGUMENTO ES EL MECANISMO.** Este bloque
 * ignora a proposito el filtro de periodo de la pantalla y la interfaz lo dice en
 * su leyenda: los pagos son historial, y filtrarlos por el rango de arriba dejaria
 * «sus pagos» con una sola fila cuando el filtro esta puesto en dia, que no
 * responde ninguna pregunta. La funcion de la base tampoco acepta rango, asi que
 * nadie puede «arreglar» el bloque pasandoselo.
 */
export async function leerPagosDeAseadora(
  supabase: Cliente,
  aseadoraId: string,
): Promise<PagoDeLaFicha[]> {
  const { data, error } = await supabase.rpc(RPC_PAGOS_DE_ASEADORA, {
    p_aseador: aseadoraId,
  });

  if (error) throw new Error(error.message);

  return (data ?? []).map((fila) => ({
    pagoId: fila.payout_id,
    desde: fila.periodo_desde,
    hasta: fila.periodo_hasta,
    montoAseos: enteroDeDinero(fila.monto_aseos, 'monto_aseos'),
    montoGastos: enteroDeDinero(fila.monto_gastos, 'monto_gastos'),
    total: enteroDeDinero(fila.monto_total, 'monto_total'),
    pagadoAt: fila.pagado_at,
  }));
}

/**
 * Lo que cuesta esa persona en el periodo: sus pagos por aseos MAS sus gastos
 * reembolsados. Es la cifra grande de la cabecera de §8.1.
 *
 * ── POR QUE SE SUMA AQUI Y NO SE PIDE A LA BASE ──────────────────────────
 *
 * Misma razon que `totalizarDetalle`: la cabecera tiene que decir exactamente lo
 * que suman los dos bloques que hay debajo. Una consulta agregada aparte podria
 * divergir de las dos listas en un caso de borde, y entonces la ficha se
 * contradiria a si misma dentro de la misma pantalla.
 *
 * Que ademas coincida con la fila de esa persona en el bloque 3 del Resumen lo
 * garantiza la base: las dos funciones usan el filtro del cierre (persona y pago
 * no nulos) y la misma conversion de fecha. Esa garantia vive en Postgres, que es
 * donde se puede medir.
 *
 * **Es lo que CUESTA, nunca revenue.** Por persona no se muestra ninguna cifra de
 * huesped ni ningun margen: el margen sale del apartamento, no de quien limpio, y
 * un revenue por persona se lee como un ranking de desempeno cuando en realidad
 * es un ranking de a quien le tocaron los apartamentos buenos.
 */
export function costoDeLaFicha(
  aseos: AseoDeLaFicha[],
  gastos: GastoDeLaFicha[],
): number {
  return (
    aseos.reduce((acc, a) => acc + a.pago, 0) +
    gastos.reduce((acc, g) => acc + g.monto, 0)
  );
}
