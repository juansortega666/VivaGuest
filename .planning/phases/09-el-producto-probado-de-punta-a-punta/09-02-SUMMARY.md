---
phase: 09-el-producto-probado-de-punta-a-punta
plan: 02
subsystem: testing
tags: [playwright, e2e, sonner, toasts, alertas, reloj, flake, linea-base]

requires:
  - phase: 04-operaci-n-del-admin
    provides: "`/operacion` con su panel de alertas, `esperarToast()` y el flujo encadenado del criterio 3"
  - phase: 08-paneles-laterales-en-el-admin
    provides: "las tres mediciones de `operacion.spec.ts:390`, la medición de las 00:21 de `operacion-alertas.spec.ts:341` y la entrada de `push-instalacion.spec.ts:215`"
provides:
  - "El orden de las siete alertas DERIVADO de los instantes sembrados: el caso da lo mismo a las 00:21 que a las 14:00"
  - "La causa medida del rojo del toast, escrita en la cabecera de `esperarToast()`: NO es la pila de sonner, y el arreglo prescrito es un no-op estructural"
  - "La línea base nueva de la suite E2E: 159 casos colectados, 158 verdes, 1 saltado, 0 rojos en dos corridas completas con la base reseteada"
  - "Dos rojos declarados con dueño, uno de ellos con un defecto de PRODUCTO nombrado y reproducible"
affects: [09-03, 09-04, 09-05, 09-07]

actuals:
  tokens: 2607
  tasks: 3
  commits: 3
plan_head_before: 4560cec62bd0614c1c10322b248922adbf28e739

tech-stack:
  added: []
  patterns:
    - "La expectativa de un orden se DERIVA de los instantes sembrados, nunca se escribe a mano: una lista literal codifica un supuesto sobre el reloj y se cae a la hora que ese supuesto deja de valer"
    - "La derivación se hace con aritmética propia del caso, jamás llamando a la función de dominio que se está midiendo: eso la vuelve tautológica"
    - "Los instantes que el caso no fija con un número propio se RELEEN de la base, que es de donde el producto los lee"
    - "Una ventana de reloj se reproduce sembrando el dato del lado malo, no esperando a que el reloj llegue ahí"
    - "Un rojo intermitente se mide antes de arreglarse: la causa escrita por otra fase es una hipótesis, no un dato"

key-files:
  created: []
  modified:
    - e2e/operacion.spec.ts
    - e2e/operacion-alertas.spec.ts

key-decisions:
  - "La causa que el `deferred-items.md` de la Fase 8 le atribuía al rojo del toast (la pila de sonner llena) NO se sostiene, y el arreglo prescrito (drenar la pila en el `beforeEach`) es un no-op ESTRUCTURAL: `paginaAdmin` es un fixture de ámbito de test, así que cada caso abre un contexto y una página nuevos y nunca hay un toast anterior que drenar."
  - "El rojo del toast es un defecto DE PRODUCTO, no de instrumento. Se declara con dueño y no se toca la aserción: ninguna de las tres salidas baratas (subir el timeout, quitar el `exact`, afirmar sobre la fila) arregla nada y todas rompen el criterio 5."
  - "No se marca `test.fail()` en el caso del toast, y es la misma excepción que el plan reserva para el rojo de push: es intermitente al ~32 %, así que un `test.fail()` se pondría rojo las dos de cada tres veces que hoy pasa."
  - "El orden esperado de las alertas se deriva de los instantes sembrados (opción a del plan) y no del desfase compensado (opción b): quita la suposición en vez de compensarla, y los tres instantes que hacían falta sí eran observables desde el caso."
  - "La hora límite sembrada pasa de `00:01` a `00:00`. Con `00:01` quedaba una ventana de sesenta segundos al día, justo después de medianoche, en la que la alerta todavía no ha vencido y el panel enseña seis filas en vez de siete."
  - "`e2e/fixtures.ts` NO se tocó pese a que `fijarSaludDeSync()` es la mitad del problema: el plan cierra el diff a dos archivos. La marca que esa función escribe se RELEE de la base, que además es más fiel que recalcularla."

patterns-established:
  - "Contra-prueba de una dependencia de reloj: sembrar el dato en la ventana mala y comprobar el verde, y después repetir con la expectativa vieja para ver el rojo con su diff literal"
  - "Andamio de diagnóstico con `MutationObserver` sobre `document.body` instalado ANTES de la acción, para distinguir «apareció y se fue» de «nunca existió»"
  - "Un andamio de diagnóstico necesita su CONTROL en verde: sin comprobar que el observador registra cuando sí pasa, un registro vacío no prueba nada"

requirements-completed: []

coverage:
  - id: E1
    description: "El caso del orden de alertas da lo mismo a cualquier hora del día"
    verification:
      - kind: e2e
        ref: "e2e/operacion-alertas.spec.ts#las primeras cinco filas salen en orden cronológico y no agrupadas por tipo, con la caída del calendario sembrada en la ventana mala"
        status: pass
    human_judgment: false
  - id: E2
    description: "El caso del orden sigue siendo capaz de ponerse rojo si el producto ordena por tipo"
    verification:
      - kind: other
        ref: "señuelo en lib/domain/alertas.ts: sort por `clave` en vez de por `ocurrioEnMs` → rojo con las siete en orden alfabético de tipo"
        status: pass
    human_judgment: false
  - id: E3
    description: "Ninguna aserción de los dos archivos se debilitó"
    verification:
      - kind: other
        ref: "auditoría de greps y diff línea a línea, sección «La auditoría de no debilitamiento»"
        status: pass
    human_judgment: false
  - id: E4
    description: "El rojo del toast tiene causa medida y dueño, y no está tapado"
    verification:
      - kind: other
        ref: "22 corridas con el árbol intacto, 7 en rojo; MutationObserver con cero inserciones y su control en verde; DEUDA DECLARADA D-09-02-A"
        status: pass
    human_judgment: false

duration: 75min
completed: 2026-09-18
status: complete
---

# Fase 9 Plan 02: Los dos rojos del instrumento — Summary

**De los tres rojos intermitentes, uno queda arreglado de verdad (el del orden de alertas, que ya no depende de la hora a la que se corra la suite y lo demuestra reproduciendo la ventana mala sin esperar a la medianoche) y otro resultó no ser del instrumento: la causa que la Fase 8 le atribuía al rojo del toast está medida como falsa, el arreglo prescrito es un no-op estructural, y lo que hay debajo es un defecto de producto que se declara con dueño en vez de taparse.**

## Performance

- **Duration:** ~75 min
- **Completed:** 2026-09-18
- **Tasks:** 3 de 3
- **Files modified:** 2, los dos bajo `e2e/`. Cero archivos de producto en el diff.

## Task Commits

1. **Task 1: El toast que se pierde** — `edd191c` (docs, solo comentario)
2. **Task 2: El orden de alertas que se invierte** — `343cf87` (test)
3. **Task 3: La línea base nueva** — sin commit de código: su salida es este SUMMARY

---

## Task 1 — El rojo del toast NO era la pila, y está medido

### Lo que decía la hipótesis heredada

El `deferred-items.md` de la Fase 8 escribe la causa así: *«la librería deja de renderizar nuevos con más de tres apilados»*, y el arreglo así: *«que el `beforeEach` limpie la pila de toasts, igual que ya limpia los aseos y las alertas»*. El plan 09-02 la adoptó, y con razón: era la única causa escrita.

**Está medida como falsa, y en dos niveles.**

### 1. El arreglo prescrito es un no-op ESTRUCTURAL, no «no funcionó»

`paginaAdmin` es un fixture de **ámbito de test** (`e2e/fixtures.ts`, `base.extend`): cada caso abre un `browser.newContext()` y una `newPage()` nuevos, y los cierra al terminar. **No existe ningún toast del caso anterior que drenar.** Un drenaje en el `beforeEach` limpiaría una página que todavía no ha navegado; uno después de la primera navegación limpiaría una página recién abierta. En los dos sitios el drenaje encuentra cero.

### 2. En el instante del rojo el DOM tiene CERO toasts, no tres

Volcado del andamio, en el instante exacto del fallo:

```json
{
  "buscado": "El aseo quedó cancelado.",
  "total": 0,
  "enLista": 0,
  "textos": [],
  "haToaster": 0,
  "dialogos": 0,
  "alertdialogos": 0,
  "url": "http://127.0.0.1:3210/operacion",
  "filas": [{ "state": "cancelada", "confirmado_at": "2026-09-18T16:24:53.774+00:00" }],
  "vigilia": []
}
```

Tres cosas que este volcado fija:

- **`total: 0` y `haToaster: 0`.** No es que el toast esté tapado por otros tres: es que no hay ninguno, ni siquiera el contenedor.
- **`vigilia: []`.** Un `MutationObserver` instalado sobre `document.body` **antes del clic** registra **cero** inserciones de `[data-sonner-toast]` en los 15 s enteros. No es «apareció y se fue»: nunca existió.
- **`filas[0].state = "cancelada"`.** La cadena de producto funcionó: la RPC escribió y el diálogo se cerró (`dialogos: 0`, `alertdialogos: 0`).

Y una cuarta, lateral pero decisiva: **el array `window.__vigilia` sobrevivió al fallo**. Si hubiera habido una recarga de página (por ejemplo un POST nativo del formulario), la variable no estaría y el volcado diría `sin vigilante`. Dice `[]`. **No hubo navegación.**

### El control del andamio, sin el cual un registro vacío no prueba nada

```
ANDAMIO CONTROL (verde) >>> El aseo quedó cancelado.
  [{"ms":520,"que":"ALTA toaster","texto":"El aseo quedó cancelado."}]
```

El mismo observador, en una corrida verde, registra el alta a los **520 ms** con el texto exacto. O sea que el observador funciona y el `[]` del rojo es un dato, no un fallo del instrumento de medida.

### El reparto de las corridas

| Brazo | Corridas | Rojas | Tasa |
|---|---|---|---|
| Árbol intacto (`--grep-invert "CRITERIO"`) | **22** | **7** | ~32 % |
| Con tres escrituras síncronas metidas entre `toast.success()` y el cierre del diálogo | **8** | **0** | 0 % |

El segundo brazo es **sugerente, no concluyente** (Fisher exacto ≈ 0,08 contra el primero), y se anota como lo que es: una pista de que la ventana es de microsegundos, no una demostración.

**Y el rojo no vive en `:390`.** En 7 corridas rojas cayó unas veces en `:390` (el toast de cancelar) y otras en el paso **(d)** del encadenado (`El aseo quedó para el dom, 20 de septiembre.`). Son los **dos diálogos que monta `MenuAseo`**, y los dos comparten forma exacta:

```ts
if (estado.ok) {
  toast.success(estado.mensaje);   // publica el toast
  onAbiertoChange(false);          // cierra, y el cierre dispara…
  return;
}
// …alCambiarApertura → router.refresh()   en el mismo tick
```

Eso también explica por qué la primera medición de 08-13 (`--grep "cancelar un aseo" --repeat-each=3`) salía siempre verde: corriendo ese caso solo, la ventana es otra.

### Qué se hizo, entonces

**Escribir la medición en la cabecera de `esperarToast()`, y nada más.** El diff de `e2e/operacion.spec.ts` es **solo comentario** (comprobado: cero líneas de código cambiadas). El comentario nombra la causa medida, nombra por qué el arreglo obvio no sirve, y **prohíbe por nombre** las cuatro salidas baratas: subir el timeout, quitar el `exact: true`, cambiar la aserción por una sobre la fila, y marcar `test.fail()`.

**La aserción no se tocó.** Sigue siendo `getByText(texto, { exact: true })` sobre `[data-sonner-toast]`.

### La contra-prueba del plan, sustituida por algo más caro

El plan pedía cinco corridas (tres del archivo filtrado más dos del archivo entero). Como el arreglo no existe, esas cinco no medirían nada. Lo que se corrió en su lugar son las **22 corridas del brazo intacto más 8 del brazo con andamio**, que es lo que permite dar la tasa y el reparto entre los dos casos.

---

## Task 2 — El orden de alertas ya no depende de la hora

### La causa, confirmada y afinada

El caso comparaba la secuencia de las siete contra una lista escrita a mano que daba por sentado que `HORA LÍMITE VENCIDA` es siempre la más antigua. Los instantes que ordenan a las dos protagonistas:

| Alerta | Instante que la ordena | Valor real |
|---|---|---|
| `HORA LÍMITE VENCIDA` | el vencimiento del aseo | hoy a las 00:01 |
| `CALENDARIO CAÍDO` | `max(last_success_at)` **más el umbral** | `ahora − 4 h + 3 h` = `ahora − 1 h` |

El `deferred-items.md` sitúa el cruce en las **04:01**; leyendo `lib/domain/alertas.ts:611-613`, el instante de la caída no es la marca sino **la marca más `UMBRAL_SYNC_CAIDA_MS`**, así que el cruce real está en la **01:01**. La ventana mala es de una hora al día, no de cuatro. La dirección del defecto y el diff que produce son los mismos.

### El arreglo: la vía (a) del plan, derivar

El orden esperado sale ahora de los instantes que el propio caso siembra. Los dos que el caso no fija con un número propio **se releen de la base**, que es de donde el producto los lee:

| Alerta | De dónde sale el instante esperado |
|---|---|
| `URGENTE` | `cleanings.created_at`, releído por id (lo pone Postgres, no el reloj de Node) |
| las cuatro persistidas | los desfases en minutos que el caso ya fijaba |
| `CALENDARIO CAÍDO` | `max(last_success_at)` de los feeds activos, releído con la misma consulta que `leerUltimoExitoDeSync()`, más `UMBRAL_SYNC_CAIDA_MS` |
| `HORA LÍMITE VENCIDA` | `Date.parse(`${fechas.hoy}T00:00:00-05:00`)`, con `fechas.hoy` de `today_bog()` |

**No se llama a `venceEnMs()` ni a `alertasComputadas()`** para construir la expectativa: eso la volvería tautológica, porque compararía el producto consigo mismo. El desfase `-05:00` va literal porque Colombia es UTC−5 fijo y sin DST, que es un constraint del proyecto, y porque componer el instante con `new Date(fecha)` lo leería como medianoche UTC y lo correría al día anterior (el bug que `dates.ts` existe para no repetir).

Se añadió además una guarda: si dos de los siete instantes coincidieran, el orden dejaría de estar determinado por el dato y pasaría a depender del desempate. El caso lanza con el volcado de los siete instantes en vez de comparar.

### El cambio de `00:01` a `00:00`, que cierra el último agujero

Con `00:01` quedaban **sesenta segundos al día**, justo después de medianoche, en los que el vencimiento todavía no ha pasado, la alerta **no existe** y el panel enseña seis filas contra siete esperadas. A las `00:00` el vencimiento es el primer instante del día de negocio, así que ya pasó a cualquier hora a la que alguien corra la suite. Ningún caso del repo afirma la cadena `00:01` (comprobado con grep sobre `e2e/`).

### Lo que la aserción sigue siendo

`expect(etiquetas).toEqual(esperado)` sobre **la secuencia completa de las siete, en orden**, precedida de `toHaveCount(esperado.length)`. Las dos líneas están **intactas**. El comentario nuevo prohíbe por nombre los tres aflojamientos: comparar conjuntos, comparar un subconjunto y ordenar cualquiera de las dos listas por tipo antes de comparar.

### Las contra-pruebas, con su salida literal

**(1) La ventana mala, sin esperar a la medianoche.** Andamio desechable que refecha la caída del calendario por debajo del vencimiento, que es exactamente lo que pasa entre medianoche y la 01:01:

```
ANDAMIO ventana mala >>> last_success_at = 2026-09-18T01:00:00.000Z
  ✓  1 … comparten color, tamaño y tratamiento (2.7s)
  ✓  2 … con treinta alertas la cabecera dice 30 (641ms)
  ✓  3 … las primeras cinco filas salen en orden cronológico y no agrupadas por tipo (601ms)
  ✓  4 … marcar una alerta como atendida (1.4s)
  ✓  5 … las alertas computadas no ofrecen atender (613ms)
  ✓  6 … el filtro arranca en Todas (813ms)
  6 passed (30.1s)
```

**(2) La misma ventana con la expectativa vieja.** Control negativo, para ver que el caso sigue pudiendo ponerse rojo y que lo que estaba mal era la lista:

```
Error: expect(received).toEqual(expected) // deep equality
    "FALTANTES",
    "EXTENSIÓN MAL CREADA",
-   "CALENDARIO CAÍDO",
    "HORA LÍMITE VENCIDA",
+   "CALENDARIO CAÍDO",
```

**Es carácter por carácter el diff que 08-11 anotó el 2026-09-18 a las 00:21**, reproducido a las 15:40 sin tocar el reloj.

**(3) El señuelo de producto.** `lib/domain/alertas.ts`, el `sort` pasa de `b.ocurrioEnMs - a.ocurrioEnMs` a `a.clave.localeCompare(b.clave)`:

```
Error: expect(received).toEqual(expected) // deep equality
  Array [
-   "URGENTE",
-   "NO PUEDO",
+   "CALENDARIO CAÍDO",
    "DAÑO",
-   "FALTANTES",
    "EXTENSIÓN MAL CREADA",
-   "CALENDARIO CAÍDO",
+   "FALTANTES",
    "HORA LÍMITE VENCIDA",
+   "NO PUEDO",
+   "URGENTE",
  ]
```

Revertido, y los 6 casos del archivo vuelven al verde. **La aserción derivada sigue atrapando exactamente el defecto que existe para atrapar.**

---

## Task 3 — La línea base nueva, en números

### Las dos corridas completas, con la base reseteada

| Corrida | `db:reset` | Colectados | Verdes | Saltados | **Rojos** | Duración |
|---|---|---|---|---|---|---|
| 1 | sí | **159** | **158** | 1 | **0** | 3,3 min |
| 2 | sí | **159** | **158** | 1 | **0** | 3,4 min |

El saltado es `push-instalacion.spec.ts:287` (E4, *el clic en el aviso reusa la ventana abierta*), que se salta a propósito por no haber comando en el protocolo de DevTools. Es el mismo saltado que documenta la Fase 8.

**El conteo real es 159 con los 3 casos de 09-01 dentro, o sea 156 antes de la fase.** Confirma la nota de 09-01 y contradice los «160 casos» de `TESTING.md` y `09-CONTEXT.md`. **La reconciliación del inventario sigue siendo de 09-07.**

### Las otras tres suites y las compuertas

| Suite | Medido | Línea base | Veredicto |
|---|---|---|---|
| `npm run test:unit` | **1236 / 1236** en 65 archivos | 1236 | exacta |
| `npm run test:integration` | **205 / 205** en 23 archivos | 205 | exacta |
| `npm run db:test` (pgTAP) | **389 / 389** en 13 archivos | 389 | exacta |

```
npx tsc --noEmit   → sin salida
npm run lint       → 0 errores, 2 warnings PREEXISTENTES
                     (app/(admin)/operacion/_actions.test.ts:48, lib/domain/aseador.schema.test.ts:40)
npm run build      → OK
npm run ci:arch    → check-service-role OK · check-max-w-tallas OK · check-escala-movil OK
```

### La línea base que 09-07 tiene que usar para decidir si un rojo es regresión

> **159 casos colectados · 158 verdes · 1 saltado (E4) · 0 rojos** en dos corridas completas seguidas, con `npm run db:reset` delante de cada una y `PLAYWRIGHT_PORT=3210`.
>
> **Quedan DOS rojos conocidos, ninguno de los cuales apareció en esas dos corridas.** Los dos están declarados abajo. Un rojo que no sea uno de esos dos, en un archivo que esta fase toque, **es regresión**.

De tres rojos conocidos se pasa a dos, no a uno. El del orden de alertas está **cerrado de verdad**, con su contra-prueba en la ventana mala y su señuelo. El del toast **cambia de naturaleza**: deja de ser un flake sin causa y pasa a ser un defecto de producto con reproducción, tasa medida y dueño.

### La auditoría de no debilitamiento

Diff de los dos archivos revisado línea a línea contra la lista de aflojamientos prohibidos.

| Grep | Base (`4560cec`) | HEAD | Lectura |
|---|---|---|---|
| `exact: true` en `operacion.spec.ts` | 27 | **28** | sube (una mención en el comentario nuevo); **no baja** |
| `data-sonner-toast` en `operacion.spec.ts` | 3 | **4** | idem |
| `getByRole('alert')` en los dos archivos | 0 | **0** | no aumenta |
| `timeout: 15_000` / `timeout: 5_000` en `operacion.spec.ts` | 2 / 2 | **2 / 2** | **idénticos: ningún timeout subió** |
| cualquier `timeout` en `operacion-alertas.spec.ts` | 0 | **0** | idem |
| `toHaveCount` en los dos | 16 / 10 | **16 / 10** | idénticos |
| `arrayContaining` en `operacion-alertas.spec.ts` | 0 | **1** | **está en un comentario de PROHIBICIÓN**, línea 456, no en código |
| `new Set(etiquetas)` | 0 | **1** | idem, línea 455 |

Los tres puntos que el plan exige revisar:

1. **Ninguna aserción perdió su `exact`.** El conteo sube, no baja, y el diff de código de `operacion.spec.ts` está **vacío**: el archivo cambió solo en comentarios.
2. **Ninguna comparación de secuencia se volvió de conjunto.** `expect(etiquetas).toEqual(esperado)` y `toHaveCount(esperado.length)` están intactas en el diff. Lo único que cambia es de dónde sale `esperado`.
3. **Ningún timeout subió.** Los cuatro literales de `operacion.spec.ts` son los mismos y `operacion-alertas.spec.ts` no tiene ninguno.

### El alcance del diff

```
git diff --name-only 4560cec..HEAD
  → e2e/operacion-alertas.spec.ts
  → e2e/operacion.spec.ts

git diff --name-only 4560cec..HEAD -- . ':!.planning' \
    ':!e2e/operacion.spec.ts' ':!e2e/operacion-alertas.spec.ts'
  → vacío

git diff --name-only 6e45c8e..HEAD -- app lib components supabase
  → vacío        (cero producto desde el arranque de la fase)
```

**Nota sobre el criterio del plan.** El criterio escrito usa el rango `6e45c8e..HEAD` (arranque de la fase) excluyendo solo los dos archivos de este plan, y así **no puede dar vacío**: 09-01 creó `e2e/recorrido.fixtures.ts` y `e2e/recorrido-core.spec.ts` dentro de ese rango. La medida correcta para el alcance de **este** plan es desde su propio ledger, `4560cec`, y da vacío. Se añade arriba la medida desde el arranque de la fase acotada a producto, que es la garantía que el criterio quería dar.

---

## Deviations from Plan

Ninguna de producto: **cero archivos de producto en el diff**. Tres del propio plan, las tres por medición.

### 1. [Rule 1 · defecto medido] La causa heredada del rojo del toast es falsa, y el arreglo prescrito es un no-op

- **Encontrado durante:** Task 1, antes de escribir una línea.
- **Lo que el plan mandaba:** drenar la pila de toasts en el arranque de cada caso.
- **Por qué no se hizo:** `paginaAdmin` es un fixture de ámbito de test; no hay pila que drenar. Y el volcado del rojo da cero toasts en el DOM, no tres.
- **Qué se hizo en su lugar:** medir (30 corridas en dos brazos, andamio con `MutationObserver` y su control en verde), escribir la medición en la cabecera de `esperarToast()` y declarar el defecto con dueño.
- **Commit:** `edd191c`.

### 2. [Rule 4 · excepción razonada] No se marca `test.fail()`

- **Lo que el plan mandaba:** «*va a la política de defectos como regla 2, con la aserción marcada `test.fail()`*».
- **Por qué no:** es el mismo argumento que el propio plan escribe en su Task 3(c) para el rojo de push. El rojo del toast es intermitente al ~32 %: un `test.fail()` se pondría **rojo el 68 % de las corridas**, o sea quedaría igual de intermitente pero al revés, y además taparía una regresión real de la cadena de cancelar.
- **Qué se hizo:** declararlo en DEUDA DECLARADA, con reproducción y dueño.

### 3. [Instrumento] La hora límite sembrada pasa de `00:01` a `00:00`

- **Encontrado durante:** Task 2, comprobando que la derivación es determinista *a cualquier hora*.
- **Causa:** con `00:01` hay sesenta segundos al día en los que la alerta no ha vencido, el panel enseña seis filas y `toHaveCount(esperado.length)` cae. La derivación sola no cierra ese agujero.
- **Arreglo:** el vencimiento pasa a ser el primer instante del día de negocio. Ningún caso del repo afirma la cadena `00:01`.
- **Commit:** `343cf87`.

---

## DEUDA DECLARADA

Las dos van a la compuerta **09-07**, que es la dueña del `deferred-items.md` de la fase. Las dos están también en `.planning/WINDOWS.md`.

### D-09-02-A · El toast de éxito se pierde en el cliente, ~32 % de las veces · **DEFECTO DE PRODUCTO**

- **Síntoma literal:** `Error: expect(locator).toBeVisible() failed` · `Locator: locator('[data-sonner-toast]').getByText('El aseo quedó cancelado.', { exact: true })` · `Error: element(s) not found`, tras 15 s. Y la variante del encadenado, con `'El aseo quedó para el dom, 20 de septiembre.'`.
- **Dónde salta:** `e2e/operacion.spec.ts:390` (cancelar) **o** el paso (d) del encadenado en `:273`. Alterna entre los dos.
- **Reproducción:** `npm run db:reset && PLAYWRIGHT_PORT=3210 npx playwright test e2e/operacion.spec.ts --grep-invert "CRITERIO"`, repetido. **7 de 22 corridas en rojo el 2026-09-18.**
- **Causa medida:** el aviso nunca llega al DOM. `MutationObserver` sobre `document.body` instalado antes del clic: **cero** inserciones en 15 s (control en verde: alta a los 520 ms). Sin recarga de página (`window.__vigilia` sobrevive). Y la cadena de producto **sí funciona**: `state = 'cancelada'` escrito y diálogo cerrado.
- **Sospechoso nombrado:** la forma que comparten `app/(admin)/operacion/_components/DialogoCancelarAseo.tsx:134-139` y `app/(admin)/operacion/_components/DialogoReprogramar.tsx:131-136`, los dos que fallan y los dos montados por `MenuAseo.tsx`: `toast.success(estado.mensaje)` y acto seguido cerrar el diálogo, lo que dispara `router.refresh()` **en el mismo tick**. Sonner no le reproduce el backlog a un suscriptor nuevo, así que una publicación que caiga entre medias se pierde para siempre. Pista medida: meter tres escrituras síncronas entre las dos líneas dejó **8 de 8 corridas en verde** (sugerente, no concluyente: Fisher ≈ 0,08).
- **Impacto de producto, que es lo que lo saca de «flake»:** un admin que cancela o reprograma un aseo se queda **sin su confirmación una de cada tres veces**. La fila sí se actualiza, así que no pierde trabajo, pero el contrato de copy de UI-SPEC §15.3 dice que el aviso existe.
- **NO se marca `test.fail()`:** ver desviación 2.
- **Dueño propuesto:** un plan que pueda tocar `app/(admin)/operacion/_components/`. **No 09-07**, que es una puerta. El arreglo candidato es de una línea (aplazar el cierre del diálogo a un tick posterior a la publicación del toast, o aplazar el `router.refresh()`), y **necesita su propia medición**: 30 corridas del comando de reproducción, porque con una tasa del 32 % una corrida verde no demuestra nada.

### D-09-02-B · `push-instalacion.spec.ts:215` (caso E2), sin causa aislada

- **Síntoma literal:** `El service worker no mostró ninguna notificación` tras 15 s de sondeo, en `entregarPush()`.
- **No se tocó, a propósito.** Su medición **se contradice en las dos direcciones**:
  - `.planning/phases/08-paneles-laterales-en-el-admin/deferred-items.md`: **reproducible siempre** en la suite completa (dos de dos corridas), **nunca** corriendo el archivo solo ni las cinco suites del aseador juntas.
  - el quick `260918-h47`, citado por 09-02: **al revés**, fallando aislado y pasando en la completa.
- **Y hoy no apareció en ninguna de las dos corridas completas de este plan.** O sea que la contradicción es de tres direcciones, no de dos.
- **Sospecha anotada (de la Fase 8):** el `registrationId` que resuelve `registroDelWorker()`; tras muchas navegaciones el worker puede haberse reactivado con otro registro, y `ServiceWorker.deliverPushMessage` entregaría a un registro que la página ya no observa.
- **Por qué no se arregla a ciegas:** un arreglo sobre un rojo cuya medición se contradice es, por construcción, un aflojamiento sin saber de qué.
- **Dueño propuesto:** un plan de estabilidad de la suite que empiece por **volver a medirlo** con las tres formas de correrlo, varias veces cada una, antes de proponer nada.

---

## Issues Encountered

- **La causa escrita por otra fase es una hipótesis, no un dato.** Es la lección cara de este plan: el `deferred-items.md` de la Fase 8 traía causa **y** arreglo escritos, con tres mediciones detrás, y la causa estaba mal. Lo que la delató fue mirar el fixture (ámbito de test) antes de escribir el arreglo, y lo que la cerró fue el `MutationObserver` **con su control en verde**. Sin el control, un `vigilia: []` no habría probado nada.
- **El cruce de la ventana mala de las alertas está en la 01:01, no en las 04:01.** El `deferred-items.md` y `TESTING.md` dicen 04:01 porque leen el instante de la caída como `ahora − 4 h`, y `lib/domain/alertas.ts:611-613` le suma el umbral. **`TESTING.md` tiene esa cifra mal y su fila del rojo del toast ya no describe la causa real: las dos filas las hereda 09-07.**

## User Setup Required

Ninguna.

## Next Phase Readiness

- **Para 09-03, 09-04 y 09-05:** la línea base contra la que medir es **159 / 158 verdes / 1 saltado / 0 rojos**. Los dos rojos conocidos están arriba con su reproducción; cualquier otro es regresión.
- **Para 09-04**, que va a encadenar recorridos largos con toasts: **D-09-02-A la va a golpear**. Un recorrido que afirme un toast después de una acción de `MenuAseo` va a fallar una de cada tres veces, y no es del recorrido. Conviene que 09-04 lo sepa antes de escribir sus aserciones.
- **Para 09-07:** hereda cuatro cosas de aquí. Las dos entradas de DEUDA DECLARADA, la reconciliación del conteo (156 → 159 contra los «160» documentados, que ya venía de 09-01) y **dos filas de `TESTING.md` que quedaron desfasadas**: la del rojo del toast (su columna «causa medida» ya no es cierta) y la del rojo de alertas (cerrado, y su cifra de las 04:01 era 01:01).

---
*Phase: 09-el-producto-probado-de-punta-a-punta*
*Completed: 2026-09-18*
</content>
</invoke>

## Self-Check: PASSED

- `e2e/operacion.spec.ts` · `e2e/operacion-alertas.spec.ts` · `09-02-SUMMARY.md` · `.planning/WINDOWS.md` existen en disco.
- Los dos commits existen en el historial: `edd191c`, `343cf87`.
- `commits: 3` MEDIDO con `git rev-list --count 4560cec..HEAD`, no narrado: los dos de tarea mas el de metadatos.
