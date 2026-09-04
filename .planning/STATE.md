---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: "Fase 4 wave 1 cerrada y VERIFICADA. Desbloqueada. Siguiente: wave 2 (04-05)"
last_updated: "2026-09-04T11:20:00.000Z"
last_activity: 2026-09-04 -- Verificacion de 04-01 cerrada: contrato pgTAP medido en rojo esperado
progress:
  total_phases: 9
  completed_phases: 3
  total_plans: 34
  completed_plans: 31
  percent: 33
---

# Project State

## Project Reference

Ver: .planning/PROJECT.md (actualizado 2026-08-31)

**Core value:** Que ningún aseo se pierda: todo checkout detectado en calendario termina en un aseo confirmado, asignado y ejecutado con evidencia, sin coordinación manual por WhatsApp.
**Current focus:** Fase 4, wave 1 de 8 cerrada y verificada. Lista para la wave 2 (plan 04-05)

## Current Position

Phase: 04 (dashboard-operativo-del-admin) — EXECUTING
Plan: 4 of 14 de la Fase 4 (wave 1 cerrada y VERIFICADA)
Status: Phase 04 EJECUTANDO, sin bloqueos. Siguiente: wave 2, plan 04-05 (migracion 15)
Last activity: 2026-09-04 -- Verificacion de 04-01 cerrada. db:reset, db:test, db:types:check y
test:integration medidos con el stack local arriba. El contrato pgTAP de las seis RPC del admin
corre por primera vez: 41 aserciones, 32 en rojo esperado (no 33: la 28 es un control positivo).
481 unitarios y 115 de integracion en verde. Commit 3a4de07.

Progress: [███░░░░░░░] 33% (3 de 9 fases)

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Se actualiza al completar cada plan*

## Accumulated Context

### Decisions

Las decisiones se registran en la tabla Key Decisions de PROJECT.md. Las que más pesan sobre el trabajo actual:

- Schema + migraciones + RLS antes que UI: `database.types.ts` y la forma de los RPC son el contrato de toda la UI
- `legal_hold` y `deleted_at` van en el schema inicial (Fase 1) aunque el job de borrado llegue en la Fase 9
- El código de acceso vive en tabla aparte con RPC y auditoría, no como columna
- La autorización nunca se apoya en claims del JWT (la desactivación de un aseador debe surtir efecto inmediato)
- PWA offline-first desde el día uno, con cola de mutaciones en IndexedDB e idempotencia por `client_event_id`
- El scheduler corre en `pg_cron` + `pg_net` con fan-out por feed, no en Vercel Cron

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

Last session: 2026-09-03
Stopped at: Fase 4, wave 1 de 8 cerrada y mergeada (04-01 a 04-04).

**BLOQUEO ACTIVO, requiere accion del usuario:**
1. Docker Desktop no arranca. Tenia un dialogo modal: pulsar **Quit**, NUNCA "Reset to factory
   defaults" (borraria los volumenes con la base local). Luego abrirlo normal. Sin Docker no corren
   `db:reset`, `db:test` ni `test:integration`.
2. `git clean -fd -e "ci/README.md" -e "supabase/snippets" -e ".claude/worktrees"` sobre el checkout
   principal, todavia con ~140 duplicados de iCloud, cuatro de ellos migraciones.

**Deuda que hay que cerrar ANTES de la wave 2:** el plan 04-01 quedo commiteado pero SIN VERIFICAR.
`supabase/tests/06_aseos_admin.test.sql` son 1164 lineas con `plan(41)` que no se han ejecutado ni
una vez; solo se comprobo balance de comillas y que hay 41 llamadas a `is()`. Va a tener errores de
sintaxis. Secuencia de cierre: `db:reset` -> `db:test` (comprobando que `ok + not ok = 41` y que los
rojos son los 33 listados en la cabecera) -> arreglar sintaxis -> `db:types:check` ->
`test:integration`.

Siguiente wave: la 2, con el plan 04-05 (migracion 15, las seis RPC y Realtime).
Resume file: None
