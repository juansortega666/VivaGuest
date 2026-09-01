import { defineConfig, devices } from '@playwright/test';

/**
 * Runner E2E de VivaGuest.
 *
 * En esta wave todavía no existe ninguna pantalla, así que `playwright test` corre
 * con CERO specs. Es lo correcto: la config aterriza ahora y cada spec aterriza con
 * su feature.
 */
export default defineConfig({
  testDir: './e2e',

  // Un test E2E que depende del orden de otro es un test que miente. Cada spec
  // arranca de un estado que él mismo garantiza.
  fullyParallel: false,
  workers: 1,

  // `test.only` olvidado en un commit apaga el resto de la suite sin avisar.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,

  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: 'http://127.0.0.1:3000',
    // El producto es de Colombia y toda la lógica de fecha asume Bogotá sin DST.
    // Fijarlos aquí hace que un formateo dependiente de la locale del que corre el
    // test se rompa en CI, que es donde tiene que romperse.
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',

  webServer: {
    // `next build && next start`, NUNCA `next dev`. En dev hay recompilaciones que
    // producen flakiness, y las cookies y el middleware no se comportan como en
    // producción, que es justo lo que el criterio 1 del ROADMAP tiene que probar.
    command: 'npm run build && npm run start',

    // Se espera por PUERTO, no por `url`, y la razón está medida:
    // la sonda HTTP de Playwright sigue los redirects y exige un status final
    // < 400. Hoy `/` responde 307 hacia `/login`, que todavía no existe y da 404,
    // así que con `url` el runner se queda esperando 180s y muere por timeout
    // aunque el servidor esté perfectamente arriba (mide: `next start` queda listo
    // en ~600ms). Con `port` la señal de "listo" es que el puerto acepta conexiones,
    // que es independiente de qué rutas existan todavía.
    // No se cambia a `url: '/login'` cuando esa página aterrice: acoplar el arranque
    // del servidor a una ruta concreta reintroduce el mismo fallo la próxima vez que
    // alguien mueva la pantalla de entrada.
    port: 3000,

    reuseExistingServer: !process.env.CI,
    // `next build` en frío mide ~11s aquí, pero en CI sin caché es bastante más.
    timeout: 180_000,
  },
});
