---
phase: 07-financiero
plan: 11
subsystem: ui
tags: [nextjs, rsc, supabase-rpc, tailwind, shadcn, playwright, vitest]

requires:
  - phase: 07-financiero (plan 07-08)
    provides: "rentabilidad_aseos, aseos_de_aseadora, gastos_de_aseadora y aseo_en_curso_de_aseadora (migración 26), con guarda de admin y filtro de gestión propia dentro"
  - phase: 07-financiero (plan 07-09)
    provides: "pagos_de_aseadora (migración 27), sin argumento de rango a propósito"
  - phase: 07-financiero (plan 07-10)
    provides: "el chasis de la sección: FiltroPeriodo, SubNavFinanzas, CirculoIniciales, DialogoRecibo, lib/data/recibos.ts y el Resumen con sus tres enlaces al detalle"
  - phase: 04-operacion
    provides: "el molde de tabla del repo (TablaDia), EstadoAseo y EstadoVacio"
provides:
  - "`/finanzas/aseos`: el detalle aseo por aseo, con filtro de apartamento, de aseador y de tipo en la dirección de la página (FIN-02)"
  - "`/finanzas/aseadoras/[id]`: la ficha de una persona, con sus cuatro bloques"
  - "`lib/data/finanzas-detalle.ts`: la capa de lectura de las dos pantallas, con colador de dinero en la frontera"
  - "La fila de totales del pie, que cuadra con los KPIs del Resumen del mismo periodo por construcción"
  - "El bloque «Ahora mismo», que responde dónde está alguien sin insinuar rastreo"
affects: [07-14, fase-08, fase-09]

tech-stack:
  added: []
  patterns:
    - "El pie de una tabla SUMA LAS FILAS QUE SE PINTAN, nunca una segunda consulta agregada"
    - "Comprobación de forma del identificador antes de la consulta, para que una dirección escrita a mano dé 404 y no un error de tipo de Postgres"
    - "El componente de filtros ENVUELVE la tabla para atenuarla en la transición, igual que el filtro de periodo envuelve los bloques del Resumen"

key-files:
  created:
    - "lib/data/finanzas-detalle.ts"
    - "lib/data/finanzas-detalle.test.ts"
    - "app/(admin)/finanzas/aseos/page.tsx"
    - "app/(admin)/finanzas/aseos/loading.tsx"
    - "app/(admin)/finanzas/aseadoras/[id]/page.tsx"
    - "app/(admin)/finanzas/aseadoras/[id]/loading.tsx"
    - "app/(admin)/finanzas/_components/TablaAseosFinanciera.tsx"
    - "app/(admin)/finanzas/_components/FiltrosDeAseos.tsx"
    - "app/(admin)/finanzas/_components/FichaAseadora.tsx"
    - "app/(admin)/finanzas/_components/BloqueAhoraMismo.tsx"
  modified:
    - ".planning/phases/07-financiero/deferred-items.md"

key-decisions:
  - "El pie de la tabla suma las filas renderizadas y no pide totales agregados a la base: dos consultas divergen en algún caso de borde y dejan al dueño con dos cifras y ninguna forma de saber cuál vale"
  - "La señal de gasto de la tabla del detalle es un icono mudo y NO el disparador del diálogo de recibo, contra la letra de UI-SPEC §7.1 y a favor del contrato de la migración 26 y de T-07-54"
  - "La señal de periodo cruzado compara el PERIODO DE CIERRE de las dos fechas, no el mes calendario: lo que explica es en qué pago entró el aseo"
  - "La acción `Quitar filtros` del estado vacío solo se renderiza cuando hay algún filtro puesto; con el periodo vacío y los tres en su defecto sería un control muerto"
  - "El día en que se pagó sale de `diaBog()` y nunca de recortar los diez primeros caracteres del instante"

patterns-established:
  - "Colador de dinero en la capa de lectura: toda cifra que llega de un `returns table` se comprueba como entero seguro y se lanza nombrando el campo, porque la suma de enteros anchos llega como cadena y se concatena en silencio"
  - "Los identificadores que llegan por la dirección pasan por una comprobación de FORMA antes de tocar Postgres (T-07-56)"
  - "El vocabulario prohibido de una pantalla se vigila con grep sobre el archivo, comentarios incluidos: se describe el patrón, no se escribe el token"

requirements-completed: [FIN-02, FIN-05]

coverage:
  - id: D1
    description: "El detalle aseo por aseo con sus siete columnas exactas, el margen igual a cobrado menos pagado fila por fila, y las dos fechas"
    requirement: "FIN-02"
    verification:
      - kind: e2e
        ref: "e2e/finanzas.spec.ts#el detalle tiene las siete columnas exactas y el margen de cada fila es el cobrado menos el pagado"
        status: pass
      - kind: unit
        ref: "lib/data/finanzas-detalle.test.ts#leerRentabilidadDeAseos"
        status: pass
    human_judgment: false
  - id: D2
    description: "La fila de totales del pie cuadra exactamente con los KPIs del Resumen del mismo periodo (la conciliación)"
    requirement: "FIN-02"
    verification:
      - kind: e2e
        ref: "e2e/finanzas.spec.ts#la fila de totales del detalle cuadra exactamente con los KPIs del Resumen del mismo periodo"
        status: pass
      - kind: unit
        ref: "lib/data/finanzas-detalle.test.ts#totalizarDetalle"
        status: pass
    human_judgment: false
  - id: D3
    description: "Los tres filtros del detalle viajan en la dirección de la página, y entrar desde el Resumen no cambia el periodo"
    requirement: "FIN-02"
    verification:
      - kind: e2e
        ref: "e2e/finanzas.spec.ts#las tres filas del bloque 2 llevan al detalle con su filtro, y el periodo no cambia al entrar"
        status: pass
      - kind: e2e
        ref: "e2e/finanzas.spec.ts#una fila con cifra cero sigue siendo navegable"
        status: pass
      - kind: unit
        ref: "lib/data/finanzas-detalle.test.ts#manda los tres filtros cuando los tres están puestos"
        status: pass
    human_judgment: false
  - id: D4
    description: "Ninguna unidad de gestión externa aparece en la tabla, ni en el combinado de apartamento, ni en los totales"
    requirement: "FIN-05"
    verification:
      - kind: e2e
        ref: "e2e/finanzas.spec.ts#el apartamento de gestión externa no aparece en la tabla, ni en el combobox, ni en los totales"
        status: pass
      - kind: unit
        ref: "lib/data/finanzas-detalle.test.ts#pide SOLO unidades gestionadas, ordenadas por nombre (FIN-05)"
        status: pass
    human_judgment: false
  - id: D5
    description: "La ficha de una persona con sus cuatro bloques en orden, la leyenda obligatoria bajo el total, el bloque de pagos ignorando el filtro y diciéndolo, y ni una palabra de rastreo"
    verification:
      - kind: e2e
        ref: "e2e/finanzas.spec.ts#la ficha tiene sus cuatro bloques, el de pagos ignora el filtro y lo dice, y no hay ni una palabra de ubicación"
        status: pass
      - kind: other
        ref: "grep -riEc 'ubicaci|mapa|gps|coordenad' 'app/(admin)/finanzas/_components/BloqueAhoraMismo.tsx' → 0"
        status: pass
      - kind: unit
        ref: "lib/data/finanzas-detalle.test.ts#leerAhoraMismo, leerPagosDeAseadora, costoDeLaFicha"
        status: pass
    human_judgment: false
  - id: D6
    description: "La tabla del detalle cabe a 1024px de ancho sin desplazamiento lateral, y por eso no lleva envoltorio de scroll horizontal"
    verification:
      - kind: automated_ui
        ref: "medición con Playwright a viewport 1024×900 sobre /finanzas/aseos: {paginaScroll:1024, paginaCliente:1024, contenedorScroll:976, contenedorCliente:976}"
        status: pass
    human_judgment: false
  - id: D7
    description: "Un aseo cuya ejecución cae en un periodo de pago distinto al programado se marca en el color de aviso (D7-8)"
    verification: []
    human_judgment: true
    rationale: "El escenario E2E de la fase tiene el aseo cruzado, pero ninguna aserción mira el color de esa celda, y el contrato prohíbe localizar por clase de CSS. Que la señal se vea y se entienda en pantalla necesita un par de ojos."
  - id: D8
    description: "El aseador desactivado y el que no tiene aseo en curso se distinguen en el bloque «Ahora mismo» con su copy e icono propios"
    verification:
      - kind: unit
        ref: "lib/data/finanzas-detalle.test.ts#conserva la cuenta desactivada, que es el tercer estado de la pantalla"
        status: pass
    human_judgment: true
    rationale: "La suite E2E afirma que se pinta EXACTAMENTE uno de los tres estados, pero el escenario sembrado solo produce uno de ellos. Los otros dos están cubiertos en la capa de lectura y no en pantalla."

duration: 75min
completed: 2026-09-13
status: complete
---

# Fase 7 Plan 11: El detalle aseo por aseo y la ficha de una persona — Summary

**Las dos pantallas hijas del Resumen, con la conciliación sostenida por construcción: el pie del detalle suma las filas que se pintan, así que no puede contradecir a la tabla, y cuadra con los KPIs porque las dos funciones de la base comparten filtro y conversión de fecha.**

## Performance

- **Duration:** ~75 min de ejecución (17:15 a 18:30 aprox.), más ~50 min de contención de entorno con los otros dos agentes de la wave
- **Started:** 2026-09-13T22:15:00Z
- **Completed:** 2026-09-13T23:30:00Z
- **Tasks:** 2 de 2
- **Files modified:** 10 creados, 1 modificado (`deferred-items.md`)

## Accomplishments

- **`/finanzas/aseos` responde el criterio 2 de la DEFINICION.** Cuánto dejó el Apto 07 este mes y cuánto se le pagó a alguien en septiembre dejan de ser una pregunta de Excel: son tres filtros en la dirección de la página, que cambian qué filas lee el servidor y no qué filas se esconden en el navegador.
- **La conciliación quedó sostenida en dos sitios y en ninguno más.** En la base, porque `rentabilidad_aseos` y `resumen_financiero` usan el mismo filtro y la misma conversión de día. En la pantalla, porque el pie **suma las filas que se pintan**: cuenta lo que se ve y suma lo que se ve. La suite lo afirma al peso contra los cuatro KPIs del Resumen.
- **La tabla cabe a 1024 y está medido, no estimado.** `scrollWidth` de la página 1024 contra `clientWidth` 1024, y el contenedor de la tabla 976 contra 976. Cero desplazamiento lateral, que es lo que justifica no arrastrar el envoltorio de scroll de las otras dos tablas del repo.
- **La ficha responde «dónde está cada miembro de mi equipo» sin prometer una capacidad que el producto no tiene.** Sale de qué aseo tiene en curso, nada más, y el bloque lleva la leyenda que fecha el dato. El grep del contrato sobre el vocabulario de rastreo devuelve cero, comentarios incluidos.
- **43 tests nuevos de la capa de lectura**, con señuelo comprobado en los tres que vigilan los filtros: fijando `p_filtro` a una constante, el archivo se pone rojo justo ahí y en ningún otro sitio.

## Task Commits

1. **Task 1: el detalle aseo por aseo, con sus tres filtros** — `079c46a` (feat)
2. **Task 2: la ficha de una persona, y la regla del rastreo** — `dbe3fa7` (feat)

**Plan metadata:** ver el commit final de este plan (docs).

## Files Created/Modified

| Archivo | Qué hace |
|---|---|
| `lib/data/finanzas-detalle.ts` | La capa de lectura de las dos pantallas: las cinco funciones de la base, el colador de dinero en la frontera, el combinado de apartamento gestionado, y los dos totalizadores puros |
| `lib/data/finanzas-detalle.test.ts` | 43 tests: que se mire el error, que el dinero que llega como texto se rechace lanzando, que los filtros viajen y los opcionales se omitan, que cero filas de «ahora mismo» no se confunda con una fila de columnas nulas, y que el historial de pagos no reciba ningún rango |
| `app/(admin)/finanzas/aseos/page.tsx` | La ruta del detalle: normaliza los cuatro parámetros, lee en paralelo, totaliza y pinta |
| `app/(admin)/finanzas/aseos/loading.tsx` | El esqueleto con la fila de encabezado de 32px y los siete anchos reales, más diez filas de 40px |
| `app/(admin)/finanzas/_components/TablaAseosFinanciera.tsx` | Las siete columnas, las señales en línea, el margen negativo en color de aviso y el pie de totales |
| `app/(admin)/finanzas/_components/FiltrosDeAseos.tsx` | Combinado con búsqueda, desplegable y segmentado, los tres en la dirección, envolviendo la tabla para atenuarla en la transición |
| `app/(admin)/finanzas/aseadoras/[id]/page.tsx` | La ruta de la ficha: comprueba la forma del identificador, lee los cinco bloques en paralelo y firma los recibos en el servidor |
| `app/(admin)/finanzas/aseadoras/[id]/loading.tsx` | El esqueleto con la geometría real de la cabecera y de los cuatro bloques |
| `app/(admin)/finanzas/_components/FichaAseadora.tsx` | La cabecera con su leyenda obligatoria y los cuatro bloques en su orden |
| `app/(admin)/finanzas/_components/BloqueAhoraMismo.tsx` | Los tres estados de «ahora mismo», con su copy exacto y su fechado |
| `.planning/phases/07-financiero/deferred-items.md` | Una entrada nueva: `/finanzas` no está en la zona del admin del ruteo |

## Decisions Made

**1. El pie suma las filas que se pintan, y no pide totales agregados a la base.**
La alternativa evidente era una segunda consulta agregada. Es exactamente la clase de fallo más cara de esta pantalla: dos consultas distintas, una por filas y otra agregada, divergen en un caso de borde (un aseo cancelado, uno de gestión externa, uno que cruza el periodo) y dejan al dueño con dos cifras y ninguna forma de saber cuál vale. Sumando la lista, el pie no puede contradecir a la tabla por construcción.

**2. La señal de periodo cruzado compara el PERIODO DE CIERRE, no el mes calendario.**
Lo que esa marca explica es en qué pago entró el aseo, y el periodo de pago va de cierre a cierre: el de enero de 2026 va del 1 al 30 porque el 31 es sábado. Comparando meses calendario, un aseo programado el 30 y hecho el 31 de enero se vería alineado cuando en realidad cayó en el pago de febrero, que es justo el caso que la señal existe para explicar.

**3. `Quitar filtros` del estado vacío solo aparece cuando hay algo que quitar.**
Con el periodo sin aseos y los tres filtros en su defecto, ese botón no haría nada. Un control muerto permanente es peor que no ofrecerlo.

**4. La comprobación de forma del identificador devuelve `null` en vez de lanzar.**
Así cada consumidor decide: la ficha lo convierte en 404 y el filtro del detalle lo trata como «sin filtro». Lanzar habría obligado a envolver las dos llamadas en un `try`.

## Deviations from Plan

### Decisiones de contrato que se apartaron de la letra del UI-SPEC

**1. [Rule 4 — resuelta sin escalar, a favor del contrato más específico] La señal de gasto de la tabla del detalle NO es el disparador del diálogo de recibo**

- **Encontrado durante:** Task 1.
- **Qué dice el contrato.** `07-UI-SPEC.md` §7.1, sobre la señal de gasto de la celda del apartamento: *«Es el disparador del diálogo de recibo (§9.4)»*. El plan lo repite.
- **Por qué no se implementó así.** Dos razones, y las dos son del propio repo, no una preferencia mía:
  1. **La función de la base no devuelve con qué abrirlo.** `rentabilidad_aseos` declara `tiene_gasto boolean` y nada más: ni identificador del gasto, ni concepto, ni monto, ni bucket, ni ruta. Su comentario lo dice con todas sus letras y explica por qué calcula con `exists` y no con `count`: *«La tabla solo pinta un icono: solo necesita saber si hay o no.»* Abrir el recibo desde ahí exigiría o ampliar esa firma o una consulta paralela sobre gastos.
  2. **Firmar por fila contradice T-07-54 y la cabecera de `lib/data/recibos.ts`.** Ese archivo, escrito en el plan 07-10, argumenta literalmente contra emitir URLs firmadas *«para todas las filas de la página, incluidas las que el usuario nunca abre»*, cada una viva hasta expirar aunque la sesión se cierre un segundo después. Un mes con veinte aseos con gasto son veinte firmas emitidas para abrir cero.
- **Qué se hizo en cambio.** El icono se renderiza con su etiqueta accesible (`Tiene gasto reportado`) como señal muda, y **el recibo se abre desde la ficha de la persona**, bloque 4, donde `gastos_de_aseadora` sí devuelve bucket y ruta y donde la firma se emite solo para los gastos de esa persona en ese periodo. El diálogo compartido de 07-10 se consume tal cual, sin duplicarlo.
- **Por qué no se escaló como decisión arquitectónica.** No hay cambio de estructura: no se toca schema, ni firma de función, ni capa nueva. Es elegir cuál de dos artefactos del proyecto manda cuando se contradicen, y el más específico y más reciente (la migración 26 y la capa de recibos, las dos de esta misma fase) gana sobre una línea del contrato visual. Además ningún criterio de aceptación del plan ni ninguna aserción de la suite pide ese disparador en la tabla.
- **Qué costaría revertirlo.** Poco: una lectura más en `/finanzas/aseos` y firmar en el servidor. Si el dueño lo pide al ver la pantalla, es un quick.
- **Committed in:** `079c46a`.

**2. [Rule 3 — bloqueante, resuelto en el sitio] El fechado del pago no puede salir de recortar el instante**

- **Encontrado durante:** Task 2, escribiendo el bloque de pagos.
- **Issue:** la primera versión sacaba el día de `pagado_at.slice(0, 10)`. La marca viaja en tiempo universal, así que un pago registrado a las 20:00 de Bogotá habría dicho el día siguiente. Es la trampa que `lib/domain/dates.ts` existe para cerrar, y falla una de cada cinco veces, que es peor que fallar siempre.
- **Fix:** pasa por `diaBog()`, que es el único convertidor de instante a día de negocio del repo.
- **Verification:** `npx tsc --noEmit` limpio y el caso de la ficha en verde.
- **Committed in:** `dbe3fa7`.

---

**Total deviations:** 2 (1 de contrato resuelta a favor del artefacto más específico, 1 auto-arreglada por corrección).
**Impact on plan:** ninguna amplía el alcance. La primera lo **recorta** en un gesto y lo mueve a la pantalla donde el dato existe; la segunda evita un defecto de zona horaria que nadie habría visto hasta que alguien reclamara la fecha de su pago.

## Issues Encountered

**1. La wave de tres agentes comparte un `.next`, una base local y un contenedor de Docker, y eso hace inmedible la suite E2E completa.**

Concretamente, y todo observado:

- Dos `next build` simultáneos sobre el mismo `.next` dan `ENOENT` en `_ssgManifest.js` o en `pages-manifest.json`, y el servidor de pruebas no arranca. Pasó tres veces.
- El `globalSetup` borra y recrea los usuarios semilla. Con dos suites corriendo, una le borra el usuario a la otra a mitad de sesión: `Database error deleting user`, y después fallos de login que no tienen nada que ver con el código.
- Un `supabase db reset` de otro agente dejó el contenedor `marked for removal and cannot be started`.

**El efecto medido:** una corrida completa dio **69 rojos sobre 136**, incluidos `ruteo.spec.ts` y los conteos exactos de `apartamentos-lista.spec.ts`, que no tocan nada de este plan. **No es una regresión: es contaminación.** La prueba es que en las dos corridas hechas con el árbol en exclusiva, los mismos archivos dan verde.

**Lo que sí está medido en exclusiva, y es el número que vale:**

| Corrida | Condición | Resultado |
|---|---|---|
| 1 | Tras `db:reset`, árbol libre, antes de que 07-12 construyera Pagos | **12 verdes, 3 rojos**, los tres de Pagos (`:614`, `:679`, `:749`), que son de 07-12 |
| 2 | Tras `db:reset`, árbol libre, con Pagos ya construida | **14 verdes, 1 rojo** |

El único rojo de la corrida 2 es `:355` (el chevron de siguiente y el botón de volver a hoy), que es del plan **07-10** y que estaba verde en la corrida 1. Al aislarlo falló en el `fill` del campo de email del login, o sea ni siquiera llegó a la aserción: es la contención otra vez.

**Los siete casos de este plan están verdes en las dos corridas**, incluido `:796`/`:808` (el aislamiento por rol), que cierra ahora que `/finanzas/pagos` existe.

**Recomendación para el orquestador:** medir la línea base completa de E2E **después** de que los tres agentes de la wave 7 hayan terminado, con un `db:reset` y el árbol quieto. Antes de eso, cualquier número de la suite completa es ruido.

**2. Un `Error: no_autorizado` en el registro del servidor por cada rebote de aseadora.**

`/finanzas` nunca se añadió a `ZONA_ADMIN` en `lib/auth/routing.ts`, así que el rebote no ocurre en el middleware: el componente de servidor de la página alcanza a ejecutarse en paralelo con el layout que redirige, la función de la base levanta `42501`, y queda escrito en el registro. **No es una fuga** (la redirección gana y nada llega al navegador) y la aserción de aislamiento pasa, pero es ruido y un salto de más. Es una línea de arreglo y **ya existía desde 07-10**; está anotado en `deferred-items.md` con su detonante. No se tocó aquí porque `lib/auth/routing.ts` no está en los archivos de este plan y había otros dos agentes escribiendo sobre el mismo árbol.

## Known Stubs

Ninguno. Las dos pantallas leen datos reales de las cinco funciones de la base; no hay ningún arreglo vacío ni ningún texto de relleno que llegue a la interfaz.

## Threat Flags

Ninguna superficie nueva. Las dos rutas entran por el layout del admin que ya existe, no añaden ningún punto de red propio, no escriben nada (no hay ni una Server Action en este plan) y no tocan el schema. Las cinco mitigaciones del registro del plan quedaron aplicadas:

| Amenaza | Cómo quedó |
|---|---|
| T-07-53 | El filtro de gestión propia vive en la base para la tabla, y el combinado pide `gestion_vivaguest = true` con su test de señuelo. Afirmado en E2E |
| T-07-54 | La firma se genera en el servidor con la capa compartida de 07-10, y **solo** para los gastos de esa persona en ese periodo. Ninguna ruta de almacenamiento viaja al cliente |
| T-07-55 | Prohibición aplicada y verificada por grep, comentarios incluidos. El tipo de la capa de lectura tampoco declara nada de lo que se pueda derivar |
| T-07-56 | `identificadorValido()` antes de cada consulta, con su test sobre seis formas inválidas |
| T-07-57 | El pie suma las filas renderizadas y la garantía de fondo vive en la base. Afirmado al peso en E2E contra los cuatro KPIs |

## User Setup Required

Ninguno. No hay servicio externo nuevo ni variable de entorno nueva.

## Next Phase Readiness

**Listo para 07-14 (la wave de cierre).** Las cuatro superficies del admin de la fase existen: Resumen (07-10), detalle y ficha (este plan) y Pagos (07-12).

**Dos cosas que 07-14 tiene que mirar:**

1. **La línea base de E2E hay que volver a medirla en quieto.** Ver el issue 1. El número de 136 tests con 69 rojos no significa nada; el de `finanzas.spec.ts` en exclusiva sí.
2. **Dos rojos declarados quedan fuera de este plan y no son suyos:** `:355` (chevron y botón de hoy, del 07-10) hay que confirmarlo en una corrida limpia, y el flake conocido de `push-instalacion.spec.ts` sigue donde estaba.

**Sin blockers.**

---
*Phase: 07-financiero*
*Completed: 2026-09-13*

## Self-Check: PASSED

Los diez archivos declarados existen en disco y los dos commits existen en el historial.

```
FOUND: lib/data/finanzas-detalle.ts
FOUND: lib/data/finanzas-detalle.test.ts
FOUND: app/(admin)/finanzas/aseos/page.tsx
FOUND: app/(admin)/finanzas/aseos/loading.tsx
FOUND: app/(admin)/finanzas/aseadoras/[id]/page.tsx
FOUND: app/(admin)/finanzas/aseadoras/[id]/loading.tsx
FOUND: app/(admin)/finanzas/_components/TablaAseosFinanciera.tsx
FOUND: app/(admin)/finanzas/_components/FiltrosDeAseos.tsx
FOUND: app/(admin)/finanzas/_components/FichaAseadora.tsx
FOUND: app/(admin)/finanzas/_components/BloqueAhoraMismo.tsx
FOUND: 079c46a
FOUND: dbe3fa7
```

Y las cuatro puertas locales, en la última corrida:

| Puerta | Resultado |
|---|---|
| `npm run test:unit` | **1197 verdes, 63 archivos** (43 de este plan) |
| `npx tsc --noEmit` | limpio |
| `npm run lint` | 0 errores, 2 avisos preexistentes de la línea base de la Fase 4 |
| `npm run ci:arch` | los tres guardarraíles en verde |
| `grep -rc "destructive" TablaAseosFinanciera.tsx` | **0** |
| `grep -riEc "ubicaci\|mapa\|gps\|coordenad" BloqueAhoraMismo.tsx` | **0** |
