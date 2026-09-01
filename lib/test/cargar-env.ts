import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * `setupFiles` de la suite de integración: mete `.env.local` en `process.env`.
 *
 * Por qué hace falta, medido y no supuesto: Vitest lee los archivos `.env` con
 * Vite, pero solo expone a `import.meta.env` las variables con el prefijo
 * configurado; `process.env` se queda sin ellas. Y `lib/env.ts` y
 * `lib/supabase/admin.ts` leen de `process.env`, porque eso es lo que hay en
 * runtime bajo Next. Sin este archivo la suite falla en el `beforeAll` con
 * "Variables de entorno inválidas (cliente)".
 *
 * No se duplican los valores aquí ni se inventan defaults: si `.env.local` no
 * existe, el error tiene que decir exactamente qué falta y cómo obtenerlo, en vez
 * de que la suite reviente más adelante con un fallo de red sin explicación.
 */
const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const ENV_LOCAL = `${RAIZ}.env.local`;

if (!existsSync(ENV_LOCAL)) {
  throw new Error(
    `Falta .env.local en la raíz del repo (${ENV_LOCAL}).\n` +
      'Los tests de integración hablan con el stack local de Supabase.\n' +
      'Arréglalo así:\n' +
      '  1. npx supabase start\n' +
      '  2. copia .env.example a .env.local\n' +
      '  3. rellena los valores con lo que imprime `npx supabase status`\n' +
      '     (API_URL, PUBLISHABLE_KEY, SECRET_KEY)',
  );
}

// Node >= 20.12. No pisa una variable que ya venga del entorno real, que es lo que
// permite apuntar la suite a otro stack desde CI sin tocar el archivo.
process.loadEnvFile(ENV_LOCAL);
