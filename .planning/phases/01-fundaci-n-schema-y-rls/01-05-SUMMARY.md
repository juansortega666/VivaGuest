---
phase: 01-fundaci-n-schema-y-rls
plan: 05
subsystem: database
tags: [postgres, supabase, seed, sql, pgtap, fixtures]

# Dependency graph
requires:
  - phase: 01-fundaci-n-schema-y-rls (plan 01-03)
    provides: "Tablas de catálogo: properties, property_rooms, room_types, checklist_tasks, missing_item_catalog, app_settings, property_secrets, profiles"
  - phase: 01-fundaci-n-schema-y-rls (plan 01-01)
    provides: "config.toml con [db.seed] sql_paths = ['./seeds/*.sql'] y el archivo 03_seed.test.sql"
provides:
  - "Las 39 unidades reales en 8 clusters, 34 gestionadas y 5 de gestión externa, con nombres de placeholder marcados"
  - "197 cuartos placeholder (5 por unidad, + exterior en las 2 casas)"
  - "Catálogo provisional de 8 tipos de cuarto y 24 tareas de checklist (máximo 3 por tipo)"
  - "10 ítems globales de la lista base de faltantes"
  - "7 claves de app_settings con los valores iniciales de retención, sync y ventana de código"
  - "Fixture natural de la rama gestion_vivaguest = false para cl_unmanaged_is_inert y DASH-07"
affects: [fase-2-crud-apartamentos, fase-3-sync-ical, fase-6-codigo-acceso, fase-7-reportes, fase-9-retencion]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Seed particionado en supabase/seeds/NNN_*.sql, cargado por glob en orden lexicográfico"
    - "Namespace de UUID 5eedXXXX-… para datos del seed, disjunto del de los fixtures pgTAP"
    - "Placeholders marcados en el propio dato con prefijo [PLACEHOLDER], no en comentarios"

key-files:
  created:
    - supabase/seeds/010_app_settings.sql
    - supabase/seeds/020_room_types.sql
    - supabase/seeds/030_checklist_tasks.sql
    - supabase/seeds/040_missing_item_catalog.sql
    - supabase/seeds/050_properties.sql
    - supabase/seeds/060_property_rooms.sql
  modified: []

key-decisions:
  - "Los ids de property_rooms se derivan del id del apartamento por concatenación de texto, en vez de escribir 197 literales: mantiene el determinismo sin volver el archivo irrevisable"
  - "El seed se verificó en una instancia Postgres aislada (project_id y puertos propios) para no pisar la base local compartida con el plan 01-04, que corre en paralelo"
  - "Ni los comentarios del seed citan el nombre de la función de UUID aleatorio: el grep de CI que prohíbe el patrón también lee comentarios (lección de la desviación 3 del plan 01-01)"
  - "app_settings usa on conflict do nothing y no do update: el seed define el valor inicial, no pisa un ajuste ya hecho por el admin en dev"
  - "El texto de las 24 tareas de checklist es provisional y editable en base de datos sin migración; sigue siendo un abierto de producto"

patterns-established:
  - "Regla 1 del seed: cero UUID aleatorios, todos los ids son literales fijos o derivados de forma determinista"
  - "Regla 2 del seed: on conflict en todo insert, para que db reset --linked y las branches de Supabase sean re-aplicables"
  - "Regla 3 del seed: el placeholder viaja en el dato para que el admin lo vea en la UI de la Fase 2"
  - "Regla 4 del seed: no siembra usuarios, aseos ni credenciales (property_secrets, calendar_feeds)"
  - "El where p.id::text like '5eed0050-%' acota los inserts derivados a las filas sembradas, para no contaminar apartamentos reales"

requirements-completed: [PLAT-03, FIN-01]

# Metrics
duration: 34min
completed: 2026-08-31
---

# Phase 1 Plan 05: Seed de la operación real Summary

**Seed SQL en 6 archivos que carga las 39 unidades en 8 clusters (5 de gestión externa), 197 cuartos placeholder, el catálogo provisional de 8 tipos de cuarto con 24 tareas, 10 faltantes globales y 7 claves de app_settings, todo idempotente y con UUID deterministas.**

## Performance

- **Duración:** 34 min
- **Tareas:** 2 de 2
- **Archivos creados:** 6
- **Archivos modificados:** 0

## Accomplishments

- **Criterio de éxito 1 del ROADMAP cerrado.** `03_seed.test.sql` pasa en verde con sus 5 aserciones: 39 unidades, 8 clusters, 5 de gestión externa, ningún tipo de cuarto con más de 3 tareas y ninguna unidad activa.
- **La distribución operativa de PROJECT.md queda en la base**, cluster por cluster: Bogotá 1 (23), Bogotá 2 (2, externa), Santa Marta 1 (7), Santa Marta 2 (1, externa), Santa Marta 3 (1, externa), Chinauta (1 casa, externa), Cartagena (2 aptos + 1 casa) y Medellín (1).
- **Las 5 unidades de gestión externa son ahora fixture real**, no un caso hipotético: es lo que hace que `cl_unmanaged_is_inert` y DASH-07 se ejerzan contra datos y no solo contra tests sintéticos.
- **El seed es re-aplicable.** Verificado por dos vías: dos `db reset` consecutivos dejan 39 propiedades, y re-ejecutar los 6 archivos sobre una base ya poblada deja los mismos conteos (39 / 197 / 8 / 24 / 10 / 7), no el doble.
- **`property_secrets` y `calendar_feeds` quedan vacías** (T-01-27): el código de la cerradura y la URL de exportación iCal son credenciales, y sembrarlas con relleno normaliza confundir una real con una falsa.

## Task Commits

1. **Task 1: app_settings, tipos de cuarto, tareas de checklist y lista base de faltantes** - `5a3528c` (feat)
2. **Task 2: Las 39 unidades en 8 clusters y sus cuartos placeholder** - `34a6ac3` (feat)

## Files Created/Modified

- `supabase/seeds/010_app_settings.sql` - 7 claves de configuración con su valor inicial, cada una con la fase que la consume. Incluye `photo_retention_days = 30`, la restricción del free tier de Storage que hace que las fotos mueran antes que el aseo.
- `supabase/seeds/020_room_types.sql` - Los 8 tipos del catálogo provisional con `sort_order` en el orden en que el aseador recorre el apartamento. Fija el namespace de UUID `5eedXXXX-…` del seed.
- `supabase/seeds/030_checklist_tasks.sql` - 24 tareas, exactamente 3 por tipo, con `slot` 1..3. `requiere_foto = false` solo en el bloque `general`, cuyas tareas son del apartamento completo y no de un cuarto concreto. Resuelve `room_type_id` por `slug`, no repitiendo el UUID.
- `supabase/seeds/040_missing_item_catalog.sql` - 10 ítems globales (`property_id is null`). Nada por apartamento: eso es APTO-07 en la Fase 2.
- `supabase/seeds/050_properties.sql` - Las 39 filas con nombre `[PLACEHOLDER]`, tarifas en NULL, `is_active = false` explícito y `contacto_externo` de placeholder en las 5 externas.
- `supabase/seeds/060_property_rooms.sql` - 197 cuartos generados con un `cross join` acotado contra `room_types`, con id derivado de forma determinista.

## Decisions Made

- **Ids de `property_rooms` derivados, no literales.** `'5eed0060-0000-4000-8000-00000000' || right(p.id::text, 2) || codigo`. Cumple la regla de determinismo sin 197 literales escritos a mano, que era la forma más probable de introducir un duplicado silencioso.
- **`where p.id::text like '5eed0050-%'` en el cross join.** Acota los cuartos a las unidades sembradas. Sin eso, un `db reset --linked` le inyectaría cuartos de relleno a los apartamentos reales que el admin cree en la Fase 2.
- **`on conflict do nothing` sin target en casi todos los archivos.** `missing_item_catalog` tiene PK más dos índices únicos parciales, y `room_types` tiene PK más `unique(slug)`: sin target, la cláusula cubre todos los conflictos posibles en vez de solo uno.
- **`app_settings` con `do nothing`, no `do update`.** El seed define el valor inicial. Si el admin ajustó `retention_months` en dev, un reset no debe pisárselo.
- **Ningún `comment on` en el seed.** El DDL es de las migraciones; el seed es solo datos.
- **Verificación en una base aislada.** Ver "Issues Encountered".

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Los comentarios del seed rompían el propio guardarraíl de CI**

- **Encontrado en:** Task 2, al correr la verificación `grep -rn 'gen_random_uuid' supabase/seeds`.
- **Problema:** Dos comentarios de cabecera explicaban la regla "nada de UUID aleatorios" citando el nombre literal de la función. El grep de verificación no distingue código de comentario, así que el guardarraíl fallaba sobre los archivos que lo cumplían al 100%. Es exactamente la desviación 3 del plan 01-01, repetida.
- **Arreglo:** Se reescribieron los dos comentarios para describir la prohibición sin citar el token (`"ni una sola llamada al generador aleatorio de UUID de pgcrypto"`, `"cero UUID aleatorios"`), y se dejó la razón explicada en el propio comentario para que el siguiente que lo edite no lo reintroduzca.
- **Archivos modificados:** `supabase/seeds/010_app_settings.sql`, `supabase/seeds/060_property_rooms.sql`
- **Verificación:** `grep -rn 'gen_random_uuid' supabase/seeds` sale con exit 1 (sin coincidencias).
- **Committed in:** `5a3528c` y `34a6ac3` (dentro de los commits de tarea).

---

**Total de desviaciones:** 1 auto-corregida (1 blocking)
**Impacto en el plan:** Ninguno sobre el alcance. El arreglo era necesario para que la verificación automatizada del propio plan pasara.

## Issues Encountered

**La base local de Supabase es compartida entre worktrees.** `supabase/config.toml` está versionado con `project_id = "agent-a77b9e39ec453293b"`, así que mi worktree y el del plan 01-04, que corre en paralelo, resuelven al mismo contenedor `supabase_db_agent-a77b9e39ec453293b`. Correr `supabase db reset --local` desde aquí habría recreado la base que 01-04 está usando para sus migraciones y tests, en medio de su ejecución.

Resuelto sin tocar `config.toml` del repo: se copió `supabase/` a un directorio de trabajo temporal, se le cambió `project_id` a `seed0105iso` y se corrieron los puertos a 544xx, y se ejecutó la CLI con `--workdir` apuntando ahí. Eso levantó un contenedor Postgres propio (`supabase_db_seed0105iso`) con las 3 migraciones del base commit más mis 6 seeds. `config.toml` del worktree quedó intacto y sin cambios en `git status`.

**La CLI global del sistema es 2.115.0, el repo pinea 2.116.0**, y el worktree no tiene `node_modules`. Se instaló `supabase@2.116.0` en el directorio temporal (versión exacta de `devDependencies`, no `npx --yes` sobre un paquete sin verificar) y se usó ese binario para toda la verificación.

**`02_guardarrailes.test.sql` falla 2 de 8 aserciones en este worktree**, con `cleanings.pago_aseador -> AUSENTE` y `cleanings.tarifa_huesped -> AUSENTE`. Es preexistente y fuera de alcance: la tabla `cleanings` la crea el plan 01-04, cuyas migraciones no existen en este worktree. Nada que ver con el seed. Se verificó que la causa es la tabla ausente, no datos sembrados.

## Verification

Todo contra la instancia aislada, con las 3 migraciones del base commit:

| Comprobación | Resultado |
|---|---|
| `supabase db reset --local` carga los 6 archivos en orden | OK, sin error |
| `03_seed.test.sql` | `Files=1, Tests=5 ... Result: PASS` |
| `count(*)/count(distinct cluster)/not gestion_vivaguest/is_active` sobre `properties` | `39/8/5/0` |
| `room_types` | 8 |
| Máximo de tareas por tipo de cuarto | 3 (24 tareas en total) |
| Claves de `app_settings` de la lista del plan | 7 |
| `missing_item_catalog` global vs total | 10 / 10 (cero por apartamento) |
| `property_rooms` | 197 (mínimo 5 por unidad) |
| `exterior` solo en las 2 casas | Chinauta Casa 01 y Cartagena Casa 01 |
| `property_secrets` | 0 filas |
| Nombres sin prefijo `[PLACEHOLDER]` | 0 |
| Filas con `tarifa_huesped` o `pago_aseador` no nulos | 0 |
| Dos `db reset --local` consecutivos | 39 propiedades, no 78 |
| Re-aplicar los 6 archivos sobre base ya poblada | 39 / 197 / 8 / 24 / 10 / 7, sin duplicar |
| `grep -rn 'gen_random_uuid' supabase/seeds` | sin coincidencias |

## Known Stubs

Todos son intencionales, autorizados por 01-CONTEXT.md, y visibles en la UI por el prefijo `[PLACEHOLDER]` en el propio dato. Los resuelve la Fase 2, no esta.

| Stub | Archivo | Quién lo resuelve |
|---|---|---|
| Nombres de las 39 unidades | `050_properties.sql` | Fase 2, CRUD de apartamentos |
| `direccion`, `maps_url`, `maps_lat`, `maps_lng` sin sembrar | `050_properties.sql` | Fase 2, APTO-01 |
| `tarifa_huesped` y `pago_aseador` en NULL | `050_properties.sql` | Fase 2, APTO-02. Hasta entonces ninguna unidad es activable |
| `responsable_id` / `suplente_id` en NULL | `050_properties.sql` | Fase 2, ASEADOR-01 (no hay usuarios todavía) |
| `contacto_externo` de placeholder en las 5 externas | `050_properties.sql` | Fase 2 |
| Etiquetas y composición real de cuartos | `060_property_rooms.sql` | Fase 2, APTO-06 |
| Texto de las 24 tareas de checklist | `030_checklist_tasks.sql` | Abierto de producto; editable con un `update`, sin migración |
| `property_secrets` y `calendar_feeds` vacías | (no sembradas, deliberado) | Fase 2, APTO-03 / APTO-04 / APTO-12 |
| Lista de faltantes por apartamento | `040_missing_item_catalog.sql` | Fase 2, APTO-07 |

## User Setup Required

Ninguna. El seed lo carga `supabase db reset` y `supabase db start` sin intervención.

## Next Phase Readiness

- El fixture de datos que el resto del sistema necesita ya existe: los planes de las Fases 3 a 7 pueden apoyarse en las 39 unidades y en los 197 cuartos sin construirse su propio andamio.
- Las 5 unidades de gestión externa están disponibles como fixture de `cl_unmanaged_is_inert` para el plan 01-04 y para DASH-07.
- El plan 01-06 (RLS y policies) puede usar los apartamentos sembrados como sujetos de prueba, teniendo en cuenta que ninguno tiene `responsable_id`: las policies que filtran por responsable necesitarán crear su propio usuario de fixture.
- Pendiente para la Fase 2, en orden de bloqueo: tarifas (ninguna unidad es activable sin ellas), responsables, y luego nombres y cuartos reales.

---
*Phase: 01-fundaci-n-schema-y-rls*
*Plan: 05*
*Completed: 2026-08-31*

## Self-Check: PASSED

- 6 archivos de `supabase/seeds/` presentes en disco.
- `01-05-SUMMARY.md` presente en disco.
- Commits `5a3528c` y `34a6ac3` presentes en `git log`.
- `git status` limpio salvo el propio SUMMARY: sin cambios en `STATE.md`, `ROADMAP.md`, `supabase/migrations/` ni `supabase/config.toml`.
