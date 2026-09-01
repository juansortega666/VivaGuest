---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: "Fase 1 planeada y verificada. Siguiente: /gsd:execute-phase 1"
last_updated: "2026-08-31T20:06:26.059Z"
last_activity: 2026-08-31 -- Phase 01 execution started
progress:
  total_phases: 9
  completed_phases: 0
  total_plans: 9
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

Ver: .planning/PROJECT.md (actualizado 2026-08-31)

**Core value:** Que ningún aseo se pierda: todo checkout detectado en calendario termina en un aseo confirmado, asignado y ejecutado con evidencia, sin coordinación manual por WhatsApp.
**Current focus:** Fase 2 — Acceso y administración del catálogo

## Current Position

Phase: 01 (fundaci-n-schema-y-rls) — EXECUTING
Plan: 1 of 9
Status: Executing Phase 01
Last activity: 2026-09-01 — Fase 2 planeada: contrato de UI verificado, research medido contra el stack local, 15 planes aprobados sin bloqueantes

Progress: [█░░░░░░░░░] 11% (1 de 9 fases completas)

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

- **[Fase 3] Bloqueante humano:** falta capturar un `.ics` real de Airbnb de la cuenta de VivaGuest. Es prerequisito para planear la fase, no una tarea dentro de ella. Sin esos archivos no hay fixtures ni forma de resolver la estabilidad del `UID`
- **[Fase 3] Conflicto de research sin resolver:** la estabilidad del `UID` de Airbnb está en contradicción directa entre documentos; se resuelve empíricamente contra los feeds propios, con instrumentación desde el primer sync
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

Last session: 2026-08-31
Stopped at: Fase 2 planeada. Siguiente: /gsd:execute-phase 2
Resume file: None
