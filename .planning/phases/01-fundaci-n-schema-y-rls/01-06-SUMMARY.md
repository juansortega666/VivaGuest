---
phase: 01-fundaci-n-schema-y-rls
plan: 06
subsystem: database
tags: [postgres, supabase, triggers, maquina-de-estados, auditoria, snapshot-financiero, outbox, retencion, storage]

# Dependency graph
requires:
  - "01-03: public.properties (gestion_vivaguest, hora_limite, tarifa_huesped, pago_aseador), public.profiles, los 6 enums y public.tg_set_updated_at()"
  - "01-04: public.cleanings con is_managed/hora_limite/state SIN default, los 7 CHECK de forma y los 2 indices unicos parciales"
  - "01-05: el seed cargado, que es contra lo que corre la suite"
provides:
  - "public.tg_cleanings_snapshot() — BEFORE INSERT OR UPDATE: rellena is_managed, hora_limite, state y las dos tarifas al insertar; reimpone is_managed siempre y las tarifas en estado terminal"
  - "La guarda de transiciones dentro de esa misma funcion BEFORE: P0001 'transicion_invalida' para toda salida de completada/cancelada y todo movimiento fuera de la matriz de 6"
  - "public.cleaning_state_transitions — bitacora de cambios de estado, con actor_id NULL cuando escribe el sistema"
  - "public.tg_cleanings_log_transition() — AFTER UPDATE OF state, SECURITY DEFINER con search_path vacio"
  - "public.notifications — bandeja y outbox de push a la vez, con notifications_dedupe_idx, notifications_outbox_idx y notifications_inbox_idx"
  - "public.push_subscriptions — endpoint UNIQUE GLOBAL, con push_subs_user_idx"
  - "public.storage_deletion_queue — unique (bucket, path), sin FK hacia cleanings, con sdq_pending_idx"
  - "REVOKE de anon y authenticated sobre las 4 tablas nuevas y sobre sus 2 secuencias bigserial"
affects:
  - "01-07: hereda 22 tablas sin RLS (eran 18). Las 4 nuevas necesitan policy. cleaning_state_transitions NO debe recibir INSERT para authenticated: es lo que sostiene T-01-33"
  - "01-07: notifications y push_subscriptions si necesitan grants para authenticated; storage_deletion_queue no (guardarrail 8 lo verifica por nombre)"
  - "01-08: confirm_cleaning(), start_cleaning(), finish_cleaning(), decline_cleaning() y cancel_cleaning() ya no pueden mover el estado a su antojo: la matriz manda. decline_cleaning() es en_curso -> pendiente"
  - "01-08: decline_cleaning() ya tiene notifications donde escribir dentro de su transaccion"
  - "01-09: mapDbError() debe traducir el errcode P0001 con message 'transicion_invalida'; el DETAIL trae 'origen -> destino'"
  - "Fase 4: 'no puedo' es en_curso -> pendiente y CONSERVA confirmado_at, verificado"
  - "Fase 5: el worker de push drena notifications por notifications_outbox_idx y revoca por endpoint"
  - "Fase 9: la purga encola en storage_deletion_queue ANTES de borrar filas; el on conflict (bucket, path) do nothing la hace reintentable"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "La congelacion financiera se impone reescribiendo la fila, no bloqueando el UPDATE: un raise romperia legal_hold y la purga sobre aseos ya cerrados"
    - "La maquina de estados es un trigger BEFORE con P0001, no un CHECK: un CHECK daria 23514 y no se distinguiria de un fallo de forma"
    - "Las tablas que otro plan consume nacen completas, con sus indices, aunque su worker no exista"
    - "El bloque REVOKE se repite en cada migracion que cree tablas o secuencias, hasta que 01-07 revoque los default privileges"

key-files:
  created:
    - "supabase/migrations/20260831215108_05_triggers_y_maquina_de_estados.sql"
    - "supabase/migrations/20260831215109_06_retencion_y_notificaciones.sql"
  modified: []
  deleted: []

key-decisions:
  - "La congelacion de FIN-01 se implementa por REIMPOSICION y no bloqueando el UPDATE: se verifico que legal_hold y deleted_at siguen siendo escribibles sobre un aseo cerrado, que es lo que necesita la Fase 9"
  - "La guarda de transiciones vive DENTRO de tg_cleanings_snapshot() y no en un trigger propio: is_managed tiene que fijarse antes de validar, y dos triggers BEFORE dependerian del orden alfabetico de sus nombres"
  - "NULL -> cualquier estado y cualquier estado -> NULL se rechazan con P0001: is_managed es inmutable, asi que una fila informativa no entra ni sale de la maquina"
  - "El INSERT del aseo NO se registra como transicion. La aseracion 10 cuenta 2 para pendiente -> en_curso -> completada"
  - "cleaning_state_transitions.cleaning_id es ON DELETE CASCADE, al contrario que access_code_reads: este log es operativo, no de acceso"
  - "tg_set_updated_at NO se engancha en la migracion 06: ninguna de las tres tablas tiene columna updated_at, y anadirla seria inventar semantica"
  - "select into STRICT en la rama INSERT, como ARCHITECTURE.md: un property_id inexistente da P0002 y no 23503. Documentado en el archivo"

requirements-completed: [FIN-01, ASEO-07]

# Metrics
duration: 38min
completed: 2026-08-31
---

# Phase 1 Plan 06: Triggers, máquina de estados y retención Summary

**Dos migraciones (556 líneas) que cierran FIN-01 como invariante de base y no como convención: el trigger `BEFORE` reimpone las tarifas de todo aseo en estado terminal venga de donde venga la escritura, rechaza con `P0001` toda transición fuera de una matriz de 6, y deja rastro de cada cambio en `cleaning_state_transitions`. Con ellas, `01_invariantes.test.sql` pasa de abortar entero a 11/11 verde y los otros dos archivos bloqueados dejan de morir en su bloque de limpieza.**

## Performance

- **Duration:** ~38 min
- **Tasks:** 2 de 2
- **Migraciones creadas:** 2 archivos, 556 líneas (4 tablas, 2 funciones, 2 triggers, 6 índices)
- **Aserciones pgTAP de rojo a verde:** 11
- **Archivos que dejaron de abortar en el bloque de limpieza:** 3 de 3
- **Comportamientos verificados a mano:** 18 casos, 18 correctos

## Accomplishments

- **`01_invariantes.test.sql` pasa 11/11.** Era el objetivo del plan y es el primer archivo de la suite que se cierra completo. Incluye las 3 aserciones de FIN-01, las 4 de ASEO-07, la de fila inerte, la de transición inválida, la del conteo de transiciones y la de activación de apartamento.
- **Los tres archivos que abortaban en `delete from public.cleaning_state_transitions` ya no lo hacen.** Eso era 32 aserciones que nunca llegaban a ejecutarse. El detalle de cuántas corren ahora y quién es dueño de las que faltan está en la tabla de más abajo: el cuello de botella se movió del schema a los grants y al bucket.
- **El segundo bloqueo que midió el plan 01-04 también cayó.** Los fixtures insertan aseos sin `is_managed`, `hora_limite` ni `state`; `tg_cleanings_snapshot()` los rellena. Ningún `default` de conveniencia hizo falta, que era la trampa que el 01-04 se negó a pisar.
- **FIN-01 quedó cerrado como invariante de base.** La aserción decisiva no es que subir la tarifa del apartamento no mueva el aseo, sino que un `update cleanings set tarifa_huesped = 1` DIRECTO sobre el aseo completado tampoco lo mueva. La clave de servicio tiene `BYPASSRLS`, no "bypass triggers".
- **La máquina de estados existe de verdad**, con las 6 transiciones legales y los 2 estados terminales sin salida, y cada cambio deja fila con `actor_id`. Medido en las dos direcciones: con JWT en la sesión queda el uuid de la persona, sin JWT queda NULL.
- `db reset` aplica las 6 migraciones desde cero. `db lint` limpio. `db advisors --type security --fail-on error` sale 0. `check-service-role.sh` OK.
- Las 4 tablas nuevas y sus 2 secuencias `bigserial` nacen sin ningún privilegio para `anon` ni `authenticated`. Guardarraíles 4, 4b y 8 en verde con 22 tablas.

## Task Commits

1. **Task 1: migración 05 — snapshot, guarda de transiciones y log** — `da62ca6` (feat)
2. **Task 2: migración 06 — notificaciones, push y cola de Storage** — `ce6e7de` (feat)

## El delta rojo → verde, medido

Corrida completa de `npx supabase test db --local` antes y después, sobre la base recién reseteada con el seed cargado.

### Antes de este plan

| Archivo | Aserciones | Estado | Causa |
|---|---|---|---|
| `00_rls_aseos` | 16 | **aborta en línea 28** | `relation "public.cleaning_state_transitions" does not exist` |
| `01_invariantes` | 11 | **aborta en línea 19** | la misma |
| `02_guardarrailes` | 9 | 8 verdes, 1 roja | guardarraíl 1 (RLS) |
| `03_seed` | 5 | 5 verdes | — |
| `04_storage` | 5 | **aborta en línea 48** | la misma |

**14 de 46 aserciones ejecutándose, 13 verdes.**

### Después de este plan

| Archivo | Aserciones | Estado | Causa del corte |
|---|---|---|---|
| `00_rls_aseos` | 16 | aborta en **línea 111** | `permission denied for table cleanings` (42501) al ejecutar la **aserción 1** |
| `01_invariantes` | 11 | **11 verdes** | — |
| `02_guardarrailes` | 9 | 8 verdes, 1 roja | guardarraíl 1 (RLS), ahora con 22 tablas |
| `03_seed` | 5 | 5 verdes | — |
| `04_storage` | 5 | aborta en **línea 97** | `objects_bucketId_fkey`: el bucket `evidencia` no existe |

**25 de 46 aserciones ejecutándose, 24 verdes. +11 verdes, todas de este plan.**

### Las 21 que siguen rojas, con su dueño

| Archivo | Aserciones | Qué falta exactamente | Dueño |
|---|---|---|---|
| `00_rls_aseos` | 16 | **`grant select on public.cleanings to authenticated`** más las policies. El bloqueo ya NO es de schema: el archivo recorre la limpieza, inserta los 4 usuarios, los 4 perfiles, los 3 apartamentos, los 2 secretos y **los 2 aseos** (que solo existen gracias al trigger de este plan) y muere en la primera aserción por falta de grant. Detrás de ese grant esperan además `reveal_access_code()` y `my_property_ids()` | **01-07** desbloquea el archivo; **01-08** pone en verde las aserciones 7, 11, 12 y 13 |
| `04_storage` | 5 | **`insert into storage.buckets ... 'evidencia'`**. El archivo ya recorre la limpieza, los fixtures y el `update ... state = 'en_curso'` — que pasa por la máquina de estados de este plan — y muere al sembrar la evidencia ajena porque el bucket no existe. Después necesitará las policies de `storage.objects` | **01-08** |
| `02_guardarrailes` | 1 | Guardarraíl 1: RLS en las 22 tablas. Este plan añadió 4 a la lista (`cleaning_state_transitions`, `notifications`, `push_subscriptions`, `storage_deletion_queue`). No es regresión: es el alcance declarado que hereda el siguiente plan | **01-07** |

## Los invariantes, verificados uno a uno

Además de las 11 aserciones, se ejercieron 18 casos a mano sobre la base reseteada, con `savepoint`/`rollback to` para aislar cada uno. Son los que la suite no cubre y que otros planes van a asumir.

### Migración 05 — snapshot y máquina de estados

| Caso | Esperado | Medido |
|---|---|---|
| INSERT en unidad gestionada | `is_managed=t`, `state=pendiente`, `hora_limite` y tarifas copiadas | `t / pendiente / 11:30 / 120000 / 45000` ✅ |
| INSERT en unidad de gestión externa | `is_managed=f`, `state` NULL, tarifas NULL, `hora_limite` sí copiada | `f / NULL / 11:30 / NULL` ✅ |
| INSERT de un `repaso` con tarifa propia | el `coalesce` NO la pisa con la del apartamento | `50000 / 20000` ✅ |
| `actor_id` con JWT en la sesión | el uuid de la persona | `aaaaaaaa-…` ✅ |
| `actor_id` sin JWT (job, clave de servicio) | NULL | NULL ✅ |
| `en_curso -> pendiente` ("no puedo") | permitido y **conserva `confirmado_at`** | `pendiente`, `conserva_confirmado = t` ✅ |
| `reason` en una cancelación | copia `cancel_reason` | `huesped extendio` ✅ |
| `cancelada -> pendiente` | `P0001` | `ERROR: transicion_invalida`, `DETAIL: cancelada -> pendiente` ✅ |
| `NULL -> pendiente` sobre fila informativa | `P0001` | `ERROR: transicion_invalida`, `DETAIL: NULL -> pendiente` ✅ |
| `update ... set is_managed = false` | se reimpone `true` (T-01-34) | `is_managed = t` ✅ |
| Congelación también en `cancelada`, no solo en `completada` | tarifas intactas | `120000 / 45000` ✅ |
| `legal_hold` sobre un aseo cerrado | **se escribe** y las tarifas siguen congeladas | `legal_hold = t`, `tarifa = 120000` ✅ |
| Editar la tarifa de un aseo VIVO | sí se puede | `pendiente`, `200000` ✅ |
| `search_path` de las funciones `SECURITY DEFINER` de `public` | 0 sin fijar | 0 ✅ |
| Triggers en `cleanings` | 3: `set_updated_at`, `snapshot`, `log_transition` | 3 ✅ |

El caso de `legal_hold` es el que justifica la decisión de diseño más importante del archivo: **la congelación se impone reescribiendo, no bloqueando.** Si `tg_cleanings_snapshot()` levantara una excepción al detectar un `UPDATE` sobre un aseo terminal, la Fase 9 no podría marcar `deleted_at` y el admin no podría poner retención legal sobre un aseo cerrado, que es justo el escenario para el que `legal_hold` existe.

### Migración 06 — outbox y cola

| Caso | Esperado | Medido |
|---|---|---|
| Dispositivo compartido: `upsert on conflict (endpoint)` | 1 sola fila, `user_id` reasignado a B (T-01-36) | `filas=1`, `dueno=bbbbbbbb-…` ✅ |
| 2ª notificación con el mismo `dedupe_key` | `23505` sobre `notifications_dedupe_idx` | `duplicate key … notifications_dedupe_idx` ✅ |
| 2 notificaciones con `dedupe_key` NULL | conviven | `sin_clave = 2` ✅ |
| Defaults del outbox | `pendiente / 0 / next_attempt_at no nulo / {}` | los 4 ✅ |
| Encolado repetido en la cola de Storage | `on conflict do nothing`, sin duplicar | `INSERT 0 0`, total 2 ✅ |
| FK de `storage_deletion_queue` hacia `public` | **0** — la cola es independiente | 0 ✅ |

El último es el que hace que el paso 2 de la purga pueda completarse aunque el 3 falle. Con una FK hacia `cleanings`, borrar el aseo se llevaría por delante las rutas que todavía no se han borrado del bucket, y el archivo quedaría huérfano facturando para siempre.

## Files Created/Modified

- `supabase/migrations/20260831215108_05_triggers_y_maquina_de_estados.sql` — 333 líneas. `tg_cleanings_snapshot()` con sus dos ramas y la guarda de transiciones, `cleaning_state_transitions` con `cst_cleaning_idx`, `tg_cleanings_log_transition()` `SECURITY DEFINER`, los 2 triggers, 4 `COMMENT ON` y el bloque REVOKE (tabla + secuencia). La cabecera numera las 3 divergencias respecto a `ARCHITECTURE.md`.
- `supabase/migrations/20260831215109_06_retencion_y_notificaciones.sql` — 223 líneas. `push_subscriptions`, `notifications` y `storage_deletion_queue` con sus 5 índices, 7 `COMMENT ON`, el bloque REVOKE (3 tablas + 1 secuencia) y la lista explícita de lo que NO va en el archivo y por qué.

Ningún otro archivo tocado. `STATE.md`, `ROADMAP.md`, `supabase/tests/` y `supabase/seeds/` intactos.

## Verificaciones ejecutadas

| Verificación | Resultado |
|---|---|
| `npx supabase db reset --local` | exit 0, 6 migraciones aplicadas |
| `npx supabase db lint --local` | `No schema errors found` |
| `npx supabase db advisors --local --type security --fail-on error` | `No issues found`, exit 0 |
| `npx supabase test db --local supabase/tests/01_invariantes.test.sql` | `Result: PASS`, 11/11, sin `Bad plan` |
| Funciones `SECURITY DEFINER` de `public`/`private` sin `search_path` fijado | 0 |
| Triggers no internos en `public.cleanings` | 3, en el orden esperado |
| `notifications`, `push_subscriptions`, `storage_deletion_queue` | 3 de 3 |
| Los 5 índices de la migración 06 | 5 de 5 |
| `push_subscriptions.endpoint` | `CREATE UNIQUE INDEX … btree (endpoint)` — global, no compuesto |
| `storage_deletion_queue` | `UNIQUE (bucket, path)` |
| `grep -rni 'cron.schedule\|purge_expired\|notify_retention' supabase/migrations` fuera de comentarios | sin coincidencias |
| `legal_hold` en `information_schema.columns` | solo `cleanings`, sin duplicar |
| Privilegios de `anon`/`authenticated` sobre tablas de `public` | 0 |
| Privilegios de `anon`/`authenticated` sobre secuencias de `public` | 0 |
| `service_role` con SELECT sobre `cleaning_state_transitions` | sí |
| `bash scripts/ci/check-service-role.sh` | `check-service-role: OK` |
| 18 casos de comportamiento ejercidos a mano | 18 de 18 correctos |

## Decisions Made

- **La congelación financiera se impone, no bloquea.** Detallado arriba: un `raise` sobre cualquier `UPDATE` de un aseo terminal rompería `legal_hold` y la purga de la Fase 9. Lo que no puede cambiar son los dos números, y se reimponen. La aserción 3 de la suite lo comprueba así: no verifica que el `UPDATE` falle, verifica que el valor siga siendo 120000 después.
- **La guarda de transiciones vive dentro de `tg_cleanings_snapshot()`.** Dos triggers `BEFORE` separados dependerían del orden alfabético de sus nombres para que `is_managed` esté fijado cuando se valida, y ese orden es invisible en el DDL. Una sola función lo hace explícito y encima ahorra una invocación por `UPDATE`.
- **La matriz de transiciones va como lista literal en la función, no como tabla de configuración.** Son 6 transiciones. Una tabla añadiría una consulta a cada `UPDATE` de `cleanings` para ganar una flexibilidad que nadie ha pedido, y la haría editable en caliente sin migración, que para una máquina de estados es un defecto y no una virtud.
- **`NULL -> estado` y `estado -> NULL` son transiciones inválidas (`P0001`).** `is_managed` es inmutable en `UPDATE`, así que una fila informativa nunca puede volverse gestionada ni al revés. El `CHECK cl_unmanaged_is_inert` la rechazaría igual con `23514`, pero `P0001` es más específico y dice cuál fue el movimiento en el `DETAIL`.
- **El `INSERT` del aseo no se registra como transición.** El estado inicial se deriva de `created_at` + `state`. Registrarlo duplicaría una fila por aseo, y la aserción 10 cuenta exactamente 2 transiciones para `pendiente → en_curso → completada`.
- **`cleaning_state_transitions.cleaning_id` es `ON DELETE CASCADE`**, al contrario que `access_code_reads.cleaning_id` (que el plan 01-04 dejó en `SET NULL`). Contraste deliberado: este log es operativo y se va con el aseo en la purga; el de lectura de códigos de cerradura es evidencia de acceso y tiene que sobrevivirla.
- **`tg_cleanings_log_transition()` es `SECURITY DEFINER`.** El plan 01-07 no le dará `INSERT` sobre la tabla a `authenticated`, así que el log no se puede falsificar desde el cliente aunque el `UPDATE` que lo dispara sí venga del cliente por RPC. Sin `DEFINER`, el `INSERT` correría con los privilegios del aseador y el flujo normal fallaría con `42501`.
- **`after update of state` y no `after update` a secas.** Con la cláusula `OF`, el trigger ni se considera en el `UPDATE` de la aserción 3, que solo toca tarifas. El `WHEN` lo filtraría igual, pero el `OF` se resuelve antes.
- **`tg_set_updated_at` no se engancha en la migración 06.** Ninguna de las tres tablas tiene columna `updated_at`. Añadírsela para poder enganchar el trigger sería inventar una semántica que nadie pidió: lo que estas tablas datan son eventos concretos (`last_success_at`, `read_at`, `deleted_at`), no "la última vez que se tocó la fila".
- **`notifications` es bandeja y outbox en la misma tabla.** El 100% de las notificaciones de este dominio se muestran en la campana Y se intentan enviar por push. Separarlas obligaría a un join en la pantalla más consultada de la app para no ganar nada.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `npm ci` en el worktree**

- **Found during:** arranque.
- **Issue:** el worktree no hereda `node_modules`, así que `npx supabase` resolvía a lo que hubiera en caché en vez de a la 2.116.0 pineada. Es la desviación recurrente de los planes 01-02, 01-03 y 01-04.
- **Fix:** `npm ci`. Ningún archivo versionado cambia. `npx supabase --version` → `2.116.0`.
- **Files modified:** ninguno.

**2. [Rule 3 - Blocking] Tres contenedores de Supabase local en `unhealthy`**

- **Found during:** arranque, `npx supabase start`.
- **Issue:** `supabase_analytics`, `supabase_vector` y `supabase_storage` no pasaron su health check y la CLI detuvo el stack entero. La base de datos sí arrancaba y aplicaba las migraciones antes de la parada.
- **Fix:** arrancar con `-x vector,logflare,studio,edge-runtime,imgproxy,inbucket,realtime,storage-api`. `supabase test db`, `db lint` y `db advisors` solo necesitan el contenedor de Postgres, y el esquema `storage` vive dentro de la base, no en el contenedor de la Storage API. Ningún archivo versionado cambia.
- **Nota para el plan 01-08:** las aserciones de `04_storage.test.sql` se ejercen por SQL contra `storage.objects` y `storage.buckets`, así que tampoco necesitan el contenedor. Si alguna verificación futura necesita la Storage API de verdad (por ejemplo probar que `remove()` sí borra el objeto), habrá que resolver antes el health check.

### Ajuste sobre el texto del plan (no es corrección de código)

**3. La verificación automatizada del `search_path` del plan estaba mal escrita y habría dado un falso rojo**

El plan pedía:

```
... and not (p.proconfig @> array['search_path='])
```

Ese literal no es el que Postgres almacena. `search_path` es `GUC_LIST_QUOTE`, así que 17.6 serializa la cadena vacía **entrecomillada**: `search_path=""`. Está medido y documentado en el propio comentario del guardarraíl 5 de `02_guardarrailes.test.sql`, que por eso acepta las dos formas. La consulta del plan habría reportado `tg_cleanings_log_transition` como función sin `search_path` fijado, siendo que sí lo tiene.

Se ejecutó la consulta con las dos formas aceptadas, igual que el guardarraíl. Resultado: **0**. No se tocó ningún archivo; lo que estaba mal era el snippet del plan, no el código ni el test.

---

**Total deviations:** 2 auto-corregidas, ambas de entorno y sin tocar nada versionado, más 1 corrección de un snippet de verificación del propio plan. Ninguna amplía el alcance.

## Issues Encountered

- **Descubrimiento con consecuencias para `actor_id`: existe `on_auth_user_created`**, un `AFTER INSERT` sobre `auth.users` que materializa la fila de `public.profiles` (creado por la migración 03). Se topó con él al preparar las pruebas manuales, cuando un `insert into public.profiles` explotó con `23505`. Importa porque `cleaning_state_transitions.actor_id` referencia `public.profiles(id)`: si un usuario autenticado pudiera existir sin perfil, `auth.uid()` devolvería un uuid que la FK rechazaría y **el trigger de auditoría tumbaría el cambio de estado legítimo**. Con ese trigger en su sitio, el caso no puede darse. Queda escrito aquí porque es un acoplamiento no evidente: quitar `on_auth_user_created` rompería la máquina de estados.
- **Guardarraíl 1 pasó de listar 18 tablas a 22.** Es el precio declarado de que el modelo de autorización viva en un solo archivo legible (plan 01-07), no una regresión.
- **`db advisors --type security` sigue sin reportar nada** con 22 tablas sin RLS, por la razón medida en `01-RESEARCH.md` §9.2: sin grants para `anon`/`authenticated`, `rls_disabled_in_public` no dispara. *Advisors limpio* no significa *base segura* mientras falte el 01-07.
- **`select into strict` deja un borde con error poco idiomático.** Un `INSERT` en `cleanings` con un `property_id` inexistente falla con `P0002` ("query returned no rows") desde el trigger, no con `23503` desde la FK, porque los `BEFORE` corren antes de que se verifiquen las FK. Es la forma de `ARCHITECTURE.md` y la que el plan pide literalmente, así que se conserva y queda anotada en el propio archivo. Ninguna aserción lo cubre. Si el plan 01-09 quiere que `mapDbError()` dé un mensaje decente para ese caso, tiene que discriminar `P0002` además de `23503`.

## Contrato para los planes siguientes

Solo lo nuevo que introduce este plan. Continúa las tablas de los SUMMARY 01-02 a 01-04.

| Para | Qué | Por qué |
|---|---|---|
| **01-07** | 4 tablas más sin RLS: `cleaning_state_transitions`, `notifications`, `push_subscriptions`, `storage_deletion_queue`. Guardarraíl 1 reporta **22** | Alcance heredado, ya contabilizado |
| **01-07** | **`cleaning_state_transitions` NO debe recibir `INSERT` para `authenticated`.** `select` sí (el admin ve la línea de tiempo del aseo), con policy | Es lo único que sostiene T-01-33. Con `INSERT`, el cliente falsifica su propia auditoría y `tg_cleanings_log_transition()` deja de ser la única fuente |
| **01-07** | **`storage_deletion_queue` no recibe NINGÚN privilegio para `authenticated`.** El guardarraíl 8 la nombra explícitamente junto a `property_secrets` | Un `authenticated` que pueda escribir `deleted_at` deja evidencia en el bucket para siempre sin que nadie lo note |
| **01-07** | **El desbloqueo de `00_rls_aseos.test.sql` es tuyo, y es un solo grant el que abre las 16.** El archivo ya recorre limpieza y fixtures completos; muere en la aserción 1 con `42501` sobre `cleanings` | Medido: línea 111, `permission denied for table cleanings`. Ya no hay nada de schema en el camino |
| **01-07** | Sigue pendiente `alter default privileges … revoke all on tables/sequences from anon, authenticated`. Cuatro migraciones llevan ya el bloque REVOKE repetido | Cada tabla nueva de las Fases 2 a 9 reintroduce el agujero mientras no se haga |
| **01-08** | **Los RPC de mutación ya no eligen el estado destino: la matriz manda.** `start_cleaning` es `pendiente → en_curso`; `finish_cleaning` es `en_curso → completada`; `decline_cleaning` es `en_curso → pendiente`; `cancel_cleaning` es `pendiente|en_curso → cancelada`. Cualquier otro salto da `P0001` | Un `finish_cleaning()` que aceptara un aseo en `pendiente` ya no cuela |
| **01-08** | `decline_cleaning()` debe dejar `confirmado_at` como está al volver a `pendiente`. `cl_pendiente_shape` lo permite y la máquina también | Verificado a mano: caso "no puedo" |
| **01-08** | `cancel_cleaning()` escribe `cancel_reason` **en el mismo `UPDATE`** que cambia el estado a `cancelada` | El trigger `AFTER` lee `new.cancel_reason`. Si el motivo se escribe en un `UPDATE` posterior, la fila de auditoría queda con `reason` NULL |
| **01-08** | `notifications` ya existe con `push_status`, `push_attempts` y `next_attempt_at` con defaults. Un `insert (recipient_id, type, title, body)` basta | `decline_cleaning()` escribe ahí dentro de su transacción |
| **01-08** | **El desbloqueo de `04_storage.test.sql` es tuyo, y empieza por `insert into storage.buckets`.** El archivo ya recorre limpieza, fixtures y el paso a `en_curso`; muere en la línea 97 por FK al bucket `evidencia` | Medido |
| **01-09** | `mapDbError()` debe traducir `errcode = 'P0001'` con `message = 'transicion_invalida'`. El `DETAIL` trae `'origen -> destino'` y el `HINT` un texto ya redactado en español | Es el único `P0001` del schema. No confundirlo con `23514` (forma inválida) ni con `23505` (ASEO-07) |
| **01-09** | Considerar `P0002` además de `23503` para un `property_id` inexistente al crear un aseo | Ver *Issues Encountered* |
| **Fase 5** | El worker de push toma pendientes por `notifications_outbox_idx` (`next_attempt_at where push_status = 'pendiente'`) y revoca por `endpoint`, no por `user_id` | El `endpoint` es único global: revocar por usuario dejaría viva la suscripción de un dispositivo compartido |
| **Fase 9** | El orden es: (1) encolar rutas con `on conflict (bucket, path) do nothing`, (2) borrar el histórico relacional, (3) drenar la cola por Storage API. La cola **no** tiene FK hacia `cleanings` justo para que el paso 2 no se lleve las rutas | Verificado: 0 FK. El orden inverso huerfaniza archivos para siempre |
| **Fase 9** | `legal_hold` y `deleted_at` SÍ se pueden escribir sobre un aseo ya `completada`/`cancelada`; lo único que el trigger reimpone son las dos tarifas | Verificado. Si la congelación fuera un `raise`, la purga no podría marcar nada |

## Known Stubs

Ninguno en el sentido de lógica pendiente. Las 4 tablas están completas y aplicadas.

Tres cosas que **parecen** stubs y no lo son, con el plan que las consume:

- **`notifications`, `push_subscriptions` y `storage_deletion_queue` sin ningún escritor en la Fase 1.** Es el alcance explícito del plan: existen aquí porque `decline_cleaning()` (plan 01-08) escribe en la primera dentro de su transacción, y porque añadir columnas de retención a tablas operativas en vivo es lo que `PITFALLS.md` nº 18 pide evitar. Sus workers son de las Fases 5 y 9.
- **`cleaning_state_transitions.from_state` y `to_state` anulables** aunque hoy la guarda no deje llegar ninguna transición con NULL en un extremo. Es margen deliberado por si algún día se decide registrar la transición inicial; hoy no se registra, y la aserción 10 depende de que siga siendo así.
- **`push_subscriptions.failure_count`, `last_failure_at` y `revoked_reason` sin escritor.** Los escribe el worker de la Fase 5 al recibir 404/410. La tabla nace completa para que ese worker no necesite una migración propia.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: auth-path | `public.cleaning_state_transitions.actor_id` | Superficie que el `<threat_model>` del plan no contempla: la mitigación de T-01-33 depende de una FK a `public.profiles` que solo se sostiene porque el trigger `on_auth_user_created` (migración 03) materializa un perfil por cada usuario. Si esa FK fallara, el `INSERT` del trigger `AFTER` tumbaría el cambio de estado legítimo, es decir, **un fallo del log de auditoría se convierte en una denegación de servicio sobre la operación**. Hoy no puede pasar; queda anotado porque el acoplamiento no es evidente desde ninguno de los dos archivos. El plan 01-09 podría añadir una aserción de que `on_auth_user_created` existe |
| threat_flag: schema-change | `public.notifications.url` | Nueva superficie: `url` es texto libre y la campana de la app la va a renderizar como enlace. Con `authenticated` sin `INSERT` sobre la tabla (que es como queda hoy) no hay vector, pero el día que un RPC de la Fase 5 acepte `url` desde el cliente, un `javascript:` o un dominio externo convierte la campana en phishing dentro de la propia app. La defensa correcta es un `CHECK` de forma (`url like '/%'`, solo rutas relativas) o validación en el RPC. No se añadió aquí porque el plan no lo contempla y `ARCHITECTURE.md` la define como texto libre. Decisión para el plan 01-07 (quién recibe `INSERT`) y para la Fase 5 |

## User Setup Required

Ninguna.

## Next Phase Readiness

- **El cuello de botella de la fase se movió del schema a la autorización.** Los tres archivos que abortaban por tabla ausente ya recorren su limpieza y todos sus fixtures. `00_rls_aseos` está a **un grant** de ejecutar sus 16 aserciones; `04_storage` a **un `insert into storage.buckets`** de ejecutar sus 5. Las dos cosas están medidas con número de línea y errcode, no supuestas.
- **La puerta "sin `Bad plan`" ya es exigible sobre `01_invariantes.test.sql`.** A partir de ahora, un `Bad plan` en ese archivo significa un defecto de mecánica del test, no schema faltante. Sobre `00_rls_aseos` y `04_storage` seguirá sin serlo hasta los planes 01-07 y 01-08 respectivamente.
- El plan 01-07 tiene la lista cerrada: 22 tablas, cuáles no deben recibir `INSERT` y cuáles ningún privilegio, y el grant exacto que desbloquea el archivo de RLS.
- El plan 01-08 tiene la matriz de transiciones como contrato duro de sus 5 RPC, y una advertencia concreta: `cancel_reason` va en el mismo `UPDATE` que el estado o la auditoría pierde el motivo.

---
*Phase: 01-fundaci-n-schema-y-rls*
*Completed: 2026-08-31*

## Self-Check: PASSED

- Los 3 archivos declarados verificados en disco: las migraciones `20260831215108_05_triggers_y_maquina_de_estados.sql` y `20260831215109_06_retencion_y_notificaciones.sql`, y este SUMMARY.
- Los 2 commits de tarea verificados en el log: `da62ca6`, `ce6e7de`.
- `git diff --diff-filter=D --name-only 7a6f3db..HEAD` no devuelve nada: cero borrados desde la base del worktree.
- `STATE.md`, `ROADMAP.md`, `supabase/tests/` y `supabase/seeds/` sin tocar, como exige la ejecución en worktree paralelo.
- Árbol de trabajo limpio salvo este SUMMARY, que se commitea a continuación.
