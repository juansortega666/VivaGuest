-- ============================================================================
-- 07_push.test.sql — el contrato ejecutable del schema de avisos (Web Push)
--
-- ESTE ARCHIVO NACE EN ROJO, A PROPÓSITO. Es Wave 0 de la Fase 5: enumera, antes
-- de que exista una línea de la migración 16, los invariantes que esa migración
-- tiene que hacer verdaderos. Ninguna tarea posterior de la fase puede
-- declararse hecha con una verificación inventada sobre la marcha: la
-- verificación ya está escrita aquí y ya falla.
--
-- QUIÉN LO PONE EN VERDE: la Task 3 de ESTE MISMO plan (05-02), que aplica la
-- migración 16 `20260911120000_16_push_avisos.sql` con el enum de grado, las
-- siete columnas, el CHECK de coherencia, el índice parcial del token, los
-- grants POR COLUMNA y las tres funciones `security definer`.
--
-- CONSECUENCIA OPERATIVA, y hay que conocerla antes de tocar nada: en cuanto la
-- migración 16 esté aplicada, un `not ok` en este archivo YA NO ES ESPERADO. Es
-- una regresión. La lectura de "cuántos rojos hay" cambia de signo ese día,
-- exactamente igual que pasó con `05_sync.test.sql` en el plan 03-07 y con
-- `06_aseos_admin.test.sql` en el 04-05. El hábito de "es normal que este
-- archivo esté rojo" pasa a ser, a partir de ahí, exactamente el error.
--
-- ── QUÉ PROTEGE ESTE ARCHIVO Y POR QUÉ NO ES DECORATIVO ───────────────────
--
-- La migración 07 le dio a `authenticated` un `grant update` DE TABLA sobre
-- `push_subscriptions`, con el comentario "la única tabla que el aseador escribe
-- libremente". Con ese grant, un aseador puede escribir `verificado_at` él
-- mismo. Si eso se queda así, el estado `Activos` de `05-UI-SPEC.md` §5.2 es
-- AUTOCERTIFICADO y la única verificación de la fase es teatro: el aseador firma
-- el acta de que le llegó un aviso que nunca llegó.
--
-- El grupo C es esa propiedad, escrita como cuatro hechos separados por
-- privilegio. Están separados a propósito: agrupar los ocho en una sola
-- aserción esconde CUÁL se rompió el día que alguien "simplifique" el grant.
--
-- El grupo E protege lo contrario y es igual de concreto: el admin necesita
-- saber quién quedó mudo (D-03) y NO puede recibir por ello el `endpoint`, el
-- `p256dh` ni el `auth`. El endpoint es una credencial PORTADORA: quien lo tiene
-- puede mandarle avisos a ese teléfono. Por eso no se añade ninguna policy de
-- admin sobre la tabla y toda la superficie de D-03 es
-- `public.estado_avisos_aseadores()`, cuyo `returns table` no tiene ranura para
-- ninguna de las tres. La aserción 54 lo afirma consultando el CATÁLOGO y no
-- leyendo filas: leer filas solo demuestra que hoy no salió ninguna credencial,
-- no que no quepa.
--
-- ── POR QUÉ EL GRUPO E VA DESPUÉS DE F Y G, Y NO EN ORDEN ALFABÉTICO ──────
--
-- `estado_avisos_aseadores()` se mide sobre un estado que hay que CONSTRUIR: un
-- aseador con dos teléfonos y uno de ellos confirmado por toque. Ese estado no
-- se puede sembrar con un `insert`, porque las columnas de evidencia no son
-- escribibles ni siquiera desde el fixture: la migración las deja fuera del
-- grant y solo las mueven las tres funciones. Construirlo es, literalmente,
-- llamar a las funciones de F y de G. De ahí el orden de ejecución
-- A · B · C · D · F · G · E · H. Las letras son las del plan; el orden es el que
-- impone la dependencia de datos.
--
-- ── CÓMO SE LEE EL ROJO ───────────────────────────────────────────────────
--
-- No basta con contar las líneas `not ok`: dos regresiones no relacionadas se
-- cancelan en el agregado. Las tres comprobaciones, las mismas que fijó el plan
-- 03-05 y repitió el 04-01, son:
--
--   1. `ok + not ok` = el número del `plan(N)` declarado. Si el total es menor,
--      el archivo ABORTÓ a mitad y las aserciones que faltan no se midieron: un
--      conteo bajo puede ser una mejora o un incendio.
--   2. La lista de identificadores en rojo contra la esperada, no el total.
--      `pg_prove` ya la imprime literal (`Failed tests: 1, 3, …`).
--   3. Que la ÚLTIMA aserción del archivo aparezca en la salida.
--
-- Identificadores en rojo esperados, por plan. MEDIDO al ejecutar el archivo el
-- 2026-09-11, no estimado:
--
--   tras 05-02 Task 1 (archivo nuevo)   1 … 21  y  24 … 54       (cincuenta y dos)
--   tras 05-02 Task 3 (migración 16)    —                        (NINGUNA)
--
-- CINCO ASERCIONES NACEN EN VERDE Y NINGUNA ES VACUIDAD. Son propiedades que ya
-- existen y que esta migración podría romper:
--
--   · 22 y 23, el grupo D. Miden la policy `push_subs_own_all` de la migración
--     08, que este plan NO cambia. Su valor es precisamente ese: si el grupo C
--     acota los grants y de paso alguien "aprovecha" para tocar la policy, estas
--     dos son las que lo dicen.
--   · 55, 56 y 57, el grupo H. Miden `notifications`, que existe desde la
--     migración 06 y que esta migración no toca. El panel de alertas de la Fase
--     4 y el drenaje de push leen exactamente esas cinco columnas de outbox,
--     esas tres de bandeja y esos tres índices. Se ponen rojas el día que
--     alguien decida "aprovechar" la migración de avisos para reorganizar la
--     tabla de notificaciones.
--
-- ── POR QUÉ NINGUNA LLAMADA A LAS FUNCIONES NUEVAS VA SUELTA ─────────────
--
-- Una función que no existe no da `not ok`: da `42883 undefined_function`, que
-- ABORTA la transacción entera y se lleva por delante el archivo completo,
-- incluidas las aserciones que sí podían medirse. Lo mismo hace una COLUMNA que
-- no existe (`42703`). Y este archivo nace con tres funciones y siete columnas
-- inexistentes, así que el incendio no es hipotético: es el caso por defecto.
--
-- Por eso TODA invocación y TODA lectura de algo que la migración 16 todavía no
-- creó pasa por un helper de `pg_temp` que la envuelve en un bloque con
-- manejador y devuelve un VALOR COMPARABLE (`<sin funcion>`, `<sin columna>`,
-- `<error:42703>`, `42501|mensaje|pista`). Las aserciones comparan ese valor.
-- Ese desdoblamiento es lo que permite que el archivo nazca rojo de forma
-- legible en vez de reventar en la tercera línea.
--
-- Y la segunda forma del mismo incendio, medida en 03-05: una subconsulta
-- ESCALAR que devuelve dos filas no da `not ok`, da `more than one row returned
-- by a subquery used as an expression`, y aborta igual. Por eso toda lectura de
-- catálogo de este archivo va agregada (`string_agg`, `count`), incluso donde
-- la clave primaria garantiza una sola fila.
--
-- ── RESTRICCIONES DEL REPO QUE ESTE ARCHIVO RESPETA ──────────────────────
--
--   · NO se escribe `create extension … pgtap` dentro del archivo. La crea y la
--     borra `supabase test db` en cada corrida, y crearla aquí sin `with schema
--     extensions` la mete en `public` y pone en rojo, de mentira, los
--     guardarraíles 3, 4 y 9 de `02_guardarrailes.test.sql`.
--   · Los helpers viven en `pg_temp` y mueren con la transacción: no aparecen en
--     `public` ni en `private`, así que no los alcanzan esos guardarraíles.
--   · Las fechas de negocio salen de `public.today_bog()`. La función de fecha
--     que el guardarraíl 4 de CI prohíbe no se nombra aquí ni en los comentarios.
--   · Todo va entre `begin;` y `rollback;`, como los otros SIETE archivos. Son
--     siete y no seis: `00` a `06`. Con este, la suite pasa a ocho archivos y
--     `pg_prove` imprime `Files=8`. El plan 05-02 dice "seis anteriores" y
--     "siete en total"; está desfasado en uno y lo correcto es lo que imprime la
--     herramienta.
--
-- ── CÓMO CORRER SOLO ESTE ARCHIVO ────────────────────────────────────────
--
--   { echo 'begin;';
--     echo 'create extension if not exists pgtap with schema extensions;';
--     sed '0,/^begin;$/s/^begin;$//' supabase/tests/07_push.test.sql;
--   } | docker exec -i supabase_db_vivaguest psql -U postgres -d postgres -qAtX -f -
--
-- Las banderas `-A -t` importan: sin ellas psql imprime cada línea TAP dentro de
-- una tabla con cabecera y con un espacio delante, y un `grep '^not ok'` sobre
-- esa salida devuelve CERO con el archivo entero en rojo. Es un falso verde de
-- la herramienta de medición, no del código.
-- ============================================================================

begin;
select plan(57);

-- ---------------------------------------------------------------------------
-- Limpieza del seed, en orden inverso de FK. El rollback la deshace.
-- Mismo orden que `06_aseos_admin.test.sql`, más `push_subscriptions`, que va
-- antes que `profiles` aunque su FK sea `on delete cascade`: explícito se lee.
-- ---------------------------------------------------------------------------
delete from public.cleaning_state_transitions;
delete from public.access_code_reads;
delete from public.notifications;
delete from public.push_subscriptions;
delete from public.cleanings;
delete from public.calendar_reservations;
delete from public.calendar_feeds;
delete from public.property_secrets;
delete from public.properties;
delete from public.profiles;
delete from auth.users;

-- ===========================================================================
-- FIXTURES
--
-- Ninguno nombra una columna que la migración 16 todavía no creó. Si un fixture
-- escribiera `verificado_at`, el archivo entero moriría con 42703 antes de la
-- primera aserción, que es justo el incendio que la cabecera describe.
--
--   A  aseador activo, tres suscripciones: dos vivas y una revocada
--   B  aseador activo, una suscripción viva
--   C  aseador activo, CERO suscripciones  -> es el estado `Sin avisos` de §5.2
--   D  aseador DESACTIVADO con una suscripción viva -> no debe salir en D-03
--   E  admin
-- ===========================================================================
insert into auth.users (id, email) values
  ('0a000000-0000-0000-0000-00000000000a', 'a@vg.co'),
  ('0b000000-0000-0000-0000-00000000000b', 'b@vg.co'),
  ('0c000000-0000-0000-0000-00000000000c', 'c@vg.co'),
  ('0d000000-0000-0000-0000-00000000000d', 'd@vg.co'),
  ('0e000000-0000-0000-0000-00000000000e', 'admin@vg.co');

insert into public.profiles (id, role, full_name, is_active, deactivated_at) values
  ('0a000000-0000-0000-0000-00000000000a', 'aseador', 'Aseadora A',              true,  null),
  ('0b000000-0000-0000-0000-00000000000b', 'aseador', 'Aseadora B',              true,  null),
  ('0c000000-0000-0000-0000-00000000000c', 'aseador', 'Aseadora C SIN TELEFONO', true,  null),
  ('0d000000-0000-0000-0000-00000000000d', 'aseador', 'Aseadora D DESACTIVADA',  false, now()),
  ('0e000000-0000-0000-0000-00000000000e', 'admin',   'Admin',                   true,  null)
on conflict (id) do update
  set role           = excluded.role,
      full_name      = excluded.full_name,
      is_active      = excluded.is_active,
      deactivated_at = excluded.deactivated_at;

insert into public.push_subscriptions
  (id, user_id, endpoint, p256dh, auth, user_agent, revoked_at, revoked_reason) values
  ('51000000-0000-0000-0000-000000000001', '0a000000-0000-0000-0000-00000000000a',
   'https://push.test/a1', 'p256dh-a1', 'auth-a1', 'iPhone/A1', null, null),
  ('51000000-0000-0000-0000-000000000002', '0a000000-0000-0000-0000-00000000000a',
   'https://push.test/a2', 'p256dh-a2', 'auth-a2', 'Android/A2', null, null),
  -- Revocada: cuenta para el `select` del aseador (aserción 23) y NO cuenta como
  -- suscripción viva en D-03 (aserción 53). Las dos lecturas son distintas a
  -- propósito y esta fila es la que las separa.
  ('51000000-0000-0000-0000-000000000003', '0a000000-0000-0000-0000-00000000000a',
   'https://push.test/a3', 'p256dh-a3', 'auth-a3', 'Android/A3', now(), '410 Gone'),
  ('51000000-0000-0000-0000-000000000004', '0b000000-0000-0000-0000-00000000000b',
   'https://push.test/b1', 'p256dh-b1', 'auth-b1', 'iPhone/B1', null, null),
  ('51000000-0000-0000-0000-000000000005', '0d000000-0000-0000-0000-00000000000d',
   'https://push.test/d1', 'p256dh-d1', 'auth-d1', 'iPhone/D1', null, null);

-- ===========================================================================
-- HELPERS. Todos en pg_temp: mueren con la transacción.
-- ===========================================================================

-- Cambia la identidad de la sesión. Con NULL vuelve a `postgres`, que es lo que
-- permite leer la base sin RLS en la aserción siguiente.
--
-- El rol NO se lee del JWT en ninguna parte de VivaGuest: `private.is_admin()`
-- consulta `profiles`. Por eso lo que se inyecta es un `sub` real y no un
-- `role: 'admin'`, que no serviría de nada.
create function pg_temp.autenticar(p_uid uuid) returns void
language plpgsql as $fn$
begin
  if p_uid is null then
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', '', true);
  else
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  end if;
end $fn$;

-- La envoltura que impide que el archivo reviente. Ejecuta `p_consulta` con la
-- identidad de `p_uid` y devuelve `sqlstate|mensaje|pista`, o `sin_error||` si
-- no lanzó. NUNCA propaga la excepción.
--
-- El cambio de rol ocurre DENTRO del bloque con manejador, así que cuando la
-- consulta lanza, la subtransacción restituye el rol sola. En la rama de éxito
-- se restituye a mano. En las dos, quien llama vuelve a ser `postgres`.
create function pg_temp.intento_como(p_uid uuid, p_consulta text) returns text
language plpgsql as $fn$
declare
  v_estado  text;
  v_mensaje text;
  v_pista   text;
begin
  begin
    perform pg_temp.autenticar(p_uid);
    execute p_consulta;
    perform pg_temp.autenticar(null);
    return 'sin_error||';
  exception when others then
    get stacked diagnostics
      v_estado  = returned_sqlstate,
      v_mensaje = message_text,
      v_pista   = pg_exception_hint;
    perform pg_temp.autenticar(null);
    return v_estado || '|' || coalesce(v_mensaje, '') || '|' || coalesce(v_pista, '');
  end;
end $fn$;

-- Igual que la anterior, pero devuelve el VALOR de la consulta en vez del
-- diagnóstico. Es lo que permite capturar el token que devuelve
-- `registrar_prueba_de_aviso()` sin que su ausencia mate el archivo.
create function pg_temp.valor_como(p_uid uuid, p_sql text) returns text
language plpgsql as $fn$
declare v text;
begin
  begin
    perform pg_temp.autenticar(p_uid);
    execute p_sql into v;
    perform pg_temp.autenticar(null);
    return coalesce(v, '<null>');
  exception when others then
    perform pg_temp.autenticar(null);
    return '<error:' || sqlstate || '>';
  end;
end $fn$;

-- El estado de verificación de una suscripción, como una sola cadena comparable:
--   grado / hay_verificado_at / token / intentos / hubo_envio
-- Devuelve `<error:42703>` mientras las columnas no existan, en vez de abortar.
-- Agregada con `max` aunque `endpoint` sea UNIQUE: una segunda fila aparecería
-- entonces en el valor comparado en vez de matar el archivo (incendio 2 de
-- 03-05).
create function pg_temp.sub(p_endpoint text) returns text
language plpgsql as $fn$
declare v text;
begin
  execute format($q$
    select max(coalesce(s.verificacion_grado::text, '<null>')
               || '/' || (s.verificado_at is not null)::text
               || '/' || coalesce(s.verificacion_token::text, '<null>')
               || '/' || s.verificacion_intentos::text
               || '/' || (s.verificacion_enviada_at is not null)::text)
      from public.push_subscriptions s
     where s.endpoint = %L $q$, p_endpoint)
  into v;
  return coalesce(v, '<sin fila>');
exception when others then
  return '<error:' || sqlstate || '>';
end $fn$;

-- `has_column_privilege` sobre una columna inexistente lanza 42703. Este helper
-- lo convierte en el valor `<sin columna>`, que es lo que se ve mientras la
-- migración 16 no esté aplicada.
create function pg_temp.priv_col(p_col text, p_priv text) returns text
language plpgsql as $fn$
begin
  return has_column_privilege(
    'authenticated'::name, 'public.push_subscriptions'::text, p_col::text, p_priv::text)::text;
exception when others then
  return '<sin columna>';
end $fn$;

-- `to_regprocedure` devuelve NULL en vez de lanzar cuando la función no existe:
-- es la única forma de preguntar por una función inexistente sin abortar.
create function pg_temp.existe_funcion(p_firma text) returns text
language plpgsql as $fn$
begin
  return case when to_regprocedure(p_firma) is null then 'no' else 'si' end;
end $fn$;

create function pg_temp.es_definer(p_firma text) returns text
language plpgsql as $fn$
declare o oid;
begin
  o := to_regprocedure(p_firma);
  if o is null then return '<sin funcion>'; end if;
  return (select p.prosecdef::text from pg_proc p where p.oid = o);
end $fn$;

-- Se pregunta por `anon` y no por PUBLIC porque PUBLIC no es un rol: un grant a
-- PUBLIC alcanza a TODOS los roles, `anon` incluido, así que `anon` es el
-- detector. Es el mismo razonamiento del guardarraíl 9 de
-- `02_guardarrailes.test.sql`, que también evalúa `has_function_privilege` en
-- vez de leer `information_schema.routine_privileges` (esa vista no lista los
-- privilegios de PUBLIC como tales, y una función con `proacl` NULL —el caso por
-- defecto, y el peligroso— le sale limpia).
create function pg_temp.puede_ejecutar(p_rol text, p_firma text) returns text
language plpgsql as $fn$
declare o oid;
begin
  o := to_regprocedure(p_firma);
  if o is null then return '<sin funcion>'; end if;
  return has_function_privilege(p_rol, o, 'execute')::text;
end $fn$;

-- Bolsa de valores capturados entre aserciones (tokens, diagnósticos). Es
-- `pg_temp`, así que muere con la transacción.
create temporary table anotaciones (k text primary key, v text) on commit drop;


-- ===========================================================================
-- A. LA FORMA DE LAS SIETE COLUMNAS NUEVAS DE push_subscriptions
-- ===========================================================================

-- 1
select has_column('public', 'push_subscriptions', 'soporta_declarativo',
  'D-07 push_subscriptions.soporta_declarativo: el cliente declara si el destino soporta el formato declarativo');

-- 2
select has_column('public', 'push_subscriptions', 'verificado_at',
  'D-02 push_subscriptions.verificado_at: cuándo llegó el aviso de prueba a ESTE dispositivo');

-- 3
select has_column('public', 'push_subscriptions', 'verificacion_grado',
  'UI-SPEC §8.6 push_subscriptions.verificacion_grado: por toque o a mano, y el admin ve cuál fue');

-- 4
select has_column('public', 'push_subscriptions', 'verificacion_token',
  'push_subscriptions.verificacion_token: el token vivo del último aviso de prueba, de un solo uso');

-- 5
select has_column('public', 'push_subscriptions', 'verificacion_enviada_at',
  'push_subscriptions.verificacion_enviada_at: sin envío previo no hay nada que confirmar a mano');

-- 6
select has_column('public', 'push_subscriptions', 'verificacion_intentos',
  'UI-SPEC §8.7 push_subscriptions.verificacion_intentos: el tope de tres, contado en la base');

-- 7
select has_column('public', 'push_subscriptions', 'visto_at',
  'UI-SPEC §5.2 push_subscriptions.visto_at: alimenta el title del tooltip del admin');

-- 8  El enum nuevo es `grado_verificacion_aviso`, NO `notification_type`. Ese
--    último tiene once valores, es decisión fijada en el plan 03-03, y esta
--    migración no lo toca.
select col_type_is('public', 'push_subscriptions', 'verificacion_grado',
  'public.grado_verificacion_aviso',
  'verificacion_grado es del enum nuevo public.grado_verificacion_aviso');

-- 9  PARCIAL, por la misma razón que `notifications_dedupe_idx`: sin el `where`,
--    la semántica de los NULL dentro de un único queda al azar del motor, y aquí
--    la inmensa mayoría de las filas tiene el token en NULL.
select has_index('public', 'push_subscriptions', 'push_subs_verificacion_token_idx',
  'push_subs_verificacion_token_idx: único PARCIAL sobre verificacion_token, para que dos suscripciones no compartan token');


-- ===========================================================================
-- B. EL CHECK DE COHERENCIA
--
-- Impide el estado "verificada de ningún modo": una fila con `verificado_at`
-- puesto y `verificacion_grado` nulo haría que §5.2 no pudiera decidir entre
-- `Activos` y `Sin probar`, y la UI tendría que inventarse un tercer caso.
-- Se ejercita como `postgres`, dueño de la tabla: aquí se mide el CHECK, no el
-- grant (eso es el grupo C).
-- ===========================================================================

-- 10
select throws_ok(
  $q$update public.push_subscriptions set verificado_at = now()
      where endpoint = 'https://push.test/d1'$q$,
  '23514', null,
  'push_subs_verificacion_shape rechaza verificado_at sin verificacion_grado');

-- 11
select throws_ok(
  $q$update public.push_subscriptions set verificacion_grado = 'toque'
      where endpoint = 'https://push.test/d1'$q$,
  '23514', null,
  'push_subs_verificacion_shape rechaza verificacion_grado sin verificado_at');


-- ===========================================================================
-- C. LOS PRIVILEGIOS POR COLUMNA. ES EL CORAZÓN DEL PLAN.
--
-- La migración 07 otorgó `insert` y `update` DE TABLA. Sigue siendo correcto
-- para lo que el navegador tiene que escribir (registrar y reparar su propia
-- suscripción) y deja de serlo para la EVIDENCIA. El aseador no puede firmar el
-- acta de que le llegó el aviso.
--
-- Y hay una restricción del proyecto que hace que esto NO sea una defensa
-- parcial: los grants por columna no discriminan usuarios, porque admin y
-- aseador comparten el rol Postgres `authenticated` (CLAUDE.md). Aquí eso está
-- bien: NINGUNO DE LOS DOS debe escribir la evidencia. Solo la mueven las tres
-- funciones `security definer`.
--
-- Ocho aserciones y no una: agruparlas escondería cuál se rompió.
-- ===========================================================================

-- 12
select is(pg_temp.priv_col('soporta_declarativo', 'UPDATE'), 'true',
  'authenticated SÍ puede actualizar soporta_declarativo: es un hecho del dispositivo que reporta el navegador');

-- 13
select is(pg_temp.priv_col('soporta_declarativo', 'INSERT'), 'true',
  'authenticated SÍ puede insertar soporta_declarativo al registrar la suscripción');

-- 14
select is(pg_temp.priv_col('verificado_at', 'UPDATE'), 'false',
  'T-05-13 authenticated NO puede actualizar verificado_at: la evidencia no se autocertifica');

-- 15
select is(pg_temp.priv_col('verificacion_grado', 'UPDATE'), 'false',
  'T-05-13 authenticated NO puede actualizar verificacion_grado: si pudiera, "a mano" se ascendería a "toque" solo');

-- 16
select is(pg_temp.priv_col('verificacion_token', 'UPDATE'), 'false',
  'T-05-14 authenticated NO puede actualizar verificacion_token: escribirlo es fabricarse la prueba');

-- 17
select is(pg_temp.priv_col('verificacion_intentos', 'UPDATE'), 'false',
  'T-05-08 authenticated NO puede actualizar verificacion_intentos: el tope de tres no se pone a cero desde el navegador');

-- 18
select is(pg_temp.priv_col('verificado_at', 'INSERT'), 'false',
  'T-05-13 authenticated NO puede insertar verificado_at: una suscripción no nace verificada');

-- 19
select is(pg_temp.priv_col('verificacion_grado', 'INSERT'), 'false',
  'T-05-13 authenticated NO puede insertar verificacion_grado');

-- 20
select is(pg_temp.priv_col('verificacion_token', 'INSERT'), 'false',
  'T-05-14 authenticated NO puede insertar verificacion_token');

-- 21
select is(pg_temp.priv_col('verificacion_intentos', 'INSERT'), 'false',
  'T-05-08 authenticated NO puede insertar verificacion_intentos');


-- ===========================================================================
-- D. AISLAMIENTO. NO REGRESIÓN DE LA POLICY DE LA FASE 1.
--
-- `select` SÍ está otorgado sobre la tabla y esta migración no lo toca, así que
-- quien filtra es la RLS y la aserción correcta es `is_empty`, no `throws_ok`
-- (cabecera de `00_rls_aseos.test.sql`). La policy `push_subs_own_all` se queda
-- exactamente como está.
-- ===========================================================================

select pg_temp.autenticar('0b000000-0000-0000-0000-00000000000b');

-- 22
select is_empty(
  $q$select 1 from public.push_subscriptions
      where user_id = '0a000000-0000-0000-0000-00000000000a'$q$,
  'PLAT-03 NEG B no ve ninguna suscripción de A: el endpoint ajeno es una credencial de envío');

select pg_temp.autenticar('0a000000-0000-0000-0000-00000000000a');

-- 23  Tres y no dos: la revocada sigue siendo suya y sigue siendo visible para
--     ella. Lo que la revocación apaga es D-03, no el `select` propio.
select is((select count(*) from public.push_subscriptions)::int, 3,
  'PLAT-03 A ve sus tres suscripciones, incluida la revocada');

select pg_temp.autenticar(null);


-- ===========================================================================
-- F. registrar_prueba_de_aviso(text)
--
-- El tope de tres vive en la BASE y no en el navegador porque este camino manda
-- un push de verdad: un botón que dispara envíos y se puede llamar en bucle es
-- un amplificador (T-05-08). El contador de pantalla de §8.7 sigue existiendo,
-- pero es cortesía, no control.
-- ===========================================================================

-- 24
select is(pg_temp.existe_funcion('public.registrar_prueba_de_aviso(text)'), 'si',
  'existe public.registrar_prueba_de_aviso(text)');

-- 25
select is(pg_temp.es_definer('public.registrar_prueba_de_aviso(text)'), 'true',
  'registrar_prueba_de_aviso es security definer: escribe columnas que su llamante no puede escribir');

-- 26
select is(pg_temp.puede_ejecutar('anon', 'public.registrar_prueba_de_aviso(text)'), 'false',
  'T-05-06 anon NO ejecuta registrar_prueba_de_aviso: el revoke va pegado a la definición, no se hereda');

-- 27
select is(pg_temp.puede_ejecutar('authenticated', 'public.registrar_prueba_de_aviso(text)'), 'true',
  'authenticated SÍ ejecuta registrar_prueba_de_aviso');

-- Los tres envíos que el tope permite sobre la suscripción de B.
insert into anotaciones (k, v) values ('b1_1',
  pg_temp.valor_como('0b000000-0000-0000-0000-00000000000b',
    $q$select public.registrar_prueba_de_aviso('https://push.test/b1')::text$q$));
insert into anotaciones (k, v) values ('b1_2',
  pg_temp.valor_como('0b000000-0000-0000-0000-00000000000b',
    $q$select public.registrar_prueba_de_aviso('https://push.test/b1')::text$q$));
insert into anotaciones (k, v) values ('b1_3',
  pg_temp.valor_como('0b000000-0000-0000-0000-00000000000b',
    $q$select public.registrar_prueba_de_aviso('https://push.test/b1')::text$q$));

-- 28  Tres valores DISTINTOS. Con la función sin crear los tres son
--     `<error:42883>`, el distinct vale 1 y la aserción sale roja, que es lo
--     esperado hoy. Un token reutilizado entre envíos volvería a poner esto rojo
--     el día de mañana, y es exactamente lo que hay que impedir: el token viaja
--     dentro del aviso y confirma.
select is((select count(distinct v)::int from anotaciones where k in ('b1_1', 'b1_2', 'b1_3')), 3,
  'cada envío de prueba genera un token distinto');

-- El cuarto intento. `verificacion_intentos` vale ya 3.
insert into anotaciones (k, v) values ('b1_4',
  pg_temp.intento_como('0b000000-0000-0000-0000-00000000000b',
    $q$select public.registrar_prueba_de_aviso('https://push.test/b1')$q$));

-- 29
select is(split_part((select v from anotaciones where k = 'b1_4'), '|', 1), 'P0001',
  'UI-SPEC §8.7 el cuarto envío sobre la misma suscripción lanza P0001, no 42501: el aseador SÍ está autorizado, lo que falla es el estado');

-- 30  `mapDbError()` lee el HINT en los P0001, no el message. Si el hint viene
--     vacío o en inglés, la pantalla del aseador muestra un texto de Postgres.
select is(split_part((select v from anotaciones where k = 'b1_4'), '|', 3),
  'Probamos 3 veces y no llegó ninguno. Avísale a tu administrador: puede ser el teléfono, la versión del sistema o la conexión.',
  'el P0001 del tope trae el hint de §8.7 literal y en español, que es lo que lee mapDbError()');

-- 31
select is(split_part(pg_temp.intento_como('0b000000-0000-0000-0000-00000000000b',
    $q$select public.registrar_prueba_de_aviso('https://push.test/a1')$q$), '|', 1), '42501',
  'T-05-14 B no puede disparar un aviso de prueba contra la suscripción de A, y el error no distingue "no existe" de "no es tuya"');


-- ===========================================================================
-- G. confirmar_prueba_por_toque(uuid) y confirmar_prueba_a_mano(text)
--
-- Los dos grados de §8.6 y su asimetría: `toque` puede reemplazar a `manual`,
-- al revés NUNCA. Sin esa asimetría, "Ya sonó, no alcancé a tocarlo" sería un
-- botón para saltarse la única verificación de la fase.
-- ===========================================================================

-- 32
select is(pg_temp.existe_funcion('public.confirmar_prueba_por_toque(uuid)'), 'si',
  'existe public.confirmar_prueba_por_toque(uuid)');

-- 33
select is(pg_temp.es_definer('public.confirmar_prueba_por_toque(uuid)'), 'true',
  'confirmar_prueba_por_toque es security definer');

-- 34
select is(pg_temp.puede_ejecutar('anon', 'public.confirmar_prueba_por_toque(uuid)'), 'false',
  'T-05-06 anon NO ejecuta confirmar_prueba_por_toque');

-- 35
select is(pg_temp.puede_ejecutar('authenticated', 'public.confirmar_prueba_por_toque(uuid)'), 'true',
  'authenticated SÍ ejecuta confirmar_prueba_por_toque');

-- 36
select is(pg_temp.existe_funcion('public.confirmar_prueba_a_mano(text)'), 'si',
  'existe public.confirmar_prueba_a_mano(text)');

-- 37
select is(pg_temp.es_definer('public.confirmar_prueba_a_mano(text)'), 'true',
  'confirmar_prueba_a_mano es security definer');

-- 38
select is(pg_temp.puede_ejecutar('anon', 'public.confirmar_prueba_a_mano(text)'), 'false',
  'T-05-06 anon NO ejecuta confirmar_prueba_a_mano');

-- 39
select is(pg_temp.puede_ejecutar('authenticated', 'public.confirmar_prueba_a_mano(text)'), 'true',
  'authenticated SÍ ejecuta confirmar_prueba_a_mano');

-- Envío sobre A1 y confirmación POR TOQUE con el token que devolvió.
insert into anotaciones (k, v) values ('a1_token',
  pg_temp.valor_como('0a000000-0000-0000-0000-00000000000a',
    $q$select public.registrar_prueba_de_aviso('https://push.test/a1')::text$q$));

-- Mientras la migración no exista, el token capturado es `<error:42883>` y el
-- `%L::uuid` de abajo lanza 22P02 DENTRO de intento_como, que lo devuelve como
-- valor. No aborta. Es la razón de que la llamada no vaya suelta.
insert into anotaciones (k, v) values ('a1_toque_1',
  pg_temp.intento_como('0a000000-0000-0000-0000-00000000000a',
    format($q$select public.confirmar_prueba_por_toque(%L::uuid)$q$,
           (select v from anotaciones where k = 'a1_token'))));

-- 40
select is(split_part(pg_temp.sub('https://push.test/a1'), '/', 1), 'toque',
  'UI-SPEC §8.6 tocar el aviso deja verificacion_grado = toque, el único grado que §5.2 acepta para Activos');

-- 41  El token se CONSUME y los intentos vuelven a cero: la suscripción ya está
--     verificada, el contador de §8.7 deja de tener sentido para ella.
select is(pg_temp.sub('https://push.test/a1'), 'toque/true/<null>/0/true',
  'la confirmación por toque pone verificado_at, consume el token y pone los intentos a cero');

-- 42  Reintentar con un token ya consumido NO es un error: el navegador puede
--     reabrir la misma URL. Lanzar aquí convertiría un reintento en una pantalla
--     de error.
select is(split_part(pg_temp.intento_como('0a000000-0000-0000-0000-00000000000a',
    format($q$select public.confirmar_prueba_por_toque(%L::uuid)$q$,
           (select v from anotaciones where k = 'a1_token'))), '|', 1), 'sin_error',
  'reusar un token ya consumido no lanza: reabrir el aviso no es un fallo');

-- 43
select is(pg_temp.sub('https://push.test/a1'), 'toque/true/<null>/0/true',
  'T-05-14 el token es de un solo uso: la segunda llamada no cambia una sola columna');

-- 44
select is(split_part(pg_temp.intento_como('0a000000-0000-0000-0000-00000000000a',
    $q$select public.confirmar_prueba_a_mano('https://push.test/a2')$q$), '|', 1), 'P0001',
  'no se puede confirmar a mano un aviso que nunca se envió');

-- Ahora sí: envío sobre A2 y confirmación A MANO.
insert into anotaciones (k, v) values ('a2_token',
  pg_temp.valor_como('0a000000-0000-0000-0000-00000000000a',
    $q$select public.registrar_prueba_de_aviso('https://push.test/a2')::text$q$));
insert into anotaciones (k, v) values ('a2_mano',
  pg_temp.intento_como('0a000000-0000-0000-0000-00000000000a',
    $q$select public.confirmar_prueba_a_mano('https://push.test/a2')$q$));

-- 45
select is(split_part(pg_temp.sub('https://push.test/a2'), '/', 1), 'manual',
  'UI-SPEC §8.6 "Ya sonó, no alcancé a tocarlo" deja verificacion_grado = manual, que en §5.2 sigue siendo Sin probar');

-- 46  LA ASERCIÓN QUE HACE QUE LA DISTINCIÓN SIRVA DE ALGO. Si `a_mano` pudiera
--     pisar un `toque`, el grado bueno sería reversible y el admin dejaría de
--     poder confiar en `Activos`.
select is(pg_temp.intento_como('0a000000-0000-0000-0000-00000000000a',
    $q$select public.confirmar_prueba_a_mano('https://push.test/a1')$q$)
    || ' >> ' || pg_temp.sub('https://push.test/a1'),
  'sin_error|| >> toque/true/<null>/0/true',
  'confirmar a mano una suscripción ya confirmada por toque no lanza y NO la degrada');


-- ===========================================================================
-- E. estado_avisos_aseadores() — LA ÚNICA SUPERFICIE DE D-03
--
-- Va aquí y no antes porque mide el estado que F y G acaban de construir: A con
-- dos teléfonos vivos y uno de ellos confirmado por toque.
-- ===========================================================================

-- 47
select is(pg_temp.existe_funcion('public.estado_avisos_aseadores()'), 'si',
  'existe public.estado_avisos_aseadores()');

-- 48
select is(pg_temp.es_definer('public.estado_avisos_aseadores()'), 'true',
  'estado_avisos_aseadores es security definer: el admin no tiene select sobre push_subscriptions y no va a tenerlo');

-- 49
select is(pg_temp.puede_ejecutar('anon', 'public.estado_avisos_aseadores()'), 'false',
  'T-05-06 anon NO ejecuta estado_avisos_aseadores');

-- 50
select is(pg_temp.puede_ejecutar('authenticated', 'public.estado_avisos_aseadores()'), 'true',
  'authenticated SÍ ejecuta estado_avisos_aseadores: la guarda de rol va DENTRO, con private.is_admin()');

-- 51  La guarda consulta `profiles`, nunca un claim: un admin degradado hace un
--     minuto no puede leer esto con su token todavía vivo.
select is(split_part(pg_temp.intento_como('0a000000-0000-0000-0000-00000000000a',
    $q$select * from public.estado_avisos_aseadores()$q$), '|', 1), '42501',
  'un aseador que llama a estado_avisos_aseadores recibe 42501');

-- 52  TRES y no cuatro: D está desactivada y su teléfono ya no importa (§5.2).
--     TRES y no dos: C tiene cero suscripciones y ESA es la fila que hace
--     visible el estado `Sin avisos`. Omitirla obligaría a la UI a inventar la
--     ausencia cruzando dos consultas.
select is(pg_temp.valor_como('0e000000-0000-0000-0000-00000000000e',
    $q$select count(*)::text from public.estado_avisos_aseadores()$q$), '3',
  'D-03 devuelve una fila por aseador ACTIVO, incluidos los que tienen cero suscripciones');

-- 53  A=2/true  dos vivas (la revocada no cuenta) y verificada por toque
--     B=1/false una viva, la prueba se mandó cuatro veces y nunca se confirmó
--     C=0/false sin teléfono
select is(pg_temp.valor_como('0e000000-0000-0000-0000-00000000000e',
    $q$select string_agg(left(e.aseador_id::text, 2) || '=' || e.suscripciones_vivas
                         || '/' || e.verificado_por_toque, ' | ' order by e.aseador_id::text)
         from public.estado_avisos_aseadores() e$q$),
  '0a=2/true | 0b=1/false | 0c=0/false',
  'D-03 §5.2 los tres estados salen del agregado: Activos, Sin probar y Sin avisos');

-- 54  T-05-07. SE CONSULTA EL CATÁLOGO Y NO LAS FILAS, y la diferencia es todo:
--     leer filas solo demuestra que hoy no salió ninguna credencial; leer la
--     firma demuestra que NO CABE. El día que alguien añada `endpoint` al
--     `returns table` "para depurar", esta aserción es la que lo para.
select is(
  (select coalesce(string_agg(a.nombre, ',' order by a.ord), '<sin funcion>')
     from pg_proc p
    cross join lateral unnest(p.proargnames, p.proargmodes) with ordinality as a(nombre, modo, ord)
    where p.pronamespace = 'public'::regnamespace
      and p.proname = 'estado_avisos_aseadores'
      and a.modo = 't'),
  'aseador_id,suscripciones_vivas,verificado_por_toque,ultima_verificacion,ultimo_visto,ultimo_exito,primera_suscripcion_at',
  'T-05-07 el returns table de D-03 es exactamente el declarado: sin endpoint, sin p256dh y sin auth');


-- ===========================================================================
-- H. NO REGRESIÓN DEL PANEL DE ALERTAS DE LA FASE 4
--
-- Esta migración no emite NINGUNA sentencia sobre `notifications`. Estas tres
-- aserciones nacen en verde y existen para que se note el día que alguien lo
-- intente: el panel del admin y el drenaje de push leen exactamente esto.
-- ===========================================================================

-- 55
select is(
  (select string_agg(c.column_name || ':' ||
            case when c.data_type = 'USER-DEFINED' then c.udt_name else c.data_type end,
            ', ' order by c.column_name)
     from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'notifications'
      and c.column_name in ('push_status', 'push_attempts', 'push_last_error',
                            'next_attempt_at', 'dedupe_key')),
  'dedupe_key:text, next_attempt_at:timestamp with time zone, push_attempts:integer, push_last_error:text, push_status:push_status',
  'las cinco columnas de outbox de notifications siguen existiendo con el mismo tipo');

-- 56
select is(
  (select string_agg(c.column_name || ':' ||
            case when c.data_type = 'USER-DEFINED' then c.udt_name else c.data_type end,
            ', ' order by c.column_name)
     from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'notifications'
      and c.column_name in ('recipient_id', 'read_at', 'created_at')),
  'created_at:timestamp with time zone, read_at:timestamp with time zone, recipient_id:uuid',
  'las tres columnas de bandeja de notifications siguen existiendo con el mismo tipo');

-- 57
select is(
  (select string_agg(i.indexname, ', ' order by i.indexname)
     from pg_indexes i
    where i.schemaname = 'public' and i.tablename = 'notifications'
      and i.indexname <> 'notifications_pkey'),
  'notifications_dedupe_idx, notifications_inbox_idx, notifications_outbox_idx',
  'los tres índices de notifications siguen ahí: dedupe, bandeja y outbox');

select * from finish();
rollback;
