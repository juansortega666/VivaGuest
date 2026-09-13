-- ===========================================================================
-- 27 — LOS PAGOS DEL ADMIN Y LA FRONTERA DEL ASEADOR
--
-- Última migración de la Fase 7. Cierra FIN-03 por el lado de la LECTURA (el
-- cálculo lo hizo la 25) y FIN-04 por el lado de la CONSULTA (el snapshot lo
-- creó la 23).
--
-- ── LA REGLA QUE ORDENA ESTE ARCHIVO ENTERO, CITA LITERAL DEL DUEÑO ────────
--
--     "El aseador ve lo que le llega y punto."
--
-- De esa frase salen las dos funciones de la sección (e) y (f), y de ellas
-- salen cuatro invariantes que NO son de estilo:
--
--   1. SOLO PERIODOS CERRADOS. Nunca el periodo en curso. Razón, y es del
--      dueño: el acumulado del periodo vigente se mueve, y puede BAJAR si se
--      cancela un aseo ya contado. Un número que baja en el teléfono de quien
--      lo va a cobrar es una discusión garantizada. Lo cerrado no cambia nunca
--      (D7-3), así que es lo único que se puede enseñar sin ambigüedad.
--
--   2. SOLO LO SUYO, Y EL FILTRO VA DENTRO. `aseador_id = auth.uid()` vive en
--      el cuerpo de la función, jamás en el `where` de la pantalla. Una
--      pantalla se puede llamar con otro parámetro; una función definer con el
--      filtro adentro, no. PostgREST expone cada RPC como endpoint público: que
--      el componente viva en el árbol del aseador no autoriza nada.
--
--   3. NINGUNA CIFRA DE HUÉSPED NI NINGÚN MARGEN EN NINGÚN `returns table`. Se
--      prueba sobre el catálogo de Postgres y no sobre la fila devuelta: una
--      siembra donde la cifra fuera nula haría pasar una aserción sobre la fila
--      sin demostrar nada, y el dato VIAJA AL TELÉFONO aunque la pantalla no lo
--      pinte. Aserción 43 de `11_financiero.test.sql`.
--
--   4. UN ASEADOR DESACTIVADO PIERDE EL ACCESO DE INMEDIATO. La guarda es
--      `private.is_active_cleaner()`, que consulta `profiles` EN VIVO. Nunca un
--      claim del JWT: un token ya emitido sigue siendo válido hasta que expire,
--      y la desactivación tiene que surtir efecto ya. Es PLAT-04, el criterio 4
--      del ROADMAP, y está medido en este repo.
--
-- ── EL DESGLOSE DEL ADMIN Y EL DEL ASEADOR SON EL MISMO DOCUMENTO ──────────
--
-- `public.detalle_de_pago` y `public.detalle_de_mi_pago` declaran EXACTAMENTE
-- las mismas nueve columnas. No hay una versión recortada para el teléfono ni
-- una ampliada para el escritorio. Si el admin viera una columna de más, el día
-- que alguien reclame estarían comparando dos papeles distintos, y esa
-- conversación se pierde antes de empezar. La simetría es parte del producto y
-- tiene su aserción sobre el catálogo.
--
-- ── LAS LÍNEAS SON TEXTO COPIADO, NO UNIONES VIVAS (FIN-04) ────────────────
--
-- Las dos funciones de detalle NO se unen contra la tabla de aseos, ni contra
-- la de apartamentos, ni contra la de gastos: leen la línea del snapshot y ya.
-- Un aseo borrado por antigüedad sigue mostrando su apartamento, su monto y sus
-- dos fechas. Unirlas volvería a atar el desglose al mundo vivo y desharía
-- FIN-04 desde la lectura, después de que la 23 y la 25 lo hubieran conseguido
-- desde el schema y desde la escritura. Hay una aserción que lee la definición
-- de las dos funciones en el catálogo para impedirlo.
--
-- ── MARCAR PAGADO ES IRREVERSIBLE Y SE COMPORTA COMO TAL ───────────────────
--
--   * Es de ADMIN. Las tres tablas del snapshot no tienen NINGÚN grant de
--     escritura para `authenticated` (migración 23), y eso no es redundante:
--     en Supabase el admin y la aseadora comparten el rol de Postgres, así que
--     con un grant de tabla una aseadora podría marcarse su propio pago.
--     T-07-46.
--   * BLOQUEO DE FILA antes de leer y rechazo explícito si la marca ya existe.
--     Dos pestañas abiertas es el caso real. La interfaz esconde el botón
--     cuando ya está pagado, pero esconder no es impedir: el bloqueo vive en la
--     base. T-07-47.
--   * Guarda el INSTANTE y el AUTOR. Sirve para no pagar dos veces y para saber
--     qué falta. Un pago marcado por nadie es un estado que el sistema no sabe
--     producir. T-07-48.
--
-- ── FORMA DE LOS ERRORES, QUE EN ESTE REPO ES UN CONTRATO ──────────────────
--
-- `mapDbError` (lib/domain/errors.ts, medido contra PostgREST el 2026-09-06)
-- lee el TOKEN DE MÁQUINA en `message` y el ESPAÑOL en `hint`. Devolver el
-- español en `message` pintaría un identificador interno en la cara del
-- usuario. Todas las excepciones de este archivo siguen esa forma.
--
--   42501 -> no autorizado. La pantalla no distingue el recurso.
--   P0001 -> quien llama SÍ está autorizado; lo que falla es el estado o el
--            argumento, y la pantalla necesita poder distinguir los dos casos.
--
-- ── QUÉ NO HACE ESTE ARCHIVO ───────────────────────────────────────────────
--
--   * NO calcula ningún pago. Eso es `private.cerrar_periodo_core` (25).
--   * NO firma ninguna URL de Storage. Devuelve BUCKET Y RUTA. Firmar es
--     trabajo del servidor de la aplicación, después de su propio guard y con
--     su propia expiración (T-07-38). Una función de base que firmara emitiría
--     URLs para todas las filas de la página, incluidas las que nadie abre, y
--     cada una seguiría viva aunque la sesión se cierre un segundo después.
--   * NO otorga ningún grant nuevo sobre las tres tablas del snapshot. Todo
--     sale por función con guarda.
--
-- ── PATRÓN DEFINER, OBLIGATORIO Y NO HEREDABLE ─────────────────────────────
--
-- Las siete definiciones llevan `security definer set search_path = ''`, todo
-- nombre calificado (`auth.uid()` incluido) y su par de `revoke` + `grant`
-- PEGADO a la definición. El `grant execute to public` es el DEFAULT de
-- Postgres para toda función nueva y `alter default privileges` no puede
-- quitárselo: el guardarraíl 9 de `02_guardarrailes.test.sql` es la única red
-- y recorre todas las funciones de `public` y de `private`.
-- ===========================================================================


-- ===========================================================================
-- (a) public.periodos_de_pago()
--     -> la cabecera colapsable de cada periodo en /finanzas/pagos
--
-- UI-SPEC §9.1: un bloque por periodo cerrado, del más reciente al más antiguo.
--
-- ── LAS DOS FECHAS SON COLUMNAS DE FECHA, NO UNA ETIQUETA DE TEXTO ─────────
--
-- En Pagos cada periodo se rotula con SUS DOS FECHAS y nunca solo con el nombre
-- del mes. Es D7-5 en la pantalla: el periodo va de cierre a cierre, así que el
-- de junio de 2026 empieza el 30 de MAYO. Un recibo que dice "junio" y cubre
-- del 30 de mayo al 30 de junio sin decirlo es una discusión esperando a
-- ocurrir. Devolver una etiqueta ya formateada además le quitaría a la pantalla
-- la posibilidad de abreviar («Del 1 al 30 de enero») sin repetir el parseo.
--
-- ── LEFT JOIN Y NO JOIN, CON RAZÓN ────────────────────────────────────────
--
-- Un periodo puede cerrarse sin que nadie haya trabajado (un mes entero sin
-- aseos completados es raro pero legal, y el cierre escribe la cabecera igual).
-- Con un `join` ese periodo desaparecería de la lista y el admin no tendría
-- forma de ver que SÍ se cerró: leería la ausencia como «el job falló», que es
-- la conclusión contraria.
--
-- ── EL CONTADOR DE ASEOS NO COMPUTADOS VIENE DE LA CABECERA, NO SE RECALCULA ─
--
-- Se congeló en el momento del cierre (migración 25) a propósito. Recalcularlo
-- aquí haría que el número cambiara solo, meses después, cuando alguien
-- cancelara un aseo viejo. El snapshot es un documento contable.
-- ===========================================================================
create or replace function public.periodos_de_pago()
returns table (
  periodo_desde       date,
  periodo_hasta       date,
  personas            int,
  monto_total         bigint,
  faltan_por_pagar    int,
  aseos_no_computados int,
  moneda              text
)
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  -- ── LA GUARDA. PRIMERA SENTENCIA EJECUTABLE DEL CUERPO. ─────────────────
  if not (select private.is_admin()) then
    raise exception 'no_autorizado'
      using errcode = '42501',
            hint    = 'El registro de pagos es información del negocio: solo lo ve un administrador activo.';
  end if;

  return query
    select pp.periodo_desde,
           pp.periodo_hasta,
           pg_catalog.count(cp.id)::int,
           -- `sum(bigint)` devuelve `numeric`, y supabase-js entrega numeric
           -- como CADENA para no perder precisión: '195000' + 1 da '1950001'
           -- en TypeScript, en silencio. El cast a bigint es obligatorio y la
           -- aserción 30 del contrato lo mide sobre el catálogo de tipos.
           coalesce(pg_catalog.sum(cp.monto_total), 0)::bigint,
           pg_catalog.count(*) filter (
             where cp.id is not null and cp.pagado_at is null)::int,
           pp.aseos_no_computados,
           pp.moneda
      from public.payout_periods pp
      left join public.cleaner_payouts cp
        on cp.periodo_desde = pp.periodo_desde
     group by pp.periodo_desde, pp.periodo_hasta,
              pp.aseos_no_computados, pp.moneda
     -- Del más reciente al más antiguo: lo que el admin necesita casi siempre
     -- es el periodo que acaba de cerrar, y la pantalla abre solo el primero.
     order by pp.periodo_desde desc;
end
$fn$;

comment on function public.periodos_de_pago() is
  'Cabecera colapsable de cada periodo en /finanzas/pagos (UI-SPEC §9.1): las DOS fechas reales del periodo, cuántas personas, el total, cuántas faltan por pagar y el contador de aseos no computados. Las dos fechas son columnas de fecha y NO una etiqueta de texto, porque D7-5 hace que el periodo vaya de cierre a cierre y el de junio de 2026 empiece el 30 de mayo: rotular con el nombre del mes es la discusión que esta columna existe para evitar. left join y no join: un periodo cerrado sin trabajo desaparecería de la lista y el admin leería esa ausencia como «el job falló». El contador de aseos no computados se LEE de la cabecera, no se recalcula: se congeló en el cierre para que no cambie solo meses después. Guarda de admin como primera sentencia.';

revoke all     on function public.periodos_de_pago() from public, anon;
grant  execute on function public.periodos_de_pago() to authenticated;


-- ===========================================================================
-- (b) public.pagos_del_periodo(p_desde date)
--     -> la tabla interna de cada bloque de periodo
--
-- UI-SPEC §9.1, columnas 1 a 6.
--
-- ── LAS DOS PARTIDAS POR SEPARADO, Y NO UN TOTAL PLANO ────────────────────
--
-- Es D7-2 en la tabla. El snapshot guarda `monto_aseos` y `monto_gastos` en
-- columnas distintas justamente para esto: con un total plano no hay forma de
-- decirle a una persona cuánto de lo que recibe es su trabajo y cuánto es el
-- reembolso de lo que puso de su bolsillo, y esa es la pregunta que hace
-- siempre.
--
-- ── NO DEVUELVE `aseador_id`, Y ES DELIBERADO ─────────────────────────────
--
-- La columna 1 pinta iniciales y nombre, y el nombre es TEXTO COPIADO en el
-- snapshot (FIN-04). Devolver además el identificador vivo invitaría a que la
-- pantalla lo usara para enlazar a la ficha, y ese enlace apuntaría a un perfil
-- que puede ya no existir: la clave foránea es `on delete set null`, así que un
-- pago de alguien que se fue conserva su nombre y pierde su identificador. El
-- desglose se abre por `payout_id`, que sí es estable.
--
-- El argumento es `p_desde` y no el rango entero porque `periodo_desde` es la
-- clave primaria de la cabecera: pedir las dos fechas dejaría que el cliente
-- inventara una combinación que no existe y recibiera cero filas como si fuera
-- un dato.
-- ===========================================================================
create or replace function public.pagos_del_periodo(p_desde date)
returns table (
  payout_id      uuid,
  aseador_nombre text,
  cantidad_aseos int,
  monto_aseos    bigint,
  monto_gastos   bigint,
  monto_total    bigint,
  moneda         text,
  pagado_at      timestamptz
)
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  -- ── LA GUARDA. PRIMERA SENTENCIA EJECUTABLE DEL CUERPO. ─────────────────
  if not (select private.is_admin()) then
    raise exception 'no_autorizado'
      using errcode = '42501',
            hint    = 'Los pagos del periodo son información del negocio: solo los ve un administrador activo.';
  end if;

  return query
    select cp.id,
           cp.aseador_nombre,
           cp.cantidad_aseos,
           cp.monto_aseos,
           cp.monto_gastos,
           cp.monto_total,
           cp.moneda,
           cp.pagado_at
      from public.cleaner_payouts cp
     where cp.periodo_desde = p_desde
     -- ALFABÉTICO, igual que el bloque 3 del Resumen y por el mismo argumento:
     -- una lista de personas ordenada de mayor a menor se lee como un podio
     -- aunque no lleve números ni medallas. El desempate por identificador hace
     -- el orden TOTAL: sin él, dos personas homónimas podrían alternar de sitio
     -- entre dos lecturas de la misma pantalla.
     order by cp.aseador_nombre, cp.id;
end
$fn$;

comment on function public.pagos_del_periodo(date) is
  'Tabla interna de cada bloque de periodo en /finanzas/pagos (UI-SPEC §9.1). Devuelve LAS DOS PARTIDAS POR SEPARADO además del total, que es D7-2 en la tabla: con un total plano no se le puede decir a una persona cuánto es su trabajo y cuánto el reembolso de lo que puso de su bolsillo, y esa es la pregunta que hace siempre. NO devuelve aseador_id a propósito: el nombre es texto copiado del snapshot y la clave foránea al perfil es on delete set null, así que un enlace a la ficha apuntaría a un perfil que puede no existir; el desglose se abre por payout_id, que sí es estable. Orden alfabético con desempate por identificador, igual que el bloque 3 del Resumen. Guarda de admin como primera sentencia.';

revoke all     on function public.pagos_del_periodo(date) from public, anon;
grant  execute on function public.pagos_del_periodo(date) to authenticated;


-- ===========================================================================
-- (c) public.pagos_de_aseadora(p_aseador uuid)
--     -> bloque 3 de la ficha de una persona
--
-- UI-SPEC §8.2.
--
-- ── NO RECIBE RANGO, Y ESO NO ES UN OLVIDO ────────────────────────────────
--
-- Este bloque IGNORA a propósito el filtro de periodo de la pantalla, y la
-- interfaz lo dice con su leyenda. Los pagos son HISTORIAL: filtrarlos por el
-- rango de arriba dejaría «sus pagos» con una sola fila cuando el filtro está
-- puesto en día, y una fila no responde ninguna pregunta. La ausencia del
-- argumento es la forma más barata de impedir que alguien «arregle» el bloque
-- pasándole el rango de la pantalla, y tiene su aserción sobre el número de
-- argumentos en el catálogo.
--
-- Devuelve las dos partidas además del total por la misma razón que (b) y para
-- que la ficha y la pantalla de Pagos hablen del mismo dinero con las mismas
-- columnas.
-- ===========================================================================
create or replace function public.pagos_de_aseadora(p_aseador uuid)
returns table (
  payout_id     uuid,
  periodo_desde date,
  periodo_hasta date,
  monto_aseos   bigint,
  monto_gastos  bigint,
  monto_total   bigint,
  moneda        text,
  pagado_at     timestamptz
)
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  -- ── LA GUARDA. PRIMERA SENTENCIA EJECUTABLE DEL CUERPO. ─────────────────
  if not (select private.is_admin()) then
    raise exception 'no_autorizado'
      using errcode = '42501',
            hint    = 'El historial de pagos de una persona es información del negocio: solo lo ve un administrador activo.';
  end if;

  return query
    select cp.id,
           cp.periodo_desde,
           cp.periodo_hasta,
           cp.monto_aseos,
           cp.monto_gastos,
           cp.monto_total,
           cp.moneda,
           cp.pagado_at
      from public.cleaner_payouts cp
     where cp.aseador_id = p_aseador
     order by cp.periodo_desde desc;
end
$fn$;

comment on function public.pagos_de_aseadora(uuid) is
  'Bloque 3 de la ficha de una persona (UI-SPEC §8.2): TODOS sus periodos cerrados, del más reciente al más antiguo. NO RECIBE RANGO A PROPÓSITO, y la ausencia del argumento es el mecanismo: los pagos son historial, y filtrarlos por el selector de periodo de la pantalla dejaría «sus pagos» con una sola fila cuando el filtro está en día, que no responde ninguna pregunta. Devuelve las dos partidas además del total, igual que pagos_del_periodo, para que la ficha y la pantalla de Pagos hablen del mismo dinero con las mismas columnas. Lee el snapshot y no el mundo vivo: un pago de alguien que ya no trabaja aquí sigue apareciendo. Guarda de admin como primera sentencia.';

revoke all     on function public.pagos_de_aseadora(uuid) from public, anon;
grant  execute on function public.pagos_de_aseadora(uuid) to authenticated;


-- ===========================================================================
-- (d) public.detalle_de_pago(p_payout uuid)
--     -> el Sheet de desglose del admin
--
-- UI-SPEC §9.3.
--
-- ── LEE LA LÍNEA Y YA. CERO UNIONES CONTRA EL MUNDO VIVO (FIN-04) ─────────
--
-- Todo lo legible (nombre del apartamento, concepto, monto, las dos fechas, la
-- ruta de la evidencia) está COPIADO COMO TEXTO en la línea desde el cierre.
-- Unir aquí contra las tablas vivas para «enriquecer» la fila desharía FIN-04
-- desde la lectura: el criterio 3 del ROADMAP dice que borrar a mano un aseo de
-- un periodo cerrado deja el pago y su desglose intactos, y una unión lo
-- convertiría en una fila fantasma o la haría desaparecer. Hay una aserción que
-- lee esta definición en el catálogo para que nadie la añada después.
--
-- Consecuencia declarada para la pantalla: NO se renderiza ningún enlace desde
-- estas líneas. Apuntarían a filas que pueden no existir.
--
-- ── LAS DOS FECHAS POR LÍNEA DE ASEO, SIEMPRE (D7-8) ──────────────────────
--
-- «Programado 28 ene · Hecho 2 feb», y no se abrevia cuando coinciden: si la
-- segunda fecha apareciera solo en los casos raros dejaría de ser información y
-- pasaría a ser una señal de alarma. Un aseo de enero en el recibo de febrero
-- parece un error si no se dice cuándo se programó y cuándo se hizo.
--
-- ── NINGUNA CIFRA DE HUÉSPED, TAMPOCO AQUÍ ────────────────────────────────
--
-- Y no es porque el aseador vaya a ver esta función (es de admin y tiene su
-- guarda): es porque su gemela del teléfono declara estas mismas nueve
-- columnas. Si el admin viera una de más, el día que alguien reclame estarían
-- comparando dos papeles distintos.
-- ===========================================================================
create or replace function public.detalle_de_pago(p_payout uuid)
returns table (
  tipo             text,
  property_nombre  text,
  concepto         text,
  fecha_programada date,
  fecha_ejecucion  date,
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
  -- ── LA GUARDA. PRIMERA SENTENCIA EJECUTABLE DEL CUERPO. ─────────────────
  if not (select private.is_admin()) then
    raise exception 'no_autorizado'
      using errcode = '42501',
            hint    = 'El desglose de un pago es información del negocio: solo lo ve un administrador activo.';
  end if;

  return query
    select l.tipo,
           l.property_nombre,
           l.concepto,
           l.fecha_programada,
           l.fecha_ejecucion,
           l.monto,
           l.moneda,
           -- BUCKET Y RUTA, NUNCA UNA URL FIRMADA (T-07-38). La ruta sola no
           -- abre nada; una URL firmada sobrevive al cierre de sesión hasta que
           -- expire, y aquí se emitirían para todas las filas de la página.
           l.evidencia_bucket,
           l.evidencia_path
      from public.cleaner_payout_lines l
     where l.payout_id = p_payout
     -- `orden` es la secuencia contigua que el cierre escribió: aseos primero,
     -- gastos después, y dentro de cada grupo por fecha de ejecución. Ordenar
     -- aquí por cualquier otra cosa haría que el mismo recibo se leyera
     -- distinto en dos visitas.
     order by l.orden;
end
$fn$;

comment on function public.detalle_de_pago(uuid) is
  'Sheet de desglose de /finanzas/pagos (UI-SPEC §9.3). LEE LA LÍNEA DEL SNAPSHOT Y YA: cero uniones contra las tablas vivas, porque todo lo legible está copiado como texto desde el cierre y unir aquí desharía FIN-04 desde la lectura (criterio 3 del ROADMAP: borrar a mano un aseo de un periodo cerrado deja el pago y su desglose intactos). Consecuencia para la pantalla: no se renderiza ningún enlace desde estas líneas, apuntarían a filas que pueden no existir. Las DOS fechas por línea de aseo, siempre y sin abreviar cuando coinciden (D7-8): si la segunda apareciera solo en los casos raros dejaría de ser información y pasaría a ser una señal de alarma. Devuelve BUCKET Y RUTA de la evidencia, nunca una URL firmada (T-07-38). Declara EXACTAMENTE las mismas nueve columnas que detalle_de_mi_pago: el desglose del admin y el del aseador tienen que ser el mismo documento, o el día que alguien reclame estarán comparando dos papeles distintos. Guarda de admin como primera sentencia.';

revoke all     on function public.detalle_de_pago(uuid) from public, anon;
grant  execute on function public.detalle_de_pago(uuid) to authenticated;


-- ===========================================================================
-- (e) public.marcar_pago_pagado(p_payout uuid)
--     -> la única acción de escritura de /finanzas/pagos
--
-- UI-SPEC §9.2. Es la última pantalla antes de una transferencia real.
--
-- ── POR QUÉ HAY UN RPC Y NO UN UPDATE ─────────────────────────────────────
--
-- `public.cleaner_payouts` no tiene NINGÚN grant de escritura para
-- `authenticated` (migración 23), y eso no es paranoia: en Supabase el admin y
-- la aseadora comparten el rol de Postgres `authenticated`, así que un grant de
-- tabla le daría a una aseadora la capacidad de marcarse su propio pago. Con
-- policies se puede separar por FILA, pero la aseadora ES el dueño de la fila
-- de su pago, así que ni siquiera eso serviría. T-07-46.
--
-- ── EL BLOQUEO DE FILA, Y POR QUÉ NO BASTA EL `where pagado_at is null` ────
--
-- `select ... for update` ANTES de leer el estado. Dos pestañas abiertas es el
-- caso real, no el teórico: el admin repasa la lista, abre el diálogo en una,
-- vuelve a la otra y confirma dos veces. Sin el bloqueo, en lectura confirmada
-- las dos transacciones leerían `pagado_at` nulo y la segunda pisaría la fecha
-- y el autor de la primera EN SILENCIO, dejando constancia de un pago hecho por
-- quien no lo hizo.
--
-- Un `update ... where pagado_at is null` evitaría el pisado pero devolvería
-- cero filas, que la pantalla leería como éxito vacío. El requisito es
-- RECHAZAR, con un error que la interfaz pueda contar: T-07-47.
--
-- ── EL ERROR DEL SEGUNDO INTENTO ES P0001 Y NO 42501 ──────────────────────
--
-- Quien llama SÍ está autorizado. Lo que está mal es el ESTADO de la fila, y la
-- pantalla necesita poder distinguir los dos casos: uno se resuelve recargando
-- y el otro no se resuelve.
--
-- ── LA AUTORÍA ────────────────────────────────────────────────────────────
--
-- `auth.uid()` y no un parámetro. Un identificador que viaja como argumento es
-- un identificador que el cliente elige, y la autoría de una marca irreversible
-- sobre dinero no se le pregunta al cliente. T-07-48.
-- ===========================================================================
create or replace function public.marcar_pago_pagado(p_payout uuid)
returns table (
  payout_id      uuid,
  aseador_nombre text,
  monto_total    bigint,
  moneda         text,
  pagado_at      timestamptz
)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_nombre text;
  v_total  bigint;
  v_moneda text;
  v_marca  timestamptz;
  v_ahora  timestamptz;
begin
  -- ── LA GUARDA. PRIMERA SENTENCIA EJECUTABLE DEL CUERPO. ─────────────────
  -- `private.is_admin()` consulta `profiles` EN LA BASE, nunca un claim del
  -- JWT: un admin degradado hace un minuto no puede registrar un pago con su
  -- token todavía vivo.
  if not (select private.is_admin()) then
    raise exception 'no_autorizado'
      using errcode = '42501',
            hint    = 'Registrar un pago es una acción de administrador.';
  end if;

  -- EL BLOQUEO VA ANTES DE LEER EL ESTADO, no después.
  select cp.aseador_nombre, cp.monto_total, cp.moneda, cp.pagado_at
    into v_nombre, v_total, v_moneda, v_marca
    from public.cleaner_payouts cp
   where cp.id = p_payout
     for update;

  if not found then
    -- P0001 y no 42501: quien llama es admin y puede ver todos los pagos, así
    -- que aquí no hay nada que ocultarle. Decirle que el identificador no
    -- existe es la única forma de que sepa que la lista que tiene abierta está
    -- vieja.
    raise exception 'pago_no_encontrado'
      using errcode = 'P0001',
            hint    = 'Ese pago ya no existe. Recarga la lista de pagos.';
  end if;

  if v_marca is not null then
    raise exception 'pago_ya_marcado'
      using errcode = 'P0001',
            hint    = 'Este pago ya figura como pagado. Si lo tienes abierto en dos pestañas, recarga la lista.';
  end if;

  v_ahora := pg_catalog.now();

  update public.cleaner_payouts cp
     set pagado_at  = v_ahora,
         pagado_por = (select auth.uid())
   where cp.id = p_payout;

  -- Lo que el aviso de éxito de la pantalla necesita, literal: «Registrado.
  -- María González, $ 540.000.» El nombre sale del snapshot y no de un join
  -- vivo, por la misma razón que en (b).
  return query select p_payout, v_nombre, v_total, v_moneda, v_ahora;
end
$fn$;

comment on function public.marcar_pago_pagado(uuid) is
  'La única escritura de /finanzas/pagos (UI-SPEC §9.2), y es irreversible desde la interfaz. Existe como RPC y no como update porque cleaner_payouts no tiene grant de escritura para authenticated: en Supabase el admin y la aseadora comparten rol de Postgres, y la aseadora ES el dueño de la fila de su pago, así que ni un grant de tabla ni una policy por fila servirían (T-07-46). BLOQUEA LA FILA antes de leer el estado: dos pestañas abiertas es el caso real, y sin el bloqueo las dos transacciones leerían la marca nula y la segunda pisaría la fecha y el autor de la primera en silencio. Un update con where pagado_at is null evitaría el pisado pero devolvería cero filas, que la pantalla leería como éxito vacío; el requisito es RECHAZAR (T-07-47). El segundo intento levanta P0001 y no 42501 porque quien llama sí está autorizado y lo que falla es el estado. La autoría sale de auth.uid() y nunca de un parámetro: un identificador que viaja como argumento es un identificador que el cliente elige, y la autoría de una marca irreversible sobre dinero no se le pregunta al cliente (T-07-48).';

revoke all     on function public.marcar_pago_pagado(uuid) from public, anon;
grant  execute on function public.marcar_pago_pagado(uuid) to authenticated;


-- ===========================================================================
-- (f) public.mis_pagos_cerrados()
--     -> la lista de /mis-pagos, en el teléfono del aseador
--
-- UI-SPEC §10.3. AQUÍ EMPIEZA LA FRONTERA.
--
-- ── LAS TRES GUARDAS, EN ESTE ORDEN Y TODAS DENTRO DE LA FUNCIÓN ──────────
--
--   1. La cuenta es de aseador Y SIGUE ACTIVA, consultando el perfil en vivo.
--      `private.is_active_cleaner()` y nunca un claim del token: un token ya
--      emitido sigue siendo válido hasta que expire, y una aseadora desactivada
--      tiene que perder el acceso de inmediato aunque su sesión siga abierta.
--      Es PLAT-04 y el criterio 4 del ROADMAP.
--
--   2. El filtro por dueño, contra el identificador de la sesión. DENTRO, no en
--      el `where` de la pantalla: una pantalla se puede llamar con otro
--      parámetro, una función definer con el filtro adentro no.
--
--   3. SOLO PERIODOS CON CIERRE. La unión contra la cabecera del periodo es la
--      que lo implementa.
--
-- ── POR QUÉ LA UNIÓN CONTRA LA CABECERA, SI LA CLAVE FORÁNEA YA LA GARANTIZA ─
--
-- Hoy es redundante: `cleaner_payouts.periodo_desde` referencia la cabecera y
-- el único que escribe pagos es el cierre. Se escribe igual porque la REGLA es
-- «solo lo cerrado» y una regla que solo existe como efecto lateral de una
-- clave foránea es una regla que desaparece el día que alguien siembre un pago
-- por otra vía. Cuesta una línea y hace la intención legible.
--
-- ── POR QUÉ EL PERIODO EN CURSO NO EXISTE AQUÍ (D7-4.3) ───────────────────
--
-- Decisión del dueño, con su razón: el acumulado del periodo vigente se mueve y
-- puede BAJAR si se cancela un aseo ya contado. Un número que baja en el
-- teléfono de quien lo va a cobrar es una discusión garantizada. Lo cerrado no
-- cambia nunca (D7-3), así que es lo único que se puede enseñar sin ambigüedad.
--
-- ── LO QUE NO DECLARA, QUE ES LA MITAD DEL VALOR DE LA FUNCIÓN ────────────
--
-- Ninguna cifra de lo cobrado al huésped, ningún margen, ninguna cifra agregada
-- de la que se pueda derivar un margen, y ningún pago de otra persona. Se mide
-- sobre el `returns table` en el catálogo y no sobre la fila devuelta: el dato
-- viaja al teléfono aunque la pantalla no lo pinte.
--
-- ── DEVUELVE `payout_id`, Y EL CONTRATO ORIGINAL NO LO LISTABA ────────────
--
-- Adición declarada de este plan. UI-SPEC §10.3 hace la tarjeta navegable a
-- /mis-pagos/[id] y §10.4 abre el desglose con ese identificador; el aseador no
-- tiene grant sobre la tabla de pagos, así que si esta función no devuelve el
-- identificador no hay NINGUNA otra vía de obtenerlo y la pantalla de desglose
-- queda inalcanzable. No es una cifra de huésped ni un margen, así que no toca
-- la frontera.
-- ===========================================================================
create or replace function public.mis_pagos_cerrados()
returns table (
  payout_id     uuid,
  periodo_desde date,
  periodo_hasta date,
  monto_aseos   bigint,
  monto_gastos  bigint,
  monto_total   bigint,
  moneda        text,
  pagado_at     timestamptz
)
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  -- ── GUARDA 1: ES ASEADOR Y SIGUE ACTIVO, SEGÚN LA BASE Y AHORA MISMO. ───
  if not (select private.is_active_cleaner()) then
    raise exception 'no_autorizado'
      using errcode = '42501',
            hint    = 'Esta consulta es de la app del aseador.';
  end if;

  return query
    select cp.id,
           -- LAS DOS FECHAS REALES DEL PERIODO, nunca solo el nombre del mes:
           -- el periodo va de cierre a cierre (D7-5) y no coincide con el mes
           -- calendario. Un recibo que dice «enero» y cubre del 1 al 30 sin
           -- decirlo es una discusión esperando a ocurrir.
           cp.periodo_desde,
           cp.periodo_hasta,
           cp.monto_aseos,
           cp.monto_gastos,
           cp.monto_total,
           cp.moneda,
           cp.pagado_at
      from public.cleaner_payouts cp
      -- GUARDA 3: SOLO PERIODOS CON CIERRE.
      join public.payout_periods pp
        on pp.periodo_desde = cp.periodo_desde
     -- GUARDA 2: EL FILTRO POR DUEÑO, DENTRO DE LA FUNCIÓN.
     where cp.aseador_id = (select auth.uid())
     order by cp.periodo_desde desc;
end
$fn$;

comment on function public.mis_pagos_cerrados() is
  'D7-4.3. La lista de /mis-pagos (UI-SPEC §10.3), y es la mitad de la única superficie de dinero que un aseador ve en su vida. Cita del dueño: «el aseador ve lo que le llega y punto». Tres guardas, todas dentro del cuerpo: (1) la cuenta es de aseador Y SIGUE ACTIVA según profiles en vivo, nunca según un claim del token, porque un token ya emitido vale hasta que expire y una desactivación tiene que surtir efecto de inmediato (PLAT-04, criterio 4 del ROADMAP); (2) el filtro por dueño contra auth.uid() vive AQUÍ y no en el where de la pantalla, porque una pantalla se puede llamar con otro parámetro; (3) solo periodos con cierre, porque el acumulado del periodo en curso se mueve y puede BAJAR si se cancela un aseo ya contado, y un número que baja en el teléfono de quien lo va a cobrar es una discusión garantizada. Devuelve las DOS fechas reales del periodo y nunca el nombre del mes (D7-5). NO DECLARA ninguna cifra de huésped, ningún margen ni ninguna cifra de la que se pueda derivar uno, y eso se mide sobre el returns table en el catálogo y no sobre la fila: el dato viaja al teléfono aunque la pantalla no lo pinte. payout_id es adición declarada del plan 07-09: sin él la pantalla de desglose sería inalcanzable, porque el aseador no tiene grant sobre la tabla.';

revoke all     on function public.mis_pagos_cerrados() from public, anon;
grant  execute on function public.mis_pagos_cerrados() to authenticated;


-- ===========================================================================
-- (g) public.detalle_de_mi_pago(p_payout uuid)
--     -> /mis-pagos/[id]
--
-- UI-SPEC §10.4. LA OTRA MITAD DE LA FRONTERA.
--
-- ── LA VERIFICACIÓN DE DUEÑO VA ANTES DE DEVOLVER UNA SOLA LÍNEA ──────────
--
-- Es el mismo endpoint con otro identificador (T-07-42): la superficie de
-- ataque no es la pantalla, es el argumento. La comprobación exige las dos
-- cosas a la vez, que el pago sea suyo y que su periodo esté cerrado.
--
-- ── LA DENEGACIÓN ES UNA SOLA Y ES INDISTINGUIBLE ─────────────────────────
--
-- «No existe», «no es tuyo» y «no está cerrado» levantan EXACTAMENTE la misma
-- excepción. Distinguirlas convertiría esta función en un oráculo de
-- enumeración de pagos ajenos: con respuestas distintas, quien probara
-- identificadores al azar aprendería cuáles existen. Es la misma razón por la
-- que el RPC del código de acceso lanza una sola denegación para sus tres
-- casos, y aquí además hay una aserción que compara las dos respuestas.
--
-- 42501 y no cero filas, a propósito: pedir el desglose de un pago ajeno es un
-- intento de acceso, no una consulta vacía, y la diferencia importa el día que
-- alguien mire los registros.
--
-- ── LAS MISMAS NUEVE COLUMNAS QUE EL DESGLOSE DEL ADMIN ───────────────────
--
-- Ni una de más ni una de menos. Es la regla del mismo documento, y tiene su
-- aserción comparando las dos firmas en el catálogo.
--
-- ── Y AQUÍ TAMPOCO SE UNE CONTRA EL MUNDO VIVO ───────────────────────────
--
-- Lee la línea del snapshot y ya, igual que (d). Un aseo purgado por antigüedad
-- sigue apareciendo en el recibo de quien ya lo cobró.
-- ===========================================================================
create or replace function public.detalle_de_mi_pago(p_payout uuid)
returns table (
  tipo             text,
  property_nombre  text,
  concepto         text,
  fecha_programada date,
  fecha_ejecucion  date,
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
  -- ── GUARDA 1: ES ASEADOR Y SIGUE ACTIVO, SEGÚN LA BASE Y AHORA MISMO. ───
  if not (select private.is_active_cleaner()) then
    raise exception 'no_autorizado'
      using errcode = '42501',
            hint    = 'Esta consulta es de la app del aseador.';
  end if;

  -- ── GUARDA 2: EL PAGO ES SUYO Y SU PERIODO ESTÁ CERRADO. ────────────────
  -- Una sola denegación para los tres casos. Ver la cabecera.
  if not exists (
       select 1
         from public.cleaner_payouts cp
         join public.payout_periods pp
           on pp.periodo_desde = cp.periodo_desde
        where cp.id = p_payout
          and cp.aseador_id = (select auth.uid())
     ) then
    raise exception 'no_autorizado'
      using errcode = '42501',
            hint    = 'Ese pago no está disponible.';
  end if;

  return query
    select l.tipo,
           l.property_nombre,
           l.concepto,
           -- LAS DOS FECHAS, SIEMPRE (D7-8). Un aseo de enero en el recibo de
           -- febrero parece un error si no se dice cuándo se programó y cuándo
           -- se hizo, y quien lo cobra es la persona que lo hizo.
           l.fecha_programada,
           l.fecha_ejecucion,
           l.monto,
           l.moneda,
           -- Bucket y ruta, nunca una URL firmada. T-07-38.
           l.evidencia_bucket,
           l.evidencia_path
      from public.cleaner_payout_lines l
     where l.payout_id = p_payout
     order by l.orden;
end
$fn$;

comment on function public.detalle_de_mi_pago(uuid) is
  'D7-4.3 y D7-7. El desglose de /mis-pagos/[id] (UI-SPEC §10.4), la otra mitad de la única superficie de dinero que un aseador ve. La verificación de dueño va ANTES de devolver una sola línea, porque es el mismo endpoint con otro identificador (T-07-42): la superficie no es la pantalla, es el argumento. LA DENEGACIÓN ES UNA SOLA Y ES INDISTINGUIBLE entre «no existe», «no es tuyo» y «no está cerrado»: distinguirlas convertiría la función en un oráculo de enumeración de pagos ajenos, que es la misma razón por la que el RPC del código de acceso lanza una sola denegación para sus tres casos. 42501 y no cero filas, porque pedir el desglose de un pago ajeno es un intento de acceso y no una consulta vacía. Declara EXACTAMENTE las mismas nueve columnas que detalle_de_pago, ni una de más ni una de menos: si el admin viera una columna de más, el día que alguien reclame estarían comparando dos papeles distintos. Lee la línea del snapshot y no se une contra el mundo vivo, así que un aseo purgado por antigüedad sigue apareciendo en el recibo de quien ya lo cobró (FIN-04). Guarda de aseador activo como primera sentencia, contra profiles en vivo y nunca contra un claim del token.';

revoke all     on function public.detalle_de_mi_pago(uuid) from public, anon;
grant  execute on function public.detalle_de_mi_pago(uuid) to authenticated;
