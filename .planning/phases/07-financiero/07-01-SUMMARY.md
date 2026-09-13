---
phase: 07-financiero
plan: 01
subsystem: testing
tags: [pgtap, postgres, rls, grants, timezone, snapshot, tdd]

requires:
  - phase: 01-fundacion
    provides: "cleanings.tarifa_huesped y pago_aseador como bigint congelados por tg_cleanings_snapshot (FIN-01), cl_unmanaged_is_inert, cl_completada_shape, public.today_bog()"
  - phase: 02-acceso-y-administracion-del-catalogo
    provides: "private.is_admin() y private.is_active_cleaner(), que leen profiles en vivo"
  - phase: 06-pwa-del-aseador
    provides: "el arnes pg_temp.intento_como de 10_reportes.test.sql y el patron de nacer en rojo en Wave 0"
provides:
  - "supabase/tests/11_financiero.test.sql: 52 aserciones pgTAP que son el contrato ejecutable de FIN-02 a FIN-05, D7-2 a D7-8"
  - "El contrato de NOMBRES del schema financiero (tres tablas, cuatro helpers de calendario, siete funciones), normativo para 07-04, 07-05, 07-07, 07-08 y 07-09"
  - "La medicion en vivo del Hallazgo 1: la aseadora lee 90000 pesos de tarifa al huesped por dos vias distintas"
  - "La linea base de las cuatro suites, para poder medir regresion durante ocho waves"
affects: [07-04, 07-05, 07-07, 07-08, 07-09, 07-14, 09-retencion]

tech-stack:
  added: []
  patterns:
    - "Arnes de lectura tolerante (pg_temp.escalar / valor_como / correr): el execute dinamico dentro de un bloque con manejador convierte 42P01 y 42883 en un VALOR, y el rojo queda acotado a la asercion que corresponde en vez de abortar el archivo"
    - "Asercion no vacua: toda asercion sobre un conjunto que todavia no existe se escribe como 'encontrados|infractores' para que cero filas no la haga pasar"
    - "Patron oro por fuerza bruta (pg_temp.cierre_ref): la forma cerrada se compara contra un recorrido dia a dia en 36 meses, no contra una lista literal de fechas"

key-files:
  created:
    - supabase/tests/11_financiero.test.sql
  modified: []

key-decisions:
  - "El bloque G (supervivencia al borrado) va al FINAL del archivo aunque su letra sea anterior: destruye parte de la siembra a proposito y cualquier bloque posterior leeria un fixture mutilado"
  - "Las dos aserciones de la fuga usan pg_temp.valor_como y no intento_como, para que el TAP imprima en el `have` la cifra exacta que se esta escapando (90000) en vez de un 'sin_error' que no ensena nada"
  - "El identificador del pago ajeno se resuelve como postgres y se interpola con format(%L): resolverlo dentro de la sesion impersonada seria un autoengano, porque la subconsulta fallaria con 42501 y la asercion pasaria sin llegar a llamar la funcion"
  - "Se fija el contrato de nombres del schema financiero en la cabecera del archivo de test, no en la migracion: es Wave 0 y las migraciones todavia no existen"
  - "Un solo commit para las dos tareas del plan, porque el criterio de aceptacion de la Tarea 2 es que select plan(N) coincida exactamente, y un commit intermedio habria dejado el archivo con el conteo equivocado"

patterns-established:
  - "Senuelo declarado: cada bloque que prueba una propiedad fragil deja escrito que cambio concreto tiene que ponerlo en rojo, y que plan lo ejerce (07-14)"
  - "Verdes deliberados dentro de un archivo rojo: las aserciones que hoy pasan son las que impiden aprobar una asercion de seguridad rompiendo el producto"

requirements-completed: []

coverage:
  - id: D1
    description: "El calendario del cierre (dia habil, periodo de cierre a cierre, contiguidad) escrito como aserciones ejecutables, en rojo"
    requirement: FIN-03
    verification:
      - kind: integration
        ref: "supabase/tests/11_financiero.test.sql#aserciones 2-7 (bloque B)"
        status: fail
    human_judgment: false
  - id: D2
    description: "La pertenencia de un aseo a un periodo decidida en hora de Bogota, con un instante de las 23:30 del dia del cierre"
    requirement: FIN-03
    verification:
      - kind: integration
        ref: "supabase/tests/11_financiero.test.sql#aserciones 8-12 (bloque C)"
        status: fail
    human_judgment: false
  - id: D3
    description: "La frontera del aseador por las dos vias del Hallazgo 1, con la fuga medida en vivo, mas las dos aserciones que impiden cerrarla tumbando la PWA"
    requirement: FIN-02
    verification:
      - kind: integration
        ref: "supabase/tests/11_financiero.test.sql#aserciones 13-22 (bloque D); 15 y 16 en verde, 13 y 14 rojas por defecto vivo"
        status: fail
    human_judgment: false
  - id: D4
    description: "El cierre con las dos partidas separadas, el desglose con nombre copiado y dos fechas, y el tipo bigint de los totales"
    requirement: FIN-03
    verification:
      - kind: integration
        ref: "supabase/tests/11_financiero.test.sql#aserciones 23-30 (bloque E)"
        status: fail
    human_judgment: false
  - id: D5
    description: "La idempotencia del cierre: dos corridas, tarifa editada despues de cerrar, y aseo que entra tarde"
    requirement: FIN-03
    verification:
      - kind: integration
        ref: "supabase/tests/11_financiero.test.sql#aserciones 31-33 (bloque F)"
        status: fail
    human_judgment: false
  - id: D6
    description: "Los informativos fuera de todo calculo y de todo conteo, incluido el contador de aseos no computados"
    requirement: FIN-05
    verification:
      - kind: integration
        ref: "supabase/tests/11_financiero.test.sql#aserciones 34-37 (bloque H)"
        status: fail
    human_judgment: false
  - id: D7
    description: "Lo que ve el aseador y lo que no, con la asercion de ausencia de cifra de huesped hecha sobre el returns table del catalogo"
    requirement: FIN-02
    verification:
      - kind: integration
        ref: "supabase/tests/11_financiero.test.sql#aserciones 38-43 (bloque I)"
        status: fail
    human_judgment: false
  - id: D8
    description: "El criterio del ROADMAP escrito palabra por palabra: delete literal del aseo y del gasto, seguido en otra sentencia de la relectura del pago y de su desglose"
    requirement: FIN-04
    verification:
      - kind: integration
        ref: "supabase/tests/11_financiero.test.sql#aserciones 44-52 (bloques J y G); 47 y 51 en verde"
        status: fail
    human_judgment: false
  - id: D9
    description: "El rojo acotado por nombre de archivo: los once archivos pgTAP anteriores conservan sus 275 aserciones en verde"
    verification:
      - kind: integration
        ref: "npm run db:test — 12 archivos, 327 tests, unico Wstat distinto de cero en 11_financiero.test.sql"
        status: pass
    human_judgment: false

duration: 62min
completed: 2026-09-13
status: complete
---

# Fase 7 Plan 01: El contrato financiero, en rojo

**52 aserciones pgTAP que fijan el schema financiero de la fase antes de que exista, 47 de ellas rojas: 45 porque el schema no esta construido y 2 porque una aseadora autenticada sigue leyendo 90000 pesos de tarifa al huesped por dos vias distintas.**

## Performance

- **Duration:** 62 min
- **Started:** 2026-09-13T13:10:00Z
- **Completed:** 2026-09-13T14:12:00Z
- **Tasks:** 2
- **Files modified:** 1

## El numero que pedia el plan: cuantas aserciones rojas y por que

`npm run db:test` sobre `main` con este archivo dentro:

| | Archivos | Aserciones | Verdes | Rojas |
|---|---|---|---|---|
| Los once anteriores | 11 | 275 | **275** | 0 |
| `11_financiero.test.sql` | 1 | 52 | 5 | **47** |
| **Total** | **12** | **327** | **280** | **47** |

`Result: FAIL`. El unico `Wstat` distinto de cero es el de `11_financiero.test.sql`, comprobado por nombre de archivo en cuatro corridas consecutivas, una de ellas sobre base recien reseteada.

### Las 47 rojas, por bloque y por plan responsable

| Bloque | Rojas | Por que esta en rojo | Quien lo pone en verde |
|---|---|---|---|
| B · calendario del cierre | 6 (2-7) | `ultimo_dia_habil_del_mes` y `periodo_de_cierre` no existen (42883) | **07-04** (migracion 23) |
| C · hora de Bogota | 5 (8-12) | `dia_bog` no existe, y las tablas del snapshot tampoco (42883 / 42P01) | **07-04** + **07-07** |
| D · frontera del aseador | 8 de 10 (13,14,17-22) | **13 y 14 por DEFECTO VIVO** (ver abajo); 17-22 porque las tres funciones no existen | **07-05** (13,14,19,22) y **07-08** (17,18,20,21) |
| E · el cierre calcula | 8 (23-30) | `payout_periods`, `cleaner_payouts` y `cleaner_payout_lines` no existen (42P01) | **07-07** (migracion 25) sobre el schema de **07-04** |
| F · idempotencia | 3 (31-33) | `cerrar_periodo` no existe | **07-07** |
| H · informativos fuera | 4 (34-37) | tablas y funciones de lectura ausentes | **07-07** + **07-08** |
| I · lo que ve el aseador | 6 (38-43) | `mis_pagos_cerrados` y `detalle_de_mi_pago` no existen | **07-09** (migracion 27) |
| J · el recibo cinco anos | 3 (44-46) | `foto_vencida` no existe | **07-04** |
| G · supervivencia al borrado | 4 de 6 (48-50,52) | no hay pago que releer todavia (42P01) | **07-04** (ausencia de FK) + **07-07** (texto copiado) |

### Las 5 verdes son deliberadas, no residuo

| # | Asercion | Por que tiene que estar verde HOY |
|---|---|---|
| 1 | La siembra dejo seis completados gestionados, un informativo y 20000 en gastos | Demuestra que el arnes funciona y que el rojo de abajo es del schema que falta, no del fixture |
| 15 | La aseadora SI sigue leyendo nombre, cluster y hora limite de su apartamento | Sin ella, 07-05 podria "aprobar" las aserciones 13 y 14 revocando el grant entero y dejando la PWA sin datos |
| 16 | La aseadora SI sigue leyendo fecha, estado, huespedes e instrucciones de su aseo | Lo mismo, por el lado de `cleanings` |
| 47 | Borrar a mano un aseo de un periodo cerrado NO falla | Verde hoy porque no hay tablas; **tiene que seguir verde despues de 07-04**. Si 07-04 pone una clave foranea restrictiva, se pone roja y la purga de la Fase 9 se atascaria para siempre con 23503 |
| 51 | Lo mismo con el gasto | Idem |

**Las aserciones 47 y 51 son las mas faciles de romper de todo el archivo**, porque hoy estan verdes por una razon (no hay tablas) y manana tienen que estarlo por otra (no hay cascada). Quien ejecute 07-04 tiene que mirarlas.

## Las dos rojas por defecto vivo, con la cifra medida

No estan adelantadas: fallan contra `main` porque las puertas siguen abiertas.

```
# Failed test 13: "D7-7 FUGA: una aseadora NO puede leer cleanings.tarifa_huesped por PostgREST"
#         have: 90000
#         want: ERROR:42501
# Failed test 14: "D7-7 FUGA: una aseadora NO puede leer properties.tarifa_huesped en su ventana"
#         have: 90000
#         want: ERROR:42501
```

La causa esta en la migracion 07: `grant select on public.cleanings to authenticated` y
`grant select, insert, update, delete on public.properties to authenticated` son de **tabla**, y en
Supabase el admin y la aseadora comparten el rol de Postgres `authenticated`. La policy acota las
**filas** que ve cada quien; no acota las **columnas**. Dentro de su propia ventana, la aseadora lee
la tarifa que se le cobra al huesped por las dos vias. Las cierra el plan **07-05**.

El `have: 90000` no es casualidad: las dos aserciones usan `pg_temp.valor_como` en vez de
`intento_como` justamente para que el TAP imprima la cifra que se esta escapando. Con `intento_como`
el fallo diria `sin_error`, que no ensena nada a quien lea el log dentro de tres meses.

## La linea base de las cuatro suites, medida antes de tocar nada

Todas sobre `main` con `npm run db:reset` previo:

| Suite | Archivos | Casos | Estado |
|---|---|---|---|
| pgTAP (`npm run db:test`) | 11 | **275** | todas en verde |
| Unit (`npm run test:unit`) | 55 | **1006** | todas en verde |
| Integracion (`npm run test:integration`) | 19 | **169** | todas en verde |
| E2E (`npm run test:e2e`) | — | **112 + 1 saltado** | cifra del plan; **no se re-corrio** (ver Issues) |

## Accomplishments

- El contrato financiero entero de la fase es ejecutable, falla, y falla por las dos razones correctas: el schema no existe todavia, y dos puertas que el dueno mando cerrar siguen abiertas.
- El criterio del ROADMAP sobre la supervivencia al borrado esta escrito **palabra por palabra**: `delete from public.cleanings`, en su propia sentencia, seguido de la relectura del pago y de la linea del desglose. Lo mismo con el gasto.
- El calendario del cierre se mide contra un recorrido dia a dia de **los 36 meses de 2026 a 2028** en una sola asercion (`36/36`), no contra una lista de fechas escogidas a mano.
- Queda fijado el **contrato de nombres** del schema financiero en la cabecera del archivo. Es lo que impide que 07-04, 07-07 y 07-09 construyan tres vocabularios distintos trabajando en waves separadas.
- El rojo esta **acotado por nombre de archivo** y la linea base de las cuatro suites queda anotada, que es lo que permite medir regresion durante las ocho waves que faltan.

## Task Commits

1. **Tareas 1 y 2 (el archivo completo)** — `f2c5962` (test)

Un solo commit para las dos tareas. Razon, y es la unica desviacion del protocolo de este plan:
el criterio de aceptacion de la Tarea 2 es que `select plan(N)` coincida **exactamente** con el numero
de aserciones del archivo entero. Un commit intermedio tras la Tarea 1 habria dejado en la historia un
archivo con el conteo equivocado, que es justo el modo de fallo que el contexto del plan advierte
("el `plan(N)` tiene que cuadrar o el archivo falla por conteo sin decir cual falta").

## Files Created/Modified

- `supabase/tests/11_financiero.test.sql` (1215 lineas, nuevo) — el contrato ejecutable de FIN-02 a FIN-05, D7-2 a D7-8, mas el contrato de nombres del schema y la documentacion de las dos trampas de pgTAP de este repo.

## Decisions Made

**1. El bloque G va al final del archivo aunque su letra sea anterior.**
G borra un aseo y un gasto de la siembra a proposito. Cualquier bloque que corriera despues leeria un
fixture mutilado y fallaria por la razon equivocada, que es la peor clase de rojo: el que entrena a
quien lo lea a ignorarlo. El orden real del archivo es `A B C D E F H I J G`, y esta escrito en la
cabecera.

**2. El arnes se amplia con tres funciones nuevas, y no es comodidad.**
`pg_temp.intento_como` se copia literal de `10_reportes.test.sql`, con el mismo nombre, tal como pedia
el plan. Se le suman `valor_como`, `escalar` y `correr`. La razon es dura: **un objeto que todavia no
existe, nombrado en SQL estatico, aborta la transaccion entera**, y entonces el archivo produce UN
fallo en vez de 47 diagnosticables. El `execute` dinamico dentro de un bloque con manejador convierte
el 42P01 y el 42883 en un valor, y el rojo queda acotado a la asercion que corresponde. Es la misma
tecnica con la que `10_reportes.test.sql` nacio en rojo en la Fase 6.

**3. Toda asercion sobre un conjunto inexistente se escribe como `encontrados|infractores`.**
Una asercion del tipo "ninguna funcion del aseador declara una cifra de huesped" pasaria **por
vacuidad** mientras esas funciones no existan, y se pondria verde sin haber medido nada. Se escriben
como `'2|0'`, `'true|0'`, `'36/36'`, `'2|0'`: el denominador obliga a que el objeto exista antes de
poder aprobar. Aplica a las aserciones 2, 36, 39 y 43.

**4. El identificador del pago ajeno se resuelve como `postgres`, no dentro de la sesion impersonada.**
La asercion 41 comprueba que una aseadora no ve el pago de otra. Si el `select id from
cleaner_payouts ...` viviera dentro de la consulta impersonada, fallaria con 42501 **en la
subconsulta** y la asercion pasaria sin haber llegado nunca a llamar `detalle_de_mi_pago`. Se resuelve
antes con `pg_temp.escalar`, se sanea con `pg_temp.uuid_o_cero` para el caso de que la tabla no exista,
y se interpola con `format(%L)`.

**5. Las dos fechas de J1 son distintas a proposito (programada 2026-07-09, ejecutada 2026-07-10).**
Es lo unico que demuestra que el desglose guarda dos columnas de verdad y no la misma fecha dos veces.
Con las dos fechas iguales, una implementacion que copiara `scheduled_date` en ambas pasaria la
asercion 28.

**6. Los montos de la siembra son todos distintos entre si.**
90000 / 150000 de tarifa, 40000 / 55000 de pago, 12000 / 8000 de gasto. Con dos montos iguales, una
suma mal agrupada (las dos aseadoras colapsadas en una fila) cuadraria por casualidad.

**7. Se fija el contrato de nombres en la cabecera del test y no en una migracion.**
Es Wave 0: las migraciones no existen. Tres planes de waves distintas (07-04, 07-07, 07-09) van a
escribir contra estos nombres sin verse entre si. El archivo declara explicitamente que si un nombre
cambia, **cambia aqui primero**.

## Deviations from Plan

Ninguna desviacion de las reglas 1 a 4. Dos precisiones sobre el plan, las dos aditivas:

**1. El plan pedia "al menos tres" aserciones de hora de Bogota; se escribieron cinco.**
Las dos extra son el par de complemento: que el aseo de las 23:30 **no aparezca tambien** en el
periodo siguiente (asercion 11), y que un aseo que **empieza** el 31 de julio a las 23:50 y **termina**
el 1 de agosto a las 00:30 pertenezca a agosto (asercion 12). Sin la 11, un calculo que metiera el aseo
en los dos periodos pasaria la asercion 10 y pagaria dos veces. La 12 demuestra D7-8 entero: la
pertenencia sale de cuando se **completo**, no de cuando empezo ni de cuando estaba programado.

**2. El contrato de `resumen_financiero` se escribio explicito en un comentario del bloque H.**
El plan no fijaba si el Resumen cuenta por fecha programada o por fecha de ejecucion, y la asercion 37
no se puede escribir sin decidirlo. Queda escrito en el archivo: cuenta aseos **gestionados y
completados cuyo dia de ejecucion en Bogota cae en el rango**, es lectura **viva** y no snapshot, y por
eso si ve el aseo tardio del bloque F. Eso **no contradice D7-3**, que congela el *pago*, no el
informe. Si 07-08 decide otra cosa, tiene que cambiar este archivo primero.

---

**Total deviations:** 0 auto-fixes (reglas 1-3), 0 decisiones arquitectonicas (regla 4).
**Impact on plan:** ninguno. Los dos anadidos son aserciones extra sobre propiedades que el plan ya
exigia; no amplian el alcance ni tocan archivos de otros planes.

## Issues Encountered

**1. La primera medicion de la linea base dio 274/275 y era un falso rojo.**
`03_seed.test.sql` asercion 5 ("ninguna unidad nace activa") fallaba porque la base local arrastraba
apartamentos activados por trabajo anterior. `npm run db:reset` (54 s, como avisaba el contexto) la
devolvio a 275/275. **Lo relevante para el resto de la fase: la linea base solo es valida sobre base
reseteada.** Medirla sin resetear produce un rojo ajeno que se confunde con regresion propia.

**2. Los conteos de `test:unit` y `test:integration` se movieron durante la ejecucion, y no fue por mi.**
Al terminar: unit 1006 casos en verde pero **57** archivos con 2 fallando, e integracion **186** casos
con 21 archivos y 1 fallando. Los archivos son `lib/domain/mes.test.ts`, `lib/domain/periodo.test.ts` y
`lib/domain/mes.integration.test.ts`, que son el rojo deliberado de **07-02**, mi companero de Wave 0
(commit `900b2ec`, `test(07-02): el calendario de cierre y el filtro del Resumen, en rojo`).
No los toque. La linea base de la tabla de arriba es la medida **antes** de que aparecieran.

**3. Verificacion cruzada con 07-02: el gemelo TypeScript y este contrato SQL coinciden.**
Aprovechando que 07-02 ya habia commiteado, se comprobo en solo lectura que sus expectativas y las
mias son las mismas, sin habernos coordinado:

| Caso | `lib/domain/mes.test.ts` (07-02) | `11_financiero.test.sql` (07-01) |
|---|---|---|
| Cierre de mayo 2026 | `ultimoDiaHabilDelMes('2026-05-20') === '2026-05-29'` | asercion 4, periodo de junio empieza el **2026-05-30** |
| Periodo que contiene el 30 de mayo | `periodoDeCierre('2026-05-30') === {desde:'2026-05-30', hasta:'2026-06-30'}` | asercion 7, **identico** |
| Cierre de agosto 2026 | `ultimoDiaHabilDelMes('2026-08-01') === '2026-08-31'` | siembra y aserciones 6 y 12 |

**4. La suite E2E no se re-corrio.** Este plan no toca ni una linea de codigo de aplicacion, y 07-03
esta anadiendo specs (`e2e/finanzas.spec.ts`, `e2e/mis-pagos.spec.ts`) en el mismo arbol ahora mismo.
Correrla habria medido su trabajo en curso, no el mio. La cifra de la tabla es la del plan (112 + 1
saltado) y queda como linea base heredada, **no** como medicion de hoy.

## Known Stubs

Ninguno. Este plan produce un archivo de test cuyo estado correcto de entrega es el rojo, y ese rojo
esta documentado bloque por bloque en la tabla de arriba y en la cabecera del propio archivo.

## Threat Flags

Ninguno nuevo. Las cuatro amenazas del registro del plan quedan cubiertas:

| Threat ID | Como queda cubierta |
|---|---|
| T-07-01 | Asercion 13, roja con `have: 90000`. La cierra 07-05 |
| T-07-02 | Asercion 14, roja con `have: 90000`. La cierra 07-05 |
| T-07-03 | Asercion 43, sobre `pg_get_function_result` del catalogo y **no** sobre la fila devuelta |
| T-07-04 | Rojo comprobado por nombre de archivo en cuatro corridas; linea base de las cuatro suites anotada arriba |

## User Setup Required

Ninguno.

## Next Phase Readiness

**Listo para las Waves 1 en adelante.** El contrato existe, corre, y dice exactamente que falta.

Lo que quien ejecute los planes siguientes tiene que saber:

- **07-04 (migracion 23):** pone en verde los bloques B, C parcial y J. **Vigilar las aserciones 47 y
  51**, que hoy estan verdes por ausencia de tablas y manana tienen que estarlo por ausencia de
  cascada. Las tres tablas, sus columnas y sus tipos estan enumerados en la cabecera del archivo de
  test, incluida la exigencia de `bigint` en las tres partidas (asercion 30 lo mide contra
  `pg_attribute`, no contra el valor).
- **07-05 (migracion 24):** pone en verde 13, 14, 19 y 22. **Las aserciones 15 y 16 son el freno**: si
  se ponen rojas, la puerta se cerro tumbando la PWA.
- **07-07 (migracion 25):** bloques E, F, G y la mitad de H. El contador `aseos_no_computados` vale
  **1** y no 2 (asercion 35): el filtro de gestion propia tiene que ser explicito, no heredado del
  nulo.
- **07-08 y 07-09:** bloques D parcial, H parcial e I. La asercion 43 se hace sobre el `returns table`
  del catalogo, asi que no basta con no pintar la cifra: no puede estar **declarada**.
- **07-14:** los cuatro senuelos declarados estan escritos en el archivo, cada uno junto al bloque que
  tiene que poner en rojo (conversion de zona, guarda de cierre doble, filtro de gestion externa,
  cascada del desglose).

**Consecuencia para la Fase 9, que no puede perderse:** las aserciones 44 a 46 fijan que el recibo de
gasto vive **cinco anos** y no los 30 dias de las demas fotos, y las 47 y 51 fijan que la purga tiene
que poder borrar un aseo y un gasto ya liquidados **sin fallar con 23503**. Si la purga se escribe sin
saberlo, rompe D7-2 en silencio.

---
*Phase: 07-financiero*
*Completed: 2026-09-13*

## Self-Check: PASSED

- `supabase/tests/11_financiero.test.sql` existe, 1215 lineas, `select plan(52)` frente a 52 llamadas reales a funciones de asercion.
- `.planning/phases/07-financiero/07-01-SUMMARY.md` existe.
- Commit `f2c5962` existe en la historia. Commit `900b2ec` (07-02, citado en Issues) existe.
- Las tres aserciones citadas por su tecnica estan en el archivo: `pg_get_function_result` (43), `delete from public.cleanings where id` (47), `atttypid::regtype` (30).
- `npm run db:test` sobre base reseteada: 12 archivos, 327 aserciones, `Result: FAIL`, unico archivo con fallos `11_financiero.test.sql` (52 tests, 47 fallando).
- `npm run ci:arch`: OK en los tres guardarrailes.
