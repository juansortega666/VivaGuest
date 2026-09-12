import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import {
  armarChecklist,
  sinEvidenciaCompleta,
  type FilaDeChecklist,
  type FilaDeSkip,
  type FotoDeChecklist,
} from '@/lib/domain/checklist';
import { clienteAdminDePruebas, type ClienteVivaGuest } from '@/lib/test/clientes';

/**
 * LA DEUDA QUE EL PLAN 06-03 DECLARO, PAGADA AQUI.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * LA REGLA DE "SIN EVIDENCIA COMPLETA" VIVE **DOS VECES**, Y ESO FUE UNA
 * DECISION, NO UN DESCUIDO.
 *
 *   · `public.aseo_sin_evidencia_completa()` (migracion 18) la consume el
 *     dashboard del admin, que lee decenas de aseos agregados y NO tiene sus
 *     filas en memoria.
 *   · `sinEvidenciaCompleta()` (`lib/domain/checklist.ts`) la consume la
 *     pantalla del aseador, que YA tiene las filas delante. Hacer un viaje a la
 *     base para decidir lo que se tiene cargado seria peor que duplicar.
 *
 * **Dos implementaciones de la misma verdad divergen.** No es una posibilidad
 * remota: basta con que alguien arregle un caso en un lado. Y el sintoma seria
 * el peor de todos —el dashboard diciendo que un aseo esta completo mientras la
 * pantalla del aseador dice lo contrario, sobre el mismo aseo y el mismo dia—
 * porque nadie mira las dos pantallas a la vez.
 *
 * La mitigacion acordada al aceptar la duplicacion fue **este test**. Sin el,
 * la duplicacion pasa de decision a deuda silenciosa.
 *
 * ── LO QUE ESTE ARCHIVO AFIRMA, Y ES DISTINTO DE LO QUE PARECE ────────────
 *
 * No afirma que cada implementacion de el resultado esperado. Afirma que **las
 * dos dicen LO MISMO** sobre los mismos datos. Por eso cada escenario compara
 * `sql === ts` **ademas** de comprobar el valor: si algun dia las dos se
 * equivocaran igual, el valor esperado lo detecta; si una sola cambia, la
 * comparacion entre ellas lo detecta. Hacen falta las dos aserciones.
 *
 * ── POR QUE ES DE INTEGRACION Y NO UNITARIO ───────────────────────────────
 *
 * Porque una de las dos implementaciones **es SQL**. Un doble de la base
 * mediria una tercera copia escrita por mi, que es exactamente el problema que
 * este archivo existe para evitar.
 *
 * Limpieza por identificador en `afterAll`, nunca por tabla: el stack local es
 * uno y compartido.
 * ════════════════════════════════════════════════════════════════════════════
 */

let admin: ClienteVivaGuest;

/** Todo lo sembrado aqui, para borrar eso y nada mas. */
const aseosSembrados: string[] = [];

let propiedadId = '';
let cuartoA = '';
let cuartoB = '';
let tareaTipoA = '';
let tareaTipoB = '';
let subidorId = '';
let fechaBase = '';

async function diaDeNegocio(): Promise<string> {
  const { data, error } = await admin.rpc('today_bog');
  if (error) throw new Error(error.message);
  return data as unknown as string;
}

/**
 * Un aseo nuevo, en su propio dia, para que el indice parcial de unicidad
 * `(apartamento, fecha) where estado <> cancelado` no obligue a limpiar entre
 * escenarios.
 */
let desplazamiento = 0;
async function crearAseo(): Promise<string> {
  desplazamiento += 1;
  const fecha = new Date(Date.parse(`${fechaBase}T00:00:00Z`) + desplazamiento * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const { data, error } = await admin
    .from('cleanings')
    .insert({
      property_id: propiedadId,
      origin: 'ical',
      scheduled_date: fecha,
      state: 'en_curso',
      confirmado_at: new Date(Date.now() - 4 * 3600_000).toISOString(),
      started_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
      aseador_id: subidorId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    .select('id')
    .single();

  if (error) throw new Error(`no se pudo sembrar el aseo: ${error.message}`);
  aseosSembrados.push(data.id);
  return data.id;
}

interface TareaASembrar {
  cuarto: string;
  tipoDeTarea: string;
  etiquetaCuarto: string;
  requiereFoto: boolean;
  orden: number;
}

async function sembrarTareas(aseoId: string, tareas: TareaASembrar[]): Promise<string[]> {
  if (tareas.length === 0) return [];
  const { data, error } = await admin
    .from('cleaning_checklist_items')
    .insert(
      tareas.map((t) => ({
        cleaning_id: aseoId,
        property_room_id: t.cuarto,
        checklist_task_id: t.tipoDeTarea,
        room_label: t.etiquetaCuarto,
        task_label: `Tarea ${t.orden}`,
        requiere_foto: t.requiereFoto,
        sort_order: t.orden,
      })),
    )
    .select('id');

  if (error) throw new Error(`no se pudieron sembrar las tareas: ${error.message}`);
  return data.map((f) => f.id);
}

async function marcarHechas(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await admin
    .from('cleaning_checklist_items')
    .update({ done_at: new Date().toISOString(), done_by: subidorId })
    .in('id', ids);
  if (error) throw new Error(error.message);
}

async function sembrarFoto(aseoId: string, itemId: string): Promise<void> {
  const { error } = await admin.from('cleaning_photos').insert({
    cleaning_id: aseoId,
    kind: 'checklist',
    checklist_item_id: itemId,
    storage_bucket: 'evidencia',
    storage_path: `${aseoId}/checklist/${itemId}.jpg`,
    mime_type: 'image/jpeg',
    bytes: 1024,
    width: 1280,
    height: 960,
    uploaded_by: subidorId,
  });
  if (error) throw new Error(`no se pudo sembrar la foto: ${error.message}`);
}

async function sembrarSkip(aseoId: string, cuarto: string, etiqueta: string): Promise<void> {
  const { error } = await admin.from('cleaning_room_skips').insert({
    cleaning_id: aseoId,
    property_room_id: cuarto,
    room_label: etiqueta,
    motivo: 'cuarto_cerrado',
    skipped_by: subidorId,
  });
  if (error) throw new Error(`no se pudo sembrar el salto: ${error.message}`);
}

async function borrarSkip(aseoId: string, cuarto: string): Promise<void> {
  const { error } = await admin
    .from('cleaning_room_skips')
    .delete()
    .eq('cleaning_id', aseoId)
    .eq('property_room_id', cuarto);
  if (error) throw new Error(error.message);
}

/** La implementacion de SQL, tal cual, sin intermediarios. */
async function segunSql(aseoId: string): Promise<boolean> {
  const { data, error } = await admin.rpc('aseo_sin_evidencia_completa', { p_cleaning: aseoId });
  if (error) throw new Error(error.message);
  return data as unknown as boolean;
}

/**
 * La implementacion de TypeScript, sobre las MISMAS filas.
 *
 * Se leen de la base a proposito, y no se construyen a mano: si el test armara
 * los objetos en memoria, estaria comparando la regla de TypeScript contra una
 * idea mia de como se ven los datos, no contra los datos.
 */
async function segunTypeScript(aseoId: string): Promise<boolean> {
  const items = await admin
    .from('cleaning_checklist_items')
    .select('id, property_room_id, room_label, task_label, requiere_foto, sort_order, done_at')
    .eq('cleaning_id', aseoId);
  if (items.error) throw new Error(items.error.message);

  const skips = await admin
    .from('cleaning_room_skips')
    .select('property_room_id, room_label, motivo, nota')
    .eq('cleaning_id', aseoId);
  if (skips.error) throw new Error(skips.error.message);

  const fotos = await admin
    .from('cleaning_photos')
    .select('checklist_item_id')
    .eq('cleaning_id', aseoId)
    .is('deleted_at', null);
  if (fotos.error) throw new Error(fotos.error.message);

  const grupos = armarChecklist(
    items.data as FilaDeChecklist[],
    skips.data as FilaDeSkip[],
  );
  return sinEvidenciaCompleta(grupos, fotos.data as FotoDeChecklist[]);
}

/**
 * LA ASERCION DEL ARCHIVO.
 *
 * Primero la paridad, que es lo que este test protege, y con un mensaje que
 * dice cual de las dos dijo que. Despues el valor esperado, que atrapa el caso
 * en que las dos se equivoquen igual.
 */
async function afirmarParidad(aseoId: string, esperado: boolean): Promise<void> {
  const sql = await segunSql(aseoId);
  const ts = await segunTypeScript(aseoId);

  expect(
    sql,
    `divergencia: SQL dice ${sql} y TypeScript dice ${ts} sobre el mismo aseo`,
  ).toBe(ts);
  expect(sql).toBe(esperado);
}

beforeAll(async () => {
  admin = clienteAdminDePruebas();
  fechaBase = await diaDeNegocio();

  // Se usa un apartamento YA sembrado con sus cuartos reales, en vez de crear
  // uno: lo que este test mide es la regla, no el alta de catalogo, y crear un
  // apartamento con cuartos y tipos de tarea propios seria mas superficie que
  // mantener por cero informacion adicional.
  const cuartos = await admin
    .from('property_rooms')
    .select('id, property_id, room_type_id, properties!inner(gestion_vivaguest)')
    .eq('properties.gestion_vivaguest', true)
    .order('property_id')
    .limit(400);
  if (cuartos.error) throw new Error(cuartos.error.message);

  const porPropiedad = new Map<string, NonNullable<typeof cuartos.data>>();
  for (const c of cuartos.data ?? []) {
    const lista = porPropiedad.get(c.property_id) ?? [];
    lista.push(c);
    porPropiedad.set(c.property_id, lista);
  }
  const elegida = [...porPropiedad.entries()].find(([, c]) => c.length >= 2);
  if (!elegida) throw new Error('no hay apartamento gestionado con dos cuartos');

  propiedadId = elegida[0];
  cuartoA = elegida[1][0].id;
  cuartoB = elegida[1][1].id;

  const tareas = await admin.from('checklist_tasks').select('id, room_type_id');
  if (tareas.error) throw new Error(tareas.error.message);
  const delTipoA = tareas.data?.find((t) => t.room_type_id === elegida[1][0].room_type_id);
  const delTipoB = tareas.data?.find((t) => t.room_type_id === elegida[1][1].room_type_id);
  if (!delTipoA || !delTipoB) throw new Error('faltan tipos de tarea para esos cuartos');
  tareaTipoA = delTipoA.id;
  tareaTipoB = delTipoB.id;

  const perfil = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'aseador')
    .eq('is_active', true)
    .limit(1)
    .single();
  if (perfil.error) throw new Error(perfil.error.message);
  subidorId = perfil.data.id;
});

afterAll(async () => {
  if (aseosSembrados.length > 0) {
    // Las hijas caen por `on delete cascade` desde `cleanings`.
    await admin.from('cleanings').delete().in('id', aseosSembrados);
  }
});

describe('la regla de evidencia incompleta dice lo mismo en SQL y en TypeScript', () => {
  test('todo marcado y con todas sus fotos: NO esta sin evidencia', async () => {
    const aseo = await crearAseo();
    const ids = await sembrarTareas(aseo, [
      { cuarto: cuartoA, tipoDeTarea: tareaTipoA, etiquetaCuarto: 'A', requiereFoto: true, orden: 1 },
      { cuarto: cuartoB, tipoDeTarea: tareaTipoB, etiquetaCuarto: 'B', requiereFoto: true, orden: 2 },
    ]);
    await marcarHechas(ids);
    for (const id of ids) await sembrarFoto(aseo, id);

    await afirmarParidad(aseo, false);
  });

  test('un cuarto saltado con motivo: SI esta sin evidencia', async () => {
    const aseo = await crearAseo();
    const ids = await sembrarTareas(aseo, [
      { cuarto: cuartoA, tipoDeTarea: tareaTipoA, etiquetaCuarto: 'A', requiereFoto: true, orden: 1 },
    ]);
    await marcarHechas(ids);
    await sembrarFoto(aseo, ids[0]);
    // Con su foto y todo: el salto SOLO basta.
    await sembrarSkip(aseo, cuartoB, 'B');

    await afirmarParidad(aseo, true);
  });

  test('una tarea que exige foto y no la tiene: SI esta sin evidencia', async () => {
    const aseo = await crearAseo();
    await sembrarTareas(aseo, [
      { cuarto: cuartoA, tipoDeTarea: tareaTipoA, etiquetaCuarto: 'A', requiereFoto: true, orden: 1 },
    ]);

    await afirmarParidad(aseo, true);
  });

  test('una tarea que NO exige foto y no la tiene: NO esta sin evidencia', async () => {
    // Es el escenario que distingue "falta una foto" de "falta CUALQUIER foto".
    // Una implementacion que mirara solo si hay fotos lo daria mal, y las dos
    // tienen que darlo bien de la misma forma.
    const aseo = await crearAseo();
    await sembrarTareas(aseo, [
      { cuarto: cuartoA, tipoDeTarea: tareaTipoA, etiquetaCuarto: 'A', requiereFoto: false, orden: 1 },
    ]);

    await afirmarParidad(aseo, false);
  });

  test('saltado y despues con foto: la marca se quita', async () => {
    // Es lo que hace `unskip_room_evidence` cuando la evidencia llega tarde: la
    // evidencia llego, la excusa sobra. Aqui se reproduce el efecto sobre los
    // datos, que es lo que la regla lee.
    const aseo = await crearAseo();
    const ids = await sembrarTareas(aseo, [
      { cuarto: cuartoA, tipoDeTarea: tareaTipoA, etiquetaCuarto: 'A', requiereFoto: true, orden: 1 },
    ]);
    await sembrarSkip(aseo, cuartoA, 'A');

    await afirmarParidad(aseo, true);

    await borrarSkip(aseo, cuartoA);
    await sembrarFoto(aseo, ids[0]);

    await afirmarParidad(aseo, false);
  });

  test('un aseo sin cuartos configurados: NO esta sin evidencia', async () => {
    // Un apartamento mal configurado no produce un aseo "sin evidencia": produce
    // un aseo del que no habia nada que fotografiar. Marcarlo seria acusar a la
    // aseadora de un defecto del catalogo.
    const aseo = await crearAseo();

    await afirmarParidad(aseo, false);
  });
});
