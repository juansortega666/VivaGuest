---
phase: 08-paneles-laterales-en-el-admin
plan: 14
subsystem: validacion
tags: [compuerta, criterio-5, criterio-6, señuelos, inventario, deuda, nyquist]

requires:
  - phase: 08-paneles-laterales-en-el-admin
    provides: "08-01: el bloque P y sus cuatro señuelos de base, anotados en la bitácora. 08-02: el inventario clasificado de §5.2 y §5.3, y la INSTRUCCION 8. 08-05: la lectura del panel de aseo con su test de integración. 08-08: la nota de higiene del bloque L. 08-11, 08-12 y 08-13: veinticinco señuelos de interfaz con su rojo real, y los casos que afirman los criterios 1 a 5"
provides:
  - "El sign-off de validación de la fase, con nyquist_compliant en verdadero y sin una sola referencia faltante"
  - "La tabla de los seis criterios, cada uno con el comando que lo afirma y dónde vive, y ninguna celda dice que se verificó a mano"
  - "El cruce del inventario del portal completo, veintitrés filas, sin ninguna sin cuadrar"
  - "Los dos señuelos que faltaban, corridos con su rojo real"
  - "La deuda de ejecución escrita en cinco puntos, y las dos consecuencias que la Fase 9 va a leer"

affects: [09-retencion-y-borrado-automatico]

tech-stack:
  added: []
  patterns:
    - "Un guardarraíl de CI que mira un árbol que la fase no toca sale verde diciendo nada, y ese verde no es evidencia de nada"
    - "Un plan que retargetea N aserciones puede correr señuelos de N−2 sin que nadie lo note: el recuento no lo hace nadie hasta la compuerta"

key-files:
  created:
    - ".planning/phases/08-paneles-laterales-en-el-admin/08-14-SUMMARY.md"
  modified:
    - ".planning/phases/08-paneles-laterales-en-el-admin/08-VALIDATION.md"
    - "supabase/tests/11_financiero.test.sql"
    - ".planning/phases/08-paneles-laterales-en-el-admin/deferred-items.md"

decisions:
  - "STATE.md y ROADMAP.md NO se tocan desde este plan: el orquestador es su dueño en esta ejecución. El texto que les corresponde queda escrito acá para que lo tome"
  - "El rojo de la suite E2E no se cuenta como regresión de la fase, y no por herencia: 08-14 lo volvió a medir por su cuenta corriendo el archivo sin ninguno de los casos nuevos"
  - "Los dos señuelos que faltaban se corrieron acá en vez de declararse como hueco: la INSTRUCCION 8 dice que una aserción sin contra-prueba no cuenta, y declararlo habría dejado dos de las cinco filas EN RIESGO sin respaldo"
  - "El código huérfano que la compuerta encontró (FichaAseadora.tsx y la función BloqueAhoraMismo) se declara, no se borra: este plan es una puerta y borrar producto desde acá es lo que la regla de alcance existe para impedir"

metrics:
  duration: "~2h"
  completed: "2026-09-18"

status: complete
---

# Fase 8 Plan 14: La compuerta de la fase, Summary

**Los seis criterios del ROADMAP están afirmados por algo que corre solo, el árbol del aseador
tiene diff vacío desde la base de la rama, y el cruce del inventario cuadró en sus veintitrés
filas.** Dos cosas salieron mal y las dos están escritas: faltaban dos señuelos de la casilla EN
RIESGO, y la nota de higiene del bloque L estaba incompleta.

## Rendimiento

- **Duración:** ~2 h
- **Tareas:** 3 de 3
- **Archivos:** 1 creado (este) · 3 modificados, todos de documentación o comentario
- **Commits:** 3
- **Cambios de producto:** **cero**. El diff de este plan no contiene ni una línea de `app/`, `lib/`
  ni `components/`

---

## 1. LOS SEIS CRITERIOS, CADA UNO CON EL COMANDO QUE LO AFIRMA

**Es la tabla que cierra la fase. Ninguna celda dice "verificado a mano", y eso no es casualidad:
`08-VALIDATION.md` declaró desde el principio que esta fase no añade checkpoints humanos, a
diferencia de la 5, la 6 y la 7.**

| Criterio | Lo afirma | Dónde |
|---|---|---|
| **1** · Abrir conserva la lista, el scroll y el filtro; cerrar devuelve al mismo sitio | `npx playwright test e2e/apartamentos-lista.spec.ts` | `:749` (abrir) y `:793` (cerrar). Cinco medidas leídas del DOM por caso, en los dos sentidos |
| **2** · El enlace se pega en un chat y abre lo mismo | `npx playwright test e2e/apartamentos-lista.spec.ts e2e/operacion.spec.ts e2e/finanzas.spec.ts` | `apartamentos-lista:840`, `:859`, `:881` · `operacion:1274` (aseo fuera de la ventana) · `finanzas:790` (aseadora sin actividad en el rango) |
| **3** · El botón atrás cierra el panel, no la sección | los mismos tres specs | `apartamentos-lista:931` y `:959` · `operacion:1323` y `:1357` · `finanzas:831` y `:859`. Las dos mitades por separado: el panel se cierra **y** la dirección sigue en la sección |
| **4** · El panel de aseo dice en qué va, sin salir del día | `npx playwright test e2e/operacion.spec.ts` **y** `npm run test:integration` | `operacion:1014` (progreso `7/12`, la tira de seis casillas, los dos reportes y las tres cifras del aseo), `:1173`, `:1206` · `lib/data/panel-aseo.integration.test.ts` |
| **5** · Ninguna aserción de seguridad se debilitó | `npm run db:test` **y** los tres specs | **pgTAP:** bloque P, aserciones **102 a 105** (`11_financiero.test.sql:2489`, `:2500`, `:2515`, `:2550`), más las **15 y 16** intactas · **E2E:** `apartamentos-lista:994` (el código fuera del documento), `finanzas:767` y `:770` (no rastreo, acotadas al diálogo), `operacion:1505` y `finanzas:1127` (las dos de fuga) |
| **6** · La app del aseador no cambió en nada | `git diff --name-only $(git merge-base HEAD main)..HEAD -- 'app/(cleaner)'` **+** `npm run db:test` **+** `npx playwright test e2e/aseo-*.spec.ts e2e/mis-pagos.spec.ts e2e/push-instalacion.spec.ts` | El diff sale **vacío** (salida abajo) · el bloque P dice que la frontera **sigue cerrada** · las cinco suites del aseador, **23 pasando · 1 saltado · 0 rojos**, sin una línea tocada |

**La celda del criterio 6 lleva tres comandos a propósito, y el orden importa:**

| # | Compuerta | Qué demuestra |
|---|---|---|
| 1 | el diff vacío | que **no se tocó** el árbol |
| 2 | **el bloque P de pgTAP** | que la frontera **sigue cerrada**, que es lo que de verdad importa |
| 3 | las cinco suites verdes sin tocarse | evidencia de comportamiento, gratis |

**Por qué la 2 es la que protege:** un diff vacío dice que nadie escribió en ese directorio. **Solo
el pgTAP dice que la frontera sigue cerrada**, y la Fase 7 midió la diferencia con una cifra: su
aserción 13 imprimió la fuga con su valor, `have: 90000`, contra un `want: ERROR:42501`. Ninguna
cantidad de diff vacío habría destapado eso, porque la fuga no vivía en el árbol del aseador sino
en un grant de tabla.

---

## 2. EL VERDE QUE NO CUENTA, Y HAY QUE DECIRLO

**`scripts/ci/check-escala-movil.sh` salió en `OK` y eso NO afirma el criterio 6.**

Lo único que ese script vigila es que ninguna clase tipográfica bajo `app/(cleaner)/` vaya sin su
sufijo `-movil`, porque iOS Safari hace zoom automático al enfocar un campo con `font-size` menor a
16 px. Su grep recorre **solo `*.ts` y `*.tsx` bajo ese directorio**.

Esta fase no tocó ese directorio. **Así que el script recorrió un conjunto que no cambió y salió
verde diciendo exactamente nada.**

Queda escrito acá y en `08-VALIDATION.md` porque el fallo de lectura es fácil y caro: quien vea
`npm run ci:arch` en verde y concluya que el árbol del aseador está protegido está leyendo mal. Lo
que protege el criterio 6 son las otras dos compuertas.

---

## 3. EL DIFF DEL ÁRBOL DEL ASEADOR, PEGADO

Desde la base de la rama de la fase, que son cincuenta y nueve commits y catorce planes, no desde
el último commit:

```
$ git merge-base HEAD main
d022c94cf90af247734b6ef811d639c6ed29baa6

$ git diff --name-only d022c94..HEAD -- 'app/(cleaner)'

$ git diff --name-only d022c94..HEAD -- 'app/(cleaner)' | wc -l
       0
```

**Vacío.** Y el mismo diff sobre los cinco specs del aseador:

```
$ git diff --name-only d022c94..HEAD -- 'e2e/aseo-*.spec.ts' \
    e2e/mis-pagos.spec.ts e2e/push-instalacion.spec.ts | wc -l
       0
```

**También vacío**, y las cinco corridas juntas dan **23 pasando · 1 saltado · 0 rojos**, la misma
cifra con la que la Fase 7 cerró. Es evidencia de comportamiento que no costó nada: son suites que
nadie tocó y que siguen diciendo lo mismo.

---

## 4. LAS CUATRO SUITES, CON LA BASE RESETEADA Y EL ÁRBOL QUIETO

Medidas el 2026-09-18, con `npm run db:reset` antes de la corrida completa y `PLAYWRIGHT_PORT=3210`:

| Capa | Al cerrar la Fase 7 | Al cerrar la Fase 8 | Delta |
|---|---|---|---|
| **pgTAP** | 376 en 12 archivos | **380 en 12 archivos**, `Result: PASS` | **+4**, exactamente el bloque P |
| **Unitarios** | 1201 en 63 archivos | **1244 en 65 archivos** | **+43** en **+2 archivos**: `checkouts.test.ts` y `feeds.test.ts` |
| **Integración** | 196 en 22 archivos | **205 en 23 archivos** | **+9** en **+1 archivo**: `panel-aseo.integration.test.ts` |
| **E2E** | 134 pasando · 1 saltado | **152 pasando · 1 saltado · 1 rojo** | **+18 casos** |

**Los cuatro deltas cuadran con lo que el plan predijo**, y el de los archivos es el que más dice:
los dos módulos de dominio nuevos, el de integración del panel de aseo, y cero archivos pgTAP
nuevos porque el bloque P entró al final del que ya existía.

**Los guardarraíles, todos limpios:**

```
npm run db:types:check   sin deriva
npm run ci:arch          check-service-role: OK · check-max-w-tallas: OK · check-escala-movil: OK
npm run db:lint          No schema errors found
npm run db:advisors      No issues found
npx tsc --noEmit         limpio
npm run lint             0 errores, los mismos 2 avisos preexistentes de archivos de test
npm run build            Compiled successfully
```

### El rojo, y no se cuenta como regresión de la fase

**El plan pedía cero rojos en las cuatro, sin excepción. La E2E tiene uno, y esto es lo que se midió
en vez de aceptarlo por herencia.**

Se corrieron **dos suites completas**, las dos con la base reseteada antes. **Dieron rojos
distintos**, y ese hecho es la mitad del argumento:

| Corrida | Resultado | El rojo |
|---|---|---|
| 1 | 152 pasando · 1 saltado · 1 rojo | `e2e/operacion.spec.ts:390`, el toast de cancelación |
| 2 | 152 pasando · 1 saltado · 1 rojo | `e2e/push-instalacion.spec.ts:215`, la notificación real |

**Ninguno es de esta fase, y los dos están en `deferred-items.md` con su medición previa.**

**`operacion.spec.ts:390`, medido acá de nuevo y no heredado.** La medición decisiva es correr el
archivo **sin ninguno de los casos nuevos de la fase**:

```
$ PLAYWRIGHT_PORT=3210 npx playwright test e2e/operacion.spec.ts --grep-invert "CRITERIO"
  1 failed   ← :390
  8 passed

$ PLAYWRIGHT_PORT=3210 npx playwright test e2e/operacion.spec.ts --grep "CRITERIO"
  7 passed
```

**El rojo sale igual sin los once casos que esta fase escribió, y los siete casos nuevos del archivo
pasan solos.** La causa está medida por 08-13: la pila de toasts no drena entre casos y la librería
deja de renderizar nuevos con más de tres apilados. El arreglo correcto es drenar la pila en el
`beforeEach`, **no aflojar la aserción**, y no es trabajo de una compuerta.

**`push-instalacion.spec.ts:215` es todavía más claro:** vive en una suite cuyo diff de fase es
**vacío**, y 08-02 lo midió con el árbol bit a bit el de antes de la fase. Corriendo ese archivo
solo, o las cinco suites del aseador juntas, **da 0 rojos**. Es un defecto de la corrida completa,
no del producto.

**Lo que NO se hace acá:** contarlos como verdes, ni declarar la suite "en su línea base con un
pendiente". Son dos inestabilidades reales del arnés de pruebas, están escritas, y tienen dueño
propuesto.

---

## 5. EL CRUCE DEL INVENTARIO, FILA POR FILA

**Es el criterio 5 literal, y es binario.** El inventario de `08-02-MEDICION.md` §5.2 y §5.3
clasificó veintitrés filas en tres casillas. Esto es lo que es verdad hoy en cada una.

**Cómo se comprobó, y no a ojo:** se sacó la versión del spec en la base de la rama
(`git show d022c94:e2e/finanzas.spec.ts`), se listaron los rangos de todos los hunks del diff de la
fase (`git diff -U0 d022c94..HEAD`), y se cruzó cada número de línea del inventario contra esos
rangos. **Una fila SIGUE VÁLIDA que cayera dentro de un hunk sería un hallazgo.** Ninguna cayó.

### §5.2 · los once puntos del grep

| # | Línea base | Casilla | Qué es verdad hoy | Veredicto |
|---|---|---|---|---|
| 1 | `finanzas:202` | SIGUE VÁLIDA | Intacta, hoy en `:283`. Fuera de todo hunk | ✅ |
| 2 | `finanzas:215` | SIGUE VÁLIDA | Intacta (es un comentario), hoy en `:296` | ✅ |
| 3 | `finanzas:224` | SIGUE VÁLIDA | Intacta, hoy en `:305`. La tabla del día sigue sin columnas de dinero | ✅ |
| 4 | `finanzas:464` | SIGUE VÁLIDA | Intacta, hoy en `:545` | ✅ |
| 5 | `finanzas:549` | SIGUE VÁLIDA | Intacta, hoy en `:630` | ✅ |
| 6 | `finanzas:631` | **EN RIESGO** | Retargeteada a `getByRole('dialog')`, hoy en `:767`. **Señuelo 5 de 08-11**, rojo real citado | ✅ |
| 7 | `finanzas:635` | **EN RIESGO** | Retargeteada, hoy en `:770`. **Señuelo 6 de 08-11** | ✅ |
| 8 | `finanzas:660` | SIGUE VÁLIDA | Intacta, hoy en `:909` | ✅ |
| 9 | `finanzas:725` | SIGUE VÁLIDA | Intacta, hoy en `:974` | ✅ |
| 10 | `finanzas:794` | SIGUE VÁLIDA | Intacta, hoy en `:1043` | ✅ |
| 11 | `operacion:528` | SIGUE VÁLIDA | Intacta, hoy en `operacion:545`. Ya acotaba por el panel: es el precedente que el barrido generalizó | ✅ |

**Y el grep que lo cierra:** `locator('main')` en `e2e/finanzas.spec.ts` pasó de **dos usos de
código a cero**. La única coincidencia que queda es un comentario en `:47` que explica el hallazgo.

### §5.3 · las doce aserciones de la ficha de aseadora

| # | Línea base | Casilla | Qué es verdad hoy | Veredicto |
|---|---|---|---|---|
| **a** | `:589` | EN RIESGO | Retargeteada a `pulsarHastaNavegar()` + aserción de URL después, hoy en `:671` y `:678`. **Su contra-prueba faltaba, y 08-14 la corrió** | ✅ |
| **b** | `:592` | SIGUE VÁLIDA | **Intacta, y es la más importante del archivo.** Hoy en `:681`. Es la que atrapa que abrir un panel le cambie el periodo al admin (Pitfall 2). Aparece en el diff como contexto, sin `+` ni `−` | ✅ |
| **c** | `:596` | EN RIESGO | Los cuatro encabezados de grupo de §9.1 acotados al diálogo, hoy en `:702-704`. **Señuelo 7 de 08-11** (`EN EL PERIODO ABIERTO` renombrado) | ✅ |
| **d** | `:597` | MUERE | **Borrada.** Razón escrita en el bloque de `:724-740`. Sustituto: `/finanzas/aseos?aseador={id}` | ✅ |
| **e** | `:598` | MUERE | **Borrada**, misma razón. Sustituto: `/finanzas/pagos`, con sus casos 909, 974 y 1043 | ✅ |
| **f** | `:599` | MUERE | **Borrada**, misma razón. Sustituto: `&filtro=con-gastos` | ✅ |
| **g** | `:606` | MUERE | **Borrada.** Sustituto **parcial** declarado: el rótulo `Lleva ganado` del grupo 4, que sí se afirma | ✅ |
| **h** | `:611` + `:616-617` | MUERE | **Borradas.** **Pérdida de fondo declarada:** eran la única aserción del repo que comprobaba que el bloque de pagos IGNORA el filtro de periodo de arriba | ✅ |
| **i** | `:620-625` | EN RIESGO | Acotada al diálogo, hoy en `:745-751`, y **más estricta** que antes. **Su contra-prueba faltaba, y 08-14 la corrió** | ✅ |
| **j** | `:627` | MUERE | **Borrada, y ESTA ES LA PÉRDIDA REAL SIN SUSTITUTO.** Razón escrita en `:752-762` | ✅ |
| **k** | `:631` | EN RIESGO | La misma fila 6 de §5.2 | ✅ |
| **l** | `:635` | EN RIESGO | La misma fila 7 de §5.2 | ✅ |

**Recuento final: 5 EN RIESGO (las cinco con contra-prueba corrida), 6 MUEREN (las seis borradas,
ninguna comentada, cada una con su razón en su sitio) y 1 SIGUE VÁLIDA.** Cuadra con el recuento
de 08-02.

**Y la comprobación de que "borrada" quiere decir borrada:**

```
$ grep -c "Sus aseos del periodo"   e2e/finanzas.spec.ts   0
$ grep -c "Sus pagos mes a mes"     e2e/finanzas.spec.ts   0
$ grep -c "Sus gastos reportados"   e2e/finanzas.spec.ts   0
$ grep -rn "Al momento de abrir esta" e2e/
  e2e/finanzas.spec.ts:754   ← prosa que explica la muerte, no código comentado

$ grep -n "^\s*//\s*\(await \)\?expect(" <los cinco specs de la fase>
  (vacío)
```

**Cero aserciones comentadas en los cinco specs que la fase tocó.** Lo que hay en su lugar es prosa
que dice qué murió y por qué.

**El criterio 5 cierra en verde.** Ninguna fila quedó sin cuadrar.

---

## 6. LA AUDITORÍA DE SEÑUELOS, Y LOS DOS QUE FALTABAN

### Los cuatro de base: estaban, y con sus radios corregidos

La bitácora de `11_financiero.test.sql` los tiene anotados por 08-01 como entradas **7, 8, 8b, 9 y
10**. **La evidencia de que se corrieron de verdad y no se predijeron son las dos correcciones**: la
8b dice que quitarle el `not` a la guarda **no deniega a todo el mundo sino que deja pasar a
cualquiera**, al revés de lo que el plan había escrito; y la 9 dice que el radio de
`and c.state = 'completada'` es de tres aserciones y no de una, porque los dos aseos del bloque
están vivos. **Un señuelo predicho no se corrige a sí mismo.**

**Ninguno fue del tipo de los hallazgos 1 y 2 de la Fase 7**, y el archivo explica por qué: la
función es nueva y no hay ningún CHECK ni ningún índice sosteniendo sus garantías por detrás.

### Los de interfaz: veinticinco anotados, y dos que no estaban

| Plan | Señuelos con rojo real en su SUMMARY |
|---|---|
| 08-11 | **9** |
| 08-12 | **8** |
| 08-13 | **8** |
| **08-14** | **2**, los que el cruce encontró sin contra-prueba |

**El hueco, y cómo se encontró.** 08-02 clasificó **cinco** aserciones EN RIESGO en §5.3. 08-11
corrió señuelos de **tres** (los números 5, 6 y 7 de su tabla) y escribió que cubría las cinco. Las
filas **a** y **i** se quedaron sin contra-prueba. Nadie lo iba a notar, porque el recuento no lo
hace ningún plan hasta la compuerta.

**Los dos se corrieron acá, con su rojo real, y se revirtieron:**

| Fila | Qué se rompió | Qué se puso rojo |
|---|---|---|
| **a** | `FilaAseadora.tsx` compone el destino **sin** `aseadora: fila.aseadoraId` | `Error: La navegación de cliente no dejó la URL en /aseadora=[0-9a-f-]{36}/ tras 15000 ms. Sigue en http://127.0.0.1:3210/finanzas?rango=dia&ancla=2026-08-03` |
| **i** | `PanelAseadora.tsx` pinta el `<dd>` del estado **dos veces** | `Error: el grupo dice exactamente uno de los tres estados (§8.4)` · `Expected: 1` · `Received: 2` |

Y la vuelta al verde, que es la otra mitad del procedimiento:

```
$ git status --short
  (vacío)
$ PLAYWRIGHT_PORT=3210 npx playwright test e2e/finanzas.spec.ts --grep "el panel tiene sus cuatro grupos"
  1 passed (21.7s)
```

**Ninguno de los dos tuvo un radio distinto al previsto**, y ninguno destapó una segunda capa
sosteniendo la garantía. Son dos promesas que pasan a tener recibo.

### La entrada de bitácora, con el hallazgo más transferible de la fase

Se añadió a `11_financiero.test.sql` la contabilidad de la Fase 8 y, sobre todo, **la evidencia del
verde falso que 08-11 imprimió**, porque le va a volver a pasar a quien añada un panel en la Fase 9:

```
✓  1 CONTROL: el señuelo SI está dentro del panel
✓  2 CASO A · ambito viejo: pasa en VERDE con la palabra prohibida dentro del panel
✘  3 CASO B · ambito nuevo: se pone ROJO con el mismo señuelo
```

**Una aserción acotada por un contenedor que el portal deja vacío pasa sin mirar nada.** No es un
test que alguien debilitó: es un test que se debilitó solo, el día que la ficha pasó de página a
panel. Y la otra mitad, que nadie escribe: con un panel abierto, Base UI marca el resto del
documento como oculto al árbol de accesibilidad, así que un `toHaveCount(0)` sobre la **página de
detrás** también pasa por no ver nada. Para eso hay que leer del DOM, nunca por rol.

Va en el archivo de pgTAP y no solo en un spec porque vale para cualquier aserción de seguridad de
este repo que se ejerza con un panel encima.

### La nota de higiene del bloque L: estaba, y estaba incompleta

La nota que 08-08 dejó **sí está** en el bloque L, con los nombres de las tres funciones de base sin
llamador (`aseos_de_aseadora`, `gastos_de_aseadora`, `pagos_de_aseadora`) y su razón para no
borrarlas.

**Lo que no estaba:** la compuerta midió los consumidores de verdad y encontró dos huérfanos más, y
los dos son componentes, no funciones:

```
$ grep -rl "FichaAseadora" app lib components e2e
  app/(admin)/finanzas/_components/FichaAseadora.tsx     ← él mismo, y nadie más

$ grep -rl "BloqueAhoraMismo" app lib components e2e
  .../FichaAseadora.tsx   .../PanelAseadora.tsx   .../BloqueAhoraMismo.tsx
```

`PanelAseadora` solo importa `estadoDeAhoraMismo`. **La función `BloqueAhoraMismo` tenía un único
importador y era `FichaAseadora`, que no tiene ninguno.**

**Y tiene una consecuencia que no es de higiene sino de cobertura:** la línea
`Al momento de abrir esta página.` vive **solo** dentro de esa función huérfana. No es que su
aserción muriera y el producto lo siguiera diciendo por otro lado: **el fechado del dato ya no tiene
ningún camino de render.** La pérdida que 08-11 declaró es real por partida doble.

**No se borran desde acá.** Este plan es una puerta y su diff son documentos y comentarios.

---

## 7. LA DEUDA, ESCRITA EN EL SITIO DONDE ESTE PROYECTO LA GUARDA

Los diez puntos de `08-UI-SPEC.md` §17 ya están en el contrato y **no se duplicaron**. Lo que salió
de **ejecutar** quedó en `deferred-items.md` de la fase, en cinco puntos:

| # | Qué | Lo esencial |
|---|---|---|
| 1 | **Cobertura perdida sin sustituto** | `Al momento de abrir esta página.` fijaba D-14. Ninguna prueba afirma ya que el admin sepa de cuándo es ese dato. **No se cuenta como cobertura preservada** |
| 2 | **Los dos señuelos que faltaban** | Corridos acá, con su rojo. Y la lección: el recuento de señuelos contra el inventario cuesta un minuto y nadie lo hace hasta la compuerta |
| 3 | **La ráfaga de Realtime** | Medida por 08-07: **1 o 2 refrescos** en una ráfaga de quince, **6 a 12 firmas**, no 90. El riesgo estaba sobrestimado por un orden de magnitud. Palanca nombrada: **acotar el disparo del refresco**, NO reducir el contrato de las seis firmas |
| 4 | **El enlace externo roto** | `/finanzas/aseadoras/{id}` pasa a dar 404. Sin redirect de compatibilidad, decidido (A7, T-08-38 en `accept`) |
| 5 | **Código huérfano** | `FichaAseadora.tsx` entero y la función `BloqueAhoraMismo`, con sus nombres y la advertencia de leer el punto 1 antes de borrar |

---

## 8. LO QUE LA FASE 9 TIENE QUE SABER

Escrito en `deferred-items.md` bajo su propio encabezado, que es donde la Fase 9 lo va a leer al
empezar. `08-UI-SPEC.md` §17 no basta: la Fase 9 no va a leer el contrato de la 8.

**(a) Un enlace a un aseo ya borrado abre la lista sin panel y sin decir por qué.** §17.2 lo decidió
así y el caso que lo afirma está verde (`apartamentos-lista:881`). **Hoy es inofensivo porque nada
se borra. La Fase 9 es la que empieza a borrar**, y a partir de ahí el admin ve la lista del día sin
saber que lo que buscaba ya no está, y **la lectura no distingue "lo borró la retención" de "te
equivocaste de identificador"**, que son dos cosas que el admin necesita distinguir.

Lo que la Fase 9 tiene que decidir: si el panel de un identificador purgado dice algo, y de dónde
saca que fue la purga. **Y si decide que no dice nada, que lo escriba**, porque la decisión de §17.2
se tomó con un supuesto que la Fase 9 rompe.

**(b) Las tres funciones de base sin llamador se conservan a propósito**, con sus aserciones vivas
en `11_financiero.test.sql`. Si la Fase 9 hace limpieza de schema, no tiene que adivinar si sobran.
Y el código que **sí** es candidato a borrado son los dos huérfanos del punto 5.

---

## 9. LO QUE ESTA FASE DESCUBRIÓ Y NINGUNA SUITE VEÍA

Es lo más valioso que deja, y no cabe en ninguna cifra de aserciones.

1. **El verde falso del ámbito viejo, impreso.** La aserción de no rastreo pasaba en verde **con la
   palabra prohibida dentro del panel**, desde el día que 08-08 convirtió la ficha en panel. No la
   debilitó nadie.
2. **El spike del criterio 1 salió al revés de lo que se temía Y al revés de lo que se esperaba.**
   El filtro **sobrevive** entero; el **scroll se pierde**; y el culpable es `loading.tsx` del
   segmento, aislado apartando el archivo: con él, 1057 → 0 tres de tres; sin él, 1057 → 1057 tres
   de tres. La fase borró exactamente dos.
3. **El enlace que ABRE también borraba los parámetros del anfitrión**, no solo el que cierra. El
   research lo describía solo sobre el cierre. Componer bien el cierre no sirve de nada si el `href`
   de apertura ya se llevó el filtro por delante.
4. **El panel de un aseo con evidencia de verdad reventaba en el servidor**, y llevaba así desde
   08-07. `TiraDeEvidencia` (servidor) llamaba a una función exportada desde un módulo `'use
   client'`. No lo vio nadie porque **ningún escenario de prueba había subido un byte al bucket**,
   así que las siete fotos del andamio caían en `firma_fallida` y esa rama no se ejecutaba nunca.
   Es la clase de verde que esta fase existe para desconfiar.
5. **El control de método de la prueba de fuga de la Fase 7 no podía dispararse nunca**: buscaba la
   cifra solo en el formato crudo, y el entero crudo no viaja porque el formateo ocurre en el
   servidor. **La prueba habría pasado en verde con la fuga abierta.** Los dos casos nuevos buscan
   en los dos formatos y sobre el cuerpo de las respuestas.
6. **El pico real de una ráfaga de Realtime son 12 firmas, no 90.** El debounce de 400 ms de la
   Fase 4 ya lo resolvía.
7. **Dos señuelos de la casilla EN RIESGO se declararon corridos sin serlo**, y el único sitio donde
   eso se puede ver es el cruce del inventario.

---

## 10. LO QUE NO SE TOCA, Y SIGUE ABIERTO

**La Fase 7 sigue abierta en su único checkpoint humano: el recorrido de nueve puntos en un iPhone
real del plan `07-13`.** Esta fase **no lo cierra y no lo toca**, y su preparación sigue intacta en
`.planning/STATE.md`. Todo lo automatizable de la Fase 7 está en verde desde el 2026-09-13; lo único
que falta es ese recorrido.

---

## Deviations from Plan

### 1. [Alcance del orquestador] `STATE.md` y `ROADMAP.md` no se tocaron

- **Encontrado durante:** Task 3.
- **Situación:** la Task 3 del plan pide actualizar los dos archivos. **La instrucción de ejecución
  dice explícitamente que el orquestador es su dueño y que este plan no los modifique.** La
  instrucción manda sobre el plan.
- **Qué se hizo:** todo el contenido que les corresponde está escrito acá (la tabla de las cuatro
  suites con línea base y delta en §4, lo que la fase descubrió en §9, el recordatorio del
  checkpoint abierto de la Fase 7 en §10) y en `deferred-items.md` (la deuda y las consecuencias
  para la Fase 9). **Lo que queda pendiente para el orquestador** es la posición de la fase, la
  tabla de progreso de `ROADMAP.md` (`8. Paneles laterales en el admin | 14/14`) y la lista de
  catorce planes de la sección de la fase.
- **Files modified:** ninguno de los dos.

### 2. [Regla 2 - Cobertura] Los dos señuelos que faltaban se corrieron en vez de declararse

- **Encontrado durante:** Task 2, el cruce del inventario.
- **Problema:** dos de las cinco filas EN RIESGO de §5.3 (la **a** y la **i**) no tenían
  contra-prueba anotada en ningún SUMMARY. La INSTRUCCION 8 dice que una aserción retargeteada sin
  su señuelo corrido **no cuenta**, así que declararlo como hueco habría dejado dos quintas partes
  del barrido sin respaldo y el criterio 5 sin cerrar.
- **Arreglo:** se corrieron los dos, se comprobó el rojo, se revirtieron, y se comprobó la vuelta al
  verde. Las salidas están en §6.
- **Files modified:** ninguno de forma permanente. Los dos señuelos tocaron `FilaAseadora.tsx` y
  `PanelAseadora.tsx` y **están revertidos**: `git status --short` vacío.

### 3. [Regla 2 - Correctitud del registro] La nota de higiene del bloque L se amplió

- **Encontrado durante:** Task 2, punto (e).
- **Problema:** el plan pedía comprobar que la nota estuviera, con los nombres y la razón. **Está, y
  su enumeración del lado de TypeScript era incompleta**: `FichaAseadora.tsx` entero y la función
  `BloqueAhoraMismo` también se quedaron sin consumidor y no figuraban. Esa nota existe justamente
  para que quien audite el schema no tenga que adivinar, así que una nota incompleta es peor que
  ninguna.
- **Arreglo:** se amplió con los dos nombres, la medición de consumidores, y la advertencia de que
  ahí vive la única copia de la línea que fechaba el dato.
- **Files modified:** `supabase/tests/11_financiero.test.sql` (solo comentarios: 380 aserciones,
  cero `not ok`).

### Auth gates

Ninguno.

## Known Stubs

Ninguno. Este plan no escribe producto.

## Threat Flags

Ninguno de superficie nueva: cero cambios de código.

**Y los seis del registro se cubrieron:**

| Amenaza | Cómo se cerró |
|---|---|
| T-08-67 · un archivo del árbol del aseador tocado en alguno de los catorce planes | Diff desde la base de la rama, **vacío**, con su salida pegada en §3, más las cinco suites verdes sin tocarse |
| T-08-68 · el verde del script de escala móvil leído como evidencia del criterio 6 | Escrito en §2 y en `08-VALIDATION.md`, con su razón: su grep recorre solo el árbol que la fase no toca |
| T-08-69 · una aserción sin señuelo corrido, o con uno que no puso nada en rojo | Los cuatro de base auditados (con sus dos radios corregidos como prueba de que se corrieron), los veinticinco de interfaz contados, **y los dos que faltaban corridos acá** |
| T-08-70 · una aserción EN RIESGO que nunca se retargeteó | Cruce fila por fila, veintitrés filas, comprobando los rangos de hunks contra los números del inventario. Ninguna sin cuadrar |
| T-08-71 · la frontera del aseador rota sin que ningún diff lo delate | El bloque P en verde (aserciones 102 a 105) más las 15 y 16 intactas. El diff solo dice que no se tocó |
| T-08-72 · deuda de ejecución perdida entre catorce SUMMARY | Cinco puntos en `deferred-items.md`, más las dos consecuencias para la Fase 9 bajo su propio encabezado |

---

## Self-Check: PASSED

**Archivos declarados, comprobados en disco:**

- `.planning/phases/08-paneles-laterales-en-el-admin/08-VALIDATION.md` — FOUND, con
  `nyquist_compliant: true`
- `supabase/tests/11_financiero.test.sql` — FOUND
- `.planning/phases/08-paneles-laterales-en-el-admin/deferred-items.md` — FOUND
- `.planning/phases/08-paneles-laterales-en-el-admin/08-14-SUMMARY.md` — FOUND

**Criterios de aceptación, medidos:**

```
git diff --name-only d022c94..HEAD -- 'app/(cleaner)' | wc -l          0
git diff --name-only d022c94..HEAD -- los cinco specs del aseador      0
npm run db:test                                     380 · Result: PASS · 0 not ok
npm run test:unit                                   1244 en 65 archivos
npm run test:integration                            205 en 23 archivos
npx playwright test                                 152 pasando · 1 saltado · 1 rojo declarado
npm run ci:arch / db:lint / db:advisors / tsc / lint / build   limpios
grep "referencia faltante|❌" en 08-VALIDATION.md                       0
señuelos de la fase sin correr                                          0
filas del inventario sin cuadrar                                        0
celdas de la tabla de criterios que dicen "a mano"                      0
```

**Los dos señuelos, comprobados como revertidos:**

```
git status --short                     (vacío)
git diff -- FilaAseadora.tsx           (vacío)
git diff -- PanelAseadora.tsx          (vacío)
el caso vuelve al verde                1 passed (21.7s)
```
