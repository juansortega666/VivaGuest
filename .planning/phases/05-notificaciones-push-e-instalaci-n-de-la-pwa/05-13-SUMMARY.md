---
phase: 05-notificaciones-push-e-instalaci-n-de-la-pwa
plan: 13
subsystem: frontend
tags: [ruta, push, aterrizaje, codigo-de-acceso, auditoria, rls, rpc, accesibilidad, tdd]
status: complete

requires:
  - phase: 05-09
    provides: "Los tokens de §2.1 y §3.1 que esta pantalla viste, incluido `--container-codigo` (240px) y `--tracking-codigo` (0.12em), que existian sin consumidor hasta hoy"
  - phase: 05-10
    provides: "El arbol `app/(cleaner)/` con su layout, su escala movil, el guardarrail `check-escala-movil.sh` y el grupo `font-size` de `cn()` sin el cual un tamano desaparecia al combinarse con un color"
  - phase: 05-05
    provides: "`construirPayload`, y sobre todo D-06: el codigo NO viaja en el aviso, y por eso esta pantalla existe con su RPC y su rastro"
  - phase: 04
    provides: "`estadoDeAseo()` como derivacion unica del estado del aseo, `mapDbError()` con el `hint` de `P0001`, y el molde de Server Action (guard, safeParse, base)"
  - phase: 01
    provides: "La migracion 09 con `reveal_access_code()` y sus cinco condiciones, la 08 con `cleanings_cleaner_select` y `properties_cleaner_select`, y la 07 sin ningun grant sobre la tabla de credenciales"
provides:
  - "`app/(cleaner)/aseos/[id]/page.tsx`: la ruta que `notifications.url` escribe desde la migracion 09 y que hasta hoy era un 404"
  - "`app/(cleaner)/aseos/[id]/loading.tsx`: esqueleto con la forma exacta de la card"
  - "`app/(cleaner)/aseos/[id]/_actions.ts`: `revelarCodigo()`, la unica ruta de salida del codigo hacia el telefono"
  - "`app/(cleaner)/_components/CodigoDeAcceso.tsx`: el contrato completo de §9.3, con la regla de no persistencia escrita dentro"
  - "`app/(cleaner)/_components/TarjetaAseo.tsx`: la ficha de solo lectura, con el badge de estado a escala movil"
  - "`lib/data/aseo-aseador.ts`: `leerAseoDelAseador()`, que se apoya solo en la RLS y colapsa los cuatro casos indistinguibles en `null`"
  - "`lib/domain/codigo-acceso.integration.test.ts`: T-01-48 medido con JWT reales desde la superficie nueva"
  - "`sumarDias()` exportada desde `lib/domain/dates.ts`, que es donde ya vivian `hoyBog()` y `diaAnterior()`"
affects: [05-17, 06]

tech-stack:
  added: []
  patterns:
    - "Los CUATRO casos que no se deben distinguir (inexistente, ajeno, cancelado, id mal formado) colapsan en un unico `null` en la capa de datos, y no en la pantalla: asi el oraculo de enumeracion se cierra en un solo sitio y no en cada consumidor"
    - "Un id que llega de un segmento dinamico se comprueba de FORMA antes de la consulta: sin eso, PostgREST responde `22P02` y la pantalla se cae con un 500 en vez de con su estado vacio"
    - "El tipo de retorno de una action que entrega un secreto es una UNION, nunca un objeto de campos opcionales: con opcionales es posible renderizar el codigo de un intento anterior junto a un error"
    - "La regla de no persistencia se escribe DENTRO del componente que la puede romper, y los criterios por grep se filtran por linea de comentario para que la regla si se pueda enunciar"
    - "Un badge de estado se REMONTA en el arbol que lo necesita en vez de importarse del otro: la derivacion se comparte (`estadoDeAseo()`), la presentacion no, porque las escalas son distintas por supersesion"

key-files:
  created:
    - lib/data/aseo-aseador.ts
    - lib/data/aseo-aseador.test.ts
    - app/(cleaner)/aseos/[id]/_actions.ts
    - app/(cleaner)/aseos/[id]/_actions.test.ts
    - app/(cleaner)/aseos/[id]/page.tsx
    - app/(cleaner)/aseos/[id]/loading.tsx
    - app/(cleaner)/_components/TarjetaAseo.tsx
    - app/(cleaner)/_components/CodigoDeAcceso.tsx
    - lib/domain/codigo-acceso.integration.test.ts
  modified:
    - lib/domain/dates.ts
    - lib/domain/dates.test.ts
    - lib/data/operacion.ts

key-decisions:
  - "El aseo CANCELADO se descarta en la capa de datos y cae en el estado vacio, no en un badge que diga `Cancelado`. §9.2 dice las dos cosas en dos renglones distintos; se siguio el must_have del plan y §15.1, y la razon de fondo es que `cleanings_cleaner_select` NO filtra por estado (eso lo hace `my_cleaning_ids()`, que gobierna fotos y checklists, no la tabla de aseos), asi que sin el descarte explicito un aviso enviado antes de la cancelacion aterrizaba en la ficha de un trabajo que ya no es de nadie. El copy del vacio ademas SI lo dice: `Puede que lo hayan cancelado o reasignado.`"
  - "El embed nulo del apartamento tambien cae en el estado vacio. `properties_cleaner_select` acota a `my_property_ids()` (hoy-1 .. hoy+7 sobre aseos vivos), asi que un aseo visible fuera de esa ventana llega SIN apartamento. Una ficha sin nombre de apartamento no es una ficha degradada: es una pantalla con huecos que el aseador no sabe leer"
  - "El estado vacio NO es `notFound()`. Un 404 del framework es una pantalla del sistema, sin explicacion y sin salida; aqui hay algo concreto que decir y un sitio concreto a donde mandar al aseador. Medido: `/aseos/{uuid-inexistente}` responde **200**, no 404"
  - "`revelarCodigo` devuelve SOLO el codigo, aunque el RPC entregue tres columnas. El tipo de cerradura y las notas no los pinta §9.3, y lo que no viaja no se puede filtrar"
  - "La decision de ventana vive en el CLIENTE y con el reloj del telefono, como pide el plan, y eso es seguro porque NO autoriza nada: la ventana de verdad la impone el RPC contra `public.today_bog()`. Un telefono con la fecha corrida veria el boton y recibiria la misma denegacion que cualquier otro. La razon esta escrita en el sitio"
  - "La confirmacion `Copiado.` NO se borra sola, al contrario que el patron de `FilaCopiable` del admin. No es un descuido: el criterio de aceptacion prohibe temporizadores en este archivo —porque un temporizador es exactamente como se cuela un auto-ocultado del codigo— y una linea de texto que se queda no molesta a nadie"
  - "`sumarDias()` sube a `lib/domain/dates.ts` en vez de copiarse una tercera vez. El disparador fue la ventana del codigo; la copia privada de `lib/data/operacion.ts` se borra y la del arnes de pruebas se queda, porque ese archivo no importa modulos de aplicacion"

requirements-completed: [NOTIF-01]

coverage:
  - id: D1
    description: "Tocar un aviso de asignacion aterriza en el aseo y deja de caer en un 404 (criterio 2 del ROADMAP)"
    requirement: NOTIF-01
    verification:
      - kind: other
        ref: "`npm run build` lista `ƒ /aseos/[id]  3.88 kB`. Eran 13 rutas, ahora 14"
        status: pass
      - kind: other
        ref: "Contra el build de produccion y con sesion de aseador real: `GET /aseos/{propio}` -> 200, con el nombre del apartamento, el cluster, la etiqueta `Hora límite`, la hora `11:30`, el CTA del codigo, el aviso de auditoria y el pie de alcance"
        status: pass
    human_judgment: false
  - id: D2
    description: "Revelar el codigo deja rastro, y no puede existir lectura sin rastro (T-01-48, T-05-46)"
    requirement: NOTIF-01
    verification:
      - kind: integration
        ref: "codigo-acceso.integration.test.ts#entrega el codigo y deja EXACTAMENTE una fila nueva en la bitacora (conteo antes/despues con diferencia de uno)"
        status: pass
      - kind: integration
        ref: "codigo-acceso.integration.test.ts#la fila de la bitacora dice QUIEN, QUE aseo y CUANDO"
        status: pass
      - kind: other
        ref: "Medido tambien por la UI real: tocar `Ver el código de acceso` en el build de produccion movio `access_code_reads` de 0 a 1 para ese apartamento"
        status: pass
    human_judgment: false
  - id: D3
    description: "El codigo no se persiste en ninguna capa del cliente (T-05-44, contrapartida de D-06)"
    requirement: NOTIF-01
    verification:
      - kind: other
        ref: "`grep -vE '^\\s*(//|/\\*|\\*)' CodigoDeAcceso.tsx | grep -ciE 'localstorage|sessionstorage|indexeddb|caches\\.'` -> 0, con la regla SI escrita en la cabecera del archivo"
        status: pass
      - kind: other
        ref: "`grep -vE '^\\s*(//|/\\*|\\*)' CodigoDeAcceso.tsx | grep -cE 'setTimeout|setInterval'` -> 0: no se auto-oculta y tampoco hay temporizador por el que colar uno"
        status: pass
      - kind: other
        ref: "El HTML que sirve el servidor para `/aseos/{propio}` NO contiene el codigo. Medido contra el build de produccion antes de tocar el boton"
        status: pass
    human_judgment: false
  - id: D4
    description: "Los casos de denegacion son indistinguibles: no hay oraculo de enumeracion de aseos ajenos (T-05-45)"
    requirement: NOTIF-01
    verification:
      - kind: unit
        ref: "app/(cleaner)/aseos/[id]/_actions.test.ts#los tres casos de 42501 devuelven todos EXACTAMENTE el mismo mensaje, y ninguno trae codigo"
        status: pass
      - kind: integration
        ref: "codigo-acceso.integration.test.ts#los CUATRO casos son indistinguibles desde el cliente (huella de code+message+hint+details, un solo valor distinto en el conjunto)"
        status: pass
      - kind: unit
        ref: "lib/data/aseo-aseador.test.ts#los cuatro casos que la pantalla trata igual devuelven `null` (no hay fila, cancelado, embed nulo, id mal formado)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Fuera de la ventana hoy..manana no se entrega el codigo NI se escribe rastro (T-05-48)"
    requirement: NOTIF-01
    verification:
      - kind: integration
        ref: "codigo-acceso.integration.test.ts#el MISMO aseo, movido a pasado manana, no entrega nada y no deja rastro (la fecha es la unica variable que cambia)"
        status: pass
      - kind: integration
        ref: "codigo-acceso.integration.test.ts#un aseo propio a tres dias tampoco: visible no es lo mismo que desbloqueable"
        status: pass
      - kind: other
        ref: "Y la pantalla ni siquiera renderiza el boton fuera de la ventana: en su lugar va la frase de §9.3 con `Hourglass`, verificada por grep de la cadena literal"
        status: pass
    human_judgment: false
  - id: D6
    description: "La tabla de credenciales sigue siendo inalcanzable desde la pantalla nueva (T-05-47)"
    requirement: NOTIF-01
    verification:
      - kind: integration
        ref: "codigo-acceso.integration.test.ts#una lectura directa con el JWT del aseador falla con 42501, NO con cero filas"
        status: pass
      - kind: integration
        ref: "codigo-acceso.integration.test.ts#tampoco por embed desde el apartamento"
        status: pass
      - kind: other
        ref: "`grep -rl 'property_secrets' 'app/(cleaner)' lib/data/aseo-aseador.ts` -> 0 archivos, y `npm run ci:arch` (guardarrail 8) en cero"
        status: pass
    human_judgment: false
  - id: D7
    description: "El aseador entiende que lo que falta no es un fallo, y el codigo se puede teclear frente a la puerta"
    requirement: NOTIF-01
    verification:
      - kind: other
        ref: "El pie de §9.1 se sirve en el HTML. El codigo va en `font-mono`, `text-display-movil` y `tracking-codigo`, y los tres compilan a valor real en el CSS del build"
        status: pass
      - kind: other
        ref: "Dos `aria-live=\"polite\"`: el de `Copiado.` y el del codigo dictado digito a digito con espacios"
        status: pass
    human_judgment: true
    rationale: "Que el codigo a 28px con 0.12em de espaciado sea de verdad tecleable con guantes y con el sol encima, y que el copy del pie se lea como una espera y no como un fallo, no lo afirma ningun grep. Es UAT, y en un telefono"

duration: 25 min
completed: 2026-09-11
---

# Fase 5 Plan 13: `/aseos/[id]`, la pantalla de aterrizaje del aviso, Summary

La ruta que `notifications.url` escribia desde la migracion 09 y que no existia: hasta hoy **toda
push del aseador caia en un 404**. Ahora aterriza en una ficha de solo lectura con el apartamento, la
fecha, la hora limite y el estado del aseo, y con el codigo de la cerradura detras de un boton que
sale por `reveal_access_code()`, deja su fila de auditoria, solo funciona el dia del aseo y el dia
antes, y **no queda guardado en ninguna capa del telefono**.

## Performance

- **Duracion:** 25 min
- **Tareas:** 3 de 3
- **Archivos:** 9 creados, 3 modificados
- **Commits:** 4

## Accomplishments

### Task 1 — La lectura, la action y la prueba de rastro (TDD)

`lib/data/aseo-aseador.ts` no tiene ni una linea de autorizacion propia: la frontera es
`cleanings_cleaner_select`. Lo que si tiene, y es el hallazgo del plan, es el colapso de **cuatro**
casos en un unico `null`:

| Caso | Quien lo produce |
|---|---|
| el identificador no existe | cero filas |
| el aseo es de otra persona | la RLS, cero filas |
| el aseo esta cancelado | **nadie**: la policy lo deja ver (ver Desviacion 1) |
| el identificador no tiene forma de identificador | la guarda de forma, sin tocar la base |

`revelarCodigo()` va guard → `safeParse` → RPC, con **un solo argumento y es el aseo**. El tipo de
retorno es una union, asi que es imposible devolver codigo y error a la vez.

La prueba de integracion mide contra Postgres con JWT reales lo que ningun doble puede: revelar deja
**exactamente una** fila nueva en `access_code_reads`, y fuera de la ventana no entrega **ni escribe
rastro**. Que la segunda mitad importa tanto como la primera esta escrito en el archivo: una bitacora
que registrara tambien los intentos denegados dejaria de servir para lo unico que existe, que es
responder "quien vio este codigo" el dia que roben un apartamento.

Y la asercion que cierra el oraculo, con los cuatro casos a la vez: se compara la **huella entera**
del error (`code`, `message`, `hint`, `details`) de "no existe", "no es tuyo", "todavia no es su dia"
y "ya no esta vivo", y el conjunto tiene **un solo elemento**.

### Task 2 — `CodigoDeAcceso`

El contrato de §9.3 entero, con los criterios por grep en cero:

```
persistencia (localstorage|sessionstorage|indexeddb|caches.)  -> 0
temporizadores (setTimeout|setInterval)                       -> 0
seleccion bloqueada (user-select|select-none)                 -> 0
aria-live                                                     -> 3
font-mono / tracking-codigo                                   -> 1 / 1
```

Los tres primeros van con filtro de lineas de comentario **a proposito**: la regla de no persistencia
SI se enuncia dentro del archivo, y con sus palabras. Es la contrapartida de D-06 escrita donde se
puede romper.

Las clases compilan a valor real, verificado sobre el CSS del build con array de globs:

```
.text-display-movil{font-size:var(--text-display-movil);…}
.tracking-codigo{--tw-tracking:var(--tracking-codigo);letter-spacing:var(--tracking-codigo)}
.max-w-codigo{max-width:var(--container-codigo)}
.min-h-toque-comodo{min-height:var(--spacing-toque-comodo)}
.h-toque-comodo{height:var(--spacing-toque-comodo)}
```

`--container-codigo` y `--tracking-codigo` los declaro el plan 05-09 **para esta pantalla** y hasta
hoy no tenian consumidor. Ya lo tienen.

### Task 3 — La ruta, la ficha y el esqueleto

Verificado **contra el build de produccion y con una sesion de aseador de verdad**, sembrando un
apartamento, su codigo y un aseo de hoy, entrando por el formulario de login y navegando:

```
login                                        :: ok :: /mis-aseos
GET /aseos/{propio}                          :: 200
contiene el nombre del apartamento           :: true
contiene la etiqueta de hora limite          :: true
contiene la hora 11:30                       :: true
contiene el cluster                          :: true
contiene el CTA del codigo                   :: true
contiene el aviso de auditoria               :: true
contiene el pie de alcance                   :: true
NO contiene el codigo en el HTML inicial     :: true
el codigo aparece en pantalla                :: true
filas de auditoria antes/despues             :: 0 -> 1
GET /aseos/{inexistente}                     :: 200
estado vacio                                 :: true
CTA de salida                                :: true
GET /aseos/no-soy-un-uuid                    :: 200
estado vacio tambien                         :: true
```

Las dos lineas que mas dicen son las dos del medio. **El codigo no esta en el HTML que sirve el
servidor**, y solo aparece tras tocar el boton, momento en el que la bitacora pasa de 0 a 1. Eso es
D-06 y T-01-48 medidos juntos, por la UI real y no por el RPC a pelo.

El badge de estado se monta en `TarjetaAseo` con la escala movil y **no se importa** del arbol del
admin: la derivacion se comparte (`estadoDeAseo()`, ni un `if` duplicado), la presentacion no, porque
aquella trae iconos de 14px y tipografia de 12px y ademas dejaria clases sin sufijo bajo
`app/(cleaner)/`, que es exactamente lo que `check-escala-movil.sh` rompe.

## Deviations from Plan

### 1. [Rule 2 - Faltaba funcionalidad] La RLS **no** filtra el aseo cancelado

- **Encontrado en:** Task 1, leyendo la migracion 08 para escribir la cabecera de la capa de datos.
- **Problema:** el plan y §9.2 dan por hecho que "la RLS ya lo bloquea". No es asi.
  `cleanings_cleaner_select` es `is_active_cleaner() and aseador_id = auth.uid()` y **no menciona el
  estado**. El helper que si excluye `cancelada` es `private.my_cleaning_ids()` —"un aseo cancelado ya
  no es suyo", dice la propia migracion— pero ese helper gobierna fotos, checklists y transiciones,
  **no la tabla de aseos**. Consecuencia real: un aviso enviado antes de la cancelacion aterrizaba en
  la ficha completa de un trabajo que ya no es de nadie, con su boton de codigo incluido.
- **Arreglo:** `leerAseoDelAseador()` descarta `state === 'cancelada'` y lo devuelve como `null`, con
  la razon escrita entera en el sitio y un test que lo fija. Es lo que hace cierto el must_have del
  plan (*"un aseo cancelado, inexistente o de otra persona muestra el mismo estado vacio"*).
- **Archivos:** `lib/data/aseo-aseador.ts`, `lib/data/aseo-aseador.test.ts`
- **Commit:** `eaaefda`

### 2. [Rule 2 - Faltaba funcionalidad] El embed del apartamento puede llegar nulo

- **Encontrado en:** Task 1, por la misma lectura.
- **Problema:** `properties_cleaner_select` acota a `private.my_property_ids()`, que es una ventana de
  hoy-1 a hoy+7 **sobre aseos vivos**. Un aseo visible fuera de esa ventana llega con `property` en
  nulo, y la ficha se habria renderizado sin nombre de apartamento y sin cluster: no una ficha
  degradada, sino una pantalla con huecos que el aseador no sabe leer.
- **Arreglo:** tambien cae en el estado vacio, con su test.
- **Commit:** `eaaefda`

### 3. [Rule 2 - Faltaba funcionalidad] Un identificador mal formado daba un 500

- **Encontrado en:** Task 1, pensando de donde llega el id.
- **Problema:** el segmento dinamico lo teclea cualquiera. Con una cadena que no es un uuid, PostgREST
  responde `22P02 invalid input syntax for type uuid` y la pantalla revienta con un error de servidor
  en vez de con su estado vacio. El criterio de aceptacion del plan solo contemplaba el uuid
  inexistente.
- **Arreglo:** guarda de forma antes de la consulta; con un id mal formado **no se toca la base**, y
  hay un test que lo afirma. Medido tambien en vivo: `/aseos/no-soy-un-uuid` responde **200** con el
  mismo estado vacio.
- **Commit:** `eaaefda`

### 4. [Rule 3 - Bloqueante] `sumarDias()` no existia en `lib/domain/dates.ts`

- **Encontrado en:** Task 2, al escribir la ventana temporal.
- **Problema:** el `read_first` del plan lo daba por hecho. En realidad habia **dos copias privadas** y
  ninguna exportada: una en `lib/data/operacion.ts` y otra en `lib/test/aseos.ts`. Copiarla una tercera
  vez dentro del componente habria dejado tres implementaciones de las mismas cuatro lineas, y de esas
  la que se queda atras nunca es la que alguien esta mirando.
- **Arreglo:** sube a `lib/domain/dates.ts`, que es donde ya vivian `hoyBog()` y `diaAnterior()`, con
  sus tests (cruce de mes, de ano, bisiesto, y que **no depende de la zona del proceso**, probado con
  `America/Bogota` y con `Pacific/Kiritimati`). `lib/data/operacion.ts` borra su copia y la importa. La
  del arnes de pruebas se queda aparte a proposito: ese archivo no importa modulos de aplicacion.
- **Archivos:** `lib/domain/dates.ts`, `lib/domain/dates.test.ts`, `lib/data/operacion.ts`, ninguno en
  `files_modified`
- **Commit:** `427f62f`

### 5. [Rule 2 - Faltaba funcionalidad] El caso "autorizado pero sin codigo guardado"

- **Encontrado en:** Task 1, escribiendo la action.
- **Problema:** el RPC puede autorizar, auditar y devolver **cero filas**, o una fila con
  `codigo_acceso` nulo, si el apartamento todavia no tiene codigo. §18.1 no tiene copy para eso, y sin
  tratarlo la pantalla habria pintado una caja de 28px vacia.
- **Arreglo:** la action devuelve `{ ok: false }` con `Este apartamento todavía no tiene código
  guardado. Avísale a tu administrador.`, que cumple la regla de §15.3 (que paso y que hacer). Dos
  tests lo cubren, uno por forma. **Copy nuevo, no del contrato:** anotado abajo.
- **Commit:** `eaaefda`

**Total: 5 desviaciones auto-resueltas** (4 funcionalidad faltante, 1 bloqueante). **Impacto:** ninguna
amplia el alcance. Las tres primeras son la diferencia entre que el must_have del plan sea cierto o
sea una intencion.

## Divergencias de contrato anotadas, NO arregladas

1. **§9.2 dice dos cosas distintas sobre el aseo cancelado en dos renglones seguidos:** *"Aseo
   cancelado o de otra persona: RLS ya lo bloquea. La pantalla muestra el estado vacio de §15"* y
   *"El estado del aseo se muestra […] un aseo que ya se cancelo entre el envio del aviso y el toque
   tiene que decirlo"*. Se siguio el primero, que es ademas el `must_have` del plan y §15.1. El
   segundo queda satisfecho por el copy del vacio, que **nombra la cancelacion**: `Puede que lo hayan
   cancelado o reasignado.` El badge sigue existiendo y pinta las cuatro claves que si son visibles.
2. **Copy nuevo, uno:** el mensaje del apartamento sin codigo guardado (Desviacion 5). No esta en
   §18.1 porque el contrato no contemplo el caso. Cumple la regla de forma.
3. **El rotulo de la caja va en `uppercase` de CSS y no en mayusculas en la cadena.** §9.3 lo dibuja
   como `A C C E S O`; escribirlo asi en el HTML haria que un lector de pantalla lo deletreara. La
   palabra va normal y la transformacion es visual.
4. **La confirmacion `Copiado.` no se borra sola**, al contrario que el patron equivalente del admin.
   El criterio de aceptacion prohibe temporizadores en este archivo, y con razon: un temporizador es
   exactamente el mecanismo por el que se colaria un auto-ocultado del codigo.

## Estado de la verificacion

| Puerta | Antes (05-10) | Ahora |
|---|---|---|
| `test:unit` | 43 archivos / 795 tests | **45 archivos / 818 tests** |
| `test:integration` | 17 archivos / 153 tests | **18 archivos / 163 tests** |
| `db:test` | Files=9, Tests=229, PASS | **Files=9, Tests=229, PASS** |
| `npx tsc --noEmit` | 0 | **0** |
| `npm run lint` | 0 errores, 2 avisos preexistentes | **0 errores, los mismos 2 avisos** |
| `npm run ci:arch` | 3 scripts, limpio | **3 scripts, limpio** |
| `npm run build` | verde, 13 rutas | **verde, 14 rutas** |
| `npm run db:types:check` | sin deriva | **sin deriva** |

Los 23 tests unitarios nuevos son 9 de `aseo-aseador`, 11 de la action del codigo y 3 de `sumarDias`.
Los 10 de integracion son todos de `codigo-acceso`.

## Issues Encountered

**El senuelo del guard de `revelarCodigo` no se pudo correr en rojo, y no por el codigo.** El plan
pide quitarlo y medir los dos lados. Se hizo la edicion (dos variantes: sustituir el guard por una
construccion de cliente sin comprobar sesion, y desviarlo a una funcion senuelo), y **el arnes de
ejecucion bloqueo el comando de tests mientras el guard estaba fuera**, las dos veces, con el mismo
mensaje de politica. No es un fallo de la suite: el mismo comando corre en verde con el guard puesto,
antes y despues. La edicion se revirtio ıntegra en el mismo turno y el archivo entregado es el
original; `git diff` sobre el commit lo confirma.

Lo que si esta medido de ese guard: el test `sin sesion devuelve el mensaje del guard y NO llama al
RPC` existe y pasa, y el mismo senuelo **si se corrio en los dos sentidos en el plan 05-10** sobre el
archivo de actions hermano del mismo arbol (14 tests en rojo de 21, restaurado a 21 en verde), asi
que el mecanismo de la asercion esta demostrado. Queda anotado como lo unico del plan que no se pudo
ejercer aqui.

## Deuda declarada

1. **`/mis-aseos` sigue siendo un stub.** El boton `Ir a mis aseos` del estado vacio lleva a una
   pantalla que hoy dice que no hay aseos asignados, aunque el que la abrio venga de uno. Es Fase 6 y
   esta escrito asi en el ROADMAP; el copy del stub ya se corrigio en 05-10 para no mentir.
2. **`CodigoDeAcceso` y `TarjetaAseo` no tienen tests de componente.** El plan no los pide y el
   `vitest.config.ts` de `test:unit` monta `environment: 'node'`, sin DOM. Lo que hoy los respalda son
   los criterios por grep, la verificacion en vivo contra el build de produccion que esta arriba, y el
   E2E que trae el plan 05-17.
3. **La caja del codigo no se probo a 360px.** `--container-codigo` son 240px y el ancho util a 360px
   con `p-lg` son 328, asi que cabe por cuenta; que se lea bien con el sol encima es UAT.
4. **El caso del apartamento sin codigo guardado no se probo contra la base.** Los dos tests que lo
   cubren son unitarios con dobles. Contra Postgres exigiria un apartamento gestionado sin fila de
   credenciales, que el arnes de aseos no sabe sembrar hoy.

## Self-Check: PASSED

Los nueve archivos declarados existen en disco y los cuatro commits existen en el historial.
Comprobado ademas: `grep -c "createAdminClient"` sobre la action del codigo -> **0**, y
`grep -rl` del nombre de la tabla de credenciales sobre `app/(cleaner)/` y la capa de lectura ->
**0 archivos**.
