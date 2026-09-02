import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  enmascararUrlIcal,
  esUrlIcalDeAirbnb,
  esquemaUrlIcal,
  hostsPermitidos,
  permiteHostLocal,
  MENSAJE_FORMATO_INVALIDO,
} from './ical-url.schema';

/**
 * La allowlist de host, que es la PRIMERA MITAD de la defensa anti-SSRF
 * (T-02-72). La segunda mitad —`redirect: 'manual'`— no se puede medir aquí:
 * vive en el `fetch` de `validarFeed` y la cubre `e2e/calendario.spec.ts` con
 * una ruta que responde 302.
 *
 * Los dos casos que dan sentido a este archivo son los de EVASIÓN DE HOST. Una
 * implementación con regex sobre la cadena completa pasa todos los demás y se
 * cae solo en esos dos; una que compare el sufijo sin frontera de etiqueta pasa
 * todos menos uno. Están marcados abajo.
 */

const VALIDA = 'https://www.airbnb.com/calendar/ical/12345678.ics?s=abc123';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('esquemaUrlIcal — la forma de la URL', () => {
  test('una URL de exportación de Airbnb con query ?s= se acepta', () => {
    const r = esquemaUrlIcal.safeParse(VALIDA);
    expect(r.success).toBe(true);
    expect(r.success && r.data).toBe(VALIDA);
  });

  test('el dominio .com.co también está en la allowlist', () => {
    expect(esUrlIcalDeAirbnb('https://www.airbnb.com.co/calendar/ical/9.ics?s=x')).toBe(true);
    expect(hostsPermitidos).toContain('airbnb.com.co');
  });

  test('el protocolo http: se rechaza contra el host de Airbnb', () => {
    // La URL es una credencial: por http viajaría en texto claro.
    expect(esUrlIcalDeAirbnb('http://www.airbnb.com/calendar/ical/1.ics')).toBe(false);
  });

  test('un host que no es de Airbnb se rechaza', () => {
    expect(esUrlIcalDeAirbnb('https://booking.com/calendar/ical/1.ics')).toBe(false);
  });

  test('EVASIÓN 1: el host va en el path o en la query, no en el hostname', () => {
    // Contiene `airbnb.com`, `/calendar/ical/` y `.ics`. Cualquier regex sobre
    // la cadena completa la acepta. Su hostname es `evil.com`.
    expect(esUrlIcalDeAirbnb('https://evil.com/?x=airbnb.com/calendar/ical/1.ics')).toBe(false);
  });

  test('EVASIÓN 2: el dominio de Airbnb como PREFIJO de otro dominio', () => {
    // `endsWith('airbnb.com')` sobre la cadena entera la aceptaría al revés;
    // aquí lo que falla es comparar sin frontera de etiqueta.
    expect(esUrlIcalDeAirbnb('https://www.airbnb.com.evil.com/calendar/ical/1.ics')).toBe(false);
  });

  test('EVASIÓN 3: el dominio de Airbnb como userinfo', () => {
    // `https://usuario@host/…`: el host real es `evil.com`. `URL.hostname` lo
    // resuelve bien; un `split('/')[2]` a mano, no.
    expect(esUrlIcalDeAirbnb('https://www.airbnb.com@evil.com/calendar/ical/1.ics')).toBe(false);
  });

  test('EVASIÓN 4: `notairbnb.com` no es un subdominio de `airbnb.com`', () => {
    expect(esUrlIcalDeAirbnb('https://notairbnb.com/calendar/ical/1.ics')).toBe(false);
  });

  test('un path sin /calendar/ical/ se rechaza', () => {
    // Es el error real del admin: pegar el link del anuncio en vez del de
    // exportación.
    expect(esUrlIcalDeAirbnb('https://www.airbnb.com/rooms/12345678.ics')).toBe(false);
  });

  test('un path que no termina en .ics se rechaza', () => {
    expect(esUrlIcalDeAirbnb('https://www.airbnb.com/calendar/ical/12345678')).toBe(false);
  });

  test('la query no cuenta como final del path: ?s=….ics no basta', () => {
    expect(esUrlIcalDeAirbnb('https://www.airbnb.com/calendar/ical/12345678?s=x.ics')).toBe(false);
  });

  test('una cadena que no es una URL absoluta se rechaza sin lanzar', () => {
    expect(esUrlIcalDeAirbnb('12345678.ics')).toBe(false);
    expect(esUrlIcalDeAirbnb('/calendar/ical/1.ics')).toBe(false);
    expect(esUrlIcalDeAirbnb('')).toBe(false);
  });

  test('el mensaje de error es el copy literal de UI-SPEC §10.3 estado 2', () => {
    const r = esquemaUrlIcal.safeParse('https://evil.com/x');
    expect(r.success).toBe(false);
    expect(r.success === false && r.error.issues[0].message).toBe(MENSAJE_FORMATO_INVALIDO);
  });

  test('el campo vacío también produce el mensaje de formato, no uno de longitud', () => {
    const r = esquemaUrlIcal.safeParse('   ');
    expect(r.success).toBe(false);
    expect(r.success === false && r.error.issues[0].message).toBe(MENSAJE_FORMATO_INVALIDO);
  });
});

describe('la concesión de 127.0.0.1 y su candado de dos vueltas', () => {
  test('fuera de producción se admite el loopback por http', () => {
    // `vitest` corre con NODE_ENV='test'.
    expect(permiteHostLocal()).toBe(true);
    expect(esUrlIcalDeAirbnb('http://127.0.0.1:4599/calendar/ical/feliz.ics')).toBe(true);
  });

  test('el loopback sigue obligado a la forma: sin .ics no pasa', () => {
    // La concesión relaja el HOST, no el resto de la regla.
    expect(esUrlIcalDeAirbnb('http://127.0.0.1:4599/calendar/ical/feliz')).toBe(false);
    expect(esUrlIcalDeAirbnb('http://127.0.0.1:4599/otra/ruta.ics')).toBe(false);
  });

  test('`localhost` NO está en la concesión: solo la IP literal', () => {
    // Un nombre pasa por el resolvedor y puede apuntar a cualquier sitio.
    expect(esUrlIcalDeAirbnb('http://localhost:4599/calendar/ical/feliz.ics')).toBe(false);
  });

  test('CANDADO 1: en producción sin la variable de build, el loopback se rechaza', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(permiteHostLocal()).toBe(false);
    expect(esUrlIcalDeAirbnb('http://127.0.0.1:4599/calendar/ical/feliz.ics')).toBe(false);
    // Y la URL buena sigue pasando: el candado no rompe el caso real.
    expect(esUrlIcalDeAirbnb(VALIDA)).toBe(true);
  });

  test('CANDADO 2: en producción con la variable de build, el loopback vuelve', () => {
    // Es lo que hace `playwright.config.ts`, que arranca `next start` y por
    // tanto corre con NODE_ENV='production'.
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_VIVAGUEST_FEED_LOCAL', '1');
    expect(permiteHostLocal()).toBe(true);
    expect(esUrlIcalDeAirbnb('http://127.0.0.1:4599/calendar/ical/feliz.ics')).toBe(true);
  });

  test('un valor distinto de "1" no abre la concesión', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_VIVAGUEST_FEED_LOCAL', 'true');
    expect(permiteHostLocal()).toBe(false);
  });
});

describe('enmascararUrlIcal — la credencial no se vuelve a pintar entera (T-02-74)', () => {
  test('el ?s= desaparece por completo y el archivo sigue reconocible', () => {
    const salida = enmascararUrlIcal('https://www.airbnb.com/calendar/ical/12345678.ics?s=SECRETO123');

    expect(salida).toBe('…/calendar/ical/12345678.ics?s=••••••••');
    // Las dos aserciones que de verdad protegen: ni el secreto ni el host.
    expect(salida).not.toContain('SECRETO123');
    expect(salida).not.toContain('airbnb.com');
  });

  test('ni un trozo del secreto sobrevive, aunque sea corto', () => {
    // Un enmascarado que conserve "los últimos 4" no sirve: el `s` de Airbnb es
    // corto y adivinable a partir de un prefijo.
    const salida = enmascararUrlIcal('https://www.airbnb.com/calendar/ical/1.ics?s=ab');
    expect(salida).not.toMatch(/ab/);
  });

  test('sin query no se inventa un ?s=', () => {
    expect(enmascararUrlIcal('https://www.airbnb.com/calendar/ical/9.ics')).toBe(
      '…/calendar/ical/9.ics',
    );
  });

  test('una fila vieja con basura no rompe la pantalla ni se muestra tal cual', () => {
    const salida = enmascararUrlIcal('esto-no-es-una-url');
    expect(salida).not.toContain('esto-no-es-una-url');
    expect(salida).toContain('•');
  });
});
