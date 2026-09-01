import { randomUUID } from 'node:crypto';

import { expect, test } from './fixtures';
import { borrarSiExiste, cargarEnvLocal, clienteDeServicio } from './global-setup';

/**
 * Alta de aseador de punta a punta (ASEADOR-01, UI-SPEC §11.2).
 *
 * EL TEST QUE CIERRA EL REQUISITO es el último: coge la contraseña que el diálogo
 * mostró UNA vez, abre un contexto de navegador nuevo, y entra con ella. Sin ese
 * test, todo lo demás demuestra que la pantalla se pinta, no que el alta produzca
 * una cuenta que sirva. Y como la contraseña no se persiste en ningún sitio, el
 * único modo de obtenerla es leerla de la pantalla, igual que hace el admin.
 */

/** Sufijo único por corrida: dos ejecuciones seguidas no pueden colisionar. */
const SUFIJO = randomUUID().slice(0, 8);
const EMAIL = `e2e.alta.${SUFIJO}@vivaguest.test`;
const NOMBRE = `Aseador Alta ${SUFIJO}`;
const TELEFONO = '3001112233';

test.beforeAll(async () => {
  // El `globalSetup` cargó el entorno en SU proceso; este worker es otro.
  cargarEnvLocal();
});

test.afterAll(async () => {
  // El stack local es compartido entre worktrees: lo que siembra este spec lo
  // limpia este spec, o la siguiente corrida arranca con un `email_exists`.
  await borrarSiExiste(clienteDeServicio(), EMAIL);
});

/**
 * Abre el diálogo desde la cabecera de `/aseadores` y devuelve su locator.
 *
 * TODO lo del formulario se busca DENTRO del diálogo, nunca en la página: el
 * disparador y el botón de envío comparten el nombre accesible `Crear aseador`
 * (§15 fija ese copy para los dos), así que un `getByRole` a nivel de página
 * encontraría dos y fallaría por strict mode, o peor, acertaría el equivocado.
 */
async function abrirDialogo(pagina: import('@playwright/test').Page) {
  await pagina.goto('/aseadores');
  await pagina.getByRole('button', { name: 'Crear aseador' }).first().click();

  const dialogo = pagina.getByRole('dialog');
  await expect(dialogo).toBeVisible();
  return dialogo;
}

/**
 * Pulsa `Generar` y espera a que el campo tenga valor ANTES de leerlo.
 *
 * `generarPassword()` es una Server Action: entre el click y el valor hay un
 * viaje de red. Un `inputValue()` inmediato lee la cadena vacía, y el fallo sale
 * en el assert de longitud tres líneas más abajo, apuntando al generador en vez
 * de a la carrera. Medido: la primera versión de este spec falló así en cuatro
 * tests a la vez.
 */
async function generarPassword(dialogo: import('@playwright/test').Locator) {
  const campo = dialogo.getByLabel('Contraseña temporal');
  await dialogo.getByRole('button', { name: 'Generar' }).click();
  await expect(campo).not.toHaveValue('');
  return campo.inputValue();
}

test('el botón Generar llena el campo con una contraseña de al menos 12 caracteres', async ({
  paginaAdmin,
}) => {
  const dialogo = await abrirDialogo(paginaAdmin);

  const campo = dialogo.getByLabel('Contraseña temporal');
  await expect(campo).toHaveValue('');

  await dialogo.getByRole('button', { name: 'Generar' }).click();

  await expect(campo).not.toHaveValue('');
  const generada = await campo.inputValue();

  // El mínimo que la Admin API NO impone (medido en 02-RESEARCH §6.1) y que el
  // Zod de la action es el único en imponer.
  expect(generada.length).toBeGreaterThanOrEqual(12);

  // Y de solo lectura: el valor que se muestra tiene que ser exactamente el que
  // se va a guardar.
  await expect(campo).toHaveAttribute('readonly', '');
});

test('el copy fijo del diálogo dice que el aseador no se registra solo', async ({
  paginaAdmin,
}) => {
  const dialogo = await abrirDialogo(paginaAdmin);

  await expect(
    dialogo.getByText(
      'El aseador no puede registrarse por su cuenta. Esta cuenta la creas tú y le entregas la contraseña.',
    ),
  ).toBeVisible();
});

test('crear un aseador NO cierra el diálogo: pasa al estado de entrega', async ({
  paginaAdmin,
}) => {
  const dialogo = await abrirDialogo(paginaAdmin);

  await dialogo.getByLabel('Nombre').fill(NOMBRE);
  await dialogo.getByLabel('Email').fill(EMAIL);
  await dialogo.getByLabel('Teléfono').fill(TELEFONO);
  const password = await generarPassword(dialogo);
  expect(password.length).toBeGreaterThanOrEqual(12);

  await dialogo.getByRole('button', { name: 'Crear aseador' }).click();

  // LA PROPIEDAD QUE MANDA: sigue abierto. Si se cerrara, la contraseña se
  // perdería, porque no se persiste en ninguna parte.
  await expect(dialogo).toBeVisible();
  await expect(dialogo.getByText(`Cuenta creada para ${NOMBRE}`)).toBeVisible();

  // El email y la contraseña se muestran para entregarlos.
  await expect(dialogo.getByText(EMAIL, { exact: true })).toBeVisible();
  await expect(dialogo.getByText(password, { exact: true })).toBeVisible();

  // El aviso de una sola vez, literal de §11.2.
  await expect(
    dialogo.getByText('Esta contraseña no se vuelve a mostrar. Entrégasela ahora.'),
  ).toBeVisible();

  // Y el formulario ya no está: no se puede volver a enviar por accidente.
  await expect(dialogo.getByLabel('Nombre')).toHaveCount(0);

  await dialogo.getByRole('button', { name: 'Listo' }).click();
  await expect(dialogo).toHaveCount(0);
});

test('la fila aparece en la tabla después de cerrar el diálogo', async ({ paginaAdmin }) => {
  await paginaAdmin.goto('/aseadores');

  const fila = paginaAdmin.getByRole('row').filter({ hasText: NOMBRE });
  await expect(fila).toHaveCount(1);
  // El alta la crea activa: el trigger materializa `is_active = true`.
  await expect(fila.getByText('Activo', { exact: true })).toBeVisible();
  await expect(fila.getByText(TELEFONO)).toBeVisible();
});

test('el botón Copiar del estado de entrega anuncia el copiado', async ({ paginaAdmin }) => {
  // El portapapeles necesita permiso explícito en Chromium; sin esto
  // `navigator.clipboard.writeText` rechaza y el icono nunca pasaría a `Check`.
  await paginaAdmin
    .context()
    .grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: new URL(paginaAdmin.url() || 'http://127.0.0.1:3000').origin,
    })
    .catch(() => {
      // Firefox y WebKit no soportan `grantPermissions` de portapapeles. El test
      // sigue siendo válido: la rama de fallo también anuncia por `aria-live`.
    });

  const emailCopia = `e2e.copia.${randomUUID().slice(0, 8)}@vivaguest.test`;

  try {
    const dialogo = await abrirDialogo(paginaAdmin);
    await dialogo.getByLabel('Nombre').fill('Aseador De Copia');
    await dialogo.getByLabel('Email').fill(emailCopia);
    await generarPassword(dialogo);
    await dialogo.getByRole('button', { name: 'Crear aseador' }).click();

    await expect(dialogo.getByText(emailCopia, { exact: true })).toBeVisible();

    await dialogo.getByRole('button', { name: 'Copiar email' }).click();

    // §13 exige `aria-live="polite"` para la confirmación de copiado: un cambio
    // de icono no lo oye nadie.
    await expect(dialogo.getByText(/copiado al portapapeles|No se pudo copiar/)).toBeAttached();
  } finally {
    await borrarSiExiste(clienteDeServicio(), emailCopia);
  }
});

test('un email repetido se pinta BAJO el campo, no en un toast', async ({ paginaAdmin }) => {
  const dialogo = await abrirDialogo(paginaAdmin);

  await dialogo.getByLabel('Nombre').fill('Aseador Duplicado');
  await dialogo.getByLabel('Email').fill(EMAIL); // ya existe
  await generarPassword(dialogo);
  await dialogo.getByRole('button', { name: 'Crear aseador' }).click();

  const campoEmail = dialogo.getByLabel('Email');

  // El mensaje literal de `mapAuthError` para `email_exists`.
  const mensaje = dialogo.getByText('Ya existe una cuenta con ese email.');
  await expect(mensaje).toBeVisible();

  // Y ESTA es la mitad que de verdad prueba §9.4: no basta con que el mensaje
  // aparezca en algún sitio, tiene que estar ANCLADO al input por
  // `aria-describedby`. Con el mensaje en un toast, este assert falla.
  await expect(campoEmail).toHaveAttribute('aria-invalid', 'true');
  const idDescripcion = await campoEmail.getAttribute('aria-describedby');
  expect(idDescripcion).toBeTruthy();
  await expect(paginaAdmin.locator(`#${idDescripcion}`)).toHaveText(
    'Ya existe una cuenta con ese email.',
  );

  // El diálogo sigue abierto y conserva lo escrito.
  await expect(dialogo.getByLabel('Nombre')).toHaveValue('Aseador Duplicado');
});

test('el aseador creado puede iniciar sesión y aterriza en /mis-aseos', async ({
  paginaAdmin,
  browser,
}) => {
  // ESTE TEST SE CREA SU PROPIA CUENTA en vez de reutilizar la del test de
  // arriba, y la razón es concreta: Playwright REINICIA el worker cuando un test
  // falla, así que una credencial pasada entre tests por `process.env` desaparece
  // en cuanto cualquier test anterior se pone rojo. El síntoma sería este test
  // fallando por "no hay contraseña" en vez de por lo que dice medir. Medido en
  // la primera corrida de este spec.
  const emailLogin = `e2e.login.${randomUUID().slice(0, 8)}@vivaguest.test`;

  try {
    const dialogo = await abrirDialogo(paginaAdmin);
    await dialogo.getByLabel('Nombre').fill('Aseador Que Entra');
    await dialogo.getByLabel('Email').fill(emailLogin);
    const password = await generarPassword(dialogo);
    await dialogo.getByRole('button', { name: 'Crear aseador' }).click();

    // La contraseña se LEE DE LA PANTALLA, que es el único sitio donde existe:
    // no se persiste en `profiles`, ni en un log, ni en la URL. Exactamente lo
    // mismo que hace el admin antes de dictarla por teléfono.
    await expect(dialogo.getByText(password, { exact: true })).toBeVisible();
    await dialogo.getByRole('button', { name: 'Listo' }).click();

    // Contexto NUEVO, sin `storageState`: un navegador que nunca vio esta app,
    // igual que el teléfono del aseador al que le acaban de dictar la clave.
    const contexto = await browser.newContext();
    const pagina = await contexto.newPage();

    try {
      await pagina.goto('/login');
      await pagina.getByLabel('Email').fill(emailLogin);
      await pagina.getByLabel('Contraseña', { exact: true }).fill(password);
      await pagina.getByRole('button', { name: 'Entrar' }).click();

      // La prueba de punta a punta de ASEADOR-01: el alta no produce una fila en
      // una tabla, produce una cuenta que ENTRA y aterriza donde le toca.
      await pagina.waitForURL(/\/mis-aseos$/);
      await expect(pagina.getByRole('heading', { name: 'Mis aseos' })).toBeVisible();
    } finally {
      await contexto.close();
    }
  } finally {
    await borrarSiExiste(clienteDeServicio(), emailLogin);
  }
});
