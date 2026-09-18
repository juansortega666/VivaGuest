-- ============================================================================
-- 010_app_settings.sql — ajustes de aplicación
--
-- Reglas de escritura del seed (aplican a los 6 archivos de supabase/seeds/):
--   1. UUID fijos y deterministas. Ni una sola llamada al generador aleatorio
--      de UUID de pgcrypto: los tests y las referencias entre archivos del seed
--      los necesitan estables entre resets. Esta prohibición la verifica un
--      grep de CI, así que ni los comentarios citan el nombre de la función:
--      la lección de la desviación 3 del plan 01-01 es que un comentario que
--      cita el patrón prohibido rompe su propio guardarraíl.
--   2. `on conflict` en TODO insert. `db reset` recrea la base y no lo necesita,
--      pero `db reset --linked` y las branches de Supabase sí, y cuesta cero.
--   3. Los placeholders se marcan en el propio dato, no en un comentario, para
--      que el admin los vea en la UI de la Fase 2 y sepa qué reemplazar.
--   4. El seed NO crea usuarios ni aseos. Son datos operativos: los crean los
--      tests (dentro de su rollback) o el admin en la Fase 2.
--
-- `do nothing` y no `do update`: si el admin ya ajustó un valor en dev, un
-- reset del seed no debe pisárselo. El seed define el valor INICIAL.
-- ============================================================================

insert into public.app_settings (key, value) values
  -- Fase 9 (retención): meses que sobreviven aseos, checklists, gastos y daños.
  ('retention_months',            '6'::jsonb),
  -- Fase 9: días de aviso al admin antes de que el barrido borre datos.
  ('retention_notice_days',       '15'::jsonb),
  -- Fase 9: las FOTOS se borran a los 30 días, no a los 6 meses. Es una
  -- restricción del free tier de Storage; el registro del aseo y su checklist
  -- sobreviven los 6 meses completos, solo se pierde la evidencia gráfica.
  ('photo_retention_days',        '30'::jsonb),
  -- Fase 3 (sync iCal): minutos sin sync exitoso tras los cuales un feed se
  -- considera caído y se alerta al admin.
  ('feed_dead_after_minutes',     '180'::jsonb),
  -- Fase 3: periodo del pg_cron que dispara el fan-out de sync por feed.
  ('sync_interval_minutes',       '30'::jsonb),
  -- Fase 6 (código de acceso): días alrededor de la fecha del aseo en los que
  -- reveal_access_code() acepta revelar el código al aseador asignado.
  ('access_code_window_days',     '1'::jsonb),
  -- RET-07 / Fase 9: porcentaje de consumo de Storage que dispara la alerta
  -- de capacidad al admin.
  ('storage_alert_threshold_pct', '70'::jsonb),
  -- RET-07: el CUPO de Storage contra el que se mide ese porcentaje, en
  -- MEGABYTES. 1024 es el free tier de Supabase, que con 34 apartamentos se
  -- llena en unos tres meses (6 fotos por aseo x ~200 KB).
  --
  -- VA AQUI, PEGADO AL UMBRAL, Y NO EN UNA CONSTANTE DEL CODIGO, POR UNA
  -- RAZON OPERATIVA: el dia que el dueno pase a Supabase Pro, subir el cupo
  -- tiene que ser un `update` de esta fila, no una migracion, un commit, un
  -- despliegue y un reinicio. El dia que el Storage este al 95% es el peor dia
  -- posible para necesitar un despliegue.
  --
  -- Y va junto al umbral porque los dos forman UNA regla: partir el par deja
  -- media verdad en cada lado y garantiza que alguien mueva una sola.
  ('storage_quota_mb',            '1024'::jsonb)
on conflict (key) do nothing;
