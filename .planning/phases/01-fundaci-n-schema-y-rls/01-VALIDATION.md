---
phase: 1
slug: fundaci-n-schema-y-rls
status: signed
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-31
signed: 2026-08-31
signed_by: plan 01-09
---

# Phase 1 — Validation Strategy

> Contrato de validación por fase para muestreo de feedback durante la ejecución.
> Derivado de `01-RESEARCH.md` §Validation Architecture, verificado ejecutando contra Supabase local (CLI 2.116.0 / Postgres 17.6).
> **Firmado por el plan 01-09** tras una corrida en frío: `db start` con las 10 migraciones y los 6 seeds, `Files=5, Tests=47, Result: PASS`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (base de datos)** | pgTAP 1.3.3 vía `supabase test db` (contenedor `pg_prove:3.36`). `supabase test db` instala pgTAP solo: no va en ninguna migración y nunca llega a prod |
| **Framework (TypeScript)** | vitest 4.1.11 — en esta fase solo helpers de fecha y mapeo de errores (10 tests en `lib/domain/errors.test.ts`) |
| **Config file** | `supabase/config.toml` (`[db.seed]`, `[db] major_version = 17`) y `vitest.config.ts`. pgTAP no requiere config |
| **Quick run command** | `npx supabase test db --local` |
| **Full suite command** | `npx supabase db start && npx supabase db lint --local && npx supabase db advisors --local --type security --fail-on error && npx supabase test db --local && npm run db:types:check` |
| **Estimated runtime** | Quick: `0 wallclock secs (0.07 CPU)` medido con las 47 aserciones. Full: ~20 s con `db start` (18 s medidos, contra 1m50s de `supabase start`) |

**Nota de arranque en CI:** usar `supabase db start`, no `supabase start`. Levanta un solo contenedor y `test db`, `db advisors` y `gen types` funcionan todos con solo la base arriba. Verificado: el plan 01-09 generó `lib/database.types.ts` con solo la base levantada, sin PostgREST ni Kong.

---

## Sampling Rate

- **Después de cada commit de tarea:** `npx supabase test db --local` (0 s medidos con la base ya arriba)
- **Después de cada wave:** las 4 puertas del job `database` más las 4 del job `arquitectura`
- **Antes de `/gsd:verify-work`:** suite completa en verde
- **Max feedback latency:** por debajo de 1 segundo en el ciclo de tarea, ~20 s en el de wave

---

## Criterios de éxito de la fase → verificación mecánica

| # | Criterio (ROADMAP.md) | Req | Herramienta | Aserción | Estado |
|---|---|---|---|---|---|
| 1 | `db reset` levanta el schema desde cero, pgTAP en verde con casos negativos, seed cargado | — | CLI + pgTAP | `supabase db start` sale 0 aplicando 10 migraciones y 6 seeds; `test db` da `Files=5, Tests=47, Result: PASS` sin `Bad plan`; `03_seed.test.sql` aserciones 1–5: 39 unidades, 8 clusters, 5 externas, tope de 3 tareas por tipo de cuarto, ninguna unidad nace activa | ✅ verificado — `03_seed.test.sql` 1–5, corrida en frío |
| 2 | El aseador solo ve sus aseos, sin instrucciones ni apartamentos ajenos | PLAT-03, PLAT-06 | pgTAP con roles reales | `00_rls_aseos.test.sql` aserciones 1–9. Positivos como aseadora A (1–3); `is_empty` sobre `cleanings` y `properties` como aseadora B (4–5); **aserción 6: `is_empty` sobre el join `cleanings ⋈ properties` como B**, que es la fuga por embed de PostgREST; aserción 7 sobre las instrucciones; 8–9 como aseadora C desactivada con token vivo | ✅ verificado — `00_rls_aseos.test.sql` 1–9, las 9 en verde |
| 3 | El código de acceso solo por RPC, solo con aseo vigente, con auditoría | PLAT-05 | pgTAP | `00_rls_aseos.test.sql` aserciones 10–13 y 16. `throws_ok('select * from property_secrets','42501')` incluso para la aseadora asignada (10); `results_eq` sobre `reveal_access_code()` para A (11); la auditoría ocurre en la misma transacción que la lectura (12); **aserción 13: ventana de desbloqueo `hoy..hoy+1` contra la ventana de lectura `hoy-1..hoy+7`**, que es el caso "aseo fuera de ventana"; aserción 16: `access_code_reads` sí tiene grant y aun así la RLS filtra | ✅ verificado — `00_rls_aseos.test.sql` 10–13 y 16 |
| 4 | Un segundo aseo activo para el mismo apartamento y fecha falla en la base | ASEO-07 | pgTAP + vitest | `01_invariantes.test.sql` aserciones 4–7: `throws_ok(insert,'23505')` con `completada` contando como estado activo (4); `lives_ok` tras cancelar (5); la fila informativa `state IS NULL` sí participa del índice parcial (6); idempotencia del pipeline iCal (7). Más `lib/domain/errors.test.ts`, 10 tests, que traduce `23505` + nombre del índice al mensaje en español | ✅ verificado — `01_invariantes.test.sql` 4–7 + `npm run test:unit` 10/10 |
| 5 | Editar la tarifa no altera el margen congelado | FIN-01 | pgTAP | `01_invariantes.test.sql` aserciones 1–3: el trigger copia la tarifa vigente al insertar (1); subir la tarifa del apartamento no reescribe el margen congelado (2); **un UPDATE directo sobre `cleanings` tampoco lo reescribe** (3). Más `02_guardarrailes.test.sql` aserción 6: las 5 columnas monetarias son `bigint` y no `numeric`, con `LEFT JOIN` para que una columna ausente también falle | ✅ verificado — `01_invariantes.test.sql` 1–3 + `02_guardarrailes.test.sql` 6 |

**Cierre del criterio 5 en el contrato tipado.** La aserción 6 del guardarraíl impide el `numeric(12,2)` del DDL de `ARCHITECTURE.md`, y el plan 01-09 verificó la consecuencia en el otro extremo: `gen types` emite `pago_aseador: number | null`, `tarifa_huesped: number | null` y `monto: number`. Si alguna columna monetaria volviera a `numeric`, `supabase-js` la devolvería como `string` y el tipo generado lo delataría en el diff del PR.

---

## Guardarraíles de schema

Cubren el punto ciego **medido** de `db advisors`: no ve objetos sin grants. Durante el plan 01-07, entre las migraciones 07 y 08, el advisor reportó **20** tablas con `rls_disabled_in_public` y no 22: `property_secrets` y `storage_deletion_queue` no aparecieron porque no tienen ningún grant. Por eso los guardarraíles no son redundantes con el advisor.

`02_guardarrailes.test.sql`, 10 aserciones, todas en verde:

| # | Invariante |
|---|---|
| 1 | Toda tabla de `public` tiene RLS habilitada — las 22 |
| 2 | Toda tabla con RLS tiene al menos una policy (RLS sin policy devuelve todo vacío, en silencio) |
| 3 | Toda vista de `public` lleva `security_invoker = on` — hoy no hay vistas, la aserción queda armada para las Fases 2–9 |
| 4 | `anon` no conserva ningún privilegio sobre `public`, incluido `TRUNCATE`, que ignora RLS |
| 4b | El `pg_default_acl` de la CLI 2.116.0 cubre **secuencias**, no solo tablas |
| 5 | Toda función `SECURITY DEFINER` tiene `set search_path = ''` |
| 6 | Toda columna monetaria es `bigint` |
| 7 | `service_role` puede leer todas las tablas de `public` — `BYPASSRLS` no otorga privilegios de tabla |
| 8 | `property_secrets` sin ningún grant: PLAT-05 no depende de una policy sino de la ausencia de privilegio |
| 9 | Ninguna función de `public` ni de `private` es ejecutable por `anon` — el sustituto del default privilege que Postgres no permite |

Fuera de pgTAP, por grep en el job `arquitectura` (`scripts/ci/check-service-role.sh`):

- Ninguna migración ni seed usa `current_date` ni `now()::date`; la regla transversal es `public.today_bog()`
- La clave secreta solo se nombra en `lib/supabase/admin.ts`
- Ninguna clave secreta lleva prefijo `NEXT_PUBLIC_`
- `lib/supabase/admin.ts` declara `import 'server-only'`

---

## Per-Task Verification Map

Cada tarea mapea a una aserción de las tablas de arriba o declara por qué no aplica.
**21 tareas en 9 planes, las 21 con al menos un bloque `<automated>`. Racha máxima de tareas consecutivas sin verificación automatizada: 0.**

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-T1 | 01-01 | 1 | ASEO-07, PLAT-05 | Build gate — prohibición de Turbopack | `npm run build` + grep de `turbopack` | ✅ | ✅ green |
| 01-01-T2 | 01-01 | 1 | ASEO-07, PLAT-05 | Config gate — `enable_signup=false`, `jwt_expiry=1800`, `sql_paths` | `npx supabase db start` + greps sobre `config.toml` | ✅ | ✅ green |
| 01-01-T3 | 01-01 | 1 | ASEO-07 | vitest + arquitectura — mapeo de `23505` | `npm run test:unit`, `bash scripts/ci/check-service-role.sh` | ✅ | ✅ green (10/10) |
| 01-02-T1a | 01-02 | 2 | PLAT-03, PLAT-05, PLAT-06 | pgTAP, roles reales — criterios 2 y 3, `plan(16)` | `npx supabase test db --local supabase/tests/00_rls_aseos.test.sql` | ✅ | ✅ green (16/16) |
| 01-02-T1b | 01-02 | 2 | ASEO-07, FIN-01 | pgTAP como `postgres` — criterios 4 y 5, `plan(11)` | `npx supabase test db --local supabase/tests/01_invariantes.test.sql` | ✅ | ✅ green (11/11) |
| 01-02-T2a | 01-02 | 2 | PLAT-05, PLAT-06 | pgTAP sobre catálogos — guardarraíles, `plan(10)` | `npx supabase test db --local supabase/tests/02_guardarrailes.test.sql` | ✅ | ✅ green (10/10) |
| 01-02-T2b | 01-02 | 2 | — (criterio 1 del ROADMAP) | pgTAP sobre el seed, `plan(5)` | `npx supabase test db --local supabase/tests/03_seed.test.sql` | ✅ | ✅ green (5/5) |
| 01-02-T2c | 01-02 | 2 | PLAT-05 | pgTAP sobre `storage.objects`, `plan(5)` | `npx supabase test db --local supabase/tests/04_storage.test.sql` | ✅ | ✅ green (5/5) |
| 01-02-EST | 01-02 | 2 | — (mecánica de la suite) | Estructural: `plan(N)` == número de aserciones | `grep -hoE 'select plan\([0-9]+\)' supabase/tests/*.test.sql` | ✅ | ✅ green (16+11+10+5+5 = 47) |
| 01-03-T1 | 01-03 | 3 | PLAT-05, FIN-01, ASEO-07 | Migraciones 01–02: `today_bog()` y los 6 enums | `npx supabase db reset --local` + `db lint` + pgTAP | ✅ | ✅ green |
| 01-03-T2 | 01-03 | 3 | PLAT-05, FIN-01, ASEO-07 | Migración 03: catálogo | `npx supabase db reset --local && npx supabase db lint --local` | ✅ | ✅ green |
| 01-04-T1 | 01-04 | 4 | ASEO-07, FIN-01, PLAT-06, PLAT-05 | Migración 04: `cleanings` e índices únicos parciales — criterio 4 | `npx supabase db reset --local && npx supabase db lint --local` + `01_invariantes` 4–7 | ✅ | ✅ green |
| 01-04-T2 | 01-04 | 4 | ASEO-07, FIN-01, PLAT-06, PLAT-05 | Checklist, evidencia, reportes y `access_code_reads` | `npx supabase db reset --local && npx supabase db lint --local` | ✅ | ✅ green |
| 01-05-T1 | 01-05 | 4 | PLAT-03, FIN-01 | Seed de catálogos: ajustes, cuartos, tareas, faltantes | `npx supabase db reset --local` + `03_seed` 4 | ✅ | ✅ green |
| 01-05-T2 | 01-05 | 4 | PLAT-03, FIN-01 | Seed de 39 unidades en 8 clusters — criterio 1 | `npx supabase db reset --local` + `03_seed` 1–3, 5 | ✅ | ✅ green |
| 01-06-T1 | 01-06 | 5 | FIN-01, ASEO-07 | Migración 05: snapshot financiero y máquina de estados — criterio 5 | `db reset` + `db lint` + `01_invariantes` 1–3, 8–10 | ✅ | ✅ green |
| 01-06-T2 | 01-06 | 5 | FIN-01, ASEO-07 | Migración 06: notificaciones, push y cola de borrado | `npx supabase db reset --local && npx supabase db lint --local` | ✅ | ✅ green |
| 01-07-T1 | 01-07 | 6 | PLAT-03, PLAT-05, PLAT-06 | Migración 07: matriz de grants | `db reset` + `db lint` + `02_guardarrailes` 4, 4b, 7, 8 | ✅ | ✅ green |
| 01-07-T2 | 01-07 | 6 | PLAT-03, PLAT-05, PLAT-06 | Migración 08: esquema `private`, RLS y 37 policies — criterio 2 | `db advisors --type security --fail-on error` + `00_rls_aseos` 1–9 | ✅ | ✅ green |
| 01-08-T1 | 01-08 | 7 | PLAT-05, PLAT-06, ASEO-07 | `reveal_access_code()` y `confirm_cleaning()` — criterio 3 | `db reset` + `db lint` + `00_rls_aseos` 10–13 | ✅ | ✅ green |
| 01-08-T2 | 01-08 | 7 | PLAT-05, PLAT-06, ASEO-07 | `start` / `finish` / `decline` / `toggle_checklist_item` | `db reset` + `db lint` + `01_invariantes` 8–10 | ✅ | ✅ green |
| 01-08-T3 | 01-08 | 7 | PLAT-05, PLAT-06 | Migración 10: bucket privado y policies de `storage.objects` | `db reset` + `db lint` + `04_storage` 1–5 | ✅ | ✅ green (solo local — ver Manual-Only) |
| 01-09-T1 | 01-09 | 8 | PLAT-03, PLAT-05, PLAT-06, ASEO-07, FIN-01 | Contrato tipado y puerta de drift | `npm run db:types && npm run db:types:check && npx tsc --noEmit` | ✅ | ✅ green (0 sincronizado, 1 con drift) |
| 01-09-T2 | 01-09 | 8 | PLAT-03, PLAT-05, PLAT-06, ASEO-07, FIN-01 | Las 8 puertas de CI y el sign-off | `db lint`, `db advisors`, `test db`, `db:types:check`, `ci:arch`, `tsc`, `test:unit`, `build` | ✅ | ✅ green en local — falta ejercerlo en el runner |
| 01-09-T3 | 01-09 | 8 | PLAT-05 | Checkpoint humano: crear y linkear los proyectos dev y prod | `test -f .env.local && git check-ignore -q .env.local` | ⬜ | ⬜ pending — bloqueante humano (A1, A3) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Por qué las filas de Wave 0 pasaron de `❌ red (esperado)` a `✅ green`.** El plan 01-02 escribió los 5 archivos antes que el schema, así que el rojo era el estado correcto: `Files=5, Tests=25, Result: FAIL` tras el plan 01-07, con `00_rls_aseos` y `04_storage` abortando en `Bad plan ... ran 0`. Los planes 01-03 a 01-08 los pusieron en verde uno a uno sin reescribir ninguna aserción. La cuenta subió de las 45 planeadas a **47** porque el plan 01-07 partió el guardarraíl 4 en 4 y 4b (las secuencias) y el 01-08 añadió el guardarraíl 9 (ninguna función ejecutable por `anon`). Es un superconjunto del contrato original, no una desviación de él.

**Por qué `❌ red` y no `Bad plan` como criterio durante Wave 0.** El plan 01-02 pedía verificar `grep -q 'Bad plan'` al terminar Wave 0. Era imposible de satisfacer sin schema: la primera sentencia de cada archivo (la limpieza del seed) abortaba con `relation ... does not exist`, la transacción moría y pgTAP reportaba `Bad plan ... ran 0`. La puerta `sin Bad plan` es válida **a partir del plan 01-03**, y hoy se cumple: la corrida completa no emite ningún `Bad plan`. Mientras tanto la sustituyeron dos verificaciones que sí discriminaban:

1. `plan(N)` coincide con el número de aserciones de cada archivo (causa estructural nº 1 de `Bad plan`).
2. Cero errores de sintaxis en **todas** las sentencias de cada archivo, comprobado con `psql -f` sin `ON_ERROR_STOP`: Postgres hace el parse crudo antes de rechazar por transacción abortada, así que un error de sintaxis en la última línea del archivo sí aparece. Método validado plantando un error deliberado.

---

## Wave 0 Requirements

- [x] `supabase/tests/00_rls_aseos.test.sql` — PLAT-03, PLAT-05, PLAT-06 *(plan 01-02)*
- [x] `supabase/tests/01_invariantes.test.sql` — ASEO-07, FIN-01 *(plan 01-02)*
- [x] `supabase/tests/02_guardarrailes.test.sql` — invariantes de schema *(plan 01-02)*
- [x] `supabase/tests/03_seed.test.sql` — 39 unidades, 8 clusters, 5 externas *(plan 01-02)*
- [x] `supabase/tests/04_storage.test.sql` — policies de `storage.objects` *(plan 01-02)*
- [x] Helper `tests_auth(uuid)` de 6 líneas con `set_config('role', …, true)`, sin dependencia de `dbdev` ni basejump *(plan 01-02: replicado en 00, 01 y 04, que son los archivos que cambian de usuario)*
- [x] `.github/workflows/db.yml` *(plan 01-01; puesto en verde por el plan 01-09)*
- [x] `scripts/ci/check-service-role.sh` *(plan 01-01; sale `check-service-role: OK`)*
- [x] Config de vitest más `lib/domain/errors.test.ts` para el mapeo de `23505` *(plan 01-01; 10 tests)*
- [x] Instalar `vitest@4.1.11` (no viene con `create-next-app`) *(plan 01-01)*

---

## Puertas de CI

`.github/workflows/db.yml`, dos jobs en paralelo, 4 puertas cada uno. Medición local del plan 01-09 sobre una base recién levantada:

| Job | Puerta | Comando | Resultado local |
|---|---|---|---|
| `database` | 1. tipado del schema | `supabase db lint --local` | `No schema errors found` |
| `database` | 2. seguridad | `supabase db advisors --local --type security --fail-on error` | `No issues found` |
| `database` | 3. comportamiento | `supabase test db --local` | `Files=5, Tests=47, Result: PASS` |
| `database` | 4. contrato tipado | `npm run db:types:check` | 0 sincronizado; 1 con una tabla extra en la base |
| `arquitectura` | 1. invariantes del repo | `bash scripts/ci/check-service-role.sh` | `check-service-role: OK` |
| `arquitectura` | 2. tipos | `npx tsc --noEmit` | 0, sin salida |
| `arquitectura` | 3. unitarios | `npm run test:unit` | `10 passed (10)` |
| `arquitectura` | 4. build | `npm run build` | `Compiled successfully in 4.7s`, 5 páginas estáticas |

**Corrección de una cifra que el workflow traía mal.** El comentario del paso `db advisors` decía que este diseño emite 3 `WARN multiple_permissive_policies` y que por eso el umbral no puede bajar a `warn`. Medido: son **14**, y son de categoría `PERFORMANCE`, así que **no aparecen bajo `--type security`**, que hoy sale sin ningún hallazgo. El umbral se queda en `error` por otra razón, ahora escrita en el propio workflow: los lints de seguridad que solo existen en hosted (configuración de `[auth]`, extensiones en `public`) llegan como `WARN` y no se arreglan con una migración.

**Pendiente de esta fase:** el workflow nunca se ha ejecutado en un runner de GitHub Actions. `origin/main` está en el commit anterior a la fase y no hay ninguna corrida registrada. Las 8 puertas están verificadas en local, comando por comando, en el mismo orden del workflow, con la misma versión de CLI que la action tiene pineada (2.116.0). Lo que falta es el `git push`, que no es una acción que el ejecutor tome por su cuenta. Va con el checkpoint humano.

---

## Trampas de la mecánica de test

Modos de fallo reproducidos durante el research y la ejecución. El plan debe respetarlos o los tests mienten:

1. **Los tests corren contra la base con el seed ya cargado.** Los fixtures colisionan si no se limpian dentro de la transacción.
2. **Cuando el rol no tiene grant, la aserción correcta es `throws_ok('42501')`, no `is_empty`.** `is_empty` levanta la excepción, mata el archivo entero y pgTAP reporta "Bad plan" en vez de un fallo legible.
3. **El índice parcial no hace match si la consulta usa `<>` en vez de `IS DISTINCT FROM`.** Se midió `Seq Scan` incluso con `enable_seqscan=off`.
4. **`storage.objects` no se comporta como una tabla de `public`.** Medido durante el plan 01-02 contra la base local:
   - `authenticated` **y `anon`** traen `arwdDxtm` por defecto, otorgado por `supabase_storage_admin`.
   - Ese grant **no se puede revocar desde una migración**: `revoke ... from authenticated` como `postgres` es un no-op silencioso (`has_table_privilege` sigue en `true`), `revoke ... granted by supabase_storage_admin` responde *"grantor must be current user"* y `set role supabase_storage_admin` responde *"permission denied to set role"*. La inmutabilidad de la evidencia **debe apoyarse en la ausencia de policies de UPDATE/DELETE**, no en un revoke.
   - Existe un trigger `BEFORE DELETE FOR EACH STATEMENT storage.protect_delete()` que rechaza todo borrado directo por SQL **con errcode `42501`**, salvo que el GUC `storage.allow_delete_query` valga `'true'`. Por tanto `throws_ok(delete ..., '42501')` sobre `storage.objects` es un **falso verde**: pasa para cualquier rol, incluido el admin. Para probar la RLS hay que levantar el GUC y afirmar 0 filas afectadas, más una verificación posterior de que el objeto sigue existiendo.
5. **`information_schema` miente sobre los privilegios de PUBLIC.** Medido en el plan 01-08: `information_schema.routine_privileges` no lista los grants a PUBLIC, así que una función abierta a todo el mundo se ve limpia. La aserción correcta es `has_function_privilege('anon', …, 'execute')`. La misma sospecha aplica a cualquier vista de `information_schema` que se añada a un guardarraíl.
6. **`alter default privileges` no puede quitarle `EXECUTE` a PUBLIC sobre funciones futuras.** PG 17.6 refusiona `acldefault('f', owner)` y la entrada de PUBLIC reaparece en cada función nueva. Medido dos veces por dos caminos en el plan 01-07. El sustituto es el par `revoke`/`grant` explícito al lado de cada definición, y el guardarraíl 9 que lo vigila.
7. **Un comentario que cita el token prohibido rompe el grep que lo prohíbe.** Pasó dos veces: `service_role` en el plan 01-01 y `gen_random_uuid` en el 01-05. Regla: los guardarraíles por grep obligan a que los comentarios no citen literalmente el token vetado.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions | Estado |
|----------|-------------|------------|-------------------|--------|
| Policies de `storage.objects` en Supabase **hosted** (supuesto A1) | PLAT-05 | Solo verificado en local. `postgres` no es dueño de `storage.objects` ni miembro de `supabase_storage_admin`, y aun así `CREATE POLICY` pasó en local. Confianza LOW en que se comporte igual en hosted | Aplicar las migraciones contra el proyecto de dev una vez linkeado y correr `select policyname, cmd from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'evidencia_%'` — deben salir 3 filas. Y `select id, public from storage.buckets where id='evidencia'` → `public = false` | ⬜ abierto |
| `supabase config push` de la sección `[auth]` (supuesto A3) | — | Requiere proyecto linkeado. No está confirmado qué claves sincroniza | Tras `config push`, confirmar en el dashboard de dev: auto-registro por email deshabilitado, TTL del access token 1800 s, longitud mínima de contraseña 12. Más una prueba de humo con `curl -X POST <PROJECT_URL>/auth/v1/signup` | ⬜ abierto |
| Las 8 puertas de CI en un runner de GitHub Actions | — | Requiere `git push`, que es una acción con impacto real fuera del worktree | `gh run list --branch <rama> --limit 1 --json conclusion` debe dar `success` | ⬜ abierto |

Los tres están en el checkpoint humano del plan 01-09. Un resultado negativo en A1 o A3 no bloquea el cierre de la fase, pero sí se registra como blocker; lo que sí lo bloquearía es cerrarla sin saberlo.

---

## Validation Sign-Off

- [x] Todas las tareas tienen verificación automatizada o dependencia declarada de Wave 0 — **21 de 21 tareas con al menos un bloque `<automated>`**, medido recorriendo los 9 planes
- [x] Continuidad de muestreo: no hay 3 tareas consecutivas sin verificación automatizada — **racha máxima medida: 0**
- [x] Wave 0 cubre todas las referencias faltantes — los 10 ítems marcados arriba
- [x] Sin flags de watch mode — `test:unit` es `vitest run`; ningún `--watch` en `package.json`, `vitest.config.ts` ni el workflow
- [x] Latencia de feedback < 1 s en el ciclo de tarea — `0 wallclock secs (0.07 CPU)` con 47 aserciones
- [x] `nyquist_compliant: true` en el frontmatter

**Approval:** firmado por el plan 01-09 el 2026-08-31, sobre una corrida en frío de `supabase db start` con `Files=5, Tests=47, Result: PASS`, las 8 puertas de CI en verde en local, y `lib/database.types.ts` commiteado y sincronizado. Quedan abiertos los tres ítems de `Manual-Only Verifications`, que dependen de un proyecto Supabase hosted que todavía no existe.
