---
phase: 03-motor-de-sincronizaci-n-ical
plan: 06
subsystem: api
tags: [ical, worker, route-handler, secreto-compartido, ssrf, colapso, backoff, privacidad]

requires:
  - phase: 02-acceso-y-administraci-n-del-cat-logo
    plan: 14
    provides: "esquemaUrlIcal con su allowlist de host, redirect: 'manual' como segunda mitad anti-SSRF, el presupuesto de 5 MiB por el lector del stream, y la costura last_event_count = RESERVAS"
  - phase: 03-motor-de-sincronizaci-n-ical
    plan: 02
    provides: "normalizarIcs(), clasificar() de tres valores y parsearIcs() con su bandera de documento completo"
  - phase: 03-motor-de-sincronizaci-n-ical
    plan: 04
    provides: "sync_feed_apply() y su firma de SEIS parametros, incluido p_http_status"
  - phase: 03-motor-de-sincronizaci-n-ical
    plan: 05
    provides: "el reconcile destructivo con sus cuatro candados, y la guarda de colapso del RPC que esta guarda complementa"
  - phase: 03-motor-de-sincronizaci-n-ical
    plan: 01
    provides: "guardarrail 7 ampliado a exigirSecretoCron y guardarrailes 7 y 8 capaces de ver funciones flecha"
provides:
  - "POST /api/cron/sync-feed: el worker por feed, autenticado por secreto compartido comparado en tiempo constante sobre sha256"
  - "LA GUARDA DE COLAPSO SOBRE RESERVAS CLASIFICADAS, con su senuelo por conteo de eventos MEDIDO sobre airbnb-desc-mutilado.ics"
  - "lib/domain/ical-guardas.ts: las guardas del cuerpo como logica pura y por tanto medible"
  - "lib/data/sync.ts: aplicarSync, registrarFalloDeSync, registrarCorridaSinTrabajo y el backoff 5/5/8/16/32/60"
  - "los cinco outcomes que el RPC no escribe: no_modificado, sin_cambios, transporte, colapso, error"
  - "CRON_SHARED_SECRET en .env.example, con las tres ubicaciones que deben coincidir"
  - "vitest.config.ts amplia include a app/**"
affects: [03-07, 03-08, 03-09, 03-10]

tech-stack:
  added: []
  patterns:
    - "El secreto se compara sobre el sha256 de los dos lados: la excepcion de longitud de timingSafeEqual es en si misma un canal lateral"
    - "La guarda de colapso vive en lib/domain porque dentro del route handler NO se puede medir"
    - "El tipo es la garantia de privacidad: LineaDeLog no tiene ranura para el cuerpo, la direccion ni el DESCRIPTION"
    - "Un corte por hash de payload exige ademas evidencia de una corrida ok previa: la pantalla de conexion tambien escribe ese hash"
    - "registrarFalloDeSync NO toca last_event_count: pisarlo con cero desarmaria la guarda de colapso en la corrida siguiente"
    - "Sonda de punta a punta con servidor de fixtures local: nueve escenarios de transporte contra el worker real y la base real"

key-files:
  created:
    - app/api/cron/sync-feed/route.ts
    - app/api/cron/sync-feed/_guard.ts
    - app/api/cron/sync-feed/_guard.test.ts
    - lib/data/sync.ts
    - lib/data/sync.test.ts
    - lib/domain/ical-guardas.ts
    - lib/domain/ical-guardas.test.ts
    - .planning/phases/03-motor-de-sincronizaci-n-ical/03-06-SUMMARY.md
  modified:
    - .env.example
    - vitest.config.ts

key-decisions:
  - "Las guardas del cuerpo salen del route handler a lib/domain/ical-guardas.ts. Dentro del handler no son medibles y el senuelo que demuestra que la guarda de colapso mira RESERVAS y no eventos quedaria sin comprobar, que es justamente lo que el plan pedia demostrar"
  - "El corte por payload_hash exige ADEMAS una corrida con outcome ok en feed_sync_runs. guardarFeed del plan 02-14 escribe last_payload_hash al CONECTAR el calendario, sin haber llamado nunca al RPC: sin esta condicion un apartamento recien conectado no generaria ni un aseo hasta que Airbnb cambiara el cuerpo"
  - "registrarFalloDeSync no escribe last_event_count ni last_success_at. Pisar el conteo con cero convertiria cada fallo de transporte en un colapso aparente en la corrida siguiente, y desarmaria la guarda justo cuando mas hace falta"
  - "El 304 y el cuerpo identico son EXITO y refrescan last_success_at: Airbnb reemite igual cada ~3 h y sin ese refresco el watchdog de obsolescencia alertaria de un feed vivo"
  - "El worker NO emite la notificacion del colapso. Solo escribe outcome, last_error y consecutive_failures; quien alerta es feed_health_watchdog del plan 03-07. Alertar desde dos sitios duplicaria el aviso y obligaria a reimplementar en TypeScript el dedupe por admin activo del plan 03-05"
  - "Una peticion no autorizada NO deja linea de log. Un endpoint publico que registra cada 401 es un amplificador de log gratis para quien sondee"
  - "Se anade destino_no_permitido a la union de codigos: la direccion guardada puede dejar de pasar la allowlist si alguien edita la fila por SQL, y ese caso no puede compartir codigo con un fallo de red"

patterns-established:
  - "Guard de secreto compartido: hash de ambos lados, union cerrada de motivos, 401 sin cuerpo"
  - "Los codigos del CUERPO los define el dominio y los de TRANSPORTE la capa de datos; la dependencia va data -> domain y nunca al reves"
  - "Toda guarda que decide si se llama a una transaccion destructiva se escribe como funcion pura con su senuelo"

requirements-completed: [SYNC-01, SYNC-06]

duration: 75min
completed: 2026-09-02
---

# Fase 3 Plan 06: el worker, y la guarda que hace segura toda la fase — Resumen

**El endpoint responde 401 sin cuerpo a los tres intentos de sondeo, y contra el worker real
corriendo sobre la base real: el feed de Airbnb produce quince aseos; un 200 con HTML, un cuerpo
truncado, un 302 hacia `169.254.169.254`, un 500, un cuerpo de 7,5 MiB y un feed que tarda 25 s
NO llaman al RPC ni una sola vez; y cuando los quince eventos dejan de clasificar, los quince
aseos siguen vivos y cero cancelados, con la telemetria diciendo `15 / 0 / 15`.**

## Performance

- **Duración:** 75 min
- **Tareas:** 3 de 3
- **Archivos creados:** 7 (más este resumen)
- **Archivos modificados:** 2

## Commits por tarea

| Tarea | Commit | Mensaje |
|---|---|---|
| 1 — el guard y la variable | `665142b` | `feat(03-06)`: guard del secreto compartido comparado sobre sha256 |
| 3 — `lib/data/sync.ts` | `2485f1d` | `feat(03-06)`: la llamada al RPC y el registro de fallo |
| 2 — el route handler | `f0d2ece` | `feat(03-06)`: el route handler del worker, con la guarda de colapso sobre reservas |

**La tarea 3 se ejecutó antes que la 2, a propósito.** `route.ts` importa `aplicarSync`,
`registrarFalloDeSync` y la unión cerrada de códigos; escribir el handler primero habría
dejado su `<verify>` (`tsc` y `build`) imposible de correr sin adelantar media tarea 3
dentro del commit de la 2. El orden de los commits es el orden real de ejecución.

---

## Lo que de verdad se midió: el worker completo, contra la base real

No es una simulación. Se levantó `next start` sobre el build de producción, un servidor de
fixtures en `127.0.0.1` sirviendo los `.ics` del repo, y una fila real de `calendar_feeds` +
`property_secrets` apuntando a él. Dieciocho escenarios, en orden, sobre el mismo feed.

### 1. El control de acceso

| Escenario | HTTP | Cuerpo de la respuesta | Aseos vivos |
|---|---|---|---|
| Sin header `x-cron-secret` | **401** | **vacío** | 0 |
| Secreto incorrecto, **misma** longitud | **401** | **vacío** | 0 |
| Secreto incorrecto, **otra** longitud | **401** | **vacío** | 0 |
| Cuerpo sin `feed_id` | **400** | vacío | 0 |
| `feed_id` inexistente | **404** | vacío | 0 |

Los tres 401 son **indistinguibles entre sí**: mismo status, mismo cuerpo vacío, misma
ausencia de línea de log. Es la propiedad que el hash del guard compra, y las dos primeras
filas la miden desde fuera del proceso.

### 2. El camino feliz y las guardas, en una sola secuencia

| # | Escenario | `outcome` | `last_error` | `last_event_count` | fallos | Aseos vivos | **Cancelados** |
|---|---|---|---|---|---|---|---|
| 5 | feed real, 1ª corrida | `ok` | — | **15** | 0 | **15** | **0** |
| 6 | feed real, 2ª corrida | `sin_cambios` | — | 15 | 0 | 15 | **0** |
| 7 | **`DESCRIPTION` cambiado** | **`colapso`** | `cero_reservas_clasificadas` | **15** | 1 | **15** | **0** |
| 8 | **`DESCRIPTION` cambiado, otra vez** | **`colapso`** | `cero_reservas_clasificadas` | **15** | 2 | **15** | **0** |
| 9 | 200 con `Content-Type` HTML | `transporte` | `content_type_html` | 15 | 3 | 15 | **0** |
| 10 | cuerpo truncado | `transporte` | `cuerpo_truncado` | 15 | 4 | 15 | **0** |
| 11 | 302 hacia `169.254.169.254` | `transporte` | `redirect_bloqueado` | 15 | 5 | 15 | **0** |
| 12 | 500 del proveedor | `transporte` | `http_500` | 15 | 6 | 15 | **0** |
| 13 | cuerpo de ~7,5 MiB | `transporte` | `cuerpo_excede_5mib` | 15 | 7 | 15 | **0** |
| 14 | feed que tarda 25 s | `transporte` | `timeout` | 15 | 8 | 15 | **0** |
| 15 | etag, 1ª corrida | `sin_cambios` | — | 15 | **0** | 15 | **0** |
| 16 | etag, 2ª corrida | **`no_modificado`** (304) | — | 15 | 0 | 15 | **0** |
| 17 | feed real otra vez | `sin_cambios` | — | 15 | 0 | 15 | **0** |

**La columna que importa es la última: cero cancelaciones en las trece corridas**, incluidas
las dos de colapso consecutivas. Es el criterio de éxito de la fase medido de punta a punta,
no razonado.

**La penúltima columna importa casi tanto y es fácil de pasar por alto.**
`last_event_count` se queda en **15 durante los ocho fallos seguidos**. Es deliberado:
`registrarFalloDeSync` no escribe esa columna. Si la pisara con `0` —que es lo que haría
una escritura de salud escrita sin pensar—, la corrida siguiente vería
`reservasAnteriores = 0`, la guarda de colapso **dejaría de saltar**, y el primer cuerpo
degradado que llegara después pasaría al RPC. La guarda se desarmaría sola justo después de
haber saltado.

### 3. La bitácora de corridas, fila por fila

```
 id  | outcome        | http | event | reservation | unknown
 108 | ok             | 200  | 15    | 15          | 0
 109 | sin_cambios    | 200  | null  | null        | null
 110 | colapso        | 200  | 15    | 0           | 15
 111 | colapso        | 200  | 15    | 0           | 15
 112 | transporte     | 200  | null  | null        | null
 113 | transporte     | 200  | null  | null        | null
 114 | transporte     | 302  | null  | null        | null
 115 | transporte     | 500  | null  | null        | null
 116 | transporte     | 200  | null  | null        | null
 117 | transporte     | null | null  | null        | null
 118 | sin_cambios    | 200  | null  | null        | null
 119 | no_modificado  | 304  | null  | null        | null
 120 | sin_cambios    | 200  | null  | null        | null
```

Las filas 110 y 111 son la señal temprana del Pitfall 5 hecha dato: **quince eventos, cero
reservas, quince desconocidos**. Un `outcome` a secas no lo diría; los tres contadores juntos
distinguen "el proveedor cambió una cadena" de "el apartamento se quedó sin reservas".

Los cinco `outcome` que el RPC no escribe aparecen todos: `no_modificado`, `sin_cambios`,
`transporte` y `colapso`. El sexto, `error`, solo lo produce un RPC que lanza o una dirección
que deja de pasar la allowlist, y no se pudo provocar sin romper la base a propósito.

### 4. Privacidad, medida sobre la salida real del proceso

`next start` escribió **trece líneas de log** en toda la corrida y ninguna otra. Todas de la
forma:

```
{"worker":"sync-feed","feed_id":"1ca2…","outcome":"colapso","codigo":"cero_reservas_clasificadas",
 "http_status":200,"event_count":15,"reservation_count":0,"block_count":0,"unknown_count":15}
```

| Comprobación sobre la salida del servidor | Resultado |
|---|---|
| Los cuatro dígitos de teléfono del feed (`2370`, `2644`, `2233`, `1274`) | **0 ocurrencias** |
| Las cadenas `Phone` y `DESCRIPTION` | **0 ocurrencias** |
| El puerto del feed o la subcadena `/calendar/ical/` | **0 ocurrencias** |
| Líneas de log de las cinco peticiones rechazadas (401/400/404) | **0** |

Y sobre las columnas que un humano ve en pantalla:

| Comprobación | Resultado |
|---|---|
| Puerto del feed en `calendar_feeds.last_error` o `last_etag` | **false** |
| `/calendar/ical/` en esas mismas columnas | **false** |
| Puerto del feed en `notifications` | **false** |
| Dígitos del teléfono en `notifications` | **false** |

### 5. El anti-SSRF, con la evidencia de que no se siguió el 302

El servidor de fixtures registró **trece peticiones** y su desglose es exactamente el de los
escenarios: `ok.ics` ×3, `etag.ics` ×2, `mutilado.ics` ×2 y una de cada uno del resto.
La del `302` **respondió con status 302 al worker**, y ese 302 es el que llegó a
`last_http_status`. Si `redirect: 'manual'` no estuviera, `fetch` habría seguido la
redirección hacia `169.254.169.254` y el resultado habría sido un error de red (`red`) o un
cuelgue hasta el timeout, nunca un `redirect_bloqueado` con status 302. La allowlist de host
sola no habría dicho nada: valida lo que el admin **escribió**, no a dónde **termina** la
petición.

---

## Los señuelos, medidos

### S1 — La fábrica administrativa ANTES del guard (obligatorio por el plan)

```
::error::una Server Action y un route handler son endpoints HTTP publicos: el guard
(exigirAdmin, exigirSesion o exigirSecretoCron) va ANTES de construir la fabrica
administrativa:
  app/api/cron/sync-feed/route.ts: POST() construye la fabrica administrativa sin un
  guard antes
```

`ci:arch` en **rojo**, con salida distinta de cero y nombrando la función exacta.

### S2 — Nombrar la tabla de secretos SIN la fábrica delante

Sustituyendo `createAdminClient()` por otra cosa:

```
::error::la tabla de secretos del apartamento no tiene grant para authenticated: solo se
alcanza con la fabrica administrativa:
  app/api/cron/sync-feed/route.ts:215: POST() nombra la tabla de secretos sin la fabrica
  administrativa antes
```

**Y el guardarraíl 7 se queda CALLADO en ese mismo señuelo.** Es el "falso verde por
ausencia" que su propio comentario documenta: sin fábrica, la función deja de tener nada que
vigilar. Los dos guardarraíles no son redundantes; cubren huecos distintos y este par de
mediciones lo demuestra en el mismo archivo.

### S3 — La guarda de colapso sobre EVENTOS en vez de sobre reservas clasificadas

`hayColapso` cambiada a `conteos.event_count === 0`:

```
Tests  4 failed | 7 passed (11)
× el feed con el DESCRIPTION cambiado NO es una lectura utilizable
× SENUELO: la guarda por CONTEO DE EVENTOS deja pasar el mismo cuerpo
× el colapso total por SUMMARY desconocido tambien salta
× LIMITE CONOCIDO: un feed que pasa a tener solo bloqueos se lee como colapso
```

`4 + 7 = 11 = plan`, así que no hubo aborto: los rojos son rojos de verdad.

**Además el señuelo vive permanentemente dentro de la suite**, no solo en este resumen. El
test `SENUELO: la guarda por CONTEO DE EVENTOS deja pasar el mismo cuerpo` computa las dos
versiones sobre el mismo cuerpo y afirma que **difieren**:

```
guardaPorEventos  === false   ← eventos.length === 0 && anteriores > 0
hayColapso(...)   === true
```

Un señuelo que solo se mide una vez y se cuenta en un resumen se pierde en el siguiente
refactor. Este cae en rojo el día que alguien "simplifique" la guarda.

### S4 — El guard sin el hash previo

Comparando los búferes de las cadenas en vez de sus `sha256`:

```
Tests  1 failed | 7 passed (8)
× con un secreto incorrecto de DISTINTA longitud lanza la excepcion de autorizacion,
  NO la de longitud de la comparacion
AssertionError: expected RangeError: Input buffers must have the s… { code: '…' } to be
an instance of SecretoCronInvalido
```

**Cae exactamente una**, y es la que mide la propiedad. La excepción que aparece,
`RangeError: Input buffers must have the same byte length`, es el canal lateral: distingue
"longitud equivocada" de "valor equivocado" sin comparar un solo byte del secreto.

### S5 — El backoff sin el piso de 5 minutos

```
Tests  3 failed | 9 passed (12)
AssertionError: expected 2 to be 5
AssertionError: expected [ 4, 8, 16, 32, 60 ] to deeply equal [ 5, 8, 16, 32, 60 ]
```

Tres rojos, los tres sobre la decisión bloqueada de `03-CONTEXT.md`.

### S6 — La dirección del feed metida en `ParametrosDeFallo`

**El resultado es el hallazgo, no el rojo.** El criterio de aceptación del plan dice
"verificable con grep sobre la firma". Se midió y **ese grep es un falso verde**: con
`icalUrl?: string` añadido a `ParametrosDeFallo`, la aserción sobre la firma sigue en
**verde**, porque la firma solo dice `parametros: ParametrosDeFallo`. La que cae es la
aserción sobre el módulo entero:

```
Tests  1 failed | 11 passed (12)
× el modulo entero no nombra la URL fuera de los comentarios
```

Por eso `sync.test.ts` lleva las dos y la segunda es la que manda. Queda escrito en el propio
test, no solo aquí.

---

## Los tres instrumentos que mintieron en este plan

El prompt advertía de tres formas conocidas. Aparecieron dos formas **nuevas**, las dos con
la misma firma: **el instrumento dice algo sin haber medido nada.**

### 1. `vitest run <archivo>` con un `include` que no lo cubre

```
No test files found, exiting with code 1

filter: app/api/cron/sync-feed/_guard.test.ts
include: lib/**/*.test.ts
```

**Salida 1, cero aserciones ejecutadas.** Un script de CI que solo mire el código de salida
lo lee como "los tests fallan". Y la variante peligrosa es la contraria: si el comando
formara parte de un `&&` con `|| true`, o si alguien "arreglara" el rojo relajando el filtro,
el archivo entero quedaría sin correr y todo seguiría verde. **Regla: comprobar cuántos tests
CORRIERON, no solo el código de salida.** Queda escrito en `vitest.config.ts`.

### 2. `grep 'export const POST'` sobre el archivo, sin filtrar comentarios

El criterio de aceptación del plan pide que ese grep no encuentre nada. Devuelve **una
ocurrencia** sobre el archivo correcto:

```
45: * `export async function POST`, NO `export const POST = ...`. El recorrido del
```

Es una línea de comentario que **explica por qué no se usa esa forma**. Un grep crudo
convierte la explicación en el defecto. La comprobación válida filtra las líneas de
comentario, que es exactamente lo que hace el propio `check-service-role.sh` con su
`COMENTARIO_RE`, y entonces devuelve cero. La misma situación que la única ocurrencia de
`raw_description` en la migración 12.

### 3. La tercera, la del prompt, confirmada otra vez

`ok + not ok = plan` se comprobó en los cuatro señuelos de vitest (`1+7=8`, `3+9=12`,
`4+7=11`, `1+11=12`) y en pgTAP (`44+6=50`). Ninguno abortó.

---

## Decisiones tomadas

### 1. Las guardas del cuerpo salen del handler a `lib/domain/ical-guardas.ts`

El plan las pone dentro de `route.ts` y deja el señuelo del colapso "anotado, con el enlace
al plan 03-08". El criterio de éxito de esta ejecución, en cambio, exige que la guarda sea
**demostrablemente** correcta con un señuelo que pruebe que la versión por conteo de eventos
falla. **Dentro de un route handler eso no se puede medir**: haría falta red, base y secreto
para ejercitar una decisión que es una función de cadena a veredicto.

Movidas a `lib/domain/`, el señuelo son once tests que corren en 176 ms, viven en la suite
para siempre, y encima cubren tres guardas de transporte que de otro modo se habrían quedado
sin ninguna aserción. `route.ts` no pierde nada: sigue siendo quien las aplica, en el orden
que manda el plan, y `evaluarLectura` es una sola llamada.

El archivo se llama `ical-guardas.ts` a propósito: así el **guardarraíl 10** (prohibido
instanciar el tipo temporal de JavaScript en `lib/domain/ical*.ts`) lo cubre también.

### 2. El corte por `payload_hash` exige evidencia de una corrida `ok` previa

**Es un defecto real que el plan no podía prever y que la sonda habría encontrado tarde.**
`guardarFeed` del plan 02-14 escribe `last_payload_hash` **al conectar el calendario**, sin
haber llamado nunca al RPC. Con el corte por hash escrito de la forma obvia:

1. el admin conecta el calendario y la pantalla guarda el hash del cuerpo;
2. el primer sync descarga el mismo cuerpo, el hash coincide, sale `sin_cambios`;
3. **no se crea ni un aseo**, y la situación dura hasta que Airbnb cambie el cuerpo.

La condición añadida es una consulta con `count: 'exact', head: true` sobre `feed_sync_runs`
filtrada por `outcome = 'ok'`, y **solo se hace cuando el hash coincide**, que es la única
rama donde puede importar. No es defensa en profundidad: es la diferencia entre que un
apartamento recién conectado genere aseos o no.

### 3. `registrarFalloDeSync` no escribe `last_event_count` ni `last_success_at`

Ver la sección de medición: el conteo de reservas es el **operando** de la guarda de colapso.
Pisarlo con cero en cada fallo la desarmaría, y el modo de fallo sería silencioso y con
retardo: la guarda saltaría una vez y dejaría de saltar después. `last_success_at` no se toca
por la razón simétrica: el watchdog alerta por obsolescencia de esa marca y escribirla en un
fallo apagaría la alerta.

### 4. El 304 y el cuerpo idéntico son ÉXITO

Refrescan `last_success_at`, ponen `consecutive_failures = 0` y `next_sync_at = +30 min`, y
**no llaman al RPC**. Si no refrescaran la marca de éxito, un feed que reemite igual cada tres
horas dispararía la alerta de "calendario caído" estando perfectamente vivo. Y llamar al RPC
haría avanzar el contador de ausencias sin haber observado ninguna reserva, que es el
Pitfall 8 literal.

Efecto secundario medido y deseado: el escenario 15 salió `sin_cambios` y aun así grabó el
`etag` de la respuesta, lo que permitió que el 16 fuera un **304 real** con `If-None-Match`.
El camino barato se habilita solo.

### 5. El worker NO emite la notificación del colapso

El plan dice "se registra el intento fallido **y se alerta**". El worker hace lo primero
—`outcome = 'colapso'`, `last_error`, `consecutive_failures++`— y **no lo segundo**, a
propósito. Emitir la notificación desde aquí obligaría a reimplementar en TypeScript el
dedupe por admin activo con cubo de tiempo que el plan 03-05 ya escribió en SQL, y produciría
**dos avisos** por el mismo hecho en cuanto exista el watchdog.

**Esto es un traspaso explícito al plan 03-07 y hay que leerlo:** `feed_health_watchdog` tiene
que alertar por `last_error = 'cero_reservas_clasificadas'` **como condición propia**, no solo
por `consecutive_failures`. Con la cadencia de 30 min, esperar a que el contador suba
retrasaría la alerta del colapso. Ver "Lo que este plan NO cierra", punto 1.

### 6. Una petición no autorizada no deja línea de log

Medido: los cinco rechazos (401×3, 400, 404) produjeron **cero** líneas. Un endpoint público
que registra cada intento fallido es un amplificador de log gratis: quien quiera puede llenar
la retención de logs de Vercel con un bucle. El rastro de los intentos vive en el log de la
plataforma, que es donde tiene que vivir.

### 7. `destino_no_permitido`, un código más que el plan no lista

El plan enumera ocho códigos. Falta el de "la dirección guardada ya no pasa la allowlist",
que es exactamente el caso que el plan pide cubrir revalidando con `esquemaUrlIcal` ("alguien
editó la fila por SQL"). Sin código propio tendría que compartir uno con un fallo de red, y en
pantalla el admin leería "no se pudo conectar" ante un problema que se arregla en el
formulario. También se añadieron `red` (conexión fallida sin status) y `rpc_fallido`, que el
plan describe en prosa pero no nombra.

---

## Desviaciones del plan

### Auto-corregidas

**1. [Regla 3 — Bloqueante] `vitest.config.ts` no cubría `app/**`**

- **Encontrado durante:** tarea 1, primera corrida del test del guard.
- **Problema:** `include: ['lib/**/*.test.ts']`. El archivo del guard vive donde el App
  Router obliga a ponerlo. `vitest run` devolvió `No test files found, exiting with code 1`:
  salida 1 sin ejecutar una sola aserción.
- **Arreglo:** `include` ampliado a `['lib/**/*.test.ts', 'app/**/*.test.ts']` y `exclude`
  ampliado en paralelo con `app/**/*.integration.test.ts`, por la misma razón por la que
  existe la exclusión de `lib/`: el job `arquitectura` de CI corre sin Docker.
- **Constancia:** el plan pedía explícitamente dejarla, y está también en el comentario del
  propio archivo con la medición del falso rojo.
- **Commit:** `665142b`.

**2. [Regla 1 — Bug] El corte por `payload_hash` impedía el primer sync de un feed recién conectado**

- **Encontrado durante:** tarea 2, al escribir la guarda de "mismo hash".
- **Problema:** ver decisión 2. `guardarFeed` del plan 02-14 escribe `last_payload_hash` al
  conectar, sin RPC de por medio.
- **Arreglo:** el corte exige además una corrida con `outcome = 'ok'` en `feed_sync_runs`.
- **Verificación:** la sonda arranca con un feed sin ninguna corrida y su primera llamada da
  `ok` con 15 aseos, no `sin_cambios`.
- **Commit:** `f0d2ece`.

**3. [Regla 2 — Funcionalidad crítica] `registrarCorridaSinTrabajo`, la tercera función del módulo**

- **Encontrado durante:** tarea 3.
- **Problema:** el plan lista dos exportaciones, `aplicarSync` y `registrarFalloDeSync`, pero
  su propia tabla de guardas exige escribir dos `outcome` de **éxito** (`no_modificado` y
  `sin_cambios`) que no son fallos: incrementarles `consecutive_failures` los pondría en
  backoff y apagaría `last_success_at`.
- **Arreglo:** una tercera función, con su propia semántica de éxito. Las dos del plan siguen
  existiendo con la firma que pide.
- **Commit:** `2485f1d`.

**4. [Regla 2 — Funcionalidad crítica] Tres códigos de fallo más**

- **Encontrado durante:** tareas 2 y 3.
- **Problema:** ver decisión 7. `red`, `rpc_fallido` y `destino_no_permitido` no están en la
  lista del plan y los tres tienen un camino de código que llega hasta ellos.
- **Commit:** `2485f1d` y `f0d2ece`.

**5. [Regla 3 — Bloqueante] `p_etag` tipado como `string` no nulable**

- **Encontrado durante:** tarea 3, `tsc`.
- **Problema:** `supabase gen types` no expresa la nulabilidad de los parámetros de función.
  `p_etag: string` con `TS2322`, y la primera corrida de un feed no tiene etag que mandar.
- **Arreglo:** el objeto de argumentos se construye tipado y se convierte con un `as unknown as`
  al tipo generado, con el razonamiento escrito al lado. Mandar `''` en vez de `null` guardaría
  un etag vacío y la corrida siguiente pediría `If-None-Match: ""`, que es una cabecera válida
  y equivocada.
- **Commit:** `2485f1d`.

**6. [Regla 3 — Bloqueante] Las guardas del cuerpo, a `lib/domain/`**

- Ver decisión 1. Es la desviación de más alcance del plan y la única que añade archivos que
  su lista de `files_modified` no nombra.
- **Commit:** `f0d2ece`.

### Ninguna desviación de Regla 4

No hizo falta ninguna decisión arquitectónica fuera del plan. `lib/domain/ical-guardas.ts` es
un módulo nuevo en una capa que ya existe, con la dirección de dependencia que el repo ya usa.

---

## Gates de autenticación

Ninguno. El plan no toca ningún servicio externo. `CRON_SHARED_SECRET` se generó local con
`openssl rand -base64 32` y se añadió a `.env.local`, que está en `.gitignore`.

**Pendiente para el humano, y está escrito en `.env.example`:** el mismo valor tiene que
existir en las variables de entorno de Vercel y en el secreto de Vault que crea el plan 03-07.
Cuando no coinciden, el modo de fallo es un **401 silencioso** en cada tick y nada en la
aplicación lo dice.

---

## Verificación

| Comprobación | Resultado |
|---|---|
| `npm run ci:arch` | **OK**, 10 guardarraíles |
| `npx tsc --noEmit` | **OK** |
| `npm run test:unit` | **23 archivos, 383 tests** (antes 20 / 352; +3 archivos, +31 tests) |
| `npm run build` | **OK**, 10 rutas, `/api/cron/sync-feed` como dinámica |
| `npm run db:test` | `Files=6, Tests=97`, **`Failed tests: 4-9`**, sin mover |
| `05_sync.test.sql` | **44 ok / 6 not ok sobre `plan(50)`**; `44 + 6 = 50` |
| Los cuatro (cinco) pgTAP previos | **47 ok / 0 not ok** |
| `npm run db:lint` | **`No schema errors found`** |
| `npm run db:advisors` | **`No issues found`** |
| `npm run db:types:check` | **diff vacío** |
| Sonda de punta a punta, 18 escenarios | **0 aseos cancelados en todos** |
| `grep 'export async function POST'` | **presente**, línea 185 |
| `grep 'export const POST'` filtrando comentarios | **0** (sin filtrar: 1, y es la explicación) |
| `grep` de `GET`/`PUT`/`PATCH`/`DELETE`/`HEAD`/`OPTIONS` exportados | **0** |
| `console.*` en `route.ts` | **1**, dentro de `registrar()`, que solo acepta `LineaDeLog` |
| `grep -i url` sobre el código de `lib/data/sync.ts` | **0** |
| Semilla | **39 apartamentos, 8 clusters, 5 informativas** |
| Perfiles de desarrollo | **3 vivos**, bcrypt (`$2a`) y email confirmado |
| Residuo de la sonda en la base | **0** en las seis tablas tocadas |
| `git diff --diff-filter=D` sobre los tres commits | **vacío**, ningún borrado |
| `STATE.md` / `ROADMAP.md` | **sin tocar** |

### Nota sobre `npm run lint`

Da 3 errores en `e2e/fixtures.ts` y 1 aviso en `lib/domain/aseador.schema.test.ts`.
**Los cuatro son previos a este plan y ya están documentados** en
`.planning/phases/02-acceso-y-administraci-n-del-cat-logo/deferred-items.md`, punto 1: son un
falso positivo de `react-hooks/rules-of-hooks` sobre el segundo argumento de una fixture de
Playwright. Ningún archivo de este plan aporta ninguno, y `next build` no lintea `e2e/`.

---

## Stubs conocidos

Ninguno por descuido. Lo que está deliberadamente fuera:

- **El worker no emite notificaciones.** Ver decisión 5. La alerta del colapso la tiene que
  emitir `feed_health_watchdog` del plan 03-07.
- **`outcome = 'error'` solo se produce por dos caminos** (`rpc_fallido` y
  `destino_no_permitido`) y ninguno se pudo provocar en la sonda sin corromper la base a
  propósito. Los dos tienen su rama de código y su código de error.
- **Nadie llama todavía a este endpoint.** El dispatcher de `pg_cron` + `pg_net` y el lease de
  `claimed_at` son del plan 03-07. El worker limpia `claimed_at` en las tres ramas (éxito
  dentro del RPC, fallo y corrida sin trabajo), así que la mitad suya del lease ya está.

---

## Lo que este plan NO cierra

1. **La alerta del colapso no existe todavía, y es lo más urgente.** El worker deja el rastro
   en `feed_sync_runs.outcome`, `last_error` y `consecutive_failures`, pero **nadie avisa**.
   La aserción 48 del plan 03-05 —"el colapso encola UNA alerta por admin, con cubo diario"—
   prueba una ruta que **este worker impide que se alcance en producción**: la guarda salta
   antes del RPC, así que la alerta del RPC no se emite nunca por este camino. Sigue siendo
   defensa en profundidad para cualquier otro llamador con `service_role`, pero el plan 03-07
   **tiene que** alertar por `last_error = 'cero_reservas_clasificadas'` como condición propia.
2. **El colapso PARCIAL sigue abierto**, exactamente igual que lo dejó el plan 03-05. La
   guarda salta con cero reservas. Si el proveedor rompiera el formato de la mitad de los
   eventos, la otra mitad clasificaría y sus ausentes acabarían cancelándose. El worker tiene
   señales de transporte pero **ninguna de ellas distingue medio colapso de una ventana que
   avanza**, y una guarda por proporción sobrebloquearía el caso legítimo. El riesgo real
   sigue acotado porque `ical-clasificar.ts` clasifica por una sola cadena.
3. **Un feed que pasa a tener solo bloqueos del propietario se lee como colapso.** Medido y
   con test (`LIMITE CONOCIDO`). Falla cerrado —no cancela nada— y la bitácora lo distingue
   (`block_count > 0` y `unknown_count = 0` frente a `unknown_count = 15` del colapso real),
   pero produce una alerta falsa. No se puede arreglar aquí sin abrir un agujero peor.
4. **Concurrencia real.** Todo está medido con llamadas secuenciales. El lease que impide dos
   corridas del mismo feed a la vez lo pone el dispatcher del plan 03-07.
5. **El `.ics` de 5 MiB se midió con relleno sintético**, no con un feed real enorme. El corte
   por bytes funciona; que un feed real de Airbnb pueda acercarse a ese tamaño sigue sin
   evidencia.
6. **`maxDuration = 60` no está probado contra el corte real de Vercel.** En local no hay
   corte de plataforma; lo que sí está medido es que el `AbortSignal` de 15 s corta antes que
   nada más (escenario del feed de 25 s).
7. **La pregunta del `UID` y la del piso siguen abiertas**, igual que en los planes 03-04 y
   03-05. Necesitan días de producción.

---

## Notas para las waves siguientes

1. **El dispatcher del plan 03-07 manda `POST` con `{"feed_id": "<uuid>"}` y la cabecera
   `x-cron-secret`.** Nada más entra: el cuerpo pasa por un `z.object({ feed_id: z.uuid() })`
   y cualquier otra forma es un 400.
2. **El secreto de Vault del plan 03-07 tiene que ser byte a byte el mismo que
   `CRON_SHARED_SECRET`.** Un carácter de más y el dispatcher recibe **401 sin cuerpo** en
   cada tick, sin ninguna otra señal. Está escrito en `.env.example`, en el bloque nuevo.
3. **`feed_health_watchdog` tiene que alertar por `last_error = 'cero_reservas_clasificadas'`
   como condición propia**, no solo por `consecutive_failures`. Ver "Lo que NO cierra",
   punto 1. Es el traspaso más importante de este resumen.
4. **El worker ya limpia `claimed_at` en las tres ramas.** El dispatcher solo tiene que
   ponerlo al reclamar y confiar en el lease de diez minutos para el worker que muere.
5. **Los tests de integración del plan 03-08 pueden reutilizar la receta de la sonda:**
   `next start` con `NEXT_PUBLIC_VIVAGUEST_FEED_LOCAL=1` (hace falta **antes** de `next build`
   o al menos en el entorno del proceso), un servidor de fixtures en `127.0.0.1` sirviendo
   rutas que terminen en `.ics` y contengan `/calendar/ical/`, y `CRON_SHARED_SECRET` en el
   entorno del servidor. Los nueve escenarios de transporte están en este resumen con su
   resultado esperado.
6. **`vitest.config.ts` ya recoge `app/**/*.test.ts`.** Un test nuevo bajo `app/` corre solo;
   uno de integración bajo `app/` tiene que llamarse `*.integration.test.ts` o entrará en
   `test:unit`.
7. **La lista de códigos de `last_error` es cerrada y está partida en dos capas.** Los del
   cuerpo en `lib/domain/ical-guardas.ts` (`MotivoDeLecturaInutil`), los de transporte en
   `lib/data/sync.ts` (`CodigoDeTransporte`), más `http_<status>`. El panel de la Fase 4 puede
   usarla directamente como filtro.
8. **`05_sync.test.sql` sigue en 6 `not ok`, ids `4 5 6 7 8 9`, sobre `plan(50)`.** Este plan
   no toca SQL, así que no mueve ninguna. Sigue haciendo falta comprobar
   `ok + not ok = plan`, y sigue haciendo falta `psql -qAtX` para leerlo suelto.

---

## Threat Flags

Ninguno nuevo sin mitigar. La superficie que este plan abre —un endpoint HTTP público— es la
que el registro del propio plan describe, y los nueve riesgos quedan **medidos**, no leídos:

| Threat ID | Mitigación | Evidencia |
|---|---|---|
| T-03-50 | Secreto compartido en header, 401 sin cuerpo, sin `GET` | tres escenarios de la sonda con 401 y cuerpo vacío; `grep` de métodos exportados a 0 |
| T-03-51 | `sha256` de los dos lados antes de `timingSafeEqual` | señuelo S4: `RangeError: Input buffers must have the same byte length` con el hash quitado, y solo cae esa aserción |
| T-03-52 | Allowlist de host + `redirect: 'manual'` + revalidación de la fila | escenario 11: el 302 hacia `169.254.169.254` vuelve como `redirect_bloqueado` con `last_http_status = 302`; el servidor de fixtures registra 13 hits y ninguno de segunda vuelta |
| T-03-53 | Presupuesto de 5 MiB por el lector del stream | escenario 13: ~7,5 MiB → `cuerpo_excede_5mib`, sin llamada al RPC |
| T-03-54 | `AbortSignal.timeout(15_000)` con `maxDuration = 60` | escenario 14: feed de 25 s → `timeout` con `last_http_status = null` |
| T-03-55 | La dirección no entra por ninguna firma; `last_error` es lista cerrada | `grep -i url` a 0 sobre el código de `sync.ts`; señuelo S6; 0 ocurrencias del puerto y de `/calendar/ical/` en `last_error`, `last_etag` y `notifications` |
| T-03-56 | `LineaDeLog` no tiene ranura para el cuerpo ni el `DESCRIPTION` | 13 líneas de log, **0 ocurrencias** de los cuatro dígitos de teléfono y de las cadenas `Phone` y `DESCRIPTION` |
| T-03-57 | Guardas de transporte + guarda de colapso sobre reservas clasificadas | 13 corridas, **0 aseos cancelados**; señuelo S3 con 4 rojos |
| T-03-58 | Guardarraíl 7 con el handler en forma `function` | `ci:arch` verde; señuelo S1 en rojo nombrando `POST()` |

---

## Self-Check: PASSED

- `app/api/cron/sync-feed/_guard.ts` — **FOUND**
- `app/api/cron/sync-feed/_guard.test.ts` — **FOUND**, 8 tests
- `app/api/cron/sync-feed/route.ts` — **FOUND**, `export async function POST` en la línea 185
- `lib/data/sync.ts` — **FOUND**
- `lib/data/sync.test.ts` — **FOUND**, 12 tests
- `lib/domain/ical-guardas.ts` — **FOUND**
- `lib/domain/ical-guardas.test.ts` — **FOUND**, 11 tests
- `.env.example` — **FOUND**, con `CRON_SHARED_SECRET` y las tres ubicaciones, sin valor real
- Commit `665142b` — **FOUND**
- Commit `2485f1d` — **FOUND**
- Commit `f0d2ece` — **FOUND**
- `STATE.md` y `ROADMAP.md` — **sin tocar**, verificado con `git diff --name-only` sobre los
  tres commits: nueve archivos, todos del plan
- Ningún borrado en ninguno de los tres commits — **verificado**, `git diff --diff-filter=D`
  vacío
- Los archivos temporales de la sonda (`probe-worker.mjs`, `probe-embed.mjs`) — **borrados**,
  `git status` limpio antes de cada commit; el servidor de fixtures vivió siempre en el
  directorio de scratch, fuera del repo
