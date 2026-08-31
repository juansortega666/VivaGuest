-- ============================================================================
-- 060_property_rooms.sql — cuartos placeholder por unidad
--
-- Juego mínimo y honesto para las 39 unidades: `general` + 1 habitación +
-- 1 baño + 1 cocina + 1 sala/comedor. Las 2 casas (Chinauta y Cartagena Casa
-- 01) suman además un cuarto `exterior`, que es el que cubre jardín, piscina y
-- BBQ.
--
-- Los cuartos determinan qué checklist se arma (CHECK-01), así que la lista
-- real por apartamento la define el admin en la Fase 2 (APTO-06). Estos son
-- andamio: por eso la etiqueta lleva el prefijo [PLACEHOLDER] en el propio
-- dato, igual que el nombre del apartamento.
--
-- El id se DERIVA de forma determinista, no se genera: los dos últimos dígitos
-- del id del apartamento (5eed0050-…-0000000000NN, NN = 01..39) más el código
-- de dos dígitos del tipo de cuarto. Sigue cumpliendo la regla 1 del seed
-- (cero UUID aleatorios) sin escribir 197 literales a mano.
--
-- El `where p.id::text like '5eed0050-%'` acota el cross join a las unidades
-- SEMBRADAS: si el admin da de alta un apartamento real en la Fase 2, un
-- `db reset --linked` no le inyecta cuartos de relleno.
--
-- Respeta `unique (property_id, etiqueta)`: las 6 etiquetas son distintas
-- entre sí dentro de un mismo apartamento.
-- ============================================================================

insert into public.property_rooms (id, property_id, room_type_id, etiqueta, sort_order)
select
  ('5eed0060-0000-4000-8000-00000000' || right(p.id::text, 2) || v.codigo)::uuid,
  p.id,
  rt.id,
  v.etiqueta,
  rt.sort_order
from public.properties p
cross join (values
    ('general',      '01', '[PLACEHOLDER] General'),
    ('habitacion',   '02', '[PLACEHOLDER] Habitación 1'),
    ('bano',         '03', '[PLACEHOLDER] Baño 1'),
    ('cocina',       '04', '[PLACEHOLDER] Cocina'),
    ('sala_comedor', '05', '[PLACEHOLDER] Sala / comedor'),
    ('exterior',     '06', '[PLACEHOLDER] Exterior')
  ) as v(slug, codigo, etiqueta)
join public.room_types rt on rt.slug = v.slug
where p.id::text like '5eed0050-%'
  -- `exterior` solo para las 2 casas: Chinauta (…035) y Cartagena Casa 01 (…038).
  and (v.slug <> 'exterior'
       or p.id in ('5eed0050-0000-4000-8000-000000000035',
                   '5eed0050-0000-4000-8000-000000000038'))
on conflict do nothing;
