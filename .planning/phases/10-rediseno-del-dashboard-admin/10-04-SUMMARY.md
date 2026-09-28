---
phase: 10-rediseno-del-dashboard-admin
plan: 04
subsystem: ui-login
status: checkpoint-pendiente
tags: [rediseno, derogacion, grid, a11y, aria-hidden, contraste, playwright, contract-test, wave-3]

requires:
  - phase: 10-rediseno-del-dashboard-admin
    provides: "10-01: `rejilla-login`, `PanelPublicidad` y los siete casos E2E de la geometría. 10-02: `PieDeLogin` y los dos glifos. 10-03: `page.contrato.test.ts`, el `revalidate` y los cinco casos E2E del pie"
provides:
  - "`/login` rediseñada contra la referencia de Runway: 50/50 sin canal, slot a sangre completa, bloque de login sin tarjeta, dos wordmarks y el pie dentro de la columna derecha"
  - "Cinco `data-slot` nuevos (`pantalla-login`, `columna-anuncio`, `wordmark-panel`, `columna-login`, `bloque-login`) y uno que desaparece de la pantalla (`card`)"
  - "`page.contrato.test.ts` con dos casos nuevos: la tarjeta no vuelve y la columna es la 2, con la medición de las ocho booleanas del filtro de comentarios en la cabecera"
  - "`e2e/login.spec.ts` con seis casos reescritos, tres nuevos y CERO borrados: 17 → 19 casos"
  - "`10-UI-SPEC.md`, `10-CONTEXT.md` y `.planning/ROADMAP.md` puestos de acuerdo con el código en el mismo plan, con D10-2 y D10-3 marcadas como derogadas y lo derogado conservado como registro"
  - "La infracción de contraste del wordmark blanco (1.27:1) registrada en §10.4 con la etiqueta correcta y su condición de salida heredada por la pregunta abierta 2 de `10-CONTEXT.md`"
affects:
  - "Ninguno pendiente de código. Lo que queda es el juicio humano de la Task 5, que SUSTITUYE al checkpoint abierto de 10-03"

tech-stack:
  added: []   # cero dependencias nuevas, verificado: package.json y package-lock.json fuera del diff contra 54ad2c0
  patterns:
    - "Un rediseño que deroga decisiones cerradas escribe la derogación en el MISMO plan que cambia el código, y conserva lo derogado como registro: el modo de fallo no es que el rediseño salga mal, es que dentro de tres meses alguien lea el contrato viejo y 'arregle' el código"
    - "Una aserción de sangrado se mide contra el contenedor de la pantalla y NUNCA contra el viewport cuando el layout resta una barra de cromo: medir contra el viewport da un rojo contra el código correcto, que es el rojo que hace que alguien arregle el producto para complacer al instrumento"
    - "Un texto que tiene que existir en el árbol de accesibilidad se defiende con `closest('[aria-hidden=\"true\"]')`, no con un localizador de texto: los localizadores de texto de Playwright no filtran subárboles `aria-hidden` y dan verde con el defecto puesto"
    - "Una infracción de accesibilidad aceptada por el dueño se registra con esa etiqueta y NO como exención, aunque viva al lado de una exención legítima: falsificar el registro es justo lo que un auditor tiene que poder detectar"
    - "Una prohibición se documenta en el código CON su forma literal (`Card`, `CardContent`, `lg:col-start-3`), y eso es lo que convierte el filtro de comentarios de la prueba de contrato en load-bearing y medible"
    - "Una aserción relativa (el pie contra su columna) y una absoluta (el reparto contra 640) se reparten el trabajo a propósito: la relativa sobrevive a un cambio de reparto legítimo y la absoluta es la que lo caza"

key-files:
  created:
    - ".planning/phases/10-rediseno-del-dashboard-admin/deferred-items.md"
  modified:
    - "app/globals.css"
    - "app/(public)/login/page.tsx"
    - "app/(public)/login/_components/PanelPublicidad.tsx"
    - "app/(public)/login/_components/PieDeLogin.tsx"
    - "app/(public)/login/page.contrato.test.ts"
    - "e2e/login.spec.ts"
    - ".planning/phases/10-rediseno-del-dashboard-admin/10-UI-SPEC.md"
    - ".planning/phases/10-rediseno-del-dashboard-admin/10-CONTEXT.md"
    - ".planning/ROADMAP.md"

key-decisions:
  - "El reparto pasa a 50/50 sin canal y el login a `lg:col-start-2`: deroga D10-2 y D10-3, decidido por el dueño el 2026-09-26 contra la pantalla de acceso de Runway (corte medido 50.3%)"
  - "El slot va a sangre completa y pierde recuadro, radio y relación de aspecto: deroga la CORRECCIÓN 2026-09-19 y con ella la razón de §3.2"
  - "El bloque del login pierde la `Card` y conserva sus 400px: la referencia no encierra el formulario en ninguna superficie"
  - "El wordmark del panel es HERMANO de `PanelPublicidad` y no hijo, porque la raíz del panel lleva `aria-hidden` y cualquier texto de dentro desaparece del árbol de accesibilidad sin que la pantalla cambie"
  - "El `<h1>` NO se muda al panel: dejaría al `<main>` sin encabezado y pondría el único encabezado de nivel 1 flotando sobre una región decorativa. El wordmark del panel es un `<p>` sin `aria-hidden`"
  - "El wordmark del panel va en blanco con 1.27:1 sobre el gris más claro: infracción de WCAG 1.4.3 conocida y ACEPTADA por el dueño, registrada en §10.4 como infracción y NO como exención, con condición de salida heredada por la pregunta abierta 2"
  - "El pie se muda dentro de la columna del login y deja de ser full-width, pero SIGUE fuera del `<main>`: esa regla no se deroga porque está medida (un `<footer>` dentro de `<main>` deja de mapear a `contentinfo`)"
  - "Las seis aserciones del diseño viejo se REESCRIBEN, ninguna se borra, y todas las nuevas se vieron en rojo con su señuelo antes de darse por buenas"

metrics:
  duration: "1h 43m"
  completed: 2026-09-28

actuals:
  tokens: 32923    # chars/4 sobre `git diff 5f8d6af..HEAD`. El estimate decía 95000: sobreestimado por 2.9x, y el número va sin maquillar
  tasks: 4         # de 5. La Task 5 es el checkpoint humano y está ABIERTA
  commits: 4       # MEDIDO: git rev-list --count 5f8d6af..HEAD
plan_head_before: 5f8d6afe6e064fb59f2e90855c803c035fac031d

requirements-completed: []   # el plan declara explícitamente que no hay ninguno nuevo

coverage:
  - deliverable: "El reparto 50/50 sin canal y el login en la columna 2"
    verification:
      - kind: e2e
        ref: "e2e/login.spec.ts#a 1280 la pantalla esta partida 50/50 sin canal y el login vive en la columna 2"
        status: pass
      - kind: unit
        ref: "app/(public)/login/page.contrato.test.ts#coloca el login en la columna 2, y la columna 3 ya no existe"
        status: pass
    human_judgment: false
  - deliverable: "El bloque del login sin tarjeta, con sus 400px"
    verification:
      - kind: e2e
        ref: "e2e/login.spec.ts#a 1280 ... toHaveCount(0) sobre [data-slot=\"card\"]"
        status: pass
      - kind: unit
        ref: "app/(public)/login/page.contrato.test.ts#no vuelve a encerrar el formulario en una tarjeta"
        status: pass
    human_judgment: false
  - deliverable: "El slot publicitario a sangre completa, sin recuadro, sin radio y sin relación de aspecto"
    verification:
      - kind: e2e
        ref: "e2e/login.spec.ts#el anuncio corre `ciclo-anuncio 20s linear infinite` y va a sangre completa"
        status: pass
      - kind: e2e
        ref: "e2e/login.spec.ts#el sangrado tambien se cumple a 1024, el viewport mas apretado"
        status: pass
    human_judgment: false
  - deliverable: "Los dos wordmarks, con el del panel en blanco y fuera del subárbol aria-hidden"
    verification:
      - kind: e2e
        ref: "e2e/login.spec.ts#el del panel dice VivaGuest, va en blanco, a 32px, y NO esta bajo aria-hidden"
        status: pass
    human_judgment: false
  - deliverable: "El pie dentro de la columna del login, única contentinfo fuera del <main>"
    verification:
      - kind: e2e
        ref: "e2e/login.spec.ts#es la unica contentinfo, mide 56px y ocupa el ancho de su columna"
        status: pass
      - kind: unit
        ref: "app/(public)/login/_components/PieDeLogin.test.ts#el elemento raiz es un footer con la clase exacta del contrato"
        status: pass
    human_judgment: false
  - deliverable: "La frontera de los cinco viewports (1440, 1280, 1024, 1023, 390)"
    verification:
      - kind: e2e
        ref: "e2e/login.spec.ts#El arranque del split y la holgura vertical (3 casos) + El pie del login en el telefono"
        status: pass
    human_judgment: false
  - deliverable: "Los tres contratos escritos (10-UI-SPEC, 10-CONTEXT, ROADMAP) de acuerdo con el código"
    verification:
      - kind: command
        ref: "grep DEROGACIÓN/Runway/1.27 en 10-UI-SPEC + 2x DEROGADA en 10-CONTEXT + 50/50 en ROADMAP + diff del ROADMAP < 30 líneas"
        status: pass
    human_judgment: false
  - deliverable: "Que la pantalla se lea como producto, que el fundido se perciba sobre la superficie nueva, que el gris a sangre completa no se lea como esqueleto de carga, y que el wordmark blanco se distinga durante el ciclo"
    human_judgment: true
    rationale: "Cuatro juicios perceptuales. Ningún instrumento de este repo puede emitirlos, y dos de ellos son los `🧪 backstop` de §13 que este rediseño volvió a abrir porque la superficie cambió de forma y de tamaño. Es la Task 5, y está ABIERTA."
---

# Phase 10 Plan 04: El rediseño contra la referencia de Runway — Summary

`/login` partida **50/50 sin canal**, con el slot publicitario **a sangre completa** en la mitad izquierda, el bloque de login **sin tarjeta**, **dos wordmarks** (el del panel en blanco y fuera del subárbol `aria-hidden`) y el pie **dentro de la columna derecha**; más los tres contratos escritos puestos de acuerdo con el código en el mismo plan, once señuelos con su rojo literal, y la suite completa en **171 pasados** con la base reseteada.

## Lo que quedó construido

| Archivo | Qué cambió |
|---|---|
| `app/globals.css` | `@utility rejilla-login` de `45% 10% 45%` a **`50% 50%`**, con el comentario reescrito: la derogación de D10-2 y D10-3 fechada, el 50.3% medido en Runway, y la frase de que ya no hay pista vacía. **Es el único cambio funcional del archivo**, y esa utilidad tiene un solo consumidor en todo el repo |
| `app/(public)/login/page.tsx` | El árbol entero. Cinco `data-slot` nuevos, la `Card` y su import fuera, `lg:col-start-2` en el envoltorio de la columna, el envoltorio `columna-anuncio` con el corte de `lg:`, el wordmark blanco como hermano del panel, y el pie mudado dentro de la columna |
| `app/(public)/login/_components/PanelPublicidad.tsx` | Fuera el `p-xl`, el `place-items-center`, el `aspect-[0.93]`, el `max-h-full` y el `rounded-2xl`. **Se conservan** `overflow-hidden`, `bg-anuncio-1`, `animate-anuncio`, el `children` y los tres comentarios load-bearing |
| `app/(public)/login/_components/PieDeLogin.tsx` | **Solo la cabecera.** La `className` es byte a byte la misma, y sus 12 casos unitarios lo demuestran |
| `app/(public)/login/page.contrato.test.ts` | **2 casos nuevos** (12 en total). Los 10 de 10-03 intactos |
| `e2e/login.spec.ts` | **17 → 19 casos.** Seis reescritos, tres nuevos, **cero borrados** |
| `10-UI-SPEC.md` | Bloque `DEROGACIÓN 2026-09-26` arriba del todo, y catorce secciones actualizadas |
| `10-CONTEXT.md` | D10-2 y D10-3 marcadas `DEROGADA 2026-09-26` sin tocar su texto ni sus citas, y la pregunta abierta 2 heredando la obligación del wordmark |
| `.planning/ROADMAP.md` | Solo la línea de objetivo de la Fase 10 |

**Medido en el navegador a 1280x720, con la barra de ambiente de pruebas puesta:**

| | x | y | ancho | alto |
|---|---|---|---|---|
| `pantalla-login` | 0 | **48** | 1280 | 672 |
| `panel-publicidad` | 0 | 48 | **640** | **672** |
| `anuncio` | 0 | 48 | 640 | 672 |
| `columna-login` | **640** | 48 | **640** | 672 |
| `bloque-login` | 760 | — | **400** | — |
| pie | **640** | — | **640** | **56** |

El hueco entre las dos columnas es **0**. El borde inferior del panel coincide con el del contenedor: el pie no cruza a la mitad izquierda.

## Los once señuelos, con su rojo literal

La regla del repo: ninguna aserción cuenta hasta haberla visto en rojo. **Cuatro de los once obligaron a corridas extra de aislamiento**, y de ahí salieron los cuatro hallazgos de abajo.

### Task 1 — la rejilla, la columna y la tarjeta

**Señuelo 1 — volver la utilidad a `45% 10% 45%`.**

```
Expected: 640
Received: 576
  at expect(Math.round(cajaPanel.width)).toBe(640)
```

**Aislamiento 1b y 1c**, porque el señuelo 1 con `col-start-2` deja la columna del login en la pista del canal (128px) y **el hueco sigue siendo 0**: la aserción del canal no cae. Con la geometría vieja COMPLETA (`45/10/45` + `col-start-3`) y los anchos silenciados:

```
Expected: <= 1
Received:    128
```

**Veredicto:** la aserción del hueco cero tiene dientes propios, pero solo contra la regresión completa. Contra "devolver el canal y dejar el login en la columna 2" quien cae es la medida de ancho del bloque (`Expected: 400 / Received: 80`).

**Señuelo 2 — devolver el login a la columna 3.** Cayeron los DOS instrumentos.

```
# E2E
Expected: 640
Received: 174          ← la columna cae en una tercera pista implícita de ancho auto

# prueba de contrato
AssertionError: expected 'import type { Metadata } from \'next\…' to contain 'lg:col-start-2'
```

**Señuelo 3 — devolver la `Card` alrededor del formulario. Y aquí hay un hallazgo.**

Primera versión, con el `data-slot="bloque-login"` puesto sobre la propia `<Card>`:

```
# prueba de contrato: ROJO
AssertionError: expected 'import type { Metadata } from \'next\…' not to contain '@/components/ui/card'

# E2E: VERDE
```

**El conteo en cero de `[data-slot="card"]` NO cayó**, porque la prop explícita pisa el `data-slot="card"` que emite la primitiva. **Señuelo 3b**, con la `<Card>` envolviendo al bloque (que es la forma en la que de verdad volvería):

```
Expected: 0
Received: 1
  - waiting for locator('[data-slot="card"]')
    14 × locator resolved to 1 element
```

**Veredicto:** los dos instrumentos tienen dientes, pero **solo la compuerta estática es indeslizable**. La del navegador depende de que la primitiva conserve su propio `data-slot`, y eso se anula con una prop.

### Task 2 — el sangrado y el wordmark

**Señuelo 1 — `p-xl` de vuelta en la raíz del panel.**

```
Expected: <= 1
Received:    24
  at expect(Math.abs(cajaAnuncio.x - cajaPanel.x))
```

**Señuelo 2 — `aspect-[0.93] max-h-full` de vuelta. NO PUSO NADA EN ROJO, y es el hallazgo más útil de los once.**

A 1280x720 la columna mide 640 sobre una región de 672, o sea una proporción de **0.952**. Con `aspect-[0.93]` el elemento animado pide 688 de alto, `max-h-full` lo recorta contra un contenedor **que crece con él**, y la caja del anuncio **sigue siendo idéntica a la de su panel**. Medido:

```
1280x720  panel {w:640, h:688}  anuncio {w:640, h:688}  pantalla {h:744}
1920x1080 panel {w:960, h:1032} anuncio {w:960, h:1032} pantalla {h:1088}
```

La igualdad de cajas pasaba en verde contra el defecto. Lo que sí cambiaba era el **alto de la pantalla**: 744 contra los 672 correctos, o sea scroll vertical en una pantalla de acceso. Se añadieron **dos aserciones** que el plan no enumeraba, y con ellas el señuelo cae por los dos lados:

```
# la pantalla no crece (1280x720)
expect(recorrido1280.alto).toBeLessThanOrEqual(recorrido1280.visible)   ← ROJO

# el sangrado a 1024x768, donde la proporción es 0.711 y el recorte sí muerde
Expected: <= 1
Received:    113.46875
```

**Señuelo 3 — `rounded-2xl` de vuelta.**

```
Expected: "0px"
Received: "10.8px"
```

**Señuelo 4 — el wordmark DENTRO de `PanelPublicidad`.**

```
Expected: false
Received: true
  at expect(sondas.bajoAriaHidden).toBe(false)
```

**Aislamiento 4b**, que es la medición que justifica la elección del instrumento: con el señuelo puesto y el `closest` silenciado, **el caso entero pasa en VERDE**. El texto, el conteo de `<h1>`, el color y las dos posiciones de 32px no distinguen el defecto. Y además:

```
AISLAMIENTO 4b · getByText(VivaGuest) encuentra: 3
```

**Veredicto:** un `getByText('VivaGuest')` habría dado el visto bueno a un wordmark que no existe para un lector de pantalla. Es el mismo hallazgo de clase que el `toBeDisabled()` de 10-03.

**Señuelo 5 — borrar `bg-anuncio-1` del elemento animado** (trampa 3 de §11.5, la clase que la primera limpieza borra por "duplicada"):

```
Expected: "oklch(0.92 0.0045 250)"
Received: "rgba(0, 0, 0, 0)"
```

El panel **literalmente transparente**, justo para quien pidió menos movimiento.

**Señuelo 6 — el wordmark en `text-foreground`.**

```
Expected: "rgb(255, 255, 255)"
Received: "oklch(0.2101 0.0318 264.66)"
```

**Aislamiento 6b**, con la mitad positiva silenciada:

```
Expected: not "oklch(0.2101 0.0318 264.66)"
```

**Veredicto:** las dos mitades de la aserción de color tienen dientes independientes.

### Task 3 — el pie

**Señuelo 1 — el pie de vuelta al contenedor de la pantalla (full-width).**

```
Expected: 640
Received: 0
  at expect(Math.round(cajaPie.x)).toBe(Math.round(cajaColumna.x))
```

**Señuelo 2 — el pie DENTRO del `<main>`.** Repite exactamente lo que 10-03 midió: **no cae la cuenta de `main footer`, cae la `contentinfo`**, y el caso muere antes de llegar a ella.

```
Error: expect(locator).toBeVisible() failed
  at const pie = page.getByRole('contentinfo'); await expect(pie).toBeVisible();
```

**Aislamiento 2b**, con la cuenta de `main footer` adelantada: cae por su cuenta. Los dos instrumentos son independientes y el árbol de accesibilidad reacciona primero.

**Señuelo 3 — `lg:px-xl` → `lg:px-lg` en `PieDeLogin`.** Cayeron los DOS instrumentos.

```
# unitaria (la cadena literal de className)
× el elemento raiz es un footer con la clase exacta del contrato
Expected: "...lg:px-xl lg:py-0"
Received: "...lg:px-lg lg:py-0"
Tests  1 failed | 11 passed (12)

# E2E
at expect(Math.round(cajaCopyright.x - cajaColumna.x)).toBe(24)
```

**Señuelo 4 — el reparto a `45% 55%`. NO puso en rojo el caso del pie, y era lo esperado.**

Las cuatro aserciones del pie son **relativas a su columna** (`pie.x === columna.x`, `pie.width === columna.width`), así que sobreviven a un cambio de reparto por diseño. Quien lo caza es el caso del split, que es el dueño de la constante:

```
Expected: 640
Received: 576
```

**Veredicto:** el reparto de trabajo es el correcto. La aserción relativa demuestra que el pie mide contra su columna y no contra un número escrito a mano; la absoluta es la que defiende el número.

### Sin residuo

`git diff --stat HEAD -- app/ e2e/` vacío antes de cada verificación final, y comprobado por `grep -rn "SENUELO\|AISLAMIENTO"` sobre `app/(public)/login/`, `e2e/login.spec.ts` y `app/globals.css`: ninguno.

## Los cuatro hallazgos que los señuelos destaparon

1. **Una aserción de igualdad de cajas puede pasar en verde contra la relación de aspecto que persigue, si el contenedor crece con el elemento.** Costó dos aserciones nuevas que el plan no enumeraba, y la segunda mide en el viewport apretado a propósito: es el único donde el recorte muerde de verdad. Sin esto, el señuelo 2 de la Task 2 habría quedado anotado como "no puso nada en rojo" y la tarjeta podría volver sin que nada se enterara.
2. **Un `data-slot` de una primitiva se anula con una prop**, así que una compuerta de navegador construida sobre él es esquivable sin querer. La compuerta estática que lee el código fuente no lo es. Las dos se quedan puestas, y ahora se sabe cuál lleva el peso.
3. **Un localizador de texto de Playwright encuentra 3 elementos con el wordmark metido dentro del subárbol `aria-hidden`.** Medido, no razonado. El `closest` es la única de las seis aserciones del caso que distingue el defecto.
4. **El reparto de trabajo entre aserción relativa y absoluta es una decisión, no una casualidad.** El señuelo 4 de la Task 3 lo demuestra por ausencia: el pie no se inmuta ante un cambio de reparto legítimo, y el split se pone rojo. Si las dos midieran contra constantes, un cambio de reparto obligaría a editar dos sitios y el segundo se olvidaría.

## Casos que CORRIERON, no códigos de salida

Todo con `npm run db:reset` inmediatamente antes de la suite E2E.

| Capa | Comando | Resultado |
|---|---|---|
| Arquitectura | `npm run ci:arch` | `check-service-role: OK`, `check-max-w-tallas: OK`, `check-escala-movil: OK` |
| Tipos | `npx tsc --noEmit` | sin errores |
| Unitarias | `npm run test:unit` | **68 archivos, 1272 casos**, todos verdes |
| Integración | `npm run test:integration` | 23 archivos, **203 pasados · 2 fallados** — los dos ajenos a este plan, ver abajo |
| pgTAP | `npm run db:test` | **13 archivos, 389 casos** — `All tests successful. Result: PASS` |
| E2E completa | `PLAYWRIGHT_PORT=3210 npx playwright test` | **171 pasados · 2 fallados · 1 saltado**, 9.7 min |
| E2E de `/login` | `... npx playwright test e2e/login.spec.ts` | **19 de 19 verdes** |
| Build | `npm run build` | verde; `/login` sigue en `○ (Static)` con `Revalidate 1h · Expire 1y` |

**Las unitarias suben de 1270 a 1272:** los dos casos nuevos de `page.contrato.test.ts`. Ninguno en `skip`.

**La suite E2E son 174 casos en total.** La línea base de 10-03 era 171 + 1 saltado = 172; este plan añade 2 casos a `login.spec.ts` (17 → 19), o sea 174. **Cero casos borrados**, y los seis del diseño viejo están reescritos.

## Las cuatro compuertas de forma

| Compuerta | Resultado |
|---|---|
| Blob de `FormularioLogin.tsx` contra `54ad2c0` | `e2c276ede315dc6a7246331fe08721be1b276e14` **en los dos lados** |
| Los cinco títulos originales de login | los cinco presentes |
| `package.json` / `package-lock.json` en el diff contra `54ad2c0` | **ausentes** — cero dependencias nuevas (T-10-SC cerrado) |
| `className` de `PieDeLogin` | sin cambios; sus 12 casos unitarios verdes. El diff del archivo son 14 líneas añadidas y 2 borradas, **todas de comentario** |
| Diff del `ROADMAP.md` contra `54ad2c0` | **16 líneas** (umbral: < 30). Solo la entrada de la Fase 10 |

**La compuerta de "cero borrados" NO aplica en este plan y el propio plan lo declara:** reescribir seis casos produce borrados por definición. `git diff --numstat 54ad2c0 -- e2e/login.spec.ts` da `298 73`.

## Deviations from Plan

### 1. [Rule 3 - Bloqueo] El orden de las tareas obligaba a mover cuatro ediciones del E2E de la Task 3 a las Tasks 1 y 2

- **Lo que el plan decía:** la Task 1 cambia el reparto y quita la `Card`; las ediciones de las líneas 352, 361 y 380 (`[data-slot="card"]` y la cifra de 30.4) son de la Task 3, y la aserción de alineación del pie contra la tarjeta del anuncio también.
- **Lo que pasó:** esas aserciones dejan de tener referente **en el instante en que la Task 1 quita la `Card`** y en el que la Task 2 lleva el panel a sangre completa. Dejarlas para la Task 3 habría dejado las Tasks 1 y 2 en rojo, y el plan exige que cada task cierre verde y commiteada.
- **Qué se hizo:** en la Task 1, los tres localizadores de la tarjeta pasan a `[data-slot="bloque-login"]` y la cifra del aire a 1024 pasa de 30.4 a 56. En la Task 2 cae la aserción de alineación contra la tarjeta del anuncio, con su razón escrita al lado. **La Task 3 hizo su reescritura completa igual** (títulos, aritmética de la cabecera, las cuatro aserciones nuevas del pie contra su columna y la del borde inferior del panel): lo que se adelantó es el mínimo para no dejar rojo por el camino, no el trabajo.
- **Ni una aserción se relajó para ponerse verde.** La única que desaparece sin sustituta inmediata es la alineación copyright↔tarjeta del anuncio, y desaparece porque **su referente dejó de existir**; la Task 3 la sustituye por cuatro medidas contra la columna, que son más estrictas.

### 2. [Rule 2 - Correctitud] Dos aserciones E2E que el plan no enumeraba, y un caso nuevo

El señuelo 2 de la Task 2 no ponía nada en rojo (hallazgo 1). Se añadieron `expect(scrollHeight <= clientHeight)` a 1280 y un caso nuevo, `el sangrado tambien se cumple a 1024, el viewport mas apretado`, con la razón medida escrita en su cabecera. Sin ellas, la relación de aspecto derogada podía volver sin que nada se enterara.

### 3. [Rule 2 - Correctitud] `page.tsx` documenta también la prohibición de la tarjeta con su forma literal

El plan pedía que el comentario de derogación nombrara `lg:col-start-3` y el 45%, "o sea que el filtro de líneas de comentario pasa a ser load-bearing para DOS aserciones más". Con solo `col-start-3` escrito, el filtro solo era load-bearing para **una**. Se añadieron `Card`, `CardContent` y `@/components/ui/card` con su forma literal al comentario de cabecera, que es el mismo patrón que el hallazgo 1 de 10-03 estableció. Las ocho booleanas quedan medidas en la cabecera del `describe`:

```
SIN filtro, col-start-3          presente: true    CON filtro: false
SIN filtro, CardContent          presente: true    CON filtro: false
SIN filtro, @/components/ui/card presente: true    CON filtro: false
SIN filtro, Card                 presente: true    CON filtro: false
```

### 4. [Rule 2 - Correctitud] Seis secciones más del UI-SPEC de las ocho que el plan enumeraba

El criterio de aceptación dice que **ninguna sección puede seguir afirmando** el 45/10/45, la tarjeta insertada, la relación de aspecto ni el pie full-width. Además de §2, §3, §7.3, §8.1, §10.1, §11.5, §13 y §15, seguían contradiciendo el código: **§0** (dos filas de la tabla de hechos anclados), **§1.2** (dos filas de alternativas descartadas, una de ellas justificando el pie full-width con la alineación contra la tarjeta), **§7.4** (los 816×889 de la tarjeta), **§11.1** (la fila de `Card`/`CardContent`) y **§11.2** (la descripción de `PanelPublicidad` con `p-xl` y `rounded-2xl`, y la de `PieDeLogin`). Todas actualizadas, ninguna borrada.

### 5. [Fuera de alcance] El stack local de Supabase no arranca completo en esta máquina

`npx supabase start` falla con `LegacyHealthCheckTimeoutError` en `analytics`, `vector`, `realtime`, `storage` y `studio`: Docker Desktop tiene 4 GB y los comparte con contenedores de otros dos proyectos del usuario. Se levantó con `npx supabase start -x vector,logflare,studio,imgproxy,realtime,edge-runtime`, **sin tocar `supabase/config.toml`**, que deja arriba `db`, `auth`, `rest`, `kong`, `storage`, `pg_meta` e `inbucket`. Detalle y consecuencias en `deferred-items.md`.

## Issues Encountered — tres rojos ajenos a este plan

**Ninguno lo causó el rediseño, y no es una opinión:** el diff completo son nueve archivos, ninguno fuera de `app/(public)/login/`, `app/globals.css`, `e2e/login.spec.ts` y `.planning/`; el único archivo global tocado es `app/globals.css` y su **único cambio funcional** es el valor de `grid-template-columns` dentro de `@utility rejilla-login`, **cuyo único consumidor en todo el repo es `app/(public)/login/page.tsx`**. Ningún token cambió de valor.

1. **`lib/domain/sync-diff.integration.test.ts`, 2 casos.** `FECHA_VIEJA = '2026-09-27'` y hoy es 2026-09-28: la fecha cayó al pasado y el diff ya no cancela el aseo, así que `cleanings_cancelled` sale 0 donde el caso espera 1. **Es exactamente la bomba que la cabecera de ese archivo advierte** en sus líneas 43 a 50. Corrían verdes el 2026-09-19 (lo reporta `10-03-SUMMARY.md`).
2. **`e2e/operacion.spec.ts:429`.** `Ver cancelados (1)` no aparece. Reproducible con la base reseteada.
3. **`e2e/push-instalacion.spec.ts:97`.** `Test timeout of 30000ms exceeded`. El stack local corre sin `edge-runtime` por el punto 5 de arriba.

Los tres quedan en `deferred-items.md` con su diagnóstico y en `.planning/WINDOWS.md`.

## Threat Flags

Ninguno nuevo. Las seis entradas del `<threat_model>` del plan quedan así:

| ID | Estado |
|---|---|
| T-10-02 (ISR + lectura de sesión) | **mitigado**: los diez casos de `page.contrato.test.ts` siguen intactos y verdes tras reestructurar el árbol entero. Ni `cookies()`, ni `headers()`, ni cliente de Supabase, ni `force-dynamic` |
| T-10-09 (los selectores de los que cuelga la suite) | **mitigado y medido**: cinco `data-slot` nuevos y uno muerto, con 171 casos en verde y la base reseteada, incluido el `iniciarSesionPorUI()` del que cuelgan ~155 |
| T-10-11 (el wordmark fuera del árbol de accesibilidad) | **mitigado y visto en rojo**: el `closest` cae con el señuelo 4, y está medido que un localizador de texto NO |
| T-10-12 (el wordmark blanco) | **aceptado**, como declaraba el plan, y registrado en §10.4 como infracción con condición de salida heredada por la pregunta abierta 2 |
| T-10-13 (el contrato contradiciendo al código) | **mitigado**: los tres documentos actualizados en el mismo plan, con lo derogado conservado |
| T-10-SC (instalaciones) | cerrado por compuerta automática: `package.json` y `package-lock.json` fuera del diff contra `54ad2c0` |

## Known Stubs

Ninguno nuevo. El único de la fase sigue siendo el `children` de `PanelPublicidad` sin consumidor, declarado intencional en 10-01 y atado a la pregunta abierta 2 de `10-CONTEXT.md`.

## El checkpoint de 10-03 queda SUPERADO por este rediseño

`10-03-SUMMARY.md` dejó su Task 4 abierta con dos juicios humanos pendientes: la percepción del fundido entre los cuatro grises, y la legibilidad de los dos glifos a 16px. **Ese checkpoint no se repite: queda sustituido por la Task 5 de este plan.** El fundido y los glifos siguen existiendo, pero la forma en la que viven cambió por completo: el ciclo corre ahora sobre una superficie a sangre completa de 640×672 en vez de una tarjeta de 528×596 con radio y recuadro, y los glifos se movieron del borde de la pantalla al borde de la columna del login. Un juicio emitido sobre la pantalla vieja no dice nada de la nueva.

Y el rediseño **abre una pregunta que no existía**: la razón 2 de la §3.1 derogada decía que un gris a sangre completa contra el borde del navegador es indistinguible de un esqueleto de carga, y ese marco ya no está. Esa pregunta también va al checkpoint.

## La Task 5 está ABIERTA: el checkpoint humano

`status: checkpoint-pendiente` y no `complete`, a propósito, igual que hizo 10-03. La Task 5 es un checkpoint `gate="blocking"` y los cuatro juicios que pide no los puede emitir ningún instrumento de este repo ni este ejecutor.

**El entorno está levantado y esperando.** Cuando el juicio esté emitido va a este SUMMARY: los seis puntos del `how-to-verify` con las palabras del humano si dijo algo distinto de "bien", el resultado de la comprobación de movimiento reducido si se hizo, y el paso de `status` a `complete`.

**Tres reglas para el reanudado, y ninguna es opcional:**

1. **Si el fundido no se percibe:** no se cambian los cuatro grises por cuenta propia. Salen de §6.1 con sus contrastes medidos y separarlos más es decisión del dueño. Se registra como hallazgo con los cuatro valores (`#E2E5E7`, `#D6D9DD`, `#CACED3`, `#BEC3C8`) y su contraste adyacente (1.115, 1.119, 1.123).
2. **Si el wordmark blanco se pierde en el gris más claro:** la salida es **un velo detrás del wordmark**, y NO cambiarle el color (decisión cerrada) ni oscurecer §6.1 (reabre el juicio del fundido). Se implementa solo si cabe en el propio wordmark, con tokens de la escala; si pide tocar §6.1, va a un plan aparte. En cualquier caso se anota con sus palabras y §10.4 se actualiza.
3. **Si un glifo está mal:** se corrige solo su `<path>` en `IconosRedes.tsx`, se vuelve a correr `npm run ci:arch` y `npm run test:unit`, y se anota.

## Self-Check: PASSED

- `app/(public)/login/page.tsx`, `PanelPublicidad.tsx`, `PieDeLogin.tsx`, `page.contrato.test.ts`, `e2e/login.spec.ts`, `app/globals.css` — los seis existen en disco y están modificados
- `.planning/phases/10-rediseno-del-dashboard-admin/deferred-items.md` — existe en disco
- Los cuatro commits existen en `git log --all`: `08ace39`, `b410dfa`, `b2257cd`, `a24a4f9`
- `git rev-list --count 5f8d6af..HEAD` = **4**, que coincide con `commits: 4` del frontmatter. Este plan corrió solo en la wave 3, así que el número de la rama y el del plan son el mismo
- Las cuatro compuertas de forma verificadas, con sus salidas anotadas arriba
