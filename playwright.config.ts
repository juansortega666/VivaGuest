import { defineConfig, devices } from '@playwright/test';

/**
 * Runner E2E de VivaGuest.
 *
 * En esta wave todavía no existe ninguna pantalla, así que `playwright test` corre
 * con CERO specs. Es lo correcto: la config aterriza ahora y cada spec aterriza con
 * su feature.
 *
 * ── EL PUERTO ES CONFIGURABLE, Y ESO EVITA UN FALSO RESULTADO ENTERO ────────
 * `reuseExistingServer` está en `true` fuera de CI, que es lo que hace rápido el
 * ciclo local. El precio: si en el puerto 3000 hay un `next start` de OTRO
 * checkout —y los worktrees de este repo comparten máquina y stack de Supabase—,
 * Playwright lo reutiliza sin decir nada y la suite mide el código de otro. Una
 * ruta que este checkout acaba de añadir da 404 y el fallo apunta al sitio
 * equivocado; peor, una aserción negativa pasa trivialmente contra una pantalla
 * que ni existe.
 *
 * `PLAYWRIGHT_PORT` deja levantar el servidor en un puerto propio. El default
 * sigue siendo 3000, así que para quien corre un solo checkout no cambia nada.
 */
// ─────────────────────────────────────────────────────────────────────────────
// OJO CON EL PUERTO POR DEFECTO, Y ESTA ES UNA TRAMPA MEDIDA (2026-09-12)
//
// `reuseExistingServer` esta en `true` fuera de CI. Eso significa que si el
// puerto 3000 ya lo ocupa OTRO proyecto de Next, Playwright NO levanta el
// servidor de VivaGuest: reusa el ajeno y corre los 107 tests contra la
// aplicacion equivocada. El sintoma es un fallo total por timeout de 30s en
// todos los specs, que se lee como "la suite esta rota" y no como "estoy
// mirando otra app".
//
// Paso de verdad: el 2026-09-12 el 3000 lo ocupaba un `next-server` 15.5.18 de
// otro repo (VivaGuest usa 15.5.24), y la suite entera salio roja. Lo delata
// comparar la version de Next que responde en el puerto.
//
// Salida: `PLAYWRIGHT_PORT=3200 npm run test:e2e`, o cualquier puerto libre.
//
// Y la otra mitad, que ya exige el `beforeAll` de `e2e/operacion.spec.ts`: la
// suite necesita la base RECIEN RESETEADA. Sin `npm run db:reset` antes, los
// aseos que dejan los specs previos chocan contra el indice unico parcial
// `(property_id, scheduled_date) where estado <> 'cancelado'` y dos aserciones
// de `operacion.spec.ts` caen por colision, no por defecto del producto.
// Medido: con reset y puerto libre, 107/107 en verde.
// ─────────────────────────────────────────────────────────────────────────────
const PUERTO = Number(process.env.PLAYWRIGHT_PORT ?? 3000);

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
    baseURL: `http://127.0.0.1:${PUERTO}`,
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
    command: `npm run build && npm run start -- --port ${PUERTO}`,

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
    port: PUERTO,

    // ── LA CONCESIÓN DE LOOPBACK DE APTO-12, ENCENDIDA SOLO AQUÍ ─────────────
    // `e2e/calendario.spec.ts` levanta un servidor HTTP local que sirve las
    // fixtures `.ics`, porque el fetch de validación lo hace el SERVIDOR de Next
    // y `page.route()` no lo intercepta. Para que la allowlist de host admita
    // `127.0.0.1` hace falta esta variable, y hace falta AQUÍ y no en `use`
    // porque la lee el proceso del servidor, no el del navegador.
    //
    // El prefijo `NEXT_PUBLIC_` es deliberado: el mismo esquema valida en el
    // cliente sin red (estado 2 de UI-SPEC §10.3), así que el valor tiene que
    // estar también en el bundle. Y como se inyecta antes de `next build`, un
    // build de producción que no la lleve compila la concesión apagada.
    // La explicación completa, con la medición, está en
    // `lib/domain/ical-url.schema.ts`.
    env: { NEXT_PUBLIC_VIVAGUEST_FEED_LOCAL: '1' },

    reuseExistingServer: !process.env.CI,
    // `next build` en frío mide ~11s aquí, pero en CI sin caché es bastante más.
    timeout: 180_000,
  },
});
