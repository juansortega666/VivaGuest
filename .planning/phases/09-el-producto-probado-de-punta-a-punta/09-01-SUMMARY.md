---
phase: 09-el-producto-probado-de-punta-a-punta
plan: 01
subsystem: testing
tags: [playwright, e2e, ical, sync, cron, supabase, postgres, recorrido]

requires:
  - phase: 03-sincronizaci-n-de-calendarios
    provides: el worker `/api/cron/sync-feed`, el RPC `sync_feed_apply()` con su repesca, el normalizador y el clasificador de iCal, la allowlist de host con su concesión de loopback
  - phase: 04-operaci-n-del-admin
    provides: `/operacion` con sus bloques de día, su bandeja `Sin confirmar` y el `data-estado` de cada fila
  - phase: 08-paneles-laterales-en-el-admin
    provides: `esperarControlHidratado()` y `esperarUrlDeCliente()`, y las ocho trampas de instrumento medidas
provides:
  - "`e2e/recorrido.fixtures.ts`: el arnés del que cuelgan los cuatro recorridos de la fase — proveedor HTTP local por feed, constructor de `.ics` con la forma real medida, sembrador de la unidad con cuartos, corrida del worker por HTTP, corrida encadenada y limpieza en orden de FK"
  - "`e2e/recorrido-core.spec.ts`: el primer caso del repo cuyo aseo NO lo escribió nadie — del `.ics` servido en 127.0.0.1 al aseo visible en `/operacion`"
  - "`conectarFeed()`: el estado en que el admin deja el feed al conectar el calendario, que es lo que hace alcanzable la segunda condición del bloque 8 del worker"
  - "La prohibición medible: cero `cleanings').insert` en los archivos de recorrido"
affects: [09-02, 09-03, 09-04, 09-05, 09-07]

actuals:
  tokens: 13589
  tasks: 3
  commits: 3
plan_head_before: eb76830a2e9cddfb91eefe30bbccb4380c70f637

tech-stack:
  added: []
  patterns:
    - "El recorrido E2E arranca del feed y no de un `insert`: el aseo nace de la sincronización o el caso no prueba la junta"
    - "La sincronización se dispara por HTTP contra el servidor de Playwright, nunca importando el route handler (`import 'server-only'`)"
    - "Las fechas del `.ics` son desplazamientos contra el día de negocio de la base, y la firma del constructor no admite una fecha literal"
    - "Toda aserción de un recorrido largo lleva mensaje propio, y la bitácora anota el mensaje literal que salió en rojo"

key-files:
  created:
    - e2e/recorrido.fixtures.ts
    - e2e/recorrido-core.spec.ts
  modified: []

key-decisions:
  - "El transporte de la sincronización es HTTP con `x-cron-secret` y no una importación del handler: `route.ts` empieza con `import 'server-only'` y el transpilador de Playwright no neutraliza su `throw`. Además es el camino fiel: es lo que hace `pg_net` en producción."
  - "La URL del feed no sale del arnés en ningún valor de retorno. Vive en un registro interno indexado por feed, como en `lib/test/sync.ts`, porque un GET a ella revela la ocupación del apartamento sin autenticarse."
  - "La allowlist de `lib/domain/ical-url.schema.ts` no se tocó: se usa la concesión de loopback que ya existe con su candado de tres vueltas, encendida por `playwright.config.ts`."
  - "La reserva del recorrido es de CUATRO noches y no de una. Lo decidió un señuelo: con una noche, restar un día al `DTEND` colapsa el rango, `res_dates_ok` lo tumba, y el defecto de la fecha se manifiesta como «cero reservas» tres aserciones antes de la que debía atraparlo."
  - "El feed se siembra CONECTADO (`last_payload_hash` escrito, cero corridas), que es el estado real de partida. Sin eso, la segunda condición del bloque 8 del worker es inalcanzable desde la interfaz."
  - "Las tarifas del recorrido (214 609 / 61 843) son distintas de las de cualquier otro fixture del repo, para que 09-04 pueda afirmar que la cifra que se pinta sale del snapshot del aseo y no de la fila del apartamento."

patterns-established:
  - "Bitácora de señuelos dentro del propio archivo de test, con tabla `# — qué se rompió — qué se puso rojo` y el mensaje literal"
  - "`expect.soft` como instrumento de DIAGNÓSTICO de un señuelo (medir el radio completo de un defecto sin que el caso aborte en la primera aserción), nunca como aserción permanente"
  - "`sembrarUnidadDeRecorrido()` acepta un responsable PRESTADO y no lo borra en la limpieza: es lo que permite que el tramo del aseador use el `storageState` de `aseador1`"

requirements-completed: []

coverage:
  - id: D1
    description: "Un `.ics` servido por HTTP produce un aseo pendiente con la fecha del DTEND, sin un solo insert en cleanings"
    verification:
      - kind: e2e
        ref: "e2e/recorrido-core.spec.ts#un checkout publicado en el .ics se vuelve un aseo con su fecha, y el admin lo ve en /operacion"
        status: pass
    human_judgment: false
  - id: D2
    description: "Ese aseo se ve en /operacion, en su bloque de día, con su apartamento y sin confirmar"
    verification:
      - kind: e2e
        ref: "e2e/recorrido-core.spec.ts#un checkout publicado en el .ics se vuelve un aseo con su fecha, y el admin lo ve en /operacion"
        status: pass
    human_judgment: false
  - id: D3
    description: "Correr el sync dos veces sobre el mismo feed no produce un segundo aseo, ni por el camino del atajo del hash ni por el camino donde el diff sí se ejecuta"
    verification:
      - kind: e2e
        ref: "e2e/recorrido-core.spec.ts#el mismo cuerpo servido dos veces corta por el hash y deja el mismo aseo"
        status: pass
      - kind: e2e
        ref: "e2e/recorrido-core.spec.ts#el mismo contenido con DTSTAMP distinto sí llega al diff, y el diff no duplica el aseo"
        status: pass
    human_judgment: false
  - id: D4
    description: "El arnés falla con un mensaje que nombra CRON_SHARED_SECRET y el proceso del servidor cuando el worker responde 401, en vez de dejar un rojo mudo"
    verification:
      - kind: other
        ref: "grep -v '^ \\*' e2e/recorrido.fixtures.ts | grep -c CRON_SHARED_SECRET → 3"
        status: pass
    human_judgment: false
  - id: D5
    description: "Las aserciones nuevas se vieron en rojo antes de darse por buenas (cinco señuelos, nueve corridas)"
    verification:
      - kind: other
        ref: "BITÁCORA DE SEÑUELOS en la cabecera de e2e/recorrido-core.spec.ts"
        status: pass
    human_judgment: false

duration: 50min
completed: 2026-09-18
status: complete
---

# Fase 9 Plan 01: El arnés del recorrido y la primera junta del Core Value — Summary

**Del `.ics` servido en 127.0.0.1 al aseo visible en `/operacion`, por HTTP contra el worker real y sin una sola fila de aseo escrita a mano: la primera junta de la cadena que el proyecto existe para sostener queda probada por la interfaz, y dos de los cinco señuelos obligaron a cambiar el instrumento antes de dejarla por buena.**

## Performance

- **Duration:** ~50 min
- **Started:** 2026-09-18T19:15:00Z
- **Completed:** 2026-09-18T20:05:00Z
- **Tasks:** 3 de 3
- **Files modified:** 2 (los dos creados; cero archivos de producto en el diff)

## Accomplishments

- **El arnés de la fase entera.** `e2e/recorrido.fixtures.ts` levanta un `node:http` por feed en `127.0.0.1`, construye `.ics` con la forma medida sobre 830 snapshots, siembra la unidad completa (responsable, suplente, apartamento, **cuartos**, secreto y feed), dispara el worker por `POST` con `x-cron-secret`, encadena corridas moviendo el `DTSTAMP` y limpia en orden `cleanings → properties → auth.users`.
- **El primer caso del repo cuyo aseo no lo escribió nadie.** Un `Reserved` con checkout a dos días y un `Airbnb (Not available)` en el mismo cuerpo: la sincronización produce **un** aseo `origin = 'ical'`, pendiente, sin confirmar, con `scheduled_date` **igual al `DTEND`**, y el admin lo ve en su bloque de día con su etiqueta `Sin confirmar`.
- **La idempotencia probada por los dos caminos que no miden lo mismo.** El mismo cuerpo corta por el atajo del hash; el mismo contenido con `DTSTAMP` distinto llega de verdad al RPC y el diff no crea nada (`cleanings_created = 0`).
- **Dos hallazgos que cambiaron el instrumento**, los dos salidos de señuelos que no pusieron rojo lo que debían (ver más abajo).

## Task Commits

1. **Task 1: El arnés, y el camino completo del `.ics` al aseo visible en `/operacion`** — `3576ef4` (test)
2. **Task 2: La segunda corrida, que es donde se cuela un aseo duplicado** — `9c15837` (test)
3. **Task 3: Los cinco señuelos, y el barrido de instrumento** — `7dd3276` (test)

## Files Created/Modified

- `e2e/recorrido.fixtures.ts` (801 líneas) — el arnés: `RespuestaDeFeed`, `EventoDeRecorrido`, `icsDe()`, `sembrarUnidadDeRecorrido()`, `conectarFeed()`, `correrSync()`, `correrSyncEncadenado()`, `aseosDe()`, `aseosVivosDe()`, `limpiarRecorrido()`.
- `e2e/recorrido-core.spec.ts` (357 líneas) — el tramo `.ics` → sync → aseo → `/operacion`, más los dos casos de la segunda corrida, más la bitácora de señuelos.

## Decisions Made

Las seis que quedan en `key-decisions`. La que más peso tiene para los planes que siguen:

**El feed se siembra CONECTADO.** `conectarFeed(feedId, cuerpo)` escribe `last_payload_hash` y `last_event_count` exactamente como lo hace `guardarFeed` cuando el admin conecta el calendario, sin ninguna corrida hecha. Es el estado real de partida de cualquier apartamento del sistema, y sin él hay una guarda del worker que ninguna prueba de interfaz puede alcanzar. **Los recorridos de 09-04 y 09-05 deberían usarlo**: un recorrido que arranque de un feed nunca conectado arranca de un estado que en producción no existe.

## Deviations from Plan

Ninguna desviación de producto: **cero archivos de producto en el diff del plan**. Las dos desviaciones son del propio instrumento, y las dos las obligó la disciplina de señuelos (regla 3 de la política de defectos: un defecto de instrumento se arregla nombrando la trampa, no ablandando la medida).

### 1. [Instrumento] La estadía del `.ics` pasa de una noche a cuatro

- **Encontrado durante:** Task 3, señuelo 1.
- **Síntoma:** con el defecto «un día menos al `DTEND`» metido en `lib/domain/ical-normalizar.ts`, la aserción que se puso roja fue `el cuerpo trae UNA reserva clasificada…`, **no** la de la fecha, y los tres casos cayeron.
- **Causa medida:** con `desde: 1, hasta: 2` la estadía es de UNA noche. Restarle un día al `DTEND` deja `ends_on === starts_on`, la reserva incumple `res_dates_ok` del RPC y sale contada como **desconocida**. O sea que el defecto de la fecha se manifestaba como «cero reservas» tres aserciones antes de llegar a la que este caso existe para sostener.
- **Arreglo:** la reserva pasa a `desde: -2, hasta: 2` (cuatro noches). El rango sigue siendo válido tras el defecto y el aseo aterriza en el día equivocado, que es lo que hay que poder ver. El mismo cambio en `icsDeUnaReserva()`.
- **Verificación:** con el señuelo puesto, rojo en `el aseo va el día del DTEND (2026-09-20), SIN sumarle ni restarle un día: restarlo lo mandaría a la última noche (2026-09-19), con el huésped todavía dentro` y **en ninguna otra**; 1 caso rojo de 3.
- **Commit:** `7dd3276`.

### 2. [Instrumento] Nace `conectarFeed()`, porque el señuelo 4 no ponía nada en rojo

- **Encontrado durante:** Task 3, señuelo 4.
- **Síntoma:** quitarle al bloque 8 de `app/api/cron/sync-feed/route.ts` su segunda condición (`if (true || (count ?? 0) > 0)`) dejó **los tres casos en verde**.
- **Causa medida:** `sembrarUnidadDeRecorrido()` dejaba `last_payload_hash` en nulo, así que el primer sync nunca entraba en el atajo del hash. En producción no es así: `guardarFeed` escribe ese hash **al conectar** el calendario, sin haber llamado nunca al RPC, y esa segunda condición existe precisamente para que un apartamento recién conectado no se quede sin su primer aseo. El arnés no reproducía el estado de partida y la guarda quedaba sin ejercitar.
- **Arreglo:** `conectarFeed(feedId, cuerpo)` escribe hash y conteo de reservas por el mismo camino que producción (`normalizarIcs` + `contarPorClasificacion`). El tracer la llama con el mismo cuerpo que va a servir.
- **Verificación:** con el señuelo puesto por segunda vez, rojo en `el worker tiene que terminar en 'ok'…`, y con `expect.soft` se midió el radio completo: caen también las dos de conteos y `un checkout produce UN aseo…`. `hits` sigue verde, que es correcto: el fetch sí ocurre, el atajo es posterior.
- **Commit:** `7dd3276`.

---

**Total desviaciones:** 2, las dos de instrumento, ninguna de producto.
**Impacto:** ambas hacen el arnés más fiel, no más laxo. Ninguna aserción se debilitó.

## Bitácora de señuelos

Cinco señuelos, **nueve corridas** (dos de ellos necesitaron segunda vuelta, y dos corridas más fueron diagnósticos con `expect.soft` para medir el radio completo). Cada defecto se metió en el **producto**, se corrió, se anotó qué se puso rojo, se revirtió y se volvió a verde.

| # | Qué se rompió | Qué se puso rojo (mensaje literal) |
|---|---|---|
| 1 | `lib/domain/ical-normalizar.ts`: un día menos al `DTEND` | **1ª vuelta (estadía de UNA noche):** `el cuerpo trae UNA reserva clasificada: si sale 0 el clasificador dejó de reconocer el 'Reserved', y si sale 2 se tragó el bloqueo como reserva` — **no** la de la fecha, y los 3 casos rojos. **2ª vuelta (cuatro noches):** `el aseo va el día del DTEND (2026-09-20), SIN sumarle ni restarle un día: restarlo lo mandaría a la última noche (2026-09-19), con el huésped todavía dentro`, y ninguna otra. 1 rojo de 3 |
| 2 | `lib/domain/ical-clasificar.ts`: el bloqueo devuelto como `reserva` | `el cuerpo trae UNA reserva clasificada…`. Radio completo medido con `expect.soft`: caen además `el cuerpo trae UN bloqueo clasificado: si sale 0 el 'Airbnb (Not available)' se fue por otra rama y dejaría de ser inocuo` y `un checkout produce UN aseo y el bloqueo no produce ninguno: dos aseos significan que el bloqueo generó el suyo`. 1 rojo de 3 |
| 3 | migración 04: los dos índices únicos parciales dejan de cubrir los aseos VIVOS (`where state = 'cancelada'`) | **Los 3 casos.** `un checkout produce UN aseo…`, `después de la segunda corrida sigue habiendo UN aseo: dos significan que la reserva se volvió a mirar como nueva` y `y lo crea DE VERDAD: 'cleanings_created' en 1 es lo que distingue "el aseo nació aquí" de "ya estaba"` |
| 4 | `app/api/cron/sync-feed/route.ts` bloque 8: el atajo del hash sin su segunda condición | **1ª vuelta: NADA.** Los 3 en verde (ver desviación 2). **2ª vuelta, ya con `conectarFeed()`:** `el worker tiene que terminar en 'ok': cualquier otro outcome significa que una guarda cortó antes del RPC y el aseo no llegó a nacer`; con `expect.soft`, también las dos de conteos y `un checkout produce UN aseo…`. `hits` verde |
| 5 | `lib/data/operacion.ts`: ventana de lectura estrechada a `hoy + 1` | **Solo** `el aseo que salió del feed tiene que verse en /operacion, en el bloque del día de su checkout, con el nombre de su apartamento`. Las cinco aserciones de base pasaron. Es lo que demuestra que la pantalla y la base no miden lo mismo |

**Hallazgo lateral del señuelo 3, que conviene que quede escrito:** el duplicado aparece **ya en el primer sync**, no en la segunda corrida. La causa es la **repesca aditiva** del paso (e.3) de la migración 13, que repite el paso (c) con el mismo `on conflict do nothing`. Su idempotencia no la sostiene ninguna línea de código: la sostiene el índice único parcial y nada más. La migración 04 lo dice («la garantía es de la base, no del código»), y esto lo mide.

### Contabilidad de aserciones y señuelos

- **Aserciones que añade el plan: 24** — 12 en el tracer (4 del worker, 5 de la base, 3 de la pantalla), 5 en el caso del hash, 6 en el caso encadenado, 1 en el helper `abrirBloque()`.
- **Señuelos corridos: 5** (nueve corridas con las segundas vueltas y los diagnósticos).
- **Por qué 5 y no 24:** los señuelos cubren cinco FAMILIAS de aserciones, una por hecho que no se deriva de otro: la fecha del aseo, la clasificación reserva/bloqueo, la idempotencia del diff, que el primer sync genere el aseo, y que la pantalla lo pinte. El resto son aserciones de la misma familia en otra capa (por ejemplo, el señuelo 2 pone rojas tres a la vez: el conteo de reservas del worker, el de bloqueos y el aseo escrito en base).
- **Una aserción queda sin señuelo propio, y está medido por qué:** `con EL MISMO id` en el caso encadenado. Las dos que la preceden (`cleanings_created` en 0 y «un aseo vivo») ya fijan que el diff no creó nada y que hay exactamente una fila, así que ningún defecto plausible de producto puede mover el id sin mover antes una de esas dos. Se deja igual porque es la que **enuncia la intención** (la identidad del aseo sobrevive al ruido de la fuente) y porque se vuelve independientemente falsable en cuanto 09-04 le ponga trabajo encima al aseo: con confirmación, aseador y checklist, un aseo recreado se distingue de uno conservado por algo más que su id.

## Barrido de instrumento

Sobre los dos archivos nuevos:

| Grep | Resultado | Exigido |
|---|---|---|
| `locator('main')` \| `locator("main")` \| `getByRole('table')` | **0** | 0 |
| `waitForURL` \| `toHaveURL` | **0** | 0 |
| `getByRole('alert')` | **0** | 0 |
| `cleanings').insert` \| `cleanings").insert` | **0** | 0 |

Compuertas del arnés:

| Grep | Resultado | Exigido |
|---|---|---|
| `/api/cron/sync-feed` en `recorrido.fixtures.ts` | **4** | ≥ 1 |
| `from '@/app/api` en `recorrido.fixtures.ts` | **0** | 0 |
| `CRON_SHARED_SECRET` fuera de JSDoc en `recorrido.fixtures.ts` | **3** | ≥ 1 |
| `from('cleanings')` en `recorrido-core.spec.ts` | **0** | — (las lecturas van por `aseosDe()`) |

Diff vacío, medido con rango explícito desde el arranque de la fase:

```
git diff --name-only 6e45c8e..HEAD -- 'app/(cleaner)'                 → vacío
git diff --name-only 6e45c8e..HEAD -- lib/domain/ical-url.schema.ts   → vacío
git diff --name-only eb76830..HEAD                                     → solo los 2 archivos del plan
```

## Líneas base de las cuatro suites

Todas con `npm run db:reset` delante donde el plan lo exige, y con `PLAYWRIGHT_PORT=3210`.

| Suite | Medido | Línea base documentada | Veredicto |
|---|---|---|---|
| `npm run test:unit` | **1236 / 1236** en 65 archivos | 1236 | exacta |
| `npm run test:integration` | **205 / 205** en 23 archivos | 205 | exacta |
| `npm run db:test` (pgTAP) | **389 / 389** en 13 archivos | 389 | exacta |
| E2E completa | **159 colectados: 157 verdes, 1 saltado, 1 rojo** (3.3 min) | «160 casos» | ver nota |

**El único rojo es uno de los tres conocidos y no es de este plan:** `e2e/push-instalacion.spec.ts:215` (caso E2), documentado en `.planning/phases/08-paneles-laterales-en-el-admin/deferred-items.md` como reproducible solo en la suite completa de una sola tirada. Los otros dos conocidos (`operacion.spec.ts:390` y `operacion-alertas.spec.ts:341`) no aparecieron en esta corrida.

**Nota sobre el conteo de casos E2E:** el runner colecta **159** con los 3 de este plan dentro, o sea **156 antes**. `.planning/codebase/TESTING.md` y `09-CONTEXT.md` documentan «160 casos». La diferencia de 4 queda anotada para la compuerta **09-07**, que es quien tiene que reconciliar el inventario de la fase.

Compilación y estructura, todas limpias:

```
npx tsc --noEmit   → sin salida
npm run lint       → 0 errores, 2 warnings PREEXISTENTES
                     (app/(admin)/operacion/_actions.test.ts:48, lib/domain/aseador.schema.test.ts:40)
npm run build      → OK
npm run ci:arch    → check-service-role OK · check-max-w-tallas OK · check-escala-movil OK
```

## DEUDA DECLARADA

Las dos entradas van a la compuerta **09-07**, que es la dueña del `deferred-items.md` de la fase. Ninguna es un defecto de producto y ninguna lleva `test.fail()`, porque ninguna afirma nada sobre el comportamiento del producto.

### D-09-01-A · `npx playwright test --list` no funciona en este árbol

- **Síntoma literal:** `Total: 0 tests in 0 files`, precedido de `at publicEnv (lib/env.ts:52:24) → at clienteDeServicio (e2e/global-setup.ts:54:49) → at Object.<anonymous> (e2e/push-instalacion.spec.ts:45:45)`.
- **Reproducción:** `PLAYWRIGHT_PORT=3210 npx playwright test --list`.
- **Causa medida:** `e2e/push-instalacion.spec.ts:45` llama a `clienteDeServicio()` **a nivel de módulo**. Con `--list`, Playwright no corre el `globalSetup`, así que `.env.local` no está cargado y `publicEnv()` lanza al importar el archivo. El fallo de un solo spec vacía la colección entera.
- **Consecuencia:** no hay forma de contar la suite sin correrla entera (3,3 min), que es exactamente lo que hace caro reconciliar el inventario de la nota de arriba.
- **Archivo y línea:** `e2e/push-instalacion.spec.ts:45`.
- **Fuera de alcance de este plan** (regla del límite de alcance: archivo ajeno, defecto preexistente). **Dueño propuesto: 09-07**, junto con la reconciliación del conteo. El arreglo es mover esa construcción dentro de un `beforeAll`, como ya hacen `operacion.spec.ts`, `calendario.spec.ts` y `recorrido-core.spec.ts`.

### D-09-01-B · La aserción del id en el caso encadenado no es falsable hoy

- **Síntoma:** ningún señuelo de producto plausible puede poner roja `con EL MISMO id: la identidad del aseo es (apartamento, fecha) y no la reserva…` sin poner roja antes una de las dos que la preceden.
- **Medición:** señuelo 3 (duplicado) pone rojas `cleanings_created` y «un aseo vivo»; para mover el id sin mover esas dos haría falta un `delete + insert` (que sube `cleanings_created`) o un `update` del id (que no es un defecto plausible).
- **Por qué no se borra:** es la aserción que enuncia la intención, y se vuelve falsable en 09-04, cuando el aseo lleve confirmación, aseador y checklist encima.
- **Dueño propuesto: 09-04**, que es quien puede reforzarla afirmando que el trabajo humano sobrevive, no solo el id.

## Issues Encountered

- **El primer señuelo no midió lo que decía medir, y el cuarto no midió nada.** Los dos están arriba con su causa y su arreglo. Es el resultado que la disciplina de señuelos existe para producir, y es la segunda vez que pasa en este repo (la Fase 7 tuvo dos iguales en `11_financiero.test.sql`).
- **`docker exec psql` no está permitido en este entorno**, así que el señuelo 3 se aplicó editando la migración 04 y corriendo `npm run db:reset` (32 s por reset, dos resets). Funcionalmente equivalente y más auditable; el árbol quedó restaurado y verificado con `git status`.

## User Setup Required

Ninguna. El arnés usa `CRON_SHARED_SECRET` y el stack local de Supabase, que ya estaban.

## Next Phase Readiness

**Listo para los planes 09-02 a 09-05.** Lo que cuelga del arnés sin escribir una línea más:

- `sembrarUnidadDeRecorrido(servicio, { responsable: idDeAseador1 })` — el tramo del aseador de 09-04, con `storageState` de verdad.
- `sembrarUnidadDeRecorrido(servicio, { gestionada: false })` — el apartamento informativo de 09-05.
- `sembrarUnidadDeRecorrido(servicio, { puertoMuerto: true })` — el feed caído de 09-05.
- `correrSyncEncadenado()` — la reserva que se mueve de fecha, de 09-05. Ya está ejercitado por el caso (b).
- `conectarFeed()` — **úsalo en todo recorrido nuevo**: un feed nunca conectado es un estado de partida que en producción no existe.
- `unidad.tarifas` (214 609 / 61 843) — la cifra que 09-04 tiene que ver en `/finanzas/aseos`, distinta de la de cualquier otro fixture.
- `unidad.cuartos` — `general` sin foto y `habitacion` con foto, que es lo que hace que el checklist materializado de 09-04 tenga algo que marcar y algo que evidenciar.

**Dos cosas que 09-07 hereda de aquí:** la reconciliación del conteo de casos E2E (156 → 159, contra los 160 documentados) y la deuda D-09-01-A.

---
*Phase: 09-el-producto-probado-de-punta-a-punta*
*Completed: 2026-09-18*

## Self-Check: PASSED

- `e2e/recorrido.fixtures.ts` · `e2e/recorrido-core.spec.ts` · `09-01-SUMMARY.md` existen en disco.
- Los tres commits existen en el historial: `3576ef4`, `9c15837`, `7dd3276`.
