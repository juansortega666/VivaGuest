import { describe, expect, it } from 'vitest';

import {
  CATEGORIAS,
  ETIQUETAS_CATEGORIA,
  esquemaReporte,
  exigeFoto,
} from './reporte.schema';

describe('daño', () => {
  it('acepta una descripción con contenido', () => {
    const r = esquemaReporte.safeParse({ categoria: 'dano', descripcion: 'Se rompió la ducha' });
    expect(r.success).toBe(true);
  });

  it('rechaza la descripción vacía', () => {
    expect(esquemaReporte.safeParse({ categoria: 'dano', descripcion: '' }).success).toBe(false);
  });

  it('rechaza la descripción que solo son espacios', () => {
    expect(esquemaReporte.safeParse({ categoria: 'dano', descripcion: '   ' }).success).toBe(false);
  });
});

describe('gasto: el monto es lo que la Fase 7 va a sumar', () => {
  const base = { categoria: 'gasto' as const, descripcion: 'Trapeador' };

  it('acepta monto entero positivo con moneda explícita', () => {
    const r = esquemaReporte.safeParse({ ...base, monto: 15000, moneda: 'MXN' });
    expect(r.success).toBe(true);
  });

  it('pone COP por defecto cuando no se especifica moneda', () => {
    const r = esquemaReporte.safeParse({ ...base, monto: 15000 });
    expect(r.success && r.data.categoria === 'gasto' && r.data.moneda).toBe('COP');
  });

  it('rechaza el monto AUSENTE', () => {
    expect(esquemaReporte.safeParse(base).success).toBe(false);
  });

  it('rechaza el monto CERO', () => {
    expect(esquemaReporte.safeParse({ ...base, monto: 0 }).success).toBe(false);
  });

  it('rechaza el monto NEGATIVO', () => {
    expect(esquemaReporte.safeParse({ ...base, monto: -500 }).success).toBe(false);
  });

  it('rechaza el monto con DECIMALES: va en la unidad mínima de la moneda', () => {
    expect(esquemaReporte.safeParse({ ...base, monto: 1500.5 }).success).toBe(false);
  });

  it('rechaza la moneda en minúscula', () => {
    expect(esquemaReporte.safeParse({ ...base, monto: 100, moneda: 'cop' }).success).toBe(false);
  });

  it('rechaza la moneda de dos letras', () => {
    expect(esquemaReporte.safeParse({ ...base, monto: 100, moneda: 'CO' }).success).toBe(false);
  });
});

describe('faltante', () => {
  it('acepta uno o varios items con texto', () => {
    const r = esquemaReporte.safeParse({
      categoria: 'faltante',
      items: ['Papel higiénico', 'Jabón'],
    });
    expect(r.success).toBe(true);
  });

  it('rechaza el arreglo vacío: reportar faltantes sin faltantes no es un reporte', () => {
    expect(esquemaReporte.safeParse({ categoria: 'faltante', items: [] }).success).toBe(false);
  });

  it('rechaza un item que solo son espacios', () => {
    expect(esquemaReporte.safeParse({ categoria: 'faltante', items: ['  '] }).success).toBe(false);
  });
});

describe('la unión discriminada es lo que hace imposible un gasto sin monto', () => {
  it('un gasto sin monto no compila', () => {
    // @ts-expect-error un gasto SIN monto no debe compilar. Si este
    // `@ts-expect-error` sobra, la unión dejó de discriminar y hay que mirar
    // por qué: es el test de la CAUSA, no del síntoma.
    const _mal: import('./reporte.schema').Reporte = { categoria: 'gasto', descripcion: 'x' };
    void _mal;
  });

  it('un daño con monto tampoco compila: no es su forma', () => {
    // `@ts-expect-error` solo cubre LA LÍNEA SIGUIENTE, así que el objeto va
    // en una sola línea: partido en varias, el error cae en la línea de la
    // propiedad ofensora y la directiva queda sin usar. Medido al escribirlo.
    // @ts-expect-error el daño no lleva monto.
    const _mal: import('./reporte.schema').Reporte = { categoria: 'dano', descripcion: 'x', monto: 1 };
    void _mal;
  });
});

describe('las etiquetas usan lenguaje de campo, no de base de datos', () => {
  it('cubre las tres categorías', () => {
    expect(Object.keys(ETIQUETAS_CATEGORIA).sort()).toEqual([...CATEGORIAS].sort());
  });

  it('ninguna etiqueta usa las palabras del esquema como texto de interfaz', () => {
    for (const etiqueta of Object.values(ETIQUETAS_CATEGORIA)) {
      expect(etiqueta.toLowerCase()).not.toContain('gasto');
      expect(etiqueta.toLowerCase()).not.toContain('faltante');
    }
  });

  it('solo el daño exige foto', () => {
    expect(exigeFoto('dano')).toBe(true);
    expect(exigeFoto('gasto')).toBe(false);
    expect(exigeFoto('faltante')).toBe(false);
  });
});
