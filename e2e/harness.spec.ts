import { createClient } from '@supabase/supabase-js';

import { expect, leerCredenciales, test } from './fixtures';

/**
 * Auto-test del harness E2E.
 *
 * Por qué existe, y por qué no es "un spec de relleno": en esta wave todavía no hay
 * ninguna pantalla, así que sin este archivo `npx playwright test` sale con
 * "No tests found" y código 1. Un harness que nunca se ejecuta no está verificado:
 * el `globalSetup` podría romperse en cualquier commit de aquí a que aterrice la
 * primera pantalla, y nadie se enteraría hasta que un test de verdad fallara por
 * una razón que no tiene nada que ver con lo que ese test mide.
 *
 * Este archivo prueba el CONTRATO del que dependen todas las fixtures: que hay tres
 * usuarios sembrados, con roles distintos, y que sus credenciales sirven para
 * autenticarse de verdad. No prueba ninguna pantalla, así que no estorba cuando las
 * pantallas aterricen.
 */
test.describe('harness E2E', () => {
  test('el globalSetup sembró los tres usuarios deterministas', async () => {
    const credenciales = leerCredenciales();

    expect(Object.keys(credenciales).sort()).toEqual(['admin', 'aseador1', 'aseador2']);
    expect(credenciales.admin.rol).toBe('admin');
    expect(credenciales.aseador1.rol).toBe('aseador');
    expect(credenciales.aseador2.rol).toBe('aseador');

    // Emails deterministas: las fixtures y los tests de aislamiento los dan por hechos.
    expect(credenciales.admin.email).toBe('e2e.admin@vivaguest.test');
    expect(credenciales.aseador1.email).toBe('e2e.aseador1@vivaguest.test');
    expect(credenciales.aseador2.email).toBe('e2e.aseador2@vivaguest.test');

    // Contraseña distinta por usuario. Si dos coincidieran, un test de aislamiento
    // entre aseadores podría pasar por accidente.
    const passwords = new Set(Object.values(credenciales).map((u) => u.password));
    expect(passwords.size).toBe(3);
  });

  test('las credenciales sembradas autentican de verdad contra GoTrue', async () => {
    const credenciales = leerCredenciales();

    // `process.env` aquí viene del `globalSetup`, que ya cargó `.env.local`.
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    expect(url, 'NEXT_PUBLIC_SUPABASE_URL debería venir de .env.local').toBeTruthy();
    expect(publishable).toBeTruthy();

    const cliente = createClient(url as string, publishable as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await cliente.auth.signInWithPassword({
      email: credenciales.aseador1.email,
      password: credenciales.aseador1.password,
    });

    expect(error).toBeNull();
    expect(data.session?.access_token).toBeTruthy();
    // El rol tiene que viajar en `app_metadata`: es lo que el middleware lee para
    // rutear, y es la mitad del doble escrito que el globalSetup hace.
    expect(data.user?.app_metadata.role).toBe('aseador');
  });
});
