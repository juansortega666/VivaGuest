---
phase: 03-motor-de-sincronizaci-n-ical
plan: 03
subsystem: database
tags: [ical, migracion, pg_cron, pg_net, rls, privacidad, instrumentacion, typegen]

requires:
  - phase: 01-fundaciones-de-datos-y-seguridad
    provides: "calendar_feeds, calendar_reservations, private.is_admin(), los default privileges de la migración 07 y el patrón de policy de la 08"
  - phase: 03-motor-de-sincronizaci-n-ical
    plan: 01
    provides: "05_sync.test.sql con los 14 invariantes en rojo, el comando por archivo que crea pgtap en el esquema extensions, y los guardarraíles 9 y 10 de ci:arch"
provides:
  - "pg_cron 1.6.4 en pg_catalog y pg_net 0.20.4 en extensions: el lazo del scheduler existe y ninguna de las dos vive en public"
  - "public.feed_sync_runs con min_ends_on y uid_rotations: los dos instrumentos que contestan en producción las dos preguntas que ninguna fixture puede contestar"
  - "calendar_feeds.last_min_ends_on: el piso de la corrida anterior, base de la alerta de cambio estructural"
  - "calendar_reservations.ends_on_anterior: lo que permite a la regla R2 no confundir un turnover sano con una extensión sospechosa"
  - "cal_res_sin_descripcion: el dato personal del huésped no puede persistirse, impuesto por CHECK y no por comentario"
  - "cal_res_feed_code_idx: el índice que sirve al emparejamiento de nivel 1 del diff"
  - "la decisión de NO tocar notification_type, escrita en la migración 11 para que 03-05 y 03-07 no la reabran"
  - "lib/database.types.ts regenerado y sincronizado"
affects: [03-04, 03-05, 03-06, 03-07, 03-08, 03-09, 03-10]

tech-stack:
  added:
    - "pg_cron 1.6.4 (esquema pg_catalog)"
    - "pg_net 0.20.4 (esquema extensions)"
  patterns:
    - "Toda tabla nueva de public escribe su RLS, su policy, su revoke para anon y authenticated —sobre la tabla Y sobre la secuencia del bigserial— y su grant para service_role, en el mismo bloque del create table"
    - "Columna de telemetría legible por un humano con lista cerrada por CHECK, nunca texto interpolado desde una fuente externa"
    - "Decisión de privacidad escrita como CHECK de base, no como comentario ni como convención de código"
    - "Replay de las migraciones sobre una base scratch del mismo servidor, para no gastar un db reset que destruiría datos vivos del stack compartido"

key-files:
  created:
    - supabase/migrations/20260902203834_11_sync_extensiones.sql
    - .planning/phases/03-motor-de-sincronizaci-n-ical/03-03-SUMMARY.md
  modified:
    - lib/database.types.ts
    - supabase/migrations/20260831205736_02_enums.sql

key-decisions:
  - "NO se toca el enum notification_type: las alertas de la fase reutilizan calendario_caido con un discriminador en payload.scope / payload.motivo. Queda escrito en la migración 11"
  - "El dato personal se bloquea con un CHECK que obliga a NULL, no borrando la columna: el drop movería el contrato de tipos generado sin ganar nada que el CHECK no dé"
  - "feed_sync_runs se queda SIN grant para authenticated, así que es inalcanzable desde ese rol con policy o sin ella. La policy existe igual, porque una tabla con RLS y sin policy devuelve vacío en silencio"
  - "NO se corrió db reset: los tres perfiles que el usuario está navegando no están en supabase/seeds/ y un reset los destruía sin forma automática de recuperarlos. Se aplicó hacia adelante y el arranque limpio se verificó en una base scratch"
  - "Las aserciones que se ponen verdes son SEIS y las que quedan rojas son SEIS, no ocho: el plan asumía que las 14 estaban rojas, pero la 13 y la 14 nacieron verdes en el plan 03-01"

requirements-completed: [SYNC-01, SYNC-04, SYNC-06, SYNC-08]

duration: 40min
completed: 2026-09-02
---

# Fase 3 Plan 03: Migración 11, extensiones, bitácora y el CHECK de privacidad — Resumen

**Las dos extensiones del scheduler instaladas fuera de `public`, la tabla que en dos días de producción contesta las dos preguntas que ninguna fixture puede contestar, las dos columnas que impiden que un turnover sano se lea como extensión sospechosa, y el `CHECK` que hace imposible persistir los últimos cuatro dígitos del teléfono del huésped. Seis aserciones de `05_sync.test.sql` pasan de rojo a verde, verificadas por identificador.**

## Performance

- **Duración:** 40 min
- **Tareas:** 2 de 2
- **Archivos creados:** 1 (más este resumen)
- **Archivos modificados:** 2

## Commits por tarea

1. **Tarea 1: migración 11, extensiones y tabla de instrumentación** — `37a9912` (feat)
2. **Tarea 2: typegen, corrección del comentario del enum y decisión de alertas** — `06dcc88` (chore)

## El resultado que importa: las aserciones, por IDENTIFICADOR

La regla vinculante del plan 03-01 es comparar identificadores, nunca totales, porque dos regresiones no relacionadas se cancelan en el agregado. Medido con `pg_prove`, que es lo que corre `supabase test db`:

```
supabase/tests/05_sync.test.sql   (Wstat: 0 Tests: 14 Failed: 6)
  Failed tests:  4-9
```

| Estado | IDs | Aserción |
|---|---|---|
| **Rojo → VERDE** | **1** | `pg_cron` está instalada |
| **Rojo → VERDE** | **2** | `pg_net` está instalada |
| **Rojo → VERDE** | **3** | Las dos instaladas y ninguna en `public` |
| **Rojo → VERDE** | **10** | `feed_sync_runs` existe, con RLS y al menos una policy |
| **Rojo → VERDE** | **11** | Ni `anon` ni `authenticated` con privilegios sobre `feed_sync_runs` |
| **Rojo → VERDE** | **12** | La columna de descripción cruda es NULL por CHECK |
| Sigue rojo | 4, 5, 6 | Los tres jobs de `cron.job` — migración 12 |
| Sigue rojo | 7, 8, 9 | Las tres funciones del motor — migraciones 13 y 14 |
| Verde desde 03-01 | 13, 14 | Invariantes de la Fase 1, intactos |

Las seis que siguen en rojo lo están **exactamente por el motivo previsto**: los objetos que nombran son de las migraciones 12 a 14 y este plan no los crea. Ninguna se relajó.

### Corrección al criterio de aceptación del plan: son SEIS, no ocho

El plan pedía "exactamente 8 `not ok`" y ordenaba contarlas una a una si el número no cuadraba. El número correcto es **6**, y la aritmética del plan es la que estaba mal:

- El plan restó 6 de **14**, asumiendo que las catorce estaban en rojo.
- El plan 03-01 dejó **doce** en rojo (ids 1-12) y **dos en verde** (13 y 14), que son invariantes preexistentes de la Fase 1.
- 12 − 6 = **6**.

No falta ninguna aserción por moverse: las seis que el plan nombra (1, 2, 3, 10, 11, 12) están las seis verdes, y las seis rojas restantes son las seis que el plan esperaba que siguieran rojas (4-9). El objetivo del plan además decía "tres de las catorce", mientras que su tarea 2 decía seis: la lista nominal de la tarea es la correcta y es la que se cumplió.

## Los ataques: cada invariante roto a propósito

Un invariante visto solo en verde no está verificado. Todos corrieron dentro de una transacción con `rollback`.

### El CHECK de privacidad

| # | Ataque | Esperado | Medido |
|---|---|---|---|
| A1 | `update` con `'Reservation URL: … Phone Number (Last 4 Digits): 2370'` | ROJO `23514` | **ROJO** `cal_res_sin_descripcion` |
| A1b | `insert` con la descripción no nula, no solo `update` | ROJO `23514` | **ROJO** |
| A1c | `update` con la **cadena vacía** | ROJO `23514` | **ROJO** |
| A1d | **Control positivo:** `update … set raw_description = null` | VERDE | **VERDE** |

A1b importa porque el `throws_ok` de la aserción 12 solo ejerce el `update`: sin A1b, el CHECK podría estar cubriendo una sola de las dos rutas de escritura y nadie lo notaría hasta que el worker hiciera su primer `insert`.

A1c importa más de lo que parece: demuestra que el CHECK es un **invariante de ausencia** (`is null`) y no un filtro de forma. Un CHECK que rechazara "cadenas con pinta de teléfono" sería trivial de esquivar el día que Airbnb cambie el formato del campo.

A1d es la mitad que falta: sin él, el CHECK podría ser insatisfacible —ninguna escritura legal— y la tabla quedaría inservible para el worker. Es exactamente el error que la Fase 1 cometió con el literal de `search_path`.

### La lista cerrada de `outcome`

| # | Ataque | Esperado | Medido |
|---|---|---|---|
| A2 | `insert` con `outcome = 'HTTP 500: <html>Phone Number (Last 4 Digits): 2370</html>'` | ROJO `23514` | **ROJO** `fsr_outcome_ok` |
| A2b | **Control:** los seis valores de la lista | VERDE, 6 filas | **VERDE, 6 filas** |

El payload del ataque A2 es deliberadamente un trozo de cuerpo de feed con dato personal: es el escenario concreto que la lista cerrada existe para impedir, y no un valor arbitrario cualquiera.

### Los privilegios

| # | Medición | Esperado | Medido |
|---|---|---|---|
| A3 | Grants de `anon`/`authenticated` sobre `public.feed_sync_runs` | ninguno | **`<ninguno>`** |
| A3 | Privilegios de `anon`/`authenticated` sobre `public.feed_sync_runs_id_seq` | ninguno | **`<ninguno>`** |
| A3b | **Control:** `service_role` sobre la tabla | tiene SELECT | **INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER** |
| A4 | `select` como admin autenticado | permiso denegado, no cero filas | **`permission denied for table feed_sync_runs` (42501)** |
| A5 | Esquema de cada extensión | fuera de `public` | **`pg_cron -> pg_catalog`, `pg_net -> extensions`** |

A3 se midió sobre la **secuencia** con `aclexplode` y no con `information_schema.role_table_grants`, porque esa vista no lista secuencias: es el hueco que el plan 01-04 encontró sobre `access_code_reads_id_seq` y la razón de que exista el guardarraíl 4b.

A3b es el control que impide el falso verde por sobre-revocación: revocar de más dejaría las columnas de A3 en `<ninguno>` igual, y además pondría en rojo el guardarraíl 7 y rompería el worker de la migración 13 con permiso denegado.

**A4 es un hallazgo, y cambia lo que la Fase 4 puede hacer.** Ver la sección de decisiones.

## Estado de la suite pgTAP, por archivo

| Archivo | plan | ok | not ok | IDs en rojo |
|---|---|---|---|---|
| `00_rls_aseos` | 1..16 | 16 | 0 | — |
| `01_invariantes` | 1..11 | 11 | 0 | — |
| `02_guardarrailes` | 1..10 | 10 | 0 | — |
| `03_seed` | 1..5 | 5 | 0 | — |
| `04_storage` | 1..5 | 5 | 0 | — |
| `05_sync` | 1..14 | **8** | **6** | **4 5 6 7 8 9** |

Los cuatro previos suman **47 ok / 0 not ok**, sin mover ninguno. Corrida completa: `Files=6, Tests=61`, con los 6 fallos concentrados en `05_sync` y en ningún otro archivo.

El guardarraíl 4b —el que ve las secuencias— sigue verde **con la secuencia nueva del `bigserial` ya creada**, que es la primera vez que se ejerce contra una tabla creada después de la Fase 1.

## Los advisors, con la salida completa

**`npm run db:advisors` (`--type security --fail-on error`): `No issues found`, `{"results":[]}`.** Cero errores y **cero WARN**. La suposición A7 del research queda verificada: las dos extensiones nuevas no introducen ningún hallazgo de seguridad, porque ninguna vive en `public` y por tanto `extension_in_public` no dispara.

**`npx supabase db advisors --local --type security` (sin filtro de nivel): idéntico.** No hay WARN escondidos por el `--fail-on error`.

**Advisor de rendimiento, que el plan no pedía y se corrió igual:** 14 WARN de `multiple_permissive_policies`, **los catorce preexistentes** (`checklist_tasks`, `cleaning_checklist_items`, `cleaning_photos` ×2, `cleanings`, `damages`, `expenses`, `missing_item_catalog`, `missing_item_lines`, `missing_item_reports`, `profiles`, `properties`, `property_rooms`, `room_types`). **Ninguno menciona `feed_sync_runs`**, que tiene una sola policy. Tampoco disparó `unindexed_foreign_keys`: `fsr_feed_started_idx` cubre `feed_id` como prefijo.

**`npm run db:lint`: `No schema errors found`** sobre los tres esquemas (`extensions`, `private`, `public`).

## Decisiones tomadas

### 1. `feed_sync_runs` es inalcanzable desde `authenticated`, y eso condiciona a la Fase 4

Un admin autenticado que haga `select` sobre la tabla recibe **`permission denied for table feed_sync_runs` (42501)**, no cero filas. Medido, no deducido.

No es un descuido: la aserción 11 de `05_sync.test.sql` exige **cero** privilegios para `anon` **y** para `authenticated`, así que el `grant select to authenticated` está prohibido por la especificación ejecutable de la fase. Es el mismo patrón exacto de `storage_deletion_queue` en la migración 08.

**Consecuencia vinculante para el plan que construya el panel de la Fase 4:** la bitácora se lee por un RPC `security definer` o con `service_role` desde el servidor, **nunca con un `select` directo desde el cliente**. Si alguien lo intenta, el fallo será ruidoso y no silencioso, que es justo lo que se quería.

**¿Entonces para qué la policy?** Porque una tabla con RLS y sin ninguna policy devuelve todo vacío en silencio, y ese silencio es lo que empuja a alguien a "arreglarlo" desactivando la RLS o metiendo la clave de servicio en el cliente. Con la policy escrita, el día que alguien añada el grant la restricción correcta ya está puesta. Guardarraíl 2.

Esto está escrito dentro de la migración, no solo aquí.

### 2. No se tocó el enum `notification_type`, y la razón quedó escrita en la migración

Las alertas de la fase reutilizan el valor existente `calendario_caido` con discriminador en `payload`:

```
{"scope":"feed","feed_id":"…","motivo":"sin_respuesta"}
{"scope":"job","motivo":"todos_los_feeds_obsoletos"}
{"scope":"feed","feed_id":"…","motivo":"formato_desconocido","eventos":15}
```

El discriminador se filtra con `payload ->> 'motivo'`, **no** con `type`. Los planes 03-05 y 03-07 no tienen que volver a discutirlo: está en la cabecera del archivo de migración, que es donde lo va a leer quien escriba el `insert`.

`extension_sospechosa` también existe ya en el enum y cubre el caso (c) del diff.

### 3. El CHECK y no el `drop` de la columna

`drop column raw_description` habría movido `lib/database.types.ts` y la puerta de deriva de tipos sin ganar nada que el CHECK no dé. La columna que sí queda para diagnosticar un cambio de formato del proveedor es `summary`, que no contiene dato personal.

Las dos defensas son complementarias y ninguna sustituye a la otra:
- El **CHECK** impide que el dato ENTRE.
- El **guardarraíl 9 de `ci:arch`** impide que ningún archivo de aplicación siquiera NOMBRE la columna, porque leer no es escribir y el CHECK no diría nada.

Se verificó el control del guardarraíl 9 que el plan pedía: `lib/database.types.ts` regenerado **sí** nombra la columna, en 3 líneas, y sin la exclusión por ruta exacta el guardarraíl sería un rojo permanente. Con la exclusión, `npm run ci:arch` está en verde.

### 4. `pg_cron` en `pg_catalog` y no en `extensions`

Medido: `pg_cron` **solo se puede crear en la base que nombra `cron.database_name`**, que aquí es `postgres`. El intento en otra base falla con `can only create extension in database postgres`. Es una extensión de instancia, no de esquema, y `pg_catalog` es donde la pone la propia plataforma. `pg_net` sí va a `extensions`.

Las dos son **no relocalizables** y su archivo de control no fija esquema, así que la cláusula `with schema` es la que decide dónde vive la fila de `pg_extension`. Sus objetos van a `cron` y `net`; **ninguno a `public`**, ni a `private`, así que ningún guardarraíl de `02_guardarrailes.test.sql` los alcanza y el advisor no reporta nada.

## Desviaciones del plan

### Auto-corregidas

**1. [Regla 3 — Bloqueante] No se corrió `db reset`: habría destruido los tres perfiles que el usuario está navegando**

- **Encontrado durante:** tarea 1, antes de ejecutar el `verify` del plan.
- **Problema:** el plan pedía `npx supabase db reset --local` como verificación. `supabase/seeds/` tiene seis archivos (`app_settings`, `room_types`, `checklist_tasks`, `missing_item_catalog`, `properties`, `property_rooms`) y **ninguno crea usuarios de `auth.users` ni perfiles**. Tampoco hay ningún script en `scripts/` que lo haga: `grep -rl "auth.users\|createUser"` sobre `scripts/` y `supabase/seeds/` no devuelve nada. Los tres perfiles vivos (`admin@vivaguest.test` / Juan Ortega, `maria@vivaguest.test` / María Restrepo, `luz@vivaguest.test` / Luz Ospina) se crearon a mano y un `db reset` los borra **sin forma automática de recuperarlos**. El stack es compartido entre worktrees y el orquestador tiene un `next start` en el puerto 3000 navegando con ellos.
- **Arreglo:** dos verificaciones en vez de una, y ninguna destructiva.
  1. **Aplicación hacia adelante** con `npx supabase migration up --local` sobre la base real, encima de las diez existentes. Es exactamente la ruta de producción.
  2. **Replay de arranque limpio** en una base scratch (`vg_scratch_11`) del mismo servidor: `create database`, bootstrap mínimo de `auth` y `extensions`, y las migraciones aplicadas **en orden de nombre de archivo**, una por una y con `ON_ERROR_STOP`. Resultado: 01 a 09 verdes, y la 11 verde. La base scratch se borró al terminar (`0 rows` en `pg_database`).
- **Dos exclusiones del replay, las dos ajenas a esta migración y las dos documentadas:**
  - La **migración 10** (storage) falla en una base recién creada con `relation "storage.buckets" does not exist`: depende del esquema `storage` que crea la plataforma Supabase, no una migración del repo. La 11 no depende de la 10.
  - La **línea de `pg_cron` de la migración 11** falla en cualquier base que no sea `postgres`, por el diseño de la propia extensión (ver decisión 4). Se aplicó la migración con esa única línea neutralizada, y la línea quedó verificada por separado dos veces: dentro de una transacción con `rollback` y en la aplicación real sobre `postgres`.
- **Verificación del no-daño, después de cada corrida de pgTAP y al final:** 39 apartamentos, 8 clusters, 5 informativos, **3 perfiles**, 0 extensiones `pgtap` residuales, 0 filas en `cron.job`, 0 filas en `feed_sync_runs`.
- **Commit:** `37a9912`.

**2. [Regla 1 — Bug] Un comentario de la migración 11 describía mal el acceso a `feed_sync_runs`**

- **Encontrado durante:** tarea 1, al correr el ataque A4.
- **Problema:** el comentario de la policy decía "el admin solo la consulta, igual que `calendar_reservations` y `cleaning_state_transitions`". Es falso: esas dos **sí** tienen `grant select to authenticated` en la migración 07, y `feed_sync_runs` no lo tiene ni lo puede tener. El comentario habría llevado al planificador de la Fase 4 a escribir un `select` desde el cliente que devuelve `42501`.
- **Arreglo:** se reescribió el bloque con la medición pegada y con la consecuencia explícita para la Fase 4 (leerla por RPC `security definer` o con `service_role`).
- **Es un cambio de comentario:** cero DDL, cero movimiento del schema, cero movimiento de `lib/database.types.ts`.
- **Commit:** `37a9912`.

**3. [Regla 1 — Bug] El criterio de "exactamente 8 `not ok`" del plan era aritméticamente incorrecto**

- **Encontrado durante:** tarea 2.
- **Problema:** el plan restaba las seis aserciones sobre catorce rojas. En realidad son doce rojas, porque la 13 y la 14 nacieron verdes en el plan 03-01.
- **Arreglo:** no se relajó ni se tocó ninguna aserción. Se verificó **por identificador**, que es lo que la regla vinculante del 03-01 exige, y el resultado es el previsto: verdes 1, 2, 3, 10, 11, 12; rojas 4, 5, 6, 7, 8, 9. El plan mismo ordenaba "contarlas una a una y explicar en el SUMMARY cuál no se movió y por qué": no se movió ninguna que debiera moverse.
- **Sin commit propio:** es una corrección de criterio, no de código.

### Ninguna desviación de Regla 4

No hizo falta ninguna decisión arquitectónica fuera del plan.

## Gates de autenticación

Ninguno. El plan no toca rutas autenticadas.

## Verificación

| Comprobación | Resultado |
|---|---|
| `npx supabase migration up --local` | **OK**, migración 11 aplicada |
| Replay de arranque limpio en base scratch | **OK** (01-09 y 11; 10 y la línea de `pg_cron` excluidas y justificadas) |
| `npm run db:advisors` (`security --fail-on error`) | **`No issues found`**, 0 errores y 0 WARN |
| `npx supabase db advisors --type security` sin filtro | **idéntico**, sin WARN escondidos |
| Advisor de rendimiento | 14 WARN, **los 14 preexistentes**, ninguno sobre `feed_sync_runs` |
| `npm run db:lint` | **`No schema errors found`** |
| Extensiones fuera de `public` | **`pg_cron -> pg_catalog`, `pg_net -> extensions`** |
| `npm run db:types:check` | **diff vacío** |
| `lib/database.types.ts` contiene `feed_sync_runs` / `last_min_ends_on` / `ends_on_anterior` | **sí** (2 / 3 / 3 ocurrencias) |
| `npm run ci:arch` | **OK** (10 guardarraíles) |
| `npx tsc --noEmit` | **OK** |
| `npm run test:unit` | **17 archivos, 295 tests** |
| `npm run build` | **OK**, 9 rutas |
| Los cuatro pgTAP previos, por archivo | **47 ok / 0 not ok** |
| `05_sync.test.sql` | **8 ok / 6 not ok, IDs 4-9** |
| `npm run db:test` completo | **`Files=6, Tests=61`, `Failed tests: 4-9`**, esperado |
| Semilla tras todas las corridas | **39 apartamentos, 8 clusters, 5 informativos** |
| Los tres perfiles del orquestador | **vivos** |
| Residuo en la base compartida | 0 `pgtap`, 0 `cron.job`, 0 `feed_sync_runs`, 0 bases scratch |
| `git diff --diff-filter=D` en los dos commits | **vacío**, ningún borrado |

## Stubs conocidos

Ninguno. Este plan entrega DDL, no código de aplicación. Los objetos que `05_sync.test.sql` sigue nombrando en rojo —`dispatch_feed_syncs`, `sync_feed_apply`, `feed_health_watchdog` y los tres jobs de `cron.job`— **no existen a propósito**: son de las migraciones 12 a 14 y su ausencia es lo que mantiene el rojo legible.

`feed_sync_runs` nace vacía y sigue vacía: la escribe el worker del plan 03-06. La tabla no es un stub, es el sustrato que ese worker necesita para poder escribir.

## Lo que este plan NO cierra

1. **Las dos preguntas abiertas de la fase siguen abiertas.** Este plan entrega el **instrumento** (`min_ends_on`, `uid_rotations`, `last_min_ends_on`), no la **respuesta**. La respuesta llega sola en dos o tres días de producción, y solo si alguien corre las consultas. El research pide un `checkpoint:human-verify` al tercer día: sin él, la instrumentación se escribe y nadie la lee.
2. **Que el `CHECK` de privacidad baste.** El `CHECK` impide persistir. No impide que el dato **viaje** por el worker en memoria mientras se normaliza; eso lo cubre el parser del plan 03-02 y el guardarraíl 9 de `ci:arch`.
3. **Que `pg_cron` funcione en el proyecto hospedado.** Aquí está medido contra el stack local, donde `cron.database_name` es `postgres`. En Supabase hospedado también lo es, pero eso no se verificó en este plan.
4. **La lectura de `feed_sync_runs` desde la UI.** Hoy es inalcanzable desde `authenticated` a propósito. El RPC o la ruta de servidor que la exponga es trabajo de la Fase 4.

## Threat Flags

Ninguno nuevo. Las dos extensiones instaladas viven fuera de `public`, no exponen ninguna ruta de red desde el cliente y `db advisors --type security` no reporta nada, ni error ni WARN.

Los cinco riesgos del registro del plan quedan mitigados y **verificados por ataque**, no por lectura:

| Threat ID | Mitigación | Evidencia |
|---|---|---|
| T-03-20 | RLS + policy + revoke sobre tabla **y** secuencia + grant a `service_role` | A3, A3b, A4; guardarraíles 1, 2, 4, 4b y 7 verdes |
| T-03-21 | `cal_res_sin_descripcion` | A1, A1b, A1c con control A1d; aserción 12 verde |
| T-03-22 | Lista cerrada de seis valores por CHECK | A2 con control A2b |
| T-03-23 | Las dos extensiones fuera de `public` | A5; aserción 3 verde; advisors sin hallazgos |
| T-03-24 | `ends_on_anterior` existe y está tipada | presente en `lib/database.types.ts`; la regla R2 que la consume es del plan 03-04 |

## Notas para las waves siguientes

1. **`05_sync.test.sql` está en 6 `not ok`, IDs `4 5 6 7 8 9`.** Es la lista vinculante nueva. Compárense identificadores, nunca totales.
2. **`npm run db:test` sigue saliendo en rojo hasta el plan 03-07.** Sigue siendo lo esperado.
3. **`cron.schedule` no acepta `'1 minute'`** (hallazgo del plan 03-01, no remedido aquí). Para el tick de un minuto va `'* * * * *'`. El research escribe el literal que no despliega.
4. **`pg_cron` solo se puede crear en la base `postgres`.** Cualquier verificación en una base auxiliar tiene que excluir esa línea.
5. **No corras `db reset` en este stack sin respaldar antes `auth.users` y `public.profiles`.** Los tres perfiles no están en `supabase/seeds/` ni los crea ningún script: se pierden y hay que rehacerlos a mano. Vale la pena que algún plan de la fase añada un `seeds/070_perfiles_dev.sql`.
6. **`feed_sync_runs` NO se puede leer desde el cliente.** RPC `security definer` o `service_role`. Un `select` directo da `42501`.
7. **El discriminador de las alertas es `payload ->> 'motivo'`, no `type`.** El enum no se toca.
8. **Para correr un pgTAP suelto**, sigue valiendo el comando de la cabecera de `05_sync.test.sql`: `pgtap` va al esquema `extensions`, nunca a `public`.

## Self-Check: PASSED

- `supabase/migrations/20260902203834_11_sync_extensiones.sql` — **FOUND**
- `lib/database.types.ts` — **FOUND**, contiene `feed_sync_runs`, `last_min_ends_on` y `ends_on_anterior`
- `supabase/migrations/20260831205736_02_enums.sql` — **FOUND**, con la corrección medida
- Commit `37a9912` — **FOUND**
- Commit `06dcc88` — **FOUND**
- `STATE.md`, `ROADMAP.md` y `lib/domain/ical*.ts` — **sin tocar**, verificado con `git status` y con el diff de los dos commits
- Ningún borrado en ninguno de los dos commits — **verificado**, `git diff --diff-filter=D` vacío en ambos
- Base scratch `vg_scratch_11` — **borrada**, 0 filas en `pg_database`
