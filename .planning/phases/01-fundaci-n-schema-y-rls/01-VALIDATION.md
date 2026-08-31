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

Cada tarea debe mapear a una aserción de las tablas de arriba o declarar por qué no aplica.

**Wave 0 (plan 01-02) — el contrato ejecutable.** Estos archivos están en rojo a propósito: los ponen en verde los planes 01-03 a 01-09. `❌ red` aquí es el estado correcto, no una regresión.

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-02-T1a | 01-02 | 0 | PLAT-03, PLAT-05, PLAT-06 | pgTAP, roles reales — criterios 2 y 3, `plan(16)` | `npx supabase test db --local supabase/tests/00_rls_aseos.test.sql` | ✅ | ❌ red (esperado) |
| 01-02-T1b | 01-02 | 0 | ASEO-07, FIN-01 | pgTAP como `postgres` — criterios 4 y 5, `plan(11)` | `npx supabase test db --local supabase/tests/01_invariantes.test.sql` | ✅ | ❌ red (esperado) |
| 01-02-T2a | 01-02 | 0 | PLAT-05, PLAT-06 | pgTAP sobre catálogos — guardarraíles, `plan(8)` | `npx supabase test db --local supabase/tests/02_guardarrailes.test.sql` | ✅ | ❌ red (esperado, 7/8 pasan en vacío) |
| 01-02-T2b | 01-02 | 0 | — (criterio 1 del ROADMAP) | pgTAP sobre el seed, `plan(5)` | `npx supabase test db --local supabase/tests/03_seed.test.sql` | ✅ | ❌ red (esperado) |
| 01-02-T2c | 01-02 | 0 | PLAT-05 | pgTAP sobre `storage.objects`, `plan(5)` | `npx supabase test db --local supabase/tests/04_storage.test.sql` | ✅ | ❌ red (esperado) |
| 01-02-EST | 01-02 | 0 | — (mecánica de la suite) | Estructural: `plan(N)` == número de aserciones | `grep -cE '^select (is\|isnt\|is_empty\|throws_ok\|lives_ok\|results_eq)\(' supabase/tests/*.test.sql` vs `grep -hoE 'select plan\([0-9]+\)'` | ✅ | ✅ green (16/11/8/5/5 = 45) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Por qué `❌ red` y no `Bad plan` como criterio.** El plan 01-02 pedía verificar `grep -q 'Bad plan'` al terminar Wave 0. Es imposible de satisfacer sin schema: la primera sentencia de cada archivo (la limpieza del seed) aborta con `relation ... does not exist`, la transacción muere y pgTAP reporta `Bad plan ... ran 0`. La puerta `sin Bad plan` es válida **a partir del plan 01-03**, cuando ya existan tablas. Mientras tanto la sustituyen dos verificaciones que sí discriminan hoy:

1. `plan(N)` coincide con el número de aserciones de cada archivo (causa estructural nº 1 de `Bad plan`).
2. Cero errores de sintaxis en **todas** las sentencias de cada archivo, comprobado con `psql -f` sin `ON_ERROR_STOP`: Postgres hace el parse crudo antes de rechazar por transacción abortada, así que un error de sintaxis en la última línea del archivo sí aparece. Método validado plantando un error deliberado (se detectó) sobre un archivo que da 0.

Y la comprobación de que el rojo es del tipo correcto: los únicos `ERROR` de la corrida completa son `relation "public.cleaning_state_transitions" does not exist` y `relation "public.properties" does not exist`. Ninguno es de mecánica de test.

---

## Wave 0 Requirements

- [x] `supabase/tests/00_rls_aseos.test.sql` — PLAT-03, PLAT-05, PLAT-06 *(plan 01-02)*
- [x] `supabase/tests/01_invariantes.test.sql` — ASEO-07, FIN-01 *(plan 01-02)*
- [x] `supabase/tests/02_guardarrailes.test.sql` — invariantes de schema *(plan 01-02)*
- [x] `supabase/tests/03_seed.test.sql` — 39 unidades, 8 clusters, 5 externas *(plan 01-02)*
- [x] `supabase/tests/04_storage.test.sql` — policies de `storage.objects` *(plan 01-02)*
- [x] Helper `tests_auth(uuid)` de 6 líneas con `set_config('role', …, true)`, sin dependencia de `dbdev` ni basejump *(plan 01-02: replicado en 00, 01 y 04, que son los archivos que cambian de usuario)*
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
4. **`storage.objects` no se comporta como una tabla de `public`.** Medido durante el plan 01-02 contra la base local:
   - `authenticated` **y `anon`** traen `arwdDxtm` por defecto, otorgado por `supabase_storage_admin`.
   - Ese grant **no se puede revocar desde una migración**: `revoke ... from authenticated` como `postgres` es un no-op silencioso (`has_table_privilege` sigue en `true`), `revoke ... granted by supabase_storage_admin` responde *"grantor must be current user"* y `set role supabase_storage_admin` responde *"permission denied to set role"*. La inmutabilidad de la evidencia **debe apoyarse en la ausencia de policies de UPDATE/DELETE**, no en un revoke.
   - Existe un trigger `BEFORE DELETE FOR EACH STATEMENT storage.protect_delete()` que rechaza todo borrado directo por SQL **con errcode `42501`**, salvo que el GUC `storage.allow_delete_query` valga `'true'`. Por tanto `throws_ok(delete ..., '42501')` sobre `storage.objects` es un **falso verde**: pasa para cualquier rol, incluido el admin. Para probar la RLS hay que levantar el GUC y afirmar 0 filas afectadas, más una verificación posterior de que el objeto sigue existiendo.

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
