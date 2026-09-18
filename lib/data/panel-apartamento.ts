import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Tables } from '@/lib/database.types';
import { hoyBog, primeroDelMes, ultimoDiaDelMes } from '@/lib/domain/dates';

/**
 * El feed del apartamento se lee con la funcion que YA EXISTE, y se reexporta
 * desde aqui para que la vista de calendario tenga un solo sitio de importacion.
 *
 * `leerFeedDeApartamento()` devuelve `null` en DOS casos distintos —el
 * apartamento no tiene calendario, y la seguridad a nivel de fila no lo deja
 * ver— y la pantalla trata los dos igual, que es "no hay calendario conectado".
 * Escribir aqui una segunda consulta sobre `calendar_feeds` seria una segunda
 * definicion de la misma lectura, con su propia lista de columnas que se
 * quedaria atras el dia que la salud del feed gane una.
 */
export { leerFeedDeApartamento, type FeedDeApartamento } from '@/lib/data/feeds';

/**
 * LA LECTURA DEL PANEL DE APARTAMENTO Y DE SU VISTA DE CALENDARIO
 * (08-UI-SPEC §7 y §8).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ALCANCE COMPLETO: LAS DOS VISTAS DEL MISMO PANEL, EN UN SOLO ARCHIVO.
 *
 * El plan 08-06 dejo aqui el proximo aseo y declaro el alcance que faltaba; el
 * plan 08-10 lo lleno con los checkouts del mes y el feed del apartamento, que
 * son el contenido de la vista de calendario del MISMO panel (§8.2). Son
 * lecturas del mismo sujeto y de la misma superficie, asi que viven juntas.
 * Crear `panel-calendario.ts` aparte dejaria dos archivos que hay que leer a la
 * vez para entender una pantalla.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * ── CADA LECTURA SOLO OCURRE CUANDO SU VISTA ESTA PEDIDA ─────────────────
 *
 * El presupuesto de `/apartamentos`, medido en consultas:
 *
 *     sin panel                    4
 *     panel en la ficha            5   (+ el proximo aseo)
 *     panel en el calendario       6   (+ los checkouts del mes y el feed)
 *
 * Las dos ramas son EXCLUYENTES: con la vista de calendario pedida, el proximo
 * aseo NO se lee, porque ese cuerpo no lo pinta. Quien llama tiene la condicion;
 * este modulo no la puede imponer y no la finge.
 *
 * ── NINGUNA DE LAS TRES NECESITA UNA FUNCION NUEVA EN `public` ───────────
 *
 * `calendar_reservations` tiene `select` para `authenticated` desde la migracion
 * 07 y su policy de admin desde la 08, y el indice `cal_res_prop_end_idx` de la
 * migracion 04 esta hecho para esta consulta exacta: por apartamento y por fecha
 * de fin, acotado a las reservas que siguen en el feed.
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


/**
 * Los checkouts de un mes calendario de un apartamento, como fechas de negocio
 * `'YYYY-MM-DD'` y ordenadas (§8.2, grupos 1 y 2).
 *
 * ── LA FECHA DE FIN **ES** EL CHECKOUT, Y NO SE LE RESTA UN DIA ─────────
 *
 * El comentario de esa columna en la migracion 04 lo fija literal: *"DTEND del
 * VEVENT de dia completo. Es EXCLUSIVO: coincide con la fecha del aseo. No
 * restar un dia."* El reflejo de quien lee un calendario es corregir ese
 * "exclusivo"; corregirlo programa todos los aseos con 24 horas de adelanto.
 *
 * ── PROYECCION DE UNA SOLA COLUMNA, Y HAY OTRA QUE NO PUEDE ENTRAR ──────
 *
 * El panel pinta fechas, asi que la proyeccion es la fecha de fin y nada mas.
 * Esa tabla guarda ademas un campo de TEXTO LIBRE que llega tal cual del
 * proveedor dentro de cada evento reservado, y que arrastra los ultimos digitos
 * del telefono del huesped: es dato personal, la decision bloqueada de
 * 03-CONTEXT.md es que no se persiste, y el guardarrail 9 de
 * `scripts/ci/check-service-role.sh` rompe el build si CUALQUIER archivo de
 * aplicacion lo nombra. Por eso aqui se describe y no se teclea, ni siquiera en
 * este comentario (§14.6 punto 2, la trampa que ya mordio cuatro veces).
 *
 * ── SE FILTRAN LAS RESERVAS QUE YA NO ESTAN EN EL FEED ──────────────────
 *
 * Una reserva que desaparece del feed se MARCA, no se borra (anti-patron 4 de
 * ARCHITECTURE.md): el feed puede venir vacio por un fallo del proveedor. Sin
 * este filtro el panel enseñaria como checkout vigente algo que el calendario
 * ya cancelo. Es exactamente lo que el indice parcial `cal_res_prop_end_idx`
 * hace, asi que el filtro ademas deja la consulta dentro del indice.
 *
 * ── AQUI NO SE DERIVA NADA ──────────────────────────────────────────────
 *
 * Devuelve las fechas crudas. El proximo checkout, la lista del mes y la
 * distancia en dias salen de `lib/domain/checkouts.ts`, que tiene sus 19 casos
 * unitarios. Derivar aqui seria sacar la regla del unico sitio donde se mide.
 *
 * NO DEDUPLICA, por lo mismo que `checkoutsDelMes()`: dos reservas que terminen
 * el mismo dia son dos checkouts el mismo dia.
 */
export async function leerCheckoutsDelMes(
  supabase: SupabaseClient<Database>,
  apartamentoId: string,
  /** El mes corriente, en la forma `'YYYY-MM'`. */
  mes: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('calendar_reservations')
    .select('ends_on')
    .eq('property_id', apartamentoId)
    // Los extremos salen de los dos helpers de `lib/domain/dates.ts`, que ya
    // resuelven el ultimo dia sin tabla de longitudes de mes: la tabla es
    // justamente donde falla febrero.
    .gte('ends_on', primeroDelMes(mes))
    .lte('ends_on', ultimoDiaDelMes(mes))
    .is('disappeared_at', null)
    .order('ends_on', { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((fila) => fila.ends_on);
}
