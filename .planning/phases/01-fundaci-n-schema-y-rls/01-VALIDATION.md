---
phase: 1
slug: fundaci-n-schema-y-rls
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-31
---

# Phase 1 — Validation Strategy

> Contrato de validación por fase para muestreo de feedback durante la ejecución.
> Derivado de `01-RESEARCH.md` §Validation Architecture, verificado ejecutando contra Supabase local (CLI 2.115.0 / Postgres 17.6).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (base de datos)** | pgTAP 1.3.3 vía `supabase test db` (contenedor `pg_prove:3.36`). `supabase test db` instala pgTAP solo: no va en ninguna migración y nunca llega a prod |
| **Framework (TypeScript)** | vitest 4.1.11 — en esta fase solo helpers de fecha y mapeo de errores |
| **Config file** | `supabase/config.toml` (`[db.seed]`, `[db] major_version = 17`). pgTAP no requiere config |
| **Quick run command** | `npx supabase test db --local` |
| **Full suite command** | `npx supabase db start && npx supabase db lint --local && npx supabase db advisors --local --type security --fail-on error && npx supabase test db --local && npm run db:types:check` |
| **Estimated runtime** | Quick: < 1 s medido con 21 aserciones. Full: ~20 s con `db start` (18 s medidos, contra 1m50s de `supabase start`) |

**Nota de arranque en CI:** usar `supabase db start`, no `supabase start`. Levanta un solo contenedor y `test db`, `db advisors` y `gen types` funcionan todos con solo la base arriba.

---

## Sampling Rate

- **Después de cada commit de tarea:** `npx supabase test db --local` (< 1 s con la base ya arriba)
- **Después de cada wave:** las 4 puertas del job `database` más el job `arquitectura`
- **Antes de `/gsd:verify-work`:** suite completa en verde en GitHub Actions
- **Max feedback latency:** 1 segundo en el ciclo de tarea, ~20 s en el de wave

---

## Criterios de éxito de la fase → verificación mecánica

| # | Criterio (ROADMAP.md) | Req | Herramienta | Aserción | Estado |
|---|---|---|---|---|---|
| 1 | `db reset` levanta el schema desde cero, pgTAP en verde con casos negativos, seed cargado | — | CLI + pgTAP | `supabase db start` sale 0; `test db` da `Result: PASS` sin `Bad plan`; `is(count(properties), 39)`, `is(count(distinct cluster), 8)`, `is(count(*) where not gestion_vivaguest, 5)` en `03_seed.test.sql`, fuera del bloque de limpieza | Mecánica verificada |
| 2 | El aseador solo ve sus aseos, sin instrucciones ni apartamentos ajenos | PLAT-03, PLAT-06 | pgTAP con roles reales | Positivos como aseador A; `is_empty` sobre `cleanings` y `properties` como aseador B; `is_empty` como aseador C desactivado con token vivo; **`is_empty` sobre el join `cleanings ⋈ properties` como B** para cubrir fuga por embed | 5 de 6 en verde, falta la del join |
| 3 | El código de acceso solo por RPC, solo con aseo vigente, con auditoría | PLAT-05 | pgTAP | `throws_ok('select * from property_secrets','42501')` incluso para el aseador asignado; `results_eq` sobre `reveal_access_code()` para A; `throws_ok 42501` para B; `is(count(access_code_reads), 1)`; `throws_ok 42501` para un aseo fuera de ventana | (a)–(d) en verde, falta la de ventana |
| 4 | Un segundo aseo activo para el mismo apartamento y fecha falla en la base | ASEO-07 | pgTAP + vitest | `throws_ok(insert, '23505')`; `lives_ok(insert)` tras cancelar; `throws_ok '23505'` con dos filas informativas (`state IS NULL`); test de `mapDbError()` que traduce `23505` + nombre del índice al mensaje en español | (a)–(c) en verde, falta el de vitest |
| 5 | Editar la tarifa no altera el margen congelado | FIN-01 | pgTAP | Snapshot correcto tras insert; inmutable tras `update properties`; **inmutable tras `update cleanings` directo** sobre un aseo completado; `data_type = 'bigint'` | (a)–(c) en verde, falta la de tipo |

---

## Guardarraíles de schema

Cubren el punto ciego verificado de `db advisors`: **no ve objetos sin grants**. Por eso no son redundantes con el advisor.

- Toda tabla de `public` tiene RLS habilitada
- Toda tabla con RLS tiene al menos una policy (RLS sin policy devuelve todo vacío, en silencio)
- Toda vista de `public` lleva `security_invoker = on`
- `anon` no conserva ningún privilegio sobre `public`, incluido `TRUNCATE`, que ignora RLS

Aserciones que el plan debe añadir:

- Toda función `SECURITY DEFINER` tiene `set search_path = ''`
- Toda columna monetaria es `bigint`
- `service_role` puede leer todas las tablas de `public`
- Ninguna migración ni seed usa `current_date` (esto va por grep en el job de arquitectura, no en pgTAP)

---

## Per-Task Verification Map

Se llena cuando el planner produzca las tareas. Cada tarea debe mapear a una aserción de las tablas de arriba o declarar por qué no aplica.

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| pendiente | — | — | — | — | — | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `supabase/tests/00_rls_aseos.test.sql` — PLAT-03, PLAT-05, PLAT-06
- [ ] `supabase/tests/01_invariantes.test.sql` — ASEO-07, FIN-01
- [ ] `supabase/tests/02_guardarrailes.test.sql` — invariantes de schema
- [ ] `supabase/tests/03_seed.test.sql` — 39 unidades, 8 clusters, 5 externas
- [ ] `supabase/tests/04_storage.test.sql` — policies de `storage.objects`
- [ ] Helper `tests_auth(uuid)` de 6 líneas con `set_config('role', …, true)`, sin dependencia de `dbdev` ni basejump
- [ ] `.github/workflows/db.yml`
- [ ] `scripts/ci/check-service-role.sh`
- [ ] Config de vitest más `lib/domain/errors.test.ts` para el mapeo de `23505`
- [ ] Instalar `vitest@4.1.11` (no viene con `create-next-app`)

---

## Trampas de la mecánica de test

Tres modos de fallo reproducidos durante el research. El plan debe respetarlos o los tests mienten:

1. **Los tests corren contra la base con el seed ya cargado.** Los fixtures colisionan si no se limpian dentro de la transacción.
2. **Cuando el rol no tiene grant, la aserción correcta es `throws_ok('42501')`, no `is_empty`.** `is_empty` levanta la excepción, mata el archivo entero y pgTAP reporta "Bad plan" en vez de un fallo legible.
3. **El índice parcial no hace match si la consulta usa `<>` en vez de `IS DISTINCT FROM`.** Se midió `Seq Scan` incluso con `enable_seqscan=off`.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Policies de `storage.objects` en Supabase **hosted** | PLAT-05 | Solo verificado en local. `postgres` no es dueño de `storage.objects` ni miembro de `supabase_storage_admin`, y aun así `CREATE POLICY` pasó en local. Confianza LOW en que se comporte igual en hosted | Aplicar las migraciones contra el proyecto Supabase de dev una vez linkeado, y confirmar que las policies quedan creadas y activas |
| `supabase config push` de la sección `[auth]` | — | Requiere proyecto linkeado | Igual que arriba |

---

## Validation Sign-Off

- [ ] Todas las tareas tienen verificación automatizada o dependencia declarada de Wave 0
- [ ] Continuidad de muestreo: no hay 3 tareas consecutivas sin verificación automatizada
- [ ] Wave 0 cubre todas las referencias faltantes
- [ ] Sin flags de watch mode
- [ ] Latencia de feedback < 1 s en el ciclo de tarea
- [ ] `nyquist_compliant: true` en el frontmatter

**Approval:** pending
