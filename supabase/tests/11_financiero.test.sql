-- ============================================================================
-- 11_financiero.test.sql — el contrato ejecutable de la Fase 7
--
-- NACE EN ROJO, Y ESO ES EL ÉXITO. Wave 0 del plan 07-01, igual que hizo el
-- plan 01-02 de este repo. Un `db:test` en verde al terminar 07-01 significaría
-- que estas aserciones no están midiendo nada.
--
-- ---------------------------------------------------------------------------
-- POR QUÉ ESTE ARCHIVO EXISTE, Y ES LA LECCIÓN MÁS CARA DEL REPO:
--
--   Un grant por columna, una policy o un trigger SOLO se prueban ejecutando la
--   escritura contra Postgres. El registro de push llevó semanas roto, fallando
--   siempre con 42501, con todos sus tests unitarios en verde, porque esos
--   mockean el cliente y solo comprueban la forma del objeto. Toda escritura y
--   todo grant de esta fase nacen con su aserción pgTAP, y nacen ANTES del
--   código que los satisface.
--
-- ---------------------------------------------------------------------------
-- QUÉ BLOQUE LO PONE EN VERDE:
--
--   A  siembra ................................ verde desde el primer día
--   B  calendario del cierre .................. 07-04  (migración 23)
--   C  pertenencia en hora de Bogotá .......... 07-04 + 07-07 (23 y 25)
--   D  frontera del aseador ................... 07-05 (migración 24) y 07-08
--   E  el cierre calcula lo que debe .......... 07-07 (migración 25)
--   F  idempotencia del cierre ................ 07-07 (migración 25)
--   H  informativos fuera de todo ............. 07-07 + 07-08
--   I  lo que ve el aseador ................... 07-09 (migración 27)
--   J  el recibo dura cinco años .............. 07-04 (migración 23)
--   G  supervivencia al borrado ............... 07-04 (schema) + 07-07
--   K  las dos puertas del cierre ............. 07-07  (añadido por ese plan)
--   L  las seis lecturas del admin ............ 07-08  (añadido por ese plan)
--   M  los pagos del admin y la marca ........ 07-09  (añadido por ese plan)
--   N  FIN-05 sin la red del CHECK ............. 07-14  (hallazgo del señuelo 1)
--   O  la idempotencia que nadie medía ......... 07-14  (hallazgo del señuelo 2)
--
--   A PARTIR DE QUE UN BLOQUE SE PONE EN VERDE, UN `not ok` SUYO ES UNA
--   REGRESIÓN, no un pendiente. La línea base con la que se mide: los once
--   archivos pgTAP anteriores suman 275 aserciones y las 275 están en verde.
--
-- ---------------------------------------------------------------------------
-- DOS ASERCIONES NACEN ROJAS POR UN DEFECTO VIVO, NO POR ESTAR ADELANTADAS:
--
--   Las de la sección D marcadas como FUGA MEDIDA. El Hallazgo 1 del research
--   midió que una aseadora autenticada lee `cleanings.tarifa_huesped` y
--   `properties.tarifa_huesped` por PostgREST, porque los dos grants de la
--   migración 07 son de TABLA y no por columna. Con la siembra de este archivo
--   la fuga vale 90000 pesos por apartamento, y el TAP lo va a imprimir en el
--   `have` cuando falle. Las cierra el plan 07-05.
--
-- ---------------------------------------------------------------------------
-- CONTRATO DE NOMBRES. Esto es normativo para 07-04, 07-07, 07-08 y 07-09:
-- si un nombre cambia, cambia AQUÍ primero y después en la migración.
--
--   public.ultimo_dia_habil_del_mes(date) -> date            [immutable]
--   public.dia_bog(timestamptz) -> date                      [stable]
--   public.periodo_de_cierre(date) -> table(periodo_desde date, periodo_hasta date)
--   public.foto_vencida(text, timestamptz) -> boolean
--
--   public.payout_periods
--     periodo_desde date PK · periodo_hasta date · cerrado_at timestamptz
--     cerrado_por uuid · aseos_no_computados int · moneda text
--
--   public.cleaner_payouts
--     id uuid PK · periodo_desde date · periodo_hasta date
--     aseador_id uuid · aseador_nombre text
--     monto_aseos bigint · monto_gastos bigint · monto_total bigint
--     cantidad_aseos int · cantidad_gastos int
--     pagado_at timestamptz · pagado_por uuid · moneda text
--     unique (periodo_desde, aseador_id)
--
--   public.cleaner_payout_lines
--     id uuid PK · payout_id uuid (cascade DENTRO del snapshot)
--     tipo text in ('aseo','gasto')
--     cleaning_id uuid · expense_id uuid · property_id uuid   [SIN FK, a propósito]
--     property_nombre text · concepto text · monto bigint · moneda text
--     fecha_programada date · fecha_ejecucion date
--     evidencia_bucket text · evidencia_path text · orden int
--
--   public.cerrar_periodo(date, date) -> int
--   public.rentabilidad_aseos(date, date, uuid, uuid, text)
--     -> ... property_id, property_nombre, fecha_programada, fecha_ejecucion,
--            cobrado, pagado, margen, tiene_gasto, tiene_dano
--   public.resumen_financiero(date, date)
--     -> ... aseos_hechos, aseos_con_gastos, aseos_con_danos, ...
--   public.costo_por_aseadora(date, date)
--     -> aseador_id, aseador_nombre, cantidad_aseos, total_pago, total_gastos,
--        costo_total                  [CERO columnas de cobrado y de margen]
--   public.aseos_de_aseadora(uuid, date, date)
--     -> cleaning_id, property_id, property_nombre, fecha_programada,
--        fecha_ejecucion, pago        [CERO columnas de cobrado y de margen]
--   public.gastos_de_aseadora(uuid, date, date)
--     -> expense_id, cleaning_id, property_id, property_nombre, fecha_ejecucion,
--        concepto, monto, moneda, evidencia_bucket, evidencia_path
--                                     [LA RUTA, NUNCA UNA URL]
--   public.aseo_en_curso_de_aseadora(uuid)
--     -> esta_activa, cleaning_id, property_id, property_nombre, iniciado_at
--                                     [CERO columnas de ubicación o coordenada]
--   public.tarifas_de_apartamentos(uuid[])
--   public.mis_pagos_cerrados()
--     -> payout_id, periodo_desde, periodo_hasta, monto_aseos, monto_gastos,
--        monto_total, moneda, pagado_at   [CERO columnas de cifra de huésped]
--        `payout_id` es ADICIÓN DECLARADA del plan 07-09: UI-SPEC §10.3 hace la
--        tarjeta navegable a /mis-pagos/[id] y el aseador no tiene grant sobre
--        la tabla de pagos, así que sin él el desglose sería inalcanzable.
--
--   public.periodos_de_pago()
--     -> periodo_desde, periodo_hasta, personas, monto_total, faltan_por_pagar,
--        aseos_no_computados, moneda
--   public.pagos_del_periodo(date)
--     -> payout_id, aseador_nombre, cantidad_aseos, monto_aseos, monto_gastos,
--        monto_total, moneda, pagado_at
--   public.pagos_de_aseadora(uuid)          [UN solo argumento, SIN rango]
--     -> payout_id, periodo_desde, periodo_hasta, monto_aseos, monto_gastos,
--        monto_total, moneda, pagado_at
--   public.detalle_de_pago(uuid)
--     -> LAS MISMAS NUEVE COLUMNAS que detalle_de_mi_pago, ni una más
--   public.marcar_pago_pagado(uuid)
--     -> payout_id, aseador_nombre, monto_total, moneda, pagado_at
--   public.detalle_de_mi_pago(uuid)
--     -> tipo, property_nombre, concepto, fecha_programada, fecha_ejecucion,
--        monto, moneda, evidencia_bucket, evidencia_path
--
-- ---------------------------------------------------------------------------
-- DOS TRAMPAS DE pgTAP MEDIDAS EN ESTE REPO, Y LAS DOS MUERDEN AQUÍ:
--
--   1. Una escritura dentro de la subconsulta de una aserción NO LA VE esa
--      aserción: el `select` externo lee el snapshot anterior. La escritura va
--      en su propia sentencia, antes. Costó una corrida roja en
--      `07_push.test.sql`. Aplica al bloque G.
--
--   2. Un objeto que todavía no existe aborta la TRANSACCIÓN ENTERA si se
--      nombra en SQL estático, y entonces el archivo produce UN fallo en vez de
--      cincuenta `not ok` diagnosticables. Por eso casi todas las aserciones de
--      aquí pasan por los arneses `pg_temp.escalar` / `pg_temp.valor_como` /
--      `pg_temp.intento_como`: el `execute` dinámico dentro de un bloque con
--      manejador convierte el 42P01 y el 42883 en un VALOR, y el rojo queda
--      acotado a la aserción que corresponde. Es la misma técnica con la que
--      `10_reportes.test.sql` nació en rojo en la Fase 6.
--
-- ---------------------------------------------------------------------------
-- ORDEN DE LOS BLOQUES: el bloque G va casi AL FINAL aunque su letra sea
-- anterior. G borra un aseo y un gasto de la siembra a propósito, y cualquier
-- bloque que corriera después leería un fixture mutilado y fallaría por la razón
-- equivocada. El orden real es A B C D E F H I J G K.
--
-- K es la única excepción y va DESPUÉS de G por una razón distinta: pgTAP numera
-- por orden de ejecución, y meterlo en su sitio alfabético habría corrido los
-- números de H, I, J y G, que están citados por número en este archivo y en los
-- planes 07-08, 07-09 y 07-14. Sus siete aserciones son insensibles a lo que G
-- borra: ninguna lee montos.
--
-- L SE AÑADE AL FINAL POR LA MISMA RAZÓN QUE K, y con una consecuencia que hay
-- que tener presente al leerlo: SÍ lee montos, así que sus cifras están
-- calculadas sobre el fixture YA MUTILADO por G (sin el aseo J2 y sin el gasto
-- del Detergente). La cuenta va escrita en la cabecera del bloque para que se
-- pueda auditar a mano.
--
-- REGLA PARA QUIEN AMPLÍE ESTE ARCHIVO: todo bloque nuevo va AL FINAL y sube el
-- argumento de `plan()`. Insertarlo en su sitio alfabético corre los números de
-- todo lo que venga después, y esos números están citados en los planes.
--
-- ---------------------------------------------------------------------------
-- BITÁCORA DE SEÑUELOS — 2026-09-13, plan 07-14
--
-- Una suite en verde demuestra que el código pasa los tests. NO demuestra que
-- los tests puedan fallar. Por cada garantía que la Fase 7 promete se rompió a
-- propósito la línea que la sostiene, se midió QUÉ ASERCIÓN CONCRETA se puso
-- roja, se revirtió, y se volvió a medir en verde. Todo con `npm run db:reset`
-- antes de cada corrida, sobre el árbol quieto y la base recién creada.
--
-- Esto es lo que le permite a quien toque este archivo dentro de un año saber
-- que sus aserciones son CAPACES de fallar. Si amplías el archivo, amplía
-- también esta tabla: una aserción sin señuelo corrido es una promesa sin
-- recibo.
--
--   #  QUÉ SE ROMPIÓ                              QUÉ SE PUSO ROJO
--   ─  ─────────────────────────────────────────  ──────────────────────────
--   1  migración 25: `where c.is_managed` fuera    NADA. 369/369 en verde.
--      del núcleo del cierre (las dos veces:       → HALLAZGO. Ver bloque N.
--      el cálculo y el contador)                   Con el bloque N: 96 y 97.
--
--   2  migración 25: la salida temprana            NADA. 99/99 en verde.
--      `if v_cabeceras = 0 then return 0`          → HALLAZGO. Ver bloque O.
--                                                  Con el bloque O: 100 y 101.
--
--   3  migración 23: `references ... on delete     50, 52, 82 y 92. Las cuatro
--      cascade` en `cleaning_id` y `expense_id`    de FIN-04: el desglose deja
--      de `cleaner_payout_lines`                   de sobrevivir al borrado.
--
--   4  migración 24: `tarifa_huesped` devuelta     13, y el TAP imprime la
--      al grant de columna de `cleanings`          cifra fugada: `have: 90000`.
--
--   5  migración 23: `at time zone 'America/       18 aserciones. Ver la nota
--      Bogota'` fuera de `public.dia_bog`          de abajo: es correcto.
--
--   6  migración 25: `on conflict (periodo_desde)  NO en este archivo, pero SÍ
--      do nothing` cambiado por un insert a        en `lib/domain/cierre-
--      secas                                       concurrente.integration.
--                                                  test.ts`: 3 de sus 6.
--
-- ── SEÑUELOS 1 Y 2: LOS DOS HALLAZGOS, Y POR QUÉ NO SON UN TRÁMITE ─────────
--
-- Ninguno de los dos puso NADA en rojo a la primera. No porque las líneas
-- sobren, sino porque cada garantía la sostenían DOS capas y solo una estaba
-- medida:
--
--   * FIN-05 la sostiene hoy `cl_unmanaged_is_inert` (migración 04), que impide
--     que un informativo tenga estado, aseadora o `finished_at`. Con la fila
--     inerte, el `c.state = 'completada'` ya lo deja fuera él solo e
--     `is_managed` nunca llega a decidir nada. El bloque N apaga esa capa
--     dentro de la transacción del test y deja al filtro solo.
--
--   * La idempotencia la sostiene el índice único de la cabecera, no la salida
--     temprana. Sin la salida temprana el dinero SIGUE a salvo, pero la segunda
--     corrida revienta con 23505 en vez de salir en silencio devolviendo cero,
--     y eso rompe las dos puertas. El bloque O lo mide.
--
-- Los dos hallazgos valen más que los tres señuelos que salieron a la primera:
-- eran dos filtros que nadie podía poner en rojo, o sea dos comentarios con
-- sintaxis de SQL. Ahora se pueden.
--
-- ── SEÑUELO 5: 18 ROJOS NO ES FALTA DE PRECISIÓN, ES EL RADIO REAL ────────
--
-- `public.dia_bog` es la ÚNICA conversión que decide a qué periodo pertenece un
-- aseo, así que quitarle la zona mueve UN aseo del fixture (el de las 23:30 del
-- día del cierre) de julio a agosto y con él toda la aritmética del periodo:
-- totales, desglose, KPIs y la vista del aseador. Las tres primeras rojas —8,
-- 10 y 11— SON la garantía D7-8, y la 8 es lo más estrecho que se puede
-- escribir: mide la función a solas sobre el instante frontera, con
-- `have: 2026-08-01 / want: 2026-07-31`. Las otras quince son la consecuencia,
-- y verlas es el punto: así se ve de un vistazo lo que cuesta esa línea.
--
-- ── SEÑUELO 6: LA CONCURRENCIA NO CABE EN pgTAP ───────────────────────────
--
-- pgTAP corre en una sola sesión, así que la única idempotencia que este
-- archivo puede ejercer es la SECUENCIAL. La simultánea —las dos puertas
-- disparando a la vez, que es el escenario que la garantía existe para
-- cubrir— vive en `lib/domain/cierre-concurrente.integration.test.ts`, con dos
-- procesos `psql` de verdad sincronizados por `pg_sleep_until`.
--
-- Resultado del señuelo 6, y conviene leerlo entero: quitar el `on conflict do
-- nothing` NO duplicó el pago —el índice único lo impidió, y ésa es la garantía
-- dura de D7-3— pero SÍ hizo reventar a la puerta del admin con 23505 mientras
-- la del job ganaba la carrera. Las tres aserciones de ESTADO de aquel archivo
-- siguieron en verde y las tres de COMPORTAMIENTO se pusieron rojas. Es
-- exactamente la distinción que el bloque O explica, medida esta vez con las
-- dos conexiones peleándose de verdad.
-- ---------------------------------------------------------------------------
-- ============================================================================

begin;
select plan(101);

-- ---------------------------------------------------------------------------
-- Limpieza del seed, en orden inverso de FK. El rollback la deshace.
-- ---------------------------------------------------------------------------
delete from public.cleaning_photos;
delete from public.cleaning_room_skips;
delete from public.cleaning_checklist_items;
delete from public.cleaning_state_transitions;
delete from public.access_code_reads;
delete from public.notifications;
delete from public.missing_item_lines;
delete from public.missing_item_reports;
delete from public.expenses;
delete from public.damages;
delete from public.cleanings;
delete from public.calendar_reservations;
delete from public.calendar_feeds;
delete from public.property_rooms;
delete from public.checklist_tasks;
delete from public.room_types;
delete from public.property_secrets;
delete from public.properties;
delete from public.profiles;
delete from auth.users;


-- ═══════════════════════════════════════════════════════════════════════════
-- EL ARNÉS
-- ═══════════════════════════════════════════════════════════════════════════

/**
 * Copiado LITERAL de `10_reportes.test.sql` líneas 49-68, con el mismo nombre.
 * Es el patrón de impersonación que la Fase 6 ya validó. Devuelve 'sin_error' o
 * el SQLSTATE, sin que el archivo reviente.
 */
create function pg_temp.intento_como(p_uid uuid, p_consulta text) returns text
language plpgsql as $fn$
declare
  v_estado text;
begin
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
    execute p_consulta;
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', '', true);
    return 'sin_error';
  exception when others then
    get stacked diagnostics v_estado = returned_sqlstate;
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', '', true);
    return v_estado;
  end;
end;
$fn$;

/**
 * Como el anterior, pero devuelve EL VALOR que la sesión impersonada consigue
 * leer, o 'ERROR:<sqlstate>' si no pudo. Existe por una razón de diagnóstico:
 * en las dos aserciones de la fuga medida, el TAP imprime en el `have` la cifra
 * exacta que se está escapando al teléfono de la aseadora. Con `intento_como`
 * el fallo diría solo 'sin_error', que no enseña nada.
 */
create function pg_temp.valor_como(p_uid uuid, p_consulta text) returns text
language plpgsql as $fn$
declare
  v_out    text;
  v_estado text;
begin
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
    execute p_consulta into v_out;
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', '', true);
    return coalesce(v_out, '<nulo>');
  exception when others then
    get stacked diagnostics v_estado = returned_sqlstate;
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', '', true);
    return 'ERROR:' || v_estado;
  end;
end;
$fn$;

/**
 * Lectura escalar como `postgres`, tolerante a que el objeto todavía no exista.
 * Es lo que convierte "la tabla no existe" en un `not ok` de UNA aserción en
 * vez de en un aborto del archivo entero (trampa 2 de la cabecera).
 */
create function pg_temp.escalar(p_consulta text) returns text
language plpgsql as $fn$
declare
  v_out    text;
  v_estado text;
begin
  execute p_consulta into v_out;
  return coalesce(v_out, '<nulo>');
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate;
  return 'ERROR:' || v_estado;
end;
$fn$;

/**
 * Escritura como `postgres`, tolerante. Devuelve 'sin_error' o el SQLSTATE.
 * OJO AL USARLO (trampa 1): la escritura que hace NO la ve la aserción que lo
 * invoca; la ven las sentencias POSTERIORES. Por eso en el bloque G el borrado
 * y la relectura del pago son dos sentencias distintas.
 */
create function pg_temp.correr(p_consulta text) returns text
language plpgsql as $fn$
declare
  v_estado text;
begin
  execute p_consulta;
  return 'sin_error';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate;
  return v_estado;
end;
$fn$;

/**
 * El día de cierre calculado POR FUERZA BRUTA, recorriendo el mes día a día.
 * Es el patrón oro contra el que se compara la forma cerrada de
 * `public.ultimo_dia_habil_del_mes` en los 36 meses del bloque B. Deliberadamente
 * ineficiente y deliberadamente obvio: si los dos cálculos coinciden en 36
 * meses seguidos, el de producción está bien.
 * Sin festivos, por decisión explícita del ROADMAP.
 */
create function pg_temp.cierre_ref(p_dia date) returns date
language sql stable as $fn$
  select max(g.d)::date
    from generate_series(
           date_trunc('month', p_dia)::date,
           (date_trunc('month', p_dia) + interval '1 month - 1 day')::date,
           interval '1 day') g(d)
   where extract(isodow from g.d) < 6;
$fn$;


-- ═══════════════════════════════════════════════════════════════════════════
-- A. LA SIEMBRA DEL ESCENARIO FINANCIERO (1 aserción)
--
-- Las fechas son fijas y de 2026 a propósito: el cierre de un periodo solo se
-- puede pedir cuando su día de cierre YA PASÓ, así que el escenario vive en
-- julio y agosto de 2026 y el archivo sigue siendo válido corriéndolo en
-- cualquier momento posterior.
--
--   Cierre de mayo 2026 ....... 2026-05-29  (el 31 cae en domingo)
--   Cierre de junio 2026 ...... 2026-06-30
--   Cierre de julio 2026 ...... 2026-07-31  (viernes)
--   Cierre de agosto 2026 ..... 2026-08-31
--
--   Periodo de JULIO  = 2026-07-01 .. 2026-07-31
--   Periodo de AGOSTO = 2026-08-01 .. 2026-08-31
--   Periodo de JUNIO  = 2026-05-30 .. 2026-06-30   <- no empieza el día 1
-- ═══════════════════════════════════════════════════════════════════════════

insert into auth.users (id, email) values
  ('ad700000-0000-0000-0000-000000000001', 'admin7@vg.co'),
  ('a7000000-0000-0000-0000-00000000000a', 'aseadora7-a@vg.co'),
  ('a7000000-0000-0000-0000-00000000000b', 'aseadora7-b@vg.co'),
  ('a7000000-0000-0000-0000-00000000000c', 'aseadora7-baja@vg.co');

-- `deactivated_at` no es opcional cuando `is_active` es falso: lo impone
-- `profiles_deactivation_coherent`.
insert into public.profiles (id, role, full_name, is_active, deactivated_at) values
  ('ad700000-0000-0000-0000-000000000001', 'admin',   'Admin 7',            true,  null),
  ('a7000000-0000-0000-0000-00000000000a', 'aseador', 'Aseadora 7A',        true,  null),
  ('a7000000-0000-0000-0000-00000000000b', 'aseador', 'Aseadora 7B',        true,  null),
  ('a7000000-0000-0000-0000-00000000000c', 'aseador', 'Aseadora 7C DE BAJA', false, now())
on conflict (id) do update
  set role           = excluded.role,
      full_name      = excluded.full_name,
      is_active      = excluded.is_active,
      deactivated_at = excluded.deactivated_at;

-- Dos apartamentos gestionados con tarifas DISTINTAS (para que un total mal
-- agrupado no cuadre por casualidad) y uno de gestión externa, que es contra
-- lo que se mide FIN-05.
insert into public.properties
  (id, nombre, cluster, gestion_vivaguest, hora_limite,
   tarifa_huesped, pago_aseador, responsable_id, contacto_externo, is_active) values
  ('b7000000-0000-0000-0000-000000000001', 'Apto 7A (fixture)', 'Cluster 7',
   true,  '11:30',  90000::bigint, 40000::bigint,
   'a7000000-0000-0000-0000-00000000000a', null, true),
  ('b7000000-0000-0000-0000-000000000002', 'Apto 7B (fixture)', 'Cluster 7',
   true,  '10:00', 150000::bigint, 55000::bigint,
   'a7000000-0000-0000-0000-00000000000b', null, true),
  -- Gestión externa: sin tarifas y sin responsable. `props_active_requires_rates`
  -- y `props_active_requires_owner` solo aplican a las gestionadas, así que
  -- esta unidad puede estar activa y seguir siendo inerte.
  ('b7000000-0000-0000-0000-000000000003', 'Apto 7X EXTERNO',   'Cluster 7',
   false, '11:30', null, null, null, 'Administra Doña Rosa', true);

-- ---------------------------------------------------------------------------
-- Los aseos. `state = 'completada'` directo en el INSERT es legal: la guarda de
-- transiciones de `tg_cleanings_snapshot()` solo corre en UPDATE, y el CHECK
-- `cl_completada_shape` exige `started_at`, `finished_at` y que el segundo no
-- sea anterior al primero. Se respetan los tres.
--
-- Las tarifas NO se pasan: las copia el trigger desde el apartamento (FIN-01).
-- ---------------------------------------------------------------------------
insert into public.cleanings
  (id, property_id, scheduled_date, tipo, origin, aseador_id, confirmado_at,
   state, started_at, finished_at) values

  -- J1 — fecha programada y fecha de ejecución DISTINTAS a propósito: es lo
  --      único que demuestra que el desglose guarda dos columnas de verdad y no
  --      la misma fecha dos veces (D7-8).
  ('f7000000-0000-0000-0000-000000000101', 'b7000000-0000-0000-0000-000000000001',
   date '2026-07-09', 'normal', 'manual', 'a7000000-0000-0000-0000-00000000000a', now(),
   'completada',
   (timestamp '2026-07-10 08:00') at time zone 'America/Bogota',
   (timestamp '2026-07-10 14:00') at time zone 'America/Bogota'),

  -- J2 — el que se borra a mano en el bloque G.
  ('f7000000-0000-0000-0000-000000000102', 'b7000000-0000-0000-0000-000000000001',
   date '2026-07-20', 'normal', 'manual', 'a7000000-0000-0000-0000-00000000000a', now(),
   'completada',
   (timestamp '2026-07-20 08:00') at time zone 'America/Bogota',
   (timestamp '2026-07-20 14:00') at time zone 'America/Bogota'),

  -- J3 — de la otra aseadora, en el otro apartamento. Existe para que un
  --      agrupamiento mal escrito sume las dos personas en una sola fila.
  ('f7000000-0000-0000-0000-000000000103', 'b7000000-0000-0000-0000-000000000002',
   date '2026-07-15', 'normal', 'manual', 'a7000000-0000-0000-0000-00000000000b', now(),
   'completada',
   (timestamp '2026-07-15 08:00') at time zone 'America/Bogota',
   (timestamp '2026-07-15 14:00') at time zone 'America/Bogota'),

  -- JB — LA FRONTERA. Terminado a las 23:30 de Bogotá DEL DÍA DEL CIERRE.
  --      En tiempo universal ese instante ya es 2026-08-01 04:30, así que una
  --      conversión a día hecha sin zona lo manda al periodo de agosto. Como un
  --      periodo cerrado no se recalcula nunca (D7-3), ese error sería
  --      permanente y le cambiaría el pago a una persona.
  ('f7000000-0000-0000-0000-000000000104', 'b7000000-0000-0000-0000-000000000001',
   date '2026-07-31', 'normal', 'manual', 'a7000000-0000-0000-0000-00000000000a', now(),
   'completada',
   (timestamp '2026-07-31 20:00') at time zone 'America/Bogota',
   (timestamp '2026-07-31 23:30') at time zone 'America/Bogota'),

  -- A1 — el complemento. EMPIEZA el 31 de julio a las 23:50 y TERMINA el 1 de
  --      agosto a las 00:30, las dos horas de Bogotá. Pertenece a AGOSTO, porque
  --      D7-8 dice que un aseo pertenece al periodo en que SE COMPLETÓ, no en el
  --      que empezó ni en el que estaba programado.
  ('f7000000-0000-0000-0000-000000000201', 'b7000000-0000-0000-0000-000000000001',
   date '2026-08-01', 'normal', 'manual', 'a7000000-0000-0000-0000-00000000000a', now(),
   'completada',
   (timestamp '2026-07-31 23:50') at time zone 'America/Bogota',
   (timestamp '2026-08-01 00:30') at time zone 'America/Bogota'),

  -- SC — un aseo completado en el periodo EN CURSO, que nadie ha cerrado ni
  --      puede cerrar todavía. Es contra lo que se mide D7-4: el aseador NO ve
  --      el periodo en curso. Va con fecha relativa para que siga siendo "el
  --      periodo en curso" el día que alguien corra esto en 2027.
  ('f7000000-0000-0000-0000-000000000301', 'b7000000-0000-0000-0000-000000000001',
   public.today_bog() - 3, 'normal', 'manual', 'a7000000-0000-0000-0000-00000000000a', now(),
   'completada',
   ((public.today_bog() - 3)::text || ' 08:00')::timestamp at time zone 'America/Bogota',
   ((public.today_bog() - 3)::text || ' 14:00')::timestamp at time zone 'America/Bogota'),

  -- VD — el aseo VIVO de hoy de la aseadora 7A. Es el que la mete en la ventana
  --      de `private.my_cleaning_ids()` y a su apartamento en la de
  --      `private.my_property_ids()`, que es la superficie exacta del Hallazgo 1.
  ('f7000000-0000-0000-0000-000000000302', 'b7000000-0000-0000-0000-000000000001',
   public.today_bog(), 'normal', 'manual', 'a7000000-0000-0000-0000-00000000000a', now(),
   'pendiente', null, null),

  -- JP — gestionado, dentro del periodo de julio, y SIN completar. Es el que
  --      alimenta el contador de aseos no computados de la cabecera del periodo.
  ('f7000000-0000-0000-0000-000000000106', 'b7000000-0000-0000-0000-000000000002',
   date '2026-07-25', 'normal', 'manual', null, null,
   'pendiente', null, null);

-- JX — informativo. Va en su propio INSERT porque `cl_unmanaged_is_inert` exige
--      que TODO lo demás sea nulo, y el trigger le pone `state = null`.
insert into public.cleanings
  (id, property_id, scheduled_date, tipo, origin) values
  ('f7000000-0000-0000-0000-000000000105', 'b7000000-0000-0000-0000-000000000003',
   date '2026-07-12', 'normal', 'manual');

-- ---------------------------------------------------------------------------
-- Gastos. Uno por aseadora, en periodos distintos de apartamento, con montos
-- distintos entre sí y distintos de los pagos, para que ninguna suma cuadre por
-- coincidencia.
-- ---------------------------------------------------------------------------
insert into public.expenses
  (id, cleaning_id, property_id, concepto, monto, moneda, reported_by) values
  ('e7000000-0000-0000-0000-000000000001', 'f7000000-0000-0000-0000-000000000101',
   'b7000000-0000-0000-0000-000000000001', 'Detergente', 12000::bigint, 'COP',
   'a7000000-0000-0000-0000-00000000000a'),
  ('e7000000-0000-0000-0000-000000000002', 'f7000000-0000-0000-0000-000000000103',
   'b7000000-0000-0000-0000-000000000002', 'Bolsas de basura', 8000::bigint, 'COP',
   'a7000000-0000-0000-0000-00000000000b');

-- La foto del recibo del gasto. D7-2 exige poder llegar desde cada gasto a la
-- evidencia que lo sustenta, y D7-6 corregida le da cinco años de vida. La ruta
-- sigue la convención {cleaning_id}/{kind}/{uuid}.{ext}, que es lo que las
-- policies de Storage autorizan.
insert into public.cleaning_photos
  (id, cleaning_id, kind, expense_id, storage_bucket, storage_path,
   mime_type, bytes, uploaded_by) values
  ('c7000000-0000-0000-0000-000000000001', 'f7000000-0000-0000-0000-000000000101',
   'gasto', 'e7000000-0000-0000-0000-000000000001', 'evidencia',
   'f7000000-0000-0000-0000-000000000101/gasto/c7000000-0000-0000-0000-000000000001.jpg',
   'image/jpeg', 148231, 'a7000000-0000-0000-0000-00000000000a');

-- Un daño, para el conteo del bloque 2 del Resumen.
insert into public.damages
  (id, cleaning_id, property_id, descripcion, reported_by) values
  ('da700000-0000-0000-0000-000000000001', 'f7000000-0000-0000-0000-000000000103',
   'b7000000-0000-0000-0000-000000000002', 'Rejilla del sifon partida',
   'a7000000-0000-0000-0000-00000000000b');


-- 1  La siembra es lo que el resto del archivo asume. Esta aserción está VERDE
--    desde el primer día y ese es su trabajo: demuestra que el arnés funciona y
--    que el rojo de más abajo es del schema que falta, no del fixture.
--    6 completados gestionados = J1 J2 J3 JB A1 SC · 1 informativo = JX
--    · 20000 en gastos = 12000 + 8000.
select is(
  pg_temp.escalar($q$
    select (select count(*) from public.cleanings
             where is_managed and state = 'completada')::text
        || '|' || (select count(*) from public.cleanings where not is_managed)::text
        || '|' || (select sum(e.monto) from public.expenses e)::text
  $q$),
  '6|1|20000',
  'siembra: seis aseos completados gestionados, uno informativo y veinte mil pesos en gastos');


-- ═══════════════════════════════════════════════════════════════════════════
-- B. EL CALENDARIO DEL CIERRE (FIN-03, D7-5) — 6 aserciones
--    Lo pone en verde: 07-04, migración 23.
-- ═══════════════════════════════════════════════════════════════════════════

-- 2  Los 36 meses de 2026-01 a 2028-12, contra el recorrido día a día del mes.
--    UNA aserción y no treinta y seis casos escogidos a mano: una lista literal
--    de fechas prueba que alguien supo copiar un calendario, no que la forma
--    cerrada sea correcta. El resultado se escribe como coincidencias/total para
--    que una función que devuelva nulo dé '0/36' y no pase por vacuidad.
select is(
  pg_temp.escalar($q$
    select count(*) filter (
             where public.ultimo_dia_habil_del_mes(g.m::date) = pg_temp.cierre_ref(g.m::date)
           )::text || '/' || count(*)::text
      from generate_series(date '2026-01-01', date '2028-12-01', interval '1 month') g(m)
  $q$),
  '36/36',
  'FIN-03 el dia de cierre coincide con el calculo por fuerza bruta en los 36 meses de 2026 a 2028');

-- 3  Un mes que NO termina en fin de semana: julio de 2026 acaba el viernes 31,
--    así que su periodo va del 1 al 31.
select is(
  pg_temp.escalar($q$
    select p.periodo_desde::text || '..' || p.periodo_hasta::text
      from public.periodo_de_cierre(date '2026-07-15') p
  $q$),
  '2026-07-01..2026-07-31',
  'D7-5 un mes que termina en dia habil: el periodo de julio va del 1 al 31');

-- 4  Un mes cuyo mes ANTERIOR termina en fin de semana: mayo de 2026 acaba en
--    domingo, así que cierra el viernes 29 y el periodo de junio empieza el 30
--    de MAYO. Esto es D7-5 entero: el periodo va de cierre a cierre y NO del
--    día 1 a fin de mes calendario.
select is(
  pg_temp.escalar($q$
    select p.periodo_desde::text || '..' || p.periodo_hasta::text
      from public.periodo_de_cierre(date '2026-06-15') p
  $q$),
  '2026-05-30..2026-06-30',
  'D7-5 un mes que sigue a un cierre en fin de semana: el periodo de junio empieza el 30 de mayo');

-- 5  Contigüidad mayo -> junio: el inicio del segundo es el fin del primero más
--    un día. Es la mitad del valor de D7-8: si no son contiguos, hay días en los
--    que un aseo terminado no pertenece a ningún periodo y nadie lo paga.
select is(
  pg_temp.escalar($q$
    select case
             when (select periodo_desde from public.periodo_de_cierre(date '2026-06-15'))
                = (select periodo_hasta from public.periodo_de_cierre(date '2026-05-15')) + 1
             then 'contiguo' else 'HUECO' end
  $q$),
  'contiguo',
  'D7-8 los periodos de mayo y junio son contiguos: no hay dias huerfanos entre ellos');

-- 6  Y no se solapan, mirado desde el otro lado: julio -> agosto.
select is(
  pg_temp.escalar($q$
    select case
             when (select periodo_desde from public.periodo_de_cierre(date '2026-08-15'))
                = (select periodo_hasta from public.periodo_de_cierre(date '2026-07-15')) + 1
             then 'contiguo' else 'SOLAPADO' end
  $q$),
  'contiguo',
  'D7-8 los periodos de julio y agosto son contiguos y no se solapan');

-- 7  Un día POSTERIOR al cierre de su propio mes cae en el periodo del mes
--    SIGUIENTE. El 30 de mayo de 2026 es el día después del cierre de mayo, y
--    pertenece al periodo de junio. Sin esta regla, los días entre el cierre y
--    el fin de mes calendario no pertenecerían a ningún periodo, que es
--    exactamente el agujero que D7-5 existe para cerrar.
select is(
  pg_temp.escalar($q$
    select p.periodo_desde::text || '..' || p.periodo_hasta::text
      from public.periodo_de_cierre(date '2026-05-30') p
  $q$),
  '2026-05-30..2026-06-30',
  'D7-5 un dia posterior al cierre de su mes pertenece al periodo del mes siguiente');


-- ═══════════════════════════════════════════════════════════════════════════
-- SE CIERRAN LOS DOS PERIODOS. Es una ESCRITURA, y va en sus propias
-- sentencias: lo que se escriba aquí no lo vería una aserción que lo invocara
-- en la misma sentencia (trampa 1 de la cabecera).
--
-- El periodo EN CURSO no se cierra, ni se puede: su día de cierre no ha pasado.
-- Esa ausencia es el fixture del bloque I.
--
-- ---------------------------------------------------------------------------
-- EL CIERRE SE INVOCA CON UNA SESIÓN DE ADMIN, NO COMO `postgres`.
--
-- CORREGIDO EN EL PLAN 07-07. La Wave 0 escribió estas cinco invocaciones con
-- `pg_temp.correr`, que ejecuta como `postgres` y SIN claims de JWT. Contra eso,
-- `public.cerrar_periodo` responde 42501 y no escribe nada: su primera operación
-- es `private.is_admin()`, que resuelve `auth.uid()` contra `profiles`, y sin
-- claims `auth.uid()` es nulo. Los bloques E, F, G y H se habrían quedado en rojo
-- para siempre por el arnés, no por el código.
--
-- LA GUARDA NO SE RELAJA PARA QUE ESTO PASE, Y ES DELIBERADO. Aflojarla a «o es
-- admin o no hay sesión» dejaría entrar a la CLAVE DE SERVICIO, que tampoco tiene
-- `auth.uid()`. `e2e/fixtures.ts` documenta y depende del comportamiento
-- contrario: siembra el cierre abriendo una sesión de admin de verdad
-- precisamente porque la clave de servicio no pasa la guarda.
--
-- Cambiar el arnés en vez de la guarda además FORTALECE el archivo: a partir de
-- aquí, los bloques E, F, G y H prueban el cierre por el camino REAL de
-- producción (un admin autenticado invocando el RPC), no por un atajo de
-- superusuario que ningún cliente puede tomar.
-- ---------------------------------------------------------------------------

select pg_temp.intento_como('ad700000-0000-0000-0000-000000000001',
  $q$select public.cerrar_periodo(date '2026-07-01', date '2026-07-31')$q$)
  as cierre_julio \gset
select pg_temp.intento_como('ad700000-0000-0000-0000-000000000001',
  $q$select public.cerrar_periodo(date '2026-08-01', date '2026-08-31')$q$)
  as cierre_agosto \gset


-- ═══════════════════════════════════════════════════════════════════════════
-- C. LA PERTENENCIA AL PERIODO SE DECIDE EN HORA DE BOGOTÁ (D7-8) — 5 aserciones
--
--    ESTE ES EL BLOQUE QUE MÁS VALE DEL ARCHIVO. `finished_at` es un instante y
--    la pertenencia a un periodo es una pregunta sobre días de negocio. Tomarle
--    la fecha sin convertir la resuelve en tiempo universal, y TODO aseo
--    terminado entre las 19:00 y la medianoche de Bogotá se va al día siguiente.
--    Con aseos que se cierran al final de la tarde eso no es un caso raro: es
--    todos los días. Al cruzar un cierre, ese aseo cae en el periodo equivocado,
--    y como un periodo cerrado no se recalcula nunca (D7-3) el error es
--    permanente y le cambia el pago a una persona.
--
--    SEÑUELO DECLARADO: quitarle la conversión de zona a `public.dia_bog` tiene
--    que poner estas cinco en rojo. Se ejerce en el plan 07-14.
--
--    Lo pone en verde: 07-04 (la función) y 07-07 (que la use al cerrar).
-- ═══════════════════════════════════════════════════════════════════════════

-- 8  Las 23:30 de Bogotá del día del cierre son, en tiempo universal, las 04:30
--    del día siguiente. El día de negocio sigue siendo el 31 de julio.
select is(
  pg_temp.escalar($q$
    select public.dia_bog((timestamp '2026-07-31 23:30') at time zone 'America/Bogota')::text
  $q$),
  '2026-07-31',
  'D7-8 las 23:30 de Bogota del dia del cierre siguen siendo ese dia de negocio y no el siguiente');

-- 9  Y su complemento por el otro lado de la medianoche.
select is(
  pg_temp.escalar($q$
    select public.dia_bog((timestamp '2026-08-01 00:30') at time zone 'America/Bogota')::text
  $q$),
  '2026-08-01',
  'D7-8 las 00:30 de Bogota del dia siguiente al cierre son ya el dia siguiente');

-- 10 JB, terminado a las 23:30 del día del cierre, tiene línea en el periodo de
--    JULIO.
select is(
  pg_temp.escalar($q$
    select count(*)::text
      from public.cleaner_payout_lines l
      join public.cleaner_payouts p on p.id = l.payout_id
     where l.cleaning_id = 'f7000000-0000-0000-0000-000000000104'
       and p.periodo_desde = date '2026-07-01'
  $q$),
  '1',
  'D7-8 el aseo terminado a las 23:30 del dia del cierre se paga en ESE periodo');

-- 11 Y NO tiene línea en el de agosto. Sin esta, un cálculo que metiera el aseo
--    en los dos periodos pasaría la aserción anterior y pagaría dos veces.
select is(
  pg_temp.escalar($q$
    select count(*)::text
      from public.cleaner_payout_lines l
      join public.cleaner_payouts p on p.id = l.payout_id
     where l.cleaning_id = 'f7000000-0000-0000-0000-000000000104'
       and p.periodo_desde = date '2026-08-01'
  $q$),
  '0',
  'D7-8 y ese mismo aseo NO aparece tambien en el periodo siguiente');

-- 12 A1 EMPEZÓ el 31 de julio a las 23:50 y TERMINÓ el 1 de agosto a las 00:30.
--    Pertenece a AGOSTO: D7-8 dice que un aseo pertenece al periodo en que se
--    COMPLETÓ, no al que estaba programado ni a aquel en que empezó.
select is(
  pg_temp.escalar($q$
    select count(*)::text
      from public.cleaner_payout_lines l
      join public.cleaner_payouts p on p.id = l.payout_id
     where l.cleaning_id = 'f7000000-0000-0000-0000-000000000201'
       and p.periodo_desde = date '2026-08-01'
  $q$),
  '1',
  'D7-8 un aseo que empieza antes del cierre y termina despues se paga en el periodo SIGUIENTE');


-- ═══════════════════════════════════════════════════════════════════════════
-- D. LA FRONTERA DEL ASEADORA, POR LAS DOS VÍAS DEL HALLAZGO 1 (D7-7) — 10 aserciones
--
--    Cita literal del dueño: "no, la aseadora no debe saber nada de nuestros
--    cobros". Se cierran LAS DOS superficies medidas, no solo la barata.
--
--    Lo pone en verde: 07-05 (migración 24, los grants por columna y la vía del
--    admin) y 07-08 (las dos funciones de lectura con guarda).
-- ═══════════════════════════════════════════════════════════════════════════

-- 13 y 14: FUGA MEDIDA. ESTAS DOS FALLAN HOY CONTRA `main` POR UN DEFECTO VIVO,
--          NO POR ESTAR ADELANTADAS.
--
--    La migración 07 otorga `select` de TABLA sobre `cleanings` y sobre
--    `properties` al rol `authenticated`, y en Supabase el admin y la aseadora
--    COMPARTEN ese rol de Postgres. La policy acota las FILAS que ve cada
--    quien, pero no las COLUMNAS: dentro de su propia ventana, la aseadora lee
--    la tarifa que se le cobra al huésped por las dos vías.
--
--    Con esta siembra la fuga vale 90000 pesos, y el arnés `valor_como` está
--    puesto justo para que el TAP lo imprima en el `have` cuando falle. El
--    plan 07-05 revoca el grant de tabla y otorga por columna enumerada; a
--    partir de ahí la lectura devuelve 42501 y estas dos se ponen en verde.

-- 13
select is(
  pg_temp.valor_como('a7000000-0000-0000-0000-00000000000a',
    $q$select max(c.tarifa_huesped)::text from public.cleanings c$q$),
  'ERROR:42501',
  'D7-7 FUGA: una aseadora NO puede leer cleanings.tarifa_huesped por PostgREST');

-- 14
select is(
  pg_temp.valor_como('a7000000-0000-0000-0000-00000000000a',
    $q$select max(p.tarifa_huesped)::text from public.properties p$q$),
  'ERROR:42501',
  'D7-7 FUGA: una aseadora NO puede leer properties.tarifa_huesped en su ventana');

-- 15 y 16: EL COMPLEMENTO QUE IMPIDE CERRAR LA PUERTA TUMBANDO LA CASA.
--    La aseadora SIGUE leyendo todo lo que su PWA necesita. Sin estas dos, el
--    plan 07-05 podría "pasar" revocando el grant entero y dejando la app del
--    aseador sin datos, que es la forma más fácil de aprobar una aserción de
--    seguridad rompiendo el producto.

-- 15
select is(
  pg_temp.valor_como('a7000000-0000-0000-0000-00000000000a',
    $q$select p.nombre || '|' || p.cluster || '|' || p.hora_limite::text
         from public.properties p
        where p.id = 'b7000000-0000-0000-0000-000000000001'$q$),
  'Apto 7A (fixture)|Cluster 7|11:30:00',
  'D7-7 la aseadora SI sigue leyendo nombre, cluster y hora limite de su apartamento');

-- 16
select is(
  pg_temp.valor_como('a7000000-0000-0000-0000-00000000000a',
    $q$select c.scheduled_date::text || '|' || c.state::text
         || '|' || coalesce(c.num_huespedes::text, '<nulo>')
         || '|' || coalesce(c.instrucciones, '<nulo>')
         from public.cleanings c
        where c.id = 'f7000000-0000-0000-0000-000000000302'$q$),
  public.today_bog()::text || '|pendiente|<nulo>|<nulo>',
  'D7-7 la aseadora SI sigue leyendo fecha, estado, numero de huespedes e instrucciones de su aseo');

-- 17, 18, 19: las tres vías de función. Una función `security definer` propiedad
--    del superusuario SALTA la seguridad a nivel de fila entera, así que sin
--    guarda de rol en la primera línea del cuerpo le entrega el catálogo de
--    márgenes a cualquiera. Es la lección que la migración 16 ya escribió.
--    Hoy las tres devuelven 42883 (la función no existe): rojo correcto.

select is(
  pg_temp.intento_como('a7000000-0000-0000-0000-00000000000a',
    $q$select * from public.rentabilidad_aseos(
         date '2026-07-01', date '2026-07-31', null::uuid, null::uuid, 'todos')$q$),
  '42501',
  'FIN-02 una aseadora que llama a rentabilidad_aseos recibe 42501');

select is(
  pg_temp.intento_como('a7000000-0000-0000-0000-00000000000a',
    $q$select * from public.resumen_financiero(date '2026-07-01', date '2026-07-31')$q$),
  '42501',
  'D7-7 una aseadora que llama a resumen_financiero recibe 42501');

select is(
  pg_temp.intento_como('a7000000-0000-0000-0000-00000000000a',
    $q$select * from public.tarifas_de_apartamentos(null::uuid[])$q$),
  '42501',
  'D7-7 una aseadora que llama a tarifas_de_apartamentos recibe 42501');

-- 20, 21, 22: y el admin SÍ obtiene fila de las tres. Una guarda escrita al
--    revés (que deniegue a todo el mundo) pasaría las tres anteriores.

select is(
  pg_temp.valor_como('ad700000-0000-0000-0000-000000000001',
    $q$select (count(*) > 0)::text from public.rentabilidad_aseos(
         date '2026-07-01', date '2026-07-31', null::uuid, null::uuid, 'todos')$q$),
  'true',
  'FIN-02 el admin SI obtiene filas de rentabilidad_aseos');

select is(
  pg_temp.valor_como('ad700000-0000-0000-0000-000000000001',
    $q$select (count(*) > 0)::text
         from public.resumen_financiero(date '2026-07-01', date '2026-07-31')$q$),
  'true',
  'FIN-02 el admin SI obtiene fila de resumen_financiero');

select is(
  pg_temp.valor_como('ad700000-0000-0000-0000-000000000001',
    $q$select (count(*) > 0)::text from public.tarifas_de_apartamentos(null::uuid[])$q$),
  'true',
  'D7-7 el admin SI obtiene filas de tarifas_de_apartamentos, que es su via propia');


-- ═══════════════════════════════════════════════════════════════════════════
-- E. EL CIERRE CALCULA LO QUE DEBE (FIN-03, D7-2) — 8 aserciones
--
--    La cuenta, escrita para que se pueda auditar a mano:
--      Aseadora 7A: J1 + J2 + JB = 3 x 40000 = 120000 en aseos
--                   G1 = 12000 en gastos            -> total 132000
--      Aseadora 7B: J3 = 55000 en aseos
--                   G2 = 8000 en gastos             -> total  63000
--    Los montos son distintos entre sí a propósito: con 40000 y 40000 una suma
--    mal agrupada cuadraría por casualidad.
--
--    Lo pone en verde: 07-07, migración 25.
-- ═══════════════════════════════════════════════════════════════════════════

-- 23
select is(
  pg_temp.escalar($q$
    select count(*)::text from public.payout_periods
     where periodo_desde = date '2026-07-01' and periodo_hasta = date '2026-07-31'
  $q$),
  '1',
  'FIN-03 el cierre deja UNA cabecera de periodo con sus dos fechas reales');

-- 24 Una fila de pago por cada aseadora con aseos completados en el rango, y NO
--    una por cada aseadora del sistema: la 7C está de baja y no trabajó.
select is(
  pg_temp.escalar($q$
    select string_agg(p.aseador_nombre, ' + ' order by p.aseador_nombre)
      from public.cleaner_payouts p where p.periodo_desde = date '2026-07-01'
  $q$),
  'Aseadora 7A + Aseadora 7B',
  'FIN-03 el cierre deja una fila de pago por cada aseadora con aseos en el rango, y solo esas');

-- 25 LAS DOS PARTIDAS POR SEPARADO. Es D7-2 en el schema, y no es cosmética:
--    con un total plano el desglose no sobrevive al borrado, porque no hay forma
--    de reconstruir cuánto vino de aseos y cuánto de gastos.
select is(
  pg_temp.escalar($q$
    select 'aseos=' || p.monto_aseos || ' gastos=' || p.monto_gastos
        || ' total=' || p.monto_total
      from public.cleaner_payouts p
     where p.periodo_desde = date '2026-07-01'
       and p.aseador_id = 'a7000000-0000-0000-0000-00000000000a'
  $q$),
  'aseos=120000 gastos=12000 total=132000',
  'D7-2 el pago de 7A guarda aseos y gastos por separado ademas del total');

-- 26
select is(
  pg_temp.escalar($q$
    select 'aseos=' || p.monto_aseos || ' gastos=' || p.monto_gastos
        || ' total=' || p.monto_total
      from public.cleaner_payouts p
     where p.periodo_desde = date '2026-07-01'
       and p.aseador_id = 'a7000000-0000-0000-0000-00000000000b'
  $q$),
  'aseos=55000 gastos=8000 total=63000',
  'D7-2 el pago de 7B guarda aseos y gastos por separado ademas del total');

-- 27 Una línea por aseo y una línea por gasto. Ni un resumen por apartamento ni
--    una línea por día.
select is(
  pg_temp.escalar($q$
    select 'aseo=' || count(*) filter (where l.tipo = 'aseo')
        || ' gasto=' || count(*) filter (where l.tipo = 'gasto')
      from public.cleaner_payout_lines l
      join public.cleaner_payouts p on p.id = l.payout_id
     where p.periodo_desde = date '2026-07-01'
       and p.aseador_id = 'a7000000-0000-0000-0000-00000000000a'
  $q$),
  'aseo=3 gasto=1',
  'D7-2 el desglose de 7A tiene tres lineas de aseo y una de gasto');

-- 28 Cada línea lleva el nombre del apartamento COPIADO COMO TEXTO, el monto y
--    LAS DOS FECHAS. J1 se sembró con fecha programada 2026-07-09 y ejecución
--    2026-07-10 justamente para que una implementación que copie la misma fecha
--    dos veces no pueda pasar esta aserción.
select is(
  pg_temp.escalar($q$
    select l.property_nombre || '|' || l.monto
        || '|' || l.fecha_programada::text || '|' || l.fecha_ejecucion::text
      from public.cleaner_payout_lines l
     where l.cleaning_id = 'f7000000-0000-0000-0000-000000000101' and l.tipo = 'aseo'
  $q$),
  'Apto 7A (fixture)|40000|2026-07-09|2026-07-10',
  'D7-2 y D7-8 la linea de aseo lleva nombre copiado, monto y LAS DOS fechas');

-- 29 Y la línea de gasto lleva la ruta de la evidencia copiada. D7-2 exige poder
--    llegar desde cada gasto a la foto que lo sustenta.
select is(
  pg_temp.escalar($q$
    select l.concepto || '|' || l.monto || '|' || l.evidencia_bucket
        || '|' || l.evidencia_path
      from public.cleaner_payout_lines l
     where l.expense_id = 'e7000000-0000-0000-0000-000000000001'
  $q$),
  'Detergente|12000|evidencia|'
  || 'f7000000-0000-0000-0000-000000000101/gasto/c7000000-0000-0000-0000-000000000001.jpg',
  'D7-2 la linea de gasto lleva concepto, monto y la ruta de la evidencia copiada');

-- 30 EL TIPO, no solo el valor. La suma sobre `bigint` devuelve `numeric`, que
--    supabase-js entrega como CADENA para no perder precisión, y eso rompe la
--    aritmética en TypeScript en silencio: '132000' + 1 da '1320001'. La columna
--    tiene que ser `bigint`, y la aserción se hace sobre el catálogo de tipos.
select is(
  pg_temp.escalar($q$
    select string_agg(a.atttypid::regtype::text, ',' order by a.attname)
      from pg_catalog.pg_attribute a
     where a.attrelid = 'public.cleaner_payouts'::regclass
       and a.attname in ('monto_aseos', 'monto_gastos', 'monto_total')
  $q$),
  'bigint,bigint,bigint',
  'las tres partidas del pago son bigint y no numeric: numeric llega a TypeScript como cadena');


-- ═══════════════════════════════════════════════════════════════════════════
-- F. LA IDEMPOTENCIA (FIN-03, D7-3) — 3 aserciones
--
--    "Un mes cerrado no se vuelve a tocar." Es el número que una persona ya
--    cobró: un histórico que cambia solo es un histórico en el que nadie puede
--    confiar.
--
--    SEÑUELO DECLARADO: quitar la guarda contra el cierre doble tiene que poner
--    estas tres en rojo. Se ejerce en el plan 07-14.
--
--    Lo pone en verde: 07-07, migración 25.
-- ═══════════════════════════════════════════════════════════════════════════

-- Segunda corrida sobre el MISMO periodo. Escritura, en su propia sentencia, y
-- con sesión de admin por la razón escrita antes del bloque C.
select pg_temp.intento_como('ad700000-0000-0000-0000-000000000001',
  $q$select public.cerrar_periodo(date '2026-07-01', date '2026-07-31')$q$)
  as segunda_corrida \gset

-- 31
select is(
  pg_temp.escalar($q$
    select count(*)::text || '|' || sum(p.monto_total)::text
      from public.cleaner_payouts p where p.periodo_desde = date '2026-07-01'
  $q$),
  '2|195000',
  'D7-3 dos corridas del cierre no pagan dos veces: mismas filas y mismos montos');

-- Se edita la tarifa del apartamento DESPUÉS de cerrar, que es el caso que el
-- dueño planteó con todas las letras, y se vuelve a correr el cierre.
select pg_temp.correr($q$
  update public.properties
     set tarifa_huesped = 200000::bigint, pago_aseador = 99000::bigint
   where id = 'b7000000-0000-0000-0000-000000000001'
$q$) as tarifa_editada \gset

select pg_temp.intento_como('ad700000-0000-0000-0000-000000000001',
  $q$select public.cerrar_periodo(date '2026-07-01', date '2026-07-31')$q$)
  as tercera_corrida \gset

-- 32 Si el cierre recalculara, 7A pasaría de 132000 a 3 x 99000 + 12000 = 309000.
select is(
  pg_temp.escalar($q$
    select p.monto_total::text from public.cleaner_payouts p
     where p.periodo_desde = date '2026-07-01'
       and p.aseador_id = 'a7000000-0000-0000-0000-00000000000a'
  $q$),
  '132000',
  'D7-3 corregir la tarifa del apartamento despues de cerrar NO mueve el pago ya cerrado');

-- Y entra un aseo NUEVO al periodo ya cerrado, terminado dentro del rango. Pasa
-- de verdad: un aseo de fin de mes que el admin cierra a mano días después.
select pg_temp.correr($q$
  insert into public.cleanings
    (id, property_id, scheduled_date, tipo, origin, aseador_id, confirmado_at,
     state, started_at, finished_at)
  values ('f7000000-0000-0000-0000-000000000107',
          'b7000000-0000-0000-0000-000000000002',
          date '2026-07-05', 'normal', 'manual',
          'a7000000-0000-0000-0000-00000000000a', now(), 'completada',
          (timestamp '2026-07-05 08:00') at time zone 'America/Bogota',
          (timestamp '2026-07-05 14:00') at time zone 'America/Bogota')
$q$) as aseo_tardio \gset

select pg_temp.intento_como('ad700000-0000-0000-0000-000000000001',
  $q$select public.cerrar_periodo(date '2026-07-01', date '2026-07-31')$q$)
  as cuarta_corrida \gset

-- 33 Un periodo cerrado NO SE RECALCULA NUNCA. El aseo tardío no entra, y eso es
--    correcto: el número ya se pagó. Si algún día se decide compensarlo, es un
--    concepto nuevo (un ajuste), no una reapertura.
select is(
  pg_temp.escalar($q$
    select count(*)::text || '|' || sum(p.monto_total)::text
      from public.cleaner_payouts p where p.periodo_desde = date '2026-07-01'
  $q$),
  '2|195000',
  'D7-3 un aseo que entra al periodo despues de cerrado tampoco mueve el pago');


-- ═══════════════════════════════════════════════════════════════════════════
-- H. LOS INFORMATIVOS, FUERA DE TODO (FIN-05) — 4 aserciones
--
--    "Los aseos informativos quedan fuera de TODO cálculo y de TODA métrica."
--    Eso incluye los enteros, no solo los pesos. El filtro de gestión propia
--    tiene que ser EXPLÍCITO y no implícito por nulo (Pitfall 8 del research):
--    apoyarse en que el CHECK deja las tarifas en nulo funciona hasta el día en
--    que alguien agregue una columna con default.
--
--    SEÑUELO DECLARADO: quitar el filtro de gestión externa del núcleo tiene que
--    poner estas cuatro en rojo. Se ejerce en el plan 07-14.
--
--    Lo pone en verde: 07-07 (el cierre) y 07-08 (las lecturas).
-- ═══════════════════════════════════════════════════════════════════════════

-- 34
select is(
  pg_temp.escalar($q$
    select count(*)::text
      from public.cleaner_payout_lines l
     where l.property_id = 'b7000000-0000-0000-0000-000000000003'
        or l.cleaning_id = 'f7000000-0000-0000-0000-000000000105'
  $q$),
  '0',
  'FIN-05 el aseo de gestion externa no aparece en NINGUNA linea del desglose');

-- 35 LA QUE MUERDE. El contador de aseos no computados de la cabecera vale UNO
--    (JP, gestionado y sin completar) y no DOS. El informativo JX está
--    programado dentro del rango y tampoco está completado, así que un contador
--    escrito sin el filtro de gestión propia daría 2 y le pondría al admin una
--    alerta por un aseo que nunca fue suyo.
select is(
  pg_temp.escalar($q$
    select pp.aseos_no_computados::text from public.payout_periods pp
     where pp.periodo_desde = date '2026-07-01'
  $q$),
  '1',
  'FIN-05 el contador de aseos no computados cuenta el pendiente gestionado y NO el informativo');

-- 36 `rentabilidad_aseos` devuelve filas, y ninguna es del apartamento externo.
--    Se escribe como "hay filas | filas externas" para que una función que
--    devuelva el conjunto vacío no pase por vacuidad.
select is(
  pg_temp.valor_como('ad700000-0000-0000-0000-000000000001',
    $q$select (count(*) > 0)::text || '|'
         || count(*) filter (
              where r.property_id = 'b7000000-0000-0000-0000-000000000003')::text
         from public.rentabilidad_aseos(
                date '2026-07-01', date '2026-07-31',
                null::uuid, null::uuid, 'todos') r$q$),
  'true|0',
  'FIN-05 rentabilidad_aseos devuelve filas y ninguna es del apartamento de gestion externa');

-- 37 Los tres conteos del bloque 2 del Resumen, con la aritmética a la vista:
--      aseos hechos ....... J1 J2 J3 JB + el tardio del bloque F  = 5
--      aseos con gastos ... J1 (Detergente) y J3 (Bolsas)         = 2
--      aseos con danos .... J3 (rejilla partida)                  = 1
--    CONTRATO: `resumen_financiero` cuenta aseos GESTIONADOS Y COMPLETADOS cuyo
--    dia de ejecucion en Bogota cae en el rango. Es lectura viva, no snapshot,
--    asi que si ve el aseo tardio del bloque F: eso NO contradice D7-3, que solo
--    congela el PAGO.
select is(
  pg_temp.valor_como('ad700000-0000-0000-0000-000000000001',
    $q$select s.aseos_hechos::text || '|' || s.aseos_con_gastos::text
         || '|' || s.aseos_con_danos::text
         from public.resumen_financiero(date '2026-07-01', date '2026-07-31') s$q$),
  '5|2|1',
  'FIN-05 los tres conteos del Resumen excluyen el informativo');


-- ═══════════════════════════════════════════════════════════════════════════
-- I. LO QUE VE EL ASEADOR, Y SOBRE TODO LO QUE NO (D7-4, D7-7) — 6 aserciones
--    Lo pone en verde: 07-09, migración 27.
-- ═══════════════════════════════════════════════════════════════════════════

/**
 * El identificador del pago de la compañera hay que resolverlo COMO POSTGRES.
 * Resolverlo dentro de la sesión impersonada sería un autoengaño: la aseadora no
 * tiene grant sobre la tabla de pagos, así que la subconsulta fallaría con 42501
 * y la aserción pasaría sin haber llegado nunca a llamar la función.
 * El uuid de ceros es el relleno para cuando la tabla todavía no existe.
 */
create function pg_temp.uuid_o_cero(p_txt text) returns text
language sql immutable as $fn$
  select case when p_txt ~ '^[0-9a-f]{8}-[0-9a-f]{4}-' then p_txt
              else '00000000-0000-0000-0000-000000000000' end;
$fn$;

select pg_temp.uuid_o_cero(pg_temp.escalar($q$
  select p.id::text from public.cleaner_payouts p
   where p.periodo_desde = date '2026-07-01'
     and p.aseador_id = 'a7000000-0000-0000-0000-00000000000b'
$q$)) as pago_de_7b \gset

-- 38 Solo SUS periodos cerrados. 7A cobró en julio y en agosto.
select is(
  pg_temp.valor_como('a7000000-0000-0000-0000-00000000000a',
    $q$select string_agg(m.periodo_desde::text, ',' order by m.periodo_desde)
         from public.mis_pagos_cerrados() m$q$),
  '2026-07-01,2026-08-01',
  'D7-4 mis_pagos_cerrados devuelve los periodos cerrados de la aseadora que llama');

-- 39 Y NO EL PERIODO EN CURSO. El aseo SC de la siembra está completado dentro
--    del periodo vigente y nadie lo ha cerrado ni puede cerrarlo todavía. El
--    acumulado del periodo en curso se mueve, y puede BAJAR si se cancela un
--    aseo ya contado; un número que baja en el teléfono de quien lo va a cobrar
--    es una conversación que nadie quiere tener.
--    Se escribe como "total | posteriores a agosto" para que una función que
--    devuelva cero filas no pase por vacuidad.
select is(
  pg_temp.valor_como('a7000000-0000-0000-0000-00000000000a',
    $q$select count(*)::text || '|'
         || count(*) filter (where m.periodo_desde > date '2026-08-31')::text
         from public.mis_pagos_cerrados() m$q$),
  '2|0',
  'D7-4 mis_pagos_cerrados NO devuelve el periodo en curso, que nadie ha cerrado');

-- 40 Y la compañera ve lo suyo, que es distinto. El filtro por dueño va DENTRO
--    de la función, contra el identificador de la sesión: una pantalla que
--    filtra es una pantalla que se puede saltar.
select is(
  pg_temp.valor_como('a7000000-0000-0000-0000-00000000000b',
    $q$select string_agg(m.periodo_desde::text, ',' order by m.periodo_desde)
         from public.mis_pagos_cerrados() m$q$),
  '2026-07-01',
  'D7-4 la otra aseadora ve SUS periodos y no los de su companera');

-- 41 Una aseadora no ve el pago de otra. Se afirma `42501` y no "cero filas" a
--    propósito: pedir el desglose de un pago ajeno es un intento de acceso, no
--    una consulta vacía, y la diferencia importa el día que alguien mire los
--    logs.
select is(
  pg_temp.intento_como('a7000000-0000-0000-0000-00000000000a',
    format($q$select * from public.detalle_de_mi_pago(%L::uuid)$q$, :'pago_de_7b')),
  '42501',
  'D7-4 una aseadora que pide el detalle del pago de otra recibe 42501');

-- 42 La aseadora DESACTIVADA no obtiene nada, aunque su sesión siga viva. La
--    guarda tiene que ser `private.is_active_cleaner()`, que consulta el perfil
--    en vivo, y nunca un claim del token: un token ya emitido sigue siendo
--    válido hasta que expire.
select is(
  pg_temp.intento_como('a7000000-0000-0000-0000-00000000000c',
    $q$select * from public.mis_pagos_cerrados()$q$),
  '42501',
  'D7-4 una aseadora desactivada no obtiene sus pagos aunque su sesion siga viva');

-- 43 SOBRE EL CATÁLOGO, NO SOBRE LA FILA. Ninguna de las dos funciones del
--    aseador DECLARA una columna de cifra de huésped, de margen o de cobrado.
--    Se comprueba contra el `returns table` en `pg_proc` porque el dato viaja al
--    teléfono aunque la pantalla no lo pinte, y porque una siembra donde la
--    cifra fuera nula haría pasar una aserción sobre la fila sin demostrar nada.
--    Se escribe como "funciones encontradas | funciones que declaran cifra" para
--    que no pase por vacuidad mientras las funciones no existan.
select is(
  pg_temp.escalar($q$
    select count(*)::text || '|'
        || count(*) filter (
             where pg_catalog.pg_get_function_result(p.oid)
                   ~* '(huesped|margen|cobrado|tarifa)')::text
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('mis_pagos_cerrados', 'detalle_de_mi_pago')
  $q$),
  '2|0',
  'D7-7 las dos funciones del aseador existen y NINGUNA declara una cifra de huesped');


-- ═══════════════════════════════════════════════════════════════════════════
-- J. EL RECIBO DURA CINCO AÑOS (D7-6, corregida por la DEFINICION §4) — 3 aserciones
--
--    D7-2 exige poder llegar desde cada gasto a la foto que lo sustenta. Con la
--    política de fotos vigente, ese enlace está roto al mes siguiente. Los
--    recibos son una fracción marginal del volumen, así que la excepción es
--    barata; lo que llena el almacenamiento son las fotos de checklist.
--
--    Esta función existe PARA LA FASE 9. Si no existiera, quien escriba la purga
--    borraría los recibos sin saber que está rompiendo un requisito de la Fase 7.
--
--    Lo pone en verde: 07-04, migración 23.
-- ═══════════════════════════════════════════════════════════════════════════

-- 44
select is(
  pg_temp.escalar($q$select public.foto_vencida('checklist', now() - interval '31 days')::text$q$),
  'true',
  'D7-6 una foto de checklist de 31 dias ya vencio');

-- 45 La misma antigüedad, otra clase de foto, otra respuesta. Es la excepción
--    entera en una aserción.
select is(
  pg_temp.escalar($q$select public.foto_vencida('gasto', now() - interval '31 days')::text$q$),
  'false',
  'D7-6 un recibo de gasto de 31 dias NO ha vencido: tiene politica propia');

-- 46 Pero no es eterno: pasados los cinco años, vence.
select is(
  pg_temp.escalar($q$
    select public.foto_vencida('gasto', now() - interval '5 years 1 day')::text
  $q$),
  'true',
  'D7-6 un recibo de gasto de mas de cinco anos si vencio');


-- ═══════════════════════════════════════════════════════════════════════════
-- G. LA SUPERVIVENCIA AL BORRADO (FIN-04, criterio del ROADMAP) — 6 aserciones
--
--    VA AL FINAL AUNQUE SU LETRA SEA ANTERIOR: destruye parte de la siembra a
--    propósito, y cualquier bloque posterior leería un fixture mutilado y
--    fallaría por la razón equivocada.
--
--    El ROADMAP describe este criterio palabra por palabra, así que se escribe
--    palabra por palabra: cerrar el periodo, BORRAR A MANO un aseo de ese
--    periodo, y volver a leer el pago.
--
--    LA TRAMPA 1 DE LA CABECERA MUERDE JUSTO AQUÍ: el borrado va en su propia
--    sentencia, ANTES de la aserción que lee. Una escritura dentro de la
--    subconsulta de una aserción no la ve esa aserción.
--
--    SEÑUELO DECLARADO: poner las líneas del desglose en cascada hacia el mundo
--    vivo tiene que poner esto en rojo. Se ejerce en el plan 07-14.
--
--    Lo pone en verde: 07-04 (la ausencia de clave foránea) y 07-07 (el texto
--    copiado en vez de punteros).
-- ═══════════════════════════════════════════════════════════════════════════

-- 47 El borrado NO FALLA. Si fallara con 23503, la purga de la Fase 9 se quedaría
--    atascada para siempre y la retención de seis meses no se cumpliría nunca.
--    Esta es la sentencia de escritura; las cuatro aserciones que siguen leen.
select is(
  pg_temp.correr($q$
    delete from public.cleanings where id = 'f7000000-0000-0000-0000-000000000102'
  $q$),
  'sin_error',
  'FIN-04 borrar a mano un aseo de un periodo ya cerrado NO falla');

-- 48
select is(
  pg_temp.escalar($q$
    select count(*)::text from public.payout_periods
     where periodo_desde = date '2026-07-01'
  $q$),
  '1',
  'FIN-04 la cabecera del periodo sigue ahi despues de borrar el aseo');

-- 49 EL MISMO TOTAL. No un total recalculado a 92000 por haberse ido un aseo:
--    el pago es un documento contable, no una vista sobre el mundo vivo.
select is(
  pg_temp.escalar($q$
    select p.monto_total::text from public.cleaner_payouts p
     where p.periodo_desde = date '2026-07-01'
       and p.aseador_id = 'a7000000-0000-0000-0000-00000000000a'
  $q$),
  '132000',
  'FIN-04 el pago de la aseadora sigue ahi y con el MISMO total');

-- 50 Y la línea del aseo borrado sigue siendo LEGIBLE: nombre del apartamento y
--    monto. No un identificador suelto apuntando a nada. D7-2 pedía desglose, no
--    punteros rotos.
select is(
  pg_temp.escalar($q$
    select l.property_nombre || '|' || l.monto::text
      from public.cleaner_payout_lines l
     where l.cleaning_id = 'f7000000-0000-0000-0000-000000000102'
  $q$),
  'Apto 7A (fixture)|40000',
  'FIN-04 la linea del aseo borrado conserva nombre de apartamento y monto legibles');

-- 51 Y lo mismo por el lado del gasto. Escritura primero, en su propia sentencia.
select is(
  pg_temp.correr($q$
    delete from public.expenses where id = 'e7000000-0000-0000-0000-000000000001'
  $q$),
  'sin_error',
  'FIN-04 borrar a mano un gasto de un periodo ya cerrado NO falla');

-- 52
select is(
  pg_temp.escalar($q$
    select l.concepto || '|' || l.monto::text
      from public.cleaner_payout_lines l
     where l.expense_id = 'e7000000-0000-0000-0000-000000000001'
  $q$),
  'Detergente|12000',
  'FIN-04 la linea del gasto borrado conserva concepto y monto');


-- ═══════════════════════════════════════════════════════════════════════════
-- K. LAS DOS PUERTAS DEL CIERRE Y LO QUE NINGUNA DEJA PASAR — 7 aserciones
--
--    AÑADIDO POR EL PLAN 07-07, y va DESPUÉS del bloque G a propósito: pgTAP
--    numera por orden de ejecución, y meterlo en medio habría corrido los
--    números de los bloques H, I, J y G, que están citados por número en los
--    comentarios de este archivo y en los planes 07-08, 07-09 y 07-14.
--
--    Las siete son insensibles a la mutilación del fixture que hace G: ninguna
--    lee montos, y las dos cabeceras de periodo siguen ahí (aserción 48).
--
--    QUÉ MIDEN, Y POR QUÉ HACEN FALTA. El cierre tiene dos puertas y las dos son
--    endpoints: el RPC del admin lo expone PostgREST, y el núcleo es una función
--    `security definer` propiedad del superusuario, que salta la seguridad a
--    nivel de fila entera. Que el botón viva en el árbol de admin no autoriza
--    nada.
-- ═══════════════════════════════════════════════════════════════════════════

-- 53 T-07-31. La puerta del admin, cerrada para quien no lo es.
select is(
  pg_temp.intento_como('a7000000-0000-0000-0000-00000000000a',
    $q$select public.cerrar_periodo(date '2026-07-01', date '2026-07-31')$q$),
  '42501',
  'T-07-31 una aseadora que llama a cerrar_periodo recibe 42501');

-- 54 T-07-31. Y la del aviso, que enseña el calendario financiero de la empresa.
select is(
  pg_temp.intento_como('a7000000-0000-0000-0000-00000000000a',
    $q$select * from public.periodo_pendiente_de_cierre()$q$),
  '42501',
  'T-07-31 una aseadora que llama a periodo_pendiente_de_cierre recibe 42501');

-- 55 T-07-32. EL NÚCLEO NO ES ALCANZABLE DESDE LA APLICACIÓN. Vive en `private`
--    y sin grant, así que una sesión de la aplicación no lo puede invocar ni
--    saltándose las dos puertas. Se prueba EJECUTÁNDOLO, no solo leyendo el
--    catálogo: el grant es el mecanismo, la imposibilidad es el requisito.
select is(
  pg_temp.intento_como('a7000000-0000-0000-0000-00000000000a',
    $q$select private.cerrar_periodo_core(date '2026-07-01', date '2026-07-31')$q$),
  '42501',
  'T-07-32 el nucleo del cierre no es invocable desde una sesion de la aplicacion');

-- 56 Y el mismo invariante contra el catálogo, que es donde se ve si alguien
--    «arregla» el 42501 de arriba añadiendo un grant. Se escribe como
--    "concesiones totales | concesiones a roles de la aplicacion" para que una
--    función inexistente dé '0|0' y no pase por vacuidad.
--    `grantee = 0` es PUBLIC, y ahí el catálogo no tiene nombre que devolver:
--    sin el `case`, la consulta revienta en vez de contar.
select is(
  pg_temp.escalar($q$
    select count(*)::text || '|'
        || count(*) filter (
             where case when a.grantee = 0 then 'PUBLIC'
                        else pg_catalog.pg_get_userbyid(a.grantee) end
                   in ('PUBLIC', 'anon', 'authenticated'))::text
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      cross join pg_catalog.aclexplode(p.proacl) a
     where n.nspname = 'private'
       and p.proname = 'cerrar_periodo_core'
       and a.privilege_type = 'EXECUTE'
  $q$),
  '1|0',
  'T-07-32 el nucleo tiene UNA sola concesion de ejecucion y ninguna es de un rol de la aplicacion');

-- 57 T-07-30. UN ADMIN NO PUEDE CERRAR UN PERIODO POR ADELANTADO.
--
--    El rango se pide AL CALENDARIO, no se escribe a mano, por dos razones: es
--    un periodo REAL —así que la validación de forma del rango no puede ser la
--    que lo rechace, y lo que se está midiendo es la guarda de vencimiento— y
--    la aserción no caduca, corra el archivo el mes que corra.
--
--    Importa porque un periodo cerrado no se vuelve a tocar: cerrarlo hoy
--    pagaría por trabajo que aún no ocurrió y congelaría el error para siempre.
select pg_temp.escalar(
  $q$select (public.periodo_de_cierre(public.today_bog())).periodo_desde::text$q$)
  as curso_desde \gset
select pg_temp.escalar(
  $q$select (public.periodo_de_cierre(public.today_bog())).periodo_hasta::text$q$)
  as curso_hasta \gset

select is(
  pg_temp.intento_como('ad700000-0000-0000-0000-000000000001',
    format($q$select public.cerrar_periodo(%L::date, %L::date)$q$,
           :'curso_desde', :'curso_hasta')),
  'P0001',
  'T-07-30 el admin NO puede cerrar el periodo en curso: su dia de cierre no ha pasado');

-- 58 Y el complemento: un rango que SÍ está vencido pero que NO es un periodo de
--    cierre real. El 2 de julio no es el día siguiente a ningún cierre (D7-5),
--    así que el rango no existe y la base lo rechaza en vez de fiarse del
--    cliente. Las dos aserciones se discriminan por la ENTRADA, no por el
--    código de error: 57 manda un periodo real no vencido y 58 uno vencido que
--    no es un periodo, así que cada una solo puede fallar por su propia guarda.
select is(
  pg_temp.intento_como('ad700000-0000-0000-0000-000000000001',
    $q$select public.cerrar_periodo(date '2026-07-02', date '2026-07-31')$q$),
  'P0001',
  'T-07-30 el admin NO puede cerrar un rango inventado: el periodo se valida contra el calendario');

-- 59 EL AVISO DE «CERRAR EL PERIODO AHORA» (UI-SPEC §9.5), medido como
--    invariante y no como literal: el archivo se corre en cualquier mes, y un
--    valor esperado fijo diría «julio» en septiembre y «octubre» en noviembre.
--
--    Lo que no puede pasar NUNCA: nombrar un periodo que ya está cerrado (sería
--    un aviso que empuja a cerrar dos veces), nombrar uno cuyo día de cierre no
--    ha pasado (sería empujar a pagar por adelantado, T-07-30), o devolver más
--    de una fila (el aviso de la pantalla es uno).
select is(
  pg_temp.valor_como('ad700000-0000-0000-0000-000000000001', $q$
    select count(*) filter (
             where q.periodo_desde in (date '2026-07-01', date '2026-08-01'))::text
        || '|' || count(*) filter (where q.periodo_hasta >= public.today_bog())::text
        || '|' || (count(*) <= 1)::text
      from public.periodo_pendiente_de_cierre() q
  $q$),
  '0|0|true',
  'FIN-03 el aviso de periodo pendiente no nombra ninguno ya cerrado ni ninguno sin vencer, y nombra como mucho uno');


-- ═══════════════════════════════════════════════════════════════════════════
-- L. LAS SEIS LECTURAS FINANCIERAS DEL ADMIN — 18 aserciones
--
--    Lo pone en verde: 07-08, migración 26.
--
--    VA AL FINAL, DESPUÉS DE G Y DE K, Y ESO ES DELIBERADO POR DOS RAZONES:
--
--    1. pgTAP numera por orden de ejecución. Meter este bloque en su sitio
--       alfabético correría los números de E, F, H, I, J, G y K, que están
--       citados por número en este archivo y en los planes 07-09 y 07-14.
--       Añadir al final es la única forma de ampliar el contrato sin invalidar
--       las citas de los demás.
--
--    2. El bloque G borra a propósito el aseo J2 y el gasto del Detergente.
--       Estas aserciones leen ESE fixture mutilado y sus cifras están calculadas
--       sobre él. La cuenta, escrita para que se pueda auditar a mano:
--
--         Julio, aseos gestionados y completados que quedan vivos:
--           J1  Apto 7A · 90000 cobrado · 40000 pagado · aseadora 7A
--           J3  Apto 7B · 150000        · 55000        · aseadora 7B  (+ daño, + gasto 8000)
--           JB  Apto 7A · 90000         · 40000        · aseadora 7A
--           107 Apto 7B · 150000        · 55000        · aseadora 7A  (el tardío del bloque F)
--
--           cobrado 480000 · pagado 190000 · gastos 8000 · ganancia 282000
--           4 aseos hechos · 1 con gastos · 1 con daños
--
--         Y esas cifras SON LAS CONGELADAS EN CADA ASEO, no las del apartamento:
--         el bloque F dejó el Apto 7A a 200000/99000. Si alguna lectura sumara
--         tarifas vivas, el cobrado daría 700000 y esto se pondría rojo. Es la
--         regresión de FIN-01 medida desde la lectura.
--
--    LA CONCILIACIÓN ES UNA ASERCIÓN, NO UNA ESPERANZA. La fila de totales de
--    /finanzas/aseos tiene que cuadrar EXACTAMENTE con los KPIs del Resumen del
--    mismo periodo, y el bloque 3 con el KPI 2. Si no cuadran, el admin ve dos
--    cifras distintas para lo mismo en dos pantallas y deja de creerle a las
--    dos.
-- ═══════════════════════════════════════════════════════════════════════════

-- 60 LA CONCILIACIÓN RESUMEN ↔ DETALLE. Se escribe como tres booleanos y no
--    como dos números para que mida la IGUALDAD y no dos literales que alguien
--    pueda actualizar a la vez. El tercero es el seguro contra la vacuidad: dos
--    funciones que devolvieran el conjunto vacío también "cuadrarían".
select is(
  pg_temp.valor_como('ad700000-0000-0000-0000-000000000001', $q$
    select (s.cobrado = d.cobrado)::text
        || '|' || (s.pagado_aseadores = d.pagado)::text
        || '|' || (d.filas > 0)::text
      from public.resumen_financiero(date '2026-07-01', date '2026-07-31') s
      cross join lateral (
        select count(*)::int                  as filas,
               coalesce(sum(r.cobrado), 0)    as cobrado,
               coalesce(sum(r.pagado), 0)     as pagado
          from public.rentabilidad_aseos(date '2026-07-01', date '2026-07-31',
                                         null::uuid, null::uuid, 'todos') r
      ) d
  $q$),
  'true|true|true',
  'FIN-02 la fila de totales del detalle cuadra exactamente con los KPIs del Resumen');

-- 61 Y los cuatro KPIs con la aritmética a la vista, contra las cifras
--    CONGELADAS. Con tarifas vivas el cobrado daría 700000.
select is(
  pg_temp.valor_como('ad700000-0000-0000-0000-000000000001', $q$
    select s.cobrado::text || '|' || s.pagado_aseadores::text
        || '|' || s.gastos_reembolsados::text || '|' || s.ganancia::text
        || '|' || s.aseos_hechos::text
      from public.resumen_financiero(date '2026-07-01', date '2026-07-31') s
  $q$),
  '480000|190000|8000|282000|4',
  'FIN-01 los KPIs del Resumen salen de las cifras congeladas en el aseo, no de las vigentes del apartamento');

-- 62 LA CONCILIACIÓN RESUMEN ↔ BLOQUE 3. El KPI 2 tiene que ser la suma de lo
--    que cuesta cada persona, y el KPI 3 la de sus gastos. Es la misma pantalla:
--    dos bloques que no suman lo mismo es el defecto que la hace increíble.
select is(
  pg_temp.valor_como('ad700000-0000-0000-0000-000000000001', $q$
    select (s.pagado_aseadores = k.pago)::text
        || '|' || (s.gastos_reembolsados = k.gasto)::text
      from public.resumen_financiero(date '2026-07-01', date '2026-07-31') s
      cross join lateral (
        select coalesce(sum(a.total_pago), 0)   as pago,
               coalesce(sum(a.total_gastos), 0) as gasto
          from public.costo_por_aseadora(date '2026-07-01', date '2026-07-31') a
      ) k
  $q$),
  'true|true',
  'FIN-02 el KPI de pagos y el de gastos cuadran con la suma del bloque de costo por aseadora');

-- 63 UN VALOR DE FILTRO DESCONOCIDO ES UN ERROR, NO UN SILENCIO. Cero filas ante
--    un `con-gasto` mal escrito le enseñaría al admin un periodo vacío que parece
--    un dato («este mes no hubo gastos») cuando es un defecto. P0001 y no 42501:
--    quien llama SÍ está autorizado, lo que está mal es el argumento.
select is(
  pg_temp.intento_como('ad700000-0000-0000-0000-000000000001',
    $q$select * from public.rentabilidad_aseos(
         date '2026-07-01', date '2026-07-31', null::uuid, null::uuid, 'con-gasto')$q$),
  'P0001',
  'FIN-02 rentabilidad_aseos rechaza un filtro de tipo desconocido con error y no con cero filas');

-- 64 Y el filtro válido FILTRA DE VERDAD. Sin esta, una función que ignorara el
--    argumento pasaría la 63 y devolvería las cuatro filas siempre.
select is(
  pg_temp.valor_como('ad700000-0000-0000-0000-000000000001', $q$
    select count(*)::text
      from public.rentabilidad_aseos(date '2026-07-01', date '2026-07-31',
                                     null::uuid, null::uuid, 'con-danos') r
  $q$),
  '1',
  'FIN-02 el filtro con-danos devuelve solo el aseo que genero un dano');

-- 65 T-07-36. La guarda de la tercera vía de función.
select is(
  pg_temp.intento_como('a7000000-0000-0000-0000-00000000000a',
    $q$select * from public.costo_por_aseadora(date '2026-07-01', date '2026-07-31')$q$),
  '42501',
  'D7-7 una aseadora que llama a costo_por_aseadora recibe 42501');

-- 66 El admin SÍ, con el ORDEN ALFABÉTICO por defecto y los montos. El orden no
--    es cosmético: una lista de personas de mayor a menor se lee como un podio
--    aunque no lleve números ni medallas (UI-SPEC §6.5.3).
--      Aseadora 7A: J1 + JB + 107 = 135000, sin gastos (el Detergente lo borró G)
--      Aseadora 7B: J3 = 55000 + 8000 de gastos = 63000
select is(
  pg_temp.valor_como('ad700000-0000-0000-0000-000000000001', $q$
    select string_agg(
             a.aseador_nombre || ':' || a.cantidad_aseos::text
               || ':' || a.costo_total::text, ' | ' order by a.orden)
      from (
        select c.*, row_number() over () as orden
          from public.costo_por_aseadora(date '2026-07-01', date '2026-07-31') c
      ) a
  $q$),
  'Aseadora 7A:3:135000 | Aseadora 7B:1:63000',
  'el bloque de costo por aseadora llega ordenado alfabeticamente y con el costo de cada persona');

-- 67 SOBRE EL CATÁLOGO, NO SOBRE LA FILA. Ni el bloque por persona ni el
--    desglose de la ficha DECLARAN una columna de cobrado, de margen o de cifra
--    de huésped. Se comprueba contra el `returns table` en `pg_proc` porque una
--    siembra donde la cifra fuera nula haría pasar una aserción sobre la fila
--    sin demostrar nada. Por persona va LO QUE CUESTA, nunca lo que rinde: el
--    margen sale del apartamento y no de quién lo limpió.
select is(
  pg_temp.escalar($q$
    select count(*)::text || '|'
        || count(*) filter (
             where pg_catalog.pg_get_function_result(p.oid)
                   ~* '(huesped|margen|cobrado|tarifa)')::text
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('costo_por_aseadora', 'aseos_de_aseadora')
  $q$),
  '2|0',
  'ni costo_por_aseadora ni aseos_de_aseadora declaran cobrado, margen ni cifra de huesped');

-- 68 T-07-36.
select is(
  pg_temp.intento_como('a7000000-0000-0000-0000-00000000000a',
    $q$select * from public.aseos_de_aseadora(
         'a7000000-0000-0000-0000-00000000000a', date '2026-07-01', date '2026-07-31')$q$),
  '42501',
  'D7-7 una aseadora que llama a aseos_de_aseadora recibe 42501');

-- 69 Y el desglose del admin suma EXACTAMENTE lo mismo que la fila de esa
--    persona en el bloque 3. Si no, el día que alguien reclame van a estar
--    comparando dos papeles distintos.
select is(
  pg_temp.valor_como('ad700000-0000-0000-0000-000000000001', $q$
    select count(*)::text || '|' || sum(a.pago)::text
      from public.aseos_de_aseadora('a7000000-0000-0000-0000-00000000000a',
                                    date '2026-07-01', date '2026-07-31') a
  $q$),
  '3|135000',
  'el desglose de aseos de la ficha suma lo mismo que la fila de esa persona en el bloque 3');

-- 70 T-07-36.
select is(
  pg_temp.intento_como('a7000000-0000-0000-0000-00000000000a',
    $q$select * from public.gastos_de_aseadora(
         'a7000000-0000-0000-0000-00000000000b', date '2026-07-01', date '2026-07-31')$q$),
  '42501',
  'D7-7 una aseadora que llama a gastos_de_aseadora recibe 42501');

-- El recibo del gasto que sobrevivió a G. Escritura en su propia sentencia
-- (trampa 1 de la cabecera): la foto del Detergente se fue en cascada al borrar
-- su gasto, así que sin esta el bloque 4 de la ficha no tendría ninguna ruta que
-- enseñar y la aserción 71 pasaría por vacuidad.
select pg_temp.correr($q$
  insert into public.cleaning_photos
    (id, cleaning_id, kind, expense_id, storage_bucket, storage_path,
     mime_type, bytes, uploaded_by)
  values ('c7000000-0000-0000-0000-000000000002',
          'f7000000-0000-0000-0000-000000000103', 'gasto',
          'e7000000-0000-0000-0000-000000000002', 'evidencia',
          'f7000000-0000-0000-0000-000000000103/gasto/c7000000-0000-0000-0000-000000000002.jpg',
          'image/jpeg', 121000, 'a7000000-0000-0000-0000-00000000000b')
$q$) as recibo_sembrado \gset

-- 71 T-07-38. El bloque 4 de la ficha devuelve EL BUCKET Y LA RUTA, para que el
--    servidor de la aplicación firme después de su propio guard.
select is(
  pg_temp.valor_como('ad700000-0000-0000-0000-000000000001', $q$
    select g.concepto || '|' || g.monto::text || '|' || g.moneda
        || '|' || g.evidencia_bucket
        || '|' || g.evidencia_path
      from public.gastos_de_aseadora('a7000000-0000-0000-0000-00000000000b',
                                     date '2026-07-01', date '2026-07-31') g
  $q$),
  'Bolsas de basura|8000|COP|evidencia|f7000000-0000-0000-0000-000000000103/gasto/c7000000-0000-0000-0000-000000000002.jpg',
  'D7-2 el bloque de gastos de la ficha devuelve concepto, monto y la RUTA de la evidencia');

-- 72 T-07-38 SOBRE EL CATÁLOGO. La función declara la ruta y NO declara ninguna
--    URL. Firmar es trabajo del servidor tras su guard: una función de base que
--    firmara emitiría URLs para todas las filas de la página, incluidas las que
--    nadie abre, y cada una seguiría viva aunque la sesión se cierre.
select is(
  pg_temp.escalar($q$
    select (pg_catalog.pg_get_function_result(p.oid) ~* 'evidencia_path')::text
        || '|' || (pg_catalog.pg_get_function_result(p.oid)
                   ~* '(url|signed|firmad)')::text
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'gastos_de_aseadora'
  $q$),
  'true|false',
  'T-07-38 gastos_de_aseadora declara la ruta de la evidencia y NINGUNA URL');

-- 73 T-07-36.
select is(
  pg_temp.intento_como('a7000000-0000-0000-0000-00000000000a',
    $q$select * from public.aseo_en_curso_de_aseadora(
         'a7000000-0000-0000-0000-00000000000a')$q$),
  '42501',
  'D7-7 una aseadora que llama a aseo_en_curso_de_aseadora recibe 42501');

-- 74 LA REGLA DEL GPS, MEDIDA SOBRE EL CATÁLOGO Y NO SOBRE LA PANTALLA.
--    «Ahora mismo» responde con lo que el sistema YA SABE: qué aseo tiene en
--    curso. No hay rastreo y no lo va a haber, así que la función no puede
--    declarar NI UNA columna de la que se derive una posición. Se mide aquí y no
--    en el CSS porque el dato viaja al navegador aunque la pantalla no lo pinte.
--    OJO: cleaning_photos tiene captured_lat y captured_lng, y son de la FOTO,
--    no de la persona.
select is(
  pg_temp.escalar($q$
    select count(*)::text || '|'
        || count(*) filter (
             where pg_catalog.pg_get_function_result(p.oid)
                   ~* '(lat|lng|ubicacion|coord|gps|geo|conexion|online)')::text
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'aseo_en_curso_de_aseadora'
  $q$),
  '1|0',
  'aseo_en_curso_de_aseadora no declara ninguna columna de ubicacion, coordenada ni ultima conexion');

-- El aseo en curso, en su propia sentencia. `state = 'en_curso'` directo en el
-- INSERT es legal: la guarda de transiciones solo corre en UPDATE, y
-- `cl_en_curso_shape` exige confirmado_at, aseador_id, started_at y finished_at
-- nulo. Se respetan los cuatro. Va en el Apto 7B y en una fecha que ningún otro
-- aseo del fixture ocupa, para no chocar con cleanings_one_active_per_property_date.
select pg_temp.correr($q$
  insert into public.cleanings
    (id, property_id, scheduled_date, tipo, origin, aseador_id, confirmado_at,
     state, started_at, finished_at)
  values ('f7000000-0000-0000-0000-000000000401',
          'b7000000-0000-0000-0000-000000000002',
          public.today_bog() + 1, 'normal', 'manual',
          'a7000000-0000-0000-0000-00000000000a', now(), 'en_curso',
          ((public.today_bog() + 1)::text || ' 09:15')::timestamp at time zone 'America/Bogota',
          null)
$q$) as aseo_en_curso_sembrado \gset

-- 75 El estado «tiene un aseo en curso»: apartamento y hora de inicio, y nada
--    más. La hora se lee EN BOGOTÁ, que es la única en la que significa algo
--    para quien mira la pantalla.
select is(
  pg_temp.valor_como('ad700000-0000-0000-0000-000000000001', $q$
    select s.esta_activa::text
        || '|' || coalesce(s.property_nombre, '<sin aseo>')
        || '|' || coalesce(to_char(s.iniciado_at at time zone 'America/Bogota', 'HH24:MI'), '-')
      from public.aseo_en_curso_de_aseadora('a7000000-0000-0000-0000-00000000000a') s
  $q$),
  'true|Apto 7B (fixture)|09:15',
  'la ficha responde que la persona esta en un apartamento desde una hora, y nada mas');

-- 76 El estado «cuenta desactivada». La fila EXISTE aunque no haya aseo: los
--    tres estados de la pantalla necesitan saber si la cuenta sigue viva, y con
--    cero filas ese estado sería indistinguible de «no tiene ninguno».
select is(
  pg_temp.valor_como('ad700000-0000-0000-0000-000000000001', $q$
    select s.esta_activa::text
        || '|' || coalesce(s.property_nombre, '<sin aseo>')
      from public.aseo_en_curso_de_aseadora('a7000000-0000-0000-0000-00000000000c') s
  $q$),
  'false|<sin aseo>',
  'la ficha de una cuenta desactivada devuelve fila, dice que esta desactivada y no inventa ningun aseo');

-- 77 Y cero filas significa UNA sola cosa, distinta de las otras dos: ese
--    identificador no es de ningún perfil.
select is(
  pg_temp.valor_como('ad700000-0000-0000-0000-000000000001', $q$
    select count(*)::text
      from public.aseo_en_curso_de_aseadora('00000000-0000-0000-0000-0000000000ff') s
  $q$),
  '0',
  'un identificador que no es de ningun perfil devuelve cero filas, no una fila inventada');


-- ═══════════════════════════════════════════════════════════════════════════
-- M. LOS PAGOS DEL ADMIN Y LA MARCA DE PAGADO — 17 aserciones
--
--    Lo pone en verde: 07-09, migración 27.
--
--    AÑADIDO POR EL PLAN 07-09 Y AL FINAL, por la regla de la cabecera: pgTAP
--    numera por orden de ejecución y meter un bloque en su sitio alfabético
--    correría los números de H, I, J, G, K y L, que están citados por número en
--    este archivo y en el plan 07-14.
--
--    POR QUÉ EXISTE ESTE BLOQUE Y NO BASTABA EL BLOQUE I. El bloque I mide la
--    frontera del aseador, que es la mitad de la migración 27. La otra mitad
--    (las cinco lecturas de Pagos y la marca de pagado) no tenía NINGUNA
--    aserción, y una de sus filas del mapa de verificación de 07-VALIDATION.md
--    está escrita con todas las letras: «Marcar pagado deja fecha y autor, y no
--    se puede marcar dos veces · E2E + pgTAP · ambos». El E2E la cubre desde la
--    pantalla; esta es la mitad de base, que es la que sigue valiendo cuando
--    alguien llame el RPC sin pasar por la pantalla.
--
--    LEEN EL FIXTURE YA MUTILADO POR G, igual que L. Las cifras, para que se
--    puedan auditar a mano, son LAS DEL SNAPSHOT y no las del mundo vivo: el
--    cierre corrió ANTES de que G borrara el aseo J2 y el gasto del Detergente,
--    y un periodo cerrado no se recalcula nunca (D7-3). Por eso siguen ahí:
--
--      Periodo de julio (2026-07-01 .. 2026-07-31), cerrado:
--        Aseadora 7A · J1 + J2 + JB = 3 x 40000 = 120000 · gasto 12000 · 132000
--        Aseadora 7B · J3           = 1 x 55000 =  55000 · gasto  8000 ·  63000
--        2 personas · 195000 en total · 1 aseo no computado (JP, que quedó
--        pendiente y estaba programado dentro del rango)
--
--      Periodo de agosto (2026-08-01 .. 2026-08-31), cerrado:
--        Aseadora 7A · A1 = 1 x 40000 = 40000 · sin gastos · 40000
--        1 persona · 40000 en total · 0 aseos no computados
--
--      El aseo tardío 107 y la tarifa editada del bloque F NO aparecen en
--      ninguna de estas cifras, y esa es la mitad del valor del bloque: si
--      alguna de estas lecturas se apoyara en el mundo vivo en vez de en el
--      snapshot, julio daría otra cosa.
-- ═══════════════════════════════════════════════════════════════════════════

/**
 * El identificador del pago de julio de la aseadora 7A, resuelto COMO POSTGRES
 * y por la misma razón que `pago_de_7b`: la aseadora no tiene grant sobre la
 * tabla de pagos, así que resolverlo dentro de la sesión impersonada fallaría
 * con 42501 y las aserciones pasarían sin haber llamado nunca a la función.
 */
select pg_temp.uuid_o_cero(pg_temp.escalar($q$
  select p.id::text from public.cleaner_payouts p
   where p.periodo_desde = date '2026-07-01'
     and p.aseador_id = 'a7000000-0000-0000-0000-00000000000a'
$q$)) as pago_de_7a \gset

-- 78 LAS CINCO EXISTEN, Y `pagos_de_aseadora` RECIBE UN SOLO ARGUMENTO.
--    Lo segundo no es trivia de catálogo: el bloque 3 de la ficha IGNORA a
--    propósito el selector de periodo de la pantalla (UI-SPEC §8.2), porque los
--    pagos son historial y filtrarlos por el rango de arriba dejaría «sus
--    pagos» con una sola fila cuando el filtro está en día. La AUSENCIA del
--    argumento es el mecanismo que impide que alguien «arregle» el bloque
--    pasándole el rango, así que se mide.
select is(
  pg_temp.escalar($q$
    select count(*)::text || '|'
        || coalesce(
             (pg_catalog.max(p.pronargs)
                filter (where p.proname = 'pagos_de_aseadora'))::text,
             '<nulo>')
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('periodos_de_pago', 'pagos_del_periodo',
                         'pagos_de_aseadora', 'detalle_de_pago',
                         'marcar_pago_pagado')
  $q$),
  '5|1',
  'las cinco lecturas de Pagos existen y pagos_de_aseadora NO recibe rango');

-- 79 LA CABECERA DE CADA PERIODO, CON SUS DOS FECHAS REALES Y SUS CONTADORES.
--    Las dos fechas son columnas de FECHA y no una etiqueta de texto: D7-5 hace
--    que el periodo vaya de cierre a cierre, así que el de junio de 2026
--    empieza el 30 de MAYO y rotularlo «junio» es la discusión que estas dos
--    columnas existen para evitar. El orden es del más reciente al más antiguo.
select is(
  pg_temp.valor_como('ad700000-0000-0000-0000-000000000001', $q$
    select string_agg(
             q.periodo_desde::text || '..' || q.periodo_hasta::text
               || ':' || q.personas::text
               || ':' || q.monto_total::text
               || ':' || q.faltan_por_pagar::text
               || ':' || q.aseos_no_computados::text,
             ' | ' order by q.periodo_desde desc)
      from public.periodos_de_pago() q
  $q$),
  '2026-08-01..2026-08-31:1:40000:1:0 | 2026-07-01..2026-07-31:2:195000:2:1',
  'FIN-03 la cabecera de cada periodo lleva sus DOS fechas, personas, total, cuantas faltan y los no computados');

-- 80 LA TABLA INTERNA, CON LAS DOS PARTIDAS POR SEPARADO. Es D7-2 en la tabla:
--    con un total plano no hay forma de decirle a una persona cuánto de lo que
--    recibe es su trabajo y cuánto el reembolso de lo que puso de su bolsillo.
--    Los montos de las dos personas son distintos a propósito desde la siembra:
--    con 40000 y 40000 una suma mal agrupada cuadraría por casualidad.
select is(
  pg_temp.valor_como('ad700000-0000-0000-0000-000000000001', $q$
    select string_agg(
             g.aseador_nombre || ':' || g.cantidad_aseos::text
               || ':' || g.monto_aseos::text
               || ':' || g.monto_gastos::text
               || ':' || g.monto_total::text
               || ':' || case when g.pagado_at is null then 'pendiente' else 'pagado' end,
             ' | ' order by g.aseador_nombre)
      from public.pagos_del_periodo(date '2026-07-01') g
  $q$),
  'Aseadora 7A:3:120000:12000:132000:pendiente | Aseadora 7B:1:55000:8000:63000:pendiente',
  'D7-2 la tabla de Pagos separa aseos de gastos por persona ademas del total');

-- 81 EL BLOQUE 3 DE LA FICHA: TODOS los periodos de una persona, sin rango.
--    7A cobró en julio y en agosto; la cifra de julio es la CONGELADA (132000),
--    no la que daría recalcular con la tarifa que el bloque F editó después.
select is(
  pg_temp.valor_como('ad700000-0000-0000-0000-000000000001', $q$
    select string_agg(
             g.periodo_desde::text || '..' || g.periodo_hasta::text
               || ':' || g.monto_total::text,
             ' | ' order by g.periodo_desde desc)
      from public.pagos_de_aseadora('a7000000-0000-0000-0000-00000000000a') g
  $q$),
  '2026-08-01..2026-08-31:40000 | 2026-07-01..2026-07-31:132000',
  'FIN-04 la ficha lista TODOS los periodos cerrados de la persona con sus cifras congeladas');

-- 82 EL DESGLOSE DEL ADMIN LEE EL SNAPSHOT, Y LA LÍNEA DEL ASEO QUE G BORRÓ
--    SIGUE AHÍ Y SIGUE SIENDO LEGIBLE. Tres líneas de aseo y una de gasto,
--    aunque el aseo J2 y el gasto del Detergente ya no existan en el mundo
--    vivo. Y la línea de J1 con SUS DOS FECHAS DISTINTAS (D7-8): la siembra las
--    puso distintas a propósito para que una implementación que copie la misma
--    fecha dos veces no pueda pasar.
select is(
  pg_temp.valor_como('ad700000-0000-0000-0000-000000000001', format($q$
    select (select count(*) filter (where d.tipo = 'aseo')::text
                || '|' || count(*) filter (where d.tipo = 'gasto')::text
              from public.detalle_de_pago(%1$L::uuid) d)
        || '|' || (select d.property_nombre || '@' || d.monto::text
                       || '@' || d.fecha_programada::text
                       || '@' || d.fecha_ejecucion::text
                     from public.detalle_de_pago(%1$L::uuid) d
                    where d.tipo = 'aseo' and d.fecha_programada = date '2026-07-09')
  $q$, :'pago_de_7a')),
  '3|1|Apto 7A (fixture)@40000@2026-07-09@2026-07-10',
  'FIN-04 el desglose conserva la linea del aseo borrado, legible y con sus DOS fechas');

-- 83 Y NO SE UNE CONTRA EL MUNDO VIVO. Se mide sobre la DEFINICIÓN de las dos
--    funciones en el catálogo y no sobre la fila, porque el defecto que importa
--    no es «hoy devuelve mal», es «alguien añade un join para enriquecer la
--    fila» y entonces el criterio 3 del ROADMAP deja de cumplirse en silencio:
--    la línea de un aseo purgado se volvería fila fantasma o desaparecería.
--    Se escribe como "encontradas | que se unen" para que no pase por vacuidad.
select is(
  pg_temp.escalar($q$
    select count(*)::text || '|'
        || count(*) filter (
             where pg_catalog.pg_get_functiondef(p.oid)
                   ~ 'public\.(cleanings|properties|expenses)\M')::text
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('detalle_de_pago', 'detalle_de_mi_pago')
  $q$),
  '2|0',
  'FIN-04 ninguna de las dos funciones de desglose se une contra los aseos, los apartamentos ni los gastos');

-- 84 EL MISMO DOCUMENTO, MEDIDO. Las dos funciones de desglose declaran
--    EXACTAMENTE la misma firma de salida: una sola firma distinta entre dos
--    funciones. No es simetría cosmética: si el admin viera una columna de más,
--    el día que alguien reclame estarían comparando dos papeles distintos, y
--    esa conversación se pierde antes de empezar.
select is(
  pg_temp.escalar($q$
    select count(distinct pg_catalog.pg_get_function_result(p.oid))::text
        || '|' || count(*)::text
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('detalle_de_pago', 'detalle_de_mi_pago')
  $q$),
  '1|2',
  'D7-7 el desglose del admin y el del aseador declaran EXACTAMENTE las mismas columnas');

-- 85 LAS CINCO PUERTAS, CERRADAS PARA QUIEN NO ES ADMIN. Las cinco en una sola
--    aserción y no cinco sueltas: lo que se mide es que NINGUNA se quedó sin
--    guarda, y un '42501|42501|sin_error|42501|42501' señala en el `have` cuál
--    es la que falta. Un RPC es un endpoint público de PostgREST: que el botón
--    viva en el árbol de admin no autoriza nada, y una función definer propiedad
--    del superusuario salta la seguridad a nivel de fila entera.
select is(
  pg_temp.intento_como('a7000000-0000-0000-0000-00000000000a',
    $q$select * from public.periodos_de_pago()$q$)
  || '|' || pg_temp.intento_como('a7000000-0000-0000-0000-00000000000a',
    $q$select * from public.pagos_del_periodo(date '2026-07-01')$q$)
  || '|' || pg_temp.intento_como('a7000000-0000-0000-0000-00000000000a',
    $q$select * from public.pagos_de_aseadora('a7000000-0000-0000-0000-00000000000a')$q$)
  || '|' || pg_temp.intento_como('a7000000-0000-0000-0000-00000000000a',
    format($q$select * from public.detalle_de_pago(%L::uuid)$q$, :'pago_de_7a'))
  || '|' || pg_temp.intento_como('a7000000-0000-0000-0000-00000000000a',
    format($q$select * from public.marcar_pago_pagado(%L::uuid)$q$, :'pago_de_7a')),
  '42501|42501|42501|42501|42501',
  'D7-7 una aseadora recibe 42501 en las CINCO lecturas de Pagos, incluida la marca de pagado');

-- 86 T-07-46, EL MISMO INVARIANTE CONTRA EL CATÁLOGO. La aserción 85 prueba que
--    hoy el RPC deniega; esta prueba que no existe la OTRA vía. En Supabase el
--    admin y la aseadora comparten el rol de Postgres `authenticated`, y la
--    aseadora ES el dueño de la fila de su propio pago: un grant de escritura
--    de tabla le permitiría marcárselo, y ni siquiera una policy por fila lo
--    impediría. La salida es que no haya grant ninguno.
select is(
  pg_temp.escalar($q$
    select count(*)::text
      from information_schema.role_table_grants
     where table_schema = 'public'
       and table_name in ('payout_periods', 'cleaner_payouts', 'cleaner_payout_lines')
       and grantee in ('anon', 'authenticated')
  $q$),
  '0',
  'T-07-46 las tres tablas del snapshot no tienen NINGUN privilegio para anon ni authenticated');

-- LA MARCA DE PAGADO, EN SU PROPIA SENTENCIA (trampa 1 de la cabecera): una
-- escritura hecha dentro de la subconsulta de una aserción no la ve esa misma
-- aserción. Se invoca con sesión de ADMIN y por el camino real de producción.
select pg_temp.intento_como('ad700000-0000-0000-0000-000000000001',
  format($q$select * from public.marcar_pago_pagado(%L::uuid)$q$, :'pago_de_7a'))
  as marca_primera \gset

-- El instante de la primera marca, para poder demostrar después que el segundo
-- intento NO lo movió.
select pg_temp.escalar(format($q$
  select p.pagado_at::text from public.cleaner_payouts p where p.id = %L::uuid
$q$, :'pago_de_7a')) as marca_instante \gset

-- 87 FECHA Y AUTOR. Las dos, y el autor sale de la sesión y no de un parámetro:
--    un identificador que viaja como argumento es un identificador que el
--    cliente elige, y la autoría de una marca irreversible sobre dinero no se le
--    pregunta al cliente (T-07-48). Un pago marcado por nadie es un estado que
--    el sistema no sabe producir, y sin el autor no se puede responder «¿quién
--    dijo que esto ya se pagó?» tres meses después.
select is(
  :'marca_primera' || '|' || pg_temp.escalar(format($q$
    select (p.pagado_at is not null)::text
        || '|' || coalesce(p.pagado_por::text, '<nulo>')
      from public.cleaner_payouts p where p.id = %L::uuid
  $q$, :'pago_de_7a')),
  'sin_error|true|ad700000-0000-0000-0000-000000000001',
  'D7-4.2 marcar pagado deja el instante Y el autor, y el autor sale de la sesion');

-- 88 EL SEGUNDO INTENTO SE RECHAZA CON ERROR, NO CON ÉXITO SILENCIOSO.
--    Dos pestañas abiertas es el caso real. La interfaz esconde el botón cuando
--    ya está pagado, pero esconder no es impedir: el bloqueo vive en la base.
--    P0001 y no 42501 porque quien llama SÍ está autorizado y lo que falla es el
--    ESTADO de la fila; la pantalla necesita distinguir los dos casos, porque
--    uno se resuelve recargando y el otro no se resuelve. T-07-47.
select is(
  pg_temp.intento_como('ad700000-0000-0000-0000-000000000001',
    format($q$select * from public.marcar_pago_pagado(%L::uuid)$q$, :'pago_de_7a')),
  'P0001',
  'T-07-47 marcar pagado dos veces se RECHAZA con error, y no pasa en silencio');

-- 89 Y EL RECHAZO NO MOVIÓ NADA. Sin esta, un RPC que levantara la excepción
--    DESPUÉS de escribir pasaría la 88 y habría pisado la fecha y el autor del
--    primer registro, que es justo el daño que la guarda existe para evitar.
select is(
  pg_temp.escalar(format($q$
    select (p.pagado_at::text = %L)::text
        || '|' || (p.pagado_por = 'ad700000-0000-0000-0000-000000000001')::text
      from public.cleaner_payouts p where p.id = %L::uuid
  $q$, :'marca_instante', :'pago_de_7a')),
  'true|true',
  'T-07-48 el segundo intento no piso la fecha ni el autor del primer registro');

-- 90 Y EL CONTADOR DE LA CABECERA BAJÓ SOLO. Julio tenía dos pagos pendientes y
--    ahora tiene uno. Es lo que sostiene el `faltan {N} por pagar` de la
--    cabecera colapsable (UI-SPEC §9.1) y su sustitución por `Todos pagados`.
--    Sin esta aserción, un contador escrito como literal o congelado en el
--    cierre pasaría las 79 y 87 a la vez.
select is(
  pg_temp.valor_como('ad700000-0000-0000-0000-000000000001', $q$
    select q.faltan_por_pagar::text || '|' || q.personas::text
      from public.periodos_de_pago() q
     where q.periodo_desde = date '2026-07-01'
  $q$),
  '1|2',
  'el contador de «faltan por pagar» de la cabecera baja al marcar, y el de personas no');

-- 91 UN PAGO QUE NO EXISTE SE RECHAZA, NO SE IGNORA. Para el ADMIN la respuesta
--    SÍ distingue el caso, y es deliberado: el admin puede ver todos los pagos,
--    así que no hay nada que ocultarle, y decirle que el identificador no existe
--    es la única forma de que sepa que la lista que tiene abierta está vieja.
--    Es la decisión CONTRARIA a la de la aserción 93, y por eso van las dos.
select is(
  pg_temp.intento_como('ad700000-0000-0000-0000-000000000001',
    $q$select * from public.marcar_pago_pagado('00000000-0000-0000-0000-0000000000fe'::uuid)$q$),
  'P0001',
  'marcar un pago inexistente se rechaza con error y no con exito vacio');

-- 92 EL CIRCUITO COMPLETO DEL ASEADOR, DENTRO DE SU PROPIA SESIÓN. Toma el
--    identificador de su lista y con él abre su desglose, sin tocar la tabla en
--    ningún momento: el aseador no tiene grant sobre ella, así que si
--    `mis_pagos_cerrados` no devolviera `payout_id` la pantalla de desglose
--    sería inalcanzable. Es el COMPLEMENTO de la aserción 41: una guarda escrita
--    al revés, que denegara a todo el mundo, pasaría la 41 y rompería el
--    producto.
--
--    Y lo que devuelve es el desglose ENTERO con sus dos partidas y sus dos
--    fechas por línea: tres aseos y el gasto, todos del snapshot, incluido el
--    aseo que G borró del mundo vivo.
select is(
  pg_temp.valor_como('a7000000-0000-0000-0000-00000000000a', $q$
    select string_agg(
             d.tipo || '@' || coalesce(d.concepto, d.property_nombre)
               || '@' || d.monto::text
               || '@' || d.fecha_programada::text
               || '@' || d.fecha_ejecucion::text,
             ' ; ' order by d.tipo, d.fecha_ejecucion)
      from (select m.payout_id
              from public.mis_pagos_cerrados() m
             where m.periodo_desde = date '2026-07-01') p
      cross join lateral public.detalle_de_mi_pago(p.payout_id) d
  $q$),
  'aseo@Apto 7A (fixture)@40000@2026-07-09@2026-07-10'
  || ' ; aseo@Apto 7A (fixture)@40000@2026-07-20@2026-07-20'
  || ' ; aseo@Apto 7A (fixture)@40000@2026-07-31@2026-07-31'
  || ' ; gasto@Detergente@12000@2026-07-09@2026-07-10',
  'D7-4 la aseadora abre SU desglose con el identificador de SU lista, con las dos partidas y las dos fechas');

-- 93 Y LA DENEGACIÓN ES INDISTINGUIBLE. «No existe» y «no es tuyo» dan la MISMA
--    respuesta, y esta aserción compara las dos. Distinguirlas convertiría la
--    función en un oráculo de enumeración de pagos ajenos: quien probara
--    identificadores al azar aprendería cuáles existen. Es la razón por la que
--    el RPC del código de acceso lanza una sola denegación para sus tres casos,
--    y es la decisión CONTRARIA a la de la aserción 91, que es de admin.
select is(
  pg_temp.intento_como('a7000000-0000-0000-0000-00000000000a',
    $q$select * from public.detalle_de_mi_pago('00000000-0000-0000-0000-0000000000fe'::uuid)$q$)
  || '|' || pg_temp.intento_como('a7000000-0000-0000-0000-00000000000a',
    format($q$select * from public.detalle_de_mi_pago(%L::uuid)$q$, :'pago_de_7b')),
  '42501|42501',
  'T-07-42 el pago inexistente y el pago ajeno dan la MISMA denegacion, indistinguible');

-- 94 LA ASEADORA DESACTIVADA TAMPOCO ENTRA POR ESTA PUERTA. La aserción 42 lo
--    mide sobre la lista; esta lo mide sobre el desglose, que es la otra mitad
--    de la superficie y la que tiene el identificador de un pago REAL en la
--    mano. `private.is_active_cleaner()` consulta el perfil EN VIVO, así que la
--    desactivación surte efecto de inmediato aunque el token siga siendo válido
--    hasta que expire. PLAT-04 y criterio 4 del ROADMAP.
select is(
  pg_temp.intento_como('a7000000-0000-0000-0000-00000000000c',
    format($q$select * from public.detalle_de_mi_pago(%L::uuid)$q$, :'pago_de_7a')),
  '42501',
  'PLAT-04 una aseadora desactivada tampoco obtiene el desglose de un pago, aunque tenga su identificador');


-- ═══════════════════════════════════════════════════════════════════════════
-- N. FIN-05 SIN LA RED DEL CHECK: EL FILTRO `is_managed`, MEDIDO SOLO
--    — 5 aserciones
--
--    ── POR QUÉ ESTE BLOQUE EXISTE, Y ES UN HALLAZGO DEL PLAN 07-14 ─────────
--
--    El señuelo 1 de la fase («quitar el filtro de gestión propia del núcleo
--    del cierre») se corrió el 2026-09-13 y NO PUSO NADA EN ROJO. Las 369
--    aserciones siguieron en verde con el filtro fuera.
--
--    La razón no es que el filtro sobre: es que la garantía FIN-05 la sostienen
--    DOS capas independientes y solo una estaba medida.
--
--      Capa 1 (la que trabaja hoy): `cl_unmanaged_is_inert` de la migración 04.
--        Un aseo informativo NO PUEDE tener estado, ni aseadora, ni
--        `finished_at`, ni tarifas. Con esa fila inerte, el `c.state =
--        'completada'` del núcleo ya lo deja fuera él solo, y `is_managed`
--        nunca llega a decidir nada.
--
--      Capa 2 (la que el señuelo ataca): el `where c.is_managed` explícito del
--        núcleo del cierre y de las lecturas del admin. Es exactamente la
--        defensa que la migración 25 describe como necesaria «hasta el día en
--        que alguien añada una columna con default», y hasta este bloque
--        NINGUNA aserción del repo podía distinguir si estaba o no.
--
--    Un filtro que no se puede poner en rojo es un comentario con sintaxis de
--    SQL. Este bloque APAGA LA CAPA 1 dentro de la transacción del test —el
--    `rollback` final la repone— y deja a la capa 2 sola frente al informativo.
--    A partir de aquí, quitar `is_managed` del núcleo SÍ pone rojo, y el rojo
--    dice cuál de las dos capas se cayó.
--
--    ── POR QUÉ EL PERIODO ES JUNIO ────────────────────────────────────────
--
--    Julio y agosto ya se cerraron en los bloques E y F, y un periodo cerrado
--    no se recalcula nunca (D7-3): reutilizarlos daría cero por la razón
--    equivocada y el bloque pasaría en verde sin medir nada. Junio
--    (2026-05-30 .. 2026-06-30, ver bloque B) está sin cerrar y sin un solo
--    aseo, así que CUALQUIER cifra distinta de cero en su cierre viene del
--    informativo y de nada más.
--
--    ── LAS DOS DEFENSAS SE APAGAN, Y HAY QUE APAGAR LAS DOS ────────────────
--
--    El CHECK prohíbe la FORMA de la fila; el trigger `cleanings_snapshot`
--    reimpone `is_managed` y vigila la máquina de estados. Con solo una de las
--    dos fuera, la fila no se puede escribir y el bloque entero pasaría en
--    verde por vacuidad. Por eso la aserción 95 es el ARNÉS: comprueba que la
--    fila tramposa EXISTE antes de afirmar nada sobre ella. Sin ella, este
--    bloque sería justo el tipo de test que esta fase existe para desenmascarar.
--
--    Lo pone en verde: 07-07 (migración 25) y 07-08 (migración 26), que ya
--    escribieron el filtro. Este bloque no pide código nuevo: pide poder medirlo.
-- ═══════════════════════════════════════════════════════════════════════════

-- Fuera la capa 1. Es DDL dentro de la transacción del test: Postgres la
-- revierte con el `rollback` del final, igual que revierte los `insert`.
select pg_temp.correr($q$
  alter table public.cleanings drop constraint cl_unmanaged_is_inert
$q$) as n_check_fuera \gset

select pg_temp.correr($q$
  alter table public.cleanings disable trigger cleanings_snapshot
$q$) as n_trigger_fuera \gset

-- El informativo que NO debería poder existir: gestión externa, pero completado,
-- con aseadora y con setecientos setenta y siete mil pesos de pago. Es la fila
-- que produciría «alguien añade una columna con default» y que la capa 2 tiene
-- que dejar fuera ella sola.
--
-- `hora_limite` va explícita y no es ruido: la rellenaba el trigger que este
-- bloque acaba de apagar, y la columna es `not null`. Sin ella el insert muere
-- con 23502 y las cuatro aserciones de abajo pasarían en verde sobre una fila
-- que no existe. Medido el 2026-09-13, al escribir el bloque.
select pg_temp.correr($q$
  insert into public.cleanings
    (id, property_id, scheduled_date, tipo, origin, is_managed, hora_limite,
     aseador_id, confirmado_at, state, started_at, finished_at,
     tarifa_huesped, pago_aseador)
  values ('f7000000-0000-0000-0000-000000000901',
          'b7000000-0000-0000-0000-000000000003',
          date '2026-06-15', 'normal', 'manual', false, time '11:00',
          'a7000000-0000-0000-0000-00000000000a', now(), 'completada',
          (timestamp '2026-06-15 08:00') at time zone 'America/Bogota',
          (timestamp '2026-06-15 14:00') at time zone 'America/Bogota',
          777000::bigint, 777000::bigint)
$q$) as n_informativo_vivo \gset

-- 95 EL ARNÉS. Si esta se pone roja, las cuatro de abajo no miden nada y su
--    verde es falso: el orden de lectura importa.
select is(
  pg_temp.escalar($q$
    select count(*)::text
        || '|' || pg_catalog.max(c.state::text)
        || '|' || pg_catalog.max(c.pago_aseador)::text
        || '|' || pg_catalog.max(public.dia_bog(c.finished_at))::text
      from public.cleanings c
     where c.id = 'f7000000-0000-0000-0000-000000000901'
       and not c.is_managed
  $q$),
  '1|completada|777000|2026-06-15',
  'FIN-05 arnes: con el CHECK de inercia y el trigger fuera, el informativo NO inerte existe y cae dentro del periodo de junio');

-- El cierre de junio, por la puerta del job (el núcleo directo). Escritura en su
-- propia sentencia: la trampa 1 de la cabecera aplica igual aquí.
select pg_temp.correr($q$
  select private.cerrar_periodo_core(date '2026-05-30', date '2026-06-30')
$q$) as n_junio_cerrado \gset

-- 96 EL DESGLOSE. Ni una línea del apartamento de gestión externa.
select is(
  pg_temp.escalar($q$
    select count(*)::text
      from public.cleaner_payout_lines l
     where l.property_id = 'b7000000-0000-0000-0000-000000000003'
  $q$),
  '0',
  'FIN-05 con el CHECK fuera, el filtro is_managed del nucleo deja al informativo fuera del desglose el solo');

-- 97 EL MONTO Y EL CONTEO, que es la mitad de FIN-05 que el nulo nunca protegió.
--    Junio no tiene ningún aseo gestionado, así que el cierre tiene que dejar
--    la cabecera del periodo y CERO filas de pago. Un solo peso aquí es el
--    informativo colándose.
select is(
  pg_temp.escalar($q$
    select count(*)::text
        || '|' || coalesce(sum(p.monto_total), 0)::text
      from public.cleaner_payouts p
     where p.periodo_desde = date '2026-05-30'
  $q$),
  '0|0',
  'FIN-05 el cierre de junio no escribe ninguna fila de pago ni un solo peso por el informativo');

-- 98 LAS LECTURAS DEL ADMIN, por la misma vía y con la misma fila tramposa.
--    Es la otra superficie donde FIN-05 se puede romper, y la migración 26
--    repite el filtro justamente por eso.
select is(
  pg_temp.valor_como('ad700000-0000-0000-0000-000000000001', $q$
    select r.aseos_hechos::text || '|' || r.pagado_aseadores::text
      from public.resumen_financiero(date '2026-05-30', date '2026-06-30') r
  $q$),
  '0|0',
  'FIN-05 los KPIs del Resumen tampoco cuentan ni suman al informativo sin la red del CHECK');

-- 99 Y EL DETALLE. Cero filas, no una fila con las cifras en nulo.
select is(
  pg_temp.valor_como('ad700000-0000-0000-0000-000000000001', $q$
    select count(*)::text
      from public.rentabilidad_aseos(date '2026-05-30', date '2026-06-30') r
  $q$),
  '0',
  'FIN-05 el detalle de rentabilidad no lista al informativo sin la red del CHECK');


-- ═══════════════════════════════════════════════════════════════════════════
-- O. LA IDEMPOTENCIA, PERO LA MITAD QUE NADIE MEDÍA — 2 aserciones
--
--    ── SEGUNDO HALLAZGO DEL PLAN 07-14, Y HERMANO DEL BLOQUE N ────────────
--
--    El señuelo 2 de la fase («quitar la salida temprana cuando el periodo ya
--    está cerrado») se corrió el 2026-09-13 y, igual que el 1, NO PUSO NADA EN
--    ROJO. Las 99 aserciones siguieron en verde con la guarda comentada.
--
--    Medido con una sonda directa contra la base, para no especular: con la
--    salida temprana fuera, la segunda corrida sobre un periodo ya cerrado
--    revienta con **23505** sobre `cp_periodo_aseador_unico`.
--
--    Es decir: el dinero NUNCA estuvo en riesgo —el índice único lo impide, y
--    esa es la garantía dura de D7-3—, pero el repo no distinguía entre las dos
--    formas de «no pagar dos veces»:
--
--      (a) No pagar dos veces PORQUE LA SEGUNDA CORRIDA EXPLOTA. El dinero se
--          salva; el job de `pg_cron` queda marcado como fallido en
--          `cron.job_run_details`, y el botón «Cerrar el periodo ahora» del
--          admin le devuelve un error a alguien que no hizo nada mal. La
--          siguiente persona que mire el log va a buscar un defecto que no
--          existe, o —peor— va a aprender a ignorar los cierres fallidos.
--
--      (b) No pagar dos veces PORQUE LA SEGUNDA CORRIDA SALE LIMPIA y devuelve
--          cero. Que es lo que la migración 25 escribió, lo que sus comentarios
--          prometen, y lo que las dos puertas necesitan para poder dispararse
--          a la vez sin coordinarse.
--
--    Las aserciones 31 a 33 del bloque F miden el ESTADO después de repetir el
--    cierre, y (a) y (b) dejan el mismo estado. El valor de retorno y el
--    SQLSTATE de esas corridas se capturaban con `\gset` y no se afirmaban
--    NUNCA. Este bloque los afirma.
--
--    Lo pone en verde: 07-07, migración 25, sin tocar una línea. No pide código
--    nuevo: pide poder medir el código que ya está.
-- ═══════════════════════════════════════════════════════════════════════════

-- 100 LAS TRES REPETICIONES DEL BLOQUE F, POR SU SQLSTATE. Se capturaron allí
--     con `\gset` y las variables de psql siguen vivas hasta el final del
--     archivo, así que esto no vuelve a cerrar nada: audita lo que ya pasó.
select is(
  :'segunda_corrida' || '|' || :'tercera_corrida' || '|' || :'cuarta_corrida',
  'sin_error|sin_error|sin_error',
  'D7-3 las tres corridas repetidas del cierre salieron SIN ERROR, no solo sin mover el pago');

-- 101 Y UNA CORRIDA MÁS, ESTA MIDIENDO EL VALOR DE RETORNO. Cero pagos escritos
--     es la respuesta correcta de un periodo ya cerrado, y es lo que la puerta
--     del admin le enseña a la pantalla. `valor_como` devuelve 'ERROR:<estado>'
--     si la llamada revienta, así que esta aserción distingue las dos formas de
--     «no pagar dos veces» con una sola comparación.
select is(
  pg_temp.valor_como('ad700000-0000-0000-0000-000000000001',
    $q$select public.cerrar_periodo(date '2026-07-01', date '2026-07-31')::text$q$),
  '0',
  'D7-3 una corrida mas sobre el periodo ya cerrado devuelve CERO pagos y no revienta');


select * from finish();
rollback;
