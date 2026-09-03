---
phase: 03-motor-de-sincronizaci-n-ical
plan: 09
subsystem: testing
tags: [integracion, criterios-4-5, diff-destructivo, ventana-protegida, piso-del-feed, 304, alertas, anti-tormenta, senuelos]

requires:
  - phase: 03-motor-de-sincronizaci-n-ical
    plan: 01
    provides: "las fixtures derivadas del feed real (movida, una-menos, uid-rotado, extension-mal-creada) y feedConCheckoutRelativo"
  - phase: 03-motor-de-sincronizaci-n-ical
    plan: 05
    provides: "sync_feed_apply() completa: los cuatro candados de la cancelacion, la R2 que separa turnover de extension, y las notificaciones con dedupe_key"
  - phase: 03-motor-de-sincronizaci-n-ical
    plan: 06
    provides: "POST /api/cron/sync-feed con la rama del 304 que NO llama al RPC y la guarda de colapso"
  - phase: 03-motor-de-sincronizaci-n-ical
    plan: 07
    provides: "feed_health_watchdog() con el discriminador anti-tormenta y el colapso como condicion propia, y salud-sync.ts"
  - phase: 03-motor-de-sincronizaci-n-ical
    plan: 08
    provides: "lib/test/sync.ts: sembrarFeed, correrSync, limpiarSync, sqlDePruebas y los tres lectores de aseos"
provides:
  - "lib/test/sync.ts ampliado con las ayudas de ENCADENADO: correrDiff, conDtstamp, sinCheckout y cabecerasDe"
  - "lib/test/sync.ts ampliado con los lectores que faltaban: reservasDe, notificacionesDe, alertasLogicas y transicionesDe"
  - "diaRelativo() en generar.ts, que confina la aritmetica de dias al unico modulo con la excepcion consentida"
  - "sync-diff.integration.test.ts: criterio 4 de punta a punta, 13 specs con 14 aserciones"
  - "sync-alertas.integration.test.ts: criterio 5 de punta a punta, 11 specs con 14 aserciones"
  - "El patron de medicion del watchdog: begin/rollback con la poblacion de feeds activos fijada dentro de la transaccion"
  - "Los siete senuelos obligatorios medidos en ocho pasadas, con sus numeros y sus dos codigos de error"
affects: [03-10, 04]

tech-stack:
  added: []
  patterns:
    - "correrDiff cambia el DTSTAMP en cada llamada: sin eso el atajo por hash del worker corta la segunda corrida y la regla de las dos ausencias es inalcanzable desde un test"
    - "El feed 'con una reserva menos' se construye QUITANDO TEXTO, nunca regenerando con menos offsets: los codigos de reserva son la identidad de nivel 1 y regenerar cambia los quince"
    - "El watchdog se mide dentro de begin/rollback porque sus conteos son globales: la unica forma de fijar v_activos es desactivar el resto, y eso hay que deshacerlo"
    - "Las seis horas del watchdog se simulan REBOBINANDO lo que ya paso, no adelantando el reloj: dentro de una transaccion now() es constante"
    - "La unidad que se cuenta en las notificaciones es dedupe_key, no la fila: el fan-out es por admin activo y contar filas ataria cada asercion al numero de admins de la semilla"

key-files:
  created:
    - lib/domain/sync-diff.integration.test.ts
    - lib/domain/sync-alertas.integration.test.ts
    - .planning/phases/03-motor-de-sincronizaci-n-ical/deferred-items.md
    - .planning/phases/03-motor-de-sincronizaci-n-ical/03-09-SUMMARY.md
  modified:
    - lib/test/sync.ts
    - lib/domain/__fixtures__/ical/generar.ts
    - lib/domain/sync-dispatcher.integration.test.ts
    - .planning/REQUIREMENTS.md

key-decisions:
  - "airbnb-real-una-menos.ics NO puede demostrar una cancelacion, y el plan se equivocaba al pedirselo: la reserva que quita es la que termina el dia de la captura, que cae DENTRO de la ventana protegida y ADEMAS por debajo del piso. Se convirtio en la prueba de que ni siquiera dos ausencias la cancelan, y la cancelacion de verdad se mide sobre un checkout futuro"
  - "No existe 'pendiente con started_at': cl_pendiente_shape lo prohibe. El aseo con trabajo dentro se mide como en_curso, que es ademas el estado real de una aseadora que ya empezo"
  - "El senuelo del 304 se implemento como el bug plausible que produce el fallo descrito: 'el feed no cambio, asi que re-corro el diff con las reservas que ya tengo'. Quitar la rama a secas no adelanta la cancelacion, la convierte en un fallo de transporte"
  - "diaRelativo se exporta desde generar.ts y no se reimplementa en lib/test/: la aritmetica de dias con el tipo temporal es la excepcion consentida de ese modulo, y duplicarla la sacaria del unico sitio donde esta razonada"

metrics:
  tasks_completed: 2
  files_created: 2
  files_modified: 3
  tests_added: 24
  duration: "~50 min"
  completed: 2026-09-02
---

# Fase 3 Plan 09: Los criterios 4 y 5 medidos entre corridas

El diff destructivo con sus cuatro candados y las cinco alertas, verificados contra el stack local
encadenando dos, tres y cuatro corridas, con los siete señuelos obligatorios del plan que demuestran
que cada aserción puede ponerse roja.

## Qué se construyó

**24 tests nuevos** en dos archivos, que suben la suite de integración de 77 a **101**.

**`lib/test/sync.ts`** gana las ayudas que el plan pedía y tres lectores más:

- **`correrDiff`** es la pieza central. Cambia el `DTSTAMP` en cada llamada sobre el mismo feed, así
  que el atajo por hash del worker (`sin_cambios`) nunca corta la segunda corrida y el RPC se
  ejecuta de verdad todas las veces. **Sin esto la regla de las dos ausencias es inalcanzable desde
  un test**, porque la segunda corrida con el mismo cuerpo no llega al RPC.
- **`sinCheckout`** y **`conDtstamp`**, promovidos desde el archivo de transporte.
- **`cabecerasDe`**, que devuelve las cabeceras de la última petición que recibió el servidor local.
  Existe para una sola aserción y es importante: sin ella, la prueba del `304` se estaría
  comprobando a sí misma, porque el arnés le estaría regalando el status al worker.
- **`reservasDe`**, **`notificacionesDe`**, **`alertasLogicas`** y **`transicionesDe`**.

**`generar.ts`** exporta **`diaRelativo(hoyIso, dias)`**, que devuelve el día en las dos formas: la
cruda de ocho dígitos del `DTEND` y la de negocio con guiones de `scheduled_date`. Vive ahí y no en
el arnés porque la aritmética de días con el tipo temporal es la excepción consentida de ese módulo,
y duplicarla la sacaría del único sitio donde está razonada.

## Criterio 4: el diff destructivo

`sync-diff.integration.test.ts`, 13 specs con las 14 aserciones del plan.

### La reserva se movió

| Estado del aseo viejo | Qué le pasa | El aseo nuevo |
|---|---|---|
| `pendiente`, sin confirmar | `cancelada`, `reserva_movida` | hereda la reserva, **sin confirmar** |
| `pendiente`, confirmado y asignado | `cancelada`, `reserva_movida` | hereda la reserva, **sin confirmar ni asignar** |
| `en_curso` (aseadora dentro) | **sobrevive**, `needs_review`, `reserva_movida_aseo_iniciado` | **nace huérfano**, `reservation_id` nulo |

La tercera fila es la trampa medida: `cleanings_one_live_per_reservation` es único sobre
`reservation_id` para las filas vivas, así que un aseo nuevo que apuntara a la misma reserva que el
viejo se llevaría por delante la corrida entera. Nace huérfano y marcado, y el sistema se queda con
un aseo de más y una alerta, que es el lado correcto en el que equivocarse.

### La reserva desapareció, y el `304`

| Corrida | Cuerpo | `cleanings_cancelled` |
|---|---|---|
| t0 | feed real | 0 (crea 15) |
| t1 | feed sin el checkout del 2026-11-16 | **0** — primera ausencia, solo marca `disappeared_at` |
| t2 | **`304 Not Modified`** vía `If-None-Match: W/"v1"` | **0** — un 304 no es una observación |
| t3 | feed sin el checkout, otra vez | **1** — `reserva_desaparecida` |

Que el `If-None-Match` salió de verdad, con el etag que guardó t1, se afirma leyendo las cabeceras
que recibió el servidor local. Y el `304` **no tocó `disappeared_at`**: ni lo refrescó ni lo borró.

El control de la aserción 6 vive en el mismo archivo y en el mismo spec: el contador va de **0 a 1**
entre t1 y t2 del caso limpio. Sin esa línea, todas las de "no canceló nada" de este archivo y del
de transporte pasan por vacuidad.

### Los tres candados de fecha, con fechas relativas a `today_bog()`

| Escenario | Piso de la corrida | Resultado |
|---|---|---|
| desaparece el checkout de **hoy**, dos veces | hoy+1 | **no se cancela**, `reserva_desaparecida_ventana_protegida` |
| desaparece el checkout de **hoy+1**, dos veces | hoy | **no se cancela**, `reserva_desaparecida_ventana_protegida` |
| desaparece el checkout de **hoy+2**, dos veces | hoy | **se cancela**, `reserva_desaparecida` |
| desaparecen hoy+5 y hoy+10, el feed salta a hoy+30 | hoy+30 | **no se cancela**, `reserva_desaparecida_bajo_piso` |
| desaparece hoy+10, el feed conserva hoy+5 | hoy+5 | **se cancela** |

Las dos últimas filas son el mismo par de corridas sobre la misma fecha, y **la única diferencia es
dónde queda el piso**. Sin ese control, la aserción del piso no distinguiría "el candado funciona"
de "aquí nunca se cancela nada".

Ninguna de estas cinco filas usa una fecha literal: todas salen de `feedConCheckoutRelativo` sobre
el `today_bog()` leído de la base. Es lo que impide que el test deje de probar lo que dice cuando
el calendario avance.

### Identidad, y la bitácora

- **Rotación de los quince `UID`:** las reservas se actualizan, no se duplican. La aserción es sobre
  el **conjunto de ids** y no sobre un contador (quince filas nuevas también serían quince), con el
  control de que los quince `uid` sí cambiaron. `feed_sync_runs.uid_rotations = 15`.
- **Código y `uid` nuevos para las mismas fechas:** el aseo es **el mismo id**, conserva
  `confirmado_at`, `aseador_id` y `num_huespedes`, y solo se re-apunta su `reservation_id`. La
  identidad del aseo es `(property_id, scheduled_date)`, no la reserva.
- **La bitácora:** una sola transición, `pendiente → cancelada`, `reason = 'reserva_desaparecida'` y
  **`actor_id` nulo**. Con control: los otros catorce aseos no tienen ninguna transición.
- **`origin = 'manual'` es intocable**, con control en el mismo spec: el `repaso` del admin en una
  fecha de checkout sobrevive al ciclo completo de desaparición, y el aseo de sync de la fecha
  vecina, con la misma historia de dos ausencias, **sí se cancela**. La diferencia es una línea de
  `where`.

## Criterio 5: las cinco alertas

`sync-alertas.integration.test.ts`, 11 specs con las 14 aserciones del plan.

### El watchdog, medido dentro de `begin … rollback`

`feed_health_watchdog()` no es alcanzable por PostgREST y sus conteos son **globales**: mira todos
los feeds activos de la base. La única forma de fijar `v_activos` —que es el denominador del
discriminador anti-tormenta— es desactivar el resto, y eso hay que deshacerlo, porque la base local
es una sola y la comparten todos los worktrees. Todo va dentro de una transacción que se revierte:
la desactivación, las marcas de tiempo y las notificaciones. **Verificado después: cero feeds, cero
notificaciones, los tres `cron.job` activos.**

| Escenario | Alertas de `feed` | Alertas de `job` |
|---|---|---|
| 1 de 3 feeds obsoleto (4 h) | **1**, `scope=feed`, `motivo=sin_respuesta`, con `property_id` | 0 |
| segunda llamada dentro de las 6 h | 1 (ni una clave ni una fila más) | 0 |
| los otros dos, frescos (10 min) | **0** | 0 |
| **los 3 obsoletos a la vez** | **0** | **1**, `motivo=todos_los_feeds_obsoletos`, `feeds=3`, `property_id` nulo |
| 1 de 3 colapsado (`cero_reservas_clasificadas`) | 0 | 0, y **1** `fmt:`, `motivo=formato_desconocido` |

### El cubo horario se lee al revés de como es

Medido en tres pasos dentro de la misma transacción, simulando las siete horas **rebobinando lo que
ya pasó** en vez de adelantar el reloj (dentro de una transacción `now()` es constante):

| Paso | Qué se mueve | Claves lógicas |
|---|---|---|
| corrida 1 | — | 1 |
| solo se abre la compuerta (`dead_alert_sent_at` a −7 h) | la clave sigue en el cubo de esta hora | **1** |
| además se rebobina el cubo de la alerta existente | la clave nueva es la de esta hora | **2** |

El paso 2 es el que importa: **la compuerta abierta no basta**. Sin cubo, un feed caído alertaría
una vez y nunca más, y el admin que marcó la primera como leída no volvería a saber que su
calendario sigue muerto.

### La capa que no es ciega a su propia muerte

`estadoDeSincronizacion` sobre `max(last_success_at)` de los feeds activos: **`caida` a las 4 horas,
`sana` a la hora, `caida` sin feeds activos**. La marca se lee con la forma literal que escribe
Postgres (espacio como separador y desfase de dos dígitos, `+00`), que es la que devuelve `NaN` en
`Date.parse` sin la normalización de `salud-sync.ts` y pintaría el panel en rojo con el sistema sano.

### Urgencia y extensión

- El feed real produce **exactamente un** aseo urgente, y es el del turnover del `2026-10-10`. La
  expectativa se construye con la misma regla que el RPC (`scheduled_date >= today_bog()`), no con
  la fecha literal.
- Si la reserva **entrante** se mueve un día, la urgencia **se apaga sola**: de 1 a **0**, sin
  cancelar nada y sin mover el aseo del checkout de esa reserva.
- Gestión externa: dos corridas, `outcome = ok` las dos, quince filas inertes con `is_urgent` falsa
  y `state` nulo, y el control de que el día del turnover **sí está** entre esas quince.
- `airbnb-extension-mal-creada.ics` produce `needs_review = 'extension_sospechosa'` en el aseo de la
  fecha de unión (`2026-12-25`), **una** notificación `ext:<id>`, **y además el aseo del checkout
  nuevo** (`2026-12-27`), apuntando a la reserva nueva. Cero cancelados, dieciséis vivos.
- **La marca es pegajosa:** una segunda corrida con el mismo cuerpo no la apaga.
- **El turnover sano del feed real produce CERO notificaciones de extensión**, cero aseos con ese
  `review_reason` y **cero aseos con `needs_review` de cualquier clase**. Es la aserción que separa
  SYNC-07 de SYNC-08.

### Deduplicación de las alertas del RPC

Dos corridas idénticas sobre una reserva movida con el aseo `en_curso`: **una** clave lógica
(`rev:<id>`) y **una fila por admin activo**, no una por corrida. El fan-out es del destinatario; la
deduplicación es del hecho.

## Los siete señuelos obligatorios, medidos en ocho pasadas

El del `reservation_id` se midió en **dos niveles**, porque el primero no produce el código de error
que el plan predecía y el segundo sí. Cada uno se aplicó a la base o al código, se midió y se
revirtió. Después de todos:
`vault.secrets` sin tocar, los tres `cron.job` activos, cero feeds y cero notificaciones huérfanas.

### 1. Quitar la ventana protegida (migración 13, pasos e.1 y e.2)

**Aserción 9 en rojo.** `cleanings_cancelled` pasó de **0 a 1** en la corrida cuya única reserva
ausente es **la que termina HOY**.

> **Ese es exactamente el escenario de la aseadora en camino al apartamento.** El aseo desaparece de
> la agenda a las 6 de la mañana, nadie va, y el huésped entra a un apartamento sucio. Es el único
> señuelo de la fase cuyo desenlace no es "un dato mal", es "una persona en la calle".

### 2. Quitar el piso del feed (migración 13, paso e.1)

**Aserción 11 en rojo:** **2** aseos cancelados donde el diseño correcto cancela **0**. Son los de
`hoy+5` y `hoy+10`, que no estaban cancelados: estaban **fuera de la ventana de observación del
proveedor**. Con un feed real que mueva su ventana un bloque, el número escala con el bloque.

### 3. El aseo nuevo hereda el `reservation_id`, nivel A

Cambiar `case when v_cancelado then mv.res_id else null end` por `mv.res_id`, conservando el
`on conflict do nothing`.

**Aserción 2 en rojo, y NO con el 23505 que predecía el plan.** El `on conflict do nothing` sin
destino cubre **todos** los índices únicos, así que se traga la violación en silencio y el resultado
medido es peor de leer y casi peor de sufrir:

```
Error: Se esperaba UN aseo el 2026-09-29, hay 0.
```

**La reserva se movió y el apartamento se quedó sin aseo en la fecha nueva**, sin error, sin alerta y
sin nada en la bitácora.

### 4. El aseo nuevo hereda el `reservation_id`, nivel B

Lo mismo, quitando además el `on conflict do nothing`, que es lo que hace visible el código:

```
SQLSTATE=23505
duplicate key value violates unique constraint "cleanings_one_live_per_reservation"
```

Y el efecto en el worker es el que el comentario de la migración anuncia: **se lleva por delante la
corrida entera**. `outcome: "error", codigo: "rpc_fallido"` con las quince reservas ya clasificadas.

### 5. Que un `304` cuente como corrida de diff

Implementado como el bug plausible que produce el fallo descrito: *"el feed no cambió, así que el
diff es el mismo que la última vez: lo re-corro con las reservas que ya tengo"*. Con eso, en el paso
t2 del encadenado:

```
AssertionError: expected 1 to be +0
  expect(await cancelados(propertyId)).toBe(0);
```

**La cancelación se adelanta exactamente una corrida**, y ocurre en la corrida en la que el proveedor
dijo "no he cambiado". Es decir: **se cancela un aseo justo cuando Airbnb está más estable.**

*Nota de método:* quitar la rama del `304` a secas **no** reproduce esto. El worker cae en la guarda
de cuerpo y el `outcome` pasa a `transporte`, que es un fallo ruidoso y no una cancelación. La
versión peligrosa es la que "reconstruye" la lectura, y por eso el señuelo se escribió así.

### 6. Quitar de R2 la condición de "se movió o desapareció en esta corrida"

**Aserción 11 en rojo, y arrastra dos más (10 y 14b).** El turnover **sano** del `2026-10-10`
produce **una notificación `extension_sospechosa`** donde el diseño correcto produce cero:

```
AssertionError: expected [ Array(1) ] to deeply equal []
+ [ "ext:90e97543-e3f4-411b-b5bf-b25a02a69236" ]
```

> **Este señuelo convierte el caso más común y más importante del negocio en ruido.** Todo turnover
> del mismo día —que es el caso operativo normal de una unidad con buena ocupación— pasaría a llegar
> como "posible extensión de reserva". En una semana el admin deja de mirar las alertas, y a partir
> de ahí ninguna alerta del sistema sirve, incluidas las que sí importan.

### 7. Quitar el filtro por gestión del recálculo de urgencia (paso f)

**Aserción 9 del criterio 5 en rojo:** `outcome: "error", codigo: "rpc_fallido"` en las **dos**
corridas sobre la unidad externa. El código exacto, reproducido aparte contra la base:

```
SQLSTATE=23514
new row for relation "cleanings" violates check constraint "cl_unmanaged_is_inert"
```

Hay **cinco** unidades de gestión externa en la semilla, así que esto no es un caso de borde: es un
fallo garantizado en la primera corrida real de cualquiera de las cinco.

### 8. Quitar el discriminador anti-tormenta (migración 14)

**Aserción 4 en rojo.** Con **3** feeds activos y **1** admin activo:

| | con discriminador | sin él |
|---|---|---|
| alertas de `feed` | **0** | **3** |
| alertas de `job` | **1** | **0** |

Tres feeds producen tres alertas de "calendario caído" y **ninguna que diga la verdad**. Sobre el
catálogo real —34 unidades gestionadas— el día que muera el scheduler el admin recibiría **34
notificaciones** de "revisa la conexión de este apartamento", todas falsas (las conexiones están
bien), y cero que digan "se cayó la sincronización". Con los dos admins del escenario del plan
03-07, 68.

## Lo que NO está verificado, y no se finge verificado

### El hueco residual de la alerta de job muerto (T-03-85), declarado y no tapado

`feed_health_watchdog()` vive en `pg_cron`. **Si `pg_cron` deja de correr, el watchdog tampoco
corre**, y subirlo un nivel no lo arregla: un segundo job que vigile al primero muere con el
primero. La capa que sí lo ve es `estadoDeSincronizacion`, que se computa **al leer** en el panel de
la Fase 4 sobre datos que ya existen, y por eso se dispara aunque no corra absolutamente nada dentro
de la base.

**Su hueco: si el admin no abre el panel, nadie se entera.** Es aceptable para un producto que el
admin mira varias veces al día, y hay que decirlo en vez de fingir que está cubierto. Lo cerraría un
dead man's switch externo pingado desde el dispatcher; queda **diferido y fuera del MVP**, anotado
en `deferred-items.md`.

### Lo que las fixtures construidas no contestan

`airbnb-real-movida.ics`, `airbnb-real-uid-rotado.ics` y `airbnb-extension-mal-creada.ics` son
construidas y el README de fixtures ya lo advierte. Prueban que el código se comporta bien bajo los
dos mundos posibles, **no cuál es el mundo real**. Si el `UID` de Airbnb sobrevive a un cambio de
fechas lo contesta `uid_rotations` en producción, y con qué frecuencia ocurre una extensión mal
creada solo lo dice el uso.

### La pantalla

`estadoDeSincronizacion` se prueba aquí como función pura más la consulta que la alimenta. **La
pantalla es de la Fase 4** y no existe todavía.

## Desviaciones del plan

### 1. [Corrección de una predicción del plan] `airbnb-real-una-menos.ics` no puede demostrar una cancelación

- **Encontrado en:** tarea 1, aserciones 4, 5 y 6.
- **El plan pedía:** t0 con el feed real, t1 con `una-menos` (primera ausencia), t2 con la misma
  fixture, *"ahora sí se cancela con `cancel_reason = 'reserva_desaparecida'`"*.
- **Medido:** eso **no puede pasar y no debe pasar**. El `VEVENT` que esa fixture quita es
  precisamente el que termina el día de la captura, así que su aseo cae **dentro de la ventana
  protegida** (`scheduled_date <= today_bog() + 1`) y además **por debajo del piso** de la corrida
  (`min_ends_on` pasa a `2026-09-06`). Los candados 3 y 4 lo salvan los dos por separado. El propio
  README de la fixture lo dice: *"aun así no debe tocar la ventana protegida"*.
- **Resuelto:** la fixture derivada se usa para lo que sí demuestra, que es más valioso —**dos
  ausencias no bastan por sí solas**, spec `4bis`— y la cancelación de verdad se mide sobre un
  checkout futuro (`2026-11-16`), donde los cuatro candados dejan pasar. El control del contador
  (aserción 6) vive en ese mismo spec, que es lo que el criterio de aceptación pedía.

### 2. [Regla 1 — Corrección] No existe "pendiente con `started_at`"

- **Encontrado en:** tarea 1, aserciones 2 y 3.
- **El plan pedía:** *"con `started_at` puesto en el aseo viejo, t1 no lo cancela: queda
  `pendiente`"*.
- **Medido:** `cl_pendiente_shape` (migración 04) exige `started_at is null` cuando el estado es
  `pendiente`, así que ese estado es inconstruible. El aseo con trabajo dentro es `en_curso`, y
  `cl_en_curso_shape` exige además `confirmado_at` y `aseador_id` no nulos, que es exactamente el
  escenario real: nadie empieza un aseo que el admin no confirmó.
- **Resuelto:** el ayudante `empezar()` deja el aseo `en_curso` y lo documenta. La propiedad que el
  plan quería medir —el trabajo empezado no se cancela— queda medida igual, y de hecho mejor,
  porque `en_curso` es el estado que la ruta del aseador produce de verdad.

### 3. [Regla 3 — Bloqueante] El worker no devuelve `reservations_updated` ni `reservations_inserted`

- **Encontrado en:** tarea 1, aserciones 12 y 13.
- **Problema:** el RPC los devuelve en su `jsonb`, pero `responder()` solo reenvía cuatro contadores
  y `feed_sync_runs` no los persiste. No son observables desde un test de integración.
- **Resuelto, y la aserción quedó más fuerte:** se comparan los **conjuntos de ids** de
  `calendar_reservations` antes y después, más el control de que los quince `uid` sí cambiaron.
  Quince filas nuevas también serían quince, así que el contador nunca habría distinguido
  "actualizadas" de "recreadas"; los ids sí.

### 4. [Regla 3 — Necesario para completar] `diaRelativo` en `generar.ts`

- **Motivo:** los tres candados de fecha necesitan el día `hoy + N` en las dos formas (cruda para el
  `DTEND`, con guiones para `scheduled_date`). `generar.ts` ya tenía la aritmética pero no la
  exportaba.
- **Por qué ahí y no en `lib/test/sync.ts`:** la aritmética de días con el tipo temporal de
  JavaScript es la **excepción consentida** de ese módulo, con su razonamiento escrito en la
  cabecera y su justificación frente al guardarraíl 10. Reimplementarla en el arnés la sacaría del
  único sitio donde está razonada, y la haría reaparecer por la puerta de atrás.
- `generar.ts` no estaba en `files_modified` del plan.

### 5. [Regla 2 — Funcionalidad faltante] Cuatro lectores más en el arnés

- `reservasDe`, `notificacionesDe`, `alertasLogicas` y `transicionesDe`. Sin ellos no hay forma de
  afirmar `disappeared_at`, ni contar alertas por `dedupe_key`, ni leer la bitácora, que son la
  aserción central de siete specs. `cabecerasDe` es el caso aparte: existe para que la prueba del
  `304` no se compruebe a sí misma.

### 6. [Método] El señuelo del `304` no es "quitar la rama"

- Documentado arriba, señuelo 5. Quitar el `if (res.status === 304)` a secas produce un fallo de
  transporte, no una cancelación adelantada. El señuelo que reproduce el fallo descrito por el plan
  es el bug plausible: reconstruir la lectura a partir de las reservas vivas.

### 7. [Regla 1 — Bug] Un test intermitente del plan 03-08 bloqueaba el criterio de verificación

- **Encontrado en:** la corrida final de `npm run test:integration`, con el criterio de aceptación
  que exige la suite completa en verde.
- **Síntoma:** `sync-dispatcher.integration.test.ts`, aserción 6 de la cadencia. Falló en una
  corrida y pasó en la siguiente, sin ningún cambio de por medio.
- **Causa medida:** la aserción calculaba la espera como
  `next_sync_at − last_attempt_at`. `next_sync_at` lo escribe el RPC con `now() + 30 minutes` (reloj
  de la base) y `last_attempt_at` con `p_fetched_at`, que es una marca tomada por el **worker en
  JavaScript antes del fetch**. La resta no mide 30 minutos: mide 30 más la latencia del fetch más
  la deriva entre los dos relojes. Y el margen de la aserción es **exactamente cero**, porque
  `peorCaso = espera + 1 <= 31` exige `espera <= 30`. Deriva medida en este equipo:

  ```
  js  = 2026-09-03T01:34:45.580Z
  db  = 2026-09-03T01:34:45.736Z      ← el contenedor va 156 ms por delante
  ```

  Con ese signo, `espera = 30.0026` y `peorCaso = 31.0026 > 31`. Con el signo contrario, verde. Es
  un flake de reloj de Docker Desktop, no del código de sincronización.
- **Arreglo:** el origen pasa a ser `feed_sync_runs.finished_at`, que es `now()` de **la misma
  transacción** que escribe `next_sync_at`. La resta es entonces el intervalo programado y nada más,
  sin reloj de por medio, que es además lo que la aserción decía medir ("aritmética sobre
  `next_sync_at`, no reloj real"). El rango que la aserción admite sigue siendo `(29.5, 30]`, así
  que no se relajó nada: se quitó el ruido.
- **Verificado:** tres corridas seguidas del archivo en verde, y la suite completa en verde.
- Es un archivo de otro plan, y se toca porque bloquea el criterio de verificación de este.

## Verificación

| Comprobación | Resultado |
|---|---|
| `npm run test:integration` | **101 pasados** (77 previos + 24 nuevos), 10 archivos |
| `npm run test:unit` | 392 pasados, 24 archivos |
| `npm run db:test` (pgTAP) | 112 aserciones, `Result: PASS` |
| `npx tsc --noEmit` | limpio |
| `npm run ci:arch` | `check-service-role: OK` |
| Estado de la base tras los ocho señuelos | 0 feeds, 0 notificaciones, 39 apartamentos, 3 `cron.job` activos |

`npm run lint` tiene **tres errores preexistentes** en `e2e/fixtures.ts` y un aviso en
`aseador.schema.test.ts`, ninguno introducido por este plan. Quedan en `deferred-items.md`.

## Known Stubs

Ninguno. Los dos archivos son tests y no hay ningún dato mockeado: el cuerpo lo sirve un servidor
HTTP real, el `fetch` lo hace el route handler real, y las fechas, contadores y notificaciones salen
de la base real.

## Threat Flags

Ninguna. Este plan no añade superficie: los dos archivos son specs y la ampliación de `lib/test/`
está exceptuada por directorio en los guardarraíles 5, 7 y 8, con `ci:arch` en verde. `cabecerasDe`
devuelve una **copia** de las cabeceras de la petición entrante al servidor local del test; nunca la
dirección del feed, que sigue sin salir del arnés por ningún valor de retorno.

## Threat Register cubierto

| Threat ID | Cómo queda cubierto |
|---|---|
| T-03-80 | Aserciones 9 y 10 con fechas relativas, más el señuelo 1 que muestra el aseo de HOY cancelado |
| T-03-81 | Aserción 7 con cuatro corridas encadenadas y control de `If-None-Match`, más el señuelo 5 |
| T-03-82 | Aserción 2 (el aseo `en_curso` sobrevive) más la bitácora de la 14 con `actor_id` nulo |
| T-03-83 | Aserción 4 con cero alertas de feed, más el señuelo 8 que mide la tormenta en 3 y la extrapola a 34 |
| T-03-84 | Aserción 11 con cero notificaciones de extensión sobre el feed real, más el señuelo 6 |
| T-03-85 | **Aceptado.** Hueco residual declarado arriba y anotado en `deferred-items.md` |

## Commits

| Hash | Mensaje |
|---|---|
| `4bd99ba` | `test(03-09): criterio 4, el diff destructivo con sus cuatro candados` |
| `5ae9edb` | `test(03-09): criterio 5, las cinco alertas y la separacion urgente/sospechoso` |
| `54eb43a` | `docs(03-09): resumen de los criterios 4 y 5 medidos entre corridas` |
| `5629ff1` | `fix(03-09): la cadencia se mide contra finished_at, no contra last_attempt_at` |

## Self-Check: PASSED

Los seis archivos que este resumen nombra existen en disco y los cuatro commits están en el
historial de la rama del worktree. Árbol de trabajo limpio, sin archivos sin seguir y sin borrados
en ningún commit (`git diff --diff-filter=D 84bd806 HEAD` vacío). Suite de integración completa en
verde tras el último commit: **101 pasados, 10 archivos**.
