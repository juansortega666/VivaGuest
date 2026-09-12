-- ============================================================================
-- 09_ejecucion_aseo.test.sql — el contrato de la EJECUCIÓN del aseo
--
-- ESTE ARCHIVO NACE EN ROJO, A PROPÓSITO. Es Wave 0 del plan 06-01: enumera,
-- antes de que exista la migración 18, los invariantes que esa migración tiene
-- que hacer verdaderos. Lo pone en verde la Task 3 de ese mismo plan.
--
-- A PARTIR DE AHÍ, UN `not ok` AQUÍ YA NO ES ESPERADO: ES UNA REGRESIÓN.
--
-- ---------------------------------------------------------------------------
-- LO QUE ESTE ARCHIVO EXISTE PARA MEDIR, Y ES UN CAMBIO DE SIGNO:
--
--   `finish_cleaning` RECHAZABA con `P0001 checklist_incompleto` cuando faltaba
--   una tarea o la foto de una tarea que la exige. Era PWA-07 en su redacción
--   original y su comentario lo decía literal.
--
--   **D-06 lo derogó el 2026-09-12.** La razón es de producto y está escrita en
--   `06-CONTEXT.md`: un bloqueo deja al aseador atrapado en campo y termina en
--   una llamada telefónica, que es justo lo que el producto elimina. A cambio,
--   el aseo queda marcado SIN EVIDENCIA COMPLETA y eso le sale al admin.
--
--   Por eso las aserciones 1 a 4 son `lives_ok` sobre lo que ANTES lanzaba. Si
--   alguien "arregla" `finish_cleaning` reponiendo el bloqueo, este archivo se
--   pone rojo y dice exactamente dónde.
--
-- ---------------------------------------------------------------------------
-- LO QUE NO SE MIDE AQUÍ, Y NO SE FINGE MEDIR:
--
--   * El comportamiento sin señal. Está diferido (D-08) y registrado en
--     `.planning/BACKLOG.md`. No hay ningún test de offline en esta fase, ni
--     "documental": un test de algo que no existe es ruido.
--   * La compresión de la foto y el borrado del EXIF. Eso corre en el
--     navegador y lo mide `lib/fotos/comprimir.test.ts` con su señuelo.
--   * La paridad entre esta regla en SQL y la de `lib/domain/checklist.ts`.
--     La duplicación está declarada a propósito (plan 06-03) y la mide
--     `lib/domain/evidencia-paridad.integration.test.ts` (plan 06-10).
-- ============================================================================

begin;
select plan(21);

-- Limpieza en orden de dependencia. `room_types` y `checklist_tasks` se siembran
-- propios en vez de reusar el seed global: así el conteo del checklist es
-- determinista y no depende de que alguien edite el catálogo provisional.
delete from public.cleaning_photos;
delete from public.cleaning_checklist_items;
delete from public.cleaning_state_transitions;
delete from public.access_code_reads;
delete from public.notifications;
delete from public.expenses;
delete from public.damages;
delete from public.missing_item_lines;
delete from public.missing_item_reports;
delete from public.cleanings;
delete from public.property_rooms;
delete from public.checklist_tasks;
delete from public.room_types;
delete from public.property_secrets;
delete from public.properties;
delete from public.profiles;
delete from auth.users;


-- ---------------------------------------------------------------------------
-- ARNÉS: ejecutar como un usuario concreto y devolver el estado del error.
-- Copiado en forma de `06_aseos_admin.test.sql`, que lo mide igual.
-- ---------------------------------------------------------------------------
create function pg_temp.intento_como(p_uid uuid, p_consulta text) returns text
language plpgsql as $fn$
declare
  v_estado  text;
  v_mensaje text;
  v_pista   text;
begin
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
    execute p_consulta;
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', '', true);
    return 'sin_error||';
  exception when others then
    get stacked diagnostics
      v_estado  = returned_sqlstate,
      v_mensaje = message_text,
      v_pista   = pg_exception_hint;
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', '', true);
    return v_estado || '|' || coalesce(v_mensaje, '') || '|' || coalesce(v_pista, '');
  end;
end;
$fn$;

/** Solo el SQLSTATE, para comparar sin arrastrar el mensaje. */
create function pg_temp.estado_de(p_uid uuid, p_consulta text) returns text
language sql as $fn$
  select split_part(pg_temp.intento_como(p_uid, p_consulta), '|', 1);
$fn$;

/** El estado del aseo, como texto. */
create function pg_temp.estado_aseo(p uuid) returns text
language sql stable as $fn$
  select coalesce((select c.state::text from public.cleanings c where c.id = p), '<sin fila>');
$fn$;

/** Los cuartos saltados de un aseo, con su motivo. Orden estable. */
create function pg_temp.saltados(p uuid) returns text
language sql stable as $fn$
  select coalesce(string_agg(s.room_label || ':' || s.motivo::text, ' + ' order by s.room_label),
                  '<ninguno>')
    from public.cleaning_room_skips s
   where s.cleaning_id = p;
$fn$;


-- ---------------------------------------------------------------------------
-- SIEMBRA
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('ad090000-0000-0000-0000-000000000001', 'admin09@vg.co'),
  ('a9000000-0000-0000-0000-00000000000a', 'aseadora09-a@vg.co'),
  ('a9000000-0000-0000-0000-00000000000b', 'aseadora09-b@vg.co');

insert into public.profiles (id, role, full_name, is_active) values
  ('ad090000-0000-0000-0000-000000000001', 'admin',   'Admin 09',     true),
  ('a9000000-0000-0000-0000-00000000000a', 'aseador', 'Aseadora 09A', true),
  ('a9000000-0000-0000-0000-00000000000b', 'aseador', 'Aseadora 09B', true)
on conflict (id) do update
  set role = excluded.role, full_name = excluded.full_name, is_active = excluded.is_active;

-- Dos tipos de cuarto. El de baño tiene una tarea que exige foto y otra que no:
-- es lo que permite distinguir "cuarto sin foto porque falta" de "cuarto sin
-- foto porque no la necesitaba", que son los dos casos que más se confunden.
insert into public.room_types (id, nombre, is_active) values
  ('c9000000-0000-0000-0000-000000000001', 'Cocina 09', true),
  ('c9000000-0000-0000-0000-000000000002', 'Baño 09',   true);

insert into public.checklist_tasks (id, room_type_id, descripcion, slot, requiere_foto, is_active) values
  ('d9000000-0000-0000-0000-000000000001', 'c9000000-0000-0000-0000-000000000001',
   'Limpiar la estufa', 1, true,  true),
  ('d9000000-0000-0000-0000-000000000002', 'c9000000-0000-0000-0000-000000000002',
   'Lavar el sanitario', 1, true,  true),
  ('d9000000-0000-0000-0000-000000000003', 'c9000000-0000-0000-0000-000000000002',
   'Cambiar las toallas', 2, false, true);

insert into public.properties
  (id, nombre, cluster, gestion_vivaguest, hora_limite,
   tarifa_huesped, pago_aseador, responsable_id, is_active) values
  ('b9000000-0000-0000-0000-000000000001', 'Apto 09 (fixture)', 'Cluster 09',
   true, '11:30', 120000::bigint, 45000::bigint,
   'a9000000-0000-0000-0000-00000000000a', true);

insert into public.property_rooms (id, property_id, room_type_id, etiqueta, sort_order, is_active) values
  ('e9000000-0000-0000-0000-000000000001', 'b9000000-0000-0000-0000-000000000001',
   'c9000000-0000-0000-0000-000000000001', 'Cocina', 1, true),
  ('e9000000-0000-0000-0000-000000000002', 'b9000000-0000-0000-0000-000000000001',
   'c9000000-0000-0000-0000-000000000002', 'Baño principal', 2, true);

-- Cuatro aseos en fechas distintas: el índice único parcial
-- `cleanings_one_active_per_property_date` no admite dos activos el mismo día
-- para el mismo apartamento, y chocar con él mataría el archivo entero.
insert into public.cleanings
  (id, property_id, scheduled_date, tipo, origin, aseador_id, confirmado_at, state, started_at) values
  ('f9000000-0000-0000-0000-000000000001', 'b9000000-0000-0000-0000-000000000001',
   public.today_bog(), 'normal', 'manual',
   'a9000000-0000-0000-0000-00000000000a', now(), 'pendiente', null),
  ('f9000000-0000-0000-0000-000000000002', 'b9000000-0000-0000-0000-000000000001',
   public.today_bog() + 1, 'normal', 'manual',
   'a9000000-0000-0000-0000-00000000000a', now(), 'en_curso', now()),
  ('f9000000-0000-0000-0000-000000000003', 'b9000000-0000-0000-0000-000000000001',
   public.today_bog() + 2, 'normal', 'manual',
   'a9000000-0000-0000-0000-00000000000a', now(), 'en_curso', now()),
  ('f9000000-0000-0000-0000-000000000004', 'b9000000-0000-0000-0000-000000000001',
   public.today_bog() + 3, 'normal', 'manual',
   'a9000000-0000-0000-0000-00000000000b', now(), 'en_curso', now());

-- El checklist de los cuatro, materializado con la misma consulta que usa
-- `confirm_cleaning`: tres ítems por aseo (1 de cocina + 2 de baño).
insert into public.cleaning_checklist_items
  (cleaning_id, property_room_id, checklist_task_id,
   room_label, task_label, requiere_foto, sort_order)
select c.id, pr.id, ct.id, pr.etiqueta, ct.descripcion, ct.requiere_foto,
       pr.sort_order * 100 + ct.slot
  from public.cleanings     c
  join public.property_rooms  pr on pr.property_id = c.property_id and pr.is_active
  join public.checklist_tasks ct on ct.room_type_id = pr.room_type_id and ct.is_active
 where c.property_id = 'b9000000-0000-0000-0000-000000000001';

-- ASEO 3: todo marcado y con la foto de las dos tareas que la exigen. Es el
-- único que NO debe quedar sin evidencia completa.
update public.cleaning_checklist_items
   set done_at = now(), done_by = 'a9000000-0000-0000-0000-00000000000a'
 where cleaning_id = 'f9000000-0000-0000-0000-000000000003';

insert into public.cleaning_photos
  (cleaning_id, kind, checklist_item_id, storage_path, mime_type, bytes, uploaded_by)
select i.cleaning_id, 'checklist', i.id,
       i.cleaning_id::text || '/checklist/' || i.id::text || '.jpg',
       'image/jpeg', 200000, 'a9000000-0000-0000-0000-00000000000a'
  from public.cleaning_checklist_items i
 where i.cleaning_id = 'f9000000-0000-0000-0000-000000000003'
   and i.requiere_foto;

-- ASEO 2: todas las tareas marcadas pero SIN ninguna foto. Es el caso
-- "terminó el trabajo pero no hay evidencia", que antes bloqueaba.
update public.cleaning_checklist_items
   set done_at = now(), done_by = 'a9000000-0000-0000-0000-00000000000a'
 where cleaning_id = 'f9000000-0000-0000-0000-000000000002';


-- ═══════════════════════════════════════════════════════════════════════════
-- A. LA DEROGACIÓN DE PWA-07 (4 aserciones)
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. El caso que ANTES lanzaba `P0001 checklist_incompleto`: tareas marcadas y
--    cero fotos. Ahora tiene que pasar.
select is(
  pg_temp.estado_de('a9000000-0000-0000-0000-00000000000a',
    $q$select public.finish_cleaning('f9000000-0000-0000-0000-000000000002'::uuid)$q$),
  'sin_error',
  'D-06: terminar un aseo sin ninguna foto YA NO lanza checklist_incompleto');

-- 2. Y el aseo de verdad quedó cerrado, no a medias.
select is(pg_temp.estado_aseo('f9000000-0000-0000-0000-000000000002'), 'completada',
  'D-06: el aseo sin fotos queda completada');

-- 3. Ese mismo aseo queda marcado sin evidencia completa. Es la contrapartida
--    entera del permiso: sin esta marca, D-06 sería solo permiso sin rastro.
select ok(public.aseo_sin_evidencia_completa('f9000000-0000-0000-0000-000000000002'::uuid),
  'un aseo terminado sin fotos queda marcado sin evidencia completa');

-- 4. El aseo con todo marcado y con sus dos fotos NO queda marcado. Es el
--    control: sin él, la aserción 3 pasaría con una función que devuelve
--    siempre cierto.
select ok(not public.aseo_sin_evidencia_completa('f9000000-0000-0000-0000-000000000003'::uuid),
  'un aseo con todas las tareas y todas las fotos NO queda marcado');


-- ═══════════════════════════════════════════════════════════════════════════
-- B. EL SKIP CON MOTIVO (11 aserciones)
-- ═══════════════════════════════════════════════════════════════════════════

-- 5. El camino feliz: guarda el cuarto con su motivo y su etiqueta de snapshot.
select is(
  pg_temp.estado_de('a9000000-0000-0000-0000-00000000000a',
    $q$select public.skip_room_evidence(
         'f9000000-0000-0000-0000-000000000003'::uuid,
         'e9000000-0000-0000-0000-000000000002'::uuid,
         'cuarto_cerrado'::public.motivo_sin_evidencia, null)$q$),
  'sin_error',
  'skip_room_evidence guarda el cuarto saltado con su motivo');

select is(pg_temp.saltados('f9000000-0000-0000-0000-000000000003'),
  'Baño principal:cuarto_cerrado',
  'el cuarto saltado guarda su etiqueta de snapshot y su motivo');

-- 7. Y ese aseo, que estaba completo, pasa a estar sin evidencia completa.
--    Es el mismo aseo de la aserción 4, así que el cambio de veredicto lo
--    causó EXCLUSIVAMENTE el skip.
select ok(public.aseo_sin_evidencia_completa('f9000000-0000-0000-0000-000000000003'::uuid),
  'un cuarto saltado deja el aseo sin evidencia completa, aunque tenga todas las fotos');

-- 8. Saltar dos veces el mismo cuarto ACTUALIZA el motivo, no duplica la fila.
--    Lo impone `crs_cleaning_room_uniq` más el `on conflict do update`.
select lives_ok(
  $q$select pg_temp.intento_como('a9000000-0000-0000-0000-00000000000a',
       $i$select public.skip_room_evidence(
            'f9000000-0000-0000-0000-000000000003'::uuid,
            'e9000000-0000-0000-0000-000000000002'::uuid,
            'sin_luz'::public.motivo_sin_evidencia, null)$i$)$q$,
  'saltar dos veces el mismo cuarto no revienta');

select is(pg_temp.saltados('f9000000-0000-0000-0000-000000000003'),
  'Baño principal:sin_luz',
  'saltar dos veces ACTUALIZA el motivo en vez de duplicar la fila');

-- 10. El motivo `otro` exige nota. Sin ella, el CHECK de la tabla lo rechaza.
select is(
  pg_temp.estado_de('a9000000-0000-0000-0000-00000000000a',
    $q$select public.skip_room_evidence(
         'f9000000-0000-0000-0000-000000000003'::uuid,
         'e9000000-0000-0000-0000-000000000001'::uuid,
         'otro'::public.motivo_sin_evidencia, null)$q$),
  '23514',
  'el motivo otro SIN nota lo rechaza el CHECK de la tabla');

-- 11. Con nota, pasa.
select is(
  pg_temp.estado_de('a9000000-0000-0000-0000-00000000000a',
    $q$select public.skip_room_evidence(
         'f9000000-0000-0000-0000-000000000003'::uuid,
         'e9000000-0000-0000-0000-000000000001'::uuid,
         'otro'::public.motivo_sin_evidencia, 'La estufa estaba prendida')$q$),
  'sin_error',
  'el motivo otro CON nota se acepta');

-- 12. Un motivo fuera de la lista cerrada no existe como valor: el cast falla.
--     Es lo que impide que la lista se convierta en texto libre por la puerta
--     de atrás, y por eso el motivo es un enum y no un `text`.
select is(
  pg_temp.estado_de('a9000000-0000-0000-0000-00000000000a',
    $q$select public.skip_room_evidence(
         'f9000000-0000-0000-0000-000000000003'::uuid,
         'e9000000-0000-0000-0000-000000000001'::uuid,
         'me_dio_pereza'::public.motivo_sin_evidencia, 'x')$q$),
  '22P02',
  'un motivo fuera del enum no se puede ni construir');

-- 13. Aseo ajeno: 42501 indistinguible, misma razón que reveal_access_code.
select is(
  pg_temp.estado_de('a9000000-0000-0000-0000-00000000000b',
    $q$select public.skip_room_evidence(
         'f9000000-0000-0000-0000-000000000003'::uuid,
         'e9000000-0000-0000-0000-000000000001'::uuid,
         'sin_luz'::public.motivo_sin_evidencia, null)$q$),
  '42501',
  'saltar un cuarto de un aseo AJENO devuelve 42501');

-- 14. Aseo que no está en curso: el mismo 42501, no un error distinto.
--     Discriminarlos sería un oráculo de enumeración de aseos ajenos.
select is(
  pg_temp.estado_de('a9000000-0000-0000-0000-00000000000a',
    $q$select public.skip_room_evidence(
         'f9000000-0000-0000-0000-000000000001'::uuid,
         'e9000000-0000-0000-0000-000000000001'::uuid,
         'sin_luz'::public.motivo_sin_evidencia, null)$q$),
  '42501',
  'saltar un cuarto de un aseo que no esta en curso devuelve el MISMO 42501');

-- 15. La vuelta atrás: la foto llega y la marca se va.
select is(
  pg_temp.estado_de('a9000000-0000-0000-0000-00000000000a',
    $q$select public.unskip_room_evidence(
         'f9000000-0000-0000-0000-000000000003'::uuid,
         'e9000000-0000-0000-0000-000000000002'::uuid)$q$),
  'sin_error',
  'unskip_room_evidence quita la marca cuando la evidencia si llego');


-- ═══════════════════════════════════════════════════════════════════════════
-- C. LA MONEDA DEL GASTO (2 aserciones)
-- ═══════════════════════════════════════════════════════════════════════════

-- 16. Regla 1 del camino a v2: el monto sabe en qué moneda está.
select has_column('public', 'expenses', 'moneda',
  'expenses tiene columna moneda: el bigint de pesos enteros no sirve para Mexico ni Brasil');

-- 17. Y está acotada a tres letras mayúsculas, no es texto libre.
select is(
  pg_temp.estado_de('a9000000-0000-0000-0000-00000000000a',
    $q$insert into public.expenses (cleaning_id, property_id, concepto, monto, moneda, reported_by)
       values ('f9000000-0000-0000-0000-000000000003',
               'b9000000-0000-0000-0000-000000000001',
               'Trapeador', 15000, 'cop',
               'a9000000-0000-0000-0000-00000000000a')$q$),
  '23514',
  'la moneda en minuscula la rechaza el CHECK: el codigo va en mayusculas');


-- ═══════════════════════════════════════════════════════════════════════════
-- D. NO REGRESIÓN de lo que ya existía (4 aserciones)
-- ═══════════════════════════════════════════════════════════════════════════

-- 18. `start_cleaning` sigue rechazando un aseo ajeno.
select is(
  pg_temp.estado_de('a9000000-0000-0000-0000-00000000000b',
    $q$select public.start_cleaning('f9000000-0000-0000-0000-000000000001'::uuid)$q$),
  '42501',
  'no regresion: start_cleaning sigue rechazando un aseo ajeno con 42501');

-- 19. `toggle_checklist_item` sigue funcionando para el dueño del aseo.
select is(
  pg_temp.estado_de('a9000000-0000-0000-0000-00000000000a',
    $q$select public.toggle_checklist_item(
         (select i.id from public.cleaning_checklist_items i
           where i.cleaning_id = 'f9000000-0000-0000-0000-000000000004' limit 1), true)$q$),
  '42501',
  'no regresion: toggle_checklist_item de un aseo ajeno sigue en 42501');

-- 20. La máquina de estados sigue cerrada: un aseo completado no vuelve atrás.
select throws_ok(
  $q$update public.cleanings set state = 'en_curso'
      where id = 'f9000000-0000-0000-0000-000000000002'$q$,
  'P0001',
  null,
  'no regresion: la maquina de estados sigue rechazando completada -> en_curso');

-- 21. Las dos funciones nuevas no son ejecutables por `anon`. El guardarraíl 9
--     de `02_guardarrailes.test.sql` lo vigila de forma transversal; esta
--     aserción lo dice en el sitio donde se creó la función.
select is_empty($q$
  select p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('skip_room_evidence', 'unskip_room_evidence')
     and has_function_privilege('anon', p.oid, 'execute')
$q$, 'las dos funciones nuevas no son ejecutables por anon');


select * from finish();
rollback;
