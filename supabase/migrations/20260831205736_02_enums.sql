-- ============================================================================
-- 02 — Enums del dominio
--
-- Van en su propio archivo porque añadir un valor después exige
-- `alter type … add value`, que NO corre dentro de una transacción. Aislarlos
-- hace obvio el diff el día que eso pase.
--
-- Los valores están fijados por el dominio y por el contrato de
-- `lib/database.types.ts`. `notification_type` lleva sus 11 valores completos
-- aunque los workers de las Fases 5 y 9 no existan todavía: añadir valores a un
-- enum después es la operación con más fricción de todo el schema.
-- ============================================================================

-- Admin y aseador comparten el rol de Postgres `authenticated`; este enum es lo
-- que las policies leen desde public.profiles, nunca desde un claim del JWT.
create type public.user_role as enum ('admin', 'aseador');

-- Exactamente CUATRO valores. PROJECT.md descarta explícitamente un estado
-- intermedio entre confirmación y en_curso: "cuatro estados y ya".
-- `completada` y `cancelada` son terminales: la máquina de estados de la
-- migración 05 no admite transiciones de salida desde ellos.
-- Ojo: `cancelada` es el ÚNICO valor que queda fuera del índice único parcial
-- `cleanings_one_active_per_property_date`.
create type public.cleaning_state as enum ('pendiente', 'en_curso', 'completada', 'cancelada');

create type public.cleaning_type as enum ('normal', 'repaso', 'emergencia');

-- El MVP solo usa 'airbnb'. Los otros dos existen desde ya para no migrar el
-- enum cuando entre un segundo proveedor.
create type public.feed_provider as enum ('airbnb', 'booking', 'otro');

-- Estado del outbox de push. 'descartado' es el terminal de las que agotaron
-- reintentos o cuya suscripción quedó revocada.
create type public.push_status as enum ('pendiente', 'enviado', 'fallido', 'descartado');

create type public.notification_type as enum (
  'asignacion',
  'no_puedo',
  'dano_reportado',
  'faltantes_reportados',
  'gasto_reportado',
  'aseo_completado',
  'hora_limite_vencida',
  'calendario_caido',
  'extension_sospechosa',
  'aseo_cancelado',
  'retencion_proxima'
);
