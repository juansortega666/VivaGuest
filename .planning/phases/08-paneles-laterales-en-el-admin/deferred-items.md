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
