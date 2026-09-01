import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';
import { publicEnv, readServerSecret } from '@/lib/env';

/**
 * `globalSetup` de la suite E2E: siembra los usuarios deterministas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AVISO DE ENTORNO, y el síntoma aparece MUY lejos de la causa:
 * el stack local de Supabase es COMPARTIDO entre worktrees. `supabase/config.toml`
 * declara un único `project_id`, así que todos los agentes hablan con la misma base.
 * Un `npm run db:reset` lanzado desde otro worktree BORRA estos usuarios en mitad de
 * una corrida, y los tests fallan con "invalid_credentials" como si el login
 * estuviera roto, cuando lo que pasó es que el usuario dejó de existir.
 * Los planes que tocan la base no se ejecutan en la misma wave para evitarlo.
 * Si ves logins que funcionaban y de repente no: mira si alguien reseteó la base.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type RolE2E = 'admin' | 'aseador';

export interface UsuarioE2E {
  clave: string;
  email: string;
  nombre: string;
  rol: RolE2E;
}

/**
 * Emails deterministas con prefijo `e2e.` inconfundible: nadie los va a confundir
 * con datos reales al mirar la tabla de usuarios. El dominio `.test` está reservado
 * por RFC 2606 y nunca resuelve, así que ningún correo puede salir de verdad.
 */
export const USUARIOS_E2E: readonly UsuarioE2E[] = [
  { clave: 'admin', email: 'e2e.admin@vivaguest.test', nombre: 'Admin E2E', rol: 'admin' },
  { clave: 'aseador1', email: 'e2e.aseador1@vivaguest.test', nombre: 'Aseador Uno E2E', rol: 'aseador' },
  { clave: 'aseador2', email: 'e2e.aseador2@vivaguest.test', nombre: 'Aseador Dos E2E', rol: 'aseador' },
] as const;

/** Directorio de secretos de la corrida. Ignorado por git. */
export const DIR_AUTH = resolve(process.cwd(), 'e2e/.auth');
/** Credenciales de la corrida, que `fixtures.ts` lee para hacer login. */
export const ARCHIVO_CREDENCIALES = resolve(DIR_AUTH, 'credenciales.json');

export type Credenciales = Record<string, { email: string; password: string; rol: RolE2E }>;

/** Cliente de servicio, solo para sembrar y limpiar. */
export function clienteDeServicio() {
  const { NEXT_PUBLIC_SUPABASE_URL } = publicEnv();
  // Se lee el secreto aquí en vez de importar `lib/supabase/admin.ts` porque ese
  // módulo hace `import 'server-only'`, cuyo `index.js` es un `throw`, y el
  // transpilador de Playwright no activa la condición `react-server` que lo
  // neutraliza. `e2e/` nunca lo compila Next (nada bajo `app/` lo importa), así que
  // el secreto no puede acabar en un bundle de cliente.
  return createClient<Database>(NEXT_PUBLIC_SUPABASE_URL, readServerSecret('SUPABASE_SECRET_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function cargarEnvLocal(): void {
  const envLocal = resolve(process.cwd(), '.env.local');
  if (!existsSync(envLocal)) {
    throw new Error(
      `Falta .env.local en ${envLocal}.\n` +
        'La suite E2E siembra usuarios contra el stack local de Supabase.\n' +
        'Arréglalo: npx supabase start, copia .env.example a .env.local y rellena\n' +
        'los valores con lo que imprime `npx supabase status`.',
    );
  }
  process.loadEnvFile(envLocal);
}

export async function borrarSiExiste(
  admin: ReturnType<typeof clienteDeServicio>,
  email: string,
): Promise<void> {
  // La API de admin no expone "buscar por email", así que se pagina el listado.
  // Con un puñado de usuarios en local esto es trivial; si algún día crece, el
  // camino es un RPC sobre auth.users.
  let pagina = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: 200 });
    if (error) throw new Error(`No se pudo listar usuarios: ${error.message}`);
    if (data.users.length === 0) return;

    const encontrado = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (encontrado) {
      const { error: errBorrado } = await admin.auth.admin.deleteUser(encontrado.id);
      if (errBorrado) throw new Error(`No se pudo borrar ${email}: ${errBorrado.message}`);
      return;
    }
    if (data.users.length < 200) return;
    pagina += 1;
  }
}

export default async function globalSetup(): Promise<void> {
  cargarEnvLocal();

  const admin = clienteDeServicio();
  const credenciales: Credenciales = {};

  for (const usuario of USUARIOS_E2E) {
    // IDEMPOTENCIA: si una corrida anterior se cayó antes de limpiar, el usuario
    // sigue ahí y `createUser` fallaría con "already registered". Se borra y se
    // recrea siempre, en vez de reutilizar: un usuario heredado puede traer estado
    // (perfil desactivado, rol cambiado por un test) que envenena la corrida nueva.
    await borrarSiExiste(admin, usuario.email);

    // Contraseña nueva por corrida: si el archivo se filtrara, no sirve mañana.
    const password = `e2e-${randomUUID()}`;

    const { error } = await admin.auth.admin.createUser({
      email: usuario.email,
      password,
      // Sin esto GoTrue exige confirmación por correo y el login E2E fallaría con
      // `email_not_confirmed`.
      email_confirm: true,
      // El rol va en los DOS sitios, y no es redundante:
      //   - `app_metadata` viaja dentro del JWT y es lo que lee el middleware para
      //     rutear. El usuario NO puede modificarlo.
      //   - `user_metadata` es lo que lee el trigger `tg_handle_new_user` de la
      //     migración 03 (`raw_user_meta_data ->> 'role'`) para materializar la fila
      //     de `public.profiles`.
      // Escribir solo uno deja el ruteo o el perfil roto, y el síntoma aparece lejos
      // de la causa: el login funciona pero la página sale vacía, o al revés.
      app_metadata: { role: usuario.rol },
      user_metadata: { role: usuario.rol, full_name: usuario.nombre },
    });

    if (error) {
      throw new Error(`No se pudo crear el usuario E2E ${usuario.email}: ${error.message}`);
    }

    credenciales[usuario.clave] = { email: usuario.email, password, rol: usuario.rol };
  }

  mkdirSync(dirname(ARCHIVO_CREDENCIALES), { recursive: true });
  writeFileSync(ARCHIVO_CREDENCIALES, JSON.stringify(credenciales, null, 2), 'utf8');
}
