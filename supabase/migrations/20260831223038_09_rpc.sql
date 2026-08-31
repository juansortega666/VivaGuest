-- ============================================================================
-- 09 — LOS RPC: el contrato de escritura de toda la UI
--
-- Seis funciones `SECURITY DEFINER`. Son la unica ruta por la que el aseador
-- muta el estado del sistema, y la unica por la que sale el codigo de acceso
-- de un apartamento.
--
-- Por que RPC y no privilegios de columna (ARCHITECTURE.md §Escrituras del
-- aseador): `grant update (state, finished_at)` si funciona con RLS, pero no
-- puede expresar "solo terminas si TODO el checklist esta hecho y cada tarea
-- que exige foto la tiene" ni "'no puedo' devuelve el aseo Y encola la alerta,
-- atomicamente". Esos invariantes son multi-fila y transaccionales; el lugar
-- correcto es una funcion. Por eso `cleanings` se quedo con SELECT y cero DML
-- para `authenticated` en la migracion 07.
--
-- ---------------------------------------------------------------------------
-- REGLA UNIFORME DE ESTE ARCHIVO, LAS TRES PARTES SON OBLIGATORIAS
-- ---------------------------------------------------------------------------
--
--   1. `language plpgsql security definer set search_path = ''`
--   2. TODO nombre calificado por esquema (con search_path vacio no hay
--      esquema implicito mas alla de pg_catalog)
--   3. Al lado de cada definicion:
--        revoke all     on function public.<f>(<args>) from public, anon;
--        grant  execute on function public.<f>(<args>) to authenticated;
--
-- El punto 3 NO ES DECORATIVO Y NO SE HEREDA. El plan 01-07 intento cerrarlo
-- de una vez con `alter default privileges ... revoke execute on functions
-- from public, anon` y MIDIO que no funciona en PG 17.6: Postgres refusiona
-- `acldefault('f', owner)` -- que siempre trae la entrada `=X` de PUBLIC --
-- con lo almacenado en pg_default_acl, asi que la entrada reaparece en cada
-- funcion nueva. Medido dos veces y por dos caminos:
--
--   defaclacl tras el revoke        : {postgres=X, authenticated=X, service_role=X}
--   proacl de una funcion posterior : {=X/postgres, postgres=X, authenticated=X, service_role=X}
--   has_function_privilege('anon', <nueva>, 'execute') -> t
--
-- El revoke EXPLICITO al lado de la definicion si funciona, porque opera sobre
-- un ACL materializado: `t` -> `f`, medido en las 5 funciones que ya existian.
--
-- Sin esas dos lineas, `reveal_access_code()` -- la funcion que entrega el
-- codigo que abre fisicamente un apartamento con huespedes y pertenencias
-- adentro -- seria invocable por `anon`, es decir por cualquiera que tenga la
-- publishable key, que es publica por diseno. Hoy devolveria 42501 porque
-- `auth.uid()` es NULL, pero la funcion corre como `postgres`: convertirla en
-- fuga solo requiere un bug en su guarda.
-- Ver hallazgo 5 de .planning/phases/01-fundaci-n-schema-y-rls/deferred-items.md
--
-- El guardarrail 9 de `02_guardarrailes.test.sql` verifica la propiedad
-- resultante sobre TODAS las funciones de `public` y `private`, no sobre estas
-- seis: es la unica red que sustituye al default privilege que PG no permite.
--
-- ---------------------------------------------------------------------------
-- POR QUE ESTAS FUNCIONES NO NECESITAN NINGUN GRANT DE TABLA
-- ---------------------------------------------------------------------------
-- Corren como `postgres`, que es owner de las 22 tablas de `public` y por
-- tanto exento de su RLS (ninguna lleva FORCE ROW LEVEL SECURITY). Esa es
-- exactamente la razon por la que `cleanings` puede quedarse sin DML para
-- `authenticated` y `property_secrets` sin ningun grant: el privilegio no vive
-- en el rol del cliente, vive en la funcion, y la funcion trae su propia
-- guarda escrita.
--
-- Corolario incomodo que conviene tener presente al editar este archivo: aqui
-- NO hay red de seguridad. Un `where` mal escrito no da 42501, da los datos.
--
-- ---------------------------------------------------------------------------
-- `public.today_bog()` Y NUNCA LA FECHA DE LA SESION
-- ---------------------------------------------------------------------------
-- La sesion corre en UTC. Pasadas las 19:00 de Bogota, la fecha de la sesion
-- ya es el dia siguiente, y el aseador perderia el acceso al codigo de su
-- propio aseo a las 7pm, en plena jornada.
-- `scripts/ci/check-service-role.sh` lo verifica por grep sobre todas las
-- migraciones.
-- ============================================================================


-- ===========================================================================
-- 1/6 — reveal_access_code() — PLAT-05
--
-- El dato mas sensible del sistema. El 90% de las unidades tiene cerradura
-- inteligente: este texto ES la llave.
--
-- Tres cosas que este patron da y que una policy de SELECT sobre
-- `property_secrets` no daria:
--   * ventana temporal estrecha, hoy y manana
--   * rastro de auditoria de quien vio que codigo y cuando
--   * un solo punto donde endurecer la regla
--
-- ORDEN DE LAS SENTENCIAS, NO ES ESTILO: el INSERT en `access_code_reads` va
-- ANTES del `return query` y en la misma transaccion. Si el return falla, se
-- revierte todo; si tiene exito, la fila de auditoria ya esta escrita. No
-- puede existir lectura de codigo sin rastro (T-01-48). La asercion 12 de
-- `00_rls_aseos.test.sql` lo ejerce.
--
-- `p_cleaning` es un ASEO y no un `property_id`, deliberadamente: obliga a que
-- la autorizacion se ancle a un trabajo concreto asignado, no a "tener algun
-- trabajo en ese apartamento". Es lo que hace que un aseo a 5 dias NO revele
-- el codigo aunque el apartamento si sea visible por la ventana -1..+7 de
-- `private.my_property_ids()`. Aserciones 3 y 13, una contra la otra.
--
-- SOBRE `private.my_unlockable_property_ids()`: existe (migracion 08) con esta
-- MISMA ventana hoy..hoy+1, y el plan 01-07 la dejo escrita para que la
-- consumiera esta funcion. No se delega en ella a proposito, y la razon es de
-- fuerza de la autorizacion: ese helper es PROPERTY-scoped, asi que delegarle
-- la decision degradaria el predicado de "este aseo tuyo es desbloqueable" a
-- "tienes algun aseo desbloqueable en ese apartamento", que es estrictamente
-- mas debil y pierde el ancla al aseo. La consulta de abajo es la de
-- ARCHITECTURE.md verbatim y conserva el ancla.
-- CONTRATO: las dos ventanas tienen que moverse juntas. Si alguna vez cambia
-- `today_bog() .. today_bog() + 1` aqui, hay que cambiarla tambien en el
-- helper 6/6 de la migracion 08, y viceversa.
-- ===========================================================================
create or replace function public.reveal_access_code(p_cleaning uuid)
returns table (codigo_acceso text, tipo_cerradura text, notas_acceso text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prop uuid;
begin
  -- Un unico SELECT lleva las cinco condiciones de autorizacion. Que sea uno
  -- solo importa: separarlas en varios `if` invita a que alguien anada un
  -- `return` temprano entre medias y se salte la auditoria.
  select c.property_id
    into v_prop
    from public.cleanings c
   where c.id            = p_cleaning
     and c.aseador_id    = (select auth.uid())
     and c.is_managed
     and c.state in ('pendiente', 'en_curso')
     and c.scheduled_date between public.today_bog() and public.today_bog() + 1;

  if v_prop is null then
    -- 42501 y no P0001: para el cliente tiene que ser indistinguible
    -- "no existe", "no es tuyo" y "todavia no es su dia". Un error que
    -- discriminara esos tres casos seria un oraculo de enumeracion de aseos
    -- ajenos.
    raise exception 'no_autorizado' using errcode = '42501';
  end if;

  insert into public.access_code_reads (property_id, cleaning_id, read_by)
  values (v_prop, p_cleaning, (select auth.uid()));

  return query
    select s.codigo_acceso, s.tipo_cerradura, s.notas_acceso
      from public.property_secrets s
     where s.property_id = v_prop;
end;
$$;

comment on function public.reveal_access_code(uuid) is
  'PLAT-05. Unica ruta de salida del codigo de acceso. Autoriza contra un aseo propio, gestionado, vivo y programado para hoy o manana; audita en access_code_reads ANTES de devolver, en la misma transaccion. Error 42501 en cualquier otro caso.';

revoke all     on function public.reveal_access_code(uuid) from public, anon;
grant  execute on function public.reveal_access_code(uuid) to authenticated;


-- ===========================================================================
-- 2/6 — confirm_cleaning() — solo admin
--
-- Confirma un aseo detectado (por el sync de la Fase 3 o creado a mano):
-- asigna al responsable del apartamento, escribe numero de huespedes e
-- instrucciones, y MATERIALIZA el checklist.
--
-- OJO CON EL ESTADO: esta funcion NO lo cambia. El aseo sigue en 'pendiente',
-- ahora confirmado y asignado. La transicion a 'en_curso' la hace
-- start_cleaning(). `cl_pendiente_shape` permite `confirmado_at is not null`
-- con `state = 'pendiente'` justamente por esto.
-- ===========================================================================
create or replace function public.confirm_cleaning(
  p_cleaning       uuid,
  p_num_huespedes  smallint,
  p_instrucciones  text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_property    uuid;
  v_responsable uuid;
begin
  -- `private.is_admin()` consulta `profiles` en la base, NUNCA un claim del
  -- JWT: un admin degradado hace un minuto no puede confirmar con su token
  -- todavia vivo.
  if not (select private.is_admin()) then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;

  -- `for update of c`: se bloquea la fila de `cleanings` y NO la de
  -- `properties`. Sin el `of c`, el join bloquearia tambien el apartamento y
  -- dos confirmaciones de aseos distintos del mismo apartamento se
  -- serializarian sin ninguna necesidad.
  select c.property_id, p.responsable_id
    into v_property, v_responsable
    from public.cleanings  c
    join public.properties p on p.id = c.property_id
   where c.id            = p_cleaning
     and c.is_managed
     and c.state         = 'pendiente'
     and c.confirmado_at is null
     for update of c;

  if not found then
    -- P0001 y no 42501: aqui el admin SI esta autorizado. Lo que falla es el
    -- estado del aseo, y la UI necesita poder distinguir los dos casos para
    -- decir "este aseo ya estaba confirmado" en vez de "no tienes permiso".
    raise exception 'aseo_no_confirmable'
      using errcode = 'P0001',
            hint    = 'El aseo no existe, es de gestion externa, ya no esta pendiente, o ya fue confirmado.';
  end if;

  if v_responsable is null then
    -- Hueco conocido del modelo, no un descuido: una unidad gestionada por una
    -- empresa externa sin usuario en el sistema no tiene a quien asignarse
    -- (`props_active_requires_owner` acepta `contacto_externo` como
    -- alternativa a `responsable_id`). Falla explicito en vez de dejar el aseo
    -- asignado a NULL en silencio, que es como se pierde un aseo entero.
    raise exception 'sin_responsable'
      using errcode = 'P0001',
            hint    = 'El apartamento no tiene responsable_id. Asignale uno antes de confirmar el aseo.';
  end if;

  update public.cleanings
     set aseador_id    = v_responsable,
         num_huespedes = p_num_huespedes,
         instrucciones = p_instrucciones,
         confirmado_at = now(),
         confirmado_by = (select auth.uid())
   where id = p_cleaning;

  -- -------------------------------------------------------------------------
  -- MATERIALIZACION DEL CHECKLIST
  --
  -- Producto de los cuartos ACTIVOS del apartamento por las tareas ACTIVAS de
  -- su tipo de cuarto. `room_label`, `task_label` y `requiere_foto` se copian
  -- como SNAPSHOT: la biblioteca global de tareas puede cambiar manana y un
  -- checklist ya generado no debe reescribirse retroactivamente.
  --
  -- Se materializa AL CONFIRMAR y no al crear el aseo porque un aseo sin
  -- confirmar puede ser cancelado por el sync, y los cuartos del apartamento
  -- pueden editarse entre la deteccion y la confirmacion.
  --
  -- `sort_order`: el cuarto manda y el slot desempata. El *100 deja sitio para
  -- que un cuarto pueda tener mas de 3 tareas el dia que se levante el tope
  -- estructural de `checklist_tasks_slot_rango`.
  -- -------------------------------------------------------------------------
  insert into public.cleaning_checklist_items
    (cleaning_id, property_room_id, checklist_task_id,
     room_label, task_label, requiere_foto, sort_order)
  select p_cleaning,
         pr.id,
         ct.id,
         pr.etiqueta,
         ct.descripcion,
         ct.requiere_foto,
         pr.sort_order * 100 + ct.slot
    from public.property_rooms  pr
    join public.checklist_tasks ct
      on ct.room_type_id = pr.room_type_id
     and ct.is_active
   where pr.property_id = v_property
     and pr.is_active
  on conflict (cleaning_id, property_room_id, checklist_task_id) do nothing;

  -- -------------------------------------------------------------------------
  -- OUTBOX, NO ENVIO.
  --
  -- Esta es la costura conocida y documentada del ROADMAP: al confirmar, el
  -- aseo queda asignado pero NO SE NOTIFICA A NADIE hasta que exista el worker
  -- de la Fase 5. El evento se escribe aqui y se drena despues. Es
  -- INTENCIONAL, no un olvido: una llamada HTTP dentro de la transaccion de
  -- negocio la dejaria abierta a merced de un servicio externo.
  --
  -- El `dedupe_key` es el de ARCHITECTURE.md §Fanout por evento. Con el
  -- `on conflict`, reconfirmar o reasignar no duplica la campana.
  -- El `where dedupe_key is not null` del ON CONFLICT no es opcional: replica
  -- el predicado del indice parcial `notifications_dedupe_idx`, y sin el
  -- Postgres no lo reconoce como arbitro y falla con 42P10.
  -- -------------------------------------------------------------------------
  insert into public.notifications
    (recipient_id, type, title, body, url, cleaning_id, property_id, dedupe_key, payload)
  select v_responsable,
         'asignacion'::public.notification_type,
         'Nuevo aseo asignado',
         'Tienes un aseo asignado en ' || p.nombre || ' para el ' ||
           to_char(c.scheduled_date, 'DD/MM') || ' antes de las ' ||
           to_char(c.hora_limite, 'HH24:MI') || '.',
         '/aseos/' || p_cleaning::text,
         p_cleaning,
         v_property,
         'assign:' || p_cleaning::text || ':' || v_responsable::text,
         jsonb_build_object('num_huespedes', p_num_huespedes)
    from public.cleanings  c
    join public.properties p on p.id = c.property_id
   where c.id = p_cleaning
  on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing;
end;
$$;

comment on function public.confirm_cleaning(uuid, smallint, text) is
  'Solo admin. Asigna el aseo al responsable del apartamento, escribe huespedes e instrucciones y materializa el checklist desde property_rooms x checklist_tasks. NO cambia el estado: el aseo sigue pendiente, ahora confirmado.';

revoke all     on function public.confirm_cleaning(uuid, smallint, text) from public, anon;
grant  execute on function public.confirm_cleaning(uuid, smallint, text) to authenticated;


-- ===========================================================================
-- 3/6 — start_cleaning()
--
-- pendiente -> en_curso. Exige `confirmado_at is not null`: no se empieza un
-- aseo que el admin todavia no confirmo, porque es justo en la confirmacion
-- donde se materializa el checklist que el aseador va a marcar.
--
-- `cl_en_curso_shape` exige confirmado_at, aseador_id y started_at no nulos y
-- finished_at nulo. El CHECK y este RPC se refuerzan mutuamente: si alguien
-- editara esta funcion para saltarse el `confirmado_at is not null`, el CHECK
-- lo para igual, pero con 23514 en vez de 42501.
-- ===========================================================================
create or replace function public.start_cleaning(p_cleaning uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1
     from public.cleanings c
    where c.id            = p_cleaning
      and c.aseador_id    = (select auth.uid())
      and c.is_managed
      and c.state         = 'pendiente'
      and c.confirmado_at is not null
      for update;

  if not found then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;

  update public.cleanings
     set state      = 'en_curso',
         started_at = now()
   where id = p_cleaning;
end;
$$;

comment on function public.start_cleaning(uuid) is
  'pendiente -> en_curso. Solo el aseador asignado y solo si el aseo esta confirmado. Escribe started_at; la transicion la registra el trigger cleanings_log_transition.';

revoke all     on function public.start_cleaning(uuid) from public, anon;
grant  execute on function public.start_cleaning(uuid) to authenticated;


-- ===========================================================================
-- 4/6 — finish_cleaning() — PWA-07
--
-- en_curso -> completada, con el guard agregado que ES el requisito
-- "'Terminé' queda bloqueado mientras falte una tarea o la foto de algun
-- cuarto", impuesto en la base y no en el cliente.
--
-- Un `grant update (state, finished_at)` NO podria expresarlo: el invariante
-- es multi-fila (recorre todo el checklist del aseo y, por cada tarea que
-- exige foto, todas las fotos que cuelgan de ella). Este es el argumento
-- entero de por que existe el patron RPC. Mitiga T-01-51.
-- ===========================================================================
create or replace function public.finish_cleaning(p_cleaning uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_property uuid;
begin
  select c.property_id
    into v_property
    from public.cleanings c
   where c.id         = p_cleaning
     and c.aseador_id = (select auth.uid())
     and c.is_managed
     and c.state      = 'en_curso'
     for update;

  if not found then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;

  -- El guard. `exists` sobre la negacion y no `not exists` sobre la
  -- conjuncion: asi la consulta corta en el primer item incompleto en vez de
  -- recorrer el checklist entero.
  if exists (
    select 1
      from public.cleaning_checklist_items i
     where i.cleaning_id = p_cleaning
       and ( i.done_at is null
          or ( i.requiere_foto
               and not exists (select 1
                                 from public.cleaning_photos ph
                                where ph.checklist_item_id = i.id)))
  ) then
    raise exception 'checklist_incompleto'
      using errcode = 'P0001',
            hint    = 'Falta marcar alguna tarea o subir la foto de una tarea que la exige.';
  end if;

  update public.cleanings
     set state       = 'completada',
         finished_at = now()
   where id = p_cleaning;

  -- Outbox para los admins. Mismo razonamiento que en confirm_cleaning: se
  -- escribe la intencion, el worker de la Fase 5 la drena.
  insert into public.notifications
    (recipient_id, type, title, body, url, cleaning_id, property_id, dedupe_key)
  select pr.id,
         'aseo_completado'::public.notification_type,
         'Aseo completado',
         'Se completo el aseo de ' || p.nombre || '.',
         '/aseos/' || p_cleaning::text,
         p_cleaning,
         v_property,
         'done:' || p_cleaning::text
    from public.profiles   pr
    cross join public.properties p
   where pr.role = 'admin'
     and pr.is_active
     and p.id = v_property
  on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing;
end;
$$;

comment on function public.finish_cleaning(uuid) is
  'PWA-07. en_curso -> completada. Rechaza con P0001 checklist_incompleto si queda una tarea sin marcar o una tarea con requiere_foto sin ninguna foto. El invariante es multi-fila y por eso no puede vivir en un grant de columna.';

revoke all     on function public.finish_cleaning(uuid) from public, anon;
grant  execute on function public.finish_cleaning(uuid) to authenticated;


-- ===========================================================================
-- 5/6 — decline_cleaning() — el "no puedo"
--
-- El caso que justifica el patron RPC entero, porque son DOS efectos que
-- tienen que ocurrir ATOMICAMENTE o el aseo se pierde:
--
--   1. el aseo vuelve a 'pendiente' SIN aseador
--   2. la alerta al admin queda encolada
--
-- Si el paso 2 fallara despues de un paso 1 ya comprometido, quedaria un aseo
-- huerfano que nadie sabe que esta huerfano. En una sola transaccion, o pasan
-- los dos o no pasa ninguno.
--
-- CONSERVA `confirmado_at` A PROPOSITO. El admin ya puso numero de huespedes e
-- instrucciones y el checklist ya esta materializado; ese trabajo no se
-- pierde. `cl_pendiente_shape` deja pasar `confirmado_at` no nulo justamente
-- por este flujo, y lo dice en su comentario de la migracion 04.
--
-- La transicion en_curso -> pendiente la registra SOLA el trigger
-- `cleanings_log_transition` (migracion 05). NO se inserta a mano en
-- `cleaning_state_transitions`: hacerlo produciria dos filas para el mismo
-- movimiento, y la de mano seria la mentirosa (el trigger escribe lo que
-- efectivamente quedo, despues de los CHECK).
--
-- El `update ... returning into` hace de guarda y de escritura a la vez: si el
-- aseo no es del caller, o ya no esta vivo, o es de gestion externa, no
-- afecta ninguna fila y `v_property` se queda NULL.
-- ===========================================================================
create or replace function public.decline_cleaning(p_cleaning uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_property uuid;
  v_actor    uuid := (select auth.uid());
begin
  update public.cleanings
     set state      = 'pendiente',
         aseador_id = null,
         started_at = null
   where id         = p_cleaning
     and aseador_id = v_actor
     and is_managed
     and state in ('pendiente', 'en_curso')
  returning property_id into v_property;

  if v_property is null then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;

  insert into public.notifications
    (recipient_id, type, title, body, url, cleaning_id, property_id, dedupe_key, payload)
  select pr.id,
         'no_puedo'::public.notification_type,
         'Una aseadora no puede tomar un aseo',
         coalesce(quien.full_name, 'Una aseadora') || ' no puede hacer el aseo de ' ||
           p.nombre || '. Motivo: ' ||
           coalesce(nullif(btrim(p_motivo), ''), 'sin especificar'),
         '/aseos/' || p_cleaning::text,
         p_cleaning,
         v_property,
         'decline:' || p_cleaning::text,
         jsonb_build_object('motivo', p_motivo, 'declined_by', v_actor)
    from public.profiles pr
    cross join public.properties p
    left join public.profiles quien on quien.id = v_actor
   where pr.role = 'admin'
     and pr.is_active
     and p.id = v_property
  on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing;
end;
$$;

comment on function public.decline_cleaning(uuid, text) is
  'El "no puedo" del aseador. Devuelve el aseo a pendiente sin aseador y sin started_at, CONSERVANDO confirmado_at, y encola la alerta a los admins en la misma transaccion. La transicion la registra el trigger, no esta funcion.';

revoke all     on function public.decline_cleaning(uuid, text) from public, anon;
grant  execute on function public.decline_cleaning(uuid, text) to authenticated;


-- ===========================================================================
-- 6/6 — toggle_checklist_item()
--
-- Existe en ESTA fase y no en la 6 por una razon concreta: sin ella,
-- finish_cleaning() no tiene forma de llegar a su condicion de salida desde el
-- cliente, y anadirla despues obligaria a repensar los grants de
-- `cleaning_checklist_items`, que ya quedaron cerrados en `select` a secas en
-- la migracion 07.
--
-- `private.my_writable_cleaning_ids()` (solo `state = 'en_curso'`) y no
-- `my_cleaning_ids()`: no se marca una tarea de un aseo que todavia no empezo
-- ni de uno que ya se entrego.
-- ===========================================================================
create or replace function public.toggle_checklist_item(
  p_item uuid,
  p_done boolean,
  p_nota text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1
     from public.cleaning_checklist_items i
    where i.id = p_item
      and i.cleaning_id in (select private.my_writable_cleaning_ids())
      for update;

  if not found then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;

  update public.cleaning_checklist_items
     set done_at = case when p_done then now()               else null end,
         done_by = case when p_done then (select auth.uid()) else null end,
         nota    = p_nota
   where id = p_item;
end;
$$;

comment on function public.toggle_checklist_item(uuid, boolean, text) is
  'Marca o desmarca una tarea del checklist. Solo items de un aseo propio EN CURSO. Desmarcar limpia done_at y done_by: un item a medias no deja rastro de quien lo marco.';

revoke all     on function public.toggle_checklist_item(uuid, boolean, text) from public, anon;
grant  execute on function public.toggle_checklist_item(uuid, boolean, text) to authenticated;


-- ===========================================================================
-- EXPLICITAMENTE FUERA DE ALCANCE DE LA FASE 1, Y POR QUE
--
-- Para que en la Fase 6 nadie lo redescubra ni lo tome por un olvido:
--
--   report_damage()         REPORT-01  -> Fase 6
--   report_expense()        REPORT-02  -> Fase 6
--   report_missing_items()  REPORT-03  -> Fase 6
--
-- Sus requisitos estan mapeados a la Fase 6 en REQUIREMENTS.md, y su forma
-- depende del payload de notificacion y del flujo de subida de foto que se
-- definen ahi. Las tablas (`damages`, `expenses`, `missing_item_reports`,
-- `missing_item_lines`, `cleaning_photos`), sus grants y sus policies YA
-- EXISTEN: la Fase 6 solo anade las tres funciones, con el mismo patron de
-- este archivo, sin tocar el modelo de autorizacion.
--
--   cancel_cleaning()       ASEO-06, ASEO-09  -> Fase 4
--   reschedule_cleaning()   ASEO-08           -> Fase 4
--
-- Misma razon. La guarda de transiciones de `tg_cleanings_snapshot()` ya
-- admite pendiente|en_curso -> cancelada, asi que la Fase 4 no toca la maquina
-- de estados tampoco.
--
-- LA UNICA REGLA QUE NO SE PUEDE OLVIDAR AL ANADIRLAS: cada una necesita su
-- propio `revoke all on function ... from public, anon`. No se hereda. El
-- guardarrail 9 de `02_guardarrailes.test.sql` falla si se olvida.
-- ===========================================================================
