-- ============================================================================
-- 05_sync.test.sql — los invariantes de base del motor de sincronización iCal
--
-- ESTE ARCHIVO NACIÓ EN ROJO, A PROPÓSITO. Es Wave 0 de la Fase 3: enumeró, antes
-- de que existiera una línea del motor, los catorce invariantes que las
-- migraciones 11 a 14 tienen que hacer verdaderos. Ninguna tarea posterior de la
-- fase puede declararse hecha con una verificación inventada sobre la marcha: la
-- verificación ya está escrita aquí y ya falla.
--
-- Las aserciones 15 a 26 las añadió el plan 03-04 y NO nacen en rojo: miden el
-- comportamiento de `sync_feed_apply()`, que ese mismo plan entrega en la
-- migración 12. Son el contrato ejecutable de la mitad ADITIVA del diff.
--
-- CONSECUENCIA OPERATIVA, y hay que conocerla antes de correr nada:
-- mientras este archivo esté en rojo, `npm run db:test` sale con código distinto
-- de cero. El plan 03-07 es el que devuelve la suite completa a verde. Los otros
-- cuatro archivos pgTAP siguen verdes desde el primer momento y ninguno de ellos
-- se toca aquí: los 6 fallos que quedan están concentrados en este archivo y en
-- ningún otro.
--
-- CÓMO CORRER SOLO ESTE ARCHIVO. `pgtap` NO está instalada de forma permanente
-- en el stack local (medido: `installed_version` vacío en
-- `pg_available_extensions`); la crea y la borra `supabase test db` en cada
-- corrida. Así que pasarle este archivo a psql tal cual falla con
-- `function plan(integer) does not exist`. Hay que crearla DENTRO de la misma
-- transacción, y **en el esquema `extensions`, nunca en `public`**: instalada en
-- `public` mete sus vistas, tablas y funciones en ese esquema y pone en rojo, de
-- mentira, los guardarraíles 3, 4 y 9 de `02_guardarrailes.test.sql`. Medido.
--
--   { echo 'begin;';
--     echo 'create extension if not exists pgtap with schema extensions;';
--     sed '0,/^begin;$/s/^begin;$//' supabase/tests/05_sync.test.sql;
--   } | docker exec -i supabase_db_vivaguest psql -U postgres -d postgres -qAtX -f -
--
-- Las banderas `-A -t` importan y se añadieron en el plan 03-04: sin ellas psql
-- imprime cada línea TAP dentro de una tabla con cabecera y con un espacio
-- delante, y un `grep '^not ok'` sobre esa salida devuelve CERO con el archivo
-- entero en rojo. Es un falso verde de la herramienta de medición, no del código.
--
-- El `rollback;` del final deshace también la extensión, así que la base local
-- compartida entre worktrees queda exactamente como estaba.
--
-- CÓMO SE LEE EL ROJO. No basta con contar las líneas `not ok`: dos regresiones
-- no relacionadas se cancelan en el agregado y la wave pasa igual. Hay que
-- extraer los identificadores y compararlos contra la lista esperada.
-- `pg_prove`, que es lo que usa `supabase test db`, ya los imprime literalmente
-- (`Failed tests:  4-9`). La lista de identificadores en rojo, por plan:
--
--   tras 03-01 (archivo nuevo)     1 2 3 4 5 6 7 8 9 10 11 12    (doce)
--   tras 03-03 (migración 11)      4 5 6 7 8 9                   (seis)
--   tras 03-04 (migración 12)      4 5 6 7 8 9                   (seis, LAS MISMAS)
--
-- QUE 03-04 NO MUEVA NINGUNA DE LAS CATORCE ORIGINALES ES LO ESPERADO, y merece
-- leerse despacio porque invita a un falso rojo y a un falso verde a la vez:
-- las aserciones 7, 8 y 9 son COLECTIVAS sobre las TRES funciones del motor, así
-- que crear una sola de las tres no puede ponerlas verdes. Se quedan rojas
-- nombrando únicamente a `dispatch_feed_syncs` y `feed_health_watchdog`, que son
-- de las migraciones 13 y 14. `sync_feed_apply` ya NO aparece en su diagnóstico:
-- esa desaparición, y no el total, es la evidencia de que el plan 03-04 hizo su
-- parte de las tres. Contar `not ok` habría dicho "6 antes y 6 después, no pasó
-- nada".
--
-- Las aserciones 13 y 14 pasan DESDE EL PRIMER MOMENTO. No es vacuidad: son
-- invariantes que ya existen desde la Fase 1 (el trigger de la máquina de estados
-- y el índice parcial de un aseo activo por apartamento y fecha). Están aquí
-- porque el motor de sync depende de ellas y porque `service_role` salta la RLS
-- pero NO salta los triggers: si alguien las rompiera al añadir las migraciones
-- de esta fase, el rojo aparecería en este archivo y no en producción. Un
-- identificador fuera de esa lista es una regresión aunque el total cuadre.
--
-- RESTRICCIONES DEL REPO QUE ESTE ARCHIVO RESPETA:
--   - Las fechas de negocio salen de `public.today_bog()`. La función de fecha
--     que el guardarraíl 4 de CI prohíbe no se nombra aquí ni en los comentarios.
--   - La comparación del estado se escribe con el operador de distinción, nunca
--     con el de desigualdad: la fila informativa tiene `state` nulo y con el de
--     desigualdad se saldría del índice parcial en silencio.
--   - Todo va entre `begin;` y `rollback;`, como los otros cuatro archivos.
--
-- NINGUNA ASERCIÓN PUEDE PASAR POR AUSENCIA. Es la trampa que la Fase 2 midió
-- cuatro veces: un `is_empty` sobre un catálogo que todavía no tiene filas pasa
-- en verde y no prueba nada. Por eso las aserciones que hablan de objetos que aún
-- no existen están escritas como "cuenta lo que DEBERÍA estar y compárala", no
-- como "no encuentres nada malo".
--
-- Y NINGUNA ES UN ROJO INSATISFACIBLE, que es el error contrario y el que la
-- Fase 1 cometió con el literal de `search_path`: una aserción que ninguna DDL
-- válida puede poner en verde. Se midió inyectando en esta misma transacción un
-- DDL mínimo (crear las dos extensiones fuera de `public`, agendar los tres jobs,
-- declarar las tres funciones con privilegio elevado y `search_path` vacío más su
-- revoke, crear la tabla de bitácora con RLS y policy, y añadir el CHECK de la
-- columna de descripción cruda) y comprobando que las **catorce** pasan.
--
-- De ese control salió además un dato que el plan que agende el dispatcher va a
-- necesitar: `cron.schedule` **rechaza** el intervalo `'1 minute'` con
-- `invalid schedule`. La sintaxis de intervalo de pg_cron 1.6.4 solo acepta
-- segundos; para el tick de un minuto va la expresión cron `'* * * * *'`.
-- ============================================================================

begin;
select plan(26);

-- ---------------------------------------------------------------------------
-- Helper: leer un escalar de un catálogo que quizá todavía no existe.
--
-- `cron.job` no existe hasta que se instale la extensión. Una consulta directa
-- contra ella no da `not ok`: da un error de planificación que ABORTA la
-- transacción entera y se lleva por delante el archivo completo, incluidas las
-- aserciones que sí podían medirse. Este envoltorio convierte esa ausencia en un
-- valor comparable, que es lo que permite que el archivo nazca en rojo de forma
-- legible en vez de reventar.
--
-- Vive en `pg_temp` y muere con la transacción: no aparece en `public` ni en
-- `private`, así que no la alcanzan los guardarraíles de `02_guardarrailes`.
-- ---------------------------------------------------------------------------
create function pg_temp.escalar(consulta text) returns text
language plpgsql as $fn$
declare
  resultado text;
begin
  execute consulta into resultado;
  return coalesce(resultado, '<null>');
exception when others then
  return '<inalcanzable: ' || sqlstate || '>';
end;
$fn$;

-- ===========================================================================
-- CRITERIO 1 — el lazo de pg_cron + pg_net (SYNC-01)
-- ===========================================================================

-- 1  Sin la extensión no hay quién dispare nada. Se cuenta la fila del catálogo
--    en vez de usar `has_extension` para no depender de la firma que traiga la
--    versión de pgTAP instalada.
select is(
  (select count(*)::int from pg_extension where extname = 'pg_cron'),
  1,
  'SYNC-01 la extensión pg_cron está instalada');

-- 2  pg_net es la mitad del fan-out: una invocación HTTP por feed, que es lo que
--    aísla un feed caído de los demás por construcción.
select is(
  (select count(*)::int from pg_extension where extname = 'pg_net'),
  1,
  'SYNC-01 la extensión pg_net está instalada');

-- 3  Ninguna de las dos puede vivir en `public`. Es lo que mantiene verde a
--    `supabase db advisors --type security`, que marca `extension_in_public`.
--    La aserción cuenta cuántas de las dos están instaladas FUERA de `public`, y
--    exige dos: escrita como "ninguna en public" pasaría en verde con las dos
--    extensiones sin instalar, que es exactamente el falso verde por ausencia.
select is(
  (select count(*)::int
     from pg_extension e
     join pg_namespace n on n.oid = e.extnamespace
    where e.extname in ('pg_cron', 'pg_net')
      and n.nspname <> 'public'),
  2,
  'SYNC-01 pg_cron y pg_net están instaladas y ninguna vive en el esquema public');

-- 4  El dispatcher agendado y ACTIVO. Un job agendado pero inactivo es un job
--    muerto que se ve vivo en la consola.
select is(
  pg_temp.escalar($q$
    select count(*)::text from cron.job
     where jobname = 'dispatch-feed-syncs' and active
  $q$),
  '1',
  'SYNC-01 el job dispatch-feed-syncs existe en cron.job y está activo');

-- 5  La poda del historial. pg_cron NO limpia `cron.job_run_details` solo, y con
--    tick de un minuto son 1440 filas al día por job: más de medio millón al año
--    en el free tier. Sin poda, el latido del watchdog se apoya en una tabla que
--    crece sin límite.
select is(
  pg_temp.escalar($q$
    select count(*)::text from cron.job
     where jobname = 'purge-cron-history' and active
  $q$),
  '1',
  'SYNC-01 el job de poda de cron.job_run_details existe y está activo');

-- 6  El watchdog. Es lo que hace que la alerta de feed muerto dependa de la
--    obsolescencia de `last_success_at` y no de que el código del worker llegue a
--    correr: un sistema que solo alerta cuando su propio código corre es ciego a
--    su propia caída.
select is(
  pg_temp.escalar($q$
    select count(*)::text from cron.job
     where jobname = 'feed-health-watchdog' and active
  $q$),
  '1',
  'SYNC-05 el job feed-health-watchdog existe en cron.job y está activo');

-- ===========================================================================
-- LAS TRES FUNCIONES NUEVAS DE public
-- ===========================================================================

-- 7  Existencia nominal de las tres. `is_empty` sobre la lista literal y no sobre
--    el catálogo: así el fallo dice CUÁL falta, y sobre todo así la aserción no
--    puede pasar por ausencia. Con `prokind = 'f'` quedan fuera agregados y
--    funciones de ventana; ninguna es una ruta de escritura.
select is_empty($q$
  select f.nombre
    from unnest(array['dispatch_feed_syncs',
                      'sync_feed_apply',
                      'feed_health_watchdog']) as f(nombre)
   where not exists (
     select 1
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = f.nombre
        and p.prokind = 'f')
$q$, 'las tres funciones del motor de sync existen en public');

-- 8  SECURITY DEFINER con search_path fijado a la cadena vacía. El guardarraíl 5
--    de 02_guardarrailes ya cubre la propiedad GLOBAL sobre toda función con
--    privilegio elevado; esta la afirma NOMINALMENTE sobre las tres, para que el
--    fallo diga cuál de ellas es y no obligue a leer un catálogo entero.
--
--    Las dos formas del literal se aceptan porque Postgres serializa `proconfig`
--    con comillas (`search_path` es GUC_LIST_QUOTE) y versiones más viejas no.
--    Ninguna otra forma vale: un search_path apuntando a un esquema real sigue
--    siendo un vector de escalada y sigue siendo un fallo.
select is_empty($q$
  select f.nombre
    from unnest(array['dispatch_feed_syncs',
                      'sync_feed_apply',
                      'feed_health_watchdog']) as f(nombre)
   where not exists (
     select 1
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = f.nombre
        and p.prosecdef
        and exists (
          select 1
            from unnest(coalesce(p.proconfig, '{}'::text[])) as cfg
           where cfg in ('search_path=', 'search_path=""')))
$q$, 'las tres funciones del motor de sync son SECURITY DEFINER con search_path vacío');

-- 9  Ninguna de las tres ejecutable por anon.
--
--    `alter default privileges ... revoke execute ... from public, anon` NO
--    funciona en PG 17.6 (medido en el plan 01-07): Postgres refusiona el ACL por
--    defecto, que siempre trae la entrada de PUBLIC, así que cada función nueva
--    nace ejecutable por cualquiera con la clave publicable, que es pública por
--    diseño. Cada función necesita su propio revoke AL LADO de la definición.
--
--    El guardarraíl 9 de 02_guardarrailes ya afirma la propiedad global. Esta la
--    afirma sobre las tres por nombre, y de paso exige que EXISTAN: escrita solo
--    como "ninguna función de esta lista es ejecutable por anon", pasaría en verde
--    con las tres funciones sin crear.
select is_empty($q$
  select f.nombre
    from unnest(array['dispatch_feed_syncs',
                      'sync_feed_apply',
                      'feed_health_watchdog']) as f(nombre)
   where not exists (
     select 1
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = f.nombre
        and p.prokind = 'f'
        and not has_function_privilege('anon', p.oid, 'execute'))
$q$, 'ninguna de las tres funciones del motor de sync es ejecutable por anon');

-- ===========================================================================
-- feed_sync_runs — la bitácora que responde las preguntas abiertas de la fase
-- ===========================================================================

-- 10  Existe, con RLS habilitada y con al menos una policy. Las tres condiciones
--     en una sola cuenta, porque separarlas invita a que dos de ellas pasen por
--     ausencia: una tabla que no existe no tiene RLS deshabilitada, simplemente
--     no está, y un `is_empty` no distingue esos dos casos.
--
--     RLS sin policy devuelve todo vacío en silencio, y ese silencio es lo que
--     empuja a alguien a "arreglarlo" desactivando la RLS.
select is(
  (select count(*)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'feed_sync_runs'
      and c.relkind = 'r'
      and c.relrowsecurity
      and exists (select 1 from pg_policy p where p.polrelid = c.oid)),
  1,
  'public.feed_sync_runs existe, tiene RLS habilitada y al menos una policy');

-- 11  Ni anon ni authenticated conservan privilegio alguno sobre esa tabla.
--     Una tabla nueva nace con REFERENCES, TRIGGER y TRUNCATE para anon, y
--     TRUNCATE ignora la RLS por completo.
--
--     La suma con el caso de la tabla ausente es deliberada: sin ella, esta
--     aserción daría 0 hoy —cero grants sobre una tabla que no existe— y pasaría
--     en verde sin haber medido nada.
select is(
  (select count(*)::int
     from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'feed_sync_runs'
      and grantee in ('anon', 'authenticated'))
  + (case when to_regclass('public.feed_sync_runs') is null then 1 else 0 end),
  0,
  'ni anon ni authenticated conservan privilegios sobre public.feed_sync_runs');

-- ---------------------------------------------------------------------------
-- Fixtures para las aserciones 12 a 14.
--
-- Mismo estilo que 01_invariantes.test.sql: se limpia el seed en orden inverso
-- de FK y se siembra lo mínimo. El rollback del final lo deshace todo, así que
-- esto no toca la base que comparten los otros worktrees.
--
-- Los montos son bigint de pesos enteros, por eso los literales llevan ::bigint.
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

insert into auth.users (id, email) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'sync@vg.co');

insert into public.profiles (id, role, full_name, is_active, deactivated_at) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aseador', 'Aseadora Sync', true, null)
on conflict (id) do update
  set role           = excluded.role,
      full_name      = excluded.full_name,
      is_active      = excluded.is_active,
      deactivated_at = excluded.deactivated_at;

-- P1 sostiene la aserción 13 (el aseo que llega a completada).
-- P2 sostiene la 14 (cancelar y recrear el mismo día).
-- P3 sostiene la 12, para que escribir en la reserva no perturbe a las otras dos.
insert into public.properties
  (id, nombre, cluster, gestion_vivaguest, tarifa_huesped, pago_aseador, responsable_id) values
  ('c1111111-1111-1111-1111-111111111111', 'Apto sync 1', 'Cluster Sync', true,
   120000::bigint, 45000::bigint, null),
  ('c2222222-2222-2222-2222-222222222222', 'Apto sync 2', 'Cluster Sync', true,
   110000::bigint, 42000::bigint, null),
  ('c3333333-3333-3333-3333-333333333333', 'Apto sync 3', 'Cluster Sync', true,
   100000::bigint, 40000::bigint, null);

-- calendar_feeds NO lleva columna de URL: la URL de exportación del calendario es
-- una credencial y vive en property_secrets.
insert into public.calendar_feeds (id, property_id, provider) values
  ('cfee0001-1111-1111-1111-111111111111',
   'c3333333-3333-3333-3333-333333333333', 'airbnb');

insert into public.calendar_reservations
  (id, feed_id, property_id, uid, reservation_code, starts_on, ends_on, summary, payload_hash)
values
  ('ce500001-1111-1111-1111-111111111111',
   'cfee0001-1111-1111-1111-111111111111',
   'c3333333-3333-3333-3333-333333333333',
   'a1b2c3d4e5f6-fixture05@airbnb.com', 'HMFIXT0501',
   public.today_bog() + 5, public.today_bog() + 8, 'Reserved', 'hash-fixture-05');

insert into public.cleanings
  (id, property_id, origin, scheduled_date, aseador_id) values
  ('cc111111-1111-1111-1111-111111111111',
   'c1111111-1111-1111-1111-111111111111', 'manual', public.today_bog() + 1,
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('cc222222-2222-2222-2222-222222222222',
   'c2222222-2222-2222-2222-222222222222', 'ical', public.today_bog() + 2,
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

-- ===========================================================================
-- PRIVACIDAD — el dato personal del huésped muere en la normalización
-- ===========================================================================

-- 12  El campo libre que Airbnb manda dentro de cada evento reservado trae los
--     últimos cuatro dígitos del teléfono del huésped. La decisión bloqueada es
--     que no se persiste, y una decisión que solo vive en un comentario se olvida
--     en el tercer refactor. La migración 11 la convierte en un CHECK, así que
--     intentar escribir un valor no nulo en la columna homóloga tiene que fallar
--     con la clase de error de violación de restricción de comprobación.
--
--     Esta aserción está deliberadamente al final del bloque de fixtures y sobre
--     una reserva que ninguna otra aserción toca: mientras esté en rojo, la
--     escritura SÍ tiene efecto (pgTAP no la revierte cuando no lanza), y no puede
--     contaminar a las aserciones 13 y 14.
select throws_ok(
  $q$update public.calendar_reservations
        set raw_description = 'Reservation URL: … Phone Number (Last 4 Digits): 2370'
      where id = 'ce500001-1111-1111-1111-111111111111'$q$,
  '23514', null,
  'privacidad: la columna de descripción cruda de calendar_reservations es NULL por CHECK');

-- ===========================================================================
-- LO QUE EL SYNC NO PUEDE HACER, y no porque el RPC se porte bien
-- ===========================================================================

-- Se lleva CL1 a un estado terminal recorriendo la máquina completa. No se salta
-- a completada directo: pendiente -> en_curso -> completada es la única ruta legal.
update public.cleanings
   set state = 'en_curso', confirmado_at = now(), started_at = now()
 where id = 'cc111111-1111-1111-1111-111111111111';
update public.cleanings
   set state = 'completada', finished_at = now()
 where id = 'cc111111-1111-1111-1111-111111111111';

-- 13  El reconcile destructivo no puede cancelar trabajo YA HECHO, ni aunque el
--     RPC lo intentara por un error de diff. La garantía está en el trigger de la
--     máquina de estados, no en el código de la función: `service_role` salta la
--     RLS, pero NO salta los triggers. Escrita en el RPC sería una convención;
--     escrita en el trigger es un invariante.
--
--     Esta aserción PASA desde el primer momento: el trigger existe desde la
--     Fase 1. Está aquí porque las migraciones de esta fase podrían romperla y
--     entonces el rojo aparecería aquí y no con una aseadora sin pagar.
select throws_ok(
  $q$update public.cleanings
        set state = 'cancelada', cancelled_at = now()
      where id = 'cc111111-1111-1111-1111-111111111111'$q$,
  'P0001', null,
  'el sync no puede cancelar un aseo completada: el trigger lanza transicion_invalida');

-- 14  Cancelar un aseo y crear otro para el mismo apartamento y la MISMA fecha,
--     dentro de la misma transacción, no viola el índice de un aseo activo por
--     apartamento y fecha. Es la propiedad que hace posible el caso (a) del diff:
--     cuando una reserva se mueve, el aseo viejo se cancela y nace el nuevo en la
--     misma llamada al RPC, sin ventana intermedia en la que el apartamento se
--     quede sin aseo.
--
--     Funciona porque el índice es parcial sobre el operador de distinción: al
--     cancelar, la fila sale del índice dentro de la misma transacción. Con el
--     operador de desigualdad la fila informativa, cuyo estado es nulo, se saldría
--     del índice para siempre y la unicidad dejaría de existir sin que nada lo
--     dijera.
--
--     También pasa desde el primer momento, y por la misma razón que la 13.
select lives_ok(
  $q$
    update public.cleanings
       set state = 'cancelada', cancelled_at = now()
     where id = 'cc222222-2222-2222-2222-222222222222';
    insert into public.cleanings (property_id, origin, scheduled_date)
    values ('c2222222-2222-2222-2222-222222222222', 'ical',
            (select scheduled_date from public.cleanings
              where id = 'cc222222-2222-2222-2222-222222222222'));
  $q$,
  'cancelar y recrear el aseo del mismo apartamento y día en la misma transacción es legal');

-- ===========================================================================
-- EL RPC ADITIVO — sync_feed_apply(), migración 12 (plan 03-04)
--
-- Doce aserciones sobre la mitad ADITIVA del diff: pasos (a) a (d), (f) e (i).
-- La cancelación, `needs_review`, la detección de extensión y las
-- notificaciones son de la migración 13; aquí lo que se afirma sobre ellas es
-- justamente que NO ocurren todavía (aserción 24).
--
-- REGLA DEL ARNÉS, la del plan 02-14 y la que separa un test de una tautología:
-- ninguna igualdad puede ser `0 = 0`. Cada aserción de abajo compara contra un
-- valor que solo puede salir de una escritura que de verdad ocurrió —un arreglo
-- de fechas, un identificador, un contador que se movió— y varias llevan su
-- control positivo DENTRO de la misma comparación.
--
-- Cinco apartamentos nuevos, uno por propiedad que se mide, para que ninguna
-- aserción dependa del estado que dejó otra:
--   c4 aseos creados, idempotencia, bloqueo y desconocido
--   c5 turnover del mismo día y apagado de la urgencia
--   c6 gestión externa: fila inerte y el 23514 que NO ocurre
--   c7 aseo manual preexistente en la fecha de checkout
--   c8 ausencia y rotación de uid
-- ---------------------------------------------------------------------------

-- El RPC devuelve jsonb, así que llamarlo con un `select` a secas imprimiría
-- una fila en medio del flujo TAP. Se invoca siempre con `perform` dentro de un
-- bloque anónimo, que no produce salida.
create function pg_temp.evento(
  p_uid    text,
  p_codigo text,
  p_desde  date,
  p_hasta  date,
  p_clas   text default 'reserva'
) returns jsonb
language sql stable as $fn$
  select jsonb_build_object(
    'uid',             p_uid,
    'reservationCode', p_codigo,
    'summary',         case when p_clas = 'reserva' then 'Reserved'
                            else 'Airbnb (Not available)' end,
    'startsOn',        p_desde::text,
    'endsOn',          p_hasta::text,
    'clasificacion',   p_clas,
    -- El hash del evento normalizado. Basta con que sea estable por contenido:
    -- el RPC no lo interpreta, solo lo guarda.
    'payloadHash',     md5(p_uid || coalesce(p_codigo,'') || p_desde::text || p_hasta::text));
$fn$;

create function pg_temp.correr(p_feed uuid, p_eventos jsonb) returns void
language plpgsql as $fn$
begin
  perform public.sync_feed_apply(p_feed, p_eventos, now(), null,
                                 md5(p_eventos::text), 200);
end;
$fn$;

insert into public.properties
  (id, nombre, cluster, gestion_vivaguest, tarifa_huesped, pago_aseador, responsable_id) values
  ('c4444444-4444-4444-4444-444444444444', 'Apto sync 4', 'Cluster Sync', true,
   130000::bigint, 48000::bigint, null),
  ('c5555555-5555-5555-5555-555555555555', 'Apto sync 5', 'Cluster Sync', true,
   130000::bigint, 48000::bigint, null),
  -- El único de gestión externa. En la semilla real hay CINCO.
  ('c6666666-6666-6666-6666-666666666666', 'Apto sync 6', 'Cluster Sync', false,
   null, null, null),
  ('c7777777-7777-7777-7777-777777777777', 'Apto sync 7', 'Cluster Sync', true,
   130000::bigint, 48000::bigint, null),
  ('c8888888-8888-8888-8888-888888888888', 'Apto sync 8', 'Cluster Sync', true,
   130000::bigint, 48000::bigint, null);

insert into public.calendar_feeds (id, property_id, provider) values
  ('cfee0004-4444-4444-4444-444444444444', 'c4444444-4444-4444-4444-444444444444', 'airbnb'),
  ('cfee0005-5555-5555-5555-555555555555', 'c5555555-5555-5555-5555-555555555555', 'airbnb'),
  ('cfee0006-6666-6666-6666-666666666666', 'c6666666-6666-6666-6666-666666666666', 'airbnb'),
  ('cfee0007-7777-7777-7777-777777777777', 'c7777777-7777-7777-7777-777777777777', 'airbnb'),
  ('cfee0008-8888-8888-8888-888888888888', 'c8888888-8888-8888-8888-888888888888', 'airbnb');


-- ---------------------------------------------------------------------------
-- c4 — primera corrida: dos reservas.
-- ---------------------------------------------------------------------------
do $$ begin
  perform pg_temp.correr('cfee0004-4444-4444-4444-444444444444',
    jsonb_build_array(
      pg_temp.evento('uid-4A@airbnb.com', 'HMSYNC4A', public.today_bog() + 2,  public.today_bog() + 6),
      pg_temp.evento('uid-4B@airbnb.com', 'HMSYNC4B', public.today_bog() + 9,  public.today_bog() + 13)));
end $$;

-- 15  El aseo cae en el DTEND, SIN RESTAR UN DÍA. Es la regla de dominio que
--     más veces se ha roto en proyectos de este tipo, y restarle un día
--     significa mandar a la aseadora con el huésped todavía dentro.
--
--     Se compara el ARREGLO de fechas y no un conteo: un conteo de 2 pasaría
--     igual con las dos fechas corridas un día, que es exactamente el defecto
--     que esta aserción existe para atrapar. Y `array_agg` sobre cero filas da
--     NULL, que nunca es igual al arreglo esperado: no puede pasar por ausencia.
select is(
  (select array_agg(scheduled_date order by scheduled_date)
     from public.cleanings
    where property_id = 'c4444444-4444-4444-4444-444444444444'),
  array[public.today_bog() + 6, public.today_bog() + 13]::date[],
  'SYNC-02 el RPC crea un aseo por reserva, con scheduled_date = ends_on y sin restar un día');

-- ---------------------------------------------------------------------------
-- c4 — dos corridas más con el MISMO payload. Tres en total.
-- ---------------------------------------------------------------------------
do $$ begin
  perform pg_temp.correr('cfee0004-4444-4444-4444-444444444444',
    jsonb_build_array(
      pg_temp.evento('uid-4A@airbnb.com', 'HMSYNC4A', public.today_bog() + 2,  public.today_bog() + 6),
      pg_temp.evento('uid-4B@airbnb.com', 'HMSYNC4B', public.today_bog() + 9,  public.today_bog() + 13)));
  perform pg_temp.correr('cfee0004-4444-4444-4444-444444444444',
    jsonb_build_array(
      pg_temp.evento('uid-4A@airbnb.com', 'HMSYNC4A', public.today_bog() + 2,  public.today_bog() + 6),
      pg_temp.evento('uid-4B@airbnb.com', 'HMSYNC4B', public.today_bog() + 9,  public.today_bog() + 13)));
end $$;

-- 16  Idempotencia: tres corridas dejan DOS aseos, no seis. La propiedad es
--     ESTRUCTURAL —la dan `cleanings_one_active_per_property_date` y el
--     `on conflict do nothing`— y no un `if exists`, que tendría carrera.
--
--     Se afirma también que las reservas siguen siendo dos: si el paso (a)
--     insertara en vez de actualizar, los aseos seguirían siendo dos por el
--     índice y el defecto pasaría inadvertido.
select is(
  (select array[
     (select count(*) from public.cleanings
       where property_id = 'c4444444-4444-4444-4444-444444444444'),
     (select count(*) from public.calendar_reservations
       where feed_id = 'cfee0004-4444-4444-4444-444444444444')]),
  array[2, 2]::bigint[],
  'SYNC-02 correr el mismo payload tres veces deja dos aseos y dos reservas, no seis y seis');

-- ---------------------------------------------------------------------------
-- c4 — una corrida con un bloqueo del propietario añadido.
-- ---------------------------------------------------------------------------
do $$ begin
  perform pg_temp.correr('cfee0004-4444-4444-4444-444444444444',
    jsonb_build_array(
      pg_temp.evento('uid-4A@airbnb.com', 'HMSYNC4A', public.today_bog() + 2,  public.today_bog() + 6),
      pg_temp.evento('uid-4B@airbnb.com', 'HMSYNC4B', public.today_bog() + 9,  public.today_bog() + 13),
      pg_temp.evento('uid-4C@airbnb.com', null, public.today_bog() + 20, public.today_bog() + 24, 'bloqueo')));
end $$;

-- 17  Un bloqueo del propietario NO genera aseo. La comparación es contra el
--     mismo arreglo de dos fechas de la aserción 15, así que afirma las dos
--     cosas a la vez: que el bloqueo no creó nada Y que las dos reservas
--     siguen produciendo su aseo. Un `is_empty` sobre la fecha del bloqueo
--     pasaría en verde con la tabla entera vacía.
select is(
  (select array_agg(scheduled_date order by scheduled_date)
     from public.cleanings
    where property_id = 'c4444444-4444-4444-4444-444444444444'),
  array[public.today_bog() + 6, public.today_bog() + 13]::date[],
  'SYNC-03 un evento de bloqueo no crea ningún aseo, y no perturba a los de reserva');

-- ---------------------------------------------------------------------------
-- c4 — una corrida con un evento desconocido añadido.
-- ---------------------------------------------------------------------------
do $$ begin
  perform pg_temp.correr('cfee0004-4444-4444-4444-444444444444',
    jsonb_build_array(
      pg_temp.evento('uid-4A@airbnb.com', 'HMSYNC4A', public.today_bog() + 2,  public.today_bog() + 6),
      pg_temp.evento('uid-4B@airbnb.com', 'HMSYNC4B', public.today_bog() + 9,  public.today_bog() + 13),
      pg_temp.evento('uid-4D@airbnb.com', null, public.today_bog() + 30, public.today_bog() + 33, 'desconocido')));
end $$;

-- 18  Un evento `desconocido` tampoco crea aseo: la falla es CERRADA. Es la
--     mitad que hace segura la clasificación de tres valores del plan 03-02, y
--     su contraparte —la guarda de colapso, que alerta cuando TODOS los eventos
--     caen a desconocido— vive en el worker del plan 03-06.
select is(
  (select array_agg(scheduled_date order by scheduled_date)
     from public.cleanings
    where property_id = 'c4444444-4444-4444-4444-444444444444'),
  array[public.today_bog() + 6, public.today_bog() + 13]::date[],
  'SYNC-03 un evento desconocido no crea ningún aseo: la falla es cerrada');

-- ---------------------------------------------------------------------------
-- c6 — gestión externa, primera corrida SIN turnover.
-- ---------------------------------------------------------------------------
do $$ begin
  perform pg_temp.correr('cfee0006-6666-6666-6666-666666666666',
    jsonb_build_array(
      pg_temp.evento('uid-6A@airbnb.com', 'HMSYNC6A', public.today_bog() + 3, public.today_bog() + 7)));
end $$;

-- 19  SYNC-11. La fila del apartamento de gestión externa nace INERTE: sin
--     estado, sin aseador, sin tarifas y sin urgencia. Y lo hace
--     `tg_cleanings_snapshot()` SOLO: el RPC inserta cinco columnas y ninguna
--     de estas. El primer elemento del arreglo es el control positivo —hay
--     exactamente un aseo— sin el cual el segundo sería `0 = 0`.
select is(
  (select array[
     count(*),
     count(*) filter (where is_managed is false
                        and state          is null
                        and aseador_id     is null
                        and tarifa_huesped is null
                        and pago_aseador   is null
                        and is_urgent      is false)]
     from public.cleanings
    where property_id = 'c6666666-6666-6666-6666-666666666666'),
  array[1, 1]::bigint[],
  'SYNC-11 el aseo de una unidad de gestión externa nace inerte: sin estado, sin aseador y sin tarifas');

-- 20  EL RECÁLCULO DE URGENCIA SOBRE UNA UNIDAD DE GESTIÓN EXTERNA NO LANZA.
--
--     Esta corrida trae un turnover del mismo día (`ends_on` de la primera =
--     `starts_on` de la segunda), así que el paso (f) SÍ evaluaría la urgencia
--     a verdadera para ese aseo. `cl_unmanaged_is_inert` exige `is_urgent`
--     falso cuando `is_managed` es falso: sin el filtro `and c.is_managed` en
--     el `where`, esto revienta con 23514.
--
--     Es la aserción que justifica ese filtro. Sin ella el filtro parece
--     decorativo y el primer plan que "limpie" el `where` lo borra. Medido: con
--     el filtro quitado, esta aserción se pone roja con 23514 sobre
--     `cl_unmanaged_is_inert`.
select lives_ok(
  $q$select pg_temp.correr('cfee0006-6666-6666-6666-666666666666',
        jsonb_build_array(
          pg_temp.evento('uid-6A@airbnb.com', 'HMSYNC6A', public.today_bog() + 3, public.today_bog() + 7),
          pg_temp.evento('uid-6B@airbnb.com', 'HMSYNC6B', public.today_bog() + 7, public.today_bog() + 9)))$q$,
  'SYNC-07 el recálculo de is_urgent sobre una unidad de gestión externa no viola cl_unmanaged_is_inert (and c.is_managed)');

-- ---------------------------------------------------------------------------
-- c5 — turnover del mismo día en un apartamento GESTIONADO.
-- ---------------------------------------------------------------------------
do $$ begin
  perform pg_temp.correr('cfee0005-5555-5555-5555-555555555555',
    jsonb_build_array(
      pg_temp.evento('uid-5A@airbnb.com', 'HMSYNC5A', public.today_bog() + 2, public.today_bog() + 6),
      pg_temp.evento('uid-5B@airbnb.com', 'HMSYNC5B', public.today_bog() + 6, public.today_bog() + 9)));
end $$;

-- 21  SYNC-07. Checkout y checkin el mismo día: el aseo de ese día nace urgente
--     y NINGÚN otro. La comparación es sobre la cadena completa
--     `fecha=urgencia,fecha=urgencia`, así que en una sola aserción quedan
--     fijados los tres hechos: cuántos aseos hay, en qué fechas, y cuál de
--     ellos es el urgente. Un `count(*) where is_urgent = 1` no distinguiría
--     "el correcto" de "otro".
--
--     Es el caso real del feed: `DTEND=20261010` de una reserva y
--     `DTSTART=20261010` de otra.
select is(
  (select string_agg(scheduled_date::text || '=' || is_urgent::text, ',' order by scheduled_date)
     from public.cleanings
    where property_id = 'c5555555-5555-5555-5555-555555555555'),
  (public.today_bog() + 6)::text || '=true,' || (public.today_bog() + 9)::text || '=false',
  'SYNC-07 checkout y checkin el mismo día marcan urgente ese aseo y solo ese');

-- ---------------------------------------------------------------------------
-- c5 — segunda corrida: la reserva ENTRANTE se movió un día.
-- ---------------------------------------------------------------------------
do $$ begin
  perform pg_temp.correr('cfee0005-5555-5555-5555-555555555555',
    jsonb_build_array(
      pg_temp.evento('uid-5A@airbnb.com', 'HMSYNC5A', public.today_bog() + 2, public.today_bog() + 6),
      pg_temp.evento('uid-5B@airbnb.com', 'HMSYNC5B', public.today_bog() + 7, public.today_bog() + 9)));
end $$;

-- 22  LA URGENCIA SE APAGA SOLA. Es la diferencia entre RECALCULAR y ACUMULAR:
--     el paso (f) es `set is_urgent = exists (...)`, no un `set is_urgent =
--     true` condicional. Con la forma condicional esta aserción es la única de
--     las doce que se pone roja, y en producción el aseo se quedaría marcado
--     urgente para siempre aunque el huésped entrante ya no llegue ese día.
--
--     Las fechas de los dos aseos no cambian —solo se movió el `starts_on` de
--     la entrante—, así que la comparación de la cadena completa demuestra
--     además que no se creó ni se borró ningún aseo por el camino.
select is(
  (select string_agg(scheduled_date::text || '=' || is_urgent::text, ',' order by scheduled_date)
     from public.cleanings
    where property_id = 'c5555555-5555-5555-5555-555555555555'),
  (public.today_bog() + 6)::text || '=false,' || (public.today_bog() + 9)::text || '=false',
  'SYNC-07 si la reserva entrante se mueve, la urgencia se apaga sola: se recalcula, no se acumula');

-- ---------------------------------------------------------------------------
-- c7 — un aseo MANUAL preexistente justo en la fecha de checkout, con aseadora
--      ya asignada. Es trabajo humano y el sync no lo puede tocar.
-- ---------------------------------------------------------------------------
insert into public.cleanings
  (id, property_id, origin, tipo, scheduled_date, aseador_id) values
  ('cc777777-7777-7777-7777-777777777777',
   'c7777777-7777-7777-7777-777777777777', 'manual', 'repaso',
   public.today_bog() + 6, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

do $$ begin
  perform pg_temp.correr('cfee0007-7777-7777-7777-777777777777',
    jsonb_build_array(
      pg_temp.evento('uid-7A@airbnb.com', 'HMSYNC7A', public.today_bog() + 2, public.today_bog() + 6)));
end $$;

-- 23  El aseo manual no se duplica NI se modifica. Los cinco elementos cubren
--     los cinco modos de fallo distintos: que se duplicara (el conteo), que se
--     sustituyera por otra fila (el identificador), que el sync se lo apropiara
--     (`origin` y `tipo`), que le re-apuntara la reserva (el `reservation_id`,
--     que el paso (d) no toca porque filtra por `origin = 'ical'`) y que le
--     quitara la aseadora ya asignada.
select is(
  (select array[
     count(*)::text,
     min(id::text),
     min(origin),
     min(tipo::text),
     (count(*) filter (where reservation_id is null))::text,
     (count(*) filter (where aseador_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'))::text]
     from public.cleanings
    where property_id = 'c7777777-7777-7777-7777-777777777777'),
  array['1', 'cc777777-7777-7777-7777-777777777777', 'manual', 'repaso', '1', '1'],
  'el sync no duplica ni modifica un aseo manual que ya ocupa la fecha de checkout');

-- ---------------------------------------------------------------------------
-- c8 — dos reservas y luego una sola: la segunda desaparece del payload.
-- ---------------------------------------------------------------------------
do $$ begin
  perform pg_temp.correr('cfee0008-8888-8888-8888-888888888888',
    jsonb_build_array(
      pg_temp.evento('uid-8A@airbnb.com', 'HMSYNC8A', public.today_bog() + 2,  public.today_bog() + 5),
      pg_temp.evento('uid-8B@airbnb.com', 'HMSYNC8B', public.today_bog() + 8,  public.today_bog() + 11)));
  perform pg_temp.correr('cfee0008-8888-8888-8888-888888888888',
    jsonb_build_array(
      pg_temp.evento('uid-8A@airbnb.com', 'HMSYNC8A', public.today_bog() + 2,  public.today_bog() + 5)));
end $$;

-- 24  LA PRIMERA AUSENCIA NO CANCELA NADA. La reserva ausente recibe
--     `disappeared_at` y su aseo SIGUE VIVO: la cancelación exige dos ausencias
--     consecutivas y es del plan 03-05. Los cuatro elementos afirman que la
--     marca cayó en la fila correcta —no en cualquiera— y que ni un solo aseo
--     pasó a cancelada. `delete` sobre `calendar_reservations` está prohibido
--     en todo el pipeline: por eso el conteo de reservas sigue siendo dos.
select is(
  (select array[
     (select count(*)::text from public.calendar_reservations
       where feed_id = 'cfee0008-8888-8888-8888-888888888888'),
     (select coalesce(string_agg(reservation_code, ',' order by reservation_code), '<ninguna>')
        from public.calendar_reservations
       where feed_id = 'cfee0008-8888-8888-8888-888888888888'
         and disappeared_at is not null),
     (select count(*)::text from public.cleanings
       where property_id = 'c8888888-8888-8888-8888-888888888888'
         and state is distinct from 'cancelada'),
     (select count(*)::text from public.cleanings
       where property_id = 'c8888888-8888-8888-8888-888888888888'
         and state = 'cancelada')]),
  array['2', 'HMSYNC8B', '2', '0'],
  'SYNC-04 la reserva ausente se marca con disappeared_at, no se borra, y su aseo sigue vivo');

-- ---------------------------------------------------------------------------
-- c8 — tercera corrida: el MISMO código de reserva llega con otro uid.
-- ---------------------------------------------------------------------------
do $$ begin
  perform pg_temp.correr('cfee0008-8888-8888-8888-888888888888',
    jsonb_build_array(
      pg_temp.evento('uid-8A-rotado@airbnb.com', 'HMSYNC8A', public.today_bog() + 2, public.today_bog() + 5)));
end $$;

-- 25  El emparejamiento de NIVEL 1 y el instrumento que contesta la pregunta
--     abierta de la fase. El código de negocio manda sobre el uid: la fila se
--     actualiza en vez de nacer una segunda, y el hecho se CUENTA.
--
--     El cuarto elemento es el control del arnés: la PRIMERA corrida de este
--     feed dejó el contador en cero. Sin él, un contador roto que devolviera
--     siempre 1 pasaría esta aserción sin haber medido nada.
select is(
  (select array[
     (select uid from public.calendar_reservations
       where feed_id = 'cfee0008-8888-8888-8888-888888888888'
         and reservation_code = 'HMSYNC8A'),
     (select count(*)::text from public.calendar_reservations
       where feed_id = 'cfee0008-8888-8888-8888-888888888888'),
     (select uid_rotations::text from public.feed_sync_runs
       where feed_id = 'cfee0008-8888-8888-8888-888888888888' order by id desc limit 1),
     (select uid_rotations::text from public.feed_sync_runs
       where feed_id = 'cfee0008-8888-8888-8888-888888888888' order by id asc limit 1)]),
  array['uid-8A-rotado@airbnb.com', '2', '1', '0'],
  'SYNC-04 un código conocido con uid nuevo actualiza la fila y deja uid_rotations = 1 en feed_sync_runs');

-- 26  T-03-30. `sync_feed_apply` es `security definer` y escribe aseos y
--     reservas: invocable por `anon` sería escalada de privilegio directa con
--     solo la clave publicable, que es pública por diseño.
--
--     `alter default privileges ... revoke execute ... from public, anon` NO
--     basta en PG 17.6 (medido en el plan 01-07): hace falta el revoke
--     explícito al lado de la definición.
--
--     La aserción 9 ya afirma lo de `anon` sobre las tres funciones del motor.
--     Esta añade `authenticated` —ni el admin llama a este RPC— y, sobre todo,
--     el CONTROL POSITIVO de que `service_role` SÍ puede: sin él, revocar de
--     más pasaría en verde aquí y rompería el worker del plan 03-06 con permiso
--     denegado. Contar 1 exige además que la función exista.
select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'sync_feed_apply'
      and p.prokind = 'f'
      and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('authenticated', p.oid, 'execute')
      and has_function_privilege('service_role', p.oid, 'execute')),
  1,
  'sync_feed_apply no es ejecutable por anon ni por authenticated, y sí por service_role');

select * from finish();
rollback;
