---
phase: 2
slug: acceso-y-administraci-n-del-cat-logo
status: passed_with_gaps
nyquist_compliant: true
wave_0_complete: true
created: 2026-09-01
signed: 2026-09-02
signed_by: plan 02-15
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
| **E2E** | `@playwright/test@1.62.1`, instalado en 02-04. `webServer: next build && next start`, puerto por `PLAYWRIGHT_PORT` |
| **Base de datos** | `supabase test db --local` (pgTAP). **No creció en esta fase**: cero cambios de schema, medido |
| **Arquitectura** | `scripts/ci/check-service-role.sh`, ampliado de 4 a **8 guardarraíles** en los planes 02-01, 02-08 y 02-10 |
| **Quick run** | `npm run test:unit && npx tsc --noEmit && npm run ci:arch` |
| **Full suite** | `npm run test:unit && npm run test:integration && npx playwright test && npm run db:test && npm run build` |

---

## Sampling Rate

- **Por commit de tarea:** el comando rápido
- **Por wave:** la suite completa
- **Antes de `/gsd:verify-work`:** todo en verde con la base local levantada

---

## Las 11 puertas, corridas a mano el 2026-09-02

`ci/db.yml` **sigue en `ci/` y no en `.github/workflows/`**, así que el CI no corre solo:
mover el archivo requiere un token con scope `workflow` y `02-CONTEXT.md` lo difiere.
Las puertas se corren a mano, en el orden del workflow. Estas son las salidas reales
de la corrida de firma, con el stack local levantado:

### Job `database`

| # | Puerta | Comando | Salida medida |
|---|--------|---------|---------------|
| 1 | arranque | `npx supabase db start` | `already-running` · exit 0 |
| 2 | tipado del schema | `npm run db:lint` | `No schema errors found` · exit 0 |
| 3 | seguridad | `npm run db:advisors` | `No issues found` · exit 0 |
| 4 | comportamiento | `npm run db:test` | `Files=5, Tests=47, Result: PASS` · exit 0 |
| 5 | contrato de tipos | `npm run db:types:check` | sin diff · exit 0 |

**Las 47 aserciones pgTAP son exactamente las 47 de la Fase 1.** No es una coincidencia
que haya que aceptar: se comprobó que esta fase no tocó DDL.
`git log 19c5817..8687a18 -- supabase/` devuelve **un solo commit**, `84e3b24`, y su diff
es `supabase/config.toml | 13 +++++++++++--`. Cero migraciones, cero tests pgTAP nuevos.

### Job `arquitectura`

| # | Puerta | Comando | Salida medida |
|---|--------|---------|---------------|
| 6 | invariantes del repo | `npm run ci:arch` | `check-service-role: OK` (8 guardarraíles) · exit 0 |
| 7 | tipado | `npx tsc --noEmit` | sin salida · exit 0 |
| 8 | unitarios | `npm run test:unit` | `16 passed (16) · 285 passed (285)` · exit 0 |
| 9 | build | `npm run build` con el env placeholder de `ci/db.yml` | `✓ Compiled successfully` · 9 rutas · exit 0 |

La puerta 9 se corrió **exactamente con las dos variables placeholder que el plan 02-01
puso en `ci/db.yml`** (`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` y
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_ci_placeholder`), que es lo que
demuestra que el build no depende de un Supabase real.

### Las dos que esta fase añadió y el workflow todavía no conoce

| # | Puerta | Comando | Salida medida |
|---|--------|---------|---------------|
| 10 | integración con JWT reales | `npm run test:integration` | `5 passed (5) · 52 passed (52)` · exit 0 |
| 11 | punta a punta | `PLAYWRIGHT_PORT=3117 npx playwright test` | `76 passed (1.5m)` · exit 0 |

**Las puertas 10 y 11 no están en `ci/db.yml`.** Son 128 aserciones que hoy nadie corre
automáticamente. Añadirlas al workflow es parte del mismo trabajo bloqueado por el scope
`workflow` del token.

### Lo único que no salió limpio

`npm run build` emite **un warning de ESLint**, no un error:

```
./lib/domain/aseador.schema.test.ts
40:20  Warning: '_phone' is assigned a value but never used.  @typescript-eslint/no-unused-vars
```

No pone ninguna puerta en rojo. Queda en `deferred-items.md` de la fase.

---

## Los 6 criterios → verificación mecánica

El detalle completo, aserción por aserción con archivo y herramienta, está en
`02-RESEARCH.md` §Validation Architecture. Resumen de qué prueba cada criterio, cuál es su
aserción central, y **en qué estado quedó al cerrar la fase**:

| # | Criterio | Aserción central | Estado al cerrar |
|---|---|---|---|
| 1 | Login por rol con sesión persistente | **La sesión sobrevive a `page.reload()`.** Es el test que atrapa un `setAll` mal implementado, que es el agujero de caché de CDN | **Verificado.** `e2e/login.spec.ts` (5) + `e2e/ruteo.spec.ts` (10) + `lib/supabase/middleware.test.ts` (4). El test anti-caché original era un **falso verde** y se reemplazó (02-06) |
| 2 | CRUD de apartamentos con los 12 campos | `codigo_acceso` e `ical_url` se persisten en `property_secrets` **y** el mismo `select` con el JWT del admin da `42501` | **Verificado.** `lib/domain/apartamento.integration.test.ts` (15) + `e2e/apartamento-crud.spec.ts` (9) + `e2e/apartamento-cuartos.spec.ts` (9) |
| 3 | Puertas de activación | La base es la red de seguridad: activar sin tarifas por API directa da `23514`. Se assertea el código, **no** el nombre del constraint | **Verificado con una excepción declarada.** El `23514` está probado. **La puerta de `contacto_externo` NO tiene respaldo en base** — ver abajo |
| 4 | Alta y baja de aseadores con revocación inmediata | **Token vivo + desactivación ⇒ 0 filas.** Login, guardar el token, `is_active=false`, consultar con **el mismo token** | **Verificado.** `lib/auth/revocacion.integration.test.ts` (13) + `e2e/aseadores-baja.spec.ts` (4). Es el criterio con doble red: integración y navegador |
| 5 | Buscador y lista de aseadores | Los 4 estados se pintan con icono **y** etiqueta de texto, no solo color | **Verificado.** `e2e/apartamentos-lista.spec.ts` (14) contra las 39 filas reales + `e2e/aseadores-lista.spec.ts` (9) |
| 6 | Validación en vivo del feed (APTO-12) | **No se escribe `calendar_reservations` ni `cleanings`.** Conteo antes y después: igual | **Verificado contra fixtures sintéticas; pendiente contra material real.** `e2e/calendario.spec.ts` (7) + `lib/domain/feed.integration.test.ts` (11). La guía va **sin capturas** y el `.ics` real **no se ha contrastado** — ver Manual-Only |

### El criterio 3 descansa en parte sobre una puerta de solo UI

Está medido y escrito desde el plan 02-03, confirmado como test ejecutable en el 02-10:
**la exigencia de `contacto_externo` cuando `gestion_vivaguest = false` no tiene respaldo
en la base.** El constraint `props_active_requires_owner` solo se dispara cuando
`gestion_vivaguest AND is_active`, así que una unidad informativa se puede activar por API
directa con el contacto vacío y Postgres la deja pasar. Hay un test de integración que
**afirma ese hueco** en vez de disimularlo, y la puerta real vive en Playwright.

Consecuencia práctica: si alguien escribe alguna vez por fuera del formulario, esa mitad
del criterio 3 no lo detiene. Las otras dos mitades (tarifas y responsable) sí.

---

## Aserciones que existen porque algo medido las hizo necesarias

Estas no salen de la spec, salen de lo que el research encontró rompiendo cosas:

- **La contraseña generada tiene ≥12 caracteres**, verificado sobre el generador propio, porque se midió que **la Admin API no valida la longitud**.
- **La reactivación de un aseador exige dos operaciones.** Reactivar solo `profiles.is_active` deja al usuario en `user_banned`. Hay test para las dos mitades.
- **`getUser()` y no `getClaims()`.** Se midió que tras el ban, `getUser()` da 403 pero `getClaims()` responde OK. La documentación oficial de Supabase recomienda `getClaims()`; para el criterio 4 es la respuesta equivocada.
- **La puerta de `contacto_externo` es solo de UI.** La base la dejaría pasar. El test es de Playwright, no de integración, y eso está declarado.
- **`DTEND` es el día del aseo, sin restar ni sumar.** Corre con `TZ=UTC` para que el off-by-one no se esconda.
- **HTTP 200 con cuerpo HTML se distingue de feed válido vacío.** Son dos estados de UI distintos, y confundirlos es cómo un admin conecta el calendario equivocado.

### Y las que la ejecución añadió, que el contrato original no previó

- **El conteo de contraseñas necesita DOS tests, no uno.** El umbral del "doble de lo esperado" deja pasar el sesgo de módulo (`256 % 57 = 28`, exceso del 11 %). Medido en 02-08.
- **La aserción de "no se escribió nada" necesita CENTINELA y CONTROL.** Sembrar filas antes de contar para que la igualdad no sea `0 === 0`, y demostrar en el mismo test que el contador sí se mueve cuando de verdad se escribe. Medido en 02-14.
- **La máscara de miles corrompe la tarifa y ninguna capa se queja.** `120.000` llega como `120`. Solo lo ve una aserción de Playwright sobre el valor del input. Medido en 02-12.
- **Un doble de test permisivo convierte un señuelo en falso verde.** El doble de `lib/data/aseadores.ts` ignoraba los `.eq()`; con él puesto, un señuelo daba `0 failed`. Medido en 02-07.

---

## Per-Task Verification Map

45 tareas en 15 planes y 13 waves. **42 con verificación automatizada, 3 manuales**, y las
tres manuales están en Manual-Only Verifications con su razón. Ninguna fila queda en blanco.

Los conteos entre paréntesis son los de la corrida de firma del 2026-09-02.

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 02-01-T1 | 02-01 | 1 | PLAT-01, PLAT-02 | integración | `npm run test:integration` → `lib/auth/sesion.integration.test.ts` (5) | ✅ pass |
| 02-01-T2 | 02-01 | 1 | PLAT-01, PLAT-02 | build | `npm run build` con el env placeholder de `ci/db.yml` | ✅ pass |
| 02-01-T3 | 02-01 | 1 | PLAT-02 | arquitectura | `npm run ci:arch` (guardarraíles 5 y 6) | ✅ pass |
| 02-02-T1 | 02-02 | 1 | PLAT-07 | unitario (TDD) | `npx vitest run lib/auth/routing.test.ts` (15) | ✅ pass |
| 02-02-T2 | 02-02 | 1 | APTO-11 | unitario (TDD) | `npx vitest run lib/domain/properties.test.ts` (26) | ✅ pass |
| 02-02-T3 | 02-02 | 1 | APTO-05 | unitario (TDD) | `npx vitest run lib/domain/money.test.ts lib/domain/dates.test.ts` (15+15) | ✅ pass |
| 02-03-T1 | 02-03 | 1 | APTO-02, APTO-08, APTO-09 | unitario (TDD) | `npx vitest run lib/domain/apartamento.schema.test.ts` (50) | ✅ pass |
| 02-03-T2 | 02-03 | 1 | APTO-02 | unitario (TDD) | `npx vitest run lib/domain/errors.test.ts` (37) | ✅ pass |
| 02-03-T3 | 02-03 | 1 | APTO-12 | unitario (TDD) | `npx vitest run lib/domain/ical-preview.test.ts` (23), 7 fixtures `.ics` | ✅ pass |
| 02-04-T1 | 02-04 | 2 | PLAT-01, PLAT-02 | **manual** | — · `checkpoint:human-verify`, puerta de legitimidad de paquetes | 🔶 manual, aprobado (02-04-SUMMARY) |
| 02-04-T2 | 02-04 | 2 | PLAT-04 | infra de test | `npm run test:integration` (5 archivos / 52) | ✅ pass |
| 02-04-T3 | 02-04 | 2 | PLAT-01, PLAT-02 | infra de test | `npx playwright test e2e/harness.spec.ts` (2) | ✅ pass |
| 02-05-T1 | 02-05 | 3 | PLAT-07 | build | `npm run build` | ✅ pass |
| 02-05-T2 | 02-05 | 3 | PLAT-07 | arquitectura | `npm run ci:arch` (guardarraíl 6: hex fuera de la capa de tokens) | ✅ pass |
| 02-05-T3 | 02-05 | 3 | PLAT-07 | build + e2e | `npm run build` + `npx playwright test` (el layout raíz lo carga toda la suite) | ✅ pass |
| 02-06-T1 | 02-06 | 4 | PLAT-01, PLAT-02 | unitario (TDD) | `npx vitest run lib/supabase/middleware.test.ts lib/auth/guards.test.ts` (4+8) | ✅ pass |
| 02-06-T2 | 02-06 | 4 | PLAT-01 | e2e | `npx playwright test e2e/login.spec.ts` (5) | ✅ pass |
| 02-06-T3 | 02-06 | 4 | PLAT-02, PLAT-07 | e2e | `npx playwright test e2e/ruteo.spec.ts` (10) | ✅ pass |
| 02-07-T1 | 02-07 | 5 | PLAT-07 | e2e | `npx playwright test e2e/aseadores-lista.spec.ts` (shell: `aria-current`, menú de usuario) | ✅ pass |
| 02-07-T2 | 02-07 | 5 | ASEADOR-03 | unitario (TDD) | `npx vitest run lib/data/aseadores.test.ts` (11) | ✅ pass |
| 02-07-T3 | 02-07 | 5 | ASEADOR-03 | e2e | `npx playwright test e2e/aseadores-lista.spec.ts` (9) | ✅ pass |
| 02-08-T1 | 02-08 | 6 | ASEADOR-01 | unitario (TDD) | `npx vitest run lib/domain/password.test.ts lib/domain/aseador.schema.test.ts` (10+17) | ✅ pass |
| 02-08-T2 | 02-08 | 6 | ASEADOR-01 | integración + arquitectura | `npm run test:integration` → `lib/auth/alta-aseador.integration.test.ts` (8) · `npm run ci:arch` (guardarraíl 7) | ✅ pass |
| 02-08-T3 | 02-08 | 6 | ASEADOR-01 | e2e | `npx playwright test e2e/aseadores-alta.spec.ts` (7) | ✅ pass |
| 02-09-T1 | 02-09 | 7 | ASEADOR-02 | integración | `npm run test:integration` → `lib/auth/revocacion.integration.test.ts` (13) | ✅ pass |
| 02-09-T2 | 02-09 | 7 | ASEADOR-02 | e2e | `npx playwright test e2e/aseadores-baja.spec.ts` (4) | ✅ pass |
| 02-09-T3 | 02-09 | 7 | PLAT-04 | integración + e2e | `npm run test:integration` + `npx playwright test e2e/aseadores-baja.spec.ts` (token vivo ⇒ 0 filas) | ✅ pass |
| 02-10-T1 | 02-10 | 8 | APTO-01 | unitario (TDD) | `npx vitest run lib/data/apartamentos.test.ts` (6) | ✅ pass |
| 02-10-T2 | 02-10 | 8 | APTO-02, APTO-04, APTO-08, APTO-09, APTO-10 | arquitectura | `npm run ci:arch` (guardarraíles 7 y 8) | ✅ pass |
| 02-10-T3 | 02-10 | 8 | APTO-05, APTO-09 | integración | `npm run test:integration` → `lib/domain/apartamento.integration.test.ts` (15) | ✅ pass |
| 02-11-T1 | 02-11 | 9 | APTO-11 | unitario + e2e | `npx vitest run lib/domain/properties.test.ts` (26) + `npx playwright test e2e/apartamentos-lista.spec.ts` | ✅ pass |
| 02-11-T2 | 02-11 | 9 | APTO-01 | e2e | `npx playwright test e2e/apartamentos-lista.spec.ts` (banner, menú de fila, diálogo de baja) | ✅ pass |
| 02-11-T3 | 02-11 | 9 | APTO-11 | e2e | `npx playwright test e2e/apartamentos-lista.spec.ts` (14) — criterio 5 contra las 39 filas | ✅ pass |
| 02-12-T1 | 02-12 | 10 | APTO-05 | unitario | `npx vitest run lib/domain/money.test.ts` (15) | ✅ pass |
| 02-12-T2 | 02-12 | 10 | APTO-02, APTO-04, APTO-08, APTO-09 | e2e | `npx playwright test e2e/apartamento-crud.spec.ts` (9) | ✅ pass |
| 02-12-T3 | 02-12 | 10 | APTO-01, APTO-10 | e2e | `npx playwright test e2e/apartamento-crud.spec.ts` (9) — criterios 2 y 3 | ✅ pass |
| 02-13-T1 | 02-13 | 11 | APTO-06, APTO-07 | unitario (TDD) | `npx vitest run lib/domain/cuartos.schema.test.ts` (20) | ✅ pass |
| 02-13-T2 | 02-13 | 11 | APTO-06, APTO-07 | e2e | `npx playwright test e2e/apartamento-cuartos.spec.ts` (9) | ✅ pass |
| 02-13-T3 | 02-13 | 11 | APTO-06, APTO-07 | e2e | `npx playwright test e2e/apartamento-cuartos.spec.ts` (9) — persistencia y reutilización | ✅ pass |
| 02-14-T1 | 02-14 | 12 | APTO-12 | unitario (TDD) | `npx vitest run lib/domain/ical-url.schema.test.ts` (25) | ✅ pass |
| 02-14-T2 | 02-14 | 12 | APTO-12 | e2e | `npx playwright test e2e/calendario.spec.ts` (7) — los siete estados | ✅ pass |
| 02-14-T3 | 02-14 | 12 | APTO-03 | integración | `npm run test:integration` → `lib/domain/feed.integration.test.ts` (11) — la costura con la Fase 3 | ✅ pass |
| 02-15-T1 | 02-15 | 13 | APTO-12 | **manual** | — · `checkpoint:human-action`, capturas de la cuenta real de Airbnb | 🔴 manual, **abierto** |
| 02-15-T2 | 02-15 | 13 | PLAT-04 | suite completa | las 11 puertas, en el orden del workflow (tabla de arriba) | ✅ pass |
| 02-15-T3 | 02-15 | 13 | APTO-12 | **manual** | — · `checkpoint:human-verify`, humo contra un `.ics` real de Airbnb | 🔴 manual, **abierto** |

**Las tres filas manuales no son consecutivas.** 02-15-T2 está automatizada y se
interpone entre 02-15-T1 y 02-15-T3, y 02-04-T1 está aislada entre 02-03-T3 y 02-04-T2.
La corrida más larga sin verificación automatizada es de **1 tarea**.

---

## Wave 0 Requirements

- [x] Instalar `@playwright/test@1.62.1` y su config con `webServer` — **plan 02-04**, tarea 3. `playwright.config.ts` con `PLAYWRIGHT_PORT` configurable, medido: `reuseExistingServer` sobre el 3000 de otro checkout habría medido el código equivocado
- [x] Segundo proyecto de vitest para los tests de integración, fuera de `test:unit` — **plan 02-04**, tarea 2. `vitest.integration.config.ts`, `include: ['lib/**/*.integration.test.ts']`
- [x] `lib/domain/apartamento.schema.test.ts` — puertas de activación — **plan 02-03**, tarea 1. 50 tests
- [x] `lib/auth/routing.test.ts` — tabla de decisión del ruteo, ~12 casos — **plan 02-02**, tarea 1. 15 tests, tres más de los previstos
- [x] `lib/domain/ical-preview.test.ts` con fixtures `.ics` sintéticos — **plan 02-03**, tarea 3. 23 tests, 7 fixtures en `lib/domain/__fixtures__/`
- [x] `e2e/login.spec.ts`, `e2e/ruteo.spec.ts`, `e2e/apartamento-crud.spec.ts` — **planes 02-06** (login 5, ruteo 10) **y 02-12** (crud 9)
- [x] Ampliar `scripts/ci/check-service-role.sh` con los importadores de `createAdminClient` y el grep de hex — **plan 02-01**, tarea 3 (guardarraíles 5 y 6). Ampliado después a 8 en **02-08** (guardarraíl 7: el guard va antes de la fábrica) y **02-10** (guardarraíl 8: `property_secrets` solo con la fábrica administrativa)

`wave_0_complete: true`. Los dos guardarraíles añadidos fuera de Wave 0 no estaban en la
lista original: existen porque un señuelo demostró que sin ellos **no los atrapaba nada**.

---

## Bloqueante conocido al arrancar — RESUELTO

**El login por email estaba apagado.** `[auth.email] enable_signup = false` en
`supabase/config.toml` mapeaba a `GOTRUE_EXTERNAL_EMAIL_ENABLED=false`, que apagaba el
proveedor entero. Medido: `signInWithPassword` respondía `Email logins are disabled`.

**Cerrado por el plan 02-01, commit `84e3b24`.** Verificado en las dos direcciones:
`createUser` con la clave de servicio + `signInWithPassword` OK, y `signUp` con la
publishable key devuelve `422 signup_disabled`. El auto-registro sigue cerrado por la
clave global `[auth] enable_signup`, que se queda en `false`.

**Lo que NO está verificado:** que el proyecto hosted quede configurado igual. Va en
Manual-Only.

---

## Manual-Only Verifications

La lista original tenía dos filas. Al cerrar son **cuatro**: apareció la prueba de humo
del feed real, y la puerta de legitimidad de paquetes de 02-04 también se quedó manual.

| Behavior | Requirement | Why Manual | Estado | Dueño |
|----------|-------------|------------|--------|-------|
| Comportamiento en Supabase hosted | PLAT-04 | El proyecto no existe todavía. Es el **checkpoint A1 de la Fase 1** y sigue abierto; no es de esta fase cerrarlo. El equivalente de `config.toml` en el panel —Authentication → Providers → Email → Enabled **ON**, Allow new users to sign up **OFF**— está en `02-RESEARCH.md` §8.1 como `[ASSUMED]` y hay que replicarlo a mano al linkear | 🔴 abierto | Fase 1, checkpoint A1 |
| Legitimidad de los paquetes de npm | PLAT-01, PLAT-02 | Que un nombre de paquete sea el legítimo y no un slopsquat no lo decide una máquina. Es la puerta que existe precisamente para eso | ✅ aprobado (02-04-SUMMARY) | plan 02-04 |
| Capturas de la guía de Airbnb | APTO-12 | Hay que tomarlas de la cuenta real de VivaGuest. No existen, no se pueden inventar, y una sacada de un blog de 2024 lleva al admin a un menú que ya no existe. `02-UI-SPEC.md` §10.1 autoriza el recorte a solo texto; `GuiaAirbnb.tsx` renderiza completo sin ellas | 🔴 abierto | plan 02-15, tarea 1 |
| Humo contra un `.ics` real de Airbnb de 2026 | APTO-12 | Las siete fixtures son sintéticas. Ninguna demuestra que el feed que Airbnb genera hoy tenga la forma que asumimos: es el **supuesto A5** del research, respaldado por 432 snapshots que van de 2025-06 a 2026-08 y **no son de la cuenta de VivaGuest** | 🔴 abierto | plan 02-15, tarea 3 |
| El copy de los cuatro pasos de la guía | APTO-12 | `02-UI-SPEC.md` §10.1 lo marca como "a verificar contra la UI real de Airbnb antes de publicar". Va con la misma sesión que las capturas | 🔴 abierto | plan 02-15, tarea 1 |

---

## Lo que NO cubre esta validación, dicho sin adornos

1. **El CI no corre solo.** `ci/db.yml` vive en `ci/`. Las 9 puertas del workflow y las 2
   que esta fase añadió se corren a mano. Un PR que rompa cualquiera de ellas **no se pone
   rojo en GitHub**. Es lo mismo con lo que cerró la Fase 1 y esta fase no lo arregló:
   requiere un token con scope `workflow` y `02-CONTEXT.md` lo difiere.
2. **Las puertas 10 y 11 ni siquiera están escritas en el workflow.** 128 aserciones —52 de
   integración y 76 de punta a punta— que el día que el CI arranque seguirán sin correr si
   nadie añade los pasos.
3. **La mitad de `contacto_externo` del criterio 3 es solo de UI.** Declarado arriba y con
   un test de integración que afirma el hueco.
4. **`npx eslint .` da 3 errores en `e2e/fixtures.ts`** que ninguna puerta ve, porque
   `next build` solo lintea `app/`, `lib/` y `components/`. Es un falso positivo de
   `react-hooks/rules-of-hooks` sobre el `use` de las fixtures de Playwright. Registrado en
   `deferred-items.md` desde el plan 02-06.

---

## Validation Sign-Off

Cada casilla cita el número que la respalda. Es el patrón que estableció el plan 01-09:
un checkbox que afirma en vez de medir es un checkbox que nadie va a volver a mirar.

- [x] **Todas las tareas con verificación automatizada o dependencia declarada de Wave 0.**
      45 tareas: **42 con comando automatizado** en el Per-Task Verification Map, 3 en
      Manual-Only con su razón escrita. Los 7 ítems de Wave 0 están marcados con el plan
      que cerró cada uno.
- [x] **Sin 3 tareas consecutivas sin verificación automatizada.**
      Las 3 manuales son 02-04-T1, 02-15-T1 y 02-15-T3. Ninguna es adyacente a otra:
      02-04-T2 sigue a la primera y 02-15-T2 se interpone entre las otras dos. **Corrida
      máxima sin automatizar: 1.**
- [x] **Sin flags de watch mode.**
      Medido: `grep -rnE '\-\-watch|watch: true|watchAll' package.json vitest.config.ts
      vitest.integration.config.ts playwright.config.ts ci/db.yml` → **exit 1, cero
      coincidencias**. `test:unit` es `vitest run`, `test:integration` es
      `vitest run --config …`.
- [x] **`nyquist_compliant: true` en el frontmatter.**
      Puesto porque se cumple la condición del checkbox anterior, no por conveniencia.

### Y por qué el `status` es `passed_with_gaps` y no `passed`

`nyquist_compliant` mide la densidad de muestreo y **da true**. El `status` mide otra cosa:
si la fase cerró con todo verificado. No cerró.

- Dos checkpoints humanos siguen abiertos: las capturas y el humo con feed real.
- El checkpoint A1 de la Fase 1 sigue abierto y arrastra la verificación en hosted.
- El CI no corre solo.

La Fase 1 cerró en `passed_with_gaps` y quedó legible. Firmar esta en `passed` con tres
huecos abiertos habría sido el tipo de comodidad falsa que esta fase gastó su esfuerzo en
evitar: 53 señuelos en rojo no valen nada si el sign-off redondea.

**Approval:** firmado el 2026-09-02 por el plan 02-15, tarea 2, con las 11 puertas
corridas a mano y su salida transcrita arriba.
