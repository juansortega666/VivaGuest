import { describe, expect, it } from 'vitest';

import { resolverRedireccion, type Rol } from './routing';

/**
 * Tabla de decision del ruteo. Se prueba como TABLA y no como doce `it()` sueltos:
 * la Fase 4 anadio `/operacion` como fila, no como bloque nuevo.
 *
 * `/operacion` es ademas la raiz del admin desde la Fase 4 (04-UI-SPEC.md §6.3),
 * asi que aparece dos veces: como zona propia y como destino de todo rebote.
 *
 * Columnas: [ruta de entrada, rol, destino esperado o null si la ruta esta bien].
 */
const CASOS: ReadonlyArray<readonly [string, Rol | undefined, string | null]> = [
  // Sin sesion: solo lo publico pasa.
  ['/apartamentos', undefined, '/login'],
  ['/login', undefined, null],
  ['/', undefined, '/login'],

  // Con sesion, parado en la ruta publica: cada rol a su raiz.
  ['/login', 'admin', '/operacion'],
  ['/login', 'aseador', '/mis-aseos'],

  // Raiz del sitio: cada rol a su raiz.
  ['/', 'admin', '/operacion'],
  ['/', 'aseador', '/mis-aseos'],

  // Zona cruzada: rebote a la raiz propia.
  ['/mis-aseos', 'admin', '/operacion'],
  ['/apartamentos', 'aseador', '/mis-aseos'],
  ['/operacion', 'aseador', '/mis-aseos'],
  ['/aseadores', 'aseador', '/mis-aseos'],
  // Sin esta fila, un admin que escribe la direccion de los pagos del aseador
  // aterriza en una denegacion de la base convertida en error de servidor, no
  // en su propia pantalla (Fase 7, plan 07-13).
  ['/mis-pagos', 'admin', '/operacion'],
  ['/mis-pagos/8f2d1e40-0000-4000-8000-000000000001', 'admin', '/operacion'],

  // Cada quien en su zona: no se toca.
  ['/apartamentos/8f2d1e40-0000-4000-8000-000000000001/calendario', 'admin', null],
  ['/aseadores', 'admin', null],
  ['/operacion', 'admin', null],
  ['/mis-aseos', 'aseador', null],
  ['/mis-pagos', 'aseador', null],
  ['/mis-pagos/8f2d1e40-0000-4000-8000-000000000001', 'aseador', null],
];

describe('resolverRedireccion', () => {
  it.each(CASOS)('%s con rol %s -> %s', (pathname, rol, esperado) => {
    expect(resolverRedireccion(pathname, rol)).toBe(esperado);
  });

  it('trata las subrutas de una ruta publica como publicas', () => {
    expect(resolverRedireccion('/login/recuperar', undefined)).toBeNull();
    expect(resolverRedireccion('/login/recuperar', 'admin')).toBe('/operacion');
  });

  it('no confunde un prefijo parecido con una ruta publica', () => {
    expect(resolverRedireccion('/loginfalso', undefined)).toBe('/login');
  });
});
