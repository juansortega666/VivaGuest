---
phase: 08-paneles-laterales-en-el-admin
plan: 07
subsystem: ui
tags: [panel, sheet, searchparams, rsc, suspense, realtime, storage, signed-url, accesibilidad]

requires:
  - phase: 08-paneles-laterales-en-el-admin
    provides: "08-05: leerPanelDeAseo() y MINIATURAS_VISIBLES, la composición entera de la lectura. 08-04: PanelLectura, GrupoDePanel, FilaDeDato y EsqueletoDePanel, más los dos archivos de carga ya borrados. 08-06: el patrón del anfitrión que compone y baja sus dos direcciones. 08-02 §6.2: las instrucciones 3, 4, 5, 6 y 7"
  - phase: 07-finanzas
    provides: "DialogoRecibo, con su manejo de error, su copy de ausencia y la razón de no llevar ampliación ni descarga. Y la línea de D7-2 que 07-UI-SPEC §6.4 obliga a conservar"
  - phase: 04-operaci-n-diaria
    provides: "FilaAseo.tsx con sus tres reglas de comportamiento, el `::after` que estira el área y el `relative z-10` de la celda del menú. EstadoAseo y estadoDeAseo(). ContextoDeAcciones, el objeto que baja por los tres archivos"
provides:
  - "PanelAseo: el panel de §10, los cuatro grupos, lo único de la fase que no existía en ninguna forma"
  - "TiraDeEvidencia: las seis casillas de §10.3, con sus tres estados de ausencia"
  - "DialogoFoto: el diálogo de foto, salido del de recibo, sin ampliación ni descarga ni navegación"
  - "/operacion?aseo={uuid}, conservando alertas al abrir y al cerrar"
  - "confirmadoAt en la cabecera de leerPanelDeAseo: la tercera columna que estadoDeAseo() exige"
  - "La medición del coste de una ráfaga de Realtime con el panel abierto, con sus cuatro números"
affects: [08-08, 08-09, 08-10, 08-11, 08-12, 08-13, 08-14]

tech-stack:
  added: []
  patterns:
    - "El anfitrión de ventana recortada valida la existencia contra la función definer y NO contra lo que ya leyó: la misma promesa se usa para decidir si el panel existe y para alimentar su cuerpo, y entra al Promise.all que la pantalla ya tenía, así que cuesta cero latencia"
    - "El disparador de un diálogo vive donde vive su geometría: la miniatura la construye la tira, porque §10.3 es el contrato de la tira, y el diálogo la recibe como prop para que los dos se monten juntos"
    - "El título del panel pasa a nodo, no a cadena, cuando el contrato pide que sea un enlace. El nombre accesible del diálogo se computa del contenido, así que lo que se pase tiene que llevar el nombre como texto de verdad"
    - "Un dato nuevo que la fila de una tabla necesita viaja en el objeto de contexto que ya baja por los tres archivos, no como prop suelta: es para lo que ese objeto se creó"

key-files:
  created:
    - app/(admin)/operacion/_components/PanelAseo.tsx
    - app/(admin)/operacion/_components/TiraDeEvidencia.tsx
    - app/(admin)/operacion/_components/DialogoFoto.tsx
  modified:
    - app/(admin)/operacion/page.tsx
    - app/(admin)/operacion/_components/FilaAseo.tsx
    - app/(admin)/operacion/_components/MenuAseo.tsx
    - app/(admin)/_components/PanelLectura.tsx
    - lib/data/panel-aseo.ts
    - lib/data/panel-aseo.integration.test.ts
    - .planning/phases/08-paneles-laterales-en-el-admin/deferred-items.md
  deleted: []

key-decisions:
  - "La cabecera del panel necesita confirmado_at y la definer no lo devuelve. Se lee de cleanings por RLS, dentro del Promise.all que ya existía, en vez de por migración: no está detrás del grant por columna de la migración 24, así que la policy de admin ya lo entrega y meterlo en la definer ampliaría el radio de una función que corre saltando la seguridad de fila"
  - "La misma promesa de leerPanelDeAseo sirve para validar la existencia y para alimentar el cuerpo. Consecuencia declarada: el esqueleto de la barrera de suspensión no llega a pintarse, porque la promesa ya está resuelta. La alternativa, llamar a la definer dos veces, compraría un esqueleto que 08-02 §6.1 midió que NO APARECE NUNCA a cambio de duplicar una consulta de verdad"
  - "titulo de PanelLectura pasa de cadena a nodo. §10.2 pide que el título del panel de aseo SEA un enlace al apartamento, y con una cadena es imposible. El nombre accesible del diálogo no se rompe: se computa del contenido"
  - "La miniatura de 64px se construye en TiraDeEvidencia y viaja a DialogoFoto como prop, al revés que DialogoRecibo. Su geometría entera es el contrato de §10.3, o sea el contrato de la tira, y construirla en el diálogo la partiría en dos archivos"
  - "La línea de que los daños no se descuentan va ANTES del separador, no después: es el pie del grupo de reportes, y al otro lado del filo se leería como el encabezado del grupo de dinero"
  - "La fila con el panel abierto se marca solo con aria-current, sin el fondo. El fondo es una clase sobre el TableRow y §5.3 prohíbe por nombre tocar la clase de la fila. La mitad visual queda anotada en deferred-items.md"

patterns-established:
  - "Un anfitrión cuya lectura es una ventana recortada no puede copiar la validación contra lo ya leído, y el comentario de su página tiene que decir la ventana EN NÚMEROS o el siguiente que lea los dos archivos va a pensar que uno de los dos está mal"
  - "Un umbral de desborde medido en un contrato de diseño se vuelve a contar en el componente cuando el componente pinta algo que la tabla del contrato no contaba"

requirements-completed: []

coverage:
  - id: D1
    description: "El panel pinta los cuatro grupos de §10.1 en su orden, con el copy literal de §15.2"
    verification:
      - kind: other
        ref: "grep de los cuatro encabezados en mayúscula sobre PanelAseo.tsx → EJECUCIÓN 3 · EVIDENCIA 3 · REPORTES 7 · DINERO 4"
        status: pass
      - kind: e2e
        ref: "Andamio desechable: el panel abre sobre /operacion, el título del diálogo es el nombre del apartamento y la tira pinta 6 casillas con 7 fotos sembradas"
        status: pass
    human_judgment: true
    rationale: "Que la fila se lea derecha y que los cuatro grupos tengan la jerarquía que §6.4 dibuja son juicios de pantalla. Los cubren 08-12 (barrido visual) y 08-13 (accesibilidad)"
  - id: D2
    description: "El componente no cuenta el checklist ni deriva el estado: los dos llegan de donde ya viven"
    verification:
      - kind: other
        ref: "grep -cE '\\.filter\\(|done_at' PanelAseo.tsx → 0 · el progreso llega de progresoTotal(armarChecklist(...)) y el estado de estadoDeAseo()"
        status: pass
    human_judgment: false
  - id: D3
    description: "El panel no tiene rama de permiso denegado (§10.4 regla 1, T-08-29)"
    verification:
      - kind: other
        ref: "grep -c '42501\\|PGRST301\\|SinPermiso' PanelAseo.tsx → 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "La tira pinta como máximo seis casillas, la de conteo no es un control, y una foto sin firma ocupa su sitio"
    verification:
      - kind: e2e
        ref: "Andamio: con 7 fotos sembradas (ninguna con objeto en Storage, o sea las 7 con firma fallida) la tira pinta exactamente 6 elementos de lista: 5 casillas de ausencia más la de conteo"
        status: pass
      - kind: other
        ref: "grep -c '<button' TiraDeEvidencia.tsx → 1, y es la miniatura. La casilla de conteo es un <li> con aria-label"
        status: pass
    human_judgment: false
  - id: D5
    description: "El diálogo de foto no tiene ampliación, descarga ni navegación, y su texto alternativo nunca es vacío (§13.4)"
    verification:
      - kind: other
        ref: "grep -ciE 'zoom|download|scale-1|onWheel' DialogoFoto.tsx → 0 · grep -c 'alt=\"\"' DialogoFoto.tsx → 0"
        status: pass
    human_judgment: false
  - id: D6
    description: "La existencia se valida contra la definer y no contra la ventana de hoy-7 a hoy+6 (T-08-27)"
    verification:
      - kind: other
        ref: "grep -c 'leerPanelDeAseo' page.tsx → 3, y el comentario de la página escribe la ventana en números"
        status: pass
    human_judgment: false
  - id: D7
    description: "Abrir el panel conserva `alertas`, y cerrarlo lo devuelve intacto (T-08-30, INSTRUCCIÓN 5)"
    verification:
      - kind: e2e
        ref: "Andamio, medido en la URL: /operacion?alertas=atendidas → al abrir queda ?alertas=atendidas&aseo={id} → al cerrar con Escape vuelve a ?alertas=atendidas. Cuatro corridas, las cuatro iguales"
        status: pass
    human_judgment: false
  - id: D8
    description: "El ancla de la fila cambia de destino y no de técnica, y la fila no se convierte en contenedor con papel de botón (T-08-31)"
    verification:
      - kind: other
        ref: "El diff de FilaAseo.tsx no toca el className del TableRow, ni el relative z-10 de la celda del menú, ni el after:absolute after:inset-0, ni el has-[a:focus-visible]. grep de aria-label sube de 5 a 6"
        status: pass
      - kind: e2e
        ref: "Andamio: el ancla renderizada conserva `after:absolute after:inset-0` y lleva href=/operacion?alertas=atendidas&aseo={id}"
        status: pass
    human_judgment: false
  - id: D9
    description: "Una ráfaga de Realtime con el panel abierto no lo cierra, no lo hace parpadear y no repite las lecturas quince veces (T-08-28)"
    verification:
      - kind: e2e
        ref: "Andamio, cuatro corridas: 15 eventos en UNA transacción producen 1 o 2 refrescos RSC, nunca 15. El panel sigue abierto, con el mismo título y la misma URL"
        status: pass
    human_judgment: false

duration: 95min
completed: 2026-09-17
status: complete
---

# Fase 8 Plan 07: El panel de aseo

**Lo único de la fase que no existía en ninguna forma: tocar la fila del 302 ahora dice en qué va, con qué evidencia y qué se reportó, sin salir del día y sin perder el filtro de alertas.**

## Performance

- **Duración:** ~95 min
- **Tareas:** 3, las tres del plan
- **Archivos:** 3 creados, 7 modificados, 0 borrados
- **Consultas de la pantalla:** de 8 a 9, y la novena solo cuando el panel está abierto

## Lo que quedó hecho

- **El panel existe.** Cuatro grupos (`EJECUCIÓN`, `EVIDENCIA`, `REPORTES`, `DINERO`) con el copy literal de §15.2, la tira de hasta seis miniaturas, el diálogo de foto, y el nombre del apartamento como el único enlace que sale de la sección.
- **Tocar la fila ya no navega al formulario de edición del apartamento.** La DEFINICIÓN decía que tocar la fila "no hacía nada" y era falso: el ancla de la celda del apartamento estiraba su área sobre toda la fila desde la Fase 4. **Cambió de destino, no de técnica**: el `::after`, el `relative z-10` de la celda del menú y el selector de foco de fila están intactos en el diff.
- **El filtro de alertas sobrevive en los dos sentidos, medido en la URL.** Con `?alertas=atendidas` puesto: abrir deja `?alertas=atendidas&aseo={id}`, y cerrar devuelve `?alertas=atendidas`. Cuatro corridas, las cuatro iguales.
- **La existencia se valida contra la definer, y esa es la diferencia con los otros tres anfitriones.** `/operacion` lee una ventana de hoy−7 a hoy+6; un aseo de hace tres semanas es válido, existe y no está en esa lista. Validarlo contra lo ya leído habría hecho que un enlace perfectamente válido pegado en un chat abriera la pantalla sin panel y sin decir por qué.
- **Realtime está medido y no arreglado**, que es lo que el plan pedía. Los cuatro números están abajo.

## Commits

1. **Task 1: la tira de evidencia y el diálogo de foto** — `ae0c4d9` (feat)
2. **Desviación Rule 2: `confirmado_at` en la cabecera de la lectura** — `11aa33e` (fix)
3. **Task 2: el panel de aseo, los cuatro grupos** — `61d204a` (feat)
4. **Task 3: la página, la fila y el filtro que sobrevive** — `cdb1fd3` (feat)

## Archivos

| Archivo | Qué hace |
|---|---|
| `app/(admin)/operacion/_components/PanelAseo.tsx` (488 líneas, nuevo) | Los cuatro grupos, con el umbral de desborde escrito en dos números |
| `app/(admin)/operacion/_components/TiraDeEvidencia.tsx` (nuevo) | Las seis casillas, los tres estados de ausencia y los dos vacíos |
| `app/(admin)/operacion/_components/DialogoFoto.tsx` (nuevo) | El diálogo, salido del de recibo, con su manejador de error |
| `app/(admin)/operacion/page.tsx` | Lee el parámetro, valida contra la definer, compone las dos direcciones y renderiza el panel con clave |
| `app/(admin)/operacion/_components/FilaAseo.tsx` | El ancla cambia de destino, gana `scroll={false}` y su etiqueta accesible. La fila gana `aria-current` |
| `app/(admin)/operacion/_components/MenuAseo.tsx` | Un `href` y dos campos en el objeto de contexto. Nada más |
| `app/(admin)/_components/PanelLectura.tsx` | `titulo` pasa de cadena a nodo, porque §10.2 lo pide como enlace |
| `lib/data/panel-aseo.ts` | `confirmadoAt` en la cabecera, leído por RLS dentro del `Promise.all` |
| `lib/data/panel-aseo.integration.test.ts` | Tres aserciones sobre el campo nuevo, con su contraprueba |

## LA MEDICIÓN DE LA RÁFAGA DE REALTIME (parte (d) del plan)

Andamio desechable con Playwright, **borrado antes de commitear**. Puerto fijado en 3210. Escenario: un aseo abierto con siete fotos sembradas y un daño, más quince aseos actualizados en **una sola sentencia**, o sea una sola transacción, o sea quince eventos de `postgres_changes`.

### Los cuatro números que el plan pide

| Pregunta | Respuesta medida |
|---|---|
| **¿Cuántas veces se repitieron las lecturas?** | **1 o 2 veces**, nunca 15. Cuatro corridas: 2, 2, 1, 2 refrescos RSC. El debounce de 400 ms de `SincronizacionEnVivo` colapsa la ráfaga |
| **¿Cuántas firmas se emitieron?** | **6 por refresco**, o sea **6 a 12 en toda la ráfaga**. Medido contando las casillas de la tira en el DOM: 6 en las cuatro corridas, con siete fotos sembradas (cinco miniaturas más la casilla de conteo). **No 90** |
| **¿El panel se cerró, parpadeó o se quedó quieto?** | **Quieto.** Sigue abierto en las cuatro, con el mismo título dentro y la misma URL. Confirma el VEREDICTO 5 de `08-02` con un panel de verdad y no con el andamio |
| **¿Latencia percibida de la apertura?** | **203, 293, 262 y 229 ms** desde el clic hasta que el diálogo es visible, con las nueve consultas de la pantalla. Una sola petición RSC por apertura |

### Lo que estos números significan, y lo que NO autorizan

**El riesgo T-08-21 estaba sobrestimado por un orden de magnitud, y el motivo ya estaba escrito en el repo.** La cabecera de `lib/data/panel-aseo.ts` calculaba "hasta 90 firmas de 300 segundos" en una ráfaga de quince, y ese cálculo asume quince refrescos. **El debounce de 400 ms que la Fase 4 puso por T-04-18 ya resolvía esto**, y su comentario decía literalmente que quince eventos se acumulan y se refresca una sola vez. Esta medición lo confirma con el panel encima.

**El pico real de una ráfaga son 12 firmas, no 90.** Y ni siquiera eso hace falta arreglarlo: la palanca nombrada (**acotar el disparo del refresco**, no cambiar el contrato de las seis firmas) sigue disponible y sigue sin tirarse. La disposición `accept` de T-08-28 se sostiene con datos en vez de con una estimación.

**Lo que esta medición NO autoriza:** no autoriza reducir las seis firmas, no autoriza plegar gastos y daños en una segunda definer (la palanca Q2 sigue guardada), y no autoriza tocar el debounce. Lo que hace es dejar el número escrito para que el plan 08-11 lo mida en su E2E y el 08-14 lo cruce.

## Las instrucciones del VEREDICTO de `08-02` §6.2, fila por fila

| Instrucción | Qué exige | Cómo se cumplió |
|---|---|---|
| **2** · fuera los dos archivos de carga | Ya ejecutada por 08-04 | **No se reintrodujo.** `app/(admin)/operacion/loading.tsx` sigue borrado y la cabecera de `page.tsx` sigue explicando por qué, con su A/B |
| **3** · ninguna clave derivada de los parámetros | La `key` va sobre el panel | `grep -c 'key={'` en `page.tsx` sube de **2 a 3**, y la tercera es `key={aseoAbierto.cabecera.aseoId}` sobre `PanelAseo`. Las otras dos son las de `grupo.fecha` que ya estaban. El `<Suspense>` no lleva ninguna |
| **4** · el esqueleto va dentro del panel | Con la geometría real | `<Suspense fallback={<EsqueletoDePanel grupos={…} />}>` dentro de `PanelLectura`. Formas `[3, 1, 2, 3]` en la gestionada y `[3, 1, 2]` en la externa. **Con la salvedad declarada de abajo: hoy no llega a pintarse** |
| **5** · los enlaces de apertura conservan los parámetros | Compuesto desde los parámetros vivos, nunca literal | La página serializa los vivos quitando `aseo` y los baja por el objeto de contexto hasta `FilaAseo`, que compone `?{vivos}&aseo={id}`. **Medido:** con `?alertas=atendidas` puesto, el `href` renderizado es `/operacion?alertas=atendidas&aseo={id}` |
| **6** · Realtime no obliga a nada | Ninguna tarea de mitigación | **Ninguna se escribió.** Lo que se produjo es el número, no el arreglo |
| **7** · el instrumento de espera | `esperarUrlDeCliente()` y `esperarControlHidratado()` | Los dos, en el andamio. El clic se disparó sobre el ancla ya hidratada. **Ningún caso E2E se queda en el árbol**: los escribe 08-11 |

## Desviaciones del plan

### Auto-arregladas

**1. [Rule 2 · funcionalidad crítica ausente] La cabecera del panel no traía `confirmado_at`, y sin él el panel miente sobre el estado**

- **Encontrado durante:** Task 2, al conectar el componente de estado.
- **El problema:** la entrada de `estadoDeAseo()` son **tres** columnas (`is_managed`, `state`, `confirmado_at`), no dos. `Sin confirmar` y `Pendiente` comparten el mismo valor del enum y lo único que las separa es esa marca. `detalle_de_aseo` no la devuelve y `CabeceraDelPanelDeAseo` no la tenía, así que el panel de un aseo sin confirmar habría dicho `Pendiente` **mientras la fila que tiene justo detrás, en la misma pantalla, dice `Sin confirmar`**. Dos superficies del mismo render contradiciéndose sobre el mismo aseo.
- **Por qué no se dedujo de otra cosa:** el total del checklist en cero correlaciona (las tareas las materializa `confirm_cleaning`), pero correlacionar no es ser. Sería una segunda verdad sobre el mismo dato, contra lo que advierten por escrito las cabeceras de `EstadoAseo.tsx` y `FilaAseo.tsx`. Y el compilador obliga a decidir: no había forma de escribir el panel sin resolverlo.
- **El arreglo:** `confirmado_at` se lee de `cleanings` **por RLS**, con proyección de una columna, dentro del `Promise.all` que ya existía. **Cero latencia extra.** No entra en la definer porque no está detrás del grant por columna de la migración 24 (`leerOperacion()` la lee por RLS desde la Fase 4), así que meterla ahí ampliaría el radio de una función que corre saltando la seguridad de fila para traer un dato que la policy de admin ya entrega, y además costaría una migración.
- **Archivos:** `lib/data/panel-aseo.ts`, `lib/data/panel-aseo.integration.test.ts`. **Los dos fuera de los `files_modified` del plan.**
- **Con señuelo corrido:** fijar `confirmadoAt` en nulo pone en rojo **exactamente un caso** (`expected null not to be null`) y deja los otros ocho en verde.
- **Commit:** `11aa33e`

**2. [Rule 3 · bloqueante] `titulo` de `PanelLectura` no podía ser un enlace**

- **Encontrado durante:** Task 2.
- **El problema:** §10.2 dice que el título del panel de aseo **es un `<Link>`** al apartamento, con su icono, y que es el único enlace que sale de la sección a propósito. `PanelLectura` lo recibía como `string`, así que era imposible.
- **El arreglo:** `titulo: ReactNode`, con el comentario que fija lo que sigue siendo obligatorio: el nombre accesible del diálogo se computa del **contenido** del título, así que lo que se pase tiene que llevar el nombre de lo seleccionado como texto de verdad. Una cadena sigue siendo un nodo, así que `PanelApartamento` no cambia.
- **La alternativa descartada:** poner el enlace al pie del cuerpo. Se llegó a escribir y se revirtió: inventa una colocación que el dueño no aprobó y que no está en el dibujo de §10.1.
- **Archivo:** `app/(admin)/_components/PanelLectura.tsx`, **fuera de los `files_modified`**.
- **Commit:** `61d204a`

### Decisiones de forma que se apartan de la letra del plan

**3. El esqueleto del panel está puesto y hoy no llega a pintarse, y es una decisión escrita**

El plan pide dos cosas que, en este anfitrión, tiran en direcciones opuestas: **validar la existencia llamando a la lectura del panel** (obliga a esperarla) y **meter el panel en una barrera de suspensión con esqueleto** (obliga a no esperarla).

Lo que se hizo: **una sola llamada**, cuya promesa se espera dentro del `Promise.all` de la pantalla para decidir si el panel existe, y **esa misma promesa** baja al panel. Consecuencia honesta: cuando el panel se renderiza, la promesa ya está resuelta, así que el `fallback` no se pinta.

La alternativa era llamar a la definer **dos veces**: una suelta para validar y otra dentro de la lectura completa. Compraría un esqueleto que `08-02` §6.1 midió que **NO APARECE NUNCA** (cero apariciones en doce corridas, porque la respuesta del servidor vuelve en ~70 ms) a cambio de duplicar una consulta de verdad. No vale la pena, y está escrito en el comentario del render para que nadie lo "arregle" sin leer esto.

La barrera se queda porque es lo que mantiene la forma común de los cuatro paneles, y porque el día que la lectura se separe en dos (cabecera y resto), el esqueleto empieza a servir sin tocar nada más.

**4. La fila con el panel abierto se marca por un canal y no por dos**

§13.1 pide `aria-current` **además del** fondo de §4.3, con el argumento de que "color solo no dice cuál está abierta". Se puso `aria-current`. El fondo **no**, porque es una clase sobre el `TableRow` y §5.3 prohíbe por nombre tocar la clase de la fila: *"si el diff toca el `className` de `TableRow` (…) se salió del contrato"*. La mitad que falta queda anotada en `deferred-items.md` con su línea exacta, para 08-12 o 08-13, que sí pueden tocarla.

**5. El umbral de desborde se volvió a contar, y son dos números, no uno**

§6.4 cuenta el presupuesto por grupos y concluye que el cuerpo desborda **a partir del séptimo reporte**. Su tabla no cuenta la línea de *"Los daños no se descuentan del pago."*, que no es un grupo. Esa línea cuesta 17 de texto más 16 de separación, o sea **33px**, y solo aparece cuando hay al menos un daño:

```
sin línea de daños:  n = 7 desborda (616 sobre 590)
con línea de daños:  n = 5 desborda, por UN píxel (591 sobre 590)
```

Los dos van escritos en la cabecera del componente. No se recortó nada: la línea es obligación del contrato de la Fase 7 y el desplazamiento del cuerpo está ahí precisamente para el caso largo. Pero el desplazamiento se va a ver **antes** de lo que la tabla de §6.4 sugiere, y eso tenía que quedar dicho.

## Hallazgos

### El nombre accesible del ancla se repite entre dos aseos del mismo apartamento

**Medido con el andamio.** Con un aseo en `Atrasados` y otro en `Hoy` sobre la misma unidad, el localizador por nombre accesible `Ver el aseo de {nombre}` resuelve a **2 elementos** y Playwright falla por ambigüedad. En producción el síntoma es peor que en la prueba: un usuario de lector de pantalla oye dos enlaces con el mismo nombre y ninguna forma de distinguirlos.

**No se arregló acá a propósito.** La cadena es literal del contrato (§5.3 Pitfall 5 y este mismo plan la escriben así) y **08-11 va a escribir sus aserciones contra ella**; cambiarla por mi cuenta rompería las dos cosas a la vez. El sustituto ya existe en el mismo archivo: `MenuAseo` nombra su botón `Acciones del aseo de {apartamento} del {fecha}`, o sea que el defecto ya estaba resuelto una vez, al lado. Queda en `deferred-items.md` para 08-13, coordinado con 08-11.

### El `role="button"` que el grep encuentra en `FilaAseo.tsx` es el comentario que lo prohíbe

El criterio del plan pide `grep -c 'role="button"' → 0`. Devuelve **1**, y ese 1 es **preexistente desde la Fase 4**: la cabecera del archivo dice *"El foco de fila se pinta con `has-[a:focus-visible]:bg-canvas`, no con un `role="button"` falso"*. No hay ningún `role="button"` en el JSX, ni antes ni después de este plan. Se deja como está: borrar el comentario para que el grep dé cero sería quitar justo la frase que explica por qué.

## Las aserciones de grep, una por una

| Criterio | Esperado | Real |
|---|---|---|
| `grep -c "<button" TiraDeEvidencia.tsx` | solo miniaturas | **1**, la miniatura. La casilla de conteo es un `<li>` con `aria-label` |
| `grep -ciE "zoom\|download\|scale-1\|onWheel" DialogoFoto.tsx` | 0 | **0** |
| `grep -c 'alt=""' DialogoFoto.tsx` | 0 | **0** |
| `grep -c "EJECUCIÓN" PanelAseo.tsx` | ≥ 1 | **3** |
| `grep -c "EVIDENCIA" PanelAseo.tsx` | ≥ 1 | **3** |
| `grep -c "REPORTES" PanelAseo.tsx` | ≥ 1 | **7** |
| `grep -c "DINERO" PanelAseo.tsx` | ≥ 1 | **4** |
| `grep -cE "\.filter\(\|done_at" PanelAseo.tsx` | 0 | **0** |
| `grep -c "42501\|PGRST301\|SinPermiso" PanelAseo.tsx` | 0 | **0** |
| líneas de `PanelAseo.tsx` | ≥ 150 | **488** |
| `grep -c "PanelLectura" PanelAseo.tsx` | presente | **4** |
| `grep -c "leerPanelDeAseo" page.tsx` | ≥ 1 | **3** |
| `grep -c "key={" page.tsx` | no sube salvo la del panel | **2 → 3**, y la nueva es el id del aseo sobre `PanelAseo` |
| `grep -c "aria-label" FilaAseo.tsx` | sube ≥ 1 | **5 → 6** |
| `grep -c 'role="button"' FilaAseo.tsx` | 0 | **1**, preexistente y es el comentario que lo prohíbe (ver hallazgos) |
| `grep -c "stopPropagation\|preventDefault" MenuAseo.tsx` | no sube | **0 → 0** |
| `grep -c "aseo=" FilaAseo.tsx` | presente | **5** |
| `git diff --name-only` sobre `app/(cleaner)` | vacío | **vacío** |

## Las cuatro suites, antes y después

| Suite | Línea base | Después | Delta |
|---|---|---|---|
| `npm run test:unit` | 1235 | **1235** | 0 |
| `npm run test:integration` | 205 | **205** | 0. Las tres aserciones nuevas van dentro de un caso que ya existía |
| `npm run db:test` (pgTAP) | 380 | **380** | 0. Este plan no toca la base |
| `npx playwright test` (completa) | 133 pasando · 1 saltado · 1 rojo declarado | **133 pasando · 1 saltado · 1 rojo**, y el rojo es `apartamentos-lista.spec.ts:376` | 0 |

`npm run build`: **limpio**. `npx tsc --noEmit`: **limpio**. `npm run lint`: **0 errores**, los 2 avisos preexistentes en archivos de test. `npm run ci:arch`: los tres guardarraíles limpios.

### Los dos specs que el plan señala como innegociables

```
npx playwright test e2e/operacion.spec.ts e2e/operacion-alertas.spec.ts
  → 15 passed
```

**En verde enteros**, con el puerto fijado en 3210.

### Un rojo que apareció una vez y no es de este plan

En la **primera** corrida de la suite completa, `operacion.spec.ts:373` (*"cancelar un aseo…"*) falló esperando el toast `El aseo quedó cancelado.`. **No se reprodujo**: la segunda corrida completa dio 133 pasando, y el caso aislado pasó **4 de 4** con un solo worker y **15 de 15** dentro de sus dos specs.

Lo que la instantánea de aquel fallo demuestra es que **la cadena entera funcionó**: la fila ya decía `Cancelado` en el DOM. Lo que faltaba era el toast, que se renderiza en el cliente y cuyo temporizador la propia `esperarToast()` documenta como sensible al puntero y al foco de la ventana. Es una flaquera de instrumento bajo carga de workers en paralelo, no una regresión de este diff: nada de lo que este plan toca está en el camino de ese toast.

## Lo que queda listo para lo que viene

**Para `08-11` (el barrido de aserciones):**

- El parámetro es `/operacion?aseo={uuid}` y el nombre accesible del ancla de apertura es `Ver el aseo de {nombre}`. **Ojo con la ambigüedad del hallazgo de arriba**: hoy hay que localizar por `href` y no por nombre cuando el escenario tenga dos aseos del mismo apartamento.
- La medición de Realtime de este plan es con andamio desechable y una sola sesión. La formal, con repeticiones y con el instrumento de la INSTRUCCIÓN 7, la escribe 08-11.
- El rojo declarado de D8-11 sigue siendo `e2e/apartamentos-lista.spec.ts:376`, y **este plan no lo tocó**.

**Para `08-12` y `08-13`:** las dos mitades de `deferred-items.md`, el fondo de la fila abierta y el nombre accesible duplicado.

**Para `08-14`:** los números de la ráfaga están en este documento y son los que T-08-28 pedía para sostener su disposición `accept`.

## Deuda declarada

- **El esqueleto del panel no llega a pintarse hoy.** Con su razón medida y su condición de reactivación escrita arriba.
- **Desde el admin no hay forma de ver más de seis fotos de un aseo.** Se ven cinco y un conteo, y la casilla de conteo no abre nada. Es §17.5 y no cambia.
- **Una URL firmada de más por apertura** cuando el aseo tiene más de seis fotos. Heredada de 08-05, declarada en el comentario de `MINIATURAS_VISIBLES`, y este plan la confirma: con siete fotos la tira pinta seis casillas y la sexta firma no se usa.
- **El panel no se refresca solo.** §17.8: `EJECUCIÓN` es un dato de cuando se abrió. La medición de arriba matiza esto: con Realtime encima, el panel **sí** se rehace cuando la pantalla se refresca, porque la página entera se vuelve a renderizar. Lo que no hay es un refresco propio del panel.

---
*Fase: 08-paneles-laterales-en-el-admin*
*Terminado: 2026-09-17*

## Self-Check: PASSED

- `app/(admin)/operacion/_components/PanelAseo.tsx` — FOUND (488 líneas)
- `app/(admin)/operacion/_components/TiraDeEvidencia.tsx` — FOUND (181 líneas)
- `app/(admin)/operacion/_components/DialogoFoto.tsx` — FOUND (202 líneas)
- `ae0c4d9` — FOUND
- `11aa33e` — FOUND
- `61d204a` — FOUND
- `cdb1fd3` — FOUND
