-- ===========================================================================
-- 24 — LA FRONTERA DEL ASEADOR: LAS DOS CIFRAS DE DINERO SALEN DE LAS TABLAS
--
-- Cierra la fuga medida del Hallazgo 1 de 07-RESEARCH, que implementa D7-7:
-- cita literal del dueño, *"no, la aseadora no debe saber nada de nuestros
-- cobros"*.
--
-- ── LA FUGA, MEDIDA Y NO SUPUESTA ──────────────────────────────────────────
--
-- Impersonando a la aseadora sembrada de `11_financiero.test.sql`, contra el
-- schema previo a este archivo:
--
--   select max(c.tarifa_huesped) from public.cleanings  c   ->  90000
--   select max(p.tarifa_huesped) from public.properties p   ->  90000
--
-- Esos 90000 son la tarifa real de un apartamento leída desde una sesión de
-- aseadora. Ninguna pantalla los pinta, pero EL DATO VIAJA AL TELÉFONO, y una
-- regla que solo se cumple en la pantalla no se cumple.
--
-- ── POR QUÉ LA POLICY NO BASTA Y HAY QUE BAJAR AL GRANT ────────────────────
--
-- La seguridad a nivel de fila separa por FILA, no por COLUMNA. La policy
-- `cleanings_cleaner_select` acota las filas al `aseador_id` de quien pregunta
-- y `properties_cleaner_select` a los apartamentos de su ventana, pero DENTRO
-- de esas filas la migración 07 otorgó `select` DE TABLA, o sea todas las
-- columnas.
--
-- Y hay una restricción del proyecto que no se puede esquivar, literal de la
-- migración 16:
--
--   *"los grants por columna NO DISCRIMINAN USUARIOS. Admin y aseador comparten
--   el rol Postgres `authenticated`, así que 'solo el admin' no existe como
--   categoría de grant."*
--
-- De ahí sale la única solución correcta, y es la misma que ya recorrieron
-- `property_secrets` y `estado_avisos_aseadores()`: EL GRANT POR COLUMNA QUITA
-- EL DATO PARA TODO EL MUNDO, Y EL ADMIN LO RECUPERA POR UNA FUNCIÓN CON GUARDA
-- EXPLÍCITA DE ROL.
--
-- ===========================================================================
-- ── INVENTARIO DE CONSUMIDORES (levantado ANTES de tocar el primer grant) ──
--
-- El radio de rotura de un grant por columna es TODO el código que hace un
-- select de comodín sobre estas dos tablas, más todo el que nombre una de las
-- dos columnas de dinero con la sesión del usuario. Se levantó contra el
-- catálogo de la base (`information_schema.columns`) y contra el repo, y queda
-- escrito aquí porque es lo que va a permitir entender dentro de un año por qué
-- el grant de abajo está enumerado a mano.
--
-- A) COLUMNAS ACTUALES, LEÍDAS DEL CATÁLOGO Y NO DEL ARCHIVO DE MIGRACIÓN
--    (puede haber columnas añadidas por migraciones posteriores a la 03/04):
--
--    public.cleanings   28 columnas -> se otorgan 26 (menos las dos de dinero)
--    public.properties  18 columnas -> se otorgan 16 (menos las dos de dinero)
--
-- B) CONSUMIDORES CON LA SESIÓN DEL USUARIO (estos SÍ pasan por estos grants):
--
--    | Archivo:línea                              | Qué lee                              | Efecto |
--    |--------------------------------------------|--------------------------------------|--------|
--    | lib/data/apartamentos.ts:106               | listado: las DOS de dinero por nombre | ROMPE -> pasa a la función nueva |
--    | lib/data/apartamentos.ts:158               | ficha: select de comodín sobre props  | ROMPE -> lista explícita + función |
--    | app/(admin)/apartamentos/_actions.ts:665   | activar: select de comodín sobre props| ROMPE -> lista explícita + función |
--    | app/(admin)/apartamentos/_actions.ts:479   | update con representación `select(id)` | no rompe: RETURNING solo pide `id` |
--    | app/(admin)/apartamentos/_actions.ts:488   | insert con representación `select(id)` | no rompe: ídem |
--    | app/(admin)/apartamentos/_actions.ts:683   | activar: update + `select(id)`         | no rompe |
--    | app/(admin)/apartamentos/_actions.ts:726   | desactivar: update + `select(id)`      | no rompe |
--    | app/(admin)/aseadores/_actions.ts:212      | properties, columnas no monetarias     | no rompe |
--    | lib/data/aseadores.ts:128                  | id, nombre, is_active, responsable, suplente | no rompe |
--    | lib/data/aseo-aseador.ts:78                | embed de props: id, nombre, cluster, hora_limite | no rompe |
--    | lib/data/aseos-del-aseador.ts:25           | embed de props: id, nombre, cluster    | no rompe |
--    | lib/data/operacion.ts:257                  | cleanings + embed, sin dinero          | no rompe |
--    | lib/data/historial.ts:223                  | cleanings, sin dinero                  | no rompe |
--
--    EL CONSUMIDOR NO PREVISTO: `activarApartamento` en `_actions.ts:665` hace
--    un select de comodín sobre `properties` para revalidar la fila con
--    `valoresDesdeFilaGuardada`, que SÍ necesita las dos cifras. El plan 07-05
--    no lo tenía inventariado. Se resuelve en este mismo plan, por la vía nueva.
--
-- C) CONSUMIDORES CON EL CLIENTE DE SERVICIO (NO pasan por estos grants,
--    `service_role` conserva su `grant all on all tables` de la migración 07):
--
--    lib/test/aseos.ts:227,250,356,646,675,821,978,1021
--    lib/test/sync.ts:150,416,597,605
--    e2e/fixtures.ts:557,1379
--    e2e/apartamentos-lista.spec.ts, e2e/aseadores-baja.spec.ts, e2e/apartamento-crud.spec.ts
--    app/(admin)/apartamentos/_actions.ts (bloque de `property_secrets`)
--
-- D) SUPERFICIES QUE NO SON PostgREST PERO LEEN LAS MISMAS TABLAS:
--
--    * `public.tg_cleanings_snapshot()` — trigger BEFORE con `select * into
--      strict p from public.properties`. ES EL PUNTO CIEGO DE ESTA MIGRACIÓN y
--      tiene su propia sección más abajo.
--    * Realtime: `public.cleanings` está en la publicación `supabase_realtime`.
--      El único consumidor, `SincronizacionEnVivo.tsx`, NO LEE EL PAYLOAD: ante
--      cualquier evento llama `router.refresh()`. Que Realtime recorte columnas
--      por grant no cambia nada suyo.
--    * Las policies de las dos tablas no nombran ninguna columna de dinero
--      (`private.is_admin()`, `private.is_active_cleaner()`,
--      `private.my_property_ids()`), así que la evaluación de RLS no necesita
--      privilegio sobre ellas.
--    * Ninguna vista de `public` lee estas tablas: `information_schema.views`
--      sobre el esquema `public` devuelve cero filas.
--
-- ===========================================================================


-- ===========================================================================
-- PARTE A — public.cleanings: DEL GRANT DE TABLA AL GRANT POR COLUMNA
--
-- La migración 07 §1.4 dejó `grant select on public.cleanings to authenticated`
-- y CERO DML, con el argumento de que la protección viene de no haber otorgado.
-- Ese argumento sigue en pie para el DML: aquí NO se escribe ningún revoke de
-- insert/update/delete, porque serían no-ops sobre privilegios que nunca se
-- otorgaron y harían pensar que la protección viene del revoke.
--
-- Lo que sí cambia es el SELECT: pasa de tabla a columna.
--
-- ── POR QUÉ TAMBIÉN SALE `pago_aseador`, Y ES DECISIÓN DE ESTE PLAN ────────
--
-- El research daba `pago_aseador` por inocuo, porque es lo que a la persona le
-- pagan. Se cierra igual, y por una razón concreta: leyendo la tabla fila a
-- fila, una aseadora podría armarse el acumulado del PERIODO EN CURSO, que es
-- exactamente lo que D7-4 decidió no enseñarle porque ese número se mueve y
-- puede BAJAR (un aseo cancelado, una tarifa corregida). Lo que sí ve son sus
-- periodos YA CERRADOS, y eso viaja por `public.mis_pagos_cerrados` (plan
-- 07-09), nunca por la tabla.
--
-- Cerrarlo no cuesta nada: verificado por grep, NINGÚN código de aplicación lee
-- `cleanings.pago_aseador` por PostgREST. Todo lo financiero nace por función.
--
-- ── LA CONTRAPARTIDA DE ENUMERAR ───────────────────────────────────────────
--
--   ⚠ CUALQUIER COLUMNA NUEVA DE `public.cleanings` HAY QUE AÑADIRLA TAMBIÉN
--     A ESTA LISTA, O NACERÁ INVISIBLE PARA LA APLICACIÓN aunque exista en la
--     base. El síntoma es un `42703`/`42501` en una pantalla que ayer
--     funcionaba, y el causante es una migración que no tocó ni esta línea ni
--     ese archivo. Es barato comparado con el dato que protege.
-- ===========================================================================
revoke select on public.cleanings from authenticated;

-- Las 28 columnas de `public.cleanings` menos `tarifa_huesped` y
-- `pago_aseador`. Orden: el del catálogo (`ordinal_position`), para que un
-- diff contra `information_schema.columns` sea legible a simple vista.
grant select (
  id, property_id, reservation_id, is_managed, origin, tipo, state,
  scheduled_date, hora_limite, is_urgent, needs_review, review_reason,
  num_huespedes, instrucciones, aseador_id, confirmado_at, confirmado_by,
  started_at, finished_at, cancelled_at, cancel_reason,
  legal_hold, legal_hold_reason, deleted_at, created_at, updated_at
) on public.cleanings to authenticated;


-- ===========================================================================
-- PARTE B — public.properties: LO MISMO, CON LA MISMA ENUMERACIÓN
--
-- ── LOS GRANTS DE ESCRITURA NO SE TOCAN, Y NO ES UN OLVIDO ─────────────────
--
-- `properties_admin_all` es una policy `for all` con `private.is_admin()` en el
-- `using` Y en el `with check`, así que el aseador no puede escribir ni una
-- fila: la RLS lo deja en cero filas y le rechaza el `with check`. Quitarle
-- `insert`/`update` por columna no añadiría NINGUNA garantía, y sí rompería al
-- admin, que comparte el mismo rol de Postgres y sí necesita escribir las dos
-- cifras desde el formulario de `guardarApartamento`.
--
-- Dicho de otro modo: aquí la asimetría es real. La LECTURA hay que cerrarla
-- por columna porque la RLS no llega; la ESCRITURA ya está cerrada por RLS.
--
--   ⚠ MISMA ADVERTENCIA QUE ARRIBA: toda columna nueva de `public.properties`
--     va también a esta lista.
-- ===========================================================================
revoke select on public.properties from authenticated;

-- Las 18 columnas de `public.properties` menos `tarifa_huesped` y
-- `pago_aseador`, en el orden del catálogo.
grant select (
  id, nombre, cluster, direccion, maps_url, maps_lat, maps_lng,
  hora_limite, gestion_vivaguest, fee_discriminado,
  responsable_id, suplente_id, contacto_externo, is_active,
  created_at, updated_at
) on public.properties to authenticated;


-- ===========================================================================
-- PARTE C — public.tarifas_de_apartamentos(uuid[]) — LA VÍA PROPIA DEL ADMIN
--
-- Con las dos columnas fuera del grant, el CRUD del admin se queda sin las
-- cifras que edita. Esta es la puerta que se las devuelve, y SOLO a él.
--
-- ── LA GUARDA VA COMO PRIMERA OPERACIÓN DEL CUERPO, SIN EXCEPCIÓN ──────────
--
-- No es una formalidad de estilo. Una función `security definer` propiedad de
-- `postgres` corre con `rolbypassrls = t`, así que SALTA LA SEGURIDAD A NIVEL
-- DE FILA ENTERA: sin esa línea, esta función le entrega las tarifas del
-- catálogo COMPLETO —incluidos los apartamentos que la aseadora ni siquiera
-- puede ver— a cualquiera que la llame. Sería cerrar la fuga por dos puertas y
-- abrirla por una tercera, más ancha. Es la lección que la migración 16 ya
-- escribió y que el Pitfall 7 de 07-RESEARCH volvió a medir.
--
-- `42501` y no `P0001`: es una falta de autorización, y `mapDbError()` de este
-- repo enruta por el SQLSTATE. El token de máquina va en el mensaje y el
-- español en la pista, que es el contrato del repo desde la migración 16.
--
-- El argumento nulo devuelve TODAS (el listado de 39 en una sola llamada, sin
-- N+1); con una lista, solo esas (la ficha de un apartamento).
--
-- `= any(p_ids)` y no `in (select unnest(...))`: es la forma que el planner
-- convierte en un índice sobre la clave primaria sin materializar nada.
-- ===========================================================================
create or replace function public.tarifas_de_apartamentos(p_ids uuid[] default null)
returns table (
  property_id    uuid,
  tarifa_huesped bigint,
  pago_aseador   bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- ── LA GUARDA. PRIMERA SENTENCIA EJECUTABLE DEL CUERPO. ──────────────────
  if not (select private.is_admin()) then
    raise exception 'no_autorizado'
      using errcode = '42501',
            hint    = 'Las tarifas del apartamento son información del negocio: solo las ve un administrador activo.';
  end if;

  -- Todas las referencias van CALIFICADAS con el alias `p`. Sin calificar,
  -- `tarifa_huesped` y `pago_aseador` chocarían con los parámetros de salida de
  -- la firma `returns table` y plpgsql lo rechaza como referencia ambigua.
  return query
    select p.id, p.tarifa_huesped, p.pago_aseador
      from public.properties p
     where p_ids is null
        or p.id = any(p_ids);
end;
$$;

comment on function public.tarifas_de_apartamentos(uuid[]) is
  'FIN-02 y D7-7. Las dos cifras de dinero de los apartamentos, SOLO para un admin activo. Existe porque la migración 24 sacó tarifa_huesped y pago_aseador del grant de columna de public.properties para cerrar la fuga medida hacia el aseador, y los grants por columna no discriminan usuarios: admin y aseador comparten el rol authenticated. Con el argumento nulo devuelve el catálogo entero; con una lista, solo esos ids. La guarda de rol es la primera sentencia del cuerpo y no se puede mover: una definer sin guarda salta la RLS y entrega el catálogo completo a cualquiera.';

-- El par pegado a la definición, y no heredado: en PG 17 `alter default
-- privileges` NO puede quitarle EXECUTE a PUBLIC, así que una función nueva de
-- `public` nace ejecutable por `anon` salvo que se revoque aquí mismo.
revoke all     on function public.tarifas_de_apartamentos(uuid[]) from public, anon;
grant  execute on function public.tarifas_de_apartamentos(uuid[]) to authenticated;


-- ===========================================================================
-- PARTE D — EL PUNTO CIEGO: `public.tg_cleanings_snapshot()`
--
-- Ese trigger BEFORE INSERT hace, textualmente:
--
--     select * into strict p from public.properties where id = new.property_id;
--     ...
--     new.tarifa_huesped := coalesce(new.tarifa_huesped, p.tarifa_huesped);
--     new.pago_aseador   := coalesce(new.pago_aseador,   p.pago_aseador);
--
-- O sea: un select de COMODÍN sobre `public.properties`, incluidas las dos
-- columnas que este archivo acaba de sacar del grant. Es FIN-01, el
-- congelamiento de tarifas, entregado en la Fase 1.
--
-- SI ESE TRIGGER PERDIERA ACCESO, FIN-01 SE ROMPERÍA SIN DAR UN SOLO ERROR:
-- los aseos nuevos nacerían con las dos cifras nulas y nadie se enteraría hasta
-- el primer cierre de mes, cuando ya no se puede recalcular (D7-3).
--
-- ── POR QUÉ NO SE ROMPE, Y POR QUÉ AUN ASÍ SE COMPRUEBA EJECUTANDO ─────────
--
-- El trigger es `security invoker`, así que corre como el usuario actual de la
-- sesión. Pero `authenticated` NO TIENE NINGÚN DML sobre `public.cleanings`
-- (migración 07 §1.4), de modo que NINGUNA inserción de aseo llega jamás con
-- ese rol activo. Las únicas rutas que existen son:
--
--   1. Las RPC `security definer` propiedad de `postgres` (migraciones 12, 13,
--      15). Dentro de una definer el usuario actual es el DUEÑO, así que el
--      trigger corre como `postgres`, que conserva su grant de tabla.
--   2. `service_role`, que conserva `grant all on all tables` (migración 07 §2).
--   3. `postgres` directo, que es como siembran las suites pgTAP.
--
-- Las tres tienen privilegio de tabla sobre `public.properties`, así que el
-- `select *` del trigger sigue siendo legal.
--
-- Eso es el ARGUMENTO. La COMPROBACIÓN no puede ser leer este comentario: la
-- verificación de esta migración crea un aseo por las vías reales y mira que
-- las dos cifras quedaron congeladas en la fila. Queda cubierta de forma
-- permanente por `lib/test/aseos.integration.test.ts:114-122` y
-- `lib/test/aseos-financiero.integration.test.ts:304-350`, que son tests de
-- integración contra la base real y no dobles.
--
-- SI ALGÚN DÍA ESTO CAMBIARA —por ejemplo si se le diera DML de `cleanings` a
-- `authenticated`— LA SALIDA CORRECTA ES HACER EL TRIGGER `security definer`,
-- NUNCA devolverle a `authenticated` el grant de las dos columnas de dinero.
-- Devolver el grant reabriría exactamente la fuga que este archivo cierra.
-- ===========================================================================
