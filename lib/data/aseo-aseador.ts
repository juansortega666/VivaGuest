import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Tables } from '@/lib/database.types';
import type { FilaDeChecklist, FilaDeSkip } from '@/lib/domain/checklist';

/**
 * LA CAPA DE LECTURA DE `/aseos/[id]`, LA PANTALLA A LA QUE ATERRIZA EL AVISO
 * (NOTIF-01, criterio 2 del ROADMAP).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * EL CLIENTE LLEGA POR PARAMETRO, como en todo `lib/data/`. Asi la misma
 * funcion sirve a un componente de servidor con el JWT del aseador y a un test
 * con el JWT que se quiera probar. Construirlo dentro ataria el modulo a
 * `next/headers`.
 *
 * SIN LOGICA DE AUTORIZACION PROPIA. La frontera es la RLS: la policy
 * `cleanings_cleaner_select` de la migracion 08 ya acota la consulta a los aseos
 * cuya `aseador_id` es la del que pregunta, y `properties_cleaner_select` recorta
 * el embed. Una segunda comprobacion en TypeScript no anadiria ninguna garantia
 * y si crearia un sitio mas donde equivocarse, ademas de poder DISCREPAR de la
 * policy el dia que una de las dos cambie.
 *
 * NINGUNA COLUMNA DE CREDENCIALES. El `select` de abajo es explicito y no lleva
 * `*`. Las dos credenciales del apartamento (el codigo de la cerradura y la URL
 * de exportacion del calendario) viven en otra tabla que no tiene NINGUN grant
 * para `authenticated`, asi que pedirlas desde aqui no devolveria el dato:
 * devolveria `42501` y tumbaria la pantalla entera. La unica ruta al codigo es
 * el RPC `reveal_access_code`, y esta capa ni siquiera nombra esa tabla.
 * `scripts/ci/check-service-role.sh` lo impone por grep.
 *
 * NADA DE CACHE, misma regla que el resto de `lib/data/`: son datos por usuario
 * y una entrada compartida se le sirve a otro.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** El apartamento tal como lo pinta la cabecera de la ficha (UI-SPEC §9.2). */
export interface ApartamentoDelAseo {
  id: string;
  nombre: string;
  cluster: string;
  hora_limite: string;
}

/**
 * El aseo tal como lo pinta la ficha, con su apartamento resuelto.
 *
 * Es un `Pick` y no la fila entera: `pago_aseador`, `tarifa_huesped`,
 * `reservation_id` y las marcas de tiempo de ejecucion NO se pintan en esta
 * pantalla, y la de dinero ademas no tiene por que viajar al telefono del
 * aseador. `confirmado_at` si entra, aunque no se muestre, porque es lo que
 * `estadoDeAseo()` necesita para separar `Sin confirmar` de `Pendiente`.
 */
export type AseoDelAseador = Pick<
  Tables<'cleanings'>,
  | 'id'
  | 'scheduled_date'
  | 'hora_limite'
  | 'num_huespedes'
  | 'instrucciones'
  | 'state'
  | 'is_managed'
  | 'confirmado_at'
> & {
  property: ApartamentoDelAseo | null;
  /** Las tareas del checklist materializado. Vacio si el aseo no se confirmo. */
  checklist: FilaDeChecklist[];
  /** Los cuartos cuya evidencia se salto, con su motivo. */
  skips: FilaDeSkip[];
};

/**
 * El embed va CALIFICADO con el nombre de la clave foranea a proposito.
 * `cleanings` tiene dos claves hacia `profiles` y una hacia `properties`; un
 * `properties(...)` sin calificar es ambiguo para PostgREST en cuanto aparezca
 * una segunda, y el fallo (`PGRST201`) llega en tiempo de ejecucion, no de
 * compilacion. Mismo criterio que `SELECT_OPERACION`.
 */
const SELECT_ASEO = `
  id, scheduled_date, hora_limite, num_huespedes, instrucciones,
  state, is_managed, confirmado_at,
  property:properties!cleanings_property_id_fkey (
    id, nombre, cluster, hora_limite
  ),
  checklist:cleaning_checklist_items!cleaning_checklist_items_cleaning_id_fkey (
    id, property_room_id, room_label, task_label, requiere_foto, sort_order, done_at
  ),
  skips:cleaning_room_skips!cleaning_room_skips_cleaning_id_fkey (
    property_room_id, room_label, motivo, nota
  )
`;

/**
 * LAS DOS COLECCIONES HIJAS VIAJAN EN LA MISMA CONSULTA, Y ES UNA DECISION.
 *
 * PostgREST las trae por embed en un solo viaje, asi que la alternativa
 * —tres consultas en paralelo— seria mas codigo para el mismo resultado y
 * ademas abriria la puerta a que las tres vean estados distintos de la base si
 * alguien marca algo justo en medio.
 *
 * ── EL EMBED VA CALIFICADO, MISMO CRITERIO QUE EL DEL APARTAMENTO ──────────
 *
 * Hoy hay una sola clave foranea de cada hija hacia `cleanings`, asi que sin
 * calificar tambien funcionaria. Se califica igual porque el dia que aparezca
 * una segunda —por ejemplo una columna de "aseo que reemplazo a este"—
 * PostgREST responde `PGRST201` EN TIEMPO DE EJECUCION, no de compilacion, y el
 * sintoma seria la pantalla del aseador caida en produccion.
 *
 * ── LAS DOS SON DE SOLO LECTURA POR CONSTRUCCION ───────────────────────────
 *
 * `authenticated` tiene UNICAMENTE `select` sobre las dos tablas (migraciones 07
 * y 18). Marcar una tarea o saltar un cuarto pasa forzosamente por un RPC
 * `security definer`, que es donde vive la autorizacion. O sea que esta capa no
 * puede escribir ni por accidente.
 *
 * ── UN ASEO SIN CONFIRMAR LLEGA CON EL CHECKLIST VACIO, Y NO ES UN ERROR ───
 *
 * `confirm_cleaning` es quien materializa las filas (migracion 04). Antes de eso
 * no existen, y la pantalla tiene que saber decirlo: es el mismo vacio que un
 * apartamento sin cuartos configurados, y se trata igual.
 */

/**
 * La forma de un identificador de la base, comprobada ANTES de la consulta.
 *
 * El identificador llega del segmento dinamico de la URL, o sea de fuera: la
 * migracion 09 escribe `notifications.url = '/aseos/' || cleaning_id`, pero nada
 * impide que alguien teclee cualquier cosa. Sin esta guarda, PostgREST responde
 * `22P02 invalid input syntax for type uuid` y la pantalla se cae con un error
 * de servidor en vez de con su estado vacio.
 */
const FORMA_DE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lee el aseo al que aterriza el aviso, o `null`.
 *
 * ── LOS CUATRO CASOS QUE DEVUELVEN `null` SON EL MISMO CASO ────────────────
 *
 * La pantalla los trata igual a proposito (UI-SPEC §15.1): distinguirlos seria
 * un oraculo de enumeracion de aseos ajenos, la misma razon por la que el RPC
 * del codigo lanza un unico `42501` para sus tres denegaciones.
 *
 *   1. el identificador no tiene forma de identificador -> ni se consulta
 *   2. no hay fila: no existe, o es de otra persona y la RLS devolvio cero
 *   3. el aseo esta cancelado
 *   4. el apartamento no vino en el embed
 *
 * EL CASO 3 NO SE VE LEYENDO LA POLICY POR ENCIMA, y por eso esta escrito aqui:
 * `cleanings_cleaner_select` es `is_active_cleaner() and aseador_id = auth.uid()`
 * y NO filtra por estado, asi que un aseo cancelado que conserva a esta persona
 * como aseadora SIGUE SIENDO VISIBLE. El helper `private.my_cleaning_ids()` si
 * excluye `cancelada` —"un aseo cancelado ya no es suyo", dice la migracion 08—
 * pero ese helper gobierna fotos y checklists, no la tabla de aseos. Sin el
 * descarte de aqui, un aviso enviado antes de la cancelacion aterrizaria en la
 * ficha de un trabajo que ya no existe.
 *
 * EL CASO 4 TAMBIEN PASA DE VERDAD: `properties_cleaner_select` acota el embed a
 * `private.my_property_ids()`, que es una ventana de hoy-1 a hoy+7 sobre aseos
 * vivos. Un aseo visible fuera de esa ventana llega con `property` en nulo, y
 * una ficha sin nombre de apartamento no es una ficha: es una pantalla con
 * huecos que el aseador no sabe leer.
 *
 * UN ERROR DE VERDAD SI LANZA. Un fallo de conexion no es "este aseo no existe":
 * devolver `null` ahi pintaria el estado vacio y le diria al aseador que su
 * trabajo se cancelo.
 */
export async function leerAseoDelAseador(
  supabase: SupabaseClient<Database>,
  aseoId: string,
): Promise<AseoDelAseador | null> {
  if (!FORMA_DE_ID.test(aseoId)) return null;

  const { data, error } = await supabase
    .from('cleanings')
    .select(SELECT_ASEO)
    .eq('id', aseoId)
    .maybeSingle<AseoDelAseador>();

  if (error) throw new Error(error.message);
  if (!data) return null;
  if (data.state === 'cancelada') return null;
  if (data.property === null) return null;

  // Los embed a-muchos llegan como arreglo, pero un embed ausente llega nulo, y
  // el modulo de dominio recorre. Se normaliza AQUI y no en el componente para
  // que ningun consumidor tenga que acordarse.
  return {
    ...data,
    checklist: data.checklist ?? [],
    skips: data.skips ?? [],
  };
}
