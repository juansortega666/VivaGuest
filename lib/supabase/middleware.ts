import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import type { Database } from '@/lib/database.types';
import { publicEnv } from '@/lib/env';

/**
 * Refresco de sesion en el edge. Este es el archivo mas delicado de la fase.
 *
 * Devuelve el `NextResponse` que YA lleva las cookies de sesion refrescadas y el
 * usuario validado contra el servidor de Auth, o `null` si no hay sesion valida.
 * Quien llama (`middleware.ts`) decide el ruteo; aqui no se decide nada.
 */
export async function actualizarSesion(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY } = publicEnv();

  const supabase = createServerClient<Database>(
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },

        // ─────────────────────────────────────────────────────────────────────
        // DOS ARGUMENTOS. El segundo NO es opcional en la practica.
        //
        // `headers` trae, cuando la libreria escribe cookies de auth:
        //   Cache-Control: private, no-cache, no-store, must-revalidate, max-age=0
        //   Expires: 0
        //   Pragma: no-cache
        //
        // Sin aplicarlas, esta respuesta lleva un `Set-Cookie` con el token de
        // sesion y es cacheable: el CDN de Vercel puede guardarla y servirsela a
        // OTRO usuario. Es la fuga de sesion mas cara de esta fase.
        //
        // La trampa: el ejemplo oficial de Supabase para Next.js todavia escribe
        // la firma de UN solo argumento, y como TypeScript permite implementar un
        // tipo de funcion con menos parametros de los declarados, copiarlo
        // compila sin un solo error y sin un solo warning. No hay ninguna senal
        // de que el agujero este abierto. Verificado en el `.d.ts` de
        // `@supabase/ssr@0.12.5` instalado en este repo, no en la documentacion.
        //
        // Algunas rutas de la libreria pasan `{}` como headers (cuando no hay
        // cookies de auth de por medio): iterar sobre el objeto vacio no escribe
        // nada, que es justo lo que se quiere.
        // ─────────────────────────────────────────────────────────────────────
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
          for (const [clave, valor] of Object.entries(headers)) {
            supabaseResponse.headers.set(clave, valor);
          }
        },
      },
    },
  );

  // ───────────────────────────────────────────────────────────────────────────
  // NADA entre `createServerClient` y esta llamada. Ni un `await`, ni una lectura
  // de base, ni un log asincrono. Un await de por medio y las cookies se escriben
  // tarde: el sintoma es que los usuarios se desloguean solos cada cierto rato,
  // de forma intermitente, y no se parece en nada a su causa.
  //
  // Y es `getUser()`, deliberadamente. NO las alternativas sin red:
  //
  //   - la que solo lee la sesion de la cookie no hace ninguna llamada al
  //     servidor de Auth. La propia documentacion de Supabase lo dice literal:
  //     "Never trust supabase.auth.getSession() inside server code".
  //   - la que valida el JWT localmente contra el JWKS es lo que la
  //     documentacion de Supabase recomienda HOY para proteger rutas, y para
  //     este proyecto es la respuesta equivocada. Medido en el stack local el
  //     2026-09-01, con un aseador cuyo access token seguia sin expirar:
  //
  //       --- ANTES de desactivar ---
  //       getUser:   OK cd9d3d02-...
  //       la local:  OK sub=cd9d3d02-...
  //       --- DESPUES de is_active=false + ban_duration ---
  //       getUser:   ERR 403 user_banned "User is banned"
  //       la local:  OK sub=cd9d3d02-...        <- NO detecta la revocacion
  //
  //     Valida firma y expiracion, no revocacion. Es exactamente lo que promete
  //     su nombre y exactamente lo que no sirve aqui: el criterio de exito 4 del
  //     ROADMAP exige que un aseador desactivado pierda el acceso de inmediato,
  //     aunque tuviera la sesion abierta.
  //
  // Coste: una llamada de red por navegacion protegida. Con ~10 usuarios es
  // irrelevante. Ademas, el stack local usa secreto simetrico, con el que la
  // alternativa local haria la MISMA llamada de red. No "modernizar" esto.
  // ───────────────────────────────────────────────────────────────────────────
  const { data, error } = await supabase.auth.getUser();

  return { supabaseResponse, user: error ? null : data.user };
}
