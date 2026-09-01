import { expect, test } from './fixtures';

/**
 * Cableado del middleware: que `resolverRedireccion()` este de verdad conectado a
 * una peticion real, con la sesion real, en el build de produccion.
 *
 * La TABLA de decision ya se prueba en `lib/auth/routing.test.ts`, en
 * milisegundos y sin navegador. Lo que estos casos anaden es lo que un test puro
 * no puede ver: que el rol se lea de `app_metadata`, que el matcher deje pasar la
 * ruta, y que la redireccion conserve las cookies de sesion.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DECISION DEL PLAN, escrita aqui para que no se reabra: en esta wave
 * `/apartamentos` NO existe como pagina (la construye el plan 02-07) y responde
 * 404. Estos tests comprueban `page.url()` y NUNCA el contenido de la pagina
 * destino. La alternativa era crear un placeholder en `app/(admin)/` que 02-07
 * reescribiria entero, lo que genera un conflicto de archivo entre planes sin
 * comprar nada: el ruteo ocurre completo ANTES de que la pagina exista, asi que
 * un placeholder no haria mas fuerte a ninguna de estas aserciones.
 * ─────────────────────────────────────────────────────────────────────────────
 */

test.describe('Sin sesion', () => {
  test('una ruta protegida manda a /login', async ({ page }) => {
    await page.goto('/apartamentos');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('la superficie del aseador tambien manda a /login', async ({ page }) => {
    await page.goto('/mis-aseos');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('la raiz manda a /login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe('Aseador autenticado', () => {
  test('navegar a /apartamentos rebota a /mis-aseos', async ({ paginaAseador }) => {
    await paginaAseador.goto('/apartamentos');
    await expect(paginaAseador).toHaveURL(/\/mis-aseos$/);
  });

  test('la raiz lo lleva a /mis-aseos', async ({ paginaAseador }) => {
    await paginaAseador.goto('/');
    await expect(paginaAseador).toHaveURL(/\/mis-aseos$/);
  });

  test('/login lo devuelve a su raiz', async ({ paginaAseador }) => {
    await paginaAseador.goto('/login');
    await expect(paginaAseador).toHaveURL(/\/mis-aseos$/);
  });
});

test.describe('Admin autenticado', () => {
  test('navegar a /mis-aseos rebota a /apartamentos', async ({ paginaAdmin }) => {
    await paginaAdmin.goto('/mis-aseos');
    await expect(paginaAdmin).toHaveURL(/\/apartamentos$/);
  });

  test('la raiz lo lleva a /apartamentos', async ({ paginaAdmin }) => {
    await paginaAdmin.goto('/');
    await expect(paginaAdmin).toHaveURL(/\/apartamentos$/);
  });

  test('/login lo devuelve a su raiz', async ({ paginaAdmin }) => {
    await paginaAdmin.goto('/login');
    await expect(paginaAdmin).toHaveURL(/\/apartamentos$/);
  });
});

test.describe('Cierre de sesion', () => {
  test('cerrar sesion deja al aseador en /login y sin acceso', async ({
    paginaAseador2,
  }) => {
    await paginaAseador2.goto('/mis-aseos');
    await paginaAseador2.getByRole('button', { name: 'Cerrar sesión' }).click();

    await expect(paginaAseador2).toHaveURL(/\/login$/);

    // Y la sesion se fue de verdad: volver a la ruta protegida rebota otra vez.
    // Sin esta segunda mitad, el test pasaria aunque `signOut()` no borrara nada
    // y solo hubiera un `redirect`.
    await paginaAseador2.goto('/mis-aseos');
    await expect(paginaAseador2).toHaveURL(/\/login$/);
  });
});
