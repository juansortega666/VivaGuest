import { randomUUID } from 'node:crypto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

import type { Database } from '@/lib/database.types';
import { publicEnv } from '@/lib/env';
import { NoAutorizado } from '@/lib/auth/guards';
import { mapDbError } from '@/lib/domain/errors';
import { formatFechaBog } from '@/lib/domain/dates';
import {
  leerAseo,
  limpiarAseos,
  sembrarEscenarioDeAseos,
  type EscenarioDeAseos,
} from '@/lib/test/aseos';
import { clienteAdminDePruebas } from '@/lib/test/clientes';

/**
 * EL CONTRATO DE AUTORIZACIÓN DE LAS OCHO RUTAS DE MUTACIÓN, CONTRA POSTGRES REAL.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * LO QUE MIDE ESTE ARCHIVO Y NINGUNA PRUEBA UNITARIA PUEDE MEDIR.
 *
 * `app/(admin)/operacion/_actions.test.ts` prueba, con dobles, que el guard es
 * la primera operación y que la RPC no se llega a invocar. Eso es la FORMA. Lo
 * que ninguna prueba con dobles puede probar es que un aseador que invoca la
 * ruta de verdad se topa con las DOS capas y que la fila objetivo queda intacta,
 * porque para eso hace falta un JWT real, la RLS real y las RPC reales.
 *
 * Y hay una segunda cosa, que es la que da valor al señuelo: qué TEXTO sale.
 * Los dos mensajes existen y son distintos:
 *
 *   con guard     -> el de `NoAutorizado`, que se produce SIN tocar la base
 *   sin guard     -> el de `mapDbError()` para `42501`, que se produce DESPUÉS
 *                    de que Postgres rechazara la llamada
 *
 * Si el guard desapareciera, el usuario seguiría viendo un mensaje en español y
 * la operación seguiría fallando: la frontera es `private.is_admin()` dentro de
 * cada RPC. Lo que se perdería es fallar temprano y no filtrar por la forma del
 * error. La distinción entre los dos textos NO es cosmética: es lo único que
 * demuestra que la defensa en profundidad está en el orden correcto. Por eso el
 * archivo primero AFIRMA que los dos textos son distintos, y solo después usa esa
 * diferencia para medir.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── LA ASIMETRÍA DE CÓDIGOS, Y ES DE SEGURIDAD ─────────────────────────────
 *
 * Las RPC de la migración 15 reparten así, y copiar la regla al revés convierte
 * un mensaje amable en una fuga de existencia de recursos:
 *
 *   `42501` cuando distinguir "no existe", "no es tuyo" y "todavía no es su día"
 *           sería un ORÁCULO DE ENUMERACIÓN. `mapDbError()` devuelve un mensaje
 *           que no nombra el recurso, a propósito.
 *   `P0001` cuando el llamador SÍ está autorizado y solo falla el estado del
 *           aseo. Ahí el mensaje puede y debe ser específico, porque no revela
 *           nada que el llamador no tuviera derecho a saber.
 *
 * ── CÓMO SE LE DA UNA SESIÓN A UNA SERVER ACTION EN UN TEST ────────────────
 *
 * `exigirAdmin()` construye su cliente con `lib/supabase/server.ts`, que lee las
 * cookies de la petición con `cookies()` de Next. Fuera de una petición eso no
 * existe, así que se sustituye la FÁBRICA (no el guard) por un cliente con la
 * sesión real de un usuario real. `getUser()` sigue yendo contra GoTrue y las
 * consultas siguen viajando con el JWT: la RLS y las guardas de las RPC actúan
 * exactamente igual que en producción. Lo único simulado es de dónde sale el
 * token.
 *
 * Requiere `npx supabase start` con el stack COMPLETO y `.env.local`.
 */

// ── Sustitución de la fábrica de cliente de servidor ──────────────────────────

const sesionActual = vi.hoisted(() => ({ access_token: '', refresh_token: '' }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY } = publicEnv();
    const c = createClient<Database>(
      NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    await c.auth.setSession({ ...sesionActual });
    return c;
  },
}));

// `revalidatePath` exige el almacén de peticion de Next, que fuera de una
// peticion no existe. No es lo que se mide acá.
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

const acciones = await import('@/app/(admin)/operacion/_actions');

const {
  confirmarAseo,
  reasignarAseo,
  crearAseoManual,
  reprogramarAseo,
  cerrarAseo,
  cancelarAseo,
  limpiarMarcaDeRevision,
  marcarAlertaAtendida,
} = acciones;

// ── Los dos textos, uno frente al otro ───────────────────────────────────────

const MENSAJE_DEL_GUARD = new NoAutorizado().message;
const MENSAJE_DE_LA_BASE = mapDbError({ code: '42501', message: 'no_autorizado' });

// ── Siembra ──────────────────────────────────────────────────────────────────

const SUFIJO = randomUUID().slice(0, 8);
const EMAIL_ADMIN = `int.actions.admin.${SUFIJO}@vivaguest.test`;
const EMAIL_ASEADOR = `int.actions.aseador.${SUFIJO}@vivaguest.test`;
const PASSWORD = `actions-${randomUUID()}`;

let escenario: EscenarioDeAseos;
let uidAdmin = '';
let uidAseador = '';
let sesionAdmin = { access_token: '', refresh_token: '' };
let sesionAseador = { access_token: '', refresh_token: '' };
/** Notificaciones sembradas por este archivo, para borrarlas y nada más. */
const alertasSembradas: string[] = [];

function servicio(): SupabaseClient<Database> {
  return clienteAdminDePruebas();
}

function comoAdmin() {
  Object.assign(sesionActual, sesionAdmin);
}

function comoAseador() {
  Object.assign(sesionActual, sesionAseador);
}

async function crearUsuario(email: string, rol: 'admin' | 'aseador', nombre: string) {
  const { data, error } = await servicio().auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    // El rol va en los DOS sitios: `app_metadata` viaja en el JWT y lo lee
    // `exigirAdmin()`; `user_metadata` es lo que lee `tg_handle_new_user` para
    // materializar el `public.profiles` que consulta `private.is_admin()`.
    app_metadata: { role: rol },
    user_metadata: { role: rol, full_name: nombre },
  });
  if (error || !data.user) throw new Error(`No se pudo crear ${email}: ${error?.message}`);

  const { data: s, error: e2 } = await servicio().auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (e2 || !s.session) throw new Error(`No se pudo iniciar sesión como ${email}: ${e2?.message}`);

  return {
    uid: data.user.id,
    sesion: { access_token: s.session.access_token, refresh_token: s.session.refresh_token },
  };
}

/** Una alerta del panel, sembrada con la clave de servicio: no hay grant de INSERT. */
async function sembrarAlerta(destinatario: string, titulo: string): Promise<string> {
  const { data, error } = await servicio()
    .from('notifications')
    .insert({
      recipient_id: destinatario,
      type: 'calendario_caido',
      title: titulo,
      body: `Cuerpo de ${titulo}`,
      url: '/operacion',
      payload: { origen: 'test', sufijo: SUFIJO },
    })
    .select('id')
    .single();

  if (error || !data) throw new Error(`No se pudo sembrar la alerta: ${error?.message}`);
  alertasSembradas.push(data.id);
  return data.id;
}

async function leerAlerta(id: string) {
  const { data, error } = await servicio()
    .from('notifications')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer la alerta ${id}: ${error.message}`);
  return data;
}

function fd(pares: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(pares)) f.set(k, v);
  return f;
}

beforeAll(async () => {
  escenario = await sembrarEscenarioDeAseos();

  const admin = await crearUsuario(EMAIL_ADMIN, 'admin', 'Admin De Actions');
  uidAdmin = admin.uid;
  sesionAdmin = admin.sesion;

  const aseador = await crearUsuario(EMAIL_ASEADOR, 'aseador', 'Aseadora De Actions');
  uidAseador = aseador.uid;
  sesionAseador = aseador.sesion;
});

afterAll(async () => {
  const admin = servicio();
  if (alertasSembradas.length > 0) {
    await admin.from('notifications').delete().in('id', alertasSembradas);
  }
  // Los aseos y apartamentos van primero: `properties.responsable_id` es
  // `on delete restrict` contra `profiles`.
  await limpiarAseos();
  if (uidAseador) await admin.auth.admin.deleteUser(uidAseador);
  if (uidAdmin) await admin.auth.admin.deleteUser(uidAdmin);
});

beforeEach(() => {
  comoAdmin();
});

// ════════════════════════════════════════════════════════════════════════════
// 0. EL CONTROL QUE HACE MEDIBLE AL SEÑUELO
// ════════════════════════════════════════════════════════════════════════════

test('CONTROL: el mensaje del guard y el de la base son textos DISTINTOS', () => {
  // Si alguien los unifica, este test se pone rojo ANTES de que los tests de
  // abajo dejen de distinguir nada y se conviertan en un falso verde: pasarían
  // igual con el guard borrado.
  expect(MENSAJE_DEL_GUARD).not.toBe(MENSAJE_DE_LA_BASE);
  expect(MENSAJE_DEL_GUARD.length).toBeGreaterThan(0);
});

// ════════════════════════════════════════════════════════════════════════════
// 1. UN ASEADOR CONTRA LAS OCHO RUTAS
// ════════════════════════════════════════════════════════════════════════════

describe('con el JWT de un aseador, las ocho rutas rechazan y no escriben', () => {
  test('las siete de mutación de aseo: mensaje del guard y fila intacta', async () => {
    comoAseador();

    const objetivos: ReadonlyArray<
      readonly [string, (p: null, f: FormData) => Promise<unknown>, () => FormData, string]
    > = [
      [
        'confirmarAseo',
        confirmarAseo,
        () => fd({ aseo_id: escenario.aseoSinConfirmar, huespedes: '4' }),
        escenario.aseoSinConfirmar,
      ],
      [
        'reasignarAseo',
        reasignarAseo,
        () =>
          fd({
            aseo_id: escenario.aseoPendiente,
            aseador_id: escenario.aseadorB,
            aseador_nombre: 'Aseadora B de escenario',
          }),
        escenario.aseoPendiente,
      ],
      [
        'reprogramarAseo',
        reprogramarAseo,
        () => fd({ aseo_id: escenario.aseoPendiente, fecha: escenario.fechas.enTresDias }),
        escenario.aseoPendiente,
      ],
      [
        'cerrarAseo',
        cerrarAseo,
        () => fd({ aseo_id: escenario.aseoPendiente }),
        escenario.aseoPendiente,
      ],
      [
        'cancelarAseo',
        cancelarAseo,
        () => fd({ aseo_id: escenario.aseoPendiente }),
        escenario.aseoPendiente,
      ],
      [
        'limpiarMarcaDeRevision',
        limpiarMarcaDeRevision,
        () => fd({ aseo_id: escenario.aseoPendiente }),
        escenario.aseoPendiente,
      ],
    ];

    for (const [nombre, accion, formData, idObjetivo] of objetivos) {
      const antes = await leerAseo(idObjetivo);

      const r = (await accion(null, formData())) as { ok: boolean; error: string };

      expect(r.ok, nombre).toBe(false);
      // El texto del GUARD, no el de la base. Es lo que demuestra que se cortó
      // antes de llegar a Postgres.
      expect(r.error, nombre).toBe(MENSAJE_DEL_GUARD);
      expect(r.error, nombre).not.toBe(MENSAJE_DE_LA_BASE);
      // Ni el código de Postgres ni el token de la excepción.
      expect(r.error, nombre).not.toMatch(/42501|P0001|no_autorizado/);

      // Y LA FILA NO SE MOVIÓ. Un mensaje correcto sobre una escritura que sí
      // ocurrió sería el peor de los resultados posibles.
      expect(await leerAseo(idObjetivo), nombre).toEqual(antes);
    }
  });

  test('crearAseoManual: rechaza y no deja ningún aseo nuevo', async () => {
    comoAseador();

    const { count: antes } = await servicio()
      .from('cleanings')
      .select('id', { count: 'exact', head: true })
      .eq('property_id', escenario.aptoGestionado);

    const r = (await crearAseoManual(
      null,
      fd({
        apartamento_id: escenario.aptoGestionado,
        fecha: escenario.fechas.enTresDias,
        tipo: 'emergencia',
        apartamento_nombre: 'Int Aseos Gestionado',
      }),
    )) as { ok: boolean; error: string };

    expect(r.ok).toBe(false);
    expect(r.error).toBe(MENSAJE_DEL_GUARD);

    const { count: despues } = await servicio()
      .from('cleanings')
      .select('id', { count: 'exact', head: true })
      .eq('property_id', escenario.aptoGestionado);

    expect(despues).toBe(antes);
  });

  test('marcarAlertaAtendida: rechaza y la alerta sigue sin atender', async () => {
    const alerta = await sembrarAlerta(uidAdmin, 'Calendario caído del aseador');
    comoAseador();

    const r = await marcarAlertaAtendida(alerta);

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toBe(MENSAJE_DEL_GUARD);
    expect((await leerAlerta(alerta))?.read_at).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. LA DISCIPLINA DE UNA SOLA COLUMNA, MEDIDA EN LA BASE (T-04-08)
// ════════════════════════════════════════════════════════════════════════════

describe('marcarAlertaAtendida escribe read_at y NADA más', () => {
  test('title, body, url y payload quedan idénticos', async () => {
    const alerta = await sembrarAlerta(uidAdmin, 'Alerta que el admin atiende');
    const antes = await leerAlerta(alerta);
    expect(antes?.read_at).toBeNull();

    comoAdmin();
    const r = await marcarAlertaAtendida(alerta);
    expect(r.ok).toBe(true);

    const despues = await leerAlerta(alerta);
    expect(despues?.read_at).not.toBeNull();

    // El grant de `notifications` es de TABLA y la policy acota FILAS, no
    // COLUMNAS: nada en Postgres impide que un `update` con el objeto entero
    // sobrescriba estas cuatro. La disciplina es de la action, y esto es lo que
    // la sostiene contra la base real.
    expect(despues?.title).toBe(antes?.title);
    expect(despues?.body).toBe(antes?.body);
    expect(despues?.url).toBe(antes?.url);
    expect(despues?.payload).toEqual(antes?.payload);
    expect(despues?.recipient_id).toBe(antes?.recipient_id);
    expect(despues?.type).toBe(antes?.type);
    expect(despues?.created_at).toBe(antes?.created_at);
  });

  test('la notificación de OTRO destinatario no cambia ninguna fila', async () => {
    // Sembrada para el ASEADOR. El admin la conoce por id, que es todo lo que
    // hace falta para invocar la action: el id no autoriza nada.
    const ajena = await sembrarAlerta(uidAseador, 'Alerta que no es del admin');
    const antes = await leerAlerta(ajena);

    comoAdmin();
    const r = await marcarAlertaAtendida(ajena);

    // `notifications_own_update` la deja fuera con `using` y `with check`. El
    // `update` no levanta error: afecta a CERO filas. Devolverlo como éxito
    // dejaría al panel con su estado optimista aplicado sobre nada.
    expect(r.ok).toBe(false);
    expect(await leerAlerta(ajena)).toEqual(antes);
    expect((await leerAlerta(ajena))?.read_at).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. ASEO-07 CONTRA EL ÍNDICE REAL
// ════════════════════════════════════════════════════════════════════════════

test('crearAseoManual sobre una fecha ocupada devuelve el mensaje interpolado y campo fecha', async () => {
  comoAdmin();

  // `fechas.manana` ya tiene el aseo sin confirmar del escenario, y el índice
  // `cleanings_one_active_per_property_date` es parcial sobre los no cancelados.
  const fecha = escenario.fechas.manana;

  const r = (await crearAseoManual(
    null,
    fd({
      apartamento_id: escenario.aptoGestionado,
      fecha,
      tipo: 'repaso',
      apartamento_nombre: 'Bogotá 3',
    }),
  )) as { ok: boolean; error: string; campo?: string };

  expect(r.ok).toBe(false);
  expect(r.error).toBe(
    `Ya hay un aseo activo para Bogotá 3 el ${formatFechaBog(fecha)}. Reprograma el que existe o cancélalo antes de crear otro.`,
  );
  // Con `campo`, el diálogo lo pinta INLINE bajo el input de fecha y el admin lo
  // corrige sin cerrar nada (UI-SPEC §12.6).
  expect(r.campo).toBe('fecha');
  // Nunca el texto crudo de Postgres.
  expect(r.error).not.toContain('cleanings_one_active_per_property_date');
  expect(r.error).not.toContain('duplicate key');
  expect(r.error).not.toContain('23505');
});

// ════════════════════════════════════════════════════════════════════════════
// 4. EL ADMIN SÍ PASA, Y EL P0001 LLEGA EN ESPAÑOL
// ════════════════════════════════════════════════════════════════════════════

describe('con el JWT de un admin', () => {
  test('cerrarAseo sobre un aseo ya terminado devuelve el hint en español, no el token', async () => {
    comoAdmin();
    const r = (await cerrarAseo(null, fd({ aseo_id: escenario.aseoTerminado }))) as {
      ok: boolean;
      error: string;
    };

    expect(r.ok).toBe(false);
    // `P0001`: el admin SÍ está autorizado y lo que falla es el estado. El
    // mensaje puede ser específico sin filtrar nada.
    expect(r.error).not.toBe(MENSAJE_DEL_GUARD);
    expect(r.error).not.toBe(MENSAJE_DE_LA_BASE);
    expect(r.error).not.toMatch(/aseo_no_cerrable|P0001/);
    // Español de verdad, no un identificador de máquina.
    expect(r.error).toMatch(/aseo/i);
  });

  test('reasignarAseo mueve el aseo de aseadora y lo dice sin sugerir que se avisó', async () => {
    comoAdmin();
    const r = (await reasignarAseo(
      null,
      fd({
        aseo_id: escenario.aseoPendiente,
        aseador_id: escenario.aseadorB,
        aseador_nombre: 'Aseadora B de escenario',
      }),
    )) as { ok: boolean; mensaje: string };

    expect(r.ok).toBe(true);
    expect(r.mensaje).toBe('El aseo quedó asignado a Aseadora B de escenario.');
    // Confirmar y reasignar escriben el evento en la cola, pero NADIE LA DRENA
    // hasta la Fase 5. Decir que se avisó sería mentir.
    expect(r.mensaje.toLowerCase()).not.toMatch(/notific|avis|le lleg|push/);

    expect((await leerAseo(escenario.aseoPendiente))?.aseador_id).toBe(escenario.aseadorB);
  });

  test('reasignar a una aseadora desactivada falla con el motivo, y no mueve el aseo', async () => {
    comoAdmin();
    const antes = await leerAseo(escenario.aseoPendiente);

    const r = (await reasignarAseo(
      null,
      fd({
        aseo_id: escenario.aseoPendiente,
        aseador_id: escenario.aseadorInactivo,
        aseador_nombre: 'Aseadora C de escenario',
      }),
    )) as { ok: boolean; error: string };

    expect(r.ok).toBe(false);
    expect(r.error).not.toMatch(/aseador_invalido|P0001/);
    expect(await leerAseo(escenario.aseoPendiente)).toEqual(antes);
  });
});
