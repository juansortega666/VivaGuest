import type { SupabaseClient } from '@supabase/supabase-js';

import type { UbicacionDeRecibo } from '@/lib/data/recibos';
import type { Database } from '@/lib/database.types';

/**
 * LA CAPA DE LECTURA DE `/mis-pagos` Y `/mis-pagos/[id]` (FIN-04, D7-4.3).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ES LA UNICA SUPERFICIE DE DINERO QUE UN ASEADOR VE EN SU VIDA, Y LA REGLA QUE
 * LA ORDENA ES CITA LITERAL DEL DUENO: «el aseador ve lo que le llega y punto».
 *
 * ── LAS TRES GUARDAS NO SE REPITEN AQUI, Y ESO ES DELIBERADO ──────────────
 *
 * `public.mis_pagos_cerrados()` y `public.detalle_de_mi_pago(uuid)` (migracion
 * 27, plan 07-09) son `security definer` y traen las tres dentro del cuerpo:
 *
 *   1. la cuenta es de aseador Y SIGUE ACTIVA, consultando el perfil en vivo y
 *      nunca un dato del token, porque un token ya emitido vale hasta que
 *      expire y una desactivacion tiene que surtir efecto de inmediato;
 *   2. el filtro por dueno contra la identidad de la sesion, DENTRO de la
 *      funcion y no en el `where` de la pantalla, porque una pantalla se puede
 *      llamar con otro parametro;
 *   3. solo periodos con cierre.
 *
 * Esa es la frontera. Una segunda comprobacion en TypeScript no anadiria
 * ninguna garantia —el dato ya viajo o no viajo antes de llegar aqui— y si
 * crearia un sitio mas donde equivocarse, ademas de poder DISCREPAR de la
 * funcion el dia que una de las dos cambie. Es la misma disciplina que
 * `lib/data/aseos-del-aseador.ts` aplica frente a la policy.
 *
 * ── LA REGLA DE TIPOS, QUE AQUI ES UNA FRONTERA Y NO UNA PREFERENCIA ──────
 *
 * Ninguno de los tipos de este modulo declara una cifra de huesped ni ninguna
 * de la que se pueda derivar una. La fila se compone CAMPO A CAMPO y nunca por
 * propagacion del objeto crudo: si manana alguien le anadiera una columna a la
 * funcion de base, se quedaria fuera de este tipo en vez de propagarse sola
 * hasta el telefono.
 *
 * **No se filtra en el render: no llega.** Una consulta que trae el dato y una
 * pantalla que no lo pinta siguen siendo una fuga, porque el dato viaja al
 * dispositivo igual.
 *
 * ── EL CLIENTE LLEGA POR PARAMETRO Y NO HAY CACHE ─────────────────────────
 *
 * Como en todo `lib/data/`. Y aqui importa doble: son datos por usuario, y una
 * entrada de cache compartida se le sirve a otra persona, que es exactamente la
 * fuga que esta pantalla existe para no tener.
 *
 * ── Y LA REGLA QUE NO SE PUEDE OLVIDAR: LEER EL RESULTADO ─────────────────
 *
 * El defecto del 2026-09-11 fue invisible durante semanas porque el servidor
 * devolvia fallo y nadie miraba. Toda llamada de este modulo comprueba su error
 * antes de devolver.
 * ════════════════════════════════════════════════════════════════════════════
 */

type Cliente = SupabaseClient<Database>;

/**
 * Los nombres de las dos funciones, como constantes exportadas.
 *
 * Asi el test puede afirmar CONTRA QUE se llamo sin volver a escribir el nombre,
 * y el repo conserva una sola ocurrencia literal de cada uno.
 */
export const RPC_MIS_PAGOS = 'mis_pagos_cerrados' as const;
export const RPC_MI_DESGLOSE = 'detalle_de_mi_pago' as const;

/**
 * La forma de un identificador de la base, comprobada ANTES de la consulta.
 *
 * El identificador de `/mis-pagos/[id]` llega del segmento dinamico, o sea de
 * fuera. Sin esta guarda, PostgREST responde `22P02 invalid input syntax for
 * type uuid` y la pantalla se cae con un error de servidor en vez de con su
 * estado de ausencia. Misma guarda y misma razon que en `lib/data/aseo-aseador.ts`.
 */
const FORMA_DE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * El codigo de denegacion de las dos funciones.
 *
 * Las dos levantan EXACTAMENTE la misma excepcion para «no existe», «no es
 * tuyo» y «no esta cerrado», y esta capa la traduce a una sola ausencia por la
 * misma razon: distinguirlas convertiria la pantalla en un oraculo de
 * enumeracion de pagos ajenos.
 */
const DENEGADO = '42501';

/** Un periodo ya cerrado, tal como lo pinta la tarjeta del telefono (§10.3). */
export interface MiPagoCerrado {
  payoutId: string;
  /** Primer dia del periodo. Se pinta SIEMPRE, nunca solo el nombre del mes (D7-5). */
  desde: string;
  /** Ultimo dia del periodo, incluido. */
  hasta: string;
  /** Lo que se le paga en total. En pesos enteros. */
  total: number;
  /** Instante en que se registro el pago, o nulo si todavia esta pendiente. */
  pagadoAt: string | null;
}

/** Una linea de aseo del desglose (§10.4). Las DOS fechas, siempre (D7-8). */
export interface MiAseoDelPago {
  apartamento: string;
  /** Dia para el que estaba programado. */
  programado: string;
  /** Dia en que se hizo. Es el que decide en que periodo entra. */
  hecho: string;
  monto: number;
}

/** Una linea de gasto del desglose (§10.4). */
export interface MiGastoDelPago {
  concepto: string;
  /** El dia en que se hizo la compra. */
  fecha: string;
  monto: number;
  /**
   * Donde vive la foto del recibo, o nulo si la linea no tiene ninguna.
   *
   * **NO BAJA AL TELEFONO.** En un bucket privado la ruta es, por si sola, una
   * autorizacion: quien la conoce puede pedir que se la firmen. La pagina firma
   * en el servidor con `firmarRecibo()` y al componente le llega la URL ya
   * firmada y con vida corta, nunca esto.
   */
  recibo: UbicacionDeRecibo | null;
}

/** El desglose entero de un pago propio: su cabecera y sus dos secciones. */
export interface MiDesglose {
  pago: MiPagoCerrado;
  aseos: MiAseoDelPago[];
  gastos: MiGastoDelPago[];
}

/**
 * Los periodos ya cerrados de quien pregunta, del mas reciente al mas antiguo.
 *
 * ── UNA LISTA VACIA NO ES UN FALLO ────────────────────────────────────────
 *
 * Es una persona que todavia no ha tenido ningun cierre, que es el estado
 * normal de alguien que acaba de entrar al equipo. La pantalla lo dice con su
 * estado de ausencia, que ademas explica cuando va a aparecer el primero.
 *
 * ── EL ORDEN NO SE REHACE AQUI ────────────────────────────────────────────
 *
 * La funcion ya devuelve `order by periodo_desde desc`. Reordenar en memoria
 * seria un segundo sitio donde el orden puede estar mal, y el dia que los dos
 * discrepen la pantalla mostraria uno que no sale de ninguno de los dos.
 */
export async function leerMisPagosCerrados(supabase: Cliente): Promise<MiPagoCerrado[]> {
  const { data, error } = await supabase.rpc(RPC_MIS_PAGOS);

  if (error) throw new Error(error.message);

  return (data ?? []).map((fila) => ({
    payoutId: fila.payout_id,
    desde: fila.periodo_desde,
    hasta: fila.periodo_hasta,
    total: fila.monto_total,
    pagadoAt: fila.pagado_at,
  }));
}

/**
 * El desglose de un pago PROPIO, o `null`.
 *
 * ── LOS TRES CASOS QUE DEVUELVEN `null` SON EL MISMO CASO ─────────────────
 *
 * El identificador no tiene forma de identificador, el pago no existe, el pago
 * es de otra persona, o su periodo no esta cerrado: **todos se ven identicos**.
 * Distinguirlos seria un oraculo de enumeracion de pagos ajenos, que es la
 * misma razon por la que el RPC del codigo de acceso lanza una sola denegacion
 * para sus tres casos.
 *
 * ── LA CABECERA SALE DE LA LISTA, Y ESO ADEMAS CIERRA LA PUERTA ───────────
 *
 * El desglose de la base devuelve las LINEAS, no las dos fechas del periodo ni
 * el estado del pago, que es lo que la cabecera necesita. Salen de la lista de
 * periodos cerrados, que es la misma funcion con las mismas tres guardas: si el
 * pago no esta en ella, no es suyo o no esta cerrado, y entonces ni siquiera se
 * llega a preguntar por sus lineas.
 *
 * ── UN ERROR DE VERDAD SI LANZA ───────────────────────────────────────────
 *
 * Un fallo de conexion no es «este pago no es tuyo»: devolver `null` ahi
 * pintaria la ausencia y le diria al aseador que su dinero no existe.
 */
export async function leerMiDesglose(
  supabase: Cliente,
  payoutId: string,
): Promise<MiDesglose | null> {
  if (!FORMA_DE_ID.test(payoutId)) return null;

  const pago = (await leerMisPagosCerrados(supabase)).find((p) => p.payoutId === payoutId);
  if (!pago) return null;

  const { data, error } = await supabase.rpc(RPC_MI_DESGLOSE, { p_payout: payoutId });

  // La denegacion se traduce a ausencia; cualquier otro fallo se propaga.
  if (error) {
    if (error.code === DENEGADO) return null;
    throw new Error(error.message);
  }

  const filas = data ?? [];

  return {
    pago,
    aseos: filas
      .filter((fila) => fila.tipo === 'aseo')
      .map((fila) => ({
        apartamento: fila.property_nombre,
        programado: fila.fecha_programada,
        hecho: fila.fecha_ejecucion,
        monto: fila.monto,
      })),
    gastos: filas
      .filter((fila) => fila.tipo === 'gasto')
      .map((fila) => ({
        // El constraint `cpl_gasto_shape` exige concepto no vacio en toda linea
        // de gasto, asi que el nulo del tipo generado no es alcanzable. Se
        // resuelve igual: un `!` seria una afirmacion sin red.
        concepto: fila.concepto ?? '',
        // La fecha del gasto es la de ejecucion. Las dos columnas de fecha son
        // las del aseo del que colgo la compra, y la que le importa a quien la
        // hizo es el dia en que la hizo.
        fecha: fila.fecha_ejecucion,
        monto: fila.monto,
        recibo:
          fila.evidencia_bucket && fila.evidencia_path
            ? { bucket: fila.evidencia_bucket, ruta: fila.evidencia_path }
            : null,
      })),
  };
}
