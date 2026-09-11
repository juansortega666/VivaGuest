import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  ESPERAS_MS,
  TOPE_DE_INTENTOS,
  TOPE_DE_ESPERA_MS,
  decidir,
  type DecisionPush,
} from './errores';

/**
 * LOS CINCO SEÑUELOS DE LA CAPA 1 DEL `05-RESEARCH.md` (U1 a U5), MÁS LA
 * PROPIEDAD DE NO FUGA DEL CUERPO (T-05-22).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * U2 ES EL SEÑUELO MÁS CARO DE LA FASE Y POR ESO VA PRIMERO EN EL ARCHIVO.
 *
 * Si `decidir()` manda cualquier 4xx a `desactivar_suscripcion`, un `403` de
 * configuración —el que sale al rotar mal el par VAPID— borra las OCHO
 * suscripciones de la operación en una sola corrida, y hay que reinstalar la
 * PWA en ocho teléfonos a mano. `404` y `410` son las únicas dos entradas
 * legítimas a esa decisión.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── UNA NOTA SOBRE EL EJEMPLO LITERAL DEL PLAN, MEDIDA AQUÍ ─────────────────
 *
 * El plan pide el caso `decidir(429, {'retry-after': '60'}) -> esperarMs 60000`.
 * Escrito tal cual con `intento = 1` es un FALSO VERDE: la primera casilla de
 * la tabla de backoff propio también son 60 000 ms, así que el test pasaría
 * igual con la cabecera ignorada, que es exactamente el señuelo U5. Los casos
 * de 429 de este archivo usan a propósito valores de `retry-after` que NO
 * coinciden con la casilla de la tabla para ese intento.
 */

// Un cuerpo de respuesta de APNs con su `reason`, tal como llega en `body`.
const cuerpo = (reason: string) => JSON.stringify({ reason });

// El primer intento, que es el caso por defecto de casi todo el archivo.
const PRIMERO = 1;

describe('decidir(): la suscripción muerta y la configuración rota no se confunden', () => {
  it('U2 — un 403 con VapidPkHashMismatch pide RE-SUSCRIPCIÓN, no desactivación', () => {
    const d = decidir(403, cuerpo('VapidPkHashMismatch'), undefined, PRIMERO);

    expect(d.tipo).toBe('requiere_resuscripcion');
    expect(d).toEqual({ tipo: 'requiere_resuscripcion', motivo: 'VapidPkHashMismatch' });
  });

  it('U2 (el señuelo, dicho al revés) — ese mismo 403 NUNCA desactiva la suscripción', () => {
    const d = decidir(403, cuerpo('VapidPkHashMismatch'), undefined, PRIMERO);

    // Si esta aserción cae, se borraron las ocho suscripciones de la operación.
    expect(d.tipo).not.toBe('desactivar_suscripcion');
    // Y tampoco es la rama genérica de 403: una sola suscripción desalineada no
    // puede tumbar la corrida entera.
    expect(d.tipo).not.toBe('abortar_corrida');
  });

  it('U1 — un 410 desactiva la suscripción, permanentemente', () => {
    expect(decidir(410, undefined, undefined, PRIMERO)).toEqual({
      tipo: 'desactivar_suscripcion',
      motivo: 'http_410',
    });
  });

  it('un 404 desactiva la suscripción: el `:path` ya no existe', () => {
    expect(decidir(404, undefined, undefined, PRIMERO)).toEqual({
      tipo: 'desactivar_suscripcion',
      motivo: 'http_404',
    });
  });

  it('un 410 con los intentos agotados SIGUE siendo desactivar, no descartar', () => {
    // El tope de intentos solo gobierna la rama de reintento. Una suscripción
    // muerta lo está sin importar cuántas veces se haya intentado.
    expect(decidir(410, undefined, undefined, TOPE_DE_INTENTOS + 5)).toEqual({
      tipo: 'desactivar_suscripcion',
      motivo: 'http_410',
    });
  });
});

describe('decidir(): la configuración global rota detiene la corrida entera', () => {
  it('U3 — un 403 con BadJwtToken aborta la corrida', () => {
    expect(decidir(403, cuerpo('BadJwtToken'), undefined, PRIMERO)).toEqual({
      tipo: 'abortar_corrida',
      motivo: 'BadJwtToken',
    });
  });

  it('U3 — un BadVapidPublicKey aborta igual, y aborta aunque el status no sea 403', () => {
    expect(decidir(403, cuerpo('BadVapidPublicKey'), undefined, PRIMERO).tipo).toBe(
      'abortar_corrida',
    );
    // El `reason` manda sobre el status: si la clave pública está mal, ninguna
    // notificación de la corrida va a salir, responda 400 o responda 403.
    expect(decidir(400, cuerpo('BadJwtToken'), undefined, PRIMERO).tipo).toBe('abortar_corrida');
  });

  it('un 403 SIN reason legible aborta la corrida: no se asume que sea desalineación', () => {
    expect(decidir(403, undefined, undefined, PRIMERO)).toEqual({
      tipo: 'abortar_corrida',
      motivo: 'http_403',
    });
  });

  it('U3 (el señuelo) — un BadJwtToken no se degrada a reintentar', () => {
    // Degradarlo quemaría los cuatro intentos de cada notificación contra una
    // configuración que no va a arreglarse sola.
    expect(decidir(403, cuerpo('BadJwtToken'), undefined, PRIMERO).tipo).not.toBe('reintentar');
  });
});

describe('decidir(): los bugs de código no se reintentan', () => {
  it('400, 405 y 413 son bug', () => {
    expect(decidir(400, undefined, undefined, PRIMERO).tipo).toBe('bug');
    expect(decidir(405, undefined, undefined, PRIMERO).tipo).toBe('bug');
    expect(decidir(413, undefined, undefined, PRIMERO).tipo).toBe('bug');
  });

  it('el reason conocido viaja al motivo cuando lo hay', () => {
    expect(decidir(413, cuerpo('PayloadTooLarge'), undefined, PRIMERO)).toEqual({
      tipo: 'bug',
      motivo: 'PayloadTooLarge',
    });
    expect(decidir(400, cuerpo('BadWebPushTopic'), undefined, PRIMERO)).toEqual({
      tipo: 'bug',
      motivo: 'BadWebPushTopic',
    });
  });

  it('un código fuera de la tabla de Apple cae en bug NO CLASIFICADO, nunca en un else mudo', () => {
    expect(decidir(418, undefined, undefined, PRIMERO)).toEqual({
      tipo: 'bug',
      motivo: 'http_418_no_clasificado',
    });
    expect(decidir(451, undefined, undefined, PRIMERO)).toEqual({
      tipo: 'bug',
      motivo: 'http_451_no_clasificado',
    });
  });
});

describe('decidir(): el 429 respeta la cabecera del push service', () => {
  it('U5 — con retry-after usable, la espera es la que pidió el servidor', () => {
    // 90 s no es ninguna casilla de la tabla: si la cabecera se ignorara, esto
    // devolvería 60 000 y el test caería.
    expect(decidir(429, undefined, { 'retry-after': '90' }, PRIMERO)).toEqual({
      tipo: 'reintentar',
      esperarMs: 90_000,
      motivo: 'http_429',
    });
  });

  it('U5 — la cabecera manda AUNQUE pida menos que la tabla', () => {
    // Intento 2, cuya casilla son 300 000 ms. La cabecera pide 30 s.
    const d = decidir(429, undefined, { 'retry-after': '30' }, 2);
    expect(d).toEqual({ tipo: 'reintentar', esperarMs: 30_000, motivo: 'http_429' });
    expect(d.tipo === 'reintentar' && d.esperarMs).not.toBe(ESPERAS_MS[1]);
  });

  it('la cabecera se lee sin importar cómo venga capitalizada', () => {
    const d = decidir(429, undefined, { 'Retry-After': '90' }, PRIMERO);
    expect(d).toEqual({ tipo: 'reintentar', esperarMs: 90_000, motivo: 'http_429' });
  });

  it('sin cabecera, o con una que no es un número, cae al backoff propio', () => {
    expect(decidir(429, undefined, undefined, PRIMERO)).toEqual({
      tipo: 'reintentar',
      esperarMs: ESPERAS_MS[0],
      motivo: 'http_429',
    });
    // Un `retry-after` en formato fecha HTTP es legal en la RFC y no se soporta.
    expect(decidir(429, undefined, { 'retry-after': 'Wed, 21 Oct 2026 07:28:00 GMT' }, 2)).toEqual({
      tipo: 'reintentar',
      esperarMs: ESPERAS_MS[1],
      motivo: 'http_429',
    });
    // Cero y negativo no son esperas: reintentar ya mismo es martillear.
    expect(decidir(429, undefined, { 'retry-after': '0' }, PRIMERO)).toEqual({
      tipo: 'reintentar',
      esperarMs: ESPERAS_MS[0],
      motivo: 'http_429',
    });
  });

  it('un retry-after absurdo se recorta al tope de una hora', () => {
    // Un día. El TTL del aviso es de horas: esperar un día es guardar ruido.
    const d = decidir(429, undefined, { 'retry-after': '86400' }, PRIMERO);
    expect(d).toEqual({ tipo: 'reintentar', esperarMs: TOPE_DE_ESPERA_MS, motivo: 'http_429' });
    expect(TOPE_DE_ESPERA_MS).toBe(3_600_000);
  });

  it('un 429 NUNCA desactiva la suscripción', () => {
    expect(decidir(429, cuerpo('TooManyRequests'), undefined, PRIMERO).tipo).toBe('reintentar');
  });
});

describe('decidir(): el backoff de los transitorios crece y tiene tope de intentos', () => {
  it('U4 — 500 y 503 reintentan con espera CRECIENTE entre intentos', () => {
    const primero = decidir(500, undefined, undefined, 1);
    const tercero = decidir(500, undefined, undefined, 3);

    expect(primero.tipo).toBe('reintentar');
    expect(tercero.tipo).toBe('reintentar');

    const ms = (d: DecisionPush) => (d.tipo === 'reintentar' ? d.esperarMs : -1);
    // El señuelo U4 es devolver una espera constante. Esta es la aserción que cae.
    expect(ms(tercero)).toBeGreaterThan(ms(primero));

    expect(decidir(503, undefined, undefined, 2).tipo).toBe('reintentar');
  });

  it('la tabla de esperas es estrictamente creciente en todas sus casillas', () => {
    for (let i = 1; i < ESPERAS_MS.length; i += 1) {
      expect(ESPERAS_MS[i]).toBeGreaterThan(ESPERAS_MS[i - 1]);
    }
    // La ventana total es de poco más de una hora y veinte minutos, a propósito:
    // pasado eso el aviso ya no sirve y seguir reintentando quema cuota.
    const ventana = ESPERAS_MS.reduce((a, b) => a + b, 0);
    expect(ventana).toBe(4_860_000);
    expect(TOPE_DE_INTENTOS).toBe(ESPERAS_MS.length);
  });

  it('cada intento dentro del tope lee su casilla de la tabla, sin aleatoriedad', () => {
    for (let intento = 1; intento <= TOPE_DE_INTENTOS; intento += 1) {
      expect(decidir(503, undefined, undefined, intento)).toEqual({
        tipo: 'reintentar',
        esperarMs: ESPERAS_MS[intento - 1],
        motivo: 'http_503',
      });
    }
  });

  it('pasado el tope de intentos, el transitorio se DESCARTA', () => {
    expect(decidir(500, undefined, undefined, TOPE_DE_INTENTOS + 1)).toEqual({
      tipo: 'descartar',
      motivo: 'intentos_agotados',
    });
    expect(decidir(429, undefined, { 'retry-after': '30' }, TOPE_DE_INTENTOS + 1)).toEqual({
      tipo: 'descartar',
      motivo: 'intentos_agotados',
    });
  });

  it('el mismo par de entradas devuelve siempre lo mismo: sin jitter y sin reloj', () => {
    const a = decidir(503, undefined, undefined, 2);
    const b = decidir(503, undefined, undefined, 2);
    expect(a).toEqual(b);
  });
});

describe('decidir(): el éxito', () => {
  it('200, 201 y 202 son entregado AL PUSH SERVICE', () => {
    expect(decidir(200, undefined, undefined, PRIMERO)).toEqual({ tipo: 'entregado' });
    expect(decidir(201, undefined, undefined, PRIMERO)).toEqual({ tipo: 'entregado' });
    expect(decidir(202, undefined, undefined, PRIMERO)).toEqual({ tipo: 'entregado' });
  });
});

describe('leer el cuerpo del push service es leer entrada NO CONFIABLE', () => {
  it('un cuerpo vacío, uno que no es JSON y un JSON sin la clave no lanzan', () => {
    expect(() => decidir(400, '', undefined, PRIMERO)).not.toThrow();
    expect(() => decidir(400, '<html>502 Bad Gateway</html>', undefined, PRIMERO)).not.toThrow();
    expect(() => decidir(400, '{}', undefined, PRIMERO)).not.toThrow();
    expect(() => decidir(400, 'null', undefined, PRIMERO)).not.toThrow();
    expect(() => decidir(400, '[1,2,3]', undefined, PRIMERO)).not.toThrow();
    expect(decidir(400, '{}', undefined, PRIMERO)).toEqual({ tipo: 'bug', motivo: 'http_400' });
  });

  it('T-05-22 — un reason desconocido NO viaja al motivo: el cuerpo entra y no sale', () => {
    // El cuerpo del push service puede traer texto arbitrario y el `motivo`
    // acaba en `notifications.push_last_error`, que es una columna que el admin
    // ve. La unión cerrada es lo que impide esa ruta.
    const veneno = cuerpo('Reserva de Juan Pérez, tel 3001234567');
    const d = decidir(400, veneno, undefined, PRIMERO);

    expect(d).toEqual({ tipo: 'bug', motivo: 'http_400' });
    expect(JSON.stringify(d)).not.toContain('3001234567');
    expect(JSON.stringify(d)).not.toContain('Juan');
  });

  it('un reason que no es una cadena tampoco lanza ni viaja', () => {
    expect(decidir(400, JSON.stringify({ reason: { a: 1 } }), undefined, PRIMERO)).toEqual({
      tipo: 'bug',
      motivo: 'http_400',
    });
    expect(decidir(400, JSON.stringify({ reason: 42 }), undefined, PRIMERO)).toEqual({
      tipo: 'bug',
      motivo: 'http_400',
    });
  });
});

describe('el módulo es puro', () => {
  it('no importa nada de app/, ni react, ni web-push', () => {
    const fuente = readFileSync(
      fileURLToPath(new URL('./errores.ts', import.meta.url)),
      'utf8',
    );
    const imports = fuente
      .split('\n')
      .filter((l) => /^\s*import\s/.test(l))
      .join('\n');

    expect(imports).not.toMatch(/from\s+['"]react/);
    expect(imports).not.toMatch(/from\s+['"]web-push['"]/);
    expect(imports).not.toMatch(/from\s+['"]@?\/?app\//);
    expect(imports).not.toMatch(/from\s+['"]next\//);
    // Y no tiene ninguna dependencia en absoluto: es aritmética y un `switch`.
    expect(imports.trim()).toBe('');
  });
});
