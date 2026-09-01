'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { NoAutorizado, exigirAdmin } from '@/lib/auth/guards';
import type { ResultadoAccion } from '@/lib/domain/acciones';
import { esquemaCrearAseador } from '@/lib/domain/aseador.schema';
import { mapAuthError, mapDbError } from '@/lib/domain/errors';
import { generarPasswordTemporal } from '@/lib/domain/password';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Alta de cuentas de aseador (ASEADOR-01, UI-SPEC §11.2).
 *
 * ESTE ARCHIVO FIJA EL PATRÓN QUE REPITEN 02-09, 02-10 Y 02-14. El orden de las
 * tres primeras operaciones de `crearAseador` no es estilístico:
 *
 *   1. `exigirAdmin()`      — un Server Action es un endpoint HTTP PÚBLICO
 *   2. `safeParse()`        — el mínimo de 12 que la Admin API no aplica
 *   3. `createAdminClient()` — SOLO entonces el cliente que salta RLS
 *
 * Invertir 1 y 3 convierte esta action en una escalada de privilegios de una
 * línea: cualquiera con el id de action y un `FormData` crearía cuentas. Que el
 * botón solo se renderice dentro del route group `(admin)` no autoriza nada.
 *
 * SOBRE LA CLAVE DE SERVICIO: se lee en `lib/supabase/admin.ts` y en ningún otro
 * sitio. El nombre literal de esa variable de entorno NO se escribe en este
 * archivo, ni siquiera en un comentario: el guardarraíl 1 de
 * `scripts/ci/check-service-role.sh` hace grep de ese token y un comentario que lo
 * cite rompe el build. Pasó dos veces en la Fase 1.
 */

/**
 * Retorno de `crearAseador`. Es `ResultadoAccion` de `lib/domain/acciones.ts` más
 * el bloque `entrega`, y la extensión es la razón de ser de esta acción:
 *
 * LA CONTRASEÑA VIAJA AQUÍ Y EN NINGÚN OTRO CANAL. No en la URL (queda en el
 * historial del navegador y en los logs del CDN), no en una cookie, no en un
 * `redirect` con query param, y no en `profiles`, ni en un log, ni en
 * `notifications`. Existe en memoria durante esta ejecución, viaja en la respuesta
 * de la action, se muestra una vez en el diálogo y muere ahí.
 *
 * `lib/auth/alta-aseador.integration.test.ts` busca la cadena en la fila de
 * `profiles` serializada entera y exige no encontrarla (T-02-36).
 */
export type ResultadoCrearAseador =
  | {
      ok: true;
      mensaje: string;
      entrega: { nombre: string; email: string; password: string };
    }
  | { ok: false; error: string; campo?: string };

/**
 * Devuelve una contraseña temporal nueva para el botón `Generar` del diálogo.
 *
 * Lleva guard aunque solo produzca bytes aleatorios: es un endpoint HTTP público
 * como cualquier otra action, y no hay ninguna razón para dejar abierto un
 * generador que consume entropía a quien no ha iniciado sesión.
 *
 * Se genera en el SERVIDOR y no en el navegador para que el valor que se muestra
 * sea exactamente el que se va a guardar. Por eso el campo del formulario es de
 * solo lectura.
 */
export async function generarPassword(): Promise<string> {
  await exigirAdmin();
  return generarPasswordTemporal();
}

export async function crearAseador(
  _prev: ResultadoCrearAseador | null,
  formData: FormData,
): Promise<ResultadoCrearAseador> {
  // ── 1. GUARD, ANTES QUE NADA ────────────────────────────────────────────────
  try {
    await exigirAdmin();
  } catch (e) {
    if (e instanceof NoAutorizado) return { ok: false, error: e.message };
    throw e;
  }

  // ── 2. VALIDACIÓN ───────────────────────────────────────────────────────────
  // El mínimo de 12 caracteres se impone AQUÍ. Medido (02-RESEARCH §6.1):
  // `auth.admin.createUser` acepta una contraseña de 8 pese a
  // `minimum_password_length = 12` en `config.toml`, porque ese límite lo aplica
  // el flujo de signup y esta es la Admin API.
  const parseado = esquemaCrearAseador.safeParse({
    full_name: formData.get('full_name'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    password: formData.get('password'),
  });

  if (!parseado.success) {
    const problema = parseado.error.issues[0];
    return {
      ok: false,
      error: problema.message,
      // Con `campo` el error se pinta inline bajo ese input (UI-SPEC §9.4).
      campo: typeof problema.path[0] === 'string' ? problema.path[0] : undefined,
    };
  }

  const datos = parseado.data;

  // ── 3. SOLO AHORA, EL CLIENTE ADMINISTRATIVO ────────────────────────────────
  const admin = createAdminClient();

  const { error } = await admin.auth.admin.createUser({
    email: datos.email,
    password: datos.password,
    // Sin esto GoTrue exige confirmar por correo y el aseador no podría entrar
    // con la contraseña que se le acaba de dictar.
    email_confirm: true,

    // EL ROL SE ESCRIBE EN LOS DOS SITIOS, Y CADA UNO TIENE SU RAZÓN:
    //
    //  - `app_metadata.role` viaja dentro del JWT y es lo que lee el middleware
    //    para rutear. Es el único seguro: el usuario NO lo puede escribir.
    //    Medido (02-RESEARCH §2.1): un aseador SÍ puede ponerse
    //    `user_metadata.role = 'admin'` con `updateUser()`, y `app_metadata`
    //    queda intacto.
    //
    //  - `user_metadata.role` es lo que lee `tg_handle_new_user` (migración 03,
    //    `raw_user_meta_data ->> 'role'`) para materializar `public.profiles`.
    //    Sin él, el perfil nace con el rol por defecto.
    //
    // El valor es un LITERAL del código y nunca un campo del formulario
    // (T-02-35): `esquemaCrearAseador` ni siquiera declara una clave `role`, así
    // que un `role=admin` metido a mano en el `FormData` se descarta al parsear.
    app_metadata: { role: 'aseador' },
    user_metadata: {
      role: 'aseador',
      full_name: datos.full_name,
      phone: datos.phone,
    },
  });

  if (error) {
    return {
      ok: false,
      error: mapAuthError(error),
      // `email_exists` es un error DE CAMPO: el admin tiene que corregir el email
      // que escribió, así que va inline bajo ese input y no a un toast.
      campo: error.code === 'email_exists' ? 'email' : undefined,
    };
  }

  // NO SE INSERTA EL PERFIL A MANO. Medido: tras `createUser`, `public.profiles`
  // sale con `role: 'aseador'`, `full_name`, `phone`, `is_active: true` y
  // `deactivated_at: null`. El trigger de la migración 03 ya lo hizo.

  // Para que la fila nueva aparezca en la tabla de §11.1 sin recargar a mano.
  revalidatePath('/aseadores');

  // NO HAY RECUPERACIÓN DE CONTRASEÑA EN ESTA FASE (deuda 4 del UI-SPEC). Si el
  // aseador la pierde, la salida sería `updateUserById(uid, { password })`, pero
  // eso NO está en el alcance y no se construye sin que alguien lo pida. Queda
  // escrito para que exista el rastro.
  return {
    ok: true,
    mensaje: `Cuenta creada para ${datos.full_name}.`,
    entrega: {
      nombre: datos.full_name,
      email: datos.email,
      password: datos.password,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// BAJA Y REACTIVACIÓN (ASEADOR-02, PLAT-04, UI-SPEC §11.3)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Los tres conteos que el diálogo de baja muestra al abrirse (UI-SPEC §11.3).
 *
 * `responsableDeActivos` es el que decide si aparece el bloque ámbar: son los
 * apartamentos que se quedan literalmente sin responsable. Donde el aseador solo
 * es suplente, el responsable sigue ahí, así que esos no entran.
 */
export type ConsecuenciasDeBaja = {
  responsableDe: number;
  suplenteEn: number;
  responsableDeActivos: number;
};

/** El uid llega del cliente: se valida como uuid antes de tocar nada. */
const esquemaUid = z.uuid('Identificador de aseador inválido.');

/**
 * Conteos reales para el diálogo de baja. NO se estiman.
 *
 * SE CONSULTA CON EL CLIENTE DEL USUARIO, no con la fábrica administrativa, y es
 * deliberado: `properties` es legible por el admin con su propio JWT vía
 * `properties_admin_all` (medido: 39 filas, 02-RESEARCH §7.2). Saltarse la RLS
 * para contar filas que el llamador ya puede leer es privilegio gratis.
 *
 * `head: true` con `count: 'exact'`: el servidor devuelve el conteo en la cabecera
 * `Content-Range` y ni una sola fila de cuerpo.
 */
export async function consecuenciasDeBaja(uid: string): Promise<ConsecuenciasDeBaja> {
  const { supabase } = await exigirAdmin();

  const id = esquemaUid.parse(uid);

  const contar = async (columna: 'responsable_id' | 'suplente_id', soloActivos = false) => {
    let consulta = supabase
      .from('properties')
      .select('id', { count: 'exact', head: true })
      .eq(columna, id);
    if (soloActivos) consulta = consulta.eq('is_active', true);

    const { count, error } = await consulta;
    // Tragarse el error y devolver 0 pintaría un diálogo que dice "esto no afecta
    // a nadie" cuando lo que pasó es que la consulta falló. El admin desactivaría
    // creyendo que no rompe nada.
    if (error) throw new Error(mapDbError(error));
    return count ?? 0;
  };

  const [responsableDe, suplenteEn, responsableDeActivos] = await Promise.all([
    contar('responsable_id'),
    contar('suplente_id'),
    contar('responsable_id', true),
  ]);

  return { responsableDe, suplenteEn, responsableDeActivos };
}

/**
 * Activa o desactiva la cuenta de un aseador (ASEADOR-02, PLAT-04).
 *
 * ── POR QUÉ ES UNA SOLA FUNCIÓN CON UN BOOLEANO ──────────────────────────────
 * Escribir `desactivarAseador` y `reactivarAseador` por separado es exactamente
 * cómo alguien implementa una de las dos mitades y no la otra. Y la mitad que se
 * olvida NO da error: deja al aseador marcado `Activo` en la lista y sin poder
 * entrar, o al revés. Con una sola función, llamarla a medias es imposible.
 *
 * ── LAS DOS CAPAS, Y NINGUNA SOBRA (02-RESEARCH §6.2, medido) ────────────────
 *
 *   Capa 1 · `profiles.is_active = false`
 *     `private.is_active_cleaner()` devuelve `false` ⇒ TODA policy del aseador
 *     deja de casar ⇒ 0 filas en cualquier consulta, aunque su token siga vivo.
 *     Latencia: inmediata, en la siguiente sentencia SQL. Es la ÚNICA capa que de
 *     verdad revoca datos.
 *
 *   Capa 2 · `ban_duration`
 *     `getUser()` del middleware pasa a 403 `user_banned` ⇒ la siguiente
 *     navegación rebota a `/login`.
 *     Latencia: la siguiente navegación. Es la capa que hace que el aseador VEA
 *     que perdió el acceso.
 *
 * Sin la capa 1, un token vivo seguiría leyendo datos hasta que expire. Sin la
 * capa 2, el aseador se queda mirando una pantalla vacía sin entender por qué.
 *
 * ── LA API QUE NO EXISTE ────────────────────────────────────────────────────
 * `research/ARCHITECTURE.md` y `02-CONTEXT.md` documentan una llamada de cierre de
 * sesión administrativa con la forma `(uid, 'global')`. ESA FIRMA NO EXISTE. La
 * real toma el JWT DEL USUARIO como primer argumento y hace un POST a `/logout`
 * con ese token como bearer; el admin que da de baja a otra persona no lo tiene.
 * Verificado en el `.d.ts` y en el `.js` de `@supabase/auth-js` instalado aquí. Y
 * aunque se tuviera el JWT, invocarla DESPUÉS de banear devuelve `403 User is
 * banned`. No se llama. Este párrafo está escrito para que nadie la reintroduzca
 * después de leer aquellos dos documentos.
 *
 * ── `deactivated_at` NO ES OPCIONAL ─────────────────────────────────────────
 * El CHECK `profiles_deactivation_coherent` de la migración 03 exige
 * `is_active = (deactivated_at is null)`. Un `update ... set is_active = false` a
 * secas revienta con `23514`, medido en el plan 02-07. Las dos columnas se
 * escriben SIEMPRE juntas, y además esa columna es el único rastro de auditoría de
 * la baja (T-02-45): por eso el toast tampoco ofrece "Deshacer".
 */
export async function fijarActivacionAseador(
  uid: string,
  activo: boolean,
): Promise<ResultadoAccion> {
  // ── 1. GUARD, ANTES QUE NADA ────────────────────────────────────────────────
  try {
    await exigirAdmin();
  } catch (e) {
    if (e instanceof NoAutorizado) return { ok: false, error: e.message };
    throw e;
  }

  // ── 2. VALIDACIÓN ───────────────────────────────────────────────────────────
  const parseado = esquemaUid.safeParse(uid);
  if (!parseado.success) {
    return { ok: false, error: parseado.error.issues[0].message };
  }
  const id = parseado.data;

  // ── 3. SOLO AHORA, EL CLIENTE ADMINISTRATIVO ────────────────────────────────
  // Hace falta para `updateUserById`: la Admin API de GoTrue no acepta el JWT del
  // admin de la aplicación, que para GoTrue es un usuario cualquiera. La escritura
  // sobre `profiles` sí podría ir con el cliente del usuario, pero las dos mitades
  // van con el mismo a propósito: media operación con un cliente y media con otro
  // es la forma de que una falle por RLS y la otra no, y el estado quede partido
  // sin que el mensaje lo explique.
  const admin = createAdminClient();

  // ── 4a. CAPA 1: LOS DATOS ───────────────────────────────────────────────────
  // Las DOS columnas juntas, por `profiles_deactivation_coherent`.
  const { data: filas, error: errorPerfil } = await admin
    .from('profiles')
    .update({
      is_active: activo,
      deactivated_at: activo ? null : new Date().toISOString(),
    })
    .eq('id', id)
    // `role = 'aseador'` NO es decorativo: acota esta action a las cuentas que la
    // pantalla desde la que se invoca puede listar. Sin el filtro, un uid de admin
    // pasado a mano se banearía a sí mismo, y con UN SOLO admin en el sistema eso
    // deja el producto sin ninguna forma de reactivar a nadie desde la aplicación:
    // haría falta entrar a la base a mano. Cuesta una línea y convierte ese
    // escenario en 0 filas afectadas, ANTES de tocar GoTrue.
    .eq('role', 'aseador')
    .select('full_name');

  if (errorPerfil) {
    return { ok: false, error: mapDbError(errorPerfil) };
  }

  // 0 filas = el uid no existe, o existe y no es un aseador. Se corta AQUÍ, sin
  // haber tocado la sesión de nadie.
  if (!filas || filas.length === 0) {
    return { ok: false, error: 'No se encontró el registro solicitado.' };
  }

  const nombre = filas[0].full_name;

  // ── 4b. CAPA 2: LA SESIÓN ───────────────────────────────────────────────────
  // '876000h' son ~100 años: GoTrue no tiene "ban indefinido", tiene duración.
  // 'none' es el valor que LEVANTA el ban, y sin él la reactivación es media
  // reactivación: la lista diría `Activo` y la persona seguiría sin poder entrar.
  // Medido en 02-RESEARCH §6.2 y anclado en `revocacion.integration.test.ts`.
  const { error: errorBan } = await admin.auth.admin.updateUserById(id, {
    ban_duration: activo ? 'none' : '876000h',
  });

  if (errorBan) {
    // NO SE REVIERTE LA CAPA 1. Al desactivar, el estado seguro es "sin acceso a
    // datos", no "acceso restaurado": deshacer el update dejaría al aseador que se
    // acaba de dar de baja leyendo apartamentos otra vez. Al reactivar tampoco se
    // revierte, pero el mensaje dice exactamente qué quedó a medias, para que el
    // admin no se vaya creyendo que la persona ya puede entrar.
    return {
      ok: false,
      error: activo
        ? `${nombre} quedó marcada como activa, pero no se pudo restaurar su acceso. Intenta de nuevo.`
        : `${nombre} perdió el acceso a los datos, pero no se pudo cerrar su sesión. Intenta de nuevo.`,
    };
  }

  revalidatePath('/aseadores');

  return {
    ok: true,
    // Copy de UI-SPEC §15. El contrato descarta `{nombre} quedó desactivada.`
    // porque la concordancia de género desde el nombre no es viable.
    mensaje: activo ? 'Cambios guardados.' : `${nombre} ya no tiene acceso.`,
  };
}
