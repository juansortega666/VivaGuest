import { NextResponse, type NextRequest } from 'next/server';

import { resolverRedireccion, type Rol } from '@/lib/auth/routing';
import { actualizarSesion } from '@/lib/supabase/middleware';

/**
 * Refresco de sesion y ruteo por rol.
 *
 * ESTO NO ES LA FRONTERA DE AUTORIZACION. La frontera es la RLS de Postgres, que
 * lee `profiles.role` via `private.is_admin()`. Si este middleware se saltara
 * entero, el atacante veria un shell vacio y errores 42501, no datos ajenos. Esa
 * separacion es deliberada y es lo que hace que CVE-2025-29927 (bypass del
 * middleware de Next) no sea explotable aqui para leer nada; ademas, Next 15.5.24
 * esta por encima de 15.2.3 y el CVE ya no aplica.
 */
export async function middleware(request: NextRequest) {
  const { supabaseResponse, user } = await actualizarSesion(request);

  // El rol sale de `app_metadata.role`, NUNCA de `user_metadata.role`. Medido: un
  // aseador SI puede escribirse `user_metadata.role = 'admin'` con
  // `supabase.auth.updateUser()` y verlo en el JWT siguiente (research §2.1).
  // `app_metadata` no es escribible por el usuario, y `getUser()` ya lo devuelve
  // sin coste extra porque la llamada se hizo igual para refrescar la sesion.
  //
  // Si se ruteara por el metadato escribible no se ganaria acceso a nada (la RLS
  // no lo mira), pero mandaria al aseador al shell del admin, donde veria una
  // pantalla llena de errores de permiso. Feo, confuso y evitable.
  const rol = user?.app_metadata?.role as Rol | undefined;

  const destino = resolverRedireccion(request.nextUrl.pathname, rol);

  if (destino) {
    const url = request.nextUrl.clone();
    url.pathname = destino;
    // Se copian TODAS las cookies del `supabaseResponse` a la redireccion. Si no,
    // el token que se acaba de refrescar se pierde y la sesion se desincroniza:
    // es la causa clasica de "los usuarios se desloguean solos".
    const redireccion = NextResponse.redirect(url);
    for (const cookie of supabaseResponse.cookies.getAll()) {
      redireccion.cookies.set(cookie);
    }
    // Y tambien las cabeceras anti-cache que escribio `setAll`: una redireccion
    // que lleva `Set-Cookie` de sesion es igual de cacheable que un 200.
    for (const clave of ['cache-control', 'expires', 'pragma']) {
      const valor = supabaseResponse.headers.get(clave);
      if (valor) redireccion.headers.set(clave, valor);
    }
    return redireccion;
  }

  // Se devuelve el objeto TAL CUAL. No se reconstruye, no se copia, no se envuelve:
  // reconstruirlo desincroniza las cookies que `setAll` acaba de escribir.
  return supabaseResponse;
}

export const config = {
  matcher: [
    // Excluye estaticos e imagenes (no necesitan sesion y pagar un getUser() por
    // cada uno seria absurdo) y los DOS endpoints que se autentican por secreto
    // compartido y no por cookie: `api/cron/*` (Fase 3) y `api/push/*` (Fase 5).
    // `pg_net` no manda cookies, asi que pasarlos por aqui los redirige a /login.
    //
    // ── `api/push` FALTABA, Y COSTO LA FASE ENTERA (medido el 2026-09-12) ────
    // Sin el, `POST /api/push/drain` responde 307 hacia `/login`, `pg_net` sigue
    // la redireccion, `/login` contesta 405 a un POST, y el aviso se queda en
    // `pendiente` PARA SIEMPRE. Nada lo delata: la notificacion existe en la
    // base, el dispatcher corre sin excepcion, y el telefono no suena nunca.
    // Se descubrio probando en un iPhone de verdad, no en la suite.
    //
    // `sw.js` y `manifest.webmanifest` se excluyen ya para las Fases 5 y 6: un
    // service worker servido con una redireccion a /login no se registra nunca.
    '/((?!_next/static|_next/image|favicon\\.ico|api/cron|api/push|sw\\.js|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
