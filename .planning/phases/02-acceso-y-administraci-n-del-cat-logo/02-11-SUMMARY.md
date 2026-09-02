---
phase: 02-acceso-y-administraci-n-del-cat-logo
plan: 11
subsystem: catalogo-de-apartamentos-ui
tags: [rsc, client-component, tabla, filtrado, accesibilidad, sticky, playwright]

# Dependency graph
requires:
  - phase: 02-02
    provides: "estadoDeApartamento(), normalizar() y formatCOP()"
  - phase: 02-06
    provides: "exigirAdmin() y los fixtures de sesión de Playwright"
  - phase: 02-07
    provides: "El shell del admin, EstadoVacio, los tokens de tabla y la deuda medida del sticky"
  - phase: 02-10
    provides: "listarApartamentos, listarClusters, activarApartamento y desactivarApartamento"
provides:
  - "/apartamentos: las 39 unidades en una pantalla, con buscador, filtro de cluster y banner de montaje"
  - "filtrarApartamentos() y resumenDelCatalogo(): el filtrado y los conteos como funciones puras con tests"
  - "EstadoApartamento y LeyendaDeEstados: los 4 estados con sus tres canales"
  - "BannerMontaje: progreso sobre las gestionadas, con denominador derivado"
  - "MenuApartamento y DialogoDesactivarApartamento: las acciones de fila"
  - "Table de shadcn con containerClassName: el arreglo del sticky que el 02-07 dejó pendiente"
  - "e2e/apartamentos-lista.spec.ts: 14 tests, el criterio 5 del ROADMAP"
affects: [02-12, 02-13, 02-14, 02-15]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "El sticky vertical y el sticky horizontal de una tabla son incompatibles por construcción: cada uno necesita un scrollport distinto, así que cada uno vive en su rango de viewport"
    - "La lógica de filtrado sale del componente a lib/domain/ para poder tener tests: dentro de un useMemo solo la ve un navegador"
    - "`getByRole(name:)` de Playwright casa por SUBCADENA: `Desactivar` contiene `activar`, igual que `Inactiva` contiene `activa`"
    - "Una leyenda que repite las etiquetas como literales se desincroniza de las filas: se derivan de la misma función"
    - "Un conteo esperado se consulta a un oráculo INDEPENDIENTE de la función que se prueba, o el test es un falso verde por construcción"

key-files:
  created:
    - app/(admin)/apartamentos/page.tsx
    - app/(admin)/apartamentos/loading.tsx
    - app/(admin)/apartamentos/_components/TablaApartamentos.tsx
    - app/(admin)/apartamentos/_components/EstadoApartamento.tsx
    - app/(admin)/apartamentos/_components/BannerMontaje.tsx
    - app/(admin)/apartamentos/_components/MenuApartamento.tsx
    - app/(admin)/apartamentos/_components/DialogoDesactivarApartamento.tsx
    - e2e/apartamentos-lista.spec.ts
  modified:
    - lib/domain/properties.ts
    - lib/domain/properties.test.ts
    - components/ui/table.tsx
    - app/globals.css

key-decisions:
  - "La deuda del sticky de 02-07 se ARREGLA, no se re-difiere: el `Table` de shadcn gana `containerClassName` y la tabla recupera el viewport como scrollport a partir de 1280px"
  - "El sticky horizontal de §6.3 y el vertical de §7.2 no pueden coexistir: se reparten por breakpoint, y la razón queda escrita en el componente"
  - "El filtrado y los conteos salen a `lib/domain/properties.ts` como funciones puras, porque dentro del componente son intestables"
  - "La toolbar y el banner viven DENTRO de `TablaApartamentos` y no en `page.tsx`: los tres controles son estado de cliente y el tercero está dentro del propio banner"
  - "El buscador matchea también `contacto_externo`, pero SOLO en informativas: es lo que la columna RESPONSABLE enseña en esas filas"
  - "El e2e siembra una Activa y una Inactiva porque la semilla no tiene ninguna de las dos, y exige el conteo EXACTO de las cuatro etiquetas"
  - "El número esperado del buscador se consulta a la base CON la tilde: un oráculo independiente de `normalizar()`"
  - "La deuda del sticky gana una puerta que mide POSICIONES, porque ningún test de texto puede verla"

patterns-established:
  - "Toda aserción negativa lleva un CONTROL delante que demuestra que la cosa existía"
  - "Romper la invariante a propósito antes de creerle al verde: cinco señuelos, cinco rojos, cero atrapados por tsc"

requirements-completed: [APTO-01, APTO-11]

# Metrics
duration: 62min
completed: 2026-09-02
---

# Fase 02 Plan 11: La pantalla que el producto se juega

**Las 39 unidades reales en una pantalla, con los cuatro estados leídos por forma, texto y color a la vez, y con el banner de montaje contando sobre las 34 gestionadas y no sobre las 39. El trabajo real del plan no fue pintar la tabla: fue cerrar la deuda que el 02-07 dejó medida y que aquí muerde de verdad —el encabezado sticky que se iba con el scroll a los −224px— y montar un fixture E2E que discrimine, porque sobre la semilla del día uno TODAS las filas comparten estado y cualquier aserción de "aparece Incompleta" pasa con un componente que ignora sus props.**

## Performance

- **Duración:** 62 min
- **Tareas:** 3 de 3, todas autónomas, ninguna pendiente
- **Commits:** 6
- **Archivos creados/modificados:** 12

## Task Commits

| # | Qué | Commit |
|---|---|---|
| — | Tokens de columna + `containerClassName` en `Table` (arreglo de la deuda de 02-07) | `9cebfd0` |
| — | `filtrarApartamentos()` y `resumenDelCatalogo()` + 15 tests (desviación, Regla 2) | `e11d9f6` |
| 2 | Banner de montaje, menú de fila y diálogo de baja | `b60a994` |
| 1 | Presentación de los 4 estados y tabla densa | `b6dc90b` |
| 3 | Pantalla `/apartamentos` y skeleton geométrico | `d8bdf7e` |
| 3 | `e2e/apartamentos-lista.spec.ts`, 14 tests | `9b44646` |

Las tareas 1 y 2 van en ese orden invertido a propósito: `TablaApartamentos` importa `BannerMontaje` y `MenuApartamento`, así que commitear la tarea 1 primero habría dejado un commit que no compila.

---

## Puertas, con los números reales

Corridas todas de nuevo al cerrar, sobre el código final y sin señuelos:

| Puerta | Resultado | Antes de este plan |
|---|---|---|
| `npm run ci:arch` | **OK**, 8 guardarraíles | OK, 8 |
| `npx tsc --noEmit` | **limpio** (exit 0) | limpio |
| `npm run test:unit` | **216 tests**, 14 archivos | 202, 14 |
| `npm run test:integration` | **41 tests**, 4 archivos | 41, 4 |
| `npx playwright test` | **51 tests** | 37 |
| `npm run build` | **OK**, `/apartamentos` como dinámica | OK |
| Semilla al terminar | **39 / 8 clusters / 5 informativas**, 0 activas, 0 residuos | 39 / 8 / 5 |
| Restos del spec en la base | **0 secretos, 0 aseos, 0 perfiles, 0 feeds** | — |
| Valores arbitrarios bajo `app/(admin)/apartamentos/` | **cero** | — |
| Utilidades de token nuevas emitidas en el CSS | las **10**, todas a `var(--…)` | — |

Ninguna en rojo. Los 14 tests E2E nuevos y los 14 unitarios nuevos son de este plan.

---

## 1. La deuda de 02-07: arreglada, y con puerta

El plan 02-07 la dejó escrita en `TablaAseadores.tsx` y en su resumen: *"el `sticky` del encabezado **no funciona** dentro del contenedor `overflow-x-auto` del `Table` de shadcn. Con 8 filas no se nota; con 39 sí."*

La causa es de CSS y no de configuración: un `overflow-x` distinto de `visible` hace que el eje contrario compute a `auto`, y entonces ese `div` pasa a ser el **scrollport** de cualquier `position: sticky` de dentro, en vez del viewport. Como el div no tiene recorrido vertical propio, el sticky nunca se activa mientras la página baja.

**No se arregla añadiendo clases al encabezado.** Se arregla devolviéndole el scrollport al viewport, y eso era imposible desde fuera: `components/ui/table.tsx` renderiza el contenedor con la clase fija y sin aceptar `className`. Se le añade `containerClassName`, que es un cambio de una línea sobre el archivo del CLI.

### 1.1 El conflicto que el contrato no ve

§7.2 pide encabezado `sticky top: 56px`. §6.3 pide que, entre 1024 y 1280px, la tabla haga **scroll horizontal dentro de su card** con `NOMBRE` fija a la izquierda.

**Las dos cosas no pueden ser ciertas a la vez en el mismo elemento.** El sticky vertical necesita que el contenedor NO sea scrollport; el sticky horizontal necesita que SÍ lo sea. No es un bug de implementación: es la definición de `position: sticky`.

Se reparten por rango, que es lo único coherente:

| Viewport | Contenedor | Qué se obtiene |
|---|---|---|
| ≥ 1280px (el mínimo soportado de §6.3) | `overflow-x: visible` | Encabezado sticky bajo la barra. Las 8 columnas suman **1004px**, así que no hay nada que desbordar |
| < 1280px | `overflow-x: auto` | Scroll horizontal en la card, con `ESTADO` y `NOMBRE` congeladas |

Y la card **no** lleva `overflow-hidden`: sería otro scrollport. Las esquinas se redondean en las celdas del encabezado (`rounded-tl-md` / `rounded-tr-md`).

### 1.2 La puerta, porque nada lo medía

Ni `tsc`, ni `ci:arch`, ni ninguna aserción de texto puede ver esto: es geometría. El E2E mide **posiciones**:

```
await paginaAdmin.setViewportSize({ width: 1440, height: 800 });
await paginaAdmin.evaluate(() => window.scrollBy(0, 600));
expect(desplazamiento).toBeGreaterThan(400);   // CONTROL: la pagina se movio
expect(despues.y).toBeGreaterThanOrEqual(0);   // el encabezado sigue dentro
```

El CONTROL no es decoración: sin él, "sigue en pantalla" pasaría trivialmente sobre una tabla que nunca se movió, que es exactamente el falso verde del plan 02-09.

Verificado en los dos sentidos. Con el arreglo revertido (señuelo E): `Expected: >= 0 / Received: -224.203125`. `tsc` limpio y `ci:arch` OK con el señuelo puesto.

---

## 2. El fixture del E2E, que era el problema de verdad

La semilla del día uno son 39 filas con `tarifa_huesped` y `pago_aseador` en NULL e `is_active = false`. Consecuencia: **las 34 gestionadas son `Incompleta` y las 5 externas son `Informativa`. `Activa` e `Inactiva` no existen en ninguna fila.**

Sobre ese catálogo, la aserción que el plan pide —"los textos `Activa`, `Incompleta`, `Inactiva` e `Informativa` están presentes en el DOM"— es un falso verde de manual:

1. Bajo la tabla hay una **leyenda** con los cuatro pares icono+etiqueta. Un `getByText('Activa')` a nivel de página la encuentra **siempre**, aunque la tabla no pinte ni un estado.
2. Aunque se acotara a las filas, `Activa` e `Inactiva` no saldrían nunca, porque ninguna fila las tiene.
3. Y `Incompleta` saldría igual con un componente que ignora sus props y pinta siempre lo mismo.

Las tres se cierran:

- El `beforeAll` siembra **exactamente una `Activa` y exactamente una `Inactiva`** por API directa. Las dos hacen falta y no son intercambiables: `Inactiva` es una unidad gestionada, **completa** y pausada a propósito, y sin ella `Incompleta` se comería su sitio, que es justo la distinción que el producto necesita.
- Todo conteo de estado va filtrado por `getByRole('row')`, nunca a nivel de página.
- Los conteos son **exactos**: 1 `Activa`, 1 `Inactiva`, 32 `Incompleta`, 5 `Informativa`. Con un componente que hardcodee cualquier estado, tres de los cuatro se caen. Medido: el señuelo B pone **3 tests en rojo**.
- Y cada etiqueta se comprueba además **en la fila que le toca**, por nombre: sin eso, los conteos podrían cuadrar con los estados repartidos al azar.

### 2.1 El oráculo del buscador

`bogota` tiene que encontrar `Bogotá 1`. El número esperado **no se calcula en JS**: se consulta a la base con `ilike '%Bogotá%'`, **con la tilde**, del lado del servidor.

Es deliberado. Calcularlo con `normalizar()` —la misma función que el test prueba— haría que una normalización rota diera el mismo número en los dos lados y el test siguiera verde. Con el oráculo independiente, romper `normalizar` deja la UI en 0 mientras el esperado sigue en 25. Medido: señuelo A, **1 E2E + 6 unitarios en rojo**.

El `beforeAll` lleva además dos CONTROLES que abortan la corrida con un mensaje claro en vez de fallar lejos de la causa: que la semilla siga siendo 39/34/5, y que el término de búsqueda **discrimine** (ni 0 ni las 39).

---

## 3. Los señuelos: cinco roturas deliberadas, cinco rojos

| # | Señuelo | `tsc` | `ci:arch` | Qué se puso rojo |
|---|---|---|---|---|
| A | `normalizar` sin NFD, solo `toLowerCase()` | limpio | OK | Unitarios: **6 failed** · E2E: **1 failed** |
| B | `EstadoApartamento` hardcodea `incompleta` e ignora la prop | limpio | OK | E2E: **3 failed** |
| C | El denominador del banner pasa a `resumen.total` (39) | limpio | OK | E2E: **1 failed** |
| D | `soloPendientes` con `!is_active` en vez de la derivación | limpio | OK | Unitarios: **1 failed** · E2E: **1 failed** |
| E | Revertir el `containerClassName` del sticky | limpio | OK | E2E: **2 failed**, con `y = -224px` |

`tsc --noEmit` salió **limpio con los cinco**. Van **treinta y tres** señuelos en seis planes y treinta y tres compilaciones limpias.

El señuelo B es el que justifica todo el §2: con el fixture ingenuo de la semilla habría salido **verde**.

---

## 4. Mi propio test estaba roto, y por la misma trampa que el brief advertía

El brief avisaba de que `Inactiva` contiene `activa`. Se aplicó a `getByText` desde el principio, con `exact: true`.

**Lo que se pasó por alto es que el `name` de `getByRole` casa igual por subcadena.** El test de que una fila activa **no** ofrece `Activar` se cayó encontrando su propio `Desactivar`:

```
Locator:  getByRole('menuitem', { name: 'Activar' })
Expected: 0
Received: 1
```

Los diez matchers de `menuitem` del archivo llevan ahora `exact: true`, y la razón está escrita ahí para que nadie lo "simplifique" de vuelta. Es el mismo error de forma que el brief traía del 02-10, en un sitio distinto del esperado.

Ese mismo test ganó además una espera explícita a que el primer menú se **desmonte** antes de abrir el segundo: con los dos vivos a la vez, el conteo mide los ítems de ambos, y el log lo enseñaba (`3 × locator resolved to 2 elements`).

---

## 5. Los tres canales, y por qué la leyenda no repite literales

`EstadoApartamento` **no reimplementa el `if`**: llama a `estadoDeApartamento()` de `lib/domain/properties.ts`, que es la única derivación del repo y el espejo de los tres CHECK de `properties`. Este archivo decide solo la presentación.

| Estado | Icono | Forma | Etiqueta | Color |
|---|---|---|---|---|
| Activa | `CircleCheck` | círculo con check | `Activa` | `--status-ok` |
| Incompleta | `TriangleAlert` | **triángulo** | `Incompleta` | `--status-warn` |
| Inactiva | `CircleMinus` | círculo con menos | `Inactiva` | `--status-idle` |
| Informativa | `CircleDashed` | círculo punteado | `Informativa` | `--status-info` |

El test de verdad de "nunca color solo" es que las cuatro formas se distingan **en monocromo**. Si dos estados solo se diferenciaran por el color del mismo círculo, el icono no estaría aportando un segundo canal. Aquí el triángulo y el punteado rompen la serie.

**La leyenda saca sus cuatro etiquetas de la misma función**, llamándola con una entrada mínima por estado, en vez de repetir las cuatro cadenas. Una leyenda que dijera `Pausada` mientras la fila dice `Inactiva` es peor que no tener leyenda, y con literales duplicados eso pasa el día que alguien cambie una sola.

Cada `<span>` de estado lleva además `data-estado` con la clave del dominio: permite contar por estado sin depender de la traducción visible.

---

## 6. El banner: denominador derivado y desaparición automática

- **34 y no 39.** Las informativas no se montan —están inertes por `cl_unmanaged_is_inert`—, así que contarlas impediría llegar nunca al 100%.
- **El 34 se cuenta, no se escribe.** `resumenDelCatalogo()` recorre las filas y clasifica con `estadoDeApartamento()`. El día que el admin marque una unidad como gestión externa desde el formulario del 02-12, el denominador la sigue. Un `34` literal mentiría hasta que alguien lo notara.
- **Se cuenta sobre la lista COMPLETA, no sobre la filtrada.** Un banner cuyo denominador cambia al teclear en el buscador no mide el montaje: mide el filtro.
- **Desaparece solo.** La condición de render es "queda al menos una gestionada no activa". No se convierte en un check permanente: cumplió su función y deja de ocupar espacio sobre la tabla que el admin va a mirar todos los días.
- **`Progress` con `value`/`max` y no con un porcentaje precalculado**, para que `aria-valuenow` y `aria-valuemax` digan `1` y `34`, que es lo que la línea de texto dice, en vez de un `3%` que nadie escribió en pantalla. El E2E assertea los dos atributos.

El día uno arranca en **`0 de 34`**, no en el `6 de 34` del ejemplo del spec, y eso es correcto: las 39 filas sembradas tienen tarifas nulas e `is_active = false`. Hay un test unitario dedicado a ese caso exacto.

---

## 7. El menú de fila: la visibilidad sale de la derivación única

`Activar` aparece **solo** sobre el estado `inactiva`; `Desactivar` **solo** sobre `activa`. No hay ningún `if` sobre las columnas crudas: es cómo el menú se desincronizaría de la columna `ESTADO` de su propia fila.

- Sobre una `Incompleta`, `Activar` **no se muestra atenuado: no se muestra**. Un ítem deshabilitado que no dice por qué es peor que su ausencia, y el camino real para completarla es `Editar`.
- Sobre una `Informativa` no hay ninguna de las dos. Ofrecerle activar sería prometer una operación que `activarApartamento` rechaza: para una informativa **no hay 23514 que la respalde**, porque `props_active_requires_owner` está condicionado a `gestion_vivaguest`, y la única red es la revalidación con `esquemaActivar` que el 02-10 metió en la action.
- **Ocultar el ítem no es autorizar** (T-02-57). La autorización vive en la action.

Los tres casos tienen test, y los dos negativos llevan **CONTROL de que el menú se abrió**: sin él, `toHaveCount(0)` pasaría sobre un menú que nunca llegó a desplegarse. Es la lección del 02-09 aplicada al DOM.

---

## 8. Detalles que el contrato trata como carga y no como decoración

- **El `<a>` es el elemento focalizable**, no la fila. Vive en la celda `NOMBRE` y estira su área con `::after { inset: 0 }` sobre el `<tr>` (que va `relative`). El menú `⋯` va en una celda `relative z-10` para quedar por encima: sin eso, el clic en el `⋯` cae en el link y navega al detalle. Hay test de que el link tiene `href` de verdad y de que no hay ningún `role="button"` en la fila.
- **Sin paginación y sin virtualización.** 39 filas de 40px caben en un render y en 1080p.
- **Sin zebra.** Zebra más iconos de color es ruido; el hover va a `--canvas`.
- **`CLUSTER` en texto plano.** 39 badges es ruido.
- **Dinero con `tabular-nums`**, y el vacío como em dash con `<span class="sr-only">sin definir</span>`. Hay test de las dos mitades: que la `Incompleta` dice "sin definir" **y** que la `Activa` pinta `$ 120.000`. Sin la segunda, la primera pasaría con una tabla que nunca pinta dinero.
- **En una `Informativa` las dos columnas de dinero van vacías** aunque la fila trajera valores: por CHECK no puede tenerlos, y ahí el em dash no significa "falta" sino "no aplica".
- **`CALENDARIO` muestra un booleano, nunca la URL** (T-02-56). El icono va solo, así que lleva `aria-label` y no `aria-hidden`.
- **El contador del pie se anuncia con `aria-live="polite"`** (§13).
- **`loading.tsx` reproduce la geometría real**: banner, toolbar, encabezado de 32px y 10 filas de 40px con los anchos de §7.1. Nunca un spinner: ocupa un punto y la tabla ocupa la pantalla, así que al resolverse el contenido salta.

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Regla 3 — Bloqueante] El worktree venía con la base equivocada**

- **Encontrado durante:** el arranque. `git merge-base HEAD 68dd976` devolvía el propio HEAD, o sea que el worktree estaba **detrás** del commit base y no traía ninguno de los planes 02-01 a 02-10.
- **Arreglo:** el `git reset --hard` que el propio chequeo de arranque contempla, con el árbol limpio. Es la **cuarta vez consecutiva** (también le pasó al 02-08, 02-09 y 02-10). Ya no es una anécdota: el spawn del worktree está creando la rama desde un punto anterior al que el prompt declara.
- **Archivos versionados:** ninguno.

**2. [Regla 1 — Bug] Mi propio test de menú era un falso rojo por subcadena**

- **Encontrado durante:** la primera corrida de la Tarea 3. Detalle completo en §4.
- **Arreglo:** `exact: true` en los diez matchers de `menuitem`, más una espera al desmontaje del primer menú antes de abrir el segundo.
- **Archivos:** `e2e/apartamentos-lista.spec.ts`. **Commit:** `9b44646`.

### Añadidos deliberados sobre el plan

**3. [Regla 2] `containerClassName` en `components/ui/table.tsx` y la puerta que lo vigila**

El criterio de éxito exigía arreglar la deuda de 02-07 o re-diferirla con razón. Se arregla. Sin la prop era imposible desde fuera: el contenedor no acepta clases. Y se le añade una puerta que mide posiciones, porque ninguna puerta existente puede ver geometría. Detalle completo en §1. **Commit:** `9cebfd0`.

Efecto colateral deliberado: `TablaAseadores` sigue como estaba y su encabezado sigue sin enganchar, pero ahora **tiene arreglo disponible de una línea**. No se toca en este plan porque cambiar una pantalla que no es la de este plan, sin su test delante, es exactamente cómo se rompen cosas en silencio. Queda anotado abajo.

**4. [Regla 2] `filtrarApartamentos()` y `resumenDelCatalogo()` salen a `lib/domain/` con 15 tests**

El plan describe el filtrado como comportamiento del componente. Dentro de un `useMemo` es **intestable sin levantar un navegador**, y tiene tres trampas de lógica pura: la conjunción de los tres criterios, la comparación sin tildes y que `soloPendientes` use la derivación única. Es la misma lección que el 02-10 aprendió con `valoresDesdeFilaGuardada`, que era inexportable por vivir en un archivo `'use server'`.

Los 15 tests llevan CONTROL delante de cada aserción negativa:

| Aserción | CONTROL que la precede |
|---|---|
| `bogota` devuelve 2 de 4 | Un término inexistente devuelve **0**, así que el filtro no corta a ciegas |
| Búsqueda + cluster dan **0** | Cada criterio **por separado** devuelve filas |
| El contacto de una gestionada no es buscable | La **misma cadena**, en una fila informativa, **sí** encuentra |
| `gestionadas` ≠ `total` | El fixture **tiene** informativas (`informativas === 1`) |

**5. [Regla 2] El buscador matchea `contacto_externo`, pero solo en informativas**

El plan lista tres campos: nombre, cluster y responsable. En una unidad informativa la columna `RESPONSABLE` **enseña el contacto externo**, así que buscar `propietarios` —que está a la vista en pantalla— y no encontrar nada es un buscador roto. Se añade únicamente donde la tabla lo muestra: en una gestionada el contacto es invisible y encontrarla por él sería un resultado que el admin no puede explicar mirando la pantalla. Hay test de las dos direcciones.

**6. [Regla 2] `data-estado` en cada etiqueta de estado**

Permite contar filas por estado sin depender de la traducción visible, y hace que el DOM diga la clave del dominio.

**7. [Regla 2] Tests de más sobre lo que el plan pedía**

El plan enumera 7 aserciones E2E. El archivo lleva **14**: los tres casos del menú (informativa, incompleta y la pareja activa/inactiva), el link real, el em dash con su mitad positiva, el sticky, y que un aseador no llega a la pantalla.

### Desviaciones menores del texto del plan

**8. La toolbar y el banner viven en `TablaApartamentos`, no en `page.tsx`**

El plan pone la toolbar en la página. Los tres controles son estado de cliente y el tercero (`Ver solo pendientes`) está **dentro del banner**. Repartirlos entre el RSC y el componente de cliente obligaría a un tercer Client Component que envolviera a los dos, que es este mismo con otro nombre. La cabecera de página —título y acción primaria— sí se queda en el RSC, porque no depende de ningún filtro.

**9. El estado vacío entrecomilla el cluster cuando el buscador está en blanco**

§9.2 fija el copy `Ningún apartamento coincide con «casa azul».`, con el término del buscador. Si el admin solo filtró por cluster, ese término está vacío y saldrían unas comillas huecas. Se entrecomilla el cluster, que es igual de cierto y no inventa copy nuevo. El botón `Limpiar búsqueda` limpia los **tres** filtros, por lo mismo.

**10. La sentinela del `Select` es la cadena vacía**

`listarClusters()` descarta los clusters en blanco, así que la cadena vacía no puede colisionar con ninguna opción real. Evita el `__todos__` mágico que alguien acabaría escribiendo también en el otro lado de la comparación.

**11. El separador destructivo SÍ se pinta aquí**

El 02-07 lo omitió en el menú de aseadores porque el ítem destructivo era el primero y el separador habría sido una raya suelta contra el borde del popup. Aquí tiene por encima `Editar` y el de calendario, o sea algo de lo que separarlo, así que se respeta §7.3 al pie de la letra.

---

## Threat Model: dispositions aplicadas

| Threat ID | Disposición | Cómo quedó |
|---|---|---|
| T-02-56 | mitigate | `listarApartamentos` no selecciona ninguna de las dos credenciales (el plan 02-10 lo verificó con `grep` sobre el módulo). La columna `CALENDARIO` pinta un icono derivado de un **booleano**; ni la URL ni el código entran en el payload del RSC. `npm run build` confirma que el bundle de cliente de `/apartamentos` no importa `_actions.ts` más que por sus dos actions de activación |
| T-02-57 | mitigate | Ocultar `Activar` es UX y está escrito como tal en el archivo. La autorización real es `activarApartamento`: guard, Zod, revalidación de la fila leída con `esquemaActivar` y los tres CHECK detrás. Hay tres tests E2E de la visibilidad y el plan 02-10 dejó la integración de la autorización |
| T-02-58 | accept | Sin cambios. `contacto_externo` va truncado con el texto completo en `title`, visible solo para el admin. Es texto que él mismo escribió |
| T-02-59 | accept | Sin cambios. `filtrarApartamentos` recorre 39 filas con `normalizar()`, que no tiene alternancia anidada y por tanto no tiene backtracking. El término se normaliza **una vez fuera del bucle**, no 39 veces por pulsación |
| T-02-60 | mitigate | `force-dynamic` heredado del layout de `(admin)`. Este plan no añade ningún helper de caché ni ninguna directiva de caché, y no escribe el nombre literal de ninguno de los dos: en este repo ya han mordido cuatro veces los comentarios que citan el token que un grep vigila |

## Threat Flags

Ninguna superficie de seguridad nueva. Este plan añade **cero** Server Actions, **cero** endpoints, **cero** migraciones y **cero** cambios de schema. Consume dos actions que ya existían con su guard.

---

## Known Stubs

Tres links apuntan a rutas que todavía no existen. **No son stubs de datos: la tabla está cableada contra la base real y las 39 filas son de verdad.** Son las costuras declaradas del plan de fase:

| Link | Destino | Quién lo construye |
|---|---|---|
| `Nuevo apartamento` (CTA primaria) | `/apartamentos/nuevo` | plan **02-12** |
| `NOMBRE` de cada fila y `Editar` del menú | `/apartamentos/{id}` | plan **02-12** |
| `Conectar` / `Cambiar calendario` | `/apartamentos/{id}/calendario` | plan **02-14** |

Hasta que aterricen, pulsarlos da un 404 de Next. Es lo correcto para esta wave: la alternativa —deshabilitarlos o quitarlos— obligaría a volver a tocar esta pantalla en el 02-12 y en el 02-14, y un botón deshabilitado sin explicación es peor que un enlace que todavía no lleva a ningún sitio. El E2E assertea el `href`, no la navegación.

Nada más está stubbed. El buscador filtra de verdad, el banner cuenta de verdad, y `Activar` / `Desactivar` escriben en la base.

---

## Notas para los planes siguientes

- **02-12 (formulario), lo que hereda de aquí:**
  - Las tres rutas de la tabla de arriba son tu contrato de entrada. `/apartamentos/nuevo` y `/apartamentos/{id}` tienen que existir o esta pantalla queda con tres links muertos.
  - `estadoDeApartamento()` acepta un `Pick`, no la fila entera: se puede llamar con el estado **en vivo** del formulario para pintar el estado que tendría al guardar.
  - `filtrarApartamentos` es genérica sobre `EntradaFiltroApartamento`. Si el formulario necesita el mismo matching sin tildes en el combobox de cluster, reutiliza `normalizar()`; no lo reimplementes.
  - Sigue en pie todo lo que dejó el 02-10: `property_rooms_etiqueta_uniq` no es parcial, `hora_limite` llega con segundos, y el error vuelve con `campo` cuando `campoDeConstraint` lo reconoce.
- **Cualquier plan que añada una tabla:** si necesitas encabezado sticky, pásale `containerClassName="overflow-x-visible"` al `Table`. La clase por defecto rompe el sticky y el síntoma es silencioso.
- **`TablaAseadores` sigue con el encabezado sin enganchar.** El arreglo es una línea (`containerClassName` en su `<Table>`), pero necesita su propio test de posición delante. Con ~8 aseadores no muerde. Queda como ítem para quien toque esa pantalla.
- **Cualquier spec de Playwright nuevo:** `getByRole(name:)` casa por **subcadena**. `Desactivar` contiene `activar`, `Inactiva` contiene `activa`, `Informativa` no contiene ninguna de las dos. Usa `exact: true` siempre que la etiqueta corta sea prefijo o sufijo de otra.
- **Cualquier spec que toque `properties`:** el `afterAll` devuelve las cuatro columnas **en un solo `update`**. Los CHECK se evalúan sobre la fila final, así que bajar `is_active` en la misma sentencia en que se anulan las tarifas es lo que evita el 23514. Y este spec toma las **dos últimas** gestionadas por orden de nombre para no pisarse con `aseadores-lista.spec.ts`, que se reparte las primeras cinco; el stack local es compartido.
- **Bloqueante residual heredado de 02-01 a 02-10:** sigue pendiente un `npx supabase stop && npx supabase start` al cierre de la fase para confirmar en frío que el `config.toml` commiteado reproduce el entorno.
- **Los 3 errores de lint de `e2e/fixtures.ts`** siguen ahí y siguen fuera de alcance: ítem 1 de `deferred-items.md`. `npm run build` no lintea `e2e/`.
- **El stack local quedó limpio.** Verificado al terminar: 39 apartamentos con sus 8 clusters y sus 5 informativas, **0 activas**, **0 filas con residuo** de tarifa, pago o responsable, y 0 secretos, 0 aseos, 0 perfiles y 0 feeds. Ninguna siembra de este plan sobrevive.

## Self-Check: PASSED

Los 12 archivos que este resumen declara creados o modificados existen en disco, y los 6 hashes de commit (`9cebfd0`, `e11d9f6`, `b60a994`, `b6dc90b`, `d8bdf7e`, `9b44646`) resuelven a objetos de tipo `commit` en el historial de la rama. Ni `STATE.md` ni `ROADMAP.md` aparecen en el diff del plan.
