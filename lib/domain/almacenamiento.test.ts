import { describe, expect, it } from 'vitest';

import {
  formatearBytes,
  porcentajeUsado,
  superaElUmbral,
  type ConsumoDeStorage,
} from './almacenamiento';

const MB = 1024 * 1024;
const GB = 1024 * MB;

/** El cupo del free tier, que es el que trae el seed. */
function consumo(over: Partial<ConsumoDeStorage> = {}): ConsumoDeStorage {
  return { usadoBytes: 0, cupoBytes: GB, umbralPct: 70, cruceAt: null, ...over };
}

describe('superaElUmbral', () => {
  it('el borde exacto: 69% no, 70% clavado SÍ, 71% sí', () => {
    // ESTE ES EL CASO QUE FIJA LA DECISIÓN. «Superar el 70%» se implementa como
    // LLEGAR al 70%: con `>` en vez de `>=`, la fila del medio se pone roja.
    const cupo = 1000;
    expect(superaElUmbral(consumo({ usadoBytes: 690, cupoBytes: cupo }))).toBe(false);
    expect(superaElUmbral(consumo({ usadoBytes: 700, cupoBytes: cupo }))).toBe(true);
    expect(superaElUmbral(consumo({ usadoBytes: 710, cupoBytes: cupo }))).toBe(true);
  });

  it('no redondea a porcentaje antes de comparar', () => {
    // 69.6% redondeado a entero es 70. Si la comparación pasara por
    // `porcentajeUsado()`, esta línea alertaría antes de tiempo, que es la forma
    // más rápida de que el admin deje de creerle a la alarma.
    const c = consumo({ usadoBytes: 696, cupoBytes: 1000 });

    expect(porcentajeUsado(c)).toBe(70); // lo que se PINTA
    expect(superaElUmbral(c)).toBe(false); // lo que se DECIDE
  });

  it('respeta el umbral que le llegue, no uno propio', () => {
    // El umbral sale de `app_settings`. Si alguien lo escribiera a mano aquí
    // dentro, esta línea se pone roja.
    const c = consumo({ usadoBytes: 500, cupoBytes: 1000 });

    expect(superaElUmbral({ ...c, umbralPct: 70 })).toBe(false);
    expect(superaElUmbral({ ...c, umbralPct: 50 })).toBe(true);
  });

  it('un cupo de cero es estar lleno, no una división por cero', () => {
    expect(superaElUmbral(consumo({ usadoBytes: 1, cupoBytes: 0 }))).toBe(true);
    expect(superaElUmbral(consumo({ usadoBytes: 0, cupoBytes: 0 }))).toBe(true);
  });

  it('consumo cero contra un cupo real no alerta', () => {
    expect(superaElUmbral(consumo({ usadoBytes: 0 }))).toBe(false);
  });
});

describe('porcentajeUsado', () => {
  it('redondea a entero, que es lo que se pinta', () => {
    expect(porcentajeUsado(consumo({ usadoBytes: 0, cupoBytes: 1000 }))).toBe(0);
    expect(porcentajeUsado(consumo({ usadoBytes: 124, cupoBytes: 1000 }))).toBe(12);
    expect(porcentajeUsado(consumo({ usadoBytes: 126, cupoBytes: 1000 }))).toBe(13);
    expect(porcentajeUsado(consumo({ usadoBytes: 1000, cupoBytes: 1000 }))).toBe(100);
  });

  it('con cupo cero o negativo devuelve 100 y no NaN', () => {
    // Coincide con `superaElUmbral` a propósito: el medidor no puede decir 100%
    // mientras la alerta calla, ni al revés.
    expect(porcentajeUsado(consumo({ usadoBytes: 5, cupoBytes: 0 }))).toBe(100);
    expect(porcentajeUsado(consumo({ usadoBytes: 5, cupoBytes: -1 }))).toBe(100);
  });
});

describe('formatearBytes', () => {
  it('los cuatro cortes, en base 1024 y sin decimales', () => {
    expect(formatearBytes(0)).toBe('0 B');
    expect(formatearBytes(512)).toBe('512 B');
    expect(formatearBytes(1024)).toBe('1 KB');
    expect(formatearBytes(MB)).toBe('1 MB');
    expect(formatearBytes(412 * MB)).toBe('412 MB');
    expect(formatearBytes(GB)).toBe('1 GB');
    expect(formatearBytes(100 * GB)).toBe('100 GB');
  });

  it('el acarreo no produce nunca 1024 de la unidad de abajo', () => {
    // 1023.6 KB. Elegir la unidad por `bytes >= factor` y redondear después
    // imprimiría `1024 KB`, que se lee como un error de programación.
    expect(formatearBytes(MB - 100)).toBe('1 MB');
    expect(formatearBytes(GB - 100)).toBe('1 GB');
  });

  it('entradas absurdas caen en 0 B en vez de propagar basura a la pantalla', () => {
    expect(formatearBytes(-1)).toBe('0 B');
    expect(formatearBytes(Number.NaN)).toBe('0 B');
    expect(formatearBytes(Number.POSITIVE_INFINITY)).toBe('0 B');
  });
});
