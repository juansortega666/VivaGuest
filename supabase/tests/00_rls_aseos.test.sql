-- ============================================================================
-- 00_rls_aseos.test.sql — PLAT-03, PLAT-05, PLAT-06
--
-- Contrato ejecutable de las policies de RLS. Escrito en Wave 0, ANTES del
-- schema: los planes 01-03 a 01-09 son los que lo ponen en verde.
--
-- Mecánica (verificada en 01-RESEARCH.md §5.3, no es estilo):
--   * El rol NO tiene grant sobre la tabla  -> throws_ok('...', '42501')
--     `is_empty` levantaría la excepción dentro de su FOR ... OVER EXECUTE,
--     abortaría la transacción y pgTAP reportaría "Bad plan" en vez de un
--     `not ok` legible.
--   * El rol SÍ tiene grant y la RLS filtra filas -> is_empty(...)
--   * Toda escritura denegada se acompaña de una verificación, como postgres,
--     de que la fila objetivo quedó intacta ("Matching no rows is not proof
--     on its own", doc oficial de Supabase).
--
-- Los tests corren contra la base CON el seed cargado (`supabase test db` no
-- resetea nada), así que la limpieza va DENTRO de la transacción: el rollback
-- final la restituye por completo.
-- ============================================================================

begin;
select plan(16);

-- ---------------------------------------------------------------------------
-- Limpieza del seed, en orden inverso de FK. El rollback la deshace.
-- ---------------------------------------------------------------------------
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
-- Fixtures. UUID fijos; los nombres de tabla y columna son el CONTRATO que
-- deben cumplir las migraciones de los planes 01-03 a 01-08.
-- ---------------------------------------------------------------------------

-- auth.users solo exige `id`; `email` es nullable.
insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@vg.co'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@vg.co'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'c@vg.co'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'admin@vg.co');

-- Upsert y no insert: si existe el trigger `on auth.users insert` que
-- materializa profiles (ARCHITECTURE.md §Identidad y roles), un insert simple
-- chocaría con 23505 y mataría el archivo entero.
insert into public.profiles (id, role, full_name, is_active, deactivated_at) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aseador', 'Aseadora A',             true,  null),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aseador', 'Aseadora B',             true,  null),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'aseador', 'Aseadora C DESACTIVADA', false, now()),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'admin',   'Admin',                  true,  null)
on conflict (id) do update
  set role           = excluded.role,
      full_name      = excluded.full_name,
      is_active      = excluded.is_active,
      deactivated_at = excluded.deactivated_at;

insert into public.properties
  (id, nombre, cluster, gestion_vivaguest, tarifa_huesped, pago_aseador) values
  -- Montos en bigint de pesos enteros (01-RESEARCH.md §2.1): el `numeric(12,2)`
  -- del DDL de ARCHITECTURE.md está mal y no debe copiarse.
  ('11111111-1111-1111-1111-111111111111', 'Apto 101 (fixture)', 'Cluster Test', true,
   120000::bigint, 45000::bigint),
  -- P2 es unidad informativa: gestión externa, fila inerte.
  ('22222222-2222-2222-2222-222222222222', 'Apto 202 (fixture)', 'Cluster Test', false,
   null, null),
  ('33333333-3333-3333-3333-333333333333', 'Apto 303 (fixture)', 'Cluster Test', true,
   100000::bigint, 40000::bigint);

-- La URL de exportación iCal es una credencial, igual que el código de acceso:
-- vive aquí, y esta tabla no recibe NINGÚN grant (ver aserción 10).
insert into public.property_secrets (property_id, codigo_acceso, ical_url) values
  ('11111111-1111-1111-1111-111111111111', '8842',
   'https://www.airbnb.com/calendar/ical/SECRETO-P1.ics'),
  ('33333333-3333-3333-3333-333333333333', '1199',
   'https://www.airbnb.com/calendar/ical/SECRETO-P3.ics');

insert into public.cleanings
  (id, property_id, origin, scheduled_date, aseador_id, instrucciones) values
  -- CL1: hoy. Visible Y desbloqueable.
  ('99999999-9999-9999-9999-999999999999', '11111111-1111-1111-1111-111111111111',
   'manual', public.today_bog(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Dejar toallas extra'),
  -- CL3: dentro de 5 días. Visible por la ventana -1..+7 de my_property_ids(),
  -- pero NO desbloqueable por la ventana hoy..mañana de reveal_access_code().
  ('77777777-7777-7777-7777-777777777777', '33333333-3333-3333-3333-333333333333',
   'manual', public.today_bog() + 5, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null);

-- Helper de autenticación. Vive dentro de la transacción del test, así que el
-- rollback lo borra y no ensucia el schema.
create or replace function public.tests_auth(p uuid) returns void
language plpgsql as $fn$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p::text, 'role', 'authenticated')::text, true);
end $fn$;

-- ===========================================================================
-- POSITIVOS — aseadora A, activa, con dos aseos asignados
-- ===========================================================================
select public.tests_auth('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- 1
select is((select count(*) from public.cleanings)::int, 2,
  'PLAT-03 A ve exactamente sus 2 aseos (la policy de cleanings es plana)');

-- 2
select is((select c.instrucciones from public.cleanings c
            where c.id = '99999999-9999-9999-9999-999999999999'),
  'Dejar toallas extra',
  'PLAT-06 A ve las instrucciones de su propio aseo');

-- 3
select is((select count(*) from public.properties)::int, 2,
  'PLAT-03 A ve solo P1 y P3, los apartamentos de su trabajo vivo (my_property_ids)');

-- ===========================================================================
-- NEGATIVOS — aseadora B, activa, sin nada asignado
-- ===========================================================================
select public.tests_auth('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

-- 4
select is_empty('select * from public.cleanings',
  'PLAT-03 NEG B no ve ningún aseo ajeno');

-- 5
select is_empty('select * from public.properties',
  'PLAT-03 NEG B no ve ningún apartamento ajeno');

-- 6  Fuga por embed: PostgREST resuelve ?select=*,properties(*) como un join y
--    es la policy de properties la que decide. Sin esta aserción, una policy
--    permisiva en properties le daría a B las tarifas y la dirección de los 39
--    apartamentos.
select is_empty(
  'select c.*, p.* from public.cleanings c join public.properties p on p.id = c.property_id',
  'PLAT-03 NEG el join cleanings x properties no filtra nada para B (fuga por embed)');

-- 7
select throws_ok(
  'select public.reveal_access_code(''99999999-9999-9999-9999-999999999999'')',
  '42501', null,
  'PLAT-05 NEG B no puede revelar el código del aseo de A');

-- ===========================================================================
-- NEGATIVOS — aseadora C, DESACTIVADA con un access token todavía vivo.
-- Es la aserción que prueba la decisión bloqueada de "cero claims del JWT":
-- si el rol viviera en el claim, C seguiría viendo filas hasta que expire.
-- ===========================================================================
select public.tests_auth('cccccccc-cccc-cccc-cccc-cccccccccccc');

-- 8
select is_empty('select * from public.cleanings',
  'PLAT-03 NEG aseadora desactivada con token vivo no ve ningún aseo');

-- 9
select is_empty('select * from public.properties',
  'PLAT-03 NEG aseadora desactivada con token vivo no ve ningún apartamento');

-- ===========================================================================
-- SECRETOS — property_secrets no recibe ningún grant, así que el error es de
-- privilegio (42501), no de RLS. Ni siquiera el aseador ASIGNADO la lee.
-- ===========================================================================
select public.tests_auth('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- 10
select throws_ok('select * from public.property_secrets', '42501', null,
  'PLAT-05 NEG ni el aseador asignado lee property_secrets por SELECT directo');

-- ===========================================================================
-- RPC CON VENTANA Y AUDITORÍA
-- ===========================================================================

-- 11
select results_eq(
  $q$select codigo_acceso from public.reveal_access_code('99999999-9999-9999-9999-999999999999')$q$,
  $q$values ('8842'::text)$q$,
  'PLAT-05 A obtiene el código de su aseo de hoy por RPC');

-- 12  La auditoría ocurre en la misma transacción que la lectura: no hay
--     lectura de código sin rastro.
select set_config('role', 'postgres', true);
select is((select count(*) from public.access_code_reads)::int, 1,
  'PLAT-05 la lectura quedó auditada en access_code_reads');

-- 13  Dos ventanas distintas: my_property_ids() es -1..+7 (P3 SÍ es visible,
--     aserción 3) y reveal_access_code() es hoy..mañana (CL3 NO se desbloquea).
select public.tests_auth('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select throws_ok(
  'select public.reveal_access_code(''77777777-7777-7777-7777-777777777777'')',
  '42501', null,
  'PLAT-05 NEG un aseo a 5 días es visible pero NO desbloqueable');

-- ===========================================================================
-- ESCRITURA DIRECTA — el aseador no tiene DML sobre cleanings; sus mutaciones
-- pasan por RPC SECURITY DEFINER.
-- ===========================================================================

-- 14
select throws_ok(
  'update public.cleanings set state = ''en_curso''
     where id = ''99999999-9999-9999-9999-999999999999''',
  '42501', null,
  'PLAT-03 NEG el aseador no puede hacer UPDATE directo sobre cleanings');

-- Regla (c) de §5.3: "Matching no rows is not proof on its own." Verificamos
-- como postgres (exento de RLS) que la fila objetivo NO cambió. Va como guard
-- y no como aserción para no alterar el conteo de plan(16); si dispara, el
-- archivo aborta ruidosamente, que es lo correcto para un fallo de esta clase.
select set_config('role', 'postgres', true);
do $guard$
begin
  if (select c.state::text from public.cleanings c
        where c.id = '99999999-9999-9999-9999-999999999999') is distinct from 'pendiente' then
    raise exception
      'regla (c): el UPDATE denegado SÍ modificó la fila; el 42501 es un falso negativo';
  end if;
end $guard$;

-- ===========================================================================
-- ADMIN
-- ===========================================================================
select public.tests_auth('dddddddd-dddd-dddd-dddd-dddddddddddd');

-- 15
select is((select count(*) from public.cleanings)::int, 2,
  'PLAT-03 el admin ve los 2 aseos');

-- 16  Contraste con la aserción 10: access_code_reads SÍ tiene grant select
--     (el admin la necesita) y su policy es admin-only, así que para el
--     aseador la RLS filtra por fila y la aserción correcta es is_empty.
--     CONTRATO: la migración de grants debe otorgar select sobre
--     access_code_reads a authenticated y darle una policy solo-admin.
select public.tests_auth('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select is_empty('select * from public.access_code_reads',
  'PLAT-05 NEG el aseador no lee la bitácora de códigos (grant sí, RLS no)');

select * from finish();
rollback;
