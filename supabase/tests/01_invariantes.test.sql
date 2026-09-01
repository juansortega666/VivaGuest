-- ============================================================================
-- 01_invariantes.test.sql — FIN-01, ASEO-07, fila inerte, máquina de estados
--
-- Todo se ejerce como `postgres`: aquí no se prueba autorización sino
-- invariantes de base. Si un invariante solo se sostiene porque la app se
-- comporta bien, no es un invariante.
--
-- Contrato de tipos: los montos son `bigint` de pesos enteros. El DDL de
-- ARCHITECTURE.md dice `numeric(12,2)` y está MAL (ver 01-RESEARCH.md §2.1):
-- gana `bigint`, y por eso todos los literales monetarios llevan `::bigint`.
-- ============================================================================

begin;
select plan(11);

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
-- Fixtures
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@vg.co');

insert into public.profiles (id, role, full_name, is_active, deactivated_at) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aseador', 'Aseadora A', true, null)
on conflict (id) do update
  set role           = excluded.role,
      full_name      = excluded.full_name,
      is_active      = excluded.is_active,
      deactivated_at = excluded.deactivated_at;

insert into public.properties
  (id, nombre, cluster, gestion_vivaguest, tarifa_huesped, pago_aseador, responsable_id) values
  ('11111111-1111-1111-1111-111111111111', 'Apto 101 (fixture)', 'Cluster Test', true,
   120000::bigint, 45000::bigint, null),
  -- P2: gestión externa. Sus aseos son filas inertes.
  ('22222222-2222-2222-2222-222222222222', 'Apto 202 (fixture)', 'Cluster Test', false,
   null, null, null),
  ('33333333-3333-3333-3333-333333333333', 'Apto 303 (fixture)', 'Cluster Test', true,
   100000::bigint, 40000::bigint, null),
  -- P4: gestionado, CON responsable y SIN tarifas. Aísla el CHECK de tarifas
  -- del CHECK de responsable en la aserción 11.
  ('44444444-4444-4444-4444-444444444444', 'Apto 404 sin tarifas', 'Cluster Test', true,
   null, null, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- calendar_feeds NO lleva columna `url`: la URL de exportacion iCal es una
-- credencial y vive en property_secrets.ical_url (decision bloqueada en
-- 01-CONTEXT.md). Este fixture solo existe para satisfacer la FK de
-- calendar_reservations; ninguna asercion de este archivo prueba el feed.
insert into public.calendar_feeds (id, property_id, provider) values
  ('ffffffff-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
   'airbnb');

insert into public.calendar_reservations
  (id, feed_id, property_id, uid, starts_on, ends_on, payload_hash) values
  ('ffffffff-2222-2222-2222-222222222222', 'ffffffff-1111-1111-1111-111111111111',
   '11111111-1111-1111-1111-111111111111', 'FIXTURE-R1@airbnb.com',
   public.today_bog() - 2, public.today_bog() + 2, 'hash-fixture-r1');

insert into public.cleanings
  (id, property_id, origin, scheduled_date, aseador_id) values
  ('99999999-9999-9999-9999-999999999999', '11111111-1111-1111-1111-111111111111',
   'manual', public.today_bog(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('77777777-7777-7777-7777-777777777777', '33333333-3333-3333-3333-333333333333',
   'manual', public.today_bog(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- ===========================================================================
-- FIN-01 — el snapshot financiero
-- ===========================================================================

-- 1  El trigger copia la tarifa vigente del apartamento al insertar el aseo.
select is((select c.tarifa_huesped from public.cleanings c
            where c.id = '99999999-9999-9999-9999-999999999999'),
  120000::bigint,
  'FIN-01 el trigger snapshotea la tarifa del apartamento al insertar el aseo');

-- Llevamos CL1 a un estado terminal recorriendo la máquina completa. No se
-- salta a 'completada' directo: 'pendiente' -> 'en_curso' -> 'completada' es la
-- única ruta legal, y estas dos transiciones son las que cuenta la aserción 10.
update public.cleanings
   set state = 'en_curso', confirmado_at = now(), started_at = now()
 where id = '99999999-9999-9999-9999-999999999999';
update public.cleanings
   set state = 'completada', finished_at = now()
 where id = '99999999-9999-9999-9999-999999999999';

-- 2  Subir la tarifa del apartamento NO reescribe el margen ya congelado.
update public.properties
   set tarifa_huesped = 999000::bigint, pago_aseador = 1::bigint
 where id = '11111111-1111-1111-1111-111111111111';
select is((select c.tarifa_huesped from public.cleanings c
            where c.id = '99999999-9999-9999-9999-999999999999'),
  120000::bigint,
  'FIN-01 editar la tarifa del apartamento NO altera el aseo ya completado');

-- 3  La que convierte el requisito en invariante de base: ni un UPDATE directo
--    sobre el aseo completado descongela la tarifa. El trigger reimpone
--    old.tarifa_huesped. Sin esta aserción, service_role o un admin distraído
--    reabren un mes ya cerrado.
update public.cleanings
   set tarifa_huesped = 1::bigint
 where id = '99999999-9999-9999-9999-999999999999';
select is((select c.tarifa_huesped from public.cleanings c
            where c.id = '99999999-9999-9999-9999-999999999999'),
  120000::bigint,
  'FIN-01 NEG un UPDATE directo sobre el aseo completado no descongela la tarifa');

-- ===========================================================================
-- ASEO-07 — un aseo activo por apartamento y fecha
-- ===========================================================================

-- 4  CL1 está 'completada', que sigue siendo un estado ACTIVO para el índice
--    parcial (solo 'cancelada' queda fuera).
select throws_ok(
  $q$insert into public.cleanings (property_id, origin, scheduled_date)
     values ('11111111-1111-1111-1111-111111111111', 'manual', public.today_bog())$q$,
  '23505', null,
  'ASEO-07 un segundo aseo activo para el mismo apartamento y fecha falla en la base');

-- 5  Cancelar libera el slot. Se cancela CL3 y no CL1 porque 'completada' es un
--    estado terminal y no tiene transición de salida (ver aserción 9).
update public.cleanings
   set state = 'cancelada', cancelled_at = now()
 where id = '77777777-7777-7777-7777-777777777777';
select lives_ok(
  $q$insert into public.cleanings (property_id, origin, scheduled_date)
     values ('33333333-3333-3333-3333-333333333333', 'manual', public.today_bog())$q$,
  'ASEO-07 cancelar el aseo libera el slot del mismo apartamento y día');

-- 6  La fila informativa (state IS NULL) SÍ participa del índice parcial,
--    porque `NULL IS DISTINCT FROM 'cancelada'` es TRUE. Es exactamente lo que
--    se pierde si el índice se escribe con `<>` en vez de `IS DISTINCT FROM`.
insert into public.cleanings (property_id, origin, scheduled_date)
  values ('22222222-2222-2222-2222-222222222222', 'manual', public.today_bog() + 1);
select throws_ok(
  $q$insert into public.cleanings (property_id, origin, scheduled_date)
     values ('22222222-2222-2222-2222-222222222222', 'manual', public.today_bog() + 1)$q$,
  '23505', null,
  'ASEO-07 dos filas informativas (state IS NULL) para el mismo apto y fecha también fallan');

-- 7  Idempotencia del pipeline iCal: una reserva genera a lo sumo un aseo vivo,
--    aunque el feed se resincronice o el apartamento cambie de fecha.
insert into public.cleanings (property_id, origin, scheduled_date, reservation_id)
  values ('11111111-1111-1111-1111-111111111111', 'ical', public.today_bog() + 2,
          'ffffffff-2222-2222-2222-222222222222');
select throws_ok(
  $q$insert into public.cleanings (property_id, origin, scheduled_date, reservation_id)
     values ('33333333-3333-3333-3333-333333333333', 'ical', public.today_bog() + 3,
             'ffffffff-2222-2222-2222-222222222222')$q$,
  '23505', null,
  'ASEO-07 idempotencia: dos aseos vivos con el mismo reservation_id fallan');

-- ===========================================================================
-- GESTIÓN EXTERNA — la fila es inerte, no por convención sino por CHECK
-- ===========================================================================

-- 8
select throws_ok(
  $q$insert into public.cleanings (property_id, origin, scheduled_date, aseador_id)
     values ('22222222-2222-2222-2222-222222222222', 'manual', public.today_bog() + 3,
             'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$q$,
  '23514', null,
  'gestión externa: asignar aseador a una unidad no gestionada viola cl_unmanaged_is_inert');

-- ===========================================================================
-- MÁQUINA DE ESTADOS
-- ===========================================================================

-- 9  Desde un estado terminal no hay transición de salida. Se pone
--    finished_at = null para que la forma de 'en_curso' sea válida y el ÚNICO
--    rechazo posible sea el de la máquina de estados (P0001), no un CHECK
--    (23514). Es decir: la máquina se implementa como trigger BEFORE.
select throws_ok(
  $q$update public.cleanings
       set state = 'en_curso', finished_at = null
     where id = '99999999-9999-9999-9999-999999999999'$q$,
  'P0001', null,
  'máquina de estados: NEG no se sale de completada hacia en_curso');

-- 10  Log de auditoría de transiciones: exactamente las dos que recorrió CL1.
--     El insert del aseo no cuenta como transición; el intento fallido de la
--     aserción 9 tampoco deja rastro.
select is((select count(*) from public.cleaning_state_transitions t
            where t.cleaning_id = '99999999-9999-9999-9999-999999999999')::int, 2,
  'máquina de estados: pendiente -> en_curso -> completada deja 2 transiciones registradas');

-- ===========================================================================
-- ACTIVACIÓN DE APARTAMENTO
-- ===========================================================================

-- 11  P4 tiene responsable pero no tarifas, así que el único CHECK que puede
--     rechazar la activación es props_active_requires_rates.
select throws_ok(
  $q$update public.properties set is_active = true
      where id = '44444444-4444-4444-4444-444444444444'$q$,
  '23514', null,
  'un apartamento gestionado no se activa sin tarifa al huésped y pago al aseador');

select * from finish();
rollback;
