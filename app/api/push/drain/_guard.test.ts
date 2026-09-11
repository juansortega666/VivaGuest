import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  exigirSecretoCron as original,
  SecretoCronInvalido as OriginalSecretoCronInvalido,
} from '@/app/api/cron/sync-feed/_guard';

import { exigirSecretoCron, SecretoCronInvalido } from './_guard';

/**
 * EL TEST QUE IMPIDE QUE ESTE GUARD SE CONVIERTA EN UNA COPIA.
 *
 * El primer caso es la razon de ser del archivo y no es una formalidad: afirma
 * que la funcion que usa `POST /api/push/drain` es LA MISMA REFERENCIA que la
 * que usa el worker de sincronizacion de la Fase 3. Si alguien reemplaza la
 * reexportacion por veinte lineas copiadas, la comparacion por identidad cae en
 * el acto, aunque la copia sea byte a byte identica el primer dia.
 *
 * Los demas reafirman, a traves de ESTE modulo, el contrato del endpoint nuevo:
 * las tres formas de negacion y —sobre todo— que un secreto de distinta longitud
 * produce la MISMA excepcion de autorizacion que uno de igual longitud. Esa
 * ultima es la propiedad de canal lateral que justifica el hash previo, y se
 * reafirma aqui precisamente porque es la razon por la que este archivo no la
 * reimplementa.
 */

const NOMBRE = 'CRON_SHARED_SECRET';
const SECRETO = 'secreto-de-prueba-de-32-caracteres';

const previo = process.env[NOMBRE];

beforeEach(() => {
  process.env[NOMBRE] = SECRETO;
});

afterEach(() => {
  if (previo === undefined) delete process.env[NOMBRE];
  else process.env[NOMBRE] = previo;
});

/** Lo que de verdad se lanzo, sin que `expect().toThrow` lo trague. */
function capturar(recibido: string | null): unknown {
  try {
    exigirSecretoCron(recibido);
    return null;
  } catch (e) {
    return e;
  }
}

describe('el guard de POST /api/push/drain', () => {
  it('NO DUPLICA LA LOGICA: es la misma referencia que el guard de la Fase 3', () => {
    // `toBe` y no `toEqual`: la igualdad estructural pasaria con una copia.
    expect(exigirSecretoCron).toBe(original);
    expect(SecretoCronInvalido).toBe(OriginalSecretoCronInvalido);
  });

  it('con el secreto correcto no lanza', () => {
    expect(() => exigirSecretoCron(SECRETO)).not.toThrow();
  });

  it('sin header (null) niega, y lo llama header ausente', () => {
    const e = capturar(null);
    expect(e).toBeInstanceOf(SecretoCronInvalido);
    expect((e as SecretoCronInvalido).motivo).toBe('header_ausente');
  });

  it('con el header vacio niega IGUAL que sin header: no es un secreto que no coincidio', () => {
    const e = capturar('');
    expect(e).toBeInstanceOf(SecretoCronInvalido);
    expect((e as SecretoCronInvalido).motivo).toBe('header_ausente');
  });

  it('con un secreto que no coincide niega', () => {
    const otro = `X${SECRETO.slice(1)}`;
    expect(otro).toHaveLength(SECRETO.length);

    const e = capturar(otro);
    expect(e).toBeInstanceOf(SecretoCronInvalido);
    expect((e as SecretoCronInvalido).motivo).toBe('secreto_no_coincide');
  });

  it('un secreto de DISTINTA longitud produce la misma excepcion, NO la de longitud de la comparacion', () => {
    const corto = 'x';
    expect(corto.length).not.toBe(SECRETO.length);

    const e = capturar(corto);

    expect(e).toBeInstanceOf(SecretoCronInvalido);
    expect((e as SecretoCronInvalido).motivo).toBe('secreto_no_coincide');
    // Sin el hash previo esta asercion cae: la excepcion de `timingSafeEqual`
    // distingue "longitud equivocada" de "valor equivocado".
    expect((e as { code?: string }).code).not.toBe('ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH');
    expect((e as Error).message).not.toMatch(/length|longitud/i);
  });

  it('sin la variable configurada NIEGA, nunca acepta por defecto', () => {
    delete process.env[NOMBRE];

    const e = capturar(SECRETO);
    expect(e).toBeInstanceOf(SecretoCronInvalido);
    expect((e as SecretoCronInvalido).motivo).toBe('sin_secreto_configurado');
  });
});
