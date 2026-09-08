# Phase 4: Dashboard operativo del admin - Context

**Gathered:** 2026-09-03
**Status:** Ready for planning

<domain>
## Phase Boundary

El admin ve toda la operación del día en una pantalla y confirma, reasigna, reprograma, cierra o
cancela cualquier aseo sin salir de ahí. Es la fase que hace **visible** el Core Value: la Fase 3
lleva generando aseos que hoy nadie puede ver.

**Entra:** ASEO-01 a ASEO-06, ASEO-08, ASEO-09, DASH-01 a DASH-07, REPORT-04.

**No entra, y hay que decirlo porque se va a sentir la falta:**
- **Notificar al aseador.** Confirmar asigna en firme, pero no avisa a nadie. El evento se escribe
  en la cola de notificaciones y se drena cuando exista el worker de la Fase 5. Es intencional y
  está declarado en el ROADMAP como costura conocida.
- **La PWA del aseador.** El aseador todavía no puede ejecutar nada (Fase 6). Esta fase construye
  la mitad del admin de un lazo cuya otra mitad no existe.
- **Lo financiero.** Rentabilidad y cierre mensual son Fase 7, aunque las tarifas ya estén en la
  base desde la Fase 1.
- **Reportar daños, gastos y faltantes.** Los RPC de reporte se difirieron a la Fase 6. Esta fase
  **muestra** los daños en el historial del apartamento (REPORT-04), no los crea.

</domain>

<decisions>
## Implementation Decisions

### Anatomía de la pantalla única

- **D-01: Una ruta, dos carriles.** La ruta principal del admin es una sola pantalla con un carril
  ancho de contenido y un carril lateral fijo (`sticky`) a la derecha. No hay pestañas: el criterio
  1 del ROADMAP pide "toda la operación del día en una pantalla" y las pestañas esconden
  precisamente lo que no puede esconderse.
- **D-02: El carril lateral es el de las cosas que exigen acción.** Arriba la bandeja persistente
  "Sin confirmar" con su contador (DASH-02), debajo el panel de alertas (DASH-04, DASH-05). Ambos
  visibles sin hacer scroll, siempre.
- **D-03: El carril ancho es el estado del mundo.** Los días en orden: **Hoy** expandido por
  defecto, **Mañana** y **Siguientes** colapsables (DASH-01). Cada día es una tabla densa, no una
  rejilla de tarjetas: el admin es escritorio y son decenas de aseos por día.
- **D-04: La carga por aseador no es una cuarta zona.** Es una franja compacta justo encima del día
  "Hoy": un chip por aseador con su conteo del día (DASH-03). Lo único que esa información tiene
  que soportar es una decisión binaria, activar o no al suplente, y para eso no hace falta una
  vista propia.

**Por qué así.** Con 30 aseos y 8 alertas al tiempo, si todo comparte el mismo scroll, los aseos
empujan las alertas fuera de la pantalla y el panel de alertas deja de existir en la práctica.
Separar "lo que exige acción" de "lo que hay que consultar" en dos carriles es lo que impide eso.

### Qué significa "la misma jerarquía visual" (criterio 4)

- **D-05: No significa que todas griten igual. Significa que ninguna se esconde.** El anti-patrón
  que el requisito ataja es el clásico: urgentes en rojo grande arriba y "faltantes" como texto
  gris al final que nadie lee nunca.
- **D-06: Lista plana, ordenada cronológicamente por cuándo ocurrió el hecho.** No por tipo, no por
  severidad percibida. Los siete tipos (urgente, extensión mal creada, "no puedo", daño, faltante,
  calendario caído, hora límite vencida) comparten fila, tamaño, peso tipográfico y tratamiento.
- **D-07: El tipo se distingue por icono y etiqueta de texto, nunca por color ni tamaño.** Un solo
  color de acento para todo el panel. Se puede filtrar por tipo, pero el orden por defecto es
  cronológico y el filtro arranca en "todas".
- **D-08: Cada alerta lleva a su aseo o a su apartamento en un clic.** Una alerta que no es
  accionable desde donde se ve es una notificación, no una alerta.

**Nota para el planner:** `is_urgent` ya existe como dato correcto y probado desde la Fase 3, y se
apaga solo si la reserva se mueve. Lo que no existe es su superficie visual, y eso es trabajo de
esta fase. La alerta de "calendario caído" tiene dos mitades: las que el watchdog escribe en
`notifications`, y la que se computa **al leer** con `estadoDeSincronizacion()`. Las dos entran al
mismo panel.

### Dónde ocurre confirmar un aseo

- **D-09: Panel lateral (`Sheet`) que se abre desde la bandeja**, con los dos campos: número de
  huéspedes e instrucciones (ASEO-02).
- **D-10: Encadenado.** Al guardar, avanza automáticamente al siguiente sin confirmar y muestra el
  progreso ("3 de 15"). Se puede cerrar en cualquier momento sin perder lo ya confirmado.
- **D-11: Descartado el diálogo modal y la fila expandible.** Tras una corrida del sync pueden
  entrar quince de golpe: abrir y cerrar un diálogo quince veces es exactamente la fricción que
  "un solo paso" quiere evitar. La fila expandible pierde el sitio cuando la lista se reordena al
  salir el aseo recién confirmado.
- **D-12: El panel muestra el contexto que el admin necesita para decidir** sin ir a buscarlo:
  apartamento, fecha, a quién va a quedar asignado, y el código de acceso **no**. El código se
  revela por su RPC con auditoría, y el admin no lo necesita para confirmar.

### Frescura de los datos

- **D-13: La pantalla se actualiza sola.** Realtime de Supabase sobre `cleanings` y
  `notifications`, con revalidación periódica de respaldo. El admin deja esta pantalla abierta todo
  el día y el motor corre cada 30 minutos: sin refresco, actúa sobre un mundo viejo.
- **D-14: Marca de tiempo visible de la última actualización.** No basta con refrescar: hay que
  decir cuándo se leyó. Un dashboard operativo que miente en silencio sobre lo de hace 25 minutos
  es peor que uno que confiesa su edad.
- **D-15: Ojo con el free tier.** El plan de Supabase es gratuito durante todo el desarrollo. Con
  un solo admin, Realtime cabe de sobra, pero el planner debe confirmar el límite de conexiones
  concurrentes y dejar el fallback funcionando si Realtime no conecta, en vez de dejar la pantalla
  congelada sin avisar.

### Mutaciones: cinco RPC nuevas, mínimo

- **D-16:** Consecuencia directa de la Fase 1, ya registrada en STATE.md y no negociable:
  `cleanings` tiene `grant select` puro para `authenticated`, y admin y aseador comparten ese rol
  de Postgres. **"Solo el admin" no existe como categoría de grant.** Toda mutación pasa por RPC
  `SECURITY DEFINER` que verifica el rol por dentro.
- **D-17:** Esta fase crea al menos: `reassign_cleaning` (ASEO-04), creación manual de aseo
  (ASEO-05, tipos `repaso` y `emergencia`), `reschedule_cleaning` (ASEO-06), `close_cleaning`
  (ASEO-08) y `cancel_cleaning` (ASEO-09). `confirm_cleaning` ya existe desde la Fase 1.
- **D-18: Reasignar es puntual y no toca el catálogo.** ASEO-04 cambia el aseador de **ese** aseo,
  nunca el responsable ni el suplente del apartamento. Es la confusión más fácil de cometer y la
  más cara de descubrir tarde.
- **D-19: El error de ASEO-07 tiene que ser legible.** El índice parcial
  `unique (property_id, scheduled_date) where estado <> 'cancelado'` ya impide el duplicado en la
  base desde la Fase 1. Cuando salte al crear un aseo manual, el admin tiene que leer "ya hay un
  aseo activo para ese apartamento en esa fecha", no un `23505`.

### Gestión externa (DASH-07)

- **D-20: Fila informativa, inerte, en el mismo listado del día.** Los aseos de apartamentos con
  `gestion_vivaguest = false` se muestran con su fecha y a cargo de quién, **sin estado, sin
  aseador asignado, sin tarifa y sin ninguna acción**. No van a una vista aparte: el admin necesita
  verlos en el mismo día para tener el panorama completo, y necesita no poder tocarlos.
- **D-21:** El constraint `cl_unmanaged_is_inert` ya lo impone en la base (código `23514`, medido
  en la Fase 3). La UI refleja esa verdad, no la reimplementa.

### Historial del apartamento (DASH-06, REPORT-04)

- **D-22: Vive dentro del detalle del apartamento que ya existe** (`app/(admin)/apartamentos/[id]`),
  no en una ruta nueva. Es cronológico e incluye los daños reportados.
- **D-23: Solo lectura.** Los RPC de reporte llegan en la Fase 6; aquí no se crea nada, se muestra.

### Claude's Discretion

- Estructura de rutas y archivos dentro de `(admin)`, y cómo se parte cada organismo.
- Nombres concretos y firmas exactas de las cinco RPC nuevas.
- Estados de carga, vacío y error de cada superficie, siguiendo el patrón que ya dejó la Fase 2.
- Si "Siguientes" agrupa por día o es una lista corrida, y cuántos días hacia adelante muestra.
- Elección concreta entre Realtime y polling si la investigación encuentra un impedimento real en
  el free tier, siempre que D-14 (la marca de tiempo visible) se conserve.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Alcance y requisitos
- `.planning/ROADMAP.md` §"Phase 4: Dashboard operativo del admin" — los 5 criterios de éxito y la
  costura conocida con la Fase 5.
- `.planning/REQUIREMENTS.md` — texto literal de ASEO-01 a 09, DASH-01 a 07 y REPORT-04.
- `.planning/PROJECT.md` — Core Value y restricciones de producto.

### Consecuencias de fases anteriores, de lectura obligatoria
- `.planning/STATE.md` §"Consecuencias de la Fase 1 para fases posteriores" — por qué toda mutación
  de `cleanings` necesita RPC nueva, con la lista de las que faltan.
- `.planning/phases/02-acceso-y-administraci-n-del-cat-logo/02-CONTEXT.md` §decisions — convenciones
  de UI ya cerradas: shadcn sin envolver, organismos por superficie, seguridad de Server Actions.
- `.planning/phases/03-motor-de-sincronizaci-n-ical/03-10-SUMMARY.md` — el estado final del motor.
- `.planning/phases/03-motor-de-sincronizaci-n-ical/VERIFICATION.md` — en especial la precisión de
  alcance sobre `is_urgent`: es un dato correcto, su superficie visual es trabajo de esta fase.
- `.planning/phases/03-motor-de-sincronizaci-n-ical/deferred-items.md` — los cuatro diferidos vivos,
  entre ellos el dead man's switch que esta fase cubre a medias.

### Código que esta fase consume
- `lib/domain/salud-sync.ts` — `estadoDeSincronizacion()`, la mitad del detector de "el sync se
  murió" que se computa AL LEER. `UMBRAL_SYNC_CAIDA_MS` tiene que seguir igual al `interval
  '3 hours'` del watchdog en `supabase/migrations/20260902235500_14_sync_jobs.sql`.
- `lib/database.types.ts` — contrato de tipos, con check de deriva en CI.
- `supabase/migrations/20260902234500_13_sync_reconcile.sql` — los cuatro candados del reconcile y
  los constraints que la UI tiene que respetar, no reimplementar.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `components/ui/` — shadcn ya instalado con 23 primitivas, entre ellas `table`, `dialog`, `badge`,
  `alert`, `dropdown-menu`, `select`, `tooltip`, `skeleton` y `sonner`. **Falta `sheet`**, que D-09
  necesita: hay que añadirlo con el CLI, no escribirlo a mano.
- `app/(admin)/_components/TopNav.tsx` y `EstadoVacio.tsx` — navegación y estado vacío ya resueltos.
- `app/(admin)/apartamentos/_components/TablaApartamentos.tsx` — el patrón de tabla densa del admin,
  con su `MenuApartamento` de acciones por fila. Las tablas de días de esta fase salen de ahí.
- `app/(admin)/apartamentos/_components/DialogoDesactivarApartamento.tsx` y su gemelo de aseador —
  el patrón ya establecido para confirmar una acción destructiva. Cancelar y cerrar manualmente un
  aseo lo siguen.
- `app/(admin)/apartamentos/[id]/page.tsx` — donde D-22 cuelga el historial.

### Established Patterns
- Un `_actions.ts` por ruta, con Server Actions que arrancan por `getUser()` más verificación de
  rol. El route group `(admin)` **no autoriza nada**: un Server Action es un endpoint HTTP público.
- `_components/` por ruta para los organismos; nada compartido entre `(admin)` y `(cleaner)`.
- Interfaz en español.
- `service_role` solo en `lib/supabase/admin.ts`, con un test de arquitectura en CI que rompe el
  build si alguien la importa desde una página o un Server Action.

### Integration Points
- **Lectura:** `cleanings` tiene `grant select` para `authenticated` y la RLS ya filtra. El admin
  las ve todas.
- **Escritura:** exclusivamente por RPC. Las cinco nuevas de D-17 son la primera tarea real de la
  fase, antes de cualquier UI, siguiendo la regla del proyecto de schema antes que interfaz.
- **Cola de notificaciones:** confirmar escribe el evento y nadie lo drena hasta la Fase 5.
- **`notifications`:** el watchdog de la Fase 3 ya escribe ahí. El panel de alertas lee de esa tabla
  y le suma lo que computa al leer.

</code_context>

<specifics>
## Specific Ideas

- La frase que fija el criterio 4 y que el planner no debe suavizar: **ninguna alerta se esconde**.
  Si al diseñar el panel aparece la tentación de destacar unas sobre otras, es señal de que se está
  reintroduciendo el problema que el requisito existe para evitar.
- El caso que define el diseño de la bandeja: **una corrida del sync mete quince aseos sin confirmar
  de golpe**. Todo lo que se diseñe para "uno o dos" está mal calibrado.
- La asimetría de costos que ya guió la Fase 3 aplica igual aquí: un aseo de más lo revisa un
  humano; un aseo de menos deja a la aseadora en la calle. Ante la duda, mostrar de más.

</specifics>

<deferred>
## Deferred Ideas

- **Semáforo de entregabilidad de push (NOTIF-V2-01)** — ya diferido a v2 el 2026-08-31.
- **Scorecard por aseador (PERF-V2-01)** — v2. La carga diaria de DASH-03 es un conteo operativo
  para decidir el suplente, no una métrica de desempeño. No confundirlas.
- **Dashboard de propietarios (OWNER-V2-01)** — v2.
- **El dead man's switch externo (T-03-85)** — sigue diferido. Esta fase cubre su mitad buena con
  `estadoDeSincronizacion()` al leer, y el hueco residual declarado se mantiene: si el admin no
  abre el panel, nadie se entera de que el scheduler murió.

</deferred>

---

*Phase: 4-Dashboard operativo del admin*
*Context gathered: 2026-09-03*
