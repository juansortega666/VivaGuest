import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * Proyecto de Vitest de INTEGRACIÓN. Corre contra el stack local de Supabase con
 * JWT reales; no sustituye a `vitest.config.ts`, lo complementa.
 *
 * Vive aparte de `test:unit` a propósito: el job `arquitectura` de `ci/db.yml`
 * corre sin Docker, y estos tests exigen `npx supabase start`. Mezclarlos haría
 * que CI fallara por falta de entorno, no por un defecto del código.
 *
 * La frontera de autorización de VivaGuest es la RLS (02-CONTEXT). La única forma
 * honesta de probarla es emitiendo la consulta con el JWT de un usuario concreto
 * contra la base real, que es lo que habilita `lib/test/clientes.ts`.
 */
export default defineConfig({
  resolve: {
    alias: {
      // Los unitarios no usan el alias `@/`, pero `lib/supabase/admin.ts` sí, y
      // esta suite lo importa. Se replica aquí el `paths` de tsconfig.json.
      '@': fileURLToPath(new URL('./', import.meta.url)),

      // `server-only` es un paquete centinela: su `index.js` es literalmente un
      // `throw`, y solo la condición de exports `react-server` lo resuelve al
      // `empty.js` inocuo. Vitest no activa esa condición, así que sin este alias
      // cualquier import de `lib/supabase/admin.ts` revienta antes de correr.
      // Se apunta al `empty.js` del PROPIO paquete, que es exactamente lo que
      // Next resuelve en el servidor, en vez de relajar `resolve.conditions`
      // global: eso cambiaría la resolución de todos los demás paquetes.
      'server-only': fileURLToPath(
        new URL('./node_modules/server-only/empty.js', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['lib/**/*.integration.test.ts'],
    // Vitest NO pasa las variables de `.env.local` a `process.env` (medido: la
    // suite fallaba en el `beforeAll` con "Variables de entorno inválidas"), y es
    // de `process.env` de donde leen `lib/env.ts` y `lib/supabase/admin.ts`.
    setupFiles: ['./lib/test/cargar-env.ts'],
    // Mismo criterio que los unitarios: si un cálculo de fecha depende de la zona
    // local, tiene que romperse aquí y no en producción a las 19:00 de Bogotá.
    env: { TZ: 'UTC' },
    // Un login real contra GoTrue tarda bastante más que un test puro, y el
    // sembrado con la clave de servicio va por red al contenedor.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // El stack local es UNO solo y compartido. Dos archivos sembrando y borrando
    // usuarios a la vez se pisan; en serie el estado es reproducible.
    fileParallelism: false,
  },
});
