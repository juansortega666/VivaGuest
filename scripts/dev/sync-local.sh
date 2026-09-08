#!/usr/bin/env bash
# Ejercita EL LAZO COMPLETO de sincronizacion contra el stack local, en dos
# minutos, sin esperar los 30 de la cadencia real y SIN QUE EXISTAN los
# proyectos Supabase dev ni prod (constraint declarado de la fase, checkpoint A1
# abierto desde la Fase 1).
#
# Lo que recorre, de punta a punta y con las piezas de verdad:
#
#   cron.schedule cada 10 s
#     -> public.dispatch_feed_syncs()
#        -> lee app_base_url y cron_shared_secret de vault.decrypted_secrets
#        -> net.http_post con la cabecera del secreto compartido
#           -> POST /api/cron/sync-feed del worker que corre en tu maquina
#              -> public.sync_feed_apply()
#
# USO:
#   npm run dev                       # en otra terminal
#   bash scripts/dev/sync-local.sh    # puerto 3000 por defecto
#   bash scripts/dev/sync-local.sh 3001 45   # puerto 3001, 45 segundos
#
# ---------------------------------------------------------------------------
# TRES AVISOS OPERATIVOS, LOS TRES MEDIDOS, Y NINGUNO ES OPCIONAL:
#
#  1. EL PUERTO ENTRA POR PARAMETRO. El 3000 es compartido entre worktrees: es
#     la leccion del plan 02-14 con la variable de puerto de las pruebas de
#     punta a punta. Apuntar al 3000 "porque siempre es el 3000" hace que este
#     script martillee el servidor de OTRO worktree con los feeds de ESTA base.
#
#  2. `trap EXIT` CON `cron.unschedule`. Este script NUNCA puede dejar un job
#     agendado al terminar, ni cuando el usuario lo corta con Ctrl-C, ni cuando
#     una linea falla con `set -e`. Un job de 10 segundos olvidado en la base
#     local sigue disparando POST cada 10 segundos contra un puerto que manana
#     ocupara otra cosa. La base local es COMPARTIDA entre worktrees: el
#     estropicio no es tuyo, es de todos.
#
#  3. `net._http_response` SE PURGA SOLA A LAS 6 HORAS (`pg_net.ttl`, medido).
#     Cualquier diagnostico de "¿llego el POST?" hay que hacerlo dentro de esa
#     ventana. Pasadas seis horas la tabla esta vacia y la ausencia de filas NO
#     significa que la peticion no se hiciera. El script lo recuerda al salir.
# ---------------------------------------------------------------------------
set -euo pipefail

PUERTO="${1:-3000}"
ESPERA="${2:-40}"
JOB="sync-local-dispatch"
DB="supabase_db_vivaguest"

# `host.docker.internal` es como el contenedor de la base alcanza tu maquina.
# Medido: resuelve a 192.168.65.254 y `net.http_get` contra el host devolvio 200.
# `localhost` NO sirve aqui: dentro del contenedor apunta al propio contenedor.
BASE_URL="http://host.docker.internal:${PUERTO}"

psql_() {
  docker exec -i "$DB" psql -U postgres -d postgres -qAtX "$@"
}

# ---------------------------------------------------------------------------
# La red de seguridad. Se instala ANTES de agendar nada: si el script muriera
# entre el `cron.schedule` y el `trap`, el job quedaria huerfano.
#
# `cron.unschedule` lanza si el job no existe, de ahi el guard por nombre. El
# `|| true` final es porque un trap que falla en un script con `set -e` deja el
# codigo de salida equivocado y oculta el error de verdad.
# ---------------------------------------------------------------------------
limpiar() {
  echo
  echo "→ desagendando '${JOB}'"
  psql_ -c "select cron.unschedule('${JOB}') where exists (select 1 from cron.job where jobname = '${JOB}');" >/dev/null 2>&1 || true

  RESTANTES=$(psql_ -c "select count(*) from cron.job where jobname like '%local%';" 2>/dev/null || echo "?")
  echo "  jobs locales restantes: ${RESTANTES}   (tiene que ser 0)"
}
trap limpiar EXIT INT TERM

echo "→ stack: contenedor ${DB}, worker en ${BASE_URL}"

if ! docker ps --format '{{.Names}}' | grep -q "^${DB}$"; then
  echo "✗ el contenedor ${DB} no esta arriba. Levanta el stack con: npx supabase start" >&2
  exit 1
fi

if ! curl -sf -o /dev/null "http://127.0.0.1:${PUERTO}" 2>/dev/null; then
  echo "⚠ nada responde en el puerto ${PUERTO}. Arranca 'npm run dev' en otra terminal."
  echo "  Si tu servidor esta en otro puerto, pasalo: bash $0 <puerto>"
fi

# ---------------------------------------------------------------------------
# Los dos secretos de Vault, con el valor LOCAL.
#
# `cron_shared_secret` tiene que ser byte a byte el mismo que `CRON_SHARED_SECRET`
# de `.env.local`, o el worker responde 401 SIN CUERPO en cada tick y la unica
# senal seria la obsolescencia de `last_success_at` tres horas despues. Por eso
# se lee del archivo en vez de pedirselo al usuario.
#
# `vault.create_secret` lanza si el nombre ya existe, asi que se borra antes. Es
# la base LOCAL: no hay nada que conservar.
# ---------------------------------------------------------------------------
if [ ! -f .env.local ]; then
  echo "✗ falta .env.local. Corre: npm run setup:worktree" >&2
  exit 1
fi

SECRETO=$(grep -E '^CRON_SHARED_SECRET=' .env.local | head -1 | cut -d= -f2-)
if [ -z "$SECRETO" ]; then
  echo "✗ .env.local no define CRON_SHARED_SECRET. Copialo de .env.example y ponle un valor." >&2
  exit 1
fi

echo "→ sembrando los dos secretos de Vault con los valores locales"
psql_ -c "delete from vault.secrets where name in ('app_base_url','cron_shared_secret');" >/dev/null
psql_ -c "select vault.create_secret('${BASE_URL}', 'app_base_url', 'local');" >/dev/null
psql_ -c "select vault.create_secret('${SECRETO}', 'cron_shared_secret', 'local');" >/dev/null

FEEDS=$(psql_ -c "select count(*) from public.calendar_feeds where is_active;")
echo "  feeds activos en la base: ${FEEDS}"
if [ "$FEEDS" = "0" ]; then
  echo "⚠ no hay ningun feed activo: el dispatcher va a correr y despachar CERO."
  echo "  Conecta un calendario desde la app, o siembra una fila en calendar_feeds."
fi

# Los vence a todos ya mismo, para no esperar la cadencia de 30 minutos, y suelta
# el lease por si una corrida anterior dejo un `claimed_at` puesto.
echo "→ venciendo todos los feeds activos y soltando el lease"
psql_ -c "update public.calendar_feeds set next_sync_at = now() - interval '1 minute', claimed_at = null where is_active;" >/dev/null

# ---------------------------------------------------------------------------
# El tick de 10 segundos. `pg_cron` 1.6.4 SI acepta la forma de intervalo en
# SEGUNDOS ('[1-59] seconds'); lo que rechaza es la de minutos ('1 minute',
# medido: `ERROR: invalid schedule`). Por eso el job de produccion usa la
# expresion cron de cinco estrellas y este usa segundos.
#
# Y `pg_cron` NO solapa un job consigo mismo (medido: un job cada 5 s con cuerpo
# de 12 s produce corridas EN SERIE), asi que 10 segundos no acumulan corridas.
# ---------------------------------------------------------------------------
echo "→ agendando '${JOB}' cada 10 segundos durante ${ESPERA}s"
psql_ -c "select cron.schedule('${JOB}', '10 seconds', \$\$select public.dispatch_feed_syncs()\$\$);" >/dev/null

for _ in $(seq 1 "$ESPERA"); do
  sleep 1
  printf '.'
done
echo

echo
echo "════ cron.job_run_details ════════════════════════════════════════════════"
psql_ -c "
  select d.status,
         coalesce(nullif(replace(d.return_message, E'\n', ' '), ''), '—'),
         to_char(d.start_time, 'HH24:MI:SS')
    from cron.job_run_details d
    join cron.job j on j.jobid = d.jobid
   where j.jobname = '${JOB}'
   order by d.start_time desc
   limit 10;"

echo
echo "════ net._http_response ══════════════════════════════════════════════════"
# Sin `error_msg` no se distingue "el worker respondio 500" de "el POST nunca
# salio", y son dos fallos con arreglos opuestos.
psql_ -c "
  select id, coalesce(status_code::text, '—'), coalesce(error_msg, '—')
    from net._http_response
   order by id desc
   limit 10;"

echo
echo "════ calendar_feeds ══════════════════════════════════════════════════════"
psql_ -c "
  select substring(f.id::text, 1, 8),
         coalesce(f.last_error, 'ok'),
         coalesce(f.last_http_status::text, '—'),
         f.consecutive_failures,
         coalesce(to_char(f.last_success_at, 'HH24:MI:SS'), 'nunca')
    from public.calendar_feeds f
   where f.is_active
   order by f.next_sync_at;"

echo
echo "Aviso: net._http_response se purga sola a las 6 h (pg_net.ttl). Cualquier"
echo "diagnostico de '¿llego el POST?' hay que hacerlo dentro de esa ventana; pasada"
echo "esa hora la tabla esta vacia y eso NO significa que la peticion no se hiciera."
