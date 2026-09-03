# Fase 4: Dashboard operativo del admin - Research

**Researched:** 2026-09-03
**Domain:** RPC `SECURITY DEFINER` de mutación de aseos, lectura agregada de la operación del día, Supabase Realtime sobre App Router, panel de alertas mixto (persistidas + computadas)
**Confidence:** HIGH en la capa de base de datos y en el `sheet` (medido contra el repo y contra el registry vivo). MEDIUM en Realtime (documentación oficial leída hoy, pero sin proyecto Supabase hospedado donde medirlo). Ver `## Assumptions Log`.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Anatomía de la pantalla única**

- **D-01: Una ruta, dos carriles.** La ruta principal del admin es una sola pantalla con un carril ancho de contenido y un carril lateral fijo (`sticky`) a la derecha. No hay pestañas: el criterio 1 del ROADMAP pide "toda la operación del día en una pantalla" y las pestañas esconden precisamente lo que no puede esconderse.
- **D-02: El carril lateral es el de las cosas que exigen acción.** Arriba la bandeja persistente "Sin confirmar" con su contador (DASH-02), debajo el panel de alertas (DASH-04, DASH-05). Ambos visibles sin hacer scroll, siempre.
- **D-03: El carril ancho es el estado del mundo.** Los días en orden: **Hoy** expandido por defecto, **Mañana** y **Siguientes** colapsables (DASH-01). Cada día es una tabla densa, no una rejilla de tarjetas: el admin es escritorio y son decenas de aseos por día.
- **D-04: La carga por aseador no es una cuarta zona.** Es una franja compacta justo encima del día "Hoy": un chip por aseador con su conteo del día (DASH-03). Lo único que esa información tiene que soportar es una decisión binaria, activar o no al suplente, y para eso no hace falta una vista propia.

**Qué significa "la misma jerarquía visual" (criterio 4)**

- **D-05: No significa que todas griten igual. Significa que ninguna se esconde.** El anti-patrón que el requisito ataja es el clásico: urgentes en rojo grande arriba y "faltantes" como texto gris al final que nadie lee nunca.
- **D-06: Lista plana, ordenada cronológicamente por cuándo ocurrió el hecho.** No por tipo, no por severidad percibida. Los siete tipos (urgente, extensión mal creada, "no puedo", daño, faltante, calendario caído, hora límite vencida) comparten fila, tamaño, peso tipográfico y tratamiento.
- **D-07: El tipo se distingue por icono y etiqueta de texto, nunca por color ni tamaño.** Un solo color de acento para todo el panel. Se puede filtrar por tipo, pero el orden por defecto es cronológico y el filtro arranca en "todas".
- **D-08: Cada alerta lleva a su aseo o a su apartamento en un clic.** Una alerta que no es accionable desde donde se ve es una notificación, no una alerta.

**Dónde ocurre confirmar un aseo**

- **D-09: Panel lateral (`Sheet`) que se abre desde la bandeja**, con los dos campos: número de huéspedes e instrucciones (ASEO-02).
- **D-10: Encadenado.** Al guardar, avanza automáticamente al siguiente sin confirmar y muestra el progreso ("3 de 15"). Se puede cerrar en cualquier momento sin perder lo ya confirmado.
- **D-11: Descartado el diálogo modal y la fila expandible.** Tras una corrida del sync pueden entrar quince de golpe: abrir y cerrar un diálogo quince veces es exactamente la fricción que "un solo paso" quiere evitar. La fila expandible pierde el sitio cuando la lista se reordena al salir el aseo recién confirmado.
- **D-12: El panel muestra el contexto que el admin necesita para decidir** sin ir a buscarlo: apartamento, fecha, a quién va a quedar asignado, y el código de acceso **no**. El código se revela por su RPC con auditoría, y el admin no lo necesita para confirmar.

**Frescura de los datos**

- **D-13: La pantalla se actualiza sola.** Realtime de Supabase sobre `cleanings` y `notifications`, con revalidación periódica de respaldo. El admin deja esta pantalla abierta todo el día y el motor corre cada 30 minutos: sin refresco, actúa sobre un mundo viejo.
- **D-14: Marca de tiempo visible de la última actualización.** No basta con refrescar: hay que decir cuándo se leyó. Un dashboard operativo que miente en silencio sobre lo de hace 25 minutos es peor que uno que confiesa su edad.
- **D-15: Ojo con el free tier.** El plan de Supabase es gratuito durante todo el desarrollo. Con un solo admin, Realtime cabe de sobra, pero el planner debe confirmar el límite de conexiones concurrentes y dejar el fallback funcionando si Realtime no conecta, en vez de dejar la pantalla congelada sin avisar.

**Mutaciones: cinco RPC nuevas, mínimo**

- **D-16:** Consecuencia directa de la Fase 1, ya registrada en STATE.md y no negociable: `cleanings` tiene `grant select` puro para `authenticated`, y admin y aseador comparten ese rol de Postgres. **"Solo el admin" no existe como categoría de grant.** Toda mutación pasa por RPC `SECURITY DEFINER` que verifica el rol por dentro.
- **D-17:** Esta fase crea al menos: `reassign_cleaning` (ASEO-04), creación manual de aseo (ASEO-05, tipos `repaso` y `emergencia`), `reschedule_cleaning` (ASEO-06), `close_cleaning` (ASEO-08) y `cancel_cleaning` (ASEO-09). `confirm_cleaning` ya existe desde la Fase 1.
- **D-18: Reasignar es puntual y no toca el catálogo.** ASEO-04 cambia el aseador de **ese** aseo, nunca el responsable ni el suplente del apartamento. Es la confusión más fácil de cometer y la más cara de descubrir tarde.
- **D-19: El error de ASEO-07 tiene que ser legible.** El índice parcial `unique (property_id, scheduled_date) where estado <> 'cancelado'` ya impide el duplicado en la base desde la Fase 1. Cuando salte al crear un aseo manual, el admin tiene que leer "ya hay un aseo activo para ese apartamento en esa fecha", no un `23505`.

**Gestión externa (DASH-07)**

- **D-20: Fila informativa, inerte, en el mismo listado del día.** Los aseos de apartamentos con `gestion_vivaguest = false` se muestran con su fecha y a cargo de quién, **sin estado, sin aseador asignado, sin tarifa y sin ninguna acción**. No van a una vista aparte: el admin necesita verlos en el mismo día para tener el panorama completo, y necesita no poder tocarlos.
- **D-21:** El constraint `cl_unmanaged_is_inert` ya lo impone en la base (código `23514`, medido en la Fase 3). La UI refleja esa verdad, no la reimplementa.

**Historial del apartamento (DASH-06, REPORT-04)**

- **D-22: Vive dentro del detalle del apartamento que ya existe** (`app/(admin)/apartamentos/[id]`), no en una ruta nueva. Es cronológico e incluye los daños reportados.
- **D-23: Solo lectura.** Los RPC de reporte llegan en la Fase 6; aquí no se crea nada, se muestra.

### Claude's Discretion

- Estructura de rutas y archivos dentro de `(admin)`, y cómo se parte cada organismo.
- Nombres concretos y firmas exactas de las cinco RPC nuevas.
- Estados de carga, vacío y error de cada superficie, siguiendo el patrón que ya dejó la Fase 2.
- Si "Siguientes" agrupa por día o es una lista corrida, y cuántos días hacia adelante muestra.
- Elección concreta entre Realtime y polling si la investigación encuentra un impedimento real en el free tier, siempre que D-14 (la marca de tiempo visible) se conserve.

### Deferred Ideas (OUT OF SCOPE)

- **Semáforo de entregabilidad de push (NOTIF-V2-01)** — ya diferido a v2 el 2026-08-31.
- **Scorecard por aseador (PERF-V2-01)** — v2. La carga diaria de DASH-03 es un conteo operativo para decidir el suplente, no una métrica de desempeño. No confundirlas.
- **Dashboard de propietarios (OWNER-V2-01)** — v2.
- **El dead man's switch externo (T-03-85)** — sigue diferido. Esta fase cubre su mitad buena con `estadoDeSincronizacion()` al leer, y el hueco residual declarado se mantiene: si el admin no abre el panel, nadie se entera de que el scheduler murió.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Descripción | Qué de esta investigación lo habilita |
|----|-------------|----------------------------------------|
| ASEO-01 | Todo aseo nace en Pendiente sin confirmar y aparece en la bandeja "Sin confirmar" | Ya es verdad en la base: `tg_cleanings_snapshot()` pone `state='pendiente'` y `confirmado_at` nace nulo. Índice `cleanings_unconfirmed_idx` cubre la consulta de la bandeja literal. §Consulta de la pantalla |
| ASEO-02 | Admin confirma en un solo paso con huéspedes e instrucciones | `confirm_cleaning(uuid, smallint, text)` ya existe (migración 09). No se toca. §RPC existentes |
| ASEO-03 | Al confirmar queda asignado en firme al responsable | Lo hace `confirm_cleaning` leyendo `properties.responsable_id`. Levanta `sin_responsable` (P0001) si es nulo, y ese es el copy de §18.1 del UI-SPEC |
| ASEO-04 | Reasignar puntual sin tocar responsable ni suplente | `reassign_cleaning` nueva. §RPC 1/5, con la lista exacta de columnas que toca y las que tiene prohibido tocar |
| ASEO-05 | Crear aseos `repaso` y `emergencia` | `create_manual_cleaning` nueva. §RPC 2/5. `cl_manual_types` obliga `origin='manual'` para todo tipo distinto de `normal` |
| ASEO-06 | Reprogramar la fecha de un aseo | `reschedule_cleaning` nueva. **§Pitfall 1 es el riesgo mayor de toda la fase:** sin desapuntar `reservation_id`, el sync deshace la reprogramación en 30 minutos |
| ASEO-07 | Impedir segundo aseo activo por apartamento y fecha, con mensaje explícito | El índice ya existe. Lo que falta es que el 23505 llegue interpolado a la UI. §Pitfall 4 |
| ASEO-08 | Cerrar manualmente un aseo | `close_cleaning` nueva. **§Pitfall 2:** `cl_completada_shape` exige `started_at` no nulo, así que cerrar desde `pendiente` obliga a escribir las dos marcas |
| ASEO-09 | Cancelar un aseo | `cancel_cleaning` nueva, con slug nuevo de lista cerrada. §RPC 5/5 y §Slugs |
| DASH-01 | Servicios por día (hoy, mañana, siguientes) | Consulta única con embed, §Consulta de la pantalla. Índice `cleanings_agenda_idx` |
| DASH-02 | Bandeja persistente de sin confirmar | Subconjunto de la misma consulta, sin ida extra a la base |
| DASH-03 | Carga diaria por aseador | Agregación en memoria sobre las filas de hoy, §Consulta de la pantalla |
| DASH-04 | Panel de alertas de una sola jerarquía | §Panel de alertas: qué produce cada tipo hoy y cuáles no tienen productor |
| DASH-05 | Aseos con hora límite vencida sin terminar | **Computado al leer, no hay productor de `hora_limite_vencida` en ninguna migración.** §Pitfall 6 |
| DASH-06 | Historial cronológico del apartamento | `cleanings` + `damages`, dos consultas, ambas con `grant select` y policy admin |
| DASH-07 | Aseos de gestión externa con fecha y a cargo de quién, sin estado ni acciones | `is_managed=false` ⇒ `state is null` por CHECK. La UI lee, no reimplementa |
| REPORT-04 | Daños en el historial del apartamento | `damages` tiene `grant select` y `damages_admin_all`. Índice `damages_open_idx` es parcial sobre no resueltos: el historial completo no lo usa |
</phase_requirements>

---

## Summary

Esta fase es 80% base de datos y 20% pantalla, aunque parezca al revés. Las cinco RPC nuevas son escrituras sobre la tabla más restringida del sistema, y tres de ellas chocan con invariantes que la Fase 1 y la Fase 3 pusieron a propósito. El hallazgo más caro de esta investigación no está en ninguna de las preguntas que la fase venía a contestar: **`reschedule_cleaning` sobre un aseo de origen `ical`, escrito de la forma obvia, queda deshecho por el propio motor de sincronización en la siguiente corrida.** El bucle de "reserva movida" de la migración 13 selecciona los aseos cuyo `scheduled_date` difiere del `ends_on` de su reserva y los cancela con `cancel_reason='reserva_movida'`. Un aseo reprogramado a mano por el admin cumple ese predicado exactamente igual que uno cuya reserva se movió de verdad. El sync no puede distinguirlos, y no hay ningún candado que lo salve porque los cuatro candados existen para proteger de lo contrario. La salida es desapuntar `reservation_id` dentro de la RPC, y las consecuencias de esa decisión están medidas abajo.

El resto de la capa de base de datos es trabajo disciplinado más que arriesgado, con un patrón ya fijado literalmente en la migración 09: `security definer set search_path = ''`, guarda de rol por `private.is_admin()` (que consulta `profiles` y no el JWT), `for update` sobre la fila antes de escribirla, `42501` cuando el problema es de permiso y `P0001` con mensaje en español cuando el problema es de estado, y el par `revoke all ... from public, anon` / `grant execute ... to authenticated` pegado a cada definición porque en PG 17.6 no se hereda y está medido dos veces. El guardarraíl 9 de `02_guardarrailes.test.sql` es la única red que atrapa el olvido.

El panel de alertas tiene un hueco de producto que el planner tiene que ver antes de escribir tareas: de los siete tipos del UI-SPEC, **hoy solo tres tienen productor en el sistema** (`extension_sospechosa`, `calendario_caido`, y `no_puedo` que existe pero no se dispara hasta que haya PWA en la Fase 6). Dos más (`dano_reportado`, `faltantes_reportados`) no se escriben hasta la Fase 6. Uno (`hora_limite_vencida`) **no lo escribe nada, en ninguna migración**, y por eso es obligatoriamente computado. Y en sentido contrario, el tipo que más filas produce hoy en `notifications` es `aseo_cancelado` (cuatro variantes distintas en la migración 13), y **el UI-SPEC no lo mapea a ningún icono ni etiqueta**. Sin una entrada para él, el panel del admin renderiza en blanco justo las alertas que el motor genera de verdad.

Realtime cabe con holgura enorme: 200 conexiones concurrentes y 2 millones de mensajes al mes en el free tier, contra un admin con dos canales. El riesgo real no es la cuota, es que `postgres_changes` autoriza cada evento contra la RLS por suscriptor y que la tabla tiene que estar en la publicación `supabase_realtime`, que hoy no lo está. La integración recomendada con RSC es la mínima: cualquier evento dispara `router.refresh()`, sin leer el payload. Eso esquiva de un golpe `REPLICA IDENTITY FULL`, la fidelidad del filtrado y el problema de mantener dos fuentes de verdad en el cliente.

**Primary recommendation:** escribir la migración 15 completa (cinco RPC + publicación de Realtime) y su pgTAP en rojo ANTES de cualquier componente, y tratar el Pitfall 1 (reprogramar contra el reconcile) como decisión de diseño explícita con su propia aserción de integración, no como detalle de implementación.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Autorización de cada mutación de aseo | Database (RPC `SECURITY DEFINER` + `private.is_admin()`) | API (Server Action con `exigirAdmin()`) | D-16 lo fija: `authenticated` es un rol compartido, así que el grant no discrimina. El Server Action es defensa en profundidad y mensaje legible, no la frontera |
| Invariantes de aseo (unicidad por fecha, forma del estado, transiciones legales) | Database (índices parciales, CHECK, trigger `cleanings_snapshot`) | — | Ya existen desde la Fase 1. La UI los refleja, no los reimplementa (D-21) |
| Lectura de la operación del día | API / Backend (RSC con el JWT del admin, PostgREST + RLS) | — | `cleanings` tiene `grant select` y `cleanings_admin_all`. No hace falta vista ni RPC de lectura |
| Cómputo de las tres alertas derivadas (urgente, hora límite vencida, calendario caído) | API / Backend (`lib/domain/alertas.ts` sobre las filas ya leídas) | — | Son funciones puras sobre datos que la pantalla ya trajo. Meterlas en SQL obligaría a una vista más y a duplicar `UMBRAL_SYNC_CAIDA_MS` en dos lenguajes |
| Mezcla, orden y deduplicación del panel de alertas | API / Backend (`lib/domain/alertas.ts`, puro) | Browser (filtro por tipo) | El orden cronológico y la deduplicación son lógica de dominio con test unitario. El filtro es estado de UI |
| Frescura de datos y detección de degradación | Browser (canal de Realtime + `visibilitychange` + temporizador) | API (revalidación por `router.refresh()`) | Solo el navegador sabe si el WebSocket está vivo y si la pestaña está oculta |
| Marcar una alerta como atendida | API / Backend (Server Action con `UPDATE` de una sola columna) | Database (policy `notifications_own_update`) | `notifications` sí tiene `grant select, update`. No necesita RPC (verificado en migración 07, línea 159) |
| Revelar el código de acceso | Database (`reveal_access_code`) | — | **Fuera de alcance de esta fase.** D-12 lo excluye del `Sheet` explícitamente |

---

## Standard Stack

### Core

Ningún paquete nuevo. El stack está pineado y verificado en producción durante tres fases; esta fase no lo mueve.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | `15.5.24` | Framework, App Router, Server Actions | Pin del proyecto, build webpack. `[VERIFIED: package.json]` |
| `@supabase/supabase-js` | `2.112.4` | Cliente PostgREST + **Realtime** | El canal de Realtime sale del mismo cliente de navegador que ya existe en `lib/supabase/browser.ts`. `[VERIFIED: package.json]` |
| `@supabase/ssr` | `0.12.5` | Clientes SSR con cookies | Ya montado, `setAll` de dos argumentos. `[VERIFIED: package.json]` |
| `@base-ui/react` | `1.7.0` | Primitivas debajo de shadcn base-nova | `sheet` se apoya en `@base-ui/react/dialog`, que ya está instalado como dependencia de `dialog` y `alert-dialog`. **No hay instalación nueva.** `[VERIFIED: package.json + registry]` |
| `lucide-react` | `1.39.0` | Iconos | Los 27 iconos de UI-SPEC §17.3 verificados uno por uno contra el paquete instalado. `[VERIFIED: node -e require('lucide-react')]` |
| `zod` | `4.5.4` | Validación de input de Server Actions | Ya en uso en las tres `_actions.ts` existentes |
| `sonner` | `2.0.8` | Toasts | Ya montado |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `shadcn` (CLI) | `4.19.1` | Genera `components/ui/sheet.tsx` | Una sola invocación, `npx shadcn@4.19.1 add sheet`. **Genera código, no es dependencia runtime** |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Realtime `postgres_changes` | Sondeo puro cada 30 s con `router.refresh()` | Más simple, cero migración, cero cuota. Pierde la inmediatez que D-13 pide. **El fallback de D-15 es exactamente esto, así que hay que construirlo de todos modos**: Realtime queda como la capa que se puede quitar sin romper la pantalla |
| Realtime `postgres_changes` | Realtime Broadcast desde un trigger (`realtime.broadcast_changes`) | Escala mejor (no autoriza por suscriptor) y es lo que Supabase recomienda para volumen alto. Con un admin no compra nada y añade un trigger más a `cleanings`, que ya tiene tres. **No** |
| `router.refresh()` en cada evento | Estado local del cliente actualizado desde el payload | Evita un round-trip. Coste: duplicar la derivación de `estadoDeAseo()` y del panel en el cliente, y aceptar que el payload de RLS filtrada no siempre trae lo que la fila embebida traía. Peor relación coste/beneficio con 30 filas |
| Una consulta con embed | Una vista SQL `v_operacion_dia` | Una vista es una superficie más que versionar y `security_invoker` hay que acordarse de ponerlo. Con `grant select` ya dado y RLS ya escrita, PostgREST alcanza |

**Installation:**

```bash
npx shadcn@4.19.1 add sheet
```

---

## Package Legitimacy Audit

**Esta fase no instala ningún paquete de npm.** El único artefacto externo que entra es un bloque de código generado por el CLI de shadcn desde el registry oficial (`@shadcn`), y `components.json` tiene `"registries": {}`, así que no hay ningún registry de terceros configurado.

| Package | Registry | Disposition |
|---------|----------|-------------|
| (ninguno) | — | No aplica |

**Bloque de registry verificado el 2026-09-03** con `npx shadcn@4.19.1 view sheet`, ejecutado durante esta investigación:

- Un solo archivo: `registry/base-nova/ui/sheet.tsx`, `type: registry:ui`.
- `registryDependencies: ["button"]`, y `button` ya está instalado.
- Imports: `react`, `@base-ui/react/dialog`, `@/registry/base-nova/lib/utils`, `@/registry/base-nova/ui/button`, `@/app/(create)/components/icon-placeholder`. Los tres últimos los reescribe el CLI según los alias de `components.json`.
- **Sin `fetch`, sin `XMLHttpRequest`, sin `sendBeacon`, sin `process.env`, sin `eval`, sin `new Function`, sin import dinámico desde URL externa, sin nombres ofuscados.** Revisado sobre el JSON completo del bloque.

`[VERIFIED: npx shadcn@4.19.1 view sheet, 2026-09-03]`

---

## El `sheet` de shadcn: los tres arreglos, verificados

Corrí `npx shadcn@4.19.1 view sheet` el **2026-09-03** y leí el contenido literal del archivo. Los tres puntos del UI-SPEC §1.1 se confirman, con una corrección importante en el tercero.

### 1. `font-medium` en `SheetTitle` — CONFIRMADO, con una inconsistencia que el planner tiene que resolver

Literal del registry:

```tsx
className={cn(
  "cn-font-heading text-base font-medium text-foreground",
  className
)}
```

`font-medium` es peso 500 y el contrato de tipografía declara dos pesos, 400 y 600.

**Lo que el UI-SPEC no dice y esta investigación midió:** `font-medium` está en **todas** las primitivas ya instaladas, y la Fase 2 no lo quitó de ninguna. Medido con grep sobre `components/ui/`:

| Archivo instalado | Línea | Clase |
|---|---|---|
| `dialog.tsx:125` | `DialogTitle` | `font-heading text-base leading-none font-medium` |
| `alert-dialog.tsx:120` | `AlertDialogTitle` | `font-heading text-base font-medium` |
| `button.tsx:7` | base del botón | `text-sm font-medium` |
| `badge.tsx:8`, `label.tsx:12`, `card.tsx:41`, `table.tsx:87`, `field.tsx:33`, `alert.tsx:42`, `popover.tsx:64`, `progress.tsx:57`, `input-group.tsx:26`, `command.tsx:129`, `dropdown-menu.tsx:68`, `input.tsx:12` | varias | `font-medium` |

`[VERIFIED: grep sobre components/ui/, 2026-09-03]`

Arreglar solo `sheet` deja el único `Sheet` de la app en peso 600 y los cinco `Dialog`/`AlertDialog` de la misma pantalla en 500. **Recomendación:** aplicar el arreglo con `className="font-semibold"` en el sitio de uso (`<SheetTitle className="font-semibold">`), no editando el archivo vendorizado. Razones: `cn()` de `tailwind-merge` resuelve el conflicto `font-medium` vs `font-semibold` correctamente porque están en el mismo grupo y sin prefijo de variante; el archivo generado queda regenerable con el CLI; y la incoherencia con `dialog.tsx` queda declarada como deuda heredada en vez de repartida en dos archivos. Si el planner prefiere editar el archivo, entonces debe editar también `dialog.tsx` y `alert-dialog.tsx` en la misma tarea, porque los tres se ven al tiempo en `/operacion`.

### 2. `sm:max-w-sm` de 384px — CONFIRMADO, y el override necesita el prefijo de variante idéntico

Literal del registry, al final de la cadena de `SheetContent`:

```
data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full
data-[side=right]:w-3/4 data-[side=right]:border-l ...
data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm
```

Dos clases gobiernan el ancho: `data-[side=right]:w-3/4` y `data-[side=right]:sm:max-w-sm` (384px). D-09 pide 480px.

**El detalle que hace que el override funcione o no:** `tailwind-merge` solo considera en conflicto dos clases del mismo grupo **con la misma cadena de variantes**. Un `className="sm:max-w-sheet"` suelto NO desplaza a `data-[side=right]:sm:max-w-sm`; las dos sobreviven y gana la de mayor especificidad en el orden del CSS, que no está garantizado. El override tiene que repetir la variante exacta:

```tsx
<SheetContent
  side="right"
  className="data-[side=right]:sm:max-w-sheet data-[side=right]:w-full"
>
```

con el token de `@theme`:

```css
--container-sheet: 480px;   /* Tailwind v4 deriva max-w-sheet del namespace --container-* */
```

`[VERIFIED: contenido del registry + comportamiento documentado de tailwind-merge]` · `[ASSUMED]` la parte de que `w-3/4` conviene neutralizarlo con `w-full`: a 1440px, `w-3/4` son 1080px y el `max-w` de 480 manda igual, así que es cosmético; a menos de 640px el `sm:` no aplica y el sheet ocuparía 75%. Como `(admin)` no tiene vista móvil, es irrelevante en la práctica.

### 3. `IconPlaceholder` — CONFIRMADO en el registry, pero casi seguro NO va a aparecer en el archivo generado

Literal del registry:

```tsx
import { IconPlaceholder } from "@/app/(create)/components/icon-placeholder"
...
<IconPlaceholder lucide="XIcon" tabler="IconX" hugeicons="Cancel01Icon" phosphor="XIcon" remixicon="RiCloseLine" />
<span className="sr-only">Close</span>
```

Esa ruta no existe en este repo. **Pero el CLI resuelve el placeholder al instalar**, y hay prueba directa dentro del propio repo: `components/ui/dialog.tsx` viene del mismo registry con el mismo placeholder, y el archivo instalado dice:

```tsx
import { XIcon } from "lucide-react"
...
<XIcon />
<span className="sr-only">Close</span>
```

`[VERIFIED: components/ui/dialog.tsx líneas 8 y 72, contra el bloque del registry]`

**Conclusión operativa:** el arreglo 3 es una contingencia, no una tarea. La instrucción para el executor es: instalar, abrir el archivo, y **solo si** `IconPlaceholder` quedó literal, reemplazarlo por `<X className="size-4" aria-hidden="true" />` con `sr-only` a `Cerrar`. Lo que sí hay que hacer siempre es traducir el `sr-only` de `Close` a `Cerrar`, porque el CLI no traduce.

### Cuarto punto, no listado en el UI-SPEC

`SheetHeader` viene con `gap-0.5` (2px), que no está en la escala de espaciado (`xs` es 4px y es el mínimo declarado). `DialogHeader` instalado usa `gap-2` (8px). Si el contrato de espaciado se aplica con el mismo rigor que el de tipografía, esto también es una desviación. Es de la misma naturaleza que el punto 1 y se resuelve igual: `className` en el sitio de uso o no tocarlo y declararlo. **Lo dejo señalado, no resuelto: es una decisión del contrato de diseño, no de esta investigación.**

---

## Las cinco RPC nuevas

### El patrón, copiado literal de la migración 09

Las seis funciones existentes comparten una forma que no es estilo y cuyo incumplimiento tiene consecuencias medidas. Reproducirla exacta:

1. `language plpgsql security definer set search_path = ''`
2. Todo nombre calificado por esquema. Con `search_path` vacío no hay esquema implícito más allá de `pg_catalog`, y eso incluye `auth.uid()`.
3. Al lado de cada definición, sin excepción:
   ```sql
   revoke all     on function public.<f>(<args>) from public, anon;
   grant  execute on function public.<f>(<args>) to authenticated;
   ```
   No se hereda. Medido dos veces en PG 17.6: `alter default privileges ... revoke execute on functions from public, anon` no funciona porque Postgres refusiona `acldefault('f', owner)`, que siempre trae la entrada `=X` de PUBLIC. El guardarraíl 9 de `02_guardarrailes.test.sql` (`has_function_privilege('anon', p.oid, 'execute')` sobre todo `public` y `private`) es la única red.
4. Guarda de rol con `private.is_admin()`, que consulta `profiles` en la base y **nunca un claim del JWT**: un admin degradado hace un minuto no puede mutar con su token todavía vivo.
5. `select ... for update of c` sobre la fila objetivo antes de escribirla. El `of c` importa: sin él, un join con `properties` bloquea también el apartamento y serializa mutaciones de aseos distintos del mismo apartamento sin necesidad.
6. **La discriminación de errores es contrato con la UI:**
   - `42501` cuando el problema es de permiso o cuando distinguir el caso sería un oráculo de enumeración.
   - `P0001` con `hint` cuando el admin sí está autorizado y lo que falla es el estado del aseo. `mapDbError()` devuelve `message` tal cual para `P0001`, así que ese texto **ya tiene que venir redactado en español desde la función**.
7. `public.today_bog()` y nunca `current_date`. La sesión corre en UTC; pasadas las 19:00 de Bogotá `current_date` ya es mañana. Verificado por grep en `scripts/ci/check-service-role.sh`.
8. **No insertar a mano en `cleaning_state_transitions`.** El trigger `cleanings_log_transition` (AFTER UPDATE OF state) ya escribe la fila, con `reason = new.cancel_reason` cuando el destino es `cancelada`. Insertar a mano produce dos filas y la de mano es la mentirosa.

`[VERIFIED: supabase/migrations/20260831223038_09_rpc.sql, leído completo]`

### El mapa de invariantes que estas RPC pueden violar

| Invariante | Dónde vive | Código | Qué RPC lo puede disparar |
|---|---|---|---|
| `cleanings_one_active_per_property_date` (índice único parcial `where state is distinct from 'cancelada'`) | migración 04 | 23505 | `create_manual_cleaning`, `reschedule_cleaning` |
| `cleanings_one_live_per_reservation` (`where reservation_id is not null and state is distinct from 'cancelada'`) | migración 04 | 23505 | `reschedule_cleaning` si conserva `reservation_id` |
| `cl_unmanaged_is_inert` | migración 04 | 23514 | Las cinco, si no filtran por `is_managed` |
| `cl_managed_has_state` | migración 04 | 23514 | `create_manual_cleaning` sobre unidad gestionada sin dejar que el trigger ponga el estado |
| `cl_completada_shape` (`started_at` y `finished_at` no nulos, `finished_at >= started_at`) | migración 04 | 23514 | **`close_cleaning`, siempre que venga de `pendiente`.** Ver Pitfall 2 |
| `cl_cancelada_shape` (`cancelled_at` no nulo) | migración 04 | 23514 | `cancel_cleaning` |
| `cl_pendiente_shape` (`started_at` y `finished_at` nulos) | migración 04 | 23514 | Ninguna de las cinco escribe un `pendiente` con marcas, pero es la que rompería un `reopen` si alguien lo añade |
| `cl_manual_types` (`origin='manual' or tipo='normal'`) | migración 04 | 23514 | `create_manual_cleaning` si olvida `origin='manual'` |
| Guarda de transiciones (`completada` y `cancelada` son terminales) | trigger `cleanings_snapshot`, migración 05 | P0001 `transicion_invalida` | `close_cleaning` y `cancel_cleaning` sobre un aseo ya cerrado |
| Congelación de tarifas en estado terminal | trigger `cleanings_snapshot`, migración 05 | (no falla, reimpone) | Ninguna: es benigno, pero explica por qué un UPDATE sobre un aseo terminal no revienta |
| `is_managed` inmutable en UPDATE | trigger `cleanings_snapshot` | (no falla, reimpone) | — |

Las transiciones legales son exactamente seis y están escritas literales en la migración 05: `pendiente → {en_curso, completada, cancelada}` y `en_curso → {pendiente, completada, cancelada}`. `pendiente → completada` está contemplada y su comentario dice literalmente "cierre manual del admin (ASEO-08)". Igual `pendiente → cancelada` y `en_curso → cancelada`. **La máquina de estados no hay que tocarla.** Ya lo anticipa el bloque de cierre de la migración 09.

`[VERIFIED: migraciones 04 y 05, leídas completas]`

### RPC 1/5 — `reassign_cleaning(p_cleaning uuid, p_aseador uuid)` (ASEO-04, D-18)

**Columna que toca: `cleanings.aseador_id`, y ninguna más.** No toca `properties.responsable_id` ni `properties.suplente_id`. Esas dos columnas no aparecen ni en el `update` ni en el `select`, y la aserción pgTAP tiene que leerlas antes y después.

Precondiciones que la función debe verificar:

- `private.is_admin()` → si no, `42501`.
- El aseo existe, `is_managed`, y `state in ('pendiente','en_curso')` → si no, `P0001 aseo_no_reasignable`.
- `confirmado_at is not null`. Reasignar un aseo sin confirmar no tiene sentido: `confirm_cleaning` es quien asigna en firme (ASEO-03), y un `pendiente` sin confirmar tiene `aseador_id` nulo. **`[ASSUMED]` esta precondición es criterio mío, no viene de ningún documento. Si el planner prefiere permitirlo, hay que revisar que la fila resultante no viole `cl_pendiente_shape` (no lo viola: ese CHECK solo mira `started_at`/`finished_at`).**
- El destino es un perfil con `role='aseador'` y `is_active` → si no, `P0001 aseador_invalido`. Sin esto se puede reasignar a un admin o a un aseador dado de baja, y la FK sola no lo impide.
- Si `state='en_curso'`: `cl_en_curso_shape` exige `aseador_id` no nulo, y como se sustituye por otro no nulo, pasa. **Pero reasignar un aseo en curso deja el `started_at` de la persona anterior sobre el nombre de la nueva.** Es un caso raro y probablemente hay que prohibirlo (`state='pendiente'` a secas) o aceptarlo con los ojos abiertos. **Decisión del planner, con recomendación de restringir a `pendiente`:** un aseo que ya empezó lo devuelve el `no puedo` del aseador (Fase 6), que sí limpia `started_at`.

**Outbox:** `confirm_cleaning` escribe una notificación `asignacion` con `dedupe_key = 'assign:' || cleaning || ':' || aseador`. Como la clave incluye al aseador, reasignar a otra persona produce una fila nueva y correcta; reasignar a la misma no duplica. **Recomendación: `reassign_cleaning` encola la misma notificación `asignacion` para el nuevo aseador**, con el mismo formato de `dedupe_key` y el mismo `on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing` (el `where` no es opcional: sin él Postgres no reconoce el índice parcial como árbitro y falla con 42P10). Nadie la drena hasta la Fase 5, que es la costura conocida.

### RPC 2/5 — `create_manual_cleaning(p_property uuid, p_fecha date, p_tipo public.cleaning_type)` (ASEO-05)

Inserta cinco columnas y ninguna más: `property_id`, `origin='manual'`, `tipo`, `scheduled_date`, y `reservation_id` implícito nulo. `is_managed`, `state`, `hora_limite`, `tarifa_huesped` y `pago_aseador` las pone `tg_cleanings_snapshot()`; los CHECK de tabla se evalúan después de los triggers BEFORE, así que el NOT NULL de `hora_limite` y de `is_managed` se satisface sin que la función sepa nada de ellos. Es exactamente lo que hace el paso (c) del sync.

Precondiciones:

- `private.is_admin()` → `42501`.
- El apartamento existe, `is_active` y `gestion_vivaguest` → si no, `P0001`. El UI-SPEC §12.3 ya restringe el combobox a unidades gestionadas y activas, pero un Server Action es un endpoint público y el combobox no autoriza nada.
- `p_tipo in ('repaso','emergencia')` → `P0001`. `normal` no es opción (§12.3): los normales los crea el sync.
- `p_fecha >= public.today_bog()`.

**El 23505 se deja propagar, no se captura.** Postgres emite `duplicate key value violates unique constraint "cleanings_one_active_per_property_date"` y PostgREST lo entrega con `code: '23505'` y ese mensaje. `mapDbError()` ya tiene la entrada por nombre de índice. Ver Pitfall 4 para el problema de interpolación.

**Efecto lateral que hay que documentar en el copy, no en el código:** un aseo manual en la fecha de un checkout futuro hace que el sync **nunca cree** el aseo normal de ese checkout, porque su `insert ... on conflict do nothing` del paso (c) choca contra el índice y se lo traga en silencio. El comentario de la migración 12 lo declara legítimo ("el admin ya puso algo ahí y el sync no lo pisa"). El caso realista es benigno (un `repaso` en un día sin checkout), pero está bien saberlo.

### RPC 3/5 — `reschedule_cleaning(p_cleaning uuid, p_fecha date)` (ASEO-06)

**Es la RPC de mayor riesgo de la fase. Leer el Pitfall 1 completo antes de escribirla.**

Columnas que toca: `scheduled_date` y, por la recomendación del Pitfall 1, `reservation_id := null`.

Precondiciones:

- `private.is_admin()` → `42501`.
- `is_managed` → si no, un aseo de gestión externa no se reprograma a mano: lo reprograma el sync solo (la rama `if not mv.is_managed` de la migración 13 lo hace ya). `P0001`.
- `state in ('pendiente','en_curso')`, y probablemente solo `pendiente`. **`[ASSUMED]`.**
- `p_fecha >= public.today_bog()` (el UI-SPEC pone `min = today_bog()` en el input, y el input no autoriza nada).
- `p_fecha <> scheduled_date` actual, si no es un no-op.

El 23505 se deja propagar igual que en `create_manual_cleaning`. El UI-SPEC §12.2 dice que ese error va **inline bajo el campo de fecha**, no en toast.

### RPC 4/5 — `close_cleaning(p_cleaning uuid)` (ASEO-08)

**El detalle que rompe la implementación obvia:** `cl_completada_shape` exige `started_at is not null and finished_at is not null and finished_at >= started_at`. Un aseo en `pendiente` tiene `started_at` nulo. Un `update set state='completada', finished_at=now()` a secas revienta con 23514 sobre ese CHECK.

La escritura correcta tiene que cubrir las dos procedencias:

```sql
update public.cleanings
   set state       = 'completada',
       started_at  = coalesce(started_at, now()),
       finished_at = now()
 where id = p_cleaning;
```

`coalesce` y no asignación directa: si el aseo venía de `en_curso`, su `started_at` real es información y no se pisa. Si venía de `pendiente`, `started_at = finished_at = now()` satisface `finished_at >= started_at` por igualdad. **Ojo con escribir `now()` dos veces literales:** dentro de una misma sentencia `now()` es constante de transacción, así que las dos dan el mismo valor y la igualdad se cumple; no hace falta variable intermedia, pero conviene decirlo porque un refactor a `clock_timestamp()` lo rompería.

Precondiciones: `is_admin()`, `is_managed`, `state in ('pendiente','en_curso')`. Sobre un `completada` o `cancelada` la guarda de transiciones del trigger levanta `P0001 transicion_invalida` sola, pero el `hint` de esa excepción habla de la máquina de estados y no del caso del admin: mejor cortar antes con un `P0001 aseo_no_cerrable` que diga "este aseo ya está cerrado o cancelado".

Nota: `cl_completada_shape` **no** exige `aseador_id`, así que cerrar manualmente un aseo sin confirmar y sin aseador es válido en el schema. Es coherente con el copy del UI-SPEC §12.4 ("Úsalo solo cuando el aseo ya ocurrió por fuera del sistema"). Se recomienda permitirlo.

Outbox: `finish_cleaning` encola `aseo_completado` para todos los admins con `dedupe_key = 'done:' || cleaning`. **Recomendación: `close_cleaning` NO lo encola.** El admin acaba de hacerlo él mismo; notificarse a sí mismo por su propia acción es ruido, y `notifications` es la fuente del panel de alertas.

### RPC 5/5 — `cancel_cleaning(p_cleaning uuid)` (ASEO-09)

```sql
update public.cleanings
   set state         = 'cancelada',
       cancelled_at  = now(),
       cancel_reason = 'cancelado_por_admin'
 where id = p_cleaning;
```

- `cl_cancelada_shape` exige `cancelled_at` no nulo.
- **El slug es literal dentro del cuerpo de la función, nunca parámetro.** Regla explícita de la migración 13, líneas 119-133: `cancel_reason` es lista cerrada porque es una columna que un humano lee en pantalla y porque leerla de vuelta abriría una ruta de texto libre hacia el payload de notificaciones. El UI-SPEC §12.5 ya elimina el textarea de motivo del diálogo por esta razón.
- El trigger `cleanings_log_transition` copia `cancel_reason` a `cleaning_state_transitions.reason` cuando el destino es `cancelada`, así que el slug queda en la bitácora sin escribir nada más.
- **Sin "Deshacer".** `cancelada` es terminal por la guarda de transiciones; reactivar no es una operación que exista.

Precondiciones: `is_admin()`, `is_managed`, `state in ('pendiente','en_curso')`.

### Slugs de `cancel_reason`: la lista cerrada completa tras esta fase

`[VERIFIED: grep sobre supabase/migrations/, único productor es la migración 13]`

| Slug | Quién lo escribe | Copy en pantalla (UI-SPEC §18.2) |
|---|---|---|
| `reserva_desaparecida` | `sync_feed_apply()`, migración 13 línea 577 | `La reserva desapareció del calendario.` |
| `reserva_movida` | `sync_feed_apply()`, migración 13 línea 705 | `La reserva cambió de fecha.` |
| `cancelado_por_admin` **(nuevo en esta fase)** | `cancel_cleaning()` | `Lo cancelaste tú.` |
| cualquier otro | — | `Cancelado.` Nunca el slug crudo, ni como respaldo |

No hay ningún CHECK que restrinja `cancel_reason` a esa lista: la columna es `text` libre. La lista es una convención impuesta por "el slug se escribe literal dentro de la función y las funciones son las únicas que escriben la columna". **Sugerencia para el planner:** una aserción estructural pgTAP sobre el cuerpo de las funciones (`pg_get_functiondef`) que verifique que ningún `cancel_reason` se asigna desde un parámetro. Es el mismo mecanismo que la aserción 50 de `05_sync.test.sql` usa para `needs_review`.

Los seis slugs de `review_reason` los escribe solo la migración 13 y ninguna RPC de esta fase los toca. **Pero `needs_review` es pegajoso a propósito y "solo el admin lo apaga, en la Fase 4"** (comentario literal de la migración 13, línea 106). **Eso implica una sexta RPC que D-17 no lista y que ningún requisito nombra.** Ver `## Open Questions` #1.

---

## Consulta que alimenta la pantalla

### Una sola ida a la base para el carril ancho, la bandeja y los chips

Las tres superficies son proyecciones distintas del **mismo conjunto de filas**: los aseos desde `today_bog()` hacia adelante. Traerlas por separado sería tres viajes para los mismos datos y tres momentos de lectura distintos, lo que rompe D-14 (¿cuál de las tres marcas de tiempo se muestra?).

```ts
const { data } = await supabase
  .from('cleanings')
  .select(`
    id, scheduled_date, state, tipo, hora_limite, is_managed, is_urgent,
    needs_review, review_reason, cancel_reason, confirmado_at, num_huespedes,
    started_at, finished_at, aseador_id, property_id, created_at,
    property:properties!cleanings_property_id_fkey (
      id, nombre, gestion_vivaguest, contacto_externo, hora_limite
    ),
    aseador:profiles!cleanings_aseador_id_fkey ( id, full_name )
  `)
  .gte('scheduled_date', hoy)
  .lte('scheduled_date', horizonte)
  .order('scheduled_date', { ascending: true })
  .order('hora_limite',    { ascending: true });
```

- **El alias de FK no es opcional.** `cleanings` tiene **dos** claves foráneas a `profiles`: `cleanings_aseador_id_fkey` y `cleanings_confirmado_by_fkey`. Un embed `profiles(...)` sin calificar es ambiguo y PostgREST responde `PGRST201` ("Could not embed because more than one relationship was found"). Lo mismo pasa en `damages`, que tiene `damages_reported_by_fkey` y `damages_resolved_by_fkey`. `[VERIFIED: lib/database.types.ts, bloque Relationships de cleanings y damages]`
- **No hay N+1.** Un embed de PostgREST es un `LEFT JOIN LATERAL` en una sola consulta, no una por fila.
- **La RLS del embed también aplica.** El admin pasa `properties_admin_all` y `profiles_admin_all`, así que ve todo. Un aseador no llegaría a esta ruta, pero si llegara vería sus propias filas por `cleanings_cleaner_select` y `properties_cleaner_select` filtraría el embed a los apartamentos de su ventana. No hay fuga.
- **Índice:** `cleanings_agenda_idx on (scheduled_date, state) where is_managed`. El `where is_managed` es parcial, así que **no cubre las filas de gestión externa** que DASH-07 sí necesita mostrar. Con 34+5 unidades y decenas de filas por día es irrelevante, pero conviene no afirmar que la consulta usa el índice.
- **Cancelados:** la consulta de arriba los trae. El UI-SPEC §7.2 menciona un toggle de cancelados, así que traerlos y filtrar en memoria es correcto. Si el volumen creciera, `.neq('state','cancelada')` con el operador de distinción no está disponible en PostgREST y habría que usar `.or('state.is.null,state.neq.cancelada')`, que es exactamente la razón por la que la regla transversal del proyecto dice `is distinct from` en SQL.

### Las tres proyecciones, en memoria

| Superficie | Derivación |
|---|---|
| Bloques de día (DASH-01) | `groupBy(scheduled_date)`, con `hoy`, `hoy+1` y el resto |
| Bandeja "Sin confirmar" (DASH-02) | `filter(c => c.is_managed && c.state === 'pendiente' && c.confirmado_at === null)`. Es exactamente el predicado del índice `cleanings_unconfirmed_idx` |
| Chips de carga (DASH-03) | `countBy(aseador_id)` sobre las filas de hoy, gestionadas, con estado vivo |

El horizonte de "Siguientes" es discreción del planner (04-CONTEXT). **Recomendación: `today_bog() + 14`.** El feed de Airbnb tiene ventana propia y las reservas llegan con semanas de antelación; catorce días caben en un `select` trivial y cubren el horizonte de decisión operativa.

### Las tres consultas adicionales

| Consulta | Para qué | Nota |
|---|---|---|
| `notifications` del admin | Panel de alertas | `.eq('recipient_id', user.id).is('read_at', null).order('created_at', {ascending:false})`. Coincide exacto con `notifications_inbox_idx`, que es parcial `where read_at is null`. **El toggle "Ver atendidas" cae fuera del índice**: seq scan, irrelevante hoy |
| `select max(last_success_at) from calendar_feeds where is_active` | Alerta global de calendario caído | PostgREST no tiene `max()`; se resuelve con `.select('last_success_at').eq('is_active',true).order('last_success_at',{ascending:false, nullsFirst:false}).limit(1)`. **`nullsFirst:false` importa:** un feed que nunca sincronizó tiene `last_success_at` nulo y por defecto PostgREST ordena nulos primero en descendente, lo que devolvería `null` y `estadoDeSincronizacion(null, …)` daría `'caida'` con el sistema sano |
| `profiles` con `role='aseador'` e `is_active` | Chips y `Select` de reasignar | Ya existe el patrón en `lib/data/aseadores.ts` |

`[VERIFIED: migración 06 líneas 134-143 para los índices; lib/domain/salud-sync.ts para el contrato de `estadoDeSincronizacion`]`

---

## El panel de alertas: qué existe de verdad

### Inventario de productores, medido

Corrí `grep -rn "::public.notification_type" supabase/migrations/` sobre las 14 migraciones (excluyendo los duplicados con sufijo ` 2`). El resultado completo:

| `notification_type` | ¿Se escribe hoy? | Dónde | Destinatario |
|---|---|---|---|
| `asignacion` | Sí | `confirm_cleaning()` | El aseador responsable |
| `aseo_completado` | Sí | `finish_cleaning()` | Todos los admins activos |
| `no_puedo` | Sí, pero sin disparador real hasta la Fase 6 | `decline_cleaning()` | Todos los admins activos |
| `aseo_cancelado` | **Sí, cuatro variantes** | `sync_feed_apply()`, migración 13 líneas 949, 971, 993, 1015 | Todos los admins activos |
| `extension_sospechosa` | Sí | migración 13 línea 1037 | Todos los admins activos |
| `calendario_caido` | **Sí, cinco variantes** | migración 13 línea 1065 (formato desconocido) y migración 14 líneas 289, 340, 410, 433 | Todos los admins activos |
| `dano_reportado` | **No.** Enum sin productor | (Fase 6) | — |
| `faltantes_reportados` | **No.** Enum sin productor | (Fase 6) | — |
| `gasto_reportado` | **No.** Enum sin productor | (Fase 6) | — |
| `hora_limite_vencida` | **No. Nada lo escribe en ninguna migración** | — | — |
| `retencion_proxima` | **No.** Enum sin productor | (Fase 9) | — |

`[VERIFIED: grep exhaustivo sobre supabase/migrations/*.sql, 2026-09-03]`

### Tres consecuencias que el planner tiene que absorber

**1. `aseo_cancelado` es hoy el tipo más productivo del sistema y el UI-SPEC §11.1 no lo mapea.** Las cuatro variantes de la migración 13 son las que el motor emite de verdad en operación normal: "Aseo cancelado por el calendario" (dos motivos) y "Aseo marcado para revisión" (dos motivos). Sin entrada en el mapa tipo→icono/etiqueta, esas filas o se caen del panel o se renderizan sin rótulo. Las dos opciones son bugs.

**Recomendación:** el mapa de tipos de `lib/domain/alertas.ts` cubre **los once valores del enum**, no siete, y el fallback para un tipo desconocido es una etiqueta genérica (`AVISO`) con icono `Bell`, nunca la fila descartada. Los tipos sin superficie propia hoy (`asignacion`, `aseo_completado`, `gasto_reportado`, `retencion_proxima`) se resuelven ahí. El discriminador fino de `aseo_cancelado` está en `payload.motivo` (`reserva_desaparecida`, `reserva_movida`, `reserva_desaparecida_no_cancelable`, `reserva_movida_no_cancelable`) y en `payload.scope` (`aseo` / `feed` / `job`), que es un campo `jsonb` que ya viene poblado.

Esto **no rompe el criterio 4**: todos comparten la misma jerarquía visual, que es lo que el requisito pide. Añadir tipos al mapa no jerarquiza nada.

**2. `hora_limite_vencida` es obligatoriamente computada.** No hay decisión que tomar: el enum existe y nada lo escribe. La deduplicación que el UI-SPEC §11.2 describe ("una alerta computada se suprime si ya existe una notificación del mismo tipo y con el mismo `cleaning_id`") **hoy no puede activarse nunca** para ese tipo. Se escribe igual, porque es barata y porque la Fase 5 o la 9 pueden añadir el productor, pero el test de deduplicación necesita una fila sembrada a mano y hay que decirlo en el plan para que nadie crea que prueba un caso real.

**3. Cinco de las once notificaciones del sistema van a "todos los admins activos".** `notifications.recipient_id` es NOT NULL y referencia `profiles`: no existe "una notificación para el rol", cada alerta se inserta una vez por admin activo. Con un admin es una fila; con tres son tres filas independientes y **marcar una como atendida no la marca para los demás**. Es correcto por diseño (`read_at` es por destinatario) pero conviene saberlo antes de que alguien lo reporte como bug.

### Las tres alertas computadas: derivación exacta

| Tipo | Predicado | Instante para el orden cronológico | Fuente del dato |
|---|---|---|---|
| Urgente | `is_urgent and is_managed and state in ('pendiente','en_curso') and scheduled_date >= hoy` | `cleanings.created_at` | Columna `is_urgent`, recalculada en cada corrida del sync. Su semántica exacta: existe una reserva viva del mismo apartamento cuyo `starts_on` es el `scheduled_date` del aseo, es decir checkout y checkin el mismo día (migración 13, línea 820) |
| Hora límite vencida | `is_managed and state in ('pendiente','en_curso') and (scheduled_date + hora_limite) < ahora en Bogotá` | `scheduled_date + hora_limite` | `cleanings.hora_limite`, que es **snapshot del apartamento al crear el aseo**, no un join vivo contra `properties.hora_limite`. El UI-SPEC §11.2 dice `properties.hora_limite`; **la columna correcta es `cleanings.hora_limite`**, porque APTO-05 permite que un aseo puntual pacte hora distinta y el `coalesce` del trigger lo respeta |
| Calendario caído (global) | `estadoDeSincronizacion(max(last_success_at de feeds activos), Date.now()) === 'caida'` | `max(last_success_at) + UMBRAL_SYNC_CAIDA_MS` | `lib/domain/salud-sync.ts`, ya escrito y con tests |

**Sobre la comparación de la hora límite:** `scheduled_date` es `date` y `hora_limite` es `time`, las dos sin zona. El instante de vencimiento es "ese día a esa hora, en Bogotá". Comparado desde TypeScript, la forma sin trampa es construir el string `'YYYY-MM-DDTHH:mm:00-05:00'` y pasarlo por `Date.parse`, exactamente el mismo truco de desfase explícito que `estadoDeSincronizacion` ya usa y que su comentario documenta como medido en rojo. **Prohibido `new Date('2026-09-04')`**, que se parsea como medianoche UTC y en Bogotá renderiza el día anterior (regla ya escrita en `lib/domain/dates.ts`). Colombia no tiene DST desde 1993, así que `-05:00` fijo es correcto y es la razón por la que `TZ_BOGOTA` existe como única constante de zona del repo.

### `UMBRAL_SYNC_CAIDA_MS` contra el `interval '3 hours'`: sigue cuadrando

Verificado el 2026-09-03:

- `lib/domain/salud-sync.ts:62` → `export const UMBRAL_SYNC_CAIDA_MS = 3 * 60 * 60 * 1000;`
- `supabase/migrations/20260902235500_14_sync_jobs.sql:247` y `:321` → `f.last_success_at < now() - interval '3 hours'` (dos ocurrencias: el conteo de obsoletos y la agregación de ids).

Los dos dicen tres horas. `[VERIFIED: lectura directa de los dos archivos]`

**Cómo evitar que se desincronicen.** Hoy solo lo protege un comentario en cada lado. Tres opciones, de menor a mayor coste:

1. **Aserción estructural en pgTAP** (recomendada). El mismo mecanismo que la aserción 50 de `05_sync.test.sql` usa para verificar que `needs_review` nunca se apaga: leer `pg_get_functiondef('public.feed_health_watchdog'::regproc)` y afirmar que contiene `interval '3 hours'` un número exacto de veces. Coste: cinco líneas. Atrapa el cambio en SQL. **No atrapa el cambio en TypeScript.**
2. **Test unitario espejo**: un test en `lib/domain/salud-sync.test.ts` que afirme `UMBRAL_SYNC_CAIDA_MS === 3*60*60*1000` con un comentario que apunte a la migración. Coste: dos líneas. Atrapa el cambio en TS. **No atrapa el cambio en SQL.**
3. **Las dos.** Cada lado tiene una prueba que grita si su valor se mueve, y las dos citan al otro. Es lo que recomiendo: son siete líneas y cierran las dos direcciones.

Lo que **no** recomiendo es mover el umbral a `app_settings` para leerlo desde los dos lados. Convertiría una constante en una consulta dentro del watchdog, en una consulta más en cada render del panel, y el valor pasaría a ser dato mutable en producción sin revisión de código. El acoplamiento actual es correcto: es la misma pregunta, contestada dos veces a propósito porque una de las dos veces tiene que funcionar cuando la base no ejecuta nada.

---

## Realtime en el free tier

### Los números, de la documentación oficial leída el 2026-09-03

| Límite (plan Free) | Valor |
|---|---|
| Conexiones concurrentes (peak connections) | **200** |
| Mensajes al mes incluidos | **2.000.000** |
| Mensajes por segundo | 100 |
| Uniones a canal por segundo (channel joins/s) | 100 |
| Canales por conexión | 100 |
| Tamaño de payload de `postgres_changes` | 1.024 KB |
| Tamaño de payload de broadcast | 256 KB |

`[CITED: supabase.com/docs/guides/realtime/quotas, supabase.com/docs/guides/realtime/limits, supabase.com/docs/guides/realtime/pricing, consultadas 2026-09-03]`

**Con un admin, cabe con holgura ridícula.** Un navegador abre **una** conexión WebSocket y multiplexa los canales por dentro, así que dos suscripciones (`cleanings` y `notifications`) son 1 de 200 conexiones y 2 de 100 canales. El volumen de mensajes: el sync corre cada 30 minutos sobre 34 feeds y en régimen estacionario crea 0 aseos por corrida (idempotencia medida en la Fase 3), así que los eventos reales son las mutaciones del admin más las escrituras del sync cuando de verdad cambia algo. Estimación de orden de magnitud: cientos de mensajes al día contra un presupuesto de 2 millones al mes. **Ningún tope sorprende.**

**El único límite que puede morder no es de cuota, es de comportamiento:** la documentación dice que las conexiones **se desconectan** si el proyecto excede el throughput de mensajes, y se reconectan solas cuando baja. Es otra razón para que el fallback de D-15 exista y funcione, no para no usar Realtime.

### `postgres_changes`, RLS y la publicación

Tres hechos de la documentación oficial, con su consecuencia para esta fase:

1. **La tabla tiene que estar en la publicación `supabase_realtime`.** Hoy no lo está: `grep -rn "supabase_realtime" supabase/migrations/` no devuelve ninguna ocurrencia. Hace falta una sentencia en la migración 15:

   ```sql
   alter publication supabase_realtime add table public.cleanings;
   alter publication supabase_realtime add table public.notifications;
   ```

   `[VERIFIED: ausencia medida por grep sobre supabase/migrations/]` · `[CITED: supabase.com/docs/guides/realtime/postgres-changes]`

   **Trampa de idempotencia:** `alter publication ... add table` falla si la tabla ya está. En un proyecto hospedado, la publicación puede traer tablas añadidas desde el Studio. La forma segura es un `do $$ ... $$` que consulte `pg_publication_tables` antes, o `alter publication supabase_realtime drop table ... ` previo dentro de un bloque con `exception when undefined_object then null`. **`[ASSUMED]` sobre el estado de la publicación en el proyecto hospedado: no existe todavía (checkpoint A1 de la Fase 1 sigue abierto), así que no se puede medir.**

2. **`postgres_changes` autoriza cada evento contra la RLS, por suscriptor.** Cita literal de la doc: *"Postgres Changes authorizes every event against each subscriber."* Para `cleanings` eso significa evaluar `cleanings_admin_all` → `private.is_admin()` → consulta a `profiles`. Con un suscriptor es un `exists` por evento. El benchmark que la doc publica (500 clientes con RLS: 6 cambios/s por cliente) describe un régimen que este proyecto no alcanza ni de lejos.

3. **`REPLICA IDENTITY FULL` solo hace falta para filtrar eventos DELETE**, y para que `old_record` venga poblado en los UPDATE. **Esta fase no lo necesita** con la integración recomendada abajo, y no ponerlo es mejor: `REPLICA IDENTITY FULL` mete la fila entera en el WAL en cada UPDATE, que es coste permanente en la base a cambio de nada aquí.

### El patrón de integración con App Router y RSC

**Recomendación: la suscripción es un disparador, no una fuente de datos.** El componente servidor hace el primer render con la consulta del §Consulta de la pantalla; un componente cliente pequeño abre los canales y, ante cualquier evento, llama `router.refresh()`.

```tsx
'use client';

export function SincronizacionEnVivo({ onLectura }: { onLectura: (ms: number) => void }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createBrowserClient();

    const refrescar = () => { router.refresh(); onLectura(Date.now()); };

    const canal = supabase
      .channel('operacion')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cleanings' },     refrescar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, refrescar)
      .subscribe((status) => {
        // 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED'
        setEnVivo(status === 'SUBSCRIBED');
      });

    return () => { supabase.removeChannel(canal); };
  }, [router]);
}
```

**Por qué `router.refresh()` y no estado local:**

- El servidor ya sabe derivar todo (estado del aseo, mezcla de alertas, conteos). Duplicar esa derivación en el cliente es duplicar `lib/domain/`.
- El payload de `postgres_changes` trae **la fila cruda de `cleanings`, sin los embeds**. Actualizar estado local con él dejaría el nombre del apartamento y el del aseador sin resolver, obligando a una consulta extra por evento: el N+1 que la consulta con embed evitó.
- Evita `REPLICA IDENTITY FULL`.
- `router.refresh()` conserva el estado del cliente (qué días están colapsados, el filtro del panel, el `Sheet` abierto), que es exactamente lo que un `location.reload()` destruiría.

**Coste honesto:** cada evento es un round-trip completo al servidor y una consulta nueva. Con ráfagas de 15 aseos entrando de golpe, el sync escribe 15 filas en una transacción y llegarían 15 eventos, es decir 15 `router.refresh()`. **Hace falta un debounce.** Recomendación: acumular durante 400 ms y refrescar una vez. Es la única complicación real del patrón y es cinco líneas.

### El estado de la conexión y la degradación (D-15)

`channel.subscribe((status, err) => ...)` entrega cuatro estados: `SUBSCRIBED`, `CHANNEL_ERROR`, `TIMED_OUT`, `CLOSED`. `[CITED: supabase.com/docs/reference/javascript/subscribe]`

La máquina que el UI-SPEC §13.2 pide sale de ahí directa:

| Estado del canal | Línea visible | Refresco de respaldo |
|---|---|---|
| `SUBSCRIBED` | `Actualizado hace 2 min (14:32)` | revalidación cada 120 s |
| `CHANNEL_ERROR` / `TIMED_OUT` / `CLOSED`, o nunca llegó a `SUBSCRIBED` | `WifiOff` + `Sin conexión en vivo. Actualizado hace 40 s (14:32).` en `--status-warn` | sondeo cada 30 s |
| `document.visibilityState === 'hidden'` | (sin cambio) | **todo pausado**; al volver a visible, lectura inmediata |

Dos detalles que se pasan por alto:

- **El estado inicial es "degradado", no "en vivo".** Antes del primer `SUBSCRIBED` el canal no está conectado. Arrancar en verde y bajar a ámbar es la mentira silenciosa que D-14 existe para evitar; arrancar en ámbar y subir a verde en 200 ms es honesto y no molesta.
- **`removeChannel` en el cleanup del `useEffect`, siempre.** En desarrollo, el StrictMode de React 19 monta y desmonta dos veces; sin cleanup quedan dos canales por montaje y la cuota de `channels per connection` (100) se agota en un rato de trabajo con Fast Refresh. No es un problema de producción, es un problema de la máquina del que programa, y es exactamente el tipo de cosa que se diagnostica mal.

---

## Runtime State Inventory

Esta fase no es un rename ni una migración de datos, pero sí introduce **estado de servicio que no vive en el repositorio** y por eso la sección se incluye acotada.

| Categoría | Encontrado | Acción |
|---|---|---|
| Datos almacenados | Nada nuevo. `cleanings` y `notifications` ya existen y esta fase no cambia su forma. `cancel_reason` gana un slug nuevo pero es aditivo | Ninguna |
| Configuración de servicio en vivo | **La publicación `supabase_realtime`.** Es estado del servidor de base de datos que hoy no está en ninguna migración y que en un proyecto hospedado se puede tocar desde el Studio | Migración 15 con `alter publication`, escrita de forma idempotente |
| Estado registrado en el SO | Nada. Los jobs de `pg_cron` de la Fase 3 no se tocan | Ninguna. Verificado: ninguna RPC de esta fase agenda nada |
| Secretos y variables de entorno | Nada nuevo. `NEXT_PUBLIC_SUPABASE_URL` y la publishable key ya existen y son las que usa el cliente de navegador para el WebSocket | Ninguna |
| Artefactos de build | **140 archivos duplicados con sufijo ` 2`** en `lib/`, `app/`, `supabase/migrations/`, `e2e/` y `supabase/tests/`, residuo de la carpeta sincronizada de iCloud. Ninguno está trackeado en git. `supabase db reset` falla por migraciones duplicadas mientras existan | Limpiar con `git clean` **antes** de la primera tarea de la fase. Documentado en `deferred-items.md` de la Fase 3, entrada 7, y en el UI-SPEC §20.8 |

---

## Don't Hand-Roll

| Problema | No construir | Usar | Por qué |
|---|---|---|---|
| Impedir dos aseos activos el mismo día | Un `select ... where` antes del insert | El índice parcial `cleanings_one_active_per_property_date` que ya existe, y `mapDbError()` | Un chequeo previo tiene carrera. La base no la tiene, y ya lo hace también para el pipeline del sync, que no pasa por ninguna RPC |
| Impedir transiciones de estado ilegales | Un `switch` en TypeScript | El trigger `cleanings_snapshot`, migración 05 | Ya está escrito, cubre las seis transiciones y se aplica también a `service_role`, que tiene BYPASSRLS pero no bypass de triggers |
| Dejar inertes los aseos de gestión externa | Condicionales en la UI | El CHECK `cl_unmanaged_is_inert`. La UI refleja (D-21) | Cualquier ruta de escritura que lo intente da 23514. La UI no puede quedar desincronizada de una verdad que la base impone |
| Registrar quién cambió el estado de un aseo | Un `insert` en `cleaning_state_transitions` dentro de cada RPC | El trigger `cleanings_log_transition` | Dos filas por movimiento, y la de mano sería la mentirosa: el trigger escribe lo que quedó, después de los CHECK |
| Traducir un error de Postgres | `error.message.includes(...)` en el componente | `mapDbError()` y `campoDeConstraint()` de `lib/domain/errors.ts` | Ya existen, ya tienen tests, y ya distinguen el error que va inline del que va a toast |
| Formatear una fecha de negocio | `new Date(iso).toLocaleDateString()` | `formatFechaBog()` / `formatHoraLimite()` de `lib/domain/dates.ts` | `new Date('2026-09-04')` es medianoche UTC y en Bogotá renderiza el 3. La regla está escrita y probada |
| Saber si el sync se murió | Un umbral nuevo en el componente | `estadoDeSincronizacion()` y `UMBRAL_SYNC_CAIDA_MS` | Ya escrito, con la normalización de `+00` que se midió en rojo, y con la regla de fallar cerrado ante marca ilegible |
| Marcar una notificación como atendida | Una RPC nueva | `UPDATE` directo sobre `notifications.read_at` | `grant select, update` ya otorgado (migración 07, línea 159) y `notifications_own_update` acota a `recipient_id = auth.uid()` con `with check` |
| Trampa de foco y `Esc` en el `Sheet` | Un `useEffect` con `keydown` | Base UI, debajo de `sheet` | Ya lo trae. El UI-SPEC §16.3 lo dice explícito |
| Encabezado sticky en una tabla de shadcn | Rediseñar el `Table` | `containerClassName="overflow-x-visible max-xl:overflow-x-auto"` | Medido en el plan 02-07 y ya escrito en `components/ui/table.tsx` y `TablaApartamentos.tsx:246`. El `overflow-x-auto` del wrapper se convierte en el scrollport y mata el sticky |

**Key insight:** casi todo el trabajo defensivo de esta fase ya está hecho, en la base, desde la Fase 1. El modo de fallo dominante no es "faltó una validación", es "se reimplementó en TypeScript una validación que ya existía en SQL, con un predicado ligeramente distinto, y ahora hay dos verdades".

---

## Common Pitfalls

### Pitfall 1: el sync deshace la reprogramación del admin en 30 minutos

**Qué sale mal.** `reschedule_cleaning` escrita de la forma obvia (`update cleanings set scheduled_date = p_fecha where id = p_cleaning`) sobre un aseo con `origin='ical'` queda revertida en la siguiente corrida del sync de ese feed.

**Por qué pasa.** El bucle de "reserva movida" de `sync_feed_apply()` selecciona (migración 13, líneas 659-673):

```sql
from public.cleanings c
join public.calendar_reservations r on r.id = c.reservation_id
where r.feed_id = p_feed_id
  and r.disappeared_at is null
  and r.id = any (v_vistas)
  and c.property_id = v_property
  and c.origin = 'ical'
  and c.state is distinct from 'cancelada'
  and c.scheduled_date is distinct from r.ends_on
```

Un aseo reprogramado a mano cumple ese predicado **exactamente igual** que uno cuya reserva se movió de verdad. El sync no tiene forma de distinguirlos: para él, "el aseo no está donde dice la reserva" tiene una sola explicación. Entonces:

- Si la fecha nueva es `> today_bog() + 1`, el estado es `pendiente` y `started_at` es nulo → **cancela el aseo reprogramado** con `cancel_reason='reserva_movida'` y crea uno nuevo en `r.ends_on`. El trabajo del admin desaparece y en su lugar aparece un aseo sin confirmar en la fecha vieja.
- Si cae dentro de la ventana protegida (hoy o mañana) o ya empezó → lo marca `needs_review='reserva_movida_ventana_protegida'` y crea igualmente un aseo huérfano en `r.ends_on`. Ahora hay dos.

Además, el paso (c) de la migración 12 intenta crear un aseo en `r.ends_on` antes de todo eso, y **solo no lo hace porque `cleanings_one_live_per_reservation` bloquea el insert** mientras el aseo reprogramado siga apuntando a esa reserva. Es decir: el comportamiento actual depende de un índice único que está ahí por otra razón.

`[VERIFIED: migración 12 líneas 328-410 y migración 13 líneas 640-760, leídas completas]`

**Cómo evitarlo.** `reschedule_cleaning` desapunta la reserva en el mismo `update`:

```sql
update public.cleanings
   set scheduled_date = p_fecha,
       reservation_id = null
 where id = p_cleaning;
```

Con `reservation_id` nulo, el aseo sale de **todas** las rutas destructivas del reconcile, que sin excepción se anclan a la reserva:

| Ruta del reconcile | Predicado que lo excluye |
|---|---|
| Cancelación por desaparición (mig. 13, línea 578) | `c.reservation_id = any (v_ausentes_confirmadas)` |
| Bucle de reserva movida (mig. 13, línea 660) | `join calendar_reservations r on r.id = c.reservation_id` |
| Re-apuntado (mig. 12, línea 396) | Solo actúa si `c.scheduled_date = cand.ends_on`, y el aseo ya no está ahí |
| Recálculo de `is_urgent` (mig. 13, línea 820) | **Sí sigue actuando** (`origin='ical'`, sin condición de reserva), y eso es lo correcto: recalcula la urgencia contra la fecha nueva |

**La consecuencia, que hay que aceptar con los ojos abiertos:** el paso (c) del siguiente sync **creará un aseo nuevo en la fecha original del checkout**, porque ya no hay ningún aseo vivo apuntando a esa reserva. Es decir, reprogramar produce dos aseos: el que el admin movió, y uno sin confirmar en la fecha del checkout real.

**Y eso es lo correcto según la propia asimetría del proyecto:** el checkout sigue existiendo ese día, el apartamento se sigue liberando, y el aseo nuevo cae en la bandeja "Sin confirmar" donde el admin lo ve y lo cancela en diez segundos si sobra. Un aseo de más lo revisa un humano; un aseo de menos deja a la aseadora en la calle.

**Alternativa descartada, y por qué.** Poner `origin='manual'` en vez de desapuntar la reserva saca el aseo de todos los filtros del reconcile (todos llevan `c.origin='ical'`) **y** mantiene el `reservation_id`, que sigue bloqueando el paso (c) por `cleanings_one_live_per_reservation`. Resultado: exactamente un aseo, en la fecha del admin, inmune al sync. Es más limpio en apariencia y es la respuesta equivocada: si el admin reprograma por error o cambia de opinión y no lo deshace, **el día del checkout real se queda sin aseo y nada vuelve a generarlo**. Ese es el fallo caro. Además `is_urgent` dejaría de recalcularse para esa fila y `origin` mentiría sobre la procedencia.

**Señales de alarma.** Un aseo con `cancel_reason='reserva_movida'` cuya transición en `cleaning_state_transitions` tiene `actor_id` nulo (lo canceló el sync) apareciendo minutos después de que un admin lo reprogramara. Si eso se ve en producción, la RPC no desapuntó.

**Cómo se prueba.** Test de integración contra Postgres real: sembrar feed + reserva + aseo, llamar `reschedule_cleaning`, correr `sync_feed_apply()` con el mismo feed sin cambios, y afirmar que el aseo reprogramado **sigue en la fecha nueva y en estado `pendiente`**. El señuelo: quitar `reservation_id = null` de la RPC y ver el test en rojo.

### Pitfall 2: `close_cleaning` desde `pendiente` revienta con 23514

**Qué sale mal.** `update cleanings set state='completada', finished_at=now()` sobre un aseo `pendiente` falla con `cl_completada_shape`, que exige `started_at is not null and finished_at is not null and finished_at >= started_at`.

**Por qué pasa.** El CHECK está escrito para el flujo normal, donde `start_cleaning` puso `started_at` antes. El cierre manual del admin es la única ruta que salta ese paso, y la máquina de estados sí la contempla (`pendiente → completada`, comentada literalmente como "cierre manual del admin (ASEO-08)"), pero la forma del estado no se relajó para ella.

**Cómo evitarlo.** `started_at = coalesce(started_at, now())` en el mismo `update`. Dentro de una sentencia, `now()` es constante de transacción, así que `finished_at >= started_at` se cumple por igualdad.

**Señales de alarma.** Un 23514 con `cl_completada_shape` en el log. Si llega a la UI, `mapDbError` lo manda al mensaje genérico de 23514, que es inútil para diagnosticar.

### Pitfall 3: el embed de `profiles` desde `cleanings` es ambiguo

**Qué sale mal.** `.select('*, profiles(full_name)')` devuelve `PGRST201`.

**Por qué pasa.** `cleanings` tiene dos FK a `profiles`: `cleanings_aseador_id_fkey` y `cleanings_confirmado_by_fkey`. PostgREST no adivina. `damages` tiene el mismo problema con `reported_by` y `resolved_by`.

**Cómo evitarlo.** Calificar siempre: `aseador:profiles!cleanings_aseador_id_fkey(id, full_name)`.

**Señales de alarma.** Error en tiempo de ejecución, no de compilación: `database.types.ts` tipa el embed pero no valida la ambigüedad. Se descubre en el primer render, no en `tsc`.

### Pitfall 4: el mensaje de ASEO-07 pierde la interpolación

**Qué sale mal.** El UI-SPEC §12.6 exige `Ya hay un aseo activo para {apartamento} el {fecha}. Reprograma el que existe o cancélalo antes de crear otro.` pero `mapDbError()` devuelve la versión genérica `Ya existe un aseo activo para ese apartamento en esa fecha.` que la Fase 1 escribió.

**Por qué pasa.** `mapDbError()` solo ve el error de Postgres. No conoce el nombre del apartamento ni la fecha, y no debe conocerlos: es una función pura de mapeo.

**Cómo evitarlo.** El Server Action, que sí tiene el `FormData` con `property_id` y `fecha`, detecta el caso antes de delegar en `mapDbError()`:

```ts
if (error.code === '23505' && error.message.includes(IDX_ONE_ACTIVE_PER_PROPERTY_DATE)) {
  return { ok: false, campo: 'fecha',
           error: `Ya hay un aseo activo para ${nombre} el ${formatFechaBog(fecha)}. Reprograma el que existe o cancélalo antes de crear otro.` };
}
```

y `campoDeConstraint()` gana la entrada `[IDX_ONE_ACTIVE_PER_PROPERTY_DATE, 'fecha']` para que el error vaya inline y no a toast.

**Requisito sobre las RPC:** ni `create_manual_cleaning` ni `reschedule_cleaning` pueden capturar el `unique_violation`. Si lo capturan y lo relanzan como `P0001`, `mapDbError` devuelve el texto tal cual y **el nombre del índice desaparece del mensaje**, con lo que el Server Action ya no puede reconocerlo. Dejarlo propagar es la decisión correcta y hay que escribirla en el comentario de la función para que nadie "mejore" el manejo de errores después.

### Pitfall 5: escribir más de una columna al marcar una alerta como atendida

**Qué sale mal.** `notifications` tiene `grant select, update` **de tabla**, no por columna. Un `update` que pase el objeto entero puede sobrescribir `title`, `body`, `url` o `payload`.

**Por qué pasa.** La policy `notifications_own_update` acota **qué filas**, no **qué columnas**. Su `with check (recipient_id = auth.uid())` impide reasignarse una notificación ajena, y nada más.

**Cómo evitarlo.** El Server Action escribe literalmente `.update({ read_at: new Date().toISOString() })` y nada más. La disciplina es de la action, no de la base, y por eso conviene un test que lea `title` y `body` antes y después.

**Nota:** `notifications` no tiene policy de INSERT para nadie ni grant de INSERT, así que el vector de `notifications.url` como texto libre inyectable sigue cerrado. Esta fase no lo abre.

### Pitfall 6: creer que el panel prueba la deduplicación de `hora_limite_vencida`

**Qué sale mal.** Se escribe la deduplicación de §11.2, se escribe un test, el test pasa, y no prueba nada porque no existe ninguna fila de `notifications` con `type='hora_limite_vencida'` en todo el sistema.

**Cómo evitarlo.** El test siembra la fila a mano con el cliente de servicio y lo dice en su nombre: `la alerta computada se suprime si YA existe la notificación (sembrada, hoy nadie la produce)`.

### Pitfall 7: un `Dialog` montado dentro del `DropdownMenu`

**Qué sale mal.** El menú se cierra al pulsar el ítem, desmonta su árbol, y el diálogo se va con él antes de abrirse.

**Cómo evitarlo.** El patrón ya está resuelto en `MenuApartamento.tsx` + `DialogoDesactivarApartamento.tsx`: el diálogo vive **fuera** del menú, controlado por estado del padre (`abierto` / `onAbiertoChange`). `MenuAseo` y los cinco diálogos de esta fase lo copian tal cual.

### Pitfall 8: dos canales por cada Fast Refresh

Ver §El estado de la conexión. `removeChannel` en el cleanup del `useEffect`, siempre.

### Anti-patrones a evitar

- **Reimplementar `estadoDeAseo()` en dos componentes.** El UI-SPEC §5 lo dice y la razón es concreta: el `if` duplicado es cómo la UI se desincroniza de los CHECK. Va en `lib/domain/cleanings.ts`, con test.
- **Leer el rol desde `user_metadata`.** Medido: el usuario puede escribirse `role: 'admin'` ahí. `app_metadata.role` para ruteo, `private.is_admin()` para autorizar.
- **Usar `<>` en vez de `is distinct from` para "aseos vivos".** Medido con EXPLAIN: con `<>` sale Seq Scan incluso con `enable_seqscan = off`, porque el probador de implicación de predicados de Postgres no maneja `DistinctExpr`. Y en las filas informativas (`state` nulo) `<>` evalúa a NULL y la fila se cae del predicado en silencio.
- **Ordenar el panel de alertas por severidad.** Es el criterio 4 del ROADMAP, no una preferencia. Reabrirlo reabre el documento.

---

## Code Examples

### Esqueleto de una RPC nueva, con las tres partes obligatorias

```sql
-- Fuente: patrón literal de supabase/migrations/20260831223038_09_rpc.sql
create or replace function public.reassign_cleaning(
  p_cleaning uuid,
  p_aseador  uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_property uuid;
begin
  -- 1. Rol desde la BASE, nunca desde el JWT.
  if not (select private.is_admin()) then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;

  -- 2. El destino tiene que ser un aseador vivo. La FK sola no lo garantiza.
  if not exists (select 1 from public.profiles p
                  where p.id = p_aseador and p.role = 'aseador' and p.is_active) then
    raise exception 'aseador_invalido'
      using errcode = 'P0001',
            hint    = 'El aseador no existe o está desactivado.';
  end if;

  -- 3. `for update of c`: se bloquea el aseo, NO el apartamento.
  select c.property_id
    into v_property
    from public.cleanings c
   where c.id            = p_cleaning
     and c.is_managed
     and c.state         = 'pendiente'
     and c.confirmado_at is not null
     for update of c;

  if not found then
    -- P0001 y no 42501: el admin SÍ está autorizado, lo que falla es el estado.
    raise exception 'aseo_no_reasignable'
      using errcode = 'P0001',
            hint    = 'El aseo no existe, es de gestión externa, no está pendiente o todavía no se confirmó.';
  end if;

  -- 4. UNA columna. `properties.responsable_id` y `properties.suplente_id`
  --    NO aparecen en este archivo, y esa ausencia es D-18.
  update public.cleanings
     set aseador_id = p_aseador
   where id = p_cleaning;

  -- 5. Outbox. Nadie lo drena hasta la Fase 5 (costura conocida del ROADMAP).
  --    El `where dedupe_key is not null` replica el predicado del índice
  --    parcial; sin él Postgres no lo reconoce como árbitro y falla con 42P10.
  insert into public.notifications
    (recipient_id, type, title, body, url, cleaning_id, property_id, dedupe_key)
  select p_aseador,
         'asignacion'::public.notification_type,
         'Nuevo aseo asignado',
         'Tienes un aseo asignado en ' || p.nombre || ' para el ' ||
           to_char(c.scheduled_date, 'DD/MM') || ' antes de las ' ||
           to_char(c.hora_limite, 'HH24:MI') || '.',
         '/aseos/' || p_cleaning::text,
         p_cleaning,
         v_property,
         'assign:' || p_cleaning::text || ':' || p_aseador::text
    from public.cleanings  c
    join public.properties p on p.id = c.property_id
   where c.id = p_cleaning
  on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing;
end;
$$;

comment on function public.reassign_cleaning(uuid, uuid) is
  'ASEO-04. Solo admin. Cambia cleanings.aseador_id de UN aseo. NO toca properties.responsable_id ni properties.suplente_id (D-18).';

-- NO ES DECORATIVO Y NO SE HEREDA. Guardarraíl 9 de 02_guardarrailes.test.sql.
revoke all     on function public.reassign_cleaning(uuid, uuid) from public, anon;
grant  execute on function public.reassign_cleaning(uuid, uuid) to authenticated;
```

### `close_cleaning`: el `coalesce` que salva el CHECK

```sql
-- cl_completada_shape exige started_at NO NULO. Un aseo `pendiente` no lo tiene.
-- `coalesce` y no asignación directa: si venía de `en_curso`, su started_at real
-- es información y no se pisa. now() es constante de transacción, así que
-- finished_at >= started_at se cumple por igualdad cuando venía de `pendiente`.
update public.cleanings
   set state       = 'completada',
       started_at  = coalesce(started_at, now()),
       finished_at = now()
 where id = p_cleaning;
```

### Server Action: el orden de las tres primeras operaciones

```ts
// Fuente: patrón literal de app/(admin)/aseadores/_actions.ts
'use server';
import 'server-only';

export async function reasignarAseo(
  _prev: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  // 1. GUARD, ANTES QUE NADA. Un Server Action es un endpoint HTTP público:
  //    que el botón solo se renderice en (admin) no autoriza absolutamente nada.
  let ctx;
  try { ctx = await exigirAdmin(); }
  catch (e) { if (e instanceof NoAutorizado) return { ok: false, error: e.message }; throw e; }

  // 2. VALIDACIÓN.
  const parseado = esquemaReasignar.safeParse({
    cleaning: formData.get('cleaning'),
    aseador:  formData.get('aseador'),
  });
  if (!parseado.success) return { ok: false, error: 'Datos inválidos.' };

  // 3. RPC con el JWT DEL USUARIO. Nada de createAdminClient() aquí: la RPC
  //    ya es SECURITY DEFINER y trae su propia guarda. Meter service_role
  //    convertiría esto en una escalada de privilegios de una línea.
  const { error } = await ctx.supabase.rpc('reassign_cleaning', {
    p_cleaning: parseado.data.cleaning,
    p_aseador:  parseado.data.aseador,
  });
  if (error) return { ok: false, error: mapDbError(error) };

  revalidatePath('/operacion');
  return { ok: true, mensaje: `El aseo quedó asignado a ${nombre}.` };
}
```

### Instante de vencimiento de la hora límite, sin off-by-one

```ts
// `scheduled_date` es 'YYYY-MM-DD' y `hora_limite` es 'HH:MM:SS'. El instante es
// "ese día a esa hora en Bogotá". El desfase explícito hace que el resultado no
// dependa de la zona del proceso, que es la misma razón por la que
// estadoDeSincronizacion() normaliza el '+00' de Postgres a '+00:00'.
// PROHIBIDO new Date('2026-09-04'): es medianoche UTC y en Bogotá renderiza el 3.
export function venceEnMs(scheduledDate: string, horaLimite: string): number {
  return Date.parse(`${scheduledDate}T${horaLimite.slice(0, 5)}:00-05:00`);
}
```

---

## State of the Art

| Enfoque viejo | Enfoque actual | Cuándo cambió | Impacto en esta fase |
|---|---|---|---|
| `postgres_changes` como mecanismo por defecto de Realtime | Supabase recomienda **Broadcast** para volumen alto, porque `postgres_changes` autoriza cada evento contra la RLS por suscriptor | Documentación actual (leída 2026-09-03) | Ninguno. Con un admin, `postgres_changes` es lo correcto y lo más simple. La recomendación aplica a cientos de suscriptores |
| `REPLICA IDENTITY FULL` como paso rutinario al habilitar Realtime | Solo hace falta para filtrar DELETE y para poblar `old_record` | Documentación actual | **No ponerlo.** Es coste permanente en el WAL a cambio de nada aquí |
| `radix-ui` bajo shadcn | `@base-ui/react` en el preset `base-nova` | shadcn 4.x, ya absorbido en la Fase 2 | El `sheet` sale sobre `@base-ui/react/dialog`, ya instalado. Cero dependencias nuevas |

**Deprecado / obsoleto para esta fase:**

- **`getClaims()` para proteger rutas.** Medido en la Fase 2: tras banear a un usuario, `getUser()` devuelve 403 y `getClaims()` sigue respondiendo OK. Es lo que la doc oficial de Supabase recomienda y aquí es la respuesta equivocada.
- **`getSession()` para autorizar.** Nunca. Advertencia literal de la doc.

---

## Assumptions Log

| # | Claim | Sección | Riesgo si está mal |
|---|---|---|---|
| A1 | La publicación `supabase_realtime` está vacía en el proyecto hospedado que todavía no existe | Realtime | La migración 15 falla al aplicar con "table is already member of publication". Se mitiga escribiendo el `alter publication` de forma idempotente, que es lo recomendado de todos modos |
| A2 | `reassign_cleaning` debe exigir `confirmado_at is not null` y `state = 'pendiente'` | RPC 1/5 | Si el admin necesita reasignar un aseo en curso, la RPC lo rechaza y hay que ampliarla. Ningún requisito lo pide y ASEO-04 no lo aclara |
| A3 | `reschedule_cleaning` debe restringirse a `state = 'pendiente'` | RPC 3/5 | Mismo caso. Reprogramar un aseo en curso es semánticamente raro pero la máquina de estados no lo prohíbe |
| A4 | El horizonte de "Siguientes" son 14 días | Consulta de la pantalla | Es discreción del planner por 04-CONTEXT. Ningún riesgo técnico, solo de producto |
| A5 | `close_cleaning` NO encola notificación `aseo_completado` | RPC 4/5 | Si el equipo quiere el rastro en `notifications`, se añade. Con un admin, notificarse a sí mismo su propia acción es ruido en el panel de alertas |
| A6 | El slug nuevo se llama `cancelado_por_admin` | Slugs | Puramente nominal. Lo que no es opcional es que sea literal dentro de la función y que tenga copy en el mapa de §18.2 |
| A7 | Un debounce de 400 ms sobre los eventos de Realtime es suficiente para una ráfaga de 15 inserts | Realtime | Si resulta corto, se sube. Es un número que solo se puede afinar midiendo contra el sync real |
| A8 | `w-3/4` del `SheetContent` es cosmético en `(admin)` porque no hay vista móvil | Sheet | Ninguno práctico: `(admin)` tiene mínimo soportado de 1280px |

---

## Open Questions

1. **Falta una sexta RPC que D-17 no lista: apagar `needs_review`.**
   - Lo que se sabe: la migración 13 dice literalmente que `needs_review` es pegajoso y que **"solo el admin lo apaga, en la Fase 4"** (línea 106). El UI-SPEC renderiza la señal `Flag` con el copy del slug (§5.2, §18.3) pero **no describe ninguna acción para apagarla**, y §17.2 no lista ningún diálogo para eso.
   - Lo que no está claro: si el admin apaga `needs_review` explícitamente (una sexta RPC `clear_review_flag`), si se apaga como efecto lateral de reprogramar/cancelar/confirmar, o si se queda encendido para siempre.
   - **Recomendación:** una sexta RPC mínima, `clear_review_flag(p_cleaning uuid)`, que ponga `needs_review = false, review_reason = null`, invocada desde el ítem `Marcar como revisado` del `MenuAseo`. Es cinco líneas de SQL y cierra un lazo que la Fase 3 dejó abierto por escrito. **Si el planner decide no hacerla, tiene que decirlo explícitamente en el plan**, porque el comentario de la migración 13 promete lo contrario y quien lo lea dentro de tres meses lo va a buscar.

2. **`aseo_cancelado` y `aseo_completado` no tienen superficie en el UI-SPEC §11.1.**
   - Lo que se sabe: son los tipos que más filas producen hoy en `notifications`, los dos van a todos los admins activos, y el mapa de siete tipos del contrato no los incluye.
   - **Recomendación:** el planner extiende el mapa a los once valores del enum con fallback genérico (§Panel de alertas). Es una adición al contrato de diseño, no una desviación: no cambia jerarquía, no cambia color, no cambia tamaño. Conviene que el `gsd-ui-checker` lo vea antes de ejecutar.

3. **El proyecto Supabase hospedado sigue sin existir (checkpoint A1 de la Fase 1).**
   - Consecuencia directa: Realtime solo se puede verificar contra el stack local (`supabase start` levanta el servicio de Realtime, `config.toml` lo tiene `enabled = true`). Las cuotas del free tier son documentación, no medición.
   - No bloquea la fase: el fallback de D-15 hace que la pantalla funcione con Realtime caído, que es exactamente el escenario de "todavía no hay proyecto".

4. **`hora_limite_vencida` como tipo de notificación no tiene productor y quizá nunca lo tenga.**
   - Si la Fase 5 va a producirlo (para mandar push al admin cuando venza una hora límite), la deduplicación de §11.2 empieza a servir. Si no, el valor del enum es letra muerta.
   - No bloquea nada. Se anota para que la Fase 5 lo decida con el dato en la mano.

---

## Environment Availability

| Dependencia | Requerida por | Disponible | Versión | Fallback |
|---|---|---|---|---|
| `supabase` CLI | Migración 15, `db:reset`, `db:test`, `db:types` | ✓ | 2.116.0 (devDependency) | — |
| Docker / stack local de Supabase | `supabase test db`, tests de integración, Realtime local | **No verificado en esta sesión** | — | Sin él no corre `db:test` ni `test:integration`. Es la misma dependencia que la Fase 3 ya usó |
| `pgtap` | Suite pgTAP | ✓ | habilitado en `config.toml` desde la Fase 1 | — |
| Servicio de Realtime local | Probar la suscripción sin proyecto hospedado | ✓ | `supabase/config.toml` línea 88-89: `[realtime] enabled = true` | — |
| `@playwright/test` | E2E del flujo del admin | ✓ | 1.62.1 | El `webServer` de Playwright dependía de los `node_modules` duplicados; ver el bloqueante de abajo |
| Proyecto Supabase hospedado (dev/prod) | Medir cuotas reales de Realtime, sync real | **✗** | — | Checkpoint A1 de la Fase 1, abierto. **No bloquea esta fase** |
| `npx shadcn@4.19.1` | Generar `sheet` | ✓ | verificado ejecutándolo hoy | — |

**Bloqueante operativo antes de la primera tarea, no negociable:**

- **140 archivos duplicados con sufijo ` 2`** sin trackear en git, incluidos **cuatro pares de migraciones** (`..._11_sync_extensiones 2.sql`, `..._12_sync_rpc 2.sql`, `..._13_sync_reconcile 2.sql`, `..._14_sync_jobs 2.sql`), un `supabase/tests/05_sync.test 2.sql` y trece specs de Playwright duplicados. Con ellos presentes, `supabase db reset` falla y `playwright test` corre cada spec dos veces. Se limpian con `git clean` **antes** de tocar nada. Documentado en `deferred-items.md` de la Fase 3 (entrada 7) y en el UI-SPEC §20.8. `[VERIFIED: ls sobre supabase/migrations/, supabase/tests/ y e2e/]`

---

## Validation Architecture

### Test Framework

| Propiedad | Valor |
|---|---|
| Unitario | `vitest@4.1.11`, `vitest.config.ts`, `npm run test:unit` |
| Integración (Postgres real + JWT reales) | `vitest@4.1.11`, `vitest.integration.config.ts`, `npm run test:integration`. `include: ['lib/**/*.integration.test.ts']`, `fileParallelism: false`, `TZ=UTC` |
| Base de datos | pgTAP vía `supabase test db`, `npm run db:test`. Seis archivos hoy, 112 aserciones |
| E2E | `@playwright/test@1.62.1`, `npm run test:e2e` |
| Arquitectura | `npm run ci:arch` (`scripts/ci/check-service-role.sh`) |
| Tipos | `npx tsc --noEmit` y `npm run db:types:check` (deriva de `database.types.ts`) |
| Comando rápido por commit | `npm run test:unit` |
| Comando de suite completa | `npm run db:test && npm run test:unit && npm run test:integration && npx tsc --noEmit && npm run ci:arch` |

**Wave 0 obligatoria.** Las fases 1 a 3 escribieron la suite en rojo antes del schema. Esta fase hace lo mismo: el archivo pgTAP nuevo (`supabase/tests/06_aseos_admin.test.sql`) y los tests de integración de las RPC se escriben **antes** de la migración 15.

### Criterios de éxito → capa que los prueba → señuelo que los pone en rojo

La disciplina de señuelos de las fases 1 a 3 (49 corridos, 48 atrapados) se mantiene: **cada aserción tiene que venir con la mutación concreta del código de producción que la pondría en rojo, y esa mutación tiene que haberse corrido de verdad.**

#### Criterio 1 — Todo aseo nace sin confirmar, aparece en la bandeja, y confirmar lo asigna en firme al responsable

| Aserción | Capa | Comando | Señuelo |
|---|---|---|---|
| Un aseo recién insertado tiene `state='pendiente'`, `confirmado_at is null`, `aseador_id is null` | pgTAP | `npm run db:test` | Poner `default 'confirmado'` o rellenar `confirmado_at` en `tg_cleanings_snapshot` |
| La consulta de la bandeja devuelve exactamente los `is_managed and state='pendiente' and confirmado_at is null` | integración | `npm run test:integration` | Quitar `confirmado_at is null` del filtro: la bandeja se llena de aseos ya confirmados |
| `confirm_cleaning` asigna `properties.responsable_id`, no otro perfil | pgTAP | `npm run db:test` | Cambiar la RPC para asignar `suplente_id` |
| `confirm_cleaning` con `responsable_id` nulo levanta `P0001 sin_responsable` | pgTAP | `npm run db:test` | Quitar el `if v_responsable is null` |
| El `Sheet` encadenado avanza al siguiente y conserva lo confirmado al cerrar a mitad | E2E | `npm run test:e2e` | Hacer que cerrar el `Sheet` revierta lo escrito |

#### Criterio 2 — Servicios por día y carga diaria por aseador

| Aserción | Capa | Comando | Señuelo |
|---|---|---|---|
| Los aseos se agrupan en `Hoy` / `Mañana` / `Siguientes` usando `today_bog()`, no la fecha del proceso | integración | `npm run test:integration` | Sustituir `hoyBog()` por `new Date().toISOString().slice(0,10)`: con `TZ=UTC` en la suite, un aseo de hoy a las 20:00 de Bogotá se va a "Mañana" |
| El conteo del chip de un aseador es el de aseos vivos de hoy asignados a él, sin contar cancelados ni de gestión externa | unitario | `npm run test:unit` | Quitar el filtro de `state is distinct from 'cancelada'` |
| Un aseo con `scheduled_date` de ayer no aparece en ningún bloque | integración | `npm run test:integration` | Cambiar `.gte` por `.gt` o quitar el límite inferior |

#### Criterio 3 — Reasignar, crear, reprogramar, cerrar y cancelar

Es el criterio con más superficie y el que concentra el riesgo. Una aserción por RPC más las de invariante:

| Aserción | Capa | Comando | Señuelo |
|---|---|---|---|
| Un aseador autenticado que invoca cada una de las cinco RPC recibe `42501` **y la fila objetivo queda intacta** | pgTAP | `npm run db:test` | Quitar la guarda `private.is_admin()` de una RPC. **La segunda mitad no es opcional:** "matching no rows is not proof on its own" (doc oficial de Supabase, citada en la cabecera de `00_rls_aseos.test.sql`) |
| Ninguna de las cinco funciones nuevas es ejecutable por `anon` | pgTAP, guardarraíl 9 ya existente | `npm run db:test` | Omitir el `revoke all ... from public, anon` de una sola. Ya está escrito y ya funciona: se hereda gratis |
| `reassign_cleaning` cambia `cleanings.aseador_id` y deja `properties.responsable_id` y `properties.suplente_id` **byte a byte iguales** | pgTAP | `npm run db:test` | Añadir `update properties set responsable_id = p_aseador` a la RPC. **Es el señuelo de D-18 y es el más importante de la fase** |
| `reassign_cleaning` a un aseador desactivado levanta `P0001 aseador_invalido` | pgTAP | `npm run db:test` | Quitar el `and p.is_active` |
| `create_manual_cleaning` con `tipo='normal'` es rechazada | pgTAP | `npm run db:test` | Quitar la validación de tipo |
| `create_manual_cleaning` sobre fecha ocupada levanta 23505 **con el nombre del índice en el mensaje** | pgTAP | `npm run db:test` | Envolver el insert en un `exception when unique_violation then raise 'P0001'`: el nombre desaparece y `mapDbError` deja de reconocerlo |
| El Server Action traduce ese 23505 al mensaje interpolado con apartamento y fecha, y lo devuelve con `campo: 'fecha'` | unitario | `npm run test:unit` | Devolver `mapDbError(error)` a secas: sale el genérico y va a toast en vez de inline |
| **`reschedule_cleaning` sobrevive a una corrida completa de `sync_feed_apply()` sobre el mismo feed** | **integración** | `npm run test:integration` | **Quitar `reservation_id = null` de la RPC. El aseo aparece cancelado con `cancel_reason='reserva_movida'`. Es el señuelo del Pitfall 1 y el de mayor valor de toda la fase** |
| `close_cleaning` sobre un aseo `pendiente` deja `state='completada'` con `started_at` y `finished_at` no nulos | pgTAP | `npm run db:test` | Quitar el `coalesce(started_at, now())`: 23514 sobre `cl_completada_shape` |
| `close_cleaning` sobre un aseo `en_curso` **conserva el `started_at` original** | pgTAP | `npm run db:test` | Cambiar `coalesce(started_at, now())` por `now()`: se pierde la hora real de inicio |
| `cancel_cleaning` escribe `cancelled_at`, `cancel_reason='cancelado_por_admin'` y **una sola fila** en `cleaning_state_transitions` con ese motivo | pgTAP | `npm run db:test` | Insertar a mano en `cleaning_state_transitions` dentro de la RPC: salen dos filas |
| `cancel_cleaning` sobre un aseo ya `completada` levanta P0001 y no lo mueve | pgTAP | `npm run db:test` | Quitar el filtro de estado de la RPC y dejar que reviente el trigger: el mensaje deja de ser el del admin |
| Ninguna RPC de esta fase asigna `cancel_reason` ni `review_reason` desde un parámetro | pgTAP estructural sobre `pg_get_functiondef` | `npm run db:test` | Añadir un `p_motivo text` a `cancel_cleaning` y escribirlo en la columna |
| Las cinco acciones fallan con mensaje en español si las invoca un aseador (endpoint HTTP público) | integración | `npm run test:integration` | Quitar `exigirAdmin()` de un Server Action: llega a la RPC y devuelve 42501 crudo en vez del mensaje |
| Flujo completo del admin: crear un `repaso`, confirmarlo, reasignarlo, reprogramarlo, cerrarlo | E2E | `npm run test:e2e` | — |

#### Criterio 4 — Un solo panel de alertas con la misma jerarquía visual

| Aserción | Capa | Comando | Señuelo |
|---|---|---|---|
| La mezcla de notificaciones + computadas sale ordenada cronológicamente descendente por el instante del hecho, **no por tipo ni por severidad** | unitario | `npm run test:unit` | Ordenar por tipo: la aserción compara la secuencia exacta de ids esperada |
| Los siete tipos (más los cuatro del enum sin superficie) devuelven **el mismo color de icono, el mismo tamaño y el mismo peso** desde el mapa | unitario | `npm run test:unit` | Asignar `--destructive` al tipo `urgente`. La aserción recorre el mapa entero y afirma un único valor distinto |
| Un `notification_type` no mapeado cae en el fallback genérico y **no se descarta** | unitario | `npm run test:unit` | Filtrar los tipos desconocidos: `aseo_cancelado` desaparece del panel |
| `is_urgent` produce alerta solo si `is_managed`, estado vivo y `scheduled_date >= hoy` | unitario | `npm run test:unit` | Quitar `is_managed`: aparecen alertas de unidades externas, que por CHECK tienen `is_urgent = false`, y la aserción con fila sembrada lo atrapa |
| La hora límite vencida se calcula con `cleanings.hora_limite` (snapshot) y no con `properties.hora_limite` | unitario | `npm run test:unit` | Cambiar la fuente: la fixture tiene un aseo con hora pactada distinta a la del apartamento |
| El instante de vencimiento no se corre un día por zona horaria | unitario, con `TZ=UTC` en la config | `npm run test:unit` | Sustituir el desfase `-05:00` por `Z` |
| `UMBRAL_SYNC_CAIDA_MS` sigue siendo `3*60*60*1000` | unitario | `npm run test:unit` | Cambiarlo a 6 h |
| `feed_health_watchdog()` sigue usando `interval '3 hours'` | pgTAP estructural sobre `pg_get_functiondef` | `npm run db:test` | Cambiarlo a `'6 hours'` en la migración 14 |
| Marcar como atendida escribe **solo** `read_at`: `title`, `body`, `url` y `payload` quedan idénticos | integración | `npm run test:integration` | Pasar el objeto entero al `.update()` |
| Un admin no puede marcar como atendida la notificación de otro (`notifications_own_update`) | pgTAP | `npm run db:test` | — (ya cubierto por la policy; la aserción la ejercita) |
| **La captura del panel con los siete tipos, en escala de grises, sigue distinguiéndolos** | E2E con `filter: grayscale(1)` | `npm run test:e2e` | Codificar el tipo por color: en grises dos tipos se vuelven idénticos. Es la prueba de UI-SPEC §16.2 y es el único señuelo visual de la fase |
| Con 30 alertas, el contador de la cabecera dice 30 aunque se vean 7 | E2E | `npm run test:e2e` | Poner el contador sobre las filas renderizadas en vez de sobre el total |

#### Criterio 5 — Historial del apartamento y gestión externa

| Aserción | Capa | Comando | Señuelo |
|---|---|---|---|
| El historial mezcla aseos y daños en orden cronológico descendente | unitario | `npm run test:unit` | Concatenar las dos listas sin reordenar |
| Un daño con `resolved_at` no nulo **aparece igual**, con ` · Resuelto` al final | unitario | `npm run test:unit` | Filtrar los resueltos: es el error obvio, porque `damages_open_idx` es parcial sobre no resueltos e invita a copiar ese predicado |
| Una fila de gestión externa se renderiza sin estado, sin aseador, sin tarifa **y sin menú de acciones** | E2E | `npm run test:e2e` | Renderizar el `MoreHorizontal` también en la fila inerte |
| Intentar asignar aseador a un aseo de gestión externa da 23514 `cl_unmanaged_is_inert` desde cualquiera de las cinco RPC | pgTAP | `npm run db:test` | Quitar el filtro `is_managed` de `reassign_cleaning` |
| El detalle de un apartamento sin historial muestra el estado vacío, no una tabla de cero filas | E2E | `npm run test:e2e` | — |

### Frecuencia de muestreo

- **Por commit de tarea:** `npm run test:unit` (segundos) y `npx tsc --noEmit`.
- **Por merge de wave:** `npm run db:test && npm run test:integration && npm run ci:arch && npm run db:types:check`.
- **Puerta de fase:** la suite completa en verde antes de `/gsd:verify-work`, más `npm run test:e2e` y `npm run build`.

### Huecos de Wave 0

- [ ] `supabase/tests/06_aseos_admin.test.sql` — el archivo pgTAP nuevo, en rojo, cubriendo las cinco RPC, sus invariantes y el guardarraíl estructural de los slugs. Con `select plan(N)` donde N sale del conteo de aserciones de arriba.
- [ ] `lib/domain/alertas.test.ts` — la mezcla, el orden, la deduplicación y la homogeneidad del mapa de tipos, en rojo.
- [ ] `lib/domain/cleanings.test.ts` — `estadoDeAseo()` con sus seis casos, en rojo.
- [ ] `lib/domain/aseos-admin.integration.test.ts` — **incluida la aserción del Pitfall 1**, que es la que exige sembrar feed + reserva + aseo y correr `sync_feed_apply()` real dentro de `begin/rollback`. Reutiliza `lib/test/sync.ts` y `lib/test/clientes.ts`.
- [ ] `e2e/operacion.spec.ts` — el flujo del admin y la captura en escala de grises.
- [ ] Extensión de `lib/domain/errors.test.ts` con la entrada nueva de `campoDeConstraint`.

Sin huecos de framework: las cuatro capas ya existen, ya corren, y la fase solo añade archivos.

---

## Security Domain

`security_enforcement` no está desactivado en `.planning/config.json`, así que la sección aplica.

### Categorías ASVS aplicables

| Categoría ASVS | Aplica | Control estándar en este proyecto |
|---|---|---|
| V2 Autenticación | Sí | `getUser()` contra el servidor de Auth, nunca `getSession()` ni `getClaims()`. Ya montado |
| V3 Gestión de sesión | Sí | `@supabase/ssr` con `setAll` de dos argumentos y headers `Cache-Control: private, no-store`. Ya montado, no se toca |
| V4 Control de acceso | **Sí, es el núcleo de esta fase** | RLS + `private.is_admin()` dentro de cada RPC `SECURITY DEFINER`. `exigirAdmin()` en cada Server Action como defensa en profundidad |
| V5 Validación de entrada | Sí | `zod` en cada Server Action, y validación de dominio dentro de cada RPC (el `Select` del cliente no autoriza nada) |
| V6 Criptografía | No | Esta fase no cifra ni firma nada |
| V7 Manejo de errores y logging | Sí | `mapDbError()` nunca devuelve texto crudo de Postgres salvo `P0001`, que viene redactado. `cleaning_state_transitions` es la bitácora de quién movió cada estado |
| V8 Protección de datos | Sí | El código de acceso queda fuera del `Sheet` por D-12. `property_secrets` sigue sin ningún grant |

### Modelo de amenazas de la fase

El bloque `<threat_model>` de cada plan sale de aquí. Las amenazas son casi todas de autorización, porque **un Server Action es un endpoint HTTP público y el route group `(admin)` no autoriza nada**: cualquiera con el id de la action y el payload la invoca directamente.

| # | Amenaza | STRIDE | Superficie | Mitigación | Estado |
|---|---|---|---|---|---|
| T-04-01 | Un aseador invoca `reassign_cleaning` directamente y se asigna un aseo ajeno, o se lo quita a otra persona | Elevation of Privilege | RPC | `private.is_admin()` dentro de la función, que consulta `profiles` y no el JWT. Aserción pgTAP con el JWT de un aseador esperando `42501` **y la fila intacta** | A escribir |
| T-04-02 | Un aseador invoca `cancel_cleaning` sobre el aseo de otro y le borra el trabajo del día | Denial of Service / Tampering | RPC | Igual que T-04-01 | A escribir |
| T-04-03 | Un aseador invoca `close_cleaning` sobre su propio aseo y lo da por terminado **sin checklist y sin fotos**, saltándose el guard de `finish_cleaning` | Tampering | RPC | Igual que T-04-01. **Es la amenaza más concreta de la fase:** `close_cleaning` es literalmente el bypass de `finish_cleaning`, y por eso su guarda de rol no admite ninguna relajación | A escribir |
| T-04-04 | Un aseador invoca `create_manual_cleaning` en bucle y llena la tabla | Denial of Service | RPC | Igual que T-04-01. Sin la guarda, un bucle crea una fila por apartamento y fecha hasta agotar el free tier | A escribir |
| T-04-05 | Un aseador invoca `reschedule_cleaning` para mover un aseo ajeno a una fecha imposible | Tampering | RPC | Igual que T-04-01 | A escribir |
| T-04-06 | El Server Action usa `createAdminClient()` "para que funcione" y se convierte en escalada de privilegios de una línea | Elevation of Privilege | Server Action | `scripts/ci/check-service-role.sh` rompe el build si `lib/supabase/admin.ts` se importa desde una página o una action. **Ninguna de las cinco acciones de esta fase necesita `service_role`:** las RPC ya son `SECURITY DEFINER** | Ya cubierto |
| T-04-07 | Una función nueva queda ejecutable por `anon` por olvidar el `revoke all ... from public, anon` | Elevation of Privilege | Migración | Guardarraíl 9 de `02_guardarrailes.test.sql`, que evalúa `has_function_privilege('anon', p.oid, 'execute')` sobre TODA función de `public` y `private` | Ya cubierto, se hereda gratis |
| T-04-08 | El admin marca una notificación como atendida y sobrescribe `title`/`body`/`url` porque el `update` pasa el objeto entero | Tampering | Server Action | `notifications` tiene grant de **tabla**, no de columna: la policy acota filas, no columnas. El Server Action escribe solo `read_at`, con test | A escribir |
| T-04-09 | Un aseador se marca como atendida una notificación de otro destinatario | Tampering | RLS | `notifications_own_update` con `using` **y** `with check` sobre `recipient_id = auth.uid()`. El `with check` es el que impide reasignarse una ajena cambiando la columna | Ya cubierto |
| T-04-10 | El nombre de un apartamento o el motivo de un slug se renderiza sin escapar y ejecuta script | Tampering (XSS) | UI | React escapa por defecto. **La regla operativa es: ningún `dangerouslySetInnerHTML` en esta fase**, y `notifications.url` se renderiza como `href` de un `<Link>` interno, nunca como HTML | A verificar en revisión |
| T-04-11 | El `Sheet` de confirmación expone el código de acceso "por comodidad" | Information Disclosure | UI | D-12 lo prohíbe explícitamente. `property_secrets` no tiene ningún grant, así que ni siquiera es alcanzable desde la consulta de la pantalla: haría falta invocar `reveal_access_code`, que exige ser el aseador asignado | Ya cubierto por construcción |
| T-04-12 | Un motivo de cancelación escrito por el admin llega al `payload` de una notificación y de ahí a un push, arrastrando dato del huésped | Information Disclosure | RPC | `cancel_reason` es slug literal dentro de la función, nunca parámetro. Regla de la migración 13 con su razón escrita. Aserción estructural sobre el cuerpo | A escribir |
| T-04-13 | La suscripción de Realtime del navegador filtra filas ajenas | Information Disclosure | Realtime | `postgres_changes` autoriza cada evento contra la RLS por suscriptor. **Además, con el patrón recomendado el cliente ignora el payload y solo llama `router.refresh()`**, así que el dato nunca llega al cliente por esa vía | Cubierto por diseño |
| T-04-14 | Un admin desactivado con token vivo sigue mutando aseos | Elevation of Privilege | RPC | `private.is_admin()` exige `p.is_active` en la consulta a `profiles`. Es el mismo mecanismo medido en la Fase 2 para el aseador desactivado | Ya cubierto |

**Nota sobre la asimetría de errores, que también es de seguridad:** el reparto `42501` / `P0001` no es cosmético. `42501` se usa cuando distinguir "no existe", "no es tuyo" y "todavía no es su día" sería un oráculo de enumeración; `P0001` cuando el llamador está autorizado y solo falla el estado. Copiar la regla al revés en una RPC nueva convierte un mensaje amable en una fuga de existencia de recursos.

---

## Sources

### Primary (HIGH confidence) — código de este repositorio, leído directamente el 2026-09-03

- `supabase/migrations/20260831212658_04_operacion.sql` — tabla `cleanings`, los siete CHECK, los dos índices únicos parciales y los cuatro índices operativos.
- `supabase/migrations/20260831215108_05_triggers_y_maquina_de_estados.sql` — `tg_cleanings_snapshot()`, la matriz de seis transiciones, congelación de tarifas, `cleanings_log_transition`.
- `supabase/migrations/20260831215109_06_retencion_y_notificaciones.sql` — `notifications`, `notifications_dedupe_idx`, `notifications_inbox_idx` (parcial `where read_at is null`).
- `supabase/migrations/20260831220805_07_grants.sql` — `grant select on cleanings`, `grant select, update on notifications`, tablas sin ningún grant.
- `supabase/migrations/20260831221405_08_rls_policies.sql` — `private.is_admin()`, `cleanings_admin_all`, `notifications_own_select`, `notifications_own_update`.
- `supabase/migrations/20260831223038_09_rpc.sql` — el patrón completo de las seis RPC existentes y el bloque de cierre que anticipa las de esta fase.
- `supabase/migrations/20260902221500_12_sync_rpc.sql` — pasos (a)–(f) de la mitad aditiva del diff, en especial (c) creación y (d) re-apuntado.
- `supabase/migrations/20260902234500_13_sync_reconcile.sql` — listas cerradas de slugs (líneas 119-133), cancelación por desaparición, **bucle de reserva movida (líneas 640-760)**, recálculo de `is_urgent` (línea 820), las seis inserciones en `notifications`.
- `supabase/migrations/20260902235500_14_sync_jobs.sql` — `feed_health_watchdog()` con `interval '3 hours'` en las líneas 247 y 321.
- `supabase/tests/02_guardarrailes.test.sql` — guardarraíl 9, `has_function_privilege('anon', …)`.
- `supabase/tests/00_rls_aseos.test.sql` — mecánica pgTAP: `throws_ok` cuando no hay grant, `is_empty` cuando la RLS filtra, y la verificación de fila intacta.
- `lib/domain/salud-sync.ts` — `UMBRAL_SYNC_CAIDA_MS` y `estadoDeSincronizacion()`.
- `lib/domain/errors.ts`, `lib/domain/constants.ts`, `lib/domain/dates.ts` — mapeo de errores, nombres de constraint, formateo de fechas.
- `lib/database.types.ts` — bloques `Relationships` de `cleanings` y `damages` (la ambigüedad del embed).
- `lib/auth/guards.ts`, `app/(admin)/aseadores/_actions.ts` — patrón de Server Action y su orden obligatorio.
- `components/ui/dialog.tsx`, `components/ui/table.tsx` — evidencia de lo que el CLI de shadcn transforma al instalar y del `containerClassName`.
- `package.json`, `components.json`, `supabase/config.toml`, `.planning/config.json`.

### Primary (HIGH confidence) — ejecución en esta sesión

- `npx shadcn@4.19.1 view sheet`, 2026-09-03 — contenido literal del bloque, `registryDependencies`, ausencia de patrones peligrosos.
- `node -e "require('lucide-react')"` sobre los 27 iconos de UI-SPEC §17.3 contra `lucide-react@1.39.0` instalado: **cero faltantes**.
- `grep -rn "::public.notification_type" supabase/migrations/*.sql` — inventario completo de productores de notificaciones.
- `grep -rn "supabase_realtime" supabase/migrations/` — cero ocurrencias.
- `grep -rn "font-medium" components/ui/*.tsx` — quince primitivas afectadas.

### Secondary (MEDIUM confidence) — documentación oficial de Supabase, consultada el 2026-09-03

- https://supabase.com/docs/guides/realtime/quotas — 200 conexiones concurrentes, 100 mensajes/s, 100 canales por conexión, 100 joins/s en el plan Free.
- https://supabase.com/docs/guides/realtime/pricing — 200 peak connections y 2.000.000 de mensajes al mes incluidos en Free.
- https://supabase.com/docs/guides/realtime/limits — comportamiento de desconexión al exceder throughput.
- https://supabase.com/docs/guides/realtime/postgres-changes — `alter publication supabase_realtime add table`, "authorizes every event against each subscriber", `REPLICA IDENTITY FULL` solo para filtrar DELETE, benchmarks de 500 clientes con y sin RLS.
- https://supabase.com/docs/reference/javascript/subscribe — firma del callback y los cuatro estados del canal.

### Tertiary (LOW confidence)

- Ninguna afirmación de este documento se apoya solo en WebSearch. El único resultado de búsqueda usado (cuotas del free tier) se contrastó contra las tres páginas de documentación oficial listadas arriba, que coinciden entre sí.

---

## Metadata

**Desglose de confianza:**

- Capa de base de datos (RPC, invariantes, slugs, interacción con el reconcile): **HIGH**. Todo sale de leer las migraciones completas en este repositorio, no de memoria ni de documentación externa. El Pitfall 1 se deriva de dos predicados SQL leídos línea por línea.
- Inventario de productores de notificaciones: **HIGH**. Grep exhaustivo, resultado completo transcrito.
- `sheet` y sus tres arreglos: **HIGH**. Registry consultado en vivo hoy y contrastado contra el `dialog.tsx` que ya está instalado en el repo.
- Iconos de lucide: **HIGH**. Verificados contra el paquete instalado, uno por uno.
- Cuotas y comportamiento de Realtime: **MEDIUM**. Documentación oficial leída hoy y consistente entre tres páginas, pero **no medida**: no existe proyecto Supabase hospedado (checkpoint A1 de la Fase 1, abierto).
- Patrón de integración de Realtime con RSC: **MEDIUM**. El razonamiento sobre `router.refresh()` vs estado local es sólido y se apoya en hechos verificados (el payload no trae embeds, `REPLICA IDENTITY` por defecto), pero el debounce de 400 ms y el comportamiento bajo ráfaga son estimación, no medición.
- Precondiciones exactas de cada RPC (qué estados admite): **MEDIUM**. Los invariantes que las acotan están medidos; dónde poner exactamente la frontera es criterio, y está marcado en `## Assumptions Log`.

**Research date:** 2026-09-03
**Valid until:** 2026-10-03 para todo lo que sale del repositorio (solo cambia si cambian las migraciones). **2026-09-17** para las cuotas de Realtime, que Supabase revisa con frecuencia y que además hay que volver a mirar en cuanto exista el proyecto hospedado.
