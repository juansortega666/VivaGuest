# Fase 7 · Finanzas — Definición

> Escrita con el dueño el **2026-09-13**, en lenguaje de negocio y no de código.
> Es la fuente de verdad de **qué** hay que construir. El cómo viene después.
>
> Si algo del plan técnico contradice este documento, el plan está mal.

---

## El objetivo

**Que el admin tenga visión total de la plata en un solo tablero, sin Excel y sin
cuentas a mano:** cuánto se cobra por cada aseo, cuánto se paga, la diferencia, y
los gastos y daños que ese aseo generó. Con totales filtrables por día, semana y
mes. Y que cada aseador vea en su teléfono **lo que se le va a pagar**, y nada más.

### La frontera, que es la regla más importante de esta fase

> **El aseador ve lo que le llega. Nunca lo que cobramos, ni la diferencia, ni el
> margen de nadie.**

Es una frase del dueño, literal, y ordena todo el diseño: cada pantalla, cada
consulta y cada permiso se juzgan contra ella. Hoy **no se cumple**: un aseador
puede consultar la tarifa que se le cobra al huésped (ver "Lo que hay que
arreglar").

---

## 1. El tablero del admin

Una sección nueva, separada de la operación del día. El aseador no la ve ni sabe
que existe.

### Arriba: los números

Cuatro cifras del periodo que se esté mirando:

| Número | Qué es |
|---|---|
| **Cobrado** | La suma de lo que se le cobra al huésped por cada aseo |
| **Pagado a aseadores** | La suma de lo que se le paga a cada persona |
| **Gastos reembolsados** | Lo que los aseadores compraron y se les devuelve |
| **Ganancia** | Cobrado menos pagado menos gastos |

Los cuatro se recalculan según el filtro activo.

### Abajo: el detalle, aseo por aseo

Cada fila muestra: apartamento, fecha, quién lo hizo, cuánto se cobró, cuánto se
pagó, la diferencia, y si generó gastos o daños. Desde cada gasto se abre su
recibo.

### Los filtros

**Por día, por semana y por mes.** Y además por apartamento y por aseador, para
responder preguntas como "cuánto me dejó el Apto 07 este mes" o "cuánto le pagué a
María en septiembre".

### Lo que NUNCA entra en ningún número

Los apartamentos de gestión externa (las 5 unidades informativas). Ni en los
totales, ni en el detalle, ni en ningún conteo. No son negocio propio.

---

## 2. El cierre de mes

Cada mes se cierra y **queda guardado**. Eso da dos cosas distintas y las dos
importan:

1. **Cuánto se le debe a cada aseador**, para poder pagarle.
2. **El histórico**, para comparar mes contra mes y ver si el negocio crece.

### Cómo funciona

| Regla | Detalle |
|---|---|
| **El periodo va de cierre a cierre** | No del 1 al 31. Si un mes termina en fin de semana, el cierre cae el último día hábil y esos días cuentan en el periodo siguiente. Así nadie se queda sin cobrar |
| **Un aseo cuenta en el periodo en que se terminó** | No en el de su fecha programada. Un aseo del 28 que se hizo el 2 se paga en el periodo del 2 |
| **Un periodo cerrado no se vuelve a calcular** | Aunque después se corrija una tarifa. Es el número que una persona ya cobró |
| **Lo guardado sobrevive al borrado** | Cuando los aseos viejos se borren por antigüedad, el cierre y su desglose siguen ahí |

### Qué se le paga a un aseador

**Sus aseos del periodo, más los gastos que reportó y se le reembolsan.** Sin
descuentos por daños y sin ajustes manuales: eso se conversa, no se automatiza.

Con **desglose**: al abrir el pago de una persona se ve de qué se compone, aseo
por aseo y gasto por gasto, y desde cada gasto se llega a su recibo.

Cada aseo del desglose muestra **las dos fechas**: cuándo estaba programado y
cuándo se hizo. Sin eso, un aseo de enero que aparece en el recibo de febrero
parece un error.

### Marcar como pagado

Un botón para dejar constancia de que ya se le pagó a esa persona, con fecha y
quién lo marcó. Sirve para no pagar dos veces y para saber qué falta.

---

## 3. Lo que ve el aseador

**Una lista de lo que se le va a pagar, y nada más.** En su propia app, donde ya
ve sus aseos.

| Ve | No ve |
|---|---|
| Sus periodos ya cerrados | El periodo en curso |
| Cuánto se le paga en total | Cuánto se le cobra al huésped |
| El desglose de sus aseos | Cualquier margen o diferencia |
| Los gastos que se le reembolsan | El pago de cualquier otro aseador |

**Por qué no ve el periodo en curso:** el acumulado del mes se mueve y puede
**bajar** (si se cancela un aseo ya contado). Un número que baja en el teléfono de
quien lo va a cobrar es una discusión garantizada. Lo cerrado no cambia nunca, así
que es lo único que se puede enseñar sin ambigüedad.

---

## 4. Lo que hay que arreglar de lo que ya existe

### El recibo del gasto se borra antes que el pago

Hoy **todas** las fotos se borran a los 30 días, recibos incluidos. O sea que el
desglose muestra el gasto sin poder abrir el respaldo apenas un mes después.

**Decisión: los recibos se guardan 5 años.** Y no es un capricho, está medido:

| Tipo de foto | Volumen | En un año |
|---|---|---|
| Checklist (≈6 por aseo) | 879 MB/mes | **10,3 GB** |
| Recibos (≈1 por cada 10 aseos) | 15 MB/mes | **0,17 GB** |

**Los recibos son el 1,6% del volumen.** Guardarlos cinco años ocupa **menos de
1 GB**. Lo que llena el almacenamiento son las fotos de checklist, y esas siguen
con su política actual.

*(Cálculo sobre 25 aseos/día y fotos de ~200 KB, que es a lo que el cliente las
comprime hoy.)*

### El aseador puede consultar lo que se le cobra al huésped

Está **medido contra la base de datos**, no es una sospecha: desde una sesión de
aseadora se puede leer la tarifa del huésped. Ninguna pantalla la muestra, pero el
dato viaja al teléfono.

Son dos vías. Una no la usa ningún código y cerrarla es gratis; la otra sí tiene
consumidores y obliga a rehacer cómo el aseador consulta los datos del
apartamento. **Se cierran las dos.** Es la regla de la frontera, y una regla que
solo se cumple en la pantalla no se cumple.

---

## 5. Lo que NO entra en esta fase

Se sacan a issues de GitHub, con su justificación:

| Fuera | Por qué |
|---|---|
| **Impuestos** (IVA, retenciones a aseadores) | No está contemplado en ninguna parte del sistema y cambiaría todos los cálculos. Es una fase propia, no un detalle |
| **Retención legal** (marcar un aseo para que nunca se borre) | No es dinero. Los aseos pasan a historial y con eso basta hoy |
| **Alerta de almacenamiento al 70%** | No es dinero. Pertenece a la fase de borrado automático |
| **Exportar o imprimir el cálculo** | Ya estaba marcado como versión 2 |

---

## 6. Lo que todavía no está definido

- **El histórico de crecimiento.** Comparar mes contra mes está en el objetivo,
  pero no se ha decidido si entra en esta fase o va después, ni cómo se presenta.

*(La interfaz ya está definida: ver la sección final.)*

---

## Cómo se sabrá que la fase quedó bien

1. El admin abre una sola pantalla y ve cuánto cobró, cuánto pagó y cuánto le
   quedó, en el rango que elija.
2. Puede filtrar por día, semana y mes, y por apartamento y por aseador.
3. Al cerrar el mes, sabe exactamente cuánto le debe a cada persona, con el
   desglose de por qué.
4. Un mes cerrado sigue mostrando lo mismo un año después, aunque sus aseos ya se
   hayan borrado.
5. El aseador abre su app y ve lo que se le va a pagar. Y no hay ninguna consulta,
   por ninguna vía, que le devuelva una cifra de huésped.
6. Ningún apartamento de gestión externa aparece en ningún número.

---

# La interfaz, cerrada el 2026-09-13

## Dónde vive

**Una pestaña nueva, `Finanzas`,** junto a Operación, Apartamentos y Aseadores.
La pantalla de operación **no cambia**.

Dentro, dos sub-pestañas: **Resumen** y **Pagos**.

Se usa en **computador y en tablet apaisada**. No hay versión de celular para el
admin, así que nada de botón flotante: los controles van donde se ven siempre.

## Sub-pestaña 1 · Resumen

Un solo filtro arriba, **día / semana / mes**, que manda sobre **toda** la
pantalla. Todo lo de abajo se recalcula con él.

### Bloque 1, arriba · Los KPIs

Los números gruesos del periodo: **cuánto se vendió, cuánto se gastó, cuánto se
pagó a aseadoras y cuánto quedó.**

### Bloque 2, abajo izquierda · Los aseos del periodo

Una card **operativa**, de conteos y no de tabla: cuántos aseos se hicieron,
cuántos generaron gastos, y las cifras que acompañan.

**Es navegable:** tocar un conteo abre la lista detrás de ese número. Tocar
"12 aseos con gastos" abre esos doce, cada uno con su recibo. Lo resumido a la
vista, el detalle a un clic.

### Bloque 3, abajo derecha · El desglose por aseadora

Avatar, nombre y **cuánto cuesta esa persona** en el periodo: lo que se le paga
más lo que se le reembolsa en gastos.

**Con buscador**, para cuando el equipo crezca y la lista deje de caber.

> ### Por qué acá NO va el "revenue por persona"
>
> Era la idea original y se descartó con razón. **El margen sale del apartamento,
> no de quién lo limpió.** Con los datos de hoy, el Apto 08 deja 64.000 y el
> Apto 01 deja 43.000: quien limpie el 08 "rinde" un 50% más sin haber hecho
> nada distinto.
>
> Una pantalla así parece un ranking de desempeño y en realidad es un ranking de
> a quién le tocaron los apartamentos buenos. Se toman decisiones sobre personas
> con un número que no depende de ellas.
>
> Por eso por persona va **lo que cuesta**, que sí es suyo. El margen se lee por
> apartamento, que es de donde sale.

### Al tocar una aseadora

Su ficha, con cuatro cosas:

1. **Sus aseos del periodo** (fecha, apartamento, cuánto se le paga por cada uno)
2. **Sus pagos mes a mes** y si ya se le pagó
3. **Sus gastos reportados**, con el recibo
4. **Qué está haciendo ahora**: si está en un aseo, en cuál y desde cuándo

El punto 4 es dato operativo dentro de una pantalla de plata, y es deliberado:
es la respuesta a "¿dónde está cada miembro de mi equipo?". **Sale de lo que el
sistema ya sabe (qué aseo tiene en curso). No hay rastreo por GPS, y no lo va a
haber.**

## Sub-pestaña 2 · Pagos

Aquí es donde el cierre de mes tiene sentido, y por eso existe.

La **lista de los pagos**: por cada mes cerrado, cuánto se le debe a cada persona
y **si ya se le pagó o no**, con fecha.

Es lo que evita pagar dos veces y lo que responde "¿quién me falta este mes?".

## La diferencia entre las dos, que no es cosmética

| | Resumen | Pagos |
|---|---|---|
| **Qué es** | Una foto en vivo del periodo que filtres | El registro de lo que se debe y lo que se pagó |
| **De dónde salen los números** | Se calculan al vuelo cada vez | Quedan congelados al cerrar el mes |
| **Qué pasa cuando los aseos viejos se borren** | El periodo se vacía | **Sobrevive**: por eso se guarda |

El Resumen **no guarda nada**: es una vista. El cierre mensual, que sí se
persiste, vive en Pagos. Los dos hacen falta y ninguno reemplaza al otro.

## Lo que queda por definir del diseño

- Los colores, las tipografías y el detalle visual de cada bloque.
- Cómo se ven los estados vacíos (un periodo sin aseos, un equipo sin pagos).
- Si el bloque por aseadora usa barras, números a secas, o ambos, y contra qué
  escala se comparan.
