---
phase: 04-dashboard-operativo-del-admin
plan: 12
subsystem: ui
tags: [postgrest, supabase, typescript, rls, vitest, embeds, timezone, rsc, xss]

# Dependency graph
requires:
  - phase: 01-fundaci-n-schema-y-rls
    provides: "damages con damages_admin_all, damages_cleaner_select y grant select desde la migracion 08; cleanings y profiles con sus policies"
  - phase: 04-dashboard-operativo-del-admin
    provides: "04-02 dejo EstadoVacio con su prop compacto; 04-03 dejo estadoDeAseo() en lib/domain/cleanings.ts; 04-06 dejo el patron de capa de lectura y la constante SIN_ASIGNAR; 04-01 dejo lib/test/aseos.ts"
provides:
  - "lib/data/historial.ts: leerHistorial() con los dos embeds calificados por nombre de clave foranea y SIN filtro por resolved_at"
  - "mezclarHistorial(): la mezcla cronologica descendente de aseos y danos, como funcion pura con tipo discriminado"
  - "BLOQUE_HISTORIAL = 30 como constante exportada"
  - "diaBog() en lib/domain/dates.ts: el dia de negocio de Bogota de un instante"
  - "copyDeTipoDeAseo() en lib/domain/cleanings.ts: Repaso / Emergencia, con null para el tipo normal"
  - "HistorialApartamento: la seccion de solo lectura al final de la ficha, con su estado vacio y su Ver 30 mas"
  - "limiteDeHistorial(): el acotado del parametro ?historial= de la URL"
affects: [04-13, 04-14, 06-pwa-del-aseador]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dos consultas independientes y una mezcla PURA exportada aparte: ahi viven los unitarios que fijan el orden, y ahi es donde se atrapa el concat sin reordenar"
    - "Todo embed hacia una tabla con mas de una clave foranea va calificado por nombre de FK, con un test de integracion que lo demuestra contra PostgREST real"
    - "El 'ver mas' de una lista de solo lectura va por query string, no por estado de cliente: la seccion sigue siendo un RSC, el enlace se comparte y volver atras deshace la expansion"
    - "Todo numero que llegue de la query string y acabe en un limit de Postgres pasa por una funcion pura que lo acota, y esa funcion tiene test propio"
    - "Los indices PARCIALES del schema no se copian como predicado de consulta sin preguntarse si el filtro es del negocio o del indice"

key-files:
  created:
    - lib/data/historial.ts
    - lib/data/historial.test.ts
    - lib/data/historial.integration.test.ts
    - app/(admin)/apartamentos/_components/HistorialApartamento.tsx
    - app/(admin)/apartamentos/_components/HistorialApartamento.test.ts
  modified:
    - app/(admin)/apartamentos/[id]/page.tsx
    - lib/domain/dates.ts
    - lib/domain/cleanings.ts

key-decisions:
  - "Los danos resueltos NO se filtran, y el modulo lo deja escrito con su razon: damages_open_idx es parcial sobre los no resueltos e invita a copiar ese predicado. Se asume no usar ese indice"
  - "El dia de un dano sale de diaBog() y nunca de created_at.slice(0,10): un dano reportado a las 21:00 de Bogota se pintaria al dia siguiente y saltaria por encima del aseo con el que se reporto"
  - "La entrada del historial es un tipo DISCRIMINADO por `clase`, no un objeto con `aseo?` y `dano?`: con la union no se puede escribir el estado en el que las dos vienen vacias"
  - "El 'Ver 30 mas' va por ?historial= y no por useState: la seccion se queda como RSC y no arrastra la ficha entera a cliente"
  - "El limite se sobre-pide a cada tabla (techo + 1) en vez de crear una vista SQL: la fila extra responde hayMas sin un segundo viaje ni un count, y con retencion de 6 meses el sobre-coste es de decenas de filas"
  - "En una unidad de gestion externa la linea 2 va VACIA, no 'Sin asignar': cl_unmanaged_is_inert deja aseador_id nulo por construccion y decir 'Sin asignar' sugeriria que falta asignarlo"

patterns-established:
  - "Todo señuelo declarado en el plan se corre de verdad, en las DOS suites cuando aplica, y se anota su fallo literal en el SUMMARY"

requirements-completed: [DASH-06, REPORT-04]

# Metrics
duration: 20min
completed: 2026-09-06
---

# Phase 04 Plan 12: El historial del apartamento Summary

**Los daños que la Fase 1 lleva guardando desde el principio tienen por fin una pantalla: `leerHistorial()` trae aseos y daños con los dos embeds calificados por nombre de clave foránea, `mezclarHistorial()` los funde en una línea de tiempo descendente con tipo discriminado, y la sección de solo lectura vive dentro de la ficha del apartamento, sin ruta nueva; 19 unitarios y 7 de integración contra Postgres real, con los dos señuelos del plan corridos y rojos en ambas suites.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-09-06T19:07Z
- **Completed:** 2026-09-06T19:27Z
- **Tasks:** 2 de 2
- **Files modified:** 8 (5 creados, 3 modificados; 1 487 líneas entre los seis archivos del plan)

## Accomplishments

- **REPORT-04 deja de ser un dato invisible.** `damages` existe con sus policies desde la Fase 1 y hasta hoy nadie podía verla. La sección del historial es su primera superficie, y llega con el daño resuelto incluido, que es la mitad que se pierde si alguien copia el predicado de `damages_open_idx`.
- **El embed ambiguo está medido contra PostgREST real, no razonado.** `damages` tiene dos claves foráneas hacia `profiles` (`damages_reported_by_fkey` y `damages_resolved_by_fkey`), exactamente el mismo agujero que `cleanings`. El test de integración emite la consulta con el JWT de un admin y afirma que `reportadoPor` viene resuelto: si el embed fuera `profiles(...)` sin calificar, `leerHistorial` habría lanzado con `PGRST201` y ninguna aserción de ese bloque se alcanzaría. `tsc` no lo ve.
- **El orden cronológico está fijado por SECUENCIA EXACTA, no por conteo.** El unitario compara la lista contra `['aseo:a-nuevo', 'dano:d-nuevo', 'dano:d-viejo', 'aseo:a-viejo']`, y el de integración afirma dos cosas: que los días nunca suben, y que el daño de HOY va antes que el aseo de AYER. Concatenar pondría los cinco aseos primero y los dos daños al final, y esa segunda aserción lo atrapa sola.
- **La RLS de las dos consultas queda ejercitada (T-04-13).** Con el JWT de la aseadora A, el mismo apartamento devuelve 5 entradas (sus tres aseos por `cleanings_cleaner_select` más los dos daños que cuelgan de uno de ellos por `damages_cleaner_select`), y el admin ve las 7 en el control de la misma aserción. Los dos aseos sin aseador no le llegan.
- **La unidad de gestión externa se renderiza igual (DASH-07).** Su aseo inerte vuelve con `state` nulo y sin aseador, y `estadoDeAseo()` lo pinta con `CircleDashed` y `Gestión externa`. La sección no se oculta: el historial de fechas sí es real aunque VivaGuest no opere la unidad.
- **Los dos señuelos del plan se corrieron y salieron rojos en las dos suites**, con el fallo literal anotado abajo.
- **La suite completa subió sin mover ninguna cifra heredada:** unitarios 548 → 567 (29 → 31 archivos), integración 138 → 145 (15 → 16 archivos), pgTAP intacto en `Files=7, Tests=153, Result: PASS`.

## Task Commits

1. **Task 1 (RED): el historial en rojo, con los dos señuelos declarados** - `63d30fb` (test)
2. **Task 1 (GREEN): lectura y mezcla cronológica del historial** - `1170d22` (feat)
3. **Task 2: la sección `Historial` dentro de la ficha del apartamento** - `d0ac0c7` (feat)

## Files Created/Modified

- `lib/data/historial.ts` (305 líneas) — Las dos consultas y la mezcla pura. El cliente entra por parámetro, no se construye ninguno, y no hay una referencia a la fábrica administrativa (T-04-06).
- `lib/data/historial.test.ts` (392 líneas) — 14 unitarios: 8 sobre la mezcla con objetos armados a mano, 6 sobre el contrato de la llamada con un cliente falso de DOS tablas.
- `lib/data/historial.integration.test.ts` (311 líneas) — 7 aserciones contra el stack local con JWT reales de un admin y de una aseadora.
- `app/(admin)/apartamentos/_components/HistorialApartamento.tsx` (294 líneas) — La sección, sus filas de 64px, el estado vacío y el `Ver 30 más`. RSC, sin `'use client'`.
- `app/(admin)/apartamentos/_components/HistorialApartamento.test.ts` (57 líneas) — 5 unitarios sobre `limiteDeHistorial()`.
- `app/(admin)/apartamentos/[id]/page.tsx` (99 → 128 líneas) — `searchParams`, la lectura del historial dentro del `Promise.all` que ya existía, y la sección al final. El formulario y su barra de acciones no se tocaron.
- `lib/domain/dates.ts` — `diaBog()` añadida (ver desviaciones).
- `lib/domain/cleanings.ts` — `copyDeTipoDeAseo()` añadida (ver desviaciones).

## Los dos señuelos, corridos

| Señuelo | Mutación | Fallo medido |
| --- | --- | --- |
| Concatenar sin reordenar | `return entradas.sort(...)` → `return entradas` | **3 unitarios rojos.** `AssertionError: expected [ 'aseo:a-dia', …(2) ] to deeply equal [ 'aseo:a-dia', 'dano:d-tarde', …(1) ]` — los aseos quedaban arriba y los daños al final, sin importar la fecha |
| Filtrar los daños resueltos | añadir `.is('resolved_at', null)` a la consulta de `damages` | **1 unitario y 4 de integración rojos.** Unitario: `AssertionError: expected [ 'resolved_at', 'property_id' ] to not include 'resolved_at'`. Integración: `expected [ …(6) ] to include 'c60fd5c1-…'` y `expected […] to have a length of 7 but got 6` — el daño resuelto desaparecía de la base, no solo de la vista |

Los dos se revirtieron y las dos suites volvieron a verde antes del commit.

## Verificación medida

| Comando | Resultado |
| --- | --- |
| `npm run test:unit` | 31 archivos, **567 tests**, todos verdes (baseline heredada: 29 / 548) |
| `npm run test:integration` | 16 archivos, **145 tests**, todos verdes (baseline heredada: 15 / 138) |
| `npm run db:test` | `Files=7, Tests=153` — `Result: PASS` (sin cambio: este plan no toca SQL) |
| `npx tsc --noEmit` | Sin salida |
| `npm run build` | Compilado, 11 rutas. `/apartamentos/[id]` en 224 B / 268 kB de First Load |
| `npm run lint` | 3 errores y 2 avisos, **exactamente los preexistentes** (`e2e/fixtures.ts` ×3, `_valores`, `_phone`). Cero nuevos |
| `npm run ci:arch` | `check-service-role: OK` |
| `grep -rn "dangerouslySetInnerHTML" "app/(admin)/apartamentos/"` | Un único acierto, y es la línea del COMENTARIO que prohíbe usarlo. Cero usos |

Aritmética de los tests nuevos: **+19 unitarios** (14 de `historial.test.ts` + 5 de `HistorialApartamento.test.ts`) y **+7 de integración**. 548 + 19 = 567 y 138 + 7 = 145. Cuadra exacto.

## Decisions Made

1. **El día de un daño sale de `diaBog()`, no de `created_at.slice(0, 10)`.** `cleanings.scheduled_date` es un `date` y llega como `'YYYY-MM-DD'`; `damages.created_at` es un `timestamptz` y llega en UTC. Recortarle los diez primeros caracteres pinta un daño de las 21:00 de Bogotá al día SIGUIENTE, y además lo hace saltar por encima del aseo con el que se reportó. Hay un unitario que fija el caso con `2026-09-02T02:00:00Z` → `2026-09-01`.
2. **El desempate dentro del mismo día es parte del contrato, no un detalle.** Se ordena por fecha, luego por instante, luego por `id`. Sin la última clave, dos filas con el mismo instante saldrían en el orden de llegada de dos consultas independientes y la lista bailaría entre dos cargas de la misma ficha. Hay un unitario que llama a `mezclarHistorial` con las entradas en los dos órdenes y compara los dos resultados.
3. **El `Ver 30 más` va por `?historial=` y no por `useState`.** Meterlo en estado de cliente convertiría la sección en un componente cliente y arrastraría el historial entero al bundle. Con la query string, la sección sigue siendo un RSC, el enlace se puede compartir y el botón "atrás" del navegador deshace la expansión. `scroll={false}` evita que la navegación mande el foco al principio de la ficha, cinco secciones más arriba.
4. **Se sobre-pide `techo + 1` a cada tabla en vez de crear una vista SQL que una las dos.** Las N primeras entradas de la mezcla solo pueden salir de las N primeras de cada lista, así que la página es correcta; la fila extra es lo que responde `hayMas` sin un segundo viaje ni un `count`. Con retención de seis meses el sobre-coste son decenas de filas, y una migración para ahorrar una lectura que no duele es peor negocio.
5. **`.range()` NO se usa.** Aplicado a cada tabla por separado paginaría cada lista por su cuenta, y el bloque 2 del historial no es el bloque 2 de los aseos más el bloque 2 de los daños: se saltarían entradas. El desplazamiento se aplica a la lista ya mezclada, y hay un test de integración que pide tres bloques de 3 y afirma que son disjuntos y que su unión son las 7 entradas.
6. **En gestión externa la línea 2 va vacía, no `Sin asignar`.** `cl_unmanaged_is_inert` deja `aseador_id` nulo por construcción; decir "Sin asignar" ahí sugeriría que falta asignarlo y es justo lo contrario. En un aseo GESTIONADO sin aseador sí falta, y ahí se usa `SIN_ASIGNAR`, el término fijo del vocabulario de UI-SPEC §18.4, importado de `lib/data/operacion.ts` en vez de reescrito.
7. **El `Record` de iconos se duplicó respecto a `EstadoAseo.tsx`, la DERIVACIÓN no.** Ese componente pinta además la etiqueta y las clases de una celda de tabla de 40px; aquí hace falta solo el icono dentro de una fila de 64px con otro reparto. Lo que no se duplica es el nombre del icono, la etiqueta ni el color: los tres salen de `estadoDeAseo()`, que sigue siendo la única fuente.

## Deviations from Plan

### Añadidos de corrección

**1. [Regla 2 - Funcionalidad crítica ausente] `diaBog()` en `lib/domain/dates.ts`**

- **Found during:** Task 1, al escribir `mezclarHistorial`.
- **Issue:** La mezcla necesita convertir `damages.created_at` (un `timestamptz`) en un día de negocio de Bogotá para poder compararlo con `cleanings.scheduled_date` (un `date`). El repo no tenía esa función: `hoyBog()` lee el reloj y no acepta un instante por parámetro.
- **Fix:** Se añadió `diaBog(instante)` a `lib/domain/dates.ts`, que usa el MISMO formateador `HOY_BOGOTA` que `hoyBog()`. Se implementó ahí y no dentro de `historial.ts` porque ese archivo declara ser "el único sitio donde se formatea una fecha para pantalla" y `TZ_BOGOTA` es la única constante de zona del repo: una segunda instancia de `Intl.DateTimeFormat` con la zona escrita a mano en la capa de datos es exactamente la duplicación que ese módulo existe para evitar.
- **Files modified:** `lib/domain/dates.ts` (no estaba en `files_modified` del plan).
- **Verification:** Cubierta por el unitario `'el día de un daño es el de BOGOTÁ, no el del proceso'`.
- **Committed in:** `1170d22`.

**2. [Regla 2 - Funcionalidad crítica ausente] `limiteDeHistorial()` y su test**

- **Found during:** Task 2, al decidir que el `Ver 30 más` fuera por query string.
- **Issue:** El número del parámetro `?historial=` acaba en el `limit` de dos consultas a Postgres. Sin acotarlo, `?historial=999999` es una consulta arbitrariamente grande que cualquiera con sesión de admin dispara escribiéndola a mano. No hace falta mala fe: basta un enlace mal copiado.
- **Fix:** `limiteDeHistorial()` redondea hacia arriba al bloque de 30 (el contrato de §14 es que la lista crece de treinta en treinta, no que pueda quedarse en 47) y le pone un techo duro de 300. Cualquier cosa que no sea un entero mayor que el bloque cae al bloque base sin error: es un parámetro de presentación, no una entrada de formulario, y un 400 por un enlace mal copiado sería peor que mostrar la primera página.
- **Files modified:** `app/(admin)/apartamentos/_components/HistorialApartamento.tsx` y su test, que no estaba en `files_modified`.
- **Verification:** 5 unitarios, incluidos `'abc'`, `'1e9'`, `'-90'` y `Number.MAX_SAFE_INTEGER`.
- **Committed in:** `d0ac0c7`.

**3. [Regla 2 - Funcionalidad crítica ausente] `copyDeTipoDeAseo()` en `lib/domain/cleanings.ts`**

- **Found during:** Task 2, al escribir la línea 2 de la entrada de aseo.
- **Issue:** Las palabras `Repaso` y `Emergencia` ya estaban escritas a mano en dos archivos de `/operacion` (planes 04-10 y 04-11). Añadir un tercer literal era la opción obvia y la peor: tres sitios donde cambiar un término de producto.
- **Fix:** `copyDeTipoDeAseo(tipo)` vive en `lib/domain/cleanings.ts`, junto a los otros dos mapas de copy del módulo, con `switch` exhaustivo sin rama por defecto (el día que la migración añada un cuarto valor a `cleaning_type`, rompe `tsc`). Devuelve `null` para `normal` a propósito: el tipo por defecto no se pinta.
- **Files modified:** `lib/domain/cleanings.ts` (no estaba en `files_modified`).
- **Alcance NO tocado:** los dos literales que ya existían en `FilaAseo.tsx` y `DialogoCrearAseo.tsx` se dejaron como están. Son archivos de otros dos planes y la regla de alcance dice que solo se auto-corrige lo que causan los cambios del plan en curso. Queda anotado en `deferred-items.md` con las líneas exactas.
- **Committed in:** `d0ac0c7`.

### Correcciones de los propios tests, entre el RED y el GREEN

Dos expectativas del archivo `historial.test.ts` estaban mal escritas en el commit RED y se corrigieron en el GREEN, las dos por el mismo motivo: se redactaron antes de tener la implementación delante y no habían pasado por el ordenador.

- `'devuelve UNA sola lista cronológica descendente'` esperaba `['2026-09-05', '2026-09-03', '2026-08-10', '2026-08-20']`, que **no es descendente**. La secuencia correcta es `…, '2026-08-20', '2026-08-10'`.
- `'las entradas son un tipo DISCRIMINADO'` afirmaba además un orden (`['aseo', 'dano']`) que no es lo que ese test mide y que la regla de desempate contradice. Se cambió por una comparación de conjunto, con el comentario que dice que el orden lo fija el bloque de arriba.

Ninguna de las dos aflojó una aserción de comportamiento: la primera la ENDURECIÓ (la esperada anterior era imposible de satisfacer por una implementación correcta) y la segunda quitó una afirmación que no correspondía a ese test.

### Auto-fixed Issues

**1. [Regla 1 - Bug en la fixture] `props_active_requires_owner` en el test del historial vacío**

- **Found during:** Primera corrida verde de la Task 1.
- **Issue:** El test `'un apartamento sin nada devuelve una lista vacía'` sembraba un apartamento con `is_active: true` y sin `responsable_id`. `new row for relation "properties" violates check constraint "props_active_requires_owner"`.
- **Fix:** Se siembra como borrador (`is_active: false`), que además es el caso REAL del historial vacío: un apartamento recién creado al que todavía no le ha llegado ningún aseo.
- **Files modified:** `lib/data/historial.integration.test.ts`.
- **Committed in:** `1170d22`.

---

**Total deviations:** 3 añadidos de corrección (Regla 2, los tres con test), 1 auto-corregida (Regla 1, en una fixture) y 2 correcciones de expectativas de test entre RED y GREEN.
**Impact on plan:** Cero sobre el alcance de producto. Los 5 archivos declarados en `files_modified` están los 5; se añadieron 3 archivos más (`HistorialApartamento.test.ts`, `lib/domain/dates.ts`, `lib/domain/cleanings.ts`), todos justificados arriba.

## Threat Flags

Ninguna superficie nueva fuera del `<threat_model>` del plan. Las cuatro dispositions se ejecutaron:

| Amenaza | Cómo quedó |
| --- | --- |
| T-04-10 (XSS en `damages.descripcion`) | Se renderiza como texto de React y como atributo `title`, los dos escapados por defecto. `grep -rn "dangerouslySetInnerHTML" "app/(admin)/apartamentos/"` devuelve un único acierto, y es la línea del comentario que lo prohíbe. La tabla está vacía hoy: la regla se fija ahora, antes de que la Fase 6 la llene desde la PWA |
| T-04-06 (elevación de privilegio) | `lib/data/historial.ts` recibe el cliente por parámetro y no construye ninguno. `npm run ci:arch` verde |
| T-04-13 (fuga de información) | Las dos consultas van con el JWT del usuario. Medido: la aseadora A ve 5 entradas donde el admin ve 7 |
| T-04-SC (instalaciones de npm) | Este plan no instaló ningún paquete. `package.json` sin tocar |

## Known Stubs

Ninguno. Las tres funciones exportadas de `lib/data/historial.ts` leen datos reales y ninguna devuelve un valor fijo, un array vacío codificado ni un placeholder. La sección se alimenta de esas lecturas: no hay ninguna prop recibiendo datos de mentira.

Una aclaración que NO es un stub: `damages` está vacía en la base local y en producción, porque los RPC de reporte llegan en la Fase 6. La sección funciona y está probada contra daños sembrados de verdad en el test de integración; lo que falta es quien los escriba, y es otra fase. El historial de aseos sí tiene datos reales hoy.

## Issues Encountered

- **El I/O de iCloud volvió a dominar el reloj, pero se mitigó siguiendo la recomendación del 04-06:** `npx tsc --noEmit` se corrió UNA vez al empezar, en frío, sin esperar nada de él. A partir de ahí las dos corridas siguientes fueron instantáneas. El único coste visible fue la primera corrida del unitario bajo `app/`, que tardó 57 s, de los cuales 57 fueron `import`. La segunda, dentro de la suite completa, tardó 1,29 s en total para los 31 archivos.
- **`npm run lint` tardó menos de dos minutos con las cachés calientes**, muy lejos de los 53 minutos que documentó el 04-05 en frío.
- **El stack de Supabase estaba sano** y la base tenía los datos de la semilla más lo que dejaron los planes anteriores. La trampa de `deferred-items.md` (arrancar solo Postgres y que la siembra falle con `name resolution failed`) no se materializó.
- **`sembrarEscenarioDeAseos()` no siembra daños**, y no es un olvido de este plan: el arnés es de aseos. Los dos daños los siembra el propio archivo de integración, colgando de `aseoTerminado`, con `created_at` EXPLÍCITO y no por el default `now()`. Bajo `TZ=UTC` un daño insertado a las 02:00 pertenece al día anterior en Bogotá, así que fijar el instante a las 17:00Z de un día de negocio conocido es lo que hace que la posición esperada en la mezcla no dependa de la hora a la que alguien corra la suite.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **04-13 y 04-14** heredan una sección de solo lectura y estable. Lo único que la Fase 6 tiene que hacer para activarla del todo es escribir en `damages`: la lectura, la mezcla y la pantalla ya están.
- **Fase 6 (PWA del aseador):** cuando los RPC de reporte existan, `damages.descripcion` pasa a ser texto escrito desde fuera del admin. La regla de T-04-10 ya está fijada en este archivo, y el comentario del componente lo dice para quien lo lea entonces.
- **Cuando llegue "marcar como resuelto"** (que es de la Fase 6, D-23), el dato que necesita ya viaja: `resolved_at` viene en cada entrada de daño y no se filtra. Lo único que falta es el control y su RPC.
- **Deuda anotada, no abierta:** los dos literales `Repaso` / `Emergencia` de `app/(admin)/operacion/_components/` siguen sin usar `copyDeTipoDeAseo()`. Está en `deferred-items.md` con las líneas exactas.

Sin bloqueos abiertos por este plan.

## Self-Check: PASSED

Archivos declarados, verificados en disco:

- `lib/data/historial.ts` — presente (305 líneas)
- `lib/data/historial.test.ts` — presente (392 líneas)
- `lib/data/historial.integration.test.ts` — presente (311 líneas)
- `app/(admin)/apartamentos/_components/HistorialApartamento.tsx` — presente (294 líneas)
- `app/(admin)/apartamentos/_components/HistorialApartamento.test.ts` — presente (57 líneas)
- `app/(admin)/apartamentos/[id]/page.tsx` — presente (128 líneas)

Commits declarados, verificados en `git log`:

- `63d30fb` — presente
- `1170d22` — presente
- `d0ac0c7` — presente

`git status --short` no reporta ningún archivo del plan sin comprometer. La única entrada pendiente del árbol es `ci/README.md`, sin seguimiento y anterior a este plan.

---
*Phase: 04-dashboard-operativo-del-admin*
*Completed: 2026-09-06*
