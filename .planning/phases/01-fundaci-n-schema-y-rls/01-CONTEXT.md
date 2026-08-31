# Phase 1: Fundación, schema y RLS - Context

**Gathered:** 2026-08-31
**Status:** Ready for planning
**Source:** Decisiones tomadas en sesión de arranque + `.planning/research/ARCHITECTURE.md`

<domain>
## Phase Boundary

Esta fase entrega **la base de datos completa y las políticas de seguridad, sin una sola pantalla**. Al terminar, `supabase db reset` levanta el schema desde cero, la suite pgTAP pasa en verde incluyendo casos negativos de RLS, y el seed de los 8 clusters con las 39 unidades queda cargado.

**Dentro del alcance:** scaffolding del proyecto (Next.js + Supabase CLI + CI), migraciones SQL, enums, constraints, índices, funciones `SECURITY DEFINER`, políticas RLS, RPC de transiciones de estado, bucket privado de Storage con sus policies, seed, tests pgTAP, y generación de `database.types.ts`.

**Fuera del alcance:** cualquier página, componente o Server Action. La UI arranca en la Fase 2. El job de borrado arranca en la Fase 9, aunque sus columnas se crean aquí.

**Por qué va primero:** `database.types.ts` y la forma de los RPC son el contrato de toda la UI y cambian con cada migración. Arrancar UI antes garantiza reescribirla.
</domain>

<decisions>
## Implementation Decisions

### Seguridad, es lo que más pesa en esta fase
- **RLS es la única autorización real.** El middleware y el route group no autorizan nada. Cada policy se prueba con un caso negativo explícito en pgTAP.
- **Cero claims del JWT para autorizar.** Un access token ya emitido verifica bien hasta expirar, así que si el rol viviera en el claim, un aseador desactivado seguiría entrando hasta 60 minutos. Todas las policies leen `profiles.is_active` vía función `SECURITY DEFINER STABLE` en el esquema `private`.
- **El código de acceso va en tabla aparte (`property_secrets`), no como columna de `properties`.** En Supabase admin y aseador comparten el rol Postgres `authenticated`, y los `GRANT SELECT (columna)` son por rol de base, no por usuario: ocultar una columna a un usuario y mostrarla a otro es imposible. Lo único que discrimina usuarios es RLS, que opera por fila.
- **La URL de exportación iCal de Airbnb también es una credencial** y vive en `property_secrets` con el mismo tratamiento. Es secreta e inadivinable; si se filtra, cualquiera ve la ocupación de ese apartamento.
- **Acceso al código por RPC con ventana y auditoría.** `reveal_access_code()` solo responde al aseador con un aseo vigente (hoy o mañana) y escribe en `access_code_reads`.
- **Grafo de policies como DAG, sin ciclos.** `properties → cleanings` vía función definer. La policy de `cleanings` es plana (`aseador_id = auth.uid()`) y no referencia `properties`. Si ambas se referencian, hay recursión infinita.
- **El aseador no escribe directo.** `revoke insert, update, delete on cleanings from authenticated`. Sus mutaciones pasan por RPC `SECURITY DEFINER`, porque los column grants no pueden expresar "solo terminas si todo el checklist tiene foto" ni "'no puedo' limpia el aseador y encola la alerta, atómicamente".
- **Toda vista lleva `with (security_invoker = on)`.** Sin eso la vista salta la RLS de las tablas base. Es la fuga más común en Supabase.
- **`service_role` aislada.** Solo `lib/supabase/admin.ts` con `import 'server-only'` la lee. Un test de arquitectura en CI (grep) debe fallar el build si alguien la importa desde una página o un Server Action.

### Invariantes que viven en la base, no en el código
- **Un aseo activo por apartamento y fecha:** índice único parcial `where state is distinct from 'cancelada'`. `IS DISTINCT FROM` y no `<>` es load-bearing: hace que las filas informativas con `state IS NULL` queden dentro del índice, que es lo correcto.
- **Un apartamento no se activa sin tarifa al huésped y pago al aseador.**
- **`responsable_id` y `suplente_id` solo aplican con `gestion_vivaguest = true`**; `contacto_externo` solo con `false`.
- **Gestión externa = misma tabla + discriminador `is_managed` snapshoteado + `state` anulable**, con un `CHECK` que fuerza NULL en estado, aseador, instrucciones y tarifas. Tabla separada duplicaría el pipeline y la retención, y rompería la garantía única por `(property_id, scheduled_date)`. Join vivo contra `gestion_vivaguest` reescribiría el histórico si un apartamento cambia de modalidad.
- **Máquina de estados del aseo con log de auditoría de transiciones.**

### Dinero y tiempo
- **Snapshot financiero en el aseo, no cómputo vivo.** `tarifa_huesped` y `pago_aseador` se copian de `properties` al insertar vía trigger, editables mientras el aseo vive, congelados al pasar a `completada` o `cancelada`. Sin esto, cambiar una tarifa reescribe el margen histórico y el pago de un mes ya cerrado.
- **Montos en `bigint` de pesos enteros.** El COP no tiene subunidad, y `numeric` llega como string desde supabase-js.
- **`today_bog()` obligatorio, y prohibido `current_date` en jobs, policies e índices.** La sesión corre en UTC: después de las 19:00 de Bogotá `current_date` ya es mañana, así que con `current_date` en la policy el aseador pierde el código de acceso a las 7pm.
- **`fecha_aseo` es `date`, no `timestamptz`.** Colombia no tiene DST desde 1993 y la regla de negocio es "el aseo va el día que el calendario libera el apartamento".

### Retención, aunque el job llegue en la Fase 9
- **`legal_hold` y `deleted_at` se crean en esta fase.** Agregarlos después obliga a migrar datos operativos en vivo.
- **`storage_deletion_queue` también.** Borrar `storage.objects` por SQL no borra el archivo: lo deja huérfano facturando. El orden correcto es encolar rutas, borrar filas, y luego Storage API `remove()`.

### Seed
- Los 8 clusters con las 39 unidades: 34 con `gestion_vivaguest = true`, 5 con `false` (Bogotá 2 con 2 aptos, Santa Marta 2, Santa Marta 3, Chinauta).
- **Nombres, tarifas y cuartos reales todavía no existen.** Sembrar con placeholders claramente marcados como tales, para que el admin los reemplace. Esto no bloquea la fase.
- Catálogo provisional de tipos de cuarto con máximo 3 tareas por tipo: habitación, baño, cocina, sala/comedor, zona de lavado, balcón/terraza, exterior (jardín/piscina/BBQ para las 2 casas) y un bloque "general" siempre presente. Editable en base de datos sin migración.

### Infraestructura y proceso
- **Todo el desarrollo en free tier** de Vercel y Supabase. El cron de 30 minutos vive en `pg_cron`, así que el tope de 1 corrida diaria de Vercel Hobby no aplica.
- **Dos proyectos Supabase**, dev y prod. Las preview deployments apuntan a dev. Un solo proyecto con datos reales y previews escribiendo encima es cómo se corrompe la operación.
- **El Supabase CLI es la fuente de verdad del schema.** Migraciones versionadas en `supabase/migrations/`, aplicadas por CI, nunca a mano desde el dashboard.
- **Trabajo en worktrees.** `git.branching_strategy = phase`, rama `gsd/phase-1-fundaci-n-schema-y-rls`. Los agentes de ejecución corren aislados en su propio worktree.
- **Equipo de dos personas**, ejecución secuencial. No asumir paralelismo.

### Claude's Discretion
- Nombres exactos de columnas, orden de las migraciones y cómo se parten en archivos.
- Estructura interna de los tests pgTAP y de los helpers de test.
- Elección de herramientas de CI dentro de GitHub Actions.
- Cómo se organiza `lib/domain/` en esta fase (probablemente solo tipos y constantes, sin lógica todavía).
</decisions>

<canonical_refs>
## Canonical References

**Los agentes downstream DEBEN leer estos antes de planear o implementar.**

### Arquitectura y schema
- `.planning/research/ARCHITECTURE.md` — DDL, policies RLS, RPC, Storage y build order. **Es la referencia principal de esta fase**, trae el schema propuesto casi listo para levantar
- `.planning/research/PITFALLS.md` — trampas específicas de Supabase RLS, timezone, Storage y Next.js 15

### Stack y versiones
- `.planning/research/STACK.md` — versiones exactas verificadas, la trampa del segundo argumento de `setAll` en `@supabase/ssr` 0.12.5, y qué paquetes están deprecated

### Producto
- `.planning/PROJECT.md` — reglas de dominio, constraints, riesgos aceptados y decisiones clave
- `.planning/ROADMAP.md` — criterios de éxito de la fase y alcance explícito no capturado por REQ-IDs
- `.planning/REQUIREMENTS.md` — PLAT-03, PLAT-05, PLAT-06, ASEO-07, FIN-01
</canonical_refs>

<specifics>
## Specific Ideas

- El índice parcial exacto:
  ```sql
  create unique index cleanings_one_active_per_property_date
    on public.cleanings (property_id, scheduled_date)
    where state is distinct from 'cancelada';
  ```
- Tablas esperadas: `profiles`, `properties`, `property_secrets`, `property_rooms`, `access_code_reads`, `room_types`, `checklist_tasks`, `missing_item_catalog`, `app_settings`, `calendar_feeds`, `calendar_reservations`, `cleanings`, `cleaning_checklist_items`, `cleaning_photos`, `damages`, `expenses`, `missing_item_reports`, `missing_item_lines`, `notifications`, `push_subscriptions`, `storage_deletion_queue`.
- `calendar_feeds` se modela con soporte para varios proveedores por apartamento, pero el MVP solo usa Airbnb. La columna de proveedor y la de autoridad existen desde ya para no migrar después.
- Bucket `evidencia` privado, con convención de rutas y signed URLs de vida corta.
- Los tests de RLS corren con `supabase test db` (pgTAP), con roles reales, no simulando desde el cliente.
</specifics>

<deferred>
## Deferred Ideas

- Job de borrado por retención (`purge_expired`, `notify_retention`) → Fase 9. Aquí solo se crean las columnas y la cola.
- Cualquier página, componente o Server Action → Fase 2 en adelante.
- Worker de sincronización iCal y los `pg_cron` que lo disparan → Fase 3.
- Worker de notificaciones y `push_subscriptions` en uso → Fase 5. La tabla sí se crea aquí.
- Vistas de alertas y de finanzas → Fases 4 y 7.
</deferred>

---

*Phase: 01-fundaci-n-schema-y-rls*
*Context gathered: 2026-08-31 a partir de las decisiones de la sesión de arranque*
