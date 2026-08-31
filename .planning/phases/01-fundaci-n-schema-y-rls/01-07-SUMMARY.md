---
phase: 01-fundaci-n-schema-y-rls
plan: 07
subsystem: database
tags: [postgres, supabase, rls, grants, seguridad, policies, security-definer, default-privileges]

# Dependency graph
requires:
  - "01-03: profiles, properties, property_secrets y el resto del catálogo; public.today_bog()"
  - "01-04: cleanings, access_code_reads y las 10 tablas operativas"
  - "01-05: cleaning_state_transitions y la máquina de estados"
  - "01-06: push_subscriptions, notifications, storage_deletion_queue y el seed"
provides:
  - "supabase/migrations/*_07_grants.sql — la matriz de privilegios de public, tabla por tabla"
  - "supabase/migrations/*_08_rls_policies.sql — esquema private, 6 helpers definer, RLS en las 22 tablas y 37 policies"
  - "private.is_admin() / private.is_active_cleaner() — autorización leída de la base, nunca del JWT"
  - "private.my_cleaning_ids() / my_writable_cleaning_ids() — ventana de lectura (-30 días) y de escritura (solo en curso)"
  - "private.my_property_ids() — ventana hoy-1..hoy+7; es la que cierra la fuga por embed de PostgREST"
  - "private.my_unlockable_property_ids() — ventana hoy..hoy+1; la consume reveal_access_code() en el plan 01-08"
  - "property_secrets y storage_deletion_queue sin ningún grant para authenticated: SELECT directo da 42501, no 0 filas"
  - "cleanings con SELECT y cero DML para authenticated, ni siquiera para el admin"
  - "alter default privileges revocando tablas y secuencias para anon Y authenticated: las Fases 2-9 ya no reabren el agujero"
  - "Medición de que el equivalente para funciones NO es posible en PG 17.6, con el contrato que lo sustituye"
affects:
  - "01-08: los RPC necesitan su propio `revoke all on function … from public, anon` cada uno; no se hereda. reveal_access_code() consume private.my_unlockable_property_ids() y desbloquea 6 aserciones de 00_rls_aseos"
  - "01-08: las policies de storage.objects pueden usar private.my_cleaning_ids() y my_writable_cleaning_ids(), que ya existen con esa semántica"
  - "01-09: gen types no emite nada de `private`; verificado. Vale una aserción de que ninguna función de public es ejecutable por anon"
  - "Fase 2 (UI): el admin escribe properties, property_rooms, room_types, checklist_tasks, missing_item_catalog, calendar_feeds, app_settings y profiles directo con RLS; cleanings NO, va por RPC"
  - "Fase 3/5/9 (workers): service_role tiene acceso total a las 22 tablas y a las 3 secuencias; es lo que hace que BYPASSRLS sirva de algo"
  - "Toda fase futura: una tabla nueva de public nace sin privilegios; hay que escribir el grant y la policy en la misma migración"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "El grafo de policies es un DAG: el lado de lookup vive en una función definer de `private`, nunca en un subselect cruzado"
    - "Toda policy con `to authenticated` explícito y toda llamada envuelta en `(select …)` para que se evalúe como InitPlan"
    - "Ninguna policy lee claims del JWT: is_active se consulta contra la base en cada sentencia"
    - "Grants tabla por tabla, jamás `on all tables`, para que la lista sea auditable y las tablas futuras nazcan cerradas"
    - "Una credencial vive en tabla sin ningún grant: la ausencia de privilegio, no la policy, es lo que la protege"
    - "Cada medición que contradice al research queda escrita en la propia migración, con el número y el resultado"

key-files:
  created:
    - "supabase/migrations/20260831220805_07_grants.sql"
    - "supabase/migrations/20260831221405_08_rls_policies.sql"
  modified:
    - ".planning/phases/01-fundaci-n-schema-y-rls/deferred-items.md"
  deleted: []

key-decisions:
  - "Los default privileges se revocan para anon Y authenticated: 01-RESEARCH.md §3.1 solo contempla anon porque se midió con la CLI 2.115.0"
  - "El equivalente para funciones no existe: PG 17.6 refusiona acldefault('f') y PUBLIC recupera EXECUTE en cada función nueva. Medido dos veces; el sustituto es el revoke per-función, ahora contrato del plan 01-08"
  - "No se escribe el `revoke insert, update, delete on cleanings` que propone ARCHITECTURE.md: es un no-op sobre privilegios que nunca existieron y sugiere una protección que no aporta"
  - "No se revoca el USAGE de anon sobre el esquema public: no cierra nada que los revokes de tabla no cierren y empeora el modo de fallo de PostgREST"
  - "profiles_own_select no exige is_active: un usuario desactivado debe poder leer su propio perfil para que la UI le explique por qué no ve nada"
  - "notifications no tiene policy de admin: la campana de cada quien es suya, incluida la del admin"
  - "Los WARN multiple_permissive_policies son 14, no los 3 que preveía el plan, y se aceptan igual: consolidar en un OR haría el modelo ilegible"

requirements-completed: [PLAT-03, PLAT-05, PLAT-06]

# Metrics
duration: 48min
completed: 2026-08-31
---

# Phase 1 Plan 07: Migraciones 07 y 08, grants y RLS Summary

**El archivo de seguridad de la fase: 20 de las 22 tablas con privilegios explícitos y mínimos para `authenticated`, `property_secrets` y `storage_deletion_queue` sin ninguno, `anon` en cero incluido `TRUNCATE`, los default privileges cerrados para las fases futuras, y RLS con 37 policies sobre las 22 tablas apoyada en 6 helpers `SECURITY DEFINER` de un esquema que PostgREST no ve.**

## Performance

- **Duration:** ~48 min
- **Tasks:** 2 de 2
- **Migraciones creadas:** 2 (316 + 585 líneas)
- **Policies creadas:** 37 sobre 22 tablas
- **Aserciones pgTAP:** de 25 ejecutándose a **35**; el guardarraíl 1 pasó de rojo a verde y `02_guardarrailes` quedó **9/9**

## Accomplishments

- **Guardarraíl 1 en verde.** Las 22 tablas de `public` tienen RLS habilitada y al menos una policy. Era la única aserción roja de `02_guardarrailes.test.sql`, y lo era desde el plan 01-03. El archivo completo pasa 9/9.
- **`00_rls_aseos.test.sql` dejó de abortar en la aserción 1.** Antes moría con `permission denied for table cleanings` sin ejecutar ni una. Ahora corre 10 aserciones y **9 están en verde**; la única roja es la del RPC del plan 01-08. Las 6 que faltan se verificaron por separado (detalle abajo): **12 de 12 en verde** en una copia sin las aserciones del RPC.
- **Las cuatro propiedades que esta wave existía para hacer ciertas, medidas:**

  | Propiedad | Cómo se ejerció | Resultado |
  |---|---|---|
  | El aseador solo ve sus aseos y sus instrucciones | Aserciones 1, 2 y 4 | A ve exactamente 2; B ve 0 |
  | No ve apartamentos ajenos, ni por join embebido | Aserciones 3, 5 y 6 | A ve 2 de 3 (P2 invisible); el join `cleanings × properties` no filtra nada para B |
  | Un aseador desactivado con token vivo no ve una fila | Aserciones 8 y 9 | 0 aseos y 0 apartamentos para C |
  | Ni el aseador asignado lee `property_secrets` | Aserción 10 | `42501`, no "0 filas" |

- **`db advisors --local --type security --fail-on error` sale 0**, con las 22 tablas ya expuestas por sus grants. Es la primera vez en la fase que ese comando discrimina de verdad: tras la migración 07 y antes de la 08 reportó **20 ERROR `rls_disabled_in_public`**, y la migración 08 los eliminó todos.
- **El punto ciego del advisor quedó documentado con medición propia.** Esos 20 ERROR fueron 20 y no 22: `property_secrets` y `storage_deletion_queue` no aparecieron, porque no tienen grants. Es exactamente la razón por la que existe el guardarraíl 1 y por la que estas dos tablas también llevan RLS.
- **Los default privileges están cerrados.** Verificado creando una tabla con `bigserial` y una función en una transacción y midiendo: la tabla nace con **cero** privilegios para `anon` y `authenticated`, y su secuencia también.
- **Se midió una limitación que el plan daba por resuelta:** el mismo `alter default privileges` **no puede** quitarle `EXECUTE` a PUBLIC sobre las funciones futuras. Está escrito en la migración con el experimento, y convertido en contrato para el plan 01-08.

## Task Commits

1. **Task 1: migración 07, la matriz de grants** — `017aaeb` (feat)
2. **Task 2: migración 08, esquema private, RLS y 37 policies** — `cd6a2d4` (feat)
3. **Hallazgos 5 y 6 en `deferred-items.md`** — `505beac` (docs)

## Aserciones pgTAP: el delta rojo→verde

Corridas con `npx supabase test db --local` sobre la base recién reseteada, antes y después.

### Antes de este plan

```
00_rls_aseos      Bad plan. You planned 16 tests but ran 0
                  ERROR: permission denied for table cleanings  (línea 111, aserción 1)
01_invariantes    ok  (11)
02_guardarrailes  8/9 — falla la 1, listando las 22 tablas sin RLS
03_seed           ok  (5)
04_storage        Bad plan. You planned 5 tests but ran 0
Files=5, Tests=25, Result: FAIL
```

### Después

```
00_rls_aseos      10 de 16 ejecutadas, 9 verdes. Falla la 7 (RPC ausente);
                  aborta en la 11 por results_eq sobre función inexistente
01_invariantes    ok  (11)
02_guardarrailes  ok  (9)   <-- 9/9
03_seed           ok  (5)
04_storage        Bad plan. You planned 5 tests but ran 0  (sin cambio)
Files=5, Tests=35, Result: FAIL
```

### De rojo a verde en este plan (10)

| Archivo | # | Aserción | Por qué pasó |
|---|---|---|---|
| `02_guardarrailes` | 1 | Toda tabla de `public` tiene RLS habilitada | Las 22 `enable row level security` de la migración 08. Era la última roja del archivo |
| `00_rls_aseos` | 1 | A ve exactamente sus 2 aseos | `grant select` (07) + `cleanings_cleaner_select` plana (08). Sin el grant, `42501`; sin la policy, los 2 y los ajenos |
| `00_rls_aseos` | 2 | A ve las instrucciones de su propio aseo | Misma policy. Es PLAT-06 |
| `00_rls_aseos` | 3 | A ve solo P1 y P3, no P2 | `properties_cleaner_select` con `my_property_ids()` (-1..+7) |
| `00_rls_aseos` | 4 | B no ve ningún aseo ajeno | El predicado `aseador_id = auth.uid()` |
| `00_rls_aseos` | 5 | B no ve ningún apartamento ajeno | `my_property_ids()` vacío para B |
| `00_rls_aseos` | 6 | El join `cleanings × properties` no filtra nada para B | **La aserción de T-01-38.** La policy que decide es la de `properties`, no la de `cleanings` |
| `00_rls_aseos` | 8 | Aseadora desactivada con token vivo no ve ningún aseo | `is_active_cleaner()` consulta `profiles.is_active` en la base, no el claim |
| `00_rls_aseos` | 9 | Aseadora desactivada no ve ningún apartamento | Igual |
| `00_rls_aseos` | 10 | Ni el aseador asignado lee `property_secrets` | **Ausencia de grant**, no policy. Por eso es `42501` |

### Verdes que dejaron de ser vacuas

- **Guardarraíl 7** (`service_role` lee todas las tablas): seguía verde, pero ahora es el único motivo por el que los workers de las Fases 3, 5 y 9 pueden trabajar. Comprobado además con escritura real: `set local role service_role` lee las 39 propiedades del seed, inserta en `app_settings` y consulta `property_secrets` sin error de privilegio.
- **Guardarraíl 8** (`property_secrets` y `storage_deletion_queue` sin privilegios para `authenticated`): pasó de ser un invariante sobre tablas que nadie podía tocar a ser el invariante que sostiene PLAT-05, ahora que las otras 20 tablas sí tienen grants.
- **Guardarraíl 4 y 4b** siguen verdes con `anon` en cero sobre las 22 tablas y las 3 secuencias. Comprobado además desde el rol: `set role anon; select count(*) from public.cleanings` → `42501`.

### Rojas todavía, con su dueño

| Archivo | # | Aserción | Dueño | Nota |
|---|---|---|---|---|
| `00_rls_aseos` | 7 | B no puede revelar el código del aseo de A | **01-08** | Captura `42883` (función inexistente) en vez de `42501`. Degrada bien: no aborta |
| `00_rls_aseos` | 11 | A obtiene el código de su aseo de hoy por RPC | **01-08** | `results_eq` no captura el error y **aborta el archivo** |
| `00_rls_aseos` | 12 | La lectura quedó auditada en `access_code_reads` | **01-08** | No llega a correr |
| `00_rls_aseos` | 13 | Un aseo a 5 días es visible pero NO desbloqueable | **01-08** | No llega a correr |
| `00_rls_aseos` | 14 | El aseador no puede hacer UPDATE directo sobre `cleanings` | **01-08** | **Ya está en verde**; no llega a correr por la 11 |
| `00_rls_aseos` | 15 | El admin ve los 2 aseos | **01-08** | **Ya está en verde**; no llega a correr por la 11 |
| `00_rls_aseos` | 16 | El aseador no lee la bitácora de códigos | **01-08** | **Ya está en verde**; no llega a correr por la 11 |
| `04_storage` | 1-5 | Policies de `storage.objects` | **01-08** | Sigue abortando en la línea 97: el bucket `evidencia` no existe |

**Prueba de que 14, 15 y 16 están en verde.** Se copió `00_rls_aseos.test.sql` fuera del repo, se le quitaron **solo** las 4 llamadas de aserción que dependen de `reveal_access_code()` (conservando los `set_config` y `tests_auth` intermedios, para que el rol activo en cada punto no cambiara), se bajó el plan a 12 y se corrió con `supabase test db`:

```
zz_tmp_sin_rpc.test.sql .. ok
All tests successful.
Files=1, Tests=12, Result: PASS
```

La copia se borró inmediatamente y **no se tocó ni una línea del archivo versionado**. Las 12 aserciones de RLS del contrato están cumplidas; lo que falta es la función que las otras 4 invocan.

**Total: 35 de 45 aserciones ejecutándose, 34 verdes. Las 10 restantes (6 de `00_rls_aseos` + 5 de `04_storage`, menos el solape) son del plan 01-08.**

## Files Created/Modified

- **`supabase/migrations/20260831220805_07_grants.sql`** (316 líneas). Cinco bloques: normalización a cero de `anon` y `authenticated`, la matriz de `authenticated` tabla por tabla, `service_role` completo, `anon` en cero, y los default privileges. La cabecera lleva la medición de `pg_default_acl` que justifica el archivo entero y las tres consecuencias que se ejercieron una por una.
- **`supabase/migrations/20260831221405_08_rls_policies.sql`** (585 líneas). Parte A: `private` + los 6 helpers, con los revoke/grant de `EXECUTE`. Parte B: las 22 `enable row level security`. Parte C: las 37 policies, agrupadas por rol de la tabla en el modelo. Parte D: la regla de `security_invoker` para las vistas de las Fases 4 y 7. Cierra con la deuda de `multiple_permissive_policies` registrada.
- **`.planning/phases/01-fundaci-n-schema-y-rls/deferred-items.md`** — hallazgos 5 y 6.

`STATE.md` y `ROADMAP.md` intactos, como exige la ejecución en worktree.

## La matriz de grants, como quedó medida

`information_schema.role_table_grants` para `authenticated`, 20 filas:

| Privilegios | Tablas |
|---|---|
| `SELECT, INSERT, UPDATE, DELETE` | `profiles`, `properties`, `property_rooms`, `room_types`, `checklist_tasks`, `missing_item_catalog`, `calendar_feeds`, `app_settings` |
| `SELECT, INSERT` | `cleaning_photos` |
| `SELECT, UPDATE` | `notifications` |
| `SELECT` | `cleanings`, `access_code_reads`, `calendar_reservations`, `cleaning_state_transitions`, `cleaning_checklist_items`, `damages`, `expenses`, `missing_item_reports`, `missing_item_lines` |
| `SELECT, INSERT, UPDATE, DELETE` (propias) | `push_subscriptions` |
| **ninguno** | **`property_secrets`**, **`storage_deletion_queue`** |

Y 37 policies repartidas así: 3 en `cleaning_photos`; 2 en `checklist_tasks`, `cleaning_checklist_items`, `cleanings`, `damages`, `expenses`, `missing_item_catalog`, `missing_item_lines`, `missing_item_reports`, `notifications`, `profiles`, `properties`, `property_rooms` y `room_types`; 1 en `access_code_reads`, `app_settings`, `calendar_feeds`, `calendar_reservations`, `cleaning_state_transitions`, `property_secrets`, `push_subscriptions` y `storage_deletion_queue`.

## Verificaciones ejecutadas

| Verificación | Resultado |
|---|---|
| `npx supabase db reset --local` | exit 0, 8 migraciones aplicadas |
| `npx supabase db lint --local` | `No schema errors found` |
| `npx supabase db advisors --local --type security --fail-on error` | `No issues found`, exit 0 |
| `db advisors --type security` tras la 07 y **antes** de la 08 | 20 ERROR `rls_disabled_in_public`; `property_secrets` y `storage_deletion_queue` **ausentes** |
| `db advisors --type performance` | 14 WARN `multiple_permissive_policies`, **cero** `auth_rls_initplan` |
| Privilegios de `anon` sobre tablas de `public` | 0 |
| Privilegios de `anon`/`authenticated` sobre secuencias de `public` | 0 |
| Privilegios de `authenticated` sobre `property_secrets` / `storage_deletion_queue` | 0 |
| `SELECT` de `service_role` sobre tablas base de `public` | 22 de 22 |
| DML de `authenticated` sobre `cleanings` | 0; `SELECT` = 1 |
| Tabla nueva con `bigserial` creada tras la 07 | `tabla: NINGUNO`, `secuencia: NINGUNO` para `anon` y `authenticated` |
| `set role anon; select from public.cleanings` | `42501 permission denied` |
| `set local role service_role` lee, escribe y consulta `property_secrets` | sin error de privilegio; 39 propiedades leídas |
| Tablas de `public` sin RLS | 0 |
| Tablas con RLS y sin policy | 0 |
| Policies sin `to authenticated` | 0 de 37 |
| Funciones en `private` | 6, las 6 `security definer`, las 6 con `search_path` fijado |
| `has_function_privilege('anon', private.*, 'execute')` | 0 de 6 |
| Policies de `cleanings` que mencionen `properties` | 0 (DAG acíclico; cero `42P17` en toda la corrida) |
| `private` en `[api] schemas` de `config.toml` | no aparece; `schemas = ["public", "graphql_public"]` |
| `supabase gen types typescript --schema public` | 0 coincidencias de `private` |
| `grep -rniE '^[^-]*\bcurrent_date\b' supabase/migrations` | sin coincidencias |
| `bash scripts/ci/check-service-role.sh` | `check-service-role: OK` |
| `grant select on all tables … to authenticated` en la migración 07 | sin coincidencias |
| `npx supabase test db --local` | 35 aserciones ejecutadas, 34 verdes |

## Decisions Made

- **Los default privileges se revocan para `anon` y para `authenticated`.** `01-RESEARCH.md` §3.1 solo contempla `anon` porque se midió con la CLI 2.115.0. Con la 2.116.0 `authenticated` nace con `INSERT/UPDATE/DELETE` sobre toda tabla nueva, lo que rompe de raíz "el aseador no escribe directo". Era el contrato explícito que dejó el plan 01-03 y está cumplido.
- **No se escribe el `revoke insert, update, delete on public.cleanings from authenticated` de `ARCHITECTURE.md`.** Es un no-op sobre privilegios que nunca se otorgaron. Dejarlo escrito sugiere que la protección viene del revoke, cuando viene de no haber otorgado: si alguien agregara un `grant update` más abajo, ese revoke no lo desharía. La razón está escrita en la migración, al lado del `grant select`.
- **No se revoca el `USAGE` de `anon` sobre el esquema `public`.** Se evaluó y se descartó: sin privilegios de tabla el USAGE no da acceso a nada, y quitarlo cambia el modo de fallo de PostgREST de "42501 sobre la tabla" a errores de resolución de nombres mucho más difíciles de diagnosticar.
- **`profiles_own_select` no exige `is_active_cleaner()`.** Un usuario desactivado debe poder leer su propia fila para que la UI le explique por qué no ve nada, en vez de mostrarle una pantalla vacía sin causa. Lo que no ve es ningún aseo ni ningún apartamento, que es donde están los datos. Las aserciones 8 y 9 lo confirman.
- **`notifications` no tiene policy de admin.** La campana de cada quien es suya, incluida la del admin. Es lo que dice la tabla de cobertura de `ARCHITECTURE.md` y es la decisión correcta: el admin ve el estado operativo en la tabla que corresponda, no leyendo las notificaciones de sus aseadoras.
- **`missing_item_lines` consulta `public.missing_item_reports` directo, sin función definer.** El subselect sí evalúa la RLS de esa tabla, y eso es correcto: el grafo sigue siendo acíclico (`missing_item_lines → missing_item_reports → my_cleaning_ids (definer) → nada`). Un helper nuevo aquí sería una función más que mantener sin romper ningún ciclo.
- **Los WARN de `multiple_permissive_policies` son 14, no 3, y se aceptan igual.** El plan preveía 3 (`cleanings`, `profiles`, `properties`); la cuenta real incluye además `checklist_tasks`, `cleaning_checklist_items`, `cleaning_photos` (×2, SELECT e INSERT), `damages`, `expenses`, `missing_item_catalog`, `missing_item_lines`, `missing_item_reports`, `property_rooms` y `room_types`. La razón para aceptarlos no cambia con el número: consolidar admin y aseador en un `OR` produce predicados donde un error de paréntesis abre la tabla entera y nadie lo nota, a cambio de una ganancia irrelevante con 39 unidades. Además son WARN de **performance**, no de security: `--type security --fail-on error` sale 0 igual.
- **Cero `auth_rls_initplan`.** El patrón `(select …)` en las 59 llamadas de las policies funciona: el advisor de performance no reporta ni uno.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] La migración afirmaba cerrarle a `anon` el `EXECUTE` sobre las funciones futuras, y eso es falso en PG 17.6**

- **Found during:** Task 1, verificando el efecto de los default privileges con una tabla y una función de prueba.
- **Issue:** el contrato del plan 01-03 asignaba a este plan cerrar el ACL `f` (`anon=X` sobre toda función nueva de `public`). La vía natural, `alter default privileges … revoke execute on functions from public, anon`, **no funciona**. Postgres refusiona `acldefault('f', owner)` — que siempre trae la entrada `=X` de PUBLIC — con lo almacenado en `pg_default_acl`, y la entrada reaparece en cada función nueva. Medido dos veces y por dos caminos:
  ```
  defaclacl tras el revoke       : {postgres=X, authenticated=X, service_role=X}
  proacl de una función posterior : {=X/postgres, postgres=X, authenticated=X, service_role=X}
  has_function_privilege('anon', <nueva>, 'execute') -> t
  ```
  Hacer primero `grant execute on functions to public` para materializar la entrada y después revocarla da el mismo `t`. El primer borrador de la migración llevaba escrito el comentario "lo que se cierra es la puerta anónima", que habría hecho que el autor del plan 01-08 omitiera el revoke por función creyéndolo heredado.
- **Fix:** la sentencia se conserva (quita la entrada explícita de `anon` y sería correcta si una versión futura cambiara el comportamiento), pero el comentario se reescribió con el experimento completo y con el contrato en mayúsculas: **toda función nueva de `public`, y sobre todo cada RPC `SECURITY DEFINER`, necesita su propio `revoke all on function … from public, anon` al lado de la definición**. Se añadió además `revoke execute on all functions in schema public from public, anon` para las 5 funciones que ya existían, donde el revoke **sí** funciona porque opera sobre un ACL materializado.
- **Por qué importa:** sin ese par de líneas, `reveal_access_code()` sería invocable por cualquiera con la publishable key. Hoy devolvería `42501` porque `auth.uid()` es NULL, pero la función corre como `postgres`: convertirla en fuga solo requiere un bug en su guarda.
- **Files modified:** `supabase/migrations/20260831220805_07_grants.sql`, `deferred-items.md` (hallazgo 5)
- **Verification:** `has_function_privilege('anon', …)` pasó de `t` a `f` en las 5 funciones existentes; sobre una función creada después sigue en `t`, que es justo lo que el comentario ahora documenta.
- **Committed in:** `017aaeb` y `505beac`

**2. [Rule 3 - Blocking] `npm ci` en el worktree**

- **Found during:** arranque.
- **Issue:** el worktree no hereda `node_modules`, así que `npx supabase` resolvía a una versión del caché en vez de la 2.116.0 pineada. Es la misma desviación que reportaron los planes 01-02 y 01-03, y se va a repetir en cada worktree.
- **Fix:** `npm ci`. Ningún archivo versionado cambia.
- **Files modified:** ninguno.

### El verify del plan que no puede salir en verde, y por qué no se fuerza

El plan pedía, textualmente, que `npx supabase test db --local supabase/tests/00_rls_aseos.test.sql` no imprimiera `Bad plan`. **No sale en verde, y es inevitable con el alcance de este plan.**

El mismo plan declara que "las 3 aserciones del RPC siguen en rojo hasta el plan 08". La suposición implícita era que fallarían de forma limpia. Dos de ellas lo hacen: `throws_ok` captura cualquier excepción y reporta un `not ok` legible con `caught: 42883`. Pero la aserción 11 usa **`results_eq`**, que abre un cursor con `EXECUTE` sin manejador de excepciones: el error se propaga, aborta la transacción y las aserciones 12 a 16 no llegan a correr. Salida: `Bad plan. You planned 16 tests but ran 10`.

Las tres salidas posibles y por qué se descartaron dos:

1. **Crear `reveal_access_code()` aquí.** Pondría el archivo en 16/16, pero es el artefacto del plan 01-08, que además necesita su propia migración; adelantarla colisionaría con la numeración de ese plan y con su auditoría.
2. **Editar el test** (mover el `results_eq` al final, o cambiarlo por otra aserción). La regla de la fase es que la suite gana y no se debilita para que una migración pase. Este `results_eq` expresa el requisito correcto con la mecánica correcta; su problema es de secuencia y desaparece solo.
3. **Reportarlo con precisión y demostrar por otra vía las tres aserciones bloqueadas.** Es lo que se hizo, y está arriba: 12/12 en una copia efímera fuera del repo.

Registrado como hallazgo 6 de `deferred-items.md`, con dueño 01-08.

## Issues Encountered

- **La migración 08 tiene 585 líneas y la 07, 316.** Más de la mitad es comentario, y es deliberado: es el archivo que un revisor de seguridad abre primero, y cada decisión que se ve rara (por qué `property_secrets` tiene policy si no tiene grant, por qué la de `cleanings` es plana, por qué `notifications` no tiene rama de admin) lleva su razón escrita al lado. El modo de fallo real de esta fase no es que el SQL esté mal hoy, sino que alguien lo "corrija" en la Fase 5 volviendo a `ARCHITECTURE.md`.
- **`db advisors` no reporta `multiple_permissive_policies` bajo `--type security`.** Es un lint de **performance**. El plan lo describía como si saliera en la corrida de seguridad; no sale, y por eso `--type security --fail-on error` da `No issues found` limpio. Para verlos hay que correr `--type performance`.
- **`04_storage.test.sql` sigue abortando entero** en la línea 97 por el bucket `evidencia` inexistente. Sin cambio respecto al plan 01-06 y fuera de alcance aquí.
- **`lib/database.types.ts` todavía no existe**, así que `npm run db:types:check` falla en el `diff`. La generación en sí funciona y no emite nada de `private`. Es del plan 01-09.

## Contrato para los planes siguientes

| Para | Qué | Por qué |
|---|---|---|
| **01-08** | Cada RPC lleva su propio `revoke all on function public.<f>(<args>) from public, anon;` + `grant execute … to authenticated;` | No se hereda de los default privileges. Medido: hallazgo 5 de `deferred-items.md` |
| **01-08** | `reveal_access_code()` debe consumir la ventana `hoy..hoy+1`, que ya existe como `private.my_unlockable_property_ids()` | Las aserciones 3 y 13 se ejercen una contra la otra: un aseo a 5 días es **visible** y **no** desbloqueable |
| **01-08** | El RPC va `SECURITY DEFINER set search_path = ''`, e inserta en `access_code_reads` en la **misma** transacción que la lectura | Aserción 12: no hay lectura de código sin rastro. El guardarraíl 5 verifica el `search_path` |
| **01-08** | Los RPC corren como `postgres`, que es owner y está exento de RLS. No hace falta ningún grant extra para que escriban `cleanings` | Es la razón por la que `cleanings` puede quedarse sin DML para `authenticated` |
| **01-08** | Las policies de `storage.objects` pueden usar `private.my_cleaning_ids()` (lectura) y `private.my_writable_cleaning_ids()` (subida) tal cual | Ya existen con esa semántica exacta y `authenticated` tiene `EXECUTE` |
| **01-09** | Aserción de guardarraíl: **ninguna función de `public` es ejecutable por `anon`** | Es el único control que sustituye al default privilege que PG no permite |
| **Fase 2** | El admin escribe directo `properties`, `property_rooms`, `room_types`, `checklist_tasks`, `missing_item_catalog`, `calendar_feeds`, `app_settings` y `profiles`. **`cleanings` no**: va por RPC | Es la matriz de la migración 07 y la decisión bloqueada de `01-CONTEXT.md` |
| **Fase 5** | Si un RPC llega a aceptar `notifications.url` desde el cliente, hace falta un `CHECK` de forma (`url like '/%'`) | Hoy no hay vector porque `authenticated` no tiene `INSERT`. Es el `threat_flag: schema-change` del plan 01-06 |
| **Toda fase** | Tabla nueva en `public` = `grant` explícito **+** `enable row level security` **+** al menos una policy, en la misma migración | Los default privileges ya no otorgan nada. El síntoma de olvidarlo es `42501`, ruidoso; el contrario es silencioso |

## Known Stubs

Ninguno. Las dos migraciones están completas y aplicadas, y las 22 tablas tienen su modelo de autorización cerrado.

Dos cosas que **parecen** stubs y no lo son:

- **Las ramas de escritura de `cleanings_admin_all` no son alcanzables.** No hay DML sobre `cleanings` para `authenticated`, así que hoy ese `for all` solo actúa sobre el `SELECT`. Está escrito completo a propósito: el día que se otorgue un grant, la autorización ya está puesta y no hay una ventana sin policy.
- **`storage_deletion_queue` y `property_secrets` tienen policy sin tener grant.** No es defensa (ya son inalcanzables): es el guardarraíl 2. Una tabla con RLS y sin ninguna policy devuelve todo vacío **en silencio**, y ese silencio es lo que empuja a alguien a desactivar la RLS.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: privilege-surface | `public.*` (toda función futura) | El `<threat_model>` del plan da por mitigado T-01-46 con `alter default privileges`. Eso es cierto para tablas y secuencias, y **falso para funciones**: PG 17.6 devuelve `EXECUTE` a PUBLIC en cada función nueva de `public`, medido. Toda función futura, y sobre todo cada RPC `SECURITY DEFINER`, es superficie abierta a `anon` hasta que lleve su propio `revoke`. Merece una aserción de guardarraíl en el plan 01-09 |
| threat_flag: auth-path | `public.profiles` / `profiles_own_select` | Ruta de lectura nueva no contemplada en el `<threat_model>`: la policy de fila propia **no** exige `is_active`, así que un usuario desactivado con token vivo sigue leyendo su propia fila de `profiles`, incluido su `role`. Es deliberado (la UI necesita explicar la desactivación) y no expone dato ajeno, pero es la única excepción a "un desactivado no ve una fila". Si alguna Fase futura usa `profiles.role` leído por el cliente para decidir algo más que ruteo, esta excepción se vuelve relevante |
| threat_flag: privilege-surface | `public.missing_item_lines` / `mil_cleaner_select` | Única policy del esquema cuyo predicado consulta otra tabla de `public` sin pasar por una función definer. Hoy el grafo sigue siendo acíclico, pero si alguien añadiera a `missing_item_reports` una policy que consultara `missing_item_lines`, aparecería un ciclo `42P17` que tumbaría las dos tablas para todos los roles. El plan 01-09 podría añadir una aserción de que ninguna policy de `missing_item_reports` menciona `missing_item_lines` |

## User Setup Required

Ninguna.

## Next Phase Readiness

- **El plan 01-08 desbloquea 11 de las 45 aserciones de un tirón**: las 6 de `00_rls_aseos` que faltan (4 del RPC más las 3 que hoy quedan bloqueadas detrás del `results_eq`) y las 5 de `04_storage`. Es el último plan con aserciones pendientes de schema.
- Los 6 helpers de `private` están listos y con la semántica que el plan 01-08 necesita, incluida la ventana estrecha del código de acceso. No hay que escribir ninguna función de apoyo más.
- La tabla *Contrato para los planes siguientes* de arriba es la lista de verificación de quien escriba la migración 09. La primera fila (el revoke por función) es la que no se puede deducir de ningún documento previo: solo de la medición de este plan.
- **Desde aquí, `db advisors --type security --fail-on error` es una puerta que discrimina de verdad.** Hasta el plan 01-06 salía limpio sobre una base sin RLS, porque el advisor no ve las tablas sin grants. Ahora las 22 tienen grants o RLS o las dos, y un olvido futuro sí aparece.

---
*Phase: 01-fundaci-n-schema-y-rls*
*Completed: 2026-08-31*

## Self-Check: PASSED

- 4 archivos declarados verificados en disco: las 2 migraciones, `deferred-items.md` y este SUMMARY.
- 3 commits verificados en el log: `017aaeb`, `cd6a2d4`, `505beac`.
- `git diff --diff-filter=D --name-only 255f529..HEAD` no devuelve nada: cero borrados.
- La copia efímera `supabase/tests/zz_tmp_sin_rpc.test.sql` fue eliminada; `git status` no la reporta y la suite versionada quedó sin tocar.
- `STATE.md` y `ROADMAP.md` sin modificar, como exige la ejecución en worktree paralelo.
