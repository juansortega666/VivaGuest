---
phase: 02-acceso-y-administraci-n-del-cat-logo
plan: 03
subsystem: domain
tags: [zod, vitest, ical, rfc5545, postgres-errors, gotrue, validacion]

# Grafo de dependencias
requires:
  - phase: 01-fundacion
    provides: "lib/domain/constants.ts y lib/domain/errors.ts con mapDbError, el patrón de constantes de constraint y la suite de vitest con TZ=UTC"
provides:
  - "esquemaBorrador y esquemaActivar: el contrato borrador → activo del formulario de apartamento"
  - "faltantesParaActivar: fuente única de la lista 'Para activar falta', del disabled del botón y del tooltip"
  - "mapDbError ampliado a los 11 constraints que el CRUD del catálogo puede disparar"
  - "mapAuthError: los 4 códigos de GoTrue medidos, traducidos al español"
  - "campoDeConstraint: enrutamiento de un error de base al campo del formulario para setError de RHF"
  - "desdoblar y previsualizarIcs: el escáner de diagnóstico de feeds iCal de APTO-12"
  - "7 fixtures .ics sintéticas, incluida una con la DESCRIPTION plegada de verdad a 75 octetos"
affects:
  - "02-06 (login): consume mapAuthError"
  - "02-12 (formulario de apartamento): consume faltantesParaActivar, esquemaBorrador, esquemaActivar y campoDeConstraint"
  - "02-14 (conectar calendario): consume previsualizarIcs"
  - "Fase 3 (pipeline iCal): decide si absorbe o borra lib/domain/ical-preview.ts"

# Seguimiento técnico
tech-stack:
  added: []
  patterns:
    - "Un esquema base laxo + dos refinamientos: is_active es un modo de submit, no un campo"
    - "Fuente única de la regla de activación, compartida por checklist, disabled y tooltip"
    - "Nombres de constraint como constantes exportadas, copiados literal de las migraciones"
    - "Dos mapas de error separados por servicio: Postgres y GoTrue no comparten espacio de códigos"
    - "Fechas de negocio como cadenas 'YYYY-MM-DD' comparadas lexicográficamente, sin objetos Date"

key-files:
  created:
    - lib/domain/apartamento.schema.ts
    - lib/domain/apartamento.schema.test.ts
    - lib/domain/ical-preview.ts
    - lib/domain/ical-preview.test.ts
    - lib/domain/__fixtures__/ical/ (7 fixtures)
  modified:
    - lib/domain/constants.ts
    - lib/domain/errors.ts
    - lib/domain/errors.test.ts

key-decisions:
  - "La puerta de contacto_externo para unidades informativas es SOLO de UI: props_active_requires_owner es verdadero por vacuidad cuando gestion_vivaguest es false, así que ningún 23514 la respalda. Queda declarado en el código."
  - "Para unidades gestionadas la UI exige responsable_id aunque props_active_requires_owner acepte contacto_externo como alternativa. La divergencia es deliberada (APTO-08)."
  - "Se mantiene el copy de user_banned y se corrige su justificación: GoTrue emite el código ANTES de verificar la contraseña, así que el mensaje SÍ enumera cuentas. Se acepta el riesgo por el tamaño y la naturaleza interna del producto."
  - "El escáner de iCal es propio y no node-ical: elimina por construcción el off-by-one de DTEND y no adelanta una decisión de dependencia que le toca a la Fase 3."
  - "La clasificación reserva/bloqueo usa la whitelist positiva por DESCRIPTION, nunca SUMMARY."
  - "Un string vacío en un campo de dinero se normaliza a null, no a 0, para que la lista de faltantes no se desincronice de lo que el admin ve en pantalla."

patterns-established:
  - "Test cruzado de coherencia: una tabla de escenarios comprueba que faltantesParaActivar y esquemaActivar.safeParse coincidan en el veredicto, lo que hace imposible duplicar la regla en un if del componente"
  - "Fixtures .ics generadas con plegado RFC 5545 real y CRLF, no aproximado"
  - "Cabecera de costura en los módulos que una fase posterior va a subsumir"

requirements-completed: [APTO-02, APTO-08, APTO-09, APTO-12]

# Métricas
duration: 13min
completed: 2026-09-01
---

# Fase 2 Plan 03: Lógica de dominio del catálogo Summary

**Contrato borrador → activo en Zod con fuente única de faltantes, mapeo de los 11 constraints del catálogo más los 4 códigos de GoTrue, y escáner de diagnóstico de feeds iCal sin un solo objeto `Date`.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-09-01T09:43:00-05:00
- **Completed:** 2026-09-01T09:56:00-05:00
- **Tasks:** 3 (los 3 en TDD, 6 commits)
- **Files modified:** 14 (11 creados, 3 modificados)

## Accomplishments

- **El contrato de activación no se puede desincronizar de la pantalla.** `faltantesParaActivar` es la única implementación de la regla, y un test de tabla comprueba que su veredicto coincide con `esquemaActivar.safeParse` en 9 escenarios. Los tres CHECK de activación de `properties` ya no se pueden disparar desde la UI.
- **Ningún error crudo llega a la pantalla.** Los 11 constraints nuevos tienen constante exportada y mensaje en español, verificados uno a uno contra `supabase/migrations/`. `mapAuthError` cubre los 4 códigos de GoTrue y nunca devuelve `e.message`, que viene en inglés.
- **El criterio 6 del ROADMAP es verificable hoy**, sin el `.ics` real que bloquea la Fase 3: 23 tests contra 7 fixtures sintéticas, incluida una con la `DESCRIPTION` plegada de verdad a 75 octetos que parte el código `HMYXB825YD` entre dos líneas físicas.
- **El off-by-one de `DTEND` es imposible por construcción:** 0 ocurrencias de `new Date` en `ical-preview.ts`, ni siquiera dentro de comentarios.

## Task Commits

1. **Tarea 1: Contrato borrador → activo en Zod** — `0a69237` (test, RED) → `7efa3a4` (feat, GREEN)
2. **Tarea 2: Mapeo de errores de base y de autenticación** — `d9b943d` (test, RED) → `345f656` (feat, GREEN)
3. **Tarea 3: Escáner de diagnóstico de iCal y sus fixtures** — `f0f38e5` (test + fixtures, RED) → `5ca1f30` (feat, GREEN)

Ningún paso de REFACTOR fue necesario: los tres módulos quedaron limpios en el GREEN.

## Files Created/Modified

- `lib/domain/apartamento.schema.ts` — `apartamentoBase` (12 campos), `esquemaBorrador`, `esquemaActivar` y `faltantesParaActivar`. Exporta también `ApartamentoInput` / `ApartamentoOutput` y el tipo `Faltante`.
- `lib/domain/apartamento.schema.test.ts` — 39 tests, incluido el cruzado de coherencia lista ↔ esquema.
- `lib/domain/constants.ts` — 11 constantes de constraint nuevas (7 `CHK_`, 4 `IDX_`), cada una con el comentario de qué impone.
- `lib/domain/errors.ts` — `MENSAJES_UNIQUE` y `MENSAJES_CHECK` ampliados, `CAMPOS_POR_CONSTRAINT` nuevo, `mapAuthError` y `campoDeConstraint`. La firma y el `switch` de `mapDbError` quedaron intactos.
- `lib/domain/errors.test.ts` — 26 tests nuevos; los 11 de la Fase 1 siguen ahí sin tocar.
- `lib/domain/ical-preview.ts` — `desdoblar` (RFC 5545 §3.1) y `previsualizarIcs`, con la cabecera de costura con la Fase 3.
- `lib/domain/ical-preview.test.ts` — 23 tests con `hoyIso` fijo.
- `lib/domain/__fixtures__/ical/` — `feliz.ics`, `folded.ics`, `html-200.html`, `vacio.ics`, `solo-bloqueos.ics`, `solo-pasado.ics`, `fin-de-ano.ics`.

## Decisions Made

**1. `folded.ics` se generó con un script, no a mano.** El fixture tenía que tener el plegado a 75 octetos exacto y que el código de reserva quedara realmente partido. El generador falla si `HMYXB825YD` aparece entero en cualquier línea o si alguna línea supera los 75 octetos. Resultado medido:

```
[75] DESCRIPTION:Phone Number (Last 4 Digits): 4821\nEmail: guest@example.com\nR
[75]  eservation URL: https://www.airbnb.com/hosting/reservations/details/HMYXB8
[5]   25YD
```

El fixture usa CRLF, que es lo que sirve Airbnb, así que también ejercita la normalización de `desdoblar()`.

**2. `campoDeConstraint` deja fuera dos constraints a propósito.** `profiles_deactivation_coherent` y `cl_unmanaged_is_inert` no tienen un input en pantalla al que anclarse: sus errores van a toast, que es el enrutamiento correcto según UI-SPEC §9.4. Un mapeo a un campo inexistente haría que RHF marcara un campo que no existe y el usuario no vería nada.

**3. El test del cruce de año usa `hoyIso = '2025-12-30'`.** El resto de la suite usa `'2026-09-01'` fijo. Un checkout el `2026-01-03` es pasado respecto de septiembre de 2026, así que con el `hoyIso` común el caso no probaría nada. Sigue siendo determinista. Se añadió además el caso complementario: con `hoyIso = '2026-09-01'` esa misma fixture da `proximoCheckout: null`.

**4. `props_rates_nonneg` se refleja en el esquema base, no solo en el de activar.** Una tarifa negativa es inválida incluso en un borrador; no tiene sentido dejar guardar un dato que la base va a rechazar.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] El string vacío de un campo de dinero se volvía `0` en vez de "ausente"**

- **Found during:** Tarea 1
- **Issue:** El código de referencia del research §5.1 define `cop = z.coerce.number().int().nonnegative()`. Un input numérico vacío llega desde react-hook-form como `''` (o `NaN` con `valueAsNumber`), y `z.coerce.number()` convierte `''` en `0`. Con eso, `faltantesParaActivar` habría dicho que la tarifa está llena mientras el admin ve el campo vacío en pantalla, y `esquemaActivar` habría dejado activar una unidad con "tarifa 0". Es exactamente la desincronización UI ↔ contrato que la Tarea 1 existe para impedir.
- **Fix:** `vacioANulo` como `preprocess` de los dos campos de dinero (normaliza `''` y `NaN` a `null`) y el helper `ausente()` en `faltantesParaActivar`, que trata `''` y espacios como ausencia pero deja pasar `0` y `false` como valores presentes.
- **Files modified:** `lib/domain/apartamento.schema.ts`
- **Verification:** 3 tests dedicados (`trata el string vacío de un campo de dinero como ausencia, no como cero`, `trata el string vacío de un campo de dinero como faltante`, `acepta cero como valor presente: 0 no es un faltante`) más el escenario `gestionada con tarifa vacía` de la tabla cruzada.
- **Committed in:** `7efa3a4`

**2. [Rule 2 - Missing Critical] `hora_limite` aceptaba horas imposibles**

- **Found during:** Tarea 1
- **Issue:** La regex del research (`/^\d{2}:\d{2}$/`) acepta `24:00` y `99:99`. La columna `properties.hora_limite` es de tipo `time`, así que esos valores no darían un 23514 traducible sino un error de parseo crudo de Postgres, que es justo lo que UI-SPEC §9.4 prohíbe que llegue a la pantalla.
- **Fix:** Regex `/^([01]\d|2[0-3]):[0-5]\d$/`, estrictamente más restrictiva. Todos los casos del `behavior` del plan siguen pasando.
- **Files modified:** `lib/domain/apartamento.schema.ts`
- **Verification:** Test `rechaza una hora con formato HH:MM pero fuera de rango`.
- **Committed in:** `7efa3a4`

**3. [Rule 3 - Blocking] `node_modules` no existía en el worktree**

- **Found during:** antes de la Tarea 1
- **Issue:** El worktree se creó sin dependencias instaladas; `npm run test:unit` no podía correr.
- **Fix:** `npm ci`, que restaura exactamente lo pineado en `package-lock.json`. **No se instaló ningún paquete nuevo** ni se modificó `package.json` o el lockfile.
- **Files modified:** ninguno (`node_modules` está en `.gitignore`)
- **Verification:** `git status --short` limpio; `npm run test:unit` corre.
- **Committed in:** n/a (sin cambios versionados)

---

**Total deviations:** 3 auto-corregidas (2 de funcionalidad crítica faltante, 1 bloqueante)
**Impact on plan:** Las dos primeras refuerzan justo el invariante que el plan declara como su razón de ser (que la UI no deje llegar a la base nada que la base vaya a rechazar). La tercera es de entorno. Sin ampliación de alcance.

## Issues Encountered

- **El plan habla de "10 constraints" y salieron 11 constantes.** La tabla del research §5.4 agrupa `mic_prop_uniq` / `mic_global_uniq` en una sola fila porque comparten mensaje, pero son dos índices parciales distintos y cada uno necesita su constante. Los dos comparten el mensaje `Ya existe un faltante con ese nombre.`
- **Comprobación cruzada obligatoria del plan: superada.** Los 15 nombres de `constants.ts` (los 4 de la Fase 1 más los 11 nuevos) aparecen literalmente en `supabase/migrations/`, contrastados con `grep -rhoE "constraint [a-z_]+|create unique index [a-z_]+"`. Ningún nombre inventado.

## Threat Model

Las cinco disposiciones del `<threat_model>` del plan quedaron cubiertas:

| Threat ID | Disposición | Dónde quedó |
|---|---|---|
| T-02-09 | mitigate | `mapDbError` y `mapAuthError` nunca devuelven `e.message` salvo el `P0001` de la Fase 1. Test explícito de que el nombre del constraint no viaja al mensaje |
| T-02-10 | accept | Comentario del caso `user_banned` en `errors.ts`, con la corrección de la razón falsa del UI-SPEC §12.1 |
| T-02-11 | mitigate | `previsualizarIcs` recorre líneas una vez; las regex están ancladas y sin alternancia anidada |
| T-02-12 | mitigate | Whitelist positiva por `DESCRIPTION` y sniff de `BEGIN:VCALENDAR`. Test que comprueba que HTML-200 y feed vacío dan estados distintos |
| T-02-13 | mitigate | `esquemaActivar` + los CHECK de la base. La única puerta sin respaldo (`contacto_externo`) queda declarada en el código y probada |

Sin `threat_flags` nuevos: los tres módulos son puros, sin red, sin I/O y sin acceso a la base.

## Known Stubs

Ninguno. Los tres módulos están completos y probados. El `fetch` real del feed, la pantalla de conexión y el enrutamiento del error a la UI son de los planes 02-06, 02-12 y 02-14, que consumen lo que este plan produce.

## Verification

```
npm run test:unit   → 3 archivos, 99 tests, todos en verde (TZ=UTC)
npx tsc --noEmit    → sin errores
npm run lint        → sin errores
npm run ci:arch     → check-service-role: OK
grep -v '^\s*//' lib/domain/ical-preview.ts | grep -c 'new Date'  → 0
```

## User Setup Required

Ninguna. Este plan no toca servicios externos, ni la base, ni `supabase/config.toml`.

## Next Phase Readiness

- **02-06 (login)** puede importar `mapAuthError` tal cual. El copy de los 4 códigos ya coincide con UI-SPEC §15.
- **02-12 (formulario)** puede montar `zodResolver(esquemaBorrador)` y alimentar la barra de acciones con `faltantesParaActivar(watch([...]))`. Los `campo` de los `Faltante` coinciden con las claves del formulario, así que el `scrollIntoView` + `focus()` de UI-SPEC §8.2 sale directo. El error de base va a `setError` vía `campoDeConstraint`.
- **02-14 (conectar calendario)** puede llamar `previsualizarIcs(cuerpo, hoyIso)` y mapear su resultado a los estados 4, 5 y 6 de UI-SPEC §10.3. Lo que falta ahí es el `fetch` con `AbortSignal.timeout(10_000)` y `redirect: 'manual'`, la clasificación de estado 7 por código HTTP, y la escritura en `property_secrets` / `calendar_feeds`.
- **Fase 3:** `lib/domain/ical-preview.ts` lleva la cabecera de costura. Es un solo archivo que absorber o borrar, y su divergencia con el pipeline real es deliberada.
- **Sigue abierto** el `checkpoint:human-verify` que el research §4.4 pide al final de la fase: pegar un link real de Airbnb y contrastar el número contra el calendario. Una fixture sintética demuestra que el escáner hace lo que dice, no que el `.ics` de Airbnb de 2026 tenga la forma que asumimos.

## Self-Check: PASSED

- Los 14 archivos declarados existen en disco (7 en `lib/domain/`, 7 fixtures en `lib/domain/__fixtures__/ical/`).
- Los 6 commits de tarea existen en el historial: `0a69237`, `7efa3a4`, `d9b943d`, `345f656`, `f0f38e5`, `5ca1f30`.
- `git diff --name-status` contra la base devuelve exactamente los 14 archivos del `files_modified` del plan, sin borrados.
- Sin cambios en `STATE.md`, `ROADMAP.md`, la base, `supabase/config.toml` ni en archivos de los planes 02-01 y 02-02.

---
*Phase: 02-acceso-y-administraci-n-del-cat-logo*
*Completed: 2026-09-01*
