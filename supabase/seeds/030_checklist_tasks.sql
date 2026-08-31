-- ============================================================================
-- 030_checklist_tasks.sql — catálogo provisional de tareas de checklist
--
-- MÁXIMO 3 TAREAS POR TIPO DE CUARTO. El tope no es una convención de este
-- archivo: es estructural en el schema (CHECK slot between 1 and 3 + UNIQUE
-- (room_type_id, slot)), así que una 4ª tarea haría fallar el seed entero.
-- Contrapartida asumida: retirar una tarea y añadir otra obliga a reusar el
-- slot.
--
-- `requiere_foto = true` en todo salvo el bloque `general`: sus tareas son del
-- apartamento completo, no de un cuarto concreto, y una foto no las evidencia.
--
-- El texto de las tareas es PROVISIONAL. La lista definitiva es un abierto de
-- producto; se edita en base de datos (update de `descripcion`) sin migración.
--
-- El `room_type_id` se resuelve por `slug` contra 020_room_types.sql en vez de
-- repetir el UUID: si un slug no existiera, la fila simplemente no entra y el
-- conteo del test lo delata, en vez de romper con un 23503 críptico.
-- ============================================================================

insert into public.checklist_tasks (id, room_type_id, descripcion, slot, requiere_foto)
select v.id, rt.id, v.descripcion, v.slot, v.requiere_foto
  from (values
    -- general (sin foto: no aplica a un cuarto concreto)
    ('5eed0030-0000-4000-8000-000000000101'::uuid, 'general', 'Revisar que no queden pertenencias del huésped anterior',        1::smallint, false),
    ('5eed0030-0000-4000-8000-000000000102'::uuid, 'general', 'Sacar toda la basura del apartamento',                           2::smallint, false),
    ('5eed0030-0000-4000-8000-000000000103'::uuid, 'general', 'Dejar luces, gas y llaves de agua cerrados al salir',            3::smallint, false),

    -- habitacion
    ('5eed0030-0000-4000-8000-000000000201'::uuid, 'habitacion', 'Tender la cama con lencería limpia',                          1::smallint, true),
    ('5eed0030-0000-4000-8000-000000000202'::uuid, 'habitacion', 'Aspirar el piso y limpiar mesas de noche y superficies',      2::smallint, true),
    ('5eed0030-0000-4000-8000-000000000203'::uuid, 'habitacion', 'Dejar el clóset vacío, limpio y con ganchos ordenados',       3::smallint, true),

    -- bano
    ('5eed0030-0000-4000-8000-000000000301'::uuid, 'bano', 'Lavar y desinfectar sanitario, ducha y lavamanos',                  1::smallint, true),
    ('5eed0030-0000-4000-8000-000000000302'::uuid, 'bano', 'Reponer papel higiénico, jabón y amenities',                        2::smallint, true),
    ('5eed0030-0000-4000-8000-000000000303'::uuid, 'bano', 'Colgar toallas limpias y secar espejo y grifería',                  3::smallint, true),

    -- cocina
    ('5eed0030-0000-4000-8000-000000000401'::uuid, 'cocina', 'Lavar y guardar toda la loza, ollas y utensilios',                1::smallint, true),
    ('5eed0030-0000-4000-8000-000000000402'::uuid, 'cocina', 'Vaciar y limpiar la nevera, desechar alimentos del huésped',      2::smallint, true),
    ('5eed0030-0000-4000-8000-000000000403'::uuid, 'cocina', 'Desengrasar estufa, mesón y microondas',                          3::smallint, true),

    -- sala_comedor
    ('5eed0030-0000-4000-8000-000000000501'::uuid, 'sala_comedor', 'Limpiar y organizar muebles, mesa y sillas',                1::smallint, true),
    ('5eed0030-0000-4000-8000-000000000502'::uuid, 'sala_comedor', 'Aspirar el piso, sacudir cojines y alfombras',              2::smallint, true),
    ('5eed0030-0000-4000-8000-000000000503'::uuid, 'sala_comedor', 'Dejar controles de TV y aire a la vista y funcionando',     3::smallint, true),

    -- zona_lavado
    ('5eed0030-0000-4000-8000-000000000601'::uuid, 'zona_lavado', 'Dejar lavadora y secadora vacías y con la puerta abierta',   1::smallint, true),
    ('5eed0030-0000-4000-8000-000000000602'::uuid, 'zona_lavado', 'Limpiar el área de lavado, el lavadero y el desagüe',        2::smallint, true),
    ('5eed0030-0000-4000-8000-000000000603'::uuid, 'zona_lavado', 'Organizar detergente y elementos de aseo en su lugar',       3::smallint, true),

    -- balcon_terraza
    ('5eed0030-0000-4000-8000-000000000701'::uuid, 'balcon_terraza', 'Barrer y trapear el piso del balcón o terraza',           1::smallint, true),
    ('5eed0030-0000-4000-8000-000000000702'::uuid, 'balcon_terraza', 'Limpiar y organizar los muebles de exterior',             2::smallint, true),
    ('5eed0030-0000-4000-8000-000000000703'::uuid, 'balcon_terraza', 'Retirar basura, colillas y objetos olvidados',            3::smallint, true),

    -- exterior (solo las 2 casas: jardín / piscina / BBQ)
    ('5eed0030-0000-4000-8000-000000000801'::uuid, 'exterior', 'Recoger basura del jardín y las zonas verdes',                  1::smallint, true),
    ('5eed0030-0000-4000-8000-000000000802'::uuid, 'exterior', 'Revisar el estado de la piscina y limpiar su entorno',          2::smallint, true),
    ('5eed0030-0000-4000-8000-000000000803'::uuid, 'exterior', 'Limpiar la zona de BBQ y guardar los utensilios',               3::smallint, true)
  ) as v(id, slug, descripcion, slot, requiere_foto)
  join public.room_types rt on rt.slug = v.slug
on conflict do nothing;
