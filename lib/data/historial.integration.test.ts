import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { leerHistorial, type EntradaDeHistorial } from '@/lib/data/historial';
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
 * EL CONTRATO DEL HISTORIAL, CONTRA POSTGRES REAL Y CON JWT REALES (DASH-06,
 * REPORT-04).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESTE ARCHIVO EXISTE POR UN ERROR QUE `tsc` NO PUEDE VER.
 *
 * `damages` tiene DOS claves foráneas hacia `profiles`: `damages_reported_by_fkey`
 * y `damages_resolved_by_fkey`. Un embed `profiles(...)` sin calificar por nombre
 * de FK es ambiguo y PostgREST responde `PGRST201`. `lib/database.types.ts` tipa
 * el embed pero NO valida la ambigüedad, así que el fallo aparece la primera vez
 * que un admin abre una ficha, no al compilar. Es exactamente el mismo agujero
 * que `operacion.integration.test.ts` mide para `cleanings`.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Y hay una segunda cosa que solo se puede medir aquí: que la consulta de
 * `damages` NO copia el predicado de `damages_open_idx`. El unitario mide que no
 * se emite el filtro; esto mide que el daño resuelto VUELVE de la base.
 *
 * REGLA HEREDADA DEL PLAN 02-09: toda aserción que espere "vacío", "0 filas" o
 * "no aparece" lleva delante una aserción de CONTROL que demuestra que la cosa
 * existía. Sin ella, el verde lo da igual un fixture que nunca se sembró.
 *
 * Requiere `npx supabase start` con el stack COMPLETO (no solo Postgres: la
 * siembra crea usuarios contra GoTrue) y `.env.local` en la raíz.
 */

const SUFIJO = randomUUID().slice(0, 8);
const EMAIL_ADMIN = `int.hist.admin.${SUFIJO}@vivaguest.test`;
const PASSWORD_ADMIN = `hist-admin-${randomUUID()}`;

const DESC_ABIERTO = `Rejilla del sifón rota ${SUFIJO}`;
const DESC_RESUELTO = `Bombillo del corredor fundido ${SUFIJO}`;

let escenario: EscenarioDeAseos;
let uidAdmin = '';
let tokenAdmin = '';
let tokenAseadorA = '';

let danoAbierto = '';
let danoResuelto = '';

const usuariosCreados: string[] = [];

function servicio(): ClienteVivaGuest {
  return clienteAdminDePruebas();
}

async function iniciarSesion(email: string, password: string): Promise<string> {
  const { data, error } = await servicio().auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(`No se pudo iniciar sesión como ${email}: ${error?.message}`);
  }
  return data.session.access_token;
}

beforeAll(async () => {
  escenario = await sembrarEscenarioDeAseos();

  const { data, error } = await servicio().auth.admin.createUser({
    email: EMAIL_ADMIN,
    password: PASSWORD_ADMIN,
    email_confirm: true,
    app_metadata: { role: 'admin' },
    user_metadata: { role: 'admin', full_name: 'Admin De Historial' },
  });
  if (error || !data.user) throw new Error(`No se pudo crear el admin: ${error?.message}`);
  uidAdmin = data.user.id;
  usuariosCreados.push(uidAdmin);

  tokenAdmin = await iniciarSesion(EMAIL_ADMIN, PASSWORD_ADMIN);

  // La aseadora A del arnés, para ejercitar la RLS de las dos consultas
  // (T-04-13). Se le fija una contraseña conocida con la clave de servicio
  // porque el arnés la genera aleatoria y NO la devuelve.
  const passwordAseadora = `hist-aseadora-${randomUUID()}`;
  const { data: aseadora, error: errorAseadora } = await servicio().auth.admin.updateUserById(
    escenario.aseadorA,
    { password: passwordAseadora },
  );
  if (errorAseadora || !aseadora.user?.email) {
    throw new Error(`No se pudo preparar a la aseadora A: ${errorAseadora?.message}`);
  }
  tokenAseadorA = await iniciarSesion(aseadora.user.email, passwordAseadora);

  // ── LOS DOS DAÑOS ─────────────────────────────────────────────────────────
  //
  // `created_at` va EXPLÍCITO y no por el default `now()`: la suite corre con
  // TZ=UTC y un daño insertado a las 02:00 UTC pertenece al día ANTERIOR en
  // Bogotá. Con el instante fijado a las 17:00Z de un día de negocio conocido
  // (12:00 de Bogotá), la posición esperada en la mezcla no depende de la hora a
  // la que alguien corra la suite.
  //
  // Los dos cuelgan de `aseoTerminado`, que es el aseo de AYER de la aseadora A:
  // `damages.cleaning_id` es NOT NULL y es como se reportan de verdad, dentro de
  // un aseo.
  const { data: danos, error: errorDanos } = await servicio()
    .from('damages')
    .insert([
      {
        cleaning_id: escenario.aseoTerminado,
        property_id: escenario.aptoGestionado,
        descripcion: DESC_ABIERTO,
        reported_by: escenario.aseadorA,
        created_at: `${escenario.fechas.hoy}T17:00:00Z`,
      },
      {
        cleaning_id: escenario.aseoTerminado,
        property_id: escenario.aptoGestionado,
        descripcion: DESC_RESUELTO,
        reported_by: escenario.aseadorA,
        created_at: `${escenario.fechas.ayer}T17:00:00Z`,
        resolved_at: new Date().toISOString(),
        resolved_by: uidAdmin,
      },
    ])
    .select('id, descripcion');

  if (errorDanos || !danos) {
    throw new Error(`No se pudieron sembrar los daños: ${errorDanos?.message}`);
  }

  danoAbierto = danos.find((d) => d.descripcion === DESC_ABIERTO)?.id ?? '';
  danoResuelto = danos.find((d) => d.descripcion === DESC_RESUELTO)?.id ?? '';
  if (!danoAbierto || !danoResuelto) throw new Error('La siembra de daños no cuadró.');
});

afterAll(async () => {
  const admin = servicio();

  // Los daños caen por `on delete cascade` desde `cleanings`, que `limpiarAseos()`
  // borra primero. Se borran igual explícitamente: `resolved_by` apunta al admin
  // de este archivo, que se elimina abajo.
  await admin.from('damages').delete().in('id', [danoAbierto, danoResuelto].filter(Boolean));

  await limpiarAseos();

  for (const uid of usuariosCreados) await admin.auth.admin.deleteUser(uid);
  usuariosCreados.length = 0;
});

// ─────────────────────────────────────────────────────────────────────────────

const idsDe = (entradas: EntradaDeHistorial[]) => entradas.map((e) => e.id);
const posicion = (entradas: EntradaDeHistorial[], id: string) =>
  entradas.findIndex((e) => e.id === id);

describe('leerHistorial contra PostgREST real', () => {
  test('los DOS embeds se resuelven: ninguno devuelve PGRST201', async () => {
    const supabase = clienteConToken(tokenAdmin);

    // Si el embed de `damages` fuera `profiles(...)` sin calificar, esta llamada
    // lanzaría con `PGRST201` y ninguna de las aserciones de abajo se alcanzaría.
    const historial = await leerHistorial(supabase, escenario.aptoGestionado);

    const conAseador = historial.entradas.find(
      (e) => e.clase === 'aseo' && e.aseo.id === escenario.aseoPendiente,
    );
    expect(conAseador?.clase).toBe('aseo');
    if (conAseador?.clase !== 'aseo') throw new Error('inalcanzable');
    expect(conAseador.aseo.aseador?.id).toBe(escenario.aseadorA);
    expect(conAseador.aseo.aseador?.full_name).toBe('Aseadora A de escenario');

    const conReportante = historial.entradas.find(
      (e) => e.clase === 'dano' && e.dano.id === danoAbierto,
    );
    expect(conReportante?.clase).toBe('dano');
    if (conReportante?.clase !== 'dano') throw new Error('inalcanzable');
    expect(conReportante.dano.reportadoPor?.id).toBe(escenario.aseadorA);
    expect(conReportante.dano.reportadoPor?.full_name).toBe('Aseadora A de escenario');
  });

  test('el daño RESUELTO vuelve de la base, igual que el abierto', async () => {
    const historial = await leerHistorial(clienteConToken(tokenAdmin), escenario.aptoGestionado);

    // Control: el abierto está. Sin esto, un verde podría venir de que la
    // siembra de daños nunca ocurrió.
    expect(idsDe(historial.entradas)).toContain(danoAbierto);
    // Y el resuelto también. Copiar el predicado de `damages_open_idx`
    // (`where resolved_at is null`) lo dejaría fuera.
    expect(idsDe(historial.entradas)).toContain(danoResuelto);

    const resuelto = historial.entradas.find((e) => e.id === danoResuelto);
    if (resuelto?.clase !== 'dano') throw new Error('inalcanzable');
    expect(resuelto.dano.resolved_at).not.toBeNull();
    expect(resuelto.dano.descripcion).toBe(DESC_RESUELTO);
  });

  test('la lista viene MEZCLADA y cronológicamente descendente', async () => {
    const historial = await leerHistorial(clienteConToken(tokenAdmin), escenario.aptoGestionado);

    // Los cinco aseos del apartamento gestionado más los dos daños.
    expect(historial.entradas).toHaveLength(7);

    // 1) Los días nunca suben. Es la forma robusta de fijar el orden sin
    //    depender del desempate entre dos filas del mismo día.
    const fechas = historial.entradas.map((e) => e.fecha);
    expect([...fechas].sort().reverse()).toEqual(fechas);

    // 2) Y la lista está INTERCALADA, que es lo que `[...aseos, ...danos]` no
    //    consigue. `danoAbierto` es de HOY y `aseoTerminado` es de AYER, así que
    //    el daño tiene que ir ANTES. Concatenar pondría los cinco aseos primero
    //    y los dos daños al final.
    expect(posicion(historial.entradas, danoAbierto)).toBeLessThan(
      posicion(historial.entradas, escenario.aseoTerminado),
    );

    // 3) El primero es el aseo de dentro de tres días, que es el único de su día.
    expect(historial.entradas[0].id).toBe(escenario.aseoPendiente);
  });

  test('una unidad de GESTIÓN EXTERNA devuelve su aseo inerte, con state nulo', async () => {
    const historial = await leerHistorial(clienteConToken(tokenAdmin), escenario.aptoExterno);

    expect(idsDe(historial.entradas)).toEqual([escenario.aseoInerte]);

    const inerte = historial.entradas[0];
    if (inerte.clase !== 'aseo') throw new Error('inalcanzable');
    expect(inerte.aseo.is_managed).toBe(false);
    expect(inerte.aseo.state).toBeNull();
    expect(inerte.aseo.aseador).toBeNull();
    expect(inerte.fecha).toBe(escenario.fechas.hoy);
  });

  test('un apartamento sin nada devuelve una lista vacía y `hayMas` en falso', async () => {
    const admin = servicio();
    const { data: vacio, error } = await admin
      .from('properties')
      .insert({
        nombre: `Int Historial Vacio ${SUFIJO}`,
        cluster: 'Int Cluster Historial',
        gestion_vivaguest: true,
        // Borrador, no activo: `props_active_requires_owner` exige responsable
        // para activar, y a este apartamento no le hace falta uno. Un borrador
        // recién creado es además el caso REAL del historial vacío.
        is_active: false,
      })
      .select('id')
      .single();
    if (error || !vacio) throw new Error(`No se pudo sembrar el apartamento: ${error?.message}`);

    try {
      const historial = await leerHistorial(clienteConToken(tokenAdmin), vacio.id);
      expect(historial.entradas).toEqual([]);
      expect(historial.hayMas).toBe(false);
    } finally {
      await admin.from('properties').delete().eq('id', vacio.id);
    }
  });

  test('pagina de 30 en 30 y dice cuándo queda algo detrás', async () => {
    const supabase = clienteConToken(tokenAdmin);

    const primeras = await leerHistorial(supabase, escenario.aptoGestionado, 3, 0);
    expect(primeras.entradas).toHaveLength(3);
    expect(primeras.hayMas).toBe(true);

    const siguientes = await leerHistorial(supabase, escenario.aptoGestionado, 3, 3);
    expect(siguientes.entradas).toHaveLength(3);
    expect(siguientes.hayMas).toBe(true);

    const ultimas = await leerHistorial(supabase, escenario.aptoGestionado, 3, 6);
    expect(ultimas.entradas).toHaveLength(1);
    expect(ultimas.hayMas).toBe(false);

    // Los tres bloques son disjuntos y su unión es el historial completo: una
    // paginación que repita o se salte una entrada es cómo un daño desaparece
    // entre dos pulsaciones de `Ver 30 más`.
    const todos = [...primeras.entradas, ...siguientes.entradas, ...ultimas.entradas];
    expect(new Set(idsDe(todos)).size).toBe(7);
  });

  test('la RLS filtra las DOS consultas con el JWT de quien pregunta (T-04-13)', async () => {
    // Control: el admin ve las siete entradas del apartamento.
    const delAdmin = await leerHistorial(clienteConToken(tokenAdmin), escenario.aptoGestionado);
    expect(delAdmin.entradas).toHaveLength(7);

    // La aseadora A está asignada a tres de los cinco aseos
    // (`cleanings_cleaner_select`: `aseador_id = auth.uid()`), y los dos daños
    // cuelgan de uno de ellos, así que `damages_cleaner_select` se los deja ver.
    // Los dos aseos SIN aseador (el sin confirmar y el cancelado) no.
    const deLaAseadora = await leerHistorial(
      clienteConToken(tokenAseadorA),
      escenario.aptoGestionado,
    );

    const ids = idsDe(deLaAseadora.entradas);
    expect(ids).toContain(escenario.aseoPendiente);
    expect(ids).toContain(escenario.aseoEnCurso);
    expect(ids).toContain(escenario.aseoTerminado);
    expect(ids).not.toContain(escenario.aseoSinConfirmar);
    expect(ids).not.toContain(escenario.aseoCancelado);
    expect(deLaAseadora.entradas).toHaveLength(5);
  });
});
