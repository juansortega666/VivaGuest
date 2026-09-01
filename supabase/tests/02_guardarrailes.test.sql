-- ============================================================================
-- 02_guardarrailes.test.sql — invariantes de schema
--
-- Estas aserciones NO son redundantes con `supabase db advisors`. El research
-- lo verificó en las dos direcciones (01-RESEARCH.md §9.2): `rls_disabled_in_public`
-- y `security_definer_view` SOLO disparan si el objeto tiene grants. Con el DDL
-- puesto y sin la migración de grants, el advisor reportó cero problemas sobre
-- una tabla sin RLS y una vista sin `security_invoker`; al añadir el grant,
-- ambos aparecieron como ERROR.
--
-- O sea: una tabla creada sin grant y sin RLS es invisible para el advisor
-- hasta el día en que alguien le añada el grant, y ese día la fuga ya existe.
-- Este archivo tapa ese hueco.
--
-- No lleva fixtures ni bloque de limpieza: solo consulta catálogos.
-- ============================================================================

begin;
select plan(10);

-- 1  RLS sin excepciones. Una tabla de `public` sin RLS es una tabla pública.
select is_empty($q$
  select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and not c.relrowsecurity
$q$, 'guardarraíl: toda tabla de public tiene RLS habilitada');

-- 2  RLS sin policy devuelve todo vacío, en silencio. Ese silencio es lo que
--    empuja a un dev a "arreglarlo" desactivando RLS o metiendo service_role.
select is_empty($q$
  select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and c.relrowsecurity
     and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
$q$, 'guardarraíl: toda tabla con RLS tiene al menos una policy');

-- 3  Sin security_invoker la vista corre con los privilegios del owner y salta
--    la RLS de las tablas base. Medido en el research: 4 filas en vez de 1.
select is_empty($q$
  select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'v'
     and coalesce((select option_value
                     from pg_options_to_table(c.reloptions)
                    where option_name = 'security_invoker'), 'off') <> 'true'
$q$, 'guardarraíl: toda vista de public lleva security_invoker = on');

-- 4  Una tabla nueva nace con REFERENCES, TRIGGER y TRUNCATE para anon, y
--    TRUNCATE ignora la RLS por completo (verificado: anon truncó la tabla).
select is_empty($q$
  select table_name || ':' || privilege_type
    from information_schema.role_table_grants
   where table_schema = 'public'
     and grantee = 'anon'
$q$, 'guardarraíl: anon no conserva ningún privilegio sobre public, ni TRUNCATE');

-- 4b El pg_default_acl de la CLI 2.116.0 cubre SECUENCIAS, no solo tablas: una
--    tabla con bigserial nace con USAGE/UPDATE para anon sobre su secuencia.
--    El guardarraíl 4 no lo ve nunca porque information_schema.role_table_grants
--    excluye secuencias. Sin esta aserción, toda tabla futura con bigserial
--    reintroduce el hueco de forma invisible para la suite.
--    Detectado en el plan 01-04 sobre access_code_reads_id_seq.
select is_empty($q$
  select c.relname || ':' || a.privilege_type
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   cross join lateral aclexplode(coalesce(c.relacl, acldefault('s', c.relowner))) a
    join pg_roles r on r.oid = a.grantee
   where n.nspname = 'public'
     and c.relkind = 'S'
     and r.rolname in ('anon', 'authenticated')
$q$, 'guardarraíl: anon ni authenticated conservan privilegios sobre secuencias de public');

-- 5  Sin `set search_path = ''` el privilegio elevado de una función
--    SECURITY DEFINER es un vector de escalada. Redundante a propósito con el
--    WARN function_search_path_mutable del advisor, que no es bloqueante.
--
--    El literal almacenado NO es 'search_path='. Postgres serializa proconfig
--    con flatten_set_variable_args, y `search_path` es GUC_LIST_QUOTE, así que
--    la cadena vacía se guarda entrecomillada. Medido en la base de la fase
--    (PG 17.6, CLI 2.116.0):
--
--      create function f() ... set search_path = ''  ->  {"search_path=\"\""}
--      alter function f() set search_path = ''       ->  {"search_path=\"\""}
--
--    y las propias funciones SECURITY DEFINER que Supabase trae de fábrica
--    (vault.create_secret, vault.update_secret, auth.get_auth) también guardan
--    `search_path=""`. Con el literal sin comillas la aserción era
--    insatisfacible: ninguna DDL válida la puede poner en verde.
--
--    La lista acepta las DOS formas para no depender de la versión (Postgres
--    más viejos guardan `search_path=`) y NO acepta ninguna otra: un
--    `search_path=public` sigue siendo un fallo, que es lo que esta aserción
--    existe para atrapar.
select is_empty($q$
  select n.nspname || '.' || p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private')
     and p.prosecdef
     and not exists (
       select 1
         from unnest(coalesce(p.proconfig, '{}'::text[])) as cfg
        where cfg in ('search_path=', 'search_path=""'))
$q$, 'guardarraíl: toda función SECURITY DEFINER fija search_path = ''''');

-- 6  El DDL de ARCHITECTURE.md usa numeric(12,2) y contradice a CONTEXT.md,
--    PROJECT.md y CLAUDE.md. Esta aserción impide que alguien copie el DDL
--    literal y rompa la aritmética de la Fase 7 en silencio: supabase-js
--    devuelve `numeric` como string. El LEFT JOIN hace que una columna ausente
--    también falle, no solo una del tipo equivocado.
select is_empty($q$
  select v.tbl || '.' || v.col || ' -> ' || coalesce(c.data_type, 'AUSENTE')
    from (values ('properties', 'tarifa_huesped'),
                 ('properties', 'pago_aseador'),
                 ('cleanings',  'tarifa_huesped'),
                 ('cleanings',  'pago_aseador'),
                 ('expenses',   'monto')) as v(tbl, col)
    left join information_schema.columns c
      on c.table_schema = 'public'
     and c.table_name::text = v.tbl
     and c.column_name::text = v.col
   where coalesce(c.data_type, '') <> 'bigint'
$q$, 'guardarraíl: toda columna monetaria es bigint de pesos enteros');

-- 7  BYPASSRLS no otorga privilegios de tabla. Sin esta aserción los workers de
--    las Fases 3, 5 y 9 fallan con `permission denied` y nadie entiende por qué.
select is_empty($q$
  select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and not exists (
       select 1
         from information_schema.role_table_grants g
        where g.table_schema = 'public'
          and g.table_name::text = c.relname
          and g.grantee = 'service_role'
          and g.privilege_type = 'SELECT')
$q$, 'guardarraíl: service_role puede leer todas las tablas de public');

-- 8  El invariante que hace que PLAT-05 no dependa de una policy: si la tabla
--    no tiene grant, no hay policy que pueda filtrarse por error.
select is_empty($q$
  select table_name || ':' || privilege_type
    from information_schema.role_table_grants
   where table_schema = 'public'
     and grantee = 'authenticated'
     and table_name in ('property_secrets', 'storage_deletion_queue')
$q$, 'guardarraíl: property_secrets y storage_deletion_queue no tienen ningún privilegio para authenticated');

-- 9  El sustituto del default privilege que Postgres NO permite.
--
--    Medido en el plan 01-07 sobre esta misma base (PG 17.6):
--    `alter default privileges ... revoke execute on functions from public,
--    anon` NO funciona. Postgres refusiona acldefault('f', owner) — que
--    siempre trae la entrada `=X` de PUBLIC — con lo almacenado en
--    pg_default_acl, así que PUBLIC recupera EXECUTE en CADA función nueva:
--
--      defaclacl tras el revoke        : {postgres=X, authenticated=X, service_role=X}
--      proacl de una función posterior : {=X/postgres, postgres=X, authenticated=X, ...}
--      has_function_privilege('anon', <nueva>, 'execute') -> t
--
--    Consecuencia: cada función nueva de `public` necesita su propio
--    `revoke all on function ... from public, anon` AL LADO de la definición,
--    y no hay ningún mecanismo que lo imponga. Esta aserción es ese mecanismo.
--
--    Importa sobre todo para los RPC SECURITY DEFINER: corren como `postgres`,
--    que es owner de las 22 tablas y por tanto exento de su RLS. Una función
--    olvidada aquí es `reveal_access_code()` — el código que abre físicamente
--    un apartamento — al alcance de cualquiera con la publishable key, que es
--    pública por diseño.
--
--    `has_function_privilege` y no un LEFT JOIN contra
--    information_schema.routine_privileges: esa vista NO lista los privilegios
--    de PUBLIC como tales, así que una función con `proacl` NULL (el caso por
--    defecto, y el peligroso) le sale limpia. `has_function_privilege`
--    resuelve la herencia y el default, que es justo lo que hay que medir.
--
--    prokind = 'f': agregados y funciones de ventana quedan fuera; ninguna es
--    una ruta de escritura.
select is_empty($q$
  select n.nspname || '.' || p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private')
     and p.prokind = 'f'
     and has_function_privilege('anon', p.oid, 'execute')
$q$, 'guardarraíl: ninguna función de public ni private es ejecutable por anon');

select * from finish();
rollback;
