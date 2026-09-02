-- ============================================================================
-- 05_sync.test.sql — los invariantes de base del motor de sincronización iCal
--
-- ESTE ARCHIVO NACE EN ROJO, A PROPÓSITO. Es Wave 0 de la Fase 3: enumera, antes
-- de que exista una línea del motor, los catorce invariantes que las migraciones
-- 11 a 14 tienen que hacer verdaderos. Ninguna tarea posterior de la fase puede
-- declararse hecha con una verificación inventada sobre la marcha: la
-- verificación ya está escrita aquí y ya falla.
--
-- CONSECUENCIA OPERATIVA, y hay que conocerla antes de correr nada:
-- mientras este archivo esté en rojo, `npm run db:test` sale con código distinto
-- de cero. El plan 03-07 es el que devuelve la suite completa a verde. Los otros
-- cuatro archivos pgTAP siguen verdes desde el primer momento y ninguno de ellos
-- se toca aquí: la corrida completa de hoy es `Files=6, Tests=61` con los 12
-- fallos concentrados en este archivo y en ningún otro.
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
--   } | docker exec -i supabase_db_vivaguest psql -U postgres -d postgres -q -f -
--
-- El `rollback;` del final deshace también la extensión, así que la base local
-- compartida entre worktrees queda exactamente como estaba.
--
-- CÓMO SE LEE EL ROJO. No basta con contar las líneas `not ok`: dos regresiones
-- no relacionadas se cancelan en el agregado y la wave pasa igual. Hay que
-- extraer los identificadores y compararlos contra la lista esperada.
-- `pg_prove`, que es lo que usa `supabase test db`, ya los imprime literalmente
-- (`Failed tests:  1-12`). Al escribirse este archivo, la lista de
-- identificadores en rojo es:
--
--   1 2 3 4 5 6 7 8 9 10 11 12         (doce)
--
-- y las aserciones 13 y 14 pasan DESDE EL PRIMER MOMENTO. No es vacuidad: son
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
select plan(14);

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

select * from finish();
rollback;
