import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';

import {
  leerEstadoDeAvisosPorAseador,
  SIN_AVISOS_REGISTRADOS,
  type EstadoDeAvisosCrudo,
} from './avisos';

/**
 * Lectura de aseadores con sus apartamentos asignados (ASEADOR-03).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA FASE 2 NO CREO NINGUNA FUNCION EN `public`, y este modulo era la prueba: el
 * CRUD del catalogo va por PostgREST con el JWT del usuario, filtrado por RLS.
 *
 * LA FASE 5 NO CREA NINGUNA TAMPOCO, PERO ESTE MODULO YA CONSUME UNA: el estado
 * de avisos de D-03 entra por la funcion agregada de la migracion 16, a traves
 * de `./avisos.ts`, que es el UNICO sitio de `lib/data/` que escribe su nombre.
 * Aqui no se repite a proposito: una segunda copia literal del nombre es una
 * segunda cosa que cambiar el dia que la funcion se renombre.
 *
 * SE LLEGA POR RPC Y NO POR UN `select` SOBRE LA TABLA DE SUSCRIPCIONES, y no es
 * por comodidad: el identificador de destino de una suscripcion es una
 * credencial portadora, y el admin no necesita ninguna para saber a quien llamar
 * por telefono. Por eso el admin NO tiene lectura sobre esa tabla, no se le
 * anade ninguna policy que se la de, y este archivo no la nombra fuera de un
 * comentario. La razon completa esta en la cabecera de `./avisos.ts` (T-05-07).
 *
 * Si algun dia hiciera falta otro RPC, cada funcion nueva de `public` necesita
 * su propio par `revoke all ... from public, anon` / `grant execute ... to
 * authenticated` pegado a la definicion. La razon esta medida dos veces
 * (hallazgo 5 de `deferred-items.md`): en PG 17.6, `alter default privileges` NO
 * puede quitarle `EXECUTE` a PUBLIC, asi que una funcion nueva nace ejecutable
 * por `anon` salvo que se revoque explicitamente.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Esta lectura NO se memoiza entre peticiones, ni con el helper de cache de Next
 * ni con la directiva de cache de React: son datos por usuario, y una entrada de
 * cache compartida se le sirve a otro usuario. Con ~8 aseadores y 39
 * apartamentos no hay ningun beneficio que lo justifique.
 *
 * El nombre literal de ninguno de los dos se escribe aqui a proposito: un
 * comentario que cita el token que un grep vigila hace que el guardarrail se
 * atrape a si mismo, y en este repo ya paso cuatro veces.
 */

/** Un apartamento tal como aparece dentro de la asignacion de un aseador. */
export interface AsignacionApartamento {
  id: string;
  nombre: string;
  /**
   * `properties.is_active`. Va aqui, y no fuera, porque `contarActivos` lo
   * necesita: sin este campo el conteo del bloque ambar del dialogo de baja
   * (plan 02-09) exigiria una segunda consulta por aseador.
   */
  activo: boolean;
}

export interface AseadorConAsignaciones {
  id: string;
  full_name: string;
  phone: string | null;
  is_active: boolean;
  /**
   * Listas y no numeros: el `Popover` de UI-SPEC §11.1 lista los nombres al hacer
   * clic. Devolver el conteo obligaria a ir otra vez a la base para poder abrirlo.
   */
  responsableDe: AsignacionApartamento[];
  suplenteEn: AsignacionApartamento[];
  /**
   * El estado de avisos CRUDO: conteo, grado de verificacion y marcas de tiempo
   * (D-03, criterio 6). No la etiqueta ni el color.
   *
   * Quien traduce esto a `Activos` / `Sin probar` / `Sin avisos` es
   * `estadoDeAvisosDeAseador()` de `lib/domain/avisos.ts`, y quien lo pinta es
   * `EstadoAvisosAseador`. Devolver ya la etiqueta desde aqui seria la segunda
   * copia de esa derivacion, que es exactamente como el badge se desincroniza de
   * la realidad.
   */
  estadoDeAvisos: EstadoDeAvisosCrudo;
}

/**
 * Cuantos de los apartamentos donde el aseador es RESPONSABLE estan activos.
 *
 * Es lo que decide si el dialogo de baja del plan 02-09 muestra su bloque ambar:
 * esos apartamentos son los que quedan sin responsable y dejan de poder confirmar
 * aseos. Los apartamentos donde solo es suplente conservan a su responsable, asi
 * que no entran.
 */
export function contarActivos(aseador: AseadorConAsignaciones): number {
  return aseador.responsableDe.filter((p) => p.activo).length;
}

/**
 * Lista los aseadores con sus asignaciones, leyendo con el cliente que se le pase.
 *
 * El cliente llega POR PARAMETRO y no se construye aqui a proposito: asi la misma
 * funcion sirve a un RSC (con el JWT del admin, filtrada por `profiles_admin_all`
 * y `properties_admin_all`) y a un test de integracion con el JWT que se quiera
 * probar. Construirlo dentro ataria el modulo a `next/headers` y lo volveria
 * inejecutable fuera de una peticion.
 *
 * TRES consultas y no una por aseador: son 8 perfiles y 39 apartamentos en
 * total, asi que traer las tablas enteras y agrupar en memoria es una ida a la
 * base en vez de N. La tercera —el agregado de avisos— sigue el mismo
 * razonamiento y se llama UNA sola vez para todos: meterla en el bucle
 * convertiria ocho aseadores en ocho viajes.
 */
export async function listarAseadoresConAsignaciones(
  supabase: SupabaseClient<Database>,
): Promise<AseadorConAsignaciones[]> {
  // Activos E INACTIVOS. Un aseador desactivado no desaparece de la lista: se
  // queda marcado `Inactivo`. Filtrarlo aqui es como el admin pierde la noción de
  // a quién desactivó.
  const { data: perfiles, error: errorPerfiles } = await supabase
    .from('profiles')
    .select('id, full_name, phone, is_active')
    .eq('role', 'aseador')
    .order('full_name', { ascending: true });

  if (errorPerfiles) throw new Error(errorPerfiles.message);

  const { data: apartamentos, error: errorApartamentos } = await supabase
    .from('properties')
    .select('id, nombre, is_active, responsable_id, suplente_id')
    .order('nombre', { ascending: true });

  if (errorApartamentos) throw new Error(errorApartamentos.message);

  // La TERCERA lectura, y la unica que no va por PostgREST. Una llamada para los
  // ocho, despues de las otras dos y no dentro del `map` de abajo.
  const avisosPorAseador = await leerEstadoDeAvisosPorAseador(supabase);

  const responsableDe = new Map<string, AsignacionApartamento[]>();
  const suplenteEn = new Map<string, AsignacionApartamento[]>();

  const agregar = (
    indice: Map<string, AsignacionApartamento[]>,
    aseadorId: string | null,
    apartamento: AsignacionApartamento,
  ) => {
    if (!aseadorId) return;
    const lista = indice.get(aseadorId);
    if (lista) lista.push(apartamento);
    else indice.set(aseadorId, [apartamento]);
  };

  for (const p of apartamentos ?? []) {
    const apartamento: AsignacionApartamento = {
      id: p.id,
      nombre: p.nombre,
      activo: p.is_active,
    };
    agregar(responsableDe, p.responsable_id, apartamento);
    agregar(suplenteEn, p.suplente_id, apartamento);
  }

  return (perfiles ?? []).map((perfil) => ({
    id: perfil.id,
    full_name: perfil.full_name,
    phone: perfil.phone,
    is_active: perfil.is_active,
    responsableDe: responsableDe.get(perfil.id) ?? [],
    suplenteEn: suplenteEn.get(perfil.id) ?? [],
    // Quien no salga del agregado se resuelve como CERO suscripciones vivas, que
    // es el estado `Sin avisos`, y no como dato ausente. Un aseador desactivado
    // cae siempre aqui: la funcion de la base ya lo filtra. Esconderle el estado
    // es decision del componente (§5.2), no de esta capa.
    estadoDeAvisos: avisosPorAseador.get(perfil.id) ?? SIN_AVISOS_REGISTRADOS,
  }));
}
