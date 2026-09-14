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

/**
 * TODO LO QUE SALE DE ESTE ORIGEN PASA DE LARGO. NI SE CACHEA NI SE INTERCEPTA.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * AÑADIDO EL 2026-09-13 (plan 07-12) CON LA MEDICIÓN DELANTE.
 *
 * `defaultCache` trae una regla comodín para todo lo que no es de este origen:
 * `NetworkFirst` con caducidad de una hora. **Con esa regla activa, la foto de
 * un recibo NO CARGA.** Medido con el build de producción, sonda con el
 * registro de red delante, cinco corridas: cuatro terminaron en
 * `net::ERR_FAILED` sin ninguna respuesta, y la única que funcionó lo hizo
 * porque la petición salió ANTES de que el worker tomara el control de la
 * pestaña (`fromServiceWorker: false`). El síntoma que ve el admin es el
 * diálogo del recibo diciendo `No se pudo mostrar el recibo.` sobre un archivo
 * que el servidor sirve con 200.
 *
 * La causa: una foto se pide con una etiqueta `<img>`, así que su petición es
 * `no-cors` y su respuesta es opaca. En cuanto el worker la atiende, esa
 * petición se vuelve a emitir desde dentro y **pierde su condición de opaca**:
 * pasa a exigir cabeceras de origen cruzado que el almacenamiento no manda, y
 * el navegador la corta. Por eso el mismo archivo carga sin worker y falla con
 * él.
 *
 * ── NO BASTA CON CAMBIAR LA ESTRATEGIA. MEDIDO TAMBIÉN ───────────────────
 *
 * El primer intento fue sustituir la estrategia de esa regla por una que solo
 * va a la red y no guarda nada. **Siguió fallando 4 de 5.** El problema no es
 * QUÉ hace la estrategia, es que el worker responda. Así que lo que hace falta
 * es que NO responda: sin nadie que conteste, el navegador hace la petición él
 * mismo, que es exactamente lo que funciona.
 *
 * De ahí la forma de esto: un oyente propio, registrado ANTES que los de
 * Serwist, que corta la propagación del evento para lo que no es de este
 * origen. Sin `respondWith`, el navegador se encarga. Es el mecanismo estándar
 * para dejar una petición fuera del worker, y por eso el oyente no hace nada
 * más: no es un `if` de lógica escondido, es cableado.
 *
 * ── Y HAY UNA SEGUNDA RAZÓN, QUE ES LA QUE HACE QUE ESTO NO SE REVIERTA ───
 *
 * Lo único que este producto pide a otro origen es Supabase: la base, la
 * autenticación y el almacenamiento privado. **Nada de eso se puede guardar en
 * una caché del navegador.** Son respuestas por usuario, y una copia en la
 * caché del worker sobrevive al cierre de sesión: en un teléfono compartido, la
 * siguiente persona que abra la aplicación puede encontrarse el recibo o la
 * lista de la anterior. La regla de `defaultCache` guardaba exactamente eso
 * durante una hora.
 *
 * Las fuentes NO son un tercer origen: `next/font/google` las descarga en el
 * build y las sirve desde aquí. Por eso la regla puede ser total y no una lista
 * de rutas de Supabase, que además habría que mantener.
 * ════════════════════════════════════════════════════════════════════════════
 */
self.addEventListener("fetch", (event) => {
  if (new URL(event.request.url).origin !== self.location.origin) {
    event.stopImmediatePropagation();
  }
});

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
