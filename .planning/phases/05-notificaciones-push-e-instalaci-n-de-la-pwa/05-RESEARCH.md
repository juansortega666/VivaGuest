# Fase 5: Notificaciones push e instalación de la PWA - Research

**Investigado:** 2026-09-03
**Dominio:** Web Push (VAPID) sobre iOS/Android, PWA instalable con Serwist, drenaje de una cola de notificaciones desde Postgres
**Confianza global:** ALTA en el comportamiento de la plataforma (evidencia primaria de MDN BCD, caniuse, docs de Apple y WebKit). BAJA en todo lo que depende del schema real del repo, porque no pude leerlo. Ver el aviso de abajo.

---

## Aviso de alcance: la lectura del repositorio está bloqueada

El entorno de esta sesión no tiene permiso de macOS (TCC) sobre `~/Documents`. Cualquier intento de **leer** un archivo preexistente de `/Users/juanortega/Documents/VivaGuest/` falla con `Operation not permitted`, con Bash (sandbox activo y desactivado) y con la herramienta de lectura. El orquestador confirmó que tiene el mismo bloqueo, así que no es un proceso concreto, es toda la sesión. La **escritura** sí funciona, y por eso este archivo está en su ruta final.

**No se pudo leer:** `ROADMAP.md`, `REQUIREMENTS.md`, `PROJECT.md`, `STATE.md`, `CLAUDE.md`, `supabase/migrations/`, `03-10-SUMMARY.md`, `04-RESEARCH.md`, `.planning/config.json`, ni un `CONTEXT.md` de esta fase si existe.

**Cómo está tratado ese hueco, y es deliberado.** Nada que dependa del repo está escrito a ciegas. Cada punto ciego aparece como un bloque **`PENDIENTE DE ANCLAR`** que nombra el archivo exacto que hay que abrir y la pregunta concreta que contesta. Un hueco nombrado con precisión se cierra en minutos. Un párrafo inventado primero hay que detectarlo, y para entonces ya contaminó el plan.

| Bloque | Estado |
|---|---|
| iOS, Safari, APNs, VAPID, Serwist, Playwright, códigos de error | **Completo y verificado contra fuente primaria.** No depende del repo, y es donde vive el riesgo real de esta fase. |
| Diseño del drenaje | Razonamiento arquitectónico completo, apoyado en limitaciones documentadas de `pg_net`. Las formas de tabla van en `PENDIENTE DE ANCLAR 1`. |
| Requisitos `NOTIF-*` | `PENDIENTE DE ANCLAR 3` |
| Criterios de éxito del ROADMAP | `PENDIENTE DE ANCLAR 4` |

### Índice de puntos ciegos

| # | Qué falta | Archivo que lo cierra | Pregunta que contesta | Sección |
|---|---|---|---|---|
| 1 | Forma de `notifications` y de la tabla de suscripciones | `supabase/migrations/` | ¿El estado de entrega cabe en una tabla nueva sin tocar lo que lee la Fase 4? | `## Architecture Patterns` |
| 2 | Patrón real del dispatcher de la Fase 3 | `.planning/phases/03-*/03-10-SUMMARY.md` | ¿Cómo se llaman el guard del secreto, el watchdog y la guarda de colapso, para reusarlos y no reinventarlos? | `## Architecture Patterns` |
| 3 | Requisitos `NOTIF-*` y los de instalación de la PWA | `.planning/REQUIREMENTS.md` | ¿Qué requisito cubre cada hallazgo, y hay alguno que esta investigación no toque? | `## Phase Requirements` |
| 4 | Criterios de éxito literales de la Fase 5 | `.planning/ROADMAP.md`, sección "Phase 5" | ¿La `## Validation Architecture` prueba cada criterio o solo los derivados del objetivo? | `## Phase Requirements` |
| 5 | Query exacta del panel de alertas de la Fase 4 | `.planning/phases/04-*/04-RESEARCH.md` y el código del panel | ¿Qué consulta exacta tiene que seguir devolviendo lo mismo después de un drenaje? | `## Validation Architecture`, prueba P5 |
| 6 | `workflow.nyquist_validation` y `security_enforcement` | `.planning/config.json` | ¿Las secciones de validación y seguridad aplican, o alguna está desactivada? | `## Validation Architecture` |
| 7 | Si `@playwright/test` ya está instalado | `package.json` | ¿La capa E2E es configuración o hay que instalar? | `## Environment Availability` |

Lo marcado `[ASSUMED]` en el resto del documento **no** son huecos del repo. Son afirmaciones de plataforma que no pude confirmar contra documentación oficial, y están separadas de lo medido en `## Assumptions Log`.

---

## User Constraints

No pude leer `CONTEXT.md`. Estas restricciones vienen del brief del orquestador y se tratan como decisiones cerradas.

### Decisiones cerradas

- **Push es el único canal de notificación al aseador.** No hay SMS ni WhatsApp de respaldo. Riesgo aceptado y registrado: si en el piloto un aseo confirmado nunca llega, entra el semáforo de entregabilidad, hoy diferido a v2 (`NOTIF-V2-01`).
- Next.js 15.5.24 con webpack, sin Turbopack.
- `web-push@3.6.7` en runtime `nodejs`, no Edge.
- `@serwist/next@9.5.12` con `serwist` en la misma versión exacta.
- `@serwist/turbopack` está vetado por el bug abierto serwist#360 en Vercel.
- La cola de notificaciones ya existe. La Fase 3 escribe en ella, la Fase 4 la lee para el panel de alertas, **la Fase 5 la drena sin romper ninguna de las dos.**
- Costura declarada de la Fase 4: confirmar un aseo lo asigna pero no notifica. Esta fase cierra ese lazo.

### Discreción de Claude

- Mecanismo de disparo del drenaje (`pg_cron` + `pg_net` frente a alternativas).
- Estrategia de reintentos, backoff y poda de suscripciones muertas.
- Diseño de la interfaz de instalación y de solicitud de permiso.
- Forma del payload.

### Fuera de alcance

- Semáforo de entregabilidad (`NOTIF-V2-01`), diferido a v2.
- Cualquier canal alterno a push.

---

## Phase Requirements

> **PENDIENTE DE ANCLAR 3.** Abrir `.planning/REQUIREMENTS.md` y extraer los requisitos `NOTIF-*` y los de instalación de la PWA.
> *Pregunta que contesta:* ¿qué requisito concreto cubre cada hallazgo de este documento, y queda alguno sin cubrir?
> *Formato esperado al cerrarlo:* tabla `ID | Descripción | Hallazgo que lo habilita`.

> **PENDIENTE DE ANCLAR 4.** Abrir la sección "Phase 5" de `.planning/ROADMAP.md`.
> *Pregunta que contesta:* ¿cuáles son los criterios de éxito literales, y la sección `## Validation Architecture` prueba cada uno?
> *Formato esperado al cerrarlo:* una fila de validación por criterio, con su señuelo.

Mientras tanto, la `## Validation Architecture` está construida sobre los criterios que se derivan del objetivo declarado por el orquestador: **que un aseo confirmado produzca una notificación entregada al aseador responsable, sobre un canal único y sin respaldo.** Si el ROADMAP añade criterios, hay que añadir pruebas. Si alguno contradice algo de aquí, manda el ROADMAP.

---

## Resumen

Hay un solo hallazgo que domina esta fase, y es de plataforma, no de código: **en iOS, Web Push existe únicamente dentro de una web app añadida a la pantalla de inicio, y el evento `pushsubscriptionchange` no existe.** Lo primero está verificado en caniuse (`a #7` en todas las versiones desde 16.4 hasta 26.6) y en la documentación de Apple. Lo segundo está en MDN browser-compat-data con `"version_added": false` para `safari_ios`, que es la forma en que BCD dice "esto no se implementó, punto". La combinación significa que en el dispositivo del aseador no existe ningún mecanismo automático de auto reparación de la suscripción. Si la suscripción muere, el sistema se entera solo por dos vías: el código de error que devuelve APNs al enviar, o el hecho de que el aseador abra la app. No hay tercera.

El segundo hallazgo que cambia el diseño: **Safari revoca el permiso de push si tu service worker recibe un push y no muestra una notificación.** Esto es literal de la documentación de Apple: *"Safari doesn't support invisible push notifications. Present push notifications to the user immediately after your service worker receives them. If you don't, Safari revokes the push notification permission for your site."* Un bug en el handler `push` del service worker no produce "una notificación que no llegó", produce **la muerte silenciosa de la suscripción de ese aseador.** La mitigación no es tener cuidado, es estructural: mandar el payload en formato Declarative Web Push (`"web_push": 8030`), que en iOS 18.4+ hace que el sistema muestre una notificación de respaldo aunque el service worker falle o no exista.

El tercero es de producto, no técnico: la denegación del permiso en iOS es, en la práctica, irreversible sin desinstalar y reinstalar la web app. Con 8 aseadores conocidos y un canal único sin respaldo, la conclusión operativa es que **la instalación y la concesión del permiso no se delegan al usuario final: se hacen asistidas, una vez, con el teléfono en la mano**, y el admin ve en el dashboard quién quedó sin push. El patrón de priming (pedir permiso solo desde el clic de un botón propio que ya explicó el porqué, con un "Ahora no" que no dispara nada) es obligatorio, pero es la segunda línea de defensa, no la primera.

**Recomendación principal:** el envío corre en un Route Handler de Next.js con runtime `nodejs`, disparado por `pg_cron` + `pg_net` reusando el patrón de dispatcher de la Fase 3, porque `pg_net` no puede cifrar payloads y por lo tanto Postgres puede ser el disparador pero nunca el emisor. El drenaje escribe su estado en una tabla propia de entregas, no en las columnas de `notifications` que lee el panel de la Fase 4.

---

## Architectural Responsibility Map

| Capacidad | Tier primario | Tier secundario | Razón |
|---|---|---|---|
| Mostrar la notificación en el dispositivo | Browser / Service Worker | Sistema operativo (fallback declarativo) | Solo el SW puede llamar `self.registration.showNotification()`. En iOS 18.4+ el sistema muestra el respaldo si el SW no lo hace. |
| Pedir el permiso de notificación | Browser / Client | ninguno | `Notification.requestPermission()` exige gesto de usuario y contexto de web app instalada. No hay equivalente servidor. |
| Crear y renovar la suscripción push | Browser / Client | API / Backend (persistencia) | `pushManager.subscribe()` solo existe en el cliente. El servidor solo guarda el resultado. |
| Auto reparación de la suscripción | Browser / Client (al abrir la app) | API / Backend (poda por código de error) | En iOS no hay `pushsubscriptionchange`, así que el cliente tiene que revalidar en cada arranque. |
| Cifrado del payload y firma VAPID | API / Backend (Node) | ninguno | ECDH + AES128GCM + JWT ES256. Requiere `node:crypto`. No corre en Edge ni en Postgres. |
| Decidir qué notificación sale y a quién | Database / Storage | API / Backend | La cola ya vive en Postgres y es la fuente de verdad. El backend solo la lee. |
| Disparar el ciclo de drenaje | Database (`pg_cron` + `pg_net`) | ninguno | Ya existe el patrón en la Fase 3. Evita el tope de 1 corrida diaria de Vercel Hobby. |
| Manejo de errores de APNs y poda de suscripciones | API / Backend | Database (estado persistido) | El código de estado solo lo ve quien hace la petición HTTP. |
| Precache, offline y registro del SW | CDN / Static + Browser | Frontend Server (build) | Serwist genera `public/sw.js` en build y el navegador lo registra. |
| Instrucciones de instalación | Browser / Client | ninguno | La detección `display-mode: standalone` es puramente de cliente. |

---

## Standard Stack

### Core

| Librería | Versión | Propósito | Por qué es la estándar |
|---|---|---|---|
| `web-push` | `3.6.7` | Cifrado del payload, cabeceras VAPID, envío HTTP al push service | Estándar de facto. Publicada 2024-01-16 y sigue siendo `latest` hoy, verificado en el registry el 2026-09-03. No hay alternativa mantenida con mejor tracción. 8.27M descargas la última semana. |
| `@serwist/next` | `9.5.12` | Integración del service worker con el build de Next | Publicada 2026-07-22, `latest` hoy. Fork mantenido de Workbox. Existe un dist-tag `preview` en `10.0.0-preview.14`: **no usarlo.** |
| `serwist` | `9.5.12` | Runtime del service worker | Debe ir en la **misma versión exacta** que `@serwist/next`. El monorepo publica en lockstep. |

### De apoyo

| Librería | Versión | Propósito | Cuándo |
|---|---|---|---|
| `zod` | `4.5.4` (ya en el proyecto) | Validar el `PushSubscription` que manda el cliente antes de guardarlo | Siempre. El cuerpo de la suscripción viene del cliente y toca tratarlo como hostil. |
| `@playwright/test` | `1.62.1` (ya en el proyecto) | E2E del ciclo push en Chromium | Solo Chromium. Ver `## Validation Architecture`. |
| `vitest` | `4.1.11` (ya en el proyecto) | Unit del mapeo de errores y del constructor de payload | Ahí está el riesgo lógico real. |

### Alternativas consideradas

| En vez de | Se podría usar | Compensación |
|---|---|---|
| `web-push` | Escribir el cifrado a mano con `node:crypto` | ECDH P-256, HKDF, AES-128-GCM y el JWT ES256 en base64url. Cuatro sitios donde equivocarse produce un `400 BadWebPushRequest` que no dice cuál. No. |
| `pg_cron` + `pg_net` para disparar | Vercel Cron | En Hobby, Vercel Cron está capado a **1 corrida por día** y no reintenta. En Pro sí sirve, pero ya tienes el dispatcher de la Fase 3 funcionando y con watchdog. Reusar gana. |
| `pg_cron` + `pg_net` | Supabase Edge Function en Deno | Reescribir el envío en Deno y duplicar el pipeline de tests, para nada. `web-push` es Node. |
| Drenaje por cron | Trigger de Postgres que llame a `net.http_post` al insertar | Tentador por la latencia, pero `pg_net` dispara al hacer commit, sin reintentos ni control de concurrencia. Pierdes el batching, el backoff y la guarda de colapso. Sirve como *aceleración opcional* encima del cron, no como reemplazo. |
| Declarative Web Push como mecanismo único | Solo service worker | Declarative solo existe en Safari 18.4+ y macOS 15.5+. En Chrome no está implementado (`crbug.com/382298314`). Hay que mandar **ambos** en el mismo payload. |
| `@serwist/next` | Service worker a mano | Para push puro sería viable. Lo que no quieres escribir tú es el precache de los assets de Next con hashes de build. |

**Instalación:**

```bash
npm install web-push@3.6.7 @serwist/next@9.5.12
npm install -D serwist@9.5.12 @types/web-push
```

Verificación en el registry el **2026-09-03**:

```
web-push        3.6.7    latest    modificado 2024-01-16
serwist         9.5.12   latest    modificado 2026-07-22   (preview: 10.0.0-preview.14)
@serwist/next   9.5.12   latest    modificado 2026-07-22   (preview: 10.0.0-preview.14)
```

---

## Package Legitimacy Audit

`slopcheck` **no está disponible** en este entorno. Intenté instalarlo con `pip install slopcheck` y falló. Según el protocolo, eso obliga a marcar los paquetes `[ASSUMED]` y a que el planner meta un `checkpoint:human-verify` antes de cada install. Lo hago, con la salvedad de que estos tres paquetes ya están fijados como decisión de stack en `CLAUDE.md` y `web-push` viene recomendado por la guía oficial de PWA de Next.js, así que el checkpoint es una formalidad barata.

Verificación manual sustitutiva, ejecutada contra el registry de npm y la API de descargas el 2026-09-03:

| Paquete | Registry | Edad | Descargas / semana | Repo fuente | postinstall | slopcheck | Disposición |
|---|---|---|---|---|---|---|---|
| `web-push` | npm | creado 2015-09-28, ~11 años | 8 276 608 | github.com/web-push-libs/web-push | ninguno | no disponible | Aprobado `[ASSUMED]` |
| `serwist` | npm | creado 2024-04-11, ~2.4 años | 568 482 | github.com/serwist/serwist | ninguno | no disponible | Aprobado `[ASSUMED]` |
| `@serwist/next` | npm | creado 2023-12-03, ~2.8 años | 441 387 | github.com/serwist/serwist | ninguno | no disponible | Aprobado `[ASSUMED]` |

**Paquetes eliminados por veredicto `[SLOP]`:** ninguno, no se pudo correr slopcheck.
**Paquetes marcados sospechosos `[SUS]`:** ninguno por evidencia manual. Los tres tienen repo público, años de existencia, volumen alto y **cero scripts `postinstall`**, verificado con `npm view <pkg> scripts.postinstall` que devolvió vacío en los tres.

`@types/web-push` no lo verifiqué. Es un paquete DefinitelyTyped y el planner debería confirmarlo antes de instalarlo, o comprobar primero si `web-push@3.6.7` ya trae tipos propios.

---

## Los hechos duros de iOS

Esta es la sección que justifica que la fase se investigue antes de planearse. Todo lo de aquí está verificado hoy contra fuente primaria, no copiado de `CLAUDE.md`.

### Soporte de Push API en iOS Safari

Datos crudos de `caniuse/features-json/push-api.json`, rama `main`, descargado el 2026-09-03:

```
16.4=a #7 | 16.5=a #7 | 16.6-16.7=a #7 | 17.0=a #7 | ... | 18.5-18.7=a #7 | 26.0=a #7 | ... | 26.6=a #7
```

Todas las versiones anteriores a 16.4 son `n`. La nota `#7`, verbatim: **"Requires website to first be added to the Home Screen."**

`[VERIFIED: caniuse push-api.json, main, 2026-09-03]` **El requisito de instalación en la pantalla de inicio sigue vigente en iOS 26.6, la versión más reciente que caniuse rastrea.** No ha cambiado en tres años. Confianza ALTA.

Complementos del mismo dataset:

- `notifications.json`, `ios_saf`: `a #3` desde 16.4 hasta 26.6, donde `#3` es *"Requires website to first be added to the Home Screen"*.
- `serviceworkers.json`, `ios_saf`: `y` en todo el rango. Los service workers sí funcionan en una pestaña normal de Safari iOS. Lo que no funciona en pestaña es el push.
- `safari` de escritorio pasó a `y` en 18.0. La nota `#3` dice *"Safari 7.0 - 26.3 supported Safari Push Notifications"*, o sea que el mecanismo propietario viejo desapareció en 26.4.

### Corrección a `CLAUDE.md`: la API `Notification` sí existe en iOS

`CLAUDE.md` dice, en "What NOT to Use": *"`Notification` API en iOS: No soportada (caniuse `notifications` `ios_saf` = `a #1`)"*.

Ese dato está desactualizado en dos puntos y el segundo importa:

1. En el caniuse de hoy, `ios_saf` de `notifications` lleva `#3` (requiere pantalla de inicio), no `#1`. La nota `#1` (*"Supports notifications via the Push API but not the Web Notifications API"*) no está aplicada a ninguna versión de iOS.
2. MDN browser-compat-data, `api/Notification.json`, consultado el 2026-09-03:

```
Notification.requestPermission()  safari_ios: 16.4, partial_implementation: true
  "The parent Notification interface is undefined unless the page is a web app saved to
   the home screen. The app's manifest must have a non-default display value."

Notification.permission           safari_ios: 16.4, misma nota

new Notification()                safari_ios: 16.4, partial_implementation: true
  "This constructor throws a ReferenceError exception, unless the page is a web app saved
   to the home screen. (...) A notification can only be sent from a service worker."
```

`[VERIFIED: MDN BCD api/Notification.json, main, 2026-09-03]`

La lectura correcta, y es operativamente distinta:

- **`Notification.requestPermission()` es exactamente cómo se pide el permiso en iOS.** Está disponible desde 16.4 dentro de la web app instalada. No hay otra forma.
- Lo que no se puede usar es el **constructor** `new Notification(...)`, que lanza `ReferenceError`. Para mostrar, `self.registration.showNotification()` desde el service worker. Ahí `CLAUDE.md` acierta en la conclusión, aunque no en la premisa.
- **Consecuencia de diseño gratis:** en una pestaña normal de Safari iOS, `window.Notification` es `undefined`. Eso te da un feature detect exacto y sin user agent sniffing para decidir si mostrar "instálame primero" o "activa los avisos":

```ts
const puedePedirPermiso = typeof window !== 'undefined' && 'Notification' in window
```

- El manifest debe tener un `display` **no default**. Apple, en el blog de WebKit del 2023-02-16, lo concreta a `standalone` o `fullscreen`. Usa `standalone`.

### `pushsubscriptionchange` no existe en iOS. Este es el hallazgo caro

MDN browser-compat-data, `api/ServiceWorkerGlobalScope.json`, consultado el 2026-09-03:

```
pushsubscriptionchange_event
  safari:         16       (macOS Ventura o superior)
  safari_ios:     false        <-- no implementado
  chrome:         138          <-- muy reciente
  chrome_android: mirror       (o sea, 138)
  firefox:        44, partial_implementation
                  "The event does not have the oldSubscription and newSubscription properties"
  edge:           17, removido en 79
```

`[VERIFIED: MDN BCD api/ServiceWorkerGlobalScope.json, main, 2026-09-03]` Confianza ALTA.

Dos cosas, y las dos son malas:

1. **En iOS el evento nunca dispara.** La estrategia clásica de "me resuscribo solo cuando el navegador me avisa que la suscripción cambió" no está disponible en la plataforma del aseador.
2. **En Chrome solo existe desde la 138.** Incluso en Android es reciente, así que tampoco se puede confiar en él como red de seguridad transversal.

**Por lo tanto la auto reparación es responsabilidad tuya, en dos frentes:**

- **Cliente, en cada arranque de la app.** Al montar la ruta del aseador: `getSubscription()`, y si no hay, o si el `endpoint` no coincide con el que el servidor tiene registrado, o si la `applicationServerKey` guardada no es la actual, entonces `unsubscribe()` y `subscribe()` de nuevo y re registrar. Barato, corre en background, no molesta al usuario y no necesita permiso nuevo si el permiso ya está concedido.
- **Servidor, en cada envío.** `404` y `410` desactivan la suscripción. Es la única señal que llega sin que el aseador abra la app.

Y una tercera, que es de producto y vale mucho aquí: **guarda un `ultima_vez_visto_at` en la suscripción, actualizado en cada arranque.** El admin necesita ver "este aseador no abre la app hace 6 días", que es la aproximación más honesta a telemetría de entrega sin construir el semáforo de v2.

`PushSubscription.expirationTime` sí existe en iOS 16.4+ según BCD, pero en la práctica los push services lo devuelven `null` casi siempre. No construyas la lógica de caducidad sobre ese campo. `[ASSUMED]`, marcado en el log.

### La denegación del permiso, en la práctica, es irreversible

Lo que está verificado y lo que no, separado:

`[CITED: developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers, consultado 2026-09-03]` y `[CITED: webkit.org/blog/13878, 2023-02-16]`:

> *"Provide a method for the user to grant permission with a gesture, such as clicking or tapping a button. When the user completes the gesture, call the push subscription method immediately from the gesture's event handler code."*

> *"Once allowed, the user can manage those permissions per web app in Notifications Settings, just like any other app on iPhone and iPad."*

Fíjate en el "**Once allowed**". Apple describe la gestión posterior solo para el caso en que el permiso ya se concedió. La documentación oficial **no dice nada** sobre qué pasa si el usuario deniega, y no encontré ninguna página de Apple que lo diga. Eso es un vacío real, no un descuido de mi búsqueda.

`[ASSUMED, corroborado por fuentes secundarias múltiples]`: si el usuario deniega, la web app no aparece en Ajustes, Notificaciones, y la única forma de volver a ver el diálogo es **borrar el icono de la pantalla de inicio y volver a añadirlo**. Llamar de nuevo a `requestPermission()` devuelve `denied` de inmediato, sin interacción. Fuentes: documentación de iOS web push de OneSignal (*"If permission is denied, the home screen app must be removed and re-added for the permission prompt to appear again"*), y el hilo 725619 de los foros de Apple, donde además aparece que borrar los datos del sitio no basta y que hay que re añadir a la pantalla de inicio. Confianza MEDIA en el mecanismo exacto, **ALTA en la conclusión operativa**, que es la que importa: trata cada solicitud de permiso como si tuvieras una sola oportunidad por dispositivo.

**Cómo cambia el diseño de la interfaz.** Tres reglas, no negociables:

1. **Nunca** llames `Notification.requestPermission()` en el montaje del componente, ni en un `useEffect`, ni detrás de un temporizador. Solo desde el `onClick` de un botón.
2. Antes de ese botón va una pantalla propia de priming que explica en una frase por qué (*"Te avisamos apenas te asignen un aseo. Sin esto no te enteras."*) y que ofrece **"Ahora no"**, que no dispara absolutamente nada del navegador. El usuario que iba a denegar sale por esa puerta y conserva su única oportunidad.
3. Después del clic afirmativo, `requestPermission()` y **acto seguido, en el mismo handler**, `pushManager.subscribe()`. Apple lo pide explícito: *"call the push subscription method immediately from the gesture's event handler code"*. Meter un `await` a tu API en medio puede costarte el gesto.

**Y la regla de producto, que vale más que las tres anteriores:** son 8 aseadores conocidos, con canal único y sin respaldo. La instalación y el permiso se hacen **asistidos, una vez, en persona o por videollamada**, durante el onboarding. El dashboard del admin tiene que mostrar, por aseador, si tiene suscripción activa y de cuándo. Dejar esto a que cada quien lo resuelva solo es apostar la promesa central del producto a un diálogo del sistema que solo se muestra una vez.

### Safari revoca el permiso si no muestras notificación

`[CITED: developer.apple.com, doc de web push, consultado 2026-09-03]`, verbatim:

> *"Safari doesn't support invisible push notifications. Present push notifications to the user immediately after your service worker receives them. If you don't, Safari revokes the push notification permission for your site."*

`[CITED: webkit.org/blog/12945/meet-web-push/, 2022-06-07]`:

> *"It also requires you set the `userVisibleOnly` flag to true, and fulfill that promise by always showing a notification in response to a push message."*
> *"Violations of the `userVisibleOnly` promise will result in a push subscription being revoked."*

Confianza ALTA en que la revocación existe. El número exacto de fallos tolerados (varias fuentes secundarias dicen "tres eventos push seguidos sin notificación") **no aparece en ninguna documentación oficial que haya encontrado**. Lo dejo `[ASSUMED]` y en Open Questions. No cambia el diseño: el número correcto de fallos a tolerar es cero.

Esto convierte un bug de JavaScript en el service worker en pérdida silenciosa de un canal. Las mitigaciones, en orden:

1. **`event.waitUntil(self.registration.showNotification(...))` siempre**, y en la rama de error también. Si el JSON del payload no parsea, muestra una notificación genérica. Nunca salgas del handler `push` sin haber mostrado algo.
2. **Manda el payload en formato Declarative Web Push.** Ver abajo. Es la única mitigación que sobrevive a que tu código falle.

### Declarative Web Push: el cinturón encima de los tirantes

`[CITED: webkit.org/blog/16535/meet-declarative-web-push/, 2025-03-27]` + `[VERIFIED: MDN BCD api/Window.json y api/PushEvent.json, 2026-09-03]`:

```
Window.pushManager        safari: 18.4 | safari_ios: 18.4 | chrome: false (crbug.com/382298314)
PushEvent.notification    safari_ios: 18.4
```

El mecanismo: si el payload JSON contiene la clave mágica `"web_push": 8030` y un objeto `notification` con `title` y `navigate`, Safari 18.4+ muestra la notificación **por sí solo, sin necesidad de service worker**. Y si hay service worker, según el blog de WebKit: el SW recibe el `PushEvent` con la notificación propuesta en `event.notification`; si el handler muestra una notificación de reemplazo, esa gana; si no muestra nada, **se muestra la declarativa**. La penalización por violar `userVisibleOnly` deja de aplicar porque el sistema garantiza que algo se mostró.

**Recomendación:** manda un solo payload que sirva a los dos mundos. Chrome ignora las claves que no conoce y usa tu handler `push`. Safari 18.4+ tiene red de seguridad. Safari 16.4 a 18.3 ignora lo declarativo y usa el handler, igual que Chrome. Coste: unos 150 bytes de payload. Beneficio: el modo de fallo más caro de la fase deja de existir en los dispositivos modernos.

No lo uses como mecanismo único: en Chrome no está implementado y ahí viven los aseadores con Android.

### `beforeinstallprompt` no existe en iOS, y Next.js recomienda no usarlo en absoluto

`[CITED: nextjs.org/docs/app/guides/progressive-web-apps, lastUpdated 2026-07-30]`, verbatim:

> *"You can provide a custom installation button with `beforeinstallprompt`, however, we do not recommend this as it is not cross browser and platform (does not work on Safari iOS)."*

Detección de "ya está instalada", que es lo que sí funciona en todos lados:

```ts
const instalada =
  window.matchMedia('(display-mode: standalone)').matches ||
  // iOS legacy, sigue siendo el más fiable en Safari viejo
  (window.navigator as unknown as { standalone?: boolean }).standalone === true
```

El flujo de instalación en iOS es manual y hay que **enseñarlo con imágenes**: botón Compartir en la barra inferior de Safari, deslizar, "Añadir a inicio", "Añadir". Con capturas reales del iPhone, no con iconos genéricos. Es la pantalla más aburrida de la fase y la que decide si el producto funciona.

Un detalle que se olvida: si el aseador abre el link desde WhatsApp, se abre en el navegador embebido de WhatsApp, no en Safari, y ahí **no hay botón de Compartir con "Añadir a inicio"** utilizable. caniuse lo dice en la nota `#6` para Safari de escritorio (*"Supported in Safari, not WKWebView nor SFSafariViewController"*) y el mismo principio aplica en iOS. Si el onboarding se manda por WhatsApp, la primera instrucción tiene que ser "abre este link en Safari", con el paso de los tres puntos, "Abrir en Safari", explicado.

### Códigos de estado y de error de APNs

De la documentación de Apple, consultada el 2026-09-03. Es la tabla más útil de todo este documento porque es la que evita la degradación silenciosa.

| HTTP | Descripción de Apple | Qué hacer |
|---|---|---|
| 201 | Success | Marcar entregado al push service. **No** significa entregado al dispositivo. |
| 400 | Bad request | Error de configuración o de payload. **Nunca** borrar la suscripción. Alertar. Ver `reason`. |
| 403 | There's an error with your authentication | Casi siempre `VapidPkHashMismatch`. Ver abajo. |
| 404 | The request contains an invalid `:path` value | Endpoint inválido. Desactivar la suscripción. |
| 405 | invalid `:method`, only POST | Bug de código. |
| 410 | The device token has expired | **Desactivar la suscripción, permanentemente.** |
| 413 | The notification payload is too large | Bug del constructor de payload. No reintentar. |
| 429 | The server is receiving too many requests for the same destination | Backoff. No desactivar. |
| 500 | Internal server error | Transitorio, reintentar con backoff. |
| 503 | The server is shutting down and is unavailable | Transitorio, reintentar con backoff. |

Códigos `reason` del JSON de respuesta, los que importan:

| `reason` | Significado | Acción |
|---|---|---|
| `VapidPkHashMismatch` | *"The VAPID public key from the push subscription doesn't match the VAPID public key in the request"* | La suscripción se creó con otra clave VAPID. Marcarla como `clave_obsoleta`, no como muerta. Exige re suscripción del cliente. |
| `BadJwtToken` | JWT ausente, firmado con la clave equivocada, `sub` que no es URL ni `mailto:`, `aud` que no es el origen del push service, o `exp` a más de un día | Error global de configuración. **Detén el drenaje entero y alerta.** Si esto pasa, ninguna notificación va a salir. |
| `BadVapidPublicKey` | clave ausente, no `base64url`, o de tipo incorrecto | Igual, global. |
| `PayloadTooLarge` | *"The payload size is over the limit of 4 KB"* | Bug. No reintentar. |
| `TooManyRequests` | demasiadas peticiones consecutivas al mismo token | Backoff por suscripción. |
| `BadTtl`, `BadUrgency`, `BadWebPushTopic` | cabeceras mal formadas | Bug de código. |

La distinción crítica, y es la que separa un sistema robusto de uno que se suicida: **`404` y `410` significan "esta suscripción murió". `400` y `403` significan "tu configuración está rota".** Si tratas un `403` masivo como si fuera `410`, borras las 8 suscripciones de la operación en una sola corrida y toca reinstalar en 8 teléfonos. Ese es exactamente el tipo de fallo contra el que la Fase 3 ya tiene una guarda de colapso, y el mismo patrón aplica aquí.

**Cabeceras que Apple documenta y que `web-push` expone como opciones:**

- `TTL`: segundos. Apple guarda hasta 30 días máximo. Para un aseo, un TTL largo es contraproducente: una notificación de "te asignaron el aseo de mañana" que llega tres días tarde es ruido. Pon algo del orden de horas.
- `Topic`: máximo **32 caracteres** del alfabeto base64 seguro para URL. Sirve para que el push service colapse notificaciones y la nueva reemplace a la vieja. Un UUID con guiones son 36 caracteres y **no sirve**: hay que derivar un identificador corto.
- `Urgency`: `very-low`, `low`, `normal`, `high`. Para "te asignaron un aseo", `high`.
- Apple pide además: no refrescar el JWT más de una vez por hora, y no más de 100 peticiones sin confirmar en la misma conexión HTTP/1.1.

---

## Architecture Patterns

> **PENDIENTE DE ANCLAR 1.** Abrir `supabase/migrations/` y leer el DDL de `notifications` y de la tabla de suscripciones push.
> *Preguntas que contesta:* ¿qué columnas tiene `notifications` y cuáles filtra el panel de la Fase 4? ¿La tabla de suscripciones guarda ya `endpoint`, `p256dh`, `auth` y un `usuario_id`? ¿Qué RLS tienen hoy? ¿Existe ya alguna columna de estado de envío?
> *Qué cambia según la respuesta:* si `notifications` ya tiene un `estado` que el panel filtra, el diseño de `push_entregas` de abajo se replantea. Todo lo demás de esta sección (fan-out, idempotencia, clasificación de errores, guarda de colapso) es independiente del schema y se sostiene igual.

> **PENDIENTE DE ANCLAR 2.** Abrir `.planning/phases/03-*/03-10-SUMMARY.md` y el código del worker de sync.
> *Preguntas que contesta:* ¿cómo se llama y cómo compara el guard del secreto compartido? ¿Cómo está implementada la guarda de colapso, con qué umbral? ¿Qué hace el watchdog y cada cuánto corre `pg_cron`?
> *Qué cambia según la respuesta:* solo los nombres y el punto de reuso. El argumento de por qué Postgres dispara pero no envía no depende de esto, está apoyado en las limitaciones documentadas de `pg_net`.

### Diagrama del sistema

```
  pg_cron (cada 1 min)
        │
        │  net.http_post(url, body, headers{secreto compartido de Vault})
        │  ── async, dispara al hacer commit, timeout 2000ms por defecto
        ▼
  ┌─────────────────────────────────────────────────────────────┐
  │  POST /api/push/drain     (Route Handler, runtime = nodejs)  │
  └─────────────────────────────────────────────────────────────┘
        │
        │ 1. guard: sha256 del secreto compartido, comparación en tiempo constante
        │    (mismo patrón que el worker de sync de la Fase 3)
        ▼
        │ 2. RPC de reclamo: SELECT ... FOR UPDATE SKIP LOCKED
        │    toma N notificaciones pendientes cuyo backoff ya venció
        ▼
  ┌──────────────────────────┐        ┌──────────────────────────────┐
  │  notifications           │───────▶│  suscripciones activas del   │
  │  (escrita por Fase 3,    │ join   │  destinatario                │
  │   leída por Fase 4)      │        │  (0..n por aseador)          │
  └──────────────────────────┘        └──────────────────────────────┘
        │                                        │
        │  fan-out: 1 notificación × n suscripciones
        ▼                                        ▼
  ┌─────────────────────────────────────────────────────────────┐
  │  push_entregas   unique(notification_id, suscripcion_id)     │
  │  ── esta unicidad es lo que hace imposible el doble envío    │
  └─────────────────────────────────────────────────────────────┘
        │
        │ 3. construir payload (< 3 KB), con web_push:8030 + notification{}
        │ 4. webpush.sendNotification(sub, payload, {TTL, Topic, Urgency})
        ▼
  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
  │ web.push     │   │ fcm.google    │   │ updates.push │
  │ .apple.com   │   │ apis.com      │   │ .services.moz│
  └──────────────┘   └──────────────┘   └──────────────┘
        │
        │ 5. clasificar respuesta
        ▼
    ┌───────────────┬───────────────┬────────────────┬─────────────────┐
    │ 201           │ 404 / 410     │ 429/500/503    │ 400 / 403       │
    │ entregado     │ desactivar    │ backoff        │ ALERTA GLOBAL   │
    │               │ suscripción   │ y reintentar   │ abortar corrida │
    └───────────────┴───────────────┴────────────────┴─────────────────┘
                            │
                            ▼
                    guarda de colapso:
                    si las desactivaciones de esta corrida
                    superan el umbral, aborta sin aplicar
        ║
        ║  push llega al dispositivo
        ▼
  ┌─────────────────────────────────────────────────────────────┐
  │  service worker (public/sw.js, generado por Serwist)         │
  │    'push'  ──▶ event.waitUntil(showNotification(...))        │
  │               en iOS 18.4+, si esto falla, el sistema         │
  │               muestra la notificación declarativa            │
  │    'notificationclick' ──▶ enfocar cliente existente         │
  │                             o abrir /aseos/{id}              │
  └─────────────────────────────────────────────────────────────┘
        │
        │ al abrir la app (no hay pushsubscriptionchange en iOS)
        ▼
  ┌─────────────────────────────────────────────────────────────┐
  │  revalidación en cliente: getSubscription(), comparar        │
  │  endpoint y applicationServerKey, re suscribir si difiere,   │
  │  actualizar ultima_vez_visto_at                              │
  └─────────────────────────────────────────────────────────────┘
```

### Estructura de archivos sugerida

```
app/
├── manifest.ts                  # MetadataRoute.Manifest, display: 'standalone'
├── sw.ts                        # fuente del SW: Serwist + handlers push/notificationclick
├── api/
│   └── push/
│       └── drain/route.ts       # runtime = 'nodejs', disparado por pg_cron
└── (aseador)/
    ├── _components/
    │   ├── instalar-pwa.tsx     # instrucciones iOS con capturas
    │   ├── priming-push.tsx     # pantalla propia previa al permiso
    │   └── sincronizar-push.tsx # revalidación al arrancar
    └── actions/push.ts          # Server Actions: registrar/borrar suscripción
lib/
└── push/
    ├── payload.ts               # constructor del payload, < 3 KB
    ├── errores.ts               # mapa código -> decisión. Puro, testeable
    └── enviar.ts                # envoltura de web-push
public/
├── sw.js                        # GENERADO por Serwist. En .gitignore
├── icon-192.png, icon-512.png, icon-maskable-512.png
├── apple-touch-icon.png         # 180x180, cinturón para iOS
└── badge-72.png                 # monocromo, para Android
```

### Patrón 1: la decisión de error es una función pura

El error handling de push es la parte con más lógica y menos I/O de toda la fase. Sepáralo para poder probarlo sin red.

```ts
// lib/push/errores.ts
export type DecisionPush =
  | { tipo: 'entregado' }
  | { tipo: 'desactivar_suscripcion'; motivo: string }
  | { tipo: 'requiere_resuscripcion'; motivo: string }
  | { tipo: 'reintentar'; esperarMs: number }
  | { tipo: 'bug'; motivo: string }             // no reintentar, alertar
  | { tipo: 'abortar_corrida'; motivo: string } // configuración rota, global

export function decidir(
  statusCode: number,
  body: string | undefined,
  headers: Record<string, string> | undefined,
  intento: number,
): DecisionPush {
  const reason = leerReason(body)

  if (statusCode >= 200 && statusCode < 300) return { tipo: 'entregado' }

  // Suscripción muerta. Es la única razón legítima para borrar.
  if (statusCode === 404 || statusCode === 410) {
    return { tipo: 'desactivar_suscripcion', motivo: `http_${statusCode}` }
  }

  // La suscripción se creó con otra clave VAPID. No está muerta, está desalineada.
  if (statusCode === 403 && reason === 'VapidPkHashMismatch') {
    return { tipo: 'requiere_resuscripcion', motivo: reason }
  }

  // Configuración global rota. Si sigues, fallan las 8.
  if (reason === 'BadJwtToken' || reason === 'BadVapidPublicKey' || statusCode === 403) {
    return { tipo: 'abortar_corrida', motivo: reason ?? `http_${statusCode}` }
  }

  if (statusCode === 413 || statusCode === 405 || statusCode === 400) {
    return { tipo: 'bug', motivo: reason ?? `http_${statusCode}` }
  }

  if (statusCode === 429) {
    const retryAfter = Number(headers?.['retry-after'])
    const esperarMs = Number.isFinite(retryAfter)
      ? retryAfter * 1000
      : backoffExponencial(intento)
    return { tipo: 'reintentar', esperarMs }
  }

  if (statusCode >= 500) {
    return { tipo: 'reintentar', esperarMs: backoffExponencial(intento) }
  }

  return { tipo: 'bug', motivo: `http_${statusCode}_no_clasificado` }
}
```

`web-push` resuelve o rechaza con un objeto que expone `statusCode`, `headers` y `body`. Es literal del README: *"you'll be able to access the following values on the returned object or error: statusCode, headers, body"*. `[CITED: github.com/web-push-libs/web-push README, consultado 2026-09-03]`

### Patrón 2: un payload, dos mecanismos

```ts
// lib/push/payload.ts
const LIMITE_BYTES = 3 * 1024 // Apple corta en 4 KB. Deja margen.

export function construirPayload(aseo: {
  id: string
  apartamento: string
  fecha: string
}) {
  const cuerpo = {
    // --- Declarative Web Push. Safari 18.4+ lo muestra solo si el SW falla.
    web_push: 8030,
    notification: {
      title: 'Nuevo aseo asignado',
      body: `${aseo.apartamento}, ${aseo.fecha}`,
      navigate: `${process.env.NEXT_PUBLIC_APP_URL}/aseos/${aseo.id}`,
      silent: false,
      lang: 'es-CO',
      dir: 'ltr',
    },
    // --- Lo que lee tu handler 'push'. Chrome usa esto.
    datos: { aseoId: aseo.id, url: `/aseos/${aseo.id}` },
  }

  const json = JSON.stringify(cuerpo)
  if (Buffer.byteLength(json, 'utf8') > LIMITE_BYTES) {
    throw new Error('payload_excede_limite')
  }
  return json
}
```

**Regla de seguridad, y se conecta con una restricción explícita del proyecto:** el código de acceso del apartamento vive en tabla aparte con RPC y auditoría, no como columna. **Nunca lo metas en el payload de push.** El payload va cifrado en tránsito, pero termina renderizado en la pantalla de bloqueo de un teléfono que puede estar sobre una mesa. Manda un ID; que el aseador abra la app y el código salga por el RPC auditado. Lo mismo para nombres de huéspedes.

### Patrón 3: el drenaje no toca lo que la Fase 4 lee

La restricción es dura: la Fase 4 consulta `notifications` para el panel de alertas. Si el drenaje muta o borra filas de esa tabla, rompes el panel y no te enteras hasta producción.

**Diseño recomendado.** Sujeto a `PENDIENTE DE ANCLAR 1`:

- El estado de entrega vive en una **tabla nueva**, `push_entregas`, no en columnas nuevas de `notifications`.
- `push_entregas` tiene `unique (notification_id, suscripcion_id)`. Esa unicidad **es** la idempotencia: si la misma corrida se ejecuta dos veces, o si `pg_cron` dispara dos veces por solapamiento, el segundo insert choca y no hay segundo envío. Es el mismo razonamiento que hace idempotente al sync de la Fase 3 con `unique (apartamento_id, uid)`.
- El reclamo de trabajo va por RPC con `for update skip locked`, que es lo que impide que dos corridas solapadas tomen la misma fila.
- `notifications` se queda **solo lectura** para esta fase, salvo, como mucho, una columna aditiva tipo `push_procesado_at` que el panel ignore. Si la agregas, el test de no regresión del panel de la Fase 4 tiene que correr igual.

El punto que decide entre este diseño y otro es una sola pregunta del `PENDIENTE DE ANCLAR 1`: **¿el panel de la Fase 4 filtra por una columna de estado en `notifications`?** Si la respuesta es no, el diseño de arriba entra tal cual. Si es sí, el drenaje no puede escribir esa columna y hay que decidir si `push_entregas` la refleja o si el panel pasa a leer un join.

### Patrón 4: por qué Postgres dispara pero no envía

`[VERIFIED: supabase.com/docs/guides/database/extensions/pg_net, consultado 2026-09-03]`, limitaciones textuales de `pg_net`:

- *"Can only make POST requests with JSON data. No other data formats are supported."*
- *"HTTP requests are not started until the transaction is committed."*
- Máximo 200 peticiones por segundo. Respuestas en `net._http_response`, tabla **unlogged**, con TTL de 6 horas.
- `timeout_milliseconds` por defecto 2000.

Un push cifrado es un cuerpo binario `aes128gcm`, no JSON. **`pg_net` no puede enviarlo.** Eso zanja la discusión de arquitectura sin necesidad de opinar: Postgres es el reloj, Node es el emisor.

Y de paso: `pg_net` es fire and forget. La respuesta que te importa no es la de `pg_net`, es la que el Route Handler obtiene de APNs. Nunca leas `net._http_response` para decidir nada de negocio. Sirve, a lo sumo, para el watchdog que ya existe.

### Antipatrones

- **Borrar la suscripción ante cualquier error.** Un `500` transitorio de APNs te deja sin canal. Solo `404` y `410`.
- **Salir del handler `push` sin mostrar notificación.** En iOS eso revoca la suscripción. Incluye la rama de catch.
- **`clients.openWindow()` a ciegas en `notificationclick`.** Abre una ventana nueva cada vez aunque la app ya esté abierta. Primero `clients.matchAll({ type: 'window', includeUncontrolled: true })` y `focus()` si hay una del mismo origen.
- **Usar el UUID de la notificación como `Topic`.** 36 caracteres, el límite son 32, y los guiones no están en base64url. Devuelve `BadWebPushTopic`.
- **`vapidDetails.subject` apuntando a `https://localhost`.** El README de `web-push` lo advierte explícito: *"Safari's push notification endpoint rejects the request with a `BadJwtToken` error"*. En local usa un `mailto:` real.
- **Meter `--turbopack` en el script de build o de dev.** El bug serwist#360 sigue siendo la razón por la que este proyecto está en webpack.
- **`disable: process.env.NODE_ENV === 'development'` en la config de Serwist sin pensarlo.** Es el default que recomienda medio internet y significa que no puedes probar push en local. Prefiere dejarlo activo y correr `next dev --experimental-https`, porque push exige contexto seguro.

---

## Don't Hand-Roll

| Problema | No construyas | Usa | Por qué |
|---|---|---|---|
| Cifrado del payload | ECDH P-256 + HKDF + AES-128-GCM a mano | `web-push` | Cuatro primitivas encadenadas. Un byte mal en el salt y APNs devuelve `BadWebPushRequest` sin decirte dónde. |
| Cabeceras VAPID | JWT ES256 firmado a mano | `web-push` (`getVapidHeaders`) | La firma ES256 en base64url no es la del `jsonwebtoken` estándar. Apple además valida `aud` contra el origen exacto del endpoint, que cambia por push service. |
| Generación de claves VAPID | `crypto.generateKeyPair` + encoding manual | `web-push generate-vapid-keys` | El encoding base64url sin padding de una clave EC comprimida es donde falla todo el mundo. |
| Precache de assets de Next | Un service worker escrito a mano | `@serwist/next` | Los hashes de build en `.next/static` cambian en cada deploy. |
| Cola de reintentos con backoff | Un `setTimeout` en el servidor | `pg_cron` + estado en Postgres | Vercel no garantiza que el proceso siga vivo. El estado tiene que estar en la base. |
| Deduplicación de envíos | Un `Set` en memoria | `unique (notification_id, suscripcion_id)` | La base es el único lugar donde dos instancias concurrentes se ven. |
| Detección de "está instalada" | Sniffing de user agent | `matchMedia('(display-mode: standalone)')` + `navigator.standalone` | El UA de una web app instalada en iOS es idéntico al de Safari. |

**Idea de fondo:** en esta fase casi todo lo que parece "un poquito de código" es en realidad criptografía o control de concurrencia. Las dos áreas donde el código propio pierde siempre.

---

## Common Pitfalls

### 1. El service worker falla y la suscripción muere sin ruido

**Qué pasa:** una excepción en el handler `push`, por ejemplo `event.data.json()` sobre un payload que no es JSON, deja el evento sin `showNotification`. iOS revoca la suscripción tras unos pocos fallos.
**Por qué:** el contrato `userVisibleOnly` es una promesa que la plataforma sí verifica.
**Cómo evitarlo:** `try/catch` dentro del handler con notificación genérica de respaldo, siempre dentro de `event.waitUntil`. Y payload declarativo para que iOS 18.4+ tenga red.
**Señal temprana:** un aseador cuya suscripción pasa de activa a `410` sin que él haya desinstalado nada.

### 2. Se borran todas las suscripciones por un error de configuración

**Qué pasa:** rotas la clave VAPID o metes mal la privada, APNs devuelve `403` a todo, y el drenaje interpreta "suscripción inválida" y poda las 8.
**Por qué:** tratar cualquier 4xx como suscripción muerta.
**Cómo evitarlo:** la tabla de decisión de arriba, más una guarda de colapso: si una corrida va a desactivar más de un umbral de suscripciones, aborta sin aplicar y alerta. Es el mismo mecanismo que ya existe en el motor de la Fase 3.
**Señal temprana:** un pico de desactivaciones en una sola corrida.

### 3. El aseador nunca instaló la PWA y nadie lo sabe

**Qué pasa:** el aseo se confirma, se encola la notificación, no hay suscripción para ese usuario, la fila se marca como enviada o se queda pendiente para siempre. El aseo se pierde. Es el fallo que la promesa central del producto dice que no puede ocurrir.
**Cómo evitarlo:** "sin suscripción activa" no es un no-op silencioso, es un **estado visible**. El panel del admin muestra por aseador si tiene push activo. Y confirmar un aseo cuyo responsable no tiene suscripción debería advertirlo en el momento de confirmar, no después.
**Señal temprana:** un aseador con `ultima_vez_visto_at` viejo o nulo.

### 4. Permiso quemado en el primer arranque

**Qué pasa:** un `useEffect` pide el permiso al cargar. El aseador toca "No permitir" porque no entendió. En iOS, eso es definitivo hasta reinstalar.
**Cómo evitarlo:** priming propio, permiso solo desde `onClick`, "Ahora no" que no dispara nada.
**Señal temprana:** `Notification.permission === 'denied'` en un dispositivo recién configurado.

### 5. El link llega por WhatsApp y no hay forma de instalar

**Qué pasa:** el navegador embebido de WhatsApp no permite "Añadir a inicio" de forma utilizable, y ahí ni siquiera hay soporte de push.
**Cómo evitarlo:** la primera línea de la pantalla de instalación debe ser "Abre esto en Safari", con el paso explicado.

### 6. `next dev` sin HTTPS y push que no funciona en local

**Qué pasa:** los service workers y la Push API exigen contexto seguro. `localhost` cuenta como seguro para service workers, pero la doc de Next recomienda explícitamente `next dev --experimental-https` para probar notificaciones.
**Cómo evitarlo:** `next dev --experimental-https`, y `vapidDetails.subject` con un `mailto:` real, nunca `https://localhost`.

### 7. Serwist pisa o no regenera el service worker

**Qué pasa:** `public/sw.js` es un artefacto generado. Si queda commiteado, un build viejo puede quedar servido, o el diff hace ruido en cada PR.
**Cómo evitarlo:** `.gitignore` con `public/sw*` y `public/swe-worker*`, `tsconfig` con `"exclude": ["public/sw.js"]`, y cabecera `Cache-Control: no-cache, no-store, must-revalidate` sobre `/sw.js` en `next.config`. Los tres pasos son de la documentación oficial.

### 8. Dos corridas del drenaje se solapan y duplican envíos

**Qué pasa:** la corrida N tarda más de un minuto, `pg_cron` dispara la N+1, las dos leen las mismas filas pendientes.
**Cómo evitarlo:** `for update skip locked` en el reclamo, más el `unique (notification_id, suscripcion_id)` como red final. Ninguna de las dos sola alcanza: el skip locked evita el trabajo duplicado, la unicidad evita el daño si el skip locked se te cae.

---

## Code Examples

### Manifest, con lo que iOS exige

```ts
// app/manifest.ts
// Fuente del patrón: nextjs.org/docs/app/guides/progressive-web-apps (lastUpdated 2026-07-30)
// El 'display' NO default es requisito de iOS: MDN BCD api/Notification.json y webkit.org/blog/13878
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'VivaGuest',
    short_name: 'VivaGuest',
    description: 'Aseos asignados, checklist y evidencia',
    start_url: '/',
    display: 'standalone', // obligatorio para push en iOS
    background_color: '#ffffff',
    theme_color: '#000000',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
```

Además, en el `layout.tsx` raíz, un `<link rel="apple-touch-icon" href="/apple-touch-icon.png" />` de 180x180. iOS 16.4+ ya lee los iconos del manifest, pero el `apple-touch-icon` sigue siendo el camino más predecible para el icono de la pantalla de inicio. `[ASSUMED]`

### El service worker: Serwist más los handlers de push

```ts
// app/sw.ts
// Base: serwist.pages.dev/docs/next/getting-started (consultado 2026-09-03)
// serwist.addEventListeners() NO registra el handler de 'push'. Ese lo pones tú.
import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { Serwist } from 'serwist'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}
declare const self: ServiceWorkerGlobalScope

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
})

serwist.addEventListeners()

// --- Push ---------------------------------------------------------------
// REGLA DURA: nunca salir de aquí sin mostrar algo.
// Apple: "If you don't [present the notification], Safari revokes the push
// notification permission for your site."
self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let titulo = 'VivaGuest'
      let opciones: NotificationOptions = { body: 'Tienes una novedad' }

      try {
        const datos = event.data?.json() as
          | { notification?: { title?: string; body?: string }; datos?: { url?: string } }
          | undefined

        if (datos?.notification?.title) titulo = datos.notification.title
        opciones = {
          body: datos?.notification?.body ?? opciones.body,
          icon: '/icon-192.png',
          badge: '/badge-72.png',
          data: { url: datos?.datos?.url ?? '/' },
          tag: 'aseo', // colapsa en el dispositivo
        }
      } catch {
        // payload ilegible. Igual mostramos: es preferible una notificación
        // genérica a perder la suscripción.
      }

      await self.registration.showNotification(titulo, opciones)
    })(),
  )
})

// --- Click --------------------------------------------------------------
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const destino = (event.notification.data as { url?: string } | undefined)?.url ?? '/'

  event.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      for (const v of ventanas) {
        if (new URL(v.url).origin === self.location.origin) {
          await v.focus()
          if ('navigate' in v) await (v as WindowClient).navigate(destino)
          return
        }
      }
      await self.clients.openWindow(destino)
    })(),
  )
})
```

### Configuración de Serwist

```js
// next.config.mjs
// Fuente: serwist.pages.dev/docs/next/getting-started (consultado 2026-09-03)
import withSerwistInit from '@serwist/next'

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  // No pongas disable en development si quieres probar push en local.
})

export default withSerwist({
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ]
  },
})
```

`tsconfig.json`: añadir `"types": ["@serwist/next/typings"]`, `"lib": ["webworker"]` y `"exclude": ["public/sw.js"]`.
`.gitignore`: `public/sw*` y `public/swe-worker*`.

### Suscripción en el cliente, con priming y sin quemar el permiso

```tsx
'use client'
// La regla de Apple, verbatim: "call the push subscription method immediately
// from the gesture's event handler code."
// developer.apple.com, doc de web push, consultado 2026-09-03

function base64UrlAUint8(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(b64)
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export function estadoDelDispositivo() {
  const instalada =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true

  // En una pestaña de Safari iOS, window.Notification es undefined.
  // Ese es el feature detect exacto, sin sniffing.
  const puedePedirPermiso = 'Notification' in window && 'PushManager' in window

  if (!instalada || !puedePedirPermiso) return 'necesita_instalar' as const
  if (Notification.permission === 'denied') return 'denegado_irreversible' as const
  if (Notification.permission === 'granted') return 'concedido' as const
  return 'puede_pedir' as const
}

// Solo desde el onClick del botón "Sí, activar" de tu pantalla de priming.
export async function activarPush(registrarEnServidor: (s: PushSubscriptionJSON) => Promise<void>) {
  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') return { ok: false, permiso }

  const registration = await navigator.serviceWorker.ready
  const sub = await registration.pushManager.subscribe({
    userVisibleOnly: true, // obligatorio, y iOS lo hace cumplir
    applicationServerKey: base64UrlAUint8(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
  })

  await registrarEnServidor(sub.toJSON())
  return { ok: true, permiso }
}
```

### Revalidación al arrancar, el sustituto de `pushsubscriptionchange`

```ts
// Necesario porque en iOS el evento pushsubscriptionchange NO existe.
// MDN BCD api/ServiceWorkerGlobalScope.json: safari_ios version_added = false
export async function revalidarSuscripcion(
  clavePublicaActual: string,
  sincronizar: (s: PushSubscriptionJSON | null) => Promise<void>,
) {
  if (!('serviceWorker' in navigator)) return
  const registration = await navigator.serviceWorker.ready
  const actual = await registration.pushManager.getSubscription()

  if (!actual) {
    await sincronizar(null) // el servidor marca "sin suscripción" y el admin lo ve
    return
  }

  const claveDeLaSuscripcion = actual.options?.applicationServerKey
  const desalineada =
    claveDeLaSuscripcion != null &&
    bytesABase64Url(claveDeLaSuscripcion) !== clavePublicaActual

  if (desalineada) {
    await actual.unsubscribe()
    // resuscribir NO necesita permiso nuevo si Notification.permission sigue en 'granted'
    const nueva = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlAUint8(clavePublicaActual),
    })
    await sincronizar(nueva.toJSON())
    return
  }

  await sincronizar(actual.toJSON()) // refresca ultima_vez_visto_at
}
```

### Envío, con las cabeceras que Apple documenta

```ts
// lib/push/enviar.ts
import webpush from 'web-push'

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,      // mailto: real. NUNCA https://localhost
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
)

export async function enviar(
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
  topic: string, // <= 32 chars, base64url. NO un uuid con guiones.
) {
  try {
    const r = await webpush.sendNotification(sub, payload, {
      TTL: 4 * 60 * 60,  // 4 h. Un aviso de aseo que llega tarde es ruido.
      urgency: 'high',
      topic,
      timeout: 10_000,
    })
    return { statusCode: r.statusCode, headers: r.headers, body: r.body }
  } catch (e) {
    const err = e as { statusCode?: number; headers?: Record<string, string>; body?: string }
    return { statusCode: err.statusCode ?? 0, headers: err.headers, body: err.body }
  }
}
```

---

## Las claves VAPID

### Generación

```bash
npx --no-install web-push generate-vapid-keys --json
```

Instala `web-push` primero como dependencia del proyecto y usa el binario local. **No uses `npx --yes`**, que descarga y ejecuta un paquete sin verificar.

Salida: `{"publicKey": "...", "privateKey": "..."}`, ambas base64url.

### Dónde vive cada cosa

| Secreto | Dónde | Por qué |
|---|---|---|
| Clave pública VAPID | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` en Vercel | Es pública por diseño. Va al bundle del cliente porque `pushManager.subscribe()` la necesita. |
| Clave privada VAPID | `VAPID_PRIVATE_KEY` en Vercel, server only | El firmante es `web-push`, que corre en el Route Handler de Next. **No** en Vault de Supabase: Postgres no la usa. |
| `VAPID_SUBJECT` | `mailto:` real en Vercel | Apple valida que sea URL o `mailto:`. |
| Secreto compartido del cron | **Vault de Supabase** | Es lo que `pg_cron` necesita para llamar a `/api/push/drain`, mismo patrón que el worker de sync de la Fase 3. |

La distinción importa y se confunde seguido: **Vault guarda el secreto que Postgres usa para llamarte. Vercel guarda el secreto que tú usas para firmar el push.** Meter la clave VAPID privada en Vault no la hace más segura, solo la pone donde nadie la lee.

### Qué pasa si rotan

`[CITED: developer.apple.com, doc de web push, consultado 2026-09-03]` El código de error `VapidPkHashMismatch` está definido como: *"The VAPID public key from the push subscription doesn't match the VAPID public key in the request."*

**Rotar la clave VAPID invalida todas las suscripciones existentes.** No hay migración, no hay periodo de gracia, no hay forma de re firmar una suscripción vieja con una clave nueva. La suscripción quedó ligada a la `applicationServerKey` con la que se creó.

**Recuperación:** cada aseador tiene que abrir la PWA para que la revalidación de arranque detecte la desalineación, haga `unsubscribe()` y `subscribe()` con la clave nueva. Con 8 aseadores eso puede tomar días, y durante esos días **no llegan notificaciones a quien no haya abierto la app**. Con un canal único y sin respaldo, eso es una interrupción del servicio.

**Consecuencias prácticas:**

1. Genera el par **una sola vez** y guárdalo fuera de Vercel también, en un gestor de secretos o donde el equipo lo pueda recuperar. Perder la privada equivale a rotarla.
2. Usa el **mismo par en todos los entornos** o asume que un aseador que probó en preview y luego usa producción va a tener que resuscribirse. Con 8 usuarios, lo simple es un solo par.
3. Si algún día toca rotar, el plan no es técnico, es operativo: avisar, y comprobar en el dashboard que las 8 suscripciones se renovaron antes de dar por buena la rotación.
4. La revalidación de arranque en el cliente **es** el mecanismo de recuperación de una rotación. No es una optimización.

`[ASSUMED]` Nota: resuscribirse con `subscribe()` usando una `applicationServerKey` distinta a la de la suscripción vigente lanza `InvalidStateError` en navegadores basados en Chromium. Por eso el `unsubscribe()` va primero en el código de arriba. No verifiqué el comportamiento exacto en Safari.

---

## Serwist y el service worker sobre esta base

El proyecto todavía no tiene PWA. Lo que hace falta, en orden:

1. `npm i @serwist/next@9.5.12` y `npm i -D serwist@9.5.12`. Versiones idénticas, obligatorio.
2. `next.config.mjs` envuelto con `withSerwistInit({ swSrc: 'app/sw.ts', swDest: 'public/sw.js' })`.
3. `tsconfig.json`: `"types": ["@serwist/next/typings"]`, `"lib": ["webworker"]`, `"exclude": ["public/sw.js"]`.
4. `.gitignore`: `public/sw*`, `public/swe-worker*`.
5. `app/sw.ts` con Serwist más los handlers `push` y `notificationclick`.
6. `app/manifest.ts` con `display: 'standalone'`.
7. Iconos: 192, 512, 512 maskable, `apple-touch-icon` 180x180, `badge` 72 monocromo.
8. Cabeceras de `/sw.js` en `next.config`.
9. Verificar que ni el script de `dev` ni el de `build` llevan `--turbopack`.

Sobre el registro: la guía de Serwist para webpack no muestra código de registro porque `@serwist/next` inyecta el registro automáticamente. La guía de Next.js, en cambio, muestra un `navigator.serviceWorker.register(...)` manual porque no usa Serwist. **Con Serwist, no dupliques el registro.** Si el planner mezcla las dos guías, terminas con dos service workers compitiendo por el scope `/`. `[VERIFIED: serwist.pages.dev/docs/next/getting-started y nextjs.org/docs/app/guides/progressive-web-apps, ambos consultados 2026-09-03]`

**Convivencia de `showNotification()` con la API `Notification` en iOS:** no hay conflicto, y la premisa de `CLAUDE.md` está desactualizada. `Notification.requestPermission()` y `Notification.permission` **sí funcionan** dentro de la web app instalada. Lo único prohibido es `new Notification(...)`, que lanza `ReferenceError`. Mostrar siempre por `self.registration.showNotification()` desde el SW, que es lo que hace el ejemplo de arriba y lo que BCD confirma soportado en iOS 16.4+.

**Nota sobre la versión de Next.js:** la guía oficial de PWA de Next.js está escrita para la 16.3.4 y menciona un hook experimental `useOffline`. **No existe en 15.5.24.** No lo planifiques.

---

## Validation Architecture

Formato: cada validación dice qué capa la prueba, con qué comando, y **qué señuelo la pondría en rojo**. Un señuelo que no pone la prueba en rojo significa que la prueba no prueba nada.

### Framework de pruebas

| Propiedad | Valor |
|---|---|
| Unit | `vitest@4.1.11` |
| RLS | `supabase test db` (pgTAP) |
| E2E | `@playwright/test@1.62.1`, **solo proyecto Chromium** |
| Manual | iPhone físico con iOS >= 16.4, ideal >= 18.4 |
| Comando rápido | `npx vitest run lib/push` |
| Suite completa | `npx vitest run && npx supabase test db && npx playwright test --project=chromium` |

> **PENDIENTE DE ANCLAR 6.** Abrir `.planning/config.json`.
> *Preguntas que contesta:* ¿`workflow.nyquist_validation` está en `false`? ¿`security_enforcement` está en `false`?
> *Qué cambia según la respuesta:* si `nyquist_validation` es `false`, esta sección entera sobra. Si `security_enforcement` es `false`, sobra `## Security Domain`. Mientras no se pueda leer, ambas se incluyen, que es el default cuando la clave está ausente y el lado seguro del error.

### Capa 1: unit sobre lógica pura, `vitest`

| # | Qué valida | Comando | Señuelo que lo pone en rojo |
|---|---|---|---|
| U1 | `decidir(410)` devuelve `desactivar_suscripcion` | `npx vitest run lib/push/errores` | Cambiar el 410 a `reintentar`. |
| U2 | `decidir(403, 'VapidPkHashMismatch')` devuelve `requiere_resuscripcion`, **no** `desactivar_suscripcion` | idem | Hacer que cualquier 4xx caiga en `desactivar_suscripcion`. Este es el señuelo más importante de la fase: es el que borra las 8 suscripciones. |
| U3 | `decidir(403, 'BadJwtToken')` devuelve `abortar_corrida` | idem | Degradarlo a `reintentar`: la corrida seguiría quemando intentos contra una config rota. |
| U4 | `decidir(500)` y `decidir(503)` devuelven `reintentar` con backoff creciente entre intentos | idem | Devolver un `esperarMs` constante. |
| U5 | `decidir(429)` respeta `Retry-After` de la cabecera si viene | idem | Ignorar la cabecera y usar siempre el backoff propio. |
| U6 | El payload pesa < 3 KB y **no contiene** el código de acceso ni nombres de huéspedes | `npx vitest run lib/push/payload` | Meter `codigo_acceso` en el objeto del payload. |
| U7 | El payload incluye `web_push: 8030` y `notification.title` no vacío y `notification.navigate` presente | idem | Quitar `web_push: 8030`: se pierde la red de seguridad de iOS 18.4+. |
| U8 | El `Topic` derivado tiene <= 32 caracteres y solo alfabeto base64url | idem | Pasar el UUID crudo con guiones, 36 chars. |
| U9 | El handler `push` del SW llama `showNotification` **también** cuando `event.data.json()` lanza | `npx vitest run lib/push/sw` con un doble de `ServiceWorkerGlobalScope` | Quitar el `try/catch`: en iOS eso revoca la suscripción. |
| U10 | La revalidación detecta `applicationServerKey` desalineada y hace `unsubscribe()` antes de `subscribe()` | `npx vitest run lib/push/revalidar` | Quitar el `unsubscribe()`: en Chromium lanza `InvalidStateError`. |

### Capa 2: RLS y base, `supabase test db` (pgTAP)

| # | Qué valida | Señuelo que lo pone en rojo |
|---|---|---|
| P1 | Un aseador solo ve y borra **sus** suscripciones; leer la de otro devuelve 0 filas | Policy con `using (true)`. |
| P2 | Un aseador desactivado pierde el acceso a la tabla de suscripciones de inmediato, sin esperar a que expire su token | Autorizar por claim del JWT en vez de por consulta a la tabla de aseadores. Es el mismo criterio de la Fase 2. |
| P3 | `unique (notification_id, suscripcion_id)` existe: el segundo insert del mismo par falla | Quitar el índice único: el test de doble inserción deja de fallar. |
| P4 | El reclamo con `for update skip locked` hace que dos sesiones concurrentes tomen conjuntos disjuntos | Quitar `skip locked`: la segunda sesión bloquea o toma las mismas filas. |
| P5 | **No regresión de la Fase 4:** la query exacta del panel de alertas devuelve el mismo resultado antes y después de una corrida de drenaje. Requiere `PENDIENTE DE ANCLAR 5` para saber cuál es esa query | Hacer que el drenaje ejecute `delete from notifications` o mute la columna que el panel filtra. Este es el señuelo que protege la costura entre fases. |
| P6 | El RPC de reclamo respeta el backoff: una fila con `proximo_intento_at` en el futuro no se reclama | Quitar el filtro de backoff: se reintenta en bucle contra un endpoint con 429. |

### Capa 3: integración del drenaje, `vitest` contra un push service falso

Levanta un servidor HTTP local que hace de push service y devuelve códigos a demanda, y apunta el `endpoint` de las suscripciones de prueba a él. **No uses `msw` aquí**: `web-push` usa `https.request` de Node directamente y el punto de la prueba es ejercitar esa ruta de verdad.

| # | Qué valida | Señuelo que lo pone en rojo |
|---|---|---|
| I1 | Un `410` desactiva esa suscripción y la notificación no se vuelve a intentar contra ella | Que el drenaje ignore el código y deje la suscripción activa: el siguiente ciclo reintenta para siempre. |
| I2 | Un `429` con `Retry-After: 60` deja la fila pendiente con `proximo_intento_at` a +60s y **no** desactiva nada | Desactivar la suscripción ante 429. |
| I3 | **Guarda de colapso:** con el falso devolviendo `410` a todo, si las desactivaciones superan el umbral, la corrida aborta y **las suscripciones siguen activas** | Subir el umbral al 100%: la corrida poda todo y el test pasa a rojo. |
| I4 | Un `403 BadJwtToken` aborta la corrida entera al primer fallo, sin tocar ninguna suscripción | Tratarlo como error por suscripción: se procesan las 8 y se marcan todas como fallidas. |
| I5 | Ejecutar el drenaje dos veces seguidas sobre la misma cola produce **un** envío por par notificación/suscripción | Quitar la unicidad o el claim: se duplica. |
| I6 | Un aseo confirmado cuyo responsable **no tiene** suscripción activa deja un estado explícito y visible, no un no-op silencioso | Marcar la notificación como enviada cuando no había a quién enviar. Este señuelo protege la promesa central del producto. |
| I7 | El endpoint `/api/push/drain` rechaza con 401 una petición sin el secreto compartido correcto | Comparar el secreto con `===` sobre el valor crudo en vez de sobre el hash, o quitar la guarda. |

### Capa 4: E2E, `@playwright/test`, **solo Chromium**

**El límite, con fuente:** la documentación de Playwright dice que los service workers *"are only supported on Chromium-based browsers"*. `[CITED: playwright.dev/docs/service-workers, consultado 2026-09-03]` **El proyecto WebKit de Playwright no puede ejecutar un service worker, así que no existe ninguna cobertura E2E automatizada de Safari ni de iOS. Cero.** No es una limitación que se pueda rodear con configuración.

Lo que sí se puede automatizar en Chromium:

| # | Qué valida | Cómo | Señuelo que lo pone en rojo |
|---|---|---|---|
| E1 | Con `context.grantPermissions(['notifications'])`, el botón de activar crea la suscripción y queda guardada en la base | `grantPermissions` en el contexto + assert contra la base | Quitar el `await` entre `requestPermission` y `subscribe`. |
| E2 | Un push real entregado al SW produce una notificación | CDP: `client.send('ServiceWorker.deliverPushMessage', { origin, registrationId, data })`, con `data` = el payload de producción. Assert espiando `self.registration.showNotification` desde dentro del SW. | Quitar el `event.waitUntil`: el SW puede morir antes de mostrar. |
| E3 | El handler muestra la notificación de respaldo cuando el payload no es JSON | mismo CDP con `data: 'no-soy-json'` | Quitar el `try/catch` del handler. |
| E4 | `notificationclick` enfoca la ventana existente en vez de abrir una nueva | simular el click sobre la notificación | Usar `clients.openWindow()` directo. |
| E5 | La app se registra como instalable: el manifest se sirve, tiene `display: standalone` e iconos 192 y 512 | fetch a `/manifest.webmanifest` y assert de forma | Cambiar `display` a `browser`: rompe push en iOS. |
| E6 | `/sw.js` se sirve con `Cache-Control: no-cache, no-store, must-revalidate` | assert sobre las cabeceras de la respuesta | Quitar la regla de `headers()` en `next.config`. |

`ServiceWorker.deliverPushMessage` con parámetros `origin` (string), `registrationId` (RegistrationID) y `data` (string) está en el Chrome DevTools Protocol vigente. `[VERIFIED: chromedevtools.github.io/devtools-protocol/tot/ServiceWorker/, consultado 2026-09-03]` Es la misma llamada que usa el panel "Push Messaging" de las DevTools. Accesible desde Playwright con `browserContext.newCDPSession(page)`, Chromium únicamente.

### Capa 5: procedimiento manual en iPhone físico

**Dónde termina lo automatizable.** Tres barreras independientes, cada una suficiente por sí sola:

1. Playwright no ejecuta service workers en WebKit. `[CITED: playwright.dev/docs/service-workers]`
2. El simulador de iOS no es fiable para esto. En el hilo 725619 de los foros de Apple hay reportes de `Notification.requestPermission()` devolviendo siempre `denied` en el simulador de 16.4, con un usuario confirmando que *"on a physical device and it works"*, y otro reportando que el simulador de iOS 17 lo arregló. Nadie de Apple respondió el hilo. Confianza MEDIA en el estado actual, y por eso mismo el simulador no sirve como evidencia.
3. La entrega real pasa por APNs contra un dispositivo real. No hay forma de emularla.

**No inventes una automatización de esto.** El procedimiento manual repetible es el artefacto de calidad. Se ejecuta antes de cerrar la fase y después de cualquier cambio en `app/sw.ts`, en el manifest o en la clave VAPID.

#### Procedimiento M1: instalación y concesión de permiso, camino feliz

Requisitos: iPhone físico, iOS >= 16.4 (anota la versión exacta), dispositivo sin la PWA instalada.

1. Abre Safari (**Safari**, no el navegador de WhatsApp) y ve a la URL de producción. *Observa:* la pantalla de instalación se muestra, con las capturas del botón Compartir.
2. Confirma que **no** aparece ningún diálogo del sistema pidiendo notificaciones. *Observa:* si aparece, el código está pidiendo permiso fuera de un gesto. Aborta y arregla.
3. Botón Compartir, "Añadir a inicio", "Añadir".
4. Cierra Safari por completo. Abre la app desde el icono de la pantalla de inicio. *Observa:* abre sin barra de direcciones de Safari, o sea `display-mode: standalone` está activo.
5. *Observa:* la pantalla de instalación ya no se muestra, y en su lugar sale la pantalla de priming con el botón de activar y un "Ahora no" visible.
6. Toca **"Ahora no"**. *Observa:* no aparece ningún diálogo del sistema. Este paso es la prueba de que el permiso no se puede quemar por accidente.
7. Vuelve a la pantalla de priming y toca **"Sí, activar"**. *Observa:* aparece el diálogo del sistema de iOS. Toca "Permitir".
8. *Observa:* en el dashboard del admin, ese aseador figura con suscripción activa y `ultima_vez_visto_at` de hace segundos.
9. Ajustes de iOS, Notificaciones. *Observa:* VivaGuest aparece en la lista.

#### Procedimiento M2: entrega de punta a punta

1. Desde el dashboard del admin, confirma un aseo asignado a ese aseador.
2. **Bloquea el iPhone y déjalo en la pantalla de bloqueo.**
3. *Observa:* la notificación llega en menos de un minuto (según el periodo del cron). Anota el tiempo real.
4. *Observa el contenido:* aparece el apartamento y la fecha. **No aparece el código de acceso, ni el nombre del huésped.** Si aparece alguno de los dos, es un fallo de seguridad, no cosmético.
5. Toca la notificación. *Observa:* la app abre directamente en el detalle de ese aseo, no en la portada.
6. Con la app **abierta en primer plano**, confirma un segundo aseo. *Observa:* qué hace iOS. Anótalo. Es un comportamiento que no está documentado de forma clara y que conviene medir en vez de suponer.
7. Con la app **cerrada del todo** (deslizada fuera del selector de apps), confirma un tercer aseo. *Observa:* la notificación llega igual. Este paso prueba que no dependes de que la app esté viva.

#### Procedimiento M3: modo avión y cola de la plataforma

1. Pon el iPhone en modo avión.
2. Confirma un aseo desde el admin.
3. *Observa:* el drenaje registra `201` de todos modos. APNs aceptó el mensaje y lo guarda.
4. Espera 2 minutos. Quita el modo avión.
5. *Observa:* la notificación llega al reconectar. Anota el retraso.
6. Repite con un TTL corto y un tiempo de desconexión mayor al TTL. *Observa:* la notificación **no** llega. Esto es lo esperado y hay que verlo una vez para calibrar el TTL de producción.

#### Procedimiento M4: denegación y recuperación

**Ejecuta esto en un dispositivo de pruebas, nunca en el de un aseador real.**

1. Instala la PWA en un iPhone limpio.
2. En la pantalla de priming, toca "Sí, activar" y luego **"No permitir"** en el diálogo de iOS.
3. Vuelve a tocar "Sí, activar". *Observa:* **no aparece ningún diálogo.** `Notification.permission` es `denied`. Anótalo.
4. *Observa:* la interfaz muestra el estado "denegado" con instrucciones de recuperación, no un botón que no hace nada.
5. Ajustes, Notificaciones. *Observa si VivaGuest aparece o no.* **Este es el dato que la documentación de Apple no cubre y que hay que medir.** Registra el resultado con la versión de iOS.
6. Si no aparece: mantén pulsado el icono, borra la app, vuelve a añadirla a la pantalla de inicio, ábrela. *Observa:* el diálogo vuelve a estar disponible. Confirma o refuta la hipótesis `[ASSUMED]` de este documento.

#### Procedimiento M5: revocación por push silencioso (destructivo, opcional)

Sirve para medir el número real de fallos tolerados, que ninguna documentación oficial da.

1. En un build de staging, comenta la llamada a `showNotification` del handler `push`.
2. Instala, concede permiso, y envía pushes de uno en uno.
3. *Observa:* cuántos pushes pasan antes de que `pushManager.getSubscription()` devuelva `null` o los envíos empiecen a dar `410`. Anota el número y la versión de iOS.
4. Reinstala el build bueno.

#### Procedimiento M6: matriz de dispositivos

Antes de cerrar la fase, ejecuta M1 y M2 en **cada modelo y versión de iOS que use un aseador real**, no en uno representativo. Son 8 personas. Registra en una tabla: aseador, modelo, versión de iOS, instalada sí/no, permiso concedido sí/no, notificación de prueba recibida sí/no, fecha. Esa tabla es el criterio de "la fase está lista", más que cualquier test verde.

### Gaps de Wave 0

- [ ] `lib/push/errores.ts` y su test. Sin esto no hay U1 a U5.
- [ ] `lib/push/payload.ts` y su test. Sin esto no hay U6 a U8.
- [ ] Push service falso local para la capa 3. Es infraestructura, va antes que I1 a I7.
- [ ] Proyecto `chromium` en `playwright.config.ts` con el helper de CDP. Depende de `PENDIENTE DE ANCLAR 7`.
- [ ] Fixture pgTAP que congele la query exacta del panel de la Fase 4, para P5. Depende de `PENDIENTE DE ANCLAR 5`. **Es el test que protege la costura entre fases: no lo dejes para el final.**
- [ ] Tabla de la matriz de dispositivos M6, en el ROADMAP o donde el equipo la vea.

---

## Environment Availability

No pude ejecutar sondas contra el proyecto. Esta tabla es lo que **hay que verificar**, no lo que verifiqué.

| Dependencia | Requerida por | Disponible | Fallback |
|---|---|---|---|
| `pg_cron` | disparo del drenaje | Sí según el brief, la Fase 3 ya lo usa | Vercel Cron si el plan es Pro |
| `pg_net` | llamada HTTP desde Postgres | Sí según el brief | idem |
| Vault de Supabase | secreto compartido del cron | Sí según el brief | env var de Vercel más una guarda distinta |
| `@playwright/test` | E2E | `PENDIENTE DE ANCLAR 7`: leer `package.json`. `CLAUDE.md` lo lista en el stack, pero listado no es instalado | correr solo unit e integración |
| iPhone físico con iOS >= 16.4 | **toda la validación de iOS** | **Sin verificar, y es el único bloqueante real** | **ninguno** |
| Certificado HTTPS en local | probar push en dev | `next dev --experimental-https` lo genera | probar solo contra preview de Vercel |
| Dominio de producción con HTTPS | instalación de la PWA | Sí, Vercel | ninguno |

**Bloqueante sin fallback:** el iPhone físico. Si el equipo no tiene uno con la versión de iOS que usan los aseadores, esta fase **no se puede validar**, solo se puede escribir. Eso hay que resolverlo antes de ejecutar, no durante.

---

## Security Domain

| Categoría ASVS | Aplica | Control |
|---|---|---|
| V2 Autenticación | sí | El endpoint `/api/push/drain` se protege con el secreto compartido comparado sobre su sha256 en tiempo constante, mismo patrón que el worker de la Fase 3. |
| V3 Sesiones | sí | Registrar una suscripción exige sesión válida verificada con `getUser()`, no con `getClaims()`, por el criterio de revocación inmediata del proyecto. |
| V4 Control de acceso | sí | RLS: un aseador solo escribe y borra suscripciones cuyo `usuario_id` sea el suyo. Un aseador desactivado no puede registrar ni recibir. |
| V5 Validación de entrada | sí | `zod` sobre el `PushSubscription` que llega del cliente: `endpoint` debe ser una URL https de un host de push conocido, `keys.p256dh` y `keys.auth` con longitud y alfabeto base64url correctos. Sin esto, un cliente puede registrar un `endpoint` arbitrario y convertir tu servidor en un emisor de peticiones a donde quiera (SSRF). |
| V6 Criptografía | sí | Todo delegado a `web-push`. Cero cripto propia. Clave privada VAPID solo en variable de entorno server side. |
| V7 Manejo de errores y logs | sí | El log del drenaje no puede incluir el `endpoint` completo ni las `keys`: son credenciales de envío. Loguea un hash corto. |

**Amenaza específica que no es obvia:** el `endpoint` de una suscripción es una URL que tu servidor va a visitar con `POST`. Si no validas el host, cualquiera con sesión de aseador puede registrar una suscripción con `endpoint` apuntando a un servicio interno y usar tu Route Handler como proxy. Valida contra una lista de hosts conocidos: `*.push.apple.com`, `fcm.googleapis.com`, `*.push.services.mozilla.com`, `*.notify.windows.com`. STRIDE: Elevation of Privilege / Information Disclosure.

---

## State of the Art

| Enfoque viejo | Enfoque actual | Cuándo cambió | Impacto |
|---|---|---|---|
| Web push imposible en iOS | Push API en web apps de pantalla de inicio | iOS 16.4, marzo 2023 | Habilita esta fase entera. |
| Notificación solo vía service worker | Declarative Web Push, el sistema muestra el respaldo | Safari 18.4 / iOS 18.4, marzo 2025 | Elimina el modo de fallo "el SW falló y perdí la suscripción" en dispositivos modernos. |
| `Notification` API no disponible en iOS | `Notification.requestPermission()` y `.permission` sí funcionan dentro de la web app instalada, solo el constructor lanza | iOS 16.4 | Corrige la premisa de `CLAUDE.md` y da un feature detect limpio. |
| Safari Push Notifications (propietario, macOS) | Web Push estándar | eliminado en Safari 26.4 | Irrelevante aquí, pero invalida tutoriales viejos de macOS. |
| `next-pwa` | `@serwist/next` | `next-pwa` sin release desde 2022-08 | Ya decidido en el proyecto. |
| `pushsubscriptionchange` como mecanismo de auto reparación | Revalidación en cada arranque desde el cliente | nunca llegó a iOS; en Chrome solo desde la 138 | Es la razón de que el código de revalidación exista. |

**Obsoleto o inaplicable:**

- `beforeinstallprompt`: la propia documentación de Next.js recomienda no usarlo.
- El hook `useOffline` de Next.js: solo en Next 16, este proyecto está en 15.5.24.
- Cualquier tutorial de push en iOS anterior a marzo de 2023.
- La afirmación de `CLAUDE.md` sobre la API `Notification` en iOS: corregida arriba con BCD.

---

## Assumptions Log

Aquí **no** hay huecos del repositorio: esos están en el índice de puntos ciegos, con nombre de archivo y pregunta. Lo que sigue son afirmaciones sobre el comportamiento de la plataforma que no pude confirmar contra documentación oficial, separadas de lo que sí está medido.

| # | Afirmación | Sección | Riesgo si es falsa |
|---|---|---|---|
| A3 | Denegar el permiso en iOS obliga a borrar y re añadir la web app | Los hechos duros de iOS | ALTO para el diseño de interfaz. Corroborado por fuentes secundarias, **ausente de la documentación de Apple**. El procedimiento M4 lo mide. |
| A4 | iOS revoca la suscripción tras aproximadamente 3 pushes sin notificación | idem | BAJO. El número no cambia el diseño, que tolera cero. |
| A5 | `PushSubscription.expirationTime` viene `null` en la práctica | idem | BAJO. Solo significa no construir lógica sobre ese campo. |
| A6 | Resuscribir con otra `applicationServerKey` sin `unsubscribe()` previo lanza `InvalidStateError` | Claves VAPID | BAJO. El código hace `unsubscribe()` primero de todas formas. |
| A7 | `apple-touch-icon` sigue siendo más fiable que los iconos del manifest para el icono de inicio en iOS | Code Examples | MUY BAJO. Añadirlo cuesta un archivo. |
| A8 | Los aseadores usan iPhone. La distribución real de dispositivos es desconocida | transversal | ALTO. Si todos usan Android, la mitad de este documento deja de ser crítica. Si alguno tiene iOS < 16.4, **para ese aseador no hay push posible con ninguna implementación**. Esto **no** se cierra leyendo el repo: se cierra preguntándole a la operación. |
| A9 | Los tres paquetes recomendados son legítimos | Package Legitimacy Audit | BAJO. `slopcheck` no corrió; la verificación manual (edad, descargas, repo, sin postinstall) es consistente. |

---

## Open Questions

Los siete puntos ciegos por bloqueo de lectura **no** están aquí: están en el índice de puntos ciegos del principio, cada uno con su archivo y su pregunta. Se cierran leyendo. Lo que sigue son preguntas que **no** se cierran leyendo el repo.

1. **¿Qué dispositivos y versiones de iOS usan los 8 aseadores?**
   - Qué sé: el canal es único y sin respaldo.
   - Qué no sé: la distribución.
   - Riesgo: **ALTO.** Un iPhone con iOS < 16.4 no puede recibir push por ninguna vía. Si aparece uno, hay que decidir si se actualiza el teléfono, se cambia, o ese aseador queda fuera del sistema. Es una decisión de negocio, no de ingeniería, y hay que tomarla **antes** de construir.
   - Recomendación: inventario de dispositivos como tarea de la fase, no como supuesto.

2. **¿Hay un iPhone físico disponible para pruebas?**
   - Riesgo: **ALTO y bloqueante.** Sin él, la fase se puede escribir pero no validar.

3. **¿Denegar el permiso deja la web app visible en Ajustes, Notificaciones?**
   - Qué sé: Apple documenta la gestión solo para el caso "once allowed". Fuentes secundarias coinciden en que hay que reinstalar.
   - Qué no sé: si cambió en iOS 17, 18 o 26. No encontré documentación de Apple que lo cubra.
   - Recomendación: medirlo con el procedimiento M4 en la primera sesión con hardware, y ajustar la interfaz de recuperación al resultado. Hasta entonces, la interfaz asume el peor caso.

4. **¿Cuántos pushes sin notificación tolera iOS antes de revocar?**
   - Riesgo: BAJO. El diseño tolera cero.

5. **¿Qué periodo de `pg_cron` es aceptable?**
   - Compensación: cada minuto da latencia baja y ~1440 invocaciones diarias de un Route Handler. Cada 5 minutos abarata pero un aseo confirmado puede tardar 5 minutos en avisarse.
   - Recomendación: 1 minuto, y evaluar añadir un disparo inmediato por trigger al confirmar el aseo, como aceleración encima del cron, nunca como reemplazo.

6. **¿Se manda una notificación por cada evento de la cola o se agrupan?**
   - Qué sé: la cabecera `Topic` (<= 32 chars) permite colapsar en el push service, y el campo `tag` colapsa en el dispositivo.
   - Qué no sé: qué tipos de evento escribe la Fase 3 en `notifications`. Si escribe varios por aseo, el aseador puede recibir una ráfaga.
   - Recomendación: decidir la política de colapso tras leer el schema.

7. **¿Apple envía `Retry-After` en sus respuestas 429?**
   - Qué sé: documenta el código 429 y el `reason` `TooManyRequests`, pero no menciona la cabecera.
   - Recomendación: el código ya la lee si viene y cae a backoff exponencial si no. Sin riesgo.

8. **¿Cuál es el umbral correcto de la guarda de colapso?**
   - Qué sé: con 8 aseadores y quizá 1 o 2 suscripciones cada uno, el universo son ~10 a 16 filas. Un umbral porcentual sobre números tan pequeños es ruidoso: desactivar 2 de 10 es un 20% y puede ser perfectamente legítimo.
   - Recomendación: umbral absoluto, no porcentual. Algo como "más de 3 desactivaciones en una corrida aborta y alerta". Calibrarlo tras la primera semana de piloto.

---

## Sources

### Primarias, confianza ALTA

- **caniuse `features-json/push-api.json`**, rama `main`, descargado y parseado el 2026-09-03. Mapa completo de `ios_saf` y notas numeradas.
- **caniuse `features-json/notifications.json`** y **`serviceworkers.json`**, misma fecha y método.
- **MDN browser-compat-data**, rama `main`, descargado y parseado el 2026-09-03: `api/ServiceWorkerGlobalScope.json` (`pushsubscriptionchange` = `false` en `safari_ios`), `api/Notification.json`, `api/PushManager.json`, `api/PushSubscription.json`, `api/Window.json` (`pushManager` en 18.4), `api/PushEvent.json`.
- **developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers**, consultado 2026-09-03. Tabla completa de códigos HTTP y de `reason`, requisitos de VAPID JWT, límite de 4 KB, cabeceras `TTL`, `Topic`, `Urgency`, la frase sobre revocación por push invisible.
- **webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/**, publicado 2023-02-16, consultado 2026-09-03. Requisito de pantalla de inicio, `display` standalone o fullscreen, gesto de usuario, gestión posterior en Ajustes.
- **webkit.org/blog/12945/meet-web-push/**, publicado 2022-06-07, consultado 2026-09-03. `userVisibleOnly` y revocación por incumplimiento.
- **webkit.org/blog/16535/meet-declarative-web-push/**, publicado 2025-03-27, consultado 2026-09-03. Formato `web_push: 8030`, interacción con el service worker, versiones.
- **serwist.pages.dev/docs/next/getting-started** y **/docs/next/configuring**, consultados 2026-09-03. Instalación, `next.config`, `tsconfig`, `.gitignore`, `app/sw.ts`, nota de que la guía es para webpack.
- **nextjs.org/docs/app/guides/progressive-web-apps**, `lastUpdated: 2026-07-30`, consultado 2026-09-03. Manifest, Server Actions, cabeceras de `/sw.js`, recomendación explícita contra `beforeinstallprompt`, `next dev --experimental-https`.
- **supabase.com/docs/guides/database/extensions/pg_net**, consultado 2026-09-03. Firmas de `net.http_post`, limitación de solo JSON, disparo al commit, 200 req/s, `net._http_response` unlogged.
- **github.com/web-push-libs/web-push README**, rama `master`, consultado 2026-09-03. Opciones de `sendNotification`, `statusCode`/`headers`/`body` en la respuesta y en el error, nota sobre `https://localhost` y `BadJwtToken`.
- **chromedevtools.github.io/devtools-protocol/tot/ServiceWorker/**, consultado 2026-09-03. `deliverPushMessage(origin, registrationId, data)`.
- **playwright.dev/docs/service-workers** y **/docs/emulation**, consultados 2026-09-03. Service workers solo en Chromium, `grantPermissions(['notifications'])`.
- **npm registry**, consultado 2026-09-03: versiones, fechas, repos, ausencia de `postinstall`. **api.npmjs.org/downloads**, mismo día: volúmenes semanales.

### Secundarias, confianza MEDIA

- **documentation.onesignal.com/docs/en/web-push-for-ios**, consultado 2026-09-03. *"If permission is denied, the home screen app must be removed and re-added for the permission prompt to appear again."* Sin fecha de última actualización visible.
- **developer.apple.com/forums/thread/725619**, hilo de 2023. `requestPermission()` devolviendo `denied` en el simulador de iOS 16.4, funcionando en dispositivo físico, aparentemente arreglado en el simulador de iOS 17. Sin respuesta de ingeniería de Apple.
- Fuentes de industria sobre priming de permisos (Batch, CleverTap, OneSignal). Coinciden en el patrón. Las cifras de mejora de opt-in que citan **no** son aplicables a una operación de 8 empleados y no las uso para nada.

### Terciarias, sin verificar

- El número "3 pushes sin notificación antes de revocar", visto solo en resúmenes de búsqueda y no localizado en documentación de Apple ni de WebKit. Marcado A4.

---

## Metadata

**Desglose de confianza:**

- Comportamiento de la plataforma iOS: **ALTA.** Datos crudos de caniuse y MDN BCD parseados directamente, más documentación de Apple y WebKit. Es la parte que justificaba investigar antes de planear y quedó cerrada.
- Manejo de errores de push: **ALTA.** Tabla completa de Apple, más la semántica de `web-push` desde su README.
- Stack y versiones: **ALTA** para las versiones, **MEDIA** para la legitimidad de paquetes porque `slopcheck` no corrió.
- Setup de Serwist: **ALTA** contra la documentación oficial, **MEDIA** en cómo aterriza sobre este repo, que no pude ver.
- Diseño del drenaje: **MEDIA.** El razonamiento arquitectónico es sólido y está apoyado en las limitaciones documentadas de `pg_net`, pero las formas de tabla son supuestos.
- Mapeo a requisitos y criterios de éxito del ROADMAP: **no producido.** Está acotado en `PENDIENTE DE ANCLAR 3` y `4`, con el archivo y la pregunta exacta. No hay nada escrito a ciegas sobre esos dos puntos.

**Fecha de investigación:** 2026-09-03
**Válido hasta:** 2026-10-03 para el stack. La parte de iOS es estable desde 2023 y solo cambia con una versión mayor de iOS; conviene revisar `caniuse push-api.json` cuando salga iOS 27.
