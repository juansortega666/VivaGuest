---
phase: 02-acceso-y-administraci-n-del-cat-logo
plan: 13
subsystem: formulario-de-apartamento
tags: [react-hook-form, useFieldArray, zod, base-ui, playwright, rls, persistencia]

# Dependency graph
requires:
  - phase: 02-03
    provides: "esquemaBorrador y esquemaActivar: los 12 campos y las puertas de activacion"
  - phase: 02-10
    provides: "leerApartamento con cuartos y faltantes, guardarApartamento, y la medicion de que property_rooms_etiqueta_uniq NO es parcial"
  - phase: 02-12
    provides: "FormularioApartamento con sus cuatro primeras secciones, BarraAccionesFormulario y PLAYWRIGHT_PORT"
provides:
  - "lib/domain/cuartos.schema.ts: esquemaCuartos, esquemaFaltantes y los dos esquemas del formulario completo"
  - "EditorCuartos y EditorFaltantes: la seccion 5 de UI-SPEC §8.1 (APTO-06, APTO-07)"
  - "listarTiposDeCuarto: el catalogo global de room_types, leido de la base"
  - "guardarCuartosYFaltantes: persistencia que preserva los ids de cuarto"
  - "e2e/apartamento-cuartos.spec.ts: 9 tests, incluida la trampa de la etiqueta reservada"
affects: [02-14, 02-15, fase-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "El issue de un duplicado se emite en el INDICE del elemento repetido, no en la raiz del array: es lo unico que hace que el error se pinte bajo la fila culpable"
    - "Una etiqueta que un UNIQUE no-parcial sigue reservando desde una fila inactiva se REUTILIZA reactivando esa fila, no se explica en un mensaje de error"
    - "Nada se borra en las colecciones hijas: lo quitado va a is_active=false, porque sus ids van a estar referenciados dos fases despues"
    - "La composicion de esquemas (base + colecciones) vive en lib/, no en el .tsx: vitest solo recoge lib/** y extender uno y olvidar el otro es invisible para tsc"
    - "En Playwright, esperar un toast de exito es esperar el toast del guardado ANTERIOR: las esperas de escritura van contra la base"

key-files:
  created:
    - lib/domain/cuartos.schema.ts
    - lib/domain/cuartos.schema.test.ts
    - app/(admin)/apartamentos/_components/EditorCuartos.tsx
    - app/(admin)/apartamentos/_components/EditorFaltantes.tsx
    - e2e/apartamento-cuartos.spec.ts
  modified:
    - lib/data/apartamentos.ts
    - app/(admin)/apartamentos/_actions.ts
    - app/(admin)/apartamentos/_components/FormularioApartamento.tsx
    - app/(admin)/apartamentos/_components/SeccionGestion.tsx
    - app/(admin)/apartamentos/[id]/page.tsx
    - app/(admin)/apartamentos/nuevo/page.tsx
    - app/globals.css

key-decisions:
  - "La trampa del UNIQUE no-parcial se resuelve REUTILIZANDO la fila inactiva, no validando contra ella ni explicando la colision: el admin recupera su cuarto con SU MISMO ID y el 23505 no llega a existir"
  - "Las filas quitadas se marcan is_active=false: los property_rooms.id van a estar referenciados por los checklists de la Fase 6 y recrearlos deja checklists huerfanos"
  - "guardarCuartosYFaltantes usa el cliente del USUARIO: las dos tablas tienen grant para authenticated y sus policies casan para el admin; el cliente de servicio seria privilegio gratis"
  - "esquemaFormularioBorrador/Activar se componen en lib/domain/ y tienen tests propios: extender uno y olvidar el otro deja el duplicado suelto en la mitad de los envios y tsc no dice nada"
  - "La UI compara etiquetas en minusculas aunque el indice de la base no lleve lower(): dos cuartos que solo difieren en mayusculas son un error de tipeo, no dos cuartos"
  - "append va con shouldFocus:false y el onBlur de register() queda neutralizado en las filas: con los dos por defecto, uno de cada dos Agregar no hacia nada"
  - "listarTiposDeCuarto NO filtra por activos porque room_types no tiene esa columna: filtrar daria 42703 y dejaria el Select vacio en todas las filas"

patterns-established:
  - "Toda espera de escritura en Playwright se hace con expect.poll contra la base, no contra el toast"
  - "Cada negativa de un array lleva su CONTROL de que el montaje SI tenia filas"
  - "Un comentario no afirma cobertura que no se haya medido: el senuelo que no se atrapa se declara"

requirements-completed: [APTO-06, APTO-07]

# Metrics
duration: 105min
completed: 2026-09-02
---

# Fase 02 Plan 13: Cuartos y faltantes, la quinta sección del formulario

**APTO-06 y APTO-07 con una persistencia que no le deja checklists huérfanos a la Fase 6. El hallazgo del plan no estaba en el enunciado: `useFieldArray` con `mode: 'onBlur'` y un resolver de esquema DESCARTABA EN SILENCIO uno de cada dos `Agregar`. El botón respondía, nada fallaba, y el admin creía haber añadido cuatro cuartos donde había dos.**

## Performance

- **Duración:** 105 min
- **Tareas:** 3 de 3, todas autónomas, ninguna pendiente
- **Commits:** 3
- **Archivos creados/modificados:** 12

## Task Commits

1. **Tarea 1: los dos esquemas y la unicidad en el cliente** — `c9f9073`
2. **Tarea 2: la sección 5 y su persistencia** — `34d2436`
3. **Tarea 3: el spec, y el arreglo del `append` que se perdía** — `94caa74`

---

## Puertas, con los números reales

Corridas de nuevo al cerrar, sobre el código final y sin señuelos:

| Puerta | Resultado | Antes de este plan |
|---|---|---|
| `npm run ci:arch` | **OK**, 8 guardarraíles | OK |
| `npx tsc --noEmit` | **limpio** (exit 0) | limpio |
| `npm run test:unit` | **252 tests**, 15 archivos | 232, 14 archivos |
| `npm run test:integration` | **41 tests**, 4 archivos | 41 |
| `npx playwright test` | **69 tests**, 9 archivos | 60, 8 archivos |
| `npm run build` | **OK** | OK |
| Semilla al cerrar | **39 / 8 clusters / 5 informativas / 0 activas** | igual |
| Restos del spec | **197 cuartos y 10 faltantes globales: exactamente los sembrados** | — |
| Perfiles del orquestador | **3, intactos** (Juan Ortega admin, Luz Ospina y María Restrepo aseadoras) | 3 |

Los 20 unitarios nuevos y los 9 de Playwright nuevos son de este plan.

---

## 1. El hallazgo del plan: uno de cada dos `Agregar` no hacía nada

No está en el enunciado y no lo habría encontrado ninguna revisión de código. Apareció como cinco tests en rojo que decían "el cuarto no persistió", y la causa estaba tres capas más arriba.

Medición directa, pulsando `Agregar cuarto` cuatro veces seguidas sobre el formulario vacío:

```
click 1 → 1 fila
click 2 → 1 fila      ← se perdió
click 3 → 2 filas
click 4 → 2 filas     ← se perdió
```

**Nada fallaba.** El botón respondía, no había error en consola, el `append` se ejecutaba. La fila simplemente no aparecía. Un admin cargando 39 apartamentos habría creído que su unidad de 5 cuartos tenía 3, y el síntoma habría llegado a la Fase 6 como un checklist incompleto.

### 1.1 Las dos causas, aisladas por medición

Se acotó con tres experimentos, no por lectura del código:

| Experimento | Resultado |
|---|---|
| Cuatro clics seguidos, todo por defecto | 1, 1, 2, 2 — **la mitad se pierde** |
| `append(..., { shouldFocus: false })` | 1, 2, 3, 4 — **ninguna se pierde** |
| Con `shouldFocus:false`, poner el foco a mano en una etiqueta y añadir | **1 fila donde debía haber 2** |
| Con `shouldFocus:false`, poner el foco en `Dirección` (fuera del array) y añadir | **2 filas, correcto** |
| Neutralizando el `onBlur` que instala `register()` en la fila | **2 filas, correcto** |

De ahí las dos causas que se suman:

1. **`append` focaliza la fila nueva por defecto.** Eso deja el cursor DENTRO del array, así que el clic siguiente en `Agregar` es a la vez un blur de una fila y un `append` — que es exactamente la combinación que se pierde. Se pasa `shouldFocus: false` y el foco se queda en el botón, que no es un campo registrado.
2. **Lo que dispara la pérdida es el manejador de blur que instala `register()`, no el blur del DOM.** El cuarto experimento lo acota: con el foco en un campo AJENO al array el blur ocurre igual y no se pierde nada, así que no es "el clic no llegó" ni una carrera genérica. Neutralizando ese manejador en las filas, las dos filas aparecen.

### 1.2 El precio, declarado

Los errores de las filas se pintan **al enviar**, no al salir de cada campo. Es lo que pide la sección 5 de §8.1 —el duplicado se bloquea en el cliente antes de enviar— y a partir del primer envío fallido la revalidación por cambio los va limpiando conforme se corrigen. **Perder una fila entera sin avisar es mucho peor que pintar su error un gesto más tarde**, y esa es la comparación que se hizo.

El test `cuatro pulsaciones de Agregar dan CUATRO filas` fija las dos mitades del bug: la secuencia de cuatro clics y el caso de pulsar dentro de una etiqueta sin escribir nada.

---

## 2. La trampa que el plan señalaba: el UNIQUE que no es parcial

El plan 02-10 la midió y la dejó escrita: **`property_rooms_etiqueta_uniq` es `unique (property_id, etiqueta)` a secas**, sin condición sobre la bandera de activación. Un cuarto desactivado sigue reservando su etiqueta aunque `leerApartamento` no lo devuelva y el formulario no lo pinte.

El enunciado ofrecía dos salidas: validar contra todos los cuartos incluidos los inactivos, o explicarle al admin dónde está la colisión.

**Se eligió una tercera, y es estrictamente mejor que las dos: reutilizar la fila.**

`guardarCuartosYFaltantes` lee TODAS las filas del apartamento —activas e inactivas—, y una fila entrante sin `id` que coincide en clave con una existente **no se inserta: se actualiza esa**. El admin que vuelve a escribir `Baño social` recupera su cuarto con **su mismo id**, reactivado y con el tipo nuevo aplicado.

Por qué es mejor que las otras dos:

- **Validar contra los inactivos** convierte una etiqueta que en pantalla está libre en un error que el admin no puede resolver desde esa pantalla: la fila que estorba no se ve y no hay forma de borrarla. Le estaríamos pidiendo que invente otro nombre para su baño.
- **Explicar la colisión** es la misma trampa con mejor redacción: sigue siendo un callejón sin salida, solo que ahora bien señalizado.
- **Reutilizar** hace que el 23505 no llegue a existir, y de paso **preserva el id**, que es exactamente lo que la Fase 6 necesita: los checklists de aseos ya generados van a referenciar `property_rooms.id`.

El test `re-añadir la etiqueta de un cuarto quitado REUTILIZA su fila, con su mismo id` es el que lo fija, y **la aserción sobre el id es la que separa "funciona" de "funciona por casualidad"**: una implementación que borrara y recreara pasaría todo lo demás.

### 2.1 El residuo, escrito porque no tiene arreglo barato

Si en el MISMO envío el admin renombra un cuarto para darle la etiqueta de otro que está quitando, el segundo se desactiva conservando su etiqueta —esa es la decisión de arriba— y el update del primero choca con el UNIQUE. Sale por `mapDbError` con `Ya existe un cuarto con esa etiqueta en este apartamento.`, que es cierto. Arreglarlo exigiría borrar la fila que se va, y eso es exactamente lo que deja checklists huérfanos. Queda declarado en el código.

### 2.2 Y el orden de las dos pasadas también está medido

Las filas se reclaman **por `id` primero y por clave después**. Al revés, renombrar una fila para darle la etiqueta que otra acaba de dejar libre haría que las dos reclamaran la misma fila existente, y un upsert con el mismo id dos veces revienta con `21000 ON CONFLICT DO UPDATE command cannot affect row a second time`.

---

## 3. Los señuelos: siete roturas, cinco atrapadas, dos declaradas

| # | Señuelo | `tsc` | Qué se puso rojo |
|---|---|---|---|
| A | El issue del duplicado se emite en la raíz del array, no en el índice | limpio | Unitarios: **5 failed** |
| B | La comparación de etiquetas deja de bajar a minúsculas y de recortar | limpio | Unitarios: **4 failed** |
| C | `esquemaFormularioActivar` se queda sin extender con las colecciones | limpio | Unitarios: **2 failed** |
| D | `key={indice}` en vez de `key={field.id}` | limpio | **NADA. 9 de 9 en verde** |
| E | Se quita la pasada de reutilización: siempre inserta | limpio | Playwright: **1 failed**, el test de la trampa |
| F | Las filas quitadas se BORRAN en vez de desactivarse | limpio | Playwright: **1 failed**, el mismo |
| G | El formulario valida con `esquemaBorrador`/`Activar` sin las colecciones | **6 errores** | `tsc` |

`tsc --noEmit` salió limpio con seis de los siete. Van cuarenta y un señuelos en siete planes.

### 3.1 El señuelo D no se atrapó, y eso se declara en vez de disimularse

`key={indice}` es lo que la documentación de `useFieldArray` prohíbe, y el spec estaba montado para atraparlo: dos cuartos con **tipo y etiqueta distintos**, quitando el **primero**. Se sustituyó la clave y **los 9 tests siguieron en verde**.

Con esta composición —un `Input` no controlado registrado por nombre más un `Controller` que se re-suscribe por nombre— el cambio no produce un síntoma observable desde Playwright. La clave se queda en `field.id` **por contrato, no porque haya una red debajo**, y así está escrito en la cabecera del componente y en la del spec. Un comentario que afirmara cobertura que no existe es peor que no tener el comentario: el siguiente que toque el archivo confiaría en una red que no está.

### 3.2 El señuelo G es el único que `tsc` sí ve

`esquemaBorrador` valida los 12 campos y nada más, y un `z.object` descarta las claves que no conoce. Si el formulario resolviera con él, los dos arrays pasarían sin mirar y el duplicado llegaría a la base como un 23505. Resulta que **`tsc` lo atrapa**, porque `parseado.data.cuartos` deja de existir en el tipo de salida. Es el único caso del plan con red de compilador, y conviene saber cuál es.

Aun así, la composición tiene sus dos tests propios en `lib/`: `tsc` la protege en el punto de USO, no en el punto de DEFINICIÓN. Extender uno de los dos esquemas y olvidar el otro compila perfectamente.

---

## 4. Los cinco tests que fallaron por el toast, y no por el código

Cinco tests del spec fallaron diciendo "no persistió". La Server Action estaba bien.

`Cambios guardados.` sigue en pantalla varios segundos **después del guardado anterior** —el que crea el borrador de prueba—, así que `expect(getByText('Cambios guardados.')).toBeVisible()` se cumplía **al instante**, antes de que la escritura saliera, y el `reload()` de la línea siguiente abortaba la petición en vuelo.

Es un falso NEGATIVO, que es el modo raro: el síntoma apuntaba a la capa equivocada durante dos corridas. Y el mismo patrón, con el signo cambiado, es un falso POSITIVO esperando: un test que afirmara "salió el toast de éxito" pasaría aunque el guardado no hubiera hecho nada.

El arreglo son dos helpers que **esperan contra la base**:

```ts
await botonGuardar(p).click();
await expect.poll(async () => (await cuartosEnBase(id)).filter((f) => f.is_active).length).toBe(n);
```

Es además una aserción de verdad: dice que se escribieron exactamente las filas esperadas, no solo que la pantalla dijo algo.

---

## 5. `room_types` no tiene columna de activación

El plan pide `listarTiposDeCuarto(supabase)` que traiga "los `room_types` activos". **Esa columna no existe.** `public.room_types` tiene cuatro: `id`, `slug`, `nombre` y `sort_order` (migración 03, confirmado en `lib/database.types.ts`). La bandera la tienen `checklist_tasks` y `property_rooms`, que son otras dos tablas.

Un `.eq('is_active', true)` ahí devuelve `42703 column does not exist`, y como `listarTiposDeCuarto` lanza el error hacia arriba, la página de edición entera se habría caído. En el mejor caso el `Select` de tipo saldría vacío en TODAS las filas y no se podría crear ni un cuarto.

Se ordena por `sort_order` con desempate por `nombre`: ese orden refleja el recorrido físico del apartamento (general primero, exterior último), que es el mismo orden en el que se pinta el checklist. El desempate no es cosmético: `sort_order` no es único en el schema, y sin él dos tipos que lo compartan cambiarían de orden entre dos cargas de la misma pantalla.

---

## 6. La aserción que impide que alguien apriete una puerta que no existe

`un apartamento gestionado completo SIN cuartos se puede activar`.

Ningún CHECK de `properties` exige cuartos y ningún REQ lo pide. Al ver la sección 5 vacía en un apartamento por lo demás completo, la tentación de añadir "Cuartos definidos" al bloque `Para activar falta:` es real — y bloquearía las 39 unidades del catálogo, que hoy solo tienen cuartos placeholder.

El test lleva **tres controles**, porque una aserción de "el botón está habilitado" es de las que pasan trivialmente:

1. **CONTROL negativo:** con el apartamento incompleto, el botón está **deshabilitado**. Sin esto, el `toBeEnabled` pasaría con un botón siempre habilitado.
2. **CONTROL del montaje:** el estado vacío de cuartos está visible Y la base tiene 0 cuartos. Sin esto, el test pasaría con un apartamento que sí tiene cuartos y no probaría nada.
3. **Ninguno de los 3 ítems del checklist menciona cuartos**, leído del propio bloque de la barra y no de toda la página: las filas del editor **también son `<li>` con botón dentro**, así que el localizador de 02-12 (`getByRole('listitem').filter({ has: button })`) habría casado con ellas y la aserción habría medido otra cosa.

El tercer punto corrigió además una aserción mía equivocada: el bloque `Para activar falta:` **no desaparece** cuando no falta nada, porque pinta también los requisitos cumplidos tachados. Lo que hay que comprobar es su contenido, no su ausencia.

---

## 7. Decisiones de forma que tienen razón

- **El cliente es el del USUARIO.** `property_rooms` y `missing_item_catalog` tienen grant para `authenticated` (migración 07) y sus policies `property_rooms_admin_all` y `mic_admin_all` casan para el admin. Construir el cliente administrativo sería saltarse la RLS para escribir lo que el llamador ya puede escribir. Para un aseador (T-02-67) hay dos capas: `exigirAdmin()` lo para primero, y si no lo parara, sus policies son de SELECT y el update afectaría 0 filas.
- **El tipo de cuarto arranca VACIO, no en el primero del catálogo.** Elegir el tipo decide qué tareas de checklist recibe ese cuarto; un default silencioso haría que la mayoría naciera como "General" sin que nadie lo decidiera.
- **Los faltantes se filtran por activos EN EL FORMULARIO, no en `leerApartamento`.** Esa función devuelve todos a propósito (el plan 02-10 lo dejó escrito) porque `mic_prop_uniq` tampoco excluye los inactivos. Quien reactiva es la Server Action; el formulario solo pinta las filas vivas. Sin el filtro, un faltante quitado ayer reaparece hoy como si nada.
- **UNA sección y no dos.** §8.1 enumera cinco secciones y la quinta es "Cuartos y faltantes". Las dos listas van bajo un solo heading con la regla de 1px, separadas por un sub-encabezado de 14/600. Dos `<Seccion>` habrían sido una sexta sección de hecho.
- **Un token nuevo, `--spacing-col-tipo-cuarto: 180px`.** §2 prohíbe el valor arbitrario y la columna del `Select` tiene que ser fija: elástica, las ocho filas de un apartamento no alinean sus etiquetas entre sí. 180px alojan el nombre más largo del catálogo (`Balcón / terraza`).
- **Los botones de quitar llevan el NUMERO de fila en su nombre accesible.** Ocho botones llamados igual no los distingue ni un lector de pantalla ni un `getByRole`. Y todo localizador va con `exact: true`: `Quitar el cuarto 1` es prefijo de `Quitar el cuarto 10`, y `Agregar cuarto` comparte prefijo con `Agregar faltante`.
- **Las etiquetas por fila son `sr-only` con encabezados de columna visibles una vez.** §13 exige `<label>` real ligado por `htmlFor` —nunca el placeholder como etiqueta— y repetir "Tipo" y "Etiqueta" ocho veces en pantalla convertiría la sección en ruido.
- **El error de la Server Action va a toast, aunque traiga `campo`.** `campoDeConstraint` traduce `property_rooms_etiqueta_uniq` a `etiqueta` y `mic_prop_uniq` a `nombre`, y ninguno es un campo de nivel superior del formulario: son una fila de un array y el error no dice cuál. Pintarlo bajo una fila elegida al azar sería peor que un toast.
- **El nombre del campo en `setError` es el PATH COMPLETO** (`cuartos.1.etiqueta`), no su primer segmento. Con `path[0]` todos los errores de las ocho filas se apilarían sobre `cuartos` y ninguna fila mostraría el suyo, que es justo lo que el issue por índice evita.

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Regla 3 - Bloqueante] El worktree venía con la base equivocada**

- **Encontrado durante:** el arranque. `git merge-base` devolvía `2a35c53`, no el commit base del plan.
- **Arreglo:** el `git reset --hard` que el propio chequeo de arranque contempla, con el árbol limpio. Es la sexta vez consecutiva (02-08 a 02-12 y este).
- **Archivos versionados:** ninguno.

**2. [Regla 1 - Bug] Uno de cada dos `Agregar` no hacía nada**

- **Encontrado durante:** Tarea 3, al correr el spec por primera vez. Detalle completo en §1.
- **Arreglo:** `shouldFocus: false` en los dos `append` y el `onBlur` de `register()` neutralizado en las filas de los dos editores, más el test de regresión que fija las dos mitades.
- **Archivos:** `EditorCuartos.tsx`, `EditorFaltantes.tsx`, `e2e/apartamento-cuartos.spec.ts`. **Commit:** `94caa74`.

**3. [Regla 3 - Bloqueante] `room_types` no tiene columna de activación**

- **Encontrado durante:** Tarea 2, al escribir `listarTiposDeCuarto`. El plan pide filtrar por activos y esa columna no existe. Detalle en §5.
- **Arreglo:** no se filtra, y la razón queda escrita en el propio archivo con la referencia a la migración.
- **Archivos:** `lib/data/apartamentos.ts`. **Commit:** `34d2436`.

**4. [Regla 1 - Bug] Mis propios tests esperaban el toast del guardado anterior**

- **Encontrado durante:** Tarea 3. Cinco tests en rojo culpando a la Server Action. Detalle en §4.
- **Arreglo:** dos helpers que esperan con `expect.poll` contra la base.
- **Archivos:** `e2e/apartamento-cuartos.spec.ts`. **Commit:** `94caa74`.

**5. [Regla 1 - Bug] Dos aserciones mías medían otra cosa**

- **Encontrado durante:** Tarea 3.
  - `Para activar falta:` **no desaparece** cuando no falta nada: pinta también los cumplidos, tachados. Se cambió a comprobar el contenido de los 3 ítems.
  - Tras añadir dos cuartos y quitar uno **sin haber guardado nunca**, no hay ninguna fila que desactivar: la quitada nunca llegó a la base. La aserción de "una inactiva" era falsa; la regla de desactivar en vez de borrar la mide el test de reutilización, que sí pasa por la base.
- **Archivos:** `e2e/apartamento-cuartos.spec.ts`. **Commit:** `94caa74`.

### Añadidos deliberados sobre el plan

**6. [Regla 2] La reutilización de la fila inactiva, en vez de validar contra ella**

El plan ofrecía dos salidas para la trampa del UNIQUE no-parcial y se tomó una tercera. Detalle y comparación en §2.

**7. [Regla 2] `esquemaFormularioBorrador` y `esquemaFormularioActivar` salen a `lib/domain/` con tests**

El plan no los nombra: compone los arrays en el componente. Ahí **ninguna suite los ejecuta** (`vitest.config.ts` recoge solo `lib/**`), y el fallo que esconden —extender uno y olvidar el otro— es invisible para `tsc` en el punto de definición. Señuelo C.

**8. [Regla 2] Topes de longitud (T-02-68)**

`.max()` en los dos arrays y en los dos textos. Un `useFieldArray` sin tope deja mandar un payload arbitrariamente grande a PostgREST desde un endpoint que solo pide ser admin.

**9. [Regla 2] Tests de más sobre lo que el plan pedía**

- El spec lleva **9** tests y no las 6 aserciones del plan: se añadieron el de regresión del `append` perdido, el de reutilización de la etiqueta reservada, y el CONTROL de que corregir el duplicado SI escribe las dos filas.
- `cuartos.schema.test.ts` lleva **20**, incluidos dos que atan los mensajes de duplicado a los que `mapDbError` devuelve para los mismos constraints: si divergen, el mismo problema se le cuenta al admin de dos formas según por dónde llegue.

### Desviaciones menores del texto del plan

**10. `guardarCuartosYFaltantes` se commiteó con la tarea 2, no con la 3**

La verificación de la tarea 2 es `npm run build`, y el formulario ya importa la acción: sin ella el build no pasa. La tarea 3 aportó el spec.

**11. `SeccionGestion.tsx` no está en `files_modified` y se tocó igual**

Su prop `form` estaba tipada como `UseFormReturn<ApartamentoInput>` y el formulario pasó a `FormularioInput`. Es un cambio de una línea sin el cual no compila.

**12. `app/globals.css` no está en `files_modified` y se tocó igual**

Un token nuevo, `--spacing-col-tipo-cuarto`. §2 prohíbe el valor arbitrario, así que la única forma de dar ancho fijo a la columna del `Select` es el `@theme`.

**13. La fila de `02-VALIDATION.md` que el plan cita no existe**

El plan manda leer "02-VALIDATION.md criterio 2, fila `Cuartos y faltantes con useFieldArray`". Ese archivo no menciona cuartos en ninguna línea. La fila está en `02-RESEARCH.md` §Validation Architecture (línea 1730), y dice exactamente lo que el plan atribuye: "Añadir 2 cuartos, quitar 1, guardar, recargar". Se siguió esa.

**14. Los errores de las filas se pintan al enviar, no al salir del campo**

Consecuencia de la corrección de §1.2, declarada y comparada.

---

## Threat Model: dispositions aplicadas

| Threat ID | Disposición | Cómo quedó |
|---|---|---|
| T-02-67 | mitigate | Dos capas, ninguna sobra. `exigirAdmin()` es la primera línea del cuerpo de `guardarCuartosYFaltantes`, antes de validar y antes de tocar la base. Detrás, `property_rooms_admin_all` y `mic_admin_all` son las únicas policies de escritura de esas tablas: para un aseador el update afectaría 0 filas aunque el guard cayera. El guardarraíl 7 de CI no aplica aquí porque esta función no construye el cliente administrativo, y no debe |
| T-02-68 | mitigate | `.max(100)` en cuartos y `.max(200)` en faltantes, más `.max(80)` y `.max(120)` en los dos textos. Los cuatro con su test, y cada uno con el CONTROL de que justo por debajo del tope sí pasa: sin ese control, el rechazo podría venir de que el generador produce filas inválidas |
| T-02-69 | mitigate | `z.uuid()` sobre `room_type_id` con su test y su CONTROL, y detrás la FK `references room_types (id) on delete restrict`. Un uuid con forma válida pero inexistente muere en la base con un 23503 que `mapDbError` traduce |
| T-02-70 | mitigate | **Nada se borra.** Lo quitado va a `is_active = false` y las filas se reutilizan por etiqueta conservando su `id`. Los señuelos E y F ponen rojo el test de la trampa, y la aserción que los atrapa es la del id, no la del conteo. La decisión y su razón —los checklists de la Fase 6— están escritas en el código, no solo aquí |
| T-02-71 | mitigate | **Este plan no crea ninguna función en `public`.** Todo va por PostgREST con el JWT del admin. La restricción y su precio medido (`alter default privileges` no puede quitarle `EXECUTE` a PUBLIC en PG 17.6) quedan escritos en la cabecera de `guardarCuartosYFaltantes`, que es donde un RPC atómico sería más tentador |

## Threat Flags

Ninguna superficie de seguridad nueva fuera del registro. Este plan añade **una Server Action** (dentro del route group `(admin)`, con su guard y con el cliente del usuario), **cero** endpoints de API, **cero** rutas de página y **cero** migraciones o cambios de schema.

## Known Stubs

**Ninguno.** Los dos editores renderizan sus filas, las dos colecciones persisten, y el ciclo añadir-quitar-guardar-recargar está medido contra la base.

Lo que este plan **no** construye, por contrato y no por omisión:

- **El reordenamiento de cuartos por arrastre.** `sort_order` se deriva del índice de la fila y se renumera al guardar; mover una fila arriba o abajo no está en el alcance de esta fase. Declarado en el código.
- **La edición de los faltantes GLOBALES** (`property_id is null`). Son la biblioteca compartida y tienen su propio índice parcial; esta pantalla solo toca los del apartamento, y el helper de 12px se lo dice al admin.
- **`/apartamentos/[id]/calendario`**, que es del plan **02-14**.

---

## Notas para los planes siguientes

- **Cualquier `useFieldArray` nuevo en este repo:** `append` va con `shouldFocus: false` y el `onBlur` de `register()` se neutraliza en las filas. Con los dos por defecto, la mitad de los añadidos se pierde EN SILENCIO. Medido en §1; el test de regresión está en `e2e/apartamento-cuartos.spec.ts`.
- **Cualquier spec de Playwright que escriba en la base:** no esperes un toast de éxito. El toast del guardado ANTERIOR sigue en pantalla y la aserción se cumple al instante. Usa `expect.poll` contra la base. Detalle en §4.
- **Fase 6 (checklists):** los `property_rooms.id` que este plan preserva son los que vas a referenciar. La regla es que esta pantalla NUNCA borra un cuarto: lo desactiva, y re-añadir su etiqueta reutiliza la fila con su id. Si algún día alguien "optimiza" eso a un `delete` + `insert`, el señuelo F documenta qué test se pone rojo.
- **Fase 6 (checklists), segunda parte:** un apartamento puede estar ACTIVO y no tener ni un cuarto. No es un estado imposible: está permitido a propósito y hay un test que lo fija. El generador de checklists tiene que decidir qué hace con esa unidad, y hoy las 39 sembradas solo tienen cuartos placeholder.
- **Cualquier localizador de Playwright sobre la barra de acciones:** el patrón `getByRole('listitem').filter({ has: button })` del plan 02-12 ahora casa TAMBIÉN con las filas del editor de cuartos. Hay que acotar al bloque de la barra.
- **`room_types` no tiene bandera de activación.** Si un plan futuro necesita retirar un tipo del catálogo, hace falta una migración; hoy no se puede desde la base sin borrar la fila, y `property_rooms.room_type_id` es `on delete restrict`.
- **Los 3 errores de lint de `e2e/fixtures.ts`** siguen ahí y siguen fuera de alcance: ítem 1 de `deferred-items.md`.
- **Bloqueante residual heredado:** sigue pendiente un `npx supabase stop && npx supabase start` al cierre de la fase para confirmar en frío que el `config.toml` commiteado reproduce el entorno.
- **El stack local quedó limpio.** Verificado al terminar: 39 apartamentos, 8 clusters, 5 informativas, **0 activas**, 197 cuartos y 10 faltantes globales —exactamente los sembrados—, 0 secretos, 0 aseos, y los **3 perfiles del orquestador intactos**. Ninguna siembra de este plan sobrevive.

## Self-Check: PASSED

Los 5 archivos declarados como creados y los 7 como modificados existen en disco, y los 3 hashes de commit (`c9f9073`, `34d2436`, `94caa74`) resuelven a objetos de tipo `commit` en el historial de la rama. El diff completo contra el commit base toca **12 archivos y borra cero**; ni `STATE.md` ni `ROADMAP.md` aparecen en él.
