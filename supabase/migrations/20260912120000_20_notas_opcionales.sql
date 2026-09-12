-- ============================================================================
-- 20 — La nota es opcional, y el tipo generado tiene que saberlo.
--
-- MEDIDO al cablear las Server Actions del aseador: `supabase gen types` marca
-- un argumento como REQUERIDO (`p_nota: string`) cuando la funcion no le da
-- `default`, aunque la columna destino sea nullable. Consecuencia concreta: la
-- pantalla tendria que pasar cadena vacia para "sin nota", y
-- `toggle_checklist_item` hace `nota = p_nota` sin filtrar, asi que escribiria
-- una nota vacia donde deberia haber NULL.
--
-- Una nota vacia y ninguna nota no son lo mismo, y esa diferencia se ve el dia
-- que el admin filtre "tareas con observacion".
--
-- Se cambia SOLO el default de dos argumentos. Ni el cuerpo, ni la firma de
-- tipos, ni el comportamiento con un valor dado. Es la correccion mas pequena
-- que hace que el tipo generado diga la verdad.
--
-- `06-UI-SPEC.md` no tiene campo de nota por tarea, asi que la pantalla del
-- aseador SIEMPRE va a llamar estos dos sin nota.
-- ============================================================================

-- `toggle_checklist_item`: de la migracion 09, cuerpo intacto salvo el default.
create or replace function public.toggle_checklist_item(
  p_item uuid,
  p_done boolean,
  p_nota text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  perform 1
     from public.cleaning_checklist_items i
     join public.cleanings c on c.id = i.cleaning_id
    where i.id           = p_item
      and c.aseador_id   = (select auth.uid())
      and c.is_managed
      and c.state        = 'en_curso'
      for update of i;

  if not found then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;

  update public.cleaning_checklist_items
     set done_at = case when p_done then now() else null end,
         done_by = case when p_done then (select auth.uid()) else null end,
         nota    = p_nota
   where id = p_item;
end;
$fn$;

comment on function public.toggle_checklist_item(uuid, boolean, text) is
  'CHECK-02. Marca o desmarca una tarea del aseo propio en curso. `p_nota` con default null desde la migracion 20, para que el tipo generado refleje que es opcional.';

revoke all     on function public.toggle_checklist_item(uuid, boolean, text) from public, anon;
grant  execute on function public.toggle_checklist_item(uuid, boolean, text) to authenticated;


-- `skip_room_evidence`: de la migracion 18. Mismo cambio, misma razon.
create or replace function public.skip_room_evidence(
  p_cleaning uuid,
  p_room     uuid,
  p_motivo   public.motivo_sin_evidencia,
  p_nota     text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_label text;
begin
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
  'Marca un cuarto como saltado con su motivo. Unico camino para escribir en cleaning_room_skips. `p_nota` con default null desde la migracion 20.';

revoke all     on function public.skip_room_evidence(uuid, uuid, public.motivo_sin_evidencia, text) from public, anon;
grant  execute on function public.skip_room_evidence(uuid, uuid, public.motivo_sin_evidencia, text) to authenticated;
