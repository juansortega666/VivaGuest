---
phase: 02-acceso-y-administraci-n-del-cat-logo
plan: 02
subsystem: domain
tags: [typescript, vitest, tdd, intl, routing, timezone, cop]

# Dependency graph
requires:
  - phase: 01
    provides: "lib/database.types.ts generado (fila `properties`), lib/domain/constants.ts con TZ_BOGOTA, vitest.config.ts con include lib/**/*.test.ts y TZ=UTC"
provides:
  - "resolverRedireccion(pathname, rol): tabla de ruteo por rol, pura, sin dependencias de Next"
  - "estadoDeApartamento(): unica derivacion de los 4 estados de apartamento"
  - "normalizar(): normalizacion NFD para el buscador insensible a tildes"
  - "formatCOP(): pesos colombianos enteros, sin decimales nunca"
  - "formatFechaBog() y formatHoraLimite(): fecha de negocio y hora limite, sin off-by-one de zona"
affects: [02-06 middleware, 02-09 formulario de apartamento, 02-11 tabla de apartamentos, 02-12 login]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Toda la logica pura vive en lib/, porque vitest.config.ts solo recoge lib/**/*.test.ts"
    - "Tests de ruteo como tabla de casos (it.each), no como bloques sueltos"
    - "Instancias de Intl construidas a nivel de modulo, nunca por llamada"
    - "Fechas de negocio como string 'YYYY-MM-DD'; nunca new Date(string)"

key-files:
  created:
    - lib/auth/routing.ts
    - lib/auth/routing.test.ts
    - lib/domain/properties.ts
    - lib/domain/properties.test.ts
    - lib/domain/money.ts
    - lib/domain/money.test.ts
    - lib/domain/dates.ts
    - lib/domain/dates.test.ts
  modified: []

key-decisions:
  - "EstadoApartamento es un objeto { clave, etiqueta }, no un string suelto: el plan lo exige como discriminante tipado para 02-11, y la etiqueta en espanol deja de estar duplicada en cada componente"
  - "estadoDeApartamento acepta un Pick de 5 columnas (tipo exportado EntradaEstadoApartamento), no la fila entera: sirve tambien para el estado en vivo del formulario"
  - "formatFechaBog ancla el formateo a UTC (Date.UTC para construir, timeZone UTC para formatear) en vez de depender de la zona del proceso; asi el resultado es identico en Vercel, en CI y en Bogota"
  - "normalizar usa /\\p{Diacritic}/gu tal como manda UI-SPEC 7.2; verificado que tsc pasa con target ES2017"
  - "formatHoraLimite es recorte de string y no Intl: es-CO formatearia 'a. m.'/'p. m.', que es justo lo que una hora limite operativa no quiere"

patterns-established:
  - "Ruteo != autorizacion: routing.ts lo declara en su cabecera y no consulta nada; la RLS es la unica autorizacion"
  - "Una sola derivacion de estado en el repo; duplicar el if en un componente es como la UI se desincroniza de los CHECK"
  - "El orden de evaluacion de estadoDeApartamento esta documentado como parte de la regla, no como detalle"

requirements-completed: [PLAT-07, APTO-05, APTO-11]

# Metrics
duration: 12min
completed: 2026-09-01
---

# Fase 02 Plan 02: Logica pura del ruteo y del dominio — Summary

**Cuatro modulos puros con 37 tests nuevos: tabla de ruteo por rol, derivacion de los 4 estados de apartamento, normalizacion NFD del buscador y formato de dinero/fecha/hora sin off-by-one de zona, todo bajo `lib/` y en verde antes de que exista una sola pantalla.**

## Performance

- **Duration:** ~12 min
- **Tasks:** 3/3
- **Files created:** 8
- **Tests:** 49 en total en el repo (37 nuevos de este plan), 5 archivos, 287 ms

## Accomplishments

- La tabla de decision del ruteo se prueba en milisegundos, sin navegador y sin servidor, y esta escrita como tabla `it.each` para que la Fase 4 anada filas y no bloques.
- Los 4 estados de apartamento salen de una sola funcion con la frontera Incompleta / Inactiva probada con las tres columnas completas: un apartamento gestionado, apagado y bien configurado ya no se lee como si le faltaran datos.
- El off-by-one de zona horaria tiene un test que lo atrapa dos veces: con `TZ=UTC` y volviendo a formatear tras cambiar `process.env.TZ` a `America/Bogota` en caliente.
- Nada de esto toco `vitest.config.ts`, la base, `supabase/config.toml` ni archivos de los planes 02-01 / 02-03.

## Task Commits

1. **Tarea 1: Tabla de ruteo por rol** — `103aa4f` (test, RED) y `623e1e9` (feat, GREEN)
2. **Tarea 2: Estado de apartamento y normalizacion** — `3ddee4b` (test, RED) y `1ad2da8` (feat, GREEN)
3. **Tarea 3: Dinero, fecha y hora** — `0125a3a` (test, RED) y `9562ae3` (feat, GREEN)

Ningun paso de REFACTOR produjo cambios, asi que no hay commit `refactor`.

## Files Created/Modified

- `lib/auth/routing.ts` — `resolverRedireccion(pathname, rol)`, `RAIZ` y `PUBLICAS`. Sin un solo import de `next/*` ni de `@supabase/*`. Cabecera que declara que esto es ruteo y no autorizacion, y que el rol tiene que venir de `app_metadata.role`.
- `lib/auth/routing.test.ts` — 13 filas de tabla mas 2 casos de borde (subruta publica, prefijo parecido). 15 assertions.
- `lib/domain/properties.ts` — `estadoDeApartamento()`, `normalizar()`, tipos `EstadoApartamento`, `ClaveEstadoApartamento` y `EntradaEstadoApartamento`.
- `lib/domain/properties.test.ts` — 9 casos de estado (incluida la frontera y el `0` que no es ausencia) y 3 de normalizacion.
- `lib/domain/money.ts` — `formatCOP()` con un unico `Intl.NumberFormat` a nivel de modulo.
- `lib/domain/money.test.ts` — 5 casos; normaliza los espacios duros que mete `Intl` antes de comparar.
- `lib/domain/dates.ts` — `formatFechaBog()` y `formatHoraLimite()`, con la regla transversal de fechas escrita en la cabecera.
- `lib/domain/dates.test.ts` — 7 casos, dos de ellos cambiando la zona del proceso en caliente.

## Decisiones Tomadas

- **`EstadoApartamento` como objeto y no como union de strings.** El research §Code Examples lo mostraba como `type EstadoApartamento = 'activa' | ...`, pero el bloque `<interfaces>` del plan lo especifica como `{ clave, etiqueta }`. Manda el plan: es el contrato que consume 02-11, y asi la etiqueta en espanol vive en un solo sitio. La union de claves sigue exportada como `ClaveEstadoApartamento`.
- **El formateo de fecha se ancla a UTC en vez de a la zona local.** Un `Intl.DateTimeFormat` sin `timeZone` congela la zona del proceso en el momento del import, y el `Date` se construye en cada llamada: si algo cambiara la zona entre medias, las dos mitades dejarian de casar. Construir con `Date.UTC` y formatear con `timeZone: 'UTC'` elimina la dependencia entera. `TZ_BOGOTA` sigue siendo la unica constante de zona de negocio; ese `'UTC'` es un ancla de formateo, y esta explicado asi en el codigo.
- **Se exporta `EntradaEstadoApartamento`.** El plan pedia que la funcion aceptara un `Pick`; darle nombre evita que 02-09 y 02-11 reescriban el `Pick` de cinco columnas cada uno.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] El dia de la semana esperado en `formatFechaBog('2026-09-04')` estaba mal**

- **Found during:** Tarea 3
- **Issue:** El plan, UI-SPEC §8.4 y el research §7.1 dan como salida esperada `"jue, 4 de septiembre"`. El 4 de septiembre de 2026 cae **viernes**. Escribir el test contra el valor del documento habria producido un test rojo con codigo correcto, y la "correccion" natural habria sido romper la funcion hasta que devolviera el dia equivocado.
- **Fix:** El test asserta `"vie, 4 de septiembre"`, medido contra `Intl` antes de escribirlo. El formato (dia de la semana abreviado sin punto, `d de mes`) es exactamente el que especifica el documento; lo unico que cambia es el dia, que era un dato erroneo del documento.
- **Files modified:** `lib/domain/dates.test.ts`
- **Verification:** `TZ=UTC node -e "...Intl.DateTimeFormat('es-CO',{weekday:'short',day:'numeric',month:'long'}).format(new Date(2026,8,4))"` devuelve `vie, 4 de septiembre`.
- **Committed in:** `0125a3a`

**2. [Rule 3 - Blocking] `node_modules` no existia en el worktree**

- **Found during:** Tarea 1 (antes del primer RED)
- **Issue:** Sin dependencias instaladas no corre `npm run test:unit`.
- **Fix:** `npm ci` contra el `package-lock.json` ya commiteado. No se instalo ningun paquete nuevo ni se toco `package.json`.
- **Files modified:** Ninguno versionado.
- **Verification:** `npm run test:unit` corre; `npm ci` salio con codigo 0.
- **Committed in:** N/A (no produce cambios en el repo)

**3. [Rule 2 - Correctness] Casos anadidos que el plan no pedia**

- **Found during:** Tareas 1, 2 y 3
- **Issue:** Tres huecos con consecuencia real: (a) `/loginfalso` habria pasado como ruta publica con un `startsWith` ingenuo; (b) `pago_aseador = 0` habria caido en `incompleta` con una comprobacion por falsedad en vez de por `== null`, y el CHECK `props_rates_nonneg` permite el cero explicitamente; (c) el test con `TZ=UTC` solo no atrapa la implementacion ingenua `new Date(iso)` sin `timeZone`, que unicamente falla corriendo en Bogota.
- **Fix:** Un caso por hueco: prefijo parecido en `routing.test.ts`, `tarifa/pago = 0` en `properties.test.ts`, y dos casos que cambian `process.env.TZ` a `America/Bogota` en `dates.test.ts`.
- **Files modified:** `lib/auth/routing.test.ts`, `lib/domain/properties.test.ts`, `lib/domain/dates.test.ts`
- **Verification:** 49 tests en verde; el caso de Bogota falla con la implementacion ingenua (comprobado a mano con `node`).
- **Committed in:** `103aa4f`, `3ddee4b`, `0125a3a`

---

**Total deviations:** 3 auto-fixed (1x Rule 1, 1x Rule 2, 1x Rule 3)
**Impact on plan:** Ninguno en alcance. La unica correccion de contenido es el dia de la semana del ejemplo del UI-SPEC, que es un dato erroneo del documento y conviene corregir tambien alli si ese ejemplo se vuelve a citar.

## Issues Encountered

- **`\p{Diacritic}` con `target: ES2017`.** Sospecha de que `tsc` rechazara las property escapes de Unicode por el target. Medido: `npx tsc --noEmit` pasa sin queja, asi que se conserva la regex exacta que manda UI-SPEC §7.2 en vez de bajar al rango `̀-ͯ`.
- **Espacios duros de `Intl`.** `formatCOP(120000)` devuelve `$` + NBSP + `120.000`. Comparar contra un string escrito a mano falla por un caracter invisible; el test normaliza `\s` antes de comparar y ademas asserta explicitamente la ausencia de decimales.

## Known Stubs

Ninguno. Los cuatro modulos estan completos y consumidos por tests reales.

## Threat Flags

Ninguna superficie nueva. Los tres riesgos del `<threat_model>` quedan como se planearon: `resolverRedireccion` no autoriza ni consulta nada (T-02-06), el origen del rol es responsabilidad de 02-06 (T-02-07), y `normalizar()` es un `normalize` mas una clase de caracteres, sin alternancia anidada (T-02-08).

## Verificacion

- `npm run test:unit` — 5 archivos, 49 tests, todo en verde
- `npx tsc --noEmit` — sin salida
- `npm run ci:arch` — `check-service-role: OK`
- `npm run lint` — sin salida
- `grep` — ningun `new Date('...')` fuera de los comentarios que lo prohiben; ningun import de `next/*`, `@supabase/*`, React o lucide en los cuatro modulos

## Next Phase Readiness

- **02-06 (middleware)** tiene `resolverRedireccion` lista; le queda el cableado y leer el rol de `app_metadata.role` del `getUser()` que el middleware ya hace.
- **02-11 (tabla de apartamentos)** tiene el discriminante de estado y `normalizar()`; le queda mapear clave a icono lucide y a token de color, que es lo que este plan deliberadamente no decide.
- **02-09 (formulario)** puede llamar `estadoDeApartamento` con el estado en vivo del formulario gracias al `Pick`.
- Sin bloqueadores.

---
*Phase: 02-acceso-y-administraci-n-del-cat-logo*
*Completed: 2026-09-01*
