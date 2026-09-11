import { describe, expect, it } from 'vitest';

import {
  HOSTS_DE_PUSH,
  MENSAJE_ENDPOINT_INVALIDO,
  esEndpointDePush,
  esquemaEndpointDePush,
  esquemaSuscripcion,
} from './suscripcion.schema';

/**
 * LA ALLOWLIST DE HOSTS DE PUSH, PROBADA COMO LO QUE ES: UNA DEFENSA ANTI-SSRF.
 *
 * El `endpoint` de una suscripcion es una URL que NUESTRO SERVIDOR va a visitar
 * con POST. Sin esta validacion, cualquiera con sesion de aseador registra un
 * endpoint apuntando a un servicio interno y usa el worker de drenaje como
 * emisor de peticiones a donde quiera (T-05-02).
 *
 * Es el mismo contrato que `./ical-url.schema.test.ts` prueba para los feeds, y
 * los casos deceptivos son los mismos porque el modo de fallo es el mismo: una
 * comparacion por `includes` sobre la cadena cruda acepta `evil.com` con el host
 * bueno metido en la query, y un `endsWith` sin el punto acepta el dominio que
 * TERMINA en el nombre bueno sin ser un subdominio suyo.
 */

/** 65 bytes de punto P-256 sin comprimir → 87 caracteres de base64url. */
const P256DH = `B${'a'.repeat(86)}`;
/** 16 bytes de secreto de autenticacion → 22 caracteres de base64url. */
const AUTH = 'c'.repeat(22);

function suscripcion(sobrescribir: Record<string, unknown> = {}) {
  return {
    endpoint: 'https://web.push.apple.com/QABC123',
    keys: { p256dh: P256DH, auth: AUTH },
    soportaDeclarativo: true,
    userAgent: 'Mozilla/5.0 (iPhone)',
    ...sobrescribir,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 1. LOS CUATRO HOSTS DE LA LISTA
// ════════════════════════════════════════════════════════════════════════════

describe('los cuatro hosts de push conocidos', () => {
  it('la lista es exactamente la del research, sin uno de mas', () => {
    expect([...HOSTS_DE_PUSH]).toEqual([
      'push.apple.com',
      'fcm.googleapis.com',
      'push.services.mozilla.com',
      'notify.windows.com',
    ]);
  });

  it.each([
    ['Apple, subdominio real', 'https://web.push.apple.com/QABC123'],
    ['Google, host exacto', 'https://fcm.googleapis.com/fcm/send/abc:XYZ'],
    ['Mozilla, subdominio real', 'https://updates.push.services.mozilla.com/wpush/v2/gAAA'],
    ['Microsoft, subdominio real', 'https://par02p.notify.windows.com/w/?token=AQ'],
  ])('acepta el endpoint de %s con https', (_caso, endpoint) => {
    expect(esEndpointDePush(endpoint)).toBe(true);
    expect(esquemaEndpointDePush.safeParse(endpoint).success).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. EL PROTOCOLO
// ════════════════════════════════════════════════════════════════════════════

describe('https es obligatorio', () => {
  it.each([
    'http://web.push.apple.com/QABC123',
    'http://fcm.googleapis.com/fcm/send/abc',
  ])('rechaza %s aunque el host SI este en la lista', (endpoint) => {
    expect(esEndpointDePush(endpoint)).toBe(false);
  });

  it('rechaza un esquema que no es http ni https', () => {
    expect(esEndpointDePush('file:///etc/passwd')).toBe(false);
    expect(esEndpointDePush('gopher://web.push.apple.com/')).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. LA FRONTERA DE ETIQUETA. ESTE ES EL GRUPO QUE JUSTIFICA EL ARCHIVO.
// ════════════════════════════════════════════════════════════════════════════

describe('la comprobacion es por SUFIJO DE DOMINIO CON PUNTO, no por includes', () => {
  it.each([
    [
      'el host bueno como PREFIJO de otro dominio',
      'https://push.apple.com.evil.com/QABC123',
    ],
    [
      'un dominio que TERMINA en el nombre bueno sin ser subdominio suyo',
      'https://xpush.apple.com/QABC123',
    ],
    [
      'otro que termina en el nombre bueno, del lado de Google',
      'https://notfcm.googleapis.com/fcm/send/abc',
    ],
    [
      'el host bueno dentro de la query de otro dominio',
      'https://evil.com/?x=https://web.push.apple.com/QABC123',
    ],
    [
      'el host bueno como userinfo, que NO es el host',
      'https://web.push.apple.com@evil.com/QABC123',
    ],
  ])('rechaza %s', (_caso, endpoint) => {
    expect(esEndpointDePush(endpoint)).toBe(false);
  });

  it('un FQDN con punto final sigue siendo el mismo host y se acepta', () => {
    expect(esEndpointDePush('https://web.push.apple.com./QABC123')).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. LO QUE EL SSRF BUSCARIA DE VERDAD
// ════════════════════════════════════════════════════════════════════════════

describe('ni IP literal ni host local', () => {
  it.each([
    ['el metadato de la nube', 'https://169.254.169.254/latest/meta-data/'],
    ['loopback por IP', 'https://127.0.0.1:54321/rest/v1/profiles'],
    ['loopback por nombre', 'https://localhost:54321/rest/v1/profiles'],
    ['red privada', 'https://10.0.0.5/interno'],
    ['IPv6 de loopback', 'https://[::1]/interno'],
  ])('rechaza %s', (_caso, endpoint) => {
    expect(esEndpointDePush(endpoint)).toBe(false);
  });

  it('una cadena que no es una URL absoluta tampoco pasa', () => {
    expect(esEndpointDePush('/fcm/send/abc')).toBe(false);
    expect(esEndpointDePush('web.push.apple.com/QABC123')).toBe(false);
    expect(esEndpointDePush('')).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5. LAS DOS CLAVES
// ════════════════════════════════════════════════════════════════════════════

describe('p256dh y auth: alfabeto y longitud', () => {
  it('rechaza un p256dh con caracteres fuera del alfabeto base64url', () => {
    const r = esquemaSuscripcion.safeParse(
      suscripcion({ keys: { p256dh: `B+/${'a'.repeat(84)}`, auth: AUTH } }),
    );
    expect(r.success).toBe(false);
  });

  it('rechaza un p256dh demasiado corto', () => {
    const r = esquemaSuscripcion.safeParse(
      suscripcion({ keys: { p256dh: 'Bab', auth: AUTH } }),
    );
    expect(r.success).toBe(false);
  });

  it('rechaza un auth demasiado largo', () => {
    const r = esquemaSuscripcion.safeParse(
      suscripcion({ keys: { p256dh: P256DH, auth: 'c'.repeat(200) } }),
    );
    expect(r.success).toBe(false);
  });

  it('rechaza un auth con el alfabeto estandar en vez del url-safe', () => {
    const r = esquemaSuscripcion.safeParse(
      suscripcion({ keys: { p256dh: P256DH, auth: `c+/${'c'.repeat(19)}` } }),
    );
    expect(r.success).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 6. EL CASO VALIDO COMPLETO, Y SU NORMALIZACION
// ════════════════════════════════════════════════════════════════════════════

describe('el caso valido completo', () => {
  it('acepta y devuelve los campos normalizados', () => {
    const r = esquemaSuscripcion.safeParse(
      suscripcion({ endpoint: '  https://web.push.apple.com/QABC123  ' }),
    );

    expect(r.success).toBe(true);
    if (!r.success) return;

    expect(r.data.endpoint).toBe('https://web.push.apple.com/QABC123');
    expect(r.data.keys.p256dh).toBe(P256DH);
    expect(r.data.keys.auth).toBe(AUTH);
    expect(r.data.soportaDeclarativo).toBe(true);
    expect(r.data.userAgent).toBe('Mozilla/5.0 (iPhone)');
  });

  it('el userAgent es opcional y se recorta a un tamano acotado', () => {
    const sinUa = esquemaSuscripcion.safeParse(suscripcion({ userAgent: undefined }));
    expect(sinUa.success).toBe(true);

    const largo = esquemaSuscripcion.safeParse(suscripcion({ userAgent: 'M'.repeat(900) }));
    expect(largo.success).toBe(true);
    if (!largo.success) return;
    expect(largo.data.userAgent).toHaveLength(512);
  });

  it('un endpoint fuera de la lista falla con el mensaje del contrato', () => {
    const r = esquemaSuscripcion.safeParse(
      suscripcion({ endpoint: 'https://evil.com/QABC123' }),
    );
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.issues[0].message).toBe(MENSAJE_ENDPOINT_INVALIDO);
  });
});
