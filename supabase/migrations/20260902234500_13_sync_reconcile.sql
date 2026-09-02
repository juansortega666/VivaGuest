-- ============================================================================
-- 13 — sync_feed_apply(): la MITAD DESTRUCTIVA del diff
--
-- Esta es la migración donde un error BORRA TRABAJO REAL en vez de solo verse
-- mal. Todo lo anterior de la fase solo creaba filas. Aquí se cancela: un aseo
-- cancelado por equivocación a las 6am deja a una aseadora en la calle.
--
-- `create or replace` sobre la definición de la migración 12. Los pasos (a) a
-- (d), (f) e (i) se conservan íntegros; se añaden (e), (g) y (h) en su sitio
-- del orden, y (i) pasa a escribir los contadores reales en vez de los dos
-- ceros deliberados de la 12.
--
--   (a) upsert de observaciones ............................ migración 12
--   (b) marcar ausencias, nunca borrar ..................... migración 12  (+ guarda de colapso)
--   (c) crear los aseos que faltan, aditivo ................ migración 12
--   (d) re-apuntar reservation_id .......................... migración 12
--   (e) cancelar aseos huérfanos, con los CUATRO candados .. ESTA migración
--   (f) recalcular is_urgent ............................... migración 12
--   (g) detectar extensión sospechosa (R1 / R2) ............ ESTA migración
--   (h) notificaciones ..................................... ESTA migración
--   (i) salud del feed + fila de la corrida ................ migración 12  (+ contadores)
--
-- POR QUÉ EL ORDEN NO ES ESTÉTICO: aditivo primero, destructivo al final. Si el
-- paso destructivo falla, la transacción entera se revierte y no queda nada a
-- medias. Si el paso destructivo se salta por los candados, el sistema queda
-- con un aseo de más y una alerta, que es el lado correcto en el que
-- equivocarse.
--
-- ---------------------------------------------------------------------------
-- LOS CUATRO CANDADOS. CANCELAR EXIGE PASARLOS LOS CUATRO.
--
--   1. CORRIDA DE DIFF VÁLIDA. Este paso solo corre cuando el worker llamó al
--      RPC con un cuerpo de verdad. Un `304 Not Modified`, un error de red o
--      una corrida abortada por las guardas de transporte NO LLEGAN AQUÍ, ni
--      cuentan a favor ni en contra. Un 304 significa "el feed no cambió", no
--      "no vi la reserva": contarlo como ausencia cancelaría aseos exactamente
--      cuando el proveedor está más estable. Por eso `disappeared_at` solo lo
--      toca esta función.
--
--      Y dentro de esta función el candado se refuerza con la GUARDA DE
--      COLAPSO, que va sobre RESERVAS CLASIFICADAS y no sobre eventos crudos:
--      si el proveedor cambia la forma de la descripción, siguen llegando 15
--      eventos —un conteo de eventos no salta nunca—, los 15 caen a
--      `desconocido`, `reservation_count` cae a 0 y sin esta guarda el
--      reconcile cancelaría los 15 aseos del apartamento. Con
--      `v_reservation_count = 0` no se marca ausencia, no se cancela y no se
--      detecta extensión: se emite UNA alerta de formato desconocido y se sale.
--
--   2. DOS AUSENCIAS CONSECUTIVAS. Solo son candidatos los aseos cuya reserva
--      YA estaba marcada ausente ANTES de esta corrida y sigue ausente. En la
--      primera ausencia solo se marca (paso b); en la segunda se actúa. A 30
--      minutos de cadencia son como mucho una hora de retraso, operativamente
--      invisible, y elimina de raíz toda la clase de "una lectura mala canceló
--      los aseos".
--
--      El "ya estaba marcada antes" se captura en `v_ya_ausentes` ANTES de
--      correr el paso (b), y NO comparando `disappeared_at` con `p_fetched_at`.
--      La comparación de marcas de tiempo es frágil por dos motivos medidos:
--      dentro de una transacción `now()` es constante, así que dos llamadas al
--      RPC en la misma transacción —que es exactamente como corre la suite
--      pgTAP— tendrían el mismo `p_fetched_at` y la segunda ausencia nunca se
--      distinguiría de la primera; y un reloj que retrocediera invertiría el
--      sentido de la comparación. El array se toma del estado de la base y no
--      depende de ningún reloj.
--
--   3. LA VENTANA PROTEGIDA. Un aseo es inmune si
--      `scheduled_date <= public.today_bog() + 1`: hoy, mañana y todo el
--      pasado. Cualquier aseo con fecha de hoy o anterior o está pasando ahora
--      o ya viene tarde, y no existe ningún motivo legítimo para que el sync lo
--      cancele por su cuenta. El `+1` compra 24 horas de margen contra la
--      diferencia entre UTC y Bogotá: a las 19:00 de Bogotá ya es el día
--      siguiente en UTC, que es el borde que motivó `public.today_bog()`.
--
--   4. EL PISO DEL FEED. No se cancela ningún aseo con
--      `scheduled_date < v_piso`, donde `v_piso` es el mínimo `ends_on` de las
--      reservas CLASIFICADAS de ESTA corrida. Si la ventana de observación del
--      proveedor se movió hacia adelante, lo que quedó por detrás no está
--      cancelado: está FUERA DE LA VENTANA. Este candado se deriva de la propia
--      corrida y por eso es correcto sin saber dónde está el borde: vale si el
--      proveedor suelta el evento el día del checkout, si lo suelta al día
--      siguiente, y si además deja de exportar más allá de ~365 días. Es el más
--      fuerte de los cuatro.
--
-- Y TRES CONDICIONES MÁS SOBRE LA FILA DEL ASEO, que no son candados de fecha
-- sino de estado:
--
--   * `origin = 'ical'`. EL RECONCILE NO TOCA NUNCA UN ASEO MANUAL. Un `repaso`
--     o una `emergencia` que creó el admin no son del sync, y cancelarlos sería
--     destruir trabajo humano. Es una línea de `where` que no aparece en ningún
--     documento de research.
--   * `state = 'pendiente'`.
--   * `started_at is null`. NUNCA se cancela un aseo que ya empezó: la aseadora
--     ya fue y hay que pagarle.
--
--     REDUNDANCIA MEDIDA, y hay que conocerla antes de "limpiar" el `where`:
--     `cl_pendiente_shape` (migración 04) exige `started_at is null` cuando el
--     estado es `pendiente`, así que las dos condiciones son co-implicadas y
--     QUITAR SOLO UNA DE LAS DOS NO PONE NINGUNA ASERCIÓN DE COMPORTAMIENTO EN
--     ROJO. Son dos capas a propósito —quitar cualquiera de las dos deja la
--     otra protegiendo el caso `en_curso`—, y lo que impide que alguien borre
--     la capa sobrante es la aserción ESTRUCTURAL 47 de
--     `supabase/tests/05_sync.test.sql`, que lee el cuerpo de esta función.
--
-- ---------------------------------------------------------------------------
-- `needs_review` ES PEGAJOSO. Esta función NUNCA lo pone en false. Solo el
-- admin lo apaga, en la Fase 4. Apagarlo automáticamente haría desaparecer la
-- alerta antes de que nadie la atendiera. Buscar en este archivo la asignación
-- de esa bandera al valor falso tiene que devolver cero ocurrencias, y por eso
-- ese literal no se escribe tampoco en un comentario: la misma regla de la
-- cabecera de `scripts/ci/check-service-role.sh`, que se aprendió dos veces en
-- la Fase 1. La aserción estructural 47 de `05_sync.test.sql` lo comprueba
-- sobre el cuerpo de la función, no sobre el archivo.
--
-- TODO CANDIDATO QUE NO PASA LOS CANDADOS RECIBE `needs_review`,
-- `review_reason` y UNA NOTIFICACIÓN. Nunca se pierde en silencio: es la mitad
-- que hace aceptable la mitad conservadora.
--
-- ---------------------------------------------------------------------------
-- LISTA CERRADA DE `cancel_reason` QUE ESCRIBE ESTA FUNCIÓN:
--   'reserva_desaparecida'   la reserva llevaba dos corridas ausente
--   'reserva_movida'         la reserva sigue viva y cambió su ends_on
--
-- LISTA CERRADA DE `review_reason`:
--   'reserva_desaparecida_aseo_iniciado'
--   'reserva_desaparecida_ventana_protegida'
--   'reserva_desaparecida_bajo_piso'
--   'reserva_movida_aseo_iniciado'
--   'reserva_movida_ventana_protegida'
--   'extension_sospechosa'
--
-- Las dos listas son literales dentro del cuerpo. NUNCA texto libre, nunca
-- interpolado y nunca derivado del cuerpo del feed, que trae dato personal del
-- huésped. Misma razón que `feed_sync_runs.outcome` en la migración 11: son
-- columnas que un humano lee en pantalla.
-- ============================================================================


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
  mv          record;

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
  -- Reservas INSERTADAS en esta corrida. Es el universo del paso (g): solo una
  -- reserva nueva puede ser una extensión mal creada.
  v_nuevas    uuid[] := '{}'::uuid[];
  -- Reservas que YA estaban marcadas ausentes antes de correr el paso (b).
  -- Es el candado 2, y se toma del estado de la base, no de un reloj.
  v_ya_ausentes uuid[] := '{}'::uuid[];
  -- Las que además siguen ausentes en esta corrida: la segunda ausencia
  -- consecutiva, y el único universo del que salen candidatos a cancelación.
  v_ausentes_confirmadas uuid[] := '{}'::uuid[];

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

  -- El piso del feed de ESTA corrida, candado 4.
  v_piso      date;
  -- Candado 1 dentro de la función: la guarda de colapso sobre reservas
  -- clasificadas. Falsa = no se marca ausencia, no se cancela y no se detecta
  -- extensión.
  v_reconcile boolean;

  -- Resultados del paso (e) y (g), que alimentan el paso (h).
  v_cancel_desap  uuid[] := '{}'::uuid[];
  v_cancel_movida uuid[] := '{}'::uuid[];
  v_rev_desap     uuid[] := '{}'::uuid[];
  v_rev_movida    uuid[] := '{}'::uuid[];
  v_ext_ids       uuid[] := '{}'::uuid[];

  v_cleanings_cancelled int := 0;
  v_reviews_flagged     int := 0;
  v_n                   int;
  v_cancelado           boolean;

  v_run_id bigint;
begin
  -- `into strict`: si el feed no existe revienta aquí con P0002 y con el id a
  -- la vista, en vez de escribir cero filas y devolver un "ok" mentiroso.
  select * into strict v_feed from public.calendar_feeds where id = p_feed_id;

  -- T-03-31. El apartamento sale de la FILA DEL FEED, nunca de un id que venga
  -- en el cuerpo de la petición. Es lo que impide que un feed escriba aseos de
  -- otro apartamento aunque el worker esté comprometido.
  v_property := v_feed.property_id;

  -- CANDADO 2, primera mitad. Se toma ANTES del paso (b), que es el que marca
  -- las ausencias nuevas: después ya no se podría distinguir "llevaba una
  -- corrida ausente" de "se acaba de ir".
  select coalesce(array_agg(r.id), '{}'::uuid[])
    into v_ya_ausentes
    from public.calendar_reservations r
   where r.feed_id = p_feed_id
     and r.disappeared_at is not null;

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
      -- regla R2 del paso (g) distinguir un turnover del mismo día sano de una
      -- extensión sospechosa.
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
      -- Universo del paso (g).
      v_nuevas := v_nuevas || v_res_id;

    end if;

    v_vistas := v_vistas || v_res_id;
  end loop;

  -- =========================================================================
  -- LA GUARDA DE COLAPSO — candado 1, y va sobre RESERVAS CLASIFICADAS
  -- =========================================================================
  -- `v_piso` es el operando del candado 4 y `v_reconcile` el interruptor
  -- general de toda la mitad destructiva.
  --
  -- Que la guarda mire `v_reservation_count` y no `v_event_count` es la
  -- diferencia entre atrapar el fallo y no verlo: la clasificación de
  -- `lib/domain/ical-clasificar.ts` sale de la URL de detalle que viaja en la
  -- descripción del evento. El día que el proveedor cambie esa cadena, siguen
  -- llegando 15 eventos —un conteo de eventos no se mueve ni un poco—, los 15
  -- caen a `desconocido` y `reservation_count` cae a 0. Sin esta guarda, la
  -- corrida siguiente marcaría las 15 reservas como ausentes por segunda vez y
  -- cancelaría los 15 aseos del apartamento.
  --
  -- Con la guarda en falso NO se marca ausencia (paso b), no se cancela (e) y
  -- no se detecta extensión (g): de una corrida en la que nada clasificó no se
  -- aprende NADA sobre ausencias, y marcar la primera ausencia dejaría el
  -- terreno servido para que la corrida siguiente sí cancelara. Lo único que
  -- se hace es emitir UNA alerta de formato desconocido en el paso (h).
  v_piso      := v_min_ends_on;
  v_reconcile := (v_reservation_count > 0 and v_piso is not null);

  -- =========================================================================
  -- (b) MARCAR AUSENCIAS — marcar, NUNCA borrar
  -- =========================================================================
  -- `delete` está prohibido sobre `calendar_reservations` en todo el pipeline:
  -- el feed puede venir vacío por un fallo del proveedor, y una lectura mala no
  -- puede borrar historia.
  --
  -- Las que YA tenían `disappeared_at` no se tocan: la segunda ausencia
  -- consecutiva es lo que habilita la cancelación, y reescribir la marca en
  -- cada corrida borraría el hecho de que esta es la segunda vez.
  if v_reconcile then
    update public.calendar_reservations r
       set disappeared_at = p_fetched_at
     where r.feed_id = p_feed_id
       and r.disappeared_at is null
       and r.id <> all (v_vistas);
    get diagnostics v_disappeared = row_count;
  end if;

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
  --     colisión es la que el paso (e) resuelve más abajo.
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
  -- (e) EL RECONCILE DESTRUCTIVO — aquí es donde se borra trabajo real
  -- =========================================================================
  if v_reconcile then

    -- -----------------------------------------------------------------------
    -- (e.1) CASO (b) DEL DIFF: la reserva de verdad se fue
    -- -----------------------------------------------------------------------
    -- Candidatos: reservas que YA estaban marcadas ausentes antes de esta
    -- corrida y que SIGUEN sin aparecer. Es el candado 2, y `v_ya_ausentes` se
    -- capturó antes del paso (b) justamente para poder distinguir la segunda
    -- ausencia de la primera.
    --
    -- `r.id <> all (v_vistas)` con `v_vistas` vacío es TRUE, que es lo correcto:
    -- una corrida en la que no se vio ninguna reserva no puede llegar aquí de
    -- todas formas, porque `v_reconcile` sería falso.
    select coalesce(array_agg(r.id), '{}'::uuid[])
      into v_ausentes_confirmadas
      from public.calendar_reservations r
     where r.feed_id = p_feed_id
       and r.id = any (v_ya_ausentes)
       and r.id <> all (v_vistas)
       and r.disappeared_at is not null;

    -- LA CANCELACIÓN. Los cinco candados de fila, todos en el mismo `where`:
    --
    --   c.origin = 'ical'                              nunca un aseo manual
    --   c.state = 'pendiente'                          nunca uno en curso ni cerrado
    --   c.started_at is null                           nunca uno que ya empezó
    --   c.scheduled_date > public.today_bog() + 1      ventana protegida
    --   c.scheduled_date >= v_piso                     piso del feed
    --
    -- `c.state = 'pendiente'` con igualdad y no con el operador de distinción
    -- es deliberado y hace un trabajo extra: la fila informativa de una unidad
    -- de gestión externa tiene `state` nulo, la igualdad la evalúa a NULL y la
    -- deja fuera. Es lo correcto por dos razones: `cl_unmanaged_is_inert` exige
    -- `state is null` en esas filas, así que cancelarlas violaría el CHECK con
    -- 23514; y una unidad que no se opera no tiene aseo que cancelar.
    with cancelados as (
      update public.cleanings c
         set state         = 'cancelada',
             cancelled_at  = now(),
             cancel_reason = 'reserva_desaparecida'
       where c.property_id = v_property
         and c.reservation_id = any (v_ausentes_confirmadas)
         and c.origin = 'ical'
         and c.state = 'pendiente'
         and c.started_at is null
         and c.scheduled_date > public.today_bog() + 1
         and c.scheduled_date >= v_piso
      returning c.id
    )
    select coalesce(array_agg(id), '{}'::uuid[]) into v_cancel_desap from cancelados;

    -- LO QUE NO SE PUDO CANCELAR NO SE PIERDE EN SILENCIO.
    --
    -- Va DESPUÉS de la cancelación a propósito: los que acaban de pasar a
    -- `cancelada` salen solos de este `where`, sin necesidad de excluirlos por
    -- id. El orden es la exclusión.
    --
    -- `c.state in ('pendiente','en_curso')` deja fuera a los `completada`, y no
    -- es un descuido: una reserva que sale de la ventana del proveedor semanas
    -- después de que su aseo ya se hizo es el caso NORMAL, y marcar cada uno de
    -- esos aseos para revisión convertiría el movimiento rutinario de la
    -- ventana en una tormenta de alertas sobre trabajo terminado. Lo que se
    -- marca es lo que todavía es accionable.
    update public.cleanings c
       set needs_review  = true,
           review_reason = case
             when c.state is distinct from 'pendiente' or c.started_at is not null
               then 'reserva_desaparecida_aseo_iniciado'
             when c.scheduled_date <= public.today_bog() + 1
               then 'reserva_desaparecida_ventana_protegida'
             else 'reserva_desaparecida_bajo_piso'
           end
     where c.property_id = v_property
       and c.reservation_id = any (v_ausentes_confirmadas)
       and c.origin = 'ical'
       and c.is_managed
       and c.state in ('pendiente', 'en_curso')
       and not c.needs_review;
    get diagnostics v_n = row_count;
    v_reviews_flagged := v_reviews_flagged + v_n;

    -- Los destinatarios de la notificación son TODOS los candidatos vivos en
    -- revisión, no solo los que se marcaron en esta corrida. Quien impide la
    -- notificación repetida es `notifications_dedupe_idx` a través de
    -- `dedupe_key`, no un `where` que dependa de haber sido el primero: si el
    -- anti-duplicado viviera en este `select`, la propiedad "una sola alerta
    -- por aseo" no estaría probada por nada y bastaría un cambio en el orden de
    -- los pasos para duplicarlas.
    select coalesce(array_agg(c.id), '{}'::uuid[])
      into v_rev_desap
      from public.cleanings c
     where c.property_id = v_property
       and c.reservation_id = any (v_ausentes_confirmadas)
       and c.origin = 'ical'
       and c.is_managed
       and c.state in ('pendiente', 'en_curso')
       and c.needs_review;

    -- -----------------------------------------------------------------------
    -- (e.2) CASO (a) DEL DIFF: la reserva sigue viva pero se movió
    -- -----------------------------------------------------------------------
    -- "La reserva se movió" y "la reserva se acortó o se alargó" son EL MISMO
    -- CASO para este sistema. Lo único que importa es `ends_on`. Un cambio de
    -- `starts_on` sin cambio de `ends_on` no genera ningún trabajo de
    -- reconcile; solo puede cambiar la urgencia de OTRO aseo, y de eso se
    -- encarga el paso (f).
    --
    -- EL PISO DEL FEED NO SE APLICA AQUÍ, Y NO ES UN OLVIDO. El candado 4
    -- existe para distinguir "la reserva se canceló" de "la reserva quedó fuera
    -- de la ventana de observación". En este caso la reserva ESTÁ en la corrida
    -- y nos acaba de decir su fecha nueva: no hay nada fuera de la ventana que
    -- explicar. Aplicarlo aquí rompería el caso más común: una reserva que se
    -- mueve hacia adelante y es la única del feed pone `v_piso` en su fecha
    -- NUEVA, y el aseo viejo —que por definición está antes— quedaría por
    -- debajo del piso y no se cancelaría nunca. Medido al diseñarlo.
    --
    -- Se recorre en bucle y no en una sola sentencia porque cada par decide una
    -- rama distinta y además CREA una fila; el orden ascendente por fecha hace
    -- que, cuando dos reservas se mueven a la vez, el aseo viejo de la de fecha
    -- menor se cancele antes de que la otra intente ocupar esa misma fecha.
    for mv in
      select c.id            as cleaning_id,
             c.state         as estado,
             c.started_at    as started_at,
             c.scheduled_date as fecha_vieja,
             c.is_managed    as is_managed,
             r.id            as res_id,
             r.ends_on       as fecha_nueva
        from public.cleanings c
        join public.calendar_reservations r on r.id = c.reservation_id
       where r.feed_id = p_feed_id
         and r.disappeared_at is null
         and r.id = any (v_vistas)
         and c.property_id = v_property
         and c.origin = 'ical'
         and c.state is distinct from 'cancelada'
         and c.scheduled_date is distinct from r.ends_on
       order by c.scheduled_date, c.id
    loop

      -- La fila informativa de una unidad de gestión externa no se cancela
      -- —`cl_unmanaged_is_inert` exige `state is null`— y tampoco tiene nada
      -- que preservar: no tiene estado, ni aseadora, ni confirmación, ni
      -- tarifas. Se REPROGRAMA a la fecha nueva, que es lo único correcto: si
      -- no, la fila se queda anclada para siempre en una fecha que la reserva
      -- ya abandonó y el calendario informativo miente. El `not exists` evita
      -- el 23505 contra `cleanings_one_active_per_property_date` cuando esa
      -- fecha ya está ocupada por otro aseo vivo.
      if not mv.is_managed then
        update public.cleanings c
           set scheduled_date = mv.fecha_nueva
         where c.id = mv.cleaning_id
           and not exists (
             select 1 from public.cleanings c2
              where c2.property_id = v_property
                and c2.scheduled_date = mv.fecha_nueva
                and c2.state is distinct from 'cancelada'
                and c2.id <> mv.cleaning_id);
        continue;
      end if;

      v_cancelado := false;

      -- Rama 1: pendiente, sin trabajo dentro y fuera de la ventana protegida.
      update public.cleanings c
         set state         = 'cancelada',
             cancelled_at  = now(),
             cancel_reason = 'reserva_movida'
       where c.id = mv.cleaning_id
         and c.origin = 'ical'
         and c.state = 'pendiente'
         and c.started_at is null
         and c.scheduled_date > public.today_bog() + 1;
      get diagnostics v_n = row_count;

      if v_n = 1 then
        v_cancelado     := true;
        v_cancel_movida := v_cancel_movida || mv.cleaning_id;
      end if;

      if not v_cancelado then
        -- Ramas 2 y 3: dentro de la ventana protegida, o con trabajo dentro.
        -- NO se cancela. Se marca, se notifica, y el aseo nuevo nace HUÉRFANO.
        update public.cleanings c
           set needs_review  = true,
               review_reason = case
                 when c.state is distinct from 'pendiente' or c.started_at is not null
                   then 'reserva_movida_aseo_iniciado'
                 else 'reserva_movida_ventana_protegida'
               end
         where c.id = mv.cleaning_id
           and not c.needs_review;
        get diagnostics v_n = row_count;
        v_reviews_flagged := v_reviews_flagged + v_n;
        v_rev_movida := v_rev_movida || mv.cleaning_id;
      end if;

      -- EL ASEO NUEVO. LA TRAMPA, Y POR QUÉ NACE HUÉRFANO CUANDO EL VIEJO
      -- SOBREVIVE: `cleanings_one_live_per_reservation` es único sobre
      -- `reservation_id` para las filas vivas. Si el aseo viejo no se pudo
      -- cancelar y el nuevo se crea apuntando a la misma reserva, el insert
      -- revienta con 23505 y se lleva por delante la corrida entera.
      --
      -- Hay dos salidas y solo una es aceptable. Desapuntar el viejo borraría
      -- el vínculo que un pago o una disputa necesitan sobre un aseo que ya
      -- tiene trabajo dentro. Así que el nuevo nace con `reservation_id` nulo y
      -- marcado para que un humano decida. Una fila con `reservation_id` nulo
      -- es válida en el schema y ya es el caso de todos los `manual`.
      --
      -- `confirmado_at` no se nombra: nace nulo. El aseo nuevo NO hereda la
      -- confirmación del admin, porque la fecha cambió y lo que el admin
      -- confirmó ya no es lo que va a pasar.
      insert into public.cleanings
        (property_id, reservation_id, origin, tipo, scheduled_date)
      values
        (v_property,
         case when v_cancelado then mv.res_id else null end,
         'ical', 'normal'::public.cleaning_type, mv.fecha_nueva)
      on conflict do nothing;
      get diagnostics v_n = row_count;
      v_cleanings_created := v_cleanings_created + v_n;

    end loop;

    -- -----------------------------------------------------------------------
    -- (e.3) REPESCA ADITIVA
    -- -----------------------------------------------------------------------
    -- El paso (c) corrió ANTES de que este paso cancelara nada, así que
    -- cualquier aseo que no pudo nacer porque su fecha o su reserva estaban
    -- ocupadas por una fila que se acaba de cancelar seguiría faltando hasta la
    -- corrida siguiente. Son 30 minutos con el apartamento sin aseo agendado, y
    -- cuestan una sentencia idempotente. Es literalmente el paso (c) otra vez:
    -- mismo `select`, mismo `on conflict do nothing`.
    with candidatas as (
      select distinct on (r.ends_on) r.id, r.ends_on
        from public.calendar_reservations r
       where r.feed_id = p_feed_id
         and r.disappeared_at is null
       order by r.ends_on, r.first_seen_at, r.id
    ), repescadas as (
      insert into public.cleanings
        (property_id, reservation_id, origin, tipo, scheduled_date)
      select v_property, c.id, 'ical', 'normal'::public.cleaning_type, c.ends_on
        from candidatas c
      on conflict do nothing
      returning 1
    )
    select v_cleanings_created + count(*)::int into v_cleanings_created from repescadas;

    v_cleanings_cancelled :=
      coalesce(array_length(v_cancel_desap, 1), 0)
      + coalesce(array_length(v_cancel_movida, 1), 0);

  end if;

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
  -- (g) LA EXTENSIÓN MAL CREADA — SYNC-08
  -- =========================================================================
  -- Una reserva con `uid` nuevo Y código nuevo que empieza exactamente donde
  -- terminaba otra. El sistema SÍ crea la reserva y SÍ crea el aseo del nuevo
  -- `ends_on`, porque es un checkout real. Lo que hace ADEMÁS es marcar el aseo
  -- de la FECHA DE UNIÓN —el `ends_on` viejo, que es el `starts_on` nuevo— y
  -- encolar la alerta.
  --
  -- Lo que este paso SE NIEGA A HACER: no borra el aseo de la fecha de unión,
  -- no fusiona las dos reservas y no auto-resuelve. Si de verdad era una
  -- extensión, el coste es un viaje de más y una alerta; si no lo era, el coste
  -- de no crear el aseo es un huésped entrando a un apartamento sucio. La
  -- asimetría decide sola.
  --
  -- ***********************************************************************
  -- LA DISTINCIÓN QUE NINGÚN DOCUMENTO DE RESEARCH HACE Y QUE DECIDE ESTE PASO
  --
  -- Una reserva nueva que empieza en el `ends_on` de otra reserva VIVA Y SIN
  -- CAMBIOS **no es una extensión sospechosa: es un TURNOVER DEL MISMO DÍA**,
  -- que es SYNC-07 (urgencia) y no SYNC-08 (revisión). El feed real trae
  -- exactamente ese caso el 2026-10-10, con dos reservas sanas.
  --
  -- Confundirlos convertiría el caso MÁS COMÚN y MÁS IMPORTANTE del negocio en
  -- una falsa alarma permanente, y el admin dejaría de mirar las alertas en una
  -- semana. Lo que separa los dos casos es SI LA RESERVA ANTERIOR SE MOVIÓ O
  -- DESAPARECIÓ EN LA MISMA CORRIDA, y por eso R2 lleva esa condición y no
  -- solo la coincidencia de fechas. Quitarla es el señuelo obligatorio del
  -- plan y pone en rojo la aserción 43 de `05_sync.test.sql`.
  -- ***********************************************************************
  if v_reconcile and coalesce(array_length(v_nuevas, 1), 0) > 0 then
    with nuevas as (
      select r.id, r.property_id, r.reservation_code, r.starts_on, r.ends_on
        from public.calendar_reservations r
       where r.id = any (v_nuevas)
    ), sospechosas as (
      select distinct n.starts_on as fecha_union
        from nuevas n
       where
         -- R1: el mismo código ya se vio en este apartamento con otras fechas.
         exists (
           select 1
             from public.calendar_reservations r
            where r.property_id = n.property_id
              and r.reservation_code = n.reservation_code
              and r.id <> n.id
              and (r.starts_on, r.ends_on) is distinct from (n.starts_on, n.ends_on))
         -- R2: otra reserva del mismo apartamento SE ACORTÓ O DESAPARECIÓ y la
         -- nueva empieza exactamente en su `ends_on`, con código distinto.
         -- `ends_on <> ends_on_anterior` es para lo que existe esa columna de
         -- la migración 11: el paso (a) escribe en ella el valor VIEJO en cada
         -- update, así que una reserva que no cambió tiene las dos iguales y
         -- la condición la deja fuera. Es la línea que salva el turnover sano.
         or exists (
           select 1
             from public.calendar_reservations r
            where r.property_id = n.property_id
              and r.ends_on = n.starts_on
              and r.id <> n.id
              and r.reservation_code is distinct from n.reservation_code
              and (r.disappeared_at is not null
                   or (r.ends_on_anterior is not null
                       and r.ends_on <> r.ends_on_anterior)))
    ), marcadas as (
      update public.cleanings c
         set needs_review  = true,
             review_reason = 'extension_sospechosa'
        from sospechosas s
       where c.property_id = v_property
         and c.scheduled_date = s.fecha_union
         and c.origin = 'ical'
         and c.is_managed
         and c.state is distinct from 'cancelada'
         and not c.needs_review
      returning c.id
    )
    select coalesce(array_agg(id), '{}'::uuid[]) into v_ext_ids from marcadas;

    v_reviews_flagged := v_reviews_flagged + coalesce(array_length(v_ext_ids, 1), 0);
  end if;

  -- =========================================================================
  -- (h) NOTIFICACIONES — una fila por admin activo, con dedupe_key
  -- =========================================================================
  -- `notifications.recipient_id` es NOT NULL y referencia `profiles`, así que
  -- no existe "una notificación para el rol": cada alerta se inserta una vez
  -- POR ADMIN ACTIVO. El `cross join` es el fan-out y el `is_active` es lo que
  -- impide que un admin desactivado siga recibiendo la bandeja.
  --
  -- LA TRAMPA DEL CUBO HORARIO, Y SE LEE AL REVÉS DE COMO ES: el cubo de tiempo
  -- dentro de la `dedupe_key` es lo que produce REPETICIÓN, no lo que la evita.
  -- Sin cubo, una alerta se emite una vez y nunca más, y el admin que la marcó
  -- como leída no vuelve a saber. Por eso:
  --
  --   * las alertas de HECHO PUNTUAL sobre un aseo concreto van SIN cubo
  --     (`cancel:<id>`, `rev:<id>`, `ext:<id>`): repetirlas cada media hora es
  --     acoso y el hecho no cambia;
  --   * las alertas de ESTADO CONTINUO llevan cubo. Aquí solo hay una, la de
  --     formato desconocido, con cubo DIARIO (`fmt:<feed>:<YYYYMMDD>`): es un
  --     problema de formato, no algo que empeore hora a hora.
  --
  -- `title`, `body` y `payload` son LITERALES. Nunca se interpola nada derivado
  -- del cuerpo del feed —que trae los últimos cuatro dígitos del teléfono del
  -- huésped— ni la URL del feed, que es una credencial. El motivo va como
  -- literal escrito aquí y NO leído de vuelta de `cancel_reason` o
  -- `review_reason`: esas dos columnas son editables por el admin en la Fase 4,
  -- y leerlas de vuelta abriría una ruta de texto libre hacia el payload.
  --
  -- `on conflict do nothing` sin destino cubre `notifications_dedupe_idx`.

  -- Aseos cancelados porque la reserva desapareció.
  if coalesce(array_length(v_cancel_desap, 1), 0) > 0 then
    insert into public.notifications
      (recipient_id, type, title, body, cleaning_id, property_id, payload, dedupe_key)
    select p.id,
           'aseo_cancelado'::public.notification_type,
           'Aseo cancelado por el calendario',
           'La reserva desapareció del calendario en dos lecturas seguidas y el aseo se canceló automáticamente.',
           c.id,
           v_property,
           jsonb_build_object('scope',   'aseo',
                              'motivo',  'reserva_desaparecida',
                              'feed_id', p_feed_id),
           'cancel:' || c.id::text
      from public.cleanings c
      cross join public.profiles p
     where c.id = any (v_cancel_desap)
       and p.role = 'admin'
       and p.is_active
    on conflict do nothing;
  end if;

  -- Aseos cancelados porque la reserva se movió.
  if coalesce(array_length(v_cancel_movida, 1), 0) > 0 then
    insert into public.notifications
      (recipient_id, type, title, body, cleaning_id, property_id, payload, dedupe_key)
    select p.id,
           'aseo_cancelado'::public.notification_type,
           'Aseo cancelado por el calendario',
           'La reserva cambió de fechas y el aseo de la fecha anterior se canceló automáticamente.',
           c.id,
           v_property,
           jsonb_build_object('scope',   'aseo',
                              'motivo',  'reserva_movida',
                              'feed_id', p_feed_id),
           'cancel:' || c.id::text
      from public.cleanings c
      cross join public.profiles p
     where c.id = any (v_cancel_movida)
       and p.role = 'admin'
       and p.is_active
    on conflict do nothing;
  end if;

  -- Aseos que NO se pudieron cancelar y quedaron en revisión, por desaparición.
  if coalesce(array_length(v_rev_desap, 1), 0) > 0 then
    insert into public.notifications
      (recipient_id, type, title, body, cleaning_id, property_id, payload, dedupe_key)
    select p.id,
           'aseo_cancelado'::public.notification_type,
           'Aseo marcado para revisión',
           'La reserva desapareció del calendario pero el aseo no se pudo cancelar automáticamente. Revísalo.',
           c.id,
           v_property,
           jsonb_build_object('scope',   'aseo',
                              'motivo',  'reserva_desaparecida_no_cancelable',
                              'feed_id', p_feed_id),
           'rev:' || c.id::text
      from public.cleanings c
      cross join public.profiles p
     where c.id = any (v_rev_desap)
       and p.role = 'admin'
       and p.is_active
    on conflict do nothing;
  end if;

  -- Aseos que NO se pudieron cancelar y quedaron en revisión, por movimiento.
  if coalesce(array_length(v_rev_movida, 1), 0) > 0 then
    insert into public.notifications
      (recipient_id, type, title, body, cleaning_id, property_id, payload, dedupe_key)
    select p.id,
           'aseo_cancelado'::public.notification_type,
           'Aseo marcado para revisión',
           'La reserva cambió de fechas pero el aseo de la fecha anterior no se pudo cancelar automáticamente. Revísalo.',
           c.id,
           v_property,
           jsonb_build_object('scope',   'aseo',
                              'motivo',  'reserva_movida_no_cancelable',
                              'feed_id', p_feed_id),
           'rev:' || c.id::text
      from public.cleanings c
      cross join public.profiles p
     where c.id = any (v_rev_movida)
       and p.role = 'admin'
       and p.is_active
    on conflict do nothing;
  end if;

  -- Extensión sospechosa.
  if coalesce(array_length(v_ext_ids, 1), 0) > 0 then
    insert into public.notifications
      (recipient_id, type, title, body, cleaning_id, property_id, payload, dedupe_key)
    select p.id,
           'extension_sospechosa'::public.notification_type,
           'Posible extensión de reserva',
           'Una reserva nueva empieza donde terminaba otra que cambió o desapareció. Revisa el aseo de esa fecha antes de asignarlo.',
           c.id,
           v_property,
           jsonb_build_object('scope',   'aseo',
                              'motivo',  'extension_sospechosa',
                              'feed_id', p_feed_id),
           'ext:' || c.id::text
      from public.cleanings c
      cross join public.profiles p
     where c.id = any (v_ext_ids)
       and p.role = 'admin'
       and p.is_active
    on conflict do nothing;
  end if;

  -- Formato desconocido: llegaron eventos y NINGUNO clasificó como reserva.
  -- Es la contraparte visible de la guarda de colapso: sin esta alerta, un feed
  -- cuyo formato cambió se quedaría congelado en silencio, sin cancelar nada
  -- —que es lo correcto— pero también sin que nadie se enterara nunca.
  --
  -- El enum `notification_type` NO se toca (decisión fijada en el plan 03-03):
  -- se reutiliza `calendario_caido` y el discriminador va en `payload.motivo`.
  if v_event_count > 0 and v_reservation_count = 0 then
    insert into public.notifications
      (recipient_id, type, title, body, property_id, payload, dedupe_key)
    select p.id,
           'calendario_caido'::public.notification_type,
           'Calendario con formato desconocido',
           'El calendario respondió pero ningún evento se pudo interpretar como reserva. No se canceló ningún aseo.',
           v_property,
           jsonb_build_object('scope',        'feed',
                              'motivo',       'formato_desconocido',
                              'feed_id',      p_feed_id,
                              'eventos',      v_event_count,
                              'desconocidos', v_unknown_count),
           'fmt:' || p_feed_id::text || ':' || to_char(public.today_bog(), 'YYYYMMDD')
      from public.profiles p
     where p.role = 'admin'
       and p.is_active
    on conflict do nothing;
  end if;

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
  -- destructivo sin necesidad de saber dónde está el borde de la ventana de
  -- Airbnb, y es la serie temporal que en dos o tres días contesta si la
  -- reserva que termina hoy desaparece hoy mismo o mañana. Un bloqueo del
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
     v_cleanings_created, v_cleanings_cancelled, v_reviews_flagged, v_uid_rotations,
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
    'reconcile',                v_reconcile,
    'reservations_inserted',    v_res_inserted,
    'reservations_updated',     v_res_updated,
    'reservations_disappeared', v_disappeared,
    'cleanings_created',        v_cleanings_created,
    'cleanings_relinked',       v_relinked,
    'cleanings_cancelled',      v_cleanings_cancelled,
    'reviews_flagged',          v_reviews_flagged,
    'uid_rotations',            v_uid_rotations
  );
end;
$$;

comment on function public.sync_feed_apply(uuid, jsonb, timestamptz, text, text, int) is
  'Diff completo de un feed iCal en una sola transacción: observa las reservas, marca las ausentes sin borrarlas, crea los aseos que faltan, re-apunta reservation_id, CANCELA con cuatro candados acumulativos (corrida válida con reservas clasificadas, dos ausencias consecutivas, ventana protegida de hoy y mañana, y piso del feed), marca needs_review y notifica todo lo que no pudo cancelar, recalcula is_urgent, detecta la extensión mal creada sin confundirla con un turnover sano, y escribe la salud del feed y la fila de la corrida.';

-- ---------------------------------------------------------------------------
-- T-03-30. OBLIGATORIO Y NO HEREDABLE, Y SE REPITE AQUÍ A PROPÓSITO.
--
-- `create or replace` conserva el ACL existente, así que estas dos líneas son
-- redundantes HOY. Se escriben igual porque el día que alguien convierta este
-- archivo en un `drop function` + `create function` —para cambiar el tipo de
-- retorno, por ejemplo— el ACL se pierde entero y la función nace ejecutable
-- por `anon`, es decir por cualquiera que tenga la clave publicable, que es
-- pública por diseño. Una función `security definer` que CANCELA aseos
-- invocable sin autenticar es escalada de privilegio directa.
--
-- La firma se repite completa, con los SEIS parámetros: cambiar la lista de
-- parámetros en un `create or replace` no reemplaza nada, crea una función
-- NUEVA por sobrecarga y deja la vieja viva con sus grants. Serían dos
-- funciones y un revoke que solo cubre una.
--
-- Lo verifican la aserción 26 de `05_sync.test.sql` (con control positivo de
-- `service_role`) y el guardarraíl 9 de `02_guardarrailes.test.sql`.
-- ---------------------------------------------------------------------------
revoke all     on function public.sync_feed_apply(uuid, jsonb, timestamptz, text, text, int)
  from public, anon, authenticated;
grant  execute on function public.sync_feed_apply(uuid, jsonb, timestamptz, text, text, int)
  to service_role;
