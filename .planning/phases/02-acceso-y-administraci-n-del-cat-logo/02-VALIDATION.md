---
phase: 2
slug: acceso-y-administraci-n-del-cat-logo
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-01
---

# Phase 2 — Validation Strategy

> Derivado de `02-RESEARCH.md` §Validation Architecture, que trae la tabla completa de aserciones por criterio.
> La mayoría de los casos fueron **medidos** contra el stack local, no inferidos.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Unitario** | `vitest@4.1.11`, config existente: `environment: 'node'`, `include: ['lib/**/*.test.ts']`, `env: { TZ: 'UTC' }` |
| **Integración (RLS con JWT real)** | `vitest` en proyecto aparte, `include: ['lib/**/*.integration.test.ts']`. Requiere `supabase start`. **Fuera de `test:unit`** |
| **E2E** | `@playwright/test@1.62.1`, a instalar. `webServer: next build && next start` |
| **Base de datos** | `supabase test db --local` (pgTAP). **No crece en esta fase**: no hay cambios de schema |
| **Arquitectura** | `scripts/ci/check-service-role.sh`, a ampliar con los importadores de `createAdminClient` y el grep de hex literales de UI-SPEC §4.3 |
| **Quick run** | `npm run test:unit && npx tsc --noEmit && npm run ci:arch` |
| **Full suite** | `npm run test:unit && npm run test:integration && npx playwright test && npm run db:test && npm run build` |

---

## Sampling Rate

- **Por commit de tarea:** el comando rápido
- **Por wave:** la suite completa
- **Antes de `/gsd:verify-work`:** todo en verde con la base local levantada

---

## Los 6 criterios → verificación mecánica

El detalle completo, aserción por aserción con archivo y herramienta, está en `02-RESEARCH.md` §Validation Architecture. Resumen de qué prueba cada criterio y cuál es su aserción central:

| # | Criterio | Aserción central, la que no puede faltar |
|---|---|---|
| 1 | Login por rol con sesión persistente | **La sesión sobrevive a `page.reload()`.** Es el test que atrapa un `setAll` mal implementado, que es el agujero de caché de CDN |
| 2 | CRUD de apartamentos con los 12 campos | `codigo_acceso` e `ical_url` se persisten en `property_secrets` **y** el mismo `select` con el JWT del admin da `42501` |
| 3 | Puertas de activación | La base es la red de seguridad: activar sin tarifas por API directa da `23514`. Se assertea el código, **no** el nombre del constraint, porque el orden de evaluación no está garantizado |
| 4 | Alta y baja de aseadores con revocación inmediata | **Token vivo + desactivación ⇒ 0 filas.** Login, guardar el token, `is_active=false`, consultar con **el mismo token** |
| 5 | Buscador y lista de aseadores | Los 4 estados se pintan con icono **y** etiqueta de texto, no solo color |
| 6 | Validación en vivo del feed (APTO-12) | **No se escribe `calendar_reservations` ni `cleanings`.** Conteo antes y después: igual. Es la aserción que mantiene la costura con la Fase 3 |

---

## Aserciones que existen porque algo medido las hizo necesarias

Estas no salen de la spec, salen de lo que el research encontró rompiendo cosas:

- **La contraseña generada tiene ≥12 caracteres**, verificado sobre el generador propio, porque se midió que **la Admin API no valida la longitud**.
- **La reactivación de un aseador exige dos operaciones.** Reactivar solo `profiles.is_active` deja al usuario en `user_banned`. Hay test para las dos mitades.
- **`getUser()` y no `getClaims()`.** Se midió que tras el ban, `getUser()` da 403 pero `getClaims()` responde OK. La documentación oficial de Supabase recomienda `getClaims()`; para el criterio 4 es la respuesta equivocada.
- **La puerta de `contacto_externo` es solo de UI.** La base la dejaría pasar porque `props_active_requires_owner` solo se dispara cuando `gestion_vivaguest AND is_active`. El test es de Playwright, no de integración, y eso está declarado.
- **`DTEND` es el día del aseo, sin restar ni sumar.** Corre con `TZ=UTC` para que el off-by-one no se esconda.
- **HTTP 200 con cuerpo HTML se distingue de feed válido vacío.** Son dos estados de UI distintos, y confundirlos es cómo un admin conecta el calendario equivocado.

---

## Per-Task Verification Map

Se llena cuando el planner produzca las tareas.

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| pendiente | — | — | — | — | — | ⬜ pending |

---

## Wave 0 Requirements

- [ ] Instalar `@playwright/test@1.62.1` y su config con `webServer`
- [ ] Segundo proyecto de vitest para los tests de integración, fuera de `test:unit`
- [ ] `lib/domain/apartamento.schema.test.ts` — puertas de activación
- [ ] `lib/auth/routing.test.ts` — tabla de decisión del ruteo, ~12 casos
- [ ] `lib/domain/ical-preview.test.ts` con fixtures `.ics` sintéticos
- [ ] `e2e/login.spec.ts`, `e2e/ruteo.spec.ts`, `e2e/apartamento-crud.spec.ts`
- [ ] Ampliar `scripts/ci/check-service-role.sh` con los importadores de `createAdminClient` y el grep de hex

---

## Bloqueante conocido al arrancar

**El login por email está apagado hoy.** `[auth.email] enable_signup = false` en `supabase/config.toml` mapea a `GOTRUE_EXTERNAL_EMAIL_ENABLED=false`, que apaga el proveedor entero, no solo el auto-registro. Medido: `signInWithPassword` responde `Email logins are disabled`.

PLAT-01 y PLAT-02 son inalcanzables hasta arreglarlo. El auto-registro lo sigue bloqueando la clave global `[auth] enable_signup`, que se queda en `false`.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual |
|----------|-------------|------------|
| Comportamiento en Supabase hosted | PLAT-04 | El proyecto no existe todavía (checkpoint A1 de la Fase 1 sigue abierto) |
| Capturas de la guía de Airbnb | APTO-12 | Hay que tomarlas de la cuenta real de VivaGuest; no existen y no se pueden inventar |

---

## Validation Sign-Off

- [ ] Todas las tareas con verificación automatizada o dependencia declarada de Wave 0
- [ ] Sin 3 tareas consecutivas sin verificación automatizada
- [ ] Sin flags de watch mode
- [ ] `nyquist_compliant: true` en el frontmatter

**Approval:** pending
