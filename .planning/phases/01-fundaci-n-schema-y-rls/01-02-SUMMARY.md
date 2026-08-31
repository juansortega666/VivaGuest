---
phase: 01-fundaci-n-schema-y-rls
plan: 02
subsystem: testing
tags: [pgtap, rls, postgres, supabase, storage, wave-0, tdd]

# Dependency graph
requires:
  - "01-01: estructura supabase/tests, config.toml endurecido, `supabase db start` funcional"
provides:
  - "supabase/tests/00_rls_aseos.test.sql — plan(16), PLAT-03/05/06, un caso negativo por policy"
  - "supabase/tests/01_invariantes.test.sql — plan(11), FIN-01, ASEO-07, fila inerte, máquina de estados"
  - "supabase/tests/02_guardarrailes.test.sql — plan(8), invariantes de schema independientes de db advisors"
  - "supabase/tests/03_seed.test.sql — plan(5), 39 unidades / 8 clusters / 5 externas, sin bloque de limpieza"
  - "supabase/tests/04_storage.test.sql — plan(5), policies del bucket privado evidencia"
  - "Helper tests_auth(uuid) replicado en los 3 archivos que cambian de usuario"
  - "Contrato de nombres de tabla, columna, índice, CHECK y función que deben cumplir las migraciones"
  - "Mecánica de Storage medida: por qué throws_ok('42501') sobre storage.objects es un falso verde"
affects:
  - "01-03 a 01-08: el schema, las policies, los RPC y el seed que deben poner estos 45 asserts en verde"
  - "01-09: la puerta de CI `supabase test db --local` y la aserción de que no queda ningún Bad plan"
  - "Fase 7 (finanzas): la aserción de columnas bigint impide que el numeric(12,2) del DDL llegue vivo"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "throws_ok('42501') cuando el rol no tiene grant; is_empty solo cuando lo tiene y la RLS filtra"
    - "Limpieza del seed dentro de la transacción del test, no namespace de UUID disjunto"
    - "Toda escritura denegada se acompaña de una verificación posterior de que la fila objetivo quedó intacta"
    - "La verificación de intactitud va como bloque DO, no como aserción, para que plan(N) siga cuadrando"
    - "Literales monetarios siempre con ::bigint, también en los fixtures"
    - "Guardarraíles de schema por catálogo (pg_class, pg_policy, pg_proc, information_schema), no por advisor"

key-files:
  created:
    - "supabase/tests/00_rls_aseos.test.sql"
    - "supabase/tests/01_invariantes.test.sql"
    - "supabase/tests/02_guardarrailes.test.sql"
    - "supabase/tests/03_seed.test.sql"
    - "supabase/tests/04_storage.test.sql"
    - ".planning/phases/01-fundaci-n-schema-y-rls/deferred-items.md"
  modified:
    - ".planning/phases/01-fundaci-n-schema-y-rls/01-VALIDATION.md"

key-decisions:
  - "La puerta `sin Bad plan` no es verificable al terminar Wave 0 y se sustituye por dos comprobaciones estructurales que sí discriminan hoy"
  - "La verificación de intactitud de la regla (c) va como bloque DO y no como aserción, para respetar plan(16) y plan(5) al pie de la letra"
  - "La aserción 5 de storage deja de ser throws_ok: storage.protect_delete() levanta 42501 para todos los roles, así que sería un falso verde"
  - "access_code_reads SÍ recibe grant select para authenticated con policy solo-admin, resolviendo la contradicción entre el plan y RESEARCH §3.1"
  - "Los fixtures de profiles se insertan con ON CONFLICT DO UPDATE para tolerar el trigger que materializa profiles desde auth.users"
  - "Las transiciones de estado siempre recorren pendiente → en_curso → completada; nunca se salta al terminal"
  - "P4 (gestionado, con responsable, sin tarifas) existe solo para aislar props_active_requires_rates de props_active_requires_owner"

# Metrics
duration: 47min
completed: 2026-08-31
---

# Phase 1 Plan 02: Suite pgTAP del contrato de la fase Summary

**45 aserciones pgTAP en 5 archivos, escritas antes de que exista una sola tabla, que fijan el contrato de RLS, invariantes financieros, guardarraíles de schema, seed y Storage; en rojo, con el rojo del tipo correcto.**

## Performance

- **Duration:** ~47 min
- **Tasks:** 2 de 2
- **Files created:** 5 archivos de test + 1 de hallazgos diferidos
- **Aserciones:** 16 + 11 + 8 + 5 + 5 = **45**

## Accomplishments

- Los 5 criterios de éxito del ROADMAP quedan cubiertos por al menos una aserción cada uno, y cada policy prevista tiene su caso negativo explícito.
- Las tres trampas de mecánica que el research reprodujo ejecutándolas están respetadas archivo por archivo: `throws_ok` vs `is_empty` según haya grant o no, limpieza del seed dentro de la transacción, y `IS DISTINCT FROM` como invariante del índice parcial (aserción 6 de `01_invariantes`, con dos filas informativas de `state IS NULL`).
- `02_guardarrailes.test.sql` **corre entero contra la base vacía**: 8 tests ejecutados, 1 fallo legible (`Failed test 6`, columnas monetarias ausentes), cero `Bad plan`. Es el único archivo que puede correr sin schema y demuestra que las consultas de catálogo (`pg_options_to_table`, `pg_proc.proconfig @> array['search_path=']`, `information_schema.role_table_grants`) son válidas contra un Postgres real, no solo plausibles.
- La corrida completa produce exactamente dos causas de aborto, ambas de schema ausente: `relation "public.cleaning_state_transitions" does not exist` y `relation "public.properties" does not exist`. Ninguna es de mecánica de test.
- Se midió el comportamiento real de `storage.objects` en Supabase local y se descubrió que la aserción que pedía el plan habría sido un falso verde permanente. Está documentado en `01-VALIDATION.md` como trampa nº 4.

## Task Commits

1. **Task 1: `00_rls_aseos.test.sql` y `01_invariantes.test.sql`** — `a3e423f` (test)
2. **Task 2: `02_guardarrailes`, `03_seed` y `04_storage`** — `b28a985` (test)

## Files Created/Modified

- `supabase/tests/00_rls_aseos.test.sql` — `plan(16)`. Positivos de A (2 aseos, instrucciones, 2 apartamentos), negativos de B (aseos, apartamentos, **el join `cleanings ⋈ properties`**, RPC), negativos de la aseadora C desactivada con token vivo, `throws_ok 42501` sobre `property_secrets` incluso para el aseador asignado, `results_eq` del RPC más la auditoría en `access_code_reads`, el aseo a 5 días visible pero no desbloqueable, el `UPDATE` directo denegado con verificación de fila intacta, el admin, y el contraste `is_empty` sobre `access_code_reads`.
- `supabase/tests/01_invariantes.test.sql` — `plan(11)`. Snapshot financiero en las tres aristas (al insertar, tras editar el apartamento, tras un `UPDATE` directo sobre el aseo completado), ASEO-07 en cuatro (segundo aseo activo, cancelar libera el slot, dos filas informativas, idempotencia por `reservation_id`), fila inerte de gestión externa, máquina de estados sin salida desde terminal, log de 2 transiciones, y activación de apartamento sin tarifas.
- `supabase/tests/02_guardarrailes.test.sql` — `plan(8)`. Las 4 verificadas del research más `search_path = ''` en toda función `SECURITY DEFINER` de `public` y `private`, columnas monetarias `bigint` (con `LEFT JOIN`, así que una columna ausente también falla), `service_role` con `SELECT` sobre todas las tablas de `public`, y `property_secrets` / `storage_deletion_queue` sin ningún privilegio para `authenticated`.
- `supabase/tests/03_seed.test.sql` — `plan(5)`. 39 / 8 / 5, tope estructural de 3 tareas por tipo de cuarto, y ninguna unidad activa. **Sin bloque de limpieza**, con la razón escrita en la cabecera.
- `supabase/tests/04_storage.test.sql` — `plan(5)`. Bucket privado, insert ajeno denegado por `WITH CHECK`, insert permitido a la asignada con el aseo en curso, lectura ajena vacía, e inmutabilidad de la evidencia probada por la vía correcta.
- `.planning/phases/01-fundaci-n-schema-y-rls/01-VALIDATION.md` — `Per-Task Verification Map` lleno con 6 filas, Wave 0 Requirements marcados, y una cuarta trampa de mecánica documentada.
- `.planning/phases/01-fundaci-n-schema-y-rls/deferred-items.md` — dos hallazgos fuera de alcance.

## Contrato que estos archivos imponen a los planes 01-03 a 01-08

Los tests son la especificación. Estos son los puntos donde el contrato **difiere** de lo que dice `ARCHITECTURE.md`, para que nadie copie el DDL literal y se sorprenda:

| Punto | Contrato de la suite | Qué dice ARCHITECTURE.md |
|---|---|---|
| Columnas monetarias | `bigint` (`properties.tarifa_huesped`, `properties.pago_aseador`, `cleanings.tarifa_huesped`, `cleanings.pago_aseador`, `expenses.monto`) | `numeric(12,2)` — está mal, ver RESEARCH §2.1 |
| `property_secrets.ical_url` | Existe: la URL de exportación iCal es una credencial | No aparece en el DDL |
| `public.cleaning_state_transitions` | Existe, con columna `cleaning_id`; registra transiciones, **no** la creación del aseo | No aparece |
| `access_code_reads` | **Sí** recibe `grant select … to authenticated`, con policy solo-admin | RESEARCH §3.1 la deja sin grant |
| Máquina de estados | Trigger **BEFORE**, errcode `P0001`, sin transición de salida desde `completada` ni `cancelada` | No especifica el mecanismo |
| `cleanings.origin` | Sin default: los fixtures lo pasan siempre (`'manual'` / `'ical'`) | `not null check (origin in ('ical','manual'))` |
| Congelamiento financiero | Por **reimposición** del trigger, no bloqueando el `UPDATE`: la aserción 3 hace un `UPDATE` directo sobre un aseo completado y espera que sobreviva, no que falle | El trigger de RESEARCH ya lo hace así |
| Inmutabilidad de la evidencia | Por **ausencia de policy** de UPDATE/DELETE, no por revoke (ver desviación 3) | Dice "sin UPDATE ni DELETE para el aseador", sin decir cómo |

## Decisions Made

- **La puerta `sin Bad plan` se pospone al plan 01-03.** Detalle en la desviación 1.
- **La verificación de intactitud va como bloque `DO`, no como aserción.** El plan describe 16 items para `00_rls_aseos` y exige `plan(16)`, pero su item 14 son en realidad dos comprobaciones (el `throws_ok` y la verificación como `postgres`). Escribirlas como dos aserciones daría 17 y produciría el `Bad plan` que el propio plan prohíbe; omitir la segunda violaría la regla (c). La salida es un `DO ... raise exception` que hace la comprobación sin consumir un slot del plan. Mismo patrón en `04_storage`. La contrapartida es que si esa comprobación falla, aborta el archivo en vez de dar un `not ok`; es aceptable porque ese fallo significa que una escritura denegada sí escribió, y eso no es un test rojo, es un incidente.
- **Fixtures de `profiles` con `ON CONFLICT DO UPDATE`.** `ARCHITECTURE.md` prevé un trigger `on auth.users insert` que materializa `profiles`. Si existe, un `INSERT` simple choca con `23505` en la primera sentencia y mata el archivo. El upsert hace el fixture correcto exista o no el trigger, sin debilitar ninguna aserción.
- **Las transiciones nunca saltan al estado terminal.** `pendiente → en_curso → completada` siempre, porque la aserción 9 declara que desde un terminal no hay salida. Por eso ASEO-07 cancela CL3 (que está `pendiente`) y no CL1 (que ya está `completada`): cancelar CL1 sería una transición de salida desde un terminal y el archivo abortaría.
- **La aserción 9 pone `finished_at = null` en el `UPDATE` que debe fallar.** Sin eso, el `UPDATE` viola además `cl_completada_shape` y podría rechazarse con `23514` en vez de `P0001`, con lo cual la aserción pasaría a probar el CHECK y no la máquina de estados. Así queda declarado además que la máquina se implementa como trigger BEFORE.
- **P4 existe solo para aislar constraints.** Un apartamento gestionado, sin tarifas, **con** `responsable_id`: así el único `CHECK` que puede rechazar la activación es `props_active_requires_rates`. Con `responsable_id` nulo también fallaría `props_active_requires_owner` y el `23514` no probaría lo que dice probar.
- **Fechas separadas por escenario.** Cada bloque de `01_invariantes` usa `today_bog()`, `+1`, `+2` o `+3` para que el índice único de `(property_id, scheduled_date)` de un escenario no dispare en otro y enmascare la causa real.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] La verificación automatizada `sin Bad plan` es insatisfacible al terminar Wave 0**

- **Found during:** Task 1, primera corrida de `npx supabase test db --local supabase/tests/00_rls_aseos.test.sql`.
- **Issue:** El plan verifica `grep -q 'Bad plan' && exit 1` y su `must_haves` exige "fallos legibles (`not ok`), nunca `Bad plan`". Sin schema es imposible: la primera sentencia de cada archivo (`delete from public.cleaning_state_transitions`) aborta con `relation ... does not exist`, la transacción muere y pgTAP reporta `Bad plan ... ran 0`. No hay forma de escribir un test que referencie tablas inexistentes y no aborte, salvo envolviendo las 45 aserciones en `throws_ok`, que las vaciaría de contenido. La puerta es válida **desde el plan 01-03**, no antes.
- **Fix:** Se conservan los archivos exactamente como el plan los describe y se sustituye la verificación por dos que sí discriminan hoy:
  1. **`plan(N)` == número de aserciones por archivo.** Es la causa estructural nº 1 de `Bad plan` y es estática. Resultado: 16/11/8/5/5, coincide en los cinco.
  2. **Cero errores de sintaxis en todas las sentencias**, con `psql -f` sin `ON_ERROR_STOP`. Postgres hace el parse crudo antes de rechazar por transacción abortada, así que un error de sintaxis en la última línea del archivo sí se reporta aunque la primera haya abortado. **El método se validó plantando un error deliberado** (`select is( sintaxis rota ,,, ;`) al final de un archivo que daba 0: se detectó. Resultado sobre los 5 archivos reales: 0.
  3. **La causa del rojo es del tipo correcto:** los únicos `ERROR` de la corrida completa son `relation "public.cleaning_state_transitions" does not exist` y `relation "public.properties" does not exist`.
- **Files modified:** ninguno de código; queda documentado en `01-VALIDATION.md`.
- **Committed in:** `b28a985` (los archivos), documentación en el commit de cierre.

**2. [Rule 1 - Bug] `03_seed.test.sql` casi rompe su propio guardarraíl con un comentario**

- **Found during:** Task 2.
- **Issue:** El plan verifica que `03_seed.test.sql` no contenga `delete from`. La cabecera explicativa del archivo decía *"un `delete from` aquí vacía lo que se está midiendo"*, es decir citaba el patrón prohibido. La verificación del plan filtra líneas de comentario (`grep -v "^\s*--"`) y habría pasado, pero cualquier grep más simple en una puerta de CI futura lo marcaría. Es exactamente la desviación 3 del plan 01-01, repetida.
- **Fix:** Comentario reformulado sin la cadena, con una nota que dice por qué la evita.
- **Files modified:** `supabase/tests/03_seed.test.sql`
- **Committed in:** `b28a985`

**3. [Rule 1 - Bug] La aserción 5 de `04_storage` tal como la pedía el plan es un falso verde permanente**

- **Found during:** Task 2, al correr `04_storage.test.sql` por primera vez.
- **Issue:** El plan pedía `throws_ok` sobre un `delete` del propio objeto, razonando que el aseador no tiene `DELETE`. Tres hechos medidos contra la base local lo invalidan:
  1. Supabase **sí** otorga `DELETE, INSERT, SELECT, UPDATE` sobre `storage.objects` a `authenticated` **y a `anon`** por defecto (ACL `authenticated=arwdDxtm/supabase_storage_admin`).
  2. Ese grant **no se puede revocar desde una migración**. `revoke delete on storage.objects from authenticated` ejecutado como `postgres` es un **no-op silencioso** (`has_table_privilege` sigue devolviendo `true`), porque el grantor es `supabase_storage_admin`. `revoke ... granted by supabase_storage_admin` responde *"grantor must be current user"* y `set role supabase_storage_admin` responde *"permission denied to set role"*.
  3. `storage.objects` tiene un trigger `BEFORE DELETE FOR EACH STATEMENT storage.protect_delete()` que rechaza **todo** borrado directo por SQL **con errcode `42501`**, salvo que el GUC `storage.allow_delete_query` valga `'true'`. Verificado leyendo `prosrc`.

  Combinados: `throws_ok(delete ..., '42501')` habría pasado siempre, para cualquier rol, incluido el admin, y sin que exista policy alguna. Habría quedado en verde durante toda la fase sin probar absolutamente nada sobre el aseador, que es el modo de fallo que Wave 0 existe para prevenir.
- **Fix:** La aserción 5 levanta `storage.allow_delete_query` para apartar el trigger y dejar que decida **solo la RLS** — que es la capa que la Storage API ejerce con el JWT del aseador — y afirma con `is_empty` sobre `delete ... returning name` que el borrado afecta 0 filas. Va seguida del guard como `postgres` que verifica que el objeto sigue existiendo (regla (c): un `delete` puede afectar 0 filas visibles y aun así haber borrado). El bloque de limpieza del archivo necesita el mismo GUC para poder correr. La cabecera del archivo documenta los tres hechos con su medición.
- **Consecuencia de contrato:** la inmutabilidad de la evidencia **no puede** apoyarse en un revoke. Se apoya en no crear policy de `UPDATE` ni de `DELETE` que alcance al aseador. El plan de Storage debe saberlo antes de escribir la migración.
- **Files modified:** `supabase/tests/04_storage.test.sql`
- **Committed in:** `b28a985`

**4. [Rule 3 - Blocking] Contradicción entre el plan y RESEARCH §3.1 sobre el grant de `access_code_reads`**

- **Found during:** Task 1.
- **Issue:** La aserción 16 del plan exige `is_empty` sobre `access_code_reads` como aseador, y dice explícitamente que la tabla "sí tiene grant select". La migración de grants propuesta en `01-RESEARCH.md` §3.1 la deja **sin** grant, y sin grant la aserción correcta sería `throws_ok('42501')`, no `is_empty` — con `is_empty` el archivo moriría con `Bad plan`. No se puede escribir el test sin resolverlo.
- **Fix:** Se sigue el plan, que es la autoridad, y se deja el requisito escrito como comentario `CONTRATO` dentro del archivo: la migración de grants debe otorgar `select on public.access_code_reads to authenticated` y darle una policy solo-admin. Es coherente con la tabla de cobertura de `ARCHITECTURE.md` (admin: SELECT, aseador: ninguna) y da el contraste didáctico entre las dos mecánicas que el plan buscaba.
- **Files modified:** `supabase/tests/00_rls_aseos.test.sql`
- **Committed in:** `a3e423f`

**5. [Rule 3 - Blocking] `npm ci` en el worktree**

- **Found during:** Task 1, antes de la primera verificación.
- **Issue:** El worktree no hereda `node_modules` (está en `.gitignore`), así que `npx supabase` resolvía a la 2.115.0 del caché en vez de la 2.116.0 pineada en `package.json`.
- **Fix:** `npm ci`. No cambia ningún archivo versionado.
- **Files modified:** ninguno.

---

**Total deviations:** 5 auto-corregidas (3 bugs, 2 bloqueantes). Ninguna amplía el alcance ni suaviza una aserción; la 3 la endurece.

## Issues Encountered

- **La suite entera está en rojo y ese es el resultado correcto.** 4 de los 5 archivos abortan porque no existe ninguna tabla; el quinto (`02_guardarrailes`) corre completo y falla 1 de 8. No hay ninguna aserción comentada, ningún `SKIP` y ningún `plan(0)`.
- **`02_guardarrailes` pasa 7 de 8 sobre la base vacía, de forma vacua.** Sin tablas en `public` no hay tabla sin RLS, ni vista sin `security_invoker`, ni grant de `anon` que encontrar. No es un problema: son aserciones universalmente cuantificadas y su valor aparece cuando existan objetos. La aserción 6 sí falla hoy porque usa `LEFT JOIN` y reporta `AUSENTE` para las 5 columnas monetarias, lo que la convierte además en una aserción de existencia.
- **`supabase/migrations/.gitkeep` sigue ahí.** El CLI emite `Skipping migration .gitkeep...` en cada arranque. Este plan no añade migraciones, así que la nota del 01-01 sigue vigente para el plan 01-03.
- **`WARN: no files matched pattern: supabase/seeds/*.sql`** en cada `db start`. Desaparece cuando el plan del seed escriba su archivo.

## Known Stubs

Ninguno. Los 5 archivos están completos y sus 45 aserciones son reales. Que fallen es el estado especificado por el plan, no un stub: no hay lógica pendiente de escribir en estos archivos, hay schema pendiente de escribir en otros planes.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: privilege-surface | `storage.objects` (esquema `storage`, no versionado) | `anon` conserva `arwdDxtm` sobre `storage.objects`, incluido `TRUNCATE`, que ignora la RLS por completo. Es la misma clase que el guardarraíl 4 cierra para `public`, pero ese filtra `table_schema='public'` y no ve el esquema `storage`. Explotabilidad práctica baja (PostgREST no expone `storage` ni emite `TRUNCATE`), pero **el revoke no es ejecutable desde una migración** por el problema de grantor descrito en la desviación 3. Requiere decisión de producto/seguridad: aceptarlo como riesgo residual documentado, o ejecutarlo desde el dashboard. Registrado en `deferred-items.md`. |
| threat_flag: immutability-mechanism | `supabase/tests/04_storage.test.sql` | La inmutabilidad de la evidencia (PLAT-05) descansa en la **ausencia** de policies de UPDATE/DELETE, no en un revoke. Una policy `for all to authenticated` añadida por descuido en un plan futuro la rompe sin que ninguna aserción de `02_guardarrailes` lo note, porque ese archivo solo mira el esquema `public`. |

## User Setup Required

Ninguna.

## Next Phase Readiness

- El plan 01-03 puede escribir la primera migración y correr `npx supabase test db --local` de inmediato: la base local está arriba con Postgres 17.6 y pgTAP ya instalado por el CLI.
- **A partir del plan 01-03 la puerta `sin Bad plan` sí aplica** y debe empezar a exigirse: en cuanto existan las tablas, un `Bad plan` deja de significar "falta schema" y pasa a significar "hay un `is_empty` donde va un `throws_ok`" o "un fixture colisiona".
- La tabla *Contrato que estos archivos imponen* de este documento es la lista de verificación para quien escriba el DDL. Los ocho puntos son sitios donde copiar `ARCHITECTURE.md` literalmente deja la suite en rojo.
- `01-VALIDATION.md` sigue con `wave_0_complete: false` en el frontmatter. Los 10 items de Wave 0 ya existen en disco (5 de este plan, 5 del 01-01), pero el flip lo debe hacer el verificador de fase, no el ejecutor.

---
*Phase: 01-fundaci-n-schema-y-rls*
*Completed: 2026-08-31*
