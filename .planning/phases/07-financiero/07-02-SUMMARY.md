---
phase: 07-financiero
plan: 02
subsystem: testing
tags: [wave-0, tdd, sembrador, calendario-de-cierre, paridad-sql-ts, timezone, bogota, presentacion]

requires:
  - phase: 01
    provides: "`cleanings` con sus cuatro CHECK de forma de estado, `expenses`, `damages`, `cleaning_photos`, `properties` con sus CHECK de activacion, y `public.today_bog()`"
  - phase: 04
    provides: "`lib/test/aseos.ts` con `sembrarEscenarioDeAseos()`, `crearAseador()`, `leerAseo()`, `limpiarAseos()` y la regla de que el dia sale de la base"
  - phase: 06
    provides: "`lib/domain/evidencia-paridad.integration.test.ts`, el molde del test de paridad SQL contra TypeScript, y la leccion de que dos implementaciones de la misma verdad divergen"
provides:
  - "`sembrarPeriodoCompleto()` en `lib/test/aseos.ts`: un periodo de pago completo con los seis casos borde que deciden la correccion de la fase, EN VERDE"
  - "`lib/test/aseos-financiero.integration.test.ts`: 17 casos que prueban al sembrador, en verde"
  - "`lib/domain/mes.test.ts`: 24 casos, el contrato del calendario de cierre, EN ROJO"
  - "`lib/domain/periodo.test.ts`: 22 casos, el contrato del filtro del Resumen, EN ROJO"
  - "`lib/domain/finanzas.test.ts`: 37 casos, el contrato de la agregacion de presentacion, EN ROJO"
  - "`lib/domain/mes.integration.test.ts`: 4 casos que comparan 144 valores sobre 36 meses generados, EN ROJO"
  - "`lib/domain/{mes,periodo,finanzas}.d.ts`: declaraciones de contrato SIN runtime, que el plan 07-06 tiene que BORRAR"
affects: [07-04, 07-05, 07-06, 07-07, 07-08, 07-09, 07-10, 07-11, 07-12, 07-13, 07-14]

tech-stack:
  added: []
  patterns:
    - "Un sembrador de escenario vive una sola vez y se parametriza: `sembrarPeriodoCompleto({ periodo })` deja que la integracion le pase el periodo autoritativo de Postgres, para que el arnes no sea una tercera opinion sobre cuando cierra el mes"
    - "Las fechas de una fixture se CALCULAN desde `today_bog()` y se anclan 45 dias atras: un literal de calendario hace que la suite empiece a fallar sola el ano siguiente, y el mes anterior a secas deja fechas en el futuro si la suite corre el dia 2"
    - "Un test de paridad acumula TODAS las divergencias y las afirma juntas: fallar en la primera esconde las otras, y el patron de la divergencia es la mitad del diagnostico"
    - "Un archivo `.d.ts` sin `.ts` es la forma segura de declarar un contrato de Wave 0: tsc queda verde y vitest sigue rojo con 'no encuentro el modulo', sin ningun stub que pueda entrar a un bundle"
    - "Los casos borde de fecha se siembran con desfase explicito `-05:00` y no con `Z`: escribirlos en tiempo universal destruye el unico caso que el escenario existe para producir"

key-files:
  created:
    - lib/test/aseos-financiero.integration.test.ts
    - lib/domain/mes.test.ts
    - lib/domain/periodo.test.ts
    - lib/domain/finanzas.test.ts
    - lib/domain/mes.integration.test.ts
    - lib/domain/mes.d.ts
    - lib/domain/periodo.d.ts
    - lib/domain/finanzas.d.ts
  modified:
    - lib/test/aseos.ts

key-decisions:
  - "El escenario financiero vive en un archivo de test HERMANO y no en `aseos.integration.test.ts`: el ultimo bloque de aquel destruye su escenario a proposito y los registros de lo sembrado son de modulo"
  - "El sembrador ancla el periodo 45 dias atras, no en el mes anterior: con el mes anterior a secas, una corrida del dia 2 dejaria el aseo de ejecucion tardia en el FUTURO"
  - "La aseadora desactivada SI tiene trabajo completado dentro del periodo: darla de baja no borra lo que hizo, y un calculo que filtre por aseadora activa deja a una persona sin cobrar"
  - "El sembrador NO sube nada a Storage: lo que se prueba es la linea contable, y 'recibo ausente' es un estado declarado de la interfaz"
  - "El calendario del cierre se declara en TRES sitios a proposito (Postgres, `lib/domain/mes.ts` y el ancla de fixture de `lib/test/`), y la mitigacion es la paridad medida mas un parametro que deja al arnes ceder ante Postgres"
  - "Las etiquetas que UI-SPEC no fija (periodo que cruza mes, periodo que cruza ano, semana que cruza mes) se FIJAN aqui en vez de dejarlas abiertas: con D7-5 el periodo que cruza el mes es el caso normal, no la excepcion"

patterns-established:
  - "Rojo de Wave 0 = fallo de resolucion de modulo, nunca una asercion que falla: es inconfundible y no se puede confundir con un defecto real"
  - "Una asercion de control acompana a cada asercion de ausencia: el orden por defecto se afirma Y se afirma que NO coincide con el orden por monto"
  - "Las reglas de frontera (T-07-05) se prueban recorriendo el arbol de claves con una expresion regular, no con una lista de claves esperadas: una entrada nueva mal puesta cae sola"

requirements-completed: [FIN-03, FIN-04, FIN-05]

coverage:
  - id: D1
    description: "`sembrarPeriodoCompleto()`: el escenario financiero con los seis casos borde, reutilizable por la integracion y por el E2E"
    requirement: "FIN-04"
    verification:
      - kind: integration
        ref: "npx vitest run --config vitest.integration.config.ts lib/test/aseos-financiero.integration.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "El contrato del calendario de cierre y del filtro del Resumen, escrito antes que su implementacion"
    requirement: "FIN-03"
    verification:
      - kind: unit
        ref: "npm run test:unit -- lib/domain/mes.test.ts lib/domain/periodo.test.ts"
        status: fail
    human_judgment: false
    rationale: "Rojo DELIBERADO de Wave 0. Lo pone en verde el plan 07-06."
  - id: D3
    description: "La paridad SQL contra TypeScript medida sobre los 36 meses de 2026 a 2028, mas el dia siguiente a cada cierre"
    requirement: "FIN-03"
    verification:
      - kind: integration
        ref: "npx vitest run --config vitest.integration.config.ts lib/domain/mes.integration.test.ts"
        status: fail
    human_judgment: false
    rationale: "Rojo DELIBERADO de Wave 0. Necesita la migracion del plan 07-04 y el modulo del plan 07-06."
  - id: D4
    description: "El contrato de la agregacion de presentacion: proporcion contra el total, orden alfabetico, margen promedio y rechazo del total que llega como texto"
    requirement: "FIN-05"
    verification:
      - kind: unit
        ref: "npm run test:unit -- lib/domain/finanzas.test.ts"
        status: fail
    human_judgment: false
    rationale: "Rojo DELIBERADO de Wave 0. Lo pone en verde el plan 07-06."

duration: 21min
completed: 2026-09-13
status: complete
---

# Fase 7 Plan 02: el sembrador financiero en verde y el dominio del cierre en rojo

**El escenario de un periodo de pago completo, con el aseo de las 23:30 del dia de cierre ya sembrado, y los cuatro contratos del dominio financiero escritos contra modulos que todavia no existen.**

## Performance

- **Duracion:** 21 min
- **Tareas:** 3 de 3
- **Archivos:** 1 modificado, 8 creados

## LO PRIMERO, PORQUE ES LO QUE MAS SE MALINTERPRETA: 87 CASOS QUEDAN EN ROJO, Y ES EL RESULTADO CORRECTO

Esto es Wave 0. El dominio se prueba **antes** de existir. Un verde total al terminar
significaria que las pruebas no miden nada.

| Archivo | Casos | Por que esta rojo | Quien lo pone en verde |
|---|---|---|---|
| `lib/domain/mes.test.ts` | 24 | `lib/domain/mes.ts` no existe | **07-06** |
| `lib/domain/periodo.test.ts` | 22 | `lib/domain/periodo.ts` no existe | **07-06** |
| `lib/domain/finanzas.test.ts` | 37 | `lib/domain/finanzas.ts` no existe | **07-06** |
| `lib/domain/mes.integration.test.ts` | 4 | ni el modulo (07-06) ni las funciones de Postgres (**07-04**) | **07-04 + 07-06** |

**Los cuatro fallan por resolucion de modulo, no por una asercion.** Es deliberado: ese rojo es
inconfundible y no se puede leer como un defecto real. Los 87 casos no llegan a ejecutarse.

Y lo que **no** esta rojo, tambien a proposito: `lib/test/aseos.ts` y su prueba de integracion, porque
el resto de la wave se apoya en ellos. Un sembrador roto no es un contrato, es una averia.

## El estado de las puertas, medido

| Puerta | Antes | Ahora | Lectura |
|---|---|---|---|
| `npm run test:unit` | 55 archivos, 1006 casos | **58 archivos, 1006 en verde + 3 rojos** | Los 1006 existentes intactos. El rojo esta acotado a los tres archivos nuevos |
| `npm run test:integration` | 20 archivos, 169 casos | **21 archivos, 186 en verde + 1 rojo** | 169 + los 17 del sembrador nuevo. El unico rojo es la paridad |
| `npx tsc --noEmit` | verde | **verde** | Ver la desviacion de abajo |
| `npm run lint` | 0 errores, 2 avisos | **0 errores, 2 avisos** | Los mismos dos de antes, en archivos ajenos |
| `npm run ci:arch` | OK | **OK** | Los tres guardarrailes |
| `npm run db:test` | 275 | **sin tocar** | Este plan no escribe SQL |

## Que se construyo

### 1. El sembrador de periodo completo (en verde)

`sembrarPeriodoCompleto()` en `lib/test/aseos.ts`. Deja dos apartamentos gestionados **con tarifas
distintas entre si**, uno de gestion externa, tres aseadoras y ocho aseos. Los seis casos borde:

1. **Un aseo terminado a las 23:30 de Bogota del dia de cierre.** Es la trampa central de la fase.
   `finished_at` es un instante; la pertenencia al periodo es una pregunta sobre dias de negocio.
   Resuelta en tiempo universal, ese aseo cae al dia **siguiente** y se va al periodo equivocado.
   Como un periodo cerrado no se recalcula nunca (D7-3), el error seria **permanente** y le cambiaria
   el pago a una persona.
2. **Su espejo, a las 00:30 del dia siguiente.** Sin el, una implementacion que desplazara todo un dia
   pasaria el caso 1 y seguiria estando mal. El test afirma que los dos distan **sesenta minutos de
   reloj** y sin embargo tienen un cierre de periodo en medio.
3. **Un aseo programado dentro del periodo y ejecutado en el siguiente** (D7-8). Sin el, el E2E de
   D7-8 no se puede escribir.
4. **Un gasto con su fila de foto de recibo**, con la ruta `{cleaning_id}/gasto/{uuid}.jpg`.
5. **Un aseo que queda sin completar** cuando el periodo cierra.
6. **Una unidad de gestion externa y una aseadora desactivada.**

### 2. Los cuatro contratos en rojo

- **`mes.test.ts`**: cierre entre semana, en sabado y en domingo; ano bisiesto; periodos contiguos sin
  hueco ni solape sobre 36 meses generados; el dia posterior al cierre pertenece al mes siguiente; dos
  cruces de ano; y el copy de las etiquetas de UI-SPEC §11.3.
- **`periodo.test.ts`**: la semana arranca en **lunes**, con ancla en domingo, en lunes y en los siete
  dias; el mes es el **mes calendario** y no el periodo de pago; las tres etiquetas de §11.2;
  `contieneHoy` verdadero en los dos extremos.
- **`finanzas.test.ts`**: la proporcion contra el **total**; el orden alfabetico por defecto; el
  margen promedio sin aseos como ausencia; el total que llega como texto, rechazado; y la frontera
  del aseador.
- **`mes.integration.test.ts`**: la paridad sobre 36 meses generados, **144 valores comparados**.

## Los tres hallazgos que cambiaron como quedo escrito

### 1. El sembrador necesitaba saber cuando cierra el mes, y eso lo habria convertido en una tercera opinion

El aseo de las 23:30 tiene que caer **en el dia de cierre**, y en Wave 0 no existe ni
`public.ultimo_dia_habil_del_mes` (plan 07-04) ni `lib/domain/mes.ts` (plan 07-06). Ademas
`lib/test/` no importa modulos de aplicacion, por regla ya establecida en el repo.

La salida no fue duplicar la regla y callarse: el sembrador acepta
**`sembrarPeriodoCompleto({ periodo })`**, y la capa de integracion le pasara el periodo que devuelva
Postgres. El ancla local solo es el **valor por defecto**, esta marcada con un aviso de que no es el
calendario de negocio, y dice explicitamente que si algun dia divergen, **es ese archivo el que se
ajusta**. Hay un caso de test que ejerce el parametro.

### 2. El mes anterior a secas dejaba fechas en el futuro

El primer diseno anclaba el periodo al mes anterior al de hoy. El aseo de ejecucion tardia cae en
**cierre + 3 dias**, asi que una corrida del dia 1 o 2 del mes lo habria dejado en el futuro: un
estado que el cierre real nunca produce.

Se ancla en el mes al que pertenece **hoy menos 45 dias**. No es un numero redondo: garantiza que el
mes ancla este cerrado corra cuando corra la suite, incluido el dia 1. Hay una asercion que lo
verifica en cada corrida (`ejecucionTardia < hoy`) y otra que comprueba que el periodo tiene forma de
mes (entre 25 y 32 dias), no de rango degenerado.

### 3. El festivo del 30 de junio de 2025 existe de verdad, y por eso esta en el test con fecha real

El ROADMAP excluye los festivos del calculo del cierre. Escribirlo como comentario no impide que
alguien "arregle" la funcion metiendole una libreria de dias habiles, que **introduciria** el defecto
en vez de evitarlo.

Se busco un caso real y lo hay: **el 30 de junio de 2025 es lunes Y es festivo en Colombia** (San
Pedro y San Pablo cae en domingo 29 y la ley Emiliani lo traslada al lunes siguiente), y es el ultimo
dia habil de junio. La asercion `ultimoDiaHabilDelMes('2025-06-15') === '2025-06-30'` deja la decision
escrita con una fecha que se puede verificar, no con una opinion.

## Commits

1. **Task 1: el sembrador de periodo financiero** — `8f3dfc0` (feat)
2. **Task 2: el calendario de cierre y el filtro del Resumen, en rojo** — `900b2ec` (test)
3. **Task 3: la agregacion de presentacion, en rojo** — `dcdca6f` (test)

## Desviaciones del plan

### 1. [Regla 3 — bloqueante] Tres archivos `.d.ts` de contrato, sin runtime

- **Encontrado en:** Task 3.
- **Problema:** con `finanzas.test.ts` escrito y su modulo inexistente, `npx tsc --noEmit` pasaba de
  0 errores a **21**, de los cuales **18 eran ruido en cascada** (`TS7006` de tipo implicito y
  `TS2339` sobre `{}`) derivados del unico error real. `tsc` corre en el mismo job de CI que los
  tests unitarios, asi que durante toda la fase un error de tipos **de verdad**, escrito por otro plan
  de la wave, se habria perdido dentro del ruido.
- **Que se hizo:** el plan lo previo en su bloque de verificacion (*"si el compilador se queja, se
  declara el modulo con su firma vacia solo si es imprescindible, y se anota en el SUMMARY"*). Se
  aplico en su forma **mas segura**: `lib/domain/mes.d.ts`, `periodo.d.ts` y `finanzas.d.ts`, que son
  **declaraciones puras y no existen en tiempo de ejecucion**.
- **Por que esta forma y no un modulo con el cuerpo vacio:** un `.d.ts` deja a vitest fallando con
  "no encuentro el modulo", que es el rojo limpio de la Wave 0, y **ningun codigo de aplicacion puede
  importarlo por accidente** y recibir un `undefined` silencioso ni meterlo en un bundle. Un modulo
  con funciones vacias si podria.
- **Beneficio que aparecio solo:** los tests quedan **tipados contra el contrato**, asi que un
  desajuste entre lo que el test usa y lo que 07-06 va a implementar se descubre hoy.
- **Verificacion:** `npx tsc --noEmit` vuelve a salir en **0**; `npm run test:unit` sigue rojo en los
  tres archivos por resolucion de modulo.
- **Committed en:** `dcdca6f`.

### 2. [Regla 2 — funcionalidad critica ausente] La aseadora desactivada tiene trabajo en el periodo

- **Encontrado en:** Task 1.
- **Problema:** el plan pedia "una aseadora desactivada" en el escenario. Una aseadora de baja **sin
  trabajo** no ejerce nada: el caso que duele es que se le siga debiendo el periodo que trabajo antes
  de la baja. Un calculo que filtre por aseadora activa deja a una persona sin cobrar, y el escenario
  no lo habria delatado.
- **Que se hizo:** la aseadora se desactiva **y despues** se le siembra un aseo completado dentro del
  periodo, con su asercion dedicada. Se verifico antes que ningun trigger ni CHECK lo impide.
- **Committed en:** `8f3dfc0`.

### 3. [Interpretacion declarada] Tres formatos de etiqueta que UI-SPEC no fija

- **Encontrado en:** Tasks 2.
- **Problema:** UI-SPEC §11.2 y §11.3 fijan el copy de los casos que caben en una sola tabla, pero no
  el de tres casos que ocurren de verdad y a menudo.
- **Que se decidio, y queda abierto a veto del dueño:**

  | Caso | Frecuencia real | Copy fijado |
  |---|---|---|
  | Periodo de pago que cruza el mes | **El caso normal** con D7-5 | `Del 31 de enero al 27 de febrero de 2026` |
  | Periodo de pago que cruza el año | Cada vez que diciembre acaba en fin de semana | `Del 30 de diciembre de 2028 al 31 de enero de 2029` |
  | Semana del filtro que cruza el mes | Una de cada cuatro semanas | `del 28 de septiembre al 4 de octubre` |

- **Criterio:** repetir el mes (y el año) cuando los dos extremos difieren. `del 28 al 4 de octubre`
  no significa nada. Dejarlos sin fijar habria obligado a 07-06 a adivinar.

---

**Total de desviaciones:** 3 (1 de Regla 3, 1 de Regla 2, 1 interpretacion declarada).
**Impacto:** ninguna amplia el alcance. La primera devuelve una puerta de CI a servicio, la segunda
cubre un caso que el escenario habria dejado sin ejercer, la tercera cierra huecos de copy.

## OBLIGACIONES QUE ESTE PLAN DEJA A OTROS

| Plan | Obligacion | Por que no se puede olvidar |
|---|---|---|
| **07-06** | **BORRAR `lib/domain/mes.d.ts`, `periodo.d.ts` y `finanzas.d.ts`** al crear los `.ts` de verdad | Un `.d.ts` que sobreviva a su implementacion queda como contrato paralelo que nadie mira y que **no falla al desincronizarse**. TypeScript resuelve el `.ts` primero, asi que el `.d.ts` quedaria invisible y muerto |
| **07-06** | Implementar contra los tests, no contra los planes. Si algo no cuadra, **manda el test** | Es lo que el propio 07-06 declara en su bloque de interfaces |
| **07-04 / 07-05** | Consumir `sembrarPeriodoCompleto({ periodo })` pasandole el periodo que devuelva `public.periodo_de_cierre` | Es lo que impide que el arnes se convierta en una tercera opinion sobre cuando cierra el mes |
| **07-06** | `etiquetaDePeriodoDePago` recibe `conAnio` del llamante | Decidir "si el periodo es de otro año" exige conocer hoy, y un modulo de formato que lee el reloj es una dependencia oculta |

## Compañeros de wave

Sin conflictos de archivo, verificado: `07-01` escribio solo
`supabase/tests/11_financiero.test.sql`, `07-03` solo `e2e/fixtures.ts`. Este plan toco
`lib/test/aseos.ts` y `lib/domain/`.

## Nota sobre el guardarrail de CI

El guardarrail trabaja por expresion regular sobre el codigo, no sobre el AST: un comentario que
**mencione literalmente** un token prohibido rompe la revision aunque el codigo este bien. Todos los
comentarios de este plan que explican por que algo no se usa **describen el patron en vez de escribir
el token**. `npm run ci:arch` en verde.

## Known Stubs

Tres, y los tres son declaraciones de tipo sin runtime, documentados arriba:
`lib/domain/mes.d.ts`, `lib/domain/periodo.d.ts`, `lib/domain/finanzas.d.ts`. **No entran a ningun
bundle** (no existen en tiempo de ejecucion) y **no producen ningun valor** (no hay cuerpo que
ejecutar). Los borra el plan 07-06.

## Threat Flags

Ninguno. Este plan no abre ningun endpoint, ninguna ruta de autenticacion ni ningun acceso a fichero.
Las tres entradas del registro STRIDE del plan quedan mitigadas por construccion:

| Amenaza | Mitigacion entregada |
|---|---|
| T-07-05 (cifra de huesped que llega al arbol del aseador) | Dos aserciones en `finanzas.test.ts` que recorren el arbol de claves con expresion regular; el `.d.ts` no declara ninguna. **Tercera capa: la frontera de verdad es pgTAP, y la escribe 07-01** |
| T-07-06 (total que llega como texto y se concatena) | Seis casos en `finanzas.test.ts`, incluido uno que **demuestra primero el fallo** (`'480000' + '60000'` da `48.000.060.000`) y otro que exige que el mensaje nombre el campo |
| T-07-07 (sembrador que no limpia) | La limpieza reusa los mismos tres registros y se ejerce en el bloque final de `aseos-financiero.integration.test.ts`, con control positivo y con la prueba de idempotencia |

## Self-Check: PASSED

Los nueve archivos declarados existen en disco y los tres commits existen en `git log`:

- `lib/test/aseos.ts` · `lib/test/aseos-financiero.integration.test.ts`
- `lib/domain/mes.test.ts` · `lib/domain/periodo.test.ts` · `lib/domain/finanzas.test.ts`
- `lib/domain/mes.integration.test.ts`
- `lib/domain/mes.d.ts` · `lib/domain/periodo.d.ts` · `lib/domain/finanzas.d.ts`
- `8f3dfc0` · `900b2ec` · `dcdca6f`
