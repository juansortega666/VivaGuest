---
phase: 07-financiero
plan: 08
subsystem: database
tags: [postgres, migracion, security-definer, lecturas, conciliacion, privacidad, timezone]

requires:
  - phase: 01-fundaciones
    provides: "`private.is_admin()` (migración 08), que consulta `profiles` en vivo y no un claim del JWT, y el patrón definer del repo (search_path vacío, nombres calificados, revoke/grant pegado a la definición)"
  - phase: 01-fundaciones
    provides: "El snapshot financiero de `public.cleanings` (`tarifa_huesped`, `pago_aseador`) que el trigger de FIN-01 congela al crear el aseo"
  - phase: 06-pwa-aseador
    provides: "`public.expenses.moneda` (migración 18) y la convención de ruta de `public.cleaning_photos` con su `deleted_at`"
  - phase: 07-financiero
    provides: "Migración 23 (plan 07-04): `public.dia_bog(timestamptz)`, la conversión que decide la pertenencia al periodo"
  - phase: 07-financiero
    provides: "Migración 24 (plan 07-05): el grant por columna que sacó las dos cifras de dinero de `cleanings` y `properties`, y `public.tarifas_de_apartamentos` como precedente de la vía por función"
  - phase: 07-financiero
    provides: "Migración 25 (plan 07-07): el filtro y la atribución de gastos del núcleo del cierre, que estas lecturas replican para que las dos superficies cuenten lo mismo"
  - phase: 07-financiero
    provides: "`supabase/tests/11_financiero.test.sql` (plan 07-01), bloques D y H, que son el contrato de esta migración"
provides:
  - "`supabase/migrations/20260913130000_26_lecturas_financieras.sql` — las seis lecturas financieras del admin"
  - "`public.resumen_financiero(date, date)` — los cuatro KPIs, los tres conteos y los dos márgenes, en UNA fila y UN recorrido"
  - "`public.costo_por_aseadora(date, date)` — el bloque 3 del Resumen, sin ninguna cifra de cobrado ni de margen por persona"
  - "`public.rentabilidad_aseos(date, date, uuid, uuid, text)` — FIN-02, la tabla de `/finanzas/aseos` con sus tres filtros"
  - "`public.aseos_de_aseadora(uuid, date, date)` — bloque 2 de la ficha, sin cobrado y sin margen"
  - "`public.gastos_de_aseadora(uuid, date, date)` — bloque 4 de la ficha, con la RUTA de la evidencia y nunca una URL"
  - "`public.aseo_en_curso_de_aseadora(uuid)` — bloque 1 de la ficha, sin ninguna columna de ubicación"
  - "Bloque L de `11_financiero.test.sql`: 18 aserciones (60 a 77) sobre la conciliación, las guardas y la regla del GPS"
affects: [07-09, 07-10, 07-11, 07-12, 07-13, 07-14]

tech-stack:
  added: []
  patterns:
    - "Una lectura VIVA y un snapshot contable conviven a propósito y ninguno reemplaza al otro: el Resumen calcula al vuelo sobre el rango que se le pida (y por eso el mismo cuerpo sirve al filtro de día, de semana y de mes), mientras que el pago queda congelado. La consecuencia declarada es que el Resumen SÍ ve un aseo que entró a un periodo ya cerrado, y eso no contradice la regla de no recalcular: esa regla congela el PAGO, no la métrica"
    - "La conciliación entre dos pantallas se afirma como IGUALDAD entre las dos funciones que las alimentan, más un seguro contra la vacuidad, en vez de como dos literales que alguien puede actualizar a la vez"
    - "Una regla de producto que prohíbe un dato (ubicación, cifra de huésped, URL firmada) se mide contra el `returns table` en `pg_proc` y no contra la fila: una siembra donde el dato fuera nulo haría pasar la aserción sin demostrar nada, y el dato viaja al navegador aunque la pantalla no lo pinte"
    - "Un derivado (la ganancia, el margen) se calcula en la base y no en la pantalla, para que haya UN solo sitio donde pueda estar mal"
    - "Un promedio sobre el conjunto vacío se devuelve NULO y no cero: un «$ 0 de margen promedio» en un día sin operación afirma que se trabajó y no se ganó nada, que es falso. Los totales sí van a cero, porque cero cobrado es un hecho del día"
    - "Un valor de enumeración desconocido en un argumento de filtro levanta `P0001` y no devuelve cero filas: un periodo vacío parece un dato («este mes no hubo gastos») cuando es un defecto. `P0001` y no `42501`, porque quien llama sí está autorizado y la pantalla necesita distinguir los dos casos"

key-files:
  created:
    - supabase/migrations/20260913130000_26_lecturas_financieras.sql
  modified:
    - lib/database.types.ts
    - supabase/tests/11_financiero.test.sql

key-decisions:
  - "`resumen_financiero` y `rentabilidad_aseos` NO exigen `aseador_id is not null`, a diferencia del núcleo del cierre, y `costo_por_aseadora` y `aseos_de_aseadora` SÍ. El cierre reparte dinero ENTRE PERSONAS: un aseo sin persona no tiene a quién pagarse. Las dos primeras miden el NEGOCIO: un aseo completado sin aseador asignado (que `cl_completada_shape` permite, aunque la máquina de estados de la Fase 4 no lo produzca) sí se le cobró al huésped y tiene que aparecer en el KPI de cobrado. La divergencia queda acotada por la aserción 62, que afirma que el KPI de pagos y la suma del bloque 3 dan el mismo número"
  - "Se devuelven DOS márgenes y no uno: `margen_total` = cobrado - pagado (la suma de la columna MARGEN del detalle, que no descuenta gastos porque esa tabla no tiene columna de gastos) y `ganancia` = cobrado - pagado - gastos (el KPI 4). Confundirlos pondría dos cifras distintas para «lo que queda» en la misma pantalla"
  - "`aseo_en_curso_de_aseadora` devuelve SIEMPRE una fila cuando el perfil existe, con las cuatro columnas del aseo nulas si no hay ninguno en curso. La pantalla tiene TRES estados y `esta_activa` hay que responderlo en los tres; con cero filas, «la cuenta está desactivada» sería indistinguible de «no tiene ningún aseo en curso». Cero filas queda reservado para un significado distinto: ese identificador no es de ningún perfil"
  - "`aseos_de_aseadora` no declara cobrado ni margen aunque sea una función de ADMIN y la aseadora no la pueda invocar. La razón no es de acceso: el desglose que ve el admin y el que ve la aseadora en `/mis-pagos` tienen que ser EL MISMO DOCUMENTO, o el día que alguien reclame estarán comparando dos papeles distintos"
  - "`costo_por_aseadora` ordena ALFABÉTICAMENTE y no por monto. Una lista de personas de mayor a menor se lee como un podio aunque no lleve números ni medallas, y este tema ya demostró ser sensible: es exactamente la razón por la que el dueño descartó el revenue por persona. El orden por monto es una elección explícita del admin en el selector, no el estado inicial"
  - "El bloque L se añadió AL FINAL del archivo de contrato, aunque su letra sea posterior a K. pgTAP numera por orden de ejecución y meterlo en medio correría los números 38 a 43, que el plan 07-09 cita, y los del bloque K, que cita 07-14. La contrapartida es que sus cifras están calculadas sobre el fixture ya mutilado por el bloque G, y la cuenta va escrita en la cabecera del bloque para que se pueda auditar a mano"
  - "Las banderas de gasto y de daño se calculan con `exists` y no con `count(*) > 0`. La tabla solo pinta un icono: `exists` corta en la primera fila, mientras que el conteo recorre todas las que haya para después tirar el número"
  - "`gastos_de_aseadora` usa `left join lateral` y no `join` contra la evidencia. Un gasto cuya foto ya se purgó sigue siendo un gasto que hay que reembolsar, y perderlo de la lista sería dejar de pagarlo; la pantalla pinta «Sin recibo disponible» en vez del botón"

patterns-established:
  - "Toda lectura financiera nueva nace por función con guarda de rol como PRIMERA sentencia del cuerpo, nunca por grant: admin y aseador comparten el rol Postgres `authenticated` y «solo el admin» no existe como categoría de grant. Es la tercera migración consecutiva que lo aplica (16, 24, 26)"
  - "Una función de lectura que alimenta dos pantallas distintas del mismo periodo replica LITERALMENTE el filtro y la conversión de fecha de la superficie con la que tiene que cuadrar, y esa coincidencia se afirma con una aserción de conciliación en vez de dejarse al cuidado de quien lea el código"
  - "Un comentario de función documenta lo que la función NO devuelve cuando la ausencia es una decisión de producto, con el argumento entero: sin eso, el siguiente que la amplíe va a añadir la columna que falta creyendo que era un olvido"

requirements-completed: [FIN-02, FIN-05]

coverage:
  - id: D1
    description: "El admin obtiene los cuatro números del periodo y los tres conteos en una sola llamada, y ninguno incluye un apartamento de gestión externa"
    requirement: "FIN-05"
    verification:
      - kind: integration
        ref: "supabase/tests/11_financiero.test.sql aserción 37 — los tres conteos del bloque 2 dan `5|2|1` sobre el fixture completo: el informativo JX, programado dentro del rango y sin estado, no entra en `aseos_hechos`"
        status: pass
      - kind: integration
        ref: "aserción 21 — el admin SÍ obtiene fila de `resumen_financiero`, así que una guarda escrita al revés (que deniegue a todo el mundo) no pasa"
        status: pass
      - kind: integration
        ref: "aserción 61 — los cuatro KPIs dan `480000|190000|8000|282000` con la aritmética a la vista, y la ganancia se calcula en la base"
        status: pass
    human_judgment: false
  - id: D2
    description: "El admin obtiene la rentabilidad aseo por aseo, calculada contra las tarifas congeladas en cada aseo y nunca contra las vigentes del apartamento"
    requirement: "FIN-02"
    verification:
      - kind: integration
        ref: "supabase/tests/11_financiero.test.sql aserción 20 — el admin obtiene filas de `rentabilidad_aseos`"
        status: pass
      - kind: integration
        ref: "aserción 36 — devuelve filas y NINGUNA es del apartamento de gestión externa, escrito como `hay filas | filas externas` para que el conjunto vacío no pase por vacuidad"
        status: pass
      - kind: integration
        ref: "aserción 61 — el bloque F editó la tarifa del Apto 7A a 200000/99000 DESPUÉS de cerrar; el cobrado del periodo sigue dando 480000 y no 700000, que es lo que daría sumando tarifas vivas. Es la regresión de FIN-01 medida desde la lectura"
        status: pass
      - kind: integration
        ref: "aserciones 63 y 64 — un filtro de tipo desconocido levanta P0001, y `con-danos` devuelve exactamente el aseo que generó un daño (sin la 64, una función que ignorase el argumento pasaría la 63)"
        status: pass
    human_judgment: false
  - id: D3
    description: "La fila de totales del detalle cuadra exactamente con los KPIs del Resumen del mismo periodo"
    requirement: "FIN-02"
    verification:
      - kind: integration
        ref: "supabase/tests/11_financiero.test.sql aserción 60 — `resumen_financiero.cobrado = sum(rentabilidad_aseos.cobrado)` y lo mismo con pagado, afirmado como igualdad y con un tercer booleano que impide que dos conjuntos vacíos «cuadren»"
        status: pass
      - kind: integration
        ref: "aserción 62 — el KPI de pagos y el de gastos cuadran con la suma del bloque 3, que es la otra conciliación de la misma pantalla"
        status: pass
      - kind: integration
        ref: "aserción 69 — el desglose de aseos de la ficha de 7A suma `3|135000`, el mismo número que su fila en el bloque 3"
        status: pass
    human_judgment: false
  - id: D4
    description: "Una aseadora que invoque cualquiera de estas funciones recibe una denegación, no una fila vacía"
    requirement: "FIN-02"
    verification:
      - kind: integration
        ref: "supabase/tests/11_financiero.test.sql aserciones 17 y 18 — una aseadora que llama a `rentabilidad_aseos` o a `resumen_financiero` recibe 42501"
        status: pass
      - kind: integration
        ref: "aserciones 65, 68, 70 y 73 — lo mismo para `costo_por_aseadora`, `aseos_de_aseadora`, `gastos_de_aseadora` y `aseo_en_curso_de_aseadora`"
        status: pass
      - kind: integration
        ref: "supabase/tests/02_guardarrailes.test.sql aserción 9 — ninguna función de `public` ni de `private` es ejecutable por el rol anónimo. Las seis nuevas entran solas en ese recorrido y el archivo sigue en verde con sus 10 aserciones"
        status: pass
      - kind: integration
        ref: "aserción 67 — ni `costo_por_aseadora` ni `aseos_de_aseadora` DECLARAN ninguna columna de cobrado, margen o cifra de huésped, medido sobre el `returns table` en `pg_proc` y no sobre la fila"
        status: pass
    human_judgment: false
  - id: D5
    description: "La ficha de una persona responde qué está haciendo ahora con lo que el sistema ya sabe, sin ninguna forma de rastreo"
    requirement: "FIN-02"
    verification:
      - kind: integration
        ref: "supabase/tests/11_financiero.test.sql aserción 74 — `aseo_en_curso_de_aseadora` no declara NINGUNA columna que empareje con ubicación, coordenada, latitud, longitud, GPS, última conexión ni estado en línea. Medido sobre el catálogo porque el dato viaja al navegador aunque la pantalla no lo pinte"
        status: pass
      - kind: integration
        ref: "aserciones 75, 76 y 77 — los tres estados de la pantalla: en curso (`true|Apto 7B (fixture)|09:15`, con la hora leída en Bogotá), cuenta desactivada (`false|<sin aseo>`, con fila y sin aseo inventado) y un identificador que no es de nadie (cero filas)"
        status: pass
      - kind: integration
        ref: "aserciones 71 y 72 — `gastos_de_aseadora` devuelve el bucket y la ruta de la evidencia, y el catálogo confirma que declara `evidencia_path` y NINGUNA columna de URL"
        status: pass
    human_judgment: false

duration: 55min
completed: 2026-09-13
status: complete
---

# Fase 7 Plan 08: Las seis lecturas financieras del admin Summary

**Las seis lecturas existen y ninguna es contestable por una aseadora: los cuatro KPIs y los tres conteos en una sola llamada coherente, la rentabilidad aseo por aseo contra las tarifas congeladas, y la ficha de una persona sin ninguna capacidad de rastreo que el producto no tiene. La conciliación entre el Resumen y el detalle es una aserción, no una esperanza.**

## Lo que se construyó

`supabase/migrations/20260913130000_26_lecturas_financieras.sql`, 813 líneas y
seis funciones. Todas `security definer` con el camino de búsqueda vacío, todas
con la guarda de admin como primera sentencia ejecutable del cuerpo, y todas con
su par de `revoke` + `grant` pegado a la definición.

| Función | Alimenta | Lo que NO devuelve |
|---|---|---|
| `public.resumen_financiero(date, date)` | los 4 KPIs y las 3 filas de conteo (§6.3 y §6.4) | — |
| `public.costo_por_aseadora(date, date)` | el bloque 3 del Resumen (§6.5) | ninguna cifra de cobrado, ningún margen por persona |
| `public.rentabilidad_aseos(date, date, uuid, uuid, text)` | la tabla de `/finanzas/aseos` (§7) | ningún apartamento de gestión externa |
| `public.aseos_de_aseadora(uuid, date, date)` | bloque 2 de la ficha (§8.2) | cobrado y margen |
| `public.gastos_de_aseadora(uuid, date, date)` | bloque 4 de la ficha (§8.2 y §8.3) | ninguna URL: devuelve bucket y ruta |
| `public.aseo_en_curso_de_aseadora(uuid)` | bloque 1 de la ficha (§8.4) | ninguna coordenada, ninguna última conexión |

## Las cinco propiedades, y dónde están escritas

**1. El Resumen es una lectura VIVA, y ese es el contrato.**
La migración 25 congela el pago: lo que una persona ya cobró no se recalcula
nunca. Este archivo hace lo contrario a propósito, porque son dos preguntas
distintas. El periodo llega por argumento, así que el mismo cuerpo sirve al
filtro de día, al de semana y al de mes: el rango lo deriva la pantalla, el
cálculo lo hace la base. La consecuencia está declarada en el comentario y
afirmada en la aserción 37: `resumen_financiero` SÍ ve el aseo tardío que entró
a un periodo ya cerrado, y `cleaner_payouts` no. Eso no contradice la regla de no
recalcular, que congela el pago y no la métrica.

**2. Un solo recorrido, y no es optimización prematura.**
Son nueve números que tienen que ser coherentes entre sí. Con nueve consultas
separadas, en `read committed` cada una toma su propio snapshot: si alguien
termina un aseo justo en medio, la ganancia deja de ser cobrado menos pagos menos
gastos y el admin ve una resta que no cuadra en su propia pantalla. Es el mismo
argumento que el núcleo del cierre, aplicado a lectura.

**3. Las cifras salen del ASEO, nunca del apartamento.**
`c.tarifa_huesped` y `c.pago_aseador`, jamás `pr.tarifa_huesped`: el apartamento
se une solo por el nombre, que es lo único que la tabla pinta de él. El bloque F
del contrato deja el Apto 7A a 200000/99000 *después* de cerrar; si alguna de
estas lecturas sumara tarifas vivas, el cobrado del periodo daría 700000 en vez
de 480000 y la aserción 61 se pondría roja. Es FIN-01 medido desde la lectura.

**4. La conciliación es una aserción.**
Tres, en realidad: el detalle contra los KPIs (60), el bloque 3 contra el KPI de
pagos y el de gastos (62), y la ficha de una persona contra su fila del bloque 3
(69). Las tres se escriben como IGUALDAD entre las funciones y no como literales
que alguien pueda actualizar a la vez, y la 60 lleva además un tercer booleano
que impide que dos conjuntos vacíos «cuadren». Si estas cifras no cuadraran, el
admin vería dos números distintos para lo mismo en dos pantallas y dejaría de
creerle a las dos.

**5. Lo que NO se devuelve va medido sobre el catálogo, no sobre la fila.**
`aseo_en_curso_de_aseadora` no declara ninguna columna de la que se derive una
posición (74), `costo_por_aseadora` y `aseos_de_aseadora` no declaran cobrado ni
margen (67), y `gastos_de_aseadora` declara la ruta y ninguna URL (72). Se mide
contra el `returns table` en `pg_proc` porque **el dato viaja al navegador aunque
la pantalla no lo pinte**, y porque una siembra donde el dato fuera nulo haría
pasar una aserción sobre la fila sin demostrar absolutamente nada.

## Decisiones que se tomaron aquí

**Dos filtros distintos, y la divergencia está acotada por una aserción.**
El núcleo del cierre exige `aseador_id is not null and pago_aseador is not null`
porque reparte dinero entre personas. `resumen_financiero` y `rentabilidad_aseos`
NO lo exigen: miden el negocio, y un aseo completado sin aseador asignado (que
`cl_completada_shape` permite, aunque la máquina de estados de la Fase 4 no lo
produzca) sí se le cobró al huésped. `costo_por_aseadora` y `aseos_de_aseadora`
sí lo exigen, porque un desglose por persona no puede tener una fila sin persona
y agrupar los huérfanos bajo un nulo produciría una fila fantasma. La aserción 62
es lo que impide que esa divergencia se convierta en dos cifras distintas.

**Dos márgenes y no uno.** `margen_total` = cobrado - pagado, que es la suma de
la columna MARGEN del detalle (esa tabla no tiene columna de gastos). `ganancia`
= cobrado - pagado - gastos, que es el KPI 4. No son el mismo número, van
nombrados por lo que son, y confundirlos pondría dos cifras distintas para «lo
que queda» en la misma pantalla.

**El margen promedio es ausencia y no cero cuando no hubo aseos.** `avg` sobre el
conjunto vacío devuelve nulo y así se deja. Los cuatro KPIs sí van a cero, porque
cero cobrado es un hecho del día; un promedio sin muestra no es un hecho.

**`aseo_en_curso_de_aseadora` devuelve siempre una fila si el perfil existe.** La
pantalla tiene tres estados y solo dos hablan de un aseo. `esta_activa` hay que
responderlo en los tres, así que las cuatro columnas del aseo vienen nulas cuando
no hay ninguno en curso, y cero filas queda reservado para un significado
distinto: ese identificador no es de ningún perfil. Las aserciones 75, 76 y 77
miden los tres estados por separado.

**`aseos_de_aseadora` no lleva cobrado ni margen aunque sea una función de
admin.** La razón no es de acceso: es que el desglose del admin y el del aseador
en `/mis-pagos` tienen que ser **el mismo documento**. Si el admin ve una columna
de más, el día que alguien reclame van a estar comparando dos papeles distintos,
y esa conversación se pierde antes de empezar.

**El orden alfabético del bloque 3.** Una lista de personas ordenada de mayor a
menor se lee como un podio aunque no lleve números ni medallas, y este tema ya
demostró ser sensible: es exactamente la razón por la que el dueño descartó el
revenue por persona. El orden por monto sigue existiendo, pero como una pregunta
que alguien hace en el selector, no como una jerarquía que la pantalla afirma
sola.

## El estado del contrato pgTAP, bloque por bloque

Antes de este plan: **334 aserciones, 12 rojas**. Después: **352 aserciones,
6 rojas**, y las seis son las declaradas del plan 07-09.

| Bloque de `11_financiero.test.sql` | Aserciones | Antes | Después | Responsable de lo que siga rojo |
|---|---|---|---|---|
| A siembra | 1 | verde | verde | — |
| B calendario del cierre | 6 | verde | verde | — |
| C pertenencia en hora de Bogotá | 5 | verde | verde | — |
| D frontera del aseador | 10 | **4 rojas** (17, 18, 20, 21) | **verde** | — |
| E el cierre calcula lo que debe | 8 | verde | verde | — |
| F idempotencia | 3 | verde | verde | — |
| H informativos fuera de todo | 4 | **2 rojas** (36, 37) | **verde** | — |
| I lo que ve el aseador | 6 | **6 rojas** (38 a 43) | **6 rojas** | 07-09 (migración 27) |
| J el recibo dura cinco años | 3 | verde | verde | — |
| G supervivencia al borrado | 6 | verde | verde | — |
| K las dos puertas del cierre | 7 | verde | verde | — |
| **L las seis lecturas del admin** | **18** | **no existía** | **verde** | — |

Las otras once suites pgTAP conservan sus 275 aserciones y siguen en verde, entre
ellas `02_guardarrailes.test.sql` con sus **10 aserciones**, cuyo guardarraíl 9
(«ninguna función de `public` ni `private` es ejecutable por el rol anónimo»)
recorre ahora también las seis funciones nuevas.

## Las puertas

| Puerta | Resultado |
|---|---|
| `npm run db:test` | 352 aserciones, 12 archivos. Solo las 6 declaradas de 07-09 en rojo |
| `npm run db:lint` | sin errores de schema |
| `npm run db:advisors` | sin problemas |
| `npm run db:types:check` | sin diferencia |
| `npx tsc --noEmit` | limpio |
| `npm run lint` | 0 errores (2 warnings preexistentes en archivos de test, ajenos a este plan) |
| `npm run ci:arch` | los tres guardarraíles en OK |
| `npm run test:integration` | 190 en verde, 21 archivos |
| `npm run test:unit` | 1111 en verde, 59 archivos |

## Deviations from Plan

**1. [Rule 2 - Funcionalidad crítica ausente] El bloque L del contrato pgTAP**

- **Encontrado en:** tarea 1 y tarea 2.
- **El hueco:** los criterios de aceptación pedían literalmente una «aserción
  dedicada» para la conciliación, una para el rechazo del filtro desconocido, y
  el 42501 de la aseadora para las cuatro funciones nuevas. Ninguna existía: la
  Wave 0 solo había escrito el contrato de `rentabilidad_aseos` y
  `resumen_financiero` (aserciones 17, 18, 20, 21, 36, 37). Sin ese bloque, las
  cuatro funciones restantes se habrían entregado sin una sola medición y las
  tres reglas de producto que prohíben un dato (ubicación, cobrado por persona,
  URL firmada) habrían quedado como comentarios.
- **Qué se hizo:** 18 aserciones nuevas (60 a 77) **al final del archivo**, no en
  el sitio alfabético del bloque. pgTAP numera por orden de ejecución y meterlas
  en medio correría los números 38 a 43, que el plan 07-09 cita, y los de K, que
  cita 07-14. `plan(59)` pasó a `plan(77)` y la cabecera del archivo documenta
  ahora la regla para quien lo amplíe.
- **Contrapartida declarada:** el bloque L va después de G, que borra un aseo y
  un gasto de la siembra, así que sus cifras están calculadas sobre el fixture
  mutilado. La cuenta completa va escrita en la cabecera del bloque para que se
  pueda auditar a mano.
- **Archivos:** `supabase/tests/11_financiero.test.sql`
- **Commit:** `0056ab6`

**2. [Rule 2 - Funcionalidad crítica ausente] Dos siembras dentro del bloque L**

- **Encontrado en:** al escribir la aserción 71.
- **El hueco:** la foto del recibo que la siembra original creaba colgaba del
  gasto del Detergente, y el bloque G borra ese gasto: la foto se va en cascada.
  La aserción sobre «devuelve la ruta de la evidencia» habría pasado con la ruta
  nula, o sea por vacuidad. Y la siembra no tiene ningún aseo en estado en curso,
  así que la aserción del bloque «Ahora mismo» nunca habría demostrado que la
  función encuentra un aseo.
- **Qué se hizo:** dos escrituras en su propia sentencia dentro del bloque L (un
  recibo para el gasto que sobrevive, y un aseo en curso en una fecha que ningún
  otro del fixture ocupa, para no chocar con
  `cleanings_one_active_per_property_date`). Van al final del archivo, así que no
  contaminan ningún bloque anterior.
- **Archivos:** `supabase/tests/11_financiero.test.sql`
- **Commit:** `0056ab6`

**3. [Decisión de diseño] `aseo_en_curso_de_aseadora` devuelve fila siempre**

El plan decía «cero filas de aseo cuando no tiene ninguno» y a la vez «más si la
cuenta está activa». Las dos cosas literalmente juntas no son implementables: si
no hay fila, no hay dónde poner si la cuenta está activa. Se resolvió devolviendo
una fila por perfil con las cuatro columnas del aseo nulas, que es lo que la
pantalla necesita para sus tres estados, y reservando cero filas para el caso
distinto de «ese identificador no es de ningún perfil». Queda documentado en el
comentario de la función y medido por las aserciones 75, 76 y 77.

## Lo que este plan NO hizo

- **No escribe nada en la base.** Las seis son de lectura pura.
- **No crea ninguna pantalla.** El UI de `/finanzas` es 07-10 en adelante.
- **No crea las lecturas del aseador.** `mis_pagos_cerrados` y
  `detalle_de_mi_pago` son la migración 27, plan 07-09, y son las 6 aserciones
  que siguen rojas.
- **No firma ninguna URL de Storage.** Las funciones devuelven bucket y ruta;
  firmar es trabajo del servidor de la aplicación, después de su propio guard.

## Self-Check: PASSED

Los cuatro archivos existen en disco y los tres commits están en el historial
(`eae8c61` la migración, `0056ab6` el bloque L, `b05d26c` los tipos).
