-- ===========================================================================
-- 25 — EL CIERRE DEL PERIODO: EL NÚCLEO, SUS DOS PUERTAS Y EL JOB
--
-- Segunda migración de la Fase 7. Cubre FIN-03 (el sistema calcula el pago
-- mensual), FIN-04 (el desglose sobrevive al borrado, por la vía del texto
-- copiado) y FIN-05 (los informativos fuera de todo cálculo Y de todo conteo).
--
-- LO QUE ESTE ARCHIVO ESCRIBE ES LO QUE LE PAGA A UNA PERSONA. El modo de fallo
-- de un error aquí no es una pantalla fea: es una transferencia equivocada,
-- descubierta por el extracto bancario, y que además NO SE PUEDE CORREGIR
-- RECALCULANDO, porque D7-3 prohíbe recalcular un periodo cerrado.
--
-- ── LAS CUATRO REGLAS QUE IMPLEMENTA, CADA UNA CON SU RAZÓN ────────────────
--
--   D7-5  El periodo va DE CIERRE A CIERRE, no del 1 al 31. La migración 23 ya
--         dejó `periodo_desde` y `periodo_hasta` como columnas reales y el
--         calendario (`public.periodo_de_cierre`) verificado en 6 aserciones.
--
--   D7-8  Un aseo pertenece al periodo en que SE COMPLETÓ, no al de su fecha
--         programada. Junto con D7-5, eso elimina los días huérfanos: no queda
--         ningún aseo sin periodo. Todo desglose guarda LAS DOS FECHAS, y la
--         migración 23 las dejó `not null` en las líneas: el schema lo impone,
--         este archivo las rellena.
--
--   D7-8  `public.dia_bog()` decide la pertenencia, NUNCA una conversión a
--   (bis) fecha sin zona. `finished_at` es un instante; resuelto en tiempo
--         universal, todo aseo terminado entre las 19:00 y la medianoche de
--         Bogotá cae en el día siguiente. Al cruzar un cierre ese aseo se va al
--         periodo equivocado y EL ERROR ES PERMANENTE. Aserciones 10 y 12.
--
--   D7-3  Idempotencia: dos corridas no pueden pagar dos veces. Hay DOS puertas
--         (el job de `pg_cron` y el RPC de admin del «Cerrar el periodo ahora»),
--         y las dos se pueden disparar a la vez. La garantía se apoya en
--         `unique + on conflict do nothing`, que serializa el motor, no en una
--         comprobación que alguien puede olvidar escribir. Aserciones 31 a 33.
--
-- ── POR QUÉ DOS PUERTAS Y UN SOLO NÚCLEO ──────────────────────────────────
--
-- FIN-03 dice «el sistema calcula», no «el admin calcula», así que el camino
-- primario es un job. Pero este repo ya construyó un watchdog en la Fase 3
-- precisamente porque los jobs fallan, y si el job no corre el último día hábil
-- NADIE COBRA. De ahí `public.cerrar_periodo_si_toca()` (el job) y
-- `public.cerrar_periodo()` (el reintento del admin), las dos delegando en
-- `private.cerrar_periodo_core()`. El índice único hace que no importe quién
-- llegue primero.
--
-- ── QUÉ NO HACE ESTE ARCHIVO ───────────────────────────────────────────────
--
--   * NO aplica descuentos por daños. Se ofreció al dueño y se dejó fuera: con
--     personal real, un descuento automático sobre el sueldo es una
--     conversación, no un cálculo.
--   * NO aplica bonos ni ajustes manuales.
--   * NO recalcula NUNCA. Si el periodo ya tiene cabecera, el núcleo sale.
--   * NO escribe ninguna cifra de huésped, en ninguna de las tres tablas. Ni
--     puede: la migración 23 no les dio columna donde ponerla (T-07-35).
--   * NO crea las funciones de lectura del admin (`rentabilidad_aseos`,
--     `resumen_financiero`): migración 26, plan 07-08.
--   * NO crea las funciones de lectura del aseador: migración 27, plan 07-09.
--
-- ── TRAMPAS DE ESTE REPO QUE MUERDEN AQUÍ, TODAS MEDIDAS ───────────────────
--
--   1. `coalesce` y `nullif` NO se califican con el esquema del catálogo: son
--      construcciones del lenguaje SQL, no funciones, y calificarlas revienta
--      con «function does not exist» en un cuerpo con el camino de búsqueda
--      vacío. `btrim`, `now` y `date_trunc` sí son funciones y sí van
--      calificadas. Es la lección de la migración 22.
--   2. La suma sobre enteros anchos devuelve el tipo de precisión arbitraria,
--      que supabase-js entrega como CADENA para no perder precisión y rompe la
--      aritmética de TypeScript en silencio ('132000' + 1 = '1320001'). Todos
--      los totales de este archivo se castean a `bigint` EN LA BASE.
--   3. El guardarraíl 4 de `scripts/ci/check-service-role.sh` prohíbe por grep
--      la función de fecha de sesión en migraciones y seeds, y el grep no
--      distingue un comentario de una línea de código. Aquí se describe el
--      patrón sin escribir nunca el nombre. `public.today_bog()` es el único
--      helper de fecha permitido.
--   4. Patrón definer obligatorio: `security definer set search_path = ''`,
--      todo nombre calificado (`auth.uid()` incluido), y al lado de CADA
--      definición el `revoke ... from public, anon` más el `grant` que toque.
--      No se hereda: `alter default privileges` no puede quitarle `EXECUTE` a
--      PUBLIC.
-- ===========================================================================


-- ===========================================================================
-- (a) private.cerrar_periodo_core(date, date) -> int
--
-- EL ÚNICO SITIO DONDE VIVE EL CÁLCULO. En el esquema privado y SIN GRANT PARA
-- NADIE (T-07-32): las dos puertas públicas son quienes autorizan; el núcleo no
-- autoriza, calcula.
--
-- Devuelve el número de filas de pago escritas. Cero significa una de dos cosas
-- y las dos son correctas: o el periodo ya estaba cerrado, o no hubo trabajo
-- que pagar en el rango (un mes sin operación). La cabecera de periodo existe
-- en los dos casos, que es justamente por lo que la migración 23 la añadió.
--
-- ── EL CUERPO ES UNA SOLA SENTENCIA, Y NO ES ESTILO ───────────────────────
--
-- Los pagos y sus líneas se escriben en UNA sentencia con CTEs que modifican
-- datos, no en dos sentencias seguidas. La razón es de corrección:
--
--   En `read committed` cada sentencia toma su propio snapshot. Con dos
--   sentencias, un aseo que se complete entre la primera y la segunda entraría
--   en el DESGLOSE sin haber entrado en el TOTAL, y el `check cp_total_cuadra`
--   de la migración 23 no lo atraparía, porque solo verifica que el total sea
--   la suma de las dos partidas. El resultado sería un recibo cuyas líneas
--   suman más que lo que se paga, descubierto por quien cobra.
--
--   Todas las CTEs de una misma sentencia comparten UN snapshot. El agujero no
--   existe por construcción.
-- ===========================================================================
create or replace function private.cerrar_periodo_core(
  p_desde date,
  p_hasta date
)
returns int
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_cabeceras int;
  v_pagos     int;
begin
  -- ─────────────────────────────────────────────────────────────────────────
  -- (1) LA IDEMPOTENCIA VA PRIMERO, ANTES DE LEER UN SOLO ASEO (D7-3, T-07-29)
  --
  -- `on conflict do nothing` sobre la clave primaria de la cabecera. Si no se
  -- insertó ninguna fila, el periodo YA ESTABA CERRADO y se sale devolviendo
  -- cero sin tocar nada. Es D7-3 implementado como una guarda de dos líneas en
  -- vez de como una convención que alguien tiene que recordar.
  --
  -- POR QUÉ LA AUTORIDAD ES LA CABECERA DE PERIODO Y NO EL PAGO DE CADA
  -- PERSONA: con la unicidad solo por persona, una segunda corrida en la que
  -- apareciera una aseadora nueva cerraría A MEDIAS un periodo ya cerrado, que
  -- es exactamente lo que D7-3 prohíbe. «Este periodo ya se cerró» es UNA FILA,
  -- no un conjunto.
  --
  -- Y SERIALIZA DE VERDAD, no por suerte: con dos corridas simultáneas (el job
  -- y el botón del admin a la vez), `on conflict do nothing` espera al token de
  -- inserción especulativa de la otra transacción y, cuando esta confirma,
  -- inserta cero filas. El motor hace el trabajo; el código solo lee el
  -- resultado.
  --
  -- `cerrado_por` queda NULO por el camino del job, y es correcto: no lo cerró
  -- nadie, lo cerró el sistema. La columna es nullable a propósito.
  -- ─────────────────────────────────────────────────────────────────────────
  insert into public.payout_periods (periodo_desde, periodo_hasta, cerrado_por)
  values (p_desde, p_hasta, (select auth.uid()))
  on conflict (periodo_desde) do nothing;

  get diagnostics v_cabeceras = row_count;

  if v_cabeceras = 0 then
    return 0;
  end if;

  -- La fila ya es nuestra (la acabamos de insertar en esta transacción), así
  -- que este bloqueo es explícito y no implícito: deja escrito que a partir de
  -- aquí nadie más toca este periodo hasta que la transacción termine, y
  -- protege el `update` del contador de (6) de una corrida concurrente que
  -- llegara por la otra puerta.
  perform 1
     from public.payout_periods pp
    where pp.periodo_desde = p_desde
      for update;

  -- ─────────────────────────────────────────────────────────────────────────
  -- (2) a (5) EL CÁLCULO Y EL DESGLOSE, EN UNA SOLA SENTENCIA
  -- ─────────────────────────────────────────────────────────────────────────
  with

  -- (2) LOS ASEOS QUE ENTRAN. Cada línea del filtro tiene su razón:
  --
  --   `is_managed` EXPLÍCITO Y NO IMPLÍCITO (FIN-05). Es cierto hoy que las
  --   filas informativas tienen sus cifras en nulo, por el `check`
  --   `cl_unmanaged_is_inert` de la migración 04, pero FIN-05 dice «fuera de
  --   todo cálculo y de toda métrica», y eso incluye los CONTEOS. Un conteo no
  --   se salva por un nulo. Apoyarse en el nulo funciona hasta el día en que
  --   alguien añada una columna con default (Pitfall 8 del research).
  --
  --   IGUALDAD A `completada`, no «distinto de cancelada». La regla transversal
  --   del repo de comparar con `is distinct from` aplica a las consultas de
  --   aseos VIVOS; aquí se pide una igualdad, que es más estrecha: solo se paga
  --   trabajo hecho.
  --
  --   LA PERTENENCIA SALE DE `public.dia_bog(finished_at)` (D7-8), no de
  --   `scheduled_date`. Un aseo programado el 28 de enero que se termina el 2
  --   de febrero se paga en el periodo de febrero.
  --
  --   LA CONVERSIÓN DE ZONA NO ES OPCIONAL. Ver la cabecera de este archivo y
  --   el comentario de `public.dia_bog` en la migración 23.
  --
  -- El monto es `pago_aseador`, que es el SNAPSHOT que el trigger de FIN-01
  -- copió del apartamento al crear el aseo, no la tarifa vigente del
  -- apartamento. Por eso corregir la tarifa después no mueve nada, ni siquiera
  -- si alguien reabriera el periodo.
  aseos as (
    select c.id                          as cleaning_id,
           c.property_id                 as property_id,
           pr.nombre                     as property_nombre,
           c.aseador_id                  as aseador_id,
           c.scheduled_date              as fecha_programada,
           public.dia_bog(c.finished_at) as fecha_ejecucion,
           c.pago_aseador                as monto
      from public.cleanings  c
      join public.properties pr on pr.id = c.property_id
     where c.is_managed
       and c.state = 'completada'
       and c.aseador_id   is not null
       and c.pago_aseador is not null
       and public.dia_bog(c.finished_at) between p_desde and p_hasta
  ),

  -- (3) LOS GASTOS DE ESOS ASEOS, atribuidos a QUIEN LOS REPORTÓ.
  --
  -- EL GASTO PERTENECE AL PERIODO DE SU ASEO, no al de su propia fecha de
  -- creación. El `join` contra `aseos` es lo que lo implementa, y compra tres
  -- cosas de una vez: el gasto y el aseo que lo originó viajan siempre juntos,
  -- el desglose es coherente, y un gasto no puede quedar huérfano de periodo.
  --
  -- Además garantiza que la línea de gasto TENGA las dos fechas, que la
  -- migración 23 declaró `not null`: las hereda del aseo.
  --
  -- La persona a la que se le reembolsa es `reported_by` (quien puso el
  -- dinero), que NO tiene por qué ser `aseador_id` del aseo: un suplente puede
  -- comprar detergente para un aseo que hace otra.
  --
  -- La evidencia se resuelve con un `lateral` que toma UNA foto: `cleaning_photos`
  -- admite varias por gasto y el desglose enseña una. `deleted_at is null`
  -- porque una foto ya purgada no abre nada (misma condición que la migración 18).
  gastos as (
    select e.id              as expense_id,
           a.cleaning_id     as cleaning_id,
           a.property_id     as property_id,
           a.property_nombre as property_nombre,
           a.fecha_programada,
           a.fecha_ejecucion,
           e.reported_by     as aseador_id,
           e.concepto        as concepto,
           e.monto           as monto,
           e.moneda          as moneda,
           ev.storage_bucket as evidencia_bucket,
           ev.storage_path   as evidencia_path
      from public.expenses e
      join aseos a on a.cleaning_id = e.cleaning_id
      left join lateral (
        select ph.storage_bucket, ph.storage_path
          from public.cleaning_photos ph
         where ph.expense_id = e.id
           and ph.kind       = 'gasto'
           and ph.deleted_at is null
         order by ph.created_at, ph.id
         limit 1
      ) ev on true
  ),

  -- Los dos totales por persona, CASTEADOS A ENTERO ANCHO EN LA BASE. Sin el
  -- casteo, `sum(bigint)` devuelve `numeric` y supabase-js lo entrega como
  -- cadena: la aritmética de TypeScript se rompe en silencio. Trampa 2.
  tot_aseos as (
    select a.aseador_id,
           sum(a.monto)::bigint as monto,
           count(*)::int        as cantidad
      from aseos a
     group by a.aseador_id
  ),
  tot_gastos as (
    select g.aseador_id,
           sum(g.monto)::bigint as monto,
           count(*)::int        as cantidad
      from gastos g
     group by g.aseador_id
  ),

  -- `full outer join` y no `left join` desde los aseos: alguien puede tener
  -- gastos en el periodo sin tener ningún aseo propio en él (el suplente que
  -- compró detergente para el aseo de otra). Con un `left join` ese reembolso
  -- desaparecería sin dejar rastro, que es la forma más silenciosa de no
  -- pagarle a alguien lo que puso de su bolsillo.
  personas as (
    select coalesce(ta.aseador_id, tg.aseador_id)                      as aseador_id,
           coalesce(ta.monto, 0)::bigint                               as monto_aseos,
           coalesce(tg.monto, 0)::bigint                               as monto_gastos,
           (coalesce(ta.monto, 0) + coalesce(tg.monto, 0))::bigint     as monto_total,
           coalesce(ta.cantidad, 0)                                    as cantidad_aseos,
           coalesce(tg.cantidad, 0)                                    as cantidad_gastos
      from tot_aseos ta
      full outer join tot_gastos tg on tg.aseador_id = ta.aseador_id
  ),

  -- (4) UNA FILA DE PAGO POR PERSONA, con LAS DOS PARTIDAS POR SEPARADO más el
  -- total, los dos conteos, y EL NOMBRE COPIADO COMO TEXTO. Es D7-2 en el
  -- schema: con un total plano, el desglose no sobrevive al borrado.
  --
  -- El `coalesce` sobre el nombre no es decorativo: `cp_nombre_no_vacio` exige
  -- texto, y un perfil sin nombre haría fallar el cierre ENTERO por una fila.
  -- El pago de una persona no se puede caer porque a su perfil le falte un dato
  -- cosmético.
  pagos as (
    insert into public.cleaner_payouts
      (periodo_desde, periodo_hasta, aseador_id, aseador_nombre,
       monto_aseos, monto_gastos, monto_total, cantidad_aseos, cantidad_gastos)
    select p_desde,
           p_hasta,
           pe.aseador_id,
           coalesce(nullif(pg_catalog.btrim(pf.full_name), ''), 'Aseador sin nombre'),
           pe.monto_aseos,
           pe.monto_gastos,
           pe.monto_total,
           pe.cantidad_aseos,
           pe.cantidad_gastos
      from personas pe
      left join public.profiles pf on pf.id = pe.aseador_id
    returning id, aseador_id
  ),

  -- (5) LAS LÍNEAS DEL DESGLOSE, COPIANDO TEXTO Y NO PUNTEROS (FIN-04).
  --
  -- `cleaning_id`, `expense_id` y `property_id` se copian como IDENTIFICADORES
  -- DESNUDOS: la migración 23 los dejó SIN clave foránea a propósito, para que
  -- la purga de la Fase 9 pueda borrar el aseo sin llevarse por delante el
  -- desglose de un pago ya cobrado (y sin atascarse con un 23503). Todo lo
  -- LEGIBLE (nombre del apartamento, concepto, monto, las dos fechas, la ruta
  -- de la evidencia) va copiado como valor. Aserciones 47 a 52.
  --
  -- Las dos clases de línea se unen ANTES de numerar para que `orden` sea una
  -- secuencia contigua y estable por persona, y no dos secuencias solapadas ni
  -- una con un desplazamiento mágico. `grupo` pone los aseos antes que los
  -- gastos; dentro de cada grupo manda la fecha de ejecución, y los desempates
  -- por nombre/concepto y por identificador hacen el orden TOTAL: sin el último
  -- desempate, dos aseos del mismo apartamento el mismo día podrían alternar su
  -- orden entre dos lecturas del mismo recibo.
  lineas as (
    select a.aseador_id,
           'aseo'::text      as tipo,
           a.cleaning_id,
           null::uuid        as expense_id,
           a.property_id,
           a.property_nombre,
           null::text        as concepto,
           a.monto,
           'COP'::text       as moneda,
           a.fecha_programada,
           a.fecha_ejecucion,
           null::text        as evidencia_bucket,
           null::text        as evidencia_path,
           0                 as grupo,
           a.property_nombre as desempate_texto,
           a.cleaning_id     as desempate_id
      from aseos a
    union all
    select g.aseador_id,
           'gasto'::text,
           g.cleaning_id,
           g.expense_id,
           g.property_id,
           g.property_nombre,
           g.concepto,
           g.monto,
           g.moneda,
           g.fecha_programada,
           g.fecha_ejecucion,
           g.evidencia_bucket,
           g.evidencia_path,
           1,
           g.concepto,
           g.expense_id
      from gastos g
  ),
  lineas_escritas as (
    insert into public.cleaner_payout_lines
      (payout_id, tipo, cleaning_id, expense_id, property_id, property_nombre,
       concepto, monto, moneda, fecha_programada, fecha_ejecucion,
       evidencia_bucket, evidencia_path, orden)
    select pg.id,
           l.tipo,
           l.cleaning_id,
           l.expense_id,
           l.property_id,
           l.property_nombre,
           l.concepto,
           l.monto,
           l.moneda,
           l.fecha_programada,
           l.fecha_ejecucion,
           l.evidencia_bucket,
           l.evidencia_path,
           (row_number() over (partition by l.aseador_id
                                   order by l.grupo,
                                            l.fecha_ejecucion,
                                            l.desempate_texto,
                                            l.desempate_id))::int
      from lineas l
      join pagos pg on pg.aseador_id = l.aseador_id
    returning 1
  )
  select count(*)::int into v_pagos from pagos;

  -- ─────────────────────────────────────────────────────────────────────────
  -- (6) EL CONTADOR DE ASEOS NO COMPUTADOS (FIN-05, T-07-34)
  --
  -- Aseos GESTIONADOS cuya fecha programada cae en el rango y que al momento
  -- del cierre no llegaron a completarse. Cuesta una columna y convierte un
  -- agujero silencioso en una lista que alguien puede resolver ANTES de pagar.
  -- Sin él, el admin se entera por un reclamo.
  --
  -- `is_managed` explícito: el informativo no tiene estado (el trigger se lo
  -- deja nulo) y un contador escrito sin ese filtro le pondría al admin una
  -- alerta por un aseo que nunca fue suyo. Aserción 35.
  --
  -- DESVIACIÓN DECLARADA RESPECTO AL PLAN, y la razón: el plan decía «no
  -- estaban completados», que literalmente incluye los CANCELADOS. Se excluyen.
  -- Un aseo cancelado (una reserva que se cayó, que en 34 unidades pasa varias
  -- veces al mes) no es trabajo pendiente de resolver: ya está resuelto. Si se
  -- contaran, el número subiría todos los meses por motivos que no requieren
  -- ninguna acción, y un contador que siempre marca algo es un contador que el
  -- admin aprende a ignorar. Eso destruiría la única señal que justifica la
  -- columna.
  -- ─────────────────────────────────────────────────────────────────────────
  update public.payout_periods pp
     set aseos_no_computados = (
           select count(*)
             from public.cleanings c
            where c.is_managed
              and c.scheduled_date between p_desde and p_hasta
              and c.state not in ('completada', 'cancelada')
         )
   where pp.periodo_desde = p_desde;

  return v_pagos;
end
$fn$;

comment on function private.cerrar_periodo_core(date, date) is
  'FIN-03 / D7-2 / D7-3 / D7-8. EL ÚNICO SITIO DONDE VIVE EL CÁLCULO DEL PAGO. Vive en el esquema privado y SIN GRANT PARA NADIE: quien autoriza son las dos puertas públicas. La idempotencia es lo PRIMERO que hace: si la cabecera del periodo ya existe, sale devolviendo cero sin leer un solo aseo (D7-3, un periodo cerrado no se recalcula nunca). La pertenencia de un aseo al periodo la decide public.dia_bog(finished_at), NUNCA una conversión sin zona ni scheduled_date. Los pagos y sus líneas se escriben en UNA sentencia con CTEs que modifican datos, no en dos: en read committed, dos sentencias tomarían dos snapshots y un aseo completado entre medias entraría en el desglose sin entrar en el total. NO aplica descuentos por daños, NO aplica bonos, NO recalcula y NO escribe ninguna cifra de huésped.';

-- El núcleo NO es invocable por nadie salvo el propietario de la función y los
-- roles con privilegio de superusuario. `authenticated` y `anon` no aparecen ni
-- para revocarles algo que tuvieran: el `revoke` explícito existe porque el
-- `grant execute to public` es el DEFAULT de Postgres para toda función nueva y
-- `alter default privileges` NO puede quitárselo. T-07-32.
revoke all on function private.cerrar_periodo_core(date, date) from public, anon, authenticated;


-- ===========================================================================
-- (b) public.cerrar_periodo_si_toca() -> int — LA PUERTA DEL JOB
--
-- El camino PRIMARIO de FIN-03: «el sistema calcula», no «el admin calcula».
--
-- 364 días al año esta función no hace nada, y eso es correcto. La guarda de
-- calendario es lo primero del cuerpo.
-- ===========================================================================
create or replace function public.cerrar_periodo_si_toca()
returns int
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_hoy    date := public.today_bog();
  v_desde  date;
  v_hasta  date;
  v_pagos  int;
begin
  -- ─────────────────────────────────────────────────────────────────────────
  -- LA GUARDA DE CALENDARIO, PRIMERO Y DENTRO DE LA FUNCIÓN.
  --
  -- POR QUÉ NO VA EN LA EXPRESIÓN DEL CRON: `pg_cron` acepta el comodín de
  -- último día del mes, y está verificado que lo acepta. Es tentador y es
  -- INCORRECTO: ese comodín es el último día CALENDARIO, hábil o no, y en 8 de
  -- los 24 meses de 2026 y 2027 eso cae en sábado o domingo. El cierre se
  -- dispararía un día que nadie mira y, peor, en una fecha distinta de la que
  -- `public.ultimo_dia_habil_del_mes` le dice al aseador que cubre su recibo.
  --
  -- El coste de la alternativa son 365 consultas triviales al año.
  --
  -- `public.today_bog()` y no la fecha de la sesión: el job corre a las 04:30
  -- en tiempo universal, que son las 23:30 de Bogotá del día que se cierra. En
  -- ese instante la fecha de sesión YA ES EL DÍA SIGUIENTE, así que la guarda
  -- no se cumpliría nunca y el cierre no correría ningún mes. Es la trampa 3
  -- del encabezado, y aquí no es teórica: es el único instante del día en que
  -- el job existe.
  -- ─────────────────────────────────────────────────────────────────────────
  if v_hoy <> public.ultimo_dia_habil_del_mes(v_hoy) then
    return 0;
  end if;

  select pc.periodo_desde, pc.periodo_hasta
    into v_desde, v_hasta
    from public.periodo_de_cierre(v_hoy) pc;

  v_pagos := private.cerrar_periodo_core(v_desde, v_hasta);

  -- El resultado queda registrado por la misma vía que los jobs de sync y de
  -- avisos de este repo: el log de Postgres más el `status` y el `return_message`
  -- que `pg_cron` deja en `cron.job_run_details` (podado a 7 días por
  -- `purge-cron-history`, migración 14). Un cierre que no escribe nada tiene que
  -- ser distinguible de un cierre que no corrió.
  raise log 'cierre: periodo % .. % cerrado con % pagos', v_desde, v_hasta, v_pagos;

  return v_pagos;
end
$fn$;

comment on function public.cerrar_periodo_si_toca() is
  'FIN-03, camino PRIMARIO. El job diario la llama y 364 días al año no hace nada: la guarda de calendario es lo primero del cuerpo. La guarda vive AQUÍ y no en la expresión del cron porque el comodín de último día del mes de pg_cron es el último día CALENDARIO, y eso cae en fin de semana en 8 de los 24 meses de 2026 y 2027. Usa public.today_bog() y no la fecha de sesión: el job corre a las 23:30 de Bogotá, instante en el que la fecha universal ya es el día siguiente y la guarda no se cumpliría NUNCA. No autoriza a nadie: no tiene grant para authenticated.';

-- Esta puerta es del job, no de la aplicación: `postgres` la ejecuta desde
-- `pg_cron`, igual que `feed_health_watchdog` de la migración 14. Un admin que
-- quiera reintentar usa `public.cerrar_periodo`, que sí valida el rango.
revoke all     on function public.cerrar_periodo_si_toca() from public, anon, authenticated;
grant  execute on function public.cerrar_periodo_si_toca() to postgres;


-- ===========================================================================
-- (c) public.cerrar_periodo(date, date) -> int — LA PUERTA DEL ADMIN
--
-- EXISTE COMO CAMINO DE REINTENTO Y NO COMO CAMINO PRIMARIO, y por eso la
-- interfaz solo la ofrece cuando `public.periodo_pendiente_de_cierre()` devuelve
-- una fila (UI-SPEC §9.5). Un botón de «cerrar mes» siempre visible invita a
-- cerrar antes de tiempo, y un periodo cerrado no se vuelve a tocar.
-- ===========================================================================
create or replace function public.cerrar_periodo(
  p_desde date,
  p_hasta date
)
returns int
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_desde date;
  v_hasta date;
begin
  -- LA GUARDA DE ROL ES LA PRIMERA OPERACIÓN DEL CUERPO (T-07-31). Un RPC es un
  -- endpoint público de PostgREST: que el botón viva en el árbol de admin no
  -- autoriza nada, y una función `security definer` propiedad del superusuario
  -- salta la seguridad a nivel de fila ENTERA.
  --
  -- `private.is_admin()` consulta `profiles` EN LA BASE, nunca un claim del JWT:
  -- un admin degradado hace un minuto no puede cerrar un periodo con su token
  -- todavía vivo. Es la regla transversal del repo y el criterio 4 del ROADMAP.
  if not (select private.is_admin()) then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;

  -- ─────────────────────────────────────────────────────────────────────────
  -- EL RANGO SE NORMALIZA CONTRA EL CALENDARIO EN LA BASE, NO SE CONFIA EN EL
  -- CLIENTE (T-07-30).
  --
  -- Se le pregunta al calendario cuál es el periodo que termina en `p_hasta` y
  -- se exige que coincida ENTERO con lo recibido. Eso rechaza de un golpe un
  -- rango inventado, un rango del 1 al 31 cuando el periodo real iba del 30 de
  -- mayo al 30 de junio (D7-5), y un `p_hasta` que no sea un día de cierre.
  -- ─────────────────────────────────────────────────────────────────────────
  select pc.periodo_desde, pc.periodo_hasta
    into v_desde, v_hasta
    from public.periodo_de_cierre(p_hasta) pc;

  if v_desde is distinct from p_desde or v_hasta is distinct from p_hasta then
    -- P0001 y no 42501: aquí el admin SÍ está autorizado. Lo que falla es el
    -- rango, y la pantalla necesita poder distinguir los dos casos.
    raise exception 'periodo_invalido'
      using errcode = 'P0001',
            hint    = 'El rango no es un periodo de cierre real. Pídeselo a public.periodo_de_cierre(date) en vez de construirlo.';
  end if;

  -- Y SU DÍA DE CIERRE TIENE QUE HABER PASADO YA. Sin esta validación un admin
  -- puede cerrar un periodo por adelantado, y como un periodo cerrado no se
  -- vuelve a tocar, estaría pagando por trabajo que aún no ocurrió y
  -- congelando el error para siempre. Comparación ESTRICTA: el día del cierre
  -- todavía tiene aseos en curso, y el job los recoge esa misma noche a las
  -- 23:30. El reintento del admin es para el día siguiente en adelante.
  if p_hasta >= public.today_bog() then
    raise exception 'periodo_no_vencido'
      using errcode = 'P0001',
            hint    = 'El periodo todavía no ha terminado. Cerrarlo ahora pagaría por trabajo que aún no ocurrió, y un periodo cerrado no se recalcula.';
  end if;

  return private.cerrar_periodo_core(p_desde, p_hasta);
end
$fn$;

comment on function public.cerrar_periodo(date, date) is
  'FIN-03, camino de REINTENTO y no camino primario: el cierre lo dispara el job cerrar_periodo_si_toca(). Existe porque si el job falla el último día hábil NADIE COBRA y el admin no tendría forma de recuperarse desde la interfaz. La UI solo la ofrece cuando periodo_pendiente_de_cierre() devuelve una fila (UI-SPEC §9.5): un botón de cerrar mes siempre visible invita a cerrar antes de tiempo. Guarda de admin como primera operación (private.is_admin(), que consulta profiles en vivo y no un claim). El rango se valida contra public.periodo_de_cierre y su día de cierre tiene que haber pasado ESTRICTAMENTE: cerrar por adelantado pagaría trabajo no hecho y D7-3 congelaría el error.';

revoke all     on function public.cerrar_periodo(date, date) from public, anon;
grant  execute on function public.cerrar_periodo(date, date) to authenticated;


-- ===========================================================================
-- (d) public.periodo_pendiente_de_cierre() -> table(periodo_desde, periodo_hasta)
--
-- Lo que alimenta el aviso condicional de la pantalla de Pagos (UI-SPEC §9.5).
-- Devuelve CERO FILAS cuando todo está al día, que es el caso normal, y por eso
-- el aviso no existe en el DOM salvo cuando hace falta.
-- ===========================================================================
create or replace function public.periodo_pendiente_de_cierre()
returns table (periodo_desde date, periodo_hasta date)
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  -- Guarda de admin como primera operación, por la misma razón que en (c):
  -- esta función enseña el calendario financiero de la empresa, y un RPC es un
  -- endpoint público. T-07-31.
  if not (select private.is_admin()) then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;

  -- ─────────────────────────────────────────────────────────────────────────
  -- EL PERIODO MÁS RECIENTE CUYO DÍA DE CIERRE YA PASÓ Y QUE NO TIENE CABECERA.
  --
  -- Los candidatos se generan preguntándole al calendario por un día de cada
  -- uno de los últimos 13 meses, en vez de construir rangos a mano: D7-5 dice
  -- que el periodo va de cierre a cierre, así que el único que sabe dónde
  -- empieza junio es `public.periodo_de_cierre`. El día 15 de cada mes se elige
  -- porque nunca es un día de cierre ni el día siguiente a uno, así que siempre
  -- devuelve el periodo de SU propio mes.
  --
  -- POR QUÉ SE CORTA EN LA CABECERA MÁS RECIENTE (`periodo_desde > el último
  -- cerrado`), y es la decisión que más se nota: sin ese corte, una base recién
  -- estrenada reportaría como «pendiente» un periodo de hace un año en el que
  -- el sistema ni existía, y el aviso quedaría encendido para siempre. Con el
  -- corte, el aviso solo habla de lo que viene DESPUÉS del último cierre, que
  -- es exactamente el caso que justifica su existencia: «el job falló anoche».
  --
  -- CONSECUENCIA DECLARADA: si el cierre de julio falló y el de agosto sí
  -- corrió, julio no aparece en este aviso. No es un olvido. Reabrir un periodo
  -- anterior al último cerrado no es una operación que la interfaz ofrezca, y
  -- el camino sigue existiendo llamando a `public.cerrar_periodo` con el rango
  -- de julio. El aviso es para el hueco del final, que es el que deja a alguien
  -- sin cobrar este mes.
  --
  -- Comparación ESTRICTA con el día de hoy, igual que en (c): el día del cierre
  -- todavía no está vencido, el job lo cierra esa noche, y un aviso que apareciera
  -- esa mañana empujaría al admin a cerrar por adelantado.
  -- ─────────────────────────────────────────────────────────────────────────
  return query
  select c.periodo_desde, c.periodo_hasta
    from (
      select distinct pc.periodo_desde, pc.periodo_hasta
        from pg_catalog.generate_series(
               pg_catalog.date_trunc('month', public.today_bog()::timestamp)
                 - interval '12 months',
               pg_catalog.date_trunc('month', public.today_bog()::timestamp),
               interval '1 month') g(m)
        cross join lateral public.periodo_de_cierre((g.m + interval '14 days')::date) pc
    ) c
   where c.periodo_hasta < public.today_bog()
     and not exists (
           select 1
             from public.payout_periods pp
            where pp.periodo_desde = c.periodo_desde
         )
     and c.periodo_desde > coalesce(
           (select pg_catalog.max(pp.periodo_desde) from public.payout_periods pp),
           '-infinity'::date)
   order by c.periodo_desde desc
   limit 1;
end
$fn$;

comment on function public.periodo_pendiente_de_cierre() is
  'FIN-03. El periodo más reciente cuyo día de cierre ya pasó y que no tiene cabecera: es lo que enciende el aviso de «Cerrar el periodo ahora» de UI-SPEC §9.5. Devuelve CERO FILAS en el caso normal, y por eso el aviso no existe en el DOM salvo cuando hace falta. Solo mira lo posterior al último periodo cerrado: sin ese corte, una base recién estrenada reportaría para siempre un periodo de hace un año en el que el sistema no existía. Un hueco anterior al último cierre sigue siendo cerrable llamando a cerrar_periodo con su rango. Guarda de admin.';

revoke all     on function public.periodo_pendiente_de_cierre() from public, anon;
grant  execute on function public.periodo_pendiente_de_cierre() to authenticated;


-- ===========================================================================
-- (e) EL JOB
-- ===========================================================================
-- `cron.schedule` es un UPSERT por `jobname` (medido en la Fase 3: reagendar el
-- mismo nombre conserva el `jobid` y reemplaza `schedule` y `command`), así que
-- reaplicar esta migración no duplica nada.
--
-- ── EL HORARIO, CON LA CUENTA HECHA ───────────────────────────────────────
--
-- `30 4 * * *`. La zona de las expresiones de `pg_cron` en este stack es la
-- universal, medido, así que son las 23:30 de Bogotá. En ese instante
-- `public.today_bog()` todavía devuelve el día que se está cerrando, que es
-- justo lo que la guarda de calendario necesita. La hora límite por defecto de
-- los aseos es mucho antes (11:30), así que a esa hora ya terminaron.
--
-- Los 30 minutos no son redondos a propósito: `purge-cron-history` corre a las
-- 4:17 y `feed-health-watchdog` en punto. Nada coincide.
--
-- ── POR QUÉ DIARIO Y NO «EL ÚLTIMO DÍA DEL MES» ───────────────────────────
--
-- `pg_cron` acepta el comodín de último día del mes. Es el último día
-- CALENDARIO, hábil o no, y en 8 de los 24 meses de 2026 y 2027 eso cae en fin
-- de semana. La guarda de calendario vive DENTRO de la función (ver (b)); aquí
-- el job es diario y trivial: 364 consultas al año que no hacen nada.
-- ===========================================================================
select cron.schedule(
  'cerrar-periodo-de-pago',
  '30 4 * * *',
  $job$select public.cerrar_periodo_si_toca()$job$);
