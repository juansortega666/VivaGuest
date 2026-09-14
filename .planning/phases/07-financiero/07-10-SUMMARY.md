---
phase: 07-financiero
plan: 10
subsystem: ui
tags: [next-app-router, rsc, useTransition, tailwind-v4, tokens, supabase-rpc, storage-signed-url, accesibilidad]

requires:
  - phase: 07-financiero
    provides: "Migración 26 (plan 07-08): `public.resumen_financiero(date, date)` y `public.costo_por_aseadora(date, date)`, las dos con guarda de rol como primera sentencia del cuerpo"
  - phase: 07-financiero
    provides: "`lib/domain/periodo.ts` (plan 07-06): `rangoDePeriodo`, `etiquetaDeRango` y `contieneHoy`, con la semana anclada en lunes"
  - phase: 07-financiero
    provides: "`lib/domain/finanzas.ts` (plan 07-06): `costoPorAseadora` con el denominador sobre el total del periodo, y `lib/domain/personas.ts` con `iniciales()` ya extraída"
  - phase: 07-financiero
    provides: "`e2e/finanzas.spec.ts` (plan 07-03), escrito en rojo contra el copy literal del contrato de diseño, y saneado por 07-09 para que cada caso falle en su propia aserción"
  - phase: 02-acceso-y-administraci-n-del-cat-logo
    provides: "`app/(admin)/_components/EstadoVacio.tsx` con su variante compacta, y el shell del admin con su guard contra el servidor de autenticación"
  - phase: 04-dashboard-operativo
    provides: "El patrón de fila navegable con el ancla estirada por `::after`, y el esqueleto de geometría real de `/operacion`"
provides:
  - "`app/(admin)/finanzas/page.tsx` — la sub-pestaña Resumen: cuatro KPIs, aseos del periodo y costo por aseadora"
  - "`app/(admin)/finanzas/_components/FiltroPeriodo.tsx` — el filtro que manda sobre toda la pantalla, vive en la URL y atenúa las cifras viejas en vez de borrarlas"
  - "`app/(admin)/finanzas/_components/SubNavFinanzas.tsx` — Resumen y Pagos como dos rutas reales"
  - "`app/(admin)/finanzas/_components/DialogoRecibo.tsx` — la foto del gasto con sus dos estados de ausencia, para 07-11 y 07-12"
  - "`app/(admin)/_components/CirculoIniciales.tsx` — el círculo de 28px, en un solo sitio"
  - "`lib/data/finanzas.ts` — la capa de lectura del Resumen contra las dos funciones con guarda"
  - "`lib/data/recibos.ts` — la firma de lectura del recibo, en el servidor y con vida corta"
  - "Los ocho tokens de espaciado de §2.1 y `--container-boton-marcar` en `app/globals.css`"
  - "`TopNav` con su cuarto link, y la deuda de `iniciales()` cerrada"
affects: [07-11, 07-12, 07-13, 07-14]

tech-stack:
  added: []
  patterns:
    - "Un control de filtro que gobierna toda una pantalla se implementa como ENVOLTORIO de los bloques de servidor, no como hermano: recibe los bloques ya renderizados como hijos, y así puede atenuarlos durante la transición sin que la página entera se vuelva de cliente"
    - "Recalcular no es navegar: cuando la pantalla es la misma con otros números, las cifras viejas se quedan visibles y atenuadas en vez de sustituirse por un esqueleto, porque lo que el usuario está haciendo es comparar. El esqueleto se reserva para la llegada a la ruta"
    - "Un control que puede estar inhabilitado por una razón de DOMINIO (no hay futuro que mirar) y otro que no puede inhabilitarse nunca por una razón de CARGA conviven en el mismo grupo: la diferencia se documenta en el sitio, porque el siguiente que lea el código verá dos botones y un solo `disabled`"
    - "Una sub-pestaña que tiene hijas se marca activa por EXCLUSIÓN de sus hermanas y no por prefijo de ruta: `/finanzas` es prefijo de `/finanzas/pagos`, así que el predicado obvio deja las dos activas a la vez"
    - "El salto al periodo vecino se calcula saltando un día por fuera del extremo, y no restando una unidad de calendario: el mismo cálculo sirve para día, semana y mes, y no se rompe con los meses de 31 días"
    - "La forma del dato se traduce a la del dominio EN LA FRONTERA (`lib/data/`), campo a campo, para que una columna nueva de la base no se propague sola hasta el navegador. Se prueba con una columna señuelo en el doble de cliente"

key-files:
  created:
    - app/(admin)/finanzas/page.tsx
    - app/(admin)/finanzas/loading.tsx
    - app/(admin)/finanzas/_components/SubNavFinanzas.tsx
    - app/(admin)/finanzas/_components/FiltroPeriodo.tsx
    - app/(admin)/finanzas/_components/TarjetaKPI.tsx
    - app/(admin)/finanzas/_components/BloqueAseosDelPeriodo.tsx
    - app/(admin)/finanzas/_components/BloqueCostoPorAseadora.tsx
    - app/(admin)/finanzas/_components/FilaAseadora.tsx
    - app/(admin)/finanzas/_components/DialogoRecibo.tsx
    - app/(admin)/_components/CirculoIniciales.tsx
    - lib/data/finanzas.ts
    - lib/data/finanzas.test.ts
    - lib/data/recibos.ts
  modified:
    - app/globals.css
    - app/(admin)/_components/TopNav.tsx
    - lib/domain/personas.ts
    - .planning/phases/07-financiero/deferred-items.md

key-decisions:
  - "El estado vacío del periodo sin aseos sustituye a LOS DOS bloques de abajo y no solo al bloque 2, siguiendo la lectura literal de §12.1 («bloque 2, y toda la pantalla de Resumen»). Los cuatro KPIs se siguen pintando con `$ 0`: cero cobrado es un hecho del periodo, no un dato que falta. El vacío propio del bloque 3 sigue existiendo y cubre el caso que sí puede ocurrir con aseos en el periodo: `resumen_financiero` no exige aseador asignado y `costo_por_aseadora` sí, así que un aseo completado sin persona produce KPIs con cifras y bloque 3 vacío"
  - "`hoyBog()` se lee UNA vez en el servidor y viaja al filtro por prop, en vez de leerse en el cliente. El proceso corre en tiempo universal y el navegador del admin puede estar en otra zona: dos relojes decidirían distinto si el botón `Hoy` se renderiza, que además es un desajuste de hidratación"
  - "El orden del bloque 3 vive en estado de cliente y NO en la dirección de la página, al revés que el rango y el ancla. Es lo que implementa «no se persiste entre sesiones»: si viajara en la URL, un enlace compartido llevaría el podio puesto y el refresco lo conservaría"
  - "El sub-nav entra a `FiltroPeriodo` como ranura propia y no como hijo. Los hijos se atenúan durante la transición, y atenuar la navegación diría que `Pagos` tampoco responde: responde, porque es un enlace a otra ruta que no depende de estas cifras"
  - "`FiltroPeriodo` navega partiendo de los parámetros ACTUALES y pisando solo los dos suyos. Construir la URL desde cero borraría los filtros de `/finanzas/aseos` (apartamento, aseador, tipo), que viven en la misma dirección: cambiar de semana no puede quitar el filtro de apartamento que el admin acaba de poner"
  - "La imagen del recibo usa la etiqueta nativa y no el componente de imagen de Next. La URL firmada es de un host externo, con parámetros y vida de cinco minutos: optimizarla obligaría a declarar ese host como remoto y dejaría una copia del recibo en la caché del optimizador, que es justo lo que un bucket privado existe para que no pase"
  - "El disparador `Ver recibo` vive DENTRO de `DialogoRecibo` y no en el sitio de uso, aunque sean dos superficies distintas las que lo monten. Así el copy del contrato existe una sola vez y ningún sitio de uso puede olvidarse de asociar su disparador con su diálogo"
  - "La capa de lectura trata de forma ASIMÉTRICA los dos vacíos: cero filas del resumen LANZA (la función agrega con `coalesce`, así que un periodo sin operación devuelve una fila de ceros; cero filas solo puede ser un cambio de forma), y una lista vacía del bloque 3 se devuelve tal cual (nadie con aseos en el rango es un hecho del periodo). Las dos ramas van con test"
  - "El ancho de la barra de proporción se escribe como estilo en línea y no como clase. Es un dato calculado por fila: una clase arbitraria por fila no existiría en el CSS generado. No es un valor de color, así que no toca el guardarraíl que vigila eso"

patterns-established:
  - "Antes de declarar un token de espaciado se listan los nombres ya declarados y se comprueba uno por uno que ninguno colisiona con una talla de la escala. Es la verificación que faltó las dos veces que este defecto costó un quick, y ahora va escrita en la cabecera del bloque de tokens"
  - "Un componente extraído para que no haya tres copias NO deja que el sitio de uso pise su tamaño, su fondo ni su tipografía por `className`: si cada consumidor pudiera, volverían a ser tres componentes distintos con un solo archivo"
  - "Una regla de producto que prohíbe una lectura (el podio) se sostiene en TRES capas y ninguna sobra: la base ordena alfabéticamente, el tipo del dominio no declara ninguna posición, y el componente no puede numerar lo que no existe"

requirements-completed: [FIN-02, FIN-05]

coverage:
  - id: D1
    description: "La sección de Finanzas existe, es el cuarto y último link de la barra superior, y la pantalla de operación no cambió"
    requirement: "FIN-02"
    verification:
      - kind: e2e
        ref: "e2e/finanzas.spec.ts:193 «la barra superior gana un cuarto link, va último, y la pantalla de operación NO cambió» — afirma la lista completa `['Operación','Apartamentos','Aseadores','Finanzas']`, los seis encabezados exactos de la tabla del día, que su contenido entero no casa con `/\\$\\s?\\d/`, y que el link queda con `aria-current=page` al entrar"
        status: pass
    human_judgment: false
  - id: D2
    description: "El admin abre una pantalla y ve cuánto cobró, cuánto pagó, cuánto reembolsó y cuánto le quedó, en el rango que elija"
    requirement: "FIN-02"
    verification:
      - kind: e2e
        ref: "e2e/finanzas.spec.ts:270 «los cuatro KPIs tienen su etiqueta exacta, su orden fijo, y la ganancia es la resta de los otros tres» — mide la posición horizontal real de las cuatro etiquetas y comprueba la aritmética contra las cifras sembradas, no contra un número plausible"
        status: pass
      - kind: unit
        ref: "lib/data/finanzas.test.ts «devuelve los nueve campos, campo a campo, y ninguno más» — con una columna señuelo que la capa no puede propagar"
        status: pass
    human_judgment: false
  - id: D3
    description: "El filtro de periodo manda sobre toda la pantalla, vive en la dirección de la página y sobrevive a un refresco"
    requirement: "FIN-02"
    verification:
      - kind: e2e
        ref: "e2e/finanzas.spec.ts:313 «cambiar el rango recalcula los KPIs y los conteos, y el periodo sobrevive a un refresco» — el rango y el ancla viajan en la URL, el día es subconjunto del mes, y tras recargar el KPI sigue dando la cifra del día"
        status: pass
      - kind: e2e
        ref: "e2e/finanzas.spec.ts:355 «el chevron de siguiente se apaga cuando el periodo ya contiene hoy, y `Hoy` solo aparece cuando te fuiste»"
        status: pass
      - kind: unit
        ref: "lib/data/finanzas.test.ts «llama UNA vez a la función del resumen con el rango que se le pidió» — el registro de llamadas es lo que impide que una función que ignore el rango pase en verde"
        status: pass
    human_judgment: false
  - id: D4
    description: "El bloque por aseadora muestra lo que cuesta cada persona, en orden alfabético, y no se puede leer como un ranking"
    verification:
      - kind: unit
        ref: "lib/domain/finanzas.test.ts (plan 07-06) — la proporción se calcula contra el total ANTES de filtrar, el orden por defecto es alfabético con collation es-CO, y ningún tipo del módulo declara posición"
        status: pass
      - kind: integration
        ref: "supabase/tests/11_financiero.test.sql aserción 62 — el KPI de pagos y el de gastos cuadran con la suma del bloque 3"
        status: pass
    human_judgment: true
    rationale: "La ausencia de lectura de podio es un juicio visual sobre una pantalla montada: los tests pueden afirmar que no hay numeración, que el orden es alfabético y que el denominador es el total, pero no que el bloque no SE LEA como un ranking. Con ocho personas repartidas parejo ninguna barra pasa del 20% del ancho, y el contrato declara que eso «se ve vacío y está bien»: confirmarlo pide mirarlo."
  - id: D5
    description: "El recibo del gasto se muestra con URL firmada en el servidor y con sus dos estados de ausencia declarados"
    verification: []
    human_judgment: true
    rationale: "`DialogoRecibo` y `lib/data/recibos.ts` se construyen aquí para que los dos planes de la wave siguiente no escriban dos diálogos distintos, pero en este plan NO TIENEN NINGÚN CONSUMIDOR: el Resumen no muestra recibos. Su verificación de comportamiento llega con 07-11 (ficha de aseadora) y 07-12 (desglose de un pago), que son los casos E2E que los ejercen. Lo único comprobado hoy es que compilan, que no firman en el cliente (`grep -rc createSignedUrl` sobre `_components` da 0) y que el copy es el literal del contrato."

# Metrics
duration: 58min
completed: 2026-09-13
status: complete
---

# Fase 7 Plan 10: El chasis de Finanzas y la sub-pestaña Resumen

**La sección de Finanzas existe, el filtro de periodo gobierna la pantalla entera desde la URL, y el admin ve en un solo sitio cuánto cobró, cuánto pagó y cuánto le quedó en el rango que elija, sin que la pantalla de operación se moviera un pixel.**

## Performance

- **Duration:** 58 min
- **Started:** 2026-09-13T17:00:00Z
- **Completed:** 2026-09-13T17:58:00Z
- **Tasks:** 3 de 3
- **Files modified:** 17 (13 creados, 4 modificados)

## Accomplishments

- **La pestaña existe y la operación se quedó quieta.** Las dos mitades de D7-1 quedan afirmadas en el mismo caso E2E: la barra tiene exactamente cuatro links con `Finanzas` al final, y la tabla del día de `/operacion` conserva sus seis encabezados sin una sola cifra de pesos en todo su contenido.
- **El filtro manda sobre toda la pantalla y es enlazable.** El rango y el ancla viajan como parámetros de consulta, el servidor deriva los dos extremos, y un refresco devuelve exactamente la misma pantalla. Al cambiar de rango **las cifras viejas se atenúan en vez de desaparecer**, que es lo que permite comparar; los tres botones del segmentado siguen habilitados mientras carga.
- **Los cuatro números cuadran y ninguno se tiñe.** La ganancia sale de la resta de los otros tres, calculada en la base para que haya un solo sitio donde pueda estar mal. Ni verde en positivo ni rojo en los costos: pagarle a la gente no es una pérdida.
- **El bloque por persona dice lo que cuesta, en orden alfabético.** La barra es contexto de proporción contra el total del periodo, se oculta a las tecnologías de asistencia y no lleva el color de acento. Nada numera, nada premia y nada colorea por posición.
- **La deuda de `iniciales()` quedó cerrada.** `TopNav` importa del módulo de dominio, la definición duplicada se borró y la nota de caducidad de `personas.ts` también. Hoy hay un solo sitio en el repo donde se calculan las iniciales y un solo componente que las pinta.
- **Ocho tokens nuevos, verificados nombre por nombre** contra la escala de tallas antes de escribirlos, con esa verificación anotada en el bloque para que el siguiente la repita.

## Task Commits

1. **Task 1: Los tokens, el círculo de iniciales y la barra superior** — `5d66a26` (feat)
2. **Task 2: La capa de lectura, el filtro de periodo y el diálogo de recibo** — `bf0eb48` (feat)
3. **Task 3: Los tres bloques del Resumen** — `66501e9` (feat)

## Files Created/Modified

| Archivo | Qué hace |
|---|---|
| `app/globals.css` | Los ocho tokens de §2.1 más `--container-boton-marcar`, con la comprobación de colisión escrita en la cabecera del bloque |
| `app/(admin)/_components/CirculoIniciales.tsx` | El círculo de 28px, decorativo y oculto a las tecnologías de asistencia. Cuatro consumidores, un solo archivo |
| `app/(admin)/_components/TopNav.tsx` | Cuarto link al final, consumo del círculo extraído, y borrado de la definición duplicada de `iniciales()` |
| `lib/domain/personas.ts` | Se borró la nota de duplicación transitoria: ya no aplica |
| `app/(admin)/finanzas/page.tsx` | Componente de servidor: normaliza el rango y el ancla, lee las dos funciones en paralelo y compone el filtro envolviendo los bloques |
| `app/(admin)/finanzas/loading.tsx` | Esqueleto de geometría real: cuatro cards de 104px y dos bloques con sus filas de 48 y 56px |
| `app/(admin)/finanzas/_components/SubNavFinanzas.tsx` | Dos rutas reales; el activo va en el color de texto y no en el de acento |
| `app/(admin)/finanzas/_components/FiltroPeriodo.tsx` | El segmentado, los dos chevrons, `Hoy`, la región de cortesía y el envoltorio que atenúa |
| `app/(admin)/finanzas/_components/TarjetaKPI.tsx` | Una card de alto fijo: etiqueta en micro versalitas, valor en display con numerales tabulares, leyenda opcional |
| `app/(admin)/finanzas/_components/BloqueAseosDelPeriodo.tsx` | Tres filas navegables que conservan el periodo, más la línea de cierre no navegable |
| `app/(admin)/finanzas/_components/BloqueCostoPorAseadora.tsx` | Cabecera, selector de orden, buscador condicional y las filas, con sus dos estados vacíos |
| `app/(admin)/finanzas/_components/FilaAseadora.tsx` | Círculo, nombre truncado, monto a la derecha, segunda línea y la barra de proporción |
| `app/(admin)/finanzas/_components/DialogoRecibo.tsx` | La foto y sus dos estados de ausencia. Sin ampliación, sin galería y sin descarga |
| `lib/data/finanzas.ts` | Las dos lecturas, con el cliente por parámetro y comprobando el error de cada llamada |
| `lib/data/finanzas.test.ts` | Nueve casos: el registro de llamadas, la columna señuelo, el margen nulo y las dos ramas del vacío |
| `lib/data/recibos.ts` | La firma de lectura, en el servidor y con vida de cinco minutos |

## Decisions Made

Las nueve del frontmatter. Las tres que más cuestan de recuperar si no quedan escritas:

**1. El estado vacío del periodo sin aseos sustituye a los dos bloques, no solo al bloque 2.** §12.1 dice «bloque 2, **y toda la pantalla de Resumen**», y esa segunda mitad es la que decide. Los KPIs se siguen pintando con `$ 0`, porque cero cobrado es un hecho del periodo. El vacío propio del bloque 3 no sobra: cubre el caso que sí ocurre con aseos en el periodo, porque `resumen_financiero` no exige aseador asignado y `costo_por_aseadora` sí (es la divergencia que 07-08 declaró y acotó con su aserción 62).

**2. El orden del bloque 3 vive en el cliente, no en la URL.** Es la implementación literal de «no se persiste entre sesiones». Meterlo en la dirección habría sido lo consistente con el rango y el ancla, y habría sido justo el error: un enlace compartido llevaría el podio puesto y el refresco lo conservaría, que es exactamente lo que se quería evitar.

**3. El salto al periodo vecino se calcula saltando un día por fuera del extremo.** Restar «una unidad de calendario» falla en los meses de 31 días: desde el 31 de marzo, restar treinta días cae en marzo otra vez. Saltar un día antes de `desde` aterriza siempre dentro del periodo anterior, sea cual sea su longitud, y el mismo cálculo sirve para los tres rangos sin ramificar.

## Deviations from Plan

Ninguna desviación de las reglas 1 a 4: el plan se ejecutó como está escrito y no hizo falta arreglar nada fuera de alcance. Lo que sí hay son **dos cierres de alcance que conviene dejar explícitos**, porque el criterio de aceptación del plan los nombra:

### 1. Los dos casos E2E de la sección 4 necesitan una ruta que construye 07-11

El criterio decía «los casos 1 a 4 de `e2e/finanzas.spec.ts` pasan a verde». Las secciones 1, 2 y 3 del spec son cuatro casos y **los cuatro están en verde**. La sección 4 son otros dos (`las tres filas del bloque 2 llevan al detalle con su filtro` y `una fila con cifra cero sigue siendo navegable`), y los dos **pasan todas las aserciones que son de este plan** y caen en la última, que ya mira la pantalla de destino:

| Caso | Qué afirma de este plan | Dónde cae |
|---|---|---|
| `:381` | Que el enlace de cada conteo lleva `filtro`, `ancla` y `rango` correctos en la URL — **verde** | `getByRole('link', {name:'Volver al resumen'})` sobre un 404 |
| `:411` | Que la fila con cifra 0 se renderiza, es visible y navega — **verde** | El copy del vacío de `/finanzas/aseos`, sobre un 404 |

`app/(admin)/finanzas/aseos/page.tsx` está en el `files_modified` de **07-11**, que corre en la wave 7. Construirlo aquí sería pisarle el archivo a un plan que ya lo tiene asignado. **No se hizo, y es deliberado.**

### 2. El aislamiento por rol (T-07-09) queda a medias por la misma razón

`:796` recorre `['/finanzas', '/finanzas/aseos', '/finanzas/pagos']` y exige que las tres reboten a la raíz del aseador. **`/finanzas` rebota correctamente** (el guard del layout del árbol de admin hace su trabajo contra el servidor de autenticación). Las otras dos dan 404, que no pasa por ese layout, así que no rebota. El caso se pone entero en verde cuando 07-11 y 07-12 aterricen sus rutas: **el 404 no es una fuga**, no muestra ningún dato, pero tampoco satisface la aserción tal como está escrita.

---

**Total de desviaciones:** 0 auto-arregladas.
**Impacto en el plan:** cero ampliación de alcance. No se tocó ningún archivo asignado a otro plan.

## Issues Encountered

**Un rojo E2E que no es mío: `push-instalacion.spec.ts` caso `E3`.** Salió rojo en la corrida completa y **verde en la corrida siguiente del mismo archivo, sin tocar una línea**. Es el flake que 07-03 ya caracterizó y registró en `deferred-items.md`: los tres casos que han fallado alguna vez (`E1`, `E2`, `E3`) son exactamente los que salen de la máquina o dependen del protocolo de DevTools; `E5` y `E6`, que no, nunca han fallado. Este plan no toca nada de ese camino. Se anotaron las dos corridas nuevas en la tabla de `deferred-items.md` y se actualizó la hipótesis; el detonante para arreglarlo (dos corridas seguidas en rojo) **sigue sin cumplirse**.

## Estado de las suites al terminar

| Capa | Antes | Ahora |
|---|---|---|
| pgTAP | 369 verdes, 0 rojas | sin cambio: este plan no toca la base |
| Unitarios | 1111 verdes | **1120 verdes**, 0 rojos (los 9 nuevos son de `lib/data/finanzas.test.ts`) |
| Integración | 190 verdes | sin cambio: no se re-corrió, este plan no toca la capa de integración |
| E2E | 113 verdes, 1 saltado, 21 rojos declarados | **117 verdes**, 1 saltado, **17 rojos**, todos declarados y con plan responsable |

**Los 17 rojos que quedan, por dueño:** 9 de `finanzas.spec.ts` (4 de 07-11, 3 de 07-12, más los 2 de la sección 4 y el de aislamiento que cierran con ellos) y 6 de `mis-pagos.spec.ts` (07-13). **Ningún rojo nuevo.**

## Comprobaciones del criterio de aceptación

| Criterio | Resultado |
|---|---|
| Los ocho tokens existen y ninguno colisiona | Verificado listando los nombres declarados antes y después; ninguno de los ocho aparece duplicado |
| `npm run ci:arch` | `check-service-role: OK` · `check-max-w-tallas: OK` · `check-escala-movil: OK` |
| `grep -c "export function iniciales" TopNav.tsx` | `0` |
| `grep -rc "revalidatePath" app/(admin)/finanzas` | `0` |
| `grep -rc "createSignedUrl" app/(admin)/finanzas/_components` | `0` |
| `grep -c "tabular-nums" TarjetaKPI.tsx` | `2` (mayor que 0) |
| `npx tsc --noEmit` | limpio |
| `npm run lint` | 0 errores (2 warnings preexistentes, en archivos de test ajenos a este plan) |
| `npx vitest run lib/data/finanzas.test.ts` | 9/9 |
| Cero primitivas instaladas, cero tokens de color, cero tamaños de tipografía nuevos | confirmado: `components/ui/` no cambió y `app/globals.css` solo ganó espaciado y un ancho |

## User Setup Required

Ninguno. No hace falta configurar ningún servicio externo.

## Self-Check: PASSED

Los 13 archivos declarados como creados existen en disco, los 3 hashes de commit existen en el
historial, y los cuatro `grep` que el criterio de aceptación exige devuelven lo que este documento
afirma. No quedó ningún archivo sin rastrear fuera de este SUMMARY.
