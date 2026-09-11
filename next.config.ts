import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

/**
 * SERWIST, ENGANCHADO AL BUILD DE WEBPACK. NO A TURBOPACK.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUÉ WEBPACK, Y POR QUÉ ESTO NO ES UNA PREFERENCIA
 *
 * `@serwist/turbopack` tiene un bug abierto —serwist#360— que produce
 * `ERR_MODULE_NOT_FOUND` en runtime tras un fallo de caché, y además un
 * manifest de precache VACÍO. Reproducido en 9.5.11 y en 9.5.12, que es la
 * versión que este proyecto tiene instalada.
 *
 * La consecuencia concreta de un precache vacío en ESTA aplicación no es
 * "la app carga un poco más lento": es que el service worker que se despliega
 * no es el que se probó. Y el service worker es el ÚNICO que puede pintar un
 * aviso; si no se registra bien, la aseadora no se entera de que tiene trabajo
 * y nadie ve un error en ningún lado.
 *
 * De ahí la regla, que además es criterio de aceptación verificable:
 * **ni `npm run dev` ni `npm run build` llevan el flag `--turbopack`.**
 * Comprobado sobre `package.json` al escribir este archivo: ninguno lo lleva.
 * Si alguien lo añade, este comentario es la razón por la que hay que quitarlo.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── `disable` NO SE USA, TAMPOCO EN DESARROLLO ──────────────────────────────
 *
 * Medio internet recomienda `disable: process.env.NODE_ENV === 'development'`.
 * Aquí significaría exactamente una cosa: **no poder probar push en local**,
 * que es justo donde hay que probarlo primero. El service worker se genera
 * siempre y para el contexto seguro se usa `next dev --experimental-https`.
 *
 * ── NO HAY REGISTRO MANUAL DEL SERVICE WORKER, Y ES DELIBERADO ──────────────
 *
 * `@serwist/next` inyecta el registro él solo. La guía de PWA de Next muestra
 * un `navigator.serviceWorker.register(...)` a mano porque NO usa Serwist;
 * mezclar las dos guías deja dos service workers compitiendo por el scope `/`
 * (T-05-34). Ningún archivo de `app/` ni de `components/` registra nada.
 */
const withSerwist = withSerwistInit({
  // La fuente es TypeScript y vive en `app/`, junto al resto del árbol de la
  // aplicación. El artefacto sale a `public/sw.js`, que está en `.gitignore`:
  // se GENERA en cada build, y versionarlo garantiza un conflicto por merge y
  // un service worker obsoleto en producción.
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
});

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // El scope de un service worker es la carpeta desde la que se sirve,
        // así que `/sw.js` en la raíz controla el origen entero. Las tres
        // cabeceras de abajo cubren esa superficie.
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            // LA QUE IMPORTA (T-05-31). Un service worker cacheado es un
            // service worker que no se actualiza, y aquí el service worker es
            // el único que puede pintar un aviso: un `/sw.js` viejo pegado en
            // un CDN es un aseador que deja de recibir avisos hasta que su
            // navegador decida revalidar, sin error visible en ningún lado.
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            // T-05-32. Nada de terceros se ejecuta dentro del worker.
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self'",
          },
        ],
      },
    ];
  },
};

export default withSerwist(nextConfig);
