-- ============================================================================
-- 050_properties.sql — las 39 unidades reales en 8 clusters
--
-- Distribución operativa, verbatim de PROJECT.md:
--
--   | Cluster        | Unidades         | gestion_vivaguest |
--   |----------------|------------------|-------------------|
--   | Bogotá 1       | 23 aptos         | true              |
--   | Bogotá 2       | 2 aptos          | FALSE             |
--   | Santa Marta 1  | 7 aptos          | true              |
--   | Santa Marta 2  | 1 apto           | FALSE             |
--   | Santa Marta 3  | 1 apto           | FALSE             |
--   | Chinauta       | 1 casa           | FALSE             |
--   | Cartagena      | 2 aptos + 1 casa | true              |
--   | Medellín       | 1 apto           | true              |
--
--   Total: 39 unidades · 8 clusters · 34 gestionadas · 5 externas.
--
-- POR QUÉ NOMBRES DE PLACEHOLDER. El criterio de éxito 1 del ROADMAP habla de
-- "las 39 unidades reales", y los nombres, direcciones y tarifas reales todavía
-- no existen (01-CONTEXT.md). Se verifica por ESTRUCTURA, no por nombres:
-- count(*) = 39, count(distinct cluster) = 8, count(*) where not
-- gestion_vivaguest = 5. Reemplazar los nombres es tarea de la Fase 2 (CRUD de
-- apartamentos), no un bloqueante de esta. El prefijo va en el propio dato para
-- que el admin lo vea en la UI y sepa exactamente qué falta.
--
-- LAS 5 UNIDADES DE GESTIÓN EXTERNA VAN EXPLÍCITAS. No son un detalle
-- cosmético: son el fixture natural de la rama `cl_unmanaged_is_inert` y de
-- DASH-07. Sin ellas ese CHECK no se ejerce nunca contra datos reales. Llevan
-- `contacto_externo` con placeholder y `responsable_id`/`suplente_id` en NULL,
-- que es lo que exige `props_assignees_only_when_managed`.
--
-- TARIFAS EN NULL. `tarifa_huesped` y `pago_aseador` son bigint (pesos enteros,
-- el COP no tiene subunidad). No hay tarifas reales todavía; inventar cifras
-- aquí produciría márgenes de mentira en los reportes de la Fase 7.
--
-- NINGUNA UNIDAD NACE ACTIVA. `is_active` ya tiene default false y el CHECK
-- `props_active_requires_rates` lo impediría con las tarifas nulas. Va
-- explícito en el insert para que se lea como decisión, no como olvido.
--
-- `hora_limite` se queda en su default '11:30' (APTO-05).
-- `responsable_id`/`suplente_id` en NULL en las 34 gestionadas: no hay usuarios
-- todavía, los crea el admin en la Fase 2 (ASEADOR-01).
--
-- NO SE SIEMBRAN `property_secrets` NI `calendar_feeds` (T-01-27). El código de
-- la cerradura y la URL de exportación iCal son credenciales: meter strings
-- falsos en la tabla más sensible del sistema normaliza confundir una real con
-- una de relleno, y un feed inexistente se marcaría como caído en la Fase 3.
-- Los carga el admin en la Fase 2 (APTO-03, APTO-04, APTO-12).
--
-- El índice `properties_nombre_uniq` es sobre lower(btrim(nombre)): los 39
-- nombres tienen que ser distintos entre sí, por eso llevan el cluster dentro.
-- ============================================================================

insert into public.properties
  (id, nombre, cluster, gestion_vivaguest, contacto_externo, is_active)
values
  -- Bogotá 1: 23 unidades — gestión VivaGuest
  ('5eed0050-0000-4000-8000-000000000001', '[PLACEHOLDER] Bogotá 1 — Apto 01', 'Bogotá 1', true , null, false),
  ('5eed0050-0000-4000-8000-000000000002', '[PLACEHOLDER] Bogotá 1 — Apto 02', 'Bogotá 1', true , null, false),
  ('5eed0050-0000-4000-8000-000000000003', '[PLACEHOLDER] Bogotá 1 — Apto 03', 'Bogotá 1', true , null, false),
  ('5eed0050-0000-4000-8000-000000000004', '[PLACEHOLDER] Bogotá 1 — Apto 04', 'Bogotá 1', true , null, false),
  ('5eed0050-0000-4000-8000-000000000005', '[PLACEHOLDER] Bogotá 1 — Apto 05', 'Bogotá 1', true , null, false),
  ('5eed0050-0000-4000-8000-000000000006', '[PLACEHOLDER] Bogotá 1 — Apto 06', 'Bogotá 1', true , null, false),
  ('5eed0050-0000-4000-8000-000000000007', '[PLACEHOLDER] Bogotá 1 — Apto 07', 'Bogotá 1', true , null, false),
  ('5eed0050-0000-4000-8000-000000000008', '[PLACEHOLDER] Bogotá 1 — Apto 08', 'Bogotá 1', true , null, false),
  ('5eed0050-0000-4000-8000-000000000009', '[PLACEHOLDER] Bogotá 1 — Apto 09', 'Bogotá 1', true , null, false),
  ('5eed0050-0000-4000-8000-000000000010', '[PLACEHOLDER] Bogotá 1 — Apto 10', 'Bogotá 1', true , null, false),
  ('5eed0050-0000-4000-8000-000000000011', '[PLACEHOLDER] Bogotá 1 — Apto 11', 'Bogotá 1', true , null, false),
  ('5eed0050-0000-4000-8000-000000000012', '[PLACEHOLDER] Bogotá 1 — Apto 12', 'Bogotá 1', true , null, false),
  ('5eed0050-0000-4000-8000-000000000013', '[PLACEHOLDER] Bogotá 1 — Apto 13', 'Bogotá 1', true , null, false),
  ('5eed0050-0000-4000-8000-000000000014', '[PLACEHOLDER] Bogotá 1 — Apto 14', 'Bogotá 1', true , null, false),
  ('5eed0050-0000-4000-8000-000000000015', '[PLACEHOLDER] Bogotá 1 — Apto 15', 'Bogotá 1', true , null, false),
  ('5eed0050-0000-4000-8000-000000000016', '[PLACEHOLDER] Bogotá 1 — Apto 16', 'Bogotá 1', true , null, false),
  ('5eed0050-0000-4000-8000-000000000017', '[PLACEHOLDER] Bogotá 1 — Apto 17', 'Bogotá 1', true , null, false),
  ('5eed0050-0000-4000-8000-000000000018', '[PLACEHOLDER] Bogotá 1 — Apto 18', 'Bogotá 1', true , null, false),
  ('5eed0050-0000-4000-8000-000000000019', '[PLACEHOLDER] Bogotá 1 — Apto 19', 'Bogotá 1', true , null, false),
  ('5eed0050-0000-4000-8000-000000000020', '[PLACEHOLDER] Bogotá 1 — Apto 20', 'Bogotá 1', true , null, false),
  ('5eed0050-0000-4000-8000-000000000021', '[PLACEHOLDER] Bogotá 1 — Apto 21', 'Bogotá 1', true , null, false),
  ('5eed0050-0000-4000-8000-000000000022', '[PLACEHOLDER] Bogotá 1 — Apto 22', 'Bogotá 1', true , null, false),
  ('5eed0050-0000-4000-8000-000000000023', '[PLACEHOLDER] Bogotá 1 — Apto 23', 'Bogotá 1', true , null, false),

  -- Bogotá 2: 2 unidades — GESTIÓN EXTERNA (gestion_vivaguest = false)
  ('5eed0050-0000-4000-8000-000000000024', '[PLACEHOLDER] Bogotá 2 — Apto 01', 'Bogotá 2', false, '[PLACEHOLDER] Empresa externa contratada — contacto pendiente', false),
  ('5eed0050-0000-4000-8000-000000000025', '[PLACEHOLDER] Bogotá 2 — Apto 02', 'Bogotá 2', false, '[PLACEHOLDER] Empresa externa contratada — contacto pendiente', false),

  -- Santa Marta 1: 7 unidades — gestión VivaGuest
  ('5eed0050-0000-4000-8000-000000000026', '[PLACEHOLDER] Santa Marta 1 — Apto 01', 'Santa Marta 1', true , null, false),
  ('5eed0050-0000-4000-8000-000000000027', '[PLACEHOLDER] Santa Marta 1 — Apto 02', 'Santa Marta 1', true , null, false),
  ('5eed0050-0000-4000-8000-000000000028', '[PLACEHOLDER] Santa Marta 1 — Apto 03', 'Santa Marta 1', true , null, false),
  ('5eed0050-0000-4000-8000-000000000029', '[PLACEHOLDER] Santa Marta 1 — Apto 04', 'Santa Marta 1', true , null, false),
  ('5eed0050-0000-4000-8000-000000000030', '[PLACEHOLDER] Santa Marta 1 — Apto 05', 'Santa Marta 1', true , null, false),
  ('5eed0050-0000-4000-8000-000000000031', '[PLACEHOLDER] Santa Marta 1 — Apto 06', 'Santa Marta 1', true , null, false),
  ('5eed0050-0000-4000-8000-000000000032', '[PLACEHOLDER] Santa Marta 1 — Apto 07', 'Santa Marta 1', true , null, false),

  -- Santa Marta 2: 1 unidad — GESTIÓN EXTERNA (gestion_vivaguest = false)
  ('5eed0050-0000-4000-8000-000000000033', '[PLACEHOLDER] Santa Marta 2 — Apto 01', 'Santa Marta 2', false, '[PLACEHOLDER] Aseo contratado por la propietaria — contacto pendiente', false),

  -- Santa Marta 3: 1 unidad — GESTIÓN EXTERNA (gestion_vivaguest = false)
  ('5eed0050-0000-4000-8000-000000000034', '[PLACEHOLDER] Santa Marta 3 — Apto 01', 'Santa Marta 3', false, '[PLACEHOLDER] Limpian los propietarios — contacto pendiente', false),

  -- Chinauta: 1 unidad — GESTIÓN EXTERNA (gestion_vivaguest = false)
  ('5eed0050-0000-4000-8000-000000000035', '[PLACEHOLDER] Chinauta — Casa 01', 'Chinauta', false, '[PLACEHOLDER] Limpian los propietarios — contacto pendiente', false),

  -- Cartagena: 3 unidades — gestión VivaGuest
  ('5eed0050-0000-4000-8000-000000000036', '[PLACEHOLDER] Cartagena — Apto 01', 'Cartagena', true , null, false),
  ('5eed0050-0000-4000-8000-000000000037', '[PLACEHOLDER] Cartagena — Apto 02', 'Cartagena', true , null, false),
  ('5eed0050-0000-4000-8000-000000000038', '[PLACEHOLDER] Cartagena — Casa 01', 'Cartagena', true , null, false),

  -- Medellín: 1 unidad — gestión VivaGuest
  ('5eed0050-0000-4000-8000-000000000039', '[PLACEHOLDER] Medellín — Apto 01', 'Medellín', true , null, false)
on conflict do nothing;
