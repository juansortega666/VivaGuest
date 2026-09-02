---
phase: 03-motor-de-sincronizaci-n-ical
plan: 05
subsystem: database
tags: [ical, reconcile, cancelacion, needs_review, notificaciones, dedupe, extension-sospechosa, pgtap]

requires:
  - phase: 01-fundaciones-de-datos-y-seguridad
    provides: "tg_cleanings_snapshot() con su maquina de estados, tg_cleanings_log_transition(), los dos indices unicos parciales de cleanings, cl_pendiente_shape, cl_unmanaged_is_inert, public.notifications con notifications_dedupe_idx, y today_bog()"
  - phase: 03-motor-de-sincronizaci-n-ical
    plan: 03
    provides: "migracion 11: feed_sync_runs con cleanings_cancelled y reviews_flagged, calendar_reservations.ends_on_anterior, cal_res_sin_descripcion"
  - phase: 03-motor-de-sincronizaci-n-ical
    plan: 04
    provides: "migracion 12: sync_feed_apply() con los pasos (a) a (d), (f) e (i), y la firma de SEIS parametros que esta migracion repite literal"
provides:
  - "public.sync_feed_apply() COMPLETA: pasos (e), (g) y (h) anadidos por create or replace sobre la definicion de la 12"
  - "los CUATRO candados de la cancelacion, cada uno con su asercion y su senuelo medido"
  - "la guarda de colapso sobre RESERVAS CLASIFICADAS dentro del RPC, que el plan atribuia al worker"
  - "cancel_reason y review_reason como dos listas cerradas de literales, nunca texto libre"
  - "notificaciones por admin activo con dedupe_key, y el cubo de tiempo solo en la alerta de estado continuo"
  - "05_sync.test.sql ampliado a 50 aserciones; las 24 nuevas (27-50) verdes"
  - "una asercion ESTRUCTURAL sobre el cuerpo de la funcion, que defiende la unica capa que ninguna asercion de comportamiento puede defender"
affects: [03-06, 03-07, 03-08, 03-09, 03-10]

tech-stack:
  added: []
  patterns:
    - "Aditivo primero, destructivo al final, y una repesca aditiva DESPUES del destructivo"
    - "El candado de las dos ausencias se captura del ESTADO de la base antes del paso (b), no comparando marcas de tiempo: dentro de una transaccion now() es constante"
    - "Toda asercion de un candado lleva, en la misma cadena comparada, un aseo hermano de la misma corrida que si se cancelo"
    - "Asercion estructural sobre pg_get_functiondef con los comentarios retirados, comparando RAZONES y no numeros magicos"
    - "Toda subconsulta escalar de un pgTAP va agregada: una que devuelve dos filas da ERROR y aborta el archivo en vez de dar not ok"
    - "Medir un pgTAP exige comprobar ok + not ok = el numero del plan, no solo contar not ok"

key-files:
  created:
    - supabase/migrations/20260902234500_13_sync_reconcile.sql
    - .planning/phases/03-motor-de-sincronizaci-n-ical/03-05-SUMMARY.md
  modified:
    - supabase/tests/05_sync.test.sql

key-decisions:
  - "EL PISO DEL FEED NO SE APLICA AL CASO DE LA RESERVA MOVIDA. Aplicarlo rompe el caso mas comun: una reserva que se mueve hacia adelante y es la unica del feed pone el piso en su fecha NUEVA y el aseo viejo, que por definicion esta antes, no se cancelaria nunca. El candado 4 distingue cancelada de fuera-de-la-ventana, y en el caso movido la reserva esta en la corrida diciendo su fecha nueva"
  - "La guarda de colapso se implementa AQUI y no solo en el worker del plan 03-06: con reservation_count = 0 no se marca ausencia, no se cancela y no se detecta extension. Sin ella, esta migracion entra en produccion siendo una bomba"
  - "Un aseo `completada` cuya reserva desaparece NO se marca para revision. Es el caso normal del movimiento de la ventana y marcarlo convertiria la rutina en una avalancha de alertas sobre trabajo terminado"
  - "La fila informativa de gestion externa se REPROGRAMA a la fecha nueva en vez de quedarse anclada: no se puede cancelar por CHECK y no tiene nada que preservar"
  - "El motivo del payload de las notificaciones se escribe como literal en el insert y NO se lee de vuelta de cancel_reason ni de review_reason: esas dos columnas son editables por el admin en la Fase 4 y leerlas abriria una ruta de texto libre hacia el payload"
  - "Las notificaciones se emiten para TODOS los candidatos vivos en revision, no solo los marcados en esta corrida: quien impide la repeticion es dedupe_key, y si el anti-duplicado viviera en el select la propiedad no estaria probada por nada"

requirements-completed: [SYNC-04, SYNC-05, SYNC-08]

duration: 55min
completed: 2026-09-02
---

# Fase 3 Plan 05: el reconcile destructivo — Resumen

**El feed real, pasado por el normalizador y por el RPC completo: la reserva que termina HOY desaparece dos corridas seguidas y su aseo NO se cancela —queda marcado y notificado—; la reserva 5 se mueve y su aseo viejo se cancela y nace uno nuevo sin confirmar; la extensión mal creada del 2026-12-25 se marca y alerta; el turnover real del 2026-10-10 sigue siendo urgente y produce CERO alertas; y cuando los 15 eventos dejan de clasificar, el motor no cancela ni una sola fila.**

## Performance

- **Duración:** 55 min
- **Tareas:** 3 de 3
- **Archivos creados:** 1 (más este resumen)
- **Archivos modificados:** 1

## Commits por tarea

| Tarea | Commit | Mensaje |
|---|---|---|
| 1 — paso (e) | `9d63708` | `feat(03-05)`: paso (e), el reconcile destructivo con los cuatro candados |
| 2 — pasos (g) y (h) | `abb4396` | `feat(03-05)`: extensión mal creada y notificaciones dedup |
| 3 — pgTAP | `e8060a2` | `test(03-05)`: veinticuatro aserciones del reconcile destructivo, `plan(50)` |

Las tareas 1 y 2 tocan el mismo archivo y se commitearon como dos incrementos
reales: la versión de la tarea 1 se aplicó a la base, se midió con un escenario
de tres corridas y se comprobó que `db:advisors`, `db:lint` y `ci:arch` quedaban
verdes ANTES de escribir la 2. No es un commit partido a posteriori.

---

## El resultado que importa: las aserciones, POR IDENTIFICADOR

Medido con `pg_prove`, que es lo que corre `supabase test db`:

```
supabase/tests/05_sync.test.sql   (Wstat: 0 Tests: 50 Failed: 6)
  Failed tests:  4-9
Files=6, Tests=97
```

### Las veinticuatro nuevas, todas VERDES

| ID | Aserción | Qué falla si se rompe |
|---|---|---|
| 27 | La PRIMERA ausencia marca `disappeared_at` y no cancela | una lectura mala cancela los aseos |
| 28 | La SEGUNDA ausencia consecutiva sí cancela, y solo ese aseo | el reconcile no reconcilia nada |
| 29 | **Control:** `cleanings_cancelled` va `0, 0, 1` en las tres corridas | todas las de abajo pasan con el reconcile muerto |
| 30 | La cancelación queda en `cleaning_state_transitions` con `actor_id` NULL | no se distingue "lo canceló el sync" de "lo canceló el admin" |
| 31 | Un aseo `en_curso` sobrevive; su hermano `pendiente` de la misma corrida sí se cancela | T-03-42: la aseadora ya fue y no se le paga |
| 32 | Un aseo `manual` sobrevive intacto, con su aseadora; el `ical` hermano sí se cancela | T-03-43: el sync destruye trabajo humano |
| 33 | Los aseos de HOY y de MAÑANA sobreviven; el de `+5` de la misma corrida no | T-03-41: se cancela el aseo de hoy con la aseadora en camino |
| 34 | Los dos protegidos quedan marcados, contados una vez y notificados una vez por admin | la alerta se pierde, o se repite 48 veces al día |
| 35 | Lo que quedó bajo el piso sobrevive; el de `+30`, por encima, no | T-03-40: cancelación masiva cuando la ventana avanza |
| 36 | `min_ends_on` registra el piso de cada corrida y el salto de la ventana | la instrumentación que contesta la pregunta abierta no existe |
| 37 | Un aseo `completada` sobrevive intacto y **no** se marca | avalancha de alertas sobre trabajo terminado |
| 38 | `throws_ok` `P0001` sobre ese mismo aseo `completada` | la segunda capa de T-03-42 |
| 39 | Reserva movida: viejo `cancelada/reserva_movida`, nuevo sin confirmar | el aseo nuevo entra en firme para una fecha que nadie confirmó |
| 40 | `lives_ok`: mover una reserva con el aseo viejo en curso no lanza `23505` | la corrida ENTERA del feed aborta, no solo ese aseo |
| 41 | El aseo nuevo nace **huérfano** cuando el viejo sobrevive | T-03-46, y la alternativa borra el vínculo de un pago |
| 42 | El RPC cancela y recrea el mismo día; el vivo apunta a la reserva NUEVA | un aseo vivo apuntando a una reserva que se fue |
| 43 | La extensión mal creada marca el aseo de la fecha de unión | SYNC-08 no existe |
| 44 | La alerta se encola una vez por admin ACTIVO, ninguna para el desactivado | quien ya no trabaja aquí sigue recibiendo la operación |
| 45 | `needs_review` es pegajoso y no se vuelve a contar | la alerta desaparece antes de que nadie la atienda |
| 46 | **EL TURNOVER SANO ES URGENTE Y NO ES SOSPECHOSO: cero alertas** | T-03-44, el caso más común del negocio se vuelve ruido |
| 47 | Un feed cuyo formato colapsa no cancela ni un aseo | los 15 aseos del apartamento se van el día que Airbnb cambie una cadena |
| 48 | El colapso encola UNA alerta por admin, con cubo diario | el colapso es silencioso, o alerta cada media hora |
| 49 | SYNC-11: la fila informativa se reprograma y sigue inerte | el calendario informativo miente para siempre |
| 50 | **ESTRUCTURAL:** toda cancelación lleva sus candados, cero borrados, `cancel_reason` es lista cerrada | la única defensa de la capa redundante |

### Las que siguen en rojo, y por qué. **Son las MISMAS seis: 4 5 6 7 8 9**

| ID | Aserción | Motivo |
|---|---|---|
| 4 | job `dispatch-feed-syncs` activo | migración siguiente (plan 03-06) |
| 5 | job `purge-cron-history` activo | migración siguiente (plan 03-06) |
| 6 | job `feed-health-watchdog` activo | migración siguiente (plan 03-07) |
| 7 | las **tres** funciones del motor existen | faltan `dispatch_feed_syncs` y `feed_health_watchdog` |
| 8 | las **tres** son `security definer` con `search_path` vacío | ídem |
| 9 | ninguna de las **tres** es ejecutable por `anon` | ídem |

**Nota de renumeración, y hay que decirla porque el archivo de test la contradecía:**
el comentario que dejó el plan 03-04 atribuye estas seis a "las migraciones 13 y
14". El número 13 lo tomó **este** plan, así que los tres jobs y las dos funciones
que faltan son de las migraciones **siguientes**. La lista de identificadores en
rojo no cambia; la atribución sí, y quedó corregida en la cabecera del archivo.

Las aserciones 7, 8 y 9 son COLECTIVAS sobre las tres funciones del motor y su
diagnóstico sigue nombrando únicamente a `dispatch_feed_syncs` y
`feed_health_watchdog`. `sync_feed_apply` no aparece: esa ausencia, y no el
total, es la evidencia de que esta migración dejó la función bien formada.

### Los otros cuatro archivos pgTAP, por archivo

| Archivo | plan | ok | not ok |
|---|---|---|---|
| `00_rls_aseos` | 1..16 | 16 | 0 |
| `01_invariantes` | 1..11 | 11 | 0 |
| `02_guardarrailes` | 1..10 | 10 | 0 |
| `03_seed` | 1..5 | 5 | 0 |
| `04_storage` | 1..5 | 5 | 0 |
| **suma** | | **47** | **0** |

Sin mover ninguno. Corrida completa: `Files=6, Tests=97` (47 + 50).

---

## EL HALLAZGO QUE INVALIDÓ MI PROPIO INSTRUMENTO, otra vez

El plan 03-04 descubrió que `psql` sin `-A -t` hacía que `grep '^not ok'`
devolviera cero con el archivo entero en rojo. **Este plan encontró la segunda
mitad del mismo agujero, y la encontró porque un señuelo se comportó raro.**

Al medir el señuelo S6 (quitar las dos capas de estado del `where`), el conteo
dio **7 `not ok`** en vez de 6. Un solo fallo nuevo: parecía un resultado limpio
y pequeño. Lo era todo menos eso:

```
--- plan declarado: 50   corridas: 36   ok: 29   not ok: 7
--- !!! ABORTO: solo corrieron 36 de 50.
--- primer error: ERROR:  transicion_invalida
--- ultima asercion que corrio: ok 36
```

**Catorce aserciones no llegaron a medirse.** El señuelo hacía que el RPC
intentara `completada -> cancelada`, el trigger lanzaba `P0001` dentro de un
bloque anónimo, la transacción se abortaba y el archivo dejaba de imprimir TAP.
Un archivo muerto a mitad produce **menos** rojos que uno sano, así que
**un conteo bajo puede ser una mejora o un incendio, y contar no los distingue.**

La comprobación correcta es `ok + not ok = el número del plan`. Está ahora en el
runner y escrita en la cabecera de `05_sync.test.sql`, que es donde la va a leer
el plan siguiente.

### Y la segunda forma del mismo incendio, en mis propias aserciones

El señuelo S8 hizo caer otra vez el archivo a mitad, por un motivo distinto: la
aserción 48 leía el motivo de la notificación con una **subconsulta escalar**
(`select distinct payload ->> 'motivo' ...`). Con la guarda de colapso rota
aparecían además alertas de revisión sobre el mismo apartamento, la subconsulta
devolvía dos filas, y el resultado **no era `not ok`**: era
`ERROR: more than one row returned by a subquery used as an expression`, que
aborta y mata las aserciones 49 y 50.

Es la misma clase de fallo que el `min(uuid)` del plan 03-04. **Corregido en las
seis subconsultas escalares del bloque nuevo**, todas agregadas ahora con
`string_agg` o `count`, incluso donde hoy solo puede haber una fila: así una fila
de más aparece en el valor comparado en vez de matar el archivo. Con la 48
endurecida, S8 vuelve a fallar limpiamente (`50 de 50 corridas`, rojos `47` y
`48`).

---

## Los señuelos, medidos uno por uno

Todos aplicados al código real, cargados en la base, medidos con el instrumento
corregido, y revertidos. La columna "corridas" es la comprobación anti-aborto.

| Señuelo | corridas | ids rojos NUEVOS | Qué demostró |
|---|---|---|---|
| **S1** quitar de R2 "se movió o desapareció en esta corrida" | 50/50 | **46**, 33, 34 | el turnover sano se vuelve extensión sospechosa |
| **S2** quitar el candado del piso del feed | 50/50 | **35**, 50 | los aseos bajo el piso se cancelan en bloque |
| **S3** quitar solo `and c.started_at is null` | 50/50 | **50** (y solo esa) | la redundancia medida: ninguna aserción de comportamiento cae |
| **S4** quitar `and c.origin = 'ical'` | 50/50 | **32** | el `repaso` manual de la admin se cancela |
| **S5** quitar solo `and c.state = 'pendiente'` | 50/50 | **50** (y solo esa) | simétrico a S3: la otra capa sigue protegiendo |
| **S6** quitar LAS DOS capas de estado | **36/50** | **31**, y el archivo ABORTA | el aseo en curso se cancela, y el trigger lanza `P0001` |
| **S7** quitar la ventana protegida | 50/50 | **33**, 34 | los aseos de HOY y de MAÑANA se cancelan |
| **S8** guarda de colapso sobre EVENTOS en vez de reservas | 50/50 | **47**, 48 | el feed que cambia de formato marca todo como ausente |
| **S9** quitar el candado de las dos ausencias | 50/50 | **24**, 27, 29, 34 | la primera lectura que no ve la reserva ya cancela |

### El diagnóstico de S1, que es el que decide el plan

```
not ok 46 - SYNC-07 un turnover del mismo día sano es urgente y NO es una
            extensión sospechosa: cero alertas
#         have: {"6=true,9=false",1,2,2,1}
#         want: {"6=true,9=false",0,0,0,0}
```

Dos reservas vivas y sin cambios, el checkout de una es el checkin de la otra:
con R2 mutilada aparecen **una marca de revisión, dos notificaciones de extensión
y un `reviews_flagged`**. Sobre el feed real eso es una falsa alarma permanente
en el 2026-10-10, que es el caso más común del negocio.

Y **arrastra la 33 y la 34**, que no lo esperaba: la fixture de la ventana
protegida trae un turnover incidental (`d4J` termina donde `d4K` empieza) y el R2
roto lo marca también. No es ruido, es la misma propiedad medida dos veces sobre
fixtures distintas.

### El diagnóstico de S2

```
not ok 35 - ...el piso del feed salva todo lo que quedó por detrás de la ventana
#         have: 6=cancelada/false/-,12=cancelada/false/-,24=pendiente/false/-,30=cancelada/false/-
#         want: 6=pendiente/true/reserva_desaparecida_bajo_piso,12=pendiente/true/...,24=...,30=cancelada/false/-
```

La ventana del proveedor avanza —su comportamiento normal— y **los dos aseos que
quedaron detrás se cancelan**. El de `+30`, que está por encima del piso, se
cancela en los dos casos: es el control que demuestra que el reconcile seguía
vivo y que lo único que cambió fue el candado.

### S3 y S5: LA REDUNDANCIA MEDIDA, y por qué existe la aserción 50

`cl_pendiente_shape` (migración 04) exige `started_at is null` cuando el estado
es `pendiente`. **Las dos condiciones son co-implicadas**, así que:

- quitar **solo** `started_at is null` → **ninguna** aserción de comportamiento cae;
- quitar **solo** `state = 'pendiente'` → **ninguna** aserción de comportamiento cae;
- quitar **las dos** → cae la 31, y además el archivo aborta con `P0001`.

Es exactamente el falso verde que esta fase lleva cuatro planes catalogando: dos
capas de defensa que se tapan mutuamente y ninguna prueba que note que una
desapareció. **La única defensa posible es leer el cuerpo de la función**, y por
eso existe la aserción 50.

**Su primera versión también era un falso verde.** Preguntaba `> 0` por cada
candado, y con S3 aplicado seguía en VERDE porque la misma cadena sobrevivía en
el `where` de la cancelación por movimiento. `> 0` mide "existe en algún sitio",
que no es la propiedad. La versión final compara **razones**:

```
ocurrencias('c.state = ''pendiente''')  = ocurrencias('state = ''cancelada''')
ocurrencias('c.started_at is null')     = ocurrencias('state = ''cancelada''')
ocurrencias('cancel_reason = ''')       = ocurrencias('state = ''cancelada''')
ocurrencias('state = ''cancelada''')    > 0            <- control positivo
```

Toda cancelación lleva todos sus candados. Añadir una tercera sin ellos rompe la
igualdad; añadirla con ellos la mantiene sin tocar el archivo de test. Y el
último elemento es imprescindible: sin él, borrar las dos cancelaciones dejaría
todas las igualdades en `0 = 0` y la aserción pasaría en verde sobre una función
que ya no cancela nada.

---

## Los ataques que el plan no pedía

### A1 — El criterio de la FASE de punta a punta, con el feed REAL y siete corridas

No es una fixture sintética: son los `.ics` del repo pasados por `normalizarIcs()`
del plan 03-02 y entregados tal cual al RPC completo.

| # | Payload | ev / res / desc | `min_ends_on` | creados | cancelados | marcados |
|---|---|---|---|---|---|---|
| 1 | `airbnb-real-anonimizado` | 15 / 15 / 0 | 2026-09-02 | 15 | 0 | 0 |
| 2 | el mismo, sin cambios | 15 / 15 / 0 | 2026-09-02 | 0 | 0 | 0 |
| 3 | `airbnb-real-una-menos` (se va la de HOY) | 14 / 14 / 0 | **2026-09-06** | 0 | **0** | 0 |
| 4 | la misma, 2ª ausencia | 14 / 14 / 0 | 2026-09-06 | 0 | **0** | **1** |
| 5 | `airbnb-real-movida` (la reserva 5 se mueve) | 15 / 15 / 0 | 2026-09-02 | 1 | 1 | 0 |
| 6 | `airbnb-extension-mal-creada` | 16 / 16 / 0 | 2026-09-02 | 2 | 1 | 1 |
| 7 | `airbnb-summary-desconocido` (colapso) | 3 / **0** / 3 | `null` | 0 | **0** | 0 |

**La corrida 4 es la catástrofe evitada, sobre datos reales.** La reserva que
termina el día de la captura desaparece por segunda vez consecutiva y su aseo del
2026-09-02 **no se cancela**: queda `pendiente`, con
`review_reason = reserva_desaparecida_ventana_protegida` y su notificación. Y hay
que decir que **dos candados independientes lo salvaron a la vez**: la ventana
protegida (`2026-09-02 <= hoy + 1`) y el piso del feed, que en esa corrida subió a
`2026-09-06` justo porque la reserva de hoy es la que se fue.

Estado final de los 18 aseos, con los tres hechos que importan:

```
2026-09-02 pendiente   needs_review  reserva_desaparecida_ventana_protegida
2026-09-27 cancelada   reserva_movida
2026-09-29 cancelada   reserva_movida
2026-10-10 pendiente   is_urgent = true      <- el turnover REAL, sin una sola alerta
2026-12-25 pendiente   needs_review  extension_sospechosa   (y urgente: es las dos cosas)
2026-12-27 pendiente
```

Los dos `cancelada` del 09-27 y del 09-29 son correctos y son la misma reserva
ida y vuelta: la fixture `movida` la lleva a 09-29 y la de extensión, que parte
del feed original, la devuelve a 09-27. Es cancelar y recrear el mismo día, dos
veces, sobre el feed real.

Las cinco notificaciones, con su clave:

| type | dedupe_key | motivo |
|---|---|---|
| `calendario_caido` | `fmt:<feed>:20260902` | `formato_desconocido` |
| `extension_sospechosa` | `ext:<aseo>` | `extension_sospechosa` |
| `aseo_cancelado` | `cancel:<aseo>` ×2 | `reserva_movida` |
| `aseo_cancelado` | `rev:<aseo>` | `reserva_desaparecida_no_cancelable` |

### A2 — Privacidad, sobre el feed real y con las notificaciones dentro

| Comprobación | Resultado |
|---|---|
| Reservas con descripción cruda persistida | **0** de 16 |
| `summary` que contenga la cadena del teléfono | **0** |
| Notificaciones con esa cadena en `body` o en `payload` | **0** |

Es la primera vez que la comprobación de privacidad se hace **después** de que
existan notificaciones, que son la superficie nueva de esta migración y la que
podría haber filtrado un trozo del feed a una pantalla.

### A3 — La lista de aceptación del plan, grep a grep

| Comprobación | Resultado |
|---|---|
| `delete from` de cualquier tipo | **0 ocurrencias** |
| asignación de `needs_review` al valor falso | **0 ocurrencias**, ni en código ni en comentario |
| función de fecha de sesión prohibida | **0 ocurrencias** |
| `state <>` / `state !=` | **0 ocurrencias** |
| `raw_description` | **1 ocurrencia, línea de comentario** que explica por qué NO se escribe |
| `insert into public.notifications` | **6**, y las **6** con `dedupe_key` y con `on conflict do nothing` |
| enum `notification_type` | **sin tocar**: `git diff` sobre los tres commits solo nombra dos archivos |
| `cancel_reason` | **2 asignaciones, 2 valores enumerados** (aserción 50) |

---

## Decisiones tomadas

### 1. El piso del feed NO se aplica al caso de la reserva movida

El plan enumera los cuatro candados sin distinguir el caso (a) del (b), y su
criterio de aceptación pide los cinco literales en "el `where` del `update` de
cancelación". Aplicar el piso a las **dos** cancelaciones rompe el caso más
común, y se descubrió razonándolo antes de escribirlo:

> una reserva que se mueve hacia adelante y es la única del feed pone `v_piso` en
> su fecha **nueva**. El aseo viejo está, por definición, **antes**. Con el piso
> aplicado, `scheduled_date >= v_piso` es falso y **el aseo viejo no se cancela
> jamás**: el apartamento acumula un aseo fantasma en cada movimiento.

El candado 4 existe para distinguir "la reserva se canceló" de "la reserva quedó
fuera de la ventana de observación". En el caso movido **la reserva está en la
corrida diciendo su fecha nueva**: no hay nada fuera de la ventana que explicar.
La asimetría está escrita en el cuerpo de la función y en la aserción 50, que por
eso exige el piso con `> 0` y los otros cuatro candados con la razón exacta.

### 2. La guarda de colapso se implementa aquí, no solo en el worker

El plan 03-04 la deja como pendiente del plan 03-06 y añade: *"es obligatoria
antes de que la migración 13 entre en producción"*. Escribir la migración 13 sin
ella la deja **entregada y armada**, dependiendo de que un plan futuro llegue a
tiempo. Se implementa aquí, y va sobre **reservas clasificadas**:

- `v_reconcile := (v_reservation_count > 0 and v_piso is not null)`;
- en falso: no se marca ausencia (paso b), no se cancela (e), no se detecta
  extensión (g). De una corrida en la que nada clasificó **no se aprende nada
  sobre ausencias**, y marcar la primera dejaría el terreno servido para que la
  siguiente cancele;
- y se emite **una** alerta de formato desconocido, con cubo diario.

Que mire reservas y no eventos es la diferencia entre atrapar el fallo y no
verlo: `lib/domain/ical-clasificar.ts` clasifica por la URL de detalle que viaja
en la descripción del evento, así que un cambio de esa cadena deja
`event_count = 15` intacto —una guarda por eventos no salta **nunca**— y
`reservation_count` en 0. Medido en el señuelo S8 y en la corrida 7 del feed
real.

### 3. Un aseo `completada` cuya reserva desaparece no se marca para revisión

El plan dice que todo candidato que no pase los candados recibe `needs_review` y
notificación. Aplicado literalmente, **el movimiento rutinario de la ventana del
proveedor marcaría todos los aseos ya ejecutados**: una reserva sale de la
ventana semanas después de que su aseo se hizo, y eso es el caso NORMAL, no una
anomalía. Con 34 apartamentos serían decenas de alertas por semana sobre trabajo
terminado, que es la forma más segura de que el admin deje de mirar la campana
(T-03-44).

Se marca lo que todavía es accionable: `state in ('pendiente', 'en_curso')`. La
aserción 37 lo fija, con el control positivo de que la ausencia sí se registró.

### 4. La fila informativa de gestión externa se reprograma

`cl_unmanaged_is_inert` exige `state is null`, así que una fila informativa no se
puede cancelar. Tratada como un aseo gestionado, el reconcile simplemente no
podría hacer nada con ella y **quedaría anclada para siempre en una fecha que la
reserva ya abandonó**: el calendario informativo de las cinco unidades externas
de la semilla mentiría. No tiene estado, ni aseadora, ni confirmación, ni
tarifas: no hay nada que preservar. Se le mueve `scheduled_date`, con un
`not exists` que evita el `23505` contra
`cleanings_one_active_per_property_date`. Aserción 49.

### 5. El motivo del payload es un literal del `insert`, no se lee de vuelta

La forma obvia era `payload -> 'motivo' = c.cancel_reason`. Se descartó: el
comentario de la migración 05 dice explícitamente que corregir un `cancel_reason`
es una escritura legítima del admin en la Fase 4. Leer esa columna de vuelta
abriría una ruta de **texto libre editable** hacia el `payload` de una
notificación, que es justo lo que T-03-45 prohíbe. Por eso hay cuatro `insert`
separados en vez de uno con un `case`: cada uno lleva su motivo escrito como
literal.

### 6. Las notificaciones se emiten para todos los candidatos, no solo los nuevos

Emitir solo para los recién marcados haría que `dedupe_key` no hiciera **nada** y
que la propiedad "una sola alerta por aseo" no estuviera probada por ninguna
aserción: el anti-duplicado viviría en un `where` y bastaría un cambio de orden
de los pasos para duplicarlas. Emitiendo para todos, quien impide la segunda fila
es `notifications_dedupe_idx`, y la aserción 34 lo mide con una cuarta corrida
que **vuelve a intentar** las mismas dos notificaciones: siguen siendo 4 filas
(2 aseos × 2 admins) con 2 claves.

### 7. La migración lleva prefijo de marca de tiempo

El plan la nombra `supabase/migrations/13_sync_reconcile.sql`. El repo lleva
prefijo desde la migración 01 y la CLI ordena por nombre de archivo. El archivo
es `20260902234500_13_sync_reconcile.sql`. Misma decisión que el plan 03-04.

---

## Desviaciones del plan

### Auto-corregidas

**1. [Regla 2 — Funcionalidad crítica] La guarda de colapso, dentro del RPC**

- **Encontrada durante:** tarea 1, al escribir el candado 1.
- **Problema:** el plan describe el candado 1 como "la corrida llegó hasta aquí",
  que es cierto pero insuficiente: el worker que decide eso todavía no existe, y
  el escenario que el propio `03-VALIDATION.md` marca como obligatorio —15
  eventos que clasifican todos `desconocido` ⇒ cero cancelaciones— no lo cubre
  ninguna guarda de transporte.
- **Arreglo:** `v_reconcile` sobre `v_reservation_count`, que apaga los pasos
  (b), (e) y (g), más la alerta de formato desconocido.
- **Aserciones:** 47 y 48. **Señuelo:** S8. **Commits:** `9d63708`, `abb4396`.

**2. [Regla 1 — Bug] El piso del feed aplicado al caso movido lo rompe**

- **Encontrada durante:** tarea 1, razonando el `where` antes de escribirlo.
- **Problema:** ver decisión 1. Aseo fantasma permanente en cada movimiento hacia
  adelante.
- **Arreglo:** el piso solo en la cancelación por desaparición, con el
  contraejemplo escrito en el cuerpo y en la aserción 50.
- **Commit:** `9d63708`.

**3. [Regla 2 — Funcionalidad crítica] Repesca aditiva tras el paso (e)**

- **Encontrada durante:** tarea 1.
- **Problema:** el paso (c) corre **antes** de que se cancele nada, así que un
  aseo que no pudo nacer porque su fecha o su reserva estaban ocupadas por una
  fila que el paso (e) acaba de cancelar seguiría faltando hasta la corrida
  siguiente: 30 minutos con el apartamento sin aseo agendado.
- **Arreglo:** repetir el `insert ... on conflict do nothing` del paso (c) al
  final del (e). Idempotente y sin coste cuando no hace falta.
- **Commit:** `9d63708`.

**4. [Regla 2 — Funcionalidad crítica] La reprogramación de la fila informativa**

- **Encontrada durante:** tarea 1. Ver decisión 4. **Aserción:** 49.
- **Commit:** `9d63708`.

**5. [Regla 1 — Bug] La aserción 4 del plan es INSATISFACIBLE tal como está escrita**

- **Encontrada durante:** tarea 3, diseñando las fixtures.
- **Problema:** el plan pide *"con `started_at` puesto, dos ausencias no cancelan:
  el aseo queda **pendiente**, con `needs_review = true`"*. **`cl_pendiente_shape`
  lo prohíbe**: exige `started_at is null` cuando el estado es `pendiente`. No
  existe ninguna fila válida en el schema que satisfaga el enunciado.
- **Arreglo:** la fixture usa `en_curso`, que es el estado real de un aseo con
  `started_at`. La aserción 31 mide la propiedad que el plan quería.
- **Consecuencia, y es la parte que importa:** de ahí salió la redundancia medida
  de S3/S5 y, con ella, la aserción estructural 50.
- **Commit:** `e8060a2`.

**6. [Regla 1 — Bug] Mi propio instrumento de medición mentía**

- **Encontrada durante:** tarea 3, midiendo S6.
- **Problema:** el runner contaba `not ok` sin comprobar que el archivo hubiera
  corrido entero. Un aborto a mitad produce **menos** rojos.
- **Arreglo:** comparar `ok + not ok` contra el plan declarado, y escribirlo en la
  cabecera del archivo de test.
- **Commit:** `e8060a2`.

**7. [Regla 1 — Bug] Seis subconsultas escalares mías podían abortar el archivo**

- **Encontrada durante:** tarea 3, midiendo S8.
- **Problema:** `select distinct payload ->> 'motivo' ...` devolvió dos filas y
  dio `ERROR` en vez de `not ok`, matando las aserciones 49 y 50.
- **Arreglo:** las seis agregadas con `string_agg` / `count`.
- **Commit:** `e8060a2`.

### Ninguna desviación de Regla 4

No hizo falta ninguna decisión arquitectónica fuera del plan. Ni tabla nueva, ni
columna nueva, ni valor nuevo en ningún enum.

---

## Gates de autenticación

Ninguno. El plan es DDL y pgTAP: sin red, sin rutas autenticadas.

---

## Verificación

| Comprobación | Resultado |
|---|---|
| `npx supabase db reset --local` | **OK**, trece migraciones aplicadas limpio |
| `npm run db:advisors` (`security --fail-on error`) | **`No issues found`**, 0 errores y 0 WARN |
| `npm run db:lint` | **`No schema errors found`** |
| `npm run ci:arch` | **OK**, 10 guardarraíles |
| `npm run db:types:check` | **diff vacío** (la firma no cambia) |
| `npx tsc --noEmit` | **OK** |
| `npm run test:unit` | **20 archivos, 352 tests** (sin cambio: no se toca dominio) |
| `npm run build` | **OK**, 9 rutas |
| `npm run db:test` | `Files=6, Tests=97`, **`Failed tests: 4-9`**, esperado |
| `05_sync.test.sql` | **50 corridas de 50**, 44 ok / 6 not ok, ids `4-9` |
| Los cuatro pgTAP previos, por archivo | **47 ok / 0 not ok** |
| Los nueve señuelos | **todos con su rojo esperado**, tabla arriba |
| Feed real, siete corridas de punta a punta | **tabla A1** |
| Semilla tras el reset y tras toda la suite | **39 apartamentos, 8 clusters, 5 informativas** |
| Los tres perfiles de desarrollo | **vivos**, con bcrypt y email confirmado |
| Residuo en la base tras la suite | 0 aseos, 0 reservas, 0 corridas, 0 notificaciones |
| `git diff --diff-filter=D` en los tres commits | **vacío**, ningún borrado |
| `STATE.md` / `ROADMAP.md` | **sin tocar**; los tres commits nombran solo dos archivos |

### El `db reset` volvió a ejercerse, y falló una vez

La primera corrida de `npx supabase db reset --local` de la verificación final
devolvió `{"_tag":"Error","error":{"code":"LegacyDbSetupError"}}` y dejó la base
vacía; la suite entera salió en rojo con `Bad plan. You planned N tests but ran
0`. **Es un fallo transitorio del contenedor, no del schema**: repetir el reset
sin cambiar nada lo aplicó limpio y la suite volvió a `Files=6, Tests=97`.

Merece quedar escrito porque el síntoma —cinco archivos pgTAP con `ran 0`— se
parece muchísimo a "una migración rompió el schema", y no lo es. **La señal que
los distingue es el `LegacyDbSetupError` en la salida del reset**, no el informe
de tests.

---

## Stubs conocidos

Ninguno por descuido. Lo que está deliberadamente fuera:

- **`dispatch_feed_syncs` y `feed_health_watchdog` no existen** y las aserciones
  4 a 9 siguen rojas por eso. Son de los planes 03-06 y 03-07.
- **`feed_sync_runs.outcome` siempre vale `'ok'`** en esta función, porque solo se
  la llama cuando hubo un cuerpo que diffear. Los otros cinco valores
  (`no_modificado`, `sin_cambios`, `transporte`, `colapso`, `error`) los escribe el
  worker del plan 03-06, fuera de esta transacción.
- **`notifications.url` se deja nula.** Las rutas del panel del admin son de la
  Fase 4; escribir una ruta que no existe sería un enlace roto en la campana.

## Threat Flags

Ninguno nuevo. `db advisors --type security` no reporta nada. La superficie nueva
—`public.notifications`— es una tabla de la Fase 1 con RLS, policy y grants ya
establecidos; esta función escribe en ella como `security definer` y no abre
ninguna ruta de red ni de cliente.

Los siete riesgos del registro del plan quedan mitigados y **verificados**:

| Threat ID | Mitigación | Evidencia |
|---|---|---|
| T-03-40 | Cuatro candados acumulativos, el piso derivado de la propia corrida | aserción 35 + señuelo S2, y la corrida 3-4 del feed real |
| T-03-41 | Ventana protegida `<= today_bog() + 1` | aserción 33 + señuelo S7; corrida 4 del feed real con el aseo de HOY |
| T-03-42 | `started_at is null` y `state = 'pendiente'`, más el trigger | aserciones 31, 37 y 38; señuelo S6, que además lanza `P0001` |
| T-03-43 | `origin = 'ical'` en el `where` | aserción 32 + señuelo S4, con la aseadora conservada |
| T-03-44 | R2 exige que la anterior se moviera o desapareciera; `dedupe_key` sin cubo | aserción 46 + señuelo S1; aserción 34 con la cuarta corrida |
| T-03-45 | `payload` con literales y contadores; nada del cuerpo ni la URL del feed | A2: 0 rastros del teléfono en notificaciones sobre el feed real |
| T-03-46 | El aseo nuevo nace con `reservation_id` nulo cuando el viejo sobrevive | aserciones 40 (`lives_ok`) y 41 |

---

## Lo que este plan NO cierra

1. **El colapso PARCIAL.** La guarda salta con `reservation_count = 0`. Si el
   proveedor rompiera el formato de solo la mitad de los eventos, la otra mitad
   sí clasificaría y sus reservas ausentes acabarían cancelándose. No se añadió
   una guarda por razón (del tipo "menos de la mitad de la corrida anterior")
   porque **sobrebloquea el caso legítimo**: la ventana que avanza baja el
   número de reservas de verdad, y una guarda por razón habría puesto en rojo la
   aserción 35. Le corresponde al worker del plan 03-06, que sí tiene las
   señales de transporte para distinguirlos. El riesgo residual es acotado:
   `ical-clasificar.ts` clasifica por una sola cadena, así que el fallo realista
   es total, no parcial.
2. **`needs_review` no se apaga cuando la causa desaparece.** Medido en la
   corrida 5 del feed real: la reserva del 2026-09-02 vuelve y su aseo conserva
   la marca. Es la decisión de diseño ("solo el admin lo apaga, en la Fase 4"),
   pero significa que el panel de la Fase 4 va a mostrar alertas cuya causa ya no
   existe y **necesita una acción de "resolver" desde el primer día**.
3. **La extensión sospechosa sin aseo en la fecha de unión no alerta.** Si un
   aseo manual ocupa esa fecha, o si es pasada, el paso (g) no encuentra fila que
   marcar y no emite nada. Es raro y conservador, pero es un hueco.
4. **La pregunta del piso sigue abierta**, y ahora con dos puntos de la serie: el
   feed real de hoy da `min_ends_on = 2026-09-02` y la fixture `una-menos` da
   `2026-09-06`. Hacen falta días de producción, no fixtures.
5. **La pregunta del `UID` sigue abierta.** Igual que en el plan 03-04.
6. **Concurrencia real.** Todo está medido con corridas secuenciales; el lease de
   `claimed_at` que impide dos corridas del mismo feed a la vez es del plan 03-06.
7. **Cómo se ve un bloqueo del propietario de verdad.** Sigue sin haber ni uno en
   el feed real. Lo cierra el checkpoint humano del plan 03-10.

---

## Notas para las waves siguientes

1. **`05_sync.test.sql` está en 6 `not ok`, ids `4 5 6 7 8 9`, sobre `plan(50)`.**
   Es la misma lista desde el plan 03-03. Compárense identificadores **y**
   compruébese que corrieron las 50.
2. **Medir un pgTAP exige `psql -qAtX` Y comprobar `ok + not ok = plan`.** Un
   aborto a mitad baja el conteo de rojos y parece una mejora. Medido en este
   plan con dos causas distintas: una excepción del trigger dentro de un bloque
   anónimo, y una subconsulta escalar con dos filas.
3. **La migración 14 hace `create or replace` sobre `sync_feed_apply` y tiene que
   repetir la firma de SEIS parámetros** y el par `revoke`/`grant`. Sigue siendo
   la nota 3 y 4 del plan 03-04, sin cambios.
4. **El worker del plan 03-06 NO debe llamar a este RPC en un `304`, en un error
   de transporte ni cuando su propia guarda de colapso salte.** Toda la seguridad
   del candado 1 depende de eso: `disappeared_at` solo lo puede tocar esta
   función, y solo cuando hubo un cuerpo real que diffear.
5. **El RPC ya tiene su propia guarda de colapso**, sobre `reservation_count`. La
   del worker no la sustituye: la del worker mira el transporte (cuerpo vacío,
   HTML con 200, truncado) y esta mira la clasificación. Son complementarias y
   hay que escribir las dos.
6. **`feed_sync_runs.outcome` siempre sale `'ok'` de aquí.** Los otros cinco
   valores los escribe el worker en su propia transacción, después de que esta
   falle o de que no se llame.
7. **La Fase 4 necesita una acción de "resolver revisión"** desde el primer día,
   por la nota 2 de la sección anterior. Los seis valores de `review_reason` son
   una lista cerrada y sirven directamente como filtro del panel.
8. **La alerta de "aseo en revisión" viaja con `type = 'aseo_cancelado'` aunque el
   aseo NO se haya cancelado.** El enum no se toca por decisión del plan 03-03, y
   el discriminador real es `payload.motivo`
   (`reserva_desaparecida_no_cancelable`, `reserva_movida_no_cancelable`). **El
   panel de la Fase 4 tiene que leer `payload.motivo`, no el `type`**, o pintará
   como canceladas cosas que siguen vivas.
9. **`v_ya_ausentes` se captura ANTES del paso (b).** Cualquier reordenación de
   los pasos que mueva esa captura después rompe el candado 2 en silencio: la
   aserción 27 lo atrapa, y el señuelo S9 está medido.

---

## Self-Check: PASSED

- `supabase/migrations/20260902234500_13_sync_reconcile.sql` — **FOUND**
- `supabase/tests/05_sync.test.sql` — **FOUND**, `select plan(50)`
- Commit `9d63708` — **FOUND**
- Commit `abb4396` — **FOUND**
- Commit `e8060a2` — **FOUND**
- `STATE.md` y `ROADMAP.md` — **sin tocar**, verificado con `git diff --name-only`
  sobre los tres commits: solo dos archivos, los dos del plan
- Ningún borrado en ninguno de los tres commits — **verificado**,
  `git diff --diff-filter=D` vacío en los tres
- El archivo temporal usado para volcar el feed real normalizado
  (`lib/domain/ical-e2e-scratch.test.ts`) — **borrado**, `git status` limpio antes
  de commitear, y `npm run test:unit` de vuelta en 20 archivos / 352 tests
