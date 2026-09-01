---
phase: 02-acceso-y-administraci-n-del-cat-logo
plan: 01
subsystem: infra
tags: [supabase, gotrue, auth, config, ci, env, bash, next]

# Dependency graph
requires:
  - phase: 01-fundaci-n-schema-y-rls
    provides: "supabase/config.toml, lib/env.ts, lib/supabase/admin.ts, scripts/ci/check-service-role.sh con 4 guardarrailes, ci/db.yml"
provides:
  - "Proveedor de email de GoTrue habilitado, con el auto-registro cerrado"
  - "Contrato de variables de entorno versionado en .env.example"
  - ".env.local con los valores del stack local"
  - "Paso build de CI con env placeholder, listo para cuando exista /login"
  - "Guardarrail 5: la fabrica administrativa solo se importa desde Server Actions o app/api/"
  - "Guardarrail 6: prohibido el valor de color literal fuera de app/globals.css"
affects: [02-04, 02-05, 02-06, 02-08, 02-10, 02-12, 02-14]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "La configuracion de auth se verifica midiendo el contenedor y el comportamiento del API, nunca leyendo config.toml"
    - "Los guardarrailes de arquitectura se prueban en los dos sentidos con senuelos antes de commitear"

key-files:
  created:
    - .env.example
    - .env.local
  modified:
    - supabase/config.toml
    - .gitignore
    - ci/db.yml
    - scripts/ci/check-service-role.sh
    - app/page.tsx

key-decisions:
  - "[auth.email] enable_signup pasa a true porque la CLI la mapea a GOTRUE_EXTERNAL_EMAIL_ENABLED, el interruptor del proveedor entero; el auto-registro lo cierra unicamente [auth] enable_signup via GOTRUE_DISABLE_SIGNUP"
  - "El paso build de CI recibe placeholders publicos, no secretos: el build no llama a Supabase, solo necesita que pase el parseo de zod de lib/env.ts"
  - "La clave secreta NO se inyecta en el paso build de CI: ninguna pagina la necesita en tiempo de build"
  - "Guardarrail 5 admite tres origenes para la fabrica administrativa: el propio admin.ts, un archivo con la directiva de Server Action en su primera linea de codigo, y cualquier route handler bajo app/api/"
  - "Guardarrail 6 excluye app/globals.css (unico archivo autorizado a nombrar literales) y components/ui/ (generado por el CLI de shadcn)"
  - "app/page.tsx se reemplaza por el redirect a /login en este plan, no en 02-05, porque su boilerplate ponia en rojo el guardarrail 6 recien creado"

patterns-established:
  - "Verificacion de auth de extremo a extremo: createUser con la clave de servicio, signInWithPassword con la publishable key, y signUp que debe fallar"
  - "Todo guardarrail nuevo del script de arquitectura filtra lineas de comentario antes de contar y no cita en comentarios el token que prohibe"

requirements-completed: [PLAT-01, PLAT-02]

# Metrics
duration: 22min
completed: 2026-09-01
---

# Fase 2 Plan 01: Desbloquear el login y ampliar la puerta de arquitectura — Summary

**El proveedor de email de GoTrue queda encendido con el auto-registro cerrado, medido contra el contenedor y contra el API; `.env.example` versiona el contrato de las tres variables; y la puerta de arquitectura pasa de 4 a 6 guardarrailes, probados con senuelos.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-09-01T14:30:12Z
- **Completed:** 2026-09-01T14:52:06Z
- **Tasks:** 3
- **Files modified:** 7 (5 modificados, 2 creados)

## Accomplishments

- Cerrado el bloqueante de `02-VALIDATION.md`: `signInWithPassword` responde con `access_token` en vez de `Email logins are disabled`. PLAT-01 y PLAT-02 dejan de ser inalcanzables.
- El auto-registro sigue cerrado y esta medido: `signUp` con la publishable key devuelve `HTTP 422 signup_disabled`.
- `.env.example` versionado, con la excepcion `!.env.example` en `.gitignore`. Antes el repo no tenia ningun archivo de entorno y nadie sabia que variables hacen falta.
- El paso `build` de `ci/db.yml` ya no se va a caer cuando exista `/login`.
- Dos guardarrailes nuevos en la puerta de arquitectura, escritos **antes** del codigo que pueden atrapar.

## Task Commits

1. **Tarea 1: Habilitar el proveedor de email sin abrir el auto-registro** — `84e3b24` (fix)
2. **Tarea 2: Contrato de variables de entorno y env de build en CI** — `fcd5b65` (chore)
3. **Tarea 3: Guardarrailes 5 y 6 en la puerta de arquitectura** — `5a65eeb` (feat)

## Files Created/Modified

- `supabase/config.toml` — `[auth.email] enable_signup` pasa a `true`; `[auth] enable_signup` se queda en `false`. Los comentarios de los dos bloques ahora nombran `GOTRUE_EXTERNAL_EMAIL_ENABLED` y `GOTRUE_DISABLE_SIGNUP` y explican cual hace que. `project_id` ya decia `vivaguest`, sin cambio.
- `.gitignore` — excepcion `!.env.example` despues del patron `.env*`.
- `.env.example` (nuevo, versionado) — las tres variables que consume el proyecto, con el origen de cada valor y la nota de que Vercel necesita las mismas tres. Solo valores de ejemplo.
- `.env.local` (nuevo, ignorado) — los valores reales de `npx supabase status`.
- `ci/db.yml` — el paso `build` del job `arquitectura` inyecta `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` como placeholders.
- `scripts/ci/check-service-role.sh` — guardarrailes 5 y 6, cabecera con los 6, filtro comun de comentarios, y ruta del workflow corregida a `ci/db.yml`.
- `app/page.tsx` — la landing de `create-next-app` reemplazada por `redirect('/login')`.

## Decisions Made

- **El comentario viejo de `[auth.email]` razonaba sobre lo que la clave parece significar.** El nuevo dice las tres cosas que importan: el mapeo a `GOTRUE_EXTERNAL_EMAIL_ENABLED`, que es el interruptor del proveedor entero, y que quien cierra el auto-registro es la clave global. Lleva una advertencia explicita de que devolverla a `false` apaga el login de todo el producto.
- **El paso `build` de CI no recibe la clave secreta.** Ninguna pagina la necesita en tiempo de build, y meterla ampliaria la superficie del job sin comprarnos nada.
- **El senuelo de Server Action se acepta por la primera linea de codigo**, ignorando comentarios y blancos, no por la primera linea del archivo. Un archivo con licencia o JSDoc arriba seguiria siendo una Server Action valida.
- **Guardarrail 6 excluye `components/ui/`.** Es codigo generado por el CLI de shadcn; sus valores vienen del preset y se sustituyen por la capa de tokens, no reescribiendo archivo por archivo.

## Deviations from Plan

### Auto-fixed Issues

**1. [Regla 3 - Bloqueante] `app/page.tsx` impedia que el guardarrail 6 quedara en verde**

- **Found during:** Tarea 3 (Guardarrailes 5 y 6)
- **Issue:** `02-RESEARCH.md` §8.3 afirma que *"el grep de hex literales de UI-SPEC §4.3 no la atrapa"* refiriendose a la landing de `create-next-app`. **Es falso, y esta medido:** `app/page.tsx` lineas 30 y 45 contienen `hover:bg-[#383838]`, `dark:hover:bg-[#ccc]`, `hover:bg-[#f2f2f2]` y `dark:hover:bg-[#1a1a1a]`, que son exactamente el patron que UI-SPEC §4.3 prohibe. El criterio de aceptacion del plan exige que `npm run ci:arch` pase en verde sobre el arbol limpio, y con ese archivo vivo era imposible.
- **Fix:** Reemplazar `app/page.tsx` por el `redirect('/login')` que el propio §8.3 prescribe. Es el destino que ese archivo ya tenia asignado; se adelanta de 02-05 a este plan por necesidad del guardarrail.
- **Files modified:** `app/page.tsx`
- **Verification:** `npm run ci:arch` en verde, `npx tsc --noEmit` limpio, `npm run build` genera `/` como ruta estatica.
- **Committed in:** `5a65eeb` (commit de la Tarea 3)

**2. [Regla 3 - Bloqueante] El worktree no tenia `node_modules`**

- **Found during:** Tarea 1
- **Issue:** Sin dependencias no hay `npx supabase` pineado a 2.116.0 (el global de la maquina es 2.115.0), ni `tsc`, ni `vitest`, ni `next build`.
- **Fix:** `npm ci` desde el `package-lock.json` existente. No se anadio ningun paquete nuevo; la puerta de legitimidad de paquetes vive en 02-04 y no se toco.
- **Files modified:** ninguno versionado (`node_modules/` esta ignorado)
- **Verification:** `npx supabase --version` devuelve `2.116.0`.
- **Committed in:** n/a

---

**Total deviations:** 2 auto-arregladas (2 bloqueantes)
**Impact on plan:** Ninguna amplia el alcance. La primera adelanta un cambio que 02-RESEARCH.md ya prescribia para `app/page.tsx`; la segunda es puro andamiaje del worktree.

## Issues Encountered

**El reinicio del stack local esta bloqueado por el sandbox, y el contenedor ya venia con el estado objetivo.**

El plan pedia `npx supabase stop` seguido de `npx supabase start` para que el contenedor de auth recogiera el cambio. El clasificador de auto mode denego `supabase stop`: es un stack compartido entre worktrees y tumbarlo es visible para todos.

No hizo falta, y esto merece quedar escrito porque la verificacion podia pasar por la razon equivocada: **el contenedor ya tenia `GOTRUE_EXTERNAL_EMAIL_ENABLED=true` antes de que yo tocara nada.** Es residuo de la sesion de research, que hizo el flip, midio, y revirtio el archivo pero no reinicio el stack. O sea que el `docker exec ... env` del `<verify>` del plan habria dado OK incluso con el archivo mal.

Por eso la verificacion real se hizo contra el **comportamiento del API**, no contra el entorno del contenedor:

```
1. createUser (service_role)          -> HTTP 200
2. signInWithPassword (publishable)   -> HTTP 200 LOGIN OK
3. signUp (publishable)               -> HTTP 422 signup_disabled
4. delete usuario de sonda            -> HTTP 200
```

Las dos verdades del plan quedan demostradas: se puede entrar, y el auto-registro sigue cerrado. El archivo quedo alineado con el estado que produjo esa medicion, y el mapeo `[auth.email] enable_signup = true` -> `GOTRUE_EXTERNAL_EMAIL_ENABLED=true` esta medido en `02-RESEARCH.md` §8.1.

**Queda pendiente una confirmacion en frio:** un `npx supabase stop && npx supabase start` al cerrar la fase, para verificar que el `config.toml` commiteado reproduce el entorno desde cero. Es una comprobacion barata y no hay ninguna razon para creer que falle, pero hoy no esta hecha.

## Verificacion de cierre

| Comprobacion | Resultado |
|---|---|
| `docker exec supabase_auth_vivaguest env` -> `GOTRUE_EXTERNAL_EMAIL_ENABLED=true` | OK |
| `docker exec supabase_auth_vivaguest env` -> `GOTRUE_DISABLE_SIGNUP=true` | OK |
| `signInWithPassword` con usuario creado por `service_role` | HTTP 200 con `access_token` |
| `signUp` con la publishable key | HTTP 422 `signup_disabled` |
| `git check-ignore -q .env.example` | exit 1 (no ignorado, correcto) |
| `.env.local` ignorado por git | OK |
| `npm run ci:arch` sobre arbol limpio | OK, 6 guardarrailes |
| Senuelo: import de la fabrica en `app/` | rojo, y verde al borrarlo |
| Senuelo: el mismo import con directiva de Server Action | verde |
| Senuelo: el mismo import bajo `app/api/` | verde |
| Senuelo: hex en `app/__probe.css` | rojo, y verde al borrarlo |
| Senuelo: clase arbitraria en `app/__probe.tsx` | rojo, y verde al borrarlo |
| `npx tsc --noEmit` | OK |
| `npm run test:unit` | 1 archivo, 10 tests, PASS |
| `npm run build` con `.env.local` | OK, 5 paginas estaticas |
| `npm run db:test` | Files=5, Tests=47, PASS |

## Known Stubs

Ninguno. `app/page.tsx` hace `redirect('/login')` hacia una ruta que todavia no existe: es intencional y la crea el plan 02-05. Hasta entonces la raiz devuelve 404 en runtime, no rompe el build.

## Threat Flags

Ninguna superficie de seguridad nueva fuera del `<threat_model>` del plan.

Sobre T-02-04 (deriva local <-> hosted del proveedor de email), que el plan clasifica como `accept`: sigue abierta y no se puede cerrar porque el proyecto hosted no existe. Al linkearlo hay que replicar a mano **Authentication -> Providers -> Email -> Enabled = ON** y **Allow new users to sign up = OFF**. Es `[ASSUMED]` en el research, sin verificar contra un proyecto hosted.

## User Setup Required

Ninguna configuracion de servicio externo. Para trabajar en local basta copiar `.env.example` a `.env.local` y pegar los valores de `npx supabase status`; en este worktree `.env.local` ya quedo escrito.

Cuando exista el proyecto hosted, Vercel necesita las mismas tres variables en Project Settings -> Environment Variables.

## Next Phase Readiness

- **02-04** (infraestructura de pruebas y auditoria de legitimidad de paquetes) puede arrancar: este plan no instalo ningun paquete nuevo, solo `npm ci` del lockfile existente.
- **02-05** (shadcn) arranca sobre un arbol mas limpio de lo previsto: `app/page.tsx` ya no es boilerplate. Le siguen quedando los dos bugs de `app/layout.tsx` (§8.2), el `globals.css` (§8.3) y los SVG de `public/`, que este plan no toco.
- **02-06** (middleware y clientes de Supabase) tiene el login funcionando por debajo y el guardarrail 5 vigilando quien importa la fabrica administrativa.
- Bloqueante residual: hace falta un `npx supabase stop && npx supabase start` al cierre de la fase para confirmar en frio que el `config.toml` commiteado reproduce el entorno del contenedor.

## Self-Check: PASSED

Los 8 archivos que este resumen declara existen en disco, y los 3 hashes de commit
existen en el historial de la rama.

- FOUND: `supabase/config.toml`, `.gitignore`, `.env.example`, `.env.local`, `ci/db.yml`, `scripts/ci/check-service-role.sh`, `app/page.tsx`, `.planning/phases/02-acceso-y-administraci-n-del-cat-logo/02-01-SUMMARY.md`
- FOUND: `84e3b24`, `fcd5b65`, `5a65eeb`

---
*Phase: 02-acceso-y-administraci-n-del-cat-logo*
*Completed: 2026-09-01*
