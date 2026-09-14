import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';
import type { AseadoraDelPeriodo } from '@/lib/domain/finanzas';

/**
 * LA CAPA DE LECTURA DE LA SUB-PESTANA RESUMEN (FIN-02, FIN-05).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * DOS LLAMADAS, DOS FUNCIONES DE LA BASE, Y NINGUNA LOGICA DE AUTORIZACION AQUI.
 *
 * `resumen_financiero` y `costo_por_aseadora` (migracion 26, plan 07-08) son
 * `security definer` y comprueban el rol como PRIMERA sentencia de su cuerpo.
 * Esa es la frontera. Una segunda comprobacion en TypeScript no anadiria
 * ninguna garantia —el dato ya viajo o no viajo antes de llegar aqui— y si
 * crearia un sitio mas donde equivocarse: el dia que las dos discrepen, la que
 * manda sigue siendo la de Postgres y la de aqui solo confunde el diagnostico.
 *
 * Por que por funcion y no por grant: en Supabase el admin y la aseadora
 * comparten el rol Postgres `authenticated`, asi que "solo el admin" no existe
 * como categoria de grant. Es la tercera migracion consecutiva que lo aplica.
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
 * llamada de este modulo comprueba su error ANTES de devolver, y lanza. Un
 * respaldo silencioso en ceros seria peor que el fallo: un tablero que dice
 * `$ 0` de ganancia sobre un mes que si facturo es una cifra falsa sobre la que
 * el dueno toma decisiones.
 * ════════════════════════════════════════════════════════════════════════════
 */

type Cliente = SupabaseClient<Database>;

/**
 * Los nombres de las dos funciones, como constantes exportadas.
 *
 * Asi el test puede afirmar CONTRA QUE se llamo sin volver a escribir el nombre,
 * y el repo conserva una sola ocurrencia literal de cada uno. `as const` es lo
 * que mantiene el tipo literal que la firma generada del cliente exige.
 */
export const RPC_RESUMEN = 'resumen_financiero' as const;
export const RPC_COSTO_POR_ASEADORA = 'costo_por_aseadora' as const;

/**
 * Los cuatro KPIs, los tres conteos y los dos margenes del periodo.
 *
 * ── POR QUE SON DOS MARGENES Y NO UNO ─────────────────────────────────────
 *
 * `margen_total` es cobrado menos pagado, que es la suma de la columna MARGEN
 * del detalle aseo por aseo: esa tabla no tiene columna de gastos, asi que no
 * los descuenta. `ganancia` es cobrado menos pagado menos gastos, que es el KPI
 * 4. Confundirlos pondria dos cifras distintas para "lo que queda" en la misma
 * pantalla, y la conciliacion con el detalle dejaria de cuadrar.
 *
 * `margen_promedio` puede ser NULO, y es una decision de producto, no un
 * descuido: con cero aseos no hubo ningun aseo que dejara nada, que no es lo
 * mismo que decir que cada aseo dejo cero. La pantalla lo pinta con em dash.
 */
export type ResumenDelPeriodo = {
  cobrado: number;
  pagado_aseadores: number;
  gastos_reembolsados: number;
  ganancia: number;
  margen_total: number;
  /** Nulo con cero aseos. Ausencia, no cero. */
  margen_promedio: number | null;
  aseos_hechos: number;
  aseos_con_gastos: number;
  aseos_con_danos: number;
};

/**
 * El resumen del periodo, en UNA fila y UN recorrido de la base.
 *
 * ── LOS DERIVADOS LLEGAN CALCULADOS, Y NO SE RECALCULAN AQUI ──────────────
 *
 * `ganancia` y `margen_promedio` los calcula Postgres. `lib/domain/finanzas.ts`
 * exporta las dos funciones equivalentes y NO se usan en este camino: existen
 * para el dominio y sus tests. Calcularlos otra vez en TypeScript daria un
 * segundo sitio donde la resta puede estar mal, y el dia que discrepen la
 * pantalla mostraria una cifra que no sale de ninguna de las dos.
 *
 * ── LA FILA SE COMPONE CAMPO A CAMPO ──────────────────────────────────────
 *
 * Y no con propagacion del objeto crudo: si la funcion de la base creciera una
 * columna manana, se quedaria fuera de este tipo en vez de propagarse sola hasta
 * el navegador del admin. Es la misma disciplina de `leerEstadoDeAvisos`.
 *
 * ── CERO FILAS ES UN DEFECTO, NO UN PERIODO VACIO ─────────────────────────
 *
 * La funcion agrega con `coalesce`, asi que un periodo sin nada devuelve UNA
 * fila de ceros. Cero filas solo puede significar que la funcion cambio de
 * forma, y devolver ceros ahi seria inventarse un mes sin operacion.
 */
export async function leerResumenFinanciero(
  supabase: Cliente,
  rango: { desde: string; hasta: string },
): Promise<ResumenDelPeriodo> {
  const { data, error } = await supabase.rpc(RPC_RESUMEN, {
    p_desde: rango.desde,
    p_hasta: rango.hasta,
  });

  if (error) throw new Error(error.message);

  const fila = data?.[0];
  if (!fila) {
    throw new Error(
      `${RPC_RESUMEN} no devolvió ninguna fila para ${rango.desde}..${rango.hasta}. ` +
        'La función agrega con coalesce, así que un periodo sin operación devuelve una fila de ceros: ' +
        'cero filas solo puede ser un cambio de forma de la función.',
    );
  }

  return {
    cobrado: fila.cobrado,
    pagado_aseadores: fila.pagado_aseadores,
    gastos_reembolsados: fila.gastos_reembolsados,
    ganancia: fila.ganancia,
    margen_total: fila.margen_total,
    margen_promedio: fila.margen_promedio,
    aseos_hechos: fila.aseos_hechos,
    aseos_con_gastos: fila.aseos_con_gastos,
    aseos_con_danos: fila.aseos_con_danos,
  };
}

/**
 * Lo que cuesta cada persona en el periodo, para el bloque 3 del Resumen.
 *
 * ── LO QUE ESTA FUNCION NO DEVUELVE, Y ES DELIBERADO ──────────────────────
 *
 * Ninguna cifra de huesped y ningun margen por persona. El dueno descarto el
 * revenue por persona con argumento: "parece un ranking de desempeno y en
 * realidad es un ranking de a quien le tocaron los apartamentos buenos". El
 * `returns table` de la base no tiene ranura para esas columnas, asi que el dato
 * ni siquiera viaja al navegador. Ampliar esa firma para hacerle la vida mas
 * facil a la interfaz es exactamente el cambio que no se hace.
 *
 * ── LA FORMA DE SALIDA ES LA DEL DOMINIO, NO LA DE LA BASE ────────────────
 *
 * Se renombra aqui, en la frontera, y no en el componente: `costoPorAseadora()`
 * de `lib/domain/finanzas.ts` es quien calcula la proporcion y el orden, y sus
 * tests estan escritos contra ese tipo. Mapear en el componente dejaria la forma
 * de la base viajando por el arbol de la pantalla.
 *
 * ── UNA LISTA VACIA SI ES UN PERIODO SIN TRABAJO ──────────────────────────
 *
 * Al reves que el resumen: aqui no hay agregado que devolver, y cero personas
 * con aseos en el rango es un hecho del periodo. La pantalla lo pinta con su
 * estado vacio.
 */
export async function leerCostoPorAseadora(
  supabase: Cliente,
  rango: { desde: string; hasta: string },
): Promise<AseadoraDelPeriodo[]> {
  const { data, error } = await supabase.rpc(RPC_COSTO_POR_ASEADORA, {
    p_desde: rango.desde,
    p_hasta: rango.hasta,
  });

  if (error) throw new Error(error.message);

  return (data ?? []).map((fila) => ({
    aseadoraId: fila.aseador_id,
    nombre: fila.aseador_nombre,
    aseos: fila.cantidad_aseos,
    pago: fila.total_pago,
    gastos: fila.total_gastos,
  }));
}
