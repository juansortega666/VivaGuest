import { describe, expect, it } from 'vitest';

import { formatCOP } from './money';

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
