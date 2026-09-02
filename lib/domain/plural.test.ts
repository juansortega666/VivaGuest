import { describe, expect, test } from 'vitest';

import { apartamentos } from './plural';

describe('apartamentos', () => {
  test('el singular no dice "1 apartamentos"', () => {
    expect(apartamentos(1)).toBe('1 apartamento');
  });

  test('cero va en plural, y muestra el número: no es una celda en blanco', () => {
    // La lista de aseadores pinta `0 apartamentos` para quien no tiene ninguna
    // asignación. Una celda vacía se lee como "no se pudo cargar".
    expect(apartamentos(0)).toBe('0 apartamentos');
  });

  test('el plural lleva el número delante', () => {
    expect(apartamentos(3)).toBe('3 apartamentos');
    expect(apartamentos(39)).toBe('39 apartamentos');
  });
});
