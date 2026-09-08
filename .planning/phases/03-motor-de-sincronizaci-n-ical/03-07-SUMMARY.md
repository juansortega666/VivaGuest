---
phase: 03-motor-de-sincronizaci-n-ical
plan: 07
subsystem: data
tags: [pg_cron, pg_net, vault, scheduler, watchdog, anti-tormenta, poda, alertas]

requires:
  - phase: 03-motor-de-sincronizaci-n-ical
    plan: 03
    provides: "las extensiones pg_cron y pg_net fuera de public, y feed_sync_runs"
  - phase: 03-motor-de-sincronizaci-n-ical
    plan: 04
    provides: "sync_feed_apply() y su firma de seis parametros"
  - phase: 03-motor-de-sincronizaci-n-ical
    plan: 05
    provides: "el reconcile destructivo, la alerta de formato_desconocido del RPC y su dedupe_key con cubo diario"
  - phase: 03-motor-de-sincronizaci-n-ical
    plan: 06
    provides: "POST /api/cron/sync-feed, el guard del secreto compartido, y LA GUARDA DE COLAPSO cuyo traspaso este plan cierra"
  - phase: 01-fundaci-n-schema-y-rls
    plan: 07
    provides: "el hallazgo 5 de deferred-items: alter default privileges NO le quita EXECUTE a PUBLIC en PG 17.6"
provides:
  - "public.dispatch_feed_syncs(): el fan-out, una invocacion HTTP por feed vencido, con el secreto sacado de Vault"
  - "public.feed_health_watchdog(): la alerta por obsolescencia CON discriminador anti-tormenta y CON el colapso como condicion propia"
  - "los tres jobs de cron.job, con '* * * * *' y no '1 minute'"
  - "la poda diaria de cron.job_run_details, que pg_cron no hace sola"
  - "lib/domain/salud-sync.ts: estadoDeSincronizacion(), la unica capa que no es ciega a su propia muerte, para que la Fase 4 la pinte AL LEER"
  - "scripts/dev/sync-local.sh: el lazo completo ejercitable en local en un minuto, con trap que desagenda siempre"
  - "docs/despliegue-sync.md: los dos secretos de Vault como paso operativo por entorno"
  - "05_sync.test.sql en VERDE COMPLETO: plan(65), 0 not ok, y con el la suite pgTAP entera en 112 aserciones"
affects: [03-08, 03-09, 03-10, 04]

tech-stack:
  added: []
  patterns:
    - "El secreto compartido viaja por Vault porque cron.job.command es TEXTO PLANO, medido"
    - "El fallo de despliegue sin secretos es RUIDOSO a proposito: raise exception, no return 0"
    - "Discriminador anti-tormenta: obsoletos = activos y activos > 1 produce UNA alerta de job y suprime las de feed"
    - "El colapso de formato se alerta por CONDICION PROPIA sobre last_error, no esperando a consecutive_failures ni a la obsolescencia"
    - "El cubo de tiempo en la dedupe_key produce REPETICION; quien la limita es dead_alert_sent_at"
    - "La alerta de 'el job esta muerto' solo se puede computar AL LEER, fuera de la base"
    - "Toda funcion nueva de public lleva su par revoke/grant AL LADO de la definicion"

key-files:
  created:
    - supabase/migrations/20260902235500_14_sync_jobs.sql
    - lib/domain/salud-sync.ts
    - lib/domain/salud-sync.test.ts
    - scripts/dev/sync-local.sh
    - docs/despliegue-sync.md
    - .planning/phases/03-motor-de-sincronizaci-n-ical/03-07-SUMMARY.md
  modified:
    - supabase/tests/05_sync.test.sql
    - lib/database.types.ts

key-decisions:
  - "El tick del dispatcher se escribe '* * * * *' y NO '1 minute' como dice el research: medido, cron.schedule rechaza el literal de minutos con 'invalid schedule'. La sintaxis de intervalo de pg_cron 1.6.4 solo admite segundos"
  - "El watchdog alerta del colapso de formato por condicion propia sobre last_error, con su PROPIO anti-tormenta. Es el traspaso del plan 03-06 y sin el, el modo de fallo mas peligroso del producto es totalmente silencioso: medido, cero notificaciones de cualquier clase"
  - "Un feed colapsado queda EXCLUIDO de la alerta de obsolescencia. Responde bien; lo que cambio es el formato, y decirle al admin 'no responde' lo manda a revisar la conexion, que esta sana"
  - "La compuerta de 6 horas se prueba sobre dead_alert_sent_at y NO contando notificaciones: dentro de una transaccion now() esta congelado, el cubo horario no cambia y el indice unico bloquearia la repeticion aunque la compuerta estuviera rota"
  - "El anti-tormenta del colapso es simetrico al de la obsolescencia pero con motivo propio: si todos los feeds colapsan no cambiaron 34 formatos, cambio uno, y la alerta tiene que decir eso"
  - "La poda del historial se prueba corriendo el texto LEIDO de cron.job, no una copia escrita en el test: una copia se desincroniza del job el dia que alguien cambie la retencion"

patterns-established:
  - "Verificacion de un archivo pgTAP en tres comprobaciones y no una: plan declarado, ok + not ok = plan, y que la ULTIMA asercion del archivo aparezca impresa"
  - "Un escenario de watchdog fija el conjunto de feeds activos desactivandolos TODOS primero: el discriminador depende de una igualdad de conteos"
  - "Toda funcion pura de umbral recibe el instante actual por parametro y falla CERRADO ante una entrada ilegible"

requirements-completed: [SYNC-01, SYNC-09, SYNC-10]

duration: 95min
completed: 2026-09-03
---

# Fase 3 Plan 07: el scheduler, y la alerta que hacía falta — Resumen

**El lazo corre solo: `pg_cron` despachó un POST real, el worker creó quince reservas y
quince aseos, y el historial del job registró la corrida. Y el watchdog ya no se calla ante
el fallo más peligroso del producto: con el discriminador quitado, un feed cuyo formato
colapsa produce CERO notificaciones de cualquier clase. Con él, dos. Además,
`05_sync.test.sql` cierra en `plan(65)` con cero `not ok` —verificado por id y con el
archivo corriendo entero— y la suite pgTAP completa vuelve a verde por primera vez desde el
plan 03-01.**

## Performance

- **Duración:** 95 min
- **Tareas:** 3 de 3
- **Archivos creados:** 5 (más este resumen)
- **Archivos modificados:** 2

## Commits por tarea

| Tarea | Commit | Mensaje |
|---|---|---|
| 1 — migración 14 | `f16c233` | `feat(03-07)`: el dispatcher, el watchdog, los tres jobs y la poda del historial |
| 2 — RED | `741e7df` | `test(03-07)`: los nueve comportamientos del umbral de sincronización caída |
| 2 — GREEN | `7a3245c` | `feat(03-07)`: el umbral de sincronización caída que se computa AL LEER |
| 2 — script y doc | `1bab5b8` | `feat(03-07)`: el lazo local ejercitable en un minuto y el documento de despliegue |
| 3 — pgTAP y tipos | `c240fd0` | `test(03-07)`: 05_sync en verde completo, con el scheduler y su anti-tormenta |

---

## 1. Lo que de verdad se midió: el lazo completo, contra la base y el worker reales

No es una simulación ni un `perform` dentro de una transacción. Se levantó `next dev` sobre
el puerto 3011, un servidor de fixtures en `127.0.0.1:8899` sirviendo el `.ics` real
anonimizado del repo, y una fila real de `calendar_feeds` + `property_secrets` apuntando a
él. Después se corrió `scripts/dev/sync-local.sh 3011 40`.

### El historial del job

```
════ cron.job_run_details ════
succeeded | 1 row | 00:15:21
succeeded | 1 row | 00:15:11
succeeded | 1 row | 00:15:01
succeeded | 1 row | 00:14:51
```

### La respuesta HTTP y el estado del feed

```
════ net._http_response ════
1 | 200 | —

════ calendar_feeds ════
196a03de | ok | 200 | 0 fallos | last_success_at 00:14:53
```

### Y el efecto sobre el negocio

| Comprobación | Resultado |
|---|---|
| `calendar_reservations` | **15** |
| `cleanings` | **15** |
| `feed_sync_runs` | `ok`, 15 eventos, 15 reservas, **15 aseos creados** |
| `claimed_at` tras terminar | **nulo** (el lease se soltó) |
| `next_sync_at` tras terminar | **en el futuro** (la cadencia de 30 min se armó sola) |

**Cuatro corridas del dispatcher y UNA sola petición HTTP.** No es un fallo: es la cadencia
funcionando. La primera corrida despachó el feed vencido; las tres siguientes lo encontraron
con `next_sync_at` ya empujado media hora hacia adelante y despacharon cero. El tick de diez
segundos mira la cola diez veces; la cola solo tenía trabajo una vez.

---

## 2. Los dos señuelos obligatorios, medidos

### S1 — El secreto ausente: el fallo de despliegue es RUIDOSO

Lo mejor de esta medición es que **no hubo que provocarla**. El job agendado por la migración
corrió solo, un minuto después de aplicarla, contra una base sin secretos en Vault:

```
dispatch-feed-syncs | failed | ERROR:  faltan secretos de sync en vault: app_base_url / cron_shared_secret
                               CONTEXT:  PL/pgSQL function public.dispatch_feed_syncs() line 29 at RAISE
```

Ese es el `return_message` exacto, tal como quedó en `cron.job_run_details`. Es la
demostración de que el modo de fallo de un despliegue sin el paso operativo de Vault es
visible y no silencioso: `status = 'failed'` en cada tick, con el mensaje entero a la vista.
La alternativa educada —`return 0` y a otra cosa— dejaría el sync entero muerto sin ni una
señal.

La aserción 61 lo fija para siempre con `throws_ok` sobre el mensaje literal.

### S2 — La tormenta que el discriminador evita, y algo peor

Se reemplazó `feed_health_watchdog` por una versión sin el discriminador anti-tormenta —una
alerta por feed obsoleto, siempre— y se corrió el archivo entero.

```
1..65      ok: 61      not ok: 4      ids: 55 58 59 60
```

`61 + 4 = 65 = plan`, así que **no hubo aborto**: los cuatro rojos son rojos de verdad y las
otras 61 se midieron.

**La tormenta, con su número:**

```
not ok 55 - SYNC-10 con TODOS los feeds obsoletos se emite UNA alerta de job...
#         have: {0, 6, sin_respuesta, false}
#         want: {2, 0, todos_los_feeds_obsoletos, true}
```

**Seis notificaciones donde el diseño correcto produce dos**, y ninguna de las seis dice lo
que pasó. Seis son tres feeds activos obsoletos × dos admins activos; la aserción 56 cuenta
los tres feeds por separado para que el número no sea uno escrito a mano. Extrapolado al
catálogo real —34 feeds, 2 admins— el día que muera el scheduler el admin recibiría **68
notificaciones de "calendario caído" y ninguna que diga la verdad**.

**Y el hallazgo que importa más que la tormenta:**

```
not ok 58 - SYNC-06 el colapso de formato alerta por CONDICIÓN PROPIA sobre last_error...
#         have: {0, 0, <ninguno>, <ninguno>, false}
#         want: {2, 0, feed, cfd00001-…, true}
```

**Silencio absoluto.** Cero notificaciones de cualquier clase, con un feed que responde 200,
que está fresco, y cuyo formato se rompió entero. Es literalmente el modo de fallo más
peligroso del producto hecho dato: no se crean aseos, no se cancela ninguno —que es lo
correcto— y **nadie se entera**. Ese es el agujero que este plan cierra.

---

## 3. El traspaso del plan 03-06, cerrado

El resumen del plan anterior lo marcó como "el traspaso más importante de este resumen", y
merece explicarse porque es contraintuitivo:

1. La migración 13 (plan 03-05) **ya emite** una alerta de `formato_desconocido` cuando
   llegan eventos y ninguno clasifica como reserva. La aserción 48 la prueba y sigue verde.
2. El worker del plan 03-06 tiene una guarda de colapso que, en ese mismo caso, **no llama al
   RPC**. Es lo correcto: así ningún aseo pagado se cancela porque el proveedor cambió una
   cadena, y está medido con quince aseos vivos y cero cancelados.
3. **Consecuencia:** la alerta del RPC no se emite nunca por el camino real. La aserción 48
   prueba una ruta que el worker impide alcanzar en producción. Sigue siendo defensa en
   profundidad para cualquier otro llamador con `service_role`, pero por el camino que de
   verdad corre, nadie avisa.

La solución es la condición propia en el watchdog, sobre `last_error`. El detalle de diseño
que hace que la aserción 58 mida lo que dice medir: **`last_success_at` se pone FRESCO**. Así
la rama de obsolescencia no puede dispararse, y la única forma de que salga una alerta es que
el watchdog mire `last_error` por derecho propio. Con el feed además obsoleto, la aserción
habría pasado por el motivo equivocado.

Se reutiliza **la misma `dedupe_key`** que el RPC (`fmt:<feed>:<YYYYMMDD>`): si algún día los
dos caminos se dispararan para el mismo feed el mismo día, el índice único los colapsa en una
sola notificación en vez de duplicar el aviso.

---

## 4. Lo que esta fase puede detectar y lo que solo la Fase 4 puede

Es la pregunta más honesta del plan y la respuesta hay que dejarla escrita sin adornos.

**Ningún vigilante que corra dentro del scheduler puede ver la muerte del scheduler.** Si
`pg_cron` deja de correr, `feed_health_watchdog` tampoco corre. Subirlo un nivel no arregla
nada: un segundo job que vigile al primero muere con el primero.

| Condición | Quién la ve | Cuándo |
|---|---|---|
| Un feed concreto deja de responder | `feed_health_watchdog` | a las 3 h, 1 alerta con `property_id` |
| Un feed cambia de formato (colapso) | `feed_health_watchdog`, condición propia | en la hora siguiente |
| Todos los feeds obsoletos a la vez | `feed_health_watchdog`, anti-tormenta | a las 3 h, **1** alerta de job |
| Todos los feeds colapsados a la vez | `feed_health_watchdog`, anti-tormenta | en la hora siguiente, **1** alerta |
| El dispatcher corre y falla | `cron.job_run_details.status = 'failed'` | cada tick |
| **El scheduler dejó de correr** | **NADIE dentro de la base** | — |

La última fila es la que este plan **no puede** cerrar y no finge cerrar. La mitad que falta
la entrega `lib/domain/salud-sync.ts`, y la ejerce **el panel de la Fase 4, AL LEER**:

```sql
select max(last_success_at) from public.calendar_feeds where is_active;
```

Si el más reciente de todos tiene más de 3 horas, el panel pinta "sincronización caída". Se
dispara aunque no corra absolutamente nada dentro de la base, porque lo calcula la página que
el admin abre de todas formas. No es un vigilante: es una lectura, y por eso no puede ser
ciega a su propia caída.

**Hueco residual, declarado y no tapado:** si el admin no abre el panel, nadie se entera.
Para un producto que el admin mira varias veces al día es aceptable, y decirlo vale más que
fingir cobertura. Lo cerraría un dead man's switch externo pingado desde el dispatcher;
**queda como idea diferida, fuera del MVP.**

**Las dos capas no son redundantes:** el watchdog ve "el job corre y un feed falla", con
`property_id` y todo. La lectura ve "no corre nada", y no puede decir cuál feed porque no es
un feed. Coberturas distintas.

---

## 5. El estado de la suite

### `05_sync.test.sql` en verde completo

Verificado con el recorrido directo por `psql -qAtX` que la cabecera del propio archivo
prescribe, **no solo con el resumen de `pg_prove`**:

```
=== plan declarado ===   1..65
=== conteos ===          ok: 65     not ok: 0
=== ids en rojo ===      (ninguno)
=== última aserción ===  ok 65 - ninguna de las tres funciones ... ejecutable por authenticated
```

Las tres comprobaciones juntas son las que distinguen "verde" de "abortó pronto":

1. El plan declarado es 65.
2. `ok + not ok = 65 = plan`, así que ninguna sentencia abortó la transacción.
3. **La última línea impresa es la 65**, la última del archivo. Un archivo que revienta a
   mitad deja de imprimir TAP y produce MENOS rojos, que parece una mejora.

### La suite completa

| Archivo | Aserciones | `not ok` |
|---|---|---|
| `00_rls_aseos` | | 0 |
| `01_invariantes` | | 0 |
| `02_guardarrailes` | | 0 |
| `03_seed` | | 0 |
| `04_storage` | | 0 |
| **`05_sync`** | **65** | **0** |
| **TOTAL** | **112** | **0** |

**112 = 65 + 47.** Los cinco archivos previos suman exactamente los 47 de siempre: ninguno se
movió, ninguno se rompió. `npm run db:test` sale con código cero por primera vez desde el
plan 03-01.

---

## 6. Los tres instrumentos que se vigilaron, y el que casi miente

El prompt advertía de cinco formas conocidas. Cuatro se comprobaron activamente:

1. **`psql` sin `-AtX`.** El script de verificación las lleva siempre. Sin ellas, `grep '^not
   ok'` devuelve cero con el archivo entero en rojo.
2. **Contar rojos en vez de compararlos por id.** El señuelo de la tormenta produjo `4` rojos
   con ids `55 58 59 60`; el número solo no habría dicho cuáles.
3. **El aborto que produce MENOS rojos.** Comprobado en las dos corridas del señuelo:
   `61 + 4 = 65` y `65 + 0 = 65`. Ninguna abortó.
4. **`vitest run <archivo>` con exit 1 y cero aserciones.** Ocurrió, y está registrado abajo.

### El RED de la tarea 2 fue exactamente la cuarta forma

```
❯ lib/domain/salud-sync.test.ts (0 test)
Error: Cannot find module './salud-sync'
Test Files  1 failed (1)      Tests  no tests
```

**Salida 1 con CERO aserciones ejecutadas.** Es el rojo trivial de un módulo que aún no
existe, y se dejó registrado en el mensaje del commit `741e7df` en vez de venderlo como una
medición. El rojo con significado llegó en el paso siguiente: `1 failed | 8 passed (9)`, con
`1 + 8 = 9 = plan`.

---

## 7. Decisiones tomadas

### 1. `'* * * * *'` y no `'1 minute'` — corrección medida al research

`03-RESEARCH.md` escribe el tick del dispatcher como el literal de intervalo en minutos. Está
medido que eso **no aplica**:

```
select cron.schedule('x', '1 minute', 'select 1');
ERROR:  invalid schedule: 1 minute
HINT:   Use cron format (e.g. 5 4 * * *), or interval format '[1-59] seconds'
```

La sintaxis de intervalo de `pg_cron` 1.6.4 solo admite **segundos**. Escrito como lo dice el
research, la migración falla al aplicarse. La aserción 63 congela la expresión correcta, así
que nadie la reescribe de vuelta sin darse cuenta.

### 2. El feed colapsado queda excluido de la alerta de obsolescencia

El worker no refresca `last_success_at` cuando registra un colapso, así que a las tres horas
el mismo feed cumple **las dos** condiciones. Sin la exclusión el admin recibiría dos alertas
del mismo hecho diciendo cosas distintas, y una de ellas —"el calendario no responde"— lo
mandaría a revisar la conexión, que está perfectamente bien. La aserción 60 lo fija.

Se escribe con el operador de distinción y no con el de desigualdad: `last_error` es nulo en
el caso sano, y con el de desigualdad todos los feeds sanos-pero-obsoletos se caerían del
`where` en silencio.

### 3. La compuerta de 6 h se prueba sobre `dead_alert_sent_at`, no contando alertas

Es una trampa del arnés que costó ver. Dentro de una transacción `now()` está **congelado**,
así que la `dedupe_key` no cambia de cubo horario y el índice único parcial bloquearía la
repetición **aunque la compuerta estuviera rota**. Contar notificaciones no distingue un
mecanismo del otro.

Lo que sí los separa es `dead_alert_sent_at`: el watchdog solo la pisa sobre los feeds que
consideró elegibles. La aserción 54 mide las dos direcciones —a la hora no alerta y no mueve
la marca; a las siete alerta y la pisa— y sin la segunda mitad un watchdog que no alertara
nunca pasaría en verde.

### 4. La poda corre el texto LEÍDO de `cron.job`

La aserción 64 no escribe el `delete` a mano: lo lee de `cron.job.command` y lo ejecuta. Una
copia escrita en el test se desincroniza del job el día que alguien cambie la retención de 7
días, y el test seguiría en verde probando una poda que ya no es la que corre.

Y afirma **las dos direcciones**, con control positivo de que las dos filas existían antes.
Una poda con el signo al revés borraría exactamente lo contrario —el historial reciente, que
es el único que sirve— y "borró algo" no distingue los dos casos.

### 5. Un `replace` de más en `estadoDeSincronizacion`, encontrado por el test

El GREEN salió `1 failed | 8 passed`. La forma con espacio de Postgres,
`'2026-09-02 16:00:00+00'`, tiene un **desfase de dos dígitos**, y eso no es ISO 8601:
`Date.parse` devuelve `NaN`. Con la función fallando cerrado, esa forma se leía como **caída
con el sistema perfectamente sano** — una falsa alarma permanente en el panel de la Fase 4.
Solo apareció porque el test lleva las dos formas en que una marca llega desde la base.

---

## Desviaciones del plan

### 1. [Regla 1 — Bug] El tick del dispatcher, `'1 minute'` → `'* * * * *'`

- **Encontrado en:** Tarea 1, antes de escribir la migración.
- **Problema:** el plan y `03-RESEARCH.md` escriben `cron.schedule('dispatch-feed-syncs', '1
  minute', …)`. `pg_cron` 1.6.4 rechaza ese literal y la migración no aplica.
- **Arreglo:** expresión cron de cinco estrellas, con el `HINT` del error citado en el
  comentario y la aserción 63 congelándolo.
- **Archivos:** `supabase/migrations/20260902235500_14_sync_jobs.sql`, `supabase/tests/05_sync.test.sql`
- **Commits:** `f16c233`, `c240fd0`

### 2. [Regla 2 — Funcionalidad crítica faltante] El anti-tormenta del COLAPSO

- **Encontrado en:** Tarea 1, al escribir el bloque del colapso.
- **Problema:** el plan especifica el discriminador anti-tormenta solo para la obsolescencia.
  El colapso, añadido por el traspaso del plan 03-06, tenía el **mismo** problema y sin
  cubrir: si todos los feeds colapsan a la vez —que es exactamente el escenario que motiva la
  condición, el proveedor cambiando el formato para todo el mundo— saldría una alerta por
  feed. La tormenta reaparecía por la puerta nueva.
- **Arreglo:** discriminador simétrico con motivo propio, `todos_los_feeds_colapsados`, que
  dice la verdad: no cambiaron 34 formatos, cambió uno. Aserción 59.
- **Archivos:** `supabase/migrations/20260902235500_14_sync_jobs.sql`, `supabase/tests/05_sync.test.sql`
- **Commits:** `f16c233`, `c240fd0`

### 3. [Regla 2 — Funcionalidad crítica faltante] La exclusión mutua de las dos alertas

- **Encontrado en:** Tarea 1, razonando sobre qué escribe el worker.
- **Problema:** `registrarFalloDeSync` no refresca `last_success_at`, así que un feed en
  colapso permanente acaba cumpliendo también la condición de obsolescencia y recibiría dos
  alertas contradictorias del mismo hecho.
- **Arreglo:** el feed colapsado se excluye del `where` de la alerta de obsolescencia.
  Aserción 60.
- **Archivos:** `supabase/migrations/20260902235500_14_sync_jobs.sql`, `supabase/tests/05_sync.test.sql`
- **Commits:** `f16c233`, `c240fd0`

### 4. [Regla 1 — Bug] `Date.parse` y el desfase de dos dígitos de Postgres

- **Encontrado en:** Tarea 2, en el GREEN. Lo atrapó el test, no la revisión.
- **Problema:** `'2026-09-02 16:00:00+00'` con `+00` no es ISO 8601 y da `NaN`, que la función
  lee como caída. Falsa alarma permanente en el panel para cualquier ruta de lectura que
  entregue la forma de `psql`.
- **Arreglo:** normalizar también el desfase, `([+-]\d{2})$` → `$1:00`.
- **Archivos:** `lib/domain/salud-sync.ts`
- **Commit:** `7a3245c`

### 5. [Regla 3 — Bloqueante] Cuatro aserciones más de las nueve que pide el plan

- **Problema:** el plan enumera nueve aserciones nuevas. Escritas tal cual, cuatro
  propiedades quedaban sin defensa: el control del arnés (52), la compuerta de 6 h aislada
  (54), la medida de la tormenta (56) y las dos del colapso como condición propia y su
  anti-tormenta (58, 59), más la de `authenticated` (65).
- **Arreglo:** quince aserciones, `plan(50)` → `plan(65)`.
- **Archivos:** `supabase/tests/05_sync.test.sql`
- **Commit:** `c240fd0`

### 6. [Regla 2] Cabecera de `05_sync.test.sql` actualizada

- **Problema:** la cabecera declaraba que el archivo está en rojo a propósito con ids 4-9 y
  que "el plan 03-07 es el que devuelve la suite a verde". Dejarla así después de ponerlo en
  verde convertiría la documentación en una mentira, y el hábito de cinco planes —"seis
  rojos, todo normal"— pasaría a ocultar una regresión real.
- **Arreglo:** se añadió la fila final de la tabla de ids (ninguna), se invirtió el signo de
  la consecuencia operativa ("un `not ok` ya no es esperado, es una regresión") y se escribió
  arriba lo que el archivo **no** puede medir.
- **Archivos:** `supabase/tests/05_sync.test.sql`
- **Commit:** `c240fd0`

### 7. `CRON_SHARED_SECRET` añadido a `.env.local`

No es una desviación de código: `.env.local` está en `.gitignore` y no viaja. Se añadió
porque `sync-local.sh` lo necesita para sembrar Vault, y sin él la prueba en vivo del script
no se podía hacer. Queda anotado para quien reproduzca: **hay que añadirlo a `.env.local` a
mano**, copiándolo de `.env.example`.

---

## Verificación

| Comprobación | Resultado |
|---|---|
| `npx supabase db reset --local`, catorce migraciones | limpio |
| `npm run db:advisors` | `No issues found` |
| `npm run db:lint` | `No schema errors found` |
| `npm run ci:arch` | `check-service-role: OK` |
| `npx tsc --noEmit` | limpio |
| `npm run test:unit` | **392 pasan / 24 archivos** |
| `npm run build` | verde, `/api/cron/sync-feed` presente |
| **`npm run db:test`** | **112 aserciones, 0 `not ok`, 6 archivos** |
| `npm run db:types:check` | diff vacío |
| Semilla | **39 propiedades / 8 clusters / 5 informativas** |
| Perfiles dev | **3 vivos** |
| Los tres jobs en `cron.job` | activos, con `* * * * *`, `0 * * * *`, `17 4 * * *` |
| `has_function_privilege` sobre las tres funciones | `anon` **f**, `authenticated` **f** |
| Secreto literal en la migración | **cero ocurrencias** (solo el nombre en Vault y el de la cabecera) |
| Secreto real en `docs/despliegue-sync.md` o en el script | **cero ocurrencias** |
| `bash -n scripts/dev/sync-local.sh` | sin errores |
| Jobs locales tras un Ctrl-C durante la corrida | **0** |

### El trap del script, probado con una interrupción real

No se razonó: se mandó `SIGINT` al script con el job ya agendado y confirmado en `cron.job`.

```
→ desagendando 'sync-local-dispatch'
  jobs locales restantes: 0   (tiene que ser 0)
```

Es el aviso operativo que más importa de los tres: la base local es **compartida entre
worktrees**, y un job de diez segundos olvidado martillea el servidor de otra persona contra
un puerto que mañana ocupará otra cosa.

---

## Lo que este plan NO cierra

1. **Que el scheduler haya dejado de correr, dentro de la base.** No tiene solución ahí y no
   se finge. Ver la sección 4. La Fase 4 **tiene que** consumir `estadoDeSincronizacion` de
   `lib/domain/salud-sync.ts` para cerrarlo.
2. **El hueco de "el admin no abre el panel".** Diferido a un dead man's switch externo, fuera
   del MVP.
3. **El colapso PARCIAL**, igual que lo dejaron 03-05 y 03-06. La guarda salta con cero
   reservas; si el proveedor rompiera la mitad de los eventos, la otra mitad clasificaría.
4. **Un feed que pasa a tener solo bloqueos del propietario se lee como colapso**, y ahora
   además **alerta**. Falla cerrado —no cancela nada— pero produce una alerta falsa de
   formato. La bitácora lo distingue (`block_count > 0` y `unknown_count = 0` frente a
   `unknown_count = 15` del colapso real); el watchdog, que solo mira `last_error`, no.
5. **Concurrencia real del dispatcher.** El lease y el `for update skip locked` están
   probados con llamadas secuenciales. Dos conexiones simultáneas de verdad, no.
6. **La poda nunca ha corrido en producción.** Está probada ejecutando su texto exacto, no
   esperando a las 4:17.
7. **Las preguntas del `UID` y del piso siguen abiertas.** Necesitan días de producción, y
   ahora por fin hay un scheduler que los va a producir.

---

## Notas para las waves siguientes

1. **Fase 4, la costura obligatoria:** el panel llama a `estadoDeSincronizacion(maxLastSuccessAt,
   Date.now())` con el resultado de `select max(last_success_at) from public.calendar_feeds
   where is_active`. Si devuelve `'caida'`, pinta la alerta de sincronización con la misma
   jerarquía que las demás. **Es la única capa que ve la muerte del scheduler.**
2. **`UMBRAL_SYNC_CAIDA_MS` y el `interval '3 hours'` del watchdog son el mismo número y
   tienen que seguir siéndolo.** Dos umbrales distintos para la misma pregunta producen el
   peor estado: panel en verde con la bandeja en rojo.
3. **El discriminador de las alertas del motor va por `payload ->> 'motivo'`, no por `type`.**
   Los cinco valores que existen hoy: `sin_respuesta`, `formato_desconocido`,
   `todos_los_feeds_obsoletos`, `todos_los_feeds_colapsados` y los del RPC
   (`reserva_desaparecida`, `reserva_movida`, `extension_sospechosa`, …). `scope` vale
   `'feed'`, `'job'` o `'aseo'`.
4. **`feed_sync_runs` es INALCANZABLE desde `authenticated`** (migración 11). El panel la lee
   por RPC `security definer` o con `service_role`, nunca con un `select` directo.
5. **Antes de desplegar a cualquier entorno nuevo hay que correr `docs/despliegue-sync.md`.**
   Sin los dos secretos de Vault el dispatcher falla en cada tick. Ruidoso, pero solo si
   alguien mira `cron.job_run_details`.
6. **`scripts/dev/sync-local.sh` deja los secretos de Vault sembrados** con los valores
   locales al terminar. Es deliberado —así el job de un minuto sigue funcionando en local—
   pero significa que el `throws_ok` de la aserción 61 depende de una base recién reseteada.
   `npm run db:test` la corre dentro de una transacción con `rollback`, así que no le afecta.
7. **La suite pgTAP está en 112 aserciones.** Un total distinto en la wave siguiente sin un
   archivo nuevo es una regresión, no un redondeo.

## Self-Check: PASSED

Archivos declarados, verificados en disco:

- `supabase/migrations/20260902235500_14_sync_jobs.sql` — FOUND
- `lib/domain/salud-sync.ts` — FOUND
- `lib/domain/salud-sync.test.ts` — FOUND
- `scripts/dev/sync-local.sh` — FOUND
- `docs/despliegue-sync.md` — FOUND
- `supabase/tests/05_sync.test.sql` — FOUND (modificado)
- `lib/database.types.ts` — FOUND (modificado)

Commits declarados, verificados en `git log`: `f16c233`, `741e7df`, `7a3245c`, `1bab5b8`,
`c240fd0` — los cinco presentes.
