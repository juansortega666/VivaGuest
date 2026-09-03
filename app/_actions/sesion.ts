'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

/**
 * Cierra la sesion y devuelve al login.
 *
 * La consumen el stub del aseador (`/mis-aseos`) y, desde el plan 02-07, el menu
 * de usuario del admin. Vive en `app/_actions/` y no dentro de un route group
 * porque la usan los dos shells.
 *
 * No lleva guard: cerrar una sesion que no existe no es una operacion peligrosa,
 * y exigir sesion para poder salir es justo lo que deja atrapado a alguien con
 * una cookie corrupta.
 */
export async function cerrarSesion(): Promise<void> {
  const supabase = await createClient();

  // `signOut()` invalida el refresh token en el servidor Y borra las cookies via
  // el `setAll` de la fabrica de servidor. Solo borrar las cookies dejaria el
  // refresh token vivo y reutilizable.
  await supabase.auth.signOut();

  // El arbol se renderizo con sesion: sin invalidarlo, la navegacion siguiente
  // puede pintar el shell del usuario que acaba de salir.
  revalidatePath('/', 'layout');

  // Fuera de cualquier try/catch: `redirect` funciona lanzando.
  redirect('/login');
}
