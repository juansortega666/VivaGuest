-- ============================================================================
-- 07_grants.sql — PLAT-03, PLAT-05, PLAT-06
--
-- Los privilegios base del esquema `public`. Va DESPUES de las 6 migraciones de
-- DDL, y no antes, porque otorga tabla por tabla sobre las 22 que ya existen.
--
-- Este archivo y el 08 son el archivo de seguridad de la fase. Se leen juntos:
-- aqui se decide QUE ROL puede tocar QUE TABLA; en el 08 se decide QUE FILAS.
-- Los dos hacen falta, y ninguno sustituye al otro.
--
-- ----------------------------------------------------------------------------
-- EL HECHO MEDIDO QUE JUSTIFICA EL ARCHIVO ENTERO
-- ----------------------------------------------------------------------------
-- Sobre la CLI 2.116.0 que pinea package.json, una tabla creada en `public` por
-- el rol `postgres` NACE ABIERTA. Medido en esta misma base (pg_default_acl):
--
--   postgres | public | r | {postgres=arwdDxtm/postgres, anon=arwdDxtm/postgres,
--                            authenticated=arwdDxtm/postgres,
--                            service_role=arwdDxtm/postgres}
--   postgres | public | S | {postgres=rwU/postgres, anon=rwU/postgres,
--                            authenticated=rwU/postgres, service_role=rwU/postgres}
--   postgres | public | f | {postgres=X/postgres, anon=X/postgres,
--                            authenticated=X/postgres, service_role=X/postgres}
--
-- Es decir: SELECT/INSERT/UPDATE/DELETE/TRUNCATE para `anon` SIN AUTENTICAR, y
-- lo mismo para `authenticated`, sobre toda tabla nueva. `01-RESEARCH.md` §3.1
-- midio lo contrario (solo REFERENCES/TRIGGER/TRUNCATE) con la CLI 2.115.0: esa
-- medicion envejecio. Lo instala la clave `auto_expose_new_tables` de
-- config.toml, cuyo fallback es `true` porque es el default de la nube.
--
-- Las migraciones 03 a 06 ya revocan lo suyo tabla por tabla, como parche. Este
-- archivo es la solucion: revoca los DEFAULT PRIVILEGES, de forma que ninguna
-- tabla de las Fases 2 a 9 pueda reintroducir el agujero.
--
-- Tres consecuencias que se ejercieron una por una y que hay que tener presentes
-- antes de "arreglar" nada de aqui:
--
--  1. Sin `grant select ... to authenticated`, la RLS es irrelevante: el aseador
--     no ve nada y el error es `42501 permission denied`, NO "0 filas". Un dev
--     que no lo sepa desactiva la RLS o mete la clave de servicio para
--     "arreglarlo", que es exactamente el camino de fuga del codigo de acceso.
--  2. `service_role` tiene rolbypassrls = t, pero BYPASSRLS **no otorga ningun
--     privilegio de tabla**. Los workers de las Fases 3, 5 y 9 fallarian con
--     `permission denied` si esta migracion no se los otorgara.
--  3. `anon` podia hacer TRUNCATE, y TRUNCATE ignora la RLS por completo. La
--     explotabilidad practica es baja (PostgREST no emite TRUNCATE y `anon` es
--     nologin), pero revocarlo es gratis y elimina la clase entera.
--
-- ----------------------------------------------------------------------------
-- POR QUE TABLA POR TABLA Y NO `on all tables`
-- ----------------------------------------------------------------------------
-- La lista explicita es el artefacto que un revisor de seguridad audita: se lee
-- de arriba abajo y se compara con la matriz del plan. Un
-- `grant select on all tables in schema public to authenticated` dejaria abierta
-- por default cada tabla que se cree en las Fases 2 a 9, que es justo la clase de
-- error que los DEFAULT PRIVILEGES de esta migracion existen para cerrar.
--
-- Mapa mental de la matriz (el detalle esta al lado de cada grant):
--   * `admin` y `aseador` comparten el rol Postgres `authenticated`. El GRANT
--     abre la puerta al ROL; la RLS de la migracion 08 es lo unico que
--     discrimina por usuario, fila a fila.
--   * Sin ningun grant  -> property_secrets, storage_deletion_queue.
--   * Solo select       -> lo que solo lee el admin (la RLS filtra al aseador a
--                          0 filas) y lo que el aseador lee pero no escribe.
--   * select + DML      -> catalogo que el admin edita desde la UI.
--   * cleanings         -> SOLO select. Ni el admin escribe directo.
-- ============================================================================


-- ============================================================================
-- 0. NORMALIZACION: `anon` y `authenticated` a cero sobre TODO `public`
-- ============================================================================
-- Punto de partida conocido. Las migraciones 03 a 06 ya revocaron sobre sus
-- propias tablas, pero repetirlo aqui sobre `all tables` hace que este archivo
-- sea autosuficiente: quien lo lea no necesita reconstruir mentalmente lo que
-- revoco cada migracion anterior para saber que privilegios quedan.
--
-- El orden importa: primero se revoca todo, despues se otorga lo minimo. Al
-- reves, un revoke posterior borraria los grants de la matriz.

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;


-- ============================================================================
-- 1. `authenticated` — la matriz de grants
-- ============================================================================
-- El bloque `<interfaces>` del plan 01-07 es el contrato normativo. Cualquier
-- cambio aqui es un cambio del modelo de autorizacion, no una optimizacion.

-- ---------------------------------------------------------------------------
-- 1.1 Catalogo que el admin edita desde la UI: select + DML.
--     La policy de la migracion 08 es admin-only para las ramas de escritura;
--     el aseador tiene el grant pero la RLS lo deja en 0 filas o le rechaza el
--     WITH CHECK. El caso de test correcto para el aseador es `is_empty`, no
--     `throws_ok`: tiene el privilegio, lo que le falta es la fila.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.profiles             to authenticated;
grant select, insert, update, delete on public.properties           to authenticated;
grant select, insert, update, delete on public.property_rooms       to authenticated;
grant select, insert, update, delete on public.room_types           to authenticated;
grant select, insert, update, delete on public.checklist_tasks      to authenticated;
grant select, insert, update, delete on public.missing_item_catalog to authenticated;
grant select, insert, update, delete on public.calendar_feeds       to authenticated;
grant select, insert, update, delete on public.app_settings         to authenticated;

-- ---------------------------------------------------------------------------
-- 1.2 Solo lectura para el rol. Policy admin-only en la migracion 08.
--     `access_code_reads` es la bitacora de quien vio que codigo de cerradura:
--     el admin la necesita, el aseador NO. Va con grant y policy admin-only, no
--     sin grant, porque la asercion 16 de `00_rls_aseos.test.sql` la ejerce con
--     `is_empty` y un `42501` la haria abortar el archivo entero.
--     Es una desviacion consciente de `01-RESEARCH.md` §3.1: la suite gana.
-- ---------------------------------------------------------------------------
grant select on public.access_code_reads          to authenticated;
grant select on public.calendar_reservations      to authenticated;
grant select on public.cleaning_state_transitions to authenticated;

-- ---------------------------------------------------------------------------
-- 1.3 Operacion que el aseador LEE y no escribe. Sus mutaciones pasan por RPC
--     SECURITY DEFINER (plan 01-08): los invariantes son multifila y
--     transaccionales ("solo puedes terminar si todo el checklist tiene foto"),
--     y eso no se puede expresar con privilegios de columna ni con un WITH CHECK.
-- ---------------------------------------------------------------------------
grant select on public.cleaning_checklist_items to authenticated;
grant select on public.damages                  to authenticated;
grant select on public.expenses                 to authenticated;
grant select on public.missing_item_reports     to authenticated;
grant select on public.missing_item_lines       to authenticated;

-- ---------------------------------------------------------------------------
-- 1.4 `cleanings`: SOLO select. Cero DML para `authenticated`, ni siquiera para
--     el admin. Es la decision bloqueada de `01-CONTEXT.md` y la razon de que la
--     asercion 14 de `00_rls_aseos.test.sql` espere `42501` y no "0 filas".
--
--     `ARCHITECTURE.md` propone aqui un
--       revoke insert, update, delete on public.cleanings from authenticated;
--     Ese revoke es un NO-OP sobre privilegios que nunca se otorgaron, y por eso
--     NO se escribe: dejarlo induciria a pensar que la proteccion viene del
--     revoke. La proteccion viene de no haber otorgado. Si algun dia alguien
--     agrega un `grant update`, el revoke de arriba no lo desharia.
-- ---------------------------------------------------------------------------
grant select on public.cleanings to authenticated;

-- ---------------------------------------------------------------------------
-- 1.5 Las tres excepciones donde el aseador SI escribe directo.
-- ---------------------------------------------------------------------------

-- Evidencia inmutable: sube fotos, y no las reemplaza ni las borra. Sin UPDATE
-- ni DELETE a proposito. Una foto subida es prueba, y la prueba no se edita.
grant select, insert on public.cleaning_photos to authenticated;

-- El destinatario marca `read_at` en su propia notificacion. Sin INSERT: quien
-- crea notificaciones es un trigger / worker, nunca el cliente. Esto ademas
-- desactiva hoy el vector del `threat_flag: schema-change` del plan 01-06
-- (`notifications.url` es texto libre y la campana lo renderiza como enlace):
-- sin INSERT desde el cliente no hay forma de inyectar una URL. El dia que un
-- RPC de la Fase 5 acepte `url` del cliente, hara falta un CHECK de forma.
grant select, update on public.notifications to authenticated;

-- Unica tabla que el aseador escribe libremente: la suscripcion push de su
-- propio dispositivo. La policy de la migracion 08 la acota a `user_id = uid()`.
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- ---------------------------------------------------------------------------
-- 1.6 SIN NINGUN GRANT, y por eso no aparecen arriba:
--
--       public.property_secrets       -- codigo de cerradura + URL de iCal
--       public.storage_deletion_queue -- cola del worker de la Fase 9
--
--     Es el invariante que hace que PLAT-05 no dependa de una policy: si la
--     tabla no tiene grant, NO HAY POLICY QUE SE PUEDA FILTRAR POR ERROR. El
--     resultado de un SELECT directo es `42501`, no "0 filas", y lo es incluso
--     para el aseador asignado a ese mismo apartamento (asercion 10 de
--     `00_rls_aseos.test.sql`). El acceso al codigo pasa exclusivamente por
--     `public.reveal_access_code()`, con ventana estrecha y auditoria.
--
--     La migracion 08 SI les habilita RLS y les pone una policy admin-only: no
--     por defensa (ya son inalcanzables) sino porque el guardarrail 1 no admite
--     excepciones y el 2 exige al menos una policy por tabla con RLS.
--     Verificacion: guardarrail 8 de `02_guardarrailes.test.sql`.
-- ---------------------------------------------------------------------------

-- No se otorga USAGE sobre ninguna secuencia de `public` a `authenticated`. Las
-- tres que existen (access_code_reads_id_seq, cleaning_state_transitions_id_seq,
-- storage_deletion_queue_id_seq) pertenecen a tablas donde `authenticated` no
-- inserta nunca: las llena un trigger o un RPC SECURITY DEFINER, que corre como
-- `postgres`. Guardarrail 4b.


-- ============================================================================
-- 2. `service_role` — acceso completo, y es intencional
-- ============================================================================
-- BYPASSRLS solo dice "las policies no te aplican". No otorga ni un SELECT.
--
-- ESTE BLOQUE INCLUYE `public.property_secrets`, A PROPOSITO: el admin escribe
-- el codigo de acceso y la URL de exportacion iCal desde una Server Action, y el
-- worker de la Fase 3 resuelve el feed desde `property_secrets.ical_url`. Con
-- BYPASSRLS ademas, este rol ve absolutamente todo.
--
-- Por eso el test de arquitectura que aisla la clave de servicio a
-- `lib/supabase/admin.ts` (scripts/ci/check-service-role.sh, plan 01-01) NO es
-- opcional ni cosmetico: es el unico control que impide que ese acceso total
-- llegue al bundle del navegador.
grant all on all tables    in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;


-- ============================================================================
-- 3. `anon` — cero, y que siga siendo cero
-- ============================================================================
-- `anon` es el rol de la publishable key, que es publica por diseno. Nada de
-- `public` le corresponde en este proyecto: la app no tiene ninguna vista
-- anonima. Ya quedo a cero en el bloque 0; se repite explicito porque es el
-- invariante que el guardarrail 4 verifica y conviene que se lea aqui.
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;

-- NO se revoca el USAGE de `anon` sobre el esquema `public`. PostgREST hace
-- `set role anon` sobre una conexion cuya cache de schema se construyo con otro
-- rol, y quitarle el USAGE cambia el modo de fallo de "42501 sobre la tabla" a
-- errores de resolucion de nombres mucho mas dificiles de leer, sin cerrar nada
-- que los revokes de arriba no cierren ya. Sin privilegios de tabla, el USAGE
-- del esquema no da acceso a nada.


-- ============================================================================
-- 4. DEFAULT PRIVILEGES — lo que impide que las Fases 2 a 9 reabran el agujero
-- ============================================================================
-- Sin esto, la primera tabla que cree la Fase 2 nace otra vez con arwdDxtm para
-- `anon` y `authenticated`, y nadie se entera hasta que alguien la audite.
--
-- DESVIACION DELIBERADA DE `01-RESEARCH.md` §3.1: la migracion que propone el
-- research contempla SOLO `anon`, porque se escribio con la medicion de la CLI
-- 2.115.0, donde `authenticated` nacia sin privilegios utiles. Con la 2.116.0
-- `authenticated` nace con INSERT/UPDATE/DELETE sobre toda tabla nueva, lo que
-- rompe de raiz la decision "el aseador no escribe directo, escribe por RPC".
-- Por eso van los dos roles. Contrato registrado en `01-03-SUMMARY.md`.
--
-- `service_role` NO se toca: que herede acceso a toda tabla futura es lo que
-- queremos, y ademas es lo que hace que el guardarrail 7 siga verde sin trabajo
-- manual en cada fase.

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;

-- Funciones. El ACL por defecto de una funcion nueva es
--   {=X/postgres, postgres=X, anon=X, authenticated=X, service_role=X}
-- donde `=X` es el pseudo-rol PUBLIC, que incluye a `anon`.
--
-- Esta linea quita la entrada explicita de `anon`. `authenticated` conserva su
-- EXECUTE a proposito: los RPC del plan 01-08 (reveal_access_code,
-- start_cleaning, finish_cleaning, ...) se invocan precisamente con ese rol.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon;

-- ---------------------------------------------------------------------------
-- LIMITACION MEDIDA, Y ES IMPORTANTE: la linea de arriba NO cierra la puerta
-- anonima sobre las funciones FUTURAS. Postgres 17.6 fusiona `acldefault('f')`
-- --que siempre trae `=X` para PUBLIC-- con el ACL almacenado en
-- pg_default_acl, asi que la entrada de PUBLIC reaparece en cada funcion nueva.
-- Medido en esta misma base, dos veces y por dos caminos:
--
--   defaclacl tras el revoke: {postgres=X, authenticated=X, service_role=X}
--   proacl de una funcion creada despues:
--     {=X/postgres, postgres=X, authenticated=X, service_role=X}
--   has_function_privilege('anon', <nueva funcion>, 'execute') -> t
--
--   Incluso haciendo primero `grant execute on functions to public` para
--   materializar la entrada y despues revocarla, el resultado es el mismo: `t`.
--
-- Consecuencia, y es CONTRATO para el plan 01-08 y para las Fases 2 a 9:
--
--   *** TODA funcion nueva de `public` -- y muy en particular todo RPC
--   *** SECURITY DEFINER -- necesita su propio
--   ***    revoke all on function public.<f>(<args>) from public, anon;
--   ***    grant execute on function public.<f>(<args>) to authenticated;
--   *** escrito al lado de la funcion. No hay forma de heredarlo.
--
-- Sin ese par de lineas, `reveal_access_code()` seria invocable por `anon`, es
-- decir por cualquiera con la publishable key. Dentro devolveria `42501` porque
-- `auth.uid()` es NULL y la consulta no encontraria el aseo, pero la funcion
-- corre como `postgres`: convertirla en una fuga solo requiere un bug en su
-- guarda. La defensa correcta es que `anon` ni siquiera pueda llamarla.
-- ---------------------------------------------------------------------------

-- Para las 5 funciones que YA existen el revoke explicito si funciona, porque
-- opera sobre un ACL materializado y no sobre un default. Verificado:
-- has_function_privilege('anon', ...) pasa de `t` a `f` en las cinco.
-- Las cuatro `tg_*` no las invoca nadie por nombre: los triggers ya estan
-- creados y disparar un trigger no verifica EXECUTE.
revoke execute on all functions in schema public from public, anon;
grant  execute on function public.today_bog() to authenticated, service_role;


-- ============================================================================
-- 5. Nota para quien cree una tabla en `public` de aqui en adelante
-- ============================================================================
-- A partir de esta migracion, toda tabla nueva nace SIN privilegios para `anon`
-- ni `authenticated`. Eso es lo correcto y es deliberado: si la tabla debe ser
-- legible por la app, hay que escribir el `grant` explicito y la policy, en la
-- misma migracion, y anadirla a la matriz. El sintoma de haberlo olvidado es
-- `42501 permission denied`, que es ruidoso y facil de diagnosticar; el sintoma
-- contrario -- una tabla abierta -- es silencioso.
--
-- La regla, escrita entera para que quepa en un solo grep:
--   1. `grant` explicito para `authenticated`, tabla por tabla, con la accion
--      minima. Nunca `on all tables`.
--   2. `enable row level security` + al menos una policy, en la misma migracion.
--   3. Si la tabla guarda una credencial, NINGUN grant y acceso solo por RPC
--      SECURITY DEFINER con auditoria, como `property_secrets`.
--   4. Si la tabla usa `bigserial`, no otorgar la secuencia a `authenticated`
--      (guardarrail 4b); si de verdad hace falta insertar, hacerlo por RPC.
