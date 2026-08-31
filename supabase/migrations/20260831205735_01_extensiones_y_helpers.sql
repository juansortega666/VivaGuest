-- ============================================================================
-- 01 — Extensiones y helpers
--
-- Primera migración del proyecto. Solo crea lo que TODO lo demás necesita:
-- el helper de fecha bogotana y el trigger genérico de `updated_at`.
--
-- Extensiones: NO se crea ninguna, a propósito.
--
--   * pgcrypto: `gen_random_uuid()` es nativa de `pg_catalog` desde Postgres 13
--     y la base local corre 17.6. Verificado en esta base:
--       select p.proname, n.nspname from pg_proc p
--         join pg_namespace n on n.oid = p.pronamespace
--        where p.proname = 'gen_random_uuid';
--       -> gen_random_uuid|pg_catalog
--          gen_random_uuid|extensions   (Supabase ya la instala de fábrica)
--     Añadir `create extension pgcrypto` sería ruido en el diff de schema sin
--     ganar nada.
--
--   * pgtap: PROHIBIDA en migraciones. `supabase test db` la instala por su
--     cuenta antes de lanzar pg_prove; declararla aquí la empujaría a
--     producción en el primer `db push`, que solo empuja migraciones.
--
--   * pg_cron / pg_net: las agenda la Fase 3. Aquí no se agenda ningún job.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- public.today_bog() — el único helper de fecha del repo
--
-- La sesión de Postgres corre en UTC. Entre las 19:00 y las 23:59 de Bogotá,
-- `current_date` YA devuelve mañana. Con `current_date` dentro de la policy de
-- la ventana de acceso, el aseador pierde el código de la cerradura a las 7pm.
-- Por eso `current_date` queda PROHIBIDO en todo el repo (índices, policies,
-- jobs y seeds) y lo bloquea el grep de scripts/ci/check-service-role.sh.
--
-- `set search_path = ''` va incluso en funciones que no son SECURITY DEFINER:
-- es la regla uniforme del repo. `now()` y el cast a `date` viven en
-- pg_catalog, que siempre está implícito en el search_path.
-- ---------------------------------------------------------------------------
create or replace function public.today_bog()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Bogota')::date
$$;

-- El texto del COMMENT evita a propósito escribir el nombre de la función de
-- fecha prohibida: la puerta de CI filtra las líneas que empiezan por `--`,
-- pero no el cuerpo de un literal SQL. Es la lección de la desviación 3 del
-- plan 01-01: un comentario que cita el patrón prohibido rompe su propio
-- guardarraíl.
comment on function public.today_bog() is
  'Día calendario de Bogotá. Único helper de fecha permitido en índices, policies, jobs y seeds: la sesión corre en UTC y después de las 19:00 de Bogotá el día UTC ya es el siguiente.';

-- ---------------------------------------------------------------------------
-- public.tg_set_updated_at() — trigger genérico de auditoría temporal
--
-- Se engancha en la migración 03 sobre profiles, properties, property_secrets
-- y app_settings, y en las migraciones posteriores sobre el resto.
-- No es SECURITY DEFINER: corre con los privilegios de quien escribe la fila,
-- que es exactamente lo que debe hacer. El `set search_path = ''` va igual.
-- ---------------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.tg_set_updated_at() is
  'Trigger BEFORE UPDATE genérico: refresca updated_at con now(). Se engancha por tabla, no por default privileges.';
