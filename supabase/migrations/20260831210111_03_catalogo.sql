-- ============================================================================
-- 03 — Catálogo: identidad, apartamentos, secretos, cuartos, faltantes, ajustes
--
-- Bloque de tablas sin dependencias operativas. No crea `cleanings` ni nada que
-- dependa de ella (`access_code_reads` tiene FK a `cleanings`, así que vive en
-- la migración de aseos).
--
-- ESTE ARCHIVO NO HABILITA RLS, NI CREA POLICIES, NI OTORGA GRANTS.
-- El modelo de autorización completo vive en las migraciones 07 y 08, en un
-- solo archivo legible. No hay "ventana sin RLS": `supabase db reset` aplica
-- todas las migraciones en la misma sesión, antes de que exista un solo
-- cliente. La garantía se recupera con los guardarraíles pgTAP
-- (02_guardarrailes.test.sql) y con `supabase db advisors`.
--
-- Divergencias DELIBERADAS respecto a .planning/research/ARCHITECTURE.md.
-- Están todas justificadas en 01-RESEARCH.md y en 01-CONTEXT.md, y la suite
-- pgTAP de la fase las exige. No "arreglar" ninguna volviendo al DDL original:
--
--   1. Columnas monetarias en `bigint`, no `numeric(12,2)`. El COP no tiene
--      subunidad y supabase-js devuelve `numeric` como string, lo que rompería
--      la aritmética de la Fase 7 en silencio. `bigint` se serializa como
--      número JSON y `gen types` lo mapea a `number`. `maps_lat`/`maps_lng`
--      SÍ siguen siendo numeric(9,6): son coordenadas, no dinero.
--   2. `property_secrets.ical_url`: la URL de exportación de Airbnb es una
--      credencial (secreta e inadivinable; un GET revela la ocupación completa
--      del apartamento sin auth), así que recibe el mismo tratamiento que el
--      código de la cerradura. ARCHITECTURE.md no la modela aquí.
--   3. `properties.fee_discriminado`: lo pide APTO-10 y ARCHITECTURE.md lo
--      omite. Es una columna; no vale una migración aparte en la Fase 2.
--   4. `props_active_requires_rates` se mantiene EXACTAMENTE con su forma
--      actual. Ver la nota larga junto al constraint.
--   5. `properties.cluster` se queda como `text not null`, ni enum ni tabla.
-- ============================================================================


-- ===========================================================================
-- IDENTIDAD Y ROLES
-- ===========================================================================

create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  role           public.user_role not null default 'aseador',
  full_name      text not null constraint profiles_full_name_no_vacio
                   check (length(btrim(full_name)) > 0),
  phone          text,
  is_active      boolean not null default true,
  deactivated_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- Desactivar es un acto con fecha, y reactivar la borra. Sin este CHECK,
  -- `is_active = false` con `deactivated_at` nulo deja sin auditoría la única
  -- operación que revoca el acceso de un aseador.
  constraint profiles_deactivation_coherent
    check (is_active = (deactivated_at is null))
);

-- Las policies filtran por `is_active`, nunca por un claim del JWT: un access
-- token ya emitido verifica bien hasta expirar, así que si el rol viviera en el
-- claim un aseador desactivado seguiría entrando hasta 30 minutos.
create index profiles_active_role_idx on public.profiles (role) where is_active;

comment on table public.profiles is
  'Espejo de auth.users con el rol de dominio. Fuente de verdad de la autorización: las policies leen is_active y role de aquí, nunca del JWT.';


-- ---------------------------------------------------------------------------
-- Trigger `on auth.users insert`: materializa la fila de profiles
--
-- No hay auto-registro (`enable_signup = false` en config.toml). El admin crea
-- el usuario con auth.admin.createUser usando service_role, y este trigger
-- convierte ese insert en una fila de `profiles` sin una línea de código de
-- aplicación.
--
-- SECURITY DEFINER es obligatorio: quien inserta en auth.users es el rol
-- `supabase_auth_admin`, que no tiene ningún privilegio sobre public.profiles.
-- `set search_path = ''` con todo calificado por esquema es lo que impide que
-- ese privilegio elevado se convierta en un vector de escalada (T-01-16).
--
-- El rol del metadato se valida contra el enum en vez de castearlo directo:
-- un `raw_user_meta_data->>'role'` basura abortaría el insert en auth.users
-- con 22P02 y dejaría la creación de usuarios rota. Cualquier valor que no sea
-- una etiqueta del enum cae al default 'aseador' (T-01-17).
-- ---------------------------------------------------------------------------
create or replace function public.tg_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta     jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role_txt text  := nullif(btrim(v_meta ->> 'role'), '');
  v_role     public.user_role;
  v_name     text;
begin
  if v_role_txt is not null
     and exists (
       select 1
         from pg_catalog.pg_enum e
        where e.enumtypid = 'public.user_role'::regtype
          and e.enumlabel = v_role_txt)
  then
    v_role := v_role_txt::public.user_role;
  else
    v_role := 'aseador'::public.user_role;
  end if;

  -- full_name es not null con CHECK de no vacío: hay que resolverlo aquí o el
  -- insert en auth.users falla. El fallback final existe para el caso de un
  -- usuario sin metadatos y sin email (auth.users.email es nullable).
  v_name := coalesce(
    nullif(btrim(v_meta ->> 'full_name'), ''),
    nullif(btrim(v_meta ->> 'name'), ''),
    nullif(btrim(split_part(coalesce(new.email, ''), '@', 1)), ''),
    'Usuario sin nombre');

  insert into public.profiles (id, role, full_name, phone)
  values (new.id, v_role, v_name, nullif(btrim(v_meta ->> 'phone'), ''))
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.tg_handle_new_user();


-- ===========================================================================
-- APARTAMENTOS
-- ===========================================================================

create table public.properties (
  id                uuid primary key default gen_random_uuid(),
  nombre            text not null,
  cluster           text not null,
  direccion         text,
  maps_url          text,
  -- Coordenadas, no dinero: numeric es el tipo correcto aquí.
  maps_lat          numeric(9,6),
  maps_lng          numeric(9,6),
  hora_limite       time not null default '11:30',   -- APTO-05
  gestion_vivaguest boolean not null default true,

  -- Pesos colombianos ENTEROS. Ver divergencia 1 de la cabecera.
  tarifa_huesped    bigint,
  pago_aseador      bigint,
  -- APTO-10: si el fee va discriminado o incluido en el precio total.
  -- Informativo; no participa de ningún cálculo de esta fase.
  fee_discriminado  boolean not null default false,

  responsable_id    uuid references public.profiles (id) on delete restrict,
  suplente_id       uuid references public.profiles (id) on delete restrict,
  contacto_externo  text,   -- texto libre para las unidades de gestión externa

  -- Nace INACTIVO: activarlo es un acto deliberado del admin, y los CHECK de
  -- abajo son los que exigen que esté configurado antes de poder hacerlo.
  is_active         boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint props_rates_nonneg check (
    coalesce(tarifa_huesped, 0) >= 0 and coalesce(pago_aseador, 0) >= 0
  ),

  -- APTO-02. NO "arreglar" este CHECK ampliándolo a las unidades no
  -- gestionadas: para las 5 unidades de gestión externa no hay tarifa que
  -- cobrar ni pago que hacer, y `cl_unmanaged_is_inert` (migración de aseos)
  -- fuerza NULL en las tarifas de sus aseos. Exigirles tarifas las volvería
  -- inactivables. La condición "solo cuando es gestionada" es deliberada.
  constraint props_active_requires_rates check (
    not (is_active and gestion_vivaguest)
    or (tarifa_huesped is not null and pago_aseador is not null)
  ),

  -- No se activa sin alguien que responda por el apartamento.
  constraint props_active_requires_owner check (
    not (is_active and gestion_vivaguest)
    or (responsable_id is not null or contacto_externo is not null)
  ),

  -- responsable/suplente solo tienen sentido bajo gestión VivaGuest.
  constraint props_assignees_only_when_managed check (
    gestion_vivaguest or (responsable_id is null and suplente_id is null)
  ),

  constraint props_suplente_distinct check (
    suplente_id is null or suplente_id is distinct from responsable_id
  )
);

-- Alimenta el buscador del dashboard (APTO-11) y evita duplicados al dar de
-- alta 39 unidades a mano. El nombre del índice es contrato: `mapDbError()` lo
-- usa para traducir el 23505 a un mensaje en español.
create unique index properties_nombre_uniq
  on public.properties (lower(btrim(nombre)));

-- Los 8 clusters son datos, no schema. El agrupamiento por cluster es la
-- consulta más frecuente del dashboard.
create index properties_cluster_idx on public.properties (cluster);

comment on column public.properties.tarifa_huesped is
  'COP enteros (bigint). Tarifa vigente: es el default que el trigger de snapshot copia a cada aseo nuevo, no el valor histórico.';
comment on column public.properties.pago_aseador is
  'COP enteros (bigint). Pago vigente al aseador; se congela por aseo al pasar a estado terminal.';


-- ===========================================================================
-- SECRETOS DEL APARTAMENTO — tabla aparte, no columnas de `properties`
--
-- En Supabase, admin y aseador comparten el rol de Postgres `authenticated`, y
-- los GRANT SELECT (columna) son por rol de base, no por usuario: ocultarle una
-- columna al aseador y mostrársela al admin es IMPOSIBLE. Lo único que
-- discrimina usuarios es RLS, y RLS opera por fila. Por eso el secreto tiene
-- que vivir en su propia fila. Es una consecuencia dura del stack, no estilo.
--
-- Esta tabla no recibirá NINGÚN grant para `authenticated` (guardarraíl 8):
-- el acceso al código pasa por el RPC reveal_access_code(), con ventana y
-- auditoría. Sin grant no hay policy que pueda filtrarse por error.
-- ===========================================================================

create table public.property_secrets (
  property_id    uuid primary key references public.properties (id) on delete cascade,
  codigo_acceso  text,
  tipo_cerradura text not null default 'inteligente'
                 constraint property_secrets_tipo_cerradura_valido
                   check (tipo_cerradura in ('inteligente', 'llave_fisica')),
  notas_acceso   text,
  -- Divergencia 2: la URL de exportación iCal es una credencial. Vive aquí y
  -- NO en `calendar_feeds`, que así deja de portar secretos.
  ical_url       text,
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.profiles (id)
);

comment on column public.property_secrets.ical_url is
  'URL de exportación iCal de Airbnb. Es una credencial: quien la tenga ve la ocupación completa del apartamento sin autenticarse.';


-- ===========================================================================
-- CUARTOS Y CHECKLIST — biblioteca global fija, máximo 3 tareas por tipo
-- ===========================================================================

create table public.room_types (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,   -- 'cocina', 'bano', 'habitacion', 'sala', ...
  nombre     text not null,
  sort_order int not null default 0
);

create table public.checklist_tasks (
  id            uuid primary key default gen_random_uuid(),
  room_type_id  uuid not null references public.room_types (id) on delete cascade,
  descripcion   text not null,
  -- El tope de 3 tareas por tipo de cuarto es ESTRUCTURAL: CHECK de rango más
  -- UNIQUE del par. Máximo 3 filas por tipo, sin trigger ni conteo.
  -- Contrapartida asumida: retirar una tarea y añadir otra obliga a reusar el
  -- slot. Aceptable para una biblioteca fija de MVP, editable en base de datos
  -- sin migración, que es lo que pide CONTEXT.md.
  slot          smallint not null constraint checklist_tasks_slot_rango
                  check (slot between 1 and 3),
  requiere_foto boolean not null default true,
  is_active     boolean not null default true,

  constraint checklist_tasks_room_slot_uniq unique (room_type_id, slot)
);

create table public.property_rooms (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references public.properties (id) on delete cascade,
  room_type_id uuid not null references public.room_types (id) on delete restrict,
  etiqueta     text not null,   -- 'Habitación 1', 'Baño social'
  sort_order   int not null default 0,
  is_active    boolean not null default true,

  constraint property_rooms_etiqueta_uniq unique (property_id, etiqueta)
);

create index property_rooms_prop_idx
  on public.property_rooms (property_id) where is_active;


-- ===========================================================================
-- FALTANTES — catálogo base configurable
-- La lista que ve el aseador = globales activos ∪ los del apartamento.
-- "Otros" NO es una fila de este catálogo: es la rama de texto libre de
-- missing_item_lines, que crea otra migración.
-- ===========================================================================

create table public.missing_item_catalog (
  id          uuid primary key default gen_random_uuid(),
  -- NULL = ítem global, presente en todos los apartamentos.
  property_id uuid references public.properties (id) on delete cascade,
  nombre      text not null,
  sort_order  int not null default 0,
  is_active   boolean not null default true
);

-- Dos índices parciales y no un UNIQUE simple: en un UNIQUE (property_id,
-- lower(nombre)) los NULL no colisionan entre sí, así que el catálogo global
-- admitiría duplicados sin que nada lo impida.
create unique index mic_global_uniq
  on public.missing_item_catalog (lower(nombre))
  where property_id is null;

create unique index mic_prop_uniq
  on public.missing_item_catalog (property_id, lower(nombre))
  where property_id is not null;


-- ===========================================================================
-- AJUSTES DE APLICACIÓN
-- Claves previstas: retention_months=6, retention_notice_days=15,
-- feed_dead_after_minutes=180, sync_interval_minutes=30,
-- access_code_window_days=1. Las siembra el plan del seed.
-- ===========================================================================

create table public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);


-- ===========================================================================
-- Auditoría temporal: engancha el trigger genérico de la migración 01
-- ===========================================================================

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.tg_set_updated_at();

create trigger properties_set_updated_at
  before update on public.properties
  for each row execute function public.tg_set_updated_at();

create trigger property_secrets_set_updated_at
  before update on public.property_secrets
  for each row execute function public.tg_set_updated_at();

create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function public.tg_set_updated_at();


-- ===========================================================================
-- CIERRE DEL AGUJERO DE PRIVILEGIOS POR DEFECTO
--
-- 01-RESEARCH.md §3.1 midió, con CLI 2.115.0, que una tabla creada en `public`
-- por `postgres` nacía con solo `REFERENCES, TRIGGER, TRUNCATE` para anon,
-- authenticated y service_role. Con la CLI 2.116.0 que pinea este repo eso YA
-- NO ES CIERTO: la clave `auto_expose_new_tables` de config.toml (sin valor
-- explícito, y su fallback es `true`, que es además el default de la nube)
-- instala esto en la base:
--
--   pg_default_acl: postgres | public | r |
--     {postgres=arwdDxtm/postgres, anon=arwdDxtm/postgres,
--      authenticated=arwdDxtm/postgres, service_role=arwdDxtm/postgres}
--
-- O sea, cada una de las 8 tablas de arriba nace con SELECT, INSERT, UPDATE,
-- DELETE y TRUNCATE para `anon` — sin autenticar — y sin RLS que la frene,
-- porque la RLS la habilita la migración 07. `public.property_secrets`, que es
-- la tabla que existe precisamente para que el código de la cerradura y la URL
-- iCal no sean legibles (T-01-14, T-01-15), quedaría legible por cualquiera.
--
-- Este REVOKE devuelve las 8 tablas al estado que la fase asumió al diseñarse.
-- No es un GRANT: la migración 07 sigue siendo la dueña de decidir quién lee
-- qué, y a partir de ella `authenticated` recibe SELECT donde corresponda.
--
-- ⚠️ CONTRATO PARA LA MIGRACIÓN DE GRANTS (plan 01-07). Esto NO alcanza:
--   1. Las tablas de las migraciones 04, 05 y 06 nacerán con el mismo agujero.
--      Hay que repetir el revoke allí o, mejor, hacerlo una sola vez al final
--      sobre `all tables in schema public`.
--   2. Hay que revocar también los DEFAULT PRIVILEGES, o toda tabla de las
--      Fases 2 a 9 lo reintroduce:
--        alter default privileges for role postgres in schema public
--          revoke all on tables from anon, authenticated;
--        alter default privileges for role postgres in schema public
--          revoke all on sequences from anon, authenticated;
--      La migración propuesta en 01-RESEARCH.md §3.1 solo contempla `anon`,
--      porque se escribió con la medición vieja. `authenticated` con
--      INSERT/UPDATE/DELETE sobre todo rompería "el aseador no escribe
--      directo" y el guardarraíl 8.
--   3. NO poner `auto_expose_new_tables = false` en config.toml: eso arregla
--      local y deja la nube expuesta, que es peor que el problema. La defensa
--      tiene que viajar en las migraciones.
-- ===========================================================================

revoke all on table
  public.profiles,
  public.properties,
  public.property_secrets,
  public.room_types,
  public.checklist_tasks,
  public.property_rooms,
  public.missing_item_catalog,
  public.app_settings
from anon, authenticated;
