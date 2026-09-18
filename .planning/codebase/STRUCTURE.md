# Estructura del codebase

**Fecha de análisis:** 2026-09-18

## Layout de directorios

```
VivaGuest/
├── app/
│   ├── (admin)/          # Dashboard del admin (desktop)
│   ├── (cleaner)/        # PWA del aseador (móvil, touch)
│   ├── (public)/         # Login, única ruta común pre-auth
│   ├── api/
│   │   ├── cron/         # Workers públicos con secreto compartido
│   │   └── push/         # Worker del outbox de Web Push
│   └── _actions/         # Server Actions transversales (sesión)
├── lib/
│   ├── data/             # Lecturas tipadas, con sesión del usuario (RLS aplica)
│   ├── domain/           # Reglas puras: iCal, money, checklist, fechas, Zod
│   ├── supabase/         # Fábricas de cliente (server, admin)
│   ├── auth/             # Guards de rol, ruteo por rol, revocación
│   ├── push/             # Payload, colapso, reintentos, envío VAPID
│   ├── fotos/            # Compresión, EXIF, nombrado, subida
│   └── test/             # Helpers de fixtures/seeds para tests de integración
├── components/           # Componentes de UI genéricos (shadcn), NO de dominio
├── hooks/                # Hooks de React compartidos
├── supabase/
│   └── migrations/       # Fuente de verdad del schema, RLS, grants, definer
├── e2e/                  # Playwright: flujos end-to-end de las dos superficies
├── scripts/ci/           # Guardarraíles bash (check-service-role.sh, etc.)
├── docs/                 # Documentación de referencia del proyecto
└── ci/                   # Config de integración continua
```

## Propósito de cada directorio

**`app/(admin)/`:**
- Propósito: todo lo que solo el admin ve. Cada subruta es una feature (`apartamentos/`, `aseadores/`, `finanzas/`, `operacion/`).
- Contiene: `page.tsx` por ruta (Server Component), `_actions.ts` por ruta (Server Actions de esa feature), `_components/` locales a la ruta, `_copy.ts` para textos largos.
- `app/(admin)/_components/`: componentes compartidos **solo entre rutas del admin** (patrón de panel lateral: `PanelLectura.tsx`, `GrupoDePanel.tsx`, `FilaDeDato.tsx`, `EsqueletoDePanel.tsx`, `TopNav.tsx`).

**`app/(cleaner)/`:**
- Propósito: la PWA del aseador. Rutas: `aseos/[id]` (ejecución de un aseo), `mis-aseos` (lista), `mis-pagos` / `mis-pagos/[id]` (pagos cerrados propios).
- Contiene: `_actions.ts` a nivel de superficie completa (no por subruta, a diferencia del admin) y un `_components/` grande y propio: checklist (`ChecklistPorCuarto.tsx`, `CuartoAcordeon.tsx`, `FilaDeTarea.tsx`), evidencia fotográfica (`PasoDeFoto.tsx`, `WizardEvidencia.tsx`, `FotoDeReporte.tsx`), reportes de excepción (`HojaNoPuedo.tsx`, `HojaSaltarCuarto.tsx`, `PasoDeReporte.tsx`, `CampoDeMonto.tsx`), y push (`BotonActivarAvisos.tsx`, `BannerAvisos.tsx`).
- Ningún archivo de aquí se importa desde `app/(admin)/`.

**`app/(public)/`:**
- Propósito: login. Es la única ruta accesible sin sesión.

**`app/api/cron/sync-feed/`:**
- Propósito: worker de sincronización iCal, uno por invocación de `pg_cron`+`pg_net`.
- Clave: `route.ts` (handler), `_guard.ts` (verificación del secreto compartido, reusado también por `push/drain`).

**`app/api/push/drain/`:**
- Propósito: worker del outbox de Web Push, disparado por trigger de Postgres y repescado por cron de 1 minuto.

**`lib/data/`:**
- Propósito: cada archivo agrupa las lecturas de un dominio de negocio, siempre con el cliente de sesión (`lib/supabase/server.ts`), nunca con el admin.
- Un archivo por área: `apartamentos.ts`, `aseadores.ts`, `operacion.ts`, `historial.ts`, `finanzas.ts`, `finanzas-detalle.ts`, `pagos.ts`, `pagos-aseador.ts`, `panel-aseo.ts`, `panel-apartamento.ts`, `panel-aseadora.ts`, `sync.ts`, `push.ts`, `avisos.ts`, `evidencia.ts`, `almacenamiento.ts`, `recibos.ts`.
- Cada archivo trae su `*.test.ts` (unitario) y a veces `*.integration.test.ts` (contra Postgres real vía `supabase test db` o cliente real de test).

**`lib/domain/`:**
- Propósito: lógica de negocio pura, sin IO, compartida por ambas superficies. Es donde vive el riesgo lógico real del producto (parser iCal, money, cierre de periodo).
- Subgrupos por prefijo de nombre:
  - `ical*.ts`: parseo, normalización, clasificación, validación de URL, preview.
  - `sync-*.ts`: diff, pipeline, dispatcher (todos con sufijo `.integration.test.ts` porque tocan Postgres real).
  - `finanzas.ts`, `money.ts`, `mes.ts`, `periodo.ts`: dinero y cierre contable.
  - `checklist.ts`, `cleanings.ts`, `checkouts.ts`, `motivos.ts`: reglas del ciclo de vida de un aseo.
  - `apartamento.schema.ts`, `aseador.schema.ts`, `cuartos.schema.ts`, `reporte.schema.ts`, `suscripcion.schema.ts`: validación Zod de formularios/RPC.
  - `alertas.ts`, `avisos.ts`, `salud-sync.ts`: señales operativas para el admin.
  - `dates.ts`, `password.ts`, `plural.ts`, `personas.ts`, `constants.ts`, `errors.ts`: utilidades transversales.
- `lib/domain/__fixtures__/`: fixtures `.ics` reales de Airbnb/Booking usadas por los tests de parseo.

**`lib/supabase/`:**
- `server.ts`: cliente SSR con cookies (`getUser()`, nunca `getSession()`/`getClaims()` para autorizar).
- `admin.ts`: cliente `service_role`. Uso restringido a los dos workers públicos de `app/api/`.

**`lib/auth/`:**
- Propósito: guards de rol (`guards.ts`), ruteo según rol tras login (`routing.ts`), y los tests de integración que miden la revocación inmediata de un aseador desactivado.

**`lib/push/`:**
- Propósito: todo lo específico de Web Push que no es el worker en sí — construcción de payload, clave de colapso por tópico, política de reintentos con backoff, envío con `web-push`.

**`lib/fotos/`:**
- Propósito: compresión cliente (`comprimir.ts`), política de tamaño/calidad (`politica.ts`), nombrado determinístico (`nombres.ts`), subida a Storage con signed URL (`subir.ts`).

**`lib/test/`:**
- Propósito: helpers de siembra de datos para tests de integración (`aseos.ts`, `sync.ts`, `push.ts`, `clientes.ts`, `cargar-env.ts`). Usan el cliente `service_role`, nunca el de sesión.

**`components/` y `hooks/`:**
- Propósito: UI genérica de shadcn/ui y hooks de React reutilizables, sin conocimiento de dominio VivaGuest. Aquí sí pueden convivir piezas usadas por ambas superficies porque son "tontas" (botón, input, toast), a diferencia de `_components/` de cada superficie que sí conoce el dominio.

**`supabase/migrations/`:**
- Propósito: fuente de verdad del schema completo — tablas, RLS, grants por columna, funciones `security definer`, triggers.
- Numeradas secuencialmente con prefijo de timestamp y número de orden humano (`20260913110000_24_frontera_del_aseador.sql`). Cada archivo lleva un comentario extenso de cabecera explicando el porqué, no solo el qué — es el registro histórico de decisiones de seguridad y de negocio del proyecto. Leerlas es la forma correcta de entender una regla de negocio con impacto en datos, antes que preguntar o adivinar.

**`e2e/`:**
- Propósito: Playwright contra los flujos completos de las dos superficies (`apartamento-crud.spec.ts`, `aseadores-alta.spec.ts`, `aseo-checklist.spec.ts`, `aseo-ejecucion.spec.ts`, `aseo-evidencia.spec.ts`, `almacenamiento.spec.ts`). `e2e/fixtures.ts` centraliza la siembra de datos de prueba.

**`scripts/ci/`:**
- Propósito: guardarraíles bash que corren en CI y hacen cumplir por grep reglas de arquitectura que no se pueden expresar en TypeScript, notablemente `check-service-role.sh` (orden obligado `guard → fábrica administrativa` en los workers públicos, prohibición de usar el cliente admin fuera de esos dos endpoints).

## Ubicaciones clave

**Puntos de entrada:**
- `app/(admin)/layout.tsx`, `app/(cleaner)/layout.tsx`: layouts raíz de cada superficie, donde corre el guard de rol.
- `app/api/cron/sync-feed/route.ts`, `app/api/push/drain/route.ts`: únicos endpoints públicos que hablan con el exterior.

**Configuración:**
- `supabase/config.toml`: config local del CLI de Supabase (incluye habilitar `pgtap`).
- `next.config.*`, `tsconfig.json`: config de build/tipos.

**Lógica central:**
- `lib/domain/ical*.ts` + `lib/data/sync.ts`: el pipeline de ingesta de calendario, el de mayor riesgo lógico del producto.
- `supabase/migrations/`: toda regla de autorización y de dinero.

**Testing:**
- Unitarios `*.test.ts` junto a cada archivo que prueban (co-localizados en `lib/data/`, `lib/domain/`, `app/**/_actions.test.ts`).
- Integración `*.integration.test.ts`: contra Postgres real, co-localizados igual.
- pgTAP: dentro de `supabase/` (tests de RLS por rol real).
- E2E: `e2e/*.spec.ts`.

## Convenciones de nombres

**Archivos:**
- Todo en español, incluidos nombres de función y de archivo (`operacion`, `aseador`, `finanzas`, `desglose`). Es consistente en el 100% del código de dominio y de UI.
- Server Actions de una ruta viven siempre en un archivo llamado `_actions.ts` (o `_actions.test.ts` para su test), con prefijo `_` para marcarlo como privado a la ruta y que Next.js no lo trate como segmento de ruta.
- Componentes locales a una ruta van en una carpeta `_components/` (prefijo `_` = privado, no genera ruta).

**Migraciones:**
- `<timestamp>_<número de orden>_<slug descriptivo>.sql`. El número de orden es secuencial y humano, independiente del timestamp — permite referenciar "la migración 26" en comentarios de código sin repetir el timestamp completo.

**Grupos de rutas de Next.js:**
- `(admin)`, `(cleaner)`, `(public)`: paréntesis = grupo de rutas, no aparece en la URL. Es lo que permite tener layouts y `_components/` separados sin que la URL cambie de forma.

## Dónde añadir código nuevo

**Nueva feature del admin (ej. un nuevo reporte):**
- Ruta: `app/(admin)/<feature>/page.tsx` + `app/(admin)/<feature>/_actions.ts` si muta algo.
- Lectura: nueva función en `lib/data/<dominio>.ts` (o archivo nuevo si es un dominio nuevo).
- Regla de negocio pura: `lib/domain/<dominio>.ts` si aplica a ambas superficies o solo al admin.

**Nueva pantalla o paso de la PWA del aseador:**
- Componente en `app/(cleaner)/_components/`.
- Mutación en `app/(cleaner)/_actions.ts` (archivo único de la superficie, no por subruta).
- Cualquier regla compartida con el admin (ej. una nueva validación de checklist) va en `lib/domain/`, no duplicada en ambos árboles.

**Nueva función que expone dinero o cualquier dato sensible:**
- Empieza en `supabase/migrations/`: definir la función `security definer` con guarda de rol como primera sentencia, `revoke`+`grant` pegado, y actualizar el `grant select (...)` por columna si la tabla base ya está restringida (ver `ARCHITECTURE.md`, sección de frontera de seguridad). El código de `lib/data/` viene después y solo llama al RPC.

**Utilidad compartida (fecha, dinero, texto):**
- `lib/domain/` si es pura y sin IO. Nunca en `components/` ni en `_components/` de una superficie.

**Componente de UI genérico sin conocimiento de dominio (botón, card, input):**
- `components/` (shadcn/ui). Si necesita variante propia del checklist o de las tarjetas de aseo, se edita directo ahí porque el código lo posee el repo, no un paquete externo.

## Directorios especiales

**`app/(cleaner)/mis-aseos/loading.tsx`, `app/(admin)/aseadores/loading.tsx`, etc.:**
- Propósito: skeletons de Next.js App Router, uno por ruta con carga async relevante.
- Generado: no, escrito a mano.
- Committed: sí.

**`ci/` y `scripts/ci/`:**
- Propósito: pipeline de CI y guardarraíles bash.
- Generado: no.
- Committed: sí.

**`docs/`:**
- Propósito: documentación de referencia del proyecto, distinta de `.planning/` (que es el tracking de fases GSD).
- Generado: no.
- Committed: sí.

---

*Análisis de estructura: 2026-09-18*
