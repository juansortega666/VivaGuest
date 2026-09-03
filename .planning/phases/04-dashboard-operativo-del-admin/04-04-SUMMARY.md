---
phase: 04-dashboard-operativo-del-admin
plan: 04
subsystem: ui
tags: [alertas, dominio, vitest, tdd, timezone, notifications, criterio-4]

requires:
  - phase: 03-motor-de-sincronizaci-n-ical
    provides: "lib/domain/salud-sync.ts con UMBRAL_SYNC_CAIDA_MS y estadoDeSincronizacion(), el enum notification_type y las columnas is_urgent / hora_limite de cleanings"
  - phase: 02-acceso-y-administraci-n-del-cat-logo
    provides: "lib/domain/properties.ts como patrón de módulo de dominio puro que devuelve clave y etiqueta, sin React"
provides:
  - "MAPA_DE_ALERTAS: los doce tipos del panel (once del enum más la computada urgente) con icono y etiqueta, homogéneos por construcción"
  - "presentacionDeAlerta(): resolución con fallback Bell/AVISO que nunca descarta una fila"
  - "venceEnMs(): el instante de vencimiento de la hora límite, sin dependencia de la zona del proceso"
  - "alertasComputadas(): las tres alertas que no son filas de notifications (urgente, hora límite vencida, calendario caído global)"
  - "mezclarAlertas(): la lista plana cronológica descendente con deduplicación"
  - "conteosPorTipo(): la lista del filtro en orden fijo, con los ceros incluidos"
  - "Test espejo de UMBRAL_SYNC_CAIDA_MS contra el interval '3 hours' del watchdog"
affects: [04-13 panel de alertas, 04-12 pantalla de operación, 05-notificaciones, 06-pwa-del-aseador]

tech-stack:
  added: []
  patterns:
    - "Módulo de dominio puro que devuelve NOMBRES de icono lucide, nunca componentes: lib/domain/ no importa React"
    - "Homogeneidad visual impuesta por una constante compartida (HOMOGENEO) y verificada por una aserción que recorre el mapa entero"
    - "Record sobre el enum generado: un valor nuevo en notification_type rompe la compilación"
    - "Desfase -05:00 explícito para convertir date + time de negocio a instante, igual que la normalización de +00 de salud-sync"
    - "Umbral acoplado entre TypeScript y SQL con una prueba en cada lado que cita a la otra"

key-files:
  created:
    - lib/domain/alertas.ts
    - lib/domain/alertas.test.ts
    - .planning/phases/04-dashboard-operativo-del-admin/deferred-items.md
  modified:
    - lib/domain/salud-sync.test.ts

key-decisions:
  - "El mapa cubre los doce tipos y no los siete del UI-SPEC §11.1: aseo_cancelado es hoy el que más filas produce y sin entrada se caía del panel"
  - "Bell amplía la lista cerrada de iconos del UI-SPEC §17.3, porque el fallback genérico necesita uno y no lo hay"
  - "El vencimiento de la hora límite sale de cleanings.hora_limite, no de properties.hora_limite: el UI-SPEC §11.2 dice lo contrario y es un error del contrato"
  - "La alerta global de calendario caído lleva url /apartamentos, que es donde se arreglan los feeds (D-08)"
  - "Copy nuevo para las dos computadas por aseo, que el contrato de copywriting no cubría"
  - "atendible distingue procedencia del dato, no importancia: es la única diferencia entre las dos mitades de la lista"

patterns-established:
  - "Aserción de homogeneidad por cardinalidad: recorrer el mapa entero y afirmar que el conjunto de valores distintos de cada atributo visual tiene tamaño 1, en vez de comprobar entradas concretas"
  - "Aserción de ausencia de propiedad: comprobar por nombre que el mapa no expone severidad, prioridad ni orden, para que un comentario no sea la única defensa"
  - "Fixture que aísla el predicado: si dos condiciones se solapan en los datos reales, se siembra una fila que las separa, porque si no el señuelo pasa en verde"

requirements-completed: [DASH-04, DASH-05]

duration: 62min
completed: 2026-09-03
---

# Fase 4 Plan 04: El motor del panel de alertas

**Mapa de doce tipos homogéneo por construcción, las tres alertas computadas al leer (urgente, hora límite vencida y caída global del sync) y la mezcla cronológica con deduplicación, todo en `lib/domain/alertas.ts` con 41 aserciones y seis señuelos corridos en rojo.**

## Performance

- **Duración:** 62 min
- **Tareas:** 3 de 3
- **Archivos tocados:** 4 (2 creados de código, 1 modificado, 1 de registro)
- **Tests:** 41 nuevos en `alertas.test.ts`, 1 nuevo en `salud-sync.test.ts`. Suite completa: 434 en verde.

## Logros

- **El criterio 4 del ROADMAP queda defendido por tests, no por comentarios.** La aserción central recorre el mapa entero y afirma que el conjunto de valores distintos de `claseIcono`, `claseEtiqueta` y `tamanoIcono` tiene cardinalidad 1. Pintar de rojo el tipo urgente la pone roja sola, sin que nadie tenga que acordarse de añadir un caso.
- **El orden se compara contra la secuencia exacta de ids**, con los instantes entrelazados a propósito entre alertas persistidas y computadas. Un booleano tipo "está ordenado" habría pasado con cualquier orden total; esta secuencia solo pasa con el cronológico descendente.
- **Ninguna fila se cae del panel por tipo desconocido.** El fallback `Bell` / `AVISO` está probado en la resolución y en la mezcla, que es donde de verdad importa.
- **El umbral de sync tiene prueba en los dos lenguajes.** El lado TypeScript queda cerrado acá; el lado SQL lo cierra la aserción sobre `pg_get_functiondef` del plan 04-01, y cada comentario cita al otro.

## Commits por tarea

TDD estricto: cada tarea son dos commits, RED y GREEN. Ninguna necesitó REFACTOR aparte.

1. **Tarea 1: el mapa de los once tipos, con fallback**
   - `5393f5a` (test) — RED
   - `035e482` (feat) — GREEN
2. **Tarea 2: las tres alertas computadas y `venceEnMs()`**
   - `6a29025` (test) — RED
   - `7032477` (feat) — GREEN
3. **Tarea 3: mezcla, orden, deduplicación, conteos y el espejo del umbral**
   - `071c08c` (test) — RED
   - `f3b9419` (feat) — GREEN

## Archivos

- `lib/domain/alertas.ts` (674 líneas) — el motor entero: `TIPOS_DE_NOTIFICACION`, `MAPA_DE_ALERTAS`, `PRESENTACION_GENERICA`, `ORDEN_DE_TIPOS`, `presentacionDeAlerta()`, `venceEnMs()`, `alertasComputadas()`, `mezclarAlertas()`, `conteosPorTipo()`.
- `lib/domain/alertas.test.ts` (871 líneas) — 41 aserciones.
- `lib/domain/salud-sync.test.ts` — extendido, no reescrito: un `describe` nuevo con el test espejo del umbral. Los 9 tests de la Fase 3 siguen intactos y en verde.
- `.planning/phases/04-dashboard-operativo-del-admin/deferred-items.md` — registro de tres errores de lint preexistentes de la Fase 2.

## Los seis señuelos, corridos

Todos se aplicaron sobre el código real, se corrió la suite, se anotó el fallo y se restauró.

| # | Señuelo | Resultado |
|---|---|---|
| 1 | `claseIcono: 'text-destructive'` en la entrada `urgente` | 🔴 `expected 2 to be 1` en la aserción de homogeneidad |
| 2 | Quitar el `??` del fallback (tipo desconocido devuelve `undefined`) | 🔴 2 tests, incluido el de "nunca devuelve undefined" |
| 3 | Borrar la entrada `retencion_proxima` del mapa | 🔴 3 tests **y** `tsc` (`TS2741: Property 'retencion_proxima' is missing`) |
| 4 | Quitar `is_managed` del predicado de las computadas | 🔴 2 tests (ver la desviación 1: la primera pasada salió en verde) |
| 5 | Cambiar el desfase `-05:00` por `Z` en `venceEnMs` | 🔴 4 tests, incluido el de la fila dentro de la franja de cinco horas |
| 6 | Ordenar la mezcla por tipo antes que por instante | 🔴 2 tests, con la secuencia exacta de ids en el mensaje |

## Decisiones

- **El mapa cubre los doce tipos, no los siete del contrato.** Medido con grep sobre las migraciones el 2026-09-03: `aseo_cancelado` tiene cuatro productores en la migración 13 (líneas 949, 971, 993, 1015) y es el que más filas emite en operación normal; `calendario_caido` tiene cinco. Sin entrada, esas filas se caían del panel o salían sin rótulo. Es una adición al contrato de diseño y no toca el criterio 4: no cambia color, ni tamaño, ni orden.
- **El vencimiento de la hora límite sale de `cleanings.hora_limite`.** El UI-SPEC §11.2 dice `properties.hora_limite` y es un error del contrato: APTO-05 permite pactar hora distinta para un aseo puntual y el `coalesce` del trigger de la migración 13 la guarda como snapshot. El tipo `AseoParaAlertas` declara `apartamentoHoraLimite` a propósito **sin usarlo**, para que el señuelo de cambiar la fuente sea posible y el test lo atrape en las dos direcciones.
- **`hora_limite_vencida` es obligatoriamente computada.** No hay decisión que tomar: el valor del enum existe y nada lo escribe en ninguna migración. La deduplicación se escribe igual porque es barata y la Fase 5 o la 9 pueden añadir el productor, pero **hoy no puede activarse nunca**, y el test lo dice en su propio nombre para que nadie crea que prueba un caso real.
- **`read_at` no entra al `Pick` de la notificación.** El panel no lo usa como "leída": cualquier tratamiento de leído/no leído reintroduce la jerarquía que el criterio 4 prohíbe. `mezclarAlertas` recibe las notificaciones ya filtradas por el consumidor. Qué se muestra es del consumidor; cómo se ordena es de este módulo.
- **`atendible` sigue la procedencia del dato, no la importancia.** Entre las computadas están urgente y hora límite vencida, las dos que más cuestan si se pierden, y ninguna lleva botón de atender. Un botón ahí mentiría: la alerta reaparecería en la siguiente lectura porque es un estado derivado, no un evento.
- **Desempate por id a igual instante.** Una corrida del sync inserta en ráfaga y varias filas comparten segundo. Sin desempate, el orden dependería de la implementación de `sort` y la lista bailaría entre renders sin que nada cambie.

## Desviaciones del plan

### 1. [Regla 1 - Bug] La fixture de gestión externa no aislaba `is_managed`, y el señuelo 4 pasó en verde

- **Encontrado en:** Tarea 2, al correr el señuelo que el plan exige.
- **Problema:** la fila sembrada de gestión externa tenía `is_managed: false` **y** `state: null`, que es como la escribe la base por el CHECK `cl_unmanaged_is_inert`. Con `state` nulo, el filtro de estado ya descartaba la fila, así que `is_managed` era redundante: quitarlo del predicado dejó los 27 tests en verde. El señuelo del plan no medía nada.
- **Arreglo:** se añadió una fila `externa-con-estado-vivo` con `is_managed: false` y `state: 'pendiente'` a la vez, combinación que el CHECK de la base prohíbe y que se siembra a mano a propósito. `is_managed` expresa la regla de negocio ("VivaGuest no opera esta unidad") y no puede depender de que un CHECK en otra capa la mantenga verdadera por casualidad, sobre todo porque el panel también construye filas en memoria (estado optimista, Realtime), donde no hay CHECK. Se hizo lo mismo en el test de hora límite, que tenía la misma debilidad.
- **Archivos:** `lib/domain/alertas.test.ts`
- **Verificación:** con la fixture corregida, el señuelo 4 sale rojo en 2 tests con los ids exactos que se colaron.
- **Commiteado en:** `7032477`

### 2. [Regla 2 - Falta funcionalidad crítica] Copy de las dos alertas computadas por aseo

- **Encontrado en:** Tarea 2.
- **Problema:** el UI-SPEC §18 no da título para las alertas `urgente` ni `hora_limite_vencida`. Las notificaciones traen su `title` redactado desde la base, pero las computadas no tienen fila, y sin título la línea 2 de la fila se renderiza vacía.
- **Arreglo:** se redactó siguiendo el vocabulario fijo de §18.4 (`is_urgent` → "entra huésped el mismo día"): `Entra huésped el mismo día.` y `La hora límite de las {HH:MM} pasó y el aseo no ha terminado.` Sin signos de admiración, sin disculpas, imperativo cuando aplica.
- **Archivos:** `lib/domain/alertas.ts`
- **Commiteado en:** `7032477`

### 3. [Regla 2 - Falta funcionalidad crítica] `url` de la caída global, e id sintético para las computadas

- **Encontrado en:** Tarea 2.
- **Problema:** D-08 exige que toda alerta lleve a algún sitio en un clic, y el contrato no dice a dónde lleva la caída global, que no tiene ni aseo ni apartamento. Además las computadas no tienen `id` de fila y React necesita una `key` estable.
- **Arreglo:** `url: '/apartamentos'` para la global (es la ruta que ya existe desde la Fase 2 y donde se ven y arreglan los feeds). Ids sintéticos `urgente:{id}`, `hora_limite_vencida:{id}` y `calendario_caido:sistema`.
- **Archivos:** `lib/domain/alertas.ts`
- **Commiteado en:** `7032477`

### 4. [Regla 2 - Falta funcionalidad crítica] `maxUltimoExito` nulo producía un instante `NaN`

- **Encontrado en:** Tarea 2.
- **Problema:** con `max(last_success_at)` nulo (despliegue nuevo cuyo scheduler nunca corrió) `estadoDeSincronizacion` devuelve `caida`, pero `null + UMBRAL` habría dado `NaN`. Una alerta con instante `NaN` cae en un sitio arbitrario del orden, porque toda comparación con `NaN` es `false`.
- **Arreglo:** con la marca nula o ilegible, el instante es `ahoraMs`. El hecho es "ahora mismo", que es lo cierto. Hay aserción explícita de que no es `NaN`.
- **Archivos:** `lib/domain/alertas.ts`
- **Commiteado en:** `7032477`

### 5. [Adición al contrato de diseño] `Bell` amplía la lista cerrada de iconos

- **Encontrado en:** Tarea 1.
- **Problema:** el plan y el research mandan `Bell` como icono del fallback, pero `Bell` no está en ninguna de las dos listas del UI-SPEC §17.3, y ese documento dice literalmente que añadir un icono fuera de ellas es una modificación del contrato.
- **Arreglo:** se añade con su razón escrita en el tipo `IconoDeAlerta`. **No es una excepción a la regla de color**: va en el mismo `--status-warn` y al mismo tamaño, así que no jerarquiza nada. Sin él, un tipo desconocido saldría sin icono o desaparecería.
- **Nota para el `gsd-ui-checker`:** también se usan `CircleSlash` (`aseo_cancelado`), `CircleCheck` (`aseo_completado`), `UserRoundCog` (`asignacion`) e `History` (`retencion_proxima`), los cuatro **sí** dentro de la lista cerrada. `gasto_reportado` se queda con `Bell` a propósito: no hay ningún icono de dinero en la lista y su productor no existe hasta la Fase 6, que es cuando el contrato le asignará silueta propia. Inventar uno ahora sería modificar el contrato a ciegas.
- **Archivos:** `lib/domain/alertas.ts`
- **Commiteado en:** `035e482`

---

**Total de desviaciones:** 5 (1 bug en un test, 3 de funcionalidad crítica faltante, 1 adición al contrato de diseño).
**Impacto:** ninguna toca la jerarquía visual, el color, el tamaño ni el orden. La 1 hace que el plan pruebe lo que dice probar; las 2 a 4 son huecos que habrían dado filas vacías o un orden roto en pantalla; la 5 está declarada para que el checker de UI la vea.

## Cumplimiento de las puertas TDD

Las tres tareas siguieron RED → GREEN con commit en cada puerta, verificable en `git log`:

- Tarea 1: `test` `5393f5a` → `feat` `035e482`
- Tarea 2: `test` `6a29025` → `feat` `7032477`
- Tarea 3: `test` `071c08c` → `feat` `f3b9419`

Ningún test pasó inesperadamente en la fase RED: las tres veces el fallo fue `Cannot find module` o `X is not a function`, o sea la ausencia real de la implementación.

## Verificación

| Comprobación | Resultado |
|---|---|
| `npm run test:unit` (suite completa) | ✅ 434 tests, 25 archivos |
| `npm run test:unit -- lib/domain/alertas.test.ts` | ✅ 41 tests |
| `lib/domain/salud-sync.test.ts` sigue en verde | ✅ 10 tests (9 de la Fase 3 + el espejo) |
| `npx tsc --noEmit` | ✅ sin errores |
| `npm run ci:arch` | ✅ `check-service-role: OK` |
| Los seis señuelos | ✅ los seis en rojo, anotados arriba |
| `.planning/STATE.md` y `ROADMAP.md` sin tocar | ✅ |

No se corrió `db:reset`, `db:test` ni ningún test de integración: este plan es dominio puro y el stack local lo tiene reservado el plan 04-01 en esta wave.

## Stubs conocidos

Ninguno. Las nueve exportaciones tienen implementación real y test.

Lo que **sí** hay, declarado y no tapado, es una regla que hoy no puede dispararse: la deduplicación de `hora_limite_vencida`. Ninguna migración escribe ese tipo, así que el camino solo se ejercita con la fila sembrada a mano del test. No es un stub (el código es real y correcto), es una regla escrita antes que su productor, y está dicho en el comentario y en el nombre del test.

## Banderas de amenaza

Ninguna superficie de seguridad nueva. El módulo es puro, no abre rutas de lectura, no toca la base y no instala paquetes. `T-04-10` (XSS) queda mitigado por construcción: `mezclarAlertas` devuelve strings planos y copia `title` y `body` tal como vienen de las funciones de la base, que es la única fuente posible porque `notifications` no tiene policy ni grant de INSERT para nadie. `T-04-12` queda mitigado porque el mapa **no** consume `payload.motivo` ni ningún campo libre del `payload` para variar la presentación.

## Lo que queda listo para el plan 04-13

El componente del panel solo tiene que pintar lo que estas funciones devuelven:

- `mezclarAlertas(notificaciones, alertasComputadas({...}))` da la lista ya ordenada.
- `presentacionDeAlerta(alerta.clave)` da nombre de icono, etiqueta y las tres clases, que son iguales para todos.
- `conteosPorTipo(alertas)` da la lista del filtro, de longitud fija.
- `alerta.atendible` dice si se renderiza el botón de atender. **La ranura de 32px se reserva igual en los dos casos** (§11.3): si no, el punto de truncado baila de fila en fila y eso sí sería una diferencia visual entre tipos.

Lo que el componente **no** puede hacer: variar color, tamaño o peso por tipo, reordenar por severidad, ni atenuar las leídas.

## Self-Check: PASSED

- `lib/domain/alertas.ts` — ENCONTRADO
- `lib/domain/alertas.test.ts` — ENCONTRADO
- `lib/domain/salud-sync.test.ts` — ENCONTRADO (modificado)
- `.planning/phases/04-dashboard-operativo-del-admin/deferred-items.md` — ENCONTRADO
- Commits `5393f5a`, `035e482`, `6a29025`, `7032477`, `071c08c`, `f3b9419` — los seis en `git log`

---
*Fase: 04-dashboard-operativo-del-admin*
*Plan: 04*
*Completado: 2026-09-03*
