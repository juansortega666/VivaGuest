# Fase 8 · Hallazgos fuera de alcance

Cosas que se encontraron ejecutando planes de esta fase y que **no son de esta
fase**. Se anotan aqui para que nadie las arregle de refilon dentro de un plan que
no las tiene en su alcance, y para que nadie las descubra otra vez.

---

## 1. `push-instalacion.spec.ts:215` (caso E2) se cae en la suite completa, y solo ahi

**Encontrado:** plan 08-02, Task 3, corriendo la linea base de E2E.
**Estado del arbol cuando aparecio:** bit a bit el de antes del plan. El unico
archivo distinto era `08-02-MEDICION.md`, que vive en `.planning/` y no entra en
ningun build. **No puede ser una regresion de este plan.**

**Sintoma:** `El service worker no mostró ninguna notificación` tras 15 s de
sondeo, en `entregarPush()`.

**Reproducibilidad medida:**

| Como se corrio | Resultado |
|---|---|
| `npm run test:e2e` completo, con `db:reset` antes | **133 pasando, 1 saltado, 1 ROJO** (E2) |
| `npm run test:e2e` completo, segunda vez, con `db:reset` antes | **133 pasando, 1 saltado, 1 ROJO** (el mismo) |
| Solo `e2e/push-instalacion.spec.ts` | **5 pasando, 1 saltado, 0 rojos** |
| Las cinco suites del aseador juntas (`aseo-checklist`, `aseo-ejecucion`, `aseo-evidencia`, `mis-pagos`, `push-instalacion`) | **23 pasando, 1 saltado, 0 rojos** |

**Lectura:** el caso entrega un push por el protocolo de DevTools a un service
worker vivo y observa `registration.getNotifications()`. En una corrida completa
son ~3,7 minutos y 134 casos antes de llegar ahi, sobre el mismo perfil de
navegador. El estado acumulado del service worker (o del canal de DevTools) es lo
unico que cambia entre las dos formas de correrlo.

**Lo que NO es:** no es la base (se reseteo antes de las dos corridas completas),
no es el puerto (3210 propio en las cuatro), y no es codigo de esta fase (diff
vacio sobre `app/(cleaner)` y sobre todo lo demas).

**Consecuencia para la linea base de la fase:** la linea base escrita en los
planes (**134 pasando, 1 saltado**) solo se observa corriendo los archivos por
grupos. En la suite completa, hoy, son **133 pasando, 1 saltado y 1 rojo
reproducible en `push-instalacion:215`**. Los planes que afirmen "la suite E2E en
su linea base" tienen que contar con este rojo, o el plan 08-14 lo va a leer como
una rotura de la fase.

**Quien deberia arreglarlo:** no esta fase. Es del arbol del aseador, que D8-10
saca del alcance por completo y cuyo diff tiene que quedar vacio. Candidato
natural: un plan de estabilidad de la suite, o la Fase 9.

**Pista para quien lo arregle:** el propio `entregarPush()` limpia la bandeja al
final de cada entrega, y su comentario explica por que lo hace ahi y no en un
`afterEach`. El sospechoso no es la bandeja sino el `registrationId` que
`registroDelWorker()` resuelve: tras muchas navegaciones el worker se puede haber
reactivado con otro registro, y `ServiceWorker.deliverPushMessage` entregaria a un
registro que ya no es el que la pagina observa.

---

## Plan 08-07 · Dos mitades que el contrato de §5.3 no deja cerrar aquí

Las dos salieron de construir el panel de aseo, las dos son de la fila de
`/operacion`, y las dos se quedan fuera **por la misma razón**: §5.3 cierra por
nombre lo que este plan puede tocar de `FilaAseo.tsx` (*"si el diff toca el
`className` de `TableRow` (…) se salió del contrato"*), y las dos lo exigen.

### 1. La fila con el panel abierto se marca por un solo canal, no por dos

§13.1 pide que la fila que abre el panel lo diga **mientras el panel está
abierto**, con `aria-current` **además del** `bg-canvas` de §4.3, y su argumento
es literal: *"color solo no dice cuál está abierta"*. Y al revés también: el
`aria-current` solo no se ve.

Lo que quedó puesto: `aria-current`. Lo que falta: el fondo, que es una clase
sobre el `TableRow`. `TablaApartamentos.tsx` ya tiene las dos mitades desde
08-06, así que hoy las dos listas de la fase se comportan distinto.

**Quién debería cerrarlo:** 08-12 (barrido visual) o 08-13 (accesibilidad), que
son los que sí pueden tocar la clase de la fila. Es una línea:
`esAbierta && 'bg-canvas'`, con `esAbierta` ya calculado en el archivo.

### 2. Dos aseos del mismo apartamento tienen el MISMO nombre accesible

**Medido el 2026-09-17**, con el andamio de la parte (d) de este plan: con un
aseo en `Atrasados` y otro en `Hoy` sobre la misma unidad, el localizador por
nombre accesible `Ver el aseo de {nombre}` resuelve a **2 elementos**, y
Playwright falla por ambigüedad. En producción el síntoma es peor que en la
prueba: un usuario de lector de pantalla oye dos enlaces con el mismo nombre y
ninguna forma de saber cuál es cuál.

**No se arregló acá a propósito.** La cadena es literal del contrato: §5.3
Pitfall 5 y el plan 08-07 la escriben como `Ver el aseo de {nombre}`, y el plan
08-11 va a escribir sus aserciones contra esa cadena. Cambiarla por mi cuenta
rompería las dos cosas a la vez.

**El sustituto ya existe en el mismo archivo y no hay que inventarlo:**
`MenuAseo` nombra su botón `Acciones del aseo de {apartamento} del {fecha}`, o
sea que este defecto ya estaba resuelto una vez, al lado. La forma natural es
`Ver el aseo de {nombre} del {fecha}`, con `formatFechaBog`.

**Quién debería cerrarlo:** 08-13 (accesibilidad), que es quien puede reabrir la
cadena del contrato, coordinado con 08-11 para que sus aserciones nazcan ya con
la forma nueva.

---

## `e2e/operacion-alertas.spec.ts:341` se pone rojo entre medianoche y las 04:01, todos los días

**Encontrado por 08-11, en la regresión completa de la wave. No es de este plan
y no se arregló: el diff de 08-11 no toca ni una línea de alertas.**

El caso afirma el orden cronológico de las siete alertas del panel. Dos de las
siete se fechan así:

| Alerta | Instante que la ordena | De dónde sale |
|---|---|---|
| `HORA LÍMITE VENCIDA` | **hoy a las 00:01** | la `hora_limite` que el propio caso siembra |
| `CALENDARIO CAÍDO` | **ahora menos cuatro horas** | `fijarSaludDeSync()`, `e2e/fixtures.ts:993` |

El caso da por sentado que la hora límite vencida es la más antigua de las siete,
y lo dice en su comentario: *«el más antiguo de los siete, y por eso va último en
el orden esperado»*. **Eso solo es cierto a partir de las 04:01.** Antes de esa
hora, `ahora − 4h` cae en el día anterior y pasa a ser la más antigua, así que
las dos se intercambian.

**Medido el 2026-09-18 a las 00:21**, 4 corridas de 4 en rojo, con este diff:

```
-   "CALENDARIO CAÍDO",
    "HORA LÍMITE VENCIDA",
+   "CALENDARIO CAÍDO",
```

**El orden que la pantalla pintó es el CRONOLÓGICAMENTE CORRECTO.** Ayer a las
20:21 es anterior a hoy a las 00:01. El producto ordena bien; lo que está mal es
la expectativa del caso, que codifica una suposición sobre la hora a la que se
corre la suite.

**El arreglo no es aflojar la aserción.** Es quitarle al caso su dependencia del
reloj: fechar la caída del calendario con un desfase que la deje siempre del lado
correcto de las 00:01 del día de negocio, o derivar el orden esperado de los
instantes sembrados en vez de escribirlo a mano. Lo que **no** vale es ordenar
por tipo ni comparar conjuntos en vez de secuencias: el caso existe justamente
para afirmar que el orden es cronológico y no por tipo.

**Quién debería cerrarlo:** 08-13, que es el plan que toca casos E2E. Y
`08-14` tiene que saberlo para no contar este rojo como regresión de la fase:
la misma suite, corrida después de las 04:01, da 134 en verde.

---

## Los dos huecos de contrato que 08-10 mandó a «08-12», y que este 08-12 no puede cerrar

**Encontrado por 08-12, leyendo sus dependencias. No es un descubrimiento nuevo:
es una redirección de destinatario.**

El SUMMARY de 08-10 deja dos decisiones de contrato *«para el barrido visual de
08-12»*, y el SUMMARY de 08-11 se dirige a *«08-12 (el barrido visual)»*. **El
plan 08-12 que se ejecutó no es un barrido visual:** es el plan de aserciones de
los criterios 1, 2 y 3, y su `files_modified` es exactamente un archivo,
`e2e/apartamentos-lista.spec.ts`, con una prohibición explícita de que el diff
contenga otro. Los dos huecos son cambios de **producto**, así que quedan aquí.

### a) Dos botones `Conectar calendario` en la misma pantalla

El estado vacío del panel de calendario pinta su acción (§11.2) y el pie del
panel se pinta **sin condición** (§8.2), así que con un apartamento sin feed el
admin ve el mismo botón dos veces. 08-10 lo midió en el DOM y no lo arregló, con
razón: no se pueden conciliar en ejecución, porque el pie se decide **antes** de
que llegue el dato y con lo que hay en ese momento no se distingue *«no hay fila
de feed»* de *«la fila está apagada»*, que van a cuerpos distintos.

**Recomendación heredada, y este plan la suscribe:** el que se queda es **el
pie**, porque es el único que existe también cuando el panel sí tiene contenido.
Quitarlo del estado vacío es una modificación de §11.2.

### b) `1 fallos seguidos` es agramatical, y es un estado alcanzable

El umbral del feed es **uno**, así que `{N} fallos seguidos` con N igual a uno se
pinta de verdad. El precedente de cómo se resuelve ya está en el repo, en este
mismo archivo de la fase: `rotuloDeDistancia()` de `PanelCalendario.tsx` le dio
clave propia a `mañana` justamente porque *«`dentro de 1 días` es agramatical»*.
La forma correcta es la misma: una rama para el singular (`1 fallo seguido`),
resuelta donde vive el copy.

**Las dos son modificaciones del contrato de copywriting y de §8.2/§11.2, no de
la ejecución.** Quien las cierre tiene que tocar `PanelCalendario.tsx` y
`08-UI-SPEC.md`, y ninguno de los dos está en el alcance de 08-12.

**Quién debería cerrarlas:** 08-13, que es el plan que puede reabrir el contrato,
o un plan de barrido visual si la fase todavía añade uno.

---

## El `tipo_cerradura` no se ve en el camino inicial del estado «sin código»

**Declarado por 08-09 (decisión 5) como hueco para «08-12 y 08-13». 08-12 lo
deja abierto, y con un argumento.**

§7.3 dice que la fila `Sin código` muestra el `tipo_cerradura`. Hoy solo se ve
cuando la acción llegó a responder (o sea cuando el código desapareció entre que
el panel se pintó y el admin pulsó). En el camino inicial no se ve, porque el
contrato de props de `CodigoDeAccesoAdmin` es **identificador más booleano**.

**La decisión de 08-12, escrita para que nadie la vuelva a tomar desde cero:**

1. **Cerrarlo NO viola el criterio 5, y el criterio de aceptación de 08-09 no
   dice lo que parece decir.** Lo que ese criterio protege es que **el valor del
   código** no cruce al árbol del cliente, porque lo que se pasa como prop
   **queda en el documento aunque no se pinte** (y este plan lo acaba de medir en
   rojo: con el código pasado como prop y nunca renderizado, la aserción
   T-08-57 se pone roja). `tipo_cerradura` **no es un secreto**: es una unión
   cerrada de dos valores (`inteligente` · `llave_fisica`) fijada por un CHECK de
   la base, y conocerla no acerca a nadie a abrir una puerta.
2. **Aun así cuesta un viaje.** La lista de apartamentos no lee la tabla de
   secretos y no puede; hoy el panel ya paga `hayCodigoDeAcceso()`, así que la
   forma barata es **cambiar el booleano por la unión**: que esa función
   devuelva `{ hayCodigo, tipoCerradura }` en vez de `boolean`. Cero consultas
   nuevas, y el objeto entero de credenciales sigue sin ser nunca una variable en
   el ámbito de un componente que se renderiza, que es lo que 08-09 protegía.
3. **No se hace aquí** porque toca `_actions.ts`, `PanelApartamento.tsx` y
   `CodigoDeAccesoAdmin.tsx`, y el diff de 08-12 es de un solo archivo de pruebas.

**Quién debería cerrarlo:** 08-13. Y cuando lo cierre, el caso del secreto de
`apartamentos-lista.spec.ts` ya está escrito para atraparlo si se pasa de la
raya: afirma contra el documento entero, y el señuelo que lo pone rojo está
reproducido en el SUMMARY de 08-12.
