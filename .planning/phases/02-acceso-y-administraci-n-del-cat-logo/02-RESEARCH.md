# Fase 2: Acceso y administración del catálogo — Research

**Investigado:** 2026-09-01
**Dominio:** Next.js 15.5 App Router + `@supabase/ssr` 0.12.5 + shadcn 4.19.1/Base UI sobre el schema ya entregado en la Fase 1
**Confianza global:** ALTA — la mayoría de las afirmaciones críticas están **medidas** contra el stack local levantado en esta sesión (`supabase start`, migraciones + seeds aplicados) y contra los `.d.ts` y el JS compilado de los paquetes instalados, no contra memoria de entrenamiento.

---

<user_constraints>
## User Constraints (de 02-CONTEXT.md)

### Decisiones bloqueadas

**Convenciones de UI, ya acordadas**
- **shadcn, con atomic design parcial.** `components/ui/` es shadcn **sin envolver**. Prohibido crear `components/atoms/Button.tsx` que solo re-exporte el `Button` de shadcn: es puro impuesto sin retorno.
- **Los organismos viven por superficie**, no en un directorio compartido: `app/(admin)/_components/` y `app/(cleaner)/_components/`. Lo compartido entre superficies son los tokens (color, espaciado, tipografía) y los átomos base, no los organismos.
- **Las dos superficies casi no comparten nada.** El admin es escritorio con tablas densas; el aseador es una columna, móvil, con objetivos de toque grandes. Forzar reuso de organismos entre ambas produce componentes llenos de condicionales, que es peor que duplicar.
- **shadcn todavía no está instalado.** La Fase 1 lo difirió a propósito: `shadcn@4.19.1` cambió de API (`--base-color` ya no existe), instala `@base-ui/react` en vez de `radix-ui`, y reescribe ~144 líneas de `globals.css`. Instalarlo es trabajo de esta fase, con esa advertencia medida en mano.

**Stack de esta fase, heredado y ya verificado**
- Next.js 15.5.24 pineado, build webpack, **sin Turbopack**.
- Tailwind CSS v4: configuración en CSS con `@theme`, sin `tailwind.config.js`. No mezclar tutoriales de v3.
- `@supabase/ssr` 0.12.5. **Trampa crítica:** el callback `setAll` recibe DOS argumentos, el segundo son headers (`Cache-Control: private, no-store`). Ignorarlos deja que el CDN de Vercel cachee una respuesta con cookie de sesión y se la sirva a otro usuario.
- `getUser()` en servidor, **nunca `getSession()`**: solo el primero valida contra el servidor de Auth, que es lo que hace que la desactivación de un aseador se note.
- Server Actions + Zod para mutaciones. `react-hook-form` solo en el formulario largo de apartamento (~12 campos).
- Idioma de la interfaz: **español**.

**Seguridad, heredada de la Fase 1 y no negociable**
- **La RLS es la única autorización real.** El middleware y el route group no autorizan nada. Un Server Action es un endpoint HTTP público: que el botón solo se renderice en `(admin)` no autoriza nada. Cada action arranca con `getUser()` más verificación de rol, y usa el cliente con JWT de usuario.
- **El claim de rol del JWT solo sirve para ruteo**, que es UX. La autorización lee `profiles.is_active` vía función `SECURITY DEFINER`.
- **`service_role` solo en `lib/supabase/admin.ts`** con `import 'server-only'`. Hay un test de arquitectura en CI que rompe el build si alguien la importa desde una página o un Server Action. Se usa para el alta de aseadores (`auth.admin.createUser`) y la baja (`auth.admin.signOut` + ban).
- **El código de acceso y la URL iCal viven en `property_secrets`** y se escriben con `service_role`. Nunca se exponen en una respuesta que pueda alcanzar al aseador.
- Toda mutación de `cleanings` pasa por RPC. Esta fase no muta aseos, pero la regla aplica cuando toque.

**Datos que ya existen**
- 39 apartamentos sembrados en 8 clusters, **con placeholders inconfundibles**. Reemplazarlos con datos reales es el trabajo del admin en esta fase, no una migración.
- Catálogo provisional de tipos de cuarto con máximo 3 tareas por tipo, editable en base de datos sin migración.
- `lib/database.types.ts` generado y con check de drift en CI.

**APTO-12, el requisito no obvio**
Al conectar el calendario, el admin ve una guía visual de dónde sacar el link de exportación en Airbnb, y **al pegarlo el sistema valida el feed en vivo**: le dice si sirve, cuántas reservas trajo y cuál es el próximo checkout detectado, sin esperar la siguiente corrida del sync. Lo importante es la validación en vivo, no la guía.

### Claude's Discretion
- Estructura de rutas dentro de `(admin)`, nombres de archivos y organización de componentes.
- Cómo se parte el formulario de apartamento (~12 campos) en secciones o pasos.
- Estrategia de estados de carga, vacío y error.

> Nota: `02-UI-SPEC.md` ya consumió esa discreción y la fijó (página única de 5 secciones, `loading.tsx` con skeleton geométrico, 7 estados de APTO-12). El contrato de UI está **bloqueado y verificado**. Lo que sigue abierto es la capa de implementación por debajo.

### Deferred Ideas (FUERA DE ALCANCE)
- PWA del aseador con checklist y evidencia → Fase 6
- Bandeja "Sin confirmar", panel de alertas y vista por día → Fase 4
- Motor de sincronización iCal y sus crons → Fase 3
- Pantallas financieras y cierre mensual → Fase 7
- Reactivar el CI moviendo `ci/db.yml` a `.github/workflows/` → requiere token con scope `workflow`
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Descripción | Qué de este research lo habilita |
|----|-------------|----------------------------------|
| PLAT-01 | Admin inicia sesión con email y contraseña, sesión persiste entre recargas | §1 (los 4 clientes + middleware). **Bloqueante medido: §8.1 — hoy el login por email está apagado en `config.toml`** |
| PLAT-02 | Aseador inicia sesión con email y contraseña desde la PWA | Igual que PLAT-01 |
| PLAT-04 | Al desactivar un aseador, su acceso queda invalidado de inmediato aunque tenga sesión abierta | §6.2 — cadena medida `profiles.is_active=false` + `ban_duration` |
| PLAT-07 | Un usuario autenticado es enrutado a su superficie según su rol | §2 — `app_metadata.role` viaja en el JWT y lo devuelve `getUser()` sin round-trip extra |
| APTO-01 | Crea, edita, activa y desactiva apartamentos | §5 (Zod borrador/activar), §9 (`properties` escribible por admin con JWT de usuario) |
| APTO-02 | Tarifas y bloqueo de activación sin ambas | §5.2 + §5.4 (nombres de CHECK para `mapDbError`) |
| APTO-03 | Registra link iCal y el sistema valida que responda al guardar | §4 completo |
| APTO-04 | Ubicación de Google Maps y código de acceso | §9.2 — `codigo_acceso` vive en `property_secrets`, **inalcanzable con JWT de usuario incluso siendo admin** |
| APTO-05 | Hora límite con default 11:30 | `properties.hora_limite time not null default '11:30'`, ya en schema |
| APTO-06 | Lista de cuartos | `property_rooms` con grant + policy admin; `property_rooms_etiqueta_uniq` por apartamento |
| APTO-07 | Lista base de faltantes | `missing_item_catalog` con dos índices parciales (`mic_global_uniq`, `mic_prop_uniq`) |
| APTO-08 | `gestion_vivaguest` + responsable/suplente | §5.3 — `props_assignees_only_when_managed`, `props_suplente_distinct` |
| APTO-09 | Contacto externo cuando `gestion_vivaguest` es false | §5.3 — puerta de UI **sin respaldo en base**, documentada en UI-SPEC §8.2 |
| APTO-10 | `fee_discriminado` informativo | Columna ya existe, sin lógica asociada |
| APTO-11 | Buscador | Filtrado en cliente sobre 39 filas ya cargadas, normalización NFD |
| APTO-12 | Validación en vivo del feed | §4 completo, con prototipo medido |
| ASEADOR-01 | Crea cuentas de aseador, sin auto-registro | §6.1 — `createUser` medido, incluido que **no valida la longitud mínima de contraseña** |
| ASEADOR-02 | Desactiva un aseador | §6.2 |
| ASEADOR-03 | Lista de aseadores con estado y apartamentos donde es responsable/suplente | §9 — `profiles` y `properties` legibles por admin |
</phase_requirements>

---

## Summary

Esta fase no tiene incógnitas de diseño: `02-UI-SPEC.md` está bloqueado y verificado. Toda la incertidumbre está en la capa de implementación, y **la mayor parte se resolvió midiendo, no leyendo**. Los hallazgos que cambian el plan son cinco:

1. **El login por email está apagado hoy.** `supabase/config.toml` tiene `[auth.email] enable_signup = false`, y la CLI mapea esa clave a `GOTRUE_EXTERNAL_EMAIL_ENABLED=false`, que apaga el **proveedor** entero, no el auto-registro. Medido: `signInWithPassword` devuelve `Email logins are disabled`. La Fase 2 **no puede cumplir PLAT-01 ni PLAT-02** hasta arreglarlo. El auto-registro lo bloquea la clave *global* `[auth] enable_signup = false` → `GOTRUE_DISABLE_SIGNUP=true`, que se queda como está.

2. **No hace falta un Custom Access Token Hook para el ruteo por rol.** `app_metadata.role`, escrito en `auth.admin.createUser`, viaja en el JWT y lo devuelve `getUser()` — el mismo `getUser()` que el middleware ya hace. Coste incremental: cero. Y es la única fuente segura: se midió que un aseador **sí puede** cambiar su propio `user_metadata.role` a `'admin'` y verlo en un JWT recién refrescado, mientras `app_metadata.role` y `profiles.role` quedan intactos.

3. **`auth.admin.signOut(id, 'global')` no existe con esa firma.** La firma real es `signOut(jwt, scope)` y exige el JWT del usuario, que el admin no tiene. Lo que sí revoca, medido, es `updateUserById(uid, { ban_duration })`: con el mismo access token sin expirar, `getUser()` pasa a `403 user_banned`. Corolario que se olvida: reactivar exige **dos** operaciones (`is_active = true` **y** `ban_duration: 'none'`); solo la primera deja al aseador sin poder entrar.

4. **`property_secrets` es inalcanzable con JWT de usuario incluso siendo admin.** Medido: `42501 permission denied for table property_secrets` en SELECT y en UPSERT. La policy `secrets_admin_all` existe pero no hay grant. Todo lo de `codigo_acceso`, `tipo_cerradura`, `notas_acceso` e `ical_url` va obligatoriamente por `createAdminClient()`. `calendar_feeds`, en cambio, **sí** es escribible por el admin con su propio JWT (medido).

5. **`shadcn init` 4.19.1 se comporta distinto a lo documentado en el UI-SPEC.** Medido en un sandbox que replica el repo: exige elegir un preset (no existe "ninguno"; los válidos son `nova, vega, maia, lyra, mira, luma, sera, rhea`), reescribe `globals.css` de 26 a **132** líneas, **no toca `app/layout.tsx`** (los dos bugs heredados sobreviven), añade `shadcn` a `dependencies` **y tiene que quedarse ahí** porque el CSS hace `@import "shadcn/tailwind.css"`, deja `--font-sans: var(--font-sans)` circular (rompe Geist Sans), y **`form` no existe en Base UI**: el bloque devuelve un registry item vacío. El sustituto es `field`.

**Recomendación primaria:** partir la fase en una wave 0 de desbloqueo (config de auth, shadcn + capa de tokens, `.env`, `mapAuthError`/`mapDbError` ampliados, env de build en CI) antes de escribir una sola pantalla. Cuatro de los cinco hallazgos de arriba rompen el trabajo posterior si se descubren a mitad de camino.

---

## Architectural Responsibility Map

| Capacidad | Tier primario | Tier secundario | Razón |
|---|---|---|---|
| Autenticación (login/logout) | Frontend Server (Server Action) | Supabase Auth (GoTrue) | La cookie de sesión la escribe el servidor de Next; GoTrue emite y valida el token |
| Refresco de sesión | Frontend Server (middleware) | — | Único punto donde la cookie rotada se puede escribir en la respuesta |
| Ruteo por rol | Frontend Server (middleware) | — | UX. Lee `app_metadata.role` del JWT que `getUser()` ya trajo |
| **Autorización** | **Database (RLS)** | Frontend Server (guard en cada action) | Decisión bloqueada de la Fase 1. El guard del servidor es defensa en profundidad, no la frontera |
| Lectura del catálogo (39 aptos, aseadores) | API/Backend vía PostgREST con JWT de usuario | Database (RLS) | RSC llama a PostgREST; RLS filtra |
| Escritura de `properties`, `property_rooms`, `missing_item_catalog`, `calendar_feeds` | Frontend Server (Server Action con JWT de usuario) | Database (RLS + CHECK) | Medido: el admin tiene grant y policy |
| Escritura de `property_secrets` (código, iCal) | Frontend Server con `service_role` (`lib/supabase/admin.ts`) | — | Medido: sin grant para `authenticated`. No hay otra ruta |
| Alta/baja de cuentas | Frontend Server con `service_role` → GoTrue Admin API | Database (trigger `on_auth_user_created`) | `auth.users` no es escribible desde `public` |
| Validación en vivo del feed (APTO-12) | Frontend Server (Server Action, runtime Node) | Airbnb (servicio externo) | CORS + la URL es credencial: nunca desde el navegador |
| Filtrado/buscador de la tabla | Browser/Client | — | 39 filas ya cargadas; un round-trip por tecla es peor |
| Derivación de estado (`estadoDeApartamento`) | Compartido (`lib/domain/`, puro) | — | Se usa en RSC y en cliente. Sin efectos |
| Formato de dinero/fecha/hora | Compartido (`lib/domain/`, puro) | — | Idem |

---

## Standard Stack

### Núcleo ya instalado y pineado (no tocar)

| Paquete | Versión | Verificado |
|---|---|---|
| `next` | `15.5.24` | package.json. Por encima de 15.2.3, así que CVE-2025-29927 no aplica [VERIFIED: package.json + PITFALLS §12] |
| `react` / `react-dom` | `19.2.8` | package.json |
| `@supabase/ssr` | `0.12.5` | `.d.ts` leído directamente en `node_modules` |
| `@supabase/supabase-js` | `2.112.4` | package.json |
| `tailwindcss` + `@tailwindcss/postcss` | `4.3.3` | package.json |
| `zod` | `4.5.4` | package.json |
| `vitest` | `4.1.11` | package.json, config con `environment: 'node'`, `include: ['lib/**/*.test.ts']`, `TZ: 'UTC'` |
| `supabase` (CLI) | `2.116.0` devDep | package.json. Ojo: la CLI global de la máquina es `2.115.0`; usar siempre `npx supabase` |

### Lo que instala `shadcn init -b base -p nova` (medido en sandbox, 2026-09-01)

| Paquete | Rango que escribe el CLI | Dónde | Nota |
|---|---|---|---|
| `@base-ui/react` | `^1.7.0` | dependencies | Base UI, no Radix [VERIFIED: npm registry + medido] |
| `shadcn` | `^4.19.1` | **dependencies** | **No moverlo a devDependencies.** `globals.css` hace `@import "shadcn/tailwind.css"`, que resuelve por el `exports` map a `node_modules/shadcn/dist/tailwind.css` (629 líneas de `@custom-variant` y keyframes). En devDependencies el build de Vercel (que no instala devDeps en producción) falla al compilar el CSS. Esto **contradice `research/STACK.md`**, que dice "no es una dependencia runtime": era cierto en 4.x anterior, ya no |
| `tw-animate-css` | `^1.4.0` | dependencies | Idem, se importa desde el CSS |
| `class-variance-authority` | `^0.7.1` | dependencies | |
| `clsx` | `^2.1.1` | dependencies | |
| `tailwind-merge` | `^3.6.0` | dependencies | |
| `lucide-react` | `^1.38.0` | dependencies | **Drift declarado:** `research/STACK.md` pinea `1.37.0`; el CLI instala `1.38.0`. `02-UI-SPEC.md` §1 ya anticipa el drift y manda pinear lo que instale el CLI |

Lo que añade `shadcn add` de los 22 bloques:

| Paquete | Traído por | Nota |
|---|---|---|
| `cmdk` `^1.1.1` | `command` | El combobox de cluster (UI-SPEC §8.1) |
| `sonner` `^2.0.8` | `sonner` | |
| `next-themes` `^0.4.6` | `sonner` | **Dependencia no deseada.** `components/ui/sonner.tsx` hace `useTheme()` de `next-themes`. Sin `ThemeProvider` devuelve `'system'` y Sonner pintaría en oscuro si el SO está en oscuro. Ver §3.4 |

### A instalar además

| Paquete | Versión | Para qué |
|---|---|---|
| `react-hook-form` | `7.87.0` | Solo el formulario de apartamento [VERIFIED: npm registry] |
| `@hookform/resolvers` | `5.9.1` | `zodResolver` con soporte Zod 4 [VERIFIED: npm registry] |
| `@playwright/test` | `1.62.1` | devDependency. E2E de login, ruteo y los 6 criterios [VERIFIED: npm registry] |

### Alternativas consideradas

| En vez de | Se podría | Cuándo tendría sentido |
|---|---|---|
| Escáner iCal propio (~40 líneas) para APTO-12 | `node-ical@0.27.1` | Cuando llegue la Fase 3 y haya que parsear de verdad. Ver §4.3 para por qué no ahora |
| `Controller` de RHF sobre Base UI | `FormData` plana + los `<input>` ocultos que Base UI ya renderiza (`name`/`inputRef`) | Si RHF resultara demasiado pesado. No aplica: la lista de faltantes en vivo de UI-SPEC §8.2 necesita `watch()` |
| Server Actions + guard a mano | `next-safe-action@8.6.1` | A partir de ~10 actions con boilerplate de tipos repetido. Esta fase tiene ~8; queda como opción para la Fase 4 |
| `shadcn` en `dependencies` | Copiar `node_modules/shadcn/dist/tailwind.css` al repo e importarlo por ruta relativa | Solo si molesta el peso del CLI en producción. Rompe el `shadcn add` posterior |

**Instalación (orden importa, ver §3):**

```bash
npm i react-hook-form@7.87.0 @hookform/resolvers@5.9.1
npm i -D @playwright/test@1.62.1 && npx playwright install --with-deps chromium
```

---

## Package Legitimacy Audit

`slopcheck` **no está disponible** en este entorno (`pip install slopcheck` falla; no hay binario). Auditoría manual equivalente ejecutada contra el registry de npm el 2026-09-01: versión, repo de origen, fecha de creación del paquete, descargas de la última semana y presencia de `postinstall`.

| Paquete | Registry | Creado | Descargas/sem | Repo de origen | `postinstall` | Disposición |
|---|---|---|---|---|---|---|
| `shadcn` | npm | 2024-07-09 | 8.747.025 | github.com/shadcn-ui/ui | ninguno | Aprobado |
| `@base-ui/react` | npm | 2025-12-11 | 11.233.874 | github.com/mui/base-ui | ninguno | Aprobado |
| `react-hook-form` | npm | 2019-03-20 | 58.720.895 | github.com/react-hook-form/react-hook-form | ninguno | Aprobado |
| `@hookform/resolvers` | npm | 2020-05-20 | — | github.com/react-hook-form/resolvers | ninguno | Aprobado |
| `sonner` | npm | 2023-02-05 | 50.547.842 | github.com/emilkowalski/sonner | ninguno | Aprobado |
| `lucide-react` | npm | 2020-10-19 | — | github.com/lucide-icons/lucide | ninguno | Aprobado |
| `cmdk` | npm | 2020-10-08 | 43.982.400 | github.com/pacocoursey/cmdk | ninguno | Aprobado (transitiva de `command`) |
| `next-themes` | npm | 2020-10-10 | 26.547.324 | github.com/pacocoursey/next-themes | ninguno | Aprobado con reserva — ver §3.4 |
| `tw-animate-css` | npm | 2025-03-10 | 37.428.160 | github.com/Wombosvideo/tw-animate-css | ninguno | Aprobado (transitiva del init) |
| `@playwright/test` | npm | 2020-09-24 | — | github.com/microsoft/playwright | ninguno | Aprobado |

**Paquetes retirados por veredicto `[SLOP]`:** ninguno.
**Paquetes marcados `[SUS]`:** ninguno. El más joven es `@base-ui/react` (9 meses), y es el proyecto de MUI adoptado como default oficial por shadcn.

*Como `slopcheck` no corrió, la disposición formal de todos estos paquetes es `[ASSUMED]` bajo el protocolo. En la práctica los tres que el plan instala explícitamente (`react-hook-form`, `@hookform/resolvers`, `@playwright/test`) tienen 5 y 6 años de historia, repos oficiales y decenas de millones de descargas semanales. El resto entra automáticamente por `shadcn init`/`add`, es decir por el registry oficial de shadcn, no por elección de nombre. Un `checkpoint:human-verify` por cada uno sería teatro; uno solo, antes del `shadcn init`, cubre el riesgo real.*

---

## Architecture Patterns

### System Architecture Diagram

```
                    ┌──────────── Navegador ────────────┐
                    │  /login   /apartamentos  /mis-aseos │
                    └──────┬──────────────────┬──────────┘
                           │ cookie sb-*      │ filtrado en cliente (39 filas)
                           ▼                  │
        ┌──────────────────────────────────┐  │
        │  middleware.ts  (Edge)           │  │
        │  1. createServerClient(cookies)  │  │
        │  2. await getUser()  ← 1 llamada │  │
        │  3. sin user → /login            │  │
        │  4. rol de app_metadata → ruta   │  │  ← UX, NO autorización
        │  5. return supabaseResponse tal  │  │
        │     cual (setAll de 2 args)      │  │
        └──────┬───────────────────────────┘  │
               │                               │
   ┌───────────▼───────────┐      ┌────────────▼──────────────┐
   │ RSC  (app/(admin)/*)  │      │ Server Actions            │
   │ lib/supabase/server.ts│      │ 'use server'              │
   │ cliente con JWT user  │      │ guard: getUser() + rol    │
   └───────────┬───────────┘      └──┬─────────────────────┬──┘
               │                     │                     │
               │  PostgREST          │  PostgREST          │  service_role
               │  (JWT del usuario)  │  (JWT del usuario)  │  (admin.ts, server-only)
               ▼                     ▼                     ▼
   ┌──────────────────────────────────────┐   ┌──────────────────────────┐
   │ Postgres — RLS es la frontera real   │   │ property_secrets         │
   │  properties · profiles               │   │  (sin grant p/ auth.)    │
   │  property_rooms · missing_item_cat.  │   │ GoTrue Admin API         │
   │  calendar_feeds                      │   │  createUser · ban        │
   │  private.is_admin() / is_active_...  │   └──────────────────────────┘
   └──────────────────────────────────────┘

         Server Action "validar feed" (APTO-12, runtime nodejs)
         guard admin → Zod host allowlist → fetch(AbortSignal.timeout)
              → sniff BEGIN:VCALENDAR → unfold → contar VEVENT
              → min(DTEND futuro)  ──►  NO escribe calendar_reservations
                                        NO crea cleanings
                                        (eso es Fase 3)
                     ▲
                     │ https
              ┌──────┴────────┐
              │ Airbnb  .ics  │
              └───────────────┘
```

### Estructura de rutas recomendada

Derivada de `research/ARCHITECTURE.md` §Next.js App Structure, recortada a lo que esta fase entrega:

```
app/
├── layout.tsx                          # lang="es", metadata VivaGuest, <Toaster/>
├── page.tsx                            # redirect() a /login  (hoy es boilerplate de CNA)
├── (public)/
│   └── login/page.tsx                  # PLAT-01, PLAT-02
├── (admin)/
│   ├── layout.tsx                      # TopNav + guard is_admin; force-dynamic
│   ├── apartamentos/
│   │   ├── page.tsx                    # APTO-11, tabla + banner de montaje
│   │   ├── loading.tsx                 # skeleton geométrico (UI-SPEC §9.3)
│   │   ├── nuevo/page.tsx
│   │   └── [id]/
│   │       ├── page.tsx                # formulario de 5 secciones
│   │       └── calendario/page.tsx     # APTO-12
│   ├── aseadores/
│   │   ├── page.tsx                    # ASEADOR-03
│   │   └── loading.tsx
│   └── _components/                    # los 15 organismos de UI-SPEC §14.2
├── (cleaner)/
│   ├── layout.tsx                      # guard is_active_cleaner; una columna
│   └── mis-aseos/page.tsx              # stub de ruteo (PLAT-07)
middleware.ts
components/ui/                          # shadcn sin envolver (22 bloques)
lib/
├── supabase/{browser,server,middleware,admin}.ts
├── auth/{guards,routing}.ts            # routing.ts es PURO → testeable en vitest
├── domain/{properties,money,dates,errors,constants,ical-preview}.ts
└── actions/                            # opcional: co-locar en _actions.ts por ruta
```

Dos notas sobre esta estructura:

- **`lib/auth/routing.ts` es puro a propósito.** El middleware no se puede testear en Vitest sin montar Next. Extraer la decisión (`¿a dónde va este pathname con este rol?`) a una función pura la vuelve una tabla de casos, y deja al middleware como cableado. Ver §7.4.
- **`lib/domain/ical-preview.ts`** aísla la costura con la Fase 3. Ver §4.

### Patrón 1: los cuatro clientes de Supabase

**Qué:** cuatro fábricas, ninguna a nivel de módulo. `research/PITFALLS.md` §14 es explícito: un `export const supabase = createServerClient(...)` a nivel superior se comparte entre peticiones concurrentes con las cookies del primero que lo instanció.

**Cuándo:** browser en Client Components, server en RSC y Server Actions, middleware solo en `middleware.ts`, admin solo donde no hay alternativa.

**`lib/supabase/browser.ts`**
```ts
'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/database.types';
import { publicEnv } from '@/lib/env';

// createBrowserClient SÍ cachea un singleton internamente: en el navegador solo
// hay un usuario. Es la única de las cuatro fábricas donde el singleton es correcto.
export function createClient() {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY } = publicEnv();
  return createBrowserClient<Database>(
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
```

**`lib/supabase/server.ts`**
```ts
import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/lib/database.types';
import { publicEnv } from '@/lib/env';

/**
 * Un cliente NUEVO por petición. Nunca a nivel de módulo: en Fluid Compute de
 * Vercel varias peticiones comparten instancia y se llevarían las cookies ajenas.
 */
export async function createClient() {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY } = publicEnv();
  const cookieStore = await cookies();          // async en Next 15

  return createServerClient<Database>(
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        // El segundo argumento son los headers anti-caché. Aquí NO se aplican
        // porque `cookies()` de Next no permite escribir headers de respuesta; el
        // sitio donde sí importan es el middleware.
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Llamado desde un Server Component: no se puede escribir. Se ignora
            // porque el middleware ya refresca la sesión.
          }
        },
      },
    },
  );
}
```

**`lib/supabase/middleware.ts`** — el archivo donde el segundo argumento sí es obligatorio:
```ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/lib/database.types';
import { publicEnv } from '@/lib/env';

export async function actualizarSesion(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY } = publicEnv();

  const supabase = createServerClient<Database>(
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        // ── DOS ARGUMENTOS. El segundo es lo que impide que el CDN de Vercel
        //    cachee esta respuesta (que lleva Set-Cookie de sesión) y se la
        //    sirva a otro usuario. El ejemplo oficial de Supabase todavía
        //    escribe la firma de un solo argumento: está desactualizado
        //    respecto a su propia librería. Ver §1.1.
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
          for (const [clave, valor] of Object.entries(headers)) {
            supabaseResponse.headers.set(clave, valor);
          }
        },
      },
    },
  );

  // Nada entre createServerClient y getUser(). Un await de por medio y las
  // cookies se escriben tarde: el usuario se desloguea solo cada cierto rato.
  const { data, error } = await supabase.auth.getUser();

  return { supabaseResponse, user: error ? null : data.user };
}
```

**`middleware.ts`**
```ts
import { NextResponse, type NextRequest } from 'next/server';
import { actualizarSesion } from '@/lib/supabase/middleware';
import { resolverRedireccion } from '@/lib/auth/routing';

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user } = await actualizarSesion(request);

  // `role` sale de app_metadata, NUNCA de user_metadata: el usuario puede
  // escribir user_metadata con supabase.auth.updateUser() (medido). Y esto es
  // ruteo, no autorización: la RLS es la que decide qué ve.
  const rol = user?.app_metadata?.role as 'admin' | 'aseador' | undefined;
  const destino = resolverRedireccion(request.nextUrl.pathname, rol);

  if (destino) {
    const url = request.nextUrl.clone();
    url.pathname = destino;
    // Copiar las cookies del supabaseResponse o la sesión se desincroniza.
    const redir = NextResponse.redirect(url);
    for (const c of supabaseResponse.cookies.getAll()) redir.cookies.set(c);
    return redir;
  }

  // Devolver el objeto TAL CUAL. No reconstruirlo.
  return supabaseResponse;
}

export const config = {
  matcher: [
    // Excluye estáticos, imágenes y /api/cron/* (esos se autentican por
    // secreto compartido, no por cookie: la Fase 3 los añade).
    '/((?!_next/static|_next/image|favicon\\.ico|api/cron|sw\\.js|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
```

### Patrón 2: guard de Server Action

**Qué:** cada `'use server'` arranca con el mismo par de comprobaciones. Un Server Action es un endpoint HTTP público (ARCHITECTURE.md, en negrita); el `(admin)` del route group no autoriza nada.

```ts
// lib/auth/guards.ts
import 'server-only';
import { createClient } from '@/lib/supabase/server';

export class NoAutorizado extends Error {}

/**
 * Defensa en profundidad, NO la frontera. La frontera es la RLS: aunque este
 * guard se cayera, un aseador que invoque la action recibiría 0 filas / 42501.
 * Sirve para (a) fallar temprano con un mensaje en español y (b) no filtrar la
 * existencia de recursos por el código de error de Postgres.
 */
export async function exigirAdmin() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new NoAutorizado();
  if (data.user.app_metadata?.role !== 'admin') throw new NoAutorizado();
  return { supabase, user: data.user };
}
```

### Patrón 3: `useActionState` para todo salvo el formulario largo

Alineado con `research/STACK.md` §7. Login, activar/desactivar, crear aseador y validar feed usan `useActionState` + `useFormStatus`. Solo el formulario de apartamento usa RHF (§5).

### Anti-patrones a evitar

- **`createServerClient` a nivel de módulo.** Fuga cruzada de sesión. PITFALLS §14.
- **`setAll(cookiesToSet)` de un argumento en el middleware.** Fuga de sesión por CDN. Es el ejemplo que trae la doc oficial de Supabase; medido que la librería sí pasa el segundo argumento.
- **`getSession()` para autorizar.** No hace ninguna llamada de red.
- **Rutear por `user_metadata.role`.** Medido: el propio usuario lo puede cambiar a `'admin'`.
- **`unstable_cache` / `'use cache'` sobre datos por usuario.** PITFALLS §13. Con 39 apartamentos no hay ningún problema de rendimiento que lo justifique.
- **Reconstruir el `NextResponse` en el middleware sin copiar las cookies.** Deslogueos aleatorios.
- **Añadir un trigger `AFTER UPDATE ON auth.users` que sincronice `raw_user_meta_data → profiles.role`.** Sería la ruta de escalada de privilegios que hoy no existe. El trigger actual es solo `AFTER INSERT`, y así debe quedarse.
- **"Arreglar" la divergencia entre lo que cuenta el preview de APTO-12 y lo que contará el pipeline de la Fase 3.** Ver §4.4.

---

## 1. `@supabase/ssr` 0.12.5 en Next.js 15.5, concretamente

### 1.1 `setAll` recibe dos argumentos — verificado en el código, no en la doc

`node_modules/@supabase/ssr/dist/main/types.d.ts` declara:

```ts
export type SetAllCookies = (
  cookies: { name: string; value: string; options: CookieOptions }[],
  /**
   * Headers that must be set on the HTTP response alongside the cookies.
   * Responses that set auth cookies must not be cached by CDNs or
   * reverse proxies, otherwise one user's session token can be served
   * to a different user.
   */
  headers: Record<string, string>,
) => Promise<void> | void;
```

Y `dist/main/cookies.js` líneas 499-503 lo materializa:

```js
await setAll([...], {
  "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
  Expires: "0",
  Pragma: "no-cache",
});
```

[VERIFIED: tarball de `@supabase/ssr@0.12.5` en `node_modules`, leído en esta sesión]

**Advertencia para el executor:** el ejemplo oficial de Supabase para Next.js **todavía usa la firma de un argumento**. Se descargó verbatim de `supabase/supabase` (`apps/ui-library/registry/default/clients/nextjs/lib/supabase/middleware.ts`) y no aplica los headers. Como TypeScript permite implementar un tipo de función con menos parámetros de los declarados, **copiar el ejemplo oficial compila sin un solo error y deja el agujero abierto**. Esto es exactamente el modo de falla contra el que advierte STACK.md.
[CITED: github.com/supabase/supabase — apps/ui-library/registry/default/clients/nextjs/lib/supabase/middleware.ts, obtenido vía `gh api` el 2026-09-01]

### 1.2 `cookies()` es async en Next 15

`await cookies()` antes de construir el cliente. Ya reflejado en el código de §Patrón 1. No hay debate: es la firma de Next 15 y la doc oficial de Supabase también la usa así.

### 1.3 Devolver `supabaseResponse` tal cual

La doc oficial lo repite en mayúsculas. Si hay que redirigir, se crea el `NextResponse.redirect` y se le copian **todas** las cookies del `supabaseResponse` (§Patrón 1, `middleware.ts`). Saltarse ese copiado es la causa clásica de "los usuarios se deslogean solos".

### 1.4 El matcher

```
'/((?!_next/static|_next/image|favicon\\.ico|api/cron|sw\\.js|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'
```

`api/cron` se excluye ya para la Fase 3 (esos endpoints se autentican por secreto compartido, no por cookie, y `pg_net` no manda cookies). `sw.js` y `manifest.webmanifest` se excluyen ya para las Fases 5-6. Excluirlos ahora es gratis y evita una edición cruzada después.

### 1.5 `getUser()` vs `getSession()` vs `getClaims()` — qué es actual y qué es consejo caducado

| Método | Llamadas de red | Detecta usuario baneado/desactivado | Estado del consejo |
|---|---|---|---|
| `getSession()` | 0 | No | **Caducado y peligroso.** Doc oficial: *"Never trust `supabase.auth.getSession()` inside server code."* |
| `getClaims()` | 0 con claves asimétricas (verifica firma vía JWKS cacheado); 1 con secreto simétrico | **No** | Es lo que recomienda la doc oficial **hoy** para proteger páginas |
| `getUser()` | 1 siempre, al servidor de Auth | **Sí** | Lo que bloqueó `02-CONTEXT.md`, y lo correcto para este proyecto |

**Medición hecha en esta sesión**, sobre el stack local, con un aseador cuyo access token seguía sin expirar:

```
--- ANTES de desactivar ---
getUser:   OK cd9d3d02-…
getClaims: OK sub=cd9d3d02-…
--- DESPUÉS de is_active=false + ban_duration ---
getUser:   ERR 403 user_banned "User is banned"
getClaims: OK sub=cd9d3d02-…          ← NO detecta la revocación
```
[VERIFIED: `probe-auth.mjs` contra `supabase start` local, 2026-09-01]

Control adicional: con un token de firma manipulada, `getClaims()` sí falla (`Invalid JWT signature`). Es decir, `getClaims()` valida **firma y expiración**, no **revocación**. Es exactamente lo que su nombre promete y exactamente lo que no sirve para el criterio de éxito 4 del ROADMAP.

**Conclusión:** `getUser()` en el middleware. La decisión de `02-CONTEXT.md` es correcta y este research la respalda con evidencia, no con autoridad. El coste es una llamada de red por navegación protegida; con dos personas y ~8 aseadores es irrelevante.

**Dato de contexto que hace irrelevante el argumento de rendimiento de `getClaims()`:** el stack local usa `JWT_SECRET` simétrico (`super-secret-jwt-token-with-at-least-32-characters-long`, visible en `supabase start`). Con secreto simétrico `getClaims()` hace **la misma llamada de red que `getUser()`**, según su propio JSDoc. La ventaja de `getClaims()` solo aparece si el proyecto hosted se configura con claves asimétricas (ECC/RSA), y aun entonces sigue sin detectar revocación.

---

## 2. Ruteo por rol sin autorizar desde el JWT

**La respuesta corta: no hace falta un Custom Access Token Hook.**

`auth.admin.createUser` acepta `app_metadata`, y GoTrue lo copia al JWT. Medido:

```
createUser app_metadata : {"provider":"email","providers":["email"],"role":"aseador"}
claims del JWT          : iss,sub,aud,exp,iat,email,phone,app_metadata,user_metadata,role,aal,amr,session_id,is_anonymous
claims.app_metadata     : {"provider":"email","providers":["email"],"role":"aseador"}
exp - iat               : 1800 s   (coincide con jwt_expiry = 1800 de config.toml)
```
[VERIFIED: medido en esta sesión]

Y `getUser()` devuelve ese `app_metadata` en su respuesta. El middleware **ya hace** ese `getUser()` para refrescar la sesión, así que leer el rol de ahí cuesta **cero llamadas adicionales**.

### 2.1 Por qué `app_metadata` y no `user_metadata`

Medición decisiva:

```
[aseador] updateUser({data:{role:'admin'}}) → OK
   user_metadata.role  = "admin"     ← el propio usuario lo escribió
   app_metadata.role   = "aseador"   ← intacto
   profiles.role       = "aseador"   ← intacto
   JWT refrescado: user_metadata.role=admin | app_metadata.role=aseador
```
[VERIFIED: medido en esta sesión]

Un aseador puede autoproclamarse admin en `user_metadata` y el JWT siguiente lo lleva. No gana nada — la RLS lee `profiles.role` vía `private.is_admin()` — pero si el middleware ruteara por `user_metadata` lo mandaría al shell del admin, donde vería una tabla vacía y un montón de errores `42501`. Feo, confuso y evitable.

**Regla dura para el executor:** `app_metadata.role` para rutear. `user_metadata.role` **solo** existe porque el trigger `tg_handle_new_user` de la migración 03 lee `new.raw_user_meta_data->>'role'`. Por eso `createUser` debe escribir el rol en **los dos** sitios.

### 2.2 Coste de un Custom Access Token Hook, si algún día se quisiera

`supabase/config.toml` ya trae el bloque `[auth.hook.custom_access_token]` comentado. Costes reales:

- Una función Postgres más en `public` o `private`, con el par revoke/grant obligatorio del hallazgo 5 de `deferred-items.md`.
- El hook corre **en cada emisión y refresco de token**: una lectura a `profiles` cada 30 minutos por usuario. Con ~10 usuarios eso es ruido.
- No compra nada aquí: el rol ya viaja gratis en `app_metadata` y **no puede** usarse para autorizar (un token emitido sigue verificando hasta expirar).
- Sí serviría para un claim derivado que `app_metadata` no puede tener por ser estático, por ejemplo "número de aseos asignados hoy". Ninguna pantalla de esta fase lo pide.

**Recomendación: no instalar el hook en esta fase.** Dejar el bloque comentado.

### 2.3 La tabla de ruteo

`lib/auth/routing.ts`, función pura, sin dependencias de Next:

```ts
export type Rol = 'admin' | 'aseador';
const RAIZ: Record<Rol, string> = { admin: '/apartamentos', aseador: '/mis-aseos' };
const PUBLICAS = ['/login'];

/** Devuelve el pathname al que hay que redirigir, o null si la ruta está bien. */
export function resolverRedireccion(pathname: string, rol: Rol | undefined): string | null {
  const esPublica = PUBLICAS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!rol) return esPublica ? null : '/login';
  if (esPublica) return RAIZ[rol];
  if (pathname === '/') return RAIZ[rol];

  const esZonaAdmin   = pathname.startsWith('/apartamentos') || pathname.startsWith('/aseadores');
  const esZonaAseador = pathname.startsWith('/mis-aseos');

  if (rol === 'admin'   && esZonaAseador) return RAIZ.admin;
  if (rol === 'aseador' && esZonaAdmin)   return RAIZ.aseador;
  return null;
}
```

Pura ⇒ tabla de casos en Vitest bajo `lib/`, que es exactamente lo que el `include: ['lib/**/*.test.ts']` de `vitest.config.ts` ya recoge sin tocar la config.

---

## 3. Instalar shadcn 4.19.1 sobre el repo ya andamiado

Todo lo de esta sección se **midió** ejecutando el CLI real contra un sandbox que replica `package.json`, `tsconfig.json`, `postcss.config.mjs`, `next.config.ts`, `app/globals.css` y `app/layout.tsx` del repo. [VERIFIED: sandbox `shadcnprobe`, 2026-09-01]

### 3.1 Las banderas reales

```
$ npx shadcn@4.19.1 init --help
  -t, --template <template>   (next, start, vite, react-router, laravel, astro)
  -b, --base <base>           the component library to use. (base, radix, aria)
      --monorepo / --no-monorepo
  -p, --preset [name]         use a preset configuration
  -y, --yes                   (default: true)
  -d, --defaults              --template=next --preset=base-nova (default: false)
  -f, --force
      --css-variables (default: true) / --no-css-variables
      --rtl / --no-rtl
      --pointer / --no-pointer
      --reinstall / --no-reinstall
```

Confirmado: **`--base-color` no existe**. `-b base` instala Base UI.

**Corrección a `02-UI-SPEC.md` §1:** el spec dice `Preset: ninguno`. **No existe la opción "ninguno".** Sin `-p` el CLI abre un prompt interactivo bloqueante:

```
? Which preset would you like to use?
❯ Nova - Lucide / Geist
  Vega  Maia  Lyra  Mira  Luma  Sera  Rhea  Custom
```

Y `-p base-nova` (el valor que el propio `--defaults` documenta) **falla**:
`Invalid preset: base-nova. Available presets: nova, vega, maia, lyra, mira, luma, sera, rhea`

El preset correcto es **`nova`**, que es precisamente el de Lucide + Geist, es decir el que el UI-SPEC quiere. `components.json` queda con `"style": "base-nova"`, que es la combinación `-b base` + `-p nova`. No es una desviación del contrato de diseño: es el nombre real de lo que el contrato pedía.

`shadcn add` **no** tiene `-y` por defecto (es `false`): hay que pasarlo explícitamente. Sí tiene `--dry-run` y `--diff [path]`, útiles para previsualizar antes de escribir.

### 3.2 Secuencia exacta

```bash
# 0. árbol limpio. Este init reescribe globals.css entero: el diff tiene que ser revisable.
git status --porcelain    # debe salir vacío

# 1. init  (preset `nova`, NO `base-nova`, NO "ninguno")
npx shadcn@4.19.1 init -b base -p nova --css-variables --no-monorepo --no-rtl --pointer

# 2. commit aislado
git add -A && git commit -m "chore(ui): shadcn init (base + nova)"

# 3. los 22 bloques  (ojo: `form` NO produce archivo — ver 3.5)
npx shadcn@4.19.1 add -y alert alert-dialog badge button card checkbox command dialog \
  dropdown-menu field input label popover progress select separator skeleton \
  sonner switch table textarea tooltip

# 4. commit aislado
git add -A && git commit -m "chore(ui): componentes base"

# 5. pinear exacto lo que el CLI escribió con caret, y quitar next-themes si se
#    simplifica sonner.tsx (§3.4). Luego la capa de tokens de UI-SPEC §4.3.
# 6. commit "feat(ui): tokens VivaGuest"
```

### 3.3 Qué sobrescribe exactamente

| Archivo | Antes | Después | Comentario |
|---|---|---|---|
| `app/globals.css` | 26 líneas | **132** líneas, reescrito entero | El UI-SPEC dice ~144; **medido 132**. El `@media (prefers-color-scheme: dark)` **desaparece**, que es lo que se quería |
| `app/layout.tsx` | — | **sin cambios** (`diff` vacío) | El CLI reporta "Updating fonts" pero no toca el archivo. **Los dos bugs heredados sobreviven: `<html lang="en">` y `title: "Create Next App"`. Hay que arreglarlos a mano** |
| `components.json` | no existía | creado | `style: "base-nova"`, `baseColor: "neutral"`, `iconLibrary: "lucide"`, `rtl: false`, aliases `@/components`, `@/lib/utils` |
| `lib/utils.ts` | no existía | creado | `cn()` con `clsx` + `twMerge` |
| `package.json` | — | +7 deps en `dependencies` | Todas con caret. Ver §Standard Stack |
| `postcss.config.mjs`, `next.config.ts`, `tsconfig.json` | — | sin cambios | |

El `globals.css` generado empieza así:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";        /* ← resuelve a node_modules/shadcn/dist/tailwind.css */

@custom-variant dark (&:is(.dark *));

@theme inline { … 44 tokens … }
:root { … 31 variables, --radius: 0.625rem … }
.dark { … 30 variables … }

@layer base {
  * { @apply border-border outline-ring/50; }
  body { @apply bg-background text-foreground; }
  button:not(:disabled), [role="button"]:not(:disabled) { cursor: pointer; }   /* --pointer */
  html { @apply font-sans; }
}
```

### 3.4 Cuatro cosas que hay que arreglar después del init

**(a) Geist Sans queda roto.** El `@theme inline` generado escribe:

```css
--font-sans: var(--font-sans);        /* ← circular */
--font-mono: var(--font-geist-mono);  /* ← correcto */
```

`app/layout.tsx` declara la fuente como `variable: "--font-geist-sans"`. La referencia circular es inválida y el `html { @apply font-sans }` cae al fallback del navegador. **Arreglo:** en `globals.css`, `--font-sans: var(--font-geist-sans);`. Verificar en el navegador que el `computed style` de `<html>` sea Geist, no `-apple-system`. Es la clase de bug que nadie nota hasta que lo ve al lado de una maqueta.

**(b) `shadcn` tiene que quedarse en `dependencies`.** `@import "shadcn/tailwind.css"` resuelve por el `exports` map del paquete (`"./tailwind.css": "./dist/tailwind.css"`, 629 líneas de `@custom-variant` y keyframes que los componentes usan: `data-open`, `data-checked`, `accordion-down`…). Moverlo a `devDependencies` rompe el build de producción. Esto **contradice `research/STACK.md`** ("no es una dependencia runtime"); dejarlo escrito para que nadie lo "corrija".

**(c) `next-themes` es una dependencia no deseada.** Llega por `sonner`, cuyo `components/ui/sonner.tsx` hace `const { theme = "system" } = useTheme()`. Sin `ThemeProvider` devuelve `"system"` y Sonner pinta oscuro si el SO está en oscuro — exactamente lo que la decisión de "solo claro" quiere evitar. **Arreglo:** editar `components/ui/sonner.tsx`, quitar el import y pasar `theme="light"` fijo, y desinstalar `next-themes`. Es un componente propio del repo: editarlo es el modelo de shadcn, no un hack.

**(d) Los pines.** El CLI escribe rangos con caret. La convención del repo es exacta. Fijar: `@base-ui/react`, `shadcn`, `tw-animate-css`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `cmdk`, `sonner`. Anotar en el commit el drift de `lucide-react` (STACK.md dice `1.37.0`, el CLI instala `1.38.0`).

### 3.5 `form` no existe en Base UI — hay que usar `field`

Medición:

```
$ npx shadcn@4.19.1 add -y … form …
✔ Created 22 files:  (alert, badge, button, card, checkbox, dropdown-menu, input,
   label, popover, progress, select, separator, skeleton, sonner, switch, table,
   textarea, tooltip, alert-dialog, dialog, input-group, command)
                              ← NO hay components/ui/form.tsx

$ npx shadcn@4.19.1 view @shadcn/form
[{ "name": "form", "type": "registry:ui" }]      ← sin `files`
```
[VERIFIED: medido en esta sesión]

El `Form`/`FormField`/`FormItem`/`FormControl`/`FormMessage` de shadcn era un wrapper de react-hook-form pensado para Radix. En el estilo Base UI está reemplazado por **`field`**, que exporta `Field`, `FieldSet`, `FieldLegend`, `FieldGroup`, `FieldLabel`, `FieldTitle`, `FieldContent`, `FieldDescription`, `FieldSeparator` y `FieldError`.

`FieldError` acepta `errors?: Array<{ message?: string }>`, que encaja directo con lo que da RHF, y renderiza `role="alert"`:

```tsx
<Field data-invalid={!!errors.tarifa_huesped}>
  <FieldLabel htmlFor="tarifa_huesped">Tarifa al huésped</FieldLabel>
  <CampoMoneda id="tarifa_huesped" {...register('tarifa_huesped')}
               aria-invalid={!!errors.tarifa_huesped} />
  <FieldDescription>Pesos colombianos, sin decimales.</FieldDescription>
  <FieldError errors={[errors.tarifa_huesped]} />
</Field>
```

**Consecuencia para el plan:** el inventario de `02-UI-SPEC.md` §14.1 lista `form`. Hay que sustituirlo por `field`. El bloque `input-group` entra solo (dependencia de `input`) y es útil para el adorno `$` de `CampoMoneda` (UI-SPEC §8.4).

### 3.6 Los primitivos de Base UI son controlados, pero traen input nativo oculto

Medido en los `.d.ts` de `@base-ui/react@1.7.0`:

- `Select.Root`: `name?`, `value?`, `defaultValue?`, `onValueChange?(value, eventDetails)`, `inputRef?`, `items?`
- `Switch.Root`: `name?`, `checked?`, `onCheckedChange?(checked, eventDetails)`, `inputRef?`
- `Checkbox.Root`: mismo patrón

O sea: **hay un `<input>` nativo oculto con `name`**, así que funcionan con `FormData` plana *y* con `<Controller>` de RHF.

Dos detalles que muerden:
- Los callbacks reciben **dos** argumentos (`valor`, `eventDetails`). `onCheckedChange={field.onChange}` funciona por accidente (RHF ignora el extra), pero conviene envolver: `onCheckedChange={(v) => field.onChange(v)}`.
- `Select`, `Switch` y `Checkbox` van con `<Controller>`; `Input` y `Textarea` van con `register()`.

### 3.7 Los 22 bloques a añadir

De `02-UI-SPEC.md` §14.1, con `form` → `field`:

`alert` · `alert-dialog` · `badge` · `button` · `card` · `checkbox` · `command` · `dialog` · `dropdown-menu` · **`field`** · `input` · `label` · `popover` · `progress` · `select` · `separator` · `skeleton` · `sonner` · `switch` · `table` · `textarea` · `tooltip`

Entra además `input-group` como dependencia de registry.

El CLI recuerda al final: `TooltipProvider` en el layout raíz.

---

## 4. APTO-12 — la validación en vivo del feed

### 4.1 ¿Se puede hacer sin invadir la Fase 3? Sí, con una costura explícita

**Sí, es una rebanada delgada.** Lo que APTO-12 necesita son cuatro hechos sobre un cuerpo de texto:

1. ¿responde 2xx?
2. ¿el cuerpo es un iCal? (`BEGIN:VCALENDAR`)
3. ¿cuántas reservas trae?
4. ¿cuál es el `DTEND` futuro más próximo?

**Ninguno de esos cuatro obliga a decidir nada de lo que la Fase 3 tiene que decidir.** La identidad de la reserva (¿`UID` estable? ¿código de reserva? ¿upsert por clave natural?) solo importa cuando hay que **persistir** reservas y **generar o cancelar** aseos. El preview no persiste ninguna reserva y no crea ningún aseo.

La costura se hace explícita con dos reglas que el executor no puede saltarse:

- **El preview NO escribe en `calendar_reservations` ni en `cleanings`.** Escribe únicamente `property_secrets.ical_url` (con `service_role`) y las columnas de *salud* de `calendar_feeds`, que ya existen para esto: `last_attempt_at`, `last_success_at`, `last_http_status`, `last_event_count`, `last_payload_hash`, `last_error`, `consecutive_failures`.
- **La lógica vive en `lib/domain/ical-preview.ts`**, con un comentario de cabecera que dice que la Fase 3 la subsume. Un solo archivo que borrar o absorber.

El único punto donde la Fase 3 se asoma es la definición de "reserva" (§4.4).

### 4.2 Dónde corre el fetch

**Server Action**, como manda `02-UI-SPEC.md` §10.4. Razones y detalles:

- **No puede ser cliente:** CORS lo bloquea, y peor, la URL es una credencial que quedaría en el panel de red de cualquiera que mire la pantalla.
- **Server Action y no Route Handler:** el llamador es un navegador con sesión; no hace falta control de status ni de headers. ARCHITECTURE.md pone la frontera exactamente ahí.
- **Runtime:** Node. No hace falta declarar nada (Next 15 usa Node por defecto en el App Router), pero conviene `export const runtime = 'nodejs'` en `app/(admin)/apartamentos/[id]/calendario/page.tsx` como documentación ejecutable — la Fase 3 va a necesitar `node-ical`, que no funciona en Edge.
- **Qué cliente:** los **dos**.
  - `createClient()` con JWT de usuario para el guard `exigirAdmin()` y para escribir `calendar_feeds` (medido: el admin **sí** puede hacer upsert en `calendar_feeds`).
  - `createAdminClient()` para `property_secrets.ical_url` (medido: `42501 permission denied` incluso siendo admin con JWT de usuario).
  Y el guard corre **antes** de tocar el cliente admin. Ese orden es el contrato.
- **Duración:** Vercel Hobby permite 60 s por función (300 s con Fluid Compute), así que el timeout de 10 s del UI-SPEC cabe de sobra. Poner `export const maxDuration = 20` de todos modos, para que el fallo sea el timeout de fetch controlado y no el corte de la plataforma. [CITED: vercel.com/docs/functions/limitations]

**Nota de seguridad que el UI-SPEC no cubre: SSRF.** El servidor va a hacer `fetch` sobre una URL escrita por un usuario. La regla Zod de host (§10.3 estado 2) se aplica antes del fetch y es la mitad de la defensa; la otra mitad es `redirect: 'manual'` (o `'error'`), porque un 302 a `169.254.169.254` o a `localhost:54321` saltaría la validación de host. Con `redirect: 'manual'` un 3xx se trata como fallo del feed, que además es semánticamente correcto: Airbnb sirve el `.ics` directo.

Y: **la URL nunca se escribe en un log ni en un mensaje de error.** Es una credencial. En el `last_error` de `calendar_feeds` va el status y el motivo, nunca la URL.

### 4.3 ¿`node-ical` o un escáner propio?

**Recomendación: escáner propio de ~40 líneas en `lib/domain/ical-preview.ts`.** Razones, en orden de peso:

1. **Elimina por construcción la trampa 2 de PITFALLS** (off-by-one de `DTEND`). El escáner extrae la cadena `YYYYMMDD` cruda del `DTEND;VALUE=DATE:` y la devuelve como `'YYYY-MM-DD'`. **Nunca construye un `Date`.** `node-ical` devuelve objetos `Date`, y "conviértelo bien" es justo la instrucción que se olvida. Un número mal en esta pantalla es peor que ningún número: el admin lo lee como confirmación de que el link es el correcto.
2. **No adelanta una decisión de dependencia que es de la Fase 3.** El ROADMAP marca la Fase 3 como `--research-phase` y su prerequisito humano (capturar un `.ics` real) sigue abierto. Elegir el parser ahora, con menos información, y sin fixtures reales, es exactamente la decisión que hay que aplazar.
3. **Es testeable hoy sin el archivo bloqueante.** Fixtures sintéticas construidas con la forma documentada.

Contra: dos parsers en el repo durante un tiempo. Mitigación: el archivo lleva la advertencia de que es diagnóstico, no pipeline, y la Fase 3 decide si lo absorbe o lo borra.

**Prototipo verificado en esta sesión** (ejecutado, con sus salidas):

```ts
// lib/domain/ical-preview.ts
// DIAGNÓSTICO, NO PIPELINE. Solo APTO-12. La Fase 3 escribe el parser real
// (probablemente node-ical) y decide si absorbe o borra este archivo.
// NO se construye ningún objeto Date aquí, a propósito: PITFALLS §2.

const RE_DTEND_DATE = /^DTEND(?:;[^:]*)?:(\d{8})\s*$/;
const RE_RESERVATION = /reservations\/details\/[A-Z0-9]+/i;

/** RFC 5545 §3.1: una línea continúa si la siguiente empieza por espacio o tab. */
export function desdoblar(texto: string): string {
  return texto.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
}

export type PreviewIcs =
  | { ok: false; motivo: 'no-es-ical' }
  | { ok: true; totalEventos: number; reservas: number; bloqueos: number;
      proximoCheckout: string | null; dtstamp: string | null };

export function previsualizarIcs(cuerpo: string, hoyIso: string): PreviewIcs {
  if (!/BEGIN:VCALENDAR/i.test(cuerpo)) return { ok: false, motivo: 'no-es-ical' };
  // … recorrido de líneas, whitelist positiva por DESCRIPTION, min(DTEND >= hoy) …
}
```

Salidas medidas del prototipo:

```
caso feliz   : {"ok":true,"totalEventos":3,"reservas":2,"bloqueos":1,
                "proximoCheckout":"2026-09-04","dtstamp":"20260901T120000Z"}
HTML 200     : {"ok":false,"motivo":"no-es-ical"}
cero eventos : {"ok":true,"totalEventos":0,"reservas":0,"bloqueos":0,"proximoCheckout":null}
unfold desc  : "DESCRIPTION:...details/HMYXB825YD"   ← el código NO se parte
timeout      : TimeoutError a los 1207 ms con AbortSignal.timeout(1200)
```
[VERIFIED: ejecutado en esta sesión]

El fetch:
```ts
const res = await fetch(url, {
  signal: AbortSignal.timeout(10_000),
  redirect: 'manual',
  headers: { Accept: 'text/calendar, text/plain;q=0.9' },
  cache: 'no-store',
});
```

### 4.4 ¿Hace falta el `.ics` real que bloquea la Fase 3?

**No para construir esto. Sí para dos cosas concretas, y ambas son acotables.**

**Lo que SÍ se puede construir y probar hoy, completo:**
- Los 7 estados de la pantalla (UI-SPEC §10.3) y su copy por código de error.
- El fetch con timeout duro, `redirect: 'manual'` y la clasificación 404/403/5xx/timeout.
- El sniff de `BEGIN:VCALENDAR` (el caso "HTTP 200 con HTML de error", medido arriba).
- El line unfolding del RFC 5545, con el caso real de la `DESCRIPTION` partida a 75 octetos.
- El conteo y el `min(DTEND futuro)`, contra fixtures sintéticas.
- El enmascarado de la URL, el toggle Mostrar/Ocultar, `Reemplazar link`.
- La escritura en `property_secrets` (admin client) y en `calendar_feeds` (JWT de usuario).
- El estado 4 de "ya conectado" leyendo `last_success_at` y `last_event_count`.

**Lo que genuinamente NO se puede sin material real:**
1. **Las cuatro capturas de `public/guia-airbnb/`.** Salen de la cuenta real de VivaGuest y no se pueden inventar. Ya está declarado como deuda 6 del UI-SPEC. Plan de contingencia, ya escrito en §10.1: *"Si hay que recortar alcance, se recorta la guía a texto sin capturas, nunca la validación."* Es una tarea de contenido, no de código: **no bloquea la fase**, bloquea una carpeta de `public/`.
2. **La prueba de humo de extremo a extremo contra un feed vivo.** Una fixture sintética demuestra que el escáner hace lo que dice; no demuestra que el `.ics` de Airbnb de 2026 tenga la forma que asumimos. Mitigación: un `checkpoint:human-verify` al final de la fase — pegar un link real, ver el número, contrastarlo contra el calendario de Airbnb.

**Lo que NO hace falta y podría confundirse con que hace falta:** la pregunta del `UID`. Es la que bloquea la Fase 3 y **no aparece por ningún lado en APTO-12**. El preview no persiste reservas, así que no necesita identidad.

**El único punto donde la Fase 3 se asoma: qué cuenta como "reserva".** El copy bloqueado dice `12 / reservas encontradas`. Dos definiciones posibles:

| Definición | A favor | En contra |
|---|---|---|
| Todo `VEVENT` | Trivial, cero suposiciones | Mezcla bloqueos del propietario. Un apartamento cerrado 3 meses diría "8 reservas" cuando tiene 0. Rompe la función del número, que es verificar que el link es el del apartamento correcto |
| **`VEVENT` con `Reservation URL` en `DESCRIPTION`** (whitelist positiva) | Es la regla que `research/PITFALLS.md` §3 prescribe para la Fase 3. Coherente por construcción | Depende de una regla que la Fase 3 podría refinar |

**Recomendación: la whitelist positiva.** Está respaldada por la evidencia primaria de `research/STACK.md` (432 snapshots de feeds reales de Airbnb: `DESCRIPTION` existe en exactamente los 1708 eventos `Reserved` y en ninguno de los 700 `Airbnb (Not available)`; el código de reserva vive dentro de la URL de `DESCRIPTION` con regex `/reservations\/details\/([A-Z0-9]+)/`). Confianza ALTA.

**Y se deja escrito en el archivo:** si la Fase 3 refina la clasificación, el número del preview puede divergir del pipeline. Eso es aceptable y deliberado — el preview es un diagnóstico deliberadamente más laxo. Nadie debe "arreglarlo" reintroduciendo la lógica de la Fase 3 aquí.

### 4.5 Rarezas de Airbnb que importan incluso en una validación superficial

| Rareza | Impacto en APTO-12 | Manejo |
|---|---|---|
| **`DTEND` es exclusivo** (RFC 5545) | El "próximo checkout" **es el `DTEND`**, sin restar ni sumar un día | Extraer la cadena `YYYYMMDD` cruda. Cero `Date`. PITFALLS §2 |
| **`SUMMARY` solo vale `Reserved` o `Airbnb (Not available)`** | Un feed 100% bloqueos mostraría "0 reservas" → estado 5, y ese estado **no es un error**: el copy ya dice "puede ser correcto si el apartamento está libre" | Whitelist positiva por `DESCRIPTION` (§4.4) |
| **Solo exporta fechas futuras** (desde 2019-12-01) | Un apartamento con checkouts solo en el pasado da 0 eventos. Es correcto, no es un fallo del link | Estado 5, botón `Guardar de todos modos` |
| **Un feed muerto devuelve 200 con HTML** | Sin el sniff, el escáner reporta "0 reservas" y el admin guarda un link roto creyendo que sirve. **Es el modo de falla más peligroso de esta pantalla** | Sniff `BEGIN:VCALENDAR` → estado 6. Medido |
| **`DESCRIPTION` viene *folded* a 75 octetos** con continuación por espacio | Sin unfolding, la regex de `Reservation URL` no matchea y el conteo da 0 | `desdoblar()` antes de parsear. Medido |
| **Airbnb no exporta más allá de ~365 días** | El conteo tiene un techo natural | Nada. Solo no sorprenderse |
| **`DTSTAMP` del `VCALENDAR`** | Alimenta el "El feed se actualizó hace 2 h." del estado 4 | Opcional: si falta, se omite la línea (UI-SPEC ya lo condiciona) |
| **Sin `RRULE`, sin `VTIMEZONE`, sin propiedades `X-`** | Simplifica: no hay recurrencias que expandir | Confirmado por los 432 snapshots de STACK.md |

---

## 5. Server Actions de CRUD con validación cruzada

### 5.1 El contrato borrador → activo en Zod

El formulario tiene un `is_active` que es un **modo de submit**, no un campo. Dos botones, dos niveles de exigencia. La forma limpia es un esquema base laxo y dos refinamientos:

```ts
// lib/domain/apartamento.schema.ts
import { z } from 'zod';

const cop = z.coerce.number().int().nonnegative();  // bigint de pesos enteros

export const apartamentoBase = z.object({
  nombre:            z.string().trim().min(1, 'El nombre es obligatorio'),
  cluster:           z.string().trim().min(1, 'El cluster es obligatorio'),
  direccion:         z.string().trim().nullish(),
  maps_url:          z.url('Pega un link válido de Google Maps').nullish(),
  gestion_vivaguest: z.boolean(),
  tarifa_huesped:    cop.nullish(),
  pago_aseador:      cop.nullish(),
  fee_discriminado:  z.boolean(),
  responsable_id:    z.uuid().nullish(),
  suplente_id:       z.uuid().nullish(),
  contacto_externo:  z.string().trim().nullish(),
  hora_limite:       z.string().regex(/^\d{2}:\d{2}$/),
});

/** Invariantes que valen SIEMPRE, incluso en borrador. Espejo de dos CHECK. */
const invariantesSiempre = <T extends z.ZodTypeAny>(s: T) => s
  // props_assignees_only_when_managed
  .refine((v) => v.gestion_vivaguest || (!v.responsable_id && !v.suplente_id), {
    path: ['responsable_id'],
    message: 'Una unidad de gestión externa no lleva responsable ni suplente.',
  })
  // props_suplente_distinct
  .refine((v) => !v.suplente_id || v.suplente_id !== v.responsable_id, {
    path: ['suplente_id'],
    message: 'El suplente no puede ser la misma persona que el responsable.',
  });

export const esquemaBorrador = invariantesSiempre(apartamentoBase);

/** Lo que la UI exige de más para ACTIVAR. Ver 5.3: es más estricto que la base. */
export const esquemaActivar = invariantesSiempre(apartamentoBase)
  .refine((v) => !v.gestion_vivaguest || v.tarifa_huesped != null, {
    path: ['tarifa_huesped'], message: 'Falta la tarifa al huésped.' })
  .refine((v) => !v.gestion_vivaguest || v.pago_aseador != null, {
    path: ['pago_aseador'], message: 'Falta el pago al aseador.' })
  .refine((v) => !v.gestion_vivaguest || v.responsable_id != null, {
    path: ['responsable_id'], message: 'Falta el aseador responsable.' })
  .refine((v) => v.gestion_vivaguest || !!v.contacto_externo?.trim(), {
    path: ['contacto_externo'], message: 'Falta el contacto externo.' });

/** Fuente única de la lista "Para activar falta" de UI-SPEC §8.2. */
export type Faltante = { campo: keyof z.input<typeof apartamentoBase>; etiqueta: string };

export function faltantesParaActivar(v: Partial<z.input<typeof apartamentoBase>>): Faltante[] {
  if (v.gestion_vivaguest === false) {
    return v.contacto_externo?.trim()
      ? []
      : [{ campo: 'contacto_externo', etiqueta: 'Contacto externo' }];
  }
  const f: Faltante[] = [];
  if (v.tarifa_huesped == null) f.push({ campo: 'tarifa_huesped', etiqueta: 'Tarifa al huésped' });
  if (v.pago_aseador   == null) f.push({ campo: 'pago_aseador',   etiqueta: 'Pago al aseador' });
  if (!v.responsable_id)        f.push({ campo: 'responsable_id', etiqueta: 'Aseador responsable' });
  return f;
}
```

`faltantesParaActivar` es la **misma** función que alimenta la lista en vivo y el `disabled` del botón. Un `if` duplicado entre el checklist y la validación es cómo se desincroniza la UI del contrato.

### 5.2 `watch()` alimentando la lista en vivo

```tsx
const { register, control, watch, formState: { errors } } = useForm({
  resolver: zodResolver(esquemaBorrador),   // el borrador es el resolver por defecto
  mode: 'onBlur',
  defaultValues: { hora_limite: '11:30', gestion_vivaguest: true, fee_discriminado: false, … },
});

// Suscripción granular: solo estos 5 campos re-renderizan la barra de acciones.
const [gestion, tarifa, pago, responsable, contacto] = watch([
  'gestion_vivaguest', 'tarifa_huesped', 'pago_aseador', 'responsable_id', 'contacto_externo',
]);

const faltantes = React.useMemo(
  () => faltantesParaActivar({ gestion_vivaguest: gestion, tarifa_huesped: tarifa,
                               pago_aseador: pago, responsable_id: responsable,
                               contacto_externo: contacto }),
  [gestion, tarifa, pago, responsable, contacto],
);
```

Notas:
- `watch(['a','b'])` con array, **no** `watch()` sin argumentos: el segundo re-renderiza el formulario entero en cada tecla, y con 12 campos + dos `useFieldArray` eso se siente.
- El submit decide el esquema: `Guardar` valida con `esquemaBorrador`, `Guardar y activar` con `esquemaActivar`. En RHF eso se hace con `handleSubmit` y un `formAction` distinto, o llamando `esquemaActivar.safeParse(getValues())` en el handler de activar.
- `useFieldArray` para cuartos y faltantes (UI-SPEC §8.1 sección 5). El duplicado de `etiqueta` se valida en cliente **antes** de enviar (`property_rooms_etiqueta_uniq`).

### 5.3 La divergencia deliberada UI ↔ base

Está documentada en `02-UI-SPEC.md` §8.2 y **medida** aquí. Al intentar activar una unidad gestionada sin tarifas ni responsable, la base devolvió:

```
ERR 23514 :: new row for relation "properties" violates check constraint
             "props_active_requires_owner"
```
[VERIFIED: medido en esta sesión]

Dos observaciones que importan al plan:

1. **Dispara `props_active_requires_owner`, no `props_active_requires_rates`.** Postgres no garantiza el orden de evaluación de los CHECK. Cualquier lógica que dependa de *cuál* CHECK falla es frágil. Por eso el §8.2 del UI-SPEC es la red: esos CHECK **no deben poder dispararse desde la UI**.
2. La UI es más estricta en dos puntos, a propósito:
   - `props_active_requires_owner` acepta `responsable_id IS NOT NULL **OR** contacto_externo IS NOT NULL`. La UI exige `responsable_id` para gestionadas (APTO-08 y criterio 3 del ROADMAP).
   - Para unidades **informativas** el CHECK **no aplica en absoluto** (`not (is_active and gestion_vivaguest)` es verdadero cuando `gestion_vivaguest` es false). La base dejaría activar una unidad externa sin contacto. La puerta de `contacto_externo` es **solo de UI, sin respaldo de base**. El executor no puede asumir que un 23514 la cubre.

### 5.4 `mapDbError()` necesita ampliarse

Hoy `lib/domain/constants.ts` conoce 3 índices y 1 CHECK. Los CHECK e índices que esta fase puede tocar y que **no** están mapeados:

| Constraint | SQLSTATE | Mensaje sugerido |
|---|---|---|
| `props_active_requires_rates` | 23514 | `No se puede activar sin tarifa al huésped y pago al aseador.` |
| `props_active_requires_owner` | 23514 | `No se puede activar sin un aseador responsable.` |
| `props_assignees_only_when_managed` | 23514 | `Una unidad de gestión externa no lleva responsable ni suplente.` |
| `props_suplente_distinct` | 23514 | `El suplente no puede ser la misma persona que el responsable.` |
| `props_rates_nonneg` | 23514 | `Las tarifas no pueden ser negativas.` |
| `property_rooms_etiqueta_uniq` | 23505 | `Ya existe un cuarto con esa etiqueta en este apartamento.` |
| `mic_prop_uniq` / `mic_global_uniq` | 23505 | `Ya existe un faltante con ese nombre.` |
| `calendar_feeds_prop_provider_uniq` | 23505 | `Este apartamento ya tiene un calendario de ese proveedor.` |
| `profiles_deactivation_coherent` | 23514 | `Estado de activación incoherente.` (bug interno: no debería verse) |
| `property_secrets_tipo_cerradura_valido` | 23514 | `Tipo de cerradura inválido.` |

Los nombres van a `lib/domain/constants.ts` como constantes exportadas, siguiendo el patrón que ya estableció la Fase 1.

**Y falta un mapa aparte: `mapAuthError()`.** `mapDbError` conmuta sobre códigos de Postgres; los errores de GoTrue son `AuthError` con `status` HTTP y un `code` propio. Medidos en esta sesión:

| `code` | `status` | Cuándo | Mensaje (UI-SPEC §15) |
|---|---|---|---|
| `invalid_credentials` | 400 | Password mala **o** email inexistente — idéntico en ambos casos, sin enumeración | `Email o contraseña incorrectos.` |
| `user_banned` | 400 | Cuenta desactivada (ver §8.4, hay una nota de seguridad) | `Tu cuenta está desactivada. Contacta al administrador.` |
| `email_exists` | 422 | `createUser` con email ya registrado | `Ya existe una cuenta con ese email.` |
| `over_request_rate_limit` | 429 | `[auth.rate_limit] sign_in_sign_ups = 30` / 5 min / IP | `Demasiados intentos. Espera unos minutos.` |

### 5.5 Cómo la Server Action devuelve el error a la forma

```ts
export type ResultadoAccion =
  | { ok: true; mensaje: string }
  | { ok: false; error: string; campo?: string };   // `campo` → inline; sin él → toast
```

El enrutamiento de UI-SPEC §9.4 se implementa así: si `campo` viene, `setError(campo, { message: error })` de RHF y se pinta inline; si no, `toast.error(error)` y **el formulario conserva todo lo escrito** (que es gratis con RHF, porque el estado vive en el cliente). Para asignar `campo` a partir de un 23505/23514, se mapea del nombre del constraint a la clave del formulario en la misma tabla de §5.4.

---

## 6. Alta y baja de cuentas de aseador

### 6.1 Alta (ASEADOR-01)

```ts
'use server';
import 'server-only';
import { randomBytes } from 'node:crypto';
import { exigirAdmin } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';

export async function crearAseador(_prev: unknown, formData: FormData) {
  await exigirAdmin();                                  // 1. guard PRIMERO
  const datos = esquemaCrearAseador.parse(…);           // 2. Zod (contraseña min 12)
  const admin = createAdminClient();                    // 3. solo entonces service_role

  const { data, error } = await admin.auth.admin.createUser({
    email: datos.email,
    password: datos.password,
    email_confirm: true,
    user_metadata: { role: 'aseador', full_name: datos.nombre, phone: datos.telefono },
    app_metadata:  { role: 'aseador' },                 // ← lo que lee el middleware
  });
  if (error) return { ok: false, error: mapAuthError(error) };
  // El trigger on_auth_user_created ya materializó public.profiles. Medido.
  return { ok: true, email: datos.email, password: datos.password };   // se muestra UNA vez
}
```

Hechos medidos que cambian la implementación:

- **El trigger funciona.** Tras `createUser`, `public.profiles` sale con `role: 'aseador'`, `full_name: 'Probe Aseador'`, `phone: '3001234567'`, `is_active: true`, `deactivated_at: null`. **No hay que insertar el perfil a mano.** [VERIFIED]
- **`auth.admin.createUser` NO valida `minimum_password_length`.** Se creó una cuenta con una contraseña de 8 caracteres pese a `minimum_password_length = 12` en `config.toml`. El límite lo aplica el flujo de *signup*, no la Admin API. **La validación de 12 caracteres es responsabilidad del Zod de la action.** [VERIFIED: medido en esta sesión]
- **Email duplicado:** `422 email_exists`. [VERIFIED]

**Generación y entrega de la contraseña de una sola vez.** Reglas:

1. **Se genera en el servidor**, con `crypto.randomBytes`. `Math.random()` no es aceptable para una credencial que abre 39 apartamentos.
2. **Nunca se persiste** en `profiles`, ni en un log, ni en `notifications`. Existe en memoria durante la ejecución de la action, viaja en la respuesta de la action y muere ahí.
3. **Se devuelve en el valor de retorno del Server Action** — no en la URL (queda en el historial y en los logs del CDN), no en una cookie, no en un `redirect` con query param.
4. El `DialogoCrearAseador` **no se cierra** al tener éxito: pasa al estado de entrega de UI-SPEC §11.2, con dos botones `Copiar` (`navigator.clipboard.writeText`, icono a `Check` 1.5 s, `aria-live="polite"`).
5. **Botón `Generar`** en el formulario: llama a una action mínima que devuelve una contraseña nueva, o genera en cliente **solo para previsualización** y deja que el servidor la regenere. Lo simple y correcto: un Server Action `generarPassword()` que devuelve el string; el campo es de solo lectura.
6. Formato del UI-SPEC: `Xk4m-92pT-vLq` (13 caracteres, cumple los 12). Un alfabeto sin caracteres ambiguos (`0/O`, `1/l/I`) reduce los errores de dictado por teléfono, que es exactamente cómo se va a entregar.
7. **No hay recuperación de contraseña en esta fase** (deuda 4 del UI-SPEC). Si el aseador la pierde, el admin usa `updateUserById(uid, { password })`. Eso **no está en el alcance de esta fase** y no se debe construir sin que alguien lo pida — pero conviene saber que existe la salida.

### 6.2 Baja (ASEADOR-02, PLAT-04) — la corrección más importante de este documento

**`auth.admin.signOut(id, 'global')` no existe con esa firma.** El `.d.ts` de `@supabase/auth-js` declara:

```ts
signOut(jwt: string, scope?: SignOutScope): Promise<{ data: null; error: AuthError | null }>
```

y la implementación hace `POST ${url}/logout?scope=${scope}` **con el JWT del usuario como bearer**. El admin que desactiva a otra persona **no tiene su JWT**. `research/ARCHITECTURE.md` y `02-CONTEXT.md` documentan una API que no existe. [VERIFIED: `.d.ts` + `.js` de `@supabase/auth-js` en `node_modules`]

Prueba adicional: al llamarlo con el JWT del propio aseador después de banearlo, devuelve `403 User is banned`. Es decir, incluso teniendo el JWT, **el orden importa**: `signOut` antes que `ban`, o directamente no llamarlo.

**Lo que sí revoca, medido de punta a punta:**

```
1. update profiles set is_active=false, deactivated_at=now()   → RLS: 0 filas, YA
2. admin.auth.admin.updateUserById(uid, { ban_duration: '876000h' })
   → mismo access token SIN expirar:
        getUser()        : 403 user_banned "User is banned"
        refreshSession() : 400 user_banned "Invalid Refresh Token: User Banned"
        signIn de nuevo  : 400 user_banned "User is banned"
```
[VERIFIED: medido en esta sesión]

**Qué hace instantánea la desactivación, y por qué hacen falta las dos capas:**

| Capa | Efecto | Latencia |
|---|---|---|
| `profiles.is_active = false` | `private.is_active_cleaner()` devuelve `false` ⇒ **toda** policy del aseador deja de casar ⇒ 0 filas en cualquier consulta, aunque el token siga vivo | **Inmediata**, en la siguiente sentencia SQL. Es la única capa que de verdad revoca datos |
| `ban_duration` | `getUser()` del middleware pasa a 403 ⇒ redirección a `/login` | En la siguiente navegación. Es lo que hace que el aseador **vea** que perdió el acceso |

Sin la capa 1, un token vivo seguiría leyendo datos hasta 30 minutos. Sin la capa 2, el aseador se quedaría mirando una pantalla vacía sin entender por qué. **Ninguna de las dos sobra.**

**La trampa de la reactivación, medida:**

```
reactivar solo profiles.is_active=true  → login: ERR user_banned   ← el aseador NO puede entrar
levantar también el ban ('none')        → login: OK
```
[VERIFIED]

`02-UI-SPEC.md` §11.3 dice que reactivar es "una acción normal, sin confirmación". Correcto, pero **son dos operaciones**: `profiles` (`is_active=true`, `deactivated_at=null`, que el CHECK `profiles_deactivation_coherent` obliga a mover juntos) **y** `updateUserById(uid, { ban_duration: 'none' })`. Olvidar la segunda produce un bug silencioso donde la lista dice "Activo" y la persona no puede entrar.

**Recomendación operativa:** escribir la baja y el alta como **una sola función de dominio con un `activo: boolean`**, para que las dos operaciones no se puedan separar. Y una prueba que ejerza el ciclo completo desactivar → intentar entrar → reactivar → entrar.

**Consecuencias calculadas del diálogo (UI-SPEC §11.3):** dos `count` sobre `properties` (`responsable_id = uid`, `suplente_id = uid`) más un tercero filtrando `is_active`, consultados al **abrir** el diálogo. `properties` es legible por el admin con su propio JWT (medido: 39 filas). No hace falta el cliente admin.

### 6.3 El guardarraíl de CI ya cubre esto, con una advertencia

`scripts/ci/check-service-role.sh` hace grep de `SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|sb_secret_` en `app/`, `lib/`, `components/` y falla si aparece fuera de `lib/supabase/admin.ts`.

**Lo que NO cubre:** el grep busca el nombre de la **variable de entorno**, no el **import de `createAdminClient`**. Nada impide hoy que `app/(admin)/apartamentos/page.tsx` haga `import { createAdminClient } from '@/lib/supabase/admin'`. `import 'server-only'` tampoco lo impide: rompe solo si el importador es un Client Component.

**Recomendación:** añadir un guardarraíl 5 al script — `createAdminClient` solo puede importarse desde archivos marcados como Server Action (`'use server'`) o desde `app/api/`. Es cinco líneas de grep y cierra el hueco que el propio comentario de `admin.ts` describe.

**Regla del `deferred-items.md` recordada:** un comentario que cite literalmente el token prohibido hace fallar el grep que lo prohíbe. Pasó dos veces en la Fase 1. Al escribir comentarios sobre la clave de servicio, no escribir su nombre literal.

---

## 7. Estrategia de pruebas de esta fase

La Fase 1 dejó pgTAP para la base (47 aserciones, 5 archivos). Esta fase es UI y no toca el schema, así que pgTAP **no crece**. Lo que hace falta son tres capas nuevas.

### 7.1 Vitest — lo puro, que es donde está la lógica

`vitest.config.ts` ya tiene `include: ['lib/**/*.test.ts']`, `environment: 'node'` y `TZ: 'UTC'`. **No hay que tocarlo si toda la lógica vive en `lib/`.** Eso es un argumento para poner ahí las derivaciones, no un accidente.

| Archivo | Qué prueba |
|---|---|
| `lib/domain/properties.test.ts` | `estadoDeApartamento()`: los 4 estados de UI-SPEC §5 con sus 4 combinaciones de `gestion_vivaguest`/`is_active`/campos nulos, incluida la frontera Incompleta ↔ Inactiva |
| `lib/domain/apartamento.schema.test.ts` | `esquemaBorrador` acepta lo mínimo; `esquemaActivar` rechaza cada combinación incompleta; `faltantesParaActivar()` da la lista exacta en los 4 escenarios (gestionada completa/incompleta, informativa con/sin contacto) |
| `lib/domain/money.test.ts` | `formatCOP`: `120000 → "$ 120.000"`, `null → "—"`, `0 → "$ 0"`, sin decimales nunca |
| `lib/domain/dates.test.ts` | `formatFechaBog('2026-09-04') → "jue, 4 de septiembre"` **con `TZ=UTC`**. Es el test que atrapa un `new Date('2026-09-04')` colado |
| `lib/domain/ical-preview.test.ts` | Fixtures sintéticas: caso feliz, `DESCRIPTION` folded, HTML con 200, `VCALENDAR` vacío, todo bloqueos, todo pasado, `DTEND` a fin de año (`20251229→20260103`) |
| `lib/auth/routing.test.ts` | Tabla de casos de `resolverRedireccion()` |

**Recomendación explícita: no añadir jsdom ni `@vitejs/plugin-react` en esta fase.** Los tests de componente con Base UI (portales, foco atrapado, `data-*` en vez de `aria-*`) son caros de escribir y frágiles; Playwright cubre lo mismo contra el navegador real. Si algún componente resulta difícil de probar, la señal correcta es extraer su lógica a `lib/domain/`.

### 7.2 Cómo probar que un Server Action rechaza a un llamador no autorizado

**Primero, por qué el camino obvio no sirve.** Invocar un Server Action por HTTP crudo requiere el header `Next-Action` con un ID que Next genera en **build time** (un hash), y Next 15 además compara `Origin` contra `Host`. Un test que lo intente es frágil (se rompe con cada build) y prueba el framework, no el código. [CITED: nextjs.org/docs/app/guides/data-security — allowed origins y action IDs; resumen]

**Segundo, cuál es la frontera de verdad.** `02-CONTEXT.md` lo bloquea: *"La RLS es la única autorización real."* Así que la pregunta correcta no es "¿el guard rechaza?" sino "**¿qué pasa si el guard falla?**". Respuesta: no pasa nada, porque la RLS deniega. Y eso **sí** se prueba, contra la base real.

Tres capas, en orden de coste:

**(a) Unitaria del guard.** `lib/auth/guards.test.ts` con el cliente de Supabase stubbeado: sin usuario → `NoAutorizado`; `app_metadata.role = 'aseador'` → `NoAutorizado`; `'admin'` → pasa. Rápido, cubre la lógica.

**(b) Integración contra el stack local — la que importa.** Un proyecto de Vitest aparte (`lib/**/*.integration.test.ts`, `testTimeout` alto, `npm run test:integration`, **fuera** del `test:unit` que corre en CI sin Docker). Patrón ya validado en esta sesión con `probe2.mjs`:

```ts
// crea admin y aseador con service_role, hace login real de cada uno,
// y consulta con el JWT de cada uno vía global.headers.Authorization
const cliente = (token: string) => createClient<Database>(URL, PUB, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { Authorization: `Bearer ${token}` } },
});

test('un aseador no puede escribir properties', async () => {
  const { data, error } = await cliente(tokenAseador)
    .from('properties').update({ nombre: 'hack' }).eq('id', pid).select();
  expect(error).toBeNull();      // sin error…
  expect(data).toHaveLength(0);  // …pero 0 filas. La policy no casa: no hay nada que actualizar
});

test('ni siquiera el admin lee property_secrets con su propio JWT', async () => {
  const { error } = await cliente(tokenAdmin).from('property_secrets').select('ical_url');
  expect(error?.code).toBe('42501');
});
```

Resultados ya medidos con este patrón: `[aseador] properties: 0 filas`, `[aseador] profiles: 1 fila` (la propia), `[aseador] update properties: 0 filas afectadas`, `[admin] property_secrets: 42501`, `[admin] properties: 39 filas`. [VERIFIED]

**(c) Playwright**, para el recorrido completo. Ver 7.3.

### 7.3 Playwright — los 6 criterios del ROADMAP

`@playwright/test@1.62.1` como devDependency. Configuración mínima:

```ts
// playwright.config.ts
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://127.0.0.1:3000', locale: 'es-CO', timezoneId: 'America/Bogota' },
  webServer: { command: 'npm run build && npm run start', url: 'http://127.0.0.1:3000',
               reuseExistingServer: !process.env.CI },
  projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }],
});
```

Notas:
- **`next build && next start`, no `next dev`.** La sesión, las cookies y el middleware se comportan como en producción. En dev hay recompilaciones que producen flakiness.
- **Un `globalSetup`** que crea con `service_role` un admin y dos aseadores deterministas (emails `e2e.*`), y los borra al final. Nada de depender del estado que dejó otro test.
- **`storageState`** por rol, para no repetir el login en cada test salvo en el que prueba el login.
- **Sin mock de Airbnb en Playwright**: para APTO-12 se levanta un servidor HTTP local que sirve las fixtures `.ics`. Pero el host `airbnb.com` está en la allowlist de Zod, así que el test se hace con `page.route()` interceptando… **no funciona: el fetch es del servidor, no del navegador.** Solución: la allowlist de hosts sale de una constante que en `NODE_ENV !== 'production'` admite `127.0.0.1`. Documentarlo en el código como concesión de testeabilidad, con el `NODE_ENV` como candado.

### 7.4 Cómo probar el ruteo del middleware

Dos niveles, y el barato es el que atrapa los bugs:

- **Vitest sobre `resolverRedireccion()`** (§2.3). Tabla de ~12 casos: sin rol en ruta protegida, sin rol en `/login`, admin en `/mis-aseos`, aseador en `/apartamentos`, cada rol en `/`, cada rol en su propia zona. Milisegundos, sin navegador.
- **Playwright para el cableado**, 4 casos: `/apartamentos` sin sesión → `/login`; login admin → `/apartamentos`; login aseador → `/mis-aseos`; aseador navega a `/apartamentos` → rebota a `/mis-aseos`.

Y una prueba que no se puede omitir, porque es el criterio 1 del ROADMAP: **la sesión persiste entre recargas.** `page.reload()` tras el login y comprobar que no rebota a `/login`. Es el test que atrapa el `setAll` mal implementado y el `NextResponse` reconstruido sin cookies.

---

## 8. Lo que hay en el repo y va a morder

Ordenado por cuánto duele descubrirlo tarde.

### 8.1 BLOQUEANTE: el login por email está apagado

`supabase/config.toml` línea 226:
```toml
[auth.email]
# VivaGuest: mismo motivo que [auth] enable_signup; ninguna ruta de auto-registro queda abierta.
enable_signup = false
```

Medido: `signInWithPassword` devuelve **`Email logins are disabled`**. Y el contenedor de auth confirma la causa:

```
GOTRUE_EXTERNAL_EMAIL_ENABLED = false     ← lo pone [auth.email] enable_signup
GOTRUE_DISABLE_SIGNUP         = true      ← lo pone [auth] enable_signup
```
[VERIFIED: `docker exec supabase_auth_vivaguest env`, medido en esta sesión]

La CLI mapea `[auth.email] enable_signup` a **`GOTRUE_EXTERNAL_EMAIL_ENABLED`**, que es el interruptor del **proveedor** de email entero, no el del auto-registro. El comentario de la Fase 1 razona sobre lo que la clave parece significar, no sobre lo que hace. El auto-registro ya lo bloquea la clave *global*.

**Arreglo, verificado por flip y re-medición:**
```toml
[auth]
enable_signup = false          # ← se queda: GOTRUE_DISABLE_SIGNUP=true, sin auto-registro

[auth.email]
enable_signup = true           # ← habilita el PROVEEDOR de email. No abre el registro.
```
Tras el cambio: `GOTRUE_EXTERNAL_EMAIL_ENABLED=true`, `GOTRUE_DISABLE_SIGNUP=true`, y `signInWithPassword` → `OK`. [VERIFIED: medido en esta sesión y revertido; `supabase/config.toml` quedó como estaba]

**Equivalente en el proyecto hosted**, cuando exista: Authentication → Providers → Email → *Enabled* = ON, y Authentication → Sign In / Providers → *Allow new users to sign up* = OFF. [ASSUMED — no verificado contra un proyecto hosted; requiere confirmación en el checkpoint de link]

**Debe ser la primera tarea de la fase.** Sin esto, PLAT-01 y PLAT-02 son inalcanzables y el criterio de éxito 1 del ROADMAP no se puede demostrar.

### 8.2 `app/layout.tsx` — dos bugs que `shadcn init` NO arregla

Medido: `diff` vacío tras el init. Sobreviven:
```tsx
export const metadata: Metadata = {
  title: "Create Next App",                    // → "VivaGuest"
  description: "Generated by create next app", // → descripción real
};
<html lang="en">                                // → lang="es"  (UI-SPEC §13)
```

Además hay que añadir: `<Toaster />` de `components/ui/sonner`, y `<TooltipProvider>` (el propio CLI lo recuerda al añadir `tooltip`).

### 8.3 `app/globals.css` y `app/page.tsx` — boilerplate vivo

- **`globals.css`:** el bloque `@media (prefers-color-scheme: dark)` desaparece con el init (medido). Bien. Pero el `body { font-family: Arial, Helvetica, sans-serif }` también, y el `--font-sans` queda circular (§3.4a).
- **`app/page.tsx`:** es todavía la landing de `create-next-app`, con `<Image src="/next.svg">` y clases `dark:invert`. **Hay que reemplazarla** por un `redirect('/login')` (el middleware ya manda a la raíz correcta según el rol). Si sobrevive, el grep de hex literales de UI-SPEC §4.3 no la atrapa pero cualquier revisor sí.
- **`public/`:** `next.svg`, `vercel.svg`, etc. Borrarlos. Ahí va a vivir `public/guia-airbnb/`.

### 8.4 `user_banned` sí enumera cuentas — el razonamiento del UI-SPEC §12.1 es incorrecto

El UI-SPEC justifica mostrar `Tu cuenta está desactivada. Contacta al administrador.` así: *"se emite después de validar credenciales, así que no enumera nada"*.

Medido:
```
baneado + contraseña CORRECTA   : 400 user_banned
baneado + contraseña INCORRECTA : 400 user_banned
```
[VERIFIED: medido en esta sesión]

GoTrue devuelve `user_banned` **antes** de verificar la contraseña. Cualquiera que escriba un email de una cuenta desactivada, con cualquier contraseña, obtiene una respuesta distinta a `invalid_credentials`. Eso **sí** es un oráculo de enumeración: revela que ese email existe y está desactivado.

**No es motivo para redisñear.** El riesgo real es bajísimo: herramienta interna, sin registro público, ~10 cuentas, y `[auth.rate_limit] sign_in_sign_ups = 30` por 5 min por IP acota el barrido. **Pero la razón escrita en el contrato es falsa**, y alguien la va a citar más adelante como si fuera un hecho verificado. Queda registrado en §Open Questions para que el usuario decida si el copy se queda o se colapsa al mensaje genérico.

Nota complementaria medida: `invalid_credentials` **sí** es indistinguible entre contraseña mala y email inexistente. Esa parte del contrato es correcta.

### 8.5 El gate `build` del CI se va a caer en cuanto exista `/login`

`ci/db.yml`, job `arquitectura`, corre `npm run build` **sin ninguna variable de entorno**. Hoy pasa porque ninguna página instancia un cliente de Supabase. En cuanto exista `/login` (Client Component que llama `createBrowserClient` → `publicEnv()`), el prerender de build lanzará `Variables de entorno inválidas (cliente): NEXT_PUBLIC_SUPABASE_URL: Invalid url`.

**Arreglo:** inyectar valores placeholder en el paso de build:
```yaml
      - name: build
        env:
          NEXT_PUBLIC_SUPABASE_URL: http://127.0.0.1:54321
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: sb_publishable_ci_placeholder
        run: npm run build
```
Y crear un `.env.example` versionado (el `.gitignore` ignora `.env*`, así que **no hay ningún archivo de entorno en el repo hoy** y nadie sabe qué variables hacen falta). Además, Vercel necesitará las mismas dos variables públicas más `SUPABASE_SECRET_KEY`.

*Recordatorio: `ci/db.yml` sigue en `ci/`, no en `.github/workflows/`. El CI **no corre solo** (deferred de la Fase 1: hace falta un token con scope `workflow`). Todas las puertas hay que correrlas a mano.*

### 8.6 `property_secrets` no tiene grant — medido, y la policy engaña

```
[admin] property_secrets SELECT: ERR 42501 permission denied for table property_secrets
[admin] property_secrets UPSERT: ERR 42501 permission denied for table property_secrets
[admin] properties:              39 filas
[admin] calendar_feeds UPSERT:   OK
```
[VERIFIED: medido en esta sesión]

Existe `create policy secrets_admin_all on public.property_secrets for all to authenticated using (private.is_admin())`, y es **inalcanzable**: la migración 07 nunca otorga privilegios de tabla sobre `property_secrets` a `authenticated`. Es deliberado (`-- Sin ningun grant -> property_secrets, storage_deletion_queue`), pero la policy hace que parezca lo contrario. Un executor que lea las policies y no los grants va a escribir la action con el cliente equivocado y a perder una hora.

**Consecuencia para el plan:** la sección 4 del formulario (`tipo_cerradura`, `codigo_acceso`, `notas_acceso`) y todo APTO-12 escriben con `createAdminClient()`. Y las **lecturas** también: mostrar el código de acceso guardado en el formulario de edición exige el cliente admin.

### 8.7 Toda función nueva en `public` necesita su propio par revoke/grant

Hallazgo 5 de `deferred-items.md`, medido en la Fase 1: `alter default privileges … revoke execute on functions from public` **no funciona** en PG 17.6, porque Postgres fusiona `acldefault('f', owner)` (que siempre trae `=X` de PUBLIC) con el ACL almacenado. Consecuencia: **toda** función nueva de `public` nace ejecutable por `anon`.

Si algún plan de esta fase crea una función en `public` (un RPC para escribir `property_secrets` de forma atómica, por ejemplo), necesita, pegado a la definición:

```sql
revoke all     on function public.<f>(<args>) from public, anon;
grant  execute on function public.<f>(<args>) to authenticated;
```

**Recomendación: esta fase no crea ninguna función en `public`.** Todo el CRUD va por PostgREST con RLS, y `property_secrets` por `service_role`. Es la decisión bloqueada de `02-CONTEXT.md` y además evita este campo minado. Si un plan propone un RPC, ese par de líneas es innegociable y merece una aserción pgTAP propia.

### 8.8 Menores, pero reales

| Cosa | Impacto |
|---|---|
| El repo no tiene ningún `.env*` y `.gitignore` los ignora todos | Nadie sabe qué variables hacen falta. Crear `.env.example` versionado |
| `next.config.ts` está vacío | Si se sirven capturas remotas hará falta `images`. Con WebP local en `public/`, no |
| CLI global `2.115.0` vs pineada `2.116.0` | Usar siempre `npx supabase`. La medición de default ACL del `deferred-items` #3 cambió entre esas dos versiones |
| `vitest.config.ts` tiene `include: ['lib/**/*.test.ts']` | Un test en `app/` o `components/` **no se ejecuta y nadie avisa**. Argumento fuerte para que la lógica viva en `lib/` |
| `properties.cluster` es `text not null`, ni enum ni tabla | El combobox de cluster admite entrada libre (UI-SPEC §8.1). Un typo crea un cluster nuevo silencioso. Normalizar por `trim` y sugerir coincidencias de los 8 existentes |
| Las 39 filas sembradas tienen `tarifa_huesped`/`pago_aseador` en NULL y `is_active = false` | El banner de montaje arranca en `0 de 34`, no en `6 de 34` como el ejemplo del UI-SPEC. Correcto |
| `profiles_deactivation_coherent` obliga a mover `is_active` y `deactivated_at` juntos | Un `update profiles set is_active=false` a secas revienta con 23514. Ambas columnas, siempre |

---

## Don't Hand-Roll

| Problema | No construir | Usar | Por qué |
|---|---|---|---|
| Puente de cookies de sesión SSR | Tu propio `getAll`/`setAll` sobre `document.cookie` | `@supabase/ssr` con la firma de **dos** argumentos | Chunking de cookies grandes, PKCE, rotación de refresh y los headers anti-caché. Ver §1.1 |
| Verificación de un JWT | `jose`/`jsonwebtoken` a mano en el middleware | `getUser()` | El único que detecta revocación (medido) |
| Alta de usuarios | `insert into auth.users` | `auth.admin.createUser` | El hash de contraseña, las identidades y el trigger de `profiles` |
| Revocación de sesión | Borrar filas de `auth.refresh_tokens` | `updateUserById({ ban_duration })` + `profiles.is_active = false` | Medido: la combinación cubre token vivo, refresh y login nuevo |
| Diálogo modal con foco atrapado | `<div role="dialog">` propio | `dialog` / `alert-dialog` de Base UI | Foco atrapado, `Esc`, retorno de foco, `aria-modal`. UI-SPEC §13 lo dice: *"Lo da Base UI; no reimplementarlo"* |
| Combobox con búsqueda | `<input>` + `<ul>` filtrada | `command` (cmdk) | Navegación con teclado, `aria-activedescendant`, anuncio de resultados |
| Estado de formulario con 12 campos + arrays | `useState` por campo | `react-hook-form` + `useFieldArray` | Los arrays dinámicos con `FormData` plana son dolor puro (STACK.md §7) |
| Validación cruzada | Cadena de `if` en el submit | Zod con `.refine()` + `faltantesParaActivar()` compartida | Una fuente para el checklist en vivo, el `disabled` y la validación de envío |
| Formato de dinero COP | `n.toLocaleString()` disperso | `formatCOP` en `lib/domain/money.ts` | `minimumFractionDigits: 0` y `es-CO` en un solo sitio. Repetido, un `Intl` se olvida el `0` y aparecen decimales que no existen |
| Fechas de negocio | `new Date('2026-09-04')` | Partir el string + `Intl.DateTimeFormat` | Se parsea como UTC y en Bogotá muestra el día anterior. PITFALLS §11 y §2 |
| Parseo de iCal (Fase 3) | Regex sobre el cuerpo entero | `node-ical@0.27.1` | Unfolding, `dateOnly`, tipos. **El preview de esta fase es la excepción justificada**: §4.3 |
| Contraseña temporal | `Math.random().toString(36)` | `crypto.randomBytes` | Es una credencial que abre 39 apartamentos |
| Cancelar un fetch por tiempo | `Promise.race` con `setTimeout` | `AbortSignal.timeout(ms)` | Aborta la conexión de verdad; `Promise.race` deja el socket colgando. Medido: `TimeoutError` a los 1207 ms |
| Toasts | `<div>` con `setTimeout` | `sonner` | Cola, `aria-live`, pausa al hover |

**Idea de fondo:** casi todo lo que esta fase podría "resolver a mano" es un problema de accesibilidad o de seguridad disfrazado de problema de UI. El diálogo a mano no tiene foco atrapado, la cookie a mano filtra la sesión, la contraseña a mano es predecible, la fecha a mano se corre un día. Ninguno de los cuatro se ve en una demo.

---

## Common Pitfalls

### Pitfall 1: copiar el ejemplo oficial de middleware de Supabase
**Qué sale mal:** la respuesta que lleva `Set-Cookie` de sesión queda cacheable por el CDN de Vercel y se sirve a otro usuario.
**Por qué pasa:** el ejemplo oficial usa `setAll(cookiesToSet)` de un argumento y **compila sin un solo error de TypeScript**, porque TS permite implementar un tipo de función con menos parámetros. No hay ninguna señal.
**Cómo evitarlo:** copiar el código de §Patrón 1 de este documento, no el de la web. Grep de revisión: `setAll(cookiesToSet)` sin coma en `lib/supabase/middleware.ts`.
**Señales:** un usuario ve datos de otro tras un pico de tráfico. Prácticamente indetectable con 2 usuarios en desarrollo.

### Pitfall 2: usar `getClaims()` porque la doc lo recomienda
**Qué sale mal:** el criterio 4 del ROADMAP falla en silencio. El aseador desactivado sigue navegando hasta 30 minutos.
**Por qué pasa:** la doc oficial de Supabase dice literalmente *"Always use `supabase.auth.getClaims()` to protect pages and user data"*, y es un consejo correcto para el caso general (más rápido con claves asimétricas).
**Cómo evitarlo:** `getUser()`. Medido: tras el ban, `getUser()` da 403 y `getClaims()` da OK.
**Señales:** un test que desactiva un aseador y comprueba en la siguiente navegación pasa en verde solo si el token ya expiró.

### Pitfall 3: llamar `auth.admin.signOut(uid, 'global')`
**Qué sale mal:** no compila, o si se fuerza el tipo, hace un POST con un UUID como bearer y devuelve un error confuso.
**Por qué pasa:** `research/ARCHITECTURE.md` y `02-CONTEXT.md` documentan esa firma. No existe.
**Cómo evitarlo:** `updateUserById(uid, { ban_duration })`. §6.2.
**Señales:** `error.status` 401 en la baja de un aseador.

### Pitfall 4: reactivar solo `profiles.is_active`
**Qué sale mal:** la lista dice "Activo" y el aseador no puede entrar. Medido: `ERR user_banned`.
**Por qué pasa:** la desactivación son dos operaciones y la reactivación también; solo una es visible en la UI.
**Cómo evitarlo:** una función de dominio con `activo: boolean` que haga siempre las dos. Test del ciclo completo.
**Señales:** "me dice que mi cuenta está desactivada" después de que el admin la reactivó.

### Pitfall 5: escribir `property_secrets` con el cliente de usuario
**Qué sale mal:** `42501` al guardar el código de acceso o la URL iCal, aun siendo admin.
**Por qué pasa:** existe una policy `secrets_admin_all` que sugiere que el admin puede. No hay grant.
**Cómo evitarlo:** `createAdminClient()` para esa tabla, siempre, lectura y escritura. Guard admin **antes**.
**Señales:** `permission denied for table property_secrets` en el submit de la sección 4.

### Pitfall 6: `shadcn init` sin `-p`
**Qué sale mal:** el comando se cuelga en un prompt interactivo; en un agente o en CI, cuelga indefinidamente.
**Por qué pasa:** el UI-SPEC dice "preset: ninguno" y no existe esa opción.
**Cómo evitarlo:** `-p nova`. Nunca `-p base-nova` (inválido). Ver §3.1.

### Pitfall 7: mover `shadcn` a devDependencies
**Qué sale mal:** el build de producción falla al resolver `@import "shadcn/tailwind.css"`.
**Por qué pasa:** parece obvio que un CLI es una devDependency, y `research/STACK.md` lo afirma.
**Cómo evitarlo:** dejarlo en `dependencies` con un comentario en el `package.json` o en el commit.
**Señales:** el build local pasa (devDeps instaladas) y el de Vercel no.

### Pitfall 8: añadir `form` esperando `FormField`/`FormMessage`
**Qué sale mal:** el comando "tiene éxito" y no crea archivo. El import falla después.
**Por qué pasa:** el bloque `form` existe en el registry pero sin archivos para el estilo Base UI.
**Cómo evitarlo:** `field`. §3.5.

### Pitfall 9: rutear por `user_metadata.role`
**Qué sale mal:** un aseador se autoenruta al shell del admin. No ve nada (la RLS lo bloquea) pero recibe una pantalla llena de errores.
**Por qué pasa:** el trigger de la Fase 1 lee `raw_user_meta_data`, así que `user_metadata` parece el sitio canónico.
**Cómo evitarlo:** `app_metadata.role`. Escribir el rol en los dos sitios al crear.

### Pitfall 10: `new Date('2026-09-04')` en el "próximo checkout"
**Qué sale mal:** en Bogotá se muestra el 3 de septiembre.
**Por qué pasa:** un string ISO de solo fecha se parsea como medianoche UTC.
**Cómo evitarlo:** las fechas de negocio son strings `'YYYY-MM-DD'`. `formatFechaBog()` parte el string. Test con `TZ=UTC` (ya en `vitest.config.ts`).

### Pitfall 11: guardar un link que devolvió 200 con HTML
**Qué sale mal:** el admin cree que el calendario está conectado. Tres días después no llegó ningún aseo.
**Por qué pasa:** un feed regenerado devuelve una página de error con status 200. Sin el sniff, el parser reporta "0 eventos" y el estado 5 dice "puede ser correcto".
**Cómo evitarlo:** `BEGIN:VCALENDAR` antes de contar → estado 6, que es distinto del 5 y tiene otro copy.
**Señales:** apartamentos con calendario "conectado" y `last_event_count = 0` persistente.

### Pitfall 12: SSRF por redirección en la validación del feed
**Qué sale mal:** el servidor sigue un 302 a un host interno.
**Por qué pasa:** la allowlist de Zod valida la URL que el usuario escribe, no a dónde termina el fetch.
**Cómo evitarlo:** `redirect: 'manual'`. Un 3xx se trata como feed inválido.

### Pitfall 13: un comentario que cite el token que el grep prohíbe
**Qué sale mal:** el guardarraíl de CI falla por su propia documentación. Pasó dos veces en la Fase 1.
**Cómo evitarlo:** al comentar sobre la clave de servicio, no escribir su nombre literal. Regla ya registrada en `deferred-items.md`.

---

## Code Examples

### Login (PLAT-01, PLAT-02) — Server Action

```ts
'use server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { mapAuthError } from '@/lib/domain/errors';

const esquemaLogin = z.object({
  email: z.email('Escribe un email válido'),
  password: z.string().min(1, 'Escribe tu contraseña'),
});

export async function entrar(_prev: unknown, formData: FormData) {
  const parsed = esquemaLogin.safeParse(Object.fromEntries(formData));
  // Un solo mensaje, siempre el mismo: no enumerar usuarios (UI-SPEC §12.1).
  if (!parsed.success) return { ok: false as const, error: 'Email o contraseña incorrectos.' };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { ok: false as const, error: mapAuthError(error) };

  // El middleware decide el destino final a partir de app_metadata.role.
  redirect(data.user.app_metadata?.role === 'admin' ? '/apartamentos' : '/mis-aseos');
}
```

### Guardar la URL iCal validada (APTO-03, APTO-12) — dos clientes en una action

```ts
'use server';
import { exigirAdmin } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';

export async function conectarCalendario(propertyId: string, url: string, preview: PreviewIcs) {
  const { supabase, user } = await exigirAdmin();   // 1. guard SIEMPRE primero

  // 2. La URL es una credencial y no tiene grant para `authenticated`: cliente admin.
  const admin = createAdminClient();
  const { error: e1 } = await admin.from('property_secrets')
    .upsert({ property_id: propertyId, ical_url: url, updated_by: user.id },
            { onConflict: 'property_id' });
  if (e1) return { ok: false as const, error: mapDbError(e1) };

  // 3. La SALUD del feed sí es escribible con el JWT del admin (medido).
  //    NO se escribe calendar_reservations: eso es de la Fase 3.
  const { error: e2 } = await supabase.from('calendar_feeds')
    .upsert({
      property_id: propertyId,
      provider: 'airbnb',
      last_attempt_at: new Date().toISOString(),
      last_success_at: preview.ok ? new Date().toISOString() : null,
      last_http_status: 200,
      last_event_count: preview.ok ? preview.reservas : null,
      consecutive_failures: 0,
      last_error: null,      // NUNCA la URL: es una credencial
    }, { onConflict: 'property_id,provider' });
  if (e2) return { ok: false as const, error: mapDbError(e2) };

  revalidatePath('/apartamentos');
  return { ok: true as const, mensaje: 'Calendario conectado.' };
}
```

### Derivación de estado (UI-SPEC §5) — una sola función

```ts
// lib/domain/properties.ts
import type { Tables } from '@/lib/database.types';

export type EstadoApartamento = 'activa' | 'incompleta' | 'inactiva' | 'informativa';

/**
 * ÚNICA fuente de la derivación. Duplicar este `if` en dos componentes es cómo
 * se desincroniza la UI de los CHECK de la base (UI-SPEC §5).
 */
export function estadoDeApartamento(p: Tables<'properties'>): EstadoApartamento {
  if (!p.gestion_vivaguest) return 'informativa';
  if (p.is_active) return 'activa';
  const incompleto =
    p.tarifa_huesped == null || p.pago_aseador == null || p.responsable_id == null;
  return incompleto ? 'incompleta' : 'inactiva';
}
```

### Buscador insensible a tildes (APTO-11)

```ts
export const normalizar = (s: string) =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
// normalizar('Bogotá 1').includes(normalizar('bogota'))  →  true
```

---

## State of the Art

| Enfoque anterior | Enfoque actual | Cuándo cambió | Impacto en esta fase |
|---|---|---|---|
| `@supabase/auth-helpers-nextjs` | `@supabase/ssr` | 2024 | El paquete viejo está `deprecated`. Cualquier tutorial que lo use es basura |
| `setAll(cookiesToSet)` | `setAll(cookiesToSet, headers)` | `@supabase/ssr` 0.12 | **Los ejemplos oficiales de Supabase todavía no se actualizaron** (verificado hoy en su repo) |
| `getUser()` como recomendación general | `getClaims()` como recomendación general | 2025, con las claves de firma asimétricas | **Este proyecto se queda en `getUser()` a propósito**: `getClaims()` no detecta revocación (medido) |
| `cookies()` síncrono | `cookies()` async | Next 15 | `await cookies()` antes de construir el cliente |
| Radix como base de shadcn | **Base UI** (`@base-ui/react`) | julio 2026, default de shadcn | `form` desaparece → `field`; los primitivos exponen `name`/`inputRef` |
| `--base-color` en `shadcn init` | `-b base\|radix\|aria` + `-p <preset>` | shadcn 4.x | El equivalente de `--base-color` vive en `shadcn migrate base-color` |
| `shadcn` como devDependency | `shadcn` como **dependency** | shadcn 4.19 con `@import "shadcn/tailwind.css"` | Contradice `research/STACK.md` |
| `tailwind.config.js` | `@theme` en CSS | Tailwind v4 | No se crea ningún `tailwind.config.js` |
| `claves anon` / `service_role` | `sb_publishable_` / `sb_secret_` | deprecación anunciada para fin de 2026 | El repo ya usa la nomenclatura nueva en `lib/env.ts` |
| Middleware como frontera de seguridad | Middleware como conveniencia | CVE-2025-29927, marzo 2025 | Next 15.5.24 ya está parcheado, pero la lección se mantiene: RLS es la frontera |

**Deprecado / caducado, para que nadie lo reintroduzca:**
- `@supabase/auth-helpers-nextjs` — `@supabase/ssr` exporta `warnIfUsingDeprecatedAuthHelpersPackage` para gritarlo.
- `shadcn-ui` (paquete npm) — el nombre viejo del CLI.
- Cualquier tutorial de Tailwind v3 con `tailwind.config.js`.
- `getSession()` en servidor.
- La firma de `setAll` de un argumento, incluida la que aparece en los ejemplos oficiales de Supabase.

---

## Runtime State Inventory

No aplica: esta fase no es un rename, refactor ni migración. Es construcción sobre un schema estable.

Lo único que se acerca al concepto es la **configuración viva de Supabase Auth** (§8.1): el interruptor del proveedor de email vive en `supabase/config.toml` para local, pero en el proyecto hosted vive en el dashboard y **no** está en git. Cuando el proyecto hosted exista, ese ajuste hay que replicarlo a mano. Queda anotado como riesgo de deriva local↔nube.

---

## Environment Availability

| Dependencia | Requerida por | Disponible | Versión | Fallback |
|---|---|---|---|---|
| Docker | Stack local de Supabase | ✓ | daemon activo | — |
| Supabase CLI (proyecto) | Migraciones, pgTAP, typegen | ✓ | `2.116.0` (devDep) | — |
| Supabase CLI (global) | — | ✓ | `2.115.0` | Usar siempre `npx supabase` |
| Stack local levantado | Tests de integración, dev | ✓ | Levantado y verificado en esta sesión: 10 migraciones + 6 seeds, 39 apartamentos | — |
| Node.js | Todo | ✓ | v25.6.1 local; CI usa 22 | — |
| npm registry | Instalar shadcn, RHF, Playwright | ✓ | — | — |
| Navegadores de Playwright | E2E | ✗ | — | `npx playwright install --with-deps chromium` |
| Proyecto Supabase hosted | Deploy, verificación en la nube | ✗ | — | Todo local. Checkpoint abierto de la Fase 1 |
| GitHub Actions | Puertas de CI | ✗ | `ci/db.yml` no está en `.github/workflows/` | Correr las 8 puertas a mano |
| Feed `.ics` real de Airbnb | Prueba de humo de APTO-12; bloqueante de la Fase 3 | ✗ | — | Fixtures sintéticas (§4.4) + `checkpoint:human-verify` |
| Capturas de la UI de Airbnb | `public/guia-airbnb/` | ✗ | — | Guía solo con texto. UI-SPEC §10.1 lo autoriza |
| `slopcheck` | Auditoría de paquetes | ✗ | — | Auditoría manual, ya hecha |
| Cuenta de Vercel | Deploy | desconocido | — | No es necesaria para cerrar la fase |

**Faltantes sin fallback (bloquean):** ninguno para el desarrollo. El proyecto hosted bloquea la *verificación en la nube*, no la fase.

**Faltantes con fallback:**
- El `.ics` real → fixtures sintéticas + checkpoint humano final.
- Las capturas → guía solo con texto, sin recortar la validación.
- Playwright → un comando de instalación.

---

## Validation Architecture

### Test Framework

| Propiedad | Valor |
|---|---|
| Unitario | `vitest@4.1.11` — config existente: `environment: 'node'`, `include: ['lib/**/*.test.ts']`, `env: { TZ: 'UTC' }` |
| Integración (RLS con JWT real) | `vitest` con proyecto aparte, `include: ['lib/**/*.integration.test.ts']`. Requiere `supabase start`. **Fuera de `test:unit`** |
| E2E | `@playwright/test@1.62.1` — **a instalar**. `webServer: next build && next start` |
| Base de datos | `supabase test db --local` (pgTAP). **No crece en esta fase**: no hay cambios de schema |
| Arquitectura | `scripts/ci/check-service-role.sh` — **a ampliar** con el guardarraíl 5 (importadores de `createAdminClient`) y el grep de hex literales de UI-SPEC §4.3 |
| Comando rápido (por commit) | `npm run test:unit && npx tsc --noEmit && npm run ci:arch` |
| Comando completo (por wave) | `npm run test:unit && npm run test:integration && npx playwright test && npm run db:test && npm run build` |

### Los 6 criterios de éxito del ROADMAP → verificación mecánica

**Criterio 1 — Admin y aseador inician sesión y aterrizan cada uno en su superficie, con la sesión persistiendo entre recargas**

| Aserción | Herramienta | Comando / archivo |
|---|---|---|
| El proveedor de email está habilitado | Vitest de integración | `signInWithPassword` con un usuario semilla devuelve `error === null`. **Falla hoy con `Email logins are disabled`** |
| Admin autenticado aterriza en `/apartamentos` | Playwright | `e2e/login.spec.ts` → `await expect(page).toHaveURL('/apartamentos')` |
| Aseador autenticado aterriza en `/mis-aseos` | Playwright | idem |
| **La sesión sobrevive a la recarga** | Playwright | `await page.reload(); await expect(page).toHaveURL('/apartamentos')`. Es el test que atrapa el `setAll` mal implementado |
| El aseador que navega a `/apartamentos` rebota a `/mis-aseos` | Playwright | `e2e/ruteo.spec.ts` |
| Tabla de decisión del ruteo | Vitest | `lib/auth/routing.test.ts`, ~12 casos sobre `resolverRedireccion()` |
| Credenciales malas dan siempre el mismo mensaje | Vitest de integración | `mapAuthError` sobre `invalid_credentials` con email inexistente y con contraseña mala → misma cadena |

**Criterio 2 — El admin crea, edita, activa y desactiva apartamentos con los 12 campos**

| Aserción | Herramienta | Comando / archivo |
|---|---|---|
| Crear borrador solo con `nombre` + `cluster` persiste con `is_active = false` | Playwright + Vitest integración | `e2e/apartamento-crud.spec.ts`; consulta posterior con el JWT del admin |
| Los 12 campos se guardan y se releen | Playwright | Llenar, guardar, recargar, comparar valores |
| `hora_limite` arranca en `11:30` | Vitest | `defaultValues` del esquema |
| `codigo_acceso`, `tipo_cerradura`, `notas_acceso` e `ical_url` se persisten en `property_secrets` | Vitest integración | Lectura con `createAdminClient` tras el guardado. **Y** que el mismo `select` con el JWT del admin dé `42501` |
| Cuartos y faltantes con `useFieldArray` | Playwright | Añadir 2 cuartos, quitar 1, guardar, recargar |
| Etiqueta de cuarto duplicada se bloquea en cliente | Vitest | Esquema Zod del array |
| Desactivar deja `is_active = false` sin tocar aseos | Vitest integración | La tabla `cleanings` está vacía en esta fase; se asserta que el update solo afecta `properties` |

**Criterio 3 — El sistema impide activar sin tarifas, exige responsable si `gestion_vivaguest`, contacto externo si no**

| Aserción | Herramienta | Comando / archivo |
|---|---|---|
| `esquemaActivar` rechaza cada carencia | Vitest | `lib/domain/apartamento.schema.test.ts` — 4 casos gestionada + 1 informativa |
| `faltantesParaActivar()` devuelve la lista exacta | Vitest | Mismo archivo. Es lo que pinta la UI y lo que apaga el botón |
| `Guardar y activar` está deshabilitado con datos incompletos | Playwright | `await expect(page.getByRole('button', { name: 'Guardar y activar' })).toBeDisabled()` |
| Al completar el último faltante el botón se habilita | Playwright | Prueba de la reactividad de `watch()` |
| **La base es la red de seguridad**: activar sin tarifas por API directa da 23514 | Vitest integración | Medido hoy: `props_active_requires_owner`. Se assertea `error.code === '23514'`, **no** el nombre del constraint (el orden no está garantizado) |
| `mapDbError` traduce los 4 CHECK de `properties` | Vitest | `lib/domain/errors.test.ts`, ampliando el existente |
| La puerta de UI de `contacto_externo` (sin respaldo en base) funciona | Playwright | Unidad informativa sin contacto → botón deshabilitado. **La base la dejaría pasar**: es una aserción solo de UI |

**Criterio 4 — El admin crea y desactiva cuentas, y el aseador desactivado pierde el acceso de inmediato**

| Aserción | Herramienta | Comando / archivo |
|---|---|---|
| No hay auto-registro | Vitest integración | `supabase.auth.signUp()` con la publishable key falla (`GOTRUE_DISABLE_SIGNUP=true`) |
| `createUser` materializa `profiles` con `role='aseador'` y `is_active=true` | Vitest integración | Medido hoy |
| La contraseña generada tiene ≥ 12 caracteres y es criptográfica | Vitest | Sobre el generador. **Necesario porque la Admin API NO valida la longitud** (medido) |
| La contraseña no se persiste en ningún sitio | Vitest integración | `select *` sobre `profiles` no contiene la cadena |
| **Token vivo + desactivación ⇒ 0 filas** | Vitest integración | El test central de PLAT-04: login, guardar el token, `is_active=false`, consultar `properties` con **el mismo token** → `data.length === 0` |
| **Token vivo + ban ⇒ `getUser()` 403** | Vitest integración | `error.code === 'user_banned'`. Medido hoy |
| El refresh también falla | Vitest integración | `refreshSession()` → `user_banned` |
| **La reactivación exige las dos operaciones** | Vitest integración | Reactivar solo `profiles` → login falla; levantar el ban → login OK. Medido hoy |
| El aseador desactivado con sesión abierta rebota a `/login` | Playwright | Login, desactivar por API con `service_role`, `page.reload()` → `/login` |
| Los conteos del diálogo se consultan, no se estiman | Playwright | Sembrar 3 apartamentos con ese responsable y comprobar que el diálogo dice `3` |

**Criterio 5 — El admin encuentra cualquiera de las 39 unidades y ve la lista de aseadores con sus asignaciones**

| Aserción | Herramienta | Comando / archivo |
|---|---|---|
| La tabla renderiza 39 filas sin paginación | Playwright | `await expect(page.getByRole('row')).toHaveCount(40)` (39 + encabezado) |
| El pie dice `39 unidades · 34 gestionadas · 5 informativas` | Playwright | Texto exacto. Verifica también la integridad del seed |
| El buscador ignora tildes | Vitest | `normalizar()`: `bogota` encuentra `Bogotá 1` |
| Filtrar reduce el conteo y muestra `Mostrando N de 39` | Playwright | |
| Búsqueda sin resultados muestra el copy de UI-SPEC §9.2 | Playwright | Texto exacto, incluidas las comillas angulares |
| Los 4 estados se derivan bien | Vitest | `estadoDeApartamento()`: 4 casos + la frontera Incompleta/Inactiva |
| Cada estado se pinta con icono **y** etiqueta, no solo color | Playwright | Que el texto `Activa`/`Incompleta`/`Inactiva`/`Informativa` esté presente en el DOM |
| La lista de aseadores muestra `Responsable de` y `Suplente en` con conteos reales | Playwright + Vitest integración | Sembrar asignaciones conocidas y comparar |
| Un aseador desactivado sigue en la lista, marcado `Inactivo` | Playwright | UI-SPEC §11.1 |

**Criterio 6 — Al conectar el calendario, el admin ve la guía y, al pegar el link, que el feed sirve, cuántas reservas trajo y el próximo checkout**

| Aserción | Herramienta | Comando / archivo |
|---|---|---|
| URL con formato inválido se rechaza **sin red** | Vitest | Esquema Zod: protocolo, host `airbnb.com`/`airbnb.com.co`, path `/calendar/ical/`, extensión `.ics` |
| Caso feliz: cuenta reservas y calcula el próximo checkout | Vitest | `ical-preview.test.ts`. **Medido hoy con el prototipo:** 3 eventos → 2 reservas, 1 bloqueo, `proximoCheckout: '2026-09-04'` |
| **Los bloqueos del propietario no cuentan como reservas** | Vitest | Fixture con `Airbnb (Not available)` sin `DESCRIPTION` |
| La `DESCRIPTION` folded a 75 octetos no parte el código | Vitest | Medido hoy: `desdoblar()` reconstruye `details/HMYXB825YD` |
| **`DTEND` es el día del aseo, sin restar ni sumar** | Vitest | Reserva de 1 noche: `DTSTART 20260903`, `DTEND 20260904` → checkout `2026-09-04`. Corre con `TZ=UTC` |
| HTTP 200 con HTML → estado 6, no estado 5 | Vitest | Medido hoy: `{ ok: false, motivo: 'no-es-ical' }` |
| `VCALENDAR` vacío → estado 5, no error | Vitest | Medido hoy: `{ ok:true, totalEventos:0, proximoCheckout:null }` |
| Timeout duro de 10 s | Vitest | `AbortSignal.timeout` → `TimeoutError`. Medido hoy a 1207 ms con umbral 1200 |
| Copy distinto por 404 / 403 / 5xx / timeout | Vitest | Tabla de UI-SPEC §10.3 estado 7 |
| El número y la fecha se renderizan en Display 24/600 | Playwright | Que existan en el DOM con el peso correcto. Sin ellos, APTO-12 no se cumplió |
| **No se escribe `calendar_reservations` ni `cleanings`** | Vitest integración | `count` de ambas tablas antes y después de conectar → igual. **La aserción que mantiene la costura con la Fase 3** |
| La URL guardada se muestra enmascarada | Playwright | El `.ics?s=…` completo **no** aparece en el DOM sin pulsar `Mostrar` |
| Un 3xx no se sigue | Vitest | Servidor local que responde 302 → se clasifica como feed inalcanzable |
| Prueba de humo contra un feed real | **`checkpoint:human-verify`** | No automatizable sin el `.ics` real. Pegar un link real, contrastar el número contra Airbnb |

### Frecuencia de muestreo

- **Por commit de tarea:** `npm run test:unit && npx tsc --noEmit && npm run ci:arch` (segundos, sin Docker).
- **Por merge de wave:** + `npm run test:integration` (exige `supabase start`) + `npm run build`.
- **Puerta de fase, antes de `/gsd:verify-work`:** todo lo anterior + `npx playwright test` + `npm run db:test` + `npm run db:types:check`. Las 8 puertas de `ci/db.yml` a mano, en el orden del workflow.

### Huecos de Wave 0

- [ ] **`supabase/config.toml`: `[auth.email] enable_signup = true`** — sin esto ningún test de login puede pasar. Cubre PLAT-01, PLAT-02
- [ ] `.env.local` + `.env.example` versionado con las 3 variables
- [ ] `ci/db.yml`: env de build en el job `arquitectura` (§8.5)
- [ ] `shadcn init -p nova` + los 22 bloques (`field`, no `form`) + los 4 arreglos de §3.4 + la capa de tokens de UI-SPEC §4.3
- [ ] `app/layout.tsx`: `lang="es"`, metadata, `<Toaster/>`, `<TooltipProvider>`
- [ ] `app/page.tsx`: reemplazar el boilerplate por `redirect('/login')`; limpiar `public/`
- [ ] `lib/domain/constants.ts` + `errors.ts`: los 10 constraints nuevos y `mapAuthError()`
- [ ] `lib/auth/routing.ts` puro + su test (habilita el criterio 1 antes de que exista una pantalla)
- [ ] `lib/domain/ical-preview.ts` + fixtures sintéticas (habilita el criterio 6 sin el `.ics` real)
- [ ] `scripts/ci/check-service-role.sh`: guardarraíl 5 (importadores de `createAdminClient`) y grep de hex literales
- [ ] `@playwright/test` + `npx playwright install chromium` + `playwright.config.ts` + `globalSetup` con usuarios semilla
- [ ] Proyecto de Vitest de integración separado + `npm run test:integration`

---

## Security Domain

### Categorías ASVS aplicables

| Categoría ASVS | Aplica | Control estándar |
|---|---|---|
| **V2 Authentication** | sí | Supabase Auth (GoTrue) email+password. Sin auto-registro (`GOTRUE_DISABLE_SIGNUP=true`). `minimum_password_length = 12`, **pero la Admin API no lo aplica**: el mínimo se valida en Zod (§6.1). Sin recuperación de contraseña en v1 (deuda declarada) |
| **V3 Session Management** | sí | Cookies HttpOnly gestionadas por `@supabase/ssr`. `jwt_expiry = 1800`. Rotación de refresh activa. Revocación por `ban_duration` + `profiles.is_active`. **Headers anti-caché obligatorios en el middleware** (§1.1) |
| **V4 Access Control** | sí | **RLS de Postgres es la única frontera.** 37 policies de la Fase 1, con `private.is_admin()` / `private.is_active_cleaner()` `SECURITY DEFINER`. Nada se autoriza desde el JWT. Guard en cada Server Action como defensa en profundidad |
| **V5 Input Validation** | sí | `zod@4.5.4` en la entrada de cada Server Action. Los CHECK de la base son la segunda barrera. **Allowlist de host antes del `fetch` de APTO-12** (anti-SSRF) + `redirect: 'manual'` |
| **V6 Cryptography** | sí | `node:crypto` `randomBytes` para la contraseña temporal. Firma de JWT: GoTrue. **Nada a mano** |
| V7 Error Handling & Logging | sí | `mapDbError()` / `mapAuthError()`: nunca un string crudo de Postgres. `42501` no revela qué recurso se pidió. **La URL iCal nunca se registra en log ni en `last_error`** |
| V8 Data Protection | sí | `property_secrets` sin grant para `authenticated`. La URL iCal se enmascara al renderizar. La contraseña temporal se muestra una vez y no se persiste |
| V12 Files & Resources | no | Storage llega en la Fase 6 |
| V13 API & Web Service | parcial | Los Server Actions son endpoints HTTP públicos. Validación de origen: la trae Next 15 |

### Patrones de amenaza para este stack

| Patrón | STRIDE | Mitigación estándar |
|---|---|---|
| Fuga de sesión por caché de CDN | Information Disclosure | `setAll(cookies, headers)` de dos argumentos aplicando los tres headers. §1.1 |
| Escalada de privilegios por `user_metadata` | Elevation of Privilege | Rutear por `app_metadata.role`. **Y nunca añadir un trigger `AFTER UPDATE ON auth.users` que sincronice metadatos a `profiles`** |
| Empleado despedido conserva el acceso | Elevation of Privilege | Doble capa medida: `profiles.is_active=false` (RLS, inmediata) + `ban_duration` (auth). §6.2 |
| `service_role` filtrada al bundle | Information Disclosure | `import 'server-only'` + grep de CI + prohibición de `NEXT_PUBLIC_*` con `SECRET`/`SERVICE` en el nombre |
| SSRF por la URL iCal | Server-Side Request Forgery | Allowlist de host en Zod **antes** del fetch + `redirect: 'manual'` + timeout duro |
| Enumeración de usuarios en el login | Information Disclosure | `invalid_credentials` es idéntico para email inexistente y contraseña mala (**medido**). **`user_banned` sí enumera** — ver Open Questions |
| Bypass del middleware (CVE-2025-29927) | Elevation of Privilege | Next 15.5.24 > 15.2.3. Y la RLS no depende del middleware |
| Fuga por embed de PostgREST | Information Disclosure | La policy vive en la tabla que tiene el dato. `property_secrets` sin grant hace el embed imposible por construcción |
| `anon` con EXECUTE sobre funciones nuevas de `public` | Elevation of Privilege | Esta fase no crea funciones. Si alguna se crea, el par revoke/grant es obligatorio. §8.7 |
| Fijación de sesión tras la reactivación | Spoofing | El ban invalida las sesiones anteriores; al levantarlo, el usuario tiene que autenticarse de nuevo (medido: `re-signIn` falla mientras el ban está puesto) |

---

## Assumptions Log

| # | Afirmación | Sección | Riesgo si es falsa |
|---|---|---|---|
| A1 | En el proyecto Supabase hosted, el equivalente a `[auth.email] enable_signup = true` es Authentication → Providers → Email → Enabled, separado de "Allow new users to sign up" | §8.1 | El login funciona en local y falla en la nube. **Mitigable en 30 segundos** en el checkpoint de link |
| A2 | Los Server Actions no se pueden invocar por HTTP crudo de forma práctica en un test, por el ID de acción generado en build y la comparación Origin/Host | §7.2 | Si fuera fácil, habría un test directo mejor que el de dos capas. No cambia la cobertura, solo el método |
| A3 | `next build && next start` es más estable que `next dev` como `webServer` de Playwright | §7.3 | Más flakiness, no menos cobertura |
| A4 | Un alfabeto sin caracteres ambiguos reduce errores al dictar la contraseña por teléfono | §6.1 | Ninguno. Es una mejora de usabilidad sin coste |
| A5 | El `.ics` de Airbnb de hoy conserva la forma que documentan los 432 snapshots de `research/STACK.md` (2025-06 → 2026-08) | §4.4, §4.5 | El conteo de APTO-12 sería incorrecto. **Cubierto por el `checkpoint:human-verify` final** |
| A6 | `next-themes` se puede desinstalar tras simplificar `components/ui/sonner.tsx` | §3.4c | Si algún otro bloque lo usa, se queda. Verificable con un grep tras el `add` |
| A7 | Ningún plan de esta fase necesita crear una función en `public` | §8.7 | Si la necesita, hace falta el par revoke/grant y una aserción pgTAP |

---

## Open Questions (RESOLVED)

> Las 5 preguntas quedaron resueltas y trazadas a planes concretos, verificado por
> `gsd-plan-checker` el 2026-09-01. Detalle original abajo.



1. **El copy de "cuenta desactivada" enumera cuentas. ¿Se queda?**
   - Lo que sabemos, medido: GoTrue devuelve `user_banned` **antes** de verificar la contraseña. Cualquiera con un email válido y una contraseña cualquiera descubre que esa cuenta existe y está desactivada.
   - Lo que dice el contrato: `02-UI-SPEC.md` §12.1 justifica el mensaje específico afirmando que se emite *después* de validar credenciales. Esa afirmación es **falsa**.
   - Recomendación: **dejar el copy**. Es una herramienta interna de ~10 cuentas, sin registro público, con rate limit de 30 intentos por 5 min por IP, y un aseador dado de baja tiene derecho a entender por qué no entra. Pero corregir la razón escrita en el contrato, para que nadie la cite después como hecho verificado. Si el usuario prefiere cerrar el oráculo, la alternativa es colapsar a `Email o contraseña incorrectos.` siempre y que el admin avise por WhatsApp.

2. **¿Qué cuenta el "12" de APTO-12?**
   - Lo que sabemos: la evidencia primaria de `research/STACK.md` (432 snapshots reales) es concluyente — `DESCRIPTION` con `Reservation URL` existe en los 1708 `Reserved` y en ninguno de los 700 bloqueos.
   - Lo que no sabemos: si el `.ics` real de la cuenta de VivaGuest en 2026 mantiene esa forma.
   - Recomendación: whitelist positiva por `DESCRIPTION` (§4.4), documentar en el código que puede divergir del pipeline de la Fase 3, y validar con el checkpoint humano.

3. **¿La guía visual entra en esta fase o se recorta a texto?**
   - Lo que sabemos: las capturas salen de la cuenta real y no existen. `02-UI-SPEC.md` §10.1 ya autoriza el recorte: *"Si hay que recortar alcance, se recorta la guía a texto sin capturas, nunca la validación."*
   - Recomendación: planear la guía con el copy de 4 pasos en texto y `public/guia-airbnb/` como tarea de contenido separada, no bloqueante. El criterio 6 del ROADMAP se demuestra con la validación en vivo.

4. **`@base-ui/react` tiene 9 meses. ¿Riesgo de API rota entre minors?**
   - Lo que sabemos: 11,2 M de descargas semanales, es el proyecto de MUI, y es el default de shadcn desde julio de 2026. Pero es 1.7.0 con un ciclo de releases rápido.
   - Recomendación: pin exacto (`1.7.0`, sin caret). Los componentes viven **en el repo**, así que una API rota se arregla editando el archivo, no esperando un parche upstream. Riesgo bajo y contenido.

5. **¿`ci/db.yml` se activa en esta fase?**
   - `02-CONTEXT.md` lo difiere: requiere un token con scope `workflow`. Sin CI automático, las 8 puertas hay que correrlas a mano y hay que dejar escrito en cada plan qué comando las ejecuta. Vale la pena preguntar si el token está disponible ahora, porque una fase de UI sin CI en verde es donde la deuda se acumula sin que nadie la vea.

---

## Sources

### Primarias (confianza ALTA — medidas en esta sesión, 2026-09-01)
- **Stack local de Supabase levantado** (`npx supabase start`, 10 migraciones + 6 seeds). Scripts `probe-auth.mjs`, `probe2.mjs`, `probe3.mjs`, `probe4.mjs`: `createUser`, claims del JWT, `app_metadata` vs `user_metadata`, ban/desban, RLS de admin y de aseador, `property_secrets`, `calendar_feeds`, 23514/23505, enumeración en el login.
- **`docker exec supabase_auth_vivaguest env`** — mapeo `[auth.email] enable_signup → GOTRUE_EXTERNAL_EMAIL_ENABLED`, verificado por flip y re-medición.
- **Tarball de `@supabase/ssr@0.12.5`** en `node_modules` — `types.d.ts` (`SetAllCookies` con `headers`) y `cookies.js` líneas 499-503 (los tres headers literales).
- **Tarball de `@supabase/auth-js`** — firma real de `signOut(jwt, scope)` y su implementación; JSDoc de `getClaims()`; `AdminUserAttributes.ban_duration`.
- **`npx shadcn@4.19.1 init/add/view` en sandbox** que replica el repo — banderas reales, presets válidos, 132 líneas de `globals.css`, `layout.tsx` intacto, `form` sin archivos, `field` como sustituto, deps y sus rangos.
- **`@base-ui/react@1.7.0`** `.d.ts` — `name`/`inputRef`/`onValueChange`/`onCheckedChange` en Select, Switch y Checkbox.
- **Prototipo de `ical-preview` ejecutado** — unfolding, conteo, `min(DTEND)`, sniff de HTML, `AbortSignal.timeout`.
- **npm registry** (`npm view`) y `api.npmjs.org/downloads` — versiones, repos, fechas y descargas de los 10 paquetes auditados.
- **Repo del proyecto** — `package.json`, `tsconfig.json`, `vitest.config.ts`, `eslint.config.mjs`, `ci/db.yml`, `scripts/ci/check-service-role.sh`, `lib/env.ts`, `lib/supabase/admin.ts`, `lib/domain/{errors,constants}.ts`, `lib/database.types.ts`, las 10 migraciones, los 6 seeds, `supabase/config.toml`.

### Secundarias (confianza ALTA-MEDIA)
- `github.com/supabase/supabase` — `apps/ui-library/registry/default/clients/nextjs/lib/supabase/{client,server,middleware}.ts` y `blocks/password-based-auth-nextjs/middleware.ts`, obtenidos vía `gh api`. **Usados como evidencia de que el ejemplo oficial está desactualizado**, no como patrón a copiar.
- `supabase.com/docs/guides/auth/server-side/nextjs` — recomendación actual de `getClaims()` y confirmación del `setAll` de dos argumentos en los ejemplos de Astro/Remix/Express.
- `vercel.com/docs/functions/limitations` — 60 s de duración máxima en Hobby (300 s con Fluid Compute).
- Documentos internos del proyecto: `.planning/research/{STACK,PITFALLS,ARCHITECTURE}.md`, `.planning/{PROJECT,ROADMAP,REQUIREMENTS,STATE}.md`, `01-09-SUMMARY.md`, `deferred-items.md`, `02-CONTEXT.md`, `02-UI-SPEC.md`.

### Terciarias (confianza MEDIA — pendientes de validación)
- WebSearch sobre el comportamiento de `ban_duration` con tokens existentes — **superado por la medición directa**, se conserva solo como corroboración.
- Comportamiento del dashboard de Supabase hosted para el proveedor de email (A1) — no verificado contra un proyecto real.
- Seguridad de los Server Actions de Next 15 (ID de acción en build, comparación Origin/Host) — resumido de la documentación, no medido (A2).

---

## Metadata

**Desglose de confianza:**
- Clientes de Supabase y middleware: **ALTA** — leídos del código compilado del paquete instalado; la divergencia con el ejemplo oficial está documentada con ambas fuentes.
- Semántica de auth (rol, ban, revocación, enumeración): **ALTA** — todo medido de punta a punta contra el stack local con tokens reales.
- Instalación de shadcn: **ALTA** — el CLI real corrió contra un sandbox que replica el repo; cada afirmación tiene su salida.
- Contrato de la base (grants, policies, CHECK): **ALTA** — medido con JWT de admin y de aseador, más lectura de las migraciones.
- Rebanada de APTO-12: **ALTA** en lo mecánico (prototipo ejecutado), **MEDIA** en la definición de "reserva" (depende de que el feed real conserve la forma de los 432 snapshots).
- Estrategia de pruebas: **ALTA** para Vitest y el patrón de integración (validado en esta sesión); **MEDIA** para Playwright (no se ejecutó ninguna suite; la configuración es estándar pero no está probada en este repo).
- Config del Supabase hosted: **BAJA** — no existe el proyecto. A1 queda abierta.

**Fecha:** 2026-09-01
**Válido hasta:** ~2026-10-01. Lo que envejece más rápido: `shadcn` y `@base-ui/react` (releases semanales). Lo medido contra el stack local y contra los `.d.ts` de los paquetes pineados es estable mientras no se cambien esos pines.
