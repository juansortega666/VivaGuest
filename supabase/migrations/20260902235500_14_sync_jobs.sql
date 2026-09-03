-- ============================================================================
-- 14 — El scheduler del motor de sincronización iCal.
--
-- Es la última migración de la Fase 3 y la que cierra el lazo: hasta aquí
-- existían el sustrato (11), la mitad aditiva del diff (12), la mitad
-- destructiva (13) y el worker HTTP (plan 03-06), pero NADIE los invocaba.
--
-- Trae cuatro cosas y ninguna es decorativa:
--
--   (a) `public.dispatch_feed_syncs()` — el fan-out. Una invocación HTTP por
--       feed vencido, con el secreto compartido sacado de Vault.
--   (b) `public.feed_health_watchdog()` — la alerta por OBSOLESCENCIA, con el
--       discriminador anti-tormenta y con la condición propia del colapso.
--   (c) los tres jobs de `cron.job`.
--   (d) la poda de `cron.job_run_details`, que `pg_cron` no hace sola.
--
-- Pone en verde las aserciones 4 a 9 de `supabase/tests/05_sync.test.sql`, que
-- llevan en rojo A PROPÓSITO desde el plan 03-01, y con ellas la suite pgTAP
-- entera vuelve a cero `not ok` por primera vez en cinco planes.
--
-- ---------------------------------------------------------------------------
-- EL LÍMITE HONESTO DE TODO ESTE ARCHIVO, Y VA PRIMERO PORQUE ES LO QUE MÁS
-- FÁCIL SE OLVIDA:
--
--   **Ningún vigilante que corra dentro del scheduler puede ver la muerte del
--   scheduler.** Si `pg_cron` deja de correr, `feed_health_watchdog` tampoco
--   corre, y subir el vigilante un nivel —un segundo job que vigile al
--   primero— no arregla nada: si `pg_cron` muere, mueren los dos.
--
--   La mitad que falta NO puede vivir aquí. Se computa AL LEER, en el panel de
--   la Fase 4, con `max(last_success_at)` sobre los feeds activos y umbral de
--   3 horas. Se dispara aunque no corra absolutamente nada dentro de la base,
--   porque lo calcula la página que el admin abre de todas formas. La función
--   pura de ese umbral la entrega este mismo plan en
--   `lib/domain/salud-sync.ts`, con sus tests, para que la Fase 4 solo tenga
--   que pintar.
--
--   Hueco residual, declarado y NO tapado: si el admin no abre el panel, nadie
--   se entera. Lo cerraría un dead man's switch externo pingado desde el
--   dispatcher; queda como idea diferida, fuera del MVP.
--
--   Este watchdog se mantiene igual, porque cubre bien lo que sí puede cubrir:
--   el job corre y los feeds fallan. Son dos capas con coberturas DISTINTAS,
--   no una redundante.
--
-- ---------------------------------------------------------------------------
-- LOS SECRETOS SON DATOS, NO SCHEMA, y por eso este archivo NO los crea.
--
-- `vault.create_secret('…', 'app_base_url', …)` y
-- `vault.create_secret('…', 'cron_shared_secret', …)` son un paso operativo
-- POR ENTORNO, documentado en `docs/despliegue-sync.md`. Meterlos en una
-- migración dejaría el valor en git para siempre.
--
-- Medido, y es la razón entera de que Vault esté en esta historia:
-- `cron.job.command` es TEXTO PLANO. Cualquiera que pueda leer ese catálogo
-- leería el secreto si viajara en la definición del job. `vault.secrets`
-- guarda el cifrado y `vault.decrypted_secrets` solo lo descifra para
-- `supabase_admin`, `postgres` y `service_role`; `anon` y `authenticated` no
-- aparecen en su ACL y PostgREST no expone el esquema `vault`.
-- ============================================================================


-- ===========================================================================
-- (a) public.dispatch_feed_syncs() — el fan-out
-- ===========================================================================
create or replace function public.dispatch_feed_syncs()
returns int
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  r        record;
  n        int := 0;
  v_base   text;
  v_secret text;
begin
  -- -----------------------------------------------------------------------
  -- Los dos secretos, y el fallo RUIDOSO A PROPÓSITO cuando faltan.
  --
  -- Hay que defender esta excepción por escrito, porque la alternativa
  -- silenciosa —`return 0` y a otra cosa— parece más educada y es un desastre:
  -- el día que alguien haga `db push` a un proyecto Supabase recién creado sin
  -- haber corrido el paso operativo de Vault, el sync entero quedaría muerto
  -- SIN QUE NADA LO DIJERA. Ni un aseo creado, ni un error en pantalla, ni una
  -- fila distinta en ninguna tabla de negocio.
  --
  -- Con la excepción, en cambio, cada tick deja `status = 'failed'` en
  -- `cron.job_run_details` con este mensaje literal en `return_message`, los
  -- feeds envejecen sin `last_success_at` y a las 3 horas el watchdog emite la
  -- alerta de job. Tres señales en vez de ninguna.
  -- -----------------------------------------------------------------------
  select v.decrypted_secret into v_base
    from vault.decrypted_secrets v where v.name = 'app_base_url';
  select v.decrypted_secret into v_secret
    from vault.decrypted_secrets v where v.name = 'cron_shared_secret';

  if v_base is null or v_secret is null then
    raise exception
      'faltan secretos de sync en vault: app_base_url / cron_shared_secret';
  end if;

  -- -----------------------------------------------------------------------
  -- QUÉ PROTEGE CADA MECANISMO. `research/ARCHITECTURE.md` lo dice mal y esta
  -- corrección es el motivo de que el comentario exista:
  --
  --   * EL LEASE (`claimed_at`, 10 minutos) **no** protege contra ticks
  --     solapados. Está MEDIDO que `pg_cron` no lanza un job consigo mismo
  --     mientras el anterior sigue vivo: un job cada 5 segundos con cuerpo de
  --     12 segundos produce corridas EN SERIE, nunca en paralelo. Lo que el
  --     lease protege de verdad es EL WORKER SOBREVIVIENDO A SU PROPIO
  --     INTERVALO: si el fetch del feed X tarda 3 minutos y el tick siguiente
  --     llega a los 60 segundos, sin lease se despacharía una segunda
  --     invocación HTTP para el mismo feed.
  --
  --   * EL `for update skip locked` protege un caso DISTINTO y también real:
  --     dos conexiones cualesquiera llamando a esta función a la vez. Un
  --     humano en el editor SQL durante una depuración, o `sync-local.sh`
  --     corriendo mientras el cron está activo.
  --
  --   * Y LA ÚLTIMA RED ya está en la base desde las migraciones 04 y 12:
  --     aunque las dos capas de arriba fallaran a la vez,
  --     `calendar_reservations_feed_uid_uniq` y los dos índices únicos
  --     parciales de `cleanings` hacen que una doble invocación sea
  --     IDEMPOTENTE en vez de duplicadora. Ninguna de las tres sobra.
  --
  -- El `limit 60` es un tope de cordura con 34 feeds en el catálogo: si algún
  -- día hubiera cientos, el tick de un minuto los drena en varias vueltas en
  -- vez de encolar cientos de peticiones HTTP de golpe.
  -- -----------------------------------------------------------------------
  for r in
    select f.id
      from public.calendar_feeds f
     where f.is_active
       and f.next_sync_at <= now()
       and (f.claimed_at is null or f.claimed_at < now() - interval '10 minutes')
     order by f.next_sync_at
     limit 60
     for update skip locked
  loop
    update public.calendar_feeds
       set claimed_at      = now(),
           last_attempt_at = now()
     where id = r.id;

    -- Firma MEDIDA:
    --   net.http_post(url, body, params, headers, timeout_milliseconds)
    --
    -- Se usan argumentos NOMBRADOS a propósito y no por estilo: el orden
    -- posicional pone `body` en segundo lugar, que es exactamente donde la
    -- intuición pone `headers`. Escrito posicionalmente, el secreto viajaría
    -- en el cuerpo, el worker respondería 401 en cada tick y la única señal
    -- sería la obsolescencia de `last_success_at` tres horas después.
    --
    -- Fire and forget: `pg_net` encola la petición y vuelve. Es lo que hace
    -- que un feed colgado no comparta ni proceso ni transacción con los otros
    -- 33, que es la propiedad de aislamiento por la que existe este diseño y
    -- no un bucle de `fetch` dentro de un solo worker.
    perform net.http_post(
      url                  := v_base || '/api/cron/sync-feed',
      body                 := jsonb_build_object('feed_id', r.id),
      headers              := jsonb_build_object(
                                'Content-Type',  'application/json',
                                'x-cron-secret', v_secret),
      timeout_milliseconds := 30000
    );

    n := n + 1;
  end loop;

  return n;
end
$fn$;

comment on function public.dispatch_feed_syncs() is
  'Fan-out del sync: una invocación HTTP por feed vencido, con el secreto compartido sacado de Vault. Lanza si faltan los secretos, a propósito: el fallo de despliegue tiene que ser ruidoso.';

-- ---------------------------------------------------------------------------
-- El par revoke/grant NO es decorativo, y esta es la tercera vez que la fase lo
-- escribe por la misma razón medida: `alter default privileges ... revoke
-- execute ... from public` NO le quita `EXECUTE` a `PUBLIC` sobre funciones
-- futuras en PG 17.6 (hallazgo 5 de `deferred-items.md`). Postgres refusiona el
-- ACL por defecto, que siempre trae la entrada de PUBLIC, así que cada función
-- nueva nace ejecutable por cualquiera con la clave publicable, que es pública
-- por diseño.
--
-- Una función `security definer` que lee el secreto compartido de Vault y hace
-- peticiones HTTP salientes, invocable sin autenticar, es escalada de
-- privilegio directa Y un amplificador de tráfico.
--
-- Lo verifican la aserción 9 de `05_sync.test.sql` y el guardarraíl 10 de
-- `02_guardarrailes.test.sql`.
-- ---------------------------------------------------------------------------
revoke all     on function public.dispatch_feed_syncs() from public, anon, authenticated;
grant  execute on function public.dispatch_feed_syncs() to postgres;


-- ===========================================================================
-- (b) public.feed_health_watchdog() — la alerta por obsolescencia
-- ===========================================================================
--
-- POR QUÉ LA ALERTA ES POR OBSOLESCENCIA Y NO POR CAPTURA DE EXCEPCIÓN, que es
-- lo primero que uno intenta:
--
--   Un feed muerto de Airbnb NO devuelve un error. Devuelve **200 con una
--   página de error en HTML**. No hay ninguna excepción que capturar, ningún
--   `catch` que escribir, ningún código de estado que mirar. El worker lo
--   clasifica como `content_type_html` cuando puede, pero un proveedor que
--   sirviera `text/calendar` vacío pasaría hasta la guarda de colapso.
--
--   Lo único que ve TODOS esos casos a la vez, incluido el caso en el que el
--   worker ni siquiera llega a correr, es que `last_success_at` deje de
--   moverse. Por eso el watchdog mira una marca de tiempo y no un error.
--
-- ---------------------------------------------------------------------------
-- LA TRAMPA DEL CUBO HORARIO, y se lee justo al revés de como es:
--
--   **El cubo de tiempo dentro de la `dedupe_key` es lo que produce
--   REPETICIÓN, no lo que la evita.** Sin cubo, un feed caído alertaría UNA
--   vez y nunca más: el índice único parcial `notifications_dedupe_idx` mataría
--   la segunda para siempre, y el admin que marcó la primera como leída no
--   volvería a saber que su calendario sigue muerto.
--
--   Con cubo horario la clave cambia cada hora, así que el índice deja pasar
--   una por hora, y es `dead_alert_sent_at < now() - interval '6 hours'` la que
--   baja la cadencia efectiva a una alerta por feed cada 6 horas. Son dos
--   mecanismos con papeles opuestos y hay que tener claro cuál hace qué.
-- ---------------------------------------------------------------------------
create or replace function public.feed_health_watchdog()
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_activos    int;
  v_obsoletos  int;
  v_colapsados int;
  v_cubo_hora  text;
  v_cubo_dia   text;
  v_obsoletos_ids  uuid[];
  v_colapsados_ids uuid[];
begin
  select count(*)::int,
         count(*) filter (
           where f.last_success_at is null
              or f.last_success_at < now() - interval '3 hours')::int,
         count(*) filter (
           where f.last_error = 'cero_reservas_clasificadas')::int
    into v_activos, v_obsoletos, v_colapsados
    from public.calendar_feeds f
   where f.is_active;

  -- Sin feeds activos no hay nada de lo que informar. Es la rama que impide
  -- que un proyecto recién desplegado, o uno al que le desactivaron todos los
  -- calendarios a propósito, emita una alerta de job muerto cada hora.
  if v_activos = 0 then
    return;
  end if;

  v_cubo_hora := to_char(date_trunc('hour', now()), 'YYYYMMDDHH24');
  v_cubo_dia  := to_char(public.today_bog(), 'YYYYMMDD');

  -- =======================================================================
  -- (b.1) OBSOLESCENCIA — y EL DISCRIMINADOR ANTI-TORMENTA
  -- =======================================================================
  -- Este `if` es la línea más importante del archivo y no está en ningún
  -- documento de research ni de arquitectura:
  --
  --   Si TODOS los feeds activos están obsoletos a la vez, lo que se rompió
  --   NO son 34 calendarios de Airbnb el mismo martes a la misma hora. Lo que
  --   se rompió es el sistema de sincronización: el job no corre, o los
  --   secretos de Vault desaparecieron, o el despliegue del worker está caído.
  --
  --   Sin este discriminador el admin recibe **34 notificaciones de
  --   "calendario caído" y NINGUNA que diga la verdad**, y el ruido entierra
  --   la señal exactamente el día en que más falta hace. Con él recibe UNA, y
  --   dice lo que pasa.
  --
  -- El `v_activos > 1` es deliberado: con un solo feed en el catálogo,
  -- "todos obsoletos" y "ese feed está caído" son el mismo hecho, y la alerta
  -- útil es la del feed, que trae `property_id` y lleva al admin al
  -- apartamento concreto.
  if v_obsoletos = v_activos and v_activos > 1 then

    insert into public.notifications
      (recipient_id, type, title, body, payload, dedupe_key)
    select p.id,
           'calendario_caido'::public.notification_type,
           'Sincronización de calendarios caída',
           'Ningún calendario ha sincronizado en las últimas tres horas. No es un apartamento concreto: es el sistema de sincronización.',
           jsonb_build_object('scope',  'job',
                              'motivo', 'todos_los_feeds_obsoletos',
                              'feeds',  v_activos),
           'job_dead:' || v_cubo_hora
      from public.profiles p
     where p.role = 'admin'
       and p.is_active
    on conflict do nothing;

  elsif v_obsoletos > 0 then

    -- Una alerta POR FEED obsoleto, con la compuerta de 6 horas.
    --
    -- LA EXCLUSIÓN DEL COLAPSO (`last_error is distinct from
    -- 'cero_reservas_clasificadas'`) merece leerse: un feed en colapso NO está
    -- "sin responder". Responde perfectamente, con 200 y un cuerpo válido; lo
    -- que cambió es el formato. Decirle al admin "el calendario no responde"
    -- cuando responde lo manda a revisar la conexión, que está bien, en vez
    -- del formato, que es lo que se rompió. Su alerta la emite (b.2), que sí
    -- sabe qué pasó, y con ella basta.
    --
    -- Se escribe con el operador de DISTINCIÓN y no con el de desigualdad
    -- porque `last_error` es nulo en el caso sano, y con el de desigualdad
    -- todos los feeds sanos-pero-obsoletos se caerían del `where` en silencio.
    select coalesce(array_agg(f.id), '{}'::uuid[])
      into v_obsoletos_ids
      from public.calendar_feeds f
     where f.is_active
       and (f.last_success_at is null
            or f.last_success_at < now() - interval '3 hours')
       and f.last_error is distinct from 'cero_reservas_clasificadas'
       and (f.dead_alert_sent_at is null
            or f.dead_alert_sent_at < now() - interval '6 hours');

    if coalesce(array_length(v_obsoletos_ids, 1), 0) > 0 then

      -- Fan-out por admin activo. `notifications.recipient_id` es NOT NULL y
      -- referencia `profiles`: no existe "una notificación para el rol", cada
      -- alerta se inserta una vez POR ADMIN ACTIVO. El `is_active` es lo que
      -- impide que un admin desactivado siga recibiendo la bandeja.
      --
      -- `title`, `body` y `payload` son LITERALES. Nunca se interpola nada
      -- derivado del cuerpo del feed —que trae los últimos cuatro dígitos del
      -- teléfono del huésped— ni la dirección de exportación, que es una
      -- credencial.
      insert into public.notifications
        (recipient_id, type, title, body, property_id, payload, dedupe_key)
      select p.id,
             'calendario_caido'::public.notification_type,
             'Calendario sin respuesta',
             'Este calendario lleva más de tres horas sin sincronizar. Revisa la conexión del apartamento.',
             f.property_id,
             jsonb_build_object('scope',   'feed',
                                'motivo',  'sin_respuesta',
                                'feed_id', f.id),
             'feed_dead:' || f.id::text || ':' || v_cubo_hora
        from public.calendar_feeds f
        cross join public.profiles p
       where f.id = any (v_obsoletos_ids)
         and p.role = 'admin'
         and p.is_active
      on conflict do nothing;

      update public.calendar_feeds f
         set dead_alert_sent_at = now()
       where f.id = any (v_obsoletos_ids);
    end if;

  end if;

  -- =======================================================================
  -- (b.2) COLAPSO — la condición PROPIA, y el traspaso explícito del plan 03-06
  -- =======================================================================
  -- ESTO ES LO MÁS IMPORTANTE QUE AÑADE ESTA MIGRACIÓN, y su ausencia sería el
  -- agujero más peligroso de toda la fase. Hay que leerlo entero:
  --
  --   El worker del plan 03-06 tiene una guarda de colapso: si el cuerpo llega
  --   bien pero NINGÚN evento clasifica como reserva, NO llama al RPC. Es lo
  --   correcto —así ningún aseo pagado se cancela porque Airbnb cambió una
  --   cadena— y está medido: quince aseos vivos y CERO cancelados en las dos
  --   corridas de colapso consecutivas.
  --
  --   Pero esa guarda tiene una consecuencia que se pasa por alto: **como el
  --   RPC no se llama, la alerta de `formato_desconocido` que el RPC emite
  --   (migración 13) NO SE EMITE NUNCA POR ESE CAMINO.** La aserción 48 del
  --   plan 03-05 prueba una ruta que el worker impide alcanzar en producción.
  --   Sigue siendo defensa en profundidad para cualquier otro llamador con
  --   `service_role`, pero por el camino real nadie avisa.
  --
  --   El resultado, sin este bloque: el día que Airbnb cambie la forma del
  --   campo libre del evento y los 34 feeds clasifiquen todo como desconocido,
  --   el sistema deja de crear aseos, no cancela ninguno —bien— y **NO SE LO
  --   DICE A NADIE**. Es el modo de fallo más peligroso del producto, porque
  --   es silencioso y porque el síntoma que el admin vería (la agenda vacía)
  --   tarda días en ser evidente.
  --
  --   Por eso el colapso se alerta AQUÍ, por derecho propio y sobre
  --   `last_error`, y NO esperando a que `consecutive_failures` suba ni a que
  --   `last_success_at` envejezca tres horas. Con la cadencia de 30 minutos,
  --   esperar al contador retrasaría la alerta sin ganar nada.
  --
  -- La `dedupe_key` es LA MISMA que usa el RPC en la migración 13
  -- (`fmt:<feed>:<YYYYMMDD>`), a propósito: si algún día los dos caminos se
  -- dispararan para el mismo feed el mismo día, el índice único los colapsa en
  -- una sola notificación en vez de duplicar el aviso.
  --
  -- Cubo DIARIO y no horario: un formato que cambió no empeora hora a hora, y
  -- repetirlo cada hora es acoso.
  if v_colapsados > 0 then

    -- El anti-tormenta del colapso, simétrico al de (b.1) y por la misma
    -- razón: si TODOS los feeds colapsaron a la vez, no cambiaron 34 formatos,
    -- cambió UNO —el de Airbnb— y la alerta útil es una que lo diga así.
    if v_colapsados = v_activos and v_activos > 1 then

      insert into public.notifications
        (recipient_id, type, title, body, payload, dedupe_key)
      select p.id,
             'calendario_caido'::public.notification_type,
             'Ningún calendario se puede interpretar',
             'Todos los calendarios responden, pero ningún evento se pudo interpretar como reserva. Es un cambio de formato del proveedor. No se canceló ningún aseo.',
             jsonb_build_object('scope',  'job',
                                'motivo', 'todos_los_feeds_colapsados',
                                'feeds',  v_activos),
             'job_fmt:' || v_cubo_dia
        from public.profiles p
       where p.role = 'admin'
         and p.is_active
      on conflict do nothing;

    else

      select coalesce(array_agg(f.id), '{}'::uuid[])
        into v_colapsados_ids
        from public.calendar_feeds f
       where f.is_active
         and f.last_error = 'cero_reservas_clasificadas';

      insert into public.notifications
        (recipient_id, type, title, body, property_id, payload, dedupe_key)
      select p.id,
             'calendario_caido'::public.notification_type,
             'Calendario con formato desconocido',
             'El calendario respondió pero ningún evento se pudo interpretar como reserva. No se canceló ningún aseo.',
             f.property_id,
             jsonb_build_object('scope',   'feed',
                                'motivo',  'formato_desconocido',
                                'feed_id', f.id),
             'fmt:' || f.id::text || ':' || v_cubo_dia
        from public.calendar_feeds f
        cross join public.profiles p
       where f.id = any (v_colapsados_ids)
         and p.role = 'admin'
         and p.is_active
      on conflict do nothing;

    end if;
  end if;
end
$fn$;

comment on function public.feed_health_watchdog() is
  'Alerta por OBSOLESCENCIA de last_success_at (un feed muerto responde 200 con HTML: no hay excepción que capturar) y por colapso de formato. Discrimina feed muerto de job muerto para no emitir una alerta por feed el día que muera el scheduler.';

revoke all     on function public.feed_health_watchdog() from public, anon, authenticated;
grant  execute on function public.feed_health_watchdog() to postgres;


-- ===========================================================================
-- (c) y (d) LOS TRES JOBS
-- ===========================================================================
-- `cron.schedule` es un UPSERT por `jobname` (medido: reagendar el mismo nombre
-- conserva el `jobid` y reemplaza `schedule` y `command`), así que esta
-- migración es idempotente si algún día se reaplica sobre una base que ya la
-- tenía.

-- ---------------------------------------------------------------------------
-- EL TICK DE UN MINUTO, Y LA SINTAXIS QUE HAY QUE USAR.
--
-- MEDIDO, y corrige a `03-RESEARCH.md`, que escribe el intervalo en literal:
--
--   select cron.schedule('x', '1 minute', 'select 1');
--   ERROR:  invalid schedule: 1 minute
--   HINT:   Use cron format (e.g. 5 4 * * *), or interval format '[1-59] seconds'
--
-- La sintaxis de intervalo de `pg_cron` 1.6.4 solo acepta SEGUNDOS. Para el
-- tick de un minuto va la expresión cron de cinco estrellas, y punto.
--
-- POR QUÉ UN MINUTO Y NO CINCO: con tick de 5 y `next_sync_at = now() + 30
-- min`, la cadencia efectiva de un feed es de 30 a 35 minutos, y el criterio 1
-- de la fase dice 30. Con tick de un minuto es de 30 a 31. El tick NO es la
-- cadencia: es la resolución con la que se mira la cola.
--
-- El coste es una consulta indexada por `cal_feeds_due_idx` sobre 34 filas,
-- 1440 veces al día. Gratis, salvo por el historial, que es lo que arregla el
-- tercer job.
-- ---------------------------------------------------------------------------
select cron.schedule(
  'dispatch-feed-syncs',
  '* * * * *',
  $job$select public.dispatch_feed_syncs()$job$);

select cron.schedule(
  'feed-health-watchdog',
  '0 * * * *',
  $job$select public.feed_health_watchdog()$job$);

-- ---------------------------------------------------------------------------
-- LA PODA, QUE NO ES OPCIONAL Y QUE NINGÚN DOCUMENTO DEL PROYECTO MENCIONA.
--
-- `pg_cron` NO limpia `cron.job_run_details`. Nunca. Con el tick de un minuto
-- del dispatcher son 1440 filas al día solo por ese job, más las del watchdog
-- y las de esta misma poda: **más de medio millón de filas al año** en un free
-- tier con 500 MB de base. Es una fuga de disco silenciosa en una tabla que
-- nadie mira hasta que la base se llena.
--
-- Siete días de retención sobran de largo: el watchdog mira las últimas horas y
-- ningún diagnóstico humano de "¿por qué no sincronizó esto?" va más atrás de
-- una semana.
--
-- Las 4:17 y no las 4:00 para no coincidir con la hora en punto del watchdog ni
-- con ninguna otra cosa que se agende a una hora redonda.
-- ---------------------------------------------------------------------------
select cron.schedule(
  'purge-cron-history',
  '17 4 * * *',
  $job$delete from cron.job_run_details where end_time < now() - interval '7 days'$job$);
