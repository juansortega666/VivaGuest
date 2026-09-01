-- ============================================================================
-- 03_seed.test.sql — criterio de éxito 1 del ROADMAP: el seed cargado
--
-- ⚠️ ESTE ARCHIVO NO LLEVA BLOQUE DE LIMPIEZA, A PROPÓSITO.
-- Los otros archivos borran el seed dentro de su transacción para volverse
-- independientes de su contenido; este verifica precisamente lo que el seed
-- cargó. Un borrado aquí vacía justo lo que se está midiendo y deja las cinco
-- aserciones en verde sobre una base vacía. Sigue siendo begin; ... rollback;
-- porque no escribe nada.
--
-- (El texto de este comentario evita a propósito la cadena que busca la puerta
--  de CI: la lección de la desviación 3 del plan 01-01 es que un comentario que
--  cita el patrón prohibido rompe su propio guardarraíl.)
--
-- El criterio del ROADMAP habla de "las 39 unidades reales". Se verifica por
-- ESTRUCTURA, no por nombres: los nombres reales todavía no existen y
-- CONTEXT.md autoriza placeholders marcados. Reemplazarlos es tarea de la
-- Fase 2, no bloqueante de esta.
-- ============================================================================

begin;
select plan(5);

-- 1
select is((select count(*) from public.properties)::int, 39,
  'seed: 39 unidades');

-- 2
select is((select count(distinct p.cluster) from public.properties p)::int, 8,
  'seed: 8 clusters');

-- 3
select is((select count(*) from public.properties p where not p.gestion_vivaguest)::int, 5,
  'seed: 5 unidades de gestión externa');

-- 4  El tope de 3 tareas por tipo de cuarto es estructural
--    (CHECK slot between 1 and 3 + UNIQUE (room_type_id, slot)), no un trigger
--    ni una convención del seed.
select is_empty($q$
  select ct.room_type_id
    from public.checklist_tasks ct
   group by ct.room_type_id
  having count(*) > 3
$q$, 'seed: ningún tipo de cuarto excede 3 tareas de checklist');

-- 5  Ninguna unidad nace activa: `is_active` tiene default false y el CHECK
--    props_active_requires_rates lo impediría con las tarifas en placeholder.
--    Activar cada apartamento es un acto deliberado del admin en la Fase 2.
select is_empty($q$
  select p.id from public.properties p where p.is_active
$q$, 'seed: ninguna unidad nace activa');

select * from finish();
rollback;
