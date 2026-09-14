---
phase: 07-financiero
plan: 07
subsystem: database
tags: [postgres, migracion, pg-cron, idempotencia, security-definer, snapshot-contable, timezone]

requires:
  - phase: 01-fundaciones
    provides: "`public.today_bog()`, el único helper de fecha permitido en un job, y el patrón definer del repo (search_path vacío, nombres calificados, revoke/grant pegado a la definición)"
  - phase: 01-fundaciones
    provides: "`private.is_admin()` (migración 08), que consulta `profiles` en vivo y no un claim del JWT"
  - phase: 03-calendario
    provides: "El patrón de agendado con `cron.schedule` (migración 14) y su poda de `cron.job_run_details`"
  - phase: 07-financiero
    provides: "Migración 23 (plan 07-04): `ultimo_dia_habil_del_mes`, `dia_bog`, `periodo_de_cierre` y las tres tablas del snapshot"
  - phase: 07-financiero
    provides: "`supabase/tests/11_financiero.test.sql` (plan 07-01), bloques C, E, F, G y H, que son el contrato de esta migración"
provides:
  - "`supabase/migrations/20260913120000_25_cierre_de_periodo.sql` — el cierre completo"
  - "`private.cerrar_periodo_core(date, date) -> int` — el único sitio donde vive el cálculo del pago. Esquema privado, sin grant para ningún rol de la aplicación"
  - "`public.cerrar_periodo_si_toca() -> int` — la puerta del job, con la guarda de calendario dentro de la función"
  - "`public.cerrar_periodo(date, date) -> int` — la puerta de reintento del admin, con guarda de rol y validación del rango contra el calendario"
  - "`public.periodo_pendiente_de_cierre() -> table(periodo_desde, periodo_hasta)` — lo que enciende el aviso condicional de UI-SPEC §9.5"
  - "El job `cerrar-periodo-de-pago`, diario a las 04:30 en tiempo universal (23:30 de Bogotá)"
  - "Bloque K de `11_financiero.test.sql`: 7 aserciones sobre las dos puertas y sobre lo que ninguna deja pasar"
affects: [07-08, 07-09, 07-11, 07-12, 07-13, 07-14, 09-retencion]

tech-stack:
  added: []
  patterns:
    - "La idempotencia de un cierre contable se apoya en `unique + on conflict do nothing` sobre una cabecera de PERIODO, no en una comprobación previa ni en la unicidad por persona: con la unicidad por persona, una segunda corrida en la que apareciera alguien nuevo cerraría a medias un periodo ya cerrado"
    - "Un snapshot y su desglose se escriben en UNA sentencia con CTEs que modifican datos, nunca en dos: en `read committed` cada sentencia toma su propio snapshot y una fila que entre entre medias aparecería en el desglose sin aparecer en el total"
    - "La guarda de calendario de un job periódico vive DENTRO de la función, no en la expresión del cron: el comodín de último día del mes de `pg_cron` es el último día CALENDARIO, y eso cae en fin de semana en 8 de los 24 meses de 2026 y 2027"
    - "Un rango de fechas recibido de un cliente se normaliza contra la función de calendario de la base y se exige coincidencia exacta, en vez de validar sus partes por separado"
    - "Una aserción pgTAP nueva sobre un archivo ya citado por número se añade AL FINAL, aunque su letra de bloque no lo sea: pgTAP numera por orden de ejecución y meterla en medio corre los números que otros planes citan"

key-files:
  created:
    - supabase/migrations/20260913120000_25_cierre_de_periodo.sql
  modified:
    - lib/database.types.ts
    - supabase/tests/11_financiero.test.sql
    - supabase/tests/08_push_jobs.test.sql
    - .planning/phases/07-financiero/deferred-items.md

key-decisions:
  - "El arnés de pgTAP se corrigió, NO la guarda de admin. Las cinco invocaciones del cierre que la Wave 0 escribió con `pg_temp.correr` ejecutaban como `postgres` y sin claims, contra lo que `private.is_admin()` responde 42501: los bloques E, F, G y H se habrían quedado en rojo por el arnés. Relajar la guarda a «o es admin o no hay sesión» habría dejado entrar a la clave de servicio, y `e2e/fixtures.ts` documenta y depende del comportamiento contrario"
  - "Los pagos y sus líneas se escriben en UNA sentencia con CTEs que modifican datos. En `read committed` dos sentencias toman dos snapshots, y un aseo completado entre medias entraría en el desglose sin entrar en el total; el `check cp_total_cuadra` no lo vería, porque solo comprueba que el total sea la suma de las dos partidas"
  - "`full outer join` entre el total de aseos y el de gastos, no `left join` desde los aseos. Alguien puede tener gastos en el periodo sin ningún aseo propio (el suplente que compró detergente para el aseo de otra), y con un `left join` ese reembolso desaparecería sin dejar rastro"
  - "El contador de aseos no computados EXCLUYE los cancelados, contra la letra del plan («no estaban completados»). Un aseo cancelado no es trabajo pendiente de resolver: ya está resuelto. Contarlos haría subir el número todos los meses por motivos que no requieren ninguna acción, y un contador que siempre marca algo es un contador que el admin aprende a ignorar"
  - "`cerrar_periodo` exige que el día de cierre haya pasado ESTRICTAMENTE (`p_hasta < today_bog()`). El día del cierre todavía tiene aseos en curso y el job los recoge esa misma noche a las 23:30; el reintento del admin es para el día siguiente en adelante"
  - "`periodo_pendiente_de_cierre` solo mira lo posterior al último periodo cerrado. Sin ese corte, una base recién estrenada reportaría para siempre un periodo de hace un año en el que el sistema no existía, y el aviso quedaría encendido sin nada que hacer"
  - "El nombre de la aseadora se copia con un respaldo (`coalesce(nullif(btrim(full_name), ''), 'Aseador sin nombre')`). `cp_nombre_no_vacio` exige texto, y sin el respaldo un perfil sin nombre haría fallar el cierre ENTERO por una fila: el pago de una persona no se puede caer porque a otra le falte un dato cosmético"
  - "El job usa `public.today_bog()` y no la fecha de sesión, y aquí no es teoría: corre a las 23:30 de Bogotá, el único instante del día en que la fecha universal ya es el día siguiente. Con la fecha de sesión la guarda de calendario no se cumpliría NUNCA y el cierre no correría ningún mes"

patterns-established:
  - "Un job nuevo obliga a declarar el inventario en la aserción 14 de `08_push_jobs.test.sql`: es una lista cerrada a propósito, para que ningún job aparezca sin que nadie lo mire"
  - "Una función que pertenece al job y no a la aplicación se revoca de `public, anon, authenticated` y se le da `execute` a `postgres`, igual que `feed_health_watchdog`. El `execute` residual de `service_role` llega por `alter default privileges` y es la postura ya vigente de los otros tres jobs del sistema"
  - "Una aserción sobre un calendario se escribe como INVARIANTE y no como literal cuando el archivo se puede correr en cualquier mes: la aserción 59 mide «no nombra ninguno ya cerrado ni ninguno sin vencer» en vez de un valor esperado fijo que caducaría"

requirements-completed: [FIN-03, FIN-04, FIN-05]

coverage:
  - id: D1
    description: "Llegado el último día hábil del mes, el sistema calcula solo lo que se le debe a cada persona, con las dos partidas por separado y su desglose"
    requirement: "FIN-03"
    verification:
      - kind: integration
        ref: "supabase/tests/11_financiero.test.sql aserciones 23 a 29 — cabecera con sus dos fechas reales, una fila de pago por aseadora con aseos en el rango, `aseos=120000 gastos=12000 total=132000` para 7A y `aseos=55000 gastos=8000 total=63000` para 7B, tres líneas de aseo y una de gasto"
        status: pass
      - kind: integration
        ref: "Ejecución directa: `cerrar_periodo_si_toca()` devuelve 0 hoy (2026-09-13, cuyo día de cierre es el 30) y el núcleo forzado sobre agosto deja cabecera con `cerrado_por` nulo, que es el camino del job"
        status: pass
      - kind: integration
        ref: "Catálogo `cron.job`: `cerrar-periodo-de-pago | 30 4 * * * | active=t | select public.cerrar_periodo_si_toca()`, y `08_push_jobs.test.sql` aserción 14 con los cinco jobs del sistema"
        status: pass
    human_judgment: false
  - id: D2
    description: "Dos corridas del cierre no pagan dos veces, y un periodo ya cerrado no se recalcula ni aunque cambien los datos que lo sustentaban"
    requirement: "FIN-03"
    verification:
      - kind: integration
        ref: "supabase/tests/11_financiero.test.sql aserción 31 — segunda corrida sobre el mismo periodo: `2|195000`, mismas filas y mismos montos"
        status: pass
      - kind: integration
        ref: "aserción 32 — se corrige `pago_aseador` de 40000 a 99000 después de cerrar y se vuelve a correr: el pago de 7A sigue en 132000 y no en 309000"
        status: pass
      - kind: integration
        ref: "aserción 33 — entra un aseo nuevo al periodo ya cerrado, terminado dentro del rango, y el total sigue en `2|195000`"
        status: pass
    human_judgment: false
  - id: D3
    description: "Un aseo terminado a las 23:30 del día del cierre se paga en ESE periodo, y uno terminado a las 00:30 del día siguiente en el siguiente"
    requirement: "FIN-03"
    verification:
      - kind: integration
        ref: "supabase/tests/11_financiero.test.sql aserción 10 — JB (terminado 2026-07-31 23:30 de Bogotá, que en tiempo universal ya es el 1 de agosto) tiene UNA línea en el periodo de julio"
        status: pass
      - kind: integration
        ref: "aserción 11 — y CERO en el de agosto: un cálculo que lo metiera en los dos periodos pasaría la 10 y pagaría dos veces"
        status: pass
      - kind: integration
        ref: "aserción 12 — A1, que empezó el 31 de julio a las 23:50 y terminó el 1 de agosto a las 00:30, se paga en AGOSTO"
        status: pass
    human_judgment: false
  - id: D4
    description: "El desglose sobrevive al borrado del aseo y del gasto que lo originaron, y sigue siendo legible"
    requirement: "FIN-04"
    verification:
      - kind: integration
        ref: "supabase/tests/11_financiero.test.sql aserciones 47 y 51 — borrar a mano un aseo y un gasto de un periodo ya cerrado NO falla (sin cascada y sin FK restrictiva, así la purga de la Fase 9 no se atasca con 23503)"
        status: pass
      - kind: integration
        ref: "aserciones 48, 49, 50 y 52 — la cabecera sigue ahí, el pago sigue en 132000 y no recalculado a 92000, y las dos líneas conservan nombre de apartamento, concepto y monto legibles"
        status: pass
      - kind: integration
        ref: "aserción 28 — la línea de aseo lleva LAS DOS fechas distintas (programada 2026-07-09, ejecución 2026-07-10), así que una implementación que copiara la misma fecha dos veces no pasa"
        status: pass
      - kind: integration
        ref: "aserción 29 — la línea de gasto lleva la ruta y el bucket de la evidencia copiados"
        status: pass
    human_judgment: false
  - id: D5
    description: "Un aseo de gestión externa no entra ni en un monto ni en un conteo"
    requirement: "FIN-05"
    verification:
      - kind: integration
        ref: "supabase/tests/11_financiero.test.sql aserción 34 — el aseo informativo no aparece en NINGUNA línea del desglose. Deja de estar verde por vacuidad: ahora hay 8 líneas escritas contra las que medir"
        status: pass
      - kind: integration
        ref: "aserción 35 — el contador de aseos no computados vale 1 (JP, gestionado y sin completar) y no 2: el informativo JX está programado dentro del rango y tampoco completado, y un contador sin el filtro de gestión propia daría 2"
        status: pass
    human_judgment: false
  - id: D6
    description: "Ni el núcleo ni las dos puertas de admin son alcanzables por una aseadora, y un admin no puede cerrar un periodo por adelantado"
    requirement: "FIN-03"
    verification:
      - kind: integration
        ref: "supabase/tests/11_financiero.test.sql aserciones 53 y 54 — una aseadora que llama a `cerrar_periodo` o a `periodo_pendiente_de_cierre` recibe 42501"
        status: pass
      - kind: integration
        ref: "aserciones 55 y 56 — el núcleo no es invocable desde una sesión de la aplicación (42501, probado EJECUTÁNDOLO) y el catálogo confirma que tiene UNA sola concesión de ejecución y ninguna es de `PUBLIC`, `anon` ni `authenticated`"
        status: pass
      - kind: integration
        ref: "aserciones 57 y 58 — el admin no puede cerrar el periodo en curso (rango real pero no vencido) ni un rango inventado (vencido pero que no es un periodo de cierre): P0001 en los dos, y se discriminan por la entrada"
        status: pass
      - kind: integration
        ref: "aserción 59 — el aviso de periodo pendiente no nombra ninguno ya cerrado ni ninguno sin vencer, y nombra como mucho uno. Escrita como invariante para que no caduque el mes que viene"
        status: pass
    human_judgment: false

duration: 95min
completed: 2026-09-13
status: complete
---

# Fase 7 Plan 07: El cierre del periodo Summary

**El cierre existe: un job diario con la guarda de calendario dentro de la función, un núcleo privado que calcula el pago de cada persona y lo congela, y un RPC de admin para reintentarlo cuando el job falle. Dos corridas no pagan dos veces porque la cabecera del periodo es la autoridad, no una comprobación.**

## Lo que se construyó

`supabase/migrations/20260913120000_25_cierre_de_periodo.sql`, 701 líneas, cuatro
funciones y un job.

| Objeto | Dónde vive | Quién lo puede ejecutar |
|---|---|---|
| `private.cerrar_periodo_core(date, date) -> int` | esquema `private` | solo `postgres` (una concesión, verificada contra el catálogo) |
| `public.cerrar_periodo_si_toca() -> int` | `public` | `postgres` (el job) y `service_role`, igual que los otros tres jobs |
| `public.cerrar_periodo(date, date) -> int` | `public` | `authenticated`, con guarda de admin como primera operación |
| `public.periodo_pendiente_de_cierre()` | `public` | `authenticated`, con guarda de admin |
| job `cerrar-periodo-de-pago` | `cron.job` | `30 4 * * *` = 23:30 de Bogotá |

## Las cuatro propiedades, y dónde están escritas en el código

**1. La idempotencia es lo PRIMERO del núcleo, antes de leer un solo aseo.**
El cuerpo abre con un `insert ... on conflict (periodo_desde) do nothing` sobre la
cabecera de periodo y un `get diagnostics ... row_count`: si no se insertó nada, el
periodo ya estaba cerrado y la función sale devolviendo cero. D7-3 queda como una
guarda de dos líneas en vez de como una convención que alguien tiene que recordar.

Y serializa de verdad, no por suerte: con dos corridas simultáneas (el job y el
botón del admin a la vez), `on conflict do nothing` espera al token de inserción
especulativa de la otra transacción y, cuando esta confirma, inserta cero filas.
El motor hace el trabajo.

**La autoridad es la cabecera de PERIODO y no el pago de cada persona.** Con la
unicidad solo por persona, una segunda corrida en la que apareciera una aseadora
nueva cerraría *a medias* un periodo ya cerrado, que es exactamente lo que D7-3
prohíbe. La migración 23 ya lo había previsto al añadir `payout_periods`; este
plan es quien lo usa.

**2. La pertenencia sale de `public.dia_bog(finished_at)`.** El filtro va escrito
tal cual lo pedía el plan, y las cuatro líneas tienen su razón en el comentario:
`is_managed` explícito (FIN-05 incluye los conteos, y un conteo no se salva por un
nulo), igualdad a `completada` y no «distinto de cancelada», el instante de fin y
no la fecha programada, y la conversión de zona sin la cual todo aseo terminado
entre las 19:00 y la medianoche cae en el día siguiente.

**3. El pago son dos partidas separadas más el total, y el desglose es texto.**
Los tres punteros al mundo vivo se copian como identificadores desnudos, sin clave
foránea, tal como la migración 23 los declaró. Todo lo legible (nombre del
apartamento, concepto, monto, las dos fechas, el bucket y la ruta de la evidencia)
va copiado como valor.

**4. El job decide, no el cron.** La guarda de calendario es la primera línea del
cuerpo de `cerrar_periodo_si_toca`. 364 días al año la función no hace nada.

## Decisiones que se tomaron aquí, con su razón

### El cuerpo del núcleo es UNA sola sentencia, y no es estilo

Los pagos y sus líneas se escriben con CTEs que modifican datos, no en dos
sentencias seguidas. En `read committed` cada sentencia toma su propio snapshot:
con dos, un aseo que se complete entre la primera y la segunda entraría en el
**desglose** sin haber entrado en el **total**, y el `check cp_total_cuadra` de la
migración 23 no lo atraparía, porque solo verifica que el total sea la suma de las
dos partidas. El resultado sería un recibo cuyas líneas suman más que lo que se
paga, descubierto por quien cobra. Todas las CTEs de una misma sentencia comparten
un snapshot: el agujero no existe por construcción.

### `full outer join` y no `left join` desde los aseos

Alguien puede tener gastos en el periodo sin tener ningún aseo propio en él: el
suplente que compró detergente para el aseo de otra. Con un `left join` desde los
aseos, ese reembolso desaparecería sin dejar rastro, que es la forma más silenciosa
de no pagarle a alguien lo que puso de su bolsillo.

Verificado ejecutando contra la base: un gasto de 7.000 reportado por Luz sobre un
aseo de María produce **dos** filas de pago, la de Luz con `aseos=0 gastos=7000
total=7000 cantidad_aseos=0 cantidad_gastos=1`, y su línea de desglose hereda las
dos fechas del aseo (que la migración 23 declaró `not null`).

### El contador de no computados EXCLUYE los cancelados

**Desviación declarada respecto a la letra del plan**, que decía «no estaban
completados». Un aseo cancelado (una reserva que se cayó, que en 34 unidades pasa
varias veces al mes) no es trabajo pendiente de resolver: ya está resuelto. Si se
contaran, el número subiría todos los meses por motivos que no requieren ninguna
acción, y un contador que siempre marca algo es un contador que el admin aprende a
ignorar. Eso destruiría la única señal que justifica la columna.

La aserción 35 pasa igual: mide que el informativo no se cuente, no los cancelados.

### `cerrar_periodo` valida el rango contra el calendario, no por partes

Se le pregunta a `public.periodo_de_cierre(p_hasta)` cuál es el periodo y se exige
coincidencia ENTERA. Eso rechaza de un golpe un rango inventado, un rango del 1 al
31 cuando el periodo real iba del 30 de mayo al 30 de junio (D7-5), y un `p_hasta`
que no sea un día de cierre.

Y el día de cierre tiene que haber pasado **estrictamente**. El día del cierre
todavía tiene aseos en curso y el job los recoge esa misma noche a las 23:30; el
reintento del admin es para el día siguiente en adelante. Sin esa validación un
admin pagaría por trabajo que aún no ocurrió y D7-3 congelaría el error para
siempre (T-07-30).

### `periodo_pendiente_de_cierre` solo mira lo posterior al último cierre

Sin ese corte, una base recién estrenada reportaría como pendiente un periodo de
hace un año en el que el sistema ni existía, y el aviso de UI-SPEC §9.5 quedaría
encendido para siempre sin nada que hacer.

**Consecuencia declarada:** si el cierre de julio falló y el de agosto sí corrió,
julio no aparece en el aviso. No es un olvido; reabrir un periodo anterior al
último cerrado no es una operación que la interfaz ofrezca, y el camino sigue
existiendo llamando a `cerrar_periodo` con el rango de julio. El aviso es para el
hueco del final, que es el que deja a alguien sin cobrar este mes.

### El nombre copiado lleva respaldo

`coalesce(nullif(pg_catalog.btrim(pf.full_name), ''), 'Aseador sin nombre')`. El
`check cp_nombre_no_vacio` exige texto, y sin el respaldo un perfil sin nombre
haría fallar el cierre **entero** por una fila. El pago de una persona no se puede
caer porque a otra le falte un dato cosmético.

## Deviations from Plan

### 1. [Rule 3 - Blocking] El arnés de pgTAP invocaba el cierre sin sesión

**Encontrado durante:** Task 2, al ver que los bloques E, F, G y H seguían rojos
con la migración ya aplicada y sin un solo error en el log.

**El problema.** La Wave 0 escribió las cinco invocaciones del cierre con
`pg_temp.correr`, que ejecuta como `postgres` y **sin claims de JWT**. Contra eso,
`public.cerrar_periodo` responde `42501` y no escribe nada: su primera operación es
`private.is_admin()`, que resuelve `auth.uid()` contra `profiles`, y sin claims
`auth.uid()` es nulo. Los cuatro bloques se habrían quedado en rojo **por el arnés
y no por el código**, para siempre.

Es una inconsistencia interna del propio 07-01: su PLAN declara la guarda de admin
en la línea 86 (`public.cerrar_periodo(date, date) | definer, guarda de admin`) y su
test la invoca por una vía que esa guarda rechaza.

**La corrección, y por qué va en el arnés y no en la guarda.** Aflojar la guarda a
«o es admin o no hay sesión» dejaría entrar a la **clave de servicio**, que tampoco
tiene `auth.uid()`. Y `e2e/fixtures.ts` documenta y depende del comportamiento
contrario, con todas las letras: siembra el cierre abriendo una sesión de admin de
verdad *precisamente* porque la clave de servicio no pasa la guarda (líneas
1080-1093).

Cambiar el arnés además **fortalece** el archivo: a partir de aquí los bloques E, F,
G y H prueban el cierre por el camino REAL de producción (un admin autenticado
invocando el RPC) y no por un atajo de superusuario que ningún cliente puede tomar.

**Archivos modificados:** `supabase/tests/11_financiero.test.sql` (5 invocaciones).
**Commit:** `fb7ab70`.

### 2. [Rule 2 - Funcionalidad crítica] Bloque K: las guardas no tenían aserción

**Encontrado durante:** Task 2. El plan exige literalmente «Una aseadora que invoca
cualquiera de las dos funciones de admin recibe 42501, **con su aserción en
pgTAP**», y el contrato de Wave 0 no tenía ninguna: `plan(52)` no cubría ni una sola
de las tres amenazas T-07-30, T-07-31 y T-07-32.

**Lo añadido:** bloque K, 7 aserciones, `plan(52)` → `plan(59)`.

| # | Qué mide | Amenaza |
|---|---|---|
| 53 | una aseadora llamando a `cerrar_periodo` recibe 42501 | T-07-31 |
| 54 | una aseadora llamando a `periodo_pendiente_de_cierre` recibe 42501 | T-07-31 |
| 55 | el núcleo no es invocable desde una sesión de la aplicación, probado EJECUTÁNDOLO | T-07-32 |
| 56 | y el catálogo: una sola concesión de ejecución, ninguna de `PUBLIC`/`anon`/`authenticated` | T-07-32 |
| 57 | el admin no puede cerrar el periodo EN CURSO (rango real, no vencido) | T-07-30 |
| 58 | ni un rango inventado (vencido, pero que no es un periodo de cierre) | T-07-30 |
| 59 | el aviso de pendiente no nombra ninguno cerrado ni ninguno sin vencer, y nombra ≤ 1 | FIN-03 |

**Va AL FINAL aunque su letra no lo sea.** pgTAP numera por orden de ejecución, y
meterlo en su sitio alfabético habría corrido los números de los bloques H, I, J y
G, que están citados **por número** en este archivo y en los planes 07-08, 07-09 y
07-14. Las siete son insensibles a la mutilación del fixture que hace G: ninguna lee
montos, y las dos cabeceras de periodo siguen ahí (aserción 48).

**Dos detalles que costaron pensar:**
- **57 y 58 se discriminan por la ENTRADA, no por el código de error.** Las dos dan
  `P0001`. 57 manda un periodo *real* (pedido al calendario, así que la validación de
  forma no puede ser la que lo rechace) que no ha vencido; 58 manda uno vencido que
  no es un periodo. Cada una solo puede fallar por su propia guarda.
- **59 está escrita como invariante y no como literal.** El archivo se corre en
  cualquier mes; un valor esperado fijo diría «julio» en septiembre y «octubre» en
  noviembre, y se pondría rojo sin que nadie tocara nada. El rango de 57 se pide al
  calendario por la misma razón.

**Commit:** `fb7ab70`.

### 3. [Rule 1 - Regresión] El inventario de jobs pasa de cuatro a cinco

**Encontrado durante:** Task 1, en la primera corrida tras aplicar la migración.
`08_push_jobs.test.sql` aserción 14 se puso roja: es un inventario cerrado de los
jobs del sistema.

**Es exactamente el trabajo de esa aserción**, no un defecto: añadir un job obliga a
declararlo en vez de que aparezca sin que nadie lo mire. Actualizada a cinco, con el
quinto nombrado y con la razón del horario escrita al lado.

**Archivo:** `supabase/tests/08_push_jobs.test.sql`. **Commit:** `fb7ab70`.

## Deferred Issues

**El pago de una persona asume UNA sola moneda.** `cleaner_payouts` tiene una única
columna `moneda`, pero `expenses` ganó la suya en la migración 18. El núcleo copia
la moneda de cada gasto a su línea (correcto) y deja la del pago en su valor por
defecto. Si un periodo mezclara dos monedas, `monto_gastos` sumaría peras con
manzanas y `cp_total_cuadra` no lo vería.

**Latente, no vivo:** hoy no existe ninguna superficie que permita escribir un gasto
fuera de `COP`. Anotado en `deferred-items.md` con el arreglo (agrupar también por
moneda y ampliar la clave única) y con el detonante. **Es más barato antes de tener
histórico financiero vivo.**

## El contrato pgTAP, bloque por bloque

Línea base al empezar (cierre de 07-05): **327 aserciones, 29 rojas**.
Al terminar: **334 aserciones, 12 rojas**. Los once archivos anteriores conservan
sus 275, más la aserción 14 de push actualizada.

| Bloque de `11_financiero.test.sql` | Antes | Ahora | Responsable de lo que queda |
|---|---|---|---|
| A siembra | 1/1 | **1/1** | — |
| B calendario del cierre | 6/6 | **6/6** | — |
| C hora de Bogotá | 3/5 | **5/5** ✔ | — |
| D frontera del aseador | 6/10 | 6/10 | 17, 18, 20, 21 → **07-08** (las tres funciones de lectura) |
| E el cierre calcula | 1/8 | **8/8** ✔ | — |
| F idempotencia | 0/3 | **3/3** ✔ | — |
| H informativos fuera | 1/4 | 2/4 | 36, 37 → **07-08** (`rentabilidad_aseos`, `resumen_financiero`) |
| I lo que ve el aseador | 0/6 | 0/6 | 38 a 43 → **07-09** (migración 27) |
| J el recibo dura cinco años | 3/3 | **3/3** | — |
| G supervivencia al borrado | 2/6 | **6/6** ✔ | — |
| K las dos puertas (nuevo) | — | **7/7** ✔ | — |

**Los 12 rojos que quedan son exactamente los declarados por el plan**: los de
lecturas del admin (07-08) y los del aseador (07-09). Ningún rojo es de este plan.

**Dos aserciones dejaron de estar verdes por vacuidad y ahora miden de verdad.**
La 34 (el informativo no aparece en ninguna línea) y la 11 (el aseo del cierre no
aparece también en el periodo siguiente) esperaban `0` sobre tablas vacías. Con 8
líneas de desglose escritas, las dos siguen en `0` porque el filtro las excluye, no
porque no haya nada contra lo que medir.

**Y las 47 y 51 siguen verdes por la razón nueva.** Antes lo estaban por ausencia de
líneas; ahora borran un aseo y un gasto que SÍ tienen desglose referenciándolos, y
el borrado no falla. Es el criterio 4 del ROADMAP probado de verdad.

## Verificación

| Puerta | Resultado |
|---|---|
| `npm run db:reset` | limpio, 25 migraciones aplicadas |
| `npm run db:test` | **334 aserciones, 12 rojas** (todas de 07-08 y 07-09) |
| `npm run db:lint` | `No schema errors found` |
| `npm run db:advisors` | `No issues found` |
| `npm run db:types:check` | sin diferencia |
| `npx tsc --noEmit` | limpio |
| `npm run lint` | 0 errores (2 warnings preexistentes en tests) |
| `npm run ci:arch` | los tres guardarraíles OK |
| `npm run test:unit` | **1111/1111** |
| `npm run test:integration` | **190/190** |

La cuenta de integración del plan decía 169; el número real en el árbol al empezar
era 190 y sigue siendo 190. El plan traía la cifra de una wave anterior.

**E2E no se corrió**, y es deliberado: `e2e/finanzas.spec.ts` siembra con
`marcar_pago_pagado`, que llega en 07-09, así que su `beforeAll` sigue muriendo y
arrastra los dos falsos rojos de `operacion.spec.ts:210` y
`operacion-alertas.spec.ts:215` que 07-05 ya diagnosticó como colateral. No hay nada
que medir ahí todavía.

## Lo que 07-08, 07-09 y 07-14 necesitan saber de aquí

1. **El cierre se invoca con sesión de admin en pgTAP**, no con `pg_temp.correr`. Si
   añades una invocación, cópiala del patrón del bloque anterior a C.
2. **Los números de aserción 1 a 52 no se movieron.** El bloque K empieza en 53 y va
   al final. Si añades más, hazlo también al final y bumpea `plan(n)`.
3. **Los tres señuelos que 07-14 tiene que ejercer ya están en su sitio:** quitarle la
   conversión de zona a `public.dia_bog` pone 8-12 en rojo; quitar el `on conflict do
   nothing` del núcleo pone 31-33 en rojo; quitar `c.is_managed` del filtro pone 34-37
   en rojo. Los tres están escritos en el código de la migración 25, no en un
   comentario suelto.
4. **El núcleo devuelve el número de pagos escritos**, y cero significa dos cosas
   distintas y las dos correctas: periodo ya cerrado, o periodo sin trabajo. La
   cabecera existe en los dos casos, que es por lo que 07-04 la añadió.

## Self-Check: PASSED

- `supabase/migrations/20260913120000_25_cierre_de_periodo.sql` — **FOUND** (701 líneas)
- `lib/database.types.ts` — **FOUND**, con las tres funciones públicas
- `supabase/tests/11_financiero.test.sql` — **FOUND**, `plan(59)`
- `supabase/tests/08_push_jobs.test.sql` — **FOUND**, inventario de cinco jobs
- Commit `103fc5a` — **FOUND**
- Commit `fb7ab70` — **FOUND**
- Commit `2d683ee` — **FOUND**
- `cron.job` contiene `cerrar-periodo-de-pago` tras `db:reset` — **FOUND**
