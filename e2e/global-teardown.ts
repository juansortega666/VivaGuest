import { rmSync } from 'node:fs';

import {
  borrarSiExiste,
  cargarEnvLocal,
  clienteDeServicio,
  DIR_AUTH,
  USUARIOS_E2E,
} from './global-setup';

/**
 * `globalTeardown`: borra los usuarios semilla y los secretos de la corrida.
 *
 * El `globalSetup` ya borra y recrea al arrancar, así que la suite es correcta
 * aunque este teardown no llegue a ejecutarse (una corrida que revienta a mitad no
 * deja la siguiente rota). Esto es higiene, no corrección: evita dejar usuarios y
 * `storageState` con cookies vivas tirados en la base de desarrollo después de
 * cada `npm run test:e2e`.
 *
 * Best-effort a propósito: un fallo limpiando NO puede tumbar una suite que pasó.
 * Se avisa por consola y se sigue.
 */
export default async function globalTeardown(): Promise<void> {
  try {
    cargarEnvLocal();
    const admin = clienteDeServicio();
    for (const usuario of USUARIOS_E2E) {
      await borrarSiExiste(admin, usuario.email);
    }
  } catch (error) {
    console.warn(
      `[e2e] No se pudieron borrar los usuarios semilla: ${
        error instanceof Error ? error.message : String(error)
      }\nEl globalSetup los borra y recrea igual en la próxima corrida.`,
    );
  }

  try {
    rmSync(DIR_AUTH, { recursive: true, force: true });
  } catch {
    // Irrelevante: el directorio está en .gitignore y se regenera.
  }
}
