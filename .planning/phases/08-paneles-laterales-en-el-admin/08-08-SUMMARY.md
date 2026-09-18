---
phase: 08-paneles-laterales-en-el-admin
plan: 08
subsystem: ui
tags: [panel, sheet, searchparams, rsc, borrado-de-ruta, finanzas, accesibilidad]

requires:
  - phase: 07-finanzas
    provides: "leerAseadoraDeLaFicha(), leerAhoraMismo() e identificadorValido() de lib/data/finanzas-detalle.ts; leerPeriodoPendienteDeCierre() de lib/data/pagos.ts; leerCostoPorAseadora() y costoPorAseadora() con su definición de «lo que cuesta»; CirculoIniciales; y el copy de los tres estados de «Ahora mismo», que este panel reutiliza importándolo"
  - phase: 08-paneles-laterales-en-el-admin
    provides: "08-04: PanelLectura, GrupoDePanel y FilaDeDato, con los tres overrides obligatorios. 08-06: el patrón del anfitrión que compone sus direcciones en el servidor y las baja como props. 08-02 §6.2: las instrucciones 3, 5 y 7"
provides:
  - "PanelAseadora: los cuatro grupos de §9, con los apartamentos como párrafo y no como filas"
  - "lib/data/panel-aseadora.ts con leerPanelDeAseadora(): los cinco datos de D8-4 en una sola lectura, y la decisión de vocabulario sobre qué es «el periodo abierto»"
  - "/finanzas?aseadora={uuid}, conservando rango y ancla al abrir y al cerrar"
  - "El borrado de app/(admin)/finanzas/aseadoras: la única página que esta fase se lleva por delante"
  - "estadoDeAhoraMismo(), exportado: la fuente única del copy de los tres estados"
  - "La nota de higiene en el bloque L de 11_financiero.test.sql, con las siete funciones que se quedan sin llamador en producción"
affects: [08-09, 08-10, 08-11, 08-12, 08-13, 08-14]

tech-stack:
  added: []
  patterns:
    - "Un anfitrión cuya lista está recortada por un filtro de servidor NO puede validar la existencia contra lo que ya leyó: la validación va contra una lectura propia que no depende del rango, o un enlace válido abre la pantalla sin panel"
    - "El panel se renderiza como HERMANO del contenedor que se atenúa durante la navegación, nunca como hijo suyo: la posición en el árbol es una decisión de comportamiento, no de anidamiento"
    - "El copy que un contrato exige «palabra por palabra» en dos superficies se IMPORTA, no se copia: una segunda copia se queda atrás en el primer retoque del contrato"
    - "Cuando la lectura que decide si hay panel es la misma que trae el nombre de su cabecera, el panel no lleva barrera de suspensión: el anfitrión espera y el panel se pinta completo, porque la alternativa (que el panel aparezca solo al llegar los datos) está prohibida por nombre"

key-files:
  created:
    - lib/data/panel-aseadora.ts
    - app/(admin)/finanzas/_components/PanelAseadora.tsx
  modified:
    - app/(admin)/finanzas/page.tsx
    - app/(admin)/finanzas/_components/FilaAseadora.tsx
    - app/(admin)/finanzas/_components/TablaAseosFinanciera.tsx
    - app/(admin)/finanzas/_components/SubNavFinanzas.tsx
    - app/(admin)/finanzas/_components/BloqueAhoraMismo.tsx
    - supabase/tests/11_financiero.test.sql
  deleted:
    - app/(admin)/finanzas/aseadoras/[id]/page.tsx
    - app/(admin)/finanzas/aseadoras/[id]/loading.tsx

key-decisions:
  - "«El periodo abierto» de D8-4 es el periodo de pago sin cerrar, NO el rango del filtro de la pantalla. Con el filtro en día, el rango haría que «Lleva ganado» dijera lo de un día, que no es lo que la etiqueta promete. La decisión va escrita en la cabecera del módulo de lectura y repetida en el componente"
  - "La existencia se valida contra leerAseadoraDeLaFicha() y no contra la lista del bloque 3. Medido en el navegador: una aseadora sin actividad en el rango filtrado NO sale de esa lista, y con la validación barata su enlace abriría la pantalla sin panel. Con la validación correcta, abre"
  - "El panel NO lleva barrera de suspensión, al revés que los otros tres. La lectura que decide si hay panel es la misma que trae el nombre y el estado de la cabecera, así que un esqueleto del cuerpo no podría pintarse nunca, y envolver el panel entero haría que apareciera solo al llegar los datos, que §11.1 punto 3 prohíbe por nombre"
  - "El copy de AHORA MISMO se importa de BloqueAhoraMismo.tsx en vez de duplicarse. §9.2 lo exige palabra por palabra y la única forma de garantizarlo es que los dos sitios llamen a la misma función. Efecto lateral útil: ese componente conserva un consumidor en producción"
  - "La forma del identificador se vuelve a comprobar dentro de la lectura de asignaciones. Es la única consulta del módulo donde el identificador entra en una EXPRESIÓN DE FILTRO de PostgREST y no como argumento de una función, o sea una clase de defecto distinta a la que cubre el guarda del anfitrión"
  - "El ganado del grupo 4 sale de costoPorAseadora() del dominio y no de una suma propia. Es la misma cuenta y la misma lectura que ya pinta la fila del bloque 3, y además cuela los enteros antes de sumarlos, que es la trampa que documenta lib/data/finanzas-detalle.ts"
  - "La celda de apartamento de la tabla financiera pasa a la ficha de lectura y NO lleva desactivado el salto de scroll: navega a otra ruta, y conservar la posición dejaría al admin a media página de una lista que no ha visto"

patterns-established:
  - "Un panel cuyo anfitrión tiene una lista recortada declara en su cabecera POR QUÉ no puede copiar la validación barata, o el siguiente que lea los dos anfitriones va a pensar que uno de los dos está mal"
  - "Al borrar una ruta, la nota de higiene va en DOS sitios: al lado de las aserciones que ejercen lo que se quedó sin llamador, y en el SUMMARY. Sin ella, el próximo que audite el schema encuentra funciones huérfanas sin razón escrita"

requirements-completed: []

coverage:
  - id: D1
    description: "leerPanelDeAseadora(): los cinco datos de D8-4, con la aseadora primero y sola"
    verification:
      - kind: other
        ref: "grep -c leerPeriodoPendienteDeCierre → 3 · grep -c payout_periods → 0 · grep -c \"select('*')\" → 0 · grep -ciE de vocabulario excluido → 0"
        status: pass
      - kind: e2e
        ref: "Andamio desechable: con la aseadora sin periodo abierto, el grupo 4 pinta su vacío literal y el panel no revienta"
        status: pass
    human_judgment: false
  - id: D2
    description: "El panel pinta los cuatro grupos de §9.1 en su orden, sin pie, y los apartamentos como párrafo"
    verification:
      - kind: e2e
        ref: "Contenido medido en el DOM del diálogo: `AHORA MISMO · RESPONSABLE DE (2) · EN EL PERIODO ABIERTO`, con los dos nombres separados por coma en una sola definición. `SUPLENTE EN` NO se renderiza con cero, que es §9.3"
        status: pass
      - kind: other
        ref: "grep -c '<Link' PanelAseadora.tsx → 0: los nombres son texto plano y no sacan de Finanzas"
        status: pass
    human_judgment: true
    rationale: "Que el párrafo de doce nombres se lea como un bloque y no como una lista rota, y que la jerarquía de §4.4 ancle en «Lleva ganado», son juicios de pantalla. Los cubren 08-12 y 08-13"
  - id: D3
    description: "El ancho del panel y su comportamiento con el filtro (T-08-33)"
    verification:
      - kind: e2e
        ref: "getBoundingClientRect().width del diálogo = 480. Y cambiando de periodo CON el panel abierto: sigue visible, `opacity: 1` y `pointer-events: auto`, o sea ni atenuado ni sin eventos"
        status: pass
    human_judgment: false
  - id: D4
    description: "Criterio 2: un identificador válido de alguien SIN actividad en el rango filtrado abre su panel (T-08-34)"
    verification:
      - kind: e2e
        ref: "Con `?rango=dia&ancla={día limpio}` y el identificador de la aseadora que no trabajó ese día, el panel abre con sus grupos. Es el caso que la validación contra la lista del bloque 3 habría dejado sin panel"
        status: pass
    human_judgment: false
  - id: D5
    description: "Criterio 3: abrir conserva el periodo y cerrar lo devuelve intacto (T-08-36)"
    verification:
      - kind: e2e
        ref: "`/finanzas?rango=dia&ancla=2026-08-03` → al abrir queda `rango=dia&ancla=2026-08-03&aseadora={id}` → se cambia a Mes con el panel abierto → `rango=mes&ancla=2026-08-03&aseadora={id}` → Escape → `rango=mes&ancla=2026-08-03`, sin el parámetro del panel"
        status: pass
    human_judgment: false
  - id: D6
    description: "§11.4: un identificador huérfano o malformado no abre nada y no reescribe la dirección"
    verification:
      - kind: e2e
        ref: "Huérfano (uuid válido que no es de nadie) → 0 diálogos y el parámetro SE QUEDA en la URL. Malformado → 0 diálogos y la pantalla normal, con el bloque 3 visible. Sin 404, sin aviso, sin panel vacío"
        status: pass
    human_judgment: false
  - id: D7
    description: "Criterio 5: ni una palabra de rastreo, y la comprobación mira DENTRO del panel"
    verification:
      - kind: e2e
        ref: "La expresión regular de las cinco expresiones, corrida sobre el `textContent` del diálogo (no sobre el contenedor de página): cero coincidencias. Y cero imágenes con nombre de mapa dentro del diálogo"
        status: pass
      - kind: other
        ref: "grep -ciE sobre PanelAseadora.tsx y sobre lib/data/panel-aseadora.ts → 0 en los dos, comentarios incluidos"
        status: pass
    human_judgment: false
  - id: D8
    description: "§17.8: la línea que fecha el dato NO aparece en el panel"
    verification:
      - kind: other
        ref: "grep -c 'Al momento de abrir' PanelAseadora.tsx → 0, y el `textContent` del diálogo tampoco la trae"
        status: pass
    human_judgment: false
  - id: D9
    description: "El borrado no deja ningún enlace tipado ni ninguna lógica rota"
    verification:
      - kind: build
        ref: "`npm run build` limpio, con el archivo de tipos de rutas de Next regenerado sin la ruta borrada. 20 rutas, ninguna bajo `/finanzas/aseadoras`"
        status: pass
      - kind: other
        ref: "El diff de SubNavFinanzas.tsx toca SOLO comentarios: el predicado escrito como exclusión siguió marcando `Resumen` sin cambiar una línea de lógica"
        status: pass
    human_judgment: false

duration: 95min
completed: 2026-09-17
status: complete
---

# Fase 8 Plan 08: El panel de aseadora

**El único de los cuatro paneles que reemplaza algo en vez de crearlo: la ficha de una persona deja de ser una página de cuatro bloques y pasa a ser un panel de cuatro grupos sobre el Resumen, sin cambiarle el periodo al admin.**

## Performance

- **Duración:** ~95 min
- **Tareas:** 3, las tres del plan
- **Archivos:** 2 creados, 6 modificados, **2 borrados**

## Lo que quedó construido

**`lib/data/panel-aseadora.ts` (280 líneas).** `leerPanelDeAseadora()` devuelve los cinco datos de D8-4 o `null`. La aseadora va primera y sola: si no aparece, las otras cuatro lecturas no se hacen. Después, en paralelo, el aseo en curso, las asignaciones de responsable y suplente, y el periodo de pago pendiente de cierre. Y encadenada, la única que lo está, el costo de esa persona dentro del rango de ese periodo.

**`PanelAseadora.tsx` (301 líneas).** Los cuatro grupos de §9.1 en su orden, sin pie. Los apartamentos van como párrafo de nombres separados por coma, en texto plano, con el conteo en el encabezado. Los grupos vacíos no se renderizan; si los dos lo están, una sola línea micro.

**`/finanzas?aseadora={uuid}`.** El panel se renderiza como **hermano** del filtro de periodo. La ruta al cerrar se compone en el servidor con el rango y el ancla **normalizados** dentro.

**El directorio borrado.** `app/(admin)/finanzas/aseadoras/` entero, sus dos archivos.

## La aritmética de §9.3, que no era opcional

Una fila por apartamento **no cabe**: doce filas de 21px con su separación son 340, más 25 de encabezado son 365 para ese solo grupo, y sumados los otros tres el total serían **627px contra los 590 disponibles**. Los nombres van como párrafo: unos 140 caracteres a 14px sobre 448 útiles son tres líneas, 63px, y con encabezado 88. **El grupo pasa de 365 a 88.**

Y el panel no lleva pie, que es lo que pone el cuerpo disponible en 590 y no en 506.

## Lo medido en el navegador

Andamio desechable, corrido contra el build de producción en el puerto 3210 y **ya borrado**:

| Qué | Medido |
|---|---|
| Ancho del panel | **480px** |
| URL al abrir | `rango=dia&ancla=2026-08-03&aseadora={id}` · los dos parámetros viajan |
| Cambiar de periodo con el panel abierto | Sigue visible, **`opacity: 1` y `pointer-events: auto`**. Ni atenuado ni sin eventos |
| URL tras cambiar de periodo | `rango=mes&ancla=2026-08-03&aseadora={id}` · el panel se queda abierto, que es el efecto espejo decidido |
| URL al cerrar con Escape | `rango=mes&ancla=2026-08-03` · el parámetro del panel se va y el resto vuelve intacto |
| Aseadora **sin actividad en el rango** | **Abre su panel.** Es el criterio 2, y el atajo no habría servido |
| Identificador huérfano | 0 diálogos, el parámetro se queda en la dirección |
| Identificador malformado | 0 diálogos, pantalla normal |
| Vocabulario de rastreo dentro del diálogo | **0 coincidencias** de las cinco expresiones, y 0 imágenes de mapa |
| La línea que fecha el dato | No aparece |

Contenido real de un panel, leído del DOM del diálogo:

```
AU · Aseador Uno E2E · Activa
AHORA MISMO          No tiene ningún aseo en curso.
RESPONSABLE DE (2)   E2E Fin Bogota …, E2E Fin Medellin …
EN EL PERIODO ABIERTO  Lleva ganado · Todavía no lleva ningún aseo en este periodo.
```

`SUPLENTE EN` no se renderiza con cero, que es exactamente §9.3.

## Deviations from Plan

### 1. [Rule 2] El panel NO lleva barrera de suspensión, y el plan pedía una

- **Encontrado en:** Task 2.
- **El conflicto:** el plan dice *«el panel va dentro de la barrera de suspensión con el esqueleto de la Wave 1»*. En los otros tres anfitriones eso funciona porque el nombre de lo seleccionado está en memoria desde el primer frame y solo el cuerpo espera. **Aquí es imposible**: la lista del Resumen está recortada por el rango, así que la existencia se decide con una lectura propia, y esa misma lectura es la que trae el nombre y el estado de la cabecera.
- **Las dos salidas, y por qué se tomó la que se tomó:** envolver el panel entero haría que **el panel apareciera solo cuando llegan los datos**, y §11.1 punto 3 lo prohíbe por nombre. Una barrera alrededor del cuerpo con la lectura ya resuelta sería un esqueleto que no puede pintarse nunca, o sea una mentira sobre cómo carga este panel, y además ruido que el siguiente lector tendría que descartar.
- **Lo que se hizo:** el anfitrión espera la lectura dentro del `Promise.all` que ya tenía, y el panel se pinta completo de una vez. La razón va escrita en la cabecera del componente.
- **Commit:** `4232eee`.

### 2. [Rule 2] Se tocó `BloqueAhoraMismo.tsx`, que no estaba en `files_modified`

- **Qué:** se exporta la función que resuelve los tres estados, renombrada a `estadoDeAhoraMismo`.
- **Por qué:** §9.2 exige el copy **palabra por palabra, ni una coma distinta**. El plan lo planteaba como duplicar y comparar; la única forma de *garantizarlo* es que los dos sitios llamen a la misma función. Una segunda copia se queda atrás en el primer retoque del contrato, y entonces la misma frase se lee distinta en dos superficies.
- **Efecto lateral útil:** ese componente conserva un consumidor en producción, así que de todo el árbol de la ficha borrada solo queda `FichaAseadora.tsx` sin consumidor (ver abajo).
- **Commit:** `4232eee`.

### 3. [Rule 1] Son TRES funciones de la base sin llamador, no dos

- **El plan contó dos.** El barrido encontró tres: `aseos_de_aseadora` y `gastos_de_aseadora` de la migración 26, **más `pagos_de_aseadora` de la migración 27**, que alimentaba el bloque 3 de la ficha y que la app del aseador no consume (`/mis-pagos` va por otra función).
- **La nota de higiene se escribió con los siete nombres**, no con seis.
- **Commit:** `7ec62b4`.

### 4. [Rule 2] La forma del identificador se comprueba otra vez dentro de la lectura de asignaciones

- **Por qué:** es la única consulta del módulo donde el identificador entra en una **expresión de filtro** de PostgREST (la disyuncción de las dos columnas de asignación) y no como argumento tipado de una función. Un identificador con una coma o un paréntesis reescribiría el filtro. Es una clase de defecto distinta a la que cubre el guarda del anfitrión, que es lo que hace que no sea una copia ociosa.
- **Commit:** `23a9451`.

### 5. [Nota] El presupuesto son 3 latencias en la cadena, o sea 2 MÁS que la pantalla sin panel

El plan dice *«7 consultas en 2 latencias»*. Las 7 consultas son exactas. Las latencias son 3 en la cadena completa, y **2 más** que las que ya tenía la pantalla: la validación de la aseadora entra al `Promise.all` que el Resumen ya hacía, así que no cuesta una ronda propia. Queda escrito así en la cabecera del módulo, con las tres rondas enumeradas.

### 6. [Nota] El barrido deja 6 ocurrencias de la ruta borrada, no 3

Las 3 que el plan anticipaba (el comentario de la sub-navegación, el del menú superior y la cabecera del spec de finanzas) **más 3 que este plan escribió a propósito**, documentando el borrado: en `FilaAseadora.tsx`, en `PanelAseadora.tsx` y en la cabecera de `finanzas/page.tsx`. Las seis son comentarios. Ninguna es código.

Y un séptimo sitio que sí se corrigió y que el plan no listaba: la cabecera de `finanzas/page.tsx` afirmaba que *«las otras TRES rutas de Finanzas conservan su `loading.tsx`»*. Eran dos desde este plan.

## La nota de higiene, con los siete nombres

Va en dos sitios, como pedía el plan: **al lado de las aserciones del bloque L de `supabase/tests/11_financiero.test.sql`**, y acá.

**Tres funciones de la base se quedan sin ningún llamador en producción:**

| Función | Qué alimentaba |
|---|---|
| `public.aseos_de_aseadora(uuid, date, date)` | el bloque 2 de la ficha |
| `public.gastos_de_aseadora(uuid, date, date)` | el bloque 4 de la ficha |
| `public.pagos_de_aseadora(uuid)` | el bloque 3 de la ficha |

**No se borran** (asunción A4): tienen aserciones pgTAP que las ejercen (grants, radio del `security definer`, forma del `returns table` y las cifras del fixture mutilado del bloque G), y borrarlas sería una migración que nadie pidió para quitar cobertura que ya está escrita y en verde.

**Cuatro funciones de la capa de datos se quedan sin consumidor en producción**, todas en `lib/data/finanzas-detalle.ts` y todas con sus pruebas unitarias vivas: `leerAseosDeAseadora`, `leerGastosDeAseadora`, `leerPagosDeAseadora` y `costoDeLaFicha`.

**Lo que SÍ sigue en uso de ese módulo:** `leerAseadoraDeLaFicha`, `leerAhoraMismo` e `identificadorValido`, que son la base del panel nuevo.

**Y un componente se queda sin consumidor:** `app/(admin)/finanzas/_components/FichaAseadora.tsx`, que era el cuerpo de la página borrada. No se borra en este plan porque no está en su alcance declarado, y queda anotado acá para que 08-14 decida. `BloqueAhoraMismo.tsx` **sí** conserva consumidor, porque el panel le importa el copy.

## La pérdida declarada, contada y aceptada

**Un enlace a `/finanzas/aseadoras/{id}` pegado en un chat hace meses pasa a dar 404.** Probablemente nadie lo tiene, y un redirect de compatibilidad sería una ruta nueva que hay que mantener para siempre. **No se hace** (asunción A7).

Y la de §17.3, que ya estaba declarada en el contrato: **la ficha pierde tres bloques y nadie va a saber a dónde se fueron.** El histórico de aseos, los pagos mes a mes y los gastos reportados son alcanzables por `/finanzas/aseos?aseador={id}`, por el mismo con `&filtro=con-gastos` y por `/finanzas/pagos`, pero el panel no los enlaza: enlazarlos sacaría de Finanzas, que es lo que D8-2 prohíbe.

## Los rojos declarados de `e2e/finanzas.spec.ts`

**Uno, y es exactamente el que D8-11 contó.**

| Archivo y línea | Qué afirma | Por qué está rojo | Quién lo cierra |
|---|---|---|---|
| `e2e/finanzas.spec.ts:589` | `waitForURL(/\/finanzas\/aseadoras\//)` | La ruta ya no existe. El caso muere ahí y se lleva por delante el resto del test 7 | **08-11** |
| `e2e/finanzas.spec.ts:592` | `toHaveURL(ancla=…)` | **NO se toca, y se conserva a propósito.** Nunca llega a ejecutarse porque el caso muere en `:589`, pero la URL medida en el andamio (`ancla=2026-08-03` tras abrir) dice que pasaría | **08-11** |
| `e2e/finanzas.spec.ts:631` | el vocabulario de rastreo, acotado por `locator('main')` | Sigue **verde**, y ese es el problema: con el panel portaleado fuera, mira una caja vacía. Medido en el andamio con el ámbito correcto (el diálogo): 0 coincidencias, o sea que **lo que afirma sigue siendo verdad** | **08-11** |

`e2e/finanzas.spec.ts:24`, el comentario de cabecera que cita la ruta borrada, **se actualiza en 08-11**, no acá.

**Cualquier rojo fuera de esta lista sería un hallazgo. No hubo ninguno.**

## Las cuatro suites

| Capa | Línea base | Ahora |
|---|---|---|
| Unitarios | 1235 | **1235** en verde, 65 archivos |
| Integración | 205 | **205** en verde, 23 archivos |
| pgTAP | 380 | **380** en verde, cero `not ok`. La nota de higiene es un comentario y el plan sigue donde estaba |
| E2E | 133 pasando · 1 saltado · 1 rojo declarado | **132 pasando · 1 saltado · 2 rojos** |

Los dos rojos de E2E: `e2e/apartamentos-lista.spec.ts:376` (heredado, material de 08-11) y `e2e/finanzas.spec.ts:579` (el test 7, nuevo y declarado arriba). **Exactamente un caso pasó de verde a rojo, y es el que el plan contó.**

`npx tsc --noEmit`, `npm run lint`, `npm run ci:arch` y `npm run build` limpios. Diff sobre `app/(cleaner)` vacío.

## Threat register

| ID | Disposición | Cómo quedó |
|---|---|---|
| T-08-33 | mitigate | El panel se renderiza como hermano del filtro. Medido tras cambiar de periodo con el panel abierto: `opacity: 1`, `pointer-events: auto`, y cierra con Escape |
| T-08-34 | mitigate | La existencia se valida con la lectura que filtra por papel. Medido: una aseadora sin actividad en el rango filtrado abre su panel |
| T-08-35 | mitigate | Prohibición por nombre en los dos archivos, grep con conteo cero en los dos (comentarios incluidos), y la expresión regular corrida sobre el `textContent` del diálogo |
| T-08-36 | mitigate | Ruta al cerrar compuesta en el servidor con el rango y el ancla **normalizados**. Medido en los dos sentidos |
| T-08-37 | mitigate | Nota de higiene en el bloque L y en este SUMMARY, con los siete nombres (tres de la base, cuatro de la capa de datos) |
| T-08-38 | accept | Contado y escrito. Sin redirect de compatibilidad |

## Lo que queda sin cubrir, y hay que saberlo

1. **La rama NO vacía del grupo 4 no se ejerció en el navegador.** El fixture financiero siembra dos periodos cerrados y ninguno vencido sin cerrar, así que `periodo_pendiente_de_cierre()` devuelve nulo y el panel pinta su vacío, que es correcto y es lo que se midió. La rama con cifras (`Lleva ganado $X` más `{N} aseos · {$G} en gastos`) **no se vio pintada**. Su aritmética es la misma `costoPorAseadora()` que los unitarios cubren y que el bloque 3 ya renderiza, pero el ensamblaje de las dos líneas no tiene medición. **Es material para 08-11**, y basta con sembrar un periodo vencido sin cierre.
2. **No hay test de integración para `leerPanelDeAseadora`.** El plan no lo pedía y ningún archivo de test estaba en sus `files_modified`.
3. **La premisa de la atenuación no se pudo falsar.** El plan afirma que la posición en el árbol de React es la que decide si el panel recibe la clase de atenuación. El panel se portalea a `body`, y la herencia de CSS sigue el DOM y no el árbol de React, así que es probable que un panel renderizado como hijo tampoco se atenuara. **No se midió la rama mala**: se tomó la posición segura, que además es la que el plan ordena, y se midió que la buena se comporta. Si alguien quiere el dato, el experimento es mover el panel dentro del filtro y volver a leer `opacity` y `pointer-events` tras cambiar de periodo.

## Self-Check: PASSED

- `lib/data/panel-aseadora.ts` — FOUND
- `app/(admin)/finanzas/_components/PanelAseadora.tsx` — FOUND
- `app/(admin)/finanzas/aseadoras` — AUSENTE (correcto: borrado)
- `23a9451` — FOUND
- `4232eee` — FOUND
- `7ec62b4` — FOUND
