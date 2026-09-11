---
phase: 05-notificaciones-push-e-instalaci-n-de-la-pwa
plan: 02
subsystem: database
tags: [postgres, pgtap, rls, security-definer, column-grants, web-push, supabase, enum]

requires:
  - phase: 01-fundaciones-de-datos-y-seguridad
    provides: "`push_subscriptions` y `notifications` completas (migración 06), el `grant` de tabla de la 07, la policy `push_subs_own_all` de la 08 y `private.is_admin()`"
  - phase: 04-dashboard-operativo-del-admin
    provides: "El patrón completo de RPC de admin de la migración 15 (`private.is_admin()`, `for update`, 42501 vs P0001 con `hint`, revoke/grant pegado) que este plan repite sin relajar"
  - phase: 05-notificaciones-push-e-instalaci-n-de-la-pwa
    provides: "plan 05-01: `web-push@3.6.7` y el par VAPID cableado. Este plan no lo usa todavía: prepara el sitio donde vivirá la evidencia de que el aviso llegó"
provides:
  - "`public.grado_verificacion_aviso`: el enum de dos valores con su asimetría documentada (`toque` reemplaza a `manual`, al revés nunca)"
  - "Siete columnas aditivas en `push_subscriptions`: `soporta_declarativo`, `verificado_at`, `verificacion_grado`, `verificacion_token`, `verificacion_enviada_at`, `verificacion_intentos`, `visto_at`"
  - "`push_subs_verificacion_shape`: el CHECK que impide una verificación sin grado"
  - "`push_subs_verificacion_token_idx`: único PARCIAL, para que dos suscripciones no compartan token"
  - "El grant de TABLA de la migración 07 convertido en grant POR COLUMNA: las cuatro columnas de evidencia quedan fuera de las listas y solo las mueven funciones definer"
  - "`public.estado_avisos_aseadores()`: la única superficie de D-03, con `returns table` sin `endpoint`, `p256dh` ni `auth`"
  - "`public.registrar_prueba_de_aviso(text)` con el tope de tres contado en la base"
  - "`public.confirmar_prueba_por_toque(uuid)` con token de un solo uso"
  - "`public.confirmar_prueba_a_mano(text)` que NO degrada una confirmación por toque"
  - "`supabase/tests/07_push.test.sql`: 57 aserciones, el contrato ejecutable del schema de avisos"
  - "`lib/database.types.ts` regenerado desde la base viva: las cuatro funciones, las siete columnas y el enum"
affects: [05-03, 05-04, 05-05, 05-06, 05-07, 05-08, 05-drenaje, onboarding-de-aseadores, panel-de-aseadores]

tech-stack:
  added: []
  patterns:
    - "Grant POR COLUMNA como frontera de escritura dentro de una tabla que el usuario sí escribe: `revoke insert, update` de tabla y re-grant solo de lo que el navegador tiene que poder escribir"
    - "La evidencia de un hecho verificado no la escribe quien se beneficia de ella: solo funciones `security definer`"
    - "Un agregado `security definer` en vez de un `grant select` cuando el consumidor necesita el hecho pero no la credencial que lo produce"
    - "Helpers de `pg_temp` que convierten `42883` / `42703` en un VALOR COMPARABLE, para que un archivo pgTAP nazca rojo de forma legible en vez de abortar"

key-files:
  created:
    - supabase/tests/07_push.test.sql
    - supabase/migrations/20260911120000_16_push_avisos.sql
  modified:
    - lib/database.types.ts

key-decisions:
  - "El grado de confirmación vive en `push_subscriptions` y no en `profiles`: es un hecho DEL DISPOSITIVO. La misma aseadora puede tener un teléfono que recibe avisos y otro que no. Con esto, la compuerta de §20.10 del UI-SPEC se cierra y §5.2 y §8.6 NO se reabren"
  - "`revoke insert, update` de tabla y re-grant por columna. Las cuatro columnas de evidencia (`verificado_at`, `verificacion_grado`, `verificacion_token`, `verificacion_intentos`) no son escribibles por `authenticated`, ni admin ni aseador. Sin esto, `Activos` era autocertificado"
  - "`user_id` queda FUERA del `grant update` por columna. El `upsert on conflict (endpoint)` que reasigna `user_id` en un teléfono compartido (T-01-36) ya era inalcanzable desde el cliente: el `using` de `push_subs_own_all` no deja ver la fila ajena. Quitarlo no rompe nada que funcionara, lo hace explícito"
  - "`revoked_at` y `revoked_reason` SÍ quedan escribibles: que alguien marque muerta su propia suscripción no hace daño, y es lo que pasa al revocar el permiso desde Ajustes"
  - "El admin NO recibe `select` sobre `push_subscriptions` y NO se añade policy de admin. D-03 se sirve con `estado_avisos_aseadores()`, cuyo `returns table` no tiene ranura para las tres columnas de credencial (T-05-07)"
  - "`estado_avisos_aseadores()` devuelve también al aseador con CERO suscripciones. Ese cero es el estado `Sin avisos`; omitirlo obligaría a la UI a inventarse la ausencia cruzando dos consultas"
  - "El filtro `revoked_at is null` va en el ON del left join y no en el WHERE: en el WHERE lo convertiría en join interno y desaparecería justo el aseador cuya única suscripción está revocada"
  - "El tope de tres envíos se cuenta en la base con `for update`, no en el navegador: el botón manda un push de verdad y se puede llamar en bucle (T-05-08)"
  - "`confirmar_prueba_por_toque()` con un token ya consumido NO LANZA: el navegador puede reabrir la misma URL, y lanzar convertiría un reintento normal en una pantalla de error"
  - "`pg_catalog.gen_random_uuid()` calificado a propósito: `pgcrypto` está instalada en el esquema `extensions` y exporta el mismo nombre"

patterns-established:
  - "Contrato ejecutable en rojo dentro del MISMO plan que lo pone en verde: Task 1 escribe las 57 aserciones, Task 2 la migración, Task 3 aplica y mide. El rojo esperado se documenta por identificador MEDIDO, no estimado"
  - "Las aserciones de privilegio se escriben una por hecho y nunca agrupadas: agruparlas esconde cuál se rompió el día que alguien simplifique el grant"
  - "Una propiedad de NO EXPOSICIÓN se afirma contra el CATÁLOGO, no leyendo filas: leer filas demuestra que hoy no salió una credencial, leer la firma demuestra que no cabe"
  - "Un archivo pgTAP que nace rojo no invoca nada suelto: toda llamada y toda lectura de algo inexistente pasa por un helper de `pg_temp` con manejador"

requirements-completed: [NOTIF-01, NOTIF-04]

coverage:
  - id: D1
    description: "Un aseador NO puede escribir por su cuenta la evidencia de que la prueba de aviso llegó: las cuatro columnas de evidencia no son escribibles por `authenticated` ni en INSERT ni en UPDATE"
    requirement: NOTIF-01
    verification:
      - kind: integration
        ref: "supabase/tests/07_push.test.sql#14 T-05-13 authenticated NO puede actualizar verificado_at"
        status: pass
      - kind: integration
        ref: "supabase/tests/07_push.test.sql#15 T-05-13 authenticated NO puede actualizar verificacion_grado"
        status: pass
      - kind: integration
        ref: "supabase/tests/07_push.test.sql#16 T-05-14 authenticated NO puede actualizar verificacion_token"
        status: pass
      - kind: integration
        ref: "supabase/tests/07_push.test.sql#17 T-05-08 authenticated NO puede actualizar verificacion_intentos"
        status: pass
      - kind: integration
        ref: "supabase/tests/07_push.test.sql#18-21 las mismas cuatro columnas, con INSERT"
        status: pass
      - kind: integration
        ref: "supabase/tests/07_push.test.sql#12-13 soporta_declarativo SÍ es escribible: el grant no se cerró de más"
        status: pass
    human_judgment: false
  - id: D2
    description: "Una confirmación a mano nunca sobreescribe una confirmación por toque, y los dos grados existen como valores distintos del enum"
    requirement: NOTIF-01
    verification:
      - kind: integration
        ref: "supabase/tests/07_push.test.sql#40 tocar el aviso deja verificacion_grado = toque"
        status: pass
      - kind: integration
        ref: "supabase/tests/07_push.test.sql#45 confirmar a mano deja verificacion_grado = manual"
        status: pass
      - kind: integration
        ref: "supabase/tests/07_push.test.sql#46 confirmar a mano una ya confirmada por toque no lanza y NO la degrada"
        status: pass
      - kind: integration
        ref: "supabase/tests/07_push.test.sql#44 no se puede confirmar a mano un aviso que nunca se envió"
        status: pass
    human_judgment: false
  - id: D3
    description: "El admin sabe quién no tiene avisos activos SIN recibir jamás un endpoint ni una clave de suscripción"
    requirement: NOTIF-01
    verification:
      - kind: integration
        ref: "supabase/tests/07_push.test.sql#54 el returns table de D-03 es exactamente el declarado: sin endpoint, sin p256dh y sin auth (aserción sobre el catálogo)"
        status: pass
      - kind: integration
        ref: "supabase/tests/07_push.test.sql#53 los tres estados salen del agregado: 0a=2/true | 0b=1/false | 0c=0/false"
        status: pass
      - kind: integration
        ref: "supabase/tests/07_push.test.sql#52 una fila por aseador ACTIVO, incluidos los de cero suscripciones"
        status: pass
      - kind: integration
        ref: "supabase/tests/07_push.test.sql#51 un aseador que llama a estado_avisos_aseadores recibe 42501"
        status: pass
      - kind: other
        ref: "grep 'create policy' supabase/migrations/20260911120000_16_push_avisos.sql → 0: no se añadió ninguna policy de admin sobre push_subscriptions"
        status: pass
    human_judgment: false
  - id: D4
    description: "El aviso de prueba tiene tope de tres envíos por suscripción, contado en la base, con token distinto por envío y de un solo uso"
    requirement: NOTIF-01
    verification:
      - kind: integration
        ref: "supabase/tests/07_push.test.sql#28 cada envío de prueba genera un token distinto"
        status: pass
      - kind: integration
        ref: "supabase/tests/07_push.test.sql#29-30 el cuarto envío lanza P0001 con el hint de §8.7 literal y en español"
        status: pass
      - kind: integration
        ref: "supabase/tests/07_push.test.sql#31 no se puede disparar una prueba contra la suscripción de otro (42501)"
        status: pass
      - kind: integration
        ref: "supabase/tests/07_push.test.sql#41-43 el token se consume y la segunda llamada no cambia una sola columna"
        status: pass
    human_judgment: false
  - id: D5
    description: "El panel de alertas de la Fase 4 lee exactamente lo mismo que antes de esta migración"
    verification:
      - kind: integration
        ref: "supabase/tests/07_push.test.sql#55-57 las cinco columnas de outbox, las tres de bandeja y los tres índices de notifications, intactos"
        status: pass
      - kind: other
        ref: "grep -v '^--' supabase/migrations/20260911120000_16_push_avisos.sql | grep -c 'public.notifications' → 0"
        status: pass
      - kind: integration
        ref: "npm run db:test → Files=8 Tests=210 PASS, con 06_aseos_admin.test.sql (41 aserciones del panel) en verde"
        status: pass
    human_judgment: false
  - id: D6
    description: "Las funciones nuevas no son ejecutables por `anon` ni por PUBLIC, y el schema pasa las cuatro puertas de base en cero"
    requirement: NOTIF-04
    verification:
      - kind: integration
        ref: "supabase/tests/07_push.test.sql#26, #34, #38, #49 anon NO ejecuta ninguna de las cuatro funciones nuevas"
        status: pass
      - kind: integration
        ref: "supabase/tests/02_guardarrailes.test.sql#9 ninguna función de public ni private es ejecutable por anon (guardarraíl colectivo)"
        status: pass
      - kind: other
        ref: "npm run db:reset → 0 (16 migraciones); db:lint → 0; db:advisors --fail-on error → 0 issues; db:types:check → sin deriva"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit → 0; npm run ci:arch → 0; npm run lint → 0 errores 2 avisos; npm run test:unit → 574; npm run build → 0, 11 rutas"
        status: pass
    human_judgment: false

duration: 26min
completed: 2026-09-11
status: complete
---

# Phase 5 Plan 02: Migración 16 — el schema de los avisos Summary

**El grado de confirmación del aviso de prueba ya tiene columna donde vivir, el aseador no puede firmarla porque el `grant` de `push_subscriptions` pasó de tabla a columna, y el admin ve quién quedó mudo a través de un agregado `security definer` que no tiene ranura para un endpoint.**

## Performance

- **Duration:** 26 min
- **Started:** 2026-09-11T19:57:00Z
- **Completed:** 2026-09-11T20:23:38Z
- **Tasks:** 3 de 3
- **Files modified:** 3 (2 creados, 1 regenerado)

## Accomplishments

- **Se cerró la compuerta de `05-UI-SPEC.md` §20.10 con la respuesta afirmativa.** El grado de confirmación cabe, y cabe en `push_subscriptions` porque es un hecho del dispositivo y no de la persona. §5.2 y §8.6 quedan implementables tal como están escritas, sin reabrirse.
- **Se cerró un agujero que el UI-SPEC no podía ver.** La migración 07 le dio a `authenticated` un `grant update` de TABLA sobre `push_subscriptions`. Con él, un aseador podía escribir `verificado_at` por su cuenta: el estado `Activos` habría sido autocertificado y la única verificación de la fase, teatro. El grant es ahora POR COLUMNA y la evidencia solo la mueven funciones `security definer`. Ocho aserciones pgTAP, una por hecho, lo sostienen.
- **D-03 se sirve sin entregar una sola credencial de envío.** El admin no recibe `select` sobre la tabla y no se añadió ninguna policy de admin. La superficie entera es `public.estado_avisos_aseadores()`, y la aserción que lo protege consulta el CATÁLOGO: no demuestra que hoy no salió un endpoint, demuestra que no cabe.
- **El contrato ejecutable nació rojo y murió verde dentro del mismo plan.** 57 aserciones escritas antes de la migración, con los identificadores en rojo MEDIDOS (1–21 y 24–54, cincuenta y dos) y documentados en la cabecera del archivo, no estimados.
- **Las cuatro puertas de base en cero y el resto de la línea base intacta.** `Files=8, Tests=210, Result: PASS`, con la suma de los `plan(N)` de los ocho archivos igual a 210.

## Task Commits

1. **Task 1: `07_push.test.sql` en rojo, antes de la migración** — `cdb1fb1` (test)
2. **Task 2: Migración 16 — columnas, enum, grants por columna y las funciones definer** — `868122a` (feat)
3. **Task 3: [BLOCKING] Aplicar el schema, regenerar tipos y cerrar las puertas de base** — `53619b0` (chore)

## Files Created/Modified

- `supabase/tests/07_push.test.sql` — 57 aserciones en ocho grupos (A columnas, B el CHECK, C los privilegios por columna, D aislamiento, F el registro de la prueba, G los dos grados de confirmación, E la superficie de D-03, H la no regresión de `notifications`). Cabecera larga a propósito: explica por qué nace rojo, qué lo pone verde, cómo se lee el rojo y por qué cinco aserciones nacen verdes sin ser vacuidad.
- `supabase/migrations/20260911120000_16_push_avisos.sql` — 469 líneas. El enum, las siete columnas con su `comment on column`, el CHECK, el índice único parcial, el paso de grant de tabla a grant por columna, y las cuatro funciones `security definer` con su par `revoke`/`grant` pegado a cada definición.
- `lib/database.types.ts` — regenerado con `supabase gen types --local` sobre la base con las 16 migraciones aplicadas desde cero. +53 líneas: las cuatro funciones bajo `Functions`, las siete columnas bajo `push_subscriptions` (Row / Insert / Update) y `grado_verificacion_aviso` bajo `Enums`.

## Decisions Made

Las diez del bloque `key-decisions` del frontmatter. Las tres que más condicionan los planes siguientes de la fase:

1. **`user_id` queda fuera del `grant update` por columna.** El comentario de la migración 06 describe un `upsert on conflict (endpoint)` que reasigna `user_id` en un teléfono compartido (T-01-36). Se verificó que ese camino YA era inalcanzable desde el cliente antes de este plan: el `using` de `push_subs_own_all` no deja ver —y por tanto no deja actualizar— la fila que pertenece a otra persona. La reasignación tiene que pasar por una función definer o por el worker. **El plan que implemente el registro de la suscripción desde el navegador tiene que saber esto: `upsert on conflict (endpoint) do update set user_id = …` devolverá `42501`, y la respuesta correcta NO es aflojar el grant.**
2. **`confirmar_prueba_por_toque()` con un token ya consumido no lanza.** El navegador puede reabrir `/instalar?prueba={token}`. La UI del plan 05-08 no tiene que tratar el "sin efecto" como error.
3. **El tope de tres es de la base.** El contador de pantalla de §8.7 sigue existiendo, pero es cortesía. Cuando la UI lo muestre, tiene que leer `verificacion_intentos`, no un estado de React.

## Deviations from Plan

Ninguna desviación de contenido. Tres correcciones de HECHOS del enunciado del plan, todas al alza y ninguna que cambie el alcance:

**1. [Rule 1 - Bug] El plan cuenta mal los archivos pgTAP**
- **Found during:** Task 1
- **Issue:** El plan dice "los seis archivos anteriores siguen en verde" y "los siete archivos pgTAP en verde a la vez". Los archivos anteriores son SIETE (`00` a `06`) y con este pasan a ser OCHO. `pg_prove` imprime `Files=8`.
- **Fix:** No hay nada que arreglar en el código. Se dejó el hecho medido escrito en la cabecera de `07_push.test.sql`, nombrando el desfase del plan para que el próximo lector no lo lea como un archivo perdido.
- **Verification:** `npm run db:test` → `Files=8, Tests=210`.
- **Committed in:** `cdb1fb1`.

**2. [Rule 1 - Bug] El plan dice "las tres funciones definer"; son CUATRO**
- **Found during:** Task 2
- **Issue:** El texto del plan alterna entre "las tres funciones definer" y una enumeración (d)–(g) de cuatro: `estado_avisos_aseadores`, `registrar_prueba_de_aviso`, `confirmar_prueba_por_toque` y `confirmar_prueba_a_mano`.
- **Fix:** Se implementaron las CUATRO, que es lo que la enumeración pide y lo que el contrato de `07_push.test.sql` exige. Los criterios de aceptación piden "3 o más", así que se cumplen con holgura.
- **Verification:** `grep -c "security definer"` → 6 (4 definiciones + 2 menciones en comentarios); cuatro pares `revoke all` / `grant execute` pegados a las definiciones.
- **Committed in:** `868122a`.

**3. [Rule 2 - Missing critical functionality] `pg_catalog.gen_random_uuid()` calificado**
- **Found during:** Task 2
- **Issue:** `pgcrypto` está instalada en el esquema `extensions` y exporta una función con el mismo nombre que la de `pg_catalog`. Con `search_path = ''` solo resuelve `pg_catalog`, pero la regla 2 del patrón de función del repo exige calificar TODO nombre por esquema.
- **Fix:** Se escribe `pg_catalog.gen_random_uuid()` y se explica en el comentario por qué la pregunta existía.
- **Verification:** `npm run db:test` → 57/57 en `07_push.test.sql`, incluida la aserción 28 (tres tokens distintos).
- **Committed in:** `868122a`.

**Total deviations:** 3 (2 correcciones de hechos del enunciado, 1 endurecimiento por regla del repo)
**Impact on plan:** Ninguna cambia el alcance ni afloja una garantía. Las dos primeras son errores aritméticos del enunciado; la tercera hace explícito algo que ya era correcto.

## Issues Encountered

**1. Un archivo pgTAP que nace rojo revienta si se le deja invocar algo suelto.**
El archivo nace con cuatro funciones y siete columnas inexistentes. Una función ausente da `42883` y una columna ausente `42703`, y las dos ABORTAN la transacción: el archivo dejaría de imprimir TAP a mitad y `pg_prove` reportaría menos aserciones de las declaradas, que es la forma de falso verde que la Fase 3 catalogó. Se resolvió metiendo toda invocación y toda lectura de algo que la migración 16 todavía no había creado dentro de helpers de `pg_temp` (`intento_como`, `valor_como`, `sub`, `priv_col`, `existe_funcion`, `es_definer`, `puede_ejecutar`) que devuelven un valor comparable (`<sin funcion>`, `<sin columna>`, `<error:42703>`) en vez de propagar. Resultado medido: `1..57`, 57 aserciones impresas, la última es la 57, y los rojos son exactamente 1–21 y 24–54.

**2. La estimación de rojos del plan habría sido de 54 y son 52.**
Las aserciones 22 y 23 (grupo D, aislamiento) miden la policy `push_subs_own_all` de la migración 08, que este plan no cambia: nacen verdes. No es vacuidad, es el control de no regresión de la Fase 1, y su valor es precisamente que se pongan rojas si alguien "aprovecha" el cambio de grants para tocar la policy. Se documentó en la cabecera con el número MEDIDO, no el estimado.

**3. `npm run db:reset` recrea el stack y hay que respetar la lista de exclusión de la fase.**
El reset se ejecutó sobre el stack ya levantado con `-x studio,logflare,vector,imgproxy,edge-runtime`, sin necesidad de pararlo. `logflare` tumba el resto de contenedores en esta máquina y el nombre de exclusión del CLI es `logflare`, no `analytics`. No hizo falta reiniciar nada.

## User Setup Required

Ninguna. Este plan no toca variables de entorno ni servicios externos. La migración se aplica sola con `npm run db:reset` en local y con el pipeline de migraciones en remoto.

## Next Phase Readiness

**Listo para los planes de UI y de envío de esta misma fase:**

- `lib/database.types.ts` ya tipa las cuatro RPC y las siete columnas, así que los Server Actions y el módulo `lib/domain/avisos.ts` de §1146 del UI-SPEC pueden escribirse contra tipos reales.
- Los tres estados de §5.2 (`Activos`, `Sin probar`, `Sin avisos`) son derivables con una sola llamada a `estado_avisos_aseadores()`; la fila de cero suscripciones viene incluida, así que `estadoDeAvisosDeAseador()` no necesita cruzar con la lista de aseadores.
- El flujo de §8.6 tiene sus tres llamadas: `registrar_prueba_de_aviso` devuelve el token que hay que meter en el aviso, `confirmar_prueba_por_toque` es lo que llama `/instalar?prueba={token}`, y `confirmar_prueba_a_mano` es el botón *ghost*.

**Lo que el siguiente plan tiene que tener presente y no es obvio:**

- El registro de la suscripción desde el navegador **no puede** hacer `upsert on conflict (endpoint) do update set user_id = …`: `user_id` no está en el `grant update` por columna, y aunque lo estuviera la policy no deja ver la fila ajena. El caso del teléfono compartido necesita una función definer que este plan no entrega, o se declara fuera de alcance del MVP.
- El cliente **sí** puede escribir `soporta_declarativo` y `visto_at` en el insert y en el update. Son los dos únicos campos nuevos que puede tocar.
- Ninguna de las cuatro funciones nuevas envía un push. `registrar_prueba_de_aviso` solo RESERVA el envío y devuelve el token; quien llama a `web-push` es el plan del drenaje.

## Threat Flags

Ninguna. La migración no introduce superficie de red, ni ruta de auth, ni acceso a archivos. Los cambios de schema en frontera de confianza son los que el `<threat_model>` del plan ya registra (T-05-06, T-05-07, T-05-08, T-05-13, T-05-14, T-05-15), los seis con disposición `mitigate` y los seis con aserción pgTAP dedicada.

---
*Phase: 05-notificaciones-push-e-instalaci-n-de-la-pwa*
*Completed: 2026-09-11*

## Self-Check: PASSED

- `supabase/tests/07_push.test.sql` — existe
- `supabase/migrations/20260911120000_16_push_avisos.sql` — existe
- `lib/database.types.ts` — existe y contiene `estado_avisos_aseadores`, `soporta_declarativo` y `grado_verificacion_aviso`
- Commits `cdb1fb1`, `868122a`, `53619b0`, `ec7da4a` — presentes en el historial
- `.planning/STATE.md` y `.planning/ROADMAP.md` — sin modificar, como exige el orquestador
