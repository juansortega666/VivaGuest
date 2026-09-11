import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NoAutorizado } from '@/lib/auth/guards';

/**
 * LA ACTION DEL CODIGO DE ACCESO, PROBADA EN AISLAMIENTO.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * LO QUE MIDE ESTE ARCHIVO Y LO QUE NO.
 *
 *   SI  -> el ORDEN (guard, validacion, RPC), la forma EXACTA del argumento que
 *          viaja al RPC, y sobre todo que los TRES casos de denegacion
 *          devuelvan la MISMA cadena.
 *   NO  -> que la base deniegue de verdad, ni que revelar deje rastro. Eso es
 *          Postgres real y vive en `lib/domain/codigo-acceso.integration.test.ts`.
 *
 * ── LA ASERCION QUE IMPORTA ES LA DE LOS TRES MENSAJES IGUALES ─────────────
 *
 * La migracion 09 lanza `42501` —y no `P0001`— para "no existe", "no es tuyo" y
 * "todavia no es su dia", y su comentario dice por que: un error que los
 * discriminara seria un ORACULO DE ENUMERACION DE ASEOS AJENOS. Cualquiera con
 * sesion de aseador podria barrer identificadores y leer, por la forma del
 * error, cuales corresponden a trabajos reales de otras personas.
 *
 * Esa propiedad se pierde sin hacer ruido: basta con que alguien "mejore" el
 * copy y escriba un mensaje distinto por caso. El test compara los tres y afirma
 * que son la misma cadena, asi que la mejora se pone roja.
 *
 * ── Y LA SEGUNDA: EL TIPO DE RETORNO ES UNA UNION ──────────────────────────
 *
 * O trae el codigo, o trae el error. Nunca los dos. Con un objeto de campos
 * opcionales seria posible renderizar un codigo al lado de un mensaje de fallo,
 * y ese codigo podria ser el de un intento anterior.
 */

const exigirSesion = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/guards', async (original) => {
  const real = await original<typeof import('@/lib/auth/guards')>();
  return { ...real, exigirSesion };
});

// ── El doble del cliente: una sola ruta, `rpc()` ──────────────────────────────

type RespuestaFalsa = {
  data: unknown;
  error: { code?: string; message?: string; hint?: string } | null;
};

let respuesta: RespuestaFalsa = { data: null, error: null };

const rpc = vi.fn<(nombre: string, argumentos: Record<string, unknown>) => Promise<RespuestaFalsa>>(
  async () => respuesta,
);
const from = vi.fn();

const USUARIO = { id: '11111111-1111-4111-8111-111111111111' };
const ASEO_ID = '22222222-2222-4222-8222-222222222222';
const CODIGO = '482917';

function comoAseador() {
  exigirSesion.mockResolvedValue({ supabase: { rpc, from }, user: USUARIO });
}

function comoIntruso() {
  exigirSesion.mockRejectedValue(new NoAutorizado());
}

function fd(pares: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(pares)) f.set(k, v);
  return f;
}

/** Lo que devuelve el RPC cuando si entrega: una tabla de una fila. */
function filaDelRpc(): RespuestaFalsa {
  return {
    data: [{ codigo_acceso: CODIGO, tipo_cerradura: 'inteligente', notas_acceso: null }],
    error: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  respuesta = filaDelRpc();
  comoAseador();
});

const acciones = await import('./_actions');
const { revelarCodigo } = acciones;

// ════════════════════════════════════════════════════════════════════════════
// 1. EL GUARD VA PRIMERO
// ════════════════════════════════════════════════════════════════════════════

describe('el guard va antes de tocar nada', () => {
  it('sin sesion devuelve el mensaje del guard y NO llama al RPC', async () => {
    comoIntruso();

    const r = await revelarCodigo(null, fd({ aseo: ASEO_ID }));

    expect(r.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. LO QUE VIAJA AL RPC
// ════════════════════════════════════════════════════════════════════════════

describe('la llamada al RPC', () => {
  it('llama reveal_access_code con el identificador del aseo', async () => {
    await revelarCodigo(null, fd({ aseo: ASEO_ID }));

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe('reveal_access_code');
    expect(rpc.mock.calls[0][1]).toEqual({ p_cleaning: ASEO_ID });
  });

  it('no manda NINGUN dato del apartamento: la autorizacion se ancla al aseo', async () => {
    await revelarCodigo(null, fd({ aseo: ASEO_ID, property: 'lo-que-sea' }));

    expect(Object.keys(rpc.mock.calls[0][1])).toEqual(['p_cleaning']);
  });

  it('con un identificador mal formado no llega al RPC', async () => {
    const r = await revelarCodigo(null, fd({ aseo: 'no-soy-un-uuid' }));

    expect(r.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('devuelve el codigo cuando el RPC entrega', async () => {
    const r = await revelarCodigo(null, fd({ aseo: ASEO_ID }));

    expect(r).toEqual({ ok: true, codigo: CODIGO });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. LOS TRES CASOS INDISTINGUIBLES — LA ASERCION DE SEGURIDAD DEL ARCHIVO
// ════════════════════════════════════════════════════════════════════════════

describe('los tres casos de denegacion', () => {
  /**
   * Los tres llegan con el MISMO codigo de Postgres, porque asi lo decidio la
   * migracion 09. Lo unico que cambia es el identificador que se pregunto, y
   * eso es justamente lo que no puede notarse desde fuera.
   */
  const LOS_TRES: ReadonlyArray<readonly [string, string]> = [
    ['el aseo no existe', '00000000-0000-4000-8000-000000000000'],
    ['el aseo es de otra persona', '44444444-4444-4444-8444-444444444444'],
    ['todavia no es el dia del aseo', ASEO_ID],
  ];

  it('devuelven todos EXACTAMENTE el mismo mensaje', async () => {
    const mensajes: string[] = [];

    for (const [, id] of LOS_TRES) {
      respuesta = { data: null, error: { code: '42501', message: 'no_autorizado' } };
      const r = await revelarCodigo(null, fd({ aseo: id }));
      expect(r.ok).toBe(false);
      if (!r.ok) mensajes.push(r.error);
    }

    expect(mensajes).toHaveLength(3);
    expect(new Set(mensajes).size).toBe(1);
  });

  it('ninguno de los tres trae codigo en el resultado', async () => {
    for (const [, id] of LOS_TRES) {
      respuesta = { data: null, error: { code: '42501', message: 'no_autorizado' } };
      const r = await revelarCodigo(null, fd({ aseo: id }));

      expect(r).not.toHaveProperty('codigo');
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. EL RESTO DE LOS ERRORES
// ════════════════════════════════════════════════════════════════════════════

describe('los otros errores', () => {
  it('en P0001 devuelve el texto del hint y NO el del message', async () => {
    // Medido el 2026-09-06 contra PostgREST: los RPC de este proyecto levantan
    // un TOKEN de maquina como `message` y el espanol en el `hint`. Devolver el
    // `message` pintaria un identificador interno en la cara del aseador.
    respuesta = {
      data: null,
      error: { code: 'P0001', message: 'aseo_no_revelable', hint: 'El aseo ya se cerró.' },
    };

    const r = await revelarCodigo(null, fd({ aseo: ASEO_ID }));

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe('El aseo ya se cerró.');
      expect(r.error).not.toContain('aseo_no_revelable');
    }
  });

  it('si el RPC entrega cero filas, devuelve error y no un codigo vacio', async () => {
    // El apartamento puede no tener codigo guardado todavia. El RPC autoriza y
    // audita igual, pero no hay nada que mostrar: una caja vacia de 28px seria
    // peor que una frase.
    respuesta = { data: [], error: null };

    const r = await revelarCodigo(null, fd({ aseo: ASEO_ID }));

    expect(r.ok).toBe(false);
    expect(r).not.toHaveProperty('codigo');
  });

  it('si la fila viene con el codigo en nulo, tampoco lo da por bueno', async () => {
    respuesta = {
      data: [{ codigo_acceso: null, tipo_cerradura: 'llave_fisica', notas_acceso: null }],
      error: null,
    };

    const r = await revelarCodigo(null, fd({ aseo: ASEO_ID }));

    expect(r.ok).toBe(false);
  });
});
