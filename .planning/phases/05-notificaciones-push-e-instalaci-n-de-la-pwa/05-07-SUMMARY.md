---
phase: 05-notificaciones-push-e-instalaci-n-de-la-pwa
plan: 07
subsystem: testing
tags: [integracion, web-push, tls, vapid, aes128gcm, rfc8291, outbox, idempotencia, vitest]

requires:
  - phase: 05-notificaciones-push-e-instalaci-n-de-la-pwa
    provides: "plan 05-06 (`POST /api/push/drain`, `lib/data/push.ts`, la rama `abortar_corrida` que dejó SIN cobertura ejecutable y marcó `human_judgment: true`), plan 05-05 (`enviar()`, `construirPayload()`, `TTL_SEGUNDOS`, `urgenciaDe()`), plan 05-04 (`decidir()` y la unión cerrada `MotivoDePush`), plan 05-03 (migración 17: trigger y cron, que es lo que obliga a correr esta suite sin servidor levantado), plan 05-02 (migración 16: `soporta_declarativo`)"
  - phase: 03-motor-de-sincronizaci-n-ical
    provides: "`lib/test/sync.ts` — el molde literal de este arnés: servidor local levantado al sembrar, contador de `hits` por destino, e invocación del route handler importando `POST` directamente"
  - phase: 04-dashboard-operativo-del-admin
    provides: "`lib/test/aseos.ts` (`sembrarEscenarioDeAseos`, `limpiarAseos`) y el patrón de crear un admin en GoTrue y llamar los RPC con SU JWT, de `aseos-admin.integration.test.ts`"
  - phase: 01-fundaciones-de-datos-y-seguridad
    provides: "`notifications` como outbox, `push_subscriptions`, y `confirm_cleaning` (migración 09), que es el emisor del caso de punta a punta"
provides:
  - "`lib/test/push.ts`: el push service falso sobre TLS, con certificado autofirmado generado en caliente, contador de peticiones por destino y respuesta programable"
  - "`cuerpoDescifradoDe()`: descifrado aes128gcm (RFC 8188 + RFC 8291) con `node:crypto` a secas, que convierte D-07 en una aserción sobre el CONTENIDO del aviso y no sobre su longitud"
  - "`lib/domain/push-drenaje.integration.test.ts`: las siete propiedades de la capa 3 del research, más D-07 y el caso de punta a punta"
  - "COBERTURA EJECUTABLE DE `abortar_corrida`: la única entrada `human_judgment: true` del plan 05-06 queda cerrada, medida contando filas revocadas y exigiendo cero"
  - "MEDIDO: `web-push` NO acepta un endpoint `http://`. Usa `https.request` siempre, sea cual sea el esquema del endpoint"
affects: [05-08, 05-09, pwa-del-aseador, despliegue-push, e2e-playwright]

tech-stack:
  added: []
  patterns:
    - "Push service falso sobre TLS con agente propio: la forma de ejercitar `https.request` contra respuestas hostiles sin desactivar la verificación de certificados en ninguna parte"
    - "Descifrado del payload en el arnés: cuando lo que se prueba viaja cifrado, el test descifra en vez de afirmar sobre la forma del sobre"
    - "Detección de contaminación por el trigger: el arnés convierte un `ya_procesada` inesperado en un fallo que explica la causa operativa, en vez de dejarlo salir como un `expect` desconcertante"

key-files:
  created:
    - lib/test/push.ts
    - lib/domain/push-drenaje.integration.test.ts
  modified: []

key-decisions:
  - "El falso habla TLS porque no hay alternativa: `web-push-lib.js` hace `https.request()` SIEMPRE y el esquema del endpoint solo decide el `audience` del JWT. Medido con una sonda: contra un `node:http` local el fallo es EPROTO en el apretón de manos y el servidor no registra ni una petición"
  - "La verificación de TLS NO se desactiva (T-05-29). Se AÑADE una autoridad de confianza a un agente propio instalado como agente por defecto del proceso de prueba y restaurado al cerrar. El certificado necesita `subjectAltName=IP:127.0.0.1`, y que lo necesite es la prueba de que la comprobación sigue encendida"
  - "El certificado se genera en caliente con `openssl` en un directorio temporal y se borra al cerrar: una clave privada versionada es un hallazgo de seguridad aunque solo sirva para pruebas, porque quien la encuentre después no sabe que solo sirve para pruebas"
  - "Las claves `p256dh` y `auth` se generan con `node:crypto` (`createECDH('prime256v1')` + `randomBytes(16)`), no con `web-push`: su `generateVAPIDKeys()` produce el par del SERVIDOR, que es otra cosa"
  - "D-07 se mide DESCIFRANDO el cuerpo, no por su longitud: una longitud distinta prueba que el JSON es más largo, no que la envoltura declarativa lleve su clave mágica"
  - "UN solo servidor falso con la ruta de discriminador, y no uno por suscripción como hace `sync.ts` con los feeds: el caso del 403 necesita dos destinos contestando a la vez y el contador global es lo que mide la idempotencia"
  - "Un escenario de aseos NUEVO por caso: `leerSuscripcionesVivas()` resuelve POR DESTINATARIO, así que compartir aseadora haría que el 410 de un caso dejara al siguiente sin destino y el fallo apareciera en el sitio equivocado"
  - "El `push_last_error` del caso 403 es `BadJwtToken`, NO `configuracion_rota` como decía el plan. Ver la desviación: cuando quien informa del problema es el push service, lo que se guarda es su `reason` de la unión cerrada, que dice CUÁL configuración está rota"

patterns-established:
  - "Sonda antes de escribir el arnés: la pregunta '¿acepta esto un http:// local?' se contesta con una sonda ejecutada y su salida literal pegada en la cabecera, no leyendo el README"
  - "Aserción de control antes de la aserción de valor: cada caso afirma primero que el aviso SALIÓ (`hits`), porque sin eso un fallo de envío dejaría verde el resto del caso sin haber ejercitado nada"
  - "Contar filas en vez de leer una: la propiedad 'cero suscripciones revocadas' se afirma con un filtro y un `toHaveLength(0)`, porque leer una sola fila pasa o falla según el orden que devuelva PostgREST"

requirements-completed: [NOTIF-01, NOTIF-03, NOTIF-04]

coverage:
  - id: D1
    description: "Un 410 de verdad, viajando por el https.request de Node, escribe revoked_at y revoked_reason en la fila correcta, y el aviso siguiente para esa misma aseadora no produce ninguna petición"
    requirement: NOTIF-03
    verification:
      - kind: integration
        ref: "lib/domain/push-drenaje.integration.test.ts > I1 (señuelo: quitar la revocación — corrido en los dos sentidos)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Un 429 con Retry-After reprograma la notificación a +60 s y NO desactiva ninguna suscripción"
    requirement: NOTIF-03
    verification:
      - kind: integration
        ref: "lib/domain/push-drenaje.integration.test.ts > I2 (señuelo: desactivar ante 429 — corrido en los dos sentidos)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Un 403 BadJwtToken corta la corrida al primer fallo y deja CERO filas con revoked_at. Cierra la entrada human_judgment: true que dejó abierta el plan 05-06"
    requirement: NOTIF-03
    verification:
      - kind: integration
        ref: "lib/domain/push-drenaje.integration.test.ts > I3/I4 (señuelo: tratarlo como error por suscripción — corrido en los dos sentidos)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Drenar dos veces la misma notificación produce exactamente UNA petición saliente, medido en el contador del falso y no en el estado de la fila"
    requirement: NOTIF-01
    verification:
      - kind: integration
        ref: "lib/domain/push-drenaje.integration.test.ts > I5 (señuelo: quitar el filtro de estado del reclamo — corrido en los dos sentidos)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Un aseador sin suscripción viva deja la notificación en descartado con sin_suscripciones y cero peticiones, nunca en enviado"
    requirement: NOTIF-03
    verification:
      - kind: integration
        ref: "lib/domain/push-drenaje.integration.test.ts > I6 (señuelo: marcarla enviada — corrido en los dos sentidos, pone DOS tests en rojo)"
        status: pass
    human_judgment: false
  - id: D6
    description: "El endpoint niega con 401 sin cuerpo sin header, con el header vacío y con un secreto equivocado, y nada de eso toca la cola"
    requirement: NOTIF-01
    verification:
      - kind: integration
        ref: "lib/domain/push-drenaje.integration.test.ts > I7 (señuelo: quitar la guarda — corrido en los dos sentidos)"
        status: pass
    human_judgment: false
  - id: D7
    description: "La misma notificación sale declarativa a un dispositivo y clásica al otro, verificado descifrando el cuerpo aes128gcm; y el aviso no lleva el código de acceso"
    requirement: NOTIF-04
    verification:
      - kind: integration
        ref: "lib/domain/push-drenaje.integration.test.ts > D-07"
        status: pass
    human_judgment: false
  - id: D8
    description: "Confirmar un aseo con el RPC real y el JWT real del admin acaba en una petición saliente al push service, con la notificación en enviado y last_success_at fresco. Es el criterio 2 del ROADMAP medido de extremo a extremo, menos el dispositivo físico"
    requirement: NOTIF-01
    verification:
      - kind: integration
        ref: "lib/domain/push-drenaje.integration.test.ts > confirmar un aseo con el JWT del admin acaba en una petición saliente"
        status: pass
    human_judgment: false
  - id: D9
    description: "La entrega real a un iPhone físico: que el aviso se pinte en la pantalla de bloqueo, sin el código de acceso, y que al tocarlo abra el aseo"
    verification: []
    human_judgment: true
    rationale: "Ninguna capa automatizable llega ahí. El falso mide que la petición sale y qué lleva dentro; lo que hace APNs con ella y cómo lo pinta iOS son los procedimientos manuales M1 a M6 del 05-RESEARCH.md, y exigen hardware. Playwright tampoco cubre este hueco: no ejecuta service workers en WebKit."

duration: 55min
completed: 2026-09-11
status: complete
---

# Fase 5 Plan 07: El drenaje de push, medido contra respuestas hostiles reales — Summary

Un push service falso pero real, hablando TLS en un puerto de esta máquina, prueba que un teléfono muerto se desactiva, uno saturado se reintenta, una configuración rota no borra nada, drenar dos veces no duplica, y confirmar un aseo con el JWT del admin acaba en una petición saliente.

## Performance

- **Duración:** ~55 min
- **Tareas:** 2
- **Archivos creados:** 2
- **Commits:** `e8dcaaa`, `4901cdb`

## La pregunta que había que contestar antes de escribir nada, y su respuesta

El plan mandaba **comprobar** si `web-push` acepta un endpoint `http://` local antes de montar el arnés. **No lo acepta.** La razón está en su propio código: `web-push-lib.js` abre con `const https = require('https')` y llama `https.request(httpsOptions)` **siempre**, sin mirar el esquema del endpoint. El esquema solo decide el `audience` del JWT de VAPID.

Medido con una sonda, no deducido. Contra un `node:http` local:

```
ERR code= EPROTO msg= write EPROTO
error:0A00010B:SSL routines:tls_validate_record_header: wrong version number
```

El servidor **no registró ni una petición**: el fallo ocurre en el apretón de manos. Un arnés montado sobre `http://` mediría siempre «fallo de transporte» y jamás llegaría a la tabla de decisión de `lib/push/errores.ts`, que es exactamente lo que esta suite viene a probar. Los ocho tests habrían fallado idénticos y ninguno habría dicho nada.

De ahí la salida que el plan anticipaba, con su candado:

> **La verificación de TLS no se desactiva. Nunca.** (T-05-29)

Ni `rejectUnauthorized: false`, ni `NODE_TLS_REJECT_UNAUTHORIZED`, ni `NODE_EXTRA_CA_CERTS`. Lo que se hace es **añadir** una autoridad de confianza —el certificado que el proceso acaba de generar— a un agente propio que sigue validando cadena e identidad, instalado como agente por defecto mientras el falso está levantado y **restaurado al cerrarlo**. El certificado lleva `subjectAltName=IP:127.0.0.1` justamente porque sin ese SAN la comprobación de identidad de Node falla, y que la necesite es la prueba de que la comprobación sigue encendida.

El par se genera en caliente con `openssl` en un directorio temporal y se borra al cerrar. **No hay ninguna clave privada versionada en el repo**, y no puede haberla: un `key.pem` commiteado es un hallazgo de seguridad aunque solo sirva para pruebas, porque nadie que lo encuentre después sabe que solo sirve para pruebas.

## Qué se construyó

### Task 1 — `lib/test/push.ts` (`e8dcaaa`)

El molde es `lib/test/sync.ts` y se sigue en lo que importa: servidor local de verdad en vez de un doble de `fetch`, contador de `hits` por destino, invocación del route handler importando `POST` y pasándole un `Request` con el header del secreto, y fallo ruidoso si falta `CRON_SHARED_SECRET` con el mismo mensaje (un 401 sin cuerpo es indistinguible de un defecto del worker).

Dos cosas se apartan del molde, y las dos por una razón medida:

- **Un solo servidor, con `/push/<id>` de discriminador.** `sync.ts` levanta uno por feed porque la dirección del feed es una credencial que tiene que estar persistida antes de la primera corrida. Aquí el reparto es distinto: el caso del `403` necesita **dos destinos contestando a la vez**, y el contador de peticiones **totales** es con lo que se mide la idempotencia.
- **El endpoint no se devuelve.** `sembrarSuscripcion()` devuelve el id de la fila y el segmento de la ruta, nunca la URL completa. Misma regla que `sembrarFeed()` aplica a la dirección del feed: el endpoint es una credencial de envío (T-05-04) y reexportarlo sería invitar a que un spec lo interpole en un mensaje de aserción, que acaba en un log y los logs son para siempre.

**Las claves son criptográficamente válidas, y no es un lujo.** `web-push` cifra el cuerpo con `p256dh` y `auth` **antes** de abrir el socket (RFC 8291). Una cadena de relleno revienta dentro de `generateRequestDetails`, la promesa se rechaza sin código HTTP, `enviar()` devuelve `statusCode: 0` y el falso no recibe nada: un rojo que no dice nada y que además atraviesa todos los casos por igual. Se generan con `node:crypto` a secas —`createECDH('prime256v1')` para el punto público sin comprimir de 65 bytes, `randomBytes(16)` para el secreto de autenticación— y **no** con `web-push`, cuyo `generateVAPIDKeys()` produce el par del *servidor*, que es otra cosa y no encaja en esas dos columnas.

### `cuerpoDescifradoDe()`: por qué se descifra de verdad

El plan aceptaba como alternativa afirmar sobre la **longitud** del cuerpo cifrado, que difiere de forma estable entre las dos ramas de D-07. Se descartó: una longitud distinta prueba que el JSON es más largo, **no** que la envoltura declarativa lleve su clave mágica. Lo sería igual si estuviera mal formada.

Descifrar cuesta veinticinco líneas de `node:crypto` (RFC 8188 §2.1 para el sobre, RFC 8291 §3.4 para la derivación) y convierte la aserción en la que el contrato pide de verdad: `web_push === 8030`, `notification` presente, `datos` presente; y en la rama clásica, `web_push` y `notification` **ausentes**.

Se implementa con `node:crypto` y **no importando `http_ece`**, que es una dependencia *transitiva* de `web-push`: depender del árbol interno de otro paquete es una rotura silenciosa el día que ese paquete cambie de librería.

### Task 2 — `push-drenaje.integration.test.ts` (`4901cdb`)

Ocho tests, un `describe` por propiedad con el identificador del research delante para que la trazabilidad sea greppable.

| Caso | Qué mide |
|---|---|
| **I1** | `410` → `revoked_at` + `revoked_reason = http_410`. Y la mitad que importa: un aviso **nuevo** para la misma aseadora produce **cero** peticiones. |
| **I2** | `429` + `Retry-After: 60` → `pendiente` a +60 s, `push_attempts = 1`, suscripción viva con `failure_count = 1`. |
| **I3/I4** | Dos suscripciones, `403 BadJwtToken` a todo → se corta al **primer** fallo (1 petición, no 2) y **cero** filas revocadas. |
| **I5** | Dos drenajes → **una** petición. Medido en el contador, no en el estado. |
| **I6** | Sin destino → `descartado` con `sin_suscripciones`, cero peticiones. |
| **I7** | Sin header, header vacío, secreto equivocado → `401` **sin cuerpo** en los tres, y la cola intacta. |
| **D-07** | La misma notificación, declarativa a un dispositivo y clásica al otro, descifrando. Más `TTL`, `Urgency` y `Topic`. |
| **Punta a punta** | `confirm_cleaning` con el JWT real del admin → `notifications` → worker → **una** petición saliente. |

### La aserción de I1 que el plan no pedía así, y es mejor

El plan proponía medir «la segunda corrida no sube el contador» drenando **la misma** notificación otra vez. Eso no mide lo que dice: después de un `410` la notificación queda `descartado`, así que la segunda invocación no encuentra nada que reclamar y el contador no sube **por la idempotencia**, no por la revocación. El caso pasaría en verde con la revocación rota.

Lo que se escribió es un **aviso nuevo** para la misma aseadora. Ahí el reclamo sí prospera, y el contador solo se queda en cero si la suscripción dejó de estar viva de verdad. El señuelo lo confirma: quitar la revocación pone I1 en rojo.

### Cómo se protege esta suite del trigger de la migración 17

`notifications_disparar_push` encola un POST **real** al worker en cuanto se inserta una notificación. Con el Vault local vacío se queda en un `raise warning` y no pasa nada —que es el estado de esta máquina, verificado—, pero con los dos secretos puestos **y** un servidor escuchando, ese POST reclamaría la notificación antes que el test y los contadores dejarían de medir lo que dicen.

`drenar()` lo detecta: un `outcome: 'ya_procesada'` no esperado se convierte en un error que nombra la causa operativa y dice cómo arreglarla. El único caso legítimo —la segunda corrida de I5— lo declara explícitamente con `esperaYaProcesada: true`. Sin esto, el síntoma sería un `expect(hits).toBe(1)` fallando en un test que parece no tener nada que ver.

## Desviaciones del plan

### 1. [Regla 1 — defecto en el plan] El `push_last_error` del caso `403` es `BadJwtToken`, no `configuracion_rota`

- **Encontrado en:** Task 2, al escribir el caso I3/I4.
- **Problema:** el plan dice literalmente que tras el `403 BadJwtToken` la notificación queda `pendiente` con `push_last_error = 'configuracion_rota'`. El código no hace eso, **y hace bien**: `decidir()` devuelve `{ tipo: 'abortar_corrida', motivo: 'BadJwtToken' }` y el worker escribe ese motivo. `configuracion_rota` es el código que nace **en** el worker cuando falta configuración *propia* (el origen absoluto, o el par VAPID que hace lanzar a `enviar()`).
- **Arreglo:** el test afirma `'BadJwtToken'`, con un comentario que explica la distinción. Es la lectura correcta y además la más útil: `push_last_error` es una columna que el admin ve (T-05-22), y «BadJwtToken» dice *cuál* configuración está rota mientras que «configuracion_rota» solo dice que algo lo está. La propiedad que el criterio de aceptación del plan exige —contar filas revocadas y exigir cero— se afirma igual y es la que importa.
- **Archivos:** `lib/domain/push-drenaje.integration.test.ts`
- **Commit:** `4901cdb`

### 2. [Regla 2 — funcionalidad crítica faltante] Detección de contaminación por el trigger

- **Problema:** el plan no contempla que el trigger de la migración 17 pueda drenar la notificación antes que el test. Con el Vault local sembrado (lo hace `scripts/dev/sync-local.sh`) y un `npm run dev` levantado, pasa, y el síntoma es un contador de peticiones equivocado en un test que parece no tener relación.
- **Arreglo:** `drenar()` convierte un `ya_procesada` inesperado en un error que explica la causa y el remedio. El caso legítimo se declara.
- **Archivos:** `lib/test/push.ts`
- **Commit:** `e8dcaaa`

### 3. [Regla 3 — bloqueante] El arnés siembra notificaciones, que el plan no listaba

- **Problema:** la lista de exports del plan (`levantarPushFalso`, `sembrarSuscripcion`, `programarRespuesta`, `drenar`, `limpiarPush`) no incluye cómo aparece la notificación a drenar, pero `limpiarPush()` sí dice que tiene que borrarlas.
- **Arreglo:** `sembrarNotificacion()` para los seis casos de comportamiento del worker —donde meter un RPC por medio arrastraría la máquina de estados de los aseos a un test que mide el drenaje— y `registrarNotificacion(id)` para el caso de punta a punta, donde la notificación la escribe `confirm_cleaning` y lo único que hace falta es que la limpieza se entere.
- **Archivos:** `lib/test/push.ts`
- **Commit:** `e8dcaaa`

### 4. [Regla 2] Un escenario de aseos nuevo por caso, no uno compartido

- **Problema:** `leerSuscripcionesVivas()` resuelve **por destinatario**. Con una sola aseadora compartida, el `410` de I1 dejaría a I5 sin destino vivo y el fallo aparecería en el caso equivocado, con un mensaje que no señala la causa.
- **Arreglo:** cada caso llama a `sembrarEscenarioDeAseos()`. Cuesta segundos y `limpiarAseos()` los recoge todos.
- **Archivos:** `lib/domain/push-drenaje.integration.test.ts`
- **Commit:** `4901cdb`

### 5. Refinamientos escritos a propósito

- **`cuerpoDescifradoDe()` en vez de la longitud del cuerpo.** Alternativa explícitamente aceptada por el plan, descartada con su razón. Ver arriba.
- **D-07 con dos suscripciones y UNA notificación**, en vez de dos notificaciones. Es lo que hace visible que la rama la elige **el dispositivo** y no el aviso, que es literalmente lo que dice `leerSuscripcionesVivas()` sobre `soporta_declarativo`.
- **El falso responde `404 UnknownDestination` a una ruta que no sembró nadie**, en vez de `201`. Un `201` en silencio contaría como entregado un envío a ninguna parte.
- **Aserción de control en cada caso.** Antes de afirmar sobre el efecto, cada test afirma que el aviso **salió** (`hits`). Sin eso, un fallo de envío —claves malas, TLS mal montado— dejaría verde el resto del caso sin haber ejercitado nada.

## Señuelos corridos, en los dos sentidos

Los seis del plan. Cada uno se aplicó al código, se corrió la suite, se revirtió con `git checkout --` del archivo concreto, y se volvió a correr.

| # | Señuelo | Archivo | Lado roto | Lado sano |
|---|---|---|---|---|
| I1 | Quitar la llamada a `revocarSuscripcion()` en `desactivar_suscripcion` | `route.ts` | `1 failed \| 7 passed` — *I1* en rojo | `8 passed` |
| I2 | Meter el `429` en la rama de suscripción muerta (`404 \|\| 410 \|\| 429`) | `errores.ts` | `1 failed \| 7 passed` — *I2* en rojo | `8 passed` |
| I3/I4 | Tratar `abortar_corrida` como error por suscripción (revocar y seguir) | `route.ts` | `1 failed \| 7 passed` — *I3/I4* en rojo | `8 passed` |
| I5 | Quitar `.eq('push_status', 'pendiente')` del reclamo | `lib/data/push.ts` | `1 failed \| 7 passed` — *I5* en rojo | `8 passed` |
| I6 | Marcar `enviado` cuando no hay ninguna suscripción viva | `route.ts` | **`2 failed \| 6 passed`** — *I6* **y la segunda mitad de I1** | `8 passed` |
| I7 | Quitar la guarda del secreto compartido | `route.ts` | `1 failed \| 7 passed` — *I7* en rojo | `8 passed` |

El señuelo de I6 es el único que pone **dos** tests en rojo, y no es ruido: la segunda mitad de I1 comprueba que un aviso a una aseadora sin destino vivo queda `descartado` con `sin_suscripciones`. Es la misma propiedad mirada desde otro sitio, y que las dos caigan juntas es la señal correcta.

## Verificación

| Puerta | Antes (ola 4) | Ahora |
|---|---|---|
| `npm run test:integration` | 16 archivos / 145 tests (línea base de la Fase 4) | **17 archivos / 153 tests, PASS** |
| `npm run test:integration -- push-drenaje` | — | **8 tests, cero** |
| `npm run test:unit` | 39 archivos / 699 tests | **39 archivos / 699 tests, PASS** (sin cambios: este plan no toca código de producción) |
| `npm run db:test` | Files=9, Tests=229, PASS | **Files=9, Tests=229, PASS** |
| `npx tsc --noEmit` | limpio | **limpio** |
| `npm run lint` | 0 errores, 2 avisos preexistentes | **0 errores, 2 avisos preexistentes** |
| `npm run ci:arch` | limpio | **limpio** |
| `npm run build` | 13 rutas | **13 rutas** |
| `npm run db:types:check` | sin deriva | **sin deriva** |

Criterios de aceptación del plan, uno por uno:

- `lib/test/push.ts` exporta `levantarPushFalso`, `sembrarSuscripcion`, `programarRespuesta`, `drenar` y `limpiarPush`. ✔
- La cabecera declara que `web-push` **no** aceptó `http://`, con la salida literal de la sonda. ✔
- Las claves son criptográficamente válidas y el comentario dice con qué se generaron. ✔
- `npm run test:integration -- push-drenaje` corre **8** tests y sale en cero. ✔
- Existe un test que **cuenta** filas con `revoked_at` no nulo y exige cero tras el `403`. ✔ (I3/I4)
- Existe un test que afirma sobre el contador de peticiones para la idempotencia, no sobre el estado. ✔ (I5)
- Existe un test que llama `confirm_cleaning` con un JWT de admin real y sigue la cadena hasta la petición saliente. ✔
- `npm run test:integration` completo verde, por encima de la línea base de la Fase 4 (145 → 153). ✔
- Los seis señuelos corridos en los dos sentidos y anotados. ✔

### T-05-27: el arnés no entra al bundle

`npm run build` sale con las mismas 13 rutas, y el grep sobre los artefactos emitidos lo confirma:

```
grep -rl "levantarPushFalso\|sembrarSuscripcion" .next/static .next/server   → vacío
```

## Lo que queda abierto

- **La entrega real a un iPhone físico.** Es D9, la única entrada `human_judgment: true` de este plan. El falso mide que la petición sale y qué lleva dentro; qué hace APNs con ella y cómo la pinta iOS son los procedimientos M1 a M6 del `05-RESEARCH.md` y exigen hardware. Playwright tampoco lo cubre: no ejecuta service workers en WebKit.
- **Esta suite no puede correr con un servidor de la aplicación levantado** si el Vault local tiene los dos secretos. Está detectado y explicado en el error, no silenciado.
- **El arnés depende de `openssl` en el PATH.** Está en macOS y en cualquier imagen de CI con Docker, que es el mismo requisito que la suite ya tenía. El fallo, si falta, dice exactamente qué pasó y por qué hace falta.

## Threat Flags

Ninguna superficie nueva. Este plan no añade código de producción: `lib/test/` es código de prueba, y su riesgo modelado (T-05-27, colarse al bundle) queda medido arriba con el grep sobre los artefactos del build.

## Self-Check: PASSED

Archivos declarados, verificados en disco:

- `lib/test/push.ts` — FOUND
- `lib/domain/push-drenaje.integration.test.ts` — FOUND

Commits declarados, verificados en `git log`:

- `e8dcaaa` — FOUND
- `4901cdb` — FOUND
