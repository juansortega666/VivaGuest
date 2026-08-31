-- ============================================================================
-- 05 — Snapshot financiero, máquina de estados y log de auditoría
--
-- Tres piezas que comparten una sola idea: los invariantes del aseo no viven en
-- la aplicación, viven en la base. Todo lo que escribe en `cleanings` pasa por
-- estos triggers, venga de un RPC, del panel del admin, de un job de la Fase 3
-- o de una conexión con la clave de servicio. BYPASSRLS salta la RLS; no salta
-- los triggers.
--
--   A. `tg_cleanings_snapshot()`  BEFORE INSERT OR UPDATE — FIN-01 + is_managed
--   B. La guarda de transiciones, DENTRO de esa misma función BEFORE
--   C. `cleaning_state_transitions` + `tg_cleanings_log_transition()` AFTER
--
-- DIVERGENCIAS respecto a `.planning/research/ARCHITECTURE.md`:
--
--   1. La función de §"el cálculo financiero es un SNAPSHOT" se copia casi
--      literal, pero se le AÑADE la guarda de transiciones. El hueco está
--      medido en `01-RESEARCH.md` §3.6: la rama UPDATE del documento protege
--      `is_managed` pero deja que un aseo `completada` vuelva a `en_curso`. Los
--      `cl_*_shape` de la migración 04 validan la coherencia interna de cada
--      estado, no las transiciones legales entre ellos.
--
--   2. `cleaning_state_transitions` no aparece en el DDL de ARCHITECTURE.md.
--      La exige `01-CONTEXT.md` ("máquina de estados del aseo con log de
--      auditoría de transiciones") y la resuelve la Open Question 4 de
--      `01-RESEARCH.md` con esta forma exacta.
--
--   3. NO se registra el INSERT como transición. El estado inicial se deriva de
--      `cleanings.created_at` + `state`; una fila `NULL -> pendiente` por cada
--      aseo duplicaría información sin aportar nada. La aserción 10 de
--      `01_invariantes.test.sql` cuenta 2 transiciones para el recorrido
--      `pendiente -> en_curso -> completada`, que es justo esta decisión.
--
-- Lleva bloque REVOKE de cierre, igual que las migraciones 03 y 04: con la CLI
-- 2.116.0 toda tabla y toda secuencia nueva de `public` nace con privilegios
-- para `anon` y `authenticated`. La solución de raíz (revocar los DEFAULT
-- PRIVILEGES) sigue siendo del plan 01-07.
--
-- Sin RLS, sin policies y sin grants: eso es el plan 01-07.
-- ============================================================================


-- ===========================================================================
-- A + B — tg_cleanings_snapshot()
--
-- Un solo trigger BEFORE para las dos cosas porque las dos deciden cuál es la
-- fila que se va a escribir, y el orden entre ellas importa: primero se fija
-- `is_managed` (del que dependen `cl_unmanaged_is_inert` y
-- `cl_managed_has_state`), después se valida la transición.
--
-- Los CHECK de tabla se evalúan DESPUÉS de los triggers BEFORE, así que esta
-- función es la que hace que los fixtures de la suite puedan insertar un aseo
-- sin pasar `is_managed`, `hora_limite` ni `state`. Esas tres columnas nacen
-- sin default a propósito (decisión del plan 01-04): un default sería una
-- respuesta inventada y convertiría un fallo del trigger en un verde
-- accidental.
--
-- `set search_path = ''` aunque no sea SECURITY DEFINER: es la regla uniforme
-- del repo desde la migración 01. Obliga a calificar todo por esquema.
-- ===========================================================================
create or replace function public.tg_cleanings_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  p       public.properties%rowtype;
  v_legal boolean;
begin
  if tg_op = 'INSERT' then

    -- `into strict`: si el apartamento no existe, la FK lo rechazaría igual,
    -- pero al final de la sentencia. Aquí revienta antes con P0002 y con el
    -- property_id a la vista. Es la forma de ARCHITECTURE.md.
    select * into strict p from public.properties where id = new.property_id;

    -- SNAPSHOT del discriminador de gestión. No es un join vivo contra
    -- properties.gestion_vivaguest: si un apartamento cambia de modalidad, un
    -- join reescribiría retroactivamente la naturaleza de todo su histórico.
    new.is_managed  := p.gestion_vivaguest;

    -- APTO-05. `coalesce` y no asignación directa: un aseo puntual puede
    -- pactar una hora límite distinta a la del apartamento.
    new.hora_limite := coalesce(new.hora_limite, p.hora_limite);

    if p.gestion_vivaguest then
      new.state := coalesce(new.state, 'pendiente'::public.cleaning_state);

      -- FIN-01, primera mitad: la tarifa vigente del apartamento se COPIA al
      -- aseo. El `coalesce` es lo que permite que un `repaso` o una
      -- `emergencia` lleguen con tarifa propia; el cómputo vivo no tendría
      -- dónde ponerla (ARCHITECTURE.md §Decisión financiera, argumento 3).
      new.tarifa_huesped := coalesce(new.tarifa_huesped, p.tarifa_huesped);
      new.pago_aseador   := coalesce(new.pago_aseador,   p.pago_aseador);
    else
      -- Gestión externa: la fila es informativa. `cl_unmanaged_is_inert` exige
      -- además aseador, tarifas e instrucciones nulos; eso lo impone el CHECK,
      -- no este trigger, para que un intento de asignar aseador a una unidad
      -- externa falle ruidosamente en vez de que el trigger se lo trague.
      new.state := null;
    end if;

  else

    ---------------------------------------------------------------------------
    -- T-01-34: `is_managed` NUNCA cambia en un UPDATE.
    -- Es un snapshot del momento de creación. Dejarlo mutar convertiría aseos
    -- externos en gestionados (o al revés) de forma retroactiva, y con ellos
    -- las métricas de meses ya cerrados.
    ---------------------------------------------------------------------------
    new.is_managed := old.is_managed;

    ---------------------------------------------------------------------------
    -- FIN-01, segunda mitad y la que convierte el requisito en un invariante
    -- de base: LA CONGELACIÓN SE IMPONE, NO SE BLOQUEA.
    --
    -- El UPDATE no falla; se reescribe. Un `raise` aquí rompería toda
    -- escritura legítima sobre un aseo cerrado (marcar legal_hold, escribir
    -- deleted_at en la purga de la Fase 9, corregir un cancel_reason). Lo que
    -- no puede cambiar son los dos números del snapshot, así que se reimponen.
    --
    -- Aplica a TODA ruta de escritura, incluida la clave de servicio: tiene
    -- BYPASSRLS, no "bypass triggers". Esta es la mitigación de T-01-31 y la
    -- aserción 3 de 01_invariantes.test.sql.
    --
    -- Ojo al cambiarlo: la aserción no comprueba que el UPDATE falle,
    -- comprueba que el valor siga siendo 120000 después del UPDATE.
    ---------------------------------------------------------------------------
    if old.state in ('completada', 'cancelada') then
      new.tarifa_huesped := old.tarifa_huesped;
      new.pago_aseador   := old.pago_aseador;
    end if;

    ---------------------------------------------------------------------------
    -- B — GUARDA DE TRANSICIONES (T-01-32)
    --
    -- La matriz va como lista literal y no como tabla de configuración: son 6
    -- transiciones y una tabla añadiría una consulta por cada UPDATE de
    -- `cleanings` sin ganar nada. Si algún día son 20, entonces sí.
    --
    --   pendiente  -> en_curso    start_cleaning
    --   pendiente  -> completada  cierre manual del admin (ASEO-08)
    --   pendiente  -> cancelada   ASEO-09, o el sync de la Fase 3
    --   en_curso   -> pendiente   "no puedo": vuelve sin aseador, CONSERVANDO
    --                             confirmado_at (por eso cl_pendiente_shape no
    --                             exige confirmado_at is null)
    --   en_curso   -> completada  finish_cleaning
    --   en_curso   -> cancelada   cancelación excepcional del admin
    --   completada -> (nada)      terminal
    --   cancelada  -> (nada)      terminal. Cancelar y recrear el mismo día SÍ
    --                             se puede: el índice parcial lo permite, pero
    --                             es una fila NUEVA, no una resurrección.
    --   NULL       -> NULL        fila informativa: no hay máquina de estados
    --
    -- Es un trigger BEFORE y no un CHECK a propósito: un CHECK daría 23514 y la
    -- aserción 9 no podría distinguir "la forma del estado es inválida" de "la
    -- transición es ilegal". Los `cl_*_shape` de la migración 04 ya cubren la
    -- forma; esto cubre el movimiento.
    --
    -- `is distinct from` y nunca `<>`: con `<>` la comparación es NULL para las
    -- filas informativas y la guarda se saltaría en silencio justo en el caso
    -- que menos se mira.
    ---------------------------------------------------------------------------
    if new.state is distinct from old.state then

      if old.state in ('completada', 'cancelada') then
        raise exception 'transicion_invalida'
          using errcode = 'P0001',
                detail   = format('%s -> %s',
                                  coalesce(old.state::text, 'NULL'),
                                  coalesce(new.state::text, 'NULL')),
                hint     = 'Los estados completada y cancelada son terminales: no tienen transición de salida. Para volver a operar el apartamento se crea un aseo nuevo.';
      end if;

      -- Nótese que el resultado es NULL (y por tanto no válido) cuando
      -- old.state o new.state son NULL. Es deliberado: una fila informativa no
      -- entra ni sale de la máquina de estados, porque `is_managed` es
      -- inmutable y ya se reimpuso arriba.
      v_legal :=
           (old.state = 'pendiente' and new.state in ('en_curso', 'completada', 'cancelada'))
        or (old.state = 'en_curso'  and new.state in ('pendiente', 'completada', 'cancelada'));

      if not coalesce(v_legal, false) then
        raise exception 'transicion_invalida'
          using errcode = 'P0001',
                detail   = format('%s -> %s',
                                  coalesce(old.state::text, 'NULL'),
                                  coalesce(new.state::text, 'NULL')),
                hint     = 'Transición fuera de la máquina de estados del aseo.';
      end if;
    end if;

  end if;

  new.updated_at := now();
  return new;
end;
$$;

comment on function public.tg_cleanings_snapshot() is
  'BEFORE INSERT OR UPDATE sobre cleanings. Al insertar copia is_managed, hora_limite y las dos tarifas desde properties. Al actualizar reimpone is_managed y, si el aseo está en un estado terminal, reimpone las tarifas (FIN-01). Además rechaza con P0001 toda transición de estado fuera de la máquina.';

-- Nombre del trigger: el de ARCHITECTURE.md. `cleanings_set_updated_at` (de la
-- migración 04) ordena alfabéticamente ANTES que `cleanings_snapshot`, así que
-- el updated_at que queda escrito es el de esta función. Los dos ponen now();
-- no hay conflicto, y se conservan los dos para que quitar uno no rompa el otro.
create trigger cleanings_snapshot
  before insert or update on public.cleanings
  for each row execute function public.tg_cleanings_snapshot();


-- ===========================================================================
-- C — El log de auditoría de transiciones
--
-- T-01-33 (Repudiation): un cambio de estado sin rastro de quién lo hizo.
-- Es alcance obligatorio de la Fase 1 según ROADMAP.md, aunque el DDL de
-- ARCHITECTURE.md no lo modele.
-- ===========================================================================
create table public.cleaning_state_transitions (
  id          bigserial primary key,

  -- `cascade` y no `set null`: la columna es NOT NULL y este log es
  -- operativo, no de acceso. Cuando la purga de la Fase 9 borre el aseo, su
  -- historia de estados se va con él.
  -- (Contraste deliberado con access_code_reads.cleaning_id, que es
  --  ON DELETE SET NULL: el rastro de quién vio el código de una cerradura
  --  tiene que sobrevivir a la purga.)
  cleaning_id uuid not null references public.cleanings(id) on delete cascade,

  -- Anulables las dos: la máquina admite NULL en los extremos para las filas
  -- informativas, aunque hoy la guarda del trigger BEFORE no deje llegar
  -- ninguna. Modelarlas NOT NULL cerraría la puerta a registrar, si algún día
  -- hiciera falta, la transición inicial.
  from_state  public.cleaning_state,
  to_state    public.cleaning_state,

  -- NULL cuando la escritura no viene de una persona autenticada: un job de
  -- cron, el worker de sync o la clave de servicio. Esa distinción es
  -- información, no una carencia: "lo canceló el sync" y "lo canceló el admin"
  -- son dos hechos distintos.
  actor_id    uuid references public.profiles(id),

  reason      text,
  created_at  timestamptz not null default now()
);

comment on table public.cleaning_state_transitions is
  'Bitácora inmutable de cambios de estado del aseo. Una fila por transición efectiva; el INSERT del aseo NO se registra. La escribe solo tg_cleanings_log_transition(); el cliente no recibe INSERT sobre esta tabla.';
comment on column public.cleaning_state_transitions.actor_id is
  'Quién movió el estado. NULL = lo movió el sistema (job, worker de sync o clave de servicio), no una persona.';

-- El acceso real es siempre "la historia de ESTE aseo, lo más reciente
-- primero", que es la línea de tiempo de la vista de detalle.
create index cst_cleaning_idx
  on public.cleaning_state_transitions (cleaning_id, created_at desc);


-- ---------------------------------------------------------------------------
-- SECURITY DEFINER a propósito.
--
-- La tabla NO va a recibir INSERT para `authenticated` (plan 01-07), así que el
-- log no se puede falsificar desde el cliente aunque el UPDATE que lo dispara sí
-- venga del cliente por RPC. Sin DEFINER, el INSERT correría con los privilegios
-- del aseador y fallaría con 42501 justo cuando funciona el flujo normal.
--
-- `set search_path = ''` es obligatorio en toda función DEFINER del repo
-- (guardarraíl 5 de 02_guardarrailes.test.sql). PG 17.6 lo guarda en proconfig
-- como search_path="" — con comillas.
--
-- `auth.uid()` va calificada: con search_path vacío no hay esquema implícito
-- más allá de pg_catalog. Devuelve NULL si no hay JWT en la sesión, que es
-- exactamente el caso de un job.
-- ---------------------------------------------------------------------------
create or replace function public.tg_cleanings_log_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.cleaning_state_transitions
    (cleaning_id, from_state, to_state, actor_id, reason)
  values (
    new.id,
    old.state,
    new.state,
    (select auth.uid()),
    -- La única transición que lleva motivo escrito por una persona es la
    -- cancelación (ASEO-09). El resto no tiene nada que contar que no esté ya
    -- en el par from/to.
    case when new.state = 'cancelada'::public.cleaning_state
         then new.cancel_reason
    end
  );
  return null;   -- AFTER trigger: el valor de retorno se ignora
end;
$$;

comment on function public.tg_cleanings_log_transition() is
  'AFTER UPDATE OF state sobre cleanings. Inserta la transición en cleaning_state_transitions. SECURITY DEFINER porque el cliente no tendrá INSERT sobre esa tabla.';

-- `after update of state` y no `after update` a secas: sin la cláusula OF, el
-- trigger se evaluaría en cada UPDATE de la tabla (incluido el de la aserción 3,
-- que solo toca tarifas). El WHEN lo filtraría igual, pero el OF lo resuelve
-- antes, en el planner.
--
-- AFTER y no BEFORE: se registra lo que efectivamente quedó escrito. Si un
-- CHECK de forma rechaza la fila, no hay transición que registrar.
create trigger cleanings_log_transition
  after update of state on public.cleanings
  for each row
  when (new.state is distinct from old.state)
  execute function public.tg_cleanings_log_transition();


-- ===========================================================================
-- CIERRE DEL AGUJERO DE PRIVILEGIOS POR DEFECTO
--
-- Mismo problema medido en las migraciones 03 y 04: con la CLI 2.116.0 toda
-- tabla nueva de `public` nace con arwdDxtm para `anon` y `authenticated`, y
-- la RLS no llega hasta el plan 01-07.
--
-- Aquí importa especialmente: sin el revoke, `anon` podría INSERTAR filas
-- falsas en la bitácora de transiciones y TRUNCARLA. Un log de auditoría
-- escribible por cualquiera sin autenticar no es un log de auditoría.
--
-- La secuencia va aparte: `id` es bigserial y el pg_default_acl de esta CLI
-- cubre SECUENCIAS además de tablas. El guardarraíl 4 no lo vería
-- (information_schema.role_table_grants las excluye); lo ve el 4b, que se
-- añadió justo por el hallazgo del plan 01-04 sobre access_code_reads_id_seq.
-- ===========================================================================
revoke all on table    public.cleaning_state_transitions             from anon, authenticated;
revoke all on sequence public.cleaning_state_transitions_id_seq      from anon, authenticated;
