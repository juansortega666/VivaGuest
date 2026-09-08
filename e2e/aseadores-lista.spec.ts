import { expect, iniciarSesionPorUI, test } from './fixtures';
import { cargarEnvLocal, clienteDeServicio } from './global-setup';

/**
 * `/aseadores` — ASEADOR-03 (UI-SPEC §11.1).
 *
 * LOS CONTEOS SE CONSULTAN, NO SE ESTIMAN. El spec siembra un numero CONOCIDO de
 * asignaciones y despues exige ese numero exacto en pantalla. Un test que
 * afirmara "aparece algun numero" pasaria igual con el agrupado invertido
 * (responsable donde va suplente), que es el error mas facil de cometer aqui.
 */

const ASEADOR_UNO = 'Aseador Uno E2E';
const ASEADOR_DOS = 'Aseador Dos E2E';

/** Cuantos apartamentos se le asignan a `Aseador Uno E2E` en cada rol. */
const COMO_RESPONSABLE = 3;
const COMO_SUPLENTE = 2;

type Servicio = ReturnType<typeof clienteDeServicio>;

/** El perfil no guarda el email, asi que el id se busca por la API de auth. */
async function idPorEmail(admin: Servicio, email: string): Promise<string> {
  let pagina = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: 200 });
    if (error) throw new Error(`No se pudo listar usuarios: ${error.message}`);
    const encontrado = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (encontrado) return encontrado.id;
    if (data.users.length < 200) throw new Error(`No existe el usuario E2E ${email}`);
    pagina += 1;
  }
}

let servicio: Servicio;
let idsResponsable: string[] = [];
let idsSuplente: string[] = [];
let nombresResponsable: string[] = [];
let nombresSuplente: string[] = [];
let idAseadorDos = '';

test.beforeAll(async () => {
  // El `globalSetup` cargo el entorno en SU proceso; este worker es otro.
  cargarEnvLocal();
  servicio = clienteDeServicio();

  const idUno = await idPorEmail(servicio, 'e2e.aseador1@vivaguest.test');

  // Solo apartamentos bajo gestion VivaGuest: `props_assignees_only_when_managed`
  // rechaza responsable o suplente en una unidad informativa.
  const { data: candidatos, error } = await servicio
    .from('properties')
    .select('id, nombre')
    .eq('gestion_vivaguest', true)
    .order('nombre', { ascending: true })
    .limit(COMO_RESPONSABLE + COMO_SUPLENTE);

  if (error) throw new Error(`No se pudieron leer apartamentos: ${error.message}`);
  if (!candidatos || candidatos.length < COMO_RESPONSABLE + COMO_SUPLENTE) {
    throw new Error('La semilla no tiene apartamentos gestionados suficientes.');
  }

  // Conjuntos DISJUNTOS: `props_suplente_distinct` prohibe que el suplente sea el
  // mismo que el responsable en la misma fila.
  const paraResponsable = candidatos.slice(0, COMO_RESPONSABLE);
  const paraSuplente = candidatos.slice(COMO_RESPONSABLE);

  idsResponsable = paraResponsable.map((p) => p.id);
  idsSuplente = paraSuplente.map((p) => p.id);
  nombresResponsable = paraResponsable.map((p) => p.nombre);
  nombresSuplente = paraSuplente.map((p) => p.nombre);

  const asignarResponsable = await servicio
    .from('properties')
    .update({ responsable_id: idUno })
    .in('id', idsResponsable);
  if (asignarResponsable.error) throw new Error(asignarResponsable.error.message);

  const asignarSuplente = await servicio
    .from('properties')
    .update({ suplente_id: idUno })
    .in('id', idsSuplente);
  if (asignarSuplente.error) throw new Error(asignarSuplente.error.message);

  // Se desactiva al SEGUNDO aseador por API, con el cliente de servicio, para
  // comprobar que sigue en la lista. Se hace por fuera de la UI a proposito: el
  // alta y la baja son de los planes 02-08 y 02-09, y este spec no puede depender
  // de pantallas que todavia no existen.
  //
  // `deactivated_at` va JUNTO con `is_active`, y no es opcional: el CHECK
  // `profiles_deactivation_coherent` exige `is_active = (deactivated_at is null)`.
  // Bajar solo el booleano devuelve un 23514. Medido aqui, y es lo primero que
  // tiene que saber la Server Action de baja del plan 02-09.
  idAseadorDos = await idPorEmail(servicio, 'e2e.aseador2@vivaguest.test');
  const baja = await servicio
    .from('profiles')
    .update({ is_active: false, deactivated_at: new Date().toISOString() })
    .eq('id', idAseadorDos);
  if (baja.error) throw new Error(baja.error.message);
});

test.afterAll(async ({ browser }) => {
  // El stack local es COMPARTIDO entre worktrees: dejar 39 apartamentos con
  // asignaciones fantasma envenena la corrida siguiente y el sintoma aparece muy
  // lejos de la causa. `global-teardown` borra los usuarios, pero los apartamentos
  // son semilla y sobreviven.
  if (idsResponsable.length > 0) {
    await servicio.from('properties').update({ responsable_id: null }).in('id', idsResponsable);
  }
  if (idsSuplente.length > 0) {
    await servicio.from('properties').update({ suplente_id: null }).in('id', idsSuplente);
  }

  // Y se reactiva al aseador2. `global-teardown` borra los usuarios, pero corre al
  // final de TODA la suite: `ruteo.spec.ts` se ejecuta entre medias y merece
  // encontrar la semilla como la dejo el `globalSetup`.
  if (idAseadorDos) {
    await servicio
      .from('profiles')
      .update({ is_active: true, deactivated_at: null })
      .eq('id', idAseadorDos);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Y SE REHACE LA SESION DEL ADMIN. No es paranoia: el test de cierre de sesion
  // de este archivo llama a `signOut()`, cuyo scope por defecto es GLOBAL, asi
  // que GoTrue borra TODAS las sesiones del usuario, incluida la que vive en el
  // `storageState` compartido de `e2e/.auth/admin.storage.json`. Ese archivo lo
  // reutilizan los demas specs, y este corre PRIMERO por orden alfabetico:
  // sin rehacerlo, `ruteo.spec.ts` fallaria por una sesion muerta y el sintoma
  // aparecería a dos archivos de distancia de la causa.
  //
  // El plan 02-06 esquivo lo mismo usando `aseador2` como usuario de sacrificio.
  // Aqui no hay un segundo admin, asi que se repara en vez de esquivar.
  // ───────────────────────────────────────────────────────────────────────────
  const contexto = await browser.newContext();
  const pagina = await contexto.newPage();
  await iniciarSesionPorUI(pagina, 'admin');
  await contexto.close();
});

test('la tabla trae una fila por aseador semilla, mas el encabezado', async ({ paginaAdmin }) => {
  await paginaAdmin.goto('/aseadores');

  await expect(paginaAdmin.getByRole('heading', { name: 'Aseadores', level: 1 })).toBeVisible();

  // El numero esperado se CONSULTA a la base, no se escribe a mano: si algun dia
  // la semilla trae otro aseador, el test sigue midiendo lo que dice medir.
  const { count, error } = await servicio
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'aseador');
  if (error) throw new Error(error.message);

  await expect(paginaAdmin.getByRole('row')).toHaveCount((count ?? 0) + 1);
  await expect(paginaAdmin.getByRole('row').filter({ hasText: ASEADOR_UNO })).toHaveCount(1);
});

test('el estado va como TEXTO en el DOM, no solo como color', async ({ paginaAdmin }) => {
  await paginaAdmin.goto('/aseadores');

  const filaUno = paginaAdmin.getByRole('row').filter({ hasText: ASEADOR_UNO });
  await expect(filaUno.getByText('Activo', { exact: true })).toBeVisible();
});

test('los conteos coinciden exactamente con lo sembrado', async ({ paginaAdmin }) => {
  await paginaAdmin.goto('/aseadores');

  const filaUno = paginaAdmin.getByRole('row').filter({ hasText: ASEADOR_UNO });

  // Los dos conteos se comprueban por separado: si el agrupado invirtiera
  // responsable y suplente, un unico assert sobre "aparece un 3" pasaria igual.
  await expect(
    filaUno.getByRole('button', { name: `Responsable de: ${COMO_RESPONSABLE} apartamentos` }),
  ).toBeVisible();
  await expect(
    filaUno.getByRole('button', { name: `Suplente en: ${COMO_SUPLENTE} apartamentos` }),
  ).toBeVisible();

  // El aseador sin ninguna asignacion muestra cero, y no una celda en blanco.
  const filaDos = paginaAdmin.getByRole('row').filter({ hasText: ASEADOR_DOS });
  await expect(filaDos.getByText('0 apartamentos').first()).toBeVisible();
});

test('el popover lista los nombres de los apartamentos, no solo el conteo', async ({
  paginaAdmin,
}) => {
  await paginaAdmin.goto('/aseadores');

  const filaUno = paginaAdmin.getByRole('row').filter({ hasText: ASEADOR_UNO });
  await filaUno
    .getByRole('button', { name: `Responsable de: ${COMO_RESPONSABLE} apartamentos` })
    .click();

  for (const nombre of nombresResponsable) {
    await expect(paginaAdmin.getByRole('listitem').filter({ hasText: nombre })).toBeVisible();
  }

  // Y los del OTRO rol no se cuelan en este popover.
  for (const nombre of nombresSuplente) {
    await expect(paginaAdmin.getByRole('listitem').filter({ hasText: nombre })).toHaveCount(0);
  }
});

test('un aseador desactivado sigue en la lista, marcado Inactivo', async ({ paginaAdmin }) => {
  await paginaAdmin.goto('/aseadores');

  const filaDos = paginaAdmin.getByRole('row').filter({ hasText: ASEADOR_DOS });

  await expect(filaDos).toHaveCount(1);
  await expect(filaDos.getByText('Inactivo', { exact: true })).toBeVisible();
});

test('el teléfono vacío se anuncia como "sin definir", no como una celda muda', async ({
  paginaAdmin,
}) => {
  await paginaAdmin.goto('/aseadores');

  const filaDos = paginaAdmin.getByRole('row').filter({ hasText: ASEADOR_DOS });
  await expect(filaDos.getByText('sin definir')).toBeAttached();
});

test('el link activo de la barra lleva aria-current', async ({ paginaAdmin }) => {
  await paginaAdmin.goto('/aseadores');

  await expect(paginaAdmin.getByRole('link', { name: 'Aseadores' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(paginaAdmin.getByRole('link', { name: 'Apartamentos' })).not.toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('el menú de usuario del shell cierra la sesión', async ({ paginaAdmin }) => {
  await paginaAdmin.goto('/aseadores');

  await paginaAdmin.getByRole('button', { name: /Admin E2E/ }).click();
  await paginaAdmin.getByRole('menuitem', { name: 'Cerrar sesión' }).click();

  await paginaAdmin.waitForURL(/\/login$/);

  // No basta con aterrizar en /login: sin la segunda mitad, el test pasaria
  // aunque `signOut()` no borrara nada y solo hubiera un redirect.
  await paginaAdmin.goto('/aseadores');
  await expect(paginaAdmin).toHaveURL(/\/login$/);
});

test('un aseador no llega a la lista del admin', async ({ paginaAseador }) => {
  // El guard de `app/(admin)/layout.tsx` es la tercera capa y no se puede ver
  // desde aqui: el middleware rebota antes. Lo que este test fija es que la ruta
  // nueva entra en el ruteo por rol, en vez de quedar como un hueco por el que
  // un aseador llega a una pantalla del admin.
  await paginaAseador.goto('/aseadores');

  await expect(paginaAseador).toHaveURL(/\/mis-aseos$/);
  await expect(paginaAseador.getByRole('heading', { name: 'Mis aseos' })).toBeVisible();
});
