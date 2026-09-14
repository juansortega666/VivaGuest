---
phase: 07-financiero
plan: 14
subsystem: testing
tags: [pgtap, playwright, vitest, postgres, concurrencia, senuelos, nextjs, app-router]

requires:
  - phase: 07-financiero
    provides: "Las tres migraciones de la fase (23, 24, 25), las seis lecturas del admin (26), las dos del aseador (27) y las cuatro pantallas"
provides:
  - "La bitácora de los seis señuelos, corridos en los dos sentidos, en la cabecera de 11_financiero.test.sql"
  - "Bloque N de 11_financiero.test.sql: FIN-05 medido con el CHECK de inercia apagado dentro de la transacción del test"
  - "Bloque O de 11_financiero.test.sql: la idempotencia del cierre afirmada por su SQLSTATE y su valor de retorno, no solo por el estado"
  - "lib/domain/cierre-concurrente.integration.test.ts: la garantía de no pagar dos veces, medida con dos conexiones simultáneas de verdad"
  - "e2e/fixtures.ts: esperarControlHidratado, esperarUrlDeCliente y pulsarHastaNavegar, con su medición escrita"
  - "La causa del cuelgue del filtro de periodo, aislada con ocho corridas"
  - "Las consecuencias de la Fase 7 para la Fase 9, escritas en .planning/STATE.md"
affects: [fase-08-piloto, fase-09-retencion-y-purga, finanzas, purga, retencion]

tech-stack:
  added: []
  patterns:
    - "Señuelo con la primera capa apagada: cuando dos capas sostienen la misma garantía, se apaga la de fuera DENTRO de la transacción del test para poder medir la de dentro"
    - "Concurrencia real desde vitest: dos procesos psql por docker exec contra el contenedor del stack local, sincronizados con pg_sleep_until"
    - "Prueba de concurrencia que EXIGE solape medido, no que lo supone"
    - "Espera de navegación de cliente sondeada desde Node, nunca desde dentro del documento"

key-files:
  created:
    - "lib/domain/cierre-concurrente.integration.test.ts"
  modified:
    - "supabase/tests/11_financiero.test.sql"
    - "e2e/fixtures.ts"
    - "e2e/finanzas.spec.ts"
    - ".planning/STATE.md"
    - ".planning/phases/07-financiero/deferred-items.md"

key-decisions:
  - "Dos de los cinco señuelos declarados NO pusieron nada en rojo, y eso es el hallazgo del plan: FIN-05 la sostenía el CHECK cl_unmanaged_is_inert y la idempotencia el índice único, no los filtros que el señuelo ataca"
  - "La concurrencia del cierre se mide con dos procesos psql sincronizados por pg_sleep_until, no con dos llamadas en paralelo a PostgREST, y el test exige que los intervalos se solapen"
  - "El camino elegido para Task 1b es el test de integración y no un script de shell: un script suelto es un script que nadie vuelve a correr"
  - "page.waitForURL y expect(page).toHaveURL nunca ven el cambio de URL de FiltroPeriodo: su sondeo corre dentro del documento y se traba con el commit de la transición de React"
  - "Los dos rojos E2E que quedan son del producto y se dejan en rojo a propósito: app/(admin)/finanzas/loading.tsx cuelga el filtro de periodo, aislado con ocho corridas"
  - "No se arregla ese defecto desde este plan: afecta a cuatro rutas y es un cambio de estructura de carga de una sección que el dueño ya aceptó (regla 4)"

patterns-established:
  - "Bitácora de señuelos en la cabecera del archivo de pruebas, con qué se rompió y qué aserción concreta se puso roja"
  - "Un señuelo que no pone nada en rojo es un hallazgo, no un trámite fallido: se escribe la aserción que falta y se vuelve a correr"
  - "Toda espera de navegación de cliente en E2E se sondea desde Node"

requirements-completed: [FIN-02, FIN-03, FIN-04, FIN-05]

duration: 2h50m
completed: 2026-09-13
status: complete
---

# Fase 7 Plan 14: La puerta de la fase Summary

**Las seis garantías centrales de la fase están demostradas capaces de fallar, dos de ellas resultaron NO estar medidas y ahora lo están, la de «no pagar dos veces» se midió con dos conexiones simultáneas de verdad, y los dos rojos E2E que quedan son del producto y tienen la causa aislada con ocho corridas.**

## Performance

- **Duration:** 2h 50m
- **Started:** 2026-09-13T19:40:00Z
- **Completed:** 2026-09-14T02:30:00Z
- **Tasks:** 4 de 4
- **Files modified:** 6

## Accomplishments

- **Seis señuelos corridos en los dos sentidos, con doce reinicios de base.** Dos no pusieron nada en rojo, y de ahí salieron **siete aserciones nuevas** (bloques N y O) que cierran dos huecos de medición que llevaban toda la fase abiertos.
- **La garantía de no pagarle dos veces a una persona, medida bajo concurrencia real:** dos procesos `psql` independientes, sincronizados con `pg_sleep_until`, disparando el cierre del mismo periodo por las dos puertas (la del admin y la del job). El test exige que los intervalos se solapen.
- **Las cuatro suites por encima de su línea base**, con el puerto propio y la variable de feed local puestas, y los doce comandos de la puerta corridos.
- **Un defecto vivo del producto, con la causa aislada:** `app/(admin)/finanzas/loading.tsx` cuelga el filtro de periodo. Sin el archivo, 4/4 en verde; con él, 6 fallos en 4 corridas.
- **La Fase 9 tiene escrito, donde mira,** que borrar un recibo a los treinta días rompe un requisito de la Fase 7, con la clave de configuración y la función que lo implementan nombradas.

## Task Commits

1. **Task 1: Los cinco señuelos, corridos en los dos sentidos** — `fb69b77` (test)
2. **Task 1b: La idempotencia del cierre con dos conexiones de verdad** — `9632df6` (test)
3. **Task 2: La suite completa, con sus condiciones de entorno** — `3aed064` (test) y `7272236` (docs)
4. **Task 3: Lo que esta fase le deja escrito a la Fase 9** — `76f34b8` (docs)

---

## La bitácora de los seis señuelos

Cada uno: romper la línea mínima que sostiene la garantía → `npm run db:reset && npm run db:test` → anotar qué aserción se puso roja, por su nombre → revertir → reset y test → confirmar verde. Doce reinicios de base, 54 s medidos cada uno.

| # | Qué se rompió | Qué se puso rojo |
|---|---|---|
| 1 | Migración 25: `where c.is_managed` fuera del núcleo del cierre (el cálculo Y el contador) | **NADA. 369/369 en verde.** → HALLAZGO. Con el bloque N nuevo: **96 y 97** |
| 2 | Migración 25: la salida temprana `if v_cabeceras = 0 then return 0` | **NADA. 99/99 en verde.** → HALLAZGO. Con el bloque O nuevo: **100 y 101** |
| 3 | Migración 23: `references … on delete cascade` en `cleaning_id` y `expense_id` de `cleaner_payout_lines` | **50, 52, 82 y 92**, las cuatro de FIN-04 |
| 4 | Migración 24: `tarifa_huesped` devuelta al grant de columna de `cleanings` | **13**, y el TAP imprime la cifra fugada: `have: 90000` |
| 5 | Migración 23: `at time zone 'America/Bogota'` fuera de `public.dia_bog` | **18 aserciones**, encabezadas por 8, 10 y 11 |
| 6 | Migración 25: `on conflict (periodo_desde) do nothing` cambiado por un `insert` a secas | **3 de las 6** de `cierre-concurrente.integration.test.ts` |

### Señuelos 1 y 2: los dos hallazgos, y por qué valen más que los tres que salieron a la primera

Ninguno de los dos puso nada en rojo. **No porque las líneas sobren, sino porque cada garantía la sostenían DOS capas y solo una estaba medida.**

**FIN-05.** Quien deja hoy al informativo fuera de todo cálculo es `cl_unmanaged_is_inert` (migración 04), que impide que una fila de gestión externa tenga estado, aseadora, `finished_at` o tarifas. Con la fila inerte, el `c.state = 'completada'` del núcleo ya la deja fuera él solo, e `is_managed` no llega a decidir nada nunca. El filtro explícito es exactamente la defensa que la migración 25 describe como necesaria «hasta el día en que alguien añada una columna con default» — y hasta hoy **ninguna aserción del repo podía distinguir si estaba o no.**

> **Bloque N.** Apaga la capa 1 dentro de la transacción del test (`drop constraint` + `disable trigger`, que el `rollback` repone), inserta el informativo que NO debería poder existir —completado, con aseadora y con 777 000 pesos— en el periodo de junio, que nadie ha cerrado, y deja al filtro `is_managed` solo frente a él. Cinco aserciones: una de arnés (95) que comprueba que la fila tramposa EXISTE antes de afirmar nada sobre ella, y cuatro de garantía (96 a 99).
>
> Sin la 95, este bloque habría sido justo el tipo de prueba que esta fase existe para desenmascarar: y de hecho falló en el primer intento, porque `hora_limite` es `not null` y la rellenaba el trigger que el bloque apaga.

**La idempotencia.** Quien impide el pago doble es el índice único, no la salida temprana. Medido con una sonda directa contra la base: **con la guarda comentada, la segunda corrida revienta con 23505 sobre `cp_periodo_aseador_unico`.** El dinero nunca estuvo en riesgo, pero el repo no distinguía entre las dos formas de «no pagar dos veces»:

- **(a)** no pagar dos veces **porque la segunda corrida explota**: el job de `pg_cron` queda marcado como fallido y el botón del admin le devuelve un error a alguien que no hizo nada mal;
- **(b)** no pagar dos veces **porque la segunda corrida sale limpia y devuelve cero**, que es lo que la migración 25 escribió y lo que las dos puertas necesitan para poder dispararse a la vez.

Las aserciones 31 a 33 miden el ESTADO, y (a) y (b) dejan el mismo estado. El SQLSTATE y el valor de retorno se capturaban con `\gset` y **no se afirmaban nunca**.

> **Bloque O.** Dos aserciones: la 100 audita el SQLSTATE de las tres repeticiones que el bloque F ya hacía (`sin_error|sin_error|sin_error`; con el señuelo, `23505|23505|23505`), y la 101 mide el valor de retorno de una corrida más sobre el periodo ya cerrado (`0`; con el señuelo, `ERROR:23505`).

### Señuelo 5: dieciocho rojos no es falta de precisión

`public.dia_bog` es la ÚNICA conversión que decide a qué periodo pertenece un aseo, así que quitarle la zona mueve UN aseo del fixture (el de las 23:30 del día del cierre) de julio a agosto, y con él toda la aritmética del periodo. Las tres primeras rojas —**8, 10 y 11**— SON la garantía D7-8, y la 8 es lo más estrecho que se puede escribir: mide la función a solas sobre el instante frontera, con `have: 2026-08-01 / want: 2026-07-31`. Las otras quince son la consecuencia, y verlas es el punto.

### Señuelo 6: qué demostró exactamente

Quitar el `on conflict do nothing` **NO duplicó el pago** —el índice único lo impidió— pero **SÍ hizo reventar a la puerta del admin con 23505** mientras la del job ganaba la carrera. Las tres aserciones de ESTADO de `cierre-concurrente.integration.test.ts` siguieron en verde y las tres de COMPORTAMIENTO se pusieron rojas. Es la misma distinción del bloque O, medida esta vez con las dos conexiones peleándose de verdad.

---

## Task 1b: qué camino se eligió, y por qué

**El test de integración, no el script de shell.** La razón es de mantenimiento y no de gusto: un script suelto en `scripts/dev/` es un script que nadie vuelve a correr. Así entra en `npm run test:integration` y se cae solo el día que alguien toque el núcleo del cierre.

**Las dos conexiones son procesos `psql` de verdad**, lanzados con `docker exec` contra el contenedor del stack local. No son dos `Promise.all` sobre el mismo cliente ni dos peticiones a PostgREST: son dos procesos independientes, cada uno con su backend de Postgres y su transacción explícita. `docker` es una dependencia que esta suite ya tiene (sin él no hay `npx supabase start`).

**La barrera es `pg_sleep_until` sobre un instante calculado por el propio Postgres**, para que no dependa del reloj del proceso de Node. Las dos sesiones se conectan, entran en su transacción y se paran ahí; cuando el instante llega, despiertan a la vez y se pelean por la inserción de la cabecera.

**El solape no se supone: se exige.** Cada sesión anota `clock_timestamp()` justo antes y justo después de la llamada, y el test falla si los dos intervalos no se cruzan. Sin esa aserción, dos llamadas que se estorbaron por casualidad dejarían el mismo estado que dos simultáneas, y la prueba pasaría sin haber medido concurrencia.

**Los cuatro puntos que afirma**, comparados contra una corrida SOLA del mismo escenario (que es el patrón oro, no una cifra literal que envejece con el sembrador):

1. Exactamente **una** fila de `payout_periods`.
2. Exactamente **un** pago por aseadora, con el mismo monto que la corrida sola (y no el doble).
3. Exactamente el mismo número de líneas de desglose.
4. Las dos sesiones confirman su transacción con código 0 y llegan hasta su marca final; una devuelve los pagos y la otra cero, y cuál de las dos gana es indiferente y no se afirma.

---

## Las cuatro suites contra su línea base

Medidas el 2026-09-13 con `npm run db:reset` inmediatamente antes, `PLAYWRIGHT_PORT=3210` (puerto libre verificado) y `NEXT_PUBLIC_VIVAGUEST_FEED_LOCAL=1`.

| Capa | Línea base (antes de la Fase 7) | Medido ahora | Veredicto |
|---|---|---|---|
| pgTAP | 11 archivos, **275** | 12 archivos, **376** | +101 · por encima |
| unidad | 55 archivos, **1006** | 63 archivos, **1201** | +195 · por encima |
| integración | 19 archivos, **169** | 22 archivos, **196** | +27 · por encima |
| E2E | **112** pasando, 1 saltado | **132** pasando, **1 saltado**, 2 rojos | +20 · por encima, mismo saltado |

**Este plan aportó:** +7 aserciones pgTAP (369 → 376) y +6 tests de integración (190 → 196).

### Los doce comandos de la puerta

| Comando | Resultado |
|---|---|
| `npm run db:reset` | ok |
| `npm run db:test` | `Files=12, Tests=376, Result: PASS` |
| `npm run test:unit` | `63 passed (63) · 1201 passed` |
| `npm run test:integration` | `22 passed (22) · 196 passed` |
| `PLAYWRIGHT_PORT=3210 NEXT_PUBLIC_VIVAGUEST_FEED_LOCAL=1 npm run test:e2e` | `132 passed · 1 skipped · 2 failed (3.3 min)` |
| `npm run ci:arch` | los tres guardarraíles OK |
| `npm run lint` | 0 errores, 2 avisos preexistentes |
| `npx tsc --noEmit` | sin salida, rc=0 |
| `npm run db:lint` | `No schema errors found` |
| `npm run db:advisors` | `No issues found` |
| `npm run db:types:check` | sin diferencias, rc=0 |
| `npm run build` | rc=0 |

### Los dos rojos E2E, y por qué se dejan en rojo

`finanzas.spec.ts` «cambiar el rango recalcula…» y «el chevron de siguiente se apaga…». **La atribución de partida era equivocada y está desmentida con medición:** no son defectos del spec ni dependencia de orden. Los tres flakes conocidos de `push-instalacion.spec.ts:215` y `operacion.spec.ts:256` **no aparecieron en esta corrida**.

**La causa, aislada con ocho corridas:** `app/(admin)/finanzas/loading.tsx`.

| Estado del archivo | Corridas | Resultado |
|---|---|---|
| **Sin** `loading.tsx` | 4 | **15/15 en verde las cuatro**, 16-17 s cada una |
| **Con** `loading.tsx` | 4 | **6 fallos repartidos en las cuatro**, 32-50 s cada una |

El propio archivo lleva escrito el supuesto que lo rompe: *«Cambiar de rango es otra cosa y no pasa por aqui»*. **Es falso en el App Router:** `loading.tsx` es el `fallback` de Suspense DEL SEGMENTO y se aplica también a una navegación que solo cambia los parámetros de consulta de la misma ruta. El caso A y el caso B de §12.2 compiten por el mismo mecanismo, y el resultado no es un esqueleto donde no tocaba: **es que la transición se cuelga, el contenedor se queda con `aria-busy="true"` para siempre, la respuesta RSC llega con 200 y se aborta, y volver a pulsar no recupera nada.**

Seis sospechas descartadas una por una, con la medición al lado (service worker con `/sw.js` bloqueado, el servidor con un `fetch` manual que devuelve 23 461 bytes en ~100 ms, la hidratación, el orden de las pruebas, la tormenta de prefetch y el reintento del clic). Todo en `deferred-items.md`.

**No se arregla desde aquí** (regla 4): el arreglo es mover el esqueleto a un `<Suspense>` dentro de `page.tsx`, partir el componente en dos, y hacerlo en **cuatro rutas** de una sección que el dueño ya aceptó. Y ponerlas en verde sin tocar la causa exigiría debilitar lo que afirman, que es correcto: pulsar `Día` tiene que cambiar el periodo.

---

## Las 22 filas del mapa de verificación, recorridas

| # | Requisito | Comportamiento | Tipo | Comando | Estado |
|---|---|---|---|---|---|
| 1 | FIN-01 (regresión) | Editar la tarifa del apartamento no mueve la del aseo ya terminal | pgTAP | `npm run db:test` | ✅ |
| 2 | FIN-02 | La rentabilidad da el margen correcto y excluye los informativos | pgTAP | `npm run db:test` | ✅ |
| 3 | FIN-02 | Un aseador que llama a `rentabilidad_aseos` recibe 42501 | pgTAP | `npm run db:test` | ✅ |
| 4 | FIN-02 / D7-7 | Un aseador NO puede leer `cleanings.tarifa_huesped` por PostgREST | pgTAP | `npm run db:test` | ✅ (señuelo 4 la pone roja) |
| 5 | D7-7 | Un aseador NO puede leer las columnas de dinero de `properties` en su ventana | pgTAP | `npm run db:test` | ✅ |
| 6 | FIN-03 / D7-5 | El día de cierre coincide con `generate_series` en 36 meses | pgTAP | `npm run db:test` | ✅ |
| 7 | FIN-03 / D7-5 | El gemelo TypeScript coincide con el SQL en los mismos 36 meses | integración | `npm run test:integration` | ✅ |
| 8 | FIN-03 | El cierre no hace nada en un día que no es el de cierre | integración | `npm run test:integration` | ✅ |
| 9 | FIN-03 | Dos corridas del cierre no pagan dos veces | pgTAP | `npm run db:test` | ✅ **+ concurrencia real (nuevo)** |
| 10 | FIN-04 | Borrar a mano un aseo del periodo cerrado deja el pago y su desglose intactos | pgTAP | `npm run db:test` | ✅ (señuelo 3 la pone roja) |
| 11 | FIN-04 / D7-6 | Borrar el gasto deja su línea con concepto y monto | pgTAP | `npm run db:test` | ✅ |
| 12 | D7-6 | El recibo de un gasto sigue existiendo pasados 30 días | pgTAP | `npm run db:test` | ✅ |
| 13 | FIN-04 / D7-3 | Editar una tarifa después de cerrar no mueve el pago cerrado | integración | `npm run test:integration` | ✅ |
| 14 | FIN-05 | Un aseo de gestión externa no aparece en ningún total ni conteo | pgTAP | `npm run db:test` | ✅ **+ bloque N (nuevo)** |
| 15 | D7-8 | Un aseo completado después del cierre cae en el periodo siguiente, y en uno solo | pgTAP | `npm run db:test` | ✅ (señuelo 5 la pone roja) |
| 16 | D7-8 | El desglose muestra fecha programada Y fecha de ejecución | E2E | `PLAYWRIGHT_PORT=… npm run test:e2e` | ✅ |
| 17 | D7-4 | La consulta de pagos del aseador no devuelve el periodo en curso | pgTAP | `npm run db:test` | ✅ |
| 18 | D7-4 | Un aseador no ve el pago de otro aseador | pgTAP | `npm run db:test` | ✅ |
| 19 | D7-4 / D7-7 | Ninguna función del aseador devuelve una cifra de huésped | pgTAP | `npm run db:test` | ✅ |
| 20 | D7-1 | La sección de finanzas existe, está en la navegación, y `/operacion` no cambió | E2E | `PLAYWRIGHT_PORT=… npm run test:e2e` | ✅ |
| 21 | D7-2 | El desglose separa aseos de gastos, y el recibo se abre | E2E | `PLAYWRIGHT_PORT=… npm run test:e2e` | ✅ |
| 22 | D7-4 | Marcar pagado deja fecha y autor, y no se puede marcar dos veces | E2E + pgTAP | ambos | ✅ |

**Ninguna fila quedó sin cobertura.** Las 19 automáticas de base y de integración están en verde; las 4 de E2E de esta tabla también (los dos rojos de la suite son de otras dos pruebas, las del filtro de periodo).

### Las dos verificaciones manuales, declaradas

| Verificación | Estado |
|---|---|
| **El cierre real de un mes vivido** (FIN-03) | **PENDIENTE, con fecha objetivo: tras el piloto de la Fase 8.** Depende de que exista un mes completo de operación real, que hoy no existe. Se cierra el primer periodo real y se contrasta el total contra el cálculo a mano del admin. No es un fallo. |
| **El pago cerrado visto desde un teléfono real** (D7-4) | **ABIERTO Y BLOQUEANTE.** Lo cubre el `checkpoint:human-verify` del plan **07-13**, que sigue parado. El recorrido de nueve puntos en un iPhone real solo lo puede hacer el dueño. 07-13 dejó preparados `scripts/dev/sembrar-mis-pagos.mjs`, los dos túneles y los nueve puntos escritos, y **no escribió su SUMMARY a propósito**, porque el resultado punto por punto es parte de su contenido. **No se da por aprobado ni se simula desde aquí.** |

---

## Files Created/Modified

- `supabase/tests/11_financiero.test.sql` — bitácora de los seis señuelos en la cabecera; bloques N (5 aserciones) y O (2); `plan(94)` → `plan(101)`
- `lib/domain/cierre-concurrente.integration.test.ts` — **nuevo.** La idempotencia del cierre bajo dos conexiones simultáneas de verdad
- `e2e/fixtures.ts` — `esperarControlHidratado`, `esperarUrlDeCliente` y `pulsarHastaNavegar`, las tres con su medición escrita
- `e2e/finanzas.spec.ts` — los cuatro KPIs se miden cuando están pintados; las dos pruebas del filtro usan el ayudante nuevo
- `.planning/STATE.md` — consecuencias de la Fase 7 para la Fase 9 y para el piloto, la deuda con su detonante, y la posición al día
- `.planning/phases/07-financiero/deferred-items.md` — el defecto del filtro de periodo, con la causa aislada y el arreglo propuesto

## Decisions Made

Las seis listadas en el frontmatter. La que más pesa: **los dos rojos E2E se dejan en rojo.** Ponerlos en verde sin tocar la causa exigiría debilitar aserciones correctas, y la causa es un cambio de estructura en cuatro rutas de una sección ya aceptada — regla 4, se pregunta, no se adivina.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Funcionalidad crítica ausente] FIN-05 no tenía ninguna aserción capaz de fallar**

- **Found during:** Task 1, señuelo 1
- **Issue:** Con `where c.is_managed` fuera del núcleo del cierre, las 369 aserciones siguieron en verde. La garantía la sostenía `cl_unmanaged_is_inert`, y el filtro explícito no estaba medido por nada.
- **Fix:** Bloque N de `11_financiero.test.sql`: apaga el CHECK y el trigger dentro de la transacción del test, inserta el informativo no inerte en un periodo sin cerrar, y afirma cuatro cosas sobre él con el filtro solo. Más una aserción de arnés que comprueba que la fila tramposa existe.
- **Verification:** Señuelo 1 vuelto a correr: pone en rojo las aserciones 96 y 97, y solo esas. Revertido: verde.
- **Committed in:** `fb69b77`

**2. [Rule 2 — Funcionalidad crítica ausente] La idempotencia solo estaba medida por su efecto, no por su comportamiento**

- **Found during:** Task 1, señuelo 2
- **Issue:** Con la salida temprana comentada, las 99 aserciones siguieron en verde: el índice único salva el dinero y el estado final es idéntico. El SQLSTATE y el valor de retorno de las corridas repetidas se capturaban y no se afirmaban nunca.
- **Fix:** Bloque O: afirma `sin_error` en las tres repeticiones del bloque F y `0` en una corrida más.
- **Verification:** Señuelo 2 vuelto a correr: rojas 100 y 101, con `have: 23505|23505|23505` y `have: ERROR:23505`. Revertido: verde.
- **Committed in:** `fb69b77`

**3. [Rule 1 — Bug] El spec de los cuatro KPIs medía posiciones antes de que hubiera nada pintado**

- **Found during:** Task 2
- **Issue:** `evaluate()` espera a que el elemento esté ADJUNTO, no a que esté pintado. Un nodo que React acaba de reemplazar al hidratar sigue resolviendo y devuelve un rectángulo de ceros.
- **Fix:** Las cuatro etiquetas se exigen visibles antes de medir. El orden se sigue afirmando igual, sin quitar alcance.
- **Verification:** La prueba pasa en las nueve corridas de `finanzas.spec.ts` de este plan.
- **Committed in:** `3aed064`

**4. [Rule 1 — Bug del instrumento] `waitForURL` y `toHaveURL` no ven jamás la navegación del filtro**

- **Found during:** Task 2
- **Issue:** Medido con 20 s de plazo: la aserción sigue viendo la URL vieja incluso en las corridas en las que la navegación SÍ funciona. Su sondeo se ejecuta dentro del documento y se traba con el commit de la transición de React. Sondeando `page.url()` desde Node aparece en ~200 ms.
- **Fix:** `esperarUrlDeCliente` en `e2e/fixtures.ts`, que sondea desde Node. La aserción sobre la URL se sigue escribiendo, después.
- **Verification:** Con el ayudante, la prueba del rango pasa; el fallo restante ya no es del instrumento y lo dice con la URL exacta en la que se quedó.
- **Committed in:** `3aed064`

---

**Total deviations:** 4 auto-arregladas (2 de regla 2, 2 de regla 1). **Una escalada a regla 4 y NO aplicada:** el arreglo de `loading.tsx`, por afectar a cuatro rutas y a la estructura de carga de una sección ya aceptada.

**Impact on plan:** las cuatro son de corrección o de capacidad de medición. Sin las dos primeras, la fase habría cerrado con dos garantías que nadie podía poner en rojo, que es exactamente lo que este plan existe para impedir.

## Issues Encountered

**La caza del rojo del filtro de periodo costó la mitad del plan.** El diagnóstico de partida («defecto del spec, dependencia de orden») resultó equivocado, y desmontarlo exigió descartar seis sospechas una por una con medición, no con argumento. Se resolvió con ocho corridas controladas que aíslan `loading.tsx` sin ambigüedad. El resultado no es un arreglo, es un defecto documentado con su causa y su remedio escritos — que para la Fase 8 vale más.

## Known Stubs

Ninguno. Este plan no añade código de producto.

## Threat Flags

Ninguna superficie nueva. Este plan solo añade pruebas y documentación.

## User Setup Required

Ninguno.

## Lo único que impide cerrar la Fase 7

**El `checkpoint:human-verify` de 07-13.** El recorrido de nueve puntos en un iPhone real. No está aprobado, no se simuló y no se escribió su SUMMARY. Es lo único que falta.


## Self-Check: PASSED

Verificado el 2026-09-13, no afirmado:

- Los siete archivos que este plan crea o modifica **existen en disco**.
- Los cinco commits (`fb69b77`, `9632df6`, `3aed064`, `7272236`, `76f34b8`) **existen en `git log`**.
- `supabase/tests/11_financiero.test.sql` declara `select plan(101);` y su cabecera contiene la bitacora de senuelos.
- `.planning/STATE.md` nombra a la «Fase 9» en nueve sitios, y la nota del recibo cita `expense_photo_retention_days` y `public.foto_vencida`.
- `npm run db:reset && npm run db:test` termina en `Result: PASS` con 376 aserciones, y el repositorio queda **sin ninguna modificación de señuelo**: `git status --porcelain` limpio salvo este archivo.
