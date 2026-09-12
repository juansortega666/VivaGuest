---
phase: 06-pwa-del-aseador-offline-first
plan: 10
subsystem: cierre-de-fase
tags: [senal-admin, paridad, e2e, doce-puertas, d-06]

requires:
  - phase: 06-09
    provides: "el recorrido del aseador completo, de la tarjeta al cierre"
  - phase: 06-01
    provides: "`aseo_sin_evidencia_completa()` y la tabla de cuartos saltados"
provides:
  - "Migracion 21: `aseos_sin_evidencia_completa(uuid[])`, la version en lote"
  - "`SenalSinEvidencia`: la cuarta senal inline de la fila del dashboard"
  - "`lib/domain/evidencia-paridad.integration.test.ts`: la deuda del plan 06-03, pagada"
  - "`e2e/aseo-ejecucion.spec.ts`: los once pasos, de la tarjeta a la senal del admin"
affects: []

tech-stack:
  added: []
  patterns:
    - "Una funcion en lote que LLAMA a la escalar en vez de reimplementar su consulta"
    - "El test de paridad compara las dos implementaciones ENTRE SI, no cada una contra un esperado"
    - "Una senal secundaria que falla se degrada; no tumba la pantalla desde la que se trabaja"
---

# 06-10: El cierre de la fase

## Que se construyo

Las tres cosas que solo se podian hacer al final: que el admin vea la evidencia incompleta, que la regla
duplicada no divirja, y el recorrido completo probado.

## La otra mitad de D-06

D-06 permitio saltar un cuarto **a cambio de que el admin lo vea**. Sin esta mitad, el permiso para
saltar no tiene contrapartida: la promesa de evidencia se queda sin nadie que la reclame.

La senal es `ImageOff` de 14px en ambar, como cuarta senal inline de la fila. **No entra al panel de
alertas**, y la razon es estructural y no de inventario: es un **estado** del aseo, no un evento
fechado, y el panel ordena cronologicamente. Un estado ahi o se clava arriba para siempre o hay que
inventarle una fecha. Las dos salidas son peores que una senal en la fila, que es donde el admin ya
mira.

Cero rojo, igual que toda la fase: un aseo sin evidencia completa **no es un fallo de la aseadora**, es
una situacion de campo que el sistema decidio permitir, y de la que ademas sabemos el motivo.

## Una migracion que el plan no listaba, y por que hacia falta

Traer la marca llamando la funcion escalar por fila serian decenas de viajes de red para pintar una
tabla. La alternativa es la migracion 21: `aseos_sin_evidencia_completa(uuid[])`, que recibe la lista
entera y devuelve el subconjunto.

**Y esa funcion no reimplementa la regla: llama a la escalar.** Es la decision central de ese archivo.
Copiar el `exists ... or exists ...` con un `group by` habria sido mas rapido de escribir y estaria
**mal**: seria una TERCERA implementacion de la misma verdad, y sin siquiera el test de paridad que
tienen las otras dos.

Lleva guarda de admin, y la escalar no. La diferencia importa: la escalar responde un booleano sobre UN
aseo y la llama la pantalla del propio aseador; esta devuelve el subconjunto de una lista arbitraria,
que es **la forma exacta de una consulta de barrido**. Sin la guarda, `security definer` la convertiria
en un oraculo.

## El test de paridad encontro una divergencia REAL el primer dia

Esto es lo mas importante de este plan.

El plan 06-03 acepto a proposito que la regla de "sin evidencia completa" viviera **dos veces** —una en
SQL para el dashboard, otra en TypeScript para la pantalla del aseador— con razones de rendimiento
escritas, y la mitigacion acordada fue este test. La primera vez que corrio, **fallo**:

> `divergencia: SQL dice true y TypeScript dice false sobre el mismo aseo`

**El defecto:** `armarChecklist()` agrupaba por las filas del checklist, asi que el salto de un cuarto
**sin ninguna tarea** se quedaba sin grupo al que pegarse y desaparecia en silencio. La de SQL pregunta
por la tabla de saltos directamente y no le importa si el cuarto tiene tareas.

**La consecuencia si hubiera llegado a produccion:** el dashboard del admin marcando el aseo como sin
evidencia completa mientras la pantalla de la aseadora decia que estaba completo, sobre el mismo aseo y
el mismo dia. Nadie mira las dos pantallas a la vez, asi que habria vivido ahi indefinidamente.

**El arreglo** va del lado de TypeScript y no relajando el SQL, a proposito: la de SQL es la
conservadora —marca de mas, nunca de menos— y es la que ve quien tiene que reclamar la evidencia. Un
cuarto saltado sin tareas ahora genera su propio grupo, y se ordena **al final** del acordeon: con el
orden por defecto habria caido arriba del todo, que es el peor sitio para un cuarto en el que no hay
nada que hacer.

Cuatro tests unitarios nuevos en `checklist.test.ts` fijan el caso.

## Los senuelos

| Senuelo | Resultado |
|---|---|
| Que la version de TypeScript ignore los cuartos saltados | `un cuarto saltado con motivo` **en rojo**, con el mensaje de divergencia |
| Que la marca del dashboard falle al leerse | la tabla se pinta igual, con la marca en falso (test dedicado) |

## Y dos tests que llevaban rojos desde la Fase 5 sin que nadie lo viera

Al correr la puerta doce completa, `e2e/operacion.spec.ts` fallo en tres aserciones de toast. **No las
rompio esta fase**: se comprobo guardando todo el trabajo de 06-10 y volviendo a correr, y fallaban
igual.

La causa: la Fase 5 anadio a los mensajes de confirmacion y reasignacion la coletilla
`N quedaron con un aseador sin avisos.` / `No tiene los avisos activos: avísale tú.`, y esos tres tests
seguian comparando la cadena **exacta** de la Fase 4.

Y la coletilla aparece **siempre** en esa suite, por una razon que quedo escrita en el arnes: los
usuarios que siembra `global-setup.ts` nunca registran una suscripcion de push, porque nadie le da
permiso de notificaciones a un navegador de pruebas. O sea que toda confirmacion de ese archivo va a
parar a un aseador sin canal, que es justo el caso que el copy de la Fase 5 existe para avisar.

Se comparan por **prefijo**, no reescribiendo la cadena con el sufijo: lo que esos tests miden es el
flujo de confirmacion, y fijar ahi el numero de aseadores mudos ataria un test de `/operacion` a un
detalle de la siembra de push.

## Las doce puertas, con su conteo

| # | Puerta | Resultado |
|---|---|---|
| 1 | `db:reset` | OK |
| 2 | `db:lint` | `results: []` |
| 3 | `db:advisors` | `results: []` |
| 4 | `db:test` (pgTAP) | **Files=11, Tests=269**, `All tests successful` |
| 5 | `db:types:check` | sin diff |
| 6 | `test:unit` | **55 archivos, 1005 tests** |
| 7 | `test:integration` | **19 archivos, 169 tests** |
| 8 | `tsc --noEmit` | limpio |
| 9 | `lint` | 0 errores, 2 avisos preexistentes |
| 10 | `ci:arch` | los tres scripts OK |
| 11 | `build` | compila, con las dos rutas nuevas listadas |
| 12 | `test:e2e` | **107 tests en Chromium** |

**La reconciliacion de pgTAP:** la suma de los `plan(N)` de los once archivos es
`16+11+10+5+5+65+41+57+19+21+19 = 269`, y corrieron **269**. Cuadra exacto, o sea que **ningun archivo
aborto a mitad y salio verde por vacuidad**, que es el modo de fallo silencioso que la regla del
instrumento vigila. (Un primer conteo dio 290: el grep contaba dos menciones de `plan(16)` y `plan(5)`
que estan dentro de comentarios.)

## Lo que esta fase NO prueba, y no finge probar

Va escrito en la cabecera del spec:

- **iOS.** Solo Chromium. Playwright no ejecuta service workers en WebKit, asi que un proyecto de Safari
  daria un verde sin significado. Lo del iPhone —instalacion en pantalla de inicio, permiso
  irreversible, push— se valida a mano.
- **El comportamiento sin senal.** Diferido (D-08), y la interfaz tiene prohibido sugerirlo. **No se
  escribio ningun test de offline**, ni siquiera uno que "documente" la ausencia: un test de algo que
  no existe es ruido que hay que mantener.

## Dos desviaciones del plan, anotadas

1. **El paso de la foto real SI esta en el E2E.** El plan pedia omitirlo. Se dejo porque funciona
   —sube de verdad al Storage local y la fila queda en `cleaning_photos`— y cubre la cadena entera de
   punta a punta. Es mas cobertura, no menos.
2. **Los greps de `SenalSinEvidencia` y `armarChecklist` dan 2, no 1.** Import mas uso: es el minimo
   natural. Se quitaron las apariciones que si sobraban, que eran menciones en comentarios.

Ademas se corrigieron **dos criterios del propio plan que se invalidaban solos**: pedian
`aria-hidden == 0` sobre un archivo cuyo comentario explicaba, en prosa, que no se usa. Es la sexta vez
que ese defecto muerde en este repo; el comentario se reescribio sin los literales y con la nota.

## Lo que queda: el checkpoint en un telefono real

La tarea 3 del plan es un checkpoint bloqueante de verificacion humana, y **sigue abierto**. Lo
automatizable esta en verde; lo que ninguna de esas doce puertas mide es como se siente con una mano, de
pie y con guantes, que es el criterio con el que se diseno toda la fase.

Los cinco criterios de fallo, cualquiera de los cuales para la fase:

1. la pantalla hace zoom al enfocar el campo del monto
2. una casilla del checklist requiere punteria
3. terminar el aseo se bloquea por el checklist
4. la foto sale rotada
5. el boton de la barra fija queda tapado por la barra de gestos del telefono

El quinto ya tiene una mitad cubierta desde 06-07 (`viewport-fit=cover` mas el relleno del area segura,
verificado en el CSS compilado), pero **solo se confirma en un telefono con muesca**.
