# Integraciones Externas

**Fecha de análisis:** 2026-09-18

## Calendarios iCal (Airbnb / Booking.com)

**Ingesta:**
- Único punto de entrada externo real del sistema: `app/api/cron/sync-feed/route.ts`
- Autenticación: secreto compartido (`Authorization`), no cookie ni sesión de usuario; validado por `app/api/cron/_guard.ts` (`exigirSecretoCron`) antes de construir la fábrica administrativa
- Parser: módulo propio en `lib/domain/ical.ts`, puro, sin red, sin base de datos, sin dependencias externas. No usa `node-ical` (ver STACK.md, divergencia #1); nunca construye un objeto `Date` de JavaScript, invariante vigilada por CI
- Clasificación reserva/bloqueo: `lib/domain/ical-clasificar.ts`
- Normalización: `lib/domain/ical-normalizar.ts`
- Guardas de lectura (URL, esquema): `lib/domain/ical-guardas.ts`, `lib/domain/ical-url.schema.ts`
- Diagnóstico previo (Fase 2, conservado con divergencia deliberada del parser real): `lib/domain/ical-preview.ts`
- Diff de sincronización: `lib/domain/sync-diff.integration.test.ts` (y su lógica productiva en `lib/data/sync.ts`)
- Salud de sync / feeds caídos: `lib/domain/salud-sync.ts`, `lib/domain/sync-alertas.integration.test.ts`

**Reglas de negocio verificadas en el código (heredadas del research empírico de `CLAUDE.md`):**
- Airbnb: `SUMMARY` distingue `Reserved` (con `DESCRIPTION`, código de reserva vía URL) de `Airbnb (Not available)` (bloqueo, sin `DESCRIPTION`). Solo se ingieren reservas, no bloqueos.
- Booking.com: `SUMMARY` siempre `CLOSED - Not available`, sin `DESCRIPTION` nunca; no hay código de reserva disponible en este feed.
- `DESCRIPTION` viene *folded* a 75 octetos con continuación; el parser hace unfolding antes de extraer el código.
- El `UID` es estable ante cambios de fecha en reservas (permite detectar extensiones de estadía); los bloqueos sí regeneran `UID` y mutan fechas día a día.

**Disparo:**
- `pg_cron` + `pg_net` dentro de Postgres, no Vercel Cron. Una invocación HTTP por feed vía `net.http_post()`, fire-and-forget (`pg_net` encola y no espera respuesta)
- Jobs definidos en `supabase/migrations/20260902235500_14_sync_jobs.sql`: `cron.schedule()` es upsert por `jobname`; la sintaxis de intervalo de `pg_cron` 1.6.4 solo acepta segundos
- `pg_cron` corre en serie: sin protección explícita contra ticks solapados porque está medido que `pg_cron` no lanza una segunda instancia de un job consigo mismo mientras el anterior sigue vivo
- `feed_health_watchdog` vive en el mismo scheduler que la sync: si `pg_cron` muere, mueren los dos jobs a la vez, así que no hay redundancia entre ellos
- Poda de `cron.job_run_details`: la maneja explícitamente el job, porque `pg_cron` no la hace sola

**Por qué `pg_cron`+`pg_net` y no Vercel Cron:** con 34 apartamentos gestionados y la necesidad de aislar feeds caídos por construcción (una invocación por feed, no un job monolítico), el scheduler vive en la base de datos. Evita además el tope de Vercel Hobby (1 corrida diaria) sin forzar upgrade a Pro solo por el cron.

## Web Push (VAPID)

**Envío:**
- `web-push@3.6.7` (Node runtime, no Edge)
- `lib/push/envio.ts` — lógica de envío
- `lib/push/payload.ts` — construcción del payload
- `lib/push/errores.ts` — manejo/clasificación de errores de entrega
- Claves: `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (cliente) + contraparte privada leída como secreto de servidor

**Endpoint de drenaje:**
- `app/api/push/drain` — outbox de push para notificaciones cuyo disparo inmediato (trigger `AFTER INSERT`) no prosperó
- Ventana de gracia de 90s para no duplicar con el trigger inmediato
- Disparado también desde `pg_cron`/`pg_net` (migración `20260911121000_17_push_jobs.sql`), con el mismo patrón fire-and-forget de `net.http_post()`
- Diseñado para fallar ruidoso si faltan los secretos de Vault: corre bajo `pg_cron`, donde un fallo silencioso no se detecta

**Restricción de plataforma (heredada, sigue vigente):**
- iOS exige PWA instalada en pantalla de inicio y `display: standalone` en el manifest (`app/manifest.ts`) para que exista siquiera la API `Notification`
- Push es el único canal de notificación al aseador; no hay SMS ni email en el código

## Supabase (Postgres, Auth, Storage)

**Base de datos:**
- Postgres 17 managed, 29 migraciones en `supabase/migrations/` (rango `20260831` a `20260918`)
- Tramos principales:
  - `01-02`: extensiones y helpers, enums
  - `03-04`: catálogo (apartamentos, aseadores) y operación (aseos)
  - `05-06`: triggers/máquina de estados, retención y notificaciones (schema de retención hoy sin worker de purga activo, ver STACK.md)
  - `07-09`: grants, políticas RLS, RPC
  - `10`: bucket privado `evidencia` en Storage + 3 policies
  - `11-14`: extensiones de sync, RPC de sync, reconciliación, jobs de `pg_cron`
  - `15`: RPC admin y Realtime
  - `16-17`: avisos push y jobs de push
  - `18-22`: ejecución de aseo, RPC de reportes, notas opcionales, evidencia en lote, registro de push con `security definer`
  - `23-25`: calendario y snapshot, frontera del aseador, cierre de período
  - `26-27`: lecturas financieras, pagos y "mis pagos"
  - `28-29`: detalle de aseo, consumo de Storage (reemplaza la purga, ver STACK.md)

**Auth:**
- `@supabase/ssr` para clientes SSR con cookies (App Router)
- `getUser()` para toda autorización de rutas y layouts (nunca `getClaims()` ni `getSession()`, ver `CLAUDE.md` "What NOT to Use" — medido: tras banear a un usuario, `getClaims()` sigue respondiendo OK mientras `getUser()` da 403)
- Rol sale de `app_metadata.role`, nunca de `user_metadata`
- Código de acceso del aseador vive en tabla aparte con RPC y auditoría (no columna), porque admin y aseador comparten el rol Postgres `authenticated`

**Storage:**
- Bucket privado `evidencia`, `file_size_limit` y `allowed_mime_types` restringidos (migración `10_storage.sql`)
- Uploads desde `lib/fotos/subir.ts` (compresión cliente con `compressorjs` antes de subir)
- Lecturas/consultas de evidencia en `lib/data/evidencia.ts`, `lib/data/panel-aseo.ts`, `lib/data/recibos.ts`
- `public.consumo_de_storage()` (migración `29`) expone consumo total para el medidor de cupo en `/operacion` y su alerta al superar 70% del cupo, dado que no hay purga que libere espacio automáticamente

**Cliente administrativo (`service_role`):**
- Único archivo autorizado a leerlo: `lib/supabase/admin.ts`, con `import 'server-only'` (necesario pero no suficiente, complementado por el guardraíl de CI)
- Salta RLS por completo; uso restringido a workers (sync iCal, push, retención) y operaciones admin explícitas, nunca para servir una petición de usuario sin autorización aparte comprobada antes

## Sin integraciones activas (verificado, no en el código)

- Sin proveedor de error tracking (Sentry, etc.)
- Sin servicio de email/SMS
- Sin CI de terceros más allá de GitHub Actions (`ci/db.yml`, no auditado línea a línea en esta pasada)
- Sin cola de mensajería externa (todo el fan-out vive en `pg_cron`/`pg_net`)
- Sin CDN ni servicio de imágenes externo (Storage de Supabase sirve directo)

---

*Integration audit: 2026-09-18*
