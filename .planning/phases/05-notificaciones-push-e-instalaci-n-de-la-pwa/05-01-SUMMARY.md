---
phase: 05-notificaciones-push-e-instalaci-n-de-la-pwa
plan: 01
subsystem: infra
tags: [web-push, vapid, serwist, pwa, env, zod, supply-chain]

requires:
  - phase: 02-acceso-y-administraci-n-del-cat-logo
    provides: "`readServerSecret()` y `publicEnv()` en `lib/env.ts`, con el rechazo por runtime del prefijo NEXT_PUBLIC_"
  - phase: 03-motor-de-sincronizaci-n-ical
    provides: "`CRON_SHARED_SECRET` y los secretos de Vault `app_base_url` / `cron_shared_secret`, que el drenaje de push REUSA sin crear ninguno nuevo"
provides:
  - "`web-push@3.6.7` instalado, la librería que firma el JWT de VAPID en cada envío"
  - "`@serwist/next@9.5.12` y `serwist@9.5.12` instalados en lockstep y deliberadamente SIN enganchar en `next.config.ts`"
  - "`@types/web-push@3.6.4` como devDependency: `web-push@3.6.7` no declara `types` ni `typings`"
  - "El par VAPID generado, único para todos los entornos, guardado solo en `.env.local` (ignorado por git)"
  - "`NEXT_PUBLIC_VAPID_PUBLIC_KEY` dentro de `publicSchema`, con acceso literal a `process.env`"
  - "`lib/env.test.ts`: 6 tests, incluido el que convierte en puerta el rechazo del prefijo público en `readServerSecret()`"
  - "`docs/despliegue-push.md`: el procedimiento operativo del par VAPID y de la rotación"
affects: [05-02, 05-05, 05-08, 05-drenaje, despliegue, onboarding-de-aseadores]

tech-stack:
  added: [web-push@3.6.7, "@serwist/next@9.5.12", serwist@9.5.12, "@types/web-push@3.6.4"]
  patterns:
    - "Compuerta humana de legitimidad de paquetes ANTES del primer npm install de la fase, con doble verificación contra el registry"
    - "Versión exacta sin rango (`--save-exact`) para todo paquete que el CLAUDE.md fija como decisión de stack"
    - "Toda variable que entra a `publicSchema` entra el mismo día al paso `build` de `ci/db.yml`"

key-files:
  created:
    - lib/env.test.ts
    - docs/despliegue-push.md
  modified:
    - package.json
    - package-lock.json
    - lib/env.ts
    - .env.example
    - ci/db.yml

key-decisions:
  - "`@types/web-push@3.6.4` entra como cuarto paquete: `web-push@3.6.7` no declara `types` ni `typings`, medido sobre el `package.json` del paquete instalado, y este repo mantiene `tsc --noEmit` en cero"
  - "UN SOLO par VAPID para todos los entornos: la `applicationServerKey` queda grabada dentro de la suscripción, así que un par por entorno produce suscripciones que el otro entorno no puede firmar"
  - "`VAPID_PRIVATE_KEY` y `VAPID_SUBJECT` NO entran a ningún esquema: se leerán con `readServerSecret()` en el plan 05-05, igual que hace `lib/supabase/admin.ts` con su clave"
  - "`VAPID_PRIVATE_KEY` NO va a Vault: Vault guarda el secreto con el que Postgres te llama a ti; esta clave es con la que tú firmas hacia afuera, y Postgres no la toca nunca"
  - "Serwist queda instalado y sin envolver `next.config.ts`: engancharlo antes de que exista el service worker dejaría el build generando un artefacto inexistente. Es el plan 05-08"
  - "Las dos vulnerabilidades transitivas de build (`browserslist` vía `@serwist/next`, `postcss` vía `next`) se aceptan: sus arreglos automáticos son downgrades que rompen los pines exactos de CLAUDE.md"

patterns-established:
  - "Puerta de secreto con test: el rechazo del prefijo `NEXT_PUBLIC_` deja de ser un `if` con comentario y pasa a ser una aserción que cae si alguien borra el ataje"
  - "Documento de despliegue por motor (`despliegue-sync.md`, `despliegue-push.md`), cada uno declarando explícitamente qué NO le toca hacer al lector"

requirements-completed: [NOTIF-01, NOTIF-02]

coverage:
  - id: D1
    description: "Las tres dependencias de la fase quedan instaladas en la versión exacta que fija CLAUDE.md, ninguna entró sin confirmación humana de legitimidad"
    requirement: NOTIF-01
    verification:
      - kind: other
        ref: "node -e \"const p=require('./package.json');console.log(p.dependencies['web-push'],p.dependencies['@serwist/next'],p.devDependencies['serwist'])\" → 3.6.7 9.5.12 9.5.12"
        status: pass
      - kind: manual_procedural
        ref: "Task 1 checkpoint:human-verify, gate=blocking-human. Aprobado por el usuario sobre evidencia verificada dos veces contra el registry"
        status: pass
    human_judgment: false
  - id: D2
    description: "Existe un solo par VAPID para todos los entornos; la pública viaja al bundle validada por zod y la privada solo se lee desde el servidor"
    requirement: NOTIF-02
    verification:
      - kind: unit
        ref: "lib/env.test.ts#publicEnv devuelve la clave publica VAPID cuando la variable esta puesta"
        status: pass
      - kind: unit
        ref: "lib/env.test.ts#lanza cuando falta NEXT_PUBLIC_VAPID_PUBLIC_KEY"
        status: pass
    human_judgment: false
  - id: D3
    description: "Una variable de secreto con prefijo público se rechaza en runtime antes de que exista un bundle"
    requirement: NOTIF-02
    verification:
      - kind: unit
        ref: "lib/env.test.ts#rechaza cualquier nombre con prefijo NEXT_PUBLIC_, aunque la variable exista"
        status: pass
    human_judgment: false
  - id: D4
    description: "El build y el tsc siguen verdes con Serwist instalado y sin envolver"
    verification:
      - kind: other
        ref: "npx tsc --noEmit → 0; npm run lint → 0 errores 2 avisos (línea base); npm run ci:arch → 0; npm run build → 0, 11 rutas"
        status: pass
      - kind: other
        ref: "grep -c 'withSerwist' next.config.ts → 0"
        status: pass
    human_judgment: false
  - id: D5
    description: "El procedimiento operativo del par VAPID y de la rotación queda escrito, incluyendo que no hay secreto de Vault nuevo"
    verification:
      - kind: other
        ref: "test -f docs/despliegue-push.md; menciona app_base_url y cron_shared_secret como ya existentes"
        status: pass
    human_judgment: true
    rationale: "Un documento operativo solo se valida leyéndolo: que sea correcto no es comprobable con un grep, y el criterio de éxito es que quien despliegue no cree un secreto de Vault de más"

duration: 18min
completed: 2026-09-11
status: complete
---

# Phase 05 Plan 01: Dependencias de push, par VAPID y contrato de entorno Summary

**Las tres dependencias de push entraron en versión exacta tras una compuerta humana explícita, el par VAPID quedó generado una sola vez fuera de git, y el rechazo del prefijo `NEXT_PUBLIC_` en secretos de servidor pasó de ser un comentario a ser un test que cae si alguien borra el ataje.**

## Performance

- **Duration:** 18 min (sin contar la espera en la compuerta humana)
- **Started:** 2026-09-11T14:52Z
- **Completed:** 2026-09-11T15:07Z
- **Tasks:** 3 de 3
- **Files modified:** 7 (5 modificados, 2 creados)

## Accomplishments

- **La compuerta de suministro se sostuvo.** `slopcheck` no existe en este entorno, así que los tres paquetes venían marcados `[ASSUMED]` desde el `05-RESEARCH.md`. En vez de dar el gate por trámite, re-verifiqué los cuatro puntos del criterio de fallo contra el registry (versión presente, repo declarado, ausencia de aviso de deprecación, ausencia de `preinstall`/`install`/`postinstall`) y el orquestador corrió una verificación independiente. Las dos coincidieron antes de que el usuario aprobara.
- **El gate encontró algo que la tabla del plan no tenía.** `web-push@3.6.7` no declara `types` ni `typings`. Sin `@types/web-push`, `tsc --noEmit` habría dejado de estar en cero en el primer `import` del plan 05-05. El paquete entró a la misma aprobación, verificado igual (DefinitelyTyped, 3.6.4, sin deprecación, sin scripts de instalación).
- **La regla del prefijo público ahora es una puerta.** `readServerSecret()` ya rechazaba nombres `NEXT_PUBLIC_*`, pero nada lo probaba. El par VAPID es el caso que lo pone a prueba de verdad: dos variables del mismo par, una pública y una secreta, con nombres que se parecen. El test las enfrenta con la variable **puesta y válida**, para que lo que falle sea el nombre y no la ausencia.
- **Los siete iconos del `05-UI-SPEC.md` §17.5 quedaron confirmados contra el paquete instalado.** `KeyRound`, el de mayor riesgo declarado, existe en `lucide-react@1.39.0`. No hizo falta la sustitución por `Key` que el contrato autorizaba.
- **Las cuatro puertas siguen verdes con las dependencias dentro y sin enganchar:** `tsc` en cero, `lint` con 0 errores y los 2 avisos preexistentes, `ci:arch` en cero con sus dos scripts, `build` en cero con las 11 rutas de la línea base. La suite completa pasó de 568 a 574 tests, los 6 nuevos de `lib/env.test.ts`.

## Task Commits

1. **Task 1: Compuerta de legitimidad de los tres paquetes nuevos** — sin commit, no produce artefacto. `checkpoint:human-verify` con `gate="blocking-human"`, resuelto con "aprobado" para los cuatro paquetes.
2. **Task 2: Instalar dependencias, generar el par VAPID y cablear el entorno** — `680d075` (feat)
3. **Task 3: Confirmar los siete iconos nuevos y que el árbol sigue verde** — sin commit, no produce diff. Es una tarea de verificación: los siete iconos existen, no hizo falta sustitución, y ninguna de las cuatro puertas exigió cambios.

## Files Created/Modified

- `package.json` / `package-lock.json` — `web-push@3.6.7` y `@serwist/next@9.5.12` como dependencias, `serwist@9.5.12` y `@types/web-push@3.6.4` como devDependencies. Todas con `--save-exact`, sin rango.
- `lib/env.ts` — `NEXT_PUBLIC_VAPID_PUBLIC_KEY` añadida a `publicSchema` con `z.string().min(1)` y referenciada literalmente dentro de `publicEnv()`, porque Next sustituye los `NEXT_PUBLIC_*` en tiempo de build y un acceso por índice dinámico devolvería `undefined` en el bundle.
- `lib/env.test.ts` — **nuevo.** 6 tests sobre `publicEnv()` y `readServerSecret()`. Manipulan `process.env` con snapshot y restauración manual, no con `vi.stubEnv`, porque hace falta **borrar** una variable y porque Vitest carga los `.env` del proyecto dentro de `process.env`: sin copia limpia de partida, el caso "la variable falta" pasaría en verde en CI (donde no hay `.env.local`) y en rojo en la máquina de quien sí lo tiene.
- `.env.example` — las tres variables del par VAPID con el nivel de detalle de `CRON_SHARED_SECRET`, y el bloque de `CRON_SHARED_SECRET` ampliado para decir que ahora también lo consume `/api/push/drain` reusando el mismo secreto de Vault.
- `docs/despliegue-push.md` — **nuevo.** Con la forma de `docs/despliegue-sync.md`. Abre declarando que aquí **no hay ningún secreto de Vault nuevo**, porque es el error más fácil de cometer al leer los dos documentos seguidos.
- `ci/db.yml` — placeholder de `NEXT_PUBLIC_VAPID_PUBLIC_KEY` en el paso `build`. Ver deviación 1.

## Decisions Made

- **Un solo par VAPID para todos los entornos**, lo que rompe a propósito la regla que `cron_shared_secret` sí cumple. La razón no es comodidad: la `applicationServerKey` queda grabada **dentro de la suscripción** en el momento de crearla, así que un par distinto en preview produce suscripciones que producción no puede firmar. El mismo teléfono aparecería suscrito y no recibiría nada. El coste asumido es que el par de desarrollo es tan sensible como el de producción.
- **La privada no va a Vault.** Es la confusión que el documento ataja explícitamente: Vault guarda el secreto con el que **Postgres te llama a ti** (`cron_shared_secret`); la privada VAPID es con la que **tú firmas hacia afuera**. Postgres no la toca nunca, así que meterla en Vault no la hace más segura, solo la pone donde nadie la lee.
- **Serwist instalado y sin envolver.** Engancharlo aquí dejaría el build generando un service worker que todavía no existe. `grep -c 'withSerwist' next.config.ts` devuelve 0, y es un criterio de aceptación, no un olvido.
- **`npm audit` reporta 4 vulnerabilidades (1 moderada, 3 altas) y se aceptan.** Son transitivas y de build, no de runtime: `browserslist` bajo `@serwist/next` y `postcss` bajo `next`. El `npm audit fix --force` propone downgrade a `@serwist/next@9.4.1` (rompe el lockstep exacto con `serwist@9.5.12`) y salto a `next@16.3.5` (rompe el pin de CLAUDE.md, que mantiene la línea 15 a propósito por el build de webpack y por el bug abierto serwist#360 en Turbopack+Vercel). Ninguna de las dos alcanza runtime de producción.

## Deviations from Plan

### Auto-fixed Issues

**1. [Regla 3 - Bloqueante] El paso `build` de `ci/db.yml` no inyectaba la clave pública VAPID**

- **Found during:** Task 2, confirmado con un rojo real en Task 3.
- **Issue:** `publicSchema` es estricto y falla por **variable ausente**, no por la página que la use. Al meter `NEXT_PUBLIC_VAPID_PUBLIC_KEY` al esquema, el paso `build` de CI, que inyecta solo dos placeholders, habría reventado con `Variables de entorno inválidas (cliente)` aunque ninguna página tocara la variable. No es hipotético: reproduje exactamente ese error en local con el mismo mensaje, prerenderizando `/mis-aseos`.
- **Fix:** añadido `NEXT_PUBLIC_VAPID_PUBLIC_KEY: vapid_public_ci_placeholder` al paso `build`, y escrita la regla general en el comentario del propio `ci/db.yml` y en el pie de `.env.example`: toda variable que entre a `publicSchema` entra el mismo día a ese paso.
- **Files modified:** `ci/db.yml`, `.env.example`
- **Verification:** `npm run build` en cero con las 11 rutas.
- **Committed in:** `680d075`

**2. [Regla 3 - Bloqueante] No existía `.env.local` en esta máquina**

- **Found during:** Task 3, al correr `npm run build`.
- **Issue:** El plan manda escribir el par VAPID en `.env.local`, pero el archivo no existía. Al crearlo solo con las tres variables de push, Next pasó a cargarlo (`- Environments: .env.local`) con el bloque de Supabase ausente, y el build cayó en el prerender de `/mis-aseos`. La línea base "build verde" de la Fase 4 se había medido con las variables inyectadas en línea, no desde un archivo.
- **Fix:** `.env.local` completado con el bloque de Supabase local, tomado de `npx supabase status` (no son secretos reales, son los del stack de desarrollo), más un `CRON_SHARED_SECRET` generado con 32 bytes aleatorios. El archivo está cubierto por `.gitignore:34` (`.env*`, con `!.env.example` como única excepción) y no aparece en `git status`.
- **Files modified:** ninguno versionado. `.env.local` es local por definición.
- **Verification:** `git check-ignore -v .env.local` confirma la regla; `git status --short` no lo lista; el build volvió a cero.
- **Committed in:** n/a, no hay nada que commitear.

**3. [Aprobado en el gate] Cuarto paquete no contemplado en la tabla del plan**

- **Found during:** Task 1, preparando la evidencia de la compuerta.
- **Issue:** La tabla del `05-RESEARCH.md` cubría tres paquetes. `web-push@3.6.7` no declara `types` ni `typings` (`npm view` los devuelve vacíos, y lo confirmé después sobre el `package.json` del paquete ya instalado), así que el plan necesitaba un cuarto. El propio `how-to-verify` lo anticipaba en su punto 4, pero el researcher lo había dejado sin verificar.
- **Fix:** `@types/web-push@3.6.4` verificado con el mismo criterio (repo `DefinitelyTyped/DefinitelyTyped`, sin aviso de deprecación, sin scripts de instalación, licencia MIT) y presentado dentro del mismo gate. El usuario aprobó los cuatro juntos.
- **Files modified:** `package.json`, `package-lock.json`
- **Verification:** `tsc --noEmit` en cero.
- **Committed in:** `680d075`

---

**Total deviations:** 3 (2 Regla 3 bloqueantes, 1 ampliación de alcance resuelta dentro del propio gate humano)
**Impact on plan:** Ninguna toca el diseño. Las dos de Regla 3 son la misma clase de fallo, un contrato de entorno incompleto, y la segunda solo se manifestó porque la primera ya estaba arreglada. La tercera es el gate haciendo exactamente lo que existe para hacer. Cero scope creep.

## Issues Encountered

- **La línea base del build no era reproducible tal cual.** `npm run build` estaba documentado como verde, pero no existía `.env.local`: la línea base se había medido con las variables inyectadas por otra vía. Resuelto en la deviación 2. Queda como dato para las fases siguientes: en esta máquina el build ahora sí se reproduce desde `.env.local`.
- **La trampa de los duplicados de iCloud que el `05-CONTEXT.md` §code_context anunciaba no apareció.** `npx tsc --noEmit` salió en cero antes y después del `build`, sin tener que apartar ningún archivo con sufijo numérico.

## User Setup Required

No hace falta `USER-SETUP.md`, pero **sí hay un paso manual pendiente antes de que el push funcione en el proyecto desplegado**, y está documentado en `docs/despliegue-push.md`:

- Las tres variables del par VAPID (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) hay que crearlas en Vercel → Project Settings → Environment Variables, en **Production y Preview**. Preview no es opcional: con la pública vacía el build revienta, y con la pública de otro par genera suscripciones que producción no puede firmar.
- El par hay que guardarlo **también fuera de Vercel**, en el gestor de contraseñas del equipo. Vercel deja de mostrar el valor tras crearlo, y perder la privada obliga a rotar, que es justo lo que el documento existe para evitar.
- **No hay ningún secreto de Vault nuevo.** `app_base_url` y `cron_shared_secret` ya existen desde la Fase 3 y el drenaje los reusa.

## Nota sobre el par VAPID generado

Se generó con `npx --no-install web-push generate-vapid-keys --json`, usando el binario ya instalado y no una descarga al vuelo. Longitudes verificadas: 87 caracteres la pública (P-256 sin comprimir, 65 bytes, en base64url) y 43 la privada (32 bytes). **Los valores no aparecen en este documento, ni en ningún archivo versionado, ni en el historial de git.** Comprobado explícitamente con `git grep -F` de cada mitad sobre el árbol versionado y con un `grep -F` sobre los archivos nuevos: cero coincidencias en ambos casos. Viven únicamente en `.env.local`.

## Known Stubs

Ninguno. Este plan no crea superficie de UI ni de datos: instala dependencias y escribe contrato de entorno. `lib/push/envio.ts`, `/api/push/drain` y `next.config.ts` con `withSerwist` se mencionan en los comentarios como consumidores **futuros** (planes 05-05 y 05-08), y esas referencias son deliberadas, no stubs: describen dónde va a leerse cada variable, que es justo lo que un contrato de entorno tiene que decir.

## Threat Flags

Ninguna. Los dos límites de confianza del `<threat_model>` de este plan quedan cubiertos: el de registry→repositorio con la compuerta humana y los pines exactos, y el de entorno→bundle con `publicSchema` más el test que fija el rechazo del prefijo público. Este plan no abre endpoints, ni rutas de autenticación, ni acceso a archivos, ni toca el schema.

## Self-Check: PASSED

Los 7 archivos declarados existen en disco (`lib/env.test.ts`, `docs/despliegue-push.md`,
`package.json`, `lib/env.ts`, `.env.example`, `ci/db.yml`, este SUMMARY) y los 2 commits
declarados existen en el historial (`680d075`, `4130dfb`).
