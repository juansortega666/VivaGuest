import { describe, expect, test } from 'vitest';

import { esquemaCrearAseador } from './aseador.schema';
import { generarPasswordTemporal, LONGITUD_MINIMA_PASSWORD } from './password';

/**
 * `esquemaCrearAseador` es el ÚNICO sitio del sistema donde se impone el mínimo de
 * 12 caracteres. Medido en 02-RESEARCH §6.1: `auth.admin.createUser` acepta una
 * contraseña de 8 caracteres pese a `minimum_password_length = 12` en
 * `config.toml`, porque ese límite lo aplica el flujo de signup y esta es la Admin
 * API. Si estos tests desaparecen, la regla desaparece del sistema entero.
 */

/** Un payload válido al que cada test le rompe un solo campo. */
function valido(sobre: Record<string, unknown> = {}) {
  return {
    full_name: 'María Gómez',
    email: 'maria@ejemplo.com',
    phone: '3001234567',
    password: generarPasswordTemporal(),
    ...sobre,
  };
}

describe('esquemaCrearAseador — casos válidos', () => {
  test('acepta un alta completa', () => {
    const r = esquemaCrearAseador.safeParse(valido());
    expect(r.success).toBe(true);
  });

  test('acepta phone vacío', () => {
    const r = esquemaCrearAseador.safeParse(valido({ phone: '' }));
    expect(r.success).toBe(true);
    // Un `''` en la base no es "sin teléfono", es un teléfono que es la cadena
    // vacía. La lista de aseadores pinta `sin definir` para `null`, no para `''`.
    expect(r.success && r.data.phone).toBeNull();
  });

  test('acepta phone ausente', () => {
    const { phone: _phone, ...sinTelefono } = valido();
    const r = esquemaCrearAseador.safeParse(sinTelefono);
    expect(r.success).toBe(true);
    expect(r.success && r.data.phone).toBeNull();
  });

  test('acepta exactamente LONGITUD_MINIMA_PASSWORD caracteres', () => {
    const r = esquemaCrearAseador.safeParse(
      valido({ password: 'a'.repeat(LONGITUD_MINIMA_PASSWORD) }),
    );
    expect(r.success).toBe(true);
  });

  test('acepta la contraseña que produce el generador', () => {
    for (let i = 0; i < 50; i += 1) {
      const r = esquemaCrearAseador.safeParse(
        valido({ password: generarPasswordTemporal() }),
      );
      // Si alguien sube el mínimo por encima de lo que genera el generador, el
      // formulario quedaría imposible de enviar con el botón `Generar`. Este test
      // es el que amarra los dos extremos.
      expect(r.success).toBe(true);
    }
  });
});

describe('esquemaCrearAseador — normalización', () => {
  test('el email se normaliza a minúsculas y sin espacios', () => {
    const r = esquemaCrearAseador.safeParse(valido({ email: '  Maria@Ejemplo.COM ' }));
    expect(r.success).toBe(true);
    expect(r.success && r.data.email).toBe('maria@ejemplo.com');
  });

  test('el nombre se recorta', () => {
    const r = esquemaCrearAseador.safeParse(valido({ full_name: '  María Gómez  ' }));
    expect(r.success && r.data.full_name).toBe('María Gómez');
  });

  test('el teléfono se recorta', () => {
    const r = esquemaCrearAseador.safeParse(valido({ phone: '  3001234567 ' }));
    expect(r.success && r.data.phone).toBe('3001234567');
  });

  test('la contraseña NO se recorta ni se normaliza', () => {
    // Recortarla cambiaría la credencial que se le entrega al aseador respecto de
    // la que se guarda en GoTrue. Se genera en el servidor y viaja tal cual.
    const password = ` ${'x'.repeat(LONGITUD_MINIMA_PASSWORD)} `;
    const r = esquemaCrearAseador.safeParse(valido({ password }));
    expect(r.success && r.data.password).toBe(password);
  });
});

describe('esquemaCrearAseador — rechazos', () => {
  test('rechaza un email sin formato válido', () => {
    const r = esquemaCrearAseador.safeParse(valido({ email: 'no-es-un-email' }));
    expect(r.success).toBe(false);
    expect(r.success === false && r.error.issues[0].path).toEqual(['email']);
  });

  test('rechaza full_name vacío', () => {
    const r = esquemaCrearAseador.safeParse(valido({ full_name: '' }));
    expect(r.success).toBe(false);
    expect(r.success === false && r.error.issues[0].path).toEqual(['full_name']);
  });

  test('rechaza full_name que solo tiene espacios', () => {
    const r = esquemaCrearAseador.safeParse(valido({ full_name: '     ' }));
    expect(r.success).toBe(false);
    expect(r.success === false && r.error.issues[0].path).toEqual(['full_name']);
  });

  test('rechaza una contraseña de 11 caracteres', () => {
    const r = esquemaCrearAseador.safeParse(valido({ password: 'a'.repeat(11) }));
    expect(r.success).toBe(false);
    expect(r.success === false && r.error.issues[0].path).toEqual(['password']);
  });

  test('rechaza toda longitud por debajo del mínimo, incluida la cadena vacía', () => {
    for (let n = 0; n < LONGITUD_MINIMA_PASSWORD; n += 1) {
      const r = esquemaCrearAseador.safeParse(valido({ password: 'a'.repeat(n) }));
      expect(r.success, `una contraseña de ${n} caracteres NO puede pasar`).toBe(false);
    }
  });

  test('rechaza la contraseña de 8 caracteres que la Admin API sí aceptaría', () => {
    // Este es literalmente el caso medido en 02-RESEARCH §6.1 contra el GoTrue
    // vivo. Aquí es donde se para.
    const r = esquemaCrearAseador.safeParse(valido({ password: 'pw123456' }));
    expect(r.success).toBe(false);
  });
});

describe('esquemaCrearAseador — superficie de escalada', () => {
  test('un `role` en el payload NO llega a la salida', () => {
    const r = esquemaCrearAseador.safeParse(valido({ role: 'admin' }));
    expect(r.success).toBe(true);
    // T-02-35: el rol de la cuenta es un literal del código, nunca un campo del
    // formulario. Si el esquema pasara a `passthrough`, este test se cae.
    expect(r.success && 'role' in r.data).toBe(false);
  });

  test('un `is_active` en el payload tampoco llega a la salida', () => {
    const r = esquemaCrearAseador.safeParse(valido({ is_active: false }));
    expect(r.success && 'is_active' in r.data).toBe(false);
  });
});
