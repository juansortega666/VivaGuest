import { describe, expect, it } from 'vitest';

import { Constants } from '@/lib/database.types';

import { claveDeColapso, esClaveDeTopicValida } from './colapso';
import {
  LIMITE_BYTES,
  RUTA_POR_DEFECTO,
  TTL_SEGUNDOS,
  construirPayload,
  urgenciaDe,
  type EntradaDePayload,
} from './payload';

/**
 * LOS SEÑUELOS U6, U7 Y U8 DEL `05-RESEARCH.md`.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * U6 ES EL QUE IMPORTA Y POR ESO VA PRIMERO EN EL ARCHIVO.
 *
 * D-06 saca el código de acceso del payload a propósito: el payload viaja
 * cifrado pero TERMINA RENDERIZADO EN LA PANTALLA DE BLOQUEO de un teléfono que
 * puede estar sobre una mesa, y persiste en la bandeja del sistema operativo.
 * El código solo puede salir de la base por `reveal_access_code()`, que deja
 * rastro en `access_code_reads` (T-01-48); un código que viaja en un aviso sale
 * sin rastro y no hay forma de saber quién lo vio.
 *
 * Esa garantía se prueba DOS VECES y las dos hacen falta:
 *
 *   · la aserción sobre el JSON serializado detecta el SÍNTOMA (hoy no está);
 *   · el `@ts-expect-error` detecta la CAUSA (no hay ranura donde ponerlo).
 *
 * Si alguien ampliara `EntradaDePayload` con un campo prohibido, el primero
 * seguiría en verde mientras nadie lo usara. El segundo se pone en rojo al
 * instante, y además al revés: si el campo dejara de ser un error, el
 * `@ts-expect-error` sobraría y `tsc` fallaría. Es una prueba de compilación en
 * los dos sentidos.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Un origen absoluto como el que pasa el worker. Sin barra final a propósito. */
const ORIGEN = 'https://vivaguest.example.com';

/**
 * Una fila de `notifications` realista: el copy es el literal de la migración
 * 09 para `asignacion`, con tilde y con apóstrofo tipográfico metidos a
 * propósito para que cualquier recorte o normalización descuidada se note.
 */
const FILA: EntradaDePayload = {
  id: '6f1a2b3c-4d5e-4f60-8a91-0b2c3d4e5f60',
  type: 'asignacion',
  title: 'Nuevo aseo asignado',
  body: 'Tienes un aseo asignado en Cartagena — Torre ‘B’ 1204 para el 12/09 antes de las 14:00.',
  url: '/aseos/6f1a2b3c-4d5e-4f60-8a91-0b2c3d4e5f60',
};

/** La clave de colapso real de esa fila, la misma que irá en `Topic`. */
const TAG = claveDeColapso({
  recipient_id: 'a1b2c3d4-e5f6-4708-9a0b-1c2d3e4f5061',
  type: 'asignacion',
  cleaning_id: '6f1a2b3c-4d5e-4f60-8a91-0b2c3d4e5f60',
  dedupe_key: 'assign:6f1a2b3c-4d5e-4f60-8a91-0b2c3d4e5f60:a1b2c3d4-e5f6-4708-9a0b-1c2d3e4f5061',
  id: '9e8d7c6b-5a49-4382-b1c0-fedcba987654',
});

const declarativo = (entrada: EntradaDePayload = FILA) =>
  construirPayload(entrada, { soportaDeclarativo: true, origen: ORIGEN, tag: TAG });

const clasico = (entrada: EntradaDePayload = FILA) =>
  construirPayload(entrada, { soportaDeclarativo: false, origen: ORIGEN, tag: TAG });

// ───────────────────────────────────────────────────────────────────────────
// U6 — D-06: el secreto no cabe, ni como dato ni como tipo
// ───────────────────────────────────────────────────────────────────────────

describe('U6 · D-06: el código de acceso y el huésped no caben en el payload', () => {
  it('el JSON serializado no contiene ninguna de las claves prohibidas (síntoma)', () => {
    const prohibidas = [
      'codigo_acceso',
      'codigoAcceso',
      'access_code',
      'accessCode',
      'huesped',
      'huéspedes',
      'guest_name',
      'guestName',
    ];

    for (const json of [declarativo(), clasico()]) {
      for (const clave of prohibidas) {
        expect(json).not.toContain(clave);
      }
    }
  });

  it('el tipo de entrada no tiene ranura para el código de acceso (causa)', () => {
    const json = construirPayload(
      {
        ...FILA,
        // @ts-expect-error D-06: `EntradaDePayload` es cerrado y NO admite el
        // código de acceso. Si este error desapareciera, el `@ts-expect-error`
        // sobraría y `tsc --noEmit` fallaría: ese rojo ES la prueba.
        codigo_acceso: '4821',
      },
      { soportaDeclarativo: true, origen: ORIGEN },
    );

    expect(json).not.toContain('4821');
  });

  it('el tipo de entrada no tiene ranura para el nombre del huésped (causa)', () => {
    const json = construirPayload(
      {
        ...FILA,
        // @ts-expect-error D-06: mismo argumento que el código de acceso. El
        // nombre del huésped no puede terminar en una pantalla de bloqueo.
        nombre_huesped: 'Mariana Restrepo',
      },
      { soportaDeclarativo: false, origen: ORIGEN },
    );

    expect(json).not.toContain('Mariana Restrepo');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// U6 — el tope de bytes
// ───────────────────────────────────────────────────────────────────────────

describe('U6 · el tope de bytes', () => {
  it('una fila realista pesa muy por debajo del tope', () => {
    for (const json of [declarativo(), clasico()]) {
      expect(Buffer.byteLength(json, 'utf8')).toBeLessThan(LIMITE_BYTES);
    }
  });

  it('un `body` desmedido lanza `payload_excede_limite` en vez de producir un 413', () => {
    const enorme: EntradaDePayload = { ...FILA, body: 'x'.repeat(LIMITE_BYTES) };

    expect(() => declarativo(enorme)).toThrow('payload_excede_limite');
    expect(() => clasico(enorme)).toThrow('payload_excede_limite');
  });

  it('el error del tope no arrastra el payload en su mensaje', () => {
    const enorme: EntradaDePayload = {
      ...FILA,
      body: `SECRETO-DE-CANARIO ${'x'.repeat(LIMITE_BYTES)}`,
    };

    expect(() => declarativo(enorme)).toThrow(/^payload_excede_limite$/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// U7 — las dos envolturas de D-07
// ───────────────────────────────────────────────────────────────────────────

describe('U7 · rama declarativa, para un destino que la soporta', () => {
  it('lleva la clave mágica, un `notification` completo y además el bloque clásico', () => {
    const cuerpo = JSON.parse(declarativo()) as Record<string, unknown>;

    // La clave mágica. Sin ella, iOS 18.4+ pierde la red de seguridad que
    // muestra el aviso cuando el handler del service worker no muestra nada.
    expect(cuerpo.web_push).toBe(8030);

    const n = cuerpo.notification as Record<string, unknown>;
    expect(n.title).toBe(FILA.title);
    expect(String(n.title).length).toBeGreaterThan(0);
    expect(n.navigate).toBeTruthy();
    expect(n.lang).toBe('es-CO');
    expect(n.dir).toBe('ltr');

    // Y el bloque clásico convive en el MISMO JSON a propósito: si el handler
    // del service worker pinta un reemplazo, ese gana; si no pinta nada, se
    // muestra la declarativa.
    const datos = cuerpo.datos as Record<string, unknown>;
    expect(datos.url).toBe(n.navigate);
    expect(datos.titulo).toBe(FILA.title);
  });

  it('`silent` es `false`, porque un aviso silencioso viola `userVisibleOnly`', () => {
    const cuerpo = JSON.parse(declarativo()) as { notification: Record<string, unknown> };

    expect(cuerpo.notification.silent).toBe(false);
    expect(Object.keys(cuerpo.notification)).not.toContain('requireInteraction');
  });
});

describe('rama clásica, para un destino que NO soporta la declarativa', () => {
  it('no lleva ni la clave mágica ni el objeto declarativo, y sí el bloque de datos', () => {
    const cuerpo = JSON.parse(clasico()) as Record<string, unknown>;

    expect(Object.keys(cuerpo)).not.toContain('web_push');
    expect(Object.keys(cuerpo)).not.toContain('notification');
    expect(cuerpo).not.toHaveProperty('web_push');

    const datos = cuerpo.datos as Record<string, unknown>;
    expect(datos.titulo).toBe(FILA.title);
    expect(datos.cuerpo).toBe(FILA.body);
    expect(datos.url).toBe(`${ORIGEN}${FILA.url}`);
    expect(datos.icon).toBe('/icon-192.png');
    expect(datos.badge).toBe('/badge-72.png');
    expect(Object.keys(datos)).not.toContain('requireInteraction');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// El copy se renderiza, no se reescribe
// ───────────────────────────────────────────────────────────────────────────

describe('el copy sale verbatim de `notifications`', () => {
  it('no recorta, no cambia mayúsculas y no añade prefijos, ni con tildes ni con comillas', () => {
    const declarativa = JSON.parse(declarativo()) as {
      notification: { title: string; body: string };
      datos: { titulo: string; cuerpo: string };
    };

    expect(declarativa.notification.title).toBe(FILA.title);
    expect(declarativa.notification.body).toBe(FILA.body);
    expect(declarativa.datos.titulo).toBe(FILA.title);
    expect(declarativa.datos.cuerpo).toBe(FILA.body);

    const clasica = JSON.parse(clasico()) as { datos: { titulo: string; cuerpo: string } };
    expect(clasica.datos.titulo).toBe(FILA.title);
    expect(clasica.datos.cuerpo).toBe(FILA.body);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// El destino del toque
// ───────────────────────────────────────────────────────────────────────────

describe('el destino del toque', () => {
  it('`navigate` y `datos.url` son exactamente la misma cadena, y sale de `notifications.url`', () => {
    const cuerpo = JSON.parse(declarativo()) as {
      notification: { navigate: string };
      datos: { url: string };
    };

    expect(cuerpo.notification.navigate).toBe(cuerpo.datos.url);
    expect(cuerpo.notification.navigate).toBe(`${ORIGEN}${FILA.url}`);
  });

  it('con `url` nulo cae a la lista del aseador, no a cadena vacía', () => {
    const cuerpo = JSON.parse(declarativo({ ...FILA, url: null })) as {
      notification: { navigate: string };
    };

    expect(cuerpo.notification.navigate).toBe(`${ORIGEN}${RUTA_POR_DEFECTO}`);
    expect(RUTA_POR_DEFECTO).toBe('/mis-aseos');
  });

  it('una `url` que apunta fuera del origen cae a la ruta por defecto', () => {
    // `notifications.url` la escriben los RPC y hoy siempre es relativa. La
    // defensa existe igual: un `navigate` hacia otro origen sacaría al aseador
    // de la app desde la pantalla de bloqueo, sin que nadie lo viera venir.
    for (const hostil of ['https://evil.example/x', '//evil.example/x', 'javascript:alert(1)']) {
      const cuerpo = JSON.parse(declarativo({ ...FILA, url: hostil })) as {
        notification: { navigate: string };
      };
      expect(cuerpo.notification.navigate).toBe(`${ORIGEN}${RUTA_POR_DEFECTO}`);
    }
  });

  it('un origen que no es una URL absoluta es un error del llamador, no un aviso roto', () => {
    expect(() =>
      construirPayload(FILA, { soportaDeclarativo: true, origen: '/relativo' }),
    ).toThrow('origen_invalido');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// La urgencia, recorriendo el enum entero
// ───────────────────────────────────────────────────────────────────────────

describe('`urgenciaDe`', () => {
  it('solo `asignacion` es `high`; las otras diez clases del enum son `normal`', () => {
    const clases = Constants.public.Enums.notification_type;

    // Recorrer el enum ENTERO y no dos casos: el día que la base gane una clase
    // nueva, este test la incluye sola y obliga a decidir su urgencia.
    expect(clases.length).toBe(11);

    for (const clase of clases) {
      expect(urgenciaDe(clase)).toBe(clase === 'asignacion' ? 'high' : 'normal');
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// U8 — la clave de colapso que también va en la cabecera `Topic`
// ───────────────────────────────────────────────────────────────────────────

describe('U8 · la clave de colapso', () => {
  it('la clave real cabe en `Topic` y viaja en las dos envolturas como `tag`', () => {
    expect(esClaveDeTopicValida(TAG)).toBe(true);
    expect(TAG.length).toBeLessThanOrEqual(32);

    const declarativa = JSON.parse(declarativo()) as {
      notification: { tag: string };
      datos: { tag: string };
    };
    expect(declarativa.notification.tag).toBe(TAG);
    expect(declarativa.datos.tag).toBe(TAG);

    const clasica = JSON.parse(clasico()) as { datos: { tag: string } };
    expect(clasica.datos.tag).toBe(TAG);
  });

  it('un UUID crudo con guiones es rechazado por el constructor, no por APNs', () => {
    // El señuelo literal de U8: 36 caracteres y guiones, que no están en el
    // alfabeto base64url. Mandado tal cual devuelve `BadWebPushTopic`, y la
    // bandeja del teléfono colapsaría con una clave distinta a la del servidor
    // de push, que es justo lo que D-05 existe para impedir.
    expect(() =>
      construirPayload(FILA, {
        soportaDeclarativo: true,
        origen: ORIGEN,
        tag: '6f1a2b3c-4d5e-4f60-8a91-0b2c3d4e5f60',
      }),
    ).toThrow('tag_invalido');
  });

  it('sin `tag` el payload se construye igual y ninguna rama lo declara', () => {
    const cuerpo = JSON.parse(
      construirPayload(FILA, { soportaDeclarativo: true, origen: ORIGEN }),
    ) as { notification: Record<string, unknown>; datos: Record<string, unknown> };

    expect(Object.keys(cuerpo.notification)).not.toContain('tag');
    expect(Object.keys(cuerpo.datos)).not.toContain('tag');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Las constantes, leídas de donde viven
// ───────────────────────────────────────────────────────────────────────────

describe('las constantes del módulo', () => {
  it('el tope son 3 KB, con un kilobyte de margen bajo el corte de 4 KB de Apple', () => {
    expect(LIMITE_BYTES).toBe(3 * 1024);
  });

  it('el TTL son cuatro horas, la misma ventana que agota el backoff de `errores.ts`', () => {
    expect(TTL_SEGUNDOS).toBe(4 * 60 * 60);
  });
});
