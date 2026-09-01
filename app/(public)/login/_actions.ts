'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { RAIZ, type Rol } from '@/lib/auth/routing';
import type { ResultadoAccion } from '@/lib/domain/acciones';
import { mapAuthError } from '@/lib/domain/errors';
import { createClient } from '@/lib/supabase/server';

/**
 * Validacion de forma, no de credenciales. Solo evita ir a la red con un campo
 * vacio; quien decide si las credenciales sirven es GoTrue.
 *
 * Estos mensajes hablan del FORMATO de lo tecleado, nunca de si la cuenta
 * existe: no son un oraculo de enumeracion.
 */
const esquema = z.object({
  email: z.email('Ese email no tiene un formato válido.'),
  password: z.string().min(1, 'Escribe tu contraseña.'),
});

/**
 * PLAT-01 y PLAT-02. Entrar con email y contrasena.
 *
 * Un Server Action es un endpoint HTTP publico, y este lo es POR DISENO: acepta
 * credenciales de cualquiera, igual que cualquier formulario de login. Lo que lo
 * contiene es el rate limit de GoTrue (30 intentos por 5 minutos por IP) y la
 * comparacion de `Origin` contra `Host` que Next 15 hace por defecto.
 *
 * En exito NO decide a donde va nadie: redirige a `/` y es el middleware el que
 * manda a la raiz que corresponde al rol. Si la pantalla de login decidiera el
 * destino habria dos tablas de ruteo que mantener en sincronia, y la de la UI se
 * quedaria vieja el dia que la Fase 4 anada rutas.
 */
export async function entrar(
  _estadoPrevio: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion | null> {
  const parseado = esquema.safeParse({
    email: String(formData.get('email') ?? '').trim(),
    password: String(formData.get('password') ?? ''),
  });

  if (!parseado.success) {
    const problema = parseado.error.issues[0];
    return {
      ok: false,
      error: problema?.message ?? 'Revisa los datos e intenta de nuevo.',
      campo: String(problema?.path[0] ?? ''),
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parseado.data);

  if (error) {
    // SIEMPRE por `mapAuthError`. NUNCA `error.message`: los mensajes de GoTrue
    // vienen en ingles y algunos citan detalles del backend. El mapa tambien
    // garantiza que contrasena mala y email inexistente den el MISMO texto.
    // El error va sin `campo`: no se puede saber cual de los dos estaba mal, y
    // senalar el campo del email seria justo la enumeracion que se evita.
    return { ok: false, error: mapAuthError(error) };
  }

  // El layout raiz pasa a renderizarse con sesion: hay que invalidar lo cacheado
  // antes de navegar, o la primera pantalla se pinta con el arbol de invitado.
  revalidatePath('/', 'layout');

  // ───────────────────────────────────────────────────────────────────────────
  // Se redirige a la raiz DEL ROL, no a `/`, y esto es una correccion medida.
  //
  // Lo natural seria `redirect('/')` y dejar que el middleware eligiera. MEDIDO
  // en esta wave con Playwright: no funciona. Un `redirect` de Server Action no
  // provoca una navegacion normal, sino un fetch RSC del router de Next; el
  // middleware responde con un 307 a la raiz del rol, y `fetch` SIGUE ese
  // redirect de forma transparente. El router pinta el arbol del destino pero la
  // barra de direcciones se queda en `/`. El sintoma es cruel: el usuario ve la
  // pantalla correcta con la URL equivocada, y solo se nota al recargar.
  //
  // Esto NO reintroduce una segunda tabla de ruteo: `RAIZ` es exactamente la
  // misma constante que consume `resolverRedireccion()`, importada de
  // `lib/auth/routing.ts`. La fuente de verdad sigue siendo una sola, y el
  // middleware sigue siendo la autoridad: si este destino no le cuadrara al rol,
  // rebotaria en la peticion siguiente.
  //
  // El rol sale de `app_metadata`, igual que en el middleware, y NUNCA de
  // `user_metadata`, que el propio usuario puede escribir.
  // ───────────────────────────────────────────────────────────────────────────
  const rol = data.user?.app_metadata?.role as Rol | undefined;

  // Fuera del try/catch de arriba a proposito: `redirect` funciona lanzando una
  // excepcion de control que Next atrapa. Envolverla en un catch la convierte en
  // un error de verdad y el usuario se queda en el login tras entrar bien.
  redirect(rol ? RAIZ[rol] : '/');
}
