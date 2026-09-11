-- ============================================================================
-- 08_push_jobs.test.sql — el contrato ejecutable del TRANSPORTE de los avisos
--
-- ESTE ARCHIVO NACE EN ROJO, A PROPÓSITO. Enumera, antes de que exista una línea
-- de la migración 17, los invariantes que esa migración tiene que hacer
-- verdaderos: el dispatcher del outbox, el trigger `AFTER INSERT` que dispara el
-- drenaje en el acto, y el job de un minuto que hace de red.
--
-- QUIÉN LO PONE EN VERDE: la Task 3 de ESTE MISMO plan (05-03), que aplica
-- `supabase/migrations/20260911121000_17_push_jobs.sql`.
--
-- ── POR QUÉ ES UN ARCHIVO APARTE Y NO UNA AMPLIACIÓN DE `07_push.test.sql` ──
--
-- `07_push.test.sql` cubre el SCHEMA de los avisos: columnas, grados de
-- confirmación, grants por columna, la superficie de D-03. Este cubre el
-- TRANSPORTE: quién dispara el envío, cuándo, y qué pasa cuando la
-- infraestructura de push no está. Mezclarlos haría que un `not ok` no dijera
-- cuál de las dos mitades se rompió, que es justo lo que un contrato ejecutable
-- existe para decir.
--
-- ── LA RELACIÓN DE COLA DE `pg_net`, DESCUBIERTA POR CATÁLOGO ─────────────
--
-- La aserción más importante de este archivo (grupo D) mide el contenido de la
-- cola de `pg_net`. El nombre de esa relación NO se escribe de memoria: se
-- descubrió consultando el catálogo contra la versión instalada en este stack.
--
--   select n.nspname||'.'||c.relname||' | kind='||c.relkind::text
--               ||' | persist='||c.relpersistence::text
--     from pg_class c join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname in ('net','extensions') and c.relkind in ('r','p','v','m')
--    order by 1;
--
-- Salida MEDIDA el 2026-09-11 contra PG 17.6 con `pg_net` 0.20.4 instalada en el
-- esquema `extensions` (sus OBJETOS van al esquema `net`, que es otra cosa):
--
--   extensions.pg_stat_statements       | kind=v | persist=p
--   extensions.pg_stat_statements_info  | kind=v | persist=p
--   net._http_response                  | kind=r | persist=u
--   net.http_request_queue              | kind=r | persist=u
--
-- **`net.http_request_queue` es la cola.** `net._http_response` es la otra mitad
-- —las respuestas, con TTL de 6 horas— y NO se lee en este archivo ni en ninguna
-- parte del producto: ninguna decisión de negocio se toma leyendo la respuesta
-- de `pg_net`.
--
-- Sus columnas, también por catálogo, porque hay una que sorprende:
--
--   id bigint · method net.http_method · url text · headers jsonb
--   body BYTEA · timeout_milliseconds integer
--
-- `body` es **bytea**, no jsonb. Para leerlo hay que pasar por
-- `convert_from(body, 'utf8')::jsonb`. Escrito como `body::jsonb` el archivo
-- revienta con un error de cast y no con un `not ok`.
--
-- ── LA PROPIEDAD QUE ESTE ARCHIVO EXISTE PARA MEDIR ───────────────────────
--
-- `05-PATTERNS.md` la marca explícitamente como NO MEDIDA en este repo:
--
--   *«`pg_net` despacha después del commit, así que un rollback revierte el
--     disparo»*
--
-- Todo D-04 descansa en ella: es lo único que permite disparar el push desde
-- dentro de la transacción de negocio sin romper la regla de la migración 15
-- (ninguna llamada HTTP síncrona dentro de la transacción). Hasta hoy era una
-- cita del research. El grupo D la convierte en una aserción.
--
-- CÓMO SE MIDE, y el truco no es evidente. Lo que hay que comparar es el tamaño
-- de la cola en TRES momentos: antes, dentro de una subtransacción, y después de
-- revertirla. El problema es que la medición «dentro» no sobrevive al
-- `rollback to savepoint`: una tabla temporal escrita dentro de la
-- subtransacción se revierte con ella.
--
-- La salida es una SECUENCIA. Está documentado y está medido aquí: los cambios
-- de `setval` NO se deshacen cuando la (sub)transacción aborta. Así que la
-- medición de dentro se saca a hombros de una secuencia creada ANTES del
-- savepoint, y las dos aserciones se emiten después del rollback, con los tres
-- números en la mano.
--
-- Medición previa que justifica el diseño (probe del 2026-09-11):
--
--   base=0 · dentro=1 · despues=0 · seq_sobrevive=101
--
-- El `+1` del `setval` es porque una secuencia no admite el valor 0: se guarda
-- `count + 1` y se resta al leer.
--
-- ── LA ASIMETRÍA QUE ESTE ARCHIVO FIJA, Y ES EL CORAZÓN DEL PLAN ──────────
--
-- El trigger y el dispatcher fallan al REVÉS, a propósito:
--
--   · **El trigger NUNCA lanza** (grupo E). Una notificación se inserta dentro
--     de la transacción de negocio de `confirm_cleaning`, `finish_cleaning` o
--     `decline_cleaning`. Si el trigger lanzara porque el Vault está vacío,
--     **confirmar un aseo fallaría por un problema de infraestructura de
--     avisos**. Eso es exactamente lo contrario del Core Value.
--
--   · **El dispatcher SÍ lanza** (grupo F). Ahí el fallo de despliegue tiene que
--     ser RUIDOSO, porque lo recoge `cron.job_run_details` con
--     `status = 'failed'` y un humano lo puede ver. La alternativa educada
--     —volver en silencio— dejaría el drenaje muerto sin ninguna señal.
--
-- Las dos direcciones tienen aserción. Sin las dos, la asimetría es un comentario.
--
-- ── QUÉ NO SE PUEDE MEDIR AQUÍ, DICHO ARRIBA PARA QUE NADIE FINJA QUE SÍ ──
--
-- **La concurrencia real de dos sesiones.** El grupo I afirma el
-- `for update skip locked` contra el CUERPO de la función y no contra su
-- comportamiento, y es honesto decir por qué: todo este archivo vive dentro de
-- UNA transacción que termina en `rollback`, y sus fixtures no están
-- commiteados. Una segunda sesión —por `dblink`, que sí está disponible— no
-- vería ni una sola de las filas sembradas aquí, así que «dos sesiones reclaman
-- conjuntos disjuntos» no es observable desde dentro. Una aserción que lo
-- fingiera sería peor que ninguna.
--
-- (El plan 05-03 dice «copiar la forma de la aserción equivalente de
-- `05_sync.test.sql`». No existe tal aserción: la 62 de ese archivo mide el
-- LEASE, no la concurrencia. Se deja anotado para que nadie la busque.)
--
-- ── CÓMO SE LEE EL ROJO ───────────────────────────────────────────────────
--
-- Las tres comprobaciones de siempre, las mismas que fijó el plan 03-05:
--
--   1. `ok + not ok` = el `plan(N)` declarado. Si el total es menor, el archivo
--      ABORTÓ a mitad y las que faltan no se midieron.
--   2. La lista de identificadores en rojo contra la esperada, no el total.
--   3. Que la ÚLTIMA aserción del archivo aparezca en la salida.
--
-- Identificadores en rojo esperados, por tarea. MEDIDO al ejecutar el archivo el
-- 2026-09-11, no estimado:
--
--   tras 05-03 Task 1 (archivo nuevo)   1 … 8, 11, 12, 13, 14, 16, 17   (catorce)
--   tras 05-03 Task 3 (migración 17)    —                               (NINGUNA)
--
-- LAS CINCO QUE NACEN EN VERDE Y POR QUÉ NO SON VACUIDAD:
--
--   · 9 y 10, el grupo E. Sin trigger, insertar una notificación obviamente no
--     lanza. Su valor no es hoy: es el día que alguien «mejore» el trigger
--     metiéndole un `raise exception`. Ese día estas dos se ponen rojas y
--     confirmar un aseo deja de funcionar en producción. Están escritas para ese
--     día.
--   · 15, la segunda poda. Hoy hay una sola (`purge-cron-history`, de la Fase 3)
--     y sigue habiendo una sola después. Está escrita contra el reflejo de
--     añadir una poda «por simetría» con el job nuevo.
--   · 18, el índice único parcial de la migración 06. Es control de no
--     regresión: se pone roja el día que alguien toque `notifications` de paso.
--   · 19, que el trigger no escribe ninguna columna de la fila que lo disparó.
--     Hoy no hay trigger, así que obviamente no escribe. Mañana sí lo hay, y
--     esta es la que se pone roja si alguien le mete un `update` sobre
--     `notifications` —«para que el cron no la pille dos veces»— y abre con ello
--     una puerta a recursión que la ventana de gracia ya hacía innecesaria.
--
-- ── RESTRICCIONES DEL REPO QUE ESTE ARCHIVO RESPETA ──────────────────────
--
--   · NO se escribe `create extension … pgtap`. La crea y la borra
--     `supabase test db` en cada corrida; crearla aquí sin
--     `with schema extensions` la mete en `public` y pone en rojo, de mentira,
--     los guardarraíles 3, 4 y 9 de `02_guardarrailes.test.sql`.
--   · Los helpers viven en `pg_temp` y mueren con la transacción.
--   · Toda invocación de algo que la migración 17 todavía no creó pasa por un
--     helper con manejador: una función inexistente da `42883`, que ABORTA la
--     transacción entera y se lleva el archivo por delante.
--   · Toda lectura de catálogo va AGREGADA (`string_agg`, `count`), incluso
--     donde la clave primaria garantiza una sola fila: una subconsulta escalar
--     que devuelve dos filas tampoco da `not ok`, aborta.
--   · `anon` NO se afirma aquí. Ya lo cubre, de forma transversal y para toda
--     función nueva de `public` y `private`, el guardarraíl 9 de
--     `02_guardarrailes.test.sql`. `authenticated` SÍ se afirma, porque ese
--     guardarraíl no lo mira y es el otro rol que llega desde el navegador.
--   · Todo va entre `begin;` y `rollback;`. Con este archivo la suite pasa a
--     NUEVE y `pg_prove` imprime `Files=9`.
--
-- ── CÓMO CORRER SOLO ESTE ARCHIVO ────────────────────────────────────────
--
--   { echo 'begin;';
--     echo 'create extension if not exists pgtap with schema extensions;';
--     sed '0,/^begin;$/s/^begin;$//' supabase/tests/08_push_jobs.test.sql;
--   } | docker exec -i supabase_db_vivaguest psql -U postgres -d postgres -qAtX -f -
--
-- Las banderas `-A -t` importan: sin ellas psql imprime cada línea TAP dentro de
-- una tabla y un `grep '^not ok'` devuelve CERO con el archivo entero en rojo.
-- ============================================================================

begin;
select plan(19);

-- ---------------------------------------------------------------------------
-- Limpieza del seed, en orden inverso de FK. El rollback la deshace.
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
-- FIXTURES. Un admin y una aseadora: `notifications.recipient_id` referencia
-- `profiles` y es NOT NULL, así que hace falta alguien a quien avisar.
-- ===========================================================================
insert into auth.users (id, email) values
  ('0a000000-0000-0000-0000-00000000000a', 'aseadora@vg.co'),
  ('0e000000-0000-0000-0000-00000000000e', 'admin@vg.co');

insert into public.profiles (id, role, full_name, is_active) values
  ('0a000000-0000-0000-0000-00000000000a', 'aseador', 'Aseadora A', true),
  ('0e000000-0000-0000-0000-00000000000e', 'admin',   'Admin',      true)
on conflict (id) do update
  set role = excluded.role, full_name = excluded.full_name, is_active = excluded.is_active;

-- ===========================================================================
-- HELPERS. Todos en pg_temp.
-- ===========================================================================

-- La envoltura que impide que el archivo reviente mientras la migración 17 no
-- existe. Devuelve el número de notificaciones despachadas, o un valor
-- COMPARABLE si la función todavía no está.
create function pg_temp.despachar() returns text
language plpgsql as $fn$
declare v int;
begin
  execute 'select public.dispatch_push_notifications()' into v;
  return v::text;
exception when others then
  return '<error:' || sqlstate || '>';
end $fn$;

-- Cuántas peticiones al drenaje hay encoladas AHORA MISMO.
--
-- Se filtra por URL y no se cuenta la tabla entera a propósito: el worker de
-- `pg_net` borra filas de `net.http_request_queue` según las procesa, y esas
-- filas son de OTRAS sesiones. Un `count(*)` desnudo mediría una población que
-- se mueve sola entre dos sentencias y daría un rojo intermitente.
create function pg_temp.encoladas() returns bigint
language sql as $fn$
  select count(*) from net.http_request_queue
   where url = 'http://ejemplo.invalido/api/push/drain';
$fn$;


-- ===========================================================================
-- GRUPO A — EL DISPATCHER EXISTE Y ESTÁ BIEN CERRADO
-- ===========================================================================

-- 1  Existe, y es una función normal (no un procedimiento ni un agregado).
select is(
  (select coalesce(string_agg(p.proname || '/' || p.prokind::text, '+' order by p.proname), '<sin funcion>')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'dispatch_push_notifications'),
  'dispatch_push_notifications/f',
  'el dispatcher public.dispatch_push_notifications() existe');

-- 2  Es `security definer`. Sin esto no puede leer `vault.decrypted_secrets`:
--    ese descifrado solo lo hacen `postgres`, `supabase_admin` y `service_role`.
select is(
  (select coalesce(string_agg(p.prosecdef::text, '+'), '<sin funcion>')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'dispatch_push_notifications'),
  'true',
  'el dispatcher es SECURITY DEFINER');

-- 3  Fija `search_path` VACÍO. El guardarraíl 6 de `02_guardarrailes.test.sql`
--    ya exige que TODA función definer lo haga; esta lo fija para esta función
--    en concreto, que es la que lee un secreto y hace HTTP saliente.
--
--    LOS DOS LITERALES ACEPTADOS SON LOS MISMOS QUE ACEPTA ESE GUARDARRAÍL, y
--    hay que conocerlos: Postgres 17 normaliza a `search_path=""` y las
--    versiones más viejas guardan `search_path=`. MEDIDO aquí: este stack
--    almacena `search_path=""`. Un `search_path=public` sigue siendo un fallo,
--    que es exactamente lo que la aserción existe para atrapar.
select is(
  (select coalesce(string_agg(
            case when array_to_string(p.proconfig, ',') in ('search_path=', 'search_path=""')
                 then 'vacio' else array_to_string(p.proconfig, ',') end, '+'), '<sin funcion>')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'dispatch_push_notifications'),
  'vacio',
  'el dispatcher fija search_path vacío');

-- 4  `authenticated` NO puede ejecutarlo.
--
--    Hace falta por separado del guardarraíl 9, que solo mira `anon`: son dos
--    roles con ACL distinto, y un `grant execute to authenticated` escrito por
--    costumbre dejaría aquel en verde. Un aseador autenticado podría entonces
--    disparar el fan-out entero contra el endpoint del drenaje.
select is(
  (select coalesce(string_agg(has_function_privilege('authenticated', p.oid, 'execute')::text, '+'), '<sin funcion>')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'dispatch_push_notifications'),
  'false',
  'authenticated NO puede ejecutar el dispatcher');


-- ===========================================================================
-- GRUPO B — EL TRIGGER EXISTE Y ESTÁ ENGANCHADO DONDE DEBE
-- ===========================================================================

-- 5  El trigger existe sobre `public.notifications`, con el nombre exacto, y es
--    el ÚNICO trigger de usuario de esa tabla.
--
--    Lo último no es cosmético: un segundo trigger sobre la misma tabla que
--    escribiera en ella sería una puerta de recursión, y este archivo es el
--    sitio donde eso se nota.
select is(
  (select coalesce(string_agg(t.tgname, '+' order by t.tgname), '<sin trigger>')
     from pg_trigger t
     join pg_class c on c.oid = t.tgrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'notifications' and not t.tgisinternal),
  'notifications_disparar_push',
  'el trigger notifications_disparar_push existe y es el único de public.notifications');

-- 6  Es `AFTER INSERT` y `FOR EACH ROW`, descompuesto bit a bit de `tgtype`.
--
--    Escrito como `tgtype = 5` sería igual de correcto y completamente ilegible
--    el día que se ponga rojo. Cada elemento nombra el hecho que afirma.
select is(
  (select coalesce(string_agg(
            case when (t.tgtype::int & 1) = 1 then 'fila'     else 'sentencia' end || '/' ||
            case when (t.tgtype::int & 2) = 2 then 'before'   else 'after'     end || '/' ||
            case when (t.tgtype::int & 4) = 4 then 'insert'   else 'sin_insert' end || '/' ||
            case when (t.tgtype::int & 8) = 8 then 'delete'   else 'sin_delete' end || '/' ||
            case when (t.tgtype::int & 16) = 16 then 'update' else 'sin_update' end, '+'), '<sin trigger>')
     from pg_trigger t
     join pg_class c on c.oid = t.tgrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'notifications'
      and not t.tgisinternal and t.tgname = 'notifications_disparar_push'),
  'fila/after/insert/sin_delete/sin_update',
  'el trigger es AFTER INSERT, FOR EACH ROW, y solo de INSERT');

-- 7  La función del trigger existe, es definer y con `search_path` vacío. Las
--    tres cosas en una cadena, porque son la misma propiedad: puede leer Vault
--    aunque quien inserta la notificación sea un usuario normal vía RPC.
select is(
  (select coalesce(string_agg(p.prosecdef::text || '/' ||
            case when array_to_string(p.proconfig, ',') in ('search_path=', 'search_path=""')
                 then 'vacio' else array_to_string(p.proconfig, ',') end, '+'), '<sin funcion>')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'tg_notifications_disparar_push'),
  'true/vacio',
  'la función del trigger existe, es SECURITY DEFINER y fija search_path vacío');

-- 8  `authenticated` NO puede ejecutar la función del trigger por su cuenta.
--
--    Que la ejecute el motor de triggers no depende de este privilegio: un
--    trigger corre con los privilegios de su propia función, no con los de quien
--    disparó el INSERT. Así que revocarla no rompe nada y sí cierra la puerta a
--    que alguien la llame suelta con un `NEW` fabricado.
select is(
  (select coalesce(string_agg(has_function_privilege('authenticated', p.oid, 'execute')::text, '+'), '<sin funcion>')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'tg_notifications_disparar_push'),
  'false',
  'authenticated NO puede ejecutar la función del trigger');


-- ===========================================================================
-- GRUPO E — CON EL VAULT VACÍO, INSERTAR UNA NOTIFICACIÓN NO LANZA
--
-- VA ANTES DE CREAR NINGÚN SECRETO, Y ESE ORDEN ES LA MITAD DE LA ASERCIÓN.
-- Después de `vault.create_secret` ya no se puede medir: el entorno local de
-- pruebas no tiene los secretos, así que el estado natural de este archivo ES el
-- escenario del modo de fallo más caro de la fase.
--
-- Es el invariante que protege el Core Value: «que ningún aseo se pierda». Un
-- aseo se confirma dentro de una transacción que inserta una notificación. Si el
-- trigger lanzara porque falta un secreto de infraestructura de avisos,
-- confirmar el aseo fallaría. La infraestructura de push rota puede dejar de
-- avisar; no puede tumbar la operación.
-- ===========================================================================

-- 9  Insertar una notificación con el Vault VACÍO no lanza.
select lives_ok(
  $ins$
    insert into public.notifications
      (id, recipient_id, type, title, body, payload, dedupe_key)
    values
      ('e0000000-0000-0000-0000-0000000000e1',
       '0e000000-0000-0000-0000-00000000000e',
       'asignacion'::public.notification_type,
       'Con el Vault vacío',
       'Este insert tiene que sobrevivir a que no haya infraestructura de push.',
       '{"grupo":"E"}'::jsonb, 'E:vault-vacio')
  $ins$,
  'con el Vault VACÍO, insertar una notificación NO lanza: el push roto no tumba la confirmación de un aseo');

-- 10  Y el control positivo, sin el cual la 9 sería compatible con un insert que
--     no escribió nada: la fila está, con sus columnas de outbox intactas.
select is(
  (select coalesce(string_agg(n.push_status::text || '/' || n.push_attempts::text, '+'), '<sin fila>')
     from public.notifications n
    where n.id = 'e0000000-0000-0000-0000-0000000000e1'),
  'pendiente/0',
  'la notificación insertada con el Vault vacío SÍ quedó escrita, y en estado pendiente');


-- ===========================================================================
-- GRUPO F — EL DISPATCHER SÍ LANZA CUANDO FALTAN LOS SECRETOS
--
-- La otra mitad de la asimetría, y también antes de crear nada en Vault.
--
-- Aquí el fallo de despliegue tiene que ser RUIDOSO porque lo recoge
-- `cron.job_run_details` con `status = 'failed'` y este mensaje literal en
-- `return_message`. La alternativa silenciosa —`return 0` y a otra cosa— dejaría
-- el drenaje muerto sin ninguna señal: ni un aviso enviado, ni un error en
-- pantalla, ni una fila distinta en ninguna tabla de negocio.
-- ===========================================================================

-- 11
select throws_ok(
  'select public.dispatch_push_notifications()',
  'faltan secretos de push en vault: app_base_url / cron_shared_secret',
  'el dispatcher LANZA con mensaje explícito cuando falta un secreto de Vault');


-- ---------------------------------------------------------------------------
-- Ahora sí, los dos secretos. Valores de juguete: lo que se mide es a QUIÉN se
-- dispara y cuándo, no que la petición llegue a ningún sitio. `pg_net` encola en
-- una tabla y el `rollback` del final la deshace, así que de este archivo no sale
-- ni una petición HTTP.
--
-- Son los MISMOS DOS secretos de la Fase 3 (`docs/despliegue-sync.md`). El
-- drenaje de push no crea ninguno nuevo y la migración 17 no contiene un solo
-- `vault.create_secret`: los secretos son un paso operativo por entorno, y
-- `cron.job.command` es texto plano.
-- ---------------------------------------------------------------------------
select vault.create_secret('http://ejemplo.invalido', 'app_base_url',       'fixture 08_push_jobs');
select vault.create_secret('secreto-de-juguete',      'cron_shared_secret', 'fixture 08_push_jobs');


-- ===========================================================================
-- GRUPOS C Y D — EL DISPARO SE ENCOLA AL INSERTAR, Y EL ROLLBACK LO REVIERTE
--
-- Es la razón de ser de este plan. Ver la cabecera para el truco de la
-- secuencia: `setval` NO se deshace al abortar una subtransacción, así que es lo
-- único que puede sacar la medición de «dentro» a través del
-- `rollback to savepoint`.
-- ===========================================================================

create table pg_temp.cola_base as select pg_temp.encoladas() as n;
create sequence pg_temp.cola_dentro;

savepoint s_disparo;

insert into public.notifications
  (id, recipient_id, type, title, body, payload, dedupe_key)
values
  ('c0000000-0000-0000-0000-0000000000c1',
   '0a000000-0000-0000-0000-00000000000a',
   'asignacion'::public.notification_type,
   'Tienes un aseo',
   'El disparo de esta notificación tiene que estar encolado ANTES del commit.',
   '{"grupo":"CD"}'::jsonb, 'CD:disparo');

-- El `+1` es porque una secuencia no admite el valor 0. Se resta al leer.
select setval('pg_temp.cola_dentro', pg_temp.encoladas() + 1);

rollback to savepoint s_disparo;

-- NINGUNA ASERCIÓN pgTAP SE EMITE DENTRO DEL SAVEPOINT, y es deliberado:
-- `pg_prove` numera con estado que vive en `pg_temp`, y una aserción emitida
-- dentro de una subtransacción que luego se aborta dejaría esa numeración en un
-- estado que no hace falta investigar. Las dos mediciones salen del savepoint
-- por la secuencia; las aserciones se emiten aquí fuera, con los números ya en
-- la mano.

-- 12  EL ROLLBACK REVIERTE EL DISPARO.
--
--     Es la aserción que este archivo existe para escribir. Los tres números en
--     una sola cadena, porque separados el segundo sería trivialmente verde:
--
--       · delta_dentro = 1  → el insert SÍ encoló una petición
--       · delta_despues = 0 → el `rollback to savepoint` la deshizo
--       · la notificación tampoco está → la transacción de negocio y su disparo
--         se revierten JUNTOS, que es la propiedad entera
--
--     Sin el primer elemento, un trigger que no hiciera nada en absoluto pasaría
--     esta aserción en verde de la peor forma posible.
select is(
  array[
    ((select last_value from pg_temp.cola_dentro) - 1 - (select n from pg_temp.cola_base))::text,
    (pg_temp.encoladas() - (select n from pg_temp.cola_base))::text,
    (select count(*)::text from public.notifications
      where id = 'c0000000-0000-0000-0000-0000000000c1')],
  array['1', '0', '0'],
  'D-04: pg_net encola dentro de la transacción y el rollback REVIERTE el disparo junto con la notificación');

-- ---------------------------------------------------------------------------
-- Y ahora un disparo que SÍ se queda, para poder mirarle la forma. Va fuera del
-- savepoint a propósito: la petición encolada dentro se revirtió con él, que es
-- exactamente lo que acaba de afirmar la aserción 12.
-- ---------------------------------------------------------------------------
insert into public.notifications
  (id, recipient_id, type, title, body, payload, dedupe_key)
values
  ('c0000000-0000-0000-0000-0000000000c2',
   '0a000000-0000-0000-0000-00000000000a',
   'asignacion'::public.notification_type,
   'Tienes un aseo',
   'De esta sí se mira la forma de la petición encolada.',
   '{"grupo":"C"}'::jsonb, 'C:forma');

-- 13  LA FORMA DE LA PETICIÓN ENCOLADA, Y LA TRAMPA QUE DESACTIVA.
--
--     La firma MEDIDA de pg_net es
--     `net.http_post(url, body, params, headers, timeout_milliseconds)`. El
--     orden posicional pone `body` en SEGUNDO lugar, que es exactamente donde la
--     intuición pone `headers`. Escrito posicionalmente, el secreto compartido
--     viajaría en el CUERPO, el worker respondería 401 en cada disparo y la
--     única señal serían notificaciones envejeciendo en `pendiente`.
--
--     Los cuatro elementos, en orden: la URL es la del drenaje; el secreto va en
--     la CABECERA; el cuerpo lleva `notification_id`, que es lo único que el
--     worker del plan 05-06 acepta; y el último, `false`, dice que el secreto NO
--     está en el cuerpo. Ese último es el que mata la trampa.
select is(
  (select coalesce(string_agg(
            q.url || ' | ' ||
            (q.headers ? 'x-cron-secret')::text || ' | ' ||
            ((convert_from(q.body, 'utf8')::jsonb) ? 'notification_id')::text || ' | ' ||
            (convert_from(q.body, 'utf8') like '%secreto-de-juguete%')::text, '+'), '<sin peticion>')
     from net.http_request_queue q
    where q.url = 'http://ejemplo.invalido/api/push/drain'),
  'http://ejemplo.invalido/api/push/drain | true | true | false',
  'el disparo va al drenaje con el secreto en la CABECERA y solo el notification_id en el cuerpo');


-- ===========================================================================
-- GRUPO G — EL JOB ESTÁ AGENDADO Y CON LA SINTAXIS CORRECTA
-- ===========================================================================

-- 14  El job nuevo, con su expresión, activo, y los CUATRO jobs del sistema.
--
--     LA EXPRESIÓN NO ES DECORATIVA Y ESTA ASERCIÓN LA CONGELA POR UNA RAZÓN
--     MEDIDA en la Fase 3 y reconfirmada aquí:
--
--       select cron.schedule('x', '1 minute', 'select 1');
--       ERROR:  invalid schedule: 1 minute
--       HINT:   Use cron format (e.g. 5 4 * * *), or interval format '[1-59] seconds'
--
--     La sintaxis de intervalo de `pg_cron` 1.6.4 solo admite SEGUNDOS. El tick
--     de un minuto tiene que escribirse como expresión cron de cinco estrellas.
--     Escrito de la otra forma, la migración falla AL APLICARSE.
select is(
  array[
    (select coalesce(string_agg(j.schedule || ' | ' || j.active::text, '+'), '<sin job>')
       from cron.job j where j.jobname = 'dispatch-push-notifications'),
    (select count(*)::text from cron.job j),
    (select coalesce(string_agg(j.jobname, '+' order by j.jobname), '<ninguno>') from cron.job j),
    (select count(*)::text from cron.job j where not j.active)],
  array['* * * * * | true',
        '4',
        'dispatch-feed-syncs+dispatch-push-notifications+feed-health-watchdog+purge-cron-history',
        '0'],
  'el job dispatch-push-notifications está agendado con el tick de cinco estrellas, activo, y son los cuatro del sistema');

-- 15  NO HAY UNA SEGUNDA PODA DE `cron.job_run_details`.
--
--     `purge-cron-history` (Fase 3, `'17 4 * * *'`) poda la tabla ENTERA, no las
--     filas de un job concreto, así que cubre también los jobs nuevos. Añadir una
--     segunda «por simetría» con el job nuevo sería una fuga de tiempo de CPU
--     diaria haciendo exactamente el mismo `delete` dos veces.
--
--     Esta aserción nace en verde y está escrita contra ese reflejo.
select is(
  (select coalesce(string_agg(j.jobname, '+' order by j.jobname), '<ninguna>')
     from cron.job j where j.command like '%job_run_details%'),
  'purge-cron-history',
  'la poda del historial de cron sigue siendo UNA sola y cubre también los jobs nuevos');


-- ===========================================================================
-- GRUPO H — LA VENTANA DE GRACIA
--
-- Es la aserción que impide que el trigger y el cron manden el mismo aviso dos
-- veces dentro del primer minuto. El disparo inmediato del trigger es el camino
-- PRINCIPAL; el cron es la RED. Sin la ventana, una notificación recién creada
-- la mandarían los dos.
-- ===========================================================================

delete from public.notifications;

insert into public.notifications
  (id, recipient_id, type, title, body, dedupe_key,
   push_status, push_attempts, created_at, next_attempt_at)
values
  -- H1  recién creada, cero intentos  -> le toca al TRIGGER, no al cron
  ('40000000-0000-0000-0000-000000000001', '0a000000-0000-0000-0000-00000000000a',
   'asignacion'::public.notification_type, 'H1', 'recien creada', 'H:1',
   'pendiente', 0, now(), now()),
  -- H2  creada hace 5 minutos          -> el disparo inmediato no llegó: la red
  ('40000000-0000-0000-0000-000000000002', '0a000000-0000-0000-0000-00000000000a',
   'asignacion'::public.notification_type, 'H2', 'vieja', 'H:2',
   'pendiente', 0, now() - interval '5 minutes', now()),
  -- H3  recién creada pero YA intentada -> es un reintento, la gracia no aplica
  ('40000000-0000-0000-0000-000000000003', '0a000000-0000-0000-0000-00000000000a',
   'asignacion'::public.notification_type, 'H3', 'reintento', 'H:3',
   'pendiente', 1, now(), now()),
  -- H4  vieja pero ya ENVIADA          -> cerrada, no se vuelve a tocar
  ('40000000-0000-0000-0000-000000000004', '0a000000-0000-0000-0000-00000000000a',
   'asignacion'::public.notification_type, 'H4', 'ya enviada', 'H:4',
   'enviado', 1, now() - interval '5 minutes', now()),
  -- H5  vieja y pendiente, pero con el backoff todavía por vencer
  ('40000000-0000-0000-0000-000000000005', '0a000000-0000-0000-0000-00000000000a',
   'asignacion'::public.notification_type, 'H5', 'en backoff', 'H:5',
   'pendiente', 1, now() - interval '5 minutes', now() + interval '10 minutes');

create table pg_temp.despacho as select pg_temp.despachar() as n;

-- 16  Las cinco filas del `where` del dispatcher, en una sola cadena.
--
--     El «lease» se lee en `next_attempt_at`: `notifications` no tiene columna de
--     reclamo como `calendar_feeds.claimed_at`, así que el equivalente es empujar
--     `next_attempt_at` hacia adelante ANTES del `http_post`. Una fila reclamada
--     queda en `now() + 2 minutes`; una no reclamada, donde estaba.
select is(
  array[
    (select n from pg_temp.despacho),
    (select coalesce(string_agg((n.next_attempt_at = now())::text, '+'), '<sin fila>')
       from public.notifications n where n.id = '40000000-0000-0000-0000-000000000001'),
    (select coalesce(string_agg((n.next_attempt_at = now() + interval '2 minutes')::text, '+'), '<sin fila>')
       from public.notifications n where n.id = '40000000-0000-0000-0000-000000000002'),
    (select coalesce(string_agg((n.next_attempt_at = now() + interval '2 minutes')::text, '+'), '<sin fila>')
       from public.notifications n where n.id = '40000000-0000-0000-0000-000000000003'),
    (select coalesce(string_agg((n.next_attempt_at = now())::text, '+'), '<sin fila>')
       from public.notifications n where n.id = '40000000-0000-0000-0000-000000000004'),
    (select coalesce(string_agg((n.next_attempt_at = now() + interval '10 minutes')::text, '+'), '<sin fila>')
       from public.notifications n where n.id = '40000000-0000-0000-0000-000000000005')],
  array['2', 'true', 'true', 'true', 'true', 'true'],
  'la ventana de gracia deja la recién creada al trigger y el cron recoge la vieja y el reintento, sin tocar la enviada ni la que está en backoff');

-- 17  `for update skip locked` en el cuerpo del dispatcher.
--
--     ESTA ASERCIÓN ES SOBRE EL CUERPO, NO SOBRE EL COMPORTAMIENTO, y la
--     cabecera explica por qué no puede ser de otra forma: este archivo entero
--     vive en una transacción sin commitear, así que una segunda sesión no vería
--     ni una de sus filas y «dos sesiones reclaman conjuntos disjuntos» no es
--     observable desde aquí. Se afirma lo que sí se puede afirmar, y se dice que
--     es lo que es.
--
--     Protege un caso real y distinto del solapamiento de ticks (`pg_cron` corre
--     en serie, medido en la Fase 3): un humano en el editor SQL llamando al
--     dispatcher mientras el cron está activo.
select is(
  (select coalesce(string_agg(
            (p.prosrc ~* 'for\s+update\s+skip\s+locked')::text, '+'), '<sin funcion>')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'dispatch_push_notifications'),
  'true',
  'el dispatcher reclama con for update skip locked');


-- ===========================================================================
-- GRUPO J — NO REGRESIÓN SOBRE `notifications`
-- ===========================================================================

delete from public.notifications;

-- 18  El índice único parcial de la migración 06 sigue arbitrando: una
--     `dedupe_key` repetida para el mismo destinatario no duplica.
--
--     Nace en verde. Es control de no regresión: se pone roja el día que alguien
--     «aproveche» la migración del transporte para reorganizar la tabla.
insert into public.notifications
  (recipient_id, type, title, body, dedupe_key)
values
  ('0a000000-0000-0000-0000-00000000000a', 'asignacion'::public.notification_type,
   'J', 'primera', 'J:repetida')
on conflict do nothing;

insert into public.notifications
  (recipient_id, type, title, body, dedupe_key)
values
  ('0a000000-0000-0000-0000-00000000000a', 'asignacion'::public.notification_type,
   'J', 'segunda, no debe entrar', 'J:repetida')
on conflict do nothing;

select is(
  (select count(*)::text from public.notifications where dedupe_key = 'J:repetida'),
  '1',
  'una dedupe_key repetida sigue sin duplicar: el índice único parcial de la migración 06 arbitra igual que antes');

-- 19  EL TRIGGER NO ESCRIBE NINGUNA COLUMNA DE LA FILA QUE ACABA DE ENTRAR.
--
--     No es estilo: un `update` sobre la misma tabla desde un trigger de fila es
--     una puerta a recursión, y aquí no hace falta porque la ventana de gracia
--     del dispatcher ya separa los dos caminos. La fila recién insertada tiene
--     que salir exactamente como entró.
--
--     `next_attempt_at = created_at` es la comprobación fina: si el trigger
--     hubiera empujado el backoff «para que el cron no la pille», estos dos
--     dejarían de coincidir.
select is(
  (select coalesce(string_agg(
            n.push_status::text || '/' ||
            n.push_attempts::text || '/' ||
            coalesce(n.push_last_error, '<null>') || '/' ||
            (n.next_attempt_at = n.created_at)::text, '+'), '<sin fila>')
     from public.notifications n where n.dedupe_key = 'J:repetida'),
  'pendiente/0/<null>/true',
  'el trigger no altera ninguna columna de la notificación que lo disparó');

select * from finish();
rollback;
