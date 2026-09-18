# Stack Tecnológico

**Fecha de análisis:** 2026-09-18

> Este documento verifica contra el código real lo que `CLAUDE.md` promete. Donde el código
> se apartó de esa promesa, se documenta la divergencia y la razón medida, no la intención
> original. `CLAUDE.md` describe la decisión de arranque; este archivo describe qué quedó
> vigente tras 8 fases de ejecución.

## Divergencias confirmadas contra CLAUDE.md

Estas cuatro son las que cambian el diagnóstico de cualquier fase nueva:

1. **No se usa `node-ical`.** `CLAUDE.md` lo recomienda con evidencia empírica de los feeds.
   El research de la Fase 3 lo descalificó por medición, no por preferencia: `lib/domain/ical.ts`
   documenta que `node-ical@0.27.1`, corrido contra el mismo feed real, (a) construye un objeto
   temporal de JS cuyo instante depende de la zona del proceso, corriendo bajo `TZ=UTC` desplaza
   el fin de checkout un día atrás en Bogotá, y (b) colapsa en silencio dos `VEVENT` con el mismo
   `UID` y fechas distintas ("VEVENT en el texto: 2 | eventos devueltos: 1"). El parser real es un
   módulo propio, puro, sin dependencias, que nunca construye un objeto `Date` de JavaScript
   (invariante vigilada por el guardarraíl 10 de `scripts/ci/check-service-role.sh`).
   `lib/domain/ical-preview.ts` es un escáner diagnóstico previo de la Fase 2 que se conserva
   aparte, con divergencia deliberada frente al parser real.
2. **No hay `browser-image-compression`.** La dependencia real de compresión de fotos en cliente
   es `compressorjs@1.3.0` (`package.json`), consumida desde `lib/fotos/subir.ts`.
3. **No hay `radix-ui` como base de componentes.** shadcn se generó sobre `@base-ui/react@1.7.0`
   (ver `components/ui/alert-dialog.tsx`, `popover.tsx`, `sheet.tsx`, `accordion.tsx`, `progress.tsx`),
   no sobre las primitivas Radix que `CLAUDE.md` da por sentadas.
4. **La retención de 6 meses se abandonó el 2026-09-18.** La migración `29_consumo_de_storage.sql`
   documenta la decisión del dueño del producto: "NADA SE BORRA NUNCA: ni las fotos a los 30 días,
   ni los aseos a los 6 meses. Cuando el espacio apriete, se paga Pro." La tabla
   `storage_deletion_queue` y el schema de retención de la migración 06 siguen en el schema pero
   sin worker de purga que los drene; la señal operativa que reemplaza a la purga es
   `public.consumo_de_storage()`, que alimenta el medidor de cupo del panel admin (alerta al 70%).

**Lo que sigue vigente sin cambios:** el scheduler es `pg_cron` + `pg_net` (no Vercel Cron, ver
INTEGRATIONS.md), `getUser()` para autorización, `bigint` para COP, `date` para `fecha_aseo`,
Web Push VAPID como único canal, y el pin de Next 15.5 con build webpack (no Turbopack).

## Lenguajes

**Primario:**
- TypeScript `^5.9.3` — todo `app/`, `lib/`, `components/`
- SQL (PostgreSQL 17, dialecto Supabase) — `supabase/migrations/` (29 migraciones), políticas RLS, funciones `plpgsql`

**Shell:**
- Bash — los tres guardarraíles de arquitectura en `scripts/ci/`

## Runtime

**Entorno:**
- Node.js (runtime `nodejs` explícito en rutas que tocan `node:crypto`, Storage o push; nunca `edge`, porque `web-push` y el cliente admin de Supabase requieren APIs de Node)
- Next.js 15.5.24 (pin exacto, build webpack, no Turbopack)

**Gestor de paquetes:**
- npm (no hay `pnpm-lock.yaml` ni `yarn.lock` en la raíz visible)

## Frameworks y librerías core

**Core:**
- `next` `15.5.24` — App Router, sirve dashboard admin y PWA del aseador desde un solo proyecto
- `react` / `react-dom` `19.2.8`
- `@supabase/supabase-js` `2.112.4` — cliente Postgres/Auth/Storage
- `@supabase/ssr` `0.12.5` — clientes SSR con cookies para App Router
- `supabase` CLI `2.116.0` (devDependency) — migraciones, `gen types`, `test db` (pgTAP)

**UI:**
- `@base-ui/react` `1.7.0` — primitivas headless bajo `components/ui/` (no Radix, ver divergencias)
- `tailwindcss` `4.3.3` + `@tailwindcss/postcss` `4.3.3` — config en CSS (`@theme`), sin `tailwind.config.js`
- `shadcn` CLI `4.19.1` — genera componentes en el repo, no es dependencia runtime
- `lucide-react` `1.39.0`, `class-variance-authority` `0.7.1`, `tailwind-merge` `3.6.0`, `clsx` `2.1.1`
- `cmdk` `1.1.1`, `tw-animate-css` `1.4.0`, `sonner` `2.0.8` (toasts)

**Formularios y validación:**
- `zod` `4.5.4` — Server Actions, parseo del VEVENT, validación de env vars
- `react-hook-form` `7.87.0` + `@hookform/resolvers` `5.9.1` — solo formularios largos del admin (CRUD de apartamento)

**Fotos:**
- `compressorjs` `1.3.0` — compresión de fotos en cliente antes de subir a Storage (ver divergencia #2)

**PWA:**
- `@serwist/next` `9.5.12` + `serwist` `9.5.12` (devDependency, misma versión exacta, lockstep) — service worker en `app/sw.ts`, precache, manifest en `app/manifest.ts`
- `web-push` `3.6.7` — envío VAPID desde servidor (`lib/push/envio.ts`)

**Testing:**
- `vitest` `4.1.11` — unitarios (`vitest.config.ts`) e integración (`vitest.integration.config.ts`, config separada)
- `@playwright/test` `1.62.1` — E2E (`playwright.config.ts`); a la fecha de este análisis corre con cero specs a propósito, aterriza con cada feature de pantalla
- `supabase test db` (pgTAP) — tests de políticas RLS dentro de Postgres

## Configuración

**Variables de entorno** (`lib/env.ts`):
- Públicas (`NEXT_PUBLIC_*`, seguras en bundle cliente): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- Secretas de servidor: validadas por `readServerSecret()`, que rechaza en runtime cualquier nombre con prefijo `NEXT_PUBLIC_`. `SUPABASE_SECRET_KEY` es la única leída fuera de `lib/supabase/admin.ts` (guardarraíl 1 y 2 de CI)
- `.env*` presente en el repo (contenido no inspeccionado; existencia only)

**TypeScript:**
- `tsconfig.json` con `jsx: "preserve"` (compila JSX Next, no `tsc`); `vitest.config.ts` fuerza `oxc.jsx.runtime: 'automatic'` porque Vite 8 (Vitest 4) usa el transformador `oxc`, no `esbuild`

**Build:**
- `next.config.ts` (no inspeccionado en detalle en esta pasada) + integración Serwist en modo webpack

**Alias de import:**
- `@/` apunta a la raíz del repo (replicado en `vitest.config.ts` porque Vitest no lee el `paths` de `tsconfig.json`)

## Guardarraíles de CI (`scripts/ci/`)

Tres tests de arquitectura que ninguna suite de comportamiento puede cubrir, corridos con
`npm run ci:arch` y en el job `arquitectura` de `ci/db.yml`:

1. **`check-service-role.sh`** — 10 invariantes estructurales sobre la clave `service_role`:
   solo se nombra en `lib/supabase/admin.ts`, ningún secreto con prefijo `NEXT_PUBLIC_`,
   `admin.ts` importa `server-only`, ninguna migración usa `current_date`/`now()::date`,
   la fábrica administrativa solo se importa desde Server Actions/`app/api/`/`lib/test/`,
   ningún color literal fuera de `globals.css`, quien construye la fábrica llama antes a un
   guard de sesión, la tabla de secretos del apartamento solo se nombra donde se construyó la
   fábrica, la descripción cruda de la reserva no se nombra en código de aplicación, y el
   parser de iCal no construye objetos `Date` de JavaScript.
2. **`check-max-w-tallas.sh`** — prohíbe clases `max-w-<talla>` (`max-w-sm`, `min-w-xs`) en
   `app/`, `components/`, `lib/`. Causa: Tailwind v4.3 resuelve `max-w-<nombre>` contra el
   namespace `--spacing-*` antes que `--container-*`, y el proyecto nombra su escala de
   espaciado con nombres de talla. El defecto es invisible a `tsc` y a los unitarios: solo se
   ve en el CSS emitido del build.
3. **`check-escala-movil.sh`** — prohíbe clases tipográficas sin sufijo `-movil` bajo
   `app/(cleaner)/`. Causa: iOS Safari hace zoom automático al enfocar un campo con
   `font-size` menor a 16px; `05-UI-SPEC.md` §3.1 declara una escala de texto más grande
   (28/20/16/14px) para el árbol del aseador frente a la del admin (24/16/14/12px).

## Plataforma

**Desarrollo:**
- Stack local de Supabase (`supabase db start`), pgTAP habilitado
- Worktrees paralelos comparten máquina; `scripts/dev/setup-worktree.sh` y `PLAYWRIGHT_PORT` configurable mitigan colisión de puerto 3000

**Producción:**
- Vercel (deploy del único proyecto Next.js)
- Supabase managed (Postgres 17, Auth, Storage, `pg_cron` 1.6.4, `pg_net` 0.20.4)

---

*Stack analysis: 2026-09-18*
