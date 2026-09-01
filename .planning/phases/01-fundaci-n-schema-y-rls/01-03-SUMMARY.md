---
phase: 01-fundaci-n-schema-y-rls
plan: 03
subsystem: database
tags: [postgres, supabase, migraciones, ddl, enums, timezone, rls-pendiente, tdd]

# Dependency graph
requires:
  - "01-01: supabase/migrations/ versionado, config.toml endurecido, `supabase db reset` funcional sobre Postgres 17.6"
  - "01-02: las 45 aserciones pgTAP que este plan empieza a poner en verde"
provides:
  - "public.today_bog() — el único helper de fecha del repo, stable, search_path=''"
  - "public.tg_set_updated_at() — trigger genérico de updated_at, listo para las migraciones 04-08"
  - "Los 6 enums del dominio: user_role, cleaning_state (4 valores), cleaning_type, feed_provider, push_status, notification_type (11 valores)"
  - "8 tablas de catálogo: profiles, properties, property_secrets, room_types, checklist_tasks, property_rooms, missing_item_catalog, app_settings"
  - "public.tg_handle_new_user() + trigger on_auth_user_created: materializa profiles desde auth.users sin código de aplicación"
  - "Columnas monetarias en bigint: properties.tarifa_huesped y properties.pago_aseador"
  - "property_secrets.ical_url: la URL de exportación de Airbnb tratada como credencial"
  - "Los 5 CHECK de properties + properties_nombre_uniq + properties_cluster_idx"
  - "El tope estructural de 3 tareas por tipo de cuarto (CHECK de rango + UNIQUE del par)"
  - "Medición del agujero de privilegios por defecto de la CLI 2.116.0 y su cierre para estas 8 tablas"
affects:
  - "01-04 a 01-06: toda tabla operativa cuelga de properties y profiles; `cleanings.tarifa_huesped` y `expenses.monto` deben ser bigint o el guardarraíl 6 sigue rojo"
  - "01-07: hereda un agujero de privilegios que 01-RESEARCH.md §3.1 no pudo prever; su migración de grants necesita dos líneas que el research no contempla"
  - "01-09: `supabase gen types typescript` ya emite algo; bigint -> number es lo que hace que la aritmética de la Fase 7 no llegue como string"
  - "Fase 2 (UI): properties nace inactivo y no se puede activar sin tarifas ni sin responsable; el formulario de alta debe contemplarlo"
  - "Fase 3 (iCal): la URL del feed se resuelve desde property_secrets.ical_url"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cero `create extension`: gen_random_uuid() es nativa de pg_catalog en PG 17 y pgtap queda prohibida en migraciones"
    - "`set search_path = ''` en TODA función, sea SECURITY DEFINER o no"
    - "Los COMMENT ON y los comentarios SQL evitan escribir los literales que buscan las puertas de CI"
    - "El rol del metadato se valida contra pg_enum en vez de castearse, para que un valor basura no rompa la creación de usuarios"
    - "Los invariantes de negocio viven como CHECK con nombre estable, y el nombre es contrato compartido con lib/domain/constants.ts"
    - "Cada divergencia respecto a ARCHITECTURE.md queda escrita en el propio archivo, con la razón, para que nadie la 'arregle'"

key-files:
  created:
    - "supabase/migrations/20260831205735_01_extensiones_y_helpers.sql"
    - "supabase/migrations/20260831205736_02_enums.sql"
    - "supabase/migrations/20260831210111_03_catalogo.sql"
  modified:
    - "supabase/tests/02_guardarrailes.test.sql"
    - ".planning/phases/01-fundaci-n-schema-y-rls/deferred-items.md"
  deleted:
    - "supabase/migrations/.gitkeep"

key-decisions:
  - "No se crea ninguna extensión: gen_random_uuid() ya está en pg_catalog en Postgres 17, verificado contra la base de la fase"
  - "El trigger de auth.users valida el rol contra pg_enum en vez de castearlo, para que un raw_user_meta_data basura no aborte la creación del usuario con 22P02"
  - "full_name se resuelve en el trigger con cascada de fallbacks porque es NOT NULL con CHECK de no vacío y auth.users.email es nullable"
  - "La migración 03 SÍ lleva un bloque REVOKE, pese a que el plan prohíbe grants: sin él, property_secrets queda legible por anon"
  - "No se toca `auto_expose_new_tables` en config.toml: poner false arregla local y deja la nube expuesta"
  - "El literal del guardarraíl 5 se corrige, no se elude: `search_path=` es insatisfacible en PG 17.6"
  - "access_code_reads NO se crea aquí: tiene FK a cleanings, que no existe todavía"

requirements-completed: [PLAT-05, FIN-01, ASEO-07]

# Metrics
duration: 38min
completed: 2026-08-31
---

# Phase 1 Plan 03: Migraciones 01-03, helpers, enums y catálogo Summary

**Las tres primeras migraciones del proyecto: `today_bog()` como único helper de fecha, los 6 enums aislados en su propio archivo, y las 8 tablas de catálogo con el dinero en `bigint`, el código de acceso y la URL iCal fuera de `properties`, y los invariantes de activación de apartamento impuestos por la base.**

## Performance

- **Duration:** ~38 min
- **Tasks:** 2 de 2
- **Migraciones creadas:** 3 (124 + 400 líneas de SQL versionado)
- **Aserciones pgTAP que pasaron de rojo a verde:** 5

## Accomplishments

- `supabase db reset --local` aplica las tres migraciones desde cero, sale 0, y ya no emite `Skipping migration .gitkeep...`.
- `supabase db lint --local` limpio, y `supabase db advisors --local --type security` **sin ningún hallazgo** — que es exactamente lo que `01-RESEARCH.md` §9.2 predijo: con las tablas sin grants, `rls_disabled_in_public` no dispara. El hueco lo tapa el guardarraíl 1 de la suite, que sí está rojo y lo estará hasta el plan 01-07.
- Los ocho puntos de la tabla *Contrato que estos archivos imponen* del `01-02-SUMMARY.md` que caen dentro de este plan están cumplidos: `bigint` en las columnas monetarias de `properties`, y `property_secrets.ical_url` existiendo. Los otros seis pertenecen a `cleanings`, `expenses`, `calendar_feeds` y a las migraciones de RLS.
- Se descubrió y se cerró un agujero de privilegios **que no existía cuando se escribió el research**: en la CLI 2.116.0 toda tabla nueva de `public` nace legible y escribible por `anon` sin autenticar. `property_secrets` — la tabla que existe precisamente para que el código de la cerradura no sea legible — nacía expuesta.
- Se corrigió un literal insatisfacible del guardarraíl 5, con la medición que lo demuestra, en vez de quitar el `search_path` de la función que lo destapó.

## Task Commits

1. **Task 1: migraciones 01 (helpers) y 02 (enums)** — `f00d813` (feat)
2. **Task 2: migración 03 (catálogo)** — `6131296` (feat)
3. **Task 2 (desviación 2): literal del guardarraíl 5** — `6f8ccf6` (fix)

## Aserciones pgTAP: qué se movió y qué falta

Corrida completa con `npx supabase test db --local` sobre la base recién reseteada.

### De rojo a verde en este plan (5)

| Archivo | # | Aserción | Por qué pasó |
|---|---|---|---|
| `02_guardarrailes` | 4 | `anon` no conserva ningún privilegio sobre `public` | El bloque REVOKE de la migración 03. **No era verde por sí sola**: sin ese revoke la aserción listaba 7 privilegios × 8 tablas |
| `02_guardarrailes` | 5 | Toda función `SECURITY DEFINER` fija `search_path = ''` | `tg_handle_new_user` la declara; hizo falta además corregir el literal de comparación (desviación 2) |
| `02_guardarrailes` | 8 | `property_secrets` sin ningún privilegio para `authenticated` | El mismo REVOKE |
| `03_seed` | 4 | Ningún tipo de cuarto excede 3 tareas de checklist | `checklist_tasks` existe con `CHECK slot between 1 and 3` + `UNIQUE (room_type_id, slot)`. Verde vacuamente hoy, y estructuralmente imposible de romper |
| `03_seed` | 5 | Ninguna unidad nace activa | `properties.is_active` con default `false` y los CHECK de activación |

Cambio de estado del archivo completo: `03_seed.test.sql` pasó de **abortar** (`relation "public.properties" does not exist`, `Bad plan ... ran 0`) a **correr sus 5 aserciones**. `02_guardarrailes` pasó de 1 fallo vacuo sobre 8 a 2 fallos reales sobre 8.

Además, las aserciones 2, 3 y 7 de `02_guardarrailes` siguen en verde pero ahora **dejaron de ser vacuas** para la 7: `service_role` conserva `SELECT` sobre las 8 tablas nuevas (verificado: 8 filas), así que la aserción ya discrimina.

### Rojas todavía, con su dueño (8)

| Archivo | # | Aserción | Dueño |
|---|---|---|---|
| `02_guardarrailes` | 1 | Toda tabla de `public` tiene RLS habilitada | **01-07**. Reporta las 8 tablas de este plan; es el precio explícito de la decisión "el modelo de autorización va en un archivo legible" |
| `02_guardarrailes` | 6 | Toda columna monetaria es `bigint` | **01-04 / 01-05**. Ya no reporta `properties.tarifa_huesped` ni `properties.pago_aseador`. Quedan `cleanings.tarifa_huesped`, `cleanings.pago_aseador` y `expenses.monto`, las tres como `AUSENTE` |
| `03_seed` | 1, 2, 3 | 39 unidades / 8 clusters / 5 externas | **01-06** (seed) |

### Archivos que siguen abortando enteros (32 aserciones)

| Archivo | Aserciones | Causa exacta | Dueño |
|---|---|---|---|
| `00_rls_aseos` | 16 | `relation "public.cleaning_state_transitions" does not exist` en la línea 28 | **01-05** crea la tabla; **01-07** pone las policies en verde |
| `01_invariantes` | 11 | idéntica, línea 19 | **01-04 / 01-05** |
| `04_storage` | 5 | idéntica, línea 48 | **01-08** |

Las tres causas son la misma sentencia de limpieza del seed. Ninguna es de mecánica de test. En cuanto exista `cleaning_state_transitions` los tres archivos dejarán de dar `Bad plan` y empezarán a dar `not ok` legibles, que es la puerta que `01-02-SUMMARY.md` declaró aplicable **a partir de este plan**: hoy los tres `Bad plan` siguen significando "falta schema", no "hay un `is_empty` donde va un `throws_ok`".

**Total: 13 de 45 aserciones ejecutándose (5 verdes nuevas + 5 verdes previas + 3 rojas), 32 pendientes de que exista el schema operativo.**

## Files Created/Modified

- `supabase/migrations/20260831205735_01_extensiones_y_helpers.sql` — `public.today_bog()` (`stable`, `search_path=''`) y `public.tg_set_updated_at()`. **Cero `create extension`**, con la razón medida escrita en la cabecera.
- `supabase/migrations/20260831205736_02_enums.sql` — los 6 `create type … as enum`. Verificados uno a uno contra el bloque `<interfaces>` del plan: `cleaning_state` tiene exactamente 4 valores y `notification_type` los 11.
- `supabase/migrations/20260831210111_03_catalogo.sql` — 400 líneas. Las 8 tablas, el trigger de `auth.users`, los 4 triggers de `updated_at`, los 6 índices (`profiles_active_role_idx`, `properties_nombre_uniq`, `properties_cluster_idx`, `property_rooms_prop_idx`, `mic_global_uniq`, `mic_prop_uniq`) y el bloque REVOKE de cierre.
- `supabase/tests/02_guardarrailes.test.sql` — corregido el literal de la aserción 5 (desviación 2). Ninguna otra aserción tocada.
- `.planning/phases/01-fundaci-n-schema-y-rls/deferred-items.md` — dos hallazgos nuevos (3 y 4).
- `supabase/migrations/.gitkeep` — **borrado**, como pedía la nota del plan 01-01. Era el `Skipping migration .gitkeep... (file name must match pattern "<timestamp>_name.sql")` de cada arranque del CLI.

## Verificaciones ejecutadas

| Verificación | Resultado |
|---|---|
| `npx supabase db reset --local` | exit 0, 3 migraciones aplicadas |
| `npx supabase db lint --local` | `No schema errors found` |
| `npx supabase db advisors --local --type security` | `No issues found` |
| `today_bog() = (now() at time zone 'America/Bogota')::date` | `t` |
| Enums en `public` | `6` |
| Tablas del catálogo | `8` |
| `data_type` de las columnas monetarias | `properties:pago_aseador:bigint`, `properties:tarifa_huesped:bigint`. Ninguna `numeric` |
| `property_secrets.ical_url` y `codigo_acceso` | existen; ninguna existe como columna de `properties` |
| Activar unidad gestionada sin tarifas (con responsable) | `23514 … props_active_requires_rates` |
| Activar unidad gestionada sin nada | `23514 … props_active_requires_owner` |
| 4º slot de checklist | `23514 … checklist_tasks_slot_rango` |
| Slot repetido | `23505 … checklist_tasks_room_slot_uniq` |
| `insert into auth.users` materializa `profiles` | 3 de 3: sin metadatos → `aseador` + nombre desde el email; con `role:admin` → `admin`; con `role:superadmin` → `aseador` (T-01-17) |
| `grep -rniE '^[^-]*\bcurrent_date\b' supabase/migrations` | sin coincidencias |
| `grep -rni 'create extension pgtap' supabase/migrations` | sin coincidencias |
| Migración 03 sin `enable row level security`, `create policy` ni `grant` | sin coincidencias |
| `bash scripts/ci/check-service-role.sh` | `check-service-role: OK` |
| `anon` / `authenticated` sobre `public` | 0 privilegios |
| `service_role` con `SELECT` sobre `public` | 8 de 8 |

## Decisions Made

- **Ninguna extensión.** `gen_random_uuid()` resuelve a `pg_catalog` en Postgres 17 y Supabase además la trae en `extensions`. Un `create extension pgcrypto` habría sido ruido permanente en todos los diffs de schema sin cambiar el comportamiento.
- **El trigger de `auth.users` valida el rol contra `pg_enum`, no lo castea.** Un `raw_user_meta_data->>'role'` con basura abortaría el `INSERT` en `auth.users` con `22P02` y dejaría la creación de usuarios rota desde el dashboard. Con la validación, cualquier valor que no sea una etiqueta del enum cae a `'aseador'`, que es además la mitigación de T-01-17.
- **`full_name` se resuelve con cascada en el trigger.** Es `NOT NULL` con `CHECK (length(btrim(full_name)) > 0)`, y `auth.users.email` es nullable. Orden: `full_name` del metadato → `name` del metadato → parte local del email → `'Usuario sin nombre'`. Sin esto, `insert into auth.users (id)` a secas mataría el trigger y con él la creación del usuario. Los fixtures de la suite pgTAP hacen exactamente ese insert.
- **`access_code_reads` no se crea aquí.** `ARCHITECTURE.md` la pone junto a `property_secrets`, pero tiene FK a `public.cleanings`, que no existe hasta el plan 01-05. El plan tampoco la lista entre sus 8 artefactos.
- **Cada divergencia queda escrita en el archivo, no solo en el SUMMARY.** Las 5 correcciones respecto a `ARCHITECTURE.md` están en la cabecera de la migración 03 y las dos más frágiles (`props_active_requires_rates` y el tope de 3 slots) tienen además un comentario al lado del constraint. El modo de fallo que esto previene es que alguien en la Fase 7 "arregle" el CHECK ampliándolo a las unidades externas y las vuelva inactivables.
- **Los `COMMENT ON` evitan los literales que busca CI.** El comentario de `today_bog()` describe la función prohibida sin nombrarla: `check-service-role.sh` filtra las líneas que empiezan por `--`, pero no el cuerpo de un literal SQL. Es la desviación 3 del plan 01-01 y la 2 del 01-02, ahora prevenida en vez de descubierta.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Toda tabla creada nacía legible y escribible por `anon`**

- **Found during:** Task 2, primera corrida de la suite tras aplicar la migración 03.
- **Issue:** `01-RESEARCH.md` §3.1 midió, con la CLI 2.115.0, que una tabla creada en `public` por `postgres` nacía con solo `REFERENCES, TRIGGER, TRUNCATE`. Sobre eso descansa todo el argumento del plan de que "no hay ventana sin RLS" y de que los grants pueden esperar al plan 01-07. **Con la CLI 2.116.0 que pinea `package.json` eso ya no es cierto.** Medido:
  ```
  pg_default_acl: postgres | public | r |
    {postgres=arwdDxtm/postgres, anon=arwdDxtm/postgres,
     authenticated=arwdDxtm/postgres, service_role=arwdDxtm/postgres}
  ```
  Lo instala la clave `auto_expose_new_tables` de `config.toml` (sin valor explícito; su fallback es `true`, que es el default de la nube). Consecuencia medida sobre las 8 tablas recién creadas: `anon` y `authenticated` con `SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER` sobre todas, incluida `public.property_secrets`. Es decir, el código de la cerradura y la URL iCal quedaban legibles **sin autenticar**, y con RLS deshabilitada hasta el plan 01-07. Los guardarraíles 4 y 8 lo reportaron los dos.
- **Por qué es Rule 2 y no scope creep:** el `<threat_model>` de este plan marca T-01-14 y T-01-15 como `mitigate` y les asigna la mitigación "vive en `public.property_secrets`, tabla aparte". Poner el secreto en su propia tabla no mitiga nada si esa tabla es world-readable; la mitigación estaba ausente de la implementación, que es exactamente el disparador de Rule 2.
- **Fix:** bloque `revoke all on table … from anon, authenticated` al final de la migración 03, sobre las 8 tablas que crea, con la medición y el contrato para el plan 01-07 escritos encima. **No es un `grant`**: el criterio de aceptación del plan (el archivo no contiene `enable row level security`, `create policy` ni `grant`) se cumple literalmente, y el plan 01-07 sigue siendo el dueño de decidir quién lee qué.
- **Lo que NO se hizo, a propósito:** poner `auto_expose_new_tables = false` en `config.toml`. Eso arregla local y deja la nube expuesta — los guardarraíles pasarían en verde sobre una base que no se parece a producción, que es peor que el problema. La defensa tiene que viajar en las migraciones.
- **Files modified:** `supabase/migrations/20260831210111_03_catalogo.sql`
- **Verification:** `information_schema.role_table_grants` para `anon` y `authenticated` sobre `public`: 0 filas. `service_role` conserva `SELECT` sobre las 8. Guardarraíles 4 y 8 en verde.
- **Committed in:** `6131296`

**2. [Rule 1 - Bug] El literal `search_path=` del guardarraíl 5 es insatisfacible en Postgres 17.6**

- **Found during:** Task 2, al aparecer `public.tg_handle_new_user` en los fallos del guardarraíl 5 **pese a declarar `set search_path = ''`**.
- **Issue:** la aserción comparaba con `proconfig @> array['search_path=']`. Postgres serializa `proconfig` con `flatten_set_variable_args`, y `search_path` es un GUC `LIST_QUOTE`, así que la cadena vacía se almacena **entrecomillada**. Medido en la base de la fase, por las dos vías:
  ```
  create function … set search_path = ''   ->  {"search_path=\"\""}
  alter  function … set search_path = ''   ->  {"search_path=\"\""}
  ```
  Y las propias funciones `SECURITY DEFINER` que Supabase trae de fábrica guardan la misma forma: `vault.create_secret`, `vault.update_secret` y `auth.get_auth` → `{"search_path=\"\""}`. Ninguna DDL válida puede producir `search_path=` en este Postgres: `set search_path = ""` falla con `zero-length delimited identifier`.
  El resultado es un rojo falso permanente que invita justo a lo contrario de lo que la aserción defiende: quitarle el `search_path` a la función definer para "que deje de fallar".
- **Fix:** el predicado pasa a `not exists (select 1 from unnest(proconfig) cfg where cfg in ('search_path=', 'search_path=""'))`. **No se debilita:** acepta las dos formas de almacenamiento por compatibilidad de versión (Postgres más viejos guardan la forma sin comillas) y rechaza cualquier otro valor, incluido `search_path=public`, que es lo que la aserción existe para atrapar. El comentario del archivo lleva la medición completa.
- **Por qué se toca un test:** la regla de la fase es que la suite gana sobre `ARCHITECTURE.md`, no que la suite sea infalsable. Esta aserción no expresa un requisito distinto del que cumple la migración: expresa el mismo requisito con un literal equivocado, y su rojo no señala ningún defecto del schema. Se corrige el literal, no la intención.
- **Files modified:** `supabase/tests/02_guardarrailes.test.sql`
- **Verification:** guardarraíl 5 en verde con `tg_handle_new_user` presente; las otras 7 aserciones del archivo sin cambio de estado atribuible a esta edición.
- **Committed in:** `6f8ccf6`

**3. [Rule 3 - Blocking] `npm ci` en el worktree**

- **Found during:** arranque, antes de la primera migración.
- **Issue:** el worktree no hereda `node_modules` (está en `.gitignore`), así que `npx supabase` resolvía a una versión del caché en vez de la 2.116.0 pineada. Es la misma desviación 5 del plan 01-02 y va a repetirse en cada worktree.
- **Fix:** `npm ci`. Ningún archivo versionado cambia. `npx supabase --version` → `2.116.0`.
- **Files modified:** ninguno.

---

**Total deviations:** 3 auto-corregidas (1 funcionalidad crítica de seguridad, 1 bug de test, 1 bloqueante de entorno). Ninguna amplía el alcance del plan. La 1 cierra un agujero que el plan no podía prever porque el research que lo sustenta se midió con otra versión de la CLI.

## Issues Encountered

- **La migración 03 tiene 400 líneas, casi el triple del `min_lines: 150` del plan.** La mitad es comentario. Es deliberado: cada divergencia respecto a `ARCHITECTURE.md` lleva su razón escrita al lado, porque el modo de fallo real de esta fase no es que el DDL esté mal hoy, sino que alguien lo "corrija" en la Fase 7 volviendo al documento.
- **`supabase db advisors --type security` no reporta absolutamente nada** con 8 tablas sin RLS. No es un falso negativo del advisor: es el comportamiento que `01-RESEARCH.md` §9.2 midió (sin grants, `rls_disabled_in_public` no dispara) y la razón entera por la que existe el guardarraíl 1. Vale la pena repetirlo porque invita a la conclusión contraria: *advisors limpio* no significa *base segura* mientras falte el plan 01-07.
- **`WARN: no files matched pattern: supabase/seeds/*.sql`** en cada `db reset`. Desaparece cuando el plan 01-06 escriba el seed.
- **El `project_id` de `config.toml` sigue siendo el nombre del worktree del plan 01-01** (`agent-a77b9e39ec453293b`). Fuera de alcance, ya registrado como hallazgo 1 en `deferred-items.md` por el plan 01-02. No se tocó.
- **Contradicción detectada entre el plan y la suite sobre `calendar_feeds.url`.** No es de este plan, pero bloquea al 01-04. Ver `deferred-items.md` hallazgo 4 y la sección de contrato de abajo.

## Contrato para los planes siguientes

Puntos donde seguir el documento de referencia al pie de la letra deja la suite en rojo o la base insegura. Es la continuación de la tabla del `01-02-SUMMARY.md`.

| Para | Qué | Por qué |
|---|---|---|
| **01-04** | `calendar_feeds` **SÍ lleva columna `url`** | El plan 01-03 declara lo contrario como consecuencia de mover la URL a `property_secrets`, pero `01_invariantes.test.sql` inserta el fixture del feed con `url`. Sin la columna, el `INSERT` falla con `42703` y aborta las 11 aserciones del archivo, incluidas las de FIN-01 y ASEO-07. La suite gana. Detalle y alternativas en `deferred-items.md` §4 |
| **01-04 / 01-05** | `cleanings.tarifa_huesped`, `cleanings.pago_aseador` y `expenses.monto` en `bigint` | Guardarraíl 6. Hoy las reporta como `AUSENTE`; el `LEFT JOIN` hace que una columna ausente falle igual que una del tipo equivocado |
| **01-05** | `public.cleaning_state_transitions` con columna `cleaning_id` | Es la primera sentencia de 3 de los 5 archivos de la suite. Mientras no exista, 32 aserciones no llegan a ejecutarse |
| **01-05** | `cleanings.origin` **sin default**; máquina de estados como trigger **BEFORE** con errcode `P0001` | Los fixtures pasan `origin` siempre; la aserción 9 exige `P0001` y no `23514` |
| **01-07** | Revocar **default privileges** para `anon` **y `authenticated`**, no solo para `anon` | La migración propuesta en `01-RESEARCH.md` §3.1 se escribió con la medición de la CLI 2.115.0 y solo contempla `anon`. Con la 2.116.0, `authenticated` nace con INSERT/UPDATE/DELETE sobre todo, lo que rompe "el aseador no escribe directo" y el guardarraíl 8 |
| **01-07** | Repetir el revoke sobre las tablas de las migraciones 04, 05 y 06 | El revoke de la migración 03 solo cubre sus 8 tablas. Lo limpio es una pasada final sobre `all tables in schema public` |
| **01-07** | `revoke all on function … from public, anon` en cada RPC | El ACL por defecto de funciones es `anon=X`: `anon` recibe EXECUTE sobre toda función nueva de `public`. Ya lo advierte `01-RESEARCH.md` §3.3; con la CLI nueva sigue vigente |
| **01-07** | `grant select on public.access_code_reads to authenticated` + policy solo-admin | Requisito de la aserción 16 de `00_rls_aseos`, en contra de `01-RESEARCH.md` §3.1. Ya documentado como desviación 4 del plan 01-02 |
| **01-09** | Aserción de que existen por nombre los CHECK e índices que consume `mapDbError()` | `properties_nombre_uniq` ya existe con ese nombre exacto. Faltan `cleanings_one_active_per_property_date`, `cleanings_one_live_per_reservation` y `cl_unmanaged_is_inert` |

## Known Stubs

Ninguno. Las tres migraciones están completas y aplicadas. Lo que falta no es lógica pendiente en estos archivos: son tablas de otros planes.

Dos cosas que **parecen** stubs y no lo son:

- **`app_settings` queda vacía.** Es una tabla de configuración; sus 5 claves (`retention_months`, `retention_notice_days`, `feed_dead_after_minutes`, `sync_interval_minutes`, `access_code_window_days`) las siembra el plan 01-06. Las claves previstas están escritas como comentario en la migración.
- **`room_types` y `checklist_tasks` quedan vacías.** El catálogo provisional de tipos de cuarto es dato de seed, no de schema, y `01-CONTEXT.md` lo quiere editable en base de datos sin migración.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: privilege-surface | `supabase/migrations/*_03_catalogo.sql` (y toda migración futura de `public`) | Los **default privileges** de `public` siguen otorgando `arwdDxtm` a `anon` y `authenticated` sobre toda tabla nueva, y `EXECUTE` sobre toda función nueva. La migración 03 lo revoca **solo para sus 8 tablas**. Cada tabla de las migraciones 04-06 y de las Fases 2-9 reintroduce el agujero hasta que el plan 01-07 revoque los default privileges. Superficie nueva no prevista en el `<threat_model>` del plan, que asumía la medición de la CLI 2.115.0 |
| threat_flag: auth-path | `public.tg_handle_new_user()` | Nueva ruta de autorización: el rol de dominio de todo usuario se decide leyendo `raw_user_meta_data->>'role'` en un trigger `SECURITY DEFINER`. Está mitigada en profundidad (`enable_signup = false` del plan 01-01, validación contra `pg_enum`, default `'aseador'`, `search_path = ''`), pero es el único punto del sistema donde un dato de entrada decide un privilegio. Si alguna Fase futura reactiva el signup, o expone un endpoint que pase metadatos del cliente a `auth.admin.createUser`, esto se convierte en escalada directa a `admin`. Merece una aserción pgTAP propia en el plan 01-09 |

## User Setup Required

Ninguna.

## Next Phase Readiness

- El plan 01-04 puede escribir la migración de calendarios de inmediato: `properties`, `property_secrets` y `profiles` existen con los nombres del contrato, y `today_bog()` está disponible para los índices y CHECK que la necesiten. **Antes de escribir una línea, resolver el conflicto de `calendar_feeds.url`** (`deferred-items.md` §4).
- El plan 01-05 desbloquea 32 de las 45 aserciones en cuanto exista `public.cleaning_state_transitions`: es la primera sentencia de `00_rls_aseos`, `01_invariantes` y `04_storage`, y hoy mata los tres archivos antes de la primera aserción.
- **Desde el plan 01-05, la puerta `sin Bad plan` empieza a ser exigible de verdad.** El `01-02-SUMMARY.md` la declaró aplicable "a partir del 01-03"; con precisión, lo que aplica desde este plan es sobre `02_guardarrailes` y `03_seed`, que ya corren enteros. Los otros tres siguen abortando por schema ausente, no por mecánica.
- La tabla *Contrato para los planes siguientes* de este documento es la lista de verificación de quien escriba las migraciones 04 a 08. Las tres filas del plan 01-07 son las que el research no pudo anticipar.

---
*Phase: 01-fundaci-n-schema-y-rls*
*Completed: 2026-08-31*

## Self-Check: PASSED

- 6 archivos declarados verificados en disco: las 3 migraciones, `02_guardarrailes.test.sql`, este SUMMARY y `deferred-items.md`.
- 4 commits verificados en el log: `f00d813`, `6131296`, `6f8ccf6`, `f9f1994`.
- `git diff --diff-filter=D --name-only d38a06f..HEAD` devuelve exactamente `supabase/migrations/.gitkeep`: el único borrado es el intencional que pedía la nota del plan 01-01.
- Árbol de trabajo limpio.
- `supabase/migrations/.gitkeep` ya no existe; `db reset` dejó de emitir `Skipping migration .gitkeep...`.
- `STATE.md` y `ROADMAP.md` sin tocar, como exige la ejecución en worktree paralelo.
