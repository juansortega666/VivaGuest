import { describe, expect, test } from 'vitest';

import {
  ALFABETO_PASSWORD,
  generarPasswordTemporal,
  LONGITUD_MINIMA_PASSWORD,
} from './password';

/**
 * La contraseña temporal es la credencial que abre 39 apartamentos y se dicta por
 * teléfono. Los tres riesgos que este archivo ancla:
 *
 *   1. que sea corta        → `auth.admin.createUser` NO valida la longitud (medido)
 *   2. que sea predecible   → el PRNG de la biblioteca estándar no sirve aquí
 *   3. que sea impronunciable → un `0` que el aseador oye como `o` es un fallo real
 *
 * El tercero es el único que un humano notaría por su cuenta. Los dos primeros
 * pasan desapercibidos hasta que alguien entra sin permiso.
 */

const CARACTERES_AMBIGUOS = ['0', 'O', '1', 'l', 'I'];

describe('generarPasswordTemporal', () => {
  test('devuelve al menos LONGITUD_MINIMA_PASSWORD caracteres', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generarPasswordTemporal().length).toBeGreaterThanOrEqual(
        LONGITUD_MINIMA_PASSWORD,
      );
    }
  });

  test('LONGITUD_MINIMA_PASSWORD es 12, el mínimo declarado en config.toml', () => {
    expect(LONGITUD_MINIMA_PASSWORD).toBe(12);
  });

  test('dos llamadas seguidas nunca devuelven lo mismo (1000 iteraciones)', () => {
    const vistas = new Set<string>();
    for (let i = 0; i < 1000; i += 1) {
      vistas.add(generarPasswordTemporal());
    }
    // Sin colisión ninguna. Con un PRNG no criptográfico esto también pasaría,
    // así que NO es el test que protege contra la predecibilidad: ese es el de
    // distribución. El nombre literal de esa función no se escribe aquí: un grep
    // del plan lo prohíbe en este módulo y el test vive al lado.
    expect(vistas.size).toBe(1000);
  });

  test('no contiene ningún carácter ambiguo al dictarla por teléfono', () => {
    for (let i = 0; i < 1000; i += 1) {
      const password = generarPasswordTemporal();
      for (const ambiguo of CARACTERES_AMBIGUOS) {
        expect(password.includes(ambiguo)).toBe(false);
      }
    }
  });

  test('el alfabeto tampoco declara ningún carácter ambiguo', () => {
    for (const ambiguo of CARACTERES_AMBIGUOS) {
      expect(ALFABETO_PASSWORD.includes(ambiguo)).toBe(false);
    }
    // Y no tiene repetidos: un carácter duplicado sesgaría su propia frecuencia.
    expect(new Set(ALFABETO_PASSWORD).size).toBe(ALFABETO_PASSWORD.length);
  });

  test('tiene el formato de tres grupos separados por guion de UI-SPEC §11.2', () => {
    for (let i = 0; i < 500; i += 1) {
      const password = generarPasswordTemporal();
      const grupos = password.split('-');
      expect(grupos).toHaveLength(3);
      // `Xk4m-92pT-vLq`: 4 + 4 + 3 = 11 caracteres útiles y 13 en total.
      expect(grupos.map((g) => g.length)).toEqual([4, 4, 3]);
      expect(password).toHaveLength(13);
      expect(password).toMatch(/^[^-]{4}-[^-]{4}-[^-]{3}$/);
    }
  });

  test('todos los caracteres salen del alfabeto declarado', () => {
    for (let i = 0; i < 500; i += 1) {
      for (const c of generarPasswordTemporal().replaceAll('-', '')) {
        expect(ALFABETO_PASSWORD.includes(c)).toBe(true);
      }
    }
  });
});

describe('distribución: el sesgo de módulo', () => {
  /**
   * EL TEST QUE PIDE EL PLAN, Y POR QUÉ NO BASTA.
   *
   * El plan pide "ningún carácter con frecuencia mayor al DOBLE de la esperada".
   * Se implementa porque lo pide el contrato, pero se midió que NO tiene dientes:
   * con `byte % 57`, los residuos 0..27 salen 5 veces de cada 256 y los 28..56
   * salen 4, o sea un exceso del 11 % sobre lo esperado. Muy lejos del 100 % que
   * este umbral exige. Es un test que pasaría con el bug puesto.
   *
   * El que de verdad lo atrapa es el chi-cuadrado de abajo.
   */
  test('ningún carácter supera el doble de la frecuencia esperada', () => {
    const MUESTRAS = 10_000;
    const conteos = new Map<string, number>();
    for (let i = 0; i < MUESTRAS; i += 1) {
      for (const c of generarPasswordTemporal().replaceAll('-', '')) {
        conteos.set(c, (conteos.get(c) ?? 0) + 1);
      }
    }

    const total = [...conteos.values()].reduce((a, b) => a + b, 0);
    const esperada = total / ALFABETO_PASSWORD.length;

    for (const [caracter, conteo] of conteos) {
      expect(
        conteo,
        `el carácter ${caracter} salió ${conteo} veces, esperadas ~${esperada.toFixed(0)}`,
      ).toBeLessThan(esperada * 2);
    }
  });

  /**
   * ESTE es el que atrapa el sesgo de módulo.
   *
   * Chi-cuadrado de bondad de ajuste sobre 110.000 caracteres (10.000 contraseñas
   * × 11 caracteres útiles), con 57 categorías y por tanto 56 grados de libertad.
   *
   *   - Generador correcto (rechazo de bytes fuera del mayor múltiplo):
   *     chi² ≈ 56 ± 10,6. Superar 150 son casi 9 desviaciones: no pasa.
   *   - Generador con `byte % ALFABETO.length` a secas:
   *     chi² ≈ 1360. Medido rompiendo el generador a propósito.
   *
   * El umbral está donde está porque entre 90 y 1360 hay sitio de sobra para no
   * ser intermitente y seguir siendo un test con dientes.
   */
  test('la frecuencia por carácter supera un chi-cuadrado con 56 grados de libertad', () => {
    const MUESTRAS = 10_000;
    const conteos = new Map<string, number>(
      [...ALFABETO_PASSWORD].map((c) => [c, 0]),
    );

    for (let i = 0; i < MUESTRAS; i += 1) {
      for (const c of generarPasswordTemporal().replaceAll('-', '')) {
        conteos.set(c, (conteos.get(c) ?? 0) + 1);
      }
    }

    const total = [...conteos.values()].reduce((a, b) => a + b, 0);
    const esperada = total / ALFABETO_PASSWORD.length;

    let chi2 = 0;
    for (const conteo of conteos.values()) {
      chi2 += (conteo - esperada) ** 2 / esperada;
    }

    expect(chi2, `chi² = ${chi2.toFixed(1)} con 56 grados de libertad`).toBeLessThan(150);
  });

  test('cada carácter del alfabeto aparece al menos una vez en 10.000 contraseñas', () => {
    const vistos = new Set<string>();
    for (let i = 0; i < 10_000; i += 1) {
      for (const c of generarPasswordTemporal().replaceAll('-', '')) vistos.add(c);
    }
    // Un generador que "olvide" la cola del alfabeto (un `% (n - 1)`, por ejemplo)
    // se cae aquí aunque el chi-cuadrado lo dejara pasar por poco.
    expect(vistos.size).toBe(ALFABETO_PASSWORD.length);
  });
});
