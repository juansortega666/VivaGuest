import {
  diaDeNegocio,
  expect,
  idPorEmail,
  leerCredenciales,
  test,
  type Servicio,
} from './fixtures';
import { cargarEnvLocal, clienteDeServicio } from './global-setup';

/** Un apartamento gestionado que tenga al menos dos cuartos configurados. */
async function propiedadConCuartos(servicio: Servicio) {
  const { data, error } = await servicio
    .from('property_rooms')
    .select('id, property_id, room_type_id, sort_order, properties!inner(gestion_vivaguest)')
    .eq('properties.gestion_vivaguest', true)
    .order('property_id')
    .limit(400);

  if (error) throw new Error(error.message);

  const porProp = new Map<string, typeof data>();
  for (const r of data ?? []) {
    const lista = porProp.get(r.property_id) ?? [];
    lista.push(r);
    porProp.set(r.property_id, lista);
  }
  for (const [propiedad, cuartos] of porProp) {
    if (cuartos.length >= 2) return { propiedad, cuartos: cuartos.slice(0, 2) };
  }
  throw new Error('no hay apartamento gestionado con dos cuartos');
}

test.describe('la pantalla del aseo con checklist', () => {
  let servicio: Servicio;
  let aseoId = '';
  let terminadoId = '';

  test.beforeAll(async () => {
    cargarEnvLocal();
    servicio = clienteDeServicio();
    const hoy = await diaDeNegocio(servicio);
    const creds = leerCredenciales();
    const aseador = await idPorEmail(servicio, creds.aseador1.email);

    const { propiedad, cuartos } = await propiedadConCuartos(servicio);

    const { data: tareas } = await servicio
      .from('checklist_tasks')
      .select('id, descripcion, room_type_id, requiere_foto')
      .limit(50);

    // Se limpian los aseos de esa propiedad hoy: el indice parcial deja UNO vivo.
    await servicio.from('cleanings').delete().eq('property_id', propiedad).eq('scheduled_date', hoy);

    const hace4 = new Date(Date.now() - 4 * 3600_000).toISOString();
    const hace2 = new Date(Date.now() - 2 * 3600_000).toISOString();
    const hace1 = new Date(Date.now() - 3600_000).toISOString();

    const insertado = await servicio
      .from('cleanings')
      .insert({
        property_id: propiedad,
        origin: 'ical',
        scheduled_date: hoy,
        state: 'en_curso',
        aseador_id: aseador,
        confirmado_at: hace4,
        started_at: hace2,
        num_huespedes: 4,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      .select('id')
      .single();
    if (insertado.error) throw new Error(insertado.error.message);
    aseoId = insertado.data.id;

    const filas = cuartos.flatMap((cuarto, i) => {
      const delTipo = (tareas ?? []).filter((t) => t.room_type_id === cuarto.room_type_id).slice(0, 2);
      return delTipo.map((t, j) => ({
        cleaning_id: aseoId,
        property_room_id: cuarto.id,
        checklist_task_id: t.id,
        room_label: i === 0 ? 'Cuarto de prueba A' : 'Cuarto de prueba B',
        task_label: t.descripcion,
        requiere_foto: t.requiere_foto,
        sort_order: i * 100 + j,
      }));
    });
    if (filas.length === 0) throw new Error('no se armaron tareas de prueba');
    const ins = await servicio.from('cleaning_checklist_items').insert(filas);
    if (ins.error) throw new Error(ins.error.message);

    // Un segundo aseo, ya terminado, en otro dia: no hay barra de accion.
    const otro = await propiedadConCuartos(servicio);
    const ayer = new Date(Date.parse(`${hoy}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    await servicio.from('cleanings').delete().eq('property_id', otro.propiedad).eq('scheduled_date', ayer);
    const t2 = await servicio
      .from('cleanings')
      .insert({
        property_id: otro.propiedad,
        origin: 'ical',
        scheduled_date: ayer,
        state: 'completada',
        aseador_id: aseador,
        confirmado_at: hace4,
        started_at: hace2,
        finished_at: hace1,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      .select('id')
      .single();
    if (t2.error) throw new Error(t2.error.message);
    terminadoId = t2.data.id;
  });

  test.afterAll(async () => {
    if (aseoId) await servicio.from('cleanings').delete().eq('id', aseoId);
    if (terminadoId) await servicio.from('cleanings').delete().eq('id', terminadoId);
  });

  test('el aseo en curso trae el checklist y la barra fija', async ({ paginaAseador }) => {
    const respuesta = await paginaAseador.goto(`/aseos/${aseoId}`);
    expect(respuesta?.status()).toBe(200);

    await expect(paginaAseador.getByRole('heading', { name: 'Checklist' })).toBeVisible();
    await expect(paginaAseador.getByRole('button', { name: /Cuarto de prueba A/ })).toBeVisible();
    await expect(paginaAseador.getByRole('button', { name: 'Terminar aseo' })).toBeVisible();

    // El nombre accesible de la cabecera lleva el contador en palabras.
    await expect(
      paginaAseador.getByRole('button', { name: /Cuarto de prueba A, \d+ de \d+ tareas/ }),
    ).toBeVisible();

    // Las tareas son casillas de verdad.
    expect(await paginaAseador.getByRole('checkbox').count()).toBeGreaterThan(0);

    // El area segura declarada en el layout del arbol.
    const meta = await paginaAseador.locator('meta[name="viewport"]').getAttribute('content');
    expect(meta).toContain('viewport-fit=cover');

    // El copy de compromiso de la Fase 5 se retiro.
    await expect(paginaAseador.getByText(/próxima versión de la app/)).toHaveCount(0);
  });

  test('marcar una tarea mueve el contador al instante', async ({ paginaAseador }) => {
    await paginaAseador.goto(`/aseos/${aseoId}`);

    const antes = await paginaAseador
      .getByRole('button', { name: /Cuarto de prueba A, \d+ de \d+ tareas/ })
      .getAttribute('aria-label');

    // Se toca el ROTULO y no la casilla: el rotulo es el destino de toque que
    // define §7.3, y la casilla mide un pixel a proposito. Un `force: true`
    // sobre la casilla pasaria el test midiendo algo que ningun dedo hace.
    await paginaAseador.locator('label:has(input[type=checkbox])').first().click();

    await expect
      .poll(async () =>
        paginaAseador
          .getByRole('button', { name: /Cuarto de prueba A, \d+ de \d+ tareas/ })
          .getAttribute('aria-label'),
      )
      .not.toBe(antes);
  });

  test('un aseo terminado no ofrece barra de accion', async ({ paginaAseador }) => {
    await paginaAseador.goto(`/aseos/${terminadoId}`);

    await expect(paginaAseador.getByRole('button', { name: 'Terminar aseo' })).toHaveCount(0);
    await expect(paginaAseador.getByRole('button', { name: 'Comenzar aseo' })).toHaveCount(0);
  });
});
