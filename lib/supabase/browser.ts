'use client';

import { createBrowserClient } from '@supabase/ssr';

import type { Database } from '@/lib/database.types';
import { publicEnv } from '@/lib/env';

/**
 * Cliente de Supabase para el NAVEGADOR. Solo Client Components.
 *
 * `createBrowserClient` SI cachea un singleton internamente, y aqui eso es
 * correcto: en el navegador solo hay un usuario y una sesion. Es la unica de las
 * fabricas del proyecto donde el singleton no es un problema. En el servidor lo
 * seria, y grave: ver el comentario de `lib/supabase/server.ts`.
 *
 * La clave que usa es la PUBLICABLE, que se inlinea en el bundle a proposito.
 * Es publica por diseno y quien contiene lo que puede hacer es la RLS, no el
 * secreto de la clave.
 */
export function createClient() {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY } = publicEnv();

  return createBrowserClient<Database>(
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
