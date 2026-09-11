import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { publicEnv, readServerSecret } from './env';

/**
 * LA REGLA QUE ESTE ARCHIVO CONVIERTE EN PUERTA.
 *
 * `readServerSecret()` rechaza por runtime cualquier nombre con prefijo
 * `NEXT_PUBLIC_`. Sin un test, esa regla es un comentario: alguien escribe
 * `readServerSecret('NEXT_PUBLIC_VAPID_PUBLIC_KEY')` por simetria con la clave
 * publica, el `if` lo ataja, y nadie se entera de que el ataje sigue vivo hasta
 * que alguien lo borra "porque no hacia nada".
 *
 * El par VAPID es el caso concreto que lo pone a prueba: dos variables del MISMO
 * par, una publica y una secreta, con nombres que se parecen. Es exactamente la
 * forma de error que el prefijo tiene que atrapar.
 *
 * Los tests manipulan `process.env` a mano en vez de `vi.stubEnv` porque hace
 * falta BORRAR una variable, no solo sobreescribirla, y porque Vitest carga los
 * archivos `.env` del proyecto dentro de `process.env`: sin una copia limpia de
 * partida, el caso "la variable falta" pasaria en verde por accidente en CI (donde
 * no hay `.env.local`) y en rojo en la maquina de quien si lo tiene.
 */

const VARIABLES_TOCADAS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
] as const;

// Una clave VAPID publica real es la P-256 sin comprimir (65 bytes) en base64url,
// o sea 87 caracteres. El esquema solo exige `min(1)`, pero el valor de ejemplo se
// deja con la forma correcta para que el test no ensene una forma equivocada.
const CLAVE_PUBLICA_DE_EJEMPLO = `B${'x'.repeat(86)}`;

let snapshot: Record<string, string | undefined>;

beforeEach(() => {
  snapshot = {};
  for (const nombre of VARIABLES_TOCADAS) {
    snapshot[nombre] = process.env[nombre];
  }
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = CLAVE_PUBLICA_DE_EJEMPLO;
});

afterEach(() => {
  for (const nombre of VARIABLES_TOCADAS) {
    const previo = snapshot[nombre];
    if (previo === undefined) delete process.env[nombre];
    else process.env[nombre] = previo;
  }
});

describe('publicEnv', () => {
  it('devuelve la clave publica VAPID cuando la variable esta puesta', () => {
    expect(publicEnv().NEXT_PUBLIC_VAPID_PUBLIC_KEY).toBe(
      CLAVE_PUBLICA_DE_EJEMPLO,
    );
  });

  it('lanza cuando falta NEXT_PUBLIC_VAPID_PUBLIC_KEY', () => {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    expect(() => publicEnv()).toThrow(/NEXT_PUBLIC_VAPID_PUBLIC_KEY/);
  });

  it('lanza cuando la clave publica VAPID esta vacia', () => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = '';
    expect(() => publicEnv()).toThrow(/NEXT_PUBLIC_VAPID_PUBLIC_KEY/);
  });
});

describe('readServerSecret', () => {
  it('rechaza cualquier nombre con prefijo NEXT_PUBLIC_, aunque la variable exista', () => {
    // La variable ESTA puesta y tiene un valor valido. Aun asi tiene que lanzar:
    // lo que se rechaza es el NOMBRE, no la ausencia del valor. Si el ataje se
    // borrara, esta llamada devolveria la clave en vez de lanzar y el test caeria.
    expect(() => readServerSecret('NEXT_PUBLIC_VAPID_PUBLIC_KEY')).toThrow(
      /NEXT_PUBLIC_/,
    );
  });

  it('lee un secreto de servidor con nombre sin prefijo publico', () => {
    process.env.VIVAGUEST_SECRETO_DE_PRUEBA = 'valor-de-prueba';
    try {
      expect(readServerSecret('VIVAGUEST_SECRETO_DE_PRUEBA')).toBe(
        'valor-de-prueba',
      );
    } finally {
      delete process.env.VIVAGUEST_SECRETO_DE_PRUEBA;
    }
  });

  it('lanza cuando el secreto de servidor falta', () => {
    expect(() => readServerSecret('VIVAGUEST_SECRETO_QUE_NO_EXISTE')).toThrow(
      /ausente o vac/,
    );
  });
});
