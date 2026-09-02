import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';
import { cargarEnvLocal, clienteDeServicio } from './global-setup';

/**
 * Criterios 2 y 3 del ROADMAP: el CRUD de apartamento con sus 12 campos y las
 * puertas de activación (UI-SPEC §8).
 *
 * ── LO QUE ESTE ARCHIVO MIDE Y NINGUNA OTRA CAPA PUEDE MEDIR ────────────────
 * El plan 02-10 ya probó contra la base que activar una unidad GESTIONADA sin
 * tarifas da `23514`. Eso es la red de seguridad. Lo que se prueba aquí es lo
 * contrario: que esa red NUNCA se alcanza desde la pantalla, porque el botón está
 * apagado antes. Y una de las puertas —la de `contacto_externo` para unidades
 * informativas— NO TIENE NINGUNA RED DEBAJO, así que este archivo es el único
 * sitio del sistema donde esa regla se verifica. Ver el test marcado.
 *
 * ── DOS TRAMPAS DE PLAYWRIGHT QUE ESTE ARCHIVO PISA A PROPOSITO ─────────────
 * 1. `getByRole(name:)` casa por SUBCADENA. `Guardar y activar` CONTIENE
 *    `Guardar`, así que `getByRole('button', { name: 'Guardar' })` selecciona
 *    LOS DOS y falla por strict mode, o peor, en una aserción de `toBeDisabled`
 *    seleccionaría el equivocado. Todo nombre que sea prefijo de otro lleva
 *    `exact: true`. Lo mismo con `Desactivar`, que contiene `activar`.
 * 2. Una aserción de "sigue deshabilitado" pasa trivialmente si la pantalla no
 *    cargó, si el botón no existe o si la app entera está caída. Cada una lleva
 *    su CONTROL positivo: el mismo botón, en la misma corrida, HABILITADO.
 */

type Servicio = ReturnType<typeof clienteDeServicio>;

let servicio: Servicio;

/** Los apartamentos que crea este archivo. Se borran al terminar. */
const creados = new Set<string>();

/** Conteos de la semilla, consultados y no escritos a mano. */
let semillaUnidades = 0;

const SUFIJO = `E2E-CRUD-${Date.now()}`;
const nombreUnico = (etiqueta: string) => `[${SUFIJO}] ${etiqueta}`;

const CLUSTER = 'Bogotá 1';
const TARIFA = 120000;
const PAGO = 45000;
const CODIGO = '4821#';
const NOTAS = 'La cerradura pita dos veces al abrir.';
const DIRECCION = 'Calle 93 #11-20, apto 402';
const MAPS = 'https://maps.google.com/?q=4.676,-74.048';

test.beforeAll(async () => {
  // El `globalSetup` cargó el entorno en SU proceso; este worker es otro.
  cargarEnvLocal();
  servicio = clienteDeServicio();

  const { count, error } = await servicio
    .from('properties')
    .select('id', { count: 'exact', head: true });
  if (error) throw new Error(`No se pudo leer el catálogo: ${error.message}`);

  semillaUnidades = count ?? 0;

  // CONTROL de entorno: si la semilla no está, todos los conteos de abajo miden
  // otra cosa y el fallo aparecería muy lejos de su causa.
  if (semillaUnidades !== 39) {
    throw new Error(`La semilla cambió: ${semillaUnidades} unidades, se esperaban 39.`);
  }
});

test.afterAll(async () => {
  // El stack local es COMPARTIDO entre worktrees. Los apartamentos que este
  // archivo crea NO son semilla y tienen que desaparecer; las 39 sembradas no se
  // tocan. `property_secrets` cuelga con `on delete cascade`, así que se va con
  // su apartamento.
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

/** El id del apartamento cuyo nombre se le pasa, para poder limpiarlo después. */
async function idPorNombre(nombre: string): Promise<string> {
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

/** Los dos botones de la barra, con `exact` porque uno contiene al otro. */
const botonGuardar = (p: Page) => p.getByRole('button', { name: 'Guardar', exact: true });
const botonActivar = (p: Page) =>
  p.getByRole('button', { name: 'Guardar y activar', exact: true });

/** Los ítems del checklist "Para activar falta". */
const checklist = (p: Page) =>
  p.getByRole('listitem').filter({ has: p.getByRole('button') }).getByRole('button');

/** Rellena el combobox de cluster, que admite entrada libre. */
async function elegirCluster(p: Page, nombre: string) {
  await p.getByLabel('Cluster').click();
  await p.getByPlaceholder('Busca o escribe un cluster').fill(nombre);
  // El ítem existente y el de crear son opciones distintas del mismo popup; se
  // pulsa la que haya, que es exactamente la ambigüedad que el componente
  // resuelve escondiendo "crear" cuando ya existe salvo por tildes.
  await p.getByRole('option', { name: nombre, exact: true }).first().click();
}

/** El nombre del aseador que este archivo asigna como responsable. */
const ASEADOR = 'Aseador Uno E2E';

test.describe('Criterio 2: los 12 campos persisten', () => {
  test('la hora límite arranca en 11:30 en el formulario vacío', async ({ paginaAdmin }) => {
    await paginaAdmin.goto('/apartamentos/nuevo');

    await expect(
      paginaAdmin.getByRole('heading', { name: 'Nuevo apartamento', level: 1 }),
    ).toBeVisible();
    await expect(paginaAdmin.getByLabel('Hora límite')).toHaveValue('11:30');
  });

  test('un borrador con solo nombre y cluster persiste y queda Incompleta', async ({
    paginaAdmin,
  }) => {
    const nombre = nombreUnico('Borrador');

    await paginaAdmin.goto('/apartamentos/nuevo');
    await paginaAdmin.getByLabel('Nombre', { exact: true }).fill(nombre);
    await elegirCluster(paginaAdmin, CLUSTER);

    await botonGuardar(paginaAdmin).click();

    // Al crear, la pantalla navega al detalle del id nuevo. Sin eso, un segundo
    // `Guardar` insertaría otra vez y chocaría con `properties_nombre_uniq`.
    await paginaAdmin.waitForURL(/\/apartamentos\/[0-9a-f-]{36}$/);
    const id = await idPorNombre(nombre);

    // La aserción de persistencia se hace RECARGANDO, no leyendo el estado del
    // cliente: sin recargar, los valores que se ven son los que el navegador
    // nunca soltó y el test pasaría con una action que no escribe nada.
    await paginaAdmin.reload();
    await expect(paginaAdmin.getByRole('heading', { name: nombre, level: 1 })).toBeVisible();
    await expect(paginaAdmin.getByText('Incompleta', { exact: true })).toBeVisible();

    // Y la fila nace INACTIVA: `Guardar` no activa nada.
    const { data } = await servicio
      .from('properties')
      .select('is_active, cluster')
      .eq('id', id)
      .single();
    expect(data?.is_active).toBe(false);
    expect(data?.cluster).toBe(CLUSTER);
  });

  test('los 12 campos y los 3 secretos sobreviven a una recarga', async ({ paginaAdmin }) => {
    const nombre = nombreUnico('Completo');

    await paginaAdmin.goto('/apartamentos/nuevo');

    await paginaAdmin.getByLabel('Nombre', { exact: true }).fill(nombre);
    await elegirCluster(paginaAdmin, CLUSTER);
    await paginaAdmin.getByLabel('Dirección').fill(DIRECCION);
    await paginaAdmin.getByLabel('Link de Google Maps').fill(MAPS);

    await paginaAdmin.getByLabel('Tarifa al huésped').fill(String(TARIFA));
    await paginaAdmin.getByLabel('Pago al aseador').fill(String(PAGO));
    await paginaAdmin.getByRole('switch', { name: 'Fee discriminado' }).click();

    await paginaAdmin.getByLabel('Aseador responsable').click();
    await paginaAdmin.getByRole('option', { name: ASEADOR, exact: true }).click();

    await paginaAdmin.getByLabel('Hora límite').fill('10:00');
    await paginaAdmin.getByLabel('Código de acceso').fill(CODIGO);
    await paginaAdmin.getByLabel('Notas de acceso').fill(NOTAS);

    await botonGuardar(paginaAdmin).click();
    await paginaAdmin.waitForURL(/\/apartamentos\/[0-9a-f-]{36}$/);
    const id = await idPorNombre(nombre);

    await paginaAdmin.reload();

    // ── Los 9 campos de `properties` que se ven en pantalla ──────────────────
    await expect(paginaAdmin.getByLabel('Nombre', { exact: true })).toHaveValue(nombre);
    await expect(paginaAdmin.getByLabel('Cluster')).toHaveAccessibleName(
      new RegExp(CLUSTER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    );
    await expect(paginaAdmin.getByLabel('Dirección')).toHaveValue(DIRECCION);
    await expect(paginaAdmin.getByLabel('Link de Google Maps')).toHaveValue(MAPS);
    await expect(paginaAdmin.getByLabel('Hora límite')).toHaveValue('10:00');
    await expect(paginaAdmin.getByRole('switch', { name: 'Fee discriminado' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(paginaAdmin.getByLabel('Aseador responsable')).toHaveAccessibleName(
      new RegExp(ASEADOR),
    );

    // ── Los 3 de `property_secrets`, que exigen `leerSecretos` ───────────────
    // Es la mitad del criterio 2 que no se puede fingir: el mismo `select` con el
    // JWT del admin devuelve `42501`, así que si el detalle no llamara a la
    // Server Action con el cliente administrativo, estos campos saldrían vacíos.
    await expect(paginaAdmin.getByLabel('Código de acceso')).toHaveValue(CODIGO);
    await expect(paginaAdmin.getByLabel('Notas de acceso')).toHaveValue(NOTAS);
    await expect(paginaAdmin.getByLabel('Tipo de cerradura')).toHaveAccessibleName(
      /Cerradura inteligente/,
    );

    // ── LA ASERCION QUE ATRAPA EL BUG DE LA MASCARA DE DINERO ────────────────
    // En pantalla se ve el separador de miles; en la base tiene que haber el
    // ENTERO. Si `setValueAs` desapareciera, `Number('120.000')` guardaría 120,
    // que es un entero válido, no negativo, y pasa los tres CHECK de la base sin
    // que nada se queje. Las dos mitades tienen que estar en el mismo test: por
    // separado, la de pantalla pasaría con cualquier texto y la de base con
    // cualquier número.
    await expect(paginaAdmin.getByLabel('Tarifa al huésped')).toHaveValue('120.000');
    await expect(paginaAdmin.getByLabel('Pago al aseador')).toHaveValue('45.000');

    const { data: fila } = await servicio
      .from('properties')
      .select(
        'tarifa_huesped, pago_aseador, direccion, maps_url, hora_limite, fee_discriminado, responsable_id, gestion_vivaguest',
      )
      .eq('id', id)
      .single();

    // El responsable se comprueba contra el id del perfil, no contra el texto de
    // la pantalla: un `Select` que pintara el nombre correcto y enviara otro uuid
    // pasaría la aserción visual.
    const { data: perfil } = await servicio
      .from('profiles')
      .select('id')
      .eq('full_name', ASEADOR)
      .single();
    expect(fila?.responsable_id).toBe(perfil?.id);
    expect(fila?.gestion_vivaguest).toBe(true);

    expect(fila?.tarifa_huesped).toBe(TARIFA);
    expect(fila?.pago_aseador).toBe(PAGO);
    expect(fila?.direccion).toBe(DIRECCION);
    expect(fila?.maps_url).toBe(MAPS);
    expect(fila?.hora_limite).toBe('10:00:00');
    expect(fila?.fee_discriminado).toBe(true);

    // Y los secretos están donde tienen que estar, leídos con el cliente que sí
    // puede: el de servicio.
    const { data: secretos } = await servicio
      .from('property_secrets')
      .select('codigo_acceso, notas_acceso, tipo_cerradura')
      .eq('property_id', id)
      .single();

    expect(secretos?.codigo_acceso).toBe(CODIGO);
    expect(secretos?.notas_acceso).toBe(NOTAS);
    expect(secretos?.tipo_cerradura).toBe('inteligente');
  });

  test('activar desde el formulario y desactivar desde la tabla mueve el estado', async ({
    paginaAdmin,
  }) => {
    const nombre = nombreUnico('Activable');

    await paginaAdmin.goto('/apartamentos/nuevo');
    await paginaAdmin.getByLabel('Nombre', { exact: true }).fill(nombre);
    await elegirCluster(paginaAdmin, CLUSTER);
    await paginaAdmin.getByLabel('Tarifa al huésped').fill(String(TARIFA));
    await paginaAdmin.getByLabel('Pago al aseador').fill(String(PAGO));
    await paginaAdmin.getByLabel('Aseador responsable').click();
    await paginaAdmin.getByRole('option', { name: ASEADOR, exact: true }).click();

    await botonActivar(paginaAdmin).click();
    await paginaAdmin.waitForURL(/\/apartamentos\/[0-9a-f-]{36}$/);
    const id = await idPorNombre(nombre);

    await paginaAdmin.reload();
    await expect(paginaAdmin.getByText('Activa', { exact: true })).toBeVisible();

    const { data: activa } = await servicio
      .from('properties')
      .select('is_active')
      .eq('id', id)
      .single();
    expect(activa?.is_active).toBe(true);

    // ── Desactivar desde el menú de la tabla (§7.3) ──────────────────────────
    await paginaAdmin.goto('/apartamentos');
    const fila = paginaAdmin.getByRole('row').filter({ hasText: nombre });
    await expect(fila.getByText('Activa', { exact: true })).toBeVisible();

    await paginaAdmin.getByRole('button', { name: `Acciones de ${nombre}` }).click();
    // `exact` obligatorio: 'Desactivar' contiene 'activar', y el menú también
    // ofrece 'Cambiar calendario'.
    await paginaAdmin.getByRole('menuitem', { name: 'Desactivar', exact: true }).click();
    await paginaAdmin
      .getByRole('button', { name: 'Desactivar', exact: true })
      .click();

    await expect(fila.getByText('Inactiva', { exact: true })).toBeVisible();
  });
});

test.describe('Criterio 3: las puertas de activación', () => {
  test('el botón está deshabilitado con datos incompletos y el checklist dice qué falta', async ({
    paginaAdmin,
  }) => {
    await paginaAdmin.goto('/apartamentos/nuevo');
    await paginaAdmin.getByLabel('Nombre', { exact: true }).fill(nombreUnico('Puertas'));
    await elegirCluster(paginaAdmin, CLUSTER);

    await expect(botonActivar(paginaAdmin)).toBeDisabled();

    // CONTROL de que la pantalla está viva y el otro botón sí se habilita: sin
    // esto, `toBeDisabled` pasaría igual sobre un formulario que no cargó.
    await expect(botonGuardar(paginaAdmin)).toBeEnabled();

    // El bloque lista EXACTAMENTE las tres carencias de una unidad gestionada, en
    // el orden del contrato. Un `toBeVisible` por ítem pasaría también con una
    // lista que pinta siempre los tres sin mirar el estado.
    await expect(paginaAdmin.getByText('Para activar falta:')).toBeVisible();
    await expect(checklist(paginaAdmin)).toHaveText([
      /Tarifa al huésped/,
      /Pago al aseador/,
      /Aseador responsable/,
    ]);
  });

  test('al completar el último faltante el botón se habilita SIN recargar', async ({
    paginaAdmin,
  }) => {
    await paginaAdmin.goto('/apartamentos/nuevo');
    await paginaAdmin.getByLabel('Nombre', { exact: true }).fill(nombreUnico('Reactivo'));
    await elegirCluster(paginaAdmin, CLUSTER);

    await expect(botonActivar(paginaAdmin)).toBeDisabled();
    await expect(checklist(paginaAdmin)).toHaveCount(3);

    // ── LA PRUEBA DE QUE LA LISTA SE RECALCULA EN VIVO ───────────────────────
    // Se comprueba ítem a ítem que el conteo de PENDIENTES baja 3 → 2 → 1 → 0.
    // Una lista que se renderizara una sola vez con el contenido correcto pasaría
    // la primera y la última aserción de un test que solo mirara los extremos;
    // aquí tiene que cambiar tres veces, y en ningún momento se recarga la página.
    const pendientes = () =>
      paginaAdmin.getByRole('listitem').filter({ hasText: 'Falta:' });

    await expect(pendientes()).toHaveCount(3);

    await paginaAdmin.getByLabel('Tarifa al huésped').fill(String(TARIFA));
    await expect(pendientes()).toHaveCount(2);
    await expect(botonActivar(paginaAdmin)).toBeDisabled();

    await paginaAdmin.getByLabel('Pago al aseador').fill(String(PAGO));
    await expect(pendientes()).toHaveCount(1);
    await expect(botonActivar(paginaAdmin)).toBeDisabled();

    await paginaAdmin.getByLabel('Aseador responsable').click();
    await paginaAdmin.getByRole('option', { name: ASEADOR, exact: true }).click();

    await expect(pendientes()).toHaveCount(0);
    // El CONTROL positivo del `toBeDisabled` de arriba, y la aserción central del
    // criterio 3: sin `page.reload()` de por medio.
    await expect(botonActivar(paginaAdmin)).toBeEnabled();
  });

  test('pulsar un ítem del checklist lleva el foco a su campo', async ({ paginaAdmin }) => {
    await paginaAdmin.goto('/apartamentos/nuevo');
    await paginaAdmin.getByLabel('Nombre', { exact: true }).fill(nombreUnico('Foco'));
    await elegirCluster(paginaAdmin, CLUSTER);

    // CONTROL: el foco NO está ya en el campo antes de pulsar, o la aserción de
    // abajo pasaría sin que el botón hiciera nada.
    await expect(paginaAdmin.getByLabel('Pago al aseador')).not.toBeFocused();

    await checklist(paginaAdmin).filter({ hasText: 'Pago al aseador' }).click();
    await expect(paginaAdmin.getByLabel('Pago al aseador')).toBeFocused();

    await checklist(paginaAdmin).filter({ hasText: 'Aseador responsable' }).click();
    await expect(paginaAdmin.getByLabel('Aseador responsable')).toBeFocused();
  });

  test('PUERTA SOLO DE UI: una informativa sin contacto externo no se puede activar', async ({
    paginaAdmin,
  }) => {
    // ════════════════════════════════════════════════════════════════════════
    // ESTA ASERCION NO TIENE NINGUNA RED DEBAJO, Y ESTA DECLARADO.
    //
    // `props_active_requires_owner` está condicionado a `gestion_vivaguest AND
    // is_active`, así que para una unidad de gestión externa el CHECK es
    // verdadero por vacuidad: LA BASE DEJARIA activar una informativa con el
    // contacto vacío, y hay un test de integración del plan 02-10 que lo prueba
    // escrito al revés, a propósito.
    //
    // Por eso este test es de Playwright y no de integración: no existe ningún
    // 23514 que lo cubra. Si el refinamiento de `esquemaActivar` o esta pantalla
    // se rompen, una de las 5 unidades externas puede quedar activa sin nadie a
    // quien llamar, y el dato faltante no aparece hasta el primer aseo.
    // ════════════════════════════════════════════════════════════════════════
    await paginaAdmin.goto('/apartamentos/nuevo');
    await paginaAdmin.getByLabel('Nombre', { exact: true }).fill(nombreUnico('Informativa'));
    await elegirCluster(paginaAdmin, CLUSTER);

    await paginaAdmin.getByRole('switch', { name: 'Gestionado por VivaGuest' }).click();

    // La sección Dinero desaparece ENTERA (§8.1) y el checklist se queda con UN
    // solo ítem. Que sea exactamente uno es lo que distingue la regla simétrica
    // de "no se pide nada": con `toHaveCount` a secas de 3 seguiría pasando una
    // pantalla que ignora el switch.
    await expect(paginaAdmin.getByLabel('Tarifa al huésped')).toHaveCount(0);
    await expect(
      paginaAdmin.getByText('Las unidades de gestión externa no llevan tarifas.'),
    ).toBeVisible();
    await expect(checklist(paginaAdmin)).toHaveText([/Contacto externo/]);

    await expect(botonActivar(paginaAdmin)).toBeDisabled();

    // Un contacto de SOLO ESPACIOS tampoco sirve: en pantalla es indistinguible
    // de vacío y guardado dejaría la unidad activa sin nadie a quien llamar.
    await paginaAdmin.getByLabel('Contacto externo').fill('   ');
    await expect(botonActivar(paginaAdmin)).toBeDisabled();

    // CONTROL positivo: con contacto de verdad SI se habilita. Sin él, las tres
    // aserciones de arriba pasarían con un botón deshabilitado para siempre.
    await paginaAdmin.getByLabel('Contacto externo').fill('Marcela, 300 123 4567');
    await expect(botonActivar(paginaAdmin)).toBeEnabled();
  });

  test('pasar a gestión externa con datos escritos pide confirmación, y cancelar no toca nada', async ({
    paginaAdmin,
  }) => {
    await paginaAdmin.goto('/apartamentos/nuevo');
    await paginaAdmin.getByLabel('Nombre', { exact: true }).fill(nombreUnico('Confirmar'));
    await elegirCluster(paginaAdmin, CLUSTER);
    await paginaAdmin.getByLabel('Tarifa al huésped').fill(String(TARIFA));

    const switchGestion = paginaAdmin.getByRole('switch', {
      name: 'Gestionado por VivaGuest',
    });
    await expect(switchGestion).toHaveAttribute('aria-checked', 'true');

    await switchGestion.click();

    // Copy literal de §8.3 y §15.
    await expect(
      paginaAdmin.getByRole('heading', { name: 'Marcar como gestión externa' }),
    ).toBeVisible();
    await expect(
      paginaAdmin.getByText(
        'Esto borra el responsable, el suplente y las tarifas de este apartamento.',
        { exact: false },
      ),
    ).toBeVisible();

    await paginaAdmin.getByRole('button', { name: 'Cancelar', exact: true }).click();

    // Cancelar deja el switch como estaba y la tarifa escrita intacta. La segunda
    // mitad es la que importa: un diálogo que "cancela" pero ya había borrado los
    // campos habría pasado la primera.
    await expect(switchGestion).toHaveAttribute('aria-checked', 'true');
    await expect(paginaAdmin.getByLabel('Tarifa al huésped')).toHaveValue('120.000');

    // Y confirmando SI cambia y SI borra, que es el control de que el diálogo
    // hace algo.
    await switchGestion.click();
    await paginaAdmin.getByRole('button', { name: 'Marcar como externa' }).click();

    await expect(switchGestion).toHaveAttribute('aria-checked', 'false');
    await expect(paginaAdmin.getByLabel('Tarifa al huésped')).toHaveCount(0);
    await expect(paginaAdmin.getByLabel('Contacto externo')).toBeVisible();
  });
});
