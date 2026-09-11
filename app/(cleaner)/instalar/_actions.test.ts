import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NoAutorizado } from '@/lib/auth/guards';
import { claveDeColapso } from '@/lib/push/colapso';

/**
 * LAS TRES SERVER ACTIONS DEL ASISTENTE DE INSTALACION, PROBADAS EN AISLAMIENTO.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESTE ARCHIVO PRUEBA EL CONTRATO DE D-02, QUE ES LA UNICA VERIFICACION REAL DE
 * LA FASE:
 *
 *   La instalacion NO termina cuando la app aparece en la pantalla de inicio.
 *   Termina cuando LLEGO un aviso de prueba a ese telefono.
 *
 * Y la razon de que existan dos grados de confirmacion: si no se distinguieran,
 * `Ya sono, no alcance a tocarlo` seria un boton para saltarse esa verificacion.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Misma frontera que `app/(cleaner)/_actions.test.ts`:
 *
 *   SI  -> el ORDEN de las operaciones (guard, validacion, RPC, envio), el
 *          contenido EXACTO del payload que sale hacia el telefono, y el copy.
 *   NO  -> que Postgres cuente de verdad el tope de tres, ni que rechace una
 *          escritura de evidencia. Eso lo imponen las funciones definer y el
 *          grant POR COLUMNA de la migracion 16, y se mide contra Postgres real
 *          en `supabase/tests/07_push.test.sql` (57 aserciones).
 *
 * `construirPayload()` y `claveDeColapso()` NO se sustituyen: son puros y son
 * justo lo que hay que medir. Lo unico que se sustituye es el guard (lee cookies
 * de Next), el cliente de base, y `enviar()` (habla con un push service real).
 */

// ── Los dobles ───────────────────────────────────────────────────────────────

const exigirSesion = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/guards', async (original) => {
  const real = await original<typeof import('@/lib/auth/guards')>();
  return { ...real, exigirSesion };
});

const enviar = vi.hoisted(() => vi.fn());
vi.mock('@/lib/push/envio', async (original) => {
  const real = await original<typeof import('@/lib/push/envio')>();
  return { ...real, enviar };
});

// El origen NO se sustituye: se configura, y asi el destino del aviso pasa por
// la misma resolucion que usa el drenaje. Un origen equivocado manda a la
// aseadora a otro despliegue desde su pantalla de bloqueo.
const ORIGEN = 'https://vivaguest.test';
process.env.APP_BASE_URL = ORIGEN;

type RespuestaFalsa = {
  data?: unknown;
  error: { code?: string; message?: string; hint?: string } | null;
};

const USUARIO = { id: '11111111-1111-4111-8111-111111111111' };
const ENDPOINT = 'https://web.push.apple.com/QABC123';
const P256DH = `B${'a'.repeat(86)}`;
const AUTH = 'c'.repeat(22);
const TOKEN = '22222222-2222-4222-8222-222222222222';

/** Lo que devuelve el RPC de turno. */
let respuestaRpc: RespuestaFalsa = { data: TOKEN, error: null };
/** Lo que devuelve la lectura de la propia suscripcion. */
let respuestaSub: RespuestaFalsa = {
  data: { p256dh: P256DH, auth: AUTH, soporta_declarativo: false },
  error: null,
};
/** Lo que devuelve el `update` de la baja. */
let respuestaUpdate: RespuestaFalsa = { error: null };

const rpc = vi.fn<(nombre: string, args?: Record<string, unknown>) => Promise<RespuestaFalsa>>(
  async () => respuestaRpc,
);
const maybeSingle = vi.fn<() => Promise<RespuestaFalsa>>(async () => respuestaSub);
const isNull = vi.fn<(columna: string, valor: null) => { maybeSingle: typeof maybeSingle }>(() => ({
  maybeSingle,
}));
const eqSelect = vi.fn<(columna: string, valor: string) => { is: typeof isNull }>(() => ({
  is: isNull,
}));
const select = vi.fn<(columnas: string) => { eq: typeof eqSelect }>(() => ({ eq: eqSelect }));
const eqUpdate = vi.fn<(columna: string, valor: string) => Promise<RespuestaFalsa>>(
  async () => respuestaUpdate,
);
const update = vi.fn<(valores: Record<string, unknown>) => { eq: typeof eqUpdate }>(() => ({
  eq: eqUpdate,
}));
const from = vi.fn(() => ({ select, update }));

function comoAseador() {
  exigirSesion.mockResolvedValue({ supabase: { from, rpc }, user: USUARIO });
}

function comoIntruso() {
  exigirSesion.mockRejectedValue(new NoAutorizado());
}

/** El push service acepto el mensaje. Aceptar NO es entregar (§11.4). */
function pushAceptado() {
  enviar.mockResolvedValue({ statusCode: 201 });
}

beforeEach(() => {
  vi.clearAllMocks();
  respuestaRpc = { data: TOKEN, error: null };
  respuestaSub = {
    data: { p256dh: P256DH, auth: AUTH, soporta_declarativo: false },
    error: null,
  };
  respuestaUpdate = { error: null };
  comoAseador();
  pushAceptado();
});

// Importado despues de los mocks: `vi.mock` esta izado, pero el modulo bajo
// prueba resuelve sus dependencias en su primera evaluacion.
const { enviarAvisoDePrueba, confirmarPruebaPorToque, confirmarPruebaAMano } = await import(
  './_actions'
);

function fd(pares: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(pares)) f.set(k, v);
  return f;
}

/** El JSON que salio hacia el telefono, ya parseado. */
function payloadEnviado(): Record<string, unknown> {
  const [, json] = enviar.mock.calls[0] as [unknown, string, unknown];
  return JSON.parse(json) as Record<string, unknown>;
}

// ── El copy de §10.1, literal. Es el unico copy de aviso nuevo de la fase ────
const TITULO = 'Prueba de VivaGuest';
const CUERPO = 'Si ves esto, tu teléfono ya recibe los avisos. Tócalo para terminar.';
const DESTINO = `${ORIGEN}/instalar?prueba=${TOKEN}`;

// El hint de §8.7, tal como lo redacta la migracion 16. La action NO lo
// reescribe: `mapDbError()` lo deja pasar.
const HINT_TOPE =
  'Probamos 3 veces y no llegó ninguno. Avísale a tu administrador: puede ser el teléfono, la versión del sistema o la conexión.';

const HINT_SIN_ENVIO =
  'Todavía no se ha enviado ningún aviso de prueba a este teléfono. Envía uno antes de confirmarlo a mano.';

// ════════════════════════════════════════════════════════════════════════════
// 1. EL GUARD ES LA PRIMERA OPERACION DE LAS TRES
//
// Senuelo: quitarle el guard a `enviarAvisoDePrueba` deja un DISPARADOR DE
// ENVIOS DE PUSH abierto a cualquiera (T-05-39). Corrido en los dos sentidos al
// escribir esto.
// ════════════════════════════════════════════════════════════════════════════

describe('el guard va antes de tocar nada', () => {
  const LAS_TRES: ReadonlyArray<readonly [string, () => Promise<unknown>]> = [
    ['enviarAvisoDePrueba', () => enviarAvisoDePrueba(null, fd({ endpoint: ENDPOINT }))],
    ['confirmarPruebaPorToque', () => confirmarPruebaPorToque(TOKEN)],
    ['confirmarPruebaAMano', () => confirmarPruebaAMano(ENDPOINT)],
  ];

  it.each(LAS_TRES)('%s rechaza sin RPC y sin envio', async (_nombre, llamar) => {
    comoIntruso();
    const r = (await llamar()) as { ok: boolean; error?: string };

    expect(r.ok).toBe(false);
    expect(r.error).toBe('No tienes permiso para esta operacion.');
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
    expect(enviar).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. EL TOPE SE CUENTA ANTES DE ENVIAR, Y ESE ORDEN ES EL CONTRATO (T-05-08)
// ════════════════════════════════════════════════════════════════════════════

describe('el registro del intento va antes del envio', () => {
  it('llama `registrar_prueba_de_aviso` ANTES que `enviar()`', async () => {
    await enviarAvisoDePrueba(null, fd({ endpoint: ENDPOINT }));

    expect(rpc).toHaveBeenCalledWith('registrar_prueba_de_aviso', { p_endpoint: ENDPOINT });
    expect(enviar).toHaveBeenCalledTimes(1);

    // Senuelo: invertir las dos llamadas en la action pone ESTA linea en rojo.
    // Y la consecuencia de invertirlas no es estetica: un fallo del envio que no
    // hubiera contado el intento deja el tope de tres EVADIBLE reintentando.
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(enviar.mock.invocationCallOrder[0]);
  });

  it('al cuarto intento devuelve el hint de §8.7 TAL CUAL y no envia nada', async () => {
    respuestaRpc = { error: { code: 'P0001', message: 'tope_de_pruebas', hint: HINT_TOPE } };

    const r = (await enviarAvisoDePrueba(null, fd({ endpoint: ENDPOINT }))) as {
      ok: boolean;
      error?: string;
      topeAgotado?: boolean;
    };

    expect(r.ok).toBe(false);
    // Sin reescribir: el texto ya viene redactado en espanol desde la migracion
    // 16, y `mapDbError()` lee el `hint` en `P0001`, no el `message`.
    expect(r.error).toBe(HINT_TOPE);
    expect(r.topeAgotado).toBe(true);
    expect(enviar).not.toHaveBeenCalled();
  });

  it('una suscripcion ajena o revocada (42501) no envia nada', async () => {
    respuestaRpc = { error: { code: '42501', message: 'no_autorizado' } };

    const r = (await enviarAvisoDePrueba(null, fd({ endpoint: ENDPOINT }))) as { ok: boolean };

    expect(r.ok).toBe(false);
    expect(enviar).not.toHaveBeenCalled();
  });

  it('un endpoint que no es de un servicio de push conocido no llega al RPC', async () => {
    const r = (await enviarAvisoDePrueba(
      null,
      fd({ endpoint: 'https://atacante.example/cualquiera' }),
    )) as { ok: boolean };

    expect(r.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    expect(enviar).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. EL AVISO DE PRUEBA VIAJA POR LA MISMA TUBERIA QUE UNO REAL
//
// Incluida la rama de formato que le toque al destino (D-07). Dos tests, uno por
// rama, con nombres distintos.
// ════════════════════════════════════════════════════════════════════════════

describe('el payload del aviso de prueba', () => {
  it('D-07 rama clasica: el destino NO soporta el formato declarativo', async () => {
    respuestaSub = {
      data: { p256dh: P256DH, auth: AUTH, soporta_declarativo: false },
      error: null,
    };

    await enviarAvisoDePrueba(null, fd({ endpoint: ENDPOINT }));

    const cuerpo = payloadEnviado();
    expect(cuerpo.web_push).toBeUndefined();
    expect(cuerpo.notification).toBeUndefined();

    const datos = cuerpo.datos as Record<string, unknown>;
    expect(datos.titulo).toBe(TITULO);
    expect(datos.cuerpo).toBe(CUERPO);
    // `Tocalo para terminar` no es decorativo: ESTE destino es lo que produce la
    // confirmacion por toque, que es el unico grado que no depende de que nadie
    // diga nada.
    expect(datos.url).toBe(DESTINO);
  });

  it('D-07 rama declarativa: el destino SI soporta el formato declarativo', async () => {
    respuestaSub = {
      data: { p256dh: P256DH, auth: AUTH, soporta_declarativo: true },
      error: null,
    };

    await enviarAvisoDePrueba(null, fd({ endpoint: ENDPOINT }));

    const cuerpo = payloadEnviado();
    expect(cuerpo.web_push).toBe(8030);

    const notificacion = cuerpo.notification as Record<string, unknown>;
    expect(notificacion.title).toBe(TITULO);
    expect(notificacion.body).toBe(CUERPO);
    expect(notificacion.navigate).toBe(DESTINO);
    expect(notificacion.silent).toBe(false);
  });

  it('la suscripcion que recibe el envio es la que devolvio la base, con sus dos claves', async () => {
    await enviarAvisoDePrueba(null, fd({ endpoint: ENDPOINT }));

    const [sub] = enviar.mock.calls[0] as [{ endpoint: string; keys: Record<string, string> }];
    expect(sub).toEqual({ endpoint: ENDPOINT, keys: { p256dh: P256DH, auth: AUTH } });
  });

  it('sale con urgencia alta y con un TTL de MINUTOS, no de horas', async () => {
    await enviarAvisoDePrueba(null, fd({ endpoint: ENDPOINT }));

    const [, , opciones] = enviar.mock.calls[0] as [unknown, unknown, { ttl: number; urgency: string }];
    expect(opciones.urgency).toBe('high');
    // Un aviso de prueba que llega media hora despues no verifica nada: para
    // entonces el aseador ya cerro el asistente.
    expect(opciones.ttl).toBeGreaterThan(0);
    expect(opciones.ttl).toBeLessThanOrEqual(600);
  });

  it('su clave de colapso NUNCA coincide con la de una asignacion real del mismo aseador', async () => {
    await enviarAvisoDePrueba(null, fd({ endpoint: ENDPOINT }));

    const [, , opciones] = enviar.mock.calls[0] as [unknown, unknown, { topic?: string }];

    const asignacionReal = claveDeColapso({
      recipient_id: USUARIO.id,
      type: 'asignacion',
      cleaning_id: '33333333-3333-4333-8333-333333333333',
      dedupe_key: null,
      id: '44444444-4444-4444-8444-444444444444',
    });

    expect(opciones.topic).toBeDefined();
    expect(opciones.topic).not.toBe(asignacionReal);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. LO QUE DIJO EL PUSH SERVICE
// ════════════════════════════════════════════════════════════════════════════

describe('la respuesta del push service', () => {
  it('aceptado (201) devuelve ok y NO afirma que el aviso llego (§11.4)', async () => {
    enviar.mockResolvedValue({ statusCode: 201 });

    const r = (await enviarAvisoDePrueba(null, fd({ endpoint: ENDPOINT }))) as {
      ok: boolean;
      mensaje?: string;
      suscripcionMuerta?: boolean;
    };

    expect(r.ok).toBe(true);
    expect(r.suscripcionMuerta).toBeUndefined();
    expect(update).not.toHaveBeenCalled();
  });

  it('410 marca revocada la suscripcion PROPIA y el resultado se distingue de "enviado"', async () => {
    enviar.mockResolvedValue({ statusCode: 410 });

    const r = (await enviarAvisoDePrueba(null, fd({ endpoint: ENDPOINT }))) as {
      ok: boolean;
      suscripcionMuerta?: boolean;
      error?: string;
    };

    expect(r.ok).toBe(false);
    expect(r.suscripcionMuerta).toBe(true);

    // Dos columnas y SOLO dos, igual que la baja desde el telefono. `user_id` no
    // entra: la migracion 16 se lo quito al grant de update a proposito.
    const [valores] = update.mock.calls[0] as [Record<string, unknown>];
    expect(Object.keys(valores).sort()).toEqual(['revoked_at', 'revoked_reason']);
    expect(eqUpdate).toHaveBeenCalledWith('endpoint', ENDPOINT);
  });

  it('un fallo transitorio (500) NO revoca nada y no filtra el cuerpo de la respuesta', async () => {
    enviar.mockResolvedValue({ statusCode: 500, body: 'Internal error at node-42.push.apple.com' });

    const r = (await enviarAvisoDePrueba(null, fd({ endpoint: ENDPOINT }))) as {
      ok: boolean;
      error?: string;
      codigo?: string;
      suscripcionMuerta?: boolean;
    };

    expect(r.ok).toBe(false);
    expect(r.suscripcionMuerta).toBeUndefined();
    expect(update).not.toHaveBeenCalled();
    // El codigo SI viaja —es lo que permite diagnosticar—; el cuerpo NO (T-05-04).
    expect(r.codigo).toBe('http_500');
    expect(r.error).not.toContain('node-42');
    expect(r.error).not.toContain('Internal error');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5. LOS DOS GRADOS DE CONFIRMACION
// ════════════════════════════════════════════════════════════════════════════

describe('confirmarPruebaPorToque', () => {
  it('llama al RPC con el token del aviso', async () => {
    respuestaRpc = { data: null, error: null };

    const r = (await confirmarPruebaPorToque(TOKEN)) as { ok: boolean };

    expect(rpc).toHaveBeenCalledWith('confirmar_prueba_por_toque', { p_token: TOKEN });
    expect(r.ok).toBe(true);
  });

  it('con un token que el RPC no reconoce NO lanza y devuelve un resultado neutro', async () => {
    // El RPC sale sin hacer nada y sin error cuando el token ya se consumio o es
    // de otra sesion. El navegador puede reabrir la misma URL, y convertir ese
    // reintento en una pantalla de error seria mostrarle un fallo al aseador
    // justo en el momento en que todo salio bien.
    respuestaRpc = { data: null, error: null };

    const r = (await confirmarPruebaPorToque(TOKEN)) as { ok: boolean; mensaje?: string };

    expect(r.ok).toBe(true);
  });

  it('un token que no es un uuid ni siquiera llega al RPC', async () => {
    const r = (await confirmarPruebaPorToque('../../etc/passwd')) as { ok: boolean };

    expect(r.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('confirmarPruebaAMano', () => {
  it('llama al RPC con el endpoint de este navegador', async () => {
    respuestaRpc = { data: null, error: null };

    const r = (await confirmarPruebaAMano(ENDPOINT)) as { ok: boolean };

    expect(rpc).toHaveBeenCalledWith('confirmar_prueba_a_mano', { p_endpoint: ENDPOINT });
    expect(r.ok).toBe(true);
  });

  it('sobre una suscripcion sin envio previo devuelve el hint del RPC', async () => {
    respuestaRpc = { error: { code: 'P0001', message: 'sin_envio_previo', hint: HINT_SIN_ENVIO } };

    const r = (await confirmarPruebaAMano(ENDPOINT)) as { ok: boolean; error?: string };

    expect(r.ok).toBe(false);
    expect(r.error).toBe(HINT_SIN_ENVIO);
  });

  it('un endpoint invalido ni siquiera llega al RPC', async () => {
    const r = (await confirmarPruebaAMano('no-es-una-url')) as { ok: boolean };

    expect(r.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 6. LAS DOS PROPIEDADES QUE ATRAVIESAN LAS TRES ACTIONS
// ════════════════════════════════════════════════════════════════════════════

describe('propiedades de las tres', () => {
  it('ningun mensaje de exito afirma la ENTREGA del aviso (§11.4)', async () => {
    const mensajes: string[] = [];

    for (const llamar of [
      () => enviarAvisoDePrueba(null, fd({ endpoint: ENDPOINT })),
      () => confirmarPruebaPorToque(TOKEN),
      () => confirmarPruebaAMano(ENDPOINT),
    ]) {
      const r = (await llamar()) as { ok: boolean; mensaje?: string };
      expect(r.ok).toBe(true);
      mensajes.push(r.mensaje ?? '');
    }

    expect(mensajes).toHaveLength(3);
    for (const m of mensajes) {
      expect(m.length).toBeGreaterThan(0);
      // El patron de §11.4, corrido en los dos sentidos: rojo con el copy
      // prohibido, verde con el permitido. El envio es asincrono y
      // fire-and-forget: la action NO SABE si el aviso llego.
      expect(m).not.toMatch(/(se le (notific|mand|avis)|ya fue avisad|le lleg[oó]|ya sabe)/i);
    }
  });

  it('ninguna escribe la evidencia de verificacion: solo pasa por los RPC definer', async () => {
    enviar.mockResolvedValue({ statusCode: 410 });

    await enviarAvisoDePrueba(null, fd({ endpoint: ENDPOINT }));
    await confirmarPruebaPorToque(TOKEN);
    await confirmarPruebaAMano(ENDPOINT);

    // La unica escritura directa de las tres es la baja de la propia
    // suscripcion. Las cuatro columnas de evidencia no aparecen en NINGUN objeto
    // que llegue a la base: la migracion 16 se las quito a `authenticated` por
    // grant de columna, asi que escribirlas fallaria en runtime. Eso es
    // exactamente lo que se quiere: si el aseador pudiera firmar el acta de que
    // le llego el aviso, `Activos` seria autocertificado (T-05-13).
    const prohibidas = [
      'verificado_at',
      'verificacion_grado',
      'verificacion_token',
      'verificacion_intentos',
    ];

    for (const llamada of update.mock.calls) {
      const valores = llamada[0] as Record<string, unknown>;
      for (const columna of prohibidas) {
        expect(Object.keys(valores)).not.toContain(columna);
      }
    }

    // Y tampoco se leen: la columna de intentos no entra en el `select`, porque
    // el contador de pantalla de §8.7 es cortesia y el control es el RPC.
    for (const llamada of select.mock.calls) {
      const columnas = llamada[0];
      for (const columna of prohibidas) {
        expect(columnas).not.toContain(columna);
      }
    }
  });
});
