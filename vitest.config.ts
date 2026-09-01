import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
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
