---
phase: 02-acceso-y-administraci-n-del-cat-logo
plan: 06
subsystem: auth
tags: [supabase, ssr, middleware, cookies, rls, login, server-actions, playwright, cdn-cache]

# Dependency graph
requires:
  - phase: 02-01
    provides: "Login por email encendido en GoTrue con el auto-registro cerrado, lib/env.ts, guardarrailes de arquitectura"
  - phase: 02-02
    provides: "resolverRedireccion() y RAIZ: la tabla de ruteo pura que el middleware cablea"
  - phase: 02-03
    provides: "mapAuthError(), con la correccion medida sobre user_banned"
  - phase: 02-04
    provides: "Harness E2E: usuarios semilla deterministas, fixtures de sesion por rol, webServer de produccion"
  - phase: 02-05
    provides: "Base visual: 23 bloques de Base UI, capa de tokens, Poppins como tipografia de marca"
provides:
  - "Los cuatro clientes de Supabase, ninguna fabrica a nivel de modulo"
  - "actualizarSesion() con el setAll de DOS argumentos aplicando las cabeceras anti-cache"
  - "middleware.ts: refresco de sesion con getUser() y ruteo por app_metadata.role"
  - "exigirSesion() y exigirAdmin() como defensa en profundidad para las Server Actions"
  - "ResultadoAccion: el contrato de retorno de todas las actions de la fase"
  - "/login funcional con el copy literal del contrato"
  - "/mis-aseos como destino de aterrizaje del aseador (PLAT-07)"
  - "cerrarSesion() como Server Action compartida por los dos shells"
  - "Criterio 1 del ROADMAP demostrado en navegador, incluida la persistencia entre recargas"
affects: [02-07, 02-08, 02-09, 02-10, 02-11, 02-12, 02-13, 02-14, 02-15]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Una fabrica de cliente por contexto, siempre como funcion y NUNCA como constante de modulo"
    - "Toda Server Action arranca con exigirSesion() o exigirAdmin(), porque es un endpoint HTTP publico"
    - "Toda Server Action devuelve ResultadoAccion; con `campo` va inline, sin `campo` va a toast"
    - "El rol para rutear sale siempre de app_metadata.role, jamas de user_metadata.role"
    - "Los tests de seguridad se validan con senuelo en los dos sentidos antes de darlos por buenos"
    - "Un valor de medida (ancho, alto) se declara como token en globals.css antes que como valor arbitrario"

key-files:
  created:
    - lib/supabase/browser.ts
    - lib/supabase/server.ts
    - lib/supabase/middleware.ts
    - lib/supabase/middleware.test.ts
    - middleware.ts
    - lib/auth/guards.ts
    - lib/auth/guards.test.ts
    - lib/domain/acciones.ts
    - app/(public)/login/page.tsx
    - app/(public)/login/_actions.ts
    - app/(public)/login/_components/FormularioLogin.tsx
    - app/(cleaner)/layout.tsx
    - app/(cleaner)/mis-aseos/page.tsx
    - app/_actions/sesion.ts
    - e2e/login.spec.ts
    - e2e/ruteo.spec.ts
  modified:
    - vitest.config.ts
    - app/globals.css
    - e2e/fixtures.ts

key-decisions:
  - "La asercion anti-cache en E2E era un FALSO VERDE: pasaba con el setAll roto, porque Next ya marca no-store en rutas dinamicas. Se movio a un test unitario que si se pone rojo con el senuelo"
  - "El login redirige a la raiz DEL ROL y no a '/', porque se midio que el redirect de una Server Action deja la URL parada en '/': el fetch RSC sigue el 307 del middleware de forma transparente"
  - "Ese redirect usa RAIZ de lib/auth/routing.ts, asi que NO hay una segunda tabla de ruteo: la fuente de verdad sigue siendo una"
  - "Se copian tambien las cabeceras anti-cache a la respuesta de redireccion, no solo las cookies: un 307 con Set-Cookie de sesion es igual de cacheable que un 200"
  - "vitest.config.ts recibe los alias @/ y server-only que ya tenia la config de integracion"
  - "e2e/fixtures.ts pasa a selectores exactos: el aria-label del toggle de contrasena rompia el getByLabel por regex con strict mode"
  - "--container-login y --container-aseador como tokens, para no escribir max-w-[400px]"
  - "El boton de login no lleva min-width: al ser de ancho completo no puede saltar, y un min-w-[…] seria el valor arbitrario que UI-SPEC §2 prohibe"

patterns-established:
  - "Senuelo de seguridad: romper la invariante a proposito y exigir que el test se ponga rojo ANTES de creerle al verde"
  - "Un comentario nunca cita literalmente el token que una verificacion grepea (cuarta vez que muerde en el proyecto)"

requirements-completed: [PLAT-01, PLAT-02, PLAT-07]

# Metrics
duration: 27min
completed: 2026-09-01
---

# Fase 02 Plan 06: Clientes de Supabase, middleware de sesión y pantalla de login

**El proyecto pasa de no tener autenticación a tener el criterio 1 del ROADMAP demostrado en un navegador real: cada rol entra y aterriza en su propia superficie, la sesión sobrevive a las recargas, y las dos trampas caras de la fase (el `setAll` de un argumento y `getUser()` frente a las alternativas locales) quedan cerradas y protegidas por tests que se verificaron rompiéndolos a propósito.**

## Performance

- **Duración:** 27 min
- **Iniciado:** 2026-09-01T16:09:35Z
- **Completado:** 2026-09-01T16:36:16Z
- **Tareas:** 3 de 3, todas autónomas
- **Commits:** 4
- **Archivos creados/modificados:** 20 (+1276 líneas)

## Task Commits

1. **Tarea 1: Los cuatro clientes, el middleware y el guard** — `91e0121` (RED), `44a320a` (GREEN)
2. **Tarea 2: Pantalla de login** — `df3e20e`
3. **Tarea 3: Stub del aseador, cierre de sesión y los specs del criterio 1** — `814e0cd`

---

## El hallazgo que importa: la prueba anti-caché era un falso verde

El plan lo advirtió con estas palabras: *"Si este test es verde por accidente, el agujero de caché de CDN sigue abierto y con dos usuarios en desarrollo nadie lo va a notar."* Pasó exactamente eso, y se detectó porque **no se dio por bueno el verde sin comprobarlo**.

La primera versión de la comprobación era un test de Playwright: entrar, recargar, capturar la respuesta del documento y afirmar que su `Cache-Control` traía `no-store`. Pasaba en verde.

Después se rompió `lib/supabase/middleware.ts` a propósito, dejando `setAll` en la firma de **un** argumento (la del ejemplo oficial de Supabase) y quitando la aplicación de cabeceras. Resultado medido:

| Comprobación con el señuelo puesto | Resultado |
|---|---|
| `npx tsc --noEmit` | **limpio** — ni un error, ni un warning |
| `e2e/login.spec.ts` (6 tests, incluida la asercion anti-caché) | **6 passed** |

O sea: el agujero abierto, el compilador callado y la suite en verde. La causa es que **Next ya marca `no-store` por su cuenta en cualquier ruta dinámica**, así que la aserción medía el default del framework y no el trabajo del middleware. Un test así es peor que no tener test: da confianza falsa sobre la fuga de sesión más cara de la fase.

**Dónde quedó la invariante:** en `lib/supabase/middleware.test.ts`, que invoca `setAll` con sus dos argumentos igual que lo hace `@supabase/ssr` y comprueba que las tres cabeceras acaban en el response. Verificado en los dos sentidos:

| Estado de `setAll` | `tsc` | `middleware.test.ts` |
|---|---|---|
| Dos argumentos (correcto) | limpio | **4 passed** |
| Un argumento (señuelo) | **limpio** | **1 failed** — `expected null to be 'private, no-cache, no-store…'` |

El test de E2E se eliminó y en su sitio quedó escrito por qué, para que nadie lo "recupere".

---

## El segundo hallazgo: `redirect('/')` desde una Server Action deja la URL parada

El plan pedía que el login hiciera `redirect('/')` y que el middleware eligiera la raíz según el rol, con el argumento —correcto— de que la pantalla de login no debe decidir a dónde va nadie. Se implementó así y **los cuatro tests de login fallaron**, mientras los nueve de ruteo pasaban.

El síntoma medido: tras el login, la URL se quedaba en `http://127.0.0.1:3000/` y no avanzaba ni a `/mis-aseos` ni a `/login`.

La causa: un `redirect` de Server Action no provoca una navegación normal, sino un fetch RSC del router de Next. El middleware responde con un 307 hacia la raíz del rol y **`fetch` sigue ese redirect de forma transparente**: el router pinta el árbol del destino, pero la barra de direcciones se queda en `/`. Confirmado con curl, que muestra que el middleware devuelve un 307 crudo con `location`, sin el `x-nextjs-redirect` que el router necesita para reescribir la URL.

Es un síntoma cruel: el usuario ve la pantalla correcta con la URL equivocada, y solo se nota al recargar.

**Arreglo:** el login redirige a `RAIZ[rol]`. **No reintroduce una segunda tabla de ruteo**, que era la preocupación legítima del plan: `RAIZ` es la misma constante exportada por `lib/auth/routing.ts` que consume `resolverRedireccion()`. La fuente de verdad sigue siendo una sola y el middleware sigue siendo la autoridad — si el destino no le cuadrara al rol, rebotaría en la petición siguiente. El rol se lee de `app_metadata`, igual que en el middleware.

---

## Las cuatro trampas del plan, una por una

| Trampa | Cómo quedó | Cómo se comprobó |
|---|---|---|
| `setAll` de dos argumentos | Implementado, con las tres cabeceras aplicadas al `supabaseResponse` | Grep + test unitario **verificado con señuelo**. La firma se leyó del `.d.ts` de `@supabase/ssr@0.12.5` instalado, no de la doc |
| `getUser()` y no las alternativas locales | `getUser()` en middleware y en los dos guards, con la medición del ban escrita en el comentario | Grep que excluye comentarios: cero llamadas a las alternativas en código de auth |
| Rol de `app_metadata` | Middleware, guards y la action de login leen `app_metadata.role` | Test unitario del caso exacto de escalada: `user_metadata.role='admin'` + `app_metadata.role='aseador'` ⇒ `NoAutorizado` |
| Devolver el `supabaseResponse` tal cual | Se devuelve sin reconstruir; en la rama de redirección se copian cookies **y** cabeceras | `page.reload()` en E2E, dos veces seguidas |

Y el matcher excluye estáticos, `api/cron`, `sw.js` y `manifest.webmanifest`, estos tres ya para las Fases 3, 5 y 6.

**Revisión manual que ningún grep cubre**, la que pedía el plan: entre `createServerClient(...)` y `await supabase.auth.getUser()` no hay ninguna sentencia. Verificado filtrando comentarios y líneas en blanco del rango: solo quedan el paréntesis de cierre de la fábrica y la propia llamada.

---

## La decisión de copy que este plan implementa y no reabre

El copy `Tu cuenta está desactivada. Contacta al administrador.` se queda **tal cual**. Lo que estaba mal era la justificación, no el texto: `02-UI-SPEC.md` §12.1 dice que GoTrue emite `user_banned` *después* de validar la contraseña y que por eso "no enumera nada". Es falso y está medido: lo emite **antes**, así que el mensaje sí es un oráculo de cuentas desactivadas.

La razón correcta ya vivía en el comentario de `mapAuthError` desde el plan 02-03 y no se tocó. El riesgo se acepta (T-02-25) porque es una herramienta interna de ~10 cuentas, sin registro público, con rate limit de 30 intentos por 5 minutos por IP, y porque un aseador dado de baja tiene derecho a entender por qué no entra en vez de creer que olvidó la contraseña.

Los dos mensajes de credenciales sí están protegidos por test: contraseña mala y email inexistente producen **el mismo texto**, y hay un test por cada caso afirmando literalmente la misma cadena. Si alguien "mejora" el copy para decir que el email no existe, se cae.

---

## El probe de Playwright quedó desbloqueado, y el `webServer` NO se tocó

El plan 02-04 dejó una nota dirigida a quien construyera `/login`: el `webServer` espera por **puerto** y no por `url` porque la sonda HTTP sigue redirects y exige status < 400, y `/` → `/login` daba 404.

`/login` ya existe, y aun así **`playwright.config.ts` no se modificó**. La nota es explícita en que acoplar el arranque del servidor a una ruta concreta reintroduce el mismo fallo la próxima vez que alguien mueva la pantalla de entrada. Con `port` la señal de "listo" es independiente de qué rutas existan, que es la propiedad que se quiere conservar.

---

## Verificación

| Comprobación | Resultado |
|---|---|
| `npm run test:unit` | 9 archivos, **150 tests** verdes (eran 138 antes del plan) |
| `npm run test:integration` | 1 archivo, **5 tests** verdes |
| `npx tsc --noEmit` | limpio |
| `npm run ci:arch` | OK, 6 guardarrailes |
| `npm run build` | OK — emite `/login` (estática) y `/mis-aseos` (dinámica), más el Middleware |
| `npx playwright test` | **17 tests** verdes |
| Señuelo `setAll` de un argumento | **rojo** en `middleware.test.ts`, verde al restaurar |
| Señuelo `setAll`: ¿lo atrapa `tsc`? | **NO** — compila limpio, como advertía el research |
| Grep `setAll(cookiesToSet, headers)` | presente |
| Grep de las alternativas a `getUser()` fuera de comentarios | cero |
| Grep `app_metadata` en `middleware.ts` | presente |
| Grep de fábrica a nivel de módulo en `lib/supabase/*.ts` | ninguna |
| Utilidades de token emitidas en el CSS | `max-w-login`, `font-brand`, `text-display`, `bg-canvas`, `mb-2xl`, `text-micro`, `gap-lg` — las 7 resuelven a `var(--…)` |
| PWA en `app/(cleaner)/` | ninguna pieza; las únicas menciones son los comentarios que lo prohíben |

### Las verdades del plan, comprobadas una a una

| Verdad declarada | Resultado |
|---|---|
| El admin entra y aterriza en `/apartamentos` | verde |
| El aseador entra y aterriza en `/mis-aseos` | verde, con aserción de contenido además de URL |
| La sesión sobrevive a una recarga | verde, **con dos recargas seguidas** |
| Un aseador en `/apartamentos` rebota a `/mis-aseos` | verde |
| Sin sesión, cualquier ruta protegida manda a `/login` | verde, 3 casos |
| La respuesta con cookie de sesión no es cacheable | verde en el test unitario, **el de E2E era falso** |
| Un aseador desactivado pierde el acceso en la siguiente navegación | la pieza está (`getUser()`); la prueba con token vivo es del plan 02-09 |

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Regla 3 - Bloqueante] El worktree no tenía `node_modules` ni `.env.local`**

- **Encontrado durante:** antes de la Tarea 1.
- **Arreglo:** `npm ci` desde el lockfile commiteado y `.env.local` reconstruido desde `npx supabase status`. Ningún paquete nuevo: la puerta de legitimidad del 2026-09-01 cubre un conjunto cerrado.
- **Archivos versionados:** ninguno.
- Es la **cuarta** vez consecutiva (02-01, 02-04, 02-05, 02-06). El plan 02-05 ya recomendó un script de arranque de worktree; sigue sin existir y sigue costando lo mismo cada vez.

**2. [Regla 3 - Bloqueante] `vitest.config.ts` no resolvía `@/` ni `server-only`**

- **Encontrado durante:** Tarea 1, fase RED.
- **Problema:** `guards.ts` importa la fábrica de servidor por `@/` y declara `server-only`, cuyo `index.js` es literalmente un `throw` fuera de la condición de exports `react-server`. Sin los alias, el test no arrancaba.
- **Arreglo:** replicados los dos alias que `vitest.integration.config.ts` ya tenía, con la misma razón escrita.
- **Commit:** `91e0121`.

**3. [Regla 1 - Bug] El `redirect('/')` de la Server Action dejaba la URL parada en `/`**

- **Encontrado durante:** Tarea 3, primera corrida de Playwright: 4 fallos.
- Detalle completo arriba. **Archivos:** `app/(public)/login/_actions.ts`. **Commit:** `814e0cd`.

**4. [Regla 1 - Bug] La aserción anti-caché de E2E era un falso verde**

- **Encontrado durante:** Tarea 3, al validar el test con un señuelo en vez de creerle al verde.
- Detalle completo arriba. **Archivos:** `e2e/login.spec.ts` (test eliminado, con la razón escrita), `lib/supabase/middleware.test.ts` (nuevo). **Commit:** `814e0cd`.

**5. [Regla 1 - Bug] `e2e/fixtures.ts` se habría roto por strict mode**

- **Problema:** las fixtures del plan 02-04 usaban `getByLabel(/contrase/i)`, que casa con el input de contraseña **y** con el botón de mostrar/ocultar, cuyo `aria-label` es `Mostrar contraseña`. Playwright falla por strict mode con dos coincidencias.
- **Arreglo:** selectores exactos. El `aria-label` del botón no se puede quitar: va sin texto visible y lo exige UI-SPEC §13. El plan 02-04 ya anticipó este ajuste ("si los selectores salen distintos, ajustar `e2e/fixtures.ts` junto con la pantalla").
- **Commit:** `814e0cd`.

### Añadidos deliberados sobre el plan

**6. [Regla 2 - Funcionalidad crítica ausente] Las cabeceras anti-caché también en la redirección**

El código de referencia del research copia a la redirección solo las **cookies**. Pero una respuesta 307 que lleva `Set-Cookie` de sesión es exactamente igual de cacheable que un 200, y es la respuesta que sirve el caso más frecuente del middleware (rebotar a la raíz del rol). Se copian también `cache-control`, `expires` y `pragma`. Es la misma mitigación de T-02-22 aplicada a la rama que el research dejaba fuera.

**7. [Regla 2] `--container-login` y `--container-aseador` como tokens**

`max-w-[400px]` y `max-w-[480px]` son los valores arbitrarios de espaciado que UI-SPEC §2 prohíbe. Se declararon como tokens, y se verificó en el CSS emitido que la utilidad existe (`.max-w-login{max-width:var(--container-login)}`), siguiendo la sonda de tokens que estableció el plan 02-05. **Dato para las fases siguientes:** Tailwind v4 resuelve las `max-w-*` con nombre desde el namespace `--container-*`, **no** desde `--spacing-*`.

**8. [Regla 2] Tests de más sobre lo que el plan pedía**

- `guards.test.ts` lleva 8 casos y no 5: se añadieron "sin rol en `app_metadata`" (falla cerrado) y los dos de `exigirSesion` con cada rol.
- `ruteo.spec.ts` lleva 10 casos y no 4: se añadieron `/mis-aseos` sin sesión, `/login` con cada rol, y el cierre de sesión.
- El test de cierre de sesión comprueba **dos** cosas: que aterriza en `/login` y que volver a la ruta protegida rebota otra vez. Sin la segunda mitad pasaría aunque `signOut()` no borrara nada y solo hubiera un `redirect`.

### Desviaciones menores del texto del plan

**9. El botón de login no lleva `min-width`**

El plan pedía conservar el ancho con `min-width`. El botón es de ancho completo, así que su ancho no depende del contenido y el cambio de label a `Entrando…` no puede hacerlo saltar. Añadir un `min-w-[…]` sería además el valor arbitrario de espaciado que §2 prohíbe. La intención de §9.3 (que nada salte) se cumple; el mecanismo es otro y está comentado en el archivo.

**10. Copys de validación de formato que el contrato no lista**

`Ese email no tiene un formato válido.` y `Escribe tu contraseña.` no están en UI-SPEC §15. Hablan del **formato** de lo tecleado y nunca de si la cuenta existe, así que no son un oráculo de enumeración. Los tres mensajes que el contrato sí fija están literales.

---

## Threat Model: dispositions aplicadas

| Threat ID | Disposición | Cómo quedó |
|---|---|---|
| T-02-22 | mitigate | `setAll` de dos argumentos aplicando las tres cabeceras, **y también en la rama de redirección**, que el research no cubría. Protegido por un test verificado con señuelo, después de descartar uno que era falso verde |
| T-02-23 | mitigate | `app_metadata.role` en middleware, guards y action de login. Test unitario del caso exacto de escalada |
| T-02-24 | mitigate | `getUser()` en middleware y guards, con la medición del ban escrita en el archivo. La revocación con token vivo se prueba en el plan 02-09 |
| T-02-25 | accept | Copy sin cambios, razón corregida. Los dos mensajes de credenciales son idénticos y hay un test por cada caso que lo fija |
| T-02-26 | mitigate | Next 15.5.24 > 15.2.3. Y la RLS no depende del middleware: el guard de `app/(cleaner)/layout.tsx` es la segunda capa, y la frontera real sigue siendo Postgres |
| T-02-27 | accept | Endpoint público por diseño. Rate limit de GoTrue y comparación `Origin`/`Host` de Next 15 |
| T-02-28 | mitigate | Ninguna fábrica a nivel de módulo; verificado por grep, y la razón escrita en `server.ts` |

## Threat Flags

Ninguna superficie de seguridad nueva fuera del registro. Este plan no añade endpoints de API, ni rutas de auth más allá de `/login`, ni cambios de schema.

## Known Stubs

**`app/(cleaner)/mis-aseos/page.tsx` es un stub declarado**, no un descuido. Renderiza título, texto y botón de cerrar sesión, y nada más. Es intencional y está escrito en el propio archivo: existe **solo** para que PLAT-07 tenga a dónde aterrizar. La aplicación del aseador (checklist, cámara, cola offline, PWA) es Fase 5 y Fase 6. El copy que muestra al usuario dice exactamente eso, así que no hay promesa incumplida en pantalla.

No hay ningún otro stub: `/login` está cableado de punta a punta contra GoTrue, y el middleware y los guards operan sobre datos reales.

## Notas para los planes siguientes

- **02-07 (shell del admin):** `/apartamentos` todavía no existe y el ruteo ya apunta ahí. `e2e/ruteo.spec.ts` comprueba `page.url()` y **nunca** el contenido de la página destino, así que esos tests seguirán pasando cuando la página aterrice. El menú de usuario consume `cerrarSesion()` de `app/_actions/sesion.ts`, ya construida y probada.
- **Toda Server Action nueva** arranca con `exigirAdmin()` o `exigirSesion()` y devuelve `ResultadoAccion`. El guard **no** es la frontera: la RLS lo es. No lo uses como excusa para no escribir la policy.
- **Si un test de seguridad sale verde a la primera, rómpelo a propósito antes de creerle.** Este plan encontró así una aserción que medía el default de Next en vez de lo que decía medir. Cuesta dos minutos.
- **Tailwind v4:** las `max-w-*` con nombre salen de `--container-*`, no de `--spacing-*`.
- **No cambiar el `webServer` de Playwright a `url`,** ni ahora que `/login` existe. La razón está en `playwright.config.ts` y sigue vigente.
- **Deuda menor abierta:** `.planning/phases/02-.../deferred-items.md` recoge 3 errores de ESLint en `e2e/fixtures.ts` (falso positivo de `react-hooks/rules-of-hooks` sobre el `use` de Playwright, heredado de 02-04) y el aviso de Vite sobre los config cargados como CommonJS. Ninguno rompe el build ni el CI.
- **Bloqueante residual heredado de 02-01, 02-04 y 02-05:** sigue pendiente un `npx supabase stop && npx supabase start` al cierre de la fase para confirmar en frío que el `config.toml` commiteado reproduce el entorno.

## Self-Check: PASSED

Los 19 archivos que este resumen declara creados o modificados existen en disco, y los 4 hashes de commit (`91e0121`, `44a320a`, `df3e20e`, `814e0cd`) resuelven a objetos de tipo `commit` en el historial de la rama.
