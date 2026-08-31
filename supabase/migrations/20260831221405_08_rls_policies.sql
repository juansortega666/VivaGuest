-- ============================================================================
-- 08_rls_policies.sql — PLAT-03, PLAT-05, PLAT-06
--
-- El modelo de autorizacion completo, de arriba abajo, en un solo archivo: el
-- esquema `private`, los 6 helpers SECURITY DEFINER, la RLS habilitada en las 22
-- tablas de `public` y todas las policies.
--
-- Se lee JUNTO con `07_grants.sql`, y en ese orden. El 07 decide QUE ROL puede
-- tocar QUE TABLA; este decide QUE FILAS. Los dos hacen falta:
--   * Sin grant, la policy es irrelevante y el error es `42501`, no "0 filas".
--   * Sin policy, el grant abre la tabla entera al rol `authenticated`, que es
--     el MISMO rol Postgres para el admin y para el aseador. La RLS es lo unico
--     que los distingue.
--
-- Que es cierto cuando este archivo esta aplicado, y que hay que poder seguir
-- diciendo despues de cualquier cambio:
--
--   1. Un aseador solo obtiene los aseos asignados a el, y sus instrucciones.
--   2. No ve apartamentos ajenos, NI SIQUIERA pidiendolos embebidos en el join
--      con sus propios aseos.
--   3. Un aseador desactivado con un access token todavia valido no obtiene ni
--      una fila.
--   4. Ni el aseador asignado a ese mismo apartamento puede hacer SELECT sobre
--      `property_secrets`: obtiene `42501`.
--
-- ----------------------------------------------------------------------------
-- LAS TRES REGLAS DE FORMA, Y NO SON ESTILO
-- ----------------------------------------------------------------------------
--  R1. `for ... to authenticated` SIEMPRE. Una policy sin `to` aplica a todos
--      los roles, incluidos los internos, y hace mucho mas dificil razonar sobre
--      quien la evalua.
--  R2. Toda llamada a funcion envuelta en `(select ...)`. Postgres la evalua
--      como InitPlan, una vez por sentencia en vez de una vez por fila.
--      Verificado indirectamente: `db advisors` NO reporta `auth_rls_initplan`
--      sobre las policies escritas asi.
--  R3. Ninguna policy lee claims del JWT para autorizar. Todas evaluan
--      `profiles.is_active` contra la base, via helper definer. Un access token
--      ya emitido sigue verificando criptograficamente hasta que expira, aunque
--      la sesion este revocada: si el rol viviera en un custom claim, un usuario
--      desactivado seguiria siendo admin/aseador valido hasta 60 minutos
--      despues. La revocacion tiene que ocurrir en la base. `jwt_expiry` bajo es
--      el complemento barato, no la defensa.
--      (Si se usa un claim de rol, es SOLO para rutear en middleware. Eso es UX,
--      no autorizacion, y la distincion debe quedar escrita en el codigo.)
--
-- ----------------------------------------------------------------------------
-- EL PRINCIPIO DEL DAG
-- ----------------------------------------------------------------------------
-- El grafo de dependencias entre policies debe ser un DAG. Si la policy de
-- `properties` consultara `cleanings` y la de `cleanings` consultara
-- `properties`, Postgres entra en recursion infinita de politicas (`42P17`),
-- TODO falla para TODOS los roles, y aparece la presion de desactivar la RLS
-- "porque esta rota".
--
-- Aqui el DAG es:   properties --> cleanings   (via funcion SECURITY DEFINER)
--                   cleanings  --> nada        (policy deliberadamente plana)
--
-- La policy de `cleanings` es `aseador_id = auth.uid()` y NO referencia
-- `properties`. Si alguien siente la tentacion de agregarle una condicion sobre
-- el apartamento, el ciclo vuelve. La forma correcta de romperlo es la que ya
-- esta: mover el lado de lookup a una funcion definer del esquema `private`,
-- que salta la RLS de la tabla consultada.
-- ============================================================================


-- ============================================================================
-- PARTE A — El esquema `private` y los 6 helpers
-- ============================================================================
-- `private` NO se agrega a `[api] schemas` de config.toml. Eso es lo que
-- mantiene estas funciones fuera del alcance de PostgREST (no son invocables
-- desde el cliente) y hace que `supabase gen types --schema public` tampoco las
-- emita. El comentario que lo prohibe ya esta escrito en config.toml.

create schema if not exists private;

revoke all   on schema private from public;
grant  usage on schema private to authenticated;

comment on schema private is
  'Helpers SECURITY DEFINER de las policies de RLS. NO se expone en PostgREST: '
  'no agregar "private" a [api] schemas de config.toml.';

-- ---------------------------------------------------------------------------
-- Por que `set search_path = ''` en los seis, y por que no es decorativo:
-- una funcion SECURITY DEFINER corre con el privilegio del owner (`postgres`).
-- Con el search_path heredado del invocante, cualquiera que pueda crear un
-- objeto en un esquema que quede antes en la ruta puede secuestrar un nombre no
-- calificado y ejecutar codigo como `postgres`. Por eso ademas TODOS los nombres
-- van calificados por esquema.
-- `db advisors` lo reporta como `function_search_path_mutable`, y el
-- guardarrail 5 de la suite lo verifica sobre `public` y `private`.
--
-- Nota de forma medida en PG 17.6: el valor almacenado en `proconfig` es
-- `search_path=""` (entrecomillado), no `search_path=`. Dos planes anteriores
-- publicaron snippets de verificacion con el literal equivocado y produjeron
-- rojos falsos. El guardarrail 5 ya acepta las dos formas.
-- ---------------------------------------------------------------------------

-- 1/6 — Es admin, y sigue activo AHORA MISMO segun la base.
create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.profiles p
     where p.id = (select auth.uid())
       and p.role = 'admin'
       and p.is_active
  )
$$;

-- 2/6 — Es aseador, y sigue activo. Esta es la funcion que corta en seco a la
--       aseadora desactivada con token vivo (asercion 8 y 9 de 00_rls_aseos).
create or replace function private.is_active_cleaner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.profiles p
     where p.id = (select auth.uid())
       and p.role = 'aseador'
       and p.is_active
  )
$$;

-- 3/6 — Aseos que el aseador puede LEER. Incluye historico corto (30 dias) para
--       que pueda revisar lo que ya entrego, y `completada` por lo mismo.
--       `cancelada` queda fuera a proposito: un aseo cancelado ya no es suyo.
create or replace function private.my_cleaning_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select c.id
    from public.cleanings c
   where c.aseador_id = (select auth.uid())
     and c.is_managed
     and c.state in ('pendiente', 'en_curso', 'completada')
     and c.scheduled_date >= public.today_bog() - 30
$$;

-- 4/6 — Aseos sobre los que puede ESCRIBIR (subir evidencia). Mucho mas
--       estrecho: solo el que tiene en curso. No se sube una foto a un aseo que
--       todavia no empezo ni a uno que ya entrego.
create or replace function private.my_writable_cleaning_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select c.id
    from public.cleanings c
   where c.aseador_id = (select auth.uid())
     and c.is_managed
     and c.state = 'en_curso'
$$;

-- 5/6 — Apartamentos visibles: solo donde tiene trabajo vivo, ventana -1 .. +7.
--       Es la ventana de PLANEACION: el aseador necesita ver la direccion y el
--       mapa de lo que le toca esta semana.
--       ESTA es la funcion que impide la fuga por embed (T-01-38): PostgREST
--       resuelve `?select=*,properties(*)` como un join, y quien decide es la
--       policy de la tabla QUE TIENE EL DATO, no la de la que se pide.
create or replace function private.my_property_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct c.property_id
    from public.cleanings c
   where c.aseador_id = (select auth.uid())
     and c.is_managed
     and c.state in ('pendiente', 'en_curso')
     and c.scheduled_date between public.today_bog() - 1 and public.today_bog() + 7
$$;

-- 6/6 — Ventana del CODIGO DE ACCESO: hoy y manana. Deliberadamente distinta y
--       mucho mas estrecha que la de arriba. Un aseo a 5 dias es VISIBLE pero NO
--       desbloqueable, y la suite lo ejerce como aserciones 3 y 13 de
--       `00_rls_aseos.test.sql`, una contra la otra.
--       La consume `public.reveal_access_code()` (plan 01-08), no una policy:
--       `property_secrets` no tiene ninguna policy de lectura para el aseador.
create or replace function private.my_unlockable_property_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct c.property_id
    from public.cleanings c
   where c.aseador_id = (select auth.uid())
     and c.is_managed
     and c.state in ('pendiente', 'en_curso')
     and c.scheduled_date between public.today_bog() and public.today_bog() + 1
$$;

-- ---------------------------------------------------------------------------
-- Las seis usan `public.today_bog()` y NUNCA la fecha de la sesion. La sesion
-- corre en UTC: pasadas las 19:00 de Bogota el dia de la sesion ya es el
-- siguiente, y el aseador perderia el acceso a su propio aseo a las 7pm, en
-- plena jornada. `scripts/ci/check-service-role.sh` lo verifica por grep sobre
-- todas las migraciones.
-- ---------------------------------------------------------------------------

-- En Postgres, PUBLIC recibe EXECUTE por defecto sobre toda funcion nueva
-- (proacl `=X`). Para `private` eso ya esta cubierto de forma indirecta, porque
-- `anon` no tiene USAGE sobre el esquema; escribirlo explicito cuesta seis
-- lineas y evita depender de un detalle a distancia.
revoke all on function private.is_admin()                     from public, anon;
revoke all on function private.is_active_cleaner()            from public, anon;
revoke all on function private.my_cleaning_ids()              from public, anon;
revoke all on function private.my_writable_cleaning_ids()     from public, anon;
revoke all on function private.my_property_ids()              from public, anon;
revoke all on function private.my_unlockable_property_ids()   from public, anon;

grant execute on function private.is_admin()                   to authenticated;
grant execute on function private.is_active_cleaner()          to authenticated;
grant execute on function private.my_cleaning_ids()            to authenticated;
grant execute on function private.my_writable_cleaning_ids()   to authenticated;
grant execute on function private.my_property_ids()            to authenticated;
grant execute on function private.my_unlockable_property_ids() to authenticated;


-- ============================================================================
-- PARTE B — RLS habilitada en las 22 tablas de `public`, sin excepciones
-- ============================================================================
-- Incluidas `property_secrets` y `storage_deletion_queue`, que no tienen ningun
-- grant y por tanto ya son inalcanzables desde `authenticated`. Se habilita
-- igual por dos razones concretas:
--
--   1. El guardarrail 1 de `02_guardarrailes.test.sql` no admite excepciones, y
--      no admitirlas es justamente lo que lo hace util: una lista de exenciones
--      es una lista que crece.
--   2. El punto ciego de `supabase db advisors` es exactamente ese:
--      `rls_disabled_in_public` SOLO dispara si la tabla tiene grants. Medido en
--      esta base tras aplicar la migracion 07: el advisor reporto ERROR sobre
--      las 20 tablas con grant y NO menciono `property_secrets` ni
--      `storage_deletion_queue`. O sea, una tabla sin grant y sin RLS es
--      invisible para el advisor hasta el dia en que alguien le anada el grant,
--      y ese dia la fuga ya existe.
--
-- No se usa `force row level security`: el owner (`postgres`) debe seguir exento
-- para que los triggers, los seeds y los fixtures de pgTAP funcionen. Los RPC
-- SECURITY DEFINER del plan 01-08 corren como `postgres` por la misma razon.

alter table public.profiles                   enable row level security;
alter table public.properties                 enable row level security;
alter table public.property_secrets           enable row level security;
alter table public.room_types                 enable row level security;
alter table public.checklist_tasks            enable row level security;
alter table public.property_rooms             enable row level security;
alter table public.missing_item_catalog       enable row level security;
alter table public.app_settings               enable row level security;
alter table public.calendar_feeds             enable row level security;
alter table public.calendar_reservations      enable row level security;
alter table public.cleanings                  enable row level security;
alter table public.cleaning_checklist_items   enable row level security;
alter table public.damages                    enable row level security;
alter table public.expenses                   enable row level security;
alter table public.missing_item_reports       enable row level security;
alter table public.missing_item_lines         enable row level security;
alter table public.cleaning_photos            enable row level security;
alter table public.access_code_reads          enable row level security;
alter table public.cleaning_state_transitions enable row level security;
alter table public.push_subscriptions         enable row level security;
alter table public.notifications              enable row level security;
alter table public.storage_deletion_queue     enable row level security;


-- ============================================================================
-- PARTE C — Las policies
-- ============================================================================

-- ---------------------------------------------------------------------------
-- C.1 `cleanings` — la raiz del DAG. PLANA A PROPOSITO.
-- ---------------------------------------------------------------------------
-- NO referencia `properties`, ni directa ni indirectamente. Ese es el invariante
-- que evita `42P17`. Si alguna vez hace falta filtrar aseos por una propiedad
-- del apartamento, el lookup va a una funcion definer nueva en `private`, jamas
-- a un subselect sobre `public.properties` dentro de esta policy.
--
-- Las ramas de escritura de la policy de admin NO son alcanzables desde
-- `authenticated`, porque la migracion 07 no otorga DML sobre esta tabla a
-- nadie: toda mutacion pasa por RPC SECURITY DEFINER (decision bloqueada de
-- 01-CONTEXT.md). Se dejan escritas para que el dia que se otorgue un grant la
-- autorizacion ya este puesta y no haya una ventana sin policy.
create policy cleanings_admin_all on public.cleanings
  for all to authenticated
  using       ((select private.is_admin()))
  with check  ((select private.is_admin()));

create policy cleanings_cleaner_select on public.cleanings
  for select to authenticated
  using ((select private.is_active_cleaner())
     and aseador_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- C.2 `properties` — la policy que cierra la fuga por embed (T-01-38)
-- ---------------------------------------------------------------------------
create policy properties_admin_all on public.properties
  for all to authenticated
  using      ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy properties_cleaner_select on public.properties
  for select to authenticated
  using ((select private.is_active_cleaner())
     and id in (select private.my_property_ids()));

-- ---------------------------------------------------------------------------
-- C.3 `property_secrets` — SOLO admin. Y no va a haber mas.
-- ---------------------------------------------------------------------------
-- Guarda dos credenciales: el codigo fisico de la cerradura y la URL de
-- exportacion iCal (un GET a esa URL revela la ocupacion completa del
-- apartamento sin autenticar). No hay policy de lectura para el aseador, ni la
-- habra: su acceso pasa por `public.reveal_access_code()` (plan 01-08), que
-- suma ventana temporal estrecha, rastro de auditoria en `access_code_reads` y
-- un unico punto donde endurecer la regla.
--
-- Como ademas la tabla no tiene NINGUN grant (migracion 07), esta policy no es
-- lo que la protege. Lo que la protege es la ausencia de grant, que convierte
-- el SELECT directo en `42501` incluso para el aseador asignado. Esta policy
-- existe para el admin y para satisfacer el guardarrail 2.
create policy secrets_admin_all on public.property_secrets
  for all to authenticated
  using      ((select private.is_admin()))
  with check ((select private.is_admin()));

-- ---------------------------------------------------------------------------
-- C.4 `profiles` — el admin gestiona; el aseador ve su propia fila y nada mas
-- ---------------------------------------------------------------------------
-- La policy propia NO exige `is_active_cleaner()`: un usuario desactivado debe
-- poder leer su propio perfil para que la UI le explique por que no ve nada, en
-- vez de mostrarle una pantalla vacia sin causa. Lo que no ve es ningun aseo ni
-- ningun apartamento, que es donde estan los datos.
create policy profiles_admin_all on public.profiles
  for all to authenticated
  using      ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy profiles_own_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- C.5 Catalogo global — el aseador lo lee entero, el admin lo edita
-- ---------------------------------------------------------------------------
-- `room_types` y `checklist_tasks` no tienen dato sensible: son "Habitacion
-- principal" y "Tender la cama". Sin ellos la app del aseador no puede
-- renderizar su checklist.
create policy room_types_admin_all on public.room_types
  for all to authenticated
  using      ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy room_types_cleaner_select on public.room_types
  for select to authenticated
  using ((select private.is_active_cleaner()));

create policy checklist_tasks_admin_all on public.checklist_tasks
  for all to authenticated
  using      ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy checklist_tasks_cleaner_select on public.checklist_tasks
  for select to authenticated
  using ((select private.is_active_cleaner()));

-- `missing_item_catalog` SI se acota: las entradas globales
-- (`property_id is null`) las ve cualquier aseador activo, y las especificas de
-- un apartamento solo quien tenga trabajo vivo alli. El nombre de un item
-- especifico puede filtrar informacion del inventario de un apartamento ajeno.
create policy mic_admin_all on public.missing_item_catalog
  for all to authenticated
  using      ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy mic_cleaner_select on public.missing_item_catalog
  for select to authenticated
  using ((select private.is_active_cleaner())
     and (property_id is null
          or property_id in (select private.my_property_ids())));

-- `property_rooms` es la estructura fisica del apartamento: solo la de los
-- suyos, y con la ventana corta de `my_property_ids()`.
create policy property_rooms_admin_all on public.property_rooms
  for all to authenticated
  using      ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy property_rooms_cleaner_select on public.property_rooms
  for select to authenticated
  using ((select private.is_active_cleaner())
     and property_id in (select private.my_property_ids()));

-- ---------------------------------------------------------------------------
-- C.6 Datos colgados de un aseo — lectura por `my_cleaning_ids()`
-- ---------------------------------------------------------------------------
-- Sin INSERT ni UPDATE para el aseador en ninguna de las cuatro: sus escrituras
-- pasan por RPC (`toggle_checklist_item`, `report_damage`, `report_expense`,
-- `report_missing_items`). La migracion 07 tampoco le otorga DML, asi que hoy
-- son ademas inalcanzables.
create policy cci_admin_all on public.cleaning_checklist_items
  for all to authenticated
  using      ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy cci_cleaner_select on public.cleaning_checklist_items
  for select to authenticated
  using ((select private.is_active_cleaner())
     and cleaning_id in (select private.my_cleaning_ids()));

create policy damages_admin_all on public.damages
  for all to authenticated
  using      ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy damages_cleaner_select on public.damages
  for select to authenticated
  using ((select private.is_active_cleaner())
     and cleaning_id in (select private.my_cleaning_ids()));

create policy expenses_admin_all on public.expenses
  for all to authenticated
  using      ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy expenses_cleaner_select on public.expenses
  for select to authenticated
  using ((select private.is_active_cleaner())
     and cleaning_id in (select private.my_cleaning_ids()));

create policy mir_admin_all on public.missing_item_reports
  for all to authenticated
  using      ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy mir_cleaner_select on public.missing_item_reports
  for select to authenticated
  using ((select private.is_active_cleaner())
     and cleaning_id in (select private.my_cleaning_ids()));

-- `missing_item_lines` cuelga del reporte, no del aseo: hay que dar un salto
-- mas. El subselect sobre `public.missing_item_reports` SI evalua la RLS de esa
-- tabla (no es una funcion definer), y eso es correcto y no genera ciclo: el
-- grafo sigue siendo acilico, `missing_item_lines --> missing_item_reports -->
-- (my_cleaning_ids, definer) --> nada`.
create policy mil_admin_all on public.missing_item_lines
  for all to authenticated
  using      ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy mil_cleaner_select on public.missing_item_lines
  for select to authenticated
  using ((select private.is_active_cleaner())
     and report_id in (
       select r.id
         from public.missing_item_reports r
        where r.cleaning_id in (select private.my_cleaning_ids())));

-- ---------------------------------------------------------------------------
-- C.7 `cleaning_photos` — evidencia inmutable
-- ---------------------------------------------------------------------------
-- Lee con la ventana ancha (`my_cleaning_ids`, incluye historico y completadas)
-- y escribe con la estrecha (`my_writable_cleaning_ids`, solo el aseo en curso).
--
-- SIN policy de UPDATE ni de DELETE para el aseador, y la migracion 07 tampoco
-- le otorga esos privilegios. Una foto subida es prueba y la prueba no se
-- reemplaza: si se pudiera, "subir la foto buena despues" seria trivial y la
-- evidencia dejaria de valer para el reclamo al huesped.
create policy photos_admin_all on public.cleaning_photos
  for all to authenticated
  using      ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy photos_cleaner_select on public.cleaning_photos
  for select to authenticated
  using ((select private.is_active_cleaner())
     and cleaning_id in (select private.my_cleaning_ids()));

create policy photos_cleaner_insert on public.cleaning_photos
  for insert to authenticated
  with check ((select private.is_active_cleaner())
          and cleaning_id in (select private.my_writable_cleaning_ids()));

-- ---------------------------------------------------------------------------
-- C.8 `notifications` — cada quien las suyas, admin y aseador por igual
-- ---------------------------------------------------------------------------
-- La unica tabla del esquema donde el admin NO tiene acceso total, y es
-- deliberado: la campana de un usuario es suya. El admin ve el estado operativo
-- en la tabla que corresponda, no leyendo las notificaciones de sus aseadoras.
--
-- SIN policy de INSERT para nadie: las notificaciones las crea un trigger o un
-- worker, que corren como `postgres` / `service_role`. La migracion 07 tampoco
-- otorga INSERT. Eso desactiva hoy el vector del `threat_flag: schema-change`
-- del plan 01-06 sobre `notifications.url`.
create policy notifications_own_select on public.notifications
  for select to authenticated
  using (recipient_id = (select auth.uid()));

-- El UPDATE es para marcar `read_at`. El `with check` repite la condicion para
-- que nadie pueda reasignarse una notificacion ajena cambiando `recipient_id`.
create policy notifications_own_update on public.notifications
  for update to authenticated
  using      (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- C.9 `push_subscriptions` — la unica tabla que el aseador escribe libremente
-- ---------------------------------------------------------------------------
-- Es la suscripcion push de su propio dispositivo: la crea el navegador y la
-- borra al revocar permisos. `for all` acotado a `user_id = uid()`, con el
-- `with check` para que no pueda registrar un endpoint a nombre de otro (seria
-- redirigir las notificaciones ajenas a su telefono).
create policy push_subs_own_all on public.push_subscriptions
  for all to authenticated
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- C.10 Tablas solo-admin
-- ---------------------------------------------------------------------------
-- Todas tienen `grant select` para `authenticated` (migracion 07) y policy
-- admin-only. Consecuencia importante para quien escriba tests: el aseador SI
-- tiene el privilegio, asi que lo que obtiene es CERO FILAS, no `42501`. La
-- asercion correcta es `is_empty`, no `throws_ok`. Es exactamente el contraste
-- entre las aserciones 10 y 16 de `00_rls_aseos.test.sql`.

-- `access_code_reads`: la bitacora de quien vio que codigo de cerradura y
-- cuando. Relevante si roban un apartamento. El aseador no la lee ni para ver
-- sus propias lecturas: saber quien mas entro es informacion de investigacion.
create policy acr_admin_select on public.access_code_reads
  for select to authenticated
  using ((select private.is_admin()));

-- `app_settings` y `calendar_feeds` los EDITA el admin desde la UI, por eso van
-- con `for all` y no con `for select`.
create policy app_settings_admin_all on public.app_settings
  for all to authenticated
  using      ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy calendar_feeds_admin_all on public.calendar_feeds
  for all to authenticated
  using      ((select private.is_admin()))
  with check ((select private.is_admin()));

-- `calendar_reservations` la escribe el worker de la Fase 3 con `service_role`.
-- El admin solo la consulta.
create policy calendar_res_admin_select on public.calendar_reservations
  for select to authenticated
  using ((select private.is_admin()));

-- `cleaning_state_transitions` es el log de auditoria de la maquina de estados.
-- Lo escribe un trigger SECURITY DEFINER; nadie lo escribe a mano, ni el admin.
create policy cst_admin_select on public.cleaning_state_transitions
  for select to authenticated
  using ((select private.is_admin()));

-- `storage_deletion_queue` no tiene NINGUN grant (migracion 07): es inalcanzable
-- desde `authenticated` con o sin esta policy. Existe porque una tabla con RLS y
-- sin ninguna policy devuelve todo vacio EN SILENCIO, y ese silencio es
-- justamente lo que empuja a alguien a "arreglarlo" desactivando la RLS o
-- metiendo la clave de servicio. Guardarrail 2.
create policy sdq_admin_select on public.storage_deletion_queue
  for select to authenticated
  using ((select private.is_admin()));


-- ============================================================================
-- PARTE D — Vistas: ninguna en esta fase, y la regla para cuando las haya
-- ============================================================================
-- `v_cleaning_margin`, `v_carga_diaria` y `v_admin_alerts` son de las Fases 4 y
-- 7. Cuando se creen:
--
--   create view public.v_lo_que_sea with (security_invoker = on) as ...
--
-- El `with (security_invoker = on)` NO es opcional. Sin el, la vista corre con
-- los privilegios de su owner y SALTA la RLS de las tablas base. Medido en el
-- research: 4 filas donde debia haber 1. `db advisors` lo cataloga como ERROR
-- `security_definer_view` y el guardarrail 3 de la suite lo verifica sobre toda
-- vista de `public`.


-- ============================================================================
-- DEUDA ACEPTADA Y REGISTRADA
-- ============================================================================
-- Este diseno emite varios WARN `multiple_permissive_policies` en
-- `db advisors`, sobre las tablas que tienen "una policy para admin + una policy
-- para aseador" en el mismo rol y la misma accion. Es literalmente lo que ese
-- lint detecta, y es el precio de que el modelo de autorizacion se pueda leer.
--
-- Consolidarlas en un unico `OR` quitaria los WARN y a cambio produciria
-- predicados donde la condicion del admin y la del aseador se mezclan en una
-- sola expresion: precisamente el tipo de policy donde un error de parentesis
-- abre la tabla entera y nadie lo nota. La ganancia de rendimiento es
-- irrelevante con 39 apartamentos y ~8 aseadoras.
--
-- Por eso el CI corre `db advisors --fail-on error` y NO `--fail-on warn`. Si
-- algun dia se sube a `warn`, hay que resolver esto antes, no consolidando las
-- policies sino documentando la excepcion.
