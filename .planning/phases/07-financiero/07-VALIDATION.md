---
phase: 7
slug: financiero
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-13
---

# Phase 7 — Validation Strategy

> Contrato de validación de la fase. Sale entero de `07-RESEARCH.md`
> §"Validation Architecture", que a su vez está medido contra el repo real.
>
> **La regla que esta fase no puede olvidar, y que costó dos bugs ayer:** un
> grant por columna, una policy o un trigger **solo se prueban ejecutando la
> escritura contra Postgres**. Un doble de `supabase-js` en vitest dice que el
> objeto tenía las claves correctas y no dice nada sobre si Postgres lo habría
> aceptado. El registro de push llevaba semanas roto con sus tests en verde por
> exactamente eso.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (dominio puro)** | `vitest` 4.1.11, config `vitest.config.ts` |
| **Framework (integración: Postgres real + JWT reales)** | `vitest` con `vitest.integration.config.ts` |
| **Framework (base: grants, RLS, triggers)** | pgTAP vía `supabase test db --local` |
| **Framework (E2E)** | `@playwright/test` 1.62.1 |
| **Quick run command** | `npm run test:unit` |
| **Comando de base** | `npm run db:test` |
| **Full suite command** | `npm run test:unit && npm run test:integration && npm run db:test && PLAYWRIGHT_PORT=3200 npm run test:e2e && npm run ci:arch && npm run lint && npx tsc --noEmit && npm run build` |
| **Estimated runtime** | ~6 min la suite completa; `npm run db:reset` solo son 54 s medidos |

### Línea base, para medir regresión (2026-09-13, tras los arreglos de la Fase 5)

| Capa | Baseline |
|---|---|
| pgTAP | 11 archivos, **275** aserciones |
| `test:unit` | 55 archivos, **1006** tests |
| `test:integration` | 19 archivos, **169** tests |
| `test:e2e` | **112** pasando, 1 saltado (E4, con su razón escrita) |

Cualquier corrida por debajo de estos números es una regresión, no una variación.

---

## Sampling Rate

- **Después de cada commit de tarea:** `npm run test:unit`
- **Después de cada wave:** `npm run db:test && npm run test:integration`
- **Puerta de fase, antes de `/gsd-verify-work`:** la suite completa, con
  `PLAYWRIGHT_PORT` en un puerto libre y `npm run db:reset` antes
- **Max feedback latency:** ~10 s (el `test:unit` completo mide 2,8 s)

### Dos condiciones del entorno que invalidan la corrida entera

1. **`PLAYWRIGHT_PORT` en un puerto libre.** `reuseExistingServer` está en `true`:
   si otro Next ocupa el 3000, Playwright corre la suite contra la app ajena.
2. **`NEXT_PUBLIC_VIVAGUEST_FEED_LOCAL=1` en el build que Playwright usa.** Sin
   ella, siete specs de `calendario.spec.ts` salen rojos por una razón que no
   tiene nada que ver con lo que se está midiendo.

---

## Per-Task Verification Map

Los IDs de tarea los asigna el planner. Esta tabla fija **qué comportamiento** hay
que verificar y **con qué comando**; el planner la completa con su columna Task ID.

| Requirement | Comportamiento a verificar | Threat Ref | Test Type | Automated Command | File Exists |
|---|---|---|---|---|---|
| FIN-01 (regresión) | Editar la tarifa del apartamento no mueve la del aseo ya terminal | — | pgTAP | `npm run db:test` | ✅ `01_invariantes.test.sql` |
| FIN-02 | La rentabilidad da el margen correcto y **excluye los informativos** | — | pgTAP | `npm run db:test` | ❌ W0 |
| FIN-02 | Un aseador que llama a la función de rentabilidad recibe 42501 | Info. Disclosure | pgTAP | `npm run db:test` | ❌ W0 |
| FIN-02 / D7-7 | Un aseador **no puede leer `cleanings.tarifa_huesped`** por PostgREST | Info. Disclosure | pgTAP | `npm run db:test` | ❌ W0 · **hoy fallaría: es el Hallazgo 1** |
| D7-7 | Un aseador **no puede leer las columnas de dinero de `properties`** en su ventana | Info. Disclosure | pgTAP | `npm run db:test` | ❌ W0 · **hoy fallaría** |
| FIN-03 / D7-5 | El cálculo del día de cierre coincide con `generate_series` en 36 meses | — | pgTAP | `npm run db:test` | ❌ W0 |
| FIN-03 / D7-5 | El gemelo TypeScript del calendario coincide con el SQL en los mismos 36 meses | — | integración | `npm run test:integration` | ❌ W0 |
| FIN-03 | El cierre no hace nada en un día que no es el de cierre | — | integración | `npm run test:integration` | ❌ W0 |
| FIN-03 | **Dos corridas del cierre no pagan dos veces** | Tampering | pgTAP | `npm run db:test` | ❌ W0 |
| FIN-04 | **Borrar a mano un aseo del periodo cerrado deja el pago y su desglose intactos** | — | pgTAP | `npm run db:test` | ❌ W0 · **criterio 3 del ROADMAP, literal** |
| FIN-04 / D7-6 | Borrar el gasto deja su línea con concepto y monto | — | pgTAP | `npm run db:test` | ❌ W0 |
| FIN-04 / D7-3 | Editar una tarifa después de cerrar **no mueve** el pago cerrado | — | integración | `npm run test:integration` | ❌ W0 |
| FIN-05 | Un aseo de gestión externa no aparece en ningún total ni en ningún conteo | — | pgTAP | `npm run db:test` | ❌ W0 |
| D7-8 | Un aseo completado después del cierre cae en el periodo SIGUIENTE, y en uno solo | — | pgTAP | `npm run db:test` | ❌ W0 |
| D7-8 | El desglose muestra fecha programada **y** fecha de ejecución | — | E2E | `PLAYWRIGHT_PORT=… npm run test:e2e` | ❌ W0 |
| RET-03 | Marcar retención legal sin motivo falla | — | pgTAP | `npm run db:test` | ❌ W0 |
| RET-03 | Borrar un aseo retenido levanta P0001 | Destruction | pgTAP | `npm run db:test` | ❌ W0 · **el guardián de la Fase 9** |
| RET-03 | Borrar las fotos de un aseo retenido levanta P0001 | Destruction | pgTAP | `npm run db:test` | ❌ W0 |
| RET-03 | Un aseador no puede marcar retención legal | Elevation | pgTAP | `npm run db:test` | ❌ W0 |
| RET-07 | La lectura del consumo de Storage por un aseador levanta 42501 | Info. Disclosure | pgTAP | `npm run db:test` | ❌ W0 · **medido: sin la guarda, un aseador obtiene el total** |
| RET-07 | El porcentaje cruza el umbral del 70% cuando debe | — | unit | `npm run test:unit` | ❌ W0 |
| D7-4 | La consulta de pagos del aseador **no devuelve el periodo en curso** | — | pgTAP | `npm run db:test` | ❌ W0 |
| D7-4 | Un aseador no ve el pago de otro aseador | Info. Disclosure | pgTAP | `npm run db:test` | ❌ W0 |
| D7-4 / D7-7 | **Ninguna** función del aseador devuelve una cifra de huésped | Info. Disclosure | pgTAP | `npm run db:test` | ❌ W0 · se prueba sobre el `returns table`, no sobre la fila |
| D7-1 | La sección de finanzas existe, está en la navegación, y `/operacion` no cambió | — | E2E | `PLAYWRIGHT_PORT=… npm run test:e2e` | ❌ W0 |
| D7-2 | El desglose separa aseos de gastos, y el recibo se abre | — | E2E | `PLAYWRIGHT_PORT=… npm run test:e2e` | ❌ W0 |
| D7-4 | Marcar pagado deja fecha y autor, y no se puede marcar dos veces | Tampering | E2E + pgTAP | ambos | ❌ W0 |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

**En rojo antes del schema**, igual que hizo el plan 01-02.

- [ ] `supabase/tests/11_financiero.test.sql` — FIN-02 a FIN-05, RET-03, RET-07,
      D7-4, D7-7 y D7-8
- [ ] `lib/domain/mes.test.ts` — el gemelo TypeScript del calendario de cierre
- [ ] `lib/domain/mes.integration.test.ts` — paridad SQL ↔ TS sobre 36 meses
- [ ] `lib/domain/finanzas.test.ts` — agregación de presentación del desglose
- [ ] `e2e/finanzas.spec.ts` — las dos pantallas nuevas
- [ ] Extender `lib/test/aseos.ts` con un sembrador de **periodo completo**:
      aseos completados en fechas controladas más gastos con foto. Lo necesitan
      la integración y el E2E, y sin él cada test se siembra a mano y diverge

### Señuelos, declarados por adelantado (patrón del plan 04-07)

Cada uno se corre en los dos sentidos y se deja anotado el resultado:

- [ ] Quitar el filtro de gestión externa del núcleo → **FIN-05 en rojo**
- [ ] Quitar la protección contra el cierre doble → **la idempotencia en rojo**
- [ ] Quitar la guarda de rol de la lectura de Storage → **RET-07 en rojo**
- [ ] Cambiar el borrado en cascada de las líneas del desglose → **el criterio 3
      del ROADMAP en rojo**
- [ ] Devolverle al aseador el grant sobre la tarifa del huésped → **D7-7 en rojo**

**Presupuesto:** `npm run db:reset` cuesta 54 s. Un plan de señuelos completo son
~8 resets, o sea **~7 minutos solo de reset**. Presupuestarlo en la estimación de
la wave, no descubrirlo a mitad.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|---|---|---|---|
| El cierre real del mes, con datos de un mes vivido | FIN-03 | Depende de que exista un mes completo de operación real, que hoy no existe | Tras el piloto (Fase 8), cerrar el primer periodo real y contrastar el total contra el cálculo a mano del admin |
| El pago cerrado visto desde el teléfono del aseador | D7-4 | Ninguna suite corre en un dispositivo físico, y la Fase 5 demostró ayer que eso importa | Abrir la PWA instalada en un iPhone real, entrar como aseador, y confirmar que ve sus periodos cerrados y **ninguna** cifra de huésped |

---

## Validation Sign-Off

- [ ] Toda tarea tiene `<automated>` o una dependencia declarada de Wave 0
- [ ] Continuidad de muestreo: no hay 3 tareas seguidas sin verificación automática
- [ ] Wave 0 cubre todas las referencias marcadas ❌
- [ ] Ningún comando en modo watch
- [ ] Latencia de feedback < 10 s
- [ ] `nyquist_compliant: true` en el frontmatter

**Approval:** pending
