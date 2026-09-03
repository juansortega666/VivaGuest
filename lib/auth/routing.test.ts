import { describe, expect, it } from 'vitest';

import { resolverRedireccion, type Rol } from './routing';

/**
 * Tabla de decision del ruteo. Se prueba como TABLA y no como doce `it()` sueltos:
 * cuando la Fase 4 anada `/dia`, `/sin-confirmar` y `/alertas` se anaden filas,
 * no bloques.
 *
 * Columnas: [ruta de entrada, rol, destino esperado o null si la ruta esta bien].
 */
const CASOS: ReadonlyArray<readonly [string, Rol | undefined, string | null]> = [
  // Sin sesion: solo lo publico pasa.
  ['/apartamentos', undefined, '/login'],
  ['/login', undefined, null],
  ['/', undefined, '/login'],

  // Con sesion, parado en la ruta publica: cada rol a su raiz.
  ['/login', 'admin', '/apartamentos'],
  ['/login', 'aseador', '/mis-aseos'],

  // Raiz del sitio: cada rol a su raiz.
  ['/', 'admin', '/apartamentos'],
  ['/', 'aseador', '/mis-aseos'],

  // Zona cruzada: rebote a la raiz propia.
  ['/mis-aseos', 'admin', '/apartamentos'],
  ['/apartamentos', 'aseador', '/mis-aseos'],
  ['/aseadores', 'aseador', '/mis-aseos'],

  // Cada quien en su zona: no se toca.
  ['/apartamentos/8f2d1e40-0000-4000-8000-000000000001/calendario', 'admin', null],
  ['/aseadores', 'admin', null],
  ['/mis-aseos', 'aseador', null],
];

describe('resolverRedireccion', () => {
  it.each(CASOS)('%s con rol %s -> %s', (pathname, rol, esperado) => {
    expect(resolverRedireccion(pathname, rol)).toBe(esperado);
  });

  it('trata las subrutas de una ruta publica como publicas', () => {
    expect(resolverRedireccion('/login/recuperar', undefined)).toBeNull();
    expect(resolverRedireccion('/login/recuperar', 'admin')).toBe('/apartamentos');
  });

  it('no confunde un prefijo parecido con una ruta publica', () => {
    expect(resolverRedireccion('/loginfalso', undefined)).toBe('/login');
  });
});
