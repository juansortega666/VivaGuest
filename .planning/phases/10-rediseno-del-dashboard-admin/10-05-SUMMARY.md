---
phase: 10-rediseno-del-dashboard-admin
plan: 05
subsystem: ui-operacion
status: checkpoint
tags: [rediseno, operacion, selector-dia, grid, campana, detalle-inline, alcance, playwright, contract, wave-4]

requires:
  - phase: 10-rediseno-del-dashboard-admin
    provides: "10-04: `rejilla-login` como patrón de reparto en una `@utility`, la disciplina de derogar por escrito en el mismo plan que cambia el código, y la trampa medida de la barra de ambiente de pruebas"
provides:
  - "`/operacion` rediseñada contra la estructura que el dueño describió el 2026-09-28: selector de día, vistazo de cuatro métricas sin cromo, dos columnas 30/70 y las alertas en una campana de la barra superior"
  - "`DetalleDelAseo.tsx`: el armazón INLINE del detalle, que sustituye al `Sheet` en esta pantalla y sólo en esta pantalla"
  - "`CuerpoDeAseo.tsx`: el cuerpo del panel extraído de `PanelAseo.tsx`, con sus cuatro grupos intactos (git lo detecta como RENAME)"
  - "`[data-slot=\"detalle-aseo\"]` como ámbito de TODO lo que se lea del detalle, con el control de alcance de 08-11 vuelto a correr en los dos sentidos"
  - "`10-UI-SPEC.md` §16: el contrato de diseño de `/operacion`, con sus nueve partes y las derogaciones fechadas de los contratos de las Fases 4, 5 y 8"
  - "`10-CONTEXT.md` y `.planning/ROADMAP.md` puestos de acuerdo con el código: la fase entrega DOS pantallas y sigue sin cerrar su objetivo"
affects:
  - "Queda el juicio humano de la Task 7, que es un checkpoint BLOQUEANTE y no se puede emitir desde acá"
  - "`.planning/codebase/TESTING.md` §1 sigue diciendo la regla vieja del portal sin matices. Punto 10 de `deferred-items.md`"

tech-stack:
  added: []   # cero dependencias nuevas, medido: package.json y package-lock.json fuera del diff contra a9d09c5
  patterns:
    - "Un panel que deja de estar portaleado NO simplifica el ámbito de sus aserciones: lo cambia de forma. El portal vaciaba el contenedor de página y daba verdes por vacuidad; inline, la lista de al lado pinta el mismo nombre y da verdes por accidente. El control que lo mide hay que volver a correrlo en los DOS sentidos, no razonarlo"
    - "Un señuelo que NO se pone rojo es un hallazgo, no un paso saltado: quitar el `scroll={false}` del enlace dejó el caso en verde, y la causa medida (el documento no scrollea a `xl`, así que el enrutador no tiene nada que recolocar) vale más que el rojo que se esperaba"
    - "Cuando un control se muda a un bloque que otra cosa SUSTITUYE, la pregunta no es dónde se ve mejor sino qué bloque no desaparece nunca: `Crear aseo` vuelve a la cabecera porque es el único que ni el detalle ni la lista reemplazan"
    - "Extraer un archivo es una operación que git puede verificar: si el commit muestra RENAME en vez de ADD + DELETE, el diff se puede leer como extracción y no como reescritura, y eso es una compuerta gratis contra una reescritura disfrazada"
    - "Un barrido de localizadores acotado a un solo spec deja fuera a los consumidores del mismo componente que viven en otros specs, y por eso el plan exige correr la suite COMPLETA y no sólo el spec propio"
    - "Una colisión de ámbito puede viajar por el TEXTO y no por el nombre accesible: el enlace de la tarjeta lleva `aria-label`, así que un localizador por rol y nombre NO colisiona y la medición hay que hacerla sobre el texto"

key-files:
  created:
    - "app/(admin)/operacion/_components/DetalleDelAseo.tsx"
    - "app/(admin)/operacion/_components/CuerpoDeAseo.tsx"
  modified:
    - "app/(admin)/operacion/page.tsx"
    - "e2e/operacion.spec.ts"
    - "e2e/recorrido-core.spec.ts"
    - ".planning/phases/10-rediseno-del-dashboard-admin/10-UI-SPEC.md"
    - ".planning/phases/10-rediseno-del-dashboard-admin/10-CONTEXT.md"
    - ".planning/phases/10-rediseno-del-dashboard-admin/deferred-items.md"
    - ".planning/ROADMAP.md"
  deleted:
    - "app/(admin)/operacion/_components/PanelAseo.tsx"

key-decisions:
  - "`Crear aseo` VUELVE A LA CABECERA. La Task 4 lo bajó a `InfoDelDia` y dejó la consecuencia escrita: el detalle sustituye ese bloque entero, así que con un aseo abierto el botón dejaba de existir. De las dos salidas anotadas se toma la segunda (fuera del bloque que el detalle sustituye) y se descarta la copia dentro del detalle, que dejaría dos controles con el mismo nombre accesible. Conserva su fecha por defecto en el día seleccionado"
  - "El control de cerrar del detalle es un ENLACE con `replace` y `scroll={false}`, no un botón con manejador: cerrar es navegar a la dirección del anfitrión sin el parámetro del aseo, y un botón haría a mano lo que el enrutador ya hace"
  - "`PanelLectura.tsx` no se toca ni se dobla: se construye un armazón al lado. Un quinto consumidor con un modo inline lo convertiría en dos componentes disfrazados de uno. Verificado por blob contra `a9d09c5`"
  - "El detalle NO reimplementa la trampa de foco ni la tecla de escape que daba Base UI, porque no es modal: la lista de al lado sigue viva y operable, y atrapar el foco en una columna que no tapa nada encerraría al admin en media pantalla"
  - "El `it` invisible de `lib/data/operacion.test.ts` NO se arregla ni en la Task 5 ni en la Task 6, con tres razones escritas en el punto 9 de `deferred-items.md`. La propiedad que defendía ya está cubierta por el bloque que escribió la Task 1"
  - "El punto 8 de `deferred-items.md` registra una prop correcta SIN compuerta: el `scroll={false}` de `TarjetaAseo.tsx` no lo defiende ningún rojo en esta pantalla, y su condición de salida es un caso a 1279px"

metrics:
  duration: "2h 10m"
  completed: 2026-09-29
  commits: 8
  plan_head_before: a9d09c5528140b8cea4bf4333bbc3ce6512c625b

actuals:
  tokens: 161649   # chars/4 sobre `git diff a9d09c5..HEAD`, el diff ENTERO del plan (las dos mitades). El estimate decía 185000: subestimado un 13%, y el número va sin maquillar
  tasks: 6         # de 7. La 7 es el checkpoint humano bloqueante, y no se puede emitir desde acá
  commits: 8       # MEDIDO: git rev-list --count a9d09c5..HEAD
---

# Fase 10 Plan 05: El rediseño de `/operacion`, Summary

El detalle del aseo dejó de ser un panel que se desliza encima y pasó a ser el contenido de la
columna derecha; el problema de alcance que el portal escondía se volvió a medir en los dos
sentidos y esta vez se puso rojo donde tenía que ponerse; y los tres documentos que gobiernan
esta pantalla dicen por fin lo mismo que el código.

> **ESTE PLAN NO ESTÁ CERRADO.** La Task 7 es un `checkpoint:human-verify` con
> `gate="blocking"`, y el juicio que pide (la regla de los cinco segundos) no lo puede emitir
> ninguna suite de este repo. El `status` de este archivo es `checkpoint` a propósito y pasa a
> `complete` cuando el dueño responda. **Y la FASE tampoco se declara completa:** su objetivo
> cubre cuatro secciones del admin y esta entrega la segunda.

---

## Lo que se hizo en esta mitad (Tasks 5 y 6)

Las Tasks 1 a 4 las ejecutó el primer ejecutor y están en los commits `0f897b1`, `46281a9`,
`752aa1c` y `4f991f3`. Esta mitad arranca con la pantalla ya rediseñada y el detalle todavía
como `Sheet` encima.

### Task 5 · El detalle del aseo dentro de la columna

**`PanelAseo.tsx` se partió en dos y dejó de existir.**

| Qué | Dónde quedó |
|---|---|
| El **cuerpo** (los cuatro grupos, las formas de §6.4, el dinero ausente en una unidad externa, la rama del checklist total en cero) | `CuerpoDeAseo.tsx`, **sin cambiar ni una de sus decisiones** |
| El **armazón** (título, línea de apoyo, barrera de suspensión, control de cerrar) | `DetalleDelAseo.tsx`, inline |

**La extracción está verificada por git, no afirmada:** el commit muestra
`R  PanelAseo.tsx -> CuerpoDeAseo.tsx`, o sea un RENAME y no un ADD más un DELETE. Es la
compuerta más barata que hay contra una reescritura disfrazada de mudanza.

**Las tres cosas que separan el armazón inline del `Sheet`:**

1. **No hay trampa de foco, no hay tecla de escape y no hay superposición, y ninguna se
   reimplementa.** No es un diálogo: la lista de al lado sigue viva y operable. Hay una aserción
   que cuenta **cero** elementos con rol de diálogo mientras el detalle está abierto, y es la
   compuerta contra que alguien devuelva el `Sheet`.
2. **Los tres overrides obligatorios de `PanelLectura` no aplican** (son desviaciones de la
   primitiva `Sheet` y acá no hay primitiva), pero el **peso 600 del título** y la **separación
   mínima de la escala** sí, porque son del contrato de tipografía. Se escriben en el sitio de
   uso, exactamente como `PanelLectura` los escribe en el suyo.
3. **`PanelLectura.tsx` no se toca.** Medido: `git hash-object` contra
   `a9d09c5:app/(admin)/_components/PanelLectura.tsx` da el mismo blob, `375869dc`.

**El control de cerrar es un ENLACE**, con `replace` y `scroll={false}`, y reutiliza
`buttonVariants({ variant: 'ghost', size: 'icon-sm' })`, que es literalmente lo que
`components/ui/sheet.tsx` le pone a su aspa. Ni un color nuevo entra a la pantalla.

### Task 5 · El control de alcance de 08-11, vuelto a correr

**El hallazgo de 08-11 cambió de signo, no desapareció.** Hasta este plan `SheetContent` se
portaleaba a `document.body`, así que el contenedor de página quedaba vacío y una aserción
negativa acotada a `main` pasaba **por vacuidad** con la palabra prohibida presente. Inline, el
contenedor de página **sí** contiene el detalle, y el riesgo vuelve por otra puerta: la lista del
día pinta el mismo nombre de apartamento.

El caso nuevo `CONTROL DE ALCANCE (08-11)` siembra la palabra prohibida (la tarifa VIVA del
apartamento, que es justo la que la aserción de FIN-01 exige que no aparezca en el detalle)
**fuera** del detalle, dentro de la lista del día, y mide los dos sentidos:

| | Resultado |
|---|---|
| **Control de partida** (sin señuelo, la palabra no está en ningún sitio) | verde |
| **Control del señuelo** (la palabra SÍ está en la lista del día) | verde |
| **SENTIDO 1** · acotada a `[data-slot="detalle-aseo"]` | **sigue en VERDE** |
| **SENTIDO 2** · sin acotar, la palabra aparece en el documento | **verde**, o sea que la versión no acotada de la aserción sería FALSA |

Y con el señuelo 2 corrido de verdad, cambiando el ámbito del SENTIDO 1 a la pantalla entera:

```
Error: SENTIDO 1 · acotada a [data-slot="detalle-aseo"], la asercion de FIN-01 sigue
       siendo cierta con el señuelo puesto
expect(received).toBe(expected) // Object.is equality
Expected: false
Received: true
```

**Las dos direcciones, medidas y no razonadas.**

**Y un hallazgo de forma al lado, que costó un rojo:** la colisión de ámbito de esta pantalla
viaja por el **texto** y no por el nombre accesible. La primera versión de la tercera mitad del
control afirmaba dos ENLACES con el nombre del apartamento y salió roja:

```
Expected: 2
Received: 1
Locator: getByRole('link', { name: 'E2E Op Gestionada 3076917e', exact: true })
```

La causa no es un defecto: el enlace de la tarjeta lleva `aria-label="Ver el aseo de {nombre}"`,
así que **su nombre accesible no es el nombre del apartamento** y un localizador por rol y nombre
no lo alcanza. La medición se reescribió sobre el texto, y el porqué quedó escrito en el caso
para que el siguiente no vuelva a escribir la versión que se lee más natural.

### Task 5 · La decisión que la Task 4 heredó: `Crear aseo`

La Task 4 bajó `Crear aseo` de la cabecera a `InfoDelDia`, siguiendo el plan, **y dejó escrita en
voz alta la consecuencia**: el detalle sustituye a `InfoDelDia` entero, así que con un aseo
abierto el botón dejaba de existir en la pantalla. Un admin mirando un aseo y queriendo crear
otro tendría que cerrar el que mira.

**Se tomó la salida de dejarlo fuera del bloque que el detalle sustituye**, o sea devolverlo a la
fila de cabecera. La otra salida anotada (una copia dentro del detalle) se descartó porque dejaría
**dos controles con el mismo nombre accesible** en la misma pantalla, que es lo que §13 prohíbe, y
además obligaría a mantener dos sitios sincronizados para una acción sola.

Va **antes** de la señal de calendario y del selector, no después: el orden del DOM de esos dos es
contrato y hay una aserción E2E que compara sus posiciones. Y **conserva el cambio de
comportamiento de la Task 1**, que fue deliberado: su fecha por defecto es el día seleccionado y
no hoy.

La aserción que vivía acotada a `InfoDelDia` no se perdió: se reescribió, y encima se le añadió un
caso nuevo que la afirma **con el detalle abierto**, que es la condición en la que antes se perdía.

### Task 6 · El contrato escrito

Esta pantalla lleva **tres contratos escritos encima** (Fases 4, 5 y 8) y hasta hoy los tres
decían una cosa y el código otra. Es T-10-26 y el riesgo no era teórico: un lector futuro veía los
tres acordeones relativos a hoy en el contrato, la lista por día en el código, y "corregía" el
código.

- **`10-UI-SPEC.md` §16**, nueva, con sus nueve partes. Va numerada 16 y colocada **antes** de la
  15 a propósito: la 15 es la deuda declarada y tiene que seguir siendo lo último del cuerpo.
  **§12.5 de `05-UI-SPEC` sobrevive citada palabra por palabra**, porque es la prohibición que más
  fácil se pierde al pasar de `TableRow` a tarjeta.
- **§0** deja de afirmar que la fase renderiza una sola pantalla y gana su propia tabla de nueve
  hechos anclados de `/operacion`.
- **§11.4** registra `CalendarCheck` como ampliación **declarada** de la lista cerrada. Corregido
  de paso: el precedente de `HardDrive` es el quick `260918-a33`, no la Fase 5.
- **§11.5** pasa de cuatro trampas a cinco: la de la barra de ambiente de pruebas aplicada a una
  medida **vertical**, con los cuatro sustraendos del `calc()`.
- **§15**: la deuda 1 se corrige a medias y **conserva literal** la frase de que la fase no cierra
  el objetivo del ROADMAP. Entran las deudas 12, 13 y 14.
- **`10-CONTEXT.md`**: nota fechada en la cabecera y punto abierto 3 cerrado a medias. El texto de
  las siete decisiones queda **intacto**: deciden `/login`.
- **`.planning/ROADMAP.md`**: un solo cambio, la línea de objetivo. **8 líneas de diff contra
  `a9d09c5`**, con techo de 30.

---

## Los señuelos, con su rojo real

La regla del plan es una compuerta: una aserción nueva sin su señuelo corrido no cuenta.

| # | Qué se rompió a propósito | Qué se puso rojo |
|---|---|---|
| 1 | El detalle vuelve a ser un diálogo (`role="dialog"` sobre la sección) | `expect(locator).toHaveCount(expected) failed` · `Locator: getByRole('dialog')` · `Expected: 0` · `Received: 1`, desde `sinNingunDialogo` |
| 2 | El ámbito del SENTIDO 1 pasa del detalle a la pantalla entera, con el señuelo puesto fuera | `Expected: false` · `Received: true` sobre `SENTIDO 1 · acotada a [data-slot="detalle-aseo"]` |
| 3 | La clave por identificador sobre el contenedor de la rejilla en vez de sobre el detalle | `expect(received).toBe(expected)` · `Expected: 3144` · `Received: 0` sobre el `scrollTop` de la lista |
| 4 | El `scroll={false}` fuera del enlace de la tarjeta | **NO SE PUSO ROJO.** Ver abajo |

### El señuelo 4 no mordió, y eso es un hallazgo

```
✓  1 [chromium] › abrir el detalle NO manda la lista del dia al tope, y no le borra
                  el toggle (2.6s)
  1 passed
```

**La causa, y sale de una aserción que ya existía.** A partir de `xl` el contenedor de página
tiene altura cerrada y el documento **no scrollea**: lo afirma por nombre el caso *"con TREINTA
tarjetas en el dia la PAGINA no scrollea"*, con `documentoScrollea === false`. El enrutador de
Next, al navegar sin `scroll={false}`, lleva a la vista el tope del documento; si ya está a la
vista, **no hace nada**. En esta pantalla, a 1280 y por encima, la prop es un no-op.

O sea que **las dos causas del mismo síntoma no son simétricas**, que es exactamente lo que el
plan pedía medir: la clave mal puesta sí lo pone rojo, el `scroll={false}` no. Queda registrado
como el punto 8 de `deferred-items.md`, con su condición de salida (un caso a 1279px, donde la
pantalla se apila y el documento vuelve a scrollear). **Mientras no exista ese caso, esa prop está
sostenida por su comentario y no por la suite, y eso hay que saberlo antes de borrarla "por
redundante".**

---

## Deviations from Plan

### 1. `[Rule 1 - Bug]` Un consumidor del detalle vivía FUERA del spec de `/operacion`

- **Encontrado durante:** la corrida de la suite COMPLETA de la Task 7, después de cerrar la
  Task 6.
- **Síntoma:**

  ```
  e2e/recorrido-core.spec.ts:1190
  Error: JUNTA 4 · el panel del aseo abre por direccion directa
  expect(locator).toBeVisible() failed
  Locator: getByRole('dialog')
  ```

- **Causa:** la lista de archivos de la Task 5 nombraba un solo spec, `e2e/operacion.spec.ts`, y
  el barrido de localizadores no alcanzó al sexto consumidor del mismo panel.
- **Arreglo:** retargeteado a `[data-slot="detalle-aseo"]`, con la aserción de cero diálogos al
  lado y con el comentario de la TRAMPA 1 de `TESTING.md` reescrito: sigue valiendo para
  `/apartamentos` y `/finanzas`, y dejó de valer para `/operacion`. **Ninguna aserción se aflojó:**
  las dos que el caso defiende (la miniatura firmada existe y NO hay casilla de ausencia) siguen
  iguales y siguen acotadas.
- **Archivos:** `e2e/recorrido-core.spec.ts`
- **Commit:** `7f27628`

### 2. `[Decisión del orquestador]` `Crear aseo` vuelve a la cabecera

No es un defecto: es la decisión que la Task 4 dejó explícitamente heredada a la Task 5. El plan
ponía el botón en `InfoDelDia` y el contrato de esa task lo nombraba como una de sus tres piezas.
**Se movió, con la razón escrita en los dos sitios** (donde estaba y donde está), y la aserción que
lo afirmaba se reescribió en vez de borrarse. El contrato de la Task 6 lo recoge.

### 3. `[Rule 2 - Documentación]` Dos hallazgos nuevos en `deferred-items.md`

Los puntos 8, 9 y 10 se añadieron en esta mitad: la prop sin compuerta, la decisión de no tocar el
`it` invisible, y la regla vieja de `TESTING.md`. Ninguno se arregló fuera de alcance.

---

## Lo que NO se hizo, y va por nombre

- **El `it` invisible de `lib/data/operacion.test.ts` sigue sin correr.** El plan pedía decidir en
  cuál de las dos tasks entraba: **en ninguna**, con tres razones escritas en el punto 9 de
  `deferred-items.md`. La propiedad que defendía (que el límite inferior de la ventana baja siete
  días) **ya está cubierta** por el bloque `la ventana ante un dia pedido` que escribió la Task 1, y
  en concreto por `LA VENTANA DE LAS ALERTAS NO SE ESTRECHA NUNCA`.
- **`.planning/codebase/TESTING.md` no se editó.** Lo escribe `/gsd-map-codebase` leyendo el
  código, y editarlo a mano dejaría el mapa y su generador en desacuerdo. Punto 10.
- **Los tres rojos preexistentes no se tocaron**, y están identificados por nombre abajo.

---

## El recuento de la suite, con la base reseteada y el build limpio

| Capa | Resultado |
|---|---|
| `ci:arch` | OK (3 de 3) |
| `tsc --noEmit` | limpio |
| `lint` | 0 errores, 2 warnings **preexistentes** (`_actions.test.ts:48`, `aseador.schema.test.ts:40`) |
| Unitarios (`test:unit`) | **1309 pasados** / 68 archivos |
| Integración (`test:integration`) | **203 pasados · 2 fallados** de 205 |
| pgTAP (`db:test`) | **389 pasados**, 13 archivos, `Result: PASS` |
| `db:types:check` | sin diferencias |
| **E2E completa** | **202 pasados · 0 fallados · 1 saltado** |

**Los rojos, identificados por nombre y no por número:**

- `lib/domain/sync-diff.integration.test.ts` · *"1: el aseo viejo se cancela y el nuevo nace SIN
  CONFIRMAR"* y *"3: confirmado y asignado pero SIN empezar sí se cancela"*. Son las dos fechas
  literales caducadas del punto 1 de `deferred-items.md`. **No las causa este plan** y su arreglo
  vive en el dominio de sincronización.
- `e2e/push-instalacion.spec.ts:97` · **verde en esta corrida**, como ya lo estuvo en la de la
  Task 4. Intermitente conocido del `edge-runtime` apagado.

**Ningún rojo nuevo.** La línea base que dejó el primer ejecutor eran **199 pasados · 0 fallados ·
1 saltado**; esta mitad la sube a **202**, y los tres de más son los casos nuevos, no un cambio de
criterio.

### Las cinco compuertas de forma

| Compuerta | Resultado |
|---|---|
| `PanelLectura.tsx` con el mismo blob que en `a9d09c5` | **OK** (`375869dc`) |
| Los cinco títulos de caso que tenían que sobrevivir | **OK, los cinco** |
| La suite reporta al menos 174 casos | **OK: 203** |
| `package.json`, el lock y `supabase/migrations/` fuera del diff contra `a9d09c5` | **OK, los tres** |
| `PanelAseo.tsx` no existe y `tsc` pasa | **OK** |

---

## Requirements Covered

Ninguno nuevo. Las siete DASH ya estaban entregadas y este plan **rediseña sus superficies sin
cambiar lo que prometen**. El criterio 7 del ROADMAP de la Fase 5 (que la hora límite vencida de un
día anterior sí alerte) se conserva y se volvió a medir, porque este plan movió su superficie.

---

## Lo que queda: el checkpoint de la Task 7

**Está abierto y es bloqueante.** El dueño tiene que emitir cinco juicios que ninguna prueba de
este repo puede emitir: la regla de los cinco segundos, el cromo del vistazo contra la sección
financiera, la tarjeta sin confirmar y la confianza de no perder un aseo, la columna derecha sin
selección, y el color de la señal de calendario. **Las dos decisiones que tomó el 2026-09-28 no
están en la lista y no se reabren.**

Cuando responda: escribir el resultado punto por punto acá, con sus palabras si dijo algo distinto
de "bien", pasar el `status` de este archivo a `complete`, y aplicar las cuatro reglas de reanudado
del plan **sin improvisar ninguna solución**.

**Y la FASE no se declara completa aunque el checkpoint cierre.** Su objetivo cubre cuatro
secciones del admin y esta entrega la segunda: `/apartamentos`, `/aseadores` y `/finanzas` siguen
con el tema por defecto. Es la deuda 1 de `10-UI-SPEC.md` §15, y esa decisión es del dueño.

---

## Self-Check: PASSED
