# Project State

## Project Reference

Ver: .planning/PROJECT.md (actualizado 2026-08-31)

**Core value:** Que ningún aseo se pierda: todo checkout detectado en calendario termina en un aseo confirmado, asignado y ejecutado con evidencia, sin coordinación manual por WhatsApp.
**Current focus:** Fase 1 — Fundación, schema y RLS

## Current Position

Phase: 1 de 9 (Fundación, schema y RLS)
Plan: — (fase sin planear)
Status: Ready to plan
Last activity: 2026-08-31 — Roadmap resecuenciado para equipo de dos (9 fases secuenciales); 87/87 requisitos v1 mapeados

Progress: [░░░░░░░░░░] 0%

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

- **[Fase 3] Bloqueante humano:** faltan dos archivos bloqueantes por igual: un `.ics` real de Airbnb y uno real de Google Calendar, de las cuentas de VivaGuest. Es prerequisito para planear la fase, no una tarea dentro de ella. Sin esos archivos no hay fixtures ni forma de resolver la estabilidad del `UID`
- **[Fase 3] Conflicto de research sin resolver:** la estabilidad del `UID` de Airbnb está en contradicción directa entre documentos; se resuelve empíricamente contra los feeds propios, con instrumentación desde el primer sync
- **[Fase 1] Abierto de producto:** la lista definitiva de tareas del checklist bloquea el seed del catálogo, no el schema. Se arranca con el catálogo provisional (máximo 3 tareas por tipo de cuarto), editable sin migración
- **[Fase 5] Riesgo aceptado:** push como único canal, sin semáforo de entregabilidad. Si en el piloto de Bogotá un aseo confirmado nunca llega al aseador, entra el semáforo (NOTIF-V2-01)

## Restricciones nuevas (2026-08-31)

- **Free tier de Vercel y Supabase durante todo el desarrollo.** Obliga a retención de fotos de 30 días (no 6 meses), compresión a ~200 KB con lado largo de 1280 px y una foto por cuarto. El cron de 30 min vive en `pg_cron`, así que el tope de 1 corrida diaria de Vercel Hobby no aplica
- **Vercel Hobby prohíbe uso comercial.** El piloto de la Fase 8 en operación real cruza esa línea y obliga a migrar a plan pago
- **Equipo de dos personas.** Ejecución secuencial estricta; el grafo de paralelización queda documentado en ROADMAP.md pero no se asume
- **Airbnb es el feed autoritativo de reservas; Google Calendar es un espejo** de esas mismas reservas, con latencia acumulada. Un apartamento puede tener los dos a la vez. El core del pipeline es agnóstico al proveedor, pero el diff no: la autoridad del feed decide quién puede cancelar
- **La identidad de reserva se resuelve entre feeds antes de insertar.** El índice único de un aseo activo por apartamento y fecha taparía el duplicado en silencio
- **[Fase 4] Costura conocida:** confirmar un aseo lo asigna pero no notifica a nadie hasta que exista la Fase 5. El evento se encola y se drena después

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Notificaciones | Semáforo de entregabilidad de push (NOTIF-V2-01) | v2 | 2026-08-31 |
| Financiero | Exportación/impresión del cierre mensual (FIN-V2-01) | v2 | 2026-08-31 |
| Desempeño | Scorecard por aseador (PERF-V2-01) | v2 | 2026-08-31 |
| Propietarios | Dashboard de propietarios (OWNER-V2-01) | v2 | 2026-08-31 |
| Calendario | Integración con Booking.com | Fuera de MVP | 2026-08-31 |
| Calendario | Escritura hacia Google Calendar (publicar aseos) | Fuera de MVP | 2026-08-31 |
| Piloto | Métrica de éxito del piloto sin definir | Abierto | 2026-08-31 |

## Session Continuity

Last session: 2026-08-31
Stopped at: Roadmap resecuenciado a 9 fases secuenciales; alcance ajustado a free tier, Google Calendar y equipo de dos
Resume file: None
