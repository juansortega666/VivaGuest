# Stack Research

**Domain:** STR housekeeping operations (admin dashboard + PWA de campo, sincronizada por iCal)
**Researched:** 2026-08-30
**Confidence:** HIGH (versiones verificadas contra npm registry y docs oficiales el 2026-08-30; formato iCal verificado empíricamente contra feeds reales de Airbnb y Booking.com)

> El stack macro (Next.js App Router + TypeScript + Tailwind + Supabase + Vercel + PWA/Web Push) está decidido y no se re-litiga aquí. Este documento fija la **capa de abajo**: paquetes exactos, versiones, patrones y trampas.

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `next` | **`15.5.24`** (pin exacto; línea 15 en modo backport) | Framework | Constraint del proyecto. **Dato duro:** el `latest` de npm hoy es `16.3.3`; la línea 15 solo recibe backports vía dist-tag `backport`. Quedarse en 15.5.x es la decisión *segura* aquí por dos razones concretas: (a) el build por webpack sigue disponible, y (b) evita el bug abierto de Serwist en Turbopack+Vercel (ver "What NOT to Use"). Migrar a 16 es una decisión de milestone posterior, no del MVP. |
| `react` / `react-dom` | `19.2.x` | UI runtime | Requerido por Next 15.5. |
| `typescript` | `^5.9` | Tipos | `@serwist/*` y `@supabase/ssr` piden `typescript >=5`. |
| `tailwindcss` | **`4.3.3`** | Estilos | Tailwind v4: config en CSS (`@import "tailwindcss"` + `@theme`), sin `tailwind.config.js`. Requiere `@tailwindcss/postcss`. No mezclar tutoriales de v3. |
| `@supabase/supabase-js` | **`2.112.4`** | Cliente Postgres/Auth/Storage | — |
| `@supabase/ssr` | **`0.12.5`** | Clientes SSR (cookies) para App Router | **Único** paquete soportado para auth server-side. Reemplaza `@supabase/auth-helpers-nextjs`, que está formalmente `deprecated` en npm y cuya sola presencia dispara el warning `warnIfUsingDeprecatedAuthHelpersPackage` exportado por `@supabase/ssr`. |
| `supabase` (CLI) | **`2.116.0`** (devDependency) | Migraciones, tipos, `supabase test db` | El CLI es la fuente de verdad del schema. `supabase gen types typescript` alimenta el genérico `Database` de `createServerClient<Database>`. |
| PostgreSQL | 17 (Supabase managed) | Base de datos | — |
| `pg_cron` + `pg_net` | extensiones Supabase | Scheduler de la sync iCal cada 30 min | Ver decisión en "Scheduled jobs". |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node-ical` | **`0.27.1`** | Parseo de feeds iCal Airbnb/Booking | **Elegida.** Ver comparativa abajo. Expone `dateOnly` en eventos `VALUE=DATE`, hace line-unfolding correcto y ya migró a `temporal-polyfill` + `rrule-temporal` (sin el `rrule` abandonado). Repo activo (push 2026-08-10). |
| `web-push` | **`3.6.7`** | Envío Web Push VAPID desde el servidor | Estándar de facto. Release npm de 2024-01 pero repo **vivo** (commits 2026-08, 3.5k estrellas, CI con Firefox). No hay alternativa mantenida con mejor tracción. Runtime Node, **no** Edge. |
| `@serwist/next` | **`9.5.12`** | Service worker + precache + manifest | Fork mantenido de Workbox, integración de primera clase con App Router. Ver "What NOT to Use" para `next-pwa`. |
| `zod` | **`4.5.4`** | Validación de esquemas | v4 es la línea actual. Usar `zod/v4` imports si vienes de v3. Se usa en 3 lugares: input de Server Actions, parseo/normalización del VEVENT, y env vars. |
| `react-hook-form` | **`7.87.0`** | Estado de formularios | Solo en los formularios largos del admin (CRUD de apartamento: ~12 campos). |
| `@hookform/resolvers` | **`5.9.1`** | Puente RHF↔Zod | `zodResolver` con soporte Zod v4. |
| `browser-image-compression` | **`2.0.2`** | Compresión de fotos antes de subir | Ver sección de fotos. API `preserveExif: true`, `useWebWorker: true`. Versión congelada desde 2023 pero API estable y sin CVEs; el riesgo es bajo porque el scope es "canvas resize + JPEG re-encode". |
| `idb` | **`8.0.3`** | Cola de uploads offline en IndexedDB | Wrapper mínimo con promesas. Alternativa `dexie@4.4.5` si la cola crece a varias tablas. |
| `date-fns` | **`4.4.0`** | Aritmética de fechas | v4 tiene soporte de timezone integrado (`@date-fns/tz`), pero para este proyecto casi no se necesita: ver sección de timezone. |
| `sonner` | **`2.0.8`** | Toasts | Estándar en el ecosistema shadcn. |
| `lucide-react` | **`1.37.0`** | Iconos | Dependencia de facto de shadcn/ui. |
| `tailwind-merge` | **`3.6.0`** + `clsx` | Helper `cn()` | Requerido por shadcn/ui. |
| `class-variance-authority` | `0.7.1` | Variantes de componentes | Requerido por shadcn/ui. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `shadcn` (CLI) | **`4.19.0`** — genera componentes en tu repo | Se ejecuta con `npx shadcn@latest add ...`. **No** es una dependencia runtime. El paquete `shadcn-ui` está `deprecated`: usar `shadcn`. |
| `vitest` | **`4.1.11`** — unit tests | Para el parser iCal y la lógica de dominio (generación/cancelación de aseos). Es donde está el 90% del riesgo lógico. |
| `@playwright/test` | **`1.62.1`** — E2E | Crítico para la PWA: Playwright puede instalar service workers, otorgar permisos de notificación y emular offline. |
| `supabase test db` (pgTAP) | Tests de políticas RLS | Único mecanismo que prueba RLS *dentro* de Postgres, con roles reales. Ver snippet. |
| `@faker-js/faker` | `10.6.0` — seeds | Para poblar los 39 apartamentos / 8 aseadores en local. |
| `msw` | `2.15.0` — mock de feeds iCal | Para fijar los `.ics` de fixture en tests del sync. |

---

## Installation

```bash
# Core (Next 15 pinned)
npm install next@15.5.24 react@19 react-dom@19
npm install @supabase/supabase-js@^2.112.4 @supabase/ssr@^0.12.5

# Dominio: iCal + push
npm install node-ical@^0.27.1 web-push@^3.6.7

# PWA
npm install @serwist/next@^9.5.12
npm install -D serwist@^9.5.12

# Formularios / validación / UI
npm install zod@^4.5.4 react-hook-form@^7.87.0 @hookform/resolvers@^5.9.1
npm install clsx tailwind-merge@^3.6.0 class-variance-authority lucide-react sonner

# Fotos + offline
npm install browser-image-compression@^2.0.2 idb@^8.0.3

# Dev
npm install -D typescript@^5.9 tailwindcss@^4.3.3 @tailwindcss/postcss
npm install -D supabase@^2.116.0
npm install -D vitest@^4.1.11 @playwright/test@^1.62.1 msw@^2.15.0 @faker-js/faker@^10.6.0

# shadcn/ui (genera código, no instala runtime)
npx shadcn@latest init
```

---

## 1. Supabase en Next.js App Router

**Veredicto:** `@supabase/ssr@0.12.5`. Tres clientes distintos, nunca uno compartido.

### Trampa #1 (crítica, invalida el 95% de los tutoriales): `setAll` ahora recibe DOS argumentos

Verificado leyendo los `.d.ts` de `@supabase/ssr@0.12.5`:

```ts
export type SetAllCookies = (
  cookies: { name: string; value: string; options: CookieOptions }[],
  headers: Record<string, string>   // <-- SEGUNDO ARGUMENTO, obligatorio de aplicar
) => Promise<void> | void;
```

El JSDoc del propio paquete lo explica: *"Responses that set auth cookies must not be cached by CDNs or reverse proxies, otherwise one user's session token can be served to a different user."* Los headers que pasa la librería son:

- `Cache-Control: private, no-cache, no-store, must-revalidate, max-age=0`
- `Expires: 0`
- `Pragma: no-cache`

**Desplegando en Vercel esto no es opcional.** Ignorar el segundo argumento (como hacen todos los tutoriales de 2024–2025) permite que el CDN cachee una respuesta con `Set-Cookie` de sesión y la sirva a otro usuario. Para esta app eso significa que un aseador podría recibir la sesión del admin.

### Trampa #2: `getClaims()` reemplazó a `getUser()` como el método recomendado

Docs oficiales de Supabase (guía Next.js server-side): `getClaims()` verifica el JWT localmente con WebCrypto contra el JWKS cacheado, sin round-trip de red. `getUser()` sigue haciendo una llamada HTTP a Auth en cada request. Con un dashboard que renderiza en servidor, `getUser()` en el middleware añade latencia de red a **cada navegación**.

Regla:
- **`getClaims()`** → proteger rutas, leer `sub` y custom claims. Es lo que va en el middleware y en los layouts.
- **`getUser()`** → solo cuando necesitas el registro fresco del usuario (p. ej. justo después de que el admin desactiva un aseador y necesitas confirmar el estado real).
- **`getSession()`** → nunca para autorizar. Advertencia literal de la doc: *"Never trust `supabase.auth.getSession()` inside server code."*

### Trampa #3: `cookies()` es async en Next 15

En Next 15 `cookies()` de `next/headers` devuelve una Promise. Los snippets de Context7 aún muestran `const cookieStore = cookies()` sin `await` — están desactualizados. Siempre `await cookies()`, y por eso la factory del server client es `async`.

### Trampa #4: nombres de API keys

Supabase migró a `sb_publishable_...` / `sb_secret_...`. Cita literal de la doc: *"They will be deprecated by the end of 2026, and you should now use the publishable (`sb_publishable_xxx`) and secret (`sb_secret_xxx`) keys instead."* Como este proyecto arranca greenfield en 2026, **arrancar directo con las nuevas keys**; nunca crear código que asuma `anon` / `service_role`.

Env vars:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...        # server-only, jamás NEXT_PUBLIC_
```

### Código de referencia

`lib/supabase/client.ts` (browser, Client Components):
```ts
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/lib/database.types'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )
}
```

`lib/supabase/server.ts` (Server Components / Server Actions / Route Handlers):
```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/lib/database.types'

export async function createClient() {
  const cookieStore = await cookies()   // async en Next 15

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component: el refresh lo hace el middleware. Ignorar.
          }
        },
      },
    }
  )
}
```

`middleware.ts` (refresh de sesión + guard de rol):
```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        // OJO: dos argumentos. `headers` es obligatorio en Vercel.
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
          Object.entries(headers).forEach(([k, v]) =>
            response.headers.set(k, v)
          )
        },
      },
    }
  )

  // No meter NADA entre createServerClient y getClaims.
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims

  const path = request.nextUrl.pathname
  if (!claims && !path.startsWith('/login')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)',
  ],
}
```

**Nota sobre el matcher:** hay que excluir explícitamente `sw.js`, `manifest.webmanifest` y los iconos. Si el middleware intercepta el service worker, el scope de registro se rompe y en iOS el PWA deja de instalarse correctamente.

### Rol admin vs aseador

RLS necesita el rol en el JWT, no en una tabla consultada por policy (eso genera recursión y coste por fila). Patrón: **Custom Access Token Hook** de Supabase Auth que inyecta `user_role` en el claim, y policies que leen `auth.jwt() ->> 'user_role'`. La invalidación inmediata al desactivar un aseador se resuelve con `auth.admin.signOut(userId, 'global')` desde una Server Action con `SUPABASE_SECRET_KEY`, más un check de `activo` en la policy para cubrir la ventana del access token vigente (~1h).

**Confidence: HIGH** (todo verificado contra `.d.ts` del paquete y docs oficiales).

---

## 2. Parseo de iCal — comparativa y decisión

### Evidencia empírica (no training data)

Analicé **432 snapshots de un feed real de Airbnb y 398 de uno real de Booking.com** (14 meses de historial versionado, del 2025-06-28 al 2026-08-30). Esto es lo que hay de verdad en el cable:

**Airbnb** — `PRODID:-//Airbnb Inc//Hosting Calendar 1.0//EN`
```
BEGIN:VEVENT
DTSTAMP:20260830T124408Z
DTSTART;VALUE=DATE:20260824
DTEND;VALUE=DATE:20260830
SUMMARY:Reserved
UID:1418fb94e984-852c89f27ecf42cf813dc4bdc20995fa@airbnb.com
DESCRIPTION:Reservation URL: https://www.airbnb.com/hosting/reservations/de
 tails/HMYXB825YD\nPhone Number (Last 4 Digits): 0882
END:VEVENT
```

Hechos verificados sobre 2408 VEVENTs:
- **Solo existen 6 propiedades:** `DTSTAMP`, `DTSTART`, `DTEND`, `SUMMARY`, `UID`, `DESCRIPTION`. **Cero propiedades `X-`. Cero `RRULE`. Cero `VTIMEZONE`. Cero `LOCATION`. Cero `STATUS`.** La preocupación por "quirks X-" no aplica.
- **`SUMMARY` tiene exactamente dos valores posibles:** `Reserved` (1708 ocurrencias) y `Airbnb (Not available)` (700). Ese es el discriminador reserva-vs-bloqueo del propietario.
- **`DESCRIPTION` existe solo en los `Reserved`** (1708 = 1708, coincidencia exacta). Los bloqueos no la tienen.
- **El código de reserva (`HMYXB825YD`) vive únicamente dentro de la URL en `DESCRIPTION`.** Ya no está en `SUMMARY` (Airbnb lo quitó en dic-2019 por privacidad). Regex: `/reservations\/details\/([A-Z0-9]+)/`.
- **La `DESCRIPTION` viene *folded* a 75 octetos** con continuación por espacio inicial (`...de\n tails/...`). Un parser que no haga unfolding parte el código de reserva a la mitad. Esta es la trampa práctica real.
- **El `UID` ES ESTABLE ante cambios de fecha.** De 75 UIDs distintos, 4 mutaron su rango de fechas manteniendo el mismo UID. Caso literal: un `Reserved` cuyo `DTEND` pasó de `20260830` a `20260902` con **el mismo UID** = extensión de estadía. Esto es exactamente el requisito "detección de extensiones".
- **Un código de reserva nunca mapeó a más de un UID** (relación 1:1 verificada).
- **Los bloqueos (`Airbnb (Not available)`) SÍ re-generan UIDs y mutan fechas día a día.** Observé un bloqueo cuyo `DTEND` creció de `20260811` a `20260824` en incrementos diarios, y otro que cambió de UID conservando el periodo. Si ingieres bloqueos, generas churn masivo de "reprogramaciones" falsas.

**Booking.com** — `PRODID:-//admin.booking.com\, b.v.//NONSGML v1.0//EN`
```
BEGIN:VEVENT
DTSTAMP:20260830T124409Z
DTSTART;VALUE=DATE:20260908
DTEND;VALUE=DATE:20260913
UID:e927afc01f6b8d7001fbd73485479170@booking.com
SUMMARY:CLOSED - Not available
ORGANIZER:mailto:noreply@booking.com
END:VEVENT
```

Hechos verificados sobre 1071 VEVENTs:
- **`SUMMARY` es SIEMPRE, sin excepción, `CLOSED - Not available`.** No hay forma de distinguir reserva pagada de bloqueo manual.
- **No hay `DESCRIPTION`. Nunca.** → **No existe código de reserva en el iCal de Booking.com.**
- `ORGANIZER` aparece solo en 105 de 1071 eventos: es inconsistente, no confiable como discriminador.
- El `PRODID` trae una coma escapada literal (`admin.booking.com\, b.v.`) fuera de un contexto de valor de texto. Parsers estrictos de RFC 5545 se quejan; `node-ical` lo tolera.

> **Implicación para el roadmap (crítica):** el requisito *"El sistema detecta extensiones mal creadas por código único de reserva"* **es implementable solo para Airbnb**. Para Booking.com hay que detectar la extensión por continuidad de `UID` + solapamiento de fechas, o aceptar que no se detecta. Esto debe resolverse en producto antes de planear esa fase.

### Comparativa de librerías

| Librería | Versión | Estado | Veredicto |
|----------|---------|--------|-----------|
| **`node-ical`** | **0.27.1** (2026-07-21) | Activo (push 2026-08-10, 13 issues abiertos) | ✅ **ELEGIDA.** Unfolding correcto, flag `dateOnly` explícito para `VALUE=DATE`, `parseICS` síncrono + `async.fromURL`, tipos TS incluidos, ESM-first con interop CJS. Ya migró internamente a `temporal-polyfill@1` + `rrule-temporal@2`, abandonando el `rrule` muerto. |
| `ical.js` | 2.2.1 (2025-08) | Activo (Mozilla/kewisch, 72 issues) | Más bajo nivel y más correcto en RFC 5545, pero te obliga a construir tú el mapeo `ICAL.Component` → objeto de dominio. Justificado solo si necesitaras generar iCal o manejar recurrencias complejas. Para 6 propiedades planas es sobreingeniería. |
| `ical-expander` | 3.2.0 | ⚠️ **Stale de facto** | Depende de `ical.js@^1.2.2` — la línea v1, dos majors atrás. Su único valor es expandir recurrencias, que estos feeds **no tienen**. Descartar. |
| `rrule` | 2.8.1 (**2023-11**) | Abandonado | Sin releases en ~3 años. `node-ical` ya lo dejó. **No instalar.** Estos feeds no tienen `RRULE`. |

### Reglas de ingesta derivadas de la evidencia

1. **La clave de sincronización es `UID`, no `(fecha_inicio, fecha_fin)`.** Columna `uid text` con `unique (apartamento_id, uid)`.
2. **Filtrar por `SUMMARY`.** Airbnb: procesar solo `Reserved`. Booking: procesar todo (no hay alternativa) y aceptar falsos positivos de bloqueo manual, o exponer un toggle por apartamento.
3. **`DTEND` en `VALUE=DATE` es EXCLUSIVO.** `DTSTART=20260824`, `DTEND=20260830` significa que el huésped se va **el 30**, y ese es el día del aseo. `DTEND` se usa tal cual como `fecha_aseo`, sin restarle un día. Un `dateOnly` mal manejado que lo convierta a `2026-08-30T00:00:00Z` y luego se renderice en `America/Bogota` da **29 de agosto**: aseo un día antes, requisito de negocio roto.
4. **La desaparición de un evento del feed NO siempre es cancelación.** Airbnb mantiene una ventana deslizante: los eventos pasados caen del feed. La regla "reserva desapareció → cancelar aseo" debe limitarse a eventos con `DTEND >= hoy` y a aseos aún no ejecutados. Sin este guard, cada sync cancelaría aseos ya completados.
5. **Guardar el `.ics` crudo por sync** (o su hash). Cuando algo se descuadre en producción, sin el payload original la depuración es imposible.
6. **"Calendario caído" = fallo de red o HTTP != 200, o un body que no empieza por `BEGIN:VCALENDAR`.** Airbnb devuelve 200 con HTML de error en algunos casos.

**Confidence: HIGH** para el formato (evidencia directa de feeds reales). **MEDIUM** para la estabilidad de UID en Booking.com (16 UIDs observados, ninguno mutó fechas: sin contraejemplo, pero sin prueba positiva tampoco).

---

## 3. Scheduled jobs cada 30 minutos

**Veredicto: Vercel Cron (plan Pro) → Route Handler en Next. NO Supabase pg_cron para este job.**

### Datos verificados (docs Vercel, 2026-08-11 / 2026-07-15)

| | Cron jobs/proyecto | Intervalo mínimo | Precisión |
|---|---|---|---|
| Hobby | 100 | **1× por día** | Por hora (±59 min) |
| Pro | 100 | 1× por minuto | Por minuto |

Cita literal: *"Expressions like `0 * * * *` (per-hour) or `*/30 * * * *` (every 30 minutes) will fail deployment"* en Hobby. **El plan Pro es un requisito duro del proyecto, no un nice-to-have.** `*/30 * * * *` no despliega en Hobby.

Otros hechos:
- **El timezone de las expresiones cron de Vercel es SIEMPRE UTC.** Para "cierre del último día laboral del mes" (medianoche Bogotá = 05:00 UTC) hay que compensar en la expresión, no en el código.
- Vercel **no reintenta** invocaciones fallidas.
- *"Cron delivery can also occasionally invoke the same scheduled run more than once."* → **el job debe ser idempotente.** Con `unique (apartamento_id, uid)` + `upsert`, lo es por construcción.
- Vercel puede lanzar una segunda instancia si la anterior sigue corriendo → hace falta un **lock**.
- Auth: Vercel envía `Authorization: Bearer ${CRON_SECRET}` si la env var existe. Sin la env var, el endpoint queda público.

### Por qué Vercel Cron y no pg_cron

`pg_cron` + `pg_net` funciona y llega a granularidad de segundos, pero para *este* job introduce fricción sin beneficio:

1. El parser de iCal es TypeScript (`node-ical`) y ya vive en el repo de Next. Con pg_cron tendrías que **duplicarlo en una Edge Function Deno**, con otro runtime, otro deploy y otro set de tests. Un solo lenguaje, un solo deploy.
2. `pg_net` es fire-and-forget: el resultado va a `net._http_response` y hay que hacer polling para saber si falló. El requisito "alertar cuando un link de calendario deja de responder" necesita el resultado de forma síncrona.
3. El scheduler queda versionado en `vercel.json`, no como estado suelto en la tabla `cron.job` de la base.
4. Supabase recomienda ≤8 jobs concurrentes y ≤10 min por job. 39 fetches HTTP secuenciales dentro de Postgres es exactamente lo que no quieres ahí.

**Dónde SÍ usar pg_cron:** el borrado automático de historial a 6 meses. Es SQL puro, sin red, sin parsing, diario. Ahí pg_cron es la herramienta correcta y evita quemar una invocación de función.

### Setup

`vercel.json`:
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    { "path": "/api/cron/sync-calendars", "schedule": "*/30 * * * *" }
  ]
}
```

`app/api/cron/sync-calendars/route.ts`:
```ts
import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'      // node-ical y web-push NO corren en Edge
export const maxDuration = 300       // Pro: hasta 300s
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Lock a nivel Postgres: si otra corrida sigue viva, salir sin hacer nada.
  // select pg_try_advisory_lock(hashtext('sync_calendars'))
  // ...fetch de los 39 feeds con concurrencia limitada (p-limit ~6)
  // ...upsert por (apartamento_id, uid)

  return Response.json({ ok: true })
}
```

`pg_cron` para la retención (esto sí en la base):
```sql
create extension if not exists pg_cron with schema extensions;

-- 03:00 America/Bogota = 08:00 UTC
select cron.schedule(
  'purge-historial-6-meses',
  '0 8 * * *',
  $$ select public.purge_historial(interval '6 months') $$
);
```

**Confidence: HIGH** (límites y comportamiento citados textualmente de docs Vercel y Supabase).

---

## 4. Web Push (VAPID)

**Veredicto:** `web-push@3.6.7` en runtime Node. Es la única opción con tracción real.

Estado de mantenimiento verificado: release npm de 2024-01, pero el repo `web-push-libs/web-push` tuvo push el 2026-08-17 con commits de julio/agosto 2026 (incluido *"test: enable Firefox testing in CI"*). Está vivo, solo publica poco. 3.5k estrellas, 45 issues abiertos. **MEDIUM-HIGH.**

### Restricción iOS — datos duros de caniuse (`push-api.json`, 2026-08-30)

`ios_saf`: `n` hasta 3.2 → **`a #7` desde 16.4, sin cambios hasta 26.6 (la versión actual)**.
Nota #7 literal: *"Requires website to first be added to the Home Screen."*
Nota #6: *"Supported in Safari, not WKWebView nor SFSafariViewController."*

Y en `notifications.json`, `ios_saf` = `a #3` desde 16.4, nota #1: *"Supports notifications via the Push API but not the Web Notifications API."*

Traducción operativa, y esto **define el flujo de onboarding del aseador**:

1. **En iOS, `Notification.requestPermission()` lanza excepción o devuelve `denied` si la app no está instalada en la pantalla de inicio.** No hay workaround. En Safari normal el botón simplemente no puede funcionar.
2. **La instalación es manual y no promocionable.** iOS no soporta `beforeinstallprompt`. Hay que dibujar instrucciones: Compartir → Añadir a pantalla de inicio. En iOS 26 los sitios añadidos abren como web app por defecto, lo cual ayuda.
3. **`requestPermission()` requiere gesto de usuario directo.** No en `useEffect`, no en un `setTimeout`. Solo en el handler del click.
4. **No hay Web Notifications API en iOS**: toda notificación tiene que originarse en `push` event dentro del service worker con `self.registration.showNotification()`.
5. **Declarative Web Push** (Safari 18.4+/macOS 18.5+) permite push sin service worker vía payload JSON, pero requiere el mismo home-screen install y no cubre Android. No vale la pena mantener dos caminos: usar el service worker clásico, que funciona en ambos.
6. **Las suscripciones caducan sin aviso.** Al reinstalar la PWA, restaurar el iPhone o rotar el push service, la vieja muere. Al recibir `410 Gone` o `404` de `webpush.sendNotification`, borrar la fila.

> Dado que el PROJECT.md fija push como **canal único** de notificación al aseador, el "banner persistente si no lo activó" no es un detalle de UI: es el mecanismo de recuperación de un canal que se rompe solo. Debe verificar el estado real (`Notification.permission` + `pushManager.getSubscription()` + existencia de la fila en base) en cada carga, no un flag en localStorage.

### Schema y envío

```sql
create table push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  endpoint     text not null unique,          -- el endpoint ES la identidad
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_success_at timestamptz,
  failure_count int not null default 0
);
alter table push_subscriptions enable row level security;
```

Un usuario tiene N suscripciones (teléfono personal + de trabajo). `endpoint` unique, no `user_id`.

```ts
// lib/push.ts  — runtime nodejs, nunca edge
import webpush from 'web-push'

webpush.setVapidDetails(
  'mailto:ops@vivaguest.co',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

export async function notify(sub: Sub, payload: object) {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 3600, urgency: 'high' }
    )
  } catch (err: any) {
    if (err.statusCode === 404 || err.statusCode === 410) {
      await deleteSubscription(sub.endpoint)   // suscripción muerta
    } else {
      throw err
    }
  }
}
```

Generar el par VAPID una sola vez con `npx web-push generate-vapid-keys` y guardarlo. **Si rotas las claves VAPID, todas las suscripciones existentes quedan inservibles y hay que re-suscribir a los 8 aseadores a mano.**

En el cliente, `applicationServerKey` debe ir como `Uint8Array` base64url-decodificado, no como string.

**Confidence: HIGH** (caniuse + docs oficiales).

---

## 5. PWA tooling

**Veredicto: `@serwist/next@9.5.12` con build por webpack (Next 15).**

| Opción | Estado verificado | Veredicto |
|--------|-------------------|-----------|
| `next-pwa` | **v5.6.0, publicado 2022-08-23. Último push al repo 2024-07. 138 issues abiertos.** | ❌ **Muerto.** Cuatro años sin release. Nunca soportó App Router de verdad. |
| `@ducanh2912/next-pwa` | v10.2.9, 2024-09 | ⚠️ Congelado. Su propio autor (DuCanhGH) lo sucedió con Serwist. Migrar. |
| **`@serwist/next`** | **9.5.12, 2026-07-22.** Fork de Workbox por estancamiento de este último. Releases coordinadas en todo el monorepo. | ✅ **Elegida.** |
| SW a mano | — | Viable para push puro, pero el precache de los assets de Next (hashes de build en `.next/static`) es lo que no quieres escribir tú. |

### Trampa: `@serwist/turbopack` + Vercel tiene un bug abierto AHORA

Issue **serwist/serwist#360** (abierto 2026-07-21, sin fix): `createSerwistRoute` de `@serwist/turbopack` revienta en runtime en Vercel con `ERR_MODULE_NOT_FOUND: next/dist/server/config.js` cuando hay un miss de edge cache. Reportado con `@serwist/turbopack@9.5.11`, Next 16.2.10, Vercel Node runtime; confirmado por un segundo usuario en 9.5.12. El reportero además señala que aunque se arreglara el tracing, la función fallback generaría un service worker con **precache manifest vacío**, rompiendo offline en silencio para todo cliente que lo reciba.

Esto importa directamente porque el aseador tiene la PWA instalada y **las PWAs instaladas repollean la URL del SW**, así que cada cliente pega el error.

**Mitigaciones, en orden:**
1. Quedarse en Next 15.5 con build webpack + `@serwist/next` clásico. El bug no aplica. Es la razón concreta por la que no vale la pena saltar a Next 16 en el MVP.
2. Si se migra a Next 16 + Turbopack: usar `@serwist/next` en **configurator mode** con `precachePrerendered: false` (recomendación del propio maintainer en ese hilo), no `@serwist/turbopack`.

También abierto: **#363**, `register()` lanza `Cannot read properties of undefined (reading 'waiting')` cuando `navigator.serviceWorker.register()` resuelve sin registration. Envolver el registro en try/catch.

### Config

`next.config.ts`:
```ts
import withSerwistInit from '@serwist/next'

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',  // el SW en dev es un infierno de caché
})

export default withSerwist({ /* next config */ })
```

`app/manifest.ts` (Next lo genera nativamente, sin plugin):
```ts
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'VivaGuest Aseos',
    short_name: 'VivaGuest',
    start_url: '/aseos',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [
      { src: '/icons/192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
```

`app/sw.ts` combina el precache de Serwist con el handler `push` propio (`addEventListener('push', ...)` + `notificationclick` que hace `clients.openWindow` al detalle del aseo).

**Confidence: HIGH** para versiones y estado de mantenimiento; **HIGH** para el bug (issue leída directamente con comentarios del maintainer).

---

## 6. Fotos desde móvil

**Pipeline:** capturar → comprimir en el cliente → encolar en IndexedDB → subir con **signed upload URL** a bucket **privado** → registrar fila.

### Comprimir SIEMPRE antes de subir

Una foto de un iPhone moderno son 3–6 MB. Un aseo con checklist por cuarto puede llevar 15–25 fotos. 8 aseadores × decenas de aseos/día en datos móviles colombianos: sin compresión el sistema no es usable en campo y el Storage se dispara contra el requisito de retención de 6 meses.

```ts
import imageCompression from 'browser-image-compression'

const compressed = await imageCompression(file, {
  maxSizeMB: 0.6,
  maxWidthOrHeight: 1600,
  useWebWorker: true,
  fileType: 'image/jpeg',
  initialQuality: 0.8,
  preserveExif: true,   // por defecto es FALSE: el canvas destruye EXIF
})
```

**Trampa EXIF:** cualquier pipeline basado en Canvas (que es lo que hace esta librería, y lo que harías a mano) **descarta todo el EXIF**, incluyendo la orientación. Resultado: fotos rotadas 90° y sin timestamp de cámara. `preserveExif: true` lo resuelve; `browser-image-compression` además expone `getExifOrientation()` y `copyExifWithoutOrientation()`.

Decisión de producto pendiente: si "fotos con metadatos" del PROJECT.md se refiere a metadatos *de la app* (quién, cuándo, qué cuarto), esos son columnas en Postgres y el EXIF es irrelevante — en ese caso conviene **eliminar** el EXIF por privacidad (el GPS del aseador). Si se refiere a EXIF, `preserveExif: true`. Hay que decidirlo explícitamente.

`heic2any@0.0.4` (2023, versión 0.0.x) es tentador para HEIC de iPhone pero **no hace falta**: al capturar por `<input type="file" accept="image/*" capture="environment">` Safari entrega JPEG, no HEIC. Solo aparece HEIC si el usuario elige un archivo del carrete. `browser-image-compression` no lo maneja. Trampa a validar en device real.

### Signed upload URL contra bucket privado

Bucket privado. El cliente **no** debe tener permiso directo de `insert` en `storage.objects`; el path lo decide el servidor. Server Action con el cliente autenticado:

```ts
'use server'
const { data, error } = await supabase
  .storage.from('evidencia')
  .createSignedUploadUrl(`${aseoId}/${cuartoId}/${crypto.randomUUID()}.jpg`)
// -> { path, token, signedUrl }
```

Cliente:
```ts
await supabase.storage.from('evidencia').uploadToSignedUrl(path, token, blob)
```

Lectura: `createSignedUrl(path, 3600)` desde el servidor. Nunca `getPublicUrl` — el código de acceso al apartamento y las fotos del interior no pueden ser URLs adivinables.

Límite del upload estándar: 6 MB recomendado (5 GB máximo). Con compresión a 600 KB estamos holgados; no hace falta TUS/resumable.

### Offline

`useWebWorker: true` mantiene la UI viva durante la compresión. La cola: `idb@8.0.3` guardando `{ aseoId, cuartoId, blob, intentos }`, drenada por el service worker con **Background Sync** (`self.registration.sync.register('upload-photos')`).

**Trampa iOS crítica:** Background Sync API **no existe en Safari**, ni en iOS. En iPhone la cola solo drena mientras la PWA está en primer plano. Diseño obligado: retry en foreground al recuperar conectividad (`window.addEventListener('online')`) + indicador visible de "N fotos pendientes de subir". Si el modelo asume Background Sync, en iOS las evidencias se quedan atascadas sin que nadie se entere.

**Confidence: HIGH** para Supabase Storage y compresión; **HIGH** para la ausencia de Background Sync en iOS.

---

## 7. Forms + validación

**Veredicto: Server Actions + Zod como base; `react-hook-form` solo donde duele.**

Regla concreta para esta app:

| Formulario | Enfoque |
|---|---|
| Confirmación de aseo (nº huéspedes + instrucciones) | **Server Action + `useActionState` + Zod.** Son 2 campos. RHF sería overhead. |
| Botones del aseador (Empecé / Terminé / No puedo) | **Server Action pura**, sin formulario ni validación de cliente. |
| Reporte de daño / gasto / faltante | **Server Action + `useActionState`**, con `useOptimistic` para feedback inmediato. |
| CRUD de apartamento (~12 campos: tarifas, iCal, ubicación, código, hora límite, cuartos, faltantes base, responsable, suplente) | **`react-hook-form` + `zodResolver`** con `useFieldArray` para cuartos y faltantes. Los arrays dinámicos con FormData plano son dolor puro. |
| Login | Server Action. |

**El esquema Zod se define UNA vez y se comparte.** El resolver de RHF y el `safeParse` del Server Action consumen el mismo objeto. La validación de cliente es UX; la del servidor es seguridad. Ambas obligatorias, nunca duplicadas.

`next-safe-action@8.6.1` es maduro y elimina boilerplate de tipado en Server Actions, pero para el tamaño de esta app añade una abstracción más que aprender. Recomendación: **empezar sin él**; adoptarlo solo si el boilerplate de `useActionState` + `safeParse` se vuelve repetitivo en más de ~10 acciones.

Ojo con Zod v4: los imports cambian respecto a v3 y `@hookform/resolvers` necesita >= 5.x. Fijar `zod@^4.5.4` + `@hookform/resolvers@^5.9.1` juntos.

**Confidence: HIGH**.

---

## 8. Data fetching / mutations

**Veredicto: Server Components + Server Actions para el dashboard admin. TanStack Query SOLO en la PWA del aseador, y solo si el offline lo exige.**

**Dashboard admin (desktop, conectado, sin requisito offline):** RSC directo. La lista por día, la bandeja "Sin confirmar", la carga por aseador y las alertas son queries de servidor que se benefician de `revalidatePath` tras cada Server Action. Meter TanStack Query aquí duplica el estado sin ganar nada.

**PWA del aseador:** la lista de aseos asignados debe verse **sin red** (apartamento sin señal, sótano, ascensor). Dos caminos:

- **A (recomendado para el MVP):** RSC + Serwist con `NetworkFirst` sobre las rutas de la PWA. La lista queda cacheada tras la primera visita. Simple, cero estado cliente. Suficiente para "consultar el aseo y el código de acceso sin señal".
- **B (si A no alcanza):** TanStack Query `5.102.8` con `persistQueryClient` sobre IndexedDB + mutaciones con `onMutate` optimista. Da lectura offline *y* mutaciones encoladas. Coste: duplicar la capa de datos del aseador.

**No mezclar los dos en el mismo árbol.** El límite de responsabilidad es la ruta: `/(admin)/*` = RSC puro; `/(aseador)/*` = decidir A o B y sostenerlo.

Realtime de Supabase: **no en el MVP.** Con push como canal único y ~decenas de eventos/día, una suscripción websocket persistente es batería quemada en el móvil del aseador para nada.

**Confidence: MEDIUM-HIGH** (depende de qué tan estricto sea el requisito offline, que el PROJECT.md no cuantifica).

---

## 9. UI components

**Veredicto: shadcn/ui vía CLI `shadcn@4.19.0`.**

- El paquete correcto es **`shadcn`** (4.19.0, 2026-08-21). **`shadcn-ui` está `deprecated` en npm** — es el nombre viejo, mucho tutorial sigue apuntando ahí.
- Compatible con Tailwind v4 y React 19 (el init detecta ambos y ajusta las variables de tema a `@theme`).
- Copia el código a tu repo: no es una dependencia versionada. Ventaja real aquí: el checklist por cuarto y las tarjetas de aseo necesitan variantes propias, y con shadcn se editan directo.
- Runtime real que entra: `radix-ui` (primitivas), `class-variance-authority`, `tailwind-merge`, `clsx`, `lucide-react`.
- **Priorizar touch targets:** el aseador usa el móvil con guantes o manos mojadas. Los defaults de shadcn son de densidad desktop; hay que subir el tamaño en la ruta del aseador (mínimo 44×44 px, el umbral de Apple HIG).

Alternativas: **Park UI** / **Base UI** son válidas pero con menor masa crítica. **MUI / Chakra** contradicen la decisión de Tailwind. **`@supabase/auth-ui-react@0.4.7`** está en mantenimiento mínimo y no encaja con un login sin auto-registro: escribir el formulario a mano.

**Confidence: HIGH**.

---

## 10. Testing

| Capa | Herramienta | Qué se prueba |
|---|---|---|
| Lógica de dominio | **`vitest@4.1.11`** | Parser iCal contra fixtures `.ics` reales, reglas de generación/cancelación/urgencia, detección de extensión, cálculo de rentabilidad y del pago mensual. **Aquí está el riesgo real del producto.** |
| RLS | **`supabase test db` (pgTAP)** | Aislamiento admin↔aseador, invalidación al desactivar, `gestion_vivaguest = false`. |
| E2E | **`@playwright/test@1.62.1`** | Flujo del aseador: recibir push → abrir aseo → checklist con foto → terminar. Playwright controla permisos de notificación, service workers y modo offline. |

### Tests de RLS con pgTAP

Es el único método que ejerce las policies dentro de Postgres con roles reales. Estructura tomada de la doc oficial de Supabase:

```sql
-- supabase/tests/aseos_rls.test.sql
-- crear: supabase test new aseos_rls.test   |   correr: supabase test db
begin;
select plan(6);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'aseador1@vivaguest.co'),
  ('22222222-2222-2222-2222-222222222222', 'aseador2@vivaguest.co');

-- anon no tiene grant: falla antes de que corra ninguna policy
set local role anon;
select throws_ok($$select * from aseos$$, '42501', null, 'anon no lee aseos');

-- el aseador asignado ve su aseo
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select results_eq(
  $$select estado from aseos where aseador_id = '11111111-1111-1111-1111-111111111111'$$,
  array['asignado'],
  'el aseador ve su propio aseo'
);

-- otro aseador no ve nada
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select is_empty($$select * from aseos$$, 'otro aseador no ve aseos ajenos');

-- y no puede escribirlos
select is_empty(
  $$update aseos set estado = 'terminado' returning id$$,
  'otro aseador no actualiza aseos ajenos'
);

-- verificar que la fila quedó intacta (0 filas afectadas NO es prueba suficiente)
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select results_eq(
  $$select estado from aseos where aseador_id = '11111111-1111-1111-1111-111111111111'$$,
  array['asignado'],
  'el update denegado dejó la fila intacta'
);

select * from finish();
rollback;
```

**Regla no obvia de la doc oficial:** *"Matching no rows is not proof on its own. Pair every denied write with a check that the row it targeted is intact."* Un `is_empty` sobre un UPDATE puede pasar porque la policy de `SELECT` esconde la fila, mientras el UPDATE sí ocurrió. Siempre verificar el estado final desde el rol que sí puede leer.

Dado el constraint del PROJECT.md ("schema + migraciones + RLS antes que UI"), estos tests son el **entregable de la fase 1**, no algo posterior.

**Confidence: HIGH**.

---

## 11. Timezone

**Veredicto: ninguna librería de timezone. `date-fns@4.4.0` para aritmética y ya.**

Hecho decisivo: **Colombia no observa DST desde 1993.** `America/Bogota` es fijo `-05:00`, permanentemente. Toda la complejidad que justifica `luxon` o `Temporal` (transiciones DST, horas ambiguas, horas inexistentes) **no existe aquí**. Meter `luxon@3.7.2` (~70 KB) o un polyfill de `Temporal` es peso muerto en el bundle de una PWA que corre en datos móviles.

- `date-fns-tz@3.2.0`: última publicación 2024-09; además date-fns v4 lo absorbió vía `@date-fns/tz`. **No instalar `date-fns-tz`.**
- `Temporal`: aún no es baseline en Safari. Un polyfill son 200+ KB. **No.**

### Reglas de tipos en Postgres

| Concepto | Tipo | Razón |
|---|---|---|
| `fecha_aseo` | **`date`** | Es un **día calendario de negocio**, no un instante. Viene directo del `DTEND;VALUE=DATE` del VEVENT. Guardarlo como `timestamptz` es el bug clásico: `2026-08-30` → `2026-08-30T00:00:00Z` → renderizado en Bogotá = **29 de agosto**. Aseo un día antes. |
| `hora_limite` | **`time`** | Hora del día sin fecha, propiedad del apartamento. |
| `iniciado_at`, `terminado_at`, `created_at` | **`timestamptz`** | Instantes reales. Postgres normaliza a UTC. |
| Cierre de mes | derivado | "Último día laboral del mes" es lógica de aplicación sobre `date`, no un tipo. |
| Unicidad | `unique (apartamento_id, fecha_aseo) where estado <> 'cancelado'` | Índice parcial que implementa el requisito "máximo 1 aseo activo por apartamento por fecha", en la base, no en el código. |

### Reglas de código

1. **Nunca `new Date(dateString)` sobre un `date` de Postgres.** `new Date('2026-08-30')` se parsea como UTC medianoche; en Bogotá es el 29. Manejar las fechas de negocio como `string` `'YYYY-MM-DD'` de punta a punta, y usar `parseISO` de date-fns solo cuando de verdad necesites aritmética.
2. **Fijar `TZ=America/Bogota` en las env vars de Vercel.** Sin eso las funciones corren en UTC y cualquier `new Date()` en cálculos de "hoy" se desfasa 5 horas — el bug de "aseos que aparecen mañana entre 19:00 y 24:00".
3. **Las expresiones cron de Vercel son UTC.** Medianoche Bogotá = `0 5 * * *`.
4. Una sola constante `export const TZ = 'America/Bogota'` y un helper `hoyBogota(): string`. Que nunca haya un segundo lugar donde se calcule "hoy".

**Confidence: HIGH**.

---

## 12. Dinero (COP)

**Veredicto: `bigint` en Postgres representando pesos enteros. Sin librería. Sin decimales. Sin centavos.**

El peso colombiano **no tiene subunidad en circulación**. Los centavos se abolieron de facto; ningún precio, ninguna tarifa de aseo, ningún pago a aseador se expresa en fracciones de peso. Un aseo cuesta `45000`, no `4500000` centavos.

```sql
tarifa_huesped   bigint not null check (tarifa_huesped >= 0),   -- COP enteros
pago_aseador     bigint not null check (pago_aseador >= 0),
-- rentabilidad como columna generada, no calculada en el cliente
rentabilidad     bigint generated always as (tarifa_huesped - pago_aseador) stored
```

Por qué `bigint` y no `integer`: `int4` topa en 2.147.483.647. Un acumulado mensual de 39 apartamentos ya coquetea con ese techo, y un total anual lo revienta. `bigint` cuesta 4 bytes más y elimina la clase entera de bug.

**No usar:**
- `numeric` / `decimal` → invita a decimales que no existen, y `supabase-js` los devuelve como **string** (para no perder precisión), lo que rompe la aritmética en TypeScript silenciosamente.
- `float` / `double precision` → error de redondeo en dinero. Nunca.
- `dinero.js@2.0.2`, `currency.js@2.0.4`, `big.js@7.0.1` → resuelven aritmética de subunidades y conversión multi-moneda. **Aquí no hay subunidades ni multi-moneda.** Suma y resta de enteros.

Formateo, sin librería:
```ts
export const cop = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,   // COP no muestra decimales
})
// cop.format(45000) -> "$ 45.000"
```

**Trampa:** `supabase-js` devuelve `bigint` de Postgres como `number` en JS. `Number.MAX_SAFE_INTEGER` es 9.007.199.254.740.991 — a años luz de cualquier cifra de este negocio. Sin problema práctico, pero si alguna vez se suman históricos completos en SQL, castear a `text` en la query.

**Confidence: HIGH**.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Vercel Cron (Pro) | `pg_cron` + `pg_net` + Edge Function | Si el plan Vercel se queda en Hobby (donde `*/30` **no despliega**). Coste: reescribir el parser en Deno. |
| Vercel Cron | Inngest 4.18.1 / Trigger.dev 4.5.14 | Si se necesitan reintentos automáticos, backoff y durabilidad por-apartamento. Sobredimensionado para 39 feeds. |
| `node-ical` | `ical.js@2.2.1` | Si hay que *generar* iCal o manejar recurrencias reales. Ninguna de las dos aplica hoy. |
| RSC + Server Actions | TanStack Query 5.102.8 | Si el offline del aseador debe soportar **mutaciones** encoladas, no solo lectura. |
| `@serwist/next` (webpack) | `@serwist/turbopack` | Solo tras migrar a Next 16 **y** confirmar que serwist#360 esté cerrado. |
| Server Actions + Zod | `next-safe-action@8.6.1` | Cuando pasen de ~10 Server Actions y el boilerplate de tipos moleste. |
| Postgres `bigint` | `dinero.js` | Si algún día hay multi-moneda (USD para propietarios extranjeros). No en el MVP. |
| `date-fns` | `luxon` / `Temporal` | Solo si se rompe el constraint mono-timezone. El PROJECT.md lo excluye explícitamente. |
| `idb` | `dexie@4.4.5` | Si la cola offline necesita índices, consultas o varias tablas. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **`@supabase/auth-helpers-nextjs`** | Marcado `deprecated` en npm. `@supabase/ssr` exporta `warnIfUsingDeprecatedAuthHelpersPackage` para gritarte si lo tienes instalado. | `@supabase/ssr@0.12.5` |
| **`next-pwa`** | v5.6.0 publicada **2022-08-23**. Repo sin push desde 2024-07, 138 issues abiertos. Nunca soportó App Router. | `@serwist/next@9.5.12` |
| **`@ducanh2912/next-pwa`** | Congelado en 2024-09; su autor lo sucedió con Serwist. | `@serwist/next` |
| **`@serwist/turbopack` en Vercel** | Bug abierto **serwist#360**: `ERR_MODULE_NOT_FOUND` en runtime tras cache miss + precache manifest vacío. Reproducido en 9.5.11 y 9.5.12. | `@serwist/next` webpack, o configurator mode con `precachePrerendered: false` |
| **`setAll(cookiesToSet)` de un solo argumento** | Firma obsoleta. Omitir el arg `headers` deja que el CDN de Vercel cachee respuestas con cookie de sesión → **fuga de sesión entre usuarios**. | `setAll(cookiesToSet, headers)` aplicando ambos |
| **`getSession()` para autorizar** | Doc oficial: *"Never trust `supabase.auth.getSession()` inside server code."* Las cookies se pueden falsificar. | `getClaims()` |
| **`ical-expander`** | Fijado a `ical.js@^1.x`, dos majors atrás. Su única función (expandir recurrencias) no aplica: estos feeds no tienen `RRULE`. | `node-ical` |
| **`rrule@2.8.1`** | Sin releases desde 2023-11. `node-ical` ya lo abandonó por `rrule-temporal`. | No instalarlo |
| **`date-fns-tz`** | Última publicación 2024-09; date-fns v4 lo absorbió. Además, sin DST en Colombia no aporta nada. | `date-fns@4` a secas |
| **`shadcn-ui` (paquete npm)** | `deprecated`. Es el nombre viejo del CLI. | `npx shadcn@latest` |
| **`numeric` / `float` para COP** | `numeric` llega como **string** desde supabase-js; `float` redondea mal. | `bigint` de pesos enteros |
| **`timestamptz` para `fecha_aseo`** | Convierte un día calendario en un instante y en UTC-5 se desplaza un día atrás al renderizar. | `date` |
| **Runtime `edge` en cron/push** | `node-ical` y `web-push` requieren APIs de Node (crypto, streams). | `export const runtime = 'nodejs'` |
| **Confiar en Background Sync para las fotos** | No existe en Safari/iOS. La cola nunca drena en iPhone en segundo plano. | Retry en foreground + contador visible de pendientes |
| **`beforeinstallprompt` en iOS** | No existe. No hay prompt programático de instalación. | Instrucciones manuales (Compartir → Añadir a inicio) |
| **`Notification.requestPermission()` fuera de un click** | Requiere gesto de usuario; en iOS además exige la PWA ya instalada. | Handler de click, tras verificar `display-mode: standalone` |
| **Claves `anon` / `service_role` en código nuevo** | *"They will be deprecated by the end of 2026."* | `sb_publishable_...` / `sb_secret_...` |
| **`Notification` API en iOS** | No soportada (caniuse `notifications` `ios_saf` = `a #1`). | `self.registration.showNotification()` dentro del SW |

---

## Stack Patterns by Variant

**Si el proyecto se queda en Vercel Hobby:**
- Vercel Cron **no puede** correr `*/30 * * * *` (falla en deploy, no en runtime).
- Migrar el scheduler a `pg_cron` + `pg_net` → Supabase Edge Function en Deno.
- Consecuencia: el parser iCal se reescribe en Deno (con `npm:node-ical`) y se duplica el pipeline de tests. **Presupuestar el Pro es más barato que esto.**

**Si se migra a Next 16 antes del MVP:**
- Turbopack pasa a ser el builder por defecto.
- Verificar primero que **serwist#360** esté cerrado.
- Preferir `@serwist/next` en configurator mode con `precachePrerendered: false` sobre `@serwist/turbopack`.

**Si el offline del aseador debe soportar mutaciones (no solo lectura):**
- Añadir `@tanstack/react-query@5.102.8` + `persistQueryClient` sobre IndexedDB, **solo** en el árbol `/(aseador)`.
- Toda mutación necesita un `client_mutation_id` (UUID generado en el cliente) para deduplicar en el servidor tras reintentos.

**Si Booking.com pesa más que Airbnb en la operación:**
- La detección de "extensión mal creada por código de reserva" **no es implementable** (Booking no expone código).
- Alternativa: detectar por `UID` estable + solapamiento de rangos, con una alerta de menor confianza.

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `next@15.5.24` | `react@19.2.x` | Next 15.5 requiere React 19. |
| `next@15.5.24` | `@serwist/next@9.5.12` | Peer `next >=14.0.0`. Usar build webpack, no Turbopack. |
| `@supabase/ssr@0.12.5` | `@supabase/supabase-js@^2.112` | `setAll` de 2 args desde 0.12; `getClaims()` requiere supabase-js reciente. |
| `zod@4.5.4` | `@hookform/resolvers@5.9.1` | Resolvers < 5 no soportan Zod v4. |
| `react-hook-form@7.87.0` | `react@19` | OK. |
| `tailwindcss@4.3.3` | `shadcn@4.19.0` | El CLI detecta v4 y genera `@theme` en CSS, no `tailwind.config.js`. |
| `node-ical@0.27.1` | Node >= 18 | ESM-first con interop CJS. Runtime `nodejs` obligatorio, no Edge. |
| `web-push@3.6.7` | Node runtime | No funciona en Edge/Workers. |
| `@serwist/next@9.5.12` | `serwist@9.5.12` | Deben ir en la **misma versión exacta**. El monorepo publica en lockstep. |
| `vitest@4.1.11` | `vite@8.x`, `jsdom@30` | Vitest 4 pide Vite 8. |
| `supabase` CLI 2.116.0 | Postgres 17 | `supabase test db` requiere `pgtap` habilitado en `config.toml`. |

---

## Sources

- npm registry (`npm view`), consultado **2026-08-30** — todas las versiones y fechas de publicación de este documento.
- `@supabase/ssr@0.12.5` — **archivos `.d.ts` del tarball leídos directamente**. Firma de `SetAllCookies` con el argumento `headers` y su JSDoc sobre cacheo en CDN. **HIGH**.
- `/supabase/ssr` vía Context7 — patrones de `createServerClient` / middleware / Server Actions. **HIGH**.
- `/supabase/supabase` vía Context7 — test pgTAP de RLS, políticas de `storage.objects`, `createSignedUploadUrl`. **HIGH**.
- https://supabase.com/docs/guides/auth/server-side/nextjs — `getClaims()` vs `getUser()` vs `getSession()`, advertencia de headers de caché. **HIGH**.
- https://supabase.com/docs/guides/api/api-keys — deprecación de `anon`/`service_role` a fin de 2026. **HIGH**.
- https://supabase.com/docs/guides/cron y /guides/functions/schedule-functions — `pg_cron`, `pg_net`, Vault, límites de concurrencia. **HIGH**.
- https://vercel.com/docs/cron-jobs, /manage-cron-jobs, /usage-and-pricing (last_updated 2026-07/08) — límites Hobby/Pro, `CRON_SECRET`, UTC, idempotencia. **HIGH**.
- **Feeds iCal reales de Airbnb y Booking.com** — 432 y 398 snapshots versionados (2025-06-28 → 2026-08-30) analizados programáticamente: propiedades presentes, valores de `SUMMARY`, estabilidad de `UID`, mutación de fechas, line folding. Fuente: repo público `giuliapiva/reservation-sync`. **HIGH** (evidencia primaria).
- caniuse `push-api.json` y `notifications.json` (main, 2026-08-30) — iOS Safari `a #7` desde 16.4 hasta 26.6, requisito de home screen, exclusión de WKWebView. **HIGH**.
- github.com/serwist/serwist issues #360, #363, #301 — bug abierto en Turbopack+Vercel con comentarios del maintainer. **HIGH**.
- github.com/web-push-libs/web-push — actividad de commits verificada vía API (push 2026-08-17). **HIGH**.
- github.com/jens-maus/node-ical README + API — flag `dateOnly`, capas sync/async, migración a temporal-polyfill. **HIGH**.
- github.com/Donaldcwl/browser-image-compression README — opciones `preserveExif`, `useWebWorker`, helpers de EXIF. **HIGH**.
- WebSearch sobre cambios del iCal de Airbnb (dic-2019) e iOS declarative web push — **MEDIUM**, corroborado con la evidencia primaria de los feeds.

---
*Stack research for: STR housekeeping operations platform (Next.js + Supabase + PWA)*
*Researched: 2026-08-30*
