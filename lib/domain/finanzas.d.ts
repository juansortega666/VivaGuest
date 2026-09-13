/**
 * DECLARACIÓN DE CONTRATO DE LA WAVE 0. **NO TIENE RUNTIME, Y ES DELIBERADO.**
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESTE ARCHIVO SE BORRA EN EL PLAN 07-06, cuando exista `lib/domain/finanzas.ts`
 * de verdad. Es una obligación, no una sugerencia: un `.d.ts` que sobreviva a su
 * implementación queda como un contrato paralelo que nadie mira y que no falla
 * cuando se desincroniza.
 *
 * ── POR QUÉ EXISTE ────────────────────────────────────────────────────────
 *
 * `finanzas.test.ts` se escribió antes que su módulo, que es el punto entero de
 * la Wave 0. Sin esta declaración, el compilador no solo dice "no encuentro el
 * módulo": además infiere `{}` para todo lo que devuelven esas funciones y
 * escupe dieciocho errores en cascada de tipo implícito. Diecinueve errores, de
 * los cuales dieciocho son ruido, convierten `tsc` en un instrumento inútil
 * para el resto de la wave: un error de tipos DE VERDAD, escrito por otro plan
 * que corre en paralelo, se perdería dentro del ruido.
 *
 * Con la declaración, `tsc` vuelve a estar en verde y el ÚNICO rojo de la wave
 * es el de vitest, que es exactamente la señal que se quiere.
 *
 * ── POR QUÉ UNA DECLARACIÓN Y NO UN MÓDULO CON EL CUERPO VACÍO ────────────
 *
 * Porque un `.d.ts` no existe en tiempo de ejecución. Vitest sigue fallando con
 * "no encuentro el módulo", que es el rojo limpio e inconfundible de la Wave 0,
 * y NINGÚN código de aplicación puede importar esto por accidente y recibir un
 * valor inventado. Un módulo con funciones vacías sí podría: devolvería
 * `undefined` en silencio, o entraría a un bundle de producción.
 *
 * Beneficio que no se buscaba y que aparece solo: el test QUEDA TIPADO contra
 * este contrato, así que un desajuste entre lo que el test usa y lo que el plan
 * 07-06 va a implementar se descubre HOY y no dentro de tres waves.
 * ════════════════════════════════════════════════════════════════════════════
 */

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

export declare function costoPorAseadora(
  aseadoras: AseadoraDelPeriodo[],
  opciones?: { orden?: OrdenDelBloque; busqueda?: string },
): FilaDeCostoPorAseadora[];

/** Devuelve ausencia con cero aseos: un promedio vacío no existe, y no es cero. */
export declare function margenPromedioPorAseo(margen: number, aseos: number): number | null;

export declare function gananciaDelPeriodo(totales: {
  cobrado: number;
  pagado: number;
  gastos: number;
}): number;

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
 * No declara ninguna cifra de huésped, y no es un descuido: si el admin viera
 * una columna de más, cuando alguien reclame estarían comparando dos papeles
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

export declare function armarDesglose(entrada: EntradaDeDesglose): DesgloseDePago;
