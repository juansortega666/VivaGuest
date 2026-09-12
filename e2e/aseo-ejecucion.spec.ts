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
 * EL RECORRIDO COMPLETO DEL ASEADOR, DE PUNTA A PUNTA (planes 06-09 y 06-10).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * LO QUE ESTE ARCHIVO **NO** CUBRE, Y CONVIENE LEERLO ANTES QUE LO QUE SI.
 *
 *   · **iOS.** Corre solo en Chromium, que es el unico proyecto de
 *     `playwright.config.ts`. Playwright no ejecuta service workers en WebKit,
 *     asi que un proyecto de Safari daria un verde que no significa nada. Lo
 *     que el iPhone anade —la instalacion en pantalla de inicio, el permiso
 *     irreversible, el push— se valida a mano en un telefono real.
 *
 *   · **El comportamiento sin senal.** Esta DIFERIDO (D-08) y la interfaz tiene
 *     prohibido sugerirlo (§11.4). No se escribe ningun test de offline, ni
 *     siquiera uno que "documente" la ausencia: un test de algo que no existe
 *     es ruido que hay que mantener.
 *
 * ── Y ESTE ARCHIVO SUSTITUYE AL "RECORRIDO MANUAL" QUE PEDIA EL PLAN ──────
 *
 * El criterio de aceptacion decia: *"Recorrido manual completo anotado en el
 * SUMMARY: comenzar un aseo, marcar tareas, terminar, subir una foto, saltar un
 * cuarto, reportar un gasto con monto, y cerrar."*
 *
 * Se hace aqui en vez de a mano por una razon concreta: un recorrido manual se
 * comprueba UNA vez, el dia que se escribe, y despues nadie lo repite. Este se
 * repite en cada cambio, y el dia que alguien rompa un eslabon el fallo dice
 * cual.
 *
 * ── LAS ASERCIONES FINALES SON CONTRA LA BASE, NO CONTRA LA PANTALLA ──────
 *
 * Que la pantalla diga `Listo.` no prueba nada por si solo. Lo que se comprueba
 * al final es el estado real: el aseo en `completada`, el gasto con su monto
 * entero, el cuarto saltado con su motivo, y el aseo marcado sin evidencia
 * completa por la MISMA funcion de SQL que el dashboard del admin consulta.
 * ════════════════════════════════════════════════════════════════════════════
 */

const JPEG_MINIMO = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
    'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIy' +
    'MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIA' +
    'AhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQA' +
    'AAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3' +
    'ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWm' +
    'p6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oADAMB' +
    'AAIRAxEAPwD3+iiigD//2Q==',
  'base64',
);

test.describe('el recorrido completo', () => {
  let servicio: Servicio;
  let aseoId = '';
  let apartamento = '';

  test.beforeAll(async () => {
    cargarEnvLocal();
    servicio = clienteDeServicio();
    const hoy = await diaDeNegocio(servicio);
    const creds = leerCredenciales();
    const aseador = await idPorEmail(servicio, creds.aseador1.email);

    const { data: cuartosCrudos, error } = await servicio
      .from('property_rooms')
      .select('id, property_id, room_type_id, properties!inner(gestion_vivaguest, nombre)')
      .eq('properties.gestion_vivaguest', true)
      .order('property_id')
      .limit(400);
    if (error) throw new Error(error.message);

    const porProp = new Map<string, NonNullable<typeof cuartosCrudos>>();
    for (const r of cuartosCrudos ?? []) {
      const lista = porProp.get(r.property_id) ?? [];
      lista.push(r);
      porProp.set(r.property_id, lista);
    }
    const elegida = [...porProp.entries()].find(([, c]) => c.length >= 2);
    if (!elegida) throw new Error('no hay apartamento con dos cuartos');

    const [propiedad, cuartos] = elegida;
    apartamento = (cuartos[0].properties as unknown as { nombre: string }).nombre;

    const { data: tareas } = await servicio
      .from('checklist_tasks')
      .select('id, descripcion, room_type_id')
      .limit(80);

    await servicio.from('cleanings').delete().eq('property_id', propiedad).eq('scheduled_date', hoy);

    const ins = await servicio
      .from('cleanings')
      .insert({
        property_id: propiedad,
        origin: 'ical',
        scheduled_date: hoy,
        state: 'pendiente',
        aseador_id: aseador,
        confirmado_at: new Date(Date.now() - 4 * 3600_000).toISOString(),
        num_huespedes: 2,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      .select('id')
      .single();
    if (ins.error) throw new Error(ins.error.message);
    aseoId = ins.data.id;

    // Los DOS cuartos exigen foto: uno se fotografia y el otro se salta, que es
    // el recorrido que el plan describe.
    const filas = cuartos.slice(0, 2).flatMap((cuarto, i) => {
      const delTipo = (tareas ?? []).filter((t) => t.room_type_id === cuarto.room_type_id).slice(0, 2);
      return delTipo.map((t, j) => ({
        cleaning_id: aseoId,
        property_room_id: cuarto.id,
        checklist_task_id: t.id,
        room_label: i === 0 ? 'Primer cuarto' : 'Segundo cuarto',
        task_label: t.descripcion,
        requiere_foto: true,
        sort_order: i * 100 + j,
      }));
    });
    const r = await servicio.from('cleaning_checklist_items').insert(filas);
    if (r.error) throw new Error(r.error.message);
  });

  /** El nombre del apartamento trae corchetes y rayas: hay que escaparlo. */
  function comoRegex(texto: string): RegExp {
    return new RegExp(texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  }

  test.afterAll(async () => {
    if (aseoId) await servicio.from('cleanings').delete().eq('id', aseoId);
  });

  test('de la tarjeta del home al cierre, con gasto y cuarto saltado', async ({
    paginaAseador,
  }) => {
    // ── 1. El home: la tarjeta abre la hoja con las dos opciones ────────────
    await paginaAseador.goto('/mis-aseos');
    await paginaAseador.getByRole('button', { name: comoRegex(apartamento) }).first().click();
    await paginaAseador.getByRole('button', { name: 'Comenzar aseo' }).click();

    await expect(paginaAseador).toHaveURL(new RegExp(`/aseos/${aseoId}$`));

    // ── 2. El checklist: se marca UNA tarea y se dejan otras ────────────────
    await paginaAseador.locator('label:has(input[type=checkbox])').first().click();
    await expect(paginaAseador.getByRole('checkbox').first()).toBeChecked();

    // El estado de verdad, no el de la pantalla.
    const empezado = await servicio
      .from('cleanings')
      .select('state, started_at')
      .eq('id', aseoId)
      .single();
    expect(empezado.data?.state).toBe('en_curso');
    expect(empezado.data?.started_at).not.toBeNull();

    /**
     * Y la tarea quedo marcada EN LA BASE, no solo en la casilla.
     *
     * Se sondea en vez de afirmar de golpe, y eso **documenta el diseno**: el
     * marcado es optimista a proposito (§11.2), asi que la casilla cambia antes
     * de que el servidor responda. Afirmar al instante mediria una carrera y
     * fallaria un martes; sondear afirma lo que de verdad importa, que es que la
     * marca ACABA en la base.
     */
    await expect
      .poll(async () => {
        const r = await servicio
          .from('cleaning_checklist_items')
          .select('id')
          .eq('cleaning_id', aseoId)
          .not('done_at', 'is', null);
        return r.data?.length ?? 0;
      })
      .toBe(1);

    // ── 3. Terminar con el checklist a medias: informa, NO bloquea ──────────
    await paginaAseador.getByRole('button', { name: 'Terminar aseo' }).click();
    await expect(paginaAseador.getByText(/tarea[s]? por marcar\./)).toBeVisible();
    await paginaAseador.getByRole('button', { name: 'Terminar de todos modos' }).click();

    await expect(paginaAseador).toHaveURL(new RegExp(`/aseos/${aseoId}/evidencia$`));

    // ── 4. Primer cuarto: se sube la foto de verdad ─────────────────────────
    await expect(paginaAseador.getByRole('heading', { name: 'Primer cuarto' })).toBeVisible();
    await paginaAseador.setInputFiles('input[type="file"]', {
      name: 'cuarto.jpg',
      mimeType: 'image/jpeg',
      buffer: JPEG_MINIMO,
    });

    const siguiente = paginaAseador.getByRole('button', { name: 'Siguiente' });
    await expect(siguiente).toBeEnabled({ timeout: 20_000 });
    await siguiente.click();

    // ── 5. Segundo cuarto: se salta con motivo ──────────────────────────────
    await expect(paginaAseador.getByRole('heading', { name: 'Segundo cuarto' })).toBeVisible();
    await paginaAseador.getByRole('button', { name: 'Saltar este cuarto' }).click();
    await paginaAseador.getByText('El cuarto estaba cerrado').click();
    await paginaAseador.getByRole('button', { name: 'Saltar', exact: true }).click();

    // ── 6. El reporte: un gasto con su monto ────────────────────────────────
    await expect(paginaAseador.getByRole('heading', { name: '¿Pasó algo?' })).toBeVisible();
    await paginaAseador.getByRole('button', { name: 'Sí, pasó algo' }).click();
    await paginaAseador.getByText('Tuve que comprar algo').click();
    await paginaAseador.getByLabel('Cuéntale a tu administrador qué pasó').fill('Jabón de manos');
    await paginaAseador.getByLabel('¿Cuánto costó?').fill('12000');
    await paginaAseador.getByRole('button', { name: 'Guardar el reporte' }).click();

    await expect(paginaAseador.getByText('Tuve que comprar algo:')).toBeVisible();

    // La foto del recibo se ofrece, y se puede seguir sin ella: obligatoria no
    // significa atrapar a la persona.
    await paginaAseador.getByRole('button', { name: 'Seguir sin la foto' }).click();

    // ── 7. El cierre ────────────────────────────────────────────────────────
    await paginaAseador.getByRole('button', { name: 'Terminar el aseo' }).click();
    await expect(paginaAseador.getByRole('heading', { name: 'Listo.' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(paginaAseador.getByText(/cuarto sin foto\. Tu administrador/)).toBeVisible();
    await expect(paginaAseador.getByText(`Terminaste el aseo de ${apartamento}.`)).toBeVisible();

    // ── 8. Y ahora la base, que es lo que de verdad importa ─────────────────
    const aseo = await servicio.from('cleanings').select('state, finished_at').eq('id', aseoId).single();
    expect(aseo.data?.state).toBe('completada');
    expect(aseo.data?.finished_at).not.toBeNull();

    const gasto = await servicio
      .from('expenses')
      .select('monto, moneda, concepto')
      .eq('cleaning_id', aseoId)
      .single();
    expect(gasto.data?.monto).toBe(12000);
    expect(gasto.data?.moneda).toBe('COP');

    const skip = await servicio
      .from('cleaning_room_skips')
      .select('motivo, room_label')
      .eq('cleaning_id', aseoId)
      .single();
    expect(skip.data?.motivo).toBe('cuarto_cerrado');

    const foto = await servicio
      .from('cleaning_photos')
      .select('kind, storage_path, bytes')
      .eq('cleaning_id', aseoId);
    expect(foto.data?.length).toBeGreaterThanOrEqual(1);

    // La MISMA funcion que el dashboard del admin consulta.
    const marca = await servicio.rpc('aseo_sin_evidencia_completa', { p_cleaning: aseoId });
    expect(marca.data).toBe(true);
  });

  /**
   * ── 11. LA OTRA MITAD DE D-06 ─────────────────────────────────────────────
   *
   * Saltar un cuarto se permitio **a cambio de que el admin lo vea**. Sin este
   * paso, el permiso no tiene contrapartida: todo lo anterior podria estar en
   * verde y la evidencia seguir sin tener quien la reclame.
   *
   * Va en su propio test y con sesion de ADMIN, que es otro contexto de
   * navegador. Depende del anterior a proposito y esta declarado en el nombre.
   */
  test('y el admin ve la senal de evidencia incompleta en su dashboard', async ({
    paginaAdmin,
  }) => {
    await paginaAdmin.goto('/operacion');

    const fila = paginaAdmin.locator(`#aseo-${aseoId}`);
    await expect(fila).toBeVisible();

    // `aria-label` y no texto: es un icono sin etiqueta al lado, igual que las
    // otras tres senales de la fila.
    await expect(fila.getByLabel('Sin evidencia completa')).toBeVisible();
  });
});
