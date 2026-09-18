---
phase: 08-paneles-laterales-en-el-admin
plan: 13
subsystem: pruebas
tags: [e2e, playwright, criterio-2, criterio-3, criterio-4, criterio-5, fin-01, señuelos, frontera-servidor-cliente]

requires:
  - phase: 07-financiero
    provides: "esperarUrlDeCliente(), esperarControlHidratado() y pulsarHastaNavegar() en e2e/fixtures.ts; CIFRAS_FINANCIERAS con sus valores poco probables; y el interceptor de carga útil de e2e/mis-pagos.spec.ts, con la medición del control de método que no podía dispararse"
  - phase: 08-paneles-laterales-en-el-admin
    provides: "08-02 §6.2: la INSTRUCCION 7 (el instrumento de espera) y la INSTRUCCION 8 (la contra-prueba obligatoria). 08-05: leerPanelDeAseo() con su forma. 08-07: el panel de aseo, la validación contra la definer y el aviso del nombre accesible duplicado. 08-08: el panel de aseadora, la validación que no depende del rango y el aviso del grupo 4. 08-11: getByRole('dialog') como único ámbito de lectura de un panel. 08-12: el anunciador de rutas con role=alert, el cuerpo de una Server Action que hay que desviar, y el chevron pegado al valor del select"
provides:
  - "El criterio 4 del ROADMAP deja de ser referencia faltante en su mitad de interfaz: tres casos con números concretos"
  - "El caso del aseo FUERA de la ventana de hoy−7 a hoy+6, que es la única red del atajo barato de validación en /operacion"
  - "El caso de la aseadora sin actividad en el rango filtrado, su gemelo en /finanzas"
  - "El criterio 3 afirmado en los dos anfitriones, con la mitad de CERRAR que no cubría nadie"
  - "Dos casos de fuga capaces de ponerse rojos, con control de método que sí se dispara"
  - "Un defecto de producto encontrado en rojo: el panel de un aseo con evidencia de verdad reventaba en el servidor"

affects: [08-14]

tech-stack:
  added: []
  patterns:
    - "Una función que llaman los dos lados de la frontera vive en un módulo SIN directiva. Exportarla desde un módulo 'use client' hace que la llamada del servidor sea una referencia al otro lado y el render muera"
    - "Toda aserción de fuga busca la cifra en los DOS formatos (crudo y con separador de miles) y sobre el cuerpo de las respuestas, nunca solo sobre lo que se pinta"
    - "Todo control de método se escribe de forma que pueda dispararse, y se prueba que se dispara: la misma búsqueda con la sesión que SÍ ve el dato tiene que encontrarlo"
    - "El valor de una fila de panel se localiza por el <dd> hermano de su <dt>, no por el texto suelto: `sin definir` sale en dos filas del mismo panel"

key-files:
  created:
    - "app/(admin)/operacion/_components/etiqueta-de-foto.ts"
  modified:
    - "e2e/operacion.spec.ts"
    - "e2e/finanzas.spec.ts"
    - "e2e/fixtures.ts"
    - "app/(admin)/operacion/_components/DialogoFoto.tsx"
    - "app/(admin)/operacion/_components/TiraDeEvidencia.tsx"
    - ".planning/phases/08-paneles-laterales-en-el-admin/deferred-items.md"

decisions:
  - "El checklist del caso del criterio 4 se escribe a mano y no confirmando el aseo desde la pantalla: lo que se mide es el panel, no confirm_cleaning, y pasar por ahí ataría el 7/12 a cuántas tareas traiga la biblioteca global"
  - "El aseo del panel se siembra EN CURSO y no terminado: el trigger de snapshot reimpone las dos cifras de dinero en un UPDATE solo sobre estados terminales, así que sobre un aseo completado no se podrían sembrar cifras distintas a las del apartamento"
  - "Las tres cifras del grupo DINERO se prohíben enteras en la sesión de aseadora, no solo tarifa y margen: en mis-pagos el pago es permitido porque es el dinero propio de quien mira, y acá la sesión es de otra persona sobre el aseo de un tercero"
  - "La rama con cifras del grupo 4 del panel de aseadora NO se cerró, y el argumento cambió respecto a lo que 08-11 suponía: no basta con sembrar un periodo, hay que BORRAR la cabecera de un periodo ya cerrado, y eso se lleva por delante los tres pagos de los que dependen catorce casos"
  - "El flake de operacion.spec.ts:390 no se arregló: está medido corriendo el archivo SIN ninguno de los casos nuevos y el rojo sale igual"

metrics:
  duration: "~3h"
  completed: "2026-09-18"

status: complete
---

# Fase 8 Plan 13: El criterio 4 con números, y los enlaces que la lista no contiene, Summary

**Once casos nuevos, los once vistos en rojo antes de darse por buenos, y un defecto
de producto que llevaba toda la fase escondido:** el panel de un aseo con evidencia de verdad
reventaba en el servidor, y no lo había visto nadie porque hasta hoy ninguna prueba había subido
un solo byte al bucket.

## Rendimiento

- **Duración:** ~3 h
- **Tareas:** 3 de 3
- **Archivos:** 1 creado · 5 modificados de código · 1 de planificación
- **Commits:** 4 (uno de arreglo de producto y tres de pruebas)
- **Casos nuevos:** 11 · **E2E** de 140 a **152 pasando**

## El defecto que este plan destapó, y es lo primero que hay que leer

```
⨯ Error: Attempted to call deQueEsLaFoto() from the server but deQueEsLaFoto is on
  the client. It's not possible to invoke a client function from the server, it can
  only be rendered as a Component or passed to props of a Client Component.
```

`TiraDeEvidencia` es un componente de **servidor** y llamaba a `deQueEsLaFoto()` para componer el
nombre accesible del botón de cada miniatura (§13.4). Esa función estaba exportada desde
`DialogoFoto.tsx`, que lleva `'use client'`. **El panel de cualquier aseo con al menos una foto
que se firma de verdad daba error de servidor y no se pintaba.**

**Por qué llevaba ahí desde 08-07 sin que nadie lo viera, que es la parte que importa:** la llamada
solo ocurre en la rama de la foto **firmada**, y hasta este plan ningún escenario de prueba había
subido bytes al bucket. El andamio de 08-07 sembró siete fotos y su propio SUMMARY lo dice con
todas las letras: *«ninguna con objeto en Storage, o sea las 7 con firma fallida»*. Con las siete
en `firma_fallida`, la tira pinta seis casillas de ausencia y esa línea **no se ejecuta nunca**.

Es exactamente la clase de verde que esta fase existe para desconfiar: el criterio 4 estaba
«cubierto» por una medición que solo había ejercido la rama sin evidencia.

**El arreglo:** la función se muda a `etiqueta-de-foto.ts`, un módulo **sin directiva**, que los dos
lados de la frontera pueden importar. No podía vivir en `TiraDeEvidencia`, porque ese archivo
importa a `DialogoFoto` y el préstamo sería circular. La cabecera del módulo nuevo lleva el error
literal y la explicación de por qué nadie lo vio.

## Lo que se hizo

### Task 1 · El criterio 4, en sus piezas y con números

Tres casos sobre `/operacion`, **todos acotados a `getByRole('dialog')`**.

**(a) El caso principal, con cuatro piezas afirmadas por separado y cada una con su mensaje:**

| Pieza | Qué afirma | Por qué no basta con menos |
|---|---|---|
| **El progreso** | `7/12` contra **doce tareas sembradas con siete marcadas**, y además su lectura de solo texto (`Checklist, 7 de 12 tareas`) | Una aserción sobre la FORMA (`algo/algo`) pasaría con la cuenta mal hecha, que es justo el defecto contra el que T-08-22 puso la regla de no contar el checklist en el componente |
| **La tira** | seis casillas: **una miniatura de verdad con su nombre accesible**, cuatro casillas de ausencia y la de conteo `+2` | Con seis fotos o menos la rama de la casilla de conteo no se ejerce nunca. Y sin una foto con bytes de verdad, la rama de la miniatura firmada tampoco: es la que destapó el defecto de arriba |
| **Los reportes** | el gasto con su prefijo y su monto, el daño con el suyo, y **la línea de D7-2 literal de §15.2** | El prefijo y el icono son los dos canales de la distinción gasto/daño (§13.5); la línea solo aparece cuando hay al menos un daño |
| **El dinero** | las tres cifras salen **del aseo**, con el apartamento sembrado con otras distintas | Es FIN-01 desde la interfaz. Con las dos iguales, una implementación que uniera `properties` por su alias pasaría sin haber probado nada |

**La tarifa del apartamento se relee de la base y no se escribe a mano.** Si el sembrador cambiara
sus 120.000, una constante escrita en el spec dejaría de ser la contraparte de nada y la aserción de
FIN-01 pasaría por vacuidad.

**El aseo se siembra EN CURSO, y es una decisión de schema y no de gusto.** El trigger
`tg_cleanings_snapshot()` reimpone `tarifa_huesped` y `pago_aseador` en un UPDATE **solo si el
estado es terminal**, que es la congelación de FIN-01. Sobre un aseo `completada` no hay forma de
sembrar cifras distintas a las del apartamento, y sin cifras distintas el caso no prueba FIN-01.

**(b) El checklist ausente.** Un aseo **sin confirmar** enseña `— sin definir`, no `0/12`. Las
tareas se materializan al **confirmar** (`confirm_cleaning`, migración 04), así que la lectura
devuelve cero filas. Un `0/12` sería otra cosa: un aseo confirmado, con su checklist puesto, que
nadie ha empezado, y ese sí se pinta con su cero. La aserción va con su negativa al lado
(`not.toMatch(/\d+\s*\/\s*\d+/)`), porque afirmar solo el texto de ausencia dejaría pasar un panel
que dijera las dos cosas.

**(c) La fila de gestión externa, con sus dos mitades y mensajes distintos.** Tocar una celda que no
es el nombre **no abre ningún diálogo** y no le mete parámetro a la dirección; y el nombre **sigue
llevando a la ficha de SU apartamento**, con el `href` afirmado por atributo antes de pulsarlo.

**La siembra que hizo falta, y dónde vive.** `sembrarOperacion()` no crea cuartos, y sin cuartos no
hay checklist que materializar (`property_room_id` es NOT NULL con FK). Los cuatro cuartos se
siembran **dentro del spec** y no en el sembrador compartido, del que dependen catorce casos de tres
specs. Caen solos por cascade al borrar el apartamento. El helper lleva un guarda que revienta con
nombre y apellido si la biblioteca global de tareas deja de dar doce, en vez de dejar un rojo de
aritmética.

### Task 2 · Los enlaces que la lista del anfitrión no contiene

**El caso del aseo fuera de la ventana es el más importante del plan**, y es el único anfitrión de
la fase donde se puede escribir. `/operacion` lee **hoy−7 … hoy+6** (`VENTANA_ATRAS_DIAS = 7`,
`HORIZONTE_DIAS = 6`, los dos en el comentario del caso). Se siembra un aseo de **hace veintiún
días**, se comprueba que **NO está en la lista que la pantalla lee**, y se entra por dirección
directa: **el panel abre**, con el apartamento y **la fecha** que la dirección dice.

El control de ausencia no es adorno: si el aseo estuviera en la lista, el atajo barato abriría el
panel igual y el caso pasaría en verde sin haber ejercido nada.

**Su gemelo en Finanzas**, por otra razón: el Resumen solo devuelve a las personas **con actividad
en el rango filtrado**. Con el filtro en un día, la aseadora Dos no sale, y su enlace abre igual.
Va con **control positivo al lado** (la Una sí está en la lista), sin el cual la ausencia de la Dos
podría ser una pantalla vacía en vez de una persona ausente.

**El criterio 3, en los dos anfitriones y con sus dos mitades:**

1. **Atrás** cierra el panel **y** la dirección sigue en la sección. Sin la segunda mitad, una
   implementación que abriera con reemplazo pasaría la primera sin despeinarse: el diálogo
   desaparecería porque el botón atrás sacó de la sección entera, que es el `about:blank` que 08-11
   midió en el panel de pago.
2. **Cerrar conserva los parámetros del anfitrión.** En Operación el filtro de alertas; en Finanzas
   el rango y el ancla. **Es Pitfall 2 convertido en aserción, por su otra mitad**: la aserción de
   ancla que 08-11 conservó protege el **abrir**, esta protege el **cerrar**, y hoy no la cubría
   nadie.

### Task 3 · La fuga, buscada donde sí viaja

Un caso por anfitrión, y los dos con la forma que la Fase 7 no tenía.

**La trampa que se está esquivando, escrita en la cabecera de la sección:** el control de método del
spec del aseador **no podía dispararse nunca**, porque buscaba las cifras permitidas solo en el
formato crudo y el entero crudo **no viaja** (el formateo ocurre en el servidor, así que lo que
cruza es `41.117` y jamás `41117`). **La prueba de la fuga habría pasado en verde incluso con la
fuga abierta.**

De ahí las tres piezas de estos dos casos:

1. **Se busca en los dos formatos** y **sobre el cuerpo de las respuestas de red**, no sobre lo que
   se pinta. Una pantalla que no pinte la cifra pero la mande en la carga de hidratación rompe la
   frontera igual: el dato ya está en el teléfono.
2. **El control de método es la misma búsqueda con sesión de admin**, que tiene que **encontrar**
   las cifras. Si con admin no encuentra nada, la ausencia con la aseadora no prueba que no haya
   fuga: prueba que no se miró. **Y se comprobó que ese control puede fallar** (señuelo 8).
3. **La mitad del DOM**, con los puntos y espacios quitados de los dos lados, porque una cifra puede
   entrar calculada en el cliente a partir de dos que sí viajaron.

**Lo que NO se duplica, a propósito:** el bloque P de `11_financiero.test.sql` ya afirma que una
aseadora que llama a `detalle_de_aseo` recibe permiso denegado, **dentro de Postgres y con roles
reales**. Este caso afirma la otra capa. Atar las dos al mismo literal no compraría ninguna
garantía.

**Y una medición de regalo, anotada en el caso:** el rebote del layout de admin **arrastra el
parámetro** y deja `/mis-aseos?aseo={uuid}`. Es inocuo (la ruta del aseador no lo lee) y no se
arregla desde acá: exigir `/mis-aseos` a secas convertiría el caso en una aserción sobre cómo
redirige el middleware, que es otra cosa y tiene su propio spec.

## Los ocho señuelos, con su rojo real

La INSTRUCCION 8 es una compuerta: **un caso nuevo que nunca se vio en rojo no cuenta.** Los ocho se
corrieron, se comprobó el rojo, **y se revirtieron**. El árbol quedó con los dos archivos de pruebas
y nada más.

| # | Caso que protege | Qué se rompió a propósito | Qué se puso rojo |
|---|---|---|---|
| 1 | criterio 4, **el progreso con números** | `filaDeChecklist` pinta `progreso.hechas + 1` | `Expected substring: "7/12"` · `Received string: "8/12Checklist, 7 de 12 tareas"` |
| 2 | criterio 4, **la línea de D7-2** | la condición `danos.length > 0` pasa a `false` | `CRITERIO 4 · con un daño reportado, la línea de D7-2 está, literal de §15.2` · `element(s) not found` |
| 3 | **FIN-01 desde la interfaz** | `detalle_de_aseo` devuelve `pr.tarifa_huesped` en vez de `c.tarifa_huesped` (aplicado con `create or replace` sobre la base y restaurado después) | `FIN-01 · la tarifa del panel es la del ASEO, no la viva del apartamento` · `Expected: "$ 183.947"` · `Received: "$ 120.000"` |
| 4 | **criterio 2, el aseo fuera de la ventana** | el panel se condiciona a `operacion.filas.some(f => f.id === …)`, o sea **la validación contra lo que la pantalla ya leyó** | `CRITERIO 2 · un enlace válido a un aseo fuera de la ventana abre su panel` · `element(s) not found` |
| 5 | criterio 3, **la conservación al cerrar en Operación** | `rutaAlCerrar = '/operacion'`, constante | `La navegación de cliente no dejó la URL en /\/operacion\?alertas=atendidas$/ tras 15000 ms. Sigue en http://127.0.0.1:3210/operacion` |
| 6 | criterio 3, **la conservación al cerrar en Finanzas** | `rutaAlCerrar = '/finanzas'`, constante | `CRITERIO 3 · y devuelve la dirección con el rango y el ancla INTACTOS` · `Expected pattern: /\/finanzas\?rango=dia&ancla=2026-08-03$/` · `Received string: "http://127.0.0.1:3210/finanzas"` |
| 7 | **criterio 5, los dos casos de fuga** | una línea con las cuatro representaciones de las dos cifras metida en `/mis-aseos`, que es lo que la sesión de aseadora SÍ alcanza | `FUGA: la cifra 183947 del panel de aseo viajó al navegador de la aseadora en …/mis-aseos?aseo=…` **y** `FUGA: la cifra 152909 viajó al navegador de la aseadora en …/mis-aseos` |
| 8 | **el control de método del criterio 5** | se quita `fijarElDineroDelAseo()`, así que el panel del admin enseña las cifras del apartamento y no hay nada prohibido que encontrar | `CONTROL DEL MÉTODO: con la sesión de admin, esta misma búsqueda SÍ encuentra las cifras del panel…` · `Expected length: not 0` · `Received array: []` |

**El señuelo 4 es el que el plan existía para producir**, y salió exactamente como se predijo: con
la validación cambiada al atajo barato, **el enlace a un aseo de hace tres semanas abre la pantalla
sin panel y sin decir por qué**, y solo ese caso se pone rojo. Los cinco restantes de la sección
siguieron en verde, que es la otra mitad de lo que un señuelo tiene que demostrar.

**El señuelo 8 es la respuesta directa al defecto que la Fase 7 pagó.** No basta con que el caso
pueda ponerse rojo: hay que demostrar que **el control** puede ponerse rojo, porque un control que
no se puede disparar es exactamente lo que convirtió aquella prueba en un verde vacío.

**El señuelo 7 tocó `app/(cleaner)/mis-aseos/page.tsx` y está revertido.** La prohibición del plan
es sobre el **diff**, y el diff no lo contiene: `git diff --name-only -- 'app/(cleaner)'` sobre los
cuatro commits da **cero archivos**.

**Y el noveno, que no fue un señuelo sino un hallazgo:** el defecto de la frontera
servidor/cliente salió en rojo solo, escribiendo el caso principal. Está arriba.

## Verificación

| Comprobación | Línea base | Ahora |
|---|---|---|
| `npm run test:unit` | 1244 | **1244 en verde**, 65 archivos |
| `npm run test:integration` | 205 | **205 en verde**, 23 archivos |
| `npm run db:test` (pgTAP) | 380 | **380 en verde**, 12 archivos, `Result: PASS` |
| `npx playwright test` (completa) | 140 pasando · 1 saltado · 2 rojos | **152 pasando · 1 saltado · 1 rojo** |
| `npm run build` | limpio | limpio |
| `npx tsc --noEmit` | limpio | limpio |
| `npm run lint` | 0 errores, 2 avisos preexistentes | **0 errores, los mismos 2 avisos** de archivos de test que este plan no toca |
| `npm run ci:arch` | los tres en OK | **los tres en OK** |

**De 140 a 152 pasando, y los DOS rojos de la línea base están en cero.** `operacion-alertas:341` y
`push-instalacion:248` pasaron los dos en la corrida completa.

**El único rojo que queda es `operacion.spec.ts:390`, y está medido que no es de este plan.** Tres
mediciones, en este orden:

```
--grep "cancelar un aseo" --repeat-each=3            → 3 passed
--grep-invert "CRITERIO"   (corrida 1)               → 9 passed
--grep-invert "CRITERIO"   (corrida 2)               → 1 failed · 8 passed   ← :390
npx playwright test (completa)                       → 152 passed · 1 skipped · 1 failed  ← :390
```

**La segunda es la que cierra el caso:** `--grep-invert "CRITERIO"` corre el archivo **sin ninguno
de los once casos nuevos** y el rojo sale igual. 08-07 ya lo había visto una vez (era la línea 373
entonces, misma prueba y mismo toast) y lo dejó como *«apareció una vez y no se reprodujo»*. Ahora
está en `deferred-items.md` con las tres mediciones y con el arreglo correcto, que **no** es aflojar
la aserción sino drenar la pila de toasts en el `beforeEach`.

### Los cinco specs del aseador, sin una línea tocada

```
git diff --name-only 4be0157~1..HEAD -- 'e2e/aseo-*.spec.ts' e2e/mis-pagos.spec.ts e2e/push-instalacion.spec.ts
  → 0 archivos
```

**Vacío**, y las cinco suites en verde dentro de la corrida completa. Es evidencia de comportamiento
para el criterio 6.

### Los greps de aceptación, con su línea base y su valor de ahora

```
                                             antes   ahora   pedido
operacion.spec  getByRole('dialog')              6      16   ≥4
operacion.spec  locator('main')                  0       0   no aumenta
operacion.spec  esperarUrlDeCliente              0       2   ≥2
operacion.spec  aseo=                            0      10   presente
finanzas.spec   getByRole('dialog')              4      10   —
finanzas.spec   locator('main')                  1       1   no aumenta (y es un comentario)
finanzas.spec   esperarUrlDeCliente              1       3   —
los dos         waitForTimeout                   0       0   no aumenta
git diff --name-only -- 'app/(cleaner)'        vacío   vacío  vacío
```

**Sobre `locator('main')` en `operacion.spec.ts`:** la cabecera de la sección 9 explica por qué no
se puede acotar por el contenedor de página, y la primera redacción citaba el literal. El grep
habría pasado de 0 a 1 **por una frase que dice justo lo contrario de lo que el grep vigila**, así
que la frase se reescribió sin el literal. Queda en **0**.

### La base, comprobada después de la corrida completa

```
unidades 39 | aseos 0 | cuartos E2E 0 | objetos en el bucket 1
```

**Los cuartos sembrados y las siete fotos no sobreviven**, y el objeto del bucket que este plan subió
tampoco: el `afterAll` lo borra por ruta, porque el almacenamiento es otro sistema y no cascadea
desde `cleanings`. El objeto que queda es
`{cleaning_id}/checklist/{uuid}.jpg`, con la forma que escribe **la PWA del aseador**, no la de este
plan (`{cleaning_id}/checklist/foto-{sufijo}-{n}.jpg`). Es un resto de `aseo-evidencia` o
`aseo-ejecucion`, anterior a este plan y fuera de su alcance. Queda dicho por si alguien audita el
bucket.

## Deviations from Plan

### Auto-fixed Issues

**1. [Regla 1 - Bug] El panel de un aseo con evidencia de verdad reventaba en el servidor**

- **Encontrado durante:** Task 1, escribiendo el caso principal del criterio 4. Salió en rojo solo.
- **Problema:** `TiraDeEvidencia` (servidor) llamaba a `deQueEsLaFoto()`, exportada desde
  `DialogoFoto.tsx` (`'use client'`). Cualquier aseo con una foto que se firmara de verdad daba
  error de render. No se había visto porque ningún escenario de prueba había subido bytes al bucket,
  así que las siete fotos del andamio de 08-07 caían en `firma_fallida` y la rama no se ejecutaba.
- **Arreglo:** la función se muda a `app/(admin)/operacion/_components/etiqueta-de-foto.ts`, un
  módulo sin directiva que los dos lados pueden importar. La cabecera lleva el error literal y la
  razón de por qué nadie lo vio, para que el siguiente que lo mueva sepa qué rompe.
- **Archivos:** `etiqueta-de-foto.ts` (nuevo), `DialogoFoto.tsx`, `TiraDeEvidencia.tsx`. **Los tres
  fuera de los `files_modified` del plan.**
- **Commit:** `4be0157`

**2. [Regla 3 - Bloqueo] `BYTES_DEL_RECIBO` se exporta desde `e2e/fixtures.ts`**

- **Encontrado durante:** Task 1.
- **Problema:** la tira necesita al menos una foto con bytes de verdad, o la rama de la miniatura
  firmada no se ejerce nunca, que es precisamente la que acababa de destapar el defecto de arriba.
  El JPEG de 1×1 que hace falta ya existe en `fixtures.ts`, privado.
- **Arreglo:** una palabra (`export`) más el comentario que dice por qué. La alternativa era el mismo
  base64 viviendo en dos archivos.
- **Archivo:** `e2e/fixtures.ts`, **fuera de los `files_modified`**.
- **Commit:** `50eafe4`

### Lo que se dejó fuera, con su razón

**La rama con cifras del grupo 4 del panel de aseadora NO se cerró, y el argumento de 08-11 no se
sostiene al mirarlo de cerca.** 08-08 y 08-11 lo dejaron escrito como *«basta con sembrar un periodo
vencido sin cerrar»*. Medido contra la migración 25: `periodo_pendiente_de_cierre()` devuelve el
periodo más reciente **cuyo día de cierre ya pasó Y que no tiene cabecera en `payout_periods`**, y
además **solo mira lo posterior al último periodo cerrado**. En el fixture financiero los dos
periodos pasados están cerrados y el tercero contiene hoy, así que no hay ningún hueco que sembrar:
**habría que BORRAR la cabecera del periodo reciente**, y eso se lleva por delante los tres pagos de
`esc.pagos`, de los que dependen catorce casos de `finanzas.spec.ts` y `mis-pagos.spec.ts`.

La forma barata de verdad es sembrar un cuarto periodo anterior y dejarlo sin cerrar, lo cual toca
`sembrarFinanzas()` en `e2e/fixtures.ts`, que **no es un archivo de este plan** y del que dependen
tres specs. Se deja como estaba, con el argumento corregido para que el siguiente no vuelva a
empezar desde la suposición equivocada.

**Los tres huecos de contrato que 08-12 mandó a este plan tampoco se cierran**, y por la misma razón
que 08-12 no los cerró: son cambios de producto (`hayCodigoDeAcceso()` devolviendo la unión, los dos
botones `Conectar calendario`, y `1 fallos seguidos`) y el `files_modified` de este plan son dos
archivos de pruebas. Siguen en `deferred-items.md` con su decisión ya tomada.

**`operacion.spec.ts:390` no se arregló.** Es la regla de alcance: no lo causa nada de este plan,
está medido, y el arreglo correcto toca el arnés del archivo.

### Auth gates

Ninguno.

## Known Stubs

Ninguno. Los once casos corren contra datos reales y los once se vieron en rojo.

## Threat Flags

Ninguno de superficie nueva: no hay endpoint nuevo, no hay cambio de schema, y el único cambio de
producto es mover una función de un módulo a otro sin tocar su cuerpo.

**Y los cinco del registro se cubrieron:**

| Amenaza | Cómo se cerró |
|---|---|
| T-08-62 · la aserción de fuga buscando la cifra solo en el formato que no viaja | Búsqueda en los dos formatos y sobre el cuerpo de las respuestas, con control de método que se probó capaz de fallar (señuelo 8) y con el caso puesto en rojo de verdad (señuelo 7) |
| T-08-63 · la validación cambiada a la lista de la pantalla | Caso del aseo fuera de la ventana, con el señuelo 4 cambiando la validación y poniéndolo rojo a él y a nadie más |
| T-08-64 · cerrar con una ruta constante borra el filtro | Aserción de conservación al cerrar en los dos anfitriones, con los señuelos 5 y 6 |
| T-08-65 · una aserción de panel acotada por un contenedor que el portal deja vacío | Todo contenido de panel se acota al diálogo: 16 ocurrencias en operación y 10 en finanzas, y `locator('main')` sigue en 0 y en 1 (un comentario) |
| T-08-66 · la fila de gestión externa ganando panel | Caso con sus dos mitades: no abre diálogo y su nombre sigue llevando a la ficha, con el `href` afirmado por atributo |

## Lo que este plan le deja escrito a `08-14`

Cinco cosas que cruzar:

1. **Las ocho filas de señuelos**, cada una con su rojo real citado. Las cinco del registro de
   amenazas están cubiertas.
2. **De 140 a 152 pasando en E2E**, y **los dos rojos de la línea base en cero**.
3. **El rojo que queda (`operacion.spec.ts:390`) NO es una regresión de la fase**, y está medido
   corriendo el archivo sin ninguno de los casos nuevos. La medición completa está en
   `deferred-items.md`.
4. **Un defecto de producto encontrado y arreglado en esta fase**, con su causa escrita: el panel de
   un aseo con evidencia de verdad no se pintaba. Conviene cruzarlo, porque implica que la cobertura
   de 08-07 sobre la tira de evidencia era más estrecha de lo que su SUMMARY sugería.
5. **Los criterios 2, 3, 4 y 5 ya no son referencia faltante** en los tres anfitriones que esta fase
   toca desde la interfaz. Lo que sigue abierto es el criterio 1 en `/operacion` y `/finanzas` (solo
   está afirmado sobre `/apartamentos`, por 08-12), y los tres huecos de contrato de
   `deferred-items.md`.

## Self-Check: PASSED

**Archivos declarados, comprobados en disco:**

- `app/(admin)/operacion/_components/etiqueta-de-foto.ts` — FOUND
- `e2e/operacion.spec.ts` — FOUND
- `e2e/finanzas.spec.ts` — FOUND
- `e2e/fixtures.ts` — FOUND
- `app/(admin)/operacion/_components/DialogoFoto.tsx` — FOUND
- `app/(admin)/operacion/_components/TiraDeEvidencia.tsx` — FOUND
- `.planning/phases/08-paneles-laterales-en-el-admin/deferred-items.md` — FOUND

**Commits declarados, comprobados en `git log`:**

- `4be0157` — FOUND
- `50eafe4` — FOUND
- `bbcf139` — FOUND
- `96078d3` — FOUND

**Los ocho señuelos, comprobados como revertidos:**

```
git status --short                          solo los archivos de este plan, ninguno de producto
git diff --name-only 4be0157~1..HEAD        7 archivos, y los tres de producto son el arreglo del defecto
git diff --name-only … -- 'app/(cleaner)'   0 archivos
detalle_de_aseo con c.tarifa_huesped        t   (restaurada y comprobada en pg_proc)
```
