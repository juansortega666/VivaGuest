import { randomUUID } from 'node:crypto';

import type { Browser, Page } from '@playwright/test';

import { expect, test } from './fixtures';
import { borrarSiExiste, cargarEnvLocal, clienteDeServicio } from './global-setup';

/**
 * Baja y reactivación de un aseador desde el navegador (ASEADOR-02, PLAT-04).
 *
 * ── ESTE SPEC USA SU PROPIA CUENTA, NO LA SEMILLA ───────────────────────────
 * Y no es preferencia. La baja de este plan aplica `ban_duration`, que invalida
 * las sesiones del usuario en GoTrue. Si se ejerciera sobre `aseador1` o
 * `aseador2`, el `storageState` compartido de `e2e/.auth/` quedaría muerto y los
 * specs siguientes fallarían por una sesión que este archivo mató, con el
 * síntoma a dos archivos de distancia de la causa. Es el mismo problema que el
 * plan 02-07 documentó con el scope global de `signOut()`, por otra vía.
 *
 * ── LOS CONTEOS SE SIEMBRAN Y SE EXIGEN EXACTOS ─────────────────────────────
 * Un assert de "aparece algún número" pasaría con el agrupado invertido. Se
 * siembran 3 como responsable y 2 como suplente, números DISTINTOS entre sí, y
 * se comprueban por separado.
 *
 * ── EL CRITERIO 4 DEL ROADMAP ───────────────────────────────────────────────
 * El test que lo cierra mantiene ABIERTA la sesión del aseador en otro contexto
 * de navegador mientras el admin lo desactiva desde la UI, y después recarga esa
 * pestaña. Un test que hiciera login después de la baja no probaría nada: eso
 * falla aunque la revocación sobre sesiones vivas esté completamente rota.
 */

const SUFIJO = randomUUID().slice(0, 8);
const EMAIL = `e2e.baja.${SUFIJO}@vivaguest.test`;
const PASSWORD = `e2e-baja-${randomUUID()}`;
const NOMBRE = 'Aseadora De Baja E2E';

const COMO_RESPONSABLE = 3;
const COMO_SUPLENTE = 2;

type Servicio = ReturnType<typeof clienteDeServicio>;

let servicio: Servicio;
let uid = '';
let idsResponsable: string[] = [];
let idsSuplente: string[] = [];
/** El apartamento que se activa para provocar el bloque ámbar. */
let idApartamentoActivado = '';

/** Login por UI con credenciales propias, en un contexto de navegador nuevo. */
async function abrirSesionDeLaAseadora(browser: Browser): Promise<{
  contexto: Awaited<ReturnType<Browser['newContext']>>;
  pagina: Page;
}> {
  const contexto = await browser.newContext();
  const pagina = await contexto.newPage();

  await pagina.goto('/login');
  await pagina.getByLabel('Email').fill(EMAIL);
  // Etiqueta EXACTA: el botón de mostrar/ocultar se llama "Mostrar contraseña" y
  // un selector laxo casaría con los dos (strict mode).
  await pagina.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await pagina.getByRole('button', { name: 'Entrar' }).click();
  await pagina.waitForURL(/\/mis-aseos$/);

  return { contexto, pagina };
}

/** La fila de la tabla que corresponde a la aseadora de este spec. */
function filaDeLaAseadora(pagina: Page) {
  return pagina.getByRole('row').filter({ hasText: NOMBRE });
}

async function abrirMenuDeLaAseadora(pagina: Page) {
  await filaDeLaAseadora(pagina)
    .getByRole('button', { name: `Acciones de ${NOMBRE}` })
    .click();
}

test.beforeAll(async () => {
  // El `globalSetup` cargó el entorno en SU proceso; este worker es otro.
  cargarEnvLocal();
  servicio = clienteDeServicio();

  await borrarSiExiste(servicio, EMAIL);

  const { data, error } = await servicio.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    app_metadata: { role: 'aseador' },
    user_metadata: { role: 'aseador', full_name: NOMBRE },
  });
  if (error) throw new Error(`No se pudo crear la aseadora del spec: ${error.message}`);
  uid = data.user.id;

  // Solo apartamentos gestionados: `props_assignees_only_when_managed` rechaza
  // responsable o suplente en una unidad informativa.
  const { data: candidatos, error: errorApartamentos } = await servicio
    .from('properties')
    .select('id, nombre')
    .eq('gestion_vivaguest', true)
    .order('nombre', { ascending: false })
    .limit(COMO_RESPONSABLE + COMO_SUPLENTE);

  if (errorApartamentos) throw new Error(errorApartamentos.message);
  if (!candidatos || candidatos.length < COMO_RESPONSABLE + COMO_SUPLENTE) {
    throw new Error('La semilla no tiene apartamentos gestionados suficientes.');
  }

  // Conjuntos DISJUNTOS: `props_suplente_distinct` prohíbe que el suplente sea
  // el mismo que el responsable en la misma fila.
  idsResponsable = candidatos.slice(0, COMO_RESPONSABLE).map((p) => p.id);
  idsSuplente = candidatos.slice(COMO_RESPONSABLE).map((p) => p.id);
  idApartamentoActivado = idsResponsable[0];

  // Se ordena DESCENDENTE por nombre a propósito: `aseadores-lista.spec.ts`
  // toma los primeros por orden ascendente, y el stack local es compartido.
  // Coger los mismos apartamentos desde los dos specs los haría pisarse.
  const asignarResponsable = await servicio
    .from('properties')
    .update({ responsable_id: uid })
    .in('id', idsResponsable);
  if (asignarResponsable.error) throw new Error(asignarResponsable.error.message);

  const asignarSuplente = await servicio
    .from('properties')
    .update({ suplente_id: uid })
    .in('id', idsSuplente);
  if (asignarSuplente.error) throw new Error(asignarSuplente.error.message);
});

test.afterAll(async () => {
  // El stack local es COMPARTIDO entre worktrees: dejar apartamentos con
  // asignaciones o activaciones fantasma envenena la corrida siguiente.
  if (idApartamentoActivado) {
    await servicio
      .from('properties')
      .update({ is_active: false, tarifa_huesped: null, pago_aseador: null })
      .eq('id', idApartamentoActivado);
  }
  if (idsResponsable.length > 0) {
    await servicio.from('properties').update({ responsable_id: null }).in('id', idsResponsable);
  }
  if (idsSuplente.length > 0) {
    await servicio.from('properties').update({ suplente_id: null }).in('id', idsSuplente);
  }
  if (uid) await servicio.auth.admin.deleteUser(uid);
});

test('el diálogo muestra los conteos exactos de lo sembrado, no una estimación', async ({
  paginaAdmin,
}) => {
  await paginaAdmin.goto('/aseadores');
  await abrirMenuDeLaAseadora(paginaAdmin);
  await paginaAdmin.getByRole('menuitem', { name: 'Desactivar' }).click();

  const dialogo = paginaAdmin.getByRole('alertdialog');

  await expect(dialogo.getByText(`Desactivar a ${NOMBRE}`)).toBeVisible();
  await expect(
    dialogo.getByText('Pierde el acceso de inmediato, aunque tenga la sesión abierta en el teléfono.'),
  ).toBeVisible();

  // Los dos conteos, por SEPARADO. Con un único assert sobre "aparece un 3", la
  // inversión de responsable y suplente pasaría inadvertida.
  await expect(
    dialogo.getByText(`Es responsable de ${COMO_RESPONSABLE} apartamentos`),
  ).toBeVisible();
  await expect(dialogo.getByText(`Es suplente en ${COMO_SUPLENTE} apartamentos`)).toBeVisible();

  // Los 34 apartamentos gestionados de la semilla están INACTIVOS, así que
  // ninguno de los 3 "queda sin responsable" en un sentido operativo: el bloque
  // ámbar NO debe aparecer. Su caso positivo es el test siguiente.
  await expect(dialogo.getByText(/quedan sin responsable/)).toHaveCount(0);

  // §11.3 y §4.6: el foco arranca en Cancelar, y el destructivo es el único
  // botón relleno del pie.
  await expect(dialogo.getByRole('button', { name: 'Cancelar' })).toBeFocused();

  await dialogo.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialogo).toHaveCount(0);
});

test('el bloque ámbar aparece solo cuando hay apartamentos ACTIVOS afectados', async ({
  paginaAdmin,
}) => {
  // Activar exige tarifas y responsable (`props_active_requires_rates` y
  // `props_active_requires_owner`). El responsable ya es ella.
  const { error } = await servicio
    .from('properties')
    .update({ tarifa_huesped: 120000, pago_aseador: 40000, is_active: true })
    .eq('id', idApartamentoActivado);
  if (error) throw new Error(`No se pudo activar el apartamento: ${error.message}`);

  await paginaAdmin.goto('/aseadores');
  await abrirMenuDeLaAseadora(paginaAdmin);
  await paginaAdmin.getByRole('menuitem', { name: 'Desactivar' }).click();

  const dialogo = paginaAdmin.getByRole('alertdialog');

  // UNO activo de los tres. El conteo del bloque es el de ACTIVOS, no el total:
  // si dijera 3, estaría inflando el daño con apartamentos que no generan aseos.
  await expect(
    dialogo.getByText(
      'Esos 1 apartamento quedan sin responsable. Los aseos nuevos no se van a poder confirmar hasta que asignes a otra persona.',
    ),
  ).toBeVisible();

  // Y el conteo de arriba sigue siendo el total, no el de activos.
  await expect(
    dialogo.getByText(`Es responsable de ${COMO_RESPONSABLE} apartamentos`),
  ).toBeVisible();

  await dialogo.getByRole('button', { name: 'Cancelar' }).click();
});

test('CRITERIO 4: la aseadora con la sesión abierta rebota a /login tras la baja', async ({
  paginaAdmin,
  browser,
}) => {
  // ── 1. La aseadora entra y se QUEDA dentro ────────────────────────────────
  const { contexto, pagina } = await abrirSesionDeLaAseadora(browser);

  try {
    await expect(pagina).toHaveURL(/\/mis-aseos$/);

    // ── 2. El admin la desactiva DESDE LA UI ────────────────────────────────
    // Por la UI y no por API: así el test ejerce la Server Action completa, con
    // sus dos mitades. Desactivar por API solo probaría el middleware.
    await paginaAdmin.goto('/aseadores');
    await abrirMenuDeLaAseadora(paginaAdmin);
    await paginaAdmin.getByRole('menuitem', { name: 'Desactivar' }).click();
    await paginaAdmin
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Desactivar' })
      .click();

    // Copy de §15. El contrato descarta la forma con concordancia de género.
    await expect(paginaAdmin.getByText(`${NOMBRE} ya no tiene acceso.`)).toBeVisible();

    // ── 3. La fila NO desaparece: cambia de estado (§11.1) ──────────────────
    const fila = filaDeLaAseadora(paginaAdmin);
    await expect(fila).toHaveCount(1);
    await expect(fila.getByText('Inactivo', { exact: true })).toBeVisible();

    // ── 4. LA SESIÓN QUE YA ESTABA ABIERTA DEJA DE VALER ────────────────────
    // Sin volver a hacer login y sin tocar sus cookies: solo se recarga.
    await pagina.reload();
    await expect(pagina).toHaveURL(/\/login$/);
  } finally {
    await contexto.close();
  }
});

test('reactivar desde el menú la deja Activa Y pudiendo entrar de verdad', async ({
  paginaAdmin,
  browser,
}) => {
  await paginaAdmin.goto('/aseadores');
  await abrirMenuDeLaAseadora(paginaAdmin);

  // Reactivar NO pide confirmación: no revoca nada.
  await paginaAdmin.getByRole('menuitem', { name: 'Reactivar' }).click();
  await expect(paginaAdmin.getByText('Cambios guardados.')).toBeVisible();

  const fila = filaDeLaAseadora(paginaAdmin);
  await expect(fila.getByText('Activo', { exact: true })).toBeVisible();

  // ── LA SEGUNDA MITAD, que es donde está el bug silencioso ────────────────
  // Que la lista diga `Activo` no prueba nada: reactivar solo `profiles.is_active`
  // deja al usuario en `user_banned` y sin poder entrar. Lo único que lo
  // demuestra es un login real.
  const { contexto, pagina } = await abrirSesionDeLaAseadora(browser);
  try {
    await expect(pagina).toHaveURL(/\/mis-aseos$/);
  } finally {
    await contexto.close();
  }
});
