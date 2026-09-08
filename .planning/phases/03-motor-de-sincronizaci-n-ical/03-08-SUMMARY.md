---
phase: 03-motor-de-sincronizaci-n-ical
plan: 08
subsystem: testing
tags: [integracion, criterios-1-2-3, feed-real, colapso, lease, backoff, senuelos, centinela]

requires:
  - phase: 02-acceso-y-administraci-n-del-cat-logo
    plan: 14
    provides: "el patron del servidor HTTP local dentro del spec, la concesion de 127.0.0.1 en la allowlist, y feed.integration.test.ts como test de costura"
  - phase: 03-motor-de-sincronizaci-n-ical
    plan: 01
    provides: "las nueve fixtures, incluidas airbnb-desc-mutilado.ics y airbnb-truncado.ics"
  - phase: 03-motor-de-sincronizaci-n-ical
    plan: 05
    provides: "el reconcile destructivo con sus cuatro candados"
  - phase: 03-motor-de-sincronizaci-n-ical
    plan: 06
    provides: "POST /api/cron/sync-feed, exigirSecretoCron y la guarda de colapso sobre reservas clasificadas"
  - phase: 03-motor-de-sincronizaci-n-ical
    plan: 07
    provides: "dispatch_feed_syncs(), los tres jobs de cron.job y el comportamiento medido de pg_net"
provides:
  - "lib/test/sync.ts: sembrarFeed, correrSync, limpiarSync y sqlDePruebas, con la URL del feed fuera del valor de retorno"
  - "sync-pipeline.integration.test.ts: las quince fechas del feed real afirmadas una a una, idempotencia, TZ de Bogota, gestion externa, turnover y aseo manual"
  - "sync-transporte.integration.test.ts: las seis formas del feed degradado, con centinela de quince y control del contador"
  - "sync-dispatcher.integration.test.ts: fan-out, lease, backoff y cadencia, medidos dentro de un begin/rollback sin efectos sobre la base compartida"
  - "El patron de medicion transaccional del fan-out: los secretos de Vault se crean DENTRO de la transaccion, asi que el job de produccion no los ve y ninguna peticion HTTP sale"
  - "Seis senuelos medidos, con los numeros que importan"
affects: [03-09, 03-10, 04]

tech-stack:
  added: []
  patterns:
    - "El servidor HTTP local se levanta al SEMBRAR el feed, no al correr el sync: la URL tiene que estar persistida antes de la primera corrida"
    - "La prueba de que el RPC no se llamo es que last_payload_hash y last_success_at no se movieron: solo los escribe sync_feed_apply dentro de su transaccion"
    - "El fan-out se mide dentro de begin/rollback: pg_net encola en una tabla y su trabajador de fondo no puede leer lo no confirmado"
    - "Los conteos de la cola se filtran SIEMPRE por los feeds del propio archivo: la base local es compartida entre worktrees"
    - "La expectativa de urgencia se construye con la misma regla que el RPC (scheduled_date >= today_bog()) y no con la fecha literal, para que el test no mienta cuando el calendario avance"

key-files:
  created:
    - lib/test/sync.ts
    - lib/domain/sync-pipeline.integration.test.ts
    - lib/domain/sync-transporte.integration.test.ts
    - lib/domain/sync-dispatcher.integration.test.ts
    - .planning/phases/03-motor-de-sincronizaci-n-ical/03-08-SUMMARY.md
  modified: []

key-decisions:
  - "El fan-out se mide con un begin/rollback en vez de desactivar el job compartido. Desactivar cron.job toca estado global de una base que comparten todos los worktrees y se queda a medias si el proceso muere; la transaccion no toca nada y ademas impide que el job de produccion vea los secretos de Vault a mitad de la medicion"
  - "El senuelo de la guarda de colapso se midio en DOS niveles porque el primero no cancela nada: quitando solo la guarda del worker se cancelan CERO aseos, porque el candado 1 del RPC lo ataja. La cifra que el plan predecia (quince) solo aparece quitando ADEMAS el candado del RPC, y sale CATORCE, no quince"
  - "La expectativa de is_urgent se deriva de today_bog() leido de la base, no de la fecha literal del turnover. Un test con fecha literal deja de probar lo que dice cuando el 2026-10-10 quede atras, sin que nada se ponga rojo"
  - "sqlDePruebas manda el guion por la entrada estandar y no con -c: es lo unico que hace que un begin/rollback dentro del guion signifique lo que dice"

metrics:
  tasks_completed: 3
  files_created: 4
  files_modified: 0
  tests_added: 25
  duration: "~35 min"
  completed: 2026-09-02
---

# Fase 3 Plan 08: Los criterios 1, 2 y 3 medidos de punta a punta

Los tres criterios del ROADMAP que se pueden medir sin producción, verificados contra el stack
local y contra el feed real de Airbnb, con seis señuelos que demuestran que cada aserción puede
ponerse roja.

## Qué se construyó

**`lib/test/sync.ts`**, el arnés. `sembrarFeed` crea apartamento, feed y fila de secretos con la
dirección apuntando a un servidor HTTP local, y devuelve **solo ids**: la URL es una credencial y
no vuelve por ningún campo del valor de retorno. `correrSync` pone el cuerpo que el proveedor va a
servir, invoca el route handler con el header del secreto compartido y devuelve la respuesta, la
fila de `feed_sync_runs` y la fila del feed. `limpiarSync` borra en el orden obligatorio y lo
documenta: `cleanings.property_id` es `on delete restrict`, así que los aseos van antes que los
apartamentos o el borrado falla con 23503.

**Tres archivos de integración, 25 tests nuevos**, que suben la suite de integración de 52 a 77.

## Los tres criterios

### Criterio 2: el feed real entra por HTTP y salen quince aseos

Las quince fechas se afirman **una a una** contra la lista escrita a mano del README de fixtures,
no por conteo y no derivándolas del mismo archivo que se está probando: derivarlas con un `grep`
sería circular, y un parser que restara un día casaría consigo mismo.

Correr el mismo feed tres veces deja quince aseos. Las corridas 2 y 3 llevan un `DTSTAMP` distinto
a propósito, para que el atajo por hash del worker no las corte y **el RPC se ejecute de verdad las
tres veces**: la idempotencia que se mide es la del diff, no la del atajo. Aparte se mide el atajo:
el mismo cuerpo byte a byte devuelve `sin_cambios` y no llega al RPC.

La misma corrida bajo `TZ=America/Bogota` produce las mismas quince fechas. La suite fija UTC, que
es la zona de CI, de Vercel y de la sesión de la base; bajo esa zona un error de fecha es
silencioso y solo aparece cuando una persona mira la agenda en Bogotá.

Un apartamento de gestión externa produce quince filas inertes: `state`, `aseador_id`,
`tarifa_huesped` y `pago_aseador` en NULL, `is_managed = false` y `is_urgent = false`. Lo hace
`tg_cleanings_snapshot()` solo; el pipeline de sync no sabe nada de esto. Con control: el
apartamento gestionado del mismo feed sí trae estado y tarifa.

El turnover del 2026-10-10 es el único aseo urgente. Y un aseo **manual** preexistente en una fecha
de checkout no se duplica ni se pisa: conserva su `tipo`, su `aseador_id`, su `confirmado_at` y su
`num_huespedes`, y el sync tampoco lo re-apunta a la reserva.

### Criterio 3: ninguna de las seis formas del feed degradado cancela un aseo

| Cuerpo servido | `outcome` | código | aseos cancelados |
|---|---|---|---|
| `airbnb-bloqueos-1dia.ics` (90 bloqueos) | `ok` | — | 0 aseos creados |
| `solo-bloqueos.ics` | `ok` | — | 0 aseos creados |
| `airbnb-summary-desconocido.ics` | `ok` | — | 0 aseos, 3 desconocidos, **1 alerta** |
| `vacio.ics` con 15 reservas anteriores | `colapso` | `cero_reservas_clasificadas` | **0** |
| `html-200.html` con `text/html` | `transporte` | `content_type_html` | **0** |
| `airbnb-truncado.ics` | `transporte` | `cuerpo_truncado` | **0** |
| `airbnb-desc-mutilado.ics`, dos corridas | `colapso` | `cero_reservas_clasificadas` | **0** |
| 302 hacia otro host | `transporte` | `redirect_bloqueado` | **0** |

**La prueba de que ninguna llegó al RPC** no es el `outcome`: es que `last_payload_hash` y
`last_success_at` no se movieron. Los escribe `sync_feed_apply()` dentro de su transacción y nadie
más; `registrarFalloDeSync` ni siquiera los nombra en su `update`.

**Centinela y control, y sin ellos esto no vale nada.** Antes de cada cuerpo degradado se corre el
feed real y el apartamento queda con quince aseos vivos: la igualdad es sobre quince, no sobre
cero. Y el último bloque del archivo demuestra que el contador **sí se mueve**: una reserva futura
que desaparece dos corridas seguidas cancela su aseo, `cleanings_cancelled` sube a 1, el aseo
cancelado es el del 2026-11-16 con `cancel_reason = 'reserva_desaparecida'`, y los otros catorce
siguen vivos.

### Criterio 1: un feed caído no le quita el sync a ninguno de los otros

La aserción central se mide con dos feeds: A apunta a un puerto reservado y cerrado, B a un
servidor vivo con el feed real.

- **B, cuatro columnas:** `outcome = ok`, `last_success_at` fresco, `consecutive_failures = 0`,
  `claimed_at` nulo, y `next_sync_at` a 30 minutos exactos de `last_attempt_at`. Además produjo sus
  quince aseos mientras A estaba caído.
- **A, tres columnas y una cuarta que importa igual:** `consecutive_failures = 1`, `next_sync_at` a
  5 minutos, `last_error` dentro de la unión cerrada (`red`), y **`last_success_at` sigue nulo**.
  Un feed muerto no puede parecer sano ante el watchdog.
- `claimed_at` vuelve a nulo en **las dos ramas**.

El fan-out, el lease y su caducidad se miden hablando con la base como `postgres`: `net` y
`dispatch_feed_syncs()` no son alcanzables por PostgREST, porque la migración 14 revoca `execute`
de `public` y no le da grant a `service_role`.

**Y todo va dentro de un `begin … rollback`.** Los dos secretos de Vault se crean dentro de la
transacción, así que el job de producción de la base local —que hoy falla cada minuto justamente
por falta de esos secretos— no los ve y no puede reclamar los feeds del test a mitad de la
medición. Ninguna petición HTTP sale de verdad, porque el trabajador de `pg_net` no puede leer lo
no confirmado, y el `rollback` deshace el `claimed_at`, el `next_sync_at` y la cola. La base queda
exactamente como estaba: verificado después, `vault.secrets` con cero filas y los tres jobs
activos.

El backoff se mide contra la base con seis corridas reales contra el puerto muerto: **5, 5, 8, 16,
32, 60**. La cadencia se afirma como aritmética sobre `next_sync_at` más el tick leído de
`cron.job` (`* * * * *`): peor caso 31, y con el tick de cinco que proponía `ARCHITECTURE.md` sería
35, que incumple el criterio.

## Los seis señuelos, con sus números

Cada uno se aplicó a la base o al código, se midió, y se revirtió. Al final: 77 tests de
integración, 392 unitarios, 112 pgTAP, `tsc --noEmit` y `ci:arch` en verde.

### 1. Restar un día al `scheduled_date` (migración 13, paso c)

**Aserción 1 en rojo, con las quince fechas desplazadas.** Salida literal:

```
+   "2026-09-01",  ← el aseo con el huésped todavía dentro
    "2026-09-02",
+   "2026-09-05",
    "2026-09-06",
+   "2026-09-12",
    "2026-09-13",
    …
```

7 de los 8 tests del archivo se pusieron rojos.

### 2. La guarda de colapso del worker mirando eventos en vez de reservas clasificadas

**Aserción 16 en rojo:** `outcome` pasó de `colapso` a `ok`, y el log del worker registró la firma
del desastre en curso: `event_count: 15, reservation_count: 0, unknown_count: 15`. El RPC **sí se
llamó**, que es exactamente lo que la guarda existe para impedir.

**Aseos cancelados: CERO.** Y esto corrige la predicción del plan, que decía quince. El candado 1
del propio RPC (`v_reconcile := v_reservation_count > 0 and v_piso is not null`) atajó la
cancelación. Es defensa en profundidad y está medida.

### 3. Los DOS candados fuera a la vez: la medida literal del desastre

Para obtener el número que el plan pedía hubo que quitar **también** el candado del RPC
(`v_reconcile := v_piso is not null` con el piso forzado). Con eso:

| corrida | `cleanings_cancelled` |
|---|---|
| 1ª con `airbnb-desc-mutilado.ics` | 0 (primera ausencia) |
| 2ª con `airbnb-desc-mutilado.ics` | **14** |

**Catorce de quince aseos cancelados de un golpe** porque Airbnb cambió una subcadena dentro del
campo libre del evento. El decimoquinto se salva **solo por la ventana protegida**: su fecha es la
de hoy y el candado `scheduled_date > today_bog() + 1` lo excluye. Corrido cualquier otro día del
calendario del feed, el número es quince.

### 4. Quitar el sniff de cuerpo incompleto

**Solo la aserción 15 en rojo**, que es lo que se quería: es la única que prueba esa guarda. El
worker devolvió `ok` con `reservation_count: 7` en vez de 15 — es decir, **ocho reservas
desaparecidas de golpe** por una respuesta parcial de red.

### 5. Quitar el lease del `where` del dispatcher

**Aserción 4 en rojo:** dos despachos seguidos produjeron **2** peticiones para el mismo feed en
vez de 1. El control de la aserción 5 (lease fresco ⇒ cero despachos) también se puso rojo.

### 6. `last_success_at` escrito también en la rama de fallo

**Aserción 3 en rojo:** el feed caído quedó con `last_success_at` fresco. Es la que impide que un
feed muerto parezca sano ante el watchdog por obsolescencia: si esa marca se refrescara al fallar,
la alerta de las tres horas **no llegaría nunca**.

## Lo que NO está verificado, y no se finge verificado

**Que el job de verdad corre cada minuto durante días.** Ninguna suite de tests puede medir eso:
haría falta dejar corriendo el reloj. Se aproxima por dos vías, y las dos son parciales:

- el agendado de segundos de `scripts/dev/sync-local.sh` (plan 03-07, medido), que ejercita el lazo
  completo en cuarenta segundos;
- la aserción de aquí sobre la expresión agendada (`* * * * *` leída de `cron.job`) y la aritmética
  de la cadencia.

Lo que ninguna de las dos cubre es la **durabilidad**: que `pg_cron` siga vivo mañana. Eso lo
confirma la primera corrida real de producción, y su vigilancia es el hueco declarado de la
migración 14 (ningún vigilante dentro del scheduler puede ver la muerte del scheduler).

**Tampoco está verificado**, y ya lo declaraba el README de fixtures: cómo se ve de verdad un
bloqueo del propietario en un feed de VivaGuest (el feed real capturado tiene cero), ni si el `UID`
de Airbnb sobrevive a un cambio de fechas. Lo contesta `uid_rotations` en producción.

## Desviaciones del plan

### 1. [Rule 3 - Bloqueante] El worktree venía sin `node_modules` ni `.env.local`

- **Encontrado en:** antes de la tarea 1.
- **Arreglo:** `npm ci` y copia de `.env.local` desde el checkout principal, que es lo que
  documenta `scripts/dev/setup-worktree.sh`. `.env.local` está en `.gitignore` y no se commitea.

### 2. [Rule 3 - Diseño del arnés] El servidor local se levanta al sembrar, no dentro de `correrSync`

- **Motivo:** el plan describe `correrSync(feedId, cuerpo, opts)` levantando el servidor. No puede
  ser: la dirección tiene que estar **persistida en `property_secrets` antes** de la primera
  corrida, así que el puerto se decide al sembrar. `correrSync` decide **qué** se sirve, que es la
  variable que los specs mueven, y sigue siendo una línea por corrida.

### 3. [Rule 2 - Funcionalidad faltante] `sqlDePruebas` y tres lectores de aseos

- **Motivo:** el plan lista tres exports para `lib/test/sync.ts`. Hacían falta cuatro más:
  `sqlDePruebas` (sin él la tarea 3 es imposible: `dispatch_feed_syncs()` y el esquema `net` no son
  alcanzables por PostgREST) y `aseosDe` / `aseosVivosDe` / `cancelados`, que son la aserción
  central de dos de los tres archivos.

### 4. [Corrección de una predicción del plan] El señuelo de la guarda de colapso da 0, no 15

- Documentado arriba, señuelos 2 y 3. La predicción del plan ignoraba que el RPC tiene su **propio**
  candado sobre reservas clasificadas. Quitando los dos, el número medido es **14**, y el
  decimoquinto lo salva la ventana protegida.

### 5. El feed de gestión externa no aparecía en el plan con tarifas

- `sembrarFeed` siembra el apartamento gestionado con tarifas (120000 / 45000) para que el snapshot
  financiero del aseo sea observable, y el externo sin ellas, porque `cl_unmanaged_is_inert` exige
  que el aseo salga con las suyas nulas.

## Verificación

| Comprobación | Resultado |
|---|---|
| `npm run test:integration` | **77 pasados** (52 previos + 25 nuevos), 8 archivos |
| `lib/domain/feed.integration.test.ts` (costura Fase 2) | verde, sin tocarlo |
| `npm run test:unit` | 392 pasados, 24 archivos |
| `npm run db:test` (pgTAP) | 112 aserciones, `Result: PASS` |
| `npx tsc --noEmit` | limpio |
| `npm run ci:arch` | `check-service-role: OK` |
| Estado de la base tras los señuelos | `vault.secrets` en 0 filas, los tres `cron.job` activos |

## Threat Flags

Ninguna. Este plan no añade superficie: `lib/test/` no entra al bundle de producción y los
guardarraíles 5, 7 y 8 lo exceptúan por una razón escrita y acotada.

## Commits

| Hash | Mensaje |
|---|---|
| `592ed87` | `test(03-08): lib/test/sync.ts, el arnes de siembra, corrida y limpieza del pipeline` |
| `58ee4fc` | `test(03-08): criterios 2 y 3 de punta a punta contra el feed real` |
| `3c369c2` | `test(03-08): criterio 1, aislamiento de feeds, lease y cadencia` |
| `f7976d5` | `docs(03-08): resumen de los criterios 1, 2 y 3 medidos de punta a punta` |
| `101b1ac` | `docs(03-08): marcar SYNC-01, 02, 03, 06 y 11 como cumplidos` |

## Self-Check: PASSED

Los cinco archivos existen en disco y los cinco commits están en el historial de la rama del
worktree. Árbol de trabajo limpio, sin archivos sin seguir y sin borrados en ningún commit.
