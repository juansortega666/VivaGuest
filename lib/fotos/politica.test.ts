import { describe, expect, it } from 'vitest';

import {
  CALIDADES,
  LADO_LARGO_PX,
  MAX_INTENTOS,
  OBJETIVO_BYTES,
  OBJETIVO_KB,
  calidadDelIntento,
  cumpleObjetivo,
  debeReintentar,
  dimensionesDestino,
} from './politica';

describe('los dos valores de CHECK-04 son constantes exportadas, no numeros sueltos', () => {
  it('lado largo 1280 y objetivo 200 kB', () => {
    expect(LADO_LARGO_PX).toBe(1280);
    expect(OBJETIVO_KB).toBe(200);
    expect(OBJETIVO_BYTES).toBe(200 * 1024);
  });
});

describe('dimensionesDestino', () => {
  it('baja el lado largo a 1280 conservando la proporcion', () => {
    // 3000x2000 -> el lado largo manda: 1280x853
    expect(dimensionesDestino(3000, 2000)).toEqual({ ancho: 1280, alto: 853 });
  });

  it('funciona igual cuando el lado largo es el alto (foto vertical)', () => {
    expect(dimensionesDestino(2000, 3000)).toEqual({ ancho: 853, alto: 1280 });
  });

  it('NO agranda una foto mas pequena: comprimir no es escalar hacia arriba', () => {
    expect(dimensionesDestino(800, 600)).toEqual({ ancho: 800, alto: 600 });
  });

  it('deja igual la que ya mide exactamente el lado largo', () => {
    expect(dimensionesDestino(1280, 960)).toEqual({ ancho: 1280, alto: 960 });
  });

  it('una imagen cuadrada gigante queda cuadrada', () => {
    expect(dimensionesDestino(4000, 4000)).toEqual({ ancho: 1280, alto: 1280 });
  });
});

describe('cumpleObjetivo', () => {
  it('cierto justo en el limite: 200 kB exactos cumplen', () => {
    expect(cumpleObjetivo(OBJETIVO_BYTES)).toBe(true);
  });

  it('falso un byte por encima', () => {
    expect(cumpleObjetivo(OBJETIVO_BYTES + 1)).toBe(false);
  });
});

describe('la escalera de calidades', () => {
  it('va de mayor a menor, sin repetir', () => {
    const copia = [...CALIDADES];
    expect(copia).toEqual([...copia].sort((a, b) => b - a));
    expect(new Set(copia).size).toBe(copia.length);
  });

  it('todas estan en el rango que acepta un codificador JPEG', () => {
    for (const q of CALIDADES) {
      expect(q).toBeGreaterThan(0);
      expect(q).toBeLessThanOrEqual(1);
    }
  });

  it('MAX_INTENTOS sale de la lista y no es un numero suelto', () => {
    expect(MAX_INTENTOS).toBe(CALIDADES.length);
  });

  it('calidadDelIntento devuelve null cuando se agotan', () => {
    expect(calidadDelIntento(0)).toBe(CALIDADES[0]);
    expect(calidadDelIntento(MAX_INTENTOS - 1)).toBe(CALIDADES[MAX_INTENTOS - 1]);
    expect(calidadDelIntento(MAX_INTENTOS)).toBeNull();
  });
});

describe('debeReintentar: cuando parar', () => {
  it('no reintenta si ya cumple, aunque queden intentos', () => {
    expect(debeReintentar(OBJETIVO_BYTES - 1, 0)).toBe(false);
  });

  it('reintenta si no cumple y quedan intentos', () => {
    expect(debeReintentar(OBJETIVO_BYTES * 5, 0)).toBe(true);
    expect(debeReintentar(OBJETIVO_BYTES * 5, MAX_INTENTOS - 2)).toBe(true);
  });

  it('NO reintenta en el ultimo intento aunque no cumpla: se devuelve la mejor conseguida', () => {
    // Es la propiedad que impide que una aseadora se quede sin poder subir su
    // evidencia porque una foto concreta se resistio a bajar de 200 kB.
    expect(debeReintentar(OBJETIVO_BYTES * 5, MAX_INTENTOS - 1)).toBe(false);
  });

  it('nunca reintenta mas alla del tope, ni con un intento absurdo', () => {
    expect(debeReintentar(OBJETIVO_BYTES * 99, MAX_INTENTOS + 50)).toBe(false);
  });
});
