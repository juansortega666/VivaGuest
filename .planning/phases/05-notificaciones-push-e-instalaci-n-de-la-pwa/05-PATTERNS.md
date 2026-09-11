# Phase 5: Notificaciones push e instalación de la PWA — Pattern Map

**Mapped:** 2026-09-11
**Files analyzed:** 34 (nuevos + modificados)
**Analogs found:** 21 / 34 — 13 sin analog conductual (toda la capa PWA/push del cliente y del envío)

> **Lectura obligada antes de planear:** esta fase se parte limpiamente en dos.
> La mitad de servidor (cron, dispatcher, endpoint con secreto, Server Actions, dashboard admin,
> tests) tiene analogs **exactos** en el repo y debe copiarlos literalmente.
> La mitad de plataforma (service worker, manifest, iconos, `web-push`, suscripción del navegador,
> árbol `(cleaner)` real) **no tiene ningún analog** y no se debe inventar uno.
> Cada sección dice a cuál mitad pertenece.

---

## File Classification

### A. Tienen analog fuerte

| Archivo nuevo/modificado | Rol | Flujo de datos | Analog más cercano | Calidad |
|---|---|---|---|---|
| `supabase/migrations/2026…_16_push_jobs.sql` (drenaje: trigger + cron + función de despacho) | migration / scheduler | event-driven + fan-out | `supabase/migrations/20260902235500_14_sync_jobs.sql` | **exacta** |
| `app/api/push/drain/_guard.ts` (o reuso del existente) | middleware / guard | request-response | `app/api/cron/sync-feed/_guard.ts` | **exacta** |
| `app/api/push/drain/_guard.test.ts` | test unit | — | `app/api/cron/sync-feed/_guard.test.ts` | **exacta** |
| `app/api/push/drain/route.ts` (worker de envío) | route handler | batch + request-response | `app/api/cron/sync-feed/route.ts` | **exacta** |
| `lib/data/push.ts` (leer outbox, marcar enviado/fallido, revocar 410) | data access | CRUD | `lib/data/sync.ts` | rol-match |
| `app/(cleaner)/instalar/_actions.ts` (enviar aviso de prueba, confirmar grado) | server action | request-response | `app/(admin)/operacion/_actions.ts` | **exacta** |
| `app/(cleaner)/aseos/[id]/_actions.ts` (`reveal_access_code`) | server action | request-response | `app/(admin)/operacion/_actions.ts` | **exacta** |
| `lib/domain/avisos.ts` (`estadoDeAvisos`, `estadoDeAvisosDeAseador`) | domain (puro) | transform | `lib/domain/cleanings.ts` (`estadoDeAseo`) | **exacta** |
| `lib/domain/avisos.test.ts` | test unit | — | `lib/domain/cleanings.test.ts` / `alertas.test.ts` | **exacta** |
| `lib/domain/alertas.ts` (**modificar**: `title` de `hora_limite_vencida` con fecha) | domain (puro) | transform | sí mismo, `alertasComputadas()` líneas 458-476 | **exacta** |
| `lib/data/operacion.ts` (**modificar**: ventana hacia atrás, línea 243) | data access | CRUD | sí mismo, `leerOperacion()` | **exacta** |
| `lib/data/aseadores.ts` (**modificar**: traer estado de avisos por aseador) | data access | CRUD | sí mismo | **exacta** |
| `app/(admin)/_components/EstadoAvisosAseador.tsx` | component | render puro | `app/(admin)/operacion/_components/EstadoAseo.tsx` | **exacta** |
| `app/(admin)/operacion/_components/AvisoAseadorSinPush.tsx` | component | render puro | `app/(admin)/apartamentos/_components/BannerMontaje.tsx` | rol-match |
| `app/(admin)/operacion/_components/TiraAvisosAdmin.tsx` | component (client) | event-driven | `app/(admin)/operacion/_components/FranjaCarga.tsx` | rol-match |
| `TablaAseadores.tsx` (**modificar**: columna `AVISOS`) | component | render puro | sí mismo, líneas 110-127 | **exacta** |
| `MenuAseador.tsx` (**modificar**: `Copiar el link de instalación`) | component | event-driven | `MenuAseo.tsx` | **exacta** |
| `FranjaCarga.tsx` · `SheetConfirmar.tsx` · `DialogoReasignar.tsx` · `BloqueDia.tsx` · `TablaDia.tsx` · `FilaAseo.tsx` (**modificar**) | component | render puro | ellos mismos | **exacta** |
| `lib/utils.ts` (**modificar**: `max-w-captura`, `max-w-codigo`) | config | — | sí mismo | **exacta** |
| `supabase/tests/07_push.test.sql` | test pgTAP | — | `supabase/tests/05_sync.test.sql` | **exacta** |
| `lib/domain/push-drenaje.integration.test.ts` | test integración | — | `lib/domain/sync-dispatcher.integration.test.ts` | **exacta** |
| `e2e/push-instalacion.spec.ts` | test e2e | — | `e2e/operacion.spec.ts` + `e2e/fixtures.ts` | **exacta** |
| `app/(admin)/operacion/_actions.test.ts` (**modificar**: SUPERSEDE 2, línea 466) | test unit | — | sí mismo | **exacta** |

### B. NO tienen analog conductual — ver §"No Analog Found"

`public/**` entero · `app/manifest.ts` · `app/sw.ts` (Serwist) · `next.config.ts` (wrapper de Serwist) ·
`lib/push/envio.ts` (`web-push` + Declarative Web Push) · `lib/push/colapso.ts` (hash del `Topic`) ·
`lib/push/plataforma.ts` · `hooks/usarEstadoDeAvisos.ts` · `app/(cleaner)/_components/*` (8 organismos) ·
`app/(cleaner)/instalar/page.tsx` · `app/(cleaner)/aseos/[id]/page.tsx`.

---

## Pattern Assignments

### 1. `supabase/migrations/2026…_16_push_jobs.sql` (migration, event-driven + fan-out)

**Analog:** `supabase/migrations/20260902235500_14_sync_jobs.sql` — **es el template literal de D-04.**
Copiar la estructura entera: función `security definer` con `set search_path = ''`, secretos de Vault,
`for update skip locked`, `net.http_post` con **argumentos nombrados**, `revoke/grant`, `cron.schedule`.

**Secretos de Vault + fallo ruidoso** (líneas 92-110):
```sql
select v.decrypted_secret into v_base
  from vault.decrypted_secrets v where v.name = 'app_base_url';
select v.decrypted_secret into v_secret
  from vault.decrypted_secrets v where v.name = 'cron_shared_secret';

if v_base is null or v_secret is null then
  raise exception
    'faltan secretos de sync en vault: app_base_url / cron_shared_secret';
end if;
```
> El drenaje reusa **los mismos dos secretos**, no crea unos nuevos. Los secretos son paso operativo por
> entorno (`docs/despliegue-sync.md`), **nunca** van en una migración.

**Lease + `skip locked`** (líneas 137-155) — traducir `calendar_feeds.next_sync_at` a
`notifications.next_attempt_at where push_status = 'pendiente'`, que ya tiene el índice
`notifications_outbox_idx`:
```sql
for r in
  select f.id
    from public.calendar_feeds f
   where f.is_active
     and f.next_sync_at <= now()
     and (f.claimed_at is null or f.claimed_at < now() - interval '10 minutes')
   order by f.next_sync_at
   limit 60
   for update skip locked
loop
  update public.calendar_feeds
     set claimed_at      = now(),
         last_attempt_at = now()
   where id = r.id;
```
> **Diferencia medida y anotada en el propio archivo:** el lease NO protege contra ticks solapados
> (`pg_cron` corre en serie); protege contra un worker que sobrevive a su propio intervalo.
> `notifications` no tiene columna de lease; el equivalente es empujar `next_attempt_at` hacia adelante
> **antes** del `http_post`, dentro del mismo `loop`.

**`net.http_post`, argumentos nombrados, fire-and-forget** (líneas 157-178). El comentario explica por qué
posicional es un bug de seguridad (el secreto acabaría en el `body`):
```sql
perform net.http_post(
  url                  := v_base || '/api/cron/sync-feed',
  body                 := jsonb_build_object('feed_id', r.id),
  headers              := jsonb_build_object(
                            'Content-Type',  'application/json',
                            'x-cron-secret', v_secret),
  timeout_milliseconds := 30000
);
```

**Revoke/grant, no decorativo** (líneas 195-197) — `alter default privileges … revoke` NO le quita
`EXECUTE` a `PUBLIC` en PG 17.6. Cada función nueva de esta fase repite el par:
```sql
revoke all     on function public.dispatch_feed_syncs() from public, anon, authenticated;
grant  execute on function public.dispatch_feed_syncs() to postgres;
```

**`cron.schedule` es UPSERT por `jobname`; el intervalo solo acepta SEGUNDOS** (líneas 380-402):
```sql
-- MEDIDO: select cron.schedule('x', '1 minute', 'select 1');
-- ERROR: invalid schedule: 1 minute
-- HINT:  Use cron format (e.g. 5 4 * * *), or interval format '[1-59] seconds'
select cron.schedule(
  'dispatch-feed-syncs',
  '* * * * *',
  $job$select public.dispatch_feed_syncs()$job$);

select cron.schedule(
  'purge-cron-history',
  '17 4 * * *',
  $job$delete from cron.job_run_details where end_time < now() - interval '7 days'$job$);
```
> **Consecuencia directa para D-04:** el cron de red de seguridad es `'* * * * *'` (un minuto) o
> `'60 seconds'`. La poda de `cron.job_run_details` ya existe como job `purge-cron-history` y cubre
> también los jobs nuevos: **no se añade una segunda poda.**

**El trigger `AFTER INSERT` (parte sin analog exacto, pero con precedente):** no hay ningún trigger en el
repo que haga `net.http_post`. El precedente estructural es
`supabase/migrations/20260831215108_05_triggers_y_maquina_de_estados.sql`. La propiedad que D-04 invoca
(`pg_net` despacha después del commit, así que un rollback revierte el disparo) **no está medida en este
repo**: es afirmación de research. El plan debe incluir una aserción pgTAP que la compruebe, no asumirla.

---

### 2. `app/api/push/drain/route.ts` + su guard (route handler + middleware, request-response)

**Analog:** `app/api/cron/sync-feed/route.ts` y `app/api/cron/sync-feed/_guard.ts`.

**El guard ya existe y es reusable tal cual.** Lee `CRON_SHARED_SECRET` vía `readServerSecret`.
D-04 deja a discreción cómo compartirlo; lo más barato es **importarlo desde la ruta nueva**
(`import { exigirSecretoCron } from '@/app/api/cron/sync-feed/_guard'`) o moverlo a `lib/auth/` y dejar un
re-export. No duplicar la lógica.

**La comparación va sobre el hash, y esa es la razón de existir del archivo** (`_guard.ts` líneas 100-125):
```ts
export function exigirSecretoCron(recibido: string | null): void {
  if (recibido === null || recibido === '') {
    throw new SecretoCronInvalido('header_ausente');
  }
  let esperado: string;
  try {
    esperado = readServerSecret(NOMBRE_VARIABLE);
  } catch {
    throw new SecretoCronInvalido('sin_secreto_configurado');
  }
  if (!timingSafeEqual(sha256(recibido), sha256(esperado))) {
    throw new SecretoCronInvalido('secreto_no_coincide');
  }
}
```
> `timingSafeEqual` lanza con buferes de distinta longitud, y esa excepción es **ella misma** un canal
> lateral de longitud. Hashear los dos lados lo cierra.

**Orden obligado dentro del cuerpo de `POST`** (cabecera de `route.ts`, líneas 30-44), exigido por los
guardarrailes 7 y 8 de `scripts/ci/check-service-role.sh`:

```
guard  →  fábrica administrativa  →  nombrar la tabla de secretos
```
- `export async function POST`, **no** `export const POST = …`.
- **Sin `GET`** ni ningún otro método: un endpoint que muta y responde a `GET` es alcanzable por prefetch.

**Configuración de segmento** (`route.ts` líneas 78-100):
```ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
```
> `runtime = 'nodejs'` es **obligatorio** para `web-push` igual que lo era para `node-ical`.
> `export const` no cabe en un archivo `'use server'` (medido, plan 02-14): el drenaje va en `route.ts`.

**Qué no sale de aquí, nunca** (líneas 50-72): el modelo del tipo `LineaDeLog` — "la garantía no es la
disciplina: es el tipo, que no tiene ranura donde poner" el dato prohibido. **Aplicación directa a esta
fase:** el `endpoint` de `push_subscriptions` es una credencial (quien lo tiene puede enviar avisos a ese
teléfono) y el `title`/`body` traen el nombre del apartamento. Ni uno ni otro pueden entrar en
`push_last_error`. Definir un tipo de log cerrado, igual que `lib/data/sync.ts`.

**Manejo de errores del worker:** reusar la forma de `lib/data/sync.ts` (`registrarFalloDeSync`,
`codigoHttp`, `CodigoDeFallo` como unión cerrada). La traducción a esta fase: 410/404 → `revoked_at` +
`revoked_reason` en `push_subscriptions` (ya documentado en la migración 06), 429/5xx → backoff en
`next_attempt_at`, 4xx restante → `push_status = 'descartado'`.

---

### 3. Server Actions nuevas (`/instalar`, `/aseos/[id]`) — server action, request-response

**Analog:** `app/(admin)/operacion/_actions.ts`. **Ojo:** las nuevas son del árbol `(cleaner)`, así que el
guard es `exigirSesion()`, **no** `exigirAdmin()`.

**El orden de las tres primeras operaciones no es estilístico** (cabecera, líneas 62-80):
```
1. exigirAdmin()  — un Server Action es un endpoint HTTP PÚBLICO
2. safeParse()    — lo mínimo, antes de tocar la base
3. ctx.supabase.rpc(...) — SOLO entonces, y con el JWT del usuario
```

**El wrapper de guard** (líneas 265-276) — copiar la forma, cambiando `exigirAdmin` por `exigirSesion`:
```ts
async function guard(): Promise<
  | { ok: true; supabase: Awaited<ReturnType<typeof exigirAdmin>>['supabase']; uid: string }
  | { ok: false; error: string }
> {
  try {
    const { supabase, user } = await exigirAdmin();
    return { ok: true, supabase, uid: user.id };
  } catch (e) {
    if (e instanceof NoAutorizado) return { ok: false, error: e.message };
    throw e;
  }
}
```

**Cuerpo de una action** (líneas 286-315):
```ts
export async function confirmarAseo(
  _prev: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const ctx = await guard();
  if (!ctx.ok) return ctx;

  const parseado = esquemaConfirmar.safeParse(
    campos(formData, ['aseo_id', 'huespedes', 'instrucciones']),
  );
  if (!parseado.success) return { ok: false, error: MENSAJE_DATOS_INVALIDOS };

  const { error } = await ctx.supabase.rpc('confirm_cleaning', { ... });
  if (error) return fallo(error);

  return { ok: true, mensaje: 'Aseo confirmado.' };
}
```

**Imports de un `_actions.ts`** (líneas 1-11):
```ts
'use server';

import 'server-only';

import { z } from 'zod';

import { NoAutorizado, exigirAdmin } from '@/lib/auth/guards';
import type { ResultadoAccion } from '@/lib/domain/acciones';
import { formatFechaBog, hoyBog } from '@/lib/domain/dates';
import { campoDeConstraint, mapDbError, type DbErrorLike } from '@/lib/domain/errors';
```

**Prohibido `revalidatePath` en cualquier action de `(admin)` (bug medido, cuelga el navegador).** La
sustitución es `router.refresh()` en el cliente. Ver el bloque de 50 líneas al tope del archivo. Para el
árbol `(cleaner)`, que es nuevo y mucho más liviano, **el bug no está medido**: no asumir ninguna de las
dos cosas, y preferir `router.refresh()` por consistencia.

**Ninguna action construye la fábrica administrativa.** `scripts/ci/check-service-role.sh` rompe el build
si `lib/supabase/admin.ts` aparece ahí, y hace grep del nombre literal de la variable de la clave de
servicio — ese nombre no se escribe **ni en un comentario**.

---

### 4. `lib/domain/avisos.ts` (domain puro, transform)

**Analog:** `lib/domain/cleanings.ts` → `estadoDeAseo()` (líneas 119-155). Es el patrón exacto de
discriminante tipado que pide UI-SPEC §17.4.

```ts
export function estadoDeAseo(c: EntradaEstadoAseo): EstadoAseo {
  const clave = derivarClave(c);
  return { clave, ...PRESENTACION[clave] };
}

function derivarClave(c: EntradaEstadoAseo): ClaveEstadoAseo {
  if (!c.is_managed) return 'externa';
  // Sin rama por defecto A PROPOSITO. El switch es exhaustivo sobre el enum, y el
  // dia que la migracion anada un sexto valor, `tsc` rompe aqui con TS2366.
  switch (c.state) {
    case 'pendiente':
      return c.confirmado_at == null ? 'sin_confirmar' : 'pendiente';
    case 'en_curso':
      return 'en_curso';
    ...
  }
}
```

Reglas heredadas, y las dos aplican a `avisos.ts`:
1. **Switch exhaustivo sin `default`.** Los 6 estados de UI-SPEC §5.1 y los 3 de §5.2 son uniones cerradas.
2. **Lanza en vez de inventar una clave** cuando el estado es inalcanzable — "un badge que miente sobre un
   aseo es peor que una pantalla que se cae".

**Y la regla de pureza** (cabecera de `lib/domain/alertas.ts` líneas 6-11):
> *Este módulo es puro: no importa React, ni `lucide-react`, ni nada de `app/`. Devuelve NOMBRES de icono
> y etiquetas; quién los pinta es el componente.*

`lib/push/plataforma.ts` **rompe** esa regla por necesidad (toca `window`, `navigator`). Por eso va en
`lib/push/` y no en `lib/domain/`, y por eso `hooks/usarEstadoDeAvisos.ts` es quien junta lo impuro con lo
puro. El planner debe mantener la separación: `avisos.ts` recibe el estado del navegador **como
parámetro**, nunca lo lee.

---

### 5. D-08: `lib/data/operacion.ts` y `lib/domain/alertas.ts`

**El filtro exacto que D-08 cambia** (`leerOperacion()`, líneas 233-249):
```ts
const hoy = hoyBog();
const horizonte = sumarDias(hoy, HORIZONTE_DIAS);

const { data, error } = await supabase
  .from('cleanings')
  .select(SELECT_OPERACION)
  .gte('scheduled_date', hoy)          // ← D-08: pasa a sumarDias(hoy, -N)
  .lte('scheduled_date', horizonte)
  .order('scheduled_date', { ascending: true })
  .order('hora_limite', { ascending: true });
```

**Hay un segundo filtro, redundante, aguas abajo, y también hay que tocarlo.** El comentario de las
proyecciones (líneas 270-275) dice literal: *"Un aseo con fecha ANTERIOR a `hoy` no entra en ningún bloque
ni en el conteo del horizonte. La consulta ya no los trae; el filtro está aquí igualmente porque esta
función también la llaman los tests con filas armadas a mano."* Ampliar solo la consulta deja el bloque
`Atrasados` vacío y el defecto intacto.

**Regla de fechas, heredada y no negociable:** toda comparación se hace sobre cadenas `'YYYY-MM-DD'` y
nunca construyendo un `Date`. `new Date('2026-09-10')` es medianoche UTC y en Bogotá renderiza el día
anterior. Usar `hoyBog()`, `sumarDias()`, `formatFechaBog()` de `lib/domain/dates.ts`.

**`alertasComputadas()` ya está bien y NO se acota por fecha** (líneas 458-476) — confirma lo que dice
D-08. Lo único que cambia es interpolar la fecha en el `titulo`:
```ts
// 2. HORA LÍMITE VENCIDA. Aquí NO se acota por fecha: un aseo de anteayer
//    sin terminar es justo el que no se puede perder.
const vence = venceEnMs(a.scheduled_date, a.hora_limite);
if (vence < ahoraMs) {
  const hhmm = a.hora_limite.slice(0, 5);
  alertas.push({
    id: `hora_limite_vencida:${a.id}`,
    clave: 'hora_limite_vencida',
    ocurrioEnMs: vence,
    titulo: `La hora límite de las ${hhmm} pasó y el aseo no ha terminado.`,
    cuerpo: `La hora límite de las ${hhmm} pasó y el aseo no ha terminado.`,
    apartamento: a.apartamento,
    cleaningId: a.id,
    propertyId: a.property_id,
    url: `/operacion#aseo-${a.id}`,
    atendible: false,
  });
}
```
> `url: '/operacion#aseo-${a.id}'` es exactamente la razón por la que UI-SPEC §12 dice que el bloque
> `Atrasados` no es opcional: sin él, el ancla de esas alertas no tiene dónde aterrizar.

**Y la regla dura del panel** (cabecera de `alertas.ts`): el color NO codifica el tipo de alerta. No añadir
octavo tipo, no destacar `hora_limite_vencida` de días anteriores. `alertas.test.ts` recorre el mapa entero
afirmando homogeneidad.

---

### 6. Componentes del admin — columna `AVISOS`, chip, advertencia

**Analog para la columna:** `TablaAseadores.tsx` líneas 110-127. Cada `TableHead` lleva su token de ancho
propio (`w-col-*`, del namespace `--spacing-*`, no `--container-*`):
```tsx
<TableHead className="w-col-telefono px-md text-micro font-semibold tracking-columna text-muted-foreground uppercase">
  Teléfono
</TableHead>
<TableHead className="w-col-responsable px-md text-micro font-semibold tracking-columna text-muted-foreground uppercase">
  Responsable de
</TableHead>
```
La columna nueva se intercala entre esas dos con `w-col-avisos` (`--spacing-col-avisos: 128px`, UI-SPEC
§2.1). **`w-*` sale de `--spacing-*`: por eso el token nuevo va como `--spacing-col-avisos` y no da
problema.** El problema de la talla solo afecta a `max-w-*`.

**Analog para el badge de estado:** `app/(admin)/operacion/_components/EstadoAseo.tsx` — consume el
discriminante de `lib/domain/` y solo pinta. `EstadoAvisosAseador` copia esa forma sobre
`estadoDeAvisosDeAseador()`.

---

### 7. `lib/utils.ts` — el landmine, y su registro exacto

**Este bloque no es opcional y es el defecto que costó dos quicks (`260907-703`, `260908-7w0`).**

Tailwind v4.3 resuelve `max-w-<nombre>` contra `--spacing-*` **antes** que contra `--container-*`, y la
escala de espaciado de este proyecto usa nombres de talla. Medido en el CSS del build de producción:
```
max-w-sm{max-width:var(--spacing-sm)}      ->  8px, no 384px
```
Declarar `--container-sm` a mano **no** lo corrige (probado). La mitad que sí se cierra es registrar cada
ancho con nombre propio en el grupo `max-w` de `extendTailwindMerge`, o el override en el sitio de uso no
desplaza al de la primitiva y el ancho depende del orden del CSS:

```ts
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      // Los anchos con nombre de `app/globals.css`. Cuando aparezca uno nuevo
      // hay que añadirlo AQUÍ TAMBIÉN, o volverá el fallo silencioso.
      "max-w": [
        "max-w-admin",
        "max-w-alerta",
        "max-w-alerta-ancha",
        "max-w-aseador",
        "max-w-col-acargo",
        "max-w-col-responsable-apto",
        "max-w-dialogo",
        "max-w-dialogo-base",
        "max-w-formulario",
        "max-w-login",
        "max-w-sheet",
        "max-w-sheet-base",
        "max-w-tooltip",
        "max-w-vacio",
      ],
    },
  },
})
```

**Acción concreta de esta fase:** añadir `"max-w-captura"` y `"max-w-codigo"` a ese array (orden
alfabético: `captura` después de `aseador`, `codigo` después de `captura`), **y** declarar
`--container-captura: 280px` / `--container-codigo: 240px` en el `@theme` de `app/globals.css`.
`npm run ci:arch` (→ `scripts/ci/check-max-w-tallas.sh`) falla nombrando archivo y línea si aparece una
clase de ancho con nombre de talla en `app/`, `components/` o `lib/`.

---

### 8. Capas de test — dónde va cada test nuevo

| Capa | Config / comando | Include | Analog a copiar | Qué de esta fase va aquí |
|---|---|---|---|---|
| **unit** | `vitest.config.ts` · `npm run test:unit` | `lib/**/*.test.ts`, `app/**/*.test.ts` (excluye `*.integration.test.ts`) | `app/api/cron/sync-feed/_guard.test.ts`, `lib/domain/alertas.test.ts` | `avisos.ts`, `colapso.ts` (hash del `Topic`), el guard del drenaje, `plataforma.ts`, `alertas.ts` modificado, `operacion.ts` proyecciones |
| **integración** | `vitest.integration.config.ts` · `npm run test:integration` | `lib/**/*.integration.test.ts` | `lib/domain/sync-dispatcher.integration.test.ts` | el drenaje de punta a punta contra el stack local con JWT reales, `reveal_access_code` desde el aseador |
| **pgTAP** | `npm run db:test` | `supabase/tests/*.test.sql` | `supabase/tests/05_sync.test.sql` | el trigger `AFTER INSERT`, los jobs de `cron.job`, los `revoke/grant`, el índice del outbox |
| **e2e** | `playwright.config.ts` · `npm run test:e2e` | `e2e/*.spec.ts` | `e2e/operacion.spec.ts` + `e2e/fixtures.ts` | el asistente `/instalar`, el banner, `/aseos/[id]`, service worker + permisos + offline |

**Reglas de capa, medidas:**
- `vitest.config.ts` incluye `app/**/*.test.ts` **a propósito**, precisamente por `_guard.ts`. Un test de
  ruta nueva bajo `app/api/push/` ya está cubierto por el `include`.
- Los de integración **no** pueden ir en `test:unit`: el job `arquitectura` de `ci/db.yml` corre sin Docker.
- `fileParallelism: false` en integración: el stack local es uno solo y compartido.
- `env: { TZ: 'UTC' }` en las dos configs, a propósito: *"si algún cálculo de fecha depende de la zona
  local, tiene que romperse aquí y no en producción a las 19:00 de Bogotá."*
- **Regla del instrumento** (comentario de `vitest.config.ts`): comprobar siempre **cuántos tests
  corrieron**, no solo el código de salida. `No test files found` es un rojo sin una sola aserción.
- Fixtures E2E: *"el único test que hace login por UI es el test de login"*. `e2e/fixtures.ts` da la sesión
  ya puesta; los specs nuevos del aseador usan el fixture del rol `aseador`.

**El test que se invierte (SUPERSEDE 2 de UI-SPEC §11.4):**
`app/(admin)/operacion/_actions.test.ts:466`
```ts
expect(m.toLowerCase()).not.toMatch(/notific|avis|le lleg|push|se le mand/);
```
Recorre los nueve mensajes de éxito. Cuando el drenaje exista, esa aserción pasa a estar al revés. Está
anclada a la prohibición escrita en la cabecera del propio `_actions.ts` (líneas 104-112), que también hay
que reescribir: si se cambia el test sin cambiar el comentario, queda un comentario que miente.

---

## Shared Patterns

### Autorización — `lib/auth/guards.ts`
**Aplica a:** todas las Server Actions nuevas, `app/(cleaner)/instalar/page.tsx`, `app/(cleaner)/aseos/[id]/page.tsx`.

Exports: `NoAutorizado` (clase), `exigirSesion()`, `exigirAdmin()` → ambos devuelven `Contexto { supabase, user }`.

```tsx
// app/(cleaner)/layout.tsx — el precedente del árbol del aseador
export default async function CleanerLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await exigirSesion();
  return (
    <div className="min-h-svh bg-canvas">
      <main className="mx-auto flex w-full max-w-aseador flex-col gap-lg p-lg">
        {children}
      </main>
    </div>
  );
}
```
> Del propio comentario: *"El guard de sesión NO autoriza nada: la frontera es la RLS."* El route group no
> autoriza. Segunda capa por si el middleware se salta (CVE-2025-29927).
> El banner de UI-SPEC §7 entra **aquí**, como primer hijo de `<main>`, encima del `<h1>` de cada página.

### Manejo de errores — `lib/domain/errors.ts`
**Aplica a:** toda Server Action y todo componente que muestre error de RPC.
`mapDbError()` lee el **`hint`** de Postgres en `P0001`, no el `message`. `campoDeConstraint()` para
violaciones de índice. La forma de retorno es `ResultadoAccion` de `lib/domain/acciones.ts`
(`{ ok: true, mensaje } | { ok: false, error }`).

### `dedupe_key` — el formato real del que se deriva la clave de colapso de D-05
**Fuente:** `supabase/migrations/20260831223038_09_rpc.sql` líneas 283-299 (`confirm_cleaning`),
415-430 (`finish_cleaning`), 493-512 (`decline_cleaning`); `20260903120000_15_rpc_admin_y_realtime.sql`
líneas 192-207 (`reassign_cleaning`); `20260902235500_14_sync_jobs.sql` (watchdog).

```sql
insert into public.notifications
  (recipient_id, type, title, body, url, cleaning_id, property_id, dedupe_key, payload)
select v_responsable,
       'asignacion'::public.notification_type,
       'Nuevo aseo asignado',
       'Tienes un aseo asignado en ' || p.nombre || ' para el ' ||
         to_char(c.scheduled_date, 'DD/MM') || ' antes de las ' ||
         to_char(c.hora_limite, 'HH24:MI') || '.',
       '/aseos/' || p_cleaning::text,
       p_cleaning,
       v_property,
       'assign:' || p_cleaning::text || ':' || v_responsable::text,
       jsonb_build_object('num_huespedes', p_num_huespedes)
  from public.cleanings  c
  join public.properties p on p.id = c.property_id
 where c.id = p_cleaning
on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing;
```

**Formatos reales, inventariados (todos > 32 caracteres salvo los de cubo):**

| Emisor | `dedupe_key` | Largo aprox. |
|---|---|---|
| `confirm_cleaning` | `assign:<uuid-aseo>:<uuid-aseador>` | 80 |
| `finish_cleaning` | mismo esquema `<verbo>:<uuid>:<uuid>` | ~80 |
| `decline_cleaning` | mismo esquema | ~80 |
| `reassign_cleaning` | *"el mismo formato"*, lleva el aseador | ~80 |
| watchdog, job muerto | `job_dead:<YYYYMMDDHH>` | 19 |
| watchdog, feed muerto | `feed_dead:<uuid>:<YYYYMMDDHH>` | 57 |
| watchdog/RPC, formato | `fmt:<uuid>:<YYYYMMDD>` | 49 |
| watchdog, job formato | `job_fmt:<YYYYMMDD>` | 16 |

**Consecuencia para D-05:** la clave de colapso debe derivarse por hash corto, base64url, ≤ 32 caracteres, y
por **destinatario + aseo + clase de evento** — que es exactamente la forma `<verbo>:<cleaning>:<recipient>`
que ya traen los cuatro primeros. `type` (la clase de evento) NO está en el `dedupe_key`: `assign:` y
`reassign:` son verbos distintos, pero hay que verificar uno por uno que ningún par de clases comparta
prefijo, o el colapso borraría el aviso equivocado. Ese es justo el fallo que D-05 existe para evitar
("un daño reportado borra un 'no puedo' del mismo aseo").

**Y el detalle que no es opcional:** `on conflict (recipient_id, dedupe_key) where dedupe_key is not null`.
Sin el predicado, Postgres no reconoce el árbitro y falla con `42P10`. Lo repiten los cinco emisores.

**El cubo de tiempo produce repetición, no la evita** (comentario largo en `14_sync_jobs.sql`). Es
contraintuitivo y aplica si el drenaje emite avisos propios: sin cubo, el índice único mata la segunda
para siempre.

### Schema que esta fase consume y NO modifica
`supabase/migrations/20260831215109_06_retencion_y_notificaciones.sql`:
- `notifications` es bandeja **y** outbox en la misma tabla: `push_status` (enum
  `'pendiente' | 'enviado' | 'fallido' | 'descartado'`), `push_attempts int`, `push_last_error text`,
  `next_attempt_at timestamptz not null default now()`, `dedupe_key text`, `url text`, `payload jsonb`.
- `push_subscriptions`: `endpoint text not null **unique** (global, no compuesto)`, `p256dh`, `auth`,
  `user_agent`, `last_success_at`, `last_failure_at`, `failure_count int`, `revoked_at`, `revoked_reason`.
  El comentario de la columna fija el invariante: el endpoint identifica al **navegador**, no a la persona;
  el upsert va `on conflict (endpoint)` y **reasigna `user_id`**. Con `unique (user_id, endpoint)`
  convivirían dos y el aseo de una le llegaría al teléfono de la otra.
- El comentario del bloque outbox declara por qué existen esas cuatro columnas: *"Se escribe la intención y
  el worker de la Fase 5 la drena con reintentos."*

**NO HAY QUE CREAR NINGUNA TABLA.** El `05-RESEARCH.md` recomienda una tabla propia de entregas: es falso,
se escribió sin acceso al repo.

**Lo único que sí falta en el schema y hay que resolver:** UI-SPEC §5.2 y §8.6 exigen distinguir
*confirmado por toque* de *confirmado a mano*, y D-07 exige saber si el destino soporta formato
declarativo. Ninguno de los dos datos tiene columna hoy. Es la única extensión de schema legítima de la
fase, y el sitio natural es `push_subscriptions` (es propiedad del dispositivo, no de la persona).

---

## No Analog Found

Sin match conductual en el repo. El planner debe usar `05-RESEARCH.md` (que es fiable **solo** en lo de
iOS/Safari/APNs/VAPID/Serwist) y el stack fijado en `CLAUDE.md`. Para cada uno se indica el precedente
**estructural** más cercano, que no es lo mismo que un analog.

| Archivo | Rol | Flujo | Por qué no hay analog | Precedente estructural |
|---|---|---|---|---|
| `public/**` (manifest assets, 5 iconos, 5 capturas de `public/instalar/`) | asset | — | **No existe `public/` en el repo.** Cero `.svg`, cero `.png`. Verificado. Los logos de marca de `02-UI-SPEC` §4 tampoco están versionados | ninguno. UI-SPEC §14.2 define un fallback para no bloquear la fase |
| `app/manifest.ts` | config | — | No hay manifest ni nada que use `MetadataRoute` | `app/layout.tsx` para la forma de `Metadata` |
| `app/sw.ts` + `next.config.ts` (wrapper Serwist) | config / service worker | event-driven | `@serwist/next` **no está instalado** (verificado en `package.json`). `next.config.ts` hoy no envuelve nada | ninguno. Regla del stack: build **webpack**, no Turbopack (bug abierto serwist#360) |
| `lib/push/envio.ts` (`web-push` + VAPID + Declarative Web Push de D-07) | service | request-response | `web-push` **no está instalado**. Nada en el repo habla HTTP saliente autenticado con claves asimétricas | `app/api/cron/sync-feed/route.ts` para la disciplina de logging y de errores cerrados, **no** para el protocolo |
| `lib/push/colapso.ts` (hash corto del `Topic`, 32 chars base64url) | utility | transform | Nada en el repo hashea para derivar claves. Lo más cercano es `sha256` en `_guard.ts`, pero ahí es comparación de secretos, no derivación | `_guard.ts` para `createHash('sha256')` de `node:crypto`; el algoritmo lo elige el plan (D-04, discreción) |
| `lib/push/plataforma.ts` | utility (cliente) | transform | No hay ni un módulo en `lib/` que toque `window` o `navigator`. Todo `lib/domain/` es puro por regla escrita | la **regla** de pureza de `lib/domain/alertas.ts`, que este módulo rompe a propósito y por eso vive en `lib/push/` |
| `hooks/usarEstadoDeAvisos.ts` | hook | event-driven | **No existe el directorio `hooks/`.** No hay un solo custom hook en el repo | los client components de `(admin)/operacion/_components/` (`SincronizacionEnVivo.tsx` es el que más se acerca: suscripción + limpieza) |
| `app/(cleaner)/_components/*` (`BannerAvisos`, `BotonActivarAvisos`, `AsistenteInstalacion`, `PasoInstalacion`, `PruebaDeAviso`, `InstruccionesPorPlataforma`, `TarjetaAseo`, `CodigoDeAcceso`) | component | mixto | **`app/(cleaner)/_components/` no existe.** Todo el UI del repo es `(admin)`: escritorio, densidad de mouse, escala tipográfica de 14px. UI-SPEC §3.1 SUPERSEDE la escala entera para este árbol | `app/(admin)/apartamentos/_components/` para el **layout** del directorio y la convención `_components/`. Nada de su contenido se reusa tal cual |
| `app/(cleaner)/instalar/page.tsx` | page | — | Ruta nueva, sin precedente de asistente multipaso | `app/(admin)/apartamentos/nuevo/page.tsx` para la forma de una page de árbol anidado |
| `app/(cleaner)/aseos/[id]/page.tsx` | page | request-response | Ruta nueva. **`notifications.url` ya apunta aquí desde la migración 09** (`'/aseos/' || cleaning_id`) y hoy toda push del aseador caería en un 404 | `app/(admin)/apartamentos/[id]/page.tsx` para el patrón de segmento dinámico |
| el drenaje mismo | — | — | **Nadie drena `notifications` hoy.** Las cuatro columnas de outbox llevan escritas desde la migración 06 esperando a esta fase | el dispatcher de `14_sync_jobs.sql` es el analog del *transporte*, no del *envío* |

---

## Metadata

**Analog search scope:** `app/`, `lib/`, `components/`, `supabase/migrations/`, `supabase/tests/`, `e2e/`,
`scripts/ci/`, `package.json`, configs de vitest y playwright.
**Files scanned:** 218 (inventario completo del árbol versionado, sin `node_modules`).
**Analogs leídos en profundidad:** 12.
**Pattern extraction date:** 2026-09-11.

**Verificaciones de ausencia hechas por comando, no por suposición:**
- `find` sobre el repo: no existe `public/`, no existe `hooks/`, `app/(cleaner)/` tiene exactamente dos
  archivos (`layout.tsx` y `mis-aseos/page.tsx`, los dos declarados stub en su propio comentario).
- `package.json`: no aparecen `@serwist/next`, `serwist`, `web-push`, `idb`, `browser-image-compression`,
  `node-ical` ni `date-fns`. `@playwright/test@1.62.1` y `vitest@4.1.11` **sí** están.
