-- ============================================================================
-- 04 — Operación: calendarios, aseos y todo lo que cuelga de un aseo
--
-- Este archivo crea el núcleo operativo en el ÚNICO orden que satisface las FK:
--
--   calendar_feeds
--     -> calendar_reservations
--          -> cleanings
--               -> cleaning_checklist_items
--               -> damages / expenses / missing_item_reports
--                    -> missing_item_lines
--               -> cleaning_photos        (FK a las cuatro anteriores)
--               -> access_code_reads
--
-- ESTE ARCHIVO NO HABILITA RLS, NI CREA POLICIES, NI OTORGA GRANTS, NI CREA
-- EL TRIGGER DE SNAPSHOT NI LA MÁQUINA DE ESTADOS.
--   * RLS, policies y grants  -> migración 07 (plan 01-07)
--   * tg_cleanings_snapshot, guarda de transiciones y
--     public.cleaning_state_transitions -> migración 05 (plan 01-06)
-- Sí lleva el bloque REVOKE de cierre, por la misma razón que la migración 03:
-- sin él las 10 tablas de abajo nacen legibles y escribibles por `anon` sin
-- autenticar. Ver la nota larga al final del archivo.
--
-- CONSECUENCIA ESPERADA Y DELIBERADA: al aplicar solo hasta esta migración,
-- `supabase/tests/01_invariantes.test.sql` TODAVÍA aborta, porque su primera
-- sentencia es `delete from public.cleaning_state_transitions` y esa tabla es
-- de la migración 05. Además los fixtures insertan aseos sin `is_managed`,
-- sin `hora_limite` y sin `state`, que son justamente las tres columnas que
-- rellena el trigger de snapshot de la migración 05. Los invariantes que este
-- archivo entrega se verifican mientras tanto a mano (ver 01-04-SUMMARY.md).
--
-- Divergencias DELIBERADAS respecto a .planning/research/ARCHITECTURE.md.
-- Todas exigidas por 01-CONTEXT.md, por 01-RESEARCH.md o por la suite pgTAP,
-- que es la especificación ejecutable de la fase. No "arreglar" ninguna
-- volviendo al DDL original:
--
--   1. `calendar_feeds` NO tiene columna `url`, y su unicidad es
--      (property_id, provider) en vez de (property_id, url). La URL de
--      exportación iCal es una credencial: es secreta e inadivinable, y un GET
--      revela la ocupación completa del apartamento sin autenticación. Vive en
--      public.property_secrets.ical_url (migración 03), que no recibe ningún
--      grant. Decisión bloqueada en 01-CONTEXT.md. Mitiga T-01-26.
--   2. `calendar_feeds.is_authoritative`: 01-CONTEXT.md pide modelar soporte
--      para varios proveedores por apartamento aunque el MVP solo use Airbnb.
--      La columna de autoridad existe desde ya para no migrar después.
--   3. Columnas monetarias en `bigint`, no `numeric(12,2)`: `cleanings.
--      tarifa_huesped`, `cleanings.pago_aseador` y `expenses.monto`. El COP no
--      tiene subunidad y supabase-js devuelve `numeric` como string, lo que
--      rompería la aritmética de la Fase 7 en silencio. Guardarraíl 6 de
--      02_guardarrailes.test.sql. `captured_lat`/`captured_lng` SÍ siguen
--      siendo numeric(9,6): son coordenadas, no dinero.
--   4. `cleanings.legal_hold`, `cleanings.legal_hold_reason`,
--      `cleanings.deleted_at` y `cleaning_photos.deleted_at`: ARCHITECTURE.md
--      no los modela. Nacen aquí, no en la Fase 9, porque agregarlos después
--      obliga a migrar datos operativos en vivo (PITFALLS.md nº 18). El job
--      que los consume es de la Fase 9; lo único que se entrega hoy es la
--      columna y su índice.
--   5. `cleanings.origin` se queda SIN default. Los fixtures de la suite lo
--      pasan siempre ('manual' / 'ical') y un default silenciaría el día en
--      que el pipeline de la Fase 3 se olvide de ponerlo.
-- ============================================================================


-- ===========================================================================
-- CALENDARIOS
-- ===========================================================================

create table public.calendar_feeds (
  id                   uuid primary key default gen_random_uuid(),
  property_id          uuid not null references public.properties(id) on delete cascade,
  provider             public.feed_provider not null,

  -- Con varios proveedores por apartamento, uno manda. El MVP solo usa
  -- 'airbnb' y por eso el default es true; la columna existe desde ya para no
  -- migrar el día que entre Booking (01-CONTEXT.md §specifics).
  is_authoritative     boolean not null default true,
  is_active            boolean not null default true,

  -- scheduling / lease. El cron reclama el feed poniendo claimed_at y lo
  -- suelta al terminar; sin el lease, dos corridas solapadas duplicarían
  -- reservas. El worker es de la Fase 3.
  next_sync_at         timestamptz not null default now(),
  claimed_at           timestamptz,

  -- salud del feed. El watchdog de la Fase 3 alerta por OBSOLESCENCIA
  -- (last_success_at viejo), no por error: un feed que devuelve 200 con el
  -- cuerpo vacío no genera ningún error y es justo el caso peligroso.
  last_attempt_at      timestamptz,
  last_success_at      timestamptz,
  consecutive_failures int not null default 0,
  last_error           text,
  last_http_status     int,
  last_etag            text,
  last_payload_hash    text,
  last_event_count     int,
  dead_alert_sent_at   timestamptz,

  -- DIVERGENCIA 1: ARCHITECTURE.md pone `unique (property_id, url)`. Aquí no
  -- hay `url`, así que la unicidad natural es un feed por proveedor y
  -- apartamento, que además es la que el dominio quiere: dos feeds de Airbnb
  -- para el mismo apartamento serían el mismo calendario dos veces.
  constraint calendar_feeds_prop_provider_uniq unique (property_id, provider)
);

comment on table public.calendar_feeds is
  'Un feed de calendario por apartamento y proveedor. NO guarda la URL: esa es una credencial y vive en property_secrets.ical_url.';
comment on column public.calendar_feeds.is_authoritative is
  'Con varios proveedores por apartamento, cuál manda al resolver conflictos de bloqueo. El MVP solo usa airbnb.';

-- La cola del cron: los feeds vencidos, ordenados por vencimiento. El
-- predicado `where is_active` mantiene el índice del tamaño de la cola real.
create index cal_feeds_due_idx on public.calendar_feeds (next_sync_at) where is_active;


create table public.calendar_reservations (
  id               uuid primary key default gen_random_uuid(),
  feed_id          uuid not null references public.calendar_feeds(id) on delete cascade,
  property_id      uuid not null references public.properties(id) on delete cascade,
  uid              text not null,   -- VEVENT UID (…@airbnb.com / …@booking.com)
  reservation_code text,            -- HM… extraído de la Reservation URL del DESCRIPTION

  -- `date` y no `timestamptz`: el VEVENT de Airbnb es de día completo
  -- (DTSTART;VALUE=DATE / DTEND;VALUE=DATE) y la regla de negocio es "el aseo
  -- va el día que el calendario libera el apartamento".
  starts_on        date not null,
  -- DTEND en eventos de día completo es EXCLUSIVO: es el día en que el
  -- bloqueo termina, es decir la fecha del aseo. NO restar un día.
  ends_on          date not null,

  summary          text,
  raw_description  text,

  -- Hash del VEVENT normalizado. Es lo que detecta cambios entre corridas sin
  -- comparar campo a campo, y lo que hace idempotente al pipeline.
  payload_hash     text not null,

  first_seen_at    timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  -- Una reserva que desaparece del feed se marca, NO se borra: el feed puede
  -- venir vacío por un fallo del proveedor (anti-patrón 4 de ARCHITECTURE.md).
  disappeared_at   timestamptz,

  constraint res_dates_ok check (ends_on > starts_on),
  constraint calendar_reservations_feed_uid_uniq unique (feed_id, uid)
);

comment on column public.calendar_reservations.ends_on is
  'DTEND del VEVENT de día completo. Es EXCLUSIVO: coincide con la fecha del aseo. No restar un día.';

create index cal_res_prop_end_idx on public.calendar_reservations (property_id, ends_on)
  where disappeared_at is null;
create index cal_res_code_idx on public.calendar_reservations (property_id, reservation_code)
  where reservation_code is not null;


-- ===========================================================================
-- ASEOS — la tabla central
-- ===========================================================================

create table public.cleanings (
  id              uuid primary key default gen_random_uuid(),
  -- `restrict` y no `cascade`: borrar un apartamento con historial operativo
  -- tiene que doler.
  property_id     uuid not null references public.properties(id) on delete restrict,
  reservation_id  uuid references public.calendar_reservations(id) on delete set null,

  -- Discriminador de gestión, SNAPSHOT. NO es un join vivo contra
  -- properties.gestion_vivaguest: si un apartamento cambia de modalidad, un
  -- join reescribiría retroactivamente la naturaleza de todo su histórico y
  -- las métricas del mes pasado se moverían solas (01-CONTEXT.md).
  -- Lo rellena tg_cleanings_snapshot() en la migración 05; por eso no lleva
  -- default: un default sería una respuesta inventada.
  is_managed      boolean not null,

  -- DIVERGENCIA 5: sin default a propósito.
  origin          text not null check (origin in ('ical','manual')),
  tipo            public.cleaning_type not null default 'normal',
  -- NULL solo si is_managed = false. Lo impone cl_managed_has_state.
  state           public.cleaning_state,
  scheduled_date  date not null,
  hora_limite     time not null,                  -- snapshot de properties.hora_limite
  is_urgent       boolean not null default false,
  needs_review    boolean not null default false, -- extensión sospechosa de reserva
  review_reason   text,

  num_huespedes   smallint check (num_huespedes is null or num_huespedes > 0),
  instrucciones   text,
  aseador_id      uuid references public.profiles(id) on delete restrict,

  confirmado_at   timestamptz,
  confirmado_by   uuid references public.profiles(id),
  started_at      timestamptz,
  finished_at     timestamptz,
  cancelled_at    timestamptz,
  cancel_reason   text,

  -- SNAPSHOT financiero (FIN-01). DIVERGENCIA 3: bigint de pesos enteros.
  tarifa_huesped  bigint,
  pago_aseador    bigint,

  -- DIVERGENCIA 4: retención. Ver el bloque de índices más abajo.
  legal_hold        boolean not null default false,
  legal_hold_reason text,
  deleted_at        timestamptz,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  ---------- gestión externa: la fila es inerte, por CHECK y no por convención -
  -- Implementa la decisión "gestión externa = misma tabla + discriminador
  -- is_managed snapshoteado + state anulable" (01-CONTEXT.md, ARCHITECTURE.md
  -- §Decisión). Sin este CHECK, "sin estado, sin aseador, fuera de métricas"
  -- sería una convención de código, que es exactamente lo que la decisión
  -- existe para evitar. Mitiga T-01-22.
  constraint cl_unmanaged_is_inert check (
    is_managed or (
          state          is null
      and aseador_id     is null
      and confirmado_at  is null
      and started_at     is null
      and finished_at    is null
      and num_huespedes  is null
      and instrucciones  is null
      and tarifa_huesped is null
      and pago_aseador   is null
      and is_urgent      is false
    )
  ),
  constraint cl_managed_has_state check (not is_managed or state is not null),

  ---------- coherencia de la máquina de estados ------------------------------
  -- `is distinct from` y no `<>` también aquí: con `<>` la rama izquierda es
  -- NULL para las filas informativas y el CHECK pasaría por vacuidad de forma
  -- accidental en vez de deliberada.
  constraint cl_en_curso_shape check (
    state is distinct from 'en_curso'
    or (confirmado_at is not null and aseador_id is not null and started_at is not null
        and finished_at is null)
  ),
  constraint cl_completada_shape check (
    state is distinct from 'completada'
    or (started_at is not null and finished_at is not null and finished_at >= started_at)
  ),
  constraint cl_cancelada_shape check (
    state is distinct from 'cancelada' or cancelled_at is not null
  ),
  -- OJO: deja pasar confirmado_at NO NULO a propósito. "No puedo" devuelve el
  -- aseo a 'pendiente' sin aseador CONSERVANDO confirmado_at. Añadir aquí
  -- `confirmado_at is null` rompería ese flujo de la Fase 4.
  constraint cl_pendiente_shape check (
    state is distinct from 'pendiente' or (started_at is null and finished_at is null)
  ),
  constraint cl_manual_types check (origin = 'manual' or tipo = 'normal'),

  -- DIVERGENCIA 4: retener sin decir por qué no es retener, es un aseo que no
  -- se puede purgar y nadie sabe por qué.
  constraint cl_legal_hold_reason check (not legal_hold or legal_hold_reason is not null)
);

comment on table public.cleanings is
  'Aseos, gestionados e informativos. Los aseos de unidades de gestión externa son filas inertes: sin estado, sin aseador y fuera de las métricas (filtrar siempre por is_managed).';
comment on column public.cleanings.is_managed is
  'SNAPSHOT de properties.gestion_vivaguest al crear el aseo. No es un join vivo: cambiar la modalidad de un apartamento no debe reescribir su histórico.';
comment on column public.cleanings.legal_hold is
  'Retención legal: excluye el aseo INCONDICIONALMENTE de la purga de la Fase 9. El admin lo activa cuando hay una disputa abierta.';
comment on column public.cleanings.deleted_at is
  'Soft delete de la purga por retención (Fase 9). El borrado físico ocurre N días después de marcarlo.';

-- ---------------------------------------------------------------------------
-- INVARIANTES DUROS: los dos índices únicos parciales
--
-- `IS DISTINCT FROM` y NUNCA `<>`. Verificado en 01-RESEARCH.md §3.2 sobre
-- esta misma base, en sus cuatro aristas:
--
--   * 2º aseo activo, mismo apto + fecha  -> 23505 con el nombre del índice
--   * 2 filas 'cancelada', mismo apto + fecha -> conviven
--   * cancelar y re-crear el mismo día    -> permitido
--   * 2 filas informativas con state IS NULL, mismo apto + fecha -> 23505,
--     porque NULL IS DISTINCT FROM 'cancelada' es TRUE y la fila SÍ participa
--     del índice. Es lo correcto: tampoco queremos dos filas informativas para
--     el mismo apartamento y día. Con `<>` esa garantía se pierde en silencio.
--
-- NO se puede expresar como CONSTRAINT: `alter table … add constraint c
-- unique (…) where (…)` es error de sintaxis; solo CREATE UNIQUE INDEX admite
-- predicado. Por eso el nombre que aparece en el error 23505 es el del ÍNDICE,
-- y por eso lib/domain/errors.ts discrimina por ese nombre exacto. Renombrar
-- cualquiera de los dos rompe el mensaje de error de ASEO-07 en la UI.
--
-- REGLA TRANSVERSAL para todas las fases: toda consulta de "aseos vivos" se
-- escribe `state is distinct from 'cancelada'`. Medido con EXPLAIN: con `<>`
-- sale Seq Scan incluso con enable_seqscan = off, porque el probador de
-- implicación de predicados de Postgres no maneja DistinctExpr. Para la
-- unicidad da igual; para las consultas no.
-- ---------------------------------------------------------------------------

-- ASEO-07. Mitiga T-01-20: la garantía es de la base, no del código, así que
-- también aplica a service_role y al pipeline iCal de la Fase 3, que inserta
-- sin pasar por ningún RPC.
create unique index cleanings_one_active_per_property_date
  on public.cleanings (property_id, scheduled_date)
  where state is distinct from 'cancelada';

-- Idempotencia del pipeline. Mitiga T-01-21: una invocación duplicada del cron
-- no puede generar dos aseos vivos para la misma reserva.
create unique index cleanings_one_live_per_reservation
  on public.cleanings (reservation_id)
  where reservation_id is not null and state is distinct from 'cancelada';

-- Índices operativos.
create index cleanings_agenda_idx on public.cleanings (scheduled_date, state)
  where is_managed;
-- Este es el que evita que la policy de RLS del aseador convierta cada lectura
-- de su agenda en un seq scan sobre toda la tabla.
create index cleanings_aseador_idx on public.cleanings (aseador_id, scheduled_date)
  where aseador_id is not null;
create index cleanings_unconfirmed_idx on public.cleanings (scheduled_date)
  where is_managed and confirmado_at is null and state = 'pendiente';
create index cleanings_review_idx on public.cleanings (scheduled_date)
  where needs_review;

-- DIVERGENCIA 4: para que la purga de la Fase 9 excluya barato los aseos
-- retenidos. Sin él, el job recorre la tabla entera para descartar un puñado.
create index cleanings_legal_hold_idx on public.cleanings (scheduled_date)
  where legal_hold;

create trigger cleanings_set_updated_at
  before update on public.cleanings
  for each row execute function public.tg_set_updated_at();


-- ===========================================================================
-- CHECKLIST EJECUTADO
-- ===========================================================================

-- El checklist se materializa AL CONFIRMAR, no al crear el aseo: un aseo sin
-- confirmar puede ser cancelado por el sync, y los cuartos del apartamento
-- pueden editarse entre la detección y la confirmación. Quien lo materializa
-- es confirm_cleaning() (plan 01-08). Por eso room_label, task_label y
-- requiere_foto son SNAPSHOT: la biblioteca global de tareas puede cambiar y
-- un checklist ya ejecutado no debe reescribirse.
create table public.cleaning_checklist_items (
  id                uuid primary key default gen_random_uuid(),
  cleaning_id       uuid not null references public.cleanings(id) on delete cascade,
  property_room_id  uuid not null references public.property_rooms(id) on delete restrict,
  checklist_task_id uuid not null references public.checklist_tasks(id) on delete restrict,
  room_label        text not null,     -- snapshot
  task_label        text not null,     -- snapshot
  requiere_foto     boolean not null,  -- snapshot
  sort_order        int not null default 0,
  done_at           timestamptz,
  done_by           uuid references public.profiles(id),
  nota              text,
  constraint cci_cleaning_room_task_uniq unique (cleaning_id, property_room_id, checklist_task_id)
);

comment on table public.cleaning_checklist_items is
  'Checklist ejecutado de un aseo. Se materializa al CONFIRMAR (confirm_cleaning), no al crear el aseo. Las etiquetas son snapshot de la biblioteca global.';

create index cci_cleaning_idx on public.cleaning_checklist_items (cleaning_id);


-- ===========================================================================
-- REPORTES DE CAMPO: daños, gastos y faltantes
-- ===========================================================================

create table public.damages (
  id          uuid primary key default gen_random_uuid(),
  cleaning_id uuid not null references public.cleanings(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete restrict,
  descripcion text not null check (length(btrim(descripcion)) > 0),
  reported_by uuid not null references public.profiles(id),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id),
  nota_admin  text
);

create index damages_cleaning_idx on public.damages (cleaning_id);
create index damages_open_idx on public.damages (property_id, created_at desc)
  where resolved_at is null;


create table public.expenses (
  id          uuid primary key default gen_random_uuid(),
  cleaning_id uuid not null references public.cleanings(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete restrict,
  concepto    text not null check (length(btrim(concepto)) > 0),
  -- DIVERGENCIA 3: bigint de pesos enteros, no numeric(12,2).
  monto       bigint not null check (monto > 0),
  reported_by uuid not null references public.profiles(id),
  created_at  timestamptz not null default now()
);

create index expenses_cleaning_idx on public.expenses (cleaning_id);


create table public.missing_item_reports (
  id          uuid primary key default gen_random_uuid(),
  cleaning_id uuid not null references public.cleanings(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete restrict,
  reported_by uuid not null references public.profiles(id),
  created_at  timestamptz not null default now()
);

create index mir_cleaning_idx on public.missing_item_reports (cleaning_id);


create table public.missing_item_lines (
  id              uuid primary key default gen_random_uuid(),
  report_id       uuid not null references public.missing_item_reports(id) on delete cascade,
  catalog_item_id uuid references public.missing_item_catalog(id) on delete set null,
  nombre_libre    text,            -- rama "Otros"
  nombre_snapshot text not null,   -- lo que se le mostró al aseador al reportar
  cantidad        smallint not null default 1 check (cantidad > 0),

  -- "Otros" NO es una fila del catálogo: es la rama de texto libre. O la línea
  -- viene del catálogo, o es texto libre; nunca ambas ni ninguna.
  constraint mil_exactly_one_source check (
       (catalog_item_id is not null and nombre_libre is null)
    or (catalog_item_id is null and nombre_libre is not null
        and length(btrim(nombre_libre)) > 0)
  )
);

comment on column public.missing_item_lines.nombre_snapshot is
  'Lo que se mostró al reportar. Sobrevive a que el ítem del catálogo se renombre o se borre (catalog_item_id es on delete set null).';

create index mil_report_idx on public.missing_item_lines (report_id);


-- ===========================================================================
-- EVIDENCIA FOTOGRÁFICA
--
-- Va DESPUÉS de damages, expenses, missing_item_reports y
-- cleaning_checklist_items porque tiene FK a las cuatro. La alternativa es
-- crearla sin FK y añadirlas con `alter table … add constraint`; se prefiere
-- el orden correcto.
--
-- CONVENCIÓN DE RUTA EN STORAGE: {cleaning_id}/{kind}/{uuid}.{ext}
-- El primer segmento DEBE ser el cleaning_id: las policies de storage.objects
-- del plan 01-08 autorizan comparando
--   (storage.foldername(name))[1]::uuid  contra el aseo del aseador.
-- Cambiar la convención rompe la autorización de Storage en silencio.
--
-- La evidencia es INMUTABLE: una foto subida no se reemplaza. Eso se impone
-- por AUSENCIA de grant de UPDATE/DELETE al aseador (migración 07) y por
-- ausencia de policy de UPDATE/DELETE en storage.objects (migración 08), más
-- el `unique` de storage_path de aquí. Mitiga T-01-25.
-- ===========================================================================

create table public.cleaning_photos (
  id                uuid primary key default gen_random_uuid(),
  cleaning_id       uuid not null references public.cleanings(id) on delete cascade,
  kind              text not null check (kind in ('checklist','dano','gasto','faltante')),

  checklist_item_id uuid references public.cleaning_checklist_items(id) on delete cascade,
  damage_id         uuid references public.damages(id) on delete cascade,
  expense_id        uuid references public.expenses(id) on delete cascade,
  missing_report_id uuid references public.missing_item_reports(id) on delete cascade,

  storage_bucket    text not null default 'evidencia',
  -- unique: una ruta de Storage pertenece a una sola fila, para siempre.
  storage_path      text not null unique,
  mime_type         text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  bytes             int not null check (bytes > 0),
  width             int,
  height            int,
  taken_at          timestamptz,
  captured_lat      numeric(9,6),   -- coordenadas, no dinero: numeric es correcto
  captured_lng      numeric(9,6),
  uploaded_by       uuid not null references public.profiles(id),
  created_at        timestamptz not null default now(),

  -- DIVERGENCIA 4: purga de fotos a 30 días (RET-06). Misma razón que en
  -- cleanings: la columna se crea ahora, el job llega en la Fase 9.
  deleted_at        timestamptz,

  -- Exactamente un dueño entre los cuatro punteros nullable. Sin esto, una
  -- foto puede quedar colgada de nada (y desaparecer de toda vista) o de dos
  -- cosas a la vez (y contarse dos veces).
  constraint photo_exactly_one_owner check (
    (checklist_item_id is not null)::int + (damage_id is not null)::int
  + (expense_id is not null)::int + (missing_report_id is not null)::int = 1
  )
);

comment on column public.cleaning_photos.storage_path is
  'Ruta en el bucket. Convención: {cleaning_id}/{kind}/{uuid}.{ext}. El primer segmento DEBE ser el cleaning_id: las policies de storage.objects autorizan por ahí.';
comment on column public.cleaning_photos.deleted_at is
  'Soft delete de la purga de fotos a 30 días (RET-06, Fase 9). El objeto se encola en storage_deletion_queue; borrar la fila sin borrar el objeto lo deja huérfano facturando.';

create index cleaning_photos_cleaning_idx on public.cleaning_photos (cleaning_id);
create index cleaning_photos_checklist_idx on public.cleaning_photos (checklist_item_id)
  where checklist_item_id is not null;


-- ===========================================================================
-- AUDITORÍA DE LECTURA DEL CÓDIGO DE ACCESO
--
-- Esta tabla es el log de acceso a una credencial que abre una puerta física
-- con huéspedes y pertenencias adentro. La escribe reveal_access_code()
-- (plan 01-08) ANTES del `return query`, en la MISMA transacción: no puede
-- existir lectura sin rastro. Mitiga T-01-23.
--
-- `on delete set null` en cleaning_id y NO cascade: si la purga de la Fase 9
-- borra el aseo, el rastro de quién vio el código debe sobrevivir. Un cascade
-- aquí convertiría la retención en un borrador de evidencia de acceso.
-- ===========================================================================

create table public.access_code_reads (
  id          bigserial primary key,
  property_id uuid not null references public.properties(id) on delete cascade,
  cleaning_id uuid references public.cleanings(id) on delete set null,
  read_by     uuid not null references public.profiles(id),
  read_at     timestamptz not null default now(),
  ip          inet,
  user_agent  text
);

comment on table public.access_code_reads is
  'Bitácora de lecturas del código de acceso. La escribe reveal_access_code() en la misma transacción que la lectura. cleaning_id es on delete SET NULL a propósito: el rastro sobrevive a la purga del aseo.';

create index access_code_reads_prop_idx on public.access_code_reads (property_id, read_at desc);


-- ===========================================================================
-- CIERRE DEL AGUJERO DE PRIVILEGIOS POR DEFECTO
--
-- Mismo problema medido y documentado en la migración 03: con la CLI 2.116.0
-- que pinea este repo, toda tabla creada en `public` por `postgres` nace con
-- arwdDxtm — SELECT, INSERT, UPDATE, DELETE, TRUNCATE — para `anon` y
-- `authenticated`, vía pg_default_acl. Sin este bloque, las 10 tablas de
-- arriba quedan escribibles por cualquiera SIN AUTENTICAR y sin RLS que las
-- frene, porque la RLS la habilita la migración 07.
--
-- Concretamente, sin este REVOKE: `anon` podría leer la agenda completa con
-- direcciones e instrucciones, insertar aseos, y TRUNCAR access_code_reads,
-- que es la bitácora de acceso a las cerraduras. TRUNCATE ignora la RLS por
-- completo, así que ni siquiera la migración 07 lo taparía por sí sola.
--
-- No es un GRANT: la migración 07 sigue siendo la dueña de decidir quién lee
-- qué. Guardarraíl 4 de 02_guardarrailes.test.sql.
--
-- ⚠️ SIGUE PENDIENTE para el plan 01-07, y este bloque NO lo cubre:
--   1. Revocar los DEFAULT PRIVILEGES, o toda tabla de las migraciones 05 y 06
--      y de las Fases 2 a 9 reintroduce el agujero:
--        alter default privileges for role postgres in schema public
--          revoke all on tables from anon, authenticated;
--        alter default privileges for role postgres in schema public
--          revoke all on sequences from anon, authenticated;
--      Ojo con `authenticated`: la migración propuesta en 01-RESEARCH.md §3.1
--      solo contempla `anon` porque se escribió con la medición vieja.
--   2. `revoke all on function … from public, anon` en cada RPC: el ACL por
--      defecto de funciones es anon=X.
--   3. `grant select on public.access_code_reads to authenticated` + policy
--      solo-admin: lo exige la aserción 16 de 00_rls_aseos.test.sql.
-- ===========================================================================

revoke all on table
  public.calendar_feeds,
  public.calendar_reservations,
  public.cleanings,
  public.cleaning_checklist_items,
  public.damages,
  public.expenses,
  public.missing_item_reports,
  public.missing_item_lines,
  public.cleaning_photos,
  public.access_code_reads
from anon, authenticated;

-- `access_code_reads.id` es bigserial: crea una secuencia que también nace con
-- privilegios por defecto. Una secuencia legible no filtra datos, pero
-- `USAGE`/`UPDATE` para anon permite quemar el contador y es superficie que no
-- tiene por qué existir.
revoke all on sequence public.access_code_reads_id_seq from anon, authenticated;
