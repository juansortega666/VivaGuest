-- ============================================================================
-- 12_almacenamiento.test.sql — RET-07, el consumo de Storage y su frontera
--
-- Nueve aserciones sobre `public.consumo_de_storage()` (migración 29). La que
-- importa es la 5.
--
-- ── POR QUÉ ESTE ARCHIVO EXISTE ────────────────────────────────────────────
--
-- `consumo_de_storage()` es `security definer` y su dueño es `postgres`, que
-- tiene `rolbypassrls = t`. O sea: su cuerpo ve `storage.objects` ENTERA,
-- saltándose la RLS. Lo único que separa el volumen de operación del negocio de
-- cualquier `authenticated` es UNA LÍNEA del cuerpo. Una línea no se prueba
-- leyéndola: se prueba IMPERSONANDO, que es lo que hace la aserción 5.
--
-- ── LA FRONTERA NO ES LA QUE UNO SUPONDRÍA, Y SE AFIRMA COMO ES ────────────
--
-- `storage.get_size_by_bucket()` existe, es `security INVOKER`, no fija
-- `search_path` y su `proacl` es NULO, o sea EXECUTE para PUBLIC. Una aseadora
-- la puede llamar y le devuelve un número: la suma de SUS PROPIAS fotos,
-- recortada por `evidencia_cleaner_select`. La aserción 6 escribe esa verdad
-- incómoda en vez de fingir que la definer es la única puerta a
-- `storage.objects`, y se pondrá roja el día que alguien afloje esa policy.
--
-- ── TRES NOTAS DE ENTORNO QUE CAMBIAN QUÉ ASERCIÓN ES LA CORRECTA ──────────
--
--   1. `storage.objects` tiene un trigger BEFORE DELETE, `storage.protect_delete()`,
--      que rechaza TODO borrado directo por SQL **con errcode 42501**, que es el
--      mismo código que un deny de RLS. Sin levantar el GUC
--      `storage.allow_delete_query` la limpieza de este archivo aborta el
--      archivo entero. Es la nota 3 de `04_storage.test.sql` y es una fuente de
--      falso verde si el test no la conoce.
--
--   2. `get_size_by_bucket()` agrupa por bucket, y un `group by` SOBRE EL VACÍO
--      NO EMITE FILAS: con cero objetos devuelve cero filas, no `evidencia | 0`.
--      Por eso la función de la migración 29 no lo usa y saca el total de una
--      subconsulta escalar con `coalesce`. La aserción 9 mide exactamente eso.
--
--   3. El cupo y el umbral salen del seed (`storage_quota_mb` = 1024,
--      `storage_alert_threshold_pct` = 70). Las aserciones 7 y 8 mueven el CUPO
--      con un `update`, que es justamente el camino que el dueño va a usar el
--      día que pague Pro. El `rollback` del final lo deshace.
--
-- ── LA ARITMÉTICA DEL FIXTURE, PARA QUE NADIE LA RECALCULE A MANO ─────────
--
--   OB1 (aseo de A) .. 1 MiB = 1048576 B .. 10:00
--   OB2 (aseo de A) .. 1 MiB = 1048576 B .. 11:00
--   OB3 (aseo de B) .. 1 MiB = 1048576 B .. 12:00
--   OB4 (aseo de B) .. metadata SIN `size` . 13:00  -> cuenta 0
--   ----------------------------------------------------------------
--   TOTAL ............ 3145728 B          A sola ve 2097152 B
--
--   Con cupo 4 MiB y umbral 70: el corte está en 4194304 * 70 = 293601280 y la
--   suma corrida por 100 va 104857600 → 209715200 → 314572800. Cruza EN OB3.
--   Con el cupo por defecto (1024 MiB) no cruza: `cruce_at` es nulo.
-- ============================================================================

begin;
select plan(9);

-- ---------------------------------------------------------------------------
-- Limpieza dentro de la transacción, en orden inverso de FK. El GUC vuelve a
-- 'false' de inmediato para que las aserciones corran en condiciones de
-- producción (nota 1).
-- ---------------------------------------------------------------------------
select set_config('storage.allow_delete_query', 'true', true);
delete from storage.objects where bucket_id = 'evidencia';
select set_config('storage.allow_delete_query', 'false', true);

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
delete from public.calendar_reservations;
delete from public.calendar_feeds;
delete from public.property_rooms;
delete from public.property_secrets;
delete from public.properties;
delete from public.profiles;
delete from auth.users;

-- ═══════════════════════════════════════════════════════════════════════════
-- EL ARNÉS
--
-- Copiado de `11_financiero.test.sql`, con los mismos nombres. Es el patrón de
-- impersonación que la Fase 6 validó y la Fase 7 reusó.
--
-- VIENEN DOS DE LAS TRES FUNCIONES, Y LA QUE FALTA NO ESTÁ POR OLVIDO:
-- `intento_como` (que devuelve 'sin_error' o el SQLSTATE) no se usa en ningún
-- sitio de este archivo, porque TODAS las lecturas de aquí son escalares y
-- todas quieren el VALOR, no solo el veredicto. Copiarla para dejarla muerta
-- invitaría al error de usarla en la aserción 5, que es precisamente donde
-- 'sin_error' no enseñaría nada.
-- ═══════════════════════════════════════════════════════════════════════════

/**
 * Como el anterior, pero devuelve EL VALOR que la sesión impersonada consigue
 * leer, o 'ERROR:<sqlstate>' si no pudo. Existe por una razón de diagnóstico, y
 * la aserción 5 es exactamente para lo que existe: si la guarda se cayera, el
 * TAP imprime en el `have` LA CIFRA EXACTA que se está escapando. Con
 * `intento_como` el fallo diría solo 'sin_error', que no enseña nada.
 */
create function pg_temp.valor_como(p_uid uuid, p_consulta text) returns text
language plpgsql as $fn$
declare
  v_out    text;
  v_estado text;
begin
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
    execute p_consulta into v_out;
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', '', true);
    return coalesce(v_out, '<nulo>');
  exception when others then
    get stacked diagnostics v_estado = returned_sqlstate;
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', '', true);
    return 'ERROR:' || v_estado;
  end;
end;
$fn$;

/**
 * Lectura escalar como `postgres`, tolerante a que el objeto todavía no exista.
 * Convierte "la tabla no existe" en un `not ok` de UNA aserción en vez de en un
 * aborto del archivo entero.
 *
 * OJO: NO SIRVE PARA LEER `consumo_de_storage()`. Como `postgres` no hay
 * `auth.uid()`, así que `private.is_admin()` es falso y la guarda deniega con
 * 42501. Aquí solo lee `storage.objects` directo, que es lo que queremos: el
 * valor esperado de la aserción 7 tiene que salir de la TABLA, no de la misma
 * función que se está midiendo.
 */
create function pg_temp.escalar(p_consulta text) returns text
language plpgsql as $fn$
declare
  v_out    text;
  v_estado text;
begin
  execute p_consulta into v_out;
  return coalesce(v_out, '<nulo>');
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate;
  return 'ERROR:' || v_estado;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Fixture: un admin, dos aseadoras con un aseo cada una, y cuatro objetos.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a', 'admin@vg.co'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@vg.co'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@vg.co');

-- `on conflict do update` y no un `insert` a secas: hay un trigger sobre
-- `auth.users` que ya crea el perfil con el rol por defecto, así que este
-- insert siempre colisiona. Es la misma forma que usa `04_storage.test.sql`.
insert into public.profiles (id, role, full_name, is_active, deactivated_at) values
  ('0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a', 'admin',   'Admin',      true, null),
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
  ('99999999-9999-9999-9999-999999999999', '11111111-1111-1111-1111-111111111111',
   'manual', public.today_bog(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('88888888-8888-8888-8888-888888888888', '33333333-3333-3333-3333-333333333333',
   'manual', public.today_bog(), 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

-- Los objetos se siembran como `postgres`, exento de RLS. `created_at` va
-- escalonado a propósito: es lo que hace observable el instante de cruce.
-- OB4 lleva `metadata` SIN `size`, que es un caso medido vivo en esta base y el
-- que justifica el `coalesce` interno de la migración 29.
insert into storage.objects (bucket_id, name, metadata, created_at) values
  ('evidencia', '99999999-9999-9999-9999-999999999999/checklist/ob1.webp',
   '{"size": 1048576}'::jsonb, '2026-09-18 10:00:00+00'),
  ('evidencia', '99999999-9999-9999-9999-999999999999/checklist/ob2.webp',
   '{"size": 1048576}'::jsonb, '2026-09-18 11:00:00+00'),
  ('evidencia', '88888888-8888-8888-8888-888888888888/checklist/ob3.webp',
   '{"size": 1048576}'::jsonb, '2026-09-18 12:00:00+00'),
  ('evidencia', '88888888-8888-8888-8888-888888888888/checklist/ob4.webp',
   '{"mimetype": "image/webp"}'::jsonb, '2026-09-18 13:00:00+00');

-- ===========================================================================

-- 1  La función existe con la firma que el lector de TypeScript espera. Sin
--    argumentos: el cupo y el umbral los lee ella de `app_settings`, no se los
--    pasa quien llama, o habría dos verdades sobre el mismo umbral.
select has_function('public', 'consumo_de_storage', '{}'::name[],
  'RET-07 existe public.consumo_de_storage() sin argumentos');

-- 2  Estructural. Una definer SIN `search_path` fijado es una puerta DISTINTA
--    de la que este plan cree estar abriendo: resuelve los nombres por el
--    camino de búsqueda de quien llama, que quien llama controla.
select is(
  (select p.prosecdef::text || '|' ||
          (exists (select 1
                     from unnest(coalesce(p.proconfig, '{}'::text[])) as cfg
                    where cfg in ('search_path=', 'search_path=""')))::text
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'consumo_de_storage'),
  'true|true',
  'RET-07 consumo_de_storage() es SECURITY DEFINER y fija search_path vacío');

-- 3  El par revoke/grant de la migración 29. En PG 17 una función nueva de
--    `public` nace ejecutable por `anon` si nadie revoca al lado de la
--    definición: esta aserción es la que atrapa el olvido.
select is(
  (select has_function_privilege('authenticated', p.oid, 'execute')::text || '|' ||
          has_function_privilege('anon', p.oid, 'execute')::text
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'consumo_de_storage'),
  'true|false',
  'RET-07 authenticated ejecuta consumo_de_storage() y anon no');

-- 4  Como ADMIN: el total es la suma exacta de los `size` sembrados, con OB4
--    (sin `size`) contando 0. Si el `coalesce` interno desapareciera, `sum`
--    sobre un nulo no rompería aquí, pero el día que TODOS los objetos vinieran
--    sin metadata el total sería nulo y el medidor diría "no se pudo medir"
--    sobre un Storage perfectamente medible.
select is(
  pg_temp.valor_como('0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a',
    $q$ select v.usado_bytes::text from public.consumo_de_storage() v $q$),
  '3145728',
  'RET-07 el admin lee el total del bucket, y el objeto sin size cuenta 0');

-- 5  LA QUE IMPORTA. Como ASEADORA A la función DENIEGA con 42501.
--
--    Se usa `valor_como` y no `intento_como` a propósito: si la guarda se
--    cayera, el `have` de esta línea trae la cifra del negocio que se está
--    escapando al teléfono de la aseadora, en vez de un 'sin_error' que no
--    enseña nada. Es la lección de la fuga de la tarifa que midió la Fase 7.
--
--    COMPROBADO A MANO ANTES DE DAR EL ARCHIVO POR BUENO: comentando la guarda
--    de la migración 29, esta aserción se pone roja con `have: 3145728`. Un
--    test de denegación que pasa sin la defensa puesta no prueba nada.
select is(
  pg_temp.valor_como('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    $q$ select v.usado_bytes::text from public.consumo_de_storage() v $q$),
  'ERROR:42501',
  'RET-07 NEG ninguna sesión de aseadora lee el consumo de Storage');

-- 6  LA FRONTERA REAL, ESCRITA COMO ES Y NO COMO QUISIÉRAMOS.
--
--    `storage.get_size_by_bucket()` es invoker y PUBLIC la ejecuta, así que a
--    la aseadora NO le falla: le devuelve la suma recortada por la RLS a sus
--    propios aseos (OB1 + OB2 = 2097152), estrictamente menos que el total del
--    sistema (3145728). Esta aserción existe para que nadie crea que la definer
--    es la única puerta a `storage.objects`, y para que el día que alguien
--    afloje `evidencia_cleaner_select` esto salga rojo.
select is(
  pg_temp.valor_como('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    $q$ select g.size::text from storage.get_size_by_bucket() g
         where g.bucket_id = 'evidencia' $q$),
  '2097152',
  'RET-07 get_size_by_bucket() no le falla a la aseadora: la RLS la recorta a sus propias fotos');

-- 7  `cruce_at` ES EL INSTANTE DEL OBJETO QUE CRUZÓ, no el de la lectura.
--    Con el cupo en 4 MiB el corte cae entre OB2 y OB3, así que la respuesta
--    correcta es el `created_at` de OB3. Con el instante de la lectura, la
--    alerta saltaría al tope del panel en cada render.
update public.app_settings set value = '4'::jsonb where key = 'storage_quota_mb';

select is(
  pg_temp.valor_como('0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a',
    $q$ select v.cruce_at::text from public.consumo_de_storage() v $q$),
  pg_temp.escalar(
    $q$ select o.created_at::text
          from storage.objects o
         where o.name = '88888888-8888-8888-8888-888888888888/checklist/ob3.webp' $q$),
  'RET-07 cruce_at es el created_at del objeto en que la suma corrida cruzó el umbral');

-- 8  Con el cupo holgado NO hay cruce, y `cruce_at` es NULO. Ese nulo es lo que
--    apaga la alerta, y es el camino literal que el dueño va a usar el día que
--    pague Pro: un `update` de una fila, sin migración y sin despliegue.
update public.app_settings set value = '1024'::jsonb where key = 'storage_quota_mb';

select is(
  pg_temp.valor_como('0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a',
    $q$ select v.cruce_at::text from public.consumo_de_storage() v $q$),
  '<nulo>',
  'RET-07 subir el cupo con un update apaga el cruce: cruce_at vuelve a nulo');

-- 9  Con `storage.objects` vacío, `usado_bytes` es 0 y NO nulo (nota 2). Un
--    nulo aquí pintaría "sin datos" donde la verdad es "0 B", y son cosas
--    distintas: la primera es un fallo de lectura y la segunda es un Storage
--    limpio.
select set_config('storage.allow_delete_query', 'true', true);
delete from storage.objects where bucket_id = 'evidencia';
select set_config('storage.allow_delete_query', 'false', true);

select is(
  pg_temp.valor_como('0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a',
    $q$ select v.usado_bytes::text from public.consumo_de_storage() v $q$),
  '0',
  'RET-07 con el bucket vacío el consumo es 0 y no nulo');

select * from finish();
rollback;
