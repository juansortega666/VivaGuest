import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Pruebas del guard de Server Action.
 *
 * Lo que estas pruebas NO son: una prueba de autorizacion. La frontera de
 * autorizacion de VivaGuest es la RLS de Postgres, que lee `profiles.role` via
 * `private.is_admin()` y se prueba con pgTAP y con la suite de integracion.
 * Esto mide otra cosa: que el guard lea el rol del sitio correcto y que falle
 * cerrado. Si el guard se cayera entero, un aseador que invoque la action
 * recibiria 0 filas o 42501; lo que se perderia es el mensaje en espanol y la
 * no-filtracion de la existencia del recurso.
 *
 * El caso que de verdad importa aqui es el ultimo: `user_metadata.role = 'admin'`
 * con `app_metadata.role = 'aseador'`. Esa combinacion NO es hipotetica, es la
 * escalada que se midio posible con `supabase.auth.updateUser()` desde la sesion
 * del propio aseador (02-RESEARCH.md §2.1). Si alguien "simplifica" el guard a
 * leer `user.role` o `user_metadata`, es este test el que se pone rojo.
 */

const getUser = vi.fn();

// El guard construye su cliente con la fabrica de servidor. Se sustituye entera:
// no hay red, ni cookies, ni Next en estas pruebas.
const clienteStub = { auth: { getUser } };

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => clienteStub),
}));

import { exigirAdmin, exigirSesion, NoAutorizado } from './guards';

/** Respuesta de `getUser()` para un usuario con los metadatos que se le pasen. */
function usuario(metadatos: {
  app?: Record<string, unknown>;
  user?: Record<string, unknown>;
}) {
  return {
    data: {
      user: {
        id: '00000000-0000-0000-0000-000000000001',
        email: 'alguien@vivaguest.test',
        app_metadata: metadatos.app ?? {},
        user_metadata: metadatos.user ?? {},
      },
    },
    error: null,
  };
}

/** Respuesta de `getUser()` cuando GoTrue rechaza el token (expirado, baneado…). */
function sinUsuario() {
  return { data: { user: null }, error: { message: 'invalid claim', status: 401 } };
}

beforeEach(() => {
  getUser.mockReset();
});

describe('exigirAdmin', () => {
  it('lanza NoAutorizado cuando no hay usuario', async () => {
    getUser.mockResolvedValue(sinUsuario());
    await expect(exigirAdmin()).rejects.toBeInstanceOf(NoAutorizado);
  });

  it('lanza NoAutorizado cuando el rol de app_metadata es aseador', async () => {
    getUser.mockResolvedValue(usuario({ app: { role: 'aseador' } }));
    await expect(exigirAdmin()).rejects.toBeInstanceOf(NoAutorizado);
  });

  it('devuelve cliente y usuario cuando el rol de app_metadata es admin', async () => {
    getUser.mockResolvedValue(usuario({ app: { role: 'admin' } }));
    const { supabase, user } = await exigirAdmin();
    expect(supabase).toBe(clienteStub);
    expect(user.app_metadata.role).toBe('admin');
  });

  it('lanza NoAutorizado con user_metadata.role=admin y app_metadata.role=aseador', async () => {
    // La escalada medida: el propio aseador escribe esto en su JWT con
    // updateUser(). Leer user_metadata lo mandaria al shell del admin.
    getUser.mockResolvedValue(
      usuario({ app: { role: 'aseador' }, user: { role: 'admin' } }),
    );
    await expect(exigirAdmin()).rejects.toBeInstanceOf(NoAutorizado);
  });

  it('lanza NoAutorizado cuando app_metadata no trae rol', async () => {
    // Falla cerrado: la ausencia de rol no es permiso.
    getUser.mockResolvedValue(usuario({}));
    await expect(exigirAdmin()).rejects.toBeInstanceOf(NoAutorizado);
  });
});

describe('exigirSesion', () => {
  it('lanza NoAutorizado cuando no hay usuario', async () => {
    getUser.mockResolvedValue(sinUsuario());
    await expect(exigirSesion()).rejects.toBeInstanceOf(NoAutorizado);
  });

  it('pasa con rol aseador', async () => {
    getUser.mockResolvedValue(usuario({ app: { role: 'aseador' } }));
    const { user } = await exigirSesion();
    expect(user.app_metadata.role).toBe('aseador');
  });

  it('pasa con rol admin', async () => {
    getUser.mockResolvedValue(usuario({ app: { role: 'admin' } }));
    await expect(exigirSesion()).resolves.toBeDefined();
  });
});
