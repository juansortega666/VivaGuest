---
phase: 07-financiero
plan: 06
subsystem: domain
tags: [calendario, cierre, paridad-sql, timezone, agregacion, anti-ranking, bigint]

requires:
  - phase: 07-financiero
    provides: "`lib/domain/{mes,periodo,finanzas}.test.ts` y `mes.integration.test.ts` (plan 07-02), que son el contrato normativo de este plan"
  - phase: 07-financiero
    provides: "`public.ultimo_dia_habil_del_mes` y `public.periodo_de_cierre` (plan 07-04), el original del que este módulo es gemelo"
  - phase: 01-fundaciones
    provides: "`lib/domain/dates.ts` (`sumarDias`, `formatFechaLargaBog`, el ancla de `Date.UTC`) y `lib/domain/money.ts`"
provides:
  - "`lib/domain/mes.ts`: el gemelo en TypeScript del calendario de cierre, con paridad medida contra Postgres sobre 36 meses, y la etiqueta del periodo de pago con sus dos fechas reales"
  - "`lib/domain/periodo.ts`: el filtro del Resumen (día, semana anclada en lunes, mes calendario) con sus tres etiquetas y el predicado de `contieneHoy`"
  - "`lib/domain/finanzas.ts`: tipos del desglose y agregación de presentación, con el denominador contra el total, el orden alfabético y el rechazo del monto que llega como texto"
  - "`lib/domain/personas.ts`: `iniciales()` extraída y testeable, sin arrastrar un Client Component"
  - "`lib/domain/dates.ts`: cinco helpers de calendario compartidos: `diaDeLaSemana`, `nombreDeMesBog`, `nombreDeDiaBog`, `primeroDelMes`, `ultimoDiaDelMes`"
affects: [07-07, 07-08, 07-09, 07-10, 07-11, 07-12, 07-13, 07-14]

tech-stack:
  added: []
  patterns:
    - "Gemelo declarado: un módulo de TypeScript que reimplementa una función de Postgres lo dice en su cabecera, nombra el original y apunta al test de paridad que lo mide. Quien toque una tiene que tocar la otra"
    - "Separación FÍSICA de dos calendarios que se parecen: cero imports entre `mes.ts` y `periodo.ts`, verificado por grep en el acceptance del plan"
    - "La aritmética del calendario gregoriano se comparte por `dates.ts`; la regla de negocio no se comparte nunca"
    - "Colador de dinero en la frontera de la agregación: lo que no es entero seguro LANZA nombrando el campo, en vez de degradar a cero"
    - "El denominador de una barra de proporción se calcula antes de filtrar la lista, por orden de operaciones y no por convención"

key-files:
  created:
    - lib/domain/mes.ts
    - lib/domain/periodo.ts
    - lib/domain/finanzas.ts
    - lib/domain/personas.ts
    - lib/domain/personas.test.ts
  modified:
    - lib/domain/dates.ts
    - lib/domain/dates.test.ts
  deleted:
    - lib/domain/mes.d.ts
    - lib/domain/periodo.d.ts
    - lib/domain/finanzas.d.ts

key-decisions:
  - "Los cinco helpers de calendario van a `lib/domain/dates.ts` y no duplicados en los dos módulos: `mes.ts` y `periodo.ts` tienen prohibido importarse entre sí, y sin un tercer sitio la única salida era copiar. La prohibición es sobre la REGLA DE NEGOCIO (qué día cierra el mes), no sobre la aritmética del calendario gregoriano: el último día de febrero es un hecho, no una decisión del dueño"
  - "`ultimoDiaDelMes` se calcula como el día anterior al primero del mes siguiente, nunca con una tabla de longitudes de mes: la tabla es exactamente donde falla el 29 de febrero de 2028"
  - "`etiquetaDePeriodoDePago` tiene tres ramas y no dos, porque el periodo que cruza el mes es el caso NORMAL con D7-5, no una excepción: ocurre cada vez que el mes anterior termina en fin de semana"
  - "EXCEPCIÓN DECLARADA no cubierta por el contrato: cuando el periodo cruza el AÑO, los dos años se escriben aunque `conAnio` venga en falso. `Del 30 de diciembre al 31 de enero` no es escueto, es falso: sitúa los dos meses en el mismo año. Omitir el año es una elección de densidad, y ahí perdería un dato"
  - "`nombreDeMesBog` y `nombreDeDiaBog` usan `Intl` y no una tabla explícita, al revés que `MESES_CORTOS`: allí el motivo medido era que es-CO devuelve `sept` de cuatro letras y que la abreviatura la fija la versión de ICU del runtime. El nombre LARGO no tiene ninguna de las dos variaciones, y `FECHA_LARGA` ya dependía de él"
  - "La etiqueta del filtro en rango de día se compone con DOS formateadores: un único `Intl` con `weekday` y `day` junta las partes con `\", \"` en es-CO, y el copy de UI-SPEC §11.2 no lleva coma. Componer es preferible a recortar una coma a mano"
  - "El colador de dinero LANZA en vez de degradar a cero, y el mensaje nombra el campo y el tipo recibido: `'400000'` y `400000` se imprimen casi igual en un error, y el tipo es justo lo que distingue el defecto de un dato correcto"
  - "`costoPorAseadora` valida también `aseos`, que el contrato no exigía: `count(*)` en Postgres devuelve `bigint` y le aplica la misma trampa de la cadena que a las sumas de dinero"
  - "El orden por monto desempata por nombre: sin el desempate, dos personas con el mismo costo bailan entre renders sin que nada lo explique"
  - "El tipo del argumento de `gananciaDelPeriodo` va INLINE y no se exporta: es lo único del archivo que nombra una cifra de huésped, y exportarlo lo pondría a un import de distancia del árbol del aseador"

patterns-established:
  - "Un módulo de dominio que duplica lógica de Postgres declara en su cabecera de qué función es gemelo y qué test mide la paridad. Sin esa cabecera, el siguiente que toque una de las dos no sabe que hay otra"
  - "Dos conceptos que comparten nombre en el vocabulario del producto se separan en dos archivos y la separación se verifica por grep, no por disciplina"

requirements-completed: [FIN-03, FIN-04]

coverage:
  - id: D1
    description: "La pantalla y la base dicen exactamente el mismo día de cierre para cualquier mes"
    requirement: "FIN-03"
    verification:
      - kind: integration
        ref: "lib/domain/mes.integration.test.ts: `ultimo_dia_habil_del_mes` contra `ultimoDiaHabilDelMes` en los 36 meses de 2026 a 2028, cero divergencias, 36 comparados"
        status: pass
      - kind: unit
        ref: "lib/domain/mes.test.ts: el cierre nunca cae en fin de semana y siempre es el ÚLTIMO hábil de su mes, sobre los 36 meses"
        status: pass
    human_judgment: false
  - id: D2
    description: "La pantalla y la base están de acuerdo en qué periodo contiene cada día, incluido el día siguiente al cierre"
    requirement: "FIN-03"
    verification:
      - kind: integration
        ref: "lib/domain/mes.integration.test.ts: `periodo_de_cierre` contra `periodoDeCierre` en los 36 meses Y en los 36 días siguientes a cada cierre, cero divergencias"
        status: pass
      - kind: unit
        ref: "lib/domain/mes.test.ts: dos periodos consecutivos son contiguos y no se solapan, sobre los 36 meses; el periodo siempre contiene el día que se le pregunta, sobre 108 días"
        status: pass
    human_judgment: false
  - id: D3
    description: "El cierre no se mueve por festivos, y es una decisión explícita que nadie puede 'arreglar' sin ponerse en rojo"
    requirement: "FIN-03"
    verification:
      - kind: unit
        ref: "lib/domain/mes.test.ts: el 30 de junio de 2025 es lunes Y festivo colombiano (ley Emiliani), y el mes cierra ahí"
        status: pass
    human_judgment: false
  - id: D4
    description: "Un periodo de pago nunca se rotula solo con el nombre del mes, ni siquiera cuando coincide con el mes calendario"
    requirement: "FIN-03"
    verification:
      - kind: unit
        ref: "lib/domain/mes.test.ts: los dos días presentes en la etiqueta y `Del ` al principio, sobre los 36 periodos generados"
        status: pass
      - kind: unit
        ref: "lib/domain/mes.test.ts: las cuatro formas del copy de UI-SPEC §11.3: mismo mes, mes calendario completo, cruce de mes, cruce de año, y la forma sin año del teléfono"
        status: pass
    human_judgment: false
  - id: D5
    description: "El filtro del Resumen no puede reutilizar el calendario de pago ni presentar un rango que nadie cobró"
    requirement: "FIN-03"
    verification:
      - kind: unit
        ref: "lib/domain/periodo.test.ts: `rangoDePeriodo('mes', '2026-01-15')` termina el 31 y NO el 30, que es donde los dos calendarios se separan"
        status: pass
      - kind: unit
        ref: "`grep -c \"from './mes'\" lib/domain/periodo.ts` devuelve 0"
        status: pass
    human_judgment: false
  - id: D6
    description: "La semana del filtro arranca en lunes y un ancla en domingo cierra su semana en vez de abrir la siguiente"
    requirement: "FIN-03"
    verification:
      - kind: unit
        ref: "lib/domain/periodo.test.ts: ancla en domingo, ancla en lunes, y los siete días de la semana dando el mismo rango"
        status: pass
    human_judgment: false
  - id: D7
    description: "La barra de proporción no se puede leer como un podio: el denominador es el total del periodo y no cambia al filtrar"
    requirement: "FIN-04"
    verification:
      - kind: unit
        ref: "lib/domain/finanzas.test.ts: las proporciones SUMAN UNO, la más cara NO llena la barra, y filtrar la lista no cambia el denominador de la fila superviviente"
        status: pass
      - kind: unit
        ref: "lib/domain/finanzas.test.ts: el orden por defecto es alfabético ignorando acentos, y ninguna clave de la fila casa con `posicion|rank|puesto|top|medalla|orden`"
        status: pass
    human_judgment: false
  - id: D8
    description: "Un monto que llega como cadena desde Postgres no puede concatenarse en silencio"
    requirement: "FIN-04"
    verification:
      - kind: unit
        ref: "lib/domain/finanzas.test.ts: `costoPorAseadora`, `gananciaDelPeriodo` (los tres totales, uno por uno) y `armarDesglose` lanzan; el mensaje nombra el campo; también se rechazan `null`, `undefined`, `NaN` e `Infinity`"
        status: pass
    human_judgment: false
  - id: D9
    description: "Ningún tipo de presentación puede arrastrar una cifra de huésped hasta el árbol del aseador"
    requirement: "FIN-04"
    verification:
      - kind: unit
        ref: "lib/domain/finanzas.test.ts: recorrido del árbol ENTERO de claves de `armarDesglose` y de las filas de `costoPorAseadora` contra `huesped|tarifa|cobrad|margen|ganancia|diferencia|utilidad`"
        status: pass
    human_judgment: false
    rationale: "Tercera capa. La frontera de verdad está en Postgres y la mide pgTAP impersonando a un aseador: un tipo no es un control de acceso."

duration: 30min
completed: 2026-09-13
status: complete
---

# Phase 7 Plan 6: El dominio financiero en TypeScript

El gemelo del calendario de cierre coincide con Postgres en los 144 valores que
`mes.integration.test.ts` compara, y los dos calendarios que comparten la palabra
"mes" viven en dos archivos que no se pueden importar entre sí.

## Performance

| Métrica | Valor |
|---|---|
| Duración | ~30 min |
| Tareas | 2 de 2 |
| Commits de tarea | 2 |
| Archivos creados | 5 |
| Archivos modificados | 2 |
| Archivos borrados | 3 (las declaraciones de contrato de la Wave 0) |

## Accomplishments

**Los tres archivos rojos de `lib/domain/` están verdes, y el de paridad también.**
El movimiento medido, archivo por archivo:

| Archivo | Antes | Ahora |
|---|---|---|
| `lib/domain/mes.test.ts` | 24 rojos (no resolvía el módulo) | **24 verdes** |
| `lib/domain/periodo.test.ts` | 22 rojos | **22 verdes** |
| `lib/domain/finanzas.test.ts` | 37 rojos | **37 verdes** |
| `lib/domain/mes.integration.test.ts` | 4 rojos (144 valores sin comparar) | **4 verdes, 144 valores comparados, cero divergencias** |
| `lib/domain/personas.test.ts` | no existía | **7 verdes** (nuevos) |
| `lib/domain/dates.test.ts` | 37 verdes | **47 verdes** (10 nuevos, cero regresiones) |

**Suite unitaria completa: 1106 verdes sobre 59 archivos**, contra una línea base de
1006. La cuenta cuadra exactamente: 1006 + 24 + 22 + 37 + 7 + 10 = 1106, y ni uno
de los 1006 anteriores se puso rojo.

**La paridad, que es la pieza que este plan existía para cerrar.** Los cuatro
tests de `mes.integration.test.ts` comparan contra la base real:

| Comparación | Casos | Resultado |
|---|---|---|
| El generador produce los 36 meses de verdad | 3 aserciones de control | pass |
| `ultimo_dia_habil_del_mes` ↔ `ultimoDiaHabilDelMes` | 36 | cero divergencias |
| `periodo_de_cierre` ↔ `periodoDeCierre` | 36 × 2 fechas | cero divergencias |
| Lo mismo, sobre el DÍA SIGUIENTE al cierre | 36 × 2 fechas, más 36 de no-orfandad | cero divergencias |

El último bloque es el de más riesgo de la fase: es el único punto donde la
respuesta no se deduce del mes del argumento, y es exactamente el caso del aseo
terminado a las 23:30 del día del cierre.

## Task Commits

| Tarea | Nombre | Commit |
|---|---|---|
| 1 | `mes.ts` y `periodo.ts`, los dos calendarios que no se pueden mezclar | `1f8bc59` |
| 2 | `finanzas.ts` y `personas.ts` | `606bac3` |

## Files Created/Modified

**Creados:** `lib/domain/mes.ts`, `lib/domain/periodo.ts`, `lib/domain/finanzas.ts`,
`lib/domain/personas.ts`, `lib/domain/personas.test.ts`.

**Modificados:** `lib/domain/dates.ts` (cinco helpers nuevos, ninguna función
existente tocada), `lib/domain/dates.test.ts` (10 casos nuevos).

**Borrados:** `lib/domain/mes.d.ts`, `lib/domain/periodo.d.ts`,
`lib/domain/finanzas.d.ts`. Eran las declaraciones de contrato de la Wave 0 y su
borrado era una obligación escrita, no una limpieza opcional: TypeScript resuelve
el `.ts` antes que el `.d.ts`, así que uno olvidado queda **invisible y muerto**,
y el siguiente que toque el módulo se encuentra una firma fantasma que no
corresponde al código. `ls lib/domain/*.d.ts` no devuelve nada.

## Decisions Made

**1. Los helpers de calendario van a `dates.ts`, no duplicados.**
`mes.ts` y `periodo.ts` necesitan los mismos cinco: el día de la semana (uno para
retroceder el fin de semana, otro para anclar en lunes), el primero y el último
día del mes calendario, y los nombres largos de mes y de día. Como los dos
módulos tienen prohibido importarse entre sí, sin un tercer sitio la única salida
era copiar, y `dates.ts` ya tiene escrita esa misma decisión para `sumarDias`:
*"tener dos copias de estas cuatro líneas en código de aplicación es como una se
queda atrás"*.

Lo que hace que esto no abra el puente prohibido: **se comparte aritmética del
calendario gregoriano, nunca la regla de negocio.** El último día de febrero es
un hecho; qué día cierra el mes es una decisión del dueño, y esa sigue viviendo
solo en `mes.ts`.

**2. La etiqueta de un periodo que cruza el año lleva los dos años aunque se pida
sin año.** El contrato de la Wave 0 no cubre esa combinación. `Del 30 de diciembre
al 31 de enero` no es una etiqueta escueta, es una etiqueta **falsa**: sitúa los
dos meses en el mismo año. Omitir el año es una elección de densidad para el
teléfono, y ahí perdería un dato en vez de ahorrar espacio.

**3. `costoPorAseadora` cuela también el conteo de aseos.** El contrato solo exige
colar `pago` y `gastos`. Se añadió `aseos` porque `count(*)` en Postgres devuelve
`bigint` y le aplica exactamente la misma trampa: llega como cadena, y `'10' + 1`
es `'101'`. Es la Regla 2 (funcionalidad crítica ausente), no una licencia.

**4. El orden por monto desempata por nombre.** Sin desempate, dos personas con el
mismo costo intercambian posición entre renders sin que nada lo explique, y en una
lista de personas eso se lee como si algo hubiera cambiado.

## Deviations from Plan

### Auto-fixed

**1. [Regla 3 - Bloqueo estructural] Cinco helpers de calendario añadidos a `lib/domain/dates.ts`**

- **Encontrado durante:** Tarea 1, al escribir `periodo.ts`.
- **Situación:** el plan lista cuatro archivos en `files_modified` y ninguno es
  `dates.ts`. Pero `periodo.ts` necesita el último día del mes calendario y el día
  de la semana, que `mes.ts` ya había resuelto, **y tiene prohibido importarlo**.
  Las dos salidas eran duplicar la aritmética en los dos archivos o subirla al
  módulo que ya concentra la aritmética de fechas del repo.
- **Resuelto:** `diaDeLaSemana`, `nombreDeMesBog`, `nombreDeDiaBog`,
  `primeroDelMes` y `ultimoDiaDelMes` se añadieron a `dates.ts` con su
  justificación escrita en cada una, y con 10 casos nuevos en `dates.test.ts`
  (incluido uno que cambia `process.env.TZ` a `America/Bogota` en caliente, el
  patrón que ya usaba ese archivo). **Ninguna función existente de `dates.ts` se
  tocó:** los cambios son puramente aditivos y sus 37 tests previos siguen verdes.
- **Por qué no rompe la separación:** el acceptance criteria del plan es
  `grep -c "from './mes'" lib/domain/periodo.ts` igual a 0, y sigue siendo 0.
- **Commit:** `1f8bc59`.

**2. [Regla 2 - Funcionalidad crítica ausente] Validación del conteo de aseos y del margen**

- **Encontrado durante:** Tarea 2.
- **Situación:** el contrato exige rechazar `pago`, `gastos`, los tres totales de
  `gananciaDelPeriodo` y los montos del desglose. Deja fuera `aseos` y `margen`,
  que llegan de la misma consulta y por el mismo canal.
- **Resuelto:** el mismo colador se aplica a los cinco. Ningún test existente
  cambia de resultado.
- **Commit:** `606bac3`.

### Duplicación transitoria declarada

**`iniciales()` está HOY en dos sitios:** `lib/domain/personas.ts` (nuevo, con su
test) y `app/(admin)/_components/TopNav.tsx` (el original, intacto). Es
deliberado y está escrito en la cabecera del módulo nuevo.

> **PENDIENTE PARA EL PLAN 07-10:** cambiar `TopNav.tsx` para que importe
> `iniciales` de `lib/domain/personas.ts` y **borrar la definición vieja**, más la
> nota de duplicación transitoria de la cabecera de `personas.ts`. Se hizo así
> para que 07-06 y 07-10 no se pelearan por el mismo archivo corriendo en waves
> distintas. La función copiada es idéntica byte a byte, así que la sustitución no
> cambia comportamiento.

## Threat Flags

Ninguna superficie de seguridad nueva. Los cuatro módulos son puros, no leen el
reloj, no hacen red y no tocan la base.

Las cuatro amenazas del registro del plan quedan mitigadas y medidas:

| Amenaza | Mitigación | Medida por |
|---|---|---|
| T-07-25, una cifra de huésped llegando al teléfono | Un solo tipo para admin y aseador, sin ninguna cifra de huésped | Recorrido del árbol entero de claves, `finanzas.test.ts` |
| T-07-26, la pantalla diciendo un cierre distinto al de la base | Paridad sobre 36 meses más los 36 días siguientes al cierre | `mes.integration.test.ts`, 4/4, cero divergencias |
| T-07-27, el filtro reutilizando el calendario de pago | Módulos separados, importación prohibida | `grep -c "from './mes'"` = 0, más la aserción de enero de 2026 |
| T-07-28, un total que llega como cadena y se concatena | La agregación lanza nombrando el campo | 6 casos en `finanzas.test.ts` |

## Known Stubs

Ninguno. Los cuatro módulos están completos contra su contrato; no hay valores
vacíos cableados ni ramas sin implementar.

## Verification

| Puerta | Resultado |
|---|---|
| `npx vitest run lib/domain/mes.test.ts lib/domain/periodo.test.ts` | 46/46 |
| `npx vitest run lib/domain/finanzas.test.ts` | 37/37 |
| `npx vitest run lib/domain/personas.test.ts` | 7/7 |
| `npm run test:unit` | **1106/1106**, 59 archivos, cero regresiones sobre la línea base de 1006 |
| `npx vitest run --config vitest.integration.config.ts lib/domain/mes.integration.test.ts` | **4/4**, 144 valores comparados contra Postgres |
| `npx tsc --noEmit` | limpio |
| `npm run lint` | 0 errores (los 2 warnings son preexistentes, en archivos que este plan no toca) |
| `npm run ci:arch` | los tres guardarraíles en OK |
| `grep -c "from './mes'" lib/domain/periodo.ts` | 0 |
| `ls lib/domain/*.d.ts` | sin resultados |
| `new Date` sobre una cadena de solo fecha en los módulos nuevos | ninguno |

## Notes for Next Phase

**Para quien toque el calendario de cierre, en cualquier plan:** hay DOS
implementaciones y tocar una sola es un defecto permanente, porque un periodo
cerrado no se recalcula nunca (D7-3). La cabecera de `lib/domain/mes.ts` nombra su
original en SQL y su test de paridad. Correr
`npm run test:integration -- lib/domain/mes.integration.test.ts` es obligatorio
después de tocar cualquiera de las dos.

**Para 07-10:** te toca borrar la copia de `iniciales` de `TopNav.tsx` y hacer que
importe la de `lib/domain/personas.ts`. Está detallado arriba.

**Para 07-07 y 07-08:** `periodoDeCierre` devuelve `{ desde, hasta }` con los dos
extremos INCLUIDOS, igual que `public.periodo_de_cierre`. Y
`etiquetaDePeriodoDePago` es el único sitio que compone esa etiqueta: con D7-5, un
tercio de los periodos cruza el mes, así que componerla a mano en un componente
produce `Del 31 al 27 de febrero` el primer mes que termine en fin de semana.

**Para quien pinte el bloque por aseadora:** `proporcion` viene entre 0 y 1, nunca
en porcentaje, y ya está calculada contra el total del periodo completo. No la
recalcules sobre la lista filtrada y no la multipliques por cien dos veces.

## Self-Check: PASSED

Los cinco archivos creados existen en disco. Las tres declaraciones de contrato
de la Wave 0 están borradas y `ls lib/domain/*.d.ts` no devuelve nada. Los dos
commits de tarea (`1f8bc59`, `606bac3`) existen en el historial. La duplicación
transitoria de `iniciales` en `TopNav.tsx` sigue ahí, que es lo esperado y lo que
el plan 07-10 resuelve.
