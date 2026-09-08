import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, expect, test } from 'vitest';

import type { Database } from '@/lib/database.types';
import { clienteAdminDePruebas, clienteAnonimo, clienteConToken } from '@/lib/test/clientes';

/**
 * PLAT-04 — LA REVOCACIÓN DE ACCESO ES INMEDIATA. Criterio 4 del ROADMAP.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESTE ES EL ARCHIVO QUE SOSTIENE EL CRITERIO MÁS DURO DE LA FASE, y la forma
 * en que está escrito es tan importante como lo que comprueba.
 *
 * La prueba NO se puede hacer con un login nuevo. Un aseador desactivado que
 * intenta entrar desde cero falla por razones obvias, y un test así pasaría
 * incluso con la revocación completamente rota. Lo que hay que demostrar es lo
 * contrario: que un token YA EMITIDO, sin expirar, deja de servir.
 *
 * Por eso el `access_token` se guarda ANTES de la baja y todas las consultas de
 * después se emiten CON ESE MISMO TOKEN. `clienteConToken` (plan 02-04) existe
 * exactamente para esto: fija el JWT en el header `Authorization` y desactiva
 * `autoRefreshToken`, para que la librería no lo renueve por detrás y convierta
 * la prueba en otra cosa.
 *
 * Y hay un control que tampoco es opcional: ANTES de la baja se comprueba que el
 * aseador SÍ lee sus datos. Sin esa aserción previa, "0 filas después" también
 * lo cumpliría un aseador que nunca tuvo acceso a nada, y el test sería un verde
 * que no mide nada.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Las dos capas que se ejercen aquí, medidas en 02-RESEARCH §6.2:
 *
 *   1. `profiles.is_active = false` ⇒ `private.is_active_cleaner()` da `false`
 *      ⇒ TODA policy del aseador deja de casar ⇒ 0 filas, en la siguiente
 *      sentencia SQL. Es la única capa que revoca DATOS.
 *   2. `ban_duration` ⇒ `getUser()` pasa a 403 `user_banned` ⇒ el middleware
 *      rebota a `/login`. Es la capa que hace que el aseador lo VEA.
 *
 * Este archivo no invoca `fijarActivacionAseador`: una Server Action arrastra
 * `next/cache` y el almacén de cookies de una petición, que fuera de Next no
 * existen (misma razón que documenta `alta-aseador.integration.test.ts`). Lo que
 * se mide es la capa que la action delega, operación por operación, para poder
 * ejercer los estados INTERMEDIOS que la action hace imposibles: media baja y
 * media reactivación. Que la action de verdad haga las dos mitades lo prueba
 * `e2e/aseadores-baja.spec.ts` contra el navegador.
 *
 * Requiere `npx supabase start` y `.env.local` con los valores del stack local.
 */

const SUFIJO = randomUUID().slice(0, 8);
const EMAIL = `int.revocacion.${SUFIJO}@vivaguest.test`;
const PASSWORD = `revocacion-${randomUUID()}`;
const NOMBRE = 'Aseadora De La Baja';

/** ~100 años. GoTrue no tiene "ban indefinido": tiene duración. */
const BAN_LARGO = '876000h';

let uid = '';
/** El `access_token` emitido ANTES de la baja. El corazón de este archivo. */
let tokenVivo = '';
let refreshVivo = '';
let idAseo: string | null = null;

/** `today_bog()`: Bogotá es UTC-5 fijo, sin DST. La suite corre con TZ=UTC. */
function hoyEnBogota(): string {
  return new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

beforeAll(async () => {
  const admin = clienteAdminDePruebas();

  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    app_metadata: { role: 'aseador' },
    user_metadata: { role: 'aseador', full_name: NOMBRE },
  });
  if (error) throw new Error(`No se pudo crear la aseadora de prueba: ${error.message}`);
  uid = data.user.id;

  // ── El aseador necesita algo QUE PERDER ──────────────────────────────────
  // Ser `responsable_id` de un apartamento NO da acceso de lectura: la policy
  // `properties_cleaner_select` acota por `private.my_property_ids()`, que sale
  // de tener un aseo vivo (`pendiente`/`en_curso`, gestionado, en la ventana de
  // hoy-1 a hoy+7). Sin sembrar el aseo, este test mediría "0 filas antes y 0
  // después", que es un verde vacío.
  //
  // Se filtra por `gestion_vivaguest` y NO por `is_active`: `my_property_ids()`
  // no mira `properties.is_active`, mira que el ASEO sea gestionado. Y hoy los 34
  // apartamentos gestionados de la semilla están inactivos (son placeholders sin
  // tarifas ni responsable, y `props_active_requires_rates` no los deja activar),
  // así que exigir `is_active` aquí dejaría el test sin nada que sembrar.
  const { data: apartamento, error: errorApto } = await admin
    .from('properties')
    .select('id')
    .eq('gestion_vivaguest', true)
    .limit(1)
    .single();
  if (errorApto) throw new Error(`No hay apartamento gestionado que sembrar: ${errorApto.message}`);

  // `is_managed`, `hora_limite` y `state` los rellena `tg_cleanings_snapshot()`
  // (BEFORE INSERT, migración 05). NO se pasan a mano a propósito: pasarlos sería
  // inventar el snapshot que el trigger existe para calcular, y la migración 04
  // deja escrito que esas columnas nacen sin default justamente para que un fallo
  // del trigger no se convierta en un verde accidental.
  //
  // El cast existe porque `supabase gen types` sale del DDL y un trigger BEFORE no
  // aparece en la nulabilidad de una columna: los tipos generados marcan
  // `hora_limite` e `is_managed` como obligatorias aunque en tiempo de ejecución
  // no lo sean. El `satisfies` de al lado acota el hueco: las cuatro claves que sí
  // se pasan siguen comprobadas contra el tipo real, así que un nombre de columna
  // mal escrito o un `origin` inválido siguen siendo error de compilación.
  const filaDeAseo = {
    property_id: apartamento.id,
    origin: 'manual',
    scheduled_date: hoyEnBogota(),
    aseador_id: uid,
  } satisfies Partial<Database['public']['Tables']['cleanings']['Insert']>;

  const { data: aseo, error: errorAseo } = await admin
    .from('cleanings')
    .insert(filaDeAseo as Database['public']['Tables']['cleanings']['Insert'])
    .select('id')
    .single();
  if (errorAseo) throw new Error(`No se pudo sembrar el aseo: ${errorAseo.message}`);
  idAseo = aseo.id;

  // ── EL LOGIN REAL, y el token que se guarda para todo lo que sigue ───────
  const { data: sesion, error: errorLogin } = await clienteAnonimo().auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  });
  if (errorLogin || !sesion.session) {
    throw new Error(`No se pudo iniciar sesión: ${errorLogin?.message}`);
  }
  tokenVivo = sesion.session.access_token;
  refreshVivo = sesion.session.refresh_token;
});

afterAll(async () => {
  const admin = clienteAdminDePruebas();
  // El aseo primero: `cleanings.aseador_id` es `on delete restrict`, así que con
  // el aseo en pie el borrado del usuario falla y el stack local (COMPARTIDO
  // entre worktrees) se queda con basura que envenena la corrida siguiente.
  if (idAseo) await admin.from('cleanings').delete().eq('id', idAseo);
  if (uid) await admin.auth.admin.deleteUser(uid);
});

// ─────────────────────────────────────────────────────────────────────────────
// CONTROL. Sin esta aserción, todas las de abajo son verdes vacíos.
// ─────────────────────────────────────────────────────────────────────────────

test('CONTROL: antes de la baja, el token vivo SÍ lee apartamentos', async () => {
  const { data, error } = await clienteConToken(tokenVivo).from('properties').select('id');

  expect(error).toBeNull();
  expect(data?.length ?? 0).toBeGreaterThan(0);
});

test('CONTROL: y antes de la baja, `getUser()` con ese token responde OK', async () => {
  const { data, error } = await clienteAnonimo().auth.getUser(tokenVivo);

  expect(error).toBeNull();
  expect(data.user?.id).toBe(uid);
});

// ─────────────────────────────────────────────────────────────────────────────
// LA API QUE NO EXISTE. Se ejerce para que la afirmación sea ejecutable.
// ─────────────────────────────────────────────────────────────────────────────

test('`admin.signOut(uid, scope)` NO revoca nada: su primer argumento es un JWT', async () => {
  // `research/ARCHITECTURE.md` y `02-CONTEXT.md` documentan la baja como
  // `auth.admin.signOut(id, 'global')`. La firma real es `signOut(jwt, scope)` y
  // hace un POST a `/logout` con ese primer argumento como bearer. Pasarle un uid
  // es pasarle un token inválido.
  //
  // Este test es la versión EJECUTABLE de ese párrafo: si algún día Supabase
  // añadiera de verdad una sobrecarga por uid, este test se pone rojo y sabremos
  // que la nota del código dejó de ser cierta.
  const admin = clienteAdminDePruebas();
  const { error } = await admin.auth.admin.signOut(uid, 'global');

  // Falla, porque `uid` no es un JWT.
  expect(error).not.toBeNull();

  // Y lo que importa: el token del aseador SIGUE SIRVIENDO. Construir la baja
  // sobre esta llamada dejaría el acceso intacto.
  const { data } = await clienteConToken(tokenVivo).from('properties').select('id');
  expect(data?.length ?? 0).toBeGreaterThan(0);
});

// ─────────────────────────────────────────────────────────────────────────────
// CAPA 1 — LOS DATOS
// ─────────────────────────────────────────────────────────────────────────────

test('bajar SOLO `is_active`, sin `deactivated_at`, revienta con 23514', async () => {
  // `profiles_deactivation_coherent` exige `is_active = (deactivated_at is null)`.
  // Es la razón por la que las dos columnas se escriben siempre juntas, y este
  // test es lo que impide que alguien "simplifique" el update a una sola.
  const { error } = await clienteAdminDePruebas()
    .from('profiles')
    .update({ is_active: false })
    .eq('id', uid);

  expect(error?.code).toBe('23514');
  expect(error?.message).toContain('profiles_deactivation_coherent');
});

test('LA ASERCIÓN CENTRAL: token vivo + desactivación ⇒ 0 filas, no un error', async () => {
  const { error } = await clienteAdminDePruebas()
    .from('profiles')
    .update({ is_active: false, deactivated_at: new Date().toISOString() })
    .eq('id', uid);
  expect(error).toBeNull();

  // MISMO token, sin expirar, sin refrescar: el que se guardó antes de la baja.
  const { data, error: errorConsulta } = await clienteConToken(tokenVivo)
    .from('properties')
    .select('id');

  // CERO FILAS, Y SIN ERROR. La distinción importa: un `42501` también sería
  // "no pudo leer", pero por una razón distinta (falta de grant) que podría
  // aparecer por accidente y dar un verde equivocado. Lo que ocurre de verdad es
  // que `private.is_active_cleaner()` devuelve `false` y la policy deja de casar,
  // así que PostgREST devuelve una lista vacía.
  expect(errorConsulta).toBeNull();
  expect(data).toEqual([]);
});

test('la revocación de datos alcanza a TODAS sus policies, no solo a properties', async () => {
  // `room_types` lo lee cualquier aseador activo sin más condición que
  // `is_active_cleaner()`. Que también dé 0 filas demuestra que lo que se cayó es
  // la función compartida, y no una policy concreta.
  const { data, error } = await clienteConToken(tokenVivo).from('room_types').select('id');

  expect(error).toBeNull();
  expect(data).toEqual([]);
});

test('pero sigue viendo su PROPIO perfil, para que la UI pueda explicarle por qué', async () => {
  // `profiles_own_select` NO exige `is_active_cleaner()`, y es deliberado
  // (migración 08): una pantalla vacía sin causa es peor que una que dice
  // "tu cuenta está desactivada".
  const { data, error } = await clienteConToken(tokenVivo).from('profiles').select('id, is_active');

  expect(error).toBeNull();
  expect(data).toHaveLength(1);
  expect(data?.[0]?.is_active).toBe(false);
});

// ─────────────────────────────────────────────────────────────────────────────
// CAPA 2 — LA SESIÓN
// ─────────────────────────────────────────────────────────────────────────────

test('token vivo + ban ⇒ `getUser()` devuelve `user_banned`', async () => {
  const { error } = await clienteAdminDePruebas().auth.admin.updateUserById(uid, {
    ban_duration: BAN_LARGO,
  });
  expect(error).toBeNull();

  // El MISMO token de antes. No ha expirado; lo que cambió es el usuario.
  const { data, error: errorUser } = await clienteAnonimo().auth.getUser(tokenVivo);

  expect(errorUser?.code).toBe('user_banned');
  expect(data.user).toBeNull();
});

test('el refresh tampoco salva: `refreshSession()` devuelve `user_banned`', async () => {
  const { error } = await clienteAnonimo().auth.refreshSession({
    refresh_token: refreshVivo,
  });

  expect(error?.code).toBe('user_banned');
});

test('y un login nuevo falla igual', async () => {
  const { error } = await clienteAnonimo().auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  });

  expect(error?.code).toBe('user_banned');
});

test('POR QUÉ NO SE USA `getClaims()`: con el token baneado responde OK', async () => {
  // La documentación de Supabase recomienda `getClaims()` sobre `getUser()`.
  // Para este producto es la respuesta equivocada y esta es la medición que lo
  // demuestra: `getClaims()` verifica la FIRMA del JWT en local y no le pregunta
  // nada al servidor de Auth, así que un usuario baneado le sigue pareciendo
  // válido. `getUser()` da 403 sobre el mismo token, dos tests más arriba.
  //
  // SI ESTE TEST SE PONE ROJO ALGÚN DÍA, es una buena noticia: significaría que
  // `getClaims()` empezó a comprobar la revocación y se puede reconsiderar la
  // decisión de `02-CONTEXT.md` y del middleware.
  const { data, error } = await clienteAnonimo().auth.getClaims(tokenVivo);

  expect(error).toBeNull();
  expect(data?.claims?.sub).toBe(uid);
});

// ─────────────────────────────────────────────────────────────────────────────
// LA TRAMPA DE LA REACTIVACIÓN — las dos mitades, por separado
// ─────────────────────────────────────────────────────────────────────────────

test('reactivar SOLO `profiles` deja al aseador marcado Activo y sin poder entrar', async () => {
  const { error } = await clienteAdminDePruebas()
    .from('profiles')
    .update({ is_active: true, deactivated_at: null })
    .eq('id', uid);
  expect(error).toBeNull();

  // La lista del admin ya diría `Activo`…
  const { data: perfil } = await clienteAdminDePruebas()
    .from('profiles')
    .select('is_active')
    .eq('id', uid)
    .single();
  expect(perfil?.is_active).toBe(true);

  // …y la persona SIGUE SIN PODER ENTRAR. Éste es el bug silencioso, y es la
  // razón entera de que `fijarActivacionAseador` sea UNA función con un booleano
  // en vez de dos funciones separadas.
  const { error: errorLogin } = await clienteAnonimo().auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  });
  expect(errorLogin?.code).toBe('user_banned');
});

test('solo al levantar TAMBIÉN el ban la reactivación es real', async () => {
  const { error } = await clienteAdminDePruebas().auth.admin.updateUserById(uid, {
    ban_duration: 'none',
  });
  expect(error).toBeNull();

  const { data, error: errorLogin } = await clienteAnonimo().auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  });

  expect(errorLogin).toBeNull();
  expect(data.session?.access_token).toBeTruthy();

  // Y con el token NUEVO vuelve a leer sus apartamentos: la reactivación
  // restauró las dos capas, no solo la de la sesión.
  const { data: apartamentos } = await clienteConToken(data.session!.access_token)
    .from('properties')
    .select('id');
  expect(apartamentos?.length ?? 0).toBeGreaterThan(0);
});
