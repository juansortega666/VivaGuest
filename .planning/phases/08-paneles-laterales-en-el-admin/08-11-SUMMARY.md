---
phase: 08-paneles-laterales-en-el-admin
plan: 11
subsystem: pruebas
tags: [e2e, playwright, portal, señuelos, historial, criterio-5, criterio-3]

requires:
  - phase: 07-financiero
    provides: "esperarUrlDeCliente() y esperarControlHidratado() en e2e/fixtures.ts, escritas en el arreglo de la Fase 7 y con cero consumidores hasta hoy; y el spec de finanzas entero, con sus ocho aserciones de la ficha de aseadora"
  - phase: 08-paneles-laterales-en-el-admin
    provides: "08-02: el inventario clasificado de §5.2 y §5.3, la INSTRUCCION 7 (el instrumento de espera) y la INSTRUCCION 8 (la contra-prueba obligatoria). 08-06: el destino nuevo de la celda de nombre. 08-08: el panel de aseadora y la muerte de /finanzas/aseadoras/[id]. 08-09: el redirect de §5.4 y la medición de la cascada del apartamento huérfano. 08-10: el mapa de los seis rojos de la suite completa"
provides:
  - "Las seis aserciones de D8-11 cambiadas de forma, con su fondo intacto"
  - "Las dos aserciones de no rastreo acotadas al diálogo, con la evidencia impresa de que con el ámbito anterior pasaban mirando una caja vacía"
  - "El primer consumidor de esperarUrlDeCliente() que se queda en el árbol"
  - "El quinto panel abriendo con empuje: el criterio 3 deja de ser verdad en cuatro de cinco"
  - "La fuga del apartamento huérfano cerrada de raíz, que es lo que envenenaba la suite entera"
  - "Siete señuelos corridos y anotados, con su rojo real y no el predicho"
affects: [08-12, 08-13, 08-14]

tech-stack:
  added: []
  patterns:
    - "Toda aserción que lea un panel se acota con getByRole('dialog'). Nunca con main, nunca con el <table> de la página, y nunca ampliándola a toda la pantalla"
    - "Toda espera de navegación de cliente va con esperarUrlDeCliente() o con pulsarHastaNavegar(). La aserción sobre la URL se escribe después, y se sigue escribiendo"
    - "El identificador de una fila recién creada se registra para la limpieza ANTES de esperar la URL, sondeando la base"

key-files:
  created: []
  modified:
    - "e2e/apartamento-crud.spec.ts"
    - "e2e/apartamento-cuartos.spec.ts"
    - "e2e/apartamentos-lista.spec.ts"
    - "e2e/finanzas.spec.ts"
    - "app/(admin)/finanzas/_components/TablaPagosDelPeriodo.tsx"
    - ".planning/phases/08-paneles-laterales-en-el-admin/deferred-items.md"

decisions:
  - "La aserción sobre la URL se escribe contra el id resuelto EN LA BASE, no contra un patrón genérico: un redirect al apartamento equivocado se pone rojo, cosa que antes no pasaba"
  - "El grupo SUPLENTE EN se ejerce en sus dos reglas, y la segunda mitad se abre por dirección directa: sin ella, la aserción del vacío pasaría con un grupo que no se renderiza nunca"
  - "El rojo de operacion-alertas:341 no se arregló: es una dependencia del reloj, es anterior a esta fase, y arreglarlo desde acá sería salirse del alcance"

metrics:
  duration: "~2h"
  completed: "2026-09-18"

status: complete
---

# Fase 8 Plan 11: El barrido de aserciones, con sus señuelos corridos, Summary

Las seis aserciones de D8-11 cambiaron de forma sin perder su fondo, las dos de seguridad
pasaron a mirar el panel de verdad, y hay una salida impresa que demuestra que con el ámbito
anterior pasaban en verde con la palabra prohibida puesta dentro del panel.

## Lo que se hizo

**Las cuatro de apartamentos** (`apartamento-crud:149,191,285` y `apartamento-cuartos:146`)
pasaron de la espera que sondea dentro del documento a `esperarUrlDeCliente()`, con el patrón
del parámetro del panel. Las dos primeras navegan explícitamente al formulario después, porque
ninguno de los doce campos que afirman existe en el panel; la tercera llega ahí **pulsando el
botón `Editar` del panel**, que es la única acción primaria de toda la fase y no la ejercía nadie.

**Las dos de finanzas** (`:589` y el bloque de `:592`) se reescribieron enteras: la espera cambió
de instrumento, los cuatro títulos de bloque pasaron a los cuatro encabezados de grupo de §9.1
acotados al diálogo, cuatro aserciones murieron con la página, y **las dos de no rastreo cambiaron
de ámbito**, que es el corazón del plan.

**El quinto panel** perdió la prop de reemplazo de su enlace de apertura. El diff de código sobre
ese archivo es esa sola prop.

## El verde falso, impreso

**Es la evidencia del Hallazgo 4 y es lo que este plan existía para producir.** Se metió el señuelo
dentro del panel de aseadora (la palabra prohibida y una `<img alt="mapa del sector">`) y se
corrieron **las mismas dos aserciones, sobre el mismo documento, cambiando solo el ámbito**:

```
[contraprueba] texto del panel: "AUAseador Uno E2E ActivaAHORA MISMOAhora mismoNo tiene ningún
aseo en curso.RESPONSABLE DE (2)Responsable deE2E Fin Bogota 95ad2b54, E2E Fin Medellin
95ad2b54Su ubicación aproximadaEN EL PERIODO ABIERTOLleva ganadoTodavía no lleva ningún aseo en
este periodo.Cerrar"

[contraprueba] texto de main: "FinanzasDíaSemanaMeslunes 3 de agostoHoyResumenPagosMostrando
lunes 3 de agosto.COBRADO$ 152.909PAGADO A ASEADORES$ 48.211…"

  ✓  1 CONTROL: el señuelo SI está dentro del panel (2.2s)
  ✓  2 CASO A · ambito viejo: pasa en VERDE con la palabra prohibida dentro del panel (598ms)
  ✘  3 CASO B · ambito nuevo: se pone ROJO con el mismo señuelo (627ms)
```

**Lo que esas tres líneas dicen, en orden:** la palabra prohibida ESTÁ en el panel (control
positivo, sin el cual el CASO A pasaría por no haber señuelo); con `locator('main')` la aserción
**pasa en verde**; con `getByRole('dialog')` **se pone roja**. El texto de `main` con el panel
abierto es el de la página de detrás y no contiene ni un carácter del panel: eso es el portal,
medido en crudo.

**No es un test que alguien debilitó. Es un test que se debilitó solo**, y llevaba así desde que
08-08 convirtió la ficha en panel.

## Los siete señuelos, con su rojo real

La INSTRUCCION 8 es una compuerta: una aserción retargeteada sin su señuelo corrido no cuenta.
Los siete se corrieron, se comprobó el rojo, y se revirtieron. **Ninguno tuvo un radio distinto
al previsto**, y eso también se anota.

| # | Aserción | Qué se rompió a propósito | Qué se puso rojo |
|---|---|---|---|
| 1 | `apartamento-crud`, la espera del borrador | el redirect de guardado pierde el parámetro (`router.replace('/apartamentos')`) | `La navegación de cliente no dejó la URL en /\/apartamentos\?apartamento=…/ tras 15000 ms. Sigue en …/apartamentos` |
| 2 | `apartamento-crud`, la aserción de URL de los doce campos | el redirect va a un uuid inventado | `Expected pattern: /\?apartamento=1e9261dc-…$/` · `Received: "…?apartamento=00000000-0000-4000-8000-000000000000"` |
| 3 | `apartamento-crud`, el botón `Editar` del panel | el `href` del botón pierde el id | `La navegación de cliente no dejó la URL en /\/apartamentos\/add020d0-…$/ tras 15000 ms. Sigue en …/apartamentos` |
| 4 | `apartamento-cuartos`, el ayudante del borrador | el mismo redirect del señuelo 1 | el mismo mensaje, disparado desde `crearBorrador` |
| 5 | `finanzas`, el no rastreo de texto | la palabra prohibida dentro del panel | `Expected pattern: not /ubicaci[oó]n\|coordenad\|GPS\|…/i` sobre el texto del diálogo |
| 6 | `finanzas`, el no rastreo de imagen | solo la `<img alt="mapa del sector">`, sin la palabra | `expect(locator).toHaveCount(expected)` · `Expected: 0` · `Received: 1` |
| 7 | `finanzas`, los encabezados de grupo | `EN EL PERIODO ABIERTO` renombrado a `EN EL PERIODO` | `element(s) not found` · `getByRole('dialog').getByText(/^EN EL PERIODO ABIERTO$/)` |

**Y dos más, que el plan no pedía pero que valen lo mismo:**

| # | Aserción | Qué se rompió | Qué se puso rojo |
|---|---|---|---|
| 8 | `finanzas`, `SUPLENTE EN` no se pinta con cero | el grupo se renderiza siempre | `Expected: 0` · `Received: 1` sobre `getByText(/^SUPLENTE EN/)` |
| 9 | `apartamentos-lista:376`, la forma del `href` | la celda vuelve al destino viejo | `Expected pattern: /^\/apartamentos\?(.+&)?apartamento=…$/` · `Received: "/apartamentos/5eed0050-…"` |

## La cobertura que se pierde, declarada y no escondida

**Cuatro aserciones murieron. Las cuatro se borraron, ninguna se comentó, y cada una dejó su razón
escrita en el sitio donde estaba.**

| Aserción | Por qué muere | Sustituto |
|---|---|---|
| `lo que cuesta en el periodo` | La cabecera del panel es nombre + estado (§9.2): ya no hay cifra grande junto a la persona, así que la etiqueta que la desambiguaba no tiene nada que desambiguar | **Parcial.** El grupo `EN EL PERIODO ABIERTO` lleva su propio rótulo `Lleva ganado`, que dice lo mismo en otro sitio, y ese grupo sí se afirma |
| `Todos sus periodos cerrados` | §0.1 conflicto B: el bloque de pagos mes a mes se cae del panel | **Parcial, y la pérdida es de fondo.** Era la única aserción del repo que comprobaba que ese bloque IGNORA el filtro de periodo de arriba y que lo dice en pantalla. Lo que sigue vivo es que `/finanzas/pagos` no tiene filtro de periodo (caso de la línea 660) |
| Los ≥2 rótulos `Del …` | Lo mismo | Lo mismo |
| **`Al momento de abrir esta página.`** | §17.8 punto 8 la prohíbe por nombre en un panel, con argumento | **NINGUNO** |

**La cuarta es la pérdida real y no se sustituye por nada.** Fijaba D-14: *un dato operativo que
parece vivo y no lo está es peor que uno fechado*. `AHORA MISMO` es exactamente ese dato. A partir
de esta fase **ninguna prueba del repo afirma que el admin sepa de cuándo es ese dato**. La
decisión de §17.8 es correcta Y la cobertura se pierde; queda como deuda, sin sustituto, y la
condición de reapertura la pone el propio §17.8: si el admin empieza a dejar el panel abierto, se
reabre.

## Las tres reglas innegociables de §5.4, comprobadas en el diff

1. **La persistencia se sigue comprobando RECARGANDO.** El comentario que lo explica está donde
   estaba, palabra por palabra, y el `reload()` sigue ahí. Lo que se añadió antes es la navegación
   al formulario, porque el encabezado de nivel 1 de la lista es el título de la sección y no el
   nombre del apartamento: sin eso el rojo acusaría a la pantalla equivocada.
2. **El identificador sigue resolviéndose contra la base.** `grep -c "from('properties')"` sobre
   `apartamento-cuartos` da **5**, igual que antes. Y ahora la aserción de URL se escribe **contra
   ese id**, así que la prueba es más estricta que antes, no menos.
3. **Ninguna aserción de seguridad se debilitó.** La expresión regular de los cinco términos de
   rastreo es byte a byte la misma (`HEAD:631` y `AHORA:703`), la aserción de la imagen de mapa
   tampoco cambió, y las dos pasaron de un ámbito que no las miraba a uno que sí, **con su rojo
   demostrado**.

**La aserción de ancla del periodo está intacta.** `git diff` la muestra como contexto, sin `+`
ni `-`. Es la que atrapa que abrir un panel le cambie el periodo al admin por debajo, o sea el
Pitfall 2, y es la única red de ese defecto.

## El quinto panel, comprobado ejecutando en los dos sentidos

**El barrido que §5.2 pide por escrito, y su resultado, aunque salga vacío:**

```
$ grep -n "goBack\|goForward\|history\|historial\|\.back(" e2e/finanzas.spec.ts
609:    // Filtrar el historial de pagos por el rango de arriba dejaría "sus pagos"

$ grep -rn "goBack\|goForward\|history.length\|\.back(" e2e/
(vacío)
```

**Cero aserciones sobre profundidad de historial en todo `e2e/`.** La única coincidencia es un
comentario en prosa sobre el historial de pagos, que no habla de navegación. Nada que cambiar de
forma.

**Y la comprobación ejecutando, con la prop quitada:**

```
[08-11] con el panel abierto:      http://127.0.0.1:3210/finanzas/pagos?pago=657c92e0-…
[08-11] tras pulsar atras:         http://127.0.0.1:3210/finanzas/pagos
[08-11] tras el control de cierre: http://127.0.0.1:3210/finanzas/pagos
  ✓ el boton atras CIERRA el panel de pago y deja la direccion en la seccion (2.1s)
  ✓ cerrar con el control de cierre devuelve la direccion a la ruta base (924ms)
```

**Y la contra-prueba, que es lo que demuestra que el cambio no era cosmético.** Con la prop de
vuelta, la misma comprobación:

```
[08-11] con el panel abierto: http://127.0.0.1:3210/finanzas/pagos?pago=6b9458a4-…
  ✘ Error: La navegación de cliente no dejó la URL en /\/finanzas\/pagos$/ tras 15000 ms.
    Sigue en about:blank
```

**`about:blank`.** Con reemplazo al abrir, el panel no añadía entrada de historial, así que el
botón atrás no lo cerraba: sacaba de la sección entera y, con una sola entrada en el historial,
sacaba del sitio. Era el único de los cinco paneles donde el criterio 3 era mentira.

**El precio, declarado tal como §17.1 lo cuenta:** abrir y cerrar ocho paneles seguidos deja ocho
entradas de historial idénticas a la ruta base, así que salir de la sección con el botón atrás
cuesta ocho pulsaciones. **Es degradación, no rotura**, y es estrictamente mejor que lo de antes,
donde la primera pulsación sacaba. La alternativa limpia (cerrar volviendo atrás) se rompe cuando
se entró por dirección directa, y se descartó por eso.

## La fuga que envenenaba la suite, cerrada de raíz

08-09 la midió y avisó: con `idPorNombre()` **después** de la espera de URL, un rojo en la espera
deja el id fuera de `creados`, la limpieza no lo borra, y la base queda con 40 unidades. Desde ahí
el control de entorno de `apartamento-crud:65`, el de `apartamento-cuartos:68`,
`calendario.spec.ts:219` y `apartamentos-lista` revientan **sin tener nada roto**.

Reproducida antes de tocar nada:

```
  2 failed · 6 did not run · 1 passed
  Error: La semilla cambió: 40 unidades, se esperaban 39.
```

**El registro del id se movió antes de la espera, en los dos archivos, y sondea la base** porque
el clic devuelve antes de que la fila exista: lo que se espera ahí es la fila, no la URL, y son
dos hechos distintos con dos esperas distintas. Medido durante los señuelos: con las cuatro
esperas en rojo a propósito, **la limpieza siguió corriendo y la base quedó en 39**.

## Las cuatro suites

| Suite | Línea base | Ahora |
|---|---|---|
| Unit | 1244 | **1244 en verde**, 65 archivos |
| pgTAP | 380 | **380 en verde**, 12 archivos |
| Integración | 205 | **205 en verde**, 23 archivos |
| E2E | 132 · 1 saltado · 6 rojos (08-10) | **133 pasando · 1 saltado · 1 rojo** |

**Los seis rojos que 08-10 dejó están en cero.** Los cuatro declarados de apartamentos, los dos de
la cascada, el de `apartamentos-lista:376` y el de `finanzas:579`: todos verdes.

**Guardarraíles:** `npm run build` limpio, `npx tsc --noEmit` limpio, `npm run ci:arch` limpio
(los tres scripts), `npm run lint` con los dos avisos preexistentes de archivos de test que este
plan no tocó.

**`git diff --name-only` de los tres commits: cero archivos bajo `app/(cleaner)`.**

## El único rojo que queda, y por qué no es de este plan

`e2e/operacion-alertas.spec.ts:341` se pone rojo, 4 corridas de 4, con este diff:

```
-   "CALENDARIO CAÍDO",
    "HORA LÍMITE VENCIDA",
+   "CALENDARIO CAÍDO",
```

**Depende de la hora a la que se corre la suite, y la aritmética está en el repo.** El caso siembra
`HORA LÍMITE VENCIDA` con vencimiento **hoy a las 00:01** y `CALENDARIO CAÍDO` con
`Date.now() − 4 h` (`e2e/fixtures.ts:993`). El comentario del caso da por sentado que la primera es
la más antigua de las siete. **Eso solo es cierto a partir de las 04:01.** Esta corrida fue a las
00:21, así que `ahora − 4 h` cayó en ayer a las 20:21 y las dos se intercambiaron.

**El orden que la pantalla pintó es el cronológicamente correcto.** El producto ordena bien; lo que
está mal es la expectativa del caso.

**No se arregló acá, y es la regla de alcance:** el diff de este plan no toca ni una línea de
alertas, ni del spec, ni de la siembra, ni de la lectura. Queda en `deferred-items.md` con su
medición, su ventana horaria y el arreglo correcto (quitarle al caso su dependencia del reloj, no
aflojar la aserción), para que **08-14 no lo cuente como regresión de la fase**.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `e2e/apartamentos-lista.spec.ts:376` no estaba en `files_modified` y
bloqueaba el criterio de aceptación**

- **Found during:** Task 3, la regresión completa de la wave
- **Issue:** El criterio pide `npx playwright test` sin ningún rojo. Ese caso estaba rojo desde
  08-06 (el `href` de la celda ya apuntaba al destino nuevo y la aserción esperaba la forma vieja),
  declarado como material de este plan por 08-09 y por 08-10, pero el plan no lo listaba en sus
  archivos.
- **Fix:** La aserción cambia de forma y no de fondo: sigue afirmando que hay un `<a>` real con
  una dirección real, contra la forma nueva del `href`, con el grupo opcional que deja pasar la
  composición con parámetros vivos de la INSTRUCCION 5. **Con su señuelo corrido** (el número 9 de
  la tabla de arriba).
- **Files modified:** `e2e/apartamentos-lista.spec.ts`
- **Commit:** `fe4ab0c`

**2. [Rule 2 - Correctitud] El ayudante de `apartamento-cuartos` tenía que navegar al formulario,
no solo cambiar la espera**

- **Found during:** Task 1
- **Issue:** El plan dice que en cuartos «solo cambia la espera». Pero el ayudante promete devolver
  el id **ya en el detalle**, y los ocho casos que lo usan empiezan tocando el formulario. Con el
  redirect nuevo aterriza en la lista con el panel abierto, así que los ocho se caerían.
- **Fix:** El ayudante navega al formulario antes de devolver. **La resolución del identificador
  sigue contra la base**, que es lo que la regla 2 de §5.4 protege; lo único que cambió además es
  cuándo se resuelve.
- **Files modified:** `e2e/apartamento-cuartos.spec.ts`
- **Commit:** `91d53f8`

**3. [Rule 2 - Cobertura] `SUPLENTE EN` no se podía afirmar como los otros tres, y afirmar solo
tres habría sido una rebaja silenciosa**

- **Found during:** Task 2
- **Issue:** Medido con el andamio: el panel de `aseadoraUna` pinta `AHORA MISMO`,
  `RESPONSABLE DE (2)` y `EN EL PERIODO ABIERTO`, **y ningún `SUPLENTE EN`**, porque en el fixture
  financiero esa aseadora es responsable de dos unidades y suplente de ninguna, y §9.3 dice que un
  grupo vacío no se renderiza. Afirmar los cuatro sin más habría sido afirmar algo falso; afirmar
  solo tres, perder el cuarto sin decirlo.
- **Fix:** Se ejercen **las dos reglas del grupo**: que no se pinta con cero (sobre la Una), y que
  sí se pinta con quien sí lo es (sobre la Dos, abierta por dirección directa, que de paso ejerce
  que el panel es enlazable). **Con su señuelo corrido** (el número 8).
- **Files modified:** `e2e/finanzas.spec.ts`
- **Commit:** `fcea74a`

### Lo que se dejó fuera a propósito

**El aviso de 08-08 sobre la rama con cifras del grupo 4 NO se cerró.** El fixture financiero no
siembra ningún periodo vencido sin cerrar, así que `Lleva ganado $X` más `{N} aseos · {$G} en
gastos` sigue sin verse pintado; lo que este plan afirma de ese grupo es su rama vacía
(`Todavía no lleva ningún aseo en este periodo.`, verificado en el texto del panel). Sembrar ese
periodo obliga a tocar `e2e/fixtures.ts`, que no está en los archivos de este plan y que es la
siembra de la que dependen catorce casos de tres specs. **Es material de 08-13**, que es quien
escribe casos nuevos.

### Auth gates

Ninguno.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. El plan no introduce superficie: no hay endpoint nuevo, no hay cambio de schema, y el
único cambio de producto es quitar una prop de navegación de un enlace.

**Y los seis del registro se cubrieron:**

| Amenaza | Cómo se cerró |
|---|---|
| T-08-51 · las dos de no rastreo pasando sin mirar | Retargeteadas al diálogo, con el verde falso del ámbito viejo impreso arriba |
| T-08-52 · una aserción retargeteada que nunca se probó que pudiera fallar | Nueve señuelos corridos, con su rojo real en la tabla |
| T-08-53 · la aserción de ancla tocada | Intacta: aparece en el diff como contexto |
| T-08-54 · el identificador leído de la dirección | Sigue contra la base, y la aserción de URL se escribe **contra ese id** |
| T-08-55 · el botón atrás sacando de la sección | Cerrado, comprobado en los dos sentidos, con la contra-prueba del `about:blank` |
| T-08-56 · cobertura perdida sin declarar | Las cuatro que mueren llevan su razón en el código, y la que no tiene sustituto lo dice aquí y allá |

## Lo que este plan le deja escrito a los que vienen

**A `08-12` (el barrido visual).** El patrón para leer un panel ya está fijado y tiene precedente
en este archivo: `getByRole('dialog')`, siempre. Y la otra mitad, que es la que nadie escribe: si
hay que mirar la **página de detrás** con el panel abierto, se lee del DOM (`locator`, `evaluate`),
nunca por rol, porque Base UI la marca como oculta al árbol de accesibilidad y un localizador por
rol se cuelga hasta el plazo.

**A `08-13` (los casos nuevos).** Tres encargos concretos:

1. **El caso E2E formal del criterio 3 en el panel de pago.** Este plan lo comprobó ejecutando con
   un andamio desechable; el caso que se queda en el árbol lo escribe 08-13. El andamio está
   reproducido arriba y se copia tal cual.
2. **La rama con cifras del grupo 4 del panel de aseadora.** Basta con sembrar un periodo vencido
   sin cerrar en `sembrarFinanzas()`. Es el aviso de 08-08 y sigue abierto.
3. **`operacion-alertas:341`**, con su medición en `deferred-items.md`. Y el nombre accesible
   duplicado de `Ver el aseo de {nombre}` que 08-07 dejó anotado: **las aserciones de este plan no
   lo tocan**, porque ninguna se escribió contra esa cadena.

**A `08-14` (la puerta de la fase).** Tres cosas que cruzar:

- **Las nueve filas de señuelos de arriba.** Cada una tiene su rojo real citado. Las cinco de la
  casilla EN RIESGO del inventario de 08-02 son los números 5, 6, 7 y el par de la línea 589; las
  otras son de regalo.
- **La deuda sin sustituto**, que es la línea que fechaba el dato, y que **no se puede contar como
  «cobertura preservada»**.
- **El rojo de `operacion-alertas:341` no es una regresión de la fase**, y la misma suite corrida
  después de las 04:01 da 134 en verde. La aritmética está en `deferred-items.md`.

## Self-Check: PASSED

**Archivos declarados, comprobados en disco:**

- `e2e/apartamento-crud.spec.ts` — FOUND
- `e2e/apartamento-cuartos.spec.ts` — FOUND
- `e2e/apartamentos-lista.spec.ts` — FOUND
- `e2e/finanzas.spec.ts` — FOUND
- `app/(admin)/finanzas/_components/TablaPagosDelPeriodo.tsx` — FOUND
- `.planning/phases/08-paneles-laterales-en-el-admin/deferred-items.md` — FOUND

**Commits declarados, comprobados en `git log`:**

- `91d53f8` — FOUND
- `fcea74a` — FOUND
- `fe4ab0c` — FOUND

**Archivos desechables, comprobados como AUSENTES, que es lo correcto:**

- `e2e/_contraprueba-08-11.spec.ts` — NO EXISTE
- `e2e/_comprobacion-08-11.spec.ts` — NO EXISTE

**Criterios de aceptación, medidos:**

```
grep -c esperarUrlDeCliente e2e/apartamento-crud.spec.ts          5   (≥3 pedido)
grep -c waitForURL          e2e/apartamento-crud.spec.ts          0   (0 pedido)
grep -c "from('properties')" e2e/apartamento-cuartos.spec.ts      5   (no disminuye)
grep -c "getByRole('dialog')" e2e/finanzas.spec.ts                4   (≥2 pedido)
grep -c "locator('main')"     e2e/finanzas.spec.ts    2 → 1, y el que queda es un comentario
grep -c "scroll={false}"      TablaPagosDelPeriodo.tsx            1   (≥1 pedido)
git diff sobre TablaPagosDelPeriodo, líneas de código borradas    1   (la prop `replace`)
git diff --name-only | grep cleaner                             vacío
```
