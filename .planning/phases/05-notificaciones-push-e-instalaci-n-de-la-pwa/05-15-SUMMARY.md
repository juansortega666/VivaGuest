---
phase: 05-notificaciones-push-e-instalaci-n-de-la-pwa
plan: 15
subsystem: ui
tags: [push, copy, toast, tailwind-v4, rsc, server-actions, permiso, vitest]
status: complete

requires:
  - phase: 05-14
    provides: "`leerEstadoDeAvisosPorAseador()` en `lib/data/avisos.ts`: la única lectura del agregado, que este plan CONSUME sin duplicar"
  - phase: 05-09
    provides: "`estadoDeAvisosDeAseador()` y los tres estados de §5.2, que son de donde sale `sin_avisos` sin escribir un solo `if` sobre conteos en la página"
  - phase: 05-10
    provides: "`registrarSuscripcion`, `useEstadoDeAvisos()`, `base64UrlAUint8()` y las tres reglas del permiso, que la franja del admin repite"
  - phase: 04
    provides: "`FranjaCarga`, `SheetConfirmar`, `DialogoReasignar`, `ContextoDeAcciones` y la regla de copy de §18.1 que este plan supersede"
provides:
  - "`AvisoAseadorSinPush`: la advertencia inline de D-03, un solo componente reusado en el `Sheet` de confirmación encadenada y en `DialogoReasignar`"
  - "`TiraAvisosAdmin`: la franja de permiso del admin de §13, tres estados y descarte por sesión de pestaña"
  - "`FranjaCarga` con la marca de mudo y la condición de render ampliada (`hay carga hoy O hay alguien sin avisos`)"
  - "`app/(admin)/operacion/_copy.ts`: los tres toasts de §11.3, en un módulo puro que el test puede recorrer entero"
  - "`lib/data/avisos.ts#leerEndpointDePushPropio()`: una sola lectura del endpoint propio para los dos árboles"
  - "`lib/push/plataforma.ts#aFormDataDeSuscripcion()`: movida desde `(cleaner)` para que `(admin)` no importe de otro árbol"
  - "El test de copy INVERTIDO de §11.4, corrido en rojo y en verde"
affects: [05-16, 05-17, 06]

tech-stack:
  added: []
  patterns:
    - "El copy de un mensaje de éxito que compone el CLIENTE vive en un módulo puro hermano de las actions (`_copy.ts`), no dentro del componente: un módulo `'use server'` solo puede exportar funciones asíncronas, y con el copy repartido entre las dos capas el test de contrato tendría que recorrer dos sitios y se dejaría uno"
    - "Un dato que solo alimenta copy viaja por `FormData` con su propia marca (`aseador_sin_avisos`), igual que los dos `*_nombre` de la Fase 4, y el esquema lo declara como marca de presentación: aunque llegue al revés, lo único que produce es un toast que se miente a sí mismo"
    - "Una estructura que cruza la frontera RSC → cliente sale como ARRAY y nunca como `Set`: un `Set` no sobrevive a la serialización de React, y con ocho personas la búsqueda lineal cuesta menos que construir el índice"
    - "Un test de componente en `.ts` con `createElement` + `renderToStaticMarkup`: el `include` de vitest es `app/**/*.test.ts`, así que un `.tsx` no lo recogería nadie y el resultado sería un verde falso"
    - "Al invertir una regla vigilada por un test, el señuelo se corre en los DOS sentidos y las dos salidas se anotan: un test invertido que nadie vio rojo no prueba nada"

key-files:
  created:
    - app/(admin)/operacion/_components/AvisoAseadorSinPush.tsx
    - app/(admin)/operacion/_components/TiraAvisosAdmin.tsx
    - app/(admin)/operacion/_components/FranjaCarga.test.ts
    - app/(admin)/operacion/_copy.ts
  modified:
    - app/(admin)/operacion/_components/FranjaCarga.tsx
    - app/(admin)/operacion/_components/SheetConfirmar.tsx
    - app/(admin)/operacion/_components/DialogoReasignar.tsx
    - app/(admin)/operacion/_components/BandejaSinConfirmar.tsx
    - app/(admin)/operacion/_components/MenuAseo.tsx
    - app/(admin)/operacion/_actions.ts
    - app/(admin)/operacion/_actions.test.ts
    - app/(admin)/operacion/page.tsx
    - lib/data/avisos.ts
    - lib/push/plataforma.ts
    - app/(cleaner)/layout.tsx
    - app/(cleaner)/_actions.ts
    - app/(cleaner)/_components/BannerAvisos.tsx
    - app/(cleaner)/_components/BotonActivarAvisos.tsx

key-decisions:
  - "La advertencia NO deshabilita el botón de confirmar y el diff lo demuestra: la expresión `disabled`/`bloqueado` de `SheetConfirmar` no tiene una sola línea cambiada. La asimetría con `sin responsable` es la del contrato: allí la RPC lanza `P0001` y confirmar es imposible; acá la RPC funciona y el aseo queda correcto, así que bloquear castigaría al admin por un teléfono ajeno (T-05-52)"
  - "No se añadió un octavo tipo de alerta al panel, y la decisión queda escrita en la cabecera del componente para que no se reabra: el panel ordena por instante y este estado no tiene instante"
  - "El `Sheet` recibe un mapa `property_id → booleano` y el diálogo una lista de ids de aseador, en vez de reformar `responsables` para que lleve el id del responsable: la línea `Queda asignado a {nombre}` solo tiene el nombre a mano, y el cruce lo hace el RSC, que es el único con los dos lados"
  - "`estadoDeAvisosDeAseador()` se llama desde `page.tsx` en vez de escribir `suscripciones_vivas === 0`: un `if` propio sería una segunda verdad sobre el mismo dato y la que se quedara atrás lo haría en silencio"
  - "`Sin probar` NO se marca en la franja (solo `Sin avisos`), y el chip del mudo conserva su fondo neutro: el tinte de aviso sigue reservado al chip `Sin asignar`, y duplicarlo haría que dos hechos distintos se vean igual"
  - "La franja del admin resuelve los dos estados que §13.2 no nombra con la razón escrita: `no_soportado` y `sin_instalar` no se renderizan (no hay acción que ofrecer, y una franja ámbar sin acción promete una que no existe), y `roto` se renderiza como `default` CON botón, porque `Activar` es exactamente lo que lo arregla"
  - "El descarte de la franja vive en memoria del cliente y dura la sesión de la pestaña: es una comodidad, no una alarma, pero tampoco desaparece para siempre. Cero almacenamiento persistente, verificado por grep"
  - "`registrarSuscripcion` se REUSA desde `(cleaner)` en vez de escribir una gemela en `(admin)`: su guard es el de sesión y escribe siempre sobre `user_id = auth.uid()`, así que quien la llama solo puede registrar su propio navegador. La cabecera de aquel archivo se actualizó para que la prosa no siga diciendo que solo la llama un aseador"
  - "El admin NO gana `select` sobre la tabla de suscripciones: lo único que se añadió es la lectura de SU PROPIO endpoint, que la policy `push_subs_own_all` ya le daba. El agregado sin ranura para credenciales sigue siendo la única puerta a los datos ajenos (T-05-07)"
  - "La regla de copy de 04-UI-SPEC §18.1 se supersede en vez de borrarse, y el comentario que la sostenía se reescribe con la premisa que murió: prohibirlo todo hoy impediría decir lo único honesto que esta pantalla puede decir"

patterns-established:
  - "Señuelo corrido y anotado en las DOS direcciones: con `Se le notificó a María` inyectado en un mensaje de éxito real, el archivo sale rojo (2 de 58); retirado, verde (58 de 58)"
  - "El copy de la tabla de un contrato se afirma VERBATIM en el test, en las dos columnas: el patrón se prueba contra las cinco frases prohibidas y contra las cuatro permitidas, porque un patrón que solo se prueba por un lado puede estar vacío y nadie lo nota"
  - "Antes de escribir un comentario que nombre un token vigilado por un grep, se comprueba: la prosa de `AvisoAseadorSinPush` tuvo que reescribirse porque mencionar el token de rojo en su cabecera hacía fallar su propio criterio de aceptación"

requirements-completed: [NOTIF-02, NOTIF-04]

coverage:
  - id: D1
    description: "La advertencia inline antes de asignar: una sola línea, un solo componente, montada en el `Sheet` de confirmación encadenada y en `DialogoReasignar`, que avisa sin bloquear"
    requirement: NOTIF-02
    verification:
      - kind: other
        ref: "grep -rc 'no tiene los avisos activos' app/(admin)/operacion/_components/ == 1 archivo (AvisoAseadorSinPush.tsx); grep -c AvisoAseadorSinPush en Sheet y Diálogo >= 1 en cada uno"
        status: pass
      - kind: other
        ref: "grep -cE destructive AvisoAseadorSinPush.tsx == 0"
        status: pass
      - kind: other
        ref: "git diff de SheetConfirmar.tsx: cero líneas con `disabled`/`bloqueado` tocadas — la advertencia no bloquea"
        status: pass
      - kind: other
        ref: "npm run build && npm run ci:arch && npx tsc --noEmit"
        status: pass
    human_judgment: true
    rationale: "Que la línea ámbar se lea como información y no como error, que quepa sin romper el bloque de contexto del `Sheet` a 384px, y que una tanda de quince siga siendo llevadera con la advertencia dentro, son juicios visuales. Ningún test los afirma: hay que abrir el `Sheet` con un apartamento cuyo responsable esté en `Sin avisos`"
  - id: D2
    description: "La marca de mudo en el chip de la franja de carga y la condición de render ampliada: la franja aparece también el día sin carga si hay alguien sin canal"
    requirement: NOTIF-02
    verification:
      - kind: unit
        ref: "app/(admin)/operacion/_components/FranjaCarga.test.ts#con cero carga y UN aseador sin avisos SI se renderiza: es el dia con tiempo para arreglarlo"
        status: pass
      - kind: unit
        ref: "app/(admin)/operacion/_components/FranjaCarga.test.ts#con cero carga y NADIE sin avisos no se renderiza, como siempre"
        status: pass
      - kind: unit
        ref: "app/(admin)/operacion/_components/FranjaCarga.test.ts#el chip del mudo CONSERVA su fondo neutro: el tinte sigue reservado al chip sin persona"
        status: pass
      - kind: unit
        ref: "app/(admin)/operacion/_components/FranjaCarga.test.ts#`Sin asignar` nunca lleva campana, aunque la lista de mudos trajera un id nulo"
        status: pass
      - kind: other
        ref: "grep -cE surface-warn FranjaCarga.tsx == 1, sin aumento respecto al valor previo"
        status: pass
    human_judgment: false
  - id: D3
    description: "La franja de permiso del admin: tres estados, descartable por sesión, y las tres reglas del permiso (petición dentro del click, suscripción en el mismo manejador, nada en montaje)"
    requirement: NOTIF-02
    verification:
      - kind: other
        ref: "grep -c requestPermission TiraAvisosAdmin.tsx == 1, y está dentro de `activar()`, que solo se invoca desde el `onClick` del botón"
        status: pass
      - kind: other
        ref: "grep -cE localStorage TiraAvisosAdmin.tsx == 0"
        status: pass
      - kind: other
        ref: "orden en page.tsx: TiraAvisosAdmin línea 385 < FranjaCarga línea 390, dentro del carril ancho"
        status: pass
      - kind: other
        ref: "npm run build && npx tsc --noEmit && npm run ci:arch"
        status: pass
    human_judgment: true
    rationale: "El diálogo de permiso del navegador, la suscripción real y el paso de `default` a `granted`/`denied` solo se ven en un navegador con contexto seguro y service worker activo. No hay e2e para esta franja en este plan. Falta comprobar además que los 40px no empujen el carril lateral con el panel lleno, que es una medición de layout"
  - id: D4
    description: "Los tres toasts de §11.3 con su copy literal, y el mensaje de reasignación que nombra la ausencia de canal sin prometer entrega"
    requirement: NOTIF-02
    verification:
      - kind: unit
        ref: "app/(admin)/operacion/_actions.test.ts#tanda completa con casos sin canal"
        status: pass
      - kind: unit
        ref: "app/(admin)/operacion/_actions.test.ts#tanda interrumpida con UN caso sin canal, en singular"
        status: pass
      - kind: unit
        ref: "app/(admin)/operacion/_actions.test.ts#tanda sin ningun caso: el mensaje de la Fase 4, intacto y sin espacio de mas"
        status: pass
      - kind: unit
        ref: "app/(admin)/operacion/_actions.test.ts#reasignar a alguien sin canal"
        status: pass
      - kind: unit
        ref: "app/(admin)/operacion/_actions.test.ts#la marca de copy NO viaja a la base: la RPC recibe los dos parametros de siempre"
        status: pass
    human_judgment: false
  - id: D5
    description: "SUPERSEDE 2: el test que prohibía nombrar el canal pasa a prohibir afirmar la entrega, y el comentario que sostenía la regla vieja queda reescrito"
    requirement: NOTIF-02
    verification:
      - kind: unit
        ref: "app/(admin)/operacion/_actions.test.ts#ninguno de los mensajes de las siete actions lo afirma"
        status: pass
      - kind: unit
        ref: "app/(admin)/operacion/_actions.test.ts#atrapa el copy prohibido (5 casos de la columna derecha de §11.4)"
        status: pass
      - kind: unit
        ref: "app/(admin)/operacion/_actions.test.ts#deja pasar el copy permitido (4 casos de la columna izquierda de §11.4)"
        status: pass
      - kind: other
        ref: "señuelo: con `Se le notificó a María` inyectado en el mensaje de `cerrarAseo`, `_actions.test.ts` sale 2 failed | 56 passed; retirado, 58 passed"
        status: pass
      - kind: other
        ref: "grep -vE '^\\s*(//|/\\*|\\*)' _actions.test.ts | grep -cF '<patrón viejo>' == 0; grep -c 'ya fue avisad' == 2"
        status: pass
    human_judgment: false
  - id: D6
    description: "El estado de avisos llega a `/operacion` sin ampliar la superficie de datos del admin: una llamada al agregado para los ocho, y la lectura del endpoint propio compartida con el árbol del aseador"
    requirement: NOTIF-04
    verification:
      - kind: other
        ref: "page.tsx: `leerEstadoDeAvisosPorAseador(supabase)` dentro del `Promise.all` existente, una sola invocación; cero `select` nuevos sobre la tabla de suscripciones ajenas"
        status: pass
      - kind: unit
        ref: "lib/data/avisos.test.ts (plan 05-14): una sola llamada con ocho sembrados, y cero credenciales en las claves devueltas — siguen en verde"
        status: pass
      - kind: integration
        ref: "npm run test:integration — 18 archivos / 163 tests, sin cambio respecto al baseline"
        status: pass
    human_judgment: false

duration: 21min
completed: 2026-09-11
---

# Fase 5 Plan 15: la advertencia donde se decide, la franja del admin y el test de copy invertido

**El admin no puede asignarle un aseo a alguien que se quedó mudo sin haberlo visto antes, lo ve también el día que no hay trabajo, puede activar sus propios avisos desde una franja de 40px, y ningún mensaje de la pantalla le promete una entrega que el sistema no puede garantizar.**

## Performance

- **Duration:** 21 min
- **Started:** 2026-09-12T00:01:00Z
- **Completed:** 2026-09-12T00:21:52Z
- **Tasks:** 3 de 3
- **Files modified:** 18 (4 creados, 14 modificados)

## Accomplishments

- **`AvisoAseadorSinPush`: una línea, un componente, dos sitios.** Existe como componente y no como dos párrafos copiados porque el copy es idéntico y dos copias divergen en el primer retoque. En el `Sheet` va justo debajo de `Queda asignado a {responsable}`; en el diálogo, debajo del selector y **solo al elegir** el destino.
- **Y lo que la advertencia no hace, demostrado por el diff.** No deshabilita el botón: la expresión `disabled` de `SheetConfirmar` no tiene una línea cambiada. No abre diálogo. No cambia el copy del botón. La asimetría con `sin responsable` está escrita en el código: allí la RPC lanza `P0001` y confirmar es imposible; acá la RPC funciona y el aseo queda correcto (T-05-52).
- **La franja de carga cambia de comportamiento por primera y única vez.** Se renderiza si hay carga hoy **o** si hay alguien sin avisos. Es contraintuitivo, así que hay un test de componente que fija las dos ramas y un comentario que escribe la razón: sin esa segunda rama, el día que nadie tenga aseos asignados desaparece la única superficie donde se ve quién quedó mudo, **y ese es justo el día con tiempo para arreglarlo**.
- **La campana en el chip, sin robarle el tinte al chip sin asignar.** `BellOff` de 12px en ámbar, `gap-xs`, con su `aria-label` y su `title`; el chip conserva `bg-muted`. `Sin probar` no se marca aquí y `Sin asignar` nunca lleva campana, porque no es una persona. Los dos hechos los afirma el test.
- **`TiraAvisosAdmin`, deliberadamente más liviana que el banner del aseador.** Los tres estados de §13.2 con su copy literal, 40px, descarte en memoria que dura la sesión de la pestaña, y sin paso de prueba: D-02 exige la verificación para el aseador, cuyo canal es único. Repite las tres reglas del permiso, verificadas por grep.
- **SUPERSEDE 2, ejecutada en la dirección correcta.** El test de la Fase 4 no se borró: se **invirtió**. Deja de buscar la palabra de aviso a secas y pasa a buscar las formas de afirmar entrega, con el patrón que el contrato daba. La distinción que ahora sostiene: se puede afirmar la **ausencia** de canal, que es un hecho conocido al escribir; no se puede afirmar la **entrega**, porque el drenaje es asíncrono y fire-and-forget (T-05-51).
- **El señuelo se corrió en los dos sentidos y las dos salidas están anotadas.** Con `Se le notificó a María` inyectado en el mensaje de éxito real de `cerrarAseo`, el archivo sale **rojo (2 de 58 fallan)**; retirado, **verde (58 de 58)**. Un test invertido que nadie vio rojo no prueba nada, y este lleva desde la Fase 4 sosteniendo una promesa de producto.
- **El comentario que sostenía la regla vieja está reescrito, no parcheado.** El bloque `COPY` de `_actions.ts` decía que ningún mensaje podía nombrar el canal *porque nadie drenaba la cola hasta la Fase 5*. Esa premisa murió en esta fase; el bloque nuevo la cita en pasado, escribe la regla de §11.4 y nombra la supersesión, para que se lea como decisión y no como relajación.
- **Cero superficie de datos nueva para el admin.** Sigue sin `select` sobre las suscripciones ajenas: todo entra por el agregado de la migración 16, llamado **una vez** dentro del `Promise.all` que ya existía. Lo único que se añadió es la lectura de su **propio** endpoint, que su policy ya le daba.

## Task Commits

1. **Task 1: la advertencia inline y su sitio en el `Sheet` y en el `Dialogo`** — `fb8e891` (feat)
2. **Task 2: la marca en los chips, la franja del admin y su sitio en la página** — `237a3e0` (feat)
3. **Task 3: los toasts nuevos y la inversión del test de copy** — `5ee450f` (feat)
4. **Fuera de alcance, registrado** — `b1ac7a6` (docs)

## Files Created/Modified

### Creados

- `app/(admin)/operacion/_components/AvisoAseadorSinPush.tsx` — la línea de advertencia. Su cabecera escribe las tres cosas que **no** hace y por qué no hay un octavo tipo de alerta.
- `app/(admin)/operacion/_components/TiraAvisosAdmin.tsx` — la franja del admin. Componente de fuera con el descarte y la remedición; vista de dentro con el hook, montada con `key` para que activar vuelva a medir.
- `app/(admin)/operacion/_components/FranjaCarga.test.ts` — 7 tests: las tres ramas de la condición de render y las cuatro reglas de la marca.
- `app/(admin)/operacion/_copy.ts` — los tres toasts de §11.3, con la coletilla singular/plural en una sola función.

### Modificados

- `app/(admin)/operacion/_components/FranjaCarga.tsx` — la campana, la disyunción de render y la razón escrita de las dos.
- `app/(admin)/operacion/_components/SheetConfirmar.tsx` — la advertencia, el contador `mudosConfirmados` (que cuenta **confirmados**, no vistos: un aseo saltado no quedó asignado a nadie) y los dos toasts de cierre.
- `app/(admin)/operacion/_components/DialogoReasignar.tsx` — la advertencia al elegir destino y la marca de copy en el `FormData`.
- `app/(admin)/operacion/_components/BandejaSinConfirmar.tsx` y `MenuAseo.tsx` — el mapa y la lista atraviesan estos dos sin que los usen; el consumidor es el `Sheet` y el diálogo.
- `app/(admin)/operacion/_actions.ts` — el bloque `COPY` reescrito, `aseador_sin_avisos` en el esquema de reasignación y el mensaje delegado a `_copy.ts`.
- `app/(admin)/operacion/_actions.test.ts` — la sección 6 invertida entera, más las dos columnas de §11.4 y los casos literales de los toasts.
- `app/(admin)/operacion/page.tsx` — la sexta y séptima lectura en el `Promise.all`, la derivación de mudos vía dominio, el cruce por apartamento y el montaje de la franja encima de la de carga.
- `lib/data/avisos.ts` — `leerEndpointDePushPropio()`.
- `lib/push/plataforma.ts` — `aFormDataDeSuscripcion()`, movida desde `(cleaner)`.
- `app/(cleaner)/layout.tsx`, `_actions.ts`, `_components/BannerAvisos.tsx`, `_components/BotonActivarAvisos.tsx` — consecuencias de las dos extracciones, más la prosa de la cabecera de las actions del aseador, que ya no dice que solo las llama un aseador.

## Decisions Made

Las diez del bloque `key-decisions`. Las tres con más peso:

1. **La advertencia avisa y no bloquea, y eso está protegido por un criterio que mira el diff.** Bloquear la confirmación por un teléfono ajeno convertiría una tanda de quince en un muro, y el aseo confirmado es correcto de todas formas.
2. **La condición de render de la franja se amplió a una disyunción**, que es el único cambio de comportamiento de un componente de la Fase 4 en todo el plan, y va con test y con la razón escrita en el propio archivo porque es exactamente la clase de línea que alguien "simplifica".
3. **La supersesión se ejecutó en la dirección correcta y se probó por los dos lados.** El riesgo real de este plan no era escribir el componente: era borrar un test que llevaba desde la Fase 4 protegiendo una promesa de producto y dejar en su sitio algo que no midiera nada.

## Deviations from Plan

### 1. [Regla 3 — bloqueante] La franja del admin necesitaba el endpoint propio, y el plan no dijo de dónde sale

- **Found during:** Task 2.
- **Issue:** El plan dice que `TiraAvisosAdmin` consume `usarEstadoDeAvisos()`, y ese hook exige `endpointRegistrado` por contrato. Sin ese dato el hook **no tiene contra qué comparar y repara en silencio en cada carga de la página**, rotando el endpoint del admin y dejando huérfanos los avisos ya encolados al anterior. El plan no lo menciona. La única lectura existente era un `select` escrito a mano dentro de `app/(cleaner)/layout.tsx`.
- **Fix:** Se extrajo a `lib/data/avisos.ts#leerEndpointDePushPropio()` y se usa en los **dos** sitios. Copiarlo habría dejado dos verdades sobre la forma del mismo dato, que es literalmente la razón por la que ese módulo existe (decisión del plan 05-14).
- **Files modified:** `lib/data/avisos.ts`, `app/(cleaner)/layout.tsx`, `app/(admin)/operacion/page.tsx`.
- **Verification:** `npm run test:unit` 48/876 en verde, `test:integration` 18/163 sin cambio, `build` y `tsc` en cero.
- **Committed in:** `237a3e0`.

### 2. [Regla 2 — funcionalidad crítica ausente] `aFormDataDeSuscripcion` vivía en un componente de `(cleaner)`

- **Found during:** Task 2.
- **Issue:** El plan dice "reusa `registrarSuscripcion` del plan 05-10", pero esa action espera un `FormData` plano y el único aplanador del repo estaba exportado desde `app/(cleaner)/_components/BotonActivarAvisos.tsx`. Importarlo desde `(admin)` habría metido un componente del árbol del aseador en el bundle del admin y habría dejado un import cruzado entre dos árboles que el repo mantiene separados.
- **Fix:** Se movió a `lib/push/plataforma.ts`, que es el módulo cuya definición es exactamente "lo que lee el navegador" (`navigator.userAgent` y el feature detect del formato declarativo). Los dos consumidores de `(cleaner)` se actualizaron.
- **Files modified:** `lib/push/plataforma.ts`, `app/(cleaner)/_components/BotonActivarAvisos.tsx`, `app/(cleaner)/_components/BannerAvisos.tsx`.
- **Verification:** `npm run test:unit` en verde, `build` en cero.
- **Committed in:** `237a3e0`.

### 3. [Regla 2] §13.2 define tres estados y el dominio tiene seis: los dos huecos se cerraron con la razón escrita

- **Found during:** Task 2.
- **Issue:** El contrato da `default`, `denied` y `granted`+suscrito. `useEstadoDeAvisos()` devuelve seis claves. `no_soportado`, `sin_instalar` y `roto` no están mapeados en ningún sitio del contrato, y dejarlos sin decidir habría producido una franja que no se renderiza nunca en un admin con la suscripción rota.
- **Fix:** `no_soportado` y `sin_instalar` no se renderizan (no hay acción que ofrecer, misma regla de §7.6, y ninguno de los dos es alcanzable desde el escritorio en el que se usa `/operacion`). `roto` se renderiza como `default` **con** botón, y el manejador da de baja la suscripción desalineada antes de sacar la nueva, que es el orden medido en el research (`InvalidStateError` en Chromium si se invierte). Las tres decisiones van escritas en el archivo.
- **Files modified:** `app/(admin)/operacion/_components/TiraAvisosAdmin.tsx`.
- **Verification:** `tsc` y `build` en cero; `grep -c requestPermission == 1`.
- **Committed in:** `237a3e0`.

### 4. [Regla 3] El copy de los toasts de la tanda no cabía en `_actions.ts`

- **Found during:** Task 3.
- **Issue:** El plan asigna los toasts a `_actions.ts`, pero **dos de los tres los pinta el cliente**: el toast de cierre de la tanda lo compone `SheetConfirmar`, que es el único que sabe cuántos confirmó de verdad. Y un módulo `'use server'` solo puede exportar funciones asíncronas, así que un compositor de cadenas no cabe ahí. El criterio de aceptación exige además que los tres aparezcan como cadenas literales afirmadas en `_actions.test.ts`.
- **Fix:** `app/(admin)/operacion/_copy.ts`, módulo puro hermano de las actions. Lo importan la action de reasignación, el `Sheet` y el test, así que el test recorre los tres mensajes desde un solo sitio.
- **Files modified:** `app/(admin)/operacion/_copy.ts` (creado), `_actions.ts`, `SheetConfirmar.tsx`, `_actions.test.ts`.
- **Verification:** los tres literales afirmados y en verde; señuelo corrido.
- **Committed in:** `5ee450f`.

### 5. [Nota de criterio, no de código] Un criterio de aceptación del plan es inalcanzable tal como está escrito

- **Found during:** Task 1.
- **Issue:** El plan pide que `grep -c "AvisoAseadorSinPush"` devuelva **1** en `SheetConfirmar.tsx` y en `DialogoReasignar.tsx`. `grep -c` cuenta **líneas**, y usar un componente importado exige como mínimo dos: la del `import` y la del JSX. El mínimo alcanzable es 2.
- **Fix:** ninguno en el código. El valor real es **2 en cada archivo**, que es lo que el criterio quería decir ("se usa en los dos sitios"). Se anota para que el verificador no lo lea como fallo.
- **Verification:** `grep -c` devuelve 2 y 2; la intención (un solo componente reusado en los dos sitios, y la cadena de copy en un solo archivo) sí está verificada: `grep -rc "no tiene los avisos activos"` encuentra la cadena en **un** archivo.

### 6. [Regla 1 — bug] Un comentario tripó su propio criterio de aceptación

- **Found during:** Task 1.
- **Issue:** La cabecera de `AvisoAseadorSinPush.tsx` explicaba la regla de "cero rojo" nombrando el token de rojo del sistema. El criterio `grep -cE "destructive" == 0` no filtra comentarios, así que el archivo fallaba su propio criterio por explicarlo bien. Es la quinta vez que este repo paga la misma trampa.
- **Fix:** la prosa se reescribió sin escribir el token, y dice explícitamente **por qué** no lo escribe.
- **Files modified:** `app/(admin)/operacion/_components/AvisoAseadorSinPush.tsx`.
- **Verification:** `grep -cE "destructive" == 0`.
- **Committed in:** `fb8e891`.

**Total deviations:** 4 auto-arregladas (2 de Regla 2, 2 de Regla 3), 1 bug de Regla 1, 1 nota sobre un criterio mal formulado. **Impacto:** ninguna cambia el alcance del plan; dos de ellas (1 y 2) previenen duplicación de lecturas y de helpers, que es el patrón que este repo ya tenía establecido.

## Authentication Gates

Ninguna.

## Verification

| Comprobación | Resultado |
|---|---|
| `npx tsc --noEmit` | limpio |
| `npm run lint` | 0 errores, 2 avisos preexistentes |
| `npm run build` | verde, 14 rutas |
| `npm run ci:arch` | los tres scripts en OK |
| `npm run test:unit` | **48 archivos / 876 tests** (baseline 47/852: +1 archivo, +24 tests) |
| `npm run test:integration` | 18 archivos / 163 tests, sin cambio |
| Señuelo del test de copy, **rojo** | `Se le notificó a María` en el mensaje de `cerrarAseo` → `2 failed \| 56 passed (58)` |
| Señuelo retirado, **verde** | `58 passed (58)` |
| Escenario "cero carga hoy y un aseador sin avisos" | la franja **aparece**, afirmado en `FranjaCarga.test.ts` |
| Escenario "cero carga hoy y nadie sin avisos" | la franja **no** se renderiza, afirmado |

`npm run db:test` no se corrió: este plan no toca ninguna migración ni ninguna policy.

## Known Stubs

Ninguno. Todo lo que esta pantalla pinta sale de datos reales: el estado de avisos del agregado de la migración 16 y el estado del navegador del hook.

## Threat Flags

Ninguno. Las dos superficies nuevas leen lo que ya estaba autorizado: el agregado sin ranura para credenciales (que el admin ya consumía desde `/aseadores`) y el endpoint propio del propio usuario, que su policy ya le daba. No se añadió ninguna policy, ningún grant, ninguna RPC y ningún endpoint HTTP nuevo. La única clave de `FormData` nueva es una marca de presentación que no viaja a la base, afirmado por test.

## Issues Encountered

Ninguno sin resolver. Queda registrado en `deferred-items.md` un comentario preexistente y desactualizado (el bloque que dice que `confirmarAseo` llama a `revalidatePath`, cosa que dejó de ser cierta en el plan 04-14) que aparece en siete sitios y cuya corrección es un cambio propio, no una nota al margen de este plan.

## Next Phase Readiness

Listo para `05-16`. Lo que este plan deja disponible:

- `aseadoresSinAvisos` y `responsableSinAvisos` ya viajan por `ContextoDeAcciones`, así que cualquier superficie nueva de `/operacion` que necesite el estado de canal lo tiene sin un viaje más a la base.
- `_copy.ts` es el sitio al que va cualquier mensaje de éxito nuevo de esta pantalla que componga el cliente, y el test de §11.4 lo recorre solo.
- `leerEndpointDePushPropio()` y `aFormDataDeSuscripcion()` están donde cualquier árbol las puede consumir.

## Self-Check: PASSED

Archivos creados, verificados en disco:

- `app/(admin)/operacion/_components/AvisoAseadorSinPush.tsx` — FOUND
- `app/(admin)/operacion/_components/TiraAvisosAdmin.tsx` — FOUND
- `app/(admin)/operacion/_components/FranjaCarga.test.ts` — FOUND
- `app/(admin)/operacion/_copy.ts` — FOUND

Commits, verificados en `git log`:

- `fb8e891` — FOUND
- `237a3e0` — FOUND
- `5ee450f` — FOUND
- `b1ac7a6` — FOUND
