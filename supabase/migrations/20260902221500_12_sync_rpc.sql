-- ============================================================================
-- 12 — sync_feed_apply(): la MITAD ADITIVA del diff, en una sola transacción
--
-- `supabase-js` no expone transacciones. Un diff hecho con cuatro
-- `.from().upsert()` deja, cuando el tercero falla, aseos cancelados sin sus
-- reemplazos creados: literalmente el peor estado posible de este sistema. Un
-- RPC lo hace imposible por construcción.
--
-- LOS NUEVE PASOS DEL DIFF, EN ORDEN. El orden no es estético: es la diferencia
-- entre "sobra un aseo" y "falta un aseo". Esta migración implementa
-- (a) (b) (c) (d) (f) e (i). Los tres que faltan NO faltan por descuido:
--
--   (a) upsert de observaciones ............................ ESTA migración
--   (b) marcar ausencias, nunca borrar ..................... ESTA migración
--   (c) crear los aseos que faltan, aditivo ................ ESTA migración
--   (d) re-apuntar reservation_id .......................... ESTA migración
--   (e) cancelar aseos huérfanos, con los tres candados .... migración 13
--   (f) recalcular is_urgent ............................... ESTA migración
--   (g) detectar extensión sospechosa (R1 / R2) ............ migración 13
--   (h) notificaciones ..................................... migración 13
--   (i) salud del feed + fila de la corrida ................ ESTA migración
--
-- La migración 13 llega por `create or replace` sobre esta misma función y
-- añade (e), (g) y (h) en su sitio del orden. Quien lea esta versión intermedia
-- no debe "completarla": `cleanings_cancelled` y `reviews_flagged` se escriben
-- en cero A PROPÓSITO.
--
-- ---------------------------------------------------------------------------
-- LO QUE ESTA FUNCIÓN NO REIMPLEMENTA, y no debe reimplementar:
--
--   * `tg_cleanings_snapshot()` (migración 05) rellena `is_managed`,
--     `hora_limite`, `state` y las dos tarifas al insertar un aseo, reimpone
--     `is_managed` al actualizar y rechaza con P0001 toda transición fuera de
--     la máquina de estados. `service_role` tiene BYPASSRLS; NO tiene "bypass
--     triggers". Escribir esas columnas aquí sería duplicar la Fase 1 y además
--     abriría la puerta a que las dos copias divergieran.
--   * `cleanings_one_active_per_property_date` y
--     `cleanings_one_live_per_reservation` (migración 04) son los que dan la
--     idempotencia. Por eso el paso (c) es `on conflict do nothing` y NO un
--     `select ... if exists ... insert`: la comprobación en dos pasos tiene
--     carrera y el índice no.
--   * `cal_res_sin_descripcion` (migración 11) rechaza con 23514 cualquier
--     escritura de la descripción cruda. Esta función no la nombra. Doble capa.
--
-- ---------------------------------------------------------------------------
-- LAS DOS LÍNEAS DE `where` QUE NINGÚN DOCUMENTO DE RESEARCH PEDÍA, y que están
-- en el paso (d) y en el paso (f):
--
--   * `origin = 'ical'` — el reconcile NUNCA toca un aseo creado a mano. Un
--     `repaso` o una `emergencia` que puso el admin no son del sync; re-apuntarlos
--     o recalcularlos sería destruir trabajo humano.
--   * `and c.is_managed` — sin él, el recalculo de urgencia revienta con 23514
--     sobre `cl_unmanaged_is_inert`, que exige `is_urgent is false` cuando la
--     unidad es de gestión externa. Hay CINCO en la semilla: no es hipotético,
--     es un fallo garantizado en la primera corrida real.
--
-- ---------------------------------------------------------------------------
-- POR QUÉ LA SALUD DEL FEED SE ESCRIBE DENTRO DE ESTA MISMA TRANSACCIÓN:
-- si viviera fuera, un worker que muere entre el commit del diff y la escritura
-- de salud dejaría el feed diffeado pero con `last_success_at` viejo, y el
-- watchdog alertaría de un feed sano. Solo la escritura de salud del FALLO vive
-- fuera, y no puede vivir dentro por definición: la transacción que falló se
-- revirtió.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- p_http_status: DIVERGENCIA respecto a la firma de cinco parámetros del plan.
--
-- El plan pide escribir `calendar_feeds.last_http_status` y
-- `feed_sync_runs.http_status`, y ninguno de los cinco parámetros de su firma
-- trae ese dato. Sin el sexto parámetro las dos columnas quedarían nulas
-- siempre y el diagnóstico del admin en la Fase 4 no distinguiría un 200 de un
-- 200-con-cuerpo-raro. Lleva `default 200` para que la llamada de cinco
-- argumentos que el plan describe siga siendo válida: la firma del plan es un
-- subconjunto invocable de esta, no un contrato roto.
-- ---------------------------------------------------------------------------
create or replace function public.sync_feed_apply(
  p_feed_id      uuid,
  p_events       jsonb,
  p_fetched_at   timestamptz,
  p_etag         text,
  p_payload_hash text,
  p_http_status  int default 200
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_feed      public.calendar_feeds%rowtype;
  v_property  uuid;

  ev          record;

  -- Datos del evento en curso, ya validados.
  v_starts    date;
  v_ends      date;
  v_fecha_ok  boolean;

  -- Emparejamiento.
  v_res_id      uuid;
  v_uid_actual  text;
  v_por_codigo  boolean;
  v_omitido     boolean;

  -- Reservas tocadas en esta corrida. Es la lista contra la que el paso (b)
  -- decide quién está ausente. Con ~15 eventos por feed, un array es más
  -- barato y más legible que una tabla temporal.
  v_vistas    uuid[] := '{}'::uuid[];

  -- Contadores de la corrida. Son el contrato de retorno del worker.
  v_event_count       int := 0;
  v_reservation_count int := 0;
  v_block_count       int := 0;
  v_unknown_count     int := 0;
  v_uid_rotations     int := 0;
  v_res_inserted      int := 0;
  v_res_updated       int := 0;
  v_disappeared       int := 0;
  v_cleanings_created int := 0;
  v_relinked          int := 0;

  v_min_ends_on date;
  v_max_ends_on date;

  v_run_id bigint;
begin
  -- `into strict`: si el feed no existe revienta aquí con P0002 y con el id a
  -- la vista, en vez de escribir cero filas y devolver un "ok" mentiroso.
  select * into strict v_feed from public.calendar_feeds where id = p_feed_id;

  -- T-03-31. El apartamento sale de la FILA DEL FEED, nunca de un id que venga
  -- en el cuerpo de la petición. Es lo que impide que un feed escriba aseos de
  -- otro apartamento aunque el worker esté comprometido.
  v_property := v_feed.property_id;

  -- =========================================================================
  -- (a) UPSERT DE OBSERVACIONES — la jerarquía de identidad, dos niveles
  -- =========================================================================
  -- NIVEL 1  (feed_id, reservation_code)  -> misma reserva; si el uid difiere,
  --                                          el UID rotó y SE CUENTA.
  -- NIVEL 2  (feed_id, uid)               -> misma reserva; se actualizan fechas.
  -- si no                                 -> reserva nueva.
  --
  -- NIVEL 3 NO EXISTE. El emparejamiento por solapamiento de fechas queda
  -- fuera de la identidad por decisión explícita: no puede distinguir "la
  -- reserva se movió" de "es otra reserva", y el único desenlace de equivocarse
  -- es re-apuntar un aseo a una reserva que no es la suya, en silencio.
  --
  -- El contador `uid_rotations` NO es telemetría decorativa: es el instrumento
  -- que contesta empíricamente si el identificador de evento de Airbnb
  -- sobrevive a un cambio de fechas, pregunta que lleva dos documentos de
  -- research en disputa y que ninguna fixture puede resolver.
  for ev in
    select e.value ->> 'uid'             as uid,
           e.value ->> 'reservationCode' as codigo,
           e.value ->> 'summary'         as summary,
           e.value ->> 'startsOn'        as starts_txt,
           e.value ->> 'endsOn'          as ends_txt,
           e.value ->> 'clasificacion'   as clasificacion,
           e.value ->> 'payloadHash'     as payload_hash
      from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) as e(value)
  loop
    v_event_count := v_event_count + 1;

    -- El bloqueo se cuenta y se va: no genera aseo y no toca ninguna reserva.
    if ev.clasificacion = 'bloqueo' then
      v_block_count := v_block_count + 1;
      continue;
    end if;

    -- El normalizador (plan 03-02) ya deja `startsOn`/`endsOn` nulos cuando el
    -- evento no es interpretable, y un evento con fecha nula nunca clasifica
    -- 'reserva'. Esto es la segunda red: una fecha malformada que llegara igual
    -- abortaría la corrida entera al castear, y una anomalía de UNA fila no
    -- puede tumbar el diff de las otras catorce.
    v_starts   := null;
    v_ends     := null;
    v_fecha_ok := true;
    begin
      v_starts := nullif(ev.starts_txt, '')::date;
      v_ends   := nullif(ev.ends_txt, '')::date;
    exception when data_exception then
      v_fecha_ok := false;
    end;

    -- Falla CERRADO: todo lo que no es un 'reserva' bien formado cuenta como
    -- desconocido y NO genera aseo. `ends_on > starts_on` es `res_dates_ok`,
    -- y `payload_hash` es NOT NULL: violarlos abortaría la transacción.
    if ev.clasificacion is distinct from 'reserva'
       or not v_fecha_ok
       or ev.uid is null
       or ev.payload_hash is null
       or v_starts is null
       or v_ends is null
       or v_ends <= v_starts
    then
      v_unknown_count := v_unknown_count + 1;
      continue;
    end if;

    v_reservation_count := v_reservation_count + 1;
    v_min_ends_on := least(v_min_ends_on, v_ends);
    v_max_ends_on := greatest(v_max_ends_on, v_ends);

    v_res_id     := null;
    v_uid_actual := null;
    v_por_codigo := false;

    -- NIVEL 1. Lo sirve `cal_res_feed_code_idx` (migración 11). No hay unicidad
    -- sobre (feed_id, reservation_code), así que el orden hace determinista
    -- cuál gana si alguna vez hubiera dos.
    if ev.codigo is not null then
      select r.id, r.uid
        into v_res_id, v_uid_actual
        from public.calendar_reservations r
       where r.feed_id = p_feed_id
         and r.reservation_code = ev.codigo
       order by r.first_seen_at, r.id
       limit 1;
      v_por_codigo := v_res_id is not null;
    end if;

    -- NIVEL 2. `calendar_reservations_feed_uid_uniq` garantiza como mucho una.
    if v_res_id is null then
      select r.id, r.uid
        into v_res_id, v_uid_actual
        from public.calendar_reservations r
       where r.feed_id = p_feed_id
         and r.uid = ev.uid;
    end if;

    v_omitido := false;

    if v_res_id is not null then

      -- El UID rotó: mismo código de negocio, otro identificador de evento.
      -- Solo puede detectarse por el nivel 1; por el nivel 2 el uid es igual
      -- por construcción.
      if v_por_codigo and v_uid_actual is distinct from ev.uid then
        v_uid_rotations := v_uid_rotations + 1;
      end if;

      -- `ends_on_anterior = ends_on` guarda el valor VIEJO: en un UPDATE todas
      -- las expresiones del SET leen la fila antigua. Es lo que permite a la
      -- regla R2 del plan 03-05 distinguir un turnover del mismo día sano de
      -- una extensión sospechosa.
      --
      -- NO se escribe `raw_description`: `cal_res_sin_descripcion` lo rechazaría
      -- con 23514, que es exactamente lo que se quiere.
      begin
        update public.calendar_reservations r
           set uid              = ev.uid,
               reservation_code = coalesce(ev.codigo, r.reservation_code),
               ends_on_anterior = r.ends_on,
               starts_on        = v_starts,
               ends_on          = v_ends,
               summary          = ev.summary,
               payload_hash     = ev.payload_hash,
               last_seen_at     = p_fetched_at,
               disappeared_at   = null
         where r.id = v_res_id;
      exception when unique_violation then
        -- El uid nuevo ya lo tiene otra fila del mismo feed. Solo puede pasar
        -- si dos códigos distintos comparten uid, que sería una anomalía dura
        -- de Airbnb. Se cuenta como desconocido y se sigue: NO se aborta la
        -- corrida entera por una anomalía de una fila.
        v_omitido := true;
      end;

      if v_omitido then
        v_reservation_count := v_reservation_count - 1;
        v_unknown_count     := v_unknown_count + 1;
        continue;
      end if;

      v_res_updated := v_res_updated + 1;

    else

      begin
        insert into public.calendar_reservations
          (feed_id, property_id, uid, reservation_code,
           starts_on, ends_on, summary, payload_hash,
           first_seen_at, last_seen_at)
        values
          (p_feed_id, v_property, ev.uid, ev.codigo,
           v_starts, v_ends, ev.summary, ev.payload_hash,
           p_fetched_at, p_fetched_at)
        returning id into v_res_id;
      exception when unique_violation then
        v_omitido := true;
      end;

      if v_omitido then
        v_reservation_count := v_reservation_count - 1;
        v_unknown_count     := v_unknown_count + 1;
        continue;
      end if;

      v_res_inserted := v_res_inserted + 1;

    end if;

    v_vistas := v_vistas || v_res_id;
  end loop;

  -- =========================================================================
  -- (b) MARCAR AUSENCIAS — marcar, NUNCA borrar
  -- =========================================================================
  -- `delete` está prohibido sobre `calendar_reservations` en todo el pipeline:
  -- el feed puede venir vacío por un fallo del proveedor, y una lectura mala no
  -- puede borrar historia.
  --
  -- Las que YA tenían `disappeared_at` no se tocan: la segunda ausencia
  -- consecutiva es lo que habilita la cancelación, y esa cancelación es del
  -- plan 03-05. Reescribir la marca en cada corrida borraría el hecho de que
  -- esta es la segunda vez.
  update public.calendar_reservations r
     set disappeared_at = p_fetched_at
   where r.feed_id = p_feed_id
     and r.disappeared_at is null
     and r.id <> all (v_vistas);
  get diagnostics v_disappeared = row_count;

  -- =========================================================================
  -- (c) CREAR LOS ASEOS QUE FALTAN — aditivo y con on conflict
  -- =========================================================================
  -- `scheduled_date = ends_on`, SIN SUMAR NI RESTAR NADA. El DTEND del VEVENT
  -- de día completo es EXCLUSIVO en el formato y coincide exactamente con el
  -- día en que el calendario libera el apartamento: una reserva que empieza el
  -- 3 y termina el 4 tiene checkout el 4. Restar un día es mandar a la aseadora
  -- con el huésped todavía dentro.
  --
  -- Se insertan CINCO columnas y ninguna más. `is_managed`, `state`,
  -- `hora_limite`, `tarifa_huesped` y `pago_aseador` las pone
  -- `tg_cleanings_snapshot()`; los CHECK de tabla se evalúan DESPUÉS de los
  -- triggers BEFORE, así que el NOT NULL de `hora_limite` y de `is_managed` se
  -- satisface sin que esta función sepa nada de ellos.
  --
  -- `on conflict do nothing` sin destino cubre los DOS índices únicos
  -- parciales. Un choque con un aseo manual preexistente en esa fecha es
  -- LEGÍTIMO y esperado, no un error: el admin ya puso algo ahí y el sync no lo
  -- pisa.
  --
  -- El `distinct on (ends_on)` no es decorativo: dos reservas vivas del mismo
  -- feed que terminan el mismo día chocarían entre sí DENTRO de la misma
  -- sentencia. Elegir una de forma determinista deja el resultado estable entre
  -- corridas; la otra se re-apunta o no en el paso (d), que es donde esa
  -- decisión se puede razonar.
  with candidatas as (
    select distinct on (r.ends_on) r.id, r.ends_on
      from public.calendar_reservations r
     where r.feed_id = p_feed_id
       and r.disappeared_at is null
     order by r.ends_on, r.first_seen_at, r.id
  ), nuevas as (
    insert into public.cleanings
      (property_id, reservation_id, origin, tipo, scheduled_date)
    select v_property, c.id, 'ical', 'normal'::public.cleaning_type, c.ends_on
      from candidatas c
    on conflict do nothing
    returning 1
  )
  -- Se cuentan los INSERTADOS de verdad, no los intentados.
  select count(*)::int into v_cleanings_created from nuevas;

  -- =========================================================================
  -- (d) RE-APUNTAR reservation_id — es lo que preserva el trabajo humano
  -- =========================================================================
  -- LA IDENTIDAD DEL ASEO ES (property_id, scheduled_date), NO LA RESERVA.
  -- Si Airbnb cancela una reserva y la rehace con uid y código nuevos para las
  -- mismas fechas, el aseo NO se toca: solo se re-apunta su `reservation_id`.
  -- La confirmación del admin, el aseador asignado, el número de huéspedes y
  -- las instrucciones sobreviven al ruido de la fuente. Esto vale igual si el
  -- UID de Airbnb resulta estable y si resulta que rota, y es lo que le quita a
  -- esa pregunta el carácter de bloqueante.
  --
  --   * `origin = 'ical'`: el sync no re-apunta un aseo que creó el admin.
  --   * `state is distinct from 'cancelada'` y nunca el operador de
  --     desigualdad: con `<>` la fila informativa (state nulo) se saldría del
  --     predicado en silencio y además sale Seq Scan.
  --   * el `not exists` respeta `cleanings_one_live_per_reservation`: si la
  --     reserva ya tiene otro aseo vivo apuntándola, NO se re-apunta. Esa
  --     colisión es la que el plan 03-05 marca con `needs_review`.
  with candidatas as (
    select distinct on (r.ends_on) r.id, r.ends_on
      from public.calendar_reservations r
     where r.feed_id = p_feed_id
       and r.disappeared_at is null
     order by r.ends_on, r.first_seen_at, r.id
  )
  update public.cleanings c
     set reservation_id = cand.id
    from candidatas cand
   where c.property_id    = v_property
     and c.scheduled_date = cand.ends_on
     and c.origin         = 'ical'
     and c.state is distinct from 'cancelada'
     and c.reservation_id is distinct from cand.id
     and not exists (
       select 1
         from public.cleanings c2
        where c2.reservation_id = cand.id
          and c2.state is distinct from 'cancelada'
          and c2.id <> c.id);
  get diagnostics v_relinked = row_count;

  -- =========================================================================
  -- (f) RECALCULAR is_urgent — recalcular, NUNCA acumular
  -- =========================================================================
  -- La urgencia es un HECHO DERIVADO del feed, no un evento: si la reserva
  -- entrante se mueve, la urgencia tiene que APAGARSE SOLA. Por eso es
  -- `set is_urgent = exists (...)` y no un `set is_urgent = true` condicional.
  --
  -- Las cinco condiciones del `where`, y cada una tapa un agujero concreto:
  --   1. `property_id` = el del feed: un feed no toca aseos de otro apartamento.
  --   2. `origin = 'ical'`: EL RECONCILE NO TOCA NUNCA UN ASEO MANUAL. Un
  --      `repaso` o una `emergencia` creados por el admin no son del sync.
  --   3. `state is distinct from 'cancelada'`.
  --   4. `and c.is_managed`: SIN ESTO REVIENTA CON 23514 sobre
  --      `cl_unmanaged_is_inert`, que exige urgencia falsa cuando la unidad es
  --      de gestión externa. Hay cinco en la semilla.
  --   5. `scheduled_date >= public.today_bog()`: no tiene sentido recalcular el
  --      pasado, y `today_bog()` y no la función de fecha de sesión porque la
  --      sesión corre en UTC y después de las 19:00 de Bogotá ya sería mañana.
  --
  -- La condición es: existe una reserva viva del mismo apartamento cuyo
  -- `starts_on` coincide con el `scheduled_date` del aseo. Es decir, checkout y
  -- checkin el mismo día. El feed real trae exactamente ese caso el 2026-10-10.
  --
  -- La reserva entrante se busca por `property_id` y no por `feed_id`: con
  -- varios proveedores por apartamento, el checkin que hace urgente el aseo
  -- puede venir de otro feed.
  update public.cleanings c
     set is_urgent = exists (
           select 1
             from public.calendar_reservations r
            where r.property_id = c.property_id
              and r.disappeared_at is null
              and r.starts_on = c.scheduled_date)
   where c.property_id = v_property
     and c.origin = 'ical'
     and c.state is distinct from 'cancelada'
     and c.is_managed
     and c.scheduled_date >= public.today_bog();

  -- =========================================================================
  -- (i) SALUD DEL FEED Y FILA DE LA CORRIDA — dentro de esta transacción
  -- =========================================================================
  update public.calendar_feeds f
     set last_success_at      = p_fetched_at,
         last_attempt_at      = p_fetched_at,
         last_etag            = p_etag,
         last_payload_hash    = p_payload_hash,
         last_http_status     = p_http_status,
         last_error           = null,
         consecutive_failures = 0,
         next_sync_at         = now() + interval '30 minutes',
         claimed_at           = null,
         -- El piso de ESTA corrida. Comparado con el de la anterior, un salto
         -- de un día es el borde normal de la ventana de Airbnb; un salto de
         -- trece significa que el proveedor tiró un bloque de historia o que la
         -- URL cambió de anuncio.
         last_min_ends_on     = v_min_ends_on,
         -- OJO: ES EL NÚMERO DE RESERVAS CLASIFICADAS, NO DE EVENTOS. Es una
         -- costura del plan 02-14 y no se puede redefinir: la pantalla de
         -- "Conectar calendario" muestra este número como la verificación
         -- humana de que el link es el del apartamento correcto, y además es el
         -- operando de la guarda de colapso del plan 03-06. Cambiar su
         -- significado rompe las dos cosas a la vez.
         last_event_count     = v_reservation_count
   where f.id = p_feed_id;

  -- `min_ends_on` se calcula sobre las RESERVAS clasificadas de esta corrida,
  -- no sobre todos los eventos: es el candado que hace seguro el reconcile
  -- destructivo del plan 03-05 sin necesidad de saber dónde está el borde de la
  -- ventana de Airbnb, y es la serie temporal que en dos o tres días contesta
  -- si la reserva que termina hoy desaparece hoy mismo o mañana. Un bloqueo del
  -- propietario que llegara con una fecha más baja movería el piso hacia abajo
  -- y el candado dejaría de proteger nada.
  insert into public.feed_sync_runs
    (feed_id, outcome, http_status,
     event_count, reservation_count, block_count, unknown_count,
     min_ends_on, max_ends_on,
     cleanings_created, cleanings_cancelled, reviews_flagged, uid_rotations,
     finished_at)
  values
    (p_feed_id, 'ok', p_http_status,
     v_event_count, v_reservation_count, v_block_count, v_unknown_count,
     v_min_ends_on, v_max_ends_on,
     -- Los dos ceros son de la migración 13, no un olvido de esta.
     v_cleanings_created, 0, 0, v_uid_rotations,
     now())
  returning id into v_run_id;

  return jsonb_build_object(
    'run_id',                   v_run_id,
    'feed_id',                  p_feed_id,
    'property_id',              v_property,
    'outcome',                  'ok',
    'event_count',              v_event_count,
    'reservation_count',        v_reservation_count,
    'block_count',              v_block_count,
    'unknown_count',            v_unknown_count,
    'min_ends_on',              v_min_ends_on,
    'max_ends_on',              v_max_ends_on,
    'reservations_inserted',    v_res_inserted,
    'reservations_updated',     v_res_updated,
    'reservations_disappeared', v_disappeared,
    'cleanings_created',        v_cleanings_created,
    'cleanings_relinked',       v_relinked,
    'cleanings_cancelled',      0,
    'reviews_flagged',          0,
    'uid_rotations',            v_uid_rotations
  );
end;
$$;

comment on function public.sync_feed_apply(uuid, jsonb, timestamptz, text, text, int) is
  'Mitad ADITIVA del diff de un feed iCal, en una sola transacción: observa las reservas, marca las ausentes sin borrarlas, crea los aseos que faltan con on conflict do nothing, re-apunta reservation_id, recalcula is_urgent y escribe la salud del feed y la fila de la corrida. La cancelación, needs_review y las notificaciones llegan por create or replace en la migración 13.';

-- ---------------------------------------------------------------------------
-- T-03-30. OBLIGATORIO Y NO HEREDABLE.
--
-- Medido en el plan 01-07 sobre PG 17.6: `alter default privileges ... revoke
-- execute on functions from public, anon` NO le quita EXECUTE a PUBLIC.
-- Postgres refusiona el ACL por defecto, que siempre trae la entrada de PUBLIC,
-- así que sin este par la función nace invocable por `anon`, es decir por
-- cualquiera que tenga la clave publicable —que es pública por diseño—. Una
-- función `security definer` que escribe aseos y reservas invocable sin
-- autenticar es escalada de privilegio directa.
--
-- La aserción 9 de `supabase/tests/05_sync.test.sql` y el guardarraíl 9 de
-- `02_guardarrailes.test.sql` lo verifican por separado.
--
-- `authenticated` también, y no solo `anon`: ni el admin llama a este RPC. Lo
-- llama el worker con `service_role`, y solo él.
-- ---------------------------------------------------------------------------
revoke all     on function public.sync_feed_apply(uuid, jsonb, timestamptz, text, text, int)
  from public, anon, authenticated;
grant  execute on function public.sync_feed_apply(uuid, jsonb, timestamptz, text, text, int)
  to service_role;
