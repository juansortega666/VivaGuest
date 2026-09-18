-- ===========================================================================
-- 28 — LA LECTURA DEL DETALLE DE ASEO PARA EL PANEL LATERAL DEL ADMIN
--
-- Única migración de la Fase 8. Alimenta el grupo de dinero del panel de aseo
-- (criterio 4 del ROADMAP) y nada más.
--
-- ── POR QUÉ HACE FALTA UNA FUNCIÓN NUEVA, Y ES UNA PREGUNTA CON RESPUESTA ──
--
-- Lo único del panel de aseo que está detrás de un grant es EL DINERO. La
-- migración 24 hizo `revoke select` de tabla sobre `public.cleanings` y
-- `public.properties` y volvió a otorgar POR COLUMNA ENUMERADA, dejando fuera
-- exactamente dos columnas de cada una: `tarifa_huesped` y `pago_aseador`. Todo
-- lo demás que el panel necesita —estado, fechas, aseador, checklist, fotos,
-- gastos, daños— YA LO LEE EL ADMIN POR RLS, con las policies de la migración
-- 08. Esta función existe para recuperar esas dos columnas, y solo esas.
--
-- ── Y POR QUÉ NO SIRVE NINGUNA DE LAS SEIS DE LA MIGRACIÓN 26 ─────────────
--
-- Dos razones distintas, y las dos medidas:
--
--   * `public.rentabilidad_aseos` FILTRA POR EL ASEO COMPLETADO. Eso
--     excluye el aseo EN CURSO, que es literalmente la razón de existir del
--     panel: la pregunta que el admin hace es «¿cómo va el 302?», no «¿cuánto
--     dejó el 302 cuando terminó». Una función que no puede responder sobre un
--     aseo vivo no sirve para una pantalla que se abre sobre aseos vivos.
--
--   * `public.tarifas_de_apartamentos` devuelve el valor VIVO del apartamento,
--     no el congelado del aseo. Usarla rompería FIN-01 y el panel enseñaría un
--     número distinto al de `/finanzas/aseos` para el MISMO aseo en cuanto
--     alguien editara una tarifa. La aserción 105 del bloque P de
--     `11_financiero.test.sql` mide justamente eso.
--
-- ── QUÉ NO ENTRA AQUÍ, Y POR QUÉ NO (T-08-04, disposición «accept») ────────
--
-- Checklist, fotos, gastos y daños NO se meten en esta definer. Las cuatro
-- tienen su policy de admin desde la migración 08 (`cci_admin_all`,
-- `photos_admin_all`, `expenses_admin_all`, `damages_admin_all`) y el panel las
-- lee por RLS como cualquier otra pantalla. Meterlas aquí las SACARÍA de la
-- seguridad a nivel de fila sin comprar una sola garantía, y ampliaría el radio
-- de un `where` mal escrito. Es el corolario que la migración 09 dejó anotado:
-- dentro de una definer no hay red de seguridad, un `where` mal escrito no da
-- un error de permiso, DA LOS DATOS.
--
-- ── LAS SIETE REGLAS DE LA MIGRACIÓN 26, REPETIDAS SIN MODIFICAR ──────────
--
--   1. `security definer set search_path = ''` y todo nombre calificado por
--      esquema, `auth.uid()` incluido vía `private.is_admin()`.
--   2. LA GUARDA DE ADMIN ES LA PRIMERA SENTENCIA EJECUTABLE DEL CUERPO, con
--      `42501` al denegar. Ver el comentario pegado a esa línea.
--   3. Filtro de gestión propia explícito cuando hay un conteo que se pueda
--      contaminar. Aquí NO HAY AGREGACIÓN, hay una fila por identificador, y la
--      ausencia del filtro es deliberada. Ver los dos comentarios del `where`.
--   4. Todos los montos declarados `bigint` Y CASTEADOS EN EL CUERPO, o el
--      cliente de JavaScript los recibe como cadena y la aritmética se rompe en
--      silencio.
--   5. LAS CIFRAS SALEN DEL ASEO, NUNCA DEL APARTAMENTO (FIN-01).
--   6. La pertenencia al periodo sale de `public.dia_bog(...)`. Esta función no
--      calcula periodos, así que la regla no la toca.
--   7. Par de `revoke` + `grant` PEGADO A LA DEFINICIÓN.
--
-- ── LAS TRAMPAS DE ESTE REPO QUE MUERDEN AQUÍ, TODAS YA MEDIDAS ───────────
--
--   1. `coalesce` y `nullif` NO se califican con el esquema del catálogo: son
--      construcciones del lenguaje, no funciones, y calificarlas revienta con
--      «function does not exist» bajo camino de búsqueda vacío. Costó un error
--      en la migración 22. Las funciones de verdad SÍ se califican:
--      `pg_catalog.btrim(...)`, igual que en `costo_por_aseadora`.
--   2. En un `returns table`, los nombres de salida son variables del cuerpo:
--      TODA referencia a una columna va calificada con su alias o plpgsql la
--      rechaza por ambigua. Lección literal de la migración 24.
--   3. El guardarraíl 4 de `scripts/ci/check-service-role.sh` prohíbe por grep
--      la función de fecha de sesión en migraciones. `public.today_bog()` es el
--      único helper de fecha permitido, y aquí ni siquiera hace falta.
-- ===========================================================================


-- ===========================================================================
-- public.detalle_de_aseo(uuid)
--   -> UNA fila con la cabecera del panel lateral de aseo y sus tres cifras
--
-- El orden de las columnas es el orden de lectura del panel: qué aseo, de qué
-- apartamento, en qué fecha, en qué estado, quién lo hace, cuándo empezó y
-- terminó, y al final el grupo de dinero.
-- ===========================================================================
create or replace function public.detalle_de_aseo(
  p_cleaning uuid
)
returns table (
  cleaning_id      uuid,
  property_id      uuid,
  property_nombre  text,
  is_managed       boolean,
  fecha_programada date,
  estado           public.cleaning_state,
  aseador_id       uuid,
  aseador_nombre   text,
  iniciado_at      timestamptz,
  terminado_at     timestamptz,
  cobrado          bigint,
  pagado           bigint,
  margen           bigint
)
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  -- ── LA GUARDA. PRIMERA SENTENCIA EJECUTABLE DEL CUERPO (regla 2). ────────
  --
  -- NO ES UNA FORMALIDAD DE ESTILO Y NO SE PUEDE MOVER NI UNA LÍNEA HACIA
  -- ABAJO: una función definer propiedad de `postgres` corre con
  -- `rolbypassrls = t` y SALTA LA SEGURIDAD A NIVEL DE FILA ENTERA. Sin esta
  -- línea, esta función le entrega el margen de CUALQUIER aseo a cualquiera que
  -- la llame —incluida la aseadora, a quien la migración 24 le cerró esas dos
  -- columnas con un grant por columna—, y además por un endpoint que PostgREST
  -- expone público. Es T-08-01, y la aserción 102 del bloque P de
  -- `11_financiero.test.sql` lo mide impersonando de verdad.
  --
  -- Token de máquina en el mensaje y español en la pista: es como `mapDbError`
  -- lo lee en este repo desde la migración 16.
  if not (select private.is_admin()) then
    raise exception 'no_autorizado'
      using errcode = '42501',
            hint    = 'El detalle financiero de un aseo es información del negocio: solo lo ve un administrador activo.';
  end if;

  return query
    select c.id,
           c.property_id,
           pr.nombre,
           c.is_managed,
           c.scheduled_date,
           c.state,
           c.aseador_id,
           -- Nulo y no un texto de relleno cuando no hay persona asignada: la
           -- fila que pinta el vacío es decisión de la pantalla, no de la
           -- consulta. Un 'Sin asignar' puesto aquí sería un nombre inventado.
           -- `btrim` VA CALIFICADO con el esquema del catálogo (trampa 1): con
           -- el camino de búsqueda vacío no resuelve de otra forma. Es lo mismo
           -- que hace `costo_por_aseadora`.
           pg_catalog.btrim(pf.full_name),
           c.started_at,
           c.finished_at,
           -- ── LAS TRES CIFRAS SALEN DEL ASEO (regla 5, FIN-01) ────────────
           -- `c.tarifa_huesped` y `c.pago_aseador`, que son el SNAPSHOT que el
           -- trigger de la migración 05 copió al crear el aseo. JAMÁS
           -- la tarifa del apartamento por su alias: eso sería el valor VIVO, y
           -- este panel contradiría a `/finanzas/aseos` para el mismo aseo en
           -- cuanto alguien editara una tarifa. El apartamento se une SOLO por
           -- el nombre, que es lo único que el panel pinta de él.
           -- Casteo explícito a `bigint` (regla 4) para que el cliente de
           -- JavaScript no los reciba como cadena.
           coalesce(c.tarifa_huesped, 0)::bigint,
           coalesce(c.pago_aseador, 0)::bigint,
           (coalesce(c.tarifa_huesped, 0) - coalesce(c.pago_aseador, 0))::bigint
      from public.cleanings c
      join public.properties pr on pr.id = c.property_id
      left join public.profiles pf on pf.id = c.aseador_id
     -- ── DOS AUSENCIAS DE FILTRO, LAS DOS DELIBERADAS ────────────────────
     --
     -- (1) SIN FILTRO DE ESTADO, Y NADIE LO PUEDE AÑADIR. Es exactamente el
     --     filtro de aseo completado que descalifica a `rentabilidad_aseos`
     --     para este uso. El panel se abre sobre aseos VIVOS: un aseo en curso
     --     tiene que devolver su fila. Si alguien copia el filtro de la función
     --     de al lado por inercia, la aserción 104 del bloque P se pone roja.
     --     Es T-08-05.
     --
     -- (2) SIN FILTRO DE GESTIÓN PROPIA. La regla 3 de la migración 26 pide el
     --     filtro explícito CUANDO HAY UN CONTEO QUE SE PUEDA CONTAMINAR; aquí
     --     no hay agregación, hay una fila por identificador. Un apartamento
     --     informativo devuelve su fila con las cifras en cero por el CHECK
     --     `cl_unmanaged_is_inert`, y la pantalla decide no pintar el grupo de
     --     dinero leyendo `is_managed`, que por eso viaja en la salida.
     where c.id = p_cleaning;
end
$fn$;

comment on function public.detalle_de_aseo(uuid) is
  'Criterio 4 de la Fase 8: la cabecera y el grupo de dinero del panel lateral de aseo del admin. Una fila por identificador con apartamento, marca de gestión propia, fecha programada, estado, persona a cargo, los dos instantes de ejecución y las tres cifras: cobrado, pagado y margen. EXISTE PORQUE LA MIGRACIÓN 24 SACÓ tarifa_huesped Y pago_aseador DEL GRANT POR COLUMNA de cleanings y properties, y los grants por columna no discriminan usuarios: admin y aseador comparten el rol authenticated. Todo lo demás que el panel necesita (checklist, fotos, gastos, daños) NO está aquí: lo lee el admin por RLS con las cuatro policies de la migración 08, y meterlo en una definer las sacaría de la seguridad a nivel de fila sin comprar ninguna garantía. NO SIRVE rentabilidad_aseos porque filtra por aseo completado y excluye el aseo en curso, que es la razón de existir del panel; NO SIRVE tarifas_de_apartamentos porque devuelve el valor vivo del apartamento y no el congelado del aseo. LAS TRES CIFRAS SALEN DEL ASEO Y NUNCA DEL APARTAMENTO (FIN-01): el apartamento se une solo por el nombre. NO FILTRA POR ESTADO, a propósito y sin excepción: añadir un state = completada copiándolo de la función de al lado volvería el panel inútil sobre aseos vivos. NO FILTRA POR GESTIÓN PROPIA: no hay agregación que contaminar, un informativo devuelve su fila con las cifras en cero y la pantalla decide no pintar el grupo de dinero leyendo is_managed. La guarda de admin es la primera sentencia ejecutable del cuerpo y no se puede mover: una definer propiedad de postgres corre con rolbypassrls y salta la RLS entera, así que sin ella entrega el margen de cualquier aseo a cualquiera.';

-- El par pegado a la definición, y no heredado: en PG 17 `alter default
-- privileges` NO puede quitarle EXECUTE a PUBLIC, así que una función nueva de
-- `public` nace ejecutable por `anon`, que es el rol de la clave publicable,
-- que es pública por diseño. T-08-03 y guardarraíl 9 de `02_guardarrailes`.
revoke all     on function public.detalle_de_aseo(uuid) from public, anon;
grant  execute on function public.detalle_de_aseo(uuid) to authenticated;
