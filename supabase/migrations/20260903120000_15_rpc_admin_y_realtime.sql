-- ============================================================================
-- 15 — LAS SEIS RPC DEL ADMIN Y LA PUBLICACIÓN DE REALTIME
--
-- `cleanings` tiene `grant select` puro para `authenticated` (migración 07), y
-- admin y aseador COMPARTEN ese rol de Postgres. "Solo el admin" no existe como
-- categoría de grant: es la decisión D-16, registrada desde la Fase 1. Por eso
-- toda mutación del admin entra por una función que verifica el rol POR DENTRO,
-- consultando `profiles`, y nunca por un privilegio de tabla ni por un claim del
-- JWT.
--
-- ---------------------------------------------------------------------------
-- LAS OCHO REGLAS DE ESTE ARCHIVO. Son las de la migración 09, sin una sola
-- relajación, más las tres que la Fase 3 dejó escritas.
-- ---------------------------------------------------------------------------
--
--   1. `language plpgsql security definer set search_path = ''`
--   2. TODO nombre calificado por esquema, `auth.uid()` incluido. Con el
--      search_path vacío no hay esquema implícito más allá de pg_catalog.
--   3. Al lado de CADA definición, sin excepción:
--        revoke all     on function public.<f>(<args>) from public, anon;
--        grant  execute on function public.<f>(<args>) to authenticated;
--      NO SE HEREDA. El plan 01-07 midió dos veces en PG 17.6 que
--      `alter default privileges ... revoke execute on functions` no sirve:
--      Postgres refusiona `acldefault('f', owner)`, que siempre trae la entrada
--      `=X` de PUBLIC, así que la entrada reaparece en cada función nueva. El
--      guardarraíl 9 de `02_guardarrailes.test.sql` es la ÚNICA red, y evalúa
--      `has_function_privilege('anon', p.oid, 'execute')` sobre TODA función de
--      `public` y `private`: olvidar una sola rompe la suite entera.
--   4. Guarda de rol con `private.is_admin()`, que consulta `profiles` y exige
--      `is_active`. Un admin degradado hace un minuto no puede mutar con su
--      token todavía vivo (T-04-14). Es el mismo mecanismo medido en la Fase 2
--      para la aseadora desactivada, y la razón por la que el rol NO se lee del
--      JWT.
--   5. `select ... for update of c` sobre la fila objetivo antes de escribirla.
--      El `of c` importa: sin él, un join con `properties` bloquearía también el
--      apartamento y dos operaciones sobre aseos distintos del mismo apartamento
--      se serializarían sin ninguna necesidad.
--   6. `42501` cuando el problema es de permiso o cuando distinguir el caso sería
--      un oráculo de enumeración. `P0001` con `hint` cuando el admin SÍ está
--      autorizado y lo que falla es el estado del aseo: la UI necesita poder
--      decir "este aseo ya estaba cerrado" en vez de "no tienes permiso".
--      `mapDbError()` devuelve el `message` tal cual para P0001, así que el texto
--      ya tiene que venir redactado en español desde aquí.
--   7. `public.today_bog()` y nunca la fecha de la sesión. La sesión corre en
--      UTC: pasadas las 19:00 de Bogotá la fecha de la sesión ya es la del día
--      siguiente. `scripts/ci/check-service-role.sh` lo verifica por grep sobre
--      todas las migraciones.
--   8. NO se inserta a mano en `cleaning_state_transitions`. El trigger
--      `cleanings_log_transition` (migración 05) ya escribe la fila, y copia
--      `cancel_reason` a `reason` cuando el destino es `cancelada`. Una inserción
--      a mano produce DOS filas y la de mano es la mentirosa: lleva el `actor_id`
--      que le pongan en vez del que resuelve `auth.uid()`, y se escribe ANTES de
--      que los CHECK digan qué quedó de verdad.
--
-- ---------------------------------------------------------------------------
-- POR QUÉ ESTAS FUNCIONES NO NECESITAN NINGÚN GRANT DE TABLA
-- ---------------------------------------------------------------------------
-- Corren como `postgres`, owner de las 22 tablas de `public` y por tanto exento
-- de su RLS (ninguna lleva FORCE ROW LEVEL SECURITY). Corolario incómodo, el
-- mismo que encabeza la migración 09: aquí NO hay red de seguridad. Un `where`
-- mal escrito no da 42501, da los datos.
--
-- ---------------------------------------------------------------------------
-- INVARIANTES DE TABLA QUE ESTAS SEIS PUEDEN VIOLAR (migración 04)
-- ---------------------------------------------------------------------------
--   cleanings_one_active_per_property_date  23505  create_manual, reschedule
--   cleanings_one_live_per_reservation      23505  reschedule si conservara la
--                                                  reserva
--   cl_unmanaged_is_inert                   23514  las seis si no filtran por
--                                                  is_managed
--   cl_completada_shape                     23514  close_cleaning viniendo de
--                                                  pendiente
--   cl_cancelada_shape                      23514  cancel_cleaning
--   cl_manual_types                         23514  create_manual sin origin
--                                                  'manual'
--   guarda de transiciones                  P0001  close y cancel sobre un aseo
--                                                  ya terminal
--
-- Transiciones legales, literales en la migración 05, y que este archivo NO
-- toca:
--   pendiente  -> en_curso | completada | cancelada
--   en_curso   -> pendiente | completada | cancelada
-- El comentario de `pendiente -> completada` de la migración 05 dice ya
-- literalmente "cierre manual del admin (ASEO-08)".
--
-- El contrato ejecutable de todo este archivo es
-- `supabase/tests/06_aseos_admin.test.sql`, escrito ANTES que estas funciones.
-- A partir de esta migración, un `not ok` en ese archivo YA NO ES ESPERADO: es
-- una regresión.
-- ============================================================================


-- ===========================================================================
-- 1/6 — reassign_cleaning() — ASEO-04, D-18
--
-- Toca `cleanings.aseador_id` y NINGUNA COLUMNA MÁS. `properties.responsable_id`
-- y `properties.suplente_id` no aparecen ni en el `update` ni en el `select` de
-- esta función, Y ESA AUSENCIA ES D-18: reasignar es puntual, cambia el aseador
-- de ESE aseo y nunca el responsable fijo del apartamento.
--
-- Es la confusión más fácil de cometer y la más cara de descubrir tarde, porque
-- el síntoma no aparece en el aseo reasignado sino en TODOS los aseos futuros de
-- ese apartamento, semanas después, cuando `confirm_cleaning` empiece a
-- asignárselos a quien no toca. La aserción 14 de `06_aseos_admin.test.sql`
-- compara la fila ENTERA del apartamento contra su instantánea, con el control
-- positivo de que la reasignación sí ocurrió.
--
-- POR QUÉ LA PRECONDICIÓN DE ESTADO NO ES UNA LISTA DE ESTADOS. La condición
-- real es "no hay trabajo hecho todavía", que es más precisa que enumerar el
-- enum: un aseo con `started_at` no nulo lleva encima la hora real en que
-- EMPEZÓ OTRA PERSONA, y reasignarlo se la atribuiría a la nueva. Un aseo ya
-- empezado no se reasigna: para eso está `close_cleaning`, o el "no puedo" del
-- aseador de la Fase 6, que sí limpia `started_at`.
--
--   * `completada` queda excluido SOLO por `started_at is null`, porque
--     `cl_completada_shape` lo obliga a tener marca de inicio.
--   * `cancelada` hay que excluirlo EXPLÍCITAMENTE: un aseo cancelado desde
--     `pendiente` conserva `started_at` nulo, y sin esa condición se podría
--     reasignar un cancelado.
--   * `confirmado_at is not null` se conserva porque ASEO-03 dice que es
--     `confirm_cleaning` quien asigna en firme; un pendiente sin confirmar tiene
--     `aseador_id` nulo y no hay nada que reasignar.
--
-- LA FK NO BASTA PARA EL DESTINO. `aseador_id` referencia `profiles`, pero ni el
-- rol ni `is_active` son parte de la clave: sin la comprobación explícita se
-- puede reasignar un aseo a un admin o a alguien dado de baja. Mitiga T-04-01.
-- ===========================================================================
create or replace function public.reassign_cleaning(
  p_cleaning uuid,
  p_aseador  uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_property uuid;
begin
  if not (select private.is_admin()) then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;

  -- El destino tiene que ser una aseadora viva. Se comprueba ANTES de tocar el
  -- aseo para que el mensaje hable de la persona y no del trabajo.
  if not exists (
    select 1
      from public.profiles p
     where p.id   = p_aseador
       and p.role = 'aseador'
       and p.is_active
  ) then
    raise exception 'aseador_invalido'
      using errcode = 'P0001',
            hint    = 'La persona destino no existe, no es aseador o está desactivada. Elige una aseadora activa.';
  end if;

  select c.property_id
    into v_property
    from public.cleanings c
   where c.id            = p_cleaning
     and c.is_managed
     and c.confirmado_at is not null
     and c.started_at    is null
     and c.state is distinct from 'cancelada'
     for update of c;

  if not found then
    raise exception 'aseo_no_reasignable'
      using errcode = 'P0001',
            hint    = 'El aseo no existe, es de gestión externa, todavía no está confirmado, ya fue cancelado o ya tiene trabajo empezado.';
  end if;

  update public.cleanings
     set aseador_id = p_aseador
   where id = p_cleaning;

  -- -------------------------------------------------------------------------
  -- OUTBOX, NO ENVÍO. Misma costura conocida del ROADMAP que `confirm_cleaning`:
  -- la fila se escribe aquí y nadie la drena hasta la Fase 5. Es INTENCIONAL,
  -- no un olvido: una llamada HTTP dentro de la transacción de negocio la
  -- dejaría abierta a merced de un servicio externo.
  --
  -- El `dedupe_key` lleva el aseador, con el mismo formato que usa
  -- `confirm_cleaning`. Como la clave incluye a la persona, reasignar a OTRA
  -- produce una fila nueva y correcta, y reasignar a la MISMA no duplica.
  --
  -- El `where dedupe_key is not null` del ON CONFLICT no es opcional: replica el
  -- predicado del índice parcial `notifications_dedupe_idx`, y sin él Postgres
  -- no lo reconoce como árbitro y falla con 42P10.
  -- -------------------------------------------------------------------------
  insert into public.notifications
    (recipient_id, type, title, body, url, cleaning_id, property_id, dedupe_key)
  select p_aseador,
         'asignacion'::public.notification_type,
         'Nuevo aseo asignado',
         'Tienes un aseo asignado en ' || p.nombre || ' para el ' ||
           to_char(c.scheduled_date, 'DD/MM') || ' antes de las ' ||
           to_char(c.hora_limite, 'HH24:MI') || '.',
         '/aseos/' || p_cleaning::text,
         p_cleaning,
         v_property,
         'assign:' || p_cleaning::text || ':' || p_aseador::text
    from public.cleanings  c
    join public.properties p on p.id = c.property_id
   where c.id = p_cleaning
  on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing;
end;
$$;

comment on function public.reassign_cleaning(uuid, uuid) is
  'ASEO-04. Solo admin. Cambia el aseador de UN aseo y encola su notificación. D-18: NO toca properties.responsable_id ni properties.suplente_id, porque reasignar es puntual y no cambia el responsable fijo del apartamento. Exige aseo gestionado, confirmado, sin trabajo empezado y no cancelado, y destino con rol aseador activo.';

revoke all     on function public.reassign_cleaning(uuid, uuid) from public, anon;
grant  execute on function public.reassign_cleaning(uuid, uuid) to authenticated;


-- ===========================================================================
-- 2/6 — create_manual_cleaning() — ASEO-05
--
-- Inserta CINCO columnas y ninguna más: `property_id`, `origin = 'manual'`,
-- `tipo`, `scheduled_date`, y el `reservation_id` implícito en null.
-- `is_managed`, `state`, `hora_limite`, `tarifa_huesped` y `pago_aseador` las
-- pone `tg_cleanings_snapshot()`. Los CHECK de tabla se evalúan DESPUÉS de los
-- triggers BEFORE, así que el NOT NULL de `hora_limite` y el de `is_managed` se
-- satisfacen sin que esta función sepa nada de ellos. Es exactamente lo que hace
-- el paso (c) del sync de la migración 13.
--
-- Escribir esas columnas "para asegurarse" sería peor que redundante: congelaría
-- aquí una copia de la lógica de snapshot que la migración 05 ya es dueña de
-- cambiar.
--
-- POR QUÉ `normal` NO ES OPCIÓN: los aseos normales los crea el sync desde el
-- calendario. Dejarlo pasar abriría una segunda ruta de creación de aseos
-- normales, invisible para el reconcile.
--
-- POR QUÉ SE VALIDA EL APARTAMENTO AUNQUE EL COMBOBOX YA ESTÉ RESTRINGIDO: un
-- Server Action es un endpoint HTTP público y un combobox no autoriza nada.
-- Sin el corte por `gestion_vivaguest`, el insert llegaría al trigger, que
-- pondría `state` en null, y nacería una fila inerte que nadie pidió. Mitiga
-- T-04-04: sin la guarda de rol, un bucle crea una fila por apartamento y fecha
-- hasta agotar el free tier.
--
-- EL 23505 SE DEJA PROPAGAR, NO SE CAPTURA. Está escrito aquí para que nadie
-- "mejore" el manejo de errores después: envolver el insert en
-- `exception when unique_violation` borra el NOMBRE DEL ÍNDICE del mensaje,
-- `mapDbError()` deja de reconocerlo y el Server Action del plan 04-08, que es
-- quien tiene el nombre del apartamento y la fecha, ya no puede interpolar el
-- mensaje de ASEO-07. El admin pasa de leer "ya hay un aseo activo para Apto 101
-- el 12/09" a leer un texto genérico que no le dice dónde. La aserción 20 del
-- contrato exige el código Y el literal del índice a la vez.
--
-- EFECTO LATERAL, declarado aquí y no implementado en ningún sitio: un aseo
-- manual en la fecha de un checkout futuro hace que el sync NUNCA CREE el aseo
-- normal de ese checkout, porque su `insert ... on conflict do nothing` del paso
-- (c) choca contra `cleanings_one_active_per_property_date` y se lo traga en
-- silencio. El comentario de la migración 12 ya lo declara legítimo: "el admin
-- ya puso algo ahí y el sync no lo pisa".
-- ===========================================================================
create or replace function public.create_manual_cleaning(
  p_property uuid,
  p_fecha    date,
  p_tipo     public.cleaning_type
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not (select private.is_admin()) then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;

  if not exists (
    select 1
      from public.properties p
     where p.id = p_property
       and p.is_active
       and p.gestion_vivaguest
  ) then
    raise exception 'apartamento_no_valido'
      using errcode = 'P0001',
            hint    = 'El apartamento no existe, está inactivo o es de gestión externa. Las unidades informativas no reciben aseos.';
  end if;

  if p_tipo not in ('repaso', 'emergencia') then
    raise exception 'tipo_no_permitido'
      using errcode = 'P0001',
            hint    = 'Un aseo manual solo puede ser repaso o emergencia. Los aseos normales los crea el motor de calendario.';
  end if;

  if p_fecha < public.today_bog() then
    raise exception 'fecha_en_el_pasado'
      using errcode = 'P0001',
            hint    = 'No se programa un aseo para una fecha anterior a hoy.';
  end if;

  insert into public.cleanings (property_id, origin, tipo, scheduled_date)
  values (p_property, 'manual', p_tipo, p_fecha)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.create_manual_cleaning(uuid, date, public.cleaning_type) is
  'ASEO-05. Solo admin. Crea un aseo manual de repaso o emergencia sobre un apartamento activo y gestionado, con fecha de hoy en adelante. Escribe cinco columnas; hora_limite, tarifas, is_managed y state los pone tg_cleanings_snapshot(). NO captura el 23505 de cleanings_one_active_per_property_date: el nombre del índice tiene que viajar en el mensaje para que la UI pueda dar el error de ASEO-07.';

revoke all     on function public.create_manual_cleaning(uuid, date, public.cleaning_type) from public, anon;
grant  execute on function public.create_manual_cleaning(uuid, date, public.cleaning_type) to authenticated;


-- ===========================================================================
-- 3/6 — reschedule_cleaning() — ASEO-06
--
-- LA FUNCIÓN DE MAYOR RIESGO DE LA FASE. El `update` mueve `scheduled_date` Y
-- PONE `reservation_id` EN NULL EN LA MISMA SENTENCIA. La segunda mitad no es
-- limpieza ni descuido: es el mecanismo entero, y si alguien la borra por
-- "sobrar", el síntoma aparece treinta minutos después y en otro archivo.
--
-- POR QUÉ. El bucle de "reserva movida" de `sync_feed_apply()` (migración 13)
-- selecciona los aseos cuyo `scheduled_date` difiere del `ends_on` de SU
-- RESERVA y los cancela con `cancel_reason = 'reserva_movida'`, creando otro en
-- la fecha del checkout. Un aseo reprogramado a mano cumple ese predicado
-- EXACTAMENTE IGUAL que uno cuya reserva se movió de verdad: para el sync, "el
-- aseo no está donde dice la reserva" tiene una sola explicación. El trabajo del
-- admin desaparecería solo, en la siguiente corrida.
--
-- Desapuntar la reserva saca el aseo de LAS TRES RUTAS DESTRUCTIVAS del
-- reconcile, que sin excepción se anclan a `reservation_id`:
--   * la cancelación por desaparición  (`c.reservation_id = any (v_ausentes_confirmadas)`)
--   * el bucle de reserva movida       (`join calendar_reservations r on r.id = c.reservation_id`)
--   * el re-apuntado de la migración 12
-- El recálculo de `is_urgent` SÍ SIGUE ACTUANDO, y eso es lo correcto: recalcula
-- la urgencia contra la fecha nueva.
--
-- LA CONSECUENCIA ACEPTADA, escrita para que no se descubra como sorpresa: el
-- paso (c) del siguiente sync creará un aseo NUEVO en la fecha del checkout
-- real, porque ya no hay ningún aseo vivo apuntando a esa reserva. Reprogramar
-- produce dos aseos: el que el admin movió, y uno sin confirmar en la fecha del
-- checkout, que cae en la bandeja donde el admin lo ve y lo cancela en diez
-- segundos si sobra. Es la asimetría declarada del proyecto: UN ASEO DE MÁS LO
-- REVISA UN HUMANO; UN ASEO DE MENOS DEJA A LA ASEADORA EN LA CALLE.
--
-- LA ALTERNATIVA DESCARTADA, con su razón, para que no se reabra: poner
-- `origin = 'manual'` sacaría el aseo de todos los filtros del reconcile
-- conservando la reserva, y produciría exactamente un aseo. Pero si el admin
-- reprograma por error y no lo deshace, el día del checkout real se queda SIN
-- ASEO y nada vuelve a generarlo. Además `is_urgent` dejaría de recalcularse y
-- `origin` mentiría sobre la procedencia del aseo.
--
-- El 23505 se deja propagar igual que en `create_manual_cleaning`, y por la
-- misma razón: el UI-SPEC pone ese error INLINE bajo el campo de fecha, y para
-- eso el Server Action tiene que reconocer el índice por su nombre.
--
-- `is_managed` se exige porque un aseo de gestión externa lo reprograma el sync
-- solo, por la rama `if not mv.is_managed` de la migración 13. Mitiga T-04-05.
-- ===========================================================================
create or replace function public.reschedule_cleaning(
  p_cleaning uuid,
  p_fecha    date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fecha_actual date;
begin
  if not (select private.is_admin()) then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;

  -- Misma condición y misma razón que en `reassign_cleaning`: "no hay trabajo
  -- hecho todavía" es más preciso que enumerar el enum, y `cancelada` hay que
  -- excluirlo aparte porque conserva la marca de inicio en nulo.
  select c.scheduled_date
    into v_fecha_actual
    from public.cleanings c
   where c.id = p_cleaning
     and c.is_managed
     and c.started_at is null
     and c.state is distinct from 'cancelada'
     for update of c;

  if not found then
    raise exception 'aseo_no_reprogramable'
      using errcode = 'P0001',
            hint    = 'El aseo no existe, es de gestión externa, ya fue cancelado o ya tiene trabajo empezado.';
  end if;

  if p_fecha < public.today_bog() then
    raise exception 'fecha_en_el_pasado'
      using errcode = 'P0001',
            hint    = 'No se reprograma un aseo a una fecha anterior a hoy.';
  end if;

  if p_fecha = v_fecha_actual then
    raise exception 'fecha_sin_cambio'
      using errcode = 'P0001',
            hint    = 'El aseo ya está programado para esa fecha.';
  end if;

  update public.cleanings
     set scheduled_date = p_fecha,
         reservation_id = null
   where id = p_cleaning;
end;
$$;

comment on function public.reschedule_cleaning(uuid, date) is
  'ASEO-06. Solo admin. Mueve el aseo de fecha Y DESAPUNTA SU RESERVA en la misma sentencia: sin reservation_id el aseo sale de las tres rutas destructivas del reconcile, que sin excepción se anclan a la reserva, y el sync no puede deshacer la reprogramación. Consecuencia aceptada: el siguiente sync creará un aseo nuevo, sin confirmar, en la fecha del checkout real. NO captura el 23505 del índice de unicidad.';

revoke all     on function public.reschedule_cleaning(uuid, date) from public, anon;
grant  execute on function public.reschedule_cleaning(uuid, date) to authenticated;


-- ===========================================================================
-- 4/6 — close_cleaning() — ASEO-08
--
-- El cierre manual del admin: el aseo ocurrió por fuera del sistema y hay que
-- dejar la operación cuadrada. Es LITERALMENTE EL BYPASS DE `finish_cleaning`,
-- sin checklist y sin fotos, y por eso su guarda de rol es la amenaza más
-- concreta de la fase (T-04-03): un aseador que pudiera invocarla daría su
-- propio aseo por terminado sin haber hecho nada. Esa guarda no admite ninguna
-- relajación, ni siquiera "temporal para probar".
--
-- `started_at = coalesce(started_at, now())` NO ES DEFENSIVO, ES OBLIGATORIO, y
-- tiene que ser exactamente eso y no una asignación directa:
--
--   * `cl_completada_shape` exige `started_at` y `finished_at` no nulos con
--     `finished_at >= started_at`. Un aseo `pendiente` no tiene marca de inicio,
--     así que un `set state = 'completada', finished_at = now()` a secas revienta
--     con 23514. El cierre desde `pendiente` es la única ruta que se salta
--     `start_cleaning`, y el CHECK no se relajó para ella.
--   * Si el aseo venía de `en_curso`, su `started_at` REAL es la hora a la que la
--     aseadora empezó: es información, es la única evidencia de cuánto duró el
--     trabajo, y no se pisa.
--
-- Dentro de una MISMA SENTENCIA `now()` es constante de transacción, así que las
-- dos marcas salen iguales cuando el aseo venía de `pendiente` y la desigualdad
-- del CHECK se cumple por igualdad. Un refactor a la función de reloj no
-- congelada rompería el CHECK en el borde. Está anotado porque el síntoma sería
-- un 23514 intermitente.
--
-- AQUÍ SÍ SE ENUMERAN LOS DOS ESTADOS, y no se usa `started_at is null` como en
-- las dos funciones anteriores: cerrar un aseo EN CURSO es precisamente el caso
-- central de ASEO-08. Sobre un `completada` o `cancelada` la guarda de
-- transiciones del trigger levantaría su propio P0001, pero su `hint` habla de
-- la máquina de estados: correcto para un desarrollador, inútil para el admin.
-- Se corta antes con un mensaje que hable de su caso.
--
-- `cl_completada_shape` NO exige `aseador_id`, así que cerrar un aseo sin
-- confirmar y sin aseador es válido en el schema y se permite a propósito: es
-- coherente con el copy del diálogo, "úsalo solo cuando el aseo ya ocurrió por
-- fuera del sistema".
--
-- NO ENCOLA NINGUNA NOTIFICACIÓN, y es decisión y no olvido: el aseo se cierra
-- porque la realidad ya lo resolvió por fuera del sistema, y avisar "terminaste"
-- a quien no ejecutó nada es ruido en el panel de alertas, que se alimenta de
-- esa misma tabla. La aserción 30 del contrato lo vigila contando filas.
-- ===========================================================================
create or replace function public.close_cleaning(p_cleaning uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_admin()) then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;

  perform 1
     from public.cleanings c
    where c.id = p_cleaning
      and c.is_managed
      and c.state in ('pendiente', 'en_curso')
      for update of c;

  if not found then
    raise exception 'aseo_no_cerrable'
      using errcode = 'P0001',
            hint    = 'El aseo no existe, es de gestión externa, o ya está cerrado o cancelado.';
  end if;

  update public.cleanings
     set state       = 'completada',
         finished_at = now(),
         started_at  = coalesce(started_at, now())
   where id = p_cleaning;
end;
$$;

comment on function public.close_cleaning(uuid) is
  'ASEO-08. Solo admin. Cierra a mano un aseo pendiente o en curso cuando el trabajo ya ocurrió por fuera del sistema. started_at = coalesce(started_at, now()) es obligatorio: cl_completada_shape exige marca de inicio y un aseo pendiente no la tiene, y un aseo en curso conserva la suya, que es la hora real en que empezó el trabajo. NO encola notificación, a propósito.';

revoke all     on function public.close_cleaning(uuid) from public, anon;
grant  execute on function public.close_cleaning(uuid) to authenticated;


-- ===========================================================================
-- 5/6 — cancel_cleaning() — ASEO-09
--
-- EL SLUG ES LITERAL DENTRO DEL CUERPO, NUNCA UN PARÁMETRO. Es la regla de la
-- migración 13 y su razón es doble: `cancel_reason` es una columna que un HUMANO
-- LEE EN PANTALLA, y aceptarla como parámetro abriría una ruta de texto libre
-- hacia el payload de notificaciones (T-04-12). Por eso el diálogo de cancelar
-- tampoco tiene textarea de motivo. La aserción 36 del contrato lee el cuerpo de
-- las seis funciones con `pg_get_functiondef` y exige cero asignaciones de
-- `cancel_reason` desde un parámetro; ninguna aserción de comportamiento puede
-- defender esa capa, porque una RPC con `p_motivo text` las dejaría todas verdes.
--
-- Lista cerrada completa de `cancel_reason` en el sistema:
--   'reserva_desaparecida'   la escribe la migración 13
--   'reserva_movida'         la escribe la migración 13
--   'cancelado_por_admin'    la escribe esta función
--
-- NO se inserta nada en `cleaning_state_transitions`: el trigger
-- `cleanings_log_transition` copia `cancel_reason` a `reason` cuando el destino
-- es `cancelada`. La aserción 32 exige EXACTAMENTE una fila con ese motivo.
--
-- SIN "DESHACER": `cancelada` es terminal por la guarda de transiciones, y
-- reactivar no es una operación que exista. Para volver a operar el apartamento
-- se crea un aseo nuevo. Mitiga T-04-02.
-- ===========================================================================
create or replace function public.cancel_cleaning(p_cleaning uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_admin()) then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;

  perform 1
     from public.cleanings c
    where c.id = p_cleaning
      and c.is_managed
      and c.state in ('pendiente', 'en_curso')
      for update of c;

  if not found then
    raise exception 'aseo_no_cancelable'
      using errcode = 'P0001',
            hint    = 'El aseo no existe, es de gestión externa, o ya está completado o cancelado.';
  end if;

  update public.cleanings
     set state         = 'cancelada',
         cancelled_at  = now(),
         cancel_reason = 'cancelado_por_admin'
   where id = p_cleaning;
end;
$$;

comment on function public.cancel_cleaning(uuid) is
  'ASEO-09. Solo admin. Cancela un aseo pendiente o en curso escribiendo el slug literal cancelado_por_admin, que nunca llega por parámetro: cancel_reason es lista cerrada porque un humano la lee en pantalla. La bitácora la escribe el trigger cleanings_log_transition, no esta función. No hay deshacer: cancelada es terminal.';

revoke all     on function public.cancel_cleaning(uuid) from public, anon;
grant  execute on function public.cancel_cleaning(uuid) to authenticated;


-- ===========================================================================
-- 6/6 — clear_review_flag()
--
-- La sexta. No la nombra ningún requisito, y existe porque la migración 13
-- promete literalmente que `needs_review` es pegajoso y que "solo el admin lo
-- apaga, en la Fase 4", mientras el UI-SPEC ya renderiza la señal sin ninguna
-- acción que la apague. Sin esta función esa frase queda incumplida y la marca
-- se enciende para siempre.
--
-- SE APAGAN LAS DOS COLUMNAS. Dejar `review_reason` con el slug de un motivo ya
-- atendido es peor que dejarlo en null: la UI lo renderizaría como una
-- explicación vigente de algo que el admin ya resolvió.
--
-- SOBRE UN ASEO YA REVISADO ES UN NO-OP DE VERDAD, no un error y tampoco un
-- update que no cambia nada. Levantar ahí sería castigar el doble clic y la
-- recarga de la página, que es exactamente lo que va a pasar en el panel de
-- alertas. Y tiene que ser un no-op de VERDAD porque
-- `tg_cleanings_snapshot()` mueve `updated_at` ante CUALQUIER escritura: un
-- update que pone en falso algo que ya era falso manda, con Realtime encima, un
-- evento por la red que reordena la pantalla del admin sin que nada haya
-- cambiado. Por eso la escritura va detrás de un `if` y no de un `coalesce`.
-- La aserción 35 compara la fila entera, `updated_at` incluido.
-- ===========================================================================
create or replace function public.clear_review_flag(p_cleaning uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_marcado boolean;
  v_motivo  text;
begin
  if not (select private.is_admin()) then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;

  select c.needs_review, c.review_reason
    into v_marcado, v_motivo
    from public.cleanings c
   where c.id = p_cleaning
     and c.is_managed
     for update of c;

  if not found then
    raise exception 'aseo_no_revisable'
      using errcode = 'P0001',
            hint    = 'El aseo no existe o es de gestión externa.';
  end if;

  if v_marcado or v_motivo is not null then
    update public.cleanings
       set needs_review  = false,
           review_reason = null
     where id = p_cleaning;
  end if;
end;
$$;

comment on function public.clear_review_flag(uuid) is
  'Solo admin. Apaga la marca de revisión de un aseo gestionado y borra su motivo. Cierra el lazo que la migración 13 dejó escrito: needs_review es pegajoso y solo el admin lo apaga. Sobre un aseo ya revisado es un no-op silencioso que ni siquiera escribe, para no mover updated_at ni emitir un evento de Realtime sin cambio.';

revoke all     on function public.clear_review_flag(uuid) from public, anon;
grant  execute on function public.clear_review_flag(uuid) to authenticated;

