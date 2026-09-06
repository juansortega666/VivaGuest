import { describe, expect, it } from 'vitest';

import { BLOQUE_HISTORIAL } from '@/lib/data/historial';

import { limiteDeHistorial } from './HistorialApartamento';

/**
 * EL PARAMETRO `?historial=` VIENE DE LA URL, ASI QUE ES ENTRADA NO CONFIABLE.
 *
 * Es un numero que acaba en el `limit` de dos consultas a Postgres. Sin techo,
 * `?historial=999999` es una consulta arbitrariamente grande que cualquiera con
 * sesion de admin puede disparar escribiendola a mano, y no hace falta mala fe:
 * basta un enlace mal copiado.
 *
 * El redondeo al bloque de 30 no es cosmetico tampoco: el pie dice `Ver 30 mas` y
 * el contrato de §14 es que la lista crece de treinta en treinta. Un
 * `?historial=47` produciria una lista de 47 con un boton que promete 30 mas.
 *
 * Se prueba la funcion y no el componente porque el entorno de vitest de este
 * repo es `node` y no hay testing-library: exponer la regla como funcion pura es
 * lo que la hace verificable sin ampliar el stack, misma decision que
 * `clasesDeEstadoVacio()` en `EstadoVacio.tsx`.
 */

describe('limiteDeHistorial', () => {
  it('sin parametro devuelve el bloque base', () => {
    expect(limiteDeHistorial(undefined)).toBe(BLOQUE_HISTORIAL);
    expect(limiteDeHistorial('')).toBe(BLOQUE_HISTORIAL);
  });

  it('lo que no es un numero cae al bloque base, sin error', () => {
    // Un 400 por un enlace mal copiado seria peor que mostrar la primera pagina:
    // esto es un parametro de PRESENTACION, no una entrada de formulario.
    for (const basura of ['abc', 'NaN', '1e9', '../../etc/passwd', '30; drop table']) {
      expect(limiteDeHistorial(basura)).toBe(BLOQUE_HISTORIAL);
    }
  });

  it('un numero por debajo del bloque, o negativo, no lo encoge', () => {
    expect(limiteDeHistorial('0')).toBe(BLOQUE_HISTORIAL);
    expect(limiteDeHistorial('-90')).toBe(BLOQUE_HISTORIAL);
    expect(limiteDeHistorial('29')).toBe(BLOQUE_HISTORIAL);
    expect(limiteDeHistorial('30')).toBe(BLOQUE_HISTORIAL);
  });

  it('redondea hacia arriba al bloque de 30', () => {
    expect(limiteDeHistorial('31')).toBe(60);
    expect(limiteDeHistorial('47')).toBe(60);
    expect(limiteDeHistorial('60')).toBe(60);
    expect(limiteDeHistorial('61')).toBe(90);
  });

  it('pone techo: `?historial=999999` no dispara una consulta enorme', () => {
    expect(limiteDeHistorial('999999')).toBe(300);
    expect(limiteDeHistorial(String(Number.MAX_SAFE_INTEGER))).toBe(300);
  });
});
