import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';
import { cargarEnvLocal, clienteDeServicio } from './global-setup';

/**
 * Sección 5 del formulario de apartamento: cuartos (APTO-06) y faltantes
 * propios (APTO-07), UI-SPEC §8.1.
 *
 * ── LAS TRES TRAMPAS QUE ESTE ARCHIVO PISA A PROPOSITO ──────────────────────
 *
 * 1. UN ARRAY VACIO HACE PASAR CUALQUIER ASERCION NEGATIVA. "No apareció el
 *    error de duplicado" es cierto también cuando no había ni una fila que
 *    comparar, y "la base no tiene cuartos de más" es cierto también cuando la
 *    pantalla nunca cargó. Cada negativa de aquí lleva su CONTROL: la misma
 *    corrida, el mismo apartamento, demostrando que el montaje SI tenía filas.
 *
 * 2. EL CICLO AÑADIR-QUITAR USA DOS FILAS DISTINGUIBLES Y QUITA LA PRIMERA. Con
 *    dos cuartos idénticos, cualquier confusión de filas pasaría inadvertida.
 *    AVISO MEDIDO: ese montaje NO llega a atrapar un `key={indice}` en el
 *    `useFieldArray`; se probó sustituyendo la clave y los 9 tests siguieron en
 *    verde. Sirve para lo que sí mide —que la fila que queda es la correcta, con
 *    SU tipo y SU etiqueta— y no debe venderse como red de la clave.
 *
 * 3. `getByRole(name:)` CASA POR SUBCADENA. `Agregar cuarto` y `Agregar
 *    faltante` comparten prefijo, y `Quitar el cuarto 1` es prefijo de
 *    `Quitar el cuarto 10`. Todo va con `exact: true`.
 *
 * ── Y LA TRAMPA DE LA BASE, QUE ES LA QUE DE VERDAD IMPORTA ─────────────────
 * `property_rooms_etiqueta_uniq` NO es un índice parcial: un cuarto desactivado
 * SIGUE reservando su etiqueta aunque el formulario no lo pinte. El test
 * `re-añadir la etiqueta de un cuarto quitado` comprueba que volver a escribirla
 * REUTILIZA la fila con SU MISMO ID en vez de intentar insertar otra. La
 * aserción sobre el id es la que separa "funciona" de "funciona por casualidad":
 * un `delete all` + `insert all` daría un id nuevo y pasaría todo lo demás.
 */

type Servicio = ReturnType<typeof clienteDeServicio>;

let servicio: Servicio;

/** Los apartamentos que crea este archivo. Se borran al terminar. */
const creados = new Set<string>();

let semillaUnidades = 0;

const SUFIJO = `E2E-CUARTOS-${Date.now()}`;
const nombreUnico = (etiqueta: string) => `[${SUFIJO}] ${etiqueta}`;

const CLUSTER = 'Bogotá 1';
const ASEADOR = 'Aseador Uno E2E';

/** Los dos tipos del catálogo global que usa este archivo. */
const TIPO_HABITACION = 'Habitación';
const TIPO_BANO = 'Baño';

test.beforeAll(async () => {
  cargarEnvLocal();
  servicio = clienteDeServicio();

  const { count, error } = await servicio
    .from('properties')
    .select('id', { count: 'exact', head: true });
  if (error) throw new Error(`No se pudo leer el catálogo: ${error.message}`);

  semillaUnidades = count ?? 0;
  if (semillaUnidades !== 39) {
    throw new Error(`La semilla cambió: ${semillaUnidades} unidades, se esperaban 39.`);
  }

  // CONTROL DE ENTORNO. Todo este archivo elige tipos de cuarto por su nombre
  // visible. Si el catálogo global estuviera vacío o se hubiera renombrado, cada
  // `getByRole('option')` fallaría con un timeout que apunta al `Select` y no a
  // la causa.
  const { data: tipos } = await servicio.from('room_types').select('nombre');
  const nombres = (tipos ?? []).map((t) => t.nombre);
  for (const esperado of [TIPO_HABITACION, TIPO_BANO]) {
    if (!nombres.includes(esperado)) {
      throw new Error(
        `El catálogo de room_types no tiene "${esperado}". Tiene: ${nombres.join(', ')}`,
      );
    }
  }
});

test.afterAll(async () => {
  // El stack local es COMPARTIDO. Lo que crea este archivo desaparece; las 39
  // sembradas y sus cuartos placeholder NO se tocan. `property_rooms` y
  // `missing_item_catalog` cuelgan con `on delete cascade`.
  for (const id of creados) {
    await servicio.from('properties').delete().eq('id', id);
  }

  const { count } = await servicio
    .from('properties')
    .select('id', { count: 'exact', head: true });

  if (count !== semillaUnidades) {
    throw new Error(
      `La limpieza dejó restos: ${count} unidades donde había ${semillaUnidades}.`,
    );
  }
});

const botonGuardar = (p: Page) => p.getByRole('button', { name: 'Guardar', exact: true });
const botonActivar = (p: Page) =>
  p.getByRole('button', { name: 'Guardar y activar', exact: true });
const botonAgregarCuarto = (p: Page) =>
  p.getByRole('button', { name: 'Agregar cuarto', exact: true });
const botonAgregarFaltante = (p: Page) =>
  p.getByRole('button', { name: 'Agregar faltante', exact: true });

const etiquetaDeCuarto = (p: Page, fila: number) =>
  p.getByLabel(`Etiqueta del cuarto ${fila}`, { exact: true });
const tipoDeCuarto = (p: Page, fila: number) =>
  p.getByLabel(`Tipo del cuarto ${fila}`, { exact: true });
const quitarCuarto = (p: Page, fila: number) =>
  p.getByRole('button', { name: `Quitar el cuarto ${fila}`, exact: true });
const nombreDeFaltante = (p: Page, fila: number) =>
  p.getByLabel(`Nombre del faltante ${fila}`, { exact: true });

async function elegirCluster(p: Page, nombre: string) {
  await p.getByLabel('Cluster').click();
  await p.getByPlaceholder('Busca o escribe un cluster').fill(nombre);
  await p.getByRole('option', { name: nombre, exact: true }).first().click();
}

async function elegirTipo(p: Page, fila: number, tipo: string) {
  await tipoDeCuarto(p, fila).click();
  await p.getByRole('option', { name: tipo, exact: true }).click();
}

/** Añade una fila de cuarto ya rellena. La fila resultante es la `fila`. */
async function agregarCuarto(p: Page, fila: number, tipo: string, etiqueta: string) {
  await botonAgregarCuarto(p).click();
  await elegirTipo(p, fila, tipo);
  await etiquetaDeCuarto(p, fila).fill(etiqueta);
}

/** Crea un borrador con nombre y cluster, y devuelve su id ya en el detalle. */
async function crearBorrador(p: Page, nombre: string): Promise<string> {
  await p.goto('/apartamentos/nuevo');
  await p.getByLabel('Nombre', { exact: true }).fill(nombre);
  await elegirCluster(p, CLUSTER);
  await botonGuardar(p).click();
  await p.waitForURL(/\/apartamentos\/[0-9a-f-]{36}$/);

  const { data, error } = await servicio
    .from('properties')
    .select('id')
    .eq('nombre', nombre)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error(`No se creó el apartamento "${nombre}"`);

  creados.add(data.id);
  return data.id;
}

/** Los cuartos de un apartamento tal como están en la base. */
async function cuartosEnBase(propertyId: string) {
  const { data, error } = await servicio
    .from('property_rooms')
    .select('id, etiqueta, sort_order, is_active, room_type_id')
    .eq('property_id', propertyId)
    .order('sort_order', { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Los faltantes PROPIOS del apartamento. Nunca los globales. */
async function faltantesEnBase(propertyId: string) {
  const { data, error } = await servicio
    .from('missing_item_catalog')
    .select('id, nombre, sort_order, is_active')
    .eq('property_id', propertyId)
    .order('sort_order', { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Pulsa `Guardar` y espera a que la escritura HAYA LLEGADO A LA BASE.
 *
 * NO se espera al toast, y la razón está medida: `Cambios guardados.` sigue en
 * pantalla varios segundos después del guardado ANTERIOR (el que crea el
 * borrador), así que una aserción sobre ese texto se cumple al instante y el
 * `reload()` de la línea siguiente aborta la petición en vuelo. Cinco tests de
 * este archivo fallaron así, y el síntoma —"no persistió"— apuntaba a la Server
 * Action en vez de al test.
 *
 * Esperar contra la base es además una aserción de verdad: dice que se
 * escribieron EXACTAMENTE las filas que se esperaban, no solo que la pantalla
 * dijo algo.
 */
async function guardarYEsperarCuartos(p: Page, propertyId: string, activos: number) {
  await botonGuardar(p).click();
  await expect
    .poll(async () => (await cuartosEnBase(propertyId)).filter((f) => f.is_active).length, {
      timeout: 10_000,
    })
    .toBe(activos);
}

async function guardarYEsperarFaltantes(p: Page, propertyId: string, activos: number) {
  await botonGuardar(p).click();
  await expect
    .poll(async () => (await faltantesEnBase(propertyId)).filter((f) => f.is_active).length, {
      timeout: 10_000,
    })
    .toBe(activos);
}

test.describe('APTO-06: la lista de cuartos', () => {
  test('un apartamento sin cuartos muestra el estado vacío con su consecuencia', async ({
    paginaAdmin,
  }) => {
    await crearBorrador(paginaAdmin, nombreUnico('Vacio'));

    await expect(
      paginaAdmin.getByText('Este apartamento no tiene cuartos definidos.'),
    ).toBeVisible();
    // La segunda frase NO es relleno: es lo único que le dice al admin por qué le
    // importa una sección que puede dejar en blanco sin que nada se lo impida.
    await expect(
      paginaAdmin.getByText('Sin cuartos no se puede armar el checklist del aseo.'),
    ).toBeVisible();

    // CONTROL: el estado vacío desaparece en cuanto hay una fila. Sin esto, un
    // componente que pintara el estado vacío SIEMPRE pasaría las dos aserciones
    // de arriba.
    await botonAgregarCuarto(paginaAdmin).click();
    await expect(
      paginaAdmin.getByText('Este apartamento no tiene cuartos definidos.'),
    ).toHaveCount(0);
    await expect(etiquetaDeCuarto(paginaAdmin, 1)).toBeVisible();
  });

  test('cuatro pulsaciones de Agregar dan CUATRO filas, y ninguna se pierde por el camino', async ({
    paginaAdmin,
  }) => {
    // REGRESION MEDIDA. Con los valores por defecto de `useFieldArray`,
    // `mode: 'onBlur'` y un resolver de esquema, la mitad de los `append` se
    // descartaba EN SILENCIO: la secuencia real era 1, 1, 2, 2. Nada fallaba, el
    // botón respondía, y el admin creía haber añadido cuatro cuartos.
    await paginaAdmin.goto('/apartamentos/nuevo');

    for (const esperadas of [1, 2, 3, 4]) {
      await botonAgregarCuarto(paginaAdmin).click();
      await expect(paginaAdmin.getByLabel(/^Etiqueta del cuarto/)).toHaveCount(esperadas);
    }

    // Y la otra mitad del bug: pulsar dentro de una etiqueta SIN escribir nada y
    // añadir a continuación. Es el gesto que el `shouldFocus` por defecto
    // provocaba solo, y el que se perdía aunque el foco no lo pusiera el usuario.
    await etiquetaDeCuarto(paginaAdmin, 1).click();
    await botonAgregarCuarto(paginaAdmin).click();
    await expect(paginaAdmin.getByLabel(/^Etiqueta del cuarto/)).toHaveCount(5);

    // Lo mismo en los faltantes, que tenían el mismo defecto.
    for (const esperadas of [1, 2, 3]) {
      await botonAgregarFaltante(paginaAdmin).click();
      await expect(paginaAdmin.getByLabel(/^Nombre del faltante/)).toHaveCount(esperadas);
    }
  });

  test('añadir 2 cuartos, quitar 1 y guardar deja exactamente lo esperado tras recargar', async ({
    paginaAdmin,
  }) => {
    const id = await crearBorrador(paginaAdmin, nombreUnico('Ciclo'));

    // Los dos cuartos son DISTINTOS en tipo y en etiqueta a propósito, y se quita
    // el PRIMERO. Con `key={indice}` en el `useFieldArray`, React reutilizaría el
    // nodo de la fila borrada y en pantalla se quedaría el tipo del cuarto que se
    // fue. Con dos filas iguales ese bug sería invisible.
    await agregarCuarto(paginaAdmin, 1, TIPO_HABITACION, 'Habitación principal');
    await agregarCuarto(paginaAdmin, 2, TIPO_BANO, 'Baño social');

    // CONTROL del montaje: había DOS filas antes de quitar nada. Sin esta
    // aserción, el conteo final de 1 fila pasaría igual si `Agregar cuarto` no
    // hubiera hecho nada la segunda vez.
    await expect(etiquetaDeCuarto(paginaAdmin, 1)).toHaveValue('Habitación principal');
    await expect(etiquetaDeCuarto(paginaAdmin, 2)).toHaveValue('Baño social');

    await quitarCuarto(paginaAdmin, 1).click();

    // La fila que queda es la SEGUNDA, con SU tipo y SU etiqueta, ahora en la
    // posición 1. Esta es la aserción que mata el `key={indice}`.
    await expect(etiquetaDeCuarto(paginaAdmin, 1)).toHaveValue('Baño social');
    await expect(tipoDeCuarto(paginaAdmin, 1)).toHaveAccessibleName(new RegExp(TIPO_BANO));
    await expect(etiquetaDeCuarto(paginaAdmin, 2)).toHaveCount(0);

    await guardarYEsperarCuartos(paginaAdmin, id, 1);

    // La persistencia se comprueba RECARGANDO: sin recargar, lo que se ve es el
    // estado que el navegador nunca soltó y el test pasaría con una action que no
    // escribe nada.
    await paginaAdmin.reload();
    await expect(etiquetaDeCuarto(paginaAdmin, 1)).toHaveValue('Baño social');
    await expect(etiquetaDeCuarto(paginaAdmin, 2)).toHaveCount(0);

    // Y en la base hay UNA fila y solo una. La quitada nunca llegó a guardarse,
    // así que aquí no hay nada que desactivar: se añadió y se quitó dentro del
    // mismo formulario, sin envío por medio. La otra mitad de la regla —quitar
    // algo YA GUARDADO lo desactiva en vez de borrarlo— la mide el test de
    // reutilización, que es donde el ciclo pasa por la base.
    const filas = await cuartosEnBase(id);
    expect(filas).toHaveLength(1);
    expect(filas[0].is_active).toBe(true);
    expect(filas[0].etiqueta).toBe('Baño social');
    // El `sort_order` se renumera desde el índice de la fila: la que quedó pasó
    // de la posición 1 a la 0 en vez de dejar un hueco.
    expect(filas[0].sort_order).toBe(0);
  });

  test('dos cuartos con la misma etiqueta se bloquean ANTES de enviar, bajo la segunda fila', async ({
    paginaAdmin,
  }) => {
    const id = await crearBorrador(paginaAdmin, nombreUnico('Duplicado'));

    await agregarCuarto(paginaAdmin, 1, TIPO_BANO, 'Baño social');
    await agregarCuarto(paginaAdmin, 2, TIPO_BANO, 'Baño social');

    await botonGuardar(paginaAdmin).click();

    // El error va bajo la SEGUNDA fila: la primera es el cuarto que ya estaba, la
    // segunda es la que el admin acaba de escribir. `esquemaCuartos` emite el
    // issue en el índice del elemento repetido justamente para esto.
    const errorSegunda = etiquetaDeCuarto(paginaAdmin, 2)
      .locator('xpath=ancestor::li[1]')
      .getByText('Ya existe un cuarto con esa etiqueta en este apartamento.');
    await expect(errorSegunda).toBeVisible();

    // Y NO bajo la primera.
    await expect(
      etiquetaDeCuarto(paginaAdmin, 1)
        .locator('xpath=ancestor::li[1]')
        .getByText('Ya existe un cuarto con esa etiqueta en este apartamento.'),
    ).toHaveCount(0);

    // EL SUBMIT NO LLEGO AL SERVIDOR: cero cuartos en la base. Sin el CONTROL de
    // abajo, este `toHaveLength(0)` pasaría igual con una pantalla caída.
    expect(await cuartosEnBase(id)).toHaveLength(0);

    // CONTROL: corregida la segunda etiqueta, el error desaparece y el guardado
    // SI escribe las dos filas. Es lo que demuestra que el bloqueo de arriba era
    // por el duplicado y no porque el botón no hiciera nada.
    await etiquetaDeCuarto(paginaAdmin, 2).fill('Baño de servicio');
    await guardarYEsperarCuartos(paginaAdmin, id, 2);

    const filas = await cuartosEnBase(id);
    expect(filas.map((f) => f.etiqueta)).toEqual(['Baño social', 'Baño de servicio']);
  });

  test('dos etiquetas que solo difieren en mayúsculas también se bloquean', async ({
    paginaAdmin,
  }) => {
    const id = await crearBorrador(paginaAdmin, nombreUnico('Mayusculas'));

    // LA UI ES MAS ESTRICTA QUE LA BASE A PROPOSITO:
    // `unique (property_id, etiqueta)` NO lleva `lower()`, así que Postgres
    // aceptaría estas dos filas sin rechistar. Dos cuartos que solo difieren en
    // mayúsculas son un error de tipeo, y el aseador vería dos entradas
    // indistinguibles en su checklist.
    await agregarCuarto(paginaAdmin, 1, TIPO_BANO, 'Baño social');
    await agregarCuarto(paginaAdmin, 2, TIPO_BANO, 'BAÑO SOCIAL');

    await botonGuardar(paginaAdmin).click();

    await expect(
      etiquetaDeCuarto(paginaAdmin, 2)
        .locator('xpath=ancestor::li[1]')
        .getByText('Ya existe un cuarto con esa etiqueta en este apartamento.'),
    ).toBeVisible();

    expect(await cuartosEnBase(id)).toHaveLength(0);
  });

  test('re-añadir la etiqueta de un cuarto quitado REUTILIZA su fila, con su mismo id', async ({
    paginaAdmin,
  }) => {
    // ESTE ES EL TEST DE LA TRAMPA. `property_rooms_etiqueta_uniq` no es parcial:
    // un cuarto desactivado sigue reservando su etiqueta aunque el formulario no
    // lo pinte. Una implementación que insertara a ciegas moriría con un 23505
    // sobre una fila invisible; una que borrara en vez de desactivar pasaría este
    // test salvo por la aserción del id, que es la que importa: ese id es el que
    // los checklists de la Fase 6 van a referenciar.
    const id = await crearBorrador(paginaAdmin, nombreUnico('Reutiliza'));

    await agregarCuarto(paginaAdmin, 1, TIPO_BANO, 'Baño social');
    await guardarYEsperarCuartos(paginaAdmin, id, 1);

    const [original] = await cuartosEnBase(id);
    expect(original.is_active).toBe(true);

    // Se quita y se guarda: la fila sobrevive inactiva, con su etiqueta.
    await paginaAdmin.reload();
    await quitarCuarto(paginaAdmin, 1).click();
    await guardarYEsperarCuartos(paginaAdmin, id, 0);

    // La fila NO se borró: sigue ahí, inactiva, reservando su etiqueta.
    const trasQuitar = await cuartosEnBase(id);
    expect(trasQuitar).toHaveLength(1);
    expect(trasQuitar[0].is_active).toBe(false);

    await paginaAdmin.reload();
    // CONTROL: el formulario ya no la pinta, así que su etiqueta parece libre.
    await expect(
      paginaAdmin.getByText('Este apartamento no tiene cuartos definidos.'),
    ).toBeVisible();

    // Y ahora el admin vuelve a escribir esa misma etiqueta.
    await agregarCuarto(paginaAdmin, 1, TIPO_HABITACION, 'Baño social');
    await guardarYEsperarCuartos(paginaAdmin, id, 1);

    const filas = await cuartosEnBase(id);
    expect(filas).toHaveLength(1);
    expect(filas[0].is_active).toBe(true);
    // EL MISMO ID. Es la aserción que separa "reutiliza" de "borra y recrea".
    expect(filas[0].id).toBe(original.id);
    // Y el tipo nuevo se aplicó: la fila se reutiliza, no se congela.
    expect(filas[0].room_type_id).not.toBe(original.room_type_id);
  });
});

test.describe('APTO-07: los faltantes propios del apartamento', () => {
  test('un faltante propio persiste tras recargar y no toca los globales', async ({
    paginaAdmin,
  }) => {
    const id = await crearBorrador(paginaAdmin, nombreUnico('Faltantes'));

    // CONTROL previo: cuántos globales hay ANTES. Esta pantalla no los edita, y
    // sin este conteo un `insert` con `property_id` nulo pasaría inadvertido.
    const { count: globalesAntes } = await servicio
      .from('missing_item_catalog')
      .select('id', { count: 'exact', head: true })
      .is('property_id', null);

    await botonAgregarFaltante(paginaAdmin).click();
    await nombreDeFaltante(paginaAdmin, 1).fill('Control remoto del TV');
    await guardarYEsperarFaltantes(paginaAdmin, id, 1);

    await paginaAdmin.reload();
    await expect(nombreDeFaltante(paginaAdmin, 1)).toHaveValue('Control remoto del TV');

    const propios = await faltantesEnBase(id);
    expect(propios).toHaveLength(1);
    expect(propios[0].nombre).toBe('Control remoto del TV');

    const { count: globalesDespues } = await servicio
      .from('missing_item_catalog')
      .select('id', { count: 'exact', head: true })
      .is('property_id', null);
    expect(globalesDespues).toBe(globalesAntes);

    // El helper que explica que esta lista se SUMA a la común. Sin él, el admin
    // acabaría re-escribiendo `Toallas` en los 39 apartamentos.
    await expect(
      paginaAdmin.getByText('Estos se suman a la lista base común a todos los apartamentos.'),
    ).toBeVisible();
  });

  test('dos faltantes con el mismo nombre se bloquean antes de enviar', async ({
    paginaAdmin,
  }) => {
    const id = await crearBorrador(paginaAdmin, nombreUnico('FaltanteDup'));

    await botonAgregarFaltante(paginaAdmin).click();
    await nombreDeFaltante(paginaAdmin, 1).fill('Toallas');
    await botonAgregarFaltante(paginaAdmin).click();
    await nombreDeFaltante(paginaAdmin, 2).fill('toallas');

    await botonGuardar(paginaAdmin).click();

    await expect(
      nombreDeFaltante(paginaAdmin, 2)
        .locator('xpath=ancestor::li[1]')
        .getByText('Ya existe un faltante con ese nombre.'),
    ).toBeVisible();

    expect(await faltantesEnBase(id)).toHaveLength(0);

    // CONTROL: corregido el nombre, el guardado SI escribe las dos filas.
    await nombreDeFaltante(paginaAdmin, 2).fill('Jabón de manos');
    await guardarYEsperarFaltantes(paginaAdmin, id, 2);
  });
});

test.describe('Los cuartos NO son una puerta de activación', () => {
  test('un apartamento gestionado completo SIN cuartos se puede activar', async ({
    paginaAdmin,
  }) => {
    // Esta es la aserción que impide que alguien añada los cuartos al bloque
    // `Para activar falta:` por inercia al ver la sección vacía. Ningún CHECK de
    // `properties` los exige y ningún REQ lo pide: hacerlo bloquearía las 39
    // unidades del catálogo.
    const id = await crearBorrador(paginaAdmin, nombreUnico('SinCuartos'));

    // CONTROL NEGATIVO: con el apartamento incompleto el botón está apagado, así
    // que el `toBeEnabled` de abajo no puede pasar por estar el botón siempre
    // habilitado ni por estar la pantalla caída.
    await expect(botonActivar(paginaAdmin)).toBeDisabled();

    await paginaAdmin.getByLabel('Tarifa al huésped').fill('120000');
    await paginaAdmin.getByLabel('Pago al aseador').fill('45000');
    await paginaAdmin.getByLabel('Aseador responsable').click();
    await paginaAdmin.getByRole('option', { name: ASEADOR, exact: true }).click();

    // CONTROL del montaje: la sección 5 está VACIA de verdad. Sin esto, el test
    // pasaría igual con un apartamento que sí tuviera cuartos, y no probaría nada.
    await expect(
      paginaAdmin.getByText('Este apartamento no tiene cuartos definidos.'),
    ).toBeVisible();
    expect(await cuartosEnBase(id)).toHaveLength(0);

    // El bloque de §8.2 sigue en pantalla —pinta también los requisitos YA
    // CUMPLIDOS, tachados— pero NINGUNO de sus ítems habla de cuartos. Se lee del
    // propio bloque y no de toda la página: las filas del editor de cuartos
    // también son `<li>` con botón dentro, así que un localizador global casaría
    // con ellas y la aserción mediría otra cosa.
    const bloque = paginaAdmin.getByText('Para activar falta:').locator('xpath=ancestor::div[1]');
    const items = bloque.getByRole('button');
    await expect(items).toHaveCount(3);
    expect((await items.allInnerTexts()).join(' | ')).not.toMatch(/uarto/i);

    await expect(botonActivar(paginaAdmin)).toBeEnabled();

    await botonActivar(paginaAdmin).click();
    await expect
      .poll(async () => {
        const { data } = await servicio
          .from('properties')
          .select('is_active')
          .eq('id', id)
          .single();
        return data?.is_active;
      }, { timeout: 10_000 })
      .toBe(true);
    // Y sigue sin cuartos: activar no los inventó.
    expect(await cuartosEnBase(id)).toHaveLength(0);
  });
});
