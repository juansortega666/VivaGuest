---
phase: 05-notificaciones-push-e-instalaci-n-de-la-pwa
plan: 06
subsystem: api
tags: [web-push, outbox, idempotencia, route-handler, service-role, vapid, supabase, zod]

requires:
  - phase: 03-motor-de-sincronizaci-n-ical
    provides: "`app/api/cron/sync-feed/_guard.ts` (el guard del secreto compartido, hash antes de comparar) y el molde entero del worker: orden guard → fábrica, tipo de log cerrado, configuración de segmento. Este plan REEXPORTA el primero y copia la forma del segundo"
  - phase: 05-notificaciones-push-e-instalaci-n-de-la-pwa
    provides: "plan 05-02 (migración 16: `soporta_declarativo`), plan 05-03 (migración 17: dispatcher, trigger AFTER INSERT, cron de un minuto, y el cuerpo `{ notification_id }` con la cabecera `x-cron-secret`), plan 05-04 (`decidir()`, `claveDeColapso()`, `ESPERAS_MS`, `TOPE_DE_INTENTOS`), plan 05-05 (`construirPayload()`, `urgenciaDe()`, `enviar()`, `TTL_SEGUNDOS`, `TIMEOUT_MS`)"
  - phase: 01-fundaciones-de-datos-y-seguridad
    provides: "Las cuatro columnas de outbox de `notifications` y las de salud de `push_subscriptions` (migración 06), con sus índices parciales"
provides:
  - "`POST /api/push/drain`: el worker del outbox. Una invocación HTTP por notificación, `runtime = 'nodejs'`, sin `GET`. CIERRA EL LAZO QUE LLEVABA ABIERTO DESDE LA FASE 1: hasta aquí catorce emisores escribían la intención de avisar y nadie la despachaba"
  - "`app/api/push/drain/_guard.ts`: reexportación pura del guard de la Fase 3, con un test de IDENTIDAD REFERENCIAL que impide convertirla en copia"
  - "`lib/data/push.ts`: ocho funciones de acceso al outbox, con el cliente por parámetro"
  - "`reclamarNotificacion()`: el `update … where push_status = 'pendiente' … returning` de una sola sentencia que es la idempotencia del sistema entero"
  - "`revocarSuscripcion()`: la ÚNICA puerta de revocación, dos columnas, alcanzable solo desde `404`, `410` y `VapidPkHashMismatch`"
  - "`CodigoDePush`: la unión cerrada construida SOBRE `MotivoDePush`, única barrera entre un mensaje de la librería y `push_last_error` / `revoked_reason`"
  - "`LineaDeLogPush` y `OutcomeDeDrenaje`: el tipo de log sin ranura para el endpoint, sus claves, el título ni el cuerpo"
  - "`APP_BASE_URL`: el origen absoluto como configuración de servidor, documentado en `.env.example`"
affects: [05-07, 05-08, pwa-del-aseador, dashboard-de-avisos-D-03, despliegue-push]

tech-stack:
  added: []
  patterns:
    - "Guard reexportado + test de identidad referencial: la forma de compartir un control de acceso entre dos endpoints sin arriesgar dos copias que derivan"
    - "Reclamo por estado con `returning`: idempotencia a nivel de PostgREST, sin columna de lease nueva"
    - "Origen absoluto desde configuración de servidor, nunca desde el header `Host`"

key-files:
  created:
    - app/api/push/drain/route.ts
    - app/api/push/drain/_guard.ts
    - app/api/push/drain/_guard.test.ts
    - lib/data/push.ts
    - lib/data/push.test.ts
  modified:
    - .env.example

key-decisions:
  - "El guard nuevo es una REEXPORTACIÓN sin una sola línea propia, y un test con `toBe` (no `toEqual`) lo congela: dos endpoints públicos de internet son el peor sitio posible para dos implementaciones del mismo control de acceso"
  - "El origen absoluto sale de `APP_BASE_URL` con respaldo en el dominio de producción de la plataforma, NUNCA de `req.url` ni del header `Host`: un origen equivocado manda a toda la operación a otro despliegue desde la pantalla de bloqueo, donde no hay barra de direcciones que delate el salto"
  - "Sin origen NO se inventa uno: la notificación vuelve a `pendiente` con `configuracion_rota` y backoff. Mandar a alguien a un sitio equivocado es peor que no mandarlo"
  - "`abortar_corrida` sale del bucle SIN tocar ninguna suscripción, y reemplaza la guarda por umbral del `05-RESEARCH.md` §I3 (desviación ya declarada en el plan)"
  - "Al menos UNA entrega marca la notificación `enviado`: un aseador con dos teléfonos y uno muerto sigue enterado"
  - "Cero suscripciones vivas marca `descartado` con `sin_suscripciones`, nunca `enviado`: marcarlo enviado sería mentir"
  - "`requiere_resuscripcion` se resuelve con `revocarSuscripcion(motivo: 'clave_obsoleta')`, sin columna nueva: la opción barata que 05-04 anticipó y 05-03 cerró"
  - "`CodigoDePush` se construye sobre `MotivoDePush` en vez de repetir sus catorce formas: dos copias de la misma lista cerrada se desincronizan"

patterns-established:
  - "Test de no duplicación por identidad referencial: cuando un módulo existe solo para reexportar, el test que lo protege compara referencias, no estructura"
  - "Comentario que describe un token en vez de escribirlo, cuando un grep de CI o un criterio de aceptación lo cuenta (la misma regla que `check-service-role.sh` se impone en su cabecera)"
  - "Disciplina de una sola columna extendida a la capa de datos: cada escritura del outbox tiene un test que cuenta las claves exactas del objeto que llega a `.update()`"

requirements-completed: [NOTIF-01, NOTIF-02, NOTIF-03, NOTIF-04]

coverage:
  - id: D1
    description: "El endpoint de drenaje rechaza con 401 sin cuerpo cualquier petición sin el secreto compartido correcto, y su guard no duplica lógica"
    requirement: NOTIF-01
    verification:
      - kind: unit
        ref: "app/api/push/drain/_guard.test.ts (7 tests, incluida la identidad referencial con toBe)"
        status: pass
      - kind: other
        ref: "npm run ci:arch — guardarrail 7 con el señuelo del orden invertido corrido en los dos sentidos"
        status: pass
    human_judgment: false
  - id: D2
    description: "Drenar dos veces la misma notificación produce UN envío: la segunda invocación no encuentra nada que reclamar"
    requirement: NOTIF-02
    verification:
      - kind: unit
        ref: "lib/data/push.test.ts > reclamarNotificacion > FILTRA POR ESTADO (señuelo corrido en los dos sentidos)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Una notificación cuyo destinatario no tiene suscripciones vivas deja `push_status = 'descartado'` con `push_last_error = 'sin_suscripciones'`, nunca un no-op silencioso"
    requirement: NOTIF-03
    verification:
      - kind: unit
        ref: "lib/data/push.test.ts > el estado de la notificacion > descartada por falta de destino"
        status: pass
    human_judgment: false
  - id: D4
    description: "Ni el endpoint de la suscripción, ni sus claves, ni el título o el cuerpo del aviso pueden entrar en un log ni en `push_last_error`"
    requirement: NOTIF-04
    verification:
      - kind: unit
        ref: "lib/data/push.test.ts > revocarSuscripcion > el motivo es de la union cerrada (@ts-expect-error, señuelo corrido en los dos sentidos)"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit — `LineaDeLogPush` y `CodigoDePush` son tipos cerrados"
        status: pass
    human_judgment: false
  - id: D5
    description: "Una configuración rota no borra la flota: `abortar_corrida` corta el bucle antes de cualquier revocación"
    verification: []
    human_judgment: true
    rationale: "La rama está escrita y tipada, pero no hay test que la ejerza de punta a punta: exigiría un doble del push service que devuelva 403 BadJwtToken a través de `web-push`. El test I3 tal como el plan lo redefine queda como trabajo del plan de pruebas de integración de esta fase."

metrics:
  duration: "~50 min"
  completed: 2026-09-11
  tasks: 3
  files: 6

status: complete
---

# Fase 5 Plan 06: El worker del outbox de push — Summary

`POST /api/push/drain` drena una notificación por invocación, reclama por estado para que el trigger y el cron puedan solaparse sin duplicar avisos, y aborta sin revocar cuando la configuración está rota.

## Qué se construyó

Hasta este plan la Fase 1 había dejado la cola (`notifications` como bandeja Y outbox), la Fase 5 había puesto el mensajero (migración 17: dispatcher, trigger `AFTER INSERT` y cron de un minuto) y las piezas puras del envío (`decidir()`, `claveDeColapso()`, `construirPayload()`, `enviar()`). **Nadie drenaba nada.** Catorce emisores escribían la intención de avisar y ninguno la despachaba. Este plan cierra ese lazo.

### Task 1 — El guard, reexportado (`e42915d`)

`app/api/push/drain/_guard.ts` son 39 líneas de las que 33 son comentario y 5 son un `export … from`. No contiene ni `createHash` ni `timingSafeEqual`, y el criterio de aceptación lo comprueba con un grep.

Lo que lo sostiene es el primer test: `expect(exigirSecretoCron).toBe(original)`. Comparación por **identidad referencial**, no estructural, porque una copia byte a byte pasaría un `toEqual`. La propiedad que hace seguro ese guard —hashear los dos lados antes de compararlos, porque la comparación de tiempo constante de Node lanza con búferes de distinta longitud y esa excepción revela la longitud del secreto— está medida y probada una sola vez, en la Fase 3. Los otros seis tests reafirman los tres motivos de negación y la propiedad de canal lateral **a través del módulo nuevo**, que es lo que documenta el contrato del endpoint.

### Task 2 — `lib/data/push.ts` (`6e730f1`)

Ocho funciones, cliente por parámetro, cero imports de la fábrica administrativa.

`reclamarNotificacion()` es la pieza que importa: un `update … where id = ? and push_status = 'pendiente' … returning` de **una sola sentencia**. Dos invocaciones simultáneas no pueden reclamar la misma fila; la segunda recibe `null` y el llamador responde sin enviar. Es el equivalente de `for update skip locked` a nivel de PostgREST, y es lo que hace inofensivo que el trigger inmediato y el cron de un minuto se crucen. Empuja `next_attempt_at` dos minutos, el mismo número que el bucle del dispatcher, y por la misma razón: protege contra el worker sobreviviendo a su propio intervalo, no contra ticks solapados.

`revocarSuscripcion()` es la única puerta de revocación del sistema. Escribe exactamente dos columnas, no toca `notifications`, y su parámetro `motivo` es un `CodigoDePush`.

`CodigoDePush` se construye **sobre** `MotivoDePush` (`lib/push/errores.ts`) en vez de repetir sus catorce formas, y añade los cinco motivos que nacen en el worker: `sin_suscripciones`, `clave_obsoleta`, `payload_excede_limite`, `configuracion_rota`, `topico_invalido`.

17 tests con un doble del cliente que registra tabla, verbo, valores y filtros. Nueve de ellos cuentan las claves exactas del objeto que llega a `.update()`.

### Task 3 — `app/api/push/drain/route.ts` (`42599a5`)

Orden `guard → fábrica administrativa`, `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`, `maxDuration = 60`. Una sola exportación de método HTTP, `POST`, declarada con la palabra clave de función. `401` sin cuerpo, `400` sin cuerpo.

`LineaDeLogPush` es un tipo cerrado: `notification_id`, `outcome` (unión cerrada de seis), `codigo?: CodigoDePush`, `suscripciones?`, `entregadas?`, `revocadas?`, `http_status?`, `colapso?: 'omitido'`. No tiene ranura para el endpoint, sus claves, el título ni el cuerpo. Meterlos es un error de compilación.

El cuerpo hace, en este orden: guard → Zod sobre `{ notification_id }` → fábrica → reclamo → suscripciones vivas → origen → clave de colapso → bucle → **una sola escritura** del estado final.

## De dónde sale el origen absoluto, y por qué

Era la pregunta abierta que 05-05 dejó al hacerlo parámetro. La respuesta tiene consecuencias visibles: **un origen equivocado manda a todas las aseadoras a otro despliegue desde su pantalla de bloqueo**, donde no hay barra de direcciones que delate el salto.

Por eso **no** se deriva de `req.url` ni del header `Host`, que es exactamente la fuente que la intuición sugiere y la que está a mano: ese header lo escribe quien llama. Sale de configuración de servidor:

1. `APP_BASE_URL`, que tiene que valer lo mismo que el secreto `app_base_url` de Vault con el que el dispatcher de la migración 17 arma la URL de esta misma ruta.
2. El dominio de producción que inyecta la plataforma (`VERCEL_PROJECT_PRODUCTION_URL`). Es el dominio **estable**, no la URL del despliegue concreto: un despliegue de vista previa que drene una notificación sigue mandando a la aseadora a la aplicación de verdad, no a una vista previa que mañana no existe.

Se normaliza con `new URL(...).origin`, que descarta cualquier ruta. Si no hay ninguno de los dos, **no se inventa**: la notificación vuelve a `pendiente` con `configuracion_rota` y backoff.

## La máquina de estados, completa

| Decisión | `notifications` | `push_subscriptions` |
|---|---|---|
| `entregado` | cuenta para el estado final | `last_success_at`, `failure_count = 0` |
| `desactivar_suscripcion` | sigue según el resto | `revoked_at`, `revoked_reason = http_404 \| http_410` |
| `requiere_resuscripcion` | sigue | `revoked_at`, `revoked_reason = 'clave_obsoleta'` |
| `reintentar` | cuenta para el estado final | `last_failure_at`, `failure_count + 1` |
| `descartar` | cuenta para el estado final | `last_failure_at`, `failure_count + 1` |
| `bug` | cuenta para el estado final | **sin cambio** |
| `abortar_corrida` | `pendiente` con backoff | **sin cambio, ninguna revocación** |

Y el estado final, una sola escritura: **al menos una entrega → `enviado`** (un aseador con dos teléfonos y uno muerto sigue enterado, y marcarla fallida por el teléfono muerto la haría repetirse en el bueno); ninguna y con reintentos → `pendiente` con la mayor espera observada; ninguna y sin reintentos → `descartado` con el último código.

## Desviaciones del plan

### Auto-corregidas

**1. [Regla 2 — funcionalidad crítica faltante] `APP_BASE_URL` documentada en `.env.example`**
- **Encontrado en:** Task 3, al decidir de dónde sale el origen absoluto.
- **Problema:** `.env.example` se declara a sí mismo «la única fuente que dice qué variables hace falta tener para que el proyecto arranque». Una variable nueva sin documentar se despliega ausente, y el síntoma (todas las notificaciones en `pendiente` con `configuracion_rota`) no señala la causa.
- **Arreglo:** entrada nueva con el bloque de por qué tiene que coincidir con el secreto `app_base_url` de Vault, el respaldo de la plataforma, y qué pasa si falta.
- **Archivos:** `.env.example`
- **Commit:** `42599a5`

**2. [Regla 3 — bloqueante] `leerSuscripcionesVivas()` trae también `failure_count`**
- **Problema:** el plan lista `registrarFalloDeSuscripcion(admin, id)` con `failure_count + 1`, pero `supabase-js` no expresa `col = col + 1` sin una consulta cruda.
- **Arreglo:** la columna entra en el `select` y el contador previo viaja por parámetro, exactamente el mismo patrón que `fallosPrevios` en `registrarFalloDeSync()` de la Fase 3. `Math.max(0, Math.trunc(...))` lo hace total, con test.
- **Archivos:** `lib/data/push.ts`
- **Commit:** `6e730f1`

**3. [Regla 3 — bloqueante] Dos comentarios reescritos para no disparar greps**
- **Problema:** (a) el comentario de `_guard.ts` que explicaba la propiedad de canal lateral nombraba literalmente los dos identificadores de `node:crypto` que el criterio de aceptación prohíbe; (b) el comentario de `route.ts` que explicaba por qué el handler se declara con palabra clave contenía una segunda aparición literal de la declaración que otro criterio cuenta con `grep -c`; (c) la aserción de frontera en `push.test.ts` contenía el especificador del import de la fábrica administrativa, y el **guardarrail 5 de CI marcó el archivo de test como importador ilegítimo** (`npm run ci:arch` en rojo).
- **Arreglo:** (a) y (b) describen el patrón en vez de escribirlo, con una nota que dice por qué; (c) las dos aserciones pasan por expresión regular. Es la misma regla que `scripts/ci/check-service-role.sh` se impone en su propia cabecera.
- **Archivos:** `app/api/push/drain/_guard.ts`, `app/api/push/drain/route.ts`, `lib/data/push.test.ts`
- **Commits:** `e42915d`, `42599a5`

### Refinamientos sobre la tabla del plan, escritos a propósito

- **`marcarNotificacionEnviada()` limpia `push_last_error`.** El plan listaba dos columnas. Una fila en `enviado` que conservara el código del intento fallido anterior se leería en el panel de D-03 como «enviada pero con error», que es lo contrario de lo que pasó. Tres columnas, con test que las cuenta.
- **`descartar` también incrementa `failure_count`.** La tabla del plan solo pedía `last_failure_at`. Partir en dos funciones para evitar un incremento de contador no se justifica: el intento falló, y el contador cuenta intentos fallidos.
- **El caso `abortar_corrida` con entregas previas.** Si una suscripción entregó y la siguiente aborta, se sigue la tabla al pie de la letra (`pendiente` con backoff) en vez de aplicar «al menos una entrega basta». La re-entrega al teléfono que sí aceptó la colapsa la cabecera `Topic`, que es exactamente para eso; a cambio, la configuración rota queda visible en `push_last_error` en vez de quedar tapada por el éxito parcial.
- **`colapso?: 'omitido'` en `LineaDeLogPush`.** Campo extra sobre la forma que el plan proponía. Cubre el caso en que `claveDeColapso()` devolviera algo que no cabe en la cabecera `Topic`: el aviso sale igual, sin colapso, y el hecho queda registrado en vez de abusar del campo `codigo`. Hoy es inalcanzable; por eso se registra en lugar de callarse.

## Señuelos corridos, en los dos sentidos

| Señuelo | Lado roto | Lado sano |
|---|---|---|
| Quitar `.eq('push_status', 'pendiente')` de `reclamarNotificacion()` | `1 failed \| 16 passed` — *FILTRA POR ESTADO* en rojo | `17 passed` |
| Cambiar el motivo del `@ts-expect-error` por uno válido (`http_410`) | `error TS2578: Unused '@ts-expect-error' directive` | `tsc` limpio |
| Invertir el orden `guard` / fábrica en `POST` | `ci:arch` en rojo: *«POST() construye la fabrica administrativa sin un guard antes»* | `check-service-role: OK` |

## Verificación

| Puerta | Antes (base de la ola 3) | Ahora |
|---|---|---|
| `npm run test:unit` | 36 archivos / 654 tests | **38 archivos / 678 tests, PASS** |
| `npm run db:test` | Files=9, Tests=229, PASS | **Files=9, Tests=229, PASS** (sin cambios: este plan no toca SQL) |
| `npx tsc --noEmit` | limpio | **limpio** |
| `npm run lint` | 0 errores, 2 avisos preexistentes | **0 errores, 2 avisos preexistentes** |
| `npm run ci:arch` | limpio | **limpio** |
| `npm run build` | 11 rutas | **12 rutas, con `ƒ /api/push/drain`** |
| `npm run db:types:check` | sin deriva | **sin deriva** |

Criterios de aceptación del plan, uno por uno:

- `app/api/push/drain/_guard.ts`: 39 líneas, `grep -cE "createHash|timingSafeEqual"` → **0**.
- `npm run test:unit -- app/api/push/drain` → **7 tests**, cero.
- `npm run test:unit -- app/api/cron/sync-feed` → **8 tests**, cero, sin cambios.
- `npm run test:unit -- lib/data/push` → **17 tests**, cero.
- `grep -c "sin_suscripciones" lib/data/push.ts` → **4**.
- `lib/data/push.ts` no importa la fábrica administrativa (test de frontera que lee el fuente).
- `grep -c "export async function POST" route.ts` → **1**; ninguna otra exportación de método HTTP.
- `grep -c "runtime = 'nodejs'" route.ts` → **1**.
- `grep -c "status: 401" route.ts` → **1**, construido con `new Response(null, …)`.

## Preguntas heredadas, cerradas

- **`requiere_resuscripcion` no necesitó columna.** Va a `revocarSuscripcion(motivo: 'clave_obsoleta')`, que escribe `revoked_at` + `revoked_reason`. La opción barata que 05-04 anticipó, con su costo ya declarado.
- **`soporta_declarativo` ya existía** (migración 16) y `leerSuscripcionesVivas()` lo lee. Es por dispositivo y elige la rama del cuerpo que exige D-07.

## Lo que queda para después

- **El test I3 tal como el plan lo redefine** (push service falso que devuelve `403 BadJwtToken` a todo → la corrida aborta al primero y cero suscripciones quedan revocadas) **no se escribió**: exige un doble de `web-push` a través de `enviar()`, que es red y configuración VAPID. La rama está escrita, tipada y comentada, pero sin cobertura ejecutable. Es la única entrada `human_judgment: true` de la cobertura de este plan.
- **No hay test del route handler completo.** El endpoint se ejerce hoy por composición (guard, capa de datos y piezas puras tienen sus propios tests) más `tsc`, `ci:arch` y `build`. Un test de integración del handler contra el stack local es trabajo natural del plan de pruebas de esta fase.
- **`APP_BASE_URL` hay que ponerla en `.env.local` y en la plataforma** antes de que el drenaje sirva de algo en un entorno real. Sin ella y sin el dominio de producción inyectado, toda notificación acaba en `pendiente` con `configuracion_rota`.

## Threat Flags

Ninguna superficie nueva fuera del registro del plan. `POST /api/push/drain` es exactamente T-05-01 / T-05-25, ya modelados.

## Self-Check: PASSED

Archivos declarados, verificados en disco:

- `app/api/push/drain/route.ts` — FOUND
- `app/api/push/drain/_guard.ts` — FOUND
- `app/api/push/drain/_guard.test.ts` — FOUND
- `lib/data/push.ts` — FOUND
- `lib/data/push.test.ts` — FOUND
- `.env.example` — FOUND (modificado)

Commits declarados, verificados en `git log`:

- `e42915d` — FOUND
- `6e730f1` — FOUND
- `42599a5` — FOUND
