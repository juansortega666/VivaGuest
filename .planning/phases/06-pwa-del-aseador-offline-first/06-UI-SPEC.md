---
phase: 6
slug: pwa-del-aseador-offline-first
status: approved
shadcn_initialized: true
preset: none (`components.json` ya existe, `style: base-nova`, `registries: {}`)
created: 2026-09-12
---

# Fase 6 — Contrato de diseño de UI

> Contrato visual y de interacción. Lo consumen `gsd-planner` y `gsd-executor`.
> Idioma de la interfaz: **español de Colombia, trato de "tú"**. Código, tokens, rutas y REQ-IDs quedan como están.

**REQ-IDs cubiertos:** PWA-01, PWA-04 a PWA-10, CHECK-01 a CHECK-04, REPORT-01 a REPORT-03.

**Este documento hereda `02-UI-SPEC.md`, `04-UI-SPEC.md` y `05-UI-SPEC.md` completos.** Paleta, movimiento, accesibilidad y vocabulario siguen vigentes. La **escala tipográfica móvil** que la Fase 5 declaró para `app/(cleaner)/` (§3.1 de aquel documento) es la base de toda esta fase, no una excepción.

**Entradas leídas:** `06-CONTEXT.md` (D-01 a D-08), `.planning/ROADMAP.md` §Phase 6 con sus criterios corregidos el 2026-09-12, `REQUIREMENTS.md`, `PROJECT.md` §Constraints, los tres UI-SPEC anteriores, `app/globals.css`, `components/ui/`, y `app/(cleaner)/`.

---

## 0. Lo que esta fase renderiza de verdad

| Hecho anclado | Consecuencia de diseño |
|---|---|
| **La Fase 5 ya construyó el árbol del aseador**: layout, banner de avisos, `TarjetaAseo`, `CodigoDeAcceso`, y la escala tipográfica móvil con su guardarraíl de CI | Esta fase **extiende**, no estrena. `/mis-aseos` deja de ser stub y `/aseos/[id]` deja de ser solo lectura |
| **`accordion` y `radio-group` NO están instalados.** Se verificó: hay 24 primitivas y ninguna de las dos | Es la primera fase desde la 2 que instala primitivas. Dispara la regla del ancho (§2.4) |
| **D-03: acordeón y no wizard para el checklist**, porque la aseadora no limpia en orden fijo | El checklist es una lista de cuartos abribles, no una secuencia forzada. §6 |
| **D-05: la evidencia se recoge AL FINAL**, guiada cuarto por cuarto | El wizard existe, pero después de finalizar, no durante. §8 |
| **D-06: el skip NO bloquea terminar**, pero deja marca visible al admin | El motivo sale de una **lista cerrada**, porque una lista se puede contar y un texto libre no. §8.4 |
| **D-08: sin modo offline** | **Ninguna pantalla de esta fase muestra contador de pendientes, ni estado de cola, ni indicador de sincronización.** Prometer offline en la interfaz cuando no existe es peor que no tenerlo. §11.4 |
| **Uso real: de pie, con guantes o manos mojadas, una mano ocupada** | Piso de toque de 44 px en todo el árbol, 56 px en la acción que decide, y barra fija abajo (D-04) |
| **El código de acceso ya tiene su contrato cerrado** en `05-UI-SPEC.md` §9.3 | **No se reabre.** Sigue detrás de un botón, sin persistir, con su ventana temporal |

---

## 1. Design System

Sin cambio de herramienta. `components.json` ya existe.

| Propiedad | Valor |
|---|---|
| Tool | `shadcn` CLI. `style: base-nova`, `iconLibrary: lucide`, `registries: {}` |
| Component library | **Base UI** (`@base-ui/react`) |
| Icon library | `lucide-react` **1.39.0** |
| Font | Geist Sans / Geist Mono + Poppins (`--font-brand`) |
| Estilos | Tailwind v4.3.3, `@theme` en `app/globals.css`. No existe `tailwind.config.js` y no se crea |
| Tema | Solo claro |
| Toasts | `sonner` 2.0.8 |

### 1.1 Esta fase SÍ instala primitivas, y son dos

| Primitiva | Para qué | Superficie |
|---|---|---|
| `accordion` | El checklist por cuarto (D-03) | §6 |
| `radio-group` | El motivo del skip (D-06) y la categoría del reporte (D-07) | §8.4, §9 |

Lo demás sale de lo ya instalado: `card`, `button`, `checkbox`, `alert`, `badge`, `progress`, `separator`, `sheet`, `textarea`, `input`, `label`, `sonner`, `skeleton`.

**Advertencia obligatoria, y es la trampa medida de este repo:** toda primitiva del CLI nace con `max-w-xs` o `sm:max-w-sm` en su clase base, y en este proyecto esas clases **compilan a 4 y 8 píxeles** porque Tailwind v4.3 resuelve `max-w-<nombre>` contra `--spacing-*` antes que contra `--container-*`. Costó dos quicks. `npm run ci:arch` lo atrapa nombrando archivo y línea. El arreglo es un token `--container-<nombre-propio>` registrado **también** en el grupo `max-w` de `cn()`.

### 1.2 Alternativas descartadas, con la razón

| Descartado | Razón |
|---|---|
| **Wizard para el checklist** | La aseadora no limpia en orden fijo: puede arrancar por el baño. Un wizard le impone un orden ajeno. Y ya hay un wizard después, el de evidencia: dos seguidos cansan (D-03) |
| `collapsible` además de `accordion` | `accordion` ya da apertura única o múltiple. Instalar las dos es duplicar |
| Contador de acciones pendientes | Sin cola offline (D-08) no hay nada que contar. Mostrarlo sería mentir |
| `AlertDialog` para confirmar el fin del aseo | Un diálogo más entre la aseadora y terminar, de pie y con guantes. El wizard de evidencia ya es la confirmación |
| Cámara embebida en la app | `<input type="file" capture="environment">` abre la cámara nativa, que la persona ya sabe usar y tiene mejor enfoque y estabilización |

---

## 2. Escala de espaciado

Hereda `02-UI-SPEC` §2 (`xs` 4 · `sm` 8 · `md` 12 · `lg` 16 · `xl` 24 · `2xl` 32 · `3xl` 48) y los de la Fase 5 (`--spacing-toque` 44, `--spacing-toque-comodo` 56, `--spacing-paso` 32). Sigue prohibido el valor arbitrario.

### 2.1 Tokens nuevos

```css
@theme {
  /* ── barra fija de acciones (D-04) ────────────────────────────────────────
     56px de boton + 8px de aire arriba y abajo. El contenido de la pagina
     reserva este alto como padding inferior para que la ultima fila no quede
     debajo de la barra. */
  --spacing-barra-aseo: 72px;

  /* ── checklist ───────────────────────────────────────────────────────── */
  --spacing-fila-tarea:  48px;  /* una tarea del checklist: casilla + texto */
  --spacing-cabecera-cuarto: 56px; /* cabecera abrible del acordeon */

  /* ── evidencia ───────────────────────────────────────────────────────── */
  --spacing-miniatura: 64px;  /* miniatura de la foto tomada */

  /* ── anchos: NOMBRE PROPIO, NUNCA NOMBRE DE TALLA ─────────────────────── */
  --container-foto:    320px;  /* previsualizacion de la foto en el wizard */
  --container-motivo:  320px;  /* caja de motivos del skip */
}
```

`--spacing-toque` (44), `--spacing-toque-comodo` (56), `--container-aseador` (480) y toda la escala tipográfica móvil **ya existen** y se reutilizan tal cual.

### 2.2 Excepciones declaradas

| Excepción | Valor | Razón |
|---|---|---|
| Piso de toque en todo `app/(cleaner)/` | **44px** | Heredado de `02-UI-SPEC` §2. Sin excepciones: casillas del checklist, cabeceras de cuarto, botones del wizard |
| Acción principal de la barra fija y del wizard | **56px** | La aseadora la toca con guantes y sin mirar. Mismo criterio que `Activar los avisos` de la Fase 5 |
| Casilla del checklist | **44px de área de toque**, con el cuadro visual de 20px | El área es lo que se toca; el cuadro es lo que se ve. Una casilla de 20px es un toque fallido de cada tres |
| Separación entre dos controles adyacentes | **mínimo 8px (`sm`)** | Dos botones de 44px pegados producen toques equivocados con guantes tan seguro como un botón de 30px |

### 2.3 La cuenta de la pantalla, hecha y no estimada

Referencia **390px** (iPhone 14/15/16 base), mínimo soportado **360px**. El layout del aseador aporta `max-w-aseador` (480) con `p-lg` (16 por lado).

A 360px: **328px de contenido**. `--container-foto` (320px) cabe con 8px de aire. `--container-motivo` (320px) igual.

Alto útil a 390×844 con cromo de Safari (~735px de viewport): la barra fija se lleva 72, el banner de avisos hasta 120 cuando aparece, y quedan **~540px** para el acordeón. Con cabeceras de 56px eso son **nueve cuartos visibles** sin scroll, y el apartamento más grande del catálogo tiene seis. Cabe.

### 2.4 La regla del ancho, que esta fase reactiva

Los dos tokens nuevos de `--container-*` se registran **también** en el grupo `max-w` de `extendTailwindMerge` en `lib/utils.ts`, en orden alfabético. **No es opcional:** sin el registro, un override en el sitio de uso no desplaza al de la primitiva y el ancho depende del orden del CSS.

Y al correr `npx shadcn add accordion radio-group`, las dos primitivas llegan con clases de ancho con nombre de talla en su base. Hay que sustituirlas por tokens con nombre propio antes de commitear. `npm run ci:arch` falla si se olvidan.

---

## 3. Tipografía

**Sin cambios.** Esta fase usa la escala móvil que la Fase 5 declaró para `app/(cleaner)/`:

| Rol | Tamaño | Line height | Peso |
|---|---|---|---|
| Display | 28px | 1.2 | 600 |
| Heading | 20px | 1.3 | 600 |
| Body | 16px | 1.5 | 400 |
| Micro | 14px | 1.4 | 400 · 600 |

**Regla greppable y ya impuesta por CI:** dentro de `app/(cleaner)/` se usan **solo** las clases con sufijo `-movil`. `scripts/ci/check-escala-movil.sh` falla nombrando archivo y línea.

**Y esta fase es la primera que tiene campos de texto**, que es exactamente para lo que se fijó esa escala: iOS Safari hace zoom automático al enfocar un `<input>` con `font-size` menor a 16px. El campo del reporte (§9) y el del monto usan `text-body-movil`, que son 16px justos.

### 3.1 Reglas ligadas

- **`tabular-nums` obligatorio** en: la hora límite, el número de huéspedes, el contador de progreso del checklist (`4 de 7`), el contador del wizard (`Cuarto 2 de 5`) y el campo de monto.
- **El monto se escribe con teclado numérico** (`inputMode="decimal"`), nunca con el teclado completo.
- Ninguna copia de esta fase usa peso 500.

---

## 4. Color

### 4.1 Esta fase no añade ningún token de color. Cero.

| Necesidad | Token existente |
|---|---|
| Aseo terminado, cuarto completo, foto subida | `--status-ok` #15803D · `--surface-ok` #ECFDF3 |
| Cuarto saltado, aseo sin evidencia completa | `--status-warn` #B45309 · `--surface-warn` #FFF8EB |
| Aseo pendiente, tarea sin hacer | `--status-idle` #475569 |
| Aseo en curso | `--primary` |
| Fallo al subir una foto, error de RPC | `--destructive` #9F1239 · `--surface-destructive` #FEF2F3 |

### 4.2 La regla dura: saltar un cuarto NO es rojo

`--destructive` está reservado, desde `02-UI-SPEC` §4.6, a acciones que **revocan o borran**. Saltar un cuarto no es ninguna de las dos: es una situación de campo que el sistema decidió permitir (D-06).

Va en `--status-warn`. Rojo trataría a la aseadora como si hubiera hecho algo malo, y lo que hizo fue reportar honestamente que no pudo.

**Lo único de esta fase que sí es rojo:** el fallo al subir una foto y el error de un RPC. Son fallas del sistema, no de la persona.

### 4.2b La proporción 60/30/10, reafirmada y no solo heredada

`02-UI-SPEC` §4.1 la fijó para toda la app. Se reafirma aquí porque esta fase estrena pantallas
completas y conviene que el executor la tenga delante:

| Proporción | Qué la ocupa en este árbol |
|---|---|
| **60% dominante** | `--canvas` del layout del aseador: el fondo sobre el que flotan las tarjetas |
| **30% secundario** | `--background` de las `Card`: tarjetas del home, ficha del aseo, cajas del wizard |
| **10% acento** | `--primary`, y **solo** en los nueve usos de la lista cerrada de §4.3 |

El color de estado (`--status-ok`, `--status-warn`, `--status-idle`) **no entra en el 10%**: es
semántico, no decorativo, y va siempre acompañado de icono y etiqueta.

### 4.3 Ampliación de la lista cerrada del acento

`02-UI-SPEC` §4.4 fija cinco usos de `--primary`; la Fase 4 añadió el sexto y la Fase 5 el séptimo. Esta fase añade el octavo y el noveno:

8. **Barra de progreso del checklist** (§6.1). Mismo caso que los usos anteriores: avance de una tarea larga.
9. **Estado `en_curso` de la tarjeta de aseo** (§5.2). Es el único estado que significa "esto está pasando ahora", y es el que la aseadora busca al abrir la app.

Sigue prohibido `--primary` como tinte de fila, en badges de estado que no sean `en_curso`, y en iconos decorativos.

---

## 4.4 Jerarquía visual: qué ancla cada pantalla

Declarado explícitamente para que el executor no lo adivine. **Un solo ancla por pantalla**, y en las
cuatro es lo mismo: *lo que la aseadora tiene que hacer ahora*.

| Pantalla | Ancla visual primaria | Qué la hace ganar | Segundo nivel |
|---|---|---|---|
| `/mis-aseos` | **La tarjeta del aseo que está `en_curso`**, o la primera de la lista si ninguno lo está | Va arriba, es el único badge en `--primary`, y la tarjeta entera es tocable | El resto de tarjetas, en `--status-idle` |
| Hoja de dos opciones | **`Comenzar aseo`** | Único relleno primario, 56px, ancho completo. `Reportar que no puedo` es `ghost` y va debajo, sin borde | El nombre del apartamento |
| `/aseos/[id]` | **El cuarto abierto del acordeón** | Es lo único expandido; los demás son líneas de 56px | La barra fija, que es un ancla **persistente** y no compite: vive fuera del flujo de lectura |
| Paso del wizard | **La foto o el botón de tomarla**, centrado a 320px | Ocupa el centro óptico de la pantalla y es lo único interactivo del cuerpo | El nombre del cuarto, arriba |
| Paso del reporte | **Las tres opciones de categoría** | Es la única decisión de la pantalla | `Terminar el aseo`, en la barra |

**La regla que se deriva y que el executor tiene que respetar:** en ninguna pantalla de esta fase hay
**dos rellenos primarios a la vez**. Si aparecen dos, uno de los dos está mal y es el que no lleva a
terminar el aseo.

**Iconos sin texto al lado:** los tres que existen (`Hourglass` de la hora límite, `Users` de
huéspedes, `SkipForward` del cuarto saltado) llevan `aria-label`, nunca `aria-hidden`. §12.2.

---

## 5. `/mis-aseos` — el home (D-01, PWA-01)

Deja de ser stub. Es la primera pantalla que la aseadora ve cada día.

### 5.1 Anatomía

```
┌────────────────────────────────────────┐
│ [ banner de avisos, si aplica ]        │  ← Fase 5, §7
│                                        │
│ Mis aseos                              │  ← display-movil 28/600
│ viernes 12 de septiembre               │  ← body-movil --muted-foreground
│                                        │
│ ┌────────────────────────────────────┐ │
│ │ Bogotá 3            ● En curso     │ │  ← tarjeta, §5.2
│ │ Chapinero                          │ │
│ │ ⏱ Antes de las 11:30    👤 4       │ │
│ └────────────────────────────────────┘ │
│ ┌────────────────────────────────────┐ │
│ │ Bogotá 7            ● Pendiente    │ │
│ │ Chapinero                          │ │
│ │ ⏱ Antes de las 14:00    👤 2       │ │
│ └────────────────────────────────────┘ │
└────────────────────────────────────────┘
```

- Lista vertical de tarjetas, `gap-lg` (16px), desplazable. **En plural**: una aseadora puede tener tres aseos el mismo día, y una sola tarjeta escondería los otros dos.
- **Orden:** primero el que está `en_curso`, después por hora límite ascendente. Lo que está pasando ahora va arriba; lo demás, por urgencia real.
- **Solo los de hoy.** Un aseo de mañana no es accionable hoy y llenaría la pantalla. Si hay aseos de mañana, al pie va una línea en `text-micro-movil` `--muted-foreground`: `Mañana tienes {N} aseos.` Sin expansión: es información, no una acción.
- **La tarjeta entera es el destino del toque**, no un botón dentro de ella. Área grande, sin puntería.

### 5.2 La tarjeta

| Elemento | Tratamiento |
|---|---|
| Apartamento | `heading-movil` (20/600) `--foreground` |
| Cluster | `body-movil` `--muted-foreground` |
| Estado | Badge: icono + etiqueta + color, los tres. Nunca color solo |
| Hora límite | `Hourglass` 20px + `Antes de las {HH:mm}` en `body-movil` `tabular-nums` |
| Huéspedes | `Users` 20px + número en `body-movil` `tabular-nums` |

Estados de la tarjeta, derivados de `estadoDeAseo()` que **ya existe** en `lib/domain/cleanings.ts`:

| Estado | Etiqueta | Color |
|---|---|---|
| `pendiente` | `Pendiente` | `--status-idle` |
| `en_curso` | `En curso` | `--primary` (uso 9, §4.3) |
| `completada` | `Terminado` | `--status-ok` |

- `Card` sobre `--background` dentro del `--canvas` del layout. `p-lg`, radio 6px, borde `--border`.
- **La hora límite vencida** lleva la misma señal que el dashboard del admin: `Hourglass` en `--status-warn` y el texto en `--status-warn`. Es el mismo hecho y merece el mismo lenguaje en las dos superficies.
- **Sin animación de entrada.** Solo transiciones de color, 120ms, `ease-out`.

### 5.3 Vacío

> `No tienes aseos hoy.`
> `Cuando te asignen uno, te va a llegar un aviso al teléfono.`

Reemplaza el copy de la Fase 5, que decía que todavía no había nada. Ahora sí hay app.

---

## 6. La hoja de dos opciones (D-02)

Al tocar la tarjeta **no se entra directo al aseo**. Sube un `Sheet` desde abajo con dos opciones.

```
┌────────────────────────────────────────┐
│                ────                    │  ← asa
│ Bogotá 3                               │  ← heading-movil
│ Antes de las 11:30                     │  ← body-movil --muted-foreground
│                                        │
│ ┌────────────────────────────────────┐ │
│ │         Comenzar aseo              │ │  ← 56px, primario, ancho completo
│ └────────────────────────────────────┘ │
│                                        │
│         Reportar que no puedo          │  ← 44px, ghost, --muted-foreground
└────────────────────────────────────────┘
```

- **La razón de que esto sea el segundo paso y no un botón dentro del aseo**, y va escrita porque es la tentación evidente: el aseador sabe que no puede **antes** de empezar, no a mitad. Enterrarlo dentro del checklist lo obliga a entrar y salir.
- `Comenzar aseo` marca el aseo `en_curso` y navega a `/aseos/[id]`.
- Si el aseo **ya está `en_curso`**, la opción principal dice `Seguir con el aseo` y la secundaria desaparece: ya empezó, ya no aplica devolverlo.
- El `Sheet` se cierra deslizando hacia abajo o tocando fuera. Sin botón de cerrar: dos salidas ya existen.

### 6.1 `Reportar que no puedo`

Segunda hoja, con motivo obligatorio de **lista cerrada** más campo libre opcional:

| Motivo |
|---|
| `Estoy enferma o enfermo` |
| `No alcanzo a llegar` |
| `El apartamento no está disponible` |
| `Otro` |

- `RadioGroup`, cada opción con área de toque de 44px.
- Campo libre `Textarea` opcional debajo, con `placeholder`: `Cuéntale al administrador qué pasó (opcional)`. Si el motivo es `Otro`, **pasa a obligatorio**: un "otro" sin explicación no le sirve a nadie.
- Acción: `Devolver el aseo`, 56px, **`variant="outline"` y no destructivo**. Devolver no borra nada: el aseo vuelve a Pendiente y el admin lo reasigna.
- Confirmación por toast: `Listo. El administrador ya lo sabe.`
- **Sin `AlertDialog` de confirmación.** La hoja con motivo obligatorio ya es la confirmación; un diálogo encima sería un tercer paso.

---

## 7. `/aseos/[id]` — el aseo en curso (CHECK-01 a CHECK-04)

La pantalla existe desde la Fase 5 como solo lectura. Esta fase la amplía: conserva la ficha y el código de acceso, y le añade el checklist.

### 7.1 Anatomía

```
┌────────────────────────────────────────┐
│ Bogotá 3                  ● En curso   │  ← ficha, Fase 5 §9.2
│ Chapinero                              │
│ Hora límite        11:30               │
│ Huéspedes          4                   │
│ Instrucciones                          │
│ Dejar el aire encendido.               │
│ ┌────────────────────────────────────┐ │
│ │     Ver el código de acceso        │ │  ← Fase 5 §9.3, INTACTO
│ └────────────────────────────────────┘ │
├────────────────────────────────────────┤
│ Checklist                4 de 12       │  ← heading-movil + tabular-nums
│ ████████░░░░░░░░░░░░░░                 │  ← Progress 4px --primary (uso 8)
│                                        │
│ ▸ ✓ Cocina                      3/3    │  ← cumplido, colapsado
│ ▾   Baño principal              1/4    │  ← abierto
│      ☑ Lavar el sanitario              │
│      ☐ Limpiar el espejo               │
│      ☐ Cambiar las toallas             │
│      ☐ Trapear el piso                 │
│ ▸   Sala                        0/3    │
│ ▸   Cuarto 1                    0/2    │
├────────────────────────────────────────┤
│ ┌────────────────────────────────────┐ │
│ │           Terminar aseo            │ │  ← BARRA FIJA, 56px
│ └────────────────────────────────────┘ │
└────────────────────────────────────────┘
```

### 7.2 El acordeón (D-03)

- **Un cuarto por fila.** Cabecera de `--spacing-cabecera-cuarto` (56px): chevron, nombre del cuarto en `heading-movil`, y el contador `{hechas}/{total}` a la derecha en `micro-movil` `tabular-nums`.
- **Se puede abrir más de uno a la vez.** Es una lista de trabajo, no un formulario por pasos: la aseadora puede estar entre el baño y el cuarto.
- **Un cuarto completo colapsa solo** y su cabecera gana `CircleCheck` 20px en `--status-ok`. No desaparece: verlo en verde es la recompensa.
- **Ningún cuarto está bloqueado.** Se pueden hacer en cualquier orden, que es toda la razón de D-03.
- **Los cuartos son los de ese apartamento** (`property_rooms`), nunca un catálogo fijo. Es el criterio 2 del ROADMAP.
- El estado del acordeón **no se persiste**: cada entrada abre el primer cuarto incompleto.

### 7.3 La tarea

- Fila de `--spacing-fila-tarea` (48px), casilla a la izquierda con área de toque de 44px, texto en `body-movil`.
- **Toda la fila es el destino del toque**, no solo la casilla.
- Marcada: casilla llena en `--status-ok` y el texto en `--muted-foreground`, **sin tachado**. El tachado sugiere "esto ya no aplica"; lo que pasó es que se hizo.
- Cambio de estado con transición de color de 120ms. **Sin animación de layout.**
- **Se puede desmarcar.** La gente se equivoca de fila con guantes, y bloquear el desmarcado obliga a terminar mal el aseo.

### 7.4 La barra fija (D-04)

- `fixed` al fondo del viewport, ancho completo, alto `--spacing-barra-aseo` (72px), fondo `--background`, borde superior `--border`.
- Dentro, un solo botón de 56px a ancho completo: `Terminar aseo`.
- El contenido de la página reserva ese alto como padding inferior, para que la última tarea no quede debajo.
- **El botón nunca se deshabilita**, ni siquiera con el checklist a medias. Si faltan tareas, al tocarlo aparece una confirmación (§8.1). Un botón muerto no explica nada; una pregunta sí.
- `safe-area-inset-bottom` respetado: en iPhone con barra de gestos, un botón pegado al borde es un botón que abre el selector de apps.

---

## 8. El wizard de evidencia (D-05, PWA-04 a PWA-07)

Se abre **al tocar `Terminar aseo`**, no antes. Es lo que D-05 fija y lo que separa esta fase del diseño original.

### 8.1 Antes de entrar: el checklist incompleto

Si quedan tareas sin marcar, una hoja corta:

> `Te faltan {N} tareas por marcar.`
> `Puedes terminar igual, pero el administrador va a ver cuáles quedaron pendientes.`
>
> Primaria 56px: `Terminar de todos modos`
> Secundaria 44px ghost: `Volver al checklist`

Mismo criterio que D-06: **no se bloquea, se marca.** Una aseadora atrapada en una pantalla que no la deja salir llama por teléfono, y eso es exactamente lo que el producto quiere eliminar.

### 8.2 Anatomía del paso

```
┌────────────────────────────────────────┐
│ ✕                        Cuarto 2 de 5 │  ← salir + contador tabular-nums
│ ████████░░░░░░░░░░░░                   │  ← Progress 4px
│                                        │
│ Baño principal                         │  ← display-movil 28/600
│ Toma una foto de cómo quedó.           │  ← body-movil
│                                        │
│      ┌──────────────────────────┐      │
│      │                          │      │
│      │      [ 📷  Tomar foto ]  │      │  ← --container-foto 320px
│      │                          │      │
│      └──────────────────────────┘      │
│                                        │
├────────────────────────────────────────┤
│ ┌────────────────────────────────────┐ │
│ │            Siguiente               │ │  ← 56px, deshabilitado sin foto
│ └────────────────────────────────────┘ │
│          Saltar este cuarto            │  ← 44px, ghost
└────────────────────────────────────────┘
```

- **Un cuarto por pantalla**, en el orden del acordeón. Aquí sí es wizard, y aquí sí tiene sentido: es una secuencia corta con un solo tipo de acción.
- La `✕` de arriba a la izquierda sale del wizard y vuelve al checklist **sin perder las fotos ya tomadas**.
- `Siguiente` está deshabilitado hasta que haya foto. La salida cuando no la hay es `Saltar este cuarto`, que es explícita y deja rastro (§8.4).
- En el último cuarto el botón dice `Continuar`, no `Siguiente`, y lleva al reporte (§9).

### 8.3 La foto (PWA-05, PWA-06)

- **Se usa la cámara nativa** (`<input type="file" accept="image/*" capture="environment">`). No se embebe una cámara propia: la nativa tiene enfoque, estabilización y la persona ya sabe usarla.
- **Una foto por cuarto**, no una ráfaga. Es una restricción de producto de `PROJECT.md`: el presupuesto de Storage se calcula sobre ~6 fotos por aseo.
- Tras tomarla: previsualización a `--container-foto` (320px), con dos acciones debajo, de 44px y separadas 8px: `Repetir` (ghost) y la primaria `Siguiente` que se habilita.
- **Mientras sube:** la previsualización se queda visible con una barra de progreso encima y el botón en `Subiendo…` deshabilitado. **Nunca una pantalla en blanco con spinner**: la aseadora tiene que ver su foto mientras espera.
- **Si la subida falla:** `Alert` destructivo debajo de la foto con `No se pudo subir la foto.` / `Revisa la señal y vuelve a intentar.` más un botón `Reintentar`. La foto **no se pierde**: sigue en pantalla.
- La compresión (a ~200 KB, lado largo 1280px, sin EXIF salvo orientación) es invisible para la aseadora. **No se le muestra ningún indicador de compresión**: es trabajo del sistema, no información útil para quien está de pie frente a un baño.

### 8.4 Saltar un cuarto (D-06)

`Saltar este cuarto` abre una hoja con **motivo obligatorio de lista cerrada**:

| Motivo |
|---|
| `El huésped dejó cosas adentro` |
| `El cuarto estaba cerrado` |
| `No había luz` |
| `Otro` |

- `RadioGroup`, 44px por opción, más `Textarea` opcional. Con `Otro`, el texto pasa a obligatorio.
- **Se descartó exigir un mínimo de 30 palabras**, que fue la primera propuesta. La razón es de comportamiento, no técnica: un contador de palabras se burla solo (la gente escribe relleno) y castiga a quien tiene una razón legítima pero corta, como *"el cuarto estaba cerrado"*. Una lista cerrada, además, **se puede contar**: el admin ve cuántas veces pasa cada motivo.
- Acción: `Saltar`, 56px, **`variant="outline"`**. **Cero rojo** (§4.2).
- Al volver, el paso queda marcado con `SkipForward` 20px en `--status-warn` y la etiqueta del motivo elegido, y el wizard avanza.

### 8.5 Lo que el admin ve

Un aseo con al menos un cuarto saltado queda marcado **sin evidencia completa**, y eso aparece en el dashboard del admin:

- En la fila del aseo, una cuarta señal inline: `ImageOff` 14px en `--status-warn`, con `aria-label="Sin evidencia completa"`.
- Al abrir el aseo, la lista de cuartos saltados con su motivo.

**No se añade un tipo de alerta nuevo al panel** (`04-UI-SPEC` §11.1 cerró los siete y la Fase 5 ya defendió no tocarlos). Es un estado del aseo, no un evento fechado.

---

## 9. El reporte (D-07, REPORT-01 a REPORT-03)

Último paso del wizard, y **es opcional**. La aseadora puede terminar sin reportar nada.

```
┌────────────────────────────────────────┐
│ ✕                          Último paso │
│                                        │
│ ¿Pasó algo?                            │  ← display-movil
│ Si no pasó nada, puedes terminar.      │  ← body-movil --muted-foreground
│                                        │
│  ○ Se dañó algo                        │  ← RadioGroup, 44px
│  ○ Tuve que comprar algo               │
│  ○ Faltaba algo                        │
│                                        │
│  [ al elegir, aparece el detalle ]     │
├────────────────────────────────────────┤
│ ┌────────────────────────────────────┐ │
│ │          Terminar el aseo          │ │  ← 56px, primario
│ └────────────────────────────────────┘ │
└────────────────────────────────────────┘
```

### 9.1 Las tres categorías

El campo es libre, pero **clasificado**: la aseadora escribe lo que pasó y elige a cuál de las tres pertenece. El copy usa lenguaje de campo, no de base de datos.

| Opción en pantalla | Qué es por dentro | Qué pide además |
|---|---|---|
| `Se dañó algo` | daño | Descripción (obligatoria) + **foto** (obligatoria) |
| `Tuve que comprar algo` | gasto | Descripción + **monto** + foto del recibo |
| `Faltaba algo` | faltante | Descripción |

- **El monto es obligatorio en el gasto, y no es un detalle de formulario.** Sin monto, el cierre mensual de la Fase 7 no puede sumar lo que se gastó y el admin tendría que digitarlo a mano leyendo un texto.
- **El monto se escribe con teclado numérico** y se muestra formateado con separador de miles mientras se escribe.
- Se puede reportar **más de una cosa**: tras guardar la primera, aparece `Reportar algo más` en ghost de 44px, y lo ya reportado queda listado arriba con su categoría.
- **Sin reporte, `Terminar el aseo` sigue habilitado.** Es opcional de verdad.

### 9.2 Regla de moneda, que viene de `PROJECT.md`

El monto se guarda **en la unidad mínima de la moneda, más una columna de moneda**. Es una de las tres reglas del camino a v2 del 2026-09-12, y esta fase es donde entra el primer campo de dinero escrito por un usuario final. Hacerlo ahora cuesta una columna; hacerlo después de la Fase 7 cuesta una migración con histórico financiero vivo.

En pantalla, la aseadora ve pesos normales. La unidad mínima es cosa del sistema.

---

## 10. El cierre

Al tocar `Terminar el aseo`:

> `Listo.` (display-movil)
> `Terminaste el aseo de {apartamento}.` (body-movil)
>
> Si quedaron cuartos saltados, encima en `micro-movil` `--status-warn`:
> `Quedaron {N} cuartos sin foto. Tu administrador los va a ver.`
>
> Primaria 56px: `Volver a mis aseos`

Vuelve al home, donde la tarjeta ya aparece como `Terminado`.

**Sin confeti, sin animación de celebración.** El movimiento permitido en este proyecto es color, fondo, borde y opacidad, 120ms.

---

## 11. Estados vacíos, de carga y de error

### 11.1 Vacíos

| Superficie | Copy |
|---|---|
| `/mis-aseos` sin aseos hoy | `No tienes aseos hoy.` / `Cuando te asignen uno, te va a llegar un aviso al teléfono.` |
| Apartamento sin cuartos configurados | `Este apartamento todavía no tiene cuartos configurados.` / `Avísale a tu administrador.` El checklist no se renderiza y `Terminar aseo` queda disponible igual |
| Aseo sin instrucciones | La sección no se renderiza |

### 11.2 Carga

- `/mis-aseos` y `/aseos/[id]` son componentes de servidor: la carga inicial la resuelve el servidor. Los `loading.tsx` son esqueletos **con la forma exacta** de lo que va a aparecer: tres tarjetas para el home, ficha más lista de cuartos para el aseo.
- **Prohibido el spinner centrado a pantalla completa.**
- Marcar una tarea del checklist es **optimista**: la casilla cambia al instante y se revierte con un toast si el servidor falla. Esperar medio segundo por casilla, doce veces, hace la pantalla inusable.

### 11.3 Errores

| Situación | Copy |
|---|---|
| Falla marcar una tarea | Toast: `No se pudo guardar. Vuelve a tocarlo.` La casilla vuelve a su estado anterior |
| Falla subir la foto | §8.3, con la foto conservada y `Reintentar` |
| Falla terminar el aseo | `Alert` destructivo sobre la barra fija: `No se pudo terminar el aseo.` / `Revisa la señal y vuelve a intentar.` **Nada de lo hecho se pierde** |
| Falla devolver el aseo | Toast destructivo con el mensaje de `mapDbError()`, que en `P0001` lee el `hint` |
| El aseo ya no es tuyo (reasignado mientras trabajabas) | `Este aseo ya no está asignado a ti.` / `Habla con tu administrador.` más `Volver a mis aseos` |

**Regla heredada:** un error dice **qué pasó** y **qué hacer**. Sin `¡Ups!`, sin `Algo salió mal`, sin disculpas, sin signos de admiración.

### 11.4 Lo que NO se muestra, porque no existe

**Ninguna pantalla de esta fase muestra contador de acciones pendientes, estado de cola ni indicador de sincronización.** El modo offline está diferido (D-08). Una interfaz que sugiere que el trabajo se guardó localmente cuando no es cierto es peor que no tener offline: la aseadora cerraría la app confiada.

**Lo que sí se hace, y es la contrapartida honesta:** cada acción confirma que se guardó **en el servidor**, no "en el dispositivo". Y si falla, lo dice de inmediato y conserva lo que se pueda.

---

## 12. Accesibilidad

Hereda `02-UI-SPEC` §13, `04-UI-SPEC` §16 y `05-UI-SPEC` §16. Lo que esta fase añade:

### 12.1 Toque
- **44px es el piso de todo control**, sin excepción: casillas, cabeceras de cuarto, botones del wizard, opciones de motivo.
- **56px** para la acción principal de la barra fija y de cada paso del wizard.
- **Separación mínima de 8px** entre dos controles adyacentes.
- `safe-area-inset-bottom` en la barra fija.

### 12.2 Semántica
- El acordeón usa `aria-expanded` y `aria-controls`. El contador de cada cuarto se anuncia como parte del nombre accesible: `Baño principal, 1 de 4 tareas`.
- Las tareas son `<input type="checkbox">` reales con `<label>` asociada, nunca `<div>` con `onClick`.
- El wizard anuncia cada paso con `aria-live="polite"`: `Cuarto 2 de 5, Baño principal`.
- La `Progress` del checklist y la del wizard llevan `aria-valuenow`, `aria-valuemin`, `aria-valuemax` y `aria-label`.
- Los iconos que acompañan texto llevan `aria-hidden="true"`. Los que van solos llevan `aria-label`.
- La foto tomada tiene `alt` descriptivo: `Foto de {nombre del cuarto}`.
- Tamaño de icono estándar en este árbol: **20px**, `strokeWidth` 2.

### 12.3 Movimiento
Heredado sin cambios: solo `color`, `background-color`, `border-color` y `opacity`, 120ms, `ease-out`. Sin animaciones de layout, sin `transition: all`.
- **El colapso del acordeón no se anima**: cambia la altura, que es layout.
- El indicador de subida de la foto sigue girando con `prefers-reduced-motion: reduce`: es información de estado, no decoración. Excepción ya declarada desde la Fase 2.

---

## 13. Inventario de componentes

### 13.1 shadcn oficial

**Se instalan dos:** `accordion` y `radio-group`. Ver §1.1 y la advertencia de ancho de §2.4.

Ya instaladas y usadas por esta fase: `card` · `button` · `checkbox` · `alert` · `badge` · `progress` · `separator` · `sheet` · `textarea` · `input` · `label` · `sonner` · `skeleton`.

Sigue prohibido crear un átomo que solo re-exporte un componente de shadcn.

### 13.2 Organismos nuevos

`app/(cleaner)/_components/`:

| Componente | Responsabilidad | REQ |
|---|---|---|
| `ListaDeAseos` | El home: tarjetas ordenadas, vacío, línea de mañana | PWA-01 |
| `TarjetaDeAseoHome` | Una tarjeta con su estado, hora límite y huéspedes | PWA-01 |
| `HojaDeAseo` | Las dos opciones al tocar la tarjeta | D-02 |
| `HojaNoPuedo` | Motivo de lista cerrada + texto, y devolver | REPORT-03 |
| `ChecklistPorCuarto` | El acordeón completo, con progreso | CHECK-01, CHECK-02 |
| `CuartoAcordeon` | Un cuarto: cabecera, contador, tareas | CHECK-02 |
| `FilaDeTarea` | Una tarea con su casilla de 44px y su marcado optimista | CHECK-02 |
| `BarraAccionAseo` | La barra fija inferior | D-04 |
| `WizardEvidencia` | Los pasos, el progreso, el orden | PWA-04 |
| `PasoDeFoto` | Cámara nativa, previsualización, subida, error | PWA-05, PWA-06 |
| `HojaSaltarCuarto` | Motivo de lista cerrada del skip | D-06 |
| `PasoDeReporte` | Las tres categorías, el monto, varios reportes | REPORT-01, REPORT-02 |
| `CierreDeAseo` | La pantalla final con el aviso de cuartos saltados | — |

`app/(admin)/operacion/_components/`:

| Componente | Responsabilidad |
|---|---|
| `SenalSinEvidencia` | La cuarta señal inline de la fila de aseo (§8.5) |

### 13.3 Componentes que se modifican

| Componente | Cambio |
|---|---|
| `app/(cleaner)/mis-aseos/page.tsx` | Deja de ser stub: monta `ListaDeAseos` |
| `app/(cleaner)/aseos/[id]/page.tsx` | Añade el checklist y la barra fija bajo la ficha existente |
| `app/(cleaner)/_components/TarjetaAseo.tsx` | Conserva su ficha; deja de ser el único contenido de la pantalla |
| `app/(admin)/operacion/_components/FilaAseo.tsx` | Cuarta señal inline: sin evidencia completa |
| `app/globals.css` | Los tokens de §2.1 |
| `lib/utils.ts` (`cn()`) | **`max-w-foto` y `max-w-motivo` al grupo `max-w`** |

> ⚠️ La última fila **no es opcional**. Es el defecto que costó dos quicks.

### 13.4 Lógica de dominio, fuera de los componentes y con tests

| Módulo | Contenido |
|---|---|
| `lib/domain/checklist.ts` | Armado del checklist desde `property_rooms` y `checklist_tasks`, progreso por cuarto y total, y si el aseo quedó sin evidencia completa |
| `lib/domain/reporte.schema.ts` | Zod de las tres categorías, con el monto obligatorio y positivo solo en gasto |
| `lib/domain/motivos.ts` | Las dos listas cerradas de motivos (skip y no-puedo), con sus etiquetas |

### 13.5 Iconos lucide — lista cerrada

**Nuevos en esta fase (6):**
`Camera` · `ImageOff` · `SkipForward` · `Users` · `RotateCcw` · `CircleDollarSign`

**Reusados de las listas cerradas de fases anteriores:**
`CircleCheck` · `TriangleAlert` · `Hourglass` · `ChevronDown` · `ChevronRight` · `Loader2` · `X` · `KeyRound` · `Check`

Añadir un icono fuera de estas listas es una modificación de este contrato.

> **Verificación obligatoria antes de escribir código:** confirmar los seis nombres nuevos contra `lucide-react@1.39.0`. El de mayor riesgo es `CircleDollarSign`; alternativa equivalente si no existe: `DollarSign`.

---

## 14. Contrato de copywriting

Español de Colombia, trato de "tú", imperativo. **Prohibido el voseo.** Sin signos de admiración, sin `¡Ups!`, sin `Algo salió mal`, sin disculpas.

Regla heredada de la Fase 5 y vigente: **el copy del árbol del aseador se escribe para leerse de pie, con una mano, sin contexto previo.** Frases cortas, verbo primero, cero jerga técnica. Prohibido decir `PWA`, `service worker`, `suscripción`, `push`, `sincronizar`, `cola`, `offline` o `subir al servidor` en cualquier texto que vea un aseador.

### 14.1 Elementos

| Elemento | Copy |
|---|---|
| Título del home | `Mis aseos` |
| Vacío del home | `No tienes aseos hoy.` / `Cuando te asignen uno, te va a llegar un aviso al teléfono.` |
| Línea de mañana | `Mañana tienes {N} aseos.` |
| Hora límite en la tarjeta | `Antes de las {HH:mm}` |
| **CTA de la hoja de aseo** | `Comenzar aseo` |
| CTA si ya empezó | `Seguir con el aseo` |
| CTA secundaria de la hoja | `Reportar que no puedo` |
| Título de la hoja de no puedo | `¿Qué pasó?` |
| CTA de no puedo | `Devolver el aseo` |
| Éxito al devolver | `Listo. El administrador ya lo sabe.` |
| Encabezado del checklist | `Checklist` · `{hechas} de {total}` |
| **CTA de la barra fija** | `Terminar aseo` |
| Checklist incompleto | `Te faltan {N} tareas por marcar.` / `Puedes terminar igual, pero el administrador va a ver cuáles quedaron pendientes.` |
| CTA de seguir igual | `Terminar de todos modos` |
| CTA de volver | `Volver al checklist` |
| Encabezado del paso de foto | `Toma una foto de cómo quedó.` |
| CTA de tomar foto | `Tomar foto` |
| CTA de repetir | `Repetir` |
| CTA de avanzar | `Siguiente` · en el último cuarto: `Continuar` |
| CTA de saltar | `Saltar este cuarto` |
| Título de la hoja de saltar | `¿Por qué no pudiste?` |
| CTA de saltar | `Saltar` |
| Contador del wizard | `Cuarto {n} de {total}` |
| Subiendo | `Subiendo…` |
| Error de foto | `No se pudo subir la foto.` / `Revisa la señal y vuelve a intentar.` |
| Título del reporte | `¿Pasó algo?` |
| Apoyo del reporte | `Si no pasó nada, puedes terminar.` |
| Opción de daño | `Se dañó algo` |
| Opción de gasto | `Tuve que comprar algo` |
| Opción de faltante | `Faltaba algo` |
| Etiqueta del monto | `¿Cuánto costó?` |
| CTA de reportar más | `Reportar algo más` |
| **CTA final** | `Terminar el aseo` |
| Cierre | `Listo.` / `Terminaste el aseo de {apartamento}.` |
| Aviso de cuartos saltados | `Quedaron {N} cuartos sin foto. Tu administrador los va a ver.` |
| CTA del cierre | `Volver a mis aseos` |
| Error al marcar tarea | `No se pudo guardar. Vuelve a tocarlo.` |
| Error al terminar | `No se pudo terminar el aseo.` / `Revisa la señal y vuelve a intentar.` |
| Aseo reasignado | `Este aseo ya no está asignado a ti.` / `Habla con tu administrador.` |
| Sin cuartos configurados | `Este apartamento todavía no tiene cuartos configurados.` / `Avísale a tu administrador.` |

### 14.2 Acciones destructivas

**Esta fase no tiene ninguna.** Ni borra, ni revoca, ni cancela nada que el usuario haya creado.

Los dos casos que se le podrían parecer, y por qué no lo son:

| Caso | Por qué no es destructivo |
|---|---|
| `Devolver el aseo` (no puedo) | El aseo no se borra: vuelve a Pendiente y el admin lo reasigna. Es lo contrario de destruir trabajo, es evitar que se pierda |
| `Saltar este cuarto` | No borra evidencia: registra que no la hubo, con motivo. Es un acto de honestidad, y el color se lo dice (§4.2) |

Por lo tanto: **cero `AlertDialog` en esta fase.** Si aparece uno en ejecución, algo se salió del contrato.

---

## 15. Registry Safety

| Registry | Bloques usados | Safety Gate |
|---|---|---|
| shadcn oficial (`@shadcn`) | `accordion`, `radio-group` | Registry oficial, no requiere vetting de terceros |
| Terceros | **ninguno** | no aplica — `components.json` tiene `"registries": {}` |

**No se declara ningún registry de terceros**, así que la compuerta de vetting no se ejecuta.

Las dos primitivas oficiales sí pasan por la compuerta de **ancho** de §2.4, que es la que este repo tiene medida: nacen con clases de ancho con nombre de talla y hay que sustituirlas antes de commitear. `npm run ci:arch` lo atrapa.

---

## 16. Deuda declarada de este contrato

1. **Sin modo offline** (D-08). Es la deuda dominante de la fase. Si se cae la señal a mitad del aseo, se pierde lo que no alcanzó a guardarse, y las fotos son justo lo que falla con mala señal. Registrada en `.planning/BACKLOG.md` con su detonante.
2. **Sin modo oscuro**, heredado. La aseadora abre la app a las 6 de la mañana con el sistema en oscuro y recibe una pantalla blanca. Esta fase vive entera en ese árbol, así que duele más que antes.
3. **Una sola foto por cuarto.** Es restricción de presupuesto de Storage, no de diseño. Un daño que necesita tres ángulos no cabe, y la salida es reportarlo aparte (§9), que sí lleva su propia foto.
4. **El monto del gasto no valida contra el recibo.** La aseadora escribe la cifra y adjunta la foto; nadie compara. Es confianza deliberada, y la foto existe para que el admin pueda auditar si le cuadra raro.
5. **El progreso del checklist no se guarda como borrador local.** Sin offline, cada marcado va al servidor. Con mala señal, marcar doce tareas es doce oportunidades de fallar.
6. **`Otro` como motivo se va a llevar la mayoría.** Las listas cerradas de §6.1 y §8.4 salen de la conversación con el desarrollador, no de campo. Hay que revisarlas después del piloto con los datos reales: si `Otro` supera el 40%, la lista está mal hecha.
7. **El coral sigue siendo placeholder** y `--primary` / `--destructive` siguen siendo los dos rojos. Heredado de `02-UI-SPEC` §17.

---

## Checker Sign-Off

- [x] Dimensión 1 Copywriting: **PASS**
- [x] Dimensión 2 Visuals: **PASS**
- [x] Dimensión 3 Color: **PASS**
- [x] Dimensión 4 Typography: **PASS**
- [x] Dimensión 5 Spacing: **PASS**
- [x] Dimensión 6 Registry Safety: **PASS**

**Aprobación:** APPROVED — 2026-09-12, 6/6 dimensiones, cero BLOCK.

### Lo que el checker encontró y se corrigió antes de aprobar

No fue una pasada limpia. Dos dimensiones salieron con hueco y se arreglaron:

1. **Dimensión 2 (Visuals) — FLAG:** el contrato no declaraba **punto focal** en ninguna pantalla.
   El executor habría tenido que adivinar la jerarquía visual. Se añadió **§4.4**, con el ancla
   primaria de las cinco pantallas y la regla derivada: **nunca dos rellenos primarios a la vez**.
2. **Dimensión 3 (Color) — FLAG:** la proporción 60/30/10 se daba por heredada sin reafirmarla,
   que es el mismo FLAG que aceptó el checker de la Fase 5. Aquí se cerró en vez de aceptarse: se
   añadió **§4.2b** con qué ocupa cada proporción en este árbol, y la aclaración de que el color de
   estado **no consume** el 10% de acento.

También se corrigió una referencia cruzada rota (§0 apuntaba a §15.4 en vez de §11.4).

### Verificaciones que sí pasaron a la primera

- **Tipografía exacta:** 4 tamaños (28 / 20 / 16 / 14) y 2 pesos (400 / 600). Es el límite duro y
  está justo en él, heredando la escala móvil que la Fase 5 fijó por el zoom automático de iOS.
- **Espaciado:** todos los tokens nuevos son múltiplos de 4 (72, 64, 56, 48, 320). Los que salen del
  set estándar llevan su justificación al lado, que es lo que el criterio exige.
- **Acento acotado:** la lista cerrada pasa de siete usos a nueve, cada uno nombrado, y se declara
  qué sigue prohibido.
- **Copy:** cero CTA genérica. Vacíos y errores con qué pasó y qué hacer en todos los casos.
- **Registry:** cero terceros, así que la compuerta de vetting no aplica.

### Recomendaciones no bloqueantes (FLAG), aceptadas

- **Cuatro CTAs de una sola palabra sin sustantivo:** `Siguiente`, `Continuar`, `Repetir` y `Saltar`.
  Riesgo bajo: las cuatro viven dentro de un wizard o de una hoja cuyo título ya da el objeto
  (`¿Por qué no pudiste?`), y alargarlas ocuparía ancho en una pantalla de 360px. Es el mismo FLAG
  que la Fase 5 aceptó para `Activar` y `Copiar`.
- **La deuda declarada §16.1 (sin offline) es la más grande que este contrato ha aceptado.** No es un
  defecto del contrato —la decisión es del desarrollador y está registrada en `BACKLOG.md`— pero el
  checker deja constancia de que §11.4 es la mitigación entera: la interfaz **no puede** sugerir que
  guarda en el dispositivo.
