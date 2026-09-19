---
phase: 10-rediseno-del-dashboard-admin
plan: 03
subsystem: ui-login
status: checkpoint-pendiente
tags: [isr, revalidate, timezone, a11y, focus-trap, playwright, contract-test, wave-2]

requires:
  - phase: 10-rediseno-del-dashboard-admin
    provides: "10-01: la rejilla `rejilla-login`, `PanelPublicidad` y los siete casos E2E de la geometría. 10-02: `PieDeLogin` como función pura de `anio: string` y los dos glifos de marca"
provides:
  - "`/login` con el pie VISIBLE y el año de Bogotá: `hoyBog().slice(0, 4)` como único lector de reloj de la pantalla"
  - "`export const revalidate = 3600`: la ruta deja de ser HTML congelado en el build. Medido en el build — `/login` pasa a `Revalidate 1h · Expire 1y`"
  - "`page.contrato.test.ts`: 10 casos que leen el código fuente filtrando líneas de comentario. Cubre el año, la ventana de revalidación y T-10-02 (la ruta es ISR, su HTML se comparte, no puede leer sesión)"
  - "5 casos E2E del pie: la única `contentinfo` fuera del `<main>`, los 56px, la alineación de 24px con la tarjeta del anuncio, el apilado del teléfono, y los dos iconos que no reciben foco ni entran al orden de tabulación"
  - "La verificación completa con la base reseteada, que cierra el `unrun-verify` que 10-01 dejó abierto en `.planning/WINDOWS.md` (entrada 3, ahora `fixed`)"
affects:
  - "Ninguno pendiente. Es el último plan de la fase; lo que queda es el juicio humano de la Task 4"

tech-stack:
  added: []   # cero dependencias nuevas, verificable: package.json y package-lock.json fuera del diff de la fase
  patterns:
    - "Un defecto que no tiene instrumento de runtime se cierra con una prueba que LEE el código fuente, con el mismo filtro de líneas de comentario que usa `ci:arch`, y con la razón escrita en la cabecera para que no la borren por parecer vacía"
    - "El filtro de comentarios se documenta con la MEDICIÓN de qué aserciones serían rojo permanente sin él, no con la afirmación de que hace falta"
    - "El valor esperado de una prueba de fechas NUNCA sale del helper del producto ni del reloj del proceso: se calcula en el test con un formateador de zona explícito, o la prueba comparte el defecto que persigue"
    - "Un estado de accesibilidad se afirma por su CONSECUENCIA medida en el motor (`el.focus()` + `document.activeElement`), no por su atributo: `@base-ui/react` emite `tabindex=\"0\"` junto con `disabled`"
    - "Un matcher que acepta dos estados distintos como iguales (`toBeDisabled()` ante `disabled` y ante `aria-disabled`) no sirve de compuerta entre ellos, y eso se demuestra poniéndolo en verde sobre el caso prohibido"

key-files:
  created:
    - "app/(public)/login/page.contrato.test.ts"
  modified:
    - "app/(public)/login/page.tsx"
    - "e2e/login.spec.ts"

key-decisions:
  - "El año llega al pie por prop desde `page.tsx` con `hoyBog().slice(0, 4)`: un solo lector de reloj en la pantalla, y el pie verificable sin intervenir el tiempo"
  - "`revalidate = 3600` y no `force-dynamic`: la deuda de §15.7 (el primer visitante tras medianoche del 1 de enero ve el año anterior) se acepta a cambio de conservar el HTML estático en todas las demás visitas"
  - "`page.tsx` documenta la prohibición CON su forma literal `new Date().getFullYear()`, que es lo que convierte el filtro de comentarios de la prueba de contrato en load-bearing y medible"
  - "El año esperado del E2E se calcula con `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' })` y NO importando `hoyBog()`: un instrumento que comparte el helper con el producto no distingue un helper roto de uno correcto"
  - "Las dos aserciones del texto del pie usan `toHaveText` y no `getByText(...)` + `toBeVisible()`: las dos caen, pero solo la primera nombra el año que salió"
  - "No se usa `toBeDisabled()` para el foco, y quedó MEDIDO por qué: con la trampa puesta pasa en verde"

metrics:
  duration: "~55min"
  completed: 2026-09-19

actuals:
  tokens: 5264      # chars/4: los dos archivos de `app/(public)/login/` completos + las líneas añadidas a `e2e/login.spec.ts`. El estimate decía 58000: fallado por 11x, y el número va sin maquillar
  tasks: 3          # de 4. La Task 4 es el checkpoint humano y está ABIERTA
  commits: 5        # MEDIDO: git rev-list --count a01a1b6..HEAD
plan_head_before: a01a1b677a3a8cae342482e8df3c0cc124e8fe45

requirements-completed: []   # el plan declara explícitamente que no hay ninguno nuevo: PLAT-01 y PLAT-02 ya estaban entregados y esta fase no cambia su comportamiento
---

# Phase 10 Plan 03: El año que sale de Bogotá, y el pie cableado — Summary

El pie ya se ve en `/login` con el año de **Bogotá** y no el del proceso ni el del deploy, defendido por una prueba que lee código fuente porque los dos defectos que persigue no tienen instrumento de runtime; más 5 aserciones del pie en el navegador, seis señuelos con su rojo literal, y la suite completa de **171 casos** en verde con la base reseteada.

## Lo que quedó construido

| Archivo | Qué es |
|---|---|
| `app/(public)/login/page.tsx` | `export const revalidate = 3600` con su razón literal, `<PieDeLogin anio={hoyBog().slice(0, 4)} />` como hermano de la región del split y **fuera del `<main>`**, y la prohibición de `new Date().getFullYear()` documentada con su forma literal |
| `app/(public)/login/page.contrato.test.ts` | **10 casos**. Lee su hermano `page.tsx`, descarta las líneas de comentario y afirma sobre el código ejecutable: el `revalidate`, el helper del dominio, la ausencia de lectores del reloj del proceso, la ausencia de nombre de zona a mano, y T-10-02 (ni cookies, ni cabeceras, ni cliente de Supabase, ni `force-dynamic`) |
| `e2e/login.spec.ts` | **5 casos nuevos** en tres `describe`, añadidos DESPUÉS de los doce existentes. Cero líneas borradas (`git diff 62d4d25 --numstat` → `479  0`) |

**Medido en el build, y es la prueba de que el `revalidate` hace algo:** `/login` pasó de no tener columna de revalidación a `Revalidate 1h · Expire 1y`. Antes era HTML del build y nunca revalidado; ahora tiene ventana.

**Medido en el HTML servido por `next start`:**

```
<footer class="flex flex-col items-center gap-sm px-lg py-lg lg:h-barra lg:flex-row lg:justify-between lg:px-xl lg:py-0">
  <p class="text-micro text-muted-foreground">© <!-- -->2026<!-- --> VivaGuest. Todos los derechos reservados.</p>
  <div class="flex items-center gap-xs">
    <button type="button" data-disabled="" tabindex="0" disabled="" data-slot="button" aria-label="Instagram, aún no disponible" ...>
```

El `tabindex="0"` junto a `disabled=""` es la medición de 10-02 confirmada en producción local. Es exactamente la razón por la que la aserción de foco de este plan mide la **consecuencia** y no el atributo.

## Los seis señuelos, con su rojo literal

La regla del repo: ninguna aserción cuenta hasta haberla visto en rojo. Uno a uno, se metió, se corrió el comando que lo caza, se anotó el mensaje literal y se quitó antes del siguiente. **Tres de los seis obligaron a corridas extra de aislamiento** (1 re-corrida, 4b, 5b, 6b, 6c), y de ahí salieron los tres hallazgos de abajo.

### Señuelo 1 — el reloj del proceso. Cayeron TRES aserciones

`page.tsx`: `anio={hoyBog().slice(0, 4)}` → `anio={String(new Date().getFullYear())}`.

```
× toma el ano de hoyBog() cortando los cuatro primeros caracteres
  AssertionError: expected 'import type { Metadata } from \'next\…' to match /hoyBog\(\)\.slice\(\s*0\s*,\s*4\s*\)/
× no lee el ano del reloj del proceso
  AssertionError: expected 'import type { Metadata } from \'next\…' not to contain 'getFullYear'
× no construye ninguna fecha nueva
  AssertionError: expected 'import type { Metadata } from \'next\…' not to match /new\s+Date\s*\(/
Tests  3 failed | 7 passed (10)
```

Es el señuelo central del plan: el defecto que §0.1 hallazgo C describe y que ningún navegador de esta suite puede ver. Tres aserciones independientes lo cazaron desde tres ángulos.

**Y destapó algo sobre la prueba:** dentro del primer caso, `expect(CODIGO).toContain('hoyBog')` **NO** cayó, porque la línea `import { hoyBog } from '@/lib/domain/dates'` sobrevive a la sustitución. La aserción con dientes es la del `.slice(0, 4)`, no la de la presencia del nombre. La de presencia se queda como cinturón, igual que el `x >= 640` de 10-01: valor residual, no nulo.

### Señuelo 2 — la ventana de revalidación borrada. Cayó UNO y solo uno

`page.tsx`: fuera la línea `export const revalidate = 3600;`.

```
× exporta revalidate con valor 3600
  AssertionError: expected 'import type { Metadata } from \'next\…' to match /export\s+const\s+revalidate\s*=\s*360…/
Tests  1 failed | 9 passed (10)
```

Sin esta compuerta el año se congela en el del deploy y nadie lo nota hasta enero.

### Señuelo 3 — el año escrito a mano. Cayeron DOS, y corrigieron el instrumento

`page.tsx`: `anio="2019"`.

**Primera corrida**, con el instrumento como lo pedía el plan (`getByText(copyright, { exact: true })` + `toBeVisible()`): `2 failed / 15 passed`, los dos casos correctos. Pero el mensaje era

```
Error: expect(locator).toBeVisible() failed
Expected: visible
Error: element(s) not found
```

que **no dice qué año salió**. Ver el hallazgo 2 de abajo. **Segunda corrida**, con `toHaveText`:

```
Error: expect(locator).toHaveText(expected) failed
Locator:  getByRole('contentinfo').locator('p')
Expected: "© 2026 VivaGuest. Todos los derechos reservados."
Received: "© 2019 VivaGuest. Todos los derechos reservados."
```

Y esto es además la prueba de que el año esperado del test se calcula **independiente** del producto: el test dijo 2026 con el producto diciendo 2019.

### Señuelo 4 — el pie dentro del `main`. Cayeron DOS, y no por la aserción prevista

`page.tsx`: el `<PieDeLogin>` movido dentro del `<main>`.

```
✘ El pie del login a partir de lg: › es la unica contentinfo, mide 56px y alinea...
✘ El pie del login en el telefono › sigue visible, apilado, y mide entre 80 y 90 de alto
  Error: expect(locator).toBeVisible() failed
  Expected: visible
2 failed
```

**No cayó la aserción de `main footer`, cayó la de la `contentinfo`**, y la razón es del árbol de accesibilidad: un `<footer>` descendiente de `<main>` **deja de mapear al rol `contentinfo`** (el rol solo aplica cuando el `footer` está al alcance del `body`). Así que `getByRole('contentinfo')` no resuelve nada y preempta todo lo demás.

**Señuelo 4b**, para saber si la cuenta de `main footer` tiene dientes propios: adelantada al principio del caso, cae por su cuenta.

```
Error: expect(locator).toHaveCount(expected) failed
Expected: 0
Received: 1
```

**Veredicto:** las dos miden el defecto y son instrumentos distintos. El árbol de accesibilidad reacciona primero, que es la señal más informativa de las dos. La predicción del plan de que la aserción del texto **no** caería se sostiene: la copia sigue en pantalla, el caso murió antes de llegar a ella.

### Señuelo 5 — el padding lateral cambiado. Cayó UNO, y su compañera se aisló

`PieDeLogin.tsx`: `lg:px-xl` (24px) → `lg:px-lg` (16px).

```
✘ El pie del login a partir de lg: ...
  Error: expect(received).toBe(expected) // Object.is equality
  Expected: 24
  Received: 16
1 failed | 1 passed
```

El caso del teléfono **no** cayó, y es correcto: el padding que cambió es el de `lg:`, y a 390px rige `px-lg`. La discriminación es la que se quería.

**Señuelo 5b**, con la aserción de alineación adelantada, porque el literal 24 la preempta:

```
Error: expect(received).toBeLessThanOrEqual(expected)
Expected: <= 1
Received:    8
```

Los 8px son exactamente `24 − 16`. **La aserción de alineación tiene dientes independientes**, y a diferencia del `x >= 640` de 10-01 no es un cinturón: mide contra la tarjeta del anuncio, no contra una constante, así que sigue midiendo el día que los 24px cambien de valor a propósito.

### Señuelo 6 — `aria-disabled` en vez de `disabled`. Cayeron los DOS instrumentos

`PieDeLogin.tsx`: la prop `disabled` de los dos `Button` cambiada por `aria-disabled`.

**Instrumento A — la prueba unitaria del plan 10-02** (`npx vitest run PieDeLogin.test.ts`):

```
× emite disabled nativo dos veces y aria-disabled ninguna
AssertionError: expected [] to have a length of 2 but got +0
Tests  1 failed | 11 passed (12)
```

**Instrumento B — el carril E2E de este plan.** Cayeron sus **tres** casos:

```
✘ Instagram, aún no disponible: disabled nativo, sin aria-disabled, y focus() no le da el foco
✘ TikTok, aún no disponible: ...
  Expected: true / Received: false          ← la mitad del atributo `disabled`
✘ cuatro Tab desde la contrasena no alcanzan ninguno de los dos
  Error: expect(received).not.toContain(expected)
  Expected value: not "Instagram, aún no disponible"
  Received array: ["Mostrar contraseña", "", "Instagram, aún no disponible", "TikTok, aún no disponible"]
```

**Ese array recibido ES la trampa de foco de §10.3 regla 2, literal.** Dos controles que reciben el foco, se anuncian como no disponibles y no hacen nada al pulsar Enter. Deja de ser una regla del contrato y pasa a ser una medición.

**Señuelo 6b**, silenciando las aserciones de atributo para aislar el probe de foco, que es el que el plan señala como la defensa real:

```
Error: expect(received).toBe(expected) // Object.is equality
Expected: false
Received: true
```

El elemento **sí** tomó el foco. Dientes independientes, confirmados.

**Señuelo 6c — el que justifica la prohibición del plan, y es el más útil de los nueve.** Con el señuelo puesto y el probe de foco devolviendo `true`, se midió qué haría `toBeDisabled()`:

```
✓ Instagram, aún no disponible: ...
✓ TikTok, aún no disponible: ...
2 passed
```

**Verde.** `toBeDisabled()` da el visto bueno a la trampa de foco. La prohibición del plan pasa de razonada a medida, y así quedó escrita en la cabecera del `describe`.

### Sin residuo

`git diff --stat HEAD -- app/ e2e/` **vacío** antes de la verificación final, y comprobado además por grep de `SENUELO`, `anio="` y `aria-disabled` fuera de comentarios y de aserciones: ninguno.

## Los tres hallazgos que los señuelos destaparon

Y este es el punto de la disciplina: dos de los tres **corrigieron instrumentos**, no los confirmaron.

### Hallazgo 1 — el filtro de comentarios de la prueba de contrato no defendía nada, y su cabecera afirmaba que sí

La cabecera decía que el filtro existe porque el comentario de `page.tsx` nombra `new Date()` y `getFullYear`. **No los nombraba.** La afirmación era falsa, el filtro era código muerto, y una cabecera que explica una necesidad inexistente es exactamente lo que hace que alguien borre el filtro y se coma un rojo permanente después.

Se corrigió en la dirección estricta, no quitando el filtro:

1. `page.tsx` documenta ahora la prohibición **con su forma literal** `new Date().getFullYear()`, que es la única documentación útil de §8.2 regla 1: la que evita que alguien la reintroduzca por no saber que está prohibida.
2. La cabecera de la prueba sustituye la afirmación por la **medición**:

   ```
   SIN filtro, getFullYear presente: true
   SIN filtro, new Date( presente : true
   CON filtro, getFullYear presente: false
   CON filtro, new Date( presente : false
   ```

Verificado por los dos lados: **verde** con la prohibición solo en comentario, **rojo (3 casos)** cuando el código la reintroduce. El filtro ya es load-bearing y se puede demostrar en dos líneas. Commit `6d18c1e`.

### Hallazgo 2 — el rojo del año no nombraba el año

`getByText(copyright, { exact: true })` + `toBeVisible()` **sí** cae ante un año equivocado, pero cae con `Error: element(s) not found`. Quien lea ese rojo dentro de seis meses no sabe si el año está mal, si el pie desapareció o si la copia cambió: tres defectos distintos con el mismo mensaje.

Las dos aserciones del texto pasaron a `toHaveText` sobre el párrafo, que imprime esperado y recibido. Es el mismo hallazgo de clase que el `.match(...) ?? []` del plan 10-02, y la misma lección: **una prueba que cae sin explicar por qué es media prueba**. Commit `7e72645`.

### Hallazgo 3 — `<footer>` dentro de `<main>` no es "un footer mal colocado": es un footer que deja de ser landmark

El señuelo 4 lo midió. El rol `contentinfo` solo aplica a un `<footer>` al alcance del `body`; dentro de `<main>` el elemento sigue existiendo, sigue pintando la copia, y **desaparece del índice de regiones del lector de pantalla**. Es el modo de fallo silencioso perfecto: la pantalla se ve idéntica. Las dos aserciones (el rol y la cuenta de `main footer`) se quedan puestas, y ahora se sabe cuál cae primero y por qué.

## Casos que CORRIERON, no códigos de salida

Todo con `npm run db:reset` primero, que es lo que 10-01 no pudo hacer.

| Capa | Comando | Resultado |
|---|---|---|
| Arquitectura | `npm run ci:arch` | `check-service-role: OK`, `check-max-w-tallas: OK`, `check-escala-movil: OK` |
| Tipos | `npx tsc --noEmit` | sin errores |
| Unitarias | `npm run test:unit` | **68 archivos, 1270 casos**, todos verdes |
| Integración | `npm run test:integration` | **23 archivos, 205 casos**, todos verdes |
| pgTAP | `npm run db:test` | **13 archivos, 389 casos** — `All tests successful. Result: PASS` |
| E2E completa | `PLAYWRIGHT_PORT=3210 npx playwright test` | **171 pasaron, 1 saltado**, 5.4 min |
| Build | `npm run build` | verde; `/login` pasa a `○ (Static)` con `Revalidate 1h · Expire 1y` |

**La línea base de las unitarias** antes de este plan era 67 archivos / 1260 casos. Ahora 68 / 1270: los 10 casos nuevos son los de `page.contrato.test.ts`. Ninguno en `skip`.

**La suite E2E son 172 casos en total** (171 + 1 saltado). El plan hablaba de 160, y cuadra: 172 − 12 de la Fase 10 (7 de 10-01 + 5 de este plan) = **160**, la línea base exacta.

**El único saltado es preexistente y no es de esta fase:** `e2e/push-instalacion.spec.ts:287 › E4 — el clic en el aviso reusa la ventana abierta (sin comando en el protocolo)`, un `skip` condicional del plan 09 por una capacidad que el protocolo de Chrome DevTools no expone. No se tocó y no se le añade entrada nueva al ledger.

**La suite corre contra `next build && next start`**, no contra `next dev` (`playwright.config.ts:100`). O sea que las aserciones del año se midieron contra el HTML de producción con el `revalidate` activo, que es la forma más fuerte disponible sin dos builds en dos fechas.

## Las cuatro compuertas de forma

| Compuerta | Resultado |
|---|---|
| Blob de `FormularioLogin.tsx` contra `62d4d25` | `e2c276ede315dc6a7246331fe08721be1b276e14` **en los dos lados** |
| Borrados en `e2e/login.spec.ts` contra `62d4d25` | `479  0` — **cero borrados** |
| Los cinco títulos viejos | los cinco presentes: `el admin entra`, `el aseador entra`, `la sesion sobrevive`, `credenciales malas`, `un email inexistente` |
| `package.json` / `package-lock.json` en el diff de la fase | **ausentes** — cero dependencias nuevas (T-10-SC cerrado) |

## El `unrun-verify` de 10-01, cerrado

10-01 no corrió `npm run db:reset` en su verificación final, y con razón: su ejecutor hermano de 10-02 tenía corridas E2E en vuelo sobre la misma base local, y un reset les habría borrado los usuarios semilla debajo. Quedó anotado en `.planning/WINDOWS.md` como entrada 3.

Este plan corre solo en la wave 2, así que la corrida limpia era suya. Hecha: `db:reset` → las cinco capas → suite completa. **Entrada 3 del ledger marcada `fixed`.** Las otras dos entradas abiertas son de la fase 09 y no se tocan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] El filtro de líneas de comentario no defendía nada y su cabecera lo afirmaba**

- **Found during:** Task 3, entre los señuelos 2 y 3
- **Issue:** la cabecera de `page.contrato.test.ts` justificaba el filtro diciendo que el comentario de `page.tsx` nombra `new Date()` y `getFullYear`. No los nombraba. El filtro era código sin función y su justificación era falsa.
- **Fix:** `page.tsx` documenta la prohibición con su forma literal (que es la documentación correcta de §8.2 regla 1), y la cabecera de la prueba sustituye la afirmación por la medición de las cuatro booleanas. Verificado por los dos lados.
- **Por qué no es cosmético:** una compuerta cuya razón de ser es falsa es una compuerta que se borra en la próxima limpieza, y el rojo permanente aparece después, contra el archivo correcto.
- **Files modified:** `app/(public)/login/page.tsx`, `app/(public)/login/page.contrato.test.ts`
- **Commit:** `6d18c1e`

**2. [Rule 1 - Bug] Las dos aserciones del texto del pie caían sin nombrar el año**

- **Found during:** Task 3, señuelo 3
- **Issue:** `getByText(copyright, { exact: true })` + `toBeVisible()` cae con `Error: element(s) not found`, que no distingue "el año está mal" de "el pie desapareció" de "la copia cambió".
- **Fix:** las dos pasan a `toHaveText` sobre el párrafo del copyright. El rojo del señuelo 3 pasa a imprimir `Expected: "© 2026 ..."` / `Received: "© 2019 ..."`.
- **Files modified:** `e2e/login.spec.ts`
- **Commit:** `7e72645`

### Adiciones sobre lo que el plan pedía

**3. [Rule 2 - Evidencia] Cuatro corridas de aislamiento que el plan no pedía: 4b, 5b, 6b y 6c**

El plan pedía seis señuelos. Tres de ellos cayeron por una aserción **distinta** de la prevista, porque otra la preemptaba, y en ese estado no se sabe si la aserción del contrato mide algo o si solo está de adorno. Se persiguieron con la misma técnica que 10-01 usó en su señuelo 2 (las corridas 2b y 2c): silenciar o reordenar la que preempta y volver a correr.

- **4b:** la cuenta de `main footer` tiene dientes (`Expected: 0 / Received: 1`).
- **5b:** la alineación con la tarjeta del anuncio tiene dientes (`Expected: <= 1 / Received: 8`).
- **6b:** el probe de foco tiene dientes (`Expected: false / Received: true`).
- **6c:** `toBeDisabled()` **NO** tiene dientes contra el caso prohibido: pasa en verde. Esta es la medición que convierte la prohibición del plan en un hecho, y está escrita en la cabecera del `describe`.

Sin estas cuatro, tres aserciones del contrato de esta fase estarían "vistas en rojo" por el rojo de una vecina.

**4. [Rule 2 - Correctitud] Dos aserciones de contrato que el plan no enumeraba**

`page.contrato.test.ts` añade `not.toContain('force-dynamic')` y la prohibición de `export const dynamic =`. El plan pide afirmar que la página no lee sesión, y declararse dinámica anularía el cacheo que ese contrato defiende: sin ISR la mitad del riesgo T-10-02 desaparece, pero también desaparece la razón de todo el plan. Es la otra mitad de la misma compuerta.

## Threat Flags

Ninguno nuevo. Las cinco entradas del `<threat_model>` del plan quedan así:

| ID | Estado |
|---|---|
| T-10-02 (ISR + lectura de sesión) | **mitigado y visto en rojo por su lado**: `page.contrato.test.ts` afirma la ausencia de `cookies()`, `headers()`, `next/headers`, cualquier `create*Client`, `supabase`, `getUser` y `force-dynamic` |
| T-10-08 (regeneración ISR) | aceptado, como declaraba el plan: una regeneración por hora de una página sin consultas a la base |
| T-10-09 (los selectores de los que cuelga la suite) | **mitigado y medido**: 171 casos en verde con la base reseteada, incluido el `iniciarSesionPorUI()` del que cuelgan ~155 |
| T-10-10 (el año del copyright) | aceptado, con la deuda de §15.7 escrita |
| T-10-SC (instalaciones) | cerrado por compuerta automática: `package.json` y `package-lock.json` fuera del diff de la fase |

## Known Stubs

Ninguno nuevo de este plan. El único de la fase sigue siendo el `children` de `PanelPublicidad` sin consumidor, declarado intencional en el SUMMARY de 10-01 y atado a la pregunta abierta 2 de `10-CONTEXT.md`.

## La Task 4 está ABIERTA: el checkpoint humano

`status: checkpoint-pendiente` y no `complete`, a propósito. La Task 4 es un checkpoint humano `gate="blocking"` y los dos juicios que pide **no los puede emitir ningún instrumento de este repo** ni este ejecutor. Están declarados `🧪 backstop` en `10-UI-SPEC.md` §13:

1. **Si el fundido entre los cuatro grises se percibe** a 1440px durante un ciclo completo de 20s. El paso adyacente es de 1.115:1, calculado como el mínimo visible en un fundido de 600ms. Si no se percibe, el modo de fallo es el peor posible: la animación existe en el CSS y no existe en la pantalla.
2. **Si los dos glifos son los correctos y se leen a 16px.** Se transcribieron a mano desde los recursos de cada marca; lo único automático que los cubre es el color literal (guardarraíl 6).

**El entorno está levantado y esperando:** `npm run build` corrió verde y `npm run start -- --port 3210` está sirviendo. `http://127.0.0.1:3210/login` responde `HTTP 200`.

Cuando el juicio esté emitido, va a este SUMMARY: los cuatro puntos del `how-to-verify` con las palabras del humano si dijo algo distinto de "bien", el resultado de la comprobación de movimiento reducido si se hizo, y el paso de `status` a `complete`. Si el fundido no se percibe, **no se cambian los cuatro grises por cuenta propia**: los valores salen de §6.1 con sus contrastes medidos y separarlos más es decisión del dueño; se registra como hallazgo con los cuatro valores y su contraste.

## Self-Check: PASSED

- `app/(public)/login/page.contrato.test.ts` — existe en disco
- `app/(public)/login/page.tsx` — existe, modificado
- `e2e/login.spec.ts` — existe, modificado, `479  0` contra `62d4d25`
- Los cinco commits existen en `git log --all`: `8855eb2`, `5cafe67`, `6d18c1e`, `7e72645`, `246f72a`
- `git rev-list --count a01a1b6..HEAD` = **5**, que coincide con `commits: 5` del frontmatter. Esta rama no tiene ejecutor paralelo en la wave 2, así que el número de la rama y el del plan son el mismo (a diferencia de la wave 1, donde 10-01 y 10-02 tuvieron que anotar los dos)
