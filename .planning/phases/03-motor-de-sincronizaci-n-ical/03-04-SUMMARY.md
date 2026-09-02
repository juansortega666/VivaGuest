---
phase: 03-motor-de-sincronizaci-n-ical
plan: 04
subsystem: database
tags: [ical, rpc, diff, transaccion, idempotencia, urgencia, privilegios, pgtap]

requires:
  - phase: 01-fundaciones-de-datos-y-seguridad
    provides: "tg_cleanings_snapshot(), los dos indices unicos parciales de cleanings, cl_unmanaged_is_inert, today_bog() y el patron de revoke/grant al lado de la definicion de la migracion 09"
  - phase: 03-motor-de-sincronizaci-n-ical
    plan: 02
    provides: "EventoNormalizado: la forma exacta de p_events, con startsOn/endsOn nulables y sin ranura para la descripcion"
  - phase: 03-motor-de-sincronizaci-n-ical
    plan: 03
    provides: "migracion 11: feed_sync_runs, last_min_ends_on, ends_on_anterior, cal_res_sin_descripcion y cal_res_feed_code_idx"
provides:
  - "public.sync_feed_apply(uuid, jsonb, timestamptz, text, text, int): la mitad ADITIVA del diff en una sola transaccion, pasos (a) a (d), (f) e (i)"
  - "la jerarquia de identidad de dos niveles implementada, con uid_rotations contando el nivel 1"
  - "idempotencia estructural: on conflict do nothing sobre los dos indices unicos parciales, no un if exists"
  - "la salud del feed y la fila de la corrida escritas DENTRO de la transaccion del diff"
  - "05_sync.test.sql ampliado a 26 aserciones; las doce nuevas (15-26) verdes"
  - "lib/database.types.ts con sync_feed_apply en Functions y p_http_status opcional"
affects: [03-05, 03-06, 03-07, 03-08, 03-09, 03-10]

tech-stack:
  added: []
  patterns:
    - "Un solo RPC transaccional en vez de varios upserts desde supabase-js: la atomicidad no se puede pedir prestada al cliente"
    - "Anomalia de UNA fila capturada con exception when ... y contada como desconocida, nunca abortando la corrida entera"
    - "Toda asercion de fechas compara el ARREGLO completo, nunca un conteo: un conteo pasa igual con las fechas corridas un dia"
    - "Senuelo medido contando cuantas aserciones caen y CUALES, no solo que caiga alguna"
    - "psql para TAP siempre con -A -t: sin ellas grep '^not ok' devuelve cero con el archivo entero en rojo"

key-files:
  created:
    - supabase/migrations/20260902221500_12_sync_rpc.sql
    - .planning/phases/03-motor-de-sincronizaci-n-ical/03-04-SUMMARY.md
  modified:
    - supabase/tests/05_sync.test.sql
    - lib/database.types.ts

key-decisions:
  - "La firma lleva un SEXTO parametro, p_http_status int default 200: el plan pide escribir last_http_status y http_status y su firma de cinco no trae el dato. Con default, la llamada de cinco argumentos del plan sigue siendo valida"
  - "Un evento con clasificacion 'reserva' pero fechas malformadas, ends_on <= starts_on o payloadHash nulo se cuenta como DESCONOCIDO y no aborta la corrida: sin esa red, una anomalia de una fila tumba el diff de las otras catorce por 22007 o 23514"
  - "El paso (c) y el (d) usan distinct on (ends_on): dos reservas vivas del mismo feed que terminan el mismo dia chocarian dentro de la MISMA sentencia, y elegir una de forma determinista deja el resultado estable entre corridas"
  - "El paso (f) busca la reserva entrante por property_id y no por feed_id: con varios proveedores por apartamento, el checkin que hace urgente el aseo puede venir de otro feed"
  - "La migracion NO va a un archivo llamado 12_sync_rpc.sql sino a 20260902221500_12_sync_rpc.sql: el repo lleva prefijo de marca de tiempo desde la migracion 01 y sin el la CLI no la ordena"

requirements-completed: [SYNC-02, SYNC-05, SYNC-07, SYNC-11]

duration: 55min
completed: 2026-09-02
---

# Fase 3 Plan 04: `sync_feed_apply()`, la mitad aditiva del diff — Resumen

**El feed real de Airbnb, pasado por el normalizador del plan 03-02 y entregado al RPC, produce quince aseos en las quince fechas de checkout exactas; correrlo tres veces sigue dejando quince y cero canceladas; el turnover del 2026-10-10 es el único aseo urgente; las unidades de gestión externa producen filas inertes sin reventar ningún CHECK; y nada de eso puede quedar a medias, porque todo ocurre en una transacción.**

## Performance

- **Duración:** 55 min
- **Tareas:** 3 de 3
- **Archivos creados:** 1 (más este resumen)
- **Archivos modificados:** 2

## Commits por tarea

| Tarea | Commit | Mensaje |
|---|---|---|
| 1 — pasos (a) a (d) | `fa0eb3f` | `feat(03-04)`: `sync_feed_apply()`, pasos (a) a (d) del diff aditivo |
| 2 — pasos (f) e (i) | `951d2a2` | `feat(03-04)`: urgencia recalculada y salud del feed en la misma transacción |
| 3 — pgTAP y tipos | `c8235a8` | `test(03-04)`: doce aserciones del RPC aditivo y regeneración de tipos |

Las tareas 1 y 2 tocan el mismo archivo. Se commitearon como dos incrementos reales
—la versión de la tarea 1 se aplicó a la base y se midió antes de escribir la 2—,
no como un solo commit partido a posteriori.

## El resultado que importa: las aserciones, POR IDENTIFICADOR

Medido con `pg_prove`, que es lo que corre `supabase test db`:

```
supabase/tests/05_sync.test.sql   (Wstat: 0 Tests: 26 Failed: 6)
  Failed tests:  4-9
Files=6, Tests=73
```

### Las doce nuevas, todas VERDES

| ID | Aserción | Qué falla si se rompe |
|---|---|---|
| 15 | El aseo cae en el `DTEND` exacto, sin restar un día | la aseadora llega con el huésped dentro |
| 16 | Tres corridas dejan **dos** aseos y **dos** reservas, no seis y seis | aseos duplicados en cada vuelta del cron |
| 17 | Un bloqueo del propietario no crea aseo, y no perturba a los de reserva | aseos fantasma (Pitfall 3) |
| 18 | Un evento desconocido no crea aseo: la falla es cerrada | aseo generado a partir de un formato que nadie entendió |
| 19 | SYNC-11: la fila de gestión externa nace inerte (sin estado, aseador ni tarifas) | una unidad informativa entra en la operación y en las métricas |
| 20 | El recálculo de urgencia sobre gestión externa **no** viola `cl_unmanaged_is_inert` | `23514` en la primera corrida real |
| 21 | SYNC-07: checkout y checkin el mismo día marcan urgente **ese** aseo y solo ese | el turnover no se prioriza |
| 22 | La urgencia **se apaga sola** si la reserva entrante se mueve | urgencia pegajosa para siempre |
| 23 | El aseo `manual` no se duplica ni se modifica | el sync destruye trabajo humano |
| 24 | SYNC-04: la primera ausencia marca `disappeared_at` y **no cancela nada** | una lectura mala cancela los aseos |
| 25 | Código conocido con `uid` nuevo actualiza la fila y deja `uid_rotations = 1` | la pregunta abierta de la fase queda sin instrumento |
| 26 | Ni `anon` ni `authenticated` pueden ejecutarlo; `service_role` sí | escalada de privilegio con la clave publicable |

### Las que siguen en rojo, y por qué. **Son las MISMAS seis de antes: 4 5 6 7 8 9**

| ID | Aserción | Motivo |
|---|---|---|
| 4 | job `dispatch-feed-syncs` activo | migración 13 |
| 5 | job `purge-cron-history` activo | migración 13 |
| 6 | job `feed-health-watchdog` activo | migración 14 |
| 7 | las **tres** funciones del motor existen | faltan `dispatch_feed_syncs` y `feed_health_watchdog` |
| 8 | las **tres** son `security definer` con `search_path` vacío | ídem |
| 9 | ninguna de las **tres** es ejecutable por `anon` | ídem |

### El hallazgo que un conteo habría ocultado: este plan NO pone ninguna en verde, y eso es lo correcto

El criterio del plan dice "de las catorce originales quedan en rojo **solo** las que
dependen de las migraciones 13 y 14". Cumplido. Pero la lectura ingenua —"crear
`sync_feed_apply` debería poner algo en verde"— es **falsa**, y hay que decirlo
porque invita a un falso rojo y a un falso verde a la vez:

- Las aserciones **7, 8 y 9 son COLECTIVAS** sobre las tres funciones del motor.
  Crear una sola de las tres no puede ponerlas verdes.
- La evidencia de que este plan hizo su parte de esas tres **no está en el total**,
  está en el diagnóstico: `sync_feed_apply` **desapareció** de las tres listas de
  `Unexpected records`, que ahora nombran únicamente a `dispatch_feed_syncs` y
  `feed_health_watchdog`.

```
# Failed test 7: "las tres funciones del motor de sync existen en public"
#     Unexpected records:
#         (dispatch_feed_syncs)
#         (feed_health_watchdog)
```

Contar `not ok` habría dicho **"6 antes y 6 después, no pasó nada"**. Es exactamente
el modo de fallo que la regla vinculante del plan 03-01 existe para impedir, y esta
vez se manifestó en la dirección contraria a la del plan 03-03: allí el total estaba
mal calculado, aquí el total es correcto pero **no dice nada**. Queda escrito en la
cabecera de `05_sync.test.sql`, no solo aquí.

### Los otros cuatro archivos pgTAP, por archivo

| Archivo | plan | ok | not ok |
|---|---|---|---|
| `00_rls_aseos` | 1..16 | 16 | 0 |
| `01_invariantes` | 1..11 | 11 | 0 |
| `02_guardarrailes` | 1..10 | 10 | 0 |
| `03_seed` | 1..5 | 5 | 0 |
| `04_storage` | 1..5 | 5 | 0 |
| **suma** | | **47** | **0** |

Sin mover ninguno. Corrida completa: `Files=6, Tests=73` (61 previos + 12 nuevos).

## Los dos señuelos obligatorios, medidos

### Señuelo 1 — quitar `and c.is_managed` del recálculo de urgencia

Aplicado al código real, aplicado a la base, medido y revertido.

```
not ok 20 - SYNC-07 el recálculo de is_urgent sobre una unidad de gestión externa
            no viola cl_unmanaged_is_inert (and c.is_managed)
#     died: 23514: new row for relation "cleanings" violates check constraint
#           "cl_unmanaged_is_inert"
#         CONSTRAINT: cl_unmanaged_is_inert
```

- **Código de error exacto: `23514`.** Restricción: `cl_unmanaged_is_inert`.
- **Cae UNA sola aserción, la 20.** Ninguna otra se mueve, lo cual es la propiedad
  que se quería: el filtro tiene su propia red y no depende de que otra la tape.
- Por qué la 19 (la fila inerte) **no** cae: su corrida no trae turnover, así que
  la urgencia se evalúa a falsa y el `CHECK` se satisface. Las dos corridas del
  apartamento externo están deliberadamente separadas para que las dos aserciones
  sean independientes; si compartieran corrida, el señuelo pondría dos en rojo y
  no se sabría cuál mide qué.

Sin la aserción 20 el filtro parece decorativo y el primer plan que "limpie" el
`where` lo borra. Con ella, borrarlo cuesta un rojo inmediato con el código de error
que dice exactamente qué pasó.

### Señuelo 2 — restarle un día al `scheduled_date` del paso (c)

```
not ok 15 - SYNC-02 el RPC crea un aseo por reserva, con scheduled_date = ends_on
            y sin restar un día
#         have: {2026-09-07,2026-09-14}
#         want: {2026-09-08,2026-09-15}
```

**El plan esperaba que cayera la aserción 1 (la 15 en la numeración del archivo).
Cayeron SEIS: 15, 17, 18, 21, 22 y 23.** No es ruido, son seis redes independientes:

| ID | Por qué también cae |
|---|---|
| 15 | las dos fechas corridas un día |
| 17, 18 | comparan contra el mismo arreglo de fechas de la 15 |
| 21, 22 | el turnover deja de coincidir: `ends_on - 1` ya no es el `starts_on` de la entrante |
| 23 | el aseo iCal cae en `+5` y ya no choca con el manual de `+6`: pasa a haber **dos** aseos donde debía haber uno |

**Y la 16 se queda VERDE.** Es el dato más útil del señuelo: la aserción de
idempotencia cuenta `2` aseos, y con el off-by-one siguen siendo `2`. Un archivo de
pruebas escrito solo con conteos habría dejado pasar el defecto más caro del dominio.
Es la razón concreta de que las aserciones 15, 17 y 18 comparen el **arreglo de
fechas** y no un número.

## Los ataques que el plan no pedía

### A1 — El criterio de éxito de la FASE, de punta a punta con el feed real

No es una fixture sintética: es `airbnb-real-anonimizado.ics` pasado por
`normalizarIcs()` del plan 03-02 y entregado tal cual al RPC.

| Medición | Resultado |
|---|---|
| `event_count` / `reservation_count` / `block_count` / `unknown_count` | **15 / 15 / 0 / 0** |
| Aseos creados en la primera corrida | **15** |
| Fechas | `2026-09-02, 09-06, 09-13, 09-20, 09-27, 10-06, 10-10, 10-12, 10-18, 11-02, 11-09, 11-16, 11-22, 12-27, 2027-01-04` — **las quince exactas** |
| Aseos urgentes | **`{2026-10-10}` y solo ese** — el turnover que el research predijo |
| Tras tres corridas | **15 aseos, 0 canceladas** |
| `last_event_count` | **15** (reservas) |
| `min_ends_on` | **2026-09-02** (el día de hoy: el primer punto de la serie que contesta la pregunta abierta) |
| Reservas con descripción cruda persistida | **0** de 15 |

### A2 — Atomicidad, provocada a propósito

Se llamó al RPC con un `feed_id` inexistente después de una corrida buena:

- **Lanza `P0002`** (`query returned no rows`), por el `into strict` de la primera
  línea.
- **No queda nada escrito**, ni siquiera la fila de la corrida: el conteo de
  `feed_sync_runs` no se movió.

Es el tercer escenario de la tabla de fallo parcial del research, y el que hace que
diga "nada que hacer".

### A3 — La escritura de salud, campo por campo

`last_http_status = 200`, `last_etag` y `last_payload_hash` los de la última corrida,
`last_error = null`, `consecutive_failures = 0`, `claimed_at = null`,
`next_sync_at > now() + 25 min`, `last_success_at = last_attempt_at`.

**`last_event_count` medido a `2` en una corrida de `3` eventos** (dos reservas y un
bloqueo). Es la costura del plan 02-14 y la única forma de comprobar que no se
redefinió es que los dos números difieran en la misma corrida: con un payload sin
bloqueos, `event_count` y `reservation_count` coinciden y el error sería invisible.

### A4 — Privilegios, con control positivo

`prosecdef = t`, `proconfig = {search_path=""}`,
`has_function_privilege('anon') = f`, `('authenticated') = f`,
`('service_role') = t`.

El control positivo importa tanto como los dos negativos: revocar de más dejaría los
dos primeros en `f` igual, pondría en verde una aserción escrita solo como ausencia,
y rompería el worker del plan 03-06 con permiso denegado. La aserción 26 los mide los
tres juntos.

### A5 — Los siete grep de la lista de aceptación

| Comprobación | Resultado |
|---|---|
| función de fecha de sesión prohibida (código **y** comentarios) | **0 ocurrencias** |
| `delete from` de cualquier tipo | **0 ocurrencias** |
| `state <>` / `state !=` | **0 ocurrencias** |
| `raw_description` | **1 ocurrencia, y es una línea de comentario** que explica por qué NO se escribe. Misma situación que la migración 11, que la nombra por obligación para declarar el CHECK. Ninguna escritura |
| columnas del `insert` de aseos | `(property_id, reservation_id, origin, tipo, scheduled_date)` — **cinco, ninguna del trigger** |
| `and c.is_managed` en el recálculo | presente, línea 447 |
| `and c.origin = 'ical'` en (d) y (f) | presente en las dos |

## Decisiones tomadas

### 1. Un sexto parámetro, `p_http_status int default 200`

El plan fija la firma en cinco parámetros y a la vez pide escribir
`calendar_feeds.last_http_status` y `feed_sync_runs.http_status`. **Ninguno de los
cinco trae ese dato.** Con la firma literal, las dos columnas quedarían nulas para
siempre y el diagnóstico del admin de la Fase 4 no distinguiría un `200` limpio de un
`200` con cuerpo raro.

Se añade con `default 200`, así que **la llamada de cinco argumentos que el plan
describe sigue siendo válida**: la firma del plan es un subconjunto invocable de esta,
no un contrato roto. `lib/database.types.ts` lo confirma del lado de TypeScript:
`p_http_status?: number`.

### 2. Un evento malformado se cuenta como desconocido, no aborta la corrida

El plan pide capturar `unique_violation` en el `update` del `uid`. Falta la misma
protección para dos casos que el `CHECK` y el `NOT NULL` del schema convertirían en
un aborto de la corrida entera:

- una fecha que no castea a `date` → `22007`, y el error ocurre **dentro del bucle**,
  donde una excepción no capturada se lleva las otras catorce reservas por delante;
- `ends_on <= starts_on` → `23514` sobre `res_dates_ok`;
- `payloadHash` nulo → `23502` sobre el `NOT NULL`.

Los tres se validan antes de escribir y el evento cae a `unknown_count`. Es la misma
regla que el plan ya establece para la anomalía de `uid`: **no se aborta la corrida
entera por una anomalía de una fila.** El normalizador del plan 03-02 hace que ninguno
de los tres deba ocurrir; esto es la segunda red, y las dos son necesarias porque el
RPC también es invocable por cualquier futuro llamador con `service_role`.

### 3. `distinct on (ends_on)` en los pasos (c) y (d)

Dos reservas vivas del mismo feed que terminen el mismo día chocarían **dentro de la
misma sentencia** contra `cleanings_one_active_per_property_date`. Elegir una de forma
determinista (`order by ends_on, first_seen_at, id`) deja el resultado estable entre
corridas y saca del camino una duda de comportamiento de `on conflict do nothing`
frente a conflictos intra-sentencia. La segunda reserva de ese día no se pierde: queda
viva en `calendar_reservations`, y decidir qué hacer con ella es del plan 03-05, donde
esa colisión se puede razonar y marcar.

### 4. El paso (f) busca la reserva entrante por `property_id`, no por `feed_id`

El research lo escribe así y la razón merece quedar dicha: `calendar_feeds` modela
varios proveedores por apartamento (`is_authoritative` existe desde la migración 04).
El checkin que hace urgente un aseo puede venir del feed de Booking mientras el
checkout viene del de Airbnb. Filtrar por `feed_id` haría que el turnover
entre proveedores no se detectara nunca.

### 5. La migración lleva prefijo de marca de tiempo

El plan la nombra `supabase/migrations/12_sync_rpc.sql`. El repo lleva prefijo de
marca de tiempo desde la migración 01 y la CLI ordena por nombre de archivo: sin él,
`12_...` se aplicaría **antes** que `20260831205735_01_...` y nada funcionaría. El
archivo es `20260902221500_12_sync_rpc.sql`.

## Desviaciones del plan

### Auto-corregidas

**1. [Regla 2 — Funcionalidad crítica] Sexto parámetro `p_http_status`**

- **Encontrado durante:** tarea 1, al escribir el paso (i) previsto para la tarea 2.
- **Problema:** la firma de cinco parámetros del plan no puede alimentar dos columnas
  que el mismo plan exige escribir.
- **Arreglo:** parámetro con `default 200`. La compatibilidad con la firma de cinco
  queda verificada en las llamadas del propio `05_sync.test.sql` y en el tipo generado.
- **Commit:** `fa0eb3f`.

**2. [Regla 2 — Funcionalidad crítica] Validación defensiva del evento antes de escribir**

- **Encontrado durante:** tarea 1.
- **Problema:** ver decisión 2. Tres rutas por las que una fila anómala aborta la
  corrida completa.
- **Arreglo:** validación previa y conteo como `unknown_count`.
- **Commit:** `fa0eb3f`.

**3. [Regla 1 — Bug] `min(uuid)` no existe en Postgres**

- **Encontrado durante:** tarea 3, primera corrida del archivo pgTAP.
- **Problema:** la aserción 23 usaba `min(id)::text` sobre `uuid`. `ERROR: function
  min(uuid) does not exist`, y **abortó la transacción entera**: el archivo pasó a
  imprimir cero líneas TAP. Es exactamente el modo de fallo que el helper
  `pg_temp.escalar` del plan 03-01 existe para evitar en otro contexto.
- **Arreglo:** `min(id::text)`.
- **Commit:** `c8235a8`.

**4. [Regla 1 — Bug] La medición del rojo era un falso verde de la herramienta**

- **Encontrado durante:** tarea 3.
- **Problema:** el comando de la cabecera de `05_sync.test.sql` usa
  `psql ... -q -f -`, sin `-A` ni `-t`. Con ese formato psql imprime **cada línea TAP
  dentro de una tabla**, con cabecera, separador y **un espacio delante**. El
  `grep -c "^not ok"` que el propio plan pone en su bloque `<verify>` devuelve **0**
  con el archivo entero en rojo. Se midió: primera corrida, `ok: 0 / not ok: 0`,
  y el archivo tenía seis fallos.
- **Arreglo:** `-qAtX`. El comando corregido y la explicación quedan escritos en la
  cabecera del archivo de test, que es donde lo va a leer el siguiente plan.
- **Por qué importa más de lo que parece:** es un falso verde en el **instrumento de
  medición**, no en el código. Un plan que se hubiera fiado del `grep` del `<verify>`
  habría declarado la suite en verde sin haber leído una sola aserción.
- **Commit:** `c8235a8`.

### Ninguna desviación de Regla 4

No hizo falta ninguna decisión arquitectónica fuera del plan.

## Gates de autenticación

Ninguno. El plan es DDL y pgTAP: sin red, sin rutas autenticadas.

## Verificación

| Comprobación | Resultado |
|---|---|
| `npx supabase db reset --local` | **OK**, doce migraciones aplicadas limpio |
| `npm run db:advisors` (`security --fail-on error`) | **`No issues found`**, 0 errores y 0 WARN |
| `npm run db:lint` | **`No schema errors found`** |
| `npm run ci:arch` | **OK**, 10 guardarraíles |
| `npm run db:types:check` | **diff vacío** |
| `npx tsc --noEmit` | **OK** |
| `npm run test:unit` | **20 archivos, 352 tests** (sin cambio: este plan no toca dominio) |
| `npm run build` | **OK**, 9 rutas |
| `npm run db:test` | `Files=6, Tests=73`, **`Failed tests: 4-9`**, esperado |
| `05_sync.test.sql` | **20 ok / 6 not ok, IDs 4-9** |
| Los cuatro pgTAP previos, por archivo | **47 ok / 0 not ok** |
| Señuelo 1 (`and c.is_managed`) | **ROJO, `23514` / `cl_unmanaged_is_inert`, solo la 20** |
| Señuelo 2 (`ends_on - 1`) | **ROJO, seis aserciones: 15, 17, 18, 21, 22, 23** |
| Feed real de punta a punta | **15 aseos en las 15 fechas exactas; 3 corridas siguen dando 15** |
| Semilla tras el reset y tras toda la suite | **39 apartamentos, 8 clusters, 5 informativas** |
| Los tres perfiles de desarrollo | **vivos**, con contraseña bcrypt y email confirmado |
| Residuo en la base | 0 `pgtap`, 0 `feed_sync_runs`, 0 `cleanings` |
| `git diff --diff-filter=D` en los tres commits | **vacío**, ningún borrado |
| `STATE.md` / `ROADMAP.md` | **sin tocar** |

### El `db reset` y el seed de perfiles: su camino de creación desde cero queda EJERCIDO

Es la primera vez que `supabase/seeds/070_perfiles_dev.sql` corre sobre una base sin
los tres perfiles. **Funciona.** Medido después del reset:

```
39 apartamentos | 8 clusters | 5 informativas | 3 perfiles | 3 usuarios

admin@vivaguest.test | admin    | Juan Ortega     | activo
luz@vivaguest.test   | aseador  | Luz Ospina      | activo
maria@vivaguest.test | aseador  | Maria Restrepo  | activo
```

Y no basta con que la fila exista: los tres tienen `encrypted_password` no nula con
formato bcrypt (`$2…`) y `email_confirmed_at` puesto, así que **pueden iniciar
sesión**. Un seed que recreara los perfiles sin credencial utilizable habría pasado un
conteo de tres y habría dejado al orquestador sin poder entrar.

La nota 5 del plan 03-03 ("no corras `db reset` sin respaldar `auth.users` y
`public.profiles`") **queda cerrada**: ya no hace falta respaldar nada.

## Stubs conocidos

Ninguno **por descuido**. Lo que está deliberadamente sin implementar y escrito como
tal en el cuerpo de la función, con la lista completa de los nueve pasos en la
cabecera:

- `cleanings_cancelled` y `reviews_flagged` se escriben en **cero** en
  `feed_sync_runs`. Son los pasos (e) y (g), de la migración 13.
- No hay cancelación, no hay `needs_review`, no hay detección de extensión y no hay
  notificaciones. La migración 13 llega por `create or replace` sobre esta misma
  función y los inserta en su sitio del orden.

La aserción 24 afirma explícitamente que la cancelación **no ocurre todavía**, así que
el día que la migración 13 la añada, esa aserción tendrá que actualizarse a
conciencia: no puede quedarse verde por accidente.

## Lo que este plan NO cierra

1. **La ventana protegida y el piso del feed no protegen nada todavía**, porque nada
   cancela. `min_ends_on` se escribe pero solo se lee en el plan 03-05.
2. **La pregunta del `UID` sigue abierta.** `uid_rotations` funciona —la aserción 25 lo
   demuestra con un `uid` rotado a mano— pero el feed real dio **0 rotaciones en una
   sola captura**, que es lo esperado: la respuesta necesita días de producción, no
   una fixture.
3. **La pregunta del piso sigue abierta.** El feed real de hoy trae
   `min_ends_on = 2026-09-02`, o sea la reserva que termina hoy. Es el primer punto de
   la serie; hacen falta al menos dos días más para saber si desaparece hoy o mañana.
4. **La guarda de colapso no existe.** Si Airbnb cambia el formato de la descripción,
   los 15 eventos caen a `desconocido`, `reservation_count` cae a 0 y **este RPC
   marcaría las 15 reservas como ausentes**. No cancela nada —eso es del 03-05— pero
   deja el terreno preparado para que el 03-05 sí lo haga. La guarda es del plan 03-06
   y es **obligatoria antes de que la migración 13 entre en producción**.
5. **Que `on conflict do nothing` sea suficiente bajo concurrencia real.** Aquí está
   medido contra corridas secuenciales. El lease de `claimed_at` es lo que impide dos
   corridas del mismo feed a la vez, y ese lease lo implementa el plan 03-06.
6. **Cómo se ve un bloqueo del propietario de verdad.** Sigue sin haber ni uno en el
   feed real; las aserciones 17 y 18 usan eventos sintéticos. Lo cierra el checkpoint
   humano del plan 03-10.

## Threat Flags

Ninguno nuevo. La función no abre superficie de red ni ruta de cliente:
`db advisors --type security` no reporta nada, ni error ni WARN.

Los seis riesgos del registro del plan quedan mitigados y **verificados**, no leídos:

| Threat ID | Mitigación | Evidencia |
|---|---|---|
| T-03-30 | `revoke all ... from public, anon, authenticated` + `grant execute ... to service_role` al lado de la definición | aserción 26 verde, con control positivo de `service_role`; `has_function_privilege` medido a mano |
| T-03-31 | `property_id` sale de la fila del feed, nunca del cuerpo de la petición | el `where` de los pasos (c), (d) y (f) usa `v_property`, leído con `into strict` de `calendar_feeds` |
| T-03-32 | `origin = 'ical'` en todo update, `on conflict do nothing` en el insert | aserción 23: el aseo manual conserva id, tipo, aseadora y `reservation_id` nulo |
| T-03-33 | `and c.is_managed` en el recálculo | aserción 20 + señuelo 1 con `23514` medido |
| T-03-34 | El RPC no nombra la columna de descripción cruda; el CHECK la rechazaría | A1: 0 de 15 reservas con descripción persistida; grep con 1 sola ocurrencia, en comentario |
| T-03-35 | Un solo RPC transaccional con la salud dentro | A2: `P0002` y cero filas escritas, ni siquiera la de la corrida |

## Notas para las waves siguientes

1. **`05_sync.test.sql` está en 6 `not ok`, IDs `4 5 6 7 8 9`.** Sigue siendo la lista
   vinculante, y **es la misma que dejó el plan 03-03**. Compárense identificadores y
   además el contenido de `Unexpected records` de las aserciones 7, 8 y 9: es ahí donde
   se ve si una función nueva del motor entró bien.
2. **Para correr un pgTAP suelto hace falta `psql -qAtX`.** Con `-q` a secas el TAP sale
   dentro de una tabla y cualquier `grep '^not ok'` devuelve cero con el archivo en rojo.
   El comando corregido está en la cabecera del archivo.
3. **La migración 13 hace `create or replace` sobre `sync_feed_apply` y tiene que
   repetir la firma de SEIS parámetros**, incluido `p_http_status int default 200`.
   Cambiar la lista de parámetros crea una función NUEVA por sobrecarga y deja la vieja
   viva con sus grants: dos funciones y un `revoke` que solo cubre una.
4. **La migración 13 tiene que repetir también el par `revoke`/`grant`.** `create or
   replace` conserva el ACL existente, pero si algún día se hace `drop` + `create`, el
   ACL se pierde y la función nace ejecutable por `anon`. Escribirlo siempre es barato.
5. **La aserción 24 afirma que la cancelación NO ocurre.** El plan 03-05 tiene que
   actualizarla a conciencia; si la deja como está, se pondrá roja y eso es lo correcto.
6. **`last_event_count` es RESERVAS, no eventos.** Medido y comentado dentro del
   `update`. Es el operando de la guarda de colapso del plan 03-06.
7. **El worker del plan 03-06 pasa `p_events` tal cual sale de `normalizarIcs()`**,
   incluidos los `bloqueo` y los `desconocido`: el RPC los necesita para contarlos y
   para escribir `block_count` y `unknown_count`. Filtrarlos antes rompería la
   telemetría y, con ella, la guarda de colapso.
8. **`ends_on_anterior` ya se escribe** en cada update de reserva, con el valor viejo.
   La regla R2 del plan 03-05 puede contar con ella desde la primera corrida.
9. **Ya se puede correr `db reset` sin respaldar nada.** El seed `070_perfiles_dev.sql`
   recrea los tres perfiles con contraseña utilizable; su camino de creación desde cero
   está ejercido en este plan.

## Self-Check: PASSED

- `supabase/migrations/20260902221500_12_sync_rpc.sql` — **FOUND**
- `supabase/tests/05_sync.test.sql` — **FOUND**, `plan(26)`
- `lib/database.types.ts` — **FOUND**, contiene `sync_feed_apply`
- Commit `fa0eb3f` — **FOUND**
- Commit `951d2a2` — **FOUND**
- Commit `c8235a8` — **FOUND**
- `STATE.md` y `ROADMAP.md` — **sin tocar**, verificado con `git diff --name-only`
  sobre los tres commits: solo tres archivos, todos del plan
- Ningún borrado en ninguno de los tres commits — **verificado**,
  `git diff --diff-filter=D` vacío
- El archivo temporal usado para volcar el feed real normalizado
  (`lib/domain/ical-e2e-scratch.test.ts`) — **borrado**, `git status` limpio antes de
  cada commit
