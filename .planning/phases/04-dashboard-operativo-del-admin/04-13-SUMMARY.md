---
phase: 04-dashboard-operativo-del-admin
plan: 13
subsystem: ui
tags: [realtime, websocket, rsc, react-19, useOptimistic, timezone, a11y, xss, supabase]

# Dependency graph
requires:
  - phase: 04-dashboard-operativo-del-admin
    provides: "04-04 dejo lib/domain/alertas.ts con MAPA_DE_ALERTAS, alertasComputadas(), mezclarAlertas() y conteosPorTipo(); 04-05 publico cleanings y notifications en supabase_realtime; 04-06 dejo leerOperacion() con leidoEnMs, leerAlertasDelAdmin() y leerUltimoExitoDeSync(); 04-08 dejo marcarAlertaAtendida() y devolverAlertaAlPanel(); 04-09 dejo /operacion con el hueco del panel y el sitio de la marca de frescura; 04-02 dejo EstadoVacio con su prop compacto y el token --spacing-fila-alerta"
  - phase: 02-acceso-y-administraci-n-del-cat-logo
    provides: "lib/supabase/browser.ts, TooltipProvider montado en el layout raiz, EstadoVacio, el patron de DropdownMenu con render prop"
provides:
  - "app/(admin)/operacion/_components/FilaAlerta.tsx: la fila de 64px con icono, etiqueta de tipo, tiempo relativo, titulo truncado y boton de atender; ancla estirada sobre toda la fila"
  - "rutaInterna(): el filtro que solo deja pasar rutas internas al href (T-04-10)"
  - "app/(admin)/operacion/_components/PanelAlertas.tsx: cabecera con contador y filtro por tipo, lista mezclada sin reordenar, toggle Ver atendidas"
  - "app/(admin)/operacion/_components/SincronizacionEnVivo.tsx: un canal postgres_changes sobre cleanings y notifications, con debounce, degradacion, pausa por visibilidad y sondeo de respaldo"
  - "app/(admin)/operacion/_components/MarcaActualizacion.tsx: la linea de ultima actualizacion con su tooltip y el boton de refrescar"
  - "leerAlertasAtendidas() y DIAS_DE_ATENDIDAS en lib/data/operacion.ts"
  - "formatHoraBog() y formatInstanteBog() en lib/domain/dates.ts"
  - "id=\"aseo-{id}\" y scroll-mt-barra en FilaAseo: el ancla destino del clic de una alerta"
affects: [04-14, 05-notificaciones-push]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "La suscripcion de Realtime es un DISPARADOR, no una fuente de datos: se llama router.refresh() y no se lee el payload nunca. Evita duplicar lib/domain/, el N+1 de los embeds sin resolver, REPLICA IDENTITY FULL, y conserva el estado del cliente"
    - "Debounce obligatorio sobre los eventos de postgres_changes: una transaccion de N filas son N eventos y un solo refresco"
    - "removeChannel en el cleanup del useEffect, siempre: StrictMode deja dos canales por montaje y la cuota se agota con Fast Refresh"
    - "El sondeo de respaldo se construye SIEMPRE, y es lo que deja a Realtime como una capa que se puede quitar sin romper la pantalla"
    - "El estado inicial de una conexion en vivo es DEGRADADO, no conectado: antes del primer SUBSCRIBED no hay canal"
    - "useOptimistic con valor base VACIO para ocultar filas en vuelo: revierte solo al terminar la transicion, sin limpiar ids a mano en la rama de fallo"
    - "El estado que cambia QUE FILAS lee el servidor va en la URL; el que solo filtra lo ya traido va en useState"
    - "El instante de lectura se lee UNA vez en la pagina y baja por parametro a todas las superficies (D-14)"
    - "Ancla estirada (absolute inset-0) cuando la fila entera es clicable Y contiene un control: un boton dentro de un <a> es HTML invalido"

key-files:
  created:
    - app/(admin)/operacion/_components/FilaAlerta.tsx
    - app/(admin)/operacion/_components/PanelAlertas.tsx
    - app/(admin)/operacion/_components/SincronizacionEnVivo.tsx
    - app/(admin)/operacion/_components/MarcaActualizacion.tsx
  modified:
    - app/(admin)/operacion/page.tsx
    - app/(admin)/operacion/_components/FilaAseo.tsx
    - lib/data/operacion.ts
    - lib/domain/dates.ts

key-decisions:
  - "El contador de la cabecera muestra el TOTAL del panel, nunca lo renderizado ni lo que queda tras el filtro: es la unica garantia medible de que el scroll interno no es un escondite (criterio 4)"
  - "El toggle Ver atendidas es un parametro de URL (?alertas=atendidas) y no estado de cliente: cambia QUE FILAS lee el servidor, y resolverlo en el cliente obligaria a traer siempre siete dias de atendidas por si acaso"
  - "leerAlertasAtendidas() va en funcion aparte y no como parametro de leerAlertasDelAdmin(): esa consulta calza columna a columna con notifications_inbox_idx, que es PARCIAL where read_at is null, y una rama que anule ese filtro haria falsa su docstring la mitad de las veces"
  - "La ventana de Ver atendidas se mide sobre read_at y no sobre created_at: el toggle responde a 'que he cerrado yo', y con created_at una alerta vieja atendida hoy no apareceria, que es justo cuando el admin va a buscarla para deshacerlo"
  - "En modo Ver atendidas NO se computan las tres alertas derivadas, y se pasa [] explicito: no tienen read_at, luego no se pueden atender, luego no pueden estar en esa lista"
  - "El boton de atender NO se renderiza en las computadas pero su ranura de 32px se reserva igual: sin la reserva el punto de truncado bailaria entre filas, y ese desnivel SI seria una diferencia visual entre tipos"
  - "La pagina usa exigirAdmin() en vez de createClient(): necesita el user.id porque notifications.recipient_id es NOT NULL y no existe 'una notificacion para el rol'"
  - "rutaInterna() rechaza // aparte de los esquemas: //evil.com es una URL absoluta protocol-relative pese a empezar por barra"
  - "El debounce de 400 ms es una ESTIMACION, no una medicion, y va anotado como tal en el codigo"
  - "Con la pestana oculta se cierra el canal ademas de parar el sondeo: es una pantalla que se deja abierta ocho horas"

patterns-established:
  - "Cuando un comentario de codigo nombra el literal que un grep de verificacion busca, el comentario se reescribe: el grep no distingue codigo de comentario"

requirements-completed: [DASH-04, DASH-05]

# Metrics
duration: 35min
completed: 2026-09-06
---

# Phase 04 Plan 13: El panel de alertas y la frescura de los datos Summary

**Un solo panel muestra los doce tipos de alerta con el mismo icono en el mismo `--status-warn`, la misma etiqueta, el mismo alto de 64px y el mismo sitio en el orden cronológico, con un contador que dice el total aunque se vean siete; y la pantalla se refresca sola por un canal de `postgres_changes` que solo dispara `router.refresh()`, arranca diciendo que no está conectada, y se sigue actualizando por sondeo cuando el canal cae.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 3 de 3
- **Files modified:** 8 (4 creados, 4 modificados)

## Accomplishments

- **El criterio 4 del ROADMAP está construido, no prometido.** Los doce tipos comparten icono en el mismo color, etiqueta con el mismo tratamiento tipográfico que un encabezado de columna, alto de 64px y sitio en el orden cronológico. Y no es disciplina del componente: `FilaAlerta` **lee** `claseIcono`, `claseEtiqueta` y `tamanoIcono` de `MAPA_DE_ALERTAS`, cuyo tipo `PresentacionDeAlerta` los declara como literales cerrados. El componente no puede elegirlos aunque quiera.
- **"Ninguna alerta se esconde" tiene tres mecanismos medibles detrás**, no una frase: el contador muestra `enPanel.length` y nunca `visibles.length`; no hay virtualización, ni paginado, ni "ver más"; y ninguna transición de volumen (0 → 1 → 7 → 30) cambia el tamaño ni el peso de una fila.
- **El orden no se toca en el componente.** `mezclarAlertas()` lo resuelve en el servidor y `PanelAlertas` solo filtra por tipo, que es una operación que conserva el orden. Reordenar por severidad reabriría el documento de diseño.
- **D-14 tiene por fin superficie.** `leerOperacion().leidoEnMs` llevaba desde el plan 04-06 sin que nada lo pintara. Ahora la página lee el reloj **una vez** y ese instante baja a la ventana de la consulta, al cómputo de las alertas, a la ventana de las atendidas, al tiempo relativo de cada fila y a la marca de la cabecera. Ninguna superficie llama `Date.now()` por su cuenta.
- **El estado optimista se implementó con `useOptimistic` de base vacía, y eso resuelve solo el caso difícil del plan 04-08.** `marcarAlertaAtendida` devuelve `ok: false` **también con cero filas afectadas** (la alerta es de otro destinatario y `notifications_own_update` la deja fuera sin error). Con un `useState` habría que acordarse de restaurar el id en las dos ramas, y la que se olvida siempre es esa: la fila se quedaría oculta para siempre sin que nada se hubiera escrito. `useOptimistic` revierte solo al terminar la transición, y para entonces el `revalidatePath('/operacion')` de la action ya trajo la lista de verdad.
- **La degradación se dice con texto y arranca encendida.** Antes del primer `SUBSCRIBED` la línea dice `Sin conexión en vivo.` con su `WifiOff` en `--status-warn` y sondea cada 30 s. Al conectar pasa a `Actualizado hace 2 min (14:32)` y baja a 120 s. No hay toast: Realtime caído no es un error, es una condición que dura.
- **El sondeo de respaldo es la capa que importa hoy.** El proyecto Supabase hospedado todavía no existe (checkpoint A1 de la Fase 1, abierto) y las cuotas del free tier son documentación leída, no medición propia. Con el sondeo construido, Realtime queda como la capa que se puede quitar sin romper la pantalla.

## Task Commits

| Task | Nombre | Commit | Archivos |
| ---- | ------ | ------ | -------- |
| 1 | `FilaAlerta` y la regla dura de la ausencia de jerarquía | `2b34126` | `FilaAlerta.tsx`, `FilaAseo.tsx`, `lib/domain/dates.ts` |
| 2 | `PanelAlertas`, su contador y su filtro | `d77d23b` | `PanelAlertas.tsx`, `page.tsx`, `lib/data/operacion.ts` |
| 3 | Realtime, marca de actualización y degradación | `b06642c` | `SincronizacionEnVivo.tsx`, `MarcaActualizacion.tsx`, `page.tsx` |
| — | Hallazgos diferidos y el comentario que ensuciaba el grep | `cf3d7e5` | `deferred-items.md`, `FilaAlerta.tsx` |

## Decisiones que merecen su párrafo

### El toggle `Ver atendidas` vive en la URL, el filtro por tipo no

Los dos son "estado de la pantalla" y aun así van a sitios distintos, porque preguntan cosas distintas. El filtro por tipo opera sobre filas **que ya están en el navegador**: no toca la base y no debe costar un viaje, así que es `useState`. El toggle cambia **qué filas lee el servidor** (`read_at is null` contra `read_at` de los últimos siete días), así que es `?alertas=atendidas`. Resolverlo en el cliente obligaría a traer siempre siete días de atendidas en cada carga para tenerlas por si acaso.

Efecto secundario deseado: sobrevive al `router.refresh()` del canal de Realtime, y el enlace se comparte.

### La suscripción no lee el payload, y las cuatro razones están en el código

Es la tentación obvia ("ya que el evento llegó, aprovéchalo") y por eso va escrita en el archivo: (1) duplicar la derivación del servidor es duplicar `lib/domain/`; (2) el payload trae la fila cruda de `cleanings` **sin los embeds**, así que actualizar estado local dejaría sin resolver el nombre del apartamento y el del aseador, obligando a una consulta por evento —el N+1 que la consulta con embed evita—; (3) ignorarlo esquiva `REPLICA IDENTITY FULL`, que sería coste permanente en el WAL; (4) `router.refresh()` conserva qué días están colapsados, el filtro del panel y el `Sheet` abierto, que es exactamente lo que un `location.reload()` destruiría.

### `leerAlertasAtendidas()` es función aparte, no un parámetro

`leerAlertasDelAdmin()` calza columna a columna con `notifications_inbox_idx`, que es **parcial** (`where read_at is null`), y su docstring lo afirma. Meterle una rama que anule ese filtro haría esa afirmación falsa la mitad de las veces. La consulta nueva cae fuera del índice y hace seq scan; con un admin y decenas de notificaciones es irrelevante, y queda dicho en su docstring antes de que alguien lo mida y lo reporte como regresión.

### El ancla estirada, y por qué no un `<a>` que envuelva

D-08 pide que toda la fila sea el destino del clic, y la fila contiene el botón de atender. Un control dentro de un ancla es HTML inválido: el navegador rompe el árbol y el teclado deja de alcanzar uno de los dos. Con el ancla en `absolute inset-0` y el botón en `relative z-10`, los dos son alcanzables por `Tab` y el clic cae donde debe. El coste es que el `<a>` no contiene el texto visible, así que lleva `aria-label` explícito con la etiqueta, el apartamento y el título.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Funcionalidad crítica ausente] El ancla `#aseo-{id}` no existía en el documento**

- **Encontrado durante:** Task 1.
- **Problema:** el contrato §11.3 fija el destino del clic como `/operacion#aseo-{id}`, y ninguna fila de aseo tenía ese `id`. El enlace habría sido un enlace a ninguna parte, en silencio.
- **Arreglo:** `id={`aseo-${fila.id}`}` y `scroll-mt-barra` en `FilaAseo` (`scroll-mt` compensa la barra superior fija de 56px; sin ella el navegador deja la fila justo debajo del cromo).
- **Archivos:** `app/(admin)/operacion/_components/FilaAseo.tsx`.
- **Commit:** `2b34126`.
- **Lo que NO se arregló:** expandir el bloque del día si estaba colapsado. Requiere un `useEffect` sobre el `hash` dentro de `BloqueDia.tsx`, que es del plan 04-09 y no está en el `files_modified` de este. Anotado en `deferred-items.md`.

**2. [Rule 2 - Seguridad] `notifications.url` llegaba al `href` sin filtro**

- **Encontrado durante:** Task 1.
- **Problema:** T-04-10 dispone `mitigate` sobre esta columna y la mitigación escrita es "se renderiza como `href` de un `<Link>` interno, nunca como HTML". Eso cierra la inyección de HTML, pero no cierra que un valor almacenado sea `javascript:…`, `data:…` o `//host-externo`. Hoy el vector está cerrado por construcción (`notifications` no tiene policy ni grant de INSERT para nadie), pero la defensa dependía enteramente de eso.
- **Arreglo:** `rutaInterna()`, que solo deja pasar cadenas que empiecen por `/` y **no** por `//`. `//evil.com` es una URL absoluta protocol-relative pese a empezar por barra, y sin ese segundo caso el filtro dejaría pasar justo el redirect externo que pretende cortar. Sin `url` válida no se renderiza ancla: no se inventa un destino.
- **Archivos:** `app/(admin)/operacion/_components/FilaAlerta.tsx`.
- **Commit:** `2b34126`.

**3. [Rule 3 - Bloqueante] No había forma de formatear un instante a hora de Bogotá fuera de `dates.ts`**

- **Encontrado durante:** Task 1 y Task 3.
- **Problema:** la marca de frescura pide el absoluto (`(14:32)`) y la fila de alerta pide el instante completo en el `title`. `HORA_BOGOTA` era privado del módulo. La alternativa era construir un `Intl.DateTimeFormat` en el componente, que es exactamente lo que la cabecera de `dates.ts` prohíbe: fuera de ese archivo, convertir instantes a mano es un bug.
- **Arreglo:** `formatHoraBog()` y `formatInstanteBog()` exportados desde `lib/domain/dates.ts`, los dos apoyados en los formateadores que ya existían y con la misma regla de devolver `null` ante una marca ilegible.
- **Archivos:** `lib/domain/dates.ts`.
- **Commits:** `2b34126`.

**4. [Rule 3 - Bloqueante] La página no tenía el `user.id` que el panel necesita**

- **Encontrado durante:** Task 2.
- **Problema:** `leerAlertasDelAdmin()` exige `userId`, porque `notifications.recipient_id` es NOT NULL y no existe "una notificación para el rol". `page.tsx` construía el cliente con `createClient()` a secas.
- **Arreglo:** `exigirAdmin()` con el mismo `catch(NoAutorizado) → redirect('/login')` que ya usa el layout de `(admin)`. Cuesta la misma llamada que un `getUser()` suelto y añade una capa de defensa.
- **Archivos:** `app/(admin)/operacion/page.tsx`.
- **Commit:** `d77d23b`.

**5. [Rule 1 - Bug] Un comentario ensuciaba el grep de verificación**

- **Encontrado durante:** la verificación final.
- **Problema:** la verificación del plan dice que `grep -rn "dangerouslySetInnerHTML" app/(admin)/operacion/` no devuelve nada, y un comentario de `FilaAlerta` nombraba ese literal para explicar que no se usa. El grep no distingue código de comentario.
- **Arreglo:** el comentario se reescribió sin nombrar la prop, y dice por qué no la nombra.
- **Archivos:** `app/(admin)/operacion/_components/FilaAlerta.tsx`.
- **Commit:** `cf3d7e5`.

### Lo que se dejó fuera, a propósito

- **La expansión automática del día colapsado al seguir un ancla.** Ver desviación 1 y `deferred-items.md`.
- **`hora_limite_vencida` de días anteriores a hoy.** `alertasComputadas()` no acota por fecha, pero su entrada son las filas de `leerOperacion()`, cuya ventana empieza en `hoyBog()`. Un aseo de ayer con la hora límite pasada y sin terminar **no produce alerta**. El caso mayoritario (un aseo de hoy cuya hora ya pasó) sí funciona. Ampliar la ventana cambiaría el comportamiento del carril ancho para las tres superficies, y una consulta propia añadiría un cuarto viaje: son decisiones de alcance, no correcciones. Anotado en `deferred-items.md`.

## Authentication Gates

Ninguna. El plan no instaló paquetes ni tocó credenciales.

## Threat Flags

Ninguna superficie de seguridad nueva fuera del `<threat_model>` del plan. La única ruta añadida es el parámetro de URL `?alertas=atendidas`, que no llega a ninguna consulta: se compara contra la cadena literal `'atendidas'` y decide entre dos funciones de lectura ya escritas, las dos acotadas por `recipient_id = user.id` y por `notifications_own_select`.

## Known Stubs

Ninguno. Las cuatro superficies nuevas están cableadas a datos reales: `PanelAlertas` recibe la mezcla de `notifications` más las tres computadas, `MarcaActualizacion` recibe el `leidoEnMs` de la consulta real, y `SincronizacionEnVivo` abre el canal contra las dos tablas que el plan 04-05 publicó.

## Verification

| Comprobación | Resultado |
| --- | --- |
| `npx tsc --noEmit` | limpio |
| `npm run build` | verde, `/operacion` en 86.3 kB / 338 kB de First Load |
| `npx eslint` sobre los 6 archivos tocados | limpio, 0 problemas |
| `npm run test:unit` | `Test Files 31 passed, Tests 567 passed` |
| `npm run test:integration` | `Test Files 16 passed, Tests 145 passed` |
| `npm run db:test` | `Files=7, Tests=153, Result: PASS` |
| `npm run ci:arch` | `check-service-role: OK` |
| `grep -rn "dangerouslySetInnerHTML" app/(admin)/operacion/` | sin resultados |
| `grep -q "removeChannel" SincronizacionEnVivo.tsx` | presente |

Las cuatro líneas base del entorno se mantienen exactas: 153 pgTAP, 567 unitarios, 145 de integración, `ci:arch` OK. `npm run lint` completo sigue fallando con los 3 errores preexistentes de `e2e/fixtures.ts` (`react-hooks/rules-of-hooks`, falsos positivos sobre el argumento `use` de Playwright, desde el commit `814e0cd` de la Fase 2); son del plan 04-14 y no se tocaron.

**Lo que este plan NO verifica y le toca al 04-14:** la prueba de escala de grises sobre una captura real del panel (§16.2) y el caso de 30 alertas en pantalla. Los dos son e2e con Playwright.

## Nota sobre notificaciones

Este plan **lee** filas de `notifications` y escribe su `read_at`. **Nadie drena esa cola todavía**: el push al aseador es la Fase 5. Ningún texto de esta pantalla dice ni sugiere que se le avisó a nadie.
