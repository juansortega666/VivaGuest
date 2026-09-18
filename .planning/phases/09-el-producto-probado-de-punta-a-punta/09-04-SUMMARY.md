---
phase: 09-el-producto-probado-de-punta-a-punta
plan: 04
subsystem: testing
tags: [playwright, e2e, core-value, recorrido, push, evidencia, storage, finanzas, cierre, seguridad]

requires:
  - phase: 09-el-producto-probado-de-punta-a-punta
    provides: "el arnés de recorridos de `09-01`: proveedor `.ics` local, `sembrarUnidadDeRecorrido()`, `conectarFeed()`, `correrSync()` por HTTP y la prohibición de `insert` sobre `cleanings`"
  - phase: 05-avisos-y-pwa
    provides: "`contextoPersistente()`, `emularInstalada()`, `esperarWorkerListo()` y `construirPayload()`, con las tres condiciones medidas que hacen alcanzable el push"
  - phase: 07-finanzas
    provides: "`cerrar_periodo()`, `periodo_pendiente_de_cierre()`, `rentabilidad_aseos()`, `mis_pagos_cerrados()` y el patrón de aserción negativa en los dos formatos"
  - phase: 08-paneles-laterales-en-el-admin
    provides: "`BYTES_DEL_RECIBO` exportado, la rama de la miniatura firmada de `TiraDeEvidencia`, y las ocho trampas de instrumento"
provides:
  - "`e2e/recorrido-core.spec.ts`: EL RECORRIDO DEL CORE VALUE, un solo `test()` que va del `.ics` servido en 127.0.0.1 al pago que la aseadora ve en su teléfono, cruzando las cinco juntas y afirmando cada una inmediatamente después de cruzarla"
  - "La primera prueba del repo que sube BYTES DE VERDAD al bucket desde la interfaz y afirma la miniatura firmada del admin, que es la rama que escondió un error de servidor durante tres planes"
  - "`entregarPushAlWorker()`: la entrega de push por el protocolo de DevTools, con reintento de LA ENTREGA y no de la medida"
  - "`periodoVencidoSinCerrar()` y `adelantarElCalendarioDelAseo()`: el único viaje en el tiempo de la fase, declarado, más la limpieza del periodo que el recorrido deja cerrado"
  - "La contraparte de seguridad con su control de ALCANCE, que es lo que un señuelo obligó a inventar: el control de `mis-pagos.spec.ts` no alcanza para un recorrido que entra por navegación de cliente"
affects: [09-05, 09-06, 09-07]

actuals:
  tokens: 20039
  tasks: 3
  commits: 4
plan_head_before: f8822605bcb5f2f2b2ac45b8c63c52220766480d

tech-stack:
  added: []
  patterns:
    - "Un recorrido de punta a punta es UN caso que crece, no cinco casos que comparten siembra: el sujeto es el mismo aseo de principio a fin"
    - "Toda aserción de un recorrido largo lleva mensaje propio y prefijo de junta, y cada junta se afirma inmediatamente después de cruzarla"
    - "Una aserción de fuga se mide navegando POR DIRECCIÓN, nunca por navegación de cliente: el prefetch de Next deja un tocón cuyo cuerpo el navegador descarta"
    - "El control de un interceptor va POR CONTENIDO (algo que solo esté en la pantalla que se quiere medir), nunca por conteo ni por dirección"
    - "Una entrega por el protocolo de DevTools se puede perder: se reintenta LA ENTREGA, nunca se afloja la medida"

key-files:
  created: []
  modified:
    - e2e/recorrido-core.spec.ts
    - e2e/recorrido.fixtures.ts

key-decisions:
  - "El checkout del recorrido cae HOY y no mañana. `leerAseosDeHoy()` solo ABRE los aseos del día (los de mañana los cuenta), así que con el checkout mañana el tramo de campo tendría que entrar por dirección directa, que es justo el atajo que esta fase existe para no tomar."
  - "Se confirma desde el menú de LA FILA y no desde la bandeja de la cabecera: la bandeja cuenta todos los aseos sin confirmar de la ventana, así que su rótulo y su copy dependen de lo que hayan dejado los otros casos del archivo."
  - "FIN-01 se prueba haciendo DIVERGIR el apartamento del aseo: el apartamento cambia de tarifas después de que el aseo congeló las suyas. Con las dos iguales, una implementación que uniera contra `properties` daba el mismo número y la aserción no miraba nada."
  - "El aseo viaja en el tiempo hasta el periodo vencido, y es el único viaje de la fase. `cerrar_periodo()` rechaza `periodo_no_vencido` y la interfaz ni ofrece el botón; las dos guardas son correctas y ninguna se tocó. Se mueve el calendario ENTERO del aseo (`scheduled_date`, `confirmado_at`, `started_at`, `finished_at`) para que la fila siga siendo coherente, y el trigger `tg_cleanings_snapshot()` reimpone las tarifas congeladas, así que el movimiento no puede falsear FIN-01 ni queriendo."
  - "La fuga se mide recorriendo las dos pantallas de la aseadora POR DIRECCIÓN, en una segunda pasada. La primera pasada entra como entra ella —tocando su tarjeta— y prueba la interfaz; la segunda mide, porque el cuerpo de una carga de cliente no está siempre disponible."
  - "`entregarPushAlWorker()` y `interceptarCargaUtil()` se duplican a propósito de `push-instalacion.spec.ts` y `mis-pagos.spec.ts`: un spec que importa otro spec registra sus casos una segunda vez, y este plan tiene prohibido editar los specs anteriores."

patterns-established:
  - "Prefijo `JUNTA N ·` en el mensaje de cada aserción de un recorrido largo: el rojo dice en qué eslabón de la cadena se rompió antes de decir qué"
  - "`expect.soft` como DIAGNÓSTICO de un señuelo para medir su radio completo, nunca como aserción permanente (heredado de 09-01 y usado tres veces aquí)"
  - "Un señuelo que no pone nada en rojo es un HALLAZGO y se persigue hasta la causa, aunque cueste dos vueltas de instrumento"

requirements-completed: []

coverage:
  - id: D9-3
    description: "Un checkout publicado en un `.ics` llega hasta el pago de la aseadora en UN caso, sin que nadie escriba una fila de aseo"
    verification:
      - kind: e2e
        ref: "e2e/recorrido-core.spec.ts#EL RECORRIDO DEL CORE VALUE: un checkout del .ics acaba en el pago de la aseadora, sin que nadie escriba una fila de aseo"
        status: pass
    human_judgment: false
  - id: J1
    description: "sync → aseo: el aseo nace del feed, el día del DTEND, sin dueño y sin confirmar"
    verification:
      - kind: e2e
        ref: "e2e/recorrido-core.spec.ts#JUNTA 1"
        status: pass
    human_judgment: false
  - id: J2
    description: "confirmación → asignación: confirmar por la interfaz asigna a la responsable fija (no a la suplente, no a quien confirmó) y materializa el checklist"
    verification:
      - kind: e2e
        ref: "e2e/recorrido-core.spec.ts#JUNTA 2"
        status: pass
    human_judgment: false
  - id: J3
    description: "asignación → push: la confirmación escribe el aviso dirigido a la responsable, y el service worker lo pinta con el destino de ese aseo"
    verification:
      - kind: e2e
        ref: "e2e/recorrido-core.spec.ts#JUNTA 3"
        status: pass
    human_judgment: false
  - id: J4
    description: "ejecución → evidencia: la foto sube bytes de verdad, el objeto existe en el bucket, y el admin ve la miniatura firmada"
    verification:
      - kind: e2e
        ref: "e2e/recorrido-core.spec.ts#JUNTA 4"
        status: pass
    human_judgment: false
  - id: J5
    description: "aseo → dinero: el margen sale del aseo y no del apartamento, y el aseo entra en el pago del periodo cerrado, visible en las dos sesiones"
    verification:
      - kind: e2e
        ref: "e2e/recorrido-core.spec.ts#JUNTA 5"
        status: pass
    human_judgment: false
  - id: T-09-15
    description: "Ninguna cifra de huésped ni ningún margen llega al navegador de la aseadora, buscados en los dos formatos, contra la red y contra el documento"
    verification:
      - kind: e2e
        ref: "e2e/recorrido-core.spec.ts#JUNTA 5 · FUGA"
        status: pass
    human_judgment: false
  - id: T-09-17
    description: "Las aserciones nuevas se vieron en rojo antes de darse por buenas: siete señuelos, once corridas"
    verification:
      - kind: other
        ref: "BITÁCORA DE SEÑUELOS (plan 09-04) en la cabecera de e2e/recorrido-core.spec.ts"
        status: pass
    human_judgment: false

duration: 3h20min
completed: 2026-09-18
status: complete
---

# Fase 9 Plan 04: El recorrido del Core Value entero, en UN caso — Summary

**Un checkout publicado en un `.ics` servido en 127.0.0.1 termina en el recibo que la aseadora abre en su teléfono, en un solo `test()` y sin que nadie escriba una fila de aseo: las cinco juntas que el proyecto existe para sostener quedan probadas por la interfaz, y tres de los siete señuelos destaparon que una aserción no podía atrapar lo que decía atrapar.**

## Performance

- **Duration:** ~3 h 20 min
- **Tasks:** 3 de 3
- **Files modified:** 2, los dos de pruebas. **Cero archivos de producto en el diff.**

## Accomplishments

- **El caso más importante del repo existe y pasa.** Un `.ics` con un `Reserved` cuyo checkout es hoy → sincronización por HTTP contra el worker real → un aseo `origin = 'ical'`, pendiente, sin dueño → el admin lo confirma en `/operacion` con huéspedes e instrucciones → queda asignado a su responsable fija con su checklist de seis tareas → la confirmación escribe el aviso y el service worker lo pinta con el destino de ESE aseo → la aseadora entra desde su lista, marca las seis tareas, sube una foto con bytes de verdad y pulsa terminar → el admin ve la miniatura firmada en el panel → el aseo aparece en `/finanzas/aseos` con su margen → el admin cierra el periodo desde su pantalla → la aseadora ve el recibo con ese aseo dentro.
- **La primera subida de bytes al bucket desde la interfaz, con sus tres capas afirmadas:** la fila de `cleaning_photos` con `bytes > 0`, el objeto DESCARGADO del bucket con el peso que la fila declara, y la miniatura firmada en el panel del admin. Es la rama que escondió un error de servidor durante tres planes (`08-13`).
- **FIN-01 con señal de verdad:** el apartamento cambia de tarifas *después* de que el aseo congeló las suyas, así que la pantalla del dinero solo puede acertar leyendo el snapshot del aseo. Sin esa divergencia, la aserción del margen no miraba nada.
- **La contraparte de seguridad, con un control de alcance que este plan tuvo que inventar** porque el de `mis-pagos.spec.ts` no alcanza cuando la pantalla se abre por navegación de cliente.
- **Siete señuelos, once corridas, tres hallazgos** (abajo).

## Task Commits

1. **Task 1: Del feed al aseo confirmado y asignado a su responsable fija** — `9b82250` (test)
2. **Task 2: El aviso que sale de la asignación, y la evidencia que sube bytes de verdad** — `1f441b0` (test)
3. **Task 3: El dinero, el pago del periodo, y los siete señuelos** — `acc8af3` (test)

> **Nota de contabilidad:** `git rev-list --count f882260..HEAD` mide **4** commits. Uno de ellos, `2cae7f5` (`docs: la chuleta de cómo correr las pruebas`), **no es de este plan**: lo hizo el dueño mientras el plan corría. Se deja el número medido y no el narrado; los tres del plan son los de la tabla.

## Files Created/Modified

- `e2e/recorrido-core.spec.ts` — 357 → **1511 líneas**. El recorrido del Core Value (885 líneas de caso), su cabecera con las cinco juntas, la bitácora de los siete señuelos, y los helpers locales (`esperarAvisoQueEmpiezaCon`, `pesos`, `enLasDosFormas`, `interceptarCargaUtil`, `escaparParaRegex`).
- `e2e/recorrido.fixtures.ts` — 801 → **1116 líneas**. `entregarPushAlWorker()`, `periodoVencidoSinCerrar()`, `adelantarElCalendarioDelAseo()`, la opción `suplente` prestada, y la limpieza del periodo cerrado.

## Decisions Made

Las seis de `key-decisions`. Las dos que más peso tienen para los planes que siguen:

**El aseo viaja en el tiempo, y es el único viaje de la fase.** Un aseo terminado hoy pertenece al periodo EN CURSO, y el periodo en curso no se puede cerrar: `cerrar_periodo()` rechaza con `periodo_no_vencido` y `periodo_pendiente_de_cierre()` ni siquiera devuelve fila, porque cerrar por adelantado pagaría trabajo que aún no ocurrió y un periodo cerrado no se recalcula jamás (D7-3). Las dos guardas son correctas y ninguna se tocó. Las alternativas eran no probar la última junta, o probarla llamando al RPC por debajo de la interfaz; las dos dejan sin probar lo que el dueño va a tocar con el dedo. Así que se mueve el aseo, con el calendario ENTERO (`scheduled_date`, `confirmado_at`, `started_at`, `finished_at`) y por el mismo número de días, para que `cl_completada_shape` siga satisfecho y la fila siga siendo internamente coherente. **Lo que esto no puede falsear:** el trigger `tg_cleanings_snapshot()` reimpone las tarifas viejas en todo `UPDATE` sobre un aseo terminal, incluso con la clave de servicio, así que el snapshot de FIN-01 llega al cierre intacto.

**La fuga se mide por dirección, no por navegación de cliente.** Medido con su error literal: `response.text: Protocol error (Network.getResponseBody): No data found for resource with given identifier`. Ver el hallazgo 1.

## Deviations from Plan

**Ninguna desviación de producto: cero archivos de producto en el diff del plan.** Las tres desviaciones son del propio instrumento y las tres las obligó la disciplina de señuelos.

### 1. [Instrumento] La fuga se mide por dirección, y el control es por contenido

- **Encontrado durante:** Task 3, señuelo 6, que dejó el caso **en verde dos veces seguidas**.
- **Síntoma, primera vuelta:** con la tarifa del aseo colgada de la línea del desglose como atributo de datos, el caso pasó. El volcado: `CARGA /mis-pagos len 15686 214609? false` junto a `HTML de la pantalla incluye 214609? true`.
- **Causa medida:** el control era «el interceptor capturó ALGUNA carga», copiado de `mis-pagos.spec.ts`. Quedaba satisfecho con el documento de la LISTA, así que el bucle de las cifras prohibidas corría antes de que la carga del DESGLOSE terminara de leerse (`response.text()` es asíncrono y el oyente no bloquea la navegación). **La fuga estaba en la pantalla que no se miró.**
- **Síntoma, segunda vuelta:** cambiar el control a «se capturó la carga de ESTA dirección» tampoco bastó. Next PREFETCHEA el enlace, así que hay dos respuestas contra la misma URL: `?_rsc=liegek… len 260 214609? false` (el tocón del prefetch, cuyo cuerpo el navegador descarta) y `?_rsc=0eShry… len 4744 214609? TRUE` (la de verdad).
- **Arreglo, en dos piezas:** (a) la medición de la fuga recorre las dos pantallas **por dirección** (`goto`), que devuelve un documento completo cuyo cuerpo está siempre disponible, en una segunda pasada tras la pasada funcional que entra tocando la tarjeta; (b) el control es **por contenido**: alguna carga tiene que traer el nombre del apartamento, que solo está en el desglose.
- **Verificación:** con el señuelo puesto y el instrumento arreglado, rojo determinista en `JUNTA 5 · FUGA: la cifra 214609 viajó al navegador de la aseadora en /mis-pagos/{id}…`.
- **Ninguna aserción se debilitó:** las dos correcciones hacen que se mire MÁS, no menos.
- **Commit:** `acc8af3`.

### 2. [Instrumento] La entrega del push se reintenta una vez

- **Encontrado durante:** Task 3, tras dejar el recorrido en verde. `--repeat-each=5` dio **1 rojo de 5** en `El service worker no mostró ninguna notificación`, quemando los 15 s del sondeo.
- **Causa:** `ServiceWorker.deliverPushMessage` es un disparo sin acuse; el protocolo responde al aceptar el mensaje, no al procesarlo. Es la misma intermitencia que el `deferred-items.md` de la Fase 8 declara para el caso E2 de `push-instalacion.spec.ts`, que usa este mismo instrumento; aquí se reprodujo **con el archivo aislado**, que es un dato nuevo (la Fase 8 la había visto solo en la suite completa).
- **Arreglo:** `entregarPushAlWorker()` reintenta **la entrega** una vez tras 15 s sin ver nada, con una segunda ventana de 20 s. **El reintento no toca la medida:** quien llama sigue exigiendo EXACTAMENTE una notificación, así que si la primera entrega solo hubiera sido lenta, la segunda produciría dos avisos y el caso se pondría rojo diciéndolo.
- **Verificación:** antes 4/5; después **6 de 6** en verde, y los tiempos volvieron de 22-27 s a 12-16 s.
- **Commit:** `acc8af3`.

### 3. [Instrumento] El bucle del checklist abre cada cuarto

- **Encontrado durante:** Task 2, primera corrida del tramo de campo: `Expected: 6, Received: 3`.
- **Causa medida:** `marcar()` de `ChecklistPorCuarto.tsx` RECOGE el cuarto que queda completo y **no abre el siguiente**; al montar, el único abierto es el primer cuarto incompleto. Un bucle que solo mirara casillas visibles marcaba el primer cuarto y se quedaba sin nada que tocar.
- **Arreglo:** el bucle recorre los cuartos que la junta 2 acaba de leer de la base, abre cada cabecera si estaba recogida, y marca. No sabe cuántos cuartos hay ni cómo se llaman: lo dice la base.
- **Commit:** `1f441b0`.

---

**Total desviaciones:** 3, las tres de instrumento, ninguna de producto. **Ninguna aserción se debilitó.**

## Bitácora de señuelos

Siete señuelos, **once corridas** (tres diagnósticos con `expect.soft` para medir radios, y dos vueltas extra del señuelo 6). Cada defecto se metió en el **producto**, se corrió, se anotó el mensaje literal en rojo, se revirtió y se volvió a verde.

| # | Junta | Qué se rompió | Qué se puso rojo (mensaje literal) |
|---|---|---|---|
| 1 | sync → aseo | `lib/domain/ical-normalizar.ts`: un día menos al `DTEND` | `JUNTA 1 · el aseo va el día del DTEND (2026-09-18), SIN sumarle ni restarle un día…` — esperado `2026-09-18`, recibido `2026-09-17` |
| 2 | confirmación → asignación | migración 09, `confirm_cleaning`: `aseador_id = (select auth.uid())`, o sea a quien confirma | `JUNTA 2 · el aseo queda asignado a la RESPONSABLE FIJA del apartamento (Aseador Uno E2E)…`. **La aserción de PANTALLA siguió verde**, y es correcto: `Queda asignado a …` sale del catálogo, no de lo que la RPC escribe |
| 3 | asignación → push | migración 09: el `insert` del outbox con `and false` | `JUNTA 3 · confirmar deja UN aviso en el outbox…` — esperado 1, recibido 0 |
| 4 | ejecución → evidencia | `lib/data/recibos.ts`: firmar una ruta inexistente (firma fallida con la foto ya subida) | **SOLO** `JUNTA 4 · el admin ve la MINIATURA FIRMADA de la foto que subió la aseadora…` — esperado 1, recibido 0 |
| 5 | aseo → dinero | migración 26, `rentabilidad_aseos`: `coalesce(pr.tarifa_huesped…)` en vez de `c.` | `JUNTA 5 · lo COBRADO es la tarifa que el aseo congeló al nacer (214609), no la que el apartamento tiene hoy (333137)…` |
| 6 | seguridad, formato crudo | `DesgloseDeMiPago.tsx`: la tarifa del aseo colgada de la línea como atributo de datos (viaja, no se pinta) | `JUNTA 5 · FUGA: la cifra 214609 viajó al navegador de la aseadora en /mis-pagos/{id}…`. **Solo la mitad de RED** |
| 7 | seguridad, formato pintado | `DesgloseDeMiPago.tsx`: el margen pintado al lado del monto | `JUNTA 5 · FUGA: la cifra 152.766 viajó…` **y** `JUNTA 5 · y la cifra 152.766 tampoco está pintada en la pantalla de la aseadora`. **Las DOS mitades** |

### Los tres hallazgos, que es lo que la disciplina existe para producir

**Hallazgo 1 — el señuelo 6 no puso nada en rojo, dos veces.** Ver la desviación 1. Obligó a cambiar el instrumento dos veces, y la lección es greppable: un control de interceptor no puede ser «se capturó algo» ni «se capturó esta dirección», tiene que ser «se capturó algo que SOLO está en la pantalla que quiero medir».

**Hallazgo 2 — la mitad del dispositivo del push NO puede atrapar el señuelo 3, y está medido.** Con `expect.soft` sobre la aserción del outbox, el caso muere con `TypeError: Cannot read properties of undefined (reading 'type')`. No es un descuido del instrumento: el payload del push **se construye A PARTIR de la fila** que la RPC escribió, así que sin fila no hay nada que entregar. Es exactamente lo que hace que la mitad del servidor no sea redundante con la del dispositivo, y lo que el plan predijo («la aserción de la notificación, y **no** la del service worker»).

**Hallazgo 3 — «el margen es lo cobrado menos lo pagado» no puede atrapar el señuelo 5.** Con `expect.soft`, el defecto de FIN-01 pone rojas **seis** aserciones: cobrado, pagado, el margen contra su valor esperado, y las tres negativas de las cifras del apartamento (`333.137`, `99.401`, `233.736`). La que **no** cae es la de consistencia interna (`margen === cobrado − pagado`), y es correcto: leerlo todo del apartamento es internamente consistente. Esa aserción enuncia una invariante de la tabla, no la de FIN-01, y no se pueden confundir.

### Contabilidad de aserciones y señuelos

- **Sitios de aserción que añade el plan: 75** en el caso nuevo (73 `expect(...)` más 2 sondeos `expect.poll`), de los cuales 3 corren dentro de bucles sobre las cifras prohibidas. Por junta: J1 **8**, J2 **16**, J3 **9**, J4 **17**, J5 **25**.
- **Señuelos corridos: 7** (once corridas contando los tres diagnósticos con `expect.soft` y las dos vueltas extra del señuelo 6).
- **Por qué 7 y no 75:** los señuelos cubren siete FAMILIAS, una por hecho que no se deriva de otro: la fecha del aseo, a quién se asigna, que confirmar produzca el aviso, que la evidencia se pueda firmar, que la cifra salga del aseo, y las dos formas en que una cifra prohibida puede llegar al teléfono. El resto de las aserciones de cada familia son el mismo hecho medido en otra capa, y los tres diagnósticos con `expect.soft` midieron exactamente ese radio en vez de suponerlo.
- **Lo que NO se puede cubrir con un señuelo, y está dicho arriba:** la mitad del dispositivo del push frente a un outbox vacío (hallazgo 2) y la aserción de consistencia del margen (hallazgo 3). Las dos se conservan porque enuncian intenciones distintas de las que sí son falsables.

## Barrido de instrumento

Sobre los dos archivos del plan:

| Grep sobre `e2e/recorrido-core.spec.ts` | Resultado | Exigido |
|---|---|---|
| `cleanings').insert` \| `cleanings").insert` | **0** | 0 |
| `locator('main')` | **0** | 0 |
| `getByRole('alert')` | **0** | 0 |
| `waitForURL` \| `toHaveURL`, fuera de comentarios | **0** | 0 |
| `construirPayload` | **2** | ≥ 1 |
| `setInputFiles` | **1** | ≥ 1 |
| `getByRole('dialog')` | **4** | ≥ 1 |

> **Matiz honesto sobre el cuarto grep:** el criterio del plan pedía `grep -c "waitForURL\|toHaveURL"` en **0**, y el grep crudo da **1**. La única ocurrencia está dentro de un comentario que nombra la trampa 8 de `TESTING.md` para quien lea el caso (`// … `page.waitForURL` inyecta su bucle dentro del documento y …`). Fuera de comentarios el conteo es 0, que es lo que el criterio quiere decir. Se deja el comentario porque nombrar la trampa es la mitad de su valor.

Diff vacío sobre lo protegido, con rango explícito desde el arranque de la fase:

```
git diff --name-only 6e45c8e..HEAD -- 'app/(cleaner)' \
  lib/domain/suscripcion.schema.ts lib/domain/ical-url.schema.ts   → vacío
git diff --name-only f882260..HEAD                                  → solo e2e/ (más el commit ajeno 2cae7f5)
```

**No se tocó la allowlist de push ni la de iCal, y no se apagó ninguna verificación de TLS.** El salto de `web-push` a FCM queda declarado fuera **en el comentario del propio caso**, con las tres razones y con dónde sí se prueba (`lib/domain/push-drenaje.integration.test.ts`).

## Las cuatro suites, medidas

Con `npm run db:reset` delante de las dos que lo exigen y con `PLAYWRIGHT_PORT=3210`.

| Suite | Medido | Línea base previa | Veredicto |
|---|---|---|---|
| `npm run test:unit` | **1236 / 1236** en 65 archivos | 1236 | exacta |
| `npm run test:integration` | **205 / 205** en 23 archivos | 205 | exacta |
| `npm run db:test` (pgTAP) | **389 / 389** en 13 archivos | 389 | exacta |
| E2E completa | **160 colectados: 159 verdes, 1 saltado, 0 ROJOS** (5,0 min) | 159 colectados, 158 verdes, 1 saltado | **+1 caso, cero rojos** |

**Cero rojos en la suite completa, incluidos los tres conocidos.** En esta corrida pasaron `push-instalacion.spec.ts:215` (el caso E2, que el `deferred-items.md` de la Fase 8 declara intermitente en la suite completa), `operacion.spec.ts:390` y `operacion-alertas.spec.ts:341`. No se declara ninguno cerrado por una sola corrida en verde: lo único que se afirma es que esta corrida no tuvo ninguno.

Compilación y estructura:

```
npx tsc --noEmit   → sin salida
npm run lint       → 0 errores, 2 warnings PREEXISTENTES
                     (app/(admin)/operacion/_actions.test.ts:48, lib/domain/aseador.schema.test.ts:40)
npm run build      → OK
npm run ci:arch    → check-service-role OK · check-max-w-tallas OK · check-escala-movil OK
```

## Lo que este recorrido NO dice

Está escrito **en el comentario del caso** y no solo aquí, porque quien lea el verde tiene que saberlo:

- **El salto de `web-push` a FCM no se prueba.** `HOSTS_DE_PUSH` no admite loopback a propósito (ampliarla sería abrir una SSRF por comodidad de test); el servicio falso por TLS de `lib/test/push.ts` instala su autoridad en el proceso que hace la petición, y en E2E esa petición la hace el proceso de Next; y apagar la verificación de TLS está prohibido por nombre (T-05-29). Ya está cubierto por `lib/domain/push-drenaje.integration.test.ts`.
- **Nada sobre iOS.** Playwright no ejecuta service workers en WebKit. La entrega real en un iPhone es el procedimiento manual de `docs/matriz-dispositivos.md`.
- **El periodo se cierra sobre un aseo cuyo calendario se movió.** La regla que decide la pertenencia (`dia_bog(finished_at)`, D7-8) se ejercita de verdad y las tarifas congeladas no se pueden falsear, pero el recorrido no espera tres semanas a que el periodo venza por sí solo.

## DEUDA DECLARADA

Las tres entradas van a la compuerta **09-07**, dueña del `deferred-items.md` de la fase. Ninguna lleva `test.fail()`, porque ninguna afirma nada sobre un comportamiento roto del producto.

### D-09-04-A · La intermitencia del push es del instrumento, y su causa sigue sin medir

- **Síntoma:** `El service worker no mostró ninguna notificación`, 1 de cada 5 corridas del recorrido con `--repeat-each=5`, quemando los 15 s del sondeo.
- **Estado:** **mitigado, no resuelto.** `entregarPushAlWorker()` reintenta la entrega una vez y 6 de 6 corridas quedaron verdes. Lo que no se midió es POR QUÉ se pierde la primera entrega: si es una carrera con la activación del worker, si el `registrationId` que reporta `ServiceWorker.workerRegistrationUpdated` puede estar muerto, o si el protocolo descarta el mensaje.
- **Valor del dato para la Fase 8:** su `deferred-items.md` atribuye el rojo del caso E2 a «estado acumulado del service worker tras ~134 casos previos». **Este plan lo reprodujo con el archivo AISLADO y con un perfil de navegador nuevo por corrida**, así que esa hipótesis no se sostiene: la causa no es la acumulación.
- **Archivo y línea:** `e2e/recorrido.fixtures.ts`, `entregarPushAlWorker()`; y `e2e/push-instalacion.spec.ts:215`, que sigue con el instrumento sin reintento.
- **Dueño propuesto: 09-07**, o el plan que toque el push por otra razón. El arreglo barato, si se quiere cerrar sin investigar: aplicar el mismo reintento en `push-instalacion.spec.ts`.

### D-09-04-B · `interceptarCargaUtil()` vive en dos sitios, y uno de los dos tiene el control débil

- **Síntoma:** `e2e/mis-pagos.spec.ts` mide su frontera con el control «alguna carga trae una cifra permitida», que es exactamente el que este plan midió como insuficiente cuando la pantalla se abre por navegación de cliente.
- **Matiz:** allá **no** es un defecto hoy, porque las dos pantallas se abren con `goto()`. Es una trampa esperando a que alguien cambie una navegación por un clic.
- **Por qué no se arregló aquí:** el plan prohíbe editar los specs anteriores, y el arreglo correcto es unificar los dos interceptores en `e2e/fixtures.ts`, que toca `mis-pagos.spec.ts`.
- **Archivo y línea:** `e2e/mis-pagos.spec.ts:141` (`interceptarCargaUtil`) y `:176` (`sinCifrasDeHuesped`).
- **Dueño propuesto: 09-07**.

### D-09-04-C · `entregarPushAlWorker()` es un gemelo declarado de `entregarPush()`

- **Síntoma:** el mismo instrumento en dos sitios (`e2e/recorrido.fixtures.ts` y `e2e/push-instalacion.spec.ts:168`), y ya divergen: uno reintenta la entrega y el otro no.
- **Por qué no se unificó:** un spec no puede importar otro spec sin que Playwright registre sus casos dos veces, y mover el helper allá requiere editar un spec anterior, que este plan tiene prohibido.
- **Dueño propuesto: 09-07**. El sitio al que mover el de `push-instalacion` ya existe.

## Issues Encountered

- **Un commit ajeno entró en medio del plan** (`2cae7f5`, del dueño). No toca ninguno de los dos archivos del plan; queda anotado en la contabilidad de commits para que el recuento medido no se lea como un error.
- **Después de revertir un señuelo de MIGRACIÓN hay que volver a correr `npm run db:reset`.** Costó dos corridas equivocadas: el archivo estaba limpio y la base seguía con la función rota, y el rojo apuntaba a la junta anterior. Es obvio escrito, y no lo es a las tres de la tarde.
- **`docker exec psql` y `psql` no están disponibles en este entorno**, así que los tres señuelos de base se aplicaron editando la migración y corriendo `npm run db:reset` (≈32 s por reset, siete resets en total).

## User Setup Required

Ninguna. El recorrido usa `CRON_SHARED_SECRET`, el stack local de Supabase y el canal `chrome` de Playwright, que ya estaban.

## Next Phase Readiness

**Listo para 09-05 (los recorridos torcidos) y 09-06.** Lo que queda disponible sin escribir una línea más:

- `sembrarUnidadDeRecorrido(servicio, { responsable, suplente })` con usuarios PRESTADOS de la semilla, que es lo que da sesión al tramo de campo y al del push.
- `entregarPushAlWorker(pagina, payload)`, con el reintento ya puesto.
- `periodoVencidoSinCerrar()` y `adelantarElCalendarioDelAseo()`, con la limpieza del periodo cerrado ya enganchada a `limpiarRecorrido()`.
- `interceptarCargaUtil()` con el control por contenido, que es el patrón correcto para cualquier aserción de fuga nueva.
- El patrón del prefijo `JUNTA N ·` en los mensajes, que es lo que hace legible el rojo de un recorrido de setenta y cinco aserciones.

**Lo que 09-07 hereda de aquí:** las tres deudas de arriba, la línea base nueva de E2E (**160 colectados, 159 verdes, 1 saltado**) y el dato que tumba la hipótesis de la Fase 8 sobre el rojo del caso E2.

---
*Phase: 09-el-producto-probado-de-punta-a-punta*
*Completed: 2026-09-18*

## Self-Check: PASSED

- `e2e/recorrido-core.spec.ts`, `e2e/recorrido.fixtures.ts` y `09-04-SUMMARY.md` existen en disco.
- Los tres commits del plan existen en el historial: `9b82250`, `1f441b0`, `acc8af3`.
- Las cuatro referencias de archivo y línea de la deuda declarada se verificaron contra el árbol.
