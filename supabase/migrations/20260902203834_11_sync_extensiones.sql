-- ============================================================================
-- 11 — Motor de sincronización iCal: extensiones, bitácora de corridas,
--      columnas de instrumentación del diff y el CHECK de privacidad.
--
-- Es la primera migración de la Fase 3 y NO trae ni un job agendado ni una sola
-- función. Solo el sustrato:
--
--   (a) las dos extensiones del scheduler, las dos FUERA de `public`
--   (b) `public.feed_sync_runs`, una fila por corrida de diff
--   (c) las dos columnas que el diff necesita para razonar sobre la corrida
--       anterior
--   (d) el CHECK que convierte la decisión de privacidad en un invariante
--   (e) el índice de apoyo del emparejamiento de nivel 1
--
-- Los tres jobs de `cron.job` y las tres funciones del motor
-- (`dispatch_feed_syncs`, `sync_feed_apply`, `feed_health_watchdog`) son de las
-- migraciones 12 a 14. Las aserciones 4 a 9 de `supabase/tests/05_sync.test.sql`
-- siguen en rojo A PROPÓSITO después de aplicar este archivo; las que este
-- archivo pone en verde son la 1, la 2, la 3, la 10, la 11 y la 12.
--
-- POR QUÉ ESTA TABLA EXISTE, y no es "un contador más". La fase arranca con dos
-- preguntas que NINGUNA fixture puede contestar, porque las dos son sobre el
-- comportamiento de un servicio de terceros a lo largo del tiempo:
--
--   1. ¿La reserva que termina hoy desaparece del feed hoy mismo o mañana?
--      De la respuesta depende si la ventana protegida del reconcile destructivo
--      puede encogerse un día. Hoy se compra el margen a ciegas.
--   2. ¿El identificador de evento de Airbnb sobrevive a un cambio de fechas?
--      Dos documentos de research se contradicen. De la respuesta depende si el
--      emparejamiento de nivel 1 puede confiar en él o si el código de reserva
--      es la única identidad estable.
--
-- `min_ends_on` contesta la primera y `uid_rotations` la segunda, solas, en dos
-- o tres días de producción. Sin ellas las dos quedan abiertas para siempre y
-- cada plan futuro las vuelve a discutir sin datos.
--
-- ---------------------------------------------------------------------------
-- DECISIÓN BLOQUEADA SOBRE LAS ALERTAS DE LA FASE, escrita aquí para que los
-- planes 03-05 y 03-07 no la vuelvan a abrir:
--
--   **NO se toca el enum `public.notification_type`.** Las alertas del motor de
--   sync reutilizan el valor YA EXISTENTE `calendario_caido` y se discriminan
--   por el `payload` jsonb, que ya existe con `default '{}'::jsonb`:
--
--     {"scope":"feed","feed_id":"…","motivo":"sin_respuesta"}
--     {"scope":"job","motivo":"todos_los_feeds_obsoletos"}
--     {"scope":"feed","feed_id":"…","motivo":"formato_desconocido","eventos":15}
--
--   Tres razones, en orden de peso:
--     1. Añadir un valor a un enum obliga a partirlo en su propia migración,
--        separada de cualquier migración que lo use (ver la nota corregida en la
--        migración 02). Serían dos migraciones y un orden que respetar, a cambio
--        de nada que el `payload` no dé ya.
--     2. La Fase 4 quiere UN SOLO carril visual de "calendario" en un panel de
--        una sola jerarquía. Tres valores de enum obligarían a agrupar en la UI
--        lo que la base acababa de separar.
--     3. `extension_sospechosa` también existe ya y cubre el caso (c) del diff.
--
--   Consecuencia para quien lea las alertas: el discriminador se filtra con
--   `payload ->> 'motivo'`, no con `type`.
-- ============================================================================


-- ===========================================================================
-- (a) LAS DOS EXTENSIONES DEL SCHEDULER
-- ===========================================================================
-- Medido contra este stack (PG 17.6, CLI 2.116.0) el 2026-09-02:
--   * `pg_cron` 1.6.4 y `pg_net` 0.20.4 están disponibles y en
--     `shared_preload_libraries`; `cron.database_name` es `postgres`.
--   * Las dos son NO relocalizables y su archivo de control no fija esquema,
--     así que la cláusula `with schema` es la que decide dónde vive la fila de
--     `pg_extension`. Sus objetos van a los esquemas `cron` y `net`
--     respectivamente, y NINGUNO a `public`.
--   * Las dos se crean y se revierten dentro de una transacción sin error, que
--     es lo que permite que esta migración sea atómica.
--
-- Que ninguna viva en `public` no es cosmético: es lo que mantiene en verde a
-- `supabase db advisors --type security`, que marca `extension_in_public` como
-- error, y es exactamente lo que afirma la aserción 3 de `05_sync.test.sql`.
--
-- `pg_cron` va a `pg_catalog` y no a `extensions` porque solo puede existir en
-- la base que nombra `cron.database_name`: es una extensión de instancia, no de
-- esquema, y `pg_catalog` es donde la pone la propia plataforma.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net  with schema extensions;


-- ===========================================================================
-- (b) public.feed_sync_runs — una fila por corrida de diff
-- ===========================================================================

create table public.feed_sync_runs (
  id                  bigserial primary key,

  -- `cascade`: si el feed se borra, su bitácora de corridas no tiene a qué
  -- referirse. No es historial operativo con valor propio como el de un aseo;
  -- es telemetría de un objeto que dejó de existir.
  feed_id             uuid not null references public.calendar_feeds(id) on delete cascade,

  started_at          timestamptz not null default now(),
  finished_at         timestamptz,

  -- Lista CERRADA, y no texto libre, por la misma razón que
  -- `calendar_feeds.last_error` guarda un código y no un mensaje: es una
  -- columna que un humano va a leer en pantalla, y un `outcome` interpolado
  -- desde el transporte podría acabar arrastrando un trozo del cuerpo del feed
  -- —que trae dato personal del huésped— hasta una tabla de telemetría.
  --   ok            corrida completa con cambios aplicados
  --   no_modificado el proveedor respondió 304
  --   sin_cambios   cuerpo idéntico al de la corrida anterior por hash
  --   transporte    la petición no llegó a devolver un cuerpo usable
  --   colapso       el cuerpo llegó pero el feed se desplomó (0 eventos, truncado)
  --   error         cualquier otro fallo, ya clasificado por el worker
  outcome             text not null,

  http_status         int,
  event_count         int,
  reservation_count   int,
  block_count         int,
  unknown_count       int,

  min_ends_on         date,
  max_ends_on         date,

  cleanings_created   int not null default 0,
  cleanings_cancelled int not null default 0,
  reviews_flagged     int not null default 0,
  uid_rotations       int not null default 0,

  constraint fsr_outcome_ok check (
    outcome in ('ok', 'no_modificado', 'sin_cambios', 'transporte', 'colapso', 'error')
  )
);

comment on table public.feed_sync_runs is
  'Una fila por corrida de diff de un feed. Es telemetría, no historial operativo: se borra en cascada con el feed. Su razón de ser son min_ends_on y uid_rotations.';

comment on column public.feed_sync_runs.outcome is
  'Resultado de la corrida, de una lista cerrada por CHECK. Nunca texto interpolado: el cuerpo del feed trae dato personal del huésped y esta columna se lee en pantalla.';

comment on column public.feed_sync_runs.min_ends_on is
  'El piso del feed de esta corrida. Es el candado que hace seguro el reconcile destructivo sin saber dónde está el borde de la ventana de Airbnb, y es la serie temporal que contesta si la reserva que termina hoy desaparece hoy mismo o mañana.';

comment on column public.feed_sync_runs.max_ends_on is
  'El techo del feed de esta corrida: hasta dónde llega la ventana futura que exporta el proveedor.';

comment on column public.feed_sync_runs.uid_rotations is
  'Veces que un código de reserva ya conocido llegó con un uid distinto. Es el instrumento que contesta empíricamente si el identificador de evento de Airbnb sobrevive a un cambio de fechas, pregunta que lleva dos documentos de research en disputa y que ninguna fixture puede resolver.';

-- Las dos consultas de diagnóstico de la fase leen la bitácora de UN feed en
-- orden cronológico inverso, y el panel de la Fase 4 hace lo mismo para pintar
-- la última corrida de cada feed.
create index fsr_feed_started_idx on public.feed_sync_runs (feed_id, started_at desc);


-- ---------------------------------------------------------------------------
-- RLS, policy y grants. NADA de esto se hereda, y por eso va aquí y no en un
-- archivo de grants aparte:
--
--   * `alter default privileges` (migración 07) SÍ cubre tablas y secuencias
--     para `anon` y `authenticated` en esta CLI, pero el revoke explícito se
--     escribe igual: es barato y es lo que hace que el invariante no dependa de
--     que la CLI no cambie de comportamiento entre versiones. Ya cambió una vez
--     entre la 2.115.0 y la 2.116.0.
--   * Los default privileges NO cubren a `service_role`, y el guardarraíl 7 de
--     `02_guardarrailes.test.sql` exige que `service_role` pueda leer TODA tabla
--     de `public`. Sin el grant de abajo, ese guardarraíl se pone rojo y además
--     el worker de la migración 13 falla con permiso denegado.
--   * Una tabla con RLS y sin ninguna policy devuelve todo vacío EN SILENCIO, y
--     ese silencio es justo lo que empuja a alguien a "arreglarlo" desactivando
--     la RLS. Guardarraíl 2.
-- ---------------------------------------------------------------------------

alter table public.feed_sync_runs enable row level security;

-- La escribe y la lee el worker con `service_role`.
--
-- OJO, Y ESTO IMPORTA PARA LA FASE 4: esta tabla NO tiene ningún grant para
-- `authenticated`, así que es INALCANZABLE desde ese rol, con policy o sin ella.
-- Medido: un admin autenticado recibe `permission denied for table
-- feed_sync_runs` (42501), no cero filas. Es el mismo patrón exacto de
-- `storage_deletion_queue` en la migración 08, y es obligatorio: la aserción 11
-- de `05_sync.test.sql` exige CERO privilegios para `anon` Y para
-- `authenticated`. El panel de la Fase 4 tiene que leerla por un RPC
-- `security definer` o con `service_role`, nunca con un `select` directo desde
-- el cliente.
--
-- Entonces, ¿para qué la policy? Porque una tabla con RLS y SIN ninguna policy
-- devuelve todo vacío en silencio, y ese silencio es justo lo que empuja a
-- alguien a "arreglarlo" desactivando la RLS o metiendo la clave de servicio en
-- el cliente. Con la policy escrita, el día que alguien añada el grant la
-- restricción correcta ya está puesta y el fallo es explícito, no silencioso.
-- Guardarraíl 2 de `02_guardarrailes.test.sql`.
create policy fsr_admin_select on public.feed_sync_runs
  for select to authenticated
  using ((select private.is_admin()));

revoke all on public.feed_sync_runs from anon, authenticated;

-- El `bigserial` crea una secuencia propia, y `information_schema.role_table_grants`
-- NO lista secuencias: el guardarraíl 4 no la ve nunca y por eso existe el 4b.
-- Fue exactamente el hueco que el plan 01-04 encontró sobre access_code_reads_id_seq.
revoke all on sequence public.feed_sync_runs_id_seq from anon, authenticated;

grant all on public.feed_sync_runs to service_role;
grant usage, select on sequence public.feed_sync_runs_id_seq to service_role;


-- ===========================================================================
-- (c) LAS DOS COLUMNAS DE INSTRUMENTACIÓN DEL DIFF
-- ===========================================================================

alter table public.calendar_feeds
  add column last_min_ends_on date;

comment on column public.calendar_feeds.last_min_ends_on is
  'El piso del feed de la corrida ANTERIOR. Un salto de un día es el borde normal de la ventana de Airbnb; un salto de trece significa que el proveedor tiró un bloque de historia o que la URL cambió de anuncio. Es la alerta de cambio estructural, y cuesta una columna.';

alter table public.calendar_reservations
  add column ends_on_anterior date;

comment on column public.calendar_reservations.ends_on_anterior is
  'El ends_on de la corrida ANTERIOR. Es lo que permite a la regla R2 distinguir "la reserva anterior se acortó o desapareció en esta misma corrida" de "la reserva anterior sigue viva y sin cambios". Sin esta columna un turnover del mismo día sano se confunde con una extensión sospechosa, y ese es el caso más común y más importante del negocio.';


-- ===========================================================================
-- (d) EL CHECK DE PRIVACIDAD
-- ===========================================================================
-- El campo libre que Airbnb manda dentro de cada evento reservado trae los
-- últimos cuatro dígitos del teléfono del huésped. Es dato personal y la
-- decisión bloqueada de 03-CONTEXT.md es que NO se persiste: muere en la
-- normalización.
--
-- Se prefiere el CHECK a borrar la columna. El `drop` movería
-- `lib/database.types.ts` y la puerta de deriva de tipos sin ganar nada que el
-- CHECK no dé ya, y la columna que sí queda para diagnosticar un cambio de
-- formato del proveedor es `summary`, que no contiene dato personal.
--
-- Una decisión que solo vive en un comentario se olvida en el tercer refactor.
-- Escrita como CHECK, el intento de escritura falla con `check_violation`, que
-- es lo que ejerce la aserción 12 de `05_sync.test.sql`.
--
-- El CHECK impide que el dato ENTRE. El guardarraíl 9 de `npm run ci:arch`
-- garantiza algo distinto y complementario: que ningún archivo de aplicación
-- siquiera NOMBRE la columna, porque leer no es escribir y el CHECK no diría
-- nada.

alter table public.calendar_reservations
  add constraint cal_res_sin_descripcion check (raw_description is null);

comment on column public.calendar_reservations.raw_description is
  'SIEMPRE NULA, impuesto por el CHECK cal_res_sin_descripcion. El campo libre del VEVENT de Airbnb trae los últimos cuatro dígitos del teléfono del huésped: es dato personal y no se persiste. Se conserva la columna, y no se borra, para no mover el contrato de tipos generado.';


-- ===========================================================================
-- (e) EL ÍNDICE DE APOYO DEL EMPAREJAMIENTO DE NIVEL 1
-- ===========================================================================
-- El diff empareja por (feed_id, reservation_code) en CADA corrida y para cada
-- evento del feed. El índice que ya existe, `cal_res_code_idx`, está por
-- (property_id, reservation_code): no es la misma consulta y no la sirve, porque
-- el prefijo no coincide. Con 34 feeds y ~15 eventos por feed son ~510 búsquedas
-- por vuelta completa.
create index cal_res_feed_code_idx
  on public.calendar_reservations (feed_id, reservation_code)
  where reservation_code is not null;
