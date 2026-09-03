---
phase: 04-dashboard-operativo-del-admin
plan: 02
subsystem: ui
tags: [shadcn, base-ui, tailwind-v4, design-tokens, vitest, react-dom-server]

# Dependency graph
requires:
  - phase: 02-acceso-y-administracion-del-catalogo
    provides: "la escala de espaciado, los cuatro colores de estado, la tipografia de dos pesos y el propio EstadoVacio, que esta fase extiende sin romper"
provides:
  - "components/ui/sheet.tsx, la unica primitiva de shadcn que faltaba para D-09"
  - "once tokens de @theme: los dos carriles, las cuatro columnas de la tabla de dia, los tres altos declarados y --status-progress"
  - "EstadoVacio con prop compacto para las cards de 360px del carril lateral"
  - "vitest capaz de importar .tsx: oxc.jsx.runtime automatic, que habilita todo test de componente de la fase"
affects: [04-03, 04-04, 04-05, 04-06, 04-07, 04-08, 04-09, 04-10, 04-11, 04-12]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Las desviaciones del contrato en una primitiva de shadcn se corrigen en el sitio de uso, no editando la primitiva, para que el archivo siga siendo regenerable con el CLI"
    - "Test de componente sin ampliar el stack: renderToStaticMarkup de react-dom/server en entorno node, sin jsdom ni testing-library"
    - "Las variantes de un componente se exponen como funcion de clases (clasesDeEstadoVacio) en vez de dos arboles JSX"

key-files:
  created:
    - components/ui/sheet.tsx
    - app/(admin)/_components/EstadoVacio.test.ts
  modified:
    - app/globals.css
    - app/(admin)/_components/EstadoVacio.tsx
    - vitest.config.ts

key-decisions:
  - "font-medium, sm:max-w-sm y gap-0.5 de sheet.tsx NO se corrigen en la primitiva: font-medium esta en las quince primitivas instaladas y arreglar solo una dejaria el Sheet en 600 con los Dialog de la misma pantalla en 500"
  - "El override de ancho tiene que ser data-[side=right]:sm:max-w-sheet: tailwind-merge no deduplica entre cadenas de variantes distintas"
  - "El test de EstadoVacio va en .ts y no en .tsx porque el include de vitest solo casa .test.ts; un .tsx daria 'No test files found', un verde falso"
  - "vitest.config.ts usa oxc.jsx y no esbuild.jsx: Vitest 4 corre sobre Vite 8, que cambio el transformador, y la clave vieja se ignora en silencio"

patterns-established:
  - "Cabecera de primitiva regenerable: el archivo del CLI se deja intacto y las desviaciones del contrato van documentadas arriba con el className exacto que hay que escribir en el sitio de uso"
  - "Variantes por funcion de clases: la estructura JSX es unica y la variante solo cambia cadenas, para no perder atributos de accesibilidad al duplicar"

requirements-completed: [ASEO-02, DASH-01, DASH-04]

# Metrics
duration: 21min
completed: 2026-09-03
---

# Phase 4 Plan 02: Fundamentos visuales de la pantalla de operación Summary

**`Sheet` de Base UI instalado y dejado regenerable, once tokens de `@theme` para los carriles y la tabla de día, y `EstadoVacio` con variante compacta verificada por el primer test de componente del repo.**

## Performance

- **Duration:** 21 min
- **Started:** 2026-09-03T16:44:00Z
- **Completed:** 2026-09-03T17:05:00Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- `components/ui/sheet.tsx` instalado con `npx shadcn@4.19.1 add sheet`, del registry oficial, sin una sola dependencia nueva de npm.
- Once tokens nuevos en `app/globals.css`, incluido `--status-progress` con sus dos contrastes medidos citados en el comentario.
- `EstadoVacio` acepta `compacto` sin mover ni un atributo de su variante por defecto, que consumen tres superficies de la Fase 2.
- Vitest quedó habilitado para importar `.tsx`, que era el bloqueo real para cualquier test de componente de la fase.

## Task Commits

1. **Task 1: Instalar `sheet` y resolver los arreglos del contrato** - `bbf3c7e` (feat)
2. **Task 2: Tokens de `@theme` de la pantalla de operación** - `e8ffed9` (feat)
3. **Task 3 (RED): test en rojo de la variante compacta** - `729bf2c` (test)
4. **Task 3 (GREEN): variante compacta de `EstadoVacio`** - `c2c0100` (feat)

No hubo fase REFACTOR: la implementación quedó en su forma final al primer intento y un commit vacío de limpieza no aporta nada.

## Files Created/Modified

- `components/ui/sheet.tsx` — primitiva `Sheet` sobre `@base-ui/react/dialog`. El CLI ya resolvió `IconPlaceholder` a `XIcon` de `lucide-react`, así que el único cambio sobre su salida es el `sr-only` traducido a `Cerrar`. La cabecera documenta las tres desviaciones del contrato y el `className` exacto con el que se corrige cada una.
- `app/globals.css` — `--container-rail` 360px y `--container-sheet` 480px en el bloque de contenedores; bloque nuevo de `@theme` con `--spacing-col-estado-aseo`, `--spacing-col-hora`, `--spacing-col-acargo`, `--spacing-col-huespedes`, `--spacing-fila-alerta`, `--spacing-dia-cabecera` y `--spacing-chip`; `--status-progress` en el `:root` de estados operativos y `--color-status-progress` en su `@theme inline`.
- `app/(admin)/_components/EstadoVacio.tsx` — prop `compacto` y la función exportada `clasesDeEstadoVacio(compacto)`.
- `app/(admin)/_components/EstadoVacio.test.ts` — seis casos: las clases de las dos variantes, la regresión de la variante por defecto, el `h2` y el `max-w-vacio` en las dos, y la `accion` en las dos.
- `vitest.config.ts` — `oxc: { jsx: { runtime: 'automatic' } }`.

## Decisions Made

- **Las tres desviaciones de `sheet.tsx` se corrigen en el sitio de uso.** `font-medium` (peso 500, prohibido) está en las quince primitivas ya instaladas y la Fase 2 no lo quitó de ninguna. Arreglar solo `sheet` dejaría el único `Sheet` de la app en 600 y los cinco `Dialog`/`AlertDialog` de la misma pantalla en 500, que es peor que la inconsistencia actual. Mismo criterio para `gap-0.5` de `SheetHeader` y para el ancho. El archivo queda regenerable con el CLI y la cabecera explica por qué, con el `className` literal que el plan 04-10 tiene que copiar.
- **El override de ancho es `data-[side=right]:sm:max-w-sheet data-[side=right]:w-full`.** `tailwind-merge` solo considera en conflicto dos clases del mismo grupo con la misma cadena de variantes: un `sm:max-w-sheet` suelto no desplaza a `data-[side=right]:sm:max-w-sm`, las dos sobreviven y gana la de mayor especificidad en un orden de CSS que no está garantizado.
- **Las clases de la variante por defecto de `EstadoVacio` se escribieron literales y en el orden original**, en vez de componerlas con `cn()` a partir de fragmentos. Componerlas habría reordenado el atributo `class` de tres superficies ya entregadas, que es un cambio invisible en revisión y detectable solo en producción.
- **El encabezado compacto usa `text-body font-semibold`**, el par que la Fase 2 ya emplea en la tabla de apartamentos y en `ConectarCalendario`, en vez de inventar un token nuevo de 14/600.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] El test de componente no podía existir como `.tsx`**

- **Found during:** Task 3
- **Issue:** El plan pedía `app/(admin)/_components/EstadoVacio.test.tsx`, pero el `include` de `vitest.config.ts` es `['lib/**/*.test.ts', 'app/**/*.test.ts']`. Un archivo `.tsx` no lo recoge ningún runner: el resultado sería `No test files found`, exactamente la clase de verde/rojo falso contra la que advierte el propio comentario del config.
- **Fix:** El test se escribió como `EstadoVacio.test.ts` y arma los elementos con `createElement` en vez de JSX. La razón queda escrita en la cabecera del archivo.
- **Files modified:** `app/(admin)/_components/EstadoVacio.test.ts`
- **Verification:** `npm run test:unit -- EstadoVacio` reporta 6 tests corridos, no 0.
- **Committed in:** `729bf2c`

**2. [Rule 3 - Blocking] Vitest no podía importar ningún `.tsx`**

- **Found during:** Task 3 (fase RED)
- **Issue:** `tsconfig.json` declara `jsx: "preserve"` porque quien compila JSX en este proyecto es Next, no tsc. El transformador de Vite respeta ese ajuste, así que importar `EstadoVacio.tsx` desde el test reventaba con `Failed to parse source for import analysis because the content contains invalid JS syntax`. Sin esto no hay verificación automática posible de ningún componente, ni en este plan ni en los diez que vienen.
- **Fix:** `oxc: { jsx: { runtime: 'automatic' } }` en `vitest.config.ts`, con comentario. Cero dependencias nuevas: no entró `@vitejs/plugin-react` ni `jsdom` ni `@testing-library/react`.
- **Trampa medida por el camino:** el primer intento fue `esbuild: { jsx: 'automatic' }`, la clave de Vite ≤7. Vitest 4 corre sobre Vite 8, que cambió el transformador a oxc, y la clave vieja **se ignora en silencio**: el error es idéntico y no hay ninguna señal de que la opción no exista. La clave correcta es `oxc`.
- **Files modified:** `vitest.config.ts`
- **Verification:** `npm run test:unit` completo: 25 archivos, 398 tests verdes (392 heredados + 6 nuevos).
- **Committed in:** `729bf2c`

**3. [Rule 3 - Blocking] `npm run build` fallaba por variables de entorno ausentes en el worktree**

- **Found during:** Task 2
- **Issue:** Un worktree de git no trae `.env.local`, que está en `.gitignore`. El prerender de `/mis-aseos` falla con `Variables de entorno inválidas (cliente)`. Es infraestructura del worktree, no un defecto de los tokens: el CSS compila bien antes de llegar ahí.
- **Fix:** El build se corrió con las mismas dos variables públicas placeholder que inyecta el paso `build` de `ci/db.yml` (`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_ci_placeholder`). **No se tocó la base de datos ni se levantó el stack local**, que en esta wave lo tiene reservado el plan 04-01.
- **Files modified:** ninguno
- **Verification:** `npm run build` pasa: 10 rutas, 7 páginas estáticas generadas.
- **Committed in:** no aplica, no hubo cambio de archivos

### Desviación menor de forma

- Los siete tokens de columnas y altos van en un bloque `@theme` **nuevo** con su propia cabecera de comentario, no dentro del bloque de la tabla de apartamentos. El plan decía "dentro de los bloques `@theme` que ya existen", pero ese bloque está documentado como *anchos de la tabla de apartamentos* y meterle las columnas de la tabla de día contradice la razón por la que la Fase 2 los separó. Mismo mecanismo (`@theme` en CSS), misma convención de comentario. No se creó `tailwind.config.js`.

---

**Total deviations:** 3 auto-arregladas (3× Rule 3) + 1 de forma.
**Impact on plan:** Ninguna amplía el alcance. Las tres de Rule 3 eran bloqueos duros: sin la 1 y la 2 no había verificación automática de la Task 3, y sin la 3 no había forma de correr la verificación de la Task 2. Cero dependencias nuevas: `package.json` y `package-lock.json` sin un solo cambio.

## Issues Encountered

- **El worktree venía sin `node_modules`.** Resuelto con `npm ci` antes de cualquier verificación, como indicaba el contexto de ejecución.
- **`npm run setup:worktree` se quedó colgado** (probablemente en `npx supabase status`, con el stack local ocupado por el plan 04-01). Se abandonó y se usó la vía de variables inline del CI, que no toca la base. Vale la pena que el script tenga timeout.
- **El disco de la máquina llegó a 0 bytes libres a mitad de ejecución** y `bash` devolvió `ENOSPC` durante unos minutos. Se recuperó solo. Cuatro worktrees × 685 paquetes de `npm ci` son ~2 GB; si la wave crece, conviene un store compartido de npm o `node_modules` enlazado entre worktrees.

## Verification

| Comprobación | Resultado |
|---|---|
| `npx tsc --noEmit` | limpio |
| `npm run build` | 10 rutas, 7 estáticas, sin errores |
| `npm run test:unit` | 25 archivos, **398** tests verdes (392 heredados + 6 nuevos) |
| `npm run ci:arch` | `check-service-role: OK` |
| `git diff --stat package.json package-lock.json` | vacío |
| `test -f tailwind.config.js` | no existe |
| Los once tokens en `app/globals.css` | 11/11 |
| `IconPlaceholder` / `>Close<` en `sheet.tsx` | 0 ocurrencias de cada uno |

## Known Stubs

Ninguno. Las tres piezas son consumibles tal cual por los planes de las waves 3, 4 y 5.

## Threat Flags

Ninguna superficie nueva. `sheet.tsx` no trae `dangerouslySetInnerHTML`, ni `fetch`, ni `process.env`, ni imports dinámicos externos, y no entró ninguna dependencia de npm: T-04-SC y T-04-10 quedan mitigados como preveía el registro.

## User Setup Required

Ninguna. Este plan no toca servicios externos.

Nota operativa para el resto de la fase: cualquier ejecutor en worktree nuevo necesita `npm ci` y, para `npm run build`, las dos variables públicas placeholder del CI. El stack local de Supabase no hace falta para nada de lo que entregó este plan.

## Next Phase Readiness

Listo para las waves 3, 4 y 5:

- El plan **04-10** (`SheetConfirmar`) tiene la primitiva y el `className` exacto de los tres overrides escrito en la cabecera de `components/ui/sheet.tsx`. No hay nada que redescubrir.
- Los planes de la tabla de día y del panel de alertas tienen sus siete tokens de ancho y alto, y ya no necesitan tocar `app/globals.css`, que era la fuente de conflicto entre ejecutores paralelos.
- Los tres vacíos del carril lateral tienen `EstadoVacio compacto`.
- Todo plan de UI de la fase puede ahora escribir tests de componente: basta un `*.test.ts` bajo `app/**` que renderice con `renderToStaticMarkup`.

Sin bloqueos.

## Self-Check: PASSED

- Los cinco archivos declarados existen en disco.
- Los cuatro commits de tarea (`bbf3c7e`, `e8ffed9`, `729bf2c`, `c2c0100`) existen en el historial.
- `STATE.md` y `ROADMAP.md` sin tocar, como manda la ejecución en wave paralela.

---
*Phase: 04-dashboard-operativo-del-admin*
*Completed: 2026-09-03*
