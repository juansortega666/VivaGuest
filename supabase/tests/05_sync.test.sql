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
-- Las aserciones 27 a 50 las añadió el plan 03-05 y tampoco nacen en rojo: son
-- el contrato ejecutable de la mitad DESTRUCTIVA, la migración 13. Es el único
-- bloque del archivo donde un fallo significa que el sistema BORRA TRABAJO
-- PAGADO, no que se vea mal, y por eso todas las que afirman que un candado
-- protegió llevan en la misma cadena comparada un aseo hermano de la misma
-- corrida que SÍ se canceló.
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
--   tras 03-05 (migración 13)      4 5 6 7 8 9                   (seis, LAS MISMAS)
--
-- Y NO BASTA CON LOS IDENTIFICADORES TAMPOCO: hay que comprobar que el archivo
-- CORRIÓ ENTERO. Medido en el plan 03-05, con un señuelo: si una sentencia
-- lanza dentro de un bloque anónimo, la transacción se aborta y el archivo deja
-- de imprimir TAP a mitad. En esa corrida salieron 7 `not ok` en vez de 6 —una
-- diferencia que parece un solo fallo puntual— cuando en realidad solo habían
-- corrido 36 de las 50 aserciones y catorce no llegaron a medirse. La
-- comprobación es `ok + not ok = el número del plan`, y con `pg_prove` es la
-- línea `Tests: N`. Un conteo bajo puede ser una mejora o un incendio.
--
-- La segunda forma de ese mismo incendio, también medida en 03-05: una
-- subconsulta ESCALAR que devuelve dos filas no da `not ok`, da
-- `ERROR: more than one row returned by a subquery used as an expression`, y
-- aborta igual. Por eso toda subconsulta escalar de este archivo va agregada
-- (`string_agg`, `count`, `min`), incluso donde hoy solo puede haber una fila:
-- la fila de más aparece entonces en el valor comparado en vez de matar el
-- archivo.
--
-- SOBRE LA RENUMERACIÓN DE LAS MIGRACIONES: el texto de abajo, escrito en
-- 03-04, atribuye los jobs de `cron.job` y las dos funciones que faltan a las
-- migraciones 13 y 14. El número 13 lo tomó el reconcile destructivo del plan
-- 03-05, así que `dispatch_feed_syncs`, `feed_health_watchdog` y los tres jobs
-- son de las migraciones SIGUIENTES, las de los planes 03-06 y 03-07. Lo que no
-- cambia es la lista de identificadores en rojo.
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
select plan(50);

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
--     consecutivas. Los cuatro elementos afirman que la marca cayó en la fila
--     correcta —no en cualquiera— y que ni un solo aseo pasó a cancelada.
--     `delete` sobre `calendar_reservations` está prohibido en todo el
--     pipeline: por eso el conteo de reservas sigue siendo dos.
--
--     REVISADA A CONCIENCIA EN EL PLAN 03-05, que es cuando la cancelación
--     empezó a existir. El plan 03-04 la escribió afirmando que la cancelación
--     "no ocurre todavía" y dejó dicho que 03-05 tendría que releerla, porque
--     una aserción que pasaba por AUSENCIA de una función y sigue pasando
--     cuando la función ya existe es exactamente el tipo de verde que no
--     significa nada.
--
--     Sigue verde, y ahora por el motivo FUERTE: el reconcile de la migración
--     13 está cargado y corriendo sobre esta misma corrida, y no cancela porque
--     el candado de las dos ausencias se lo impide. Medido: con ese candado
--     quitado (señuelo S9 del plan 03-05) esta aserción se pone ROJA con
--     `have: {2,HMSYNC8B,1,1}`, o sea el aseo cancelado en la PRIMERA lectura
--     que no lo vio. Ya no es una aserción sobre lo que falta: es una aserción
--     sobre lo que el candado hace.
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


-- ===========================================================================
-- EL RECONCILE DESTRUCTIVO — sync_feed_apply(), migración 13 (plan 03-05)
--
-- Veinticuatro aserciones sobre la mitad que BORRA: los pasos (e), (g) y (h).
-- Todo lo anterior de la fase solo creaba filas; aquí se cancela, y un aseo
-- cancelado por equivocación a las 6am deja a una aseadora en la calle.
--
-- REGLA DEL ARNÉS, la misma del bloque anterior y aquí importa el DOBLE: una
-- aserción de "no se canceló nada" pasa en verde con el reconcile MUERTO. Por
-- eso ninguna de las de abajo se escribe sola: todas las que afirman que un
-- candado protegió llevan, EN LA MISMA CADENA COMPARADA, un aseo hermano de la
-- MISMA CORRIDA que sí se canceló. Ese aseo es el control positivo, y sin él
-- las aserciones 31, 33, 35, 37 y 48 valdrían exactamente nada.
--
-- Un apartamento por propiedad medida, para que ninguna aserción dependa del
-- estado que dejó otra:
--   d1 primera y segunda ausencia, control del contador y bitácora de estado
--   d2 el aseo en curso protegido, con su control cancelado al lado
--   d3 el aseo manual protegido, con su control cancelado al lado
--   d4 la ventana protegida, con su control, y la deduplicación de alertas
--   d5 el piso del feed, con su control
--   d6 el aseo completada, intacto, y el trigger que lo respalda
--   d7 la reserva movida, caso feliz
--   d8 la reserva movida con el aseo viejo intocable: la trampa del 23505
--   d9 cancelar y recrear el mismo día, a través del RPC
--   dA la extensión mal creada y sus notificaciones
--   dB EL TURNOVER SANO, que es la aserción que separa SYNC-07 de SYNC-08
--   dC el colapso de formato
--   dD la fila informativa de gestión externa que se reprograma
-- ---------------------------------------------------------------------------

-- TRES ADMINISTRADORES, y los tres hacen falta.
--
-- El bloque de fixtures de más arriba borró `public.profiles` entero y dejó una
-- sola aseadora. Sin admins, `notifications.recipient_id` no tiene a quién
-- apuntar, el `cross join` del paso (h) devuelve CERO filas y TODAS las
-- aserciones de notificaciones de abajo pasarían por vacuidad —incluida la 47,
-- que es la más importante del plan—. Es el modo de fallo que la Fase 2 midió
-- cuatro veces.
--
-- Dos activos y uno desactivado: el fan-out se afirma como "exactamente uno por
-- admin ACTIVO", no como "al menos una fila". Con un solo admin, un `cross
-- join` roto que emitiera una fila por aseo y no por destinatario daría el
-- mismo número y no se vería.
delete from public.notifications;

insert into auth.users (id, email) values
  ('ad000001-0000-0000-0000-000000000001', 'admin1@vg.co'),
  ('ad000002-0000-0000-0000-000000000002', 'admin2@vg.co'),
  ('ad000003-0000-0000-0000-000000000003', 'admin3@vg.co');

-- `on conflict do update` y no `insert` a secas: el espejo de `auth.users` ya
-- creó la fila de perfil con el rol por defecto.
insert into public.profiles (id, role, full_name, is_active, deactivated_at) values
  ('ad000001-0000-0000-0000-000000000001', 'admin', 'Admin Uno',      true,  null),
  ('ad000002-0000-0000-0000-000000000002', 'admin', 'Admin Dos',      true,  null),
  ('ad000003-0000-0000-0000-000000000003', 'admin', 'Admin Inactivo', false, now())
on conflict (id) do update
  set role           = excluded.role,
      full_name      = excluded.full_name,
      is_active      = excluded.is_active,
      deactivated_at = excluded.deactivated_at;

insert into public.properties
  (id, nombre, cluster, gestion_vivaguest, tarifa_huesped, pago_aseador, responsable_id) values
  ('cd000001-0000-0000-0000-000000000001', 'Apto rec 1', 'Cluster Rec', true,  130000::bigint, 48000::bigint, null),
  ('cd000002-0000-0000-0000-000000000002', 'Apto rec 2', 'Cluster Rec', true,  130000::bigint, 48000::bigint, null),
  ('cd000003-0000-0000-0000-000000000003', 'Apto rec 3', 'Cluster Rec', true,  130000::bigint, 48000::bigint, null),
  ('cd000004-0000-0000-0000-000000000004', 'Apto rec 4', 'Cluster Rec', true,  130000::bigint, 48000::bigint, null),
  ('cd000005-0000-0000-0000-000000000005', 'Apto rec 5', 'Cluster Rec', true,  130000::bigint, 48000::bigint, null),
  ('cd000006-0000-0000-0000-000000000006', 'Apto rec 6', 'Cluster Rec', true,  130000::bigint, 48000::bigint, null),
  ('cd000007-0000-0000-0000-000000000007', 'Apto rec 7', 'Cluster Rec', true,  130000::bigint, 48000::bigint, null),
  ('cd000008-0000-0000-0000-000000000008', 'Apto rec 8', 'Cluster Rec', true,  130000::bigint, 48000::bigint, null),
  ('cd000009-0000-0000-0000-000000000009', 'Apto rec 9', 'Cluster Rec', true,  130000::bigint, 48000::bigint, null),
  ('cd00000a-0000-0000-0000-00000000000a', 'Apto rec A', 'Cluster Rec', true,  130000::bigint, 48000::bigint, null),
  ('cd00000b-0000-0000-0000-00000000000b', 'Apto rec B', 'Cluster Rec', true,  130000::bigint, 48000::bigint, null),
  ('cd00000c-0000-0000-0000-00000000000c', 'Apto rec C', 'Cluster Rec', true,  130000::bigint, 48000::bigint, null),
  -- El único de gestión externa de este bloque.
  ('cd00000d-0000-0000-0000-00000000000d', 'Apto rec D', 'Cluster Rec', false, null,           null,          null);

insert into public.calendar_feeds (id, property_id, provider) values
  ('cfd00001-0000-0000-0000-000000000001', 'cd000001-0000-0000-0000-000000000001', 'airbnb'),
  ('cfd00002-0000-0000-0000-000000000002', 'cd000002-0000-0000-0000-000000000002', 'airbnb'),
  ('cfd00003-0000-0000-0000-000000000003', 'cd000003-0000-0000-0000-000000000003', 'airbnb'),
  ('cfd00004-0000-0000-0000-000000000004', 'cd000004-0000-0000-0000-000000000004', 'airbnb'),
  ('cfd00005-0000-0000-0000-000000000005', 'cd000005-0000-0000-0000-000000000005', 'airbnb'),
  ('cfd00006-0000-0000-0000-000000000006', 'cd000006-0000-0000-0000-000000000006', 'airbnb'),
  ('cfd00007-0000-0000-0000-000000000007', 'cd000007-0000-0000-0000-000000000007', 'airbnb'),
  ('cfd00008-0000-0000-0000-000000000008', 'cd000008-0000-0000-0000-000000000008', 'airbnb'),
  ('cfd00009-0000-0000-0000-000000000009', 'cd000009-0000-0000-0000-000000000009', 'airbnb'),
  ('cfd0000a-0000-0000-0000-00000000000a', 'cd00000a-0000-0000-0000-00000000000a', 'airbnb'),
  ('cfd0000b-0000-0000-0000-00000000000b', 'cd00000b-0000-0000-0000-00000000000b', 'airbnb'),
  ('cfd0000c-0000-0000-0000-00000000000c', 'cd00000c-0000-0000-0000-00000000000c', 'airbnb'),
  ('cfd0000d-0000-0000-0000-00000000000d', 'cd00000d-0000-0000-0000-00000000000d', 'airbnb');

-- Un solo lector para las aserciones de forma: "día relativo a hoy = estado /
-- needs_review / review_reason", en una cadena ordenada por fecha. Comparar la
-- cadena COMPLETA y no un conteo es lo que hace que la aserción diga a la vez
-- cuántos aseos hay, en qué fechas están, cuál se canceló y cuál no. Un
-- `count(*) where state = 'cancelada'` no distingue "se canceló el correcto" de
-- "se canceló otro".
create function pg_temp.foto(p_property uuid) returns text
language sql stable as $fn$
  select coalesce(string_agg(
           (c.scheduled_date - public.today_bog())::text
           || '=' || coalesce(c.state::text, '<informativa>')
           || '/' || c.needs_review::text
           || '/' || coalesce(c.review_reason, '-'),
           ',' order by c.scheduled_date, c.state)
         , '<sin aseos>')
    from public.cleanings c
   where c.property_id = p_property;
$fn$;


-- ---------------------------------------------------------------------------
-- d1 — primera ausencia, segunda ausencia, y el contador que lo demuestra.
-- ---------------------------------------------------------------------------
do $$ begin
  perform pg_temp.correr('cfd00001-0000-0000-0000-000000000001',
    jsonb_build_array(
      pg_temp.evento('uid-d1A@airbnb.com', 'HMRECD1A', public.today_bog() + 2, public.today_bog() + 6),
      pg_temp.evento('uid-d1B@airbnb.com', 'HMRECD1B', public.today_bog() + 9, public.today_bog() + 13)));
  -- Corrida 2: d1B desaparece. PRIMERA ausencia.
  perform pg_temp.correr('cfd00001-0000-0000-0000-000000000001',
    jsonb_build_array(
      pg_temp.evento('uid-d1A@airbnb.com', 'HMRECD1A', public.today_bog() + 2, public.today_bog() + 6)));
end $$;

-- 27  SYNC-04. LA PRIMERA AUSENCIA NO CANCELA NADA. Es el candado 2 y es lo que
--     elimina de raíz toda la clase de "una lectura mala canceló los aseos": a
--     30 minutos de cadencia, esperar una segunda corrida cuesta como mucho una
--     hora de retraso, que es operativamente invisible.
--
--     El quinto elemento es el control positivo y sin él la aserción no vale
--     nada: afirma que la ausencia SÍ se registró, en la fila correcta. Sin él,
--     un paso (b) roto que no marcara nada daría exactamente los mismos cuatro
--     primeros valores.
--
--     TODA subconsulta escalar de este bloque va agregada, incluso donde hoy
--     solo puede haber una fila. MEDIDO en el señuelo S8: una subconsulta
--     escalar que devuelve dos filas no da `not ok`, da `ERROR: more than one
--     row returned by a subquery`, y ese error ABORTA la transacción y se lleva
--     por delante todas las aserciones siguientes. Es la misma clase de falso
--     verde que el plan 03-04 midió con `min(uuid)`: el archivo deja de
--     imprimir TAP y el conteo de rojos sale BAJO, que parece una mejora.
select is(
  (select array[
     (select coalesce(string_agg(coalesce(state::text, '<null>'), '+' order by id), '<sin aseo>')
        from public.cleanings
       where property_id = 'cd000001-0000-0000-0000-000000000001'
         and scheduled_date = public.today_bog() + 13),
     (select coalesce(string_agg(coalesce(cancel_reason, '<ninguno>'), '+' order by id), '<sin aseo>')
        from public.cleanings
       where property_id = 'cd000001-0000-0000-0000-000000000001'
         and scheduled_date = public.today_bog() + 13),
     (select count(*)::text from public.cleanings
       where property_id = 'cd000001-0000-0000-0000-000000000001'
         and state = 'cancelada'),
     (select cleanings_cancelled::text from public.feed_sync_runs
       where feed_id = 'cfd00001-0000-0000-0000-000000000001' order by id desc limit 1),
     (select coalesce(string_agg(reservation_code, ',' order by reservation_code), '<ninguna>')
        from public.calendar_reservations
       where feed_id = 'cfd00001-0000-0000-0000-000000000001'
         and disappeared_at is not null)]),
  array['pendiente', '<ninguno>', '0', '0', 'HMRECD1B'],
  'SYNC-04 la primera ausencia marca disappeared_at y NO cancela: hacen falta dos corridas');

-- Corrida 3: d1B sigue ausente. SEGUNDA ausencia.
do $$ begin
  perform pg_temp.correr('cfd00001-0000-0000-0000-000000000001',
    jsonb_build_array(
      pg_temp.evento('uid-d1A@airbnb.com', 'HMRECD1A', public.today_bog() + 2, public.today_bog() + 6)));
end $$;

-- 28  SYNC-04. LA SEGUNDA AUSENCIA SÍ CANCELA, y solo el aseo de la reserva que
--     de verdad se fue. El aseo de d1A, que sigue en el feed, no se toca.
--
--     `needs_review` se afirma en FALSO sobre el cancelado a propósito: lo que
--     se cancela limpiamente no necesita revisión humana, y marcarlo además
--     convertiría cada cancelación normal en una alerta.
select is(
  pg_temp.foto('cd000001-0000-0000-0000-000000000001'),
  '6=pendiente/false/-,13=cancelada/false/-',
  'SYNC-04 la segunda ausencia consecutiva cancela el aseo de la reserva ausente, y solo ese');

-- 29  EL CONTROL DEL CONTADOR, y va en la MISMA aserción que las dos corridas.
--
--     Sin esto, todas las aserciones de "no se canceló nada" de abajo —la 31,
--     la 33, la 35, la 37 y la 48— pasarían en verde con el reconcile
--     COMPLETAMENTE MUERTO, porque un reconcile muerto tampoco cancela nada. El
--     arreglo compara las tres corridas seguidas: 0 en la de creación, 0 en la
--     primera ausencia, 1 en la segunda. Es la demostración de que el contador
--     se mueve, y de que se mueve en la corrida correcta.
select is(
  (select array_agg(cleanings_cancelled order by id)
     from public.feed_sync_runs
    where feed_id = 'cfd00001-0000-0000-0000-000000000001'),
  array[0, 0, 1],
  'SYNC-04 control: cleanings_cancelled va 0, 0, 1 en las tres corridas, y el 1 es el de la segunda ausencia');

-- 30  La bitácora de estado registra la cancelación con `actor_id` NULL, y el
--     NULL es INFORMACIÓN, no carencia: es lo que distingue "lo canceló el
--     sync" de "lo canceló el admin" cuando alguien reclame por un aseo que
--     desapareció de la agenda. El `reason` lo copia
--     `tg_cleanings_log_transition()` de `cancel_reason`, así que esta aserción
--     también fija que la lista cerrada de motivos llega hasta la auditoría.
select is(
  (select coalesce(string_agg(t.from_state::text || '->' || t.to_state::text
                              || '/' || (t.actor_id is null)::text
                              || '/' || coalesce(t.reason, '<ninguno>'),
                              ',' order by t.created_at, t.id), '<sin transiciones>')
     from public.cleaning_state_transitions t
     join public.cleanings c on c.id = t.cleaning_id
    where c.property_id = 'cd000001-0000-0000-0000-000000000001'),
  'pendiente->cancelada/true/reserva_desaparecida',
  'la cancelación del sync queda en cleaning_state_transitions con actor_id NULL');


-- ---------------------------------------------------------------------------
-- d2 — el aseo EN CURSO. La aseadora ya fue y hay que pagarle.
--
-- d2C termina en +7 y su aseo se lleva a `en_curso`; d2D termina en +11 y se
-- queda `pendiente`. Las dos desaparecen en la misma corrida, así que la
-- diferencia entre las dos es EXCLUSIVAMENTE el estado del aseo. d2E se queda
-- viva para que el piso de la corrida (+4) no sea el que bloquee: sin ella el
-- piso subiría y la aserción mediría otro candado sin decirlo.
-- ---------------------------------------------------------------------------
do $$ begin
  perform pg_temp.correr('cfd00002-0000-0000-0000-000000000002',
    jsonb_build_array(
      pg_temp.evento('uid-d2C@airbnb.com', 'HMRECD2C', public.today_bog() + 2, public.today_bog() + 7),
      pg_temp.evento('uid-d2D@airbnb.com', 'HMRECD2D', public.today_bog() + 3, public.today_bog() + 11),
      pg_temp.evento('uid-d2E@airbnb.com', 'HMRECD2E', public.today_bog() + 1, public.today_bog() + 4)));
end $$;

update public.cleanings
   set state         = 'en_curso',
       confirmado_at = now(),
       aseador_id    = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
       started_at    = now()
 where property_id = 'cd000002-0000-0000-0000-000000000002'
   and scheduled_date = public.today_bog() + 7;

do $$ begin
  perform pg_temp.correr('cfd00002-0000-0000-0000-000000000002',
    jsonb_build_array(
      pg_temp.evento('uid-d2E@airbnb.com', 'HMRECD2E', public.today_bog() + 1, public.today_bog() + 4)));
  perform pg_temp.correr('cfd00002-0000-0000-0000-000000000002',
    jsonb_build_array(
      pg_temp.evento('uid-d2E@airbnb.com', 'HMRECD2E', public.today_bog() + 1, public.today_bog() + 4)));
end $$;

-- 31  NUNCA SE CANCELA UN ASEO QUE YA EMPEZÓ. Es la regla de dominio no
--     negociable de 03-CONTEXT.md y la mitigación de T-03-42.
--
--     El aseo de +11 es el CONTROL POSITIVO y está en la misma cadena: misma
--     corrida, misma reserva ausente dos veces, mismos candados de fecha, y sí
--     se cancela. Lo único que los distingue es el estado del aseo. Sin ese
--     control, esta aserción pasaría con el reconcile muerto.
--
--     Y el de +7 no se pierde en silencio: queda `needs_review` con su motivo
--     enumerado, que es la mitad que hace aceptable la mitad conservadora.
--
--     DOS CAPAS Y UNA REDUNDANCIA MEDIDA: el `where` de la cancelación lleva a
--     la vez `state = 'pendiente'` y `started_at is null`, y
--     `cl_pendiente_shape` las hace co-implicadas. Quitar UNA de las dos deja
--     esta aserción VERDE, porque la otra sigue protegiendo. Hay que quitar las
--     DOS para ponerla en rojo. Medido en el plan 03-05; lo que impide que
--     alguien borre la capa aparentemente sobrante es la aserción estructural
--     50, no esta.
select is(
  pg_temp.foto('cd000002-0000-0000-0000-000000000002'),
  '4=pendiente/false/-,7=en_curso/true/reserva_desaparecida_aseo_iniciado,11=cancelada/false/-',
  'SYNC-04 un aseo en curso sobrevive a dos ausencias y queda en revisión; el pendiente hermano sí se cancela');


-- ---------------------------------------------------------------------------
-- d3 — el aseo MANUAL. Trabajo humano que el sync no puede destruir.
--
-- El aseo de +8 se convierte en `manual` CONSERVANDO su `reservation_id`: es el
-- único modo de que llegue a ser candidato del paso (e), y por tanto el único
-- modo de que la línea `origin = 'ical'` se mida de verdad. Un aseo manual sin
-- reserva apuntada nunca entra al `where` y la aserción pasaría por ausencia.
-- ---------------------------------------------------------------------------
do $$ begin
  perform pg_temp.correr('cfd00003-0000-0000-0000-000000000003',
    jsonb_build_array(
      pg_temp.evento('uid-d3F@airbnb.com', 'HMRECD3F', public.today_bog() + 2, public.today_bog() + 8),
      pg_temp.evento('uid-d3G@airbnb.com', 'HMRECD3G', public.today_bog() + 3, public.today_bog() + 14),
      pg_temp.evento('uid-d3H@airbnb.com', 'HMRECD3H', public.today_bog() + 1, public.today_bog() + 4)));
end $$;

update public.cleanings
   set origin     = 'manual',
       tipo       = 'repaso',
       aseador_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
 where property_id = 'cd000003-0000-0000-0000-000000000003'
   and scheduled_date = public.today_bog() + 8;

do $$ begin
  perform pg_temp.correr('cfd00003-0000-0000-0000-000000000003',
    jsonb_build_array(
      pg_temp.evento('uid-d3H@airbnb.com', 'HMRECD3H', public.today_bog() + 1, public.today_bog() + 4)));
  perform pg_temp.correr('cfd00003-0000-0000-0000-000000000003',
    jsonb_build_array(
      pg_temp.evento('uid-d3H@airbnb.com', 'HMRECD3H', public.today_bog() + 1, public.today_bog() + 4)));
end $$;

-- 32  EL RECONCILE NO TOCA NUNCA UN ASEO MANUAL. Es la línea de `where` que
--     ningún documento de research pedía y la mitigación de T-03-43.
--
--     El aseo de +14 es el control: misma corrida, misma clase de ausencia,
--     mismos candados de fecha, y sí se cancela. Lo único distinto es `origin`.
--
--     Se afirma además que la aseadora asignada sigue puesta: cancelar no es la
--     única forma de destruir trabajo humano.
select is(
  (select array[
     pg_temp.foto('cd000003-0000-0000-0000-000000000003'),
     (select coalesce(string_agg(origin || '/' || tipo::text
                                 || '/' || case when aseador_id is null then '-' else 'A' end,
                                 ',' order by scheduled_date), '<vacio>')
        from public.cleanings
       where property_id = 'cd000003-0000-0000-0000-000000000003')]),
  array['4=pendiente/false/-,8=pendiente/false/-,14=cancelada/false/-',
        'ical/normal/-,manual/repaso/A,ical/normal/-'],
  'el reconcile no cancela ni modifica un aseo manual, aunque su reserva lleve dos corridas ausente');


-- ---------------------------------------------------------------------------
-- d4 — LA VENTANA PROTEGIDA: hoy, mañana y todo el pasado son inmunes.
--
-- Cuatro reservas con checkout en -6, 0, +1 y +5. La de -6 se queda viva, y su
-- único trabajo es fijar el piso de la corrida en -6 para que el candado 4 NO
-- sea el que bloquee: si el piso subiera, las tres protegidas lo estarían por el
-- piso y la aserción diría estar midiendo la ventana sin medirla.
-- ---------------------------------------------------------------------------
do $$ begin
  perform pg_temp.correr('cfd00004-0000-0000-0000-000000000004',
    jsonb_build_array(
      pg_temp.evento('uid-d4I@airbnb.com', 'HMRECD4I', public.today_bog() - 5, public.today_bog()),
      pg_temp.evento('uid-d4J@airbnb.com', 'HMRECD4J', public.today_bog() - 4, public.today_bog() + 1),
      pg_temp.evento('uid-d4K@airbnb.com', 'HMRECD4K', public.today_bog() + 1, public.today_bog() + 5),
      pg_temp.evento('uid-d4L@airbnb.com', 'HMRECD4L', public.today_bog() - 9, public.today_bog() - 6)));
  perform pg_temp.correr('cfd00004-0000-0000-0000-000000000004',
    jsonb_build_array(
      pg_temp.evento('uid-d4L@airbnb.com', 'HMRECD4L', public.today_bog() - 9, public.today_bog() - 6)));
  perform pg_temp.correr('cfd00004-0000-0000-0000-000000000004',
    jsonb_build_array(
      pg_temp.evento('uid-d4L@airbnb.com', 'HMRECD4L', public.today_bog() - 9, public.today_bog() - 6)));
  -- CUARTA corrida, idéntica a la tercera. Es la que ejerce la deduplicación:
  -- los dos aseos protegidos siguen siendo candidatos de revisión y el paso (h)
  -- vuelve a INTENTAR su notificación. Quien impide la segunda fila es
  -- `notifications_dedupe_idx`, no un `where` del `select`, y por eso el intento
  -- tiene que ocurrir de verdad para que la propiedad quede medida.
  perform pg_temp.correr('cfd00004-0000-0000-0000-000000000004',
    jsonb_build_array(
      pg_temp.evento('uid-d4L@airbnb.com', 'HMRECD4L', public.today_bog() - 9, public.today_bog() - 6)));
end $$;

-- 33  T-03-41. EL ASEO DE HOY NO SE CANCELA CON LA ASEADORA EN CAMINO, y el de
--     mañana tampoco. El `+1` compra 24 horas de margen contra el borde que
--     este repo ya conoce: a las 19:00 de Bogotá ya es el día siguiente en UTC.
--
--     El aseo de +5 es el control positivo: misma corrida, misma clase de
--     ausencia, mismo `origin`, mismo estado, y sí se cancela. Lo único que lo
--     distingue de los de 0 y +1 es la fecha.
select is(
  pg_temp.foto('cd000004-0000-0000-0000-000000000004'),
  '-6=pendiente/false/-'
  || ',0=pendiente/true/reserva_desaparecida_ventana_protegida'
  || ',1=pendiente/true/reserva_desaparecida_ventana_protegida'
  || ',5=cancelada/false/-',
  'SYNC-04 la ventana protegida salva los aseos de hoy y de mañana; el de +5 de la misma corrida sí se cancela');

-- 34  Lo que la ventana protege NO se pierde en silencio, Y NO SE AVISA DOS
--     VECES. Tres propiedades en una sola aserción, sobre cuatro corridas:
--
--     1. Los dos aseos salvados quedan marcados con el motivo ENUMERADO que dice
--        por qué. Un aseo que sobrevive sin marca es un aseo que nadie va a
--        mirar nunca.
--     2. `reviews_flagged` va 0, 0, 2, 0: la marca se cuenta en la corrida que
--        la puso y en ninguna otra. El último cero es lo que demuestra que
--        `needs_review` es pegajoso y no se reescribe en cada vuelta del cron.
--     3. LA DEDUPLICACIÓN. La cuarta corrida vuelve a INTENTAR las mismas dos
--        notificaciones y siguen siendo cuatro filas —dos aseos por dos admins
--        activos— con dos `dedupe_key` distintas. Sin `notifications_dedupe_idx`
--        serían ocho, y a media hora por corrida el admin recibiría 48 alertas
--        al día del mismo aseo. Es un HECHO PUNTUAL: su clave va SIN cubo de
--        tiempo, justo al revés que la del formato desconocido.
select is(
  (select array[
     (select count(*)::text from public.cleanings
       where property_id = 'cd000004-0000-0000-0000-000000000004'
         and needs_review
         and review_reason = 'reserva_desaparecida_ventana_protegida'),
     (select string_agg(reviews_flagged::text, ',' order by id) from public.feed_sync_runs
       where feed_id = 'cfd00004-0000-0000-0000-000000000004'),
     (select count(*)::text from public.notifications
       where property_id = 'cd000004-0000-0000-0000-000000000004'
         and dedupe_key like 'rev:%'),
     (select count(distinct dedupe_key)::text from public.notifications
       where property_id = 'cd000004-0000-0000-0000-000000000004'
         and dedupe_key like 'rev:%'),
     (select count(distinct recipient_id)::text from public.notifications
       where property_id = 'cd000004-0000-0000-0000-000000000004')]),
  array['2', '0,0,2,0', '4', '2', '2'],
  'los dos aseos que la ventana protegió quedan marcados, contados una sola vez y notificados una sola vez por admin');


-- ---------------------------------------------------------------------------
-- d5 — EL PISO DEL FEED: lo que quedó detrás de la ventana no está cancelado,
--      está fuera de la ventana.
--
-- La ventana del proveedor salta hacia adelante: de cuatro reservas queda solo
-- la que termina en +24, así que el piso de las corridas 2 y 3 es +24. Los aseos
-- de +6 y +12 quedan POR DEBAJO y son inmunes; el de +30, por encima, no.
-- ---------------------------------------------------------------------------
do $$ begin
  perform pg_temp.correr('cfd00005-0000-0000-0000-000000000005',
    jsonb_build_array(
      pg_temp.evento('uid-d5M@airbnb.com', 'HMRECD5M', public.today_bog() + 2,  public.today_bog() + 6),
      pg_temp.evento('uid-d5N@airbnb.com', 'HMRECD5N', public.today_bog() + 8,  public.today_bog() + 12),
      pg_temp.evento('uid-d5O@airbnb.com', 'HMRECD5O', public.today_bog() + 18, public.today_bog() + 24),
      pg_temp.evento('uid-d5P@airbnb.com', 'HMRECD5P', public.today_bog() + 26, public.today_bog() + 30)));
  perform pg_temp.correr('cfd00005-0000-0000-0000-000000000005',
    jsonb_build_array(
      pg_temp.evento('uid-d5O@airbnb.com', 'HMRECD5O', public.today_bog() + 18, public.today_bog() + 24)));
  perform pg_temp.correr('cfd00005-0000-0000-0000-000000000005',
    jsonb_build_array(
      pg_temp.evento('uid-d5O@airbnb.com', 'HMRECD5O', public.today_bog() + 18, public.today_bog() + 24)));
end $$;

-- 35  T-03-40. EL CANDADO MÁS FUERTE DE LOS CUATRO, y el que hace innecesario
--     adivinar dónde está el borde de la ventana del proveedor: se deriva de la
--     propia corrida.
--
--     El aseo de +30 es el control positivo y está por ENCIMA del piso: misma
--     corrida, mismas dos ausencias, misma clase de aseo, y sí se cancela. Lo
--     único que lo distingue de los de +6 y +12 es su posición respecto al piso.
--
--     Sin este candado, el día que el proveedor mueva su ventana hacia adelante
--     —que es su comportamiento normal— el sistema cancelaría en bloque todos
--     los aseos que quedaron detrás.
select is(
  pg_temp.foto('cd000005-0000-0000-0000-000000000005'),
  '6=pendiente/true/reserva_desaparecida_bajo_piso'
  || ',12=pendiente/true/reserva_desaparecida_bajo_piso'
  || ',24=pendiente/false/-'
  || ',30=cancelada/false/-',
  'SYNC-04 el piso del feed salva todo lo que quedó por detrás de la ventana; el de +30, por encima, sí se cancela');

-- 36  El piso de cada corrida queda escrito en `feed_sync_runs.min_ends_on`, que
--     es la instrumentación que en dos o tres días de producción contesta si la
--     reserva que termina hoy desaparece hoy mismo o mañana. Aquí se afirma que
--     el salto de la ventana quedó registrado: +6 en la primera corrida, +24 en
--     las dos siguientes.
select is(
  (select array_agg((min_ends_on - public.today_bog())::int order by id)
     from public.feed_sync_runs
    where feed_id = 'cfd00005-0000-0000-0000-000000000005'),
  array[6, 24, 24],
  'min_ends_on registra el piso de cada corrida y el salto de la ventana del proveedor');


-- ---------------------------------------------------------------------------
-- d6 — el aseo COMPLETADA. Trabajo ya ejecutado.
-- ---------------------------------------------------------------------------
do $$ begin
  perform pg_temp.correr('cfd00006-0000-0000-0000-000000000006',
    jsonb_build_array(
      pg_temp.evento('uid-d6Q@airbnb.com', 'HMRECD6Q', public.today_bog() + 2, public.today_bog() + 6),
      pg_temp.evento('uid-d6R@airbnb.com', 'HMRECD6R', public.today_bog() + 1, public.today_bog() + 3)));
end $$;

-- Recorrido legal completo: pendiente -> en_curso -> completada.
update public.cleanings
   set state = 'en_curso', confirmado_at = now(),
       aseador_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', started_at = now()
 where property_id = 'cd000006-0000-0000-0000-000000000006'
   and scheduled_date = public.today_bog() + 6;
update public.cleanings
   set state = 'completada', finished_at = now()
 where property_id = 'cd000006-0000-0000-0000-000000000006'
   and scheduled_date = public.today_bog() + 6;

do $$ begin
  perform pg_temp.correr('cfd00006-0000-0000-0000-000000000006',
    jsonb_build_array(
      pg_temp.evento('uid-d6R@airbnb.com', 'HMRECD6R', public.today_bog() + 1, public.today_bog() + 3)));
  perform pg_temp.correr('cfd00006-0000-0000-0000-000000000006',
    jsonb_build_array(
      pg_temp.evento('uid-d6R@airbnb.com', 'HMRECD6R', public.today_bog() + 1, public.today_bog() + 3)));
end $$;

-- 37  Un aseo YA HECHO sobrevive intacto a que su reserva desaparezca, y NO
--     queda marcado para revisión. Las dos mitades importan:
--
--     que no se cancele es T-03-42; que TAMPOCO se marque es el anti-tormenta.
--     Que una reserva salga de la ventana del proveedor semanas después de que
--     su aseo ya se hizo es el caso NORMAL, y marcar cada uno de esos aseos
--     convertiría el movimiento rutinario de la ventana en una avalancha de
--     alertas sobre trabajo terminado, que es la forma más segura de que el
--     admin deje de mirar la campana.
--
--     El tercer elemento es el control positivo: la ausencia SÍ se registró.
select is(
  (select array[
     pg_temp.foto('cd000006-0000-0000-0000-000000000006'),
     (select coalesce(string_agg((cancelled_at is null)::text, '+' order by id), '<sin aseo>')
        from public.cleanings
       where property_id = 'cd000006-0000-0000-0000-000000000006'
         and scheduled_date = public.today_bog() + 6),
     (select coalesce(string_agg(reservation_code, ',' order by reservation_code), '<ninguna>')
        from public.calendar_reservations
       where feed_id = 'cfd00006-0000-0000-0000-000000000006'
         and disappeared_at is not null)]),
  array['3=pendiente/false/-,6=completada/false/-', 'true', 'HMRECD6Q'],
  'SYNC-04 un aseo completada sobrevive intacto a dos ausencias y no se marca para revisión');

-- 38  Y la garantía última no es del RPC sino del TRIGGER: `completada` es
--     terminal. `service_role` salta la RLS pero NO salta los triggers, así que
--     ni un error de diff, ni un `where` mal escrito, ni una migración futura
--     pueden cancelar trabajo ya ejecutado sin que la base lance.
--
--     Es la segunda capa de T-03-42, sobre el mismo aseo que la aserción 37
--     acaba de medir. La aserción 13 afirma lo mismo sobre un aseo MANUAL; esta
--     lo afirma sobre uno que creó el propio RPC.
select throws_ok(
  $q$update public.cleanings
        set state = 'cancelada', cancelled_at = now()
      where property_id = 'cd000006-0000-0000-0000-000000000006'
        and scheduled_date = public.today_bog() + 6$q$,
  'P0001', null,
  'ni el sync ni nadie puede cancelar un aseo completada creado por el RPC: el trigger lanza transicion_invalida');


-- ---------------------------------------------------------------------------
-- d7 — LA RESERVA MOVIDA, caso feliz. El aseo viejo se confirma a mano ANTES de
--      que la reserva se mueva, para poder afirmar que el nuevo NO hereda esa
--      confirmación: la fecha cambió, y lo que el admin confirmó ya no es lo
--      que va a pasar.
-- ---------------------------------------------------------------------------
do $$ begin
  perform pg_temp.correr('cfd00007-0000-0000-0000-000000000007',
    jsonb_build_array(
      pg_temp.evento('uid-d7S@airbnb.com', 'HMRECD7S', public.today_bog() + 2, public.today_bog() + 8)));
end $$;

update public.cleanings
   set confirmado_at = now(), num_huespedes = 3
 where property_id = 'cd000007-0000-0000-0000-000000000007'
   and scheduled_date = public.today_bog() + 8;

do $$ begin
  perform pg_temp.correr('cfd00007-0000-0000-0000-000000000007',
    jsonb_build_array(
      pg_temp.evento('uid-d7S@airbnb.com', 'HMRECD7S', public.today_bog() + 2, public.today_bog() + 12)));
end $$;

-- 39  SYNC-05, caso (a) del diff. El aseo viejo se cancela con su motivo
--     enumerado y nace uno nuevo en la fecha nueva, SIN CONFIRMAR y apuntando a
--     la reserva.
--
--     Los cuatro campos por fila cubren cuatro modos de fallo distintos: que no
--     se cancelara el viejo, que no naciera el nuevo, que el nuevo heredara la
--     confirmación del admin —lo que lo metería en la agenda en firme para una
--     fecha que nadie confirmó— y que el nuevo naciera huérfano cuando SÍ podía
--     apuntar a su reserva.
select is(
  (select string_agg((scheduled_date - public.today_bog())::text
                     || '=' || state::text
                     || '/' || coalesce(cancel_reason, '-')
                     || '/' || case when reservation_id is null then '-' else 'R' end
                     || '/' || case when confirmado_at is null then 'sin-confirmar' else 'confirmado' end,
                     ',' order by scheduled_date)
     from public.cleanings
    where property_id = 'cd000007-0000-0000-0000-000000000007'),
  '8=cancelada/reserva_movida/R/confirmado,12=pendiente/-/R/sin-confirmar',
  'SYNC-05 la reserva movida cancela el aseo viejo y crea uno nuevo sin confirmar en la fecha nueva');


-- ---------------------------------------------------------------------------
-- d8 — LA RESERVA MOVIDA CON EL ASEO VIEJO INTOCABLE. La trampa del 23505.
-- ---------------------------------------------------------------------------
do $$ begin
  perform pg_temp.correr('cfd00008-0000-0000-0000-000000000008',
    jsonb_build_array(
      pg_temp.evento('uid-d8T@airbnb.com', 'HMRECD8T', public.today_bog() + 2, public.today_bog() + 8)));
end $$;

update public.cleanings
   set state = 'en_curso', confirmado_at = now(),
       aseador_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', started_at = now()
 where property_id = 'cd000008-0000-0000-0000-000000000008'
   and scheduled_date = public.today_bog() + 8;

-- 40  LA TRAMPA, MEDIDA. `cleanings_one_live_per_reservation` es único sobre
--     `reservation_id` para las filas vivas. El aseo viejo está EN CURSO, así
--     que no se puede cancelar y sigue apuntando a la reserva; si el aseo nuevo
--     naciera apuntando a esa misma reserva, el insert reventaría con 23505 y
--     se llevaría por delante la corrida ENTERA del feed, no solo este aseo.
--
--     `lives_ok` y no un `is` sobre el resultado: lo que se mide aquí es que la
--     llamada no lanza. Si lanzara dentro de un bloque anónimo, el archivo
--     entero abortaría y dejaría de imprimir TAP, que es el modo de fallo que
--     el plan 03-04 ya midió una vez.
select lives_ok(
  $q$select pg_temp.correr('cfd00008-0000-0000-0000-000000000008',
        jsonb_build_array(
          pg_temp.evento('uid-d8T@airbnb.com', 'HMRECD8T', public.today_bog() + 2, public.today_bog() + 12)))$q$,
  'SYNC-05 mover una reserva cuyo aseo viejo está en curso no lanza 23505 sobre cleanings_one_live_per_reservation');

-- 41  Y LA FORMA RESULTANTE, que es donde se ve POR QUÉ no lanzó: el aseo nuevo
--     NACE HUÉRFANO.
--
--     De las dos salidas posibles se eligió la única aceptable. Desapuntar el
--     aseo viejo dejaría libre el índice, pero borraría el vínculo entre un aseo
--     que ya tiene trabajo dentro y la reserva que lo justifica, que es
--     exactamente el vínculo que un pago o una disputa necesitan. El aseo nuevo
--     nace con `reservation_id` nulo —forma válida en el schema, y la de todos
--     los `manual`— y el viejo queda marcado para que un humano decida.
select is(
  (select string_agg((scheduled_date - public.today_bog())::text
                     || '=' || state::text
                     || '/' || needs_review::text
                     || '/' || coalesce(review_reason, '-')
                     || '/' || case when reservation_id is null then 'huerfano' else 'R' end,
                     ',' order by scheduled_date)
     from public.cleanings
    where property_id = 'cd000008-0000-0000-0000-000000000008'),
  '8=en_curso/true/reserva_movida_aseo_iniciado/R,12=pendiente/false/-/huerfano',
  'SYNC-05 si el aseo viejo no se pudo cancelar, el nuevo nace con reservation_id nulo y el viejo queda en revisión');


-- ---------------------------------------------------------------------------
-- d9 — CANCELAR Y RECREAR EL MISMO DÍA, a través del RPC.
--
-- La aserción 14 mide esa propiedad sobre el índice, con dos sentencias
-- escritas a mano. Esta la mide sobre el camino real: el RPC cancela el aseo de
-- +9 en una corrida y, dos corridas después, otra reserva distinta que también
-- termina el +9 hace que nazca uno nuevo en esa misma fecha.
-- ---------------------------------------------------------------------------
do $$ begin
  perform pg_temp.correr('cfd00009-0000-0000-0000-000000000009',
    jsonb_build_array(
      pg_temp.evento('uid-d9U@airbnb.com', 'HMRECD9U', public.today_bog() + 3, public.today_bog() + 9),
      pg_temp.evento('uid-d9V@airbnb.com', 'HMRECD9V', public.today_bog() + 1, public.today_bog() + 4)));
  perform pg_temp.correr('cfd00009-0000-0000-0000-000000000009',
    jsonb_build_array(
      pg_temp.evento('uid-d9V@airbnb.com', 'HMRECD9V', public.today_bog() + 1, public.today_bog() + 4)));
  perform pg_temp.correr('cfd00009-0000-0000-0000-000000000009',
    jsonb_build_array(
      pg_temp.evento('uid-d9V@airbnb.com', 'HMRECD9V', public.today_bog() + 1, public.today_bog() + 4)));
  -- Cuarta corrida: aparece otra reserva que también termina el +9.
  perform pg_temp.correr('cfd00009-0000-0000-0000-000000000009',
    jsonb_build_array(
      pg_temp.evento('uid-d9V@airbnb.com', 'HMRECD9V', public.today_bog() + 1, public.today_bog() + 4),
      pg_temp.evento('uid-d9W@airbnb.com', 'HMRECD9W', public.today_bog() + 5, public.today_bog() + 9)));
end $$;

-- 42  Dos filas para el mismo apartamento y el mismo día conviven porque el
--     índice único es PARCIAL sobre el operador de distinción: al cancelar, la
--     fila sale del índice. Es lo que permite que el motor no tenga que elegir
--     entre "dejo un aseo cancelado en la agenda" y "no puedo crear el que de
--     verdad hace falta".
--
--     El cuarto elemento es el que importa: el aseo VIVO del +9 apunta a la
--     reserva NUEVA, no a la que se fue. Sin él, un aseo vivo que siguiera
--     apuntando a una reserva desaparecida pasaría el conteo sin que nada lo
--     dijera.
select is(
  (select array[
     (select count(*)::text from public.cleanings
       where property_id = 'cd000009-0000-0000-0000-000000000009'
         and scheduled_date = public.today_bog() + 9),
     (select count(*)::text from public.cleanings
       where property_id = 'cd000009-0000-0000-0000-000000000009'
         and scheduled_date = public.today_bog() + 9
         and state = 'cancelada'
         and cancel_reason = 'reserva_desaparecida'),
     (select count(*)::text from public.cleanings
       where property_id = 'cd000009-0000-0000-0000-000000000009'
         and scheduled_date = public.today_bog() + 9
         and state = 'pendiente'),
     (select coalesce(string_agg(r.reservation_code, '+' order by r.reservation_code), '<ninguna>')
        from public.cleanings c
        join public.calendar_reservations r on r.id = c.reservation_id
       where c.property_id = 'cd000009-0000-0000-0000-000000000009'
         and c.scheduled_date = public.today_bog() + 9
         and c.state = 'pendiente')]),
  array['2', '1', '1', 'HMRECD9W'],
  'SYNC-05 el RPC cancela y recrea el aseo del mismo día, y el vivo apunta a la reserva nueva');


-- ---------------------------------------------------------------------------
-- dA — LA EXTENSIÓN MAL CREADA. La reserva se acorta y aparece otra, con código
--      nuevo, empezando exactamente donde terminaba.
-- ---------------------------------------------------------------------------
do $$ begin
  perform pg_temp.correr('cfd0000a-0000-0000-0000-00000000000a',
    jsonb_build_array(
      pg_temp.evento('uid-dAX@airbnb.com', 'HMRECDAX', public.today_bog() + 2, public.today_bog() + 8)));
  perform pg_temp.correr('cfd0000a-0000-0000-0000-00000000000a',
    jsonb_build_array(
      pg_temp.evento('uid-dAX@airbnb.com', 'HMRECDAX', public.today_bog() + 2, public.today_bog() + 6),
      pg_temp.evento('uid-dAY@airbnb.com', 'HMRECDAY', public.today_bog() + 6, public.today_bog() + 9)));
end $$;

-- 43  SYNC-08, regla R2. El aseo de la FECHA DE UNIÓN queda marcado.
--
--     Lo que el paso (g) SE NIEGA a hacer también está aquí: el aseo del +9
--     existe y está limpio —el checkout de la reserva nueva es real y hay que
--     ir—, el del +6 existe y está marcado, y ninguno de los dos se borró ni se
--     fusionó. Si de verdad era una extensión, el coste es un viaje de más y
--     una alerta; si no lo era, el coste de no crear el aseo es un huésped
--     entrando a un apartamento sucio. La asimetría decide sola.
select is(
  pg_temp.foto('cd00000a-0000-0000-0000-00000000000a'),
  '6=pendiente/true/extension_sospechosa,8=cancelada/false/-,9=pendiente/false/-',
  'SYNC-08 una reserva nueva que empieza donde otra se acortó marca el aseo de la fecha de unión');

-- 44  EL FAN-OUT Y LA DEDUPLICACIÓN, en la misma aserción.
--
--     `notifications.recipient_id` es NOT NULL: no existe "una notificación para
--     el rol". Cada alerta se inserta una vez por admin ACTIVO, y el admin
--     desactivado no recibe ninguna —cuarto elemento—, que es lo que impide que
--     alguien que ya no trabaja aquí siga recibiendo la operación.
--
--     Los dos primeros elementos separan "cuántas filas" de "cuántos
--     destinatarios distintos": con un solo admin sembrado los dos números
--     coincidirían y un `cross join` roto pasaría inadvertido. El quinto afirma
--     que el hecho se contó UNA vez, con UNA sola `dedupe_key`.
select is(
  (select array[
     (select count(*)::text from public.notifications
       where property_id = 'cd00000a-0000-0000-0000-00000000000a'
         and type = 'extension_sospechosa'),
     (select count(distinct recipient_id)::text from public.notifications
       where property_id = 'cd00000a-0000-0000-0000-00000000000a'
         and type = 'extension_sospechosa'),
     (select count(*)::text from public.notifications
       where property_id = 'cd00000a-0000-0000-0000-00000000000a'
         and type = 'aseo_cancelado'),
     (select count(*)::text from public.notifications
       where property_id = 'cd00000a-0000-0000-0000-00000000000a'
         and recipient_id = 'ad000003-0000-0000-0000-000000000003'),
     (select count(distinct dedupe_key)::text from public.notifications
       where property_id = 'cd00000a-0000-0000-0000-00000000000a'
         and type = 'extension_sospechosa')]),
  array['2', '2', '2', '0', '1'],
  'SYNC-08 la alerta de extensión se encola una vez por admin activo, ninguna para el desactivado');

-- La misma corrida otra vez, sin ningún cambio.
do $$ begin
  perform pg_temp.correr('cfd0000a-0000-0000-0000-00000000000a',
    jsonb_build_array(
      pg_temp.evento('uid-dAX@airbnb.com', 'HMRECDAX', public.today_bog() + 2, public.today_bog() + 6),
      pg_temp.evento('uid-dAY@airbnb.com', 'HMRECDAY', public.today_bog() + 6, public.today_bog() + 9)));
end $$;

-- 45  `needs_review` ES PEGAJOSO. El sync nunca lo apaga: solo el admin, en la
--     Fase 4. Apagarlo automáticamente haría desaparecer la alerta antes de que
--     nadie la atendiera, y el aseo volvería a la agenda como si nada hubiera
--     pasado.
--
--     El tercer y cuarto elemento son el control: la corrida limpia NO vuelve a
--     contar la marca (`reviews_flagged = 0`), mientras que la corrida que la
--     puso sí contó 1. Sin esa pareja, un `reviews_flagged` que devolviera
--     siempre cero pasaría esta aserción sin haber medido nada.
select is(
  (select array[
     (select coalesce(string_agg(needs_review::text, '+' order by id), '<sin aseo>')
        from public.cleanings
       where property_id = 'cd00000a-0000-0000-0000-00000000000a'
         and scheduled_date = public.today_bog() + 6),
     (select coalesce(string_agg(coalesce(review_reason, '-'), '+' order by id), '<sin aseo>')
        from public.cleanings
       where property_id = 'cd00000a-0000-0000-0000-00000000000a'
         and scheduled_date = public.today_bog() + 6),
     (select reviews_flagged::text from public.feed_sync_runs
       where feed_id = 'cfd0000a-0000-0000-0000-00000000000a' order by id desc limit 1),
     (select reviews_flagged::text from public.feed_sync_runs
       where feed_id = 'cfd0000a-0000-0000-0000-00000000000a'
       order by id asc limit 1 offset 1)]),
  array['true', 'extension_sospechosa', '0', '1'],
  'SYNC-08 needs_review es pegajoso: una corrida limpia no lo apaga ni lo vuelve a contar');


-- ---------------------------------------------------------------------------
-- dB — EL TURNOVER SANO. Dos reservas vivas y sin cambios, el checkout de una
--      es el checkin de la otra.
-- ---------------------------------------------------------------------------
do $$ begin
  perform pg_temp.correr('cfd0000b-0000-0000-0000-00000000000b',
    jsonb_build_array(
      pg_temp.evento('uid-dBZ@airbnb.com', 'HMRECDBZ', public.today_bog() + 2, public.today_bog() + 6),
      pg_temp.evento('uid-dB1@airbnb.com', 'HMRECDB1', public.today_bog() + 6, public.today_bog() + 9)));
  perform pg_temp.correr('cfd0000b-0000-0000-0000-00000000000b',
    jsonb_build_array(
      pg_temp.evento('uid-dBZ@airbnb.com', 'HMRECDBZ', public.today_bog() + 2, public.today_bog() + 6),
      pg_temp.evento('uid-dB1@airbnb.com', 'HMRECDB1', public.today_bog() + 6, public.today_bog() + 9)));
end $$;

-- 46  ****** LA ASERCIÓN QUE SEPARA SYNC-07 DE SYNC-08 ******
--
--     Un turnover del mismo día NO es una extensión sospechosa: es el caso MÁS
--     COMÚN y MÁS IMPORTANTE del negocio, y lo que le corresponde es URGENCIA,
--     no revisión. El feed real trae exactamente este caso el 2026-10-10, con
--     dos reservas sanas.
--
--     Confundirlos convertiría cada turnover en una falsa alarma permanente y
--     el admin dejaría de mirar la campana en una semana, que es T-03-44. Lo
--     único que separa los dos casos es SI LA RESERVA ANTERIOR SE MOVIÓ O
--     DESAPARECIÓ EN LA MISMA CORRIDA; por eso R2 lleva esa condición y no solo
--     la coincidencia de fechas.
--
--     La forma es idéntica a la de la aserción 43 salvo por ese hecho: allí la
--     reserva anterior se había acortado; aquí las dos están vivas y sin
--     cambios. El primer elemento es el control positivo de que el turnover SÍ
--     se detectó como tal: el aseo del +6 es urgente. Sin él, un motor que no
--     hiciera absolutamente nada pasaría los otros cuatro.
select is(
  (select array[
     (select string_agg((scheduled_date - public.today_bog())::text || '=' || is_urgent::text,
                        ',' order by scheduled_date)
        from public.cleanings
       where property_id = 'cd00000b-0000-0000-0000-00000000000b'),
     (select count(*)::text from public.cleanings
       where property_id = 'cd00000b-0000-0000-0000-00000000000b' and needs_review),
     (select count(*)::text from public.notifications
       where property_id = 'cd00000b-0000-0000-0000-00000000000b'
         and type = 'extension_sospechosa'),
     (select count(*)::text from public.notifications
       where property_id = 'cd00000b-0000-0000-0000-00000000000b'),
     (select sum(reviews_flagged)::text from public.feed_sync_runs
       where feed_id = 'cfd0000b-0000-0000-0000-00000000000b')]),
  array['6=true,9=false', '0', '0', '0', '0'],
  'SYNC-07 un turnover del mismo día sano es urgente y NO es una extensión sospechosa: cero alertas');


-- ---------------------------------------------------------------------------
-- dC — EL COLAPSO DE FORMATO. Los mismos tres eventos, ahora sin clasificar.
--
-- Es el escenario que hace de la falla cerrada de `ical-clasificar.ts` una bomba
-- si no existe esta guarda: el día que el proveedor cambie la cadena de la que
-- sale la clasificación, siguen llegando los mismos eventos —un conteo de
-- EVENTOS no se mueve ni un poco— y todos caen a desconocido.
-- ---------------------------------------------------------------------------
do $$ begin
  perform pg_temp.correr('cfd0000c-0000-0000-0000-00000000000c',
    jsonb_build_array(
      pg_temp.evento('uid-dC2@airbnb.com', 'HMRECDC2', public.today_bog() + 3,  public.today_bog() + 7),
      pg_temp.evento('uid-dC3@airbnb.com', 'HMRECDC3', public.today_bog() + 10, public.today_bog() + 14),
      pg_temp.evento('uid-dC4@airbnb.com', 'HMRECDC4', public.today_bog() + 20, public.today_bog() + 24)));
  perform pg_temp.correr('cfd0000c-0000-0000-0000-00000000000c',
    jsonb_build_array(
      pg_temp.evento('uid-dC2@airbnb.com', null, public.today_bog() + 3,  public.today_bog() + 7,  'desconocido'),
      pg_temp.evento('uid-dC3@airbnb.com', null, public.today_bog() + 10, public.today_bog() + 14, 'desconocido'),
      pg_temp.evento('uid-dC4@airbnb.com', null, public.today_bog() + 20, public.today_bog() + 24, 'desconocido')));
  perform pg_temp.correr('cfd0000c-0000-0000-0000-00000000000c',
    jsonb_build_array(
      pg_temp.evento('uid-dC2@airbnb.com', null, public.today_bog() + 3,  public.today_bog() + 7,  'desconocido'),
      pg_temp.evento('uid-dC3@airbnb.com', null, public.today_bog() + 10, public.today_bog() + 14, 'desconocido'),
      pg_temp.evento('uid-dC4@airbnb.com', null, public.today_bog() + 20, public.today_bog() + 24, 'desconocido')));
end $$;

-- 47  LA GUARDA DE COLAPSO VA SOBRE RESERVAS CLASIFICADAS, NO SOBRE EVENTOS.
--
--     Dos corridas seguidas con los mismos tres eventos sin clasificar: si la
--     guarda mirara `event_count`, valdría 3 en las dos y no saltaría nunca; la
--     segunda corrida sería la segunda ausencia y los tres aseos se irían.
--
--     Los elementos 1 y 2 afirman que no se canceló nada. El 3 es el que hace
--     que eso NO sea vacuo: `event_count` sigue valiendo 3 mientras
--     `reservation_count` cae a 0, así que los eventos SÍ llegaron y el motor
--     SÍ corrió. Y el 4 afirma que ni siquiera se marcó la primera ausencia: de
--     una corrida en la que nada clasificó no se aprende NADA sobre ausencias, y
--     marcarla dejaría el terreno servido para que la corrida siguiente cancele.
select is(
  (select array[
     pg_temp.foto('cd00000c-0000-0000-0000-00000000000c'),
     (select coalesce(string_agg(cleanings_cancelled::text, ',' order by id), '<sin corridas>')
        from public.feed_sync_runs where feed_id = 'cfd0000c-0000-0000-0000-00000000000c'),
     (select coalesce(string_agg(event_count::text || '/' || reservation_count::text || '/' || unknown_count::text,
                                 ',' order by id), '<sin corridas>')
        from public.feed_sync_runs where feed_id = 'cfd0000c-0000-0000-0000-00000000000c'),
     (select count(*)::text from public.calendar_reservations
       where feed_id = 'cfd0000c-0000-0000-0000-00000000000c' and disappeared_at is not null)]),
  array['7=pendiente/false/-,14=pendiente/false/-,24=pendiente/false/-',
        '0,0,0',
        '3/3/0,3/0/3,3/0/3',
        '0'],
  'SYNC-04 un feed cuyo formato colapsa no cancela ni un aseo, aunque el conteo de eventos no se mueva');

-- 48  Y el colapso NO es silencioso: se emite UNA alerta, con cubo DIARIO y una
--     fila por admin activo. El cubo de tiempo es lo que PRODUCE la repetición,
--     no lo que la evita: un problema de formato que dure tres días vuelve a
--     avisar cada día, y no cada media hora.
--
--     El tercer elemento es el que demuestra el cubo: dos corridas colapsadas el
--     mismo día producen UNA sola `dedupe_key`, y por tanto dos filas —una por
--     admin— y no cuatro.
select is(
  (select array[
     (select count(*)::text from public.notifications
       where property_id = 'cd00000c-0000-0000-0000-00000000000c'
         and type = 'calendario_caido'),
     (select count(distinct recipient_id)::text from public.notifications
       where property_id = 'cd00000c-0000-0000-0000-00000000000c'),
     (select count(distinct dedupe_key)::text from public.notifications
       where property_id = 'cd00000c-0000-0000-0000-00000000000c'),
     -- `string_agg(distinct ...)` y no una subconsulta escalar con `distinct`:
     -- MEDIDO en el señuelo S8. Con la guarda de colapso rota aparecían además
     -- alertas de revisión sobre el mismo apartamento, la subconsulta devolvía
     -- dos filas y el resultado NO era `not ok` sino `ERROR: more than one row
     -- returned by a subquery`, que aborta la transacción y mata las aserciones
     -- 49 y 50. Agregado, un motivo de más se ve en el valor comparado.
     (select coalesce(string_agg(distinct payload ->> 'motivo', '+'), '<ninguno>')
        from public.notifications
       where property_id = 'cd00000c-0000-0000-0000-00000000000c'),
     (select coalesce(string_agg(distinct payload ->> 'scope', '+'), '<ninguno>')
        from public.notifications
       where property_id = 'cd00000c-0000-0000-0000-00000000000c')]),
  array['2', '2', '1', 'formato_desconocido', 'feed'],
  'el colapso de formato encola una sola alerta por admin activo, con cubo diario en la dedupe_key');


-- ---------------------------------------------------------------------------
-- dD — LA FILA INFORMATIVA de una unidad de gestión externa, cuya reserva se
--      mueve. No se puede cancelar (`cl_unmanaged_is_inert` exige estado nulo) y
--      no tiene nada que preservar: se REPROGRAMA.
-- ---------------------------------------------------------------------------
do $$ begin
  perform pg_temp.correr('cfd0000d-0000-0000-0000-00000000000d',
    jsonb_build_array(
      pg_temp.evento('uid-dD5@airbnb.com', 'HMRECDD5', public.today_bog() + 2, public.today_bog() + 8)));
  perform pg_temp.correr('cfd0000d-0000-0000-0000-00000000000d',
    jsonb_build_array(
      pg_temp.evento('uid-dD5@airbnb.com', 'HMRECDD5', public.today_bog() + 2, public.today_bog() + 12)));
end $$;

-- 49  SYNC-11. La fila informativa sigue siendo UNA y ahora está en la fecha
--     nueva. Las dos mitades importan:
--
--     que siga siendo una demuestra que no se duplicó —el paso (c) no la puede
--     recrear, porque la reserva ya tiene una fila viva apuntándola—; y que se
--     haya movido demuestra que no quedó anclada para siempre en una fecha que
--     la reserva abandonó, que es lo que pasaría si el reconcile la tratara como
--     a un aseo gestionado y se limitara a no poder cancelarla.
--
--     El estado sigue siendo nulo y `is_managed` falso: la reprogramación no la
--     convierte en operativa.
select is(
  (select array[
     (select count(*)::text from public.cleanings
       where property_id = 'cd00000d-0000-0000-0000-00000000000d'),
     pg_temp.foto('cd00000d-0000-0000-0000-00000000000d'),
     (select (bool_and(not is_managed) and bool_and(state is null)
              and bool_and(not is_urgent) and bool_and(aseador_id is null))::text
        from public.cleanings
       where property_id = 'cd00000d-0000-0000-0000-00000000000d')]),
  array['1', '12=<informativa>/false/-', 'true'],
  'SYNC-11 la fila informativa de una unidad de gestión externa se reprograma a la fecha nueva y sigue inerte');


-- ---------------------------------------------------------------------------
-- 50 — LA ASERCIÓN ESTRUCTURAL, y existe porque hay una capa que NINGUNA
--      aserción de comportamiento puede defender.
--
-- `cl_pendiente_shape` hace que `state = 'pendiente'` y `started_at is null`
-- sean co-implicadas, así que quitar UNA de las dos del `where` de cancelación
-- deja TODAS las aserciones de arriba en verde. Medido en el plan 03-05. Es
-- exactamente el falso verde que esta fase lleva cuatro planes catalogando, y la
-- única defensa posible es leer el cuerpo de la función.
--
-- Se leen los comentarios FUERA antes de buscar: si no, cualquier comentario que
-- mencione un candado lo daría por presente, que es la misma trampa que la
-- cabecera de `scripts/ci/check-service-role.sh` describe.
-- ---------------------------------------------------------------------------
create function pg_temp.cuerpo_sync() returns text
language sql stable as $fn$
  select regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g')
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'sync_feed_apply';
$fn$;

create function pg_temp.ocurrencias(p_patron text) returns int
language sql stable as $fn$
  select count(*)::int from regexp_matches(pg_temp.cuerpo_sync(), p_patron, 'g');
$fn$;

-- SE COMPARAN RAZONES, NO NÚMEROS MÁGICOS, y esa decisión también está medida.
--
-- La primera versión de esta aserción preguntaba `> 0` por cada candado. Con el
-- señuelo aplicado —quitar `started_at is null` del `where` de la cancelación
-- por desaparición— seguía en VERDE, porque la MISMA cadena sobrevivía en el
-- `where` de la cancelación por movimiento. Un `> 0` mide "existe en algún
-- sitio", que no es la propiedad: la propiedad es que TODA cancelación lleva
-- todos sus candados.
--
-- Así que el patrón es: contar las cancelaciones y exigir que cada candado
-- aparezca exactamente ese número de veces. Añadir una tercera cancelación sin
-- sus candados rompe la igualdad, y añadirla CON ellos la mantiene sin tocar
-- este archivo. No hay ningún número escrito a mano que quede obsoleto.
--
-- EL ÚLTIMO ELEMENTO ES EL QUE IMPIDE LA VACUIDAD, y es imprescindible: si
-- alguien borrara las dos cancelaciones, todas las igualdades de arriba serían
-- `0 = 0` y esta aserción pasaría en verde sobre una función que ya no cancela
-- nada. Afirmar que el contador de cancelaciones es mayor que cero es el
-- control positivo del control positivo.
--
-- EL PISO SE EXIGE CON `> 0` Y NO CON LA RAZÓN, A PROPÓSITO: aparece en la
-- cancelación por desaparición y NO en la de movimiento. Medido al diseñar: una
-- reserva que se mueve hacia adelante y es la única del feed pone el piso en su
-- fecha NUEVA, así que el aseo viejo —que por definición está antes— quedaría
-- por debajo del piso y no se cancelaría jamás. El candado 4 distingue "la
-- reserva se canceló" de "la reserva quedó fuera de la ventana", y en el caso
-- movido la reserva está en la corrida diciendo su fecha nueva: no hay nada
-- fuera de la ventana que explicar.
select is(
  array[
    -- Cada cancelación lleva sus cuatro candados de fila.
    (pg_temp.ocurrencias('c\.state = ''pendiente''')
       = pg_temp.ocurrencias('state\s*=\s*''cancelada'''))::text,
    (pg_temp.ocurrencias('c\.started_at is null')
       = pg_temp.ocurrencias('state\s*=\s*''cancelada'''))::text,
    (pg_temp.ocurrencias('public\.today_bog\(\) \+ 1')
       >= pg_temp.ocurrencias('state\s*=\s*''cancelada'''))::text,
    (pg_temp.ocurrencias('c\.origin = ''ical''')
       >= pg_temp.ocurrencias('state\s*=\s*''cancelada'''))::text,
    -- El piso, presente en la cancelación por desaparición. Ver el comentario.
    (pg_temp.ocurrencias('c\.scheduled_date >= v_piso')   > 0)::text,
    -- `needs_review` es pegajoso: la función NUNCA lo apaga.
    pg_temp.ocurrencias('needs_review\s*=\s*false')::text,
    -- Ni un solo borrado, ni de aseos ni de reservas, en toda la función.
    pg_temp.ocurrencias('delete\s+from')::text,
    -- `cancel_reason` se escribe en cada cancelación y solo con los dos valores
    -- enumerados. Un tercer valor, o uno interpolado, rompe la igualdad.
    (pg_temp.ocurrencias('cancel_reason\s*=\s*''')
       = pg_temp.ocurrencias('state\s*=\s*''cancelada'''))::text,
    (pg_temp.ocurrencias('cancel_reason\s*=\s*''')
       = pg_temp.ocurrencias('cancel_reason\s*=\s*''reserva_desaparecida''')
       + pg_temp.ocurrencias('cancel_reason\s*=\s*''reserva_movida'''))::text,
    -- CONTROL POSITIVO: hay cancelaciones que contar. Sin esto, borrarlas todas
    -- pondría las ocho comparaciones de arriba en `0 = 0` y en verde.
    (pg_temp.ocurrencias('state\s*=\s*''cancelada''')     > 0)::text
  ],
  array['true', 'true', 'true', 'true', 'true', '0', '0', 'true', 'true', 'true'],
  'toda cancelación de la función lleva sus candados, no hay borrados, needs_review no se apaga y cancel_reason es una lista cerrada');
select * from finish();
rollback;
