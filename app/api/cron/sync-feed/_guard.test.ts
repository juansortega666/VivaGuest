import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { exigirSecretoCron, SecretoCronInvalido } from './_guard';

/**
 * El guard del worker de sincronizacion.
 *
 * ESTE ES EL UNICO CONTROL DE ACCESO DEL ENDPOINT. No hay cookie, no hay sesion y
 * no hay RLS detras: el worker construye la fabrica administrativa, que salta la
 * RLS por completo. Si este guard se equivoca, cualquiera en internet dispara una
 * corrida de sincronizacion sobre cualquier feed.
 *
 * El tercer caso es la razon de existir del hash y no es un detalle de estilo:
 * ver el comentario de `exigirSecretoCron`.
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

describe('exigirSecretoCron', () => {
  it('con el secreto correcto no lanza', () => {
    expect(() => exigirSecretoCron(SECRETO)).not.toThrow();
  });

  it('con un secreto incorrecto de la MISMA longitud lanza', () => {
    const otro = `X${SECRETO.slice(1)}`;
    expect(otro).toHaveLength(SECRETO.length);

    const e = capturar(otro);
    expect(e).toBeInstanceOf(SecretoCronInvalido);
    expect((e as SecretoCronInvalido).motivo).toBe('secreto_no_coincide');
  });

  it('con un secreto incorrecto de DISTINTA longitud lanza la excepcion de autorizacion, NO la de longitud de la comparacion', () => {
    const corto = 'x';
    expect(corto.length).not.toBe(SECRETO.length);

    const e = capturar(corto);

    // Lo que importa: es la MISMA excepcion que el caso de igual longitud.
    expect(e).toBeInstanceOf(SecretoCronInvalido);
    expect((e as SecretoCronInvalido).motivo).toBe('secreto_no_coincide');

    // Y NO es la que `timingSafeEqual` lanza cuando los buferes miden distinto.
    // Sin el hash previo esta asercion cae: esa excepcion es en si misma un canal
    // lateral que distingue "longitud equivocada" de "valor equivocado".
    expect((e as { code?: string }).code).not.toBe('ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH');
    expect((e as Error).message).not.toMatch(/length|longitud/i);
  });

  it('sin header (null) lanza', () => {
    const e = capturar(null);
    expect(e).toBeInstanceOf(SecretoCronInvalido);
    expect((e as SecretoCronInvalido).motivo).toBe('header_ausente');
  });

  it('con el header vacio lanza', () => {
    const e = capturar('');
    expect(e).toBeInstanceOf(SecretoCronInvalido);
    expect((e as SecretoCronInvalido).motivo).toBe('header_ausente');
  });

  it('sin la variable de entorno configurada NIEGA, nunca acepta por defecto', () => {
    delete process.env[NOMBRE];

    const e = capturar(SECRETO);
    expect(e).toBeInstanceOf(SecretoCronInvalido);
    expect((e as SecretoCronInvalido).motivo).toBe('sin_secreto_configurado');
  });

  it('con la variable configurada VACIA tampoco acepta la cadena vacia como secreto', () => {
    process.env[NOMBRE] = '';

    const e = capturar('');
    expect(e).toBeInstanceOf(SecretoCronInvalido);
  });

  it('el mensaje del error no revela el secreto esperado', () => {
    const e = capturar('otro-valor-cualquiera');
    expect((e as Error).message).not.toContain(SECRETO);
  });
});
