import { describe, expect, it } from 'vitest';

import { aEnteroCOP, formatCOP, formatMilesCOP } from './money';

/**
 * `Intl` mete espacios duros (NBSP y NNBSP) entre el simbolo y el numero. Comparar
 * contra un string escrito a mano falla por un caracter invisible, asi que se normalizan
 * todos los espacios antes de comparar.
 */
const plano = (s: string) => s.replace(/\s/g, ' ');

describe('formatCOP', () => {
  it('formatea 120000 como pesos con separador de miles', () => {
    expect(plano(formatCOP(120000))).toBe('$ 120.000');
  });

  it('formatea el cero, que no es lo mismo que un valor ausente', () => {
    expect(plano(formatCOP(0))).toBe('$ 0');
  });

  it('devuelve em dash para null y para undefined', () => {
    expect(formatCOP(null)).toBe('—');
    expect(formatCOP(undefined)).toBe('—');
  });

  it('nunca emite decimales: la base guarda bigint de pesos enteros', () => {
    const salida = formatCOP(1500000);
    expect(plano(salida)).toBe('$ 1.500.000');
    expect(salida).not.toContain(',');
    expect(salida).not.toMatch(/[.,]\d{2}$/);
  });

  it('redondea en vez de mostrar centavos si le llega un no entero', () => {
    expect(formatCOP(1234.56)).not.toMatch(/[.,]\d{2}$/);
  });
});

/**
 * ESTE BLOQUE EXISTE POR UN BUG DE UNA LINEA QUE NO SE VE EN PANTALLA.
 *
 * El input de dinero muestra separador de miles y el esquema valida con
 * `z.coerce.number()`. Si el string formateado llega tal cual al esquema,
 * `Number('120.000')` da **120**: la tarifa entra dividida por mil, es un entero
 * valido, no es negativa, y pasa los tres CHECK de `properties`. Nadie se entera
 * hasta que alguien mire el reporte de rentabilidad.
 */
describe('aEnteroCOP: el inverso de la mascara', () => {
  it('LA ASERCION QUE IMPORTA: deshace el separador de miles en vez de leerlo como decimal', () => {
    // CONTROL de que el bug es real y no una precaucion imaginaria: sin esta
    // funcion, el valor que veria el esquema seria 120, no 120000.
    expect(Number('120.000')).toBe(120);
    expect(aEnteroCOP('120.000')).toBe(120000);
  });

  it('acepta la salida literal de formatMilesCOP, con su espacio duro incluido', () => {
    // El ida y vuelta se prueba con lo que de verdad produce `Intl`, no con un
    // string escrito a mano: es la unica forma de cubrir el NNBSP invisible.
    expect(aEnteroCOP(formatMilesCOP(1500000))).toBe(1500000);
    expect(aEnteroCOP(formatCOP(1500000))).toBe(1500000);
  });

  it('devuelve null para lo que el formulario considera vacio', () => {
    expect(aEnteroCOP('')).toBeNull();
    expect(aEnteroCOP('   ')).toBeNull();
    expect(aEnteroCOP(null)).toBeNull();
    expect(aEnteroCOP(undefined)).toBeNull();
    // CONTROL: no todo da null, o el test de arriba pasaria con `() => null`.
    expect(aEnteroCOP('7')).toBe(7);
  });

  it('el cero es un valor presente, no una ausencia', () => {
    // Distinguirlos es lo que hace que `faltantesParaActivar` no diga "falta el
    // pago al aseador" sobre un apartamento configurado a pago cero.
    expect(aEnteroCOP('0')).toBe(0);
    expect(aEnteroCOP(0)).toBe(0);
  });

  it('un negativo pegado pierde el signo en vez de convertirse en NaN', () => {
    // `props_rates_nonneg` prohibe negativos y el input los rechaza al teclear,
    // asi que solo llegan por pegado. 120000 es mejor respuesta que un NaN.
    expect(aEnteroCOP('-120000')).toBe(120000);
  });

  it('trunca el decimal en vez de arrastrarlo: la base es bigint de pesos enteros', () => {
    expect(aEnteroCOP(1234.56)).toBe(1234);
  });

  it('devuelve null en vez de un entero corrompido si se pasa de Number.MAX_SAFE_INTEGER', () => {
    expect(aEnteroCOP('9'.repeat(20))).toBeNull();
  });
});

describe('formatMilesCOP', () => {
  it('agrupa en miles y NO pone el simbolo, que va en el adorno del input', () => {
    expect(plano(formatMilesCOP(120000))).toBe('120.000');
    expect(formatMilesCOP(120000)).not.toContain('$');
  });

  it('devuelve cadena vacia, no em dash: un guion dentro de un input hay que borrarlo', () => {
    expect(formatMilesCOP(null)).toBe('');
    expect(formatMilesCOP('')).toBe('');
    // CONTROL: `formatCOP` si pinta em dash, y por eso son dos funciones.
    expect(formatCOP(null)).toBe('—');
  });

  it('es idempotente: formatear lo ya formateado no rompe la cifra', () => {
    // Es lo que pasa cuando el admin sale y vuelve a entrar al campo sin tocarlo.
    const unaVez = formatMilesCOP(1500000);
    expect(plano(formatMilesCOP(unaVez))).toBe(plano(unaVez));
  });
});
