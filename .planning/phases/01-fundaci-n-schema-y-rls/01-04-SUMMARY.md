---
phase: 01-fundaci-n-schema-y-rls
plan: 04
subsystem: database
tags: [postgres, supabase, migraciones, ddl, indices-parciales, invariantes, retencion, evidencia, auditoria]

# Dependency graph
requires:
  - "01-03: public.properties, public.profiles, public.property_rooms, public.checklist_tasks, public.missing_item_catalog, public.today_bog(), public.tg_set_updated_at() y los 6 enums"
  - "01-02: las aserciones pgTAP que este plan pone (y no pone) en verde"
provides:
  - "public.calendar_feeds — un feed por (property_id, provider), SIN columna url, con is_authoritative y las 11 columnas de salud del feed"
  - "public.calendar_reservations — starts_on/ends_on como date, res_dates_ok, unique (feed_id, uid), payload_hash y disappeared_at"
  - "public.cleanings — la tabla central, con los 7 CHECK de forma, is_managed snapshoteado, dinero en bigint y las 3 columnas de retención"
  - "cleanings_one_active_per_property_date — el invariante ASEO-07, índice único parcial con IS DISTINCT FROM"
  - "cleanings_one_live_per_reservation — idempotencia del pipeline iCal"
  - "cl_unmanaged_is_inert — gestión externa como fila inerte impuesta por la base, no por convención de código"
  - "legal_hold, legal_hold_reason y deleted_at en cleanings; deleted_at en cleaning_photos; cleanings_legal_hold_idx"
  - "public.cleaning_checklist_items con las etiquetas snapshoteadas"
  - "public.damages, public.expenses (monto bigint), public.missing_item_reports, public.missing_item_lines con mil_exactly_one_source"
  - "public.cleaning_photos con photo_exactly_one_owner, storage_path unique y la convención de ruta {cleaning_id}/{kind}/{uuid}.{ext}"
  - "public.access_code_reads — bitácora de lectura del código, con cleaning_id ON DELETE SET NULL"
  - "REVOKE de anon y authenticated sobre las 10 tablas nuevas y sobre la secuencia de access_code_reads"
affects:
  - "01-06: tg_cleanings_snapshot() debe rellenar is_managed, hora_limite y state, que nacen NOT NULL / anulables sin default. Sin ese trigger, ningún fixture de la suite puede insertar un aseo"
  - "01-06: cleaning_state_transitions sigue siendo la primera sentencia de 3 de los 5 archivos de la suite"
  - "01-07: hereda 10 tablas más sin RLS; el guardarraíl 1 ahora reporta 18. Y necesita grant select sobre access_code_reads con policy solo-admin"
  - "01-08: las policies de storage.objects dependen de que el primer segmento de storage_path sea el cleaning_id; confirm_cleaning() materializa cleaning_checklist_items; reveal_access_code() escribe access_code_reads"
  - "01-09: mapDbError() discrimina por los nombres cleanings_one_active_per_property_date, cleanings_one_live_per_reservation y cl_unmanaged_is_inert, que ya existen con esos nombres exactos"
  - "Fase 3 (iCal): calendar_feeds no porta la URL; el worker la resuelve desde property_secrets.ical_url. ends_on es el día del aseo, no restar un día"
  - "Fase 9 (retención): las columnas y el índice existen; falta solo el job"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "IS DISTINCT FROM y nunca <>, tanto en el índice parcial como en los CHECK de forma"
    - "El bloque REVOKE de cierre se repite en cada migración que cree tablas, hasta que 01-07 revoque los default privileges"
    - "Cada divergencia respecto a ARCHITECTURE.md queda escrita en la cabecera del propio archivo, numerada y con su razón"
    - "Las columnas que rellena un trigger de otra migración nacen sin default: un default sería una respuesta inventada"
    - "Las convenciones que otro plan consume (ruta de Storage, nombres de índice) van como COMMENT ON, no solo en el SUMMARY"

key-files:
  created:
    - "supabase/migrations/20260831212658_04_operacion.sql"
  modified: []
  deleted: []

key-decisions:
  - "calendar_feeds se construye SIN columna url y con unique (property_id, provider): el orchestrator resolvió la contradicción del hallazgo 4 de deferred-items.md quitando `url` del fixture, en commit 32c221f"
  - "El bloque REVOKE se repite aquí sobre las 10 tablas nuevas, más la secuencia de access_code_reads: sin él nacen escribibles por anon sin autenticar"
  - "is_managed, hora_limite y state nacen sin default a propósito; los rellena tg_cleanings_snapshot() del plan 01-06"
  - "cl_pendiente_shape NO exige confirmado_at is null: 'no puedo' devuelve el aseo a pendiente conservando confirmado_at"
  - "access_code_reads.cleaning_id es ON DELETE SET NULL y no CASCADE: el rastro de quién vio el código sobrevive a la purga del aseo"
  - "Los criterios de aceptación del plan sobre las aserciones 4-8 de 01_invariantes son inalcanzables en este plan: dependen del trigger de snapshot del 01-06. Medido, no supuesto"

requirements-completed: [ASEO-07, FIN-01, PLAT-05, PLAT-06]

# Metrics
duration: 42min
completed: 2026-08-31
---

# Phase 1 Plan 04: Migración 04, el núcleo operativo Summary

**Una migración de 576 líneas que crea las 10 tablas operativas en el único orden que satisface las FK, con los dos índices únicos parciales de ASEO-07 escritos con `IS DISTINCT FROM`, los 7 `CHECK` de forma de `cleanings`, el dinero en `bigint` y las columnas de retención (`legal_hold`, `deleted_at`) nacidas en el schema inicial aunque el job sea de la Fase 9.**

## Performance

- **Duration:** ~42 min
- **Tasks:** 2 de 2
- **Migración creada:** 1 archivo, 576 líneas (10 tablas, 2 índices únicos parciales, 12 índices operativos, 1 trigger de `updated_at`)
- **Aserciones pgTAP que pasaron de rojo a verde:** 1 (guardarraíl 6)
- **Invariantes verificados a mano:** 19 casos, 19 correctos

## Accomplishments

- `supabase db reset --local` aplica las 4 migraciones desde cero, sale 0. `supabase db lint --local` limpio. `supabase db advisors --local --type security` sin hallazgos.
- **Los dos índices únicos parciales existen y se comportan en las tres semánticas que exige ASEO-07**, verificado ejecutando el DDL contra la base de la fase, no razonando sobre él. Detalle abajo.
- `cl_unmanaged_is_inert` convierte "gestión externa = sin estado, sin aseador, fuera de métricas" en una garantía de base. Medido: asignar aseador a una unidad externa da `23514` con el nombre del constraint.
- `legal_hold`, `legal_hold_reason` y `deleted_at` nacen aquí, con su `CHECK` de coherencia y su índice parcial. El plan de Fase 9 solo tendrá que escribir el job.
- **Guardarraíl 6 (dinero en `bigint`) pasó a verde.** Era la última pieza que faltaba: `properties` ya estaba en el plan 03, y este plan aporta `cleanings.tarifa_huesped`, `cleanings.pago_aseador` y `expenses.monto`.
- El agujero de privilegios por defecto de la CLI 2.116.0, descubierto por el plan 01-03, se cerró también para las 10 tablas de este archivo **y para la secuencia** del `bigserial` de `access_code_reads`. `anon` y `authenticated` siguen con cero privilegios sobre `public`, con 18 tablas ya creadas.
- La convención de ruta de Storage (`{cleaning_id}/{kind}/{uuid}.{ext}`) quedó escrita como `COMMENT ON COLUMN`, no solo en este documento: las policies de `storage.objects` del plan 01-08 autorizan con `(storage.foldername(name))[1]`, y cambiar la convención rompería la autorización en silencio.

## Task Commits

1. **Task 1: calendarios y `cleanings` con sus invariantes duros** — `6b96232` (feat)
2. **Task 2: checklist ejecutado, evidencia, reportes de campo y bitácora de códigos** — `5a453c3` (feat)

## Los invariantes, verificados uno a uno

`01_invariantes.test.sql` todavía no puede ejecutarse (razón exacta en *Desviaciones*), así que los 19 casos se ejercieron a mano sobre la base recién reseteada, con `savepoint`/`rollback to` para aislar cada uno. Es la misma semántica que ejercerán las aserciones cuando el plan 01-06 desbloquee el archivo.

### `cleanings_one_active_per_property_date` — las cuatro aristas de 01-RESEARCH.md §3.2

| Caso | Esperado | Medido |
|---|---|---|
| 2º aseo activo, mismo apto + fecha | `23505` | `duplicate key … "cleanings_one_active_per_property_date"` ✅ |
| 2 filas `cancelada`, mismo apto + fecha | conviven | `INSERT 0 2` ✅ |
| Cancelar y re-crear el mismo día | permitido | `UPDATE 1` + `INSERT 0 1` ✅ |
| 2 filas informativas (`state IS NULL`), mismo apto + fecha | `23505` | `duplicate key … "cleanings_one_active_per_property_date"` ✅ |

La cuarta es la que se pierde en silencio si el índice se escribe con `<>`. `indexdef` confirmado en `pg_indexes`: `WHERE (state IS DISTINCT FROM 'cancelada'::cleaning_state)`.

### Resto de invariantes

| Caso | Esperado | Medido |
|---|---|---|
| 2 aseos vivos con el mismo `reservation_id` | `23505` | `… "cleanings_one_live_per_reservation"` ✅ |
| 2 feeds del mismo proveedor para el mismo apto | `23505` | `… "calendar_feeds_prop_provider_uniq"` ✅ |
| Aseador en unidad de gestión externa | `23514` | `… "cl_unmanaged_is_inert"` ✅ |
| `legal_hold = true` sin razón | `23514` | `… "cl_legal_hold_reason"` ✅ |
| `legal_hold = true` con razón | OK | `INSERT 0 1` ✅ |
| Foto sin ningún dueño | `23514` | `… "photo_exactly_one_owner"` ✅ |
| Foto con dos dueños (`damage_id` + `expense_id`) | `23514` | `… "photo_exactly_one_owner"` ✅ |
| Foto con exactamente un dueño | OK | `INSERT 0 1` ✅ |
| `storage_path` repetido | `23505` | `… "cleaning_photos_storage_path_key"` ✅ |
| `mime_type = 'image/heic'` | `23514` | `… "cleaning_photos_mime_type_check"` ✅ |
| Gasto con `monto = 0` | `23514` | `… "expenses_monto_check"` ✅ |
| Línea de faltante con catálogo **y** texto libre | `23514` | `… "mil_exactly_one_source"` ✅ |
| Línea de faltante sin ninguna fuente | `23514` | `… "mil_exactly_one_source"` ✅ |
| Línea desde catálogo / línea de texto libre | OK las dos | `INSERT 0 1` ×2 ✅ |
| Borrar el aseo con bitácora de código escrita | la fila sobrevive con `cleaning_id` nulo | `filas_bitacora = 1`, `con_aseo = 0` ✅ |

El último es la mitigación de T-01-23 medida de verdad: si `cleaning_id` fuera `CASCADE`, la purga de la Fase 9 sería un borrador de evidencia de acceso.

## Aserciones pgTAP: qué se movió y qué falta

Corrida completa con `npx supabase test db --local` sobre la base recién reseteada.

### De rojo a verde en este plan (1)

| Archivo | # | Aserción | Por qué pasó |
|---|---|---|---|
| `02_guardarrailes` | 6 | Toda columna monetaria es `bigint` | Aportó las 3 que faltaban: `cleanings.tarifa_huesped`, `cleanings.pago_aseador` y `expenses.monto`. El plan 03 ya había puesto las 2 de `properties`. El `LEFT JOIN` de la aserción hacía que una columna AUSENTE fallara igual que una del tipo equivocado, así que la aserción no podía pasar sin este plan |

### Verdes que dejaron de ser vacuas

- **Guardarraíl 4** (`anon` sin ningún privilegio sobre `public`): seguía verde, pero ahora discrimina sobre 18 tablas en vez de 8. Sin el bloque REVOKE de esta migración habría listado 7 privilegios × 10 tablas nuevas, incluida `access_code_reads`, que es la bitácora de acceso a las cerraduras y sobre la que `anon` tenía `TRUNCATE` — y `TRUNCATE` ignora la RLS por completo, así que ni la migración 07 lo taparía por sí sola.
- **Guardarraíl 7** (`service_role` lee todas las tablas): 18 de 18, medido.

### Rojas todavía, con su dueño

| Archivo | # | Aserción | Dueño |
|---|---|---|---|
| `02_guardarrailes` | 1 | Toda tabla de `public` tiene RLS habilitada | **01-07**. Ahora reporta 18 tablas en vez de 8. Es el precio explícito y ya declarado de la decisión "el modelo de autorización va en un archivo legible" |
| `03_seed` | 1, 2, 3 | 39 unidades / 8 clusters / 5 externas | **01-05** (seed), que corre en paralelo a este plan |

### Archivos que siguen abortando enteros (32 aserciones)

Sin cambio respecto al plan 03. La causa es la misma sentencia y sigue siendo `relation "public.cleaning_state_transitions" does not exist`:

| Archivo | Aserciones | Línea | Dueño |
|---|---|---|---|
| `00_rls_aseos` | 16 | 28 | **01-06** crea la tabla; **01-07** pone las policies en verde |
| `01_invariantes` | 11 | 19 | **01-06** |
| `04_storage` | 5 | 48 | **01-06** crea la tabla; **01-08** pone las policies |

**Total: 13 de 45 aserciones ejecutándose (6 verdes + 1 nueva verde + 4 rojas conocidas), 32 pendientes del plan 01-06.**

## Files Created/Modified

- `supabase/migrations/20260831212658_04_operacion.sql` — 576 líneas. Las 10 tablas en el orden `calendar_feeds → calendar_reservations → cleanings → cleaning_checklist_items → damages/expenses/missing_item_reports → missing_item_lines → cleaning_photos → access_code_reads`, los 2 índices únicos parciales, 12 índices operativos, el trigger `cleanings_set_updated_at`, 9 `COMMENT ON` y el bloque REVOKE de cierre. La cabecera lista las 5 divergencias respecto a `ARCHITECTURE.md`, numeradas y referenciadas desde el propio DDL.

Ningún otro archivo tocado. `STATE.md`, `ROADMAP.md` y `supabase/seeds/` intactos, como exige la ejecución en worktree paralelo con el plan 01-05.

## Verificaciones ejecutadas

| Verificación | Resultado |
|---|---|
| `npx supabase db reset --local` | exit 0, 4 migraciones aplicadas |
| `npx supabase db lint --local` | `No schema errors found` |
| `npx supabase db advisors --local --type security` | `No issues found` |
| `indexdef` de `cleanings_one_active_per_property_date` | `WHERE (state IS DISTINCT FROM 'cancelada'::cleaning_state)` |
| `indexdef` de `cleanings_one_live_per_reservation` | `WHERE ((reservation_id IS NOT NULL) AND (state IS DISTINCT FROM 'cancelada'::cleaning_state))` |
| `legal_hold`, `legal_hold_reason`, `deleted_at` en `cleanings` | 3 de 3 |
| `cleanings_legal_hold_idx` | existe, `WHERE legal_hold` |
| `calendar_feeds.url` | 0 columnas |
| `cleanings.tarifa_huesped` / `pago_aseador` | `bigint` / `bigint` |
| `expenses.monto` | `bigint` |
| Los 7 `CHECK` de forma de `cleanings` | los 7, con los nombres de `ARCHITECTURE.md`, más `cl_legal_hold_reason` |
| Las 7 tablas de la tarea 2 | 7 de 7 |
| `photo_exactly_one_owner` + `mil_exactly_one_source` | 2 de 2 |
| `cleaning_photos.storage_path` unique + `deleted_at` | ambos existen |
| `confdeltype` de `access_code_reads_cleaning_id_fkey` | `n` (SET NULL), no `c` |
| `anon` / `authenticated` sobre `public` (tablas) | `NINGUNO` |
| `anon` / `authenticated` sobre `public` (secuencias) | `NINGUNO` |
| `service_role` con `SELECT` sobre `public` | 18 de 18 |
| `grep -rniE '^[^-]*\bcurrent_date\b' supabase/migrations` | sin coincidencias |
| `bash scripts/ci/check-service-role.sh` | `check-service-role: OK` |
| Migración 04 sin `enable row level security`, `create policy` ni `grant` | sin coincidencias |
| 19 casos de invariante ejercidos a mano | 19 de 19 correctos |

## Decisions Made

- **`calendar_feeds` sin columna `url`, unicidad `(property_id, provider)`.** El hallazgo 4 de `deferred-items.md` planteaba una contradicción real entre el plan y la suite; el orchestrator la resolvió en el commit `32c221f` quitando `url` del fixture de `01_invariantes.test.sql`. La resolución es la correcta: la URL de exportación iCal es secreta e inadivinable, un `GET` revela la ocupación completa del apartamento sin autenticación, y `calendar_feeds` es justo la tabla que el admin consulta para ver la salud del feed. Ninguna aserción probaba la columna; el fixture solo existía para satisfacer la FK de `calendar_reservations`. Mitiga T-01-26.
- **El bloque REVOKE se repite en esta migración.** No es duplicación gratuita: sin él, las 10 tablas nuevas nacen con `arwdDxtm` para `anon` y `authenticated` por el `pg_default_acl` que instala la CLI 2.116.0, y la RLS no llega hasta el plan 01-07. La solución limpia (revocar los *default privileges*) sigue siendo del plan 01-07; esto es el parche que mantiene la base coherente mientras tanto. Se añadió además `revoke all on sequence public.access_code_reads_id_seq`, que el plan 03 no necesitaba porque ninguna de sus tablas usa `bigserial`.
- **`is_managed`, `hora_limite` y `state` nacen sin default.** Los rellena `tg_cleanings_snapshot()` en el plan 01-06. Un default sería una respuesta inventada: `is_managed` copia `properties.gestion_vivaguest` y `hora_limite` copia `properties.hora_limite`; ponerles un valor fijo aquí haría que un fallo del trigger pasara desapercibido en vez de reventar con `23502`.
- **`cl_pendiente_shape` deja pasar `confirmado_at` no nulo.** Es deliberado y frágil: "no puedo" devuelve el aseo a `pendiente` sin aseador **conservando** `confirmado_at`. Añadir `confirmado_at is null` a ese CHECK rompería el flujo de la Fase 4, así que la razón está escrita al lado del constraint.
- **Los CHECK de forma usan `is distinct from` y no `<>`,** igual que el índice. Con `<>` la rama izquierda es `NULL` para las filas informativas y el CHECK pasaría por vacuidad accidental en vez de por decisión.
- **`cleaning_photos` se creó con sus 4 FK en su sitio, no con `alter table … add constraint`.** `ARCHITECTURE.md` ofrece la alternativa "si se quiere un solo archivo"; el orden correcto cabe en un solo archivo sin trucos, y las FK diferidas son una fuente de olvidos.
- **Índices que `ARCHITECTURE.md` no lista y se añadieron:** `damages_cleaning_idx`, `damages_open_idx` (parcial `where resolved_at is null`, para el panel de daños abiertos), `expenses_cleaning_idx`, `mir_cleaning_idx`, `mil_report_idx` y `cleaning_photos_checklist_idx`. Son índices sobre columnas de FK que se consultan siempre desde el aseo o el reporte padre; sin ellos cada pantalla de detalle es un seq scan. `cleanings_legal_hold_idx` es el que pide el plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `npm ci` en el worktree**

- **Found during:** arranque, antes de escribir DDL.
- **Issue:** el worktree no hereda `node_modules` (está en `.gitignore`), así que `npx supabase` resolvía a lo que hubiera en caché en vez de a la 2.116.0 pineada en `package.json`. Es la misma desviación 5 del plan 01-02 y la 3 del 01-03, y se va a repetir en cada worktree de la fase.
- **Fix:** `npm ci`. Ningún archivo versionado cambia. `npx supabase --version` → `2.116.0`.
- **Files modified:** ninguno.

**2. [Rule 2 - Missing Critical] `revoke` también sobre la secuencia del `bigserial`**

- **Found during:** Task 2, al escribir el bloque de cierre.
- **Issue:** `access_code_reads.id` es `bigserial`, lo que crea `public.access_code_reads_id_seq`. El `pg_default_acl` de la CLI 2.116.0 también cubre secuencias (`alter default privileges … on sequences`), así que `anon` nacía con `USAGE` y `UPDATE` sobre ella. Ninguna de las 8 tablas del plan 03 usaba `bigserial`, así que el problema no se había manifestado. El guardarraíl 4 no lo habría atrapado: consulta `information_schema.role_table_grants`, que no incluye secuencias.
- **Por qué es Rule 2 y no scope creep:** el `<threat_model>` marca T-01-23 como `mitigate` con `access_code_reads` como mitigación. Una secuencia escribible por `anon` no filtra datos, pero es superficie que no tiene razón de existir sobre la tabla de auditoría de las cerraduras, y su ausencia en el guardarraíl la hace invisible.
- **Fix:** `revoke all on sequence public.access_code_reads_id_seq from anon, authenticated;` al final del archivo.
- **Verification:** `information_schema.role_usage_grants` para `anon` y `authenticated` sobre `public`: 0 filas.
- **Committed in:** `5a453c3`

### Criterio de aceptación inalcanzable (no corregido, documentado)

**3. Las aserciones 4-8 de `01_invariantes.test.sql` NO pueden pasar en este plan. Dependen del plan 01-06.**

El `<objective>` y el criterio de aceptación de la tarea 2 dicen que al terminar este plan las aserciones de ASEO-07 y de fila inerte (4, 5, 6, 7, 8) deben estar en verde. **Es inalcanzable, y no por un defecto de esta migración.** Hay dos bloqueos encadenados, los dos medidos y no supuestos:

1. **`relation "public.cleaning_state_transitions" does not exist`**, línea 19 del archivo. Es la primera sentencia del bloque de limpieza y la tabla es de la migración 05 (plan 01-06, artefacto declarado en su propio frontmatter). El archivo aborta con `Bad plan. You planned 11 tests but ran 0` antes de la primera aserción.

2. **Y aunque esa tabla existiera, el archivo seguiría abortando.** Se midió creando la tabla ad-hoc en la base y volviendo a correr el archivo:
   ```
   psql:.../01_invariantes.test.sql:76: ERROR:  null value in column "is_managed"
     of relation "cleanings" violates not-null constraint
   ```
   Los fixtures insertan aseos con `(id, property_id, origin, scheduled_date, aseador_id)` y no pasan `is_managed`, `hora_limite` ni `state`. Esas tres columnas las rellena `tg_cleanings_snapshot()`, que **el propio `01-04-PLAN.md` prohíbe explícitamente crear aquí** ("No habilitar RLS, ni policies, ni grants, ni el trigger de snapshot… el trigger, en el plan 06"). La tabla ad-hoc se eliminó tras la medición; la base quedó tal como la deja `db reset`.

**Por qué no se "arregló":** las dos salidas posibles eran invadir el alcance del plan 01-06 (crear el trigger y la tabla aquí, contradiciendo una instrucción explícita del plan y pisando a otro ejecutor) o poner defaults en `is_managed`/`hora_limite`/`state` para que los fixtures pasen. La segunda es peor: un `default false` en `is_managed` haría que cualquier aseo insertado sin trigger se comportara como fila inerte, y `cl_unmanaged_is_inert` lo rechazaría o lo aceptaría según el caso, produciendo verdes accidentales. La suite gana sobre `ARCHITECTURE.md`, pero eso no la vuelve ejecutable antes de que exista el schema que necesita.

**Consecuencia práctica:** los invariantes que este plan entrega están verificados a mano (tabla de 19 casos arriba) con exactamente la misma semántica que las aserciones. En cuanto el plan 01-06 aplique su migración 05, las aserciones 4-8 deberían pasar sin tocar nada de esta migración. Si no pasan, el defecto estará en el trigger, no aquí.

---

**Total deviations:** 2 auto-corregidas (1 bloqueante de entorno, 1 de superficie de privilegios) + 1 criterio de aceptación documentado como inalcanzable por dependencia. Ninguna amplía el alcance del plan.

## Issues Encountered

- **La migración tiene 576 líneas, contra el `min_lines: 220` del plan.** Cerca de la mitad es comentario, con el mismo criterio del plan 03: cada divergencia respecto a `ARCHITECTURE.md` lleva su razón al lado, porque el modo de fallo real de esta fase no es que el DDL esté mal hoy, sino que alguien lo "corrija" en la Fase 3 o 7 volviendo al documento. Los tres sitios más frágiles (`cl_pendiente_shape`, el par de índices parciales y la convención de ruta de Storage) llevan además una nota explícita de qué se rompe si se cambian.
- **`WARN: no files matched pattern: supabase/seeds/*.sql`** en cada `db reset`. Desaparece cuando aterrice el plan 01-05, que corre en paralelo.
- **`supabase db advisors --type security` sigue sin reportar nada** con 18 tablas sin RLS, por la misma razón medida en `01-RESEARCH.md` §9.2: sin grants, `rls_disabled_in_public` no dispara. *Advisors limpio* no significa *base segura* mientras falte el plan 01-07. Es el guardarraíl 1 el que lo cubre, y sigue rojo a propósito.
- **El `project_id` de `config.toml` sigue siendo el nombre del worktree del plan 01-01** (`agent-a77b9e39ec453293b`). Ya registrado como hallazgo 1 en `deferred-items.md`. No se tocó. Consecuencia operativa de esta ejecución paralela: los planes 01-04 y 01-05 comparten el mismo contenedor de Postgres local, así que un `db reset` de uno pisa el estado del otro. No afecta a lo versionado.

## Contrato para los planes siguientes

Continuación de las tablas del `01-02-SUMMARY.md` y del `01-03-SUMMARY.md`. Solo lo nuevo que introduce este plan.

| Para | Qué | Por qué |
|---|---|---|
| **01-06** | `tg_cleanings_snapshot()` debe ser un trigger **BEFORE INSERT** y rellenar **tres** columnas, no solo las dos financieras: `is_managed` (desde `properties.gestion_vivaguest`), `hora_limite` (desde `properties.hora_limite`) y `state` (`'pendiente'` si `is_managed`, `NULL` si no) | Las tres son `NOT NULL` o están sujetas a `cl_managed_has_state`, y ningún fixture de la suite las pasa. Medido: sin ellas el `INSERT` de la línea 71 de `01_invariantes` da `23502` |
| **01-06** | El orden importa: el `BEFORE INSERT` de snapshot debe fijar `is_managed` **antes** de que se evalúen `cl_unmanaged_is_inert` y `cl_managed_has_state` | Los CHECK se evalúan después de los triggers `BEFORE`, así que esto funciona; solo hay que no convertirlo en `AFTER` |
| **01-06** | La guarda de transiciones va como trigger **BEFORE UPDATE** con `errcode = 'P0001'` | Aserción 9 de `01_invariantes`. Un `CHECK` daría `23514` y la aserción no discriminaría entre "la forma es inválida" y "la transición es ilegal". Los `cl_*_shape` de esta migración ya cubren la forma |
| **01-06** | `cleaning_state_transitions` necesita `cleaning_id` y ser borrable con `delete from public.cleaning_state_transitions` sin `where` como `postgres` | Es la primera sentencia de `00_rls_aseos`, `01_invariantes` y `04_storage`. Mientras no exista, 32 aserciones no llegan a ejecutarse |
| **01-06** | Repetir el bloque REVOKE para las tablas de las migraciones 05 y 06 (`cleaning_state_transitions`, `notifications`, `push_subscriptions`, `storage_deletion_queue`) **y para sus secuencias si usan `bigserial`** | Guardarraíles 4 y 8. `storage_deletion_queue` está nombrada explícitamente en el guardarraíl 8 |
| **01-07** | El guardarraíl 1 ahora reporta **18 tablas**, no 8 | No es una regresión, es el alcance que hereda |
| **01-07** | `revoke insert, update, delete on public.cleaning_photos from authenticated` (o simplemente no otorgarlos) | La inmutabilidad de la evidencia (T-01-25) se impone por **ausencia de grant**, no por revoke posterior. El `storage_path unique` de esta migración es solo la mitad |
| **01-08** | La convención de ruta es `{cleaning_id}/{kind}/{uuid}.{ext}` y el **primer segmento debe ser el `cleaning_id`** | Las policies de `storage.objects` autorizan con `(storage.foldername(name))[1]::uuid`. Está como `COMMENT ON COLUMN public.cleaning_photos.storage_path` |
| **01-08** | `reveal_access_code()` escribe `access_code_reads` **antes** del `return query`, en la misma transacción | Aserción 12 de `00_rls_aseos`. La tabla ya existe con la forma exacta que espera |
| **01-08** | `confirm_cleaning()` materializa `cleaning_checklist_items` copiando `room_label`, `task_label` y `requiere_foto` como snapshot | Las tres son `NOT NULL` y no tienen default: la función tiene que leerlas de `property_rooms` × `checklist_tasks` |
| **01-09** | `mapDbError()` puede discriminar ya por `cleanings_one_active_per_property_date`, `cleanings_one_live_per_reservation`, `cl_unmanaged_is_inert`, `photo_exactly_one_owner` y `mil_exactly_one_source` | Los cinco existen con esos nombres exactos, verificados en `pg_constraint` / `pg_indexes` |
| **Fase 3 (iCal)** | Toda consulta de "aseos vivos" se escribe `state is distinct from 'cancelada'`, nunca `<>` | Medido con `EXPLAIN` en `01-RESEARCH.md` §3.2.2: con `<>` sale `Seq Scan` incluso con `enable_seqscan = off`. Para la unicidad da igual; para las consultas no |
| **Fase 3 (iCal)** | La URL del feed se resuelve desde `property_secrets.ical_url`; `calendar_feeds` no la tiene. Y `ends_on` **es** la fecha del aseo: no restar un día | `DTEND` en eventos de día completo es exclusivo |
| **Fase 9 (retención)** | Las columnas y el índice ya existen: `cleanings.legal_hold` + `legal_hold_reason` + `deleted_at` + `cleanings_legal_hold_idx`, y `cleaning_photos.deleted_at`. Solo falta el job | Nacieron aquí precisamente para que la Fase 9 no tenga que migrar datos operativos en vivo (PITFALLS.md nº 18) |

## Known Stubs

Ninguno. La migración está completa y aplicada. Lo que falta no es lógica pendiente en este archivo: son el trigger de snapshot, la máquina de estados y las policies, que pertenecen a los planes 01-06, 01-07 y 01-08 por decisión explícita del plan.

Tres cosas que **parecen** stubs y no lo son:

- **`cleanings.is_managed`, `hora_limite` y `state` sin default.** No es un olvido: es el contrato con `tg_cleanings_snapshot()`. Ver la tabla de contrato.
- **`legal_hold` y `deleted_at` sin ningún consumidor.** El job de purga es de la Fase 9. La columna es lo único que se entrega hoy, y a propósito.
- **`calendar_feeds` con 11 columnas de salud que nadie escribe.** Las escribe el worker de sync de la Fase 3. La tabla nace completa para que ese worker no necesite una migración propia.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: privilege-surface | `supabase/migrations/*_04_operacion.sql` | Superficie nueva que el `<threat_model>` del plan no contempla: `access_code_reads` es la primera tabla del proyecto con `bigserial`, y el `pg_default_acl` de la CLI 2.116.0 cubre **secuencias** además de tablas. Se revocó aquí (desviación 2), pero **el guardarraíl 4 no lo habría detectado**: consulta `information_schema.role_table_grants`, que no incluye secuencias. Toda tabla futura con `bigserial` o `identity` reintroduce el hueco de forma invisible para la suite. El plan 01-09 debería añadir una aserción equivalente sobre `information_schema.role_usage_grants`, y el 01-07 debe incluir `alter default privileges … revoke all on sequences from anon, authenticated` |
| threat_flag: file-access | `public.cleaning_photos.storage_path` | La autorización de Storage del plan 01-08 va a depender de parsear una ruta de texto (`(storage.foldername(name))[1]::uuid`) que el cliente propone al subir. La columna es `unique` y la convención está documentada, pero **nada en la base impide insertar una fila cuyo `storage_path` empiece por el `cleaning_id` de otro aseo**. Un `CHECK (storage_path like cleaning_id::text \|\| '/%')` cerraría la clase entera; no se añadió aquí porque el plan no lo contempla y el vector solo se abre cuando existan las policies. Decisión para el plan 01-08 |

## User Setup Required

Ninguna.

## Next Phase Readiness

- **El plan 01-06 es ahora el cuello de botella de toda la fase.** Desbloquea 32 de las 45 aserciones con dos artefactos: `cleaning_state_transitions` (que desatasca los tres archivos que abortan) y `tg_cleanings_snapshot()` (sin el cual `00_rls_aseos` y `01_invariantes` siguen sin poder insertar un solo aseo aunque la tabla exista). Las dos cosas están medidas en este documento, no supuestas.
- El plan 01-07 tiene todo su terreno: 18 tablas sin RLS, la lista completa de qué revocar y qué otorgar, y la advertencia sobre secuencias que el research no podía prever.
- El plan 01-08 tiene `cleaning_photos`, `access_code_reads` y `cleaning_checklist_items` con la forma exacta que esperan sus RPC, y la convención de ruta de Storage escrita en el catálogo de la base.
- **La puerta "sin `Bad plan`" sigue sin ser exigible sobre `00_rls_aseos`, `01_invariantes` y `04_storage`.** Los tres abortan por schema ausente, no por mecánica de test. A partir del plan 01-06 sí lo será, y ese es el momento en que un `Bad plan` pasa a significar "hay un `is_empty` donde va un `throws_ok`".

---
*Phase: 01-fundaci-n-schema-y-rls*
*Completed: 2026-08-31*

## Self-Check: PASSED

- Los 2 archivos declarados verificados en disco: la migración `20260831212658_04_operacion.sql` y este SUMMARY.
- Los 2 commits de tarea verificados en el log: `6b96232`, `5a453c3`.
- `git diff --diff-filter=D --name-only 32c221f..HEAD` no devuelve nada: cero borrados desde la base del worktree.
- `STATE.md`, `ROADMAP.md` y `supabase/seeds/` sin tocar, como exige la ejecución en worktree paralelo con el plan 01-05.
- Árbol de trabajo limpio salvo este SUMMARY, que se commitea a continuación.
