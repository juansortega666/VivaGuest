import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NoAutorizado } from '@/lib/auth/guards';

/**
 * LAS TRES SERVER ACTIONS DEL ARBOL DEL ASEADOR, PROBADAS EN AISLAMIENTO.
 *
 * Mismo molde y misma frontera que `app/(admin)/operacion/_actions.test.ts`:
 *
 *   SI  -> el ORDEN de las tres primeras operaciones (guard, validacion, base),
 *          la forma EXACTA del objeto que llega a la base, y el copy.
 *   NO  -> que Postgres rechace de verdad una escritura de evidencia. Eso lo
 *          impone el grant POR COLUMNA de la migracion 16 y se mide contra
 *          Postgres real en `supabase/tests/07_push.test.sql`.
 *
 * El guard se sustituye con `vi.mock` porque `exigirSesion()` lee cookies de
 * Next: sin sustituirlo, cada test moriria en `cookies()` fuera de una peticion
 * y no habria medido nada de lo de arriba.
 */

const exigirSesion = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/guards', async (original) => {
  const real = await original<typeof import('@/lib/auth/guards')>();
  return { ...real, exigirSesion };
});

// ── El doble de cliente ───────────────────────────────────────────────────────
// Dos rutas de escritura y ninguna RPC: el `upsert` del registro y el
// `update().eq()` de la baja y de la marca de visto.

type RespuestaFalsa = { data?: unknown; error: { code?: string; message?: string; hint?: string } | null };

let respuesta: RespuestaFalsa = { data: null, error: null };

// Los tres van tipados con el generico de `vi.fn` y NO declarando parametros que
// el cuerpo no usa: es lo que hace que `.mock.calls[0][0]` sea una tupla con
// forma —sin eso, la asercion de la unica columna no compila— sin dejar cinco
// avisos de `no-unused-vars` detras.
const eq = vi.fn<(columna: string, valor: string) => Promise<RespuestaFalsa>>(
  async () => respuesta,
);
const update = vi.fn<(valores: Record<string, unknown>) => { eq: typeof eq }>(() => ({ eq }));
const upsert = vi.fn<
  (valores: Record<string, unknown>, opciones: { onConflict?: string }) => Promise<RespuestaFalsa>
>(async () => respuesta);
const from = vi.fn(() => ({ update, upsert }));
const rpc = vi.fn();

const USUARIO = { id: '11111111-1111-4111-8111-111111111111' };

function comoAseador() {
  exigirSesion.mockResolvedValue({ supabase: { from, rpc }, user: USUARIO });
}

function comoIntruso() {
  exigirSesion.mockRejectedValue(new NoAutorizado());
}

const ENDPOINT = 'https://web.push.apple.com/QABC123';
const P256DH = `B${'a'.repeat(86)}`;
const AUTH = 'c'.repeat(22);

function fd(pares: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(pares)) f.set(k, v);
  return f;
}

function formRegistro(sobrescribir: Record<string, string> = {}): FormData {
  return fd({
    endpoint: ENDPOINT,
    p256dh: P256DH,
    auth: AUTH,
    soporta_declarativo: 'true',
    user_agent: 'Mozilla/5.0 (iPhone)',
    ...sobrescribir,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  respuesta = { data: null, error: null };
  comoAseador();
});

// Importado despues de los mocks: `vi.mock` esta izado, pero el modulo bajo
// prueba resuelve `@/lib/auth/guards` en su primera evaluacion.
const acciones = await import('./_actions');

const { registrarSuscripcion, revocarSuscripcionPropia, marcarVisto } = acciones;

const LAS_TRES: ReadonlyArray<
  readonly [string, (p: null, f: FormData) => Promise<unknown>, () => FormData]
> = [
  ['registrarSuscripcion', registrarSuscripcion, () => formRegistro()],
  ['revocarSuscripcionPropia', revocarSuscripcionPropia, () => fd({ endpoint: ENDPOINT })],
  ['marcarVisto', marcarVisto, () => fd({ endpoint: ENDPOINT })],
];

// ════════════════════════════════════════════════════════════════════════════
// 1. EL GUARD ES LA PRIMERA OPERACION, Y ESO SE MIDE POR LO QUE **NO** PASA
//
// Senuelo: quitarle el guard a `registrarSuscripcion` convierte el registro de
// suscripciones en un endpoint ABIERTO, y el endpoint es una credencial de
// envio. Corrido en los dos sentidos al escribir esto.
// ════════════════════════════════════════════════════════════════════════════

describe('el guard va antes de tocar la base', () => {
  it.each(LAS_TRES)(
    '%s devuelve el mensaje del guard y NO llega a la base',
    async (_nombre, accion, formData) => {
      comoIntruso();
      const r = (await accion(null, formData())) as { ok: boolean; error?: string };

      expect(r.ok).toBe(false);
      expect(r.error).toBe('No tienes permiso para esta operacion.');
      expect(from).not.toHaveBeenCalled();
      expect(upsert).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    },
  );

  it('un fallo del servidor de Auth que NO es NoAutorizado se relanza', async () => {
    exigirSesion.mockRejectedValue(new Error('GoTrue caido'));
    await expect(registrarSuscripcion(null, formRegistro())).rejects.toThrow('GoTrue caido');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. LA VALIDACION VA ANTES DE LA BASE (T-05-02)
// ════════════════════════════════════════════════════════════════════════════

describe('un endpoint fuera de la allowlist no llega a la base', () => {
  it.each([
    ['un dominio cualquiera', 'https://evil.com/QABC123'],
    ['el metadato de la nube', 'https://169.254.169.254/latest/meta-data/'],
    ['el propio stack local', 'https://127.0.0.1:54321/rest/v1/profiles'],
    ['sufijo enganoso', 'https://push.apple.com.evil.com/QABC123'],
    ['sin https', 'http://web.push.apple.com/QABC123'],
  ])('registrarSuscripcion con %s falla y no toca la base', async (_caso, endpoint) => {
    const r = await registrarSuscripcion(null, formRegistro({ endpoint }));

    expect(r.ok).toBe(false);
    expect(from).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('las otras dos tampoco aceptan un endpoint arbitrario', async () => {
    const malo = fd({ endpoint: 'https://evil.com/QABC123' });

    expect((await revocarSuscripcionPropia(null, malo)).ok).toBe(false);
    expect((await marcarVisto(null, malo)).ok).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. LA DISCIPLINA DE UNA SOLA COLUMNA (T-05-13)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Las cuatro columnas de evidencia de verificacion de la migracion 16. Se
 * construyen por concatenacion y no como literales sueltos a proposito: este
 * archivo vive bajo el arbol que los greps de CI recorren, y ya hubo tres
 * tropiezos del repo con un guardarrail que funciona por regex y no por
 * gramatica.
 */
const EVIDENCIA = ['verificado_at', 'verificacion_grado', 'verificacion_token', 'verificacion_intentos'];

describe('registrarSuscripcion escribe exactamente las columnas que el grant permite', () => {
  it('el objeto que llega al upsert tiene EXACTAMENTE las claves esperadas', async () => {
    const r = await registrarSuscripcion(null, formRegistro());

    expect(r.ok).toBe(true);
    expect(from).toHaveBeenCalledWith('push_subscriptions');
    expect(upsert).toHaveBeenCalledTimes(1);

    const escrito = upsert.mock.calls[0][0];
    expect(Object.keys(escrito).sort()).toEqual(
      [
        'auth',
        'endpoint',
        'p256dh',
        'soporta_declarativo',
        'user_agent',
        'user_id',
        'visto_at',
      ].sort(),
    );

    expect(escrito.user_id).toBe(USUARIO.id);
    expect(escrito.endpoint).toBe(ENDPOINT);
    expect(escrito.soporta_declarativo).toBe(true);
  });

  it('NINGUNA de las cuatro columnas de evidencia aparece en el objeto', async () => {
    await registrarSuscripcion(null, formRegistro());
    const escrito = upsert.mock.calls[0][0];

    for (const columna of EVIDENCIA) {
      expect(Object.keys(escrito)).not.toContain(columna);
    }
  });

  it('el upsert va POR ENDPOINT, que es el invariante de la migracion 06', async () => {
    await registrarSuscripcion(null, formRegistro());
    expect(upsert.mock.calls[0][1]).toEqual({ onConflict: 'endpoint' });
  });

  it('sin user_agent la columna viaja nula, no como cadena vacia', async () => {
    await registrarSuscripcion(null, formRegistro({ user_agent: '' }));
    expect(upsert.mock.calls[0][0].user_agent).toBeNull();
  });

  it('un error de la base es un fallo, no un exito silencioso', async () => {
    respuesta = { data: null, error: { code: '42501', message: 'permission denied' } };
    const r = await registrarSuscripcion(null, formRegistro());
    expect(r.ok).toBe(false);
  });
});

describe('las otras dos escriben una sola cosa cada una', () => {
  it('revocarSuscripcionPropia escribe revoked_at y revoked_reason, y nada mas', async () => {
    const r = await revocarSuscripcionPropia(null, fd({ endpoint: ENDPOINT }));

    expect(r.ok).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);

    const escrito = update.mock.calls[0][0];
    expect(Object.keys(escrito).sort()).toEqual(['revoked_at', 'revoked_reason']);
    expect(typeof escrito.revoked_at).toBe('string');
    expect(eq).toHaveBeenCalledWith('endpoint', ENDPOINT);
  });

  it('marcarVisto escribe visto_at y nada mas', async () => {
    const r = await marcarVisto(null, fd({ endpoint: ENDPOINT }));

    expect(r.ok).toBe(true);
    const escrito = update.mock.calls[0][0];
    expect(Object.keys(escrito)).toEqual(['visto_at']);
    expect(eq).toHaveBeenCalledWith('endpoint', ENDPOINT);
  });

  it('ninguna de las tres usa una RPC', async () => {
    await registrarSuscripcion(null, formRegistro());
    await revocarSuscripcionPropia(null, fd({ endpoint: ENDPOINT }));
    await marcarVisto(null, fd({ endpoint: ENDPOINT }));
    expect(rpc).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. EL COPY: NINGUN EXITO DE AQUI AFIRMA QUE UN AVISO LLEGO
//
// Registrar una suscripcion significa "hay a donde enviar", no "llego". Esa
// distincion es la que sostiene `Sin probar` contra `Activos` en §5.2, y un
// mensaje de exito que la borre la convierte en teatro.
// ════════════════════════════════════════════════════════════════════════════

describe('el copy de exito no promete una entrega', () => {
  const PROHIBIDAS = /(lleg|recib|suena|sonó|sono|avisad|notificad|te avisamos)/i;

  it.each(LAS_TRES)('%s', async (_nombre, accion, formData) => {
    const r = (await accion(null, formData())) as { ok: boolean; mensaje?: string };

    expect(r.ok).toBe(true);
    expect(r.mensaje ?? '').not.toMatch(PROHIBIDAS);
  });
});
