---
phase: 05-notificaciones-push-e-instalaci-n-de-la-pwa
plan: 05
subsystem: api
tags: [web-push, vapid, declarative-web-push, apns, payload, typescript, vitest, tdd]

requires:
  - phase: 05-01
    provides: "web-push@3.6.7, @types/web-push@3.6.4 y el par VAPID en .env.local"
  - phase: 05-04
    provides: "esClaveDeTopicValida(), claveDeColapso() y ClaseDeAviso en lib/push/colapso.ts; decidir() y la union cerrada MotivoDePush en lib/push/errores.ts"
  - phase: 02
    provides: "readServerSecret() y publicEnv() en lib/env.ts, y el patron de import 'server-only' de lib/supabase/admin.ts"
  - phase: 03
    provides: "el patron LineaDeLog del worker de sync: la garantia es el tipo, no la disciplina"
provides:
  - "construirPayload(): las dos envolturas de D-07 (declarativa y clasica) sobre un solo objeto, con tope de 3 KB"
  - "EntradaDePayload: subconjunto cerrado de cinco campos de notifications, sin ranura para el codigo de acceso ni el huesped (D-06)"
  - "urgenciaDe(), TTL_SEGUNDOS, LIMITE_BYTES, RUTA_POR_DEFECTO"
  - "enviar(): envoltura de web-push que no propaga fallos del push service, con TTL, urgency, topic y timeout"
  - "RespuestaDePush: los tres campos que consume decidir(), y ninguno mas"
  - "configurarVapid(): configuracion perezosa, memoizada y validada del par VAPID"
  - "TIMEOUT_MS = 10_000"
affects: [05-06, 05-07, 05-08, 06]

tech-stack:
  added: []
  patterns:
    - "El tipo de entrada como garantia de no-fuga: EntradaDePayload y RespuestaDePush no tienen ranura donde poner el secreto, igual que LineaDeLog en el worker de la Fase 3"
    - "Dos ramas separadas por destino en vez de una envoltura siempre presente, para que los dos caminos de D-07 se puedan probar"
    - "Configuracion de servidor perezosa y memoizada, validada FUERA del try/catch: el fallo global sale por arriba, el fallo por suscripcion vuelve como codigo"
    - "Prueba de compilacion con @ts-expect-error como red de seguridad bidireccional: si el campo dejara de estar prohibido, tsc falla por directiva sobrante"

key-files:
  created:
    - lib/push/payload.ts
    - lib/push/payload.test.ts
    - lib/push/envio.ts
    - lib/push/envio.test.ts
  modified: []

key-decisions:
  - "navigate y datos.url llevan LA MISMA cadena absoluta, construida con el origen que entra por parametro; el modulo sigue siendo puro y no lee process.env"
  - "La clave de colapso entra a construirPayload por opciones (no por EntradaDePayload) y se valida con el criterio de la cabecera Topic: D-05 exige que las dos capas colapsen con la misma clave"
  - "enviar() nunca lanza por un fallo del push service, pero SI lanza por configuracion rota: configurarVapid() va fuera del try/catch"
  - "Una notifications.url que apunte fuera del origen o a un esquema ejecutable cae a RUTA_POR_DEFECTO"
  - "El TTL son cuatro horas, la misma ventana que agota el backoff de errores.ts (4 860 s)"

patterns-established:
  - "Codigos de error de union cerrada en los throw del constructor (origen_invalido, tag_invalido, payload_excede_limite), sin arrastrar el payload en el mensaje"
  - "Tests de modulo con secreto de servidor: vi.resetModules() + import dinamico por caso, porque la configuracion es memoizada por proceso"

requirements-completed: [NOTIF-01, NOTIF-02]

coverage:
  - id: D1
    description: "construirPayload() emite la envoltura declarativa (clave magica + notification con title y navigate) para un destino que la soporta, y la clasica para el resto"
    requirement: NOTIF-01
    verification:
      - kind: unit
        ref: "lib/push/payload.test.ts#U7 · rama declarativa, para un destino que la soporta > lleva la clave magica, un notification completo y ademas el bloque clasico"
        status: pass
      - kind: unit
        ref: "lib/push/payload.test.ts#rama clasica, para un destino que NO soporta la declarativa > no lleva ni la clave magica ni el objeto declarativo, y si el bloque de datos"
        status: pass
    human_judgment: false
  - id: D2
    description: "El codigo de acceso y el nombre del huesped no pueden entrar en un payload: no hay ranura en el tipo, y no aparecen en el JSON (D-06, T-05-03)"
    requirement: NOTIF-01
    verification:
      - kind: unit
        ref: "lib/push/payload.test.ts#U6 · D-06: el codigo de acceso y el huesped no caben en el payload"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit (los dos @ts-expect-error siguen siendo necesarios; ensanchar el tipo produce TS2578)"
        status: pass
    human_judgment: false
  - id: D3
    description: "El payload nunca supera los 3 KB: pasarse lanza payload_excede_limite en vez de producir un 413"
    requirement: NOTIF-01
    verification:
      - kind: unit
        ref: "lib/push/payload.test.ts#U6 · el tope de bytes"
        status: pass
    human_judgment: false
  - id: D4
    description: "La cabecera Topic que sale hacia el push service siempre cabe en 32 caracteres base64url; un UUID crudo se rechaza en el constructor y se omite en el envio"
    requirement: NOTIF-01
    verification:
      - kind: unit
        ref: "lib/push/payload.test.ts#U8 · la clave de colapso"
        status: pass
      - kind: unit
        ref: "lib/push/envio.test.ts#las cabeceras del envio > un topic que no cabe en la cabecera NO se manda, en vez de mandarse roto"
        status: pass
    human_judgment: false
  - id: D5
    description: "Un fallo de red o de APNs nunca se propaga como excepcion al worker: vuelve como codigo (T-05-23)"
    requirement: NOTIF-02
    verification:
      - kind: unit
        ref: "lib/push/envio.test.ts#enviar() nunca propaga un fallo del push service"
        status: pass
      - kind: other
        ref: "senuelo manual: quitar el try/catch pone 3 tests en rojo; restaurarlo los devuelve a verde"
        status: pass
    human_judgment: false
  - id: D6
    description: "VAPID se configura una sola vez por proceso, con las dos variables de servidor por readServerSecret y un subject validado contra hosts locales (T-05-09, T-05-24)"
    requirement: NOTIF-02
    verification:
      - kind: unit
        ref: "lib/push/envio.test.ts#la configuracion de VAPID"
        status: pass
      - kind: other
        ref: "npm run ci:arch"
        status: pass
    human_judgment: false
  - id: D7
    description: "El endpoint y las claves de la suscripcion no tienen donde guardarse en lo que devuelve enviar() (T-05-04)"
    requirement: NOTIF-02
    verification:
      - kind: unit
        ref: "lib/push/envio.test.ts#T-05-04 · lo devuelto no tiene donde guardar una credencial"
        status: pass
    human_judgment: false

duration: 24min
completed: 2026-09-11
status: complete
---

# Fase 5 Plan 05: El constructor del payload y la envoltura de `web-push` — Summary

**Lo que sale del servidor hacia el push service queda cerrado por tipo en los dos extremos: el código de acceso no cabe en la entrada del payload y el endpoint de la suscripción no cabe en la salida del envío, y ninguna de las dos garantías depende de que alguien se acuerde.**

## Performance

- **Duration:** 24 min
- **Started:** 2026-09-11T15:44:00Z
- **Completed:** 2026-09-11T16:08:00Z
- **Tasks:** 2 de 2
- **Files modified:** 4 creados, 0 modificados

## Accomplishments

- `lib/push/payload.ts`: `construirPayload()` emite **dos envolturas separadas** según el destino (D-07), con `EntradaDePayload` cerrado en cinco campos. D-06 queda probado dos veces, por síntoma y por causa: el JSON no contiene las claves prohibidas, y pasarlas es un error de compilación cazado con `@ts-expect-error`. Verificado en los dos sentidos: ensanchar el tipo produce `TS2578 Unused '@ts-expect-error' directive` y `tsc` falla.
- `lib/push/envio.ts`: `enviar()` reconstruye la respuesta **campo a campo** desde el objeto de error de `web-push`, así que un `410` de una suscripción revocada no mata las otras catorce notificaciones de la tanda (T-05-23). Señuelo corrido en los dos sentidos.
- La configuración de VAPID es perezosa, memoizada por proceso y **validada antes de firmar**: un `VAPID_SUBJECT` apuntando a un host local falla acá con un mensaje que nombra la variable y la regla, en vez de aparecer como `BadJwtToken` solo en producción y solo contra los teléfonos de Apple (T-05-24).
- 32 tests nuevos (20 + 12), todos en verde. Suite completa: **36 archivos / 654 tests**, desde la línea base de 34 / 622.

## Task Commits

1. **Task 1: `lib/push/payload.ts`** — `3fbcf72` (test, RED) → `645a781` (feat, GREEN)
2. **Task 2: `lib/push/envio.ts`** — `973379a` (test, RED) → `2943da7` (feat, GREEN)

Sin fase de refactor: ninguno de los dos módulos la necesitó.

## Files Created/Modified

- `lib/push/payload.ts` — El constructor. Puro: no importa `web-push`, no lee entorno, no toca la base. Exporta `construirPayload()`, `urgenciaDe()`, `LIMITE_BYTES`, `TTL_SEGUNDOS`, `RUTA_POR_DEFECTO`, `EntradaDePayload` y `OpcionesDePayload`.
- `lib/push/payload.test.ts` — 20 tests: U6 (tamaño + D-06 por síntoma y por causa), U7 (las dos ramas, una por test con nombre propio), U8 (la clave de colapso), verbatim del copy, destino del toque y recorrido del enum entero.
- `lib/push/envio.ts` — La envoltura. `import 'server-only'`, VAPID perezoso y memoizado, `enviar()`, `configurarVapid()`, `RespuestaDePush`, `SuscripcionDePush`, `OpcionesDeEnvio`, `TIMEOUT_MS`.
- `lib/push/envio.test.ts` — 12 tests con `vi.mock` sobre `web-push` y recarga del módulo por caso.

## Decisions Made

**1. `navigate` y `datos.url` llevan la misma cadena ABSOLUTA.**
El plan pedía dos cosas que en la letra chocaban: que `navigate` y `data.url` fueran «la misma cadena», y que el bloque declarativo recibiera una URL absoluta por parámetro. Se resolvió absolutizando las dos contra el `origen` que entra por `opciones`, así que son literalmente idénticas (el test lo afirma con `toBe` entre las dos) y la declarativa cumple lo que WebKit documenta. El módulo sigue sin leer `process.env`.

**2. La clave de colapso entra por `opciones`, no por `EntradaDePayload`.**
`claveDeColapso()` necesita `recipient_id`, `cleaning_id` y `dedupe_key`, tres campos que D-06 mantiene fuera del tipo de entrada. Meterlos para calcular el `tag` habría abierto el tipo cerrado justo por donde no puede abrirse. El worker, que sí tiene la fila entera, calcula la clave y la pasa hecha.

**3. `construirPayload()` valida el `tag` con el criterio de la cabecera `Topic`, y lanza.**
Un `tag` es legal con cualquier cadena en la API de notificaciones; un `Topic`, no. Pero D-05 exige que las dos capas colapsen con **la misma** clave: si una vale como `tag` y no como `Topic`, la bandeja del teléfono y el servidor de push colapsan distinto, en silencio, que es exactamente el fallo que D-05 existe para impedir. Se rechaza en el constructor, donde el UUID crudo del señuelo U8 se ve.

**4. `enviar()` no lanza por el push service, pero sí por configuración rota.**
`configurarVapid()` va **fuera** del `try`. Una clave ausente o un subject mal formado no hacen fallar una suscripción: hacen fallar las ocho. Tragárselo y devolver un código las convertiría en ocho fallos indistinguibles de una caída de red, cada uno quemando sus cuatro reintentos. Es `abortar_corrida` de `errores.ts`, tomado un escalón antes.

**5. `TTL_SEGUNDOS = 4 h`, atado a la ventana del backoff.**
El backoff de `errores.ts` agota cuatro casillas en 4 860 s (1 h 21 m). Un TTL menor haría reintentar contra un aviso que el push service ya descartó; uno mucho mayor mantendría vivo un aviso que ya no sirve. Cuatro horas cubren la ventana entera con margen.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Missing critical functionality] El `tag` no tenía por dónde llegar al service worker**
- **Found during:** Task 1
- **Issue:** D-05 y `05-UI-SPEC` §10.2 exigen que `Topic` (servidor de push) y `tag` (bandeja del teléfono) lleven la misma clave. El service worker solo recibe el payload, así que sin una ranura para el `tag` en el payload el colapso de la bandeja era **inimplementable**, y el plan del SW habría tenido que volver a abrir este módulo.
- **Fix:** `OpcionesDePayload.tag?: string`, validado con `esClaveDeTopicValida()` y emitido en `notification.tag` (rama declarativa) y en `datos.tag` (las dos ramas). Sin `tag`, ninguna rama lo declara.
- **Files modified:** `lib/push/payload.ts`, `lib/push/payload.test.ts`
- **Verification:** 3 tests en `describe('U8 · la clave de colapso')`, incluido el señuelo del UUID crudo.
- **Committed in:** `645a781`

**2. [Rule 2 — Security] `notifications.url` se sanea antes de convertirse en destino de navegación**
- **Found during:** Task 1
- **Issue:** `rutaSegura()` no estaba en el plan. Al absolutizar contra un origen, una `url` que empezara por `//host` o por un esquema ejecutable produciría un `navigate` hacia otro origen. El aviso se toca **desde la pantalla de bloqueo**, donde no hay barra de direcciones que delate el salto. Hoy los RPC solo escriben rutas relativas, así que es defensa en profundidad, no un bug vivo.
- **Fix:** solo se acepta una ruta que empiece por una única barra; cualquier otra cosa cae a `RUTA_POR_DEFECTO`. `origen` que no sea una URL absoluta `http(s)` lanza `origen_invalido`.
- **Files modified:** `lib/push/payload.ts`, `lib/push/payload.test.ts`
- **Verification:** test `una url que apunta fuera del origen cae a la ruta por defecto`, con tres vectores.
- **Committed in:** `645a781`

**3. [Rule 3 — Blocking] `configurarVapid()` exportado y colocado fuera del `try/catch`**
- **Found during:** Task 2
- **Issue:** El plan pedía a la vez «`enviar()` nunca lanza» y «con `VAPID_SUBJECT` apuntando a un `localhost`, la configuración falla en el arranque del módulo». Con la configuración dentro del `try`, el segundo requisito era inalcanzable: el error se habría tragado y devuelto como `statusCode: 0`, que `decidir()` clasifica como bug sin clasificar en vez de como configuración global rota.
- **Fix:** `configurarVapid()` se exporta (el worker puede exigirla una vez antes de la tanda) y se llama **antes** del `try` dentro de `enviar()`. La propiedad queda escrita con precisión en la cabecera: no lanza por un fallo del push service; sí lanza por configuración rota.
- **Files modified:** `lib/push/envio.ts`, `lib/push/envio.test.ts`
- **Verification:** los 3 tests de rechazo resuelven; los 2 de configuración rota rechazan y además afirman que `sendNotification` **no** se llamó.
- **Committed in:** `2943da7`

---

**Total deviations:** 3 auto-fixed (2 × Rule 2, 1 × Rule 3)
**Impact on plan:** Ninguna amplía el alcance. Las dos primeras cierran huecos que habrían obligado a reabrir `payload.ts` desde el plan del service worker; la tercera resuelve una contradicción interna del plan en el único sentido consistente con el modelo de amenazas.

## Señuelos corridos en los dos sentidos

Lo exige `<verification>` del plan. Todos corridos sobre el árbol real y revertidos.

| Señuelo | Al romperlo | Al restaurarlo |
|---|---|---|
| **U6 / D-06 (causa):** añadir `codigo_acceso?: string` y `nombre_huesped?: string` a `EntradaDePayload` | `tsc --noEmit` falla con **`TS2578: Unused '@ts-expect-error' directive`** en `payload.test.ts:100` y `:115` | `tsc` en cero |
| **U7:** quitar `web_push: 8030` de la rama declarativa | 1 test en rojo (`lleva la clave mágica…`), `grep -c 8030` pasa de 1 a 0 | 20/20 en verde |
| **T-05-23:** quitar el `try/catch` de `enviar()` | **3 tests en rojo**: los dos de rechazo y el de no-fuga de la credencial | 12/12 en verde |

La propiedad del `@ts-expect-error` es la interesante: no solo falla si el campo se cuela, también falla si el campo **deja de estar prohibido**. Es una red bidireccional, y es lo que convierte D-06 en una garantía en vez de una convención.

## Issues Encountered

**`publicEnv()` valida las tres variables públicas de golpe.** Leer `NEXT_PUBLIC_VAPID_PUBLIC_KEY` por `publicEnv()`, como pedía el plan, arrastra la validación de las dos de Supabase. En producción da igual (están puestas), pero obliga al test a montarlas. Se documentó en el propio test en vez de abrir una segunda superficie de lectura en `lib/env.ts`.

**La memoización choca con los tests.** `configurado` es estado de módulo, así que un test que valide un subject roto pasaría en verde arrastrando la configuración del anterior. Se resolvió con `vi.resetModules()` + `import()` dinámico por caso, encapsulado en un helper `cargar()`. Queda escrito en el archivo por qué, porque el falso verde sería silencioso.

## Verificación final

| Puerta | Resultado |
|---|---|
| `npm run test:unit` | **36 archivos / 654 tests**, PASS (línea base: 34 / 622) |
| `npx tsc --noEmit` | cero |
| `npm run lint` | 0 errores, 2 warnings preexistentes |
| `npm run ci:arch` | `check-service-role: OK`, `check-max-w-tallas: OK` |
| `npm run build` | verde, 11 rutas (sin cambios respecto a la línea base) |

## Self-Check: PASSED

- `lib/push/payload.ts` — FOUND
- `lib/push/payload.test.ts` — FOUND
- `lib/push/envio.ts` — FOUND
- `lib/push/envio.test.ts` — FOUND
- `3fbcf72`, `645a781`, `973379a`, `2943da7` — FOUND en `git log`

## User Setup Required

Ninguna. El par VAPID y `VAPID_SUBJECT` ya viven en `.env.local` desde el plan 05-01. Al desplegar habrá que replicar las tres variables en la plataforma, pero eso es trabajo del plan de despliegue, no de este.

## Next Phase Readiness

**Listo para 05-06 (el worker del drenaje):**
- `construirPayload(entrada, { soportaDeclarativo, origen, tag })` → `string`
- `enviar(sub, payload, { ttl, urgency, topic, timeoutMs })` → `Promise<RespuestaDePush>`
- `configurarVapid()` para exigir la configuración **una vez** antes de la tanda, en vez de descubrirla rota a mitad de las quince
- `RespuestaDePush` es exactamente la entrada de `decidir()`: `statusCode`, `body`, `headers`, más el número de intento que el worker ya lleva en la fila

**Lo que el worker tiene que resolver y este plan no decide:**
- **`requiere_resuscripcion` sigue sin sitio donde vivir.** 05-02 no creó columna para ese estado y `RespuestaDePush` no lo introduce: es una decisión de `decidir()`, no del transporte. Sigue abierta, tal como la dejó 05-04.
- **`abortar_corrida` significa parar la tanda SIN escribir nada en `push_subscriptions`.** `configurarVapid()` ayuda a que el caso más común de esa decisión (configuración rota) se detecte antes de tocar la primera suscripción.
- **El `origen` absoluto tiene que salir de algún sitio.** Este módulo lo exige por parámetro a propósito. El worker es quien decide si lo lee del entorno o de la petición, y ahí sí hay que pensarlo: un origen equivocado manda a todas las aseadoras a otro despliegue desde la pantalla de bloqueo.
- **Quién decide `soportaDeclarativo`.** Es una propiedad de la suscripción, no del aviso. `push_subscriptions` tiene que poder responderla.

**El `runtime = 'nodejs'` lo declara el route handler, no este módulo.** `web-push` necesita `node:crypto` y no corre en Edge; la cabecera de `envio.ts` lo deja escrito para que quien monte la ruta no lo descubra en el primer despliegue.

---
*Phase: 05-notificaciones-push-e-instalaci-n-de-la-pwa*
*Completed: 2026-09-11*
