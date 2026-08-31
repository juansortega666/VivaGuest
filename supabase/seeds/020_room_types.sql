-- ============================================================================
-- 020_room_types.sql — biblioteca global de tipos de cuarto (catálogo provisional)
--
-- Los 8 tipos que fija 01-CONTEXT.md. `sort_order` refleja el orden en que el
-- aseador recorre el apartamento: `general` primero (es el bloque que no
-- pertenece a ningún cuarto concreto y que siempre está presente) y `exterior`
-- último (solo aplica a las 2 casas: Chinauta y la casa de Cartagena).
--
-- Namespace de UUID del seed: 5eedXXXX-…. Disjunto a propósito del namespace de
-- los fixtures de los tests pgTAP, que ocupan aaaa…/bbbb…/cccc…/dddd… y
-- 1111…/2222…/3333…/4444…/7777…/9999… y ffffffff-2222-….
--   5eed0020-… tipos de cuarto
--   5eed0030-… tareas de checklist
--   5eed0040-… catálogo de faltantes
--   5eed0050-… apartamentos
--   5eed0060-… cuartos de apartamento
--
-- Este catálogo es PROVISIONAL. La lista definitiva de tipos y tareas es un
-- abierto de producto: bloquea el seed, no el schema, y es editable en base de
-- datos sin migración.
-- ============================================================================

insert into public.room_types (id, slug, nombre, sort_order) values
  ('5eed0020-0000-4000-8000-000000000001', 'general',        'General',            10),
  ('5eed0020-0000-4000-8000-000000000002', 'habitacion',     'Habitación',         20),
  ('5eed0020-0000-4000-8000-000000000003', 'bano',           'Baño',               30),
  ('5eed0020-0000-4000-8000-000000000004', 'cocina',         'Cocina',             40),
  ('5eed0020-0000-4000-8000-000000000005', 'sala_comedor',   'Sala / comedor',     50),
  ('5eed0020-0000-4000-8000-000000000006', 'zona_lavado',    'Zona de lavado',     60),
  ('5eed0020-0000-4000-8000-000000000007', 'balcon_terraza', 'Balcón / terraza',   70),
  ('5eed0020-0000-4000-8000-000000000008', 'exterior',       'Exterior',           80)
on conflict do nothing;

