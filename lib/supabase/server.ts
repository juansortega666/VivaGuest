import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import type { Database } from '@/lib/database.types';
import { publicEnv } from '@/lib/env';

/**
 * Cliente de Supabase para RSC y Server Actions. Un cliente NUEVO por peticion.
 *
 * NUNCA a nivel de modulo. Un `export const supabase = createServerClient(...)`
 * de nivel superior se comparte entre peticiones concurrentes con las cookies de
 * la primera que lo instancio, y en Fluid Compute de Vercel varias peticiones
 * comparten instancia: eso es fuga cruzada de sesion, un usuario leyendo los
 * datos de otro. Por eso esto es una funcion y no una constante
 * (`research/PITFALLS.md` §14).
 *
 * Lleva la clave publicable, no la de servicio: este cliente va con el JWT del
 * usuario y por tanto la RLS le aplica. El que salta RLS es
 * `lib/supabase/admin.ts`, que tiene su propio guardarrail de CI.
 */
export async function createClient() {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY } = publicEnv();

  // `cookies()` es async en Next 15.
  const cookieStore = await cookies();

  return createServerClient<Database>(
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },

        // `setAll` recibe DOS argumentos; el segundo son las cabeceras anti-cache.
        // Aqui se omite a proposito y no por descuido: la API de `cookies()` de
        // Next no permite escribir cabeceras de respuesta, asi que no hay donde
        // aplicarlas. El sitio donde SI importan, y donde omitirlas es un agujero
        // de seguridad, es `lib/supabase/middleware.ts`.
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Llamado desde un Server Component, donde no se puede escribir. Se
            // ignora sin ruido porque el middleware ya refresco la sesion en esta
            // misma peticion: no se pierde nada.
          }
        },
      },
    },
  );
}
