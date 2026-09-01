import { fileURLToPath } from 'node:url';

import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // La mayoria de los unitarios importan por ruta relativa, pero
      // `lib/auth/guards.ts` importa la fabrica de servidor por `@/` (es codigo
      // de aplicacion, no de prueba) y su test la sustituye con `vi.mock` usando
      // ese mismo especificador. Sin replicar aqui el `paths` de tsconfig.json,
      // Vitest no resuelve ninguno de los dos.
      '@': fileURLToPath(new URL('./', import.meta.url)),

      // `server-only` es un paquete centinela: su `index.js` es literalmente un
      // `throw`, y solo la condicion de exports `react-server` lo resuelve al
      // `empty.js` inocuo. Vitest no activa esa condicion, asi que sin este alias
      // cualquier import de un modulo que lo declare revienta antes de correr.
      // Misma solucion y misma razon que en `vitest.integration.config.ts`.
      'server-only': fileURLToPath(
        new URL('./node_modules/server-only/empty.js', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
    // `lib/**/*.test.ts` SI casa con `sesion.integration.test.ts`: el comodin
    // absorbe `sesion.integration`. Sin esta exclusion los tests de integracion
    // entrarian a `test:unit`, y el job `arquitectura` de ci/db.yml corre sin
    // Docker, asi que fallarian por falta de stack y no por un defecto del codigo.
    // Se excluye por ruta, no renombrando los archivos: el nombre `.integration`
    // es el contrato que tambien usa `vitest.integration.config.ts`.
    exclude: [...configDefaults.exclude, 'lib/**/*.integration.test.ts'],
    // El CI corre en UTC a propósito: si algún cálculo de fecha depende de la zona
    // local, tiene que romperse aquí y no en producción a las 19:00 de Bogotá.
    env: { TZ: 'UTC' },
  },
});
