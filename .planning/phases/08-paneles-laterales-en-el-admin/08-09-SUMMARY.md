---
phase: 08-paneles-laterales-en-el-admin
plan: 09
subsystem: seguridad
tags: [secretos, server-action, panel, rsc, accesibilidad, redirect, searchparams]

requires:
  - phase: 01-cimientos
    provides: "property_secrets sin grant para authenticated, que es lo que obliga a que toda lectura pase por la fábrica administrativa; y reveal_access_code(), el único camino del sistema que deja rastro de una apertura"
  - phase: 02-acceso-y-administraci-n-del-cat-logo
    provides: "leerSecretos() y su orden obligatorio (guard → Zod → fábrica); el precedente literal de enmascarar una credencial de esta misma tabla en apartamentos/[id]/calendario/page.tsx, con su T-02-74; y los guardarraíles 7 y 8 de check-service-role.sh"
  - phase: 04-operaci-n-diaria
    provides: "la medición del plan 04-14: revalidatePath cuelga el navegador en las Server Actions del árbol (admin)"
  - phase: 05-pwa-del-aseador
    provides: "CodigoDeAcceso.tsx del árbol del aseador: la regla de que el valor muere con el desmontaje, y la línea de transparencia que este plan NO puede copiar"
  - phase: 08-paneles-laterales-en-el-admin
    provides: "08-04: FilaDeDato, GrupoDePanel y el token --container-boton-mostrar de la Wave 1. 08-06: PanelApartamento con la fila del código preparada y vacía, y la decisión 5 que dejó escrito por qué la máscara son seis puntos literales"
provides:
  - "revelarCodigoDeAcceso(): la única acción de lectura de la fase, con la proyección a dos campos que cierra T-08-39"
  - "hayCodigoDeAcceso(): el booleano que decide entre el estado oculto y el estado sin código sin que ninguna credencial cruce"
  - "CodigoDeAccesoAdmin: los cinco estados de §7.3, con el valor viviendo solo en el estado de React"
  - "El destino de §5.4: al crear un apartamento se aterriza en /apartamentos?apartamento={id}. Era el huérfano de la fase"
  - "La medición del Hallazgo 7 en las dos direcciones, contra el documento y contra la carga de la respuesta"
affects: [08-10, 08-11, 08-12, 08-13, 08-14]

tech-stack:
  added: []
  patterns:
    - "Una acción que delega la fábrica administrativa escribe su guarda A MANO: el guardarraíl 7 recorre cuerpos de función y al delegar no ve nada, que es el falso verde por ausencia que el propio script nombra"
    - "La proyección a campos enumerados se declara en el tipo de retorno y no se infiere: es lo que impide que un `return` del objeto entero compile"
    - "Un componente de cliente que muestra un secreto recibe el identificador y un booleano, nunca el valor: lo que se pasa como prop viaja en la carga de React y queda en el documento aunque no se pinte"
    - "El copy de un componente vive en constantes con nombre al principio del archivo, para que comparar con el contrato sea leer una lista y no un árbol de JSX"

key-files:
  created:
    - app/(admin)/apartamentos/_components/CodigoDeAccesoAdmin.tsx
  modified:
    - app/(admin)/apartamentos/_actions.ts
    - app/(admin)/apartamentos/_components/PanelApartamento.tsx
    - app/(admin)/apartamentos/_components/FormularioApartamento.tsx
  deleted: []

key-decisions:
  - "El fallo de la acción NO trae mensaje. La lectura delegada colapsa a propósito tres desenlaces en un solo null para no ser un oráculo de qué ids existen, así que acá no hay nada verdadero que decir más allá de no. El copy de §15.2 vive en el componente"
  - "Se añadió hayCodigoDeAcceso(), una segunda función exportada que el plan no pedía. Sin ella el estado `Sin código` de §7.3 es inimplementable: la lista no lee la tabla de secretos y el panel no tiene con qué decidir si esa fila lleva botón"
  - "CodigoDeAccesoAdmin renderiza su propia FilaDeDato en vez de ocupar el hueco `valor`. El error de §7.3 va dentro del grupo y con el hueco de valor no cabía sin romper la lista de definición"
  - "El redirect de §5.4 vive en FormularioApartamento.tsx, no en _actions.ts. El plan lo situaba en el archivo de acciones y ahí no está: redirigir es decisión de la pantalla"
  - "El tipo de cerradura solo se pinta en el estado sin código cuando la acción llegó a responder. Inicialmente no se conoce, porque el contrato de props de la Task 3 es identificador más booleano"

patterns-established:
  - "Al comentar por qué un literal prohibido NO está, se describe el motivo sin escribir ninguna de sus palabras: los guardarraíles trabajan por expresión regular sobre el código (§14.6 punto 2)"
  - "Un andamio de medición E2E se escribe, se corre, se lee y se borra en la misma tarea. El caso formal es de otro plan"

requirements-completed: []

coverage:
  - id: D1
    description: "revelarCodigoDeAcceso con el orden obligatorio y la proyección a dos campos"
    verification:
      - kind: other
        ref: "npm run ci:arch limpio (guardarraíles 7 y 8 incluidos) · npx tsc --noEmit limpio con el tipo de retorno declarado a mano · grep revalidatePath|revalidateTag en _actions.ts = 8 antes y 8 después · grep -i console\\. = 0 antes y 0 después"
        status: pass
      - kind: e2e
        ref: "Andamio: la carga de la respuesta de la acción, leída de la red, es literalmente `{\"ok\":true,\"codigo\":\"A9Z7Q1X3\",\"tipoCerradura\":\"inteligente\"}`. Sin la credencial del calendario y sin las notas"
        status: pass
    human_judgment: false
  - id: D2
    description: "El componente con los cinco estados, y las seis prohibiciones por grep"
    verification:
      - kind: other
        ref: "grep -ciE 'localStorage|sessionStorage|indexedDB|caches\\.' = 0 · 'setTimeout\\(.*ocultar|EyeOff' = 0 · 'queda registrado|auditor|bitácora' = 0 · 'toast|sonner' = 0 · los dos literales de §15.2 presentes, uno cada uno · 341 líneas"
        status: pass
      - kind: e2e
        ref: "Andamio: pulsar Mostrar trae el código; Copiar el código anuncia `Copiado.`; sin código la fila no ofrece botón"
        status: pass
    human_judgment: true
    rationale: "Que el botón no salte de ancho al entrar en vuelo, que la caja del código se lea derecha dentro de una fila de 480px y que la alerta de error no desborde la columna del valor son juicios de pantalla. Los cubren 08-12 (barrido visual) y 08-13 (accesibilidad)"
  - id: D3
    description: "La fila montada, y el secreto fuera del documento, medido ejecutando"
    verification:
      - kind: e2e
        ref: "Andamio, contra page.content() y no contra lo visible: con el panel abierto y sin pulsar, el documento NO contiene el código, ni el secreto de la URL del calendario, ni la URL entera. Tras cerrar con Escape, tampoco"
        status: pass
      - kind: e2e
        ref: "npx playwright test e2e/calendario.spec.ts → 21/21 en verde, T-02-74 incluido. e2e/apartamentos-lista.spec.ts → 13/14, con el único rojo en la línea 376, que es el declarado de 08-06"
        status: pass
      - kind: other
        ref: "npm run build limpio · git diff --name-only de los cuatro commits: cero archivos bajo app/(cleaner)"
        status: pass
    human_judgment: false
  - id: D4
    description: "El destino de §5.4, el huérfano que el orquestador asignó a este plan"
    verification:
      - kind: e2e
        ref: "Medido en la navegación real del andamio y en el fallo de apartamento-crud.spec.ts:149, que registra `navigated to http://127.0.0.1:3210/apartamentos?apartamento=9f751840-…` mientras esperaba la forma vieja"
        status: pass
      - kind: other
        ref: "grep -c 'apartamento=' en _actions.ts: 0 antes, 1 después (el párrafo que documenta el destino donde se devuelve el id)"
        status: pass
    human_judgment: false

duration: 95min
completed: 2026-09-17
status: complete
---

# Fase 8 Plan 09: El código de acceso se revela con un gesto

**El código de la cerradura deja de poder viajar en un enlace pegado en un chat, y la credencial que abre la ocupación del apartamento sin autenticarse no se cuela por la puerta de al lado: la respuesta de la acción son dos campos y está medida en la red.**

## Performance

- **Duración:** ~95 min
- **Tareas:** 3, las tres del plan, más el encargo extra del orquestador
- **Archivos:** 1 creado, 3 modificados, 0 borrados
- **Consultas del panel:** de 1 a 2, y la segunda devuelve un booleano

## Lo que quedó hecho

- **El código no está en el documento hasta que alguien lo pide.** Medido contra `page.content()` y no contra lo que se ve en pantalla, que es la distinción que importa: lo que se pasa como prop a un componente de cliente viaja en la carga de React y queda en el documento aunque no se pinte. Es el patrón exacto del precedente de la página de conexión de calendario (T-02-74), sobre esta misma tabla.
- **El Hallazgo 7 está medido en las dos direcciones, no supuesto.** La carga de la respuesta de la acción, leída de la red y no del estado del componente, es literalmente:

  ```
  1:{"ok":true,"codigo":"A9Z7Q1X3","tipoCerradura":"inteligente"}
  ```

  Dos campos. Sin la credencial del calendario, sin las notas de acceso. `return secretos` habría compilado y las habría entregado las dos.

- **La interfaz no promete una auditoría que no existe.** La línea que el componente hermano del árbol del aseador sí escribe no se copió, y el archivo explica por qué sin escribir ninguna de sus palabras: allá esa frase es verdad porque el camino escribe una fila de huella en la misma transacción; acá el camino es la guarda más el cliente administrativo y no deja rastro de ninguna clase. §17.6 lo deja como deuda del contrato.
- **Y el huérfano de la fase quedó cerrado.** Al guardar un apartamento nuevo se aterriza en `/apartamentos?apartamento={id}`, la lista con su panel abierto. El comentario del índice único del nombre se conservó, adaptado: esa razón no cambió, lo que cambió es el destino.

## Commits

1. **Task 1: la acción, con su orden y su proyección** — `bf94bb4` (feat)
2. **Encargo extra: el destino de §5.4** — `29372fb` (feat)
3. **Task 2: el componente y sus cinco estados** — `42d2446` (feat)
4. **Task 3: la fila montada, y la medición** — `a685f9a` (feat)

## Archivos

| Archivo | Qué hace |
|---|---|
| `app/(admin)/apartamentos/_actions.ts` | `revelarCodigoDeAcceso` (guarda → Zod → lectura delegada → proyección a dos campos) y `hayCodigoDeAcceso` (el booleano). Más el párrafo que documenta el destino de §5.4 donde se devuelve el `id` |
| `app/(admin)/apartamentos/_components/CodigoDeAccesoAdmin.tsx` | Los cinco estados de §7.3, 341 líneas. Nuevo |
| `app/(admin)/apartamentos/_components/PanelApartamento.tsx` | La fila del código monta el componente; el booleano se resuelve junto al próximo aseo, en la misma espera |
| `app/(admin)/apartamentos/_components/FormularioApartamento.tsx` | El redirect de §5.4, que es donde de verdad vivía |

## La medición, con el método

**Andamio desechable**, `e2e/_andamio-08-09.spec.ts`, escrito, corrido, leído y **borrado en la misma tarea**. No queda en el árbol: el caso formal lo escribe `08-12` copiando el patrón de `calendario.spec.ts`. Sembró un apartamento gestionado con código `A9Z7Q1X3` y URL de calendario con el secreto `SECRETOICAL08091234567890`, y otro con `codigo_acceso` nulo y llave física.

| Qué se midió | Cómo | Resultado |
|---|---|---|
| El código no está antes de pulsar | `page.content()` sobre el documento entero, no `toBeVisible` | **No contiene** el código, ni el secreto del calendario, ni la URL entera |
| El código llega al pulsar | `getByRole('button', { name: 'Mostrar' })` y después el texto exacto | Visible |
| La credencial del calendario no viaja | `page.on('response')` sobre el POST de la acción, leyendo `response.text()` | 1 carga con el código, **0 con la credencial**, 0 con las notas |
| Muere con el desmontaje | `Escape` y `page.content()` otra vez | **No contiene** el código |
| Sin código, sin botón | conteo de botones `Mostrar` dentro del diálogo | 0 |

**Por qué la segunda fila se midió en la RED y no en el estado del componente:** el estado del componente solo guarda lo que el componente decidió guardar, así que una acción que devolviera cuatro credenciales y un componente que se quedara con una pasaría esa comprobación con la fuga intacta. La carga de la respuesta es el único sitio donde se ve lo que de verdad salió del servidor.

## Las cuatro suites

| Suite | Antes | Ahora |
|---|---|---|
| Unit | 1235 | **1235 en verde** |
| pgTAP | 380 | **380 en verde** |
| Integración | 205 | **205 en verde** |
| E2E | 132 · 1 saltado · 2 rojos | **ver abajo** |

Y los guardarraíles: `npm run ci:arch` limpio (los tres scripts), `npx tsc --noEmit` limpio, `npm run lint` con los dos avisos preexistentes de archivos de test que no se tocaron, `npm run build` limpio.

**`git diff --name-only` de los cuatro commits: cero archivos bajo `app/(cleaner)`.** La app del aseador no cambió.

## ⚠️ Los rojos nuevos que produjo el encargo extra, y AHORA SÍ EXISTEN

**Esto es lo que `08-11` tiene que venir a buscar.** `08-06` midió que los cuatro rojos que D8-11 contó **no aparecieron**, porque colgaban de un redirect que no era de nadie. Ese redirect ya está implementado, así que los cuatro rojos existen. **No los arreglé: son material de `08-11`.**

### Las cuatro aserciones de D8-11, con archivo y línea

| # | Archivo | Línea | Qué espera hoy | Qué pasa ahora |
|---|---|---|---|---|
| 1 | `e2e/apartamento-crud.spec.ts` | **149** | `waitForURL(/\/apartamentos\/[0-9a-f-]{36}$/)` | **ROJO, reproducido.** El log de Playwright dice `navigated to http://127.0.0.1:3210/apartamentos?apartamento=9f751840-160b-4eb4-ac16-dbe26bc56229` y el `waitForURL` agota los 30 s |
| 2 | `e2e/apartamento-crud.spec.ts` | **191** | igual | **ROJO por el mismo defecto**, pero *enmascarado*: no llega a correr. Ver la cascada |
| 3 | `e2e/apartamento-crud.spec.ts` | **285** | igual | **ROJO por el mismo defecto**, enmascarado igual |
| 4 | `e2e/apartamento-cuartos.spec.ts` | **146** | igual (dentro de un helper compartido) | **ROJO por el mismo defecto**, enmascarado igual |

Las cuatro pasan a esperar `/apartamentos?apartamento={uuid}`. §5.4 lo dice literal: **cambian de forma, no de fondo**, y las tres reglas innegociables siguen en pie (la persistencia se comprueba RECARGANDO, `idPorNombre()` resuelve contra la base, y no se debilita ninguna aserción de seguridad).

### La cascada, que es la parte que no estaba contada y que va a costar tiempo si nadie la avisa

El primer rojo **deja un apartamento huérfano en la base**, y eso envenena el resto de la suite. La secuencia, medida:

1. `apartamento-crud.spec.ts:149` se cuelga esperando la URL vieja. Como `idPorNombre()` está **después** del `waitForURL`, el id nunca entra en el arreglo `creados`.
2. El `afterAll` del archivo borra solo lo que hay en `creados`, así que el apartamento sobrevive, y su propio control de limpieza falla.
3. El `beforeAll` (que Playwright vuelve a correr al reciclar el worker en modo serie) revienta con **`La semilla cambió: 40 unidades, se esperaban 39.`** en `apartamento-crud.spec.ts:65`, y desde ahí **todo el resto del describe se salta**. Lo mismo en `apartamento-cuartos.spec.ts:68`.
4. Con los 40 en la base, en una corrida completa caen además, **por contaminación y no por defecto propio**: `apartamentos-lista.spec.ts:178` (*la tabla renderiza las 39 unidades*) y `operacion.spec.ts:256`.

**Comprobado que son contaminación y no regresión:** con `npm run db:reset` inmediatamente antes, `e2e/operacion.spec.ts` da **24/24 en verde** y `e2e/apartamentos-lista.spec.ts` deja **un solo rojo, el de la línea 376**, que es el declarado de `08-06`.

**Consejo operativo para `08-11`:** arreglar primero `apartamento-crud.spec.ts:149`. Los otros tres ni siquiera se pueden observar hasta que ese pase, porque el huérfano tumba el control de entorno del archivo. Y conviene mover `idPorNombre()` **antes** del `waitForURL`, o registrar el id en `creados` en cuanto la action responde: mientras la limpieza dependa de que la aserción de URL pase, cualquier rojo futuro de esa línea vuelve a contaminar la suite entera.

### Los dos rojos declarados, que siguen exactamente donde estaban

| Archivo | Línea | Estado |
|---|---|---|
| `e2e/apartamentos-lista.spec.ts` | 376 | **Rojo, sin tocar.** El `href` de la celda ya apunta a `?apartamento={id}`; la aserción todavía espera la forma vieja. Material de `08-11` |
| `e2e/finanzas.spec.ts` | 579 | **Rojo, sin tocar.** Material de `08-11` |

## Decisiones

**1. El fallo de la acción no trae mensaje, y es deliberado.** `leerSecretos()` colapsa a propósito tres desenlaces distintos en un solo `null` —el apartamento no existe, quien pregunta no es admin, o la base falló— y lo hace para no ser un oráculo de qué ids existen. Esa decisión ya estaba escrita y razonada en su cabecera.

La consecuencia es que en la acción nueva **no hay nada verdadero que decir más allá de "no"**. Inventar tres mensajes distintos desharía esa mitigación desde la puerta de al lado; devolver uno solo sería el copy de §15.2 escrito dos veces, una en el servidor y otra en el cliente. El copy vive en el componente, que es donde vive todo el copy de la fase, y es el mismo para los tres desenlaces.

Efecto lateral que conviene tener escrito: la regla de que **nunca se renderiza un texto crudo de Postgres** se cumple acá **por construcción y no por disciplina**. Ningún string de la base llega a cruzar, porque la lectura delegada ya se lo tragó antes. `mapDbError()` no aparece en esta acción porque no tiene nada que mapear.

**2. Se añadió `hayCodigoDeAcceso()`, que el plan no pedía.** El plan decía que la acción de la fase era una sola. Hace falta una segunda, y el motivo es que **sin ella el estado `Sin código` de §7.3 es inimplementable**: esa fila pinta la ausencia y **no lleva botón**, y para elegir entre ese estado y el oculto hay que saber si hay algo detrás **antes** de que nadie pulse. La lista de apartamentos no lee esa tabla, ni puede, porque no tiene grant para `authenticated`.

Se escribió como función aparte y no como una línea dentro del panel **a propósito**: así el objeto entero de credenciales nunca llega a ser una variable en el ámbito de un componente que se renderiza, que es exactamente donde `08-06` avisó que una línea de descuido lo manda al documento. Lo que cruza es un `boolean`.

**3. `CodigoDeAccesoAdmin` renderiza su propia `FilaDeDato`** en vez de ocupar el hueco `valor` que `08-06` dejó preparado. La razón es el estado de error: §7.3 exige que la alerta viva **dentro del grupo**, y el hueco de valor no la admite sin romper la lista de definición del grupo. Renderizando la fila entera, el componente puede poner la alerta bajo el valor dentro de la misma definición, que es HTML válido y sigue siendo "dentro del grupo". De paso, la etiqueta `Código de acceso` —que es copy de §15.2— se muda a la lista de constantes del componente, con el resto del copy.

**4. El redirect de §5.4 vive en `FormularioApartamento.tsx`, no en `_actions.ts`.** El plan y el encargo lo situaban en el archivo de acciones y **ahí no está**: `guardarApartamento` devuelve un resultado con el `id`, y quien navega es el formulario, en su línea 378. Redirigir es decisión de la pantalla, no de la escritura.

Lo que sí se hizo en `_actions.ts` es escribir, **donde se devuelve el `id`**, el párrafo que explica para qué se devuelve y dónde aterriza ahora. No es cosmético: sin esa nota, el `id` del retorno queda sin razón escrita y el siguiente lo quita. Y es lo que hace que `grep -c "apartamento="` sobre ese archivo pase de 0 a 1, que era el criterio del plan.

**5. El tipo de cerradura solo aparece en el estado sin código cuando la acción llegó a responder.** §7.3 dice que la fila `Sin código` muestra el `tipo_cerradura`. El contrato de props de la Task 3 es **identificador más booleano, nada más**, así que en el estado inicial ese dato no se conoce y la fila pinta la ausencia estándar (`—` más `sin definir` para el lector). Sí se pinta cuando el código desaparece entre que el panel se dibujó y el admin pulsó: ahí la acción devuelve `codigo: null` con su `tipoCerradura`, y la fila cae al estado de ausencia **con la etiqueta de cerradura debajo**, que es lo que explica por qué no hay código.

**Queda como hueco declarado** para `08-12` y `08-13`: en el camino inicial, el `tipo_cerradura` de §7.3 no se ve. Cerrarlo del todo exige una prop más, y esa prop contradice el criterio de aceptación del plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Funcionalidad crítica ausente] `hayCodigoDeAcceso()` no estaba en el plan**

- **Found during:** Task 2
- **Issue:** El plan exige que el componente reciba "si hay código o no" como booleano, pero ningún dato del panel lo sabe: `ApartamentoDeLista` no incluye nada de la tabla de secretos, y esa tabla no tiene grant para `authenticated`. Sin esa función, el estado `Sin código` de §7.3 no se puede implementar.
- **Fix:** Segunda función exportada en `_actions.ts`, que delega en la misma lectura y proyecta a un `boolean`.
- **Files modified:** `app/(admin)/apartamentos/_actions.ts`, `app/(admin)/apartamentos/_components/PanelApartamento.tsx`
- **Commit:** `bf94bb4` y `a685f9a`

**2. [Rule 3 - Bloqueante] El archivo del redirect no era el que decía el plan**

- **Found during:** Task 1 (c)
- **Issue:** El plan y el encargo del orquestador situaban el redirect de §5.4 en `app/(admin)/apartamentos/_actions.ts`. La única navegación tras crear vive en `FormularioApartamento.tsx:378`, que **no está** en los `files_modified` del plan.
- **Fix:** Se cambió donde de verdad está, y en `_actions.ts` se escribió la nota que documenta el destino junto al `id` que lo alimenta.
- **Files modified:** `app/(admin)/apartamentos/_components/FormularioApartamento.tsx`
- **Commit:** `29372fb`

**3. [Rule 2 - Correctitud] El fallo de la acción sin mensaje**

- **Found during:** Task 1
- **Issue:** El plan pedía que los errores pasaran por `mapDbError()`. La lectura delegada se traga el error de base antes de devolver, así que no hay ningún error de base que mapear, y fabricar uno sería inventar información.
- **Fix:** El resultado de fallo es `{ ok: false }` sin payload, con su razón escrita. El copy de §15.2 vive en el componente.
- **Files modified:** `app/(admin)/apartamentos/_actions.ts`
- **Commit:** `bf94bb4`

### Auth gates

Ninguno.

## Known Stubs

Ninguno. Los cinco estados de §7.3 están implementados y los cinco se alcanzan con datos reales, salvo el matiz del `tipo_cerradura` en el camino inicial del estado sin código, que está contado en la decisión 5.

## Threat Flags

Ninguno. El plan cubre T-08-39 a T-08-44 y no introduce superficie nueva: la acción es de lectura, no hay endpoint nuevo, no hay cambio de schema y el único camino a la tabla de secretos sigue siendo la fábrica administrativa detrás de una guarda.

## Lo que esta plan le deja escrito a los que vienen

**A `08-10` (el panel de calendario).** La credencial del calendario **no puede cruzar al cliente**, y ahora hay dos precedentes en vez de uno: el de la página de conexión y esta acción. Si el panel de calendario necesita algo de esa credencial, lo que cruza es su forma enmascarada o un booleano, nunca el valor. §8.2 lo prohíbe explícitamente.

**A `08-11` (las mediciones y los E2E).** Toda la sección de rojos de arriba. En una frase: **arreglar `apartamento-crud.spec.ts:149` primero**, porque los otros tres están enmascarados por el huérfano que ese rojo deja en la base, y de paso mover el registro del id antes del `waitForURL` para que un rojo futuro no vuelva a contaminar la suite.

**A `08-12` (el barrido visual).** El caso formal de "el secreto no está en el documento" está listo para copiarse del patrón de `calendario.spec.ts:468`. Se comprueba con `expect(await page.content()).not.toContain(CODIGO)`, **no con `toBeVisible`**: el código podría estar en el documento y oculto por CSS, y esa comprobación pasaría. Y conviene añadir la otra mitad, que es la que nadie escribe: leer la carga de la respuesta de la acción y comprobar que la credencial del calendario no está ahí.

**A `08-13` (accesibilidad).** Tres cosas de este componente piden ojo: la región que anuncia el código al revelarse, la que confirma la copia, y que el código **no** se marca como campo de contraseña y **no** lleva `aria-hidden` a propósito, porque hay que poder dictarlo por teléfono.

**A `08-14` (la puerta de la fase).** La deuda 6 de §17 sigue viva y este plan no la cierra: **el código de acceso del admin no deja rastro**. Revelarlo con un gesto reduce la exposición, no crea constancia. El día que haga falta, es un procedimiento nuevo en la base, y solo entonces se podrá escribir la línea de transparencia que §7.3 hoy prohíbe por falsa.

## Self-Check: PASSED

**Archivos declarados, comprobados en disco:**

- `app/(admin)/apartamentos/_components/CodigoDeAccesoAdmin.tsx` — FOUND (341 líneas)
- `app/(admin)/apartamentos/_actions.ts` — FOUND
- `app/(admin)/apartamentos/_components/PanelApartamento.tsx` — FOUND
- `app/(admin)/apartamentos/_components/FormularioApartamento.tsx` — FOUND

**Commits declarados, comprobados en `git log`:**

- `bf94bb4` — FOUND
- `29372fb` — FOUND
- `42d2446` — FOUND
- `a685f9a` — FOUND

**Archivo borrado a propósito:** `e2e/_andamio-08-09.spec.ts` — NO EXISTE, que es lo correcto.
