# Architecture Research

**Domain:** Operaciones de housekeeping para renta corta (STR), multi-cluster, sincronizado por iCal
**Researched:** 2026-08-30
**Confidence:** HIGH en schema/RLS/Storage/cron (verificado contra docs oficiales de Supabase, Postgres y Next.js). MEDIUM en el formato exacto del iCal de Airbnb (Airbnb no publica spec; evidencia de terceros y muestras).

---

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                        SUPERFICIES (Vercel · Next.js 15)             │
├──────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────┐        ┌────────────────────┐                │
│  │  (admin) Dashboard │        │  (cleaner) PWA     │                │
│  │  RSC + Server Act. │        │  RSC + RPC + SW    │                │
│  └─────────┬──────────┘        └─────────┬──────────┘                │
│            │                              │                          │
│  ┌─────────┴──────────────────────────────┴──────────┐               │
│  │  middleware.ts — refresh de sesión + ruteo por rol │               │
│  └─────────┬──────────────────────────────┬──────────┘               │
│            │ cliente con JWT de usuario    │                         │
├────────────┼───────────────────────────────┼─────────────────────────┤
│            │        WORKERS (Route Handlers, service-role)           │
│  ┌─────────┴───────┐ ┌──────────────────┐ ┌───────────────────────┐  │
│  │ /api/cron/      │ │ /api/cron/       │ │ /api/cron/            │  │
│  │  sync-feed      │ │  dispatch-notifs │ │  purge-storage        │  │
│  └─────────┬───────┘ └────────┬─────────┘ └──────────┬────────────┘  │
└────────────┼──────────────────┼──────────────────────┼───────────────┘
             │ 1 invocación     │ drena outbox         │ Storage API
             │ POR FEED         │                      │
      ┌──────┴──────┐    ┌──────┴───────┐       ┌──────┴──────┐
      │  Airbnb /   │    │ Push Services│       │  Supabase   │
      │ Booking iCal│    │ (FCM/APNs/…) │       │  Storage    │
      └─────────────┘    └──────────────┘       └──────┬──────┘
             ▲                  ▲                      │
             │ pg_net (async, fire-and-forget)         │
┌────────────┴──────────────────┴─────────────────────┴───────────────┐
│                     SUPABASE POSTGRES (fuente de verdad)             │
├──────────────────────────────────────────────────────────────────────┤
│  pg_cron  ─► dispatch_feed_syncs()      (cada 5 min, fan-out)        │
│           ─► dispatch_notifications()   (cada 1 min)                 │
│           ─► raise_deadline_alerts()    (cada 15 min)                │
│           ─► feed_health_watchdog()     (cada hora)                  │
│           ─► notify_retention()/purge_expired()  (diario)            │
├──────────────────────────────────────────────────────────────────────┤
│  RLS (policies) ── private.* (SECURITY DEFINER helpers)              │
│  RPC (SECURITY DEFINER): start/finish/decline/confirm/reveal_code    │
├──────────────────────────────────────────────────────────────────────┤
│ profiles · properties · property_secrets · property_rooms            │
│ room_types · checklist_tasks · missing_item_catalog                  │
│ calendar_feeds · calendar_reservations · cleanings                   │
│ cleaning_checklist_items · cleaning_photos · damages · expenses       │
│ missing_item_reports/lines · notifications · push_subscriptions       │
│ app_settings · storage_deletion_queue · access_code_reads            │
└──────────────────────────────────────────────────────────────────────┘
```

**Regla de dirección de datos:** todo flujo entra a Postgres antes de salir a cualquier lado. No hay estado operativo fuera de Postgres. El worker de Vercel es *stateless*: recibe un `feed_id` o drena una cola, nunca guarda nada en memoria entre invocaciones.

### Component Responsibilities

| Componente | Qué posee | Implementación |
|---|---|---|
| **Postgres schema** | Verdad operativa, invariantes de dominio, snapshots financieros | Migraciones SQL versionadas (`supabase/migrations/`) |
| **RLS + `private.*`** | Autorización real (admin vs aseador, aislamiento por asignación) | Policies + funciones `SECURITY DEFINER STABLE` |
| **RPC (`SECURITY DEFINER`)** | Transiciones de estado con invariantes multi-fila (terminar, "no puedo", confirmar, revelar código) | Funciones plpgsql llamadas desde Server Actions |
| **pg_cron** | Reloj del sistema. Único scheduler. | `cron.schedule` sobre funciones plpgsql |
| **pg_net** | Fan-out asíncrono Postgres → HTTP. No hace lógica. | `net.http_post` desde las funciones de dispatch |
| **Worker `sync-feed`** | Fetch + parse + diff de **un** feed | Route Handler Node runtime, `node-ical` |
| **Worker `dispatch-notifications`** | Firma VAPID, cifra y envía push; limpia suscripciones muertas | Route Handler + `web-push` |
| **Worker `purge-storage`** | Borra objetos vía Storage API (nunca por SQL) | Route Handler + `supabase.storage.remove()` |
| **`(admin)`** | Confirmación, reasignación, CRUD, alertas, finanzas | RSC + Server Actions con cliente de usuario |
| **`(cleaner)` PWA** | Lista de aseos, checklist, evidencia, reportes | RSC + Server Actions → RPC; upload directo a Storage |
| **Service Worker** | Recepción de push y `notificationclick` | `public/sw.js` escrito a mano |

---

## Postgres Schema Design

### Enums

```sql
create type public.user_role      as enum ('admin','aseador');
create type public.cleaning_state as enum ('pendiente','en_curso','completada','cancelada');
create type public.cleaning_type  as enum ('normal','repaso','emergencia');
create type public.feed_provider  as enum ('airbnb','booking','otro');
create type public.push_status    as enum ('pendiente','enviado','fallido','descartado');
create type public.notification_type as enum (
  'asignacion','no_puedo','dano_reportado','faltantes_reportados','gasto_reportado',
  'aseo_completado','hora_limite_vencida','calendario_caido','extension_sospechosa',
  'aseo_cancelado','retencion_proxima'
);
```

### Helper de zona horaria (obligatorio, se usa en todo el sistema)

La sesión de Postgres corre en UTC. Después de las 19:00 de Bogotá, `current_date` **ya es mañana**. Usar `current_date` en índices, jobs y policies es un bug garantizado.

```sql
create or replace function public.today_bog() returns date
language sql stable set search_path = ''
as $$ select (now() at time zone 'America/Bogota')::date $$;
```

Regla: `scheduled_date` y `starts_on/ends_on` son `date` (día calendario bogotano). Todo instante es `timestamptz`. Nunca `timestamp without time zone`.

### Identidad y roles

```sql
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  role          public.user_role not null default 'aseador',
  full_name     text not null check (length(btrim(full_name)) > 0),
  phone         text,
  is_active     boolean not null default true,
  deactivated_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint profiles_deactivation_coherent
    check (is_active = (deactivated_at is null))
);
create index profiles_active_role_idx on public.profiles (role) where is_active;
```

No hay auto-registro: el admin crea el usuario con `auth.admin.createUser` (service role) y un trigger `on auth.users insert` materializa el `profiles` con el `role` que venga en `raw_user_meta_data`.

### Apartamentos

```sql
create table public.properties (
  id                uuid primary key default gen_random_uuid(),
  nombre            text not null,
  cluster           text not null,
  direccion         text,
  maps_url          text,
  maps_lat          numeric(9,6),
  maps_lng          numeric(9,6),
  hora_limite       time not null default '11:30',
  gestion_vivaguest boolean not null default true,
  tarifa_huesped    numeric(12,2),   -- COP, tarifa vigente (default para nuevos aseos)
  pago_aseador      numeric(12,2),   -- COP, tarifa vigente
  responsable_id    uuid references public.profiles(id) on delete restrict,
  suplente_id       uuid references public.profiles(id) on delete restrict,
  contacto_externo  text,            -- texto libre (Bogotá 2, empresa contratada)
  is_active         boolean not null default false,   -- nace inactivo: hay que configurarlo
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint props_rates_nonneg check (
    coalesce(tarifa_huesped, 0) >= 0 and coalesce(pago_aseador, 0) >= 0
  ),
  -- No se puede activar sin tarifas
  constraint props_active_requires_rates check (
    not (is_active and gestion_vivaguest)
    or (tarifa_huesped is not null and pago_aseador is not null)
  ),
  -- No se puede activar sin alguien que responda
  constraint props_active_requires_owner check (
    not (is_active and gestion_vivaguest)
    or (responsable_id is not null or contacto_externo is not null)
  ),
  -- responsable/suplente sólo tienen sentido bajo gestión VivaGuest
  constraint props_assignees_only_when_managed check (
    gestion_vivaguest or (responsable_id is null and suplente_id is null)
  ),
  constraint props_suplente_distinct check (
    suplente_id is null or suplente_id is distinct from responsable_id
  )
);
create unique index properties_nombre_uniq on public.properties (lower(btrim(nombre)));
```

`unique (lower(nombre))` alimenta el buscador del dashboard y evita duplicados al dar de alta 39 unidades a mano.

### Códigos de acceso — tabla aparte, no columna

```sql
create table public.property_secrets (
  property_id    uuid primary key references public.properties(id) on delete cascade,
  codigo_acceso  text,
  tipo_cerradura text not null default 'inteligente'
                 check (tipo_cerradura in ('inteligente','llave_fisica')),
  notas_acceso   text,
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.profiles(id)
);

create table public.access_code_reads (
  id          bigserial primary key,
  property_id uuid not null references public.properties(id) on delete cascade,
  cleaning_id uuid references public.cleanings(id) on delete set null,
  read_by     uuid not null references public.profiles(id),
  read_at     timestamptz not null default now(),
  ip          inet,
  user_agent  text
);
create index access_code_reads_prop_idx on public.access_code_reads (property_id, read_at desc);
```

**Por qué tabla separada y no una columna en `properties`:** en Supabase, admins y aseadores comparten el rol de Postgres `authenticated`. Los privilegios de columna (`GRANT SELECT (col)`) son por *rol de base*, no por usuario, así que **es imposible ocultar una columna al aseador y mostrarla al admin con column grants**. Lo único que distingue usuarios es RLS, y RLS es por fila. Por tanto el secreto tiene que vivir en su propia fila. Esto es una consecuencia dura del stack, no una preferencia de estilo.

### Cuartos y checklist (biblioteca global fija, máximo 3 tareas por tipo)

```sql
create table public.room_types (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,       -- 'cocina','bano','habitacion','sala','balcon',...
  nombre     text not null,
  sort_order int  not null default 0
);

create table public.checklist_tasks (
  id            uuid primary key default gen_random_uuid(),
  room_type_id  uuid not null references public.room_types(id) on delete cascade,
  descripcion   text not null,
  slot          smallint not null check (slot between 1 and 3),
  requiere_foto boolean not null default true,
  is_active     boolean not null default true,
  unique (room_type_id, slot)     -- ← el tope de 3 es estructural, no un trigger
);
```

El límite de 3 tareas por tipo de cuarto queda expresado por `CHECK(slot between 1 and 3) + UNIQUE(room_type_id, slot)`: máximo 3 filas por tipo, sin trigger ni conteo. Contrapartida: retirar una tarea y añadir otra obliga a reusar el slot. Es aceptable para una biblioteca fija de MVP.

```sql
create table public.property_rooms (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references public.properties(id) on delete cascade,
  room_type_id uuid not null references public.room_types(id) on delete restrict,
  etiqueta     text not null,     -- 'Habitación 1', 'Baño social'
  sort_order   int  not null default 0,
  is_active    boolean not null default true,
  unique (property_id, etiqueta)
);
create index property_rooms_prop_idx on public.property_rooms (property_id) where is_active;
```

### Faltantes: catálogo base configurable + "Otros"

```sql
create table public.missing_item_catalog (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid references public.properties(id) on delete cascade,  -- NULL = ítem global
  nombre      text not null,
  sort_order  int  not null default 0,
  is_active   boolean not null default true
);
create unique index mic_global_uniq on public.missing_item_catalog (lower(nombre))
  where property_id is null;
create unique index mic_prop_uniq   on public.missing_item_catalog (property_id, lower(nombre))
  where property_id is not null;
```

La lista que ve el aseador = globales activos ∪ los del apartamento. "Otros" no es una fila del catálogo: es la rama de texto libre en `missing_item_lines` (abajo).

### Calendarios

```sql
create table public.calendar_feeds (
  id                   uuid primary key default gen_random_uuid(),
  property_id          uuid not null references public.properties(id) on delete cascade,
  provider             public.feed_provider not null,
  url                  text not null,
  is_active            boolean not null default true,
  -- scheduling / lease
  next_sync_at         timestamptz not null default now(),
  claimed_at           timestamptz,
  -- salud
  last_attempt_at      timestamptz,
  last_success_at      timestamptz,
  consecutive_failures int  not null default 0,
  last_error           text,
  last_http_status     int,
  last_etag            text,
  last_payload_hash    text,
  last_event_count     int,
  dead_alert_sent_at   timestamptz,
  unique (property_id, url)
);
create index cal_feeds_due_idx on public.calendar_feeds (next_sync_at) where is_active;
```

```sql
create table public.calendar_reservations (
  id               uuid primary key default gen_random_uuid(),
  feed_id          uuid not null references public.calendar_feeds(id) on delete cascade,
  property_id      uuid not null references public.properties(id) on delete cascade,
  uid              text not null,          -- VEVENT UID (…@airbnb.com / …@booking.com)
  reservation_code text,                   -- HM… extraído de la Reservation URL del DESCRIPTION
  starts_on        date not null,          -- DTSTART;VALUE=DATE
  ends_on          date not null,          -- DTEND;VALUE=DATE = fin de bloqueo = fecha del aseo
  summary          text,
  raw_description  text,
  payload_hash     text not null,          -- hash del VEVENT normalizado, detecta cambios
  first_seen_at    timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  disappeared_at   timestamptz,
  constraint res_dates_ok check (ends_on > starts_on),
  unique (feed_id, uid)
);
create index cal_res_prop_end_idx  on public.calendar_reservations (property_id, ends_on)
  where disappeared_at is null;
create index cal_res_code_idx      on public.calendar_reservations (property_id, reservation_code)
  where reservation_code is not null;
```

**Formato real de Airbnb (post dic-2019).** El `VEVENT` es de día completo (`DTSTART;VALUE=DATE` / `DTEND;VALUE=DATE`), `SUMMARY` es `Reserved` o `Not available`, y `DESCRIPTION` trae `Reservation URL: https://www.airbnb.com/hosting/reservations/details/HMxxxxxxxx` más los últimos 4 dígitos del teléfono. **El código único de reserva se extrae del último segmento de esa URL**, no del `SUMMARY` (las muestras antiguas con `SUMMARY: Nombre (HMxxxx)` son pre-2019 y ya no se emiten). Booking.com no expone un código de reserva utilizable: para esos feeds la detección de extensión mal creada debe degradarse a heurística por fechas y marcar `needs_review`. Confianza MEDIA: hay que validar contra un feed real de la operación antes de codificar el regex.

`DTEND` en eventos de día completo es **exclusivo**: es el día en que el bloqueo termina, es decir la fecha del aseo. Coincide con la regla de dominio ("el aseo se agenda por el fin del bloqueo"). No restar un día.

### Aseos — la tabla central

```sql
create table public.cleanings (
  id              uuid primary key default gen_random_uuid(),
  property_id     uuid not null references public.properties(id) on delete restrict,
  reservation_id  uuid references public.calendar_reservations(id) on delete set null,

  -- discriminador de gestión, SNAPSHOT (no join vivo contra properties)
  is_managed      boolean not null,
  origin          text not null check (origin in ('ical','manual')),
  tipo            public.cleaning_type not null default 'normal',
  state           public.cleaning_state,          -- NULL sólo si is_managed = false
  scheduled_date  date not null,
  hora_limite     time not null,                  -- snapshot
  is_urgent       boolean not null default false,
  needs_review    boolean not null default false, -- extensión sospechosa
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

  -- SNAPSHOT financiero
  tarifa_huesped  numeric(12,2),
  pago_aseador    numeric(12,2),

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  ---------- gestión externa: fila inerte ----------
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

  ---------- coherencia de la máquina de estados ----------
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
  -- "no puedo" devuelve a pendiente SIN aseador, conservando confirmado_at
  constraint cl_pendiente_shape check (
    state is distinct from 'pendiente' or (started_at is null and finished_at is null)
  ),
  constraint cl_manual_types check (origin = 'manual' or tipo = 'normal')
);
```

**Índices e invariantes duras:**

```sql
-- REGLA DE NEGOCIO: máx 1 aseo ACTIVO por (apartamento, fecha).
-- 'cancelada' no bloquea. state NULL (gestión externa) SÍ participa:
-- NULL IS DISTINCT FROM 'cancelada' → TRUE.
create unique index cleanings_one_active_per_property_date
  on public.cleanings (property_id, scheduled_date)
  where state is distinct from 'cancelada';

-- IDEMPOTENCIA DEL PIPELINE: una reserva genera a lo sumo un aseo vivo.
create unique index cleanings_one_live_per_reservation
  on public.cleanings (reservation_id)
  where reservation_id is not null and state is distinct from 'cancelada';

create index cleanings_agenda_idx      on public.cleanings (scheduled_date, state) where is_managed;
create index cleanings_aseador_idx     on public.cleanings (aseador_id, scheduled_date)
  where aseador_id is not null;
create index cleanings_unconfirmed_idx on public.cleanings (scheduled_date)
  where is_managed and confirmado_at is null and state = 'pendiente';
create index cleanings_review_idx      on public.cleanings (scheduled_date) where needs_review;
```

El truco del índice parcial es el corazón de la regla "un aseo activo por fecha": `WHERE state IS DISTINCT FROM 'cancelada'` deja los cancelados fuera del índice, así que cancelar libera el slot y el pipeline puede re-crear el aseo el mismo día sin conflicto. `IS DISTINCT FROM` (no `<>`) es lo que hace que la fila informativa con `state IS NULL` quede *dentro* del índice, que es lo correcto: tampoco queremos dos filas informativas para el mismo apartamento y día.

### Decisión: gestión externa = misma tabla + discriminador `is_managed`, con `state` anulable

**Recomendación: una sola tabla `cleanings` con `is_managed boolean not null` snapshoteado, `state` anulable y un `CHECK` que fuerza la inercia de la fila.**

Rechazo de las alternativas:

- *Tabla separada* (`informational_cleanings`): duplicaría el pipeline de iCal, la FK a `calendar_reservations`, la retención de 6 meses, y sobre todo el índice de unicidad `(property_id, scheduled_date)` dejaría de ser una sola garantía. Además el requisito de "historial cronológico por apartamento" obligaría a un `UNION` en toda consulta de historia. Coste alto, cero beneficio.
- *Sólo `state` anulable, sin discriminador*: no impide asignar un aseador ni escribir instrucciones en una fila externa. El "sin estado, sin aseador, fuera de métricas" quedaría como convención de código, exactamente lo que el encargo pide evitar.
- *Join vivo contra `properties.gestion_vivaguest`*: si un apartamento cambia de modalidad, todo el histórico cambiaría de naturaleza retroactivamente y las métricas del mes pasado se moverían solas. Por eso el snapshot.

Las métricas filtran siempre `where is_managed` y esa condición vive en las vistas, no en cada query de la UI.

### Decisión: el cálculo financiero es un SNAPSHOT en el aseo, no un cómputo vivo

**Recomendación: `cleanings.tarifa_huesped` y `cleanings.pago_aseador` se copian desde `properties` al insertar, son editables mientras el aseo esté vivo, y se congelan al pasar a `completada`/`cancelada`. `properties` guarda únicamente la tarifa *vigente*.**

Argumento:

1. Las tarifas cambian. Si el margen se calcula con `join properties`, subir el pago al aseador en octubre reescribe la rentabilidad de junio. El histórico deja de ser auditable.
2. El pago mensual al cierre del último día laboral tiene que ser **reproducible**: el número que se le mostró al aseador el 30 de septiembre debe seguir siendo el mismo el 15 de octubre. Con cómputo vivo no lo es.
3. Los aseos `repaso` y `emergencia` admiten tarifa distinta a la del apartamento. El cómputo vivo no tiene dónde ponerla.
4. Un aseo puede reasignarse; si el pago dependiera del aseador y no del apartamento en el futuro, el snapshot ya lo soporta sin migración.

La alternativa "tabla de tarifas con vigencia (`valid_from`/`valid_to`) y lookup temporal" resuelve (1) y (2) pero no (3), y añade una join temporal a cada consulta financiera para 39 unidades. No vale la pena aquí.

```sql
create or replace function public.tg_cleanings_snapshot() returns trigger
language plpgsql set search_path = '' as $$
declare p public.properties%rowtype;
begin
  if tg_op = 'INSERT' then
    select * into strict p from public.properties where id = new.property_id;
    new.is_managed  := p.gestion_vivaguest;
    new.hora_limite := coalesce(new.hora_limite, p.hora_limite);
    if p.gestion_vivaguest then
      new.state          := coalesce(new.state, 'pendiente'::public.cleaning_state);
      new.tarifa_huesped := coalesce(new.tarifa_huesped, p.tarifa_huesped);
      new.pago_aseador   := coalesce(new.pago_aseador,  p.pago_aseador);
    else
      new.state := null;
    end if;
  else
    new.is_managed := old.is_managed;   -- nunca cambia
    if old.state in ('completada','cancelada') then
      new.tarifa_huesped := old.tarifa_huesped;   -- congelado
      new.pago_aseador   := old.pago_aseador;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger cleanings_snapshot before insert or update on public.cleanings
for each row execute function public.tg_cleanings_snapshot();
```

### Checklist ejecutado, evidencia y reportes

```sql
create table public.cleaning_checklist_items (
  id                uuid primary key default gen_random_uuid(),
  cleaning_id       uuid not null references public.cleanings(id) on delete cascade,
  property_room_id  uuid not null references public.property_rooms(id) on delete restrict,
  checklist_task_id uuid not null references public.checklist_tasks(id) on delete restrict,
  room_label        text not null,     -- snapshot: la biblioteca global puede cambiar
  task_label        text not null,     -- snapshot
  requiere_foto     boolean not null,
  sort_order        int not null default 0,
  done_at           timestamptz,
  done_by           uuid references public.profiles(id),
  nota              text,
  unique (cleaning_id, property_room_id, checklist_task_id)
);
create index cci_cleaning_idx on public.cleaning_checklist_items (cleaning_id);
```

El checklist se **materializa al confirmar** (no al crear el aseo): un aseo sin confirmar puede ser cancelado por el sync, y los cuartos del apartamento pueden editarse entre la detección y la confirmación.

```sql
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

create table public.expenses (
  id          uuid primary key default gen_random_uuid(),
  cleaning_id uuid not null references public.cleanings(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete restrict,
  concepto    text not null,
  monto       numeric(12,2) not null check (monto > 0),
  reported_by uuid not null references public.profiles(id),
  created_at  timestamptz not null default now()
);

create table public.missing_item_reports (
  id          uuid primary key default gen_random_uuid(),
  cleaning_id uuid not null references public.cleanings(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete restrict,
  reported_by uuid not null references public.profiles(id),
  created_at  timestamptz not null default now()
);

create table public.missing_item_lines (
  id              uuid primary key default gen_random_uuid(),
  report_id       uuid not null references public.missing_item_reports(id) on delete cascade,
  catalog_item_id uuid references public.missing_item_catalog(id) on delete set null,
  nombre_libre    text,                 -- rama "Otros"
  nombre_snapshot text not null,        -- lo que se mostró al reportar
  cantidad        smallint not null default 1 check (cantidad > 0),
  constraint mil_exactly_one_source check (
       (catalog_item_id is not null and nombre_libre is null)
    or (catalog_item_id is null and nombre_libre is not null
        and length(btrim(nombre_libre)) > 0)
  )
);
```

```sql
create table public.cleaning_photos (
  id                uuid primary key default gen_random_uuid(),
  cleaning_id       uuid not null references public.cleanings(id) on delete cascade,
  kind              text not null check (kind in ('checklist','dano','gasto','faltante')),
  checklist_item_id uuid references public.cleaning_checklist_items(id) on delete cascade,
  damage_id         uuid references public.damages(id) on delete cascade,
  expense_id        uuid references public.expenses(id) on delete cascade,
  missing_report_id uuid references public.missing_item_reports(id) on delete cascade,
  storage_bucket    text not null default 'evidencia',
  storage_path      text not null unique,
  mime_type         text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  bytes             int  not null check (bytes > 0),
  width int, height int,
  taken_at          timestamptz,
  captured_lat numeric(9,6), captured_lng numeric(9,6),
  uploaded_by       uuid not null references public.profiles(id),
  created_at        timestamptz not null default now(),
  constraint photo_exactly_one_owner check (
    (checklist_item_id is not null)::int + (damage_id is not null)::int
  + (expense_id is not null)::int + (missing_report_id is not null)::int = 1
  )
);
create index cleaning_photos_cleaning_idx on public.cleaning_photos (cleaning_id);
```

Orden de migración: `cleanings` → `cleaning_checklist_items` → `damages`/`expenses`/`missing_item_reports` → `cleaning_photos`. Si se quiere un solo archivo, crear `cleaning_photos` sin las FK y añadirlas con `alter table … add constraint`.

### Notificaciones, push y ajustes

```sql
create table public.push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  endpoint        text not null unique,      -- identifica el navegador/instalación
  p256dh          text not null,
  auth            text not null,
  user_agent      text,
  created_at      timestamptz not null default now(),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  failure_count   int not null default 0,
  revoked_at      timestamptz,
  revoked_reason  text
);
create index push_subs_user_idx on public.push_subscriptions (user_id) where revoked_at is null;
```

`endpoint` es único **global**, no por usuario: si otro aseador inicia sesión en el mismo dispositivo, el `upsert on conflict (endpoint)` reasigna `user_id` en vez de crear una segunda suscripción que enviaría el aseo del compañero al teléfono equivocado.

```sql
create table public.notifications (
  id              uuid primary key default gen_random_uuid(),
  recipient_id    uuid not null references public.profiles(id) on delete cascade,
  type            public.notification_type not null,
  title           text not null,
  body            text not null,
  url             text,
  cleaning_id     uuid references public.cleanings(id) on delete cascade,
  property_id     uuid references public.properties(id) on delete cascade,
  payload         jsonb not null default '{}'::jsonb,
  dedupe_key      text,
  read_at         timestamptz,
  -- outbox
  push_status     public.push_status not null default 'pendiente',
  push_attempts   int not null default 0,
  push_last_error text,
  next_attempt_at timestamptz not null default now(),
  created_at      timestamptz not null default now()
);
create unique index notifications_dedupe_idx on public.notifications (recipient_id, dedupe_key)
  where dedupe_key is not null;
create index notifications_outbox_idx on public.notifications (next_attempt_at)
  where push_status = 'pendiente';
create index notifications_inbox_idx on public.notifications (recipient_id, created_at desc)
  where read_at is null;

create table public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
-- retention_months=6, retention_notice_days=15, feed_dead_after_minutes=180,
-- sync_interval_minutes=30, access_code_window_days=1

create table public.storage_deletion_queue (
  id          bigserial primary key,
  bucket      text not null,
  path        text not null,
  enqueued_at timestamptz not null default now(),
  attempts    int not null default 0,
  deleted_at  timestamptz,
  last_error  text,
  unique (bucket, path)
);
create index sdq_pending_idx on public.storage_deletion_queue (enqueued_at) where deleted_at is null;
```

### Vistas (ojo: `security_invoker`)

```sql
-- Sin security_invoker, una vista corre con los privilegios del OWNER y SALTA la RLS
-- de las tablas subyacentes. Es la fuga de datos más común en Supabase.
create view public.v_cleaning_margin
with (security_invoker = on) as
select c.id, c.property_id, c.scheduled_date, c.aseador_id,
       c.tarifa_huesped, c.pago_aseador,
       (c.tarifa_huesped - c.pago_aseador) as margen
from public.cleanings c
where c.is_managed and c.state = 'completada';

create view public.v_carga_diaria
with (security_invoker = on) as
select c.scheduled_date, c.aseador_id, count(*) as aseos,
       count(*) filter (where c.is_urgent) as urgentes
from public.cleanings c
where c.is_managed and c.state in ('pendiente','en_curso','completada')
group by 1, 2;
```

Cierre de mes:

```sql
create or replace function public.last_business_day(p_month date) returns date
language sql immutable set search_path = '' as $$
  select max(d)::date
  from generate_series(date_trunc('month', p_month),
                       date_trunc('month', p_month) + interval '1 month - 1 day',
                       interval '1 day') d
  where extract(isodow from d) < 6
$$;
```

Hueco conocido: no modela festivos colombianos. Si "último día laboral" debe excluir festivos, hace falta una tabla `holidays`. Pendiente de producto.

---

## Hard Constraints — resumen de dónde vive cada regla

| Regla de dominio (PROJECT.md) | Mecanismo | Nivel |
|---|---|---|
| Máx 1 aseo activo por apartamento/fecha | `unique index … where state is distinct from 'cancelada'` | DB |
| Cancelado no bloquea | Índice parcial (arriba) | DB |
| No duplicar aseo por reserva en cada sync | `unique index (reservation_id) where … not cancelada` | DB |
| Apartamento no se activa sin tarifas | `CHECK props_active_requires_rates` | DB |
| Apartamento no se activa sin responsable ni contacto | `CHECK props_active_requires_owner` | DB |
| responsable/suplente sólo si `gestion_vivaguest` | `CHECK props_assignees_only_when_managed` | DB |
| Gestión externa: sin estado, sin aseador, fuera de métricas | `is_managed` + `CHECK cl_unmanaged_is_inert` + `where is_managed` en vistas | DB |
| Máx 3 tareas por tipo de cuarto | `CHECK(slot 1..3)` + `UNIQUE(room_type_id, slot)` | DB |
| Máquina de 4 estados coherente | 4 `CHECK` de forma + RPC para transiciones | DB + RPC |
| Foto obligatoria antes de terminar | Guard agregado en `finish_cleaning()` | RPC |
| Al confirmar se asigna a `responsable_id` | `confirm_cleaning()` | RPC |
| "No puedo" → pendiente sin asignar + alerta | `decline_cleaning()` (transacción única) | RPC |
| Código de acceso sólo para el asignado | Tabla `property_secrets` + RPC `reveal_access_code()` + auditoría | RLS + RPC |
| Instrucciones sólo para el asignado | Viven en la fila `cleanings`; RLS de fila ya las aísla | RLS |
| Acceso revocado al instante al desactivar | Predicado `is_active` leído de la DB en cada policy | RLS |
| Retención 6 meses con aviso previo | `pg_cron` + `storage_deletion_queue` + worker Storage API | Cron |
| Todo en UTC-5 | `today_bog()` + `date` para días, `timestamptz` para instantes | DB |

---

## RLS Policy Design

### Principio

**El grafo de dependencias entre policies debe ser un DAG.** Si la policy de `properties` consulta `cleanings` y la de `cleanings` consulta `properties`, Postgres entra en recursión infinita de políticas. La forma canónica de romper el ciclo es mover el lado "de lookup" a una función `SECURITY DEFINER` en un esquema no expuesto, que salta la RLS de la tabla consultada.

Aquí el DAG es: `properties → cleanings` (vía definer) y `cleanings → nada`. La policy de `cleanings` es deliberadamente plana (`aseador_id = auth.uid()`), sin referencias a `properties`.

### Esquema privado y helpers

```sql
create schema if not exists private;
grant usage on schema private to authenticated;
-- `private` NO se agrega a la lista de esquemas expuestos de PostgREST,
-- por lo que estas funciones no son invocables desde el cliente.

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin' and p.is_active
  )
$$;

create or replace function private.is_active_cleaner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'aseador' and p.is_active
  )
$$;

-- Aseos visibles para el aseador (lectura: incluye histórico corto)
create or replace function private.my_cleaning_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select c.id from public.cleanings c
  where c.aseador_id = (select auth.uid())
    and c.is_managed
    and c.state in ('pendiente','en_curso','completada')
    and c.scheduled_date >= public.today_bog() - 30
$$;

-- Aseos sobre los que puede ESCRIBIR (subir evidencia)
create or replace function private.my_writable_cleaning_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select c.id from public.cleanings c
  where c.aseador_id = (select auth.uid()) and c.is_managed and c.state = 'en_curso'
$$;

-- Apartamentos visibles: sólo aquellos donde tiene trabajo vivo, ventana corta
create or replace function private.my_property_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct c.property_id from public.cleanings c
  where c.aseador_id = (select auth.uid()) and c.is_managed
    and c.state in ('pendiente','en_curso')
    and c.scheduled_date between public.today_bog() - 1 and public.today_bog() + 7
$$;

-- Ventana MUCHO más estrecha para el código de acceso
create or replace function private.my_unlockable_property_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct c.property_id from public.cleanings c
  where c.aseador_id = (select auth.uid()) and c.is_managed
    and c.state in ('pendiente','en_curso')
    and c.scheduled_date between public.today_bog() and public.today_bog() + 1
$$;
```

Tres detalles que importan y que son guía oficial de Supabase:

1. `set search_path = ''` en toda función `SECURITY DEFINER` y todo nombre calificado por esquema, o el privilegio elevado se vuelve un vector de escalada.
2. Envolver siempre en la policy como `(select private.f())`. Postgres lo evalúa como `InitPlan` una vez por sentencia en lugar de una vez por fila.
3. Igual con `(select auth.uid())` en lugar de `auth.uid()` directo.

### Policies

```sql
alter table public.cleanings enable row level security;

create policy cleanings_admin_all on public.cleanings
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy cleanings_cleaner_select on public.cleanings
  for select to authenticated
  using ((select private.is_active_cleaner()) and aseador_id = (select auth.uid()));

-- El aseador NO escribe la tabla directamente:
revoke insert, update, delete on public.cleanings from authenticated;
```

```sql
alter table public.properties enable row level security;

create policy properties_admin_all on public.properties
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy properties_cleaner_select on public.properties
  for select to authenticated
  using ((select private.is_active_cleaner())
     and id in (select private.my_property_ids()));
```

```sql
alter table public.property_secrets enable row level security;

create policy secrets_admin_all on public.property_secrets
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- NO hay policy de lectura para el aseador. El acceso pasa por RPC auditado.
```

```sql
create or replace function public.reveal_access_code(p_cleaning uuid)
returns table (codigo_acceso text, tipo_cerradura text, notas_acceso text)
language plpgsql security definer set search_path = '' as $$
declare v_prop uuid;
begin
  select c.property_id into v_prop
  from public.cleanings c
  where c.id = p_cleaning
    and c.aseador_id = (select auth.uid())
    and c.is_managed
    and c.state in ('pendiente','en_curso')
    and c.scheduled_date between public.today_bog() and public.today_bog() + 1;

  if v_prop is null then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;

  insert into public.access_code_reads (property_id, cleaning_id, read_by)
  values (v_prop, p_cleaning, (select auth.uid()));

  return query
    select s.codigo_acceso, s.tipo_cerradura, s.notas_acceso
    from public.property_secrets s where s.property_id = v_prop;
end $$;

revoke all on function public.reveal_access_code(uuid) from public, anon;
grant execute on function public.reveal_access_code(uuid) to authenticated;
```

Este patrón da tres cosas que una policy de lectura no da: ventana temporal estrecha (hoy y mañana), rastro de auditoría (quién vio qué código y cuándo, relevante si roban un apartamento) y un solo punto donde endurecer la regla.

**Escrituras del aseador — todas por RPC `SECURITY DEFINER`:**

```sql
create or replace function public.finish_cleaning(p_cleaning uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.cleanings c
   where c.id = p_cleaning and c.aseador_id = (select auth.uid())
     and c.state = 'en_curso' for update;
  if not found then raise exception 'no_autorizado' using errcode = '42501'; end if;

  if exists (
    select 1 from public.cleaning_checklist_items i
    where i.cleaning_id = p_cleaning
      and ( i.done_at is null
         or ( i.requiere_foto and not exists (
                select 1 from public.cleaning_photos ph
                 where ph.checklist_item_id = i.id)))
  ) then
    raise exception 'checklist_incompleto' using errcode = 'P0001';
  end if;

  update public.cleanings
     set state = 'completada', finished_at = now()
   where id = p_cleaning;
end $$;
```

Por qué RPC y no `GRANT UPDATE (state, started_at, finished_at)`: los privilegios de columna sí funcionan con RLS, pero no pueden expresar "sólo puedes terminar si todo el checklist tiene foto" ni "'no puedo' debe además limpiar el aseador y encolar una notificación, atómicamente". Los invariantes son multi-fila y transaccionales; el lugar correcto es una función. Mismo patrón para `start_cleaning`, `decline_cleaning`, `report_damage`, `report_expense`, `report_missing_items`, `toggle_checklist_item`.

### Revocación instantánea al desactivar

Hay dos capas y ambas hacen falta.

- **Capa de app:** al desactivar, el Server Action (service role) hace `update profiles set is_active=false` **y** `auth.admin.signOut(userId, 'global')` + ban. `supabase.auth.getUser()` en el middleware consulta al servidor de Auth, así que la próxima navegación ya rebota a `/login`.
- **Capa de datos (la que de verdad revoca):** un access token JWT ya emitido sigue verificando criptográficamente hasta que expira, aunque la sesión esté revocada. Si el rol viviera en un *custom claim* del JWT, ese token seguiría siendo admin/aseador válido hasta 60 minutos después de la desactivación. Por eso **ninguna policy usa claims del JWT para autorizar**: todas leen `profiles.is_active` de la base vía función definer. Un token vivo de un usuario desactivado no ve una sola fila.

Coste: una lectura indexada por sentencia, evaluada una vez gracias al `(select …)`. Con 39 unidades y ~8 aseadores es irrelevante. Complemento barato: bajar el TTL del access token del proyecto a 30 min.

**Sí uso un custom claim de rol**, pero **sólo para ruteo en middleware** (decidir si mando a `(admin)` o a `(cleaner)` sin un round-trip a la base). Es UX, no autorización. Esa distinción debe quedar escrita en el código.

### Cobertura de policies por tabla

| Tabla | Admin | Aseador |
|---|---|---|
| `profiles` | ALL | SELECT propio |
| `properties` | ALL | SELECT vía `my_property_ids()` |
| `property_secrets` | ALL | ninguna (sólo RPC auditado) |
| `property_rooms`, `room_types`, `checklist_tasks` | ALL | SELECT si el `property_id` está en `my_property_ids()` / catálogo global |
| `missing_item_catalog` | ALL | SELECT (globales + de sus apartamentos) |
| `cleanings` | ALL | SELECT propios; escritura sólo por RPC |
| `cleaning_checklist_items` | ALL | SELECT/UPDATE si `cleaning_id in my_cleaning_ids()` (o sólo RPC) |
| `cleaning_photos` | ALL | SELECT `my_cleaning_ids()`, INSERT `my_writable_cleaning_ids()`, sin UPDATE/DELETE |
| `damages`, `expenses`, `missing_item_*` | ALL | INSERT/SELECT propios vía RPC |
| `notifications` | SELECT/UPDATE propias | SELECT/UPDATE propias |
| `push_subscriptions` | — | INSERT/UPDATE/DELETE propias |
| `calendar_feeds`, `calendar_reservations` | SELECT (ALL para service role) | ninguna |
| `access_code_reads`, `app_settings`, `storage_deletion_queue` | SELECT (admin) | ninguna |

Evidencia inmutable: el aseador no tiene `UPDATE` ni `DELETE` sobre `cleaning_photos` ni sobre `storage.objects`. Una foto subida no se puede reemplazar.

Todas estas policies deben tener test `pgTAP` que ejerza el caso negativo (aseador B no ve el aseo de A, aseador desactivado no ve nada, aseador no lee `property_secrets`). Un test de RLS que sólo prueba el caso positivo no prueba nada.

---

## iCal Sync Pipeline

### Dónde corre: pg_cron dispara, Vercel ejecuta, uno por feed

**Recomendación: `pg_cron` como único scheduler + `pg_net` como fan-out + un Route Handler de Next.js (`/api/cron/sync-feed`) que procesa exactamente UN feed por invocación.**

Rechazo de las alternativas:

- *Vercel Cron directo:* en plan Hobby la cadencia máxima es **una vez al día**, lo que hace imposible el requisito de 30 minutos sin pagar Pro. `pg_cron` viene habilitado por defecto en todos los planes de Supabase, incluido el gratuito, con granularidad de segundos. Además Vercel Cron dispararía una sola invocación gorda que recorre 39 feeds: un feed colgado consume el `maxDuration` y mata a los 38 restantes.
- *Supabase Edge Function como worker:* funciona, pero obliga a un segundo runtime (Deno), un segundo pipeline de despliegue y una segunda copia de la lógica de dominio. Además el límite de **2 s de CPU** por invocación es incómodo si algún día hay que parsear feeds grandes. Mantener el parser y el diff en el mismo codebase TypeScript que la app (mismos tipos generados, mismo Zod, mismo `node-ical`) vale más que la proximidad a la base.

El híbrido gana los dos lados: cadencia y aislamiento de `pg_cron`, ergonomía y tipos de Next.js.

```sql
create or replace function public.dispatch_feed_syncs() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0; v_base text; v_secret text;
begin
  select decrypted_secret into v_base   from vault.decrypted_secrets where name = 'app_base_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_shared_secret';

  for r in
    select f.id from public.calendar_feeds f
     where f.is_active
       and f.next_sync_at <= now()
       and (f.claimed_at is null or f.claimed_at < now() - interval '10 minutes')
     order by f.next_sync_at
     limit 60
     for update skip locked
  loop
    update public.calendar_feeds
       set claimed_at = now(), last_attempt_at = now()
     where id = r.id;

    perform net.http_post(
      url     := v_base || '/api/cron/sync-feed',
      headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', v_secret),
      body    := jsonb_build_object('feed_id', r.id),
      timeout_milliseconds := 30000
    );
    n := n + 1;
  end loop;
  return n;
end $$;

select cron.schedule('dispatch-feed-syncs', '*/5 * * * *',
                     $$select public.dispatch_feed_syncs()$$);
```

**Por qué el cron corre cada 5 min si la cadencia es 30:** `next_sync_at` sólo avanza +30 min cuando el sync tiene éxito. Un fallo transitorio deja `next_sync_at` cerca y el feed se reintenta en el siguiente tick de 5 minutos, no dentro de media hora. El cron es el reloj; `next_sync_at` es la política. Backoff exponencial con techo de 60 min sobre `consecutive_failures`.

**Aislamiento por feed, por construcción:** una request HTTP por feed ⇒ una invocación de Vercel por feed. Una excepción en el feed A no puede tocar al feed B: no comparten proceso ni transacción. `pg_net` es asíncrono y *fire-and-forget*, así que el dispatcher nunca se bloquea esperando un feed colgado. El *lease* (`claimed_at` + `FOR UPDATE SKIP LOCKED`) garantiza como máximo un sync en vuelo por feed aunque dos ticks se solapen.

### Worker: `/api/cron/sync-feed`

```
1. Verificar `x-cron-secret` con comparación de tiempo constante. 401 si no.
2. Cargar el feed con cliente service-role.
3. fetch(url, { signal: AbortSignal.timeout(15_000),
                headers: { 'If-None-Match': last_etag } })
4. 304 Not Modified            → éxito, cero trabajo, avanzar next_sync_at.
5. hash(body) === last_payload_hash → éxito, cero trabajo (Airbnb reemite igual cada ~3 h).
6. Validar ANTES de parsear:
     - el cuerpo empieza por BEGIN:VCALENDAR
     - Content-Type no es text/html (páginas de error devueltas con 200)
   Si no → tratar como fallo, NO diffear.
7. Parsear con node-ical. GUARDA CRÍTICA:
     if (eventos.length === 0 && feed.last_event_count > 0) → fallo, NO diffear.
8. Diff completo en UNA transacción (paso siguiente).
9. Éxito → next_sync_at = now() + 30 min, consecutive_failures = 0,
            last_success_at = now(), claimed_at = null, guardar etag/hash/count.
   Fallo  → consecutive_failures += 1,
            next_sync_at = now() + least(power(2, failures), 60) * interval '1 min',
            claimed_at = null, last_error, last_http_status.
```

El paso 7 es el que evita la catástrofe operativa del dominio: si Airbnb devuelve 200 con un cuerpo vacío o una página de mantenimiento, un differ ingenuo concluye "todas las reservas desaparecieron" y **cancela todos los aseos del apartamento**. Un feed vacío nunca se interpreta como cancelación masiva.

### El diff, en una transacción

```
a. UPSERT de reservas por (feed_id, uid): last_seen_at = now(), disappeared_at = null,
   actualizar fechas y payload_hash.
b. Marcar disappeared_at = now() en reservas del feed no vistas en esta pasada
   (y que no lo estuvieran ya).
c. CREAR aseos: por cada reserva viva con ends_on >= today_bog() sin aseo vivo,
   insert cleaning(property_id, reservation_id, scheduled_date = ends_on,
                   origin='ical', tipo='normal').
   Idempotente por los dos índices únicos parciales.
   ON CONFLICT DO NOTHING sobre (property_id, scheduled_date) es un choque legítimo:
   ya hay un aseo activo ese día → registrar y no duplicar.
d. CANCELAR aseos: por cada reserva desaparecida o con ends_on movido,
   cancelar el aseo asociado SÓLO si state = 'pendiente' y started_at is null.
   NUNCA cancelar un aseo con started_at o state = 'completada':
   el trabajo ya ocurrió. En ese caso marcar needs_review y notificar al admin.
e. URGENCIA: is_urgent = exists(reserva viva del mismo apartamento
   con starts_on = scheduled_date). Se recalcula en cada pasada, no se acumula.
f. EXTENSIÓN SOSPECHOSA (needs_review = true) si:
   - aparece una reserva nueva cuyo reservation_code ya existe en el apartamento
     con fechas distintas; o
   - una reserva se acorta/desaparece y aparece otra que empieza exactamente
     en su ends_on con código distinto (patrón "extensión creada como reserva nueva").
   Nunca se auto-resuelve: sólo se marca y se notifica.
g. Encolar notificaciones en `notifications` (dedupe_key evita spam entre pasadas).
```

Transacción única por feed ⇒ si el paso (d) falla, tampoco quedan a medias los pasos (a)–(c). Nada de estado parcial.

### Watchdog de feed muerto: alertar por obsolescencia, no por error

```sql
create or replace function public.feed_health_watchdog() returns void
language sql security definer set search_path = '' as $$
  with dead as (
    select f.id, f.property_id from public.calendar_feeds f
     where f.is_active
       and (f.last_success_at is null or f.last_success_at < now() - interval '3 hours')
       and (f.dead_alert_sent_at is null or f.dead_alert_sent_at < now() - interval '6 hours')
  ), ins as (
    insert into public.notifications
      (recipient_id, type, title, body, property_id, dedupe_key)
    select a.id, 'calendario_caido', 'Calendario sin responder',
           'Un feed lleva más de 3 horas sin sincronizar.', d.property_id,
           'feed_dead:' || d.id || ':' || to_char(date_trunc('hour', now()),'YYYYMMDDHH24')
      from dead d cross join public.profiles a
     where a.role = 'admin' and a.is_active
    on conflict do nothing
    returning 1
  )
  update public.calendar_feeds set dead_alert_sent_at = now()
   where id in (select id from dead);
$$;
select cron.schedule('feed-health-watchdog', '7 * * * *',
                     $$select public.feed_health_watchdog()$$);
```

Alertar por obsolescencia de `last_success_at` (y no por captura de errores) cubre también el caso en que el worker nunca llegó a correr: Vercel caído, `pg_net` fallando, secreto rotado. Un sistema que sólo alerta cuando su propio código de error se ejecuta es ciego a su propia caída. Umbral de 3 h alineado con el refresco real de Airbnb (~3 h), así no hay falsos positivos.

### Resumen de idempotencia

| Riesgo | Mecanismo |
|---|---|
| Doble tick del cron | `claimed_at` + `FOR UPDATE SKIP LOCKED` |
| Reintento del worker | `unique (feed_id, uid)` en reservas |
| Aseo duplicado por reserva | `unique index (reservation_id) where … not cancelada` |
| Aseo duplicado por día | `unique index (property_id, scheduled_date) where … not cancelada` |
| Fallo parcial en el diff | Una transacción por feed |
| Feed vacío/HTML con 200 | Guarda de conteo + validación de `Content-Type` |
| Notificación repetida | `dedupe_key` único parcial |
| Feed muerto silencioso | Watchdog por obsolescencia |

---

## Storage Architecture

**Bucket privado único `evidencia`.** Nunca público. El aseador sube directo desde el navegador con su JWT; las policies de `storage.objects` autorizan.

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidencia','evidencia', false, 10485760,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
```

**Convención de ruta:** `{cleaning_id}/{kind}/{uuid}.{ext}`

Ejemplo: `9f1c…/checklist/2b7e….webp`. El `cleaning_id` va **primero** para que `(storage.foldername(name))[1]` lo devuelva directamente y las policies sean baratas. La ruta no contiene `property_id` ni nada que se pueda enumerar. El nombre de archivo es un UUID nuevo, nunca el nombre original del dispositivo.

```sql
create policy evidencia_admin_all on storage.objects
  for all to authenticated
  using      (bucket_id = 'evidencia' and (select private.is_admin()))
  with check (bucket_id = 'evidencia' and (select private.is_admin()));

create policy evidencia_cleaner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'evidencia'
    and (select private.is_active_cleaner())
    and (storage.foldername(name))[1]
        in (select id::text from private.my_writable_cleaning_ids() as id)
  );

create policy evidencia_cleaner_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'evidencia'
    and (select private.is_active_cleaner())
    and (storage.foldername(name))[1]
        in (select id::text from private.my_cleaning_ids() as id)
  );
-- Sin UPDATE ni DELETE para el aseador: la evidencia es inmutable.
```

Comparación como `text`, no casteando el segmento a `uuid`: un path malformado haría fallar el cast dentro de la policy con un error de tipo en vez de un simple deny.

**Entrega:** nunca URLs públicas. El Server Component verifica acceso y emite `createSignedUrl(path, 120)` (TTL 60–300 s). Para grillas de miniaturas, `createSignedUrls(paths, ttl)` en lote y `transform: { width, quality }` para no bajar el original.

**Retención de 6 meses.** Hecho crítico verificado: **borrar filas de `storage.objects` por SQL NO borra el objeto del bucket, lo deja huérfano y facturándose.** El borrado tiene que pasar por la Storage API. De ahí el orden de tres pasos:

```sql
create or replace function public.purge_expired() returns void
language plpgsql security definer set search_path = '' as $$
declare v_cut date := public.today_bog()
        - ((select (value->>0)::int from public.app_settings where key='retention_months')
           * interval '1 month');
begin
  -- 1) capturar rutas ANTES de borrar filas
  insert into public.storage_deletion_queue (bucket, path)
  select ph.storage_bucket, ph.storage_path
    from public.cleaning_photos ph
    join public.cleanings c on c.id = ph.cleaning_id
   where c.scheduled_date < v_cut
  on conflict (bucket, path) do nothing;

  -- 2) borrar el histórico relacional (cascada a checklist/fotos/daños/gastos/faltantes)
  delete from public.cleanings          where scheduled_date < v_cut;
  delete from public.calendar_reservations where ends_on     < v_cut;
  delete from public.notifications      where created_at     < v_cut;

  -- 3) delegar el borrado de objetos al worker (Storage API)
  perform net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='app_base_url')
           || '/api/cron/purge-storage',
    headers := jsonb_build_object('x-cron-secret',
       (select decrypted_secret from vault.decrypted_secrets where name='cron_shared_secret')),
    body := '{}'::jsonb);
end $$;

select cron.schedule('retention-purge', '0 8 * * *', $$select public.purge_expired()$$); -- 03:00 Bogotá
select cron.schedule('retention-notice','0 13 * * *', $$select public.notify_retention()$$); -- 08:00 Bogotá
```

El worker `purge-storage` drena la cola en lotes de ≤500 con `storage.from('evidencia').remove(paths)` (el límite duro de la API es 1000), marca `deleted_at` por lote e incrementa `attempts` en los que fallen. La cola es independiente de `cleanings`, así que el paso 2 puede completarse aunque el paso 3 falle: el borrado de objetos es reintentable indefinidamente sin haber perdido las rutas. El orden inverso (borrar filas primero) huerfaniza archivos para siempre.

`notify_retention()` inserta una notificación para los admins cuando faltan `retention_notice_days` (default 15, valor pendiente de producto) para que un bloque de historial cruce el corte, con `dedupe_key` mensual.

---

## Notification Architecture

**Recomendación: patrón outbox. Ni triggers que llaman `pg_net` directo, ni envíos inline en el Server Action.** Todo evento inserta una fila en `notifications`; un único despachador la drena y envía.

Por qué no **trigger → `pg_net` directo**:
- `pg_net` no puede firmar el JWT VAPID (ES256) ni cifrar el payload con `aes128gcm`. Igual harías falta un worker HTTP, así que el trigger no ahorra una pieza: sólo pierde el registro.
- `pg_net` es *fire-and-forget*: sin reintentos, sin manejo de `410 Gone`, sin visibilidad más allá de una fila en `net._http_response` con TTL corto.
- Un aseador con 3 dispositivos exige 3 envíos y 3 resultados distintos. Eso no cabe en un trigger.

Por qué no **envío inline en el Server Action**:
- Le pega la latencia de N pushes al usuario que confirma el aseo.
- Un push service lento hace fallar la mutación de negocio, que ya está confirmada.
- Los eventos originados en la base (hora límite vencida, aseo creado por el sync, feed caído) **nunca pasan por el app layer**. Habría dos caminos de envío distintos y sólo uno probado.

El outbox unifica los tres orígenes de evento (Server Action, trigger de DB, `pg_cron`) en un solo camino de envío, reintentable y observable.

```sql
create or replace function public.dispatch_notifications() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.notifications
              where push_status = 'pendiente' and next_attempt_at <= now() limit 1) then
    perform net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name='app_base_url')
             || '/api/cron/dispatch-notifications',
      headers := jsonb_build_object('x-cron-secret',
         (select decrypted_secret from vault.decrypted_secrets where name='cron_shared_secret')),
      body := '{}'::jsonb);
  end if;
end $$;
select cron.schedule('dispatch-notifications', '* * * * *',
                     $$select public.dispatch_notifications()$$);
```

Worker `/api/cron/dispatch-notifications`:

```
1. Reclamar hasta 200 filas: UPDATE … SET push_attempts = push_attempts + 1,
   next_attempt_at = now() + interval '5 minutes'
   WHERE id IN (SELECT id … FOR UPDATE SKIP LOCKED) RETURNING *;
   (reclamar-primero: si el worker muere, la fila reaparece en 5 min, no se pierde)
2. Por notificación, resolver push_subscriptions activas del recipient.
3. webpush.sendNotification(sub, JSON.stringify({title, body, url, tag: dedupe_key}))
4. Por resultado:
   - 201/200          → sub.last_success_at = now(), failure_count = 0
   - 404 | 410 Gone   → push_subscriptions.revoked_at = now(),
                        revoked_reason = 'gone'   (la sub está muerta, RFC 8030)
   - 429 | 5xx        → dejar pendiente, backoff exponencial
   - 400/403          → error de VAPID: no reintentar, marcar 'fallido' y alertar
5. push_status = 'enviado' si al menos una sub aceptó;
   'descartado' si el usuario no tenía ninguna suscripción activa
   (dato que alimenta el banner "no has activado las notificaciones");
   'fallido' tras N intentos.
```

**Fanout por evento:**

| Evento | Origen | Destinatario | `dedupe_key` |
|---|---|---|---|
| Asignación en firme | `confirm_cleaning()` RPC | aseador asignado | `assign:{cleaning}:{aseador}` |
| Reasignación | Server Action admin | nuevo aseador (+ retiro al anterior) | `assign:{cleaning}:{aseador}` |
| "No puedo" | `decline_cleaning()` RPC | todos los admins activos | `decline:{cleaning}` |
| Daño reportado | trigger `after insert on damages` | todos los admins | `damage:{damage_id}` |
| Faltantes reportados | trigger `after insert on missing_item_reports` | todos los admins | `missing:{report_id}` |
| Gasto reportado | trigger `after insert on expenses` | todos los admins | `expense:{expense_id}` |
| Aseo completado | trigger en transición a `completada` | todos los admins | `done:{cleaning}` |
| Hora límite vencida | `pg_cron` cada 15 min | todos los admins | `deadline:{cleaning}` |
| Feed caído | watchdog horario | todos los admins | `feed_dead:{feed}:{hora}` |
| Extensión sospechosa | worker de sync | todos los admins | `review:{cleaning}` |
| Aviso de retención | `pg_cron` diario | todos los admins | `retention:{YYYYMM}` |

**Panel de alertas del admin: vista, no filas.** Las alertas derivables del estado actual (urgentes, hora límite vencida, sin confirmar, calendario caído, extensión pendiente de revisar) se calculan con una vista `v_admin_alerts` que hace `UNION ALL` de condiciones sobre `cleanings` y `calendar_feeds`. Materializarlas como filas obligaría a inventar un mecanismo de "des-alertar" cuando la condición se resuelve, y produciría alertas fantasma. Sólo se persisten como filas los **eventos** (daño, faltante, "no puedo") porque no son función del estado actual. `notifications` sirve para el push; la vista sirve para la pantalla.

**PWA:** `app/manifest.ts` + `public/sw.js` escrito a mano (`push` + `notificationclick`). **No hace falta Serwist**: `next-pwa` está archivado desde 2023 y Serwist sólo aporta si se necesita caching offline, que está fuera de alcance. Añadirlo ahora es complejidad de build sin retorno. Headers obligatorios sobre `/sw.js`: `Cache-Control: no-cache, no-store, must-revalidate`.

En iOS, Web Push exige la PWA instalada en pantalla de inicio (16.4+) y el permiso debe pedirse dentro de un gesto del usuario. De ahí el requisito del banner persistente de ayuda: `push_status = 'descartado'` (usuario sin suscripción viva) es exactamente la señal que lo debe encender. Apple invalida suscripciones con frecuencia; hay que escuchar `pushsubscriptionchange` en el service worker y re-registrar.

---

## Next.js App Structure

```
app/
├── layout.tsx
├── manifest.ts                       # manifiesto PWA
├── (public)/
│   └── login/page.tsx
├── (admin)/
│   ├── layout.tsx                    # guard is_admin + shell de escritorio
│   ├── dia/page.tsx                  # servicios por día
│   ├── sin-confirmar/page.tsx        # bandeja persistente
│   ├── alertas/page.tsx              # lee v_admin_alerts
│   ├── aseos/[id]/page.tsx           # confirmar / reasignar / reprogramar
│   ├── apartamentos/…                # CRUD + historial cronológico
│   ├── aseadores/…                   # alta/baja
│   └── finanzas/page.tsx             # margen y cierre mensual
├── (cleaner)/
│   ├── layout.tsx                    # guard is_active_cleaner + shell móvil
│   ├── mis-aseos/page.tsx            # lista, NO agenda
│   └── aseo/[id]/
│       ├── page.tsx                  # detalle + código de acceso (RPC)
│       ├── checklist/page.tsx
│       └── reportar/page.tsx         # daño / gasto / faltantes
└── api/
    ├── cron/sync-feed/route.ts
    ├── cron/dispatch-notifications/route.ts
    ├── cron/purge-storage/route.ts
    └── health/route.ts
middleware.ts
lib/
├── supabase/{browser,server,middleware,admin}.ts
├── domain/{cleanings,properties,ical,money,dates}.ts
├── push/{vapid,send}.ts
├── cron/auth.ts                      # verificación del secreto compartido
└── database.types.ts                 # generado por `supabase gen types`
public/sw.js
supabase/{migrations,tests,seed.sql}
```

Dos route groups porque las superficies no comparten nada de layout: el admin es escritorio con tablas densas; el aseador es móvil, instalable, de una columna, con el pulgar en la parte baja. Un layout compartido con condicionales sería peor que dos.

**Middleware.** En Next.js 15 el archivo es `middleware.ts` con `export async function middleware`. (Next.js 16 lo renombra a `proxy.ts` / `export function proxy` y ya no soporta edge runtime ahí; `middleware.ts` sigue funcionando con warning. Es un detalle a tener presente al actualizar, y explica por qué la documentación actual de Supabase muestra `proxy`.)

Responsabilidades, en este orden y sin nada entre medias:
1. `createServerClient` con el bridge de cookies get/set.
2. `await supabase.auth.getUser()` — **nunca `getSession()`** en servidor: sólo `getUser()` valida contra el servidor de Auth, que es lo que hace que la desactivación se note en la siguiente navegación.
3. Sin usuario y ruta protegida → redirect a `/login`.
4. Ruteo por rol usando el claim del JWT (barato, no autoritativo): admin en `/mis-aseos` → redirect a `/dia`, y viceversa.
5. Devolver el `supabaseResponse` **tal cual**, sin reconstruirlo, o se desincronizan las cookies y los usuarios se deslogean solos.

Matcher que excluya `_next/static`, `_next/image`, `favicon.ico`, imágenes, `sw.js`, `manifest.webmanifest` y `/api/cron/*` (esos se autentican por secreto, no por cookie).

**Server Actions vs Route Handlers:**

| Usar | Para |
|---|---|
| **Server Actions** | Toda mutación iniciada por una persona: confirmar, reasignar, reprogramar, CRUD de apartamentos/aseadores, empezar/terminar/"no puedo" (envolviendo el RPC), reportar daño/gasto/faltantes, marcar ítem del checklist, guardar suscripción push |
| **Route Handlers** | Todo llamador que no es un navegador con sesión: los tres `/api/cron/*` invocados por `pg_net`, `/api/health`. También cualquier cosa que necesite status/headers propios |

Advertencia que hay que dejar escrita en el código: **un Server Action es un endpoint HTTP público**. Que el botón sólo se renderice en `(admin)` no autoriza nada. Cada action empieza con `getUser()` + verificación de rol y usa el cliente con JWT de usuario, de modo que la RLS es la última línea real de defensa.

**Clave `service_role` — dónde sí y dónde no:**

| Permitido | Prohibido |
|---|---|
| `/api/cron/sync-feed`, `dispatch-notifications`, `purge-storage`, tras validar el secreto | Cualquier Server Component o página |
| `auth.admin.createUser` al dar de alta un aseador | Cualquier Server Action alcanzable por un aseador |
| `auth.admin.signOut(id,'global')` + ban al desactivar | `middleware.ts` |
| Seeds y scripts de mantenimiento | Como atajo cuando "la RLS estorba" |

`lib/supabase/admin.ts` empieza con `import 'server-only'` y es el **único** archivo que lee `SUPABASE_SERVICE_ROLE_KEY`. Un test de arquitectura en CI (grep) debe fallar el build si alguien la importa desde `app/(admin)` o `app/(cleaner)`.

Todos los `/api/cron/*` usan `export const runtime = 'nodejs'` (`web-push` y `node-ical` necesitan APIs de Node), `export const dynamic = 'force-dynamic'` y comparación de secreto en tiempo constante.

---

## Data Flow

### Flujo 1 — Checkout detectado → aseo ejecutado

```
Airbnb/Booking iCal
   │  (cada 5 min pg_cron evalúa; cada feed cada 30 min)
   ▼
dispatch_feed_syncs()  ──pg_net──►  /api/cron/sync-feed  (1 feed por invocación)
                                          │ fetch + parse + validar
                                          ▼
                            calendar_reservations (upsert por uid)
                                          │ diff en 1 transacción
                                          ▼
                            cleanings (state='pendiente', confirmado_at=null)
                                          │  índices parciales = idempotencia
                                          ▼
                       Dashboard admin ─ bandeja "Sin confirmar"
                                          │ admin escribe huéspedes + instrucciones
                                          ▼
                       Server Action ──► confirm_cleaning() RPC
                                          │ asigna responsable_id
                                          │ materializa checklist
                                          │ inserta notificación 'asignacion'
                                          ▼
                       dispatch-notifications ──► Web Push ──► PWA del aseador
                                          │
                                          ▼
                       start_cleaning() → fotos a Storage → toggle_checklist_item()
                                          │
                                          ▼
                       finish_cleaning()  [guard: checklist completo con foto]
                                          │
                                          ▼
                       notificación 'aseo_completado' → admin
                       snapshot financiero congelado → v_cleaning_margin
```

### Flujo 2 — Lectura del aseador (aislamiento)

```
PWA  ──JWT de usuario──►  RSC  ──supabase(user).from('cleanings')──►  Postgres
                                                                        │ RLS
                                       cleanings_cleaner_select: aseador_id = auth.uid()
                                                                        │
                                       properties_cleaner_select: id in my_property_ids()
                                                                        │  (SECURITY DEFINER
                                                                        │   rompe el ciclo)
                                       property_secrets: SIN policy de lectura
                                                                        │
                                       reveal_access_code(cleaning) ─► audita + devuelve
```

En ningún punto el servidor filtra en aplicación: filtra la base. Si un Server Action olvidara el `where`, la RLS igual devuelve sólo lo del usuario.

### Flujo 3 — Evento → push

```
 origen A: Server Action / RPC ─┐
 origen B: trigger de tabla     ├─► INSERT notifications(push_status='pendiente')
 origen C: pg_cron              ─┘                    │
                                                      ▼
                        dispatch_notifications() (1/min) ──pg_net──►
                        /api/cron/dispatch-notifications
                                 │ reclama con SKIP LOCKED
                                 │ web-push por suscripción
                                 ├─ 201 → last_success_at
                                 ├─ 410/404 → push_subscriptions.revoked_at
                                 └─ 5xx → backoff, sigue pendiente
```

---

## Anti-Patterns

### 1. `service_role` en render de páginas
**Qué hace la gente:** usa el cliente admin en un Server Component "porque la RLS no dejaba ver".
**Por qué está mal:** desactiva de golpe todo el modelo de seguridad; el aislamiento del aseador desaparece y el bug es invisible en review.
**En su lugar:** arreglar la policy. Si la policy es difícil, es porque el modelo de datos está mal (ver `property_secrets`).

### 2. Vistas sin `security_invoker`
**Qué hace la gente:** crea `create view v_x as select …` y la expone.
**Por qué está mal:** la vista corre con privilegios del owner y **salta la RLS** de las tablas base. Es la fuga más común en Supabase.
**En su lugar:** `with (security_invoker = on)` en toda vista de `public`.

### 3. Calcular el margen contra `properties` en vivo
**Qué hace la gente:** `join properties` para obtener tarifas en el reporte.
**Por qué está mal:** un cambio de tarifa reescribe el histórico y el pago mensual deja de ser reproducible.
**En su lugar:** snapshot en `cleanings`, congelado al cerrar.

### 4. Cancelar aseos cuando el feed vuelve vacío
**Qué hace la gente:** `reservas presentes = []` ⇒ marcar todo desaparecido.
**Por qué está mal:** una página de error de Airbnb servida con 200 borra la operación de un apartamento entero.
**En su lugar:** validar `BEGIN:VCALENDAR`, `Content-Type` y `eventos.length > 0 || last_event_count === 0` antes de diffear.

### 5. Cancelar un aseo ya empezado o completado
**Qué hace la gente:** aplicar la cancelación del calendario sin mirar el estado.
**Por qué está mal:** el aseador ya fue, ya limpió, y hay que pagarle. Borrarlo destruye la evidencia y el pago.
**En su lugar:** cancelar sólo `pendiente` sin `started_at`; en el resto marcar `needs_review` y notificar.

### 6. `current_date` en jobs, policies e índices
**Qué hace la gente:** asume que la base está en hora de Bogotá.
**Por qué está mal:** entre las 19:00 y medianoche `current_date` ya es mañana en UTC; el aseador pierde acceso al código y el job de deadline se dispara con 5 horas de desfase.
**En su lugar:** `public.today_bog()` en todas partes.

### 7. Confiar en el claim de rol del JWT para autorizar
**Qué hace la gente:** `auth.jwt() ->> 'role' = 'admin'` en la policy.
**Por qué está mal:** el token sobrevive a la desactivación hasta su expiración. El requisito es invalidación **inmediata**.
**En su lugar:** leer `profiles.is_active` desde una función definer. El claim, sólo para ruteo.

### 8. Borrar objetos de Storage con `delete from storage.objects`
**Qué hace la gente:** borra las filas y da la retención por hecha.
**Por qué está mal:** el archivo queda huérfano en el bucket y sigue facturando; nunca más se puede referenciar para borrarlo.
**En su lugar:** encolar rutas → borrar filas → Storage API `remove()` en lotes.

### 9. Un solo cron gordo que recorre los 39 feeds
**Qué hace la gente:** `for (const feed of feeds) await sync(feed)` en una invocación.
**Por qué está mal:** un feed que cuelga consume el `maxDuration` y los siguientes no corren. El fallo se propaga.
**En su lugar:** fan-out con `pg_net`, una invocación por feed.

### 10. Trigger que llama `pg_net` para mandar el push
**Qué hace la gente:** `after insert on damages` → `net.http_post` al servicio de push.
**Por qué está mal:** sin reintentos, sin manejo de `410`, sin visibilidad, y aun así necesita un worker que firme VAPID.
**En su lugar:** outbox en `notifications` + un despachador.

### 11. Materializar como filas alertas que son función del estado
**Qué hace la gente:** insertar una fila `alert` cuando un aseo se vuelve urgente.
**Por qué está mal:** hay que inventar el "des-alertar" cuando deja de serlo; en la práctica quedan alertas fantasma y el admin deja de mirar el panel.
**En su lugar:** vista `v_admin_alerts` para lo derivable; filas sólo para eventos.

---

## Scaling Considerations

39 unidades, ~8 aseadores, decenas de aseos/día. Esto no es un problema de escala; es un problema de correctitud. Aun así, qué se rompe primero:

| Escala | Ajustes |
|---|---|
| Hoy (39 unidades, ~50 feeds) | Nada. Un dispatch cada 5 min, 50 invocaciones/30 min. Cabe holgado en cualquier plan. |
| 200 unidades / ~400 feeds | El `limit 60` del dispatcher se queda corto: subirlo o escalonar por `next_sync_at`. Vigilar `net._http_response` (TTL de 6 h, crece). Añadir `PARTITION BY RANGE (scheduled_date)` a `cleanings` sólo si la retención de 6 meses dejara de ser suficiente. |
| 1000+ unidades | Sustituir el fan-out `pg_net` por una cola real (`pgmq`) con reintentos y DLQ. Separar el worker de sync a un servicio con concurrencia controlada. Mover fotos a un bucket con lifecycle nativo. |

**Primer cuello real:** el coste de Storage. Con checklist obligatorio con foto por tarea, 3 tareas × N cuartos × decenas de aseos/día se acumula rápido. Mitigación desde el día uno: comprimir en el cliente (`canvas` → WebP ~1600 px, calidad 0.75), `file_size_limit` de 10 MB en el bucket y la retención de 6 meses funcionando de verdad. No es un problema futuro: es el que aparece en el mes 2.

**Segundo cuello:** el fanout de notificaciones a admins. Cada daño/faltante/"no puedo" hace `cross join profiles where role='admin'`. Con 2-3 admins es trivial; si crecen, conviene un canal por tipo con preferencias.

---

## Integration Points

### Servicios externos

| Servicio | Patrón | Gotchas |
|---|---|---|
| Airbnb iCal | HTTP GET de `.ics`, sin auth (URL secreta) | Refresco ~3 h del lado de Airbnb; latencia aceptada. Sin nombre de huésped desde dic-2019. Código de reserva sólo dentro de `Reservation URL` en `DESCRIPTION`. Eventos de día completo, `DTEND` exclusivo. Puede devolver 200 con HTML. |
| Booking.com iCal | Igual | No expone código de reserva utilizable ⇒ la detección de extensión mal creada degrada a heurística de fechas. `SUMMARY` suele ser `CLOSED - Not available`. |
| Web Push (FCM/APNs/Mozilla) | `web-push` con VAPID | APNs es estricto con el formato del `subject` VAPID (`mailto:`). iOS exige PWA instalada. `410 Gone` ⇒ borrar suscripción. Escuchar `pushsubscriptionchange`. |
| Supabase Storage | SDK con JWT de usuario para subir; service role para purgar | Borrar por SQL huerfaniza. `remove()` tope 1000 rutas. Signed URLs de vida corta. |
| Google Maps | Sólo un link `https://maps.google.com/?q=lat,lng` | Sin API key, sin SDK. Guardar lat/lng además de la URL por si se pega una URL acortada que caduca. |
| Supabase Vault | Guarda `app_base_url` y `cron_shared_secret` para `pg_net` | Nunca hardcodear secretos en la definición del cron: quedan en `cron.job` en texto plano. |

### Fronteras internas

| Frontera | Comunicación | Nota |
|---|---|---|
| Postgres ↔ workers | `pg_net` HTTP + secreto compartido | Unidireccional, asíncrono, fire-and-forget. Los workers responden escribiendo en la base, no en el HTTP response. |
| App ↔ Postgres (usuario) | PostgREST con JWT de usuario | Toda lectura pasa por RLS. Sin excepciones. |
| App ↔ Postgres (sistema) | service role, sólo en `/api/cron/*` y admin de usuarios | Aislado en `lib/supabase/admin.ts` con `server-only` |
| `(admin)` ↔ `(cleaner)` | Ninguna. Sólo comparten `lib/domain` | Cero componentes compartidos; se comunican por el estado de la base |
| Server Action ↔ invariantes | RPC `SECURITY DEFINER` | Las transiciones de estado no se hacen con `update` sueltos |

---

## Build Order

Schema-first es mandatorio. Las tres primeras fases son estrictamente secuenciales; después el grafo se abre.

```
F1 Fundación ─► F2 Schema núcleo ─► F3 Schema operativo ─► F4 RLS + Storage
                                                              │
        ┌────────────┬────────────┬──────────────┬────────────┴───────┐
        ▼            ▼            ▼              ▼                    ▼
   F5 Auth+       F6 Pipeline  F7 Notif.    F8 Retención        F9 Finanzas
   middleware        iCal        infra                            (vistas)
        │            │            │
        ├────────────┴────────────┤
        ▼                         ▼
   F10 Dashboard admin       F11 PWA aseador
   (día, sin confirmar,      (lista, detalle, checklist,
    alertas, CRUD, historial) evidencia, reportes)
```

| # | Fase | Depende de | Entrega |
|---|---|---|---|
| **F1** | Fundación | — | Repo, proyecto Supabase, `supabase/migrations`, `supabase db reset` en CI, pgTAP, typegen, deploy vacío en Vercel |
| **F2** | Schema núcleo | F1 | Enums, `today_bog()`, `profiles` (+trigger sobre `auth.users`), `properties` con sus 5 CHECK, `property_secrets`, `room_types`, `checklist_tasks`, `property_rooms`, `missing_item_catalog`. Seed de los 8 clusters y 39 unidades |
| **F3** | Schema operativo | F2 | `calendar_feeds`, `calendar_reservations`, `cleanings` + trigger de snapshot + los dos índices únicos parciales, checklist ejecutado, fotos, daños, gastos, faltantes, `notifications`, `push_subscriptions`, `app_settings`, `storage_deletion_queue`, `access_code_reads`. Tests pgTAP de cada invariante |
| **F4** | RLS + Storage | F3 | Esquema `private`, helpers definer, policies de todas las tablas, RPCs (`confirm`/`start`/`finish`/`decline`/`reveal_access_code`/reportes), bucket `evidencia` + policies. **Suite pgTAP con casos negativos** |
| **F5** | Auth y ruteo | F4 | Login, `middleware.ts`, guards de layout, alta/baja de aseadores con `signOut` global, `lib/supabase/*`, test de arquitectura del service role |
| **F6** | Pipeline iCal | F4 | `dispatch_feed_syncs()`, `/api/cron/sync-feed`, parser + diff + guardas, urgencia, extensión sospechosa, watchdog, jobs de `pg_cron`. Fixtures de `.ics` para tests del differ |
| **F7** | Notificaciones | F4 | VAPID, `manifest.ts`, `public/sw.js`, suscripción, `dispatch_notifications()`, worker con manejo de 410, triggers de outbox, banner de permiso |
| **F8** | Retención | F4 | `notify_retention()`, `purge_expired()`, `/api/cron/purge-storage`, jobs |
| **F9** | Finanzas | F3 | `v_cleaning_margin`, `v_carga_diaria`, `last_business_day()`, pantalla de cierre mensual |
| **F10** | Dashboard admin | F5, F6, F7 | Día, bandeja sin confirmar, confirmar en un paso, reasignar, reprogramar, aseos manuales, `v_admin_alerts`, buscador, historial, carga diaria |
| **F11** | PWA aseador | F5, F7 | Lista de aseos, detalle + código, empezar/terminar, checklist con foto obligatoria, "no puedo", reportes |

**Paralelizable:**
- **F6, F7, F8, F9 son independientes entre sí** una vez cerrada F4. Cuatro frentes simultáneos. F6 y F7 son los de mayor riesgo técnico; conviene arrancarlos primero.
- **F5 puede solaparse con F6/F7/F8** (toca ficheros disjuntos: middleware y auth vs. route handlers de cron).
- **F10 y F11 son paralelos entre sí**: no comparten un solo componente, sólo `lib/domain`. Es la división natural si hay dos personas.
- **F9 puede adelantarse a F4** si hace falta: sólo depende de las columnas de snapshot de F3. Se añaden las policies de las vistas al llegar F4.

**Camino crítico:** F1 → F2 → F3 → F4 → F6 → F10. Todo el valor central ("ningún aseo se pierde") vive ahí. F11 sin F6 no tiene aseos que mostrar.

**No arrancar UI antes de F4.** No por disciplina: porque los tipos generados (`database.types.ts`) y la forma de los RPCs son el contrato de la UI, y cambian con cada migración de F2–F4. Construir pantallas antes garantiza reescribirlas.

---

## Open Questions

1. **Formato real del iCal de la operación.** Hay que capturar un `.ics` real de Airbnb y uno de Booking de la cuenta de VivaGuest antes de fijar el regex del código de reserva. Confianza MEDIA en la forma post-2019; Booking casi seguro no da código utilizable.
2. **"Último día laboral" ¿excluye festivos colombianos?** Si sí, hace falta tabla `holidays`. `last_business_day()` hoy sólo excluye fin de semana.
3. **Plazo de aviso antes del borrado por retención.** Modelado como `app_settings.retention_notice_days`, default 15. Pendiente de producto (ya marcado como abierto en PROJECT.md).
4. **Bogotá 2 (empresa externa con `gestion_vivaguest = true`):** ¿hay un `responsable_id` real o el flujo cae en `contacto_externo`? El CHECK `props_active_requires_owner` acepta ambos, pero si no hay usuario, el aseo confirmado no tiene a quién asignarse ni a quién notificar. Es el hueco más grande del modelo.
5. **Biblioteca de tipos de cuarto y sus tareas.** Bloquea el seed de F2, no el schema.

---

## Sources

- Supabase — Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security (HIGH)
- Supabase — RLS Performance and Best Practices: https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv (HIGH)
- Supabase — Custom Claims & RBAC: https://supabase.com/docs/guides/api/custom-claims-and-role-based-access-control-rbac (HIGH)
- Supabase — Cron: https://supabase.com/docs/guides/cron y https://supabase.com/docs/guides/functions/schedule-functions (HIGH)
- Supabase — pg_net: https://supabase.com/docs/guides/database/extensions/pg_net (HIGH)
- Supabase — Edge Function limits (wall clock 400 s pago / 150 s free, CPU 2 s, 256 MB): https://supabase.com/docs/guides/functions/limits (HIGH)
- Supabase — Delete Objects / data deletion (borrar por SQL huerfaniza; tope 1000 en `remove`): https://supabase.com/docs/guides/storage/management/delete-objects y https://supabase.com/docs/guides/database/postgres/data-deletion (HIGH)
- Supabase — Server-side auth con Next.js (`getUser`, bridge de cookies): https://supabase.com/docs/guides/auth/server-side/creating-a-client (HIGH)
- Supabase — pgTAP / testing de RLS: https://supabase.com/docs/guides/local-development/testing/pgtap-extended (HIGH)
- Next.js — Guía PWA (manifest, service worker, `web-push`, VAPID, iOS 16.4+): https://nextjs.org/docs/app/guides/progressive-web-apps (HIGH)
- Next.js — Renaming Middleware to Proxy (v16): https://nextjs.org/docs/messages/middleware-to-proxy (HIGH)
- Vercel — Cron Jobs y límites (Hobby 1/día, Pro cadencia por minuto, 100 jobs/proyecto): https://vercel.com/docs/cron-jobs/manage-cron-jobs y https://vercel.com/docs/limits (HIGH)
- Pushpad — Web Push error 410 (RFC 8030, limpieza de suscripciones): https://pushpad.xyz/blog/web-push-error-410-the-push-subscription-has-expired-or-the-user-has-unsubscribed (MEDIUM)
- node-ical (parser, tipos TS, RRULE): https://github.com/jens-maus/node-ical (MEDIUM)
- Uplisting — cambios del iCal de Airbnb (dic-2019, `Reservation URL`, sin nombre de huésped): https://www.uplisting.io/blog/how-the-airbnb-icalendar-ical-changes-will-affect-you-and-how-to-avoid-disruption (MEDIUM)
- Muestra de iCal de Airbnb (formato de VEVENT, `VALUE=DATE`, UID `@airbnb.com`): https://github.com/AyoubAchour/airbnb-ical-sample (LOW — muestra con formato pre-2019 en `SUMMARY`)
- Supabase — Expiring objects (patrones de retención con cron + Storage API): https://github.com/orgs/supabase/discussions/20171 (MEDIUM)

---
*Architecture research for: plataforma de operaciones de housekeeping STR sobre Next.js 15 + Supabase*
*Researched: 2026-08-30*
