import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NoAutorizado } from '@/lib/auth/guards';
import { IDX_ONE_ACTIVE_PER_PROPERTY_DATE } from '@/lib/domain/constants';
import { formatFechaBog, hoyBog } from '@/lib/domain/dates';

/**
 * LAS NUEVE SERVER ACTIONS DE LA PANTALLA DE OPERACION, PROBADAS EN AISLAMIENTO.
 *
 * Lo que este archivo mide y lo que NO:
 *
 *   SI  -> el ORDEN de las tres primeras operaciones (guard, validacion, base),
 *          la forma del objeto que llega a la base, y el copy literal.
 *   NO  -> que la base rechace de verdad a un aseador. Eso no se puede medir con
 *          un doble: la frontera es `private.is_admin()` DENTRO de cada RPC y se
 *          mide contra Postgres real en
 *          `lib/domain/aseos-actions.integration.test.ts`.
 *
 * El guard se sustituye con `vi.mock` porque `exigirAdmin()` lee cookies de
 * Next: sin sustituirlo, cada test moriria en `cookies()` fuera de una peticion
 * y no habria medido nada de lo de arriba.
 */

const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock('next/cache', () => ({ revalidatePath }));

const exigirAdmin = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/guards', async (original) => {
  const real = await original<typeof import('@/lib/auth/guards')>();
  return { ...real, exigirAdmin };
});

// ── El doble de cliente ───────────────────────────────────────────────────────
// `rpc` y la cadena de `from().update().eq().select()` se instrumentan por
// separado: son las DOS rutas de escritura de este archivo, y la segunda existe
// precisamente porque no pasa por ninguna RPC.

type RespuestaFalsa = { data?: unknown; error: { code?: string; message?: string; hint?: string } | null };

let respuestaRpc: RespuestaFalsa = { data: null, error: null };
let respuestaUpdate: RespuestaFalsa = { data: [{ id: 'n1' }], error: null };

const rpc = vi.fn(async () => respuestaRpc);
const select = vi.fn(async () => respuestaUpdate);
const eq = vi.fn(() => ({ select, eq }));
const update = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ update }));

const USUARIO = { id: '11111111-1111-4111-8111-111111111111' };

function comoAdmin() {
  exigirAdmin.mockResolvedValue({ supabase: { rpc, from }, user: USUARIO });
}

function comoIntruso() {
  exigirAdmin.mockRejectedValue(new NoAutorizado());
}

const ASEO = '22222222-2222-4222-8222-222222222222';
const ASEADOR = '33333333-3333-4333-8333-333333333333';
const APARTAMENTO = '44444444-4444-4444-8444-444444444444';

/** Una fecha que siempre pasa el `min = hoyBog()` de los esquemas. */
function futuro(): string {
  const [a, m, d] = hoyBog().split('-').map(Number);
  const i = new Date(Date.UTC(a, m - 1, d + 3));
  return i.toISOString().slice(0, 10);
}

function fd(pares: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(pares)) f.set(k, v);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  respuestaRpc = { data: null, error: null };
  respuestaUpdate = { data: [{ id: 'n1' }], error: null };
  comoAdmin();
});

// Importado despues de los mocks: `vi.mock` esta izado, pero el modulo bajo
// prueba resuelve `@/lib/auth/guards` en su primera evaluacion.
const acciones = await import('./_actions');

const {
  confirmarAseo,
  reasignarAseo,
  crearAseoManual,
  reprogramarAseo,
  cerrarAseo,
  cancelarAseo,
  limpiarMarcaDeRevision,
  marcarAlertaAtendida,
  devolverAlertaAlPanel,
} = acciones;

/** Las siete de mutacion de aseo, con un FormData valido cada una. */
const MUTACIONES: ReadonlyArray<
  readonly [string, (p: null, f: FormData) => Promise<unknown>, () => FormData]
> = [
  [
    'confirmarAseo',
    confirmarAseo,
    () => fd({ aseo_id: ASEO, huespedes: '2', instrucciones: 'Toallas extra' }),
  ],
  [
    'reasignarAseo',
    reasignarAseo,
    () => fd({ aseo_id: ASEO, aseador_id: ASEADOR, aseador_nombre: 'Maria' }),
  ],
  [
    'crearAseoManual',
    crearAseoManual,
    () => fd({ apartamento_id: APARTAMENTO, fecha: futuro(), tipo: 'repaso' }),
  ],
  ['reprogramarAseo', reprogramarAseo, () => fd({ aseo_id: ASEO, fecha: futuro() })],
  ['cerrarAseo', cerrarAseo, () => fd({ aseo_id: ASEO })],
  ['cancelarAseo', cancelarAseo, () => fd({ aseo_id: ASEO })],
  ['limpiarMarcaDeRevision', limpiarMarcaDeRevision, () => fd({ aseo_id: ASEO })],
];

// ════════════════════════════════════════════════════════════════════════════
// 1. EL GUARD VA PRIMERO, Y ESO SE MIDE POR LO QUE **NO** PASA
// ════════════════════════════════════════════════════════════════════════════

describe('el guard es la primera operacion de las nueve', () => {
  it.each(MUTACIONES)(
    '%s devuelve el mensaje del guard y NO llega a la base',
    async (_nombre, accion, formData) => {
      comoIntruso();
      const r = (await accion(null, formData())) as { ok: boolean; error?: string };

      expect(r.ok).toBe(false);
      expect(r.error).toBe('No tienes permiso para esta operacion.');
      expect(rpc).not.toHaveBeenCalled();
      expect(from).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
    },
  );

  it('marcarAlertaAtendida y devolverAlertaAlPanel tampoco pasan del guard', async () => {
    comoIntruso();
    for (const accion of [marcarAlertaAtendida, devolverAlertaAlPanel]) {
      const r = await accion('55555555-5555-4555-8555-555555555555');
      expect(r.ok).toBe(false);
      expect(from).not.toHaveBeenCalled();
    }
  });

  it('un error que NO es NoAutorizado se relanza: no se disfraza de "sin permiso"', async () => {
    exigirAdmin.mockRejectedValue(new Error('GoTrue caido'));
    await expect(cerrarAseo(null, fd({ aseo_id: ASEO }))).rejects.toThrow('GoTrue caido');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. VALIDACION ANTES DE TOCAR LA BASE
// ════════════════════════════════════════════════════════════════════════════

describe('la validacion corta antes de la RPC', () => {
  it.each([
    ['confirmarAseo', confirmarAseo, fd({ aseo_id: 'no-es-uuid', huespedes: '2' })],
    ['confirmarAseo con cero huespedes', confirmarAseo, fd({ aseo_id: ASEO, huespedes: '0' })],
    ['reasignarAseo', reasignarAseo, fd({ aseo_id: ASEO, aseador_id: 'x' })],
    [
      'crearAseoManual con tipo normal',
      crearAseoManual,
      fd({ apartamento_id: APARTAMENTO, fecha: '2030-01-01', tipo: 'normal' }),
    ],
    [
      'crearAseoManual con fecha en el pasado',
      crearAseoManual,
      fd({ apartamento_id: APARTAMENTO, fecha: '2020-01-01', tipo: 'repaso' }),
    ],
    ['reprogramarAseo con fecha ilegible', reprogramarAseo, fd({ aseo_id: ASEO, fecha: 'manana' })],
    ['cerrarAseo', cerrarAseo, fd({ aseo_id: '' })],
    ['cancelarAseo', cancelarAseo, fd({})],
    ['limpiarMarcaDeRevision', limpiarMarcaDeRevision, fd({ aseo_id: '42' })],
  ] as const)('%s rechaza sin llamar a la RPC', async (_n, accion, formData) => {
    const r = (await accion(null, formData)) as { ok: boolean; error?: string };
    expect(r.ok).toBe(false);
    expect(r.error).toBe('Datos inválidos.');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('marcarAlertaAtendida rechaza un id que no es uuid sin escribir', async () => {
    const r = await marcarAlertaAtendida('42');
    expect(r.ok).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. EL CAMINO FELIZ: RPC CORRECTA, COPY LITERAL, REVALIDACION
// ════════════════════════════════════════════════════════════════════════════

describe('camino feliz', () => {
  it('confirmarAseo invoca confirm_cleaning con los tres argumentos', async () => {
    const r = await confirmarAseo(
      null,
      fd({ aseo_id: ASEO, huespedes: '3', instrucciones: 'Toallas extra' }),
    );
    expect(rpc).toHaveBeenCalledWith('confirm_cleaning', {
      p_cleaning: ASEO,
      p_num_huespedes: 3,
      p_instrucciones: 'Toallas extra',
    });
    expect(r).toEqual({ ok: true, mensaje: 'Aseo confirmado.' });
    expect(revalidatePath).toHaveBeenCalledWith('/operacion');
  });

  it('confirmarAseo manda null cuando no hay instrucciones', async () => {
    await confirmarAseo(null, fd({ aseo_id: ASEO, huespedes: '1', instrucciones: '   ' }));
    expect(rpc).toHaveBeenCalledWith(
      'confirm_cleaning',
      expect.objectContaining({ p_instrucciones: null }),
    );
  });

  it('reasignarAseo invoca reassign_cleaning y nombra a la persona', async () => {
    const r = await reasignarAseo(
      null,
      fd({ aseo_id: ASEO, aseador_id: ASEADOR, aseador_nombre: 'María' }),
    );
    expect(rpc).toHaveBeenCalledWith('reassign_cleaning', {
      p_cleaning: ASEO,
      p_aseador: ASEADOR,
    });
    expect(r).toEqual({ ok: true, mensaje: 'El aseo quedó asignado a María.' });
  });

  it('crearAseoManual invoca create_manual_cleaning y dice DONDE quedo el aseo', async () => {
    const fecha = futuro();
    const r = await crearAseoManual(
      null,
      fd({ apartamento_id: APARTAMENTO, fecha, tipo: 'emergencia' }),
    );
    expect(rpc).toHaveBeenCalledWith('create_manual_cleaning', {
      p_property: APARTAMENTO,
      p_fecha: fecha,
      p_tipo: 'emergencia',
    });
    expect(r).toEqual({ ok: true, mensaje: 'Aseo creado. Está en la bandeja Sin confirmar.' });
  });

  it('reprogramarAseo devuelve la fecha ya formateada para Bogota', async () => {
    const fecha = futuro();
    const r = await reprogramarAseo(null, fd({ aseo_id: ASEO, fecha }));
    expect(rpc).toHaveBeenCalledWith('reschedule_cleaning', {
      p_cleaning: ASEO,
      p_fecha: fecha,
    });
    expect(r).toEqual({ ok: true, mensaje: `El aseo quedó para el ${formatFechaBog(fecha)}.` });
  });

  it.each([
    ['cerrarAseo', cerrarAseo, 'close_cleaning', 'El aseo quedó cerrado.'],
    ['cancelarAseo', cancelarAseo, 'cancel_cleaning', 'El aseo quedó cancelado.'],
    [
      'limpiarMarcaDeRevision',
      limpiarMarcaDeRevision,
      'clear_review_flag',
      'El aseo quedó marcado como revisado.',
    ],
  ] as const)('%s invoca %s', async (_n, accion, nombreRpc, mensaje) => {
    const r = await accion(null, fd({ aseo_id: ASEO }));
    expect(rpc).toHaveBeenCalledWith(nombreRpc, { p_cleaning: ASEO });
    expect(r).toEqual({ ok: true, mensaje });
    expect(revalidatePath).toHaveBeenCalledWith('/operacion');
  });

  it('NINGUNA usa el cliente de servicio: solo hay una ruta, la del JWT del usuario', async () => {
    // El modulo entero, leido como texto. Es la unica forma de afirmar una
    // AUSENCIA de import que ningun doble puede medir. `ci:arch` lo cubre desde
    // fuera; esto lo deja anclado en la suite.
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    // `fileURLToPath` y no `.pathname`: la ruta lleva `(admin)` y un espacio
    // basta para que la forma cruda de la URL deje de ser una ruta valida.
    const fuente = readFileSync(fileURLToPath(new URL('./_actions.ts', import.meta.url)), 'utf8');
    expect(fuente).not.toContain('createAdminClient');
    expect(fuente).not.toContain('supabase/admin');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. ASEO-07: EL 23505 QUE TIENE QUE SER LEGIBLE E IR INLINE
// ════════════════════════════════════════════════════════════════════════════

const ERROR_23505 = {
  code: '23505',
  message: `duplicate key value violates unique constraint "${IDX_ONE_ACTIVE_PER_PROPERTY_DATE}"`,
};

describe('ASEO-07: el aseo duplicado', () => {
  it('crearAseoManual interpola apartamento y fecha, y lo manda inline bajo `fecha`', async () => {
    respuestaRpc = { error: ERROR_23505 };
    const fecha = futuro();

    const r = (await crearAseoManual(
      null,
      fd({
        apartamento_id: APARTAMENTO,
        fecha,
        tipo: 'repaso',
        apartamento_nombre: 'Bogotá 3',
      }),
    )) as { ok: boolean; error: string; campo?: string };

    expect(r.ok).toBe(false);
    expect(r.error).toBe(
      `Ya hay un aseo activo para Bogotá 3 el ${formatFechaBog(fecha)}. Reprograma el que existe o cancélalo antes de crear otro.`,
    );
    expect(r.campo).toBe('fecha');
    // Nunca el texto crudo de Postgres.
    expect(r.error).not.toContain(IDX_ONE_ACTIVE_PER_PROPERTY_DATE);
    expect(r.error).not.toContain('duplicate key');
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('reprogramarAseo hace exactamente lo mismo', async () => {
    respuestaRpc = { error: ERROR_23505 };
    const fecha = futuro();

    const r = (await reprogramarAseo(
      null,
      fd({ aseo_id: ASEO, fecha, apartamento_nombre: 'Bogotá 3' }),
    )) as { ok: boolean; error: string; campo?: string };

    expect(r.error).toBe(
      `Ya hay un aseo activo para Bogotá 3 el ${formatFechaBog(fecha)}. Reprograma el que existe o cancélalo antes de crear otro.`,
    );
    expect(r.campo).toBe('fecha');
  });

  it('sin nombre de apartamento cae al generico, y sigue yendo bajo `fecha`', async () => {
    respuestaRpc = { error: ERROR_23505 };
    const r = (await reprogramarAseo(null, fd({ aseo_id: ASEO, fecha: futuro() }))) as {
      error: string;
      campo?: string;
    };
    expect(r.error).toBe('Ya existe un aseo activo para ese apartamento en esa fecha.');
    expect(r.campo).toBe('fecha');
  });

  it('un 23505 de OTRO indice no se disfraza del mensaje de ASEO-07', async () => {
    respuestaRpc = {
      error: { code: '23505', message: 'duplicate key value violates unique constraint "otro_idx"' },
    };
    const r = (await crearAseoManual(
      null,
      fd({ apartamento_id: APARTAMENTO, fecha: futuro(), tipo: 'repaso', apartamento_nombre: 'X' }),
    )) as { error: string; campo?: string };
    expect(r.error).not.toContain('Ya hay un aseo activo para X');
    expect(r.campo).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5. LOS ERRORES DE LAS RPC LLEGAN EN ESPAÑOL
// ════════════════════════════════════════════════════════════════════════════

describe('traduccion de errores de la base', () => {
  it('el P0001 sale con el texto en español del hint, nunca con el token de la excepcion', async () => {
    respuestaRpc = {
      error: {
        code: 'P0001',
        message: 'aseo_no_cerrable',
        hint: 'El aseo no existe, es de gestión externa, o ya está cerrado o cancelado.',
      },
    };
    const r = (await cerrarAseo(null, fd({ aseo_id: ASEO }))) as { ok: boolean; error: string };
    expect(r.ok).toBe(false);
    expect(r.error).toBe('El aseo no existe, es de gestión externa, o ya está cerrado o cancelado.');
    expect(r.error).not.toContain('aseo_no_cerrable');
  });

  it('el 42501 de la RPC no filtra que recurso se pidio', async () => {
    respuestaRpc = { error: { code: '42501', message: 'no_autorizado' } };
    const r = (await cancelarAseo(null, fd({ aseo_id: ASEO }))) as { error: string };
    expect(r.error).toBe('No tienes permiso para esta operación.');
  });

  it('`sin_responsable` sale con el copy del contrato, no con el hint que nombra la columna', async () => {
    respuestaRpc = {
      error: {
        code: 'P0001',
        message: 'sin_responsable',
        hint: 'El apartamento no tiene responsable_id. Asignale uno antes de confirmar el aseo.',
      },
    };
    const r = (await confirmarAseo(null, fd({ aseo_id: ASEO, huespedes: '2' }))) as {
      error: string;
    };
    expect(r.error).toBe('Este apartamento no tiene responsable. Asígnalo antes de confirmar.');
    expect(r.error).not.toContain('responsable_id');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 6. LA PROHIBICION DE PRODUCTO: NADIE AVISO A NADIE
// ════════════════════════════════════════════════════════════════════════════

describe('ningun copy dice ni sugiere que se le aviso al aseador', () => {
  it('ninguno de los mensajes de exito menciona notificacion', async () => {
    const mensajes: string[] = [];
    for (const [, accion, formData] of MUTACIONES) {
      const r = (await accion(null, formData())) as { ok: boolean; mensaje?: string };
      if (r.ok && r.mensaje) mensajes.push(r.mensaje);
    }
    expect(mensajes).toHaveLength(MUTACIONES.length);

    // La Fase 5 es la que drena la cola. Hasta entonces, decir "se le aviso"
    // seria mentir, y la mentira solo se descubre cuando la aseadora no llega.
    for (const m of mensajes) {
      expect(m.toLowerCase()).not.toMatch(/notific|avis|le lleg|push|se le mand/);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 7. LA DISCIPLINA DE UNA SOLA COLUMNA (T-04-08)
// ════════════════════════════════════════════════════════════════════════════

const ALERTA = '66666666-6666-4666-8666-666666666666';

describe('marcarAlertaAtendida escribe UNA columna', () => {
  it('el objeto que llega a `.update()` tiene exactamente la clave `read_at`', async () => {
    const r = await marcarAlertaAtendida(ALERTA);

    expect(from).toHaveBeenCalledWith('notifications');
    expect(update).toHaveBeenCalledTimes(1);

    const escrito = update.mock.calls[0][0] as Record<string, unknown>;
    // El grant de `notifications` es de TABLA y la policy acota FILAS, no
    // columnas: nada en la base impide que un `update` con el objeto entero
    // sobrescriba `title`, `body`, `url` o `payload`. La disciplina es de la
    // action, y esta asercion es la unica que la sostiene.
    expect(Object.keys(escrito)).toEqual(['read_at']);
    expect(typeof escrito.read_at).toBe('string');
    expect(Number.isFinite(Date.parse(escrito.read_at as string))).toBe(true);

    expect(eq).toHaveBeenCalledWith('id', ALERTA);
    expect(r.ok).toBe(true);
  });

  it('devolverAlertaAlPanel escribe `read_at: null` y nada mas', async () => {
    await devolverAlertaAlPanel(ALERTA);
    const escrito = update.mock.calls[0][0] as Record<string, unknown>;
    expect(escrito).toEqual({ read_at: null });
  });

  it('ninguna de las dos usa una RPC', async () => {
    await marcarAlertaAtendida(ALERTA);
    await devolverAlertaAlPanel(ALERTA);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('cero filas afectadas es un error, no un exito silencioso', async () => {
    respuestaUpdate = { data: [], error: null };
    const r = await marcarAlertaAtendida(ALERTA);
    expect(r.ok).toBe(false);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
