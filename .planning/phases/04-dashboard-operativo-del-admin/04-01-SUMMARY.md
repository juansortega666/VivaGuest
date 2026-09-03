---
phase: 04-dashboard-operativo-del-admin
plan: 01
subsystem: testing
tags: [pgtap, postgres, vitest, supabase, rls, rpc, integration-harness]

requires:
  - phase: 01-plataforma-y-esquema-de-datos
    provides: "cleanings con sus CHECK, tg_cleanings_snapshot, cleanings_log_transition, private.is_admin(), public.today_bog(), las policies de notifications"
  - phase: 03-motor-de-sincronizaci-n-ical
    provides: "feed_health_watchdog() con su umbral de 3 horas, la lista cerrada de cancel_reason, el patrón pgTAP de 05_sync.test.sql, lib/test/sync.ts y lib/test/clientes.ts"
provides:
  - "supabase/tests/06_aseos_admin.test.sql: 41 aserciones que fijan el contrato de las seis RPC del admin antes de que exista la migración 15"
  - "lib/test/aseos.ts: arnés de siembra del escenario del dashboard, compartido por todas las suites de integración de la fase"
  - "lib/test/aseos.integration.test.ts: el test que prueba al arnés"
  - "Línea base parcial de la Fase 3, medida donde el entorno lo permitió"
affects: [04-05, 04-07, 04-08, 04-09, 04-11, 04-13]

tech-stack:
  added: []
  patterns:
    - "pg_temp.intento_como(uuid, text): envoltura con manejador que convierte una llamada a una función inexistente en un valor comparable, para que un archivo pgTAP pueda nacer en rojo sin abortar la transacción"
    - "Guarda de rol en DOS aserciones: el sqlstate y la fila byte a byte igual"
    - "Control positivo obligatorio en toda aserción estructural sobre pg_get_functiondef"

key-files:
  created:
    - supabase/tests/06_aseos_admin.test.sql
    - lib/test/aseos.ts
    - lib/test/aseos.integration.test.ts
    - .planning/phases/04-dashboard-operativo-del-admin/deferred-items.md
  modified: []

key-decisions:
  - "El archivo pgTAP NO crea la extensión pgtap: crearla sin `with schema extensions` la mete en public y pone en rojo, de mentira, tres guardarraíles de 02_guardarrailes.test.sql"
  - "El rojo esperado son 33 aserciones y no las 35 que estimó el plan: ocho están verdes por diseño, no por vacuidad"
  - "El escenario de siembra usa cuatro fechas y no tres: con tres, cleanings_one_active_per_property_date rechaza la siembra con 23505"
  - "El aseo cancelado comparte fecha con el aseo en curso a propósito: es la fixture que demuestra que el índice único es parcial"
  - "El arnés no siembra feeds ni reservas: el escenario del Pitfall 1 se compone con lib/test/sync.ts"

patterns-established:
  - "Toda invocación a una función que todavía no existe pasa por una envoltura con manejador; la aserción lee después el estado de la base, no el resultado de la llamada"
  - "Toda aserción de ausencia lleva su control positivo en el mismo array"

requirements-completed: []

duration: 55min
completed: 2026-09-03
---

# Fase 4 Plan 01: Wave 0 del dashboard del admin, Resumen

**El contrato ejecutable de las seis RPC del admin queda escrito en 41 aserciones pgTAP antes de que exista una línea de la migración 15, y el arnés de siembra del escenario del dashboard queda en pie con su propio test. Ninguno de los dos se pudo EJECUTAR: Docker Desktop se cayó a mitad del plan por disco lleno y no vuelve a levantar.**

## Estado: BLOQUEADO, con los dos artefactos entregados

Las tres tareas se ejecutaron hasta donde el entorno lo permitió. Los archivos
existen, están commiteados y pasan todo lo que se puede verificar sin base de
datos. Lo que falta es medirlos, y eso no depende de este plan.

## Performance

- **Duración:** 55 min
- **Tareas:** 3 de 3 escritas, 1 de 3 verificada por completo
- **Archivos creados:** 4

## El bloqueo, primero, porque condiciona todo lo demás

**Docker Desktop no arranca. Causa raíz medida, no supuesta:**

```
com.docker.backend.engines[E] engine linux/virtualization-framework run error:
  write <HOME>/Library/Containers/com.docker.docker/Data/log/vm/init.log:
  no space left on device
```

```
/dev/disk3s5   228Gi   168Gi   4.8Gi   98%   /System/Volumes/Data
```

El volumen de datos está al 98%, con 4.8 GiB libres. La VM de Docker no tiene
sitio ni para escribir su propio log de arranque.

**Cronología, para que se entienda qué alcanzó a correr:**

1. `npm run db:reset` arrancó y aplicó **las catorce migraciones y los siete
   seeds sin un solo error**. Ese dato importa: es la mitad de la tarea 1 que sí
   se midió, y confirma que el árbol de migraciones del worktree está sano.
2. Se quedó colgado en el paso final, `Restarting containers...`, porque el
   demonio de Docker ya había muerto debajo.
3. Todo `docker …` posterior se cuelga sin responder. Tres `docker restart` de
   los contenedores de auth, storage y realtime quedaron zombis.
4. Se intentó la recuperación: matar los procesos colgados, cerrar Docker
   Desktop y relanzarlo. Tras cinco minutos de espera el demonio sigue
   respondiendo `Docker Desktop is unable to start`.
5. Docker Desktop tiene ahora mismo un diálogo modal en pantalla con dos
   opciones: **Quit** y **Reset to factory defaults**. **No se pulsó ninguna.**
   El reset de fábrica borraría los volúmenes con la base local entera.

**Lo que hace falta y solo puede hacer una persona: liberar disco.** Referencias
medidas por si sirven para decidir qué:

| Ruta | Tamaño |
|---|---|
| `~/Library/Containers/com.docker.docker/Data` | 11 GB |
| `.claude/worktrees/` (dos worktrees con `node_modules`) | 1.5 GB |
| `node_modules` de este worktree, creado por este plan | 744 MB |

No se borró nada. Decidir qué se va del disco de una persona no es una
desviación auto-corregible.

## Accomplishments

- **`supabase/tests/06_aseos_admin.test.sql`, 1164 líneas y 41 aserciones**,
  cubriendo la guarda de rol de las seis funciones en dos mitades, los cinco
  invariantes de `reassign_cleaning` con el señuelo de D-18 al frente, los cinco
  de `create_manual_cleaning` incluida la propagación del 23505 con el nombre
  del índice, los cuatro de `reschedule_cleaning` con el desapuntado de la
  reserva del Pitfall 1, los cuatro de `close_cleaning` con el señuelo del
  `coalesce`, los tres de `cancel_cleaning` con la bitácora de una sola fila,
  los dos de `clear_review_flag`, tres guardarraíles estructurales sobre
  `pg_get_functiondef`, las dos de publicación de Realtime y la de la policy de
  `notifications`.
- **`lib/test/aseos.ts`**, con los once objetos nombrados del escenario, las
  fechas resueltas contra `public.today_bog()` por RPC y una limpieza por id, en
  orden de clave foránea, idempotente.
- **`lib/test/aseos.integration.test.ts`**, once tests que ejercitan las cuatro
  funciones del contrato del arnés, cada aserción de ausencia con su control
  positivo.
- **La guarda de duplicados de la tarea 1 pasó**, con la precisión de alcance
  que va más abajo.

## Task Commits

1. **Tarea 1: Guarda de duplicados y línea base** — sin archivos, es una
   compuerta. Guarda superada; línea base medida a medias (ver más abajo).
2. **Tarea 2: El contrato pgTAP de las seis RPC** — `207a6ce` (test)
3. **Tarea 3: Arnés de siembra de aseos** — `9497fe9` (test)

**Metadatos del plan:** ver el commit de este resumen.

## Tarea 1: la guarda de duplicados, con su precisión de alcance

**La guarda pasó, y hay que leer dónde.**

```
$ find . -path ./node_modules -prune -o -path ./.next -prune -o -name "* 2.*" -print
(sin salida)

$ git ls-files | grep -c " 2\."
0
```

Cero archivos con sufijo numérico **dentro del worktree**, y cero trackeados en
git. Un worktree nace de un checkout de la rama, así que solo trae archivos
trackeados. Los `db:reset`, `db:test` y tests de este plan corren aquí, y aquí
no hay nada que los envenene.

**El checkout principal (`/Users/juanortega/Documents/VivaGuest`) SIGUE SUCIO.**
Nadie ha corrido el `git clean`. Los ~140 duplicados de iCloud siguen ahí, y
mientras estén, `npm run db:reset` **sobre el checkout principal** seguirá
fallando por migraciones duplicadas y cada spec de Playwright correrá dos veces.
No se dé por resuelto. El comando, ya verificado en dry-run, lo corre el usuario:

```
git clean -fd -e "ci/README.md" -e "supabase/snippets" -e ".claude/worktrees"
```

### La línea base, lo que se midió y lo que no

| Métrica | Base de la Fase 3 | Medido | Resultado |
|---|---|---|---|
| `npm run test:unit` | 392 | **392 pasan, 24 archivos** | ✅ no bajó |
| `npm run ci:arch` | 10 guardarraíles | **`check-service-role: OK`** | ✅ no bajó |
| `npx tsc --noEmit` | limpio | **limpio** | ✅ |
| `npm run db:reset` | termina en cero | **14 migraciones + 7 seeds sin error**, colgado en `Restarting containers` | ⚠️ parcial |
| `npm run db:test` | 112 aserciones, 6 archivos | **NO MEDIDO** | ⛔ Docker caído |
| `npm run db:types:check` | sin deriva | **NO MEDIDO** | ⛔ Docker caído |
| `npm run test:integration` | 105 | **NO MEDIDO** | ⛔ Docker caído |

## Files Created/Modified

- `supabase/tests/06_aseos_admin.test.sql` — el contrato de las seis RPC, en
  rojo. 41 aserciones, `select plan(41)`.
- `lib/test/aseos.ts` — `sembrarEscenarioDeAseos`, `leerAseo`, `limpiarAseos` y
  `sumarDias`.
- `lib/test/aseos.integration.test.ts` — el test del arnés.
- `.planning/phases/04-dashboard-operativo-del-admin/deferred-items.md` — tres
  errores de `lint` preexistentes en `e2e/fixtures.ts`.

## Decisions Made

**1. El archivo pgTAP no crea la extensión `pgtap`.** El texto de la tarea 2 la
pedía. `05_sync.test.sql` y los otros cinco archivos NO la crean, y su cabecera
explica por qué está medido: `create extension pgtap` sin `with schema
extensions` la instala en `public`, mete ahí sus vistas, tablas y funciones, y
pone en rojo, de mentira, los guardarraíles 3, 4 y 9 de
`02_guardarrailes.test.sql`. `supabase test db` la crea y la borra en cada
corrida. Se siguió la mecánica real del archivo de referencia, que es lo que la
propia tarea pedía ("siguiendo LITERALMENTE la mecánica de 05_sync.test.sql").

**2. El rojo esperado son 33 aserciones, no 35.** Ocho de las 41 están verdes
desde el primer momento y no por vacuidad:

- las **seis** mitades "la fila quedó byte a byte igual" de la guarda de rol.
  Con las funciones sin crear no pasa nada, así que la fila no cambia. Su valor
  es el día después, cuando distinguen "devolvió 42501" de "devolvió 42501 pero
  ya había escrito";
- la 38, `feed_health_watchdog()` con `interval '3 hours'` exactamente dos
  veces: mide la migración 14, que ya existe;
- la 41, la policy `notifications_own_update`, que ya existe.

El plan estimó "al menos 35" contando como rojas las seis mitades del bloque A.
Forzarlas a serlo exigiría fusionarlas con su mitad de excepción, que es
justamente lo que el plan prohíbe ("las dos mitades no son opcionales"). El
número está escrito en la cabecera del archivo con su justificación, junto con
la lista de identificadores esperados.

**3. Toda invocación a las seis funciones pasa por una envoltura con
manejador.** Una función que no existe no da `not ok`: da `42883` y aborta la
transacción entera, llevándose por delante el archivo. `pg_temp.intento_como()`
la convierte en un `sqlstate|mensaje|pista` comparable, y las aserciones de
comportamiento leen después el estado de la base. Ese desdoblamiento es lo que
permite que el archivo nazca en rojo de forma legible en vez de reventar. Es la
extensión del patrón `pg_temp.escalar()` de `05_sync.test.sql`.

**4. Las aserciones estructurales llevan control positivo de existencia.**
"Ninguna de las seis asigna `cancel_reason` desde un parámetro" pasa en verde
con las seis funciones sin crear. Cada una compara un array de dos: el conteo
del patrón prohibido Y cuántas de las seis existen. Es el falso verde por
ausencia que la Fase 2 midió cuatro veces.

**5. El escenario de siembra usa cuatro fechas.** Ver desviaciones.

**6. La fixture cancelada usa `reserva_desaparecida` y no
`cancelado_por_admin`.** Ese segundo slug lo escribe `cancel_cleaning`, y
tenerlo ya puesto en la fixture enmascararía una RPC que no escribiera nada.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Bloqueante] El escenario de siembra necesita cuatro fechas, no tres**

- **Encontrado en:** Tarea 3
- **Problema:** el bloque `<behavior>` fija las fechas en "hoy, mañana y hoy+3",
  y a la vez pide seis aseos, cuatro de ellos **no cancelados** sobre el mismo
  apartamento gestionado (sin confirmar, pendiente, en curso y terminado).
  `cleanings_one_active_per_property_date` es un índice único parcial sobre
  `(property_id, scheduled_date) where state is distinct from 'cancelada'`:
  cuatro filas vivas no caben en tres fechas. La siembra literal devuelve 23505.
- **Arreglo:** cuatro fechas, `ayer / hoy / mañana / hoy+3`. El aseo terminado va
  a **ayer**, que además es como se ve en la realidad: un aseo completado
  pertenece al pasado. El cancelado **sí comparte fecha** con el aseo en curso, a
  propósito: es la fixture que demuestra que el índice es parcial, y si alguien
  lo convirtiera en total, la siembra reventaría aquí y no tres capas más arriba.
- **Archivos:** `lib/test/aseos.ts`
- **Verificación:** `npx tsc --noEmit` limpio. **La comprobación real contra la
  base no se pudo hacer.**
- **Commit:** `9497fe9`

**2. [Rule 1 - Bug] No se crea la extensión `pgtap` dentro del archivo**

- **Encontrado en:** Tarea 2
- **Problema:** la tarea pedía `create extension if not exists pgtap` en la
  cabecera. Escrito así, sin `with schema extensions`, la instala en `public` y
  rompe tres guardarraíles de `02_guardarrailes.test.sql`. Está medido y
  documentado en la cabecera de `05_sync.test.sql`.
- **Arreglo:** se omite, igual que hacen los seis archivos existentes. La
  cabecera del archivo nuevo explica por qué y deja escrita la receta con
  `with schema extensions` para quien quiera correrlo suelto por `psql`.
- **Archivos:** `supabase/tests/06_aseos_admin.test.sql`
- **Verificación:** **no medida.** El razonamiento es documental, no empírico.
- **Commit:** `207a6ce`

**3. [Rule 3 - Bloqueante] Los tipos de `Insert` de `cleanings` exigen dos columnas que pone un trigger**

- **Encontrado en:** Tarea 3
- **Problema:** `Database['public']['Tables']['cleanings']['Insert']` exige
  `hora_limite` e `is_managed` porque son NOT NULL sin DEFAULT en el DDL. Las
  escribe `tg_cleanings_snapshot()` en el BEFORE INSERT, así que el llamante no
  las conoce ni debe conocerlas: poner `is_managed` a mano permitiría sembrar un
  aseo cuyo snapshot contradice a su apartamento, un estado que la base nunca
  produce.
- **Arreglo:** las filas se declaran con `satisfies Partial<…['Insert']>` y se
  castean al insertar. Es el patrón que ya usa
  `lib/domain/feed.integration.test.ts`, por la misma razón.
- **Archivos:** `lib/test/aseos.ts`
- **Verificación:** `npx tsc --noEmit` limpio.
- **Commit:** `9497fe9`

---

**Total de desviaciones:** 3 auto-corregidas (2 de Rule 3, 1 de Rule 1)
**Impacto:** ninguna amplía el alcance. Las tres son correcciones de premisas del
plan que la base o el compilador contradicen.

## Issues Encountered

**Docker Desktop caído por disco lleno.** Es el issue del plan y está detallado
arriba. Consecuencia directa sobre lo entregado, dicha sin adornos:

- **`supabase/tests/06_aseos_admin.test.sql` NO SE HA EJECUTADO NI UNA VEZ.**
  No hay ninguna garantía de que parsee. Lo único que se comprobó es que las
  comillas simples, los paréntesis, los corchetes y las marcas
  `$q$`/`$fn$` están balanceados, y que hay exactamente 41 llamadas a `is()`
  para el `select plan(41)` declarado. Un archivo SQL de 1164 líneas escrito sin
  poder correrlo va a tener errores de sintaxis. **Esperarlos.**
- **`lib/test/aseos.integration.test.ts` NO SE HA EJECUTADO NI UNA VEZ.**
  Tipa y pasa `lint`, y nada más. Los tres puntos donde es más probable que
  falle a la primera: el `.rpc('today_bog')` (grant confirmado en la migración
  07, pero no probado por PostgREST), el cast del `Insert` de `cleanings`, y el
  orden de borrado de `limpiarAseos()`.
- **Nada del plan 04-05 debe darse por cubierto todavía.** El valor de un
  contrato en rojo es que se ha visto fallar. Este no.

**Los tres errores de `npm run lint`** en `e2e/fixtures.ts` son preexistentes y
están fuera del alcance de esta tarea. Se anotaron en `deferred-items.md` y no
se tocaron.

## Known Stubs

Ninguno. Los dos artefactos son código de prueba completo, no andamios.

## Threat Flags

Ninguno. Este plan no crea superficie de red, ni rutas de autenticación, ni
cambios de esquema. `lib/test/aseos.ts` usa la clave de servicio, que es la
amenaza **T-04-06** ya registrada en el modelo del plan con disposición
`mitigate`: vive bajo `lib/test/`, que es la excepción acotada de los
guardarraíles 5, 7 y 8, y no lo importa nada bajo `app/`. Verificado:
`npm run ci:arch` sale OK con el archivo nuevo en el árbol.

## User Setup Required

**Sí, y es lo que desbloquea la fase.**

1. **Liberar espacio en disco.** El volumen está al 98%. Docker necesita
   holgura para arrancar su VM.
2. **Relanzar Docker Desktop.** Hay un diálogo modal en pantalla: pulsar
   **Quit**, nunca *Reset to factory defaults* (borraría la base local entera).
   Después `npx supabase start`.
3. **Limpiar el checkout principal**, que sigue con los ~140 duplicados:
   ```
   git clean -fd -e "ci/README.md" -e "supabase/snippets" -e ".claude/worktrees"
   ```

## Next Phase Readiness

**El plan 04-05 NO puede empezar todavía.** No porque falten los artefactos,
sino porque el contrato que tiene que poner en verde no se ha visto en rojo, y
un contrato que nunca falló no es una verificación.

Lo que hay que hacer en cuanto Docker vuelva, en este orden:

1. `npm run db:reset`
2. `npm run db:test`. Comprobar las tres cosas: que `ok + not ok = 41`, que los
   identificadores en rojo son los 33 de la cabecera del archivo, y que la
   aserción 41 aparece en la salida. Arreglar los errores de sintaxis que salgan.
3. `npm run db:types:check`
4. `npm run test:integration -- lib/test/aseos.integration.test.ts`, y después
   la suite completa para confirmar que los 105 heredados siguen verdes.

Con eso, el 04-05 arranca con el contrato medido y los planes 04-07, 04-08,
04-09 y 04-11 tienen su arnés de siembra listo.

---
*Phase: 04-dashboard-operativo-del-admin*
*Completed: 2026-09-03*

## Self-Check: PASSED

Los cinco archivos existen en disco y los dos commits de tarea existen en el
historial de la rama.

| Comprobación | Resultado |
|---|---|
| `supabase/tests/06_aseos_admin.test.sql` | FOUND (56 894 bytes) |
| `lib/test/aseos.ts` | FOUND (20 128 bytes) |
| `lib/test/aseos.integration.test.ts` | FOUND (10 982 bytes) |
| `.planning/…/deferred-items.md` | FOUND |
| `.planning/…/04-01-SUMMARY.md` | FOUND |
| commit `207a6ce` | FOUND |
| commit `9497fe9` | FOUND |

**Alcance del self-check, dicho para que nadie lo lea de más:** confirma que lo
que este resumen afirma haber escrito está escrito y commiteado. **No** confirma
que funcione. Las dos afirmaciones de comportamiento del plan —el archivo pgTAP
en rojo con su conteo, y el test de integración del arnés en verde— siguen sin
medir, y así están marcadas arriba.
