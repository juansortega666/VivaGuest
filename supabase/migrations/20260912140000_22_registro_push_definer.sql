-- ===========================================================================
-- 22 — EL REGISTRO DE LA SUSCRIPCIÓN PASA POR UNA FUNCIÓN DEFINER
--
-- ── EL BUG QUE ESTE ARCHIVO CIERRA, REPRODUCIDO EN SQL PURO (2026-09-12) ────
--
-- `registrarSuscripcion` hacía `upsert(..., { onConflict: 'endpoint' })`.
-- PostgREST traduce eso a un `INSERT … ON CONFLICT DO UPDATE` que mete TODAS
-- las columnas del payload en el `SET`, y ahí va `user_id`. La migración 16 le
-- quitó `user_id` al `grant update` de `authenticated` a propósito (T-01-36), y
-- Postgres exige el privilegio de UPDATE sobre las columnas del `SET` AUNQUE NO
-- HAYA CONFLICTO. Resultado medido:
--
--   insert … (7 columnas)                          → INSERT 0 1        ✅
--   insert … on conflict (endpoint) do update set… → 42501 permission  ⛔
--
-- O sea: NINGÚN aseador quedaba registrado nunca. NOTIF-01 roto de punta a
-- punta, sin fila contra la que enviar, y por tanto sin un solo aviso posible.
--
-- Y era INVISIBLE: el cliente no miraba el `ok` de la action, así que la
-- reparación silenciosa se daba por buena, el banner desaparecía y el aseador
-- veía la pantalla de "todo bien". Esa mitad se arregla en el cliente; esta es
-- la de la base.
--
-- ── POR QUÉ UNA FUNCIÓN DEFINER Y NO DEVOLVERLE `user_id` AL GRANT ──────────
--
-- Porque es lo que la propia migración 16 dejó escrito: *"La reasignación tiene
-- que pasar por una función definer o por el worker, nunca por el navegador."*
-- Devolver `user_id` al grant de update reabriría exactamente el camino que esa
-- migración cerró. La función escribe SIEMPRE `auth.uid()` y nunca un id que
-- venga del cliente, así que la reasignación del teléfono compartido funciona
-- sin que nadie pueda registrar un endpoint a nombre de otro.
--
-- Los grants de tabla NO se tocan: `revocarSuscripcionPropia` y la marca de
-- visto siguen por el camino de siempre, y ese camino nunca estuvo roto.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- `registrar_suscripcion_push` — el alta del teléfono, idempotente.
--
-- `on conflict (endpoint)` y no `(user_id, endpoint)`: el endpoint identifica al
-- NAVEGADOR, no a la persona (T-01-36). Si una aseadora entra en el teléfono de
-- otra, el navegador devuelve EL MISMO endpoint y la fila se REASIGNA en vez de
-- duplicarse. Con dos filas vivas sobre el mismo destino, el aseo de una sonaría
-- en el teléfono de la otra (T-05-40).
--
-- `revoked_at` y `revoked_reason` SE LIMPIAN al reasignar, y es deliberado: si
-- el navegador acaba de entregar este endpoint, está vivo. Dejarlo revocado
-- daría una suscripción registrada a la que el worker nunca escribe, que es el
-- mismo silencio que este archivo existe para quitar.
--
-- `failure_count` se reinicia por lo mismo: los fallos que contó eran de la
-- encarnación anterior de ese endpoint.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_suscripcion_push(
  p_endpoint             text,
  p_p256dh               text,
  p_auth                 text,
  p_user_agent           text,
  p_soporta_declarativo  boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  -- Sin sesión no hay a quién registrar. 42501 y no P0001: es una falta de
  -- autorización, y `mapDbError()` ya la traduce al copy correcto.
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;

  insert into public.push_subscriptions as s (
    user_id, endpoint, p256dh, auth, user_agent, soporta_declarativo, visto_at
  )
  values (
    v_uid,
    p_endpoint,
    p_p256dh,
    p_auth,
    -- `null` y no cadena vacía: el resto del sistema lee la ausencia de dato
    -- como `null`, y una cadena vacía sería un user agent que nadie mandó.
    -- `coalesce` y `nullif` van SIN calificar y no es un olvido: son
    -- construcciones del lenguaje SQL, no funciones de `pg_catalog`, y
    -- escribirlas calificadas es un error de "function does not exist".
    -- `btrim` sí es función, y por eso esa sí va calificada.
    nullif(pg_catalog.btrim(coalesce(p_user_agent, '')), ''),
    coalesce(p_soporta_declarativo, false),
    pg_catalog.now()
  )
  on conflict (endpoint) do update set
    -- `v_uid` y NO `excluded.user_id`: el dueño sale de la sesión, nunca de lo
    -- que mandó el cliente. Es la línea que hace segura a esta función definer.
    user_id             = v_uid,
    p256dh              = excluded.p256dh,
    auth                = excluded.auth,
    user_agent          = excluded.user_agent,
    soporta_declarativo = excluded.soporta_declarativo,
    visto_at            = pg_catalog.now(),
    revoked_at          = null,
    revoked_reason      = null,
    failure_count       = 0
  where s.endpoint = excluded.endpoint;
end;
$$;

comment on function public.registrar_suscripcion_push(text, text, text, text, boolean) is
  'NOTIF-01. Da de alta el destino de avisos de ESTE navegador para el usuario de la sesión, de forma idempotente por `endpoint`. Existe como función definer porque el upsert equivalente desde el cliente necesita UPDATE sobre `user_id`, que la migración 16 revocó a propósito (T-01-36): sin esta función el registro fallaba SIEMPRE con 42501 y ningún aseador quedaba suscrito. El dueño se toma de `auth.uid()` y nunca del argumento.';

revoke all     on function public.registrar_suscripcion_push(text, text, text, text, boolean) from public, anon;
grant  execute on function public.registrar_suscripcion_push(text, text, text, text, boolean) to authenticated;
