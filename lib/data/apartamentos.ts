import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Tables } from '@/lib/database.types';

/**
 * Lecturas tipadas del catalogo de apartamentos para los RSC del admin
 * (APTO-11, APTO-01) y para el formulario de edicion (plan 02-12).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ESTE MODULO NO LEE NI UN SOLO SECRETO, Y ESO ES LO QUE LO HACE SEGURO.
 *
 * Las dos credenciales del apartamento (el codigo de la cerradura y la URL de
 * exportacion del calendario) viven en `public.property_secrets`, una tabla
 * SIN NINGUN GRANT para `authenticated`. Medido en 02-RESEARCH §8.6: un select
 * sobre esa tabla devuelve `42501 permission denied` incluso con el JWT de un
 * admin, aunque exista una policy `secrets_admin_all` que sugiera lo contrario.
 * La policy es inalcanzable porque la migracion 07 nunca otorgo privilegios de
 * tabla ahi (`-- Sin ningun grant -> property_secrets, ...`).
 *
 * Consecuencia practica: cualquier funcion que necesite esos dos valores tiene
 * que vivir en una Server Action con el cliente de servicio y su guard delante.
 * Esa funcion es `leerSecretos` en `app/(admin)/apartamentos/_actions.ts`, y
 * NO se toca desde aqui: este modulo lo importan RSC de listado, y un RSC que
 * pueda leer un secreto es un secreto a un `console.log` de distancia.
 *
 * Hay ademas un guardarrail: la tarea 1 del plan 02-10 verifica con `grep` que
 * los nombres de esas dos columnas no aparezcan en este archivo. Por eso el
 * texto de arriba las describe en vez de nombrarlas.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * ESTA FASE NO CREA NINGUNA FUNCION EN `public`. Todo va por PostgREST con el
 * JWT del usuario y RLS. La razon esta medida dos veces (hallazgo 5 de
 * `deferred-items.md`): en PG 17.6 `alter default privileges` NO puede quitarle
 * `EXECUTE` a PUBLIC, asi que una funcion nueva de `public` nace ejecutable por
 * `anon` salvo que se revoque explicitamente pegado a la definicion.
 *
 * NADA DE CACHE. Ni el helper de cache de Next ni la directiva de cache de
 * React: son datos por usuario y una entrada compartida se le sirve a otro.
 * Con 39 apartamentos y ~8 aseadores no hay beneficio que lo justifique.
 *
 * EL CLIENTE LLEGA POR PARAMETRO, igual que en `lib/data/aseadores.ts`: asi la
 * misma funcion sirve a un RSC (con el JWT del admin, filtrada por
 * `properties_admin_all`) y a un test de integracion con el JWT que se quiera
 * probar. Construirlo dentro ataria el modulo a `next/headers`.
 */

/** Las columnas de la tabla de UI-SPEC §7.1, mas los dos derivados que pinta. */
export type ApartamentoDeLista = Pick<
  Tables<'properties'>,
  | 'id'
  | 'nombre'
  | 'cluster'
  | 'gestion_vivaguest'
  | 'is_active'
  | 'tarifa_huesped'
  | 'pago_aseador'
  | 'responsable_id'
  | 'contacto_externo'
> & {
  /**
   * Columna 6 de §7.1. `null` cuando no hay responsable, y tambien cuando el
   * `responsable_id` apunta a un perfil que la RLS no deja ver: son casos
   * distintos para la base y el mismo em dash en pantalla.
   */
  responsableNombre: string | null;
  /**
   * Columna 7 de §7.1: `CalendarCheck` / `CalendarX`. Es la EXISTENCIA de un
   * feed activo, nunca su URL. La URL es una credencial y no sale de
   * `property_secrets`; `calendar_feeds` guarda solo la salud del feed.
   */
  tieneCalendario: boolean;
};

/** Lo que devuelve `leerApartamento`: la fila y sus dos colecciones hijas. */
export interface ApartamentoCompleto {
  propiedad: Tables<'properties'>;
  cuartos: Tables<'property_rooms'>[];
  faltantes: Tables<'missing_item_catalog'>[];
}

/** Un aseador tal como lo consumen los dos `Select` de UI-SPEC §8.3. */
export interface AseadorElegible {
  id: string;
  full_name: string;
  is_active: boolean;
}

/**
 * Las 39 filas del catalogo con lo que la tabla de §7.1 necesita.
 *
 * TRES consultas y no un embed profundo. `properties` no puede traer el nombre
 * del responsable por embed sin exponer el resto de `profiles` a la forma de la
 * respuesta, y `calendar_feeds` embebido arrastraria columnas de salud que la
 * tabla no pinta. Son 39 filas y ~8 perfiles: cruzar en memoria es una ida a la
 * base por coleccion en vez de N.
 */
export async function listarApartamentos(
  supabase: SupabaseClient<Database>,
): Promise<ApartamentoDeLista[]> {
  const { data: propiedades, error: errorPropiedades } = await supabase
    .from('properties')
    .select(
      'id, nombre, cluster, gestion_vivaguest, is_active, tarifa_huesped, pago_aseador, responsable_id, contacto_externo',
    )
    .order('nombre', { ascending: true });

  if (errorPropiedades) throw new Error(errorPropiedades.message);

  // Activos E INACTIVOS: si el responsable de un apartamento quedo desactivado,
  // su nombre tiene que seguir apareciendo en la columna RESPONSABLE. Filtrar
  // aqui convertiria esa celda en un em dash y el admin perderia el dato sin
  // que nada se lo diga.
  const { data: perfiles, error: errorPerfiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'aseador');

  if (errorPerfiles) throw new Error(errorPerfiles.message);

  // Solo la existencia del feed. `is_active` distingue un calendario conectado
  // de uno que se desconecto: la fila sobrevive con su historial de salud.
  const { data: feeds, error: errorFeeds } = await supabase
    .from('calendar_feeds')
    .select('property_id')
    .eq('is_active', true);

  if (errorFeeds) throw new Error(errorFeeds.message);

  const nombrePorId = new Map((perfiles ?? []).map((p) => [p.id, p.full_name]));
  const conFeed = new Set((feeds ?? []).map((f) => f.property_id));

  return (propiedades ?? []).map((p) => ({
    ...p,
    responsableNombre: p.responsable_id ? (nombrePorId.get(p.responsable_id) ?? null) : null,
    tieneCalendario: conFeed.has(p.id),
  }));
}

/**
 * Un apartamento con sus cuartos y su catalogo propio de faltantes, para el
 * formulario de UI-SPEC §8.1 (secciones 1, 2, 3 y 5).
 *
 * `null` cuando no existe o cuando la RLS no lo deja ver. Los dos casos dan lo
 * mismo a proposito: distinguirlos le diria a quien pregunta que el id existe.
 *
 * NO trae los secretos de la seccion 4 del formulario. Esos exigen el cliente
 * de servicio y viajan por `leerSecretos` en `_actions.ts`, con guard propio.
 */
export async function leerApartamento(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<ApartamentoCompleto | null> {
  const { data: propiedad, error: errorPropiedad } = await supabase
    .from('properties')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (errorPropiedad) throw new Error(errorPropiedad.message);
  if (!propiedad) return null;

  // Solo los cuartos activos: son los que el formulario pinta como filas
  // editables.
  //
  // TRAMPA PARA EL PLAN 02-12, medida en la migracion 03: el constraint
  // `property_rooms_etiqueta_uniq` es un UNIQUE SIMPLE `(property_id, etiqueta)`
  // y NO un indice parcial sobre `is_active`. Un cuarto desactivado sigue
  // reservando su etiqueta aunque no se vea. Si el formulario valida el
  // duplicado solo contra esta lista, re-anadir 'Bano social' pasara la
  // validacion de cliente y morira con un 23505 sobre una fila invisible.
  // `mapDbError` lo traduce, pero el admin no va a entender por que.
  const { data: cuartos, error: errorCuartos } = await supabase
    .from('property_rooms')
    .select('*')
    .eq('property_id', id)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (errorCuartos) throw new Error(errorCuartos.message);

  // El catalogo PROPIO del apartamento, no los globales. `mic_global_uniq` y
  // `mic_prop_uniq` son dos indices parciales distintos: los items con
  // `property_id is null` son la biblioteca compartida y no se editan desde el
  // formulario de un apartamento.
  //
  // Aqui NO se filtra por `is_active`, al reves que en los cuartos, y la razon
  // es la misma trampa de arriba vista desde el otro lado: `mic_prop_uniq`
  // tampoco excluye los inactivos, asi que devolverlos todos es lo que permite
  // que el formulario reactive un item en vez de chocar con su duplicado.
  const { data: faltantes, error: errorFaltantes } = await supabase
    .from('missing_item_catalog')
    .select('*')
    .eq('property_id', id)
    .order('sort_order', { ascending: true })
    .order('nombre', { ascending: true });

  if (errorFaltantes) throw new Error(errorFaltantes.message);

  return {
    propiedad,
    cuartos: cuartos ?? [],
    faltantes: faltantes ?? [],
  };
}

/**
 * Los clusters distintos, derivados de lo YA CARGADO. Funcion pura: no vuelve a
 * la base porque `properties.cluster` es `text not null` y no existe ninguna
 * tabla de clusters que consultar.
 *
 * El `trim` no es cosmetico. El combobox de UI-SPEC §8.1 admite entrada libre,
 * asi que un espacio de mas al final crea un cluster nuevo en silencio y el
 * filtro de la tabla pasa a tener nueve opciones donde el admin ve ocho. La
 * normalizacion aqui es la mitad de la mitigacion que pide 02-RESEARCH §8.8; la
 * otra mitad es sugerir coincidencias de los existentes, y le toca al 02-12.
 *
 * El orden va por `localeCompare` con `es-CO`: un `sort()` a secas compara
 * puntos de codigo UTF-16 y manda 'Bogota' despues de 'Zipaquira'.
 */
export function listarClusters(filas: ApartamentoDeLista[]): string[] {
  const distintos = new Set<string>();

  for (const fila of filas) {
    const cluster = fila.cluster.trim();
    // Un cluster que solo tenia espacios queda vacio: seria una opcion en
    // blanco, invisible y seleccionable, en el filtro y en el combobox.
    if (cluster.length > 0) distintos.add(cluster);
  }

  // Se ordena el array NUEVO del Set, no `filas`: `filas` es la misma lista que
  // pinta la tabla y reordenarla por debajo cambiaria el orden en pantalla.
  return [...distintos].sort((a, b) => a.localeCompare(b, 'es-CO'));
}

/**
 * Los aseadores que pueden ocupar `responsable_id` y `suplente_id`.
 *
 * DEVUELVE TAMBIEN LOS INACTIVOS, con su bandera, pese al nombre. No es un
 * descuido: lo exige UI-SPEC §8.3. Si el responsable actual de un apartamento
 * quedo desactivado, el `Select` tiene que seguir mostrandolo, marcado
 * `(inactivo)`, para no borrar el dato en silencio al primer guardado. Un
 * filtro `is_active` aqui haria esa regla imposible de implementar aguas abajo,
 * porque el componente ya no tendria el nombre que pintar.
 *
 * Quien solo quiera los elegibles filtra por `is_active` en la capa de UI, que
 * es donde la regla tiene contexto.
 */
export async function listarAseadoresActivos(
  supabase: SupabaseClient<Database>,
): Promise<AseadorElegible[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, is_active')
    .eq('role', 'aseador')
    .order('full_name', { ascending: true });

  if (error) throw new Error(error.message);

  return data ?? [];
}
