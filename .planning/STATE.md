---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: "Completado 04-08-PLAN.md. Siguiente: wave 6 (04-10, 04-11, 04-12)"
last_updated: "2026-09-06T18:54:11.818Z"
last_activity: 2026-09-06
progress:
  total_phases: 9
  completed_phases: 3
  total_plans: 48
  completed_plans: 44
  percent: 33
---

# Project State

## Project Reference

Ver: .planning/PROJECT.md (actualizado 2026-08-31)

**Core value:** Que ningún aseo se pierda: todo checkout detectado en calendario termina en un aseo confirmado, asignado y ejecutado con evidencia, sin coordinación manual por WhatsApp.
**Current focus:** Fase 4, waves 1 a 4 cerradas. Siguiente: wave 5

## Current Position

Phase: 04 (dashboard-operativo-del-admin) — EXECUTING
Plan: 10 of 14 de la Fase 4 (waves 1 a 5 cerradas; 04-08 y 04-09 entregados)
Status: Ready to execute
Last activity: 2026-09-06
con `exigirAdmin()` como PRIMERA operacion de las nueve y un test que lo mide por lo que NO llega a
la base. El error de ASEO-07 sale interpolado con el nombre del apartamento y con `campo: 'fecha'`,
asi que puede ir inline bajo el input. `marcarAlertaAtendida` escribe UNICAMENTE `read_at`, afirmado
contra Postgres real leyendo `title`, `body`, `url` y `payload` antes y despues. Se corrio el senuelo
declarado (cambiar `exigirAdmin()` por `exigirSesion()`) y salieron tres tests rojos: el mensaje que
llega a la UI pasa del texto del guard al de `mapDbError`, y en la ruta de `notifications` pasa a
"No se encontro el registro solicitado.", que habla de existencia de recursos donde deberia hablar de
permisos. Suites: unit 29/548, integration 15/138, pgTAP 7/153 PASS, `ci:arch` OK, `next build` verde.

HALLAZGO QUE AFECTA A TODA LA UI DEL ADMIN: los RPC de este proyecto levantan `P0001` con un TOKEN de
maquina en el `message` y el español en el `hint`. `mapDbError()` leia el `message`, asi que la
pantalla habria mostrado `aseo_no_cerrable`. Corregido en `lib/domain/errors.ts`: en `P0001` manda el
`hint`. Afecta a las siete RPC, no a una.

Del plan 04-09, que sigue vigente:
`/operacion` renderiza los tres bloques de dia con datos reales sobre la rejilla de dos carriles
(1000px de carril ancho a 1440, 840 a 1280, contra 532px de columnas fijas), la fila de 40px con su
variante inerte de gestion externa (sin hover, sin area de clic completa, con "no aplica" en vez de
"sin definir") y la franja de carga con todos los aseadores activos, ceros incluidos. `/operacion`
es ahora la RAIZ del admin y el destino del wordmark; `TopNav` tiene tres links. El carril lateral
queda con su presupuesto de altura cerrado, listo para la bandeja (04-10) y el panel (04-13).
Render medido con el build de produccion levantado y cookie de admin real: 200, y 11 de 13 marcas
del HTML ciertas (las dos falsas son del arnes de siembra, no de la UI). Suites: unit 28/504,
integration 14/128, pgTAP 7/153 PASS.

Del plan 04-07, que sigue vigente: `reschedule_cleaning` sobrevive a una corrida completa de
`sync_feed_apply()` sobre el mismo feed sin cambios, medido con dos corridas encadenadas, y el aseo
repuesto en la fecha del checkout real esta AFIRMADO en la prueba.

Del plan 04-06, que sigue vigente: una sola
consulta a `cleanings` con los dos embeds calificados por nombre de clave foranea alimenta el carril
ancho, la bandeja y los chips con un unico instante de lectura, mas las tres consultas auxiliares del
panel de alertas. 21 unitarios y 10 de integracion nuevos; los tres señuelos del plan corridos y
rojos. Suites: unit 28/502, integration 13/125, pgTAP 7/153 PASS.

DECISION DE EJECUCION 2026-09-06: worktrees DESACTIVADOS para el resto de la fase. Medido por el
ejecutor del 04-05: git dentro de iCloud avanza a ~5 archivos/minuto, y el reset inicial del
worktree consumio 35 de sus 62 minutos, con dos timeouts y un index.lock huerfano. Con 9 planes
restantes serian ~5 horas de puro arranque. Los planes ahora corren en el checkout principal, en
serie. Se pierde paralelismo solo en las waves 4 y 6.

OJO, CAMBIO DE SIGNO: a partir de la migracion 15, un `not ok` en 06_aseos_admin.test.sql YA NO es
esperado, es una regresion. Mismo caso que 05_sync.test.sql tras la Fase 3.

Progress: [█████████░] 92%

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 04 | 1 medido (P06) | 158min | 158min |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Se actualiza al completar cada plan*

| Plan | Duracion | Tareas | Archivos |
|------|----------|--------|----------|
| Phase 04 P06 | 158min | 2 tasks | 3 files |
| Phase 04 P07 | 39min | 2 tasks | 2 files |
| Phase 04 P09 | 66min | 3 tasks | 10 files |
| Phase 04 P08 | 47min | 3 tasks | 5 files |
| Phase 04 P10 | 68min | 3 tasks | 6 files |

## Accumulated Context

### Decisions

Las decisiones se registran en la tabla Key Decisions de PROJECT.md. Las que más pesan sobre el trabajo actual:

- Schema + migraciones + RLS antes que UI: `database.types.ts` y la forma de los RPC son el contrato de toda la UI
- `legal_hold` y `deleted_at` van en el schema inicial (Fase 1) aunque el job de borrado llegue en la Fase 9
- El código de acceso vive en tabla aparte con RPC y auditoría, no como columna
- La autorización nunca se apoya en claims del JWT (la desactivación de un aseador debe surtir efecto inmediato)
- PWA offline-first desde el día uno, con cola de mutaciones en IndexedDB e idempotencia por `client_event_id`
- El scheduler corre en `pg_cron` + `pg_net` con fan-out por feed, no en Vercel Cron
- [Fase 4] Todo embed de PostgREST hacia una tabla con mas de una clave foranea va calificado por nombre de FK (`profiles!cleanings_aseador_id_fkey`): sin el, PGRST201 en tiempo de ejecucion, y `tsc` no lo ve
- [Fase 4] El carril ancho llega hasta hoy+6 y lo que queda mas lejos solo se cuenta: cinco dias es el horizonte con el que se decide un suplente
- [Fase 4] Los aseos cancelados se traen en la consulta y se filtran en memoria, porque la cabecera del dia lleva el toggle `Ver cancelados (N)` y necesita el conteo
- [Fase 4] La prueba de una decision de schema que solo se manifiesta ENTRE corridas del sync vive en integracion, no en pgTAP: que reschedule_cleaning sobreviva al reconcile exige ejecutar sync_feed_apply() entero
- [Fase 4] Un efecto aceptado se AFIRMA en la prueba: reprogramar deja un aseo sin confirmar en la fecha del checkout real, y eso esta en una asercion, no en un comentario
- [Phase 04]: 04-09: /operacion es la raiz del admin (RAIZ.admin), y TopNav pasa a tres links con Operacion primero y el wordmark apuntando ahi
- [Phase 04]: 04-09: el carril lateral reserva su presupuesto de altura cerrado ANTES de que existan sus dos cards, porque D-02 no se puede improvisar en 04-13
- [Phase 04]: 04-08: el español de un P0001 viaja en el hint de Postgres, no en el message; mapDbError lo lee o la UI pinta el token de maquina (medido contra PostgREST)
- [Phase 04]: 04-08: un UPDATE que afecta a cero filas por RLS no levanta error, asi que devolverlo como exito rompe el estado optimista del panel de alertas
- [Phase 04]: 04-10: la tanda del Sheet se congela al montar; el revalidatePath de confirmarAseo no puede cambiar el aseo que el admin esta mirando
- [Phase 04]: 04-10: Saltar este tambien ante un apartamento sin responsable, no solo ante un fallo de la base: si no, la tanda queda sin salida
- [Phase 04]: 04-10: el responsable fijo del Sheet sale de listarApartamentos y no de un embed nuevo, porque un aseo sin confirmar todavia no tiene aseador_id

### Pending Todos

Ninguno.

### Blockers/Concerns

- **[Fase 3] Bloqueante humano parcialmente cerrado:** el `.ics` real de Airbnb ya se capturo y anonimizo (fixture `airbnb-real-anonimizado.ics`). Queda pendiente para el plan 03-10 un `.ics` con **bloqueos del propietario hechos a mano**; sin el, la clasificacion reserva-vs-bloqueo se queda en confianza MEDIA
- **[Fase 3, resuelto por diseño]** La contradiccion sobre la estabilidad del `UID` de Airbnb dejo de ser bloqueante: la identidad del aseo es `(property_id, scheduled_date)`, no la reserva. La instrumentacion (`feed_sync_runs.uid_rotations` y `min_ends_on`) quedo escrita y se lee al tercer dia de sync en produccion, ver `deferred-items.md` de la Fase 3
- **[Fase 1] Abierto de producto:** la lista definitiva de tareas del checklist bloquea el seed del catálogo, no el schema. Se arranca con el catálogo provisional (máximo 3 tareas por tipo de cuarto), editable sin migración
- **[Fase 5] Riesgo aceptado:** push como único canal, sin semáforo de entregabilidad. Si en el piloto de Bogotá un aseo confirmado nunca llega al aseador, entra el semáforo (NOTIF-V2-01)

## Consecuencias de la Fase 1 para fases posteriores

Registradas por `gsd-plan-checker` el 2026-08-31 al verificar los planes. Los planners de esas fases deben leer esto.

- **[Fase 3] `calendar_feeds` no tiene columna `url`.** La URL de exportación iCal es una credencial y vive en `property_secrets.ical_url`. El worker de sync corre como `service_role`, que sí tiene `grant all` sobre `property_secrets`, y resuelve la URL por el join `calendar_feeds.property_id = property_secrets.property_id`. Esto se desvía a propósito de `research/ARCHITECTURE.md` §Calendarios.
- **[Fase 4] Toda mutación de `cleanings` necesita RPC nueva, incluida la del admin.** `cleanings` queda con `grant select` puro para `authenticated`, y admin y aseador comparten ese rol de Postgres, así que "solo el admin" no existe como categoría de grant. La Fase 1 entrega 6 RPC (`reveal_access_code`, `confirm_cleaning`, `start_cleaning`, `finish_cleaning`, `decline_cleaning`, `toggle_checklist_item`). La Fase 4 tendrá que crear al menos: `reassign_cleaning` (ASEO-04), creación manual de aseo (ASEO-05), `reschedule_cleaning` (ASEO-06), `close_cleaning` (ASEO-08) y `cancel_cleaning` (ASEO-09). No es un vacío de diseño, es el patrón deliberado, pero hay que presupuestarlo.
- **[Fase 6] Los RPC de reporte** (`report_damage`, `report_expense`, `report_missing_items`) se difirieron a esa fase. Sus tablas, grants y policies ya quedan listos en la Fase 1.
- **[Fase 1, deuda menor]** La aserción 6 de `00_rls_aseos.test.sql` (fuga por embed) se ejecuta con un aseador que ya tiene cero aseos propios, así que el join da cero filas por construcción y no probaría un hueco real en la policy de `properties`. La protección de `properties` sí queda probada, sola, por la aserción 5. Debilidad heredada del research, no del plan.

## Restricciones nuevas (2026-08-31)

- **Free tier de Vercel y Supabase durante todo el desarrollo.** Obliga a retención de fotos de 30 días (no 6 meses), compresión a ~200 KB con lado largo de 1280 px y una foto por cuarto. El cron de 30 min vive en `pg_cron`, así que el tope de 1 corrida diaria de Vercel Hobby no aplica
- **Vercel Hobby prohíbe uso comercial.** El piloto de la Fase 8 en operación real cruza esa línea y obliga a migrar a plan pago
- **Equipo de dos personas.** Ejecución secuencial estricta; el grafo de paralelización queda documentado en ROADMAP.md pero no se asume
- **Airbnb es la única fuente de calendario**, vía su exportación iCal: un `GET` a una URL secreta, sin API key ni OAuth. La API oficial de Airbnb es cerrada y de partners. Google Calendar quedó descartado porque es otro suscriptor del mismo archivo, con retraso de polling propio
- **La URL de exportación es la credencial** (secreta e inadivinable), así que vive en `property_secrets` igual que el código de acceso
- **El feed no trae número de huéspedes ni nombre**, solo 6 campos. Por eso el paso de confirmación del admin es el único punto por donde entra ese dato
- **[Fase 4] Costura conocida:** confirmar un aseo lo asigna pero no notifica a nadie hasta que exista la Fase 5. El evento se encola y se drena después

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Notificaciones | Semáforo de entregabilidad de push (NOTIF-V2-01) | v2 | 2026-08-31 |
| Financiero | Exportación/impresión del cierre mensual (FIN-V2-01) | v2 | 2026-08-31 |
| Desempeño | Scorecard por aseador (PERF-V2-01) | v2 | 2026-08-31 |
| Propietarios | Dashboard de propietarios (OWNER-V2-01) | v2 | 2026-08-31 |
| Calendario | Integración con Booking.com | Fuera de MVP | 2026-08-31 |
| Calendario | Google Calendar como fuente (es suscriptor del mismo .ics) | Descartado | 2026-08-31 |
| Piloto | Métrica de éxito del piloto sin definir | Abierto | 2026-08-31 |

## Session Continuity

Last session: 2026-09-06T18:53:52.957Z
Stopped at: Completado 04-08-PLAN.md. Siguiente: wave 6 (04-10, 04-11, 04-12)

**Sin bloqueos activos.** El stack local de Supabase esta arriba y sano (12 contenedores), la
migracion 15 esta aplicada y las tres suites estan en verde: `test:unit` **29 archivos / 548 tests**,
`test:integration` **15 archivos / 138 tests**, `db:test` `Files=7, Tests=153, Result: PASS`.

**Lo que hay que saber antes de tocar nada:**

1. **Worktrees DESACTIVADOS** para el resto de la fase (decision del 2026-09-06, arriba). Los planes
   corren en el checkout principal, en serie.

2. **CAMBIO DE SIGNO vigente:** un `not ok` en `06_aseos_admin.test.sql` YA NO es esperado, es una
   regresion.

3. **El I/O de iCloud domina el reloj de las herramientas de build, y esta medido** (04-06): `tsc` en
   frio tardo 6 min 39 s consumiendo 6 s de CPU; `eslint` llego a 53 minutos con 4,4 s de CPU. Con las
   caches calientes bajan a 3 s y a segundos respectivamente. Recomendacion: correr `npx tsc --noEmit`
   una vez al empezar la sesion, y NO dar por colgado un proceso a 0 % de CPU sin mirar antes su tiempo
   acumulado con `ps -o time`.

4. **Los duplicados de iCloud con sufijo numerico siguen apareciendo.** En el 04-06 rompieron
   `npx tsc --noEmit` con 11 errores desde `.next/types/cache-life.d 2.ts` y `routes.d 2.ts`. Se
   apartaron a mano (no se borraron); `.next/` esta en `.gitignore` y `next build` lo regenera.

5. **`npm run db:reset` cuesta 54 s medidos, y es lo que domina un plan de senuelos.** El 04-07 hizo
   veintitres (uno por aplicar cada senuelo y otro por revertirlo): ~20 de sus 39 minutos. No hay
   atajo honesto: aplicar el senuelo con un `create or replace` suelto prueba la funcion pero no la
   migracion. Presupuestarlo si un plan futuro vuelve a mutar migraciones.

6. **El resto del reloj YA NO lo domina iCloud** con las caches calientes: en el 04-07, `tsc` tardo
   segundos, `db:test` 2,3 s y la integracion completa 9,7 s.

Siguiente: la wave 6 de la Fase 4 (04-10, 04-11, 04-12).
Resume file: None
