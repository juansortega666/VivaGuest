---
phase: 03-motor-de-sincronizaci-n-ical
plan: 01
subsystem: testing
tags: [ical, pgtap, ci-guardrails, fixtures, privacidad, pg_cron, pg_net, airbnb]

requires:
  - phase: 01-fundaciones-de-datos-y-seguridad
    provides: "el trigger de la máquina de estados, el índice parcial de un aseo activo por apartamento y fecha, y la columna de descripción cruda de calendar_reservations"
  - phase: 02-acceso-y-administraci-n-del-cat-logo
    provides: "los 8 guardarraíles de check-service-role.sh, el feed real anonimizado, ical-preview.ts y la regla de fixtures relativas del plan 02-14"
provides:
  - "guardarraíl 7 ampliado a exigirSecretoCron, sin exceptuar app/api/: el worker de cron del plan 03-06 puede construir la fábrica administrativa sin poner ci:arch en rojo"
  - "guardarraíles 7 y 8 reconocen ahora el handler declarado como constante con función asignada: se cerró un falso verde por vacuidad medido en este plan"
  - "guardarraíl 9: la columna de descripción cruda no se nombra en código de aplicación"
  - "guardarraíl 10: el parser de iCal no instancia el tipo temporal de JavaScript"
  - "nueve fixtures .ics nuevas (16 en total) con las formas que la fase necesita"
  - "generar.ts: fixtures con DTEND relativos al día que pasa el test, con su propia suite"
  - "supabase/tests/05_sync.test.sql con los 14 invariantes de base de la fase, en RED"
affects: [03-02, 03-03, 03-04, 03-05, 03-06, 03-07, 03-08, 03-09, 03-10]

tech-stack:
  added: []
  patterns:
    - "Guardarraíl de CI probado en las DOS direcciones: rojo con el señuelo, verde con el código correcto, y control de la exclusión"
    - "Aserción pgTAP que no puede pasar por ausencia: cuenta lo que DEBERÍA estar en vez de no encontrar nada malo"
    - "Control de satisfacibilidad: un DDL mínimo inyectado en la misma transacción demuestra que el rojo es alcanzable y no permanente"
    - "Fixtures derivadas verificadas por replegado byte a byte contra el feed real"

key-files:
  created:
    - lib/domain/__fixtures__/ical/airbnb-real-crlf.ics
    - lib/domain/__fixtures__/ical/airbnb-real-movida.ics
    - lib/domain/__fixtures__/ical/airbnb-real-una-menos.ics
    - lib/domain/__fixtures__/ical/airbnb-real-uid-rotado.ics
    - lib/domain/__fixtures__/ical/airbnb-extension-mal-creada.ics
    - lib/domain/__fixtures__/ical/airbnb-bloqueos-1dia.ics
    - lib/domain/__fixtures__/ical/airbnb-summary-desconocido.ics
    - lib/domain/__fixtures__/ical/airbnb-desc-mutilado.ics
    - lib/domain/__fixtures__/ical/airbnb-truncado.ics
    - lib/domain/__fixtures__/ical/generar.ts
    - lib/domain/__fixtures__/ical/generar.test.ts
    - supabase/tests/05_sync.test.sql
  modified:
    - scripts/ci/check-service-role.sh
    - lib/domain/__fixtures__/ical/README.md

key-decisions:
  - "El guardarraíl 7 se amplía a un tercer guard nominado (exigirSecretoCron) y NO se excepciona app/api/: exceptuar un directorio borraría la propiedad entera para todos los route handlers presentes y futuros"
  - "El hueco del handler declarado como constante con función asignada se CIERRA en vez de solo documentarse: era la cuarta forma de falso verde catalogada en la Fase 2, y el plan 03-06 ya no depende de una convención de estilo para estar cubierto"
  - "generar.ts hace aritmética de días con el tipo temporal de JavaScript, y es la única excepción consentida: el guardarraíl 10 no lo alcanza por construcción (vive fuera de lib/domain/ical*.ts), no por una excepción escrita a mano"
  - "05_sync.test.sql escribe cada aserción de forma que no pueda pasar por ausencia, y se comprobó que las 14 son satisfacibles con un DDL válido"

patterns-established:
  - "Probar todo guardarraíl en las dos direcciones: uno visto solo en verde no está verificado"
  - "Toda aserción sobre algo que no existe todavía se escribe contando lo esperado, no buscando lo prohibido"
  - "Toda fixture construida declara en el README qué NO prueba, para que el verificador de fase no la cuente como evidencia empírica"

requirements-completed: [SYNC-01, SYNC-03, SYNC-06]

duration: 62min
completed: 2026-09-02
---

# Fase 3 Plan 01: Guardarraíles, fixtures y el pgTAP en rojo — Resumen

**Wave 0 de la fase: tres guardarraíles de CI nuevos o ampliados y probados en ambas direcciones, nueve fixtures `.ics` derivadas y verificadas contra el feed real byte a byte, y `05_sync.test.sql` naciendo con doce aserciones en rojo y dos en verde por invariantes preexistentes de la Fase 1.**

## Performance

- **Duración:** 62 min
- **Tareas:** 3 de 3
- **Archivos creados:** 12
- **Archivos modificados:** 2

## Logros

- **El bloqueante de CI del plan 03-06 está resuelto**, y sin abrir un agujero por directorio. El worker de cron se autentica por secreto compartido y ahora `exigirSecretoCron` es un guard de pleno derecho para el guardarraíl 7.
- **Se encontró y se cerró un falso verde real**, no hipotético: el `awk` de los guardarraíles 7 y 8 solo reconocía la forma `function`, así que un route handler escrito como constante con función flecha era invisible y el script devolvía `OK` con el agujero abierto. Medido, cerrado y vuelto a medir.
- **Las nueve fixtures existen y sus formas están afirmadas**, incluida la que ninguna otra cubre: `airbnb-real-crlf.ics`, la única que ejerce el desdoblado contra los finales de línea que Airbnb manda de verdad.
- **`05_sync.test.sql` está en rojo y el rojo es legible**: identificadores 1 a 12, con 13 y 14 en verde por invariantes preexistentes. Y el rojo es alcanzable: se demostró con un DDL mínimo que las catorce pasan.

## Commits por tarea

1. **Tarea 1: ampliar el guardarraíl 7 y añadir los guardarraíles 9 y 10** — `a37bb69` (feat)
2. **Tarea 2: las nueve fixtures y el generador de fechas relativas** — `3438530` (feat)
3. **Tarea 3: el archivo pgTAP de la fase, en RED** — `8463a8f` (test)

## Los señuelos, y el resultado de cada uno

El plan pedía cinco. Se corrieron **ocho**, más **cuatro controles**, porque un guardarraíl visto solo en verde no está verificado.

### Guardarraíl 7 (ampliación a `exigirSecretoCron`)

| # | Señuelo | Esperado | Medido | Lectura |
|---|---|---|---|---|
| 1 | `app/api/__senuelo/route.ts` con `export async function POST` que llama `exigirSecretoCron(…)` antes de `createAdminClient()`, importa `@/lib/supabase/admin` y luego nombra la tabla de secretos | VERDE | **VERDE** | La ampliación funciona y el orden guard → fábrica → tabla de secretos satisface los guardarraíles 5, 7 y 8 a la vez |
| C1 | El **mismo** archivo contra el guardarraíl 7 **sin ampliar** (regex `exigirAdmin\|exigirSesion`) | ROJO | **ROJO** | Control de que el señuelo 1 pasa **por la ampliación** y no porque el guardarraíl no lo mire. Sin este control, el señuelo 1 no prueba nada |
| 2 | El mismo archivo con la llamada a `exigirSecretoCron` borrada | ROJO | **ROJO** | El guardarraíl sigue mordiendo. La ampliación no lo desactivó |

### El hallazgo: T-03-02 confirmado y luego cerrado

| # | Señuelo | Esperado | Medido | Lectura |
|---|---|---|---|---|
| 3 | El mismo cuerpo escrito como `export const POST = async (req) => { … }`, **sin** guard | ROJO | **VERDE (antes del arreglo)** | **El agujero era real.** El `awk` solo reconocía `^(export )?(async )?function <nombre>`, así que el recorrido no entraba nunca en el cuerpo y el guard pasaba por vacuidad |
| 3′ | El mismo, tras enseñarle al `awk` la forma de enlace de nivel superior con función asignada | ROJO | **ROJO** | Agujero cerrado |
| C2 | La forma de constante-flecha **con** el guard delante | VERDE | **VERDE** | Control de que el arreglo no convierte esa forma en un rojo permanente |
| C3 | Repo limpio tras el arreglo | VERDE | **VERDE** | El nuevo reconocedor no produce falsos positivos sobre el código existente |

**Por qué se cerró en vez de solo documentarse:** el criterio de aceptación del plan decía literalmente "señuelo 3, debe dar ROJO". Dejarlo en verde y anotarlo habría hecho que la cobertura del plan 03-06 dependiera de una **convención de estilo** (declarar el handler con la palabra clave de función) en vez de un invariante comprobado. Es exactamente la cuarta forma de falso verde catalogada en la Fase 2, y es la clase de defecto que este archivo existe para atrapar. El arreglo se aplicó a los guardarraíles **7 y 8**, porque comparten el mismo recorrido y por tanto compartían el mismo hueco.

**Consecuencia para el plan 03-06:** el handler ya puede escribirse en cualquiera de las dos formas y el guardarraíl lo ve. Se sigue recomendando `export async function POST` por legibilidad, pero ya no es un requisito de correctitud del guardarraíl.

### Guardarraíl 10 (objetos de fecha en el parser)

| # | Señuelo | Esperado | Medido |
|---|---|---|---|
| 4 | `lib/domain/ical-senuelo.ts` que instancia el tipo temporal a partir del `DTEND` | ROJO | **ROJO** |
| C4a | El mismo módulo resolviendo con corte de cadena | VERDE | **VERDE** |
| C4b | `lib/domain/ical-senuelo.test.ts` que instancia el tipo temporal dentro de un test | VERDE | **VERDE** |

C4a y C4b son la mitad que falta: sin ellos el guardarraíl podría ser insatisfacible (rojo contra cualquier módulo de parser) o estar mordiendo a los tests, donde instanciar el tipo temporal es legítimo.

### Guardarraíl 9 (la columna de descripción cruda)

| # | Señuelo | Esperado | Medido |
|---|---|---|---|
| 5 | `lib/data/senuelo.ts` que nombra la columna en una lista de columnas de un `select` | ROJO | **ROJO** |
| C5a | El mismo archivo nombrando la columna **solo en un comentario** | VERDE | **VERDE** |
| C5b | El guardarraíl **sin** la exclusión de `lib/database.types.ts`, sobre el repo limpio | ROJO | **ROJO**, con las 3 líneas del archivo generado |

C5b es el control que el plan pedía nominalmente: sin la exclusión, el guardarraíl es un **rojo permanente**, porque `lib/database.types.ts` lo genera el CLI de Supabase y contiene el nombre de todas las columnas del schema. Editarlo a mano rompería la puerta de deriva de tipos de `ci/db.yml`, así que la exclusión por ruta exacta es la única salida correcta. Es un control y no un adorno: demuestra que la exclusión hace trabajo.

### Señuelos sobre lo que este plan escribió

| # | Señuelo | Esperado | Medido |
|---|---|---|---|
| 6 | `generar.ts` restando un día al `DTEND` | ROJO | **ROJO** (2 de 10 tests) |
| 7 | El aseo de la aserción 13 sin llegar a `completada` | La 13 cae | **not ok 13**, la 14 intacta |
| 8 | La aserción 14 sin cancelar antes de recrear | La 14 cae | **not ok 14**, la 13 intacta |

Los señuelos 7 y 8 existen porque las aserciones 13 y 14 nacen en **verde**, y una aserción que solo se ha visto en verde puede estar pasando por vacuidad. Caen de forma independiente, así que cada una mide lo que dice medir.

Los cinco archivos señuelo se borraron antes de commitear. `git status` quedó limpio y el árbol commiteado no contiene ninguno.

## Estado de `05_sync.test.sql`

`select plan(14)`. **Doce en rojo, dos en verde.**

**Identificadores esperados en ROJO (lista vinculante para las waves siguientes):**

```
1 2 3 4 5 6 7 8 9 10 11 12
```

| ID | Aserción | Motivo del rojo |
|---|---|---|
| 1 | `pg_cron` instalada | migración 11-14 ausente |
| 2 | `pg_net` instalada | ídem |
| 3 | Las dos instaladas y ninguna en `public` | ídem |
| 4 | Job `dispatch-feed-syncs` activo | `cron.job` inalcanzable (42P01) |
| 5 | Job de poda de `cron.job_run_details` activo | ídem |
| 6 | Job `feed-health-watchdog` activo | ídem |
| 7 | Las tres funciones existen en `public` | las tres ausentes |
| 8 | Las tres son `SECURITY DEFINER` con `search_path` vacío | ídem |
| 9 | Ninguna de las tres es ejecutable por `anon` | ídem |
| 10 | `feed_sync_runs` existe con RLS y policy | tabla ausente |
| 11 | Ni `anon` ni `authenticated` con privilegios sobre `feed_sync_runs` | tabla ausente |
| 12 | La columna de descripción cruda es NULL por CHECK | el CHECK no existe: la escritura no lanzó |

**Identificadores en VERDE desde el primer momento:** `13` y `14`. No es vacuidad, y está medido con los señuelos 7 y 8. Son invariantes que ya existen desde la Fase 1 (el trigger de la máquina de estados y el índice parcial de un aseo activo por apartamento y fecha) y no dependen de las migraciones 11 a 14. Están en este archivo porque el motor de sync depende de ellas y porque **`service_role` salta la RLS pero no salta los triggers**: si una migración de esta fase las rompiera, el rojo aparecería aquí y no con una aseadora sin pagar.

**Regla de lectura, vinculante:** comparar la **lista de identificadores**, nunca el total. Un identificador fuera de esa lista es una regresión aunque el conteo cuadre. `pg_prove`, que es lo que usa `supabase test db`, ya la imprime literalmente:

```
/…/supabase/tests/05_sync.test.sql   (Wstat: 0 Tests: 14 Failed: 12)
  Failed tests:  1-12
```

## Estado de la suite pgTAP

| Archivo | plan | ok | not ok | ids en rojo |
|---|---|---|---|---|
| `00_rls_aseos` | 1..16 | 16 | 0 | — |
| `01_invariantes` | 1..11 | 11 | 0 | — |
| `02_guardarrailes` | 1..10 | 10 | 0 | — |
| `03_seed` | 1..5 | 5 | 0 | — |
| `04_storage` | 1..5 | 5 | 0 | — |
| `05_sync` | 1..14 | 2 | **12** | 1-12 |

Los 47 previos siguen verdes. La suite completa es `Files=6, Tests=61` con los 12 fallos concentrados en `05_sync` y en ningún otro archivo.

## Aviso operativo para los planes 03-02 a 03-07

**Mientras `05_sync.test.sql` esté en rojo, `npm run db:test` sale con código distinto de cero.** Eso es lo esperado y es el punto de Wave 0. El plan 03-07 es el que devuelve la suite completa a verde.

**El comando por archivo que trae el plan 03-01 no funciona tal cual**, y hay que corregirlo en los planes que lo hereden. `pgtap` **no** está instalada de forma permanente en el stack local (medido: `installed_version` vacío en `pg_available_extensions`); la crea y la borra `supabase test db` en cada corrida. Pasarle el archivo a `psql` directamente falla con `function plan(integer) does not exist`. El comando correcto crea la extensión dentro de la misma transacción y **en el esquema `extensions`, nunca en `public`**:

```bash
{ echo 'begin;'
  echo 'create extension if not exists pgtap with schema extensions;'
  sed '0,/^begin;$/s/^begin;$//' supabase/tests/05_sync.test.sql
} | docker exec -i supabase_db_vivaguest psql -U postgres -d postgres -q -f -
```

**Instalarla en `public` pone en rojo, de mentira, los guardarraíles 3, 4 y 9 de `02_guardarrailes.test.sql`**, porque mete sus vistas, tablas y funciones en el esquema vigilado. Medido: con `pgtap` en `public` salían 3 `not ok` que desaparecían al moverla a `extensions`. Es el mismo comando escrito en la cabecera de `05_sync.test.sql`.

El `rollback;` del final deshace también la extensión, así que la base local compartida entre worktrees queda exactamente como estaba. **Verificado tras cada corrida:** 0 extensiones residuales, `public.feed_sync_runs` y `cron.job` ausentes, y los 39 apartamentos de la semilla intactos.

## Dato para el plan que agende el dispatcher

Del control de satisfacibilidad salió un hallazgo que contradice al research: **`cron.schedule` rechaza el intervalo `'1 minute'`** con `ERROR: invalid schedule`. La sintaxis de intervalo de `pg_cron` 1.6.4 solo acepta segundos (`'10 seconds'`). Para el tick de un minuto va la expresión cron `'* * * * *'`. El research (`03-RESEARCH.md` §4, "La cadencia") escribe `cron.schedule('dispatch-feed-syncs', '1 minute', …)` y ese literal **no despliega**.

## Archivos creados / modificados

- `scripts/ci/check-service-role.sh` — guardarraíl 7 ampliado, guardarraíles 7 y 8 con reconocedor de la forma de constante con función asignada, guardarraíles 9 y 10 nuevos, cabecera actualizada a diez.
- `lib/domain/__fixtures__/ical/airbnb-real-crlf.ics` — el feed real con `CRLF`. 15 eventos, idéntico al real salvo los finales de línea (verificado: `crlf.replace('\r\n','\n') == real`).
- `lib/domain/__fixtures__/ical/airbnb-real-movida.ics` — la reserva 5 (`HMWB84STVF`) mueve su `DTEND` de 2026-09-27 a **2026-09-29**. 15 eventos.
- `lib/domain/__fixtures__/ical/airbnb-real-una-menos.ics` — sin el primer `VEVENT`, el que termina el 2026-09-02. **14** eventos.
- `lib/domain/__fixtures__/ical/airbnb-real-uid-rotado.ics` — los 15 `UID` reescritos con el mismo prefijo de anuncio; los 15 códigos intactos. Verificado: 0 `UID` compartidos con el real, 1 solo prefijo, códigos idénticos.
- `lib/domain/__fixtures__/ical/airbnb-extension-mal-creada.ics` — la reserva 14 (`HM5RCG7NBM`) se acorta a 2026-12-25 y aparece `HMEXT01NEW` con `DTSTART` 2026-12-25 y `DTEND` 2026-12-27. **16** eventos.
- `lib/domain/__fixtures__/ical/airbnb-bloqueos-1dia.ics` — **90** bloqueos del propietario de un día, `Airbnb (Not available)`, **cero** `DESCRIPTION`.
- `lib/domain/__fixtures__/ical/airbnb-summary-desconocido.ics` — 3 eventos con `Airbnb (Preapproved)` y `DESCRIPTION` sin la URL de detalle.
- `lib/domain/__fixtures__/ical/airbnb-desc-mutilado.ics` — 15 eventos, 15 `DESCRIPTION` presentes, **cero** ocurrencias de la ruta de detalle tras desdoblar.
- `lib/domain/__fixtures__/ical/airbnb-truncado.ics` — cortado a mitad del octavo `VEVENT`. 1 × `BEGIN:VCALENDAR`, 0 × `END:VCALENDAR`, 8 × `BEGIN:VEVENT`, 7 × `END:VEVENT`.
- `lib/domain/__fixtures__/ical/generar.ts` — `feedConCheckoutRelativo(offsets, hoyIso, opciones?)` y `codigosDe(offsets)`.
- `lib/domain/__fixtures__/ical/generar.test.ts` — 10 aserciones sobre el generador.
- `lib/domain/__fixtures__/ical/README.md` — una sección por fixture nueva, con qué muta, qué prueba y qué no.
- `supabase/tests/05_sync.test.sql` — los 14 invariantes de base de la fase.

## Decisiones tomadas

**1. Cerrar el hueco de la constante-flecha en vez de solo documentarlo.** Ver la tabla de señuelos. Aplicado a los guardarraíles 7 y 8.

**2. Añadir `generar.test.ts`, que el plan no listaba.** Un generador de fixtures sin tests es peor que no tenerlo: produce feeds que el parser acepta, los tests que lo consumen salen verdes, y nadie descubre que las fechas estaban corridas o que el plegado partía el código de reserva. La suite afirma el cruce de fin de mes, fin de año y 29 de febrero, y que el plegado alcanza **exactamente** 75 octetos — si nunca los alcanzara, el plegado no se estaría ejerciendo y esa aserción pasaría por vacuidad. Probado con el señuelo 6.

**3. Un envoltorio en `pg_temp` para los catálogos que aún no existen.** Una consulta directa contra `cron.job` no da `not ok`: da un error de planificación (`42P01`) que **aborta la transacción entera** y se lleva por delante las once aserciones restantes. El envoltorio convierte la ausencia en el valor comparable `<inalcanzable: 42P01>`. Vive en `pg_temp`, muere con la transacción y no lo alcanzan los guardarraíles de `02_guardarrailes`.

**4. Ninguna aserción escrita como "no encuentres nada malo".** Las aserciones 3, 9, 10 y 11 son las que más fácilmente pasarían por ausencia: `is_empty` sobre grants de una tabla que no existe devuelve vacío y pasa en verde sin medir nada. Están escritas contando lo que **debería** estar. La 11 suma explícitamente el caso de la tabla ausente para que el 0 de hoy no se confunda con el 0 de "no hay grants".

**5. Control de satisfacibilidad, para no repetir el error de la Fase 1.** El fallo contrario a la vacuidad es la aserción **insatisfacible**: la que ninguna DDL válida puede poner en verde, como pasó con el literal de `search_path`. Se inyectó en la misma transacción un DDL mínimo (las dos extensiones fuera de `public`, los tres jobs, las tres funciones con privilegio elevado y su revoke, la tabla de bitácora con RLS y policy, y el CHECK de la columna de descripción cruda) y las **catorce** pasaron.

**6. La ruta de detalle se comprueba sobre el texto desdoblado, no sobre el crudo.** El criterio del plan (`grep -c "reservations/details" … -eq 0`) es cierto **también para el feed real**, porque el plegado a 75 octetos parte la ruta en dos líneas. Un test que lo use pasa por vacuidad. Queda documentado en el README con el control positivo (real desdoblado: 15; mutilado desdoblado: 0).

## Desviaciones del plan

### Auto-corregidas

**1. [Regla 1 — Bug] Señuelo 3 dio VERDE: el guard pasaba por vacuidad con el handler declarado como constante**

- **Encontrado durante:** tarea 1.
- **Problema:** el `awk` de los guardarraíles 7 y 8 solo reconocía `^(export )?(async )?function <nombre>`. Un route handler o una Server Action escritos como enlace de nivel superior con una función asignada eran invisibles para el recorrido y el script devolvía `OK` con el agujero abierto.
- **Arreglo:** se añadió el patrón de apertura para esa forma en los dos guardarraíles, con `next` en ambas ramas para que no se pisen, y extracción del nombre desde el enlace.
- **Verificación:** señuelo 3 → ROJO; control C2 (misma forma **con** guard) → VERDE; control C3 (repo limpio) → VERDE.
- **Commit:** `a37bb69`.

**2. [Regla 3 — Bloqueante] El comando por archivo del plan no corría: `pgtap` no está instalada**

- **Encontrado durante:** tarea 3.
- **Problema:** `docker exec … psql -f - < supabase/tests/05_sync.test.sql` falla con `function plan(integer) does not exist`. `pgtap` está disponible pero **no instalada** en el stack local; la crea y la borra `supabase test db`.
- **Arreglo:** crear la extensión dentro de la misma transacción del archivo, en el esquema `extensions`. Comando exacto escrito en la cabecera de `05_sync.test.sql` y en este resumen.
- **Segundo problema encontrado al arreglarlo:** creada en `public`, `pgtap` pone en rojo los guardarraíles 3, 4 y 9 de `02_guardarrailes.test.sql` porque mete sus vistas, tablas y funciones en el esquema vigilado. Medido: 3 `not ok` que desaparecen al moverla a `extensions`. Era un falso rojo, no una regresión.
- **Commit:** `8463a8f`.

**3. [Regla 1 — Bug] UUID inválidos en las fixtures del pgTAP**

- **Encontrado durante:** tarea 3.
- **Problema:** los literales `cfeed001-…` y `cres0001-…` no son hexadecimales (`r` y `s` no lo son) y `psql` abortó la transacción en el `insert`.
- **Arreglo:** `cfee0001-…` y `ce500001-…`.
- **Commit:** `8463a8f`.

**4. [Regla 2 — Funcionalidad crítica] `generar.test.ts`, no listado en el plan**

- Justificación en Decisiones §2. Probado con el señuelo 6.
- **Commit:** `3438530`.

### Incidente durante la ejecución, sin efecto en el árbol

Al limpiar el señuelo 5 se ejecutó `rm -rf lib/data`, y ese directorio **ya existía** con cinco archivos versionados (`apartamentos.ts`, `apartamentos.test.ts`, `aseadores.ts`, `aseadores.test.ts`, `feeds.ts`). Se detectó de inmediato en el `git status` previo al commit de la tarea 1 y se restauró con `git checkout -- <los cinco archivos>`. **Ningún commit de este plan contiene borrados**: verificado con `git diff --diff-filter=D --name-only HEAD~1 HEAD` tras cada uno, salida vacía en los tres. `npm run test:unit` volvió a 285 antes de commitear la tarea 1.

## Gates de autenticación

Ninguno. El plan no toca rutas autenticadas.

## Verificación

| Comprobación | Resultado |
|---|---|
| `npm run ci:arch` sobre el repo limpio | **OK** (10 guardarraíles) |
| `npx tsc --noEmit` | **OK** |
| `npm run test:unit` | **17 archivos, 295 tests** (285 previos + 10 de `generar.test.ts`) |
| `npm run build` | **OK**, 9 rutas |
| 16 archivos `.ics` en el directorio de fixtures | **OK** |
| Los cuatro pgTAP previos, por archivo | **47 ok, 0 not ok** |
| `05_sync.test.sql` | **1..14, 12 not ok, ids 1-12** |
| `npm run db:test` completo | **Files=6, Tests=61, Failed 12/14 en 05_sync**, esperado |
| `git status supabase/migrations/` | **limpio** |
| `db reset` ejecutado | **no** |
| Base local tras las corridas | 0 extensiones residuales, 39 apartamentos de la semilla intactos |

## Stubs conocidos

Ninguno. Este plan no crea código de aplicación: crea guardarraíles, fixtures y aserciones. Los objetos que `05_sync.test.sql` nombra (`dispatch_feed_syncs`, `sync_feed_apply`, `feed_health_watchdog`, `feed_sync_runs`) **no existen a propósito**: que no existan es lo que hace que el archivo nazca en rojo, que es el objetivo declarado del plan.

## Lo que este plan NO cierra

Se declara aquí para que el verificador de la fase no lo cuente como cubierto:

1. **Si el `UID` de Airbnb sobrevive a un cambio de fechas.** `airbnb-real-movida.ics` y `airbnb-real-uid-rotado.ics` son construidas. Lo resuelve `uid_rotations` en producción.
2. **Cómo se ve de verdad un bloqueo del propietario.** El feed real tiene cero. `airbnb-bloqueos-1dia.ics` es sintética y derivada de los mismos documentos que valida: usarla como evidencia es circular. Lo cierra el checkpoint humano del plan 03-10.
3. **Que Airbnb mande `CRLF`.** `airbnb-real-crlf.ics` prueba que el código lo aguanta, no que Airbnb lo mande.
4. **Que el patrón de extensión mal creada ocurra en producción.** `airbnb-extension-mal-creada.ics` es construida. Su contraparte obligatoria es afirmar que el turnover **sano** del 2026-10-10 **no** dispara `extension_sospechosa`.

Todo esto queda escrito también en `lib/domain/__fixtures__/ical/README.md`, en la sección ADVERTENCIA.

## Threat Flags

Ninguno. El plan no introduce superficie de red, rutas de autenticación, accesos a archivos ni cambios de schema en fronteras de confianza. Los tres guardarraíles nuevos o ampliados **reducen** superficie: cierran T-03-01, T-03-02, T-03-03 y T-03-04 del registro del plan.

## Notas para las waves siguientes

1. **Comparar identificadores, nunca totales.** La lista vinculante para `05_sync.test.sql` es `1 2 3 4 5 6 7 8 9 10 11 12`.
2. **`npm run db:test` sale en rojo hasta el plan 03-07.** Es lo esperado.
3. **Para correr `05_sync.test.sql` suelto**, usar el comando de la cabecera del archivo. `pgtap` va al esquema `extensions`.
4. **`cron.schedule` no acepta `'1 minute'`.** Usar `'* * * * *'`.
5. **El handler del plan 03-06** ya no tiene que ser `function` por obligación del guardarraíl. El orden dentro del cuerpo **sí** sigue siendo obligado: guard → fábrica administrativa → tabla de secretos.
6. **La ruta de detalle se busca sobre el texto desdoblado.** Sobre el crudo, el grep da 0 también para el feed real.

## Self-Check: PASSED

Los 15 archivos declarados existen, los 3 commits existen, los 5 archivos señuelo están ausentes
del árbol y los 5 archivos reales de `lib/data/` siguen versionados y presentes.
