import 'server-only';

import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';
import { publicEnv, readServerSecret } from '@/lib/env';

/**
 * Cliente administrativo de Supabase (rol `service_role`).
 *
 * ESTE ES EL ÚNICO ARCHIVO DEL REPO AUTORIZADO A LEER LA CLAVE SECRETA.
 * `scripts/ci/check-service-role.sh` falla el build si `SUPABASE_SECRET_KEY`
 * aparece en cualquier otro archivo de `app/`, `lib/` o `components/`.
 *
 * `import 'server-only'` es necesario pero no suficiente: rompe el build si el
 * módulo se importa desde un Client Component, pero no impide importarlo desde un
 * Server Component o una Server Action. Ese caso lo cubre el grep de CI.
 *
 * Este cliente salta RLS por completo. Úsalo solo en workers (sync iCal, push,
 * retención) y en operaciones de administración explícitas, nunca para servir una
 * petición de usuario sin comprobar autorización aparte.
 */
const SECRET_KEY_VAR = 'SUPABASE_SECRET_KEY';

/**
 * El genérico `Database` viene de `lib/database.types.ts`, generado con
 * `npm run db:types` y commiteado. La puerta `typegen drift` del workflow `db`
 * falla si ese archivo se desincroniza del schema, así que el tipo que ve el
 * compilador es siempre el schema real, no una copia que envejeció.
 *
 * Solo se emite el esquema `public`: `private` no es parte del contrato del
 * cliente y `gen types --schema public` no lo incluye.
 */
export function createAdminClient() {
  const { NEXT_PUBLIC_SUPABASE_URL } = publicEnv();

  return createClient<Database>(NEXT_PUBLIC_SUPABASE_URL, readServerSecret(SECRET_KEY_VAR), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
