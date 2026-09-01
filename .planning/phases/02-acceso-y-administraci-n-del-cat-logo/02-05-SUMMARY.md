---
phase: 02-acceso-y-administraci-n-del-cat-logo
plan: 05
subsystem: ui
tags: [shadcn, base-ui, tailwind, tokens, design-system, a11y, geist]

# Dependency graph
requires:
  - phase: 02-01
    provides: "Guardarrail 6 (prohibido el color literal fuera de globals.css), app/page.tsx ya convertido en redirect('/login'), .env.example"
  - phase: 02-04
    provides: "Aprobacion humana de los 13 paquetes de la fase, harness de integracion y E2E para verificar que nada se rompe"
provides:
  - "23 bloques de shadcn con Base UI en components/ui/, con `field` en lugar de `form`"
  - "Capa de tokens de VivaGuest: el rebrand es de dos lineas en app/globals.css"
  - "Escala de espaciado y los 4 tamanos de tipografia como tokens de @theme, con utilidades verificadas"
  - "Layout raiz en espanol, con Toaster y TooltipProvider, y Geist renderizandose de verdad"
  - "App solo-clara verificada con el sistema operativo emulado en oscuro"
  - "Repo sin boilerplate vivo de create-next-app"
affects: [02-06, 02-07, 02-08, 02-10, 02-12, 02-14, 02-15]

# Tech tracking
tech-stack:
  added:
    - "@base-ui/react 1.7.0 (pin exacto)"
    - "shadcn 4.19.1 (pin exacto, en dependencies A PROPOSITO)"
    - "tw-animate-css 1.4.0 (pin exacto)"
    - "class-variance-authority 0.7.1 (pin exacto)"
    - "clsx 2.1.1 (pin exacto)"
    - "tailwind-merge 3.6.0 (pin exacto)"
    - "lucide-react 1.39.0 (pin exacto, con DOS saltos de deriva)"
    - "cmdk 1.1.1 (pin exacto, lo trae `command`)"
    - "sonner 2.0.8 (pin exacto)"
  removed:
    - "next-themes (entraba como transitiva de sonner; desinstalado tras simplificar sonner.tsx)"
  patterns:
    - "Ningun componente conoce un valor de color literal: todo deriva de --brand o de un token de estado"
    - "Prohibido el valor arbitrario de espaciado y tipografia; si falta un valor se anade al @theme"
    - "Los tokens nuevos se prueban con una pagina sonda que se compila y se verifica en el CSS emitido, y luego se borra"
    - "Las invariantes visuales que ningun grep cubre se miden con Playwright emulando el sistema operativo, no a ojo"
    - "Un comentario nunca cita literalmente el token que una verificacion grepea (heredado de check-service-role.sh)"

key-files:
  created:
    - components.json
    - lib/utils.ts
    - components/ui/ (23 archivos)
  modified:
    - app/globals.css
    - app/layout.tsx
    - components/ui/sonner.tsx
    - package.json
    - package-lock.json
  deleted:
    - public/next.svg
    - public/vercel.svg
    - public/file.svg
    - public/globe.svg
    - public/window.svg

key-decisions:
  - "Arreglar la circularidad de --font-sans es necesario pero NO suficiente: las variables de next/font tenian que moverse de <body> a <html> o Geist no se renderiza"
  - "lucide-react arrastra tres cifras distintas y el CLI ya no escribe ^1.38.0: escribe el caret de la ultima publicada. Se pinea lo que aterriza (1.39.0)"
  - "shadcn se queda en dependencies: globals.css importa shadcn/tailwind.css y Vercel no instala devDependencies en produccion"
  - "theme='light' se declara DESPUES del spread de props en sonner.tsx: es una invariante de la fase, no un default pisable"
  - "Las excepciones de espaciado de UI-SPEC §2 (fila 40px, barra 56px, toque 44px...) se declaran como tokens para que nadie tenga que escribir un valor arbitrario"
  - "El fondo negro que midio la primera sonda era la pagina 404 integrada de Next inyectando su propio prefers-color-scheme, no globals.css"

patterns-established:
  - "Sonda de tokens: pagina temporal con las utilidades nuevas, build, grep del CSS emitido, borrado"
  - "Sonda visual con colorScheme dark para probar que la app NO reacciona a la preferencia del sistema"

requirements-completed: [PLAT-01, PLAT-02, PLAT-07]

# Metrics
duration: 34min
completed: 2026-09-01
---

# Fase 02 Plan 05: Base visual con shadcn, Base UI y la capa de tokens de VivaGuest

**El proyecto pasa de un andamiaje de `create-next-app` a la base visual de las nueve pantallas de la fase: 23 bloques de Base UI, una capa de tokens donde el rebrand es de dos lineas, y los seis bugs (cuatro del `init`, dos heredados) cerrados y medidos en el navegador.**

## Performance

- **Duracion:** 34 min
- **Tareas:** 3 de 3, todas autonomas
- **Commits:** 6
- **Archivos creados/modificados/borrados:** 31

## Task Commits

1. **Tarea 1: shadcn init con Base UI y los 22 bloques** — `3ad4bd6` (init), `88707b7` (bloques), `320ff92` (pines)
2. **Tarea 2: Los cuatro arreglos post-init y la capa de tokens** — `87e30d0`
3. **Tarea 3: Layout raiz en espanol y muerte del boilerplate** — `5d473bd`, mas `7f4e101` (el arreglo de fuente que la verificacion destapo)

---

## El hallazgo que importa: arreglar `--font-sans` NO alcanzaba

El research documenta el arreglo (a) asi: `--font-sans: var(--font-sans)` es circular, se cambia a `var(--font-geist-sans)` y listo. **Se hizo, y Geist seguia sin renderizarse.** Lo destapo la comprobacion visual del plan, que se automatizo con Playwright en vez de dejarla para un vistazo humano.

Medicion con `next start` y chromium, ANTES de tocar el layout y con la circularidad ya corregida:

| Medida | Valor |
|---|---|
| `getComputedStyle(html).fontFamily` | `"Times"` |
| `--font-geist-sans` en `<html>` | **no definida** |
| `--font-geist-sans` en `<body>` | `"Geist","Geist Fallback"` |

La cadena real: `globals.css` aplica `html { @apply font-sans }`, que resuelve a `var(--font-geist-sans)`. `next/font` no define esa variable globalmente, la define en la clase que genera, **y esa clase estaba en `<body>`**. Las custom properties heredan hacia abajo, nunca hacia arriba, asi que `<html>` jamas la veia: la declaracion quedaba invalida, `<html>` caia a Times y `<body>` heredaba Times aunque tuviera la variable definida en si mismo.

Arreglo: mover `${geistSans.variable} ${geistMono.variable}` de `<body>` a `<html>`. Despues:

| Medida | Valor |
|---|---|
| `fontFamily` de `<html>`, `<body>` y `<h1>` | `Geist, "Geist Fallback"` |

Es exactamente "la clase de bug que nadie nota hasta que ve la app al lado de una maqueta" que anticipaba el research, solo que con una causa mas que la documentada. **Nota para las fases siguientes: el arreglo del research esta incompleto en su §3.4 (a).**

### Un falso positivo que casi se cuela

La primera corrida de la sonda apuntaba a la pagina 404 y midio fondo **negro** con el sistema en oscuro, lo que parecia romper la decision de solo-claro. No era nuestro: la pagina de error integrada de Next inyecta su propio `<style>` con `body{background:#fff}` y un `@media (prefers-color-scheme:dark){body{background:#000}}`. La sonda se rehizo contra una pagina real y el fondo salio blanco. Queda escrito porque el sintoma es convincente y habria costado una tarde.

---

## Verificacion de las verdades del plan

| Verdad declarada | Como se comprobo | Resultado |
|---|---|---|
| El swap de marca es de dos lineas y ningun componente conoce el hex | `npm run ci:arch` (guardarrail 6) + grep de `FF5A5F` en todo el repo | verde, y `--primary` resuelve a `var(--brand)` en el CSS emitido |
| La app no cambia de aspecto con el SO en oscuro | Playwright con `colorScheme: 'dark'` sobre `next start` | `bgBody = oklch(1 0 0)`, sin clase `dark` en `<html>` |
| El texto se renderiza en Geist, no en el fallback | computed style de `<html>`, `<body>` y `<h1>` | `Geist, "Geist Fallback"` |
| El titulo dice VivaGuest y el documento declara `lang='es'` | grep + HTML servido | `<html lang="es">`, `<title>VivaGuest</title>` |
| `npm run build` pasa | ejecutado | verde, 2 rutas estaticas |

### Suites completas

| Comprobacion | Resultado |
|---|---|
| `npm run ci:arch` | OK, 6 guardarrailes |
| `npx tsc --noEmit` | limpio |
| `npm run test:unit` | 7 archivos, **138 tests** verdes |
| `npm run test:integration` | 1 archivo, **5 tests** verdes |
| `npx playwright test` | **2 tests** verdes |
| `npm run build` | OK |

---

## Mediciones del research confirmadas en este repo

El research decia haber medido todo contra un sandbox. Se confirmo pieza por pieza:

| Afirmacion | Resultado |
|---|---|
| `globals.css` queda en **132** lineas (no ~144 como decia el UI-SPEC) | **exacto: 132** |
| El `@media (prefers-color-scheme: dark)` desaparece con la reescritura | confirmado, no hubo que borrarlo a mano |
| `shadcn init` **no toca** `app/layout.tsx` | confirmado: `git diff` vacio pese al "Updating fonts" que reporta el CLI |
| `--font-sans` queda circular | confirmado |
| `-p nova` obligatorio, `-p base-nova` invalido, `--base-color` inexistente | confirmado: `components.json` quedo con `"style": "base-nova"` |
| `form` no existe en Base UI; el sustituto es `field` | confirmado: se crearon 23 archivos y **no hay `form.tsx`** |
| Entra `input-group` como dependencia de registry | confirmado |

**23 bloques, no 22:** los 22 pedidos mas `input-group`, que entra solo como dependencia de `input` y sirve para el adorno `$` de `CampoMoneda` (UI-SPEC §8.4).

---

## Deriva de `lucide-react`: son TRES cifras, y el CLI ya no escribe la que decia el research

El plan pedia anotar dos saltos. En realidad hay una cuarta fuente y cambia la conclusion operativa:

| Fuente | Version |
|---|---|
| `research/STACK.md` | `1.37.0` |
| `02-RESEARCH.md` §Standard Stack (lo que "escribe el CLI") | `^1.38.0` |
| Registry de npm el 2026-09-01 (02-04) | `1.39.0` |
| **Lo que el CLI escribio en este repo, medido hoy** | **`^1.39.0`** |

O sea que el CLI **no escribe `^1.38.0` fijo**: escribe el caret de la ultima version publicada al momento de correrlo. La prediccion del research caduca sola. Aplicada la decision del usuario del 2026-09-01: pinear exacto lo que aterrice, que fue **`1.39.0`**.

---

## Decisiones que quedan escritas para que nadie las "corrija"

**`shadcn` se queda en `dependencies`.** `globals.css` hace `@import "shadcn/tailwind.css"`, que resuelve por el `exports` map a `node_modules/shadcn/dist/tailwind.css` (629 lineas de `@custom-variant` y keyframes que los componentes usan). Vercel no instala devDependencies en produccion, asi que moverlo rompe el build al compilar el CSS. **Contradice `research/STACK.md`**, que lo lista como herramienta de desarrollo y dice que "no es una dependencia runtime": era cierto en la 4.x anterior, ya no.

**`theme="light"` va DESPUES del spread de props en `sonner.tsx`.** No es un default que el llamador pueda pisar, es una invariante de la fase.

**El comentario de `sonner.tsx` describe el paquete de temas sin nombrarlo.** La verificacion del plan es un grep de ese nombre sobre `components/`, asi que citarlo en prosa la habria puesto en rojo por una mencion en un comentario. Es la misma regla que ya lleva escrita la cabecera de `scripts/ci/check-service-role.sh`, y es la tercera vez en el proyecto que el patron muerde.

**El bloque `.dark` del `init` se deja intacto y sin usar** (UI-SPEC §4.5). No hay `ThemeProvider`, ni clase `dark`, ni toggle.

---

## La capa de tokens

Aplicada literal desde UI-SPEC §4.3, con su bloque de comentario intacto. Encima se anadio lo que el plan pedia y el §4.3 no incluye:

- **Resto de la paleta medida de §4.2** sobre la escala neutra del preset `nova`: `--foreground`, `--canvas`, `--muted`, `--muted-foreground`, `--border`, `--destructive`, y las superficies derivadas (`--card`, `--popover`, `--secondary`, `--accent`, `--sidebar*`).
- **Escala de espaciado de §2**, incluidas las excepciones declaradas como tokens propios (`--spacing-fila` 40px, `--spacing-fila-encabezado` 32px, `--spacing-barra` 56px, `--spacing-barra-acciones` 64px, `--spacing-toque` 44px). Existen justamente para que nadie tenga que escribir `h-[40px]`.
- **Los 4 tamanos de tipografia de §3** con su line-height y peso. `--text-micro` deliberadamente **sin** peso, porque se usa en 400 (ayuda, contadores) y en 600 (encabezados de columna, etiqueta de estado).

El coral implementado es `#D7373F` (4.66:1 con blanco). **`#FF5A5F` no aparece en ningun archivo del repo**, verificado con grep sobre todo el arbol fuera de `.planning/`.

### Sonda de tokens

Los tokens nuevos no valen nada si Tailwind no genera la utilidad, y la prohibicion de valores arbitrarios seria una regla sin respaldo. Se compilo una pagina temporal con `p-xl`, `gap-sm`, `mt-2xl`, `text-display`, `text-body`, `text-micro`, `h-fila`, `h-barra`, `min-h-toque`, `bg-status-ok`, `text-surface-warn` y `border-canvas`, y se verificaron las 11 reglas en el CSS emitido:

```
.p-xl{padding:var(--spacing-xl)}
.h-fila{height:var(--spacing-fila)}
.min-h-toque{min-height:var(--spacing-toque)}
.text-display{font-size:var(--text-display);line-height:...;font-weight:...}
.text-micro{font-size:var(--text-micro);line-height:...}      <- sin font-weight, correcto
.bg-status-ok{background-color:var(--status-ok)}
```

La pagina se borro despues.

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Regla 3 - Bloqueante] El worktree no tenia `node_modules` ni `.env.local`**

- **Encontrado durante:** antes de la Tarea 1.
- **Problema:** `.env.local` esta en `.gitignore` (correctamente) y no viaja entre worktrees; `node_modules` tampoco existia. Sin ninguno de los dos no corre `next build` ni el CLI de shadcn.
- **Arreglo:** `npm ci` y `.env.local` reconstruido desde `npx supabase status`. Confirmado con `git check-ignore` que sigue fuera del control de versiones.
- **Archivos versionados:** ninguno.
- Es la tercera vez que pasa (02-01 y 02-04 lo reportan igual). **Vale la pena un script de arranque de worktree en vez de repetirlo cada plan.**

**2. [Regla 1 - Bug] Geist no se renderizaba pese al arreglo documentado**

- **Encontrado durante:** la verificacion visual de la Tarea 3.
- Detalle completo arriba. **Archivos:** `app/layout.tsx`. **Commit:** `7f4e101`.

**3. [Regla 1 - Bug] El comentario de `sonner.tsx` ponia en rojo la verificacion del propio plan**

- **Encontrado durante:** Tarea 2, al correr el grep de aceptacion.
- **Problema:** el comentario explicativo nombraba literalmente el paquete que el `<verify>` del plan prohibe encontrar bajo `components/`. La verificacion fallaba por una mencion en prosa, no por un import.
- **Arreglo:** reescrito para describir el paquete sin citarlo, siguiendo la regla que ya lleva `scripts/ci/check-service-role.sh`.
- **Commit:** `87e30d0`.

### Anadidos deliberados sobre el plan

**4. [Regla 2] La comprobacion visual se automatizo en vez de delegarse**

El `<verification>` del plan la describe como "comprobacion visual obligatoria, que ningun grep cubre: abrir la app en el navegador...". Se implemento como sonda de Playwright con `colorScheme: 'dark'` que mide el computed style. **Es lo que destapo el bug de la fuente**, que un vistazo humano probablemente habria dejado pasar: Geist y el fallback del navegador se parecen lo suficiente a simple vista.

**5. [Regla 2] Resto de la paleta de §4.2 y excepciones de espaciado como tokens**

El §4.3 solo cubre marca, estados y superficies. Sin el resto de §4.2 la app se habria quedado con la escala gris del preset `nova` y los ratios de contraste medidos del UI-SPEC no aplicarian a nada. Las excepciones de espaciado se declararon como token por la misma razon que la escala: la prohibicion de valores arbitrarios necesita que exista el token alternativo.

---

## Threat Model: dispositions aplicadas

| Threat ID | Disposicion | Como quedo |
|---|---|---|
| T-02-18 | mitigate | Arbol limpio antes del `init`, tres commits aislados en la Tarea 1, diff del CSS revisable por si solo. Las 132 lineas medidas coinciden exactamente con el research |
| T-02-19 | mitigate | `shadcn` en `dependencies`, verificado por `npm run build` y por una asercion de Node sobre `package.json`. La razon quedo escrita en el mensaje del commit y en este resumen |
| T-02-20 | mitigate | Guardarrail 6 verde. `#FF5A5F` no existe en el repo; los unicos literales viven en `app/globals.css`, el unico archivo excluido |
| T-02-21 | mitigate | Import eliminado, `theme="light"` fijo y no pisable, paquete desinstalado tras confirmar por grep que ningun otro bloque lo usaba |
| T-02-SC | transfer | Cubierto por la aprobacion del 2026-09-01 (plan 02-04). No se reabrio la puerta. Los 10 paquetes que entraron salieron del registry oficial de shadcn |

## Threat Flags

Ninguna superficie de seguridad nueva. Este plan no anade endpoints, rutas de auth ni cambios de schema.

## Known Stubs

Ninguno. `app/page.tsx` sigue redirigiendo a `/login`, que todavia no existe: es intencional y lo construye el plan 02-06. Los 23 bloques de `components/ui/` estan sin consumir por ahora, que es lo esperado en un plan de base visual.

## Notas para los planes siguientes

- **02-06 (middleware y login):** el layout raiz ya tiene `Toaster` y `TooltipProvider`, no hay que anadirlos. El formulario se arma con `field` (`Field`, `FieldLabel`, `FieldDescription`, `FieldError`), **no** con `form`, que no existe. `FieldError` acepta `errors?: Array<{ message?: string }>` y encaja directo con react-hook-form.
- **02-07 (shell del admin):** los tokens de espaciado ya existen. `--spacing-barra` es el alto de la barra superior, `--spacing-fila` el de la fila de tabla. Prohibido el valor arbitrario; si falta algo se anade al `@theme` de `globals.css`.
- **Primitivos de Base UI:** `Select`, `Switch` y `Checkbox` son controlados, traen un `<input>` nativo oculto con `name`, y sus callbacks reciben **dos** argumentos. Van con `<Controller>`; `Input` y `Textarea` con `register()`.
- **Todo destructivo lleva icono y nunca va relleno junto a un primario relleno** (UI-SPEC §4.6): el coral y el destructivo estan a 1.72:1 entre si.
- **Deuda menor:** `app/favicon.ico` sigue siendo el generico de `create-next-app`. Fuera del alcance de esta fase, no rompe nada.
- **Bloqueante residual heredado de 02-01 y 02-04:** sigue pendiente un `npx supabase stop && npx supabase start` al cierre de la fase para confirmar en frio que el `config.toml` commiteado reproduce el entorno.

## Self-Check: PASSED

Los archivos que este resumen declara existen o fueron borrados segun corresponde, y los 6 hashes resuelven a objetos de tipo `commit` en el historial de la rama.
