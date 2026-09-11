import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

import { manejarClick, manejarPush } from "@/lib/push/sw-handlers";

/**
 * LA FUENTE DEL SERVICE WORKER. `public/sw.js` SALE DE AQUÍ Y ESTÁ IGNORADO.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESTE ARCHIVO SOLO CABLEA. NO HAY LÓGICA ADENTRO Y ES UNA REGLA, NO UN ESTILO.
 *
 * Un service worker no se puede instrumentar con Vitest y Playwright no ejecuta
 * service workers en WebKit: **todo lo que viva aquí es código que no se puede
 * probar**. Y el bug que importa —salir del handler `push` sin mostrar nada—
 * no se manifiesta como un aviso feo, sino como una suscripción revocada en
 * silencio y una aseadora que deja de recibir todo.
 *
 * Por eso la lógica de los dos handlers vive en `lib/push/sw-handlers.ts`, con
 * 21 tests, y aquí solo se conecta. Si alguna vez aparece un `try`, un `if` de
 * payload o un valor por defecto en este archivo, va en el sitio equivocado.
 * ════════════════════════════════════════════════════════════════════════════
 */

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

// OJO: `addEventListeners()` registra los de Serwist (install, activate, fetch,
// message). NO registra el de `push` ni el de `notificationclick`. Esos van
// abajo, y hay que ponerlos a mano.
serwist.addEventListeners();

// ── push ───────────────────────────────────────────────────────────────────
// `event.data` entra CRUDO: puede ser `null` y su `.json()` puede lanzar. No se
// toca aquí. `manejarPush` garantiza que siempre se pinta algo, y devuelve la
// promesa que `waitUntil` necesita para que el navegador no mate el worker
// antes de tiempo.
self.addEventListener("push", (event) => {
  event.waitUntil(manejarPush(event.data, self.registration));
});

// ── notificationclick ──────────────────────────────────────────────────────
// `close()` primero: cerrar el aviso es lo único que tiene que pasar sí o sí, y
// pasa antes de cualquier `await`.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const datos: { url?: unknown } = event.notification.data ?? {};
  event.waitUntil(manejarClick(datos.url, self.clients, self.location.origin));
});
