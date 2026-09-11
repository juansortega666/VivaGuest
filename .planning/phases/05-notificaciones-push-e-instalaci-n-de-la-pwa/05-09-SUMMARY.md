---
phase: 05-notificaciones-push-e-instalaci-n-de-la-pwa
plan: 09
subsystem: frontend
tags: [tokens, tailwind-v4, discriminante-tipado, feature-detect, push, pwa, ios, hooks, tdd]
status: complete

requires:
  - phase: 05-08
    provides: "El shell de la PWA: `app/manifest.ts`, `app/sw.ts`, los iconos y el service worker que estos tokens visten y que el hook consulta con `navigator.serviceWorker.ready`"
  - phase: 02
    provides: "`app/globals.css` con la escala de espaciado por tallas de §2 y la capa de tokens de §4.3; `lib/utils.ts` con el grupo `max-w` de `extendTailwindMerge`"
  - phase: 04
    provides: "El patron de discriminante tipado de `estadoDeAseo()` en `lib/domain/cleanings.ts`, la regla de pureza de `lib/domain/alertas.ts` y la escala de `tiempoRelativo()`"
  - phase: 05-06
    provides: "La migracion 16, que crea `estado_avisos_aseadores()` y el grado de verificacion en `push_subscriptions`"
provides:
  - "Los seis tokens de espaciado, ancho y tracking de 05-UI-SPEC §2.1, y los cuatro roles tipograficos moviles de §3.1"
  - "`max-w-captura` y `max-w-codigo` registrados en el grupo `max-w` de `cn()`, verificado sobre el CSS del build de produccion"
  - "`estadoDeAvisos()`: los seis estados del aseador como discriminante tipado, puro, sin leer el navegador"
  - "`estadoDeAvisosDeAseador()`: los tres estados del admin mas el caso sin estado, con `Activos` condicionado a verificacion por toque"
  - "`tituloDeEstadoDeAvisos()`: el texto del `title` de la celda de §5.2"
  - "`formatFechaLargaBog()`: la forma de fecha sin dia de la semana que ese `title` necesita"
  - "`lib/push/plataforma.ts`: instalada, soporte declarativo, navegador embebido, plataforma visible y la conversion de la clave VAPID, todo por feature detect salvo dos excepciones declaradas"
  - "`hooks/usarEstadoDeAvisos.ts`, que estrena el directorio `hooks/`: recalculo en `visibilitychange`, reparacion silenciosa antes de reportar `roto`, y cero llamadas al permiso"
affects: [05-10, 05-11, 05-12, 06]

tech-stack:
  added: []
  patterns:
    - "La presentacion como UNION DISCRIMINADA por `banner` en vez de campos opcionales: 'S5 no renderiza banner' queda impuesto por el tipo, no por una convencion que un componente pueda ignorar"
    - "La mitad pura y la mitad impura del mismo hecho, en dos archivos y dos directorios: `lib/domain/` decide con booleanos que le entran por parametro, `lib/push/` va a buscarlos al navegador"
    - "Cada funcion de deteccion recibe el objeto global por parametro con valor por defecto: probable con objetos planos sin jsdom, y sin reventar al importarse en el servidor"
    - "Señuelo corrido en los DOS sentidos y anotado, tres veces: un septimo estado, un cuarto estado y un cuarto valor de permiso, cada uno con su codigo de error de `tsc`"
    - "Un test que afirma sobre tokens prohibidos filtra primero las lineas de comentario, misma distincion que `check-max-w-tallas.sh`: nombrar en prosa es legitimo, usar es el fallo"

key-files:
  created:
    - lib/domain/avisos.ts
    - lib/domain/avisos.test.ts
    - lib/push/plataforma.ts
    - lib/push/plataforma.test.ts
    - hooks/usarEstadoDeAvisos.ts
  modified:
    - app/globals.css
    - lib/utils.ts
    - lib/domain/dates.ts
    - lib/domain/dates.test.ts

key-decisions:
  - "La presentacion del banner es una union discriminada por `banner`, asi que la rama `activo` no tiene ni icono ni titulo que pintar. Es la unica forma de que 'S5 no renderiza banner' lo imponga `tsc` y no la disciplina de quien escriba el componente"
  - "`no_soportado` es el unico estado cuyo titulo NO esta escrito como titulo en el contrato: §7.6 da tres cuerpos por sub-caso y ninguno es un titulo. Se usa la primera oracion del cuerpo generico y el cuerpo concreto lo elige el componente con `esNavegadorEmbebido()`"
  - "Con la reparacion silenciosa todavia pendiente, `estadoDeAvisos()` devuelve `activo` y no `roto`: el unico caso sin banner es `activo`, y §5.1 exige que S4 no se muestre de entrada. La rama esta comentada como la ventana de 'todavia no se', y el hook awaita la reparacion antes de componer la entrada, asi que en el camino real no se alcanza"
  - "El caso del aseador inactivo (`sin_estado`) vive FUERA del mapa de presentacion, como rama propia de la union. Asi el mapa tiene exactamente tres entradas y un componente no puede leerle un icono ni una etiqueta que no existen"
  - "`soportaDeclarativo()` mira `pushManager` en la VENTANA y no en el registro del service worker, con la cadena de razonamiento de D-07 escrita entera y un test con ese nombre: el del registro existe en Chrome y marcaria a Chrome como compatible"
  - "El export del hook se llama `useEstadoDeAvisos` aunque el archivo se llame `usarEstadoDeAvisos.ts`: `react-hooks/rules-of-hooks` reconoce un hook por el prefijo `use`, y con el nombre en espanol ninguna regla de hooks del ecosistema mira el archivo"
  - "`base64UrlAUint8()` reserva el buffer y lo llena en vez del `Uint8Array.from()` del research: desde TypeScript 5.7 `from()` devuelve `Uint8Array<ArrayBufferLike>`, que la ranura `applicationServerKey` no acepta. Medido con `tsc`"
  - "Se anadio `formatFechaLargaBog()` a `lib/domain/dates.ts` en vez de interpolar `formatFechaBog()`: aquel produce `mar, 8 de septiembre`, que detras de `el` es agramatical. Es el mecanismo que la propia cabecera de ese archivo prescribe para una forma nueva"

requirements-completed: [PWA-03]

coverage:
  - id: D1
    description: "Los dos anchos nuevos no pueden compilar a ocho pixeles: llevan nombre propio verificado contra la escala de espaciado entera y estan registrados en el grupo `max-w` de `cn()`"
    requirement: PWA-03
    verification:
      - kind: other
        ref: "Sobre el CSS del build de produccion, con `CSS=(.next/static/css/*.css)`: `max-w-captura{max-width:var(--container-captura)}` y `max-w-codigo{max-width:var(--container-codigo)}`"
        status: pass
      - kind: other
        ref: "`grep -c 'max-w-captura{max-width:var(--spacing' \"${CSS[@]}\"` -> 0 en los dos archivos de CSS emitidos"
        status: pass
      - kind: other
        ref: "npm run ci:arch -> check-max-w-tallas: OK"
        status: pass
    human_judgment: false
  - id: D2
    description: "Hay UNA sola funcion que decide en que estado de avisos esta el aseador, con los seis casos como discriminante tipado sin rama por defecto"
    requirement: PWA-03
    verification:
      - kind: unit
        ref: "lib/domain/avisos.test.ts#el mapa de presentacion tiene EXACTAMENTE seis claves"
        status: pass
      - kind: other
        ref: "Señuelo corrido: septimo estado en la union -> TS2741 en el `Record` del mapa; cuarto valor de `permiso` -> TS2366 en el switch sin default. Restaurado, `tsc` en 0"
        status: pass
      - kind: other
        ref: "`grep -c 'default:' lib/domain/avisos.ts` -> 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "Estar en una pestana de Safari sin instalar se distingue de no poder recibir avisos"
    requirement: PWA-03
    verification:
      - kind: unit
        ref: "lib/domain/avisos.test.ts#S1 y S0 NO se confunden: misma ausencia de Notification, distinto `instalada`"
        status: pass
    human_judgment: false
  - id: D4
    description: "S4 no se muestra de entrada: el banner de avisos rotos sale solo si la reparacion silenciosa ya fallo"
    requirement: PWA-03
    verification:
      - kind: unit
        ref: "lib/domain/avisos.test.ts#S4 NO aparece de entrada: con la reparacion todavia pendiente el estado no es roto"
        status: pass
      - kind: other
        ref: "`hooks/usarEstadoDeAvisos.ts`: `repararEnSilencio()` devuelve un booleano y solo su `false` produce `reparacionFallida: true`"
        status: pass
    human_judgment: true
    rationale: "Que la reparacion silenciosa FUNCIONE contra un service worker de verdad no lo prueba ningun test de esta entrega: el hook no tiene tests todavia. Se verifica en el procedimiento manual M4 sobre un iPhone fisico"
  - id: D5
    description: "La deteccion de plataforma es por feature detect, con la cadena de user agent declarada como la unica excepcion y acotada a elegir instrucciones"
    requirement: PWA-03
    verification:
      - kind: unit
        ref: "lib/push/plataforma.test.ts#NO mira el del registro del service worker: son cosas distintas"
        status: pass
      - kind: unit
        ref: "lib/push/plataforma.test.ts#estaInstalada (3 casos) y #esNavegadorEmbebido (4 casos, con cadenas reales de WhatsApp, Instagram y Facebook)"
        status: pass
      - kind: other
        ref: "`grep -n userAgent lib/push/plataforma.ts` -> 3 lineas: la declaracion del tipo y las dos lecturas, ambas dentro de `esNavegadorEmbebido` y `plataformaVisible`"
        status: pass
    human_judgment: false
  - id: D6
    description: "El estado se recalcula al volver a primer plano, no solo al montar, y el listener se retira al desmontar"
    requirement: PWA-03
    verification:
      - kind: other
        ref: "`grep -c visibilitychange hooks/usarEstadoDeAvisos.ts` -> 2: el `addEventListener` y el `removeEventListener` de la limpieza"
        status: pass
    human_judgment: true
    rationale: "Que el efecto se re-dispare de verdad al volver de Ajustes no lo afirma ningun test: el hook no tiene tests. Es el procedimiento manual M4 y, mas adelante, el E2E de Chromium"
  - id: D7
    description: "Nada de esta fase puede quemar el permiso al montar"
    requirement: PWA-03
    verification:
      - kind: other
        ref: "`grep -vE '^\\s*(//|/\\*|\\*)' hooks/usarEstadoDeAvisos.ts | grep -c requestPermission` -> 0"
        status: pass
    human_judgment: false
  - id: D8
    description: "Una verificacion confirmada a mano no cuenta como `Activos` en la vista del admin"
    requirement: PWA-03
    verification:
      - kind: unit
        ref: "lib/domain/avisos.test.ts#una verificacion A MANO no cuenta como Activos: se queda en Sin probar"
        status: pass
    human_judgment: false

duration: 27 min
completed: 2026-09-11
---

# Fase 5 Plan 09: Tokens de la fase y la logica de estado de los avisos, Summary

Los seis estados del aseador y los tres del admin como discriminantes tipados en un modulo puro que
nunca lee `window`, su mitad impura en `lib/push/plataforma.ts`, el hook que las junta estrenando
`hooks/`, y los tokens de §2.1 y §3.1 con los dos anchos nuevos registrados en `cn()` y verificados
contra el CSS del build.

## Performance

- **Duracion:** 27 min
- **Tareas:** 3 de 3
- **Archivos:** 5 creados, 4 modificados
- **Commits:** 7

## Accomplishments

### Task 1 — Los tokens y el registro en `cn()`

Los seis tokens de §2.1 (`--spacing-toque-comodo`, `--spacing-paso`, `--spacing-col-avisos`, los dos
anchos de contenedor y `--tracking-codigo`) y los cuatro roles tipograficos moviles de §3.1, cada
grupo con su razon al lado: los 56px porque el aseador toca `Activar los avisos` una sola vez en su
vida, y la escala movil entera porque **iOS Safari hace zoom automatico al enfocar un campo con
`font-size` menor a 16px**, que es comportamiento del motor y no una preferencia.

La comprobacion de colision quedo **escrita en el comentario**, nombre por nombre contra la escala de
espaciado completa. Es exactamente lo que falto las dos veces que este defecto costo un quick.

`max-w-captura` y `max-w-codigo` entraron al grupo `max-w` de `extendTailwindMerge` en `lib/utils.ts`.
Verificado sobre el CSS del build con array de globs:

```
max-w-captura{max-width:var(--container-captura)}
max-w-codigo{max-width:var(--container-codigo)}
```

y cero apariciones resolviendo contra `--spacing-*`.

### Task 2 — `lib/domain/avisos.ts`

`estadoDeAvisos()` con los seis casos de §5.1 y `estadoDeAvisosDeAseador()` con los tres de §5.2 mas
el caso sin estado. Las dos puras, las dos con el patron de `estadoDeAseo()`, ninguna con rama por
defecto.

Tres decisiones que no eran obvias al empezar:

1. **La presentacion es una union discriminada por `banner`.** En la rama `activo` no hay icono ni
   titulo *que pintar*, asi que "S5 no renderiza banner" lo impone el compilador. Con campos
   opcionales habria sido una convencion, y las convenciones se rompen en el segundo componente.
2. **`sin_estado` vive fuera del mapa de presentacion.** Un aseador inactivo pinta una raya (§15.1);
   dejarlo dentro del mapa le habria dado un icono y una etiqueta que el contrato dice que no tiene.
3. **El orden de evaluacion es parte de la regla.** S1 se mira antes que S0, por lo mismo que
   `estadoDeAseo()` mira `is_managed` antes que `state`: los dos se ven igual desde el codigo y lo
   unico que los separa es si la app esta instalada.

28 tests. Tres señuelos corridos y restaurados, con su codigo de error anotado:

| Señuelo | Resultado |
|---|---|
| Septimo estado en la union del cliente | `TS2741` en el `Record` del mapa de presentacion |
| Cuarto estado en la union del admin | `TS2741` en el `Record` del mapa de presentacion |
| Cuarto valor de `Notification.permission` | `TS2366`, el switch sin `default` se queda sin `return` |

### Task 3 — `lib/push/plataforma.ts` y el hook

Cinco funciones, cada una con el objeto global por parametro con valor por defecto. La cadena de
razonamiento de D-07 quedo escrita entera con su referencia a MDN BCD, porque es una decision de
discrecion y dentro de un mes se leeria como magia: `Window.pushManager` existe en Safari 18.4+ y no
en Chrome, asi que su presencia **en el ambito de pagina** es el feature detect del formato
declarativo, y no hay que confundirlo con `ServiceWorkerRegistration.pushManager`, que existe en
todas partes. Hay un test con ese nombre exacto.

17 tests, con dobles planos de `window` en vez de jsdom para que cada caso diga que simula.

`hooks/usarEstadoDeAvisos.ts` estrena el directorio: recalcula en `visibilitychange`, repara en
silencio con la **baja antes que el alta** (resuscribir con otra `applicationServerKey` lanza
`InvalidStateError` en Chromium), devuelve `null` mientras no sabe, retira su listener al desmontar,
y **no pide el permiso en ningun sitio**.

## Deviations from Plan

### 1. [Rule 3 - Blocker] El export del hook se llama `useEstadoDeAvisos`

- **Encontrado en:** Task 3, al correr `npm run lint`.
- **Problema:** `react-hooks/rules-of-hooks` da dos errores (`useState` y `useEffect` llamados en una
  funcion que no es componente ni hook) porque reconoce un hook **por el prefijo `use` y nada mas**.
  Peor que los dos errores: con el nombre en espanol, todas las reglas de hooks del ecosistema (las
  dependencias del efecto, el orden de llamada, el compilador de React) dejan de mirar el archivo en
  silencio.
- **Arreglo:** el export pasa a `useEstadoDeAvisos`. **El nombre del archivo queda como lo fija el
  plan** (`hooks/usarEstadoDeAvisos.ts`), que es lo que las rutas del contrato nombran. La razon esta
  escrita en la cabecera de la funcion.
- **Commit:** `3cce589`

### 2. [Rule 2 - Faltaba funcionalidad] `formatFechaLargaBog()` en `lib/domain/dates.ts`

- **Encontrado en:** Task 2, al componer el `title` de §5.2.
- **Problema:** el contrato dice literal `Activos desde el {fecha}.` y `formatFechaBog()` produce
  `"mar, 8 de septiembre"`. Detras de "el", eso es agramatical.
- **Arreglo:** un formateador aparte, sin dia de la semana, que es **el mecanismo que la propia
  cabecera de `dates.ts` prescribe** ("si algun dia hace falta el ano, se anade un formateador
  aparte, no un parametro a este"). Mismo ancla de UTC, tres tests nuevos. `lib/domain/dates.ts` no
  estaba en `files_modified` del plan.
- **Commit:** `ced8ed5`

### 3. [Rule 1 - Bug] `Uint8Array.from()` no compila contra `applicationServerKey`

- **Encontrado en:** Task 3, `tsc` en rojo con `TS2769`.
- **Problema:** el snippet del research usa `Uint8Array.from()`, que desde TypeScript 5.7 devuelve
  `Uint8Array<ArrayBufferLike>`. La ranura `applicationServerKey` de `subscribe()` pide
  `ArrayBufferView<ArrayBuffer>`, y un `SharedArrayBuffer` no lo es.
- **Arreglo:** reservar el buffer con el constructor de longitud y llenarlo, que si devuelve el tipo
  estrecho, con la razon escrita al lado.
- **Commit:** `3cce589`

### 4. [Rule 1 - Bug] El test de pureza se atrapaba a si mismo

- **Encontrado en:** Task 2, antes de correr el verde.
- **Problema:** el test afirma que `avisos.ts` no nombra los globales del navegador, y la cabecera del
  modulo **explica** que no los lee, para lo cual tiene que nombrarlos. La unica linea que documenta
  la regla era la que la rompia. Es el tercer tropiezo del repo con un guardarrail que funciona por
  regex y no por gramatica.
- **Arreglo:** el test filtra las lineas de comentario antes de buscar, misma tecnica que el
  `COMENTARIO_RE` de `scripts/ci/check-max-w-tallas.sh`, y construye los nombres por concatenacion
  para no ser el proximo señuelo de nadie.
- **Commit:** `6ec4bb3`

### 5. [Rule 1 - Bug] `TODO` del espanol en una cabecera

- **Encontrado en:** el self-check final.
- **Problema:** `"TODO entra por aqui"` es espanol, pero indistinguible del marcador ingles de trabajo
  pendiente para cualquier escaner de stubs.
- **Arreglo:** reformulado. **Commit:** `168d4e3`

**Total: 5 desviaciones auto-resueltas** (2 bugs de compilacion/tests, 1 bloqueante de lint, 1
funcionalidad faltante, 1 defecto de guardarrail). **Impacto:** ninguna cambia el alcance del plan.

## Divergencias de contrato anotadas, NO arregladas

Dos, y las dos deliberadas:

1. **`grep -c "BellRing" lib/domain/avisos.ts` devuelve 2, no 1.** El criterio del plan esperaba 1. El
   nombre aparece una vez en la union de literales que implementa la "lista cerrada" de §17.5 y una
   vez en el mapa de presentacion: es exactamente el patron de `estadoDeAseo()` que el mismo plan
   manda seguir. Bajar a 1 exigiria renunciar a la union tipada, que es lo que hace que un nombre de
   icono inexistente rompa `tsc` en vez del navegador. **Se verifico la otra mitad del criterio**:
   todos los literales con forma de nombre de icono del archivo (`Bell`, `BellRing`, `BellOff`,
   `Smartphone`, `CircleAlert`, `TriangleAlert`) estan en la lista cerrada de §17.5.
2. **El `title` de §5.2 ilustra la segunda frase con `hace 3 días`, y `tiempoRelativo()` no tiene ese
   escalon** (salta de `hace 3 h` a `ayer 14:20` y de ahi a `1 sep 14:20`). Esa escala la fijo
   `04-UI-SPEC` §13 y cambiarla seria una modificacion de aquel contrato, no de este archivo. Queda
   anotado en la cabecera de `tituloDeEstadoDeAvisos()` y aqui.

## Verificacion de §17.5, que el contrato dejaba pendiente

El UI-SPEC dejaba escrito que los siete nombres de icono nuevos **no se pudieron comprobar contra el
paquete** porque no habia `node_modules/`, y marcaba `KeyRound` como el de mayor riesgo. Comprobados
contra `lucide-react@1.39.0` instalado:

```
Bell object · BellRing object · BellOff object · Smartphone object
CircleAlert object · KeyRound object · Send object
```

**Los siete existen, `KeyRound` incluido.** No hace falta la alternativa `Key`.

## Estado de la verificacion

| Puerta | Antes (05-07) | Ahora |
|---|---|---|
| `test:unit` | 39 archivos / 699 tests | **41 archivos / 747 tests** |
| `test:integration` | 17 archivos / 153 tests | 17 archivos / 153 tests |
| `npx tsc --noEmit` | 0 | **0** |
| `npm run lint` | 0 errores, 2 warnings preexistentes | **0 errores, los mismos 2 warnings** |
| `npm run ci:arch` | limpio | **limpio** |
| `npm run build` | verde, 13 rutas | **verde, 13 rutas** |

Los 48 tests nuevos son 28 de `avisos`, 17 de `plataforma` y 3 de `dates`.

## Issues Encountered

Ninguno abierto. Las cinco desviaciones estan cerradas y commiteadas.

## Deuda declarada

**`hooks/usarEstadoDeAvisos.ts` no tiene tests.** No estaba en el `<behavior>` del plan, que solo pide
tests para `plataforma.ts`, y probarlo de verdad exige dobles de `ServiceWorkerRegistration`,
`PushSubscription` y `document.visibilityState` mas un entorno de jsdom que el `vitest.config.ts` de
`test:unit` no monta (`environment: 'node'`). Lo que hoy lo respalda son criterios de aceptacion por
grep y por numero de linea, mas los procedimientos manuales M1 y M4 del research. **Las dos mitades
que si se pueden probar sin navegador —la derivacion y la deteccion— estan cubiertas con 45 tests.**

Dos consecuencias para quien siga: `vitest.config.ts` incluye `lib/**` y `app/**`, asi que **un test
bajo `hooks/` hoy no correria**; y el directorio `hooks/` tendria que anadirse a ese `include`.

## Next Phase Readiness

El plan 05-10 tiene lo que necesita: el discriminante que el banner consume, el hook que se lo da, y
la ranura `registrar` por la que le entra su Server Action. Le quedan a el las dos cosas que este
plan deliberadamente no hizo: llamar `Notification.requestPermission()` dentro de un `onClick`, y
escribir los cuerpos de los cinco banners de §7.2 a §7.6.

## Self-Check: PASSED

- Los 9 archivos declarados existen en disco.
- Los 7 commits existen en el historial (`90a5cad`, `d509b57`, `ced8ed5`, `abd3fb5`, `3cce589`,
  `6ec4bb3`, `168d4e3`).
- Los criterios de aceptacion de las tres tareas se corrieron uno por uno y salieron en verde, con la
  unica divergencia de conteo anotada arriba.
- La verificacion del CSS se hizo con array de globs, nunca con sustitucion de comando.
- Sin stubs: cero `TODO`, `FIXME` o `placeholder` en los tres modulos nuevos.
