-- ============================================================================
-- 040_missing_item_catalog.sql — lista base GLOBAL de faltantes
--
-- `property_id = NULL` ⇒ ítem global, presente en todos los apartamentos. La
-- lista que ve el aseador es: globales activos ∪ los del apartamento.
--
-- Aquí NO va nada por apartamento: la lista base por unidad la configura el
-- admin en la Fase 2 (APTO-07), cuando existan los apartamentos reales.
--
-- "Otros" NO es una fila de este catálogo. Es la rama de texto libre de
-- `missing_item_lines.nombre_libre`. Sembrarlo aquí crearía dos caminos para
-- lo mismo y rompería el conteo de faltantes por ítem.
--
-- El índice `mic_global_uniq` es sobre lower(nombre) where property_id is null,
-- así que `on conflict do nothing` sin target cubre tanto el PK como el índice
-- parcial.
-- ============================================================================

insert into public.missing_item_catalog (id, property_id, nombre, sort_order, is_active) values
  ('5eed0040-0000-4000-8000-000000000001', null, 'Papel higiénico',   10, true),
  ('5eed0040-0000-4000-8000-000000000002', null, 'Jabón de manos',    20, true),
  ('5eed0040-0000-4000-8000-000000000003', null, 'Shampoo',           30, true),
  ('5eed0040-0000-4000-8000-000000000004', null, 'Toallas',           40, true),
  ('5eed0040-0000-4000-8000-000000000005', null, 'Sábanas',           50, true),
  ('5eed0040-0000-4000-8000-000000000006', null, 'Bolsas de basura',  60, true),
  ('5eed0040-0000-4000-8000-000000000007', null, 'Detergente',        70, true),
  ('5eed0040-0000-4000-8000-000000000008', null, 'Café',              80, true),
  ('5eed0040-0000-4000-8000-000000000009', null, 'Azúcar',            90, true),
  ('5eed0040-0000-4000-8000-000000000010', null, 'Agua',             100, true)
on conflict do nothing;
