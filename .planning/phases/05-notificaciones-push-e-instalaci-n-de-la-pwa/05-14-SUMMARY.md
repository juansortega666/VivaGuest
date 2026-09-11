---
phase: 05-notificaciones-push-e-instalaci-n-de-la-pwa
plan: 14
subsystem: ui
tags: [push, rls, rpc, tabla, tooltip, tailwind-v4, portapapeles, seguridad, tdd]
status: complete

requires:
  - phase: 05-02
    provides: "La migracion 16 con `estado_avisos_aseadores()`, su `returns table` sin ranura para credenciales y la ausencia deliberada de policy de admin sobre la tabla de suscripciones"
  - phase: 05-09
    provides: "`estadoDeAvisosDeAseador()`, `tituloDeEstadoDeAvisos()`, el tipo `EntradaEstadoAvisosAseador` y el token `--spacing-col-avisos`"
  - phase: 04
    provides: "El lenguaje del dashboard del admin: `EstadoAseo` como componente que solo pinta, `LeyendaDeAseos` derivada del dominio, y el patron de bajar el reloj desde el RSC (`leidoEnMs`)"
  - phase: 02
    provides: "`/aseadores`, `TablaAseadores`, `MenuAseador` y los tokens de ancho por columna"
provides:
  - "`lib/data/avisos.ts` con `leerEstadoDeAvisosPorAseador()`: la UNICA lectura del agregado de avisos del repo, compartida por `/aseadores` y (plan 05-15) `/operacion`"
  - "`AseadorConAsignaciones.estadoDeAvisos`: el estado crudo por aseador, en el mismo viaje que el catalogo"
  - "`app/(admin)/_components/EstadoAvisosAseador.tsx`: el chip de los tres estados y `LeyendaDeAvisos`"
  - "La columna `AVISOS` de `/aseadores`, entre `TELEFONO` y `RESPONSABLE DE`, medida a 1280px"
  - "El item `Copiar el link de instalación` en `MenuAseador`, con el separador de §7.3 que el plan 02-07 dejo pendiente"
affects: [05-15, 05-16, 06]

tech-stack:
  added: []
  patterns:
    - "Una sola lectura por agregado, en modulo propio, cuando dos pantallas la van a consumir: `lib/data/avisos.ts` existe para que la forma del dato tenga un solo sitio donde cambiar"
    - "El objeto que sale de la capa de datos se compone CAMPO A CAMPO y nunca con un spread de la fila: una columna nueva en la base se queda fuera en vez de propagarse sola hasta el navegador"
    - "El nombre del RPC vive en una constante exportada (`RPC_ESTADO_AVISOS`): el test afirma contra que se llamo sin escribir el nombre otra vez, y `lib/data/` conserva una sola ocurrencia literal"
    - "El doble de cliente registra CONTRA QUE se llamo, no solo que devolvio: sin ese registro, N viajes y uno solo dan el mismo resultado y el test de N+1 seria un falso verde"
    - "El reloj baja desde el RSC tambien en `/aseadores`, no solo en `/operacion`: un relativo por fila daria una marca distinta en servidor y cliente"

key-files:
  created:
    - lib/data/avisos.ts
    - lib/data/avisos.test.ts
    - app/(admin)/_components/EstadoAvisosAseador.tsx
  modified:
    - lib/data/aseadores.ts
    - lib/data/aseadores.test.ts
    - app/(admin)/aseadores/_components/TablaAseadores.tsx
    - app/(admin)/aseadores/_components/MenuAseador.tsx
    - app/(admin)/aseadores/page.tsx

key-decisions:
  - "El admin sigue SIN `select` sobre la tabla de suscripciones y no se le anadio ninguna policy: todo entra por la funcion agregada de la migracion 16, que comprueba el rol por dentro y no tiene ranura para el identificador de destino ni para las dos claves de cifrado (T-05-07)"
  - "`lib/data/avisos.ts` es modulo propio y no una funcion mas de `./aseadores.ts`, porque el plan 05-15 lo va a consumir desde `/operacion`: dos copias de la llamada serian dos sitios donde cambiar la forma del dato"
  - "La lectura pasa de dos a TRES viajes y no a N: el agregado se llama una vez para los ocho aseadores, con el mismo razonamiento que ya justificaba traer las dos tablas enteras"
  - "El aseador que no sale del agregado se resuelve como CERO suscripciones vivas y no como dato ausente: ese cero ES el estado `Sin avisos`, que es el que D-03 existe para hacer visible"
  - "`EstadoAvisosAseador` no tiene un solo `if` sobre conteos: las dos condiciones del archivo son la rama `sin_estado` de la union (aseador de baja) y la guarda de `title` ausente. La derivacion sigue entera en `lib/domain/avisos.ts`, que es lo que impide que `Sin probar` se pinte como `Activos`"
  - "Cero rojo en la columna, con la razon escrita en la cabecera del componente: un aseador sin avisos no tiene un problema, lo tiene su telefono. `Sin probar` va en `idle` y no en `warn` por la misma regla"
  - "El dominio del link sale de `window.location.origin` y no de una variable de entorno nueva: es la misma app y una variable mas es una variable mas que se desactualiza entre local, preview y produccion"
  - "El toast remite al canal que el admin YA usa con esa persona en vez de ofrecer un boton de enviar: el producto no tiene canal de mensajeria, y prometer el envio seria una accion que miente"
  - "Se puso el separador de §7.3 que el plan 02-07 dejo pendiente con su condicion escrita (`cuando exista algo de lo que separarlo`): el item nuevo es ese algo"

patterns-established:
  - "Test de frontera sobre CLAVES y no sobre contenido: se enumera `Object.keys()` del objeto devuelto y se afirma que ninguna es una de las tres columnas de credencial. Un test que buscara el valor pasaria el dia que la credencial llegara con otro texto"
  - "Senuelo corrido y anotado: meter la llamada al agregado dentro del bucle de aseadores pone rojo exactamente un test (el del conteo de viajes) y ninguno mas"
  - "La leyenda de una tabla se deriva de la MISMA funcion de dominio que las filas, llamandola con entradas minimas: una leyenda que dijera una etiqueta distinta a la de la fila es peor que no tener leyenda"

requirements-completed: [NOTIF-02, NOTIF-04]

coverage:
  - id: D1
    description: "`leerEstadoDeAvisosPorAseador()`: la unica lectura del agregado, en un solo viaje, sin devolver ninguna credencial de envio"
    requirement: NOTIF-04
    verification:
      - kind: unit
        ref: "lib/data/avisos.test.ts#va UNA sola vez a la base con ocho aseadores sembrados, no ocho"
        status: pass
      - kind: unit
        ref: "lib/data/avisos.test.ts#NO deja pasar ninguna credencial de envío, ni aunque la base la trajera"
        status: pass
      - kind: other
        ref: "grep -rho estado_avisos_aseadores lib/data/ | wc -l == 1, y esta en lib/data/avisos.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "El estado de avisos dentro de `listarAseadoresConAsignaciones()`: tres viajes y no N, estado crudo y no etiqueta, ausencia resuelta como cero"
    requirement: NOTIF-04
    verification:
      - kind: unit
        ref: "lib/data/aseadores.test.ts#hace TRES viajes a la base con ocho aseadores, no uno por aseador"
        status: pass
      - kind: unit
        ref: "lib/data/aseadores.test.ts#un aseador que NO sale del agregado queda con cero suscripciones, no sin dato"
        status: pass
      - kind: unit
        ref: "lib/data/aseadores.test.ts#ninguna clave del estado de avisos es una credencial de envío"
        status: pass
    human_judgment: false
  - id: D3
    description: "La columna `AVISOS` entre `TELÉFONO` y `RESPONSABLE DE`, con su token de ancho propio y sin scroll horizontal nuevo a 1280px"
    requirement: NOTIF-02
    verification:
      - kind: other
        ref: "grep -c w-col-avisos TablaAseadores.tsx == 2; orden por numero de linea 130 < 141 < 144"
        status: pass
      - kind: e2e
        ref: "playwright 1280x900 sobre `next build && next start`: scrollport de la tabla 1230/1230, documento 1280/1280"
        status: pass
      - kind: other
        ref: "npm run build && npm run ci:arch && npx tsc --noEmit"
        status: pass
    human_judgment: false
  - id: D4
    description: "El chip pinta los tres estados (`Activos` / `Sin probar` / `Sin avisos`) con icono + etiqueta + color, sin derivar nada y sin rojo, y la fila no cambia de alto ni de peso"
    requirement: NOTIF-02
    verification:
      - kind: other
        ref: "grep -cE 'destructive|status-destructive' EstadoAvisosAseador.tsx == 0; grep -c h-fila TablaAseadores.tsx sin cambio (2)"
        status: pass
      - kind: unit
        ref: "lib/domain/avisos.test.ts (plan 05-09): los tres estados y el título, ya en verde"
        status: pass
    human_judgment: true
    rationale: "Que las tres siluetas de campana se distingan en escala de grises, que el ámbar no se lea como alarma sobre la persona y que la leyenda aclare de verdad la diferencia entre `Activos` y `Sin probar` son juicios visuales. Ningún test los afirma; hay que abrir la pantalla con datos sembrados en los tres estados"
  - id: D5
    description: "`Copiar el link de instalación` en el menú del aseador, con el copy que no promete un canal que el producto no tiene, y oculto para quien está de baja"
    requirement: NOTIF-02
    verification:
      - kind: other
        ref: "grep -c 'Copiar el link de instalación' == 1; 'por donde ya te hablas' == 1; 'process.env' == 0; cero literales con signo de admiración, `Ups` o `Algo salió mal`"
        status: pass
    human_judgment: true
    rationale: "La escritura real al portapapeles y el toast solo se ven en un navegador con contexto seguro. No hay e2e para este ítem en este plan: `e2e/aseadores-alta.spec.ts` ya concede permisos de portapapeles y es donde encajaría, pero añadirlo no estaba en el alcance"

duration: 21min
completed: 2026-09-11
---

# Fase 5 Plan 14: la columna `AVISOS` de `/aseadores` y el link de instalación

**El admin ve en `/aseadores` quién quedó mudo —`Activos`, `Sin probar` o `Sin avisos`— leyendo un agregado por función `security definer` en el mismo viaje que el catálogo, sin que su navegador reciba una sola credencial de envío.**

## Performance

- **Duration:** 21 min
- **Started:** 2026-09-11T23:21:00Z
- **Completed:** 2026-09-11T23:42:22Z
- **Tasks:** 3 de 3
- **Files modified:** 8 (3 creados, 5 modificados)

## Accomplishments

- **`lib/data/avisos.ts`: la única lectura del agregado de todo el repo.** Llama la función de la migración 16 una sola vez y devuelve un `Map` indexado por aseador. El admin no tiene `select` sobre la tabla de suscripciones y sigue sin tenerlo: el identificador de destino es una credencial portadora y no hace falta ninguna para cumplir D-03 (T-05-07).
- **La lectura de aseadores pasó de dos viajes a tres, no a N.** El agregado se pide una vez para los ocho. Hay un test que lo afirma con el registro de llamadas, y el señuelo (la llamada dentro del bucle) pone rojo ese test y solo ese.
- **La columna `AVISOS` entre `TELÉFONO` y `RESPONSABLE DE`**, con `w-col-avisos` (128px, verificado en el CSS emitido). Medido sobre el build de producción a 1280px: el scrollport de la tabla mide 1230/1230 y el documento 1280/1280, o sea **cero scroll horizontal nuevo**. La cuenta de §2.3 queda confirmada como hecho.
- **`EstadoAvisosAseador` no deriva nada.** Traduce el nombre de icono a componente de lucide y punto. Las dos únicas condiciones del archivo son la rama `sin_estado` de la unión y la guarda de `title` ausente: no hay un solo `if` sobre conteos, que es lo que impide que `Sin probar` acabe pintado como `Activos` (T-05-50).
- **Cero rojo en la columna, con la razón escrita en el archivo.** Un aseador sin avisos no tiene un problema, lo tiene su teléfono.
- **`Copiar el link de instalación`** compone el dominio desde el origen del navegador y el toast remite al canal que el admin ya usa con esa persona. El ítem no aparece para quien está de baja.

## Task Commits

1. **Task 1 (RED): compuerta del agregado y su cruce** — `b91d8c9` (test)
2. **Task 1 (GREEN): `lib/data/avisos.ts` y el estado dentro de la lectura de aseadores** — `f1080af` (feat)
3. **Task 2: `EstadoAvisosAseador` y la columna `AVISOS`** — `48e4506` (feat)
4. **Task 3: `Copiar el link de instalación` en `MenuAseador`** — `ad8b28c` (feat)

## Files Created/Modified

- `lib/data/avisos.ts` — **creado.** `leerEstadoDeAvisosPorAseador()`, la constante `RPC_ESTADO_AVISOS` y `SIN_AVISOS_REGISTRADOS`. La cabecera explica por qué se llega por RPC y no por un `select`.
- `lib/data/avisos.test.ts` — **creado.** Seis tests: indexado, una sola llamada con ocho sembrados, cero credenciales en las claves devueltas, mapa vacío, propagación del error y forma de la constante de ausencia.
- `app/(admin)/_components/EstadoAvisosAseador.tsx` — **creado.** El chip de los tres estados con `Tooltip`, y `LeyendaDeAvisos`, derivada de la misma función de dominio que las filas.
- `lib/data/aseadores.ts` — tercera lectura, campo `estadoDeAvisos` en `AseadorConAsignaciones` y cabecera reescrita (el módulo ya consume una función de `public`).
- `lib/data/aseadores.test.ts` — el doble de cliente gana la pata de RPC y un registro de llamadas; cinco tests nuevos.
- `app/(admin)/aseadores/_components/TablaAseadores.tsx` — la columna, la celda, `ahoraMs` y la leyenda bajo la tabla.
- `app/(admin)/aseadores/_components/MenuAseador.tsx` — el ítem nuevo, el separador de §7.3 y el manejo de fallo del portapapeles.
- `app/(admin)/aseadores/page.tsx` — lee el reloj una vez y lo baja a la tabla.

## Decisions Made

Las nueve del bloque `key-decisions`. Las tres que más peso tienen:

1. **La superficie de D-03 no se movió al panel de alertas**, como §11.5 del UI-SPEC deja cerrado: "aseador sin avisos" no tiene instante en el tiempo, y el panel ordena cronológicamente. Va donde se toma la decisión de a quién asignar.
2. **El agregado se compone campo a campo.** Si mañana alguien le añade una columna a la función de la base, se queda fuera del `Map` en vez de propagarse sola hasta el navegador del admin. Hay un test que siembra las tres columnas de credencial en la fila y afirma que no salen.
3. **El nombre del RPC vive en una constante exportada.** Además de dar al test contra qué afirmar sin repetir el literal, deja `lib/data/` con **una sola** ocurrencia del nombre en todo el directorio, que era criterio de aceptación del plan.

## Deviations from Plan

### 1. [Regla 2 — funcionalidad crítica ausente] La leyenda de §11.1 no existía, se creó entera

- **Found during:** Task 2.
- **Issue:** El plan dice *"la leyenda de 12px bajo la tabla suma los tres pares icono+etiqueta nuevos, igual que ya hace con los estados existentes"*. En `/aseadores` **no había ninguna leyenda**: la que existe es `LeyendaDeAseos` en `/operacion`. El plan asumió una que no estaba.
- **Fix:** Se creó `LeyendaDeAvisos` en el mismo archivo del chip, con la técnica de `LeyendaDeAseos`: tres entradas mínimas pasadas por `estadoDeAvisosDeAseador()`, de modo que la etiqueta y el icono de la leyenda salen de la misma derivación que los de las filas. Cubre los tres estados de avisos y **no** los dos de `ESTADO`: `Activo` / `Inactivo` se explican solos, y la diferencia entre `Activos` y `Sin probar` no, que es justo la que D-02 exige que exista. Se añadió una glosa corta por estado por la misma razón.
- **Files modified:** `app/(admin)/_components/EstadoAvisosAseador.tsx`, `app/(admin)/aseadores/_components/TablaAseadores.tsx`.
- **Verification:** `npm run build` y `npm run ci:arch` en cero; la leyenda no usa `w-col-avisos`, así que el criterio de aceptación de ese grep (== 2) se mantiene.
- **Committed in:** `48e4506`.

### 2. [Regla 2 — funcionalidad crítica ausente] `ahoraMs` bajando desde el RSC

- **Found during:** Task 2.
- **Issue:** El plan no dice de dónde sale el reloj del `title`. `tituloDeEstadoDeAvisos()` recibe `ahoraMs` por parámetro (05-09 lo dejó así a propósito: una función que lee el reloj no se puede probar), y `TablaAseadores` es un Client Component que igual se renderiza en el servidor. Leer `Date.now()` dentro del componente daría una marca distinta por fila y otra distinta en servidor y en cliente.
- **Fix:** `page.tsx` lee el reloj una vez y lo baja por prop, exactamente como `leidoEnMs` en `/operacion` (04-UI-SPEC §13.1).
- **Files modified:** `app/(admin)/aseadores/page.tsx`, `app/(admin)/aseadores/_components/TablaAseadores.tsx`, `app/(admin)/_components/EstadoAvisosAseador.tsx`.
- **Verification:** `npm run build` en cero; el `title` se pinta desde la derivación del dominio, que ya tiene sus tests en 05-09.
- **Committed in:** `48e4506`.

### 3. [Regla 2 — funcionalidad crítica ausente] El separador de §7.3, que el plan 02-07 dejó condicionado

- **Found during:** Task 3.
- **Issue:** `MenuAseador` llevaba escrito, en su propio código, que el separador encima del ítem destructivo *"se añade cuando exista algo de lo que separarlo"*. El ítem nuevo es ese algo, y dejarlo sin separador incumpliría §7.3 con la condición ya satisfecha.
- **Fix:** `DropdownMenuSeparator` entre `Copiar el link de instalación` y `Desactivar`, con el comentario viejo actualizado para que no quede como deuda abierta.
- **Files modified:** `app/(admin)/aseadores/_components/MenuAseador.tsx`.
- **Verification:** `npm run build` en cero. Los e2e que abren este menú seleccionan por nombre de ítem (`Desactivar`, `Reactivar`), y ninguno de los dos es subcadena del ítem nuevo, así que no hay riesgo de modo estricto.
- **Committed in:** `ad8b28c`.

---

**Total deviations:** 3 auto-corregidas (3 × Regla 2).
**Impact on plan:** Ninguna amplía el alcance. Las tres cierran huecos que el plan dejó implícitos: una leyenda que suponía existente, la procedencia del reloj y una condición de diseño ya escrita en el código que este plan satisface.

## Issues Encountered

- **El RPC con `Args: never` de los tipos generados.** `lib/database.types.ts` declara `estado_avisos_aseadores: { Args: never; … }`, y a primera vista parece que obligaría a pasar un argumento imposible. No: `args` es opcional y `supabase.rpc(RPC_ESTADO_AVISOS)` compila limpio. Verificado con `npx tsc --noEmit`.
- **Nulabilidad de las marcas de tiempo.** El generador de tipos de Supabase declara las cinco marcas como `string` a secas, pero la función las calcula con `max()`/`min()` sobre un `left join` y la fila del aseador sin teléfono las trae nulas. El tipo del dominio (`EntradaEstadoAvisosAseador`, 05-09) ya las declara `string | null`, así que el mapeo es seguro en esa dirección y no hizo falta tocar nada.
- **`JWT issued at future` en el log del servidor durante la medición E2E.** Aparece al redirigir a `/operacion` tras el login y es desfase de reloj del stack local, preexistente y ajeno a este plan. No afectó la medición: `/aseadores` cargó y midió correctamente.
- **Tres archivos nombraban el RPC.** El criterio de aceptación exige una sola ocurrencia en `lib/data/`. Se reescribieron los comentarios de `aseadores.ts` y `aseadores.test.ts` para referirse a "la función agregada de la migración 16" y apuntar a la constante, en vez de repetir el literal.

## Verification

| Comprobación | Resultado |
|---|---|
| `npm run test:unit` | **46 archivos / 829 tests**, en verde (línea base tras 05-13: 45 / 818) |
| `npm run test:integration` | **18 archivos / 163 tests**, en verde (sin cambio) |
| `npx tsc --noEmit` | 0 |
| `npm run lint` | 0 errores, 2 avisos preexistentes |
| `npm run ci:arch` | 3 scripts, los tres OK |
| `npm run build` | verde, **14 rutas** (sin cambio) |
| CSS emitido | `.w-col-avisos{width:var(--spacing-col-avisos)}` y `--spacing-col-avisos:128px` |
| Tabla a 1280px, build de producción | scrollport **1230 / 1230**, documento **1280 / 1280** → sin scroll horizontal nuevo |
| Señuelo N+1 | la llamada al agregado dentro del bucle pone rojo 1 test y solo 1 |

`npm run db:test` y `npm run db:types:check` no se corrieron: este plan **no toca una sola línea de SQL** ni el esquema, así que no hay deriva posible de tipos ni de políticas.

## Known Stubs

Ninguno. Los tres estados se pintan con datos reales del agregado; no hay valor fijo ni texto de relleno en ninguna de las superficies nuevas.

## Threat Flags

Ninguno. Este plan no abre superficie nueva: no añade ruta, ni endpoint, ni política, ni columna. La única lectura nueva va por una función `security definer` que ya existía y que comprueba el rol por dentro, y el ítem del menú escribe en el portapapeles del propio admin (T-05-49, aceptado en el registro del plan).

## Self-Check: PASSED

- `lib/data/avisos.ts` — FOUND
- `lib/data/avisos.test.ts` — FOUND
- `app/(admin)/_components/EstadoAvisosAseador.tsx` — FOUND
- `b91d8c9`, `f1080af`, `48e4506`, `ad8b28c` — los cuatro en `git log`

## User Setup Required

Ninguno. No hay servicio externo ni variable de entorno nueva: el dominio del link sale del origen del navegador, precisamente para no añadir una.

## Next Phase Readiness

- **Listo para 05-15**, la otra mitad de D-03: `leerEstadoDeAvisosPorAseador()` ya está y es lo que `/operacion` necesita para marcar el chip de `FranjaCarga` (§11.2) y para la advertencia de `AvisoAseadorSinPush` antes de asignar (§11.3). **Que no se duplique la llamada**: se importa de `lib/data/avisos.ts`.
- **Pendiente de otro plan de esta fase:** la ruta `/instalar` todavía no existe (planes 05-11 y 05-12). El ítem del menú copia el link igual —es una cadena, no un `Link`—, así que el flujo completo no se puede probar de punta a punta hasta que esa ruta aterrice.
- **Sugerencia para el verificador:** sembrar tres aseadores en los tres estados (uno con suscripción verificada por toque, uno con suscripción sin verificar y uno sin ninguna) antes de la UAT visual de D4.

---
*Phase: 05-notificaciones-push-e-instalaci-n-de-la-pwa*
*Completed: 2026-09-11*
