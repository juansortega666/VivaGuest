import { expect, test } from './fixtures';
import { cargarEnvLocal, clienteDeServicio } from './global-setup';

/**
 * `/apartamentos` — APTO-11 y la mitad del criterio 5 del ROADMAP (UI-SPEC §7).
 *
 * ── EL FIXTURE TIENE QUE DISCRIMINAR, O EL TEST NO MIDE NADA ────────────────
 * La semilla de la Fase 1 son 39 filas con las tarifas nulas e `is_active false`,
 * asi que el dia uno TODAS las gestionadas son `Incompleta` y todas las externas
 * son `Informativa`. Sobre ese catalogo, un test que dijera "aparece el texto
 * Incompleta" pasaria igual con un componente que ignora sus props y pinta
 * siempre la misma etiqueta, y no habria forma de notar que `Activa` e `Inactiva`
 * no se renderizan nunca.
 *
 * Por eso el `beforeAll` siembra EXACTAMENTE UNA fila de cada uno de los dos
 * estados que faltan, y las aserciones exigen el conteo EXACTO de cada etiqueta:
 * 1 Activa, 1 Inactiva, 32 Incompletas y 5 Informativas. Con un componente que
 * hardcodee cualquier estado, tres de los cuatro conteos se caen.
 *
 * Los dos estados sembrados no son intercambiables y por eso hacen falta los dos:
 * `Inactiva` es una unidad gestionada, COMPLETA y pausada a proposito; sin ella,
 * `Incompleta` se comeria su sitio y una pausa deliberada se veria igual que un
 * dato que falta.
 *
 * ── Y LAS ETIQUETAS SE CUENTAN DENTRO DE LAS FILAS, NO EN LA PAGINA ─────────
 * Bajo la tabla hay una leyenda con los cuatro pares icono+etiqueta. Un
 * `getByText('Activa')` a nivel de pagina la encontraria SIEMPRE, aunque la tabla
 * no pintara ni un estado. Todo conteo de estado va filtrado por `getByRole('row')`.
 */

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

/** Conteos reales de la semilla, CONSULTADOS y no escritos a mano. */
let totalUnidades = 0;
let totalGestionadas = 0;
let totalInformativas = 0;

/** Cuantas filas tiene que dejar el buscador al escribir `bogota`. */
let esperadasBogota = 0;

/** Las dos filas que este spec pone en un estado que la semilla no tiene. */
let idActiva = '';
let nombreActiva = '';
let idInactiva = '';
let nombreInactiva = '';

const TARIFA = 120000;
const PAGO = 45000;

test.beforeAll(async () => {
  // El `globalSetup` cargo el entorno en SU proceso; este worker es otro.
  cargarEnvLocal();
  servicio = clienteDeServicio();

  const { data: filas, error } = await servicio
    .from('properties')
    .select('id, nombre, gestion_vivaguest')
    .order('nombre', { ascending: true });

  if (error) throw new Error(`No se pudo leer el catalogo: ${error.message}`);
  if (!filas) throw new Error('El catalogo vino vacio.');

  totalUnidades = filas.length;
  totalGestionadas = filas.filter((f) => f.gestion_vivaguest).length;
  totalInformativas = totalUnidades - totalGestionadas;

  // CONTROL de la semilla. Si estas tres se cayeran, todos los conteos de abajo
  // medirian otra cosa y el fallo apareceria muy lejos de su causa.
  if (totalUnidades !== 39 || totalGestionadas !== 34 || totalInformativas !== 5) {
    throw new Error(
      `La semilla cambio: ${totalUnidades} unidades / ${totalGestionadas} gestionadas / ${totalInformativas} informativas. Se esperaban 39 / 34 / 5.`,
    );
  }

  // El numero esperado del buscador se consulta CON LA TILDE y del lado del
  // servidor, que es un oraculo independiente de `normalizar()`: si la
  // normalizacion del cliente se rompiera, la UI daria 0 y este numero seguiria
  // siendo 25. Calcularlo en JS con la misma funcion que prueba el test lo
  // convertiria en un falso verde por construccion.
  const { count, error: errorBogota } = await servicio
    .from('properties')
    .select('id', { count: 'exact', head: true })
    .or('nombre.ilike.%Bogotá%,cluster.ilike.%Bogotá%');

  if (errorBogota) throw new Error(errorBogota.message);
  esperadasBogota = count ?? 0;

  // Que el filtro FILTRE de verdad: ni cero ni todo.
  if (esperadasBogota === 0 || esperadasBogota === totalUnidades) {
    throw new Error(`El termino de busqueda no discrimina: ${esperadasBogota} de ${totalUnidades}.`);
  }

  const idAseador = await idPorEmail(servicio, 'e2e.aseador1@vivaguest.test');

  // Se toman las DOS ULTIMAS gestionadas por orden de nombre, y no las primeras,
  // para no pisarse con `aseadores-lista.spec.ts`, que se reparte las primeras
  // cinco. El stack local es compartido y los dos specs corren en la misma pasada.
  const gestionadas = filas.filter((f) => f.gestion_vivaguest);
  const [paraActiva, paraInactiva] = gestionadas.slice(-2);

  idActiva = paraActiva.id;
  nombreActiva = paraActiva.nombre;
  idInactiva = paraInactiva.id;
  nombreInactiva = paraInactiva.nombre;

  // ACTIVA: gestionada, completa y encendida. Las tres columnas van juntas o
  // `props_active_requires_rates` y `props_active_requires_owner` la rechazan.
  const activa = await servicio
    .from('properties')
    .update({
      tarifa_huesped: TARIFA,
      pago_aseador: PAGO,
      responsable_id: idAseador,
      is_active: true,
    })
    .eq('id', idActiva);
  if (activa.error) throw new Error(`No se pudo activar la fila: ${activa.error.message}`);

  // INACTIVA: gestionada y COMPLETA, pero apagada. Es la frontera con
  // `Incompleta`, y sin ella el spec no distingue una pausa de un dato que falta.
  const inactiva = await servicio
    .from('properties')
    .update({
      tarifa_huesped: TARIFA,
      pago_aseador: PAGO,
      responsable_id: idAseador,
      is_active: false,
    })
    .eq('id', idInactiva);
  if (inactiva.error) throw new Error(`No se pudo preparar la fila: ${inactiva.error.message}`);
});

test.afterAll(async () => {
  // El stack local es COMPARTIDO entre worktrees: dejar dos apartamentos activos
  // con responsable envenena la corrida siguiente y el sintoma aparece muy lejos
  // de la causa. `global-teardown` borra los usuarios, pero los apartamentos son
  // semilla y sobreviven.
  //
  // Las cuatro columnas se devuelven EN UN SOLO update: los CHECK se evaluan
  // sobre la fila final, asi que bajar `is_active` en la misma sentencia en que
  // se anulan las tarifas es lo que hace que la limpieza no dispare un 23514.
  for (const id of [idActiva, idInactiva]) {
    if (!id) continue;
    await servicio
      .from('properties')
      .update({
        is_active: false,
        tarifa_huesped: null,
        pago_aseador: null,
        responsable_id: null,
      })
      .eq('id', id);
  }
});

/** Filas de la tabla que llevan una etiqueta de estado concreta. */
function filasConEstado(pagina: import('@playwright/test').Page, etiqueta: string) {
  // `exact: true` no es opcional: 'Inactiva' CONTIENE 'activa', asi que sin el la
  // etiqueta corta contaria tambien las filas del otro estado.
  return pagina.getByRole('row').filter({ has: pagina.getByText(etiqueta, { exact: true }) });
}

test('la tabla renderiza las 39 unidades, mas el encabezado', async ({ paginaAdmin }) => {
  await paginaAdmin.goto('/apartamentos');

  await expect(paginaAdmin.getByRole('heading', { name: 'Apartamentos', level: 1 })).toBeVisible();

  // 39 + 1. Verifica de paso la integridad de la semilla contra la que corre
  // todo lo demas de este archivo.
  await expect(paginaAdmin.getByRole('row')).toHaveCount(totalUnidades + 1);
});

test('el pie de tabla dice literalmente 39 unidades · 34 gestionadas · 5 informativas', async ({
  paginaAdmin,
}) => {
  await paginaAdmin.goto('/apartamentos');

  await expect(
    paginaAdmin.getByText('39 unidades · 34 gestionadas · 5 informativas', { exact: true }),
  ).toBeVisible();
});

test('los cuatro estados estan en el DOM como TEXTO, con su conteo exacto', async ({
  paginaAdmin,
}) => {
  await paginaAdmin.goto('/apartamentos');

  // Es la asercion central del criterio 5. Si el estado fuera solo color, ninguna
  // de las cuatro encontraria nada.
  //
  // Y los conteos son EXACTOS a proposito: con un `toBeVisible()` a secas, un
  // componente que pintara siempre la misma etiqueta pasaria las cuatro. Aqui
  // solo pasa si cada fila deriva su propio estado.
  await expect(filasConEstado(paginaAdmin, 'Activa')).toHaveCount(1);
  await expect(filasConEstado(paginaAdmin, 'Inactiva')).toHaveCount(1);
  await expect(filasConEstado(paginaAdmin, 'Informativa')).toHaveCount(totalInformativas);
  await expect(filasConEstado(paginaAdmin, 'Incompleta')).toHaveCount(totalGestionadas - 2);

  // Y cada etiqueta cae en LA FILA QUE LE TOCA, no en cualquiera: sin esto, los
  // conteos podrian cuadrar con los estados repartidos al azar.
  await expect(
    paginaAdmin.getByRole('row').filter({ hasText: nombreActiva }).getByText('Activa', { exact: true }),
  ).toBeVisible();
  await expect(
    paginaAdmin
      .getByRole('row')
      .filter({ hasText: nombreInactiva })
      .getByText('Inactiva', { exact: true }),
  ).toBeVisible();
});

test("escribir 'bogota' sin tilde encuentra las unidades de 'Bogotá'", async ({ paginaAdmin }) => {
  await paginaAdmin.goto('/apartamentos');

  await paginaAdmin.getByLabel('Buscar apartamento').fill('bogota');

  // Las tres mitades. Sin la primera, un buscador que no filtra pasaria; sin la
  // segunda, uno que devuelve cero tambien; y la tercera es la que de verdad mide
  // la insensibilidad a tildes, porque el nombre visible LLEVA la tilde.
  await expect(paginaAdmin.getByRole('row')).toHaveCount(esperadasBogota + 1);
  await expect(
    paginaAdmin.getByText(`Mostrando ${esperadasBogota} de ${totalUnidades}`, { exact: true }),
  ).toBeVisible();
  await expect(
    paginaAdmin.getByRole('link', { name: '[PLACEHOLDER] Bogotá 1 — Apto 01' }),
  ).toBeVisible();
});

test('una busqueda sin resultados muestra el copy exacto, con sus comillas angulares', async ({
  paginaAdmin,
}) => {
  await paginaAdmin.goto('/apartamentos');

  // CONTROL: antes de buscar, la tabla tiene filas. Sin el, el estado vacio
  // saldria igual sobre un catalogo que nunca cargo.
  await expect(paginaAdmin.getByRole('row')).toHaveCount(totalUnidades + 1);

  await paginaAdmin.getByLabel('Buscar apartamento').fill('casa azul');

  await expect(
    paginaAdmin.getByRole('heading', { name: 'Ningún apartamento coincide con «casa azul».' }),
  ).toBeVisible();
  await expect(
    paginaAdmin.getByText('Revisa la escritura o quita el filtro de cluster.', { exact: true }),
  ).toBeVisible();

  // Y se sale de ahi: el boton devuelve las 39 filas.
  await paginaAdmin.getByRole('button', { name: 'Limpiar búsqueda' }).click();
  await expect(paginaAdmin.getByRole('row')).toHaveCount(totalUnidades + 1);
});

test('el banner de montaje cuenta sobre las 34 gestionadas, no sobre las 39', async ({
  paginaAdmin,
}) => {
  await paginaAdmin.goto('/apartamentos');

  await expect(paginaAdmin.getByRole('heading', { name: 'Montaje del catálogo' })).toBeVisible();

  // El denominador es 34. Con las informativas dentro diria 39 y el montaje no
  // podria llegar nunca al 100%.
  await expect(
    paginaAdmin.getByText(`1 de ${totalGestionadas} unidades gestionadas listas`, { exact: true }),
  ).toBeVisible();
  await expect(
    paginaAdmin.getByText(`Faltan ${totalGestionadas - 1} por completar o activar.`, {
      exact: true,
    }),
  ).toBeVisible();

  // La barra declara los MISMOS numeros que el texto, no un porcentaje que nadie
  // escribio en pantalla.
  const barra = paginaAdmin.getByRole('progressbar', {
    name: 'Progreso del montaje del catálogo',
  });
  await expect(barra).toHaveAttribute('aria-valuenow', '1');
  await expect(barra).toHaveAttribute('aria-valuemax', String(totalGestionadas));
});

test('Ver solo pendientes deja las Incompletas y las Inactivas, y saca el resto', async ({
  paginaAdmin,
}) => {
  await paginaAdmin.goto('/apartamentos');

  await paginaAdmin.getByRole('switch', { name: 'Ver solo pendientes' }).click();

  // 32 Incompletas + 1 Inactiva. Fuera quedan la Activa y las 5 Informativas: una
  // unidad de gestion externa NO es un pendiente, y con un `!is_active` a secas se
  // colarian las cinco.
  const pendientes = totalGestionadas - 1;
  await expect(paginaAdmin.getByRole('row')).toHaveCount(pendientes + 1);
  await expect(filasConEstado(paginaAdmin, 'Informativa')).toHaveCount(0);
  await expect(filasConEstado(paginaAdmin, 'Activa')).toHaveCount(0);
  await expect(filasConEstado(paginaAdmin, 'Inactiva')).toHaveCount(1);
  await expect(filasConEstado(paginaAdmin, 'Incompleta')).toHaveCount(totalGestionadas - 2);
});

test('una unidad informativa no ofrece Activar ni Desactivar', async ({ paginaAdmin }) => {
  await paginaAdmin.goto('/apartamentos');

  const filaInformativa = paginaAdmin
    .getByRole('row')
    .filter({ has: paginaAdmin.getByText('Informativa', { exact: true }) })
    .first();

  await filaInformativa.getByRole('button', { name: /^Acciones de / }).click();

  // CONTROL: el menu SI se abrio y trae sus dos items siempre visibles. Sin esta
  // mitad, las dos aserciones negativas de abajo pasarian sobre un menu que nunca
  // llego a abrirse.
  await expect(paginaAdmin.getByRole('menuitem', { name: 'Editar', exact: true })).toBeVisible();
  await expect(paginaAdmin.getByRole('menuitem', { name: 'Conectar calendario', exact: true })).toBeVisible();

  await expect(paginaAdmin.getByRole('menuitem', { name: 'Activar', exact: true })).toHaveCount(0);
  await expect(paginaAdmin.getByRole('menuitem', { name: 'Desactivar', exact: true })).toHaveCount(0);
});

test('el menu ofrece Activar sobre una Inactiva y Desactivar sobre una Activa', async ({
  paginaAdmin,
}) => {
  await paginaAdmin.goto('/apartamentos');

  // ── `exact: true` EN TODO ESTE ARCHIVO, Y NO ES ESTILO ────────────────────
  // El `name` de `getByRole` casa por SUBCADENA. `Desactivar` contiene
  // `activar`, igual que `Inactiva` contiene `activa`. Sin `exact`, la asercion
  // de que una fila activa NO ofrece `Activar` se cae encontrando su propio
  // `Desactivar`. Se descubrio en rojo, escribiendo este mismo test.

  // Sobre la INACTIVA (gestionada, completa y apagada): se puede activar.
  await paginaAdmin.getByRole('button', { name: `Acciones de ${nombreInactiva}` }).click();
  await expect(paginaAdmin.getByRole('menuitem', { name: 'Activar', exact: true })).toBeVisible();
  await expect(paginaAdmin.getByRole('menuitem', { name: 'Desactivar', exact: true })).toHaveCount(0);

  // Se espera a que el primer menu se DESMONTE antes de abrir el segundo: los dos
  // vivos a la vez hacen que el conteo de abajo mida los items de ambos.
  await paginaAdmin.keyboard.press('Escape');
  await expect(paginaAdmin.getByRole('menuitem', { name: 'Editar', exact: true })).toHaveCount(0);

  // Sobre la ACTIVA: la operacion es la contraria, no las dos.
  await paginaAdmin.getByRole('button', { name: `Acciones de ${nombreActiva}` }).click();
  await expect(paginaAdmin.getByRole('menuitem', { name: 'Desactivar', exact: true })).toBeVisible();
  await expect(paginaAdmin.getByRole('menuitem', { name: 'Activar', exact: true })).toHaveCount(0);
});

test('una Incompleta no ofrece Activar: el camino para completarla es Editar', async ({
  paginaAdmin,
}) => {
  await paginaAdmin.goto('/apartamentos');

  const filaIncompleta = paginaAdmin
    .getByRole('row')
    .filter({ has: paginaAdmin.getByText('Incompleta', { exact: true }) })
    .first();

  await filaIncompleta.getByRole('button', { name: /^Acciones de / }).click();

  // CONTROL de que el menu esta abierto, por lo mismo que en el caso informativo.
  await expect(paginaAdmin.getByRole('menuitem', { name: 'Editar', exact: true })).toBeVisible();
  await expect(paginaAdmin.getByRole('menuitem', { name: 'Activar', exact: true })).toHaveCount(0);
});

test('el nombre es un link real, no una fila con role de boton', async ({ paginaAdmin }) => {
  await paginaAdmin.goto('/apartamentos');

  // El teclado tiene que llegar a un `<a>` con href, que es lo que §7.2 exige y
  // lo que una fila clicable con `onClick` no da.
  //
  // El DESTINO cambió en la Fase 8 y el fondo de esta aserción no: la celda ya no
  // lleva al formulario de edición, lleva a la misma lista con el panel de
  // lectura abierto (`?apartamento={uuid}`). Lo que se sigue afirmando es lo
  // mismo: que hay un ancla de verdad con una dirección de verdad, no una fila
  // con un manejador de clic. El grupo opcional del principio deja pasar la forma
  // que compone el enlace cuando la pantalla tiene parámetros vivos, que es la
  // regla de la INSTRUCCION 5 (abrir NO se lleva por delante los del anfitrión).
  await expect(
    paginaAdmin.getByRole('link', { name: '[PLACEHOLDER] Bogotá 1 — Apto 01' }),
  ).toHaveAttribute('href', /^\/apartamentos\?(.+&)?apartamento=[0-9a-f-]{36}$/);

  await expect(paginaAdmin.getByRole('row').getByRole('button', { name: 'Nombre' })).toHaveCount(0);
});

test('la tarifa vacia se anuncia como "sin definir", no como una celda muda', async ({
  paginaAdmin,
}) => {
  await paginaAdmin.goto('/apartamentos');

  const filaIncompleta = paginaAdmin
    .getByRole('row')
    .filter({ has: paginaAdmin.getByText('Incompleta', { exact: true }) })
    .first();

  await expect(filaIncompleta.getByText('sin definir').first()).toBeAttached();

  // Y la fila ACTIVA si trae el monto formateado: sin esta mitad, "sin definir"
  // pasaria tambien con una tabla que nunca pinta dinero.
  await expect(
    paginaAdmin.getByRole('row').filter({ hasText: nombreActiva }).getByText('$ 120.000'),
  ).toBeVisible();
});

test('el encabezado sigue en pantalla despues de bajar por las 39 filas', async ({
  paginaAdmin,
}) => {
  // ── LA DEUDA MEDIDA DEL PLAN 02-07, AHORA CON PUERTA ──────────────────────
  // El `Table` de shadcn envuelve la tabla en un div con `overflow-x-auto`, lo
  // que convierte ESE div en el scrollport del sticky en vez del viewport. El
  // 02-07 lo dejo escrito como deuda porque con 8 aseadores no se nota. Con 39
  // filas si: el encabezado se va con el scroll y quedan siete columnas sin
  // nombre.
  //
  // Ningun `tsc` ni ninguna asercion de texto puede ver esto: es geometria. Por
  // eso el test mide POSICIONES, y por eso lleva las dos mitades.
  await paginaAdmin.setViewportSize({ width: 1440, height: 800 });
  await paginaAdmin.goto('/apartamentos');

  const encabezado = paginaAdmin.getByRole('row').first();
  const antes = await encabezado.boundingBox();
  if (!antes) throw new Error('No se pudo medir el encabezado.');

  // CONTROL: la pagina tiene de verdad recorrido vertical. Sin el, "sigue en
  // pantalla" pasaria trivialmente sobre una tabla que nunca se movio.
  await paginaAdmin.evaluate(() => window.scrollBy(0, 600));
  const desplazamiento = await paginaAdmin.evaluate(() => window.scrollY);
  expect(desplazamiento).toBeGreaterThan(400);

  const despues = await encabezado.boundingBox();
  if (!despues) throw new Error('El encabezado desaparecio del layout.');

  // Enganchado justo por debajo de la barra de 56px. Sin el arreglo, `y` seria
  // `antes.y - 600`, o sea muy negativo.
  expect(despues.y).toBeGreaterThanOrEqual(0);
  expect(despues.y).toBeLessThan(antes.y);
  await expect(paginaAdmin.getByRole('columnheader', { name: 'Tarifa' })).toBeInViewport();
});

test('un aseador no llega al catalogo del admin', async ({ paginaAseador }) => {
  await paginaAseador.goto('/apartamentos');

  await expect(paginaAseador).toHaveURL(/\/mis-aseos$/);
});
