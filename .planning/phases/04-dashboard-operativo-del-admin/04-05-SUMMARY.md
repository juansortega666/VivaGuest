---
phase: 04-dashboard-operativo-del-admin
plan: 05
subsystem: database
tags: [postgres, plpgsql, security-definer, rls, realtime, pgtap, supabase, typescript]

# Dependency graph
requires:
  - phase: 01-fundaci-n-schema-y-rls
    provides: "cleanings, notifications, cleaning_state_transitions, private.is_admin(), tg_cleanings_snapshot(), cleanings_log_transition, los dos indices unicos parciales y el patron RPC de la migracion 09"
  - phase: 03-motor-de-sincronizaci-n-ical
    provides: "sync_feed_apply() y sus tres rutas destructivas ancladas a reservation_id, y la promesa escrita de que needs_review lo apaga solo el admin"
  - phase: 04-dashboard-operativo-del-admin
    provides: "04-01 escribio 06_aseos_admin.test.sql, el contrato ejecutable de las seis RPC, en rojo"
provides:
  - "Migracion 15: reassign_cleaning, create_manual_cleaning, reschedule_cleaning, close_cleaning, cancel_cleaning y clear_review_flag, todas SECURITY DEFINER con guarda de rol por base"
  - "public.cleanings y public.notifications publicadas en supabase_realtime por un bloque idempotente"
  - "lib/database.types.ts con las seis firmas nuevas bajo Functions, generado desde la base viva"
  - "06_aseos_admin.test.sql en verde: 41 aserciones, cero rojas, sin tocar ninguna"
affects: [04-06, 04-07, 04-08, 04-09, 04-13, 05-notificaciones, 06-pwa-del-aseador]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Toda mutacion del admin entra por RPC SECURITY DEFINER con private.is_admin() dentro, nunca por grant de tabla ni por claim del JWT (D-16)"
    - "Reprogramar desancla la reserva: reservation_id = null en la misma sentencia que mueve scheduled_date"
    - "Los slugs de columnas de lista cerrada (cancel_reason, review_reason) son literales dentro del cuerpo, nunca parametros"
    - "Un no-op es un no-op de verdad: no se escribe la fila para no mover updated_at ni emitir un evento de Realtime sin cambio"

key-files:
  created:
    - supabase/migrations/20260903120000_15_rpc_admin_y_realtime.sql
  modified:
    - lib/database.types.ts

key-decisions:
  - "La precondicion de reassign y reschedule es started_at is null y state is distinct from 'cancelada', no una lista de estados: la condicion real es 'no hay trabajo hecho todavia'"
  - "reschedule_cleaning pone reservation_id en null y acepta que el siguiente sync cree un aseo extra en la fecha del checkout real; un aseo de mas lo revisa un humano, uno de menos deja a la aseadora en la calle"
  - "Se descarta origin='manual' como mecanismo de reprogramacion: produciria un solo aseo pero dejaria el dia del checkout real sin nada si el admin se equivoca, y ademas apagaria el recalculo de is_urgent"
  - "close_cleaning usa coalesce(started_at, now()) y no una asignacion directa: cl_completada_shape exige marca de inicio y un aseo en curso conserva la real"
  - "close_cleaning no encola notificacion: avisar 'terminaste' a quien no ejecuto nada es ruido en el panel de alertas"
  - "No se toca la identidad de replica de cleanings ni notifications: solo hace falta para filtrar DELETE y poblar el registro anterior, y el cliente de la fase ignora el payload"

patterns-established:
  - "Guarda de rol primero, guarda de estado despues: 42501 cuando el problema es de permiso, P0001 con hint en espanol cuando el admin si esta autorizado y falla el estado"
  - "El 23505 de cleanings_one_active_per_property_date se deja PROPAGAR: capturarlo borra el nombre del indice y rompe el mensaje de ASEO-07 en la UI"
  - "Publicacion de Realtime idempotente: consultar pg_publication_tables antes de alter publication, y tolerar que la publicacion no exista"

requirements-completed: [ASEO-04, ASEO-05, ASEO-06, ASEO-08, ASEO-09]

# Metrics
duration: 62min
completed: 2026-09-06
---

# Phase 04 Plan 05: Las seis RPC del admin y la publicación de Realtime

**Migración 15 con las seis RPC `SECURITY DEFINER` del admin (reasignar, crear manual, reprogramar, cerrar, cancelar y apagar la marca de revisión) más `cleanings` y `notifications` publicadas en `supabase_realtime`: el archivo `06_aseos_admin.test.sql` pasó de 32 rojos a cero sin que se tocara una sola aserción.**

## Performance

- **Duration:** ~62 min (de los cuales ~35 los consumió el `git reset --hard` del worktree, a ~5 archivos por minuto sobre iCloud Drive)
- **Started:** 2026-09-06T07:53Z
- **Completed:** 2026-09-06T08:55Z
- **Tasks:** 3 de 3
- **Files modified:** 2 (1 creado, 1 regenerado)

## Accomplishments

- **Las seis funciones existen y el contrato de la Wave 0 quedó cerrado.** `06_aseos_admin.test.sql` medía 41 aserciones con 32 rojas (identificadores `1, 3, 5, 7, 9, 11, 13-27, 29-37, 39-40`). Ahora las 41 están verdes. **Ninguna aserción fue modificada**: `git status` no reportó cambios en `supabase/tests/` en ningún momento.
- **La suite pgTAP completa suma exactamente lo previsto: 153 aserciones = 112 previas + 41 de este archivo**, con los siete archivos verdes a la vez.
- **`reschedule_cleaning` desancla la reserva.** Es el mecanismo que impide que `sync_feed_apply()` deshaga la reprogramación treinta minutos después: sin `reservation_id`, el aseo sale de las tres rutas destructivas del reconcile, que sin excepción se anclan a esa columna.
- **`cleanings` y `notifications` están en `supabase_realtime`.** Antes de esta migración, `supabase_realtime` no aparecía en ninguna migración del repo, y el fallo era silencioso: el canal se suscribe, responde `SUBSCRIBED`, y no llega un solo evento nunca.
- **Los tipos salen de la base viva.** `db:types:check` sin deriva, y las seis firmas aparecen bajo `Functions`.

## Task Commits

1. **Task 1: Migración 15, las seis funciones** - `cbad610` (feat)
2. **Task 2: Publicación de Realtime, idempotente** - `6e9727c` (feat)
3. **Task 3: Aplicar el schema, regenerar los tipos y poner el pgTAP en verde** - `e15e53a` (chore)

## Files Created/Modified

- `supabase/migrations/20260903120000_15_rpc_admin_y_realtime.sql` (696 líneas) - Las seis RPC del admin y la publicación de Realtime. Cada función con `security definer set search_path = ''`, guarda `private.is_admin()`, `select ... for update of c`, `comment on function` y su par `revoke`/`grant` pegado a la definición.
- `lib/database.types.ts` (+19 líneas) - Regenerado con `supabase gen types typescript --local`. Añade `cancel_cleaning`, `clear_review_flag`, `close_cleaning`, `create_manual_cleaning`, `reassign_cleaning` y `reschedule_cleaning` bajo `Functions`.

## Verificación medida

| Comando | Resultado |
| --- | --- |
| `npm run db:reset` | Quince migraciones aplicadas sin error |
| `npm run db:test` | `Files=7, Tests=153` — `Result: PASS` |
| `npm run db:types:check` | Sin deriva |
| `npm run db:advisors` | `No issues found` |
| `npm run db:lint` | `No schema errors found` |
| `npx tsc --noEmit` | Sin salida |
| `npm run test:unit` | 27 archivos, 481 tests |
| `npm run test:integration` | 12 archivos, 115 tests |
| `npm run ci:arch` | `check-service-role: OK` |

Conteo de aserciones, como pide el plan:

- `06_aseos_admin.test.sql`: **41** aserciones, 41 verdes.
- Suite completa: **153** = 112 (los seis archivos previos) + 41. La aritmética que el plan exigía cuadra exactamente.

**Consecuencia operativa que hereda el archivo, y hay que conocerla antes de tocar nada: a partir de este plan, un `not ok` en `06_aseos_admin.test.sql` YA NO ES ESPERADO. Es una regresión.** Es el mismo cambio de signo que documentó `05_sync.test.sql` al cerrarse en la Fase 3, y el hábito de "es normal que ese archivo esté rojo" pasa a ser el error.

## Decisions Made

Las decisiones de diseño estaban fijadas por el plan y por el contrato pgTAP; se ejecutaron tal cual. Las tres que conviene tener a mano al leer el archivo:

1. **La precondición de `reassign_cleaning` y `reschedule_cleaning` no enumera estados.** Es `started_at is null and state is distinct from 'cancelada'`. `completada` queda fuera solo por `started_at is null`, porque `cl_completada_shape` lo obliga a tener marca de inicio; `cancelada` hay que excluirlo aparte, porque un aseo cancelado desde `pendiente` conserva `started_at` nulo.
2. **El 23505 se propaga.** Ni `create_manual_cleaning` ni `reschedule_cleaning` capturan el `unique_violation`. Capturarlo borraría el nombre del índice del mensaje y el Server Action del plan 04-08 dejaría de poder interpolar el mensaje de ASEO-07. Las aserciones 20 y 26 exigen el código Y el literal `cleanings_one_active_per_property_date` a la vez.
3. **`clear_review_flag` sobre un aseo ya revisado no escribe.** No es un `update` que no cambia nada: es un `if` alrededor del `update`. `tg_cleanings_snapshot()` mueve `updated_at` ante cualquier escritura, y con Realtime encima eso manda un evento por la red que reordena la pantalla del admin sin que nada haya cambiado. La aserción 35 compara la fila entera.

## Deviations from Plan

Ninguna desviación de contenido: las tres tareas se ejecutaron como estaban escritas y ninguna regla 1-4 se activó sobre el código entregado.

Sí hubo dos intervenciones de infraestructura del worktree, ambas Regla 3 (desbloqueo), sin efecto en el schema ni en el código:

### Auto-fixed Issues

**1. [Rule 3 - Blocking] El worktree nació en un commit anterior al base esperado**
- **Found during:** Arranque, antes de la Task 1
- **Issue:** `git merge-base HEAD 9ba7795` devolvía el propio HEAD (`2a35c53`), es decir el worktree estaba por detrás del base que el orquestador fijó. El primer `git reset --hard` murió por timeout de herramienta a mitad del checkout y dejó un `index.lock` huérfano con el árbol a medio actualizar.
- **Fix:** Verificado con `ps` que ningún proceso de git seguía vivo, se retiró el `index.lock` y se relanzó el `reset --hard` en segundo plano hasta completar los 349 archivos. HEAD quedó en `9ba7795` con el árbol limpio.
- **Files modified:** Ninguno del proyecto.
- **Verification:** `git rev-parse HEAD` = `9ba77957aac73a4b62e2805157b5c8ecb2079249`, `git status --short` sin entradas salvo el archivo nuevo.
- **Committed in:** No aplica (operación de árbol).

**2. [Rule 3 - Blocking] `.env.local` ausente en el worktree**
- **Found during:** Task 3, al correr la verificación extendida
- **Issue:** `npm run test:integration` falla los 12 archivos con `Falta .env.local en la raíz del repo`. No es un fallo de los tests: un worktree trae los archivos versionados y nada más, y `.env.local` está en `.gitignore` porque lleva la clave secreta de Supabase.
- **Fix:** `npm run setup:worktree`, que es el script que el repo tiene exactamente para esto y que copió `.env.local` desde el worktree principal.
- **Files modified:** `.env.local` (ignorado por git, no versionado).
- **Verification:** `npm run test:integration` en verde, 12 archivos y 115 tests.
- **Committed in:** No aplica (archivo ignorado).

---

**Total deviations:** 2 auto-corregidas (2 × Regla 3, ambas de entorno).
**Impact on plan:** Cero. Ninguna tocó el schema, las migraciones ni el código. No hubo scope creep.

## Issues Encountered

- **El worktree vive dentro de iCloud Drive y eso hace que git sea inutilizable a ritmo normal.** El `reset --hard` de 349 archivos avanzó a ~5 archivos por minuto y consumió unos 35 minutos, superando dos veces el timeout de herramienta. Se resolvió lanzándolo en segundo plano. Es el mismo terreno que ya documentó `vivaguest-icloud-rompe-node-modules`. **Recomendación para los planes siguientes de la fase: presupuestar el arranque del worktree como una tarea propia, no como un preámbulo instantáneo.**
- **Antes de comprometer la migración se hizo una pasada en seco contra la base compartida**, aplicándola dentro de `begin; ... rollback;` con `ON_ERROR_STOP=1`. Pasó a la primera y evitó comprometer un archivo que no aplicara. Vale la pena como hábito para cualquier migración larga: cuesta treinta segundos.
- **El stack de Supabase estaba completo y sano** (los 12 contenedores arriba), así que la trampa que documentó `deferred-items.md` (arrancar solo Postgres y que la siembra de integración falle con `name resolution failed`) no se materializó. No hizo falta `npx supabase stop && npx supabase start`.
- **La publicación `supabase_realtime` ya existía en la base local**, creada por el esquema base de la CLI, así que la rama de tolerancia del bloque `do` (la que emite el `raise notice` y sale) no llegó a ejercitarse aquí. Se conserva porque el proyecto hospedado todavía no existe (checkpoint A1 de la Fase 1, abierto) y su estado no se puede medir.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Listo para el resto de la Wave 2 y para toda la UI de la fase:

- **04-06 / 04-08 / 04-09 (Server Actions y diálogos)**: el contrato tipado está en `lib/database.types.ts` y los códigos de error son los que `mapDbError()` espera. `42501` para permiso, `P0001` con `hint` redactado en español para estado, y `23505` crudo con el nombre del índice para el caso de ASEO-07.
- **04-07 (el señuelo de mayor valor de la fase)**: `reschedule_cleaning` ya deja `reservation_id` en null, que es el *mecanismo*. Lo que este plan **no** prueba, y está dicho en la cabecera del propio archivo de tests, es que ese mecanismo **sobreviva a una corrida real de `sync_feed_apply()`**. Esa prueba de comportamiento, con dos corridas encadenadas sobre el mismo feed, es de 04-07 y sigue pendiente.
- **04-13 (Realtime en el navegador)**: las dos tablas están publicadas. El cliente debe seguir ignorando el payload y limitarse a `router.refresh()`, que es lo que hace innecesario tocar la identidad de réplica.
- **Fase 5 (worker de push)**: `reassign_cleaning` escribe su fila `asignacion` en `notifications` con `dedupe_key = 'assign:<aseo>:<aseador>'`. Nadie la drena todavía, y eso es la costura conocida del ROADMAP, no un olvido.

Sin bloqueos abiertos por este plan.

---
*Phase: 04-dashboard-operativo-del-admin*
*Completed: 2026-09-06*
