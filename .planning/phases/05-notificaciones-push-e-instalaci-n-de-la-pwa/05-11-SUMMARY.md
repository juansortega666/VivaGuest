---
phase: 05-notificaciones-push-e-instalaci-n-de-la-pwa
plan: 11
subsystem: frontend
tags: [server-actions, web-push, pwa, verificacion, rls, security-definer, react]

requires:
  - phase: 05-notificaciones-push-e-instalaci-n-de-la-pwa
    provides: "plan 05-02: las cuatro columnas de evidencia, el grant POR COLUMNA y las tres funciones definer (`registrar_prueba_de_aviso`, `confirmar_prueba_por_toque`, `confirmar_prueba_a_mano`)"
  - phase: 05-notificaciones-push-e-instalaci-n-de-la-pwa
    provides: "planes 05-04 a 05-06: la tuberia de envio entera (`construirPayload`, `claveDeColapso`, `enviar`, `decidir`) y el drenaje que la estrena"
  - phase: 05-notificaciones-push-e-instalaci-n-de-la-pwa
    provides: "plan 05-10: el arbol `(cleaner)` con su escala tipografica propia, el guardarrail `check-escala-movil.sh` y el molde de Server Action con `exigirSesion()`"
provides:
  - "`enviarAvisoDePrueba`: el unico disparador de push del arbol del aseador, con el tope contado en la base ANTES de enviar"
  - "`confirmarPruebaPorToque`: el grado BUENO, token de un solo uso, neutro ante un token ya consumido"
  - "`confirmarPruebaAMano`: el grado FLOJO, acotado por las dos reglas del RPC"
  - "`ResultadoDePruebaDeAviso`: `ResultadoAccion` mas `topeAgotado`, `suscripcionMuerta` y `codigo` de union cerrada"
  - "`PruebaDeAviso`: el paso 4 del asistente con sus tres estados visibles, el contador y los dos grados"
  - "`lib/push/origen.ts`: la resolucion del origen absoluto, ahora compartida entre los dos emisores de avisos"
affects: [05-12, 05-14, 05-15, 05-16, 05-17]

tech-stack:
  added: []
  patterns:
    - "El tope de una accion que consume un recurso externo se cuenta en la base ANTES de consumirlo, nunca despues ni en el cliente"
    - "Un resultado de Server Action que la pantalla tiene que ramificar lleva campos opcionales de union cerrada, no un mensaje que el cliente compare por texto"
    - "Un codigo de diagnostico viaja en un campo aparte del mensaje humano: el mensaje es para el aseador, el codigo para quien depura"
    - "Una tabla de presentacion (`Record<Estado, {...}>`) cuando un contrato de diseno declara varios estados que cambian mas de una cosa a la vez"

key-files:
  created:
    - app/(cleaner)/instalar/_actions.ts
    - app/(cleaner)/instalar/_actions.test.ts
    - app/(cleaner)/_components/PruebaDeAviso.tsx
    - lib/push/origen.ts
  modified:
    - app/api/push/drain/route.ts

key-decisions:
  - "El aviso de prueba NO estrena valor en el enum `notification_type`, y no por comodidad: `lib/push/colapso.ts` ata `ClaseDeAviso` al enum de la base a proposito, para que anadir un valor sin pasar por ahi sea un error de tipos. Un aviso de prueba no es una fila de `notifications`. La separacion frente a una asignacion real la da el DISCRIMINADOR de `claveDeColapso()`, y queda garantizada por construccion: una asignacion siempre lleva `cleaning_id` y el discriminador lo prefiere sobre la cadena del aviso de prueba"
  - "La action NO lee `verificacion_intentos`. El criterio de aceptacion prohibe esa cadena fuera de comentarios, y la prohibicion es correcta: el contador de pantalla es cortesia y el control es el RPC. El estado de agotado llega por `topeAgotado`, derivado del `P0001` del RPC, no de una cuenta del cliente"
  - "TTL de 120 segundos y no las cuatro horas del resto de avisos. El copy de §8.6 dice *si no llega en un minuto, vuelve a enviarlo*: un aviso de prueba que llega media hora despues no verifica nada y suena cuando el asistente ya se cerro"
  - "La urgencia se pasa explicita (`'high'`) y no derivada de `urgenciaDe()`: la clase que viaja en el payload es prestada, y derivar de ella escondería la decision"
  - "El cuerpo de la respuesta del push service entra a `decidir()` y NO SALE: lo que llega a la pantalla es `codigo`, de la union cerrada `CodigoDePush` (T-05-04). Y el codigo no se pinta: no se le ensena un `http_500` a alguien de pie con el telefono en la mano"
  - "El guard se copia en forma y no se importa de `app/(cleaner)/_actions.ts`. La razon es de Next y no de gusto: aquel archivo lleva `'use server'`, y exportar de ahi una funcion asincrona la convertiria en un endpoint HTTP publico mas. Un guard reutilizable no puede vivir detras de la puerta que el propio guard existe para cerrar"
  - "`origenDeLaAplicacion()` sale de la ruta de drenaje a `lib/push/origen.ts`. Desde este plan hay DOS emisores de avisos y la resolucion del origen es una decision de seguridad: dos copias son dos copias que se desincronizan, y la consecuencia de que diverjan es mandar a las aseadoras a otro despliegue desde su pantalla de bloqueo"
  - "La confirmacion a mano solo se renderiza en el estado *esperando*. Ni antes del primer envio (no hay nada que confirmar, y el RPC lo rechazaria) ni despues de *llegó* (degradaria un hecho por uno peor, y el RPC tampoco lo permite)"
  - "El contador no se pinta antes del primer envio. §8.7 exige que no se oculte *mientras tanto*, y `Intento 0 de 3` delante de alguien que no ha tocado nada es ruido, no informacion"

patterns-established:
  - "Un senuelo de ORDEN se prueba con `mock.invocationCallOrder`, no con un espia de secuencia a mano: es la unica forma de afirmar 'A antes que B' entre dos dobles independientes"
  - "Cuando un contrato de diseno declara N estados que cambian fondo, icono y copy a la vez, la tabla va en un `Record` al final del archivo y el JSX la consume: se lee en paralelo contra el contrato sin recorrer el arbol"

requirements-completed: [PWA-02, PWA-03]

coverage:
  - id: D1
    description: "El tope de tres envios de prueba se cuenta en la base ANTES de mandar el push, de modo que un fallo de envio no deja el limite evadible"
    requirement: PWA-02
    verification:
      - kind: unit
        ref: "app/(cleaner)/instalar/_actions.test.ts > llama `registrar_prueba_de_aviso` ANTES que `enviar()`"
        status: pass
      - kind: unit
        ref: "app/(cleaner)/instalar/_actions.test.ts > al cuarto intento devuelve el hint de §8.7 TAL CUAL y no envia nada"
        status: pass
      - kind: unit
        ref: "app/(cleaner)/instalar/_actions.test.ts > una suscripcion ajena o revocada (42501) no envia nada"
        status: pass
      - kind: other
        ref: "senuelo corrido: mover el envio delante del RPC pone en rojo la asercion de `invocationCallOrder` (7 tests en rojo de 23). Restaurado y verde"
        status: pass
    human_judgment: false
  - id: D2
    description: "Las tres actions arrancan por `exigirSesion()`, de modo que el disparador de push no queda abierto (T-05-39)"
    requirement: PWA-02
    verification:
      - kind: unit
        ref: "app/(cleaner)/instalar/_actions.test.ts > el guard va antes de tocar nada (3 casos, uno por action)"
        status: pass
      - kind: other
        ref: "senuelo corrido: sustituir el guard por una llamada que traga el error pone en rojo el caso de `enviarAvisoDePrueba`. Restaurado y verde"
        status: pass
    human_judgment: false
  - id: D3
    description: "El aviso de prueba viaja por la misma tuberia que un aseo real, incluida la rama de formato que le toque al destino (D-07)"
    requirement: PWA-02
    verification:
      - kind: unit
        ref: "app/(cleaner)/instalar/_actions.test.ts > D-07 rama clasica: el destino NO soporta el formato declarativo"
        status: pass
      - kind: unit
        ref: "app/(cleaner)/instalar/_actions.test.ts > D-07 rama declarativa: el destino SI soporta el formato declarativo"
        status: pass
      - kind: unit
        ref: "app/(cleaner)/instalar/_actions.test.ts > sale con urgencia alta y con un TTL de MINUTOS, no de horas"
        status: pass
      - kind: unit
        ref: "app/(cleaner)/instalar/_actions.test.ts > su clave de colapso NUNCA coincide con la de una asignacion real del mismo aseador"
        status: pass
    human_judgment: false
  - id: D4
    description: "Ninguna de las tres actions escribe ni lee la evidencia de verificacion: la mueven las funciones definer"
    requirement: PWA-02
    verification:
      - kind: unit
        ref: "app/(cleaner)/instalar/_actions.test.ts > ninguna escribe la evidencia de verificacion: solo pasa por los RPC definer"
        status: pass
      - kind: other
        ref: "grep -vE '^\\s*(//|/\\*|\\*)' app/(cleaner)/instalar/_actions.ts | grep -cE 'verificado_at|verificacion_grado|verificacion_intentos' → 0"
        status: pass
      - kind: integration
        ref: "supabase/tests/07_push.test.sql #14-21 (plan 05-02): las cuatro columnas no son escribibles por `authenticated`, ni en UPDATE ni en INSERT"
        status: pass
    human_judgment: false
  - id: D5
    description: "Los dos grados de confirmacion son hechos distintos end to end, y el que no prueba nada no puede fabricarse"
    requirement: PWA-02
    verification:
      - kind: unit
        ref: "app/(cleaner)/instalar/_actions.test.ts > confirmarPruebaPorToque llama al RPC con el token del aviso"
        status: pass
      - kind: unit
        ref: "app/(cleaner)/instalar/_actions.test.ts > con un token que el RPC no reconoce NO lanza y devuelve un resultado neutro"
        status: pass
      - kind: unit
        ref: "app/(cleaner)/instalar/_actions.test.ts > confirmarPruebaAMano sobre una suscripcion sin envio previo devuelve el hint del RPC"
        status: pass
      - kind: other
        ref: "`PruebaDeAviso` reporta el grado hacia arriba con `alConfirmar(grado)`, y la confirmacion a mano solo se renderiza en el estado *esperando* (condicion `estado === 'esperando'`)"
        status: pass
    human_judgment: false
  - id: D6
    description: "El paso 4 tiene tres estados visualmente distintos, un contador que nunca deja al aseador a oscuras y cero rojo"
    requirement: PWA-03
    verification:
      - kind: other
        ref: "grep -cE 'destructive' app/(cleaner)/_components/PruebaDeAviso.tsx → 0; grep -c 'AlertDialog' → 0"
        status: pass
      - kind: other
        ref: "las nueve cadenas literales de §8.6, §8.7 y §18.1 presentes con `grep -cF`, una vez cada una"
        status: pass
      - kind: other
        ref: "grep -c 'aria-live' → 2 (una en el JSX, una en el comentario que explica por que es `polite`)"
        status: pass
      - kind: other
        ref: "grep -c 'Ya sonó' → 1, bajo `estado === 'esperando'`"
        status: pass
      - kind: other
        ref: "npm run ci:arch → 0 con los tres scripts; npx tsc --noEmit → 0; npm run build → 0, 14 rutas"
        status: pass
    human_judgment: false

duration: 21min
completed: 2026-09-11
status: complete
---

# Phase 5 Plan 11: El aviso de prueba y sus dos grados Summary

**El paso 4 del asistente ya existe entero: el aseador toca un botón, la base cuenta el intento antes de que salga un solo push, el aviso viaja por la misma tubería que un aseo real, y si lo toca queda una evidencia que nadie pudo fabricar.**

## Performance

- **Duration:** 21 min
- **Tasks:** 2 de 2
- **Files modified:** 5 (4 creados, 1 modificado)

## Accomplishments

- **D-02 tiene implementación, y no se suavizó.** Las tres Server Actions y el componente implementan la frase textual del usuario: la instalación no termina cuando la app aparece en la pantalla de inicio, termina cuando llegó un aviso de prueba a ese teléfono. Los dos grados son hechos distintos desde el RPC hasta el `alConfirmar(grado)` que el asistente consume.
- **El tope de tres se cuenta antes de gastar el recurso, y hay un señuelo corrido que lo demuestra.** `registrar_prueba_de_aviso` va antes de `enviar()`, afirmado por `mock.invocationCallOrder`. Invertir las dos llamadas pone 7 de 23 tests en rojo, y el primero es justo el del orden. La razón no es estética: si enviara primero, un fallo del tope no habría contado el intento y el límite sería evadible reintentando (T-05-08).
- **El aviso de prueba no estrena un camino propio.** Reusa `construirPayload()`, `claveDeColapso()`, `enviar()` y `decidir()` enteros, con las dos ramas de formato de D-07 probadas una por test. Un camino propio verificaría un camino que después nadie usa.
- **La evidencia sigue siendo inalcanzable desde el navegador.** Las cuatro columnas de la migración 16 no aparecen en ningún objeto que llegue a la base, y tampoco en el `select`: la única escritura directa de las tres actions es la baja de la propia suscripción, con dos columnas y solo dos.
- **Una duplicación de seguridad cerrada antes de nacer.** `origenDeLaAplicacion()` estaba dentro de la ruta de drenaje. Desde este plan hay dos emisores de avisos, así que se extrajo a `lib/push/origen.ts` en vez de copiarse. Dos copias de la decisión que resuelve a qué origen navega un aviso son dos copias que se desincronizan, y la consecuencia de que diverjan es mandar a las aseadoras a otro despliegue desde su pantalla de bloqueo.

## Task Commits

1. **Task 1 (RED): el contrato del aviso de prueba en rojo** — `42ce817` (test)
2. **Task 1 (GREEN): las tres Server Actions** — `f13aa70` (feat)
3. **Task 2: `PruebaDeAviso`, los tres estados y los dos grados** — `92251b2` (feat)

## Files Created/Modified

- `app/(cleaner)/instalar/_actions.test.ts` — 23 aserciones en seis grupos: el guard como primera operación de las tres, el orden RPC-antes-de-enviar, el payload y sus dos ramas, lo que dijo el push service, los dos grados, y las dos propiedades que atraviesan las tres actions. `construirPayload()` y `claveDeColapso()` **no** se sustituyen: son puros y son justo lo que hay que medir.
- `app/(cleaner)/instalar/_actions.ts` — las tres actions. `enviarAvisoDePrueba` en seis pasos numerados y comentados; `confirmarPruebaPorToque` con su neutralidad deliberada ante un token consumido; `confirmarPruebaAMano` con las dos reglas del RPC explicadas.
- `app/(cleaner)/_components/PruebaDeAviso.tsx` — el paso 4. Cinco estados internos (tres visibles de §8.6, más `inicial` y el `agotado` de §8.7), tabla de presentación al final del archivo, confirmación por toque disparada una sola vez con `useRef`, contador `tabular-nums` y dos botones con los 8px mínimos entre ellos.
- `lib/push/origen.ts` — la resolución del origen absoluto, con el razonamiento completo de por qué no se deriva de `req.url` ni del header `Host` y por qué devolver `null` es preferible a inventarse un origen.
- `app/api/push/drain/route.ts` — la copia local de `origenDeLaAplicacion()` sustituida por el import. Comportamiento idéntico; el comentario que queda apunta al módulo nuevo y conserva la consecuencia local (`configuracion_rota` y reintento).

## Decisions Made

Las nueve del bloque `key-decisions`. Las dos que más condicionan a quien siga:

1. **El aviso de prueba no tiene clase propia en `notification_type`, y no debe tenerla.** `lib/push/colapso.ts` ata `ClaseDeAviso` al enum de la base a propósito, con un comentario que dice que añadir un valor sin pasar por ahí tiene que ser un error de tipos. Un aviso de prueba no es una fila de `notifications`: no la escribe nadie, no entra al panel de alertas y no se audita. Así que la clase que viaja es prestada (`asignacion`, la única del aseador y la que comparte urgencia) y la separación real la da el **discriminador** `prueba-de-aviso` que `claveDeColapso()` mete en el material del hash cuando no hay aseo. Una asignación real siempre lleva `cleaning_id`, que el discriminador prefiere, así que las dos claves difieren por construcción y no por suerte. Hay un test que lo afirma contra una asignación real del mismo aseador.
2. **El contador de pantalla no lee la base.** El criterio de aceptación del plan prohíbe la cadena `verificacion_intentos` fuera de comentarios en el archivo de actions, y la prohibición es correcta: el control del tope es el RPC. El componente arranca en `intentosPrevios` (que le pasa la página del plan 05-12, desde el servidor) y suma uno por envío exitoso; el estado de agotado lo decide `topeAgotado`, derivado del `P0001` del RPC. Si la cuenta local y la base discreparan, manda la base.

## Deviations from Plan

**1. [Rule 3 - Blocking] El plan pide `claveDeColapso()` "con su propia clase de evento", y esa clase no existe ni puede crearse en este plan**
- **Found during:** Task 1
- **Issue:** `claveDeColapso()` y `construirPayload()` exigen `type: ClaseDeAviso`, que es `Enums<'notification_type'>` — las once clases del enum de la base, ninguna de las cuales es un aviso de prueba. Crear una duodécima sería una migración 17, más pgTAP, más regeneración de tipos, y además rompería la garantía que la cabecera de `lib/push/colapso.ts` declara explícitamente: que el tipo quede atado al enum para que añadir un valor sin pasar por ahí sea un error de tipos.
- **Fix:** La separación se consigue por el **discriminador** en vez de por la clase. `dedupe_key = 'prueba-de-aviso'`, que `claveDeColapso()` usa como tercer campo del material cuando `cleaning_id` es `null`. Una asignación real siempre tiene `cleaning_id`, así que los dos materiales difieren siempre. Bonus no buscado: al ser estable por aseador, los reenvíos del paso 4 sí colapsan entre sí, y tres intentos dejan un solo aviso en la bandeja en vez de tres.
- **Verification:** test `su clave de colapso NUNCA coincide con la de una asignacion real del mismo aseador`, que compara contra una `claveDeColapso()` real construida en el test.
- **Files modified:** `app/(cleaner)/instalar/_actions.ts` (razón escrita entera junto a la constante).
- **Committed in:** `f13aa70`.

**2. [Rule 2 - Missing critical functionality] `origenDeLaAplicacion()` habría quedado duplicada en dos emisores de avisos**
- **Found during:** Task 1
- **Issue:** El destino de navegación del aviso se resuelve contra un origen absoluto, y esa resolución es una decisión de seguridad con consecuencia visible (un origen equivocado manda a todas las aseadoras a otro despliegue desde su pantalla de bloqueo, sin barra de direcciones que delate el salto). Vivía dentro de `app/api/push/drain/route.ts` cuando había un solo emisor. Este plan añade el segundo.
- **Fix:** Extraída a `lib/push/origen.ts` con el razonamiento completo, e importada desde los dos sitios. Comportamiento idéntico, byte a byte, en el cuerpo de la función.
- **Verification:** `npx tsc --noEmit` → 0; `npm run test:integration` → 18 archivos, 163 tests, todos verdes, incluido el drenaje.
- **Files modified:** `lib/push/origen.ts` (creado), `app/api/push/drain/route.ts`.
- **Committed in:** `f13aa70`.

**3. [Rule 1 - Bug] El plan pide leer `verificacion_intentos` y su propio criterio de aceptación lo prohíbe**
- **Found during:** Task 1
- **Issue:** El `<action>` sugiere que la action alimente el contador de §8.7, pero el criterio de aceptación exige que `grep -cE "verificado_at|verificacion_grado|verificacion_intentos"` sobre el archivo sin comentarios devuelva **0**. Las dos cosas no caben a la vez.
- **Fix:** Gana el criterio, que además es el que coincide con el plan 05-02 (*"el contador de pantalla es cortesía; el control es el RPC"*). El `select` lee tres columnas: las dos claves de cifrado y la rama de formato. El contador del componente arranca de un prop del servidor y el estado de agotado llega por `topeAgotado`.
- **Verification:** el criterio devuelve 0; hay un test que recorre `select.mock.calls` afirmando que ninguna de las cuatro columnas aparece en el `select`.
- **Committed in:** `f13aa70`.

**Total deviations:** 3 (1 bloqueante por tipo, 1 endurecimiento, 1 contradicción interna del plan resuelta a favor del criterio de aceptación)
**Impact on plan:** Ninguna afloja una garantía. La primera consigue la propiedad pedida por una vía más fuerte (por construcción en vez de por desigualdad de hashes); la segunda cierra una duplicación de seguridad; la tercera elimina una lectura innecesaria.

## Issues Encountered

**1. El guard no se puede importar, y la razón no es de gusto.**
El plan sugiere importar el `guard()` de `app/(cleaner)/_actions.ts` «si ya quedó exportable». No lo está, y no debe estarlo: aquel archivo lleva `'use server'`, así que exportar de ahí una función asíncrona la convertiría en un endpoint HTTP público más. Un guard reutilizable no puede vivir detrás de la puerta que el propio guard existe para cerrar. Se copió en forma, con esa razón escrita al lado, que es la otra rama que el plan autoriza.

**2. El `Loader2` no necesitó ninguna excepción nueva.**
§16.3 pide que el spinner del estado *esperando* siga girando con `prefers-reduced-motion: reduce`. `app/globals.css` ya declara esa excepción desde la Fase 2, aplicada a `.animate-spin` con `!important`. No se tocó nada; queda el comentario apuntando a dónde vive, para que nadie la vuelva a añadir.

## User Setup Required

Ninguna. `APP_BASE_URL` ya está en `.env.local` desde el plan 05-01 y es la misma variable que usa el drenaje.

## Next Phase Readiness

**Para el plan 05-12, que es el que crea `/instalar` y hoy devuelve 404:**

- `PruebaDeAviso` recibe cuatro props del servidor: `endpoint`, `token` (de `searchParams.prueba`), `gradoPrevio` e `intentosPrevios`. Los dos últimos salen de la suscripción vigente, leída con el JWT del usuario.
- `alConfirmar(grado)` es lo que decide la pantalla de cierre: con `'manual'` hay que añadir encima la nota de §8.6 en `text-micro-movil` `--status-warn`. Con `'toque'`, no.
- La página **no** debe tratar un `?prueba={token}` desconocido como error: el token es de un solo uso y el navegador puede reabrir la URL.

**Lo que no es obvio y conviene saber:**

- La action **no** devuelve el número de intento. El contador se alimenta de `intentosPrevios` más los envíos exitosos de la sesión; el corte duro es `topeAgotado`.
- `suscripcionMuerta: true` significa que hay que mandar al aseador a reconectar (el camino del banner S4), no a reintentar el envío.
- El aviso de prueba tiene TTL de dos minutos. Si alguien prueba el flujo con el teléfono apagado más de eso, el aviso no aparecerá nunca aunque el envío haya salido en 201. Es correcto, pero sorprende la primera vez.

## Threat Flags

Ninguna. Las cinco amenazas del `<threat_model>` del plan tienen mitigación con test:

| Threat ID | Mitigación | Dónde se verifica |
|---|---|---|
| T-05-08 | El tope lo cuenta el RPC con `for update` antes de enviar | test de `invocationCallOrder`, señuelo corrido |
| T-05-14 | El RPC exige `user_id = auth.uid()` en el mismo select del token | `07_push.test.sql` (plan 05-02); aquí, el token se valida como uuid antes de salir |
| T-05-36 | El grado a mano deja al aseador en `Sin probar`, el RPC no degrada un toque, y el componente lo reporta hacia arriba | test de `confirmarPruebaAMano`; `alConfirmar(grado)` |
| T-05-39 | `exigirSesion()` como primera operación de las tres | test `it.each` de tres casos, señuelo corrido |
| T-05-04 | El cuerpo de la respuesta entra a `decidir()` y sale un código de unión cerrada | test `un fallo transitorio (500) NO revoca nada y no filtra el cuerpo de la respuesta` |

---
*Phase: 05-notificaciones-push-e-instalaci-n-de-la-pwa*
*Completed: 2026-09-11*

## Verificación de la línea base

| Puerta | Antes (ola 6) | Ahora |
|---|---|---|
| `test:unit` | 46 archivos / 829 tests | **47 archivos / 852 tests**, PASS |
| `test:integration` | 18 archivos / 163 tests | 18 archivos / 163 tests, PASS |
| `npx tsc --noEmit` | 0 | 0 |
| `npm run lint` | 0 errores, 2 avisos | 0 errores, 2 avisos (los mismos dos, preexistentes) |
| `npm run ci:arch` | 0, 3 scripts | 0, 3 scripts |
| `npm run build` | 0, 14 rutas | 0, 14 rutas |

## Self-Check: PASSED

- `app/(cleaner)/instalar/_actions.ts` — existe
- `app/(cleaner)/instalar/_actions.test.ts` — existe
- `app/(cleaner)/_components/PruebaDeAviso.tsx` — existe
- `lib/push/origen.ts` — existe
- Commits `42ce817`, `f13aa70`, `92251b2` — presentes en el historial
- `.planning/STATE.md` y `.planning/ROADMAP.md` — sin modificar, como exige el orquestador

## TDD Gate Compliance

Secuencia completa en el historial: `test(05-11)` (`42ce817`, 23 aserciones en rojo por módulo ausente) → `feat(05-11)` (`f13aa70`, 23 en verde). Sin fase REFACTOR: no hizo falta.
