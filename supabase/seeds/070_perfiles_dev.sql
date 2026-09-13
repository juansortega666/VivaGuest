-- Perfiles de desarrollo.
--
-- Por que existe: `supabase db reset` recrea la base desde migraciones + seeds, y
-- `auth.users` no la toca ningun seed. Los usuarios de desarrollo se venian creando a
-- mano por la Admin API, asi que un reset los borraba sin forma automatica de
-- recuperarlos. El plan 03-03 estuvo a punto de perder tres perfiles en uso por eso.
--
-- Solo desarrollo local. En hosted los admins los crea un superadmin desde backend,
-- como fija PROJECT.md, y los aseadores el admin desde la UI.
--
-- Contrasena de los tres: VivaGuest2026!
--
-- Estado de verificacion (2026-09-02): la guarda de "ya existen" esta probada contra la
-- base local, omite sin duplicar. El camino de creacion desde cero NO se ha ejercitado
-- todavia: clonar la base para probarlo requiere que no haya sesiones activas, y el stack
-- estaba en uso. Lo ejercita el primer `db reset` real que corra un plan de esta fase.
--
-- ── EJERCITADO EL 2026-09-06 POR EL PLAN 04-14, Y SALIO ROTO ────────────────────
--
-- Los cuatro `''` de abajo NO son decorativos y son la razon por la que este bloque
-- lleva un comentario tan largo. `confirmation_token`, `recovery_token`,
-- `email_change_token_new` y `email_change` son las UNICAS cuatro columnas de texto de
-- `auth.users` que NO tienen DEFAULT en el schema (las otras cuatro, `phone_change`,
-- `phone_change_token`, `email_change_token_current` y `reauthentication_token`, sí lo
-- tienen, y por eso nunca dieron guerra). Un insert que las omite las deja en NULL, y
-- GoTrue las escanea a un `string` de Go que no admite NULL:
--
--   GET /admin/users -> 500
--   "unable to fetch records: sql: Scan error on column index 3,
--    name \"confirmation_token\": converting NULL to string is unsupported"
--
-- Y no rompe solo el listado de usuarios: **rompe la suite E2E entera**, porque
-- `e2e/global-setup.ts` pagina `listUsers()` para borrar y recrear los usuarios semilla
-- antes de la primera prueba. El sintoma es "Database error finding users" al arrancar
-- Playwright, que no menciona ni esta tabla ni este seed.
--
-- Medido en la base local el 2026-09-06: las tres filas de este seed tenian las cuatro
-- columnas en NULL, y ninguna otra fila de `auth.users` (todas creadas por la Admin API)
-- las tenia. Con los cuatro `''` puestos, `listUsers()` vuelve a 200.

do $$
declare
  v_admin  uuid := '00000000-0000-4000-8000-000000000001';
  v_maria  uuid := '00000000-0000-4000-8000-000000000002';
  v_luz    uuid := '00000000-0000-4000-8000-000000000003';
  v_hash   text := crypt('VivaGuest2026!', gen_salt('bf'));
begin
  -- Sin el proyecto de auth arriba esto no aplica; no es error.
  if to_regclass('auth.users') is null then
    raise notice 'auth.users ausente: seed de perfiles omitido';
    return;
  end if;

  -- Si el correo ya existe (creado a mano por la Admin API antes de que este seed
  -- existiera), no se toca: su uuid es otro y duplicarlo choca contra el unique de email.
  if exists (select 1 from auth.users where email in
             ('admin@vivaguest.test','maria@vivaguest.test','luz@vivaguest.test')) then
    raise notice 'perfiles de dev ya presentes: seed omitido';
    return;
  end if;

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    -- Las cuatro sin DEFAULT en el schema. Ver la cabecera: en NULL rompen
    -- `GET /admin/users` con un 500 y con el la suite E2E completa.
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values
    (v_admin, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'admin@vivaguest.test', v_hash, now(), now(), now(),
     '{"provider":"email","providers":["email"],"role":"admin"}'::jsonb, '{}'::jsonb,
     '', '', '', ''),
    -- ── `role` VA EN `raw_app_meta_data` TAMBIEN PARA LAS ASEADORAS ──────────
    -- Sin esta clave el login funciona y la sesion se crea, pero el middleware
    -- lee `user.app_metadata.role`, lo encuentra `undefined`, y devuelve a
    -- `/login` en bucle: se ve como "el boton Entrar no hace nada", que es
    -- exactamente como se reporto el 2026-09-12 desde un iPhone.
    --
    -- El `update` de `profiles` de mas abajo NO alcanza: `profiles` es la
    -- autoridad para RLS y para la desactivacion, pero el ruteo del middleware
    -- sale del JWT, y son dos sitios distintos. El alta real de un aseador
    -- (Fase 2) escribe los dos; esta semilla escribia solo uno.
    (v_maria, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'maria@vivaguest.test', v_hash, now(), now(), now(),
     '{"provider":"email","providers":["email"],"role":"aseador"}'::jsonb, '{}'::jsonb,
     '', '', '', ''),
    (v_luz,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'luz@vivaguest.test', v_hash, now(), now(), now(),
     '{"provider":"email","providers":["email"],"role":"aseador"}'::jsonb, '{}'::jsonb,
     '', '', '', '')
  on conflict (id) do nothing;

  -- El trigger de la Fase 1 materializa `profiles` con rol `aseador` siempre, sin mirar
  -- `raw_app_meta_data`. La promocion a admin es un paso aparte, y es coherente con que
  -- PROJECT.md diga que los admins los crea un superadmin desde backend.
  update public.profiles set role = 'admin', full_name = 'Juan Ortega'  where id = v_admin;
  update public.profiles set full_name = 'Maria Restrepo'               where id = v_maria;
  update public.profiles set full_name = 'Luz Ospina'                   where id = v_luz;
end $$;
