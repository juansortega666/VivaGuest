import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { test as base, expect, type Page } from '@playwright/test';

import {
  ARCHIVO_CREDENCIALES,
  DIR_AUTH,
  type Credenciales,
  type RolE2E,
} from './global-setup';

/**
 * Fixtures de sesión para la suite E2E.
 *
 * Regla de la suite: **el único test que hace login por UI es el test de login.**
 * El resto arranca con la sesión ya puesta. Un test de "el aseador ve sus aseos"
 * que empieza tecleando email y contraseña no está probando los aseos: está
 * probando el login otra vez, y se cae por razones que no tienen que ver con lo que
 * dice medir.
 */

export { expect };

/** Credenciales que sembró `global-setup.ts` en esta corrida. */
export function leerCredenciales(): Credenciales {
  if (!existsSync(ARCHIVO_CREDENCIALES)) {
    throw new Error(
      `No existe ${ARCHIVO_CREDENCIALES}. Lo escribe e2e/global-setup.ts al arrancar.\n` +
        'Si corriste Playwright con --no-deps o con el globalSetup desactivado, vuelve a correr `npm run test:e2e`.',
    );
  }
  return JSON.parse(readFileSync(ARCHIVO_CREDENCIALES, 'utf8')) as Credenciales;
}

function rutaStorageState(clave: string): string {
  return resolve(DIR_AUTH, `${clave}.storage.json`);
}

/**
 * Hace login por UI UNA sola vez por rol y persiste el `storageState`.
 *
 * Se hace por UI y no inyectando cookies a mano a propósito: así el estado guardado
 * es exactamente el que produce el flujo real, incluido lo que escriba el
 * middleware. Una sesión fabricada a mano puede diferir del artículo genuino justo
 * en el detalle que el criterio 1 quiere probar.
 */
export async function iniciarSesionPorUI(page: Page, clave: string): Promise<string> {
  const destino = rutaStorageState(clave);
  const credenciales = leerCredenciales();
  const usuario = credenciales[clave];

  if (!usuario) {
    throw new Error(
      `No hay credenciales para "${clave}". Claves disponibles: ${Object.keys(credenciales).join(', ')}`,
    );
  }

  await page.goto('/login');
  // Selectores por etiqueta EXACTA, y la razon no es estilistica: la pantalla
  // (plan 02-06) tiene un boton de mostrar/ocultar contrasena cuyo `aria-label`
  // es "Mostrar contraseña". Un `getByLabel(/contrase/i)` casa con el input Y con
  // ese boton, y Playwright falla por strict mode. El nombre accesible del boton
  // no se puede quitar: va sin texto visible y lo exige UI-SPEC §13.
  await page.getByLabel('Email').fill(usuario.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(usuario.password);
  await page.getByRole('button', { name: 'Entrar' }).click();

  // No basta con que el click no falle: hay que esperar a que el middleware haya
  // ruteado fuera de /login, o se guardaría un storageState sin sesión.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));

  await page.context().storageState({ path: destino });
  return destino;
}

async function paginaConSesion(browser: import('@playwright/test').Browser, clave: string) {
  const destino = rutaStorageState(clave);

  if (!existsSync(destino)) {
    // Primera vez en esta corrida: se paga el login una vez y se reutiliza.
    const contextoLogin = await browser.newContext();
    const paginaLogin = await contextoLogin.newPage();
    await iniciarSesionPorUI(paginaLogin, clave);
    await contextoLogin.close();
  }

  const contexto = await browser.newContext({ storageState: destino });
  return { contexto, pagina: await contexto.newPage() };
}

interface FixturesVivaGuest {
  /** Página con sesión de administrador ya iniciada. */
  paginaAdmin: Page;
  /** Página con sesión de aseador ya iniciada (el `aseador1` de la semilla). */
  paginaAseador: Page;
  /** Rol del usuario semilla secundario, para tests de aislamiento entre aseadores. */
  paginaAseador2: Page;
}

export const test = base.extend<FixturesVivaGuest>({
  paginaAdmin: async ({ browser }, use) => {
    const { contexto, pagina } = await paginaConSesion(browser, 'admin');
    await use(pagina);
    await contexto.close();
  },

  paginaAseador: async ({ browser }, use) => {
    const { contexto, pagina } = await paginaConSesion(browser, 'aseador1');
    await use(pagina);
    await contexto.close();
  },

  paginaAseador2: async ({ browser }, use) => {
    const { contexto, pagina } = await paginaConSesion(browser, 'aseador2');
    await use(pagina);
    await contexto.close();
  },
});

export type { RolE2E };
