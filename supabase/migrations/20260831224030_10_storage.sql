-- ============================================================================
-- 10 — El bucket privado `evidencia` y sus policies
--
-- Va en su PROPIO archivo, separado de los RPC, porque toca un esquema ajeno:
-- `storage.objects` es propiedad de `supabase_storage_admin`, no de
-- `postgres`. Aislarlo hace trivial revertirlo si el push a hosted falla, sin
-- arrastrar la migracion 09 con el.
--
-- ---------------------------------------------------------------------------
-- [ASSUMED en hosted — verificar en el primer db push a dev, ver plan 01-09]
-- ---------------------------------------------------------------------------
-- CONFIANZA BAJA, Y HAY QUE DECIRLO EN VOZ ALTA. Todo lo de abajo esta
-- VERIFICADO EN LOCAL (`supabase db reset` deja el bucket y las 3 policies
-- presentes en `pg_policies`), pero `postgres` NO es miembro de
-- `supabase_storage_admin` NI superusuario. Medido en esta base:
--
--   select tableowner from pg_tables
--    where schemaname='storage' and tablename='objects';  ->  supabase_storage_admin
--   select current_user;                                  ->  postgres
--
-- Es decir: esto funciona por un permiso que Supabase concede de forma no
-- evidente en el grafo de roles, no porque seamos owner. En el proyecto
-- hosted HAY QUE CONFIRMARLO. Esa confirmacion es la tarea con checkpoint
-- humano del plan 01-09. Si falla alli, las policies se crean desde el
-- dashboard y se documenta como excepcion explicita a "el CLI es la fuente de
-- verdad del schema".
--
-- Relacionado y ya registrado como riesgo residual: `anon` conserva TRUNCATE
-- sobre `storage.objects` y NO se puede revocar desde una migracion (el
-- grantor es `supabase_storage_admin`; `postgres` no revoca ni puede hacer
-- `set role` a el). Hallazgo 2 de deferred-items.md.
-- ============================================================================


-- ===========================================================================
-- EL BUCKET — privado, SIEMPRE
--
-- Un bucket publico expone fotos del interior de las viviendas de los
-- clientes a cualquiera que tenga la URL, y con `public = true` las tres
-- policies de abajo dejan de importar por completo. Mitiga T-01-54.
--
-- La entrega se hace con `createSignedUrl(path, 120)` de vida corta desde un
-- Server Component que ya verifico acceso. Eso es de la Fase 6; aqui solo
-- queda la infraestructura.
--
-- `file_size_limit` y `allowed_mime_types` son defensa en profundidad: el
-- cliente ya comprime a JPEG antes de subir, pero el cliente es del atacante.
-- ===========================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidencia', 'evidencia', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;


-- ===========================================================================
-- CONVENCION DE RUTA:  {cleaning_id}/{kind}/{uuid}.{ext}
--
-- Ejemplo: 9f1c.../checklist/2b7e....webp
--
-- El `cleaning_id` va PRIMERO para que `(storage.foldername(name))[1]` lo
-- devuelva directo y la policy sea barata. La ruta no contiene `property_id`
-- ni nada enumerable, y el nombre de archivo es un UUID nuevo, nunca el
-- nombre original del dispositivo.
--
-- LA COMPARACION SE HACE COMO `text`, con `id::text`, y NO casteando el
-- segmento del path a `uuid`. No es estilo: un path malformado tiene que
-- producir un deny limpio, no un error de tipo dentro de la policy. Con el
-- cast, `select * from storage.objects` con un solo objeto de nombre raro en
-- el bucket revienta la consulta entera para todo el mundo.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- Policy 1/3 — el admin, sin restriccion de ruta
-- ---------------------------------------------------------------------------
create policy evidencia_admin_all on storage.objects
  for all to authenticated
  using      (bucket_id = 'evidencia' and (select private.is_admin()))
  with check (bucket_id = 'evidencia' and (select private.is_admin()));

-- ---------------------------------------------------------------------------
-- Policy 2/3 — subida del aseador
--
-- `my_writable_cleaning_ids()` es la ventana ESTRECHA: solo `state =
-- 'en_curso'`. No se sube una foto a un aseo que todavia no empezo ni a uno
-- que ya se entrego.
-- ---------------------------------------------------------------------------
create policy evidencia_cleaner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'evidencia'
    and (select private.is_active_cleaner())
    and (storage.foldername(name))[1]
        in (select id::text from private.my_writable_cleaning_ids() as id)
  );

-- ---------------------------------------------------------------------------
-- Policy 3/3 — lectura del aseador
--
-- `my_cleaning_ids()` es la ventana ANCHA: incluye historico corto de 30 dias
-- y los aseos ya completados, para que pueda revisar lo que entrego.
--
-- Que sean DOS funciones distintas y no una es deliberado: leer lo que ya
-- entregaste es legitimo, escribir sobre ello no.
-- ---------------------------------------------------------------------------
create policy evidencia_cleaner_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'evidencia'
    and (select private.is_active_cleaner())
    and (storage.foldername(name))[1]
        in (select id::text from private.my_cleaning_ids() as id)
  );

-- ---------------------------------------------------------------------------
-- SIN POLICY DE UPDATE NI DE DELETE PARA EL ASEADOR. La evidencia es
-- INMUTABLE: una foto subida no se reemplaza ni se borra. Mitiga T-01-53.
--
-- Y la inmutabilidad TIENE que apoyarse en la ausencia de policy, no en un
-- revoke, porque el revoke no es posible: Supabase otorga
-- DELETE/INSERT/SELECT/UPDATE sobre `storage.objects` a `authenticated` y a
-- `anon` por defecto (ACL `authenticated=arwdDxtm/supabase_storage_admin`), y
-- ese grant no se puede quitar desde una migracion. Medido en el plan 01-02 y
-- escrito en la cabecera de `04_storage.test.sql`.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- EL CIERRE DE LA AUTORIZACION CIRCULAR — threat_flag: file-access del 01-04
--
-- Las tres policies de arriba autorizan PARSEANDO UNA RUTA DE TEXTO que el
-- cliente propone. Eso, por si solo, NO es circular: la ruta es el SUJETO de
-- la comprobacion, no la fuente de autoridad. Un aseador que pida subir a
-- `<aseo-ajeno>/checklist/x.webp` recibe un deny, porque ese id no esta en su
-- `my_writable_cleaning_ids()`.
--
-- DONDE SI SE VUELVE CIRCULAR es una linea mas abajo, y es lo que el plan
-- 01-04 dejo marcado como decision de este plan:
--
--   `public.cleaning_photos` tiene `storage_path` unique y la convencion
--   documentada en un COMMENT, pero NADA impedia insertar una fila cuyo
--   `storage_path` empezara por el `cleaning_id` de OTRO aseo.
--
-- El ataque concreto que eso habilita, con las policies ya puestas:
--
--   1. La aseadora A sube legitimamente a `<su-aseo>/checklist/x.webp`.
--      Permitido, es suyo.
--   2. A inserta en `cleaning_photos` una fila con `cleaning_id = <su aseo>`
--      -- que `photos_cleaner_insert` aprueba, porque el aseo SI es suyo --
--      pero con `storage_path = '<aseo-de-B>/checklist/ajena.webp'`.
--   3. La vista de detalle de la Fase 6 lista las fotos DE SU PROPIO ASEO y,
--      para cada fila, emite `createSignedUrl(storage_path)` desde un Server
--      Component que ya verifico que el aseo es suyo.
--   4. La signed URL se emite sobre el objeto de B. La policy de
--      `storage.objects` no interviene: la firma se hace server-side, y la
--      autoridad se derivo de una ruta que eligio el atacante.
--
-- El CHECK de abajo corta la clase entera en el paso 2, y lo hace en el unico
-- sitio donde la comprobacion no es circular: `cleaning_id` SI esta
-- autorizado por `photos_cleaner_insert` contra
-- `private.my_writable_cleaning_ids()`, asi que anclar la ruta a esa columna
-- ancla la ruta a algo que el servidor decidio.
--
-- `starts_with()` y no `like`: es un prefijo exacto, sin metacaracteres. Con
-- `like` habria que razonar sobre `_` y `%` dentro de un valor interpolado;
-- aqui no hay nada que razonar. Las dos funciones son IMMUTABLE (verificado:
-- `provolatile = 'i'`), que es lo que un CHECK exige.
--
-- Se ata tambien el `kind`, no solo el `cleaning_id`: la convencion completa
-- es `{cleaning_id}/{kind}/{uuid}.{ext}` y cuesta lo mismo imponerla entera.
-- Sin el `kind`, la purga de la Fase 9 y las vistas por tipo de la Fase 6
-- tendrian que confiar en que la carpeta coincide con la columna.
--
-- NOT VALID a proposito NO se usa: la tabla esta vacia en este punto de la
-- fase y un CHECK validado es el que protege de verdad.
-- ===========================================================================
alter table public.cleaning_photos
  add constraint photo_path_bajo_su_aseo
  check (starts_with(storage_path, cleaning_id::text || '/' || kind || '/'));

comment on constraint photo_path_bajo_su_aseo on public.cleaning_photos is
  'La ruta de Storage tiene que vivir bajo la carpeta del aseo al que la fila dice pertenecer. Sin esto, la autorizacion de la Fase 6 (firmar storage_path tras verificar cleaning_id) seria circular: la ruta la propone el cliente.';


-- ===========================================================================
-- LO QUE ESTE ARCHIVO NO CIERRA, CON SU DUENO
--
-- 1. Coherencia foto <-> checklist_item. `cleaning_photos` puede tener
--    `cleaning_id = X` (propio) y `checklist_item_id` de un item del aseo Y.
--    No es explotable para saltarse el guard del propio `finish_cleaning()`
--    -- para el aseo propio la ruta legitima es la unica util -- pero es un
--    invariante ausente. Un CHECK no puede expresarlo (necesita subconsulta);
--    haria falta un trigger. DUENO: Fase 6, con las tres funciones de
--    reporte, que es cuando aparecen los otros tres punteros.
--
-- 2. Objetos huerfanos. Nada obliga a que un objeto subido tenga fila en
--    `cleaning_photos`, ni al reves. Un objeto sin fila queda fuera de
--    `storage_deletion_queue` y por tanto fuera de la purga: se factura para
--    siempre. DUENO: Fase 9 (RET-06), que ya tiene la cola modelada.
--
-- 3. `anon` con TRUNCATE sobre `storage.objects`. No revocable desde una
--    migracion. Riesgo residual aceptado y documentado; explotabilidad
--    practica baja porque PostgREST no expone el esquema `storage`.
--    DUENO: hallazgo 2 de deferred-items.md.
-- ===========================================================================
