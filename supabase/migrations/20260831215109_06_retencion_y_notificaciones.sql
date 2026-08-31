-- ============================================================================
-- 06 — Notificaciones, suscripciones push y cola de borrado de Storage
--
-- Todo lo que EXISTE aquí pero se USA en las Fases 5 y 9. Van en un solo
-- archivo a propósito: cuando llegue el worker de push o el job de purga, hay
-- un único lugar donde mirar qué schema ya está puesto.
--
-- Ninguna de las tres tablas tiene consumidor en la Fase 1. No son stubs:
--   * `notifications` es la costura conocida de la Fase 4. Al confirmar un
--     aseo, el evento se escribe aquí y se drena cuando exista el worker.
--     decline_cleaning() (plan 01-08) ya escribe en esta tabla dentro de su
--     propia transacción, así que tiene que existir antes que ella.
--   * `push_subscriptions` la escribe la PWA en cuanto haya PWA.
--   * `storage_deletion_queue` es la que impide que la purga huerfanice
--     archivos, y por eso no puede llegar después de la purga.
--
-- LO QUE NO VA EN ESTE ARCHIVO, Y NO ES UN OLVIDO:
--
--   * La función de purga por retención y la de aviso previo: Fase 9. Aquí
--     solo se crea la cola que ambas necesitan.
--   * Ningún job agendado. Ninguno, de ninguna clase. Los agendan las Fases 3
--     y 9 con el scheduler de Postgres. Hay una puerta de CI que lo verifica.
--   * `legal_hold`, `legal_hold_reason` y `deleted_at`: ya existen en
--     `cleanings` desde la migración 04, con su CHECK de coherencia y su
--     índice parcial. Duplicarlas aquí sería un segundo sitio donde mirar.
--   * `app_settings`: ya existe desde la migración 03, sembrada con
--     retention_months, retention_notice_days y compañía.
--
-- Tampoco se engancha `tg_set_updated_at`: ninguna de las tres tablas tiene
-- columna `updated_at`, y añadirla sería inventar una semántica que nadie
-- pidió. Lo que estas tablas necesitan datar son eventos concretos
-- (`last_success_at`, `read_at`, `deleted_at`), no "la última vez que se tocó
-- la fila".
--
-- Sin RLS, sin policies y sin grants: plan 01-07.
-- ============================================================================


-- ===========================================================================
-- push_subscriptions — una fila por navegador/instalación
-- ===========================================================================
create table public.push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,

  -- T-01-36. `unique` GLOBAL, no compuesto con user_id, y eso es el invariante
  -- entero: el endpoint identifica al NAVEGADOR, no a la persona. Si otra
  -- aseadora inicia sesión en el mismo teléfono compartido, el
  -- `upsert on conflict (endpoint)` REASIGNA user_id en vez de crear una
  -- segunda suscripción. Con `unique (user_id, endpoint)` convivirían las dos
  -- y el aseo de una le llegaría al teléfono de la otra.
  endpoint        text not null unique,

  p256dh          text not null,
  auth            text not null,
  user_agent      text,
  created_at      timestamptz not null default now(),
  last_success_at timestamptz,
  last_failure_at timestamptz,

  -- El worker de la Fase 5 lo incrementa; 410 Gone y 404 escriben revoked_at.
  failure_count   int not null default 0,
  revoked_at      timestamptz,
  revoked_reason  text
);

comment on table public.push_subscriptions is
  'Suscripciones Web Push (VAPID). Una por navegador/instalación. La escribe la PWA; el worker de la Fase 5 la lee y la revoca ante 404/410.';
comment on column public.push_subscriptions.endpoint is
  'UNIQUE GLOBAL a propósito: identifica el navegador, no al usuario. El upsert on conflict (endpoint) reasigna user_id en un dispositivo compartido en vez de duplicar la suscripción.';

-- El worker resuelve "las suscripciones vivas de este destinatario". Las
-- revocadas no se borran (sirven de diagnóstico), pero salen del índice.
create index push_subs_user_idx
  on public.push_subscriptions (user_id) where revoked_at is null;


-- ===========================================================================
-- notifications — bandeja de entrada Y outbox de push, en la misma tabla
--
-- Una sola tabla y no dos porque el 100% de las notificaciones de este dominio
-- se muestran en la campana Y se intentan enviar por push. Separarlas obligaría
-- a un join en la pantalla más consultada de la app para ganar nada.
-- ===========================================================================
create table public.notifications (
  id              uuid primary key default gen_random_uuid(),
  recipient_id    uuid not null references public.profiles(id) on delete cascade,
  type            public.notification_type not null,
  title           text not null,
  body            text not null,
  url             text,

  -- `cascade` en las dos: una notificación sobre un aseo que ya no existe es
  -- un enlace roto en la campana.
  cleaning_id     uuid references public.cleanings(id) on delete cascade,
  property_id     uuid references public.properties(id) on delete cascade,

  payload         jsonb not null default '{}'::jsonb,

  -- Clave de idempotencia del emisor. NULL = notificación que sí puede
  -- repetirse (ver el índice único parcial de abajo).
  dedupe_key      text,
  read_at         timestamptz,

  ---------- outbox ----------------------------------------------------------
  -- El envío de push NO ocurre en la transacción que crea la notificación: una
  -- llamada HTTP dentro de la transacción de negocio la deja abierta a merced
  -- de un servicio externo. Se escribe la intención y el worker de la Fase 5
  -- la drena con reintentos. Es la razón de que estas cuatro columnas existan
  -- ya, aunque el worker no.
  push_status     public.push_status not null default 'pendiente',
  push_attempts   int not null default 0,
  push_last_error text,
  next_attempt_at timestamptz not null default now(),

  created_at      timestamptz not null default now()
);

comment on table public.notifications is
  'Bandeja de entrada del usuario y outbox de Web Push a la vez. El envío es asíncrono: se escribe la intención y el worker de la Fase 5 la drena con reintentos.';
comment on column public.notifications.dedupe_key is
  'Idempotencia del emisor. Con valor, el índice parcial impide una segunda notificación igual al mismo destinatario. NULL = repetible.';
comment on column public.notifications.next_attempt_at is
  'Backoff del outbox. El worker toma las pendientes con next_attempt_at <= now() y lo empuja hacia adelante en cada fallo.';

-- Parcial: solo las que declaran clave. Sin el `where`, todas las de
-- dedupe_key NULL colisionarían entre sí... o no, según cómo trate el motor los
-- NULL en un índice único. Dejarlo al azar de esa semántica es justo lo que se
-- evita siendo explícito.
create unique index notifications_dedupe_idx
  on public.notifications (recipient_id, dedupe_key)
  where dedupe_key is not null;

-- La consulta del worker, literal.
create index notifications_outbox_idx
  on public.notifications (next_attempt_at)
  where push_status = 'pendiente';

-- La consulta de la campana, literal: mis no leídas, lo más reciente primero.
create index notifications_inbox_idx
  on public.notifications (recipient_id, created_at desc)
  where read_at is null;


-- ===========================================================================
-- storage_deletion_queue — T-01-35
--
-- Existe por un hecho medido y contraintuitivo: BORRAR FILAS DE
-- `storage.objects` POR SQL NO BORRA EL OBJETO DEL BUCKET. Lo deja huérfano,
-- facturándose, y con el dato sensible todavía dentro, alcanzable con
-- cualquier signed URL emitida antes. El borrado real tiene que pasar por la
-- Storage API.
--
-- De ahí el orden de TRES PASOS que implementará la Fase 9:
--
--   1. Capturar las rutas en esta cola ANTES de borrar ninguna fila.
--   2. Borrar el histórico relacional (cascada a checklist, fotos, daños,
--      gastos y faltantes).
--   3. Delegar el borrado de los objetos a un worker que llame a la Storage
--      API y escriba `deleted_at`.
--
-- La cola es INDEPENDIENTE de `cleanings`: no tiene FK hacia ella. Es
-- deliberado y es lo que hace que el paso 2 pueda completarse aunque el 3
-- falle: las rutas ya están capturadas y el borrado de objetos es reintentable
-- indefinidamente. El orden inverso (borrar filas y después intentar capturar
-- rutas) huerfaniza archivos para siempre, porque la ruta vivía en la fila que
-- se acaba de borrar.
-- ===========================================================================
create table public.storage_deletion_queue (
  id          bigserial primary key,
  bucket      text not null,
  path        text not null,
  enqueued_at timestamptz not null default now(),
  attempts    int not null default 0,
  deleted_at  timestamptz,
  last_error  text,

  -- Hace que el encolado del paso 1 sea idempotente: la Fase 9 lo escribe con
  -- `on conflict (bucket, path) do nothing`, así que un job que corre dos veces
  -- (o que se reintenta a medias) no duplica trabajo ni cuenta mal los
  -- intentos.
  unique (bucket, path)
);

comment on table public.storage_deletion_queue is
  'Cola de objetos de Storage pendientes de borrado real vía Storage API. Borrar filas de storage.objects por SQL NO borra el archivo del bucket: lo deja huérfano y facturando. La drena un worker de la Fase 9.';
comment on column public.storage_deletion_queue.deleted_at is
  'Se escribe cuando la Storage API confirmó el borrado del objeto. NULL = todavía en el bucket.';

create index sdq_pending_idx
  on public.storage_deletion_queue (enqueued_at) where deleted_at is null;


-- ===========================================================================
-- CIERRE DEL AGUJERO DE PRIVILEGIOS POR DEFECTO
--
-- Tercera repetición del mismo bloque (migraciones 03, 04, 05 y esta). Con la
-- CLI 2.116.0 toda tabla y toda secuencia nueva de `public` nace con arwdDxtm
-- para `anon` y `authenticated`. Sin esto:
--
--   * `anon` insertaría notificaciones arbitrarias en la campana de cualquier
--     usuario, con `url` incluida. Es phishing dentro de la propia app.
--   * `anon` leería y reasignaría `push_subscriptions`, que es a qué teléfono
--     llega qué aseo.
--   * `authenticated` podría marcar `deleted_at` en `storage_deletion_queue` y
--     dejar evidencia en el bucket para siempre sin que nadie lo note. El
--     guardarraíl 8 de 02_guardarrailes.test.sql nombra esta tabla
--     explícitamente por eso.
--
-- La migración 07 sigue siendo la dueña de decidir quién lee qué; esto solo
-- impide que la respuesta por defecto sea "todo el mundo". La solución de raíz
-- (revocar los DEFAULT PRIVILEGES de tablas Y de secuencias) también es suya.
-- ===========================================================================
revoke all on table
  public.push_subscriptions,
  public.notifications,
  public.storage_deletion_queue
from anon, authenticated;

-- `storage_deletion_queue.id` es bigserial. Misma clase de hueco que
-- access_code_reads_id_seq en la migración 04, invisible para el guardarraíl 4
-- y cubierta por el 4b.
revoke all on sequence public.storage_deletion_queue_id_seq from anon, authenticated;
