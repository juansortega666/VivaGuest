import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';

/**
 * LA CAPA DE LECTURA DE LA SUB-PESTANA PAGOS (FIN-03, FIN-04).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * CUATRO LLAMADAS, CUATRO FUNCIONES DE LA BASE, Y NINGUNA LOGICA DE
 * AUTORIZACION AQUI.
 *
 * `periodos_de_pago`, `pagos_del_periodo`, `detalle_de_pago` (migracion 27) y
 * `periodo_pendiente_de_cierre` (migracion 25) son `security definer` y
 * comprueban el rol como PRIMERA sentencia de su cuerpo. Esa es la frontera.
 * Una segunda comprobacion en TypeScript no anadiria ninguna garantia —el dato
 * ya viajo o no viajo antes de llegar aqui— y si crearia un sitio mas donde
 * equivocarse. Misma decision, y por las mismas razones, que `lib/data/finanzas.ts`.
 *
 * ── LO QUE ESTA PANTALLA LEE NO ES EL MUNDO VIVO, Y ESO ES SU RAZON DE SER ──
 *
 * Es la diferencia de contrato con el Resumen, y el admin tiene que poder
 * notarla sin que se la expliquen (UI-SPEC §5.3): el Resumen es una FOTO EN VIVO
 * que se recalcula con el filtro y que se vaciara cuando los aseos viejos se
 * borren; Pagos es el REGISTRO CONGELADO. Las cuatro funciones de aqui leen del
 * snapshot y no se unen contra las tablas vivas: un aseo borrado por antiguedad
 * sigue mostrando su apartamento, su monto y sus dos fechas.
 *
 * **Consecuencia que atraviesa hasta la interfaz: NO SE RENDERIZA NINGUN ENLACE
 * desde las lineas del desglose.** Apuntarian a filas que pueden no existir.
 * Por eso `pagos_del_periodo` ni siquiera devuelve `aseador_id`, y este modulo
 * no lo inventa.
 *
 * ── EL CLIENTE LLEGA POR PARAMETRO ────────────────────────────────────────
 *
 * Como en todo `lib/data/`: asi la misma funcion sirve a un componente de
 * servidor con el JWT del admin y a un test de integracion con el JWT que se
 * quiera probar. Construirlo dentro ataria el modulo a `next/headers` y haria
 * imposible ejercer la denegacion.
 *
 * ── SIN CACHE, misma regla que el resto del directorio ────────────────────
 *
 * Son datos por usuario. Una entrada compartida se le sirve a otro, que es la
 * fuga mas barata de provocar y la mas cara de detectar. El layout de `(admin)`
 * ya declara render dinamico.
 *
 * ── Y LA REGLA QUE AQUI NO SE PUEDE OLVIDAR: LEER EL RESULTADO ────────────
 *
 * El defecto del 2026-09-11 fue invisible durante semanas porque el servidor
 * devolvia fallo y nadie miraba: la pantalla decia que todo estaba bien. Toda
 * llamada de este modulo comprueba su error ANTES de devolver, y lanza. Aqui
 * pesa mas que en ninguna otra parte: un respaldo silencioso en una lista vacia
 * le diria al admin que no le debe nada a nadie.
 * ════════════════════════════════════════════════════════════════════════════
 */

type Cliente = SupabaseClient<Database>;

/**
 * Los nombres de las cuatro funciones, como constantes exportadas.
 *
 * Asi el test puede afirmar CONTRA QUE se llamo sin volver a escribir el nombre,
 * y el repo conserva una sola ocurrencia literal de cada uno. `as const` es lo
 * que mantiene el tipo literal que la firma generada del cliente exige.
 */
export const RPC_PERIODOS_DE_PAGO = 'periodos_de_pago' as const;
export const RPC_PAGOS_DEL_PERIODO = 'pagos_del_periodo' as const;
export const RPC_DETALLE_DE_PAGO = 'detalle_de_pago' as const;
export const RPC_PERIODO_PENDIENTE = 'periodo_pendiente_de_cierre' as const;

/**
 * La cabecera colapsable de un periodo cerrado (UI-SPEC §9.1).
 *
 * `desde` y `hasta` son DIAS DE NEGOCIO `'YYYY-MM-DD'` y viajan como tales, no
 * como etiqueta ya formateada. Es lo que le permite a la pantalla escribir el
 * rotulo con sus dos fechas reales y al aseador escribirlo sin el ano, sin
 * repetir el parseo ni el criterio.
 */
export type PeriodoCerrado = {
  desde: string;
  hasta: string;
  personas: number;
  /** Pesos enteros. La suma de los pagos del periodo. */
  montoTotal: number;
  faltanPorPagar: number;
  /**
   * Aseos gestionados del rango que al cerrar no estaban completados (FIN-05).
   *
   * Se CONGELO en el cierre. No se recalcula: un contador que cambia solo, meses
   * despues, porque alguien cancelo un aseo viejo, deja de ser un documento.
   */
  aseosNoComputados: number;
};

/** Una fila de la tabla interna de un periodo (UI-SPEC §9.1, columnas 1 a 6). */
export type PagoDelPeriodo = {
  /** El identificador del PAGO, que es estable. No hay ninguno de la persona. */
  pagoId: string;
  /** Texto copiado en el snapshot, no una union viva contra el perfil. */
  aseadora: string;
  aseos: number;
  /** Las DOS PARTIDAS POR SEPARADO, que es D7-2 en la tabla. */
  montoAseos: number;
  montoGastos: number;
  montoTotal: number;
  /** Instante de la marca, o nulo si sigue pendiente. */
  pagadoAt: string | null;
};

/**
 * Una linea del desglose de un pago (UI-SPEC §9.3).
 *
 * ── LAS DOS FECHAS SON OBLIGATORIAS EN LAS DOS CLASES DE LINEA ────────────
 *
 * La migracion 23 las declaro `not null` y el gasto las HEREDA de su aseo. No
 * son opcionales en este tipo a proposito: si lo fueran, la interfaz tendria
 * permiso para no pintarlas, y D7-8 dice que salen siempre, tambien cuando
 * coinciden.
 */
export type LineaDeDesglose = {
  tipo: 'aseo' | 'gasto';
  /** Nombre del apartamento, copiado como texto. */
  apartamento: string;
  /** Solo en las lineas de gasto. Nulo en las de aseo. */
  concepto: string | null;
  fechaProgramada: string;
  fechaEjecucion: string;
  /** Pesos enteros. */
  monto: number;
  /**
   * Donde vive la foto del recibo, o nulo si no hay ninguna.
   *
   * BUCKET Y RUTA, NUNCA UNA URL FIRMADA (T-07-38): la funcion de la base
   * devuelve la ubicacion y el SERVIDOR firma, despues del guard de admin. Una
   * URL firmada emitida para cada fila de la pagina sobrevive al cierre de
   * sesion hasta que expire.
   */
  recibo: { bucket: string; ruta: string } | null;
};

/** El periodo que ya vencio y no tiene cierre, o nulo si todo esta al dia. */
export type PeriodoPendiente = { desde: string; hasta: string };

/**
 * Los periodos cerrados, del mas reciente al mas antiguo.
 *
 * ── UNA LISTA VACIA ES UN HECHO, NO UN DEFECTO ────────────────────────────
 *
 * Al reves que el resumen del plan 07-10, que agrega con `coalesce` y por eso
 * no puede devolver cero filas sin que algo este roto. Aqui cero periodos
 * significa que todavia no ha corrido ningun cierre, que es exactamente lo que
 * pasa el primer mes, y la pantalla lo explica con su estado vacio.
 */
export async function leerPeriodosDePago(supabase: Cliente): Promise<PeriodoCerrado[]> {
  const { data, error } = await supabase.rpc(RPC_PERIODOS_DE_PAGO);

  if (error) throw new Error(error.message);

  return (data ?? []).map((fila) => ({
    desde: fila.periodo_desde,
    hasta: fila.periodo_hasta,
    personas: fila.personas,
    montoTotal: fila.monto_total,
    faltanPorPagar: fila.faltan_por_pagar,
    aseosNoComputados: fila.aseos_no_computados,
  }));
}

/**
 * Los pagos de UN periodo, en orden alfabetico por persona.
 *
 * El argumento es el dia de inicio y no el rango entero porque `periodo_desde`
 * es la clave primaria de la cabecera: pedir las dos fechas dejaria que el
 * llamante inventara una combinacion que no existe y recibiera cero filas como
 * si fuera un dato.
 *
 * ── LA FILA SE COMPONE CAMPO A CAMPO ──────────────────────────────────────
 *
 * Y no con propagacion del objeto crudo: si la funcion de la base creciera una
 * columna manana, se quedaria fuera de este tipo en vez de propagarse sola hasta
 * el navegador del admin. Es la misma disciplina de `leerCostoPorAseadora`, y
 * aqui protege ademas la frontera de §10.1: ninguna cifra de huesped.
 */
export async function leerPagosDelPeriodo(
  supabase: Cliente,
  desde: string,
): Promise<PagoDelPeriodo[]> {
  const { data, error } = await supabase.rpc(RPC_PAGOS_DEL_PERIODO, { p_desde: desde });

  if (error) throw new Error(error.message);

  return (data ?? []).map((fila) => ({
    pagoId: fila.payout_id,
    aseadora: fila.aseador_nombre,
    aseos: fila.cantidad_aseos,
    montoAseos: fila.monto_aseos,
    montoGastos: fila.monto_gastos,
    montoTotal: fila.monto_total,
    pagadoAt: fila.pagado_at ?? null,
  }));
}

/**
 * El desglose de UN pago: primero los aseos, despues los gastos.
 *
 * El orden lo fija `orden`, la secuencia contigua que escribio el cierre.
 * Reordenar aqui haria que el mismo recibo se leyera distinto en dos visitas, y
 * este documento es el que alguien saca cuando reclama.
 *
 * ── LO QUE NO SE DEVUELVE, Y ES DELIBERADO ────────────────────────────────
 *
 * Ninguna cifra de huesped y ningun margen. La funcion de la base declara
 * EXACTAMENTE las mismas nueve columnas que su gemela del telefono: el desglose
 * del admin y el del aseador tienen que ser el mismo documento, o el dia que
 * alguien reclame estaran comparando dos papeles distintos.
 */
export async function leerDetalleDePago(
  supabase: Cliente,
  pagoId: string,
): Promise<LineaDeDesglose[]> {
  const { data, error } = await supabase.rpc(RPC_DETALLE_DE_PAGO, { p_payout: pagoId });

  if (error) throw new Error(error.message);

  return (data ?? []).map((fila) => ({
    // La base devuelve `text` y no un enum. Se normaliza aqui, en la frontera,
    // para que el componente no tenga que comparar cadenas sueltas: cualquier
    // cosa que no sea 'gasto' es una linea de aseo, que es la clase por defecto
    // del cierre.
    tipo: fila.tipo === 'gasto' ? ('gasto' as const) : ('aseo' as const),
    apartamento: fila.property_nombre,
    concepto: fila.concepto ?? null,
    fechaProgramada: fila.fecha_programada,
    fechaEjecucion: fila.fecha_ejecucion,
    monto: fila.monto,
    recibo:
      fila.evidencia_bucket && fila.evidencia_path
        ? { bucket: fila.evidencia_bucket, ruta: fila.evidencia_path }
        : null,
  }));
}

/**
 * El periodo vencido sin cierre, o nulo.
 *
 * ── CERO FILAS ES EL CASO NORMAL ──────────────────────────────────────────
 *
 * Y por eso el aviso de §9.5 no existe en el DOM salvo cuando hace falta. Se
 * devuelve `null` y no un arreglo vacio porque quien llama tiene que decidir
 * entre pintar y no pintar, no entre recorrer una lista de uno.
 */
export async function leerPeriodoPendienteDeCierre(
  supabase: Cliente,
): Promise<PeriodoPendiente | null> {
  const { data, error } = await supabase.rpc(RPC_PERIODO_PENDIENTE);

  if (error) throw new Error(error.message);

  const fila = data?.[0];
  if (!fila) return null;

  return { desde: fila.periodo_desde, hasta: fila.periodo_hasta };
}
