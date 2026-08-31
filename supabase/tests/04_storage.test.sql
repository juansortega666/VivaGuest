-- ============================================================================
-- 04_storage.test.sql — policies de storage.objects sobre el bucket `evidencia`
--
-- Convención de ruta: {cleaning_id}/{kind}/{uuid}.{ext}. El cleaning_id va
-- PRIMERO para que `(storage.foldername(name))[1]` lo devuelva directo y la
-- policy sea barata. La comparación se hace como `text`, sin castear el
-- segmento a uuid: un path malformado debe dar deny, no un error de tipo
-- dentro de la policy.
--
-- Tres hechos del entorno, medidos contra la base local durante este plan.
-- Cambian qué aserción es la correcta en cada caso:
--
-- 1) A diferencia de las tablas de `public`, Supabase SÍ otorga DELETE, INSERT,
--    SELECT y UPDATE sobre storage.objects a `authenticated` y a `anon` por
--    defecto (ACL: authenticated=arwdDxtm/supabase_storage_admin).
--
-- 2) Ese grant NO se puede revocar desde una migración. El grantor es
--    `supabase_storage_admin`; `postgres` no lo revoca (es un no-op silencioso:
--    has_table_privilege sigue devolviendo true), `revoke ... granted by`
--    responde "grantor must be current user", y `set role supabase_storage_admin`
--    responde "permission denied to set role". Es decir: la inmutabilidad de la
--    evidencia NO puede apoyarse en un revoke. Se apoya en la ausencia de
--    policies de UPDATE y DELETE para el aseador.
--
-- 3) `storage.objects` tiene un trigger BEFORE DELETE FOR EACH STATEMENT,
--    `storage.protect_delete()`, que rechaza TODO borrado directo por SQL
--    ("Direct deletion from storage tables is not allowed") **con errcode
--    42501**, salvo que el GUC `storage.allow_delete_query` valga 'true'.
--    Consecuencia crítica: `throws_ok(delete ..., '42501')` sería un FALSO
--    VERDE — pasaría para cualquier rol, incluido el admin, sin probar nada
--    sobre el aseador. Por eso la aserción 5 levanta el GUC para aislar la
--    capa que sí se está probando (la RLS) y afirma 0 filas afectadas, más un
--    guard como postgres de que el objeto sigue existiendo.
-- ============================================================================

begin;
select plan(5);

-- ---------------------------------------------------------------------------
-- Limpieza dentro de la transacción. `storage.buckets` NO se toca: el bucket
-- lo crea la migración y la aserción 1 lo verifica. El GUC vuelve a 'false'
-- de inmediato para que las aserciones corran en condiciones de producción.
-- ---------------------------------------------------------------------------
select set_config('storage.allow_delete_query', 'true', true);
delete from storage.objects where bucket_id = 'evidencia';
select set_config('storage.allow_delete_query', 'false', true);

delete from public.cleaning_state_transitions;
delete from public.access_code_reads;
delete from public.cleanings;
delete from public.calendar_reservations;
delete from public.calendar_feeds;
delete from public.property_secrets;
delete from public.properties;
delete from public.profiles;
delete from auth.users;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@vg.co'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@vg.co');

insert into public.profiles (id, role, full_name, is_active, deactivated_at) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aseador', 'Aseadora A', true, null),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aseador', 'Aseadora B', true, null)
on conflict (id) do update
  set role           = excluded.role,
      full_name      = excluded.full_name,
      is_active      = excluded.is_active,
      deactivated_at = excluded.deactivated_at;

insert into public.properties
  (id, nombre, cluster, gestion_vivaguest, tarifa_huesped, pago_aseador) values
  ('11111111-1111-1111-1111-111111111111', 'Apto 101 (fixture)', 'Cluster Test', true,
   120000::bigint, 45000::bigint),
  ('33333333-3333-3333-3333-333333333333', 'Apto 303 (fixture)', 'Cluster Test', true,
   100000::bigint, 40000::bigint);

insert into public.cleanings
  (id, property_id, origin, scheduled_date, aseador_id) values
  -- CL1: de A. Se lleva a 'en_curso', que es la ventana de ESCRITURA
  -- (my_writable_cleaning_ids), más estrecha que la de lectura.
  ('99999999-9999-9999-9999-999999999999', '11111111-1111-1111-1111-111111111111',
   'manual', public.today_bog(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  -- CL2: de B. Su evidencia es la que A no debe poder leer.
  ('88888888-8888-8888-8888-888888888888', '33333333-3333-3333-3333-333333333333',
   'manual', public.today_bog(), 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

update public.cleanings
   set state = 'en_curso', confirmado_at = now(), started_at = now()
 where id = '99999999-9999-9999-9999-999999999999';

-- Evidencia ajena, sembrada como postgres (exento de RLS).
insert into storage.objects (bucket_id, name) values
  ('evidencia', '88888888-8888-8888-8888-888888888888/checklist/ajena.webp');

create or replace function public.tests_auth(p uuid) returns void
language plpgsql as $fn$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p::text, 'role', 'authenticated')::text, true);
end $fn$;

-- ===========================================================================

-- 1  El bucket nunca es público. Con `public = true` cualquiera con la ruta ve
--    la foto sin firmar nada, y las policies de abajo dejan de importar.
select is((select b."public" from storage.buckets b where b.id = 'evidencia'), false,
  'PLAT-05 el bucket evidencia existe y es privado');

-- 2  B tiene el grant de INSERT sobre storage.objects (hecho 1), así que el
--    rechazo viene del WITH CHECK de la policy: "new row violates row-level
--    security policy". Sin grant sería 42501 igual, pero por otra razón; aquí
--    el 42501 sí prueba que la policy discrimina por aseo.
select public.tests_auth('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select throws_ok($q$
  insert into storage.objects (bucket_id, name)
  values ('evidencia', '99999999-9999-9999-9999-999999999999/checklist/de-b.webp')
$q$, '42501', null,
  'PLAT-05 NEG B no puede subir evidencia a la carpeta de un aseo ajeno');

-- 3  A, asignada y con el aseo EN CURSO, sí puede.
select public.tests_auth('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select lives_ok($q$
  insert into storage.objects (bucket_id, name)
  values ('evidencia', '99999999-9999-9999-9999-999999999999/checklist/de-a.webp')
$q$, 'PLAT-05 la aseadora asignada sube evidencia mientras el aseo está en curso');

-- 4  Lectura ajena: hay grant de SELECT, así que la RLS filtra filas y la
--    aserción correcta es is_empty, no throws_ok.
select is_empty($q$
  select o.name from storage.objects o
   where o.name like '88888888-8888-8888-8888-888888888888/%'
$q$, 'PLAT-05 NEG A no lee la evidencia de un aseo ajeno');

-- 5  La evidencia es inmutable. Se levanta storage.allow_delete_query para
--    apartar el trigger protect_delete() (hecho 3) y dejar que decida SOLO la
--    RLS, que es la capa que la Storage API ejerce con el JWT del aseador.
--    Sin policy de DELETE que la alcance, el borrado afecta 0 filas.
select set_config('storage.allow_delete_query', 'true', true);
select public.tests_auth('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select is_empty($q$
  delete from storage.objects
   where name = '99999999-9999-9999-9999-999999999999/checklist/de-a.webp'
  returning name
$q$, 'PLAT-05 NEG ninguna policy de DELETE alcanza al aseador: la evidencia es inmutable');

-- Regla (c) de 01-RESEARCH.md §5.3: "Matching no rows is not proof on its own."
-- Un DELETE puede afectar 0 filas visibles y aun así haber borrado. Verificamos
-- como postgres (exento de RLS) que el objeto sigue ahí. Va como guard y no
-- como aserción para no alterar el conteo de plan(5); si dispara, el archivo
-- aborta ruidosamente, que es lo correcto para un fallo de esta clase.
select set_config('role', 'postgres', true);
select set_config('storage.allow_delete_query', 'false', true);
do $guard$
begin
  if not exists (select 1 from storage.objects o
                  where o.name = '99999999-9999-9999-9999-999999999999/checklist/de-a.webp') then
    raise exception
      'regla (c): el DELETE afectó 0 filas visibles pero SÍ borró el objeto';
  end if;
end $guard$;

select * from finish();
rollback;
