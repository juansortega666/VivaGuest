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
