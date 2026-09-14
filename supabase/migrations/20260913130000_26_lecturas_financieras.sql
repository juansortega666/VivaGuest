-- ===========================================================================
-- 26 — LAS SEIS LECTURAS FINANCIERAS DEL ADMIN
--
-- Tercera migración de la Fase 7. Cubre FIN-02 (rentabilidad por aseo) y la
-- mitad de lectura de FIN-05 (los informativos fuera de toda métrica).
--
-- ── QUÉ ALIMENTA CADA UNA ──────────────────────────────────────────────────
--
--   public.resumen_financiero(date, date) ......... los 4 KPIs y los 3 conteos
--                                                   del bloque 2 de /finanzas
--   public.costo_por_aseadora(date, date) ......... el bloque 3 del Resumen
--   public.rentabilidad_aseos(...) ................ la tabla de /finanzas/aseos
--   public.aseos_de_aseadora(...) ................. bloque 2 de la ficha
--   public.gastos_de_aseadora(...) ................ bloque 4 de la ficha
--   public.aseo_en_curso_de_aseadora(uuid) ........ bloque 1 de la ficha
--
-- ── EL RESUMEN ES UNA LECTURA VIVA, NO UN SNAPSHOT, Y ESO ES EL CONTRATO ───
--
-- La migración 25 congela EL PAGO: lo que una persona ya cobró no se vuelve a
-- calcular nunca (D7-3). Este archivo hace lo contrario a propósito: calcula al
-- vuelo sobre el rango que la pantalla pida, que es lo que permite el filtro de
-- día, de semana y de mes con una sola función.
--
-- Los dos contratos conviven y ninguno reemplaza al otro (UI-SPEC §5.3):
-- Resumen es la foto en vivo del periodo, Pagos es el registro congelado. Por
-- eso `resumen_financiero` SÍ ve el aseo tardío que entró a un periodo ya
-- cerrado, y `cleaner_payouts` NO. Aserción 37 del contrato, que lo deja
-- escrito.
--
-- ── LAS SIETE REGLAS QUE APLICAN A LAS SEIS, SIN EXCEPCIÓN ─────────────────
--
--   1. `security definer set search_path = ''` y todo nombre calificado por
--      esquema. `auth.uid()` incluido, vía `private.is_admin()`.
--
--   2. LA GUARDA DE ADMIN ES LA PRIMERA SENTENCIA EJECUTABLE DEL CUERPO, con
--      `42501` al denegar. No es una formalidad de estilo: una función definer
--      propiedad de `postgres` corre con `rolbypassrls = t` y SALTA LA
--      SEGURIDAD A NIVEL DE FILA ENTERA, así que sin esa línea la función le
--      entrega el catálogo de márgenes a cualquiera que la llame, incluida la
--      aseadora que ni siquiera puede ver esos apartamentos. Es el Pitfall 7
--      del research, medido, y la lección que la migración 16 ya escribió.
--      Aserciones 17, 18 y las del bloque L.
--
--   3. FILTRO DE GESTIÓN PROPIA EXPLÍCITO EN TODAS, INCLUIDOS LOS CONTEOS.
--      FIN-05 dice «fuera de todo cálculo Y de toda métrica». Es cierto hoy que
--      las filas informativas tienen las cifras en nulo por el `check`
--      `cl_unmanaged_is_inert` de la migración 04, pero UN CONTEO NO SE SALVA
--      POR UN NULO: `count(*)` cuenta la fila igual. Apoyarse en el nulo
--      funciona hasta el día en que alguien añada una columna con default
--      (Pitfall 8 del research). Aserciones 36 y 37.
--
--   4. TODOS LOS MONTOS DECLARADOS `bigint` Y CASTEADOS EN EL CUERPO. La suma
--      sobre `bigint` devuelve `numeric`, que supabase-js entrega como CADENA
--      para no perder precisión: la aritmética de TypeScript se rompe en
--      silencio ('132000' + 1 = '1320001') y el formateador de moneda no delata
--      nada. Con cuatro KPIs que son sumas, esto muerde sí o sí.
--
--   5. LAS CIFRAS SALEN DEL ASEO, NUNCA DEL APARTAMENTO. Es FIN-01 respetado
--      desde la lectura: `c.tarifa_huesped` y `c.pago_aseador`, jamás
--      `pr.tarifa_huesped`. Un solo join mal escrito haría que el mes pasado se
--      moviera solo al editar una tarifa. El bloque F del contrato edita la
--      tarifa del apartamento a mitad del archivo justo para que una regresión
--      así se vea.
--
--   6. LA PERTENENCIA AL PERIODO SALE DE `public.dia_bog(finished_at)`, igual
--      que en el cierre. NUNCA una conversión a fecha sin zona: un aseo
--      terminado a las 23:30 de Bogotá cae en el día siguiente si se resuelve
--      en tiempo universal. Y tiene que ser la MISMA conversión en las seis, o
--      la fila de totales de /finanzas/aseos no cuadra con los KPIs del
--      Resumen, que es la conciliación que el contrato de diseño exige y que el
--      bloque L afirma.
--
--   7. Par de `revoke` + `grant` PEGADO A CADA DEFINICIÓN. No se hereda: en
--      PG 17 `alter default privileges` NO puede quitarle EXECUTE a PUBLIC, así
--      que una función nueva de `public` nace ejecutable por `anon` salvo que se
--      revoque ahí mismo. T-07-41 y guardarraíl 9 de `02_guardarrailes`.
--
-- ── QUÉ NO HACE ESTE ARCHIVO ───────────────────────────────────────────────
--
--   * NO escribe nada. Las seis son de lectura pura.
--   * NO devuelve NINGUNA URL de Storage: devuelve bucket y ruta. Firmar es
--     trabajo del servidor de la aplicación, DESPUÉS de su propio guard, y
--     ninguna ruta viaja al cliente ya firmada (T-07-38).
--   * NO devuelve ninguna coordenada, ningún dato de ubicación y nada que se
--     parezca a un rastreo. Ver la sección (f).
--   * NO crea las funciones de lectura del aseador (`mis_pagos_cerrados`,
--     `detalle_de_mi_pago`): migración 27, plan 07-09.
--
-- ── TRAMPAS DE ESTE REPO QUE MUERDEN AQUÍ, TODAS MEDIDAS ───────────────────
--
--   1. `coalesce` y `nullif` NO se califican con el esquema del catálogo: son
--      construcciones del lenguaje SQL, no funciones, y calificarlas revienta
--      con «function does not exist» en un cuerpo con el camino de búsqueda
--      vacío. Costó un error en la migración 22.
--   2. En una función `returns table`, los nombres de las columnas de salida
--      son variables del cuerpo: TODA referencia a una columna de tabla va
--      calificada con su alias o plpgsql la rechaza por ambigua. Es la lección
--      literal de la migración 24.
--   3. El guardarraíl 4 de `scripts/ci/check-service-role.sh` prohíbe por grep
--      la función de fecha de sesión en migraciones. `public.today_bog()` es el
--      único helper de fecha permitido.
-- ===========================================================================


-- ===========================================================================
-- (a) public.resumen_financiero(date, date)
--     -> UNA fila con los cuatro KPIs, los tres conteos y los dos márgenes
--
-- UI-SPEC §6.3 (los 4 KPIs) y §6.4 (las 3 filas de conteo más la línea de
-- cierre). El orden de las columnas es el orden de lectura de la pantalla:
-- ingreso, costo, costo, resultado.
--
-- ── EL PERIODO LLEGA POR ARGUMENTO, Y ESO ES LO QUE AHORRA TRES FUNCIONES ──
--
-- El filtro de la pantalla ofrece día, semana y mes (UI-SPEC §6.2). El rango lo
-- deriva la pantalla; el cálculo lo hace la base. Una función por granularidad
-- serían tres sitios donde el mismo filtro puede estar mal escrito.
--
-- ── UN SOLO RECORRIDO, Y NO ES OPTIMIZACIÓN PREMATURA ──────────────────────
--
-- Son nueve números que tienen que ser COHERENTES ENTRE SÍ. Con nueve consultas
-- separadas, en `read committed` cada una toma su propio snapshot: si alguien
-- termina un aseo justo en medio, la ganancia deja de ser cobrado menos pagos
-- menos gastos y el admin ve una resta que no cuadra en su propia pantalla. Con
-- una sola sentencia el agujero no existe por construcción, igual que en el
-- núcleo del cierre.
--
-- ── LA GANANCIA SE CALCULA AQUÍ Y NO EN LA PANTALLA ────────────────────────
--
-- Para que haya UN SOLO SITIO donde pueda estar mal. Un derivado calculado en
-- el cliente se desincroniza el día que alguien cambie el filtro de una de las
-- tres partidas y no de la resta.
--
-- ── DOS MÁRGENES, Y NO SON EL MISMO NÚMERO ────────────────────────────────
--
--   `margen_total`    = cobrado - pagado. Es la suma de la columna MARGEN del
--                       detalle (UI-SPEC §7.1), que NO descuenta gastos porque
--                       esa tabla no tiene columna de gastos. Es lo que alimenta
--                       la línea de apoyo «{$X} de margen» de §6.4.
--   `ganancia`        = cobrado - pagado - gastos. Es el KPI 4.
--
-- Confundirlos pone dos cifras distintas para «lo que queda» en la misma
-- pantalla. Van separadas y nombradas por lo que son.
--
-- ── EL MARGEN PROMEDIO ES AUSENCIA, NO CERO, CUANDO NO HUBO ASEOS ─────────
--
-- `avg` sobre el conjunto vacío devuelve nulo y así se deja. Un «$ 0 de margen
-- promedio» en un día sin operación afirma que se trabajó y no se ganó nada,
-- que es falso. Los cuatro KPIs sí van a cero (UI-SPEC §6.3: cero cobrado es un
-- hecho del día), pero un promedio sin muestra no es un hecho.
--
-- ── POR QUÉ NO SE EXIGE `aseador_id is not null`, A DIFERENCIA DEL CIERRE ──
--
-- El núcleo del cierre filtra por `aseador_id is not null and pago_aseador is
-- not null` porque está repartiendo dinero ENTRE PERSONAS: un aseo sin persona
-- no tiene a quién pagarse. Esta función mide el NEGOCIO, no la nómina: un aseo
-- completado sin aseador asignado (que `cl_completada_shape` permite, aunque la
-- máquina de estados de la Fase 4 no lo produzca) sí se le cobró al huésped y
-- tiene que aparecer en el KPI de cobrado. `coalesce(..., 0)` en la partida de
-- pago deja la resta bien definida en ese caso.
-- ===========================================================================
create or replace function public.resumen_financiero(
  p_desde date,
  p_hasta date
)
returns table (
  cobrado             bigint,
  pagado_aseadores    bigint,
  gastos_reembolsados bigint,
  ganancia            bigint,
  aseos_hechos        int,
  aseos_con_gastos    int,
  aseos_con_danos     int,
  margen_total        bigint,
  margen_promedio     bigint
)
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  -- ── LA GUARDA. PRIMERA SENTENCIA EJECUTABLE DEL CUERPO (regla 2). ────────
  -- `private.is_admin()` consulta `profiles` EN LA BASE, nunca un claim del
  -- JWT: un admin degradado hace un minuto no puede leer las finanzas con su
  -- token todavía vivo. Criterio 4 del ROADMAP.
  if not (select private.is_admin()) then
    raise exception 'no_autorizado'
      using errcode = '42501',
            hint    = 'El resumen financiero es información del negocio: solo lo ve un administrador activo.';
  end if;

  return query
  with aseos as (
    -- El recorrido único. Cada línea del filtro tiene su razón, y son las
    -- MISMAS tres que usa el núcleo del cierre, que es lo que hace que las dos
    -- superficies cuenten lo mismo (regla 6):
    --
    --   `c.is_managed` EXPLÍCITO (regla 3, FIN-05). El informativo JX del
    --   fixture está programado dentro del rango y sin estado; sin esta línea
    --   entraría en `aseos_hechos` y le pondría al admin una unidad que nunca
    --   fue suya. Aserción 37.
    --
    --   IGUALDAD A `completada`, no «distinto de cancelada»: el Resumen mide
    --   trabajo HECHO, no trabajo vivo.
    --
    --   `public.dia_bog(c.finished_at)` decide la pertenencia (regla 6), nunca
    --   `c.scheduled_date` ni un `::date` a secas.
    --
    -- Las dos cifras salen de `c`, no de `pr` (regla 5). Este join NO existe
    -- aquí justamente por eso: no hace falta el apartamento para nada, y no
    -- traerlo elimina la tentación.
    select c.id,
           coalesce(c.tarifa_huesped, 0)::bigint as cobrado,
           coalesce(c.pago_aseador, 0)::bigint   as pagado,
           coalesce(g.total, 0)::bigint          as gastos,
           (g.total is not null)                 as tiene_gasto,
           exists (
             select 1 from public.damages d where d.cleaning_id = c.id
           )                                     as tiene_dano
      from public.cleanings c
      left join lateral (
        -- Agregado sin `group by`: devuelve SIEMPRE una fila, nula cuando el
        -- aseo no tiene gastos. Por eso `tiene_gasto` se lee de la nulidad del
        -- total y no hace falta un segundo `exists`.
        select sum(e.monto)::bigint as total
          from public.expenses e
         where e.cleaning_id = c.id
      ) g on true
     where c.is_managed
       and c.state = 'completada'
       and public.dia_bog(c.finished_at) between p_desde and p_hasta
  )
  select coalesce(sum(a.cobrado), 0)::bigint,
         coalesce(sum(a.pagado), 0)::bigint,
         coalesce(sum(a.gastos), 0)::bigint,
         coalesce(sum(a.cobrado - a.pagado - a.gastos), 0)::bigint,
         count(*)::int,
         count(*) filter (where a.tiene_gasto)::int,
         count(*) filter (where a.tiene_dano)::int,
         coalesce(sum(a.cobrado - a.pagado), 0)::bigint,
         -- Sin `coalesce`: el promedio sobre cero aseos es AUSENCIA, no cero.
         -- `round` antes del casteo porque `avg(bigint)` devuelve `numeric` y
         -- un casteo directo truncaría hacia cero en vez de redondear.
         round(avg(a.cobrado - a.pagado))::bigint
    from aseos a;
end
$fn$;

comment on function public.resumen_financiero(date, date) is
  'FIN-02 y FIN-05. Los cuatro KPIs, los tres conteos y los dos márgenes del Resumen de /finanzas, en UNA sola fila y UN solo recorrido: son nueve números que tienen que ser coherentes entre sí, y nueve consultas separadas verían nueve snapshots distintos en read committed. ES LECTURA VIVA, NO SNAPSHOT: calcula al vuelo sobre el rango que se le pida, así que el mismo cuerpo sirve al filtro de día, de semana y de mes, y SÍ ve un aseo que entró a un periodo ya cerrado (eso no contradice D7-3, que congela el PAGO y no la métrica). La pertenencia al periodo la decide public.dia_bog(finished_at), la misma conversión que usa el cierre, o la fila de totales del detalle no cuadraría con estos KPIs. Las cifras salen del ASEO y nunca del apartamento (FIN-01). is_managed explícito, porque un conteo no se salva por un nulo (FIN-05). margen_total es cobrado menos pagado (la columna MARGEN del detalle); ganancia además resta los gastos (el KPI 4): no son el mismo número. margen_promedio es NULO y no cero cuando no hubo aseos. Guarda de admin como primera sentencia: una definer sin guarda salta la RLS entera.';

revoke all     on function public.resumen_financiero(date, date) from public, anon;
grant  execute on function public.resumen_financiero(date, date) to authenticated;


-- ===========================================================================
-- (b) public.costo_por_aseadora(date, date)
--     -> una fila por persona con aseos O gastos en el periodo
--
-- UI-SPEC §6.5. Es el bloque 3 del Resumen.
--
-- ── LO QUE ESTA FUNCIÓN NO DEVUELVE, Y ES UNA DECISIÓN DE PRODUCTO ────────
--
-- NINGUNA CIFRA DE COBRADO Y NINGÚN MARGEN POR PERSONA. No es un olvido ni una
-- optimización: es la decisión que la DEFINICION tomó con todas las letras.
--
-- El margen sale DEL APARTAMENTO, no de quién lo limpió. Con los datos reales
-- de hoy un apartamento deja 64.000 y otro 43.000, así que quien limpie el
-- primero «rinde» un 50% más sin haber hecho absolutamente nada distinto. Una
-- pantalla así parece un ranking de desempeño y en realidad es un ranking de a
-- quién le tocaron los apartamentos buenos. Por persona va LO QUE CUESTA, que
-- sí es suyo: su pago más lo que puso de su bolsillo y hay que reembolsarle.
--
-- La misma decisión tiene su mitad visual en UI-SPEC §6.5.3: prohibido numerar
-- las filas, prohibida cualquier medalla o color de posición, y el título en
-- presente («Cuánto cuesta cada aseadora»), sin comparativo.
--
-- ── EL ORDEN ES ALFABÉTICO, Y TAMBIÉN ES LA DECISIÓN ──────────────────────
--
-- Una lista de personas ordenada de mayor a menor SE LEE COMO UN PODIO aunque
-- no lleve números ni medallas. Prohibir la numeración y devolver orden
-- descendente sería cerrar la puerta dejando la ventana abierta. El orden por
-- monto es una elección explícita del admin en el selector de la pantalla, no
-- el estado inicial, y el orden que la base devuelve es el que la pantalla usa
-- por defecto.
--
-- ── `full outer join` Y NO `left join` DESDE LOS ASEOS ────────────────────
--
-- Alguien puede tener gastos en el periodo sin tener ningún aseo propio en él:
-- el suplente que compró detergente para el aseo de otra. Con un `left join`
-- ese reembolso desaparecería sin dejar rastro, que es la forma más silenciosa
-- de no pagarle a alguien lo que puso. Es el mismo razonamiento y la misma
-- forma que el núcleo del cierre, a propósito: este bloque y la pantalla de
-- Pagos tienen que hablar del mismo dinero.
--
-- ── EL FILTRO AQUÍ SÍ EXIGE PERSONA, A DIFERENCIA DE (a) ──────────────────
--
-- `c.aseador_id is not null and c.pago_aseador is not null`, exactamente como
-- el cierre. Un desglose POR PERSONA no puede tener una fila sin persona, y
-- agrupar los huérfanos bajo un nulo produciría una fila fantasma en el bloque.
-- ===========================================================================
create or replace function public.costo_por_aseadora(
  p_desde date,
  p_hasta date
)
returns table (
  aseador_id     uuid,
  aseador_nombre text,
  cantidad_aseos int,
  total_pago     bigint,
  total_gastos   bigint,
  costo_total    bigint
)
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  -- ── LA GUARDA. PRIMERA SENTENCIA EJECUTABLE DEL CUERPO (regla 2). ────────
  if not (select private.is_admin()) then
    raise exception 'no_autorizado'
      using errcode = '42501',
            hint    = 'El costo por aseadora es información del negocio: solo lo ve un administrador activo.';
  end if;

  return query
  with aseos as (
    -- Mismo filtro de (a) más la exigencia de persona. `is_managed` explícito
    -- otra vez y no heredado de nada (regla 3).
    select c.id          as cleaning_id,
           c.aseador_id  as persona,
           c.pago_aseador as monto
      from public.cleanings c
     where c.is_managed
       and c.state = 'completada'
       and c.aseador_id   is not null
       and c.pago_aseador is not null
       and public.dia_bog(c.finished_at) between p_desde and p_hasta
  ),
  gastos as (
    -- EL GASTO PERTENECE AL PERIODO DE SU ASEO, no al de su propia fecha de
    -- creación: el `join` contra `aseos` es lo que lo implementa, y es la misma
    -- regla del cierre. Se atribuye a `reported_by`, QUIEN PUSO EL DINERO, que
    -- no tiene por qué ser el `aseador_id` del aseo.
    select e.id            as expense_id,
           e.reported_by   as persona,
           e.monto         as monto
      from public.expenses e
      join aseos a on a.cleaning_id = e.cleaning_id
  ),
  tot_aseos as (
    select a.persona,
           sum(a.monto)::bigint as monto,
           count(*)::int        as cantidad
      from aseos a
     group by a.persona
  ),
  tot_gastos as (
    select g.persona,
           sum(g.monto)::bigint as monto
      from gastos g
     group by g.persona
  ),
  personas as (
    select coalesce(ta.persona, tg.persona)                  as persona,
           coalesce(ta.cantidad, 0)                          as cantidad,
           coalesce(ta.monto, 0)::bigint                     as pago,
           coalesce(tg.monto, 0)::bigint                     as gasto
      from tot_aseos ta
      full outer join tot_gastos tg on tg.persona = ta.persona
  )
  select pe.persona,
         -- Mismo `coalesce` defensivo que el cierre: `profiles_full_name_no_vacio`
         -- exige texto, pero un perfil borrado deja el join en nulo y la fila no
         -- se puede caer por un dato cosmético.
         coalesce(nullif(pg_catalog.btrim(pf.full_name), ''), 'Aseador sin nombre'),
         pe.cantidad,
         pe.pago,
         pe.gasto,
         (pe.pago + pe.gasto)::bigint
    from personas pe
    left join public.profiles pf on pf.id = pe.persona
   -- Alfabético. Ver el argumento de la cabecera: el orden por monto es una
   -- pregunta que alguien hace, no una jerarquía que la pantalla afirma sola.
   -- El desempate por identificador hace el orden TOTAL: sin él, dos personas
   -- homónimas podrían alternar de sitio entre dos lecturas de la misma
   -- pantalla.
   order by coalesce(nullif(pg_catalog.btrim(pf.full_name), ''), 'Aseador sin nombre'),
            pe.persona;
end
$fn$;

comment on function public.costo_por_aseadora(date, date) is
  'Bloque 3 del Resumen (UI-SPEC §6.5): una fila por persona con aseos O gastos en el periodo. NO DEVUELVE NINGUNA CIFRA DE COBRADO NI NINGÚN MARGEN POR PERSONA, y es una decisión de producto con argumento, no un olvido: el margen sale del apartamento y no de quién lo limpió, así que quien limpie el apartamento de 64.000 «rinde» un 50% más que quien limpia el de 43.000 sin hacer nada distinto, y la pantalla se convierte en un ranking de a quién le tocaron los apartamentos buenos. Por persona va lo que CUESTA: pago más gastos reembolsados. El orden es ALFABÉTICO por nombre y no por monto: una lista de personas ordenada de mayor a menor se lee como un podio aunque no lleve números ni medallas; el orden por monto es una elección explícita del admin en el selector. full outer join y no left join: alguien puede tener gastos en el periodo sin aseos propios (el suplente que compró detergente para el aseo de otra) y con un left join ese reembolso desaparecería sin dejar rastro. Misma conversión de fecha y mismo filtro de gestión propia que el cierre, para que este bloque y la pantalla de Pagos hablen del mismo dinero. Guarda de admin como primera sentencia.';

revoke all     on function public.costo_por_aseadora(date, date) from public, anon;
grant  execute on function public.costo_por_aseadora(date, date) to authenticated;


-- ===========================================================================
-- (c) public.rentabilidad_aseos(date, date, uuid, uuid, text) — ES FIN-02
--     -> una fila por aseo del periodo
--
-- UI-SPEC §7. Es el destino de los tres conteos del bloque 2 y donde vive el
-- criterio 2 de la DEFINICION: filtrar por apartamento y por aseador.
--
-- ── LAS DOS FECHAS, Y NO UNA ──────────────────────────────────────────────
--
-- `fecha_programada` y `fecha_ejecucion` son columnas distintas porque un aseo
-- programado el 28 de enero y hecho el 2 de febrero PERTENECE A FEBRERO (D7-8),
-- y la pantalla marca esa discrepancia en `--status-warn`. Con una sola fecha
-- esa señal no se puede pintar y el admin no tiene cómo explicar por qué un
-- aseo de enero aparece en el periodo de febrero.
--
-- ── LAS TRES CIFRAS SALEN DEL ASEO (regla 5) ──────────────────────────────
--
-- `c.tarifa_huesped` y `c.pago_aseador`, que son el SNAPSHOT que el trigger de
-- FIN-01 copió al crear el aseo. NUNCA `pr.tarifa_huesped`. El apartamento se
-- une SOLO por el nombre, que es lo único que la tabla pinta de él. Con las
-- tarifas vivas, el bloque F del contrato (que edita la tarifa del apartamento
-- después de cerrar) haría que el mes pasado se moviera solo.
--
-- ── LAS BANDERAS SE CALCULAN CON EXISTENCIA, NO CON CONTEO ────────────────
--
-- La tabla solo pinta un icono: solo necesita saber si hay o no. `exists` corta
-- en la primera fila; un `count(*) > 0` recorre todas las que haya para
-- después tirar el número.
--
-- ── EL FILTRO DE TIPO SE VALIDA EN LA BASE ────────────────────────────────
--
-- Tres valores, los de la URL de UI-SPEC §7.2. UN VALOR DESCONOCIDO ES UN
-- ERROR, NO UN SILENCIO: devolver cero filas ante un `filtro=con-gasto` mal
-- escrito le enseñaría al admin un periodo vacío que parece un dato («este mes
-- no hubo gastos») cuando en realidad es un defecto. `P0001` y no `42501`:
-- aquí quien llama SÍ está autorizado, lo que está mal es el argumento, y la
-- pantalla necesita poder distinguir los dos casos.
--
-- El nulo significa «todos», igual que en los otros dos filtros: es lo que
-- manda la pantalla cuando el control no está tocado.
-- ===========================================================================
create or replace function public.rentabilidad_aseos(
  p_desde    date,
  p_hasta    date,
  p_property uuid default null,
  p_aseador  uuid default null,
  p_filtro   text default 'todos'
)
returns table (
  cleaning_id      uuid,
  property_id      uuid,
  property_nombre  text,
  fecha_programada date,
  fecha_ejecucion  date,
  aseador_id       uuid,
  aseador_nombre   text,
  cobrado          bigint,
  pagado           bigint,
  margen           bigint,
  tiene_gasto      boolean,
  tiene_dano       boolean
)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_filtro text;
begin
  -- ── LA GUARDA. PRIMERA SENTENCIA EJECUTABLE DEL CUERPO (regla 2). ────────
  -- Va ANTES de validar el filtro a propósito: quien no es admin no tiene
  -- derecho ni a saber qué valores de filtro acepta esta función.
  if not (select private.is_admin()) then
    raise exception 'no_autorizado'
      using errcode = '42501',
            hint    = 'La rentabilidad por aseo es información del negocio: solo la ve un administrador activo.';
  end if;

  v_filtro := coalesce(p_filtro, 'todos');

  if v_filtro not in ('todos', 'con-gastos', 'con-danos') then
    raise exception 'filtro_invalido'
      using errcode = 'P0001',
            hint    = 'El filtro de tipo solo acepta todos, con-gastos o con-danos. Un valor desconocido es un error y no un periodo vacío.';
  end if;

  return query
  with base as (
    select c.id                          as cleaning_id,
           c.property_id                 as property_id,
           pr.nombre                     as property_nombre,
           c.scheduled_date              as fecha_programada,
           public.dia_bog(c.finished_at) as fecha_ejecucion,
           c.aseador_id                  as aseador_id,
           -- Nulo y no un texto de relleno: la celda A CARGO de un aseo sin
           -- persona tiene que poder pintar su propio vacío, y un
           -- 'Sin asignar' puesto aquí sería un nombre inventado que además se
           -- ordenaría entre los reales.
           pg_catalog.btrim(pf.full_name) as aseador_nombre,
           coalesce(c.tarifa_huesped, 0)::bigint as cobrado,
           coalesce(c.pago_aseador, 0)::bigint   as pagado,
           exists (
             select 1 from public.expenses e where e.cleaning_id = c.id
           ) as tiene_gasto,
           exists (
             select 1 from public.damages d where d.cleaning_id = c.id
           ) as tiene_dano
      from public.cleanings c
      join public.properties pr on pr.id = c.property_id
      left join public.profiles pf on pf.id = c.aseador_id
     where c.is_managed
       and c.state = 'completada'
       and public.dia_bog(c.finished_at) between p_desde and p_hasta
       -- Los dos filtros opcionales, con el nulo significando «todos». La
       -- comparación va con `=` y no con `is not distinct from` porque el nulo
       -- ya lo absorbe la primera mitad de cada `or`.
       and (p_property is null or c.property_id = p_property)
       and (p_aseador  is null or c.aseador_id  = p_aseador)
  )
  select b.cleaning_id,
         b.property_id,
         b.property_nombre,
         b.fecha_programada,
         b.fecha_ejecucion,
         b.aseador_id,
         b.aseador_nombre,
         b.cobrado,
         b.pagado,
         (b.cobrado - b.pagado)::bigint,
         b.tiene_gasto,
         b.tiene_dano
    from base b
   where v_filtro = 'todos'
      or (v_filtro = 'con-gastos' and b.tiene_gasto)
      or (v_filtro = 'con-danos'  and b.tiene_dano)
   -- Lo más reciente primero, que es como se lee una tabla de operación. Los
   -- dos desempates hacen el orden TOTAL: sin el último, dos aseos del mismo
   -- apartamento el mismo día podrían alternar entre dos lecturas.
   order by b.fecha_ejecucion desc, b.property_nombre, b.cleaning_id;
end
$fn$;

comment on function public.rentabilidad_aseos(date, date, uuid, uuid, text) is
  'FIN-02, la tabla de /finanzas/aseos. Una fila por aseo gestionado y completado cuyo día de ejecución en Bogotá cae en el rango, con LAS DOS FECHAS (programada y de ejecución, porque un aseo hecho en otro mes pertenece al mes en que se completó, D7-8, y la pantalla marca esa discrepancia), la persona a cargo, cobrado, pagado, margen y las dos banderas de gasto y daño. LAS TRES CIFRAS SALEN DEL ASEO Y NUNCA DEL APARTAMENTO (FIN-01): el apartamento se une solo por el nombre. Los tres filtros son opcionales y el nulo significa todos; el de tipo se valida contra sus tres valores y uno desconocido levanta P0001, porque devolver cero filas ante un valor mal escrito le enseñaría al admin un periodo vacío que parece un dato. P0001 y no 42501: quien llama sí está autorizado, lo que está mal es el argumento. Las banderas usan exists y no count: la tabla solo pinta un icono. Ningún apartamento de gestión externa aparece, ni en las filas ni contado (FIN-05, aserción 36). Misma conversión de fecha que resumen_financiero, o la fila de totales no cuadraría con los KPIs. Guarda de admin como primera sentencia, ANTES incluso de validar el filtro.';

revoke all     on function public.rentabilidad_aseos(date, date, uuid, uuid, text) from public, anon;
grant  execute on function public.rentabilidad_aseos(date, date, uuid, uuid, text) to authenticated;


-- ===========================================================================
-- (d) public.aseos_de_aseadora(uuid, date, date)
--     -> bloque 2 de la ficha de una persona
--
-- UI-SPEC §8.2: cuatro columnas, APARTAMENTO · PROGRAMADO · HECHO · PAGO.
--
-- ── SIN COBRADO Y SIN MARGEN, Y NO ES PORQUE LA ASEADORA VAYA A VERLO ─────
--
-- Esta función es de ADMIN: la aseadora no la puede invocar. La razón de que
-- aun así no lleve esas dos columnas es otra, y es más importante: el desglose
-- que ve el admin y el que ve la aseadora en `/mis-pagos` tienen que ser EL
-- MISMO DOCUMENTO. Si el admin ve una columna de más, el día que alguien
-- reclame van a estar comparando dos papeles distintos, y esa conversación se
-- gana o se pierde antes de empezar.
--
-- Es la misma decisión que D7-7 tomó para la frontera del aseador, aplicada un
-- nivel más arriba: la simetría del documento es parte del producto.
--
-- ── EL FILTRO ES EL DE (b), NO EL DE (a) ──────────────────────────────────
--
-- Exige persona y pago no nulo, porque el total de la cabecera de la ficha
-- (UI-SPEC §8.1) tiene que ser el mismo número que la fila de esa persona en el
-- bloque 3 del Resumen. Dos cifras distintas para lo mismo en dos pantallas es
-- exactamente lo que hace que el admin deje de creerle a las dos.
-- ===========================================================================
create or replace function public.aseos_de_aseadora(
  p_aseador uuid,
  p_desde   date,
  p_hasta   date
)
returns table (
  cleaning_id      uuid,
  property_id      uuid,
  property_nombre  text,
  fecha_programada date,
  fecha_ejecucion  date,
  pago             bigint
)
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  -- ── LA GUARDA. PRIMERA SENTENCIA EJECUTABLE DEL CUERPO (regla 2). ────────
  if not (select private.is_admin()) then
    raise exception 'no_autorizado'
      using errcode = '42501',
            hint    = 'La ficha de una aseadora es información del negocio: solo la ve un administrador activo.';
  end if;

  return query
    select c.id,
           c.property_id,
           pr.nombre,
           c.scheduled_date,
           public.dia_bog(c.finished_at),
           c.pago_aseador::bigint
      from public.cleanings c
      join public.properties pr on pr.id = c.property_id
     where c.is_managed
       and c.state = 'completada'
       and c.aseador_id   = p_aseador
       and c.pago_aseador is not null
       and public.dia_bog(c.finished_at) between p_desde and p_hasta
     order by public.dia_bog(c.finished_at) desc, pr.nombre, c.id;
end
$fn$;

comment on function public.aseos_de_aseadora(uuid, date, date) is
  'Bloque 2 de la ficha de una persona (UI-SPEC §8.2): apartamento, las dos fechas y el pago. NO DECLARA COBRADO NI MARGEN, y no es porque la aseadora vaya a ver esta función (es de admin y tiene su guarda): es porque el desglose del admin y el del aseador en /mis-pagos tienen que ser EL MISMO DOCUMENTO. Si el admin ve una columna de más, el día que alguien reclame estarán comparando dos papeles distintos. Usa el filtro del cierre (persona y pago no nulos) y no el del Resumen, para que el total de la cabecera de la ficha sea el mismo número que la fila de esa persona en el bloque 3. Guarda de admin como primera sentencia.';

revoke all     on function public.aseos_de_aseadora(uuid, date, date) from public, anon;
grant  execute on function public.aseos_de_aseadora(uuid, date, date) to authenticated;


-- ===========================================================================
-- (e) public.gastos_de_aseadora(uuid, date, date)
--     -> bloque 4 de la ficha de una persona
--
-- UI-SPEC §8.2 y §8.3: fecha, apartamento, concepto, monto y `Ver recibo`.
--
-- ── DEVUELVE LA RUTA, NO LA URL. T-07-38 ──────────────────────────────────
--
-- El bucket y la ruta, nunca una URL firmada. Firmar es trabajo del servidor de
-- la aplicación, DESPUÉS de su propio guard, y con su propia expiración. Una
-- función de base que devolviera URLs firmadas las emitiría para todas las
-- filas de la página, incluidas las que el usuario nunca abre, y cada una
-- seguiría siendo válida hasta expirar aunque la sesión se cierre un segundo
-- después. La ruta sola no abre nada.
--
-- Cuando la ruta viene nula, la foto se purgó (RET-06) y la pantalla NO
-- renderiza el botón: pinta `Sin recibo disponible` (UI-SPEC §8.3). Por eso el
-- `left join lateral` y no un `join`: un gasto sin recibo sigue siendo un gasto
-- que hay que reembolsar, y perderlo de la lista sería dejar de pagarlo.
--
-- ── EL PERIODO DEL GASTO ES EL DE SU ASEO ─────────────────────────────────
--
-- Igual que en (b) y que en el cierre. Un gasto reportado el día 2 sobre un
-- aseo del día 30 del mes anterior pertenece al mes anterior, o el bloque 4 de
-- la ficha no sumaría lo mismo que la fila de esa persona en el bloque 3.
-- ===========================================================================
create or replace function public.gastos_de_aseadora(
  p_aseador uuid,
  p_desde   date,
  p_hasta   date
)
returns table (
  expense_id       uuid,
  cleaning_id      uuid,
  property_id      uuid,
  property_nombre  text,
  fecha_ejecucion  date,
  concepto         text,
  monto            bigint,
  moneda           text,
  evidencia_bucket text,
  evidencia_path   text
)
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  -- ── LA GUARDA. PRIMERA SENTENCIA EJECUTABLE DEL CUERPO (regla 2). ────────
  if not (select private.is_admin()) then
    raise exception 'no_autorizado'
      using errcode = '42501',
            hint    = 'Los gastos de una aseadora son información del negocio: solo los ve un administrador activo.';
  end if;

  return query
    select e.id,
           c.id,
           c.property_id,
           pr.nombre,
           public.dia_bog(c.finished_at),
           e.concepto,
           e.monto::bigint,
           e.moneda,
           ev.storage_bucket,
           ev.storage_path
      from public.expenses e
      join public.cleanings  c  on c.id  = e.cleaning_id
      join public.properties pr on pr.id = c.property_id
      left join lateral (
        -- UNA foto: `cleaning_photos` admite varias por gasto y el diálogo de
        -- recibo enseña una. `deleted_at is null` porque una foto ya purgada no
        -- abre nada, misma condición que la migración 18 y que el cierre.
        select ph.storage_bucket, ph.storage_path
          from public.cleaning_photos ph
         where ph.expense_id = e.id
           and ph.kind       = 'gasto'
           and ph.deleted_at is null
         order by ph.created_at, ph.id
         limit 1
      ) ev on true
     where c.is_managed
       and c.state = 'completada'
       -- `reported_by` y no `c.aseador_id`: se le reembolsa a QUIEN PUSO EL
       -- DINERO, que puede ser un suplente que compró para el aseo de otra.
       and e.reported_by = p_aseador
       and public.dia_bog(c.finished_at) between p_desde and p_hasta
     order by public.dia_bog(c.finished_at) desc, e.concepto, e.id;
end
$fn$;

comment on function public.gastos_de_aseadora(uuid, date, date) is
  'Bloque 4 de la ficha de una persona (UI-SPEC §8.2 y §8.3). DEVUELVE EL BUCKET Y LA RUTA DE LA EVIDENCIA, NUNCA UNA URL (T-07-38): firmar es trabajo del servidor de la aplicación, después de su propio guard y con su propia expiración; una función de base que firmara emitiría URLs para todas las filas de la página, incluidas las que nadie abre, y cada una seguiría viva aunque la sesión se cierre. left join lateral y no join: un gasto cuya foto ya se purgó sigue siendo un gasto que hay que reembolsar, y la pantalla pinta «Sin recibo disponible» en vez del botón. El gasto pertenece al periodo de SU ASEO y se atribuye a reported_by (quien puso el dinero, que puede ser un suplente), igual que en el cierre, o el bloque 4 no sumaría lo mismo que la fila de esa persona en el bloque 3 del Resumen. Guarda de admin como primera sentencia.';

revoke all     on function public.gastos_de_aseadora(uuid, date, date) from public, anon;
grant  execute on function public.gastos_de_aseadora(uuid, date, date) to authenticated;


-- ===========================================================================
-- (f) public.aseo_en_curso_de_aseadora(uuid)
--     -> bloque 1 de la ficha: «Ahora mismo»
--
-- UI-SPEC §8.4. Responde «¿dónde está cada miembro de mi equipo?» CON LO QUE EL
-- SISTEMA YA SABE: qué aseo tiene en curso.
--
-- ── REGLAS DURAS, Y NINGUNA ES DE ESTILO ──────────────────────────────────
--
--   * NINGUNA COORDENADA, NINGÚN DATO DE UBICACIÓN, NADA QUE SE PAREZCA A UN
--     RASTREO. No hay GPS y no lo va a haber. Esta función no declara ni una
--     sola columna de la que se pueda derivar una posición, y el contrato de
--     diseño prohíbe además la palabra «ubicación» en esa pantalla. Una interfaz
--     que insinúa rastreo cuando no existe crea una expectativa que nadie va a
--     poder cumplir y una conversación con el equipo que nadie quiere tener.
--
--     OJO AL AMPLIARLA: `public.cleaning_photos` tiene `captured_lat` y
--     `captured_lng`. Son de la FOTO y no de la persona, y aquí no entran por
--     ninguna vía, ni siquiera «para el mapa del apartamento».
--
--   * NADA DE ÚLTIMA CONEXIÓN NI DE ESTADO EN LÍNEA. El sistema no lo mide, y
--     una columna así habría que inventarla.
--
--   * EL DATO ES DE CUANDO SE CONSULTÓ. No hay tiempo real en esta pantalla y
--     la interfaz lo dice con todas las letras («Al momento de abrir esta
--     página»): un dato operativo que parece vivo y no lo está es peor que uno
--     fechado.
--
-- ── POR QUÉ DEVUELVE SIEMPRE UNA FILA, Y QUÉ SIGNIFICA ────────────────────
--
-- La pantalla tiene TRES estados y solo dos de ellos hablan de un aseo: tiene
-- uno en curso, no tiene ninguno, o la cuenta está desactivada. `esta_activa`
-- hay que responderlo en los tres casos, así que la fila existe siempre que el
-- perfil exista, y las cuatro columnas del aseo vienen NULAS cuando no hay
-- ninguno en curso. Cero filas significa una sola cosa, y es distinta: ese
-- identificador no corresponde a ningún perfil.
-- ===========================================================================
create or replace function public.aseo_en_curso_de_aseadora(
  p_aseador uuid
)
returns table (
  esta_activa     boolean,
  cleaning_id     uuid,
  property_id     uuid,
  property_nombre text,
  iniciado_at     timestamptz
)
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  -- ── LA GUARDA. PRIMERA SENTENCIA EJECUTABLE DEL CUERPO (regla 2). ────────
  if not (select private.is_admin()) then
    raise exception 'no_autorizado'
      using errcode = '42501',
            hint    = 'La ficha de una aseadora es información del negocio: solo la ve un administrador activo.';
  end if;

  return query
    select pf.is_active,
           c.id,
           c.property_id,
           pr.nombre,
           c.started_at
      from public.profiles pf
      left join lateral (
        -- UNO: el estado de la máquina de la Fase 4 solo admite un aseo en
        -- curso por persona, pero el `limit 1` con orden total deja la fila
        -- determinista si algún día esa invariante se relaja, en vez de
        -- convertir la ficha en dos filas que la pantalla no sabe pintar.
        --
        -- `is_managed` explícito (regla 3): un informativo no tiene estado, así
        -- que hoy no puede entrar, pero el filtro no se apoya en ese nulo.
        select cl.id, cl.property_id, cl.started_at
          from public.cleanings cl
         where cl.aseador_id = pf.id
           and cl.is_managed
           and cl.state = 'en_curso'
         order by cl.started_at desc, cl.id
         limit 1
      ) c on true
      left join public.properties pr on pr.id = c.property_id
     where pf.id = p_aseador;
end
$fn$;

comment on function public.aseo_en_curso_de_aseadora(uuid) is
  'Bloque 1 de la ficha, «Ahora mismo» (UI-SPEC §8.4). Responde qué está haciendo una persona CON LO QUE EL SISTEMA YA SABE: qué aseo tiene en curso. NO DECLARA NINGUNA COORDENADA, NINGÚN DATO DE UBICACIÓN Y NADA QUE SE PAREZCA A UN RASTREO: no hay GPS y no lo va a haber, y una interfaz que insinúa rastreo cuando no existe crea una expectativa imposible de cumplir. Al ampliarla, cleaning_photos.captured_lat y captured_lng son de la FOTO y no de la persona, y aquí no entran por ninguna vía. Tampoco hay última conexión ni estado en línea: el sistema no lo mide. El dato es de cuando se consultó, sin tiempo real, y la pantalla lo dice. Devuelve SIEMPRE una fila si el perfil existe, porque esta_activa hay que responderlo en los tres estados de la pantalla; las cuatro columnas del aseo vienen nulas cuando no hay ninguno en curso, y cero filas significa que ese identificador no es de ningún perfil. Guarda de admin como primera sentencia.';

revoke all     on function public.aseo_en_curso_de_aseadora(uuid) from public, anon;
grant  execute on function public.aseo_en_curso_de_aseadora(uuid) to authenticated;
