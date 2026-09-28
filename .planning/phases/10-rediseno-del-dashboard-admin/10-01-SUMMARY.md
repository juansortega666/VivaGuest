---
phase: 10-rediseno-del-dashboard-admin
plan: 01
subsystem: ui
tags: [tailwind-v4, css-keyframes, prefers-reduced-motion, playwright, server-components, login]

requires:
  - phase: 02-acceso-y-administraci-n-del-cat-logo
    provides: "`/login` con `FormularioLogin`, el token `--container-login` (400px) ya registrado en `lib/utils.ts`, y los cinco casos de `e2e/login.spec.ts`"
provides:
  - "`@utility rejilla-login` en `app/globals.css`: el reparto 45% · 10% · 45% de la pantalla, en UN solo sitio"
  - "Los cuatro grises del slot publicitario como tokens (`--anuncio-1..4`) y su exposición a Tailwind (`--color-anuncio-N`)"
  - "`--animate-anuncio` + `@keyframes ciclo-anuncio`: 20s lineal infinito sobre `background-color`, cero JavaScript"
  - "`PanelPublicidad.tsx`: componente de servidor con `children` como slot futuro, `hidden lg:block` y `aria-hidden`"
  - "`/login` convertida en pantalla partida, con el formulario en `lg:col-start-3` y `FormularioLogin.tsx` sin tocar"
  - "Siete casos E2E nuevos sobre la geometría, la animación y el movimiento reducido, los seis primeros vistos en rojo con señuelo"
affects: [10-02 (el pie de página cuelga de esta geometría), 10-03 (el ISR y el año de Bogotá cambian el alto de la tarjeta del anuncio)]

actuals:
  tokens: 6221      # 24885 chars / 4 sobre los 4 archivos del plan. El estimate decía 62000: fallado por 10x, y el número va sin maquillar
  tasks: 3
  commits: 2        # MEDIDO por hash: 923096e y f8894e7. Ver `plan_head_before` y la nota de abajo
  commits_en_rama_compartida: 6   # `git rev-list --count 8d378a6..HEAD` da 6 porque el ejecutor paralelo de 10-02 commitea en la MISMA rama
plan_head_before: 8d378a60139356ffd9887dce898f3e99477c559c

tech-stack:
  added: []   # cero dependencias nuevas, y es verificable: package.json y package-lock.json no aparecen en el diff
  patterns:
    - "Un reparto de rejilla que es contrato de pantalla se declara como `@utility` en globals.css, no como `grid-cols-[...]` arbitrario en el JSX"
    - "Una animación decorativa va en keyframes de CSS y NUNCA en `setInterval`: el bloque de `prefers-reduced-motion` alcanza al CSS y no puede alcanzar a un temporizador de JS"
    - "El estado de movimiento reducido de un elemento animado se escribe como su `background-color` base (`bg-anuncio-1`), porque con `animation-duration: 0s` y `fill-mode: none` ningún keyframe queda aplicado"
    - "Los colores computados se comparan contra una SONDA (`div` con `var(--token)`), nunca contra un literal escrito a mano"
    - "El enganche de prueba de un elemento sin rol ni texto es `data-slot`, la convención que el repo ya usa; `data-testid` sigue en cero ocurrencias"

key-files:
  created:
    - "app/(public)/login/_components/PanelPublicidad.tsx"
  modified:
    - "app/globals.css"
    - "app/(public)/login/page.tsx"
    - "e2e/login.spec.ts"

key-decisions:
  - "El 10% que falta es UN canal central, no dos márgenes exteriores: la pantalla queda con dos números (24px de recuadro y 10% de canal) en vez de tres blancos distintos por viewport"
  - "La columna del medio no lleva elemento: es una pista vacía de la rejilla, y el login se coloca con `lg:col-start-3`"
  - "`test.use({ reducedMotion: 'reduce' })` NO compila con `@playwright/test@1.62.1`; se declara por `contextOptions`, que sí es opción de test"
  - "El fondo de la pantalla se queda en `--canvas` y no pasa a blanco: es lo que le da borde visible a la Card debajo de 1024px"
  - "No se corrió `npm run db:reset` en la verificación final: el ejecutor paralelo de 10-02 tenía corridas E2E en vuelo sobre la misma base"

patterns-established:
  - "Aserción de geometría por `boundingBox()` con la aritmética del UI-SPEC escrita en la cabecera del `describe`: un 576 sin su cuenta al lado es un número que el próximo lector 'corrige'"
  - "El spinner de movimiento reducido se mide con una sonda de CLASE y no sobre el botón real, porque el spinner solo existe mientras la Server Action está en vuelo y afirmarlo sobre el botón es una carrera contra la red"
  - "Una frontera de breakpoint se prueba por los DOS lados (1024 y 1023), no por uno"

requirements-completed: []   # el plan declara explícitamente que no hay ninguno nuevo: PLAT-01 y PLAT-02 ya estaban entregados y esta fase no cambia su comportamiento

coverage:
  - id: D1
    description: "A 1280px la pantalla está partida 45/10/45: columna del anuncio 576px, canal 128px, columna del login 576px, y el formulario de 400px vive en la mitad derecha"
    verification:
      - kind: e2e
        ref: "e2e/login.spec.ts#El split del login › a 1280 la pantalla esta partida 45/10/45 y el login vive en la columna 3"
        status: pass
    human_judgment: false
  - id: D2
    description: "La tarjeta del anuncio tiene alto real (>500px a 1280x720), no colapsa a cero, y su recuadro es de 24px a los cuatro lados"
    verification:
      - kind: e2e
        ref: "e2e/login.spec.ts#El split del login › a 1280 la pantalla esta partida 45/10/45 y el login vive en la columna 3"
        status: pass
    human_judgment: false
  - id: D3
    description: "A 390px de ancho el panel no existe en la pantalla y el login se ve exactamente como hoy"
    verification:
      - kind: e2e
        ref: "e2e/login.spec.ts#El split del login › a 390 el panel no existe y el login se ve como siempre"
        status: pass
    human_judgment: false
  - id: D4
    description: "El placeholder corre `ciclo-anuncio 20s linear infinite` sobre `background-color`, sin un kilobyte de JavaScript"
    verification:
      - kind: e2e
        ref: "e2e/login.spec.ts#El contrato de la animacion del placeholder › la tarjeta del anuncio corre `ciclo-anuncio 20s linear infinite`"
        status: pass
    human_judgment: false
  - id: D5
    description: "Con `prefers-reduced-motion: reduce` el panel sigue VISIBLE y quieto en `--anuncio-1`, y la excepción del spinner sigue viva"
    verification:
      - kind: e2e
        ref: "e2e/login.spec.ts#El placeholder con movimiento reducido › el panel se queda quieto en el gris 1 y el spinner sigue girando"
        status: pass
    human_judgment: false
  - id: D6
    description: "A 1024px el panel ya se ve, la Card conserva sus 400px y el aire a su izquierda son 30.4px; a 1023px el panel no existe y la Card sigue en 400px"
    verification:
      - kind: e2e
        ref: "e2e/login.spec.ts#El arranque del split y la holgura vertical › a 1024 el panel ya se ve y la Card conserva sus 400px"
        status: pass
      - kind: e2e
        ref: "e2e/login.spec.ts#El arranque del split y la holgura vertical › a 1023, un pixel por debajo del corte, el panel no existe"
        status: pass
    human_judgment: false
  - id: D7
    description: "A 1024x768 el login no queda debajo del pliegue: el documento no genera recorrido vertical"
    verification:
      - kind: e2e
        ref: "e2e/login.spec.ts#El arranque del split y la holgura vertical › a 1024x768 el login no queda debajo del pliegue"
        status: pass
    human_judgment: false
  - id: D8
    description: "Los cinco casos que ya existían en `e2e/login.spec.ts` siguen pasando sin que se les editara una línea, y el login por UI del fixture del que cuelga toda la suite sigue autenticando contra la pantalla nueva"
    verification:
      - kind: e2e
        ref: "PLAYWRIGHT_PORT=3210 npx playwright test e2e/login.spec.ts e2e/ruteo.spec.ts — 22 passed"
        status: pass
      - kind: other
        ref: "git hash-object 'app/(public)/login/_components/FormularioLogin.tsx' == git rev-parse '62d4d25:...' → e2c276ed"
        status: pass
    human_judgment: false
  - id: D9
    description: "La pantalla partida se ve como una pantalla de acceso y no como un esqueleto de carga: el gris rotando a la izquierda se lee como superficie con dueño, no como contenido que todavía no llegó"
    verification: []
    human_judgment: true
    rationale: "Es exactamente el juicio que motivó D10-2 y la razón 2 de §3.1 del UI-SPEC (un gris a sangre completa es indistinguible de un skeleton). Ninguna aserción de geometría puede responderlo: hay que abrir /login en un portátil y mirar."

duration: 20min
completed: 2026-09-19
status: complete
---

# Phase 10 Plan 01: La pantalla partida del login Summary

`/login` pasa de una columna centrada a una rejilla 45% · 10% · 45% declarada como `@utility` en un solo sitio, con un slot publicitario que es componente de servidor y anima cuatro grises en 20s de keyframes de CSS sin un kilobyte de JavaScript, y `FormularioLogin.tsx` demostrablemente intacto por comparación de blob.

## Accomplishments

- **`app/globals.css`**: el bloque de la Fase 10 entró entre `@utility transicion` y el `@layer base` final, así que **el bloque que apaga el movimiento sigue siendo lo último del archivo**, que es la convención que el archivo ya mantenía. Dentro, en el orden del UI-SPEC: los cuatro `--anuncio-N` en `:root`, sus cuatro `--color-anuncio-N` en `@theme inline`, `--animate-anuncio` con `@keyframes ciclo-anuncio` en `@theme`, y `@utility rejilla-login`. Los comentarios medidos entraron con cada bloque: son lo único que evita que la próxima limpieza borre `bg-anuncio-1` por parecer redundante.
- **`PanelPublicidad.tsx`**: componente de servidor, sin `'use client'`, sin estado y sin efectos. `<div>` y no `<aside>` a propósito. Acepta `children` hoy sin usar, que es la diferencia entre un slot y un rectángulo.
- **`app/(public)/login/page.tsx`**: el árbol de §10.1, con el contenido del login **movido sin editarse** (wordmark y `Card` idénticos, comentarios incluidos). La columna del medio no lleva elemento.
- **`e2e/login.spec.ts`**: siete casos nuevos añadidos **después** de los cinco existentes, en cuatro `describe`, cada uno con la aritmética del UI-SPEC en su cabecera. Cero líneas borradas del archivo (`git diff 62d4d25 --numstat` → `274  0`).

## Los seis señuelos, con su rojo literal

La regla del repo: ninguna aserción cuenta hasta haberla visto en rojo. Uno a uno, nunca dos a la vez. Cada corrida: `PLAYWRIGHT_PORT=3210 npx playwright test e2e/login.spec.ts` (12 casos recorriendo, no un código de salida).

### Señuelo 1 — el panel que no desaparece

`PanelPublicidad.tsx`: `hidden p-xl lg:block` → `block p-xl`.

**Cayeron los dos casos esperados, y no el de 1280.** `2 failed / 10 passed`:

```
1) El split del login › a 390 el panel no existe y el login se ve como siempre
2) El arranque del split y la holgura vertical › a 1023, un pixel por debajo del corte, el panel no existe

Error: expect(locator).toBeHidden() failed
Locator:  locator('[data-slot="panel-publicidad"]')
Expected: hidden
Received: visible
  14 × locator resolved to <div aria-hidden="true" class="block p-xl" data-slot="panel-publicidad">…</div>
     - unexpected value "visible"
```

### Señuelo 2 — el login que se queda en la columna 1

`page.tsx`: fuera `lg:col-start-3`.

**El caso correcto cayó, pero NO por la aserción que el plan predijo.** `2 failed / 10 passed`:

```
1) El split del login › a 1280 la pantalla esta partida 45/10/45 y el login vive en la columna 3
   Error: expect(received).toBe(expected) // Object.is equality
   Expected: 576
   Received: 128
   > 180 | expect(Math.round(cajaPrincipal.width)).toBe(576);

2) El arranque del split y la holgura vertical › a 1024 el panel ya se ve y la Card conserva sus 400px
   Expected: 400
   Received: 54
   > 367 | expect(Math.round(cajaLogin.width)).toBe(400);
```

Sin `lg:col-start-3` el `<main>` cae en la columna 2, que es el canal de 128px, así que la aserción de **ancho** se rompe antes de que la de la mitad derecha llegue a ejecutarse. **Es un hallazgo sobre la prueba, no una formalidad**, y por eso se persiguió hasta el fondo con dos señuelos más:

- **2b** — mismo defecto, silenciando las aserciones de ancho del `<main>` y del canal. Sigue sin llegar a `x >= 640`: ahora preempta el ancho de la Card, `Expected: 400 / Received: 80`. Un login en la columna equivocada es siempre un login en una columna más estrecha.
- **2c** — mismo defecto, silenciando también el ancho de la Card. **Ahí sí:**

  ```
  Error: expect(received).toBeGreaterThanOrEqual(expected)
  Expected: >= 640
  Received:    600
  > 190 | expect(cajaLogin.x).toBeGreaterThanOrEqual(640);
  ```

  **Veredicto:** `x >= 640` mira algo de verdad, pero **nunca es la primera en caer** para ningún error de columna plausible, porque el ancho y el canal la preemptan. Es un cinturón sobre la aserción del canal (que es direccional y por eso ya distingue quién está a la izquierda), no una defensa independiente. Se deja puesta a propósito: es la única que sigue teniendo dientes el día que alguien cambie los anchos y la geometría siga cuadrando.

### Señuelo 3 — el reparto cambiado

`globals.css`: `@utility rejilla-login` a `50% 0% 50%`. `2 failed / 10 passed`:

```
1) El split del login › a 1280 ...
   Expected: 576
   Received: 640
   > 179 | expect(Math.round(cajaPanel.width)).toBe(576);

2) El arranque del split ... › a 1024 el panel ya se ve y la Card conserva sus 400px
   Error: expect(received).toBeCloseTo(expected, precision)
   Expected: 30.4
   Received: 56
   Received difference: 25.6
```

La primera de las tres cifras (576) cae y preempta a las otras dos, como es de esperar en un `expect` secuencial. El aire de 30.4px a 1024 cae por su lado, que es la cifra del piso de 995.6px.

### Señuelo 4 — la clase que se borra por parecer redundante

`PanelPublicidad.tsx`: fuera `bg-anuncio-1`, queda solo `animate-anuncio`. **Cayó UNO y solo uno**, el de movimiento reducido. `1 failed / 11 passed`:

```
El placeholder con movimiento reducido › el panel se queda quieto en el gris 1 y el spinner sigue girando
Error: expect(received).toBe(expected) // Object.is equality
Expected: "oklch(0.92 0.0045 250)"
Received: "rgba(0, 0, 0, 0)"
> 321 | expect(pintura.anuncio).toBe(pintura.gris1);
```

El `rgba(0, 0, 0, 0)` **es la trampa 3 de §11.5 literal**: el panel transparente, o sea desaparecido, para el usuario que pidió menos movimiento. Con el movimiento normal la animación sigue pintando y los otros 11 casos pasan, que es exactamente lo que hace este defecto invisible en revisión de código. De paso queda demostrado que la sonda compara computado contra computado: devolvió `oklch(0.92 0.0045 250)`, no la cadena declarada `oklch(0.9200 0.0045 250)`.

### Señuelo 5 — el instrumento del movimiento reducido

`globals.css`: fuera `animation-duration: 0s !important` del bloque de `prefers-reduced-motion`. `1 failed / 11 passed`:

```
El placeholder con movimiento reducido › el panel se queda quieto en el gris 1 y el spinner sigue girando
Error: expect(received).toBe(expected) // Object.is equality
Expected: "0s"
Received: "20s"
> 316 | expect(pintura.duracion).toBe('0s');
```

Este no prueba el producto: **prueba que la emulación de Playwright llega de verdad al CSS**, y con `contextOptions` (la única forma que compila en 1.62.1) llega. Sin la regla el elemento corre sus 20s; con la regla, 0s. Si este señuelo no hubiera puesto nada en rojo, la aserción de movimiento reducido no valdría nada.

### Señuelo 6 — el fundido que se convierte en parpadeo

`globals.css`: el `linear` de `--animate-anuncio` a `ease-out`. `1 failed / 11 passed`:

```
El contrato de la animacion del placeholder › la tarjeta del anuncio corre `ciclo-anuncio 20s linear infinite`
Error: expect(received).toBe(expected) // Object.is equality
Expected: "linear"
Received: "ease-out"
> 243 | expect(animacion.curva).toBe('linear');
```

**Ninguno de los seis dejó nada en el árbol:** `git diff --stat HEAD -- app/ e2e/` vacío antes de la verificación final.

## Las tres compuertas de forma

| Compuerta | Resultado |
|---|---|
| Blob de `FormularioLogin.tsx` contra `62d4d25` | `e2c276ede315dc6a7246331fe08721be1b276e14` **en los dos lados** |
| Borrados en `e2e/login.spec.ts` contra `62d4d25` | `274  0` — cero borrados |
| Los cinco títulos viejos | los cinco presentes por `grep -q`: `el admin entra`, `el aseador entra`, `la sesion sobrevive`, `credenciales malas`, `un email inexistente` |
| `package.json` / `package-lock.json` en el diff | **ausentes**: cero dependencias nuevas |

## Casos que CORRIERON, no códigos de salida

| Corrida | Resultado |
|---|---|
| `npm run build` | verde; `/login` sigue `○ (Static)`, 3.59 kB |
| `npm run ci:arch` | `check-service-role: OK`, `check-max-w-tallas: OK`, `check-escala-movil: OK` |
| `npx tsc --noEmit` | verde |
| `npm run test:unit` | **1260 pasaron**, 67 archivos |
| `PLAYWRIGHT_PORT=3210 npx playwright test e2e/login.spec.ts e2e/ruteo.spec.ts` | **22 pasaron**: 5 viejos + 7 nuevos de login + 10 de ruteo |
| Verificación en el CSS compilado | `rejilla-login{grid-template-columns:45% 10% 45%}`, `--anuncio-1:oklch(92% .0045 250)`, `animate-anuncio{animation:var(--animate-anuncio)}` |

`e2e/ruteo.spec.ts` entró en cada corrida a propósito: es el archivo más barato que usa `paginaAdmin` y `paginaAseador`, así que es el que fuerza el `iniciarSesionPorUI()` del fixture del que cuelgan los otros ~155 casos. `e2e/login.spec.ts` NO ejerce ese camino, y correr solo ese archivo habría dejado la puerta de toda la suite sin probar contra la pantalla nueva.

## Deviations from Plan

### 1. [Rule 3 - Blocking] `test.use({ reducedMotion: 'reduce' })` no compila con `@playwright/test@1.62.1`

- **Found during:** Task 1, subtarea (d)
- **Issue:** el plan y el UI-SPEC piden `test.use({ reducedMotion: 'reduce' })` dentro del `describe`. `npx tsc --noEmit` lo rechaza: `error TS2353: Object literal may only specify known properties, and 'reducedMotion' does not exist in type 'Fixtures<{}, {}, PlaywrightTestArgs & PlaywrightTestOptions & FixturesVivaGuest, ...>'`. Medido en los tipos instalados: `PlaywrightTestOptions` de 1.62.1 tiene `colorScheme` pero **no** `reducedMotion` ni `contrast`; los dos solo viven en `BrowserContextOptions`.
- **Fix:** `test.use({ contextOptions: { reducedMotion: 'reduce' } })`. `contextOptions` sí es opción de test, y así la emulación existe desde que nace el contexto en vez de aplicarse después de la primera pintura. La razón queda escrita en el `describe`.
- **Por qué no es un parche de conveniencia:** el señuelo 5 existe justamente para comprobar que el instrumento llega al CSS, y lo comprobó (`20s` sin la regla, `0s` con ella). La forma cambió; el diente no.
- **Files modified:** `e2e/login.spec.ts`
- **Commit:** `923096e`

### 2. [Rule 3 - Blocking] No se corrió `npm run db:reset` en la verificación final del plan

- **Found during:** verificación final
- **Issue:** el bloque `<verification>` del plan abre con `npm run db:reset`. Este plan es **wave 1 en paralelo** con 10-02, que tenía corridas E2E en vuelo sobre la misma base local. Un `db:reset` habría borrado los usuarios semilla debajo de sus pies y producido rojos falsos en el otro ejecutor: exactamente la trampa 2 de `COMO-CORRER-PRUEBAS.md`, pero disparada contra otro agente.
- **Fix:** se corrió la cadena completa **sin** `db:reset`. Los `<verify>` de las tres tareas, que son los que gobiernan cada commit, no lo piden. `e2e/global-setup.ts` siembra los usuarios en cada corrida, así que el camino del login no depende del estado previo de la base.
- **Pendiente:** el `db:reset` + suite completa corresponde al cierre de la fase, cuando ningún ejecutor esté en vuelo. Anotado en `.planning/WINDOWS.md` como `unrun-verify`.
- **Files modified:** ninguno

### 3. [Hallazgo] `expect(cajaLogin.x).toBeGreaterThanOrEqual(640)` nunca es la primera en caer

No es una desviación del plan: es lo que el barrido de señuelos destapó y está arriba, en el señuelo 2, con las tres corridas (2, 2b, 2c) que lo persiguieron hasta aislarla. Se deja puesta y documentada; su valor es residual, no nulo.

## Threat Flags

Ninguno. Las cuatro entradas del `<threat_model>` del plan siguen como estaban: `page.tsx` no lee sesión, ni cookies, ni cabeceras, ni la base (T-10-02); el bloque de `globals.css` solo **añade**, con prefijo propio en los cuatro tokens, nombre propio en la animación y nombre propio en la utilidad (T-10-03); y no se instaló nada (T-10-SC, verificable: `package.json` y `package-lock.json` fuera del diff).

## Known Stubs

**`children` de `PanelPublicidad` sin consumidor** — `app/(public)/login/_components/PanelPublicidad.tsx`. **Intencional y declarado:** es el slot que D10-4 pide preparar, y lo que lo llenaría (conteo de impresiones, rotación de creativos, orden de anunciantes, estado sin anunciante, `<a>` envolvente) es la **pregunta abierta 2 de `10-CONTEXT.md`**, sin responder por decisión del dueño. Ningún plan de esta fase lo resuelve, y responderlo aquí habría sido decidirlo por la puerta de atrás. La deuda que nace con él está escrita en el UI-SPEC §15.2: el día que el slot lleve un anuncio con enlace, `aria-hidden="true"` deja de ser legal (WCAG 4.1.2) y el enlace tiene que entrar al orden de tabulación.

## Lo que el siguiente plan tiene que saber

- **El alto de la tarjeta del anuncio va a cambiar en 10-03**, cuando el pie de página aterrice. Por eso la aserción es `height > 500` y no un número exacto: una aserción que el plan siguiente tiene que editar es una aserción que no defiende nada.
- **`bg-canvas` ya no está en el `<main>`**: se mudó al contenedor de la pantalla, que es quien lo comparte entre las dos columnas.
- **Ningún nombre accesible nuevo de esta fase puede contener `Email`, `Contraseña` ni `Entrar`**: el `exact: true` del selector de contraseña existe por una colisión medida con `aria-label="Mostrar contraseña"`, y `iniciarSesionPorUI()` cuelga de esos tres selectores.

## Self-Check: PASSED

Los cinco archivos existen en disco y los dos commits del plan están en `git log --all`:

- `app/globals.css`, `app/(public)/login/_components/PanelPublicidad.tsx`, `app/(public)/login/page.tsx`, `e2e/login.spec.ts`, `.planning/phases/10-rediseno-del-dashboard-admin/10-01-SUMMARY.md`
- `923096e` (Task 1), `f8894e7` (Task 2). La Task 3 no deja archivos por diseño: su entregable es la evidencia de los seis señuelos, y su criterio de aceptación es precisamente que el diff quede vacío.
