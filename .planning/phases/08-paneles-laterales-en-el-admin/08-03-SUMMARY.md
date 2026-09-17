---
phase: 08-paneles-laterales-en-el-admin
plan: 03
subsystem: ui
tags: [dominio-puro, fechas, timezone, vitest, tdd, ical, calendar-feeds, checkouts]

requires:
  - phase: 02-acceso-y-administraci-n-del-cat-logo
    provides: "lib/data/feeds.ts con FeedDeApartamento y leerFeedDeApartamento(), y la interfaz de escritura que ya ocupaba el nombre obvio"
  - phase: 07-finanzas
    provides: "lib/domain/dates.ts con formatFechaLargaBog, sumarDias y la doctrina de anclar en UTC sobre componentes ya partidos"
provides:
  - "lib/domain/checkouts.ts: proximoCheckout, checkoutsDelMes y distanciaHastaCheckout, sobre cadenas 'YYYY-MM-DD' y sin construir un solo objeto temporal"
  - "lib/domain/feeds.ts: saludDelFeed, los tres estados del grupo CALENDARIO de §8.2, con la ausencia evaluada primero"
  - "El tipo EstadoDeFeed, que resuelve la colision de nombre con la interfaz de escritura de lib/data/feeds.ts sin obligar a renombrar en ningun import"
  - "28 casos unitarios nuevos, incluido el que mide el defecto del dia anterior en vez de describirlo"
affects: [08-06, 08-10]

tech-stack:
  added: []
  patterns:
    - "Aritmetica de dias de negocio con Date.UTC() COMO NUMERO: la resta de dos anclas identicas da dias exactos sin construir ninguna fecha, asi que el grep de aceptacion sigue en cero"
    - "El test que mide el defecto que el modulo evita: se afirma que el camino prohibido produce el 3 de septiembre, no solo que el camino bueno produce el 4"
    - "Derivacion con orden de evaluacion explicito y un caso de test dedicado a fijarlo, el mismo patron de estadoDeAseo()"

key-files:
  created:
    - lib/domain/checkouts.ts
    - lib/domain/checkouts.test.ts
    - lib/domain/feeds.ts
    - lib/domain/feeds.test.ts
  modified: []

key-decisions:
  - "La clave del estado sano se llama 'sano' y no la palabra de pantalla: el criterio de aceptacion prohibe por grep case-insensitive las tres etiquetas de §15.2 dentro del modulo, y 'sano' ademas casa con el vocabulario que salud-sync.ts ya usa"
  - "La cabecera de lib/domain/feeds.ts nombra el archivo y la linea de la interfaz que colisionaba, y la describe sin escribir el identificador, porque el otro criterio de aceptacion exige que ese token no aparezca ni una vez en el archivo"
  - "distanciaHastaCheckout LANZA con un checkout anterior a hoy en vez de devolver un numero negativo: 'dentro de -2 dias' seria una mentira en pantalla, y por construccion no puede llegar uno"
  - "diasDeCalendarioEntre se queda privada en checkouts.ts y no se muda a dates.ts: alli las funciones se mudaron porque DOS modulos las necesitaban, y esta la necesita uno solo"
  - "checkoutsDelMes no deduplica: dos reservas que terminen el mismo dia son dos checkouts el mismo dia, y esconder uno seria una decision de producto que nadie tomo"

patterns-established:
  - "Modulo de dominio que importa un TIPO de la capa de datos: import type se borra al compilar, asi que el modulo sigue siendo puro en tiempo de ejecucion y el grep de supabase sigue en cero"
  - "Cuando dos criterios de aceptacion se contradicen (nombrar el tipo que colisiona vs. que el token no aparezca), gana el mecanico y la prosa lo describe de forma resoluble"

requirements-completed: []

coverage:
  - id: D1
    description: "proximoCheckout devuelve el primer checkout mayor o igual a hoy, sin suponer la lista ordenada, y null cuando no queda ninguno"
    verification:
      - kind: unit
        ref: "lib/domain/checkouts.test.ts#proximoCheckout (6 casos)"
        status: pass
    human_judgment: false
  - id: D2
    description: "checkoutsDelMes filtra por prefijo del mes y ordena, con la lista vacia como respuesta al mes sin checkouts y sin llevarse el mes vecino ni cruzando el año"
    verification:
      - kind: unit
        ref: "lib/domain/checkouts.test.ts#checkoutsDelMes (4 casos)"
        status: pass
    human_judgment: false
  - id: D3
    description: "distanciaHastaCheckout devuelve la clave del rotulo y el numero de dias, con el cruce de mes y el febrero bisiesto medidos"
    verification:
      - kind: unit
        ref: "lib/domain/checkouts.test.ts#distanciaHastaCheckout (6 casos)"
        status: pass
    human_judgment: false
  - id: D4
    description: "El defecto del dia anterior no puede entrar por este modulo: el 4 de septiembre se lee como 4 despues de pasar por las dos funciones"
    verification:
      - kind: unit
        ref: "lib/domain/checkouts.test.ts#el dia calendario sobrevive el viaje (3 casos, uno de ellos mide el defecto)"
        status: pass
      - kind: other
        ref: "grep -vE '^\\s*(//|\\*|/\\*)' lib/domain/checkouts.ts | grep -c 'new Date(' devuelve 0"
        status: pass
    human_judgment: false
  - id: D5
    description: "saludDelFeed deriva los tres estados de §8.2 con la ausencia mirada primero, y el orden esta fijado por un caso propio"
    verification:
      - kind: unit
        ref: "lib/domain/feeds.test.ts#saludDelFeed (9 casos, incluido 'EL ORDEN: apagado Y con fallos es ausencia')"
        status: pass
    human_judgment: false
  - id: D6
    description: "Los dos modulos son puros y sin copy de pantalla: ni Supabase, ni React, ni las tres etiquetas de §15.2, ni el nombre de tipo que ya estaba tomado"
    verification:
      - kind: other
        ref: "grep -c 'supabase\\|react' en los dos modulos = 0; grep -c SaludDelFeed lib/domain/feeds.ts = 0; grep -ciE 'conectado|fallos seguidos|sin conectar' lib/domain/feeds.ts = 0"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit limpio, npm run lint sin errores (2 warnings preexistentes)"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-09-17
status: complete
---

# Fase 8 Plan 03: Los dos modulos de dominio que el UI-SPEC daba por existentes

**Los checkouts se calculan sobre cadenas y el estado del feed se deriva fuera del componente, asi que los paneles de 08-06 y 08-10 los consumen ya probados en vez de repetir la logica dentro del JSX, donde este repo no la puede medir.**

## Performance

- **Duracion:** ~25 min
- **Tareas:** 2 de 2
- **Archivos creados:** 4, ninguno modificado
- **Unitarios:** de 1201 a **1229** (28 nuevos), 65 archivos, cero rojos
- **Commits:** 4, dos por tarea (rojo y verde)

## Lo que se hizo

### Task 1 · La aritmetica de checkouts

`lib/domain/checkouts.ts` con tres funciones puras sobre cadenas `'YYYY-MM-DD'`:

| Funcion | Que hace | La decision que lleva dentro |
|---|---|---|
| `proximoCheckout(checkouts, hoy)` | el minimo mayor o igual a hoy, o `null` | **barre, no ordena**, y no supone que la lectura traiga su `order by`. Si lo supusiera, un `select` al que un dia se le caiga el orden daria un panel silenciosamente falso en vez de un error |
| `checkoutsDelMes(checkouts, mes)` | las fechas del mes, ordenadas | el filtro es un **prefijo** (`slice(0, 7)`), no un "entre el primero y el ultimo": los extremos exigirian saber cuantos dias tiene el mes, que es donde falla febrero |
| `distanciaHastaCheckout(checkout, hoy)` | `{ clave, dias }` con `hoy`, `manana` o `en-dias` | `manana` tiene clave propia porque `dentro de 1 dias` es agramatical y `dentro de 1 dia` obligaria al componente a concordar el numero |

**Como se calcula la distancia sin construir una fecha.** `Date.UTC()` devuelve un
numero, no un objeto: se parten las dos cadenas en componentes, se anclan las dos
en el mismo punto fijo y se restan. Las dos puntas llevan el mismo ancla, asi que
la resta es un multiplo exacto de un dia y ninguna zona horaria participa. Es la
misma excepcion que `sumarDias()` y `diaDeLaSemana()` de `lib/domain/dates.ts` ya
tenian declarada, y deja el grep de aceptacion en cero sin renunciar a la
aritmetica de calendario de verdad.

### Task 2 · Los tres estados del feed

`lib/domain/feeds.ts` con `saludDelFeed(feed)`, que recibe `FeedDeApartamento | null`
y devuelve `{ clave, fallos }`. Tres ramas, y el orden es la regla:

```
1. sin fila, o is_active en falso        -> 'ausente'
2. consecutive_failures > 0              -> 'con-fallos'
3. el resto                              -> 'sano'
```

El comentario de cada rama dice **por que esta en ese orden**, no solo que hace. El
de la primera es el que importa: un feed que alguien apago justamente porque
fallaba, anunciado como "falla", invita a esperar a que se arregle solo, y no se va
a arreglar.

## Los commits por tarea

1. **Task 1 rojo** `106f0d6` (test) · **Task 1 verde** `d51512d` (feat)
2. **Task 2 rojo** `9c6e3b0` (test) · **Task 2 verde** `eb322bc` (feat)

Los dos rojos se vieron rojos antes de escribir el modulo: el primero por modulo
inexistente, el segundo igual.

## Las dos tensiones del plan, y como se resolvieron

### 1. Dos criterios de aceptacion que no se pueden cumplir a la vez

El plan pedia las dos cosas:

- *"La cabecera del modulo nombra el archivo y el tipo con el que el nombre colisionaba."*
- *"`grep -c "SaludDelFeed" lib/domain/feeds.ts` devuelve 0."*

Escribir el identificador en la cabecera pone el grep en 1. **Gano el mecanico**,
que es el que se puede medir, y la cabecera lo describe de forma resoluble sin
teclearlo: *"`lib/data/feeds.ts`, en su linea 68, exporta una interfaz que se llama
EXACTAMENTE como esta funcion pero con la inicial en mayuscula"*. Quien lo lea sabe
cual es y por que el tipo de aqui se llama `EstadoDeFeed`.

### 2. El grep del copy prohibe tambien la clave obvia

`grep -ciE "conectado|fallos seguidos|sin conectar"` es **case-insensitive**, asi que
una clave `'conectado'` lo habria puesto en 1, igual que la palabra suelta en un
comentario (paso: el comentario de la rama 3 decia "recien conectado" y el grep lo
encontro). Las tres claves quedaron en `ausente`, `con-fallos` y `sano`, que ademas
es el vocabulario que `salud-sync.ts` ya usaba (`'sana' | 'caida'`) y deja claro de
un vistazo que no son texto de pantalla.

## Deviations from Plan

### Auto-fixed Issues

**1. [Regla 1 - Bug] El caso del febrero bisiesto estaba mal escrito en el test**

- **Encontrado durante:** Task 1, al pasar de rojo a verde
- **Problema:** el test afirmaba que del 28 de febrero de **2028** al 1 de marzo hay
  **un** dia, con clave `manana`. 2028 es bisiesto: existe el 29, y son **dos** dias.
  El modulo estaba bien y el test estaba mal, que es la forma menos comoda de
  descubrir un error y la unica que no deja un defecto dentro.
- **Arreglo:** el caso pasa a medir **la pareja**, que es lo que de verdad prueba
  algo: en 2027 el 1 de marzo es manana del 28 de febrero, y en 2028 no. Una
  implementacion que trate febrero como de 28 dias fijos pasa el primero y falla el
  segundo.
- **Archivo:** `lib/domain/checkouts.test.ts`
- **Commit:** `d51512d`

**2. [Regla 2 - Funcionalidad critica] Tres casos de test por encima de los pedidos**

El plan pedia nueve casos en Task 1 y siete en Task 2. Se escribieron 19 y 9. Los
añadidos no son relleno:

| Caso extra | Que protege |
|---|---|
| `proximoCheckout` con todos los checkouts atras | la rama `null` del mes ya consumido, que es el estado normal del ultimo dia de cada mes |
| `proximoCheckout` cruzando el año | que la comparacion lexicografica aguanta diciembre a enero, que es donde una resta a mano falla |
| el defecto medido (`new Date('2026-09-04')` en Bogota da el 3) | que el peligro que justifica el modulo entero **existe**, en vez de darlo por sabido |
| un solo fallo en el feed | que el umbral es uno y no una racha |
| el numero de fallos en las tres ramas | que el consumidor no tenga que volver a la fila del feed para un `title` |

## Lo que 08-06 y 08-10 pueden dar por cierto

- **El dia calendario no se mueve.** Todo lo que salga de estas funciones se formatea
  con `formatFechaLargaBog()` o `formatFechaCortaBog()` y sale el dia correcto. En el
  panel no hace falta ni un condicional de fecha.
- **El estado del feed llega derivado.** El componente pinta icono, color y las tres
  etiquetas de §15.2 conmutando sobre `clave`, y el `{N}` sale de `fallos`. Ni un `if`
  sobre `is_active` dentro del JSX.
- **El copy sigue siendo del componente.** Ninguno de los dos modulos tiene una sola
  cadena en español de pantalla, asi que cambiar una palabra del contrato no toca el
  dominio ni sus tests.
- **`distanciaHastaCheckout` solo se llama con la salida de `proximoCheckout`.** Con
  cualquier otra cosa puede lanzar, y es a proposito.

## Verificacion

```
npx vitest run lib/domain/checkouts.test.ts lib/domain/feeds.test.ts   28 passed
npm run test:unit                                    65 archivos, 1229 passed
npx tsc --noEmit                                                          limpio
npm run lint                             0 errores (2 warnings preexistentes)
git diff --name-only e692241..HEAD -- 'app/(cleaner)'                  0 lineas
```

Los greps de aceptacion, uno por uno:

```
grep -vE '^\s*(//|\*|/\*)' lib/domain/checkouts.ts | grep -c 'new Date('   0
grep -c "supabase\|react" lib/domain/checkouts.ts                          0
grep -c "supabase\|react" lib/domain/feeds.ts                              0
grep -c "SaludDelFeed" lib/domain/feeds.ts                                 0
grep -ciE "conectado|fallos seguidos|sin conectar" lib/domain/feeds.ts     0
```

## Known Stubs

Ninguno. Los dos modulos estan completos y no dejan ninguna rama sin implementar.

## Self-Check: PASSED

Los cuatro archivos existen en disco y los cuatro commits existen en el historial.
