import { z } from 'zod';

/**
 * Parseo de variables de entorno con zod.
 *
 * Nomenclatura nueva de Supabase (`sb_publishable_…` / `sb_secret_…`): las claves
 * `anon` / `service_role` quedan deprecadas a fin de 2026.
 *
 * Este módulo expone DOS superficies separadas a propósito:
 *   - `publicEnv()`: seguro en el bundle del cliente. Solo variables `NEXT_PUBLIC_`.
 *   - `readServerSecret()`: helper genérico para leer un secreto de servidor. El
 *     NOMBRE de la variable no vive aquí: lo pasa `lib/supabase/admin.ts`, que es el
 *     único archivo del repo autorizado a nombrar la clave de servicio y el único que
 *     declara `import 'server-only'`. Mantener el nombre fuera de este archivo es lo
 *     que permite que `scripts/ci/check-service-role.sh` sea un grep exacto.
 *
 * Deliberadamente NO se hace `import 'server-only'` aquí: este archivo también lo
 * consume el cliente para leer `publicEnv()`.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

export type PublicEnv = z.infer<typeof publicSchema>;

function fail(scope: string, error: z.ZodError): never {
  const detalle = error.issues
    .map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`)
    .join('; ');
  throw new Error(`Variables de entorno inválidas (${scope}): ${detalle}`);
}

/**
 * Variables públicas. Next.js sustituye los `process.env.NEXT_PUBLIC_*` en tiempo de
 * build, así que hay que referenciarlos literalmente y nunca por índice dinámico.
 */
export function publicEnv(): PublicEnv {
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  if (!parsed.success) fail('cliente', parsed.error);
  return parsed.data;
}

const secretSchema = z.string().min(1);

/**
 * Lee un secreto de servidor de `process.env` y lo valida.
 *
 * Rechaza cualquier nombre con prefijo `NEXT_PUBLIC_`: un secreto con ese prefijo se
 * inlinea en el bundle del cliente. La misma regla la vigila el grep de CI, pero
 * fallar en runtime es más barato que descubrirlo en producción.
 */
export function readServerSecret(name: string): string {
  if (name.startsWith('NEXT_PUBLIC_')) {
    throw new Error(
      `Un secreto de servidor no puede llamarse ${name}: el prefijo NEXT_PUBLIC_ lo publica en el bundle del cliente.`,
    );
  }
  const parsed = secretSchema.safeParse(process.env[name]);
  if (!parsed.success) {
    throw new Error(`Variable de entorno de servidor ausente o vacía: ${name}`);
  }
  return parsed.data;
}
