# Phase 2: Acceso y administración del catálogo - Context

**Gathered:** 2026-09-01
**Status:** Ready for planning
**Source:** Decisiones de la sesión de arranque + cierre de la Fase 1

<domain>
## Phase Boundary

Primera fase con pantallas. Entrega el login por rol y el CRUD que permite al admin **montar la operación real** en el sistema: los 39 apartamentos con sus tarifas, calendarios, códigos de acceso, cuartos y responsables, más las cuentas de los aseadores.

**Dentro del alcance:** autenticación con email y contraseña, ruteo por rol, shell del dashboard admin, CRUD de apartamentos, CRUD de aseadores, buscador, y el onboarding visual del feed de Airbnb (APTO-12).

**Fuera del alcance:** la PWA del aseador (Fase 6), el dashboard operativo con bandeja y alertas (Fase 4), el motor de sincronización (Fase 3). Esta fase construye el `(cleaner)` layout mínimo solo para que el ruteo por rol tenga a dónde llevar al aseador, no la PWA.

**Por qué va aquí:** sin apartamentos cargados no hay calendarios que sincronizar, así que la Fase 3 depende de esta.
</domain>

<decisions>
## Implementation Decisions

### Convenciones de UI, ya acordadas
- **shadcn, con atomic design parcial.** `components/ui/` es shadcn **sin envolver**. Prohibido crear `components/atoms/Button.tsx` que solo re-exporte el `Button` de shadcn: es puro impuesto sin retorno.
- **Los organismos viven por superficie**, no en un directorio compartido: `app/(admin)/_components/` y `app/(cleaner)/_components/`. Lo compartido entre superficies son los tokens (color, espaciado, tipografía) y los átomos base, no los organismos.
- **Las dos superficies casi no comparten nada.** El admin es escritorio con tablas densas; el aseador es una columna, móvil, con objetivos de toque grandes. Forzar reuso de organismos entre ambas produce componentes llenos de condicionales, que es peor que duplicar.
- **shadcn todavía no está instalado.** La Fase 1 lo difirió a propósito: `shadcn@4.19.1` cambió de API (`--base-color` ya no existe), instala `@base-ui/react` en vez de `radix-ui`, y reescribe ~144 líneas de `globals.css`. Instalarlo es trabajo de esta fase, con esa advertencia medida en mano.

### Stack de esta fase, heredado y ya verificado
- Next.js 15.5.24 pineado, build webpack, **sin Turbopack**.
- Tailwind CSS v4: configuración en CSS con `@theme`, sin `tailwind.config.js`. No mezclar tutoriales de v3.
- `@supabase/ssr` 0.12.5. **Trampa crítica:** el callback `setAll` recibe DOS argumentos, el segundo son headers (`Cache-Control: private, no-store`). Ignorarlos deja que el CDN de Vercel cachee una respuesta con cookie de sesión y se la sirva a otro usuario.
- `getUser()` en servidor, **nunca `getSession()`**: solo el primero valida contra el servidor de Auth, que es lo que hace que la desactivación de un aseador se note.
- Server Actions + Zod para mutaciones. `react-hook-form` solo en el formulario largo de apartamento (~12 campos).
- Idioma de la interfaz: **español**.

### Seguridad, heredada de la Fase 1 y no negociable
- **La RLS es la única autorización real.** El middleware y el route group no autorizan nada. Un Server Action es un endpoint HTTP público: que el botón solo se renderice en `(admin)` no autoriza nada. Cada action arranca con `getUser()` más verificación de rol, y usa el cliente con JWT de usuario.
- **El claim de rol del JWT solo sirve para ruteo**, que es UX. La autorización lee `profiles.is_active` vía función `SECURITY DEFINER`.
- **`service_role` solo en `lib/supabase/admin.ts`** con `import 'server-only'`. Hay un test de arquitectura en CI que rompe el build si alguien la importa desde una página o un Server Action. Se usa para el alta de aseadores (`auth.admin.createUser`) y la baja (`auth.admin.signOut` + ban).
- **El código de acceso y la URL iCal viven en `property_secrets`** y se escriben con `service_role`. Nunca se exponen en una respuesta que pueda alcanzar al aseador.
- Toda mutación de `cleanings` pasa por RPC. Esta fase no muta aseos, pero la regla aplica cuando toque.

### Datos que ya existen
- 39 apartamentos sembrados en 8 clusters, **con placeholders inconfundibles**. Reemplazarlos con datos reales es el trabajo del admin en esta fase, no una migración.
- Catálogo provisional de tipos de cuarto con máximo 3 tareas por tipo, editable en base de datos sin migración.
- `lib/database.types.ts` generado y con check de drift en CI.

### APTO-12, el requisito no obvio
Al conectar el calendario, el admin ve una guía visual de dónde sacar el link de exportación en Airbnb, y **al pegarlo el sistema valida el feed en vivo**: le dice si sirve, cuántas reservas trajo y cuál es el próximo checkout detectado, sin esperar la siguiente corrida del sync.

Lo importante es la validación en vivo, no la guía. Una URL de Airbnb es opaca: no se puede mirar y saber si quedó bien pegada o si es la del apartamento equivocado. Sin esa retroalimentación, el error se descubre tres días después, cuando no llegó el aseo.

### Claude's Discretion
- Estructura de rutas dentro de `(admin)`, nombres de archivos y organización de componentes.
- Cómo se parte el formulario de apartamento (~12 campos) en secciones o pasos.
- Estrategia de estados de carga, vacío y error.
</decisions>

<canonical_refs>
## Canonical References

### De la Fase 1, ya entregado
- `lib/database.types.ts` — el contrato de tipos de toda la UI
- `supabase/migrations/*.sql` — 22 tablas, 37 policies, 6 RPC
- `.planning/phases/01-fundaci-n-schema-y-rls/01-09-SUMMARY.md` — cierre de fase
- `.planning/phases/01-fundaci-n-schema-y-rls/deferred-items.md` — 4 hallazgos abiertos con dueño

### Stack y trampas
- `.planning/research/STACK.md` — versiones exactas verificadas y la trampa de `setAll`
- `.planning/research/PITFALLS.md` — trampas de Next.js 15 y Supabase auth
- `.planning/research/ARCHITECTURE.md` §Next.js App Structure — route groups, middleware, Server Actions vs Route Handlers

### Producto
- `.planning/PROJECT.md` — reglas de dominio y riesgos aceptados
- `.planning/ROADMAP.md` — criterios de éxito de la fase
- `.planning/REQUIREMENTS.md` — los 19 REQ-IDs
</canonical_refs>

<specifics>
## Specific Ideas

- El admin es escritorio: tablas densas, muchas filas visibles, poco scroll por fila. No es una app móvil con tablas apretadas.
- 39 apartamentos es poco: el buscador es una comodidad, no una necesidad de paginación.
- El formulario de apartamento tiene reglas de validación cruzada que ya están en la base y deben reflejarse en la UI antes de enviar: no se puede activar sin ambas tarifas, exige responsable cuando `gestion_vivaguest` es true, y exige contacto externo cuando es false.
- Hora límite del aseo con default 11:30.
- Montos en pesos colombianos enteros, sin decimales.
</specifics>

<deferred>
## Deferred Ideas

- PWA del aseador con checklist y evidencia → Fase 6
- Bandeja "Sin confirmar", panel de alertas y vista por día → Fase 4
- Motor de sincronización iCal y sus crons → Fase 3
- Pantallas financieras y cierre mensual → Fase 7
- Reactivar el CI moviendo `ci/db.yml` a `.github/workflows/` → requiere token con scope `workflow`
</deferred>

---

*Phase: 02-acceso-y-administraci-n-del-cat-logo*
*Context gathered: 2026-09-01*
