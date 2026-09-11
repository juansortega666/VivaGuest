---
phase: 05-notificaciones-push-e-instalaci-n-de-la-pwa
plan: 04
subsystem: domain
tags: [web-push, apns, error-handling, backoff, hashing, base64url, colapso, pureza, tdd]

requires:
  - phase: 05-notificaciones-push-e-instalaci-n-de-la-pwa
    provides: "plan 05-01: `web-push@3.6.7` instalado. Este plan NO lo importa: modela la forma de su respuesta (`statusCode`, `headers`, `body`) sin depender del paquete"
  - phase: 03-motor-de-sincronizaci-n-ical
    provides: "`CodigoDeFallo` y `siguienteIntento()` en `lib/data/sync.ts`, el patrón de unión cerrada de códigos y de backoff probado por tabla que este plan replica para otra capa"
  - phase: 01-fundaciones-de-datos-y-seguridad
    provides: "El enum `public.notification_type` con sus once valores, del que `ClaseDeAviso` queda atado por `import type`"
provides:
  - "`lib/push/errores.ts`: `decidir()`, la traducción de una respuesta de push service a una decisión de unión cerrada de siete variantes, pura y sin un solo import"
  - "`DecisionPush`: `entregado | desactivar_suscripcion | requiere_resuscripcion | reintentar | descartar | bug | abortar_corrida`"
  - "`MotivoDePush`: unión cerrada con allowlist de los ocho `reason` de Apple. El cuerpo del push service entra a la función y no sale de ella"
  - "`ESPERAS_MS`, `TOPE_DE_INTENTOS` y `TOPE_DE_ESPERA_MS`: la política de backoff como tabla, exportada para que worker y test lean el mismo número"
  - "`lib/push/colapso.ts`: `claveDeColapso()`, el hash corto base64url de 22 caracteres por destinatario + clase + aseo"
  - "`esClaveDeTopicValida()`: la aserción barata que el worker puede hacer antes de mandar la cabecera `Topic`"
  - "`lib/push/errores.test.ts`: 28 tests, los cinco señuelos U1–U5 del research más la no fuga del cuerpo"
  - "`lib/push/colapso.test.ts`: 20 tests, con el inventario de los CATORCE emisores de `notifications` del repo como fixture y el recorrido por pares"
affects: [05-05, 05-06, 05-07, 05-drenaje, 06-reportes-del-aseador]

tech-stack:
  added: []
  patterns:
    - "El `motivo` que acaba en una columna visible se construye desde una ALLOWLIST del cuerpo remoto, nunca desde el cuerpo tal cual"
    - "El orden de las ramas de un clasificador se escribe como contrato en el comentario y se prueba con un señuelo que lo invierte"
    - "Una auditoría de inventario se escribe como fixture que se RE-CUENTA en disco, para que caiga sola cuando aparezca la entrada número quince"
    - "Una propiedad sobre todos los pares se prueba recorriendo todos los pares, no con cuatro ejemplos escogidos a mano"

key-files:
  created:
    - lib/push/errores.ts
    - lib/push/errores.test.ts
    - lib/push/colapso.ts
    - lib/push/colapso.test.ts
  modified: []

key-decisions:
  - "`notifications.type` entra en el material del hash, y ESA es la corrección sobre el `05-CONTEXT.md`. El `dedupe_key` solo trae un verbo: `assign:` de `confirm_cleaning` y `assign:` de `reassign_cleaning` son emisores distintos de la misma clase, y `cancel:` y `rev:` son dos verbos de la misma clase `aseo_cancelado`"
  - "`MotivoDePush` es unión cerrada con allowlist de ocho `reason`, NO el `reason ?? http_N` del sketch del research. El motivo acaba en `notifications.push_last_error`, que el admin ve, y el cuerpo del push service es entrada no confiable (T-05-22)"
  - "Un `403` sin `reason` legible aborta la corrida en vez de desactivar: lo desconocido en autenticación se trata como global, que es el único lado que no borra nada"
  - "El tope de intentos gobierna SOLO la rama de reintento. Un `410` con los intentos agotados sigue siendo `desactivar_suscripcion`, no `descartar`: una suscripción muerta lo está sin importar cuántas veces se intentó"
  - "La cabecera `Retry-After` manda aunque pida MENOS que la tabla, y se recorta a una hora. Un `retry-after` en formato fecha HTTP, cero o negativo cae al backoff propio"
  - "22 caracteres de hash y no 32: 132 bits sobran para 8 usuarios y decenas de avisos al día, y los diez de margen bajo el tope duro dejan sitio a un prefijo futuro sin rediseñar nada"
  - "El discriminador es `cleaning_id` → `dedupe_key` → `id`. Usar `dedupe_key` cuando no hay aseo es lo que respeta el CUBO DE TIEMPO del watchdog, que existe para producir repetición a propósito"
  - "`ClaseDeAviso` se ata al enum de la base con un `import type`, que el compilador borra. Es la única concesión a la regla \"solo `node:crypto`\", y compra que añadir un valor a `notification_type` sin pasar por aquí sea un error de tipos"

patterns-established:
  - "Señuelo corrido en los DOS sentidos y anotado con el número de rojos medido, no con la afirmación de que el test cubre algo"
  - "Un test que reconstruye en disco el inventario que afirma cubrir: el fixture no puede quedarse obsoleto en silencio"

requirements-completed: [NOTIF-03, NOTIF-04]

coverage:
  - id: D1
    description: "Un 410 desactiva esa suscripción; un 403 de configuración NO desactiva ninguna, y la diferencia está probada con señuelo"
    requirement: NOTIF-03
    verification:
      - kind: unit
        ref: "lib/push/errores.test.ts#U1 — un 410 desactiva la suscripción, permanentemente"
        status: pass
      - kind: unit
        ref: "lib/push/errores.test.ts#U2 — un 403 con VapidPkHashMismatch pide RE-SUSCRIPCIÓN, no desactivación"
        status: pass
      - kind: unit
        ref: "lib/push/errores.test.ts#U2 (el señuelo, dicho al revés) — ese mismo 403 NUNCA desactiva la suscripción"
        status: pass
      - kind: unit
        ref: "lib/push/errores.test.ts#un 429 NUNCA desactiva la suscripción"
        status: pass
      - kind: other
        ref: "Señuelo A: rama de VapidPkHashMismatch movida DESPUÉS de la genérica de 403 → 2 rojos medidos; revertido → 28 verdes"
        status: pass
    human_judgment: false
  - id: D2
    description: "Un BadJwtToken aborta la corrida entera al primer fallo, sin tocar ninguna suscripción"
    requirement: NOTIF-03
    verification:
      - kind: unit
        ref: "lib/push/errores.test.ts#U3 — un 403 con BadJwtToken aborta la corrida"
        status: pass
      - kind: unit
        ref: "lib/push/errores.test.ts#U3 — un BadVapidPublicKey aborta igual, y aborta aunque el status no sea 403"
        status: pass
      - kind: unit
        ref: "lib/push/errores.test.ts#U3 (el señuelo) — un BadJwtToken no se degrada a reintentar"
        status: pass
      - kind: unit
        ref: "lib/push/errores.test.ts#un 403 SIN reason legible aborta la corrida: no se asume que sea desalineación"
        status: pass
    human_judgment: false
  - id: D3
    description: "Un daño reportado NUNCA borra un 'no puedo' del mismo aseo en la bandeja del teléfono"
    requirement: NOTIF-04
    verification:
      - kind: unit
        ref: "lib/push/colapso.test.ts#un daño reportado NUNCA colapsa con un \"no puedo\" del mismo aseo al mismo admin"
        status: pass
      - kind: unit
        ref: "lib/push/colapso.test.ts#el señuelo del par: ni siquiera con EL MISMO dedupe_key colapsan dos clases"
        status: pass
      - kind: unit
        ref: "lib/push/colapso.test.ts#NINGÚN par de emisores con type distinto comparte clave (recorrido completo)"
        status: pass
      - kind: unit
        ref: "lib/push/colapso.test.ts#cada clave del inventario mapea a UNA sola clase de evento"
        status: pass
      - kind: other
        ref: "Señuelo C: `type` fuera del material del hash → 4 rojos medidos, entre ellos el test con nombre propio; revertido → 20 verdes"
        status: pass
    human_judgment: false
  - id: D4
    description: "La clave de colapso cabe en los 32 caracteres base64url de la cabecera Topic y es estable entre corridas"
    requirement: NOTIF-04
    verification:
      - kind: unit
        ref: "lib/push/colapso.test.ts#toda clave del inventario mide <= 32 y solo usa el alfabeto base64url"
        status: pass
      - kind: unit
        ref: "lib/push/colapso.test.ts#el señuelo: el UUID crudo del aseo NO es una clave de Topic válida"
        status: pass
      - kind: unit
        ref: "lib/push/colapso.test.ts#dos llamadas con la misma entrada devuelven la misma clave"
        status: pass
      - kind: unit
        ref: "lib/push/colapso.test.ts#deriva con base64url y no con un reemplazo de caracteres a mano"
        status: pass
    human_judgment: false
  - id: D5
    description: "Los formatos reales de dedupe_key del repo están inventariados y ninguno hace que dos clases de evento compartan clave"
    requirement: NOTIF-04
    verification:
      - kind: unit
        ref: "lib/push/colapso.test.ts#hay una entrada por cada insert into public.notifications de las migraciones (14 = 14, re-contados en disco)"
        status: pass
      - kind: other
        ref: "grep -v '^\\s*--' supabase/migrations/*.sql | grep -c 'insert into public.notifications' → 14"
        status: pass
    human_judgment: false
  - id: D6
    description: "El reintento tiene tope y ventana, y el cuerpo del push service no llega a ninguna columna visible"
    requirement: NOTIF-03
    verification:
      - kind: unit
        ref: "lib/push/errores.test.ts#U4 — 500 y 503 reintentan con espera CRECIENTE entre intentos"
        status: pass
      - kind: unit
        ref: "lib/push/errores.test.ts#pasado el tope de intentos, el transitorio se DESCARTA"
        status: pass
      - kind: unit
        ref: "lib/push/errores.test.ts#un retry-after absurdo se recorta al tope de una hora"
        status: pass
      - kind: unit
        ref: "lib/push/errores.test.ts#T-05-22 — un reason desconocido NO viaja al motivo: el cuerpo entra y no sale"
        status: pass
      - kind: other
        ref: "Señuelo B: espera constante en vez de la tabla → 3 rojos medidos; revertido → 28 verdes"
        status: pass
    human_judgment: false
  - id: D7
    description: "Los dos módulos son puros y el árbol sigue verde"
    verification:
      - kind: unit
        ref: "lib/push/errores.test.ts#no importa nada de app/, ni react, ni web-push (cero imports)"
        status: pass
      - kind: unit
        ref: "lib/push/colapso.test.ts#su único import en tiempo de ejecución es node:crypto"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit → 0; npm run lint → 0 errores 2 avisos (línea base); npm run ci:arch → OK; npm run build → 0, 11 rutas"
        status: pass
      - kind: other
        ref: "npm run test:unit → 34 archivos, 622 tests (línea base 574 + 48 nuevos)"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-09-11
status: complete
---

# Phase 05 Plan 04: `decidir()` y `claveDeColapso()`, las dos funciones puras del envío Summary

**Un `403` de configuración ya no puede borrar las ocho suscripciones de la operación, y un daño reportado no puede borrar un "no puedo" del mismo aseo, porque las dos propiedades dejaron de ser comentarios: la primera la sostiene un orden de ramas con su señuelo corrido en los dos sentidos, y la segunda un recorrido por pares sobre los catorce emisores reales de `notifications` del repo.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-09-11T20:31:02Z
- **Completed:** 2026-09-11T20:39:28Z
- **Tasks:** 2 de 2
- **Files modified:** 4 (4 creados, 0 modificados)
- **Tests:** 48 nuevos (28 + 20). La suite pasó de 574 a **622**.

## Accomplishments

- **La trampa de D-05 se cerró midiéndola, no asumiéndola.** El `05-CONTEXT.md` suponía que la clase de evento se podía leer del prefijo del `dedupe_key`. No se puede: ahí solo hay un verbo. `confirm_cleaning` y `reassign_cleaning` usan **el mismo** `assign:` para la misma clase, y `cancel:` y `rev:` son dos verbos distintos de la **misma** clase `aseo_cancelado`. La clave se deriva de `notifications.type`, que es una columna del enum, y el señuelo que lo saca del hash pone cuatro tests en rojo.
- **La auditoría emisor por emisor es un fixture ejecutable, no una tabla en prosa.** Los catorce `insert into public.notifications` del repo están en `colapso.test.ts` con su `type`, su forma real de `dedupe_key` y si llevan `cleaning_id`. El recorrido por pares afirma que ningún par de clases distintas comparte clave, y una última aserción **vuelve a contar los emisores en disco**: el día que la Fase 6 añada `dano_reportado`, el test cae y alguien tiene que mirar la tabla.
- **Los catorce emisores producen nueve claves, y cada fusión tiene dueño escrito.** `asignacion` sobre el mismo aseo (#1 y #4, la reasignación de vuelta de §10.2), los cuatro `aseo_cancelado` del reconcile, y el `fmt:` que el reconcile y el watchdog emiten con el mismo texto. Las otras seis son emisores únicos. El número 9 está afirmado, no comentado.
- **El `motivo` se endureció respecto al sketch del research.** El research proponía `motivo: reason ?? http_N` con `reason` como `string`. Ese `motivo` acaba en `notifications.push_last_error`, que es una columna que el admin ve en pantalla, y el cuerpo del push service es entrada no confiable. Se convirtió en unión cerrada con allowlist de los ocho `reason` de Apple, y hay un test que le mete un teléfono dentro del `reason` y afirma que no sale por el otro lado (T-05-22).
- **Los tres señuelos se corrieron en los dos sentidos y con el número de rojos medido.** A: 2 rojos. B: 3 rojos. C: 4 rojos. Los tres revertidos a verde. Ninguna afirmación de cobertura de este SUMMARY sale de haber visto solo el verde.

## Task Commits

1. **Task 1 (RED): los cinco señuelos de la decisión de error, en rojo** — `2f8c534` (test)
2. **Task 1 (GREEN): `decidir()`, la decisión de error de push como función pura** — `a8e02ca` (feat)
3. **Task 2 (RED): la auditoría emisor por emisor de D-05, en rojo** — `0738491` (test)
4. **Task 2 (GREEN): `claveDeColapso()`, la clave de `Topic` y `tag` derivada de la CLASE** — `f8046da` (feat)

## Files Created

- `lib/push/errores.ts` — 300 líneas. `DecisionPush` de siete variantes, `MotivoDePush` de unión cerrada, `REASONS_DE_APNS` como allowlist, `ESPERAS_MS` / `TOPE_DE_INTENTOS` / `TOPE_DE_ESPERA_MS`, y `decidir()` con sus ocho ramas numeradas y comentadas por orden. **Cero imports.**
- `lib/push/errores.test.ts` — 28 tests en siete grupos. U1–U5 del research, el tope de intentos, la tolerancia del cuerpo, la no fuga y la pureza.
- `lib/push/colapso.ts` — 145 líneas. `ClaseDeAviso`, `EntradaDeColapso`, `LARGO_DE_CLAVE`, `LARGO_MAXIMO_DE_TOPIC`, `claveDeColapso()` y `esClaveDeTopicValida()`. Un solo import en runtime: `node:crypto`.
- `lib/push/colapso.test.ts` — 20 tests. El inventario de los catorce emisores como fixture, el recorrido por pares, el test con nombre propio de D-05 y la re-cuenta en disco.

## Los tres señuelos, corridos en los dos sentidos

El plan exige que no valga afirmar que un test cubre algo sin haberlo visto rojo. Los tres se aplicaron sobre el archivo real, se midió el rojo y se revirtió con una copia.

| Señuelo | Mutación aplicada | Rojos medidos | Tras revertir |
|---|---|---|---|
| **A** | La rama de `VapidPkHashMismatch` movida **después** de la genérica de `403` | **2 de 28**: `U2 — pide RE-SUSCRIPCIÓN` (`expected 'abortar_corrida' to be 'requiere_resuscripcion'`) y `U2 dicho al revés` | 28 verdes |
| **B** | `esperarMs` constante de 60 000 ms en vez de leer la casilla de `ESPERAS_MS` | **3 de 28**: `U4 backoff creciente` (`expected 60000 to be greater than 60000`), `cada intento lee su casilla`, `sin cabecera cae al backoff propio` | 28 verdes |
| **C** | `type` fuera del material del hash (`recipient_id : discriminador`) | **4 de 20**: el test con nombre propio de D-05, `ni con el mismo dedupe_key`, `NINGÚN par con type distinto` (`emisor 1 (asignacion) colapsaría con emisor 2 (aseo_completado)`) y `cada clave mapea a UNA clase` (`la clave O3k-… sirve a varias clases: 5`) | 20 verdes |

El señuelo C es el que más dice: sin `type` en el hash, **cinco clases de evento distintas** caen en la misma clave para el mismo admin y el mismo aseo. No es que se rompa un caso; es que la capa de colapso deja de distinguir nada.

## Decisions Made

Las ocho del bloque `key-decisions`. Las tres que condicionan al worker del plan 05-06:

1. **El tope de intentos gobierna solo la rama de reintento.** `decidir(410, …, intento agotado)` sigue devolviendo `desactivar_suscripcion`, no `descartar`. El worker no tiene que comprobar el tope antes de llamar: `decidir()` ya lo hace y solo donde corresponde.
2. **`abortar_corrida` es global y no toca ninguna suscripción.** Cuando aparece, el worker tiene que parar la tanda entera **sin** escribir nada en `push_subscriptions`. Un `403` sin `reason` legible también entra ahí: es el único lado que no borra nada.
3. **`Topic` y `tag` llevan la misma clave.** No hay dos llamadas ni dos derivaciones: `claveDeColapso()` se llama una vez por notificación y su resultado va a las dos capas. Si llevaran claves distintas, el push service podría reemplazar un aviso que el teléfono muestra aparte.

## Deviations from Plan

Ninguna desviación de alcance. Cuatro correcciones de hechos del enunciado, todas medidas y ninguna que afloje una garantía.

**1. [Rule 1 - Bug] El ejemplo literal del plan para el `429` es un falso verde**

- **Found during:** Task 1, escribiendo el rojo.
- **Issue:** El plan pide el caso `decidir(429, headers con 'retry-after': '60') → { tipo: 'reintentar', esperarMs: 60000 }`. Escrito tal cual con `intento = 1`, la primera casilla de la tabla de backoff propio **también** son 60 000 ms: el test pasaría igual con la cabecera completamente ignorada, que es exactamente el señuelo U5 que el caso existe para atrapar.
- **Fix:** Los casos de `429` usan valores de `retry-after` que **no** coinciden con la casilla de ese intento (90 s en el intento 1, 30 s en el intento 2 cuya casilla son 300 s), y el test del intento 2 afirma además explícitamente que el resultado **no** es `ESPERAS_MS[1]`. La razón queda escrita en la cabecera del archivo de test.
- **Verification:** El señuelo B (espera constante) pone en rojo tres tests, entre ellos el de la cabecera. Con el ejemplo literal del plan, ese tercero habría seguido verde.
- **Committed in:** `2f8c534`.

**2. [Rule 1 - Bug] Son CATORCE emisores de `notifications`, no ocho**

- **Found during:** Task 2, leyendo las migraciones.
- **Issue:** La tabla del plan (heredada del `05-PATTERNS.md`) presenta ocho entradas como "los ocho formatos reales de `dedupe_key` del repo". Contando en disco hay **catorce** `insert into public.notifications` (3 en la migración 09, 6 en la 13, 4 en la 14, 1 en la 15) y **diez** formatos distintos de `dedupe_key`: la tabla inventaría formatos, no emisores, y aun así le faltan dos (`done:`, `decline:`, `cancel:`, `rev:`, `ext:` no aparecen todos).
- **Fix:** El fixture tiene las catorce entradas, y la aserción de cobertura re-cuenta en disco en vez de fiarse del número. El plan pedía "una entrada por cada `insert into public.notifications` del repo", así que el fixture cumple el enunciado aunque contradiga su tabla.
- **Verification:** `grep -v '^\s*--' supabase/migrations/*.sql | grep -c 'insert into public.notifications'` → 14, y el test lo afirma.
- **Committed in:** `0738491`.

**3. [Rule 1 - Bug] `finish_cleaning` y `decline_cleaning` no usan `<verbo>:<uuid>:<uuid>`**

- **Found during:** Task 2.
- **Issue:** La tabla del plan dice que `finish_cleaning` usa `<verbo>:<uuid>:<uuid>` (~80 caracteres) y que `decline_cleaning` usa "el mismo esquema". Medido sobre las migraciones: son `done:<aseo>` y `decline:<aseo>`, sin el uuid del destinatario, ~43 caracteres.
- **Fix:** El fixture lleva las formas reales. La razón de que no quepa el destinatario queda escrita: esos dos inserts emiten **una fila por admin activo** desde un `cross join`, y meter el uuid del admin en la clave rompería el `on conflict (recipient_id, dedupe_key)`, cuya primera columna ya discrimina por destinatario.
- **Impacto:** ninguno sobre el diseño. La clave de colapso no se deriva del `dedupe_key` cuando hay `cleaning_id`, que es el caso de los dos.
- **Committed in:** `0738491`.

**4. [Rule 2 - Missing critical functionality] El `motivo` como unión cerrada, y un `import type` en `colapso.ts`**

- **Found during:** Tasks 1 y 2.
- **Issue (a):** El sketch del `05-RESEARCH.md` declara `motivo: string` y lo rellena con `reason ?? http_N`, donde `reason` sale del cuerpo remoto sin filtrar. Ese `motivo` acaba en `notifications.push_last_error`, que el admin ve en pantalla: es una ruta directa desde el cuerpo de un tercero hasta una columna visible, y es literalmente el T-05-22 del propio plan.
- **Fix (a):** `MotivoDePush` es unión cerrada y `leerReason()` filtra contra la allowlist de los ocho `reason` de Apple. Un `reason` desconocido se descarta y el motivo cae al código HTTP, que lo produjo el transporte. Mismo patrón y misma razón que `CodigoDeFallo` en `lib/data/sync.ts`.
- **Issue (b):** El criterio de aceptación dice que `colapso.ts` "no importa nada fuera de `node:crypto`". Tipar `type` como `string` perdería la atadura al enum de la base y permitiría pasar cualquier cadena.
- **Fix (b):** `import type { Enums } from '@/lib/database.types'`. Es un **import de tipo**, que el compilador borra: no existe en el grafo de runtime ni en el bundle. El test lo afirma separando los imports de runtime de los de tipo y exigiendo que los de runtime sean exactamente uno y sea `node:crypto`. La concesión compra que añadir un valor a `notification_type` sin pasar por aquí sea un error de compilación.
- **Verification:** `grep -nE '^\s*import\s' lib/push/colapso.ts` → dos líneas, la segunda es `import type`. `tsc --noEmit` en cero.
- **Committed in:** `a8e02ca` y `f8046da`.

---

**Total deviations:** 4 (3 correcciones de hechos del enunciado, 1 endurecimiento por amenaza del propio plan)
**Impact on plan:** Ninguna cambia el alcance. Las tres primeras son errores de la tabla heredada del `05-PATTERNS.md` y la primera además habría producido un test que pasa sin medir nada. La cuarta cierra T-05-22 de verdad en vez de dejarlo en la intención.

## Issues Encountered

**1. El rojo de un módulo que todavía no existe son CERO aserciones, no N fallos.**
Las dos puertas RED de este plan imprimieron `Test Files 1 failed (1)` con `Tests no tests`: el import falla y el archivo no llega a correr. Es el rojo legítimo del primer test de un módulo nuevo, pero es también la clase de falso rojo que el `vitest.config.ts` documenta (`No test files found` es un rojo del proceso sin una sola aserción). Los rojos que valen como evidencia en este plan son **los de los tres señuelos**, que sí corrieron las 28 y las 20 aserciones y fallaron exactamente las que se esperaba. Por eso la tabla de señuelos de arriba lleva el número medido y no un "el test cae".

**2. El `429` con `retry-after: 60` en el intento 1 es indistinguible de la tabla.**
Recogido como deviación 1. Lo dejo también aquí porque es una lección reutilizable: cuando un test compara un número contra un valor por defecto, hay que elegir a propósito un valor de entrada que **no** coincida con el defecto, o el test verifica la firma de la función y no su comportamiento.

**3. Los cuatro avisos de `aseo_cancelado` del reconcile SÍ colapsan entre sí, y hay que decirlo en voz alta.**
`cancel:<aseo>` y `rev:<aseo>` son `dedupe_key` distintos, pero misma clase y mismo aseo, así que comparten clave de colapso. Es correcto y deliberado: son estados mutuamente excluyentes del mismo aseo, la versión nueva reemplaza a la vieja, y los cuatro textos se leen solos (regla 1 de §10.2), así que ninguno depende del anterior. Queda escrito con su test propio para que no se lea como un descuido dentro de un año.

## User Setup Required

Ninguna. Este plan no toca entorno, ni base, ni servicios externos: son dos funciones puras y sus tests.

## Next Phase Readiness

**Lo que el worker del drenaje (plan 05-06) ya puede dar por resuelto:**

- `decidir(statusCode, body, headers, intento)` es toda la política de error. El worker no clasifica: llama y hace lo que le digan las siete variantes.
- `TOPE_DE_INTENTOS` y `ESPERAS_MS` se importan; no se vuelven a escribir. `next_attempt_at` sale de `now() + esperarMs`.
- `claveDeColapso(fila)` se llama **una vez** por notificación y su resultado va a `Topic` **y** a `tag`. `esClaveDeTopicValida()` está para afirmarlo antes de mandar la cabecera.

**Lo que tiene que tener presente y no es obvio:**

- `abortar_corrida` significa parar la tanda entera **sin escribir nada** en `push_subscriptions`. Si el worker lo trata como fallo por suscripción, procesa las ocho y las marca todas como fallidas, que es el señuelo I4 del research.
- `descartar` es lo que lleva la fila a `push_status = 'descartado'`. Es la **única** variante que sale del tope de intentos.
- `requiere_resuscripcion` no es ni muerte ni éxito: la suscripción sigue viva pero con la clave VAPID vieja. Necesita una marca propia, distinta de `revoked_at`, y el plan 05-02 **no** creó columna para ella. Quien implemente el drenaje tiene que decidir dónde vive ese estado (`revoked_reason = 'clave_obsoleta'` con `revoked_at` puesto es la opción barata, a costa de que el aseador tenga que volver a dar permiso).
- Ninguno de los dos módulos importa `web-push`. La forma de la respuesta (`statusCode`, `headers`, `body`) está modelada, no acoplada: el worker es quien traduce el objeto que `web-push` resuelve o rechaza a esos tres argumentos.

## Known Stubs

Ninguno. Los dos módulos están completos y sin ramas pendientes: `decidir()` cubre los diez códigos de la tabla de Apple, los ocho `reason` de sus seis filas y un caso final explícito para lo no clasificado, y `claveDeColapso()` cubre las tres formas de discriminador. `dano_reportado` aparece en `colapso.test.ts` sin tener emisor todavía, y eso es deliberado: la propiedad de D-05 tiene que estar sostenida **antes** de que exista el emisor, no después del primer aviso borrado.

## Threat Flags

Ninguna. Este plan no abre endpoints, ni rutas de autenticación, ni acceso a archivos, ni toca el schema. Las cuatro amenazas del `<threat_model>` quedan mitigadas y las cuatro con test dedicado: T-05-05 (`404`/`410` como únicas entradas a desactivar, con señuelo A), T-05-20 (`type` en el material del hash, con señuelo C y recorrido por pares), T-05-21 (tope de cuatro intentos, techo de una hora al `retry-after`, variante `descartar`) y T-05-22 (`motivo` de unión cerrada con allowlist; el cuerpo entra y no sale).

---
*Phase: 05-notificaciones-push-e-instalaci-n-de-la-pwa*
*Completed: 2026-09-11*

## Self-Check: PASSED

- `lib/push/errores.ts` — existe, contiene `requiere_resuscripcion` (2 ocurrencias) y cero imports
- `lib/push/errores.test.ts` — existe, 28 tests en verde
- `lib/push/colapso.ts` — existe, contiene `base64url` (3 ocurrencias), un solo import de runtime
- `lib/push/colapso.test.ts` — existe, 20 tests en verde
- Commits `2f8c534`, `a8e02ca`, `0738491`, `f8046da` — presentes en el historial
- `.planning/STATE.md` y `.planning/ROADMAP.md` — **sin modificar**, como exige el orquestador
