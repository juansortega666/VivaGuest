---
phase: 05-notificaciones-push-e-instalaci-n-de-la-pwa
plan: 16
subsystem: ui
tags: [dashboard, alertas, fechas, bogota, rsc, vitest, playwright, d-08]
status: complete

requires:
  - phase: 04
    provides: "`leerOperacion()`, `agruparPorDia()`, `BloqueDia`, `TablaDia`, `FilaAseo`, `alertasComputadas()` y el ancla `#aseo-{id}` de §11.3, que es lo que este plan hace alcanzable"
  - phase: 05-13
    provides: "`sumarDias()` promovida a `lib/domain/dates.ts`, que es la aritmética de calendario del límite inferior nuevo"
  - phase: 05-15
    provides: "`ContextoDeAcciones` tal como quedó tras el cableado de los avisos, que es donde entra `ahoraMs`"
provides:
  - "`VENTANA_ATRAS_DIAS = 7` y el límite inferior de la consulta en `hoy − 7`: un aseo de ayer vivo y vencido por fin llega a `alertasComputadas()`"
  - "El SEGUNDO filtro de fecha reescrito: `agruparPorDia()` clasifica lo anterior a hoy en `atrasados` en vez de descartarlo"
  - "`BloquesDeAgenda` con `atrasados`, `primerDiaDeLaVentana`, `antesDeLaVentana` y `masViejoAtrasado`"
  - "El bloque `Atrasados` en `/operacion`: primero, expandido, agrupado por día, solo si tiene contenido, sin un solo componente nuevo"
  - "La tercera señal inline `Hourglass` en `FilaAseo`, en cualquier bloque"
  - "`horaLimiteVencida()` exportada de `lib/domain/alertas.ts`: UN predicado para la alerta y para la señal de la fila"
  - "Los dos títulos de `hora_limite_vencida` de §12.6, con la fecha cuando el aseo es de un día anterior"
  - "`ContextoDeAcciones.ahoraMs`: el instante único de la lectura (D-14) baja hasta la fila"
affects: [05-17, 06]

tech-stack:
  added: []
  patterns:
    - "Cuando un dato se filtra DOS veces —en la consulta y en la proyección— ampliar uno solo produce el peor resultado posible: la sensación de arreglado con el defecto intacto. El plan lo trajo escrito y el señuelo se corrió en los dos sentidos para medirlo"
    - "Un filtro redundante en una proyección pura no se borra por redundante: existe porque los tests la llaman con filas armadas a mano, y una proyección que dependa de que su entrada venga filtrada miente en cuanto alguien la reutiliza. Se REESCRIBE con su razón nueva"
    - "Un predicado que gobierna dos superficies (una alerta y la fila donde aterriza su clic) se exporta una vez del módulo de dominio: escribirlo a mano en el componente sería una segunda verdad, y la que se quedara atrás lo haría en silencio"
    - "Un componente de servidor no lee el reloj: `ahoraMs` baja por el objeto de contexto que ya atraviesa la jerarquía. Dos relojes para la misma pregunta es lo que D-14 prohíbe, y en un componente de cliente además parpadea entre el HTML servido y la hidratación"
    - "Un bloque que es un FILTRO SOBRE UNA FALLA desaparece vacío; un bloque que es un HECHO DEL CALENDARIO se pinta vacío. La asimetría contradice a `04-UI-SPEC` §8.1 y por eso va escrita en el sitio donde se decide"
    - "Antes de escribir un comentario que nombre un token que un criterio de aceptación cuenta con `grep`, se comprueba: la prosa de `alertas.ts` tuvo que reescribirse porque decir `new Date(` dentro de un comentario inflaba su propia métrica"

key-files:
  created: []
  modified:
    - lib/data/operacion.ts
    - lib/data/operacion.test.ts
    - lib/data/operacion.integration.test.ts
    - lib/domain/alertas.ts
    - lib/domain/alertas.test.ts
    - app/(admin)/operacion/page.tsx
    - app/(admin)/operacion/_components/BloqueDia.tsx
    - app/(admin)/operacion/_components/FilaAseo.tsx
    - app/(admin)/operacion/_components/MenuAseo.tsx
    - .planning/phases/05-notificaciones-push-e-instalaci-n-de-la-pwa/deferred-items.md

key-decisions:
  - "Se cambiaron LOS DOS filtros de fecha y el señuelo del segundo se corrió en rojo y en verde: con el descarte de `agruparPorDia()` restaurado a mano y la consulta ya ampliada, seis tests se ponen rojos. Esa es la medición de que ampliar solo la consulta habría dejado el bloque vacío y el defecto vivo"
  - "La ventana hacia atrás es de siete días y la constante lleva escritas las tres razones, incluida la que decide: siete YA es una ventana de este producto (el toggle `Ver atendidas`), y reusar el número evita que dos partes de la misma pantalla midan `reciente` distinto (T-05-54)"
  - "`atrasados` solo emite los días CON contenido, al revés que `siguientes`, que emite sus cinco vacíos incluidos. Un día futuro vacío es información; un día pasado vacío es que no había nada que hacer, y siete cabeceras en cero son un muro que entrena a saltarse el bloque"
  - "El bloque desaparece vacío, contradiciendo `04-UI-SPEC` §8.1, y la razón va escrita en `page.tsx` para que no parezca descuido: `Hoy` vacío es un dato que el admin confirma; `Atrasados` vacío es el estado normal, y verlo en cero todos los días entrena a saltárselo justo para el día que diga `3`"
  - "El predicado salió a `horaLimiteVencida()` en `lib/domain/alertas.ts` y lo usan la alerta computada Y el `Hourglass` de la fila. Un `state === 'pendiente' || …` escrito dentro del componente habría sido una cuarta copia del mismo `if` y el riesgo exacto de T-05-55: una alerta sin fila que la respalde, o al revés"
  - "`ContextoDeAcciones` gana `ahoraMs` en vez de que la fila llame a `Date.now()`: la fila vive del lado del cliente, así que su reloj daría otra hora que la del servidor y el marcador parpadearía en la hidratación. Con la marca única de D-14, la señal de la fila y la alerta del panel no pueden contradecirse"
  - "El copy del caso de HOY también cambió, no solo el del día anterior: el del repo (`La hora límite de las {HH:MM} pasó y el aseo no ha terminado.`) no era ninguna de las dos variantes de §12.6. Declarado por el planner y aceptado por el checker"
  - "Los dos títulos van LITERALES y no compuestos de un tronco común: son el contrato de copy de §12.6 y se leen de un vistazo contra su tabla. Un sufijo compartido ahorraba siete palabras y costaba esa comprobación"
  - "Ningún tipo nuevo de alerta, ningún cambio en el mapa de presentación y ninguna jerarquía visual: el recorrido de homogeneidad sigue verde y `alertas.test.ts` no tiene una sola línea borrada en el diff (+71/−0 en el commit de la tarea 2)"
  - "Ninguna fila se tinta. Medido en el navegador: la fila atrasada y una normal devuelven el mismo `background-color` computado (`oklch(1 0 0)`), y `grep -cE 'bg-surface-warn|bg-status'` en `FilaAseo.tsx` sigue en 1, el de la badge `Emergencia`"
  - "La señal `Hourglass` se muestra también dentro de `Atrasados`, donde es redundante por construcción: una fila que cambia de vocabulario según el bloque en que vive es una fila que hay que aprender dos veces"

patterns-established:
  - "Señuelo del SEGUNDO filtro corrido y anotado en las dos direcciones: restaurado, 6 de 28 rojos en `operacion.test.ts`; retirado, 28 de 28 verdes"
  - "La verificación de aterrizaje del clic se automatizó con un spec temporal de Playwright contra `next build`, se leyeron los valores en consola y el spec se borró: no queda deuda de test, y lo verificado quedó escrito con sus valores exactos"
  - "Un test de integración que afirma la forma vieja de una ventana se REESCRIBE midiendo las dos mitades juntas: la consulta ahora trae el aseo de ayer Y la proyección lo deja fuera de `Atrasados` por estar cerrado, las dos aserciones en la misma prueba y contra PostgREST de verdad"

requirements-completed: [DASH-05, DASH-01]

coverage:
  - id: D1
    description: "Los dos filtros de fecha ampliados: la consulta baja a `hoy − 7` y la proyección clasifica lo anterior a hoy en `atrasados` en vez de descartarlo"
    requirement: DASH-01
    verification:
      - kind: unit
        ref: "lib/data/operacion.test.ts#D-08: el límite inferior baja SIETE días, no se queda en hoy"
        status: pass
      - kind: unit
        ref: "lib/data/operacion.test.ts#acota la ventana al día de negocio de BOGOTÁ, no al del proceso (el señuelo de zona sigue vivo: gte == '2026-09-03')"
        status: pass
      - kind: unit
        ref: "lib/data/operacion.test.ts#AGRUPA lo anterior a hoy POR DÍA y en orden ascendente, no en una lista corrida"
        status: pass
      - kind: unit
        ref: "lib/data/operacion.test.ts#un aseo de AYER va al bloque Atrasados y a ningún otro"
        status: pass
      - kind: unit
        ref: "lib/data/operacion.test.ts#NO toca los tres bloques existentes ni el conteo del horizonte (T-05-56)"
        status: pass
      - kind: integration
        ref: "lib/data/operacion.integration.test.ts#trae los seis aseos de la ventana, cancelado y el de AYER incluidos (D-08)"
        status: pass
      - kind: other
        ref: "SEÑUELO, corrido en los dos sentidos: con `if (fecha < hoy) continue;` restaurado en agruparPorDia y la consulta ya ampliada → 6 fallos / 28; retirado → 28 de 28"
        status: pass
      - kind: other
        ref: "grep -c VENTANA_ATRAS lib/data/operacion.ts == 7 (>= 2); grep -c 'new Date(' == 3, igual que antes"
        status: pass
    human_judgment: false
  - id: D2
    description: "El tope de siete días y su contrapartida: lo que queda más atrás se cuenta y se dice dónde verlo, en vez de crecer sin límite con la retención de seis meses (T-05-54)"
    requirement: DASH-01
    verification:
      - kind: unit
        ref: "lib/data/operacion.test.ts#el tope es de SIETE días: lo de hace ocho no se agrupa, solo se cuenta"
        status: pass
      - kind: unit
        ref: "lib/data/operacion.test.ts#expone la fecha del atrasado MÁS VIEJO, que es lo que la cabecera necesita"
        status: pass
      - kind: other
        ref: "grep -c 'sin cerrar de antes del' app/(admin)/operacion/page.tsx == 1"
        status: pass
    human_judgment: false
    rationale: "El conteo `antesDeLaVentana` es hoy inalcanzable con el cliente real, ver Deuda declarada. El tope en sí sí está vivo y medido."
  - id: D3
    description: "Los dos títulos de `hora_limite_vencida`: la hora cuando venció hoy, la fecha cuando venció antes, con la misma clave, la misma URL y el mismo instante de orden"
    requirement: DASH-05
    verification:
      - kind: unit
        ref: "lib/domain/alertas.test.ts#vencida HOY, el título dice LA HORA (05-UI-SPEC §12.6)"
        status: pass
      - kind: unit
        ref: "lib/domain/alertas.test.ts#vencida en un DÍA ANTERIOR, el título dice LA FECHA y no la hora"
        status: pass
      - kind: unit
        ref: "lib/domain/alertas.test.ts#los dos casos comparten CLAVE y URL: ni tipo nuevo ni destino nuevo"
        status: pass
      - kind: unit
        ref: "lib/domain/alertas.test.ts#la fecha del título sale del helper del proyecto, NO de un `new Date` (primero de mes, no retrocede a agosto)"
        status: pass
      - kind: unit
        ref: "lib/domain/alertas.test.ts#LAS DOCE ENTRADAS COMPARTEN COLOR, TAMAÑO Y PESO — sin editar, +71/−0 en el diff del commit"
        status: pass
      - kind: other
        ref: "grep -ac 'Se venció la hora límite' lib/domain/alertas.ts == 2; el copy viejo fuera de comentarios == 0; 'new Date(' == 1, igual que antes"
        status: pass
    human_judgment: false
  - id: D4
    description: "El bloque `Atrasados` en `/operacion`: primero, expandido, agrupado por día, solo si tiene contenido, sin componentes nuevos"
    requirement: DASH-01
    verification:
      - kind: automated_ui
        ref: "playwright contra `next build` (spec temporal, borrado): rótulos en orden == ['Atrasados','Mar, 8 de septiembre','Jue, 10 de septiembre','Hoy · vie, 11 de septiembre','Mañana …','Siguientes (5 días)', …] — primero, agrupado por día y ascendente"
        status: pass
      - kind: automated_ui
        ref: "playwright: cabecera == '3 aseos · el más viejo del 8 de septiembre' (plural) y '1 aseo · del 10 de septiembre' (singular)"
        status: pass
      - kind: automated_ui
        ref: "playwright: 3 filas dentro de `Atrasados` con dos vivos y un en_curso sembrados; el completado y el de gestión externa de ayer NO entran"
        status: pass
      - kind: other
        ref: "condición de render `bloques.atrasados.length > 0` en page.tsx; `Atrasados` en la línea 460, `Hoy` en la 504; cero archivos nuevos bajo _components/ en el diff"
        status: pass
      - kind: other
        ref: "npm run build (14 rutas) && npm run ci:arch (3 scripts OK) && npx tsc --noEmit"
        status: pass
    human_judgment: true
    rationale: "Que el bloque se lea como «esto ya salió mal» sin gritar, que su cabecera sin fecha relativa no se confunda con un día, y que tres bloques de día apilados encima del carril sigan cabiendo sin empujar el panel de alertas fuera de la pantalla, son juicios visuales. Hay que abrir `/operacion` con aseos atrasados sembrados a 1280px y a 1440px."
  - id: D5
    description: "La tercera señal inline `Hourglass`, en cualquier bloque, sin que la fila gane tratamiento visual nuevo"
    requirement: DASH-01
    verification:
      - kind: unit
        ref: "lib/domain/alertas.test.ts#es el MISMO predicado que decide la alerta: la fila y el panel no pueden divergir"
        status: pass
      - kind: unit
        ref: "lib/domain/alertas.test.ts#no lee el reloj: el instante entra por parámetro"
        status: pass
      - kind: automated_ui
        ref: "playwright: 1 `Hourglass` en la fila atrasada, 1 en la fila de HOY vencida fuera de `Atrasados`, 4 filas con la señal en toda la pantalla con 4 aseos vencidos sembrados"
        status: pass
      - kind: automated_ui
        ref: "playwright: `getComputedStyle(fila).backgroundColor` idéntico entre la fila atrasada y una normal (`oklch(1 0 0)`) — la fila no se tinta"
        status: pass
      - kind: other
        ref: "grep -c Hourglass FilaAseo.tsx == 4 (>= 1), con `aria-label` y sin `aria-hidden` en ese icono; grep -cE 'bg-surface-warn|bg-status' == 1, sin aumento"
        status: pass
    human_judgment: true
    rationale: "Que tres iconos de 14px del mismo color en la misma celda sigan siendo legibles como tres señales distintas y no como un borrón, es lo único de §12.5 que no se puede medir. Hay que ver una fila que lleve `Zap`, `Flag` y `Hourglass` a la vez."
  - id: D6
    description: "EL CIERRE DEL CRITERIO 7: la alerta de un aseo de ayer se ve, se toca, y el toque lleva a su fila dentro de `Atrasados`"
    requirement: DASH-05
    verification:
      - kind: automated_ui
        ref: "playwright contra `next build`: título de la alerta == 'Se venció la hora límite del 10 de septiembre y el aseo sigue sin terminar.', con el relativo `ayer 11:30` al lado"
        status: pass
      - kind: automated_ui
        ref: "playwright: clic en la alerta → URL termina en `#aseo-{id}` y la fila queda `toBeInViewport()` dentro del bloque `Atrasados` (T-05-55)"
        status: pass
    human_judgment: false

metrics:
  duration: "~2 h"
  completed: 2026-09-11
  tasks: 3
  files-changed: 10
  commits: 5
---

# Fase 05 Plan 16: `Atrasados` y la alerta que por fin aterriza — Resumen

Un aseo de ayer, vivo y con la hora límite vencida, deja de perderse en silencio: genera alerta con su fecha en el título, y el clic de esa alerta llega a su fila dentro de un bloque `Atrasados` que antes no existía.

## Qué se construyó

**La consulta y la proyección, las dos.** `leerOperacion()` baja su límite inferior de `hoy` a `hoy − VENTANA_ATRAS_DIAS` (siete), conservando intacto el razonamiento de que la ventana sale del día de negocio de Bogotá y no de la fecha del proceso: lo único que cambió es el desplazamiento. Y `agruparPorDia()` deja de descartar lo anterior a hoy y lo clasifica en `atrasados`, agrupado por día y ascendente.

**El bloque.** `Atrasados` va primero, encima de `Hoy`, expandido, y solo si tiene contenido. Usa el mismo `BloqueDia` y la misma `TablaDia` que ya existían; el único cambio de componente es una prop `resumen` para recibir la cabecera ya compuesta (`3 aseos · el más viejo del 8 de septiembre`), porque `el más viejo del …` sale de un dato de la proyección que un bloque de día no tiene por qué conocer.

**La tercera señal.** `Hourglass` de 14px en `--status-warn`, con `aria-label` y sin `aria-hidden`, en la fila de cualquier bloque. Su condición no se escribe en el componente: sale de `horaLimiteVencida()`, la misma función que decide si el panel alerta.

**El copy.** Los dos títulos de §12.6, elegidos según si la fecha del aseo es anterior a hoy. Cero cambios visuales en el panel.

## Por qué eran dos filtros y no uno

Es el hallazgo que el `05-PATTERNS.md` trajo y que decide la forma entera del plan. Había un `.gte('scheduled_date', hoy)` en la consulta **y** un `if (fecha < hoy) continue;` en la proyección, con un comentario que explicaba por qué existía: `agruparPorDia()` también la llaman los tests con filas armadas a mano, y una proyección que dependa de que su entrada venga filtrada miente en cuanto alguien la reutiliza.

Ese comentario seguía siendo correcto, así que el filtro no se borró: se reescribió. Lo que cambió no es si el filtro es suyo, es a dónde van esas filas.

**Medido, no supuesto.** Con el descarte restaurado a mano y la consulta ya ampliada, seis tests de `operacion.test.ts` se ponen rojos, entre ellos el que nombra el caso:

```
× AGRUPA lo anterior a hoy POR DÍA y en orden ascendente, no en una lista corrida
× un aseo de AYER va al bloque Atrasados y a ningún otro
× solo entran los VIVOS y GESTIONADOS: terminado, cancelado y externo quedan fuera
× el tope es de SIETE días: lo de hace ocho no se agrupa, solo se cuenta
× expone la fecha del atrasado MÁS VIEJO, que es lo que la cabecera necesita
× solo emite los días QUE TIENEN algo: un día viejo sin aseos no pinta cabecera
      Tests  6 failed | 22 passed (28)
```

Retirado el señuelo: 28 de 28. Ampliar solo la consulta habría dejado el bloque vacío con la sensación de estar arreglado, que era exactamente el aviso del plan.

## La comprobación del aterrizaje, contra el build de producción

El criterio de aceptación pedía verlo, no deducirlo. Se escribió un spec temporal de Playwright, se corrió contra `npm run build && npm run start` con el stack local, se leyeron los valores y se borró el spec. Lo que imprimió:

```
ROTULOS EN ORDEN: ["Atrasados","Mar, 8 de septiembre","Jue, 10 de septiembre",
                   "Hoy · vie, 11 de septiembre","Mañana · sáb, 12 de septiembre",
                   "Siguientes (5 días)", …]
RESUMEN DE LA CABECERA: 3 aseos · el más viejo del 8 de septiembre
FILAS DENTRO DE ATRASADOS: 3 (3 vivos; el completado y el externo de ayer NO entran)
Hourglass EN LA FILA ATRASADA: 1
Hourglass EN LA FILA DE HOY (fuera de Atrasados): 1
FONDO DE LA FILA ATRASADA: oklch(1 0 0) | FONDO DE UNA FILA NORMAL: oklch(1 0 0)
TITULO DE LA ALERTA: HORA LÍMITE VENCIDA | ayer 11:30 |
                     E2E Op Gestionada · Se venció la hora límite del 10 de
                     septiembre y el aseo sigue sin terminar.
EL CLIC ATERRIZO EN LA FILA, DENTRO DE ATRASADOS: OK
```

Con un solo atrasado la cabecera dice `1 aseo · del 10 de septiembre`. El `ayer 11:30` del panel es, además, la confirmación práctica del argumento de §12.6: la información que distinguiría una alerta vieja de una de hoy ya estaba ahí y es más precisa que cualquier color.

La base quedó limpia (`cleanings` en 0, cero propiedades `E2E Op` residuales) y no quedó ningún archivo de spec ni de `test-results/`.

## Desviaciones respecto al plan

### 1. [Regla 1 — Bug] Tres tests preexistentes codificaban el defecto y hubo que reescribirlos

El criterio de aceptación decía que los tests preexistentes siguieran verdes *sin haber sido editados*. Tres de ellos afirmaban literalmente la ventana vieja, que es el defecto:

| Test | Archivo | Qué afirmaba |
|---|---|---|
| `un aseo de AYER no aparece en ningún bloque ni en el conteo del horizonte` | `lib/data/operacion.test.ts` | Que lo de ayer se descarta |
| `trae los cinco aseos de la ventana … y deja fuera el de ayer` | `lib/data/operacion.integration.test.ts` | Que la consulta no lo trae |
| `con el JWT de una aseadora la RLS recorta el conjunto (T-04-13)` | `lib/data/operacion.integration.test.ts` | El conjunto de la ventana vieja |

Los tres se reescribieron conservando la mitad que sigue valiendo, no se borraron:

- El unitario conserva intacta la aserción de que un aseo anterior a hoy **no** se cuela en `hoy`, `mañana`, `siguientes` ni en el conteo del horizonte, y suma que sí va a `atrasados`.
- El de integración del conjunto ahora corre además `agruparPorDia()` sobre las filas reales y afirma que el terminado de ayer, que la consulta sí trae, **no** entra en `Atrasados` por estar cerrado: las dos mitades de la historia de los dos filtros, medidas juntas contra PostgREST.
- El de RLS conserva exactamente lo que mide (que `cleanings_cleaner_select` recorta por `aseador_id`) y solo suma la fila que la ventana ampliada alcanza. Queda escrito en el comentario: ampliar la ventana no le dio a la aseadora ni una fila ajena.

**Lo que sí se cumplió literalmente:** el recorrido de homogeneidad de `alertas.test.ts` (T-05-56, criterio 4 de la Fase 4) no tiene una sola línea editada. El commit de la tarea 2 es `+71/−0` en ese archivo.

Commits: `64f39d1`, `463af34`.

### 2. [Regla 2 — Funcionalidad crítica] `horaLimiteVencida()` salió a `lib/domain/alertas.ts`

La tarea 3 listaba solo los tres archivos de UI. La señal `Hourglass` necesita el predicado «vivo, gestionado y vencido», que ya existía escrito dos veces (en `alertasComputadas()` y, en su forma de estados, en `operacion.ts`). Escribirlo una tercera vez dentro del componente era exactamente el riesgo de T-05-55: la fila diciendo que va tarde y el panel no, o al revés, sin que nada avise.

Se exportó el predicado y `alertasComputadas()` pasó a usarlo, así que hay un solo sitio donde esto está escrito. El plan ya declaraba `lib/domain/alertas.ts` en `files_modified` y `05-UI-SPEC` §17.4 lo lista como módulo que esta fase modifica. Dos tests nuevos lo afirman, uno de ellos comparando el conjunto entero que devuelve el predicado contra el que produce el panel.

Commit: `8e744b2`.

### 3. [Regla 2] `ContextoDeAcciones` ganó `ahoraMs`

`FilaAseo` no tenía forma de saber la hora y vive dentro de la frontera de cliente (`BloqueDia` es `'use client'`). Un `Date.now()` ahí habría dado una hora distinta de la del servidor y el marcador habría parpadeado en la hidratación; y aunque coincidieran, serían dos instantes para la misma pregunta, que es lo que D-14 prohíbe. Entra por el objeto de contexto que ya atraviesa `BloqueDia → TablaDia → FilaAseo`, con la misma marca única que usan la ventana de la consulta y el cómputo de las alertas.

Commit: `8e744b2`.

### 4. [Cosmética, decidida en el sitio] Forma singular de la cabecera

§12.2 solo redactó la forma plural (`3 aseos · el más viejo del 4 de septiembre`). Con un solo atrasado, «el más viejo» es una comparación sobre un conjunto de uno. Se emite `1 aseo · del 10 de septiembre`, conservando la fecha, que es el dato que da la decisión. El pluralizado sigue el mismo patrón que `04-UI-SPEC` §8.1 ya usaba en las otras cabeceras.

### 5. Dos criterios de aceptación con la letra distinta y el espíritu cumplido

- **`grep -c "formatFechaBog" lib/domain/alertas.ts >= 1`** → el helper usado es `formatFechaLargaBog`, que no contiene esa subcadena. Es el correcto y `dates.ts` ya declara por qué existe: `formatFechaBog` emite el día de la semana (`vie, 4 de septiembre`) y detrás de «del» eso es agramatical. El espíritu del criterio —que la fecha salga del helper del proyecto y no de un instante construido a mano— está cubierto por el test del primero de mes.
- **`grep -c` sobre `lib/domain/alertas.ts` no imprime nada.** El archivo contiene un byte NUL usado a propósito como separador de claves en dos plantillas (`${n.type}\0${n.cleaning_id}`), así que `grep` lo trata como binario y suprime la salida. Hay que usar `grep -a`. Es preexistente y no se tocó.

## Deuda declarada

**Las dos líneas de «lo que queda fuera de la ventana» son inalcanzables por construcción.** `masAllaDelHorizonte` (preexistente, Fase 4) y `antesDeLaVentana` (nuevo) se calculan en la proyección con los mismos dos límites que la consulta ya aplicó, así que las filas que los harían mayores que cero nunca llegan. Ninguna de las dos líneas puede renderizarse hoy con el cliente real.

No se arregló porque el plan pide explícitamente construir la línea nueva *«con el mismo patrón que la que ya existe para el horizonte»*, y ese patrón es este. Hacerlas de verdad exige un segundo viaje a la base, que rompe la propiedad de «una sola ida» que la cabecera de `lib/data/operacion.ts` declara: es decisión de arquitectura, Regla 4. El tope de siete días (T-05-54) sí está vivo; lo que no está es su contrapartida de §12.4, *«lo que queda más atrás no se esconde»*. Anotado en `deferred-items.md` con el detalle completo. Commit `1983655`.

## Verificación

| Gate | Resultado |
|---|---|
| `npm run test:unit` | 48 archivos · **889 tests** (base 876; +13) |
| `npm run test:integration` | 18 archivos · 163 tests |
| `npm run build` | verde, 14 rutas |
| `npm run ci:arch` | 3 scripts OK |
| `npx tsc --noEmit` | limpio |
| `npm run lint` | 0 errores, 2 warnings preexistentes |
| `npm run db:types:check` | sin drift |
| Señuelo del segundo filtro | corrido en rojo (6/28) y en verde (28/28) |
| Aterrizaje del clic | comprobado contra `next build` con Playwright |

Desglose de los tests nuevos: `lib/data/operacion` 21 → 28, `lib/domain/alertas` 41 → 47. Sin tests borrados.

## Commits

| Hash | Qué |
|---|---|
| `64f39d1` | Los dos filtros y el grupo `Atrasados` (tarea 1) |
| `2dd9cf8` | Los dos títulos de `hora_limite_vencida` (tarea 2) |
| `8e744b2` | El bloque, la tercera señal y el cableado (tarea 3) |
| `463af34` | Los dos tests de integración de la ventana vieja |
| `1983655` | La deuda de las dos líneas inalcanzables |

## Self-Check: PASSED

Archivos modificados, todos presentes en disco: `lib/data/operacion.ts`, `lib/data/operacion.test.ts`, `lib/data/operacion.integration.test.ts`, `lib/domain/alertas.ts`, `lib/domain/alertas.test.ts`, `app/(admin)/operacion/page.tsx`, `app/(admin)/operacion/_components/BloqueDia.tsx`, `app/(admin)/operacion/_components/FilaAseo.tsx`, `app/(admin)/operacion/_components/MenuAseo.tsx`, `deferred-items.md`.

Los cinco commits existen en `git log`: `64f39d1`, `2dd9cf8`, `8e744b2`, `463af34`, `1983655`.

Sin stubs: no hay valores vacíos cableados a la UI ni texto de relleno. El único dato que no llega a pantalla es `antesDeLaVentana`, documentado arriba como deuda con su razón y su coste.

## Threat Flags

Ninguna superficie de seguridad nueva. El cambio amplía una ventana de fechas dentro de una consulta que ya pasa por RLS, sin tocar policies, grants ni columnas, y el test de integración con el JWT de una aseadora confirma que el recorte por `aseador_id` sigue exacto sobre el conjunto ampliado.
