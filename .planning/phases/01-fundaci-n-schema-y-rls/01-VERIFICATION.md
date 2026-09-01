---
phase: 01-fundaci-n-schema-y-rls
verified: 2026-09-01T00:00:00Z
status: passed_with_gaps
score: 5/5 criterios de ROADMAP verificados con evidencia directa; 3 gaps de calidad/proceso, ninguno bloqueante para el goal de la fase
overrides_applied: 0
gaps:
  - truth: "El criterio 1 dice explícitamente 'en CI'"
    status: partial
    reason: "El workflow db.yml vive en ci/db.yml y no en .github/workflows/, así que las 8 puertas nunca se han ejecutado automáticamente en un runner. Todo lo verificado es local, comando por comando."
    artifacts:
      - path: "ci/db.yml"
        issue: "Workflow completo y correcto pero desconectado de GitHub Actions"
      - path: "ci/README.md"
        issue: "Explica la razón (falta scope 'workflow' en el token OAuth) y dejó el archivo sin trackear en git (untracked)"
    missing:
      - "Mover ci/db.yml a .github/workflows/db.yml con un token con scope 'workflow', o aceptar formalmente el riesgo residual de regresión silenciosa hasta que exista ese token"
      - "git add ci/README.md (hoy queda fuera del commit)"
  - truth: "Un aseador autenticado que consulta la API directamente no ve datos de apartamentos ajenos (fuga por embed de PostgREST)"
    status: partial
    reason: "La aserción 6 de 00_rls_aseos.test.sql corre como aseadora B, que ya tiene 0 filas en cleanings (aserción 4) y 0 en properties (aserción 5) de forma independiente. El JOIN cleanings⋈properties es, por construcción del ON, vacío pase lo que pase con la policy de properties: la aserción no añade cobertura sobre la que ya dan las aserciones 3 y 5, aunque su comentario afirma que sí cierra 'la fuga por embed'. La propiedad de seguridad SÍ está probada (por 3 y 5, no por 6), pero el test que dice probarla específicamente es tautológico."
    artifacts:
      - path: "supabase/tests/00_rls_aseos.test.sql"
        issue: "Aserción 6 (líneas 136-142) no discrimina entre 'properties filtra bien' y 'properties filtra mal': ambos casos dan 0 filas para B porque cleanings ya es 0."
    missing:
      - "Un caso positivo que ejerza el JOIN con un usuario que SÍ tenga cleanings (p.ej. aseadora A) y afirme que el join devuelve exactamente sus 2 filas, no más — eso sí ejercería la policy de properties en el contexto de un embed real"
      - "O, más simple, retitular el comentario de la aserción 6 para no reclamar cobertura que no tiene"
  - truth: "Ningún hallazgo de deferred-items.md queda como riesgo de seguridad sin decisión explícita de producto"
    status: partial
    reason: "El hallazgo 2 (anon conserva TRUNCATE y authenticated conserva DELETE/UPDATE sobre storage.objects; ni Postgres ni ningún rol disponible en local puede revocarlo desde una migración) sigue sin decisión: ni aceptado formalmente como riesgo residual ni resuelto vía dashboard. Depende del mismo checkpoint humano que Storage hosted y config push, así que no es un olvido de esta fase, pero tampoco se cerró como riesgo aceptado por escrito en un lugar canónico (threat_model o ADR)."
    artifacts:
      - path: ".planning/phases/01-fundaci-n-schema-y-rls/01-09-SUMMARY.md"
        issue: "Lo documenta como abierto (línea 184) con dueño 'Checkpoint humano / dashboard', sin que exista todavía ninguna decisión registrada de aceptar o mitigar"
    missing:
      - "Una decisión explícita (aceptar como riesgo residual documentado, o ejecutar el revoke desde el dashboard de Supabase con el rol adecuado) una vez exista el proyecto hosted"
deferred:
  - truth: "cleaning_photos.checklist_item_id no valida que pertenezca al mismo aseo que cleaning_photos.cleaning_id (hallazgo 7 de deferred-items.md)"
    addressed_in: "Fase 6"
    evidence: "01-09-SUMMARY.md línea 186: dueño Fase 6, junto con report_damage()/report_expense()/report_missing_items(), que son las únicas rutas de escritura de los otros tres punteros"
  - truth: "Objetos de Storage huérfanos sin fila en cleaning_photos escapan de storage_deletion_queue (hallazgo 8 de deferred-items.md)"
    addressed_in: "Fase 9"
    evidence: "01-09-SUMMARY.md línea 187: dueño Fase 9 (RET-06), job de reconciliación del bucket"
human_verification:
  - test: "Aplicar las 10 migraciones contra el proyecto Supabase dev (hosted) una vez creado y linkeado, y correr select policyname, cmd from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'evidencia_%' (esperar 3 filas) y select public from storage.buckets where id='evidencia' (esperar false)"
    expected: "Las 3 policies de storage.objects existen en hosted igual que en local, y el bucket es privado"
    why_human: "postgres no es owner de storage.objects ni miembro de supabase_storage_admin; en local CREATE POLICY funciona por un permiso no evidente en el grafo de roles de Supabase, y no hay garantía documentada de que se comporte igual en hosted. Es, en palabras del propio plan 01-09, 'el riesgo abierto más severo de la fase': si falla en silencio, cualquier authenticated lee y escribe evidencia de cualquier apartamento porque el grant de fábrica arwdDxtm sigue ahí."
  - test: "Tras supabase config push de [auth] contra el proyecto dev, confirmar en el dashboard: auto-registro deshabilitado, TTL del access token 1800s, longitud mínima de contraseña 12; más curl -X POST <PROJECT_URL>/auth/v1/signup de humo"
    expected: "Los tres valores de config.toml viajaron al proyecto hosted"
    why_human: "No está documentado qué claves de [auth] sincroniza config push. Un valor que no viaje deja el hardening solo en el contenedor local."
  - test: "gh run list --branch <rama> --limit 1 --json conclusion tras mover ci/db.yml a .github/workflows/db.yml y hacer push"
    expected: "conclusion: success en las 8 puertas, en un runner real de GitHub Actions"
    why_human: "Nunca se ha ejecutado en un runner. Lo verificado en local reproduce el mismo orden y la misma versión de CLI, pero no cubre los modos de fallo específicos del runner (Docker, permisos, caché de npm, versiones de las actions)."
  - test: "Decidir el hallazgo 2 de deferred-items.md (TRUNCATE de anon y DELETE/UPDATE de authenticated sobre storage.objects): aceptar como riesgo residual documentado, o ejecutar el revoke desde el dashboard de Supabase con un rol con privilegios suficientes"
    expected: "Una decisión registrada, no un hallazgo abierto sin dueño de decisión"
    why_human: "Es una decisión de producto/seguridad, no algo que una migración pueda resolver: el grantor es supabase_storage_admin y ningún rol disponible desde una migración puede revocarle nada."
---

# Phase 1: Fundación, schema y RLS — Verification Report

**Phase Goal:** La base de datos existe, impone las reglas del negocio por sí sola y ningún aseador puede ver datos ajenos.
**Verified:** 2026-09-01
**Status:** passed_with_gaps
**Re-verification:** No — verificación inicial

## Resumen ejecutivo

El goal de la fase se cumple: hay un schema completo que se reconstruye desde cero (`db reset` limpio verificado de forma independiente), la autorización vive enteramente en RLS y funciones `SECURITY DEFINER` (no en el JWT, no en el middleware), y los 5 criterios de éxito del ROADMAP tienen evidencia directa contra el código entregado, no solo contra lo que dicen los SUMMARY. Los 47 casos pgTAP y las 8 puertas de CI se re-ejecutaron en este verificador, en frío, con el mismo resultado que reporta `01-VALIDATION.md`.

Encontré 3 gaps de calidad/proceso (ninguno invalida el goal) y confirmo el checkpoint humano abierto que ya se sabía bloqueante. El más severo de los tres gaps nuevos es que el CI nunca corre solo — depende de que alguien lo ejecute a mano antes de mergear.

## Goal Achievement

### Observable Truths (criterios de éxito del ROADMAP)

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | `db reset` levanta el schema completo desde cero, pgTAP en verde con negativos de RLS, seed de 8 clusters/39 unidades cargado — **"en CI"** | ⚠️ PARCIAL | Verificado de forma independiente en este verificador: `npx supabase db reset --local` reconstruye limpio (10 migraciones, 6 seeds), `npx supabase test db --local` da `Files=5, Tests=47, Result: PASS`. `03_seed.test.sql` confirma 39 unidades, 8 clusters, 5 externas, tope de 3 tareas/tipo, ninguna unidad activa. **Pero nada de esto corre "en CI"**: `ci/db.yml` no está bajo `.github/workflows/`, así que GitHub Actions nunca lo dispara. Ver gap 1. |
| 2 | Un aseador autenticado por API directa solo obtiene sus aseos, sin instrucciones ni datos de apartamentos ajenos | ✅ VERIFICADO (con matiz) | `00_rls_aseos.test.sql` 1-9 y 14-16 re-ejecutadas en verde. Positivos como A (1-3), negativos directos como B sobre `cleanings` y `properties` (4-5), negativo sobre `access_code_reads` (16), aseadora desactivada con token vivo sin acceso (8-9), sin DML directo (14). El caso "fuga por embed" (aserción 6) está en el archivo pero es tautológico tal como está escrito — ver gap 2. La propiedad en sí (PLAT-03/PLAT-06) queda probada igual por las aserciones 3 y 5, independientes del join. |
| 3 | El código de acceso solo por RPC, solo con aseo vigente, con auditoría en `access_code_reads` | ✅ VERIFICADO | `00_rls_aseos.test.sql` 7, 10-13, 16. `property_secrets` sin ningún grant (`throws_ok 42501` incluso para el aseador asignado, aserción 10); `reveal_access_code()` responde solo dentro de la ventana hoy..mañana (11, 13 — un aseo a 5 días es visible pero no desbloqueable); la fila de auditoría queda escrita en la misma transacción (12); `access_code_reads` tiene grant pero RLS la filtra por fila (16). Código fuente en `supabase/migrations/20260831223038_09_rpc.sql:113-170` confirma el orden INSERT-antes-que-return y `set search_path = ''`. |
| 4 | Un segundo aseo activo para el mismo apartamento y fecha falla a nivel de base de datos | ✅ VERIFICADO | `01_invariantes.test.sql` 4-7: `throws_ok 23505` con `completada` contando como activo (4), `lives_ok` tras cancelar (5), la fila informativa `state IS NULL` sí participa del índice parcial vía `IS DISTINCT FROM` (6), idempotencia del pipeline iCal por `reservation_id` (7). Índice confirmado en `supabase/migrations/20260831212658_04_operacion.sql`. Más `lib/domain/errors.test.ts` (10/10) que traduce `23505` al mensaje de negocio. |
| 5 | Editar la tarifa de un apartamento no altera el margen ya congelado en un aseo generado antes | ✅ VERIFICADO | `01_invariantes.test.sql` 1-3: el trigger snapshotea al insertar (1), subir la tarifa del apartamento no reescribe el aseo ya completado (2), y un UPDATE directo sobre el aseo tampoco lo logra — el trigger reimpone el valor viejo (3). Más `02_guardarrailes.test.sql` 6: las 5 columnas monetarias son `bigint`, no `numeric`. |

**Score de criterios ROADMAP:** 5/5 con evidencia directa; 2 de ellos (1 y 2) llevan un matiz documentado como gap, no como fallo del criterio en sí.

### Alcance obligatorio sin REQ-ID (ROADMAP.md, sección "no capturado por REQ-IDs")

| Ítem | Status | Evidence |
|---|---|---|
| `legal_hold` y `deleted_at` en el schema inicial | ✅ VERIFICADO | `supabase/migrations/20260831212658_04_operacion.sql:202-266`: `cleanings.legal_hold`, `cleanings.legal_hold_reason`, `cleanings.deleted_at`, `cleaning_photos.deleted_at`, con CHECK `cl_legal_hold_reason` e índice parcial `cleanings_legal_hold_idx`. |
| Máquina de estados del aseo + log de auditoría de transiciones | ✅ VERIFICADO | `supabase/migrations/20260831215108_05_triggers_y_maquina_de_estados.sql`: trigger `BEFORE UPDATE` que rechaza transiciones fuera de la máquina (P0001) y trigger `AFTER UPDATE OF state` que inserta en `public.cleaning_state_transitions`. Probado en `01_invariantes.test.sql` 9-10 (rechazo desde estado terminal, 2 transiciones registradas para pendiente→en_curso→completada). |
| `today_bog()` y prohibición de `current_date`/`now()::date` | ✅ VERIFICADO | Helper en `supabase/migrations/20260831205735_01_extensiones_y_helpers.sql:39-53`. `current_date` solo aparece en comentarios explicativos, nunca en código ejecutable — confirmado por grep y por `scripts/ci/check-service-role.sh` puerta 4, que se re-ejecutó en verde (`check-service-role: OK`). |
| Bucket privado `evidencia` con policies | ✅ VERIFICADO | `supabase/migrations/20260831224030_10_storage.sql`: bucket `public=false`, `file_size_limit=10485760`; 3 policies (`evidencia_admin_all`, `evidencia_cleaner_insert`, `evidencia_cleaner_select`), sin policy de UPDATE/DELETE para el aseador. `04_storage.test.sql` 1-5 re-ejecutadas en verde, incluyendo el caso del trigger `protect_delete()` correctamente aislado con el GUC para no producir un falso verde. **Matiz:** solo verificado en local — ver checkpoint humano abierto (Storage hosted). |
| Catálogo provisional de cuartos y tareas, máx. 3 por tipo, editable sin migración | ✅ VERIFICADO | `supabase/migrations/20260831210111_03_catalogo.sql:246-267`: `checklist_tasks.slot` con CHECK `between 1 and 3` y `UNIQUE (room_type_id, slot)` — estructural, no convención. `03_seed.test.sql` 4 lo confirma sobre los datos reales del seed. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `supabase/migrations/*.sql` (10 archivos) | Schema completo, RLS, RPC, Storage | ✅ VERIFICADO | 3360 líneas, aplican limpio en `db reset` re-ejecutado por este verificador. |
| `supabase/tests/*.sql` (5 archivos) | 47 aserciones pgTAP | ✅ VERIFICADO | `Files=5, Tests=47, Result: PASS` reproducido de forma independiente, cero flakiness observada. |
| `supabase/seeds/*.sql` (6 archivos) | 8 clusters, 39 unidades, catálogos | ✅ VERIFICADO | Confirmado por `03_seed.test.sql` y por conteo directo. |
| `lib/database.types.ts` | Contrato tipado, 22 tablas, 6 RPC + `today_bog()` | ✅ VERIFICADO Y WIRED | `npm run db:types:check` re-ejecutado: sincronizado (diff vacío). `lib/supabase/admin.ts` lo consume vía `createClient<Database>`. |
| `lib/domain/errors.ts` | Mapeo de errores Postgres → mensajes en español (ASEO-07) | ✅ VERIFICADO | Traduce `23505`, `23514`, `23503`, `23502`, `42501`, `P0001`, `PGRST116`; nunca devuelve texto crudo de Postgres salvo `P0001` (ya redactado por el RPC). `npm run test:unit`: 10/10. |
| `lib/supabase/admin.ts` | Cliente `service_role` aislado | ✅ VERIFICADO | `import 'server-only'` presente; `scripts/ci/check-service-role.sh` (re-ejecutado: OK) confirma que la clave secreta no aparece en ningún otro archivo de `app/`, `lib/`, `components/`. |
| `ci/db.yml` + `ci/README.md` | CI de 8 puertas | ⚠️ ORPHANED (del disparador automático) | El workflow existe, es correcto y las 8 puertas se re-ejecutaron en verde en local por este verificador. No está conectado a GitHub Actions. `ci/README.md` además está sin trackear en git (`git status` lo muestra como `??`). |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `properties_cleaner_select` (policy) | `private.my_property_ids()` | `id in (select private.my_property_ids())` | ✅ WIRED | Función independiente de la policy de `cleanings` (no delega en `my_cleaning_ids()`), evita el ciclo `properties→cleanings→properties` documentado en CONTEXT.md. Confirmado leyendo `supabase/migrations/20260831221405_08_rls_policies.sql:149-163, 366`. |
| `reveal_access_code()` | `access_code_reads` | INSERT antes del `return query`, misma transacción | ✅ WIRED | Confirmado en código fuente y en aserción 12 (auditoría presente) y en la regla "no hay lectura sin rastro". |
| `cleanings` trigger de snapshot | `properties.tarifa_huesped/pago_aseador` | trigger `cleanings_snapshot` BEFORE INSERT | ✅ WIRED | `01_invariantes.test.sql` 1-3 lo ejercita en los dos sentidos (insert y UPDATE directo bloqueado). |
| RPC nuevos (`reveal_access_code`, `confirm_cleaning`, `start_cleaning`, `finish_cleaning`, `decline_cleaning`, `toggle_checklist_item`) | grants explícitos por función | `revoke all ... from public, anon` + `grant execute ... to authenticated` al lado de cada definición | ✅ WIRED, con red de seguridad | Guardarraíl 9 de `02_guardarrailes.test.sql` re-ejecutado en verde: ninguna función de `public`/`private` es ejecutable por `anon`. Es un **contrato permanente**, no un fix estructural — cada función nueva de las Fases 2-9 necesita repetirlo, documentado como tal en `01-09-SUMMARY.md`. |
| `.github/workflows/` | `ci/db.yml` | ejecución automática en PR/push | ❌ NOT WIRED | Ver gap 1. |

### Data-Flow Trace (Level 4)

No aplica en sentido estricto: esta fase no renderiza datos dinámicos en UI (fuera de alcance, según CONTEXT.md). El equivalente aquí es "¿los datos que la RLS filtra son reales, no vacíos por construcción?" — cubierto en el análisis de la aserción 6 (gap 2) y confirmado que las aserciones 3 y 5 sí prueban datos reales (39 unidades sembradas, no fixtures vacíos).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| `db reset` limpio desde cero | `npx supabase db reset --local` | 10 migraciones + 6 seeds aplicadas sin error | ✅ PASS |
| Suite pgTAP completa | `npx supabase test db --local` | `Files=5, Tests=47, Result: PASS` | ✅ PASS |
| Lint de schema | `npx supabase db lint --local` | `No schema errors found` | ✅ PASS |
| Advisors de seguridad | `npx supabase db advisors --local --type security --fail-on error` | `No issues found` | ✅ PASS |
| Drift de tipos | `npm run db:types:check` | diff vacío | ✅ PASS |
| Test de arquitectura | `bash scripts/ci/check-service-role.sh` | `check-service-role: OK` | ✅ PASS |
| Unitarios | `npm run test:unit` | `10 passed (10)` | ✅ PASS |
| Tipos TS | `npx tsc --noEmit` | sin salida, sin error | ✅ PASS |
| Build | `npm run build` | `Compiled successfully`, 5 páginas estáticas | ✅ PASS |

Las 8 puertas de CI del roadmap se re-ejecutaron una por una, de forma independiente, con el mismo resultado que reporta `01-VALIDATION.md`. Ninguna se tomó por afirmación del SUMMARY.

### Probe Execution

No hay `scripts/*/tests/probe-*.sh` en el repo; el equivalente funcional de "probe" en esta fase es la suite pgTAP + las puertas de CI, cubiertas arriba en Behavioral Spot-Checks.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| PLAT-03 | 01-02, 01-04, 01-05, 01-07, 01-09 | Un aseador solo ve los aseos asignados a él y los datos de las propiedades de esos aseos | ✅ SATISFIED | Criterio 2 arriba |
| PLAT-05 | 01-01, 01-02, 01-03, 01-04, 01-06, 01-07, 01-08, 01-09 | El código de acceso solo es visible para el aseador con aseo vigente, con auditoría | ✅ SATISFIED | Criterio 3 arriba |
| PLAT-06 | 01-02, 01-04, 01-07, 01-08, 01-09 | Las instrucciones de un aseo solo son visibles para el aseador asignado | ✅ SATISFIED | Aserción 2 y 7 de `00_rls_aseos.test.sql` |
| ASEO-07 | todos los 9 planes | Impide un segundo aseo activo por apartamento/fecha, con mensaje explícito | ✅ SATISFIED | Criterio 4 arriba + `lib/domain/errors.ts` |
| FIN-01 | 01-02, 01-03, 01-05, 01-06, 01-09 | Tarifas congeladas al generarse el aseo | ✅ SATISFIED | Criterio 5 arriba |

**Sin requisitos huérfanos.** Los 5 REQ-IDs que REQUIREMENTS.md mapea a la Fase 1 (PLAT-03, PLAT-05, PLAT-06, ASEO-07, FIN-01) aparecen todos en el campo `requirements` de al menos un plan.

**Hallazgo menor de trazabilidad (no bloqueante):** la tabla de `Traceability` de `.planning/REQUIREMENTS.md` sigue marcando los 5 como `Pending` pese a estar satisfechos. Es un documento desactualizado, no un gap de implementación.

### Anti-Patterns Found

Sin `TBD`/`FIXME`/`XXX`/`HACK` en ningún archivo entregado por la fase (migraciones, tests, seeds, `lib/`, scripts de CI). Los `[PLACEHOLDER]` del seed (39 nombres de apartamento y 6 cuartos genéricos) están explícitamente autorizados por `01-CONTEXT.md` ("sembrar con placeholders claramente marcados") y no son deuda oculta: el criterio de éxito 1 del ROADMAP se verifica por estructura, no por nombres reales, y `03_seed.test.sql` lo deja escrito.

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| `ci/db.yml` | — | Workflow correcto pero fuera de `.github/workflows/` | ⚠️ Warning | Ver gap 1 |
| `supabase/tests/00_rls_aseos.test.sql` | 136-142 | Aserción tautológica (gap 2) | ⚠️ Warning | El comentario reclama cobertura de "fuga por embed" que el test, tal como está, no ejerce |
| `ci/README.md` | — | Archivo sin trackear en git | ℹ️ Info | Trivial de corregir con `git add` |

### Human Verification Required

Ver frontmatter `human_verification`. Los tres primeros ítems son el checkpoint ya conocido y comunicado por el propio plan 01-09 (Storage hosted, `config push` de `[auth]`, CI en un runner real) — no son un hallazgo nuevo de esta verificación, los confirmo como genuinamente abiertos y no resueltos en ningún commit posterior. El cuarto es nuevo: la decisión pendiente sobre el hallazgo 2 de `deferred-items.md` (TRUNCATE/DELETE de `storage.objects`).

## Gaps Summary

Ninguno de los 3 gaps invalida el goal de la fase ("la base de datos existe, impone las reglas por sí sola, y ningún aseador ve datos ajenos"): la imposición de reglas ES real y está en Postgres, verificada de forma independiente por este verificador, no solo alegada. Los gaps son:

1. **Automatización de CI ausente.** El criterio 1 del ROADMAP dice literalmente "en CI" y hoy las 8 puertas solo corren si alguien las ejecuta a mano. La razón (falta de scope `workflow` en el token OAuth) es legítima y está documentada, pero deja la fase sin red de regresión automática hasta que se reactive. Es una decisión de proceso tomada el 2026-09-01, no registrada como override formal en este documento — recomiendo que el desarrollador la ratifique explícitamente (ver sugerencia de override abajo) o programe la reactivación antes de que la Fase 2 empiece a generar PRs sobre este schema.

2. **Aserción 6 de `00_rls_aseos.test.sql` no prueba lo que dice probar.** Corre como aseadora B, que ya tiene 0 filas en `cleanings` de forma independiente (aserción 4), así que el `JOIN cleanings⋈properties` da 0 filas por construcción del `ON`, sin importar si la policy de `properties` tiene un hueco. La propiedad de seguridad real (PLAT-03: B no ve apartamentos ajenos) SÍ está probada, pero por las aserciones 3 y 5, que hacen SELECT directo — no por la 6. Es un defecto de diseño del test heredado de la investigación (`01-RESEARCH.md §5.6`) que ni el plan 01-02 ni el 01-07 corrigieron pese a que el propio código documenta la intención de cerrar "la fuga por embed" con esa aserción específica.

3. **Decisión pendiente sobre `storage.objects` (hallazgo 2 de `deferred-items.md`).** `anon` conserva `TRUNCATE` y `authenticated` conserva `DELETE`/`UPDATE` de fábrica sobre `storage.objects`, sin que ninguna migración pueda revocarlo (el grantor es `supabase_storage_admin`, inalcanzable desde `postgres`). Está correctamente diagnosticado como bloqueado en el mismo checkpoint humano de los proyectos hosted, pero no hay todavía una decisión explícita registrada (aceptar como riesgo residual vs. resolver desde el dashboard).

**Sobre el checkpoint humano conocido:** confirmo que sigue genuinamente abierto y no es una falla de esta verificación. No existe `.env.local`, no hay `project-ref` en `supabase/.temp/`, y el propio `01-09-SUMMARY.md` lo describe como "el riesgo abierto más severo de la fase" para el caso de Storage en hosted. Lo dejo como verificación humana pendiente, no como gap de la fase.

---

**Sugerencia de override, si el desarrollador acepta el estado actual de CI como intencional:**

```yaml
overrides:
  - must_have: "supabase db reset levanta el schema completo desde cero en CI"
    reason: "CI vive en ci/db.yml fuera de .github/workflows/ por falta de scope 'workflow' en el token OAuth disponible; las 8 puertas se verifican a mano antes de cada merge hasta que se consiga un token con el scope correcto"
    accepted_by: "{nombre}"
    accepted_at: "{timestamp}"
```

---

_Verified: 2026-09-01_
_Verifier: Claude (gsd-verifier)_
