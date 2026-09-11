import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

/**
 * LA FUENTE DEL SERVICE WORKER. `public/sw.js` SALE DE AQUÍ Y ESTÁ IGNORADO.
 *
 * Este archivo solo CABLEA. No hay lógica adentro y es una decisión, no un
 * estilo: un service worker no se puede instrumentar con Vitest y Playwright no
 * ejecuta service workers en WebKit, así que todo lo que viva en este archivo
 * es código sin prueba posible. Los handlers viven en `lib/push/sw-handlers.ts`.
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
// message). NO registra el de `push` ni el de `notificationclick`. Esos los
// pone uno, y es justo lo que hace el plan 05-08 en su segunda tarea.
serwist.addEventListeners();
