-- ============================================================================
-- 17 — El MENSAJERO de los avisos: quién dispara el drenaje del outbox, y cuándo.
--
-- La migración 06 dejó `notifications` siendo bandeja de entrada Y outbox de Web
-- Push a la vez, con sus cuatro columnas de envío (`push_status`,
-- `push_attempts`, `push_last_error`, `next_attempt_at`) y su índice
-- `notifications_outbox_idx`. La migración 16 le puso al dispositivo las columnas
-- de evidencia. Pero hasta aquí **nadie invocaba nada**: catorce emisores
-- escriben la intención de avisar y ninguno la despacha.
--
-- Este archivo trae tres cosas, y ninguna es decorativa:
--
--   (a) `public.dispatch_push_notifications()` — el fan-out del outbox. Una
--       invocación HTTP por notificación vencida, con el secreto compartido
--       sacado de Vault. **LANZA si faltan los secretos.**
--   (b) `public.tg_notifications_disparar_push()` y su trigger `AFTER INSERT`
--       sobre `notifications` — el disparo INMEDIATO. **NUNCA LANZA.**
--   (c) el job `dispatch-push-notifications`, con tick de un minuto, que hace de
--       red debajo del disparo inmediato.
--
-- Pone en verde las catorce aserciones que `supabase/tests/08_push_jobs.test.sql`
-- lleva en rojo A PROPÓSITO desde la Task 1 de este mismo plan: 1 a 8, 11 a 14,
-- 16 y 17.
--
-- ---------------------------------------------------------------------------
-- POR QUÉ EL DISPARO VIVE EN UN TRIGGER Y NO DENTRO DE CADA RPC (D-04)
--
-- Es la decisión que gobierna el archivo entero y hay tres razones, en orden de
-- peso:
--
--   1. **Hay SEIS O MÁS emisores que ya escriben notificaciones**, y ninguno se
--      edita en este plan: `confirm_cleaning`, `finish_cleaning`,
--      `decline_cleaning` y `reassign_cleaning` de la migración 09, más las del
--      reconcile destructivo (migración 13) y las del watchdog de salud
--      (migración 14). Meter el disparo en cada uno sería tocar seis funciones
--      probadas para añadirles la misma línea.
--   2. **Cualquier emisor FUTURO queda cubierto por construcción.** El día que
--      alguien añada un séptimo RPC que inserte en `notifications`, el aviso sale
--      sin que nadie tenga que acordarse. Un `perform` copiado en seis sitios es
--      un `perform` que falta en el séptimo.
--   3. **La latencia objetivo es de SEGUNDOS, no de minutos.** Con solo el cron
--      de un minuto, confirmar un aseo a las 10:00:05 avisa al aseador a las
--      10:01:00. Con el trigger, el aviso sale en el mismo segundo y el cron pasa
--      a ser la red debajo, no el camino.
--
-- ---------------------------------------------------------------------------
-- LA PROPIEDAD DE `pg_net` QUE HACE SEGURO TODO ESTO, Y QUE YA NO ES UNA CITA
--
-- La documentación de `pg_net` dice: *«HTTP requests are not started until the
-- transaction is committed.»* De esa frase depende que el disparo pueda vivir
-- dentro de la transacción de negocio sin romper la regla escrita en la
-- migración 15: **ninguna llamada HTTP síncrona dentro de la transacción de
-- negocio.** Si el RPC hace rollback, el disparo se revierte con él y no se avisa
-- de un aseo que no se confirmó.
--
-- `05-PATTERNS.md` marcaba esa propiedad como NO MEDIDA en este repo. Ya lo está:
-- la aserción 12 de `08_push_jobs.test.sql` la ejerce con `savepoint` /
-- `rollback to savepoint` y mide los tres momentos (antes, dentro, después).
--
-- Los otros límites de `pg_net`, que son los que zanjan la arquitectura:
--
--   · Solo hace POST con cuerpo JSON. Un push cifrado es un cuerpo binario
--     `aes128gcm`, así que **Postgres es el reloj y Node es el emisor**. De aquí
--     no sale ningún push: sale una invocación al worker.
--   · Las respuestas caen en `net._http_response`, tabla unlogged con TTL de 6
--     horas. **Nunca se lee para decidir nada de negocio**, ni aquí ni en la
--     aplicación.
--
-- ---------------------------------------------------------------------------
-- LOS SECRETOS SON DATOS, NO SCHEMA, y por eso este archivo NO los crea.
--
-- `app_base_url` y `cron_shared_secret` **ya existen** en Vault desde el plan
-- 03-07 (`docs/despliegue-sync.md`). El drenaje de push reusa exactamente esos
-- dos: no hay un `push_base_url`, no hay un secreto propio del drenaje, y este
-- archivo no contiene ni una sola sentencia que CREE un secreto. Ni el nombre de
-- esa función aparece escrito aquí, para que un `grep` pueda afirmarlo entero.
--
-- La razón es la misma que en la migración 14 y está medida: `cron.job.command`
-- es TEXTO PLANO. Cualquiera que pueda leer ese catálogo leería el secreto si
-- viajara en la definición del job. `vault.secrets` guarda el cifrado y
-- `vault.decrypted_secrets` solo lo descifra para `supabase_admin`, `postgres` y
-- `service_role`; `anon` y `authenticated` no aparecen en su ACL y PostgREST no
-- expone el esquema `vault`.
--
-- ---------------------------------------------------------------------------
-- LA ASIMETRÍA DE FALLO, QUE ES EL CORAZÓN DE ESTE ARCHIVO
--
--   **El trigger NUNCA lanza. El dispatcher SÍ.**
--
-- No es una inconsistencia: es la misma pregunta contestada en dos contextos
-- distintos.
--
--   · El trigger corre DENTRO de la transacción de negocio que confirma un aseo.
--     Si lanzara, confirmar el aseo fallaría por un problema de infraestructura
--     de avisos. Eso es exactamente lo contrario del Core Value del producto.
--   · El dispatcher corre DENTRO de `pg_cron`, donde un fallo deja
--     `status = 'failed'` en `cron.job_run_details` con el mensaje literal en
--     `return_message` y un humano lo puede ver. Ahí el silencio sería el
--     desastre: el drenaje muerto sin que nada lo diga.
--
-- Las dos direcciones tienen aserción dedicada (grupos E y F de
-- `08_push_jobs.test.sql`). Sin las dos, la asimetría sería un comentario.
-- ============================================================================


-- ===========================================================================
-- (a) public.dispatch_push_notifications() — el fan-out del outbox
-- ===========================================================================
create or replace function public.dispatch_push_notifications()
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
  -- Es el mismo razonamiento que la migración 14 escribió para el sync, y se
  -- repite aquí porque la alternativa silenciosa —`return 0` y a otra cosa—
  -- parece más educada y es un desastre: el día que alguien haga `db push` a un
  -- proyecto Supabase recién creado sin haber corrido el paso operativo de
  -- Vault, el drenaje entero quedaría muerto SIN QUE NADA LO DIJERA. Ni un aviso
  -- enviado, ni un error en pantalla, ni una fila distinta en ninguna tabla de
  -- negocio: solo un aseador que no recibe nada y no sabe que debería.
  --
  -- Con la excepción quedan TRES señales en vez de ninguna: `status = 'failed'`
  -- en `cron.job_run_details` con este mensaje literal, notificaciones que
  -- envejecen en `pendiente`, y la marca de frescura del panel.
  --
  -- Y aquí se puede lanzar precisamente porque quien llama es el cron, no una
  -- transacción de negocio. El trigger de (b) contesta lo contrario por esa
  -- misma razón.
  -- -----------------------------------------------------------------------
  select v.decrypted_secret into v_base
    from vault.decrypted_secrets v where v.name = 'app_base_url';
  select v.decrypted_secret into v_secret
    from vault.decrypted_secrets v where v.name = 'cron_shared_secret';

  if v_base is null or v_secret is null then
    raise exception
      'faltan secretos de push en vault: app_base_url / cron_shared_secret';
  end if;

  -- -----------------------------------------------------------------------
  -- LA SELECCIÓN, Y LA VENTANA DE GRACIA QUE NO ES UN DETALLE.
  --
  -- La segunda condición del `and` es la línea más importante de la función:
  --
  --     (n.push_attempts > 0 or n.created_at < now() - interval '90 seconds')
  --
  -- El disparo inmediato del trigger es el CAMINO PRINCIPAL y este cron es la
  -- RED. Sin esa ventana, una notificación insertada a las 10:00:05 la mandarían
  -- LOS DOS dentro del mismo minuto: el trigger en el acto y el cron a las
  -- 10:01:00. La ventana de 90 segundos le da al disparo inmediato margen de
  -- sobra para completar su viaje —encolar, commit, POST, reclamo en el worker—
  -- antes de que el cron considere siquiera esa fila.
  --
  -- `push_attempts > 0` es la excepción a la ventana, y también es deliberada:
  -- una notificación con intentos ya gastados NO es nueva, es un REINTENTO. Ahí
  -- quien manda es `next_attempt_at`, que es el backoff que escribió el worker, y
  -- esperar 90 segundos más sobre él sería retrasar un reintento ya programado.
  --
  -- `next_attempt_at <= now()` y `push_status = 'pendiente'` son exactamente el
  -- predicado del índice parcial `notifications_outbox_idx` de la migración 06.
  --
  -- `limit 200` es un tope de cordura: el caso que calibra el diseño es una
  -- tanda de quince confirmaciones seguidas (`05-CONTEXT.md`), y 200 deja dos
  -- órdenes de magnitud de margen sin encolar miles de peticiones de golpe. Con
  -- tick de un minuto, una cola mayor se drena en varias vueltas.
  --
  -- QUÉ PROTEGE `for update skip locked`, y no es lo que parece: NO protege
  -- contra ticks solapados. Está MEDIDO en la Fase 3 que `pg_cron` no lanza un
  -- job consigo mismo mientras el anterior sigue vivo; las corridas son EN SERIE.
  -- Lo que protege es el caso de DOS CONEXIONES CUALESQUIERA llamando a esta
  -- función a la vez: un humano depurando en el editor SQL mientras el cron está
  -- activo.
  -- -----------------------------------------------------------------------
  for r in
    select n2.id
      from public.notifications n2
     where n2.push_status = 'pendiente'
       and n2.next_attempt_at <= now()
       and (n2.push_attempts > 0
            or n2.created_at < now() - interval '90 seconds')
     order by n2.next_attempt_at
     limit 200
     for update skip locked
  loop
    -- -------------------------------------------------------------------
    -- EL EQUIVALENTE DEL LEASE, y hay que leer por qué no se pudo copiar tal
    -- cual el de la Fase 3.
    --
    -- `calendar_feeds` tiene una columna de reclamo propia, `claimed_at`, que el
    -- dispatcher del sync pisa antes de despachar. `notifications` NO tiene
    -- columna de lease y este plan no le añade ninguna: la que ya existe y hace
    -- el mismo trabajo es `next_attempt_at`, empujada hacia adelante ANTES del
    -- `http_post` y dentro del mismo bucle.
    --
    -- Y protege LO MISMO que el lease de la migración 14, que tampoco es lo que
    -- parece: no protege contra ticks solapados —`pg_cron` corre en serie,
    -- medido—, protege contra EL WORKER SOBREVIVIENDO A SU PROPIO INTERVALO. Si
    -- el envío de una notificación tarda tres minutos porque el push service de
    -- Apple está lento, sin este empujón el tick de dentro de 60 segundos
    -- despacharía una SEGUNDA invocación para la misma notificación.
    --
    -- Dos minutos, no uno: tiene que ser estrictamente mayor que el intervalo del
    -- tick para que el tick siguiente nunca alcance a la fila que este acaba de
    -- despachar.
    --
    -- La idempotencia FINAL no vive aquí de todas formas: la garantiza
    -- `reclamarNotificacion()` del plan 05-06, que reclama por ESTADO con un
    -- `update … where push_status = 'pendiente'` y devuelve vacío si otra
    -- invocación llegó antes. Esto es la primera capa, no la última.
    -- -------------------------------------------------------------------
    update public.notifications
       set next_attempt_at = now() + interval '2 minutes'
     where id = r.id;

    -- -------------------------------------------------------------------
    -- Firma MEDIDA de pg_net 0.20.4:
    --   net.http_post(url, body, params, headers, timeout_milliseconds)
    --
    -- Argumentos NOMBRADOS a propósito y no por estilo: el orden posicional pone
    -- `body` en SEGUNDO lugar, que es exactamente donde la intuición pone
    -- `headers`. Escrito posicionalmente, el secreto compartido viajaría en el
    -- CUERPO, el worker respondería 401 en cada tick y la única señal serían
    -- notificaciones envejeciendo en `pendiente`. La aserción 13 de
    -- `08_push_jobs.test.sql` afirma justo eso: el secreto está en la cabecera y
    -- NO está en el cuerpo.
    --
    -- UNA INVOCACIÓN POR NOTIFICACIÓN, igual que la Fase 3 hace una por feed:
    -- aísla por construcción. Una notificación cuyo push service se cuelgue no
    -- comparte ni proceso ni transacción con las otras catorce de la tanda.
    --
    -- Fire and forget: `pg_net` encola y vuelve. La respuesta no se mira.
    -- -------------------------------------------------------------------
    perform net.http_post(
      url                  := v_base || '/api/push/drain',
      body                 := jsonb_build_object('notification_id', r.id),
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

comment on function public.dispatch_push_notifications() is
  'Red del outbox de push: una invocación a /api/push/drain por notificación pendiente cuyo disparo inmediato no prosperó. Ventana de gracia de 90 s para no duplicar con el trigger AFTER INSERT. Lanza si faltan los secretos de Vault, a propósito: corre bajo pg_cron, donde el fallo tiene que ser ruidoso.';

-- ---------------------------------------------------------------------------
-- El par revoke/grant NO es decorativo, y esta es la enésima vez que el repo lo
-- escribe por la misma razón MEDIDA: `alter default privileges … revoke execute
-- … from public` NO le quita `EXECUTE` a `PUBLIC` sobre funciones futuras en
-- PG 17.6 (hallazgo 5 de `deferred-items.md`). Postgres refusiona el ACL por
-- defecto, que siempre trae la entrada de PUBLIC, así que cada función nueva
-- nace ejecutable por cualquiera con la clave publicable, que es pública por
-- diseño.
--
-- Una función `security definer` que lee el secreto compartido de Vault y hace
-- peticiones HTTP salientes, invocable sin autenticar, es escalada de privilegio
-- directa Y un amplificador de tráfico. T-05-06.
--
-- Lo verifican la aserción 4 de `08_push_jobs.test.sql` (para `authenticated`) y
-- el guardarraíl 9 de `02_guardarrailes.test.sql` (para `anon`, de forma
-- transversal a toda función nueva de `public` y `private`).
-- ---------------------------------------------------------------------------
revoke all     on function public.dispatch_push_notifications() from public, anon, authenticated;
grant  execute on function public.dispatch_push_notifications() to postgres;


-- ===========================================================================
-- (b) EL DISPARO INMEDIATO
-- ===========================================================================
--
-- ###########################################################################
-- ##  LA REGLA DURA DE ESTA FUNCIÓN, Y VA ARRIBA DEL TODO:                 ##
-- ##                                                                        ##
-- ##              **ESTA FUNCIÓN NUNCA LANZA. NUNCA.**                      ##
-- ###########################################################################
--
-- Una notificación se inserta DENTRO de la transacción de negocio de
-- `confirm_cleaning`, `finish_cleaning`, `decline_cleaning` o
-- `reassign_cleaning`. Si esta función lanzara —porque el Vault está vacío,
-- porque `pg_net` no está instalada, porque la URL de Vault es basura, por lo que
-- sea— **CONFIRMAR UN ASEO FALLARÍA POR UN PROBLEMA DE INFRAESTRUCTURA DE
-- AVISOS**.
--
-- Eso es exactamente lo contrario del Core Value del producto: «que ningún aseo
-- se pierda». La infraestructura de push rota puede dejar de avisar. No puede
-- tumbar la operación. Un aviso que no se pudo despachar lo recoge el cron de un
-- minuto noventa segundos después; un aseo que no se pudo confirmar no lo recoge
-- nadie.
--
-- De ahí las cuatro decisiones del cuerpo, todas en la misma dirección:
--
--   1. Si falta un secreto: `raise warning` y `return null`. Sin excepción.
--   2. El `net.http_post` va envuelto en `exception when others then raise
--      warning …; return null;`.
--   3. **No escribe NINGUNA columna.** Ni `next_attempt_at`, ni `push_attempts`,
--      ni nada. Un `update` sobre la misma tabla desde un trigger de fila es una
--      puerta a recursión, y aquí no hace falta: la ventana de gracia de 90
--      segundos del dispatcher ya separa los dos caminos. La aserción 19 de
--      `08_push_jobs.test.sql` lo congela.
--   4. `return null`: es un trigger `AFTER`, su valor de retorno se ignora.
--
-- `security definer` con `search_path = ''` porque `vault.decrypted_secrets` solo
-- lo descifran `postgres`, `supabase_admin` y `service_role`, y quien inserta la
-- notificación es un usuario normal a través de un RPC. Un trigger corre con los
-- privilegios de SU función, no con los de quien disparó el INSERT, así que
-- revocarle el `execute` a `authenticated` (abajo) no rompe el disparo y sí cierra
-- la puerta a que alguien la llame suelta con un `NEW` fabricado.
-- ===========================================================================
create or replace function public.tg_notifications_disparar_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_base   text;
  v_secret text;
begin
  select v.decrypted_secret into v_base
    from vault.decrypted_secrets v where v.name = 'app_base_url';
  select v.decrypted_secret into v_secret
    from vault.decrypted_secrets v where v.name = 'cron_shared_secret';

  -- Aviso, NO excepción. Es la diferencia entera con el dispatcher de (a), y el
  -- aviso queda en el log de Postgres para quien vaya a buscarlo. La señal
  -- accionable de verdad no es esta: son las notificaciones envejeciendo en
  -- `pendiente` y el `status = 'failed'` que el dispatcher deja en
  -- `cron.job_run_details` a los sesenta segundos.
  if v_base is null or v_secret is null then
    raise warning
      'push: no se pudo disparar el drenaje de la notificacion % por falta de secretos en vault (app_base_url / cron_shared_secret); la recogera el cron', new.id;
    return null;
  end if;

  -- El `begin … exception` es la segunda red y es la que cubre todo lo que no es
  -- «falta un secreto»: `pg_net` desinstalada, la cola llena, un `url` imposible.
  -- Cualquier cosa que salga mal aquí se degrada a un aviso y el cron recoge la
  -- notificación noventa segundos después.
  begin
    perform net.http_post(
      url                  := v_base || '/api/push/drain',
      body                 := jsonb_build_object('notification_id', new.id),
      headers              := jsonb_build_object(
                                'Content-Type',  'application/json',
                                'x-cron-secret', v_secret),
      timeout_milliseconds := 30000
    );
  exception when others then
    raise warning
      'push: fallo al encolar el disparo de la notificacion % (%: %); la recogera el cron',
      new.id, sqlstate, sqlerrm;
    return null;
  end;

  return null;
end
$fn$;

comment on function public.tg_notifications_disparar_push() is
  'Dispara el drenaje de push en el acto, dentro de la transacción que crea la notificación. NUNCA LANZA: un fallo de infraestructura de avisos no puede tumbar la confirmación de un aseo. Vive en un trigger y no en cada RPC (D-04) porque hay seis o más emisores, ninguno se edita, y cualquier emisor futuro queda cubierto por construcción. Es seguro dentro de la transacción porque pg_net no arranca la petición hasta el commit: un rollback revierte el disparo.';

revoke all     on function public.tg_notifications_disparar_push() from public, anon, authenticated;
grant  execute on function public.tg_notifications_disparar_push() to postgres;

-- ---------------------------------------------------------------------------
-- El trigger. Es el ÚNICO trigger de usuario sobre `public.notifications`
-- —verificado contra el catálogo antes de escribir esto— así que no hay nada con
-- lo que pudiera recursar, y como no escribe ninguna columna tampoco puede
-- recursar consigo mismo.
--
-- `after insert` y no `before`: en `before` la fila todavía puede no llegar a
-- existir (otro trigger o una restricción diferida podrían abortarla), y se
-- estaría disparando un aviso de algo que no pasó. En `after`, la fila ya es
-- parte de la transacción; si la transacción se revierte, `pg_net` no habrá
-- arrancado la petición todavía.
--
-- `for each row`: una invocación por notificación, que es la granularidad que el
-- worker acepta (`{ notification_id }`).
-- ---------------------------------------------------------------------------
drop trigger if exists notifications_disparar_push on public.notifications;

create trigger notifications_disparar_push
  after insert on public.notifications
  for each row
  execute function public.tg_notifications_disparar_push();


-- ===========================================================================
-- (c) EL JOB
-- ===========================================================================
-- `cron.schedule` es un UPSERT por `jobname` (medido en la Fase 3: reagendar el
-- mismo nombre conserva el `jobid` y reemplaza `schedule` y `command`), así que
-- esta migración es idempotente si algún día se reaplica sobre una base que ya la
-- tenía.
--
-- LA SINTAXIS DEL INTERVALO, MEDIDA Y CORREGIDA YA UNA VEZ en la migración 14.
-- Se repite aquí porque es el error que se comete al escribir el job de memoria:
--
--   select cron.schedule('x', '1 minute', 'select 1');
--   ERROR:  invalid schedule: 1 minute
--   HINT:   Use cron format (e.g. 5 4 * * *), or interval format '[1-59] seconds'
--
-- `pg_cron` 1.6.4 solo acepta SEGUNDOS en forma de intervalo. Para el tick de un
-- minuto va la expresión cron de cinco estrellas, y punto. Escrito de la otra
-- forma la migración falla AL APLICARSE, no en runtime.
--
-- POR QUÉ UN MINUTO: el tick NO es la latencia del aviso. La latencia la da el
-- trigger de (b), que dispara en el mismo segundo. El tick es la resolución con
-- la que se mira la cola de lo que el disparo inmediato no logró, y un minuto es
-- lo que hace que «hasta un minuto de retraso» sea cierto en vez de aspiracional.
--
-- El coste es una consulta servida por `notifications_outbox_idx` sobre una tabla
-- que rara vez tiene filas pendientes, 1440 veces al día. Gratis, salvo por el
-- historial, que es lo que arregla el job que ya existe.
-- ===========================================================================
select cron.schedule(
  'dispatch-push-notifications',
  '* * * * *',
  $job$select public.dispatch_push_notifications()$job$);

-- ---------------------------------------------------------------------------
-- NO SE AÑADE UNA SEGUNDA PODA DE `cron.job_run_details`, y esto se escribe para
-- que nadie la añada «por simetría» con el job nuevo.
--
-- `purge-cron-history` (`'17 4 * * *'`, migración 14) borra de la tabla ENTERA
-- todo lo que pasa de siete días, no las filas de un job concreto. Cubre por
-- tanto también `dispatch-push-notifications` desde el primer tick, sin tocar
-- nada. Una segunda poda sería el mismo `delete` corriendo dos veces al día.
--
-- La aserción 15 de `08_push_jobs.test.sql` afirma que sigue habiendo UNA sola.
-- ---------------------------------------------------------------------------
