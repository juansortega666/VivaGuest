-- ===========================================================================
-- 29 — CUÁNTO STORAGE SE ESTÁ USANDO, Y DESDE CUÁNDO PASÓ DEL UMBRAL
--
-- Cubre RET-07 («el admin ve el consumo de Storage y recibe alerta al superar
-- el 70% del cupo»). Una sola función de lectura:
--
--   public.consumo_de_storage() ... los cuatro números crudos que alimentan el
--                                   medidor de la cabecera de /operacion Y la
--                                   alerta computada del panel
--
-- ── POR QUÉ ESTE ARCHIVO EXISTE AHORA Y NO EN LA FASE 9 ────────────────────
--
-- El 2026-09-18 el dueño decidió que NADA SE BORRA NUNCA: ni las fotos a los
-- 30 días, ni los aseos a los 6 meses. Cuando el espacio apriete, se paga Pro.
-- Sin purga, esta lectura es LA ÚNICA SEÑAL que existe antes de que el Storage
-- se llene, y el síntoma de llenarse sin aviso no es un error en un log: es una
-- aseadora de pie en un apartamento que no puede subir la foto de evidencia y
-- no puede terminar el aseo.
--
-- ── LAS REGLAS DE LA MIGRACIÓN 26 APLICAN ENTERAS ──────────────────────────
--
--   1. LA GUARDA DE ADMIN ES LA PRIMERA SENTENCIA EJECUTABLE DEL CUERPO, con
--      `42501` al denegar. No es formalidad: esta función es propiedad de
--      `postgres`, que tiene `rolbypassrls = t` (verificado contra
--      `pg_roles`; `authenticated` NO lo tiene), así que el cuerpo ve
--      `storage.objects` ENTERA, saltándose la RLS. Sin esa línea, la función
--      le entrega el volumen de operación del negocio a cualquiera que la
--      llame, incluida una aseadora.
--
--      Y ojo con lo que esa guarda NO cierra: `storage.get_size_by_bucket()`
--      es `security INVOKER`, sin `search_path` fijado y con `proacl` NULO, o
--      sea EXECUTE para PUBLIC. Una aseadora la puede llamar y le devuelve la
--      suma de SUS PROPIAS fotos, porque la RLS de `evidencia_cleaner_select`
--      sí le aplica. Esa frontera es real y `12_almacenamiento.test.sql` la
--      afirma COMO ES, no como uno quisiera que fuera.
--
--   2. `security definer set search_path = ''` y todo nombre calificado por
--      esquema. `auth.uid()` incluido, vía `private.is_admin()`, que consulta
--      `profiles` EN LA BASE y no un claim del JWT: un admin degradado hace un
--      minuto no puede leer esto con su token todavía vivo (criterio 4 del
--      ROADMAP).
--
--   3. Par de `revoke` + `grant` PEGADO A LA DEFINICIÓN. No se hereda: en PG 17
--      una función nueva de `public` nace ejecutable por `anon` salvo que se
--      revoque ahí mismo (guardarraíl 9 de `02_guardarrailes`).
--
-- ── POR QUÉ NO SE USA `storage.get_size_by_bucket()` PARA EL TOTAL ─────────
--
-- Es contraintuitivo, porque la función existe, funciona y hace exactamente la
-- suma. La razón es de COHERENCIA, y es la misma que `resumen_financiero`
-- escribe para hacer un solo recorrido:
--
--   El instante de cruce obliga a recorrer los objetos igual. Llamar ADEMÁS a
--   `get_size_by_bucket()` sería UN SEGUNDO SNAPSHOT INDEPENDIENTE: en `read
--   committed`, una foto que entre entre las dos lecturas haría que el total y
--   el cruce no describieran el mismo estado del mundo, y el medidor de la
--   cabecera contradiría a la alerta del panel dentro del mismo render.
--
-- Con un solo `return query` sobre `storage.objects` ese agujero no existe por
-- construcción. (Medido de paso: una definer con `search_path = ''` SÍ puede
-- llamar a `get_size_by_bucket()` sin romperse, porque el cuerpo de la función
-- de Supabase califica `"storage".objects`. No se usa por lo de arriba, no
-- porque no se pueda.)
--
-- ── POR QUÉ EL CUPO SALE DE `app_settings` Y NO DE UNA CONSTANTE ───────────
--
-- Porque la decisión del dueño es literal: *cuando apriete, pago Pro*. Pasar de
-- 1 GB a 100 GB tiene que ser un `update` de una fila, no un despliegue. El
-- ajuste se llama `storage_quota_mb` y vive pegado a `storage_alert_threshold_pct`,
-- que ya estaba. Se leen con el patrón de la migración 23 y con `coalesce` a
-- 1024 y 70, para que la función siga siendo correcta si alguien borra la fila.
--
-- ── LA COMPARACIÓN DEL CRUCE ES CON ENTEROS, NO CON PORCENTAJES ────────────
--
-- `acumulado * 100 >= cupo * umbral`, y nunca `round(acumulado*100/cupo) >=
-- umbral`. Redondear a porcentaje antes de comparar haría que 69.6% dijera 70 y
-- la alerta saltaría antes de tiempo, que en una alarma de capacidad es la
-- forma más rápida de que dejen de creerle. Es `>=` y no `>` a propósito:
-- esperar al 70.1% para avisar no compra nada.
--
-- ── ESTA MIGRACIÓN NO AGENDA NINGÚN JOB, Y ES DELIBERADO ───────────────────
--
-- La alerta que alimenta es COMPUTADA AL LEER, no una fila de `notifications`.
-- Tres razones: es un ESTADO y no un evento (se apaga sola el día que suba el
-- cupo, sin que nadie vaya a borrar una fila); no es atendible, porque
-- reaparecería en la lectura siguiente; y una fila persistida exigiría un valor
-- nuevo en el enum `notification_type` MÁS un productor agendado. La migración
-- 06 dejó escrito que los jobs los agendan las Fases 3 y 9, y hay una puerta de
-- CI que lo verifica.
--
-- Consecuencia que se acepta y queda escrita: SI EL ADMIN NO ABRE /operacion,
-- NADIE MIDE EL STORAGE. Es el mismo estándar que el proyecto ya aceptó para
-- `calendario_caido`, que es una falla más urgente que esta, y por la razón que
-- `alertas.ts` ya tiene redactada: no es un vigilante, es una lectura, y la
-- hace la página que el admin abre de todas formas.
--
-- ── TRAMPAS DE ESTE REPO QUE MUERDEN AQUÍ, TODAS MEDIDAS ───────────────────
--
--   1. `coalesce` NO se califica con el esquema del catálogo: es una
--      construcción del lenguaje SQL, no una función, y calificarla revienta
--      con «function does not exist» en un cuerpo con el camino de búsqueda
--      vacío. Costó un error en la migración 22.
--   2. En una función `returns table`, los nombres de las columnas de salida
--      son variables del cuerpo: TODA referencia a una columna de tabla va
--      calificada con su alias o plpgsql la rechaza por ambigua. Es la lección
--      literal de la migración 24. Por eso los alias del CTE (`creado_at`,
--      `bytes`, `acumulado`) no se parecen a ninguna columna de salida.
--   3. El guardarraíl 4 de `scripts/ci/check-service-role.sh` prohíbe por grep
--      las funciones de fecha de sesión en migraciones. Aquí no hace falta
--      ninguna: todo son `timestamptz` crudos.
--   4. `group by` sobre el vacío NO emite filas. Por eso el total sale de un
--      subconsulta escalar envuelta en `coalesce(..., 0)` y no de un agregado
--      agrupado: con cero objetos la respuesta correcta es `0 B`, no «sin
--      datos».
-- ===========================================================================

create or replace function public.consumo_de_storage()
returns table (
  usado_bytes bigint,
  cupo_bytes  bigint,
  umbral_pct  int,
  cruce_at    timestamptz
)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_cupo_mb  bigint;
  v_umbral   int;
  v_cupo     bigint;
begin
  -- ── LA GUARDA. PRIMERA SENTENCIA EJECUTABLE DEL CUERPO (regla 1). ────────
  if not (select private.is_admin()) then
    raise exception 'no_autorizado'
      using errcode = '42501',
            hint    = 'El consumo de almacenamiento es información del negocio: solo lo ve un administrador activo.';
  end if;

  -- ── EL CUPO Y EL UMBRAL, LEÍDOS DE `app_settings` (patrón de la mig. 23) ──
  -- El `coalesce` de afuera es lo que mantiene la función correcta si alguien
  -- borra la fila: 1024 MB es el free tier y 70% es el umbral del requisito.
  select coalesce(
           (select (s.value #>> '{}')::bigint
              from public.app_settings s
             where s.key = 'storage_quota_mb'),
           1024)
    into v_cupo_mb;

  select coalesce(
           (select (s.value #>> '{}')::int
              from public.app_settings s
             where s.key = 'storage_alert_threshold_pct'),
           70)
    into v_umbral;

  -- Megabytes binarios, que es lo que significan el gigabyte del free tier y el
  -- número del ajuste. La misma base 1024 que usa el formateador del dominio.
  v_cupo := v_cupo_mb * 1024 * 1024;

  -- ── UN SOLO RECORRIDO, UN SOLO SNAPSHOT ──────────────────────────────────
  return query
  with objetos as (
    -- El `coalesce` de adentro NO sobra: hay objetos cuyo `metadata` no trae
    -- `size` (medido vivo), y sin él la suma entera se volvería nula y el
    -- medidor diría «no se pudo medir» por un solo objeto raro.
    select o.created_at                                 as creado_at,
           coalesce((o.metadata ->> 'size')::bigint, 0)  as bytes
      from storage.objects o
     where o.bucket_id = 'evidencia'
  ),
  corrido as (
    -- La suma corrida por fecha. El desempate por `bytes` existe para que dos
    -- objetos con el mismo `created_at` no produzcan un orden distinto entre
    -- lecturas: `cruce_at` tiene que ser ESTABLE, o la alerta cambiaría de
    -- sitio en el orden cronológico del panel sin que pasara nada.
    select ob.creado_at,
           (sum(ob.bytes) over (order by ob.creado_at, ob.bytes
                                rows between unbounded preceding and current row))::bigint as acumulado
      from objetos ob
  )
  select coalesce((select sum(ob.bytes) from objetos ob), 0)::bigint,
         v_cupo,
         v_umbral,
         -- NULO cuando no hay cruce, y ESO es lo que apaga la alerta. La
         -- comparación es entera de los dos lados (ver cabecera).
         (select min(c.creado_at)
            from corrido c
           where c.acumulado * 100 >= v_cupo * v_umbral);
end
$fn$;

comment on function public.consumo_de_storage() is
  'RET-07. Cuántos bytes lleva el bucket `evidencia`, contra qué cupo, con qué umbral, y desde cuándo se pasó. DEVUELVE LOS CUATRO NÚMEROS CRUDOS Y NINGÚN VEREDICTO: el porcentaje y el «está lleno» se derivan en lib/domain/almacenamiento.ts, que es puro y se prueba sin base; un booleano calculado aquí sería el único sitio donde el umbral estaría aplicado y solo se podría ejercer con el ciclo más lento del repo. El total y el instante de cruce salen de UN SOLO recorrido de storage.objects y no de storage.get_size_by_bucket(): dos lecturas serían dos snapshots y en read committed el medidor de la cabecera podría contradecir a la alerta del panel dentro del mismo render. cruce_at ES EL created_at DEL OBJETO EN QUE LA SUMA CORRIDA CRUZÓ EL UMBRAL, nunca el instante de la lectura: con el instante de la lectura la alerta saltaría al tope del panel en cada render y empujaría hacia abajo hechos más recientes que ella. El cupo sale de app_settings.storage_quota_mb para que pasar a Supabase Pro sea un update de una fila y no un despliegue. Guarda de admin como primera sentencia: la definer es de postgres, que tiene rolbypassrls, así que sin guarda entrega el volumen de operación del negocio a cualquier authenticated.';

revoke all     on function public.consumo_de_storage() from public, anon;
grant  execute on function public.consumo_de_storage() to authenticated;
