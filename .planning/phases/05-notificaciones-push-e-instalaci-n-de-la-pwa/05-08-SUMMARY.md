---
phase: 05-notificaciones-push-e-instalaci-n-de-la-pwa
plan: 08
subsystem: infra
tags: [pwa, serwist, service-worker, web-push, manifest, iconos, ios, tsconfig, vitest, tdd]

requires:
  - phase: 05-01
    provides: "`@serwist/next@9.5.12` y `serwist@9.5.12` instalados en lockstep y deliberadamente SIN enganchar en `next.config.ts`"
  - phase: 05-05
    provides: "`construirPayload()` y las dos envolturas de D-07 (declarativa y clásica) que el handler `push` tiene que saber leer, más `RUTA_POR_DEFECTO`"
  - phase: 05-03
    provides: "El dispatcher y el trigger que ponen filas en el outbox; este plan pinta lo que aquel emite"
  - phase: 02
    provides: "`app/layout.tsx` con su `Metadata`, y `--brand-identity` / `--font-brand` en `app/globals.css`"
provides:
  - "`next.config.ts` envuelto con `withSerwistInit`, build de webpack, sin `disable` en desarrollo"
  - "Las tres cabeceras de `/sw.js`: `Content-Type`, `Cache-Control: no-cache, no-store, must-revalidate` (T-05-31) y CSP `self`-only (T-05-32)"
  - "`app/sw.ts`: 26 líneas de cableado, cero `try` y cero `if`"
  - "`lib/push/sw-handlers.ts`: `manejarPush()` y `manejarClick()`, con 21 tests y el señuelo del payload ilegible corrido en rojo y en verde"
  - "`app/manifest.ts`: `/manifest.webmanifest` con `display: standalone`, `id`, y sin `orientation`"
  - "Los cinco PNG de marca y `public/marca/vivaguest-tile.svg` como su única fuente"
  - "`scripts/dev/generar-iconos.mjs`: rasterizador reejecutable y byte-determinista, sin dependencias nuevas"
  - "El enlace del icono de Apple en el layout raíz, por `icons.apple`"
affects: [05-02, 05-07, 05-09, 06, despliegue, e2e]

tech-stack:
  added: []
  patterns:
    - "La lógica que no se puede instrumentar sale del archivo que no se puede instrumentar: `app/sw.ts` solo cablea y todo lo demás vive en un módulo con Vitest"
    - "Señuelo corrido en los DOS sentidos y anotado: quitar el `try/catch` y comprobar el rojo es parte de la entrega, no una comprobación mental"
    - "Constantes duplicadas a propósito entre el emisor y el worker, con un test que las amarra, cuando importar arrastraría un módulo de Node al bundle del service worker"
    - "Un asset generado se verifica leyendo su cabecera binaria (IHDR del PNG), no confiando en que la herramienta hizo lo que se le pidió"
    - "Parámetros aplicados en un `<script>` inline antes del primer pintado, en vez de `page.evaluate()` tras la carga, para que un rasterizador sea determinista"

key-files:
  created:
    - app/sw.ts
    - app/manifest.ts
    - lib/push/sw-handlers.ts
    - lib/push/sw-handlers.test.ts
    - scripts/dev/generar-iconos.mjs
    - public/marca/vivaguest-tile.svg
    - public/icon-192.png
    - public/icon-512.png
    - public/icon-maskable-512.png
    - public/apple-touch-icon.png
    - public/badge-72.png
  modified:
    - next.config.ts
    - tsconfig.json
    - .gitignore
    - eslint.config.mjs
    - app/layout.tsx
    - scripts/ci/check-service-role.sh

key-decisions:
  - "El tsconfig va por el CAMINO DOCUMENTADO del research (`types` + `webworker` + `exclude`), y la decisión está medida: con la clave puesta `tsc --noEmit` sale en 0. No hizo falta el `tsconfig.sw.json` aparte"
  - "El verde de `tsc` depende de `skipLibCheck: true`: con `--skipLibCheck false` el choque dom↔webworker produce 36 errores, todos dentro de `node_modules/typescript/lib/lib.webworker.d.ts`. Queda escrito en el propio `tsconfig.json`"
  - "`lib/push/sw-handlers.ts` NO importa `./payload`: arrastraría `./colapso`, que abre con `import { createHash } from 'node:crypto'`, dentro del bundle del service worker. Las constantes se duplican y dos tests las amarran"
  - "`manejarClick` recibe `destino: unknown` y no `string`: es lo que permite que `app/sw.ts` no tenga ni un `if` ni un valor por defecto de payload, que es criterio de aceptación de esa misma tarea"
  - "`manejarClick` sanea el destino contra el origen de la aplicación. El payload viaja autenticado, así que esto no ataja a un atacante de red: ataja al emisor, y un toque desde la pantalla de bloqueo no tiene barra de direcciones que delate el salto"
  - "`icon` y `badge` salen de constantes y NO del payload, aunque el payload los traiga: son assets fijos y el emisor no tiene por qué elegir a qué URL apunta lo que se pinta en la pantalla de bloqueo"
  - "Las letras del tile van como GEOMETRÍA y no como `<text font-family=\"Poppins\">`: ninguna máquina de CI tiene Poppins, y el criterio de reejecutabilidad exige los mismos bytes"
  - "El icono de Apple va por `icons.apple` de la Metadata API y no por un `<link>` escrito en el JSX: es el mecanismo soportado de Next, verificado por curl sobre el build de producción"
  - "`app/manifest.ts` queda excluido del guardarraíl de colores literales: un Web App Manifest es JSON que lee el sistema operativo antes de que exista CSS y el formato solo admite valor literal"

patterns-established:
  - "Compuerta TDD con commits separados: `test(...)` con el rojo medido, después `feat(...)` con el verde, para que la secuencia quede en el historial y no solo en la memoria de quien la corrió"
  - "Los guardarraíles de `ci:arch` se amplían con exclusiones de una línea, con el riesgo residual escrito al lado, y se comprueba con un señuelo que lo demás se sigue atrapando"

requirements-completed: [PWA-02, NOTIF-01]

coverage:
  - id: D1
    description: "La app se puede instalar en la pantalla de inicio: el manifest se sirve con `display: standalone`, con `id` y sin `orientation`, y declara los tres iconos con el maskable marcado"
    requirement: PWA-02
    verification:
      - kind: other
        ref: "curl -s http://127.0.0.1:3011/manifest.webmanifest | grep -c '\"display\":\"standalone\"' → 1, sobre `npm run build && npm run start`"
        status: pass
      - kind: other
        ref: "El JSON servido NO contiene la clave `orientation` (grep -c orientation → 0)"
        status: pass
    human_judgment: false
  - id: D2
    description: "El handler `push` SIEMPRE muestra una notificación, incluso cuando el payload no se puede leer, que es lo único que impide que iOS revoque la suscripción (T-05-30)"
    requirement: NOTIF-01
    verification:
      - kind: unit
        ref: "lib/push/sw-handlers.test.ts#U9 · con un payload ILEGIBLE muestra igual una notificación genérica, porque no mostrarla revoca la suscripción"
        status: pass
      - kind: unit
        ref: "lib/push/sw-handlers.test.ts#U9 · el genérico del payload ilegible llega COMPLETO, no a medias: icono, badge, idioma y destino por defecto"
        status: pass
      - kind: other
        ref: "Señuelo corrido: quitado el `try/catch` de `manejarPush`, 4 tests en rojo con la `SyntaxError` propagándose sin pintar nada; restaurado, 21 en verde"
        status: pass
    human_judgment: false
  - id: D3
    description: "El handler lee las DOS envolturas de D-07 y muestra UNA SOLA notificación en ambas, nunca dos"
    requirement: NOTIF-01
    verification:
      - kind: unit
        ref: "lib/push/sw-handlers.test.ts#con la envoltura DECLARATIVA lee el bloque `notification` y muestra UNA SOLA notificación, no dos"
        status: pass
      - kind: unit
        ref: "lib/push/sw-handlers.test.ts#con la envoltura CLÁSICA muestra el título y el cuerpo verbatim, con icono, badge, tag y destino"
        status: pass
    human_judgment: false
  - id: D4
    description: "Tocar un aviso enfoca la ventana que ya está abierta en vez de abrir una nueva, y lleva a un destino del propio origen"
    requirement: NOTIF-01
    verification:
      - kind: unit
        ref: "lib/push/sw-handlers.test.ts#con una ventana del MISMO origen abierta la enfoca y la navega, y NO abre una ventana nueva"
        status: pass
      - kind: unit
        ref: "lib/push/sw-handlers.test.ts#un destino de OTRO origen se descarta: desde la pantalla de bloqueo no hay barra de direcciones que delate el salto"
        status: pass
    human_judgment: false
  - id: D5
    description: "El service worker se genera en el build de webpack, no se versiona y se sirve sin caché (T-05-31, T-05-32)"
    verification:
      - kind: other
        ref: "npm run build emite public/sw.js; git check-ignore -v public/sw.js → .gitignore:60; grep -c showNotification public/sw.js → 1"
        status: pass
      - kind: other
        ref: "curl -sI /sw.js → Cache-Control: no-cache, no-store, must-revalidate · Content-Security-Policy: default-src 'self'; script-src 'self' · Content-Type: application/javascript; charset=utf-8"
        status: pass
    human_judgment: false
  - id: D6
    description: "Hay un solo registro del service worker: lo inyecta `@serwist/next` y no se añadió ninguno manual (T-05-34)"
    verification:
      - kind: other
        ref: "grep -rn 'serviceWorker.register' app/ components/ hooks/ lib/ → ninguno. En el build, el único `_registerScript` es el de `@serwist/window`"
        status: pass
    human_judgment: false
  - id: D7
    description: "Los cinco iconos existen con su tamaño y su regla de transparencia, y el script que los genera es reejecutable byte a byte"
    requirement: PWA-02
    verification:
      - kind: other
        ref: "file public/*.png → apple-touch-icon 180x180 RGB · badge-72 72x72 RGBA · icon-192 192x192 RGB · icon-512 y icon-maskable-512 512x512 RGB"
        status: pass
      - kind: other
        ref: "Cinco corridas de `node scripts/dev/generar-iconos.mjs` producen UNA sola combinación de hashes sha256"
        status: pass
      - kind: other
        ref: "badge-72.png medido en canvas: 778 píxeles no transparentes, 0 de ellos no blancos; 4 406 transparentes"
        status: pass
    human_judgment: false
  - id: D8
    description: "El icono de la pantalla de inicio de iOS está enlazado por el camino más predecible"
    requirement: PWA-02
    verification:
      - kind: other
        ref: "curl -s /login | grep -o '<link rel=\"apple-touch-icon\"[^>]*>' → <link rel=\"apple-touch-icon\" href=\"/apple-touch-icon.png\"/>"
        status: pass
      - kind: other
        ref: "curl -s -o /dev/null -w '%{http_code}' sobre los cinco PNG → 200, Content-Type image/png"
        status: pass
    human_judgment: false
  - id: D9
    description: "El fallback de marca se ve como un logotipo legible en las tres formas (tile, maskable y badge monocromo)"
    requirement: PWA-02
    verification:
      - kind: manual_procedural
        ref: "Inspección visual de los cinco PNG durante la ejecución, incluido el badge renderizado sobre fondo oscuro para poder verlo"
        status: pass
    human_judgment: true
    rationale: "Que un logotipo se vea bien no es comprobable con un grep ni con una aserción: el tamaño, el peso y el aire entre las dos letras solo se juzgan mirándolos. Y además es un fallback declarado, así que el criterio real no es 'está bien diseñado' sino 'no bloquea la fase y se reemplaza cambiando un archivo'"

duration: 24min
completed: 2026-09-11
status: complete
---

# Phase 05 Plan 08: La envoltura instalable — manifest, iconos, service worker y Serwist Summary

**El sitio pasó a ser una app instalable con `display: standalone`, y la lógica que decide si una aseadora conserva su canal de avisos salió del archivo donde nadie la podía probar: los dos handlers viven en un módulo con 21 tests, y el del payload ilegible se corrió en rojo y en verde.**

## Performance

- **Duration:** 24 min
- **Started:** 2026-09-11T21:30Z
- **Completed:** 2026-09-11T21:55Z
- **Tasks:** 3 de 3
- **Files:** 16 (11 creados, 5 modificados) + 1 modificado no previsto (`eslint.config.mjs`)

## Accomplishments

- **La decisión del `tsconfig` se midió en vez de suponerse, y por los dos lados.** El plan avisaba de dos riesgos concretos y pedía decidir con la salida real de `tsc`. Resultado: el camino documentado del research sale en **0 errores**, así que no hizo falta el `tsconfig.sw.json` aparte. Pero la medición dio algo que el plan no anticipaba y que vale más que el veredicto: **el conflicto dom↔webworker es real** —con `--skipLibCheck false` este árbol produce **36 errores** (TS6200, TS2374, TS2403)— y está **entero dentro de `node_modules/typescript/lib/lib.webworker.d.ts`**. O sea: el verde depende de `skipLibCheck: true`, que venía de `create-next-app` y no se tocó. Y la clave `types` no rompe `Buffer` porque `next-env.d.ts` referencia `next`, cuyo `types/global.d.ts` abre con `/// <reference types="node" />`, y una referencia triple-barra explícita no la filtra esa clave. Las tres cosas quedan escritas en el propio `tsconfig.json`.
- **El señuelo de U9 se corrió de verdad, no de memoria.** Quitando el `try/catch` de `manejarPush`, la `SyntaxError` de `.json()` se propaga y la función sale **sin llamar `showNotification`**: 4 tests en rojo. Restaurado, 21 en verde. Ese es exactamente el bug que en iOS no produce «un aviso feo» sino la revocación silenciosa de la suscripción de esa aseadora.
- **`app/sw.ts` quedó en 26 líneas de código, cero `try` y cero `if`.** Las únicas coincidencias de `try` en el archivo son la palabra dentro de `PrecacheEntry` y el comentario que prohíbe ambos.
- **Se encontró y se cerró un defecto de reejecutabilidad que el plan pedía como criterio.** La primera versión del rasterizador hacía `setContent()` y después mutaba el DOM con `page.evaluate()`. Cinco corridas produjeron **tres combinaciones distintas de hashes**, porque `screenshot()` capturaba unas veces el frame anterior a la mutación y otras el posterior. Lo peor del síntoma es que los dos frames se ven **iguales a ojo** —el transform por defecto del SVG ya era el del 55% y solo cambiaba la precisión de los flotantes—, así que no había nada que mirar: solo `git status` ensuciándose tras correr un comando que no cambió nada. Encadenar dos `requestAnimationFrame` **no lo arregló**. Lo arregla aplicar los parámetros en un `<script>` inline que corre durante el parseo, antes del primer pintado: solo existe un frame posible. Cinco corridas, una sola combinación.
- **El rasterizador no confía en la herramienta: verifica el resultado.** Lee ancho, alto y tipo de color del IHDR del PNG a mano, sin librería, y falla si no coinciden con lo pedido. Dato que salió de ahí: Chromium emite **tipo de color 2 (RGB)** para los screenshots opacos, así que el «sin canal alfa» del `apple-touch-icon` se cumple **literalmente**, no solo en espíritu.
- **Cuatro puertas en la línea base y una suite más grande:** `tsc` en 0, `lint` en 0 errores y los 2 avisos preexistentes, `ci:arch` en 0, `build` en 0 con **13 rutas** (`/manifest.webmanifest` es la nueva). Los unitarios pasaron de **38 archivos / 678 tests** a **39 / 699**.

## Task Commits

1. **Task 1: Enganchar Serwist al build, sin Turbopack y sin duplicar el registro** — `9942d96` (feat)
2. **Task 2 · RED: los 21 casos de los handlers, en rojo** — `7b2f31a` (test)
3. **Task 2 · GREEN: `lib/push/sw-handlers.ts` y el cableado** — `981da75` (feat)
4. **Task 3: Manifest, los cinco iconos y el icono de Apple** — `5d6f566` (feat)

## Files Created/Modified

- `next.config.ts` — envuelto con `withSerwistInit({ swSrc: 'app/sw.ts', swDest: 'public/sw.js' })`, **sin `disable` en desarrollo** (perderlo es perder la capacidad de probar push en local), más `headers()` con las tres cabeceras de `/sw.js`.
- `tsconfig.json` — `webworker` en `lib`, `types: ["@serwist/next/typings"]`, `public/sw.js` excluido. Con los comentarios de la medición, que sobreviven al build porque Next preserva comentarios al reescribir el archivo (comprobado).
- `.gitignore` — `public/sw*` y `public/swe-worker*`.
- `app/sw.ts` — **nuevo.** Serwist más los dos `addEventListener`. Solo cableado.
- `lib/push/sw-handlers.ts` — **nuevo.** `manejarPush()` y `manejarClick()`, sin un solo import.
- `lib/push/sw-handlers.test.ts` — **nuevo.** 21 tests con dobles de objeto plano.
- `app/manifest.ts` — **nuevo.** Los valores de `05-UI-SPEC.md` §14.1, cada uno no obvio con su razón.
- `app/layout.tsx` — `icons: { apple: '/apple-touch-icon.png' }`.
- `public/marca/vivaguest-tile.svg` — **nuevo.** La fuente única de los cinco PNG.
- `public/*.png` — **nuevos.** Los cinco iconos. Se versionan: son assets de marca, no artefactos de build.
- `scripts/dev/generar-iconos.mjs` — **nuevo.** El rasterizador.
- `eslint.config.mjs` — `public/sw*.js` ignorado. Ver deviación 2.
- `scripts/ci/check-service-role.sh` — `app/manifest.ts` excluido del guardarraíl de colores. Ver deviación 4.

## Decisions Made

- **`manejarClick` recibe `destino: unknown` y no `string`.** El plan declaraba `string`. El cambio es lo que permite que `app/sw.ts` no tenga ni un `if` ni un valor por defecto de payload, que es criterio de aceptación de esa **misma** tarea: con `string`, el default `/mis-aseos` habría que aplicarlo en el archivo que no se puede probar, y duplicado. El nombre del parámetro y su papel no cambian.
- **`sw-handlers.ts` no importa nada.** Importar `./payload` para reusar sus constantes arrastraría `./colapso`, que abre con `import { createHash } from 'node:crypto'`, **dentro del bundle del service worker**. Las cuatro constantes compartidas se escriben dos veces y dos tests las amarran contra `payload.ts` —el test corre en Node, donde `node:crypto` sí existe—, así que la deriva se paga en rojo y no en un icono roto que nadie mira.
- **`manejarClick` sanea el destino contra el origen.** El payload de push viaja cifrado y autenticado, así que esto no ataja a un atacante de red: **ataja al emisor**. Un `notifications.url` mal escrito por un RPC futuro sacaría a la aseadora de la aplicación desde la pantalla de bloqueo, donde no hay barra de direcciones. Mismo criterio que `rutaSegura()` en `payload.ts`, aplicado otra vez del lado del dispositivo porque aquí llega lo que llegue, no lo que aquel módulo emitió.
- **`icon` y `badge` salen de constantes, no del payload.** Aunque el payload los trae, se ignoran: son assets fijos de la app y el emisor no tiene por qué elegir a qué URL apunta lo que se pinta en una pantalla de bloqueo.
- **Las letras del tile son geometría.** Ver deviación 5.
- **El maskable usa la marca al 45% y no al 55%**, y la cuenta está hecha: al 45% la marca mide 230.4 × 109.7 y la **diagonal** de ese rectángulo —que es lo que de verdad hay que meter en el círculo central de 410 px— da 255.2. Al 55% la diagonal sería 311.9, que **también** cabría, pero sin margen para que el logotipo definitivo de 2018 sea más ancho que dos letras.

## Deviations from Plan

### Auto-fixed Issues

**1. [Regla 3 - Bloqueante] `app/sw.ts` tuvo que nacer en la Task 1, no en la Task 2**

- **Found during:** Task 1.
- **Issue:** El plan lista `app/sw.ts` entre los archivos de la Task 2, pero el criterio de aceptación de la Task 1 exige que `npm run build` **emita `public/sw.js`**. `withSerwistInit({ swSrc: 'app/sw.ts' })` sobre un `swSrc` inexistente no puede compilar nada.
- **Fix:** La Task 1 crea `app/sw.ts` con **solo** la instancia de Serwist; la Task 2 le añade los dos `addEventListener`. El orden de las dos tareas no cambia y el reparto de responsabilidades del plan se respeta.
- **Files modified:** `app/sw.ts`
- **Verification:** `npm run build` en cero emitiendo `public/sw.js`.
- **Committed in:** `9942d96` y `981da75`

**2. [Regla 3 - Bloqueante] `npm run lint` se fue de 0 errores a 1 en cuanto existió `public/`**

- **Found during:** Task 1.
- **Issue:** ESLint no tenía ninguna exclusión de `public/` porque **el directorio no existía**. Al aparecer `public/sw.js` —un bundle minificado de 46 KB en dos líneas— la puerta pasó de la línea base (0 errores, 2 avisos) a **1 error y 87 avisos**, todos sobre código que nadie escribió. El error era `@typescript-eslint/no-this-alias` en la columna 4133.
- **Fix:** `public/sw*.js` y `public/swe-worker*.js` añadidos a `ignores` en `eslint.config.mjs`, con el mismo razonamiento que el `.gitignore`: lo que se linta es la fuente, `app/sw.ts`.
- **Files modified:** `eslint.config.mjs`
- **Verification:** `npm run lint` de vuelta en 0 errores y los 2 avisos preexistentes.
- **Committed in:** `9942d96`

**3. [Regla 3 - Bloqueante] El binario de Chromium de Playwright no estaba descargado**

- **Found during:** Task 3.
- **Issue:** `@playwright/test@1.62.1` está en `devDependencies` desde antes y ya pasó la compuerta humana del plan 05-01, pero **el navegador es un binario aparte** que `npm install` no baja. El rasterizador falló con `Executable doesn't exist at …/chromium_headless_shell-1234/…`.
- **Fix:** `npx --no-install playwright install chromium`. **No es un paquete nuevo:** no toca `package.json` ni el lockfile, y es el runtime de una dependencia ya aprobada, así que no dispara la compuerta de legitimidad. El propio script ya contemplaba este caso y fue el que imprimió el comando exacto, que es la razón por la que el plan pedía ese mensaje.
- **Files modified:** ninguno versionado.
- **Verification:** `node scripts/dev/generar-iconos.mjs` → 5 de 5.
- **Committed in:** n/a.

**4. [Regla 3 - Bloqueante] `ci:arch` prohíbe colores literales, y un manifest no puede tener otra cosa**

- **Found during:** Task 3.
- **Issue:** El guardarraíl 6 de `scripts/ci/check-service-role.sh` falla ante cualquier hex fuera de `app/globals.css`, y `app/manifest.ts` declara `background_color` y `theme_color` en `#FFFFFF`. No hay forma de arreglarlo desde el manifest: **el Web App Manifest es JSON que lee el sistema operativo** para pintar la pantalla de arranque y la barra de estado **antes de que exista CSS**; un `var(--background)` ahí no significa nada y el formato solo admite valor literal.
- **Fix:** Exclusión de una línea para `app/manifest.ts`, con el porqué y el **riesgo residual escrito al lado** (si alguien cambia `--background`, estos dos valores no lo siguen; derivarlos leyendo el `.css` cambiaría un valor desalineado por una conversión de oklch a hex hecha a mano, que es peor sitio donde equivocarse). Se comprobó con un señuelo —un `app/.senuelo-color.ts` con `#ff7469`— que el guardarraíl **sigue atrapando** el resto de `app/`.
- **Files modified:** `scripts/ci/check-service-role.sh`
- **Verification:** `npm run ci:arch` en cero; el señuelo lo pone en rojo y al borrarlo vuelve a verde.
- **Committed in:** `5d6f566`

**5. [Regla 1 - Bug] El rasterizador no era reejecutable**

- **Found during:** Task 3, al comprobar el criterio de aceptación que lo exige.
- **Issue:** `setContent()` seguido de `page.evaluate()` para mover `#marca` y quitar `#fondo` dejaba una carrera: `screenshot()` capturaba a veces el frame **anterior** a la mutación. Cinco corridas → **tres combinaciones de hashes**. Confirmado midiendo: el hash `d70998ca` de `icon-192.png` resultó ser, exactamente, el del SVG renderizado **sin mutar**. Dos `requestAnimationFrame` encadenados **no** lo cerraron.
- **Fix:** Los parámetros se aplican en un `<script>` inline que corre durante el parseo, antes del primer pintado. No hay mutación después de la carga, así que solo existe un frame posible.
- **Files modified:** `scripts/dev/generar-iconos.mjs`
- **Verification:** cinco corridas seguidas → **una sola** combinación de hashes sha256.
- **Committed in:** `5d6f566`

### Desviaciones de diseño, con su razón

**6. Las letras del tile van como trazos y no como `<text font-family="Poppins">`**

`05-UI-SPEC.md` §14.2 pide `VG` en **Poppins 600**. Un `<text font-family="Poppins">` en un SVG versionado se ve **distinto en cada máquina que no tenga Poppins instalada**, y ninguna máquina de CI la tiene: eso rompe de frente el criterio de aceptación de que el script produzca **los mismos** cinco archivos. Las alternativas se evaluaron y son peores: bajar la fuente en cada corrida mete una dependencia de red en la generación de un asset, y sacar el `.woff2` que `next/font` deja en `.next/static/media/` ata un asset de marca a un artefacto de build con nombre hasheado y sin forma de identificar cuál de los 26 archivos es. Las dos letras se construyeron con geometría en el espíritu de una geométrica de peso 600 (la `V` son dos astas rectas con corte plano; la `G` es un anillo con abertura y barra en la línea media). **No son las curvas reales de Poppins y no pretenden serlo:** esto es el fallback declarado por el propio contrato, con su camino de reemplazo escrito en el SVG.

**7. `manejarClick(destino: unknown)` en vez de `destino: string`** — ver *Decisions Made*.

**8. El badge no es un segundo archivo SVG, es una variante por parámetro**

El plan autorizaba explícitamente las dos formas (*«Un segundo SVG (o una variante por parametro)»*). Se eligió la variante: el script quita `#fondo` y escala la marca al 78%. Una sola fuente de marca significa que cuando aparezcan los SVG de 2018 hay **un** archivo que cambiar, no dos que mantener sincronizados.

**9. El icono de Apple va por la Metadata API, no por un `<link>` escrito en el JSX**

El plan decía «Anadir `<link rel="apple-touch-icon" …/>`». Se usó `icons: { apple: … }`, que es el mecanismo **soportado** de Next: un `<link>` suelto en el árbol de componentes depende de que React lo ice hasta el `<head>`. El resultado emitido es idéntico y está verificado por curl sobre el build de producción, y `grep -c "apple-touch-icon" app/layout.tsx` devuelve **1**, como pide el criterio.

**10. La verificación por curl se hizo contra el puerto 3011, no el 3000**

El 3000 estaba ocupado por un `next start` de **otro checkout** —exactamente el falso resultado que `playwright.config.ts` documenta en su cabecera—. Medir ahí habría verificado el código de otro árbol. Todos los `curl` de este SUMMARY son contra `http://127.0.0.1:3011`.

---

**Total deviations:** 10 (4 de Regla 3 bloqueantes, 1 de Regla 1, 5 de diseño con su razón)
**Impact on plan:** Ninguna toca el diseño de la fase. Las cuatro de Regla 3 son la misma clase de cosa: `public/` **no existía** en este repositorio, y su aparición destapó tres herramientas (ESLint, el guardarraíl de colores, el binario de Playwright) que nunca habían tenido que lidiar con él. La de Regla 1 es el criterio de reejecutabilidad del propio plan haciendo su trabajo.

## Issues Encountered

- **La trampa de los duplicados de iCloud que anunciaba `05-CONTEXT.md` §code_context no apareció**, igual que en el plan 05-01. `npx tsc --noEmit` salió en cero antes y después de cada build.
- **`incremental: true` puede dar un falso verde al medir un cambio de `tsconfig`.** Antes de dar por bueno el camino documentado se repitió la medición con `--incremental false`: cero errores en los dos casos. Vale la pena recordarlo la próxima vez que se toque ese archivo.
- **El puerto 3000 de esta máquina lo tiene otro checkout.** No es un problema de este plan, pero cualquier verificación futura por HTTP tiene que usar puerto propio o estará midiendo otro árbol.

## Known Stubs

**Uno, declarado por el propio contrato de diseño y con fecha de caducidad escrita.**

| Stub | Archivo | Por qué es intencional y quién lo resuelve |
|---|---|---|
| El tile de marca es un fallback (`VG` geométrico sobre coral), no el logotipo de VivaGuest | `public/marca/vivaguest-tile.svg` y los cinco PNG derivados | `05-UI-SPEC.md` §14.2 lo define explícitamente como fallback: los SVG de 2018 (`vivaguest-logo-rojo.svg`, `vivaguest-logo-blanco.svg`) están registrados en `02-UI-SPEC` §4 pero **no están en el repositorio**. El contrato lo previó para que su ausencia no bloqueara la fase. Camino de reemplazo, escrito dentro del SVG: se cambia el contenido de `#marca` y se corre `node scripts/dev/generar-iconos.mjs`. Nada más hay que tocar. |

No hay stubs de datos ni de UI: este plan no renderiza ninguna pantalla. No hay valores vacíos cableados, ni componentes sin fuente de datos, ni texto de relleno.

**Nota para el auditor, para que no se reporte dos veces:** blanco sobre el coral `#ff7469` da **2.64:1**, por debajo de AA. **No es un hallazgo.** Es un logotipo, y WCAG 1.4.3 exime explícitamente al texto que forma parte de uno. La exención está declarada en `05-UI-SPEC.md` §14.2 y repetida dentro del propio SVG.

## Threat Flags

Ninguna nueva. Las cinco entradas del `<threat_model>` de este plan quedan cubiertas:

| Amenaza | Cómo queda |
|---|---|
| T-05-30 · el handler `push` saliendo sin mostrar nada | `manejarPush` arranca del genérico completo y solo lo reemplaza entero; dos tests dedicados y el señuelo corrido en los dos sentidos |
| T-05-31 · `/sw.js` cacheado que no se actualiza | `Cache-Control: no-cache, no-store, must-revalidate`, verificado por curl |
| T-05-32 · terceros ejecutándose dentro del worker | `Content-Security-Policy: default-src 'self'; script-src 'self'`, verificado por curl |
| T-05-33 · el payload registrado en la consola al fallar el parseo | El `catch` de `manejarPush` no registra nada y no relanza, con el porqué escrito en el propio `catch` |
| T-05-34 · dos service workers compitiendo por el scope | Registro único inyectado por `@serwist/next`; cero `serviceWorker.register` en fuentes |

Superficie nueva que **no** estaba en el registro y que se mitigó de más, anotada por transparencia y no como hallazgo: el destino de `notificationclick` es entrada que llega de la red y termina en una navegación. `manejarClick` lo resuelve contra el origen de la aplicación y descarta lo que se salga, con test propio. Es defensa en profundidad sobre lo que `rutaSegura()` ya hace del lado del emisor.

## TDD Gate Compliance

Secuencia completa y visible en el historial: `7b2f31a` **test** (RED, con el rojo medido: `Cannot find module './sw-handlers'`, 0 aserciones ejecutadas) → `981da75` **feat** (GREEN, 21 de 21). Sin fase REFACTOR: no hizo falta.

Nota metodológica que vale la pena dejar dicha: el rojo del RED fue un *module not found*, que es **un rojo sin una sola aserción ejecutada** —la misma clase de falso rojo contra la que avisa la cabecera de `vitest.config.ts`—. Por eso la señal que de verdad cierra la compuerta de esta tarea no es ese rojo sino **el del señuelo**, que corre con el módulo ya existente, con las 21 aserciones cargadas, y pone en rojo exactamente los 4 tests que dependen del `try/catch`.

## Self-Check: PASSED

Los 17 archivos declarados existen en disco y los 4 commits declarados existen en el
historial (`9942d96`, `7b2f31a`, `981da75`, `5d6f566`).
