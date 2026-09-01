import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import {
  clienteAdminDePruebas,
  clienteAnonimo,
  payloadDelJwt,
} from '@/lib/test/clientes';

/**
 * Cierra el bloqueante que el plan 02-01 dejó ABIERTO: hasta esa fase
 * `signInWithPassword` devolvía `Email logins are disabled` porque
 * `[auth.email] enable_signup` mapea a `GOTRUE_EXTERNAL_EMAIL_ENABLED`, que es el
 * interruptor del PROVEEDOR entero y no el del auto-registro (02-RESEARCH §8.1).
 *
 * Este archivo no AFIRMA que quedó arreglado: lo mide contra el stack local, y de
 * paso ancla las dos propiedades que no pueden regresar sin que algo se ponga rojo:
 * que el auto-registro sigue cerrado, y que el error de login no es un oráculo de
 * enumeración de cuentas.
 *
 * Requiere `npx supabase start` y `.env.local` con los valores del stack local.
 */

// Sufijo único por corrida: dos ejecuciones simultáneas, o una anterior que se
// cayó antes del `afterAll`, no pueden colisionar por email.
const SUFIJO = randomUUID().slice(0, 8);
const EMAIL = `int.aseador.${SUFIJO}@vivaguest.test`;
const PASSWORD = `pw-${randomUUID()}`;
const NOMBRE = 'Aseador De Integracion';

let userId: string | null = null;

beforeAll(async () => {
  const admin = clienteAdminDePruebas();

  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    // Sin esto GoTrue exige confirmar por correo y el login devolvería
    // `email_not_confirmed`, que enmascararía lo que este archivo quiere medir.
    email_confirm: true,
    // El rol se escribe en los DOS sitios a propósito y no es redundante:
    //   - `app_metadata` lo emite GoTrue dentro del JWT y es lo que lee el
    //     middleware. El usuario NO puede modificarlo.
    //   - `user_metadata` es lo que lee `tg_handle_new_user` (migración 03,
    //     `raw_user_meta_data ->> 'role'`) para materializar `public.profiles`.
    // Escribir solo uno deja el ruteo o el perfil roto, y el síntoma aparece lejos
    // de la causa.
    app_metadata: { role: 'aseador' },
    user_metadata: { role: 'aseador', full_name: NOMBRE },
  });

  if (error) throw new Error(`No se pudo sembrar el usuario de prueba: ${error.message}`);
  userId = data.user.id;
});

afterAll(async () => {
  if (!userId) return;
  const admin = clienteAdminDePruebas();
  // Limpieza incondicional: ningún test de esta suite puede depender del estado
  // que dejó otro, ni dejar basura para el siguiente.
  await admin.auth.admin.deleteUser(userId);
  userId = null;
});

describe('login por email contra el stack local', () => {
  test('signInWithPassword devuelve sesión, no "Email logins are disabled"', async () => {
    const { data, error } = await clienteAnonimo().auth.signInWithPassword({
      email: EMAIL,
      password: PASSWORD,
    });

    // ESTA es la aserción que fallaba antes del plan 02-01.
    expect(error).toBeNull();
    expect(data.session).not.toBeNull();
    expect(data.session?.access_token).toBeTruthy();
  });

  test('el JWT lleva app_metadata.role, que es lo que rutea el middleware', async () => {
    const { data, error } = await clienteAnonimo().auth.signInWithPassword({
      email: EMAIL,
      password: PASSWORD,
    });
    expect(error).toBeNull();

    const token = data.session?.access_token;
    expect(token).toBeTruthy();

    // Se inspecciona el claim DENTRO del token, no el objeto `user` que devuelve la
    // librería: el ruteo del plan 02-06 depende de que el rol viaje en el JWT, y esa
    // es una propiedad del token, no de la respuesta HTTP que lo envuelve.
    const payload = payloadDelJwt(token as string);
    const appMetadata = payload.app_metadata as Record<string, unknown> | undefined;

    expect(appMetadata?.role).toBe('aseador');
    expect(payload.role).toBe('authenticated');
  });

  test('el perfil se materializó en public.profiles con el rol correcto', async () => {
    // Confirma la otra mitad del doble escrito: `user_metadata.role` lo consumió
    // `tg_handle_new_user`. Si alguien "simplifica" el sembrado a un solo sitio,
    // este test es el que se pone rojo.
    const { data, error } = await clienteAdminDePruebas()
      .from('profiles')
      .select('id, role, full_name, is_active')
      .eq('id', userId as string)
      .single();

    expect(error).toBeNull();
    expect(data?.role).toBe('aseador');
    expect(data?.full_name).toBe(NOMBRE);
    expect(data?.is_active).toBe(true);
  });
});

describe('el auto-registro sigue cerrado', () => {
  test('signUp con la clave publicable falla', async () => {
    const { data, error } = await clienteAnonimo().auth.signUp({
      email: `int.intruso.${randomUUID().slice(0, 8)}@vivaguest.test`,
      password: `pw-${randomUUID()}`,
    });

    expect(error).not.toBeNull();
    expect(data.session).toBeNull();
    // `GOTRUE_DISABLE_SIGNUP=true` responde 422. Se ancla el código además del
    // mensaje: el texto de GoTrue cambia entre versiones, el estado no.
    expect(error?.status).toBe(422);
  });
});

describe('el error de login no enumera cuentas', () => {
  test('contraseña incorrecta y email inexistente dan el MISMO error', async () => {
    const { error: errPassword } = await clienteAnonimo().auth.signInWithPassword({
      email: EMAIL,
      password: 'una-contrasena-que-no-es',
    });

    const { error: errEmail } = await clienteAnonimo().auth.signInWithPassword({
      email: `int.fantasma.${randomUUID().slice(0, 8)}@vivaguest.test`,
      password: 'una-contrasena-que-no-es',
    });

    expect(errPassword).not.toBeNull();
    expect(errEmail).not.toBeNull();

    // Si estos dos divergieran, un atacante podría distinguir "esta cuenta existe"
    // de "no existe" con una sola petición, que es el oráculo de enumeración.
    expect(errPassword?.code).toBe('invalid_credentials');
    expect(errEmail?.code).toBe('invalid_credentials');
    expect(errEmail?.message).toBe(errPassword?.message);
    expect(errEmail?.status).toBe(errPassword?.status);
  });
});
