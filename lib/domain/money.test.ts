import { describe, expect, it } from 'vitest';

import { aEnteroCOP, formatAbreviadoCOP, formatCOP, formatMilesCOP } from './money';

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

describe('formatAbreviadoCOP', () => {
  /**
   * LA ABREVIATURA DE LA METRICA DE GASTOS DEL VISTAZO (plan 10-05).
   *
   * Lo que este bloque defiende, y no es el redondeo: que la COMA de es-CO sale de
   * `Intl` y no de una concatenacion a mano. `${(1.5).toFixed(1)}M` emite `1.5M`
   * con PUNTO, o sea la forma anglosajona, que en es-CO se lee como separador de
   * MILES: un gasto de millon y medio se leeria como quince millones. Es la misma
   * clase de trampa que `aEnteroCOP` ya tiene documentada por el otro lado.
   */
  it('por debajo de mil no lleva sufijo', () => {
    expect(plano(formatAbreviadoCOP(0))).toBe('$ 0');
    expect(plano(formatAbreviadoCOP(999))).toBe('$ 999');
  });

  it('de mil a menos de un millon lleva sufijo de miles', () => {
    expect(plano(formatAbreviadoCOP(1000))).toBe('$ 1,0K');
    expect(plano(formatAbreviadoCOP(180000))).toBe('$ 180K');
  });

  it('de un millon para arriba lleva sufijo de millones', () => {
    expect(plano(formatAbreviadoCOP(1000000))).toBe('$ 1,0M');
    expect(plano(formatAbreviadoCOP(12345678))).toBe('$ 12M');
  });

  it('con mantisa menor que diez emite UN decimal, con la COMA de es-CO', () => {
    // El punto seria la forma anglosajona y en es-CO se lee como separador de
    // miles: `$ 1.5M` se leeria como quince millones.
    expect(plano(formatAbreviadoCOP(1_500_000))).toBe('$ 1,5M');
    expect(formatAbreviadoCOP(1_500_000)).toContain(',');
    expect(formatAbreviadoCOP(1_500_000)).not.toContain('.');
  });

  it('con mantisa de dos o tres cifras no emite decimal', () => {
    // El decimal de `$ 180,4K` no cambia ninguna decision del admin.
    expect(plano(formatAbreviadoCOP(180_400))).toBe('$ 180K');
    expect(plano(formatAbreviadoCOP(12_000))).toBe('$ 12K');
  });

  it('999999 SUBE DE UNIDAD en vez de decir mil K', () => {
    // Su mantisa es 999,999, que redondeada a su propia precision da MIL. `$ 1.000K`
    // es la cifra correcta en la unidad equivocada, y ademas mete un separador de
    // miles dentro de una abreviatura de miles.
    expect(plano(formatAbreviadoCOP(999_999))).toBe('$ 1,0M');
    expect(formatAbreviadoCOP(999_999)).not.toContain('K');
  });

  it('la ausencia devuelve lo MISMO que formatCOP y no una cadena vacia', () => {
    // Un hueco sin glifo en una fila de cuatro metricas se lee como que la metrica
    // no existe.
    expect(formatAbreviadoCOP(null)).toBe(formatCOP(null));
    expect(formatAbreviadoCOP(undefined)).toBe(formatCOP(undefined));
    expect(formatAbreviadoCOP(null)).not.toBe('');
  });
});
