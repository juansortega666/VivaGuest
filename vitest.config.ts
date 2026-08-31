import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
    // El CI corre en UTC a propósito: si algún cálculo de fecha depende de la zona
    // local, tiene que romperse aquí y no en producción a las 19:00 de Bogotá.
    env: { TZ: 'UTC' },
  },
});
