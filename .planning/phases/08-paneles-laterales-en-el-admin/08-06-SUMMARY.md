---
phase: 08-paneles-laterales-en-el-admin
plan: 06
subsystem: ui
tags: [panel, sheet, searchparams, rsc, suspense, app-router, postgrest, accesibilidad]

requires:
  - phase: 02-acceso-y-administraci-n-del-cat-logo
    provides: "estadoDeApartamento() y EstadoApartamento, la derivación única del estado y su presentación; y la regla de que un aseador desactivado se marca, no se borra"
  - phase: 04-operaci-n-diaria
    provides: "estadoDeAseo() y EstadoAseo con su clave de gestión externa, y FilaAseo.tsx, que fijó que un responsable ausente en una gestionada es `Sin asignar` y no un glifo"
  - phase: 07-finanzas
    provides: "identificadorValido() de lib/data/finanzas-detalle.ts, y el patrón entero de /finanzas/pagos: leer el parámetro, resolverlo contra lo ya leído y renderizar el panel con clave por identificador"
  - phase: 08-paneles-laterales-en-el-admin
    provides: "08-04: PanelLectura, GrupoDePanel, FilaDeDato y EsqueletoDePanel, más los dos archivos de carga de segmento ya borrados. Y 08-02-MEDICION.md §6.2, cuyo VEREDICTO decide la rama de la Task 3"
provides:
  - "PanelApartamento: la ficha de lectura que D8-3 mandó crear y que no existía, con sus dos formas"
  - "lib/data/panel-apartamento.ts: el próximo aseo, y el sitio que el plan 08-10 amplía con los checkouts y el feed"
  - "Las cuatro columnas que faltaban en la lista (dirección, enlace a Maps, hora límite y suplente), más el nombre del suplente, sin una consulta nueva"
  - "fusionarAsignaciones(): el cruce responsable/suplente contra un solo mapa de perfiles, puro y con tests"
  - "/apartamentos?apartamento={uuid}: el primer parámetro de panel de los cuatro de la fase"
  - "La primera medición en el DOM de que el panel mide 480px: la deuda que 08-04 dejó abierta"
affects: [08-07, 08-08, 08-09, 08-10, 08-11, 08-12, 08-13, 08-14]

tech-stack:
  added: []
  patterns:
    - "El anfitrión compone en el servidor las direcciones de abrir y de cerrar, y las baja como props: los parámetros vivos se conservan en los dos sentidos, y el enlace de apertura nunca lleva consulta literal"
    - "La promesa de la lectura del panel viaja sin resolver hasta la barrera de suspensión de dentro del panel: la cabecera se pinta con su nombre real desde el primer frame y solo el cuerpo espera"
    - "El cruce de asignaciones contra un único mapa de perfiles, extraído a función pura para poder probar sin base la parte que no depende de grants"
    - "Un grupo del panel que no es un par rótulo-dato usa el término y la definición igual, con el término oculto: la lista de definición se respeta sin forzar la fila de dos extremos donde no aplica"

key-files:
  created:
    - lib/data/panel-apartamento.ts
    - app/(admin)/apartamentos/_components/PanelApartamento.tsx
  modified:
    - lib/data/apartamentos.ts
    - lib/data/apartamentos.test.ts
    - app/(admin)/apartamentos/page.tsx
    - app/(admin)/apartamentos/_components/TablaApartamentos.tsx
  deleted: []

key-decisions:
  - "RAMA A del VEREDICTO 1: el filtro no se toca. Las tres piezas de estado de TablaApartamentos se quedan donde estaban, y mover el filtro a la dirección queda descartado por medición, no por preferencia"
  - "La consulta de perfiles añade is_active. No estaba en el plan, pero §7.2 exige la marca (inactivo) detrás del nombre y sin esa columna la regla es imposible de implementar aguas abajo. Cuesta cero consultas: es la misma lectura"
  - "El grupo PRÓXIMO ASEO no usa FilaDeDato. La fecha es el dato, no el rótulo, y FilaDeDato la pintaría en micro atenuado. Se escriben sus dos pares dentro de la lista de definición del grupo, con el término de la segunda línea oculto"
  - "La línea de gestión externa no es un GrupoDePanel. Una lista de definición no puede contener un párrafo suelto sin dejar de ser válida, y esa línea no es un par rótulo-dato: es una explicación de por qué no hay cifras"
  - "La fila del código de acceso se pinta con un literal de seis puntos, no con el código enmascarado. La diferencia importa: una máscara que no sabe nada del código no puede filtrarlo por la carga de React"
  - "Los cuatro rojos que D8-11 contó para apartamento-crud y apartamento-cuartos NO aparecieron, y es correcto: cuelgan del redirect de §5.4, que vive en archivos fuera de los files_modified de este plan"

patterns-established:
  - "El anfitrión de un panel compone y baja: ruta al cerrar, ruta de la vista alterna, parámetros vivos para el enlace de apertura, e identificador abierto para marcar la fila"
  - "La fila que tiene el panel abierto lo dice por dos canales: el fondo de su propio hover y aria-current"
  - "Un módulo de lectura de panel declara su alcance futuro en la cabecera, para que el plan siguiente lo amplíe en vez de crear un segundo archivo"

requirements-completed: []

coverage:
  - id: D1
    description: "Las cuatro columnas que faltaban y el nombre del suplente, en la misma consulta de las 39 filas"
    verification:
      - kind: unit
        ref: "npx vitest run lib/data/apartamentos.test.ts → 17 en verde, 6 casos nuevos sobre fusionarAsignaciones"
        status: pass
      - kind: other
        ref: "grep -c \"from('profiles')\" lib/data/apartamentos.ts → 2, exactamente el mismo valor que antes del plan (medido con git show HEAD~3)"
        status: pass
    human_judgment: false
  - id: D2
    description: "lib/data/panel-apartamento.ts: el próximo aseo, con proyección enumerada y solo cuando el parámetro está presente"
    verification:
      - kind: other
        ref: "grep -c \"select('\\*')\" → 0 · la promesa se construye tras la comprobación de existencia, así que con la dirección sin parámetro la lectura no se dispara"
        status: pass
      - kind: e2e
        ref: "Andamio desechable, cinco escenarios: con aseador · el más cercano gana · el cancelado no cuenta · informativa con su clave externa · el de ayer no cuenta. Los cinco con la salida esperada"
        status: pass
    human_judgment: false
  - id: D3
    description: "PanelApartamento con sus dos formas, el copy literal de §15.2 y las dos ausencias bien repartidas"
    verification:
      - kind: e2e
        ref: "Medido en el DOM: gestionada → 4 encabezados (UBICACIÓN Y ACCESO · A CARGO · DINERO · PRÓXIMO ASEO); informativa → 2 encabezados más la línea de gestión externa, sin A CARGO, sin DINERO, y con el contacto externo dentro del grupo 1"
        status: pass
      - kind: other
        ref: "grep -c 'Intl\\.' → 0 · grep -c 'scroll={false}' → 1 · npm run ci:arch limpio"
        status: pass
    human_judgment: true
    rationale: "Que la fila se lea derecha, que el gris tenga la forma del texto y que la informativa no parezca una gestionada incompleta son juicios de pantalla. Los cubren 08-12 (barrido visual) y 08-13 (accesibilidad)"
  - id: D4
    description: "La página servidor: forma comprobada, existencia contra lo ya leído, clave sobre el panel y las dos direcciones compuestas en el servidor"
    verification:
      - kind: other
        ref: "grep -c 'key={' app/(admin)/apartamentos/page.tsx → exactamente 1, y está sobre PanelApartamento · grep -c identificadorValido → 2"
        status: pass
      - kind: e2e
        ref: "Identificador huérfano (uuid válido que no existe) → 0 diálogos, URL intacta con su parámetro. Identificador malformado → 0 diálogos, 39 filas, pantalla normal"
        status: pass
    human_judgment: false
  - id: D5
    description: "El criterio 1 completo: abrir no saca de la lista, cerrar devuelve al mismo scroll y al mismo filtro"
    verification:
      - kind: e2e
        ref: "Medido en el DOM con clic disparado desde el documento (sesgo 1 de 08-02 §1.1 evitado): scrollY 977 → 977 → 977 · búsqueda 'a' en los tres momentos · cluster 'Bogotá 1' en los tres · 23 filas antes y después"
        status: pass
    human_judgment: true
    rationale: "Medido una vez con el andamio de este plan, no tres. La medición formal con repeticiones y con el instrumento de la INSTRUCCIÓN 7 la escribe el plan 08-11"
  - id: D6
    description: "El ancho de 480px, que era la deuda declarada de 08-04"
    verification:
      - kind: e2e
        ref: "getBoundingClientRect().width del diálogo = 480, medido en tres aperturas distintas (gestionada, gestionada con dinero, informativa)"
        status: pass
    human_judgment: false

duration: 70min
completed: 2026-09-17
status: complete
---

# Fase 8 Plan 06: La ficha de apartamento

**El primer panel de la fase, y el que hace verdadero el criterio 1 sobre la pantalla que más tenía que perder: abrir una ficha ya no saca al admin de la fila 28, ni le borra el cluster que había elegido.**

## Performance

- **Duración:** ~70 min
- **Tareas:** 3, las tres del plan
- **Archivos:** 2 creados, 4 modificados, 0 borrados
- **Consultas de la pantalla:** de 4 a 5, y la quinta solo cuando el panel está abierto

## Lo que quedó hecho

- **La ficha de lectura existe.** No existía: `/apartamentos/[id]` es el formulario de edición, 724 líneas más cuatro editores, y D8-3 lo destapó midiendo. Ahora hay una ficha de nueve datos que cabe en 480px **sin scroll vertical medido**: el cuerpo ocupa 439px con el panel vacío y 468px con próximo aseo, contra un contenedor de ese mismo alto. El `overflow-y-auto` está ahí como válvula y no se dispara.
- **Ocho de los nueve datos no costaron ni una consulta.** Las cuatro columnas que faltaban viajan en la misma lectura de las 39 filas, y el nombre del suplente sale del mismo mapa de perfiles que ya resolvía al responsable. La única lectura nueva es el próximo aseo, y solo se dispara cuando la dirección trae el parámetro.
- **El criterio 1 se cumple entero, medido en el DOM.** Con el buscador en `a`, el cluster en `Bogotá 1` y la página al fondo: `scrollY` 977 antes de abrir, 977 con el panel abierto, 977 después de cerrar. Los tres controles del filtro intactos en los tres momentos, y las 23 filas filtradas sin recomponerse. La mitad "scroll" ya la había arreglado `08-04` borrando el archivo de carga de segmento; este plan confirma que el panel no la vuelve a romper.
- **El panel mide 480 y no 384.** Es la deuda que `08-04` dejó por escrito: el guardarraíl de CI atrapa la clase con nombre de talla, pero no que la cadena de variantes desplace a la de la primitiva. Medido con `getBoundingClientRect()` en tres aperturas distintas: **480 en las tres**.
- **Una unidad de gestión externa se lee como lo que es.** Dos encabezados en vez de cuatro, el contacto externo subido al grupo 1, la línea `Las unidades de gestión externa no llevan tarifas.` donde iba el dinero, y `no aplica` —no `sin definir`— donde la base prohíbe que haya aseador.

## Commits

1. **Task 1: las cuatro columnas y el próximo aseo** — `8364c3e` (feat)
2. **Task 2: la ficha, con su variante informativa** — `169ea41` (feat)
3. **Task 3: la página abre el panel y la celda cambia de destino** — `1865933` (feat)

## Archivos

| Archivo | Qué hace |
|---|---|
| `lib/data/apartamentos.ts` | Cuatro columnas más en la enumeración de la lista, `is_active` en la consulta de perfiles, y `fusionarAsignaciones()` extraída como función pura |
| `lib/data/apartamentos.test.ts` | Seis casos nuevos sobre el cruce de asignaciones |
| `lib/data/panel-apartamento.ts` | El próximo aseo. Su cabecera declara ya el alcance que `08-10` va a ampliar |
| `app/(admin)/apartamentos/_components/PanelApartamento.tsx` | La ficha, con sus dos formas |
| `app/(admin)/apartamentos/page.tsx` | Lee el parámetro, lo resuelve contra lo ya leído, compone las dos direcciones y renderiza el panel con clave |
| `app/(admin)/apartamentos/_components/TablaApartamentos.tsx` | La celda de nombre cambia de destino y nace con `scroll={false}`; la fila abierta gana su marca |

## La rama que se ejecutó, y el veredicto que la decidió

**RAMA A: el filtro sobrevive y no se toca.**

Lo decide la **INSTRUCCIÓN 1** del VEREDICTO de `08-02-MEDICION.md` §6.2, literal:

> *"`TablaApartamentos` conserva sus tres `useState` (`busqueda`, `cluster`, `soloPendientes`) tal como están hoy. **No se mueven a la dirección.** […] Queda **descartada** la salida 1 que el plan tenía escrita."*

Y la evidencia que la sostiene es el VEREDICTO 1 (`SOBREVIVE`, 3 de 3 corridas, al abrir y al cerrar), con su mecanismo: un fallback de Suspense no desmonta el árbol de React, lo oculta, así que el estado de cliente aguanta. Lo que se perdía era el scroll, y su causa —el archivo de carga de segmento— ya la había quitado `08-04`.

**Las ramas B y C no se ejecutaron y se borran del plan.** La B movía el filtro a la dirección; la C envolvía la lectura en una barrera con clave independiente para atajar el esqueleto del segmento, que el VEREDICTO 3 midió que **no aparece nunca** (cero apariciones en doce corridas).

La medición de este plan lo vuelve a confirmar ahora con un panel de verdad y no con el andamio: búsqueda `a` y cluster `Bogotá 1` intactos antes, durante y después.

## Las instrucciones del VEREDICTO, fila por fila

| Instrucción | Qué exige | Cómo se cumplió |
|---|---|---|
| **1** · el filtro se queda | No mover las tres piezas a la dirección | Rama A. `TablaApartamentos` conserva sus tres `useState` sin tocar. La razón, con su cita, queda escrita en la cabecera de `page.tsx` |
| **2** · fuera los dos archivos de carga | Ya ejecutada por `08-04` | **Prohibido reintroducirlos.** Este plan no los devuelve y la cabecera de `page.tsx` sigue explicando por qué no están |
| **3** · ninguna clave derivada de los parámetros | La `key` va sobre el panel | `grep -c 'key={'` en `page.tsx` devuelve **exactamente 1**, sobre `PanelApartamento`. El `<Suspense>` no lleva ninguna, y está escrito por qué en el comentario que lo envuelve |
| **4** · el esqueleto va dentro del panel | Con la geometría real | `<Suspense fallback={<EsqueletoDePanel grupos={…} />}>` dentro de `PanelLectura`. Formas `[3, 2, 3, 1]` en la gestionada y `[4, 1]` en la informativa |
| **5** · los enlaces de apertura conservan los parámetros | El `href` se compone desde los parámetros vivos, nunca una consulta literal | La página serializa los parámetros vivos quitando `apartamento` y `vista`, y los baja como prop. La celda compone `?{vivos}&apartamento={id}`, y el botón `Calendario` hace lo mismo añadiendo su vista. Hoy la cola viene vacía porque `/apartamentos` no gobierna ningún otro parámetro; el día que gobierne uno, el enlace ya lo respeta sin tocar el archivo |
| **7** · el instrumento de espera | `esperarUrlDeCliente()` y `esperarControlHidratado()` | Los dos, en el andamio de medición de este plan. El clic se disparó desde el DOM para evitar el sesgo 1 de §1.1, que sube la página antes de pulsar. **Ningún caso E2E se queda en el árbol**: los escribe `08-11` |

## Decisiones

**1. La consulta de perfiles añade `is_active`, y no estaba en el plan.** §7.2 dice que un responsable desactivado lleva `(inactivo)` detrás del nombre, que es la regla que el contrato de la Fase 2 fijó para el formulario. Sin esa columna la regla no es implementable aguas abajo: el componente no tendría con qué decidir. La columna viaja en la misma consulta de perfiles, así que cuesta cero viajes, y el mapa que ya se construía pasa a guardar `{ nombre, activo }` en vez de solo el nombre.

**2. El cruce de asignaciones se extrajo a `fusionarAsignaciones()`, función pura y exportada.** Es la misma razón que ya escribió `fusionarTarifas` a su lado: los dobles de cliente de este repo **no prueban nada sobre grants**, porque un doble no tiene privilegios y siempre acepta. Lo que sí se puede fijar sin base es la composición, y ahí está el error posible: que alguien mueva el suplente a un segundo viaje. El primer caso del `describe` nuevo lo delata, porque resuelve las dos asignaciones con la única lista de perfiles que recibe.

Y se extrajo **en vez de copiar la lógica al test**, que era el atajo obvio: un test que reproduce el cruce línea por línea se queda verde aunque la fuente diverja, y entonces no prueba nada.

**3. El grupo `PRÓXIMO ASEO` no usa `FilaDeDato`.** La fila de dos extremos pone el rótulo a la izquierda en micro atenuado y el dato a la derecha. Acá el elemento de la izquierda **es el dato** —`jueves 18 de septiembre`— y el de la derecha es su estado; pasarlo por `FilaDeDato` pintaría la fecha como si fuera una etiqueta. Y §15.2 lo confirma desde otro ángulo: la lista de etiquetas del panel de apartamento tiene nueve entradas y **ninguna es de este grupo**, porque el grupo no tiene rótulos.

Lo que sí se conserva es la estructura: los dos pares van dentro de la lista de definición que abre `GrupoDePanel`, con el término de la segunda línea oculto al ojo y disponible para el lector. Sin eso, el lector anunciaría un nombre suelto flotando debajo de una fecha.

**4. La línea de gestión externa tampoco es un `GrupoDePanel`.** `GrupoDePanel` envuelve siempre en una lista de definición, y una lista de definición con un párrafo suelto dentro deja de ser válida. Esa línea no es un par rótulo-dato: es la explicación de por qué no hay cifras. Va como párrafo hermano con su separador, en el sitio exacto donde iría el grupo `DINERO`.

**Consecuencia sobre el conteo del plan,** que decía "tres grupos en la informativa": en el DOM hay **dos encabezados de sección** y **tres bloques de cuerpo**. La forma es la que §7.2.1 pide; lo que cambia es cómo se cuenta.

**5. El código de acceso se pinta con un literal de seis puntos, no con el código enmascarado.** La diferencia parece cosmética y no lo es: una máscara derivada del código real tendría que haber leído el código, y lo que se lee en el servidor de un componente que se renderiza acaba en el documento con una línea de descuido. Seis puntos escritos a mano no pueden filtrar nada. Y `leerSecretos()` devuelve además la URL del calendario, así que ni siquiera se llama: el plan 08-09 la llamará desde una action, con su guarda, y proyectando a los dos campos que necesita.

**6. La promesa del próximo aseo viaja sin resolver.** La página la construye y la baja como promesa; quien la espera es el cuerpo del panel, dentro de la barrera de suspensión. Así la cabecera pinta el nombre real desde el primer frame —que es por lo que `EsqueletoDePanel` lleva su cabecera en gris apagada por defecto— y el esqueleto solo cubre lo que de verdad está viajando.

## Desviaciones del plan

### 1. [Regla 2 · funcionalidad crítica que faltaba] `is_active` en la consulta de perfiles

- **Encontrado en:** Task 1.
- **El problema:** el plan describe la ampliación como "las cuatro columnas más el nombre del suplente", pero §7.2 pide además la marca `(inactivo)` detrás del nombre de un aseador desactivado, en las dos filas del grupo `A CARGO`. Con la consulta de perfiles tal como estaba (`id, full_name`), esa marca es imposible de pintar.
- **Lo hecho:** la consulta pide `is_active`, el mapa guarda la bandera y el tipo de la lista expone `responsableActivo` y `suplenteActivo`.
- **Coste:** cero consultas. Es la misma lectura, una columna más sobre ~8 filas.
- **Commiteado en:** `8364c3e`.

### 2. [Contrato, con razón escrita] La forma de la informativa se cuenta distinto

- **El plan decía:** *"El panel renderiza cuatro grupos en la forma gestionada y tres en la informativa."*
- **Lo que hay:** cuatro secciones con encabezado en la gestionada, y en la informativa **dos secciones más un párrafo**, o sea tres bloques de cuerpo. La forma visual es exactamente la de §7.2.1; lo que no se sostiene es contar la línea de gestión externa como un grupo, porque un grupo abre una lista de definición y esa línea no es un par rótulo-dato.
- **Por qué no se forzó:** meter el párrafo dentro de la lista de definición la invalida, y envolverlo en un término y una definición inventados sería peor: un lector de pantalla anunciaría un par donde no hay ninguno.

### 3. [Hallazgo declarado] Los cuatro rojos que D8-11 contó **no aparecieron**

- **El plan avisaba:** *"`apartamento-crud.spec.ts` y `apartamento-cuartos.spec.ts` van a quedar rojos en las cuatro aserciones que D8-11 ya contó."*
- **Lo medido:** `PLAYWRIGHT_PORT=3210 npx playwright test e2e/apartamento-crud.spec.ts e2e/apartamento-cuartos.spec.ts` → **18 en verde, 0 rojos**.
- **Por qué, y no es suerte:** esas cuatro aserciones esperan `waitForURL(/\/apartamentos\/[0-9a-f-]{36}$/)` **después de guardar**, y lo que las pondría en rojo es el cambio de §5.4: que al crear un apartamento se aterrice en `/apartamentos?apartamento={id}` en vez de en su formulario. Ese cambio vive en el redirect de `app/(admin)/apartamentos/_actions.ts`, **que no está en los `files_modified` de este plan**. Así que sigue pendiente, y con él los cuatro rojos.
- **Consecuencia, y hay que anotarla:** §5.4 de la UI-SPEC **no tiene dueño asignado** en ningún plan de la fase. Ver "Lo que queda abierto".

## El rojo declarado, con archivo y línea

**`e2e/apartamentos-lista.spec.ts:383`** — *"el nombre es un link real, no una fila con role de botón"*.

```
Expected pattern: /^\/apartamentos\/[0-9a-f-]{36}$/
Received string:  "/apartamentos?apartamento=5eed0050-0000-4000-8000-000000000001"
```

**Es exactamente el cambio de destino que este plan hace**, y la aserción lo atrapa haciendo su trabajo. **No se arregla aquí**: el barrido de aserciones es del plan **08-11**, y tocarla en este plan sería justo lo que la T-08-26 del modelo de amenazas prohíbe por nombre (ajustar una aserción rota sin declararlo).

**Lo que la aserción sigue teniendo que probar cuando 08-11 la reescriba:** que el nombre es un `<a>` con `href` de verdad y no una fila con `role="button"`, que es lo que el teclado necesita. Lo que cambia es la forma del `href`, no el fondo. **Y la segunda mitad del caso (`getByRole('button', { name: 'Nombre' })` con cero resultados) sigue válida tal cual.**

El resto de `apartamentos-lista.spec.ts` sigue en verde: **13 pasando, 1 rojo**.

## Verificación

| Comprobación | Resultado |
|---|---|
| `npx tsc --noEmit` | **limpio** |
| `npm run lint` | **0 errores**, 2 avisos preexistentes en archivos de test |
| `npm run ci:arch` | **limpio**, los tres guardarraíles |
| `npm run build` | **limpio** |
| `npm run test:unit` | **1235 en verde**, 65 archivos. Línea base 1229 más los 6 casos nuevos |
| `npm run test:integration` | **205 en verde**, 23 archivos. Exactamente la línea base |
| `npm run db:test` (pgTAP) | **380 en verde**, 12 archivos. Exactamente la línea base |
| `npx playwright test` completo (puerto 3210) | **133 pasando · 1 saltado · 1 rojo**, y el rojo es el declarado de `apartamentos-lista:383` |
| `e2e/apartamento-crud` + `e2e/apartamento-cuartos` | **18 en verde**, cero rojos |
| `git diff --name-only` contra `app/(cleaner)` | **vacío**. Criterio 6 del ROADMAP intacto |
| Aserciones de grep de las tres tareas | todas en su valor esperado |

**Sobre el conteo de la suite completa:** la línea base escrita en los planes es *133 pasando, 1 saltado, 1 rojo en `push-instalacion:215`*. Esta corrida dio **el mismo total** (135 casos) con el rojo en otro sitio: `push-instalacion` salió verde y el rojo fue el declarado de este plan. Es coherente con lo que `deferred-items.md` ya dice de ese caso: es inestable y ajeno a la fase.

### Lo medido en el DOM con el andamio desechable

El andamio se escribió, se corrió y **se borró**: `git status --short` deja solo los archivos del plan.

**El ancho, que era la deuda de `08-04`:**

| Apertura | `getBoundingClientRect().width` |
|---|---|
| Gestionada incompleta | **480** |
| Gestionada con dinero y suplente | **480** |
| Informativa | **480** |

**El criterio 1, con el filtro puesto y la página al fondo:**

| | antes de abrir | con el panel abierto | tras cerrar |
|---|---|---|---|
| `window.scrollY` | 977 | **977** | **977** |
| Texto del buscador | `a` | `a` | `a` |
| Cluster elegido | `Bogotá 1` | `Bogotá 1` | `Bogotá 1` |
| Filas visibles | 23 | 23 | — |

El clic se disparó **desde el documento** y no con `locator.click()`, porque el runner hace `scrollIntoViewIfNeeded` antes de pulsar y eso dejaría `scrollY` en 0 antes de que el producto hiciera nada. Es el sesgo 1 de `08-02` §1.1, evitado igual que allí.

**El presupuesto vertical, y no desborda en ningún caso:**

| Forma | `scrollHeight` / `clientHeight` del cuerpo |
|---|---|
| Gestionada sin próximo aseo | 439 / 439 |
| Gestionada con próximo aseo | 468 / 468 |
| Informativa sin próximo aseo | 273 / 273 |
| Informativa con próximo aseo | 303 / 303 |

**Las dos formas:**

| | Encabezados en el DOM |
|---|---|
| Gestionada | `UBICACIÓN Y ACCESO` · `A CARGO` · `DINERO` · `PRÓXIMO ASEO` |
| Informativa | `UBICACIÓN Y ACCESO` · `PRÓXIMO ASEO`, más la línea `Las unidades de gestión externa no llevan tarifas.` y el `Contacto externo` dentro del grupo 1 |

**El grupo `PRÓXIMO ASEO`, en sus cinco ramas:**

| Escenario | Lo que pintó |
|---|---|
| Gestionada, aseo confirmado con aseador | `domingo 20 de septiembre` · `Pendiente` · `A cargo: Maria Restrepo` |
| Se siembra otro más cercano, sin asignar | `viernes 18 de septiembre` · `Sin confirmar` · `A cargo: Sin asignar` |
| Ese mismo, **cancelado** | vuelve al del 20. El `or` que excluye cancelados funciona |
| Informativa con aseo | `sábado 19 de septiembre` · `Gestión externa` · `A cargo: — no aplica` |
| Su aseo movido a **ayer** | `No tiene ningún aseo programado.` |

La tercera fila es la que importa dos veces: la primera corrida de esa medición **no midió nada**, porque el `update` a `cancelada` falló en silencio por `cl_cancelada_shape` (falta `cancelled_at`) y yo no había comprobado el error. Con el error comprobado y la fila bien cancelada, el resultado cambió. Queda anotado porque es el mismo error de instrumento que `08-02` §1.1 documenta: un escenario que no se ejerce sale verde igual.

**El dinero:**

| Caso | Lo que pintó |
|---|---|
| Tarifa 120.000, pago 60.000 | `Margen $ 60.000` |
| Tarifa 60.000, pago 100.000 | `Margen -$ 40.000`, con el signo menos explícito y en el color de aviso |

**La fila sobre una dirección que ya no existe (§11.4):**

| Caso | Diálogos | Pantalla | URL |
|---|---|---|---|
| Identificador válido que no existe | **0** | normal | **se queda con su parámetro huérfano** |
| Identificador malformado | **0** | 39 filas | intacta |

Sin 404, sin toast, sin panel vacío y sin redirección, que es lo que §11.4 pide con esas cuatro palabras.

**La dirección y su enlace:**

| Caso | Lo que hay |
|---|---|
| Con `maps_url` | `<a target="_blank" rel="noopener noreferrer">` con la dirección **completa** como nombre accesible y un icono dentro |
| Sin `maps_url` | texto plano, **cero** enlaces externos, cero iconos |

**El pie:**

```
Calendario → /apartamentos?apartamento={id}&vista=calendario
Editar     → /apartamentos/{id}
```

**La fila abierta:** exactamente **un** `tr[aria-current]` en el documento.

## Lo que NO se tocó

- **`components/ui/sheet.tsx`.** §6.3 del VEREDICTO lo prohíbe por nombre.
- **Las tres reglas de comportamiento de `TablaApartamentos`.** El pseudoelemento que estira el área de clic y el apilamiento de la celda del menú **no aparecen en el diff**. El selector de foco de fila sí aparece, y conviene decir cómo: la cadena de clases es **byte a byte la misma**, lo único que cambió es que ahora vive dentro de un `cn()` para poder añadirle el fondo de la fila abierta. El selector no se tocó.
- **El menú de la lista.** Activar, desactivar y borrar siguen donde estaban. Ninguna mutación entra a este panel.
- **`app/(cleaner)`.** Diff vacío.
- **Los archivos de carga de segmento.** No se reintrodujo ninguno.

## Lo que queda abierto

1. **§5.4 no tiene dueño.** *"Al guardar, aterriza en la lista con el panel abierto"* (D8-11): el redirect tras crear un apartamento tiene que pasar de `/apartamentos/{id}` a `/apartamentos?apartamento={id}`. Vive en `app/(admin)/apartamentos/_actions.ts`, que **no está en los `files_modified` de ningún plan de la fase que lo nombre**. Mientras no se haga, los cuatro rojos que D8-11 contó (`apartamento-crud.spec.ts:149,191,285` y `apartamento-cuartos.spec.ts:146`) **no existen**, y el plan 08-11 los va a buscar sin encontrarlos. Es el mismo patrón que `08-04` encontró con la INSTRUCCIÓN 2: una decisión escrita después de los planes que se quedó sin asignar.
2. **`e2e/apartamentos-lista.spec.ts:383`**, el rojo declarado. Lo cierra `08-11`.
3. **La fila del código de acceso** está lista y vacía. La llena `08-09`.
4. **`?vista=calendario`** ya viaja en la dirección y todavía no renderiza nada distinto. Lo llena `08-10`, ampliando `lib/data/panel-apartamento.ts`, que ya declara ese alcance en su cabecera.
5. **`MenuAseo.tsx:256` y el enlace de la fila inerte de `/operacion`** siguen apuntando a `/apartamentos/{id}`. §5.3 puntos 3 y 6 los manda apuntar a `/apartamentos?apartamento={id}`; son del plan **08-07**, que es el dueño de ese archivo.
6. **La medición del criterio 1 con repeticiones** y con casos que se queden en el árbol es de `08-11`. Lo de este plan es una medición única con andamio desechable, y así está declarado arriba.

## Self-Check: PASSED

- `lib/data/panel-apartamento.ts` — FOUND
- `app/(admin)/apartamentos/_components/PanelApartamento.tsx` — FOUND
- `lib/data/apartamentos.ts` — FOUND (modificado)
- `lib/data/apartamentos.test.ts` — FOUND (modificado)
- `app/(admin)/apartamentos/page.tsx` — FOUND (modificado)
- `app/(admin)/apartamentos/_components/TablaApartamentos.tsx` — FOUND (modificado)
- `e2e/tmp-medicion-panel.spec.ts` — AUSENTE (andamio desechable, borrado a propósito)
- `8364c3e` — FOUND
- `169ea41` — FOUND
- `1865933` — FOUND

---
*Fase: 08-paneles-laterales-en-el-admin*
*Terminado: 2026-09-17*
