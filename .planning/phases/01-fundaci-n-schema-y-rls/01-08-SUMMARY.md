---
phase: 01-fundaci-n-schema-y-rls
plan: 08
subsystem: database
tags: [postgres, supabase, rpc, security-definer, storage, rls, auditoria, seguridad]

# Dependency graph
requires:
  - "01-03: property_secrets, properties.responsable_id, property_rooms, checklist_tasks, public.today_bog()"
  - "01-04: cleanings, access_code_reads, cleaning_checklist_items, cleaning_photos"
  - "01-05: la maquina de estados y el trigger cleanings_log_transition"
  - "01-06: notifications como outbox, con su indice unico parcial de dedupe"
  - "01-07: los 6 helpers de private, la matriz de grants y las 37 policies"
provides:
  - "supabase/migrations/20260831223038_09_rpc.sql — las 6 funciones SECURITY DEFINER que son el contrato de escritura de toda la UI"
  - "supabase/migrations/20260831224030_10_storage.sql — bucket privado evidencia, sus 3 policies y el CHECK que ancla la ruta al aseo"
  - "public.reveal_access_code(uuid) — unica salida del codigo de acceso, con ventana hoy..manana y auditoria en la misma transaccion"
  - "public.confirm_cleaning(uuid, smallint, text) — asigna, materializa el checklist y encola la notificacion; NO cambia el estado"
  - "public.start_cleaning(uuid) / finish_cleaning(uuid) / decline_cleaning(uuid, text) / toggle_checklist_item(uuid, boolean, text)"
  - "Guardarrail 9 de 02_guardarrailes: ninguna funcion de public ni private es ejecutable por anon"
  - "constraint photo_path_bajo_su_aseo — cierra el threat_flag file-access que dejo abierto el plan 01-04"
affects:
  - "01-09: `supabase gen types typescript` ya emite las 6 funciones bajo `Functions`; es el contrato tipado de las Fases 2, 4 y 6"
  - "01-09: el checkpoint humano tiene que confirmar que las 3 policies de storage.objects existen en el proyecto hosted"
  - "Fase 4: cancel_cleaning() y reschedule_cleaning() se anaden con el mismo patron, sin tocar el modelo de autorizacion"
  - "Fase 6: report_damage/report_expense/report_missing_items, mas el trigger de coherencia foto<->item del hallazgo 7"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cada funcion nueva de public lleva su propio `revoke all ... from public, anon` al lado de la definicion: no se hereda de los default privileges"
    - "El efecto de auditoria va ANTES del return, en la misma transaccion, para que no exista lectura sin rastro"
    - "El error de autorizacion es 42501 y no discrimina entre 'no existe', 'no es tuyo' y 'todavia no es su dia': un error mas informativo seria un oraculo de enumeracion"
    - "P0001 para lo que falla por estado del dominio, 42501 para lo que falla por autorizacion: la UI necesita distinguirlos"
    - "La transicion de estado la escribe el trigger, nunca un insert manual dentro del RPC"
    - "Las policies de Storage comparan el primer segmento del path como text, sin cast a uuid: un path malformado da deny, no error de tipo"
    - "Toda autorizacion derivada de una ruta que propone el cliente necesita un CHECK que ancle esa ruta a una columna que el servidor si autorizo"

key-files:
  created:
    - "supabase/migrations/20260831223038_09_rpc.sql"
    - "supabase/migrations/20260831224030_10_storage.sql"
  modified:
    - "supabase/tests/02_guardarrailes.test.sql"
    - ".planning/phases/01-fundaci-n-schema-y-rls/deferred-items.md"
  deleted: []

key-decisions:
  - "reveal_access_code() NO delega en private.my_unlockable_property_ids(): ese helper es property-scoped y delegarle la decision degradaria el predicado a 'tienes algun aseo desbloqueable en ese apartamento', estrictamente mas debil"
  - "Se anade el CHECK photo_path_bajo_su_aseo, que el plan no contemplaba: sin el, la autorizacion de Storage de la Fase 6 seria circular"
  - "Se anade el guardarrail 9 a 02_guardarrailes: es el unico mecanismo que impone el revoke por funcion, que PG no permite heredar"
  - "El snippet de verificacion del plan para search_path usaba el literal equivocado (`search_path=`) y habria dado un falso rojo; se uso `search_path=\"\"`"
  - "confirm_cleaning usa `for update of c` y no `for update` a secas: sin el `of c` el join bloquearia tambien properties y serializaria confirmaciones de aseos distintos del mismo apartamento"
  - "decline_cleaning usa `update ... returning into` como guarda y escritura a la vez, en vez de un select previo"

requirements-completed: [PLAT-05, PLAT-06, ASEO-07]

# Metrics
duration: 41min
completed: 2026-08-31
---

# Phase 1 Plan 08: Migraciones 09 y 10, los RPC y el bucket de evidencia Summary

**Las 6 funciones `SECURITY DEFINER` que son la única ruta de escritura del aseador y la única salida del código de acceso, más el bucket privado `evidencia` con sus 3 policies; la suite pgTAP pasa de 35 aserciones con 34 verdes a 47 de 47 en verde, con los 5 archivos en `PASS` por primera vez en la fase.**

## Performance

- **Duration:** ~41 min
- **Tasks:** 3 de 3
- **Migraciones creadas:** 2 (598 + 205 líneas)
- **Funciones creadas:** 6, todas `security definer` con `search_path = ''`
- **Aserciones pgTAP:** de 35 ejecutándose (34 verdes) a **47 ejecutándose, 47 verdes**

## Accomplishments

- **`00_rls_aseos.test.sql` corre las 16 aserciones y las 16 pasan.** Era el archivo que llevaba bloqueado desde el plan 01-03. El `results_eq` de la aserción 11 dejó de abortar la transacción en cuanto existió la función que invoca, exactamente como predijo el hallazgo 6 de `deferred-items.md`. **No se tocó ni una línea del archivo.**
- **`04_storage.test.sql` pasa de abortar entero a 5/5.** Llevaba muerto en la línea 97 desde el plan 01-06 por el bucket inexistente.
- **La suite completa sale `Result: PASS` sobre los 5 archivos.** Primera vez en la fase.
- **Ninguna función de `public` ni de `private` es ejecutable por `anon`.** Medido sobre las 17 que existen, no solo sobre las 6 nuevas.
- **El código de acceso solo sale por RPC, solo con aseo vigente de hoy o mañana, y toda lectura queda auditada** en la misma transacción.
- **Se cerró el `threat_flag: file-access` que el plan 01-04 dejó explícitamente como decisión de este plan.** Detalle abajo; es la desviación 1.
- **`db advisors --type security --fail-on error` sigue saliendo `No issues found`** con 2 migraciones más encima.

## Task Commits

1. **Task 1: `reveal_access_code()` y `confirm_cleaning()`, más el guardarraíl 9** — `090a456` (feat)
2. **Task 2: `start`, `finish`, `decline` y `toggle_checklist_item`** — `dcd6b4d` (feat)
3. **Task 3: migración 10, bucket `evidencia`, sus policies y el CHECK de la ruta** — `30ebb9f` (feat)

## Aserciones pgTAP: el delta rojo→verde

Corridas con `npx supabase test db --local` sobre la base recién reseteada.

### Antes de este plan (medido por el plan 01-07)

```
00_rls_aseos      10 de 16 ejecutadas, 9 verdes. Falla la 7 (RPC ausente);
                  aborta en la 11 por results_eq sobre función inexistente
01_invariantes    ok  (11)
02_guardarrailes  ok  (9)
03_seed           ok  (5)
04_storage        Bad plan. You planned 5 tests but ran 0
Files=5, Tests=35, Result: FAIL
```

### Después

```
00_rls_aseos      ok  (16)   <-- 16/16
01_invariantes    ok  (11)
02_guardarrailes  ok  (10)   <-- 10/10, con el guardarraíl 9 nuevo
03_seed           ok  (5)
04_storage        ok  (5)    <-- 5/5
All tests successful.
Files=5, Tests=47, Result: PASS
```

### De rojo a verde en este plan (12 aserciones)

| Archivo | # | Aserción | Por qué pasó |
|---|---|---|---|
| `00_rls_aseos` | 7 | B no puede revelar el código del aseo de A | Ya existe la función, así que captura `42501` real en vez de `42883` de función inexistente |
| `00_rls_aseos` | 11 | A obtiene el código de su aseo de hoy por RPC | `reveal_access_code()` devuelve `'8842'`. **Es la que desbloquea el archivo entero** |
| `00_rls_aseos` | 12 | La lectura quedó auditada en `access_code_reads` | El `INSERT` va antes del `return query`, misma transacción. Cuenta exacta: 1 |
| `00_rls_aseos` | 13 | Un aseo a 5 días es visible pero NO desbloqueable | La ventana `today_bog() .. today_bog() + 1` del RPC contra la `-1..+7` de `my_property_ids()` |
| `00_rls_aseos` | 14 | El aseador no puede hacer UPDATE directo sobre `cleanings` | Ya estaba verde; dejó de estar bloqueada por el aborto de la 11 |
| `00_rls_aseos` | 15 | El admin ve los 2 aseos | Igual |
| `00_rls_aseos` | 16 | El aseador no lee la bitácora de códigos | Igual |
| `02_guardarrailes` | 9 | **Nueva.** Ninguna función de `public` ni `private` es ejecutable por `anon` | Los 6 `revoke all ... from public, anon` de la migración 09, sobre los 5 del plan 01-07 |
| `04_storage` | 1 | El bucket `evidencia` existe y es privado | `insert into storage.buckets ... public = false` |
| `04_storage` | 2 | B no puede subir evidencia a la carpeta de un aseo ajeno | `evidencia_cleaner_insert` contra `my_writable_cleaning_ids()` |
| `04_storage` | 3 | La aseadora asignada sube mientras el aseo está en curso | Misma policy, lado positivo |
| `04_storage` | 4 | A no lee la evidencia de un aseo ajeno | `evidencia_cleaner_select` contra `my_cleaning_ids()` |
| `04_storage` | 5 | Ninguna policy de DELETE alcanza al aseador | La ausencia de policy de `UPDATE`/`DELETE`, que es lo único que puede imponer la inmutabilidad |

### Rojas todavía

**Ninguna.** Los 5 archivos salen `ok` y la suite sale `Result: PASS`. No queda ninguna aserción de la fase pendiente de dueño.

Los dos guards de "regla (c)" (`00_rls_aseos` tras la aserción 14 y `04_storage` al final) tampoco dispararon: el `UPDATE` denegado no modificó la fila y el `DELETE` de 0 filas no borró el objeto.

## La verificación funcional que la suite no cubre

`00_rls_aseos` solo ejerce `reveal_access_code()`. Las otras cinco funciones se verificaron a mano contra la base local, en transacciones con `rollback`, porque sus invariantes son justamente lo que el plan pedía demostrar:

| Caso | Resultado |
|---|---|
| `confirm_cleaning` invocada por un aseador | `42501 no_autorizado` |
| `confirm_cleaning` sobre apartamento sin `responsable_id` | `P0001 sin_responsable` |
| `confirm_cleaning` OK | el aseo queda **`pendiente`**, asignado, con `confirmado_by` = admin |
| Checklist materializado | 6 items (2 cuartos × 3 tareas), con `room_label`, `task_label` y `requiere_foto` copiados como snapshot |
| Notificación de asignación | 1 fila `asignacion`, `push_status = 'pendiente'`, `dedupe_key = assign:{cleaning}:{aseador}` |
| `confirm_cleaning` dos veces | `P0001 aseo_no_confirmable` |
| `finish_cleaning` sin haber empezado | `42501` |
| `start_cleaning` OK | `en_curso` con `started_at` |
| `finish_cleaning` con el checklist sin marcar | `P0001 checklist_incompleto` |
| **`finish_cleaning` con todo marcado pero SIN fotos** | **`P0001 checklist_incompleto`** — es la mitad del guard que se olvida |
| `finish_cleaning` con las 6 fotos | `completada` con `finished_at` |
| `finish_cleaning` sobre un aseo ya completado | `42501` (terminal) |
| `decline_cleaning` de un aseo ajeno | `42501`, y la fila **no cambió** (verificado como `postgres`) |
| `toggle_checklist_item` de un item ajeno | `42501` |
| `decline_cleaning` por la asignada | `pendiente`, `aseador_id` NULL, `started_at` NULL, **`confirmado_at`, `num_huespedes`, `instrucciones` y los 3 items del checklist intactos** |
| Alerta del "no puedo" | 1 fila `no_puedo` al admin, con el motivo en `body` y en `payload`, misma transacción |
| `cleaning_state_transitions` | 2 filas escritas **por el trigger**: `pendiente→en_curso` y `en_curso→pendiente`, con `actor_id` de la aseadora |
| `set role anon; select public.reveal_access_code(...)` | `permission denied for function reveal_access_code` |
| `set role anon; select public.start_cleaning(...)` | `permission denied for function start_cleaning` |

## La autorización circular de Storage: cómo se cerró

El prompt de este plan pedía razonarlo antes de escribir las policies. La conclusión tiene dos mitades y solo una era un problema.

**Las policies de `storage.objects` NO son circulares.** El predicado es `(storage.foldername(name))[1] in (select id::text from private.my_writable_cleaning_ids())`. La ruta la propone el cliente, sí, pero es el **sujeto** de la comprobación, no la fuente de autoridad: el conjunto contra el que se compara lo deriva el servidor de `cleanings.aseador_id`. Un aseador que pida subir a la carpeta de otro recibe un deny. Verificado en las dos direcciones, incluida una ruta malformada sin carpetas (`no-es-un-uuid.webp`), que da **deny limpio de RLS** y no un error de tipo — que es exactamente por lo que la comparación se hace como `text` y no casteando a `uuid`.

**Donde sí era circular es una línea más abajo**, y es el `threat_flag: file-access` que el plan 01-04 dejó marcado como decisión de este plan. La cadena completa:

1. La aseadora A sube legítimamente a `<su-aseo>/checklist/x.webp`. Permitido: el aseo es suyo.
2. A inserta en `cleaning_photos` una fila con `cleaning_id = <su aseo>` — que `photos_cleaner_insert` aprueba, porque valida **solo** `cleaning_id in my_writable_cleaning_ids()` — pero con `storage_path = '<aseo-de-B>/checklist/ajena.webp'`.
3. La vista de detalle de la Fase 6 lista las fotos de su propio aseo y, por cada fila, emite `createSignedUrl(storage_path)` desde un Server Component que ya verificó que el aseo es suyo.
4. La signed URL sale sobre el objeto de B. **La policy de `storage.objects` no interviene**: la firma es server-side, y la autoridad se derivó de una ruta que eligió el atacante.

**Cómo se cerró** (desviación 1, Regla 2):

```sql
alter table public.cleaning_photos
  add constraint photo_path_bajo_su_aseo
  check (starts_with(storage_path, cleaning_id::text || '/' || kind || '/'));
```

Ancla la ruta a `cleaning_id`, que es la única columna de esa fila que el servidor sí autorizó. `starts_with()` y no `like` porque es un prefijo exacto sin metacaracteres que razonar; las dos funciones involucradas son `IMMUTABLE` (`provolatile = 'i'`, verificado), que es lo que un `CHECK` exige. Se ata también el `kind`, porque la convención completa es `{cleaning_id}/{kind}/{uuid}.{ext}` y cuesta lo mismo imponerla entera.

Medido:

| Caso | Resultado |
|---|---|
| Ruta legítima bajo el propio aseo, 3 filas | `INSERT 0 3` |
| **El ataque**: `cleaning_id` propio, `storage_path` del aseo de B | `23514 photo_path_bajo_su_aseo` |
| `kind = 'dano'` con carpeta `/checklist/` | `23514 photo_path_bajo_su_aseo` |
| Flujo completo con el CHECK puesto (subir 3 objetos + 3 filas + toggle + finish) | `completada` |

Lo que **queda abierto** y con qué dueño está en `deferred-items.md`, hallazgos 7 y 8: la coherencia `checklist_item_id` ↔ `cleaning_id` (necesita un trigger, no un CHECK; dueño Fase 6, cuando existan las tres funciones de reporte) y los objetos huérfanos sin fila en `cleaning_photos` (dueño Fase 9, RET-06).

## Files Created/Modified

- **`supabase/migrations/20260831223038_09_rpc.sql`** (598 líneas). Las 6 funciones, cada una con su `revoke`/`grant` al lado. La cabecera lleva la medición del plan 01-07 sobre por qué el revoke no se hereda, y por qué estas funciones no necesitan ningún grant de tabla. Cierra con la lista de lo que va a las Fases 4 y 6, con su razón.
- **`supabase/migrations/20260831224030_10_storage.sql`** (205 líneas). Bucket, 3 policies, y el `CHECK` de la ruta con el ataque escrito paso a paso al lado. Marcada `[ASSUMED en hosted — verificar en el primer db push a dev, ver plan 01-09]`.
- **`supabase/tests/02_guardarrailes.test.sql`** — guardarraíl 9 nuevo, `plan(9)` → `plan(10)`. Es la única modificación a la suite y es **aditiva**: no se debilitó ninguna aserción existente.
- **`.planning/phases/01-fundaci-n-schema-y-rls/deferred-items.md`** — hallazgos 7 y 8.

`STATE.md` y `ROADMAP.md` intactos, como exige la ejecución en worktree paralelo.

## Verificaciones ejecutadas

| Verificación | Resultado |
|---|---|
| `npx supabase db reset --local` | exit 0, 10 migraciones aplicadas |
| `npx supabase db lint --local` | `No schema errors found` |
| `npx supabase db advisors --local --type security --fail-on error` | `No issues found`, exit 0 |
| `npx supabase test db --local` | **Files=5, Tests=47, Result: PASS** |
| Funciones de las 6 firmas en `public` | 6 de 6 |
| `has_function_privilege('anon', …, 'execute')` sobre las 17 de `public` + `private` | `f` en las 17 |
| Funciones `SECURITY DEFINER` sin `search_path` fijado | 0 |
| `information_schema.routine_privileges` para `anon`/`PUBLIC` sobre los RPC | 0 |
| `set role anon` invocando 2 RPC distintos | `permission denied for function` en los dos |
| `storage.buckets` donde `id='evidencia'` | `public = f`, `10485760`, `{image/jpeg,image/png,image/webp}` |
| Policies `evidencia_*` sobre `storage.objects` | 3 |
| Policies `evidencia_cleaner*` de `UPDATE` o `DELETE` | 0 |
| Policies `evidencia_*` con cast a `uuid` en el predicado | 0 |
| `bash scripts/ci/check-service-role.sh` | `check-service-role: OK` |
| Ataque de `storage_path` cruzado | `23514`, bloqueado |
| Flujo completo confirm→start→toggle→foto→finish | `completada` |

## Decisions Made

- **`reveal_access_code()` no delega en `private.my_unlockable_property_ids()`.** El plan 01-07 dejó ese helper escrito con la ventana `hoy..hoy+1` para que lo consumiera esta función, y aun así se usó la consulta directa de `ARCHITECTURE.md`. La razón es de fuerza de la autorización: el helper es **property-scoped**, así que delegarle la decisión degradaría el predicado de *"este aseo tuyo es desbloqueable"* a *"tienes algún aseo desbloqueable en ese apartamento"*, que es estrictamente más débil y pierde el ancla al aseo concreto. Las dos ventanas quedan duplicadas, y eso está escrito como contrato en la migración: si una cambia, la otra tiene que cambiar.
- **`42501` uniforme y sin detalle en `reveal_access_code()`.** No discrimina entre "no existe", "no es tuyo" y "todavía no es su día". Un error más informativo sería un oráculo de enumeración de aseos ajenos.
- **`P0001` para lo que falla por estado del dominio, `42501` para lo que falla por autorización.** `confirm_cleaning` con un aseo ya confirmado da `P0001`, no `42501`: el admin **sí** está autorizado, y la UI necesita poder decir "este aseo ya estaba confirmado" en vez de "no tienes permiso".
- **`for update of c` en `confirm_cleaning`.** Sin el `of c`, el join bloquearía también la fila de `properties` y dos confirmaciones de aseos distintos del mismo apartamento se serializarían sin ninguna necesidad.
- **`decline_cleaning` usa `update … returning into` como guarda y escritura a la vez.** Un `select … for update` previo sería una condición de carrera innecesaria y una consulta más.
- **`sort_order` del checklist = `pr.sort_order * 100 + ct.slot`.** El cuarto manda y el slot desempata. El `*100` deja sitio para cuando se levante el tope estructural de 3 tareas por tipo de cuarto.
- **Las notificaciones llevan `dedupe_key` con las claves de `ARCHITECTURE.md` §Fanout** (`assign:`, `done:`, `decline:`) y un `on conflict … do nothing`. Reconfirmar o reintentar no duplica la campana.
- **`finish_cleaning` y `decline_cleaning` notifican a los admins con un `select` sobre `profiles`, no a un destinatario fijo.** No hay tabla de "admins activos"; el fanout se resuelve en la consulta.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Seguridad] `CHECK photo_path_bajo_su_aseo`: la autorización de Storage era circular sin él**

- **Found during:** Task 3, razonando las policies antes de escribirlas, como pedía el prompt.
- **Issue:** el plan 01-04 dejó marcado como `threat_flag: file-access` que nada en la base impedía insertar una fila de `cleaning_photos` cuyo `storage_path` empezara por el `cleaning_id` de otro aseo, y lo asignó explícitamente como decisión de este plan. Con las policies de Storage puestas, esa fila se convierte en una fuga de lectura: la Fase 6 firma `storage_path` tras verificar `cleaning_id`, así que la autoridad se derivaría de una ruta que eligió el atacante. La cadena completa está arriba, en su propia sección.
- **Fix:** `alter table public.cleaning_photos add constraint photo_path_bajo_su_aseo check (starts_with(storage_path, cleaning_id::text || '/' || kind || '/'))`, en la migración 10 y no en una nueva, porque es el mismo archivo que abre el vector y así se revierte con él.
- **Por qué es Regla 2 y no Regla 4:** es un `CHECK` aditivo sobre una tabla vacía, no un cambio estructural, y el `<threat_model>` del propio plan asigna `mitigate` a T-01-52 (*"Aseador lee o sube fotos de un aseo ajeno enumerando rutas de Storage"*). Sin este CHECK, esa mitigación está incompleta por el flanco que no pasa por las policies.
- **Files modified:** `supabase/migrations/20260831224030_10_storage.sql`
- **Verification:** el ataque da `23514`; el `kind` cruzado da `23514`; el flujo legítimo completo (3 objetos + 3 filas + toggle + finish) pasa.
- **Committed in:** `30ebb9f`

**2. [Rule 2 - Seguridad] Guardarraíl 9: sin él, nada impone el `revoke` por función**

- **Found during:** Task 1.
- **Issue:** el hallazgo 5 de `deferred-items.md` establece que cada función nueva de `public` necesita su propio `revoke all … from public, anon` porque PG 17.6 no lo hereda, y asignaba la aserción de guardarraíl al plan 01-09. Pero el criterio de éxito de esta ejecución exige *"una aserción probando que `anon` no puede ejecutar"* cada RPC, y el riesgo es real ahora: son 6 funciones nuevas y el olvido es **silencioso**.
- **Fix:** aserción 9 nueva en `02_guardarrailes.test.sql`, `plan(9)` → `plan(10)`. Usa `has_function_privilege('anon', p.oid, 'execute')` y **no** un join contra `information_schema.routine_privileges`: esa vista no lista los privilegios de PUBLIC como tales, así que una función con `proacl` NULL — el caso por defecto, y el peligroso — le sale limpia. El propio `<verify>` del plan usaba esa vista; habría dado un verde falso.
- **Nota:** es la única modificación a la suite y es **aditiva**. No se debilitó ninguna aserción existente.
- **Files modified:** `supabase/tests/02_guardarrailes.test.sql`
- **Verification:** verde con las 17 funciones de `public` y `private`.
- **Committed in:** `090a456`

**3. [Rule 3 - Blocking] `npm ci` en el worktree**

- **Found during:** arranque.
- **Issue:** el worktree no hereda `node_modules`, así que `npx supabase` resolvía a una versión del caché en vez de la 2.116.0 pineada. Cuarta vez que se reporta la misma desviación (planes 01-02, 01-03, 01-07). Se va a repetir en cada worktree.
- **Fix:** `npm ci`. Ningún archivo versionado cambia.

**4. [Rule 3 - Blocking] El worktree arrancó 7 planes por detrás de la base**

- **Found during:** el chequeo de rama obligatorio, antes de leer nada.
- **Issue:** `git merge-base HEAD <base>` devolvió el propio HEAD, es decir el worktree estaba en `25e6976` (*"chore: disable stale auto-chain flag"*), **ancestro** de la base esperada `8671a92`. Le faltaban los planes 01-01 a 01-07 completos: sin las 8 migraciones previas no había nada sobre lo que construir.
- **Fix:** `git reset --hard 8671a92`, que es exactamente lo que prescribe el bloque `<worktree_branch_check>` para este caso. Árbol limpio después.

### Correcciones a los snippets de verificación del plan

Dos `<automated>` del plan no se ejecutaron tal cual porque son incorrectos. Se sustituyeron por su versión medida y la razón queda escrita:

1. **`p.proconfig @> array['search_path=']`.** El literal que PG 17.6 almacena es `search_path=""`, entrecomillado, porque `search_path` es `GUC_LIST_QUOTE`. Con el literal del plan, la consulta habría reportado las 12 funciones `SECURITY DEFINER` como fallidas. **Es el tercer plan consecutivo que publica este snippet mal**, y el guardarraíl 5 de la suite ya acepta las dos formas precisamente por eso. Se usó `array['search_path="\"\""']` en su forma correcta y el resultado fue 0.
2. **`information_schema.routine_privileges … grantee in ('anon','PUBLIC')`.** Devuelve 0 igualmente, pero por la razón equivocada: esa vista no expone los privilegios de PUBLIC, así que devolvería 0 también sobre una función completamente abierta. Se ejecutó igual (da 0) pero la verificación que **de verdad** discrimina es `has_function_privilege`, que es la que quedó como guardarraíl 9.

## Issues Encountered

- **Las migraciones 09 y 10 suman 803 líneas y más de la mitad es comentario.** Deliberado, y por la misma razón que el plan 01-07: los RPC corren como `postgres`, que es owner de las 22 tablas y por tanto exento de su RLS. **Aquí no hay red de seguridad**: un `where` mal escrito no da `42501`, da los datos. El modo de fallo real no es que el SQL esté mal hoy, es que alguien lo "simplifique" en la Fase 4 sin saber qué sostenía cada línea.
- **`authenticated` no tiene `INSERT` sobre `damages`, `expenses` ni `missing_item_reports`** (verificado: `permission denied for table damages` con el `HINT` de Postgres sugiriendo el grant). Es correcto y es la matriz del plan 01-07: esas tres tablas se escriben desde las funciones de la Fase 6, no directo. Lo anoto porque al verificar `cleaning_photos` con `kind = 'dano'` hace falta insertar el daño como `postgres`.
- **`lib/database.types.ts` sigue sin existir**, así que `npm run db:types:check` falla en el `diff`. La generación funciona y ahora emite las 6 funciones bajo `Functions`. Es del plan 01-09, sin cambio.
- **La confianza sobre hosted de la migración 10 sigue siendo BAJA** y no hay forma de subirla desde local. Ver la sección siguiente.

## Known Stubs

Ninguno. Las dos migraciones están completas y aplicadas, y la suite pgTAP entera está en verde.

Dos cosas que **parecen** stubs y no lo son:

- **Las notificaciones se escriben y nadie las envía.** `push_status` queda en `'pendiente'` para siempre hasta la Fase 5. Es el patrón outbox, es intencional, y está escrito como comentario dentro de las tres funciones que insertan. Una llamada HTTP dentro de la transacción de negocio la dejaría abierta a merced de un servicio externo.
- **`evidencia_admin_all` cubre `UPDATE` y `DELETE` sobre `storage.objects`.** No contradice la inmutabilidad de la evidencia: la inmutabilidad es **para el aseador**, y se impone por la ausencia de policies `evidencia_cleaner_update`/`_delete`. El admin necesita poder borrar un objeto subido por error.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: file-access | `supabase/migrations/*_10_storage.sql` | **Riesgo transferido, confianza BAJA, y es el único de la fase que no se puede cerrar desde local.** Las 3 policies sobre `storage.objects` se crean en local pese a que `postgres` **no** es owner de la tabla (lo es `supabase_storage_admin`) ni superusuario: funcionan por un permiso que Supabase concede de forma no evidente en el grafo de roles. Si en el proyecto hosted el `CREATE POLICY` falla o se aplica en silencio sin efecto, **el bucket queda sin ninguna autorización** y `authenticated` conserva el grant `arwdDxtm` que Supabase otorga de fábrica sobre `storage.objects`: es decir, cualquier usuario autenticado leería y escribiría la evidencia de cualquier aseo. Es T-01-55 del `<threat_model>`, y su verificación es la tarea con checkpoint humano del plan 01-09. La migración lleva el bloque marcado `[ASSUMED en hosted]` |
| threat_flag: privilege-surface | `public.cleaning_photos` / `photos_cleaner_insert` | Superficie que el `<threat_model>` del plan no contempla: la policy de INSERT valida `cleaning_id` pero **ninguno de los cuatro punteros de dueño** (`checklist_item_id`, `damage_id`, `expense_id`, `missing_report_id`). El `CHECK` que se añadió aquí cierra la mitad que importaba (la ruta), pero una fila puede seguir colgando de un `checklist_item` de otro aseo. No es explotable contra el guard de `finish_cleaning()` del propio aseo, y no es expresable con un `CHECK` (necesita subconsulta). Hallazgo 7 de `deferred-items.md`, dueño Fase 6 |
| threat_flag: privilege-surface | `storage.objects` (objetos huérfanos) | La subida a Storage y el `INSERT` en `cleaning_photos` son dos operaciones independientes y ninguna exige la otra, ni pueden envolverse en una transacción (la subida real la hace la Storage API). Un objeto sin fila queda fuera de `storage_deletion_queue` y por tanto **fuera de la purga de retención**: se factura para siempre y conserva el dato sensible dentro. Hallazgo 8 de `deferred-items.md`, dueño Fase 9 (RET-06) |

## Contrato para los planes siguientes

| Para | Qué | Por qué |
|---|---|---|
| **01-09** | El checkpoint humano tiene que confirmar, en el proyecto hosted, que `storage.buckets` tiene `evidencia` con `public = false` **y** que `pg_policies` lista las 3 `evidencia_*` | Es el único riesgo de la fase que no se puede cerrar desde local. Si falla, las policies se crean desde el dashboard y se documenta como excepción a "el CLI es la fuente de verdad" |
| **01-09** | El guardarraíl que el hallazgo 5 le asignaba (*ninguna función de `public` es ejecutable por `anon`*) **ya está escrito** como aserción 9 de `02_guardarrailes` | No hay que volver a añadirlo. El archivo está en `plan(10)` |
| **Fase 2** | El admin llama `confirm_cleaning(uuid, smallint, text)`; **no** escribe `cleanings` directo | La matriz de grants del plan 01-07 le da `SELECT` y cero DML sobre `cleanings`, ni siquiera al admin |
| **Fase 4** | `cancel_cleaning()` y `reschedule_cleaning()` se añaden con el patrón exacto de la migración 09, **incluido el `revoke` por función** | La guarda de transiciones ya admite `pendiente|en_curso -> cancelada`, así que no hay que tocar la máquina de estados |
| **Fase 6** | `report_damage()`, `report_expense()` y `report_missing_items()`, más el trigger de coherencia foto↔item del hallazgo 7 | Las tablas, grants y policies ya existen. Solo faltan las funciones |
| **Fase 6** | La ruta de subida **tiene** que ser `{cleaning_id}/{kind}/{uuid}.{ext}` con el `kind` coincidiendo con la columna | Ahora es un `CHECK`, no una convención: `photo_path_bajo_su_aseo` rechaza con `23514` |
| **Fase 6** | Al firmar, `createSignedUrl(storage_path)` es seguro **porque** existe ese CHECK. Si alguien lo quita, la firma server-side vuelve a ser una fuga | Está escrito en el comentario de la constraint |
| **Toda fase** | Función nueva en `public` = definición **+** `revoke all … from public, anon` **+** `grant execute … to authenticated`, en la misma migración | El guardarraíl 9 falla si se olvida. El olvido es silencioso; la aserción no |

## Next Phase Readiness

- **La suite pgTAP de la Fase 1 está completa y en verde: 47 de 47, los 5 archivos en `PASS`.** No queda ninguna aserción con dueño pendiente.
- El contrato de RPC está congelado con las firmas exactas del bloque `<interfaces>` del plan, que es lo que `supabase gen types typescript` convierte en el tipado de las Fases 2, 4 y 6. Cambiarlo después rompe la UI.
- Lo único que la Fase 1 no puede cerrar por sí sola es la confirmación de las policies de Storage en hosted. Todo lo demás está medido contra la base local.

---
*Phase: 01-fundaci-n-schema-y-rls*
*Completed: 2026-08-31*

## Self-Check: PASSED

- 5 archivos declarados verificados en disco: las 2 migraciones, `02_guardarrailes.test.sql`, `deferred-items.md` y este SUMMARY.
- 3 commits verificados en el log: `090a456`, `dcd6b4d`, `30ebb9f`.
- `git diff --diff-filter=D --name-only 8671a92..HEAD` no devuelve nada: cero borrados.
- No se creó ninguna copia temporal de la suite dentro del repo; los scripts de verificación funcional vivieron en el scratchpad, fuera del árbol de trabajo, y `git status` sale limpio.
- La única modificación a la suite pgTAP es **aditiva** (guardarraíl 9). Ninguna aserción existente se debilitó, reordenó ni eliminó.
- `STATE.md` y `ROADMAP.md` sin modificar, como exige la ejecución en worktree paralelo.
