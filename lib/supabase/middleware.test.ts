import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ESTE ARCHIVO EXISTE POR UN FALSO VERDE, y conviene contar cual.
 *
 * La primera version de esta comprobacion era un test de Playwright que recargaba
 * una pagina con sesion y miraba el `Cache-Control` de la respuesta. Pasaba. Se
 * rompio `setAll` a proposito, dejandolo en la firma de UN argumento (la del
 * ejemplo oficial de Supabase), y **el test siguio pasando**. La razon: Next ya
 * marca `no-store` por su cuenta en cualquier ruta dinamica, asi que la asercion
 * medía el default de Next y no el trabajo del middleware. Verde por accidente,
 * con el agujero de caché de CDN abierto de par en par. Es exactamente el modo de
 * falla contra el que advertia el plan.
 *
 * Lo que hay aqui mide el contrato de verdad: que las cabeceras que la libreria
 * PASA a `setAll` acaben en el response. Se invoca `setAll` igual que lo invoca
 * `@supabase/ssr`, con sus dos argumentos, y se comprueba el resultado.
 *
 * Si alguien vuelve a la firma de un argumento, estos tests se ponen rojos. Es la
 * unica red que queda, porque TypeScript no dice nada: implementar un tipo de
 * funcion con menos parametros de los declarados es legal.
 */

type SetAll = (
  cookies: { name: string; value: string; options: Record<string, unknown> }[],
  headers: Record<string, string>,
) => void;

/** Lo que la libreria pasa de verdad, leido de `dist/main/cookies.js` de 0.12.5. */
const CABECERAS_ANTICACHE = {
  'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0',
  Expires: '0',
  Pragma: 'no-cache',
} as const;

const COOKIE_DE_SESION = [
  { name: 'sb-127-auth-token', value: 'token-refrescado', options: { path: '/' } },
];

/** `setAll` capturado de las opciones con las que se construyo el cliente. */
let setAllCapturado: SetAll | undefined;

/** Lo que hara el `getUser()` simulado antes de responder. */
let alPedirUsuario: (() => void) | undefined;

vi.mock('@/lib/env', () => ({
  publicEnv: () => ({
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_para_test',
  }),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: (
    _url: string,
    _clave: string,
    opciones: { cookies: { getAll: () => unknown; setAll: SetAll } },
  ) => {
    setAllCapturado = opciones.cookies.setAll;
    return {
      auth: {
        // La libreria llama a `setAll` DENTRO del ciclo de `getUser()`, cuando
        // decide refrescar el token. Reproducirlo aqui es lo que hace que el test
        // mida el objeto que `actualizarSesion` acaba devolviendo, y no una copia
        // anterior a la reasignacion.
        getUser: async () => {
          alPedirUsuario?.();
          return {
            data: {
              user: { id: 'u-1', app_metadata: { role: 'aseador' }, user_metadata: {} },
            },
            error: null,
          };
        },
      },
    };
  },
}));

import { actualizarSesion } from './middleware';

function peticion(ruta = 'http://127.0.0.1:3000/mis-aseos') {
  return new NextRequest(ruta);
}

beforeEach(() => {
  setAllCapturado = undefined;
  alPedirUsuario = undefined;
});

describe('actualizarSesion', () => {
  it('aplica al response las cabeceras anti-cache que recibe setAll', async () => {
    alPedirUsuario = () => {
      setAllCapturado?.(COOKIE_DE_SESION, { ...CABECERAS_ANTICACHE });
    };

    const { supabaseResponse } = await actualizarSesion(peticion());

    // Las tres, tal cual. Sin ellas, una respuesta con `Set-Cookie` de sesion es
    // almacenable por un CDN y puede servirse a otro usuario.
    expect(supabaseResponse.headers.get('cache-control')).toBe(
      CABECERAS_ANTICACHE['Cache-Control'],
    );
    expect(supabaseResponse.headers.get('expires')).toBe('0');
    expect(supabaseResponse.headers.get('pragma')).toBe('no-cache');
  });

  it('conserva en el response las cookies refrescadas', async () => {
    alPedirUsuario = () => {
      setAllCapturado?.(COOKIE_DE_SESION, { ...CABECERAS_ANTICACHE });
    };

    const { supabaseResponse } = await actualizarSesion(peticion());

    // Perder esto es la otra mitad del desastre: el usuario se desloguea solo.
    expect(supabaseResponse.cookies.get('sb-127-auth-token')?.value).toBe(
      'token-refrescado',
    );
  });

  it('no revienta cuando la libreria pasa un objeto de cabeceras vacio', async () => {
    // Rutas reales de `@supabase/ssr` llaman `setAll(cookies, {})` cuando no hay
    // cookies de auth de por medio. No debe escribir nada ni lanzar.
    alPedirUsuario = () => {
      setAllCapturado?.(COOKIE_DE_SESION, {});
    };

    const { supabaseResponse } = await actualizarSesion(peticion());

    expect(supabaseResponse.headers.get('expires')).toBeNull();
    expect(supabaseResponse.cookies.get('sb-127-auth-token')?.value).toBe(
      'token-refrescado',
    );
  });

  it('devuelve el usuario que valida el servidor de Auth', async () => {
    const { user } = await actualizarSesion(peticion());
    expect(user?.app_metadata.role).toBe('aseador');
  });
});
