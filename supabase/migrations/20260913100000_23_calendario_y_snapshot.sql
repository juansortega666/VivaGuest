-- ===========================================================================
-- 23 — EL CALENDARIO DEL CIERRE, EL DÍA DE NEGOCIO Y EL SNAPSHOT FINANCIERO
--
-- Primera migración de la Fase 7. Cubre FIN-03 (el cierre mensual), FIN-04 (el
-- desglose sobrevive al borrado) y FIN-05 (los informativos fuera de todo, por
-- la vía del schema: ninguna cifra de huésped entra en estas tablas).
--
-- Implementa tres decisiones del dueño del 2026-09-13, y las tres son caras de
-- cambiar después:
--
--   D7-5  El periodo de pago va DE CIERRE A CIERRE, no del 1 a fin de mes.
--         Consecuencia directa: la cabecera necesita `periodo_desde` y
--         `periodo_hasta` como dos columnas de fecha REALES desde la primera
--         migración. Un `periodo` tipo '2026-01' no puede representar un rango
--         que empieza el 30 de mayo. El research lo dice con todas las letras:
--         añadirlas después de haber cerrado meses reales es caro.
--
--   D7-6  (CORREGIDA por 07-DEFINICION §4) El recibo de un gasto dura CINCO
--         AÑOS, no los 30 días que hoy aplican a todas las fotos por igual.
--
--   D7-8  Un aseo pertenece al periodo en que SE COMPLETÓ. Como el completado
--         es un instante y el periodo son días de negocio de Bogotá, hace falta
--         una conversión explícita: `public.dia_bog`.
--
-- ── QUÉ NO HACE ESTE ARCHIVO ───────────────────────────────────────────────
--
--   * NO calcula ningún cierre. `public.cerrar_periodo` es de la migración 25
--     (plan 07-07). Aquí solo se crea DÓNDE se guarda y con QUÉ forma.
--   * NO toca los grants de `cleanings` ni de `properties`. La fuga medida de
--     la tarifa al huésped la cierra la migración 24 (plan 07-05).
--   * NO crea las funciones de lectura del aseador. Migración 27 (plan 07-09).
--
-- ── CONTRATO ───────────────────────────────────────────────────────────────
--
-- Los nombres de este archivo NO son una elección de esta migración: están
-- fijados en la cabecera de `supabase/tests/11_financiero.test.sql`, que nació
-- en rojo en la Wave 0 precisamente para eso. Si un nombre tiene que cambiar,
-- cambia ALLÍ primero y se justifica; escribir el schema y luego reescribir las
-- aserciones para que pasen invierte el sentido entero del trabajo.
--
-- ── UNA DESVIACIÓN DECLARADA RESPECTO AL RESEARCH ──────────────────────────
--
-- El research proponía DOS tablas (cabecera de pago + líneas). Aquí van TRES:
-- se añade `public.payout_periods`, una cabecera DE PERIODO por encima de la de
-- pago. Tres razones concretas, ninguna estética:
--
--   1. Un periodo se puede cerrar SIN NINGUNA aseadora con aseos (un mes sin
--      operación). Con solo dos tablas ese periodo no deja rastro, y el aviso
--      de "este periodo no se cerró" se quedaría encendido para siempre.
--   2. La idempotencia de D7-3 queda a nivel de PERIODO y no de persona. Con la
--      unicidad solo por persona, una segunda corrida en la que apareciera una
--      aseadora nueva cerraría a medias un periodo ya cerrado, que es
--      exactamente lo que D7-3 prohíbe.
--   3. El contador de aseos no computados y la autoría del cierre pertenecen al
--      periodo, no a cada pago.
--
-- ── TRES TRAMPAS DE ESTE REPO QUE MUERDEN AQUÍ, LAS TRES MEDIDAS ───────────
--
--   1. `coalesce` y `nullif` NO se califican con el esquema del catálogo: son
--      construcciones del lenguaje SQL, no funciones, y calificarlas revienta
--      con "function does not exist" en un cuerpo con el camino de búsqueda
--      vacío. `btrim`, `now` y `date_trunc` sí son funciones y sí van
--      calificadas. Es la lección de la migración 22.
--   2. La suma sobre enteros anchos devuelve el tipo de precisión arbitraria,
--      que supabase-js entrega como CADENA para no perder precisión y rompe la
--      aritmética en TypeScript en silencio ('132000' + 1 = '1320001'). Todas
--      las columnas de dinero de este archivo son `bigint`, y la aserción 30
--      del test lo comprueba contra el catálogo de tipos, no contra el valor.
--   3. El guardarraíl 4 de `scripts/ci/check-service-role.sh` prohíbe por grep
--      la función de fecha de sesión en migraciones y seeds, y el grep no
--      distingue un comentario de una línea de código. Por eso aquí se describe
--      el patrón sin escribir nunca el nombre. Ya mordió cuatro veces.
-- ===========================================================================


-- ===========================================================================
-- (a) public.ultimo_dia_habil_del_mes(date) -> date
--
-- El día en que cierra el mes que contiene el argumento: el último día del mes,
-- retrocedido al viernes si cae en sábado o en domingo.
--
-- SIN FESTIVOS, Y ES DELIBERADO. Lo decide el ROADMAP de forma explícita
-- ("último día laboral, sin festivos"). Meter aquí una librería de días hábiles
-- o una tabla de festivos colombianos introduciría el defecto en vez de
-- evitarlo: movería la fecha de cierre respecto a lo que el requisito pide, y
-- esa fecha es visible para quien cobra.
--
-- `immutable` y no `stable`: no lee el reloj, no lee ninguna tabla y no depende
-- de ninguna configuración de sesión. Depende solo de su argumento. Eso la hace
-- usable en índices y en expresiones generadas si algún día hicieran falta.
--
-- Verificada contra el cálculo POR FUERZA BRUTA (recorrer el mes día a día)
-- en los 36 meses de 2026-01 a 2028-12: aserción 2 de `11_financiero.test.sql`.
-- Una lista literal de fechas escogidas a mano habría probado que alguien supo
-- copiar un calendario, no que la forma cerrada sea correcta.
--
-- `date_part` y no la sintaxis de extracción: esa sintaxis no se puede
-- calificar por esquema, y la regla del repo es que todo nombre vaya calificado
-- en un cuerpo con el camino de búsqueda vacío. `isodow` da 6 para sábado y 7
-- para domingo, que es lo único que hace falta distinguir.
-- ---------------------------------------------------------------------------
create or replace function public.ultimo_dia_habil_del_mes(p_dia date)
returns date
language sql
immutable
set search_path = ''
as $$
  select case pg_catalog.date_part('isodow', u.d)
           when 6 then u.d - 1   -- sábado  -> viernes
           when 7 then u.d - 2   -- domingo -> viernes
           else u.d
         end
    from (
      select (pg_catalog.date_trunc('month', p_dia::timestamp)
              + interval '1 month' - interval '1 day')::date as d
    ) u
$$;

comment on function public.ultimo_dia_habil_del_mes(date) is
  'FIN-03. Día de cierre del mes que contiene el argumento: último día del mes, retrocedido al viernes si cae en fin de semana. SIN FESTIVOS, por decisión explícita del ROADMAP: añadir un calendario de festivos movería la fecha de cierre respecto a lo que el requisito pide, y esa fecha la ve quien cobra. immutable porque no lee reloj ni tablas. Verificada contra el cálculo por fuerza bruta en los 36 meses de 2026 a 2028 (aserción 2 de 11_financiero.test.sql).';

revoke all     on function public.ultimo_dia_habil_del_mes(date) from public, anon;
grant  execute on function public.ultimo_dia_habil_del_mes(date) to authenticated;


-- ===========================================================================
-- (b) public.dia_bog(timestamptz) -> date
--
-- EL ARTEFACTO MÁS DELICADO DE LA FASE. Convierte un instante al DÍA DE NEGOCIO
-- de Bogotá, con la zona explícita, antes de tomar la fecha.
--
-- POR QUÉ EXISTE, CON EL NÚMERO:
--
--   `cleanings.finished_at` es un instante (`timestamptz`) y la pertenencia a un
--   periodo de pago es una pregunta sobre DÍAS DE NEGOCIO. Tomarle la fecha sin
--   convertir la resuelve en tiempo universal, y Bogotá es UTC-5 sin horario de
--   verano: TODO aseo terminado entre las 19:00 y la medianoche de Bogotá cae en
--   el día SIGUIENTE.
--
--   Y no es un caso raro: los aseos se cierran al final de la tarde, así que
--   pasa todos los días. Lo que lo vuelve caro es cruzar un cierre de periodo.
--   Ahí el aseo se va al periodo equivocado y, como un periodo cerrado no se
--   recalcula NUNCA (D7-3), el error es PERMANENTE y le cambia el pago a una
--   persona.
--
--   El fixture del test lo ejerce por los dos lados de la medianoche: un aseo
--   terminado a las 23:30 del día del cierre (tiene que quedarse en ese periodo)
--   y otro terminado a las 00:30 del día siguiente (tiene que irse al siguiente).
--   Aserciones 8 a 12 de `11_financiero.test.sql`. Quitarle la conversión de
--   zona a esta función tiene que ponerlas en rojo: es un señuelo declarado que
--   ejerce el plan 07-14.
--
-- `stable` y no `immutable`: la conversión depende de la base de zonas horarias
-- del servidor, que es un dato externo a la función. Es la misma volatilidad
-- que declara `public.today_bog()` de la migración 01.
--
-- NO sustituye a `public.today_bog()`. Esa contesta "¿qué día es hoy en
-- Bogotá?" y sigue siendo el único helper de fecha permitido en índices,
-- policies, jobs y seeds. Esta contesta "¿a qué día de Bogotá pertenece ESTE
-- instante?", que es una pregunta distinta y la que necesita el cierre.
-- ---------------------------------------------------------------------------
create or replace function public.dia_bog(p_instante timestamptz)
returns date
language sql
stable
set search_path = ''
as $$
  select (p_instante at time zone 'America/Bogota')::date
$$;

comment on function public.dia_bog(timestamptz) is
  'D7-8. Día de negocio de Bogotá al que pertenece un instante. La conversión de zona es la razón de ser de la función: Bogotá es UTC-5 sin horario de verano, así que todo aseo terminado entre las 19:00 y la medianoche caería en el día siguiente si se resolviera la fecha sin convertir. Al cruzar un cierre eso manda el aseo al periodo equivocado y, como un periodo cerrado no se recalcula nunca (D7-3), el error es permanente y le cambia el pago a una persona. stable y no immutable porque depende de la base de zonas horarias.';

revoke all     on function public.dia_bog(timestamptz) from public, anon;
grant  execute on function public.dia_bog(timestamptz) to authenticated;


-- ===========================================================================
-- (c) public.periodo_de_cierre(date) -> table(periodo_desde, periodo_hasta)
--
-- D7-5 entero. El periodo de pago que CONTIENE el día dado:
--
--   * `periodo_hasta` es el día de cierre del mes del argumento.
--   * `periodo_desde` es el día SIGUIENTE al cierre del mes ANTERIOR.
--   * Si el día es POSTERIOR al cierre de su propio mes, el periodo que lo
--     contiene es el del mes SIGUIENTE, y entonces empieza al día siguiente del
--     cierre de su propio mes.
--
-- Esa tercera regla es la mitad del valor de D7-5: sin ella, los días entre el
-- cierre y el fin del mes calendario no pertenecerían a ningún periodo y un
-- aseo terminado ahí no lo pagaría nadie. Con ella, dos periodos consecutivos
-- son CONTIGUOS y NO SE SOLAPAN, que es lo que miden las aserciones 5, 6 y 7
-- del bloque B del test.
--
-- Ejemplo real del fixture: mayo de 2026 acaba en domingo, así que cierra el
-- viernes 29 y el periodo de junio va del 30 DE MAYO al 30 de junio. Un
-- `periodo` de tipo '2026-06' no puede representar eso, y por eso la cabecera
-- lleva dos columnas de fecha reales desde esta primera migración.
--
-- `immutable` porque solo compone llamadas a una función immutable y aritmética
-- de fechas.
-- ---------------------------------------------------------------------------
create or replace function public.periodo_de_cierre(p_dia date)
returns table (periodo_desde date, periodo_hasta date)
language sql
immutable
set search_path = ''
as $$
  with c as (
    select
      public.ultimo_dia_habil_del_mes(p_dia) as cierre_propio,
      public.ultimo_dia_habil_del_mes(
        (pg_catalog.date_trunc('month', p_dia::timestamp) - interval '1 month')::date
      ) as cierre_anterior,
      public.ultimo_dia_habil_del_mes(
        (pg_catalog.date_trunc('month', p_dia::timestamp) + interval '1 month')::date
      ) as cierre_siguiente
  )
  select
    case when p_dia <= c.cierre_propio
         then c.cierre_anterior + 1
         else c.cierre_propio + 1
    end,
    case when p_dia <= c.cierre_propio
         then c.cierre_propio
         else c.cierre_siguiente
    end
  from c
$$;

comment on function public.periodo_de_cierre(date) is
  'D7-5. Periodo de pago que contiene el día dado, de cierre a cierre y no de día 1 a fin de mes. Un día posterior al cierre de su propio mes cae en el periodo del mes siguiente: sin esa regla habría días huérfanos entre el cierre y el fin del mes calendario, y un aseo terminado ahí no lo pagaría nadie. La propiedad que garantiza es que dos periodos consecutivos son contiguos y no se solapan (aserciones 5, 6 y 7 de 11_financiero.test.sql).';

revoke all     on function public.periodo_de_cierre(date) from public, anon;
grant  execute on function public.periodo_de_cierre(date) to authenticated;


-- ===========================================================================
-- (d) La política de retención del recibo, y la clave que la parametriza
--
-- D7-6, CORREGIDA A CINCO AÑOS por 07-DEFINICION §4. El texto original de
-- D7-6 decía 6 meses; el dueño lo subió a cinco años con el cálculo delante.
--
-- POR QUÉ LA EXCEPCIÓN ES BARATA, CON LOS NÚMEROS MEDIDOS (sobre 25 aseos/día
-- y fotos de ~200 KB, que es a lo que el cliente las comprime hoy):
--
--     Fotos de checklist (~6 por aseo) ....... 879 MB/mes ... 10,3 GB/año
--     Recibos de gasto (~1 por cada 10 aseos) . 15 MB/mes ... 0,17 GB/año
--
-- Los recibos son el 1,6% del volumen: cinco años de recibos ocupan MENOS DE UN
-- GIGABYTE. Lo que llena el almacenamiento son las fotos de checklist, y esas
-- siguen con su política de 30 días sin tocar.
--
-- ESTA FUNCIÓN EXISTE PARA LA FASE 9, Y HAY QUE DECIRLO AQUÍ. La purga
-- automática la va a consumir. Si no existiera, quien escriba la purga borraría
-- los recibos a los 30 días junto con todo lo demás, sin saber que está
-- rompiendo un requisito de la Fase 7: D7-2 exige poder llegar desde cada gasto
-- del desglose a la foto que lo sustenta, y con 30 días ese enlace está roto el
-- mes siguiente al pago.
--
-- El valor va a `app_settings` y no incrustado en la función por coherencia con
-- `photo_retention_days`, `retention_months` y el resto de la familia. Los
-- respaldos en el `coalesce` no son decorativos: la función tiene que dar una
-- respuesta correcta aunque la clave falte, porque una purga que lee un nulo y
-- lo interpreta como "cero días" borra TODO.
-- ---------------------------------------------------------------------------

-- La siembra va en la MIGRACIÓN y no en `supabase/seeds/`: los archivos de seed
-- no se aplican en producción, solo las migraciones. Una clave de retención que
-- existe en local y no en la nube es peor que no tenerla, porque el respaldo del
-- `coalesce` la taparía en silencio y nadie sabría que el valor de producción no
-- se puede ajustar desde la UI del admin.
-- `do nothing` y no `do update`, igual que el seed: si alguien ya ajustó el
-- valor, una reaplicación no se lo pisa.
insert into public.app_settings (key, value) values
  -- 1825 días = 5 x 365. Fase 9 (retención): los recibos de gasto (kind='gasto')
  -- se eximen de `photo_retention_days` porque D7-2 exige que el desglose de un
  -- pago pueda abrir el respaldo del gasto, y el pago se consulta mucho después
  -- de los 30 días de la política general.
  ('expense_photo_retention_days', '1825'::jsonb)
on conflict (key) do nothing;

create or replace function public.foto_vencida(p_kind text, p_created_at timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_created_at < pg_catalog.now() - pg_catalog.make_interval(days => (
    case
      when p_kind = 'gasto' then
        coalesce(
          (select (s.value #>> '{}')::int
             from public.app_settings s
            where s.key = 'expense_photo_retention_days'),
          1825)
      else
        coalesce(
          (select (s.value #>> '{}')::int
             from public.app_settings s
            where s.key = 'photo_retention_days'),
          30)
    end))
$$;

comment on function public.foto_vencida(text, timestamptz) is
  'D7-6 corregida (07-DEFINICION §4). Dice si una foto ya venció según su clase. El recibo de gasto vive cinco años (app_settings.expense_photo_retention_days); las demás, lo que diga photo_retention_days. EXISTE PARA LA PURGA DE LA FASE 9: sin ella, la purga borraría los recibos a los 30 días sin saber que rompe D7-2, que exige poder llegar desde cada gasto del desglose a su foto. La excepción cuesta menos de 1 GB: los recibos son el 1,6% del volumen de fotos.';

revoke all     on function public.foto_vencida(text, timestamptz) from public, anon;
grant  execute on function public.foto_vencida(text, timestamptz) to authenticated;


-- ===========================================================================
-- (e) public.payout_periods — la cabecera DEL PERIODO
--
-- Una fila por periodo cerrado, EXISTA O NO algún pago debajo. Es la tabla que
-- el research no proponía y que se añade aquí a propósito (ver la desviación
-- declarada en la cabecera de este archivo).
-- ===========================================================================

create table public.payout_periods (
  -- El inicio del periodo ES la clave. No hay dos periodos que empiecen el
  -- mismo día, y usarlo como clave primaria hace que el cierre doble de D7-3 se
  -- estrelle contra un índice único en vez de contra una comprobación que
  -- alguien puede olvidar escribir.
  periodo_desde       date primary key,

  -- Las DOS fechas, reales, desde la primera migración. D7-5: el periodo va de
  -- cierre a cierre, así que no se deriva del mes calendario y no se puede
  -- reconstruir a partir de `periodo_desde` sin volver a llamar al calendario.
  periodo_hasta       date not null,

  cerrado_at          timestamptz not null default now(),

  -- `set null` y no `cascade`: si la cuenta del admin que cerró desaparece, el
  -- cierre NO puede desaparecer con ella. Mismo criterio que
  -- `access_code_reads.cleaning_id` en la migración 04.
  cerrado_por         uuid references public.profiles(id) on delete set null,

  -- Aseos GESTIONADOS del rango que al momento del cierre no estaban
  -- completados. Cuesta una columna y convierte un agujero silencioso en una
  -- lista que alguien puede resolver antes de pagar; sin él, el admin se entera
  -- por un reclamo.
  aseos_no_computados int not null default 0,

  moneda              text not null default 'COP',

  constraint pp_rango_ok    check (periodo_hasta >= periodo_desde),
  constraint pp_moneda_iso  check (moneda ~ '^[A-Z]{3}$'),
  constraint pp_no_comp_ok  check (aseos_no_computados >= 0)
);

comment on table public.payout_periods is
  'FIN-03 / D7-5. Una fila por periodo de pago cerrado. Existe aunque NINGUNA aseadora tenga aseos en el rango (un mes sin operación): con solo la tabla de pagos ese periodo no dejaría rastro y el aviso de "este periodo no se cerró" quedaría encendido para siempre. Es también donde vive la idempotencia de D7-3: la clave primaria por periodo_desde impide cerrar dos veces, incluso si en la segunda corrida apareciera una aseadora que antes no estaba.';

comment on column public.payout_periods.periodo_hasta is
  'D7-5. El periodo va de cierre a cierre, no de día 1 a fin de mes calendario, así que esta fecha NO se deriva de periodo_desde ni del mes. Guardarla es lo que permite que la pantalla del aseador diga las fechas exactas que cubre el recibo.';

comment on column public.payout_periods.cerrado_por is
  'Quién cerró. on delete SET NULL a propósito: el cierre es un hecho contable y sobrevive a la desaparición de la cuenta que lo hizo.';

comment on column public.payout_periods.aseos_no_computados is
  'FIN-05. Aseos GESTIONADOS del rango que al cerrar no estaban completados. El filtro de gestión propia tiene que ser explícito: un contador que solo mire "no completado" incluiría los informativos, que nunca tienen estado, y le pondría al admin una alerta por un aseo que nunca fue suyo.';


-- ===========================================================================
-- (f) public.cleaner_payouts — el pago de UNA persona en UN periodo
-- ===========================================================================

create table public.cleaner_payouts (
  id              uuid primary key default gen_random_uuid(),

  -- `restrict`: nadie borra un periodo que tiene pagos debajo.
  periodo_desde   date not null references public.payout_periods(periodo_desde)
                    on delete restrict,

  -- DENORMALIZACIÓN DELIBERADA. La etiqueta del periodo tiene que poder
  -- pintarse desde la fila del pago SIN un join, porque es lo que el aseador ve
  -- en su teléfono. Un recibo que dice "enero" y cubre del 1 al 30 sin decirlo
  -- es una discusión esperando a ocurrir (D7-5).
  periodo_hasta   date not null,

  -- `set null`: el nombre copiado es lo que se pinta; el puntero es una
  -- comodidad que puede desaparecer sin llevarse el pago por delante.
  aseador_id      uuid references public.profiles(id) on delete set null,
  aseador_nombre  text not null,

  -- LAS DOS PARTIDAS POR SEPARADO, ADEMÁS DEL TOTAL. Es D7-2 en el schema y no
  -- es cosmética: con un total plano no hay forma de reconstruir cuánto vino de
  -- aseos y cuánto de gastos una vez borrado el mundo vivo que lo originó.
  --
  -- `bigint` de pesos enteros. PROHIBIDOS numeric, decimal, real y double
  -- precision: supabase-js devuelve numeric como CADENA y la aritmética de
  -- TypeScript se rompe en silencio. Aserción 30 del test, contra el catálogo.
  monto_aseos     bigint not null default 0,
  monto_gastos    bigint not null default 0,
  monto_total     bigint not null default 0,

  cantidad_aseos  int not null default 0,
  cantidad_gastos int not null default 0,

  -- D7-4.2. Las dos nulas al cerrar: sirven para no pagar dos veces y para
  -- saber qué falta por pagar.
  pagado_at       timestamptz,
  pagado_por      uuid references public.profiles(id) on delete set null,

  moneda          text not null default 'COP',

  constraint cp_periodo_aseador_unico unique (periodo_desde, aseador_id),
  constraint cp_rango_ok       check (periodo_hasta >= periodo_desde),
  constraint cp_moneda_iso     check (moneda ~ '^[A-Z]{3}$'),
  constraint cp_montos_ok      check (monto_aseos >= 0 and monto_gastos >= 0
                                      and monto_total >= 0),
  constraint cp_total_cuadra   check (monto_total = monto_aseos + monto_gastos),
  constraint cp_cantidades_ok  check (cantidad_aseos >= 0 and cantidad_gastos >= 0),
  constraint cp_nombre_no_vacio check (pg_catalog.length(pg_catalog.btrim(aseador_nombre)) > 0),
  -- Quién marcó el pago solo tiene sentido si hay marca de pago.
  constraint cp_pagado_coherente check (
    (pagado_at is null and pagado_por is null)
    or (pagado_at is not null)
  )
);

comment on table public.cleaner_payouts is
  'D7-2. El pago de una aseadora en un periodo cerrado. Es un DOCUMENTO CONTABLE, no una vista sobre el mundo vivo: sus cifras no se recalculan nunca (D7-3) y sobreviven al borrado de los aseos y gastos que las originaron (FIN-04). NINGUNA columna de cifra de huésped ni de margen, y es una propiedad del schema, no de una policy: en Supabase el admin y el aseador comparten el rol de Postgres, los grants por columna no discriminan usuarios, y la única forma segura de que un aseador no lea un margen es que el margen NO ESTÉ AQUÍ.';

comment on column public.cleaner_payouts.periodo_hasta is
  'Copia deliberada de payout_periods.periodo_hasta. Existe para pintar la etiqueta del periodo desde la fila del pago sin un join: es lo que el aseador ve en el teléfono y lo que evita el recibo que dice "enero" y cubre del 1 al 30.';

comment on column public.cleaner_payouts.aseador_nombre is
  'El nombre COPIADO como texto. Es lo que se pinta; aseador_id es una comodidad que puede quedarse en nulo si la cuenta desaparece.';

comment on column public.cleaner_payouts.monto_aseos is
  'D7-2. Partida de aseos, en pesos enteros (bigint). Va separada de monto_gastos porque con un total plano el desglose no se puede reconstruir tras el borrado. numeric queda prohibido: supabase-js lo devuelve como cadena.';

comment on column public.cleaner_payouts.pagado_at is
  'D7-4.2. Nula al cerrar. Marca que el dinero ya salió: sirve para no pagar dos veces y para saber qué falta.';


-- ===========================================================================
-- (g) public.cleaner_payout_lines — EL DESGLOSE. Aquí está FIN-04.
--
-- LA PROPIEDAD CENTRAL DE ESTA TABLA ES UNA AUSENCIA: los punteros al mundo
-- vivo (`cleaning_id`, `expense_id`, `property_id`) NO TIENEN CLAVE FORÁNEA.
-- No es un olvido y no es `on delete set null`: es SIN NINGUNA.
--
-- El precedente exacto ya está en este repo, en la migración 04:
-- `access_code_reads.cleaning_id` es deliberadamente débil porque "si la purga
-- borra el aseo, el rastro de quién vio el código debe sobrevivir". Aquí el
-- criterio es el mismo y el requisito es más fuerte todavía.
--
-- Las dos direcciones del error, y las dos importan:
--
--   * Con `on delete cascade`, la purga de la Fase 9 se llevaría por delante el
--     desglose de un pago ya cobrado. Un histórico que desaparece solo no es un
--     histórico.
--   * Con `on delete restrict` (o con una FK a secas, que es restrict por
--     defecto), la purga fallaría con 23503 y NO BORRARÍA NUNCA NADA: la
--     retención de seis meses no se cumpliría jamás y nadie sabría por qué.
--     Las aserciones 47 y 51 del test ("borrar un aseo no falla", "borrar un
--     gasto no falla") están verdes HOY por ausencia de tablas y tienen que
--     seguir verdes DESPUÉS de esta migración, ahora por ausencia de cascada.
--
-- SI DENTRO DE UN AÑO ALGUIEN QUIERE "ARREGLAR" ESTE SCHEMA AÑADIENDO LAS FK:
-- no es una omisión, es el requisito. Lea FIN-04 y el criterio 4 del ROADMAP.
-- ===========================================================================

create table public.cleaner_payout_lines (
  id               uuid primary key default gen_random_uuid(),

  -- Cascada SÍ, pero solo DENTRO del snapshot: un pago y sus líneas son el
  -- mismo documento y no tiene sentido que uno viva sin el otro.
  payout_id        uuid not null references public.cleaner_payouts(id) on delete cascade,

  tipo             text not null,

  -- ── LOS TRES PUNTEROS SIN CLAVE FORÁNEA ─────────────────────────────────
  -- Ver el bloque de arriba. Son referencias de CONVENIENCIA para agrupar y
  -- para enlazar mientras la fila viva exista. Cuando la purga se la lleve, la
  -- línea sigue siendo legible por sí sola gracias al texto copiado de abajo.
  cleaning_id      uuid,
  expense_id       uuid,
  property_id      uuid,

  -- ── TODO LO LEGIBLE, COPIADO ────────────────────────────────────────────
  -- Texto, fecha y entero. Al borrarse el aseo, el desglose tiene que seguir
  -- diciendo DE QUÉ SE COMPONE. Si aquí solo quedaran identificadores, D7-2
  -- pedía desglose y habría punteros rotos.
  property_nombre  text not null,
  concepto         text,
  monto            bigint not null,
  moneda           text not null default 'COP',

  -- LAS DOS FECHAS, SIEMPRE LAS DOS. Es D7-8 en el schema: sin ellas, un aseo
  -- programado en enero que aparece en el recibo de febrero parece un error y
  -- genera exactamente la discusión que la decisión existe para evitar.
  fecha_programada date not null,
  fecha_ejecucion  date not null,

  -- La ruta de la evidencia, copiada como texto. LA FOTO NO SE COPIA:
  -- duplicarla dentro de un cupo de un gigabyte es inviable y además anularía
  -- la purga que ya existe. El enlace es válido mientras la foto viva, y por eso
  -- el recibo de gasto tiene cinco años de vida (ver `public.foto_vencida`).
  evidencia_bucket text,
  evidencia_path   text,

  orden            int not null default 0,

  constraint cpl_tipo_ok   check (tipo in ('aseo', 'gasto')),
  constraint cpl_monto_ok  check (monto >= 0),
  constraint cpl_moneda_iso check (moneda ~ '^[A-Z]{3}$'),
  constraint cpl_nombre_no_vacio
    check (pg_catalog.length(pg_catalog.btrim(property_nombre)) > 0),
  -- Una línea de aseo nombra su aseo; una de gasto nombra su gasto y trae
  -- concepto. Sin esto, una línea puede quedar sin nada que la identifique.
  constraint cpl_aseo_shape
    check (tipo <> 'aseo' or cleaning_id is not null),
  constraint cpl_gasto_shape
    check (tipo <> 'gasto'
           or (expense_id is not null
               and concepto is not null
               and pg_catalog.length(pg_catalog.btrim(concepto)) > 0)),
  -- Bucket y ruta van juntos o no van: media referencia a Storage no abre nada.
  constraint cpl_evidencia_completa
    check ((evidencia_bucket is null) = (evidencia_path is null))
);

comment on table public.cleaner_payout_lines is
  'FIN-04 / D7-2. El desglose de un pago. cleaning_id, expense_id y property_id NO tienen clave foránea, y es deliberado: con cascada la purga de la Fase 9 borraría el desglose de un pago ya cobrado, y con una FK restrictiva la purga fallaría con 23503 y no borraría nunca nada. Mismo criterio que access_code_reads.cleaning_id en la migración 04. Todo lo legible (nombre del apartamento, concepto, monto, las dos fechas) va COPIADO como texto para que la línea siga contando de qué se compone cuando el aseo ya no exista.';

comment on column public.cleaner_payout_lines.cleaning_id is
  'SIN clave foránea a propósito. NO es un olvido: si la purga borra el aseo, la línea del desglose tiene que sobrevivir (FIN-04, criterio 4 del ROADMAP), y una FK restrictiva dejaría la purga atascada para siempre. Es una referencia de conveniencia, válida mientras el aseo exista.';

comment on column public.cleaner_payout_lines.expense_id is
  'SIN clave foránea a propósito, por la misma razón que cleaning_id: el desglose es un documento contable, no una vista sobre el mundo vivo.';

comment on column public.cleaner_payout_lines.property_id is
  'SIN clave foránea a propósito. El nombre legible vive en property_nombre; este puntero solo sirve para agrupar mientras el apartamento exista.';

comment on column public.cleaner_payout_lines.property_nombre is
  'El nombre COPIADO. Es lo que se pinta en el recibo. Sin él, borrar el apartamento dejaría el desglose con identificadores sueltos apuntando a nada.';

comment on column public.cleaner_payout_lines.fecha_programada is
  'D7-8. Cuándo estaba programado el aseo. Va junto a fecha_ejecucion y nunca sola: un aseo de enero en el recibo de febrero parece un error si no se ven las dos.';

comment on column public.cleaner_payout_lines.fecha_ejecucion is
  'D7-8. Día de negocio de Bogotá en que se COMPLETÓ el aseo (public.dia_bog sobre finished_at). Es la fecha que decide a qué periodo pertenece la línea, no scheduled_date.';

comment on column public.cleaner_payout_lines.evidencia_path is
  'Ruta de la foto del recibo, copiada como texto. La FOTO no se copia: duplicarla dentro del cupo de Storage es inviable y anularía la purga. El enlace vale mientras la foto viva, que son cinco años para los recibos (public.foto_vencida).';


-- ===========================================================================
-- (h) Índices
-- ===========================================================================

-- El desglose se lee siempre completo y en orden de presentación.
create index cpl_payout_orden_idx on public.cleaner_payout_lines (payout_id, orden);

-- La pantalla del aseador pide SUS periodos cerrados, del más reciente al más
-- viejo. Sin este índice, `mis_pagos_cerrados()` (migración 27) recorre la tabla.
create index cp_aseador_periodo_idx
  on public.cleaner_payouts (aseador_id, periodo_desde desc);

-- La pantalla del cierre del admin lista todos los pagos de UN periodo. El
-- índice único (periodo_desde, aseador_id) ya sirve de prefijo, así que no se
-- crea uno redundante por periodo_desde a secas.

-- Los que quedan por pagar, que es la lista de trabajo de D7-4.2. Índice
-- parcial: las filas ya pagadas no interesan y no ocupan.
create index cp_pendientes_idx
  on public.cleaner_payouts (periodo_desde)
  where pagado_at is null;


-- ===========================================================================
-- (i) RLS, policies y grants
--
-- NINGÚN GRANT PARA `authenticated` SOBRE LAS TRES TABLAS. Todo sale por
-- función con guarda explícita de rol (migraciones 25 y 27).
--
-- El argumento es el de la migración 16, literal: en Supabase el admin y el
-- aseador comparten el rol de Postgres `authenticated`, así que "solo el admin"
-- NO EXISTE como categoría de grant. Con policies se puede separar por FILA,
-- pero no por COLUMNA, y ese es justo el defecto que la migración 24 viene a
-- cerrar en `cleanings` y `properties`. La salida aquí es doble: no meter nunca
-- cifras de huésped en estas tablas Y además servirlas por función.
--
-- Se habilita RLS igual, y se escribe una policy igual, aunque sin grant sean
-- inalcanzables:
--
--   * RLS: es la postura uniforme del repo y lo exige el guardarraíl 1 de
--     `02_guardarrailes.test.sql`. Una tabla de `public` sin RLS es una tabla
--     pública el día que alguien le añada un grant.
--   * Policy: una tabla con RLS y SIN ninguna policy devuelve todo vacío EN
--     SILENCIO, y ese silencio es justo lo que empuja a alguien a "arreglarlo"
--     desactivando la RLS o metiendo la clave de servicio en el cliente.
--     Guardarraíl 2. Con la policy escrita, el día que alguien añada el grant la
--     restricción correcta ya está puesta.
--   * `service_role`: los default privileges NO lo cubren, y el guardarraíl 7
--     exige que pueda leer TODA tabla de `public`. Sin el grant, además, el
--     worker de la purga de la Fase 9 fallaría con permiso denegado.
--
-- El `revoke` explícito se escribe aunque `alter default privileges` de la
-- migración 07 ya cubra tablas: es barato y hace que el invariante no dependa
-- de que la CLI no cambie de comportamiento. Ya cambió una vez entre la 2.115.0
-- y la 2.116.0.
--
-- No hay secuencias que revocar: las tres claves primarias son uuid, no
-- bigserial. Es lo que el guardarraíl 4b vigila y aquí no aplica por diseño.
-- ===========================================================================

alter table public.payout_periods        enable row level security;
alter table public.cleaner_payouts       enable row level security;
alter table public.cleaner_payout_lines  enable row level security;

create policy pp_admin_select on public.payout_periods
  for select to authenticated
  using ((select private.is_admin()));

create policy cp_admin_select on public.cleaner_payouts
  for select to authenticated
  using ((select private.is_admin()));

create policy cpl_admin_select on public.cleaner_payout_lines
  for select to authenticated
  using ((select private.is_admin()));

revoke all on public.payout_periods       from anon, authenticated;
revoke all on public.cleaner_payouts      from anon, authenticated;
revoke all on public.cleaner_payout_lines from anon, authenticated;

grant all on public.payout_periods       to service_role;
grant all on public.cleaner_payouts      to service_role;
grant all on public.cleaner_payout_lines to service_role;
