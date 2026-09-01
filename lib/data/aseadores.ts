import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';

/**
 * Lectura de aseadores con sus apartamentos asignados (ASEADOR-03).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ESTA FASE NO CREA NINGUNA FUNCION EN `public`, y este modulo es la prueba: el
 * CRUD del catalogo va por PostgREST con el JWT del usuario, filtrado por RLS.
 *
 * Si algun dia hiciera falta un RPC, cada funcion nueva de `public` necesita su
 * propio par `revoke all ... from public, anon` / `grant execute ... to
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
 * DOS consultas y no una por aseador: son 39 apartamentos en total, asi que traer
 * la tabla entera y agrupar en memoria es una ida a la base en vez de N.
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
  }));
}
