import 'server-only';

import { createClient } from '@supabase/supabase-js';

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

// TODO(plan 09): tipar con `createClient<Database>` cuando exista lib/database.types.ts
export function createAdminClient() {
  const { NEXT_PUBLIC_SUPABASE_URL } = publicEnv();

  return createClient(NEXT_PUBLIC_SUPABASE_URL, readServerSecret(SECRET_KEY_VAR), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
