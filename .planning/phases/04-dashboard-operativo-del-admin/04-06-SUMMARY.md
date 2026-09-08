---
phase: 04-dashboard-operativo-del-admin
plan: 06
subsystem: api
tags: [postgrest, supabase, typescript, rls, vitest, embeds, timezone]

# Dependency graph
requires:
  - phase: 01-fundaci-n-schema-y-rls
    provides: "cleanings, properties, profiles, notifications, calendar_feeds con sus policies y los indices cleanings_agenda_idx, cleanings_unconfirmed_idx y notifications_inbox_idx"
  - phase: 03-motor-de-sincronizaci-n-ical
    provides: "calendar_feeds.last_success_at y lib/domain/salud-sync.ts con el umbral de tres horas"
  - phase: 04-dashboard-operativo-del-admin
    provides: "04-01 dejo lib/test/aseos.ts, el arnes de siembra con los once objetos del escenario; 04-05 dejo lib/database.types.ts regenerado desde la base viva"
provides:
  - "lib/data/operacion.ts: leerOperacion() con los dos embeds calificados por nombre de clave foranea y un unico instante de lectura"
  - "Las tres proyecciones puras: agruparPorDia(), bandejaSinConfirmar() y cargaPorAseador()"
  - "Las tres consultas auxiliares: leerAlertasDelAdmin(), leerUltimoExitoDeSync() y leerAseadoresActivos()"
  - "HORIZONTE_DIAS = 6 como constante exportada, y SIN_ASIGNAR como etiqueta del chip huerfano"
  - "operacion.integration.test.ts: el contrato medido contra PostgREST real, con JWT de admin y de aseadora"
affects: [04-07, 04-08, 04-09, 04-10, 04-11, 04-12, 04-13, 05-notificaciones]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Una sola consulta con embeds alimenta las tres superficies; las proyecciones son funciones puras exportadas aparte y ahi viven los unitarios"
    - "Todo embed hacia una tabla con mas de una clave foranea va calificado por nombre de FK, y hay un test de integracion que lo demuestra"
    - "El instante de lectura entra por parametro y viaja en el resultado: una sola marca de tiempo para toda la pantalla (D-14)"
    - "Toda comparacion de dias de negocio se hace sobre cadenas 'YYYY-MM-DD'; el limite inferior sale de hoyBog(), nunca de la fecha del proceso"
    - "nullsFirst: false en todo order descendente sobre una columna anulable que se use como max()"

key-files:
  created:
    - lib/data/operacion.ts
    - lib/data/operacion.test.ts
    - lib/data/operacion.integration.test.ts
  modified: []

key-decisions:
  - "Los cancelados SE traen y se filtran en memoria: la cabecera del dia lleva el toggle 'Ver cancelados (N)' y sin el conteo haria falta un segundo viaje"
  - "El bloque Siguientes emite SIEMPRE sus cinco grupos, vacios incluidos, porque UI-SPEC §8.1 pinta la cabecera con '0 aseos': que un dia no tenga nada es informacion"
  - "cargaPorAseador incluye a un aseador DESACTIVADO que tenga trabajo de hoy, con el nombre del embed: omitirlo descuadraria la suma de los chips y esconderia justo el trabajo que hay que reasignar"
  - "leerAseadoresActivos NO reutiliza listarAseadoresActivos de apartamentos.ts pese al nombre: esa devuelve activos E inactivos a proposito, y aqui la pregunta es a quien se le puede asignar trabajo hoy"
  - "leerAlertasDelAdmin filtra por recipient_id aunque la policy ya acote a auth.uid(): la policy decide que filas son visibles, el filtro decide que indice se usa"

patterns-established:
  - "Cliente falso thenable en el unitario para medir el CONTRATO de la llamada (tabla, columnas, limites de fecha) sin base, dejando el PGRST201 para el de integracion"
  - "Todo señuelo declarado en el plan se corre de verdad y se anota su fallo literal en el SUMMARY"

requirements-completed: []

# Metrics
duration: 158min
completed: 2026-09-06
---

# Phase 04 Plan 06: La capa de lectura de la pantalla de operación

**Una sola consulta a `cleanings` con los dos embeds calificados por nombre de clave foránea alimenta el carril ancho, la bandeja y los chips de carga con un único instante de lectura, más las tres consultas auxiliares del panel de alertas; 21 unitarios y 10 de integración contra Postgres real, con los tres señuelos del plan corridos y rojos.**

## Performance

- **Duration:** ~158 min (de los cuales cerca de 100 los consumió el I/O de iCloud: ver "Issues Encountered")
- **Started:** 2026-09-06T13:31:13Z
- **Completed:** 2026-09-06T16:08:54Z
- **Tasks:** 2 de 2
- **Files modified:** 3 (los 3 creados, 1 551 líneas)

## Accomplishments

- **Una sola ida a la base para las tres superficies.** `leerOperacion()` devuelve las filas crudas más `hoy`, `horizonte` y `leidoEnMs`. Las tres proyecciones (`agruparPorDia`, `bandejaSinConfirmar`, `cargaPorAseador`) son funciones puras sobre ese mismo conjunto, así que la cabecera tiene UNA marca de tiempo que mostrar y no tres (D-14).
- **El embed calificado por FK está medido contra PostgREST real, no razonado.** El test de integración emite la consulta con el JWT de un admin y afirma que `property` y `aseador` vienen resueltos. Si el embed fuera `profiles(...)` sin calificar, `leerOperacion` habría lanzado con `PGRST201` y ninguna de las cinco aserciones de ese bloque se alcanzaría. Es exactamente el fallo que `tsc` no ve: `database.types.ts` tipa el embed pero no valida la ambigüedad.
- **La RLS del embed también quedó ejercitada (T-04-13).** Con el JWT de la aseadora A, la misma función devuelve exactamente sus dos aseos de la ventana (`cleanings_cleaner_select`), su propio perfil resuelto (`profiles_own_select`) y el apartamento donde tiene trabajo vivo (`properties_cleaner_select`). El admin, en el control de la misma aserción, sí ve la fila inerte y la sin confirmar.
- **Las filas de gestión externa llegan en el mismo conjunto (DASH-07), sin consulta aparte:** `is_managed = false`, `state` nulo, `aseador` nulo y `property.contacto_externo` poblado.
- **Los tres señuelos del plan se corrieron y salieron rojos**, con el fallo literal anotado abajo.
- **La suite completa subió sin mover ninguna cifra heredada:** unitarios 481 → 502 (27 → 28 archivos), integración 115 → 125 (12 → 13 archivos), pgTAP intacto en `Files=7, Tests=153, Result: PASS`.

## Task Commits

1. **Task 1 (RED): las tres proyecciones en rojo** - `b205572` (test)
2. **Task 1 (GREEN): la consulta única y sus tres proyecciones** - `0e3b31d` (feat)
3. **Task 2 (RED): el contrato contra Postgres real en rojo** - `8a4bea7` (test)
4. **Task 2 (GREEN): las tres consultas auxiliares** - `e81546d` (feat)

## Files Created/Modified

- `lib/data/operacion.ts` (590 líneas) — La consulta única, las tres proyecciones puras y las tres consultas auxiliares. El cliente entra por parámetro, no se construye ninguno, y no hay una sola referencia a la fábrica administrativa (T-04-06).
- `lib/data/operacion.test.ts` (521 líneas) — 21 unitarios sobre objetos armados a mano, más un cliente falso *thenable* que mide el contrato de la llamada (tabla, `select`, límites de fecha, orden).
- `lib/data/operacion.integration.test.ts` (440 líneas) — 10 aserciones contra el stack local con JWT reales de un admin y de una aseadora.

## Los tres señuelos, corridos

| Señuelo | Mutación | Fallo medido |
| --- | --- | --- |
| Día de negocio | `hoyBog()` → `new Date().toISOString().slice(0,10)` | `AssertionError: expected '2026-09-11' to be '2026-09-10'` — con el reloj en `2026-09-11T01:00:00Z` (20:00 del 10 en Bogotá) la ventana empezaba MAÑANA |
| Filtro de estado vivo | `if (state === null \|\| !ESTADOS_VIVOS.has(state))` → `if (state === null)` | 2 tests rojos; `AssertionError: expected 4 to be 3` — el cancelado y el terminado inflaban el conteo del chip |
| `nullsFirst` | `.order('last_success_at', { ascending: false, nullsFirst: false })` → sin `nullsFirst` | 2 tests rojos; `AssertionError: expected null not to be null` — con un feed recién conectado al lado de uno sano, la función devolvía `null` y `estadoDeSincronizacion` diría `'caida'` con el sistema sano |

Los tres se revirtieron y la suite volvió a verde antes de cada commit.

## Verificación medida

| Comando | Resultado |
| --- | --- |
| `npm run test:unit` | 28 archivos, **502 tests**, todos verdes (baseline heredada: 27 / 481) |
| `npm run test:integration` | 13 archivos, **125 tests**, todos verdes (baseline heredada: 12 / 115) |
| `npm run db:test` | `Files=7, Tests=153` — `Result: PASS` (sin cambio: este plan no toca SQL) |
| `npx tsc --noEmit` | Sin salida |
| `npm run ci:arch` | `check-service-role: OK` |
| `npm run lint` | Sin hallazgos, exit 0 |

Aritmética de los tests nuevos, como pide la disciplina de la fase: **+21 unitarios** (`operacion.test.ts`) y **+10 de integración** (`operacion.integration.test.ts`). 481 + 21 = 502 y 115 + 10 = 125. Cuadra exacto.

## Decisions Made

1. **`cargaPorAseador` incluye a un aseador desactivado que tenga trabajo de hoy.** No estaba en la lista literal de comportamientos del plan y se añadió como requisito de corrección (Regla 2): sin él, la suma de los chips no cuadraría con el número de filas contadas del día y el trabajo de esa persona desaparecería de la vista justo en el momento en que hay que reasignarlo. El nombre sale del embed; si la RLS no dejó resolverlo, se usa el id crudo antes que inventar un `Desconocido` que escondería el hecho. Hay un unitario que fija cada mitad de la regla.
2. **El horizonte es `hoy + 6` y lo que queda más lejos se cuenta, no se agrupa.** `agruparPorDia` devuelve `ultimoDiaDelHorizonte` y `masAllaDelHorizonte`, que es exactamente lo que la línea `Hay N aseos programados después del {fecha}` de UI-SPEC §8.1 necesita. La recomendación de `04-RESEARCH` era D+14; el plan la fijó en D+6 con el argumento de que cinco días es el horizonte con el que se decide un suplente, y se ejecutó así.
3. **`sumarDias` se implementó local y privado en `operacion.ts`** en vez de importar la copia de `lib/test/aseos.ts`. Ese archivo es del arnés de pruebas, importa la fábrica administrativa sin guard y nada bajo `app/` puede arrastrarlo al bundle. Son cuatro líneas de aritmética de calendario anclada en `Date.UTC`, sin ninguna zona horaria implicada.
4. **`SELECT_OPERACION` se dejó como literal de plantilla, no anotado como `string`.** Durante el desarrollo se probó anotarlo `: string` (lo que apaga el analizador de tipos del `select` de supabase-js) creyendo que era la causa de un `tsc` lentísimo. No lo era: el problema era I/O de iCloud, medido abajo. Se revirtió, y así el analizador sigue validando el nombre de la clave foránea contra el bloque `Relationships` en tiempo de compilación.

## Deviations from Plan

Ninguna desviación de contenido: las dos tareas se ejecutaron como estaban escritas, con el añadido de corrección de la decisión 1 (Regla 2, documentado arriba y cubierto por un test).

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Archivos duplicados de iCloud en `.next/types/` rompían `npx tsc --noEmit`**

- **Found during:** Verificación de la Task 1
- **Issue:** `npx tsc --noEmit` devolvía **11 errores**, todos en `.next/types/cache-life.d 2.ts` (7 × TS2300 `Duplicate identifier`) y `.next/types/routes.d 2.ts` (TS2428, TS2717, TS2536, TS2300). Cero venían del código de este plan. Son los duplicados con sufijo numérico que produce iCloud Drive, el mismo síntoma que ya está registrado como `vivaguest-icloud-rompe-node-modules`, esta vez dentro de la salida de build en vez de en `node_modules`.
- **Fix:** Los cuatro artefactos duplicados (`cache-life.d 2.ts`, `routes.d 2.ts`, `package 2.json`, `validator 2.ts`) se **apartaron** al scratchpad de la sesión, no se borraron. `.next/` está en `.gitignore` (verificado con `git check-ignore -v`) y `next build` lo regenera, así que ningún archivo versionado se tocó. También se retiró el directorio vacío `.next/types/app 3`.
- **Files modified:** Ninguno del proyecto. Nada versionado.
- **Verification:** `npx tsc --noEmit` pasó de 11 errores a salida vacía, y el tiempo cayó de 6 min 39 s a 3 s con las cachés calientes.
- **Committed in:** No aplica (artefactos de build, ignorados por git).

---

**Total deviations:** 1 auto-corregida (Regla 3, de entorno) + 1 añadido de corrección (Regla 2, en el código y con test).
**Impact on plan:** Cero sobre el alcance. Los tres archivos del plan son exactamente los tres declarados en `files_modified`.

## Requisitos: por qué la lista va vacía

El plan declara `requirements: [ASEO-01, DASH-01, DASH-02, DASH-03, DASH-04, DASH-07]` y **ninguno se marcó como completo**. Los seis están redactados como hechos observables por el admin ("Admin ve los servicios organizados por día", "Admin ve una bandeja persistente…"), y este plan entrega la capa de lectura: no hay una sola pantalla que renderice nada todavía.

Marcarlos aquí reportaría como cumplido algo que el admin no puede ver, que es justo la clase de mentira silenciosa que el criterio de frescura de esta fase existe para evitar. **Los cierran los planes de UI de la fase**, que consumen este módulo. Lo que sí queda entregado y medido es el contrato de datos de los seis.

## Issues Encountered

- **El I/O de iCloud domina el reloj de este plan, y no es una impresión: está medido.** `npx tsc --noEmit` en frío tardó **6 min 39 s de reloj consumiendo 6 s de CPU** (1 % de utilización); una corrida anterior llevaba 10 min con 4 s de CPU acumulados. `eslint` llegó a estar **53 minutos con 4,4 s de CPU**. La primera corrida de la suite de integración tardó 223 s, de los cuales 221 fueron `import`. **Con las cachés calientes las mismas órdenes bajan a 3 s (`tsc`), 1,2 s (integración) y 4,3 s (el unitario del plan).** Es el mismo terreno que documentó el plan 04-05 con el `git reset` del worktree, visto ahora desde las herramientas de build.
  - **Recomendación operativa para los planes siguientes:** correr `npx tsc --noEmit` UNA vez al empezar, en frío y sin esperar nada de él, para que la caché quede caliente antes de que su tiempo cuente contra una tarea. Y no interpretar un proceso a 0 % de CPU como colgado: mirar el tiempo de CPU acumulado con `ps -o time` antes de matarlo.
- **El stack de Supabase estaba completo y sano** (12 contenedores arriba), así que la trampa de `deferred-items.md` (arrancar solo Postgres y que la siembra falle con `name resolution failed`) no se materializó. No hizo falta `npx supabase stop && npx supabase start`.
- **La base local estaba limpia al empezar:** 0 aseos, 0 feeds, 0 notificaciones, con los 39 apartamentos de la semilla, 2 aseadoras y 1 admin. Eso permitió que el test de `leerUltimoExitoDeSync` afirmara el caso `null` con un control de entorno explícito delante (cero feeds activos con éxito previo) en vez de con una comparación relativa que habría pasado por casualidad.
- **Un detalle del arnés que costará descubrir a quien venga:** `sembrarEscenarioDeAseos()` genera la contraseña de las aseadoras al azar y no la devuelve. Para conseguir un JWT de aseadora hay que fijarle una con `auth.admin.updateUserById` antes de `signInWithPassword`. Queda escrito en el `beforeAll` del archivo.

## Known Stubs

Ninguno. Las nueve funciones exportadas leen datos reales y ninguna devuelve un valor fijo, un array vacío codificado ni un placeholder.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Listo para toda la UI de la fase. Lo que cada consumidor debe saber:

- **04-10 / 04-11 / 04-12 (el carril ancho, la bandeja y los chips):** todo sale de `leerOperacion()` + las tres proyecciones. La cabecera de frescura usa `leidoEnMs`, que es la marca ÚNICA; no se debe llamar a `Date.now()` en el render de cada superficie o vuelven los tres instantes que D-14 prohíbe.
- **El panel de alertas (04-11):** `leerAlertasDelAdmin()` entrega las de `notifications`. Las **tres alertas computadas** de UI-SPEC §11.2 (urgente, hora límite vencida y calendario caído) NO salen de aquí: se derivan de las filas de `leerOperacion()` y de `estadoDeSincronizacion(leerUltimoExitoDeSync(...), Date.now())`. Ese ensamblaje sigue pendiente y es de un plan de UI.
- **Dos hechos que van a llegar como reporte de bug y ya están escritos en el código:** el toggle `Ver atendidas` cae fuera de `notifications_inbox_idx` y hace seq scan (irrelevante con un admin); y cinco de las once notificaciones del sistema se insertan **una vez por admin activo**, así que marcar una como atendida no la marca para los demás. Correcto por diseño: `read_at` es por destinatario.
- **`cleanings_agenda_idx` es parcial (`where is_managed`)** y no cubre las filas de gestión externa que DASH-07 sí muestra. Con 34+5 unidades es irrelevante, pero no se puede afirmar que la consulta usa el índice, y el comentario del módulo lo dice para que nadie lo asuma en una revisión futura.

Sin bloqueos abiertos por este plan.

## Self-Check: PASSED

Archivos declarados, verificados en disco:

- `lib/data/operacion.ts` — presente (590 líneas)
- `lib/data/operacion.test.ts` — presente (521 líneas)
- `lib/data/operacion.integration.test.ts` — presente (440 líneas)

Commits declarados, verificados en `git log`:

- `b205572` — presente
- `0e3b31d` — presente
- `8a4bea7` — presente
- `e81546d` — presente

`git status --short` no reporta ningún archivo del plan sin comprometer. La única entrada pendiente del árbol es `ci/README.md`, sin seguimiento y anterior a este plan.

---
*Phase: 04-dashboard-operativo-del-admin*
*Completed: 2026-09-06*
