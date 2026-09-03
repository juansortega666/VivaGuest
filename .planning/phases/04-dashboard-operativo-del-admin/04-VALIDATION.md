---
phase: 4
slug: dashboard-operativo-del-admin
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-03
---

# Phase 4 — Validation Strategy

> Contrato de validación por fase, para muestreo de retroalimentación durante la ejecución.
> La arquitectura completa, con el señuelo concreto de cada aserción, vive en
> `04-RESEARCH.md` §Validation Architecture. Este documento es el índice operativo.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.11 (unit + integration), pgTAP vía `supabase test db`, Playwright 1.62.1 (e2e) |
| **Config file** | `vitest.config.ts`, `vitest.integration.config.ts`, `playwright.config.ts`, `supabase/config.toml` |
| **Quick run command** | `npm run test:unit` |
| **Full suite command** | `npm run test:unit && npm run test:integration && npm run db:test && npm run ci:arch && npx tsc --noEmit` |
| **Estimated runtime** | ~45 s el rápido, ~4 min el completo (sin e2e) |

**Base de partida heredada de la Fase 3, que no puede bajar:** 392 unitarios, 105 de integración,
112 aserciones pgTAP, 10 guardarraíles de `ci:arch`.

---

## Sampling Rate

- **Después de cada commit de tarea:** `npm run test:unit`
- **Después de cada wave:** suite completa
- **Antes de `/gsd:verify-work`:** todo en verde, e2e incluido
- **Latencia máxima de retroalimentación:** 45 s

**Regla de las RPC:** ninguna de las seis RPC nuevas se da por terminada sin su aserción pgTAP
propia **y** su señuelo corrido. Es la disciplina que llevó a las fases 1 a 3 a 48 de 49 señuelos
atrapados, y la base de datos es donde vive el riesgo de esta fase.

---

## Per-Task Verification Map

El mapa detallado por tarea lo produce el planner, porque las tareas todavía no existen. Lo que sí
está fijado desde ahora es el reparto por criterio de éxito y su capa de prueba. `04-RESEARCH.md`
§Validation Architecture trae ~40 aserciones, cada una con su señuelo.

| Criterio del ROADMAP | Capa que lo prueba | Señuelo que lo pone en rojo |
|---|---|---|
| 1. Nace sin confirmar, se confirma en un paso, queda asignado en firme | pgTAP + integración + e2e | Confirmar sin escribir `aseador_id`: el aseo queda confirmado y sin dueño |
| 2. Días, carga por aseador, decisión del suplente | integración + e2e | Contar aseos cancelados en el chip de carga: el número se infla |
| 3. Reasignar puntual, crear repaso y emergencia, reprogramar, cerrar, cancelar | pgTAP por RPC | Añadir `update properties` a `reassign_cleaning` (señuelo de D-18) |
| 4. Panel de alertas sin jerarquía entre los siete tipos | integración + e2e | Ordenar por tipo en vez de cronológicamente; dar color propio a un tipo |
| 5. Historial del apartamento con daños, y la fila inerte de gestión externa | integración + e2e | Renderizar acciones en una fila con `gestion_vivaguest = false` |

### Las dos aserciones de mayor valor, señaladas por el research

1. **El choque entre reprogramar y el reconcile.** Quitar `reservation_id = null` de
   `reschedule_cleaning` y correr un sync: el aseo reprogramado a mano lo cancela el motor con
   `cancel_reason='reserva_movida'`. Es un test de integración con dos corridas, no unitario.
2. **D-18, reasignar es puntual.** Añadir un `update properties` dentro de `reassign_cleaning` y
   ver el rojo. Es la confusión más fácil de cometer y la más cara de descubrir tarde.

### La aserción estructural del umbral

`UMBRAL_SYNC_CAIDA_MS` en `lib/domain/salud-sync.ts` y el `interval '3 hours'` del watchdog en
`supabase/migrations/20260902235500_14_sync_jobs.sql` **siguen cuadrando hoy**, verificado en los
dos archivos. Se cierra en las dos direcciones con una aserción pgTAP sobre `pg_get_functiondef`
más un test unitario espejo. Sin eso, alguien cambia uno y el detector de "el sync se murió" se
desalinea en silencio.

---

## Wave 0 Requirements

El research lista seis huecos de Wave 0 y **cero huecos de framework**: toda la infraestructura de
prueba existe desde las fases anteriores.

- [ ] **`git clean` de los 140 duplicados con sufijo numérico.** Bloqueante operativo, no de
      framework: incluye cuatro pares de migraciones (`supabase db reset` falla), un
      `05_sync.test 2.sql` y trece specs de Playwright (cada spec correría dos veces). Comando
      verificado en dry-run: `git clean -fd -e "ci/README.md" -e "supabase/snippets" -e ".claude/worktrees"`
- [ ] Migración 15 con `alter publication supabase_realtime add table`, idempotente. Hoy hay cero
      ocurrencias en el repo y sin eso Realtime no emite nada.
- [ ] Fixtures de aseos en varios estados para las suites de integración del dashboard.
- [ ] Extensión de `supabase/tests/` con el archivo de las seis RPC nuevas.
- [ ] `npx shadcn@latest add sheet` más los arreglos que el research dejó escritos.
- [ ] Helper de siembra para los escenarios de dos corridas de sync que necesita la aserción 1.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Que el panel se sienta legible con treinta alertas de siete tipos sin que ninguna destaque | DASH-04, criterio 4 | La ausencia de jerarquía es perceptual. Un test verifica tokens y orden, no la impresión de conjunto | Sembrar 30 alertas repartidas en los 7 tipos, abrir el panel, y confirmar en escala de grises que ningún tipo salta antes que otro |
| Que la fila inerte de gestión externa lea "esto no lo tocas" y no "esto está roto" | DASH-07, D-20 | Es una distinción de significado percibido, no de atributos | Abrir un día que tenga al menos una unidad con `gestion_vivaguest = false` junto a aseos normales |
| Que el encadenado de confirmación aguante quince seguidos sin cansar | ASEO-02, D-10 | Es fricción acumulada, no un estado | Sembrar 15 sin confirmar y recorrerlos completos en el Sheet |

---

## Validation Sign-Off

- [ ] Todas las tareas tienen `<automated>` o su dependencia de Wave 0 declarada
- [ ] Continuidad del muestreo: nunca 3 tareas seguidas sin verificación automática
- [ ] Wave 0 cubre las seis referencias faltantes, empezando por el `git clean`
- [ ] Sin banderas de watch mode
- [ ] Latencia de retroalimentación < 45 s
- [ ] Las seis RPC tienen aserción pgTAP **y** señuelo corrido
- [ ] `nyquist_compliant: true` en el frontmatter

**Approval:** pending
