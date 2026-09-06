---
phase: 04-dashboard-operativo-del-admin
plan: 07
subsystem: testing
tags: [vitest, integration, postgres, plpgsql, pgtap, sync, ical, supabase]

# Dependency graph
requires:
  - phase: 03-motor-de-sincronizaci-n-ical
    provides: "sync_feed_apply() con sus tres rutas destructivas ancladas a reservation_id, y el arnes lib/test/sync.ts con sembrarFeed()/correrDiff()"
  - phase: 04-dashboard-operativo-del-admin
    provides: "04-05 entrego la migracion 15 con reschedule_cleaning desanclando la reserva; 04-01 entrego lib/test/aseos.ts con leerAseo()"
provides:
  - "lib/domain/aseos-admin.integration.test.ts: la prueba de comportamiento de reschedule_cleaning contra dos corridas reales de sync_feed_apply(), que ninguna asercion pgTAP puede correr"
  - "senuelos-04.md: doce mutaciones de senuelo corridas sobre las migraciones 14 y 15, once filas anotadas con su prueba roja y su mensaje, cero escapes"
  - "La consecuencia aceptada del desanclado (un aseo repuesto en la fecha del checkout real) afirmada en una prueba, no descubierta en produccion"
affects: [04-08, 04-09, 04-13, 04-verificacion-de-fase]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "La prueba de una decision de schema que solo se manifiesta ENTRE corridas del sync vive en integracion, no en pgTAP: medirla exige ejecutar sync_feed_apply() entero"
    - "Un efecto aceptado se AFIRMA en la prueba; un efecto que solo se descubre en produccion es un defecto aunque la decision sea correcta"
    - "El senuelo de una asercion de comportamiento se corre sobre la migracion y con db:reset, no con un create or replace suelto: asi viaja por el camino real"

key-files:
  created:
    - lib/domain/aseos-admin.integration.test.ts
    - .planning/phases/04-dashboard-operativo-del-admin/senuelos-04.md
  modified: []

key-decisions:
  - "El archivo compone sembrarFeed()/correrDiff() de lib/test/sync.ts con leerAseo() de lib/test/aseos.ts y no reimplementa ninguna siembra: un segundo sitio que sepa sembrar feeds es donde los dos se desincronizan"
  - "No se uso begin/rollback como decia el plan: las suites de sync de la Fase 3 no lo usan, limpian con limpiarSync() en afterAll. Se siguio el patron que existe, no el que el plan describia"
  - "El caso manual necesita el apartamento ACTIVO y con responsable: properties.is_active tiene DEFAULT false y props_active_requires_owner lo exige. Se activa en el test con la clave de servicio, porque el CRUD de apartamentos es de otra fase"
  - "El senuelo de D-18 habria escapado en su fixture sin el control positivo de la asercion 14: la mutacion viola props_suplente_distinct y aborta la RPC entera antes de tocar nada"

patterns-established:
  - "La firma de produccion del fallo se escribe en el test, no solo la asercion: una transicion hacia cancelada con reason='reserva_movida' y actor_id nulo, minutos despues de una reprogramacion"
  - "Toda asercion de vacio lleva delante un control que demuestra que la cosa existia (regla heredada del plan 02-09)"

requirements-completed: [ASEO-04, ASEO-05, ASEO-06, ASEO-08, ASEO-09]

# Metrics
duration: 39min
completed: 2026-09-06
---

# Phase 04 Plan 07: La aserción de mayor valor de la fase y la bitácora de señuelos

**`reschedule_cleaning` sobrevive a una corrida completa de `sync_feed_apply()` sobre el mismo feed sin cambios, medido con dos corridas reales encadenadas, y el aseo repuesto en la fecha del checkout está afirmado en la prueba; más doce mutaciones de señuelo corridas sobre las migraciones 14 y 15 con cero escapes.**

## Performance

- **Duration:** ~39 min
- **Started:** 2026-09-06T16:15Z
- **Completed:** 2026-09-06T16:54Z
- **Tasks:** 2 de 2
- **Files created:** 2

## Accomplishments

- **La prueba que ninguna aserción pgTAP puede correr, existe y está en verde.** `06_aseos_admin.test.sql` prueba que `reschedule_cleaning` deja `reservation_id` en null, que es el *mecanismo*. Que ese mecanismo **sobreviva al reconcile** exige ejecutar `sync_feed_apply()` entero: fetch, parseo, clasificación, diff y las cuatro rutas del reconcile. El archivo de tests SQL lo declara en su cabecera como algo que no mide y que le corresponde a este plan. Ya no está pendiente.
- **Tres specs, dos corridas de sync cada uno, sobre el mismo `.ics` sin un solo cambio.** La segunda corrida solo mueve el `DTSTAMP`, que es lo que impide que el atajo por hash del worker corte antes de llegar al RPC. Las fechas, los `UID` y los códigos de reserva son idénticos: el calendario **no se movió**, y aun así el reconcile tiene que decidir qué hacer con un aseo que no está donde su reserva dice.
- **El aseo de más está afirmado, no tolerado.** Tras la segunda corrida hay dos aseos vivos: el que el admin movió a D+8 y uno nuevo, sin confirmar, en D+5, con `origin='ical'` y heredando la reserva que el admin soltó. Es la consecuencia aceptada de la decisión de la migración 15, y el plan exigía que estuviera en una aserción y no en un comentario: *un aseo de más lo revisa un humano; un aseo de menos deja a la aseadora en la calle*.
- **El caso simétrico también está medido.** Un aseo de `origin='manual'`, creado con `create_manual_cleaning` y reprogramado, sobrevive igual, y el sync **no crea nada extra** (`cleanings_created = 0` en la segunda corrida). Es lo que demuestra que el aseo de más del caso `ical` sale del desanclado y no de que el motor cree por sistema.
- **Doce mutaciones de señuelo, once filas, cero escapes.** Cada una con `npm run db:reset` para aplicar y otro para revertir, con `Result: PASS` confirmado las once veces antes de pasar a la siguiente. Ninguna aserción tuvo que reescribirse.
- **T-04-03 dejó de ser una afirmación.** El señuelo 2 (quitar la guarda de rol de `close_cleaning`) imprimió la fila del aseo antes y después del intento **hecho con el JWT de la aseadora**: `en_curso` → `completada`, con `finished_at` poblado. Es literalmente el bypass de `finish_cleaning`, sin checklist y sin una foto.

## Task Commits

1. **Task 1: Reprogramar contra el reconcile, dos corridas reales** — `2ca5161` (test)
2. **Task 2: Los señuelos de las seis RPC, corridos y anotados** — `c4b2b88` (docs)

## Files Created/Modified

- `lib/domain/aseos-admin.integration.test.ts` (391 líneas) — Tres specs contra Postgres real: el aseo `ical` reprogramado que sobrevive con su checkout repuesto, la bitácora sin cancelación anónima, y el aseo `manual` que sobrevive sin efectos laterales. La cabecera del archivo lleva la decisión, la alternativa descartada y **la señal de alarma que hay que buscar en producción**, con las mismas palabras que la migración 15.
- `.planning/phases/04-dashboard-operativo-del-admin/senuelos-04.md` (156 líneas) — La bitácora: tabla de doce mutaciones con archivo, línea, suite, número y nombre de la prueba roja, mensaje de fallo y resultado, más el detalle de los cinco que dejaron algo aprendido.

## Verificación medida

| Comando | Resultado |
| --- | --- |
| `npm run test:integration -- lib/domain/aseos-admin.integration.test.ts` | 3 tests, 3 verdes |
| `npm run test:integration` | **14 archivos, 128 tests** (antes 13 / 125) |
| `npm run test:unit` | 28 archivos, 502 tests — sin cambio, como debe ser |
| `npm run db:reset && npm run db:test` | `Files=7, Tests=153` — `Result: PASS` |
| `git diff --quiet -- supabase/` | pasa |
| `npx tsc --noEmit` | sin salida |
| `npm run ci:arch` | `check-service-role: OK` |
| `grep -c 'atrapado' senuelos-04.md` | 13 (el umbral del plan era 10) |

Las tres líneas base del orquestador quedan intactas o mejoradas: pgTAP `7/153 PASS` igual, unit
`28/502` igual, integración **13/125 → 14/128**.

## La aserción central, en una frase

Sin `reservation_id = null` en el `update` de `reschedule_cleaning`, el aseo que el admin movió a
D+8 sigue apuntando a una reserva cuyo `ends_on` es D+5. En la segunda corrida, el bucle de reserva
movida del reconcile (migración 13, paso e.2) lo cancela con `cancel_reason='reserva_movida'` y crea
otro en la fecha vieja. **El trabajo del admin desaparece solo, treinta minutos después, en otro
archivo, sin que nadie toque nada.** La fila que el señuelo imprimió es la firma exacta:

```
{ from_state: "pendiente", to_state: "cancelada",
  reason: "reserva_movida", actor_id: null }
```

`actor_id` nulo quiere decir que quien escribió no era una persona. Esa fila, minutos después de
que un admin reprogramara, significa una sola cosa: la RPC no desancló.

## Decisions Made

1. **No se usó `begin/rollback` para el aislamiento, pese a lo que decía la acción del plan.** Las suites de sync de la Fase 3 —que el plan cita como el patrón a seguir— **no** lo usan: limpian con `limpiarSync()` en `afterAll`, borrando por id y en orden de FK. `begin/rollback` no serviría aquí de todos modos, porque el worker de sync abre su propia conexión a través de PostgREST y no vería lo sembrado dentro de una transacción abierta desde el cliente. Se siguió el patrón que existe.
2. **El apartamento del caso manual se activa desde el test, con la clave de servicio.** `properties.is_active` tiene `DEFAULT false` y `sembrarFeed()` no lo toca, porque el motor de sync no lo mira; `create_manual_cleaning` sí lo exige, y `props_active_requires_owner` obliga además a un `responsable_id`. Es siembra, no aserción, y no hay RPC que lo haga: el CRUD de apartamentos es de otra fase. Va con comentario para que nadie lo lea como cosmético.
3. **La cabecera del test repite las palabras de la migración 15 a propósito.** La decisión, la alternativa descartada y su razón están escritas en los dos sitios. Quien lea el test sin haber leído la migración tiene que poder entender por qué el segundo aseo en D+5 es correcto y no un bug; si no, la primera persona que vea dos aseos en la bandeja va a "arreglarlo".
4. **La señal de alarma se afirma al revés y no se documenta a secas.** El spec 2 filtra las transiciones hacia `cancelada` con `actor_id` nulo y exige que el conjunto esté vacío, con un control positivo detrás. Es la misma firma que hay que buscar en producción, escrita como aserción.

## Deviations from Plan

### Auto-fixed Issues

**1. [Regla 3 - Bloqueante] El apartamento de `sembrarFeed()` nace inactivo y sin responsable**

- **Found during:** Task 1, spec 3 (el caso del aseo manual)
- **Issue:** `create_manual_cleaning` falló con `P0001 apartamento_no_valido` / *"El apartamento no existe, está inactivo o es de gestión externa"*. `properties.is_active` tiene `DEFAULT false` (migración 03) y `sembrarFeed()` no lo escribe porque el motor de sync no lo consulta. Al activarlo, el segundo intento falló con `props_active_requires_owner`: una unidad gestionada no se activa sin `responsable_id` ni `contacto_externo`.
- **Fix:** Helper `activar(propertyId)` en el propio archivo de test, que escribe `is_active` y `responsable_id` en la misma sentencia con la clave de servicio, más una aseadora creada en el `beforeAll` para ser esa responsable. Borrada en `afterAll` **después** de `limpiarSync()`, porque `properties.responsable_id` es `on delete restrict` contra `profiles`.
- **Files modified:** `lib/domain/aseos-admin.integration.test.ts`
- **Verification:** los tres specs en verde.
- **Committed in:** `2ca5161`

### Desviación de forma respecto al plan

**`begin/rollback`.** La acción de la Task 1 pedía correr el test "dentro de `begin/rollback`
siguiendo el patrón de las suites de sync de la Fase 3". Ese patrón no existe: las suites de sync de
la Fase 3 limpian con `limpiarSync()` en `afterAll`. Se siguió el patrón real. No es una
auto-corrección de código, es una lectura del plan contra el repositorio, y queda anotada porque el
verificador de la fase va a buscar el `begin/rollback` que el plan menciona.

---

**Total deviations:** 1 auto-corregida (Regla 3) + 1 desviación de forma documentada.
**Impact on plan:** Cero sobre el alcance. Ningún archivo de producción ni de migración cambió: los
dos entregables son un test y un documento.

## Issues Encountered

- **El señuelo de D-18 (número 1) habría escapado sin el control positivo de su aserción, y eso es lo más interesante que salió de la Task 2.** La fixture `b1000000-…-0001` tiene responsable `…000a` y suplente `…000b`, y la reasignación de la aserción 13 va hacia `…000b`. El `update public.properties set responsable_id = p_aseador` inyectado hace que responsable y suplente coincidan, viola `props_suplente_distinct` y **aborta la transacción entera de la RPC**: el apartamento queda intacto, que es justo lo que la mitad "negativa" de la aserción 14 exige. Devolvió `{true,false}` y se puso roja **solo porque el segundo elemento exige que la reasignación SÍ haya ocurrido**. La lección no es sobre D-18: es sobre la forma de las aserciones de "nada cambió".
- **El 23514 del señuelo 4b no aparece en la salida de la suite.** La aserción 27 muestra el efecto (el aseo intacto en `pendiente`), no la causa. Se midió aparte contra el contenedor, ejecutando el mismo `update` de la función mutada sobre una fila creada y descartada dentro de `begin … rollback`: `new row for relation "cleanings" violates check constraint "cl_completada_shape"`. Queda anotado en la bitácora porque el mensaje que hay que reconocer en producción no es el que imprime `pg_prove`.
- **El I/O de iCloud NO dominó el reloj de este plan, al contrario de lo medido en el 04-06.** Con las cachés ya calientes, `npx tsc --noEmit` tardó segundos, `npm run db:test` 2,3 s y la suite de integración completa 9,7 s. Lo que sí costó fue `npm run db:reset`: **54 s cada uno, y hicieron falta veintitrés** (uno por aplicación y otro por reversión de cada señuelo, más los de cierre). Son ~20 minutos de los 39 del plan. No hay atajo honesto: aplicar el señuelo con un `create or replace` suelto probaría la función pero no la migración.
- **Ninguna trampa de las documentadas se materializó.** El stack estaba completo (12 contenedores), no aparecieron duplicados de iCloud en `.next/types/`, y `06_aseos_admin.test.sql` estuvo verde en todas las corridas de control, que es el cambio de signo vigente desde la migración 15.

## Known Stubs

Ninguno. Los dos entregables son un archivo de pruebas y un documento; no hay código de producción
en este plan y por tanto no hay ningún dato de UI sin cablear.

## Threat Flags

Ninguna superficie nueva. El plan no añade endpoints, ni rutas de autenticación, ni acceso a
ficheros, ni cambios de schema. Las mutaciones de señuelo sobre las migraciones 14 y 15 —que sí eran
superficie de riesgo, T-04-16— quedaron revertidas y verificadas con `git diff --quiet -- supabase/`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **04-08 y 04-09 (Server Actions y diálogos):** el diálogo de reprogramar tiene ahora una prueba que respalda su copy. Si la UI le dice al admin que el aseo se mueve, este archivo es lo que garantiza que sigue movido media hora después. **Y el diálogo tiene que decir algo más:** que reprogramar deja un aseo sin confirmar en la fecha del checkout original. Está medido y afirmado, así que no hay excusa para que sorprenda al admin en la bandeja.
- **04-13 (Realtime en el navegador):** el señuelo 9 confirma que las dos aserciones sobre `pg_publication_tables` atrapan que la publicación desaparezca. El fallo de Realtime es silencioso —el canal responde `SUBSCRIBED` y no llega un evento nunca—, así que esas dos aserciones son la única red que hay.
- **Verificación de fase:** `senuelos-04.md` es lo que el verificador va a leer. Doce mutaciones, once filas, cero escapes, y el repositorio limpio.

Sin bloqueos abiertos por este plan.

## Self-Check: PASSED

Archivos declarados, verificados en disco:

- `lib/domain/aseos-admin.integration.test.ts` — presente, 391 líneas (el plan exigía ≥120)
- `.planning/phases/04-dashboard-operativo-del-admin/senuelos-04.md` — presente, 156 líneas

Commits declarados, verificados en `git log`:

- `2ca5161` — presente
- `c4b2b88` — presente

Enlaces clave del plan, verificados por contenido:

- `correrSync` / `correrDiff` de `lib/test/sync.ts` → invocados en los tres specs
- `reschedule_cleaning` → invocada por RPC directa con JWT de admin entre las dos corridas, en los tres specs

Sin elementos faltantes. `supabase/` no aparece en ningún commit de este plan: ninguna mutación de
señuelo quedó en el repositorio.

---
*Phase: 04-dashboard-operativo-del-admin*
*Completed: 2026-09-06*
