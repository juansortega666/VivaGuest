---
phase: 08-paneles-laterales-en-el-admin
plan: 12
subsystem: pruebas
tags: [e2e, playwright, criterio-1, criterio-2, criterio-3, criterio-5, portal, señuelos, secretos]

requires:
  - phase: 07-financiero
    provides: "esperarUrlDeCliente() y esperarControlHidratado() en e2e/fixtures.ts"
  - phase: 02-acceso-y-administraci-n-del-cat-logo
    provides: "el patrón de T-02-74 en calendario.spec.ts: el secreto se comprueba contra el documento entero, no contra lo que se ve"
  - phase: 08-paneles-laterales-en-el-admin
    provides: "08-02: la INSTRUCCION 7 (el instrumento de espera) y la INSTRUCCION 8 (la contra-prueba obligatoria). 08-06: la medición a mano del criterio 1 (scrollY 977 → 977 → 977) y el destino nuevo de la celda de nombre. 08-09: CodigoDeAccesoAdmin con su contrato de props, y la proyección a dos campos de la acción. 08-10: la vista de calendario, el chevron en sus dos ramas y §11.4 sobre el segundo parámetro. 08-11: el patrón getByRole('dialog'), el primer consumidor de esperarUrlDeCliente() y el panel abriendo con empuje"
provides:
  - "Los criterios 1, 2 y 3 del ROADMAP dejan de ser referencia faltante: siete casos que corren en cada CI"
  - "El criterio 1 medido en el DOM, en las dos mitades y en los dos sentidos, con cinco medidas por caso"
  - "El caso de §11.4 que nadie escribe: un identificador que no existe y la pantalla normal, con sus cinco afirmaciones"
  - "T-08-57 y T-08-58 como aserciones permanentes, las dos vistas en rojo"
  - "La prueba medida de que una prop no renderizada SÍ viaja en el documento"
  - "El instrumento para leer el cuerpo de una acción de servidor, que la espera de respuesta no puede dar"
affects: [08-13, 08-14]

tech-stack:
  added: []
  patterns:
    - "El estado del anfitrión con el panel abierto se lee en UN SOLO evaluate, del DOM: por rol no se resuelve, porque Base UI marca el resto del documento como oculto"
    - "El clic que abre se dispara DESDE EL DOCUMENTO, no con locator.click(): el runner desplaza el elemento antes de pulsar y eso mueve el scroll que la prueba iba a medir"
    - "Toda comparación antes/después lleva un control que fija el valor de partida: si una medida vale null en los dos momentos, la comparación pasa sin mirar nada"
    - "El cuerpo de la respuesta de una Server Action se atrapa desviando la petición (page.route + fetch + fulfill), nunca con waitForResponse().text()"

key-files:
  created: []
  modified:
    - "e2e/apartamentos-lista.spec.ts"
    - ".planning/phases/08-paneles-laterales-en-el-admin/deferred-items.md"

decisions:
  - "El esqueleto del segmento se afirma con un centinela de mutaciones que mira los NODOS RETIRADOS, no el conteo de filas del momento: las mutaciones se entregan en lote y un quitar-y-poner síncrono se vería como si nada hubiera pasado"
  - "La ausencia de aviso de error se cuenta por componente ([data-slot=alert]) y no por rol: getByRole('alert') devuelve SIEMPRE uno, porque el enrutador de Next monta un anunciador de rutas vacío con ese rol en cada página"
  - "El encabezado del mes se afirma por forma y no por nombre: fijar SEPTIEMBRE convertiría el caso en una bomba de relojería que estalla el día uno del mes que viene"
  - "Los dos huecos de contrato que 08-10 mandó a «08-12» NO se cerraron: son cambios de producto y el diff de este plan es de un solo archivo de pruebas. Quedan en deferred-items.md con su recomendación"

metrics:
  duration: "~2h"
  completed: "2026-09-18"

status: complete
---

# Fase 8 Plan 12: Los criterios 1, 2 y 3 dejan de depender de que alguien se acuerde de mirar, Summary

**Siete casos nuevos sobre `/apartamentos`, y los siete se vieron en rojo antes de darse por
buenos.** El criterio 1 se lee del DOM en cinco medidas y en los dos sentidos, el criterio 2 se
ejerce entrando por dirección directa en tres formas (incluida la que nadie escribe), el criterio
3 se afirma en sus dos mitades, y el código de la cerradura no está en el documento antes de que
nadie lo pida.

## Rendimiento

- **Duración:** ~2 h
- **Tareas:** 3 de 3
- **Archivos modificados:** 1 de código · 1 de planificación
- **Commits:** 3, uno por tarea
- **Casos nuevos:** 7 · **E2E** de 133 a **140 pasando**

## Lo que se hizo

### Task 1 · El criterio 1, en sus dos mitades y en los dos sentidos

Dos casos, `abrir` y `cerrar`, con **cinco medidas cada uno y cada una con su mensaje**: la
posición de scroll, el texto del buscador, el cluster elegido, el estado del interruptor de
pendientes, y el conteo de filas de la lista filtrada. Son cinco aserciones y no una sobre el
objeto entero, porque un rojo que dice *«los objetos no son iguales»* no dice cuál de las cinco se
perdió, que es lo único que uno quiere saber leyendo ese rojo.

**El escenario es el mismo que midió 08-06 a mano:** buscador en `a`, cluster `Bogotá 1`, 23 filas
y la página al fondo. Y la partida es una fila **baja de verdad** (`Apto 22`), no la primera: desde
el tope el scroll no se mueve y la mitad de scroll del criterio 1 se afirmaría sin haber probado
nada.

**Tres decisiones de instrumento, y ninguna es de estilo:**

| Decisión | Por qué |
|---|---|
| Las cinco medidas salen de **un solo `evaluate`**, no de cinco localizadores | La función se llama también **con el panel abierto**, y ahí Base UI marca el resto del documento como oculto al árbol de accesibilidad: un `getByLabel('Buscar apartamento')` en ese momento no se resuelve nunca. Es la INSTRUCCION 7, punto 4 |
| El clic se dispara **desde el documento**, no con `locator.click()` | El runner hace `scrollIntoViewIfNeeded` ANTES de pulsar, y sobre una página al fondo eso mueve el scroll por su cuenta: la medida de «antes» ya no sería la que el producto recibió. Es el sesgo 1 de `08-02` §1.1 |
| El scroll se lee como **posición**, nunca por visibilidad de una fila | *«La fila 22 sigue visible»* es cierto para cualquier posición que la contenga, incluida una que se movió 300 px |

**Y los cinco controles del escenario, que son la parte que nadie escribe.** Una comparación
antes/después tiene un modo de fallo silencioso: si una medida vale `null` en los dos momentos
—porque el selector no encontró el control, porque el atributo se llama de otra forma— la
comparación pasa en verde sin haber mirado nada. Los cinco controles fijan los valores de partida,
así que ninguna comparación puede ser verdadera por vacuidad. **No es teoría: el control del
cluster se puso rojo a la primera**, con `Bogotá 1▼` (el disparador del select arrastra el glifo
del chevron), y por eso la lectura pasó a acotarse al `[data-slot="select-value"]`.

**El esqueleto del segmento, fijado para siempre.** Un centinela de mutaciones instalado antes de
pulsar apunta si el subárbol de la tabla llega a **retirarse del documento**, que es la firma
observable del fallback de segmento. Mira los **nodos retirados** de cada mutación y no el conteo
de filas del momento: las mutaciones se entregan en lote al final del microtask, así que un
quitar-y-poner síncrono se vería como si nada hubiera pasado.

### Task 2 · Los criterios 2 y 3, con sus dos mitades cada uno

Cinco casos. Los tres primeros entran **por dirección directa, sin pulsar nada**, que es la mitad
del criterio 2 que no se puede afirmar navegando por dentro: lo que se prueba es que la pantalla se
reconstruye entera desde la dirección, que es lo único que viaja cuando alguien pega un enlace.

1. **`?apartamento={uuid}`** → el diálogo está, **y enseña el apartamento que la dirección dice**.
   La segunda aserción se acota al diálogo: ampliarla a la pantalla la haría verdadera por
   accidente, porque ese nombre también está en su fila de la tabla de detrás.
2. **`&vista=calendario`** → los tres encabezados de grupo de §8.1, más un **control** con la línea
   de apoyo `Calendario · {mes} de {año}`, que solo escribe ese cuerpo: sin él, los tres
   encabezados podrían estar afirmando un panel que no es el que se pidió.
3. **Un identificador con forma válida que no existe** → la pantalla normal. **Es el caso que nadie
   escribe porque parece que no pasa nada**, y son cinco afirmaciones por separado: sin 404, con
   sus 39 filas, sin panel, sin aviso de error, **y con el parámetro intacto en la dirección**. La
   quinta es la que importa: limpiarlo reescribiría el enlace que alguien pegó en un chat.

Y los dos del criterio 3:

4. **El botón atrás**, con sus **dos mitades**: el diálogo desapareció **y** la dirección sigue
   dentro de la sección. Sin la segunda, una implementación que abriera con reemplazo pasaría la
   primera sin despeinarse.
5. **El chevron entrando de fuera**, que es la **rama de reemplazo** de §8.2 y solo se ejerce así.
   La aserción de URL se escribe **contra el identificador que se pidió**, no contra un patrón
   genérico: con un patrón genérico, un chevron que llevara a otro apartamento pasaría en verde.

**Un hallazgo de instrumento, y vale para toda la suite:** `getByRole('alert')` **devuelve siempre
uno** en cualquier pantalla del producto, porque el enrutador de Next monta un
`<div id="__next-route-announcer__" role="alert">` vacío para anunciar los cambios de ruta. Contra
el rol, la aserción de *«sin aviso de error»* sería roja en todas partes; contra el componente
(`[data-slot="alert"]`), mide lo que dice medir. Se descubrió en rojo escribiendo el caso.

### Task 3 · El secreto que no puede estar en el documento

**La aserción es contra el contenido del documento entero, no contra lo que se ve, y esa distinción
es toda la prueba.** Lo que se pasa como prop a un componente de cliente viaja en la carga de React
y queda en el documento aunque no se pinte: una aserción sobre visibilidad pasaría en verde con el
secreto dentro del documento, que es exactamente el defecto que se quiere atrapar. Es el patrón de
`calendario.spec.ts` (T-02-74), sobre esta misma tabla.

El `beforeAll` siembra las **dos credenciales del mismo apartamento** —el código de la cerradura y
la dirección de exportación del calendario— y las borra en la limpieza. Van juntas a propósito: el
caso afirma que **una sale con un gesto y la otra no sale nunca**, y esas dos cosas solo se pueden
medir sobre la misma unidad.

Los dos valores llevan marca de tiempo, por la misma razón que el secreto de `calendario.spec`: un
valor corto y común (`4821`) puede aparecer en el documento por accidente —dentro de un
identificador, de una clase generada, de un número de versión— y la aserción sería roja sin que
nada estuviera mal.

**La otra mitad, y el instrumento que hubo que cambiar.** La aserción de que la credencial del
calendario no sale **tiene que mirar el cable, no el documento**: la acción podría devolver las
cuatro credenciales y el panel seguiría pintando solo el código, así que mirando el documento la
fuga no se vería.

Y `waitForResponse(...).text()` **no sirve, y se descubrió en rojo**:

```
Error: response.text: Protocol error (Network.getResponseBody):
No data found for resource with given identifier
Response body is not available for a response that was navigated away from.
```

La acción revalida y el enrutador navega inmediatamente después, así que para cuando la prueba pide
el cuerpo el navegador ya lo descartó. **La salida es desviar la petición** (`page.route` →
`route.fetch()` → `route.fulfill()`): el cuerpo se lee ANTES de devolvérselo al documento, que es
el único momento en que existe con seguridad. Queda anotado como patrón: es la forma de leer lo que
devuelve cualquier Server Action de este repo.

## Los siete señuelos, con su rojo real

La INSTRUCCION 8 es una compuerta: **un caso nuevo que nunca se vio en rojo no cuenta.** Los siete
se corrieron, se comprobó el rojo, y se revirtieron. El árbol quedó con un solo archivo modificado.

| # | Caso que protege | Qué se rompió a propósito | Qué se puso rojo |
|---|---|---|---|
| 1 | criterio 1, la mitad de **scroll** | el enlace de la celda pierde la desactivación del salto de scroll | `CRITERIO 1: abrir el panel movio el scroll de la lista` · `Expected: 1057` · `Received: 0` |
| 2 | criterio 1, la mitad de **filtro** | una clave derivada de los parámetros sobre `<TablaApartamentos>` (la INSTRUCCION 3) | `CRITERIO 1: abrir el panel borro el texto del buscador` · `Expected: "a"` · `Received: ""` |
| 3 | criterio 1, el **centinela del remonte** | `<Table key={abiertoId}>`, que retira el `<table>` del documento al abrir | `CRITERIO 1: la tabla se retiro del documento al abrir, o sea que el esqueleto del segmento se activo` · `Expected: false` · `Received: true` |
| 4 | criterio 3, la **segunda mitad** | el enlace de apertura vuelve a abrir con reemplazo | `La navegación de cliente no dejó la URL en /\/apartamentos$/ tras 15000 ms. Sigue en about:blank` |
| 5 | §11.4, la **quinta afirmación** | la página redirige y limpia el parámetro huérfano | `§11.4: la pantalla limpio el parametro huerfano` · `Expected substring: "apartamento=0000…"` · `Received: "http://127.0.0.1:3210/apartamentos"` |
| 6 | criterio 3, el **chevron de fuera** | el chevron pierde su rama de reemplazo y siempre navega hacia atrás | `La navegación de cliente no dejó la URL en /\/apartamentos\?apartamento=…$/ tras 15000 ms. Sigue en about:blank` |
| 7 | **T-08-58**, la credencial del calendario | la acción devuelve el objeto entero de la lectura de secretos (`...secretos`) | `T-08-58: la credencial del calendario viajo en la respuesta de la accion del codigo` · `Expected substring: not "SECRETOICALE2E…"` |

**Y el octavo, que es el que hay que leer con calma:**

| # | Caso que protege | Qué se rompió | Qué se puso rojo |
|---|---|---|---|
| 8 | **T-08-57**, el código fuera del documento | `CodigoDeAccesoAdmin` recibe el valor del código como prop, **y no lo renderiza en ningún sitio** | `T-08-57: el codigo de la cerradura esta en el documento antes de que nadie lo pida` · `Expected substring: not "CODIGOE2E…"` |

**El señuelo 8 es la medición que este plan existía para producir, y salió como el contrato
predecía.** La prop **nunca se pinta** —el componente la declara y la ignora— y aun así el valor
aparece en `page.content()`, porque viaja en la carga de hidratación de React. Eso es la frase de
la cabecera de `CodigoDeAccesoAdmin` dejada de prueba, y es la razón por la que una aserción sobre
visibilidad **no habría servido**: con el secreto dentro del documento y fuera de la pantalla, una
aserción sobre lo que se ve habría pasado en verde.

**El señuelo 4 y el 6 imprimen la misma cadena, y no es casualidad:** `about:blank` es la firma
exacta que 08-11 midió al devolverle la prop de reemplazo al quinto panel. Con reemplazo al abrir
no hay entrada de historial que cerrar, así que el botón atrás saca de la sección entera, y con una
sola entrada saca del sitio.

### Un noveno intento que se descartó por confundido, y queda anotado

El señuelo natural del centinela del esqueleto era **reintroducir
`app/(admin)/apartamentos/loading.tsx`**. Se hizo, y el caso se puso rojo, **pero no en la aserción
del centinela**: se puso rojo en la espera, con `La navegación de cliente no dejó la URL … Sigue en
http://127.0.0.1:3210/apartamentos`. Medido con un andamio: con ese archivo puesto, **el clic sobre
el enlace de la fila no navega en absoluto** (10 sondeos de 500 ms, URL sin cambiar, ni panel ni
fallback a la vista).

Es una observación fuerte y hay que dejarla escrita: **el archivo de carga de segmento prohibido no
solo pierde el scroll, hoy impide la apertura del panel**, y la suite lo atrapa por la vía de la
espera. Pero como señuelo del centinela no vale, porque el caso muere antes de llegar a él. Por eso
el señuelo 3 usa una clave sobre la tabla, que retira el `<table>` del documento en el mismo
instante de la apertura y pone rojo **exactamente** el mensaje del centinela.

## Los dos huecos declarados: decididos y escritos, no cerrados

El prompt de ejecución pedía decidir qué hacer con los dos huecos que 08-09 y 08-10 dejaron
apuntando a «08-12». **Los dos son cambios de producto, y el `files_modified` de este plan es
exactamente un archivo de pruebas, con una prohibición explícita de que el diff contenga otro.**
Así que se decidieron, se escribieron con su recomendación en `deferred-items.md`, y no se
ejecutaron.

**La confusión de destinatario también queda anotada:** 08-10 y 08-11 escriben *«08-12 (el barrido
visual)»*, y el 08-12 que se ejecutó es el plan de aserciones. Esa numeración se movió.

| Hueco | Decisión | Destinatario |
|---|---|---|
| Dos botones `Conectar calendario` en el vacío del calendario | Se queda **el pie**, que es el único que existe también cuando el panel tiene contenido. Quitar el del estado vacío modifica §11.2 | 08-13 o un barrido visual |
| `1 fallos seguidos`, agramatical y alcanzable (el umbral es uno) | Rama de singular donde vive el copy, **con el precedente ya escrito en el mismo archivo**: `rotuloDeDistancia()` le dio clave propia a `mañana` porque *«`dentro de 1 días` es agramatical»* | 08-13 |
| El `tipo_cerradura` invisible en el camino inicial de `Sin código` | **Cerrarlo NO viola el criterio 5, y el argumento ahora está medido.** Ver abajo | 08-13 |

**Sobre el tercero, que es el que tenía el argumento retorcido.** 08-09 lo dejó abierto porque
cerrarlo *«exige una prop más, y esa prop contradice el criterio de aceptación del plan»*. Leído de
nuevo con el señuelo 8 en la mano, ese criterio protege que **el valor del código** no cruce al
árbol del cliente, porque una prop no renderizada **sí** acaba en el documento: eso ya no es una
sospecha, está impreso arriba. Pero `tipo_cerradura` **no es un secreto**: es una unión cerrada de
dos valores fijada por un CHECK de la base, y conocerla no acerca a nadie a abrir una puerta.

La forma barata, y **no cuesta ni una consulta nueva**: el panel ya paga `hayCodigoDeAcceso()`, así
que basta con que esa función devuelva `{ hayCodigo, tipoCerradura }` en vez de `boolean`. El
objeto entero de credenciales sigue sin ser nunca una variable en el ámbito de un componente que se
renderiza, que es lo que 08-09 protegía de verdad. Y si alguien se pasa de la raya al hacerlo, **el
caso que atrapa el exceso ya está escrito**: afirma contra el documento entero, y su señuelo está
reproducido arriba.

## Verificación

| Comprobación | Resultado |
|---|---|
| `npx playwright test e2e/apartamentos-lista.spec.ts e2e/calendario.spec.ts` | **29 passed** |
| `npx tsc --noEmit` | limpio |
| `npm run ci:arch` | los tres guardarraíles en OK |
| `npm run lint` | 0 errores, los **2 warnings preexistentes** de archivos de test que este plan no toca |
| `npm run test:unit` | **1244 en verde**, 65 archivos |
| `npm run test:integration` | **205 en verde**, 23 archivos |

**Los greps de aceptación, con su línea base y su valor de ahora:**

```
                                          antes   ahora   pedido
grep -c "scrollTop\|scrollY"                  1       9   ≥2
grep -c "esperarUrlDeCliente"                 0       6   ≥2
grep -c "getByRole('dialog')"                 0       9   ≥4
grep -c "page.content()\|paginaAdmin.content()"  0    2   ≥1
grep -c "waitForTimeout"                      0       0   no aumenta
grep -c "locator('main')"                     0       0   no aumenta
grep -c "esperarControlHidratado"             0       6   —
```

**El diff de este plan:**

```
git diff --name-only 711724a~1..HEAD        e2e/apartamentos-lista.spec.ts
git diff --shortstat  711724a~1..HEAD       1 file changed, 648 insertions(+), 1 deletion(-)
git diff --name-only  … -- 'app/(cleaner)'  0 archivos
```

**Un archivo, y la única línea borrada es la del import.** El archivo de planificación
(`deferred-items.md`) va en el commit de documentación, aparte.

**Y la limpieza de la base, comprobada después de la corrida completa:**

```
unidades 39 | feeds [] | secretos []
```

Las dos credenciales sembradas y el feed no sobreviven a la suite. Importa más de lo que parece:
un código de prueba olvidado en la base es un secreto que nadie sabe que está ahí, y un feed activo
olvidado cambia los conteos de las suites de integración sin que nada apunte a este archivo.

## El estado de la suite E2E completa, y los dos rojos que no son de este plan

```
140 passed · 1 skipped · 2 failed        (2.9 min)
```

**De 133 a 140 pasando: los siete casos nuevos, y ni una regresión.**

| Rojo | De quién es |
|---|---|
| `e2e/operacion-alertas.spec.ts:341` | **Declarado en `deferred-items.md` por 08-11.** Depende de la hora a la que se corra la suite: el caso siembra `HORA LÍMITE VENCIDA` a las 00:01 de hoy y `CALENDARIO CAÍDO` a `ahora − 4 h`, así que antes de las 04:01 las dos se intercambian. **Esta corrida fue a las 00:56.** El orden que la pantalla pinta es el cronológicamente correcto; lo que está mal es la expectativa del caso |
| `e2e/push-instalacion.spec.ts:248` (E3) | **Declarado en `deferred-items.md` por 08-02.** Es el flake del árbol del aseador que solo aparece en la corrida completa. **Comprobado en esta misma sesión:** `npx playwright test e2e/push-instalacion.spec.ts` da **5 pasando, 1 saltado, 0 rojos**. 08-02 lo vio en el caso E2 (`:215`) y esta corrida en el E3 (`:248`): es el mismo mecanismo, un caso más abajo del mismo archivo |

**Ninguno de los dos toca nada que este plan haya escrito**, y los dos viven bajo el árbol del
aseador o de alertas, que este plan no modifica. No se arreglaron, y es la regla de alcance.

## Deviations from Plan

### Auto-fixed Issues

**1. [Regla 3 - Bloqueo] La lectura del cluster tuvo que acotarse al valor del select**

- **Encontrado durante:** Task 1, en el primer rojo de los controles.
- **Problema:** leer el disparador del select entero devuelve `Bogotá 1▼`: arrastra el glifo del
  chevron. El control del escenario lo atrapó de inmediato.
- **Arreglo:** la lectura se acota a `[data-slot="select-value"]`. Queda anotado en el código.
- **Commit:** `711724a`

**2. [Regla 3 - Bloqueo] La ausencia de aviso de error no se puede contar por rol**

- **Encontrado durante:** Task 2, escribiendo el caso de §11.4.
- **Problema:** `getByRole('alert')` devolvió **1** sobre una pantalla sin ningún aviso. Medido con
  un andamio: es el `<div id="__next-route-announcer__" role="alert">` vacío que el enrutador de
  Next monta en cada página. Contra el rol, esa aserción sería roja en cualquier pantalla del
  producto.
- **Arreglo:** se cuenta el componente del sistema de diseño (`[data-slot="alert"]`), con el
  porqué escrito en el caso para que nadie lo «arregle» de vuelta.
- **Commit:** `840da50`

**3. [Regla 3 - Bloqueo] El cuerpo de la respuesta de la acción se atrapa desviando la petición**

- **Encontrado durante:** Task 3.
- **Problema:** `waitForResponse(...).text()` falla con *«Response body is not available for a
  response that was navigated away from»*. La acción revalida y el enrutador navega antes de que la
  prueba pida el cuerpo.
- **Arreglo:** `page.route` + `route.fetch()` + `route.fulfill()`, leyendo el cuerpo antes de
  devolvérselo al documento. Con su razón escrita en el caso, porque el siguiente que quiera mirar
  lo que devuelve una Server Action va a escribir `waitForResponse` primero.
- **Commit:** `eb157f8`

### Lo que se dejó fuera a propósito

- **Los tres huecos de contrato**, con su decisión escrita en `deferred-items.md`. Ver la sección
  de arriba: son cambios de producto y el diff de este plan es de un solo archivo de pruebas.
- **Los dos rojos de la suite completa.** Los dos están declarados y ninguno toca este plan.

### Auth gates

Ninguno.

## Known Stubs

Ninguno. Los siete casos corren contra datos reales y los siete se vieron en rojo.

## Threat Flags

Ninguno. El plan no introduce superficie: no hay endpoint nuevo, no hay cambio de schema, y el
único diff de producto fue temporal, de las contra-pruebas, y está revertido.

**Y los cinco del registro se cubrieron:**

| Amenaza | Cómo se cerró |
|---|---|
| T-08-57 · el código de acceso en el documento de una dirección compartible | Aserción contra el contenido del documento entero, **con su señuelo en rojo pasando la prop sin renderizarla** |
| T-08-58 · la credencial del calendario arrastrada en la respuesta de la acción | Aserción propia sobre el cuerpo de la respuesta, con su señuelo (`...secretos`) en rojo |
| T-08-59 · un caso nuevo acotado por un contenedor que el portal deja vacío | Todo contenido de panel se acota a `getByRole('dialog')`: 9 ocurrencias, y `locator('main')` sigue en 0 |
| T-08-60 · el criterio 1 afirmado por visibilidad de fila | Se lee la posición de desplazamiento (9 ocurrencias de `scrollY`), con su señuelo quitando la desactivación del salto |
| T-08-61 · el criterio 3 afirmado solo por desaparición del diálogo | Las dos mitades por separado, con el señuelo que devuelve el reemplazo y el `about:blank` impreso |

## Lo que este plan le deja escrito a los que vienen

**A `08-13` (los casos nuevos y la accesibilidad).** Cuatro encargos, los tres primeros con su
decisión ya tomada en `deferred-items.md`:

1. **El `tipo_cerradura` del estado inicial.** Cerrarlo es cambiar el booleano de
   `hayCodigoDeAcceso()` por `{ hayCodigo, tipoCerradura }`. Cero consultas nuevas, y el criterio 5
   no se toca: la prueba de que el límite está donde está, impresa arriba.
2. **Los dos `Conectar calendario`** y **`1 fallos seguidos`**, con su recomendación.
3. **`operacion-alertas:341`**, que sigue abierto con su aritmética.
4. **Los tres helpers de este archivo son reutilizables tal cual**: `medirElSitio()`,
   `abrirDesdeElDocumento()` y el centinela del remonte. El criterio 1 hay que afirmarlo en los
   otros tres anfitriones, y ahí la única pieza que cambia es cuál es el estado de cliente que se
   mide.

**A quien escriba el próximo caso que mire una Server Action:** el cuerpo se atrapa con
`page.route`, no con `waitForResponse`. La razón está en el caso del secreto, con el error literal.

**A `08-14` (la puerta de la fase).** Cuatro cosas que cruzar:

- **Las ocho filas de señuelos de arriba**, cada una con su rojo real citado. Las cinco del
  registro de amenazas están cubiertas.
- **De 133 a 140 pasando en E2E.** Los siete casos nuevos.
- **Los dos rojos de la corrida completa NO son regresiones de la fase**, y los dos están en
  `deferred-items.md` con su medición. El de alertas depende de la hora (esta corrida fue a las
  00:56, dentro de su ventana); el de push da 0 rojos corriendo su archivo solo.
- **Los criterios 1, 2 y 3 ya no son referencia faltante** sobre `/apartamentos`. En los otros tres
  anfitriones siguen sin afirmarse, y eso es material de 08-13.

## Self-Check: PASSED

**Archivos declarados, comprobados en disco:**

- `e2e/apartamentos-lista.spec.ts` — FOUND
- `.planning/phases/08-paneles-laterales-en-el-admin/deferred-items.md` — FOUND

**Commits declarados, comprobados en `git log`:**

- `711724a` — FOUND
- `840da50` — FOUND
- `eb157f8` — FOUND

**Archivos desechables, comprobados como AUSENTES, que es lo correcto:**

- `e2e/_andamio-0812.spec.ts` — NO EXISTE
- `app/(admin)/apartamentos/loading.tsx` — NO EXISTE (y sigue prohibido)

**El árbol de producto, comprobado sin restos de las ocho contra-pruebas:**

```
git status --short          M e2e/apartamentos-lista.spec.ts   (antes de commitear)
git diff --name-only 711724a~1..HEAD        un solo archivo
```
