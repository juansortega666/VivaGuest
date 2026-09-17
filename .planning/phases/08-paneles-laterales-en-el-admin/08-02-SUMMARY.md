---
phase: 08-paneles-laterales-en-el-admin
plan: 02
subsystem: testing
tags: [spike, medicion, next-app-router, loading-tsx, scroll-restoration, playwright, portal, e2e]

requires:
  - phase: 07-finanzas
    provides: "esperarUrlDeCliente() y esperarControlHidratado() en e2e/fixtures.ts, la cabecera medida de app/(admin)/finanzas/page.tsx, y el patron de panel de SheetDesglosePago"
  - phase: 08-paneles-laterales-en-el-admin
    plan: 01
    provides: "la base en estado conocido tras su db:reset"
provides:
  - "08-02-MEDICION.md: las diez preguntas del criterio 1 respondidas con medicion repetida, el experimento A/B que aisla la causa, y la seccion VEREDICTO escrita como instruccion ejecutable"
  - "El inventario del barrido del portal, 11 puntos del grep mas las 10 aserciones de la ficha de aseadora, clasificados en EN RIESGO / SIGUE VÁLIDA / MUERE"
  - "La regla de contra-prueba: una asercion retargeteada sin señuelo en rojo no cuenta"
  - "deferred-items.md con el rojo de push-instalacion:215 medido y la correccion de la linea base E2E"
affects: [08-06, 08-07, 08-08, 08-11, 08-14]

tech-stack:
  added: []
  patterns:
    - "Spike de medicion con andamio desechable: se construye, se mide tres veces por escenario, se escribe el veredicto y se revierte el arbol entero en el mismo plan"
    - "Experimento A/B sobre un archivo del arbol (apartar loading.tsx y repetir) para aislar una causa en vez de inferirla"
    - "Escenario de CONTROL que ejerce la mitad sospechosa sin la otra: navegar con scroll={false} sin abrir ningun panel"

key-files:
  created:
    - .planning/phases/08-paneles-laterales-en-el-admin/08-02-MEDICION.md
    - .planning/phases/08-paneles-laterales-en-el-admin/deferred-items.md
  modified: []

key-decisions:
  - "El filtro de TablaApartamentos NO se mueve a la direccion: sobrevive entero, 3 de 3, en las dos direcciones. La salida 1 que el plan tenia escrita queda descartada por medicion, no por opinion"
  - "Los dos loading.tsx que la fase toca (apartamentos y operacion) se borran antes de construir ningun panel: es la condicion necesaria y suficiente para la mitad scroll del criterio 1"
  - "components/ui/sheet.tsx no se toca: el escenario de control demuestra que la perdida de scroll ocurre navegando sin abrir ningun panel"
  - "Los seis enlaces de APERTURA tienen que conservar los parametros del anfitrion, no solo el cierre. El research describia el Pitfall 2 solo sobre el cierre y la medicion enseña que llega antes"
  - "Las aserciones negativas por rol sobre la pagina de detras, con el panel abierto, son un falso verde que ningun grep de contenedor encuentra. Se leen del DOM"

patterns-established:
  - "Todo hallazgo de un spike que cambie el plan se escribe como INSTRUCCIÓN numerada, no como observacion, para que el plan que la consume no tenga que interpretar la evidencia"
  - "Los sesgos del instrumento se miden y se escriben junto al resultado: los dos que aparecieron aqui producian el mismo resultado que se queria medir"

requirements-completed: []

coverage:
  - id: M1
    description: "Las cinco preguntas del escenario A respondidas con medicion repetida, al abrir y al cerrar"
    verification:
      - kind: other
        ref: "3 corridas de e2e/spike-criterio-1.spec.ts (escenario A), MEDICION.md §2.1 a §2.3"
        status: pass
    human_judgment: false
  - id: M2
    description: "Las cinco preguntas del escenario B, con Realtime llegando con el panel abierto"
    verification:
      - kind: other
        ref: "3 corridas del escenario B con siembra propia, MEDICION.md §4.1 y §4.2"
        status: pass
    human_judgment: false
  - id: M3
    description: "La causa aislada: es loading.tsx del segmento, no el panel ni el bloqueo de scroll del dialogo"
    verification:
      - kind: other
        ref: "Experimento A/B apartando el archivo, 3 corridas por rama y por ruta, MEDICION.md §3"
        status: pass
    human_judgment: false
  - id: M4
    description: "El inventario del barrido clasificado en las tres casillas, con la salida cruda del grep"
    verification:
      - kind: other
        ref: "MEDICION.md §5.1 a §5.3, 21 filas clasificadas"
        status: pass
    human_judgment: false
  - id: M5
    description: "El veredicto escrito como instruccion ejecutable, que 08-06, 08-07 y 08-08 leen sin interpretar"
    verification:
      - kind: other
        ref: "MEDICION.md §6, cinco veredictos mas la causa y ocho instrucciones"
        status: pass
    human_judgment: false
  - id: M6
    description: "El arbol revertido: ningun archivo de producto en el diff del plan"
    verification:
      - kind: other
        ref: "git status --porcelain -- app components lib e2e devuelve 0 lineas; tsc, ci:arch y 1201 unitarios en verde"
        status: pass
    human_judgment: false

duration: 2h05min
completed: 2026-09-17
status: complete
---

# Fase 8 Plan 02: El spike del criterio 1 y el barrido del portal

**El criterio 1 promete dos cosas y hoy solo se cumple una: el filtro sobrevive entero y el scroll se pierde, y la causa esta aislada con un experimento A/B, es `loading.tsx` del segmento, y se arregla borrando dos archivos.**

## Performance

- **Duracion:** ~2 h 05 min
- **Tareas:** 3 de 3
- **Archivos del diff:** 2, los dos bajo `.planning/`
- **Corridas de medicion:** 12 del escenario A (6 con `loading.tsx`, 6 sin), 6 del escenario B (3 con, 3 sin), mas 2 corridas completas de la suite E2E

## Lo que se hizo

### Task 1 · El spike del criterio 1

Se construyo el andamio mas reducido que responde la pregunta (un `Sheet` que solo
pinta el nombre, abierto por `?apartamento=` leido en el servidor, con
`<Link scroll={false}>` en la celda de nombre), su gemelo en `/operacion` con
`?aseo=`, **y un enlace de CONTROL** que navega del lado del cliente con la misma
desactivacion del salto de scroll pero **sin abrir ningun panel**. Ese control es
lo que convirtio el spike en una medicion en vez de en una observacion.

Instrumentos: un `MutationObserver` para contar apariciones del esqueleto, lectura
del filtro **del DOM**, una traza de scroll cada 25 ms que registra a la vez
`scrollY`, `scrollHeight`, dialogos abiertos y estilos de bloqueo, `window.scrollTo`
y `window.scroll` parcheados para saber quien mueve el scroll, y
`esperarUrlDeCliente()` para la URL.

### Task 2 · El barrido del portal

El grep de tres patrones sobre los ocho specs, corrido de verdad, con su salida
cruda en el documento: **nueve puntos, un solo archivo**, tal como el research
predijo. Mas un segundo grep ampliado a otros seis contenedores de layout, que
añadio dos puntos y ningun problema nuevo.

Los once resultados clasificados, mas las diez aserciones del test de la ficha de
aseadora una por una, que es el unico test cuyo sujeto entero se convierte en
panel.

### Task 3 · El veredicto y la reversion

Cinco veredictos, un sexto que la pregunta no tenia (la causa), y ocho
instrucciones numeradas. El andamio revertido entero y comprobado ejecutando.

## Los commits por tarea

1. **Task 1: el spike del criterio 1** — `bd48530` (docs)
2. **Task 2: el barrido del portal** — `25f4c30` (docs)
3. **Task 3 [BLOCKING]: el veredicto y la reversion** — `789f6b7` (docs)

## Los cinco veredictos, y el sexto

```
VEREDICTO 1 (filtro de /apartamentos):      SOBREVIVE
VEREDICTO 2 (scroll de /apartamentos):      SE PIERDE
VEREDICTO 3 (esqueleto del segmento):       NO APARECE
VEREDICTO 4 (lo mismo en /operacion):       estado de cliente SOBREVIVE
                                            scroll SE PIERDE
                                            esqueleto NO APARECE
VEREDICTO 5 (Realtime con panel abierto):   NO LO TOCA
VEREDICTO 6 (la causa del 2):               ES `loading.tsx` DEL SEGMENTO
```

## Lo que cambia respecto a lo que el plan esperaba

El plan tenia escritas dos salidas **para el filtro** y ninguna para el scroll,
porque el research daba por hecho que las dos mitades del criterio 1 corrian la
misma suerte. **No la corren.**

| Lo que el plan preveia | Lo medido |
|---|---|
| Si el filtro se pierde: moverlo a la direccion, o barrera de suspension con clave independiente | **El filtro no se pierde.** Las dos salidas quedan descartadas y `TablaApartamentos` no se toca |
| El scroll iria de la mano del filtro | **Va al reves.** Se pierde en los dos anfitriones, en las dos direcciones, y cerrar no lo devuelve |
| `loading.tsx` era el sospechoso del filtro | **Lo es, pero del scroll.** Apartarlo lo arregla, 3 de 3, en las dos rutas |
| El esqueleto podia aparecer | **Nunca aparece.** 0 apariciones en 12 corridas, porque la respuesta RSC vuelve en ~70 ms |

**El mecanismo, que es lo que hace que las dos mitades se comporten distinto:** un
fallback de Suspense **no desmonta el arbol de React, lo oculta**, asi que el
`useState` sobrevive. Pero mientras esta oculto el documento pierde altura, el
navegador clampa `scrollY` a 0, y cuando el contenido vuelve la posicion ya se
perdio. Por eso nadie llama a `window.scrollTo` (los dos estan parcheados y el
registro sale vacio) y por eso la traza no ve el documento acortarse: el hueco dura
menos que el intervalo de muestreo.

## El experimento que lo aisla

| Ruta | Rama | Corridas | scroll antes -> despues |
|---|---|---|---|
| `/apartamentos` | **CON** `loading.tsx` | 3 | **1057 -> 0** |
| `/apartamentos` | **SIN** `loading.tsx` | 3 | **1057 -> 1057** |
| `/apartamentos` (control, sin panel) | **CON** | 3 | **1969 -> 0** |
| `/apartamentos` (control, sin panel) | **SIN** | 3 | **1969 -> 1969** |
| `/operacion` | **CON** `loading.tsx` | 3 | **277 -> 0** |
| `/operacion` | **SIN** `loading.tsx` | 3 | **277 -> 277** |

En las seis ramas, el filtro y el estado de cliente sobreviven y el esqueleto no
se pinta. La unica variable que mueve el scroll es el archivo.

## Dos hallazgos que no estaban en el plan

**1. Abrir tambien borra los parametros del anfitrion, no solo cerrar.** El
andamio abria con `href="/operacion?aseo={id}"`, una consulta literal, y el
`?alertas=atendidas` de la pantalla **desaparecio al abrir**. El research describe
el Pitfall 2 sobre el CIERRE (`router.replace('/ruta/fija')`); la medicion enseña
que el enlace de apertura tiene el mismo defecto y llega antes. Componer bien el
cierre no sirve de nada si el `href` ya se llevo los parametros por delante.

**2. Un falso verde que ningun grep de contenedor encuentra.** Con un panel
abierto, Base UI marca el resto del documento como oculto para la accesibilidad.
Eso **no** produce falsos verdes en aserciones positivas (produce cuelgues: la
primera corrida del spike se colgo 120 s por esto), pero **si los produce en
aserciones negativas**: un `toHaveCount(0)` o un `not.toMatch` sobre la pagina de
detras pasa porque no ve nada. Y las dos aserciones de no rastreo son exactamente
de ese tipo. Queda escrito como regla para el 08-11.

## El inventario del barrido

**Los nueve puntos del grep, confirmados:** uno es un comentario y ocho son
codigo, todos en `e2e/finanzas.spec.ts`. Mas dos de un grep ampliado.

| Casilla | Cuantas | Donde |
|---|---|---|
| **SIGUE VÁLIDA** | 9 del grep + 1 de la ficha | Tablas de pagina que siguen siendo de pagina, la barra de navegacion, el desglose que ya acota por dialogo, y **el `toHaveURL(ancla=…)` de `finanzas.spec.ts:592`** |
| **EN RIESGO** | 2 del grep + 5 de la ficha | Las dos de no rastreo (`631`, `635`), la espera de URL, el bloque `Ahora mismo` y su `toBe(1)` |
| **MUERE** | 6, todas de la ficha | Los tres bloques que D8-4 saca, la etiqueta de cabecera, el par del bloque de pagos, y la linea que fecha el dato |

**La perdida sin sustituto, declarada:** `Al momento de abrir esta página.`
(`finanzas.spec.ts:627`) fijaba D-14, y §17.8 punto 8 la prohibe en un panel con
argumento. La decision es correcta **y** la cobertura se pierde: a partir de esta
fase ninguna prueba afirma que el admin sepa de cuando es el dato de `AHORA MISMO`.
La condicion de reapertura la pone el propio §17.8.

**La perdida de fondo, tambien declarada:** que el bloque de pagos **ignore el
filtro de periodo de arriba** era la unica asercion del repo que comprobaba esa
asimetria, y se va con el bloque.

**La regla que queda fijada:** una asercion retargeteada que no se probo en rojo
**no cuenta**. Cambiar `locator('main')` por `getByRole('dialog')` es una linea que
puede quedarse en verde sin mirar nada. El 08-11 corre el señuelo y **anota el
resultado real, no el predicho**; el 08-14 lo cruza fila por fila.

## Los dos sesgos del instrumento, y por que estan escritos

Los dos producian el resultado "el scroll se pierde", que es justo lo que se queria
medir. Sin encontrarlos, el veredicto habria sido el correcto **por la razon
equivocada**, y las instrucciones que salen de el habrian sido otras.

1. **`locator.click()` de Playwright hace `scrollIntoViewIfNeeded` antes de
   pulsar.** Con el enlace arriba y la pagina abajo, el runner sube la pagina y
   luego pulsa. Medido: `1969 -> 0` en un escenario que ni abria panel. Corregido
   disparando el clic desde el DOM.
2. **Con el panel abierto, `getByRole` deja de ver la pagina de detras.** La
   primera corrida se colgo 120 s esperando un `combobox` que estaba en el DOM.
   Corregido leyendo del DOM. Y es a la vez el hallazgo 2 de arriba.

**Ruido residual, declarado:** un clic disparado desde el DOM se pierde ~2 de 3
veces en grupo porque el localizador se resuelve dos veces y entre las dos React
puede reemplazar el nodo. Resuelto con reintento anotado. **Y cuando se pierde, la
URL no cambia y el scroll se queda intacto**, que es una confirmacion adicional de
quien lo mueve.

## El arbol, revertido y comprobado

| Comprobacion | Resultado |
|---|---|
| `git status --porcelain -- app components lib e2e` | **0 lineas** |
| `git diff --name-only` del plan | **2 archivos, los dos bajo `.planning/`** |
| `npx tsc --noEmit` | limpio |
| `npm run ci:arch` (los tres guardarrailes) | limpio |
| `npm run test:unit` | **1201 en verde**, 63 archivos |
| Las cinco suites del aseador | **23 pasando, 1 saltado, 0 rojos** |
| Diff sobre `app/(cleaner)` | **vacio** |

## Los dos primeros requisitos de Wave 0, tachados

De `08-VALIDATION.md`, seccion **Requisitos de la Wave 0**:

- [x] **Spike de medicion del criterio 1** sobre `/apartamentos`. Bloqueaba el
      diseño de las waves siguientes; ya no bloquea nada.
- [x] **Barrido de aserciones acotadas por contenedor**, con su clasificacion. *(La
      contra-prueba en rojo la ejecuta el 08-11: este plan tenia prohibido
      retargetear nada.)*
- [x] **Primer uso de `esperarUrlDeCliente()`**, que tenia cero consumidores. El
      spike fue su primer uso y confirmo que funciona; el que se queda en el arbol
      lo escribe el 08-11.

## Desviaciones del plan

### Ajustes automaticos

**1. [Regla 2 - Falta funcionalidad critica] El plan no pedia un escenario de control, y sin el la medicion no distinguia dos causas**

- **Encontrado en:** Task 1
- **Problema:** el plan pide medir "abrir el panel" y "cerrar el panel". Las dos
  cosas hacen dos cosas a la vez: navegar del lado del cliente **y** montar o
  desmontar un dialogo. Con solo esos dos escenarios, "el scroll se pierde" no
  distingue si lo pierde la navegacion o el bloqueo de scroll del dialogo, y las
  dos tienen arreglos distintos y de tamaños distintos.
- **Arreglo:** se añadio al andamio un `<Link href="?control=1" scroll={false}>`
  que navega **sin abrir panel**, y se midio igual. Resultado: pierde el scroll
  exactamente igual. Eso exculpa al panel y a `sheet.tsx`, que D8-5 y D8-6 dejan
  intocables.
- **Verificacion:** 3 corridas con `loading.tsx` (1969 -> 0) y 3 sin (1969 -> 1969).
- **Commiteado en:** `bd48530`

**2. [Regla 2 - Falta funcionalidad critica] El plan no pedia aislar la causa, y sin aislarla el veredicto no era accionable**

- **Encontrado en:** Task 1
- **Problema:** el plan escribe dos salidas condicionadas a **si el filtro se
  pierde**. El filtro no se pierde, asi que ninguna de las dos aplica, y el plan
  no dice que hacer con el scroll. Un veredicto que diga "se pierde" sin decir por
  que obliga al plan 08-06 a volver a investigar, que es exactamente lo que este
  plan existe para evitar.
- **Arreglo:** experimento A/B apartando `loading.tsx` del arbol y repitiendo la
  misma medicion, 3 corridas por rama y por ruta. La causa quedo aislada y la
  instruccion 2 del veredicto es ejecutable: borrar dos archivos.
- **Verificacion:** las seis ramas de la tabla de arriba.
- **Commiteado en:** `bd48530`

**3. [Regla 1 - Correccion] Dos sesgos del instrumento que producian el resultado buscado**

- **Encontrado en:** Task 1
- **Problema:** descritos arriba. El primero daba "el scroll se pierde" por el
  auto-scroll del runner; el segundo colgaba la medicion 120 s.
- **Arreglo:** clic desde el DOM y lectura del DOM en vez de por rol. Los dos
  quedan escritos en el documento, porque el segundo **es ademas un hallazgo de la
  fase** (el falso verde de las aserciones negativas con el panel abierto).
- **Verificacion:** con el sesgo 1 corregido, el escenario de control pasa de
  `1969 -> 0` sin causa aparente a `1969 -> 0` con causa medida y `1969 -> 1969`
  sin `loading.tsx`.
- **Commiteado en:** `bd48530`

**4. [Regla 3 - Bloqueante] El escenario B no tenia datos que mirar**

- **Encontrado en:** Task 1
- **Problema:** `cleanings` estaba vacia tras el `db:reset` del plan 08-01, asi que
  `/operacion` no tenia ni una fila y no habia enlace que pulsar ni altura que
  recorrer.
- **Arreglo:** `beforeAll` con `sembrarOperacion()` mas seis aseos repartidos entre
  hoy y mañana, y `afterAll` con `limpiarOperacion()`. Comprobado que la base queda
  como estaba, y ademas se corrio `db:reset` antes de la linea base E2E.
- **Commiteado en:** `bd48530`

### Fuera de alcance, anotado y NO arreglado

**`push-instalacion.spec.ts:215` se cae en la suite completa y solo ahi.** Aparece
en las dos corridas completas y no aparece corriendo ese archivo solo (5 pasando)
ni las cinco suites del aseador juntas (23 pasando). Cuando aparecio, el arbol era
bit a bit el de antes del plan. Es del arbol del aseador, que D8-10 saca del
alcance por completo. Queda en `deferred-items.md` con su medicion, su
reproducibilidad y una pista, **mas la correccion de la linea base E2E** que los
planes 08-11 y 08-14 necesitan saber: en la suite completa hoy son 133 pasando, 1
saltado y 1 rojo, no 134 y 1.

---

**Total de desviaciones:** 4 arregladas automaticamente (2 de Regla 2, 1 de Regla
1, 1 de Regla 3) y 1 hallazgo declarado fuera de alcance.
**Impacto sobre el alcance:** ninguno. Las dos de Regla 2 no amplian el alcance:
hacen que el entregable cumpla lo que el propio plan le pide, que es que el
veredicto se lea como instruccion y no como observacion.

## Lo que queda listo para lo que viene

- **08-06, 08-07 y 08-08** tienen ocho instrucciones numeradas que no hay que
  interpretar. La primera descarta una rama entera de trabajo; la segunda añade
  dos borrados que ningun plan tenia escritos.
- **08-11** tiene el inventario clasificado con archivo y linea, la regla de
  contra-prueba, y dos reglas de instrumento (`esperarUrlDeCliente()` para esperar,
  DOM para leer la pagina de detras con el panel abierto).
- **08-14** tiene una tabla que cruzar fila por fila y la linea base E2E corregida.
- **Nada del andamio sobrevive.** El diff del plan son dos archivos y los dos viven
  en `.planning/`.

---
*Fase: 08-paneles-laterales-en-el-admin*
*Terminado: 2026-09-17*

## Self-Check: PASSED

Los tres archivos del diff existen en disco (628, 54 y 371 lineas), los tres
hashes de commit existen en el historial, la seccion VEREDICTO esta en el
documento, y `git status --porcelain -- app components lib e2e` devuelve cero
lineas.
