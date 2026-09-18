<!-- refreshed: 2026-09-18 -->
# Arquitectura

**Fecha de análisis:** 2026-09-18

## Visión general del sistema

```text
┌─────────────────────────────────────────────────────────────────────┐
│                    UN SOLO PROYECTO NEXT.JS (App Router)             │
├───────────────────────────┬───────────────────────────┬─────────────┤
│   app/(admin)/             │   app/(cleaner)/           │ app/(public)/│
│   Dashboard del admin      │   PWA del aseador          │ Login       │
│   `app/(admin)`            │   `app/(cleaner)`          │ `app/(public)`│
└─────────────┬───────────────┴─────────────┬───────────────┴─────┬───┘
              │                             │                     │
              │      NO COMPARTEN COMPONENTES DE UI                │
              │      solo comparten `lib/domain` (reglas puras)     │
              ▼                             ▼                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│  lib/data/  (lecturas tipadas)     lib/domain/ (reglas puras)         │
│  Server Actions en cada `_actions.ts` de cada ruta (mutaciones)       │
└─────────────────────────────┬─────────────────────────────────────┘
                              │ `@supabase/ssr` con `getUser()`
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    POSTGRES (Supabase) — LA FRONTERA REAL             │
│  RLS · grants por columna · funciones `security definer` con guarda  │
│  `supabase/migrations/`                                              │
└───────────┬───────────────────────────────────────┬─────────────────┘
            │                                       │
            ▼                                       ▼
┌───────────────────────┐               ┌───────────────────────────┐
│ pg_cron + pg_net       │               │ Storage (fotos evidencia) │
│ dispara `/api/cron/*`  │               │ bucket privado, signed URL │
└───────────────────────┘               └───────────────────────────┘
```

## Las dos superficies, un solo repo

`app/(admin)/` y `app/(cleaner)/` son dos productos distintos que conviven en el mismo proyecto Next.js por conveniencia de deploy (un único Vercel), no porque compartan diseño:

- **`app/(admin)/`**: dashboard de escritorio. Confirma aseos, asigna aseadoras, ve finanzas, administra el catálogo de apartamentos y aseadores.
- **`app/(cleaner)/`**: PWA instalable, densidad de touch target (mínimo 44×44px), ejecuta el aseo con checklist por cuarto y evidencia fotográfica.
- **`app/(public)/`**: login, la única ruta común a ambos roles antes de autenticarse.

**Regla de la arquitectura, no negociable:** ningún componente de `app/(admin)/_components/` se importa desde `app/(cleaner)/_components/` ni viceversa. Lo único que ambos árboles importan es `lib/domain/`, que son funciones puras sin JSX ni acceso a Postgres (parseo de iCal, cálculo de money, reglas de checklist, fechas Bogotá, validaciones Zod). Si una regla de negocio se necesita en las dos superficies, vive en `lib/domain/`; si es solo de lectura de datos, vive en `lib/data/` y cada superficie llama su propia función.

## La frontera de seguridad real: no está en el código de UI

Esta es la decisión arquitectónica más importante del proyecto, y viola la intuición típica de "proteger en el server action". Aquí la protección de datos sensibles vive en **tres capas dentro de Postgres**, en este orden de fuerza:

1. **RLS (row level security)** separa por FILA: qué aseos, qué apartamentos ve cada usuario según `private.is_admin()` / `private.is_active_cleaner()` y `private.my_property_ids()`.
2. **Grants por columna** separan dentro de la fila permitida: `revoke select on public.cleanings from authenticated` + `grant select (lista enumerada de columnas)`. Es la única herramienta disponible porque **admin y aseador comparten el mismo rol Postgres `authenticated`** — no existe "solo el admin" como categoría de grant (constraint literal del proyecto).
3. **Funciones `security definer`** recuperan lo que el grant por columna le quitó a todo el mundo, con una guarda de rol como **primera sentencia ejecutable del cuerpo** (`private.is_admin()`, si no → `42501`). Una definer de `postgres` corre con `rolbypassrls = t`: salta RLS entera, así que sin la guarda cualquiera que llame la función se lleva el catálogo completo.

### Por qué el dinero se lee así, y ejemplo medido

`supabase/migrations/20260913110000_24_frontera_del_aseador.sql` cierra una fuga **medida, no supuesta**: impersonando a una aseadora contra el schema anterior, `select max(tarifa_huesped) from cleanings` devolvía 90000 — la tarifa real viajaba al teléfono aunque ninguna pantalla la pintara. La migración:

- Quita `tarifa_huesped` y `pago_aseador` del grant de `public.cleanings` (28 columnas → 26 otorgadas) y de `public.properties` (18 → 16).
- El admin las recupera vía funciones definer (`supabase/migrations/20260913130000_26_lecturas_financieras.sql`: `resumen_financiero`, `costo_por_aseadora`, `rentabilidad_aseos`, etc.; `supabase/migrations/20260917100000_28_detalle_de_aseo.sql`: el dinero del panel lateral de un aseo específico).
- El aseador **nunca** ve estas funciones: no existen equivalentes suyas para dinero de aseo. Lo único que ve de dinero es su propio pago **ya cerrado**, vía `public.mis_pagos_cerrados` / `public.detalle_de_mi_pago` (`supabase/migrations/20260913140000_27_pagos_y_mis_pagos.sql`), nunca el periodo en curso — porque ese número puede *bajar* (un aseo cancelado) y un número que baja en el teléfono de quien lo va a cobrar es una discusión garantizada.

### Las siete reglas que se repiten en toda función financiera definer

Documentadas en la migración 26 y reafirmadas en la 28/29, aplican sin excepción a cualquier función nueva de este tipo:

1. `security definer set search_path = ''`, todo nombre calificado por esquema (`auth.uid()` incluido, vía `private.is_admin()`).
2. La guarda de rol es la primera sentencia ejecutable, con `42501` al denegar.
3. Filtro de "gestión propia" explícito en toda agregación, incluidos los `count(*)` — un nulo en la fila no protege un conteo.
4. Montos declarados `bigint` y **casteados en el cuerpo**: la suma sobre `bigint` da `numeric`, que `supabase-js` entrega como *string* (para no perder precisión), lo que rompe la aritmética de TypeScript en silencio.
5. Las cifras de un aseo salen del aseo (`c.tarifa_huesped`), nunca del apartamento (`pr.tarifa_huesped`) — si no, el mes pasado se movería solo con editar la tarifa vigente.
6. La pertenencia a un periodo sale siempre de `public.dia_bog(finished_at)`, nunca de una conversión de fecha sin zona horaria.
7. `revoke` + `grant` pegado a cada definición: en PG 17 una función nueva de `public` nace ejecutable por `anon` salvo que se revoque ahí mismo.

**Consecuencia práctica para quien añade una columna de dinero:** hay que sumarla a la lista enumerada del `grant select (...)` correspondiente, o la aplicación no la ve aunque exista en la base (síntoma: `42703`/`42501` en una pantalla que ayer funcionaba, sin que la migración que rompió nada haya tocado ese archivo).

Migraciones clave para leer en orden si se toca este tema: `supabase/migrations/20260913110000_24_frontera_del_aseador.sql`, `20260913130000_26_lecturas_financieras.sql`, `20260913140000_27_pagos_y_mis_pagos.sql`, `20260917100000_28_detalle_de_aseo.sql`, `20260918100000_29_consumo_de_storage.sql`.

## El flujo del Core Value, de punta a punta

```text
1. pg_cron dispara pg_net → una invocación HTTP por feed iCal activo
   `app/api/cron/sync-feed/route.ts` (POST, secreto compartido, sin sesión ni RLS)
        │
        ▼
2. Fetch del .ics de Airbnb/Booking, parseo con node-ical
   `lib/domain/ical.ts`, `ical-normalizar.ts`, `ical-clasificar.ts`, `ical-guardas.ts`
        │
        ▼
3. Diff contra lo ya sincronizado, decide crear/extender/cancelar
   `lib/data/sync.ts` (aplicarSync) + `lib/domain/sync-diff` / `sync-pipeline`
        │
        ▼
4. Se genera el aseo en `public.cleanings` (estado inicial: pendiente de confirmar)
   RPC de sync definida en las migraciones 11-14
        │
        ▼
5. El admin lo ve en `/operacion`, confirma nº de huéspedes + instrucciones
   `app/(admin)/operacion/_actions.ts:confirmarAseo`
        │
        ▼
6. El admin asigna/reasigna a la aseadora fija del apartamento (o suplente)
   `app/(admin)/operacion/_actions.ts:reasignarAseo`
        │
        ▼
7. INSERT en outbox de push (trigger AFTER INSERT, migración 17) →
   `app/api/push/drain/route.ts` (worker, un POST por notificación, secreto compartido)
   drenado también por cron de 1 minuto que repesca pendientes
        │
        ▼
8. Push VAPID llega al dispositivo de la aseadora (Web Push, `lib/push/`)
        │
        ▼
9. La aseadora abre el aseo en la PWA: `app/(cleaner)/aseos/[id]`
   checklist por cuarto (`ChecklistPorCuarto.tsx`) + foto por paso (`PasoDeFoto.tsx`)
   compresión + strip de EXIF en cliente antes de subir: `lib/fotos/comprimir.ts`
        │
        ▼
10. Ejecución cierra el aseo (`iniciado_at` / `finished_at`, migración 18)
        │
        ▼
11. El dinero del aseo terminado alimenta las lecturas financieras del admin
    (`lib/data/finanzas.ts`, `lib/data/finanzas-detalle.ts`)
    y, al cierre de periodo, el snapshot congelado de pagos (migración 25)
```

Los dos únicos puntos del sistema que hablan con el exterior son `app/api/cron/sync-feed/route.ts` (iCal) y `app/api/push/drain/route.ts` (Web Push): ambos son endpoints públicos autenticados por **secreto compartido**, no por sesión de usuario, construyen el cliente administrativo (`lib/supabase/admin.ts`, que salta RLS) y siguen un orden de código obligado — `guard → fábrica administrativa → (nombrar tabla de secretos)` — exigido por `scripts/ci/check-service-role.sh`. Ninguno de los dos exporta `GET`.

## Capas

**`app/(admin)/*/page.tsx` y `app/(cleaner)/*/page.tsx` (Server Components):**
- Propósito: componer la pantalla, leer `searchParams`, llamar a `lib/data/*` para los datos iniciales.
- Depende de: `lib/data/`, `lib/supabase/server.ts`.

**`app/**/_actions.ts` (Server Actions):**
- Propósito: toda mutación del sistema pasa por aquí. Un archivo `_actions.ts` por ruta (`app/(admin)/operacion/_actions.ts`, `app/(admin)/apartamentos/_actions.ts`, `app/(admin)/aseadores/_actions.ts`, `app/_actions/sesion.ts`).
- Depende de: `lib/domain/` para validar con Zod, `lib/supabase/server.ts` para el cliente con sesión.

**`lib/data/` (lecturas tipadas):**
- Propósito: todo `select` con la sesión del usuario vive aquí. Un archivo por dominio: `apartamentos.ts`, `aseadores.ts`, `operacion.ts`, `historial.ts`, `finanzas.ts`, `finanzas-detalle.ts`, `pagos.ts`, `pagos-aseador.ts`, `panel-aseo.ts`, `panel-apartamento.ts`, `panel-aseadora.ts`, `sync.ts`, `push.ts`, `avisos.ts`, `evidencia.ts`, `almacenamiento.ts`, `recibos.ts`.
- Regla: cada función retorna tipos concretos derivados del schema (`Database` generado por el CLI de Supabase), nunca `any`.

**`lib/domain/` (reglas puras, compartidas por las dos superficies):**
- Propósito: parseo iCal, clasificación de eventos, cálculo de money, checklist, validaciones Zod de formularios, fechas en zona Bogotá, reglas de alertas y sync.
- Restricción: sin JSX, sin llamadas a Postgres, sin `server-only` — son funciones testeables con Vitest sobre fixtures reales (`lib/domain/__fixtures__/`).
- Es el único paquete que ambas superficies (`app/(admin)`, `app/(cleaner)`) importan en común.

**`lib/supabase/` (clientes):**
- `server.ts`: cliente SSR con `getUser()` (nunca `getSession()` ni `getClaims()` para autorizar — ver constraints del proyecto).
- `admin.ts`: cliente con `service_role`, solo en los dos workers de `app/api/cron/` y `app/api/push/`, nunca en código que atienda una request de usuario.

**`lib/push/`, `lib/fotos/`, `lib/auth/`:**
- Utilidades de infraestructura específica: payload/colapso/reintentos de Web Push, compresión y nombrado de fotos, helpers de sesión.

**Postgres (`supabase/migrations/`):**
- La capa de autorización real. Ver sección de frontera de seguridad arriba.

## Patrones que se repiten y hay que respetar

**Lecturas por `lib/data/`, mutaciones por Server Action:** ningún componente hace `supabase.from(...)` directo dentro de un Client Component. Los Server Components llaman `lib/data/*`; los formularios y botones llaman una función exportada de un `_actions.ts`.

**El panel en la URL:** el detalle de un aseo, apartamento o aseadora no es un modal con estado de React: es `searchParams` + `router.replace(ruta, { scroll: false })`. Ejemplos: `app/(admin)/apartamentos/_components/PanelCalendario.tsx`, `app/(admin)/finanzas/_components/SheetDesglosePago.tsx`, `app/(admin)/_components/PanelLectura.tsx` (el componente base de "grupo de dato + fila", reusado por todos los paneles laterales del admin vía `GrupoDePanel.tsx` / `FilaDeDato.tsx`). Esto hace el panel enlazable, recargable y compatible con `router.refresh()` tras Realtime.

**Realtime como disparador ciego:** el único consumidor de Realtime sobre `public.cleanings` (`SincronizacionEnVivo.tsx`) no lee el payload del evento; ante cualquier cambio llama `router.refresh()` y deja que el Server Component vuelva a pedir los datos ya filtrados por RLS/grants. Decisión deliberada: evita que un payload de Realtime traiga columnas que el grant por columna le negó al cliente.

**Snapshots financieros congelados vs. lecturas vivas:** conviven dos contratos distintos y ninguno reemplaza al otro. `resumen_financiero` y las demás funciones de la migración 26 calculan al vuelo sobre el rango pedido (día/semana/mes) — es la "foto en vivo". El cierre de periodo (migración 25) congela lo que un aseador ya cobró en un snapshot que nunca se recalcula, ni con un aseo tardío que entre después. El desglose de pago (migración 27) lee **texto copiado del snapshot**, nunca un join contra `cleanings`/`properties` en vivo — un aseo borrado tras la retención de 6 meses sigue mostrando su monto original.

**Cola offline en IndexedDB del aseador:** descrita como constraint del proyecto (offline-first, idempotencia por `client_event_id`, sin Background Sync en iOS) pero **no implementada todavía** en el código actual — solo hay una mención explícita de "sin IndexedDB" en `app/(cleaner)/_components/CodigoDeAcceso.tsx` como decisión negativa puntual para ese componente. Cuando se implemente, debe vivir en un módulo propio bajo `lib/` (candidato natural: `lib/offline/` o similar), separado de `lib/domain/` porque toca IndexedDB del navegador y no es lógica pura.

## Manejo de errores

**Estrategia:** las funciones de `lib/domain/` devuelven uniones cerradas de resultado (tipo `CodigoDeFallo`, `CodigoDePush`) en vez de lanzar excepciones libres; los workers de `app/api/cron/` y `app/api/push/` registran solo códigos de una unión cerrada, nunca el mensaje crudo de un error de red/Postgres ni URLs de feed (pueden contener datos del huésped o ser una credencial en sí mismas).

**Server Actions:** retornan un `ResultadoAccion` tipado (ver `app/(admin)/operacion/_actions.ts`) en vez de lanzar, para que el cliente pinte el error sin `try/catch` disperso.

## Cross-cutting

**Autenticación:** `getUser()` siempre en middleware/layouts/Server Actions — es el único método que valida contra el servidor de Auth y hace visible una desactivación de inmediato. El rol sale de `app_metadata.role`, nunca de `user_metadata` (escribible por el propio usuario).

**Validación:** Zod en la frontera de cada Server Action y en el parseo del VEVENT de iCal (`lib/domain/*.schema.ts`).

**Zona horaria:** UTC-5 fijo, sin DST. `fecha_aseo` es `date`, nunca `timestamptz`. Toda pertenencia a un periodo contable pasa por `public.dia_bog(...)` en Postgres — nunca una conversión de fecha calculada en el cliente.

---

*Análisis de arquitectura: 2026-09-18*
