---
phase: 4
slug: dashboard-operativo-del-admin
status: draft
shadcn_initialized: true
preset: base-nova (components.json ya en el repo desde la Fase 2)
created: 2026-09-03
---

# Fase 4 — Contrato de diseño de UI

> Contrato visual y de interacción. Lo produce `gsd-ui-researcher`, lo verifica `gsd-ui-checker`, lo consumen `gsd-planner` y `gsd-executor`.
> Idioma de la interfaz: **español**. Código, tokens, rutas, slugs de base y REQ-IDs quedan como están.

**REQ-IDs cubiertos:** ASEO-01 a ASEO-06, ASEO-08, ASEO-09, DASH-01 a DASH-07, REPORT-04. ASEO-07 se cubre solo en su superficie de error (§12.6).

**Este documento hereda `02-UI-SPEC.md` completo.** Espaciado, tipografía, paleta, reglas de movimiento, accesibilidad y contrato de copy siguen vigentes tal cual. Aquí solo se escribe lo que **cambia** o lo que **se añade**. Las tres supersesiones explícitas están marcadas con **SUPERSEDE** y son las únicas.

---

## 0. Lo que esta fase renderiza de verdad

| Hecho medido | Consecuencia de diseño |
|---|---|
| Una corrida del sync puede meter **quince aseos sin confirmar de golpe** (04-CONTEXT §specifics) | La bandeja y el `Sheet` se calibran para quince, no para uno. El `Sheet` es encadenado con progreso, y NO hay un toast por confirmación: quince toasts es spam. §10 |
| 34 unidades gestionadas, decenas de aseos por día, escritorio | Tabla densa de fila 40px reutilizando el patrón de `TablaApartamentos.tsx`. Sin tarjetas, sin virtualización, sin paginación |
| **5 unidades son de gestión externa** y sus aseos existen en la misma tabla, inertes por CHECK (`cl_unmanaged_is_inert`) | La fila inerte tiene su propio contrato visual entero (§7.5). No es un estado deshabilitado ni un error |
| Los siete tipos de alerta comparten jerarquía (criterio 4) | El color NO codifica tipo. Un solo color de acento para todo el panel. La carga la llevan icono y etiqueta de texto. §11 |
| `notifications` ya trae `title` y `body` **redactados en español desde la migración 13** | El panel de alertas NO reescribe ese copy: lo renderiza. Lo que la UI añade es el icono, la etiqueta de tipo, el tiempo relativo y el destino del clic |
| `cancel_reason` y `review_reason` son **slugs de una lista cerrada**, nunca texto libre (migración 13, líneas 119-133) | La UI mapea slug → copy. Nunca se renderiza `reserva_movida` crudo. Y el diálogo de cancelar **no pide motivo escrito**: no hay dónde guardarlo. §12.5 |
| `is_urgent` significa una cosa concreta: existe una reserva viva cuyo `starts_on` es el `scheduled_date` del aseo (migración 13, línea 820) | Checkout y checkin el mismo día. El copy de la alerta lo dice así, no "es urgente" |
| El motor corre cada 30 min y el admin deja la pantalla abierta todo el día | D-13/D-14: refresco propio + marca de tiempo visible, y un tooltip que distingue "cuándo leí la base" de "cuándo se sincronizó Airbnb" |
| Confirmar **no notifica a nadie** hasta la Fase 5 | Ningún copy de esta fase puede decir "se le avisó al aseador". §18 lo fija literalmente |

---

## 1. Design System

Sin cambios respecto de la Fase 2, salvo una adición.

| Propiedad | Valor |
|---|---|
| Tool | `shadcn` CLI. `components.json` ya existe, `style: base-nova`, `iconLibrary: lucide`, `registries: {}` |
| Component library | **Base UI** (`@base-ui/react`) |
| Icon library | `lucide-react` **1.39.0 instalado** (`research/STACK.md` pinea 1.37.0: deriva menor, ver §20.4). Los 30 iconos de §17.3 se verificaron contra el paquete instalado el 2026-09-03 |
| Estilos | Tailwind v4, `@theme` en `app/globals.css`. **No existe `tailwind.config.js` y no se crea** |
| Tema | Solo claro |

### 1.1 Falta `sheet`, y el archivo generado necesita tres arreglos

D-09 lo exige y no está entre las 23 primitivas instaladas.

```bash
npx shadcn@4.19.1 add sheet
```

Verificado el 2026-09-03 con `npx shadcn@4.19.1 view sheet`: el bloque es del registry **oficial**, `registryDependencies: ["button"]`, un solo archivo, `registry/base-nova/ui/sheet.tsx`, sobre `@base-ui/react/dialog`. Sin `fetch`, sin `process.env`, sin `eval`, sin imports dinámicos externos. Evidencia registrada en §19.

Tres correcciones **obligatorias** sobre el archivo que genera el CLI, medidas en el mismo `view`:

1. **`SheetTitle` viene con `font-medium` (peso 500).** El contrato de tipografía declara exactamente dos pesos, 400 y 600, y prohíbe 500 (`02-UI-SPEC.md` §3). Cambiar a `font-semibold`.
2. **`SheetContent` viene con `w-3/4` y `sm:max-w-sm` (384px)** para `side="right"`. El contrato pide 480px. Se corrige con `--container-sheet` (§2), no con un `max-w-[480px]` suelto.
3. **El archivo importa `IconPlaceholder` desde `@/app/(create)/components/icon-placeholder`**, que no existe en este repo. El CLI resuelve ese placeholder al instalar según `iconLibrary: lucide`; si por lo que sea queda literal en el archivo generado, se reemplaza por `<X className="size-4" aria-hidden="true" />` de `lucide-react` y el `sr-only` pasa a `Cerrar`.

---

## 2. Escala de espaciado

La escala de la Fase 2 (`xs` 4 · `sm` 8 · `md` 12 · `lg` 16 · `xl` 24 · `2xl` 32 · `3xl` 48) sigue igual, y sigue prohibido el valor arbitrario. Esta fase **añade** estos tokens a `@theme` en `app/globals.css`:

```css
@theme {
  /* Carriles de la pantalla de operación (§6) */
  --container-rail:  360px;  /* carril lateral sticky: bandeja + alertas */
  --container-sheet: 480px;  /* Sheet de confirmación encadenada (§10) */

  /* Columnas de la tabla de día (§7.1). Son OTRAS que las de la tabla de
     apartamentos y por eso llevan sufijo propio, misma razón que dio la Fase 2
     al separar --spacing-col-estado de --spacing-col-estado-apto: compartir el
     token haría que tocar una tabla moviera la otra. */
  --spacing-col-estado-aseo: 132px;  /* icono 14px + "Gestión externa", la etiqueta más larga */
  --spacing-col-hora:         88px;  /* HORA LÍMITE, alineada a la derecha */
  --spacing-col-acargo:      176px;  /* A CARGO: aseador, o contacto externo */
  --spacing-col-huespedes:    88px;  /* HUÉSPEDES, alineada a la derecha */

  /* Excepciones de alto declaradas, todas múltiplo de 4 (§2 de la Fase 2) */
  --spacing-fila-alerta: 64px;  /* fila del panel de alertas: 2 líneas + 24px de aire */
  --spacing-dia-cabecera: 48px; /* cabecera colapsable de cada día */
  --spacing-chip:        32px;  /* chip de carga por aseador (§8.2) */
}
```

`--spacing-fila` (40px), `--spacing-fila-encabezado` (32px), `--spacing-barra` (56px), `--spacing-col-menu` (48px) y `--spacing-col-nombre` (200px) **ya existen** y se reutilizan tal cual.

**No se declara ningún token de toque de 44px.** Esta fase es solo `(admin)`, escritorio con mouse. `--spacing-toque` sigue siendo exclusivo de `app/(cleaner)/`.

---

## 3. Tipografía

**Sin cambios.** Los cuatro tamaños (24 / 16 / 14 / 12) y los dos pesos (400 / 600) de `02-UI-SPEC.md` §3 rigen igual. Reglas nuevas ligadas a esta fase:

- **`tabular-nums` obligatorio** en: hora límite, número de huéspedes, contadores de la bandeja y del panel, conteos de los chips de carga, y la marca de tiempo de última actualización. Sin él, la columna de horas de 30 filas no alinea.
- **La etiqueta de tipo de alerta** va en 12px / 600 / `uppercase` / `tracking-columna` / `--muted-foreground`, exactamente el mismo tratamiento que un encabezado de columna. Es deliberado: la etiqueta es el *rótulo* de la fila, no su contenido.
- **El título de la alerta** (el `title` que ya viene de `notifications`) va en 14px / 600 / `--foreground`. Idéntico para los siete tipos. Ninguno sube de tamaño ni de peso.
- El nombre del apartamento en una fila de aseo va en 14 / 600, igual que en la tabla de apartamentos. En la fila inerte también (§7.5): bajarlo a 400 o a `--muted-foreground` la haría leer como deshabilitada.

---

## 4. Color

### 4.1 Un token nuevo, medido

Los cinco estados del aseo necesitan un quinto color. `--status-ok`, `--status-warn`, `--status-idle` y `--status-info` ya existen y se reparten cuatro; **En curso** se queda sin uno y los dos grises (`idle` #475569 e `info` #6B7280) están demasiado cerca para separar dos estados distintos.

```css
:root {
  /* Estado operativo, NO es de marca y NO cambia con el rebrand. Mismo bloque
     y misma regla que --status-ok y compañía. */
  --status-progress: oklch(0.4882 0.2172 264.38);  /* #1D4ED8 */
}

@theme inline {
  --color-status-progress: var(--status-progress);
}
```

Medido con la fórmula WCAG 2.1 el 2026-09-03, misma rutina con la que se reprodujeron exactos los valores de `02-UI-SPEC.md` §4.2:

| Token | Hex | OKLCH | vs `--background` #FFFFFF | vs `--canvas` #F6F7F8 |
|---|---|---|---|---|
| `--status-progress` | `#1D4ED8` | `oklch(0.4882 0.2172 264.38)` | **6.70:1** | **6.25:1** |

Pasa AA en las dos superficies donde se usa (fila de tabla sobre `--background`, fila en hover sobre `--canvas`). Es azul, así que no colisiona ni con `--primary` (coral, hue 29) ni con `--destructive` (hue 13.7), que es el choque declarado en `02-UI-SPEC.md` §4.6.

### 4.2 Ampliación de la lista cerrada del acento

**SUPERSEDE 1 de 3.** `02-UI-SPEC.md` §4.4 fija cinco usos de `--primary`. Esta fase añade uno y precisa otro:

6. **Barra de progreso del `Sheet` de confirmación encadenada** (§10). Es el mismo caso que el punto 4 (barra de progreso del banner de montaje): una barra de avance de una tarea larga.

Y sobre el punto 1 ("botón primario de cada pantalla, uno por pantalla, máximo"): en `/operacion` ese único primario es **`Confirmar N aseos` de la bandeja** (§9). `Crear aseo` de la cabecera de página va como `variant="outline"`. Razón: crear un aseo manual es una acción rara y deliberada; confirmar los quince que acaban de caer es el trabajo de la pantalla. Dos rellenos primarios compitiendo dejarían al ojo eligiendo entre ellos justo cuando hay quince cosas pendientes.

Sigue prohibido `--primary` como color de estado, como tinte de fila, en badges, en iconos de tabla y en el panel de alertas.

### 4.3 La regla dura del panel de alertas

**El color no codifica el tipo de alerta. Punto.** D-07, y es la parte más fácil de romper por accidente.

- Los siete iconos van **todos** en `--status-warn` (#B45309, 5.02:1 sobre blanco, 4.68:1 sobre `--canvas`). Uno solo, idéntico, para los siete.
- La etiqueta de tipo va en `--muted-foreground`. Idéntica para los siete.
- El título va en `--foreground`. Idéntico para los siete.
- **Prohibido:** rojo para "urgente", ámbar para "hora límite", gris para "faltantes", un `border-left` de color por tipo, un `Badge` de color por tipo, o cualquier variación de tamaño, peso o fondo entre tipos.
- El único uso de color dentro del panel es ese `--status-warn` uniforme de los iconos, que separa el panel entero del resto de la pantalla sin decir nada sobre ninguna alerta en particular.

Verificación operativa, no opinión: **una captura del panel convertida a escala de grises tiene que seguir siendo legible y tiene que seguir distinguiendo los siete tipos.** Si al pasar a grises algo se pierde, el color estaba cargando información. §16.2.

### 4.4 Colores de estado del aseo

Aquí el color **sí** acompaña, porque nunca va solo: icono de forma distinta + etiqueta de texto + color, los tres a la vez, igual que en `02-UI-SPEC.md` §5.

| Estado | Color |
|---|---|
| Sin confirmar | `--status-warn` |
| Pendiente | `--status-idle` |
| En curso | `--status-progress` |
| Terminado | `--status-ok` |
| Cancelado | `--muted-foreground` |
| Gestión externa | `--status-info` |

---

## 5. Vocabulario de estado del aseo

Seis filas: los cinco estados operativos más la unidad de gestión externa. Todo se deriva de `cleanings` sin ninguna columna nueva.

| Estado | Derivación | Icono lucide | Etiqueta | Color |
|---|---|---|---|---|
| **Sin confirmar** | `is_managed AND state = 'pendiente' AND confirmado_at IS NULL` | `Inbox` | `Sin confirmar` | `--status-warn` |
| **Pendiente** | `is_managed AND state = 'pendiente' AND confirmado_at IS NOT NULL` | `Clock` | `Pendiente` | `--status-idle` |
| **En curso** | `is_managed AND state = 'en_curso'` | `Play` | `En curso` | `--status-progress` |
| **Terminado** | `is_managed AND state = 'completada'` | `CircleCheck` | `Terminado` | `--status-ok` |
| **Cancelado** | `is_managed AND state = 'cancelada'` | `CircleSlash` | `Cancelado` | `--muted-foreground` |
| **Gestión externa** | `NOT is_managed` (⇒ `state IS NULL` por `cl_unmanaged_is_inert`) | `CircleDashed` | `Gestión externa` | `--status-info` |

Reglas:

- **La derivación vive en una sola función**, `estadoDeAseo(c)` en `lib/domain/cleanings.ts`, y devuelve un discriminante tipado, exactamente como `estadoDeApartamento()` en `lib/domain/properties.ts`. Duplicar el `if` en dos componentes es cómo la UI se desincroniza de los CHECK.
- `CircleDashed` es **reuso deliberado**: la Fase 2 ya lo asignó a `Informativa` en la tabla de apartamentos, y es el mismo hecho de dominio (`gestion_vivaguest = false`). Cambiar de icono entre superficies para el mismo concepto sería el error.
- Las seis siluetas son distintas entre sí en escala de grises: bandeja, reloj, triángulo relleno, círculo con check, círculo con barra, círculo punteado.
- Debajo de cada tabla de día no va leyenda. La leyenda de seis pares en cada uno de los tres días sería tres veces el mismo párrafo. Va **una sola vez**, al pie del carril ancho, después del bloque `Siguientes`.

### 5.1 Tipo de aseo — badge inline, no columna

`cleaning_type` es `normal | repaso | emergencia`. **No tiene columna propia**: el 90% de las filas son `normal` y una columna con 27 celdas vacías y 3 llenas es 104px de ancho regalados en un carril de 1000px.

Se renderiza como `Badge` **inmediatamente después del nombre del apartamento**, dentro de la celda `APARTAMENTO`:

| Tipo | Badge |
|---|---|
| `normal` | **nada**. Es el default; un badge que diga `Normal` en 27 de 30 filas es puro ruido |
| `repaso` | `Badge variant="secondary"`, texto `Repaso`, 12px/600 |
| `emergencia` | `Badge` con texto `--status-warn` sobre `--surface-warn`, texto `Emergencia`, 12px/600 |

Sin icono en ninguno de los dos: llevan texto, y el texto ya cumple la regla de "nunca color solo".

### 5.2 Señales inline: urgente y por revisar

Dos flags booleanos de `cleanings` que no son estados y no pueden vivir en la columna `ESTADO`. Van como iconos de 14px en la celda `APARTAMENTO`, después del nombre y después del badge de tipo, con `gap-xs`:

| Señal | Derivación | Icono | Color | `aria-label` / `title` |
|---|---|---|---|---|
| Urgente | `is_urgent = true` | `Zap` | `--status-warn` | `Entra huésped el mismo día` |
| Por revisar | `needs_review = true` | `Flag` | `--status-warn` | El copy del slug de `review_reason`, §18.3 |

Van con `aria-label` y no con `aria-hidden`: son iconos sin texto adyacente que los explique.

---

## 6. Anatomía de la pantalla

### 6.1 Dos carriles, con las medidas hechas

Ruta: **`/operacion`**, una sola (D-01). Sin pestañas.

```
┌─ barra superior 56px, sticky ───────────────────────────────────────────────┐
├─────────────────────────────────────────────────────────────────────────────┤
│ Operación                    Actualizado hace 2 min (14:32) ⟳  [Crear aseo] │
├──────────────────────────────────────────────┬──────────────────────────────┤
│ CARGA DE HOY  [María 5][Ana 4][Luis 3][…]    │  Sin confirmar          15   │
│ ┌──────────────────────────────────────────┐ │  [ Confirmar 15 aseos ]      │
│ │ ▼ Hoy · jue 3 de sep    14 · 3 sin conf. │ │  ├──────────────────────────┤│
│ │ ESTADO  APARTAMENTO  HORA  A CARGO  HUÉS.│ │  │ Bogotá 3          3 sep  ││
│ │ ...30 filas de 40px...                   │ │  │ Medellín 1        3 sep  ││
│ └──────────────────────────────────────────┘ │  │ ...                      ││
│ ┌──────────────────────────────────────────┐ │  ╞══════════════════════════╡│
│ │ ▶ Mañana · vie 4 de sep            9     │ │  │ Alertas             12  ⌄││
│ └──────────────────────────────────────────┘ │  ├──────────────────────────┤│
│ ┌──────────────────────────────────────────┐ │  │ ⚡ URGENTE      hace 8min ││
│ │ ▶ Siguientes (5 días)             31     │ │  │   Bogotá 3 · Entra hué…  ││
│ └──────────────────────────────────────────┘ │  │ 🔨 DAÑO        hace 22min││
│ leyenda de estados, 12px                     │  │ ...                      ││
└──────────────────────────────────────────────┴──────────────────────────────┘
```

- Contenedor: `max-w-admin` (1440px), `px-xl` (24px) → **1392px útiles**.
- Rejilla: `grid-template-columns: minmax(0, 1fr) var(--container-rail)`, `gap-2xl` (32px).
- **Carril ancho = 1392 − 360 − 32 = 1000px** a 1440.
- A 1280px, el mínimo soportado: 1280 − 48 = 1232 útiles → **carril ancho = 840px**. Las columnas fijas de la tabla de día suman 532px (§7.1), así que `APARTAMENTO` queda en 308px, por encima de su mínimo de 200. **1280px es el piso exacto de este layout**, no una estimación.

### 6.2 El carril lateral, y por qué tiene alturas fijas

D-02 exige que la bandeja **y** el panel de alertas estén visibles sin scroll, siempre. Con 15 sin confirmar y 30 alertas eso solo se cumple si el carril tiene un presupuesto de altura cerrado y el scroll es interno.

```css
/* carril lateral */
position: sticky;
top: var(--spacing-barra);                              /* 56px */
height: calc(100vh - var(--spacing-barra) - var(--spacing-xl));  /* −24px de aire abajo */
display: flex; flex-direction: column; gap: var(--spacing-lg);
```

Reparto interno:

| Bloque | Altura | Scroll |
|---|---|---|
| Bandeja: cabecera + CTA | `auto` (40px + 8px + 36px) | fijo, fuera del scroll |
| Bandeja: lista | `max-height: 40%` del carril | `overflow-y: auto` |
| Panel de alertas: cabecera | 40px | fijo, fuera del scroll |
| Panel de alertas: lista | `flex: 1` | `overflow-y: auto` |

A 1080p con el cromo del navegador (~900px de viewport útil) el carril mide ~820px: la bandeja cae en ~328px (8 filas de 40px visibles de 15) y el panel en ~460px (7 filas de 64px visibles de 30). **Ningún caso empuja al otro fuera de la pantalla, que es exactamente lo que D-02 pide.**

Las dos cabeceras llevan `position: sticky; top: 0` dentro de su propio scrollport, así que el contador nunca se va con el scroll.

### 6.3 Navegación

**SUPERSEDE 2 de 3.** `02-UI-SPEC.md` §6.1 dice: *"La Fase 4 añade Día / Sin confirmar / Alertas"*. Eso se escribió antes de D-01, que fija **una sola ruta**. Tres links a la misma pantalla serían tres links muertos.

`TopNav` pasa a tener **tres** links, en este orden:

```
VivaGuest   Operación  Apartamentos  Aseadores                    JO ▾
```

- `Operación` → `/operacion`. Es el primero y es el **destino del wordmark** (hoy apunta a `/apartamentos`).
- Es la pantalla de aterrizaje del admin tras el login.
- El resto del tratamiento (14/400, alto 40px, activo en 600 con `border-bottom: 2px solid --primary`, `aria-current="page"`) no cambia.

### 6.4 Responsive

Igual que la Fase 2: escritorio, referencia 1440px, **mínimo soportado 1280px**, y no se construye vista móvil de `(admin)`.

- Por debajo de 1280px los dos carriles se apilan: primero el lateral (bandeja + alertas, ya sin `sticky`, con sus listas completas sin `max-height`), después los días. Se apila en ese orden y no al revés porque lo que exige acción va antes que lo que se consulta, que es el criterio entero de D-02.
- Por debajo de 1280px la tabla de día hace scroll horizontal dentro de su card, con `ESTADO` y `APARTAMENTO` fijas a la izquierda (`position: sticky`).
- **Trampa heredada, ya medida en el plan 02-07 y documentada dentro de `TablaApartamentos.tsx`:** el `Table` de shadcn envuelve la tabla en un div con `overflow-x-auto`, y ese div se convierte en el scrollport de cualquier `sticky` interno, así que el encabezado sticky no engancha. La salida ya está escrita en ese archivo (`containerClassName="overflow-x-visible max-xl:overflow-x-auto"`) y las tablas de día la copian tal cual. **No se rediseña.**

---

## 7. La fila de aseo

Es la unidad visual que más se repite en toda la pantalla. Sale del patrón ya establecido en `app/(admin)/apartamentos/_components/TablaApartamentos.tsx`.

### 7.1 Columnas, a 1000px de carril

| # | Columna | Ancho | Alineación | Contenido |
|---|---|---|---|---|
| 1 | `ESTADO` | `--spacing-col-estado-aseo` 132px | izquierda | Icono 14px + etiqueta 12/600 (§5) |
| 2 | `APARTAMENTO` | flexible, min `--spacing-col-nombre` 200px | izquierda | 14/600, `<a>` al detalle. Después: badge de tipo (§5.1) y señales inline (§5.2) |
| 3 | `HORA LÍMITE` | `--spacing-col-hora` 88px | derecha | `11:30`, `tabular-nums`, formato 24h vía `formatHoraLimite()` |
| 4 | `A CARGO` | `--spacing-col-acargo` 176px | izquierda | Nombre del aseador. Vacío → `Sin asignar` en `--status-warn`. En fila inerte: `contacto_externo` (§7.5) |
| 5 | `HUÉSPEDES` | `--spacing-col-huespedes` 88px | derecha | Entero, `tabular-nums`. Sin confirmar → `—` + `sr-only "sin definir"` |
| 6 | — | `--spacing-col-menu` 48px | derecha | `MoreHorizontal`, menú de acciones. **Ausente en fila inerte** |

Fijas: 132 + 88 + 176 + 88 + 48 = **532px**. `APARTAMENTO` recibe 468px a 1440 y 308px a 1280.

El encabezado se llama `A CARGO` y no `ASEADOR` a propósito: es la única columna que tiene que servir a la vez al aseador de una fila gestionada y al contacto externo de una inerte. Dos encabezados distintos exigirían dos tablas.

### 7.2 Comportamiento de la fila

Idéntico al de `TablaApartamentos`, y se dice explícitamente para que no se reinvente:

- Alto `--spacing-fila` 40px, `border-bottom: 1px solid --border`. Hover `--canvas`. **Sin zebra.**
- Encabezado `--spacing-fila-encabezado` 32px, fondo `--canvas`, 12/600 `uppercase` `tracking-columna` `--muted-foreground`.
- **La fila no es un `<div>` clicable.** El `<a>` vive en la celda `APARTAMENTO` y estira su área con `::after { position:absolute; inset:0 }`; el menú `⋯` va por encima con `relative z-10`. El foco de fila se pinta con `has-[a:focus-visible]:bg-canvas`.
- Orden dentro de un día: `hora_limite` ascendente, después nombre del apartamento. **Los sin confirmar no flotan arriba**: su superficie es la bandeja, y duplicarlos arriba del día los listaría dos veces en la misma pantalla.
- **Los cancelados no se muestran por defecto.** La cabecera del día lleva `Ver cancelados (2)`, 12/400, un toggle. No es esconderlos: el conteo está a la vista y son un clic. Un aseo cancelado no tiene ninguna acción posible y ocupar una fila de 40px con él, en una lista de 30, empuja fuera algo accionable. Los **terminados sí se quedan visibles**: son el avance del día.
- Sin paginación y sin virtualización. Decenas de filas de 40px son un solo render.

### 7.3 Menú de acciones por fila

Sale de `MenuApartamento.tsx`: `DropdownMenu`, botón de 40px de área clicable con icono de 14px, `aria-label` con el nombre del apartamento y la fecha (`Acciones del aseo de Bogotá 3 del 3 de septiembre`) porque 30 botones llamados "Acciones" son indistinguibles para quien navega por lista de controles.

| Ítem | Icono | Visible cuando | Estilo |
|---|---|---|---|
| `Confirmar` | `Check` | estado = Sin confirmar | normal |
| `Reasignar` | `UserRoundCog` | estado ∈ {Pendiente, En curso} | normal |
| `Reprogramar` | `CalendarClock` | estado = Pendiente | normal |
| `Cerrar manualmente` | `CircleCheck` | estado ∈ {Pendiente, En curso} | normal |
| `Ver apartamento` | `Building2` | siempre (fila gestionada) | normal |
| `Cancelar aseo` | `CircleSlash` | estado ∈ {Pendiente, En curso} | **texto `--destructive`**, separador encima |

- `Reprogramar` **no** aparece sobre un aseo en curso: la aseadora ya está adentro.
- Sobre Terminado y Cancelado el menú solo tiene `Ver apartamento`.
- **Ocultar un ítem no es autorizar.** Misma regla que la Fase 2: cada RPC verifica el rol por dentro, y un Server Action es un endpoint HTTP público. Lo de acá es UX.
- Ningún ítem se muestra deshabilitado. Un ítem atenuado que no dice por qué es peor que su ausencia.

### 7.4 La fila inerte de gestión externa

**DASH-07 + D-20 + D-21.** Es la parte del contrato más fácil de implementar mal, porque las dos maneras obvias de resolverla están mal: pintarla gris entera la hace leer como deshabilitada por fallo, y sacarla a otra vista rompe el panorama del día que el admin necesita.

Qué se renderiza, celda por celda:

| Celda | Contenido |
|---|---|
| `ESTADO` | `CircleDashed` 14px `--status-info` + `Gestión externa` 12/600 `--status-info` |
| `APARTAMENTO` | Nombre en **14/600 `--foreground`**, igual que cualquier otra fila. Es un `<a>` al detalle del apartamento. Sin badge de tipo, sin señales inline |
| `HORA LÍMITE` | `—` `--muted-foreground` + `<span class="sr-only">no aplica</span>` |
| `A CARGO` | `properties.contacto_externo`, 14/400, truncado con el texto completo en `title`. **Este es el "a cargo de quién" que pide DASH-07** |
| `HUÉSPEDES` | `—` + `sr-only "no aplica"` |
| menú | **La celda existe (para no romper la rejilla) y está vacía.** No hay `⋯`, ni deshabilitado ni atenuado |

Y tres reglas de comportamiento que son las que de verdad comunican "esto no lo tocas":

1. **La fila no reacciona al mouse.** Sin `hover:bg-canvas`. Es la señal más honesta que existe: nada aquí responde. Una fila deshabilitada por fallo sí reaccionaría y además diría por qué.
2. **No hay área de clic de fila completa.** El `::after` que estira el ancla sobre toda la fila (§7.2) no se aplica acá. Solo el texto del nombre es clicable. Abrir el apartamento es navegación de lectura, no una acción sobre el aseo, y por eso el link se conserva; extenderlo a toda la fila la volvería a sentir como un control.
3. **Diferencia entre `—` y "sin definir".** El em dash de una fila inerte lleva `sr-only "no aplica"`, no `sr-only "sin definir"` como en la Fase 2. No es un dato que falte: es un dato que la base **prohíbe** por `cl_unmanaged_is_inert`. Decir "sin definir" sugeriría que alguien debería ir a llenarlo.

Y una línea al pie de cada tabla de día que tenga al menos una fila inerte, 12/400 `--muted-foreground`:

> `Las unidades de gestión externa aparecen para que el día quede completo. VivaGuest no las opera.`

Esa frase es lo que mata de raíz la lectura "¿esto está roto?". Sin ella, la primera vez que el admin vea una fila sin estado y sin menú va a reportarla como bug.

**La UI refleja el CHECK, no lo reimplementa** (D-21). Ninguna de estas reglas se escribe como validación: se derivan de `is_managed`, que la base ya garantiza coherente.

---

## 8. Los días (DASH-01) y la carga por aseador (DASH-03)

### 8.1 Los tres bloques

| Bloque | Contenido | Por defecto |
|---|---|---|
| `Hoy` | Aseos con `scheduled_date = today_bog()` | **Expandido** |
| `Mañana` | `scheduled_date = today_bog() + 1` | Colapsado |
| `Siguientes` | `today_bog() + 2` … `today_bog() + 6`, **agrupados por día** | Colapsado |

**Discreción de Claude, resuelta:** `Siguientes` agrupa por día y llega hasta **D+6**, no es una lista corrida. Razón: DASH-01 pide "organizados por día", y una lista corrida de 31 filas pierde justo el ancla que el requisito nombra. Cinco días es el horizonte con el que se decide un suplente; más allá no hay ninguna decisión que tomar hoy.

Después del último grupo, si hay algo más lejos, una línea 12/400 `--muted-foreground` **sin expansión**:
> `Hay 12 aseos programados después del 9 de septiembre.`

Cabecera de cada día, alto `--spacing-dia-cabecera` 48px, fondo `--canvas`, esquinas superiores redondeadas 6px:

```
▼  Hoy · jueves 3 de septiembre              14 aseos · 3 sin confirmar   Ver cancelados (2)
```

- Toda la cabecera es el `<button>` de colapso, con `aria-expanded` y `aria-controls`. `ChevronDown` abierto / `ChevronRight` cerrado, 16px.
- `Hoy · jueves 3 de septiembre` en 16/600. El rótulo relativo va primero porque es lo que se escanea; la fecha absoluta detrás porque es lo que se verifica. Formato vía `formatFechaBog()`.
- Conteos a la derecha en 12/400 `tabular-nums` `--muted-foreground`. `3 sin confirmar` solo aparece si es > 0.
- `Ver cancelados (N)` es un control aparte dentro de la cabecera, con `stopPropagation` para no colapsar el día al pulsarlo. Solo aparece si N > 0.
- **El estado de colapso no se persiste.** Cada carga abre `Hoy` y cierra los otros dos. No se construye `localStorage`.
- Día sin aseos: la cabecera se renderiza igual, con `0 aseos`, y al expandir muestra el estado vacío de §15.1. No se oculta el día: que hoy no haya nada es información.

### 8.2 La franja de carga

Va **justo encima de la cabecera de `Hoy`**, dentro del carril ancho, no en el lateral. Es una franja, no una zona (D-04).

```
CARGA DE HOY   [ María G.  5 ]  [ Ana P.  4 ]  [ Luis R.  3 ]  [ Sin asignar  3 ]  [ Carlos M.  0 ]
```

- Rótulo `CARGA DE HOY` en 12/600 `uppercase` `tracking-columna` `--muted-foreground`, `margin-right: --spacing-md`.
- Chip: alto `--spacing-chip` 32px, fondo `--muted`, radio 6px, `px-md` (12px), `gap-sm` (8px) entre nombre y conteo. Nombre 12/400 `--foreground`, conteo 12/600 `tabular-nums` `--foreground`.
- `flex-wrap` con `gap-sm`. Ocho chips caben de sobra en 1000px.
- **Se listan todos los aseadores activos, incluidos los que van en 0.** "Quién está libre" es la mitad de la decisión del suplente; ocultar los ceros deja solo la otra mitad.
- Orden: conteo descendente, después nombre. `Sin asignar` **siempre último**, sin importar su conteo, y solo si es > 0. Su chip lleva fondo `--surface-warn` y texto `--status-warn`; el color refuerza, la etiqueta `Sin asignar` es la que informa.
- **Los chips no son clicables y no filtran nada.** No se construye filtro por aseador en esta fase. Un chip que parece botón y no hace nada es peor que un chip que claramente no lo es: sin `cursor: pointer`, sin hover, sin foco.
- **No hay escala de color por carga.** No existe un umbral de "sobrecargado" definido en el producto, y PERF-V2-01 (scorecard por aseador) está diferido a v2. Pintar de rojo el 5 sería inventar una métrica de desempeño donde solo hay un conteo operativo.
- Si hoy no hay ningún aseo asignado, la franja no se renderiza. No hay carga que mostrar.

---

## 9. Bandeja "Sin confirmar" (DASH-02, ASEO-01)

Arriba del carril lateral, persistente, siempre visible.

```
┌──────────────────────────────────┐
│ Sin confirmar               15   │   ← cabecera 40px, sticky
│ [    Confirmar 15 aseos     ]    │   ← primario, 36px, ancho completo
├──────────────────────────────────┤
│ ⚡ Bogotá 3               3 sep  │   ← filas de 40px, scroll interno
│    Medellín 1            3 sep   │
│    Cartagena 2           4 sep   │
└──────────────────────────────────┘
```

- Card sobre `--background`, `border: 1px solid --border`, radio 6px.
- Cabecera: `Sin confirmar` 16/600 + contador en `Badge` con texto `--status-warn` sobre `--surface-warn`, 12/600 `tabular-nums`.
- CTA primario, ancho completo, 36px: `Confirmar 15 aseos`. Con uno solo: `Confirmar 1 aseo`. Abre el `Sheet` en el primero de la lista (§10).
- Fila de 40px, es un `<button>` que abre el `Sheet` **en ese aseo**: nombre del apartamento 14/400 truncado con `title`, y a la derecha la fecha corta 12/400 `tabular-nums` `--muted-foreground`.
- Los urgentes llevan `Zap` 14px `--status-warn` antes del nombre, con `aria-label="Entra huésped el mismo día"`.
- **Orden:** `scheduled_date` ascendente; dentro de la misma fecha, los urgentes primero, después por nombre. La urgencia adelanta dentro del día, no salta días: un urgente del viernes no va antes de uno normal de hoy.
- **Fecha corta:** hace falta un helper nuevo, `formatFechaCortaBog(iso)` → `3 sep`, en `lib/domain/dates.ts`. `formatFechaBog()` devuelve `jue, 3 de septiembre` y no cabe en 176px de carril. Misma regla de siempre: se parte el string, **prohibido `new Date('2026-09-03')`**, que se parsea como UTC y en Bogotá muestra el día anterior.
- Vacía: `Check` 24px `--status-ok`, `Todo confirmado.` 14/600, `Los aseos nuevos van a aparecer acá.` 12/400 `--muted-foreground`. Sin botón: no hay nada que hacer.
- La lista **no se pagina ni se corta con "ver más"**. Si hay 15, están las 15, con scroll interno. Recortar la bandeja es la forma de que un aseo se pierda, que es exactamente contra lo que existe el producto.

---

## 10. El `Sheet` de confirmación encadenada (ASEO-02, ASEO-03)

D-09 a D-12. Calibrado para quince seguidas.

`Sheet side="right"`, ancho `--container-sheet` 480px (hay que pisar el `sm:max-w-sm` del componente generado, §1.1).

```
┌─ Confirmar aseo ──────────────────────────── ✕ ┐
│ 3 de 15                                        │
│ ███████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
├────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────┐ │
│ │ Bogotá 3                                   │ │
│ │ jueves 3 de septiembre · hora límite 11:30 │ │
│ │ Queda asignado a María Gómez               │ │
│ └────────────────────────────────────────────┘ │
│                                                │
│ Número de huéspedes *                          │
│ [ 4                                          ] │
│                                                │
│ Instrucciones                                  │
│ [                                            ] │
│ [                                            ] │
│ Lo que el aseador va a leer antes de empezar.  │
│ Opcional.                                      │
├────────────────────────────────────────────────┤
│ [ Cerrar ]                 [ Confirmar y seguir ]│
└────────────────────────────────────────────────┘
```

**Cabecera.** Título `Confirmar aseo` 16/600 (con `font-semibold`, ver §1.1). Debajo, el progreso `3 de 15` en 12/400 `tabular-nums` `--muted-foreground`, y una `Progress` de 4px con relleno `--primary` (§4.2, uso 6 del acento). El progreso cuenta **confirmados de la tanda inicial**, no "posición en una lista que se encoge": si el admin cierra en el 3 y vuelve a abrir, arranca una tanda nueva.

**Bloque de contexto.** Card `--canvas`, `p-lg` (16px), radio 6px. Apartamento 16/600. Segunda línea 14/400: `{fecha larga} · hora límite {HH:mm}`. Tercera línea 14/400: `Queda asignado a {responsable}`. Si el apartamento no tiene responsable, esa línea pasa a `--status-warn`: `Este apartamento no tiene responsable. Asígnalo antes de confirmar.` y el botón de confirmar queda deshabilitado con `Tooltip` que repite la carencia y un link a la ficha del apartamento.

**El código de acceso NO aparece.** D-12, y no es una omisión de conveniencia: se revela por `reveal_access_code` con auditoría, y confirmar no lo necesita.

**Campo 1 — `Número de huéspedes`.** Requerido. `Input type="text" inputMode="numeric"`, `autoFocus` al abrir y al encadenar. La base exige `num_huespedes > 0` (CHECK de la migración 04), así que la UI valida `entero ≥ 1` antes de enviar y ese CHECK no debería poder dispararse nunca desde acá.

**Campo 2 — `Instrucciones`.** Opcional. `Textarea` de 3 filas. Helper 12/400: `Lo que el aseador va a leer antes de empezar. Opcional.`

**Pie.** `Cerrar` (`variant="outline"`, izquierda) y `Confirmar y seguir` (primario, derecha). En el último de la tanda el primario cambia a **`Confirmar y cerrar`**.

**El encadenamiento, y el ruido que evita:**

- Al guardar con éxito, el `Sheet` **no se cierra**: carga el siguiente sin confirmar, limpia los dos campos y devuelve el foco al campo de huéspedes.
- **No hay toast por confirmación.** Quince toasts seguidos tapan la pantalla. Lo que sí hay es una región `aria-live="polite"` que anuncia `Aseo 3 de 15 confirmado.` en cada paso: quien no ve la pantalla necesita esa confirmación, y quien la ve tiene la barra de progreso.
- Al terminar la tanda: se cierra solo y **un** toast: `Listo: 15 aseos confirmados.`
- Al cerrar a mitad (botón, `Esc` o clic fuera): toast `Confirmaste 3 de 15. Los demás siguen en la bandeja.` Lo confirmado no se pierde jamás (D-10).
- Si hay texto escrito en el campo del aseo actual y se cierra, **se pierde solo ese**, sin diálogo de "¿seguro?". Son dos campos; un diálogo de descarte encima de un `Sheet` encima de una tanda de quince es una pila de tres.
- **Si un `confirm_cleaning` falla** (el sync canceló ese aseo entre medias, RLS, red): NO se avanza. Aparece un `Alert` destructivo dentro del `Sheet`, encima de los campos, con el mensaje de `mapDbError()`, **se conserva lo tecleado**, y el pie ofrece `Saltar este` (outline) además de `Reintentar` (primario). Sin `Saltar`, un aseo roto bloquea las doce que faltan.

---

## 11. El panel de alertas (DASH-04, DASH-05)

Es el criterio 4 del ROADMAP y la parte más difícil del contrato. **Ninguna alerta se esconde** (D-05), y siete tipos se distinguen sin usar color (D-07).

### 11.1 Los siete tipos

| # | Tipo | Origen | Icono | Etiqueta (12/600 uppercase) |
|---|---|---|---|---|
| 1 | Urgente | **Computado**: `cleanings.is_urgent` | `Zap` | `URGENTE` |
| 2 | Extensión mal creada | `notifications.type = 'extension_sospechosa'` | `ArrowLeftRight` | `EXTENSIÓN MAL CREADA` |
| 3 | No puedo | `notifications.type = 'no_puedo'` | `UserRoundX` | `NO PUEDO` |
| 4 | Daño | `notifications.type = 'dano_reportado'` | `Hammer` | `DAÑO` |
| 5 | Faltantes | `notifications.type = 'faltantes_reportados'` | `PackageOpen` | `FALTANTES` |
| 6 | Calendario caído | `notifications.type = 'calendario_caido'` **+ computado** con `estadoDeSincronizacion()` | `CalendarX` | `CALENDARIO CAÍDO` |
| 7 | Hora límite vencida | `notifications.type = 'hora_limite_vencida'` **+ computado** | `Hourglass` | `HORA LÍMITE VENCIDA` |

**Las siete siluetas son estructuralmente distintas:** rayo diagonal, dos flechas horizontales, cabeza con X, martillo diagonal, caja abierta, cuadrícula con X, reloj de arena. Los dos más parecidos (`CalendarX` y `PackageOpen`, ambos "cajas") se separan por las anillas superiores y la X del primero contra las solapas abiertas del segundo, y en cualquier caso **la etiqueta de texto es la que carga el significado**; el icono es el ancla de escaneo.

Los tres iconos que se reusan de la Fase 2 lo hacen con el mismo sentido: `CalendarX` ya significa "calendario que no funciona" en la tabla de apartamentos.

`Zap` es el mismo icono que la señal inline de urgencia en la fila (§5.2), y eso es deseado: el admin lo aprende una vez.

### 11.2 Cómo se computan las tres alertas que no son notificaciones

| Tipo | Condición | Instante para el orden cronológico |
|---|---|---|
| Urgente | `is_urgent AND is_managed AND state IN ('pendiente','en_curso') AND scheduled_date >= today_bog()` | `cleanings.created_at` |
| Hora límite vencida | `is_managed AND state IN ('pendiente','en_curso') AND (scheduled_date + hora_limite) < ahora en Bogotá` | `scheduled_date + hora_limite` (el instante en que venció) |
| Calendario caído (global) | `estadoDeSincronizacion(max(last_success_at de feeds activos), Date.now()) === 'caida'` | `max(last_success_at) + UMBRAL_SYNC_CAIDA_MS` |

- `UMBRAL_SYNC_CAIDA_MS` es 3 h y **tiene que seguir igual** al `interval '3 hours'` del `feed_health_watchdog` de `supabase/migrations/20260902235500_14_sync_jobs.sql`. Dos umbrales distintos para la misma pregunta producen el peor estado: el panel en verde mientras la bandeja tiene una alerta.
- **La alerta global de calendario caído no lleva apartamento.** En el slot del apartamento escribe `Todo el sistema`, y su título es: `Ningún calendario ha sincronizado en las últimas 3 horas.` No compite con las notificaciones por feed del watchdog: esas dicen qué feed falla, esta dice que no corre nada. Son hechos distintos y **coexisten en el panel** (04-CONTEXT lo pide literalmente).
- **Deduplicación:** una alerta computada se suprime si ya existe una notificación **del mismo tipo y con el mismo `cleaning_id`**. Aplica a `hora_limite_vencida`. No aplica a la global de calendario, que no tiene `cleaning_id`.

### 11.3 Anatomía de la fila de alerta

Alto `--spacing-fila-alerta` **64px**, `padding: --spacing-md` (12px), `gap: --spacing-md`, `border-bottom: 1px solid --border`.

```
┌────────────────────────────────────────────────┐
│ ⚡  URGENTE                        hace 8 min  │  ← 12/600 uppercase  ·  12/400 tabular
│    Bogotá 3 · Entra huésped el mismo día    ✓ │  ← 14/600 + 14/400 muted, truncado
└────────────────────────────────────────────────┘
```

- **Columna 1:** icono 16px `--status-warn`, alineado a la primera línea. Idéntico color para los siete (§4.3).
- **Línea 1:** etiqueta de tipo a la izquierda, tiempo relativo a la derecha (`hace 8 min`, `hace 3 h`, `ayer 14:20`), 12/400 `tabular-nums` `--muted-foreground`. El instante absoluto va en el `title`.
- **Línea 2:** `{Apartamento}` 14/600 `--foreground` + ` · ` + `{title de la notificación}` 14/400 `--muted-foreground`, una sola línea, `truncate`, con el `body` completo en el atributo `title` del elemento.
- **Toda la fila es el destino del clic** (D-08): `<a>` al aseo (ancla `#aseo-{id}` dentro del día correspondiente, expandiéndolo si estaba colapsado) o al apartamento cuando no hay `cleaning_id`. Se usa `notifications.url` cuando viene poblada. Hover `--canvas`, anillo de foco de 2px `--primary`.
- **Botón `Marcar como atendida`**, icono `Check`, 32px de área, al extremo derecho de la línea 2. Visible siempre (no solo en hover): un control que solo existe al pasar el mouse no existe para el teclado. `aria-label="Marcar como atendida: {título}"`.

Los cálculos: 12·1.4 (16.8) + 14·1.5 (21) + 24 de padding = 61.8 → 64px. Cabe sin apretar.

### 11.4 Orden, filtro y "atendida"

- **Orden por defecto: cronológico descendente** por el instante del hecho (D-06). No por tipo, no por severidad, no por apartamento. Lo más reciente arriba.
- **Filtro por tipo:** `DropdownMenu` con icono `ListFilter` en la cabecera del panel. Arranca en `Todas` (D-07). Las opciones se listan **en el orden fijo de la tabla de §11.1, nunca por conteo**: una lista que se reordena sola es inusable. Cada opción muestra su conteo: `Daño (3)`. Con el filtro puesto, la cabecera lo dice: `Alertas · Daño` + un botón `Quitar filtro`.
- **El panel NO usa `read_at` como "leída".** No hay negrita para no leídas ni gris para leídas: cualquier tratamiento de leído/no leído reintroduce exactamente la jerarquía visual que el criterio 4 prohíbe, y además "leída" no es "resuelta". `read_at` se usa **solo** como marca de *atendida*, que es una acción explícita del admin.
- Una alerta atendida **sale del panel**, no se atenúa. La cabecera lleva un toggle `Ver atendidas`, que muestra las de los últimos 7 días, con el mismo tratamiento visual y el botón cambiado a `Devolver al panel`.
- Las alertas **computadas** no tienen `read_at` y no se pueden atender: desaparecen solas cuando el hecho se resuelve (el aseo se termina, `is_urgent` se apaga porque la reserva se movió, un feed vuelve a responder). Su botón de atender no se renderiza. Es coherente: son estados, no eventos.
- `read_at` se escribe con un `UPDATE` directo, no con RPC: `notifications` sí tiene `grant select, update` para `authenticated` y la policy `notifications_own_update` lo acota a `recipient_id = auth.uid()`. **El Server Action escribe únicamente la columna `read_at`**; el grant es de tabla, así que la disciplina de escribir una sola columna es de la action, no de la base.

### 11.5 Comportamiento con 0, con 1 y con 30

| Alertas | Comportamiento |
|---|---|
| **0** | Estado vacío dentro del panel: `Check` 24px `--status-ok`, `Sin alertas.` 14/600, `Cuando algo necesite tu atención va a aparecer acá.` 12/400. **El panel no desaparece.** Su ausencia haría que la bandeja creciera y cambiara la geometría del carril cada vez que entra o sale una alerta |
| **1** | Una fila de 64px. El panel no se encoge al alto de su contenido: mantiene su `flex: 1` y la fila queda arriba. Una card de 100px flotando bajo la bandeja se lee como error de layout |
| **2–7** | Lista completa, sin scroll. Es el rango normal |
| **≥ 8** | La lista scrollea internamente (§6.2). La cabecera con el contador y el filtro queda `sticky` fuera del scroll. **El contador es lo que garantiza que nada se esconde**: dice 30 aunque se vean 7 |
| **≥ 30** | Igual. Sin virtualizar, sin paginar, sin "ver más". Con un admin y decenas de aseos al día, 30 filas es un render trivial |

Ninguna de estas transiciones cambia el tamaño ni el peso de ninguna fila. Que haya 30 no hace que la primera grite más.

---

## 12. Diálogos de mutación

Todos siguen el patrón ya establecido en `DialogoDesactivarApartamento.tsx`: el diálogo vive **fuera** del `DropdownMenu` (el menú se cierra al pulsar el ítem y un diálogo montado dentro se desmontaría con él), y `Cancelar`/`Volver` va en `variant="outline"` con `autoFocus`, nunca dos rellenos adyacentes (`02-UI-SPEC.md` §4.6).

### 12.1 Reasignar (ASEO-04)

`Dialog` de `--container-dialogo` 480px.

- Título: `Reasignar el aseo de {apartamento}`
- Bajo el título, **fija y siempre visible**, 12/400 `--muted-foreground`:
  > `Cambia quién hace este aseo. No cambia el responsable ni el suplente del apartamento.`

  Esa línea es D-18 y es **load-bearing**: es la confusión más fácil de cometer y la más cara de descubrir tarde. No se recorta, no se mueve a un tooltip, no se convierte en un `?`.
- `Select` `Aseador`, solo aseadores activos. El actual aparece preseleccionado y marcado `(actual)`.
- Botones: `Volver` (outline) · `Reasignar` (primario).
- Éxito: toast `El aseo quedó asignado a {nombre}.`

### 12.2 Reprogramar (ASEO-06)

`Dialog` 480px. Título `Reprogramar el aseo de {apartamento}`.

- Muestra la fecha actual en 14/400 y un `Input type="date"` con `min = today_bog()`.
- Si la fecha nueva choca con el índice parcial, el error va **inline bajo el campo de fecha**, no en toast (§12.6).
- Botones: `Volver` (outline) · `Reprogramar` (primario). Éxito: toast `El aseo quedó para el {fecha}.`

### 12.3 Crear aseo manual (ASEO-05)

`Dialog` 480px, se abre desde `Crear aseo` de la cabecera de página (`variant="outline"`, §4.2).

- Campos: `Apartamento` (`Command`/combobox, **solo unidades gestionadas y activas**), `Fecha` (`type="date"`, `min = today_bog()`), `Tipo` (`Select` con **`Repaso` y `Emergencia` únicamente**).
- `normal` **no es una opción**: los aseos normales los crea el sync desde el calendario. Ofrecerlo sería invitar a duplicar lo que el motor ya hace.
- **No pide huéspedes ni instrucciones.** El aseo nace `Sin confirmar` y cae en la bandeja, igual que uno del sync. Lo exige ASEO-01 ("todo aseo nace en Pendiente sin confirmar") y evita dos caminos distintos para el mismo dato.
- Botones: `Volver` (outline) · `Crear aseo` (primario). Éxito: toast `Aseo creado. Está en la bandeja Sin confirmar.`. El toast **dice dónde quedó**, porque el aseo recién creado no aparece en la tabla del día si el día está colapsado.

### 12.4 Cerrar manualmente (ASEO-08)

`AlertDialog`, **no destructivo**.

- Título: `Cerrar el aseo de {apartamento}`
- Cuerpo: `Queda como terminado, sin checklist y sin fotos. Úsalo solo cuando el aseo ya ocurrió por fuera del sistema.`
- Botones: `Volver` (outline, `autoFocus`) · `Cerrar aseo` (`variant="default"`, icono `CircleCheck`).
- Éxito: toast `El aseo quedó cerrado.`

### 12.5 Cancelar (ASEO-09)

`AlertDialog` **destructivo**.

- Título: `Cancelar el aseo de {apartamento}`
- Cuerpo: `El aseo del {fecha} deja de existir para el aseador. Si tiene que volver, hay que crearlo de nuevo.`
- Botones: **`Volver`** (outline, `autoFocus`) · `Cancelar aseo` (`variant="destructive"`, icono `CircleSlash`).

  **El botón de descartar se llama `Volver`, nunca `Cancelar`.** En un diálogo cuya acción es "cancelar un aseo", dos botones que dicen `Cancelar` y `Cancelar aseo` son una trampa. Esto no es preferencia de estilo.
- **No hay campo de motivo escrito.** `cleanings.cancel_reason` es un slug de una lista cerrada (`reserva_desaparecida`, `reserva_movida`, y la que añada esta fase para el admin), escrita literal dentro de las funciones y **nunca texto libre**, regla explícita de la migración 13, líneas 119-133, con su razón: son columnas que un humano lee en pantalla. Un textarea aquí obligaría o a violar esa regla o a tirar lo escrito.
- Éxito: toast `El aseo quedó cancelado.` **Sin "Deshacer"**: reactivar un aseo cancelado no es una operación que exista.

### 12.6 ASEO-07 — el error que tiene que ser legible

D-19. El índice parcial `cleanings_one_active_per_property_date` ya impide el duplicado desde la Fase 1. Cuando salte:

- Se añade su nombre al mapa de `mapDbError()` en `lib/domain/errors.ts` (la constante `IDX_ONE_ACTIVE_PER_PROPERTY_DATE` ya existe en `lib/domain/constants.ts` justo para esto).
- Mensaje: **`Ya hay un aseo activo para {apartamento} el {fecha}. Reprograma el que existe o cancélalo antes de crear otro.`**
- **Va inline bajo el campo `Fecha`, no en toast.** Es un error atado a un campo concreto y el usuario tiene que poder corregirlo sin cerrar el diálogo.
- Nunca se renderiza `23505` ni el texto crudo de Postgres.

---

## 13. Frescura de los datos (D-13, D-14, D-15)

### 13.1 La línea de última actualización

En la cabecera de página, a la derecha del título, antes del botón `Crear aseo`:

```
Actualizado hace 2 min (14:32)  ⟳
```

- 12/400 `tabular-nums` `--muted-foreground`. El relativo se recalcula cada 30 s en cliente; el absoluto es la hora de Bogotá de la lectura.
- Botón `⟳` (`RefreshCw`, 14px, 40px de área clicable, `aria-label="Actualizar ahora"`). Mientras corre: el icono gira con `animate-spin` (la única animación que sobrevive a `prefers-reduced-motion`, ya declarada en `globals.css`).
- **`Tooltip` obligatorio sobre la marca de tiempo:**
  > `Es la hora en que esta pantalla leyó la base. El calendario de Airbnb se sincroniza aparte, cada 30 minutos.`

  Sin eso, "actualizado hace 1 minuto" se lee como "Airbnb está al día hace 1 minuto", que es falso y es justo el tipo de mentira silenciosa que D-14 existe para evitar.

### 13.2 Cuando el tiempo real no conecta

D-15: el free tier de Supabase, y sobre todo **la pantalla no se puede quedar congelada sin avisar**.

| Situación | Línea visible | Refresco de respaldo |
|---|---|---|
| Realtime conectado | `Actualizado hace 2 min (14:32)` | revalidación cada **120 s** |
| Realtime desconectado o nunca conectó | `WifiOff` 14px + `Sin conexión en vivo. Actualizado hace 40 s (14:32).` en `--status-warn` | sondeo cada **30 s** |
| Pestaña oculta (`visibilityState === 'hidden'`) | — | **se pausa todo**, y al volver a visible se fuerza una lectura inmediata |

La pausa por visibilidad no es una optimización cosmética: es una pantalla que se deja abierta todo el día, y sondear una pestaña de fondo durante ocho horas es exactamente cómo se quema una cuota gratuita.

**La elección concreta entre Realtime y sondeo es discreción del planner** (04-CONTEXT §discretion), con una condición de este contrato: pase lo que pase, **la marca de tiempo de §13.1 se conserva**, y el estado degradado se dice con texto, nunca solo con un icono ni solo con un color.

---

## 14. Historial del apartamento (DASH-06, REPORT-04)

D-22 y D-23. Vive **dentro** de `app/(admin)/apartamentos/[id]`, como una sección al final de la ficha. No hay ruta nueva.

- Encabezado de sección `Historial` 16/600, con la regla de 1px `--border` encima, igual que las cinco secciones del formulario.
- **Cronológico descendente**, mezclando dos fuentes en una sola lista:

| Entrada | Icono | Línea 1 | Línea 2 |
|---|---|---|---|
| Aseo | el icono de su estado (§5) | `{fecha larga}` 14/600 + etiqueta de estado 12/600 | `{aseador}` · tipo si no es `normal` |
| Daño | `Hammer` | `{fecha larga}` 14/600 + `Daño reportado` 12/600 | `{descripcion}` truncada a una línea, completa en `title` |

- Fila de 64px, mismo alto que la de alerta, mismo reparto de dos líneas.
- Un daño resuelto (`damages.resolved_at IS NOT NULL`) añade a la línea 2, al final: ` · Resuelto`. No se oculta ni se atenúa.
- **Solo lectura, sin ninguna acción.** Los RPC de reporte llegan en la Fase 6. Ni botones, ni menú `⋯`, ni "marcar como resuelto".
- Muestra las **30 entradas más recientes** y un botón `Ver 30 más` (`variant="outline"`) al pie. La retención es de 6 meses, así que la lista tiene un techo natural.
- Vacío: `History` 32px, `Este apartamento no tiene historial todavía.` / `Los aseos y los daños reportados van a aparecer acá.`
- En una unidad de **gestión externa** la sección se renderiza igual: sus aseos inertes aparecen con `CircleDashed` + `Gestión externa` y sin aseador. No se oculta la sección, porque el historial de fechas sí es real.

---

## 15. Estados vacíos, de carga y de error

### 15.1 Vacíos

| Superficie | Encabezado | Cuerpo | Acción |
|---|---|---|---|
| Día sin aseos | `Ningún aseo para este día.` | `Si esperabas alguno, revisa que el calendario del apartamento esté conectado.` | — |
| Bandeja vacía | `Todo confirmado.` | `Los aseos nuevos van a aparecer acá.` | — |
| Panel de alertas vacío | `Sin alertas.` | `Cuando algo necesite tu atención va a aparecer acá.` | — |
| Filtro de alertas sin resultados | `Ninguna alerta de este tipo.` | `Quita el filtro para ver las 12 que hay.` | `Quitar filtro` |
| Historial vacío | `Este apartamento no tiene historial todavía.` | `Los aseos y los daños reportados van a aparecer acá.` | — |

Los tres primeros usan una variante **compacta**: icono 24px, encabezado 14/600, cuerpo 12/400, `py-xl` (24px), porque viven dentro de cards del carril lateral y el bloque de 48px de `EstadoVacio` los desbordaría. `EstadoVacio` (`app/(admin)/_components/EstadoVacio.tsx`) se usa tal cual para el día vacío y para el historial, que sí están en el carril ancho. **La variante compacta se añade a `EstadoVacio` como prop `compacto`, no se escribe un componente nuevo.**

### 15.2 Carga

- `loading.tsx` de `/operacion` con un esqueleto que **reproduce la geometría real**: los dos carriles, la franja de chips (4 rectángulos de 32px), la cabecera de día de 48px, 8 filas de 40px con los anchos de columna de §7.1, y en el lateral dos cards con 5 filas de 40px y 4 de 64px. Nunca un spinner centrado.
- Mutaciones: `useActionState` + `useFormStatus`. El botón en vuelo cambia icono por `Loader2` girando y label a gerundio (`Confirmando…`, `Reasignando…`, `Cancelando…`), y **conserva su ancho** con `min-width`. Prohibido deshabilitar sin mostrar el spinner.
- **Un caso de estado optimista, y solo uno:** `Marcar como atendida` en el panel de alertas. La fila sale de la lista de inmediato y vuelve con un toast destructivo si el `UPDATE` falla. Es la única mutación de la fase cuyo resultado se puede adivinar con certeza y la única que se hace varias veces seguidas. Todo lo demás (confirmar, reasignar, reprogramar, cerrar, cancelar, crear) espera respuesta del servidor: tienen constraints que pueden rechazarlas.

### 15.3 Errores

Mismo enrutamiento que `02-UI-SPEC.md` §9.4, sin excepciones:

| Tipo | Dónde |
|---|---|
| Validación de campo (Zod, cliente) | Inline bajo el campo, 12px `--destructive`, `aria-describedby` + `aria-invalid` |
| Error de base ligado a un campo (23505 de ASEO-07) | Inline bajo ese campo |
| Error de la operación completa (RLS, red, 42501) | Toast destructivo, **y el formulario conserva lo escrito** |
| Fallo dentro del `Sheet` encadenado | `Alert` destructivo dentro del `Sheet`, con `Saltar este` y `Reintentar` (§10) |
| Realtime caído | **No es un error**: es el estado degradado de §13.2. No lleva toast, lleva la línea permanente |

Todo error de base pasa por `mapDbError()`. Entradas que esta fase añade:

| Origen | Mensaje |
|---|---|
| `cleanings_one_active_per_property_date` (23505) | `Ya hay un aseo activo para {apartamento} el {fecha}. Reprograma el que existe o cancélalo antes de crear otro.` |
| `cl_unmanaged_is_inert` (23514) | Ya está mapeado desde la Fase 2: `Esa unidad es de gestión externa: no admite estado, aseador, instrucciones ni tarifas.` **Si el admin lo llega a ver, es un bug de la UI**: §7.5 y §12.3 son la red que impide llegar ahí |

---

## 16. Accesibilidad

Todo lo de `02-UI-SPEC.md` §13 sigue vigente. Lo que esta fase añade, por el criterio 4:

### 16.1 Contrastes de lo nuevo, medidos

| Par | Ratio | Mínimo |
|---|---|---|
| `--status-progress` #1D4ED8 sobre `--background` | **6.70:1** | 4.5:1 texto ✓ |
| `--status-progress` sobre `--canvas` (fila en hover) | **6.25:1** | 4.5:1 ✓ |
| `--status-warn` #B45309 sobre `--background` (iconos de alerta) | 5.02:1 | 3:1 gráfico ✓, y 4.5:1 texto ✓ |
| `--status-warn` sobre `--surface-warn` (chip `Sin asignar`, badge de contador) | 4.75:1 | 4.5:1 ✓ |
| `--muted-foreground` #5C6470 sobre `--background` (etiquetas de tipo, tiempos) | 5.98:1 | 4.5:1 ✓ |
| `--status-info` #6B7280 sobre `--background` (fila inerte) | 4.83:1 | 4.5:1 ✓ |

Ningún par del sistema queda por debajo. El texto de 12px de las etiquetas de tipo **no es una excepción**: pasa AA de texto normal, no se acoge a la regla de texto grande.

### 16.2 La prueba de escala de grises

Como el color no puede codificar el tipo de alerta (§4.3), la verificación no es "se ve bien": es una prueba concreta que el ejecutor tiene que correr y el `gsd-ui-auditor` tiene que poder repetir.

> Captura del panel de alertas con al menos una fila de cada uno de los siete tipos, convertida a escala de grises (`filter: grayscale(1)`). **Los siete tienen que seguir siendo distinguibles y la captura tiene que seguir siendo legible.** Si algo se pierde, el color estaba cargando información y hay que arreglarlo.

Pasa por construcción porque los siete comparten color de icono, color de texto, tamaño y peso: lo único que los separa es la silueta del icono y la etiqueta, y ninguno de los dos tiene color. La prueba existe para atrapar la regresión, no para descubrir el diseño.

### 16.3 Anuncios y semántica

- `aria-live="polite"` en: el avance del `Sheet` encadenado (`Aseo 3 de 15 confirmado.`), el contador de alertas cuando cambia, y la línea de última actualización cuando pasa a estado degradado.
- Cada bloque de día es `<section>` con `aria-labelledby` apuntando a su cabecera; el botón de colapso lleva `aria-expanded` y `aria-controls`.
- El carril lateral es un `<aside aria-label="Pendientes y alertas">`. La bandeja y el panel son `<section>` con su propio encabezado.
- Los iconos de estado que van acompañados de etiqueta llevan `aria-hidden="true"`. Los que van solos (señales inline de §5.2, `⚡` de la bandeja, iconos de calendario) llevan `aria-label`.
- Foco: anillo de 2px `--primary`, `outline-offset: 2px`. Toda fila de alerta, toda fila de bandeja, toda cabecera de día y todo botón de atender son alcanzables por `Tab`.
- El `Sheet` atrapa el foco, `Esc` cierra y el foco vuelve al disparador. Lo da Base UI; no se reimplementa. **Al encadenar, el foco va al campo de huéspedes**, no se queda en el botón que se acaba de pulsar.
- Tamaño de icono estándar: 16px. **14px dentro de celdas de tabla.** `strokeWidth={2}`.

---

## 17. Inventario de componentes

### 17.1 shadcn oficial

Las 23 primitivas ya instaladas, **más `sheet`** (§1.1). Sin envolver. Sigue prohibido crear un átomo que solo re-exporte un componente de shadcn.

Los que esta fase usa: `alert` · `alert-dialog` · `badge` · `button` · `card` · `command` · `dialog` · `dropdown-menu` · `input` · `label` · `progress` · `select` · `separator` · **`sheet`** · `skeleton` · `sonner` · `table` · `textarea` · `tooltip`.

### 17.2 Organismos — `app/(admin)/_components/` y `app/(admin)/operacion/_components/`

Por superficie, siguiendo la regla de la Fase 2. Nada compartido con `(cleaner)`.

| Componente | Responsabilidad | REQ |
|---|---|---|
| `EstadoAseo` | Icono + etiqueta desde `estadoDeAseo()`, los seis casos | §5 |
| `FilaAseo` | La fila de 40px con sus seis celdas, incluida la variante inerte | ASEO-01, DASH-07 |
| `TablaDia` | Tabla densa de un día, encabezado sticky, orden, toggle de cancelados | DASH-01 |
| `BloqueDia` | Cabecera colapsable de 48px + conteos + `TablaDia` | DASH-01 |
| `FranjaCarga` | Chips de carga del día de hoy | DASH-03 |
| `MenuAseo` | Menú `⋯` por fila, con los seis ítems condicionados por estado | ASEO-04, 06, 08, 09 |
| `BandejaSinConfirmar` | Card del carril lateral, contador, CTA, lista con scroll | ASEO-01, DASH-02 |
| `SheetConfirmar` | Panel encadenado con progreso, los dos campos y el manejo de fallo | ASEO-02, ASEO-03 |
| `PanelAlertas` | Cabecera con contador y filtro + lista mezclada y ordenada | DASH-04, DASH-05 |
| `FilaAlerta` | La fila de 64px: icono, etiqueta, título, tiempo, atender | DASH-04 |
| `MarcaActualizacion` | Marca de tiempo, tooltip, botón de recarga, estado degradado | D-13, D-14 |
| `DialogoReasignar` | Con la línea fija de D-18 | ASEO-04 |
| `DialogoReprogramar` | Con el error de ASEO-07 inline | ASEO-06, ASEO-07 |
| `DialogoCrearAseo` | Apartamento + fecha + tipo (repaso/emergencia) | ASEO-05 |
| `DialogoCerrarAseo` | `AlertDialog` no destructivo | ASEO-08 |
| `DialogoCancelarAseo` | `AlertDialog` destructivo, botón de descarte `Volver` | ASEO-09 |
| `HistorialApartamento` | Lista cronológica de aseos + daños, solo lectura | DASH-06, REPORT-04 |
| `EstadoVacio` | **Se modifica**: se le añade la prop `compacto` (§15.1) | §15.1 |
| `TopNav` | **Se modifica**: tercer link `Operación`, y el wordmark apunta ahí | §6.3 |

Lógica de dominio, fuera de los componentes y con tests, siguiendo el patrón de `lib/domain/properties.ts`:

| Módulo | Contenido |
|---|---|
| `lib/domain/cleanings.ts` | `estadoDeAseo()`, el discriminante tipado de §5 |
| `lib/domain/alertas.ts` | Mezcla de notificaciones + alertas computadas, orden cronológico, deduplicación de §11.2, conteos por tipo |
| `lib/domain/dates.ts` | **Se añade** `formatFechaCortaBog()` (§9) y el helper de tiempo relativo (`hace 8 min`) |
| `lib/domain/errors.ts` | **Se añade** la entrada de `cleanings_one_active_per_property_date` |

### 17.3 Iconos lucide — lista cerrada

**Verificados uno por uno contra `lucide-react@1.39.0` instalado, el 2026-09-03.**

Nuevos en esta fase:
`Inbox` · `Clock` · `Play` · `CircleSlash` · `Zap` · `Flag` · `ArrowLeftRight` · `UserRoundX` · `Hammer` · `PackageOpen` · `Hourglass` · `ListFilter` · `UserRoundCog` · `CalendarClock` · `Building2` · `RefreshCw` · `WifiOff` · `ChevronRight` · `History`

Reusados de la lista cerrada de la Fase 2:
`CircleCheck` · `CircleDashed` · `CalendarX` · `ChevronDown` · `MoreHorizontal` · `Check` · `X` · `Loader2`

Añadir un icono fuera de estas dos listas es una modificación de este contrato.

---

## 18. Contrato de copywriting

Español de Colombia, trato de "tú", imperativo. Sin signos de admiración. Sin "¡Ups!", "Algo salió mal" ni disculpas. Un error dice **qué pasó** y **qué hacer**.

### 18.1 Elementos

| Elemento | Copy |
|---|---|
| **CTA primaria de la pantalla** | `Confirmar 15 aseos` (con uno: `Confirmar 1 aseo`) |
| CTA secundaria de cabecera | `Crear aseo` |
| CTA del `Sheet` | `Confirmar y seguir` → en el último: `Confirmar y cerrar` |
| Vacío: bandeja | `Todo confirmado.` / `Los aseos nuevos van a aparecer acá.` |
| Vacío: alertas | `Sin alertas.` / `Cuando algo necesite tu atención va a aparecer acá.` |
| Vacío: día | `Ningún aseo para este día.` / `Si esperabas alguno, revisa que el calendario del apartamento esté conectado.` |
| Vacío: filtro de alertas | `Ninguna alerta de este tipo.` / `Quita el filtro para ver las 12 que hay.` |
| Vacío: historial | `Este apartamento no tiene historial todavía.` / `Los aseos y los daños reportados van a aparecer acá.` |
| Error: ASEO-07 | `Ya hay un aseo activo para {apartamento} el {fecha}. Reprograma el que existe o cancélalo antes de crear otro.` |
| Error: sin responsable al confirmar | `Este apartamento no tiene responsable. Asígnalo antes de confirmar.` |
| Estado degradado | `Sin conexión en vivo. Actualizado hace 40 s (14:32).` |
| Aclaración de frescura (tooltip) | `Es la hora en que esta pantalla leyó la base. El calendario de Airbnb se sincroniza aparte, cada 30 minutos.` |
| Aviso de gestión externa | `Las unidades de gestión externa aparecen para que el día quede completo. VivaGuest no las opera.` |
| Aviso de reasignación (D-18) | `Cambia quién hace este aseo. No cambia el responsable ni el suplente del apartamento.` |
| Confirmación: cerrar manualmente | `Cerrar el aseo de {apartamento}` / `Queda como terminado, sin checklist y sin fotos. Úsalo solo cuando el aseo ya ocurrió por fuera del sistema.` / `Volver` · `Cerrar aseo` |
| Confirmación destructiva: cancelar | `Cancelar el aseo de {apartamento}` / `El aseo del {fecha} deja de existir para el aseador. Si tiene que volver, hay que crearlo de nuevo.` / `Volver` · `Cancelar aseo` |
| Éxito: tanda confirmada | `Listo: 15 aseos confirmados.` |
| Éxito: tanda interrumpida | `Confirmaste 3 de 15. Los demás siguen en la bandeja.` |
| Éxito: reasignar | `El aseo quedó asignado a {nombre}.` |
| Éxito: reprogramar | `El aseo quedó para el {fecha}.` |
| Éxito: crear | `Aseo creado. Está en la bandeja Sin confirmar.` |
| Éxito: cerrar | `El aseo quedó cerrado.` |
| Éxito: cancelar | `El aseo quedó cancelado.` |
| Anuncio (aria-live) del encadenado | `Aseo 3 de 15 confirmado.` |

**Prohibición explícita, y es de producto:** ningún copy de esta fase puede decir ni sugerir que se le avisó al aseador. Confirmar asigna en firme y escribe el evento en la cola, pero **nadie lo drena hasta la Fase 5** (costura conocida del ROADMAP). Nada de `Se le notificó a María`, `El aseador ya fue avisado` ni `Le llegó la asignación`. El copy correcto es el de arriba: dice a quién quedó asignado, no que se le avisó.

### 18.2 Copy de los slugs de `cancel_reason`

`cancel_reason` es un slug de máquina y **nunca se renderiza crudo**. En la fila de un aseo cancelado, el motivo va en el `title` de la celda `ESTADO`:

| Slug | Copy |
|---|---|
| `reserva_desaparecida` | `La reserva desapareció del calendario.` |
| `reserva_movida` | `La reserva cambió de fecha.` |
| el que escriba la RPC de admin de esta fase | `Lo cancelaste tú.` |
| slug desconocido | `Cancelado.`, nunca el slug crudo, ni siquiera como respaldo |

### 18.3 Copy de los slugs de `review_reason`

Va en el `aria-label` y el `title` del icono `Flag` de la señal inline (§5.2), y en la línea 2 de la alerta cuando la notificación no trae `title` propio:

| Slug | Copy |
|---|---|
| `reserva_desaparecida_aseo_iniciado` | `La reserva desapareció, pero el aseo ya había empezado.` |
| `reserva_desaparecida_ventana_protegida` | `La reserva desapareció, pero el aseo es de hoy o de mañana.` |
| `reserva_desaparecida_bajo_piso` | `La reserva desapareció, pero quedó por detrás de la ventana del calendario.` |
| `reserva_movida_aseo_iniciado` | `La reserva cambió de fecha, pero el aseo ya había empezado.` |
| `reserva_movida_ventana_protegida` | `La reserva cambió de fecha, pero el aseo es de hoy o de mañana.` |
| `extension_sospechosa` | `Parece una extensión de estadía mal creada.` |
| slug desconocido | `Este aseo necesita revisión.` |

Los tres primeros dicen **por qué el sync no lo canceló solo**, que es la información que el admin necesita para decidir. "Ventana protegida" y "piso del feed" son los candados 3 y 4 de la migración 13; el copy los traduce sin nombrarlos.

### 18.4 Vocabulario fijo

Hereda el de `02-UI-SPEC.md` §15 y añade:

| Concepto | Término | No usar |
|---|---|---|
| `cleanings` | **aseo** | servicio, limpieza, turno, tarea |
| `state = 'completada'` | **terminado** | completado, finalizado, hecho |
| `confirmado_at IS NULL` | **sin confirmar** | pendiente de confirmar, no confirmado |
| `state = 'pendiente'` + confirmado | **pendiente** | asignado, programado |
| `notifications` en el panel | **alerta** | notificación, aviso, mensaje |
| `read_at` puesto por el admin | **atendida** | leída, vista, archivada |
| `aseador_id IS NULL` | **sin asignar** | sin aseador, libre, vacante |
| `is_urgent` | **entra huésped el mismo día** | urgente a secas, prioritario, crítico |

---

## 19. Registry Safety

| Registry | Bloques usados | Safety Gate |
|---|---|---|
| shadcn oficial (`@shadcn`) | `sheet` (nuevo en esta fase) + las 23 primitivas ya instaladas | no aplica — registry oficial |
| Terceros | **ninguno** | no aplica — `components.json` tiene `"registries": {}` |

Aun siendo oficial, se corrió `npx shadcn@4.19.1 view sheet` el **2026-09-03** antes de meterlo al contrato. Resultado: un solo archivo (`registry/base-nova/ui/sheet.tsx`), `registryDependencies: ["button"]`, sobre `@base-ui/react/dialog`. **Sin `fetch`, sin `XMLHttpRequest`, sin `sendBeacon`, sin `process.env`, sin `eval` ni `new Function`, sin imports dinámicos desde URL externa, sin nombres ofuscados.** Las tres correcciones de §1.1 son de contrato de diseño (peso 500, ancho 384px, import de `IconPlaceholder`), no hallazgos de seguridad.

No se declaró ningún registry de terceros, así que la compuerta de vetting **no se ejecutó porque no había nada de terceros que vetar**. Si en ejecución alguien quiere añadir un bloque externo, este documento se reabre y se corre la compuerta antes.

---

## 20. Deuda declarada de este contrato

Para que el `gsd-ui-auditor` no la reporte como hallazgo nuevo:

1. **El coral sigue siendo placeholder** y `--primary`/`--destructive` siguen siendo ambos rojos. Heredado de `02-UI-SPEC.md` §17.1 y §17.2. `--status-progress` es azul, así que esta fase no empeora el choque; lo esquiva.
2. **Sin modo oscuro**, sin vista móvil de `(admin)`. Heredado y deliberado.
3. **El panel de alertas no ordena por severidad, y eso es el requisito, no una limitación.** Si alguien más adelante pide "las urgentes arriba", eso reabre el criterio 4 del ROADMAP y este documento, no se resuelve en ejecución.
4. **Deriva de versión de `lucide-react`:** `research/STACK.md` pinea 1.37.0 y lo instalado es 1.39.0. Los 27 iconos de §17.3 se verificaron contra **lo instalado**. Si el pin se baja a 1.37.0 hay que revalidar `ArrowLeftRight`, `UserRoundX`, `UserRoundCog` y `PackageOpen`, que son los cuatro de nombre más reciente.
5. **La franja de carga no filtra.** Clicar un chip para ver solo los aseos de esa persona es útil y barato, y se dejó fuera a propósito para no ampliar alcance. Queda como idea, no como deuda funcional.
6. **El estado de colapso de los días no se persiste.** Cada carga abre `Hoy`. Si en el piloto el admin se queja de tener que reabrir `Mañana`, es una línea de `localStorage`.
7. **`read_at` significa "atendida" en este producto, no "leída".** La Fase 5 va a querer usar la misma columna para el push, y las dos semánticas conviven mal. Está anotado acá antes de que se convierta en una sorpresa.
8. **Hay archivos duplicados con sufijo ` 2` en `lib/domain/`, `lib/data/`, `app/(admin)/` y `supabase/migrations/`**, residuo del merge de worktrees del commit `ff164ac`. No es deuda de este contrato, pero el executor de esta fase se los va a encontrar y **no debe tomarlos como fuente de verdad**: hay que limpiarlos antes de construir encima.

---

## Checker Sign-Off

- [ ] Dimensión 1 Copywriting: PASS
- [ ] Dimensión 2 Visuals: PASS
- [ ] Dimensión 3 Color: PASS
- [ ] Dimensión 4 Typography: PASS
- [ ] Dimensión 5 Spacing: PASS
- [ ] Dimensión 6 Registry Safety: PASS

**Aprobación:** pending
