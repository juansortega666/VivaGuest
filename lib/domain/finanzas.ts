/**
 * AGREGACIÓN DE PRESENTACIÓN DEL DOMINIO FINANCIERO.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * QUÉ ES Y QUÉ NO ES.
 *
 * **No decide nada de negocio.** Quién entra en el periodo, qué se paga y a
 * quién lo decide Postgres, y su paridad se mide aparte. Lo que este módulo
 * calcula es lo que la pantalla necesita y la base no tiene por qué devolver: la
 * porción de la nómina que es cada persona, el margen promedio, y el orden en
 * que se leen.
 *
 * ── LAS TRES REGLAS QUE ESTE ARCHIVO EXISTE PARA SOSTENER ─────────────────
 *
 *   1. **EL DENOMINADOR DE LA BARRA ES EL TOTAL DEL PERIODO, NO EL MÁXIMO DEL
 *      GRUPO** (UI-SPEC §6.5.1). Con denominador igual al máximo, la primera
 *      persona llena siempre la barra y el bloque se convierte en un podio: la
 *      forma dependería de quién quedó primero, no de los datos. Con denominador
 *      igual al total, cada barra dice qué porción de la nómina del periodo es
 *      esa persona, y la suma de todas es el ancho de la card. Eso sí es
 *      información que el número no da.
 *
 *      Corolario: **filtrar la lista NO cambia el denominador.** Si la escala
 *      cambiara al buscar, buscar a una persona la dejaría al 100% del ancho por
 *      el mero hecho de haberla buscado, y la barra mentiría.
 *
 *   2. **EL ORDEN POR DEFECTO ES ALFABÉTICO** (UI-SPEC §6.5.3). Una lista de
 *      PERSONAS ordenada de mayor a menor se lee como un podio aunque no lleve
 *      números ni medallas, y este tema ya demostró ser sensible: fue exactamente
 *      la razón por la que el dueño descartó el revenue por persona. El orden por
 *      monto existe, pero es una elección explícita del admin y no se persiste
 *      entre sesiones: persistirla convertiría una consulta puntual en el estado
 *      permanente de la pantalla.
 *
 *      Y también en la FORMA del dato: ninguna fila lleva posición, puesto ni
 *      nada que se lea como un ranking. Lo que no existe no se puede renderizar.
 *
 *   3. **UN TOTAL QUE LLEGA COMO TEXTO SE RECHAZA, LANZANDO.** Es el fallo
 *      silencioso de la fase: `sum()` sobre enteros anchos devuelve en Postgres
 *      el tipo de precisión arbitraria, y el cliente lo entrega como CADENA para
 *      no perder precisión. Dos cadenas con el operador de suma se CONCATENAN
 *      (`'480000' + '60000'` es `'48000060000'`) y el resultado sigue siendo un
 *      número perfectamente formateable, porque el formateador de moneda funciona
 *      igual sobre texto y sobre número. El síntoma sería un total de miles de
 *      millones donde debería haber cientos de miles. Por eso el rechazo vive
 *      aquí, en la agregación, y no en la capa que pinta. Y lanza en vez de
 *      devolver un respaldo: un cero silencioso le borraría el pago a una
 *      persona y nadie se enteraría hasta que reclamara.
 *
 * ── LA FRONTERA, QUE ES LA REGLA MÁS IMPORTANTE DE LA FASE ────────────────
 *
 * "El aseador ve lo que le llega. Nunca lo que cobramos, ni la diferencia, ni el
 * margen de nadie." (D7-7, cita literal del dueño.)
 *
 * **Los tipos del desglose del admin y los del aseador son EL MISMO TIPO.** No
 * hay una versión recortada para el teléfono: si el admin viera una columna de
 * más, cuando alguien reclame estarían comparando dos papeles distintos. Ningún
 * tipo de este módulo declara una cifra de huésped ni un margen, y
 * `finanzas.test.ts` lo comprueba recorriendo el árbol entero de claves.
 *
 * Esto es la TERCERA capa de esa frontera. La de verdad está en Postgres y la
 * mide pgTAP impersonando a un aseador: **un tipo no es un control de acceso**, y
 * el dato viaja aunque no se pinte.
 *
 * ── DINERO ────────────────────────────────────────────────────────────────
 *
 * Pesos colombianos ENTEROS, sin subunidad. Nada de decimales, nada de coma
 * flotante. La única cifra no entera de este archivo es `proporcion`, que no es
 * dinero: es una razón entre 0 y 1.
 * ════════════════════════════════════════════════════════════════════════════
 */

/**
 * Colador de dinero, y la pieza que implementa la regla 3.
 *
 * Rechaza todo lo que no sea un entero seguro: la cadena que devuelve la suma de
 * enteros anchos, el nulo que llega cuando la agregación no usó `coalesce`, el
 * `NaN` que sale de restar dos cadenas, y el infinito.
 *
 * **El mensaje NOMBRA EL CAMPO.** Sin el nombre, el diagnóstico obliga a recorrer
 * la consulta entera buscando cuál de las agregaciones se quedó sin el cast a
 * entero, y son varias.
 */
function enteroDeDinero(valor: unknown, campo: string): number {
  if (typeof valor !== 'number' || !Number.isSafeInteger(valor)) {
    return caerCon(campo, valor);
  }
  return valor;
}

/**
 * El fallo, aparte, para que el mensaje se escriba UNA vez y los cuatro puntos de
 * entrada del módulo digan exactamente lo mismo.
 *
 * Se nombra el tipo recibido además del valor: `'400000'` y `400000` se imprimen
 * casi igual en un mensaje de error, y el tipo es justo lo que distingue el
 * defecto de un dato correcto.
 */
function caerCon(campo: string, valor: unknown): never {
  throw new TypeError(
    `El campo "${campo}" llegó como ${typeof valor} (${String(valor)}) y tiene que ser un entero. ` +
      'Es casi seguro una suma de enteros anchos sin cast en la consulta: el cliente la entrega ' +
      'como cadena y el operador de suma la concatena en silencio.',
  );
}

/** Lo que la base devuelve por persona y periodo. Pesos enteros, siempre número. */
export type AseadoraDelPeriodo = {
  aseadoraId: string;
  nombre: string;
  /** Aseos completados de esa persona dentro del periodo. */
  aseos: number;
  /** Suma de lo que se le paga por sus aseos. */
  pago: number;
  /** Suma de los gastos que se le reembolsan. */
  gastos: number;
};

/** La fila ya lista para pintar. Sin posición, sin puesto y sin nada de ranking. */
export type FilaDeCostoPorAseadora = AseadoraDelPeriodo & {
  /** Pago más gastos reembolsados. Es lo que D7-2 define como lo que cuesta. */
  costo: number;
  /** Entre 0 y 1, contra el TOTAL del periodo y nunca contra el máximo del grupo. */
  proporcion: number;
};

/** Las dos opciones del selector de orden. Alfabético es el defecto. */
export type OrdenDelBloque = 'nombre' | 'monto';

/**
 * Comparación de nombres por IDIOMA y no por punto de código.
 *
 * `sensitivity: 'base'` ignora acentos y mayúsculas, que es lo que hace falta con
 * nombres reales: en orden de punto de código, `A`(65) < `Z`(90) < `Ó`(211) <
 * `á`(225), así que un `<` a pelo intercala a Zulema entre Ana y Óscar.
 *
 * Se construye UNA vez a nivel de módulo, misma razón que los formateadores de
 * `dates.ts` y `money.ts`: instanciar `Intl` por comparación dentro de un `sort`
 * es caro de verdad.
 */
const POR_NOMBRE = new Intl.Collator('es-CO', { sensitivity: 'base' });

/**
 * Quita acentos y baja a minúscula, para el buscador.
 *
 * Quien escribe en un teclado de móvil no pone la tilde, así que `angela` tiene
 * que encontrar a `ángela`. Se descompone en NFD y se borran los diacríticos, que
 * es la forma que no necesita una tabla de equivalencias.
 */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * Las filas del bloque "cuánto cuesta cada aseadora", listas para pintar.
 *
 * **La proporción se calcula SIEMPRE contra el total de la lista completa, antes
 * de filtrar.** El orden de las operaciones de esta función no es de estilo: es
 * la regla 1 de la cabecera, y hacerlo al revés es el defecto que la convierte en
 * un podio.
 *
 * Con el total en cero la proporción es cero y no un fallo de división: un
 * periodo sin trabajo es un hecho, no un dato ausente, y un `NaN` en el ancho de
 * la barra se renderiza como una barra vacía sin que nada diga por qué.
 *
 * La proporción va entre 0 y 1, NUNCA en porcentaje. La escala se fija aquí y no
 * en el componente: dos consumidores que multipliquen por cien cada uno por su
 * cuenta es como una barra acaba al 4000% de ancho.
 */
export function costoPorAseadora(
  aseadoras: AseadoraDelPeriodo[],
  opciones?: { orden?: OrdenDelBloque; busqueda?: string },
): FilaDeCostoPorAseadora[] {
  // 1. Colar el dinero ANTES de sumar nada. Si algo llega como texto, la suma de
  //    abajo lo concatenaría y el total saldría en miles de millones.
  const conCosto = aseadoras.map((a) => {
    const pago = enteroDeDinero(a.pago, 'pago');
    const gastos = enteroDeDinero(a.gastos, 'gastos');
    const aseos = enteroDeDinero(a.aseos, 'aseos');

    return { ...a, aseos, pago, gastos, costo: pago + gastos };
  });

  // 2. EL DENOMINADOR, sobre la lista COMPLETA. Aquí, y no después de filtrar.
  const total = conCosto.reduce((acc, a) => acc + a.costo, 0);

  const filas: FilaDeCostoPorAseadora[] = conCosto.map((a) => ({
    ...a,
    proporcion: total === 0 ? 0 : a.costo / total,
  }));

  // 3. El filtro, que ya no puede tocar la escala porque la proporción está
  //    calculada. Una búsqueda en blanco no filtra: el campo vacío es el estado
  //    normal del buscador, no una consulta que no encuentra nada.
  const busqueda = normalizar(opciones?.busqueda?.trim() ?? '');
  const visibles = busqueda
    ? filas.filter((f) => normalizar(f.nombre).includes(busqueda))
    : filas;

  // 4. El orden. Alfabético por defecto; por monto solo si alguien lo pidió, y
  //    entonces de mayor a menor. El desempate del orden por monto es el nombre,
  //    para que dos personas con el mismo costo no bailen entre renders.
  const orden = opciones?.orden ?? 'nombre';

  return [...visibles].sort((a, b) =>
    orden === 'monto'
      ? b.costo - a.costo || POR_NOMBRE.compare(a.nombre, b.nombre)
      : POR_NOMBRE.compare(a.nombre, b.nombre),
  );
}

/**
 * El margen promedio por aseo del periodo, en pesos enteros.
 *
 * **CON CERO ASEOS DEVUELVE AUSENCIA, NO CERO.** Un promedio de cero afirma que
 * cada aseo dejó cero de margen; con cero aseos no hubo ningún aseo que dejara
 * nada, que es otra cosa, y la pantalla lo pinta con em dash en vez de con `$ 0`.
 *
 * Es la excepción declarada a la regla de dinero de UI-SPEC §11.1, donde el cero
 * SÍ es un hecho: allí se habla de sumas, y una suma vacía es cero. Un promedio
 * vacío no existe.
 *
 * Se redondea al entero más cercano y no se trunca: con las cifras del contrato,
 * 1.976.000 entre 48 da 41.166,66 y la pantalla dice `$ 41.167`.
 *
 * Un margen negativo produce un promedio negativo, sin recortar a cero. Recortar
 * escondería el único caso en el que esta cifra dice algo urgente: un periodo en
 * el que los aseos costaron más de lo que dejaron.
 */
export function margenPromedioPorAseo(margen: number, aseos: number): number | null {
  const margenEntero = enteroDeDinero(margen, 'margen');
  const aseosEnteros = enteroDeDinero(aseos, 'aseos');

  if (aseosEnteros === 0) return null;
  return Math.round(margenEntero / aseosEnteros);
}

/**
 * La ganancia del periodo: lo cobrado menos lo pagado menos los gastos.
 *
 * Los TRES totales se cuelan, uno por uno. Un guard que mirara solo el primer
 * argumento dejaría pasar dos de los tres casos, y con el operador de resta la
 * concatenación no ocurre pero la coerción sí: `'2160000' - 1` da un número y
 * nada se queja.
 *
 * Un periodo sin nada da cero, no ausencia: cero cobrado es un hecho del día, no
 * un campo sin llenar. Y puede ser negativa, y se devuelve tal cual.
 *
 * El tipo del argumento va INLINE y no se exporta a propósito: es lo único de
 * este archivo que nombra una cifra de huésped, y exportarlo lo pondría a un
 * import de distancia del árbol del aseador.
 */
export function gananciaDelPeriodo(totales: {
  cobrado: number;
  pagado: number;
  gastos: number;
}): number {
  const cobrado = enteroDeDinero(totales.cobrado, 'cobrado');
  const pagado = enteroDeDinero(totales.pagado, 'pagado');
  const gastos = enteroDeDinero(totales.gastos, 'gastos');

  return cobrado - pagado - gastos;
}

/** Una línea de aseo del desglose. Lleva LAS DOS FECHAS (D7-8). */
export type LineaDeAseoDelDesglose = {
  aseoId: string;
  apartamento: string;
  /** Día en que estaba programado. */
  programado: string;
  /** Día en que se hizo de verdad. Decide el periodo al que pertenece. */
  ejecutado: string;
  pago: number;
};

export type LineaDeGastoDelDesglose = {
  gastoId: string;
  concepto: string;
  monto: number;
  /** La ausencia de recibo es un estado declarado de la interfaz, no un fallo. */
  tieneRecibo: boolean;
};

/**
 * El desglose de un pago. ES EL MISMO DOCUMENTO PARA EL ADMIN Y PARA EL ASEADOR.
 *
 * No declara ninguna cifra de huésped, y no es un descuido: si el admin viera una
 * columna de más, cuando alguien reclame estarían comparando dos papeles
 * distintos. La frontera de verdad está en Postgres; esto es la tercera capa.
 */
export type EntradaDeDesglose = {
  aseadoraId: string;
  nombre: string;
  periodo: { desde: string; hasta: string };
  aseos: LineaDeAseoDelDesglose[];
  gastos: LineaDeGastoDelDesglose[];
};

/** Las dos partidas van SEPARADAS, no como un total plano: lo exige D7-2 y FIN-04. */
export type DesgloseDePago = EntradaDeDesglose & {
  totalAseos: number;
  totalGastos: number;
  total: number;
};

/**
 * Totaliza un desglose, con las dos partidas por separado.
 *
 * Por separado y no como un total plano porque D7-2 exige el desglose, y porque
 * el snapshot mensual tiene que guardar las dos partidas o el desglose no
 * sobrevive al borrado de los aseos por antigüedad (FIN-04).
 *
 * **Cada línea conserva LAS DOS FECHAS**, la programada y la de ejecución (D7-8).
 * Sin las dos, un aseo de enero en el recibo de febrero parece un error y genera
 * exactamente la discusión que el desglose existe para evitar.
 *
 * El mismo colador de dinero que la agregación, y aquí duele más: es el papel que
 * una persona tiene delante cuando reclama su pago.
 *
 * Un desglose sin aseos y sin gastos totaliza cero y no lanza: una persona sin
 * trabajo en el periodo es un hecho del periodo.
 */
export function armarDesglose(entrada: EntradaDeDesglose): DesgloseDePago {
  const totalAseos = entrada.aseos.reduce(
    (acc, a) => acc + enteroDeDinero(a.pago, 'pago'),
    0,
  );
  const totalGastos = entrada.gastos.reduce(
    (acc, g) => acc + enteroDeDinero(g.monto, 'monto'),
    0,
  );

  return { ...entrada, totalAseos, totalGastos, total: totalAseos + totalGastos };
}
