'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { NoAutorizado, exigirAdmin } from '@/lib/auth/guards';
import { esquemaCrearAseador } from '@/lib/domain/aseador.schema';
import { mapAuthError } from '@/lib/domain/errors';
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
