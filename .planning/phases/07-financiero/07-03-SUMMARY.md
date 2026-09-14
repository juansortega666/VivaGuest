---
phase: 07-financiero
plan: 03
subsystem: testing
tags: [playwright, e2e, supabase, finanzas, frontera-del-aseador, rsc]

requires:
  - phase: 04-dashboard-operativo-del-admin
    provides: el molde de spec de admin, `sembrarOperacion` y la tabla del día que esta fase tiene que dejar quieta
  - phase: 06-pwa-del-aseador
    provides: el árbol `(cleaner)`, sus fixtures de sesión y la escala móvil
provides:
  - "22 casos de Playwright contra las cinco superficies financieras, escritos antes de que existan"
  - "`sembrarFinanzas()` / `limpiarFinanzas()`: dos periodos cerrados, uno en curso, un pago pagado y otro pendiente"
  - "La aserción de la frontera del aseador medida sobre la carga útil de la red, con su control de método"
  - "Instantes explícitos en `AseoASembrar`, que es lo que permite sembrar un aseo en un periodo pasado"
affects: [07-04, 07-07, 07-09, 07-10, 07-11, 07-12, 07-13, 07-14]

tech-stack:
  added: []
  patterns:
    - "Aserción sobre la carga útil de red, no sobre el DOM, para una regla de no-divulgación"
    - "Control del método dentro de la propia aserción negativa: una cifra permitida tiene que aparecer, o no se miró nada"
    - "Cifras de siembra no redondas, para que la búsqueda por subcadena no dé falsos positivos"
    - "Cliente de Supabase sin genérico como puente hacia objetos que todavía no están en los tipos generados"

key-files:
  created:
    - e2e/finanzas.spec.ts
    - e2e/mis-pagos.spec.ts
    - .planning/phases/07-financiero/deferred-items.md
  modified:
    - e2e/fixtures.ts

key-decisions:
  - "El cierre se siembra invocando `cerrar_periodo` con una SESIÓN DE ADMIN REAL, no escribiendo el snapshot a mano con la clave de servicio: un periodo cerrado que la función nunca produjo haría que las specs afirmaran sobre datos que el sistema no sabe generar"
  - "Las dos aseadoras del escenario son los usuarios de `global-setup`, no usuarios nuevos: un pago de alguien sin sesión persistida obligaría a hacer login por UI, contra la regla de la suite"
  - "Los límites de periodo salen de `periodo_de_cierre()` en la base y no de un gemelo TypeScript: duplicar el calendario de cierre en el fixture sería una segunda implementación que se desincroniza el primer mes que caiga en sábado"
  - "El rótulo de periodo se afirma por sus componentes (preposición, dos días, mes) y no reconstruyendo la cadena: el formateador lo trae 07-06 y duplicarlo aquí sería escribir la lógica que la aserción dice verificar"
  - "El valor de un KPI se lee subiendo por el árbol desde su etiqueta, no por un rol accesible: el contrato de diseño no le asigna ninguno a esa card, y exigirlo sería inventar contrato que 07-10 no tiene por qué haber leído"

patterns-established:
  - "Toda aserción de no-divulgación lleva su control: si ninguna carga trae un dato permitido, el interceptor no miró nada y la ausencia del prohibido no prueba nada"
  - "Un `getByRole` sobre una tabla dentro de un bloque colapsado devuelve cero: `hidden` la saca del árbol de accesibilidad. Se abre el bloque y se espera con `toBeVisible()` antes de leer"

requirements-completed: [FIN-02, FIN-03, FIN-04]

coverage:
  - id: D1
    description: "Las cinco superficies nuevas tienen su spec escrita antes de existir, con el copy exacto del contrato de diseño"
    requirement: "FIN-02"
    verification:
      - kind: e2e
        ref: "e2e/finanzas.spec.ts + e2e/mis-pagos.spec.ts — 22 casos listados con `playwright test --list`"
        status: pass
    human_judgment: false
  - id: D2
    description: "La pestaña de finanzas está en la navegación y la pantalla de operación NO cambió, y las dos cosas se afirman en el mismo caso"
    requirement: "FIN-02"
    verification:
      - kind: e2e
        ref: "e2e/finanzas.spec.ts#la barra superior gana un cuarto link, va último, y la pantalla de operación NO cambió"
        status: fail
    human_judgment: false
    rationale: "Rojo deliberado: `/finanzas` no existe hasta 07-10. La mitad de operación sí se verificó contra la pantalla real durante la ejecución."
  - id: D3
    description: "El desglose muestra SIEMPRE las dos fechas, programada y de ejecución, también cuando coinciden"
    requirement: "FIN-04"
    verification:
      - kind: e2e
        ref: "e2e/finanzas.spec.ts#el desglose muestra las dos fechas de cada aseo, también cuando coinciden, y no lleva ninguna cifra de huésped"
        status: fail
      - kind: e2e
        ref: "e2e/mis-pagos.spec.ts#el desglose tiene sus dos secciones con el vocabulario del aseador, las dos fechas por aseo, y su total"
        status: fail
    human_judgment: false
    rationale: "Rojo deliberado hasta 07-12 y 07-13."
  - id: D4
    description: "El aseador ve sus periodos cerrados y ninguna cifra de huésped, comprobado sobre lo que llega al navegador y no solo sobre lo que se pinta"
    requirement: "FIN-04"
    verification:
      - kind: e2e
        ref: "e2e/mis-pagos.spec.ts#ninguna cifra de huésped ni ningún margen llega al navegador del aseador, en ninguna de sus dos pantallas"
        status: fail
    human_judgment: false
    rationale: "Rojo deliberado hasta 07-13. Es la aserción que cierra el criterio 5 de la DEFINICION."
  - id: D5
    description: "El sembrador de periodo cerrado compila y deja el escenario reproducible con su limpieza"
    requirement: "FIN-03"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (cero errores bajo e2e/)"
        status: pass
    human_judgment: false
  - id: D6
    description: "La línea base de 112 specs sigue en verde con su 1 saltado"
    verification:
      - kind: e2e
        ref: "PLAYWRIGHT_PORT=3200 NEXT_PUBLIC_VIVAGUEST_FEED_LOCAL=1 npx playwright test"
        status: pass
    human_judgment: false

duration: 68min
completed: 2026-09-13
status: complete
---

# Fase 7 Plan 03: Specs E2E de las cinco superficies financieras, en rojo

**Las cinco pantallas de la fase tienen su comportamiento escrito y ejecutable antes de existir, con el copy que el dueño aprobó, y la frontera del aseador queda medida sobre lo que viaja por la red en vez de sobre lo que se pinta.**

## Performance

- **Duration:** 68 min
- **Started:** 2026-09-13T12:52:00Z
- **Completed:** 2026-09-13T14:00:00Z
- **Tasks:** 2 de 2
- **Files modified:** 5 (2 modificados, 3 creados)

## Accomplishments

- **22 casos** de Playwright contra `/finanzas`, `/finanzas/aseos`, `/finanzas/aseadoras/[id]`, `/finanzas/pagos` y `(cleaner)/mis-pagos`, todos rojos a propósito. El plan pedía 18.
- **La aserción de la frontera se hace sobre la carga útil de la red.** Se interceptan las respuestas de documento, de carga de servidor de React y de JSON, y se afirma que ninguna contiene la tarifa sembrada ni el margen. Hoy el sistema tiene la fuga abierta y ninguna pantalla la muestra: un test sobre el DOM pasaría con la fuga puesta.
- **Esa aserción lleva su propio control de método**, que es lo que la separa de un verde vacío: si ninguna carga trae una cifra que el aseador SÍ puede ver, el interceptor no miró nada, y la ausencia de las prohibidas no probaría nada. El control falla antes que la aserción.
- **D7-1 se afirma con sus dos lados en el mismo caso:** el cuarto link va último Y la tabla del día de `/operacion` conserva exactamente sus seis encabezados sin una sola cifra de pesos. Esta mitad sí se verificó contra la pantalla real: los encabezados medidos son `Estado · Apartamento · Hora límite · A cargo · Huéspedes · Acciones`, y la tabla no contiene ningún `$`.
- **La línea de las dos fechas se afirma también sobre un aseo cuyas dos fechas coinciden**, que es el caso que tienta a abreviar. Si solo apareciera en los casos raros, dejaría de ser información y pasaría a ser una señal de alarma.
- **`sembrarFinanzas()`** deja dos periodos cerrados y uno en curso, con un pago pagado y otro pendiente, invocando el cierre por el camino real.
- **Línea base intacta:** 112 pasando, 1 saltado.

## Task Commits

1. **Task 1: Sembrador de periodo cerrado para E2E** — `55af3f1` (test)
2. **Task 2: `finanzas.spec.ts` y `mis-pagos.spec.ts`, en rojo** — `590025d` (test)
3. **Task 2 (continuación): los ids de los tres pagos en el escenario** — `ccc9bed` (test)

**Metadata del plan:** `7291031` (docs)

_Nota: `ccc9bed` es la extensión de `EscenarioFinanciero` que `mis-pagos.spec.ts`
consume. Se quedó fuera de `590025d` por un descuido al preparar el índice, y se
commiteó aparte en vez de enmendar: la historia de lo que pasó de verdad vale más
que una historia limpia._

## Files Created/Modified

- `e2e/fixtures.ts` — `sembrarFinanzas()` / `limpiarFinanzas()`, las cifras del escenario, el cliente sin tipar hacia los objetos de 07-04/07-07/07-09, y tres campos opcionales en `AseoASembrar` para sembrar instantes históricos.
- `e2e/finanzas.spec.ts` — 15 casos: las cuatro pantallas del admin, D7-1 con sus dos mitades, la conciliación del pie contra los KPIs, FIN-05 en pantalla, el vacío de pagos y el aislamiento por rol (T-07-09).
- `e2e/mis-pagos.spec.ts` — 7 casos: la entrada, la lista, la ausencia del periodo en curso, el pago ajeno por dirección directa (T-07-10), **la frontera sobre la red**, el desglose con el vocabulario del aseador, y su vacío.
- `.planning/phases/07-financiero/deferred-items.md` — el flake de `push-instalacion.spec.ts`, con las cuatro corridas que lo caracterizan.

## Decisions Made

**1. El cierre se siembra con una sesión de admin real, no escribiendo el snapshot a mano.**
`cerrar_periodo` es `security definer` con guarda de admin, y la clave de servicio no tiene `auth.uid()`, así que la guarda la rechaza. La salida fácil era insertar las filas del snapshot con el cliente de servicio. Se descartó: sembraría un periodo cerrado que la función de cierre nunca produjo, y las specs afirmarían sobre datos que el sistema no sabe generar. El fixture abre sesión con las credenciales del admin de la corrida.

**2. Las dos aseadoras son los usuarios de `global-setup`.**
`mis-pagos.spec.ts` abre sesión como `aseador1`; un pago de una aseadora recién creada no aparecería en ninguna pantalla y el fallo apuntaría a la consulta. Además, un usuario nuevo no tiene sesión persistida y obligaría a hacer login por UI, contra la regla de la cabecera de `fixtures.ts`.

**3. Las cifras del escenario no son redondas, y es una decisión de método.**
`137731`, `41117`, `152909`, `48211`, `33517`. Con una tarifa de `120000`, la búsqueda por subcadena dentro del cuerpo de las respuestas daría positivos por accidente (un `Content-Length`, un tamaño de bundle). Con estas, un acierto solo puede venir del dato. Se buscan también los márgenes (`96614`, `104698`): una pantalla que no mande la tarifa pero sí la resta rompe la frontera igual.

**4. Los límites de periodo salen de la base.**
`periodo_de_cierre()` en vez de un gemelo TypeScript. El calendario de cierre no es "el último día del mes" sino el último día hábil; duplicarlo en el fixture sería una segunda implementación que se desincroniza el primer mes que caiga en sábado.

**5. El rótulo de periodo se afirma por componentes, no por cadena literal.**
`etiquetaDePeriodo` la trae el plan 07-06. Reconstruirla aquí sería escribir por segunda vez la lógica que la aserción dice verificar. Se afirma lo que el contrato promete: la preposición `Del`, los dos números de día y el nombre del mes del cierre.

**6. El valor de un KPI se lee subiendo por el árbol desde su etiqueta.**
`07-UI-SPEC.md` §13.1 le asigna roles accesibles a las tablas, al filtro y al sub-nav, pero no a la card del KPI. Exigir uno aquí sería inventar contrato: la spec pediría algo que 07-10 no tiene por qué haber leído, y el rojo no diría nada del producto. El helper hace lo que hace una persona: busca la etiqueta y lee la cifra que está con ella.

## Deviations from Plan

### Ajustes automáticos

**1. [Regla 2 - Funcionalidad crítica faltante] `AseoASembrar` no sabía sembrar un aseo histórico**

- **Encontrado durante:** Task 1
- **Problema:** `construirAseo()` calcula `confirmado_at`, `started_at` y `finished_at` como "hace cuatro / dos / una hora". La pertenencia de un aseo a un periodo de pago se decide por su hora de ejecución convertida a día de Bogotá (D7-5), así que **los cuatro aseos del periodo cerrado habrían caído en el periodo EN CURSO** y el cierre habría salido vacío. El escenario entero era imposible de sembrar.
- **Arreglo:** tres campos opcionales (`confirmadoEn`, `iniciadoEn`, `terminadoEn`) que pisan los defaults. Se pasan como texto ISO con desfase explícito `-05:00`, porque un `YYYY-MM-DD` a secas se parsea como medianoche UTC y en Bogotá cae el día anterior.
- **Archivos:** `e2e/fixtures.ts`
- **Verificación:** `npx tsc --noEmit` sin errores nuevos; los 112 existentes siguen pasando, que es lo que prueba que el default no cambió.
- **Commit:** `55af3f1`

**2. [Regla 1 - Defecto] La lista de encabezados de `/operacion` estaba incompleta y sin espera**

- **Encontrado durante:** Task 2, midiendo contra la pantalla real antes de dar el archivo por bueno
- **Problema:** dos cosas, y las dos habrían salido como un rojo falso en el plan 07-10.
  1. La aserción esperaba cinco encabezados. La tabla tiene **seis**: la columna del menú lleva un `sr-only` con `Acciones`, que el árbol de accesibilidad SÍ expone.
  2. `BloqueDia` es colapsable, y cerrado deja su contenido `hidden`, o sea fuera del árbol de accesibilidad: `getByRole('table')` devuelve **cero**. Además `count()` no espera, así que una lectura antes de la hidratación da una lista vacía aunque el bloque esté abierto. Medido: la misma sonda devolvió `0` tablas y, con el bloque abierto y una espera, `1` tabla con sus seis columnas.
- **Arreglo:** abrir el bloque de forma defensiva (mismo patrón que `abrirBloque()` de `operacion.spec.ts`), esperar con `toBeVisible()` antes de leer, y afirmar los seis encabezados. Las dos trampas quedan escritas en el propio caso.
- **Archivos:** `e2e/finanzas.spec.ts`
- **Commit:** `590025d`

**3. [Regla 3 - Alcance] Flake preexistente en `push-instalacion.spec.ts`, registrado y NO arreglado**

- **Encontrado durante:** Task 2, en la corrida de verificación
- **Problema:** `E1` y `E2` fallan de forma intermitente, uno distinto en cada corrida.
- **Por qué no se arregló:** está fuera del alcance de este plan y no lo causó. Ese archivo importa de `fixtures.ts` seis símbolos, ninguno de los cuales se tocó. Caracterizado en cuatro corridas y registrado en `deferred-items.md` con su detonante.

---

**Total de desviaciones:** 2 arregladas (1 de Regla 2, 1 de Regla 1) + 1 registrada como diferida.
**Impacto:** las dos correcciones eran necesarias para que el plan fuera ejecutable. Cero ampliación de alcance: no se tocó ni un archivo de `app/`, `lib/` o `supabase/`.

## Issues Encountered

**`npx tsc --noEmit` sale rojo en tres archivos que no son míos.** `lib/domain/mes.test.ts`, `lib/domain/periodo.test.ts` y `lib/domain/mes.integration.test.ts` importan módulos que trae el plan 07-06. Son del plan 07-02, compañero de wave, y su rojo es deliberado igual que el mío. **Bajo `e2e/` hay cero errores**, comprobado con `npx tsc --noEmit | grep "^e2e/"`. `npm run build` pasa: Next no type-chequea los archivos de test.

## Cuántos specs quedaron rojos, y qué plan pone cada uno en verde

Es lo que el contexto de ejecución pidió que quedara escrito aquí.

| Archivo | Casos | Estado hoy | Lo pone en verde |
|---|---:|---|---|
| `e2e/finanzas.spec.ts` — barra, Resumen, filtro, bloque 2 | 6 | rojo | **07-10** |
| `e2e/finanzas.spec.ts` — detalle y ficha de aseadora | 4 | rojo | **07-11** |
| `e2e/finanzas.spec.ts` — Pagos, desglose, marcar pagado, vacío | 4 | rojo | **07-12** |
| `e2e/finanzas.spec.ts` — aislamiento por rol (T-07-09) | 1 | rojo | **07-10** (la ruta tiene que existir para poder rebotar) |
| `e2e/mis-pagos.spec.ts` — las siete del árbol del aseador | 7 | rojo | **07-13** |
| **Total** | **22** | | |

**Y una dependencia que va antes que todas:** los 21 casos que siembran escenario dependen de `periodo_de_cierre` (**07-04**), `cerrar_periodo` (**07-07**) y `marcar_pago_pagado` (**07-09**). Hasta que esos tres existan, el rojo es del `beforeAll` y Playwright reporta el resto como "did not run". **No es el rojo útil**: el rojo útil, el que dice qué le falta a una pantalla, empieza a aparecer después del 07-09.

## Nota para quien ejecute 07-10 a 07-13

Tres acoplamientos de este archivo con planes posteriores, todos en un solo sitio cada uno:

1. **Nombres de argumento de las RPC.** `periodo_de_cierre(p_dia)`, `cerrar_periodo(p_desde, p_hasta)`, `marcar_pago_pagado(p_pago)`. Si 07-04/07-07/07-09 los llaman distinto, se cambia en `e2e/fixtures.ts` y en ningún otro sitio.
2. **Columnas leídas de `cleaner_payouts`:** solo `id`, `aseador_id` y `periodo_desde`. Nada más.
3. **`clienteSinTipar()` desaparece cuando 07-04 regenere `lib/database.types.ts`.** No se editó ese archivo a mano a propósito: la puerta `db:types:check` de CI compara la generación contra el disco y editarlo la pondría en rojo hasta que exista la migración.

## User Setup Required

Ninguno.

## Next Phase Readiness

Wave 0 cerrada por este lado. Los planes 07-04 a 07-09 pueden construir el schema sabiendo exactamente qué firmas y qué copy tienen que satisfacer; los 07-10 a 07-13 tienen su contrato de comportamiento escrito y ejecutable.

**Condición de entorno que hay que repetir en cada corrida, y está medida:** `PLAYWRIGHT_PORT` en un puerto libre y `npm run db:reset` antes. Contra la aplicación equivocada, **toda aserción negativa de `mis-pagos.spec.ts` pasa trivialmente** —una pantalla que no existe tampoco filtra nada—, que es el peor verde posible sobre la garantía más importante de la fase.

---

*Fase: 07-financiero*
*Completado: 2026-09-13*

## Self-Check: PASSED

Comprobado el 2026-09-13 contra el disco y contra `git log`:

- Los cinco archivos declarados existen.
- Los cuatro commits (`55af3f1`, `590025d`, `ccc9bed`, `7291031`) están en la historia.
- Los conteos por archivo son los que dice la tabla: 15 casos en `finanzas.spec.ts` y 7 en `mis-pagos.spec.ts`, 22 en total.
- `npx tsc --noEmit | grep "^e2e/"` devuelve cero líneas.
