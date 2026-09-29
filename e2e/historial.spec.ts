import type { Locator, Page } from '@playwright/test';

import { formatFechaBog } from '@/lib/domain/dates';

import {
  expect,
  limpiarOperacion,
  sembrarAseos,
  sembrarDanos,
  sembrarOperacion,
  sumarDias,
  test,
  type EscenarioDeOperacion,
  type Servicio,
} from './fixtures';
import { cargarEnvLocal, clienteDeServicio } from './global-setup';

/**
 * EL HISTORIAL DEL APARTAMENTO (DASH-06, REPORT-04, criterio 5, UI-SPEC §14).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * LOS DAÑOS SE SIEMBRAN A MANO PORQUE HOY NO LOS ESCRIBE NADIE.
 *
 * `damages` la puebla el aseador desde la PWA, que llega en la Fase 6, así que
 * en cualquier entorno de hoy la tabla está vacía. La mitad de este archivo
 * prueba una mezcla —aseos y daños en una sola línea de tiempo— que en
 * producción todavía no se puede producir sola. Queda dicho aquí para que nadie
 * lea el verde como "esto ya ocurre".
 *
 * Lo que sí es real hoy es la otra mitad: el orden, el estado vacío, la ausencia
 * de acciones y la unidad de gestión externa.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── LA SECCIÓN SE ACOTA POR SU `id`, Y ESO NO ES COMODIDAD ─────────────────
 *
 * El historial vive DENTRO de la ficha del apartamento (D-22), debajo de un
 * formulario de doce campos lleno de botones, selectores y menús. Una aserción
 * de "acá no hay ni un botón" hecha a nivel de página sería falsa siempre. Todo
 * lo de este archivo cuelga de `#historial`.
 */

/** La sección de historial dentro de la ficha. */
function historial(p: Page): Locator {
  return p.locator('#historial');
}

/** Las entradas de la línea de tiempo. Es una `<ul>`, así que son `listitem`. */
function entradas(p: Page): Locator {
  return historial(p).getByRole('listitem');
}

/** El rótulo de la línea 1 de cada entrada: `Terminado`, `Daño reportado`, … */
async function rotulos(p: Page): Promise<string[]> {
  return entradas(p).evaluateAll((elementos) =>
    elementos.map((el) => el.querySelectorAll('span > span')[1]?.textContent?.trim() ?? ''),
  );
}

let servicio: Servicio;
let escenario: EscenarioDeOperacion;

test.beforeAll(async () => {
  cargarEnvLocal();
  servicio = clienteDeServicio();
  escenario = await sembrarOperacion(servicio);
});

test.afterAll(async () => {
  if (escenario) await limpiarOperacion(servicio, escenario);
});

test.beforeEach(async () => {
  // Los daños caen en cascada con sus aseos (`damages.cleaning_id` es
  // `on delete cascade`), así que borrar los aseos limpia las dos tablas.
  const { error } = await servicio
    .from('cleanings')
    .delete()
    .in('property_id', [
      escenario.gestionada.id,
      escenario.segunda.id,
      escenario.tercera.id,
      // Las tres de relleno de la tanda por dia (D-05-8). Van en la limpieza y no
      // solo en la siembra: un aseo que sobreviva de un caso anterior desplaza los
      // conteos del siguiente, y el rojo aparece en el caso que no lo causo.
      escenario.cuarta.id,
      escenario.quinta.id,
      escenario.sexta.id,
      escenario.externa.id,
    ]);
  if (error) throw new Error(`No se pudo limpiar entre tests: ${error.message}`);
});

// ───────────────────────────────────────────────────────────────────────────
// 1. ASEOS Y DAÑOS, MEZCLADOS Y EN ORDEN CRONOLÓGICO DESCENDENTE
// ───────────────────────────────────────────────────────────────────────────

test('los aseos y los daños —hoy sembrados a mano: nadie escribe damages hasta la Fase 6— salen mezclados y de más reciente a más antiguo', async ({
  paginaAdmin,
}) => {
  const { gestionada, aseadoraA, fechas } = escenario;
  const anteayer = sumarDias(fechas.hoy, -2);

  // Tres días DISTINTOS a propósito: con dos entradas del mismo día el orden lo
  // decide un desempate por instante que este test no controla, y la aserción
  // mediría el desempate en vez de la mezcla.
  const [aseoDeHoy, aseoViejo] = await sembrarAseos(servicio, [
    { propiedad: gestionada.id, fecha: fechas.hoy },
    {
      propiedad: gestionada.id,
      fecha: anteayer,
      estado: 'completada',
      aseador: aseadoraA.id,
    },
  ]);

  // El daño va en AYER, entre los dos aseos. Si el historial leyera dos listas
  // separadas y las concatenara, el daño saldría al principio o al final, nunca
  // en medio.
  const ayerMs = Date.parse(`${fechas.ayer}T15:00:00-05:00`);
  await sembrarDanos(servicio, [
    {
      aseo: aseoViejo,
      propiedad: gestionada.id,
      descripcion: 'Se rompió la ducha del cuarto principal',
      reportadoPor: aseadoraA.id,
      creadoEnMs: ayerMs,
    },
  ]);

  await paginaAdmin.goto(`/apartamentos/${gestionada.id}`);

  await expect(historial(paginaAdmin).getByRole('heading', { name: 'Historial', exact: true })).toBeVisible();
  await expect(entradas(paginaAdmin)).toHaveCount(3);

  expect(await rotulos(paginaAdmin)).toEqual([
    'Sin confirmar',
    'Daño reportado',
    'Terminado',
  ]);

  // Y las fechas son las de negocio, no las del proceso. `damages.created_at` es
  // un `timestamptz`: recortarle los diez primeros caracteres daría el día de
  // UTC, y un daño reportado a las 21:00 de Bogotá se pintaría al día siguiente.
  const fechasEnPantalla = await entradas(paginaAdmin).evaluateAll((elementos) =>
    elementos.map((el) => el.querySelectorAll('span > span')[0]?.textContent?.trim() ?? ''),
  );
  expect(fechasEnPantalla).toEqual([
    formatFechaBog(fechas.hoy),
    formatFechaBog(fechas.ayer),
    formatFechaBog(anteayer),
  ]);

  // CONTROL de que el aseo de hoy es el que se sembró y no otro: sin él, los tres
  // rótulos podrían cuadrar sobre filas de otro apartamento.
  const { data } = await servicio
    .from('cleanings')
    .select('id')
    .eq('property_id', gestionada.id)
    .eq('scheduled_date', fechas.hoy)
    .single();
  expect(data?.id).toBe(aseoDeHoy);
});

// ───────────────────────────────────────────────────────────────────────────
// 2. UN DAÑO RESUELTO NO SE OCULTA
// ───────────────────────────────────────────────────────────────────────────

test('un daño resuelto SIGUE en el historial, con el sufijo · Resuelto', async ({
  paginaAdmin,
}) => {
  const { gestionada, aseadoraA, fechas } = escenario;

  const [aseo] = await sembrarAseos(servicio, [
    { propiedad: gestionada.id, fecha: fechas.ayer, estado: 'completada', aseador: aseadoraA.id },
  ]);

  const base = Date.parse(`${fechas.ayer}T15:00:00-05:00`);
  await sembrarDanos(servicio, [
    {
      aseo,
      propiedad: gestionada.id,
      descripcion: 'Bombillo fundido en la sala',
      reportadoPor: aseadoraA.id,
      creadoEnMs: base,
      resuelto: true,
    },
    {
      aseo,
      propiedad: gestionada.id,
      descripcion: 'Mancha en el sofá',
      reportadoPor: aseadoraA.id,
      creadoEnMs: base - 60_000,
    },
  ]);

  await paginaAdmin.goto(`/apartamentos/${gestionada.id}`);

  // LOS DOS ESTÁN. Filtrar los resueltos convierte "esta unidad se rompe cada
  // mes" en "esta unidad no se rompe nunca", que es justo el dato con el que se
  // decide si vale la pena seguir operándola.
  await expect(entradas(paginaAdmin)).toHaveCount(3);
  await expect(historial(paginaAdmin).getByText('Bombillo fundido en la sala')).toBeVisible();
  await expect(historial(paginaAdmin).getByText('Mancha en el sofá')).toBeVisible();

  // El resuelto se distingue POR TEXTO, no por color ni por opacidad: atenuarlo
  // reintroduciría la jerarquía visual que el criterio 4 prohíbe.
  const filaResuelta = entradas(paginaAdmin).filter({ hasText: 'Bombillo fundido en la sala' });
  await expect(filaResuelta).toContainText('· Resuelto');

  const filaAbierta = entradas(paginaAdmin).filter({ hasText: 'Mancha en el sofá' });
  await expect(filaAbierta).not.toContainText('Resuelto');
});

// ───────────────────────────────────────────────────────────────────────────
// 3. EL HISTORIAL NO TIENE NI UNA ACCIÓN (D-23)
// ───────────────────────────────────────────────────────────────────────────

test('el historial es solo lectura: ni botones, ni menú de tres puntos, ni enlaces', async ({
  paginaAdmin,
}) => {
  const { gestionada, aseadoraA, fechas } = escenario;

  const [aseo] = await sembrarAseos(servicio, [
    { propiedad: gestionada.id, fecha: fechas.ayer, estado: 'completada', aseador: aseadoraA.id },
  ]);
  await sembrarDanos(servicio, [
    {
      aseo,
      propiedad: gestionada.id,
      descripcion: 'Puerta del balcón desalineada',
      reportadoPor: aseadoraA.id,
      creadoEnMs: Date.parse(`${fechas.ayer}T15:00:00-05:00`),
    },
  ]);

  await paginaAdmin.goto(`/apartamentos/${gestionada.id}`);

  // CONTROL: la sección tiene contenido. Sin esta mitad, las tres aserciones
  // negativas de abajo pasarían sobre un historial que no renderizó nada.
  await expect(entradas(paginaAdmin)).toHaveCount(2);

  // Los RPC de reporte llegan en la Fase 6; esta fase MUESTRA. Un botón de
  // resolver acá sería un botón sin RPC detrás, y un control que no hace nada es
  // peor que no tenerlo.
  await expect(historial(paginaAdmin).getByRole('button')).toHaveCount(0);
  await expect(historial(paginaAdmin).getByRole('menuitem')).toHaveCount(0);
  await expect(historial(paginaAdmin).getByRole('link')).toHaveCount(0);
});

// ───────────────────────────────────────────────────────────────────────────
// 4. EL ESTADO VACÍO, QUE NO ES UNA TABLA DE CERO FILAS
// ───────────────────────────────────────────────────────────────────────────

test('un apartamento sin historial muestra el estado vacío y no una lista de cero elementos', async ({
  paginaAdmin,
}) => {
  await paginaAdmin.goto(`/apartamentos/${escenario.tercera.id}`);

  await expect(historial(paginaAdmin).getByRole('heading', { name: 'Historial', exact: true })).toBeVisible();

  await expect(
    historial(paginaAdmin).getByText('Este apartamento no tiene historial todavía.'),
  ).toBeVisible();
  await expect(
    historial(paginaAdmin).getByText('Los aseos y los daños reportados van a aparecer acá.'),
  ).toBeVisible();

  // Y NO hay lista vacía: una `<ul>` de cero elementos con su borde se lee como
  // un contenedor que no cargó, que es la lectura contraria a "todavía no pasa
  // nada acá".
  await expect(historial(paginaAdmin).getByRole('list')).toHaveCount(0);
});

// ───────────────────────────────────────────────────────────────────────────
// 5. LA UNIDAD DE GESTIÓN EXTERNA TAMBIÉN TIENE HISTORIAL
// ───────────────────────────────────────────────────────────────────────────

test('una unidad de gestión externa muestra su historial, con las entradas inertes y sin ocultar la sección', async ({
  paginaAdmin,
}) => {
  const { externa, fechas } = escenario;

  await sembrarAseos(servicio, [
    { propiedad: externa.id, fecha: fechas.ayer },
    { propiedad: externa.id, fecha: sumarDias(fechas.hoy, -3) },
  ]);

  await paginaAdmin.goto(`/apartamentos/${externa.id}`);

  // La sección NO se oculta: el historial de fechas de una unidad informativa es
  // real, y son las mismas seis siluetas que el admin ya conoce de `/operacion`.
  await expect(historial(paginaAdmin).getByRole('heading', { name: 'Historial', exact: true })).toBeVisible();
  await expect(entradas(paginaAdmin)).toHaveCount(2);

  expect(await rotulos(paginaAdmin)).toEqual(['Gestión externa', 'Gestión externa']);

  // La línea 2 va VACÍA, y eso es deliberado: `cl_unmanaged_is_inert` deja
  // `aseador_id` nulo por construcción, así que escribir `Sin asignar` sugeriría
  // que falta asignarlo. No falta: no aplica.
  await expect(historial(paginaAdmin).getByText('Sin asignar')).toHaveCount(0);
  await expect(historial(paginaAdmin).getByText('Repaso')).toHaveCount(0);
});
