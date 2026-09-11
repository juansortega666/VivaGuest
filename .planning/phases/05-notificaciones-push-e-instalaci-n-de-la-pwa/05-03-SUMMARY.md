---
phase: 05-notificaciones-push-e-instalaci-n-de-la-pwa
plan: 03
subsystem: database
tags: [postgres, pg_cron, pg_net, trigger, security-definer, vault, pgtap, outbox, web-push]

requires:
  - phase: 03-motor-de-sincronizaci-n-ical
    provides: "La migración 14 entera como template literal: función definer con `search_path` vacío, secretos de Vault con fallo ruidoso, `for update skip locked`, `net.http_post` con argumentos nombrados, par revoke/grant y `cron.schedule` como UPSERT. Y los dos secretos `app_base_url` / `cron_shared_secret`, que este plan REUSA sin crear ninguno"
  - phase: 03-motor-de-sincronizaci-n-ical
    provides: "La migración 11: `pg_cron` en `pg_catalog` y `pg_net` en `extensions`, más el job `purge-cron-history` que ya poda la tabla entera de historial"
  - phase: 01-fundaciones-de-datos-y-seguridad
    provides: "La migración 06: las cuatro columnas de outbox de `notifications` (`push_status`, `push_attempts`, `push_last_error`, `next_attempt_at`), el índice parcial `notifications_outbox_idx` y el único parcial `notifications_dedupe_idx`"
  - phase: 05-notificaciones-push-e-instalaci-n-de-la-pwa
    provides: "plan 05-02: la migración 16, con `push_subscriptions.soporta_declarativo` y los grants por columna. Este plan NO la toca: mide `notifications`, que la 16 dejó intacta"
provides:
  - "`public.dispatch_push_notifications()`: el fan-out del outbox, con ventana de gracia de 90 s, empuje de `next_attempt_at` como lease, `for update skip locked` y `limit 200`. LANZA si faltan los secretos"
  - "`public.tg_notifications_disparar_push()` y el trigger `notifications_disparar_push` sobre `public.notifications`: el disparo INMEDIATO, que NUNCA lanza y NO escribe ninguna columna"
  - "El job `dispatch-push-notifications`, `'* * * * *'`, que sube `cron.job` de tres a CUATRO"
  - "`supabase/tests/08_push_jobs.test.sql`: 19 aserciones, el contrato ejecutable del TRANSPORTE de los avisos"
  - "La propiedad de `pg_net` de la que depende D-04 —encolar dentro de la transacción y revertirse con el rollback— convertida de cita del research en ASERCIÓN MEDIDA en este repo"
  - "El nombre real de la cola de `pg_net` en este stack, descubierto por catálogo y anotado con la consulta: `net.http_request_queue`, unlogged, con `body` en BYTEA"
  - "`docs/despliegue-push.md` con la sección de puesta en marcha del drenaje: los cuatro jobs esperados, el síntoma exacto del secreto descasado y el modo de fallo asimétrico"
affects: [05-06, 05-07, 05-drenaje, 06-reportes-del-aseador]

tech-stack:
  added: []
  patterns:
    - "Asimetría de fallo DELIBERADA entre dos funciones que hacen lo mismo: el trigger degrada a `raise warning` porque corre dentro de una transacción de negocio; el dispatcher lanza porque corre bajo `pg_cron`, donde el fallo es visible. Las dos direcciones con aserción dedicada"
    - "Ventana de gracia en el predicado del recolector como forma de separar un camino principal (el trigger) de su red (el cron), sin columna de estado nueva y sin coordinación entre los dos"
    - "Empujar una columna de backoff YA EXISTENTE hacia adelante como equivalente del lease, cuando la tabla no tiene columna de reclamo y añadirla no compra nada"
    - "Una SECUENCIA como canal para sacar una medición a través de un `rollback to savepoint`: `setval` no se deshace al abortar una subtransacción, y es lo único que permite comparar los tres momentos de una propiedad transaccional"
    - "El disparo de un efecto secundario en un TRIGGER y no en cada emisor, cuando los emisores son seis o más, ninguno se edita y cualquier emisor futuro tiene que quedar cubierto sin que nadie se acuerde"

key-files:
  created:
    - supabase/tests/08_push_jobs.test.sql
    - supabase/migrations/20260911121000_17_push_jobs.sql
  modified:
    - lib/database.types.ts
    - docs/despliegue-push.md

key-decisions:
  - "La ventana de gracia es de 90 segundos y vive en el PREDICADO del dispatcher, no en una columna. Sin ella, una notificación insertada a las 10:00:05 la mandarían el trigger en el acto y el cron a las 10:01:00: dos avisos del mismo hecho dentro del primer minuto"
  - "`push_attempts > 0` es la excepción a la ventana. Una notificación con intentos gastados no es nueva, es un REINTENTO, y ahí quien manda es `next_attempt_at`, que es el backoff que escribió el worker. Esperar 90 s más sobre él retrasaría un reintento ya programado"
  - "El lease es `next_attempt_at = now() + 2 minutes` empujado ANTES del `http_post`, y son DOS minutos y no uno: tiene que ser estrictamente mayor que el intervalo del tick para que el tick siguiente no alcance a la fila que este acaba de despachar"
  - "El trigger NO escribe ninguna columna. Ni `next_attempt_at` ni `push_attempts`. Un `update` sobre la misma tabla desde un trigger de fila es una puerta a recursión, y la ventana de gracia ya separa los dos caminos sin necesitarlo"
  - "`after insert` y no `before`: en `before` la fila todavía puede no llegar a existir y se estaría disparando el aviso de algo que no pasó"
  - "El trigger degrada a `raise warning` en las DOS ramas de fallo (secreto ausente y excepción del `http_post`). El dispatcher lanza. La asimetría es la decisión central del plan y las dos direcciones tienen aserción"
  - "No se añade una segunda poda de `cron.job_run_details`. `purge-cron-history` borra de la tabla ENTERA, no de las filas de un job, así que cubre los jobs nuevos desde el primer tick. Escrito como comentario en la migración y como aserción 15 en el test"
  - "La aserción 17 (`for update skip locked`) es sobre el CUERPO de la función y no sobre su comportamiento, y se dice explícitamente en el archivo. Todo el test vive en una transacción sin commitear: una segunda sesión no vería ni una de sus filas, así que la concurrencia real no es observable desde dentro"
  - "`requiere_resuscripcion` NO necesita columna nueva y NO es de este plan: el plan 05-06 ya lo enruta a `revocarSuscripcion(motivo: 'clave_obsoleta')`, que escribe `revoked_at` + `revoked_reason`. La pregunta que 05-04 y 05-05 dejaron abierta queda cerrada sin tocar schema"

patterns-established:
  - "Un contrato ejecutable cuyo grupo más importante existe para MEDIR una propiedad que el research afirmaba sin evidencia local, con la medición previa (probe) anotada en la cabecera"
  - "Declarar en la cabecera del test lo que ese archivo NO puede medir y por qué, para que nadie añada después una aserción que finja cubrirlo"

requirements-completed: [NOTIF-01, NOTIF-03]

coverage:
  - id: D1
    description: "Confirmar un aseo dispara el aviso en el mismo segundo, sin esperar al siguiente tick del cron"
    requirement: NOTIF-03
    verification:
      - kind: integration
        ref: "supabase/tests/08_push_jobs.test.sql#5 el trigger notifications_disparar_push existe y es el único de public.notifications"
        status: pass
      - kind: integration
        ref: "supabase/tests/08_push_jobs.test.sql#6 es AFTER INSERT, FOR EACH ROW, y solo de INSERT (descompuesto bit a bit de tgtype)"
        status: pass
      - kind: integration
        ref: "supabase/tests/08_push_jobs.test.sql#13 el disparo va a /api/push/drain con el secreto en la CABECERA y solo el notification_id en el cuerpo"
        status: pass
      - kind: other
        ref: "Ningún RPC editado: `git show --stat 7df993e` toca solo la migración nueva y el test. Las migraciones 09, 13, 14 y 15 no aparecen en el diff"
        status: pass
    human_judgment: false
  - id: D2
    description: "Si la transacción de negocio se revierte, el disparo se revierte con ella, y eso está MEDIDO en pgTAP y no supuesto"
    requirement: NOTIF-03
    verification:
      - kind: integration
        ref: "supabase/tests/08_push_jobs.test.sql#12 D-04: pg_net encola dentro de la transacción y el rollback REVIERTE el disparo junto con la notificación (savepoint / rollback to savepoint, tres momentos medidos: 1 · 0 · 0)"
        status: pass
      - kind: other
        ref: "Probe previo del 2026-09-11 contra pg_net 0.20.4: base=0 · dentro=1 · despues=0 · seq_sobrevive=101"
        status: pass
      - kind: other
        ref: "La relación de cola se descubrió por catálogo (pg_class / pg_namespace sobre net y extensions) y la consulta usada está anotada en la cabecera del test: net.http_request_queue, kind=r, persist=u"
        status: pass
    human_judgment: false
  - id: D3
    description: "Con el Vault vacío, insertar una notificación sigue funcionando: la infraestructura de push rota nunca puede tumbar una confirmación de aseo"
    requirement: NOTIF-01
    verification:
      - kind: integration
        ref: "supabase/tests/08_push_jobs.test.sql#9 lives_ok sobre el insert con el Vault VACÍO"
        status: pass
      - kind: integration
        ref: "supabase/tests/08_push_jobs.test.sql#10 el control positivo: la fila SÍ quedó escrita y en estado pendiente"
        status: pass
      - kind: integration
        ref: "supabase/tests/08_push_jobs.test.sql#11 throws_ok sobre el dispatcher: la otra mitad de la asimetría, el fallo ruidoso donde lo ve cron.job_run_details"
        status: pass
      - kind: other
        ref: "Medido en la corrida real de la suite: 05_sync.test.sql y 06_aseos_admin.test.sql imprimen el WARNING del trigger y siguen en verde. El trigger degrada de verdad, no solo en su propio archivo"
        status: pass
    human_judgment: false
  - id: D4
    description: "Ningún RPC de los que ya escriben notificaciones se editó, y cualquier emisor futuro queda cubierto por construcción"
    requirement: NOTIF-03
    verification:
      - kind: other
        ref: "El diff del plan no toca ninguna migración anterior. El disparo vive en un trigger AFTER INSERT sobre la tabla, así que lo dispara cualquier insert venga de donde venga"
        status: pass
      - kind: integration
        ref: "supabase/tests/06_aseos_admin.test.sql sigue en verde con el trigger activo: los RPC del panel insertan notificaciones y el trigger se dispara sin alterarlos"
        status: pass
      - kind: integration
        ref: "supabase/tests/08_push_jobs.test.sql#19 el trigger no altera ninguna columna de la notificación que lo disparó"
        status: pass
    human_judgment: false
  - id: D5
    description: "Lo que el disparo inmediato no logró enviar sale con hasta un minuto de retraso, nunca se pierde"
    requirement: NOTIF-03
    verification:
      - kind: integration
        ref: "supabase/tests/08_push_jobs.test.sql#14 el job dispatch-push-notifications con '* * * * *', activo, y son los CUATRO del sistema"
        status: pass
      - kind: integration
        ref: "supabase/tests/08_push_jobs.test.sql#16 la ventana de gracia: las cinco filas del where en una cadena (recién creada NO, vieja SÍ, reintento SÍ, enviada NO, en backoff NO)"
        status: pass
      - kind: integration
        ref: "supabase/tests/08_push_jobs.test.sql#15 la poda del historial sigue siendo UNA sola y cubre también los jobs nuevos"
        status: pass
      - kind: other
        ref: "select jobname, schedule, active from cron.job → 4 filas, las cuatro activas, dispatch-push-notifications con '* * * * *'"
        status: pass
    human_judgment: false
  - id: D6
    description: "Las funciones nuevas no son ejecutables desde el navegador y el schema pasa las puertas de base en cero"
    requirement: NOTIF-01
    verification:
      - kind: integration
        ref: "supabase/tests/08_push_jobs.test.sql#4 authenticated NO puede ejecutar el dispatcher"
        status: pass
      - kind: integration
        ref: "supabase/tests/08_push_jobs.test.sql#8 authenticated NO puede ejecutar la función del trigger"
        status: pass
      - kind: integration
        ref: "supabase/tests/02_guardarrailes.test.sql#9 ninguna función de public ni private es ejecutable por anon (guardarraíl colectivo, cubre las dos nuevas sin escribir nada)"
        status: pass
      - kind: integration
        ref: "supabase/tests/08_push_jobs.test.sql#2, #3, #7 las dos funciones son SECURITY DEFINER con search_path vacío"
        status: pass
      - kind: other
        ref: "db:reset → 0 (17 migraciones); db:lint → 'No schema errors found'; db:advisors --fail-on error → 'No issues found'; db:types:check → sin deriva; tsc --noEmit → 0"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-09-11
status: complete
---

# Phase 5 Plan 03: Migración 17 — el mensajero Summary

**El aviso sale en el mismo segundo en que se confirma el aseo, sin editar ni uno de los seis RPC que lo emiten; si la confirmación se revierte, el disparo se revierte con ella —y eso ya no es una cita del research, es la aserción 12—; y con el Vault vacío confirmar un aseo sigue funcionando, porque el trigger avisa y el dispatcher es el que grita.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-09-11T20:56:00Z
- **Completed:** 2026-09-11T21:10:57Z
- **Tasks:** 3 de 3
- **Files modified:** 4 (2 creados, 2 modificados)

## Accomplishments

- **La propiedad de la que depende D-04 dejó de ser una cita.** `05-PATTERNS.md` marcaba explícitamente como NO MEDIDA en este repo la afirmación *«`pg_net` despacha después del commit, así que un rollback revierte el disparo»*. Todo el diseño —disparar el push desde dentro de la transacción de negocio sin romper la regla de la migración 15— descansaba en ella. Ahora es la **aserción 12**, con `savepoint` / `rollback to savepoint` y los tres momentos medidos (`1 · 0 · 0`): encoló dentro, se deshizo al revertir, y la notificación se fue con él.
- **El disparo vive en un trigger y no en seis RPC.** Ninguna migración anterior se tocó. `confirm_cleaning`, `finish_cleaning`, `decline_cleaning`, `reassign_cleaning`, el reconcile destructivo y el watchdog siguen exactamente como estaban, y el séptimo emisor que alguien escriba mañana queda cubierto sin que tenga que acordarse de nada.
- **La asimetría de fallo quedó escrita en las dos direcciones y probada en las dos.** El trigger degrada a `raise warning` porque corre dentro de la transacción que confirma un aseo; el dispatcher lanza porque corre bajo `pg_cron`, donde el fallo lo recoge `cron.job_run_details`. Y no es teoría de laboratorio: la corrida real de la suite muestra `05_sync.test.sql` y `06_aseos_admin.test.sql` imprimiendo el WARNING del trigger y siguiendo en verde.
- **La ventana de gracia de 90 segundos resuelve el doble envío sin una sola columna nueva.** El trigger es el camino y el cron es la red. Sin ella, cada notificación se mandaría dos veces dentro del primer minuto. La aserción 16 mide las cinco filas del predicado en una sola cadena, incluida la que está en backoff y la que ya se envió.
- **Las nueve puertas en cero a la vez.** `Files=9, Tests=229, Result: PASS`, con las 19 aserciones nuevas y las 210 anteriores verdes en la misma corrida. `db:lint`, `db:advisors`, `db:types:check`, `tsc`, `ci:arch`, `lint`, `test:unit` (36 archivos / 654 tests) y `build` (11 rutas), todos en la línea base.

## Task Commits

1. **Task 1: `08_push_jobs.test.sql` en rojo, con la aserción del rollback** — `b59b08f` (test)
2. **Task 2: Migración 17 — dispatcher, trigger `AFTER INSERT` y job de un minuto** — `7df993e` (feat)
3. **Task 3: [BLOCKING] Aplicar, cerrar las puertas de base y documentar el despliegue** — `75977a1` (chore)

## Files Created/Modified

- `supabase/tests/08_push_jobs.test.sql` (708 líneas) — 19 aserciones en siete grupos: A el dispatcher cerrado, B el trigger enganchado, E el Vault vacío que no lanza, F el dispatcher que sí, C/D el encolado y su reversión, G el job y la poda única, H la ventana de gracia, I el `skip locked`, J la no regresión. Cabecera larga a propósito: trae la consulta de catálogo que descubrió la cola, la medición del probe, la explicación del truco de la secuencia, la lista de rojos MEDIDA y —lo que más falta hace— **lo que este archivo no puede medir y por qué**.
- `supabase/migrations/20260911121000_17_push_jobs.sql` (447 líneas) — el dispatcher, la función del trigger, el trigger y el job. Copia estructural de la migración 14 en todo lo que se podía copiar, con las dos cosas que no: el lease traducido a `next_attempt_at` y la inversión del modo de fallo en la función del trigger.
- `lib/database.types.ts` — +1 línea: `dispatch_push_notifications: { Args: never; Returns: number }`. `tg_notifications_disparar_push` no aparece y es correcto: devuelve `trigger` y el generador no tipa funciones de trigger.
- `docs/despliegue-push.md` — +110 líneas: la sección «Puesta en marcha del drenaje», con la tabla de las tres piezas, la comprobación de los cuatro jobs, el síntoma exacto del secreto descasado y el modo de fallo asimétrico explicado para quien vaya a «arreglarlo».

## Decisions Made

Las nueve del bloque `key-decisions`. Las tres que más condicionan lo que viene:

1. **El trigger no escribe ninguna columna, y el plan 05-06 tiene que contar con eso.** La notificación recién insertada sale con `push_status = 'pendiente'`, `push_attempts = 0` y `next_attempt_at = created_at`. Quien la reclame —`reclamarNotificacion()`— es el único que mueve esas columnas. El dispatcher del cron empuja `next_attempt_at` antes del `http_post`, pero eso es el lease, no contabilidad de envío.
2. **La idempotencia final NO está en esta migración y no debe estarlo.** La ventana de gracia y el `skip locked` son la primera capa: reducen el solape, no lo eliminan. La última es `reclamarNotificacion()` del plan 05-06, que reclama por ESTADO (`where push_status = 'pendiente'`) y devuelve vacío si otra invocación llegó antes. Si ese filtro desaparece, esta migración no lo compensa.
3. **El worker recibe `{ notification_id }` y nada más.** Es lo que encolan las dos rutas (trigger y dispatcher), y la aserción 13 lo congela junto con el hecho de que el secreto va en la cabecera y NO en el cuerpo.

## Preguntas heredadas que este plan cierra

El prompt de ejecución traía dos preguntas que 05-04 y 05-05 dejaron abiertas a propósito. Las dos se cierran aquí, y ninguna necesita schema nuevo:

**1. `requiere_resuscripcion` no necesita columna, y no es de este plan: es del 05-06.**

05-04 la dejó abierta («no es ni muerte ni éxito») y 05-05 la repitió. La respuesta estaba ya escrita en el plan 05-06, Task 2, y se verificó leyéndolo: la única ruta de revocación del sistema es `revocarSuscripcion(admin, { id, motivo })`, que escribe `revoked_at` + `revoked_reason`, y **el propio plan dice que solo la pueden alcanzar `desactivar_suscripcion` o `requiere_resuscripcion`**. `CodigoDePush` incluye `clave_obsoleta` precisamente para eso.

Así que `requiere_resuscripcion` se materializa como `revoked_at = now()` + `revoked_reason = 'clave_obsoleta'`, que es exactamente la «opción barata» que 05-04 anticipó, con su coste declarado: el aseador tiene que volver a dar permiso. **No hay columna que crear y este plan no la crea.** La razón de que la decisión pertenezca a 05-06 y no aquí es de alcance: la migración 17 no toca `push_subscriptions` ni escribe una sola columna de estado de envío. Es el mensajero, no el contable.

**2. `soportaDeclarativo` ya lo puede responder `push_subscriptions`, desde la migración 16.**

05-05 lo dejó anotado como «es una propiedad de la SUSCRIPCIÓN, no del aviso; `push_subscriptions` tiene que poder responderla». Se verificó contra el catálogo de la base viva, no contra el plan: la columna `soporta_declarativo` **existe** entre las diecinueve de `push_subscriptions`, la creó la migración 16 (plan 05-02) y es una de las dos únicas columnas nuevas que el cliente SÍ puede escribir. El plan 05-06, Task 2, ya la lee en `leerSuscripcionesVivas()` para dársela a `construirPayload()`.

**No hace falta nada de este plan.** Queda anotado aquí porque dos planes seguidos preguntaron lo mismo y la respuesta llevaba un plan entero disponible sin que nadie lo dijera.

## Deviations from Plan

**1. [Rule 1 - Bug] El plan manda copiar una aserción de concurrencia de `05_sync.test.sql` que no existe**

- **Found during:** Task 1
- **Issue:** El punto I del plan dice: *«dos sesiones concurrentes reclaman conjuntos disjuntos. Copiar la forma de la aserción equivalente de `05_sync.test.sql`»*. No hay tal aserción en ese archivo: la 62 mide el LEASE (qué feeds toma el dispatcher según `claimed_at` y `next_sync_at`), no la concurrencia. Y no puede haberla: todo archivo pgTAP de este repo vive dentro de una transacción que termina en `rollback`, así que sus fixtures no están commiteados y una segunda sesión —vía `dblink`, que sí está disponible en este stack— no vería ni una sola de sus filas.
- **Fix:** La aserción 17 afirma `for update skip locked` contra `prosrc`, el CUERPO de la función, y **el archivo dice explícitamente que es una aserción de código y no de comportamiento, y por qué no puede ser otra cosa**. Se anota también en la cabecera que la aserción que el plan cita no existe, para que nadie la busque.
- **Verification:** `08_push_jobs.test.sql#17` en verde; el párrafo «QUÉ NO SE PUEDE MEDIR AQUÍ» en la cabecera.
- **Committed in:** `b59b08f`.

**2. [Rule 1 - Bug] `proconfig` guarda `search_path=""`, no `search_path=`**

- **Found during:** Task 3 (al aplicar la migración: las aserciones 3 y 7 salieron rojas con la migración ya correcta)
- **Issue:** Las dos aserciones comparaban contra el literal `search_path=`. Medido en este stack (PG 17.6): el valor almacenado es `search_path=""`, con comillas. Las funciones eran correctas; la expectativa del test, no.
- **Fix:** Las dos aserciones aceptan ahora los **mismos dos literales** que acepta el guardarraíl 6 de `02_guardarrailes.test.sql` (`search_path=` para versiones viejas, `search_path=""` para PG 17), normalizándolos a `vacio`. Un `search_path=public` sigue siendo rojo, que es lo que la aserción existe para atrapar.
- **Verification:** `npm run db:test` → `Files=9, Tests=229, Result: PASS`.
- **Committed in:** `7df993e`.

**3. [Rule 2 - Missing critical functionality] `drop trigger if exists` antes del `create trigger`**

- **Found during:** Task 2
- **Issue:** `create or replace function` es idempotente y `cron.schedule` es UPSERT por `jobname`, así que el resto de la migración se puede reaplicar sin daño. `create trigger` a secas, no: falla con `42710 duplicate_object`. La migración habría sido idempotente en dos de tres piezas, que es la peor combinación posible porque el fallo aparece a mitad.
- **Fix:** `drop trigger if exists notifications_disparar_push on public.notifications;` inmediatamente antes del `create trigger`.
- **Verification:** `npm run db:reset` aplica las 17 en cero.
- **Committed in:** `7df993e`.

**4. [Rule 1 - Bug] El criterio de aceptación prohíbe una cadena que el propio comentario del plan invitaba a escribir**

- **Found during:** Task 2
- **Issue:** El criterio dice: *«El archivo no contiene la cadena `vault.create_secret`»*. El primer borrador la contenía **en un comentario**, en la frase que explicaba que el archivo no crea secretos. El `grep` no distingue comentario de código y el criterio habría salido rojo por decir la verdad.
- **Fix:** La frase se reescribió sin nombrar la función: *«este archivo no contiene ni una sola sentencia que CREE un secreto. Ni el nombre de esa función aparece escrito aquí, para que un `grep` pueda afirmarlo entero.»*
- **Verification:** `grep -c 'vault.create_secret' supabase/migrations/20260911121000_17_push_jobs.sql` → `0`.
- **Committed in:** `7df993e`.

**Total deviations:** 4 (2 correcciones de hechos del enunciado, 1 corrección de expectativa del test, 1 endurecimiento de idempotencia)
**Impact on plan:** Ninguna cambia el alcance ni afloja una garantía. La #1 es la única que reduce lo prometido, y lo hace diciendo en voz alta que la promesa original no era medible desde donde el plan la puso.

## Issues Encountered

**1. La medición «dentro del savepoint» no sobrevive al rollback, y ese era el problema entero del grupo D.**

La aserción de D-04 necesita comparar tres números: la cola antes, dentro de una subtransacción y después de revertirla. El segundo es el que da valor a la aserción —sin él, «la cola volvió a la línea base» lo cumple en verde un trigger que no hace absolutamente nada—, y es justo el que se pierde: una tabla temporal escrita dentro de la subtransacción se revierte con ella.

La salida es una **secuencia**: `setval` no se deshace cuando una (sub)transacción aborta. Se crea antes del savepoint, se escribe dentro (con `count + 1`, porque una secuencia no admite el valor 0) y se lee después. Medido en el probe previo: `base=0 · dentro=1 · despues=0 · seq_sobrevive=101`.

Como efecto colateral sano, **ninguna aserción pgTAP se emite dentro del savepoint**: las dos se emiten fuera, con los tres números ya en la mano, y así no hay que averiguar qué le pasa a la numeración de `pg_prove` cuando una subtransacción aborta.

**2. `net.http_request_queue.body` es `bytea`, no `jsonb`.**

Se descubrió al leer las columnas por catálogo, antes de escribir la aserción 13. Escrito como `body::jsonb` el archivo no habría dado `not ok`: habría reventado con un error de cast, abortando la transacción y llevándose por delante las seis aserciones siguientes. La forma correcta es `convert_from(body, 'utf8')::jsonb`, y queda anotada en la cabecera.

**3. Contar la cola entera habría dado un rojo intermitente.**

El worker de `pg_net` borra filas de `net.http_request_queue` según las procesa, y esas filas son de otras sesiones. Un `count(*)` desnudo mediría una población que se mueve sola entre dos sentencias bajo `read committed`. El helper `pg_temp.encoladas()` filtra por la URL del drenaje, que en este archivo solo puede venir del fixture de Vault (`http://ejemplo.invalido`).

**4. El WARNING del trigger aparece ahora en la salida de otros dos archivos pgTAP.**

`05_sync.test.sql` y `06_aseos_admin.test.sql` insertan notificaciones y, con el trigger activo y el Vault vacío, imprimen el `WARNING: push: no se pudo disparar el drenaje…`. **Es la señal de que el diseño funciona, no ruido a silenciar**: son dos archivos que ejercen los RPC de negocio reales, con la infraestructura de push ausente, y siguen en verde. Si algún día alguien «limpia» esa salida convirtiendo el warning en silencio, se pierde la única traza local del trigger degradando.

## User Setup Required

**Ninguna en local.** Los dos secretos que el drenaje necesita ya existen desde la Fase 3 y esta migración no crea ninguno.

**En un proyecto Supabase nuevo**, sí hay un orden que respetar y está documentado en `docs/despliegue-push.md` §«Puesta en marcha del drenaje»: correr el paso operativo de Vault de `docs/despliegue-sync.md` **antes** de que el dispatcher tenga su primer tick. Si no, cada tick del minuto deja `status = 'failed'` en `cron.job_run_details` desde el momento en que la migración se aplica.

## Next Phase Readiness

**Listo para el plan 05-06 (el worker `/api/push/drain`):**

- El endpoint ya tiene quien lo llame, por dos rutas, con el cuerpo exacto que su Zod espera (`{ notification_id: z.uuid() }`) y la cabecera `x-cron-secret` que su guard exige.
- El contrato del reclamo está fijado por el otro lado: la notificación llega en `push_status = 'pendiente'` con `push_attempts = 0` si viene del trigger, o con `next_attempt_at` ya empujada dos minutos si viene del cron.

**Lo que el plan 05-06 tiene que tener presente y no es obvio:**

- **El filtro `.eq('push_status','pendiente')` de `reclamarNotificacion()` es la última capa de idempotencia del sistema, no una optimización.** La ventana de gracia de 90 s y el `skip locked` de esta migración reducen el solape entre trigger y cron; no lo eliminan. El señuelo que el plan 05-06 ya pide sobre ese filtro es, por tanto, obligatorio.
- El dispatcher despacha **hasta 200 notificaciones por tick, una invocación HTTP cada una**. El worker tiene que poder recibir 200 peticiones concurrentes en el peor caso, no una con 200 elementos.
- `requiere_resuscripcion` se materializa como `revoked_at` + `revoked_reason = 'clave_obsoleta'`. No hay columna nueva y este plan no la añadió: ver la sección «Preguntas heredadas».
- `soporta_declarativo` ya existe en `push_subscriptions` desde la migración 16. `leerSuscripcionesVivas()` puede leerla sin cambios de schema.

## Threat Flags

Ninguna nueva fuera del `<threat_model>` del plan. La superficie de red que este plan introduce (Postgres → `POST /api/push/drain`) es la registrada como T-05-19, con disposición `accept` y la misma justificación que en la Fase 3: el destino es una cadena bajo control del operador (`app_base_url`) y quien puede escribir en Vault ya es administrador de la base.

Los otros cuatro registros del `<threat_model>` quedan mitigados y con aserción:

| Threat | Mitigación | Aserción |
|---|---|---|
| T-05-16 (secreto en `cron.job.command`) | el secreto sale de `vault.decrypted_secrets` dentro de la función; la migración no crea ninguno | `grep -c 'vault.create_secret'` → 0 |
| T-05-17 (el trigger tumbando una transacción de negocio) | `raise warning` + `return null` en las dos ramas de fallo | #9, #10 |
| T-05-06 (dos definer con Vault y HTTP saliente) | `revoke all from public, anon, authenticated` pegado a cada definición | #4, #8, guardarraíl 9 |
| T-05-18 (doble envío por solape trigger/cron) | ventana de gracia de 90 s, `skip locked`, empuje de `next_attempt_at` | #16, #17 |

---
*Phase: 05-notificaciones-push-e-instalaci-n-de-la-pwa*
*Completed: 2026-09-11*
