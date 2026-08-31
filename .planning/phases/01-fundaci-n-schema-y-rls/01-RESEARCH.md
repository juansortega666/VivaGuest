# Phase 1: Fundación, schema y RLS - Research

**Researched:** 2026-08-31
**Domain:** Postgres 17 sobre Supabase — RLS, RPC `SECURITY DEFINER`, Storage privado, pgTAP, migraciones y CI
**Confidence:** HIGH — la mayor parte de este documento se verificó ejecutando SQL real contra Supabase local (CLI 2.115.0, Postgres 17.6) y Postgres 17.11 en Docker, no contra memoria de entrenamiento

> **Este documento NO re-deriva el schema.** `.planning/research/ARCHITECTURE.md` ya trae el DDL, las policies, los RPC y el diseño de Storage. Aquí está la capa que ese documento no cubre: qué de todo eso es falso o incompleto contra el Supabase de hoy, y la mecánica exacta de scaffolding, pgTAP, typegen, seed, CI y organización de migraciones.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Seguridad, es lo que más pesa en esta fase**
- **RLS es la única autorización real.** El middleware y el route group no autorizan nada. Cada policy se prueba con un caso negativo explícito en pgTAP.
- **Cero claims del JWT para autorizar.** Un access token ya emitido verifica bien hasta expirar, así que si el rol viviera en el claim, un aseador desactivado seguiría entrando hasta 60 minutos. Todas las policies leen `profiles.is_active` vía función `SECURITY DEFINER STABLE` en el esquema `private`.
- **El código de acceso va en tabla aparte (`property_secrets`), no como columna de `properties`.** En Supabase admin y aseador comparten el rol Postgres `authenticated`, y los `GRANT SELECT (columna)` son por rol de base, no por usuario: ocultar una columna a un usuario y mostrarla a otro es imposible. Lo único que discrimina usuarios es RLS, que opera por fila.
- **La URL de exportación iCal de Airbnb también es una credencial** y vive en `property_secrets` con el mismo tratamiento.
- **Acceso al código por RPC con ventana y auditoría.** `reveal_access_code()` solo responde al aseador con un aseo vigente (hoy o mañana) y escribe en `access_code_reads`.
- **Grafo de policies como DAG, sin ciclos.** `properties → cleanings` vía función definer. La policy de `cleanings` es plana (`aseador_id = auth.uid()`) y no referencia `properties`.
- **El aseador no escribe directo.** `revoke insert, update, delete on cleanings from authenticated`. Sus mutaciones pasan por RPC `SECURITY DEFINER`.
- **Toda vista lleva `with (security_invoker = on)`.**
- **`service_role` aislada.** Solo `lib/supabase/admin.ts` con `import 'server-only'` la lee. Un test de arquitectura en CI (grep) debe fallar el build si alguien la importa desde una página o un Server Action.

**Invariantes que viven en la base, no en el código**
- **Un aseo activo por apartamento y fecha:** índice único parcial `where state is distinct from 'cancelada'`. `IS DISTINCT FROM` y no `<>` es load-bearing.
- **Un apartamento no se activa sin tarifa al huésped y pago al aseador.**
- **`responsable_id` y `suplente_id` solo aplican con `gestion_vivaguest = true`**; `contacto_externo` solo con `false`.
- **Gestión externa = misma tabla + discriminador `is_managed` snapshoteado + `state` anulable**, con un `CHECK` que fuerza NULL en estado, aseador, instrucciones y tarifas.
- **Máquina de estados del aseo con log de auditoría de transiciones.**

**Dinero y tiempo**
- **Snapshot financiero en el aseo, no cómputo vivo.** `tarifa_huesped` y `pago_aseador` se copian de `properties` al insertar vía trigger, editables mientras el aseo vive, congelados al pasar a `completada` o `cancelada`.
- **Montos en `bigint` de pesos enteros.** El COP no tiene subunidad, y `numeric` llega como string desde supabase-js.
- **`today_bog()` obligatorio, y prohibido `current_date` en jobs, policies e índices.**
- **`fecha_aseo` es `date`, no `timestamptz`.**

**Retención, aunque el job llegue en la Fase 9**
- **`legal_hold` y `deleted_at` se crean en esta fase.**
- **`storage_deletion_queue` también.**

**Seed**
- Los 8 clusters con las 39 unidades: 34 con `gestion_vivaguest = true`, 5 con `false` (Bogotá 2 con 2 aptos, Santa Marta 2, Santa Marta 3, Chinauta).
- **Nombres, tarifas y cuartos reales todavía no existen.** Sembrar con placeholders claramente marcados como tales.
- Catálogo provisional de tipos de cuarto con máximo 3 tareas por tipo, editable en base de datos sin migración.

**Infraestructura y proceso**
- **Todo el desarrollo en free tier** de Vercel y Supabase. El cron de 30 minutos vive en `pg_cron`.
- **Dos proyectos Supabase**, dev y prod. Las preview deployments apuntan a dev.
- **El Supabase CLI es la fuente de verdad del schema.** Migraciones versionadas en `supabase/migrations/`, aplicadas por CI, nunca a mano desde el dashboard.
- **Trabajo en worktrees.** Rama `gsd/phase-1-fundaci-n-schema-y-rls`.
- **Equipo de dos personas**, ejecución secuencial. No asumir paralelismo.

### Claude's Discretion
- Nombres exactos de columnas, orden de las migraciones y cómo se parten en archivos.
- Estructura interna de los tests pgTAP y de los helpers de test.
- Elección de herramientas de CI dentro de GitHub Actions.
- Cómo se organiza `lib/domain/` en esta fase (probablemente solo tipos y constantes, sin lógica todavía).

### Deferred Ideas (OUT OF SCOPE)
- Job de borrado por retención (`purge_expired`, `notify_retention`) → Fase 9. Aquí solo se crean las columnas y la cola.
- Cualquier página, componente o Server Action → Fase 2 en adelante.
- Worker de sincronización iCal y los `pg_cron` que lo disparan → Fase 3.
- Worker de notificaciones y `push_subscriptions` en uso → Fase 5. La tabla sí se crea aquí.
- Vistas de alertas y de finanzas → Fases 4 y 7.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Descripción | Soporte de esta investigación |
|----|-------------|-------------------------------|
| PLAT-03 | Un aseador solo puede ver los aseos asignados a él y los datos de las propiedades de esos aseos | Verificado en vivo: policy plana + `private.my_property_ids()`; test pgTAP con caso negativo corriendo en verde (§5, §11). **Requiere `grant select` explícito** — sin eso no ve nada, con eso la policy filtra (§3.1) |
| PLAT-05 | El código de acceso solo es visible para el aseador asignado a un aseo vigente, y cada consulta queda auditada | Verificado: `property_secrets` sin ningún grant a `authenticated` produce `42501` incluso para el aseador asignado; `reveal_access_code()` devuelve el código y escribe `access_code_reads` en la misma transacción (§5.4, §11) |
| PLAT-06 | Las instrucciones de un aseo solo son visibles para el aseador asignado | Cubierto por la policy de fila de `cleanings`; test verificado (§11) |
| ASEO-07 | El sistema impide crear un segundo aseo activo para el mismo apartamento y fecha, con mensaje de error explícito | Índice parcial verificado con sus tres semánticas (§3.2). **Ojo:** la base lanza `23505` genérico; el "mensaje explícito" hay que construirlo en la capa de app mapeando el nombre del índice (§3.2.4) |
| FIN-01 | Las tarifas del aseo se congelan al generarse y no cambian si después se edita la tarifa del apartamento | Trigger de snapshot verificado en vivo incluyendo el caso negativo de `UPDATE` directo sobre un aseo completado (§3.6, §11) |
</phase_requirements>

---

## Summary

Verifiqué el DDL, las policies y los RPC de `ARCHITECTURE.md` ejecutándolos contra Supabase local real. **El diseño es correcto en lo conceptual y compila casi entero**, pero tiene un hueco que lo rompería en la primera ejecución: asume que `authenticated` y `service_role` ya tienen privilegios de tabla. **No los tienen.** En el Supabase de hoy, una tabla creada en `public` por el rol `postgres` nace con exactamente tres privilegios para `anon`, `authenticated` y `service_role`: `REFERENCES`, `TRIGGER` y `TRUNCATE`. Sin `SELECT`, sin `INSERT`, sin `UPDATE`, sin `DELETE`. Consecuencia directa: el `revoke insert, update, delete on cleanings from authenticated` que propone `ARCHITECTURE.md` es un no-op sobre privilegios que nunca existieron, y lo que de verdad falta es el `grant select … to authenticated` sin el cual la policy más perfecta del mundo devuelve cero filas. Y `service_role`, pese a tener `BYPASSRLS`, no puede leer ni escribir nada hasta que se le otorgue explícitamente — lo que reventaría los workers de las Fases 3, 5 y 9 si no queda resuelto aquí.

El segundo bloque de valor es la mecánica de pruebas, que estaba sin resolver. `supabase test db` **instala pgTAP por sí solo** antes de correr `pg_prove`: no hay que meter `create extension pgtap` en ninguna migración y por tanto pgTAP nunca llega a producción. Los tests corren contra una base **que ya tiene el seed cargado**, así que los fixtures chocan con las 39 unidades si no se limpian dentro de la transacción del test. Y hay una distinción que decide si un test negativo prueba algo o no: cuando el rol **no tiene grant**, la aserción correcta es `throws_ok(…, '42501')`, no `is_empty` — `is_empty` levanta la excepción, aborta el archivo entero y pgTAP reporta "Bad plan" en vez de un fallo legible. Monté la suite completa (21 aserciones cubriendo los cinco criterios de éxito) y corre en verde en menos de un segundo.

El tercer bloque es el scaffolding, donde tres herramientas se pelean. `create-next-app` **se niega a ejecutarse** en este repo porque `.planning/` y `CLAUDE.md` cuentan como archivos en conflicto (exit 1). Y aunque no le pases `--turbopack`, genera `"dev": "next dev --turbopack"` y `"build": "next build --turbopack"` — hay que quitarlo a mano para honrar la decisión de webpack. `shadcn` 4.19.1 cambió de API y por defecto instala **`@base-ui/react`, no `radix-ui`**, además de reescribir 144 líneas de `globals.css`: recomiendo posponerlo a la Fase 2, que es cuando aparece la primera pantalla.

**Primary recommendation:** arrancar por un `00_grants.sql` que fije los privilegios base y revoque `anon` por completo, y usar `supabase db start` + `supabase test db` + `supabase db advisors --type security --fail-on error` como las tres puertas de CI. `db advisors` corre en local, detecta `rls_disabled_in_public` y `security_definer_view` como ERROR, y sale con código 1 — pero solo ve objetos que tengan grants, así que hay que complementarlo con las cuatro aserciones pgTAP de guardarraíl de §11.4.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Autorización admin vs aseador | Database (RLS + `private.*`) | — | Decisión bloqueada: cero claims del JWT. Un token vivo de un usuario desactivado no debe ver una fila |
| Invariantes de dominio (1 aseo activo, tarifas al activar, fila inerte) | Database (índices parciales + `CHECK`) | — | Verificado: la base los impone sola, sin app corriendo |
| Snapshot financiero | Database (trigger `BEFORE INSERT OR UPDATE`) | — | El congelado tiene que sobrevivir a un `UPDATE` que venga de cualquier ruta, incluido `service_role` |
| Transiciones de estado con invariantes multi-fila | Database (RPC `SECURITY DEFINER`) | — | Los column grants no expresan "solo terminas si todo el checklist tiene foto" |
| Entrega del código de acceso | Database (RPC + tabla de auditoría) | — | La ventana temporal y el rastro no caben en una policy de `SELECT` |
| Autorización de subida de evidencia | Database (policies sobre `storage.objects`) | Storage API (signed URLs) | El cliente sube directo con su JWT; la policy autoriza por `(storage.foldername(name))[1]` |
| Contrato de tipos para toda la UI | Build tooling (`supabase gen types`) | CI (drift gate) | Verificado: enums, `Functions` y args de RPC quedan tipados |
| Aislamiento de `service_role` | CI (test de arquitectura por grep) | Convención de código (`import 'server-only'`) | `server-only` falla en build al importarse desde cliente, pero no impide importarla desde otro archivo de servidor |
| Detección de fugas estructurales (RLS off, vista definer, search_path mutable) | CI (`supabase db advisors`) | pgTAP (guardarraíles) | Verificado que `advisors` no ve objetos sin grants; pgTAP tapa ese hueco |

---

## Project Constraints (from CLAUDE.md)

`./CLAUDE.md` es una proyección de `PROJECT.md` + `research/STACK.md`. Directivas accionables que restringen esta fase:

| Directiva | Impacto en Fase 1 |
|-----------|-------------------|
| `bigint` para COP, prohibido `numeric` y `float` | **El DDL de `ARCHITECTURE.md` usa `numeric(12,2)` — contradice esto. Ver §2.1** |
| `date` para `fecha_aseo`, `time` para `hora_limite`, `timestamptz` para instantes | Regla de tipos de toda migración |
| Prohibido `CURRENT_DATE` / `now()::date` a secas | `today_bog()` obligatorio; grep en CI |
| Claves `anon`/`service_role` deprecadas a fin de 2026 → usar `sb_publishable_…` / `sb_secret_…` | Verificado: el CLI local ya emite ambos pares. Nombrar las env vars con la nomenclatura nueva desde el día uno |
| `SUPABASE_SECRET_KEY` jamás con prefijo `NEXT_PUBLIC_`, solo desde archivos con `import 'server-only'` | Test de arquitectura por grep en CI (§9.3) |
| Prohibido `@supabase/auth-helpers-nextjs`, `shadcn-ui`, `date-fns-tz`, `next-pwa` | Ninguno entra en esta fase |
| `@supabase/ssr@0.12.5` con `setAll(cookiesToSet, headers)` de dos argumentos | No aplica en Fase 1 (sin UI), aplica desde Fase 2 |
| GSD Workflow Enforcement: no editar el repo fuera de un comando GSD | Proceso, no técnico |

---

## 1. Veredicto sobre `ARCHITECTURE.md` — qué verifiqué y qué está mal

Metodología: levanté Postgres 17.11 en Docker y Supabase local (CLI 2.115.0 / Postgres 17.6), transcribí el DDL, las funciones `private.*`, las policies, el trigger de snapshot, el RPC `reveal_access_code()` y las policies de `storage.objects` tal como están escritos, y los ejecuté.

| # | Afirmación de `ARCHITECTURE.md` | Veredicto | Detalle |
|---|--------------------------------|-----------|---------|
| 1 | `create unique index … where state is distinct from 'cancelada'` sobre enum | ✅ **Correcta** | Compila; `NULL` participa del índice; `cancelada` libera el slot. §3.2 |
| 2 | Funciones `SECURITY DEFINER STABLE` en esquema `private`, invocadas como `(select private.f())` | ✅ **Correcta** | Funcionan; `db advisors` NO reporta `auth_rls_initplan`, confirmando que el `(select …)` hace su trabajo. §3.3 |
| 3 | `create view … with (security_invoker = on)` | ✅ **Correcta y crítica** | Sin ella la vista devolvió las 4 filas de todos los aseadores; con ella devolvió 1. §3.4 |
| 4 | `revoke insert, update, delete on public.cleanings from authenticated` | ⚠️ **No-op inofensivo, pero oculta el problema real** | Esos privilegios nunca existieron. Lo que falta es `grant select`. §3.1 |
| 5 | RPC `SECURITY DEFINER` escribe pese al revoke | ✅ **Correcta** | Verificado: `finish_cleaning()` actualizó la fila con el rol `authenticated` sin `UPDATE`. §3.5 |
| 6 | Trigger de snapshot congela tarifas en `completada`/`cancelada` | ✅ **Correcta** | Verificado incluyendo el caso negativo (`UPDATE` directo no descongela). §3.6 |
| 7 | Policies sobre `storage.objects` desde una migración | ✅ **Funciona en local** | `postgres` no es dueño de `storage.objects` ni miembro de `supabase_storage_admin`, y aun así `CREATE POLICY` pasa. §3.7 |
| 8 | `private` no expuesto a PostgREST | ✅ **Correcta** | `config.toml` genera `schemas = ["public", "graphql_public"]`. §3.8 |
| 9 | `numeric(12,2)` para tarifas y pagos | ❌ **Contradice CONTEXT.md, PROJECT.md y CLAUDE.md** | Usar `bigint`. §2.1 |
| 10 | `auth.uid()` necesita índice en las columnas del `USING` | ✅ **Ya cubierto** | `cleanings_aseador_idx` existe. No hace falta índice adicional sobre `auth.uid()`: no es una columna |
| 11 | (implícito) `service_role` puede leer y escribir todo | ❌ **Falso** | `BYPASSRLS` no otorga privilegios de tabla. §3.1 |
| 12 | (omitido) `anon` no tiene acceso | ❌ **Incompleto** | `anon` hereda `TRUNCATE`, y `TRUNCATE` **ignora RLS**. §3.1 |

---

## 2. Conflictos entre documentos que el planner debe resolver antes de escribir tareas

### 2.1 `numeric(12,2)` vs `bigint` — gana `bigint`

`ARCHITECTURE.md` escribe `tarifa_huesped numeric(12,2)` en `properties` y en `cleanings`. `CONTEXT.md`, `PROJECT.md`, `STACK.md` §12 y `CLAUDE.md` dicen `bigint` de pesos enteros. **`bigint` gana**, y lo verifiqué de punta a punta:

- `supabase gen types typescript` mapea `bigint` a **`number`** en TypeScript. `[VERIFIED: supabase gen types --local, salida inspeccionada]`
- PostgREST serializa `bigint` como **número JSON** (`"tarifa_huesped":0`), no como string. `[VERIFIED: curl contra http://127.0.0.1:54321/rest/v1]`

Es decir, el argumento de `STACK.md` ("`numeric` llega como string y rompe la aritmética silenciosamente") se sostiene y `bigint` no introduce el problema inverso. `Number.MAX_SAFE_INTEGER` es 9.007e15 pesos; irrelevante.

**Acción para el planner:** toda columna monetaria del DDL de `ARCHITECTURE.md` (`tarifa_huesped`, `pago_aseador`, `expenses.monto`) se traduce a `bigint`, y los `CHECK` se ajustan (`monto > 0` sigue igual).

### 2.2 `pg_cron` vs Vercel Cron — gana `pg_cron`, y no toca esta fase

`STACK.md` §3 dice "Por qué Vercel Cron y no pg_cron". `PROJECT.md`, `STATE.md` y `CONTEXT.md` dicen `pg_cron`. **Gana `pg_cron`** (free tier de Vercel Hobby está capado a 1 corrida diaria). No afecta a la Fase 1: ningún job se agenda aquí. `pg_cron` y `pg_net` están disponibles en el Postgres local (`1.6.4` y `0.20.4` respectivamente) `[VERIFIED: pg_available_extensions]`, así que no hay riesgo de descubrir tarde que faltan.

### 2.3 `unique … where estado <> 'cancelado'` vs `is distinct from`

`CLAUDE.md` §11 (heredado de `STACK.md`) escribe el índice con `<>`. `CONTEXT.md` y `ARCHITECTURE.md` dicen `IS DISTINCT FROM`. **Gana `IS DISTINCT FROM`** y la diferencia es medible, no estilística (§3.2.2).

---

## 3. Verificación del SQL, con la evidencia

### 3.1 🔴 Los grants: el hallazgo que rompería la fase

Creé una tabla en `public` como rol `postgres` sobre Supabase local sin tocar nada más:

```
grantee       | privs
--------------+---------------------------------------------------------
anon          | REFERENCES,TRIGGER,TRUNCATE
authenticated | REFERENCES,TRIGGER,TRUNCATE
postgres      | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
service_role  | REFERENCES,TRIGGER,TRUNCATE
```

`[VERIFIED: information_schema.role_table_grants, Supabase CLI 2.115.0 / Postgres 17.6, 2026-08-31]`

Y las consecuencias, ejercidas una por una:

```
A) set local role service_role; select * from t_demo;
   ERROR:  permission denied for table t_demo
   HINT:   GRANT SELECT ON public.t_demo TO service_role;

B) set local role authenticated; select * from t_demo;
   ERROR:  permission denied for table t_demo

C) set local role anon; truncate t_demo;
   → anon TRUNCÓ la tabla
```

`[VERIFIED: ejecución directa contra supabase_db local]`

Tres implicaciones duras:

1. **Sin `grant select … to authenticated`, la RLS es irrelevante: el aseador no ve nada.** El error no es "0 filas", es `42501`. Un dev que no sepa esto va a desactivar RLS o va a meter `service_role` para "arreglarlo" — que es exactamente el Pitfall 6 de `PITFALLS.md`.
2. **`service_role` tiene `rolbypassrls = t` pero eso NO otorga privilegios de tabla.** Los workers de las Fases 3, 5 y 9 fallarán con `permission denied` a menos que esta fase los otorgue. Verificado que `postgres` es miembro de `anon`, `authenticated` y `service_role` — por eso los tests pgTAP pueden hacer `set role` libremente.
3. **`anon` puede hacer `TRUNCATE`, y `TRUNCATE` ignora RLS por completo.** La explotabilidad práctica es baja (PostgREST nunca emite `TRUNCATE` y `anon` es `nologin`), pero revocarlo es gratis y elimina la clase entera.

**Migración obligatoria** (verificada, corre limpia):

```sql
-- supabase/migrations/…_grants.sql  — se aplica DESPUÉS de crear las tablas
-- 1) el aseador y el admin comparten el rol 'authenticated': solo lectura,
--    la discriminación por usuario la hace RLS, fila por fila
grant select on public.profiles, public.properties, public.cleanings,
                public.property_rooms, public.room_types, public.checklist_tasks,
                public.missing_item_catalog, public.cleaning_checklist_items,
                public.cleaning_photos, public.notifications
  to authenticated;

-- property_secrets, access_code_reads, app_settings, storage_deletion_queue,
-- calendar_feeds y calendar_reservations NO reciben grant: son inaccesibles
-- por SELECT directo aunque el usuario esté autenticado.

-- 2) push_subscriptions es la única tabla que el aseador escribe directo
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- 3) los workers (Fases 3, 5, 9) corren con service_role y necesitan grants
--    explícitos pese a su BYPASSRLS
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- 4) anon no debe conservar ni TRUNCATE (bypassa RLS)
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
```

Y para que las tablas que se creen en fases futuras no reintroduzcan el agujero:

```sql
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
```

> ⚠️ El `grant all … to service_role` incluye `property_secrets`. Es intencional (los workers y el admin necesitan escribir el código de acceso), y es precisamente por qué el test de arquitectura que aísla `service_role` a `lib/supabase/admin.ts` no es opcional.

### 3.2 El índice único parcial: verificado en sus cuatro aristas

#### 3.2.1 Compila y hace exactamente lo prometido

```sql
create unique index cleanings_one_active_per_property_date
  on public.cleanings (property_id, scheduled_date)
  where state is distinct from 'cancelada';
```

| Escenario | Resultado |
|---|---|
| 2º aseo activo, mismo apto + fecha | `ERROR: duplicate key … cleanings_one_active_per_property_date` (SQLSTATE `23505`) |
| 2 filas `cancelada`, mismo apto + fecha | Conviven sin problema |
| 2 filas informativas con `state IS NULL`, mismo apto + fecha | `ERROR: duplicate key` — **`NULL` sí participa del índice** |
| Cancelar y re-crear el mismo día | Permitido (`lives_ok` en verde) |

`[VERIFIED: Postgres 17.11 y Supabase local, ejecutado 2026-08-31]`

#### 3.2.2 🟡 `IS DISTINCT FROM` en la consulta también, no solo en el índice

```
-- con IS DISTINCT FROM
Index Scan using cleanings_one_active_per_property_date on cleanings

-- con <> 'cancelada'  (enable_seqscan = off)
Seq Scan on cleanings
```

`[VERIFIED: EXPLAIN sobre Postgres 17.11]`

Lógicamente `state <> 'cancelada'` implica `state IS DISTINCT FROM 'cancelada'`, pero el probador de implicación de predicados de Postgres no maneja `DistinctExpr`, así que **una consulta escrita con `<>` no puede usar el índice parcial.** Para la unicidad da igual (la impone el índice al insertar), pero cualquier consulta de "aseos activos" que se escriba con `<>` hará seq scan. A 39 unidades no duele; como regla escrita sí importa, porque es exactamente el tipo de detalle que se convierte en deuda invisible.

**Regla para el plan:** `IS DISTINCT FROM 'cancelada'` en el índice **y** en toda consulta de aseos vivos.

#### 3.2.3 No se puede expresar como `CONSTRAINT`

```
alter table … add constraint c unique (…) where (…);
ERROR:  syntax error at or near "where"
```

`[VERIFIED]` — solo `CREATE UNIQUE INDEX` admite predicado. El nombre que aparece en el error es el del índice, no el de un constraint.

#### 3.2.4 🟡 ASEO-07 pide "mensaje de error explícito" y la base no lo da

La base lanza `23505` con el texto `duplicate key value violates unique constraint "cleanings_one_active_per_property_date"`. Eso no es un mensaje para un admin. El requisito se completa en una de dos formas, y el plan tiene que elegir:

- **(a) Mapear en la app** (recomendado): en el helper de errores, `code === '23505' && message.includes('cleanings_one_active_per_property_date')` → *"Ya existe un aseo activo para ese apartamento en esa fecha."* Barato y no cuesta una consulta.
- **(b) Envolver en el RPC de creación**: `exception when unique_violation then raise exception 'Ya existe un aseo activo…' using errcode = 'P0001'`. Más limpio para el cliente, pero solo cubre las inserciones que pasen por el RPC — el pipeline iCal de la Fase 3 inserta por otra ruta.

La opción (a) cubre las dos rutas. En plpgsql se recupera el nombre con `GET STACKED DIAGNOSTICS v := CONSTRAINT_NAME`.

### 3.3 Helpers `SECURITY DEFINER` en `private`

Verificado que funcionan tal cual están escritos. Dos detalles confirmados que no son obvios:

- **`auth.uid()` NO es `SECURITY DEFINER` ni tiene `search_path` fijo.** Su definición real hoy es:
  ```sql
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    select coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    )::uuid $$;
  ```
  `[VERIFIED: pg_get_functiondef sobre Supabase local]`
  Lee dos GUCs distintos, y ambos funcionan. Esto es lo que habilita el helper de test de §5.2.
- **`db advisors` NO reporta `auth_rls_initplan` sobre las policies escritas con `(select private.f())`**, y sí reporta `function_search_path_mutable` si a una función `SECURITY DEFINER` se le olvida el `set search_path = ''`. `[VERIFIED: caso deliberadamente malo]` — o sea, el linter valida ambas reglas por sí solo.

`private` recibe `grant usage … to authenticated`. Ojo: en Postgres, `PUBLIC` tiene `EXECUTE` por defecto sobre toda función nueva `[VERIFIED: proacl NULL sobre una función recién creada, y `anon` pudo llamar `public.today_bog()`]`. Para las funciones de `private` eso no importa porque `anon` no tiene `USAGE` sobre el esquema, pero para todo RPC de `public` el `revoke all on function … from public, anon` de `ARCHITECTURE.md` **es obligatorio, no decorativo.**

### 3.4 `security_invoker`: la fuga es real y medible

Con el aseador A autenticado (1 aseo propio de 4 en la tabla):

```
vista CON security_invoker  → 1 fila   (respeta RLS)
vista SIN security_invoker  → 4 filas  (FUGA)
```

`[VERIFIED: ejecución directa]`

Y `supabase db advisors --type security` lo cataloga como **ERROR `security_definer_view`** `[VERIFIED]`, así que es capturable automáticamente. Con la salvedad de §9.2.

### 3.5 RPC `SECURITY DEFINER` con DML revocado

`finish_cleaning()` (definer, propiedad de `postgres`) actualizó `cleanings` mientras la sesión corría como `authenticated` sin privilegio de `UPDATE`. `[VERIFIED]` El patrón funciona. Y cuando el mismo rol intenta el `UPDATE` directo:

```
ERROR:  permission denied for table cleanings   -- SQLSTATE 42501
```

**Detalle que importa para los tests:** ese error **aborta la transacción**. En pgTAP hay que envolverlo en `throws_ok()`, que usa un bloque `EXCEPTION` de plpgsql (subtransacción implícita) y por tanto no mata el archivo. §5.3.

### 3.6 Trigger de snapshot financiero (FIN-01)

Tres aserciones, las tres en verde `[VERIFIED: pgTAP]`:

1. Al insertar, el trigger copia `tarifa_huesped = 120000` desde `properties`.
2. Con el aseo ya en `completada`, `update properties set tarifa_huesped = 999000` **no** mueve el valor del aseo.
3. Un `update cleanings set tarifa_huesped = 1` directo sobre el aseo completado **tampoco** lo mueve: el trigger reimpone `old.tarifa_huesped`.

La (3) es la que convierte el requisito en un invariante de base. Sin ella, `service_role` o un admin distraído descongelan un mes cerrado.

⚠️ **Hueco del trigger tal como está escrito en `ARCHITECTURE.md`:** en la rama `UPDATE` hace `new.is_managed := old.is_managed` pero **no** protege `new.state` de retroceder desde `completada` a `en_curso`. La máquina de estados está expresada solo con `CHECK` de forma, que valida coherencia interna pero no transiciones válidas. Si el plan quiere el log de auditoría de transiciones que pide `CONTEXT.md`, ese es su lugar natural: un trigger `AFTER UPDATE OF state` que inserte en `cleaning_state_transitions` **y** un `CHECK` de transición en el trigger `BEFORE` que rechace retrocesos desde estados terminales.

### 3.7 Storage desde una migración: funciona, con una advertencia

`insert into storage.buckets (...)` y `create policy … on storage.objects` **funcionaron desde una migración aplicada por el CLI** `[VERIFIED: supabase db reset, dos policies presentes en pg_policies]`.

Advertencia honesta: `storage.objects` es propiedad de `supabase_storage_admin`, y `postgres` **no** es miembro de ese rol ni superusuario (`rolsuper = f`) `[VERIFIED: pg_auth_members]`. O sea, funciona por un permiso que Supabase concede de forma no evidente en el grafo de roles. Funciona en local hoy; en el proyecto hosted **hay que confirmarlo en el primer `supabase db push` a dev antes de dar la tarea por cerrada**. Marco esto `[ASSUMED]` para hosted.

### 3.8 `private` fuera de PostgREST

`config.toml` generado por CLI 2.115.0 trae `schemas = ["public", "graphql_public"]` `[VERIFIED]`. `private` no está y no debe agregarse. Consecuencia colateral útil: `supabase gen types --schema public` tampoco lo emite, así que las funciones definer no aparecen en `database.types.ts`.

---

## 4. Scaffolding: orden exacto, y dónde se pelean las herramientas

El repo tiene `.git/`, `.planning/` y `CLAUDE.md`. Nada más.

### 4.1 🔴 `create-next-app` se niega a correr en este repo

```
$ npx create-next-app@15.5.24 . --ts --tailwind --eslint --app --yes
The directory cna contains files that could conflict:

  .planning/
  CLAUDE.md

Either try using a new directory name, or remove the files listed above.
$ echo $?
1
```

`[VERIFIED: reproducido con create-next-app 15.5.24, 2026-08-31]`

La lista blanca de `isFolderEmpty` no incluye `.planning/` ni `CLAUDE.md`. **Receta que sí funciona** (verificada de punta a punta):

```bash
# 1) andamiar en un directorio hermano — el nombre debe ser un nombre npm válido
#    ("_stage" falla: "name cannot start with an underscore")
npx create-next-app@15.5.24 vg-stage \
  --ts --tailwind --eslint --app \
  --import-alias "@/*" --skip-install --disable-git --yes

# 2) mover todo (incluidos los dotfiles) al repo
rsync -a vg-stage/ ./ && rm -rf vg-stage
```

Alternativa igual de válida: mover `.planning` y `CLAUDE.md` a `/tmp`, correr `create-next-app .`, devolverlos. Prefiero el staging: no toca artefactos de planeación y es idempotente.

### 4.2 Lo que genera `create-next-app@15.5.24`, literal

| Archivo | Contenido relevante |
|---|---|
| `package.json` | `next 15.5.24`, `react 19.1.0`, `react-dom 19.1.0`, `typescript ^5`, `tailwindcss ^4`, `@tailwindcss/postcss ^4`, `eslint ^9`, `eslint-config-next 15.5.24`, `@eslint/eslintrc ^3` |
| `postcss.config.mjs` | `{ plugins: ["@tailwindcss/postcss"] }` |
| `app/globals.css` | `@import "tailwindcss";` + `@theme inline { … }` |
| `app/layout.tsx`, `app/page.tsx`, `app/favicon.ico` | Boilerplate |
| `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `next-env.d.ts`, `.gitignore`, `public/` | — |
| `tailwind.config.js` | **No se genera.** Tailwind v4 configura en CSS |

`[VERIFIED: scaffold real inspeccionado]`

### 4.3 🔴 Turbopack viene activado aunque no lo pidas

```json
"scripts": {
  "dev":   "next dev --turbopack",
  "build": "next build --turbopack"
}
```

`[VERIFIED: generado sin pasar --turbopack]`

No existe flag `--no-turbopack` en `create-next-app`. **Hay que editar `package.json` a mano** como tarea explícita del plan:

```json
"scripts": {
  "dev":   "next dev",
  "build": "next build",
  "start": "next start",
  "lint":  "eslint"
}
```

Esto es load-bearing: `STACK.md` fija webpack por el bug abierto serwist#360 en Turbopack + Vercel. Si nadie quita el flag en la Fase 1, el problema aparece en la Fase 5 con la PWA ya construida.

### 4.4 Ajustes de versión sobre lo generado

| Paquete | Genera | Fijar en | Motivo |
|---|---|---|---|
| `react` / `react-dom` | `19.1.0` | `19.2.x` | `STACK.md` lo especifica; `latest` hoy es `19.2.8` |
| `typescript` | `^5` | **`^5.9` explícito** | 🔴 `npm view typescript version` → **`7.0.2`**. TypeScript 7 ya es `latest`. `^5` protege, pero dejarlo ambiguo es pedir un salto de major accidental |
| `next` | `15.5.24` | `15.5.24` exacto, sin caret | `latest` es `16.3.3` |
| `tailwindcss` | `^4` | `4.3.3` | — |

`[VERIFIED: npm view, 2026-08-31]`

### 4.5 Secuencia completa de scaffolding

```bash
# ── 1. Next.js (staging + merge, ver §4.1)
npx create-next-app@15.5.24 vg-stage --ts --tailwind --eslint --app \
    --import-alias "@/*" --skip-install --disable-git --yes
rsync -a vg-stage/ ./ && rm -rf vg-stage

# ── 2. Quitar Turbopack de los scripts (§4.3) y fijar versiones (§4.4)
#    → edición manual de package.json

# ── 3. Dependencias de esta fase (nada de UI, nada de PWA todavía)
npm install next@15.5.24 react@19.2.8 react-dom@19.2.8
npm install @supabase/supabase-js@2.112.4 @supabase/ssr@0.12.5 server-only zod@4.5.4
npm install -D typescript@^5.9 tailwindcss@4.3.3 @tailwindcss/postcss@4.3.3
npm install -D supabase@2.116.0 vitest@4.1.11

# ── 4. Supabase (crea supabase/config.toml y supabase/.temp/)
npx supabase init

# ── 5. Estructura de migraciones y tests
mkdir -p supabase/migrations supabase/tests supabase/seeds lib/supabase lib/domain

# ── 6. Levantar SOLO la base (§9.1) y aplicar migraciones + seed
npx supabase db start
```

**shadcn queda FUERA de esta fase.** Justificación en §4.6.

### 4.6 🟡 `shadcn` 4.19.1 cambió de API y de librería de primitivas

`STACK.md` dice "`npx shadcn@latest init`" y "runtime real que entra: `radix-ui`". Ejecutado hoy:

```
$ npx shadcn@4.19.1 init --base-color neutral
error: unknown option '--base-color'
```

La API actual es `-b/--base <base|radix|aria>` y `-p/--preset`. Con `-d/--defaults` (que es `--template=next --preset=base-nova`), instala:

```
+ @base-ui/react        ← NO radix-ui
+ class-variance-authority
+ clsx
+ lucide-react
+ shadcn                ← como dependencia de RUNTIME
+ tailwind-merge
+ tw-animate-css
```

y además: crea `components.json` con `"style": "base-nova"`, crea `components/ui/button.tsx` y `lib/utils.ts`, modifica `app/layout.tsx` (fuentes) y **reescribe `app/globals.css` con 144 líneas de diferencia**.

`[VERIFIED: shadcn 4.19.1 ejecutado sobre un scaffold limpio de Next 15.5.24, 2026-08-31]`

Tres razones para posponerlo a la Fase 2:

1. La Fase 1 no entrega una sola pantalla. Todo lo que shadcn instala es peso muerto en el árbol de dependencias durante la fase donde más importa que el diff sea auditable.
2. La elección `base-nova`/Base UI vs `radix` es una decisión de diseño que le corresponde a la fase de UI, no debe caer por defecto.
3. Correr `init` ahora y `init --force` después vuelve a arrasar `globals.css`.

---

## 5. pgTAP y `supabase test db`: la mecánica, verificada

Este era el hueco más grande. Todo lo de abajo se ejecutó y pasa en verde: **21 aserciones en 3 archivos, `Result: PASS`, menos de 1 segundo.**

### 5.1 🟢 No hay que instalar pgTAP: el CLI lo hace

- Tras `supabase db reset`, `pg_extension` **no** contiene `pgtap` `[VERIFIED]`.
- Al correr `supabase test db`, la primera ejecución emite `NOTICE: extension "pgtap" already exists, skipping` para un `create extension` puesto dentro del test `[VERIFIED]` — es decir, el CLI ya la creó antes de lanzar `pg_prove`.
- Un archivo de test **sin** `create extension pgtap` corre perfectamente `[VERIFIED]`.

**Consecuencia:** no metas `create extension pgtap` en ninguna migración. pgTAP nunca llega a producción, porque `supabase db push` solo empuja migraciones. Esto elimina una pregunta que suele resolverse mal.

`pgtap` está en `pg_available_extensions` con `default_version = 1.3.3` `[VERIFIED]`.

### 5.2 🟢 Autenticarse como un usuario concreto: helper reutilizable

`auth.uid()` lee dos GUCs (§3.3) y ambos funcionan. La forma canónica y la que uso:

```sql
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa…","role":"authenticated"}';
```

**Se puede cambiar de usuario sin salir del rol**: basta reasignar `request.jwt.claims`. `[VERIFIED]`

Y como `set local role` no acepta variables desde plpgsql, el helper se escribe con `set_config(…, true)` — que es exactamente equivalente a `SET LOCAL`:

```sql
-- helper de test; vive en el propio archivo o en un 00_helpers.test.sql
create or replace function tests_auth(p uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p::text, 'role', 'authenticated')::text, true);
end $$;

-- volver a ser postgres para verificar el estado real de las filas
-- select set_config('role', 'postgres', true);
```

`[VERIFIED: 21 aserciones en verde usando este helper]`

Como es una función creada dentro de la transacción del test, desaparece con el `rollback`. No ensucia el schema.

> **Sobre `basejump-supabase_test_helpers`:** la doc oficial de Supabase lo recomienda vía `dbdev.install(…)`. Los prerequisitos (`pg_tle 1.4.0`, `http 1.6`) están disponibles en el Postgres local `[VERIFIED: pg_available_extensions]`, pero `supabase-dbdev` y el propio paquete **no** lo están: hay que instalarlos desde database.dev en tiempo de `db reset`. Eso mete una **descarga de red y una dependencia de terceros dentro del arranque del schema**, y en CI eso es un punto de falla y un vector de suministro. El helper de arriba son 6 líneas y hace lo mismo. **Recomendación: helper propio.** `[VERIFIED: pg_available_extensions no lista supabase-dbdev ni basejump-supabase_test_helpers]`

### 5.3 🔴 La regla que decide si un test negativo prueba algo

Hay **dos** formas de que una operación sea denegada y **exigen aserciones distintas**:

| Situación | Qué devuelve Postgres | Aserción correcta |
|---|---|---|
| El rol **no tiene grant** sobre la tabla | `ERROR 42501: permission denied for table X` | `throws_ok('…', '42501', null, '…')` |
| El rol **tiene grant**, RLS filtra las filas en `SELECT`/`UPDATE`/`DELETE` | 0 filas, sin error | `is_empty('…', '…')` |
| El rol **tiene grant**, RLS rechaza el `WITH CHECK` de un `INSERT` | `ERROR 42501: new row violates row-level security policy` | `throws_ok('…', '42501', …)` |

Usar `is_empty` en el primer caso **no falla el test: mata el archivo entero.** Lo comprobé en carne propia:

```
ERROR:  permission denied for table property_secrets
CONTEXT: PL/pgSQL function is_empty(text,text) line 9 at FOR over EXECUTE
…
Parse errors: Bad plan.  You planned 11 tests but ran 7.
```

`[VERIFIED]`

`is_empty` ejecuta un `FOR … OVER EXECUTE` sin bloque `EXCEPTION`, así que la excepción se propaga, aborta la transacción y pg_prove reporta "Dubious, test returned 3" en lugar de un `not ok` legible. `throws_ok` sí abre subtransacción y la atrapa.

**En este diseño concreto:** como el aseador no tiene ningún grant de DML sobre `cleanings` ni ningún grant sobre `property_secrets`, **todos sus casos negativos de escritura y de lectura de secretos son `throws_ok(…, '42501')`.** El `is_empty` aplica solo a las tablas donde sí hay `grant select` y la RLS filtra por fila: `cleanings`, `properties`, `profiles`.

**Y la regla de la doc oficial que sigue aplicando:** *"Matching no rows is not proof on its own. Pair every denied write with a check that the row it targeted is intact."* Un `is_empty` sobre un `UPDATE … RETURNING` puede pasar porque la policy de `SELECT` esconde la fila mientras el `UPDATE` sí ocurrió. Después de cada escritura denegada, volver a `postgres` y verificar el valor real. `[CITED: supabase.com/docs/guides/local-development/testing/pgtap-extended]`

### 5.4 🔴 Los tests corren contra la base CON el seed cargado

`supabase test db` no resetea nada: se conecta a la base tal como está, y `db reset`/`db start` ya cargaron `supabase/seeds/*.sql`. Con fixtures que reusan los UUID del seed:

```
ERROR:  duplicate key value violates unique constraint "properties_pkey"
DETAIL: Key (id)=(11111111-…) already exists.
Parse errors: Bad plan. You planned 11 tests but ran 0.
```

`[VERIFIED]`

Dos salidas; recomiendo la primera:

- **(a) Limpiar dentro de la transacción del test.** Es seguro porque el `rollback` final lo restituye todo, y hace los tests independientes del contenido del seed:
  ```sql
  begin;
  select plan(11);
  delete from public.cleanings;
  delete from public.property_secrets;
  delete from public.properties;
  delete from public.profiles;
  delete from auth.users;
  -- … fixtures propios …
  ```
  `[VERIFIED: con este prelude, 21/21 en verde]`
- **(b) Namespace de UUID disjunto** para los fixtures (`f0000000-…`). Funciona, pero es frágil: cualquiera que añada una unidad al seed puede colisionar sin darse cuenta.

### 5.5 Suite de referencia, verificada en verde

Estructura que corre (los archivos se ejecutan en orden alfabético):

```
supabase/tests/
├── 00_rls_aseos.test.sql       # PLAT-03, PLAT-05, PLAT-06  (11 aserciones)
├── 01_invariantes.test.sql     # ASEO-07, FIN-01, fila inerte (6 aserciones)
└── 02_guardarrailes.test.sql   # invariantes de schema        (4 aserciones)
```

`00_rls_aseos.test.sql`, verbatim de lo que pasó:

```sql
begin;
select plan(11);

-- limpiar el seed DENTRO de la transacción del test (rollback lo restituye)
delete from public.cleanings;
delete from public.property_secrets;
delete from public.properties;
delete from public.profiles;
delete from auth.users;

-- auth.users solo exige `id`; email es nullable
insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','a@vg.co'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','b@vg.co'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc','c@vg.co'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd','admin@vg.co');
insert into public.profiles (id, role, full_name, is_active) values
  ('aaaaaaaa-…','aseador','Aseadora A', true),
  ('bbbbbbbb-…','aseador','Aseadora B', true),
  ('cccccccc-…','aseador','Aseadora C DESACTIVADA', false),
  ('dddddddd-…','admin','Admin', true);
insert into public.properties (id, nombre, tarifa_huesped, pago_aseador)
  values ('11111111-…','Apto 101', 120000, 45000);
insert into public.property_secrets (property_id, codigo_acceso, ical_url)
  values ('11111111-…','8842','https://airbnb.com/calendar/ical/SECRETO.ics');
insert into public.cleanings (id, property_id, scheduled_date, aseador_id, instrucciones)
  values ('99999999-…','11111111-…', public.today_bog(),
          'aaaaaaaa-…','Dejar toallas extra');

create or replace function tests_auth(p uuid) returns void language plpgsql as $$
begin
  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p::text, 'role','authenticated')::text, true);
end $$;

-- ===== POSITIVO =====
select tests_auth('aaaaaaaa-…');
select is((select count(*) from public.cleanings)::int, 1,
          'PLAT-03 A ve exactamente su aseo');
select is((select instrucciones from public.cleanings), 'Dejar toallas extra',
          'PLAT-06 A ve sus instrucciones');
select is((select count(*) from public.properties)::int, 1,
          'A ve el apartamento de su aseo vigente');

-- ===== NEGATIVO: otro aseador =====
select tests_auth('bbbbbbbb-…');
select is_empty('select * from public.cleanings',
                'PLAT-03 NEG B no ve el aseo de A');
select is_empty('select * from public.properties',
                'PLAT-03 NEG B no ve apartamentos ajenos');
select throws_ok('select public.reveal_access_code(''99999999-…'')',
  '42501', null, 'PLAT-05 NEG B no puede revelar el código del aseo de A');

-- ===== NEGATIVO: aseador DESACTIVADO con token vivo =====
select tests_auth('cccccccc-…');
select is_empty('select * from public.cleanings',
  'PLAT-03 NEG aseador desactivado no ve NADA');

-- ===== NEGATIVO: secretos jamás por SELECT (sin grant → 42501, NO is_empty) =====
select tests_auth('aaaaaaaa-…');
select throws_ok('select * from public.property_secrets', '42501', null,
  'PLAT-05 NEG ni el aseador asignado lee property_secrets por SELECT');

-- ===== POSITIVO: RPC + auditoría =====
select results_eq(
  $$select codigo_acceso from public.reveal_access_code('99999999-…')$$,
  $$values ('8842'::text)$$,
  'PLAT-05 A obtiene el código por RPC');
select set_config('role','postgres', true);
select is((select count(*) from public.access_code_reads)::int, 1,
  'PLAT-05 la lectura quedó auditada en access_code_reads');

-- ===== ASEO-07 =====
select throws_ok(
  format('insert into public.cleanings (property_id, scheduled_date) values (%L, %L)',
         '11111111-…', public.today_bog()),
  '23505', null, 'ASEO-07 segundo aseo activo mismo apto/fecha falla en la base');

select * from finish();
rollback;
```

`01_invariantes.test.sql` (FIN-01 y ASEO-07), aserciones verificadas:

```sql
-- FIN-01
select is((select tarifa_huesped from public.cleanings where id='99999999-…'),
          120000::bigint, 'FIN-01 el trigger snapshotea la tarifa al insertar');
update public.cleanings set state='completada', started_at=now(), finished_at=now() …;
update public.properties set tarifa_huesped = 999000, pago_aseador = 1 …;
select is((select tarifa_huesped from public.cleanings where id='99999999-…'),
          120000::bigint, 'FIN-01 editar la tarifa del apto NO altera el aseo completado');
update public.cleanings set tarifa_huesped = 1 where id='99999999-…';
select is((select tarifa_huesped from public.cleanings where id='99999999-…'),
          120000::bigint, 'FIN-01 NEG un UPDATE directo no descongela la tarifa');

-- ASEO-07: cancelar libera el slot
update public.cleanings set state='cancelada', cancelled_at=now() …;
select lives_ok(
  $$insert into public.cleanings (property_id, scheduled_date) values ('11111111-…', public.today_bog())$$,
  'ASEO-07 cancelar libera el slot del mismo día');

-- gestión externa: fila inerte (CHECK cl_unmanaged_is_inert → 23514)
select throws_ok(
  $$insert into public.cleanings (property_id, scheduled_date, aseador_id)
    values ('22222222-…', public.today_bog(), 'aaaaaaaa-…')$$,
  '23514', null, 'gestión externa: asignar aseador viola cl_unmanaged_is_inert');
```

`[VERIFIED: los tres archivos, Result: PASS, Files=3, Tests=21]`

### 5.6 Casos negativos que la suite debe cubrir y que no están en `ARCHITECTURE.md`

- **Fuga por join / embed.** `PITFALLS.md` lo marca explícitamente. PostgREST resuelve `?select=*,properties(*)` como un join, y la policy de `properties` es la que decide. En pgTAP se prueba el equivalente: `select c.*, p.* from cleanings c join properties p on p.id = c.property_id` como aseador B → debe dar 0 filas.
- **Aseo fuera de la ventana de código.** Un aseo de dentro de 5 días es visible (`my_property_ids()`, ventana `-1…+7`) pero **no** desbloqueable (`my_unlockable_property_ids()`, ventana `hoy…mañana`). Dos aserciones distintas.
- **`today_bog()` a las 19:30 de Bogotá.** `select set_config('timezone','UTC',true)` no basta; hay que congelar el reloj. La forma barata: comparar `public.today_bog()` contra `(now() at time zone 'America/Bogota')::date` y afirmar que difiere de `current_date` cuando la hora UTC está entre 05:00 y 10:00 del día siguiente. Alternativa más honesta: un test de Vitest sobre el helper de TS con `TZ=UTC` y reloj falso, y en pgTAP solo `is(public.today_bog(), (now() at time zone 'America/Bogota')::date)`.
- **`storage.objects`.** Insertar una fila de `storage.objects` con `name = '<cleaning_id_ajeno>/checklist/x.webp'` como aseador B → debe fallar.

### 5.7 Comandos

```bash
npx supabase test new 00_rls_aseos     # crea supabase/tests/00_rls_aseos.test.sql
npx supabase test db --local           # corre todo supabase/tests/*.sql
npx supabase test db --local supabase/tests/00_rls_aseos.test.sql   # un solo archivo
```

`supabase test db` acepta rutas como argumento posicional `[<path...>]` `[VERIFIED: --help de CLI 2.115.0]`.

---

## 6. `supabase gen types typescript`: wiring y detección de drift

### 6.1 Comando y salida

```bash
npx supabase gen types typescript --local --schema public > lib/database.types.ts
```

`[VERIFIED: 343 líneas generadas, exit 0]`

Detalles confirmados:

- El **progreso va a stderr** (`Connecting to db 5432`, aviso de versión del CLI) y los tipos a stdout. El `>` sale limpio, sin ruido. `[VERIFIED]`
- Emite `Tables` (con `Row`/`Insert`/`Update`), `Views`, **`Functions`** (con `Args` y `Returns` tipados: `reveal_access_code: { Args: { p_cleaning: string }; Returns: { codigo_acceso: string }[] }`), `Enums` (`cleaning_state: "pendiente" | "en_curso" | "completada" | "cancelada"`) y `CompositeTypes`. `[VERIFIED]`
- `bigint` → `number`. `uuid`/`date`/`timestamptz`/`time` → `string`. `[VERIFIED]`
- Con `--schema public`, el esquema `private` no aparece. `[VERIFIED]`
- Funciona con **solo el contenedor de base arriba** (`supabase db start`), sin PostgREST ni Kong. `[VERIFIED]`

### 6.2 ¿Commitear el archivo? Sí

Tres razones:
1. `tsc` y el editor lo necesitan sin Docker corriendo. Un dev que abre el repo no debería tener que levantar Supabase para que TypeScript compile.
2. Vercel construye sin acceso a la base. Sin el archivo commiteado, el build falla o hay que meter un `predeploy` que se conecte a producción.
3. El diff del archivo en el PR **es** la revisión del cambio de contrato. Es la señal más barata de "esta migración rompe la UI".

Contrapartida asumida: conflictos de merge cuando dos worktrees tocan el schema. Con dos personas en ejecución secuencial, el costo es cero.

### 6.3 Puerta de CI contra el drift

```bash
npx supabase db start
npx supabase gen types typescript --local --schema public > /tmp/types.gen.ts
diff -u lib/database.types.ts /tmp/types.gen.ts \
  || { echo "::error::database.types.ts está desincronizado. Corre 'npm run db:types' y commitea."; exit 1; }
```

`[VERIFIED: exit 0 con el archivo sincronizado; exit 1 tras un `alter table … add column` que no se regeneró]`

Y el script en `package.json`:

```json
"db:types": "supabase gen types typescript --local --schema public > lib/database.types.ts"
```

> No uses `git diff --exit-code` sobre el archivo: en CI con `actions/checkout` el árbol está limpio y funciona, pero falla en local si el dev tiene otros cambios pendientes. El `diff` contra un temporal es determinista en los dos entornos.

---

## 7. Seed: `supabase/seed.sql` vs script TypeScript

**Veredicto: SQL, particionado en `supabase/seeds/*.sql`. Nada de TypeScript.**

### 7.1 Por qué SQL

| Criterio | `supabase/seeds/*.sql` | Script TS (`tsx scripts/seed.ts`) |
|---|---|---|
| Ejecución en `supabase db reset` | **Automática** `[VERIFIED]` | Requiere un paso extra y recordarlo |
| Ejecución en `supabase db start` | **Automática** `[VERIFIED]` | Idem |
| Ejecución en Supabase branching | Automática (mismo mecanismo) | No |
| Dependencias | Ninguna | Node + supabase-js + una `SECRET_KEY` en CI |
| Sobrevive a resets repetidos | Sí (la base se recrea) | Sí |
| Datos: 39 filas de placeholder + catálogo | Trivial | Sobre-ingeniería |
| Usuarios de `auth.users` con contraseña | ⚠️ Requiere hashear a mano | Fácil (`auth.admin.createUser`) |

El único caso donde TypeScript gana es crear usuarios de Auth con contraseña utilizable. **Pero esta fase no entrega login** (es Fase 2), y los tests pgTAP crean sus propios usuarios insertando directo en `auth.users` — que solo exige la columna `id`; `email` es nullable `[VERIFIED: information_schema.columns sobre auth.users]`. Así que la necesidad no existe todavía. Cuando llegue (Fase 2), se añade un `scripts/seed-users.ts` aparte, sin tocar el seed SQL.

### 7.2 Configuración verificada

En `supabase/config.toml`:

```toml
[db.seed]
enabled = true
sql_paths = ["./seeds/*.sql"]
```

`[VERIFIED: glob expandido y aplicado en orden lexicográfico]`

```
Seeding data from supabase/seeds/010_catalogo.sql...
Seeding data from supabase/seeds/020_unidades.sql...
```

### 7.3 Partición propuesta

```
supabase/seeds/
├── 010_app_settings.sql        # retention_months, sync_interval_minutes, …
├── 020_room_types.sql          # habitación, baño, cocina, sala/comedor,
│                               # zona de lavado, balcón/terraza, exterior, general
├── 030_checklist_tasks.sql     # máximo 3 por tipo (slot 1..3)
├── 040_missing_item_catalog.sql # ítems globales (property_id = NULL)
├── 050_properties.sql          # 39 unidades, 8 clusters, placeholders marcados
└── 060_property_rooms.sql      # cuartos placeholder por unidad
```

### 7.4 Reglas de escritura del seed

1. **UUID fijos y deterministas.** Nada de `gen_random_uuid()` en el seed: los tests, los fixtures y las referencias entre archivos los necesitan estables entre resets.
2. **`on conflict do nothing` / `do update`** en todo insert. `db reset` recrea la base y no lo necesita estrictamente, pero `supabase db reset --linked` y las branches de Supabase sí, y cuesta cero. `[VERIFIED: dos `db reset` seguidos → 2 propiedades, no 4]`
3. **Placeholders marcados en el propio dato**, no en un comentario: `'[PLACEHOLDER] Bogotá 1 — Apto 101'`. Así el admin los ve en la UI de la Fase 2 y sabe qué reemplazar. Verificado que sobrevive el round-trip por PostgREST.
4. **Las 5 unidades externas (`gestion_vivaguest = false`) van explícitas** — Bogotá 2 (2 aptos), Santa Marta 2, Santa Marta 3, Chinauta — porque activan la rama `cl_unmanaged_is_inert` y son el fixture natural de ese test.
5. **Ninguna unidad nace con `is_active = true`.** El `CHECK props_active_requires_rates` lo impediría con tarifas en placeholder, y `properties.is_active` ya tiene `default false`.
6. **El seed no crea usuarios ni aseos.** Aseos y aseadores son datos operativos: los crean los tests (y los borran con su `rollback`) o el admin en la Fase 2.

---

## 8. Organización de las migraciones

`supabase migration new <nombre>` genera `supabase/migrations/<YYYYMMDDHHMMSS>_<nombre>.sql` `[VERIFIED]`. Se aplican en orden lexicográfico del timestamp.

### 8.1 Partición propuesta (8 archivos)

| # | Archivo | Contenido | Por qué su propio archivo |
|---|---------|-----------|---------------------------|
| 01 | `extensions_y_helpers` | `create extension pgcrypto` (si falta), `public.today_bog()` | Todo lo demás depende de `today_bog()`. Sin pgTAP (§5.1) |
| 02 | `enums` | Los 6 `create type … as enum` | Cambiar un enum después exige `alter type … add value` fuera de transacción. Aislarlo hace el diff obvio |
| 03 | `catalogo` | `profiles` (+ trigger sobre `auth.users`), `properties` + sus 5 `CHECK`, `property_secrets`, `room_types`, `checklist_tasks`, `property_rooms`, `missing_item_catalog`, `app_settings` | Corresponde a F2 del build order de `ARCHITECTURE.md`. Tablas sin dependencias operativas |
| 04 | `operacion` | `calendar_feeds`, `calendar_reservations`, `cleanings` + los 2 índices únicos parciales + los `CHECK` de forma, `cleaning_checklist_items`, `cleaning_photos`, `damages`, `expenses`, `missing_item_reports`, `missing_item_lines`, `access_code_reads` | El bloque con el orden de FK más delicado. `ARCHITECTURE.md` ya avisa: `cleaning_photos` va después de `damages`/`expenses`/`missing_item_reports` |
| 05 | `triggers` | `tg_cleanings_snapshot()` + trigger, log de transiciones de estado, `updated_at` genérico | Los triggers de dominio son lo que más se revisa y lo que más cambia. Separarlos hace el `git blame` útil |
| 06 | `retencion_y_notificaciones` | `notifications`, `push_subscriptions`, `storage_deletion_queue`, columnas `legal_hold` y `deleted_at` | Todo lo que existe aquí pero se usa en Fases 5 y 9. Un solo lugar donde mirar cuando llegue |
| 07 | `grants` | §3.1 completo: grants a `authenticated` y `service_role`, revoke total de `anon`, `alter default privileges` | **Debe ir después de crear todas las tablas.** Es el archivo que un revisor de seguridad lee primero |
| 08 | `rls_policies_rpc` | Esquema `private`, helpers definer, `enable row level security` de todas las tablas, todas las policies, todos los RPC con su `revoke`/`grant execute` | Es el archivo de seguridad. Que sea uno solo permite leer el modelo de autorización completo de arriba abajo. Es largo y está bien que lo sea |
| 09 | `storage` | `insert into storage.buckets`, policies de `storage.objects` | Toca un esquema ajeno (`supabase_storage_admin`). Aislarlo hace trivial revertirlo si el push a hosted falla (§3.7) |

### 8.2 Reglas de partición

1. **Una migración = una unidad revisable.** El criterio no es "una tabla por archivo" (20 archivos ilegibles) ni "todo en uno" (1500 líneas irrevisables), sino "un revisor puede juzgar este archivo sin abrir otro".
2. **RLS y grants siempre después del DDL, nunca mezclados.** `PITFALLS.md` recomienda "crear la tabla, activar RLS y crear la policy, todo junto" para que no haya ventana sin RLS. En una migración eso es cierto de todos modos: **`supabase db reset` aplica todas las migraciones dentro de la misma sesión antes de que exista un solo cliente.** La ventana no existe. Y el beneficio de tener el modelo de autorización en un archivo legible es mayor. La garantía se recupera con la aserción pgTAP de §11.4 y con `db advisors`.
3. **Migraciones inmutables una vez pusheadas a dev.** Corregir = migración nueva. Editar una ya aplicada rompe el historial del CLI.
4. **Nada de `supabase db diff` como fuente de verdad.** El CLI es la fuente de verdad porque las migraciones se escriben a mano. `db diff` sirve para verificar que no quedó deriva, no para generar el schema.
5. **`supabase db lint --local` sale limpio** con este schema `[VERIFIED: "No schema errors found"]` — vale como paso barato de CI.

---

## 9. CI en GitHub Actions, free tier

### 9.1 🟢 `supabase db start`, no `supabase start`

Medido en local con imágenes ya cacheadas:

| Comando | Contenedores | Tiempo |
|---|---|---|
| `supabase start` (stack completo) | ~10 | **1m 50s** |
| `supabase db start` | **1** (solo Postgres) | **18s** |

`[VERIFIED: 2026-08-31]`

Y con solo la base arriba, funcionan **todos** los comandos que esta fase necesita:

```
supabase test db --local            → All tests successful. Files=3, Tests=21. PASS
supabase db advisors --local …      → exit 0
supabase gen types typescript …     → 343 líneas
supabase db reset --local           → aplica migraciones + seeds
```

`[VERIFIED]`

`supabase db start` además **aplica las migraciones y carga los seeds** por sí solo `[VERIFIED: "Seeding data from supabase/seeds/020_unidades.sql..."]`, así que no hace falta un `db reset` adicional.

**Descartado: contenedor `postgres:17` con pgTAP a mano.** Perdería el esquema `auth` (los fixtures insertan en `auth.users`), el esquema `storage` (las policies del bucket) y los roles `anon`/`authenticated`/`service_role` con sus default privileges — que es justamente donde está el hallazgo de §3.1. Un CI que no reproduce los default privileges de Supabase no prueba nada.

### 9.2 🟢 `supabase db advisors` como puerta de seguridad — y su punto ciego

Corre en local, sin proyecto linkeado, y tiene los flags exactos que hacen falta:

```
--type   {all, security, performance}
--level  {info, warn, error}
--fail-on {none, info, warn, error}
```

`[VERIFIED: --help de CLI 2.115.0]`

Contra un schema con objetos deliberadamente malos:

```
ERROR security_definer_view        View `public.v_sin_invoker` is defined with the SECURITY DEFINER property
ERROR rls_disabled_in_public       Table `public.tabla_sin_rls` is public, but RLS has not been enabled.
WARN  function_search_path_mutable Function `public.fn_search_path_mutable` has a role mutable search_path
```

Códigos de salida verificados:

| Comando | Schema con fallos | Schema limpio |
|---|---|---|
| `--type security --fail-on error` | **exit 1** | exit 0 |
| `--fail-on warn` | exit 1 | **exit 1** ← ver abajo |

`[VERIFIED]`

🟡 **Punto ciego que hay que conocer:** `rls_disabled_in_public` y `security_definer_view` **solo disparan si el objeto tiene grants**. Con el DDL puesto y sin la migración `07_grants`, el linter reportó **cero** problemas sobre una tabla sin RLS y una vista sin `security_invoker`. Al añadir `grant select … to authenticated`, ambos aparecieron como ERROR. `[VERIFIED: reproducido en las dos direcciones]`

O sea, `db advisors` es una puerta excelente pero **no es suficiente**: una tabla creada sin grant y sin RLS es invisible para él hasta el día en que alguien le añada el grant. Por eso las cuatro aserciones pgTAP de §11.4 no son redundantes.

🟡 **`--fail-on warn` no sirve para este diseño.** El schema limpio ya emite tres `WARN multiple_permissive_policies` sobre `cleanings`, `profiles` y `properties` — porque el patrón "una policy para admin + una policy para aseador, mismo rol, misma acción" es exactamente lo que ese lint detecta. Es un aviso de rendimiento válido pero irrelevante a 39 unidades, y consolidar las dos policies en un `OR` haría el modelo de autorización mucho menos legible. **Usar `--fail-on error`** y registrar el WARN como deuda aceptada.

### 9.3 Test de arquitectura: `service_role` fuera de `lib/supabase/admin.ts`

```bash
# falla si la clave secreta se referencia desde cualquier archivo que no sea admin.ts
HITS=$(grep -rn --include='*.ts' --include='*.tsx' \
  -E 'SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|sb_secret_' \
  app lib components 2>/dev/null | grep -v '^lib/supabase/admin\.ts:' || true)
if [ -n "$HITS" ]; then
  echo "::error::service_role fuera de lib/supabase/admin.ts:"; echo "$HITS"; exit 1
fi

# falla si alguna clave de servicio lleva prefijo NEXT_PUBLIC_
grep -rn --include='*.ts' --include='*.tsx' -E 'NEXT_PUBLIC_[A-Z_]*(SECRET|SERVICE)' app lib \
  && { echo "::error::clave de servicio con prefijo NEXT_PUBLIC_"; exit 1; } || true

# admin.ts debe declarar server-only
grep -q "import 'server-only'" lib/supabase/admin.ts \
  || { echo "::error::lib/supabase/admin.ts sin import 'server-only'"; exit 1; }

# prohibido current_date en migraciones y seeds
grep -rniE '\bcurrent_date\b|\bnow\(\)::date\b' supabase/migrations supabase/seeds \
  && { echo "::error::usa public.today_bog(), no current_date"; exit 1; } || true
```

`[VERIFIED: el grep detecta correctamente `process.env.SUPABASE_SECRET_KEY` en `app/page.tsx` y sale limpio cuando solo está en `admin.ts`]`

`import 'server-only'` es necesario pero no suficiente: falla el build al importarse desde un Client Component, pero **no impide** importar `admin.ts` desde un Server Component o una Server Action. El grep es lo que cubre ese caso.

### 9.4 Workflow completo

```yaml
name: db
on:
  pull_request:
  push: { branches: [main] }

jobs:
  database:
    runs-on: ubuntu-latest        # Docker viene preinstalado; macOS/Windows no
    steps:
      - uses: actions/checkout@v5

      - uses: supabase/setup-cli@v3
        with:
          version: 2.116.0        # pinear; sin esto lee la versión del lockfile o usa latest

      # arranca SOLO Postgres: aplica migrations + seeds (§9.1)
      - run: supabase db start

      # 1) puerta de tipado del schema
      - run: supabase db lint --local

      # 2) puerta de seguridad — solo ERROR (§9.2)
      - run: supabase db advisors --local --type security --fail-on error

      # 3) puerta de comportamiento: RLS, invariantes, guardarraíles
      - run: supabase test db --local

      # 4) puerta de contrato: database.types.ts sincronizado (§6.3)
      - name: typegen drift
        run: |
          supabase gen types typescript --local --schema public > /tmp/types.gen.ts
          diff -u lib/database.types.ts /tmp/types.gen.ts || {
            echo "::error::database.types.ts desincronizado. Corre 'npm run db:types'."; exit 1; }

  arquitectura:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: bash scripts/ci/check-service-role.sh   # §9.3
      - run: npx tsc --noEmit
      - run: npm run build                            # verifica que no hay --turbopack
```

Notas verificadas y advertencias:

- `supabase/setup-cli@v3` es la referencia actual del repo. **La documentación de CI de Supabase todavía dice `@v1`** — está desactualizada. `[VERIFIED: README de supabase/setup-cli vs docs/guides/deployment/ci/testing]`
- El único input de la action es `version`. `[CITED: github.com/supabase/setup-cli README]`
- **Free tier:** repos públicos = minutos ilimitados. Repos privados = 2000 min/mes en la cuenta Free. Estos dos jobs cuestan del orden de 3–5 min por corrida con caché tibia. `[ASSUMED — no verificado contra la página de facturación de GitHub en esta sesión]`
- Los dos jobs corren en paralelo. No hace falta secuenciarlos.

---

## 10. Configuración de `supabase/config.toml` que esta fase debe cambiar

El `config.toml` generado por defecto contradice el modelo de seguridad bloqueado en `CONTEXT.md`:

| Clave | Default generado | Debe quedar en | Motivo |
|---|---|---|---|
| `[auth] enable_signup` | `true` | **`false`** | 🔴 `PROJECT.md`: "no hay auto-registro; el admin crea el usuario". Con el default, cualquiera con la publishable key crea una cuenta |
| `[auth.email] enable_signup` | `true` | **`false`** | Idem |
| `[auth] jwt_expiry` | `3600` | **`1800`** | `ARCHITECTURE.md`: bajar el TTL acorta la ventana en que un token de un usuario desactivado sigue verificando |
| `[auth] minimum_password_length` | `6` | **`12`** | 6 es indefendible para cuentas que abren apartamentos |
| `[api] schemas` | `["public","graphql_public"]` | **sin cambio** | `private` debe quedar fuera. Confirmar que nadie lo agregue |
| `[db] major_version` | `17` | sin cambio | Coincide con el Postgres 17 hosted |
| `[db.seed] sql_paths` | `["./seed.sql"]` | **`["./seeds/*.sql"]`** | §7.2 |

`[VERIFIED: config.toml generado por supabase init con CLI 2.115.0, líneas 13, 66-71, 155-226]`

⚠️ `config.toml` es local-first. Los ajustes de `[auth]` **también hay que aplicarlos en el dashboard de los proyectos dev y prod**, o solo protegen el entorno local. `supabase config push` los sincroniza para las claves soportadas; verificar cuáles en el primer link.

---

## Standard Stack

Solo el delta de esta fase. `STACK.md` es la referencia completa.

### Core

| Librería | Versión | Propósito | Por qué |
|---|---|---|---|
| `next` | `15.5.24` (exacto) | Framework | `latest` es `16.3.3`; la línea 15 permite build webpack `[VERIFIED: npm view next dist-tags]` |
| `react` / `react-dom` | `19.2.8` | Runtime | `create-next-app` genera `19.1.0`; hay que subirlo `[VERIFIED]` |
| `typescript` | `^5.9` (explícito) | Tipos | 🔴 `latest` es `7.0.2`. Dejar `^5` funciona pero es ambiguo `[VERIFIED: npm view typescript version]` |
| `@supabase/supabase-js` | `2.112.4` | Cliente | `[VERIFIED: npm view]` |
| `@supabase/ssr` | `0.12.5` | Clientes SSR | No se usa en Fase 1; se instala para que Fase 2 no cambie el lockfile `[VERIFIED: npm view]` |
| `supabase` (CLI, devDep) | `2.116.0` | Migraciones, tipos, tests | `[VERIFIED: npm view supabase version]` |
| `server-only` | `0.0.1` | Marcador de frontera servidor | Sin repo enlazado en npm, pero es un paquete first-party de Vercel usado por el propio Next.js |
| `zod` | `4.5.4` | Validación de env vars | En esta fase solo para `lib/env.ts` `[VERIFIED: npm view]` |
| `tailwindcss` + `@tailwindcss/postcss` | `4.3.3` | Estilos | Lo instala `create-next-app` como `^4` `[VERIFIED]` |
| PostgreSQL | **17.6** (Supabase local) | Base | `[VERIFIED: select version()]` |
| pgTAP | 1.3.3 | Tests de base | Lo instala el CLI, no va en migración `[VERIFIED]` |

### De apoyo

| Librería | Versión | Propósito | Cuándo |
|---|---|---|---|
| `vitest` | `4.1.11` | Unit tests | Solo `today_bog()`/helpers de fecha en TS y el parseo de env. El grueso llega en Fase 3 |

### Alternativas consideradas

| En vez de | Se podría usar | Tradeoff |
|---|---|---|
| Helper `tests_auth()` propio | `basejump-supabase_test_helpers` vía `dbdev` | Más funciones listas, pero mete descarga de red y dependencia de terceros dentro de `db reset`. Ni el paquete ni `supabase-dbdev` están disponibles localmente `[VERIFIED: pg_available_extensions]` |
| `supabase db start` en CI | Contenedor `postgres:17` + pgtap manual | Pierde `auth`, `storage` y los default privileges de Supabase — o sea, pierde justo lo que hay que probar |
| `supabase/seeds/*.sql` | Script TS con `auth.admin.createUser` | Solo gana en crear usuarios con contraseña, que esta fase no necesita (§7.1) |
| Mapear `23505` en la app | RPC que envuelve la inserción | El RPC no cubre la ruta del pipeline iCal de Fase 3 (§3.2.4) |
| shadcn en Fase 1 | Posponerlo a Fase 2 | Reescribe `globals.css` y elige Base UI por defecto en una fase sin UI (§4.6) |

### Instalación

Ver §4.5. `npm install`, no `npx --yes` sobre paquetes no verificados.

---

## Package Legitimacy Audit

Ejecutado con `slopcheck` 2026-08-31, **forzando el ecosistema npm**. Nota metodológica: la primera corrida sin `-e npm` auto-detectó **PyPI** y reportó 5 `[SLOP]` — falsos positivos por confusión de ecosistema, exactamente el vector que el protocolo advierte. Los resultados válidos son los de npm.

| Paquete | Registry | Creado | Repo fuente | postinstall | slopcheck | Disposición |
|---|---|---|---|---|---|---|
| `next` | npm | 2011-07-11 | github.com/vercel/next.js | no | `[OK]` | Aprobado |
| `react` | npm | 2011-10-26 | github.com/react/react | no | `[OK]` | Aprobado |
| `react-dom` | npm | 2014-05-06 | github.com/react/react | no | `[OK]` | Aprobado |
| `typescript` | npm | 2012-10-01 | github.com/microsoft/TypeScript | no | `[OK]` | Aprobado |
| `tailwindcss` | npm | 2017-10-06 | github.com/tailwindlabs/tailwindcss | no | `[OK]` | Aprobado |
| `@tailwindcss/postcss` | npm | 2024-02-02 | github.com/tailwindlabs/tailwindcss | no | `[OK]` | Aprobado |
| `@supabase/supabase-js` | npm | 2020-01-17 | github.com/supabase/supabase-js | no | `[OK]` | Aprobado |
| `@supabase/ssr` | npm | 2023-09-06 | github.com/supabase/ssr | no | `[OK]` | Aprobado |
| `supabase` (CLI) | npm | 2020-11-19 | github.com/supabase/cli | no | `[OK]` | Aprobado |
| `zod` | npm | 2020-03-07 | github.com/colinhacks/zod | no | `[OK]` | Aprobado |
| `server-only` | npm | 2022-09-03 | **ninguno** | no | `[OK]` con nota | Aprobado — ver abajo |
| `vitest` | npm | 2021-12-03 | github.com/vitest-dev/vitest | no | `[SUS]` | Aprobado — falso positivo, ver abajo |

`[VERIFIED: slopcheck install -e npm, y npm view <pkg> {version,time.created,repository.url,scripts.postinstall} el 2026-08-31]`

**Paquetes retirados por veredicto `[SLOP]`:** ninguno.

**Paquetes marcados `[SUS]` y su resolución:**
- **`vitest`** — flagged como *"suspiciously close to 'vite'. Could be a typosquat."* **Falso positivo por similitud de nombre.** `vitest` es el runner oficial del ecosistema Vite (vitest.dev), repo `vitest-dev/vitest`, creado 2021-12-03, sin `postinstall`. Es el que `STACK.md` ya había verificado. **Se mantiene sin checkpoint.**
- **`server-only`** — `[OK]` pero con la nota *"No source repository linked"*. Es cierto: el paquete no declara `repository` en su `package.json`. Es un paquete first-party de Vercel (0.0.1, publicado 2022-09-03) del que depende el propio Next.js para su mecanismo de fronteras servidor/cliente, y su contenido es literalmente un `throw` en el entry de cliente. **Se mantiene.** Si el planner prefiere no depender de él, la alternativa es `import 'server-only'` sustituido por una convención de nombre de archivo (`*.server.ts`) más el grep de §9.3 — pero el grep ya es la defensa real.

**Ninguno de los 12 paquetes declara `scripts.postinstall`.** `[VERIFIED]`

---

## Architecture Patterns

### Diagrama del sistema de esta fase

```
   ┌─────────────────────────────────────────────────────────────────────┐
   │  DESARROLLO (worktree)                                              │
   │                                                                     │
   │  supabase/migrations/*.sql ──┐                                      │
   │  supabase/seeds/*.sql ───────┤                                      │
   │  supabase/tests/*.sql ───────┤                                      │
   └──────────────────────────────┼──────────────────────────────────────┘
                                  │  supabase db start
                                  ▼
   ┌─────────────────────────────────────────────────────────────────────┐
   │  POSTGRES 17 LOCAL (contenedor único)                               │
   │                                                                     │
   │   1. aplica migraciones en orden de timestamp                       │
   │   2. carga seeds/*.sql en orden lexicográfico                       │
   │                                                                     │
   │   ┌──────────────┐   grant select    ┌────────────────────────┐    │
   │   │ authenticated├──────────────────►│  public.* (RLS ON)     │    │
   │   │ (admin y     │                   │                        │    │
   │   │  aseador)    │   sin grant       │  property_secrets ─────┼──✗ │
   │   └──────┬───────┘  ─────────────►✗  │  access_code_reads     │    │
   │          │                           │  calendar_*            │    │
   │          │ execute                   └───────────┬────────────┘    │
   │          ▼                                       │ policies leen   │
   │   ┌──────────────────────┐   security definer    │                 │
   │   │ public.reveal_access │──────────────────────►│                 │
   │   │ public.finish_clean… │   (salta RLS)         │                 │
   │   └──────────┬───────────┘                       │                 │
   │              │ consulta                          │                 │
   │              ▼                          ┌────────┴─────────┐       │
   │   ┌──────────────────────┐              │  private.*       │       │
   │   │ auth.uid()           │◄─────────────┤  is_admin()      │       │
   │   │ (lee request.jwt.*)  │              │  my_*_ids()      │       │
   │   └──────────────────────┘              │  (definer,       │       │
   │                                          │   fuera de      │       │
   │   ┌──────────────────────┐              │   PostgREST)    │       │
   │   │ storage.objects      │              └──────────────────┘       │
   │   │ bucket 'evidencia'   │                                          │
   │   │ (privado, policies)  │                                          │
   │   └──────────────────────┘                                          │
   └──────────┬────────────────────┬──────────────────┬─────────────────┘
              │                    │                  │
     supabase test db     db advisors          gen types typescript
     (pgTAP, roles         --type security      --schema public
      reales, casos        --fail-on error            │
      negativos)                  │                   ▼
              │                   │          lib/database.types.ts
              ▼                   ▼                   │  (commiteado)
   ┌─────────────────────────────────────────────────┴─────────────────┐
   │  GITHUB ACTIONS — 4 puertas: lint · advisors · pgTAP · drift      │
   │  + job de arquitectura: grep service_role · tsc · build           │
   └───────────────────────────────────────────────────────────────────┘
```

### Estructura de proyecto recomendada

```
├── .github/workflows/db.yml
├── app/                          # solo el boilerplate de create-next-app
├── lib/
│   ├── database.types.ts         # generado y COMMITEADO (§6.2)
│   ├── env.ts                    # zod sobre process.env
│   ├── domain/
│   │   ├── constants.ts          # TZ = 'America/Bogota', estados, tipos de aseo
│   │   └── errors.ts             # mapeo 23505 + nombre de índice → mensaje (§3.2.4)
│   └── supabase/
│       └── admin.ts              # ÚNICO archivo con la SECRET_KEY, con 'server-only'
├── scripts/ci/check-service-role.sh
└── supabase/
    ├── config.toml               # con los cambios de §10
    ├── migrations/               # 9 archivos, §8.1
    ├── seeds/                    # 6 archivos, §7.3
    └── tests/                    # 3+ archivos, §5.5
```

`lib/supabase/client.ts` y `server.ts` **no** se crean aquí: dependen de la trampa de `setAll` de dos argumentos y de decisiones de la Fase 2.

### Patrón 1: policy sin recursión, con `(select …)` en dos lugares

```sql
create policy cleanings_cleaner_select on public.cleanings
  for select to authenticated
  using ((select private.is_active_cleaner()) and aseador_id = (select auth.uid()));
```

Los dos `(select …)` no son cosmética: convierten la llamada en `InitPlan`, evaluado una vez por sentencia en lugar de una vez por fila. Verificado indirectamente: `db advisors` **no** reporta `auth_rls_initplan` sobre las policies escritas así.

### Patrón 2: `throws_ok` para todo lo que no tiene grant

```sql
select throws_ok('select * from public.property_secrets', '42501', null, '…');
```

Ver §5.3. Es la diferencia entre un test que prueba y un archivo que muere.

### Patrón 3: el RPC valida, audita y devuelve, en una transacción

```sql
select c.property_id into v_prop from public.cleanings c
 where c.id = p_cleaning
   and c.aseador_id = (select auth.uid())
   and c.scheduled_date between public.today_bog() and public.today_bog() + 1;
if v_prop is null then raise exception 'no_autorizado' using errcode = '42501'; end if;
insert into public.access_code_reads (…) values (…);      -- auditoría
return query select s.codigo_acceso from public.property_secrets s where …;
```

Que la auditoría vaya **antes** del `return query` y en la misma función garantiza que no hay lectura sin rastro.

### Anti-patrones

- **Crear una tabla y confiar en que `authenticated` la lee.** No la lee. §3.1.
- **`revoke insert, update, delete … from authenticated` como medida de seguridad.** Es un no-op; lo que protege es no haber otorgado nada. §3.1.
- **`is_empty` sobre una tabla sin grant.** Mata el archivo de test. §5.3.
- **`create extension pgtap` en una migración.** Innecesario y contamina producción. §5.1.
- **Consultar aseos activos con `state <> 'cancelada'`.** No usa el índice parcial. §3.2.2.
- **Fixtures de test que reusan los UUID del seed.** Colisión de PK. §5.4.
- **`--fail-on warn` en `db advisors`.** Falla siempre con este diseño de policies. §9.2.
- **`create-next-app .` en este repo.** Exit 1. §4.1.
- **Dejar `--turbopack` en los scripts.** §4.3.

---

## Don't Hand-Roll

| Problema | No construyas | Usa | Por qué |
|---|---|---|---|
| Detectar tablas sin RLS, vistas definer, `search_path` mutable | Un script propio de introspección | `supabase db advisors --local --type security --fail-on error` | Ya está escrito, corre local, tiene códigos de salida. Complementar con §11.4 por su punto ciego |
| Instalar/gestionar pgTAP | Migración con `create extension pgtap` | `supabase test db` lo hace solo | §5.1 |
| Correr pgTAP | `pg_prove` invocado a mano, o psql + parseo de TAP | `supabase test db --local [paths]` | Trae el contenedor `pg_prove:3.36` y la conexión ya resuelta |
| Tipos TypeScript del schema | Interfaces escritas a mano | `supabase gen types typescript` | Incluye enums, args y returns de RPC. Escribirlo a mano garantiza deriva |
| Errores de tipos en plpgsql | Revisión visual | `supabase db lint --local` | Corre `plpgsql_check` sobre `public` y `private` |
| Cargar el seed | Script npm que abre una conexión | `[db.seed] sql_paths = ["./seeds/*.sql"]` | Se ejecuta solo en `db start`, `db reset` y branches |
| Helper "hoy en Bogotá" | `current_date`, `now()::date`, `new Date()` | `public.today_bog()` + una sola constante `TZ` en TS | Es el Pitfall 11 completo |
| Aritmética de dinero COP | `numeric`, `float`, `dinero.js` | `bigint` de pesos enteros | PostgREST lo serializa como número JSON, no como string. §2.1 |
| Autenticar como usuario en un test | Firmar un JWT real y pasarlo por PostgREST | `set local role` + `set local request.jwt.claims` | Prueba las policies dentro de Postgres, sin la capa HTTP |
| Límite de 3 tareas por tipo de cuarto | Trigger que cuenta filas | `CHECK(slot between 1 and 3)` + `UNIQUE(room_type_id, slot)` | Estructural, sin conteo |

**La idea de fondo:** el Supabase CLI ya trae linter, runner de tests, generador de tipos y motor de seed. En esta fase, casi todo lo "de infraestructura" que uno querría escribir ya existe y está probado. El código propio debe concentrarse en lo que es específico del dominio: los `CHECK`, los índices parciales, los triggers y los RPC.

---

## Common Pitfalls

### Pitfall 1: RLS perfecta que devuelve `42501` porque falta el `grant`
**Qué sale mal:** todas las policies escritas, todas correctas, y el aseador no ve una fila. Peor: el error es `permission denied`, no "0 filas", así que parece un bug de RLS.
**Por qué pasa:** las tablas nuevas en `public` nacen sin `SELECT` para `authenticated` (§3.1).
**Cómo evitarlo:** migración `07_grants` explícita, y un test pgTAP positivo (no solo negativos) por cada tabla que el aseador debe leer.
**Señal temprana:** cualquier commit que "arregle" un problema de visibilidad desactivando RLS o metiendo `service_role`.

### Pitfall 2: `service_role` sin privilegios rompe los workers de fases futuras
**Qué sale mal:** el worker de iCal de la Fase 3 falla con `permission denied for table calendar_feeds` y nadie entiende por qué, si "service_role bypassa RLS".
**Por qué pasa:** `BYPASSRLS` no otorga privilegios de tabla (§3.1).
**Cómo evitarlo:** `grant all on all tables in schema public to service_role` en la Fase 1, más un test pgTAP que haga `set local role service_role` y lea cada tabla.

### Pitfall 3: `is_empty` en vez de `throws_ok` convierte la suite en un falso verde
**Qué sale mal:** el archivo aborta, pg_prove reporta "Dubious / Bad plan", y si alguien lee solo `Files=3` puede creer que corrió.
**Por qué pasa:** `is_empty` no atrapa excepciones (§5.3).
**Cómo evitarlo:** regla escrita — sin grant → `throws_ok('42501')`; con grant y RLS filtrando → `is_empty`.
**Señal temprana:** `Parse errors: Bad plan. You planned N tests but ran M`.

### Pitfall 4: fixtures de test que chocan con el seed
**Qué sale mal:** `duplicate key value violates unique constraint "properties_pkey"`, y el archivo entero corre 0 tests.
**Por qué pasa:** `supabase test db` no resetea; la base ya trae las 39 unidades (§5.4).
**Cómo evitarlo:** `delete from` de las tablas relevantes al abrir la transacción del test.

### Pitfall 5: `db advisors` en verde sobre un schema con fugas
**Qué sale mal:** una tabla sin RLS o una vista sin `security_invoker` pasa el linter porque todavía no tiene grants; el día que alguien le añada el grant, la fuga existe y CI ya había dicho que sí.
**Por qué pasa:** los lints `rls_disabled_in_public` y `security_definer_view` solo miran objetos expuestos (§9.2).
**Cómo evitarlo:** las cuatro aserciones pgTAP de §11.4 son obligatorias, no opcionales.

### Pitfall 6: `create-next-app` bloqueado y Turbopack colado
**Qué sale mal:** la primera tarea del plan falla con exit 1; y si alguien la resuelve moviendo archivos, el `package.json` queda con `--turbopack` y la Fase 5 choca contra serwist#360.
**Cómo evitarlo:** §4.1 y §4.3, como dos tareas separadas y verificables.

### Pitfall 7: `ASEO-07` marcado como cumplido con el error crudo de Postgres
**Qué sale mal:** el requisito pide "mensaje de error explícito"; la base da `duplicate key value violates unique constraint "cleanings_one_active_per_property_date"`. Es correcto pero no es el requisito.
**Cómo evitarlo:** §3.2.4 — el mapeo de `23505` + nombre de índice va en `lib/domain/errors.ts` en esta fase, aunque no haya UI que lo muestre todavía, con su test unitario. Si no, se olvida.

### Pitfall 8: `enable_signup = true` por defecto
**Qué sale mal:** el modelo entero asume que solo el admin crea usuarios. El `config.toml` por defecto permite auto-registro (§10).
**Cómo evitarlo:** cambiarlo en `config.toml` **y** en el dashboard de dev y prod. Verificarlo con un `curl` al endpoint de signup.

### Pitfall 9: `numeric` heredado del DDL de `ARCHITECTURE.md`
**Qué sale mal:** si alguien copia el DDL literal, las tarifas quedan en `numeric(12,2)`, supabase-js las devuelve como string, y la aritmética de la Fase 7 se rompe en silencio.
**Cómo evitarlo:** §2.1, y una aserción pgTAP sobre `information_schema.columns` que afirme `data_type = 'bigint'` en toda columna monetaria.

### Pitfall 10: TypeScript 7 entrando por un caret suelto
**Qué sale mal:** `npm install -D typescript` hoy instala `7.0.2`.
**Cómo evitarlo:** `typescript@^5.9` explícito en `package.json` (§4.4).

---

## Runtime State Inventory

No aplica: fase greenfield sobre un repositorio vacío. No hay estado en ejecución, ni datos almacenados, ni servicios registrados, ni artefactos construidos que renombrar o migrar.

---

## Validation Architecture

### Framework de pruebas

| Propiedad | Valor |
|---|---|
| Framework de base de datos | **pgTAP 1.3.3** vía `supabase test db` (contenedor `pg_prove:3.36`) |
| Framework de unidad (TS) | **vitest 4.1.11** — solo helpers de fecha y mapeo de errores en esta fase |
| Archivo de config | `supabase/config.toml` (`[db.seed]`, `[db] major_version = 17`) — pgTAP no requiere config |
| Comando rápido (por commit) | `npx supabase test db --local` — **< 1 s medido con 21 aserciones** |
| Suite completa (por wave / gate) | `npx supabase db start && npx supabase db lint --local && npx supabase db advisors --local --type security --fail-on error && npx supabase test db --local && npm run db:types:check` |

`[VERIFIED: 21 aserciones, Files=3, "0 wallclock secs", Result: PASS]`

### Los 5 criterios de éxito de la fase → verificación mecánica

| # | Criterio de éxito (ROADMAP.md) | Herramienta | Aserción concreta | Estado |
|---|---|---|---|---|
| **1** | `supabase db reset` levanta el schema desde cero en CI, pgTAP pasa en verde incluyendo casos negativos, y el seed de 8 clusters / 39 unidades queda cargado | Supabase CLI + pgTAP | (a) `supabase db start` en el runner sale 0 con todas las migraciones aplicadas. (b) `supabase test db --local` → `Result: PASS`, cero `Bad plan`. (c) Aserción `is((select count(*) from public.properties)::int, 39, 'seed: 39 unidades')` y `is((select count(distinct cluster) from public.properties)::int, 8, 'seed: 8 clusters')` y `is((select count(*) from public.properties where not gestion_vivaguest)::int, 5, 'seed: 5 externas')` — **fuera** del bloque `delete` de limpieza, en un archivo `03_seed.test.sql` propio | ✅ mecánica verificada |
| **2** | Un aseador autenticado que consulta la API directamente solo obtiene sus aseos, y no ve instrucciones ni datos de apartamentos ajenos | pgTAP con roles reales | Positivos: `is(count(*) from cleanings, 1)`, `is(instrucciones, 'Dejar toallas extra')`, `is(count(*) from properties, 1)` como aseador A. Negativos: `is_empty('select * from public.cleanings')` y `is_empty('select * from public.properties')` como aseador B; `is_empty('select * from public.cleanings')` como aseador C **desactivado con token vivo**. Extra obligatorio: `is_empty` sobre el join `cleanings ⋈ properties` como B (fuga por embed) | ✅ 5 de 6 verificadas en verde; falta escribir la del join |
| **3** | El código de acceso solo se obtiene vía RPC, solo para el aseador con un aseo vigente, y cada consulta queda registrada en `access_code_reads` | pgTAP | (a) `throws_ok('select * from public.property_secrets', '42501')` como aseador A **asignado** — ni él lo lee por SELECT. (b) `results_eq('select codigo_acceso from public.reveal_access_code(<aseo_de_A>)', values ('8842'))` como A. (c) `throws_ok('select public.reveal_access_code(<aseo_de_A>)', '42501')` como B. (d) tras volver a `postgres`: `is(count(*) from access_code_reads, 1)`. (e) `throws_ok(…, '42501')` para un aseo a 5 días (fuera de ventana) aunque el apartamento sí sea visible | ✅ (a)–(d) verificadas en verde; (e) por escribir |
| **4** | Crear un segundo aseo activo para el mismo apartamento y fecha falla a nivel de base de datos | pgTAP | (a) `throws_ok(insert…, '23505')` con un aseo `pendiente` existente. (b) `lives_ok(insert…)` tras cancelar el primero. (c) `throws_ok(insert…, '23505')` con dos filas informativas (`state IS NULL`). (d) Test unitario Vitest sobre `mapDbError()` afirmando que `{code:'23505', message:'…cleanings_one_active_per_property_date…'}` produce el mensaje en español | ✅ (a)–(c) verificadas en verde; (d) por escribir |
| **5** | Editar la tarifa de un apartamento no altera el margen ya congelado en un aseo anterior | pgTAP | (a) `is(cleanings.tarifa_huesped, 120000::bigint)` tras el insert (el trigger snapshotea). (b) tras `update properties set tarifa_huesped = 999000`, sigue `120000`. (c) tras `update cleanings set tarifa_huesped = 1` **directo** sobre el aseo completado, sigue `120000`. (d) aserción de tipo: `is((select data_type from information_schema.columns where table_name='cleanings' and column_name='tarifa_huesped'), 'bigint')` | ✅ (a)–(c) verificadas en verde; (d) por escribir |

### Guardarraíles de schema (ya en verde, `02_guardarrailes.test.sql`)

Cuatro aserciones que cubren el punto ciego de `db advisors` (§9.2):

```sql
select is_empty($$select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and not c.relrowsecurity$$,
  'Toda tabla de public tiene RLS habilitada');

select is_empty($$select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and c.relrowsecurity
    and not exists (select 1 from pg_policy p where p.polrelid=c.oid)$$,
  'Toda tabla con RLS tiene al menos una policy (RLS sin policy = todo vacío)');

select is_empty($$select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='v'
    and coalesce((select option_value from pg_options_to_table(c.reloptions)
                  where option_name='security_invoker'),'off') <> 'true'$$,
  'Toda vista de public lleva security_invoker = on');

select is_empty($$select table_name||':'||privilege_type from information_schema.role_table_grants
  where table_schema='public' and grantee='anon'$$,
  'anon no conserva privilegios sobre public (incluido TRUNCATE)');
```

`[VERIFIED: 4/4 en verde]`

Aserciones adicionales que el plan debe añadir a este archivo:

- Toda función `SECURITY DEFINER` en `public` y `private` tiene `set search_path = ''` (`proconfig @> array['search_path=']`).
- Toda columna monetaria es `bigint` (§Pitfall 9).
- Ninguna migración ni seed contiene `current_date` — esto va en el job de arquitectura por grep, no en pgTAP.
- `service_role` puede leer todas las tablas de `public` (`set local role service_role` + `count(*)` sobre cada una).

### Frecuencia de muestreo

- **Por commit de tarea:** `npx supabase test db --local` (< 1 s con la base ya arriba).
- **Por merge de wave:** las 4 puertas del job `database` + el job `arquitectura`.
- **Gate de fase:** suite completa en verde en GitHub Actions antes de `/gsd:verify-work`.

### Wave 0 — lo que hay que construir antes de implementar

- [ ] `supabase/tests/00_rls_aseos.test.sql` — PLAT-03, PLAT-05, PLAT-06 (estructura validada, §5.5)
- [ ] `supabase/tests/01_invariantes.test.sql` — ASEO-07, FIN-01 (estructura validada)
- [ ] `supabase/tests/02_guardarrailes.test.sql` — invariantes de schema (validado)
- [ ] `supabase/tests/03_seed.test.sql` — criterio 1(c): 39 unidades, 8 clusters, 5 externas
- [ ] `supabase/tests/04_storage.test.sql` — policies de `storage.objects`
- [ ] Helper `tests_auth(uuid)` — 6 líneas, §5.2. Puede vivir duplicado por archivo o en un `00_helpers.test.sql`; los tests son transaccionales, así que no comparten estado
- [ ] `.github/workflows/db.yml` — §9.4
- [ ] `scripts/ci/check-service-role.sh` — §9.3
- [ ] Config de vitest + `lib/domain/errors.test.ts` para el mapeo de `23505`
- [ ] Instalar `vitest@4.1.11` (no viene con `create-next-app`)

---

## Security Domain

### Categorías ASVS aplicables

| Categoría ASVS | Aplica | Control estándar en esta fase |
|---|---|---|
| V1 Arquitectura | sí | Frontera `service_role` aislada a `lib/supabase/admin.ts` + test de arquitectura en CI (§9.3). `private` fuera de PostgREST (§3.8) |
| V2 Autenticación | parcial | `enable_signup = false`, `minimum_password_length = 12`, `jwt_expiry = 1800` (§10). El login llega en Fase 2 |
| V3 Gestión de sesión | sí | **Decisión central:** ninguna policy lee claims del JWT; todas consultan `profiles.is_active` en la base. Verificado: aseador desactivado con token vivo obtiene 0 filas (§11) |
| V4 Control de acceso | **sí, es el núcleo** | RLS por fila + RPC `SECURITY DEFINER` + grants mínimos. Cada policy con caso negativo en pgTAP |
| V5 Validación de entrada | sí | `CHECK` de dominio en la base (`cl_unmanaged_is_inert`, `props_active_requires_rates`, `mil_exactly_one_source`, `photo_exactly_one_owner`) + zod sobre `process.env` |
| V6 Criptografía | no | Nada propio. `gen_random_uuid()` de pgcrypto. Ningún hash ni cifrado escrito a mano |
| V7 Manejo de errores y logging | sí | `access_code_reads` es un log de auditoría de acceso a credencial. `raise exception … errcode = '42501'` uniforme en RPCs |
| V8 Protección de datos | sí | Bucket `evidencia` privado con `file_size_limit` y `allowed_mime_types`. Signed URLs de 60–300 s. `legal_hold`/`deleted_at` desde el día uno |
| V12 Archivos y recursos | sí | Ruta `{cleaning_id}/{kind}/{uuid}.{ext}`, sin nombre original del dispositivo, sin enumerables. Policy compara el segmento como `text`, sin cast a `uuid` (un path malformado da deny, no error de tipo) |
| V13 API | sí | `revoke all on function … from public, anon` en todo RPC. `anon` sin ningún privilegio en `public` |

### Patrones de amenaza conocidos para Postgres + Supabase

| Patrón | STRIDE | Mitigación estándar | Verificado |
|---|---|---|---|
| Tabla sin RLS expuesta por PostgREST | Information Disclosure | `db advisors --fail-on error` + aserción pgTAP | ✅ ERROR `rls_disabled_in_public` |
| Vista sin `security_invoker` saltando RLS de las tablas base | Information Disclosure | `with (security_invoker = on)` + aserción pgTAP | ✅ fuga reproducida y detectada |
| `anon` con `TRUNCATE` heredado de default privileges | Denial of Service / Tampering | `revoke all … from anon` + `alter default privileges` | ✅ `anon` truncó una tabla en la prueba |
| Escalada por `search_path` en función `SECURITY DEFINER` | Elevation of Privilege | `set search_path = ''` + nombres calificados | ✅ `db advisors` reporta `function_search_path_mutable` |
| Recursión infinita de policies (`42P17`) | Denial of Service | DAG de policies; el lookup va en función definer | Diseño de `ARCHITECTURE.md`, no reprodujo el error |
| Token vivo de usuario desactivado | Spoofing | Predicado `is_active` leído de la base en cada policy | ✅ aseador C desactivado ve 0 filas |
| Fuga por join / embed de PostgREST | Information Disclosure | Policy en la tabla que tiene el dato + test explícito del join | Pendiente de escribir (§5.6) |
| `service_role` en el bundle del cliente | Elevation of Privilege | Sin prefijo `NEXT_PUBLIC_`, `import 'server-only'`, grep en CI | ✅ grep detecta el caso |
| `CURRENT_DATE` en una policy → el aseador pierde el código a las 19:00 Bogotá | Denial of Service | `public.today_bog()` + grep en CI | ✅ `today_bog()` funciona; grep por escribir |
| Objeto de Storage huérfano tras borrar la fila por SQL | Facturación / retención incorrecta | `storage_deletion_queue` + Storage API | Tabla se crea aquí; el worker es Fase 9 |

---

## State of the Art

| Enfoque viejo | Enfoque actual | Cuándo cambió | Impacto en esta fase |
|---|---|---|---|
| Tablas nuevas en `public` heredan `SELECT` para `anon`/`authenticated` | Solo heredan `REFERENCES`, `TRIGGER`, `TRUNCATE` | Sin fecha pública; verificado hoy | 🔴 Invalida todos los tutoriales que muestran "crea tabla + policy y ya funciona". §3.1 |
| Claves `anon` / `service_role` (JWT) | `sb_publishable_…` / `sb_secret_…` | Deprecación anunciada para fin de 2026 | El CLI local ya emite ambos pares. Nombrar env vars con la nomenclatura nueva |
| `create extension pgtap` en una migración | El CLI la crea al correr `supabase test db` | — | pgTAP no llega a producción. §5.1 |
| `[db.seed] sql_paths = ["./seed.sql"]` archivo único | Globs: `["./seeds/*.sql"]` | CLI reciente | Permite partir el seed sin script propio. §7.2 |
| `supabase/setup-cli@v1` (aún en la doc de CI de Supabase) | **`@v3`** | — | La doc oficial de CI está desactualizada respecto al README del propio repo |
| `shadcn init --base-color` + `radix-ui` | `-b <base\|radix\|aria>`, `-p <preset>`, default `base-nova` con **`@base-ui/react`** | shadcn 4.x | Contradice `STACK.md`. Razón adicional para posponer a Fase 2. §4.6 |
| `typescript@^5` | `latest` es **`7.0.2`** | — | Pinear `^5.9` explícito. §4.4 |
| `next@15` como línea actual | `latest` es `16.3.3`; la 15 recibe backports | — | Confirma el pin de `15.5.24` |

**Deprecado / a evitar en esta fase:**
- `@supabase/auth-helpers-nextjs` — `deprecated` en npm.
- `shadcn-ui` (paquete npm) — nombre viejo del CLI.
- `numeric` / `float` para COP.
- `timestamptz` para `fecha_aseo`.
- `supabase start` en CI cuando `supabase db start` basta y tarda 6× menos.

---

## Environment Availability

Auditado en la máquina de desarrollo el 2026-08-31.

| Dependencia | Requerida por | Disponible | Versión | Fallback |
|---|---|---|---|---|
| Docker Engine | `supabase db start`, `supabase test db` | ✓ | 29.5.3 (Docker Desktop, daemon detenido al inicio de la sesión) | Ninguno. Sin Docker no hay Supabase local |
| `supabase` CLI (global) | Desarrollo local | ✓ | **2.115.0** — hay 2.116.0 | Instalar como devDependency y usar `npx supabase` (recomendado: alinea local y CI) |
| Node.js | Todo | ✓ | v25.6.1 | — |
| npm | Todo | ✓ | 11.9.0 | — |
| PostgreSQL 17 | Base | ✓ vía contenedor | 17.6 (imagen Supabase) / 17.11 (`postgres:17`) | — |
| pgTAP | `supabase test db` | ✓ | 1.3.3, la instala el CLI | — |
| `pg_cron` / `pg_net` | Fases 3, 5, 9 | ✓ disponibles, no instaladas | 1.6.4 / 0.20.4 | — |
| `psql` (host) | Depuración manual | ✗ | — | `docker exec <supabase_db_…> psql -U postgres -d postgres` |
| `pg_prove` (host) | Correr pgTAP a mano | ✗ | — | `supabase test db` trae el contenedor `pg_prove:3.36` |
| `slopcheck` | Auditoría de paquetes | ✓ tras instalar | vía `python3 -m slopcheck`, **no queda en PATH** | Usar `python3 -m slopcheck -e npm` |
| `ctx7` | Docs de librerías | ✗ | — | WebFetch sobre docs oficiales (lo que hice) |
| Cuenta Supabase (proyectos dev y prod) | `supabase link`, `db push` | ✗ no verificado en esta sesión | — | Ninguno. Bloqueante para el push a dev |
| GitHub Actions | CI | ✗ no verificado | — | Ninguno |

**Faltantes sin fallback (bloquean, y son humanos, no técnicos):**
- **Los dos proyectos Supabase (dev y prod) no están creados o al menos no están linkeados.** `CONTEXT.md` los da por decididos. Crear el de dev y correr un `supabase link` + `supabase db push` es lo que confirma §3.7 (policies de Storage desde migración en hosted) y §10 (qué claves de `[auth]` acepta `config.toml` push vs cuáles hay que tocar en el dashboard). **Debe ser una tarea con checkpoint humano dentro de esta fase, no un supuesto.**

**Faltantes con fallback:**
- `psql`, `pg_prove`, `ctx7` — todos tienen sustituto documentado arriba.
- CLI 2.115.0 vs 2.116.0 — la diferencia es de un patch; pinear 2.116.0 en `devDependencies` y en `setup-cli` alinea local y CI.

---

## Assumptions Log

| # | Afirmación | Sección | Riesgo si es falsa |
|---|---|---|---|
| A1 | `create policy on storage.objects` desde una migración funciona igual en el proyecto **hosted** que en local | §3.7 | El bucket privado no queda protegido en dev/prod. **Mitigación: confirmarlo en el primer `db push` a dev, con checkpoint humano.** Si falla, las policies de Storage se crean desde el dashboard y se documentan como excepción a "el CLI es la fuente de verdad" |
| A2 | GitHub Actions free tier: repos públicos ilimitados, privados 2000 min/mes | §9.4 | Si el repo es privado y el cupo es menor, hay que reducir la frecuencia de CI. Impacto bajo: los dos jobs son de minutos |
| A3 | `supabase config push` sincroniza las claves de `[auth]` (`enable_signup`, `jwt_expiry`, `minimum_password_length`) al proyecto hosted | §10 | Si no las cubre, hay que tocarlas a mano en el dashboard de dev y prod, y el `config.toml` solo protege local — que es la peor de las trampas: parece configurado y no lo está |
| A4 | Los default privileges de Supabase hosted coinciden con los del contenedor local (`anon=Dxtm`) | §3.1 | Si hosted otorga más (p. ej. el histórico `arwdDxtm`), el `revoke all … from anon` sigue siendo correcto pero se vuelve **más** necesario, no menos. Riesgo bajo y en la dirección segura |
| A5 | El aseador necesita `grant select` sobre `cleaning_checklist_items` y `cleaning_photos` (además del RPC) | §3.1 | Si el diseño final hace que también las lea por RPC, el grant sobra. Si falta, no ve su propio checklist. El plan debe decidirlo tabla por tabla, no en bloque |
| A6 | `server-only@0.0.1` es first-party de Vercel pese a no declarar `repository` en npm | Package Audit | Riesgo muy bajo: es dependencia del propio `next`. Si se quiere cero exposición, el grep de §9.3 ya cubre la garantía real |
| A7 | El seed de 39 unidades cabe cómodamente en el free tier de Supabase (500 MB de base) | §7 | Trivialmente cierto para 39 filas. Lo que sí puede apretar el free tier es Storage con las fotos, y eso ya está mitigado por la retención de 30 días de `STATE.md` |
| A8 | Los nombres reales de los 8 clusters se pueden inventar como placeholder sin bloquear | §7.4 | `CONTEXT.md` lo autoriza explícitamente. Pero el criterio de éxito 1 dice "8 clusters y 39 unidades **reales**" mientras `CONTEXT.md` dice "nombres reales todavía no existen". **Ver Open Question 1** |

---

## Open Questions (RESOLVED)

> Las 5 preguntas quedaron resueltas por los planes de la fase. Resolución verificada por `gsd-plan-checker` el 2026-08-31.
>
> 1. **RESOLVED** — "39 unidades reales": se verifica por estructura (39 unidades / 8 clusters / 5 externas), no por nombres. Placeholders marcados en el dato → plan `01-05`.
> 2. **RESOLVED** — Grants del aseador: matriz completa en `01-07`. `property_secrets` y `storage_deletion_queue` con cero grant; `cleanings` solo `select`; catálogos y satélites del aseo con `select`; `push_subscriptions` con DML completo.
> 3. **RESOLVED** — `legal_hold`: modelado como `legal_hold` + `legal_hold_reason` + `deleted_at` con índice parcial en `cleanings` → plan `01-04`.
> 4. **RESOLVED** — Log de transiciones: tabla `cleaning_state_transitions` más guard que rechaza transiciones desde estados terminales con `P0001` → plan `01-06`.
> 5. **RESOLVED como checkpoint humano** — El link a los proyectos Supabase queda como `checkpoint:human-action` bloqueante en `01-09`, aislado en la wave 8. Las waves 1 a 7 corren contra Docker local y no dependen de él.

### Detalle original

1. **El criterio de éxito 1 dice "las 39 unidades **reales**"; `CONTEXT.md` dice que los nombres reales no existen todavía.**
   - Lo que sabemos: la distribución sí es real y verificable (8 clusters, 34 gestionadas + 5 externas, y las 5 externas están nombradas: Bogotá 2 con 2 aptos, Santa Marta 2, Santa Marta 3, Chinauta).
   - Lo que no está claro: si "real" significa nombres definitivos o solo el conteo y la distribución correctos.
   - Recomendación: el criterio se verifica sobre **estructura**, no sobre nombres — `count(*) = 39`, `count(distinct cluster) = 8`, `count(*) where not gestion_vivaguest = 5`. Los nombres van con prefijo `[PLACEHOLDER]`. Reemplazarlos es una tarea de la Fase 2 (CRUD de apartamentos), no un bloqueante de la Fase 1.

2. **¿Qué tablas recibe `grant select` el aseador, exactamente?**
   - Lo que sabemos: `cleanings`, `properties`, `profiles` sí. `property_secrets`, `access_code_reads`, `app_settings`, `storage_deletion_queue`, `calendar_feeds`, `calendar_reservations` no.
   - Lo que no está claro: `cleaning_checklist_items`, `cleaning_photos`, `damages`, `expenses`, `missing_item_reports`. La tabla de cobertura de `ARCHITECTURE.md` dice "SELECT/UPDATE si `cleaning_id in my_cleaning_ids()` (o sólo RPC)" — el "o sólo RPC" está sin resolver.
   - Recomendación: `grant select` sí (el aseador necesita ver su checklist y sus fotos sin un round-trip por RPC), `grant insert/update/delete` **no** (todo por RPC). Decidir tabla por tabla en el plan y escribir un test positivo por cada `grant select` otorgado.

3. **`legal_hold`: ¿columna en `cleanings` o tabla aparte?**
   - Lo que sabemos: `CONTEXT.md` y `PITFALLS.md` exigen que exista en el schema inicial. `ARCHITECTURE.md` no lo modela en su DDL — lo menciona pero no lo escribe.
   - Recomendación: `legal_hold boolean not null default false` + `legal_hold_reason text` + `deleted_at timestamptz` en `cleanings`, y un índice parcial `where legal_hold` para que el job de la Fase 9 los excluya barato. Es discreción del planner, pero no puede omitirse.

4. **El log de auditoría de transiciones de estado no está en el DDL de `ARCHITECTURE.md`.**
   - Lo que sabemos: `CONTEXT.md` lo exige ("máquina de estados del aseo con log de auditoría de transiciones") y `PITFALLS.md` lo llama "el argumento decisivo para persistir el crudo desde el día uno" para poder recuperarse de un reconcile destructivo en la Fase 3.
   - Lo que no está claro: la forma exacta de la tabla.
   - Recomendación: `cleaning_state_transitions (id, cleaning_id, from_state, to_state, actor_id, reason, created_at)` poblada por un trigger `AFTER UPDATE OF state`, y en el mismo trigger `BEFORE` un rechazo de transiciones desde estados terminales (§3.6).

5. **¿Cuándo se linkean los proyectos Supabase dev y prod?**
   - Lo que sabemos: `CONTEXT.md` dice que hay dos y que el CLI es la fuente de verdad. Ninguno está linkeado en la máquina de desarrollo.
   - Recomendación: tarea con `checkpoint:human-verify` al final de la fase — crear el proyecto dev, `supabase link`, `supabase db push`, y **verificar A1 y A3**. Sin esto la fase está verificada solo en local, y los dos supuestos más riesgosos del documento quedan sin cerrar.

---

## Sources

### Primarias (HIGH confidence) — ejecución directa en esta sesión

- **Supabase local, CLI 2.115.0 / Postgres 17.6** — default privileges (`\ddp`, `information_schema.role_table_grants`), privilegios efectivos de `anon`/`authenticated`/`service_role`, `pg_get_functiondef(auth.uid)`, `auth.users` NOT NULL columns, `pg_available_extensions`, `pg_auth_members`, ownership de `storage.*`, `config.toml` generado.
- **Postgres 17.11 (`postgres:17` en Docker)** — índice único parcial con `IS DISTINCT FROM` sobre enum (creación, tres semánticas, `EXPLAIN` de implicación de predicado), `UNIQUE CONSTRAINT … WHERE` como error de sintaxis, `security_invoker` vs vista definer, `SECURITY DEFINER` con DML revocado, `proacl` NULL = `PUBLIC EXECUTE`.
- **`supabase test db --local`** — suite de 21 aserciones en 3 archivos, `Result: PASS`; y los tres modos de fallo (excepción no atrapada, colisión con el seed, `Bad plan`).
- **`supabase db advisors --local`** — `--type`/`--level`/`--fail-on`, códigos de salida, detección de `rls_disabled_in_public`, `security_definer_view`, `function_search_path_mutable`, `multiple_permissive_policies`, y el punto ciego sin grants.
- **`supabase gen types typescript --local`** — 343 líneas, `Functions`/`Enums`/`Args`/`Returns`, `bigint → number`, drift detectado tras `alter table`.
- **PostgREST local (`curl`)** — `bigint` serializado como número JSON; `anon` → `42501` con hint.
- **`create-next-app@15.5.24`** — rechazo por directorio no vacío (exit 1), `--turbopack` en los scripts sin haberlo pedido, contenido exacto del scaffold, restricción del nombre de directorio.
- **`shadcn@4.19.1`** — `--help` de `init`, ejecución con `-d`, dependencias instaladas (`@base-ui/react`), 144 líneas de diff en `globals.css`.
- **npm registry (`npm view`)** — versiones, fechas de creación, repos y `scripts.postinstall` de los 12 paquetes, 2026-08-31.
- **`slopcheck install -e npm`** — auditoría de los 12 paquetes.

### Secundarias (MEDIUM-HIGH)

- Supabase Docs — pgTAP extended: https://supabase.com/docs/guides/local-development/testing/pgtap-extended — `throws_ok` con `42501`, `tests.authenticate_as`, `basejump-supabase_test_helpers`, orden alfabético de los archivos.
- `supabase/setup-cli` README (raw.githubusercontent.com/supabase/setup-cli/main/README.md) — `uses: supabase/setup-cli@v3`, input `version`.
- Supabase Docs — Automated testing using GitHub Actions: https://supabase.com/docs/guides/deployment/ci/testing — workflow de referencia. **Nota: dice `@v1`, desactualizado frente al README del repo.**
- `.planning/research/ARCHITECTURE.md`, `PITFALLS.md`, `STACK.md` — insumos que este documento verifica y corrige.

### Terciarias (LOW — marcadas como `[ASSUMED]`)

- Límites del free tier de GitHub Actions — no verificado en esta sesión (A2).
- Comportamiento de Supabase **hosted** para policies de Storage desde migración (A1) y para `supabase config push` de `[auth]` (A3) — solo verificado en local.

---

## Metadata

**Desglose de confianza:**

| Área | Nivel | Razón |
|---|---|---|
| Grants y default privileges | **HIGH** | Ejecutado y reproducido en las dos direcciones sobre Supabase local |
| Índice parcial `IS DISTINCT FROM` | **HIGH** | Cuatro escenarios ejercidos + `EXPLAIN` |
| Mecánica de pgTAP | **HIGH** | Suite de 21 aserciones en verde, y los tres modos de fallo reproducidos |
| Trigger de snapshot (FIN-01) | **HIGH** | Tres aserciones incluyendo el caso negativo del `UPDATE` directo |
| `gen types` y drift | **HIGH** | Generado, diffeado limpio y sucio |
| Seed con globs | **HIGH** | Dos `db reset` consecutivos, orden lexicográfico observado |
| Scaffolding de Next/Tailwind/shadcn | **HIGH** | Ejecutado con las versiones exactas |
| CI en GitHub Actions | **MEDIUM** | Los comandos están verificados uno por uno en local; el workflow completo **no** se ejecutó en un runner |
| Storage desde migración en **hosted** | **LOW** | Solo verificado en local; el grafo de roles sugiere que funciona por un permiso no evidente (A1) |
| `config.toml` push de `[auth]` a hosted | **LOW** | No verificado (A3) |
| Límites del free tier | **LOW** | No verificado (A2) |

**Fecha de investigación:** 2026-08-31
**Válido hasta:** ~2026-09-30 para el stack npm (Next 16 y TypeScript 7 ya son `latest`; el riesgo de deriva está en los pines, no en los hallazgos). Los hallazgos de Postgres/RLS/pgTAP son estructurales y no caducan con el mismo reloj.

---
*Research para Fase 1: Fundación, schema y RLS — verificado ejecutando SQL contra Supabase local y Postgres 17*
