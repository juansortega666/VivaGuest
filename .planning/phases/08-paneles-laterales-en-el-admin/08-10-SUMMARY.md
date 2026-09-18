---
phase: 08-paneles-laterales-en-el-admin
plan: 10
subsystem: ui
tags: [panel, sheet, searchparams, calendario, checkouts, ical, fechas, timezone, rsc, suspense]

requires:
  - phase: 01-cimientos
    provides: "calendar_reservations con ends_on documentado como la fecha del aseo, el indice parcial cal_res_prop_end_idx, y el CHECK que deja nula la columna de texto crudo del proveedor"
  - phase: 02-acceso-y-administraci-n-del-cat-logo
    provides: "leerFeedDeApartamento() y FeedDeApartamento; la pantalla de conexion de APTO-12 con sus siete estados, que este plan NO toca; y MenuApartamento con la distincion conectar/cambiar"
  - phase: 07-finanzas
    provides: "lib/domain/dates.ts entero, con su doctrina de anclar en UTC sobre componentes ya partidos y la tabla explicita de meses cortos que este plan replica para los dias"
  - phase: 08-paneles-laterales-en-el-admin
    provides: "08-03: proximoCheckout, checkoutsDelMes, distanciaHastaCheckout y saludDelFeed, ya probados. 08-04: PanelLectura, GrupoDePanel, FilaDeDato y EsqueletoDePanel. 08-06: lib/data/panel-apartamento.ts con su alcance declarado, la pagina anfitriona y el boton Calendario del pie de la ficha"
provides:
  - "PanelCalendario: la vista de §8, con sus tres grupos, su pie y el chevron de volver en sus dos ramas"
  - "leerCheckoutsDelMes(): las fechas de fin del mes corriente, sin migracion y sin que ningun dato del huesped entre en la proyeccion"
  - "formatDiaCortoBog() y formatSincronizacionBog(): las dos formas de fecha que §8.2 pedia y que no existian en ningun sitio"
  - "/apartamentos?apartamento={uuid}&vista=calendario: el segundo parametro de la pantalla, con union cerrada"
  - "La prueba de que el conflicto A se resolvio como el UI-SPEC decidio: calendario.spec.ts en 7/7 sin que el spec haya cambiado una linea"
affects: [08-11, 08-12, 08-13, 08-14]

tech-stack:
  added: []
  patterns:
    - "Un panel de cliente que consume una promesa del servidor con `use()` detras de su propia barrera de suspension: la lectura sigue siendo del RSC y el cuerpo sigue teniendo esqueleto, sin que el archivo deje de ser de cliente"
    - "El dia de negocio se lee UNA VEZ en el servidor y baja como prop: con el reloj del navegador el panel se hidrataria con un `hoy` distinto del que se renderizo"
    - "Detectar si hubo navegacion de cliente comparando la direccion con la que se cargo el DOCUMENTO contra la actual, en vez de contar entradas de historial"
    - "Dos vistas del mismo panel en un solo hueco de la pagina y con la MISMA clave: cambiar de cuerpo no es abrir otro panel"

key-files:
  created:
    - app/(admin)/apartamentos/_components/PanelCalendario.tsx
  modified:
    - lib/data/panel-apartamento.ts
    - lib/domain/dates.ts
    - lib/domain/dates.test.ts
    - app/(admin)/apartamentos/page.tsx
  deleted: []

key-decisions:
  - "PanelCalendario.tsx es de CLIENTE, y es por el chevron. §8.2 pide dos ramas de navegacion y las dos necesitan el enrutador; partirlo en dos archivos habria dejado el `scroll={false}` de la sexta ocurrencia de §5.2 fuera del archivo donde se busca. La lectura sigue siendo del servidor y viaja como promesa"
  - "El vacio de todo el panel se dispara por AUSENCIA DE FILA de feed, no por feed apagado. Con la fila apagada si hay reservas que enseñar, y ese es exactamente el tercer estado que §8.2 pide con su icono: si el vacio se disparara ahi, `Sin conectar` seria codigo muerto"
  - "Se añadieron DOS formateadores a lib/domain/dates.ts. `jue 18` y `hoy, 09:42` no existian en ninguna forma, y la cabecera de ese archivo declara que es el UNICO sitio donde se formatea una fecha para pantalla: componerlos en el componente habria roto esa regla para ahorrar dos funciones"
  - "La abreviatura de dia va en tabla explicita, no de `Intl`, por la misma razon escrita para los meses: la abreviatura la fija la version de ICU del runtime. Medido, ICU devuelve hoy exactamente los mismos siete valores"
  - "El `hoy` y el `mes` bajan como props desde el servidor en vez de leerse en el componente: es lo que deja el componente sin una sola derivacion de fecha y sin riesgo de hidratacion"
  - "El pie se pinta SIEMPRE, tambien en el vacio, y el estado vacio conserva su accion. Las dos cosas las pide el contrato por separado (§8.2 y §11.2) y el resultado son dos botones `Conectar calendario` en la misma pantalla. Se deja como esta y se anota: quitarle uno es una decision del contrato, no de la ejecucion"

patterns-established:
  - "Cuando un contrato pide una forma de fecha que no existe, el formateador se añade a lib/domain/dates.ts con su test, no se compone en el JSX"
  - "Un andamio E2E que siembra filas de infraestructura (feeds) las borra TODAS en su limpieza: dejar una contamina las suites de integracion que cuentan feeds activos"

requirements-completed: []

coverage:
  - id: D1
    description: "leerCheckoutsDelMes(): las fechas de fin del mes corriente, con proyeccion de una sola columna, filtrando las reservas que ya desaparecieron del feed y sin ninguna migracion"
    verification:
      - kind: other
        ref: "grep -c \"select('\\*')\" lib/data/panel-apartamento.ts → 0 · grep de derivacion de fechas → 0 · grep -c leerFeedDeApartamento → 2 · npm run ci:arch limpio (guardarrail 9 sin disparar)"
        status: pass
      - kind: e2e
        ref: "Andamio desechable: tres reservas sembradas (ayer, hoy, en tres dias) sobre un feed real; el panel pinta las tres en orden y ninguna otra"
        status: pass
    human_judgment: false
  - id: D2
    description: "Las dos formas de fecha que §8.2 pedia: `jue 18` para las filas del mes y `hoy, 09:42` / `ayer, 21:15` / `4 de septiembre` para la ultima sincronizacion"
    verification:
      - kind: unit
        ref: "lib/domain/dates.test.ts#formatDiaCortoBog (3 casos, uno con la zona de Bogota en caliente) y #formatSincronizacionBog (6 casos, incluido el cruce de mes)"
        status: pass
      - kind: unit
        ref: "npm run test:unit → 65 archivos, 1244 en verde (1235 antes, 9 nuevos)"
        status: pass
    human_judgment: false
  - id: D3
    description: "PanelCalendario con sus tres grupos, su pie, el copy literal de §15.2 y el vacio compacto del componente que ya existe"
    verification:
      - kind: e2e
        ref: "Medido en el DOM: los tres encabezados en orden (PRÓXIMO CHECKOUT · CHECKOUTS DE SEPTIEMBRE · CALENDARIO), la linea de apoyo `Calendario · septiembre de 2026`, `Conectado`, `hoy, 23:19`, y el pie con `Cambiar calendario`"
        status: pass
      - kind: e2e
        ref: "Las tres filas del mes con sus tres tratamientos medidos por clase: pasado `text-muted-foreground`, hoy `font-semibold text-foreground`, futuro `text-foreground`. Ancho del panel = 480px"
        status: pass
      - kind: other
        ref: "grep -c 'scroll={false}' → 2 · grep de navegacion entre meses → 0 · grep de construccion de fechas → 0 · ningun icono fuera de §14.5"
        status: pass
    human_judgment: true
    rationale: "Que el grupo de checkouts se lea como una lista y no como un bloque, y que el vacio compacto no parezca un error, son juicios de pantalla. Los cubren 08-12 (barrido visual) y 08-13 (accesibilidad)"
  - id: D4
    description: "La pagina lee el segundo parametro, renderiza UN panel con dos cuerpos, y cada vista paga solo sus consultas"
    verification:
      - kind: other
        ref: "grep -c PanelCalendario page.tsx → 2 · grep -c '<PanelLectura' page.tsx → 0 · las dos `key={` son `abierto.id`, la misma en los dos cuerpos"
        status: pass
      - kind: e2e
        ref: "`?vista=galeria` pinta la ficha (UBICACIÓN Y ACCESO · A CARGO · DINERO · PRÓXIMO ASEO) y la direccion se queda con el parametro huerfano, sin redireccion"
        status: pass
    human_judgment: false
  - id: D5
    description: "El chevron de volver, en sus dos ramas, sin salirse nunca de la lista"
    verification:
      - kind: e2e
        ref: "RAMA 1 (ficha → Calendario → chevron): vuelve a `?apartamento={uuid}` sin `vista`, el panel sigue abierto y las 39 filas siguen detras. RAMA 2 (direccion directa → chevron): mismo destino, mismo resultado"
        status: pass
      - kind: e2e
        ref: "Scroll estable en el viaje que este plan añade: 28 → 28 → 28 al pasar de ficha a calendario y volver"
        status: pass
    human_judgment: false
  - id: D6
    description: "La pantalla de conexion del calendario sigue exactamente como estaba, y su suite lo demuestra sin haber cambiado"
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/calendario.spec.ts → 7 passed, con `git diff` del spec vacio"
        status: pass
      - kind: other
        ref: "git diff --name-only e692241..HEAD sobre app/(admin)/apartamentos/[id]/calendario y app/(cleaner) → 0 lineas"
        status: pass
    human_judgment: false

duration: 75min
completed: 2026-09-17
status: complete
---

# Fase 8 Plan 10: El calendario del apartamento, que no era un calendario

**La pantalla que el ROADMAP mandaba convertir en panel resultó ser el formulario de conexión de APTO-12, así que se quedó intacta y el panel se construyó como contenido de lectura nuevo sobre las reservas que ya estaban en la base: próximo checkout, los checkouts del mes y el estado del feed, sin una migración y sin que ningún dato del huésped entre en la proyección.**

## Rendimiento

- **Duración:** ~75 min
- **Tareas:** 3 de 3
- **Archivos creados:** 1 · modificados: 4
- **Commits:** 4, uno por tarea más el de los formateadores
- **Unitarios:** de 1235 a **1244** (9 nuevos) · pgTAP **380** · integración **205**

## Lo que se hizo

### Task 1 · La lectura, sin migración

`lib/data/panel-apartamento.ts` gana `leerCheckoutsDelMes()` y reexporta
`leerFeedDeApartamento()`, que ya existía desde la Fase 2. Las reservas del
calendario tienen su permiso de lectura desde la migración 07 y su policy de
admin desde la 08, y `cal_res_prop_end_idx` está hecho para esta consulta
exacta: por apartamento, por fecha de fin, acotado a las que siguen en el feed.
**Ninguna función nueva en `public`, ninguna migración.**

Tres reglas quedaron escritas en el módulo:

| Regla | Por qué |
|---|---|
| Proyección de **una** columna | El panel pinta fechas. Y esa tabla guarda además un campo de texto libre que llega tal cual del proveedor y arrastra dato personal del huésped: el guardarraíl 9 rompe el build si aparece su nombre en cualquier archivo de aplicación, **también en un comentario**, así que el módulo lo describe y no lo teclea |
| Se filtran las reservas que ya no están en el feed | Una reserva que desaparece se **marca**, no se borra: el feed puede venir vacío por un fallo del proveedor. Sin el filtro, el panel enseñaría como vigente algo que el calendario ya canceló |
| Aquí no se deriva nada | Devuelve cadenas. El próximo checkout, la lista del mes y la distancia salen de `lib/domain/checkouts.ts`, que tiene sus 19 casos |

El presupuesto quedó anotado en la cabecera, y las dos ramas son **excluyentes**:

```
sin panel                  4 consultas
panel en la ficha          5   (+ el próximo aseo)
panel en el calendario     6   (+ los checkouts del mes y el feed)
```

Con la vista de calendario pedida, el próximo aseo **ya no se lee**: ese cuerpo
no lo pinta.

### Task 2 · La vista, tres grupos y un pie

`PanelCalendario.tsx`, 508 líneas. Los tres grupos de §8.1 en orden, el pie con
su label condicional, y el chevron de volver en la cabecera.

**Las tres derivaciones se llaman, no se reimplementan:** `checkoutsDelMes`,
`proximoCheckout` y `distanciaHastaCheckout` de la Wave 0, más `saludDelFeed`
para los tres estados del grupo 3. Dentro del componente **no se construye una
sola fecha**, y hay un grep de aceptación que lo deja en cero.

### Task 3 · La página, y la pantalla que no se toca

`vista` entra como **unión cerrada**: `?vista=galeria` pinta la ficha, sin
redirección y sin limpiar la dirección, que es la regla 4 de §11.4 aplicada al
segundo parámetro. Un solo hueco de panel, dos cuerpos, y **la misma clave en
los dos**.

Y lo que importaba de verdad: **`app/(admin)/apartamentos/[id]/calendario/` no
tiene ni una línea de diff**, y su suite lo demuestra sin haber cambiado.

## Los commits por tarea

| # | Hash | Qué |
|---|---|---|
| Task 1 | `65ae45f` | los checkouts del mes y el feed, sin una migración de por medio |
| Task 2a | `5131a78` | las dos formas de fecha que el panel pedía y no existían |
| Task 2b | `0f86c75` | la vista de calendario, tres grupos y un pie |
| Task 3 | `f379cd1` | la página lee la vista, y el panel sigue siendo uno solo |

## Las tres decisiones que el plan no traía resueltas

### 1. El archivo del panel es de cliente, y la lectura sigue siendo del servidor

§8.2 pide **dos ramas** para el chevron: navegar hacia atrás cuando el panel
llegó desde la ficha (porque el botón `Calendario` abrió con empuje) y
reemplazar cuando se entró por dirección directa. Las dos necesitan el enrutador
del cliente.

La alternativa era un archivo aparte solo para el chevron, y entonces el
`scroll={false}` de la **sexta ocurrencia de §5.2** viviría fuera del archivo
donde el criterio de aceptación lo busca, y donde el siguiente lo va a buscar.

Así que el archivo lleva `'use client'` y la promesa de la lectura **baja desde
el servidor sin resolver**, se consume con `use()` detrás de la barrera de
suspensión propia del panel, y el esqueleto sigue existiendo. El día de negocio
y el mes bajan también como props: con el reloj del navegador el panel se
hidrataría con un `hoy` distinto del que se renderizó, y el componente dejaría
de estar libre de derivaciones de fecha.

**Cómo se distinguen las dos ramas, sin adivinar.** Por la dirección con la que
se cargó el **documento**: una navegación de cliente no crea una entrada de
tiempos de navegación nueva, así que esa entrada dice con qué dirección entró el
navegador a la pestaña. Si ya traía la vista de calendario puesta, nadie navegó
hasta acá y no hay ficha detrás. No se cuentan entradas de historial, que es lo
que no se puede hacer bien.

### 2. El vacío del panel se dispara por ausencia de FILA, no por feed apagado

El contrato dice dos cosas que parecen la misma y no lo son:

- §11.2: *"el panel entero sin contenido, **sin feed**"* → estado vacío compacto.
- §8.2: el grupo 3 tiene **tres** estados, y el tercero es `Sin conectar` con su
  icono, que sale de `is_active`.

Si el vacío se disparara con el feed apagado, ese tercer estado sería **código
muerto**: nunca se pintaría. La lectura correcta es la literal: sin **fila** de
feed no hay reservas que enseñar (cuelgan del feed por clave foránea) y los tres
grupos saldrían vacíos; con la fila apagada sí hay historial, y eso es
exactamente lo que el tercer estado cuenta.

### 3. Dos formateadores nuevos en `lib/domain/dates.ts`

§8.2 pide `jue 18` para las filas del mes y `hoy, 09:42` / `ayer, 21:15` /
`4 de septiembre` para la última sincronización. **Ninguna de las dos formas
existía**, ni componiéndolas: `formatFechaCortaBog` da `18 sep`, `formatFechaBog`
da `jue, 18 de septiembre`, y `tiempoRelativo` da `ayer 14:20`, que es la forma
de una cabecera que se refresca sola y no la de un dato que se lee una vez.

La cabecera de ese archivo declara que es el **único sitio donde se formatea una
fecha para pantalla**. Componerlas en el JSX habría roto esa regla para ahorrar
dos funciones, y habría metido en el componente justo la aritmética que el plan
prohíbe. Ver la desviación 1.

## Deviations from Plan

### Auto-fixed Issues

**1. [Regla 3 - Bloqueo] `lib/domain/dates.ts` y su test entraron al diff, y no estaban en `files_modified`**

- **Encontrado durante:** Task 2, al escribir el grupo 2.
- **Problema:** el copy de §8.2 (`jue 18`, `hoy, 09:42`) no era producible con
  ningún formateador existente, y el plan prohíbe derivar fechas dentro del
  componente. Las dos reglas juntas no dejan más salida que añadir los
  formateadores donde el repo dice que viven.
- **Arreglo:** `formatDiaCortoBog()` y `formatSincronizacionBog()`, cada una con
  su bloque de razones y **9 casos unitarios** entre las dos. La abreviatura de
  día va en tabla explícita, replicando la decisión que `MESES_CORTOS` ya tenía
  escrita: la abreviatura la fija la versión de ICU del runtime, y una fecha que
  cambia de forma según dónde corra el proceso es la clase de dependencia oculta
  que ese archivo entero existe para evitar. Medido el 2026-09-17: ICU devuelve
  hoy exactamente los mismos siete valores, así que la tabla no cambia nada
  ahora; lo que compra es que no cambie mañana sin que nadie se entere.
- **Archivos:** `lib/domain/dates.ts`, `lib/domain/dates.test.ts`
- **Commit:** `5131a78`

**2. [Regla 2 - Funcionalidad crítica] El próximo aseo deja de leerse con la vista de calendario pedida**

- **Encontrado durante:** Task 3.
- **Problema:** el plan fija el presupuesto en **6** consultas con la vista de
  calendario. Manteniendo la lectura del próximo aseo habrían sido 7, y esa
  séptima paga por un dato que el cuerpo del calendario no pinta.
- **Arreglo:** las dos ramas son excluyentes, y está escrito en los dos archivos.
- **Commit:** `f379cd1`

### Lo que NO se arregló, y va por nombre

**El estado vacío deja DOS botones `Conectar calendario` en la misma pantalla.**
Medido en el DOM:

```
Sin calendario conectado.
Este apartamento no va a generar aseos automáticos hasta que conectes su calendario.
[ Conectar calendario ]     ← la acción del estado vacío (§11.2)
[ Conectar calendario ]     ← el pie del panel (§8.2)
```

Las dos las pide el contrato por separado: §8.2 define el pie **sin condición**
y §11.2 define la acción del vacío. Y no se pueden conciliar en ejecución,
porque el pie se decide **antes** de que llegue el dato (se pinta con su label
real desde el primer frame, §11.1 punto 3) y con la información disponible en
ese momento no se distingue *"no hay fila de feed"* de *"la fila está apagada"*,
que son justamente los dos casos que van a cuerpos distintos.

**Quitarle uno es una decisión del contrato, no de la ejecución.** Queda para el
barrido visual de **08-12**, con la recomendación: el pie es el que tiene que
quedarse, porque es el único que existe también cuando el panel sí tiene
contenido.

**Y el copy `{N} fallos seguidos` es agramatical con N a uno.** El umbral del
feed es **uno**, así que `1 fallos seguidos` es un estado alcanzable. §15.2 fija
ese literal y este plan lo respeta tal cual; concordarlo es una modificación del
contrato de copywriting, que es de 08-12.

## La comprobación del chevron, en sus dos ramas

Se midió con un andamio desechable, escrito, corrido, leído y borrado en la
misma tarea, que es el patrón que dejó el plan 08-09. Sembró un feed real con
tres reservas (ayer, hoy, en tres días) sobre la primera unidad gestionada.

| Rama | Gesto | Resultado |
|---|---|---|
| **1** | ficha → `Calendario` → chevron | vuelve a `/apartamentos?apartamento={uuid}`, **sin** `vista`. El panel sigue abierto en la ficha y las **39 filas** siguen detrás |
| **2** | dirección directa a `&vista=calendario` → chevron | mismo destino y mismo resultado: lleva a la ficha, no se sale |
| **3** | apartamento sin feed | el estado vacío compacto con sus cuatro literales |
| **4** | `?vista=galeria` | pinta la ficha y la dirección se queda con el parámetro huérfano |

**El cuerpo del panel, tal como salió del DOM:**

```
[PLACEHOLDER] Bogotá 1 — Apto 01
Calendario · septiembre de 2026
PRÓXIMO CHECKOUT      jueves 17 de septiembre / hoy
CHECKOUTS DE SEPTIEMBRE   mié 16 · jue 17 · dom 20
CALENDARIO            Estado: Conectado · Última sincronización: hoy, 23:19
                                              [ Cambiar calendario ]
```

Y las tres filas del mes con sus tres tratamientos, medidos por clase y no a
ojo: el pasado en `text-muted-foreground`, el de hoy en `font-semibold
text-foreground`, el de adelante en `text-foreground`. El panel mide **480px**.

**Sobre el scroll.** En el viaje que este plan añade (ficha → calendario →
vuelta) la posición no se mueve: **28 → 28 → 28**. La caída de 600 a 28 que
aparece al abrir el panel es el **sesgo 1 de 08-02 §1.1**: Playwright desplaza el
elemento a la vista antes de pulsarlo, y el enlace del apartamento sembrado es
la primera fila de la tabla. El escenario de control lo confirma: abrir y cerrar
**solo la ficha**, sin tocar el calendario, produce exactamente la misma caída.
La medición buena de este viaje es la de 08-06, con el clic disparado desde el
documento.

## Verificación

```
npm run build                                                          limpio
npx tsc --noEmit                                                       limpio
npm run lint                            0 errores (2 warnings preexistentes)
npm run ci:arch                        los tres guardarrailes en OK
npm run test:unit                      65 archivos, 1244 passed
npm run db:test                        12 archivos, 380 tests, PASS
npm run test:integration               23 archivos, 205 passed
npx playwright test e2e/calendario.spec.ts                          7 passed
npx playwright test e2e/apartamentos-lista.spec.ts    13 passed, 1 rojo declarado
git diff --name-only … app/(admin)/apartamentos/[id]/calendario   0 lineas
git diff --name-only … app/(cleaner)                              0 lineas
```

Los greps de aceptación, uno por uno:

```
grep -c "select('*')" lib/data/panel-apartamento.ts                        0
grep sin comentarios de construccion de fecha, panel-apartamento.ts        0
grep -c leerFeedDeApartamento lib/data/panel-apartamento.ts                2
grep -c 'scroll={false}' PanelCalendario.tsx                               2
grep -ciE 'mes anterior|mes siguiente|ChevronLeft|ChevronRight'            0
grep sin comentarios de construccion de fecha, PanelCalendario.tsx         0
grep -c PanelCalendario page.tsx                                           2
grep -c '<PanelLectura' page.tsx                                           0
```

## El estado de la suite E2E completa, y de dónde sale cada rojo

La corrida completa deja **6 rojos**, y **ninguno es de este plan**. Merece
quedar escrito porque la cadena no es obvia y el plan 08-11 la va a leer:

| Rojo | Origen |
|---|---|
| `apartamento-crud.spec.ts:136` y `:169` | **Declarados.** Cuelgan del redirect de §5.4 que puso 08-09 |
| `apartamento-cuartos.spec.ts:218` y `:242` | **Declarados.** Mismo redirect |
| `apartamentos-lista.spec.ts:178` y `calendario.spec.ts:438` | **Víctimas, no defectos.** Es la cascada |
| `finanzas.spec.ts:579` | **Declarado** |
| `apartamentos-lista.spec.ts:376` | **Declarado** |

**La cascada, medida y no supuesta.** Con la base recién reseteada:

```
tras db:reset                                    39 unidades
tras correr apartamento-cuartos.spec.ts SOLO     40 unidades
                                                 + [E2E-CUARTOS-1789706362102] Vacio
```

El spec crea un apartamento por la interfaz, la espera de guardado se cae contra
el redirect nuevo, su limpieza no llega a correr, y el huérfano sobrevive.
`calendario.spec.ts:219` y `apartamentos-lista.spec.ts` tienen un **control de
entorno** que aborta si no hay exactamente 39 unidades, así que los dos se
ponen rojos sin que nada suyo esté roto. El mensaje es literal: *"La limpieza
dejó restos: 40 unidades donde había 39."*

**Corriendo `e2e/calendario.spec.ts` sola, tras un reset, es 7/7 en verde y el
spec no cambió una línea.** Esa es la comprobación que el plan pedía, y es la
que demuestra que el conflicto A se resolvió como el UI-SPEC decidió: si la
pantalla de conexión hubiera desaparecido, la suite entera moriría y el conteo
de seis aserciones de D8-11 sería un error de un orden de magnitud.

## Lo que 08-11, 08-12 y 08-13 pueden dar por cierto

- **La segunda vista existe y es enlazable.** `?apartamento={uuid}&vista=calendario`
  abre directamente, y el chevron vuelve a la ficha desde las dos entradas.
- **La clave del panel no cambia al cambiar de vista.** Los dos cuerpos llevan
  `key={abierto.id}` y viven en el mismo hueco.
- **Hay dos cosas del contrato esperando decisión visual:** los dos botones
  `Conectar calendario` del vacío, y `1 fallos seguidos`. Las dos están arriba
  con su razón.
- **Los rojos de la suite completa tienen un solo origen** y está medido: el
  redirect de §5.4 deja un apartamento huérfano. Arreglarlo cierra los cuatro
  declarados **y** los dos de la cascada.
- **La pantalla de conexión no se tocó.** Cualquier diff futuro sobre ese
  directorio es un cambio de alcance, no una continuación.

## Known Stubs

Ninguno. Los tres grupos, el pie, el vacío del panel y el vacío de cada grupo
están implementados y medidos contra datos reales.

## Self-Check: PASSED

- `app/(admin)/apartamentos/_components/PanelCalendario.tsx` — FOUND
- `lib/data/panel-apartamento.ts` — FOUND
- `lib/domain/dates.ts` — FOUND
- `app/(admin)/apartamentos/page.tsx` — FOUND
- `65ae45f`, `5131a78`, `0f86c75`, `f379cd1` — los cuatro en el historial
