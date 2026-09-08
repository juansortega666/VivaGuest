-- ============================================================================
-- 06_aseos_admin.test.sql — el contrato ejecutable de las seis RPC del admin
--
-- ESTE ARCHIVO NACE EN ROJO, A PROPÓSITO. Es Wave 0 de la Fase 4: enumera, antes
-- de que exista una línea de la migración 15, los invariantes que esa migración
-- tiene que hacer verdaderos. Ninguna tarea posterior de la fase puede
-- declararse hecha con una verificación inventada sobre la marcha: la
-- verificación ya está escrita aquí y ya falla.
--
-- QUIÉN LO PONE EN VERDE: el plan 04-05, que entrega la migración 15 con las
-- seis funciones, y el plan que añada `public.cleanings` y
-- `public.notifications` a la publicación `supabase_realtime` (aserciones 39 y
-- 40). Hasta entonces el rojo de este archivo es lo ESPERADO.
--
-- CONSECUENCIA OPERATIVA, y hay que conocerla antes de tocar nada: en cuanto la
-- migración 15 esté aplicada, un `not ok` en este archivo YA NO ES ESPERADO. Es
-- una regresión. La lectura de "cuántos rojos hay" cambia de signo ese día,
-- exactamente igual que pasó con `05_sync.test.sql` en el plan 03-07, y el
-- hábito de "es normal que este archivo esté rojo" pasa a ser el error.
--
-- ── CUÁNTOS ROJOS SE ESPERAN, Y POR QUÉ NO SON LOS 41 ──────────────────────
--
-- De las 41 aserciones, NUEVE están verdes desde el primer momento y NO es
-- vacuidad: son propiedades que ya existen y que la migración 15 podría romper.
-- Si aparecieran en rojo, el rojo estaría en el sitio correcto.
--
--   · Las seis mitades "la fila quedó byte a byte igual" del bloque A. Con las
--     funciones sin crear no pasa nada, así que la fila no cambia. Su valor es
--     el DÍA DESPUÉS: si alguien escribe una RPC sin la guarda de rol, esta
--     mitad es la que distingue "devolvió 42501" de "devolvió 42501 pero ya
--     había escrito". Doc oficial de Supabase, citada en la cabecera de
--     `00_rls_aseos.test.sql`: "matching no rows is not proof on its own".
--   · La aserción 38: `feed_health_watchdog()` sigue con `interval '3 hours'`
--     exactamente dos veces. Mide la migración 14, que ya existe.
--   · La aserción 41: un admin no puede marcar como leída la notificación de
--     otro. Mide la policy `notifications_own_update`, que ya existe.
--   · La aserción 28, el control positivo del señuelo del coalesce. Mide el
--     aseo en curso ANTES de que `close_cleaning` lo toque: la llamada viene
--     tres líneas DESPUÉS. Sin la migración 15 nada lo movió; con ella, cerrar
--     el aseo `…08` tampoco lo mueve. Nace verde y tiene que seguir verde
--     siempre. CORREGIDO 2026-09-04 al ejecutar el archivo por primera vez:
--     la cabecera original la contaba entre los rojos esperados. No lo es.
--
-- Quedan 32 rojos esperados. El PLAN de este archivo estimó "al menos 35"
-- ANTES de escribirlo, contando como rojas las seis mitades del bloque A. No lo
-- son, y forzarlas a serlo exigiría fusionarlas con su mitad de excepción, que
-- es justamente lo que el plan prohíbe ("las dos mitades no son opcionales").
-- El número real es 32, MEDIDO al ejecutar el archivo el 2026-09-04, y está
-- escrito aquí para que nadie lo lea como una verificación que se quedó corta.
--
-- ── CÓMO SE LEE EL ROJO ────────────────────────────────────────────────────
--
-- No basta con contar las líneas `not ok`: dos regresiones no relacionadas se
-- cancelan en el agregado. Las tres comprobaciones, las mismas que fijó el plan
-- 03-05, son:
--
--   1. `ok + not ok` = el número del `plan(N)` declarado. Si el total es menor,
--      el archivo ABORTÓ a mitad y las aserciones que faltan no se midieron: un
--      conteo bajo puede ser una mejora o un incendio.
--   2. La lista de identificadores en rojo contra la esperada, no el total.
--      `pg_prove` ya la imprime literal (`Failed tests: 1, 3, …`).
--   3. Que la ÚLTIMA aserción del archivo aparezca en la salida.
--
-- Identificadores en rojo esperados, por plan:
--
--   tras 04-01 (archivo nuevo)   1 3 5 7 9 11 13 14 15 16 17 18 19 20 21 22
--                                23 24 25 26 27 29 30 31 32 33 34 35 36 37
--                                39 40                            (treinta y dos)
--   tras 04-05 (migración 15)    39 40   (las dos de Realtime, si su plan aún
--                                        no las publicó)
--
-- ── POR QUÉ NINGUNA LLAMADA A LAS SEIS FUNCIONES VA SUELTA ────────────────
--
-- Una función que no existe no da `not ok`: da `42883 undefined_function`, que
-- ABORTA la transacción entera y se lleva por delante el archivo completo,
-- incluidas las aserciones que sí podían medirse. Es la primera forma del
-- incendio que el plan 03-05 catalogó.
--
-- Por eso TODA invocación de las seis pasa por `pg_temp.intento_como()`, que la
-- envuelve en un bloque con manejador y devuelve `sqlstate|mensaje|pista` como
-- un valor comparable. Las aserciones de comportamiento leen DESPUÉS el estado
-- de la base, no el resultado de la llamada. Ese desdoblamiento es lo que
-- permite que el archivo nazca rojo de forma legible en vez de reventar.
--
-- Y la segunda forma del mismo incendio, también medida en 03-05: una
-- subconsulta ESCALAR que devuelve dos filas no da `not ok`, da
-- `more than one row returned by a subquery used as an expression`, y aborta
-- igual. Por eso toda lectura de este archivo va agregada (`string_agg`,
-- `count`, `max`), incluso donde la clave primaria garantiza una sola fila.
--
-- ── LO QUE ESTE ARCHIVO NO MIDE, dicho aquí para que nadie añada una aserción
--    que finja cubrirlo ──────────────────────────────────────────────────────
--
--   · Que `reschedule_cleaning` SOBREVIVA a una corrida real de
--     `sync_feed_apply()`. Aquí solo se afirma que deja `reservation_id` en
--     null, que es el mecanismo. La prueba de comportamiento, con dos corridas
--     encadenadas, vive en el plan 04-07 y es el señuelo de mayor valor de la
--     fase (Pitfall 1 de 04-RESEARCH.md).
--   · Que los Server Actions traduzcan los errores. Eso es TypeScript.
--
-- ── RESTRICCIONES DEL REPO QUE ESTE ARCHIVO RESPETA ───────────────────────
--
--   · Las fechas de negocio salen de `public.today_bog()`. La función de fecha
--     que el guardarraíl 4 de CI prohíbe no se nombra aquí ni en los
--     comentarios.
--   · La comparación de estado se escribe con el operador de DISTINCIÓN y nunca
--     con el de desigualdad: la fila informativa tiene `state` nulo y con el de
--     desigualdad se caería del predicado en silencio.
--   · NO se escribe `create extension … pgtap` dentro del archivo. La crea y la
--     borra `supabase test db` en cada corrida, y crearla aquí sin `with schema
--     extensions` la mete en `public` y pone en rojo, de mentira, los
--     guardarraíles 3, 4 y 9 de `02_guardarrailes.test.sql`. Medido en la
--     Fase 3 y documentado en la cabecera de `05_sync.test.sql`.
--   · Los helpers viven en `pg_temp` y mueren con la transacción: no aparecen
--     en `public` ni en `private`, así que no los alcanzan esos guardarraíles.
--   · Todo va entre `begin;` y `rollback;`, como los otros seis archivos.
--
-- ── CÓMO CORRER SOLO ESTE ARCHIVO ─────────────────────────────────────────
--
--   { echo 'begin;';
--     echo 'create extension if not exists pgtap with schema extensions;';
--     sed '0,/^begin;$/s/^begin;$//' supabase/tests/06_aseos_admin.test.sql;
--   } | docker exec -i supabase_db_vivaguest psql -U postgres -d postgres -qAtX -f -
--
-- Las banderas `-A -t` importan: sin ellas psql imprime cada línea TAP dentro
-- de una tabla con cabecera y con un espacio delante, y un `grep '^not ok'`
-- sobre esa salida devuelve CERO con el archivo entero en rojo. Es un falso
-- verde de la herramienta de medición, no del código.
-- ============================================================================

begin;
select plan(41);

-- ---------------------------------------------------------------------------
-- Limpieza del seed, en orden inverso de FK. El rollback la deshace.
--
-- `cleanings.property_id` es `on delete restrict` (migración 04, deliberado:
-- borrar un apartamento con historial operativo tiene que doler), así que los
-- aseos van ANTES que los apartamentos. Y `properties.responsable_id` también
-- es restrict contra `profiles`, así que los apartamentos van antes que los
-- perfiles.
-- ---------------------------------------------------------------------------
delete from public.cleaning_state_transitions;
delete from public.access_code_reads;
delete from public.notifications;
delete from public.cleanings;
delete from public.calendar_reservations;
delete from public.calendar_feeds;
delete from public.property_secrets;
delete from public.properties;
delete from public.profiles;
delete from auth.users;

-- ===========================================================================
-- HELPERS. Todos en pg_temp: mueren con la transacción.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- La envoltura que impide que el archivo reviente.
--
-- Ejecuta `p_consulta` con el JWT de `p_uid` y devuelve `sqlstate|mensaje|pista`
-- si lanzó, o `sin_error||` si no. NUNCA propaga la excepción.
--
-- El cambio de rol ocurre DENTRO del bloque con manejador, así que cuando la
-- consulta lanza, la subtransacción restituye el rol sola. En la rama de éxito
-- se restituye a mano. En las dos, quien llama vuelve a ser `postgres`, que es
-- lo que permite leer la base sin RLS en la aserción siguiente.
--
-- Se pasa el uuid y no el rol porque la autorización de VivaGuest no se apoya
-- en claims: `private.is_admin()` consulta `profiles` en la base. Un admin
-- degradado hace un minuto no puede mutar con su token todavía vivo, y esa
-- propiedad solo es observable si el JWT lleva un `sub` real.
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

-- La fila completa del aseo, como texto. Es la comparación byte a byte: incluye
-- `updated_at`, que el trigger `cleanings_set_updated_at` mueve ante CUALQUIER
-- escritura, así que una mutación que "no cambió nada visible" también rompe la
-- igualdad. Agregada a propósito, ver la cabecera.
create function pg_temp.fila_aseo(p uuid) returns text
language sql stable as $fn$
  select coalesce(string_agg(c::text, ' + ' order by c.id), '<sin fila>')
    from public.cleanings c
   where c.id = p;
$fn$;

-- La fila completa del apartamento. Es lo que hace medible la decisión D-18:
-- `reassign_cleaning` no puede tocar `responsable_id` ni `suplente_id`, y la
-- forma de afirmarlo sin enumerar columnas es comparar la fila entera.
create function pg_temp.fila_prop(p uuid) returns text
language sql stable as $fn$
  select coalesce(string_agg(pr::text, ' + ' order by pr.id), '<sin fila>')
    from public.properties pr
   where pr.id = p;
$fn$;

-- Todos los aseos de un apartamento, en una cadena. Es el "objetivo" de la
-- guarda de rol de `create_manual_cleaning`, que no tiene fila previa que
-- comparar: lo que hay que afirmar es que no apareció ninguna.
create function pg_temp.filas_de_prop(p uuid) returns text
language sql stable as $fn$
  select coalesce(string_agg(c.scheduled_date::text, ' + ' order by c.scheduled_date, c.id),
                  '<sin aseos>')
    from public.cleanings c
   where c.property_id = p;
$fn$;

-- La FORMA del aseo que nace de `create_manual_cleaning`, en una sola cadena.
-- Se afirman las ocho propiedades juntas y no una por aserción porque son un
-- solo hecho: "el insert puso cinco columnas y el trigger de snapshot puso el
-- resto". Separarlas invitaría a que siete pasaran y la octava se perdiera.
create function pg_temp.forma_aseo_en(p_prop uuid, p_fecha date) returns text
language sql stable as $fn$
  select coalesce(string_agg(
           c.origin
             || '/estado:'  || coalesce(c.state::text, '<null>')
             || '/confirmado_nulo:' || (c.confirmado_at is null)::text
             || '/aseador_nulo:'    || (c.aseador_id is null)::text
             || '/hora:'    || c.hora_limite::text
             || '/gestionado:' || c.is_managed::text
             || '/tarifa:'  || coalesce(c.tarifa_huesped::text, '<null>')
             || '/pago:'    || coalesce(c.pago_aseador::text, '<null>'),
           ' + ' order by c.id), '<sin fila>')
    from public.cleanings c
   where c.property_id = p_prop
     and c.scheduled_date = p_fecha;
$fn$;

-- La bitácora de un aseo: cuántas filas y con qué motivo. El trigger
-- `cleanings_log_transition` ya la escribe; una inserción a mano dentro de la
-- RPC produciría dos filas y esta cadena lo delata.
create function pg_temp.transiciones(p uuid) returns text
language sql stable as $fn$
  select count(*)::text || '/' ||
         coalesce(string_agg(coalesce(t.reason, '<null>'), '+' order by t.id), '<sin fila>')
    from public.cleaning_state_transitions t
   where t.cleaning_id = p;
$fn$;

-- El cuerpo de una función de `public`, con los comentarios QUITADOS.
--
-- Se quitan antes de buscar porque, si no, un comentario que mencione el patrón
-- lo daría por presente: la misma trampa que describe la cabecera de
-- `scripts/ci/check-service-role.sh`. Devuelve cadena vacía si la función no
-- existe, y `limit 1` evita el aborto por sobrecargas.
create function pg_temp.cuerpo(p_nombre text) returns text
language plpgsql stable as $fn$
declare
  v text;
begin
  select regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g')
    into v
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = p_nombre
     and p.prokind = 'f'
   limit 1;
  return coalesce(v, '');
end;
$fn$;

-- Los cuerpos de las seis funciones de esta fase, concatenados.
create function pg_temp.cuerpos_admin() returns text
language sql stable as $fn$
  select coalesce(string_agg(pg_temp.cuerpo(f.nombre), chr(10) order by f.nombre), '')
    from unnest(array['reassign_cleaning',
                      'create_manual_cleaning',
                      'reschedule_cleaning',
                      'close_cleaning',
                      'cancel_cleaning',
                      'clear_review_flag']) as f(nombre);
$fn$;

-- Cuántas de las seis existen. Es el CONTROL POSITIVO de las dos aserciones
-- estructurales: sin él, "ningún cuerpo asigna cancel_reason desde un
-- parámetro" pasaría en verde con las seis funciones sin crear, que es el falso
-- verde por ausencia que la Fase 2 midió cuatro veces.
create function pg_temp.cuantas_existen() returns int
language sql stable as $fn$
  select count(*)::int
    from unnest(array['reassign_cleaning',
                      'create_manual_cleaning',
                      'reschedule_cleaning',
                      'close_cleaning',
                      'cancel_cleaning',
                      'clear_review_flag']) as f(nombre)
   where exists (
     select 1
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = f.nombre
        and p.prokind = 'f');
$fn$;

create function pg_temp.cuenta(p_texto text, p_patron text) returns int
language sql stable as $fn$
  select count(*)::int from regexp_matches(p_texto, p_patron, 'g');
$fn$;

-- Instantáneas. Se guardan como texto y se comparan después: es la mitad que
-- convierte un "no devolvió filas" en una prueba.
create temp table instantaneas (clave text primary key, valor text);

-- ===========================================================================
-- FIXTURES. Los uuid son fijos y los nombres de columna son el CONTRATO que la
-- migración 15 tiene que respetar.
-- ===========================================================================

insert into auth.users (id, email) values
  ('ad000000-0000-0000-0000-000000000001', 'admin@vg.co'),
  ('a5000000-0000-0000-0000-00000000000a', 'aseadora-a@vg.co'),
  ('a5000000-0000-0000-0000-00000000000b', 'aseadora-b@vg.co'),
  ('a5000000-0000-0000-0000-00000000000c', 'aseadora-c@vg.co');

-- Upsert y no insert: el trigger `on_auth_user_created` ya materializó el
-- perfil, y un insert simple chocaría con 23505 y mataría el archivo entero.
insert into public.profiles (id, role, full_name, is_active, deactivated_at) values
  ('ad000000-0000-0000-0000-000000000001', 'admin',   'Admin de pruebas',       true,  null),
  ('a5000000-0000-0000-0000-00000000000a', 'aseador', 'Aseadora A',             true,  null),
  ('a5000000-0000-0000-0000-00000000000b', 'aseador', 'Aseadora B',             true,  null),
  ('a5000000-0000-0000-0000-00000000000c', 'aseador', 'Aseadora C DESACTIVADA', false, now())
on conflict (id) do update
  set role           = excluded.role,
      full_name      = excluded.full_name,
      is_active      = excluded.is_active,
      deactivated_at = excluded.deactivated_at;

-- P1: gestionada, activa, con responsable Y suplente distintos. La `hora_limite`
-- se pone distinta del default del schema a propósito: es lo que hace que la
-- aserción 14 pruebe que el trigger COPIÓ la del apartamento y no que coincidió
-- con el default.
insert into public.properties
  (id, nombre, cluster, gestion_vivaguest, hora_limite,
   tarifa_huesped, pago_aseador, responsable_id, suplente_id, is_active) values
  ('b1000000-0000-0000-0000-000000000001', 'Apto Admin 101 (fixture 06)', 'Cluster 06',
   true, '10:15', 120000::bigint, 45000::bigint,
   'a5000000-0000-0000-0000-00000000000a', 'a5000000-0000-0000-0000-00000000000b', true),
  ('b3000000-0000-0000-0000-000000000003', 'Apto Admin 303 (fixture 06)', 'Cluster 06',
   true, '11:00', 100000::bigint, 40000::bigint,
   'a5000000-0000-0000-0000-00000000000a', null, true);

-- P2: unidad informativa. `props_assignees_only_when_managed` exige que no
-- tenga responsable ni suplente; `contacto_externo` es quien la atiende.
insert into public.properties
  (id, nombre, cluster, gestion_vivaguest, contacto_externo, is_active) values
  ('b2000000-0000-0000-0000-000000000002', 'Apto Externo 202 (fixture 06)', 'Cluster 06',
   false, 'Administracion externa', true);

-- Feed y reserva de P1. Existen por UNA razón: sin `reservation_id` poblado, la
-- aserción 22 ("reschedule lo deja en null") pasaría por vacuidad.
-- El prefijo es `ef` y no `re`: `r` no es un dígito hexadecimal y Postgres
-- rechaza el literal uuid. `ef` es el reverso de `fe`, el feed que la contiene.
insert into public.calendar_feeds (id, property_id, provider) values
  ('fe000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'airbnb');

insert into public.calendar_reservations
  (id, feed_id, property_id, uid, reservation_code, starts_on, ends_on, summary, payload_hash) values
  ('ef000000-0000-0000-0000-000000000001',
   'fe000000-0000-0000-0000-000000000001',
   'b1000000-0000-0000-0000-000000000001',
   'fixture-06@airbnb.com', 'HMFIXTURE06',
   public.today_bog(), public.today_bog() + 3, 'Reserved', 'hash-fixture-06');

-- Los aseos. Las fechas no chocan entre sí dentro del mismo apartamento: el
-- índice `cleanings_one_active_per_property_date` lo impediría.
--
--   P1  hoy    CL_CURSO    en curso, con trabajo empezado
--   P1  hoy+3  CL_PEND     pendiente, confirmado, APUNTANDO A LA RESERVA
--   P1  hoy+5  CL_OCUPA    pendiente. Su única función es ocupar la fecha
--   P1  hoy+10 CL_CANCEL   pendiente, el que se cancela
--   P2  hoy    CL_INERTE   gestión externa: sin estado y sin aseador
--   P3  hoy-1  CL_DONE     completada, terminal
--   P3  hoy+1  CL_REVIEW   pendiente con la marca de revisión encendida
--   P3  hoy+2  CL_SINREV   pendiente con la marca ya apagada
--   P3  hoy+4  CL_CIERRE   pendiente, el que se cierra a mano
insert into public.cleanings
  (id, property_id, reservation_id, is_managed, origin, tipo, state, scheduled_date,
   aseador_id, confirmado_at, confirmado_by, started_at, finished_at,
   cancelled_at, needs_review, review_reason) values
  ('c1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001',
   null, true, 'ical', 'normal', 'en_curso', public.today_bog(),
   'a5000000-0000-0000-0000-00000000000a', now(), 'ad000000-0000-0000-0000-000000000001',
   now() - interval '90 minutes', null, null, false, null),

  ('c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001',
   'ef000000-0000-0000-0000-000000000001', true, 'ical', 'normal', 'pendiente',
   public.today_bog() + 3,
   'a5000000-0000-0000-0000-00000000000a', now(), 'ad000000-0000-0000-0000-000000000001',
   null, null, null, false, null),

  ('c1000000-0000-0000-0000-000000000007', 'b1000000-0000-0000-0000-000000000001',
   null, true, 'manual', 'repaso', 'pendiente', public.today_bog() + 5,
   null, null, null, null, null, null, false, null),

  ('c1000000-0000-0000-0000-000000000009', 'b1000000-0000-0000-0000-000000000001',
   null, true, 'ical', 'normal', 'pendiente', public.today_bog() + 10,
   'a5000000-0000-0000-0000-00000000000a', now(), 'ad000000-0000-0000-0000-000000000001',
   null, null, null, false, null),

  ('c1000000-0000-0000-0000-000000000004', 'b2000000-0000-0000-0000-000000000002',
   null, false, 'ical', 'normal', null, public.today_bog(),
   null, null, null, null, null, null, false, null),

  ('c1000000-0000-0000-0000-000000000003', 'b3000000-0000-0000-0000-000000000003',
   null, true, 'ical', 'normal', 'completada', public.today_bog() - 1,
   'a5000000-0000-0000-0000-00000000000a', now(), 'ad000000-0000-0000-0000-000000000001',
   now() - interval '5 hours', now() - interval '4 hours', null, false, null),

  ('c1000000-0000-0000-0000-000000000005', 'b3000000-0000-0000-0000-000000000003',
   null, true, 'ical', 'normal', 'pendiente', public.today_bog() + 1,
   null, null, null, null, null, null, true, 'reserva_movida_ventana_protegida'),

  ('c1000000-0000-0000-0000-000000000006', 'b3000000-0000-0000-0000-000000000003',
   null, true, 'ical', 'normal', 'pendiente', public.today_bog() + 2,
   null, null, null, null, null, null, false, null),

  ('c1000000-0000-0000-0000-000000000008', 'b3000000-0000-0000-0000-000000000003',
   null, true, 'ical', 'normal', 'pendiente', public.today_bog() + 4,
   null, null, null, null, null, null, false, null);

-- La notificación de la aserción 41. Va dirigida a la aseadora A: el admin no
-- puede tocarla.
insert into public.notifications
  (id, recipient_id, type, title, body, cleaning_id) values
  ('40000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-00000000000a',
   'asignacion', 'Nuevo aseo asignado', 'Tienes un aseo asignado.',
   'c1000000-0000-0000-0000-000000000001');


-- ===========================================================================
-- BLOQUE A — LA GUARDA DE ROL, LAS SEIS FUNCIONES (aserciones 1 a 12)
--
-- Dos aserciones por función y las dos son obligatorias:
--
--   (impar) invocada con el JWT de una aseadora ACTIVA levanta 42501;
--   (par)   la fila objetivo queda BYTE A BYTE igual después del intento.
--
-- La segunda no es decorativa. "Matching no rows is not proof on its own" está
-- citado en la cabecera de `00_rls_aseos.test.sql` y es doc oficial de
-- Supabase: una RPC puede devolver el error correcto DESPUÉS de haber escrito.
-- Con la migración 15 sin aplicar estas seis mitades salen verdes, y ese es el
-- comportamiento correcto: lo que miden es el día que la migración exista.
--
-- La aseadora A es ACTIVA a propósito. Con una desactivada, `private.is_admin()`
-- devolvería falso por dos razones distintas a la vez y la aserción dejaría de
-- distinguir "no es admin" de "no está activa".
-- ===========================================================================

insert into instantaneas (clave, valor) values
  ('a_pend',   pg_temp.fila_aseo('c1000000-0000-0000-0000-000000000001')),
  ('a_curso',  pg_temp.fila_aseo('c1000000-0000-0000-0000-000000000002')),
  ('a_review', pg_temp.fila_aseo('c1000000-0000-0000-0000-000000000005')),
  ('a_p1',     pg_temp.filas_de_prop('b1000000-0000-0000-0000-000000000001'));

-- 1
select is(
  split_part(pg_temp.intento_como(
    'a5000000-0000-0000-0000-00000000000a',
    $q$select public.reassign_cleaning(
         'c1000000-0000-0000-0000-000000000001',
         'a5000000-0000-0000-0000-00000000000b')$q$), '|', 1),
  '42501',
  'ASEO-04 una aseadora no puede reasignar: reassign_cleaning levanta 42501');

-- 2
select is(
  pg_temp.fila_aseo('c1000000-0000-0000-0000-000000000001'),
  (select max(valor) from instantaneas where clave = 'a_pend'),
  'ASEO-04 y el aseo quedó byte a byte igual tras el intento denegado');

-- 3
select is(
  split_part(pg_temp.intento_como(
    'a5000000-0000-0000-0000-00000000000a',
    $q$select public.create_manual_cleaning(
         'b1000000-0000-0000-0000-000000000001',
         public.today_bog() + 7,
         'repaso'::public.cleaning_type)$q$), '|', 1),
  '42501',
  'ASEO-05 una aseadora no puede crear un aseo manual: create_manual_cleaning levanta 42501');

-- 4  Aquí no hay fila objetivo previa, así que lo que se afirma es que NO
--    apareció ninguna: la lista de fechas del apartamento es la misma.
select is(
  pg_temp.filas_de_prop('b1000000-0000-0000-0000-000000000001'),
  (select max(valor) from instantaneas where clave = 'a_p1'),
  'ASEO-05 y el apartamento no ganó ningún aseo tras el intento denegado');

-- 5
select is(
  split_part(pg_temp.intento_como(
    'a5000000-0000-0000-0000-00000000000a',
    $q$select public.reschedule_cleaning(
         'c1000000-0000-0000-0000-000000000001',
         public.today_bog() + 9)$q$), '|', 1),
  '42501',
  'ASEO-06 una aseadora no puede reprogramar: reschedule_cleaning levanta 42501');

-- 6
select is(
  pg_temp.fila_aseo('c1000000-0000-0000-0000-000000000001'),
  (select max(valor) from instantaneas where clave = 'a_pend'),
  'ASEO-06 y el aseo quedó byte a byte igual tras el intento denegado');

-- 7
select is(
  split_part(pg_temp.intento_como(
    'a5000000-0000-0000-0000-00000000000a',
    $q$select public.close_cleaning('c1000000-0000-0000-0000-000000000002')$q$), '|', 1),
  '42501',
  'ASEO-08 una aseadora no puede cerrar a mano: close_cleaning levanta 42501');

-- 8
select is(
  pg_temp.fila_aseo('c1000000-0000-0000-0000-000000000002'),
  (select max(valor) from instantaneas where clave = 'a_curso'),
  'ASEO-08 y el aseo en curso quedó byte a byte igual tras el intento denegado');

-- 9
select is(
  split_part(pg_temp.intento_como(
    'a5000000-0000-0000-0000-00000000000a',
    $q$select public.cancel_cleaning('c1000000-0000-0000-0000-000000000001')$q$), '|', 1),
  '42501',
  'ASEO-09 una aseadora no puede cancelar: cancel_cleaning levanta 42501');

-- 10
select is(
  pg_temp.fila_aseo('c1000000-0000-0000-0000-000000000001'),
  (select max(valor) from instantaneas where clave = 'a_pend'),
  'ASEO-09 y el aseo quedó byte a byte igual tras el intento denegado');

-- 11
select is(
  split_part(pg_temp.intento_como(
    'a5000000-0000-0000-0000-00000000000a',
    $q$select public.clear_review_flag('c1000000-0000-0000-0000-000000000005')$q$), '|', 1),
  '42501',
  'una aseadora no puede apagar la marca de revisión: clear_review_flag levanta 42501');

-- 12
select is(
  pg_temp.fila_aseo('c1000000-0000-0000-0000-000000000005'),
  (select max(valor) from instantaneas where clave = 'a_review'),
  'y el aseo marcado quedó byte a byte igual tras el intento denegado');


-- ===========================================================================
-- BLOQUE B — reassign_cleaning (aserciones 13 a 17)
--
-- De aquí en adelante quien invoca es el ADMIN. Lo que se mide ya no es la
-- guarda, es el efecto.
-- ===========================================================================

insert into instantaneas (clave, valor) values
  ('b_p1', pg_temp.fila_prop('b1000000-0000-0000-0000-000000000001'));

select pg_temp.intento_como(
  'ad000000-0000-0000-0000-000000000001',
  $q$select public.reassign_cleaning(
       'c1000000-0000-0000-0000-000000000001',
       'a5000000-0000-0000-0000-00000000000b')$q$);

-- 13
select is(
  (select coalesce(string_agg(c.aseador_id::text, '+' order by c.id), '<sin fila>')
     from public.cleanings c where c.id = 'c1000000-0000-0000-0000-000000000001'),
  'a5000000-0000-0000-0000-00000000000b',
  'ASEO-04 reassign_cleaning deja el aseo a nombre de la aseadora destino');

-- 14  EL SEÑUELO DE D-18 Y EL MÁS IMPORTANTE DE LA FASE.
--
--     Reasignar es puntual: cambia el aseador de ESE aseo, nunca el responsable
--     ni el suplente del apartamento. Es la confusión más fácil de cometer y la
--     más cara de descubrir tarde, porque el síntoma no aparece en el aseo
--     reasignado sino en TODOS los aseos futuros de ese apartamento, semanas
--     después, cuando `confirm_cleaning` empiece a asignárselos a quien no toca.
--
--     Se compara la fila ENTERA del apartamento y no las dos columnas: así la
--     aserción tampoco deja pasar un cambio de tarifa o de hora límite colado
--     de rebote.
--
--     El segundo elemento es el CONTROL POSITIVO y sin él la aserción sería
--     vacua: "el apartamento no cambió" pasa en verde con la función sin crear.
--     Exigiendo a la vez que la reasignación SÍ ocurrió, la única forma de tener
--     las dos en verde es que la RPC exista y toque una sola tabla.
select is(
  array[
    (pg_temp.fila_prop('b1000000-0000-0000-0000-000000000001')
       = (select max(valor) from instantaneas where clave = 'b_p1'))::text,
    (select coalesce(max((c.aseador_id = 'a5000000-0000-0000-0000-00000000000b')::text),
                     'false')
       from public.cleanings c where c.id = 'c1000000-0000-0000-0000-000000000001')
  ],
  array['true', 'true'],
  'D-18 reassign_cleaning reasignó el aseo y dejó el apartamento byte a byte igual: no tocó responsable_id ni suplente_id');

-- 15  Una aseadora dada de baja no puede recibir trabajo. La FK sola no lo
--     impide: `is_active` no es parte de la clave. El `hint` tiene que hablar
--     de la aseadora, porque es el texto que `mapDbError()` devuelve tal cual
--     para P0001 y el que va a leer el admin en pantalla.
select is(
  array[
    split_part(pg_temp.intento_como(
      'ad000000-0000-0000-0000-000000000001',
      $q$select public.reassign_cleaning(
           'c1000000-0000-0000-0000-000000000001',
           'a5000000-0000-0000-0000-00000000000c')$q$), '|', 1),
    (pg_temp.intento_como(
      'ad000000-0000-0000-0000-000000000001',
      $q$select public.reassign_cleaning(
           'c1000000-0000-0000-0000-000000000001',
           'a5000000-0000-0000-0000-00000000000c')$q$) ilike '%aseador%')::text
  ],
  array['P0001', 'true'],
  'ASEO-04 NEG reasignar a una aseadora desactivada levanta P0001 y la pista nombra a la aseadora');

-- 16  La precondición no es una lista de estados, es "no hay trabajo hecho
--     todavía". Un aseo con `started_at` no nulo lleva encima la hora real de
--     inicio de OTRA persona, y reasignarlo se la atribuiría a la nueva.
select is(
  split_part(pg_temp.intento_como(
    'ad000000-0000-0000-0000-000000000001',
    $q$select public.reassign_cleaning(
         'c1000000-0000-0000-0000-000000000002',
         'a5000000-0000-0000-0000-00000000000b')$q$), '|', 1),
  'P0001',
  'ASEO-04 NEG un aseo con trabajo empezado no se reasigna: P0001, no se pisa el started_at ajeno');

-- 17  El aseo de gestión externa es una fila INERTE. La RPC tiene que cortar
--     antes con su propio P0001: si deja llegar el update, lo que sale es el
--     23514 crudo de `cl_unmanaged_is_inert`, que es un mensaje de base de datos
--     y no una explicación para el admin.
select is(
  split_part(pg_temp.intento_como(
    'ad000000-0000-0000-0000-000000000001',
    $q$select public.reassign_cleaning(
         'c1000000-0000-0000-0000-000000000004',
         'a5000000-0000-0000-0000-00000000000b')$q$), '|', 1),
  'P0001',
  'DASH-07 NEG un aseo de gestión externa no se reasigna: P0001 del admin, nunca el 23514 de cl_unmanaged_is_inert');


-- ===========================================================================
-- BLOQUE C — create_manual_cleaning (aserciones 18 a 22)
-- ===========================================================================

select pg_temp.intento_como(
  'ad000000-0000-0000-0000-000000000001',
  $q$select public.create_manual_cleaning(
       'b1000000-0000-0000-0000-000000000001',
       public.today_bog() + 7,
       'repaso'::public.cleaning_type)$q$);

-- 18  La forma completa del aseo recién nacido, en un solo hecho.
--
--     El insert de la RPC pone CINCO columnas: apartamento, origen, tipo, fecha
--     y el `reservation_id` implícito en null. Todo lo demás lo pone
--     `tg_cleanings_snapshot()`, y por eso la `hora_limite` esperada es la de
--     P1 (10:15) y no el default del schema: si la RPC la escribiera a mano
--     "para asegurarse", esta aserción no lo distinguiría, pero cambiar la hora
--     del apartamento en el futuro sí lo haría, y ahí está el valor.
select is(
  pg_temp.forma_aseo_en('b1000000-0000-0000-0000-000000000001', public.today_bog() + 7),
  'manual/estado:pendiente/confirmado_nulo:true/aseador_nulo:true/hora:10:15:00'
    || '/gestionado:true/tarifa:120000/pago:45000',
  'ASEO-05 el aseo manual nace sin confirmar, sin aseador y con hora y tarifas copiadas por el trigger');

-- 19  `normal` no es opción: los normales los crea el sync. Dejarlo pasar
--     abriría una segunda ruta de creación de aseos normales, invisible para el
--     reconcile.
select is(
  split_part(pg_temp.intento_como(
    'ad000000-0000-0000-0000-000000000001',
    $q$select public.create_manual_cleaning(
         'b1000000-0000-0000-0000-000000000001',
         public.today_bog() + 8,
         'normal'::public.cleaning_type)$q$), '|', 1),
  'P0001',
  'ASEO-05 NEG un aseo manual de tipo normal se rechaza: los normales los crea el sync');

-- 20  ASEO-07. EL NOMBRE DEL ÍNDICE TIENE QUE VIAJAR EN EL MENSAJE.
--
--     Esta aserción existe para impedir una "mejora" concreta: envolver el
--     insert en `exception when unique_violation then raise 'P0001'`. Con eso el
--     nombre del índice desaparece del mensaje, y el Server Action del plan
--     04-08 —que es quien tiene el nombre del apartamento y la fecha— deja de
--     poder reconocer el caso y de interpolar el mensaje de ASEO-07. El admin
--     pasa de leer "ya hay un aseo activo para Apto 101 el 12/09" a leer un
--     texto genérico que no le dice dónde.
--
--     Se afirman el código Y la presencia del literal, porque cualquiera de los
--     dos solo no basta: el código sin el nombre no identifica el índice, y el
--     nombre podría aparecer en un mensaje de otra clase.
select is(
  array[
    split_part(pg_temp.intento_como(
      'ad000000-0000-0000-0000-000000000001',
      $q$select public.create_manual_cleaning(
           'b1000000-0000-0000-0000-000000000001',
           public.today_bog() + 5,
           'repaso'::public.cleaning_type)$q$), '|', 1),
    (pg_temp.intento_como(
      'ad000000-0000-0000-0000-000000000001',
      $q$select public.create_manual_cleaning(
           'b1000000-0000-0000-0000-000000000001',
           public.today_bog() + 5,
           'repaso'::public.cleaning_type)$q$)
     like '%cleanings_one_active_per_property_date%')::text
  ],
  array['23505', 'true'],
  'ASEO-07 crear sobre apartamento y fecha ocupados propaga el 23505 CON el nombre del índice: la RPC no captura el unique_violation');

-- 21  Una unidad de gestión externa no recibe aseos manuales. Sin este corte, el
--     insert llegaría al trigger, que pondría `state` en null, y la fila nacería
--     inerte sin que nadie lo hubiera pedido.
select is(
  split_part(pg_temp.intento_como(
    'ad000000-0000-0000-0000-000000000001',
    $q$select public.create_manual_cleaning(
         'b2000000-0000-0000-0000-000000000002',
         public.today_bog() + 6,
         'repaso'::public.cleaning_type)$q$), '|', 1),
  'P0001',
  'DASH-07 NEG no se crean aseos manuales sobre una unidad de gestión externa');

-- 22  Un aseo en el pasado no es programable. El input del formulario ya lleva
--     `min`, y el input no autoriza nada: un Server Action es un endpoint HTTP
--     público.
select is(
  split_part(pg_temp.intento_como(
    'ad000000-0000-0000-0000-000000000001',
    $q$select public.create_manual_cleaning(
         'b1000000-0000-0000-0000-000000000001',
         public.today_bog() - 2,
         'repaso'::public.cleaning_type)$q$), '|', 1),
  'P0001',
  'ASEO-05 NEG no se crea un aseo manual con fecha anterior a hoy en Bogotá');


-- ===========================================================================
-- BLOQUE D — reschedule_cleaning (aserciones 23 a 26)
-- ===========================================================================

select pg_temp.intento_como(
  'ad000000-0000-0000-0000-000000000001',
  $q$select public.reschedule_cleaning(
       'c1000000-0000-0000-0000-000000000001',
       public.today_bog() + 12)$q$);

-- 23
select is(
  (select coalesce(string_agg(c.scheduled_date::text, '+' order by c.id), '<sin fila>')
     from public.cleanings c where c.id = 'c1000000-0000-0000-0000-000000000001'),
  (public.today_bog() + 12)::text,
  'ASEO-06 reschedule_cleaning mueve el aseo a la fecha nueva');

-- 24  LA DECISIÓN ESTRUCTURAL DE LA FASE (Pitfall 1).
--
--     Un aseo reprogramado a mano cumple el predicado del bucle de "reserva
--     movida" de `sync_feed_apply()` EXACTAMENTE IGUAL que uno cuya reserva se
--     movió de verdad: para el sync, "el aseo no está donde dice la reserva"
--     tiene una sola explicación. Treinta minutos después lo cancela con
--     `cancel_reason='reserva_movida'` y crea otro en la fecha vieja. El trabajo
--     del admin desaparece solo.
--
--     Desapuntar la reserva saca el aseo de TODAS las rutas destructivas del
--     reconcile, que sin excepción se anclan a `reservation_id`.
--
--     ESTA ASERCIÓN NO PRUEBA QUE EL MECANISMO FUNCIONE, prueba que está
--     puesto. La prueba de comportamiento —dos corridas encadenadas de
--     `sync_feed_apply()` sobre el mismo feed— vive en el plan 04-07 y es el
--     señuelo de mayor valor de toda la fase. Esta está aquí porque es barata y
--     porque señala el sitio.
select is(
  (select coalesce(max((c.reservation_id is null)::text), '<sin fila>')
     from public.cleanings c where c.id = 'c1000000-0000-0000-0000-000000000001'),
  'true',
  'Pitfall 1 reschedule_cleaning desapunta la reserva: sin reservation_id el sync no puede deshacer la reprogramación');

-- 25
select is(
  split_part(pg_temp.intento_como(
    'ad000000-0000-0000-0000-000000000001',
    $q$select public.reschedule_cleaning(
         'c1000000-0000-0000-0000-000000000002',
         public.today_bog() + 13)$q$), '|', 1),
  'P0001',
  'ASEO-06 NEG un aseo con trabajo empezado no se reprograma');

-- 26  Mismo contrato de mensaje que la aserción 20, y por la misma razón: el
--     UI-SPEC pone este error INLINE bajo el campo de fecha, y para eso el
--     Server Action tiene que reconocer el índice por su nombre.
select is(
  array[
    split_part(pg_temp.intento_como(
      'ad000000-0000-0000-0000-000000000001',
      $q$select public.reschedule_cleaning(
           'c1000000-0000-0000-0000-000000000001',
           public.today_bog() + 5)$q$), '|', 1),
    (pg_temp.intento_como(
      'ad000000-0000-0000-0000-000000000001',
      $q$select public.reschedule_cleaning(
           'c1000000-0000-0000-0000-000000000001',
           public.today_bog() + 5)$q$)
     like '%cleanings_one_active_per_property_date%')::text
  ],
  array['23505', 'true'],
  'ASEO-07 reprogramar sobre apartamento y fecha ocupados propaga el 23505 CON el nombre del índice');


-- ===========================================================================
-- BLOQUE E — close_cleaning (aserciones 27 a 30)
-- ===========================================================================

insert into instantaneas (clave, valor) values
  ('e_curso_inicio',
   (select coalesce(max(c.started_at::text), '<sin fila>')
      from public.cleanings c where c.id = 'c1000000-0000-0000-0000-000000000002'));

select pg_temp.intento_como(
  'ad000000-0000-0000-0000-000000000001',
  $q$select public.close_cleaning('c1000000-0000-0000-0000-000000000008')$q$);

-- 27  El cierre desde `pendiente` es la única ruta que se salta `start_cleaning`,
--     y `cl_completada_shape` no se relajó para ella: exige `started_at` y
--     `finished_at` no nulos con `finished_at >= started_at`. Un
--     `set state='completada', finished_at=now()` a secas revienta con 23514.
--
--     La escritura correcta es `started_at = coalesce(started_at, now())`.
--     Dentro de una misma sentencia `now()` es constante de transacción, así que
--     las dos marcas salen iguales y la desigualdad se cumple por igualdad. Un
--     refactor a la función de reloj no congelada lo rompería.
select is(
  (select coalesce(string_agg(
            c.state::text
              || '/inicio_nulo:' || (c.started_at is null)::text
              || '/fin_nulo:'    || (c.finished_at is null)::text
              || '/orden_ok:'    || coalesce((c.finished_at >= c.started_at)::text, 'false'),
            '+' order by c.id), '<sin fila>')
     from public.cleanings c where c.id = 'c1000000-0000-0000-0000-000000000008'),
  'completada/inicio_nulo:false/fin_nulo:false/orden_ok:true',
  'ASEO-08 close_cleaning desde pendiente completa el aseo sin romper cl_completada_shape');

-- 28  EL SEÑUELO DEL COALESCE.
--
--     Desde `en_curso` el aseo ya tiene un `started_at` REAL: es la hora a la
--     que la aseadora empezó. Sustituir el coalesce por la hora actual a secas
--     la borra y con ella la única evidencia de cuánto duró el trabajo.
--
--     El segundo elemento es el control positivo: sin él, "el started_at no
--     cambió" pasa en verde con la función sin crear.
select is(
  array[
    (select coalesce(max((c.started_at::text
              = (select max(valor) from instantaneas where clave = 'e_curso_inicio'))::text),
                     'false')
       from public.cleanings c where c.id = 'c1000000-0000-0000-0000-000000000002'),
    (select coalesce(max(c.state::text), '<sin fila>')
       from public.cleanings c where c.id = 'c1000000-0000-0000-0000-000000000002')
  ],
  array['true', 'en_curso'],
  'ASEO-08 el aseo en curso conserva intacto su started_at original antes de cerrarlo');

select pg_temp.intento_como(
  'ad000000-0000-0000-0000-000000000001',
  $q$select public.close_cleaning('c1000000-0000-0000-0000-000000000002')$q$);

-- 29  Y sigue conservándolo DESPUÉS del cierre. Esta es la mitad que el señuelo
--     pone en rojo: cambiar `coalesce(started_at, now())` por la hora actual
--     deja la aserción 27 en verde y esta en rojo.
select is(
  (select coalesce(string_agg(
            c.state::text
              || '/inicio:' || coalesce(c.started_at::text, '<null>'),
            '+' order by c.id), '<sin fila>')
     from public.cleanings c where c.id = 'c1000000-0000-0000-0000-000000000002'),
  'completada/inicio:' || (select max(valor) from instantaneas where clave = 'e_curso_inicio'),
  'ASEO-08 cerrar un aseo en curso NO pisa su started_at: es la hora real en que empezó el trabajo');

-- 30  Dos cosas en un solo hecho, y van juntas a propósito.
--
--     (a) Sobre un aseo ya `completada` la RPC corta con SU propio P0001. Si
--         deja llegar el update, quien lanza es la guarda de transiciones del
--         trigger, con `transicion_invalida` y una pista sobre la máquina de
--         estados: correcta para un desarrollador, inútil para el admin.
--     (b) close_cleaning NO escribe en `notifications`. Es decisión explícita y
--         no un olvido: el aseo se cierra porque la realidad ya lo resolvió por
--         fuera del sistema, y avisar "terminaste" a quien no ejecutó nada es
--         ruido en el panel de alertas, que se alimenta de esa misma tabla.
select is(
  array[
    split_part(pg_temp.intento_como(
      'ad000000-0000-0000-0000-000000000001',
      $q$select public.close_cleaning('c1000000-0000-0000-0000-000000000003')$q$), '|', 1),
    (pg_temp.intento_como(
      'ad000000-0000-0000-0000-000000000001',
      $q$select public.close_cleaning('c1000000-0000-0000-0000-000000000003')$q$)
     not ilike '%transicion_invalida%')::text,
    (select count(*)::text from public.notifications n
      where n.cleaning_id in ('c1000000-0000-0000-0000-000000000008',
                              'c1000000-0000-0000-0000-000000000002'))
  ],
  array['P0001', 'true', '0'],
  'ASEO-08 cerrar un aseo ya cerrado da el P0001 del admin y no el del trigger, y ningún cierre manual encola notificación');


-- ===========================================================================
-- BLOQUE F — cancel_cleaning (aserciones 31 a 33)
-- ===========================================================================

insert into instantaneas (clave, valor) values
  ('f_done', pg_temp.fila_aseo('c1000000-0000-0000-0000-000000000003'));

select pg_temp.intento_como(
  'ad000000-0000-0000-0000-000000000001',
  $q$select public.cancel_cleaning('c1000000-0000-0000-0000-000000000009')$q$);

-- 31  El slug es LITERAL dentro del cuerpo de la función, nunca parámetro. Es
--     regla explícita de la migración 13: `cancel_reason` es lista cerrada
--     porque es una columna que un humano lee en pantalla, y aceptarla como
--     parámetro abriría una ruta de texto libre hacia el payload de
--     notificaciones. La aserción 36 lo defiende estructuralmente.
select is(
  (select coalesce(string_agg(
            c.state::text
              || '/cancelado_nulo:' || (c.cancelled_at is null)::text
              || '/motivo:' || coalesce(c.cancel_reason, '<null>'),
            '+' order by c.id), '<sin fila>')
     from public.cleanings c where c.id = 'c1000000-0000-0000-0000-000000000009'),
  'cancelada/cancelado_nulo:false/motivo:cancelado_por_admin',
  'ASEO-09 cancel_cleaning marca cancelled_at y escribe el slug cerrado cancelado_por_admin');

-- 32  EL SEÑUELO DE "NO INSERTAR A MANO EN LA BITÁCORA".
--
--     El trigger `cleanings_log_transition` es AFTER UPDATE OF state y ya
--     escribe la fila, copiando `cancel_reason` a `reason` cuando el destino es
--     `cancelada`. Una inserción a mano dentro de la RPC produce DOS filas, y la
--     de mano es la mentirosa: lleva el `actor_id` que le pongan en vez del que
--     resuelve `auth.uid()`.
--
--     Se cuenta y se lee el motivo a la vez: contar solo dejaría pasar una fila
--     única con el motivo equivocado.
select is(
  pg_temp.transiciones('c1000000-0000-0000-0000-000000000009'),
  '1/cancelado_por_admin',
  'ASEO-09 queda EXACTAMENTE una fila en la bitácora, la del trigger, con el motivo del admin');

-- 33  `completada` es terminal. La RPC corta antes con su P0001 y no mueve nada:
--     las dos mitades, otra vez, porque el error correcto sobre una fila ya
--     modificada no probaría nada.
select is(
  array[
    split_part(pg_temp.intento_como(
      'ad000000-0000-0000-0000-000000000001',
      $q$select public.cancel_cleaning('c1000000-0000-0000-0000-000000000003')$q$), '|', 1),
    (pg_temp.fila_aseo('c1000000-0000-0000-0000-000000000003')
       = (select max(valor) from instantaneas where clave = 'f_done'))::text
  ],
  array['P0001', 'true'],
  'ASEO-09 NEG cancelar un aseo ya completado da P0001 y lo deja byte a byte igual');


-- ===========================================================================
-- BLOQUE G — clear_review_flag (aserciones 34 y 35)
--
-- La sexta RPC. No la lista D-17 y no la nombra ningún requisito, pero la
-- migración 13 dice literalmente que `needs_review` es pegajoso y que "solo el
-- admin lo apaga, en la Fase 4". Sin esta función esa frase queda incumplida y
-- la marca se enciende para siempre.
-- ===========================================================================

insert into instantaneas (clave, valor) values
  ('g_sinrev', pg_temp.fila_aseo('c1000000-0000-0000-0000-000000000006'));

select pg_temp.intento_como(
  'ad000000-0000-0000-0000-000000000001',
  $q$select public.clear_review_flag('c1000000-0000-0000-0000-000000000005')$q$);

-- 34  Se apagan las DOS columnas. Dejar `review_reason` con el slug de un
--     motivo ya atendido es peor que dejarlo en null: la UI lo renderizaría
--     como una explicación vigente de algo que el admin ya resolvió.
select is(
  (select coalesce(string_agg(
            c.needs_review::text
              || '/motivo:' || coalesce(c.review_reason, '<null>'),
            '+' order by c.id), '<sin fila>')
     from public.cleanings c where c.id = 'c1000000-0000-0000-0000-000000000005'),
  'false/motivo:<null>',
  'clear_review_flag apaga la marca de revisión y borra su motivo');

-- 35  Sobre un aseo que ya la tiene apagada es un no-op SILENCIOSO. Levantar
--     ahí sería castigar el doble clic y la recarga de la página, que es
--     exactamente lo que va a pasar en el panel de alertas.
--
--     Y tiene que ser un no-op de verdad: la fila entera igual, `updated_at`
--     incluido. Un update que escribe `needs_review = false` sobre algo que ya
--     era falso mueve `updated_at` y con Realtime encima manda un evento por la
--     red que reordena la pantalla del admin sin que nada haya cambiado.
select is(
  array[
    split_part(pg_temp.intento_como(
      'ad000000-0000-0000-0000-000000000001',
      $q$select public.clear_review_flag('c1000000-0000-0000-0000-000000000006')$q$), '|', 1),
    (pg_temp.fila_aseo('c1000000-0000-0000-0000-000000000006')
       = (select max(valor) from instantaneas where clave = 'g_sinrev'))::text
  ],
  array['sin_error', 'true'],
  'clear_review_flag sobre un aseo ya revisado no lanza y no escribe: es un no-op de verdad');


-- ===========================================================================
-- BLOQUE H — GUARDARRAÍLES ESTRUCTURALES SOBRE pg_get_functiondef
--            (aserciones 36 a 38)
--
-- Hay una capa que ninguna aserción de comportamiento puede defender: que una
-- columna de lista cerrada NO se pueda escribir desde fuera. Se puede escribir
-- una RPC que acepte `p_motivo text`, lo guarde en `cancel_reason`, y que TODAS
-- las aserciones de comportamiento de este archivo sigan en verde, porque las
-- llamadas de arriba no le pasarían ese parámetro. La única defensa posible es
-- leer el cuerpo de la función.
--
-- Mismo mecanismo que la aserción 50 de `05_sync.test.sql`. Los comentarios se
-- quitan ANTES de buscar (ver `pg_temp.cuerpo`).
-- ===========================================================================

-- 36  `cancel_reason` es lista cerrada: `reserva_desaparecida` y `reserva_movida`
--     los escribe la migración 13, y `cancelado_por_admin` lo escribe esta fase.
--     Los tres son literales dentro del cuerpo de quien los escribe.
--
--     El patrón busca la asignación DESDE UN PARÁMETRO (`p_…`), que es la forma
--     que abre la ruta de texto libre. Y el segundo elemento es el control
--     positivo obligatorio: sin él la aserción pasa en verde con las seis
--     funciones sin crear, que es el falso verde por ausencia.
select is(
  array[
    pg_temp.cuenta(pg_temp.cuerpos_admin(), 'cancel_reason\s*=\s*p_')::text,
    pg_temp.cuantas_existen()::text
  ],
  array['0', '6'],
  'ninguna de las seis RPC del admin asigna cancel_reason desde un parámetro: el slug es literal');

-- 37  Los seis slugs de `review_reason` los escribe solo la migración 13 y
--     ninguna RPC de esta fase los toca. `clear_review_flag` lo pone en null y
--     nada más.
select is(
  array[
    pg_temp.cuenta(pg_temp.cuerpos_admin(), 'review_reason\s*=\s*p_')::text,
    pg_temp.cuantas_existen()::text
  ],
  array['0', '6'],
  'ninguna de las seis RPC del admin asigna review_reason desde un parámetro');

-- 38  EL ACOPLAMIENTO CON TYPESCRIPT, CERRADO POR EL LADO SQL.
--
--     La alerta de "el calendario se murió" tiene dos mitades: la que el
--     watchdog escribe en `notifications` y la que se computa AL LEER en
--     `lib/domain/salud-sync.ts`. Las dos tienen que usar el MISMO umbral, o el
--     panel dice "sano" mientras el watchdog manda alertas, o al revés.
--
--     El espejo en TypeScript (`UMBRAL_SYNC_CAIDA_MS = 3*60*60*1000`) lo afirma
--     el plan 04-04. Esta es su mitad SQL. Las dos ocurrencias son el conteo del
--     filtro de obsoletos y el del array de ids; una tercera, o dos con valores
--     distintos, significa que alguien cambió una y olvidó la otra.
--
--     Esta aserción está VERDE desde el primer momento: mide la migración 14,
--     que ya existe. Está aquí porque las migraciones de esta fase podrían
--     romperla, y entonces el rojo aparecería acá y no con un panel mintiendo.
select is(
  pg_temp.cuenta(pg_temp.cuerpo('feed_health_watchdog'), 'interval\s+''3 hours'''),
  2,
  'feed_health_watchdog sigue usando interval 3 hours exactamente dos veces: el umbral del watchdog y el del panel no se pueden separar');


-- ===========================================================================
-- BLOQUE I — PUBLICACIÓN DE REALTIME (aserciones 39 y 40)
--
-- D-13: la pantalla se actualiza sola. El admin la deja abierta todo el día y
-- el motor de sync corre cada 30 minutos: sin refresco actúa sobre un mundo
-- viejo. Realtime sobre `postgres_changes` NO entrega nada de una tabla que no
-- esté en la publicación `supabase_realtime`, y el fallo es SILENCIOSO: el
-- canal se suscribe, dice `SUBSCRIBED`, y no llega un solo evento nunca.
--
-- Se cuenta la fila del catálogo y se exige 1, en vez de preguntar "no falta
-- ninguna": escrita en negativo pasaría en verde con la publicación entera sin
-- crear.
-- ===========================================================================

-- 39
select is(
  (select count(*)::int
     from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'cleanings'),
  1,
  'D-13 public.cleanings está publicada en supabase_realtime: sin eso el canal se suscribe y no llega un solo evento');

-- 40
select is(
  (select count(*)::int
     from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'),
  1,
  'D-13 public.notifications está publicada en supabase_realtime: es la fuente del panel de alertas');


-- ===========================================================================
-- BLOQUE J — notifications (aserción 41)
--
-- La única tabla del esquema donde el admin NO tiene acceso total, y es
-- deliberado: la campana de un usuario es suya. `notifications` tiene
-- `grant select, update` DE TABLA, así que el corte no es de privilegio sino de
-- policy: `notifications_own_update` acota las filas con `using` y repite la
-- condición en `with check` para que nadie se reasigne una ajena cambiando
-- `recipient_id`.
--
-- El update no lanza: afecta CERO filas en silencio. Por eso la aserción no
-- mira el error, mira la fila, que es la única evidencia real.
--
-- Esta aserción está VERDE desde el primer momento: la policy ya existe. Está
-- aquí porque la marca de "alerta atendida" del plan 04-09 escribe justamente
-- esta columna, y una policy relajada por descuido convertiría el panel del
-- admin en una ventana a la bandeja de sus aseadoras.
-- ===========================================================================

select pg_temp.intento_como(
  'ad000000-0000-0000-0000-000000000001',
  $q$update public.notifications
        set read_at = now()
      where id = '40000000-0000-0000-0000-000000000001'$q$);

-- 41
select is(
  (select coalesce(max((n.read_at is null)::text), '<sin fila>')
     from public.notifications n
    where n.id = '40000000-0000-0000-0000-000000000001'),
  'true',
  'el admin no puede marcar como leída la notificación de otra persona: notifications_own_update la filtra');


select * from finish();
rollback;
