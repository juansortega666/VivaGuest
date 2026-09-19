---
phase: 10-rediseno-del-dashboard-admin
plan: 02
subsystem: ui-login
status: complete
tags: [ui, footer, svg, a11y, tdd, wave-1]

requires:
  - "components/ui/button.tsx (variant ghost, size icon-sm, disabled:opacity-50 en la clase base)"
  - "app/globals.css: --spacing-barra, --spacing-xl/lg/sm/xs, --text-micro, --muted-foreground (todos de la Fase 2)"
provides:
  - "IconoInstagram e IconoTikTok: dos glifos de marca del proyecto, monocromos en currentColor"
  - "PieDeLogin: el pie de /login como funcion pura de anio: string"
affects:
  - "app/(public)/login/page.tsx — lo cablea el plan 10-03, con hoyBog() y revalidate"

tech-stack:
  added: []
  patterns:
    - "Prueba de componente en .ts con createElement + renderToStaticMarkup (precedente: EstadoVacio.test.ts)"
    - "Primera prueba unitaria del repo que importa una primitiva de components/ui/ — @base-ui/react resolvio sin tocar dependencias"
    - "SVG de marca inline en currentColor, cazado por dos instrumentos: expresion regular sobre el markup y guardarrail 6 sobre la forma"

key-files:
  created:
    - "app/(public)/login/_components/IconosRedes.tsx"
    - "app/(public)/login/_components/IconosRedes.test.ts"
    - "app/(public)/login/_components/PieDeLogin.tsx"
    - "app/(public)/login/_components/PieDeLogin.test.ts"
  modified: []

decisions:
  - "La asercion de ausencia de borde se mide contra la clase del <footer>, no contra el markup completo: 'border-transparent' de la clase base del Button hace de 'border-t' un rojo permanente"
  - "Las aserciones de conteo usan `.match(...) ?? []` para que el rojo nombre el conteo en vez de 'Target cannot be null or undefined'"
  - "La prueba unitaria afirma el atributo `disabled`; el orden de tabulacion se afirma en el navegador, en 10-03"

metrics:
  duration: "9m 22s"
  completed: "2026-09-19"

actuals:
  tokens: 5213
  tasks: 3
  commits: 3
  commits_en_rango_de_rama: 5
  plan_head_before: 8d378a60139356ffd9887dce898f3e99477c559c
---

# Phase 10 Plan 02: El pie de login y sus dos glifos de marca — Summary

Los dos glifos que `lucide-react` ya no distribuye, dibujados en el proyecto en `currentColor`, y el pie de `/login` como funcion pura de `anio: string`, con 24 casos unitarios que lo prueban sin encender un navegador.

## Lo que quedo construido

| Archivo | Que es |
|---|---|
| `app/(public)/login/_components/IconosRedes.tsx` | `IconoInstagram` (trazo, `strokeWidth 2`) e `IconoTikTok` (relleno), los dos `viewBox="0 0 24 24"`, `size-4`, `aria-hidden="true"`, `focusable="false"`. Spread de props DESPUES de los valores por defecto |
| `app/(public)/login/_components/IconosRedes.test.ts` | 12 casos. La ausencia de color literal se afirma con expresion regular, no con cadena |
| `app/(public)/login/_components/PieDeLogin.tsx` | `<footer>` con el copyright en `text-micro text-muted-foreground` y dos `Button variant="ghost" size="icon-sm" disabled` |
| `app/(public)/login/_components/PieDeLogin.test.ts` | 12 casos. El que carga el peso es el de `anio: '1999'`, que afirma que NO sale ningun otro ano |

**El pie todavia no se ve en la pantalla**, y eso estaba dicho en el plan: se ve cuando 10-03 lo cablea con el ano de Bogota. Lo que sustituye a la evidencia visual son las 24 aserciones, todas vistas en rojo.

La clase del pie, tal cual quedo:

```
flex flex-col items-center gap-sm px-lg py-lg lg:h-barra lg:flex-row lg:justify-between lg:px-xl lg:py-0
```

El `lg:py-0` no es cosmetica: con `lg:h-barra` el alto es fijo en 56px y el padding va por dentro de la caja, asi que un `py-lg` que sobreviviera a `lg:` dejaria 24px de area de contenido para un boton de 28px.

## La medicion de Base UI, confirmada

El plan predijo el markup de la primitiva y lo predijo bien. Salida literal, medida en la corrida real:

```
<button type="button" data-disabled="" tabindex="0" disabled="" data-slot="button" aria-label="Instagram, aún no disponible" class="…">
```

Las tres consecuencias se sostienen:

- `disabled=""` sale de verdad → la prueba lo afirma, dos veces.
- `aria-disabled` NO sale → la prueba afirma su ausencia.
- `tabindex="0"` SI sale, y lo pone Base UI → la prueba **no** dice nada sobre `tabindex`, porque seria un rojo permanente contra la primitiva. La consecuencia (que un `<button disabled>` no entra al orden de tabulacion) es del motor y va al carril E2E de 10-03.

**El camino alterno del plan no se necesito.** El import de `@base-ui/react/button` resolvio bajo vitest a la primera, sin anadir dependencias, sin mocks y sin sustituir la primitiva por un `<button>` a mano. Esta es la primera prueba unitaria del repo que importa una primitiva de `components/ui/`, asi que queda dicho: se puede.

## Los cinco senuelos, con su rojo literal

La regla del repo: ninguna asercion cuenta hasta haberla visto en rojo. Los cinco defectos se metieron uno a uno, se corrio el comando, se anoto el mensaje y se quitaron antes del siguiente.

### Senuelo 1 — el color de la marca. **Cayeron los DOS instrumentos.**

Inyectado: `fill="#E4405F"` en el `<rect>` de `IconoInstagram`. Se eligio el `<rect>` a proposito, para que el unico caso que cayera fuera el del color y la evidencia de los dos testigos quedara aislada.

**Instrumento A — prueba unitaria** (`npx vitest run IconosRedes.test.ts`):
```
× IconoInstagram no lleva ningun valor de color literal
AssertionError: expected '<svg viewBox="0 0 24 24" fill="none" …' not to match /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?|r…/i
Tests  1 failed | 11 passed (12)
```

**Instrumento B — guardarrail 6** (`npm run ci:arch`, **exit 1**):
```
::error::valor de color literal fuera de la capa de tokens (solo app/globals.css puede nombrarlos):
app/(public)/login/_components/IconosRedes.tsx:59:      <rect fill="#E4405F" width="20" height="20" x="2" y="2" rx="5" ry="5" />
```

Los dos cayeron ante el mismo defecto, y miden cosas distintas: el guardarrail mira la FORMA del archivo (y filtra lineas de comentario, asi que un hexadecimal en un comentario pasa por diseno); la prueba mira el markup RENDERIZADO. La pareja es lo que cierra el hueco.

### Senuelo 2 — `aria-disabled` en vez de `disabled`

Inyectado: la prop `disabled` de los dos `Button` cambiada por `aria-disabled`.

```
× emite disabled nativo dos veces y aria-disabled ninguna
AssertionError: expected [] to have a length of 2 but got +0
```

Las DOS mitades del caso se comprobaron por separado (vitest para en la primera asercion que falla, asi que la segunda se verifico reordenandolas temporalmente):

```
AssertionError: expected '<footer class="flex flex-col items-ce…' not to contain 'aria-disabled'
```

### Senuelo 3 — el pie que se inventa el ano

Inyectado: `© {anio}` cambiado por `© 2026` literal.

```
× con 1999 renderiza 1999 y NINGUN otro ano: no lee el reloj
AssertionError: expected '<footer class="flex flex-col items-ce…' to contain '© 1999 VivaGuest. Todos los derechos …'
Tests  1 failed | 11 passed (12)
```

**Cayo el caso de 1999 y NO el de 2026**, que es exactamente la discriminacion que el plan exigia. Si hubieran caido los dos, la prueba estaria mirando la cadena equivocada.

### Senuelo 4 — el borde que nadie pidio

Inyectado: `border-t border-border` en el `<footer>`. Cayeron DOS aserciones:

```
× el elemento raiz es un footer con la clase exacta del contrato
AssertionError: … to contain 'class="flex flex-col items-center gap…'
× no lleva borde superior ni fondo propio: la superficie es la de la pagina
AssertionError: expected 'border-t border-border flex flex-col …' not to match /border/
Tests  2 failed | 10 passed (12)
```

### Senuelo 5 — Poppins fuera de su sitio

Inyectado: `font-brand` en el `<p>` del copyright.

```
× el copyright va en text-micro y muted-foreground, y en ningun caso en Poppins
AssertionError: … to contain 'class="text-micro text-muted-foregrou…'
```

La prohibicion dedicada se verifico por separado, reordenando las aserciones:

```
AssertionError: expected '<footer class="flex flex-col items-ce…' not to contain 'font-brand'
```

### Sin residuo

`git diff` de `IconosRedes.tsx` y `PieDeLogin.tsx` contra sus commits de las tareas 1 y 2: **cero**. Los cinco senuelos se retiraron. Verificado tambien por grep de `E4405F`, `font-brand`, `border-t` y hexadecimales: ninguno.

## Los dos hallazgos que los senuelos destaparon

Y este es el punto de la disciplina: los senuelos no confirmaron las pruebas, las **corrigieron**. Dos instrumentos median mal.

### Hallazgo 1 — `not.toContain('border-t')` sobre el markup completo es un rojo PERMANENTE

La clase base de `components/ui/button.tsx` trae `border border-transparent`, y **`border-t` es un prefijo de `border-transparent`**. La asercion se vio roja al escribirla, con el componente correcto y sin ningun senuelo metido:

```
AssertionError: expected '<footer class="flex flex-col items-ce…' not to contain 'border-t'
```

Lo peor no es el rojo: es que en un pie SIN botones la misma asercion daria verde sin medir nada. Reescalada a la clase del propio `<footer>`, con `not.toMatch(/border/)` y `not.toMatch(/bg-/)`, que cubre tambien `lg:border-t`. **Es mas estricto que lo que pedia el plan, no menos.**

### Hallazgo 2 — `.match()` devuelve `null`, y `toHaveLength` no lo sabe decir

El rojo del senuelo 2 salio primero asi:

```
AssertionError: Target cannot be null or undefined.
```

Cae, si, pero el mensaje no nombra el defecto: quien lo lea dentro de seis meses no sabe si falta un atributo o si la prueba esta rota. Las seis aserciones de conteo de los dos archivos pasaron a `.match(...) ?? []`, y el rojo ahora dice `expected [] to have a length of 2 but got +0`. Una prueba que cae sin explicar por que es media prueba.

## Verificacion

| Comando | Resultado |
|---|---|
| `npm run ci:arch` | **OK** — los tres guardarrailes (`check-service-role`, `check-max-w-tallas`, `check-escala-movil`) |
| `npx tsc --noEmit` | **SIN ERRORES** |
| `npm run test:unit` | **67 archivos, 1260 casos, todos verdes** |
| `git status -- package.json package-lock.json` | **vacio** — cero dependencias nuevas |

**El recuento, que es lo que se comprueba y no el codigo de salida:** la linea base antes de este plan era **65 archivos / 1236 casos**. Al terminar, **67 archivos / 1260 casos**. Los 24 casos nuevos son los de este plan: 12 de `IconosRedes.test.ts` y 12 de `PieDeLogin.test.ts`. Ningun caso quedo en `skip`.

## Nota de ejecucion en paralelo

Este plan corrio en la wave 1 en paralelo con 10-01, los dos sobre `gsd/phase-10-rediseno-del-dashboard-admin`. Dos cosas que conviene dejar escritas:

1. **`npx tsc --noEmit` dio un error transitorio en `e2e/login.spec.ts:268`** (`'reducedMotion' does not exist in type 'Fixtures<…>'`) mientras el ejecutor de 10-01 tenia ese archivo a medias. Es archivo suyo, no mio: **no se toco**, por la regla de frontera de alcance. Se verifico que el error no estaba en ninguno de mis cuatro archivos, y al cerrar este plan el hermano ya habia commiteado y `tsc` esta limpio.
2. **`git rev-list --count` mide la RAMA, no el plan.** En el rango del ledger hay **5** commits; **3** son de este plan (`335c6f4`, `61d4d31`, `96de4a0`) y **2** son de 10-01 (`923096e`, `f8894e7`). El frontmatter registra los dos numeros: `commits: 3` es lo atribuible a 10-02, y `commits_en_rango_de_rama: 5` es lo que el instrumento mide en crudo. Se anota asi para que `/gsd-verify-work` no lo lea como una discrepancia.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] La asercion de ausencia de borde no podia pasar nunca**

- **Found during:** Task 2 (al ver el primer verde de `PieDeLogin.test.ts`)
- **Issue:** `expect(markup).not.toContain('border-t')` sobre el markup completo es un rojo permanente: `border-t` es prefijo de `border-transparent`, que viene en la clase base de `components/ui/button.tsx`.
- **Fix:** la asercion se reescalo a la clase del propio `<footer>` (`claseDelPie`), con `not.toMatch(/border/)` y `not.toMatch(/bg-/)`, que cubre ademas `lg:border-t`. El senuelo 4 confirmo que cae.
- **Files modified:** `app/(public)/login/_components/PieDeLogin.test.ts`
- **Commit:** `61d4d31`

**2. [Rule 1 - Bug] Seis aserciones de conteo caian sin nombrar el conteo**

- **Found during:** Task 3, senuelo 2
- **Issue:** `String.prototype.match` con flag `g` devuelve `null` cuando no hay coincidencias, no `[]`. `toHaveLength` sobre `null` produce `Target cannot be null or undefined`, que no dice cual es el defecto.
- **Fix:** las seis aserciones de conteo de los dos archivos pasaron a `.match(...) ?? []`. El rojo del senuelo 2 pasa a `expected [] to have a length of 2 but got +0`.
- **Files modified:** `app/(public)/login/_components/PieDeLogin.test.ts`, `app/(public)/login/_components/IconosRedes.test.ts`
- **Commit:** `96de4a0`

### Adiciones sobre lo que el plan pedia

**3. [Rule 2 - Correccion] `strokeLinecap="round"` y `strokeLinejoin="round"` en `IconoInstagram`**

El punto del flash de la marca de Instagram es una `<line>` de longitud cero (`x1="17.5" x2="17.51"`). **Sin remate redondo no se dibuja nada**: el glifo saldria sin el punto. Es tambien la metrica de los iconos lucide del producto. §11.3 no lo menciona porque fija el trazo, no los remates; no contradice ninguna de sus cinco reglas y queda comentado en el archivo.

## Known Stubs

Ninguno. Los cuatro archivos estan completos y probados. Lo que falta para que el pie se VEA es el cableado de `page.tsx`, que es alcance declarado del plan 10-03, no un stub de este.

## Threat Flags

Ninguno. Los dos glifos son `<path>`/`<rect>`/`<line>` sin `href`, sin `<script>`, sin `<foreignObject>` y sin `<use>` externo: cero superficie de ejecucion (T-10-05). Los dos botones no tienen `href`, ni `onClick`, ni Server Action detras (T-10-06). `T-10-SC` se cerro con la compuerta automatica: `package.json` y `package-lock.json` fuera del diff.

## Lo que queda para revision humana

Por §14 y por el `<threat_model>`, hay una cosa que ningun instrumento de este plan cubre: **que los dos paths sean de verdad los glifos correctos y que se lean a 16px.** Se transcribieron a mano desde los recursos de cada marca y lo unico automatico que los cubre es el color literal. Esa revision es el checkpoint de 10-03, con el pie ya en pantalla.

Y queda dicho lo que el propio contrato ya declara como deuda (§15.6): nadie reviso las guias de marca de Instagram ni de TikTok. Se dibujan monocromos en `currentColor` a 16px, que es el uso mas conservador posible.

## Self-Check: PASSED

Los cuatro archivos existen en disco y los tres commits existen en el historial (`335c6f4`, `61d4d31`, `96de4a0`). Verificado con `test -f` y `git log --oneline --all`.
