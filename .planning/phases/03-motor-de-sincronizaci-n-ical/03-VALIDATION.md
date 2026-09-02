---
phase: 3
slug: motor-de-sincronizaci-n-ical
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-02
---

# Phase 3 — Validation Strategy

> Derivado de `03-RESEARCH.md` §Validation Architecture, que trae la tabla completa por criterio.
> Casi todo se midió contra el stack local y contra el feed real capturado el 2026-09-02.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Unitarios** | `vitest` 4.1.11, `include: lib/**/*.test.ts`, `env: { TZ: 'UTC' }` |
| **Integración** | `vitest.integration.config.ts`, contra el stack local, `fileParallelism: false` |
| **Base de datos** | pgTAP vía `supabase test db --local`. Hoy 47 aserciones en verde |
| **Estructural** | `scripts/ci/check-service-role.sh`, 8 guardarraíles |
| **E2E** | Playwright, con `PLAYWRIGHT_PORT` obligatorio en worktree |
| **Quick run** | `npm run test:unit` |
| **Full suite** | `npm run ci:arch && npx tsc --noEmit && npm run test:unit && npm run test:integration && npm run db:test` |

---

## Los 5 criterios → aserción central

| # | Criterio | La aserción que no puede faltar | Fixture |
|---|---|---|---|
| 1 | Cada feed cada 30 min, aislado | **Feed A caído no impide a B**: dos feeds, uno a un puerto muerto; B avanza `next_sync_at` +30 y A entra en backoff | sintética |
| 2 | Un checkout genera un aseo en la fecha correcta, sin duplicados | **El feed real genera exactamente 15 aseos con las 15 fechas `DTEND` exactas**, y correrlo tres veces sigue dejando 15 | **real** |
| 3 | Los bloqueos no generan aseos; un feed roto no cancela nada | Un feed que vuelve vacío donde antes había 15 **no cancela ninguno** y queda registrado como intento fallido | sintética |
| 4 | Reserva movida o desaparecida: cancela el viejo y crea uno nuevo sin confirmar, salvo con `started_at` | **Un aseo con `started_at` sobrevive a que su reserva desaparezca del feed** | real + sintética |
| 5 | Alertas de feed caído, job caído, urgencia y extensión sospechosa | El turnover real del `2026-10-10` se marca urgente **y no** como extensión sospechosa | **real** |

---

## Lo que el feed real prueba y lo que no

**Prueba, con datos de verdad:**
- Las 15 fechas de checkout exactas, incluida la reserva que termina el día de la captura.
- El desdoblado del `DESCRIPTION` a 75 octetos sin partir el código de reserva.
- El turnover del mismo día del `2026-10-10`, que es el caso `urgente`.
- Que el código de reserva está en 15 de 15, no es opcional.

**No prueba, y hay que cubrirlo aparte:**
- **Reserva contra bloqueo del propietario.** Cero bloqueos en el feed real. El usuario va a capturar uno bloqueando 3 fechas a mano; hasta que llegue, fixtures sintéticas y falla cerrada.
- **Si el `UID` sobrevive a un cambio de fecha.** Requiere dos capturas separadas en el tiempo. Decisión tomada: **se instrumenta y se mide en producción**, porque el diseño es seguro bajo las dos respuestas gracias al piso del feed.
- **Si la reserva que termina hoy desaparece mañana.** Misma medición, mismo instrumento.
- **CRLF.** El feed real llega con CRLF y todas las fixtures del repo son LF, incluida la anonimizada. Hace falta al menos una fixture con CRLF real.

---

## Aserciones que existen porque algo medido las hizo necesarias

- **`node-ical` queda descalificado y hay que probar que no vuelve.** Se midió que bajo `TZ=UTC` convierte `DTEND:20260902` en un día antes al formatear a Bogotá. Debe haber un test que falle si alguien reintroduce una conversión a `Date` en el camino de la fecha del aseo.
- **La guarda anti-colapso va sobre reservas clasificadas, no sobre eventos.** Si Airbnb cambia el `DESCRIPTION`, siguen llegando 15 eventos, la guarda por conteo de eventos no salta y el reconcile cancela todo. Test: feed con 15 eventos que clasifican todos `desconocido` ⇒ cero cancelaciones.
- **El reconcile nunca toca aseos con `origin = 'manual'`.** Una línea de `where` que ningún documento pedía.
- **Recalcular `is_urgent` sin filtrar por `is_managed`** rompe con `23514` sobre las cinco unidades externas de la semilla.
- **Un turnover sano no es una extensión sospechosa.** Lo que los separa es si la reserva anterior se movió o desapareció en la misma corrida. Confundirlos convierte el caso más común del negocio en falsa alarma.
- **El aseo nuevo de una reserva movida debe nacer con `reservation_id = null`** si el viejo no se pudo cancelar, o choca con `cleanings_one_live_per_reservation`.
- **Los últimos 4 dígitos del teléfono del huésped no llegan a la base ni a los logs.** Test que busca esa cadena en todas las columnas de texto tras un sync completo.

---

## Wave 0 Requirements

- [ ] `supabase/tests/05_sync.test.sql` — extensiones, job agendado, funciones no ejecutables por `anon`
- [ ] Fixture con **CRLF real**, hoy no existe ninguna
- [ ] `airbnb-bloqueos-1dia.ics` sintética, hasta que llegue la captura real
- [ ] Fixture del feed real **movido**: mismas reservas con una fecha cambiada, para el diff
- [ ] Fixture del feed real **truncado** y otra que devuelve HTML con 200
- [ ] Ampliar `check-service-role.sh` para aceptar `exigirSecretoCron` en `app/api/*`
- [ ] Instrumentación de `feed_sync_runs` que responde las dos incógnitas en 2 o 3 días

---

## Bloqueante conocido de CI

El guardarraíl 7 exige `exigirAdmin(` o `exigirSesion(` antes de `createAdminClient(` en toda función de nivel superior, y **`app/api/*` no está exceptuado**: esa excepción solo existe en el guardarraíl 5. El worker se autentica por secreto compartido, así que pondría `ci:arch` en rojo. Hay que ampliar el regex a `exigirSecretoCron`, no esquivarlo. Además el handler debe ser `export async function POST`, no `export const POST =`, o el guard pasa por vacuidad.

---

## Manual-Only Verifications

| Behavior | Why Manual |
|----------|------------|
| Que el job corre cada minuto durante días | Se aproxima en local con `cron.schedule('...','10 seconds',...)`, medido hoy que funciona |
| Cómo se ve un bloqueo real del propietario | El usuario captura un `.ics` con 3 fechas bloqueadas a mano |
| Comportamiento en Supabase hosted | Los proyectos dev y prod siguen sin existir (checkpoint A1 de la Fase 1) |

---

## Validation Sign-Off

- [ ] Todas las tareas con verificación automatizada o dependencia declarada de Wave 0
- [ ] Sin 3 tareas consecutivas sin verificación automatizada
- [ ] `nyquist_compliant: true` en el frontmatter

**Approval:** pending
