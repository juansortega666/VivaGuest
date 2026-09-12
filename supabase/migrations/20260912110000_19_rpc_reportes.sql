-- ============================================================================
-- 19 — Los tres RPC de reporte del aseador: daño, gasto y faltante.
--
-- ---------------------------------------------------------------------------
-- LO QUE ESTE ARCHIVO CIERRA, Y LLEVA ABIERTO DESDE LA FASE 5:
--
-- `05-UI-SPEC.md` §10.1 registró que `dano_reportado` y `faltantes_reportados`
-- son dos valores del enum de notificación que **todavía no los escribía
-- nadie**, aunque el criterio 3 del ROADMAP de la Fase 5 los exige. Se probaron
-- entonces contra fila insertada a mano, y quedó anotado que el emisor llegaba
-- en la Fase 6. Es este archivo.
--
-- ---------------------------------------------------------------------------
-- NINGUNA DE LAS TRES FUNCIONES INVOCA EL PUSH, Y ESO ES DISEÑO:
--
-- El trigger `notifications_disparar_push` de la migración 17 dispara al
-- insertar. Era el argumento entero de D-04 de la Fase 5: el disparo va en el
-- trigger y **no** dentro de cada RPC, porque hay seis o más emisores y ninguno
-- debe editarse, así que **cada emisor futuro queda cubierto por construcción,
-- sin que nadie tenga que acordarse**.
--
-- Este archivo es la primera vez que esa promesa se cobra. Si alguien añade
-- aquí una llamada al drenaje, está reintroduciendo el acoplamiento que D-04
-- quitó.
--
-- ---------------------------------------------------------------------------
-- LA SIMPLIFICACIÓN DE D-07 Y LA RAMA QUE SE QUEDA SIN USAR:
--
-- D-07 dice: un campo libre clasificado, no la lista base del apartamento. Así
-- que los faltantes van por la rama **`nombre_libre`** de
-- `mil_exactly_one_source`, con `catalog_item_id` nulo.
--
-- **La rama de catálogo se queda en el schema sin usar, y no es basura:** es por
-- donde entrará la lista base el día que se retome. `REPORT-03` corregido en
-- REQUIREMENTS.md lo dice con su fecha.
--
-- Pone en verde `supabase/tests/10_reportes.test.sql`, que nació rojo.
-- ============================================================================


-- ===========================================================================
-- (a) La guarda compartida — escrita UNA vez y no tres
-- ===========================================================================
-- Devuelve el `property_id` del aseo, que es lo que las tres funciones
-- necesitan, y lanza si el llamante no tiene derecho. Resolver el apartamento
-- AQUÍ y no recibirlo por parámetro es deliberado: el cliente no tiene por qué
-- saberlo, y aceptarlo abriría la puerta a insertar un daño de un apartamento
-- contra el aseo de otro.
create or replace function private.aseo_en_curso_propio(p_cleaning uuid)
returns uuid
language plpgsql
stable
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
     and c.state      = 'en_curso';

  if v_property is null then
    -- 42501 indistinguible para las cuatro causas: no existe, no es tuyo, no
    -- está en curso, no es gestionado. Mismo criterio que `reveal_access_code`:
    -- discriminarlas sería un oráculo de enumeración de aseos ajenos.
    raise exception 'no_autorizado' using errcode = '42501';
  end if;

  return v_property;
end;
$fn$;

comment on function private.aseo_en_curso_propio(uuid) is
  'Autoriza y resuelve el apartamento en una sola llamada. El property_id NO se recibe por parametro a proposito: aceptarlo permitiria colgar un reporte del apartamento equivocado.';

revoke all     on function private.aseo_en_curso_propio(uuid) from public, anon;
grant  execute on function private.aseo_en_curso_propio(uuid) to authenticated;


-- ===========================================================================
-- (b) public.report_damage() — REPORT-01
-- ===========================================================================
create or replace function public.report_damage(
  p_cleaning    uuid,
  p_descripcion text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_property uuid;
  v_damage   uuid;
begin
  v_property := private.aseo_en_curso_propio(p_cleaning);

  -- El `check (length(btrim(descripcion)) > 0)` de la tabla hace el trabajo.
  -- NO se duplica la validación aquí, y la razón va escrita: un CHECK de tabla
  -- no se puede saltar, y una validación dentro de la función se puede olvidar
  -- en el siguiente `create or replace`.
  insert into public.damages (cleaning_id, property_id, descripcion, reported_by)
  values (p_cleaning, v_property, p_descripcion, (select auth.uid()))
  returning id into v_damage;

  -- Una notificación por CADA admin activo. El `and pr.is_active` no es
  -- decorativo: sin él, un admin dado de baja seguiría recibiendo avisos de
  -- campo, y con él un `limit 1` mal puesto dejaría a la mitad del equipo sin
  -- enterarse.
  insert into public.notifications
    (recipient_id, type, title, body, url, cleaning_id, property_id, dedupe_key)
  select pr.id,
         'dano_reportado'::public.notification_type,
         'Daño reportado',
         'Reportaron un daño en ' || p.nombre || '.',
         '/operacion#aseo-' || p_cleaning::text,
         p_cleaning,
         v_property,
         -- El identificador del daño entra en la clave: DOS daños del mismo
         -- aseo son DOS hechos y no deben deduplicarse entre sí.
         'dano:' || p_cleaning::text || ':' || v_damage::text
    from public.profiles   pr
    cross join public.properties p
   where pr.role = 'admin'
     and pr.is_active
     and p.id = v_property
  on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing;

  return v_damage;
end;
$fn$;

comment on function public.report_damage(uuid, text) is
  'REPORT-01. Registra un dano y notifica a cada admin activo. Devuelve el id para que el cliente le cuelgue la foto obligatoria. El push lo dispara el trigger de la migracion 17, no esta funcion.';

revoke all     on function public.report_damage(uuid, text) from public, anon;
grant  execute on function public.report_damage(uuid, text) to authenticated;


-- ===========================================================================
-- (c) public.report_expense() — REPORT-02
-- ===========================================================================
create or replace function public.report_expense(
  p_cleaning uuid,
  p_concepto text,
  p_monto    bigint,
  p_moneda   text default 'COP'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_property uuid;
  v_expense  uuid;
begin
  v_property := private.aseo_en_curso_propio(p_cleaning);

  -- El `check (monto > 0)` y el `check (moneda ~ '^[A-Z]{3}$')` de la tabla
  -- hacen el trabajo. Misma razón que en `report_damage`: no se duplican.
  --
  -- `p_monto` va en la UNIDAD MÍNIMA de `p_moneda`. Es la regla 1 del camino a
  -- v2 de PROJECT.md, y esta función es por donde entra el primer campo de
  -- dinero que escribe un usuario final del sistema.
  insert into public.expenses
    (cleaning_id, property_id, concepto, monto, moneda, reported_by)
  values
    (p_cleaning, v_property, p_concepto, p_monto, p_moneda, (select auth.uid()))
  returning id into v_expense;

  insert into public.notifications
    (recipient_id, type, title, body, url, cleaning_id, property_id, dedupe_key)
  select pr.id,
         'gasto_reportado'::public.notification_type,
         'Gasto reportado',
         'Reportaron un gasto de ' || p_monto::text || ' ' || p_moneda
           || ' en ' || p.nombre || '.',
         '/operacion#aseo-' || p_cleaning::text,
         p_cleaning,
         v_property,
         'gasto:' || p_cleaning::text || ':' || v_expense::text
    from public.profiles   pr
    cross join public.properties p
   where pr.role = 'admin'
     and pr.is_active
     and p.id = v_property
  on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing;

  return v_expense;
end;
$fn$;

comment on function public.report_expense(uuid, text, bigint, text) is
  'REPORT-02. El monto va en la UNIDAD MINIMA de la moneda (regla 1 del camino a v2). Sin monto el cierre mensual de la Fase 7 no puede sumar nada, y por eso el CHECK de la tabla lo exige positivo.';

revoke all     on function public.report_expense(uuid, text, bigint, text) from public, anon;
grant  execute on function public.report_expense(uuid, text, bigint, text) to authenticated;


-- ===========================================================================
-- (d) public.report_missing_items() — REPORT-03
-- ===========================================================================
create or replace function public.report_missing_items(
  p_cleaning uuid,
  p_items    text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_property uuid;
  v_report   uuid;
  v_limpios  text[];
begin
  v_property := private.aseo_en_curso_propio(p_cleaning);

  -- Recortar y descartar vacíos ANTES de decidir si hay reporte. Un arreglo de
  -- tres cadenas en blanco no es un reporte de tres faltantes.
  select coalesce(array_agg(btrim(i)), '{}'::text[])
    into v_limpios
    from unnest(coalesce(p_items, '{}'::text[])) as i
   where length(btrim(i)) > 0;

  if array_length(v_limpios, 1) is null then
    raise exception 'faltantes_vacio'
      using errcode = 'P0001',
            hint    = 'Escribe qué faltaba antes de enviar el reporte.';
  end if;

  insert into public.missing_item_reports (cleaning_id, property_id, reported_by)
  values (p_cleaning, v_property, (select auth.uid()))
  returning id into v_report;

  -- UN reporte y N líneas. Crear un reporte por ítem es el error fácil, y la
  -- aserción 12 de `10_reportes.test.sql` lo mide como '1/2'.
  --
  -- Rama de TEXTO LIBRE de `mil_exactly_one_source` (D-07): `catalog_item_id`
  -- nulo y `nombre_snapshot` igual a lo que escribió la aseadora. La rama de
  -- catálogo se queda sin usar a propósito; ver la cabecera del archivo.
  insert into public.missing_item_lines
    (report_id, catalog_item_id, nombre_libre, nombre_snapshot, cantidad)
  select v_report, null, i, i, 1
    from unnest(v_limpios) as i;

  insert into public.notifications
    (recipient_id, type, title, body, url, cleaning_id, property_id, dedupe_key)
  select pr.id,
         'faltantes_reportados'::public.notification_type,
         'Faltantes reportados',
         'Reportaron ' || array_length(v_limpios, 1)::text
           || ' faltantes en ' || p.nombre || '.',
         '/operacion#aseo-' || p_cleaning::text,
         p_cleaning,
         v_property,
         'falta:' || p_cleaning::text || ':' || v_report::text
    from public.profiles   pr
    cross join public.properties p
   where pr.role = 'admin'
     and pr.is_active
     and p.id = v_property
  on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing;

  return v_report;
end;
$fn$;

comment on function public.report_missing_items(uuid, text[]) is
  'REPORT-03, CORREGIDO 2026-09-12 (D-07): campo libre clasificado, no la lista base del apartamento. Crea UN reporte y N lineas por la rama de texto libre; la rama de catalogo queda para cuando se retome la lista base.';

revoke all     on function public.report_missing_items(uuid, text[]) from public, anon;
grant  execute on function public.report_missing_items(uuid, text[]) to authenticated;
