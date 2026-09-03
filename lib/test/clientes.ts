import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';
import { publicEnv } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Fábricas de cliente Supabase para los tests de INTEGRACIÓN.
 *
 * Este archivo solo lo importan los `*.integration.test.ts`. Nada bajo `app/` lo
 * referencia, así que nunca entra al bundle de producción; el guardarraíl 5 de
 * `scripts/ci/check-service-role.sh` lo permite por una excepción explícita y
 * acotada a `lib/test/`, documentada allí.
 *
 * Por qué existe `clienteConToken`: la frontera de autorización de VivaGuest es la
 * RLS, y una consulta hecha con la clave publicable a secas viaja como `anon`. Para
 * probar lo que ve un usuario CONCRETO hay que emitir la consulta con SU JWT, y eso
 * se consigue metiendo el token en el header `Authorization`. Patrón medido en
 * 02-RESEARCH §7.2.
 */
export type ClienteVivaGuest = SupabaseClient<Database>;

/**
 * Cliente que habla como un usuario concreto, usando su `access_token`.
 *
 * El token se fija en el header y NO en el almacén de sesión: `persistSession` y
 * `autoRefreshToken` van en `false` para que la librería no lo renueve ni lo
 * reemplace a mitad del test. Eso es justamente lo que permite probar el caso duro
 * de la fase: un token que sigue vivo después de desactivar al usuario.
 */
export function clienteConToken(token: string): ClienteVivaGuest {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY } = publicEnv();

  return createClient<Database>(
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  );
}

/**
 * Cliente sin sesión, con la clave publicable. Es el que usa el navegador antes de
 * que alguien se autentique: sirve para `signInWithPassword` y para comprobar que
 * `signUp` está cerrado.
 */
export function clienteAnonimo(): ClienteVivaGuest {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY } = publicEnv();

  return createClient<Database>(
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/**
 * Cliente de servicio para SEMBRAR y LIMPIAR. Salta la RLS por completo, así que
 * nunca se usa para la aserción en sí: si el sembrado y la comprobación usan el
 * mismo cliente, el test pasa aunque la policy esté mal escrita.
 *
 * Envuelve `createAdminClient()` en vez de releer el secreto para no duplicar el
 * nombre de la variable de entorno, que el guardarraíl 1 restringe a `admin.ts`.
 */
export function clienteAdminDePruebas(): ClienteVivaGuest {
  return createAdminClient();
}

/**
 * Decodifica el payload de un JWT sin verificar la firma.
 *
 * Verificar la firma aquí no aportaría nada: el token lo acaba de emitir el GoTrue
 * contra el que estamos hablando. Lo que interesa es qué CLAIMS viajan dentro, que
 * es lo que el middleware lee para rutear.
 */
export function payloadDelJwt(token: string): Record<string, unknown> {
  const partes = token.split('.');
  if (partes.length !== 3) {
    throw new Error(`No parece un JWT: tiene ${partes.length} segmentos, no 3.`);
  }
  const json = Buffer.from(partes[1], 'base64url').toString('utf8');
  return JSON.parse(json) as Record<string, unknown>;
}
