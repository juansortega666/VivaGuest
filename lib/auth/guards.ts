import 'server-only';

import type { SupabaseClient, User } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';
import { createClient } from '@/lib/supabase/server';

/**
 * El llamador no tiene permiso para esta operacion.
 *
 * Es una clase propia y no un `Error` generico para que una Server Action pueda
 * distinguirlo de un fallo cualquiera con `instanceof` y devolver el mensaje de
 * negocio en espanol en vez de un 500.
 */
export class NoAutorizado extends Error {
  constructor(mensaje = 'No tienes permiso para esta operacion.') {
    super(mensaje);
    this.name = 'NoAutorizado';
  }
}

type Contexto = { supabase: SupabaseClient<Database>; user: User };

/**
 * DEFENSA EN PROFUNDIDAD, NO LA FRONTERA.
 *
 * La frontera de autorizacion de VivaGuest es la RLS de Postgres, que lee
 * `profiles.role` via `private.is_admin()`. Aunque este guard desapareciera, un
 * aseador que invocara una action de admin recibiria 0 filas o un 42501. Lo que
 * el guard compra es otra cosa, y por eso existe:
 *
 *   (a) fallar temprano y con un mensaje en espanol, en vez de con el codigo de
 *       error de Postgres;
 *   (b) no filtrar la existencia de un recurso por la forma del error. Decirle a
 *       un aseador que la tabla `property_secrets` existe ya es informacion de mas.
 *
 * Y la razon por la que hace falta en CADA action: **un Server Action es un
 * endpoint HTTP publico**. Que el boton solo se renderice dentro del route group
 * `(admin)` no autoriza absolutamente nada; cualquiera puede invocar la action
 * directamente con el id de action y el payload.
 */
export async function exigirSesion(): Promise<Contexto> {
  const supabase = await createClient();

  // `getUser()` valida contra el servidor de Auth, que es lo unico que hace
  // visible una desactivacion sobre un token todavia sin expirar. Misma decision
  // y misma medicion que en `lib/supabase/middleware.ts`.
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new NoAutorizado();

  return { supabase, user: data.user };
}

/**
 * Como `exigirSesion`, y ademas exige rol de administrador.
 *
 * El rol se lee de `app_metadata.role`. NUNCA de `user_metadata.role`: medido, el
 * propio usuario puede escribirse ahi `role: 'admin'` con
 * `supabase.auth.updateUser()` (research §2.1). La ausencia de rol tampoco pasa:
 * falla cerrado.
 */
export async function exigirAdmin(): Promise<Contexto> {
  const { supabase, user } = await exigirSesion();

  if (user.app_metadata?.role !== 'admin') throw new NoAutorizado();

  return { supabase, user };
}
