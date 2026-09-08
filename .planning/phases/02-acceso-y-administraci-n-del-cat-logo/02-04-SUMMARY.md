---
phase: 02-acceso-y-administraci-n-del-cat-logo
plan: 04
subsystem: testing
tags: [vitest, playwright, supabase, jwt, rls, e2e, integration, supply-chain]

# Dependency graph
requires:
  - phase: 02-01
    provides: "Proveedor de email de GoTrue encendido con el auto-registro cerrado, lib/env.ts, lib/supabase/admin.ts y los 6 guardarrailes de arquitectura"
provides:
  - "npm run test:integration: suite contra el stack local con JWT reales, fuera de test:unit"
  - "lib/test/clientes.ts: fabrica de cliente Supabase con un JWT concreto en el header Authorization"
  - "Prueba MEDIDA de que signInWithPassword funciona: el bloqueante de 02-01 queda cerrado, no afirmado"
  - "npm run test:e2e: runner de Playwright con webServer de produccion"
  - "e2e/global-setup.ts: admin y dos aseadores deterministas, idempotente, con el rol en app_metadata Y user_metadata"
  - "e2e/fixtures.ts: paginaAdmin, paginaAseador y paginaAseador2 con storageState por rol"
  - "Guardarrail 5 con excepcion acotada a lib/test/, probada con senuelo en ambos sentidos"
  - "Aprobacion humana registrada de los 13 paquetes de la fase"
affects: [02-05, 02-06, 02-08, 02-10, 02-12, 02-14]

# Tech tracking
tech-stack:
  added:
    - "@playwright/test 1.62.1 (devDependency, pin exacto)"
    - "react-hook-form 7.87.0 (pin exacto, lo consume 02-12)"
    - "@hookform/resolvers 5.9.1 (pin exacto, zodResolver con Zod 4)"
  patterns:
    - "Los tests de integracion viven en *.integration.test.ts y NUNCA entran a test:unit"
    - "La RLS se prueba emitiendo la consulta con el JWT del usuario, nunca con el cliente de servicio"
    - "El sembrado y la asercion usan clientes distintos: sembrar y comprobar con el mismo cliente hace pasar tests con la policy rota"
    - "Todo usuario semilla lleva el rol escrito en app_metadata Y en user_metadata"
    - "Los guardarrailes nuevos se prueban con senuelo en los dos sentidos antes de commitear (heredado de 02-01)"

key-files:
  created:
    - vitest.integration.config.ts
    - lib/test/clientes.ts
    - lib/test/cargar-env.ts
    - lib/auth/sesion.integration.test.ts
    - playwright.config.ts
    - e2e/global-setup.ts
    - e2e/global-teardown.ts
    - e2e/fixtures.ts
    - e2e/harness.spec.ts
  modified:
    - vitest.config.ts
    - package.json
    - .gitignore
    - scripts/ci/check-service-role.sh

key-decisions:
  - "La auditoria de paquetes NO quedo en [ASSUMED]: slopcheck no esta, pero npm view si funciona en este entorno y los 13 se verificaron contra el registry en vivo"
  - "La tabla §Package Legitimacy Audit del research decia cubrir 13 paquetes y solo tenia 10 filas; las 3 que faltaban se auditaron en este plan"
  - "lucide-react arrastra DOS saltos de deriva, no uno: STACK.md 1.37.0, research de fase 1.38.0, registry 1.39.0"
  - "server-only se resuelve por alias a su propio empty.js en la config de integracion, en vez de relajar resolve.conditions global"
  - "Vitest NO pasa .env.local a process.env: hace falta un setupFile explicito (medido, no supuesto)"
  - "El webServer de Playwright espera por PUERTO y no por url, porque la sonda HTTP sigue redirects y exige status < 400"
  - "El globalSetup borra y recrea siempre, en vez de reutilizar usuarios existentes"

patterns-established:
  - "Fabrica clienteConToken(token): la unica forma honesta de probar que la RLS filtra por usuario"
  - "Credenciales de la corrida en e2e/.auth/credenciales.json, gitignored, con contrasena nueva por corrida"
  - "Excepcion de guardarrail acotada a directorio y no a archivo, con el motivo escrito en el propio script"

requirements-completed: [PLAT-01, PLAT-02, PLAT-04]

# Metrics
duration: 41min
completed: 2026-09-01
---

# Fase 02 Plan 04: Harness de pruebas de integración y E2E

**El proyecto pasa de tener solo tests unitarios a poder probar la RLS con JWT reales contra la base y el recorrido completo en un navegador; y el bloqueante que el plan 02-01 dejó abierto queda cerrado con una medición reproducible, no con una afirmación.**

## Performance

- **Duración:** 41 min
- **Iniciado:** 2026-09-01T14:58:00Z
- **Completado:** 2026-09-01T15:39:16Z
- **Tareas:** 3 de 3 (1 checkpoint + 2 de implementación)
- **Archivos creados/modificados:** 13

## Task Commits

1. **Tarea 1: Puerta de legitimidad de paquetes** — sin commit de código (checkpoint). Aprobación registrada abajo.
2. **Tarea 2: Suite de integración con JWT reales** — `f10e332` (feat)
3. **Tarea 3: Runner de Playwright con usuarios semilla** — `c32be3e` (feat)

---

## Puerta de legitimidad: aprobación registrada

**Aprobado por el desarrollador el 2026-09-01**, cubriendo los 13 paquetes de la fase. Ningún paquete fue rechazado ni reemplazado.

### El método fue mejor que el que pedía el plan, y esto importa para las fases siguientes

El plan asumía que sin `slopcheck` la disposición formal de los 13 paquetes tenía que ser `[ASSUMED]`, y que la evidencia disponible era la tabla del research. **`slopcheck` efectivamente no está en este entorno, pero `npm view` sí funciona.** Los 13 paquetes se verificaron contra el registry de npm en vivo durante la ejecución de este plan: versión exacta resuelta, `repository.url` y ausencia de `scripts.postinstall` salen del registry, no de una transcripción.

**Las fases siguientes no deben repetir el `[ASSUMED]` por inercia.** Mientras `npm view` responda, hay evidencia de primera mano disponible y marcar un paquete como no verificable es una afirmación falsa.

Resultado: los 13 tienen `scripts.postinstall` ausente y `repository.url` en la organización oficial esperada.

### Hueco real en el research que este plan cerró

**La tabla `02-RESEARCH.md` §Package Legitimacy Audit afirma cubrir los 13 paquetes de la fase y solo tiene 10 filas.** Faltaban `class-variance-authority`, `clsx` y `tailwind-merge`. La afirmación del plan de que la tabla los cubría era falsa. Los tres se auditaron aquí:

| Paquete | Resuelve a | Creado | Repo verificado |
|---|---|---|---|
| `class-variance-authority` | 0.7.1 | 2022-01-26 | `github.com/joe-bell/cva` |
| `clsx` | 2.1.1 | 2018-12-24 | `github.com/lukeed/clsx` |
| `tailwind-merge` | 3.6.0 | 2021-07-18 | `github.com/dcastil/tailwind-merge` |

Los tres limpios, sin `postinstall`, y con las versiones que el research declara en §Standard Stack.

### Deriva de `lucide-react`: son DOS saltos, no uno — nota para el plan 02-05

| Fuente | Versión |
|---|---|
| `research/STACK.md` | `1.37.0` |
| `02-RESEARCH.md` §Standard Stack (lo que dice que instala el CLI) | `^1.38.0` |
| Registry de npm el 2026-09-01 | **`1.39.0`** |

Con el caret que escribe el CLI de shadcn, `npm i` trae `1.39.0`, no `1.38.0`. **Decisión del usuario: pinear exacto la versión que efectivamente aterrice** y anotar los dos saltos en el commit del plan 02-05. El research solo anticipaba el primero.

---

## Lo que se construyó

### Suite de integración (`npm run test:integration`)

`lib/auth/sesion.integration.test.ts`, 5 tests verdes contra el stack local. Miden:

| Aserción | Resultado |
|---|---|
| `signInWithPassword` devuelve sesión con `access_token` | `error === null` |
| El JWT lleva `app_metadata.role === 'aseador'` | verde (decodificando el token, no leyendo la respuesta) |
| El perfil se materializó en `public.profiles` por el trigger | rol, nombre e `is_active` correctos |
| `signUp` con la clave publicable falla | HTTP 422 |
| Contraseña mala y email inexistente dan el MISMO error | `invalid_credentials` en ambos, mismo mensaje y mismo status |

La primera fila **es** el cierre del bloqueante de 02-01. Antes de esa fase devolvía `Email logins are disabled`.

El tercer test no estaba pedido explícitamente y se añadió a propósito: ancla la otra mitad del doble escrito de metadatos. Si alguien "simplifica" el sembrado a un solo sitio, ese test es el que se pone rojo.

### Runner E2E (`npm run test:e2e`)

`playwright.config.ts` con `next build && next start`, `locale: es-CO`, `timezoneId: America/Bogota`, un solo proyecto chromium, `globalSetup` y `globalTeardown`.

`e2e/global-setup.ts` siembra `e2e.admin@`, `e2e.aseador1@` y `e2e.aseador2@vivaguest.test`. Verificado contra la base después de correr:

```
email                        | app_meta | user_meta | perfil  | full_name       | is_active
e2e.admin@vivaguest.test     | admin    | admin     | admin   | Admin E2E       | t
e2e.aseador1@vivaguest.test  | aseador  | aseador   | aseador | Aseador Uno E2E | t
e2e.aseador2@vivaguest.test  | aseador  | aseador   | aseador | Aseador Dos E2E | t
```

Idempotencia probada corriendo la suite dos veces seguidas sin limpiar en medio: la segunda pasa igual.

---

## Decisiones técnicas, todas forzadas por una medición

### `server-only` rompe cualquier test que toque `lib/supabase/admin.ts`

El `index.js` del paquete `server-only` es literalmente un `throw`; solo la condición de exports `react-server` lo resuelve al `empty.js` inocuo. Vitest no activa esa condición. Sin arreglo, ningún test de integración puede importar la fábrica administrativa.

**Solución:** alias de `server-only` a `node_modules/server-only/empty.js` en `vitest.integration.config.ts`. Se apunta al `empty.js` **del propio paquete** (lo mismo que resuelve Next en el servidor) en vez de relajar `resolve.conditions` global, que cambiaría la resolución de todos los demás paquetes.

En `e2e/` el problema es el mismo pero la salida es otra: el transpilador de Playwright no admite ese alias, así que `e2e/global-setup.ts` construye su cliente de servicio con `readServerSecret` de `lib/env.ts` (que deliberadamente **no** importa `server-only`). El nombre de la variable aparece ahí, pero `e2e/` no está en el alcance del guardarraíl 1 y, sobre todo, nunca lo compila Next: el `next build` de este plan emite solo `/` y `/_not-found`.

### Vitest no pasa `.env.local` a `process.env`

Medido, no supuesto: la primera corrida de la suite falló en el `beforeAll` con `Variables de entorno inválidas (cliente)`. Vitest lee los archivos `.env` con Vite, pero solo expone a `import.meta.env` lo que lleva el prefijo configurado, y `lib/env.ts` lee de `process.env` porque eso es lo que hay en runtime bajo Next.

**Solución:** `setupFiles: ['./lib/test/cargar-env.ts']`, que usa `process.loadEnvFile` (Node ≥ 20.12) y falla con instrucciones concretas si `.env.local` no existe, en vez de dejar que la suite reviente más adelante con un error de red sin explicación.

### El `webServer` de Playwright espera por PUERTO, no por `url`

La primera corrida murió con `Timed out waiting 180000ms from config.webServer` **con el servidor perfectamente arriba**. Diagnóstico separado: `npm run build` tarda 11s y `next start` queda listo en 594ms, así que no era lentitud.

La causa real, medida con curl:

```
GET http://127.0.0.1:3000/  →  307  →  /login  →  404
```

La sonda HTTP de Playwright sigue los redirects y exige un status final < 400. `app/page.tsx` redirige a `/login`, que en esta wave todavía no existe. El runner esperaba una página que el plan aún no construye.

**Solución:** `port: 3000` en vez de `url`. La señal de "listo" pasa a ser que el puerto acepta conexiones, que es independiente de qué rutas existan. Queda escrito en el propio archivo que **no** se cambie a `url: '/login'` cuando esa página aterrice: acoplar el arranque del servidor a una ruta concreta reintroduce el mismo fallo la próxima vez que alguien mueva la pantalla de entrada.

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Regla 3 - Bloqueante] El worktree no tenía `node_modules` ni `.env.local`**

- **Encontrado durante:** Tarea 2, antes de la primera ejecución
- **Problema:** `.env.local` está en `.gitignore` (correctamente), así que no viaja entre worktrees, y `node_modules` tampoco existía. Sin ninguno de los dos no corre nada.
- **Arreglo:** `npm ci`, y `.env.local` reconstruido desde `npx supabase status`. Confirmado con `git check-ignore` que el archivo sigue fuera del control de versiones.
- **Archivos:** ninguno versionado.

**2. [Regla 3 - Bloqueante] `server-only` abortaba la suite de integración**

- Detalle arriba en decisiones técnicas. **Archivos:** `vitest.integration.config.ts`. **Commit:** `f10e332`.

**3. [Regla 3 - Bloqueante] Vitest no cargaba `.env.local`**

- Detalle arriba. Añadido `lib/test/cargar-env.ts`, que el plan no contemplaba. **Commit:** `f10e332`.

**4. [Regla 1 - Bug] El `webServer` de Playwright nunca alcanzaba el estado "listo"**

- Detalle arriba. `url` cambiado por `port`. **Archivos:** `playwright.config.ts`. **Commit:** `c32be3e`.

### Añadidos deliberados sobre el plan

**5. [Regla 2 - Funcionalidad crítica ausente] `e2e/harness.spec.ts`**

El plan daba por bueno cerrar con cero specs. El problema práctico: `npx playwright test` sale con `No tests found` y **código 1**, así que `npm run test:e2e` quedaría en rojo desde el día uno, y un harness que nunca se ejecuta no está verificado. El `globalSetup` podría romperse en cualquier commit de aquí a que aterrice la primera pantalla y nadie se enteraría hasta que un test de verdad fallara por una razón que no tiene que ver con lo que mide.

Se añadieron 2 tests que prueban el **contrato del harness**, no ninguna pantalla: que hay tres usuarios sembrados con roles y contraseñas distintas, y que esas credenciales autentican de verdad contra GoTrue con el rol en `app_metadata`. No estorban cuando lleguen las pantallas.

**6. [Regla 2] `e2e/global-teardown.ts`**

El spec de artefactos del plan pide usuarios "borrados al final", pero el cuerpo de la tarea solo describía el borrado idempotente al arrancar. Se implementaron **los dos**: el `globalSetup` borra y recrea (que es lo que da corrección aunque una corrida se caiga), y el teardown limpia usuarios y `e2e/.auth/` al terminar (higiene, para no dejar cookies vivas ni usuarios tirados en la base de desarrollo). El teardown es best-effort: un fallo limpiando no puede tumbar una suite que pasó.

**7. `paginaAseador2` en las fixtures**

El plan pedía `paginaAdmin` y `paginaAseador`. Se añadió la tercera porque el `globalSetup` ya siembra dos aseadores y el criterio de aislamiento entre aseadores necesita ambos con sesión simultánea.

---

## Verification Evidence

| Comprobación | Resultado |
|---|---|
| `npm run test:unit` | 7 archivos, **138 tests** verdes |
| `npm run test:unit` no incluye `.integration.test.ts` | confirmado: 7 archivos, los mismos que antes del plan |
| `npm run test:integration` | 1 archivo, **5 tests** verdes |
| `npx playwright test` | **2 tests** verdes, incluyendo `globalSetup` + `next build` + `next start` |
| `npx playwright test --list` | 2 tests en 1 archivo, exit 0 |
| Idempotencia del `globalSetup` | dos corridas seguidas sin limpiar, ambas verdes |
| `globalTeardown` | `select count(*) ... like 'e2e.%'` → **0**, y `e2e/.auth/` borrado |
| Doble escrito de rol | verificado en `auth.users` y `public.profiles` con psql |
| Señuelo: import de la fábrica en `lib/` fuera de `lib/test/` | **rojo**, y verde al borrarlo |
| Señuelo: el mismo import dentro de `lib/test/` | **verde** |
| `npm run ci:arch` | OK, 6 guardarrailes |
| `npx tsc --noEmit` | limpio |
| `npm run build` | OK, emite solo `/` y `/_not-found` (confirma que `lib/test/` y `e2e/` no entran al bundle) |
| Pines exactos | `@playwright/test` 1.62.1, `react-hook-form` 7.87.0, `@hookform/resolvers` 5.9.1, sin caret |

---

## Threat Model: dispositions aplicadas

| Threat ID | Disposición | Cómo quedó |
|---|---|---|
| T-02-SC | mitigate | Checkpoint bloqueante ejecutado y aprobado. **Mejorado sobre el plan:** verificación contra el registry en vivo en vez de `[ASSUMED]` |
| T-02-14 | mitigate | Excepción del guardarraíl 5 acotada a `lib/test/`, comentada en el script y probada con señuelo en ambos sentidos. `npm run build` confirma que no entra al bundle |
| T-02-15 | accept | Prefijo `e2e.` inconfundible, dominio `.test` (RFC 2606, nunca resuelve), contraseñas por corrida, y ahora además teardown que los borra |
| T-02-16 | mitigate | `e2e/.auth/` en `.gitignore` y borrado por el teardown |
| T-02-17 | mitigate | Aviso escrito en la cabecera de `e2e/global-setup.ts` con el síntoma reconocible (`invalid_credentials` que parece login roto) |

## Threat Flags

Ninguna superficie de seguridad nueva fuera del registro. Este plan no añade endpoints, rutas de auth ni cambios de schema.

## Known Stubs

Ninguno. `e2e/fixtures.ts` referencia selectores de `/login` (`getByLabel(/correo|email/i)` y demás) que todavía no existen porque la pantalla la construye el plan 02-06; no es un stub sino la fixture esperando a su feature, y ningún test la ejercita todavía.

## Notas para los planes siguientes

- **02-05 (shadcn):** pinear exacto lo que instale el CLI y anotar los **dos** saltos de `lucide-react`. La aprobación de paquetes ya está dada; no hace falta otra puerta.
- **02-06 (middleware y login):** las fixtures ya esperan `/login` con labels de correo y contraseña y un botón "Entrar"/"Iniciar sesión". Si los selectores salen distintos, ajustar `e2e/fixtures.ts` junto con la pantalla.
- **Criterio duro de la fase** (aseador desactivado pierde acceso con un token todavía vivo): la pieza que faltaba ya existe. `clienteConToken` permite guardar el `access_token`, desactivar al usuario y volver a consultar **con ese mismo token** esperando cero filas. Ese test no se puede falsear con un login nuevo.
- **Bloqueante residual heredado de 02-01:** sigue pendiente un `npx supabase stop && npx supabase start` al cierre de la fase para confirmar en frío que el `config.toml` commiteado reproduce el entorno.

## Self-Check: PASSED

Los 9 archivos que este resumen declara creados existen en disco, y los 2 hashes de commit (`f10e332`, `c32be3e`) resuelven a objetos de tipo `commit` en el historial de la rama.
