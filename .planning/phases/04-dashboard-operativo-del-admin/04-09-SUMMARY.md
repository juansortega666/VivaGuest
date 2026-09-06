---
phase: 04-dashboard-operativo-del-admin
plan: 09
subsystem: ui
tags: [nextjs, rsc, tailwind, shadcn, a11y, admin, operacion]

# Dependency graph
requires:
  - phase: 04-dashboard-operativo-del-admin
    provides: "04-02 dejo los tokens de carril, columnas de aseo, chip y cabecera de dia en @theme; 04-03 dejo estadoDeAseo() y los dos mapas de copy de slugs; 04-06 dejo lib/data/operacion.ts con leerOperacion() y las tres proyecciones puras"
  - phase: 02-acceso-y-administraci-n-del-cat-logo
    provides: "el shell de (admin) con su guard, TopNav, EstadoVacio, el patron de tabla densa de TablaApartamentos y la salida ya escrita de la trampa del scrollport"
provides:
  - "La ruta /operacion: RSC con la rejilla de dos carriles, la cabecera de pagina y el presupuesto de altura cerrado del carril lateral"
  - "app/(admin)/operacion/loading.tsx: esqueleto con la geometria real de los dos carriles"
  - "EstadoAseo y LeyendaDeAseos: la traduccion de estadoDeAseo() a iconos de lucide, sin ningun if duplicado"
  - "FilaAseo: las seis celdas del contrato y la variante inerte de gestion externa con sus tres reglas de comportamiento"
  - "TablaDia, BloqueDia y FranjaCarga: la tabla densa de un dia, la cabecera colapsable con el toggle de cancelados, y los chips de carga"
  - "RAIZ.admin = /operacion: el aterrizaje del admin tras el login, y el destino del wordmark"
affects: [04-10, 04-11, 04-13, 04-14]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "El componente de presentacion traduce el NOMBRE de icono que devuelve el dominio a un componente de lucide, indexando un Record por una union de literales: un icono nuevo rompe en tsc, no en el navegador"
    - "Cabecera colapsable con el area de clic estirada por `::after` y el control secundario como HERMANO con `relative z-10`, nunca como boton anidado"
    - "El contenido colapsado se oculta con `hidden` y no se desmonta, para que `aria-controls` apunte siempre a algo que existe"
    - "El `title` de un icono de lucide va en un `<span>` que lo envuelve: `Omit<LucideProps, 'ref'>` no admite `title`"

key-files:
  created:
    - app/(admin)/operacion/page.tsx
    - app/(admin)/operacion/loading.tsx
    - app/(admin)/operacion/_components/EstadoAseo.tsx
    - app/(admin)/operacion/_components/FilaAseo.tsx
    - app/(admin)/operacion/_components/TablaDia.tsx
    - app/(admin)/operacion/_components/BloqueDia.tsx
    - app/(admin)/operacion/_components/FranjaCarga.tsx
  modified:
    - app/(admin)/_components/TopNav.tsx
    - lib/auth/routing.ts
    - lib/auth/routing.test.ts

key-decisions:
  - "El bloque Siguientes es UN colapsable que contiene cinco dias colapsables, y los de dentro nacen abiertos solo si tienen filas: cinco estados vacios apilados al abrirlo son un muro, y UI-SPEC §8.1 dice que el vacio se ve 'al expandir'"
  - "El conteo `N aseos` de la cabecera cuenta lo VISIBLE, no el total bruto: los cancelados llevan su propio conteo al lado y sumarlos en los dos sitios haria que los numeros no cuadraran con las filas que el admin tiene delante"
  - "La linea `Hay N aseos programados despues del ...` va DESPUES de la seccion Siguientes y no dentro: con el bloque colapsado, que es como nace, dentro no se veria nunca"
  - "`Ver cancelados (N)` es hermano del boton de colapso y no un boton anidado dentro de el: anidar botones es HTML invalido, y por eso tampoco hace falta ningun stopPropagation"
  - "El encabezado de las tablas de dia NO es sticky, a diferencia del de la tabla de apartamentos: en esta pantalla hay tres o mas tablas apiladas y tres encabezados pegados al mismo top se solapan"

patterns-established:
  - "Toda geometria de esta pantalla se compone de tokens de @theme, incluido el `calc()` de la altura del carril: cero numeros magicos"
  - "El humo de render se mide levantando el build de produccion y pidiendo la pagina con una cookie de sesion real, no razonando sobre el JSX"

requirements-completed: [DASH-01, DASH-03, DASH-07]

# Metrics
duration: 66min
completed: 2026-09-06
---

# Phase 04 Plan 09: La pantalla `/operacion` Summary

**La Fase 3 llevaba generando aseos que nadie podia ver: `/operacion` los pone en pantalla con los tres bloques de dia sobre una rejilla de dos carriles medida al pixel, la fila de 40px con su variante inerte de gestion externa, la franja de carga por aseador, y el admin aterrizando ahi tras el login.**

## Performance

- **Duration:** ~66 min, de los cuales **34 los consumio un solo `next build` en frio** (21,5 min de compilacion mas el resto de type-check y generacion)
- **Started:** 2026-09-06T16:47Z
- **Completed:** 2026-09-06T17:53Z
- **Tasks:** 3 de 3
- **Files modified:** 10 (7 creados, 3 modificados; 1 081 lineas nuevas bajo `app/(admin)/operacion/`)

## Accomplishments

- **El Core Value se hizo visible.** Un admin entra, aterriza en `/operacion` y ve el dia de hoy expandido con todos sus aseos, manana y los cinco dias siguientes colapsados a un clic. Es la primera pantalla de la fase que renderiza lo que el motor de la Fase 3 lleva generando.
- **La geometria esta medida, no estimada, y se compone solo de tokens.** Rejilla `minmax(0, 1fr) var(--container-rail)` con `gap-2xl`: 1000px de carril ancho a 1440 y 840 a 1280, contra 532px de columnas fijas de la tabla de dia, o sea 308px para APARTAMENTO en el peor caso contra su minimo de 200. La altura del carril lateral es `calc(100svh - var(--spacing-barra) - var(--spacing-xl))`: ni un solo numero magico en toda la pantalla.
- **El carril lateral tiene su presupuesto cerrado antes de que existan sus cards.** Es lo que D-02 exige y lo que no se puede improvisar en el plan 04-13: si la bandeja y el panel se construyeran primero y el reparto de altura despues, se descubriria a mitad de camino que una empuja a la otra fuera de la pantalla.
- **La fila inerte cumple las seis celdas y las tres reglas de comportamiento** (DASH-07, D-20, D-21): sin hover, sin area de clic de fila completa, y con `sr-only "no aplica"` en vez de `"sin definir"`, porque no es un dato que falte sino uno que `cl_unmanaged_is_inert` prohibe. Ninguna de las tres se escribio como validacion: las tres se derivan de `is_managed`, que la base ya garantiza coherente.
- **El estado sale SIEMPRE de `estadoDeAseo()`.** Ni un `if` sobre `state` en los siete archivos nuevos: la particion de la cabecera de dia (visibles, cancelados, sin confirmar), el discriminante de la fila y las seis entradas de la leyenda llaman todas a la misma funcion. La leyenda saca hasta sus etiquetas de ahi, con seis entradas minimas, en vez de repetir las seis cadenas.
- **El render se midio de verdad, con el build de produccion levantado y una cookie de sesion de admin.** No es un razonamiento sobre el JSX: la pagina respondio 200 y el HTML trajo las marcas que se detallan abajo.

## Task Commits

1. **Task 1: la ruta, sus dos carriles, el esqueleto y el tercer link** — `80b37d3` (feat)
2. **Task 2: `EstadoAseo`, `FilaAseo` y la variante inerte** — `436146b` (feat)
3. **Task 3: `TablaDia`, `BloqueDia`, `FranjaCarga` y la pantalla cableada a datos reales** — `a11fa49` (feat)

## Files Created/Modified

| Archivo | Lineas | Que es |
| --- | --- | --- |
| `app/(admin)/operacion/page.tsx` | 207 | RSC: lee en paralelo, proyecta, y monta la rejilla, la cabecera y los tres bloques |
| `app/(admin)/operacion/loading.tsx` | 138 | Esqueleto con la geometria real de los dos carriles, nunca un spinner |
| `app/(admin)/operacion/_components/FilaAseo.tsx` | 264 | Las seis celdas y la variante inerte |
| `app/(admin)/operacion/_components/BloqueDia.tsx` | 173 | Cabecera colapsable de 48px, conteos y toggle de cancelados |
| `app/(admin)/operacion/_components/EstadoAseo.tsx` | 120 | Icono + etiqueta + color, y la leyenda de los seis |
| `app/(admin)/operacion/_components/TablaDia.tsx` | 117 | La tabla densa de un dia, su orden y la nota de gestion externa |
| `app/(admin)/operacion/_components/FranjaCarga.tsx` | 62 | Los chips de carga de hoy |
| `app/(admin)/_components/TopNav.tsx` | — | Tres links, `Operación` primero, wordmark a `/operacion` |
| `lib/auth/routing.ts` | — | `RAIZ.admin` a `/operacion`, `/operacion` en `ZONA_ADMIN` |
| `lib/auth/routing.test.ts` | — | Dos filas nuevas en la tabla de decision, tres destinos actualizados |

## Verificacion medida

| Comando | Resultado |
| --- | --- |
| `npm run build` | Compilado en 21,5 min (frio), type-check y 7/7 paginas. `/operacion` sale en la tabla de rutas como `ƒ` (dinamica), 7,16 kB, 125 kB de First Load JS |
| `npx tsc --noEmit` | Sin salida |
| `npm run lint` | 3 errores + 1 aviso, **exactamente los cuatro preexistentes** de `deferred-items.md` §1 (`e2e/fixtures.ts` y `aseador.schema.test.ts`). Cero hallazgos en los archivos de este plan |
| `npm run test:unit` | 28 archivos, **504 tests** verdes (baseline 502; +2 filas en la tabla de ruteo) |
| `npm run test:integration` | 14 archivos, **128 tests** verdes (baseline intacta) |
| `npm run db:test` | `Files=7, Tests=153` — `Result: PASS` (este plan no toca SQL) |
| `npm run ci:arch` | `check-service-role: OK` |
| `grep -rn "dangerouslySetInnerHTML" app/(admin)/operacion/` | Sin coincidencias (T-04-10) |

### El humo de render, con el build de produccion levantado

Se levanto `npm start` sobre el build recien hecho y se pidio `/operacion` dos veces: sin sesion y con una cookie de admin de verdad, obtenida haciendo `signInWithPassword` a traves de `createServerClient` de `@supabase/ssr` para que los nombres y el troceado de la cookie fueran los reales.

| Comprobacion | Resultado |
| --- | --- |
| `/operacion` sin sesion | `307` a `/login` |
| `/` sin sesion | `307` a `/login` |
| `/operacion` con cookie de admin | `200`, 66,7 kB de HTML |

Con la base vacia (0 aseos) el HTML trajo el titulo, los tres bloques de dia, el carril lateral, la leyenda y el CTA, y **no** trajo la franja de carga, que es lo correcto: sin ningun aseo vivo hoy la franja no se renderiza.

Despues se sembro el escenario de once objetos de `lib/test/aseos.ts` (el arnes del plan 04-01) y se repitio la peticion. De trece marcas, **once salieron ciertas**:

`A cargo` · `data-estado="sin_confirmar"` · `data-estado="pendiente"` · `data-estado="en_curso"` · `data-estado="externa"` · cancelado AUSENTE por defecto · `Ver cancelados (N)` presente · `VivaGuest no las opera` · `no aplica` · `sin definir` · `Carga de hoy`.

Las dos que salieron falsas **no son defectos de la UI y esta comprobado en el arnes**:

- `data-estado="terminado"`: el aseo `completada` del escenario se siembra en `fechas.ayer` (`lib/test/aseos.ts:325`), y la ventana de `leerOperacion()` arranca en `hoy`. No aparece porque no debe aparecer.
- `Entra huésped el mismo día`: **el arnes no pone `is_urgent` en ninguna fila** (`grep -c is_urgent lib/test/aseos.ts` → 0). No hay ninguna fila urgente que renderizar.

La base quedo en 0 aseos tras el `limpiarAseos()` del arnes, verificado, y el archivo de prueba temporal se borro: `git status --short` no reporta nada de este plan.

## Decisions Made

1. **`Siguientes` es un colapsable de colapsables.** UI-SPEC §8.1 pide tres bloques y a la vez que `Siguientes` agrupe por dia. Se resolvio con un `BloqueDia` que recibe `children` en vez de pintar tabla, y cinco `BloqueDia` de dia dentro. Los de dentro nacen abiertos solo si tienen filas: cinco estados vacios apilados al abrir el bloque son un muro, y §8.1 dice literalmente que el vacio se ve "al expandir".
2. **`N aseos` cuenta lo visible.** La cabecera pinta `14 aseos · 3 sin confirmar` y al lado `Ver cancelados (2)`. Contar los cancelados dentro de los 14 haria que el admin sumara 14 y 2 y contara 14 filas. El contrato no lo decidia; se resolvio por coherencia aritmetica con lo que se ve.
3. **La linea del horizonte va fuera de `Siguientes`.** §8.1 la situa "despues del ultimo grupo". Dentro del bloque cumple la letra pero no se veria nunca, porque `Siguientes` nace colapsado. Fuera cumple las dos cosas.
4. **`Ver cancelados` es hermano, no hijo, del boton de colapso.** El contrato pedia `stopPropagation`, que presupone anidamiento; un `<button>` dentro de otro es HTML invalido y varios lectores de pantalla no alcanzan el de dentro. Se resolvio con el patron que ya usa la tabla de apartamentos: `::after` estirando el area del boton de colapso y el control secundario por encima con `relative z-10`. Sin anidamiento no hay evento que detener.
5. **El encabezado de las tablas de dia no es sticky.** El de `TablaApartamentos` si lo es porque hay una sola tabla. Aqui hay tres o mas apiladas, y tres encabezados pegados al mismo `top` se tapan entre ellos. Lo que si se copio tal cual, como pedia el plan, es el `containerClassName` que devuelve el scrollport al viewport.
6. **El contenido colapsado se oculta con `hidden`, no se desmonta.** `aria-controls` promete que apunta a un elemento existente, y desmontar el contenido lo convierte en una referencia rota mientras el bloque esta cerrado. Ademas el buscador del navegador sigue encontrando lo colapsado.

## Deviations from Plan

### Ajustes de secuencia y de verificacion

**1. El `leerOperacion()` de `page.tsx` aterrizo en la Task 3, no en la Task 1**

- **Que decia el plan:** la Task 1 crea `/operacion` "como RSC que lee con `leerOperacion()`".
- **Que se hizo:** la Task 1 dejo la ruta, la rejilla, la cabecera, el `loading.tsx` y el `TopNav`; la lectura entro en la Task 3, junto con los tres componentes que la consumen.
- **Por que:** en la Task 1 no existia todavia ningun consumidor de esas filas, asi que la lectura habria sido un binding sin usar, que es un error de `no-unused-vars` y un commit intermedio rojo. El `done` de la Task 1 no pedia datos ("renderiza con los dos carriles y la rejilla"), y la Task 3 declara `page.tsx` entre sus archivos.
- **Efecto sobre el resultado final:** ninguno. El `key_link` `page.tsx → leerOperacion` esta cumplido.

**2. `npm run build` corrio una vez al final y no tres, una por tarea**

- **Por que:** el build en frio de este checkout tardo **21,5 minutos de compilacion**, consistente con lo que el plan 04-06 midio de `tsc` (6 min 39 s de reloj con 6 s de CPU). Tres builds completos habrian sido mas de una hora de reloj para verificar el mismo arbol tres veces.
- **Que si corrio por tarea:** `npx tsc --noEmit`, con las caches ya calientes, despues de cada tarea y antes de cada commit.
- **Efecto:** el arbol final esta verificado con `build`, `tsc`, `lint`, las tres suites y el humo de render. El unico riesgo asumido es que un commit intermedio no se probo con `build` por separado; el contenido de los tres es el mismo que el del arbol verificado.

### Auto-fixed Issues

**1. [Rule 1 - Bug] `title` sobre un icono de lucide no compila**

- **Found during:** type-check de la Task 2, dentro del `next build`
- **Issue:** `FilaAseo.tsx:114` pasaba `title` al componente `Flag` para que el motivo de revision saliera al pasar el mouse. `lucide-react` 1.39.0 tipa sus props como `Omit<LucideProps, 'ref'> & RefAttributes<SVGSVGElement>` y `title` no esta ahi: `Property 'title' does not exist on type ...`. El build fallo con `Failed to compile`.
- **Fix:** el `title` se movio a un `<span className="flex shrink-0">` que envuelve al icono; el `aria-label` se queda en el icono, que es donde el contrato lo pide. Los dos canales siguen llevando el mismo texto de `copyDeReviewReason()`.
- **Files modified:** `app/(admin)/operacion/_components/FilaAseo.tsx`
- **Verification:** `npx tsc --noEmit` sin salida y `npm run build` verde despues del cambio.
- **Committed in:** `436146b`

**Total deviations:** 2 de secuencia (documentadas arriba) + 1 auto-corregida (Regla 1).
**Impact on plan:** cero sobre el alcance. Los ocho archivos de `files_modified` son exactamente los ocho tocados, mas `lib/auth/routing.ts` y su test, que el propio plan pedia comprobar y ajustar en la Task 1.

## Known Stubs

Los cuatro son huecos DECLARADOS por el plan, con dueño asignado, no atajos:

| Stub | Archivo | Quien lo cierra |
| --- | --- | --- |
| El boton `Crear aseo` se renderiza pero no abre nada | `page.tsx:~78` | **04-10** (`DialogoCrearAseo`) |
| El `<aside>` esta vacio: solo reserva su geometria y su presupuesto de altura | `page.tsx:~180` | **04-10** (bandeja) y **04-13** (panel de alertas) |
| La celda del menu de la fila gestionada existe con su ancho y esta vacia | `FilaAseo.tsx:~250` | **04-11** (`MenuAseo`) |
| El sitio de la marca de ultima actualizacion es un comentario | `page.tsx:~72` | **04-13** (`MarcaActualizacion`) |

Ninguno impide que el objetivo de ESTE plan se cumpla: los tres bloques de dia con datos reales, la fila inerte y la franja de carga estan completos y medidos.

## Threat Flags

Ninguna superficie nueva fuera del registro del plan. Los tres `mitigate` quedaron cubiertos:

- **T-04-10 (XSS):** `grep -rn "dangerouslySetInnerHTML" app/(admin)/operacion/` sin coincidencias. Todo el texto que viene de la base (nombres, contactos externos) pasa por el escapado de React.
- **T-04-11 (fuga de informacion):** ninguna celda referencia una columna de `property_secrets`. El `select` que alimenta la pantalla lo fija `SELECT_OPERACION` en `lib/data/operacion.ts` y no se amplio.
- **T-04-06 (elevacion):** `page.tsx` usa `createClient()` de `lib/supabase/server`, con el JWT del usuario. `npm run ci:arch` verde.
- **T-04-17 quedo en `accept`, como estaba:** que la fila inerte no tenga menu es UX. La garantia real sigue siendo el CHECK `cl_unmanaged_is_inert` y el filtro `is_managed` de las seis RPC.

## Issues Encountered

- **El I/O de iCloud volvio a dominar el reloj, ahora en `next build`.** El primer build tardo **21,5 minutos de compilacion** con el proceso padre a 0 % de CPU y 3,3 s acumulados; el trabajo real lo hacia un `jest-worker` a 0,6 %. Confirmado el aviso del plan 04-06: **un proceso a 0 % de CPU no esta colgado**. Se comprobo mirando `ps -o time` y las marcas de tiempo de `.next/server/`, no matando nada. Con la cache de webpack caliente, el segundo build bajo a unos 8 minutos y `tsc` a segundos.
- **Esta vez `.next/types/` no traia duplicados de iCloud.** El sintoma del plan 04-06 (`routes.d 2.ts` rompiendo `tsc` con TS2300/TS2428) no se materializo; se verifico con `ls -la .next/types/` antes de dar por bueno el primer `tsc`.
- **La base local estaba con 0 aseos al empezar**, asi que el primer humo de render midio el camino vacio (que tambien es un camino del contrato: dia sin aseos, franja no renderizada). Para medir el camino con filas hubo que sembrar el escenario del arnes y limpiarlo despues.
- **`npm run lint` sigue rojo por lo de siempre.** Los 3 errores de `e2e/fixtures.ts` y el aviso de `aseador.schema.test.ts` son los de `deferred-items.md` §1, del commit `814e0cd` de la Fase 2, y le tocan al plan 04-14. Este plan no los toco: la regla es que solo se auto-corrige lo que causo el cambio en curso.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **04-10 (bandeja + `Sheet` + crear aseo):** el `<aside>` ya existe con `aria-label="Pendientes y alertas"`, su `sticky top-barra` y su altura cerrada. El reparto acordado esta escrito en el comentario de `page.tsx` y hay que respetarlo: cabecera y CTA fuera del scroll, lista a `max-h-[40%]` del carril con scroll propio. El boton `Crear aseo` esta en la cabecera esperando su handler.
- **04-11 (`MenuAseo` y los cuatro dialogos):** la sexta celda de `FilaAseo` ya esta, con `relative z-10` para quedar por encima del `::after` del ancla. **Solo se pinta en la variante gestionada:** la inerte tiene que seguir con la celda vacia, y eso no es autorizacion sino UX (T-04-17).
- **04-13 (panel de alertas y marca de frescura):** el sitio de la marca esta señalado en la cabecera. `leerOperacion()` devuelve `leidoEnMs`, que es la marca UNICA de D-14; hoy `page.tsx` no la consume porque no hay quien la pinte. Cuando se pinte, **no** llamar a `Date.now()` en el render de cada superficie.
- **04-14 (E2E):** `/operacion` es ahora la raiz del admin. Cualquier fixture que asumiera `/apartamentos` como aterrizaje tras el login ya no vale; `lib/auth/routing.test.ts` documenta la tabla nueva. Y ahi es donde toca cerrar el diferido §1 de `deferred-items.md`.

Sin bloqueos abiertos por este plan.

## Self-Check: PASSED

Archivos declarados, verificados en disco:

- `app/(admin)/operacion/page.tsx` — presente (207 lineas, min_lines 90)
- `app/(admin)/operacion/loading.tsx` — presente (138 lineas)
- `app/(admin)/operacion/_components/EstadoAseo.tsx` — presente (120 lineas)
- `app/(admin)/operacion/_components/FilaAseo.tsx` — presente (264 lineas, min_lines 110)
- `app/(admin)/operacion/_components/TablaDia.tsx` — presente (117 lineas)
- `app/(admin)/operacion/_components/BloqueDia.tsx` — presente (173 lineas)
- `app/(admin)/operacion/_components/FranjaCarga.tsx` — presente (62 lineas)

`key_links` verificados con grep:

- `page.tsx` → `leerOperacion` — presente
- `FilaAseo.tsx` → `estadoDeAseo` — presente
- `TopNav.tsx` → `/operacion` — presente (link y wordmark)

Commits declarados, verificados en `git log`: `80b37d3`, `436146b`, `a11fa49` — los tres presentes.

`git status --short` no reporta ningun archivo de este plan sin comprometer. La unica entrada pendiente del arbol es `ci/README.md`, sin seguimiento y anterior a este plan.

---
*Phase: 04-dashboard-operativo-del-admin*
*Completed: 2026-09-06*
