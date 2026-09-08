/**
 * RUTEO, NO AUTORIZACION: esta funcion solo elige a que shell mandar a alguien; quien
 * decide que datos ve es la RLS de Postgres, que lee `profiles.role` y no el JWT.
 *
 * Corolario practico: si esta tabla se equivoca, el usuario aterriza en una pantalla
 * incomoda, no en datos ajenos. Por eso puede vivir en el edge, ser pura y no consultar
 * nada. Sin imports de `next/*` ni de `@supabase/*`: es lo que la vuelve testeable en
 * Vitest sin montar el framework (research §2.3, §7.4).
 *
 * El rol que recibe tiene que salir de `app_metadata.role` del usuario devuelto por
 * `getUser()`, NUNCA de `user_metadata`: medido, un aseador puede escribirse
 * `user_metadata.role = 'admin'` en su propio JWT. Hacer cumplir eso es responsabilidad
 * de quien llama (plan 02-06), no de este modulo.
 */

export type Rol = 'admin' | 'aseador';

/**
 * Ruta de aterrizaje de cada rol. La del aseador es `/mis-aseos` (UI-SPEC §12.2).
 *
 * La del admin paso de `/apartamentos` a `/operacion` en la Fase 4
 * (04-UI-SPEC.md §6.3): el catalogo es configuracion y se toca de vez en cuando;
 * la operacion del dia es el trabajo, y es lo que el admin quiere ver al entrar.
 */
export const RAIZ: Record<Rol, string> = {
  admin: '/operacion',
  aseador: '/mis-aseos',
};

/** Rutas accesibles sin sesion. Se acepta la ruta exacta y sus subrutas. */
export const PUBLICAS: readonly string[] = ['/login'];

/**
 * Prefijos de la zona del admin.
 *
 * La Fase 4 anade UNA sola ruta y no las tres que anticipaba `02-UI-SPEC.md`
 * §6.1: D-01 fija `/operacion` como la unica superficie del dashboard operativo.
 */
const ZONA_ADMIN: readonly string[] = ['/operacion', '/apartamentos', '/aseadores'];

/** Prefijos de la zona del aseador. */
const ZONA_ASEADOR: readonly string[] = ['/mis-aseos'];

const enZona = (pathname: string, zona: readonly string[]): boolean =>
  zona.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/**
 * Devuelve el pathname al que hay que redirigir, o `null` si la ruta esta bien.
 *
 * @param pathname ruta pedida, normalizada por Next (sin query ni hash)
 * @param rol rol tomado de `app_metadata.role`; `undefined` = sin sesion valida
 */
export function resolverRedireccion(
  pathname: string,
  rol: Rol | undefined,
): string | null {
  const esPublica = enZona(pathname, PUBLICAS);

  if (!rol) return esPublica ? null : '/login';
  if (esPublica) return RAIZ[rol];
  if (pathname === '/') return RAIZ[rol];

  if (rol === 'admin' && enZona(pathname, ZONA_ASEADOR)) return RAIZ.admin;
  if (rol === 'aseador' && enZona(pathname, ZONA_ADMIN)) return RAIZ.aseador;

  return null;
}
