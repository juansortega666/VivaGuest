---
phase: 03-motor-de-sincronizaci-n-ical
verified: 2026-09-03T05:35:00Z
status: passed_with_gaps
score: 5/5 criterios verdad-de-código, con reservas documentadas
---

# Fase 3: Motor de sincronización iCal, verificación goal-backward

## Puertas, corridas de nuevo por el verificador (no se toman los números del orquestador)

| Puerta | Comando | Resultado propio |
|---|---|---|
| `tsc` | `npx tsc --noEmit` | exit 0, cero líneas |
| `build` | `npm run build` | exit 0, `/api/cron/sync-feed` compila como ruta dinámica |
| `ci:arch` | `npm run ci:arch` | `check-service-role: OK`, exit 0 |
| `db:test` (pgTAP) | `npm run db:test` | `Files=6, Tests=112, Result: PASS` |
| `test:unit` | `npm run test:unit` | `24 archivos, 392 tests, todos pasan` |
| `test:integration` | `npm run test:integration` | `11 archivos, 105 tests, todos pasan` |
| `lint` | `npm run lint` | 3 errores en `e2e/fixtures.ts:104,110,116` (`react-hooks/rules-of-hooks`) + 1 warning en `lib/domain/aseador.schema.test.ts:40` |

Los seis primeros números coinciden exactamente con lo reportado. `npm run lint` también coincide letra por letra con lo declarado en `deferred-items.md`.

**Confirmado que el lint es preexistente y ajeno a la fase 3:**
- `e2e/fixtures.ts` nace en el commit `c32be3e` (plan 02-04) y se modifica por última vez en `814e0cd` (plan 02-06). El merge-base de esta rama con `main` es `2a35c53`, posterior a los dos. El archivo no lo toca ningún plan de la fase 3.
- `lib/domain/aseador.schema.test.ts` nace en `3d53156` (plan 02-08), mismo caso.

No corrí `test:e2e` porque no está en la lista de puertas de la fase y el propio `deferred-items.md` (entrada 7) documenta que el `webServer` de Playwright depende de un problema de `node_modules` duplicados ya cerrado; no es una puerta que la fase declare como suya.

## Los cinco criterios de éxito, verificados de la verdad al test (no al revés)

### Criterio 1: cada feed cada 30 minutos, invocación aislada, un feed caído no bloquea a los demás

**Veredicto: cumplido.**

- El fan-out es `public.dispatch_feed_syncs()`, un `net.http_post()` por feed dentro de un `for` con `for update skip locked` (`supabase/migrations/20260902235500_14_sync_jobs.sql:130-176`). `pg_net` es fire-and-forget: la petición se encola y la función sigue al siguiente feed sin esperar respuesta, así que un feed que cuelga no comparte transacción ni proceso con los otros 33.
- La cadencia la escribe el propio RPC del diff: `next_sync_at = now() + interval '30 minutes'` dentro de `sync_feed_apply()` (`supabase/migrations/20260902221500_12_sync_rpc.sql:461`), en la misma transacción que crea los aseos. El tick del dispatcher es de un minuto (`'* * * * *'`), medido contra el error real de `pg_cron` 1.6.4 con el literal `'1 minute'` (comentario en la migración 14, líneas 449-458).
- El aislamiento está probado de punta a punta contra Postgres real, no con mocks: `lib/domain/sync-dispatcher.integration.test.ts:242-284` (test "3 y 8") siembra un feed A con puerto muerto y un feed B sano, corre los dos, y afirma que B produce sus 15 aseos con `next_sync_at` a 30 minutos exactos mientras A queda en backoff de 5 minutos sin tocar `last_success_at`. El fan-out mismo (encolar una petición por feed vencido, respetar `is_active`, el lease de 10 minutos) se mide con `dispatch_feed_syncs()` real dentro de `begin/rollback` en `lib/domain/sync-dispatcher.integration.test.ts:113-241`.

### Criterio 2: fin de una reserva genera un aseo `normal` en el `DTEND`, sin duplicados, informativo para `gestion_vivaguest = false`

**Veredicto: cumplido.**

- `lib/domain/sync-pipeline.integration.test.ts:112-134` corre el feed real anonimizado (`airbnb-real-anonimizado.ics`, 15 eventos reales capturados el 2026-09-02) contra el worker real y afirma `scheduled_date` de los 15 aseos IGUAL a un arreglo de 15 fechas escritas a mano (`QUINCE_FECHAS`, líneas 59-73), no derivadas del propio parser: si el parser restara un día, la comparación se rompe.
- Idempotencia real: el mismo test corre el feed tres veces con `DTSTAMP` distinto (para no cortar por el atajo de hash) y afirma `cleanings_created: 0` en la segunda y tercera corrida, 15 aseos vivos y cero cancelados (`sync-pipeline.integration.test.ts:136-160`).
- `gestion_vivaguest = false`: `sync-pipeline.integration.test.ts:191-227` (test 5) afirma 15 filas sin `state`, sin aseador y sin urgencia para un apartamento de gestión externa. La generación de esa fila NO la hace el pipeline de sync: la hace `tg_cleanings_snapshot()` de la Fase 1, y el pipeline solo tiene que no tocar `is_urgent` sobre ella (confirmado en el research, y el `CHECK cl_unmanaged_is_inert` lo hace explícito).

### Criterio 3: bloqueos del propietario no generan aseo, feed vacío/inválido/truncado no cancela nada y queda registrado como fallo

**Veredicto: cumplido con reserva declarada (confianza MEDIA en la clasificación, ver hallazgo 1).**

- Fail-closed verificado en `lib/domain/ical-clasificar.ts:88-98`: `clasificar()` devuelve `'desconocido'` por defecto y explícitamente si `!ev.interpretable`; nunca `'reserva'` por omisión.
- `lib/domain/sync-transporte.integration.test.ts` cubre las seis formas de feed degradado contra el worker real: 90 bloqueos de un día → 0 aseos (test 10), `SUMMARY` desconocido → 0 aseos + 1 alerta (test 12), calendario vacío con 15 reservas previas → colapso, no ausencia (test 13), cuerpo truncado no pasa (test 15), y la aserción central: Airbnb cambia de formato y no se cancela ni un aseo (test 16). Un control positivo (test 18) confirma que el contador de cancelados SÍ se mueve cuando de verdad corresponde, así que el `0` de los otros tests no es un pipeline roto.
- La guarda de colapso vive en `lib/domain/ical-guardas.ts:69-` fuera del route handler (para poder medirla) y mira `reservation_count`, no `event_count`; hay una segunda guarda equivalente dentro del RPC (`v_reconcile := v_reservation_count > 0 and v_piso is not null`, `supabase/migrations/20260902234500_13_sync_reconcile.sql:426-427`), así que cualquier llamador con `service_role` que se salte el worker sigue protegido.

### Criterio 4: reserva movida o desaparecida cancela el aseo viejo y crea uno nuevo sin confirmar, salvo `started_at`

**Veredicto: cumplido.**

Los cuatro candados del reconcile destructivo existen los cuatro en `supabase/migrations/20260902234500_13_sync_reconcile.sql` y cada uno tiene su aserción de punta a punta en `lib/domain/sync-diff.integration.test.ts` (392 líneas dedicadas al criterio 4):

| Candado | Código | Test |
|---|---|---|
| 1. Guarda de colapso (reservas clasificadas > 0) | línea 426-427 | sync-transporte test 16 + sync-diff (comentario línea 48) |
| 2. Dos ausencias consecutivas | `v_ya_ausentes`, líneas 544 y 228 | sync-diff.integration.test.ts línea 1054 ("aserción 27, SYNC-04: la primera ausencia no cancela nada") |
| 3. Ventana protegida `> today_bog() + 1` | `c.scheduled_date > public.today_bog() + 1`, línea 573 | sync-diff.integration.test.ts, sección "LOS CANDADOS DE FECHA" (línea 457+), con fechas relativas a `today_bog()` leído de la base |
| 4. Piso del feed `>= v_piso` | `c.scheduled_date >= v_piso`, línea 574 | sync-diff.integration.test.ts línea 1359 ("aserción 35, el candado más fuerte de los cuatro") |

Los cinco candados de fila (`origin='ical'`, `state='pendiente'`, `started_at is null`, ventana, piso) están en la misma cláusula `where` de la actualización de cancelación (líneas 568-578), así que un aseo con `started_at` no se cancela por construcción, no por una comprobación aparte que se pudiera olvidar.

Movimiento de reserva: `airbnb-real-movida.ics` mueve el `DTEND` de la reserva 5 del 2026-09-27 al 2026-09-29; el resumen del plan 03-05 y las aserciones de `sync-diff.integration.test.ts` confirman que el aseo viejo se cancela y nace uno nuevo sin confirmar en la fecha nueva.

### Criterio 5: alertas por link caído, job caído, checkout=checkin mismo día, extensión sospechosa

**Veredicto: cumplido con una precisión de alcance (ver hallazgo 2).**

- Link caído: `feed_health_watchdog()` alerta por feed (`supabase/migrations/20260902235500_14_sync_jobs.sql:270-320`), con discriminador anti-tormenta si todos los feeds activos caen a la vez, y excluyendo del cálculo a los que están en colapso de formato (que tienen su propia alerta). Probado en `lib/domain/sync-alertas.integration.test.ts` tests 1-4 y 14, dentro de `begin/rollback` real contra Postgres.
- Job caído: el propio comentario de la migración 14 (líneas 25-40) declara la limitación honesta: ningún vigilante DENTRO del scheduler puede ver la muerte del scheduler. La mitad que sí se puede hacer se computa AL LEER en `lib/domain/salud-sync.ts` (`estadoDeSincronizacion()`), con sus tests unitarios. El hueco declarado (si el admin no abre el panel, nadie se entera) es real y está documentado como diferido con dueño (deployment), consistente con el código: no hay ningún mecanismo push que dispare sin que alguien lea `feed_sync_runs`/`calendar_feeds`.
- Extensión sospechosa: `supabase/migrations/20260902234500_13_sync_reconcile.sql:870-903` (regla R2) y la notificación real en líneas 1030-1047, con `dedupe_key` distinto de la del turnover sano. Probado en `lib/domain/sync-alertas.integration.test.ts` tests 10-12, incluida la aserción explícita de que el turnover sano del feed real NO produce `extension_sospechosa` (test 11).
- Checkout=checkin mismo día: se implementa como `is_urgent`, un dato recalculado en cada corrida (`supabase/migrations/20260902221500_12_sync_rpc.sql:414-474`), probado en `sync-pipeline.integration.test.ts` test 6 (el turnover del 2026-10-10 es el único urgente) y `sync-alertas.integration.test.ts` tests 7-9 (la urgencia se apaga sola si la reserva entrante se mueve). **Esto es un dato correcto y bien probado, no una alerta visible por sí sola:** no hay fila en `notifications` para `is_urgent`. El propio ROADMAP de la Fase 4 (criterio de éxito 4) lista "urgentes" como una de las categorías del panel de alertas que esa fase construye. Leo esto como diseño intencional y no como hueco de la Fase 3: el dato que hace verdadera la alerta existe y está correcto: lo que falta es la superficie visual, que es explícitamente trabajo de la Fase 4.

## Lo declarado en `deferred-items.md`, verificado contra el código

1. **`.ics` real de bloqueos, diferido.** Confirmado: `lib/domain/__fixtures__/ical/airbnb-real-bloqueos.ics` no existe (`ls` del directorio de fixtures). El README de fixtures declara por escrito la confianza MEDIA (línea 30-31) y que `airbnb-bloqueos-1dia.ics`/`solo-bloqueos.ics` son sintéticas. Las tres capas de mitigación son reales y verificadas en código: (a) fail-closed en `ical-clasificar.ts:88-98`, (b) alerta real por `desconocido` (`sync-transporte` test 12), (c) guarda de colapso en dos capas independientes (worker y RPC, ver criterio 3). El señuelo sin atrapar existe de verdad: `lib/domain/ical-clasificar.test.ts:132-139` construye un evento sintético con URL de reserva Y `SUMMARY` de bloqueo a la vez y afirma que gana `reserva`; invertir el orden de las dos ramas de `clasificar()` no pondría en rojo ninguna aserción contra el feed real porque en la única muestra real los dos discriminadores nunca coexisten. La causa declarada es correcta.
2. **Checkpoint de instrumentación, diferido con fecha.** `feed_sync_runs.min_ends_on` y `uid_rotations` existen como columnas (migración 11) y se escriben en cada corrida (migración 12, verificado en `sync-pipeline.integration.test.ts` test 8: `min_ends_on`/`max_ends_on` iguales a la primera y última de las 15 fechas). Las tres consultas literales están en `deferred-items.md`. Correcto.
3. **Ventana protegida en `today_bog() + 1`.** Confirmado en código, no solo en el diferido: `c.scheduled_date > public.today_bog() + 1` (migración 13, línea 573), sin ninguna otra ruta que la encoja.
4. **Dead man's switch externo.** Confirmado: no hay ningún job ni consulta que verifique la salud del propio `pg_cron` desde fuera de la base; el hueco es real y está bien descrito en el comentario de la migración 14.
5. **`npm run lint`, preexistente.** Confirmado por git blame (ver arriba).

## Hallazgos, por severidad

### Hallazgo 1 (informativo, no bloqueante): confianza MEDIA en el clasificador reserva/bloqueo sigue siendo el hueco de mayor impacto potencial de toda la fase

No es un hallazgo nuevo, es la confirmación de que el diferimiento 1 es exacto y las tres capas de mitigación (fail-closed, alerta, guarda de colapso doble) existen de verdad en el código, no solo en la narrativa. No cambia el veredicto porque la mitigación reduce el modo de fallo a "falta un aseo que un humano crea a mano", nunca a cancelación masiva.

### Hallazgo 2 (informativo, no bloqueante): la urgencia (`is_urgent`) es un dato correcto, no una alerta visible en esta fase

Ver criterio 5. El ROADMAP redacta el criterio 5 como "el admin queda alertado", y hoy esa alerta concreta depende del panel de la Fase 4. No es una omisión de esta fase: el dato existe, está bien calculado y bien probado; es la superficie de UI la que falta, y el propio ROADMAP se la asigna a la Fase 4.

### Hallazgo 3 (bajo, no bloqueante): el patrón de comparar reloj de JavaScript contra reloj de Postgres para medir cadencia sigue presente fuera del test que se arregló

El plan 03-09 corrigió `lib/domain/sync-dispatcher.integration.test.ts` test 6 para medir la cadencia de 30 minutos con dos marcas de la MISMA fila de Postgres (`feed_sync_runs.finished_at` contra `calendar_feeds.next_sync_at`), evitando la resta contra un reloj de proceso. El mismo patrón que causó ese arreglo (`last_attempt_at`, escrito por el proceso Node en `lib/data/sync.ts:285,336`, restado contra `next_sync_at`, escrito por `now()` de Postgres) sigue presente en tres sitios más, con un margen de 30 segundos en vez de margen cero:

- `lib/domain/sync-dispatcher.integration.test.ts:261-263` (minutosB, `toBeGreaterThan(29.5)` / `toBeLessThan(30.5)`)
- `lib/domain/sync-dispatcher.integration.test.ts:271` (minutosA, mismo patrón sin banda declarada explícitamente en el fragmento leído)
- `lib/domain/sync-pipeline.integration.test.ts:350-353` (test 8, mismo margen de 30 segundos)

La deriva medida por el propio equipo fue de ~150 ms en esta máquina, así que un margen de 30 segundos es holgado (200x) y no es intermitente hoy. Pero es la misma causa raíz que ya produjo un test rojo por casualidad una vez, y no está eliminada en estos tres sitios, solo amortiguada. Si algún día CI corre en una máquina con más carga o latencia de red hacia el Postgres local, este es el sitio donde volvería a fallar. Vale la pena decidir si se homologan estos tres a la técnica de "las dos marcas del mismo lado" que ya usa el test 6, pero no es un bloqueante de la fase.

## Veredicto de fase

**`passed_with_gaps`**

Los cinco criterios de éxito del ROADMAP están soportados por código real y por pruebas que tocan Postgres de verdad (no mocks) donde el criterio habla de comportamiento del sistema. Los cuatro candados del reconcile destructivo existen los cuatro y cada uno tiene su aserción independiente. El off-by-one de zona horaria tiene una prueba que se pondría roja de verdad (`QUINCE_FECHAS` fija, comparada contra el `DTEND` real, más una corrida entera bajo `TZ=America/Bogota`) y además una barrera estructural (guardarrail 10 de CI, cero objetos `Date` en el camino del dominio). El único señuelo sin atrapar de la fase (orden de ramas del clasificador) está correctamente atribuido a la laguna de datos ya diferida, no a un test flojo.

Los "gaps" del veredicto son los ya declarados por el equipo ejecutor en `deferred-items.md` y confirmados aquí contra el código: la clasificación reserva/bloqueo en confianza MEDIA por falta de una fixture real de bloqueos (decisión del usuario, mitigada en tres capas verificadas), y el dead man's switch del propio scheduler, que queda fuera del alcance de esta fase por diseño. Ninguno de los dos es un defecto de lo que sí se construyó; ambos están documentados con dueño y forma de cierre.
