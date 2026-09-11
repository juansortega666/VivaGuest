import { describe, expect, it } from 'vitest';

import {
  base64UrlAUint8,
  esNavegadorEmbebido,
  estaInstalada,
  plataformaVisible,
  soportaDeclarativo,
  type VentanaDeAvisos,
} from './plataforma';

/**
 * Dobles PLANOS de `window`, no jsdom completo, y es deliberado: cada caso dice
 * EXACTAMENTE que se esta simulando. Con jsdom, "el navegador no tiene
 * `pushManager`" seria una ausencia invisible entre doscientas propiedades; aqui es
 * la unica linea del objeto.
 */
function ventana(parcial: VentanaDeAvisos = {}): VentanaDeAvisos {
  return parcial;
}

/** Devuelve un `matchMedia` que solo contesta `true` a la consulta indicada. */
function conMediaQuery(consultaViva: string) {
  return (consulta: string) => ({ matches: consulta === consultaViva });
}

const UA_SAFARI_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const UA_CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const UA_ESCRITORIO =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const UA_WHATSAPP =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WhatsApp/2.24.10.77';
const UA_INSTAGRAM =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 334.0.0.32.95 (iPhone14,2; iOS 17_5)';
const UA_FACEBOOK =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/466.0.0.35.107;FBBV/589878423]';

describe('estaInstalada', () => {
  it('cierto con display-mode: standalone, que es el camino de Android y de iOS moderno', () => {
    expect(estaInstalada(ventana({ matchMedia: conMediaQuery('(display-mode: standalone)') }))).toBe(
      true,
    );
  });

  it('cierto con el indicador heredado de Safari, aunque matchMedia diga que no', () => {
    const w = ventana({
      matchMedia: conMediaQuery('(display-mode: fullscreen)'),
      navigator: { standalone: true },
    });

    expect(estaInstalada(w)).toBe(true);
  });

  it('falso con los dos ausentes: una pestana normal', () => {
    expect(estaInstalada(ventana({ matchMedia: conMediaQuery('(display-mode: browser)') }))).toBe(
      false,
    );
    expect(estaInstalada(ventana({ navigator: { standalone: false } }))).toBe(false);
    expect(estaInstalada(ventana())).toBe(false);
  });
});

describe('soportaDeclarativo', () => {
  it('cierto cuando existe pushManager en la VENTANA (Safari 18.4+)', () => {
    expect(soportaDeclarativo(ventana({ pushManager: {} }))).toBe(true);
  });

  it('falso cuando no existe, que es el caso de Chrome', () => {
    expect(soportaDeclarativo(ventana())).toBe(false);
    expect(soportaDeclarativo(ventana({ navigator: { userAgent: UA_CHROME_ANDROID } }))).toBe(false);
  });

  it('NO mira el del registro del service worker: son cosas distintas', () => {
    // `ServiceWorkerRegistration.pushManager` existe en TODAS partes, incluida
    // Chrome. Confundirlo con `Window.pushManager` marcaria a Chrome como
    // compatible con el formato declarativo, que es precisamente lo que
    // crbug.com/382298314 dice que no es.
    const conRegistro = ventana({ navigator: { userAgent: UA_CHROME_ANDROID } }) as VentanaDeAvisos & {
      serviceWorker?: { registration?: { pushManager?: unknown } };
    };
    conRegistro.serviceWorker = { registration: { pushManager: {} } };

    expect(soportaDeclarativo(conRegistro)).toBe(false);
  });
});

describe('esNavegadorEmbebido', () => {
  it('detecta WhatsApp, que es el caso mas probable porque el link va por ahi', () => {
    expect(esNavegadorEmbebido(ventana({ navigator: { userAgent: UA_WHATSAPP } }))).toBe(true);
  });

  it('detecta Instagram', () => {
    expect(esNavegadorEmbebido(ventana({ navigator: { userAgent: UA_INSTAGRAM } }))).toBe(true);
  });

  it('detecta Facebook por sus marcas FBAN / FBAV', () => {
    expect(esNavegadorEmbebido(ventana({ navigator: { userAgent: UA_FACEBOOK } }))).toBe(true);
  });

  it('falso en Safari, en Chrome y sin userAgent', () => {
    expect(esNavegadorEmbebido(ventana({ navigator: { userAgent: UA_SAFARI_IOS } }))).toBe(false);
    expect(esNavegadorEmbebido(ventana({ navigator: { userAgent: UA_CHROME_ANDROID } }))).toBe(false);
    expect(esNavegadorEmbebido(ventana())).toBe(false);
  });
});

describe('plataformaVisible', () => {
  it('iphone', () => {
    expect(plataformaVisible(ventana({ navigator: { userAgent: UA_SAFARI_IOS } }))).toBe('iphone');
  });

  it('android', () => {
    expect(plataformaVisible(ventana({ navigator: { userAgent: UA_CHROME_ANDROID } }))).toBe(
      'android',
    );
  });

  it('otro cuando no se puede decidir, que es por lo que existe el toggle manual de §8.3', () => {
    expect(plataformaVisible(ventana({ navigator: { userAgent: UA_ESCRITORIO } }))).toBe('otro');
    expect(plataformaVisible(ventana())).toBe('otro');
  });
});

describe('base64UrlAUint8', () => {
  it('convierte una clave que NO necesita relleno', () => {
    expect(Array.from(base64UrlAUint8('AQAB'))).toEqual([1, 0, 1]);
  });

  it('convierte una clave que SI necesita relleno, con los dos caracteres propios de base64url', () => {
    // `-` y `_` son los que distinguen base64url de base64: sin la traduccion a
    // `+` y `/`, la clave VAPID se decodifica mal y la suscripcion nace muerta.
    expect(Array.from(base64UrlAUint8('-w'))).toEqual([251]);
    expect(Array.from(base64UrlAUint8('_A'))).toEqual([252]);
  });

  it('devuelve un Uint8Array, que es lo que applicationServerKey acepta', () => {
    expect(base64UrlAUint8('BEl1')).toBeInstanceOf(Uint8Array);
    expect(Array.from(base64UrlAUint8('BEl1'))).toEqual([4, 73, 117]);
  });

  it('falla de forma CLARA con una cadena que no es base64url', () => {
    // Sin esta guarda, una clave mal copiada en una variable de entorno produce
    // un `InvalidCharacterError` de `atob` a cien lineas del sitio real.
    expect(() => base64UrlAUint8('esto no es base64url')).toThrow(/base64url/);
    expect(() => base64UrlAUint8('con+mas/simbolos=')).toThrow(/base64url/);
    expect(() => base64UrlAUint8('')).toThrow(/base64url/);
  });
});
