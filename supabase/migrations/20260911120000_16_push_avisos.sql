-- ============================================================================
-- 16 — EL SCHEMA DE LOS AVISOS: EVIDENCIA DE ENTREGA, FORMATO DEL DESTINO
--      Y LA ÚNICA SUPERFICIE POR LA QUE EL ADMIN SABE QUIÉN QUEDÓ MUDO
--
-- Lo que trae, y nada más:
--
--   (a) el enum `public.grado_verificacion_aviso`, con su asimetría
--   (b) siete columnas ADITIVAS en `public.push_subscriptions`
--   (c) el CHECK de coherencia y el índice único PARCIAL del token
--   (d) el paso del grant DE TABLA al grant POR COLUMNA
--   (e) `public.estado_avisos_aseadores()`
--   (f) `public.registrar_prueba_de_aviso(text)`
--   (g) `public.confirmar_prueba_por_toque(uuid)`
--   (h) `public.confirmar_prueba_a_mano(text)`
--
-- LO QUE NO TRAE, Y NO ES UN OLVIDO:
--
--   · NINGUNA TABLA NUEVA. `push_subscriptions` y `notifications` existen desde
--     la migración 06, con el outbox completo (`push_status`, `push_attempts`,
--     `push_last_error`, `next_attempt_at`, `dedupe_key`) y sus tres índices.
--     El `05-RESEARCH.md` recomienda una tabla propia de entregas: se midió y es
--     falso, ya está.
--   · NINGUNA SENTENCIA SOBRE `notifications`. Ni una. El panel de alertas de la
--     Fase 4 lee esa tabla y tiene que leer exactamente lo mismo después de este
--     archivo. El grupo H de `supabase/tests/07_push.test.sql` lo afirma.
--   · NINGÚN VALOR NUEVO EN `notification_type`. Ese enum tiene once valores,
--     es decisión fijada en el plan 03-03 y repetida en `05-CONTEXT.md`. El enum
--     que se crea aquí es OTRO y no colisiona con nada.
--   · NINGÚN JOB AGENDADO y ningún envío. El drenaje del outbox por Web Push es
--     de otro plan de esta misma fase; aquí solo se prepara el sitio donde vive
--     la evidencia de que el aviso llegó.
--
-- ---------------------------------------------------------------------------
-- POR QUÉ ESTE ARCHIVO EXISTE, EN DOS FRASES
-- ---------------------------------------------------------------------------
--
-- PRIMERA. `05-UI-SPEC.md` §20.10 deja abierta una compuerta con la consecuencia
-- escrita: *"el grado de confirmación de la prueba necesita una columna donde
-- vivir… eso es del planner. Si el planner decide que no cabe, §5.2 y §8.6 se
-- reabren, no se implementan a medias."* Cabe. Vive en `push_subscriptions` y no
-- en `profiles` porque es un hecho DEL DISPOSITIVO, no de la persona: la misma
-- aseadora puede tener un teléfono que recibe avisos y otro que no.
--
-- SEGUNDA, y es la que el UI-SPEC no podía ver. La migración 07 le dio a
-- `authenticated` un `grant update` DE TABLA sobre `push_subscriptions`, con el
-- comentario "la única tabla que el aseador escribe libremente". Con ese grant,
-- un aseador puede escribir `verificado_at` él mismo. Si eso se queda así, el
-- estado `Activos` de §5.2 es AUTOCERTIFICADO y la única verificación de la fase
-- es teatro: el aseador firma el acta de que le llegó un aviso que nunca llegó.
-- Por eso el grant pasa a ser POR COLUMNA y la evidencia solo la mueven las tres
-- funciones `security definer` de la parte D.
--
-- ---------------------------------------------------------------------------
-- LAS OCHO REGLAS DE FUNCIÓN. Son las de la migración 09, repetidas en la 15,
-- sin una sola relajación.
-- ---------------------------------------------------------------------------
--
--   1. `language plpgsql security definer set search_path = ''`.
--   2. TODO nombre calificado por esquema, `auth.uid()` incluido.
--   3. Al lado de CADA definición, sin excepción:
--        revoke all     on function public.<f>(<args>) from public, anon;
--        grant  execute on function public.<f>(<args>) to authenticated;
--      NO SE HEREDA. Medido dos veces en PG 17.6: `alter default privileges`
--      no puede quitarle `EXECUTE` a PUBLIC, porque Postgres refusiona
--      `acldefault('f', owner)` y esa siempre trae la entrada `=X`. El
--      guardarraíl 9 de `02_guardarrailes.test.sql` es la ÚNICA red.
--   4. Guarda de rol con `private.is_admin()`, que consulta `profiles` y exige
--      `is_active`. NUNCA un claim del JWT: un admin degradado hace un minuto no
--      puede leer esto con su token todavía vivo.
--   5. `select … for update` sobre la fila objetivo ANTES de escribirla.
--   6. `42501` cuando el problema es de permiso o cuando distinguir el caso sería
--      un oráculo de enumeración; `P0001` con `hint` en español cuando el usuario
--      SÍ está autorizado y lo que falla es el estado. `mapDbError()` lee el
--      HINT en los `P0001`, no el `message`, así que el texto que ve el aseador
--      viene redactado desde aquí.
--   7. `public.today_bog()` y nunca la fecha de la sesión. Este archivo no
--      necesita ninguna fecha de negocio: todo lo que data son INSTANTES
--      (`timestamptz`), no días calendario.
--   8. Nada de insertar a mano en tablas de bitácora que ya tienen trigger.
-- ============================================================================


-- ===========================================================================
-- PARTE A — EL ENUM DEL GRADO DE CONFIRMACIÓN
-- ===========================================================================
create type public.grado_verificacion_aviso as enum ('toque', 'manual');

-- El comentario dice la ASIMETRÍA, que es lo único que no se deduce leyendo los
-- dos valores. No es una preferencia de estilo: es la regla que la parte D
-- implementa y que `confirmar_prueba_a_mano()` tiene que respetar.
comment on type public.grado_verificacion_aviso is
  'Grado de confirmación del aviso de prueba (UI-SPEC 05 §8.6). `toque` es evidencia dura: el aviso se pintó en la pantalla, era tocable, y alguien lo tocó. `manual` es la palabra de quien acompaña el onboarding, para el caso real de que el aviso se descarte sin querer. LA RELACIÓN ES ASIMÉTRICA: `toque` puede reemplazar a `manual`, al revés NUNCA. Sin esa asimetría, "Ya sonó, no alcancé a tocarlo" sería un botón para saltarse la única verificación de la fase.';


-- ===========================================================================
-- PARTE B — LAS SIETE COLUMNAS. TODAS ADITIVAS.
--
-- Ninguna es `not null` sin default, así que el `alter table` no reescribe la
-- tabla ni exige backfill. Las dos que sí son `not null` traen default constante
-- (PG 11+ no reescribe con default no volátil).
-- ===========================================================================
alter table public.push_subscriptions
  add column soporta_declarativo     boolean not null default false,
  add column verificado_at           timestamptz,
  add column verificacion_grado      public.grado_verificacion_aviso,
  add column verificacion_token      uuid,
  add column verificacion_enviada_at timestamptz,
  add column verificacion_intentos   int not null default 0,
  add column visto_at                timestamptz;

comment on column public.push_subscriptions.soporta_declarativo is
  'D-07. Lo escribe el CLIENTE al suscribirse, por feature detect. Decide qué envoltura arma el servidor para este destino. Es el único de los siete que el navegador puede escribir, y por eso es el único de los siete que aparece en los grants por columna de la parte C.';

comment on column public.push_subscriptions.verificado_at is
  'D-02. Cuándo se confirmó que el aviso de prueba llegó a ESTE dispositivo. NO es escribible por `authenticated`: solo la mueven las funciones definer de la parte D. Si lo fuera, `Activos` (§5.2) sería autocertificado.';

comment on column public.push_subscriptions.verificacion_grado is
  'UI-SPEC 05 §8.6 y §5.2. Con qué grado se confirmó. `Activos` exige `toque`; `manual` deja al aseador en `Sin probar`, que es precisamente lo que hace que la distinción sirva de algo.';

comment on column public.push_subscriptions.verificacion_token is
  'Token vivo del último aviso de prueba enviado a este dispositivo. Viaja DENTRO del aviso (la URL `/instalar?prueba={token}`) y es DE UN SOLO USO: `confirmar_prueba_por_toque()` lo pone a NULL al consumirlo. Nunca se reutiliza entre envíos.';

comment on column public.push_subscriptions.verificacion_enviada_at is
  'Cuándo salió el último aviso de prueba. Existe por una razón concreta: sin envío previo no hay NADA que confirmar a mano, y `confirmar_prueba_a_mano()` lo rechaza con P0001.';

comment on column public.push_subscriptions.verificacion_intentos is
  'UI-SPEC 05 §8.7. El tope de tres envíos, contado EN LA BASE y no en el navegador: este camino manda un push de verdad y un botón que se puede llamar en bucle es un amplificador (T-05-08). El contador de pantalla sigue existiendo, pero es cortesía, no control.';

comment on column public.push_subscriptions.visto_at is
  'Última vez que la app arrancó con esta suscripción. Alimenta el `title` del tooltip de §5.2 ("Última vez que abrió la app: hace 3 días"). Lo escribe el cliente, así que sí está en los grants por columna.';

-- ---------------------------------------------------------------------------
-- El CHECK de coherencia. Impide el estado "verificada de ningún modo": una fila
-- con `verificado_at` puesto y `verificacion_grado` nulo dejaría a §5.2 sin poder
-- decidir entre `Activos` y `Sin probar`, y la UI tendría que inventarse un
-- tercer caso que el contrato no tiene.
-- ---------------------------------------------------------------------------
alter table public.push_subscriptions
  add constraint push_subs_verificacion_shape
  check ((verificado_at is null) = (verificacion_grado is null));

comment on constraint push_subs_verificacion_shape on public.push_subscriptions is
  'Las dos columnas de evidencia viajan juntas o no viajan. Una verificación sin grado no es representable.';

-- ---------------------------------------------------------------------------
-- El índice único del token, PARCIAL, por la misma razón exacta que
-- `notifications_dedupe_idx`: sin el `where`, la semántica de los NULL dentro de
-- un único queda al azar del motor, y aquí la inmensa mayoría de las filas tiene
-- el token en NULL (solo lo lleva la que tiene un aviso de prueba en vuelo).
--
-- Y es ÚNICO y no simple: el token es lo que autoriza a confirmar. Dos
-- suscripciones compartiendo uno sería confirmar la de otro (T-05-14).
-- ---------------------------------------------------------------------------
create unique index push_subs_verificacion_token_idx
  on public.push_subscriptions (verificacion_token)
  where verificacion_token is not null;


-- ===========================================================================
-- PARTE C — DEL GRANT DE TABLA AL GRANT POR COLUMNA
--
-- ES EL CORAZÓN DE ESTA MIGRACIÓN. La migración 07 §1.5 otorga
-- `select, insert, update, delete` de tabla con el comentario "la única tabla
-- que el aseador escribe libremente". Eso sigue siendo CIERTO para lo que el
-- navegador tiene que escribir —registrar su suscripción y repararla cuando el
-- navegador le rota las claves— y deja de serlo para la EVIDENCIA.
--
-- Dicho en una frase que el próximo lector no pueda malinterpretar: el aseador
-- tiene que poder registrar y reparar su propia suscripción, pero NO PUEDE
-- FIRMAR EL ACTA DE QUE LE LLEGÓ.
--
-- Y hay una restricción del proyecto que conviene anotar aquí, porque a primera
-- vista parece que debilita esto: los grants por columna NO DISCRIMINAN
-- USUARIOS. Admin y aseador comparten el rol Postgres `authenticated`
-- (CLAUDE.md, decisión D-16 desde la Fase 1), así que "solo el admin" no existe
-- como categoría de grant. Aquí eso no debilita nada: NINGUNO DE LOS DOS debe
-- escribir la evidencia. Es el caso en que la limitación de la herramienta y el
-- requisito coinciden.
--
-- `select` y `delete` se quedan EXACTAMENTE como estaban, y también la policy
-- `push_subs_own_all` de la migración 08. Este archivo no toca ninguna policy.
-- ===========================================================================
revoke insert, update on public.push_subscriptions from authenticated;

-- Lo que el navegador escribe al suscribirse. `id` no hace falta en la lista:
-- tiene default y omitirlo no requiere privilegio. `user_id` sí, y la policy
-- `push_subs_own_all` lo acota con su `with check` a `auth.uid()`, así que nadie
-- puede registrar un endpoint a nombre de otro.
grant insert (user_id, endpoint, p256dh, auth, user_agent, soporta_declarativo, visto_at)
  on public.push_subscriptions to authenticated;

-- Lo que el navegador repara después. `revoked_at` SÍ queda escribible a
-- propósito: que alguien marque muerta su propia suscripción no hace daño, y es
-- lo que pasa cuando revoca el permiso desde Ajustes.
--
-- `user_id` NO está en esta lista, y es deliberado. El comentario de la
-- migración 06 describe un `upsert on conflict (endpoint)` que REASIGNA
-- `user_id` en un teléfono compartido (T-01-36). Ese camino ya era inalcanzable
-- desde el cliente ANTES de este archivo: el `using` de `push_subs_own_all` no
-- deja ver, y por tanto no deja actualizar, la fila que pertenece a otra
-- persona. La reasignación tiene que pasar por una función definer o por el
-- worker, nunca por el navegador. Quitar `user_id` de aquí no rompe nada que
-- funcionara: lo hace explícito.
--
-- `failure_count`, `last_success_at` y `last_failure_at` tampoco están: son del
-- worker de envío, que corre como `service_role` y no pasa por estos grants.
grant update (endpoint, p256dh, auth, user_agent, soporta_declarativo, visto_at,
              revoked_at, revoked_reason)
  on public.push_subscriptions to authenticated;


-- ===========================================================================
-- PARTE D — LAS CUATRO FUNCIONES
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1/4 — estado_avisos_aseadores() — SOLO ADMIN. La única superficie de D-03.
--
-- POR QUÉ NO SE LE DA `select` AL ADMIN SOBRE LA TABLA, que sería más corto:
-- el `endpoint` es una CREDENCIAL PORTADORA. Quien lo tiene puede mandarle
-- avisos a ese teléfono; `p256dh` y `auth` son las claves con las que se cifra
-- el contenido. El admin no necesita NINGUNA de las tres para cumplir D-03:
-- necesita un agregado que le diga a quién llamar por teléfono. Por eso esta
-- función, cuyo `returns table` NO TIENE RANURA para ninguna de ellas, y por eso
-- NO se añade ninguna policy de admin sobre `push_subscriptions` (T-05-07).
--
-- POR QUÉ DEVUELVE TAMBIÉN A QUIEN TIENE CERO SUSCRIPCIONES: ese cero es
-- exactamente el estado `Sin avisos` de §5.2, que es el que D-03 existe para
-- hacer visible. Omitirlo obligaría a la UI a inventarse la ausencia cruzando
-- esta consulta con la lista de aseadores, y una ausencia inventada en el
-- cliente es la forma de que un aseador mudo no aparezca en ninguna pantalla.
--
-- Un aseador DESACTIVADO no sale: su teléfono ya no importa (§5.2 lo pinta con
-- una raya, no con un estado).
-- ---------------------------------------------------------------------------
create or replace function public.estado_avisos_aseadores()
returns table (
  aseador_id             uuid,
  suscripciones_vivas    int,
  verificado_por_toque   boolean,
  ultima_verificacion    timestamptz,
  ultimo_visto           timestamptz,
  ultimo_exito           timestamptz,
  primera_suscripcion_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_admin()) then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;

  -- `left join` y no `join`: es lo que produce la fila del aseador sin teléfono.
  -- El filtro de `revoked_at` va en el ON y no en el WHERE, porque en el WHERE
  -- convertiría el left join en uno interno y volvería a desaparecer justo el
  -- caso que hay que ver: el aseador cuya única suscripción está revocada.
  return query
    select p.id,
           count(s.id)::int,
           -- Con dos teléfonos basta que UNO esté verificado de verdad. El
           -- coalesce cubre la fila sin suscripciones, donde bool_or da NULL.
           coalesce(bool_or(s.verificacion_grado = 'toque'), false),
           max(s.verificado_at),
           max(s.visto_at),
           max(s.last_success_at),
           min(s.created_at)
      from public.profiles p
      left join public.push_subscriptions s
             on s.user_id    = p.id
            and s.revoked_at is null
     where p.role = 'aseador'
       and p.is_active
     group by p.id;
end;
$$;

comment on function public.estado_avisos_aseadores() is
  'D-03 y UI-SPEC 05 §5.2. Única superficie por la que el admin sabe quién quedó sin avisos. Devuelve una fila por aseador ACTIVO, incluidos los que tienen cero suscripciones vivas. NO expone `endpoint`, `p256dh` ni `auth`: el endpoint es una credencial portadora y el admin no necesita ninguna para saber a quién llamar (T-05-07). Es la contrapartida de no añadir una policy de admin sobre push_subscriptions.';

revoke all     on function public.estado_avisos_aseadores() from public, anon;
grant  execute on function public.estado_avisos_aseadores() to authenticated;


-- ---------------------------------------------------------------------------
-- 2/4 — registrar_prueba_de_aviso(text) — el aseador, sobre su propio teléfono.
--
-- Devuelve el token que el llamante mete dentro del aviso de prueba. El tope de
-- tres vive AQUÍ y no en el navegador porque este camino manda un push de
-- verdad: un botón que dispara envíos y se puede llamar en bucle es un
-- amplificador (T-05-08). El `for update` antes de incrementar es lo que impide
-- que dos toques simultáneos cuenten como uno.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_prueba_de_aviso(p_endpoint text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id       uuid;
  v_intentos int;
  v_token    uuid;
begin
  -- La propiedad va DENTRO del mismo select que localiza la fila. Separarla en
  -- un `if` posterior invita a que alguien meta un `return` entre medias.
  select s.id, s.verificacion_intentos
    into v_id, v_intentos
    from public.push_subscriptions s
   where s.endpoint   = p_endpoint
     and s.user_id    = (select auth.uid())
     and s.revoked_at is null
     for update;

  if v_id is null then
    -- 42501 y no P0001: para el cliente tiene que ser indistinguible "no
    -- existe", "no es tuya" y "está revocada". Un error que discriminara esos
    -- casos sería un oráculo de enumeración de endpoints ajenos, y el endpoint
    -- es justo la credencial que no puede filtrarse (T-05-14).
    raise exception 'no_autorizado' using errcode = '42501';
  end if;

  if v_intentos >= 3 then
    -- P0001 y no 42501: aquí el aseador SÍ está autorizado. Lo que se agotó es
    -- el tope. El hint es el copy literal de §8.7 porque `mapDbError()` lo
    -- devuelve tal cual a la pantalla.
    raise exception 'tope_de_pruebas'
      using errcode = 'P0001',
            hint    = 'Probamos 3 veces y no llegó ninguno. Avísale a tu administrador: puede ser el teléfono, la versión del sistema o la conexión.';
  end if;

  -- Calificado a `pg_catalog` a propósito: `pgcrypto` está instalada en el
  -- esquema `extensions` y exporta una función con este mismo nombre. Con
  -- `search_path = ''` solo resuelve `pg_catalog`, pero escribirlo entero deja
  -- la pregunta contestada en vez de abierta.
  v_token := pg_catalog.gen_random_uuid();

  update public.push_subscriptions
     set verificacion_intentos   = verificacion_intentos + 1,
         verificacion_token      = v_token,
         verificacion_enviada_at = now()
   where id = v_id;

  return v_token;
end;
$$;

comment on function public.registrar_prueba_de_aviso(text) is
  'UI-SPEC 05 §8.6 y §8.7. Reserva un envío de aviso de prueba sobre una suscripción PROPIA y viva, y devuelve el token de un solo uso que viaja dentro del aviso. Tope de 3 por suscripción contado en la base, no en el navegador (T-05-08). 42501 si la suscripción no es suya, no existe o está revocada; P0001 con hint en español al agotarse el tope.';

revoke all     on function public.registrar_prueba_de_aviso(text) from public, anon;
grant  execute on function public.registrar_prueba_de_aviso(text) to authenticated;


-- ---------------------------------------------------------------------------
-- 3/4 — confirmar_prueba_por_toque(uuid) — la confirmación BUENA.
--
-- La llama la app al abrirse en `/instalar?prueba={token}`, que es a donde
-- navega el aviso al tocarlo. Es la única evidencia que no depende de que nadie
-- diga nada: el aviso se pintó, era tocable, y alguien lo tocó.
--
-- SI EL TOKEN NO APARECE, SALE SIN LANZAR. Y es deliberado: el token ya se
-- consumió (el navegador reabrió la misma URL), o es de otra sesión. Lanzar aquí
-- convertiría un reintento normal del navegador en una pantalla de error, y el
-- aseador vería un fallo justo en el momento en que todo salió bien.
--
-- La propiedad de la suscripción va en el MISMO select que busca el token: sin
-- ella, cualquiera que adivinara un token confirmaría el teléfono de otro
-- (T-05-14). El índice único parcial de la parte B es la otra mitad de esa
-- defensa: impide que dos suscripciones compartan token.
-- ---------------------------------------------------------------------------
create or replace function public.confirmar_prueba_por_toque(p_token uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select s.id
    into v_id
    from public.push_subscriptions s
   where s.verificacion_token = p_token
     and s.user_id            = (select auth.uid())
     and s.revoked_at         is null
     for update;

  if v_id is null then
    return;
  end if;

  update public.push_subscriptions
     set verificado_at         = now(),
         verificacion_grado    = 'toque',
         -- Un solo uso. Y los intentos vuelven a cero porque el tope de §8.7
         -- deja de tener sentido para una suscripción ya verificada.
         verificacion_token    = null,
         verificacion_intentos = 0
   where id = v_id;
end;
$$;

comment on function public.confirmar_prueba_por_toque(uuid) is
  'UI-SPEC 05 §8.6, confirmación por toque: el grado que §5.2 exige para `Activos`. Consume el token (un solo uso) y pone los intentos a cero. Con un token ya consumido o ajeno NO LANZA y no hace nada: reabrir el aviso no es un fallo. Exige `user_id = auth.uid()` en el mismo select que busca el token (T-05-14).';

revoke all     on function public.confirmar_prueba_por_toque(uuid) from public, anon;
grant  execute on function public.confirmar_prueba_por_toque(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- 4/4 — confirmar_prueba_a_mano(text) — la confirmación FLOJA.
--
-- Existe porque el caso real es alguien acompañando el onboarding y un aviso que
-- se descarta sin querer. Y existe ACOTADA por dos reglas, que son las que
-- impiden que sea un botón para saltarse la verificación:
--
--   1. Sin envío previo NO SE PUEDE. Confirmar a mano algo que nunca se mandó
--      sería inventarse la evidencia entera, no solo el grado.
--   2. NO DEGRADA UN `toque`. Si la suscripción ya está confirmada por toque,
--      sale sin hacer nada. Es la asimetría del enum, aplicada.
-- ---------------------------------------------------------------------------
create or replace function public.confirmar_prueba_a_mano(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id      uuid;
  v_enviada timestamptz;
  v_grado   public.grado_verificacion_aviso;
begin
  select s.id, s.verificacion_enviada_at, s.verificacion_grado
    into v_id, v_enviada, v_grado
    from public.push_subscriptions s
   where s.endpoint   = p_endpoint
     and s.user_id    = (select auth.uid())
     and s.revoked_at is null
     for update;

  if v_id is null then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;

  if v_enviada is null then
    raise exception 'sin_envio_previo'
      using errcode = 'P0001',
            hint    = 'Todavía no se ha enviado ningún aviso de prueba a este teléfono. Envía uno antes de confirmarlo a mano.';
  end if;

  if v_grado = 'toque' then
    return;
  end if;

  update public.push_subscriptions
     set verificado_at      = now(),
         verificacion_grado = 'manual',
         verificacion_token = null
   where id = v_id;
end;
$$;

comment on function public.confirmar_prueba_a_mano(text) is
  'UI-SPEC 05 §8.6, confirmación a mano ("Ya sonó, no alcancé a tocarlo"). Deja `verificacion_grado = manual`, que en §5.2 sigue siendo `Sin probar`: el admin ve que la prueba no se comprobó tocando el aviso. P0001 si nunca se envió un aviso de prueba a ese teléfono. NO DEGRADA una confirmación por toque: sale sin hacer nada. 42501 si la suscripción no es suya.';

revoke all     on function public.confirmar_prueba_a_mano(text) from public, anon;
grant  execute on function public.confirmar_prueba_a_mano(text) to authenticated;
