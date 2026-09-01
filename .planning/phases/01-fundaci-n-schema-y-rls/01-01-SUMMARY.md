---
phase: 01-fundaci-n-schema-y-rls
plan: 01
subsystem: infra
tags: [nextjs, typescript, tailwind, supabase, postgres, zod, vitest, github-actions, ci]

# Dependency graph
requires: []
provides:
  - "Proyecto Next.js 15.5.24 ejecutable, con webpack y sin Turbopack en ningún script"
  - "Versiones pineadas: next exacto, react/react-dom 19.2.8, typescript ^5.9, supabase CLI 2.116.0, vitest 4.1.11"
  - "supabase/config.toml endurecido y `supabase db start` funcional sobre Postgres 17.6"
  - "Estructura supabase/migrations, supabase/seeds, supabase/tests lista para los planes 02-09"
  - "Scripts npm db:start, db:reset, db:test, db:lint, db:advisors, db:types, db:types:check, test:unit, ci:arch"
  - "lib/domain/constants.ts: TZ_BOGOTA, estados y tipos de aseo, nombres de índice y de CHECK"
  - "lib/domain/errors.ts: mapDbError() traduce 23505 + nombre de índice al mensaje en español de ASEO-07"
  - "lib/supabase/admin.ts: único lector de la clave de servicio, con import 'server-only'"
  - "lib/env.ts: parseo zod de process.env con superficies pública y de servidor separadas"
  - "scripts/ci/check-service-role.sh: 4 invariantes estructurales, verificadas en ambas direcciones"
  - ".github/workflows/db.yml: las 4 puertas de base de datos + el job de arquitectura"
affects:
  - "01-02 a 01-09: todas las migraciones, seeds y tests pgTAP van en la estructura creada aquí"
  - "01-09: genera lib/database.types.ts y pone en verde el job database"
  - "Fase 2 (UI): shadcn se instala allí, no aquí"
  - "Fase 5 (PWA): depende de que el build siga siendo webpack, no Turbopack"

# Tech tracking
tech-stack:
  added:
    - "next@15.5.24 (pin exacto, sin caret)"
    - "react@19.2.8 / react-dom@19.2.8"
    - "typescript@^5.9 (explícito: el latest de npm es 7.0.2)"
    - "tailwindcss@4.3.3 + @tailwindcss/postcss@4.3.3 (config en CSS, sin tailwind.config.js)"
    - "@supabase/supabase-js@2.112.4, @supabase/ssr@0.12.5"
    - "zod@4.5.4, server-only"
    - "supabase CLI 2.116.0 (devDependency)"
    - "vitest@4.1.11"
  patterns:
    - "Aislamiento de la clave de servicio por grep de CI, no solo por 'server-only'"
    - "El nombre de la variable secreta vive únicamente en lib/supabase/admin.ts; lib/env.ts lo recibe como parámetro"
    - "Mensajes de negocio mapeados en la app desde SQLSTATE + nombre de índice, no en el RPC"
    - "Nombres de índice y de CHECK como constantes compartidas entre SQL y TypeScript"
    - "vitest corre con TZ=UTC para que los bugs de zona horaria se manifiesten"
    - "Puertas de CI en dos jobs paralelos: base de datos y arquitectura"

key-files:
  created:
    - "package.json"
    - "supabase/config.toml"
    - "lib/env.ts"
    - "lib/supabase/admin.ts"
    - "lib/domain/constants.ts"
    - "lib/domain/errors.ts"
    - "lib/domain/errors.test.ts"
    - "vitest.config.ts"
    - "scripts/ci/check-service-role.sh"
    - ".github/workflows/db.yml"
  modified:
    - "package.json (scripts sin --turbopack, scripts db:*)"

key-decisions:
  - "Scaffolding en directorio hermano vg-stage + rsync: create-next-app sale con exit 1 en este repo porque .planning/ y CLAUDE.md cuentan como conflicto"
  - "--turbopack eliminado de dev y build a mano: create-next-app lo escribe siempre y no existe --no-turbopack"
  - "typescript pineado en ^5.9 explícito porque el latest de npm ya es 7.0.2"
  - "El nombre SUPABASE_SECRET_KEY se mantiene fuera de lib/env.ts para que el grep de CI pueda ser exacto"
  - "mapDbError se implementa en la app y no en el RPC: el pipeline iCal de la Fase 3 inserta por otra ruta"
  - "P0001 propaga el mensaje crudo del RPC; 42501 devuelve un mensaje que no revela el recurso"
  - "db advisors corre con umbral error: el diseño de policies emite 3 WARN multiple_permissive_policies inherentes"
  - "Vulnerabilidad de postcss heredada de next: no se corrige porque el fix es next@16 y rompe el pin"
  - "shadcn queda fuera de esta fase por decisión del research (§4.6)"

patterns-established:
  - "Test de arquitectura: invariantes estructurales verificadas por grep, con prueba negativa que planta la fuga y confirma el fallo"
  - "Comentario de una línea con la razón encima de cada cambio en config.toml"
  - "Los mensajes de UI nunca son el texto crudo de Postgres, salvo P0001"

requirements-completed: [ASEO-07, PLAT-05]

# Metrics
duration: 25min
completed: 2026-08-31
---

# Phase 1 Plan 01: Scaffolding, Supabase y puertas de CI Summary

**Next.js 15.5.24 sobre webpack con versiones pineadas, Postgres 17.6 local vía `supabase db start` con `config.toml` endurecido, y las dos puertas de CI que no dependen del schema: `mapDbError` traduciendo el 23505 de ASEO-07 y el grep que aísla la clave de servicio.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-08-31T20:03:00Z
- **Completed:** 2026-08-31T20:28:23Z
- **Tasks:** 3 de 3
- **Files modified:** 24 archivos versionados (sin contar `package-lock.json` ni `public/`)

## Accomplishments

- Repo ejecutable: `npm run build` sale 0 y su salida no menciona Turbopack en ningún punto.
- `npx supabase db start` levanta un único contenedor con PostgreSQL 17.6 y sale 0, con `config.toml` endurecido en las 5 claves que exige §10 del research.
- `mapDbError()` con 10 casos en verde, incluido el que traduce `23505` + `cleanings_one_active_per_property_date` a *"Ya existe un aseo activo para ese apartamento en esa fecha."* (ASEO-07).
- `scripts/ci/check-service-role.sh` verificado en las dos direcciones: sale 0 sobre el repo limpio y sale 1 con una fuga plantada en `app/`, con un `NEXT_PUBLIC_*SECRET`, y con un `current_date` en un seed.
- `.github/workflows/db.yml` con las 4 puertas de base de datos y el job de arquitectura corriendo en paralelo.

## Task Commits

1. **Task 1: Andamiar Next.js 15.5.24 sin Turbopack y con las versiones pineadas** - `eb16ffa` (feat)
2. **Task 2: Inicializar Supabase, endurecer config.toml y montar lib/ y los scripts de base** - `8d8f8a6` (feat)
3. **Task 3 (RED): test rojo de mapDbError** - `6887895` (test)
4. **Task 3 (GREEN): implementación de mapDbError** - `69f1c0e` (feat)
5. **Task 3 (CI): test de arquitectura y workflow db** - `86ea563` (ci)

No hubo commit de REFACTOR: la implementación quedó limpia en el gate verde y tocarla habría sido cambio sin motivo.

## Files Created/Modified

- `package.json` — pines exactos, scripts `dev`/`build` sin `--turbopack`, scripts `db:*`, `test:unit` y `ci:arch`.
- `supabase/config.toml` — `enable_signup = false` en `[auth]` y `[auth.email]`, `jwt_expiry = 1800`, `minimum_password_length = 12`, `sql_paths = ["./seeds/*.sql"]`, y `[api] schemas` intacto con un comentario que prohíbe agregar `private`.
- `supabase/migrations/`, `supabase/seeds/`, `supabase/tests/` — estructura con `.gitkeep` para que sobreviva al checkout de CI.
- `lib/env.ts` — `publicEnv()` con zod y `readServerSecret(name)` genérico que rechaza nombres con prefijo `NEXT_PUBLIC_`.
- `lib/supabase/admin.ts` — `import 'server-only'` en la primera línea, `createAdminClient()` con `persistSession: false` y `autoRefreshToken: false`. Único archivo que nombra la clave de servicio.
- `lib/domain/constants.ts` — `TZ_BOGOTA`, `CLEANING_STATES`, `CLEANING_TYPES`, nombres de los dos índices únicos, del índice de nombre de apartamento y del CHECK de gestión externa.
- `lib/domain/errors.ts` — `mapDbError()`: 23505, 23514, 23503, 23502, 42501, PGRST301, P0001, PGRST116 y genérico.
- `lib/domain/errors.test.ts` — 10 casos.
- `vitest.config.ts` — entorno node, `include: lib/**/*.test.ts`, `env: { TZ: 'UTC' }`.
- `scripts/ci/check-service-role.sh` — 4 comprobaciones con `set -euo pipefail`.
- `.github/workflows/db.yml` — jobs `database` y `arquitectura`.
- `app/`, `public/`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `.gitignore`, `README.md` — boilerplate de `create-next-app` sin tocar.

## Decisions Made

- **El nombre de la variable secreta no vive en `lib/env.ts`.** La primera versión de `env.ts` exportaba un `serverEnv()` que nombraba `SUPABASE_SECRET_KEY` y el propio grep de arquitectura la rechazó, que es exactamente lo que debía pasar. La solución no fue añadir una excepción al grep sino invertir la dependencia: `env.ts` expone `readServerSecret(name)` genérico y el literal vive solo en `admin.ts`. El grep se queda siendo exacto, sin lista de excepciones que erosionar.
- **`P0001` propaga el mensaje crudo.** Es el errcode con el que los RPC `SECURITY DEFINER` de los planes 05-08 van a levantar mensajes de negocio ya redactados en español. Es la única excepción a "nunca mostrar texto de Postgres".
- **`42501` no revela el recurso.** Decirle a un aseador que existe la tabla `property_secrets` ya es información de más; el test lo asegura explícitamente.
- **`.gitkeep` en `supabase/migrations/`, `seeds/` y `tests/`.** Sin ellos los directorios no sobreviven al checkout de CI y `supabase db start` no encontraría dónde buscar.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] El nombre del secreto en `lib/env.ts` rompía el aislamiento de T-01-01**

- **Found during:** Task 3 (primera corrida de `check-service-role.sh`)
- **Issue:** El plan pedía que `lib/env.ts` exportara "dos objetos separados: uno público y uno de servidor". La implementación literal nombra `SUPABASE_SECRET_KEY` en `env.ts`, lo que convierte el grep de arquitectura en algo que necesita dos excepciones en vez de una y debilita la mitigación de T-01-01 (un segundo archivo autorizado a nombrar la clave es un segundo lugar donde puede filtrarse).
- **Fix:** `env.ts` expone `readServerSecret(name: string)` genérico, que además rechaza en runtime cualquier nombre con prefijo `NEXT_PUBLIC_`. El literal `SUPABASE_SECRET_KEY` vive únicamente en `lib/supabase/admin.ts`.
- **Files modified:** `lib/env.ts`, `lib/supabase/admin.ts`
- **Verification:** `bash scripts/ci/check-service-role.sh` sale 0; con `app/__leak_probe.ts` plantado sale 1.
- **Committed in:** `86ea563` (y la versión inicial en `8d8f8a6`)

**2. [Rule 1 - Bug] Un comentario de `lib/env.ts` contenía el literal `sb_secret_` y disparaba el propio grep**

- **Found during:** Task 3
- **Issue:** El comentario de cabecera citaba la nomenclatura nueva de claves de Supabase incluyendo el prefijo literal `sb_secret_`, que es uno de los tres patrones que busca el grep. Falso positivo, pero un falso positivo que deja el CI rojo.
- **Fix:** Comentario reformulado sin el literal. No se relajó el patrón del grep.
- **Files modified:** `lib/env.ts`
- **Verification:** `check-service-role.sh` sale 0.
- **Committed in:** `86ea563`

**3. [Rule 1 - Bug] Un comentario de `db.yml` contenía la cadena `--fail-on warn` y rompía la aserción del propio plan**

- **Found during:** Task 3
- **Issue:** El comentario que explica *por qué* no se usa ese umbral contenía la cadena prohibida, y la verificación automatizada del plan (`if(y.includes('--fail-on warn')) throw`) no distingue comentario de comando.
- **Fix:** Comentario reformulado a "El umbral es error, nunca WARN". La explicación se conserva íntegra.
- **Files modified:** `.github/workflows/db.yml`
- **Verification:** La aserción del plan pasa; añadí además una comprobación de que el YAML no contiene `supabase start` a secas.
- **Committed in:** `86ea563`

**4. [Rule 2 - Missing Critical] `.gitkeep` en los directorios SQL vacíos**

- **Found during:** Task 2
- **Issue:** Git no versiona directorios vacíos. Sin `.gitkeep`, `supabase/migrations/`, `seeds/` y `tests/` no existen tras el checkout de CI, y el criterio de aceptación "existen los directorios" solo se cumpliría en local.
- **Fix:** `.gitkeep` en los tres.
- **Files modified:** `supabase/migrations/.gitkeep`, `supabase/seeds/.gitkeep`, `supabase/tests/.gitkeep`
- **Verification:** `git ls-files supabase` los muestra.
- **Committed in:** `8d8f8a6`
- **Nota para el plan 01-02:** al añadir la primera migración real, borrar `supabase/migrations/.gitkeep`. El CLI emite `Skipping migration .gitkeep... (file name must match pattern "<timestamp>_name.sql")` en cada arranque mientras exista.

**5. [Rule 2 - Missing Critical] El paquete quedaba nombrado `vg-stage`**

- **Found during:** Task 1
- **Issue:** `create-next-app` toma el nombre del directorio de staging, así que `package.json` decía `"name": "vg-stage"`.
- **Fix:** Renombrado a `vivaguest`.
- **Files modified:** `package.json`
- **Verification:** `npm run build` sale 0 con el encabezado `vivaguest@0.1.0`.
- **Committed in:** `eb16ffa`

---

**Total deviations:** 5 auto-corregidas (2 bugs, 3 funcionalidad crítica faltante)
**Impact on plan:** Ninguna amplía el alcance. Las tres primeras son consecuencia directa de que los propios guardarraíles del plan funcionan: el grep de arquitectura y las aserciones automatizadas atraparon el código que las violaba, incluido el código que el plan pedía escribir. Se corrigió el código, no el guardarraíl.

## Issues Encountered

- **`npx supabase db start` tardó ~9 minutos en la primera corrida** porque descargó la imagen `gotrue:v2.196.0`. Salió con exit 0. Con imágenes cacheadas el research mide 18 s; en CI la primera corrida costará lo mismo que aquí.
- **`npm audit` reporta 2 vulnerabilidades (1 high, 1 moderate) en `postcss`**, transitivas de `next@15.5.24`. `npm audit fix --force` instalaría `next@16.3.4` y rompería el pin que sostiene la decisión de webpack de la Fase 5. **Deuda aceptada y registrada**: el vector es build-time sobre CSS controlado por nosotros, no hay entrada de atacante. Se revisa cuando la Fase 5 evalúe migrar a Next 16 con serwist#360 cerrado.
- **`vitest` emite un aviso de Vite** sobre `configLoader: 'native'` y sintaxis ESM en `vitest.config.ts`. Es ruido, no error; los tests pasan. Se resolvería renombrando a `.mts` o poniendo `"type": "module"`, y ninguna de las dos vale la pena hoy: la primera desalinea el nombre del artefacto que declara el plan y la segunda toca la resolución de módulos de todo el proyecto.
- **El job `database` de `db.yml` queda rojo.** Es el estado esperado y está documentado en el propio workflow: no existen migraciones, ni tests pgTAP, ni `lib/database.types.ts`. Lo pone en verde el plan 01-09.

## Known Stubs

Ninguno. `lib/supabase/admin.ts` lleva un `// TODO(plan 09)` para tipar `createClient` con el genérico `Database`, que es una dependencia declarada del plan 01-09, no un stub: la función construye y devuelve un cliente real.

## Threat Flags

Ninguna superficie nueva fuera del `<threat_model>` del plan. Las 7 amenazas registradas (T-01-01 a T-01-06 y T-01-SC) quedan mitigadas o con su mitigación en el lugar previsto:

| Amenaza | Estado |
|---|---|
| T-01-01 (clave de servicio en el bundle) | Mitigada y **verificada en ambas direcciones** con fuga plantada |
| T-01-02 (auto-registro) | Mitigada: `enable_signup = false` en `[auth]` y `[auth.email]` |
| T-01-03 (ventana del token) | Mitigada parcialmente: `jwt_expiry = 1800`. La revocación real es el predicado `is_active` del plan 01-07 |
| T-01-04 (`private` en PostgREST) | Mitigada: `[api] schemas` sin `private`, con comentario que lo prohíbe. Verificación pgTAP en el plan 01-09 |
| T-01-05 (`current_date`) | Mitigada: grep bloqueante, verificado con un seed plantado |
| T-01-SC (instalaciones npm) | Sin desviación: los 12 paquetes instalados son exactamente los auditados en el research |
| T-01-06 (salto de major) | Mitigada: `next` exacto, `typescript@^5.9`, aserción sobre `package.json` |

## User Setup Required

Ninguna para esta fase. Dos avisos para cuando toque:

1. Los ajustes de `[auth]` de `config.toml` son **local-first**. Hay que replicarlos en el dashboard de los proyectos dev y prod, o solo protegen el entorno local. `supabase config push` sincroniza las claves soportadas; verificar cuáles en el primer `link`.
2. `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_SECRET_KEY` todavía no se consumen en ninguna ruta ejecutada, así que no bloquean nada hoy. Se necesitan en la Fase 2.

## Next Phase Readiness

- El plan 01-02 puede escribir su primera migración en `supabase/migrations/` y correr `npm run db:reset` de inmediato. La base local ya está levantada con Postgres 17.6.
- El plan 01-09 hereda `npm run db:types` y `npm run db:types:check` con el mismo `diff` contra temporal que usa el workflow, así que local y CI no pueden divergir.
- Los nombres de índice y de CHECK que ya consume `mapDbError` (`cleanings_one_active_per_property_date`, `cleanings_one_live_per_reservation`, `properties_nombre_uniq`, `cl_unmanaged_is_inert`) son un contrato: si una migración los nombra distinto, los tests de `errors.test.ts` seguirán en verde pero el mensaje de ASEO-07 no aparecerá en producción. El plan 01-09 debería añadir una aserción pgTAP de que esos cuatro nombres existen en el catálogo.

---
*Phase: 01-fundaci-n-schema-y-rls*
*Completed: 2026-08-31*

## Self-Check: PASSED

- 11 archivos declarados verificados en disco.
- 6 commits verificados en el log: eb16ffa, 8d8f8a6, 6887895, 69f1c0e, 86ea563, 773279d.
- Arbol de trabajo limpio.
