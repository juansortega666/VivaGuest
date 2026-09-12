-- ============================================================================
-- 10_reportes.test.sql — el contrato de los TRES reportes del aseador
--
-- NACE EN ROJO. Wave 0 del plan 06-02; lo pone en verde la migración 19.
--
-- ---------------------------------------------------------------------------
-- LO QUE ESTE ARCHIVO CIERRA, Y LLEVA ABIERTO DESDE LA FASE 5:
--
--   `05-UI-SPEC.md` §10.1 registró que `dano_reportado` y `faltantes_reportados`
--   son dos valores del enum de notificación que **todavía no los escribía
--   nadie**, aunque el criterio 3 del ROADMAP de la Fase 5 los exige. Se
--   probaron entonces contra fila insertada a mano. Aquí por fin tienen emisor.
--
-- ---------------------------------------------------------------------------
-- Y UNA PROPIEDAD QUE SALE GRATIS Y CONVIENE ENTENDER:
--
--   Ningún RPC de este archivo invoca el push. El trigger `AFTER INSERT` de la
--   migración 17 dispara solo. Era exactamente el argumento de D-04 de la
--   Fase 5: el disparo va en el trigger y no dentro de cada RPC, así que **cada
--   emisor futuro queda cubierto por construcción, sin que nadie tenga que
--   acordarse**. Este archivo es la primera vez que esa promesa se cobra, y la
--   aserción 16 es la que la mide.
-- ============================================================================

begin;
select plan(19);

delete from public.cleaning_photos;
delete from public.cleaning_room_skips;
delete from public.cleaning_checklist_items;
delete from public.cleaning_state_transitions;
delete from public.access_code_reads;
delete from public.notifications;
delete from public.missing_item_lines;
delete from public.missing_item_reports;
delete from public.expenses;
delete from public.damages;
delete from public.cleanings;
delete from public.property_rooms;
delete from public.checklist_tasks;
delete from public.room_types;
delete from public.property_secrets;
delete from public.properties;
delete from public.profiles;
delete from auth.users;


create function pg_temp.intento_como(p_uid uuid, p_consulta text) returns text
language plpgsql as $fn$
declare
  v_estado text;
begin
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
    execute p_consulta;
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', '', true);
    return 'sin_error';
  exception when others then
    get stacked diagnostics v_estado = returned_sqlstate;
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', '', true);
    return v_estado;
  end;
end;
$fn$;

/** Cuantas notificaciones de un tipo hay para ese aseo. */
create function pg_temp.notis(p_cleaning uuid, p_tipo text) returns int
language sql stable as $fn$
  select count(*)::int
    from public.notifications n
   where n.cleaning_id = p_cleaning
     and n.type::text = p_tipo;
$fn$;


-- ---------------------------------------------------------------------------
-- SIEMBRA. DOS admins activos a propósito: es lo que hace medible que la
-- notificación salga para CADA UNO y no solo para el primero, que es el error
-- fácil de un `select ... limit 1` mal puesto.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('ad100000-0000-0000-0000-000000000001', 'admin10-uno@vg.co'),
  ('ad100000-0000-0000-0000-000000000002', 'admin10-dos@vg.co'),
  ('ad100000-0000-0000-0000-000000000003', 'admin10-baja@vg.co'),
  ('a1000000-0000-0000-0000-00000000000a', 'aseadora10-a@vg.co'),
  ('a1000000-0000-0000-0000-00000000000b', 'aseadora10-b@vg.co');

-- `deactivated_at` no es opcional cuando `is_active` es falso: lo impone
-- `profiles_deactivation_coherent`. Medido al escribir este archivo.
insert into public.profiles (id, role, full_name, is_active, deactivated_at) values
  ('ad100000-0000-0000-0000-000000000001', 'admin',   'Admin 10 Uno',      true,  null),
  ('ad100000-0000-0000-0000-000000000002', 'admin',   'Admin 10 Dos',      true,  null),
  ('ad100000-0000-0000-0000-000000000003', 'admin',   'Admin 10 DE BAJA',  false, now()),
  ('a1000000-0000-0000-0000-00000000000a', 'aseador', 'Aseadora 10A',      true,  null),
  ('a1000000-0000-0000-0000-00000000000b', 'aseador', 'Aseadora 10B',      true,  null)
on conflict (id) do update
  set role           = excluded.role,
      full_name      = excluded.full_name,
      is_active      = excluded.is_active,
      deactivated_at = excluded.deactivated_at;

insert into public.properties
  (id, nombre, cluster, gestion_vivaguest, hora_limite,
   tarifa_huesped, pago_aseador, responsable_id, is_active) values
  ('b1000000-0000-0000-0000-00000000000a', 'Apto 10 (fixture)', 'Cluster 10',
   true, '11:30', 120000::bigint, 45000::bigint,
   'a1000000-0000-0000-0000-00000000000a', true);

insert into public.cleanings
  (id, property_id, scheduled_date, tipo, origin, aseador_id, confirmado_at, state, started_at) values
  -- R1: en curso de A, es donde se reporta
  ('f1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-00000000000a',
   public.today_bog(), 'normal', 'manual',
   'a1000000-0000-0000-0000-00000000000a', now(), 'en_curso', now()),
  -- R2: pendiente de A, para el caso "no esta en curso"
  ('f1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-00000000000a',
   public.today_bog() + 1, 'normal', 'manual',
   'a1000000-0000-0000-0000-00000000000a', now(), 'pendiente', null),
  -- R3: en curso de B, para el caso "aseo ajeno"
  ('f1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-00000000000a',
   public.today_bog() + 2, 'normal', 'manual',
   'a1000000-0000-0000-0000-00000000000b', now(), 'en_curso', now());


-- ═══════════════════════════════════════════════════════════════════════════
-- A. report_damage (5 aserciones)
-- ═══════════════════════════════════════════════════════════════════════════

select is(
  pg_temp.intento_como('a1000000-0000-0000-0000-00000000000a',
    $q$select public.report_damage('f1000000-0000-0000-0000-000000000001'::uuid,
                                   'Se rompio la ducha')$q$),
  'sin_error',
  'report_damage con descripcion valida funciona');

select is(
  (select count(*)::int from public.damages
    where cleaning_id = 'f1000000-0000-0000-0000-000000000001'),
  1,
  'report_damage dejo exactamente una fila en damages');

-- 3. LA QUE IMPORTA: una notificacion por CADA admin activo. Hay dos activos y
--    uno de baja, asi que el numero correcto es 2. Un `limit 1` mal puesto
--    daria 1, y un olvido del filtro de actividad daria 3.
select is(
  pg_temp.notis('f1000000-0000-0000-0000-000000000001', 'dano_reportado'),
  2,
  'report_damage notifica a CADA admin activo: dos activos, uno de baja, dos filas');

select is(
  pg_temp.intento_como('a1000000-0000-0000-0000-00000000000b',
    $q$select public.report_damage('f1000000-0000-0000-0000-000000000001'::uuid, 'Ajeno')$q$),
  '42501',
  'report_damage sobre un aseo AJENO devuelve 42501');

select is(
  pg_temp.intento_como('a1000000-0000-0000-0000-00000000000a',
    $q$select public.report_damage('f1000000-0000-0000-0000-000000000002'::uuid, 'No en curso')$q$),
  '42501',
  'report_damage sobre un aseo que no esta en curso devuelve el MISMO 42501');


-- ═══════════════════════════════════════════════════════════════════════════
-- B. report_expense (5 aserciones)
-- ═══════════════════════════════════════════════════════════════════════════

select is(
  pg_temp.intento_como('a1000000-0000-0000-0000-00000000000a',
    $q$select public.report_expense('f1000000-0000-0000-0000-000000000001'::uuid,
                                    'Trapeador', 15000::bigint, 'MXN')$q$),
  'sin_error',
  'report_expense con monto positivo y moneda explicita funciona');

select is(
  (select moneda from public.expenses
    where cleaning_id = 'f1000000-0000-0000-0000-000000000001' and concepto = 'Trapeador'),
  'MXN',
  'report_expense guarda la moneda que se le pasa, no una fija');

-- 8. Monto cero. Lo rechaza el `check (monto > 0)` de la tabla, y la asercion
--    existe porque un gasto sin monto es justo lo que la Fase 7 no puede sumar.
select is(
  pg_temp.intento_como('a1000000-0000-0000-0000-00000000000a',
    $q$select public.report_expense('f1000000-0000-0000-0000-000000000001'::uuid,
                                    'Nada', 0::bigint, 'COP')$q$),
  '23514',
  'report_expense con monto CERO lo rechaza el CHECK de la tabla');

select is(
  pg_temp.intento_como('a1000000-0000-0000-0000-00000000000a',
    $q$select public.report_expense('f1000000-0000-0000-0000-000000000001'::uuid,
                                    'Negativo', -500::bigint, 'COP')$q$),
  '23514',
  'report_expense con monto NEGATIVO lo rechaza el CHECK de la tabla');

select is(
  pg_temp.notis('f1000000-0000-0000-0000-000000000001', 'gasto_reportado'),
  2,
  'report_expense notifica a los dos admins activos');


-- ═══════════════════════════════════════════════════════════════════════════
-- C. report_missing_items (5 aserciones)
-- ═══════════════════════════════════════════════════════════════════════════

select is(
  pg_temp.intento_como('a1000000-0000-0000-0000-00000000000a',
    $q$select public.report_missing_items('f1000000-0000-0000-0000-000000000001'::uuid,
                                          array['Papel higienico', 'Jabon de manos'])$q$),
  'sin_error',
  'report_missing_items con dos items funciona');

-- 12. UN reporte y N lineas. El error facil es crear un reporte por item.
select is(
  (select count(*)::int from public.missing_item_reports
    where cleaning_id = 'f1000000-0000-0000-0000-000000000001')
  || '/' ||
  (select count(*)::int from public.missing_item_lines l
    join public.missing_item_reports r on r.id = l.report_id
   where r.cleaning_id = 'f1000000-0000-0000-0000-000000000001'),
  '1/2',
  'report_missing_items crea UN reporte y DOS lineas, no dos reportes');

-- 13. Las lineas van por la rama de texto libre: catalog_item_id nulo y
--     nombre_snapshot igual al texto. Es la simplificacion de D-07, y la rama
--     de catalogo se queda en el schema sin usar a proposito.
select is(
  (select string_agg(l.nombre_snapshot || ':' || (l.catalog_item_id is null)::text,
                     ' + ' order by l.nombre_snapshot)
     from public.missing_item_lines l
     join public.missing_item_reports r on r.id = l.report_id
    where r.cleaning_id = 'f1000000-0000-0000-0000-000000000001'),
  'Jabon de manos:true + Papel higienico:true',
  'las lineas van por la rama de texto libre, con catalog_item_id nulo');

select is(
  pg_temp.intento_como('a1000000-0000-0000-0000-00000000000a',
    $q$select public.report_missing_items('f1000000-0000-0000-0000-000000000001'::uuid,
                                          array[]::text[])$q$),
  'P0001',
  'report_missing_items con un arreglo VACIO lanza P0001: no es un reporte');

select is(
  pg_temp.notis('f1000000-0000-0000-0000-000000000001', 'faltantes_reportados'),
  2,
  'report_missing_items notifica a los dos admins activos');


-- ═══════════════════════════════════════════════════════════════════════════
-- D. EL PUSH, SIN QUE NINGUN RPC LO TOQUE (2 aserciones)
-- ═══════════════════════════════════════════════════════════════════════════

-- 16. Las seis notificaciones quedan en `pendiente`, que es lo que el drenaje
--     de la Fase 5 recoge. NINGUN RPC de este archivo invoca el push: lo hace
--     el trigger de la migracion 17. Es la promesa de D-04 cobrandose.
select is(
  (select count(*)::int from public.notifications n
    where n.cleaning_id = 'f1000000-0000-0000-0000-000000000001'
      and n.push_status = 'pendiente'),
  6,
  'las seis notificaciones quedan en pendiente: el trigger las encolo sin que ningun RPC lo pidiera');

-- 17. Y las tres CLASES tienen dedupe_key distintas entre si. Es el caso literal
--     que D-05 de la Fase 5 existe para evitar: la clave de colapso del push se
--     deriva de `notifications.type`, asi que un dano no puede borrar un
--     faltante del mismo aseo en la bandeja del telefono.
select is(
  (select count(distinct n.dedupe_key)::int
     from public.notifications n
    where n.cleaning_id = 'f1000000-0000-0000-0000-000000000001'
      and n.recipient_id = 'ad100000-0000-0000-0000-000000000001'),
  3,
  'las tres clases de reporte tienen dedupe_key DISTINTAS para el mismo admin y el mismo aseo');


-- ═══════════════════════════════════════════════════════════════════════════
-- E. NO REGRESION (2 aserciones)
-- ═══════════════════════════════════════════════════════════════════════════

select is_empty($q$
  select p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('report_damage', 'report_expense', 'report_missing_items')
     and has_function_privilege('anon', p.oid, 'execute')
$q$, 'los tres RPC nuevos no son ejecutables por anon');

-- 19. Lo del plan 06-01 sigue funcionando: dos migraciones seguidas sobre el
--     mismo dominio es donde aparece la regresion.
select is(
  pg_temp.intento_como('a1000000-0000-0000-0000-00000000000a',
    $q$select public.finish_cleaning('f1000000-0000-0000-0000-000000000001'::uuid)$q$),
  'sin_error',
  'no regresion: finish_cleaning del plan 06-01 sigue sin bloquear');


select * from finish();
rollback;
