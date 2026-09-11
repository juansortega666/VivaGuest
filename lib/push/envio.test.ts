import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * LA PROPIEDAD CENTRAL DE `envio.ts`, Y ES UNA SOLA: UN FALLO DEL PUSH SERVICE
 * NUNCA SE PROPAGA COMO EXCEPCIÓN.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * EL SEÑUELO QUE ESTE ARCHIVO EXISTE PARA ATRAPAR (T-05-23):
 *
 * `web-push` RECHAZA la promesa ante cualquier respuesta que no sea 2xx. El
 * worker procesa una notificación contra N suscripciones y una tanda contra
 * hasta quince notificaciones. Sin el `try/catch`, la PRIMERA suscripción
 * revocada —un `410`, que es la cosa más normal del mundo— mata la corrida
 * entera y las otras catorce no salen. Y como el aviso es el canal único y sin
 * respaldo de esta operación, eso es un aseo que nadie sabe que tiene.
 *
 * Un fallo por suscripción es INFORMACIÓN, no una interrupción: vuelve como
 * código para que `decidir()` lo clasifique.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── LA EXCEPCIÓN A «NUNCA LANZA», QUE ES DELIBERADA Y NO UNA GRIETA ─────────
 *
 * La CONFIGURACIÓN rota sí lanza, y tiene que hacerlo. Un `VAPID_SUBJECT`
 * apuntando a un host local hace que Safari rechace el JWT con `BadJwtToken`:
 * no falla una suscripción, fallan TODAS, y fallan solo en producción. Tragarse
 * eso y devolver un código convertiría un fallo global e inmediato en quince
 * fallos individuales indistinguibles de una caída de red. Por eso la
 * configuración se valida FUERA del `try` y su error sale por arriba, que es la
 * misma decisión que `abortar_corrida` en `errores.ts`.
 */

const { sendNotification, setVapidDetails } = vi.hoisted(() => ({
  sendNotification: vi.fn(),
  setVapidDetails: vi.fn(),
}));

vi.mock('web-push', () => ({
  default: { sendNotification, setVapidDetails },
  sendNotification,
  setVapidDetails,
}));

/**
 * El entorno mínimo. `publicEnv()` valida las tres variables públicas de golpe,
 * así que las de Supabase tienen que estar aunque este módulo no las use.
 */
const ENTORNO_BASE = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://proyecto.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_deprueba',
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'BPublicaDePruebaNoEsUnaClaveReal',
  VAPID_PRIVATE_KEY: 'PrivadaDePruebaNoEsUnaClaveReal',
  VAPID_SUBJECT: 'mailto:operaciones@vivaguest.co',
} as const;

const SUSCRIPCION = {
  endpoint: 'https://web.push.apple.com/QW5BYnNvbHV0YW1lbnRlRmFsc28',
  keys: { p256dh: 'BP256dhDePrueba', auth: 'AuthDePrueba' },
};

const OPCIONES = { ttl: 14_400, urgency: 'high' as const, topic: 'ClaveDeColapsoDePrueba', timeoutMs: 10_000 };

const entornoOriginal = { ...process.env };

beforeEach(() => {
  sendNotification.mockReset();
  setVapidDetails.mockReset();
  Object.assign(process.env, ENTORNO_BASE);
});

afterEach(() => {
  process.env = { ...entornoOriginal };
});

/**
 * Carga una instancia FRESCA del módulo. La configuración de VAPID se memoiza
 * por proceso a propósito, así que sin resetear el registro un test arrastraría
 * la configuración del anterior y el caso del subject inválido pasaría en verde
 * sin haber validado nada.
 */
async function cargar(sobrescribir: Record<string, string | undefined> = {}) {
  vi.resetModules();
  for (const [clave, valor] of Object.entries(sobrescribir)) {
    if (valor === undefined) delete process.env[clave];
    else process.env[clave] = valor;
  }
  return import('./envio');
}

/** Los argumentos con los que se llamó a la librería en la última invocación. */
function ultimaLlamada() {
  const args = sendNotification.mock.calls.at(-1);
  if (!args) throw new Error('la librería no fue llamada');
  return {
    sub: args[0] as { endpoint: string },
    payload: args[1] as string,
    opciones: args[2] as Record<string, unknown>,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// La propiedad central
// ───────────────────────────────────────────────────────────────────────────

describe('`enviar()` nunca propaga un fallo del push service', () => {
  it('un RECHAZO con los tres campos vuelve como resultado, no como excepción', async () => {
    const { enviar } = await cargar();
    sendNotification.mockRejectedValue({
      statusCode: 410,
      headers: { 'content-type': 'application/json' },
      body: '{"reason":"Unregistered"}',
      // `WebPushError` expone además el endpoint. No puede salir de aquí.
      endpoint: SUSCRIPCION.endpoint,
      message: 'Received unexpected response code',
    });

    const r = await enviar(SUSCRIPCION, '{}', OPCIONES);

    expect(r.statusCode).toBe(410);
    expect(r.headers).toEqual({ 'content-type': 'application/json' });
    expect(r.body).toBe('{"reason":"Unregistered"}');
  });

  it('un fallo de red PURO, sin `statusCode`, vuelve como cero y tampoco lanza', async () => {
    const { enviar } = await cargar();
    sendNotification.mockRejectedValue(new Error('socket hang up'));

    // Cero es lo que `decidir()` clasifica como bug sin clasificar, que es la
    // respuesta correcta: no se desactiva nada y queda escrito para mirarlo.
    await expect(enviar(SUSCRIPCION, '{}', OPCIONES)).resolves.toMatchObject({ statusCode: 0 });
  });

  it('una RESOLUCIÓN devuelve exactamente los tres campos de la librería', async () => {
    const { enviar } = await cargar();
    sendNotification.mockResolvedValue({
      statusCode: 201,
      headers: { location: 'https://web.push.apple.com/mensaje' },
      body: '',
    });

    const r = await enviar(SUSCRIPCION, '{"a":1}', OPCIONES);

    expect(r).toEqual({
      statusCode: 201,
      headers: { location: 'https://web.push.apple.com/mensaje' },
      body: '',
    });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// T-05-04 — la credencial de envío no sale
// ───────────────────────────────────────────────────────────────────────────

describe('T-05-04 · lo devuelto no tiene dónde guardar una credencial', () => {
  it('el objeto de retorno solo declara los tres campos de la respuesta', async () => {
    const { enviar } = await cargar();
    sendNotification.mockRejectedValue({
      statusCode: 403,
      headers: {},
      body: '{"reason":"VapidPkHashMismatch"}',
      endpoint: SUSCRIPCION.endpoint,
    });

    const r = await enviar(SUSCRIPCION, '{}', OPCIONES);

    // Sobre las CLAVES del objeto, no sobre su contenido: quien tiene el
    // endpoint puede escribirle a ese teléfono, y un log es para siempre.
    expect(Object.keys(r).sort()).toEqual(['body', 'headers', 'statusCode']);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Las cabeceras
// ───────────────────────────────────────────────────────────────────────────

describe('las cabeceras del envío', () => {
  beforeEach(() => {
    sendNotification.mockResolvedValue({ statusCode: 201, headers: {}, body: '' });
  });

  it('la librería recibe TTL, urgencia, topic y timeout tal como los pasó el llamador', async () => {
    const { enviar } = await cargar();

    await enviar(SUSCRIPCION, '{"a":1}', {
      ttl: 14_400,
      urgency: 'normal',
      topic: 'OtraClaveDeColapso',
      timeoutMs: 7_500,
    });

    const { sub, payload, opciones } = ultimaLlamada();
    expect(sub).toEqual(SUSCRIPCION);
    expect(payload).toBe('{"a":1}');
    expect(opciones.TTL).toBe(14_400);
    expect(opciones.urgency).toBe('normal');
    expect(opciones.topic).toBe('OtraClaveDeColapso');
    expect(opciones.timeout).toBe(7_500);
  });

  it('un `topic` que no cabe en la cabecera NO se manda, en vez de mandarse roto', async () => {
    const { enviar } = await cargar();

    // El señuelo: el UUID crudo. Treinta y seis caracteres y guiones, que no
    // están en el alfabeto base64url. Mandarlo devuelve `BadWebPushTopic`, que
    // `decidir()` clasifica como bug y descarta el aviso entero. Sin cabecera
    // el aviso sale igual: solo pierde el colapso en el servidor de push.
    await enviar(SUSCRIPCION, '{}', {
      ...OPCIONES,
      topic: '6f1a2b3c-4d5e-4f60-8a91-0b2c3d4e5f60',
    });

    expect(Object.keys(ultimaLlamada().opciones)).not.toContain('topic');
  });

  it('sin `topic` tampoco se manda la cabecera', async () => {
    const { enviar } = await cargar();

    await enviar(SUSCRIPCION, '{}', { ttl: 14_400, urgency: 'high', timeoutMs: 10_000 });

    expect(Object.keys(ultimaLlamada().opciones)).not.toContain('topic');
  });

  it('el timeout por defecto son diez segundos, con la razón escrita en el módulo', async () => {
    const { TIMEOUT_MS } = await cargar();
    expect(TIMEOUT_MS).toBe(10_000);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// La configuración de VAPID
// ───────────────────────────────────────────────────────────────────────────

describe('la configuración de VAPID', () => {
  beforeEach(() => {
    sendNotification.mockResolvedValue({ statusCode: 201, headers: {}, body: '' });
  });

  it('se configura una sola vez por proceso, aunque se envíen varias notificaciones', async () => {
    const { enviar } = await cargar();

    await enviar(SUSCRIPCION, '{}', OPCIONES);
    await enviar(SUSCRIPCION, '{}', OPCIONES);
    await enviar(SUSCRIPCION, '{}', OPCIONES);

    expect(setVapidDetails).toHaveBeenCalledTimes(1);
    expect(setVapidDetails).toHaveBeenCalledWith(
      ENTORNO_BASE.VAPID_SUBJECT,
      ENTORNO_BASE.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      ENTORNO_BASE.VAPID_PRIVATE_KEY,
    );
  });

  it('un subject apuntando a un host local falla acá, no con `BadJwtToken` en producción', async () => {
    for (const roto of [
      'https://localhost:3000',
      'https://127.0.0.1',
      'mailto:dev@localhost',
      'http://vivaguest.example.com',
      'operaciones@vivaguest.co',
      'tel:+573001234567',
    ]) {
      const { enviar } = await cargar({ VAPID_SUBJECT: roto });
      await expect(enviar(SUSCRIPCION, '{}', OPCIONES)).rejects.toThrow(/VAPID_SUBJECT/);
      expect(sendNotification).not.toHaveBeenCalled();
    }
  });

  it('un subject `https` público o un `mailto` real sí pasan', async () => {
    for (const bueno of ['mailto:operaciones@vivaguest.co', 'https://vivaguest.example.com/contacto']) {
      const { enviar } = await cargar({ VAPID_SUBJECT: bueno });
      await expect(enviar(SUSCRIPCION, '{}', OPCIONES)).resolves.toMatchObject({ statusCode: 201 });
    }
  });

  it('la clave privada ausente falla al configurar y no manda nada', async () => {
    const { enviar } = await cargar({ VAPID_PRIVATE_KEY: undefined });

    await expect(enviar(SUSCRIPCION, '{}', OPCIONES)).rejects.toThrow(/VAPID_PRIVATE_KEY/);
    expect(sendNotification).not.toHaveBeenCalled();
  });
});
