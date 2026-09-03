import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { esquemaCrearAseador } from '@/lib/domain/aseador.schema';
import { generarPasswordTemporal } from '@/lib/domain/password';
import {
  clienteAdminDePruebas,
  clienteAnonimo,
  payloadDelJwt,
} from '@/lib/test/clientes';

/**
 * Alta de aseador contra el stack local (ASEADOR-01).
 *
 * Este archivo NO invoca `crearAseador` directamente: una Server Action arrastra
 * `next/cache` y el almacén de cookies de una petición, que fuera de Next no
 * existen. Lo que se mide aquí es la CAPA QUE LA ACTION DELEGA y que es donde
 * están los hechos medidos del research: qué hace GoTrue con `createUser`, qué
 * materializa el trigger, y qué NO queda escrito en la base.
 *
 * El guard y el orden guard → Zod → cliente de servicio se prueban aparte:
 * `lib/auth/guards.test.ts` (unitario, con el caso de escalada) y
 * `e2e/aseadores-alta.spec.ts` (de punta a punta contra el navegador).
 *
 * Requiere `npx supabase start` y `.env.local` con los valores del stack local.
 */

const SUFIJO = randomUUID().slice(0, 8);
const EMAIL = `int.alta.${SUFIJO}@vivaguest.test`;
const NOMBRE = 'Aseador Del Alta';
const TELEFONO = '3009876543';

/** La credencial real que produce el generador, no una inventada para el test. */
const PASSWORD = generarPasswordTemporal();

let userId: string | null = null;

beforeAll(async () => {
  const admin = clienteAdminDePruebas();

  // Se siembra exactamente con la forma que usa `crearAseador`: si la action y
  // este sembrado divergieran, el test estaría midiendo otra cosa.
  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    app_metadata: { role: 'aseador' },
    user_metadata: { role: 'aseador', full_name: NOMBRE, phone: TELEFONO },
  });

  if (error) throw new Error(`No se pudo crear el aseador de prueba: ${error.message}`);
  userId = data.user.id;
});

afterAll(async () => {
  if (!userId) return;
  await clienteAdminDePruebas().auth.admin.deleteUser(userId);
  userId = null;
});

describe('createUser materializa el perfil por el trigger', () => {
  test('profiles nace con role=aseador, is_active=true y deactivated_at=null', async () => {
    const { data, error } = await clienteAdminDePruebas()
      .from('profiles')
      .select('id, role, full_name, phone, is_active, deactivated_at')
      .eq('id', userId as string)
      .single();

    expect(error).toBeNull();
    // Lo que hace innecesario insertar el perfil a mano en la action.
    expect(data?.role).toBe('aseador');
    expect(data?.full_name).toBe(NOMBRE);
    expect(data?.phone).toBe(TELEFONO);
    expect(data?.is_active).toBe(true);
    expect(data?.deactivated_at).toBeNull();
  });
});

describe('el JWT del aseador recién creado', () => {
  test('trae app_metadata.role = aseador, que es lo que rutea el middleware', async () => {
    const { data, error } = await clienteAnonimo().auth.signInWithPassword({
      email: EMAIL,
      password: PASSWORD,
    });

    expect(error).toBeNull();
    expect(data.session).not.toBeNull();

    // Se mira el claim DENTRO del token: el ruteo depende de que el rol viaje en
    // el JWT, no de lo que devuelva el objeto `user` de la librería.
    const payload = payloadDelJwt(data.session?.access_token as string);
    const appMetadata = payload.app_metadata as Record<string, unknown> | undefined;
    const userMetadata = payload.user_metadata as Record<string, unknown> | undefined;

    expect(appMetadata?.role).toBe('aseador');
    // La otra mitad del doble escrito: sin esto el trigger no habría sabido el rol.
    expect(userMetadata?.role).toBe('aseador');
  });
});

describe('la contraseña NO se persiste en ningún sitio (T-02-36)', () => {
  test('la fila de profiles serializada entera no contiene la cadena', async () => {
    // `select *`, no una lista de columnas: si mañana alguien añade una columna y
    // le escribe la contraseña, este test tiene que verlo sin que nadie lo
    // actualice. Esa es toda la razón del asterisco.
    const { data, error } = await clienteAdminDePruebas()
      .from('profiles')
      .select('*')
      .eq('id', userId as string)
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();

    const serializada = JSON.stringify(data);
    expect(serializada).not.toContain(PASSWORD);
    // Y tampoco los grupos sueltos: guardar `Xk4m` de `Xk4m-92pT-vLq` sería una
    // fuga igual de real y `toContain` del string completo no la vería.
    for (const grupo of PASSWORD.split('-')) {
      expect(serializada).not.toContain(grupo);
    }
  });

  test('ninguna columna de texto de profiles la contiene, buscando en la tabla entera', async () => {
    const { data, error } = await clienteAdminDePruebas().from('profiles').select('*');

    expect(error).toBeNull();
    expect(JSON.stringify(data)).not.toContain(PASSWORD);
  });

  test('GoTrue tampoco la devuelve en claro al leer el usuario', async () => {
    const { data, error } = await clienteAdminDePruebas().auth.admin.getUserById(
      userId as string,
    );

    expect(error).toBeNull();
    // `user_metadata` es lo más fácil de contaminar: lleva `full_name` y `phone`,
    // y meter ahí la contraseña "para no perderla" sería un desastre silencioso.
    expect(JSON.stringify(data.user)).not.toContain(PASSWORD);
  });
});

describe('no hay auto-registro: la cuenta la crea el admin', () => {
  test('signUp con la clave publicable falla', async () => {
    const { data, error } = await clienteAnonimo().auth.signUp({
      email: `int.intruso.${randomUUID().slice(0, 8)}@vivaguest.test`,
      password: generarPasswordTemporal(),
    });

    expect(error).not.toBeNull();
    expect(data.session).toBeNull();
    // `enable_signup = false` responde 422. Se ancla el estado además del
    // mensaje: el texto de GoTrue cambia entre versiones, el código no.
    expect(error?.status).toBe(422);
  });
});

describe('email duplicado', () => {
  test('createUser con un email ya usado devuelve email_exists', async () => {
    const { error } = await clienteAdminDePruebas().auth.admin.createUser({
      email: EMAIL,
      password: generarPasswordTemporal(),
      email_confirm: true,
      app_metadata: { role: 'aseador' },
      user_metadata: { role: 'aseador', full_name: 'Duplicado' },
    });

    expect(error).not.toBeNull();
    // Es el código que `mapAuthError` traduce a `Ya existe una cuenta con ese
    // email.` y que el diálogo pinta INLINE bajo el campo de email.
    expect(error?.code).toBe('email_exists');
    expect(error?.status).toBe(422);
  });
});

describe('el hecho medido que obliga a validar en el Zod', () => {
  test('la Admin API ACEPTA una contraseña de 8 caracteres pese a config.toml', async () => {
    const emailCorto = `int.corta.${randomUUID().slice(0, 8)}@vivaguest.test`;
    const admin = clienteAdminDePruebas();

    const { data, error } = await admin.auth.admin.createUser({
      email: emailCorto,
      password: 'pw123456', // 8 caracteres, con minimum_password_length = 12
      email_confirm: true,
      app_metadata: { role: 'aseador' },
      user_metadata: { role: 'aseador', full_name: 'Password Corta' },
    });

    try {
      // ESTA ES LA MEDICIÓN QUE JUSTIFICA TODO EL DISEÑO. Si algún día GoTrue
      // empezara a validar la longitud en la Admin API, este test se pondría rojo
      // y sabríamos que la defensa dejó de ser única. Mientras pase, el `.min()`
      // de `esquemaCrearAseador` es lo ÚNICO que separa al sistema de una
      // credencial de 8 caracteres.
      expect(error).toBeNull();
      expect(data.user?.id).toBeTruthy();

      // Y el Zod de la action sí la rechaza: la defensa está donde tiene que estar.
      const r = esquemaCrearAseador.safeParse({
        full_name: 'Password Corta',
        email: emailCorto,
        phone: '',
        password: 'pw123456',
      });
      expect(r.success).toBe(false);
    } finally {
      if (data?.user?.id) await admin.auth.admin.deleteUser(data.user.id);
    }
  });
});
