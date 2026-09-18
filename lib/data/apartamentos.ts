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
 * ────────────────────────────────────────────────────────────────────────────
 * ESTE MODULO YA NO PIDE LAS DOS CIFRAS DE DINERO POR PostgREST (migracion 24).
 *
 * `properties.tarifa_huesped` y `properties.pago_aseador` SALIERON del grant de
 * columna de `authenticated` para cerrar la fuga medida de D7-7: admin y
 * aseador comparten el mismo rol de Postgres, asi que un grant por columna no
 * puede decir "solo el admin". Pedirlas por nombre aqui devuelve `42501`, y
 * pedirlas con un comodin tambien, porque un `select *` exige privilegio sobre
 * TODAS las columnas de la tabla.
 *
 * El admin las recupera por `public.tarifas_de_apartamentos(uuid[])`, una
 * funcion `security definer` cuya PRIMERA sentencia es la guarda de rol. Es el
 * mismo camino que ya recorrieron `property_secrets` y
 * `estado_avisos_aseadores()`.
 *
 * CONSECUENCIA PRACTICA, Y HAY QUE RESPETARLA: en este archivo NO PUEDE HABER
 * NI UNA SOLA proyeccion de comodin, sobre ninguna tabla. Con grants por
 * columna, pedir el asterisco es una bomba de relojeria que estalla la proxima
 * vez que alguien anada una columna sensible. Las listas de columnas van
 * enumeradas a mano, y una columna nueva de `properties` hay que anadirla AQUI
 * y al grant de la migracion 24, o nacera invisible para la aplicacion.
 *
 * El criterio de aceptacion del plan 07-05 lo verifica con un `grep` que cuenta
 * proyecciones de comodin en este archivo y exige cero. Por eso el texto de
 * arriba DESCRIBE el patron en vez de escribirlo: citarlo literalmente haria
 * que el guardarrail se atrapase a si mismo. Misma regla que
 * `scripts/ci/check-service-role.sh` dejo escrita en la Fase 1.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * EL CLIENTE LLEGA POR PARAMETRO, igual que en `lib/data/aseadores.ts`: asi la
 * misma funcion sirve a un RSC (con el JWT del admin, filtrada por
 * `properties_admin_all`) y a un test de integracion con el JWT que se quiera
 * probar. Construirlo dentro ataria el modulo a `next/headers`.
 */

/**
 * Las columnas de la tabla de UI-SPEC §7.1, mas las CUATRO que la ficha de
 * lectura del panel necesita (08-UI-SPEC §7.2), mas los derivados que pinta.
 *
 * ⚠ LAS CUATRO NUEVAS NO SON COLUMNAS NUEVAS DE LA TABLA, Y LA DIFERENCIA
 *   IMPORTA AL LEER EL DIFF. La advertencia de `COLUMNAS_DE_PROPIEDAD` dice que
 *   una columna NUEVA de `properties` hay que anadirla en dos sitios, el grant
 *   de la migracion 24 y la constante de aqui. Esa regla NO se dispara con este
 *   cambio: `direccion`, `maps_url`, `hora_limite` y `suplente_id` ya existen en
 *   la tabla y ya estan en el grant desde la migracion 24 (lineas 175-180). Lo
 *   unico que pasa es que esta lectura empieza a PEDIRLAS. No hay ninguna
 *   migracion que buscar.
 */
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
  // Las cuatro de §7.2 del panel. La tabla de la lista no las pinta.
  | 'direccion'
  | 'maps_url'
  | 'hora_limite'
  | 'suplente_id'
> & {
  /**
   * Columna 6 de §7.1. `null` cuando no hay responsable, y tambien cuando el
   * `responsable_id` apunta a un perfil que la RLS no deja ver: son casos
   * distintos para la base y el mismo em dash en pantalla.
   */
  responsableNombre: string | null;
  /**
   * Si el responsable sigue activo. `null` cuando no hay nombre que marcar.
   *
   * Lo pide 08-UI-SPEC §7.2: un responsable desactivado lleva `(inactivo)`
   * detras del nombre, que es la regla que fijo `02-UI-SPEC` §8.3 para el
   * formulario. Sale de la MISMA consulta de perfiles, que ya se hace.
   */
  responsableActivo: boolean | null;
  /**
   * El suplente, que la tabla de la lista no pinta y el panel si (§7.2).
   *
   * SALE DEL MISMO MAPA DE PERFILES QUE EL RESPONSABLE Y NO CUESTA NI UNA
   * CONSULTA MAS. La tentacion obvia es un segundo viaje a `profiles` filtrando
   * por los `suplente_id`; para 39 filas y ~8 perfiles seria un viaje regalado,
   * porque el mapa que resuelve al responsable ya trae a todos los aseadores.
   */
  suplenteNombre: string | null;
  /** Igual que `responsableActivo`, para el suplente. */
  suplenteActivo: boolean | null;
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

/** Un tipo de cuarto del catalogo global, para el `Select` de cada fila. */
export type TipoDeCuarto = Pick<Tables<'room_types'>, 'id' | 'nombre' | 'slug' | 'sort_order'>;

/** Un aseador tal como lo consumen los dos `Select` de UI-SPEC §8.3. */
export interface AseadorElegible {
  id: string;
  full_name: string;
  is_active: boolean;
}

/**
 * LAS DOS CIFRAS DE DINERO DE UN APARTAMENTO, tal como las devuelve la funcion
 * `public.tarifas_de_apartamentos(uuid[])` de la migracion 24.
 *
 * `number | null` y no `number`: el generador de tipos de Supabase no sabe
 * deducir nulabilidad de un `returns table`, asi que `lib/database.types.ts`
 * las declara `number` a secas. Y es MENTIRA: un apartamento en borrador las
 * tiene las dos en `null`, que es justo lo que lee `faltantesParaActivar`. Se
 * corrige aqui, en el unico sitio del repo que llama a esa funcion.
 */
export interface CifrasDeApartamento {
  tarifa_huesped: number | null;
  pago_aseador: number | null;
}

/** Una fila de la funcion de tarifas, ya con la nulabilidad corregida. */
export interface TarifaDeApartamento extends CifrasDeApartamento {
  property_id: string;
}

/**
 * Las 16 columnas de `public.properties` que `authenticated` puede leer, o sea
 * las 18 de la tabla MENOS las dos de dinero.
 *
 * ⚠ ESTA LISTA ES LA CONTRAPARTIDA DEL GRANT POR COLUMNA DE LA MIGRACION 24.
 *   Una columna nueva de `properties` hay que anadirla en los DOS sitios: al
 *   grant de esa migracion y a esta constante. Si falta en el grant, la
 *   consulta da `42501`; si falta aqui, la columna existe en la base y no llega
 *   nunca a la aplicacion.
 */
export const COLUMNAS_DE_PROPIEDAD = `
  id, nombre, cluster, direccion, maps_url, maps_lat, maps_lng, hora_limite,
  gestion_vivaguest, fee_discriminado, responsable_id, suplente_id,
  contacto_externo, is_active, created_at, updated_at
`;

/**
 * Lo que pinta la tabla de §7.1, sin las dos de dinero, MAS las cuatro que el
 * panel de lectura de 08-UI-SPEC §7.2 necesita: `direccion`, `maps_url`,
 * `hora_limite` y `suplente_id`.
 *
 * Las cuatro YA TIENEN GRANT desde la migracion 24 y ya estan en
 * `COLUMNAS_DE_PROPIEDAD`: aqui no se anade ninguna columna a la tabla, solo se
 * piden mas de las que la aplicacion ya puede leer. La regla de las dos listas
 * no se dispara.
 *
 * Y se piden EN LA MISMA CONSULTA de las 39 filas, no en una segunda lectura al
 * abrir el panel: cuatro columnas mas sobre 39 filas no se notan, y una lectura
 * por apertura si se nota cuando el admin abre veinte fichas seguidas.
 */
const COLUMNAS_DE_LISTA =
  'id, nombre, cluster, direccion, maps_url, hora_limite, gestion_vivaguest, is_active, responsable_id, suplente_id, contacto_externo';

/** Las columnas de `public.property_rooms`. Enumeradas por la misma regla. */
const COLUMNAS_DE_CUARTO = 'id, property_id, room_type_id, etiqueta, sort_order, is_active';

/** Las columnas de `public.missing_item_catalog`. Idem. */
const COLUMNAS_DE_FALTANTE = 'id, property_id, nombre, sort_order, is_active';

/**
 * Las dos cifras de dinero de los apartamentos pedidos, por la via del admin.
 *
 * Sin argumento devuelve el catalogo entero en UNA sola llamada: es lo que
 * evita el N+1 en el listado de 39. Con una lista, solo esos ids.
 *
 * NO ATRAPA EL `42501`. Si quien llama no es admin activo, la funcion levanta
 * y el error sube, igual que sube el de cualquier otra lectura de este modulo.
 * Tragarselo y devolver ceros pintaria tarifas falsas en la pantalla del admin,
 * que es peor que una pantalla de error.
 */
export async function leerTarifasDeApartamentos(
  supabase: SupabaseClient<Database>,
  ids?: string[],
): Promise<TarifaDeApartamento[]> {
  // Lista vacia explicita: no hay nada que preguntar, y mandar `[]` devolveria
  // cero filas tras una ida a la base. `undefined` NO es lo mismo que `[]` en
  // esta funcion: `undefined` significa "todos".
  if (ids?.length === 0) return [];

  const { data, error } = await supabase.rpc(
    'tarifas_de_apartamentos',
    ids ? { p_ids: ids } : {},
  );

  if (error) throw new Error(error.message);

  return (data ?? []) as TarifaDeApartamento[];
}

/**
 * Pega las dos cifras a cada fila, por identificador. Funcion PURA.
 *
 * Vive aparte y se exporta porque es la unica parte de la nueva composicion que
 * se puede probar sin base: los dobles de cliente de este repo no prueban nada
 * sobre grants (un doble no tiene privilegios y siempre acepta). Lo que si se
 * puede fijar con un test es que una fila SIN tarifa conocida salga con las dos
 * en `null` y no se caiga ni se invente un cero.
 */
export function fusionarTarifas<T extends { id: string }>(
  filas: T[],
  tarifas: TarifaDeApartamento[],
): (T & CifrasDeApartamento)[] {
  const porId = new Map(tarifas.map((t) => [t.property_id, t]));

  return filas.map((f) => {
    const cifras = porId.get(f.id);
    return {
      ...f,
      // `?? null` en las dos y no `cifras ?? {…}`: un apartamento que la funcion
      // no devolvio (borrado entre las dos consultas, o fuera de la lista) tiene
      // que salir con las cifras vacias, nunca con `undefined`, que romperia el
      // `ausente()` de `faltantesParaActivar` y pintaria un apartamento como
      // listo para activar sin estarlo.
      tarifa_huesped: cifras?.tarifa_huesped ?? null,
      pago_aseador: cifras?.pago_aseador ?? null,
    };
  });
}

/** Un aseador tal como lo necesita el cruce de asignaciones. */
export type PerfilAsignable = Pick<Tables<'profiles'>, 'id' | 'full_name' | 'is_active'>;

/** Lo que el cruce de asignaciones le pega a cada fila. */
export interface AsignacionesDeApartamento {
  responsableNombre: string | null;
  responsableActivo: boolean | null;
  suplenteNombre: string | null;
  suplenteActivo: boolean | null;
}

/**
 * Resuelve responsable y suplente contra UN SOLO mapa de perfiles. Funcion PURA.
 *
 * ── CERO CONSULTAS PARA EL SUPLENTE, Y ESA ES LA RAZON DE QUE EXISTA ────
 *
 * La tentacion obvia al anadir el suplente al panel (08-UI-SPEC §7.2) es un
 * segundo viaje a `profiles` filtrando por los `suplente_id`. Seria un viaje
 * regalado: el mapa que ya se construye para el responsable trae a TODOS los
 * aseadores, activos e inactivos, asi que el suplente ya esta ahi. Con 39 filas
 * y ~8 perfiles, la diferencia entre una consulta y dos es gratis de escribir y
 * cara de deshacer.
 *
 * Vive aparte y se exporta por la misma razon que `fusionarTarifas`: es la
 * parte de la composicion que se puede probar SIN base. Los dobles de cliente
 * de este repo no prueban nada sobre grants ni sobre que columnas llegan; lo
 * que si se puede fijar es que el suplente salga del mismo mapa, que una fila
 * sin suplente no reviente y que un perfil desactivado llegue marcado.
 */
export function fusionarAsignaciones<
  T extends { responsable_id: string | null; suplente_id: string | null },
>(filas: T[], perfiles: PerfilAsignable[]): (T & AsignacionesDeApartamento)[] {
  const porId = new Map(perfiles.map((p) => [p.id, { nombre: p.full_name, activo: p.is_active }]));

  // `null` cuando no hay asignacion, y tambien cuando el identificador apunta a
  // un perfil que la RLS no deja ver: son casos distintos para la base y el
  // mismo em dash en pantalla.
  const asignado = (id: string | null) => (id === null ? undefined : porId.get(id));

  return filas.map((fila) => {
    const responsable = asignado(fila.responsable_id);
    const suplente = asignado(fila.suplente_id);

    return {
      ...fila,
      responsableNombre: responsable?.nombre ?? null,
      responsableActivo: responsable?.activo ?? null,
      suplenteNombre: suplente?.nombre ?? null,
      suplenteActivo: suplente?.activo ?? null,
    };
  });
}

/**
 * Las 39 filas del catalogo con lo que la tabla de §7.1 necesita.
 *
 * CUATRO consultas y no un embed profundo. `properties` no puede traer el nombre
 * del responsable por embed sin exponer el resto de `profiles` a la forma de la
 * respuesta, y `calendar_feeds` embebido arrastraria columnas de salud que la
 * tabla no pinta. Son 39 filas y ~8 perfiles: cruzar en memoria es una ida a la
 * base por coleccion en vez de N.
 *
 * LA CUARTA es `tarifas_de_apartamentos`, y es de la migracion 24: las dos
 * cifras de dinero ya no vienen en el select de arriba porque salieron del
 * grant de columna. Va SIN argumento, o sea una sola llamada para las 39, y se
 * cruza en memoria igual que los perfiles y los feeds.
 *
 * ── EL PANEL DE LECTURA DE LA FASE 8 NO ANADIO NI UNA CONSULTA ────────────
 *
 * Ocho de los nueve datos de 08-UI-SPEC §7.2 salen de aqui: las cuatro columnas
 * que se anadieron al select (direccion, enlace a Maps, hora limite y suplente)
 * y el nombre del suplente, que se resuelve del MISMO mapa de perfiles que ya
 * resolvia al responsable. Siguen siendo CUATRO consultas. El unico dato que
 * cuesta un viaje nuevo es el proximo aseo, y vive en
 * `lib/data/panel-apartamento.ts` porque solo se pide cuando el panel se abre.
 */
export async function listarApartamentos(
  supabase: SupabaseClient<Database>,
): Promise<ApartamentoDeLista[]> {
  const { data: propiedades, error: errorPropiedades } = await supabase
    .from('properties')
    .select(COLUMNAS_DE_LISTA)
    .order('nombre', { ascending: true });

  if (errorPropiedades) throw new Error(errorPropiedades.message);

  // Activos E INACTIVOS: si el responsable de un apartamento quedo desactivado,
  // su nombre tiene que seguir apareciendo en la columna RESPONSABLE. Filtrar
  // aqui convertiria esa celda en un em dash y el admin perderia el dato sin
  // que nada se lo diga.
  const { data: perfiles, error: errorPerfiles } = await supabase
    .from('profiles')
    .select('id, full_name, is_active')
    .eq('role', 'aseador');

  if (errorPerfiles) throw new Error(errorPerfiles.message);

  // Solo la existencia del feed. `is_active` distingue un calendario conectado
  // de uno que se desconecto: la fila sobrevive con su historial de salud.
  const { data: feeds, error: errorFeeds } = await supabase
    .from('calendar_feeds')
    .select('property_id')
    .eq('is_active', true);

  if (errorFeeds) throw new Error(errorFeeds.message);

  // Las dos columnas que la migracion 24 saco del grant, por su via propia.
  const tarifas = await leerTarifasDeApartamentos(supabase);

  const conFeed = new Set((feeds ?? []).map((f) => f.property_id));

  // Las dos asignaciones salen del MISMO mapa de perfiles: ver
  // `fusionarAsignaciones`. El suplente no cuesta ni una consulta mas.
  return fusionarAsignaciones(
    fusionarTarifas(propiedades ?? [], tarifas),
    perfiles ?? [],
  ).map((p) => ({
    ...p,
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
 *
 * SI TRAE las dos cifras de dinero, que el formulario edita, pero ya no por la
 * tabla: van por `tarifas_de_apartamentos` con la lista de un solo id. La
 * proyeccion de comodin que habia aqui desaparecio con la migracion 24 y no
 * puede volver: con grants por columna, pedir el asterisco sobre `properties`
 * devuelve `42501`.
 */
export async function leerApartamento(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<ApartamentoCompleto | null> {
  const { data: fila, error: errorPropiedad } = await supabase
    .from('properties')
    .select(COLUMNAS_DE_PROPIEDAD)
    .eq('id', id)
    .maybeSingle();

  if (errorPropiedad) throw new Error(errorPropiedad.message);
  if (!fila) return null;

  // La fila completa que espera `ApartamentoCompleto` se recompone aqui: 16
  // columnas por PostgREST + las 2 de dinero por la funcion con guarda.
  const [propiedad] = fusionarTarifas(
    [fila],
    await leerTarifasDeApartamentos(supabase, [id]),
  );

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
    .select(COLUMNAS_DE_CUARTO)
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
    .select(COLUMNAS_DE_FALTANTE)
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

/**
 * El catalogo global de tipos de cuarto (`public.room_types`), para el `Select`
 * de cada fila del editor de cuartos de UI-SPEC §8.1 seccion 5 (APTO-06).
 *
 * SE LEE DE LA BASE, NO SE CODIFICA. La lista de 8 tipos que hoy siembra
 * `supabase/seeds/020_room_types.sql` es PROVISIONAL y su propio comentario lo
 * dice: la definitiva es un abierto de producto y es "editable en base de datos
 * sin migracion". Un array literal en el codigo convertiria ese abierto en un
 * deploy, y ademas se desincronizaria de `checklist_tasks`, que cuelga de estos
 * mismos ids con maximo 3 tareas por tipo y es de donde sale el checklist del
 * aseo en la Fase 6.
 *
 * NO FILTRA POR ACTIVOS, Y NO ES UN OLVIDO: `public.room_types` NO TIENE una
 * bandera de activacion. Sus cuatro columnas son `id`, `slug`, `nombre` y
 * `sort_order` (migracion 03; confirmado en `lib/database.types.ts`). Esa
 * bandera la tienen `checklist_tasks` y `property_rooms`, que son otras dos
 * tablas. Filtrar por una columna inexistente devuelve `42703` y dejaria el
 * `Select` de tipo vacio en TODAS las filas, con lo que no se podria crear ni un
 * solo cuarto.
 *
 * El orden va por `sort_order` y no por nombre: refleja el recorrido fisico del
 * apartamento (general primero, exterior ultimo), que es el mismo orden en el
 * que se va a pintar el checklist.
 */
export async function listarTiposDeCuarto(
  supabase: SupabaseClient<Database>,
): Promise<TipoDeCuarto[]> {
  const { data, error } = await supabase
    .from('room_types')
    .select('id, nombre, slug, sort_order')
    .order('sort_order', { ascending: true })
    // Desempate estable: `sort_order` no es unico en el schema, y dos tipos que
    // lo compartan saldrian en orden arbitrario, cambiando el orden del `Select`
    // entre dos cargas de la misma pantalla.
    .order('nombre', { ascending: true });

  if (error) throw new Error(error.message);

  return data ?? [];
}
