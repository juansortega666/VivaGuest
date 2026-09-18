import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Tables } from '@/lib/database.types';
import { hoyBog } from '@/lib/domain/dates';

/**
 * LA LECTURA DEL PANEL DE APARTAMENTO Y DE SU VISTA DE CALENDARIO
 * (08-UI-SPEC §7 y §8).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ALCANCE DECLARADO DESDE YA, PARA QUE NO NAZCA UN SEGUNDO ARCHIVO.
 *
 * Hoy este modulo tiene una sola funcion: el proximo aseo del apartamento
 * abierto. El plan 08-10 lo AMPLIA con los checkouts del mes y la salud del
 * feed, que son el contenido de la vista de calendario del mismo panel (§8.2).
 * Son lecturas del mismo sujeto y de la misma superficie, asi que viven juntas.
 * Crear `panel-calendario.ts` aparte dejaria dos archivos que hay que leer a la
 * vez para entender una pantalla.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * ── ESTA LECTURA SOLO OCURRE CUANDO EL PANEL ESTA ABIERTO ────────────────
 *
 * El presupuesto de `/apartamentos` pasa de 4 consultas a 5, y solo cuando la
 * direccion trae el parametro del panel. Quien llama tiene esa condicion; este
 * modulo no la puede imponer y no la finge.
 *
 * ── PROYECCION ENUMERADA, POR LA MISMA REGLA QUE `lib/data/apartamentos.ts` ─
 *
 * La migracion 24 dejo `cleanings` con grant POR COLUMNA: `tarifa_huesped` y
 * `pago_aseador` del aseo salieron del grant para cerrar la fuga de D7-7. Una
 * proyeccion de comodin sobre esa tabla no solo trae de mas: falla entera con
 * `42501`, porque el asterisco exige privilegio sobre TODAS las columnas. Las
 * columnas van enumeradas a mano, aqui y en cualquier lectura que se anada.
 *
 * ── EL CLIENTE LLEGA POR PARAMETRO ──────────────────────────────────────
 *
 * Misma razon que en `lib/data/apartamentos.ts` y `lib/data/operacion.ts`: asi
 * la misma funcion sirve a un RSC con el JWT del admin y a un test de
 * integracion con el JWT que se quiera probar.
 */

/** El aseador que hace el proximo aseo. `null` cuando no hay nadie asignado. */
export interface AseadorDelProximoAseo {
  id: string;
  full_name: string;
}

/**
 * El proximo aseo de un apartamento, tal como lo pinta el grupo `PRÓXIMO ASEO`
 * de §7.2.
 *
 * Las tres columnas de estado (`is_managed`, `state`, `confirmado_at`) son
 * exactamente la entrada de `estadoDeAseo()`: el panel NO reimplementa la
 * derivacion, la llama. Por eso se traen las tres y no una etiqueta ya cocida.
 */
export type ProximoAseo = Pick<
  Tables<'cleanings'>,
  'id' | 'scheduled_date' | 'is_managed' | 'state' | 'confirmado_at'
> & {
  aseador: AseadorDelProximoAseo | null;
};

/**
 * El `select` del proximo aseo.
 *
 * ── EL ALIAS DE CLAVE FORANEA NO ES OPCIONAL ────────────────────────────
 *
 * `cleanings` tiene DOS claves foraneas hacia `profiles`,
 * `cleanings_aseador_id_fkey` (el asignado) y `cleanings_confirmado_by_fkey`
 * (quien confirmo). Un embed `profiles(...)` sin calificar es AMBIGUO y
 * PostgREST responde `PGRST201`. Y `tsc` NO lo atrapa: `lib/database.types.ts`
 * tipa el embed pero no valida la ambiguedad, asi que el fallo aparece en el
 * primer render y no al compilar. Es la misma trampa que documenta
 * `SELECT_OPERACION` y se resuelve igual.
 */
const SELECT_PROXIMO_ASEO = `
  id, scheduled_date, is_managed, state, confirmado_at,
  aseador:profiles!cleanings_aseador_id_fkey ( id, full_name )
`;

/**
 * El aseo mas cercano de un apartamento de hoy en adelante, o `null`.
 *
 * ── EL LIMITE SALE DEL DIA DE NEGOCIO, NUNCA DE LA FECHA DEL PROCESO ────
 *
 * `hoyBog()` y no `new Date().toISOString().slice(0,10)`. Vercel y el CI corren
 * en UTC, asi que pasadas las 19:00 de Bogota el segundo ya devuelve MANANA: el
 * aseo de esta noche desapareceria del panel durante las cinco horas en que
 * nadie lo esta mirando para descubrirlo. Es la misma regla que sostiene la
 * ventana de `leerOperacion()`.
 *
 * ── LOS CANCELADOS SE EXCLUYEN, Y EL `or` NO ES ADORNO ──────────────────
 *
 * Un aseo cancelado no es el proximo aseo de nadie. Pero `.neq('state',
 * 'cancelada')` a secas DESCARTA TAMBIEN LOS NULOS, y una unidad de gestion
 * externa llega con `state` nulo por `cl_unmanaged_is_inert`: con el `neq`
 * pelado, las cinco informativas no tendrian nunca proximo aseo y el panel
 * mentiria sin que nada fallara. De ahi el `or` con `state.is.null`, que es la
 * incomodidad que la regla transversal del proyecto evita en SQL con
 * `is distinct from`.
 *
 * ── UNA FILA, NO UNA LISTA QUE SE RECORTA EN MEMORIA ────────────────────
 *
 * `limit(1)` con el orden puesto: el trabajo lo hace Postgres. Traer los aseos
 * del apartamento para quedarse con el primero seria pedir decenas de filas
 * para pintar una.
 *
 * `maybeSingle()` y no `single()`: un apartamento sin aseos programados es el
 * caso NORMAL de §7.2 (`No tiene ningún aseo programado.`), no un error.
 */
export async function leerProximoAseo(
  supabase: SupabaseClient<Database>,
  apartamentoId: string,
): Promise<ProximoAseo | null> {
  const { data, error } = await supabase
    .from('cleanings')
    .select(SELECT_PROXIMO_ASEO)
    .eq('property_id', apartamentoId)
    .gte('scheduled_date', hoyBog())
    .or('state.is.null,state.neq.cancelada')
    .order('scheduled_date', { ascending: true })
    // Desempate estable dentro del dia: `scheduled_date` no es unico por
    // apartamento mientras el indice parcial de unicidad solo cubre los aseos
    // no cancelados. Sin este segundo orden, dos aseos del mismo dia saldrian
    // en orden arbitrario y el panel enseñaria uno u otro entre dos cargas.
    .order('hora_limite', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return (data ?? null) as ProximoAseo | null;
}
