import { expect, leerCredenciales, test } from './fixtures';

/**
 * CRITERIO 1 DEL ROADMAP: login por rol con sesion persistente.
 *
 * Este es el unico archivo de la suite que hace login tecleando en la pantalla.
 * El resto arranca con `storageState` ya puesto: un test de otra cosa que empieza
 * por el login se cae por razones que no tienen que ver con lo que mide.
 */

test.describe('Login por rol', () => {
  test('el admin entra y aterriza en /operacion', async ({ page }) => {
    const { admin } = leerCredenciales();

    await page.goto('/login');
    await page.getByLabel('Email').fill(admin.email);
    await page.getByLabel('Contraseña', { exact: true }).fill(admin.password);
    await page.getByRole('button', { name: 'Entrar' }).click();

    // La pantalla de login redirige a `/` y es el MIDDLEWARE quien elige la raiz
    // segun `app_metadata.role`. Lo que este test mide es el RUTEO, no la
    // pantalla de destino.
    //
    // La raiz del admin es `/operacion` desde el plan 04-09, no `/apartamentos`:
    // el dashboard operativo es lo que se abre para trabajar y el catalogo es
    // donde se va a configurar. La tabla vive en `lib/auth/routing.test.ts`.
    await expect(page).toHaveURL(/\/operacion$/);
  });

  test('el aseador entra y aterriza en /mis-aseos', async ({ page }) => {
    const { aseador1 } = leerCredenciales();

    await page.goto('/login');
    await page.getByLabel('Email').fill(aseador1.email);
    await page.getByLabel('Contraseña', { exact: true }).fill(aseador1.password);
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page).toHaveURL(/\/mis-aseos$/);
    // Su superficie, no la del admin. El stub existe justamente para poder
    // afirmar esto con una asercion de contenido y no solo de URL.
    await expect(page.getByRole('heading', { name: 'Mis aseos' })).toBeVisible();
  });

  /**
   * ─────────────────────────────────────────────────────────────────────────
   * LA ASERCION CENTRAL DEL CRITERIO 1. No borrar, no relajar.
   *
   * Una recarga real es lo unico que ejerce el camino completo: el navegador
   * manda las cookies, el middleware corre `getUser()`, `setAll` reescribe las
   * cookies refrescadas en el response y el navegador las vuelve a guardar. Si
   * `setAll` esta mal implementado, o si el `NextResponse` se reconstruye sin
   * copiar las cookies, la sesion se pierde justo aqui y no en el login.
   *
   * Con dos usuarios en desarrollo nadie notaria el fallo a mano: hace falta
   * volver a cargar en el momento justo en que el token se refresca. Este test
   * lo fuerza en cada corrida.
   * ─────────────────────────────────────────────────────────────────────────
   */
  test('la sesion sobrevive a una recarga de pagina', async ({ page }) => {
    const { aseador1 } = leerCredenciales();

    await page.goto('/login');
    await page.getByLabel('Email').fill(aseador1.email);
    await page.getByLabel('Contraseña', { exact: true }).fill(aseador1.password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL(/\/mis-aseos$/);

    await page.reload();

    // Sigue dentro. Si la sesion no persistiera, el middleware habria mandado a
    // /login, que es exactamente el sintoma de "los usuarios se desloguean solos".
    await expect(page).toHaveURL(/\/mis-aseos$/);
    await expect(page.getByRole('heading', { name: 'Mis aseos' })).toBeVisible();

    // Y una segunda recarga: el primer refresco de cookies es el que puede
    // dejarlas desincronizadas sin que la primera navegacion lo note.
    await page.reload();
    await expect(page).toHaveURL(/\/mis-aseos$/);
  });

  /**
   * ─────────────────────────────────────────────────────────────────────────
   * NO se comprueba aqui el `Cache-Control` anti-cache del middleware, y no es
   * un olvido: se intento y era un FALSO VERDE.
   *
   * La version descartada recargaba con sesion y afirmaba que la respuesta
   * traia `no-store`. Pasaba. Se rompio `setAll` a proposito, dejandolo en la
   * firma de un argumento, y **seguia pasando**: Next marca `no-store` por su
   * cuenta en toda ruta dinamica, asi que la asercion media el default del
   * framework, no el trabajo del middleware. Habria dado confianza con el
   * agujero abierto, que es peor que no tener test.
   *
   * Esa invariante se mide donde si tiene dientes, en
   * `lib/supabase/middleware.test.ts`: se invoca `setAll` con sus dos
   * argumentos igual que lo hace `@supabase/ssr` y se comprueba que las
   * cabeceras acaban en el response. Ese test SI se pone rojo con el senuelo.
   * ─────────────────────────────────────────────────────────────────────────
   */
});

test.describe('Errores de credenciales', () => {
  test('credenciales malas muestran el mensaje del contrato', async ({ page }) => {
    const { aseador1 } = leerCredenciales();

    await page.goto('/login');
    await page.getByLabel('Email').fill(aseador1.email);
    await page.getByLabel('Contraseña', { exact: true }).fill('contrasena-incorrecta');
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page.getByText('Email o contraseña incorrectos.')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('un email inexistente muestra EL MISMO mensaje', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('no.existe.jamas@vivaguest.test');
    await page.getByLabel('Contraseña', { exact: true }).fill('cualquier-cosa-larga');
    await page.getByRole('button', { name: 'Entrar' }).click();

    // Identico al test anterior, y eso es el punto: si algun dia alguien
    // "mejora" el copy para decir que el email no existe, este test se cae. Es
    // la unica defensa contra la enumeracion de usuarios por credenciales.
    await expect(page.getByText('Email o contraseña incorrectos.')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });
});
