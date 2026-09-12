-- ============================================================================
-- 21 — LA SEÑAL DE EVIDENCIA INCOMPLETA, EN UN SOLO VIAJE (plan 06-10)
--
-- D-06 permite saltar un cuarto **a cambio de que el admin lo vea**. Sin esa
-- mitad, el permiso para saltar no tiene contrapartida y la promesa de
-- evidencia se queda sin nadie que la reclame. El dashboard del admin es quien
-- la reclama, y para eso necesita la marca de DECENAS de aseos a la vez.
--
-- ---------------------------------------------------------------------------
-- POR QUÉ ESTA FUNCIÓN LLAMA A LA OTRA EN VEZ DE REPETIR SU CONSULTA
--
-- Es la decisión central de este archivo. La alternativa obvia —copiar el
-- `exists ... or exists ...` con un `group by`— sería más rápida de escribir y
-- probablemente un poco más rápida de ejecutar, y estaría **mal**: crearía una
-- TERCERA implementación de la misma regla.
--
-- Ya hay dos, y su duplicación está declarada y medida: `public.aseo_sin_
-- evidencia_completa()` y `sinEvidenciaCompleta()` de `lib/domain/checklist.ts`,
-- con un test de paridad que las compara. Una tercera copia no tendría siquiera
-- ese test, y el síntoma de que divergiera sería el peor posible: el dashboard
-- diciendo que un aseo está completo mientras la pantalla del aseador dice lo
-- contrario, sobre el mismo aseo y el mismo día.
--
-- Llamarla por fila dentro de un `unnest` cuesta N evaluaciones **dentro de la
-- base**, no N viajes de red, que es lo que importa aquí. La función es `stable`
-- y el planificador puede reusar su resultado.
--
-- ---------------------------------------------------------------------------
-- Y POR QUÉ ESTA SÍ LLEVA GUARDA Y LA ESCALAR NO
--
-- La escalar responde un booleano sobre UN aseo, y quien la llama es la
-- pantalla del propio aseador. Esta devuelve el subconjunto de una lista
-- arbitraria, que es exactamente la forma de una consulta de barrido: con ella,
-- cualquiera con sesión podría pasar cientos de identificadores y aprender
-- cuáles corresponden a aseos reales con evidencia incompleta.
--
-- El único consumidor es el dashboard del admin, así que se acota a admin
-- activo. Sin esa guarda, `security definer` la convertiría en un oráculo.
-- ============================================================================

create or replace function public.aseos_sin_evidencia_completa(p_cleanings uuid[])
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $fn$
  select c.id
    from unnest(coalesce(p_cleanings, '{}'::uuid[])) as c(id)
   where private.is_admin()
     and public.aseo_sin_evidencia_completa(c.id);
$fn$;

comment on function public.aseos_sin_evidencia_completa(uuid[]) is
  'De la lista dada, cuales aseos quedaron sin evidencia completa. Un solo viaje para el dashboard del admin. NO reimplementa la regla: llama a aseo_sin_evidencia_completa(), porque una tercera copia de la misma verdad no tendria ni el test de paridad que tienen las otras dos.';

-- `alter default privileges` no alcanza: en PG 17.6 las funciones nuevas nacen
-- con `execute` para `public`. Se revoca explicitamente, igual que las demas.
revoke all     on function public.aseos_sin_evidencia_completa(uuid[]) from public, anon;
grant  execute on function public.aseos_sin_evidencia_completa(uuid[]) to authenticated;
