---
phase: 01-fundaci-n-schema-y-rls
plan: 09
subsystem: infra
tags: [typescript, supabase, typegen, ci, github-actions, pgtap, validacion, checkpoint]

# Dependency graph
requires:
  - "01-01: el andamiaje de Next.js, `lib/supabase/admin.ts` con su TODO, `scripts/ci/check-service-role.sh` y `.github/workflows/db.yml` en rojo a propósito"
  - "01-02: los 5 archivos pgTAP de Wave 0, escritos antes del schema"
  - "01-03 a 01-06: las 10 migraciones y los 6 seeds que dan el schema que se tipa"
  - "01-07: la matriz de grants y las 37 policies que hacen que `db advisors --type security` salga limpio"
  - "01-08: los 6 RPC, que son las funciones que `gen types` emite bajo `Functions`"
provides:
  - "lib/database.types.ts — 1409 líneas, 22 tablas, 6 enums, 6 RPC más `today_bog()`. El contrato tipado de toda la UI de las Fases 2 a 9"
  - "lib/supabase/admin.ts tipado con `createClient<Database>`, sin el TODO del plan 01-01"
  - "Puerta de drift verificada en los dos sentidos: sale 0 sincronizada y 1 con el schema desincronizado"
  - "Las 8 puertas de CI en verde en local, comando por comando, en el mismo orden del workflow"
  - "01-VALIDATION.md firmado: Per-Task Verification Map de 21 tareas, los 5 criterios del ROADMAP con archivo y número de aserción, `nyquist_compliant: true`"
  - "Medición que corrige el workflow: `db advisors --type security` sale sin ningún hallazgo; los 14 WARN son de categoría PERFORMANCE"
affects:
  - "Fase 2 en adelante: toda migración nueva obliga a correr `npm run db:types` y commitear el diff; si no, la puerta `typegen drift` pone el PR en rojo"
  - "Fase 2 en adelante: el diff de `lib/database.types.ts` en el PR es la revisión del cambio de contrato, la señal más barata de 'esta migración rompe la UI'"
  - "Cierre de la Fase 1: quedan 3 verificaciones que exigen un proyecto Supabase hosted que todavía no existe (A1, A3 y las puertas en el runner)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "El contrato tipado se commitea, no se genera en build: `tsc` y el editor lo necesitan sin Docker, y Vercel construye sin acceso a la base"
    - "La puerta de drift usa `diff -u` contra un temporal y no `git diff --exit-code`: el segundo pasa en CI con el árbol limpio pero falla en local con cambios pendientes"
    - "Un comentario que afirma una cifra medida envejece: se corrige con la medición nueva y se deja escrito el método, no solo el número"

key-files:
  created:
    - "lib/database.types.ts"
    - ".planning/phases/01-fundaci-n-schema-y-rls/01-09-SUMMARY.md"
  modified:
    - "lib/supabase/admin.ts"
    - ".github/workflows/db.yml"
    - ".planning/phases/01-fundaci-n-schema-y-rls/01-VALIDATION.md"
  deleted: []

key-decisions:
  - "El umbral del advisor se queda en `--fail-on error` aunque hoy `--type security` salga sin ningún hallazgo y `--fail-on warn` pasaría: los lints de seguridad que solo existen en hosted llegan como WARN y no se arreglan con una migración. Subirlo es decisión de la fase que linkee el proyecto"
  - "No se hace `git push` ni se abre el PR: es una acción con impacto real fuera del worktree y el orquestador es dueño del merge. Se escala en el checkpoint junto con A1 y A3"
  - "Las 47 aserciones se aceptan como cumplimiento del contrato de 45: los planes 01-07 y 01-08 añadieron 2 guardarraíles, es un superconjunto y no una desviación"
  - "`gen types` corre con `--schema public`: el esquema `private` y sus 6 helpers definer no son parte del contrato del cliente y no aparecen en el archivo"

patterns-established:
  - "Puerta de drift de tipos: probar el gate en los dos sentidos antes de confiar en él, con una tabla temporal en la base y no perturbando el archivo"
  - "Sign-off de validación con medición, no con afirmación: cada checkbox del contrato cita el número que lo respalda"

requirements-completed: [PLAT-03, PLAT-05, PLAT-06, ASEO-07, FIN-01]

# Metrics
duration: 26min
completed: 2026-08-31
---

# Phase 1 Plan 09: Cierre de la fase — tipos, CI y sign-off Summary

**El contrato tipado del schema queda commiteado y blindado contra drift, las 8 puertas de CI salen en verde en local sobre una base levantada en frío (`Files=5, Tests=47, Result: PASS`), y `01-VALIDATION.md` queda firmado con los 5 criterios del ROADMAP mapeados a aserción concreta. La fase queda cerrada del lado local; lo único abierto son los tres ítems que exigen un proyecto Supabase hosted que todavía no existe.**

## Performance

- **Duration:** ~26 min
- **Completed:** 2026-08-31T23:01Z
- **Tasks:** 2 de 3 (la tercera es un checkpoint humano bloqueante, alcanzado y reportado, no ejecutado)
- **Archivos:** 1 creado, 3 modificados

## Accomplishments

- **`lib/database.types.ts` generado y commiteado.** 1409 líneas: 22 tablas con `Row`/`Insert`/`Update`/`Relationships`, 0 vistas, 7 funciones (los 6 RPC del plan 01-08 más `today_bog()`), 6 enums y `CompositeTypes` vacío. Los `Args`/`Returns` salen tipados: `reveal_access_code: { Args: { p_cleaning: string }; Returns: { codigo_acceso: string; notas_acceso: string; tipo_cerradura: string }[] }`.
- **Los dos mapeos que eran criterio de aceptación, verificados contra la base y no contra el archivo.** Las 5 columnas monetarias (`properties.tarifa_huesped`, `properties.pago_aseador`, `cleanings.tarifa_huesped`, `cleanings.pago_aseador`, `expenses.monto`) son `bigint` en `information_schema` y salen como `number` en los tipos. Si alguna hubiera quedado en `numeric`, `supabase-js` la devolvería como `string` y el tipo lo delataría. El esquema `private` no aparece en el archivo.
- **La puerta de drift probada en los dos sentidos, no solo en el feliz.** Con el archivo sincronizado `npm run db:types:check` sale 0. Se creó `public.zz_drift_probe` en la base, el gate salió **1** con el diff exacto de la tabla que sobraba, y tras el `drop table` volvió a 0. Es la diferencia entre un gate verificado y un gate que nadie ha visto fallar.
- **Las 8 puertas de CI en verde en local**, ejecutadas en el mismo orden del workflow sobre un `supabase db start` en frío (10 migraciones, 6 seeds):

  | Job | Puerta | Resultado |
  |---|---|---|
  | `database` | `db lint --local` | `No schema errors found` |
  | `database` | `db advisors --type security --fail-on error` | `No issues found` |
  | `database` | `test db --local` | `Files=5, Tests=47, Result: PASS` |
  | `database` | `db:types:check` | 0 sincronizada, 1 con drift |
  | `arquitectura` | `check-service-role.sh` | `check-service-role: OK` |
  | `arquitectura` | `tsc --noEmit` | 0, sin salida |
  | `arquitectura` | `test:unit` | `10 passed (10)` |
  | `arquitectura` | `build` | `Compiled successfully in 4.7s` |

- **La continuidad de muestreo que exige el sign-off, medida y no asumida.** Se recorrieron los 9 planes parseando los bloques `<task>`: **21 tareas, las 21 con al menos un `<automated>`**. Racha máxima de tareas consecutivas sin verificación automatizada: **0**. El contrato pedía que no hubiera 3.
- **`01-VALIDATION.md` firmado** con el `Per-Task Verification Map` completo (una fila por las 21 tareas más la fila estructural de Wave 0), los 5 criterios del ROADMAP con archivo y número de aserción, los 10 ítems de Wave 0 marcados, y `nyquist_compliant: true` / `wave_0_complete: true`.

## Task Commits

1. **Task 1: generar, tipar y blindar contra drift `lib/database.types.ts`** — `ce95b9e` (feat)
2. **Task 2: poner en verde las puertas de CI y firmar el contrato de validación** — `0d9f48f` (docs)
3. **Task 3: crear y linkear los proyectos Supabase dev y prod** — checkpoint humano bloqueante, **no ejecutado**

## Una cifra del workflow que estaba mal, corregida con medición

El comentario del paso `db advisors` de `.github/workflows/db.yml` decía:

> *El umbral es error, nunca WARN: este diseño de policies emite 3 WARN multiple_permissive_policies inherentes sobre cleanings, profiles y properties, así que bajar el umbral a WARN dejaría el job rojo siempre.*

Dos cosas falsas en una frase. Medido sobre el schema completo:

- Son **14** WARN `multiple_permissive_policies`, no 3. Están sobre `checklist_tasks`, `cleaning_checklist_items`, `cleaning_photos` (INSERT y SELECT), `cleanings`, `damages`, `expenses`, `missing_item_catalog`, `missing_item_lines`, `missing_item_reports`, `profiles`, `properties`, `property_rooms` y `room_types`. El plan 01-07 ya lo había contado bien; el comentario del workflow no se actualizó.
- Los 14 son de categoría **`PERFORMANCE`**, así que **no aparecen bajo `--type security`**, que hoy sale con `No issues found`. Es decir: el motivo que el comentario daba para no poder subir el umbral a `warn` no existe.

**Decisión:** el umbral se queda igual, en `--fail-on error`, pero por la razón correcta y ahora escrita en el workflow: los lints de seguridad que solo existen en hosted (configuración de `[auth]`, extensiones en `public`) llegan como `WARN` y no se arreglan con una migración; no se quiere que el job de PR se ponga rojo por un hallazgo de plataforma. Subirlo a `warn` es una decisión de la fase que linkee el proyecto, con datos de hosted a la vista.

Se aprovechó para dejar escrito en el mismo comentario el punto ciego medido del advisor: entre las migraciones 07 y 08 reportó **20** tablas con `rls_disabled_in_public` y no 22, porque `property_secrets` y `storage_deletion_queue` no tienen grants. Ese hueco lo cubren los guardarraíles de pgTAP, no el advisor.

## La suite son 47 aserciones, no las 45 del contrato

El `must_have` del plan pedía `45 aserciones en 5 archivos`. La corrida da `Files=5, Tests=47`. El desglose por archivo es `plan(16) + plan(11) + plan(10) + plan(5) + plan(5) = 47`. Las 2 de diferencia:

- El plan 01-07 partió el guardarraíl 4 en **4** (tablas) y **4b** (secuencias), al medir que el `pg_default_acl` de la CLI 2.116.0 cubre también las secuencias.
- El plan 01-08 añadió el guardarraíl **9**: ninguna función de `public` ni de `private` es ejecutable por `anon`. Es el sustituto del default privilege que Postgres no permite (hallazgo 5 de `deferred-items.md`).

Es un superconjunto estricto del contrato de Wave 0: ninguna aserción original se reescribió ni se borró. Se acepta como cumplimiento y queda documentado en `01-VALIDATION.md`.

## Estado de A1 y A3

**Ninguno de los dos está resuelto. Los dos siguen abiertos y son el contenido del checkpoint.**

No se pudo avanzar ni un paso sobre ellos porque **los proyectos Supabase dev y prod no existen**. Verificado: `supabase/.temp/` solo contiene `cli-latest`, no hay `project-ref`, y no hay `.env.local`. Sin proyecto no hay `link`, sin `link` no hay `db push` ni `config push`, y sin eso las dos preguntas no tienen respuesta.

Lo que sí quedó medido en local, para que la comparación con hosted sea inmediata:

- **A1.** Las 3 policies existen en local con los nombres exactos `evidencia_admin_all` (ALL), `evidencia_cleaner_insert` (INSERT) y `evidencia_cleaner_select` (SELECT), y el bucket es `evidencia | public=false | file_size_limit=10485760`. Eso es lo que debe reproducirse en hosted. Si allá salen **0 filas**, el bucket queda sin autorización y, como `authenticated` conserva el `arwdDxtm` de fábrica sobre `storage.objects`, cualquier usuario autenticado podría leer la evidencia fotográfica de cualquier apartamento. Es el riesgo abierto más severo de la fase.
- **A3.** `supabase/config.toml` tiene `jwt_expiry = 1800`, `enable_signup = false` en `[auth]`, `[auth.email]` y `[auth.sms]`, y `minimum_password_length = 12`. Lo que no se sabe es cuáles de esas claves viajan con `config push`. Si no viaja `enable_signup`, el `config.toml` solo protege el contenedor local, que es la peor de las trampas: parece configurado y el auto-registro queda abierto en dev y prod.

## Deviations from Plan

### Auto-fixed Issues

**1. [Regla 1 — Dato incorrecto en un gate] El comentario del advisor en `db.yml` afirmaba 3 WARN de tipo security**

- **Encontrado durante:** Task 2, al correr `db advisors --type security --fail-on error` y obtener `No issues found` en vez de los 3 WARN esperados.
- **Problema:** el comentario justificaba el umbral `error` con una premisa falsa. Un mantenedor que lo leyera concluiría que `--fail-on warn` es imposible, cuando hoy pasaría. Un comentario que miente sobre por qué existe un gate es peor que no tenerlo.
- **Arreglo:** se sustituyó por la medición real (14 WARN, categoría PERFORMANCE, invisibles bajo `--type security`), se escribió el motivo real por el que el umbral se queda en `error`, y se añadió el punto ciego medido del advisor sobre tablas sin grants.
- **Archivos:** `.github/workflows/db.yml`
- **Commit:** `0d9f48f`

**2. [Regla 1 — Comentario obsoleto] El encabezado del job `database` seguía diciendo que el job está en rojo a propósito**

- **Encontrado durante:** Task 2.
- **Problema:** era cierto desde el plan 01-01 y dejó de serlo con este plan. Un comentario que declara rojo un job verde invita a que alguien ignore un rojo real.
- **Arreglo:** reescrito en pasado, con la medición de la corrida en frío que lo pone en verde.
- **Archivos:** `.github/workflows/db.yml`
- **Commit:** `0d9f48f`

### Desviaciones de alcance, no auto-arregladas

**3. No se hizo `git push` ni se abrió el PR (paso 3 de la Task 2)**

- **Qué pedía el plan:** abrir el PR de la rama `gsd/phase-1-fundaci-n-schema-y-rls` y confirmar que los dos jobs pasan en el runner de GitHub, con `gh run list --branch … --json conclusion` dando `success`.
- **Por qué no se hizo:** un `push` es una acción con impacto real fuera del worktree. La rama `gsd/phase-1-fundaci-n-schema-y-rls` no existe ni en local ni en `origin` (`origin/main` está en `25e6976`, el commit anterior a la fase, y no hay ninguna corrida de workflow registrada); crearla desde una rama de agente sería usurpar el merge que le corresponde al orquestador.
- **Qué se hizo en su lugar:** ejecutar las 8 puertas en local, comando por comando, en el mismo orden del workflow y con la misma versión de CLI que la action tiene pineada (2.116.0, verificado con `npx supabase --version`). Y validar el workflow estructuralmente: YAML parseado, los dos jobs con sus 4 pasos cada uno, `supabase db start` y no `supabase start`, y el pin `version: 2.116.0` presente.
- **Qué queda sin cubrir:** los modos de fallo específicos del runner (Docker en el runner, permisos, caché de npm, `actions/checkout@v5` y `actions/setup-node@v5`). Está registrado como el tercer ítem de `Manual-Only Verifications` en `01-VALIDATION.md` y va en el checkpoint.

**4. La suite reporta 47 aserciones y el `must_have` del plan pedía 45**

- Documentado arriba. Superconjunto estricto, ninguna aserción original tocada. No se ajustó el plan hacia abajo ni se ocultó la diferencia.

## Deferred Items — estado al cierre de la fase

Los 8 hallazgos de `deferred-items.md` más los dos apartados sin numerar, con su dueño. **Esto es lo que tiene que sobrevivir a la Fase 1.**

### Cerrados durante la fase

| # | Hallazgo | Cómo se cerró |
|---|---|---|
| 1 | `project_id` de `config.toml` era el nombre de un worktree | Corregido a `vivaguest`. Verificado: `project_id = "vivaguest"` |
| 3 | Los default privileges de `public` abiertos para tablas futuras | Migración 07: `alter default privileges` revocando tablas **y secuencias** para `anon` y `authenticated`. Guardarraíles 4 y 4b lo vigilan |
| 4 | `calendar_feeds.url`: el plan 01-03 y la suite pgTAP se contradecían | Resuelto en el plan 01-04 a favor del argumento de seguridad: la tabla **no** lleva `url` (verificado: 16 columnas, ninguna `url`) y el fixture del test se ajustó con el motivo escrito al lado |
| 6 | `results_eq` sobre una función inexistente abortaba el archivo pgTAP | Cerrado solo, como estaba previsto, en cuanto el plan 01-08 creó `reveal_access_code()`. `00_rls_aseos` corre hoy 16/16 |

### Abiertos, con dueño

| # | Hallazgo | Dueño | Por qué sigue abierto |
|---|---|---|---|
| 2 | `anon` conserva `TRUNCATE` sobre `storage.objects`, y `TRUNCATE` ignora la RLS. `authenticated` conserva además `DELETE` y `UPDATE` | **Checkpoint humano / dashboard** | Medido de nuevo hoy: `has_table_privilege('anon','storage.objects','truncate') = t` y `has_table_privilege('authenticated','storage.objects','delete') = t`. El revoke **no es ejecutable desde una migración**: el grantor es `supabase_storage_admin` y `postgres` no puede revocar ni hacer `set role` a él. Explotabilidad práctica baja (PostgREST no expone el esquema `storage` ni emite `TRUNCATE`), y la inmutabilidad de la evidencia se apoya en la **ausencia de policies de UPDATE/DELETE**, no en el revoke. O se acepta como riesgo residual documentado, o se ejecuta desde el dashboard con un rol con privilegios suficientes |
| 5 | `alter default privileges` no puede quitarle `EXECUTE` a PUBLIC sobre funciones futuras en PG 17.6 | **Toda migración de las Fases 2 a 9 que cree funciones en `public`** | No es un pendiente que se cierre: es un contrato permanente. Cada función nueva necesita su propio par `revoke all … from public, anon` + `grant execute … to authenticated` al lado de la definición. Sin ellas, un RPC `SECURITY DEFINER` sería invocable por cualquiera con la publishable key. Lo vigila el guardarraíl 9 de `02_guardarrailes.test.sql`, que es la red de seguridad, no el arreglo |
| 7 | Una foto puede colgar de un `checklist_item` de otro aseo: nada valida que `cleaning_photos.checklist_item_id` pertenezca al mismo aseo que `cleaning_photos.cleaning_id` | **Fase 6** | No es expresable con un `CHECK`, necesita subconsulta y por tanto un trigger `BEFORE INSERT`. Los otros tres punteros (`damage_id`, `expense_id`, `missing_report_id`) todavía no tienen ninguna ruta de escritura, así que el trigger se escribe una sola vez junto con `report_damage()`, `report_expense()` y `report_missing_items()`. Impacto hoy: filas incoherentes que ensucian la vista de detalle y el conteo de evidencia, no un salto del guard de `finish_cleaning()` |
| 8 | Objetos de Storage huérfanos: nada ata un objeto subido a una fila de `cleaning_photos` | **Fase 9 (RET-06)** | No es cerrable con una FK: `storage.objects` es de `supabase_storage_admin` y la subida la hace la Storage API, no un `INSERT` que se pueda envolver en la misma transacción. Un objeto sin fila queda fuera de `storage_deletion_queue` y por tanto fuera de la purga de retención: se factura para siempre y conserva el dato sensible. Necesita un job de reconciliación que liste el bucket y encole todo objeto sin fila con más de N horas |
| — | Ejecución paralela sobre la base local compartida: `config.toml` tiene un único `project_id` versionado, así que todos los worktrees resuelven al mismo contenedor y un `db reset` desde uno recrea la base que otro está usando en vivo | **Planificador de cualquier fase futura con waves paralelas que toquen la base** | En la Fase 1 no hubo colisión porque las waves 5 a 8 eran de un solo plan. Para waves paralelas: o se serializa el acceso, o cada worktree necesita su propio `project_id` y bloque de puertos |
| — | Regla de planificación: un comentario que cita el token prohibido hace fallar el grep que lo prohíbe | **Planificador, transversal** | Pasó dos veces en esta fase (`service_role` en el 01-01, `gen_random_uuid` en el 01-05). Vale volverlo regla explícita al planear guardarraíles por grep |

### Nuevos, abiertos por este plan

| Hallazgo | Dueño | Detalle |
|---|---|---|
| El workflow `db` nunca se ha ejecutado en un runner de GitHub Actions | **Checkpoint humano** | Las 8 puertas están verificadas en local con la misma versión de CLI, pero los modos de fallo del runner (Docker, permisos, caché de npm, las versiones `@v5` de las actions) siguen sin ejercerse. `origin/main` está en el commit anterior a la fase y no hay ninguna corrida registrada |
| A1: las policies de `storage.objects` en hosted | **Checkpoint humano** | Detallado arriba. Es el riesgo abierto más severo de la fase |
| A3: qué claves de `[auth]` sincroniza `config push` | **Checkpoint humano** | Detallado arriba |

## Threat Flags

Este plan no introduce superficie de seguridad nueva: no añade endpoints, ni rutas de autenticación, ni acceso a archivos, ni cambios de schema. Toca un archivo generado, un cliente de servidor ya existente, un workflow de CI y un documento de planificación.

Del `<threat_model>` del plan, el estado de las 5 amenazas:

| Threat ID | Estado |
|---|---|
| T-01-58 (clave secreta con prefijo `NEXT_PUBLIC_` o fuera de `admin.ts`) | **Mitigada.** `check-service-role.sh` sale OK; `admin.ts` sigue siendo el único que nombra la clave y conserva `import 'server-only'`; `.env.local` está cubierto por `.env*` en `.gitignore` (verificado con `git check-ignore -v`) |
| T-01-59 (`database.types.ts` desincronizado en silencio) | **Mitigada.** Puerta de drift por `diff -u` contra temporal, probada fallando y pasando |
| T-01-60 (cerrar la fase con los supuestos de hosted abiertos y sin registro) | **Mitigada.** A1 y A3 están escritos en este SUMMARY, en `01-VALIDATION.md` §Manual-Only Verifications y en el checkpoint |
| T-01-56 (bucket `evidencia` sin autorización en hosted) | **ABIERTA.** Requiere el proyecto dev linkeado |
| T-01-57 (`enable_signup` sigue en `true` en hosted) | **ABIERTA.** Requiere el proyecto dev linkeado |

## Known Stubs

Ninguno. `lib/database.types.ts` es generado en su totalidad desde el schema real, `lib/supabase/admin.ts` construye un cliente funcional, y no hay componentes de UI en esta fase.

## Self-Check: PASSED

Archivos verificados en disco: `lib/database.types.ts` (42.975 bytes, 1409 líneas), `lib/supabase/admin.ts`, `.github/workflows/db.yml`, `01-VALIDATION.md`, `01-09-SUMMARY.md`.
Commits verificados en el historial: `ce95b9e`, `0d9f48f`.
Aserciones ejecutadas al cierre: `Files=5, Tests=47, Result: PASS`, `check-service-role: OK`, `tsc --noEmit` en 0, `test:unit` 10/10, `build` correcto, `db:types:check` en 0.
