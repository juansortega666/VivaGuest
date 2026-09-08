---
phase: 04-dashboard-operativo-del-admin
plan: 03
subsystem: ui
tags: [dominio, estado-aseo, fechas, timezone, bogota, errores, constraints, tdd, vitest]

requires:
  - phase: 01-fundaciones-de-datos-y-seguridad
    provides: "cleanings con is_managed, state, confirmado_at; los CHECK cl_unmanaged_is_inert y cl_managed_has_state; el indice parcial cleanings_one_active_per_property_date"
  - phase: 02-acceso-y-administracion-del-catalogo
    provides: "el patron de estadoDeApartamento() en lib/domain/properties.ts, lib/domain/dates.ts con sus cuatro funciones, lib/domain/errors.ts con MENSAJES_UNIQUE y CAMPOS_POR_CONSTRAINT, y los nombres de constraint de lib/domain/constants.ts"
  - phase: 03-motor-de-sincronizacion-ical
    provides: "los slugs literales de cancel_reason y review_reason que emiten las migraciones 12 y 13"
provides:
  - "lib/domain/cleanings.ts: estadoDeAseo(), la unica derivacion de los seis estados visibles de un aseo"
  - "copyDeCancelReason() y copyDeReviewReason(): los dos mapas de slug a copy, con caida a generico y sin respaldo al slug crudo"
  - "formatFechaCortaBog(): la fecha de 176px de la bandeja, '3 sep'"
  - "tiempoRelativo(): los cinco escalones de la linea de frescura, con el corte de 'ayer' por dia calendario de Bogota"
  - "campoDeConstraint() devuelve 'fecha' para el indice de ASEO-07, que es lo que abre la ruta inline"
affects: [04-08, 04-09, 04-10, 04-11, 04-12, 04-13]

tech-stack:
  added: []
  patterns:
    - "El discriminante de estado devuelve NOMBRE de icono y CLASE de Tailwind, no el componente de lucide ni el token CSS crudo: lib/domain/ no importa React y el consumidor no traduce"
    - "IconoEstadoAseo es una union de literales, no string: la lista cerrada de iconos se rompe en tsc y no en el navegador"
    - "Switch exhaustivo sobre el enum de Postgres SIN rama por defecto: anadir un valor al enum rompe con TS2366 en vez de renderizarse como lo que el default eligiera"
    - "Una fila que viola un CHECK de la base lanza en vez de recibir una clave inventada: un badge que miente sobre un aseo es peor que una pantalla que se cae"
    - "Los mapas de slug a copy NUNCA llevan respaldo `MAPA[slug] ?? slug`, y hay un test que lo prohibe explicitamente"
    - "La abreviatura de mes sale de una tabla explicita, no de Intl: Intl en es-CO devuelve '3 de sept' y ademas la abreviatura depende de la version de ICU del runtime"
    - "El corte de 'ayer' compara el dia calendario de Bogota de los dos instantes, no resta 24 horas"

key-files:
  created:
    - lib/domain/cleanings.ts
    - lib/domain/cleanings.test.ts
    - .planning/phases/04-dashboard-operativo-del-admin/04-03-SUMMARY.md
  modified:
    - lib/domain/dates.ts
    - lib/domain/dates.test.ts
    - lib/domain/errors.ts
    - lib/domain/errors.test.ts

key-decisions:
  - "EstadoAseo SI lleva icono y color, a diferencia de EstadoApartamento de la Fase 2. No es incoherencia: alli habia un consumidor y aqui hay cuatro (planes 04-09 a 04-12), y repartir la misma tabla de seis pares icono/color entre cuatro componentes es la misma duplicacion que la funcion existe para evitar"
  - "Una fila gestionada con state nulo LANZA. Es inalcanzable por cl_managed_has_state, y es lo que hace medible el senuelo del orden de evaluacion: si la guarda de is_managed se mueve debajo del switch, la fila externa cae ahi y el test se pone rojo"
  - "formatFechaCortaBog NO usa Intl. Medido el 2026-09-03: Intl.DateTimeFormat('es-CO', {day:'numeric', month:'short'}) devuelve '3 de sept', con el literal ' de ' y con sept de cuatro letras. El contrato pide '3 sep'. Ademas la abreviatura la fija la version de ICU del runtime, asi que Vercel, el CI y el portatil podrian no coincidir"
  - "tiempoRelativo tiene un escalon de segundos ('hace 40 s') que el plan no listaba. Sale de UI-SPEC §13.2, que lo muestra literal en la linea de realtime desconectado"
  - "Los escalones de minutos y segundos ganan al corte de dia: algo de hace 30 segundos que cruzo la medianoche dice 'hace 30 s', no 'ayer 23:59'. Es la linea de la cabecera de §13.1, y ahi el dato util es la frescura, no el dia"
  - "tiempoRelativo acepta cadena ISO ademas de numero: es como PostgREST devuelve un timestamptz, y forzar al consumidor a hacer Date.parse fuera es donde reaparece el parseo a mano"
  - "mapDbError NO cambia de mensaje para el 23505 de ASEO-07. Es una funcion pura de mapeo: no conoce el nombre del apartamento ni la fecha y no debe conocerlos. La version interpolada la construye el Server Action del plan 04-08"

patterns-established:
  - "Senuelo corrido y anotado: toda regla de orden o de zona se rompe a proposito, se mide el rojo y se restaura"
  - "El diff de un archivo heredado se comprueba con git diff --stat: 156 inserciones y 0 borrados prueba que las cuatro funciones de dates.ts no se tocaron"

requirements-completed: [ASEO-01, ASEO-07, DASH-01, DASH-07]

duration: 12min
completed: 2026-09-03
---

# Fase 4 Plan 03: Lógica de dominio de la fila de aseo, Resumen

**Los seis estados visibles de un aseo se derivan en un solo sitio, la fecha corta y el tiempo relativo dejan de depender de la zona del proceso, y el 23505 de ASEO-07 gana campo para poder salir inline bajo la fecha.**

## Performance

- **Duración:** 12 min
- **Empezó:** 2026-09-03T21:50:00Z
- **Terminó:** 2026-09-03T22:02:01Z
- **Tareas:** 3 de 3
- **Archivos tocados:** 6 (2 creados, 4 modificados)

## Lo que quedó hecho

- `estadoDeAseo()` es el único sitio del repo donde se decide qué estado ve el admin en una fila. Devuelve clave, nombre de icono, etiqueta y clase de Tailwind, y su `switch` sobre `cleaning_state` va sin rama por defecto.
- `copyDeCancelReason()` y `copyDeReviewReason()` traducen los 3 y 6 slugs conocidos y caen a copy genérico ante cualquier otro. Hay un test que prohíbe explícitamente que el slug de entrada aparezca dentro de la salida (T-04-12).
- `formatFechaCortaBog()` y `tiempoRelativo()` añadidas a `lib/domain/dates.ts` sin tocar un carácter de las cuatro que ya tenía.
- `CAMPOS_POR_CONSTRAINT` gana la entrada `[IDX_ONE_ACTIVE_PER_PROPERTY_DATE, 'fecha']`, que es lo único que faltaba para que el error de ASEO-07 vaya inline en vez de a toast.

## Commits por tarea

Ciclo TDD completo en las tres, con el commit rojo antes del verde:

1. **Tarea 1 RED** — `6089f11` (test)
2. **Tarea 1 GREEN** — `0dc0556` (feat)
3. **Tarea 2 RED** — `7850b1b` (test)
4. **Tarea 2 GREEN** — `33c198f` (feat)
5. **Tarea 3 RED** — `e0aaeef` (test)
6. **Tarea 3 GREEN** — `19b78fe` (feat)

No hubo commit de refactor: los tres verdes salieron limpios y no había nada que limpiar.

## Los tres señuelos, corridos y medidos

El plan exigía dos. Se corrió un tercero porque el primero no cubría la regla completa.

### 1. Orden de evaluación en `estadoDeAseo()` — ROJO

Se movió la guarda de `is_managed` debajo del `switch`, dejando que `state` decidiera primero.

```
× externa: is_managed=false gana sobre todo lo demas
× senuelo: una fila externa nunca cae en una rama de state
× las seis claves son distintas entre si
Tests  3 failed | 15 passed (18)
```

Nota sobre el diseño: para que este señuelo pudiera salir rojo, la rama de `state === null` tenía que hacer algo distinto de devolver `'externa'`. Si el `case null` devolviera `'externa'`, invertir el orden seguiría dando el resultado correcto por accidente y el señuelo mediría nada. Por eso esa rama lanza. Es inalcanzable en producción por `cl_managed_has_state` (`not is_managed or state is not null`).

### 2. Desfase explícito en el test de `tiempoRelativo` — ROJO

Se sustituyó `-05:00` por `Z` en las dos marcas del caso de la frontera.

```
× senuelo: la frontera de `ayer` es la medianoche de Bogota, no la de UTC
AssertionError: expected 'ayer 18:30' to be 'ayer 23:30'
Tests  1 failed | 30 passed (31)
```

### 3. Resta de 24 horas en vez de comparación de día calendario — ROJO

Señuelo añadido: es la regla que el plan señala como la trampa real, y el señuelo 2 solo mide las marcas del test, no la implementación. Se sustituyó `diaDelInstante === diaAnterior(diaDeAhora)` por `transcurrido < 24 * UNA_HORA`.

```
× el dia calendario ANTERIOR de Bogota dice `ayer` con la hora de Bogota
AssertionError: expected '2 sep 14:20' to be 'ayer 14:20'
Tests  1 failed | 30 passed (31)
```

Los tres se restauraron y la suite volvió a verde antes de commitear.

## Mediciones que cambiaron una decisión

**`Intl` no puede producir `3 sep` en es-CO.** Medido contra el Node del repo:

| Locale | Salida para `2026-09-03` |
|---|---|
| `es-CO` | `3 de sept` |
| `es` | `3 sept` |

El contrato de UI-SPEC §9 pide `3 sep`, que no es ninguna de las dos: sobra el literal ` de ` y sobra la cuarta letra de `sept`. Por eso la tabla de doce meses es explícita. La segunda razón es más de fondo: la abreviatura la fija la versión de ICU del runtime, y una fecha que cambia de forma según dónde corra el proceso es la misma clase de dependencia oculta que el resto de `dates.ts` existe para evitar. Hay un test que fija los doce meses y otro que afirma que septiembre no contiene `sept`.

**`hour12: false` en es-CO da ciclo h23.** Medido: medianoche de Bogotá sale `00:00`, no `24:00`. Sin esa medición habría hecho falta un caso especial que resulta innecesario.

## Desviaciones del plan

### 1. [Regla 2 - Funcionalidad crítica] `tiempoRelativo` tiene un escalón de segundos

- **Encontrado en:** Tarea 2
- **Qué pasaba:** el `<behavior>` del plan lista cuatro escalones y el más corto es `hace 8 min`. Con solo esos, algo de hace 30 segundos rendería `hace 0 min`.
- **Qué se hizo:** se añadió el escalón `hace 40 s` bajo el minuto. No es invención: UI-SPEC §13.2 lo muestra literal en la fila de "Realtime desconectado" (`Sin conexión en vivo. Actualizado hace 40 s (14:32).`).
- **Archivos:** `lib/domain/dates.ts`, `lib/domain/dates.test.ts`
- **Commit:** `33c198f`

### 2. [Regla 3 - Bloqueo] `formatFechaCortaBog` no usa `Intl`

- **Encontrado en:** Tarea 2
- **Qué pasaba:** el `<action>` del plan dice implementarla "con la MISMA técnica que ya usa `formatFechaBog`", es decir `Date.UTC` + `Intl` con `timeZone: 'UTC'`. Esa técnica devuelve `3 de sept`, que no es el `3 sep` del contrato.
- **Qué se hizo:** se conservó lo esencial de la técnica (partir el string, prohibido `new Date('2026-09-03')`) y se cambió el formateo por una tabla explícita de doce abreviaturas. La función ni siquiera construye un `Date`, así que no puede depender de la zona del proceso ni por accidente.
- **Archivos:** `lib/domain/dates.ts`
- **Commit:** `33c198f`

### 3. [Diseño dentro del plan] La rama imposible de `estadoDeAseo` lanza

Ya explicado arriba, en el señuelo 1. No es una desviación del contrato (el plan pide que el señuelo salga rojo), pero es la decisión menos obvia del plan y merece quedar escrita.

### 4. El plan describe `hora_limite` como anulable

El `<context>` del plan lista `hora_limite string|null`. En `lib/database.types.ts` es `string` no anulable, y en la migración 04 es `hora_limite time not null`. No afectó a nada: esta columna no entra en el `Pick` de `EntradaEstadoAseo`. Se anota para el plan que calcule el vencimiento, que además debe leerla de `cleanings` y no de `properties` (APTO-05: el snapshot permite una hora pactada distinta para un aseo puntual).

## Verificación

| Comprobación | Resultado |
|---|---|
| `npm run test:unit` | 433 pasan, 25 archivos |
| Unitarios heredados | 392 antes, 433 ahora: +18 de `cleanings`, +16 de `dates`, +7 de `errors` |
| `npx tsc --noEmit` | sin salida |
| `npm run ci:arch` | `check-service-role: OK` |
| `npx eslint` sobre los 4 archivos tocados | sin salida |
| `git diff --stat` de `dates.ts` | 156 inserciones, 0 borrados: las cuatro heredadas intactas |
| `lib/domain/` no importa React ni `lib/supabase/admin.ts` | verificado por grep en los tres archivos |

## Contrato que hereda quien consuma esto

```ts
estadoDeAseo(c: EntradaEstadoAseo): {
  clave: 'sin_confirmar' | 'pendiente' | 'en_curso' | 'terminado' | 'cancelado' | 'externa';
  icono: 'Inbox' | 'Clock' | 'Play' | 'CircleCheck' | 'CircleSlash' | 'CircleDashed';
  etiqueta: string;   // 'Sin confirmar' | 'Pendiente' | 'En curso' | 'Terminado' | 'Cancelado' | 'Gestión externa'
  clase: string;      // 'text-status-warn' | 'text-status-idle' | 'text-status-progress' | 'text-status-ok' | 'text-muted-foreground' | 'text-status-info'
}
copyDeCancelReason(slug: string | null | undefined): string
copyDeReviewReason(slug: string | null | undefined): string

formatFechaCortaBog(iso: string): string                                   // '2026-09-03' -> '3 sep'
tiempoRelativo(instante: number | string | null | undefined, ahoraMs: number): string | null
```

`EntradaEstadoAseo` es `Pick<Tables<'cleanings'>, 'is_managed' | 'state' | 'confirmado_at'>`: tres columnas, no la fila entera. Es lo que permite llamarla con la fila embebida de una alerta.

`clase` es `text-status-progress` para `en_curso`, y ese token lo crea el plan 04-02. Si 04-02 no aterriza, el estado "En curso" sale sin color y con la etiqueta correcta, que es el modo de fallo aceptable.

## Deuda que queda para otro

- `npm run lint` falla con 3 errores de `react-hooks/rules-of-hooks` en `e2e/fixtures.ts` (`paginaAdmin`, `paginaAseador`, `paginaAseador2`) y 1 warning en `lib/domain/aseador.schema.test.ts`. Es PREEXISTENTE al commit base `46f98d0` y no lo tocó este plan. `npx eslint` sobre los cuatro archivos de este plan sale limpio. Fuera de alcance por la regla de frontera: no se arregló.

## Threat Flags

Ninguna. Este plan no añade ninguna ruta, ningún endpoint ni ningún acceso a datos: son cuatro funciones puras y una entrada en una tabla de mapeo. Las dos mitigaciones que el plan le asigna quedan implementadas:

- **T-04-07b** — `mapDbError` no cambió. Sigue devolviendo `message` crudo solo para `P0001`, que viene redactado en español desde la RPC. Hay un test nuevo que afirma que el mensaje de ASEO-07 no contiene ni el nombre del índice, ni `duplicate key`, ni `23505`.
- **T-04-12** — los dos mapas de slug caen a genérico y no llevan respaldo al slug crudo. Dos tests lo fijan pasándoles slugs inventados y payloads con forma de inyección, y afirmando que la salida no los contiene.

## Known Stubs

Ninguno. Las cuatro funciones están completas y con datos reales; no hay valores fijos que fluyan a la UI.

## Self-Check: PASSED

- `lib/domain/cleanings.ts` — FOUND
- `lib/domain/cleanings.test.ts` — FOUND
- `lib/domain/dates.ts` — FOUND
- `lib/domain/errors.ts` — FOUND
- Commits `6089f11`, `0dc0556`, `7850b1b`, `33c198f`, `e0aaeef`, `19b78fe` — los seis en `git log`
