---
phase: 08-paneles-laterales-en-el-admin
plan: 02
tipo: medicion
fecha: 2026-09-17
entorno: "next 15.5.24 · build de produccion (next build + next start) · chromium 1.62.1 con channel chromium · Supabase local · puerto 3210"
lo_lee: ["08-06", "08-07", "08-08", "08-11", "08-14"]
---

# Fase 8 Plan 02 · La medicion del criterio 1 y el barrido del portal

**Dos preguntas que no se resuelven leyendo. Las dos estan medidas, cada escenario
tres veces, y la segunda mitad del documento es el inventario que el plan 08-11
ejecuta sin volver a investigar.**

> **Como leer este documento.** La seccion **VEREDICTO** del final esta escrita
> como instruccion ejecutable, no como observacion. Los planes 08-06, 08-07 y
> 08-08 leen esa seccion y toman la rama que les diga. El resto del documento es
> la evidencia que la sostiene.

---

## 0. El titular, en cuatro lineas

| Lo que el research esperaba | Lo medido |
|---|---|
| El sospechoso era `loading.tsx`, y el filtro era lo que estaba en peligro | **Al reves de lo que se temia y al reves de lo que se esperaba a la vez** |
| — | **El filtro SOBREVIVE entero**, en los dos anfitriones, en las dos direcciones |
| — | **El scroll SE PIERDE**, en los dos anfitriones, en las dos direcciones |
| — | **Y `loading.tsx` SI es el culpable, pero del scroll, no del filtro.** Aislado con el archivo apartado: sin el, el scroll se conserva |
| — | **El esqueleto del segmento NUNCA se pinta.** Cero apariciones en 12 corridas |

La segunda linea y la tercera juntas son el hallazgo: el criterio 1 promete dos
cosas y hoy solo se cumple una. Y la cuarta dice exactamente que hay que tocar.

---

## 1. Como se monto la medicion

**El andamio, desechable y ya revertido** (Task 3 de este mismo plan):

| Archivo | Que hacia |
|---|---|
| `app/(admin)/apartamentos/_components/SheetSpike.tsx` | El panel mas tonto posible: `Sheet` que solo pinta el nombre, `open` fijo, cierre con `router.replace('/apartamentos', { scroll: false })` |
| `app/(admin)/apartamentos/page.tsx` | Lee `?apartamento={id}` de `searchParams` en el servidor y renderiza el panel. Mas un enlace **de control** a `?control=1` con `scroll={false}` que NO abre panel |
| `TablaApartamentos.tsx` | El enlace de la celda de nombre pasa a `/apartamentos?apartamento={id}` con `scroll={false}` |
| `app/(admin)/operacion/_components/SheetSpikeAseo.tsx` | El gemelo para `/operacion`, cerrando con los parametros del anfitrion conservados |
| `app/(admin)/operacion/page.tsx` + `FilaAseo.tsx` | Lo mismo con `?aseo={id}` |
| `e2e/spike-criterio-1.spec.ts` | La medicion. No afirma: mide e imprime |

**Como se midio cada cosa, y ninguna se miro a ojo:**

| Que | Instrumento |
|---|---|
| El esqueleto del segmento | Un `MutationObserver` instalado ANTES de navegar que cuenta cada entrada al DOM de un nodo que contenga el texto `sr-only` de `loading.tsx` (`Cargando apartamentos` / `Cargando la operación del día`). **Cero apariciones = el fallback del segmento no se pinto** |
| El filtro | `input[type="search"].value`, `[aria-label="Filtrar por cluster"].textContent` y `[aria-label="Ver solo pendientes"]@aria-checked`, leidos **del DOM** |
| El scroll | `window.scrollY` antes y despues, mas una traza con `setInterval` de 25 ms que registra a la vez `scrollY`, `scrollHeight`, el numero de dialogos, `html.style.overflow`, `body.style.position` y `location.search` |
| Quien mueve el scroll | `window.scrollTo` y `window.scroll` parcheados, registrando argumentos y pila |
| La URL | **`esperarUrlDeCliente()`** de `e2e/fixtures.ts`, que sondea desde Node. Ninguna medicion usa `page.waitForURL` ni `expect(page).toHaveURL` |

### 1.1 Dos sesgos del instrumento, encontrados y corregidos

Los dos producian el resultado "el scroll se pierde", que es justo lo que se
queria medir. Si no se hubieran encontrado, el veredicto habria sido el correcto
por la razon equivocada.

**Sesgo 1: `locator.click()` de Playwright hace `scrollIntoViewIfNeeded` antes de
pulsar.** Con el enlace arriba y la pagina desplazada abajo, el runner **sube la
pagina y luego pulsa**, asi que `scrollY` ya valia 0 antes de que el producto
hiciera nada. Medido en la primera corrida: `1969 -> 0` en un escenario de
control que ni siquiera abria panel. **Corregido** disparando el clic desde el
DOM (`el.click()`), que React recoge igual por delegacion y no mueve nada.

**Sesgo 2: con el panel abierto, `getByRole` deja de ver la pagina de detras.**
Base UI marca el resto del documento como oculto para la accesibilidad, asi que
`getByRole('combobox', …)` se queda esperando un elemento que **si esta en el
DOM**. La primera corrida se colgo 120 s por esto. **Corregido** leyendo del DOM.
**Esto ya es un hallazgo de la fase, no solo del spike**, y esta anotado en el
barrido de la seccion 4: es la otra cara del Hallazgo 4.

**Ruido residual, declarado:** un clic disparado desde el DOM se pierde de vez en
cuando porque el localizador se resuelve dos veces (una para comprobar la
hidratacion con `esperarControlHidratado()`, otra para pulsar) y entre las dos
React puede haber reemplazado el nodo. Medido: ~2 de 3 corridas en grupo, 0 de 1
aislado. **Y cuando se pierde, la URL no cambia Y EL SCROLL SE QUEDA INTACTO**,
que es una confirmacion adicional de quien lo mueve. Resuelto con reintento
anotado; todas las cifras de abajo son de corridas con `navego: true`.

---

## 2. ESCENARIO A · `/apartamentos`

Preparacion: buscador con `a`, cluster `Bogotá 1`, `Ver solo pendientes`
encendido (23 filas visibles de 39), y el scroll al fondo (`scrollY = 1057`, que
es el maximo del documento).

Se abre el panel con el enlace de la **ultima fila visible** y se cierra con
`Escape`, que es lo que dispara el `router.replace(ruta, { scroll: false })`.

### 2.1 Las cinco preguntas al ABRIR

| # | Pregunta | Respuesta | Como se midio |
|---|---|---|---|
| A1 | ¿Aparece el esqueleto de `apartamentos/loading.tsx`? | **NO** | `MutationObserver`: **0 apariciones** en las 3 corridas |
| A2 | ¿El texto del buscador sigue escrito? | **SI** | `input[type=search].value` = `"a"` antes y despues, 3 de 3 |
| A3 | ¿El cluster elegido sigue elegido? | **SI** | `[aria-label="Filtrar por cluster"].textContent` = `"Bogotá 1"` antes y despues, 3 de 3 |
| A4 | ¿La marca de solo pendientes sigue marcada? | **SI** | `@aria-checked` = `"true"` antes y despues, 3 de 3 |
| A5 | ¿El scroll sigue donde estaba? | **NO** | `window.scrollY`: **1057 -> 0**, 3 de 3 |

### 2.2 Las cinco preguntas al CERRAR

| # | Pregunta | Respuesta | Como se midio |
|---|---|---|---|
| A1' | ¿Aparece el esqueleto? | **NO** | 0 apariciones, 3 de 3 |
| A2' | ¿La busqueda sigue escrita? | **SI** | `"a"`, 3 de 3 |
| A3' | ¿El cluster sigue elegido? | **SI** | `"Bogotá 1"`, 3 de 3 |
| A4' | ¿Solo pendientes sigue marcada? | **SI** | `"true"`, 3 de 3 |
| A5' | ¿Vuelve el scroll? | **NO** | Se queda en `0`. **Cerrar no lo devuelve, porque ya se habia perdido al abrir** |

Y ademas: `filas` vale 23 en los tres momentos. La lista filtrada no se recompone
ni se recalcula, lo que confirma desde otro angulo que el subarbol no se remonto.

### 2.3 Las tres corridas, una por una

| Corrida | Intentos de clic | busqueda | cluster | pendientes | scroll antes / abierto / cerrado | esqueleto |
|---|---|---|---|---|---|---|
| 1 | 1 | `a` / `a` / `a` | igual | `true` / `true` / `true` | **1057 / 0 / 0** | 0 / 0 |
| 2 | 2 | `a` / `a` / `a` | igual | `true` / `true` / `true` | **1057 / 0 / 0** | 0 / 0 |
| 3 | 1 | `a` / `a` / `a` | igual | `true` / `true` / `true` | **1057 / 0 / 0** | 0 / 0 |

Cero errores de consola en las tres.

### 2.4 ESCENARIO A-bis · el scroll con la lista completa

Sin filtro, 39 filas, la fila 28 traida al centro del viewport y pulsada desde
ahi. Es el caso literal del enunciado del plan.

| Corrida | scroll antes / abierto / cerrado | filas | esqueleto |
|---|---|---|---|
| 1 | **1567 / 0 / 0** | 39 / 39 / 39 | 0 / 0 |
| 2 | **1567 / 0 / 0** | 39 / 39 / 39 | 0 / 0 |
| 3 | 0 / 0 / 0 *(la fila 28 ya estaba en pantalla)* | 39 / 39 / 39 | 0 / 0 |

### 2.5 ESCENARIO A-control · la navegacion SIN panel

Es el escenario que decide de quien es la culpa. Un `<Link href="/apartamentos?control=1" scroll={false}>`
que navega del lado del cliente **y no abre ningun dialogo**.

| Corrida | scroll antes | scroll despues | ¿se puede devolver a mano? | dialogos | esqueleto |
|---|---|---|---|---|---|
| 1 | 1969 | **0** | **si, 1969** | 0 | 0 |
| 2 | 1969 | **0** | **si, 1969** | 0 | 0 |
| 3 | 1969 | **0** | **si, 1969** | 0 | 0 |

**Conclusion 1: el scroll NO lo pierde el panel.** Lo pierde la navegacion de
cliente, sin dialogo de por medio, con `scroll={false}` puesto.

**Conclusion 2: se puede devolver a mano.** Un `window.scrollTo(0, y)` posterior
restaura la posicion y esta se queda: 1969 en las tres corridas.

### 2.6 La traza, y lo que descarta

Traza tipica de la apertura (solo los puntos donde algo cambio):

```json
[
  { "ms": 26,  "y": 1057, "alto": 1777, "maxY": 1057, "dlg": 0,
    "htmlOverflow": null, "bodyPos": null, "url": "" },
  { "ms": 102, "y": 0,    "alto": 1777, "maxY": 1057, "dlg": 1,
    "htmlOverflow": null, "bodyPos": null, "url": "?apartamento=5eed…0023" },
  { "llamadasAScrollTo": [] }
]
```

Lo que esto **descarta**:

- **No es el bloqueo de scroll del dialogo.** `html.style.overflow` y
  `body.style.position` estan vacios en todo momento, y el caso de control lo
  pierde igual sin dialogo ninguno.
- **Nadie llama a `window.scrollTo` ni a `window.scroll`.** Los dos estan
  parcheados y el registro sale vacio. El reset lo hace otra cosa (un
  `scrollIntoView` o una escritura directa de `scrollTop`), o lo hace el propio
  navegador al clampar.
- **El documento no se acorta entre dos muestras de 25 ms.** `alto` y `maxY` son
  constantes en la traza. Si el desmontaje del fallback acorta el documento, dura
  menos que el intervalo de muestreo.

---

## 3. ¿Y `loading.tsx`? El experimento A/B que cierra el caso

El research apuntaba a `loading.tsx` como sospechoso. **Lo es, y se aislo
apartando el archivo del arbol y repitiendo la misma medicion.**

### 3.1 `/apartamentos`

| Rama | Corridas | busqueda / cluster / pendientes | **scroll antes -> abierto** | esqueleto |
|---|---|---|---|---|
| **CON** `apartamentos/loading.tsx` | 3 | se conservan las tres | **1057 -> 0** | 0 |
| **SIN** `apartamentos/loading.tsx` | 3 | se conservan las tres | **1057 -> 1057** | 0 |

Y el escenario de control, que es el mismo experimento sin panel:

| Rama | Corridas | **scroll antes -> despues** |
|---|---|---|
| **CON** `loading.tsx` | 3 | **1969 -> 0** |
| **SIN** `loading.tsx` | 3 | **1969 -> 1969** |

### 3.2 `/operacion`

| Rama | Corridas | estado de cliente | **scroll antes / abierto / realtime / cerrado** | esqueleto |
|---|---|---|---|---|
| **CON** `operacion/loading.tsx` | 3 | se conserva | **277 / 0 / 0 / 0** | 0 |
| **SIN** `operacion/loading.tsx` | 3 | se conserva | **277 / 277 / 277 / 277** | 0 |

### 3.3 Que significa, y por que encaja con lo que el repo ya sabia

`loading.tsx` es el fallback de Suspense **del segmento**, y la cabecera de
`app/(admin)/finanzas/page.tsx` ya lo dejo escrito con ocho corridas: *"tambien
se aplica cuando solo cambian los parametros de la consulta"*. Esta medicion lo
confirma sobre otras dos rutas y añade el mecanismo:

- El fallback **se activa** al cambiar `?apartamento=`, aunque **no llegue a
  pintarse**: la respuesta RSC vuelve en ~70 ms y el observador no ve ni un nodo
  del esqueleto.
- Al activarse, el contenido del segmento se desmonta un instante. El documento
  pierde altura, el navegador clampa `scrollY` a 0, y cuando el contenido vuelve,
  la posicion ya se perdio. Por eso nadie llama a `scrollTo`.
- **El estado de React del cliente SI sobrevive**, porque un fallback de Suspense
  no desmonta el arbol de React: lo oculta. Por eso el filtro aguanta y el scroll
  no. Las dos mitades del criterio 1 tienen comportamientos distintos y era
  razonable esperar que corrieran la misma suerte.

**El precedente de `/finanzas` y el de `/finanzas/pagos` NO se contradicen, y
ahora se sabe por que.** En `/finanzas`, con `loading.tsx`, lo que se colgaba era
la transicion de `FiltroPeriodo`, que navega con `router.push` dentro de
`useTransition`. En `/finanzas/pagos` el panel funciona **porque esa pantalla no
tiene nada de scroll que perder ni filtro de cliente que conservar**: el defecto
esta ahi, simplemente no se ve.

---

## 4. ESCENARIO B · `/operacion`, con Realtime

Preparacion: `?alertas=atendidas` en la direccion, el bloque `Mañana` expandido a
mano (nace colapsado), y el scroll en 277, que es el maximo del documento con
seis aseos sembrados.

Siembra: `sembrarOperacion()` mas seis aseos repartidos entre hoy y mañana sobre
tres apartamentos gestionados. Limpieza con `limpiarOperacion()` en el `afterAll`.

### 4.1 Las cinco preguntas

| # | Pregunta | Respuesta | Como se midio |
|---|---|---|---|
| B1 | ¿Aparece el esqueleto de `operacion/loading.tsx`? | **NO** | 0 apariciones, 3 de 3 |
| B2 | ¿El estado de cliente de la pantalla sobrevive? | **SI** | Los 17 `aria-expanded` del documento, identicos antes / abierto / realtime / cerrado, 3 de 3. `Hoy=true`, `Mañana=true` (expandido a mano), `Siguientes=false` |
| B3 | ¿El scroll sigue donde estaba? | **NO** | **277 -> 0**, 3 de 3. Y sin `loading.tsx`, **277 -> 277**, 3 de 3 |
| B4 | ¿Cerrar lo devuelve? | **NO** | Se queda en 0 |
| B5 | Realtime con el panel abierto: ¿cierra, parpadea o no lo toca? | **NO LO TOCA** | Ver 4.2 |

> El panel de alertas no tenia chips en esta siembra (`chips: []` en las tres
> corridas), asi que su filtro `useState` no se pudo ejercer. El estado de
> cliente medido en B2 es el de los bloques de dia, que es el equivalente.

### 4.2 El evento de Realtime, con el panel abierto

Se actualizo `cleanings.num_huespedes` de un aseo pendiente **desde una sesion de
servicio, fuera del documento**, con el panel abierto, y se espero 6 s.

| Que | Medido, 3 de 3 |
|---|---|
| ¿Se disparo el evento? | **si** |
| Paneles abiertos despues | **1**. No se cerro |
| URL despues | la misma, con su `?aseo={id}` |
| Estado de cliente despues | identico. Ni un `aria-expanded` cambiado |
| Esqueleto del segmento | **0 apariciones** |
| Scroll | sin cambio respecto al valor que ya tenia |

Esto **confirma la afirmacion de la cabecera de `SincronizacionEnVivo.tsx`**
(*"`router.refresh()` CONSERVA EL ESTADO DEL CLIENTE"*) ahora tambien con un
panel abierto encima. El Pitfall 4 del research queda medido en su mitad
tranquilizadora. **Lo que este spike NO midio** es la otra mitad: el coste de
volver a emitir las lecturas y las firmas de URL en una rafaga de quince eventos.
Ese panel no existia; se mide cuando exista.

### 4.3 Un hallazgo que no estaba en el plan: abrir tambien borra los parametros

El andamio abria con `href="/operacion?aseo={id}"`, una ruta y una consulta
constantes. **Medido: al abrir, el `?alertas=atendidas` del anfitrion
desaparecio**, y el cierre ya no tenia nada que conservar.

Es el **Pitfall 2** del research, pero desplazado: el research lo describe sobre
el CIERRE (`router.replace('/ruta/fija')`). Esta medicion enseña que **el enlace
que ABRE tiene el mismo problema y llega antes**. Componer bien el cierre no
sirve de nada si el `href` de apertura ya se llevo los parametros por delante.

**Consecuencia directa para los planes 08-06, 08-07 y 08-08:** los seis enlaces
de apertura se componen desde los parametros vivos de la pantalla, añadiendo el
suyo, **nunca** con una consulta literal. Y `/operacion` es el caso con
parametro propio hoy (`?alertas=atendidas`); `/finanzas` lo tiene doble
(`?rango=` y `?ancla=`), que es justo lo que la asercion de ancla de
`e2e/finanzas.spec.ts` atrapa.

---

## 5. El barrido del portal

*(Lo escribe la Task 2. Ver seccion 6.)*
