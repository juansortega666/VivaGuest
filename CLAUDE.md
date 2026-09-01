<!-- GSD:project-start source:PROJECT.md -->
## Project

**VivaGuest**

Plataforma que automatiza la asignación y ejecución de aseos en propiedades de renta corta (STR). Lee los calendarios de Airbnb/Booking vía iCal, genera el aseo al detectar el fin del bloqueo, pasa por confirmación humana del admin (número de huéspedes + instrucciones), lo asigna en firme al aseador responsable fijo del apartamento, y el aseador lo ejecuta desde una PWA con checklist por cuarto y evidencia fotográfica. Reemplaza la coordinación actual por WhatsApp y Excel sobre 39 unidades reales en 8 clusters de Colombia, de las cuales 34 se gestionan dentro del sistema y 5 son informativas.

**Core Value:** Que ningún aseo se pierda: todo checkout detectado en calendario termina en un aseo confirmado, asignado y ejecutado con evidencia, sin coordinación manual por WhatsApp.

### Constraints

- **Tech stack**: Next.js 15 (App Router) + TypeScript + Tailwind + Supabase (Postgres, Auth, Storage, RLS), deploy en Vercel — un solo proyecto sirve dashboard admin y PWA del aseador
- **Tech stack**: PWA instalable con Web Push (VAPID) — push es el único canal de notificación al aseador; en iOS exige PWA instalada en pantalla de inicio y una denegación de permiso es irreversible sin reinstalar
- **Tech stack**: la PWA es offline-first con cola de mutaciones en IndexedDB e idempotencia por `client_event_id` — iOS Safari no tiene Background Sync, así que la cola drena en foreground con contador visible de pendientes
- **Integración**: iCal de Airbnb/Booking como única fuente de calendario — no hay API oficial pública
- **Scheduler**: `pg_cron` dispara y hace fan-out con `pg_net`, una invocación por feed — aísla feeds caídos por construcción y evita depender del cron de Vercel, que en Hobby está capado a 1 corrida diaria
- **Timezone**: UTC-5 (Bogotá) fijo en todo el sistema, sin DST — `fecha_aseo` se modela como `date`, no `timestamptz`
- **Seguridad**: el código de acceso vive en tabla aparte con RPC y auditoría, no como columna — en Supabase admin y aseador comparten el rol Postgres `authenticated` y los grants por columna no discriminan usuarios
- **Seguridad**: la autorización nunca se apoya en claims del JWT — un token ya emitido sigue siendo válido hasta expirar, y la desactivación de un aseador debe surtir efecto de inmediato
- **Datos**: retención de 6 meses para aseos, checklists, fotos con metadatos, gastos y daños, con aviso 15 días antes y retención legal por aseo
- **Datos**: las fotos se comprimen a JPEG en el cliente y se les elimina el EXIF, conservando solo la corrección de orientación
- **Datos**: montos en pesos colombianos enteros (`bigint`), sin subunidad
- **Escala**: 34 unidades gestionadas, ~8 aseadores, decenas de aseos por día — no es un problema de escala, es de correctitud operativa
- **Orden de trabajo**: schema + migraciones + RLS antes que UI
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

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
## Installation
# Core (Next 15 pinned)
# Dominio: iCal + push
# PWA
# Formularios / validación / UI
# Fotos + offline
# Dev
# shadcn/ui (genera código, no instala runtime)
## 1. Supabase en Next.js App Router
### Trampa #1 (crítica, invalida el 95% de los tutoriales): `setAll` ahora recibe DOS argumentos
- `Cache-Control: private, no-cache, no-store, must-revalidate, max-age=0`
- `Expires: 0`
- `Pragma: no-cache`
### Trampa #2: en ESTE proyecto va `getUser()`, no `getClaims()`

> **CORREGIDO 2026-09-01, contra la recomendación oficial de Supabase.** La doc de Supabase
> presenta `getClaims()` como el reemplazo recomendado de `getUser()`. Para VivaGuest esa es
> la respuesta equivocada, y está medido: **tras banear a un usuario, `getUser()` devuelve
> 403 y `getClaims()` sigue respondiendo OK.** `getClaims()` valida la firma del JWT
> localmente; no pregunta al servidor de Auth si el usuario todavía existe o sigue activo.
>
> El criterio de éxito 4 del ROADMAP exige que un aseador desactivado pierda el acceso
> **de inmediato, aunque tuviera la sesión abierta**. Con `getClaims()` conservaría acceso
> hasta que expire su token. Medición en `.planning/phases/02-acceso-y-administraci-n-del-cat-logo/02-RESEARCH.md`.

- **`getUser()`** → proteger rutas y leer el usuario en middleware y layouts. Es el único que
  valida contra el servidor de Auth, que es lo que hace visible una desactivación.
- **`getClaims()`** → solo donde no importe la revocación y el costo de red sí. Hoy: ningún caso.
- **`getSession()`** → nunca para autorizar. Advertencia literal de la doc: *"Never trust `supabase.auth.getSession()` inside server code."*
- **El rol sale de `app_metadata.role`, nunca de `user_metadata`.** Medido: un aseador puede
  escribir `user_metadata.role = 'admin'` en su propio JWT. `app_metadata` no es escribible
  por el usuario y `getUser()` lo devuelve sin costo extra.
### Trampa #3: `cookies()` es async en Next 15
### Trampa #4: nombres de API keys
### Código de referencia
### Rol admin vs aseador
## 2. Parseo de iCal — comparativa y decisión
### Evidencia empírica (no training data)
- **Solo existen 6 propiedades:** `DTSTAMP`, `DTSTART`, `DTEND`, `SUMMARY`, `UID`, `DESCRIPTION`. **Cero propiedades `X-`. Cero `RRULE`. Cero `VTIMEZONE`. Cero `LOCATION`. Cero `STATUS`.** La preocupación por "quirks X-" no aplica.
- **`SUMMARY` tiene exactamente dos valores posibles:** `Reserved` (1708 ocurrencias) y `Airbnb (Not available)` (700). Ese es el discriminador reserva-vs-bloqueo del propietario.
- **`DESCRIPTION` existe solo en los `Reserved`** (1708 = 1708, coincidencia exacta). Los bloqueos no la tienen.
- **El código de reserva (`HMYXB825YD`) vive únicamente dentro de la URL en `DESCRIPTION`.** Ya no está en `SUMMARY` (Airbnb lo quitó en dic-2019 por privacidad). Regex: `/reservations\/details\/([A-Z0-9]+)/`.
- **La `DESCRIPTION` viene *folded* a 75 octetos** con continuación por espacio inicial (`...de\n tails/...`). Un parser que no haga unfolding parte el código de reserva a la mitad. Esta es la trampa práctica real.
- **El `UID` ES ESTABLE ante cambios de fecha.** De 75 UIDs distintos, 4 mutaron su rango de fechas manteniendo el mismo UID. Caso literal: un `Reserved` cuyo `DTEND` pasó de `20260830` a `20260902` con **el mismo UID** = extensión de estadía. Esto es exactamente el requisito "detección de extensiones".
- **Un código de reserva nunca mapeó a más de un UID** (relación 1:1 verificada).
- **Los bloqueos (`Airbnb (Not available)`) SÍ re-generan UIDs y mutan fechas día a día.** Observé un bloqueo cuyo `DTEND` creció de `20260811` a `20260824` en incrementos diarios, y otro que cambió de UID conservando el periodo. Si ingieres bloqueos, generas churn masivo de "reprogramaciones" falsas.
- **`SUMMARY` es SIEMPRE, sin excepción, `CLOSED - Not available`.** No hay forma de distinguir reserva pagada de bloqueo manual.
- **No hay `DESCRIPTION`. Nunca.** → **No existe código de reserva en el iCal de Booking.com.**
- `ORGANIZER` aparece solo en 105 de 1071 eventos: es inconsistente, no confiable como discriminador.
- El `PRODID` trae una coma escapada literal (`admin.booking.com\, b.v.`) fuera de un contexto de valor de texto. Parsers estrictos de RFC 5545 se quejan; `node-ical` lo tolera.
### Comparativa de librerías
| Librería | Versión | Estado | Veredicto |
|----------|---------|--------|-----------|
| **`node-ical`** | **0.27.1** (2026-07-21) | Activo (push 2026-08-10, 13 issues abiertos) | ✅ **ELEGIDA.** Unfolding correcto, flag `dateOnly` explícito para `VALUE=DATE`, `parseICS` síncrono + `async.fromURL`, tipos TS incluidos, ESM-first con interop CJS. Ya migró internamente a `temporal-polyfill@1` + `rrule-temporal@2`, abandonando el `rrule` muerto. |
| `ical.js` | 2.2.1 (2025-08) | Activo (Mozilla/kewisch, 72 issues) | Más bajo nivel y más correcto en RFC 5545, pero te obliga a construir tú el mapeo `ICAL.Component` → objeto de dominio. Justificado solo si necesitaras generar iCal o manejar recurrencias complejas. Para 6 propiedades planas es sobreingeniería. |
| `ical-expander` | 3.2.0 | ⚠️ **Stale de facto** | Depende de `ical.js@^1.2.2` — la línea v1, dos majors atrás. Su único valor es expandir recurrencias, que estos feeds **no tienen**. Descartar. |
| `rrule` | 2.8.1 (**2023-11**) | Abandonado | Sin releases en ~3 años. `node-ical` ya lo dejó. **No instalar.** Estos feeds no tienen `RRULE`. |
### Reglas de ingesta derivadas de la evidencia
## 3. Scheduled jobs cada 30 minutos
### Datos verificados (docs Vercel, 2026-08-11 / 2026-07-15)
| | Cron jobs/proyecto | Intervalo mínimo | Precisión |
|---|---|---|---|
| Hobby | 100 | **1× por día** | Por hora (±59 min) |
| Pro | 100 | 1× por minuto | Por minuto |
- **El timezone de las expresiones cron de Vercel es SIEMPRE UTC.** Para "cierre del último día laboral del mes" (medianoche Bogotá = 05:00 UTC) hay que compensar en la expresión, no en el código.
- Vercel **no reintenta** invocaciones fallidas.
- *"Cron delivery can also occasionally invoke the same scheduled run more than once."* → **el job debe ser idempotente.** Con `unique (apartamento_id, uid)` + `upsert`, lo es por construcción.
- Vercel puede lanzar una segunda instancia si la anterior sigue corriendo → hace falta un **lock**.
- Auth: Vercel envía `Authorization: Bearer ${CRON_SECRET}` si la env var existe. Sin la env var, el endpoint queda público.
### Por qué Vercel Cron y no pg_cron
### Setup
## 4. Web Push (VAPID)
### Restricción iOS — datos duros de caniuse (`push-api.json`, 2026-08-30)
### Schema y envío
## 5. PWA tooling
| Opción | Estado verificado | Veredicto |
|--------|-------------------|-----------|
| `next-pwa` | **v5.6.0, publicado 2022-08-23. Último push al repo 2024-07. 138 issues abiertos.** | ❌ **Muerto.** Cuatro años sin release. Nunca soportó App Router de verdad. |
| `@ducanh2912/next-pwa` | v10.2.9, 2024-09 | ⚠️ Congelado. Su propio autor (DuCanhGH) lo sucedió con Serwist. Migrar. |
| **`@serwist/next`** | **9.5.12, 2026-07-22.** Fork de Workbox por estancamiento de este último. Releases coordinadas en todo el monorepo. | ✅ **Elegida.** |
| SW a mano | — | Viable para push puro, pero el precache de los assets de Next (hashes de build en `.next/static`) es lo que no quieres escribir tú. |
### Trampa: `@serwist/turbopack` + Vercel tiene un bug abierto AHORA
### Config
## 6. Fotos desde móvil
### Comprimir SIEMPRE antes de subir
### Signed upload URL contra bucket privado
### Offline
## 7. Forms + validación
| Formulario | Enfoque |
|---|---|
| Confirmación de aseo (nº huéspedes + instrucciones) | **Server Action + `useActionState` + Zod.** Son 2 campos. RHF sería overhead. |
| Botones del aseador (Empecé / Terminé / No puedo) | **Server Action pura**, sin formulario ni validación de cliente. |
| Reporte de daño / gasto / faltante | **Server Action + `useActionState`**, con `useOptimistic` para feedback inmediato. |
| CRUD de apartamento (~12 campos: tarifas, iCal, ubicación, código, hora límite, cuartos, faltantes base, responsable, suplente) | **`react-hook-form` + `zodResolver`** con `useFieldArray` para cuartos y faltantes. Los arrays dinámicos con FormData plano son dolor puro. |
| Login | Server Action. |
## 8. Data fetching / mutations
- **A (recomendado para el MVP):** RSC + Serwist con `NetworkFirst` sobre las rutas de la PWA. La lista queda cacheada tras la primera visita. Simple, cero estado cliente. Suficiente para "consultar el aseo y el código de acceso sin señal".
- **B (si A no alcanza):** TanStack Query `5.102.8` con `persistQueryClient` sobre IndexedDB + mutaciones con `onMutate` optimista. Da lectura offline *y* mutaciones encoladas. Coste: duplicar la capa de datos del aseador.
## 9. UI components
- El paquete correcto es **`shadcn`** (4.19.0, 2026-08-21). **`shadcn-ui` está `deprecated` en npm** — es el nombre viejo, mucho tutorial sigue apuntando ahí.
- Compatible con Tailwind v4 y React 19 (el init detecta ambos y ajusta las variables de tema a `@theme`).
- Copia el código a tu repo: no es una dependencia versionada. Ventaja real aquí: el checklist por cuarto y las tarjetas de aseo necesitan variantes propias, y con shadcn se editan directo.
- Runtime real que entra: `radix-ui` (primitivas), `class-variance-authority`, `tailwind-merge`, `clsx`, `lucide-react`.
- **Priorizar touch targets:** el aseador usa el móvil con guantes o manos mojadas. Los defaults de shadcn son de densidad desktop; hay que subir el tamaño en la ruta del aseador (mínimo 44×44 px, el umbral de Apple HIG).
## 10. Testing
| Capa | Herramienta | Qué se prueba |
|---|---|---|
| Lógica de dominio | **`vitest@4.1.11`** | Parser iCal contra fixtures `.ics` reales, reglas de generación/cancelación/urgencia, detección de extensión, cálculo de rentabilidad y del pago mensual. **Aquí está el riesgo real del producto.** |
| RLS | **`supabase test db` (pgTAP)** | Aislamiento admin↔aseador, invalidación al desactivar, `gestion_vivaguest = false`. |
| E2E | **`@playwright/test@1.62.1`** | Flujo del aseador: recibir push → abrir aseo → checklist con foto → terminar. Playwright controla permisos de notificación, service workers y modo offline. |
### Tests de RLS con pgTAP
## 11. Timezone
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
## 12. Dinero (COP)
- `numeric` / `decimal` → invita a decimales que no existen, y `supabase-js` los devuelve como **string** (para no perder precisión), lo que rompe la aritmética en TypeScript silenciosamente.
- `float` / `double precision` → error de redondeo en dinero. Nunca.
- `dinero.js@2.0.2`, `currency.js@2.0.4`, `big.js@7.0.1` → resuelven aritmética de subunidades y conversión multi-moneda. **Aquí no hay subunidades ni multi-moneda.** Suma y resta de enteros.
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
## What NOT to Use
| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **`@supabase/auth-helpers-nextjs`** | Marcado `deprecated` en npm. `@supabase/ssr` exporta `warnIfUsingDeprecatedAuthHelpersPackage` para gritarte si lo tienes instalado. | `@supabase/ssr@0.12.5` |
| **`next-pwa`** | v5.6.0 publicada **2022-08-23**. Repo sin push desde 2024-07, 138 issues abiertos. Nunca soportó App Router. | `@serwist/next@9.5.12` |
| **`@ducanh2912/next-pwa`** | Congelado en 2024-09; su autor lo sucedió con Serwist. | `@serwist/next` |
| **`@serwist/turbopack` en Vercel** | Bug abierto **serwist#360**: `ERR_MODULE_NOT_FOUND` en runtime tras cache miss + precache manifest vacío. Reproducido en 9.5.11 y 9.5.12. | `@serwist/next` webpack, o configurator mode con `precachePrerendered: false` |
| **`setAll(cookiesToSet)` de un solo argumento** | Firma obsoleta. Omitir el arg `headers` deja que el CDN de Vercel cachee respuestas con cookie de sesión → **fuga de sesión entre usuarios**. | `setAll(cookiesToSet, headers)` aplicando ambos |
| **`getSession()` para autorizar** | Doc oficial: *"Never trust `supabase.auth.getSession()` inside server code."* Las cookies se pueden falsificar. | `getUser()` |
| **`getClaims()` para proteger rutas** | Valida la firma del JWT en local, no pregunta al servidor de Auth. **Medido: tras un ban devuelve OK mientras `getUser()` da 403.** Rompe el criterio de revocación inmediata. Es lo que recomienda la doc oficial de Supabase; acá no aplica. | `getUser()` |
| **Leer el rol de `user_metadata`** | El usuario puede escribirlo en su propio JWT. Medido: un aseador se puede poner `role: 'admin'`. | `app_metadata.role` |
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
## Stack Patterns by Variant
- Vercel Cron **no puede** correr `*/30 * * * *` (falla en deploy, no en runtime).
- Migrar el scheduler a `pg_cron` + `pg_net` → Supabase Edge Function en Deno.
- Consecuencia: el parser iCal se reescribe en Deno (con `npm:node-ical`) y se duplica el pipeline de tests. **Presupuestar el Pro es más barato que esto.**
- Turbopack pasa a ser el builder por defecto.
- Verificar primero que **serwist#360** esté cerrado.
- Preferir `@serwist/next` en configurator mode con `precachePrerendered: false` sobre `@serwist/turbopack`.
- Añadir `@tanstack/react-query@5.102.8` + `persistQueryClient` sobre IndexedDB, **solo** en el árbol `/(aseador)`.
- Toda mutación necesita un `client_mutation_id` (UUID generado en el cliente) para deduplicar en el servidor tras reintentos.
- La detección de "extensión mal creada por código de reserva" **no es implementable** (Booking no expone código).
- Alternativa: detectar por `UID` estable + solapamiento de rangos, con una alerta de menor confianza.
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
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
