import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { leerPanelDeAseo, MINIATURAS_VISIBLES } from '@/lib/data/panel-aseo';
import {
  limpiarAseos,
  sembrarEscenarioDeAseos,
  type EscenarioDeAseos,
} from '@/lib/test/aseos';
import {
  clienteAdminDePruebas,
  clienteConToken,
  type ClienteVivaGuest,
} from '@/lib/test/clientes';

/**
 * LA COMPOSICIÓN DEL PANEL DE ASEO, CONTRA POSTGRES REAL Y CON JWT REALES
 * (criterio 4 del ROADMAP, 08-VALIDATION fila 4).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESTE ARCHIVO PRUEBA LO QUE NINGÚN DOBLE PUEDE PROBAR.
 *
 * `leerPanelDeAseo()` no es una consulta: es un REPARTO. Una función definer que
 * salta la seguridad de fila y cuatro colecciones que van por RLS, con sus
 * policies puestas. Un unitario con el cliente stubbeado mide que el stub
 * devuelve lo que el stub devuelve; lo que decide si este panel es correcto es
 * si las cinco piezas encajan sobre la base de verdad.
 *
 * Y hay tres cosas que SOLO se ven aquí:
 *
 *   1. Que la definer responde sobre un aseo EN CURSO. Es la razón de existir
 *      del panel y lo que descalifica a `rentabilidad_aseos`, que filtra por
 *      aseo completado.
 *   2. Que un aseo pendiente SIN CONFIRMAR devuelve el checklist vacío, porque
 *      las tareas se materializan al confirmar y no al crear.
 *   3. Que una unidad de gestión externa devuelve fila igual, con la marca de
 *      gestión propia en falso y las cifras en cero.
 *
 * ── LAS FIRMAS EN ESTE ARNÉS, Y POR QUÉ ESO NO DEBILITA NADA ──────────────
 *
 * NO SE SUBE NADA A STORAGE, misma decisión que el escenario financiero de
 * `lib/test/aseos.ts`: lo que hay que producir es la FILA que enlaza el aseo con
 * su evidencia, que es lo que la tira recorre. Consecuencia medible: el
 * almacenamiento no encuentra el objeto y el desenlace de cada firma es
 * `firma_fallida`.
 *
 * Eso no es una limitación del test, es EXACTAMENTE el caso que §10.3 declara:
 * una foto purgada no abre nada Y TAMPOCO DESAPARECE DE LA TIRA, porque hacerla
 * desaparecer cambiaría el conteo y haría creer que había menos evidencia. Por
 * eso las aserciones de abajo miran la POSICIÓN y la PRESENCIA del desenlace, y
 * nunca que el desenlace sea `firmado`.
 *
 * REGLA HEREDADA DEL PLAN 02-09: toda aserción que espere "vacío", "0 filas" o
 * "no aparece" lleva delante una aserción de CONTROL que demuestra que la cosa
 * existía. Sin ella, el verde lo da igual un fixture que nunca se sembró.
 *
 * Requiere `npx supabase start` con el stack COMPLETO (la siembra crea usuarios
 * contra GoTrue) y `.env.local` en la raíz. Aviso heredado del research: en
 * disco de iCloud el reinicio de la base cuesta unos 54 segundos, así que este
 * archivo se corre CON LA BASE YA LEVANTADA.
 * ════════════════════════════════════════════════════════════════════════════
 */

const SUFIJO = randomUUID().slice(0, 8);
const EMAIL_ADMIN = `int.panel.admin.${SUFIJO}@vivaguest.test`;
const PASSWORD_ADMIN = `panel-admin-${randomUUID()}`;

/** Las tarifas que `sembrarEscenarioDeAseos()` le pone al apartamento gestionado. */
const TARIFA_HUESPED = 120_000;
const PAGO_ASEADOR = 45_000;

const CONCEPTO_DEL_GASTO = `Jabón y trapos ${SUFIJO}`;
const MONTO_DEL_GASTO = 35_000;
const DESCRIPCION_DEL_DANO = `Espejo del baño rajado ${SUFIJO}`;

let escenario: EscenarioDeAseos;
let tokenAdmin = '';
let tokenAseadoraA = '';

const usuariosCreados: string[] = [];

/** Los cuartos que este archivo le añade al apartamento del arnés. */
const cuartosCreados: string[] = [];

/** La foto borrada del aseo terminado, para el control del filtro de purgadas. */
let fotoBorrada = '';
/** Las fotos VIVAS del aseo terminado, en el orden en que se sembraron. */
let fotosDelTerminado: string[] = [];
/** Las ocho fotos del aseo en curso, en el orden en que se sembraron. */
let fotosDelEnCurso: string[] = [];

function servicio(): ClienteVivaGuest {
  return clienteAdminDePruebas();
}

function comoAdmin(): ClienteVivaGuest {
  return clienteConToken(tokenAdmin);
}

async function iniciarSesion(email: string, password: string): Promise<string> {
  const { data, error } = await servicio().auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(`No se pudo iniciar sesión como ${email}: ${error?.message}`);
  }
  return data.session.access_token;
}

/**
 * Siembra tareas de checklist y devuelve sus identificadores EN ORDEN.
 *
 * El arnés de `lib/test/aseos.ts` no siembra checklist, y no es un olvido suyo:
 * las tareas las materializa `confirm_cleaning` y el arnés inserta los aseos
 * directamente. Esto se queda aquí, acotado a lo que este archivo necesita, y NO
 * se sube al arnés: nadie más lo pide todavía.
 */
async function sembrarTareas(
  aseoId: string,
  pares: { cuartoId: string; etiqueta: string; tareaId: string }[],
): Promise<string[]> {
  const { data, error } = await servicio()
    .from('cleaning_checklist_items')
    .insert(
      pares.map((par, indice) => ({
        cleaning_id: aseoId,
        property_room_id: par.cuartoId,
        checklist_task_id: par.tareaId,
        room_label: par.etiqueta,
        task_label: `Tarea ${indice + 1} de ${par.etiqueta}`,
        requiere_foto: indice % 2 === 0,
        sort_order: indice + 1,
      })),
    )
    .select('id, sort_order');

  if (error || !data) throw new Error(`No se pudieron sembrar las tareas: ${error?.message}`);

  // Por `sort_order` y NO por el orden que devuelve el insert: PostgREST no
  // garantiza que un insert múltiple devuelva las filas en el orden en que se
  // mandaron, y confiar en eso es un fallo intermitente.
  return [...data].sort((a, b) => a.sort_order - b.sort_order).map((f) => f.id);
}

async function marcarHechas(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await servicio()
    .from('cleaning_checklist_items')
    .update({ done_at: new Date().toISOString(), done_by: escenario.aseadorA })
    .in('id', ids);
  if (error) throw new Error(`No se pudieron marcar las tareas: ${error.message}`);
}

/**
 * Una foto colgada de una tarea del checklist.
 *
 * `created_at` va EXPLÍCITO y creciente: la tira se ordena por creación y el
 * desempate es por identificador, así que sin instantes distintos el orden
 * esperado dependería de un identificador aleatorio. La convención de ruta es
 * contrato duro (`{aseo}/{tipo}/{...}`): las policies de Storage autorizan
 * comparando el primer segmento, y una ruta con otra forma rompe la
 * autorización en silencio.
 */
async function sembrarFoto(
  aseoId: string,
  itemId: string,
  minutos: number,
  borrada = false,
): Promise<string> {
  const instante = new Date(Date.UTC(2026, 0, 1, 12, minutos)).toISOString();
  const { data, error } = await servicio()
    .from('cleaning_photos')
    .insert({
      cleaning_id: aseoId,
      kind: 'checklist',
      checklist_item_id: itemId,
      storage_bucket: 'evidencia',
      storage_path: `${aseoId}/checklist/${randomUUID()}.jpg`,
      mime_type: 'image/jpeg',
      bytes: 204_800,
      width: 1280,
      height: 960,
      taken_at: instante,
      created_at: instante,
      uploaded_by: escenario.aseadorA,
      deleted_at: borrada ? new Date().toISOString() : null,
    })
    .select('id')
    .single();

  if (error || !data) throw new Error(`No se pudo sembrar la foto: ${error?.message}`);
  return data.id;
}

beforeAll(async () => {
  const admin = servicio();
  escenario = await sembrarEscenarioDeAseos();

  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL_ADMIN,
    password: PASSWORD_ADMIN,
    email_confirm: true,
    // El rol va en los DOS sitios: `app_metadata` viaja en el JWT y es lo que
    // acaba leyendo la guarda de la definer vía `profiles`; `user_metadata` es
    // lo que materializa la fila de `public.profiles`.
    app_metadata: { role: 'admin' },
    user_metadata: { role: 'admin', full_name: 'Admin Del Panel' },
  });
  if (error || !data.user) throw new Error(`No se pudo crear el admin: ${error?.message}`);
  usuariosCreados.push(data.user.id);

  tokenAdmin = await iniciarSesion(EMAIL_ADMIN, PASSWORD_ADMIN);

  // La aseadora A del arnés, que es la que ejercita la guarda de la definer. Se
  // le fija una contraseña conocida con la clave de servicio porque el arnés la
  // genera aleatoria y no la devuelve.
  const passwordAseadora = `panel-aseadora-${randomUUID()}`;
  const { data: aseadora, error: errorAseadora } = await admin.auth.admin.updateUserById(
    escenario.aseadorA,
    { password: passwordAseadora },
  );
  if (errorAseadora || !aseadora.user?.email) {
    throw new Error(`No se pudo preparar a la aseadora A: ${errorAseadora?.message}`);
  }
  tokenAseadoraA = await iniciarSesion(aseadora.user.email, passwordAseadora);

  // ── LOS CUARTOS DEL APARTAMENTO DEL ARNÉS ────────────────────────────────
  //
  // El arnés siembra el apartamento sin cuartos, y el checklist los exige por
  // clave foránea. Los tipos de cuarto y sus tareas SÍ vienen del catálogo
  // sembrado, así que se leen en vez de inventarse: crear un catálogo propio
  // sería más superficie por cero información.
  const { data: tipos, error: errorTipos } = await admin
    .from('room_types')
    .select('id, slug, checklist_tasks(id)')
    .in('slug', ['bano', 'habitacion', 'cocina'])
    .order('slug');
  if (errorTipos || !tipos) throw new Error(`No se leyó el catálogo: ${errorTipos?.message}`);
  if (tipos.length !== 3) throw new Error('El catálogo no trae los tres tipos de cuarto.');

  const tareasPorTipo = new Map(tipos.map((t) => [t.slug, t.checklist_tasks.map((c) => c.id)]));
  for (const [slug, tareas] of tareasPorTipo) {
    if (tareas.length < 3) throw new Error(`El tipo ${slug} no trae tres tareas de catálogo.`);
  }

  const { data: cuartos, error: errorCuartos } = await admin
    .from('property_rooms')
    .insert(
      tipos.map((tipo, indice) => ({
        property_id: escenario.aptoGestionado,
        room_type_id: tipo.id,
        etiqueta: `Cuarto ${tipo.slug}`,
        sort_order: indice + 1,
      })),
    )
    .select('id, room_type_id');
  if (errorCuartos || !cuartos) throw new Error(`No se sembraron los cuartos: ${errorCuartos?.message}`);
  for (const cuarto of cuartos) cuartosCreados.push(cuarto.id);

  const porSlug = (slug: string) => {
    const tipo = tipos.find((t) => t.slug === slug);
    const cuarto = cuartos.find((c) => c.room_type_id === tipo?.id);
    if (!tipo || !cuarto) throw new Error(`Falta el cuarto de ${slug}.`);
    return { cuartoId: cuarto.id, etiqueta: `Cuarto ${slug}`, tareas: tareasPorTipo.get(slug)! };
  };

  const bano = porSlug('bano');
  const habitacion = porSlug('habitacion');
  const cocina = porSlug('cocina');

  const par = (cuarto: ReturnType<typeof porSlug>, indice: number) => ({
    cuartoId: cuarto.cuartoId,
    etiqueta: cuarto.etiqueta,
    tareaId: cuarto.tareas[indice],
  });

  // ── CASO 1: EL ASEO COMPLETADO, CON TODO ─────────────────────────────────
  // Cuatro tareas, tres hechas. Cuatro fotos, una de ellas BORRADA. Un gasto y
  // un daño.
  const tareasDelTerminado = await sembrarTareas(escenario.aseoTerminado, [
    par(bano, 0),
    par(bano, 1),
    par(bano, 2),
    par(habitacion, 0),
  ]);
  await marcarHechas(tareasDelTerminado.slice(0, 3));

  fotosDelTerminado = [];
  for (let i = 0; i < 3; i += 1) {
    fotosDelTerminado.push(await sembrarFoto(escenario.aseoTerminado, tareasDelTerminado[i], i));
  }
  fotoBorrada = await sembrarFoto(escenario.aseoTerminado, tareasDelTerminado[3], 3, true);

  const { error: errorGasto } = await admin.from('expenses').insert({
    cleaning_id: escenario.aseoTerminado,
    property_id: escenario.aptoGestionado,
    concepto: CONCEPTO_DEL_GASTO,
    monto: MONTO_DEL_GASTO,
    reported_by: escenario.aseadorA,
  });
  if (errorGasto) throw new Error(`No se sembró el gasto: ${errorGasto.message}`);

  const { error: errorDano } = await admin.from('damages').insert({
    cleaning_id: escenario.aseoTerminado,
    property_id: escenario.aptoGestionado,
    descripcion: DESCRIPCION_DEL_DANO,
    reported_by: escenario.aseadorA,
  });
  if (errorDano) throw new Error(`No se sembró el daño: ${errorDano.message}`);

  // ── CASOS 2 Y 6: EL ASEO EN CURSO, CON MÁS DE SEIS FOTOS ─────────────────
  // Nueve tareas, dos hechas. Ocho fotos vivas: más de las seis que caben.
  const tareasDelEnCurso = await sembrarTareas(escenario.aseoEnCurso, [
    par(bano, 0),
    par(bano, 1),
    par(bano, 2),
    par(habitacion, 0),
    par(habitacion, 1),
    par(habitacion, 2),
    par(cocina, 0),
    par(cocina, 1),
    par(cocina, 2),
  ]);
  await marcarHechas(tareasDelEnCurso.slice(0, 2));

  fotosDelEnCurso = [];
  for (let i = 0; i < 8; i += 1) {
    fotosDelEnCurso.push(await sembrarFoto(escenario.aseoEnCurso, tareasDelEnCurso[i], i));
  }

  // ── CASO 4: EL ASEO CONFIRMADO SIN NINGUNA FOTO ──────────────────────────
  // Tiene checklist (está confirmado) y no tiene evidencia todavía.
  await sembrarTareas(escenario.aseoPendiente, [par(cocina, 0), par(cocina, 1), par(cocina, 2)]);

  // El aseo SIN CONFIRMAR (caso 3) y el de gestión externa (caso 5) se quedan
  // tal como los dejó el arnés: sin checklist y sin evidencia. Ese es el punto.
});

afterAll(async () => {
  const admin = servicio();

  // Las hijas (checklist, fotos, gastos y daños) caen por `on delete cascade`
  // desde `cleanings`, que `limpiarAseos()` borra primero. Los cuartos NO caen
  // solos: `cleaning_checklist_items.property_room_id` es `on delete restrict`,
  // así que van DESPUÉS de los aseos y por identificador, nunca por tabla.
  await limpiarAseos();

  if (cuartosCreados.length > 0) {
    await admin.from('property_rooms').delete().in('id', cuartosCreados);
    cuartosCreados.length = 0;
  }

  for (const uid of usuariosCreados) await admin.auth.admin.deleteUser(uid);
  usuariosCreados.length = 0;
});

// ─────────────────────────────────────────────────────────────────────────────

describe('leerPanelDeAseo compone las cinco lecturas contra la base real', () => {
  test('un aseo completado trae cabecera, progreso, evidencia, reportes y las tres cifras', async () => {
    const panel = await leerPanelDeAseo(comoAdmin(), escenario.aseoTerminado);

    expect(panel).not.toBeNull();
    if (!panel) return;

    // La cabecera sale entera de la definer, apartamento y persona incluidos.
    expect(panel.cabecera.aseoId).toBe(escenario.aseoTerminado);
    expect(panel.cabecera.apartamentoId).toBe(escenario.aptoGestionado);
    expect(panel.cabecera.apartamento).toContain('Int Aseos Gestionado');
    expect(panel.cabecera.gestionPropia).toBe(true);
    expect(panel.cabecera.fecha).toBe(escenario.fechas.ayer);
    expect(panel.cabecera.estado).toBe('completada');
    expect(panel.cabecera.aseadorId).toBe(escenario.aseadorA);
    expect(panel.cabecera.aseador).toBe('Aseadora A de escenario');
    expect(panel.cabecera.iniciadoAt).not.toBeNull();
    expect(panel.cabecera.terminadoAt).not.toBeNull();

    // El progreso, con los dos números por encima de cero.
    expect(panel.progreso).toEqual({ hechas: 3, total: 4 });

    // La evidencia: tres fotos vivas, cada una con su sitio y su desenlace.
    expect(panel.totalDeFotos).toBe(3);
    expect(panel.fotos.map((f) => f.fotoId)).toEqual(fotosDelTerminado);
    expect(panel.fotos.map((f) => f.posicion)).toEqual([0, 1, 2]);
    for (const foto of panel.fotos) {
      expect(foto.tipo).toBe('checklist');
      // El título del diálogo, ya resuelto contra el checklist que trajo la
      // MISMA lectura: la pantalla no hace un sexto viaje para el nombre.
      expect(foto.etiqueta).toBe('Cuarto bano');
      // La ruta existe en la fila, así que este NO puede ser el desenlace de
      // "nunca tuvo foto". Aquí no se afirma `firmado`: ver la cabecera.
      expect(foto.firma.estado).not.toBe('sin_evidencia');
    }

    // Los reportes: gasto con monto entero de pesos, daño sin monto.
    expect(panel.gastos).toHaveLength(1);
    expect(panel.gastos[0].concepto).toBe(CONCEPTO_DEL_GASTO);
    expect(panel.gastos[0].monto).toBe(MONTO_DEL_GASTO);
    expect(typeof panel.gastos[0].monto).toBe('number');
    expect(panel.gastos[0].moneda).toBe('COP');

    expect(panel.danos).toHaveLength(1);
    expect(panel.danos[0].descripcion).toBe(DESCRIPCION_DEL_DANO);

    // Las tres cifras, del ASEO y no del apartamento (FIN-01).
    expect(panel.cabecera.cobrado).toBe(TARIFA_HUESPED);
    expect(panel.cabecera.pagado).toBe(PAGO_ASEADOR);
    expect(panel.cabecera.margen).toBe(TARIFA_HUESPED - PAGO_ASEADOR);
  });

  test('un aseo EN CURSO devuelve fila, que es lo que rentabilidad_aseos no puede', async () => {
    const panel = await leerPanelDeAseo(comoAdmin(), escenario.aseoEnCurso);

    expect(panel).not.toBeNull();
    if (!panel) return;

    // ES LA RAZÓN DE EXISTIR DEL PANEL. La pregunta que el admin hace es «¿cómo
    // va el 302?», y una función que filtrara por aseo completado devolvería
    // cero filas justo aquí.
    expect(panel.cabecera.estado).toBe('en_curso');
    expect(panel.cabecera.iniciadoAt).not.toBeNull();
    expect(panel.cabecera.terminadoAt).toBeNull();

    // Progreso PARCIAL: ni cero ni completo.
    expect(panel.progreso).toEqual({ hechas: 2, total: 9 });
    expect(panel.progreso.hechas).toBeGreaterThan(0);
    expect(panel.progreso.hechas).toBeLessThan(panel.progreso.total);
  });

  test('un aseo pendiente SIN CONFIRMAR da progreso de cero sobre cero, y no es un error', async () => {
    // Control: el aseo existe y la lectura devuelve fila. Sin esto, el cero de
    // abajo lo daría igual un identificador que no es de ningún aseo.
    const panel = await leerPanelDeAseo(comoAdmin(), escenario.aseoSinConfirmar);

    expect(panel).not.toBeNull();
    if (!panel) return;
    expect(panel.cabecera.aseoId).toBe(escenario.aseoSinConfirmar);
    expect(panel.cabecera.estado).toBe('pendiente');

    // ── ESTO NO ES UN ERROR, Y ES EL CASO QUE MÁS SE PARECE A UNO ──────────
    //
    // Las tareas del checklist SE MATERIALIZAN AL CONFIRMAR el aseo, no al
    // crearlo. Un aseo sin confirmar no tiene ninguna, y la rama que la pantalla
    // tiene que distinguir es TOTAL IGUAL A CERO (falta llenarlo), no `hechas`
    // igual a cero, que sería un cero de doce perfectamente correcto.
    expect(panel.progreso.total).toBe(0);
    expect(panel.progreso.hechas).toBe(0);

    // Y la contraprueba, en la misma base y con el mismo cliente: el aseo YA
    // confirmado sí tiene tareas. Es lo que demuestra que el cero de arriba lo
    // produce la confirmación y no una consulta rota.
    const confirmado = await leerPanelDeAseo(comoAdmin(), escenario.aseoPendiente);
    expect(confirmado?.progreso).toEqual({ hechas: 0, total: 3 });
  });

  test('un aseo sin fotos devuelve la tira vacía y conteo cero, sin firmar nada', async () => {
    const panel = await leerPanelDeAseo(comoAdmin(), escenario.aseoPendiente);

    expect(panel).not.toBeNull();
    if (!panel) return;

    // Control: el aseo tiene checklist, así que la lectura de colecciones SÍ
    // corrió. Un vacío en las cuatro sería indistinguible de una consulta que no
    // se hizo.
    expect(panel.progreso.total).toBe(3);

    expect(panel.fotos).toEqual([]);
    expect(panel.totalDeFotos).toBe(0);
    expect(panel.gastos).toEqual([]);
    expect(panel.danos).toEqual([]);
  });

  test('una unidad de gestión externa devuelve fila, con la marca en falso y las cifras en cero', async () => {
    const panel = await leerPanelDeAseo(comoAdmin(), escenario.aseoInerte);

    // LA FUNCIÓN NO FILTRA POR GESTIÓN PROPIA, a propósito: no hay agregación
    // que contaminar. Devuelve la fila y es la PANTALLA la que decide no pintar
    // el grupo de dinero leyendo la marca.
    expect(panel).not.toBeNull();
    if (!panel) return;

    expect(panel.cabecera.apartamentoId).toBe(escenario.aptoExterno);
    expect(panel.cabecera.gestionPropia).toBe(false);
    // La fila es inerte por `cl_unmanaged_is_inert`: sin estado y sin persona.
    expect(panel.cabecera.estado).toBeNull();
    expect(panel.cabecera.aseadorId).toBeNull();
    expect(panel.cabecera.aseador).toBeNull();

    expect(panel.cabecera.cobrado).toBe(0);
    expect(panel.cabecera.pagado).toBe(0);
    expect(panel.cabecera.margen).toBe(0);
  });

  test('con más de seis fotos se firman exactamente seis y el conteo refleja todas', async () => {
    const panel = await leerPanelDeAseo(comoAdmin(), escenario.aseoEnCurso);

    expect(panel).not.toBeNull();
    if (!panel) return;

    // ES LA ASERCIÓN QUE IMPIDE QUE ALGUIEN "MEJORE" FIRMÁNDOLAS TODAS.
    // El seis va literal ADEMÁS de por la constante: si alguien subiera la
    // constante, la comparación contra ella seguiría pasando y esta no.
    expect(panel.fotos).toHaveLength(6);
    expect(panel.fotos).toHaveLength(MINIATURAS_VISIBLES);

    // El conteo total es un dato de pantalla (la casilla de `+{N}`) y NO se
    // puede derivar de seis: por eso la lista se lee entera.
    expect(panel.totalDeFotos).toBe(8);
    expect(panel.totalDeFotos).toBeGreaterThan(panel.fotos.length);

    // Y el recorte se lleva las SEIS PRIMERAS de la tira, en orden estable.
    expect(panel.fotos.map((f) => f.fotoId)).toEqual(fotosDelEnCurso.slice(0, 6));
    expect(panel.fotos.map((f) => f.posicion)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  test('una foto borrada no entra en la tira ni en el conteo', async () => {
    // Control: la fila borrada existe de verdad y cuelga de este aseo. Sin esto,
    // la ausencia de abajo la daría igual una foto que nunca se sembró.
    const { data: purgada } = await servicio()
      .from('cleaning_photos')
      .select('id, cleaning_id, deleted_at')
      .eq('id', fotoBorrada)
      .single();
    expect(purgada?.cleaning_id).toBe(escenario.aseoTerminado);
    expect(purgada?.deleted_at).not.toBeNull();

    const panel = await leerPanelDeAseo(comoAdmin(), escenario.aseoTerminado);
    expect(panel?.fotos.map((f) => f.fotoId)).not.toContain(fotoBorrada);
    expect(panel?.totalDeFotos).toBe(3);
  });

  test('un identificador que no tiene forma de identificador no consulta y devuelve nulo', async () => {
    // Sin la guarda de forma, Postgres respondería con un error de sintaxis de
    // tipo y la pantalla se caería con un fallo que no sabe explicar.
    await expect(leerPanelDeAseo(comoAdmin(), 'no-soy-un-identificador')).resolves.toBeNull();
    await expect(leerPanelDeAseo(comoAdmin(), randomUUID())).resolves.toBeNull();
  });
});

describe('la frontera de la definer, con una sesión de aseadora', () => {
  test('una aseadora no obtiene datos de un aseo ajeno', async () => {
    const comoAseadora = clienteConToken(tokenAseadoraA);

    // Control, con el MISMO aseo y el MISMO código: el admin sí lo ve. Sin esto,
    // la denegación de abajo la daría igual un identificador inexistente.
    const conAdmin = await leerPanelDeAseo(comoAdmin(), escenario.aseoSinConfirmar);
    expect(conAdmin).not.toBeNull();

    // NO SE AFIRMA EL TEXTO NI EL CÓDIGO DEL ERROR, y es deliberado: el código
    // concreto ya lo afirma la aserción 102 del bloque P de
    // `11_financiero.test.sql`, impersonando de verdad. Duplicar el literal aquí
    // ataría dos capas a la misma cadena, y el día que cambie habría que
    // acordarse de las dos. Lo que esta capa tiene que garantizar es que NO
    // DEVUELVE DATOS.
    await expect(leerPanelDeAseo(comoAseadora, escenario.aseoSinConfirmar)).rejects.toThrow();
  });
});
