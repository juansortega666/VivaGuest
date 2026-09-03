# Despliegue del motor de sincronización iCal

Este documento cubre **el único paso del motor de sync que no está en git** y que
por tanto no viaja con una migración: los dos secretos de Vault.

Si te saltas este paso, el motor queda muerto. Está diseñado para que ese fallo
sea ruidoso, pero hay que saber dónde suena.

---

## Por qué esto no es una migración

**Los secretos son datos, no schema.** Una migración es un archivo versionado en
git: meter ahí `vault.create_secret('mi-secreto-real', …)` dejaría el valor en el
historial del repositorio para siempre, y rotarlo no lo borraría de los commits
anteriores.

Y hay una segunda razón, medida: la alternativa "obvia" —poner el secreto
directamente en la definición del job de `pg_cron`— es peor todavía.
`cron.job.command` es **texto plano**:

```
select jobid, schedule, command, jobname from cron.job;
 jobid |  schedule   | command  |    jobname
     1 | */5 * * * * | select 1 | prueba-secreto
```

Cualquiera que pueda leer ese catálogo leería el secreto. Vault guarda el valor
cifrado en `vault.secrets` y solo lo descifra a través de
`vault.decrypted_secrets`, cuyo ACL medido es `supabase_admin` completo,
`postgres` lectura y `service_role` lectura. **`anon` y `authenticated` no
aparecen**, y PostgREST no expone el esquema `vault`, así que no es alcanzable
por la API. La única superficie real es la función `security definer` del
dispatcher.

---

## Los dos secretos

Se crean **una vez por entorno**, a mano, desde el editor SQL de Supabase o por
`psql`. Nunca desde la aplicación y nunca desde una migración.

```sql
-- 1. La base sobre la que el dispatcher construye la URL del worker.
--    Sin barra final: el dispatcher concatena '/api/cron/sync-feed'.
select vault.create_secret(
  'https://vivaguest.vercel.app',
  'app_base_url',
  'Base del worker de sync de calendarios');

-- 2. El secreto compartido que autentica al worker.
--    Genéralo con: openssl rand -base64 32
select vault.create_secret(
  '<pega aquí 32 bytes aleatorios>',
  'cron_shared_secret',
  'Secreto compartido del worker de sync');
```

Para rotarlos, `vault.update_secret(id, …)` o borrar y volver a crear:
`vault.create_secret` lanza si el nombre ya existe.

Comprobación de que quedaron bien, sin imprimir el valor:

```sql
select name, length(decrypted_secret) as bytes
  from vault.decrypted_secrets
 where name in ('app_base_url', 'cron_shared_secret');
```

---

## TRES SITIOS, UN SOLO VALOR

`cron_shared_secret` tiene que coincidir **byte a byte** con `CRON_SHARED_SECRET`
en otros dos lugares:

| # | Dónde | Quién lo lee |
|---|---|---|
| 1 | `.env.local` de cada máquina de desarrollo | `app/api/cron/sync-feed/_guard.ts` |
| 2 | Vercel → Project Settings → Environment Variables (Production **y** Preview) | el mismo guard, en el despliegue |
| 3 | El secreto de Vault de la base de ese entorno | `public.dispatch_feed_syncs()`, que lo pone en la cabecera `x-cron-secret` |

**Al rotarlo, se rotan los tres a la vez.** Y cada entorno tiene su propio
trío: el secreto de producción no debe funcionar contra la base de desarrollo.

### El modo de fallo cuando no coinciden, y por qué cuesta encontrarlo

Si (3) no coincide con (1) o (2), pasa esto y nada más:

- El dispatcher construye la petición y la envía. **No falla:** `pg_net` la
  encola correctamente y `cron.job_run_details` dice `succeeded`, porque la
  función hizo su trabajo.
- El worker responde **401 sin cuerpo**. Es deliberado: un endpoint público que
  explica por qué rechazó es un oráculo gratis para quien lo sondee.
- El worker **no escribe ninguna línea de log** para esa petición, también
  deliberado: registrar cada 401 convierte el endpoint en un amplificador de
  logs.
- Los feeds simplemente dejan de sincronizarse. No hay error en pantalla, ni
  fila nueva en `feed_sync_runs`, ni cambio en `last_error`.

O sea: **el job dice que todo va bien y no pasa nada.** Las dos únicas señales
son, en este orden:

1. `net._http_response` con `status_code = 401` (dentro de la ventana de 6 h que
   dura esa tabla, ver abajo).
2. La obsolescencia de `last_success_at`, que a las 3 horas dispara la alerta de
   `feed_health_watchdog`.

```sql
-- El diagnóstico rápido, y hay que hacerlo dentro de las 6 primeras horas.
select id, status_code, error_msg, created
  from net._http_response
 order by id desc
 limit 20;
```

### Si faltan los secretos por completo

Es el caso de un proyecto Supabase recién creado al que se le hizo `db push` sin
correr este documento. Aquí el fallo **sí es ruidoso a propósito**:

```
select j.jobname, d.status, d.return_message from cron.job_run_details d
  join cron.job j on j.jobid = d.jobid order by d.start_time desc limit 1;

dispatch-feed-syncs | failed | ERROR:  faltan secretos de sync en vault: app_base_url / cron_shared_secret
                              CONTEXT:  PL/pgSQL function public.dispatch_feed_syncs() line 29 at RAISE
```

`dispatch_feed_syncs()` lanza en vez de volver en silencio, precisamente para
que el historial del job lo diga. La alternativa educada —`return 0` y a otra
cosa— dejaría el sync entero muerto sin ninguna señal.

---

## Los tres jobs que instala la migración 14

```sql
select jobid, jobname, schedule, active from cron.job order by jobid;
```

| `jobname` | `schedule` | Qué hace |
|---|---|---|
| `dispatch-feed-syncs` | `* * * * *` | Mira la cola y despacha un POST por feed vencido |
| `feed-health-watchdog` | `0 * * * *` | Alerta por obsolescencia y por colapso de formato |
| `purge-cron-history` | `17 4 * * *` | Borra de `cron.job_run_details` lo que pase de 7 días |

**El tick no es la cadencia.** El dispatcher mira la cola cada minuto; cada feed
se sincroniza cada 30 minutos, porque el worker le pone
`next_sync_at = now() + 30 min` al terminar. Con tick de 5 minutos la cadencia
efectiva sería de 30 a 35; con tick de 1 minuto es de 30 a 31.

**`cron.schedule` no acepta `'1 minute'`.** Medido:

```
select cron.schedule('x', '1 minute', 'select 1');
ERROR:  invalid schedule: 1 minute
HINT:   Use cron format (e.g. 5 4 * * *), or interval format '[1-59] seconds'
```

La sintaxis de intervalo de `pg_cron` 1.6.4 solo admite **segundos**. Para un
minuto va la expresión cron de cinco estrellas.

**`purge-cron-history` no es opcional.** `pg_cron` no limpia
`cron.job_run_details` nunca. Con el tick de un minuto son más de medio millón
de filas al año, en un free tier con 500 MB.

---

## Probarlo en local sin desplegar nada

`scripts/dev/sync-local.sh` recorre el lazo completo en menos de un minuto:
siembra los dos secretos de Vault con los valores locales, vence los feeds,
agenda el dispatcher cada 10 segundos, y al terminar **desagenda siempre**,
incluso con Ctrl-C.

```bash
npm run dev                          # en otra terminal
bash scripts/dev/sync-local.sh       # puerto 3000
bash scripts/dev/sync-local.sh 3011 40   # puerto 3011, 40 segundos
```

El puerto entra por parámetro a propósito: es compartido entre worktrees, y
apuntar al 3000 por costumbre hace que el script martillee el servidor de otro
worktree con los feeds de esta base.

---

## Lo que este motor NO puede detectar, y hay que saberlo

**Ningún vigilante que corra dentro del scheduler puede ver la muerte del
scheduler.** Si `pg_cron` deja de correr, `feed_health_watchdog` tampoco corre, y
subirlo un nivel no arregla nada: un segundo job que vigile al primero muere con
el primero.

La mitad que falta se computa **al leer**, en el panel de la Fase 4:

```sql
select max(last_success_at) from public.calendar_feeds where is_active;
```

Si el más reciente de todos tiene más de 3 horas, el panel pinta "sincronización
caída". Se dispara aunque no corra absolutamente nada dentro de la base, porque
lo calcula la página que el admin abre de todas formas. El umbral y su
significado viven en `lib/domain/salud-sync.ts`, con sus tests.

**Hueco residual, declarado y no tapado:** si el admin no abre el panel, nadie se
entera. Lo cerraría un dead man's switch externo pingado desde el dispatcher;
queda como idea diferida, fuera del MVP.

---

## Nota sobre este archivo

No contiene ningún valor real de secreto y no debe contenerlo nunca. Los
marcadores `<pega aquí …>` y `<32 bytes aleatorios>` son literalmente eso.
