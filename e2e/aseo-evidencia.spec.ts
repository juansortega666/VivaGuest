import {
  diaDeNegocio,
  expect,
  idPorEmail,
  leerCredenciales,
  test,
  type Servicio,
} from './fixtures';
import { cargarEnvLocal, clienteDeServicio } from './global-setup';

/**
 * EL ASISTENTE DE EVIDENCIA EN UN NAVEGADOR DE VERDAD (plan 06-08).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * LO QUE MIDE, Y ES LO QUE NINGUNA OTRA PUERTA VE:
 *
 *   · las DOS guardas de entrada de la ruta (no en curso -> ficha; ajeno ->
 *     estado vacio), que son autorizacion de pantalla y solo existen en runtime
 *   · que la foto **sobreviva a un fallo de subida**, que es el criterio de
 *     aceptacion que el plan pedia comprobar a mano. Aqui se comprueba
 *     provocando el fallo a proposito: se intercepta la subida a Storage y se
 *     responde 500. Un senuelo de verdad, no una inspeccion visual.
 *   · que saltar un cuarto exija motivo y no exista ningun atajo que lo evite
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Un apartamento gestionado con al menos dos cuartos configurados. */
async function propiedadesConCuartos(servicio: Servicio) {
  const { data, error } = await servicio
    .from('property_rooms')
    .select('id, property_id, room_type_id, properties!inner(gestion_vivaguest)')
    .eq('properties.gestion_vivaguest', true)
    .order('property_id')
    .limit(400);
  if (error) throw new Error(error.message);

  const porProp = new Map<string, NonNullable<typeof data>>();
  for (const r of data ?? []) {
    const lista = porProp.get(r.property_id) ?? [];
    lista.push(r);
    porProp.set(r.property_id, lista);
  }
  const aptas = [...porProp.entries()].filter(([, c]) => c.length >= 2);
  if (aptas.length < 2) throw new Error('hacen falta dos apartamentos con cuartos');
  return aptas;
}

test.describe('el asistente de evidencia', () => {
  let servicio: Servicio;
  let enCurso = '';
  let pendiente = '';
  let ajeno = '';

  test.beforeAll(async () => {
    cargarEnvLocal();
    servicio = clienteDeServicio();
    const hoy = await diaDeNegocio(servicio);
    const creds = leerCredenciales();
    const aseador = await idPorEmail(servicio, creds.aseador1.email);
    const otro = await idPorEmail(servicio, creds.aseador2.email);

    const aptas = await propiedadesConCuartos(servicio);
    const { data: tareas } = await servicio
      .from('checklist_tasks')
      .select('id, descripcion, room_type_id, requiere_foto')
      .limit(80);

    const hace4 = new Date(Date.now() - 4 * 3600_000).toISOString();
    const hace2 = new Date(Date.now() - 2 * 3600_000).toISOString();

    async function sembrar(
      propiedad: string,
      cuartos: { id: string; room_type_id: string }[],
      estado: 'en_curso' | 'pendiente',
      duenio: string,
      fecha: string,
    ) {
      await servicio.from('cleanings').delete().eq('property_id', propiedad).eq('scheduled_date', fecha);
      const base: Record<string, unknown> = {
        property_id: propiedad,
        origin: 'ical',
        scheduled_date: fecha,
        state: estado,
        aseador_id: duenio,
        confirmado_at: hace4,
        num_huespedes: 3,
      };
      if (estado === 'en_curso') base.started_at = hace2;

      const ins = await servicio
        .from('cleanings')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(base as any)
        .select('id')
        .single();
      if (ins.error) throw new Error(ins.error.message);
      const id = ins.data.id;

      const filas = cuartos.flatMap((cuarto, i) => {
        const delTipo = (tareas ?? []).filter((t) => t.room_type_id === cuarto.room_type_id).slice(0, 2);
        return delTipo.map((t, j) => ({
          cleaning_id: id,
          property_room_id: cuarto.id,
          checklist_task_id: t.id,
          room_label: i === 0 ? 'Cuarto con foto' : 'Cuarto sin foto',
          task_label: t.descripcion,
          // El primer cuarto EXIGE foto y el segundo no: asi se mide que los
          // cuartos que no la piden no generan paso.
          requiere_foto: i === 0,
          sort_order: i * 100 + j,
        }));
      });
      const r = await servicio.from('cleaning_checklist_items').insert(filas);
      if (r.error) throw new Error(r.error.message);
      return id;
    }

    const ayer = new Date(Date.parse(`${hoy}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    const manana = new Date(Date.parse(`${hoy}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

    enCurso = await sembrar(aptas[0][0], aptas[0][1], 'en_curso', aseador, hoy);
    pendiente = await sembrar(aptas[1][0], aptas[1][1], 'pendiente', aseador, hoy);
    ajeno = await sembrar(aptas[0][0], aptas[0][1], 'en_curso', otro, manana);
    void ayer;
  });

  test.afterAll(async () => {
    for (const id of [enCurso, pendiente, ajeno]) {
      if (id) await servicio.from('cleanings').delete().eq('id', id);
    }
  });

  test('un aseo en curso propio entra al asistente con su contador de pasos', async ({
    paginaAseador,
  }) => {
    const r = await paginaAseador.goto(`/aseos/${enCurso}/evidencia`);
    expect(r?.status()).toBe(200);

    // Solo un paso: el segundo cuarto no exige foto y NO genera paso.
    // `exact` porque el anuncio de `aria-live` contiene la misma cadena mas el
    // nombre del cuarto: que los dos existan es justo lo que §12.2 pide.
    await expect(paginaAseador.getByText('Cuarto 1 de 1', { exact: true })).toBeVisible();
    await expect(paginaAseador.getByText('Cuarto 1 de 1, Cuarto con foto')).toHaveCount(1);
    await expect(paginaAseador.getByRole('heading', { name: 'Cuarto con foto' })).toBeVisible();
    await expect(paginaAseador.getByText('Cuarto sin foto')).toHaveCount(0);
  });

  test('un aseo que no esta en curso redirige a su ficha', async ({ paginaAseador }) => {
    await paginaAseador.goto(`/aseos/${pendiente}/evidencia`);
    await expect(paginaAseador).toHaveURL(new RegExp(`/aseos/${pendiente}$`));
  });

  test('un aseo ajeno cae en el estado vacio, no en un error de servidor', async ({
    paginaAseador,
  }) => {
    const r = await paginaAseador.goto(`/aseos/${ajeno}/evidencia`);
    expect(r?.status()).toBe(200);
    await expect(
      paginaAseador.getByRole('heading', { name: 'Este aseo ya no está disponible.' }),
    ).toBeVisible();
  });

  test('no hay ningun atajo para saltar todos los cuartos', async ({ paginaAseador }) => {
    await paginaAseador.goto(`/aseos/${enCurso}/evidencia`);

    for (const atajo of [/Saltar todo/i, /Terminar ya/i, /Omitir todo/i]) {
      await expect(paginaAseador.getByRole('button', { name: atajo })).toHaveCount(0);
    }
    // El unico camino para no fotografiar pasa por la hoja de motivo.
    await expect(
      paginaAseador.getByRole('button', { name: 'Saltar este cuarto' }),
    ).toBeVisible();
  });

  test('saltar exige elegir un motivo de la lista cerrada', async ({ paginaAseador }) => {
    await paginaAseador.goto(`/aseos/${enCurso}/evidencia`);
    await paginaAseador.getByRole('button', { name: 'Saltar este cuarto' }).click();

    const saltar = paginaAseador.getByRole('button', { name: 'Saltar', exact: true });
    await expect(saltar).toBeDisabled();

    await paginaAseador.getByText('El cuarto estaba cerrado').click();
    await expect(saltar).toBeEnabled();
  });

  test('si la subida falla, la foto NO se pierde y se puede reintentar', async ({
    paginaAseador,
  }) => {
    // El senuelo: la subida a Storage responde 500. Es el corte de senal que la
    // aseadora tiene de verdad, provocado a voluntad.
    await paginaAseador.route('**/storage/v1/object/upload/sign/**', (ruta) =>
      ruta.fulfill({ status: 500, body: '{"error":"caida"}' }),
    );

    await paginaAseador.goto(`/aseos/${enCurso}/evidencia`);

    // Un JPEG minimo valido, entregado como si viniera de la camara.
    await paginaAseador.setInputFiles('input[type="file"]', {
      name: 'foto.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from(
        '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
          'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIy' +
          'MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIA' +
          'AhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQA' +
          'AAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3' +
          'ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWm' +
          'p6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oADAMB' +
          'AAIRAxEAPwD3+iiigD//2Q==',
        'base64',
      ),
    });

    // La foto sigue en pantalla, con su aviso y su reintento.
    await expect(paginaAseador.getByRole('img', { name: /Foto de/ })).toBeVisible({
      timeout: 15_000,
    });
    await expect(paginaAseador.getByText('No se pudo subir la foto.')).toBeVisible();
    await expect(paginaAseador.getByRole('button', { name: 'Reintentar' })).toBeVisible();
    await expect(paginaAseador.getByRole('img', { name: /Foto de/ })).toBeVisible();
  });
});
