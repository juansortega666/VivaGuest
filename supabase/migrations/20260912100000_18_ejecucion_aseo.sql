-- ============================================================================
-- 18 — La ejecución del aseo: derogar el bloqueo, darle sitio al motivo del
--      skip, y ponerle moneda al gasto.
--
-- ---------------------------------------------------------------------------
-- POR QUÉ ESTA MIGRACIÓN ES PEQUEÑA, Y CONVIENE SABERLO ANTES DE LEERLA:
--
-- El backend de la Fase 6 ya existía casi entero. `start_cleaning`,
-- `toggle_checklist_item` y `finish_cleaning` están construidos desde la
-- migración 09, y `confirm_cleaning` ya materializa el checklist al confirmar.
-- Lo único que estorbaba era UNA cosa, y es justo la que D-06 cambió.
--
-- ---------------------------------------------------------------------------
-- EL CAMBIO DE SIGNO, Y ES DE PRODUCTO, NO TÉCNICO:
--
--   `finish_cleaning` RECHAZABA con `P0001 checklist_incompleto` cuando quedaba
--   una tarea sin marcar o una tarea con `requiere_foto` sin foto. El
--   comentario de esa función lo declaraba como PWA-07.
--
--   **D-06 lo deroga el 2026-09-12.** Se evaluaron tres opciones y se eligió la
--   del medio:
--     (a) skip libre               -> la evidencia se vuelve opcional de hecho
--     (b) skip con marca ELEGIDA   -> se puede, pero el admin lo ve
--     (c) sin skip                 -> lo que había
--
--   La razón de descartar (c) es de operación, no de comodidad: **un bloqueo
--   deja al aseador atrapado en campo y termina en una llamada telefónica**, que
--   es exactamente la coordinación que este producto existe para eliminar.
--
--   La contrapartida de (b) es que la marca EXISTA y sea visible. Eso es
--   `aseo_sin_evidencia_completa()` más la señal del dashboard (plan 06-10).
--   Sin esa mitad, D-06 sería permiso sin rastro.
--
-- ---------------------------------------------------------------------------
-- POR QUÉ EL MOTIVO ES UN ENUM Y NO UN `text`:
--
--   Se propuso exigir una justificación libre de mínimo 30 palabras. Se
--   descartó, y la razón es de comportamiento humano y no de esquema: un
--   contador de palabras se burla solo (la gente escribe relleno) y castiga a
--   quien tiene una razón legítima pero corta, como "el cuarto estaba cerrado".
--
--   Una lista cerrada, además, **se puede contar**. El día del piloto el admin
--   necesita saber cuántas veces pasa cada cosa, y eso un texto libre no lo da.
--   El campo libre sigue existiendo como `nota`, opcional, obligatorio solo
--   cuando el motivo es `otro`.
--
-- Pone en verde `supabase/tests/09_ejecucion_aseo.test.sql`, que nació rojo.
-- ============================================================================


-- ===========================================================================
-- (a) El motivo, como lista cerrada
-- ===========================================================================
create type public.motivo_sin_evidencia as enum (
  'huesped_dejo_cosas',
  'cuarto_cerrado',
  'sin_luz',
  'otro'
);

comment on type public.motivo_sin_evidencia is
  'Por qué un cuarto quedó sin foto. Lista CERRADA a propósito: se puede contar, y un texto libre no. El campo libre vive en cleaning_room_skips.nota y solo es obligatorio con el motivo otro.';


-- ===========================================================================
-- (b) public.cleaning_room_skips — dónde vive el motivo
-- ===========================================================================
-- Cuelga de `cleanings` y de `property_rooms`, que es la regla 3 del camino a
-- v2 de PROJECT.md: toda tabla nueva cuelga de la raíz, para que el día que la
-- raíz gane el dueño las hijas lo hereden por join en vez de necesitar columna
-- propia.
create table public.cleaning_room_skips (
  id               uuid primary key default gen_random_uuid(),
  cleaning_id      uuid not null references public.cleanings(id)      on delete cascade,
  property_room_id uuid not null references public.property_rooms(id) on delete restrict,

  -- Snapshot, mismo criterio que `cleaning_checklist_items.room_label`: si el
  -- admin renombra el cuarto mañana, este registro sigue diciendo lo que la
  -- aseadora vio cuando lo saltó.
  room_label       text not null,

  motivo           public.motivo_sin_evidencia not null,
  nota             text,

  skipped_by       uuid not null references public.profiles(id),
  created_at       timestamptz not null default now(),

  -- Saltar dos veces el mismo cuarto ACTUALIZA el motivo, no duplica la fila.
  -- Es el árbitro del `on conflict do update` de `skip_room_evidence`.
  constraint crs_cleaning_room_uniq unique (cleaning_id, property_room_id),

  -- `otro` sin explicación no le sirve a nadie: es justo el caso en que el
  -- admin necesita saber qué pasó y la lista cerrada no se lo dice.
  constraint crs_otro_exige_nota check (
    motivo <> 'otro' or (nota is not null and length(btrim(nota)) > 0)
  )
);

comment on table public.cleaning_room_skips is
  'Cuartos que quedaron sin foto, con su motivo de lista cerrada. Consecuencia de D-06: terminar un aseo ya no se bloquea por falta de evidencia, pero queda rastro y el admin lo ve.';

create index crs_cleaning_idx on public.cleaning_room_skips (cleaning_id);


-- ---------------------------------------------------------------------------
-- RLS y grants. Misma disciplina que las otras hijas de `cleanings`: el
-- aseador LEE lo suyo, el admin lee todo, y NADIE tiene DML. Toda mutación
-- pasa por los dos RPC `security definer` de más abajo.
-- ---------------------------------------------------------------------------
alter table public.cleaning_room_skips enable row level security;

create policy crs_admin_all on public.cleaning_room_skips
  for all to authenticated
  using      ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy crs_cleaner_select on public.cleaning_room_skips
  for select to authenticated
  using ((select private.is_active_cleaner())
     and cleaning_id in (select private.my_cleaning_ids()));

grant select on public.cleaning_room_skips to authenticated;

-- Cinturón encima de los tirantes: la migración 07 ya puso
-- `alter default privileges ... revoke all on tables from anon, authenticated`,
-- pero el guardarraíl 4 de `02_guardarrailes.test.sql` no admite excepciones y
-- una tabla nueva es exactamente donde este descuido aparece.
revoke all on public.cleaning_room_skips from anon;


-- ===========================================================================
-- (c) La moneda del gasto — regla 1 del camino a v2
-- ===========================================================================
-- El `bigint` de pesos enteros sirve para COP, CLP y PYG, que no tienen
-- subunidad. **No sirve para MXN, BRL, ARS ni PEN**, que tienen centavos, y el
-- objetivo declarado del producto es venderlo en LATAM.
--
-- Esta fase es donde entra EL PRIMER CAMPO DE DINERO QUE ESCRIBE UN USUARIO
-- FINAL, así que es el momento barato: ahora cuesta una columna, y después de
-- la Fase 7 cuesta una migración con histórico financiero vivo.
--
-- El valor se guarda en la UNIDAD MÍNIMA de la moneda. En pantalla la aseadora
-- ve pesos normales; la unidad mínima es cosa del sistema.
alter table public.expenses
  add column moneda text not null default 'COP'
    constraint expenses_moneda_iso check (moneda ~ '^[A-Z]{3}$');

comment on column public.expenses.moneda is
  'Código ISO de tres letras en mayúsculas. El monto está en la UNIDAD MÍNIMA de esta moneda. Regla 1 del camino a v2 de PROJECT.md: el bigint de pesos enteros no sirve para México ni Brasil.';


-- ===========================================================================
-- (d) public.aseo_sin_evidencia_completa() — la marca, computada al leer
-- ===========================================================================
-- NO se materializa en una columna de `cleanings`, y es una decisión: habría
-- que mantenerla sincronizada desde tres sitios (marcar tarea, subir foto,
-- saltar cuarto) y el primero que se olvide deja la marca mintiendo.
--
-- La misma regla vive también en `lib/domain/checklist.ts`, para la pantalla
-- del aseador que ya tiene las filas en memoria. **La duplicación está
-- declarada** en la cabecera de ese módulo, y la mide
-- `lib/domain/evidencia-paridad.integration.test.ts`.
create or replace function public.aseo_sin_evidencia_completa(p_cleaning uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
           select 1
             from public.cleaning_room_skips s
            where s.cleaning_id = p_cleaning
         )
      or exists (
           select 1
             from public.cleaning_checklist_items i
            where i.cleaning_id = p_cleaning
              and i.requiere_foto
              and not exists (
                    select 1
                      from public.cleaning_photos ph
                     where ph.checklist_item_id = i.id
                       and ph.deleted_at is null
                  )
         );
$fn$;

comment on function public.aseo_sin_evidencia_completa(uuid) is
  'Cierto si el aseo tiene algún cuarto saltado o alguna tarea que exige foto sin foto. Se computa al leer; no se materializa, porque habría que sincronizarla desde tres sitios. La misma regla vive en lib/domain/checklist.ts y hay un test de paridad.';

revoke all     on function public.aseo_sin_evidencia_completa(uuid) from public, anon;
grant  execute on function public.aseo_sin_evidencia_completa(uuid) to authenticated;


-- ===========================================================================
-- (e) public.skip_room_evidence() — saltar un cuarto, con motivo
-- ===========================================================================
create or replace function public.skip_room_evidence(
  p_cleaning uuid,
  p_room     uuid,
  p_motivo   public.motivo_sin_evidencia,
  p_nota     text
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_label text;
begin
  -- Las cuatro condiciones de autorización en UN solo SELECT, y el cuarto es
  -- el que se olvida: el cuarto tiene que pertenecer a ESE apartamento, o se
  -- podría saltar el cuarto de otra propiedad.
  select pr.etiqueta
    into v_label
    from public.cleanings      c
    join public.property_rooms pr on pr.property_id = c.property_id
   where c.id         = p_cleaning
     and c.aseador_id = (select auth.uid())
     and c.is_managed
     and c.state      = 'en_curso'
     and pr.id        = p_room
     for update of c;

  if not found then
    -- 42501 y no P0001: para el cliente tiene que ser indistinguible "no
    -- existe", "no es tuyo", "no está en curso" y "ese cuarto no es de ese
    -- apartamento". Discriminarlos sería un oráculo de enumeración de aseos y
    -- de cuartos ajenos. Mismo criterio que `reveal_access_code`.
    raise exception 'no_autorizado' using errcode = '42501';
  end if;

  insert into public.cleaning_room_skips
    (cleaning_id, property_room_id, room_label, motivo, nota, skipped_by)
  values
    (p_cleaning, p_room, v_label, p_motivo, nullif(btrim(coalesce(p_nota, '')), ''),
     (select auth.uid()))
  on conflict (cleaning_id, property_room_id) do update
    set motivo     = excluded.motivo,
        nota       = excluded.nota,
        skipped_by = excluded.skipped_by,
        created_at = now();
end;
$fn$;

comment on function public.skip_room_evidence(uuid, uuid, public.motivo_sin_evidencia, text) is
  'Marca un cuarto como saltado con su motivo. Único camino para escribir en cleaning_room_skips: la tabla no tiene DML para nadie. Saltar dos veces actualiza el motivo.';

revoke all     on function public.skip_room_evidence(uuid, uuid, public.motivo_sin_evidencia, text) from public, anon;
grant  execute on function public.skip_room_evidence(uuid, uuid, public.motivo_sin_evidencia, text) to authenticated;


-- ===========================================================================
-- (f) public.unskip_room_evidence() — la evidencia sí llegó
-- ===========================================================================
-- La llama el cliente cuando la foto de un cuarto saltado por fin se sube. La
-- evidencia llegó; la excusa sobra.
create or replace function public.unskip_room_evidence(
  p_cleaning uuid,
  p_room     uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  perform 1
     from public.cleanings c
    where c.id         = p_cleaning
      and c.aseador_id = (select auth.uid())
      and c.is_managed
      and c.state      = 'en_curso'
      for update;

  if not found then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;

  delete from public.cleaning_room_skips
   where cleaning_id      = p_cleaning
     and property_room_id = p_room;
end;
$fn$;

comment on function public.unskip_room_evidence(uuid, uuid) is
  'Quita la marca de cuarto saltado cuando la foto sí llega. Borra la fila en vez de marcarla resuelta: el hecho que importa es si hoy falta evidencia, no el historial de intentos.';

revoke all     on function public.unskip_room_evidence(uuid, uuid) from public, anon;
grant  execute on function public.unskip_room_evidence(uuid, uuid) to authenticated;


-- ===========================================================================
-- (g) public.finish_cleaning() — SIN el bloqueo por checklist incompleto
-- ===========================================================================
-- Se conserva TODO lo demás de la versión de la migración 09: la guarda de
-- pertenencia, la transición de estado, la marca de fin y la notificación al
-- admin. Lo único que sale es el `raise exception 'checklist_incompleto'`.
--
-- ── LO QUE ESTE COMENTARIO REEMPLAZA ──────────────────────────────────────
-- La versión anterior declaraba: *"PWA-07. Rechaza con P0001
-- checklist_incompleto si queda una tarea sin marcar o una tarea con
-- requiere_foto sin ninguna foto."*
--
-- **Eso ya no es cierto, y no es un olvido.** D-06 lo derogó el 2026-09-12, con
-- la razón escrita arriba en la cabecera del archivo, y REQUIREMENTS.md tiene
-- PWA-07 corregido con su fecha. Si se repone el bloqueo, `09_ejecucion_aseo`
-- se pone rojo en sus cuatro primeras aserciones.
--
-- El invariante que SÍ sigue vigo es que la falta de evidencia quede visible, y
-- de eso se encarga `aseo_sin_evidencia_completa()`, no un `raise`.
create or replace function public.finish_cleaning(p_cleaning uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
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

  update public.cleanings
     set state       = 'completada',
         finished_at = now()
   where id = p_cleaning;

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
$fn$;

comment on function public.finish_cleaning(uuid) is
  'PWA-07, CORREGIDO 2026-09-12 (D-06): en_curso -> completada. YA NO rechaza por checklist incompleto; un bloqueo deja al aseador atrapado en campo. La falta de evidencia queda visible por aseo_sin_evidencia_completa(), no por una excepcion.';

revoke all     on function public.finish_cleaning(uuid) from public, anon;
grant  execute on function public.finish_cleaning(uuid) to authenticated;
