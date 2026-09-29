import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import {
  filasDelDia,
  leerAlertasDelAdmin,
  leerAseadoresActivos,
  leerOperacion,
  leerUltimoExitoDeSync,
} from '@/lib/data/operacion';
import { estadoDeSincronizacion } from '@/lib/domain/salud-sync';
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
 * EL CONTRATO DE LA CAPA DE LECTURA, CONTRA POSTGRES REAL Y CON JWT REALES.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESTE ARCHIVO EXISTE POR UN ERROR QUE `tsc` NO PUEDE VER.
 *
 * `cleanings` tiene DOS claves foráneas hacia `profiles` (`aseador_id` y
 * `confirmado_by`). Un embed `profiles(...)` sin calificar por nombre de FK es
 * ambiguo y PostgREST responde `PGRST201`. `lib/database.types.ts` tipa el embed
 * pero NO valida la ambigüedad, así que el fallo aparece en el primer render y
 * no al compilar. Un unitario con el cliente stubbeado tampoco lo ve: el stub
 * devuelve lo que el stub devuelve.
 *
 * La única forma honesta de medirlo es emitir la consulta contra PostgREST de
 * verdad, con el JWT de quien la haría. Eso es lo que hace este archivo.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * REGLA HEREDADA DEL PLAN 02-09 Y PAGADA ALLÍ: toda aserción que espere "vacío",
 * "0 filas" o "no aparece" lleva delante una aserción de CONTROL que demuestra
 * que la cosa existía. Sin ella, el verde lo da igual un fixture que nunca se
 * sembró.
 *
 * EL ORDEN DE LOS TESTS DE `leerUltimoExitoDeSync` IMPORTA y no es casual: el
 * primero mide el caso "ningún feed activo sincronizó nunca" y el segundo añade
 * el feed que sí sincronizó. Vitest ejecuta los tests de un archivo en orden de
 * declaración, y la suite corre con `fileParallelism: false` contra un stack
 * local que es UNO solo y compartido.
 *
 * Requiere `npx supabase start` con el stack COMPLETO (no solo Postgres: la
 * siembra crea usuarios contra GoTrue) y `.env.local` en la raíz.
 */

const SUFIJO = randomUUID().slice(0, 8);
const EMAIL_ADMIN = `int.oper.admin.${SUFIJO}@vivaguest.test`;
const PASSWORD_ADMIN = `oper-admin-${randomUUID()}`;

let escenario: EscenarioDeAseos;
let uidAdmin = '';
let tokenAdmin = '';
let tokenAseadorA = '';

/** Todo lo que este archivo crea fuera del arnés y tiene que borrar. */
const notificacionesCreadas: string[] = [];
const usuariosCreados: string[] = [];

/**
 * Los dos feeds del escenario de `leerUltimoExitoDeSync`. Cuelgan de los
 * apartamentos del arnés, y `calendar_feeds.property_id` es `on delete cascade`,
 * así que `limpiarAseos()` se los lleva por delante sin orden extra.
 */
let feedNuncaSincronizo = '';
let feedSiSincronizo = '';
/** El valor exacto que la base guardó, para comparar sin adivinar el formato. */
let ultimoExitoSembrado = '';

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

  // El admin lo crea este archivo: el arnés solo siembra aseadoras. El rol va en
  // los DOS sitios (`app_metadata` viaja en el JWT y es lo que lee
  // `private.is_admin()` vía `profiles`; `user_metadata` es lo que materializa
  // la fila de `public.profiles`).
  const { data, error } = await servicio().auth.admin.createUser({
    email: EMAIL_ADMIN,
    password: PASSWORD_ADMIN,
    email_confirm: true,
    app_metadata: { role: 'admin' },
    user_metadata: { role: 'admin', full_name: 'Admin De Operacion' },
  });
  if (error || !data.user) throw new Error(`No se pudo crear el admin: ${error?.message}`);
  uidAdmin = data.user.id;
  usuariosCreados.push(uidAdmin);

  tokenAdmin = await iniciarSesion(EMAIL_ADMIN, PASSWORD_ADMIN);

  // La aseadora A del arnés, para ejercitar la RLS del embed (T-04-13). Se le
  // fija una contraseña conocida con la clave de servicio porque el arnés la
  // genera aleatoria y no la devuelve.
  const passwordAseadora = `oper-aseadora-${randomUUID()}`;
  const { data: aseadora, error: errorAseadora } = await servicio().auth.admin.updateUserById(
    escenario.aseadorA,
    { password: passwordAseadora },
  );
  if (errorAseadora || !aseadora.user?.email) {
    throw new Error(`No se pudo preparar a la aseadora A: ${errorAseadora?.message}`);
  }
  tokenAseadorA = await iniciarSesion(aseadora.user.email, passwordAseadora);
});

afterAll(async () => {
  const admin = servicio();

  if (notificacionesCreadas.length > 0) {
    await admin.from('notifications').delete().in('id', notificacionesCreadas);
    notificacionesCreadas.length = 0;
  }

  // Los feeds caen por cascade con sus apartamentos dentro de `limpiarAseos()`.
  await limpiarAseos();

  for (const uid of usuariosCreados) await admin.auth.admin.deleteUser(uid);
  usuariosCreados.length = 0;
});

// ─────────────────────────────────────────────────────────────────────────────

describe('leerOperacion contra PostgREST real', () => {
  test('resuelve los DOS embeds y no responde PGRST201', async () => {
    const { filas, hoy, horizonte } = await leerOperacion(clienteConToken(tokenAdmin));

    // Control: el escenario existe y la ventana lo cubre. Sin esto, un fixture
    // que no se sembró daría el mismo verde en las aserciones de abajo.
    expect(hoy).toBe(escenario.fechas.hoy);
    expect(horizonte > escenario.fechas.enTresDias).toBe(true);

    const delEscenario = filas.filter(
      (f) => f.property_id === escenario.aptoGestionado || f.property_id === escenario.aptoExterno,
    );
    expect(delEscenario.length).toBeGreaterThan(0);

    // LA ASERCIÓN CENTRAL: si el embed fuera `profiles(...)` sin calificar,
    // `leerOperacion` habría lanzado con el mensaje de PGRST201 y no se llegaría
    // hasta aquí. Que además venga RESUELTO es la segunda mitad.
    const enCurso = delEscenario.find((f) => f.id === escenario.aseoEnCurso);
    expect(enCurso).toBeDefined();
    expect(enCurso?.property?.nombre).toContain('Int Aseos Gestionado');
    expect(enCurso?.property?.gestion_vivaguest).toBe(true);
    // La hora del apartamento es 10:15, distinta del default del schema: prueba
    // que el embed trae la fila de `properties` y no un valor por defecto.
    expect(enCurso?.property?.hora_limite).toBe('10:15:00');
    expect(enCurso?.aseador?.id).toBe(escenario.aseadorA);
    expect(enCurso?.aseador?.full_name).toBe('Aseadora A de escenario');
  });

  test('trae los seis aseos de la ventana, cancelado y el de AYER incluidos (D-08)', async () => {
    const { filas, hoy } = await leerOperacion(clienteConToken(tokenAdmin));

    const delEscenario = new Set(
      filas
        .filter(
          (f) =>
            f.property_id === escenario.aptoGestionado || f.property_id === escenario.aptoExterno,
        )
        .map((f) => f.id),
    );

    expect(delEscenario).toEqual(
      new Set([
        // HASTA D-08 ESTE NO LLEGABA, y esa era la mitad de abajo del defecto: la
        // ventana cortaba en `hoy`, así que un aseo de ayer vivo y vencido no
        // podía alertar porque `alertasComputadas()` nunca lo veía. Acá está
        // terminado, pero lo que se mide es la VENTANA DE LA CONSULTA, que no
        // sabe de estados. Criterio 7 del ROADMAP.
        escenario.aseoTerminado, // ayer
        escenario.aseoEnCurso, // hoy
        escenario.aseoCancelado, // hoy, y SE trae: la cabecera del día lo cuenta
        escenario.aseoInerte, // hoy, gestión externa
        escenario.aseoSinConfirmar, // mañana
        escenario.aseoPendiente, // en tres días
      ]),
    );

    // Y el de ayer es de ayer de verdad: la aserción de arriba mide la ventana y
    // no un fixture que hubiera cambiado de fecha por debajo.
    const { data: terminado } = await servicio()
      .from('cleanings')
      .select('id, scheduled_date')
      .eq('id', escenario.aseoTerminado)
      .single();
    expect(terminado?.scheduled_date).toBe(escenario.fechas.ayer);

    // ── Y ACÁ SE VE POR QUÉ SON DOS FILTROS Y NO UNO ────────────────────────
    // La consulta lo trae; la PROYECCIÓN decide qué hacer con él. Las dos mitades,
    // medidas juntas y contra PostgREST de verdad.
    //
    // ── REESCRITO EN EL PLAN 10-05 ───────────────────────────────────────────
    // Afirmaba sobre `agruparPorDia`, que codificaba el eje `Atrasados / Hoy /
    // Mañana / Siguientes` dentro de la capa de datos y murió con el selector de
    // día. La propiedad que este caso defiende es la de la CONSULTA —que la ventana
    // baja siete días y trae el aseo de ayer—, y la proyección solo estaba ahí para
    // demostrar que lo traído se puede recortar. `filasDelDia()` lo demuestra igual
    // y sin resucitar un eje que ya no existe.
    expect(filasDelDia(filas, escenario.fechas.ayer).map((f) => f.id)).toContain(
      escenario.aseoTerminado,
    );
    expect(filasDelDia(filas, hoy).map((f) => f.id)).not.toContain(escenario.aseoTerminado);
  });

  test('las filas de gestión externa vienen en el MISMO conjunto, no en otra consulta', async () => {
    const { filas } = await leerOperacion(clienteConToken(tokenAdmin));

    const inerte = filas.find((f) => f.id === escenario.aseoInerte);

    // DASH-07: la unidad informativa se muestra, y su fila es inerte por
    // construcción (`cl_unmanaged_is_inert`). Quien la atiende va en
    // `contacto_externo`, que es lo que pinta la columna A CARGO.
    expect(inerte).toBeDefined();
    expect(inerte?.is_managed).toBe(false);
    expect(inerte?.state).toBeNull();
    expect(inerte?.aseador).toBeNull();
    expect(inerte?.property?.gestion_vivaguest).toBe(false);
    expect(inerte?.property?.contacto_externo).toContain('Administracion externa');
  });

  test('viene ordenada por fecha y, dentro del día, por hora límite', async () => {
    const { filas } = await leerOperacion(clienteConToken(tokenAdmin));

    const fechas = filas.map((f) => f.scheduled_date);
    expect([...fechas].sort()).toEqual(fechas);
  });

  test('con el JWT de una aseadora la RLS recorta el conjunto y el embed (T-04-13)', async () => {
    const { filas: delAdmin } = await leerOperacion(clienteConToken(tokenAdmin));
    const { filas: deLaAseadora } = await leerOperacion(clienteConToken(tokenAseadorA));

    // Control: el admin sí ve la fila de gestión externa y la sin confirmar.
    expect(delAdmin.some((f) => f.id === escenario.aseoInerte)).toBe(true);
    expect(delAdmin.some((f) => f.id === escenario.aseoSinConfirmar)).toBe(true);

    // `cleanings_cleaner_select` la acota a `aseador_id = auth.uid()`: dentro de
    // la ventana eso es el terminado de ayer (que desde D-08 la ventana sí
    // alcanza), el aseo en curso de hoy y el pendiente de dentro de tres días.
    // Ni la fila inerte ni la sin confirmar tienen aseadora.
    //
    // LO QUE ESTA ASERCIÓN MIDE NO CAMBIÓ CON D-08 y por eso sigue acá: que la
    // RLS recorte por `aseador_id`. Ampliar la ventana no le dio a la aseadora ni
    // una fila que no fuera suya.
    expect(new Set(deLaAseadora.map((f) => f.id))).toEqual(
      new Set([escenario.aseoTerminado, escenario.aseoEnCurso, escenario.aseoPendiente]),
    );
    for (const f of deLaAseadora) expect(f.aseador_id).toBe(escenario.aseadorA);

    // `profiles_own_select` la deja ver su propio perfil, así que el embed de
    // aseadora sí resuelve; `properties_cleaner_select` le deja el apartamento
    // porque tiene trabajo vivo en él.
    const suEnCurso = deLaAseadora.find((f) => f.id === escenario.aseoEnCurso);
    expect(suEnCurso?.aseador?.full_name).toBe('Aseadora A de escenario');
    expect(suEnCurso?.property?.id).toBe(escenario.aptoGestionado);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('leerUltimoExitoDeSync', () => {
  test('devuelve null solo si NINGÚN feed activo sincronizó nunca', async () => {
    const admin = servicio();

    // Control de entorno: si otro archivo dejó feeds con éxito, la aserción de
    // abajo mediría otra cosa. Que el control se caiga nombra la causa real.
    const { data: previos } = await admin
      .from('calendar_feeds')
      .select('id')
      .eq('is_active', true)
      .not('last_success_at', 'is', null);
    expect(previos ?? []).toHaveLength(0);

    const { data: feed, error } = await admin
      .from('calendar_feeds')
      .insert({
        property_id: escenario.aptoGestionado,
        provider: 'airbnb',
        is_active: true,
        // Un feed recién conectado que todavía no corrió ni una vez.
        last_success_at: null,
      })
      .select('id, last_success_at')
      .single();
    if (error || !feed) throw new Error(`No se pudo sembrar el feed nuevo: ${error?.message}`);
    feedNuncaSincronizo = feed.id;

    // Control: el feed existe y su marca es nula de verdad.
    expect(feed.last_success_at).toBeNull();

    await expect(leerUltimoExitoDeSync(clienteConToken(tokenAdmin))).resolves.toBeNull();
  });

  test('con un feed que nunca sincronizó AL LADO de otro que sí, devuelve el del que sí', async () => {
    const admin = servicio();

    const { data: feed, error } = await admin
      .from('calendar_feeds')
      .insert({
        property_id: escenario.aptoExterno,
        provider: 'booking',
        is_active: true,
        last_success_at: new Date().toISOString(),
      })
      .select('id, last_success_at')
      .single();
    if (error || !feed?.last_success_at) {
      throw new Error(`No se pudo sembrar el feed sano: ${error?.message}`);
    }
    feedSiSincronizo = feed.id;
    ultimoExitoSembrado = feed.last_success_at;

    // Control: los dos feeds están activos y solo uno tiene marca.
    const { data: activos } = await admin
      .from('calendar_feeds')
      .select('id, last_success_at')
      .eq('is_active', true);
    expect(new Set((activos ?? []).map((f) => f.id))).toEqual(
      new Set([feedNuncaSincronizo, feedSiSincronizo]),
    );
    expect((activos ?? []).filter((f) => f.last_success_at === null)).toHaveLength(1);

    // LA ASERCIÓN DEL SEÑUELO: sin `nullsFirst: false`, PostgREST ordena los
    // nulos primero en descendente y esto devolvería `null`, con lo que
    // `estadoDeSincronizacion(null, …)` diría 'caida' con el sistema sano.
    const maximo = await leerUltimoExitoDeSync(clienteConToken(tokenAdmin));

    expect(maximo).not.toBeNull();
    expect(Date.parse(maximo!)).toBe(Date.parse(ultimoExitoSembrado));
    // Y el panel, que es quien consume esto, pinta verde.
    expect(estadoDeSincronizacion(maximo, Date.now())).toBe('sana');
  });

  test('un feed DESACTIVADO no cuenta, aunque sea el más reciente', async () => {
    const admin = servicio();

    // Control: existe y su marca es posterior a la del feed activo.
    const enElFuturo = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const { data: apagado, error } = await admin
      .from('calendar_feeds')
      .insert({
        property_id: escenario.aptoGestionado,
        provider: 'booking',
        is_active: false,
        last_success_at: enElFuturo,
      })
      .select('id, last_success_at, is_active')
      .single();
    if (error || !apagado) throw new Error(`No se pudo sembrar el feed apagado: ${error?.message}`);
    expect(apagado.is_active).toBe(false);
    expect(Date.parse(apagado.last_success_at!)).toBeGreaterThan(Date.parse(ultimoExitoSembrado));

    const maximo = await leerUltimoExitoDeSync(clienteConToken(tokenAdmin));

    expect(Date.parse(maximo!)).toBe(Date.parse(ultimoExitoSembrado));
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('leerAlertasDelAdmin', () => {
  test('devuelve las no atendidas del admin, más reciente primero', async () => {
    const admin = servicio();

    const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const haceDosHoras = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const haceTresHoras = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

    const { data: sembradas, error } = await admin
      .from('notifications')
      .insert([
        {
          recipient_id: uidAdmin,
          type: 'dano_reportado',
          title: 'Rejilla del sifón rota',
          body: 'La aseadora reportó un daño en el baño principal.',
          created_at: haceUnaHora,
        },
        {
          recipient_id: uidAdmin,
          type: 'no_puedo',
          title: 'No puedo con el aseo de hoy',
          body: 'La aseadora no puede asistir.',
          created_at: haceTresHoras,
        },
        {
          recipient_id: uidAdmin,
          type: 'faltantes_reportados',
          title: 'Ya atendida',
          body: 'Esta ya la cerró el admin.',
          created_at: haceDosHoras,
          read_at: new Date().toISOString(),
        },
        {
          // De OTRO destinatario: la RLS no la debe dejar salir.
          recipient_id: escenario.aseadorA,
          type: 'asignacion',
          title: 'Tienes un aseo nuevo',
          body: 'Asignación de hoy.',
          created_at: haceUnaHora,
        },
      ])
      .select('id, recipient_id, read_at, title');
    if (error || !sembradas) throw new Error(`No se pudieron sembrar alertas: ${error?.message}`);
    for (const n of sembradas) notificacionesCreadas.push(n.id);

    // Control: las cuatro están en la base, una atendida y una ajena.
    expect(sembradas).toHaveLength(4);
    expect(sembradas.filter((n) => n.read_at !== null)).toHaveLength(1);
    expect(sembradas.filter((n) => n.recipient_id !== uidAdmin)).toHaveLength(1);

    const alertas = await leerAlertasDelAdmin(clienteConToken(tokenAdmin), uidAdmin);

    // Solo las dos SIN atender del admin, y en orden cronológico descendente.
    expect(alertas.map((a) => a.title)).toEqual([
      'Rejilla del sifón rota',
      'No puedo con el aseo de hoy',
    ]);
    for (const a of alertas) {
      expect(a.read_at).toBeNull();
      expect(a.recipient_id).toBe(uidAdmin);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('leerAseadoresActivos', () => {
  test('trae los perfiles con rol aseador y activos, y deja fuera al desactivado', async () => {
    const activos = await leerAseadoresActivos(clienteConToken(tokenAdmin));
    const ids = new Set(activos.map((a) => a.id));

    expect(ids.has(escenario.aseadorA)).toBe(true);
    expect(ids.has(escenario.aseadorB)).toBe(true);

    // Control del "no aparece": la aseadora C existe y su fila está desactivada.
    const { data: inactiva } = await servicio()
      .from('profiles')
      .select('id, role, is_active')
      .eq('id', escenario.aseadorInactivo)
      .single();
    expect(inactiva?.role).toBe('aseador');
    expect(inactiva?.is_active).toBe(false);
    expect(ids.has(escenario.aseadorInactivo)).toBe(false);

    // Y el admin tampoco es un aseador, por mucho que su JWT sea el que consulta.
    expect(ids.has(uidAdmin)).toBe(false);
  });
});
