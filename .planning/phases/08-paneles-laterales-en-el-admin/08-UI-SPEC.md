---
phase: 8
slug: paneles-laterales-en-el-admin
status: draft
shadcn_initialized: true
preset: none (`components.json` ya existe, `style: base-nova`, `registries: {}`)
created: 2026-09-15
---

# Fase 8 — Contrato de diseño de UI

> Contrato visual y de interacción. Lo consumen `gsd-planner` y `gsd-executor`.
> Idioma de la interfaz: **español de Colombia, trato de "tú"**. Código, tokens, rutas y REQ-IDs quedan como están.

**REQ-IDs cubiertos:** ninguno nuevo. Esta fase cambia la forma de consultar lo ya entregado, y el detalle de aseo es lectura nueva sobre datos existentes.

**Este documento hereda `02-UI-SPEC.md`, `04-UI-SPEC.md`, `05-UI-SPEC.md`, `06-UI-SPEC.md` y `07-UI-SPEC.md` completos.** Paleta, escala de espaciado, tipografía, movimiento, accesibilidad y vocabulario siguen vigentes tal cual. Esta fase **no estrena sistema de diseño, ni sección, ni primitiva: estrena una forma de leer**.

**Entradas leídas:** `08-CONTEXT.md` (D8-1 a D8-11, todas cerradas), `.planning/DEFINICION-paneles-admin.md`, `.planning/ROADMAP.md` §Phase 8, `REQUIREMENTS.md`, `CLAUDE.md`, `app/globals.css` entero, `lib/utils.ts`, `components/ui/sheet.tsx`, `SheetDesglosePago.tsx`, `SheetConfirmar.tsx`, `DialogoRecibo.tsx`, `FilaAseo.tsx`, `MenuAseo.tsx`, `CodigoDeAcceso.tsx`, `EstadoVacio.tsx`, `app/(admin)/finanzas/pagos/page.tsx`, `app/(admin)/apartamentos/[id]/calendario/page.tsx`, `app/(admin)/apartamentos/_actions.ts`, `scripts/ci/check-max-w-tallas.sh`, `scripts/ci/check-escala-movil.sh`, `lib/database.types.ts` y los seis puntos de `e2e/` que D8-11 cuenta.

---

## 0. Lo que esta fase renderiza de verdad

| Hecho anclado | Consecuencia de diseño |
|---|---|
| **D8-1, cita literal del dueño: "el drawer debe ser usado en todos los momentos en los cuales necesitemos mostrar información adicional sobre algún tipo de selección"** | Un formulario no es información sobre una selección. Ningún formulario de esta fase entra a un panel, y eso saca de alcance dos pantallas que el ROADMAP daba por movidas. §0.1 |
| **D8-6: el ancho es 480px y no se toca.** `--container-sheet` ya existe | El presupuesto es fijo, así que lo que se ajusta es el contenido. §6.4 lo mide en píxeles en vez de estimarlo |
| **D8-7: sin scroll vertical es el objetivo del contenido, no una restricción técnica** | El cuerpo conserva el `overflow-y-auto` que `SheetDesglosePago` ya usa, como válvula del caso patológico. El contenido se dimensiona para que el caso típico nunca la dispare, y §6.4 dice a partir de qué número se dispara |
| **D8-5: el velo se queda en `bg-black/10` con blur** | `components/ui/sheet.tsx:87` no se toca. Eso deja intactos los dos paneles que ya existen y los del árbol del aseador |
| **D8-8: el panel vive en la dirección, con el patrón de `/finanzas/pagos`** | Página servidor que lee `searchParams` y renderiza el panel. Pero el criterio 3 del ROADMAP pide algo que ese patrón hoy no cumple. §5.2 |
| **D8-9: el detalle de aseo lleva migración** | La tarifa y el margen del aseo están detrás de grants por columna desde la migración 24. El grupo de dinero del panel lo alimenta **una** función definer con guarda de admin. Consecuencia de UI: el panel **no tiene rama de "sin permiso"**. §10.4 |
| **`max-w-<talla>` compila a 4 u 8 píxeles en este repo** (medido, costó dos quicks) | Esta fase declara **un** token de ancho y lo usa como `min-w`, así que la compuerta de registro en `cn()` no se dispara. §2.2 |
| **La cabecera de `sheet.tsx` documenta tres desviaciones y solo una está arreglada en la primitiva** | Todo `SheetContent` de esta fase repite la cadena de variantes exacta, y todo `SheetTitle` lleva `font-semibold`, y todo `SheetHeader` lleva `gap-sm`. No es opcional. §12.1 |
| **El código de acceso vive en una tabla sin ningún grant, alcanzable solo con cliente administrativo** | Un panel es una superficie de consulta que se abre decenas de veces al día, y su dirección es compartible por diseño. El código **no se renderiza al abrir**. §7.3 |
| **La Fase 7 estableció que una foto ausente se explica, nunca se rompe** | Las miniaturas del panel de aseo tienen su propio estado de ausencia, con el mismo icono y el mismo criterio. §10.3 |
| **`revalidatePath` cuelga el navegador en las Server Actions de `(admin)`** (medido, plan 04-14) | La única action de esta fase, la que revela el código, no muta nada y no llama a ninguna revalidación |

---

## 0.1 Conflictos de alcance, resueltos con evidencia medida

`08-CONTEXT.md` dice que las once decisiones están cerradas, y ninguna se reabre acá. Lo que sigue **no contradice ninguna decisión del dueño**: corrige tres premisas del ROADMAP que la medición del código destapó, exactamente igual que D8-3 ya corrigió la cuarta.

D8-3 es el precedente literal: el ROADMAP decía "la ficha de un apartamento pasa a panel", se midió, y resultó que `/apartamentos/[id]` no es una ficha sino un formulario de 724 líneas. El dueño respondió **"debe crearse"**. Las tres de abajo son la misma clase de hallazgo y se resuelven con la misma regla, que es D8-1.

### Conflicto A. El calendario del apartamento tampoco es una ficha: es el formulario de conexión

| | |
|---|---|
| **Qué dice el ROADMAP** | `app/(admin)/apartamentos/[id]/calendario/page.tsx` pasa a panel |
| **Qué es de verdad** | La pantalla de APTO-12: un campo de URL, **siete estados de validación en vivo**, una guía de cuatro pasos con capturas, `maxDuration = 20`, `runtime = 'nodejs'` y un `AbortSignal.timeout` de 10 s. Es una llamada de red asíncrona con siete resultados posibles |
| **Qué dice D8-4** | El panel de calendario muestra **próximo checkout · los checkouts del mes · estado del feed y última sincronización**. Ninguna de esas tres cosas está hoy en esa pantalla |
| **Qué manda** | **D8-1.** Validar un feed contra la red no es "información adicional sobre una selección", igual que editar no lo es. La pantalla de conexión **se queda como página, sin tocar**. El panel de calendario es **contenido de lectura NUEVO** sobre `calendar_reservations`, que ya tiene los datos (`ends_on` es el checkout) |
| **Evidencia de que el dueño no contaba con borrarla** | D8-11 cuenta seis aserciones rotas y ninguna es de `e2e/calendario.spec.ts`. Esa suite entra por `goto('/apartamentos/{id}/calendario')`: si la ruta desapareciera, la suite entera moriría y el conteo de seis sería un error de un orden de magnitud |

### Conflicto B. La ficha de aseadora sí se convierte en panel, y pierde tres bloques

| | |
|---|---|
| **Qué dice el ROADMAP** | `app/(admin)/finanzas/aseadoras/[id]/page.tsx` pasa a panel |
| **Qué es de verdad** | Cuatro bloques: `Ahora mismo`, `Sus aseos del periodo`, `Sus pagos mes a mes`, `Sus gastos reportados` |
| **Qué dice D8-4** | El panel muestra **nombre · activa o no · apartamentos donde es responsable y donde es suplente · aseo en curso · lo que lleva ganado en el periodo abierto**, y explícitamente *"Fuera: el histórico de aseos, que ya está en Finanzas"* |
| **Qué manda** | **D8-4, y el dueño tiene razón en el argumento.** Los tres bloques que se caen son alcanzables sin ellos: sus aseos en `/finanzas/aseos?aseador={id}`, sus gastos en `/finanzas/aseos?aseador={id}&filtro=con-gastos`, sus pagos en `/finanzas/pagos`. **Dos de los cinco datos del panel son nuevos** (responsable de, suplente en) y hoy solo viven en `/aseadores` |
| **Confirmación** | D8-11 lista `e2e/finanzas.spec.ts:589,592`, que son exactamente el clic de la fila del bloque 3 y la aserción de los cuatro bloques. El dueño **sí** contó esta rotura |

### Conflicto C. Tres de los cuatro paneles son superficies nuevas, no mudanzas

La consecuencia de A, de B y de D8-3, junta:

| Panel | Lo que se creía | Lo que es |
|---|---|---|
| Apartamento | mover una ficha | **crear** una ficha de lectura (D8-3, ya reconocido) |
| Calendario | mover una página | **crear** una vista de checkouts. La página de conexión se queda |
| Aseadora | mover una página | **reemplazar** una página de 4 bloques por un panel de 5 datos, 2 de ellos nuevos |
| Aseo | crear, no existe | **crear**, más una migración (D8-9) |

**Lo que esto le dice al planner, y hay que decirlo antes de partir el trabajo:** esta fase **borra una página** (`/finanzas/aseadoras/[id]`) y **no borra ninguna otra**. `/apartamentos/[id]`, `/apartamentos/nuevo` y `/apartamentos/[id]/calendario` se quedan las tres. El trabajo no es mover markup: son cuatro lecturas nuevas, una migración y cuatro paneles.

---

## 1. Design System

Sin cambio de herramienta, sin primitivas nuevas y sin correr el CLI.

| Propiedad | Valor |
|---|---|
| Tool | `shadcn` CLI. `style: base-nova`, `iconLibrary: lucide`, `registries: {}` (verificado en `components.json` el 2026-09-15) |
| Component library | **Base UI** (`@base-ui/react` 1.7.0) |
| Icon library | `lucide-react` **1.39.0** |
| Font | Geist Sans / Geist Mono, más Poppins (`--font-brand`) solo en momentos de marca |
| Estilos | Tailwind v4.3.3, `@theme` en `app/globals.css`. No existe `tailwind.config.js` y no se crea |
| Tema | Solo claro |
| Toasts | `sonner` 2.0.8 |
| Framework | Next 15.5.24, App Router |

### 1.1 Esta fase instala CERO primitivas

Lo que consume, verificado contra `components/ui/`:

`sheet` · `dialog` · `button` · `badge` · `separator` · `skeleton` · `alert` · `tooltip`

**Consecuencia directa:** no entra ninguna clase base con nombre de talla por la vía del CLI, así que la compuerta de §2.2 solo aplica al único token que esta fase declara.

### 1.2 Alternativas descartadas, con la razón

| Descartado | Razón |
|---|---|
| **Instalar `drawer` (Vaul)** | El dueño dice "drawer" y la tentación es instalar el componente que se llama así. `Sheet` **es** el drawer de este proyecto, ya está en el repo, ya tiene su ancho resuelto y ya tiene dos consumidores en producción. Instalar un segundo componente de panel con otro velo, otra animación y otro ancho sería tener dos drawers |
| **Un panel a pantalla completa en móvil** | `(admin)` no tiene vista de celular desde `02-UI-SPEC` §6.3 y esta fase no la inventa. El `Sheet` ya es `w-3/4` por debajo de `sm:`, que es suficiente para un ancho que nadie va a usar |
| **`Tabs` dentro del panel de apartamento** para alternar ficha y calendario | El estado quedaría en el cliente: no enlazable, no sobrevive a un refresco, no se comparte por chat. Y contradiría D8-8 de frente. La alternancia va por `searchParams`. §5.1 |
| **Un segundo `Sheet` apilado** (calendario encima de la ficha) | Dos velos apilados, dos trampas de foco anidadas y una tecla de escape que nadie sabe qué cierra. Es **un solo panel con dos vistas** |
| **`Carousel` o una galería para las fotos del aseo** | D8-4 excluye el checklist tarea por tarea, y recorrer doce fotos de una en una es exactamente eso con otro nombre. Seis miniaturas y un conteo. §10.3 y la deuda 5 de §17 |
| **`Accordion` para los grupos del panel** | Un grupo plegado esconde un dato que ya cabía. El trabajo de §6.4 es que quepa abierto, no que se pueda cerrar |

---

## 2. Escala de espaciado

Hereda `02-UI-SPEC` §2 (`xs` 4 · `sm` 8 · `md` 12 · `lg` 16 · `xl` 24 · `2xl` 32 · `3xl` 48). Sigue **prohibido el valor arbitrario**: si hace falta un valor nuevo, se declara como token.

### 2.1 Un solo token nuevo

```css
@theme {
  /* NOMBRE PROPIO, NUNCA NOMBRE DE TALLA. Ver §2.2.
     El boton que revela el codigo de acceso pasa de `Mostrar` a `Abriendo…` y
     no puede saltar de ancho en vuelo, que es la regla de 04-UI-SPEC §15.2.
     Derivado de --container-boton-guardar (116px para `Guardando…`, 10
     caracteres) restandole el caracter que tiene de menos, a ~8.7px por
     caracter, redondeado al multiplo de 4 de arriba. */
  --container-boton-mostrar: 108px;
}
```

**Se reutilizan tal cual, sin redeclarar:** `--container-sheet` (480), `--container-sheet-base` (384), `--container-dialogo` (480), `--container-codigo` (240), `--spacing-miniatura` (64), `--spacing-recibo-alto` (480), `--spacing-fila` (40), `--spacing-avatar` (28), `--tracking-columna` (0.04em), `--tracking-codigo` (0.12em), `--container-vacio` (44ch).

**`--spacing-miniatura` (64px) está declarado en `app/globals.css:569` desde la Fase 6 y hoy no lo usa ningún archivo `.tsx`** (verificado con grep el 2026-09-15). Esta fase es su primer consumidor y por eso no declara ninguno nuevo para las fotos.

### 2.2 La regla del ancho, y por qué esta fase no la dispara

`scripts/ci/check-max-w-tallas.sh`, encadenado en `npm run ci:arch`, falla nombrando archivo y línea si aparece una clase de ancho con nombre de talla bajo `app/`, `components/` o `lib/`. La causa está medida y escrita en la cabecera de ese script: Tailwind v4.3 resuelve `max-w-<nombre>` contra `--spacing-*` antes que contra `--container-*`, y la escala de espaciado de este proyecto se llama por tallas, así que `max-w-sm` emite 8px.

- `--container-boton-mostrar` se usa como **`min-w-boton-mostrar`**, no como `max-w`. **No necesita registro en el grupo `max-w` de `extendTailwindMerge`** (`lib/utils.ts`), por la misma razón por la que `--container-boton-marcar`, `--container-boton-alta` y los cuatro de `/operacion` tampoco lo tienen: no compite con ninguna clase base de primitiva.
- `--spacing-miniatura` se usa como **`size-miniatura`**, que sale del namespace de espaciado y no compite con nada.
- **Si durante la ejecución aparece un `max-w-*` nuevo, el registro en `cn()` no es opcional.** Sin él la clase se escribe, el código se lee bien, y el ancho no llega al DOM.

### 2.3 El piso de toque no aplica, y el guardarraíl móvil tampoco

| Regla | En esta fase |
|---|---|
| Piso de toque de **44px** (`--spacing-toque`) | **NO aplica.** Es exclusivo de `app/(cleaner)/`. Todos los controles de esta fase usan la altura por defecto del `Button` (36px) o la de `size="sm"` (32px) |
| Toque cómodo de **56px** (`--spacing-toque-comodo`) | **NO aplica.** Mismo motivo |
| `scripts/ci/check-escala-movil.sh` | **NO se dispara.** Su grep mira solo `app/(cleaner)/`, y **D8-10 deja toda la app del aseador fuera de alcance**. Ningún archivo de esta fase vive bajo ese árbol |

**Y eso es una aserción verificable, no una intención:** si un diff de esta fase toca un archivo bajo `app/(cleaner)/`, el alcance se rompió. El criterio 6 del ROADMAP ("la app del aseador no cambió en nada") se comprueba con `git diff --name-only` contra ese directorio.

---

## 3. Tipografía

**Cero cambios.** Esta fase usa la escala del admin de `02-UI-SPEC` §3, exactamente cuatro tamaños y exactamente dos pesos. Las alturas de línea de esta tabla son lo que §6.4 suma:

| Rol | Tamaño | Line height | Alto de una línea | Peso | Dónde, en esta fase |
|---|---|---|---|---|---|
| Display | 24px | 1.2 | **29px** | 600 | **En ningún sitio.** Ningún panel de esta fase tiene título de página |
| Heading | 16px | 1.3 | **21px** | 600 | `SheetTitle` de los cuatro paneles, y nada más |
| Body | 14px | 1.5 | **21px** | 400 y 600 | Todo valor, todo nombre, todo monto |
| Micro | 12px | 1.4 | **17px** | 400 y 600 | Encabezado de grupo (600, versalita, `tracking-columna`), línea de apoyo y `SheetDescription` (400) |

### 3.1 Reglas ligadas

- **`tabular-nums` obligatorio** en todo lo que sea cifra: montos, hora límite, `7/12` del checklist, fechas cortas y el código de acceso.
- **Ninguna copia de esta fase usa peso 500.** No existe en el sistema, y `SheetTitle` lo trae de fábrica: por eso el override de §12.1 es obligatorio en los cuatro.
- El **código de acceso** va en `font-mono` con `tracking-codigo`, que es la única excepción de familia. La razón ya está escrita en `CodigoDeAcceso.tsx` y vale igual para el admin: la ambigüedad entre cero y O mayúscula, o entre uno y ele, al dictar un código por teléfono es un modo de fallo real.
- Poppins (`font-brand`) **no aparece en ninguna superficie de esta fase**.

---

## 4. Color

### 4.1 Esta fase no añade ningún token de color. Cero.

| Necesidad | Token existente | Valor |
|---|---|---|
| Superficie del panel | `--popover` (que resuelve a `--background`) | #FFFFFF |
| Velo sobre el fondo | `bg-black/10` + `backdrop-blur-xs`, **en la primitiva** | D8-5, no se toca |
| Texto principal, valores, cifras | `--foreground` | #111827 |
| Etiqueta de cada fila, encabezado de grupo, línea de apoyo | `--muted-foreground` | #5C6470 |
| Separador entre grupos, borde de miniatura | `--border` | #E3E6E9 |
| Fondo de miniatura ausente y de la casilla de conteo | `--muted` | #F1F3F5 |
| Apartamento activo, aseo terminado, feed sano | `--status-ok` | #15803D |
| Feed con fallos, aseadora desactivada, margen negativo, foto ausente | `--status-warn` · `--surface-warn` | #B45309 · #FFF8EB |
| Aseo en curso | `--status-progress` | el azul de la Fase 4 |
| Fallo al revelar el código | `--destructive` · `--surface-destructive` | #9F1239 · #FEF2F3 |

**Recordatorio del guardarraíl 6 de `scripts/ci/check-service-role.sh`:** ningún archivo de UI puede llevar un valor de color literal fuera de `app/globals.css`. Los hex de esta tabla existen para que el executor sepa qué está pintando, no para que los escriba.

### 4.2 La proporción 60/30/10 dentro de un panel

| Proporción | Qué la ocupa aquí |
|---|---|
| **60% dominante** | La superficie blanca del panel. Un panel de lectura es 480 × 700 px de blanco con texto encima, y eso es correcto: lo que se está haciendo es leer |
| **30% secundario** | Los separadores de grupo, el fondo `--muted` de las miniaturas y de la caja del código, y el velo que atenúa la lista de detrás |
| **10% acento** | `--primary`, y **solo** en el anillo de foco y en el botón `Editar` del panel de apartamento, que es el único relleno primario de toda la fase |

El color de estado (`--status-ok`, `--status-warn`, `--status-progress`) **no consume el 10% de acento**: es semántico, va siempre con icono o con etiqueta, y no cambia con un rebrand.

### 4.3 La lista cerrada del acento NO se amplía. Sigue en nueve usos

`02-UI-SPEC` §4.4 fijó cinco y las Fases 4, 5 y 6 añadieron cuatro. **Esta fase no añade ninguno.** Lo que usa de esa lista:

1. Botón primario de la superficie, **uno por panel como máximo**: `Editar` en el panel de apartamento.
2. Anillo de foco de cualquier control.

Y dos decisiones que existen precisamente para no ampliarla:

| Tentación | Qué se hace en cambio | Por qué |
|---|---|---|
| Teñir de `--primary` la fila de la lista que tiene el panel abierto | **`bg-canvas`**, el mismo fondo que el hover que esa fila ya tiene | Una fila coral detrás de un velo es una mancha de acento que compite con el panel, que es lo único que hay que leer. Y `bg-canvas` ya significa "esta fila" en las cuatro tablas del producto |
| Botón `Mostrar` del código en `--primary` | **`variant="outline"`** | Revelar un secreto no es la acción primaria de una ficha de lectura. Y el panel ya tiene su único relleno primario en `Editar` |

### 4.4 Jerarquía visual: qué ancla cada panel

Un solo ancla por panel, declarado para que el executor no lo adivine.

| Panel | Ancla visual primaria | Qué la hace ganar | Segundo nivel |
|---|---|---|---|
| Apartamento | **El nombre en la cabecera, con su estado al lado** | Es lo único a 16/600 del panel y es lo que confirma que se abrió el que se quería abrir | El grupo `UBICACIÓN Y ACCESO`, que es el primero y el que se consulta a diario |
| Calendario | **La fecha del próximo checkout** | Es el primer grupo y la única respuesta que casi siempre se va a buscar | La lista de checkouts del mes |
| Aseadora | **El grupo `AHORA MISMO`** | Va primero a propósito: es lo único del panel que cambia solo, y es la pregunta que hoy se resuelve por WhatsApp | Lo que lleva ganado en el periodo abierto |
| Aseo | **El checklist `7/12` y la tira de miniaturas, juntos** | Son la respuesta literal a *"¿cómo va el 302?"*, que es la razón por la que este panel existe | El grupo `DINERO`, que es lo que solo el admin ve |

**Regla derivada:** en ningún panel de esta fase hay **dos rellenos primarios a la vez**. En tres de los cuatro no hay **ninguno**: son superficies de lectura y no tienen acción primaria que inventar.

---

## 5. El panel vive en la dirección

### 5.1 Los cuatro parámetros, y sus anfitriones

| Panel | Anfitrión | Parámetro | Ejemplo |
|---|---|---|---|
| **Apartamento** | `/apartamentos` | `?apartamento={uuid}` | `/apartamentos?apartamento=3f2b…` |
| **Calendario** | `/apartamentos` | `?apartamento={uuid}&vista=calendario` | `/apartamentos?apartamento=3f2b…&vista=calendario` |
| **Aseadora** | `/finanzas` | `?aseadora={uuid}` | `/finanzas?rango=mes&ancla=2026-09-15&aseadora=9c1a…` |
| **Aseo** | `/operacion` | `?aseo={uuid}` | `/operacion?aseo=a71e…` |

**Reglas, y las cuatro son consecuencia de D8-8:**

1. **Un anfitrión por panel.** El panel de aseadora vive solo en `/finanzas`, que es donde lo pone D8-11 al contar `finanzas.spec.ts:589,592`. No se añade a `/aseadores`: ese panel muestra **lo que lleva ganado en el periodo abierto**, y D7-1 dice que el dinero vive en su propia sección.
2. **El calendario es una VISTA del panel de apartamento, no un panel aparte.** Un `Sheet`, dos cuerpos, y `vista` decide cuál. Sin `vista`, la ficha. Así no hay dos velos, ni dos trampas de foco, ni ambigüedad sobre qué cierra la tecla de escape.
3. **Los parámetros que ya existen sobreviven.** `/operacion` ya lee `alertas` y `/finanzas` ya lee `rango` y `ancla`: abrir un panel **no puede perderlos**, y cerrarlo tiene que devolver la dirección con ellos intactos. Si cerrar el panel de aseadora resetea el periodo a mes actual, el filtro se perdió y el admin no va a entender por qué.
4. **La página servidor valida el identificador contra lo que ya leyó**, no contra la base. Es el patrón literal de `app/(admin)/finanzas/pagos/page.tsx`, y su comentario explica el porqué: no es una frontera de seguridad (las funciones tienen su propia guarda), es de comportamiento. §11.4.

### 5.2 Abrir con `push`, cerrar con `replace`. Y por qué no son la misma cosa

**Acá hay un conflicto real entre dos cosas que el dueño ya escribió, y este contrato lo cierra.**

| | |
|---|---|
| **D8-8** | *"cerrar es `router.replace(ruta, { scroll: false })`"* |
| **Criterio 3 del ROADMAP** | *"El botón atrás cierra el panel, no la sección"* |
| **Lo que hace hoy `/finanzas/pagos`** | `replace` **en los dos sentidos**. `TablaPagosDelPeriodo.tsx:135` abre con `<Link … replace>` |
| **El problema** | Con `replace` al abrir, el panel **no añade entrada de historial**. El botón atrás con un panel abierto no lo cierra: **saca de la sección entera.** El precedente que D8-8 manda copiar incumple el criterio 3 |

**La resolución, y respeta las dos porque D8-8 solo fija el CIERRE:**

- **Abrir: `push`.** En la práctica, quitar la prop `replace` del `<Link>`. Es lo que hace verdadero el criterio 3.
- **Cerrar: `router.replace(rutaBase, { scroll: false })`,** literal, como manda D8-8.
- **`scroll: false` no es un detalle.** Sin él, cerrar el panel devuelve la lista arriba y el admin pierde el sitio. Está documentado en `SheetDesglosePago.tsx` y es la mitad del criterio 1.

**El precio, contado y aceptado:** abrir y cerrar ocho paneles seguidos deja ocho entradas de historial idénticas a la ruta base. El botón atrás hay que pulsarlo ocho veces para salir de la sección. Es degradación, no rotura, y es estrictamente mejor que el comportamiento de hoy, donde la primera pulsación te saca. Queda en §17.

**Y `/finanzas/pagos` se alinea en esta fase:** quitar `replace` de `TablaPagosDelPeriodo.tsx:135`. Es una prop. Dejarlo sin tocar significa que "el botón atrás cierra el panel" es verdad en cuatro paneles y mentira en el quinto, dentro del mismo producto. **Antes de tocarlo, comprobar que ninguna aserción de `e2e/finanzas.spec.ts` cuenta profundidad de historial**; si alguna lo hace, cambia de forma, no de fondo.

### 5.3 La fila tocable en Operación, y cómo convive con el menú

**Lo que hay hoy, medido en `FilaAseo.tsx`, y no es lo que dice la DEFINICION.** La DEFINICION afirma que *"tocar la fila de un aseo no hace nada"*. Es falso: la celda `APARTAMENTO` tiene un `<Link href="/apartamentos/{property_id}">` que **estira su área con `after:absolute after:inset-0` sobre toda la fila**. Tocar la fila hoy **navega al formulario de edición del apartamento**. La celda del menú lleva `relative z-10` justamente para que el clic en el `⋯` no caiga en ese `::after`.

**El contrato, y no inventa ningún mecanismo nuevo:**

1. **El `::after` cambia de destino, no de técnica.** El ancla estirada pasa a ser `<Link href={/operacion?aseo={id}}>`, y sigue viviendo en la celda `APARTAMENTO`, sigue siendo un `<a>` real alcanzable por teclado, y sigue pintando el foco de fila con `has-[a:focus-visible]:bg-canvas`. **No se convierte la fila en un `<div>` con `role="button"`.**
2. **El nombre del apartamento deja de ser enlace en esa celda.** Pasa a texto plano, 14/600, que es el peso que ya tiene. No se anidan dos anclas y no se pone un segundo enlace con `z-10` encima del primero: dos áreas clicables solapadas en una fila de 40px es cómo se toca la equivocada.
3. **Ir al apartamento sigue estando a un clic, en dos sitios.** El ítem `Ver apartamento` del `MenuAseo` ya existe (`MenuAseo.tsx:256`) y **solo cambia su `href`** a `/apartamentos?apartamento={id}`. Y el panel de aseo lleva el nombre del apartamento como enlace en su cabecera (§10.2).
4. **El menú `⋯` no cambia en nada.** Su celda ya tiene `relative z-10`, que es exactamente el mecanismo que impide que el clic caiga en el `::after`. **Está probado en producción desde la Fase 4 contra el `::after` que ya estaba ahí.** No hace falta `stopPropagation`, no hace falta `preventDefault`, y añadir cualquiera de los dos sería tapar un problema que no existe.
5. **Los cinco diálogos del menú siguen siendo hermanos del `DropdownMenu`, nunca hijos.** La razón ya está escrita en `MenuAseo.tsx` y no cambia. Y **el panel de aseo tampoco los contiene**: se abre con `Sheet`, no con el menú, y las mutaciones siguen viviendo en el menú.
6. **La fila inerte (gestión externa) no gana panel y no gana área de clic.** Hoy no reacciona al mouse, no tiene `::after` y su nombre es el único enlace. **Se queda exactamente igual, con el `href` actualizado a `/apartamentos?apartamento={id}`.** Un aseo inerte no tiene tarifa, ni pago, ni margen, ni aseador, ni checklist, ni evidencia, por `cl_unmanaged_is_inert`: su panel sería un panel de ausencias.

**Riesgo que el executor tiene que tener delante:** `FilaAseo.tsx` es la unidad visual que más se repite en `/operacion` y sus tres reglas de comportamiento (hover, área de clic, foco) están escritas en su cabecera con sus razones. **El cambio es de `href`, no de estructura.** Si el diff toca el `className` de `TableRow` o el `relative z-10` de la celda del menú, se salió del contrato.

### 5.4 Después de crear un apartamento

**D8-11 lo cerró:** *"al guardar, aterriza en la lista con el panel abierto"*.

| Hoy | En esta fase |
|---|---|
| `Guardar` redirige a `/apartamentos/{id}` (el formulario de edición del recién creado) | `Guardar` redirige a **`/apartamentos?apartamento={id}`** |

La razón que da el comentario de `e2e/apartamento-crud.spec.ts:147` sigue siendo válida y hay que preservarla: *"Sin eso, un segundo `Guardar` insertaría otra vez y chocaría con `properties_nombre_uniq`"*. Aterrizar en la lista con el panel abierto también saca al admin del formulario, así que el defecto sigue cerrado.

**Las cuatro aserciones de D8-11 que cuelgan de esto** (`apartamento-crud.spec.ts:149,191,285` y `apartamento-cuartos.spec.ts:146`) esperan `waitForURL(/\/apartamentos\/[0-9a-f-]{36}$/)`. Pasan a esperar `/apartamentos?apartamento={uuid}`. **Cambian de forma, no de fondo**, y las tres reglas que siguen son innegociables:

1. La aserción de persistencia se sigue haciendo **recargando**, no leyendo el estado en pantalla. Ese comentario está en el spec y es lo que hace real la prueba.
2. `idPorNombre()` sigue resolviendo contra la base, no contra la URL.
3. **No se debilita ninguna aserción de seguridad por comodidad de la prueba.** Es la regla innegociable de D8-11 y es también el criterio 5 del ROADMAP.

---

## 6. La anatomía del panel de lectura

Esta sección es el corazón de la fase: es lo que hace que cuatro superficies distintas se lean como una sola cosa.

### 6.1 Las cinco zonas, de arriba abajo

```
┌──────────────────────────────────────────────┐  ← 480px (--container-sheet)
│ CABECERA                                  ×  │  SheetHeader, p-4, gap-sm
│  Bogotá 3                                    │   · titulo    heading 16/600
│  Bogotá · ✓ Activa                           │   · apoyo     micro 12/400
├──────────────────────────────────────────────┤  gap-4 de la primitiva
│ CUERPO                                       │  px-lg pb-lg, overflow-y-auto
│  GRUPO                                       │   · encabezado micro 12/600
│  Etiqueta                             Valor  │   · fila dato-valor
│  Etiqueta                             Valor  │
│  ──────────────────────────────────────────  │   · Separator entre grupos
│  GRUPO                                       │
│  Etiqueta                             Valor  │
├──────────────────────────────────────────────┤
│ PIE                      [Secundario][Primar]│  SheetFooter, mt-auto, p-4
└──────────────────────────────────────────────┘
```

| Zona | Obligatoria | Contenido |
|---|---|---|
| **Cabecera** | sí, en los cuatro | El nombre de lo seleccionado, más **una** línea de apoyo. Nunca dos |
| **Cuerpo** | sí | Grupos de filas dato-valor, separados por `Separator` |
| **Pie** | no | Solo cuando hay acción. Lo tienen dos de los cuatro |

**El scroll vive en el cuerpo, no en el panel entero.** Es la decisión que ya tomó `SheetDesglosePago.tsx` y su razón vale igual acá: así el nombre de lo que estás mirando se queda fijo mientras recorres su contenido. Un panel que scrollea entero pierde su propio título.

### 6.2 La fila dato-valor

**Una línea, dos extremos, etiqueta a la izquierda y valor a la derecha.**

```tsx
<div className="flex items-baseline justify-between gap-md">
  <span className="text-micro text-muted-foreground">Hora límite</span>
  <span className="text-body tabular-nums text-foreground">11:30</span>
</div>
```

| Regla | Valor | Razón |
|---|---|---|
| Altura | **21px** (la del valor, `text-body`) | La etiqueta mide 17 y la caja la marca el valor |
| Alineación | `items-baseline` | Un `items-center` con dos tamaños distintos desalinea las bases y la fila se lee torcida |
| Etiqueta | micro 12/400 `--muted-foreground` | Es rótulo, no dato |
| Valor | body 14/400 `--foreground`, o 14/600 cuando es el ancla del panel | Es lo que se vino a leer |
| Separación entre filas del mismo grupo | `gap-sm` (8px) | |
| Valor ausente | Em dash `—` en `--muted-foreground` **más su `<span class="sr-only">`** con `sin definir` o `no aplica` | La distinción la fijó `FilaAseo.tsx` y no es estilo: `sin definir` dice que alguien tiene que ir a llenarlo, `no aplica` dice que la base lo prohíbe |
| Valor largo | `truncate` con `title` completo | Truncar sin `title` es esconder el dato |

**Por qué de dos extremos y no apilada.** Una fila apilada (etiqueta arriba, valor abajo) mide 38px en vez de 21: casi el doble. Con nueve filas eso son 153px de diferencia, que es a lo que se parece que un panel quepa o no quepa. Y en 480px de ancho no hace falta apilar: la etiqueta más larga de esta fase (`Tarifa al huésped`, 17 caracteres) mide ~102px a 12px y el valor más largo (`$ 12.345.678`) mide ~95px a 14px tabular. Suman 197px sobre 448px útiles. Sobran 251px.

### 6.3 El grupo

```
UBICACIÓN Y ACCESO          ← micro 12/600, uppercase, tracking-columna, --muted-foreground
                              17px de alto, gap-sm por debajo
Dirección              …    ← filas, gap-sm entre ellas
Hora límite        11:30
──────────────────────────  ← Separator, con gap-lg a cada lado
```

| Regla | Valor |
|---|---|
| Encabezado | micro 12/600, `uppercase`, `tracking-columna`, `--muted-foreground`. **Escrito en mayúscula en el DOM**, no solo con la clase: `uppercase` transforma el glifo pero no el texto, y §15 fija el copy. Es el criterio que `SheetDesglosePago.tsx` ya aplica |
| Separación encabezado ↔ primera fila | `gap-sm` (8px) |
| Coste vertical del encabezado | **25px** (17 + 8) |
| Entre grupos | `Separator` de 1px con `gap-lg` (16px) a cada lado. **Coste: 33px** |
| Grupos por panel | **máximo cuatro** |

**Un grupo de una sola fila no lleva encabezado.** Un rótulo de grupo sobre un solo dato son 25px gastados en decir dos veces lo mismo. Si un grupo se queda con una fila, la fila sube al grupo de arriba.

### 6.4 El presupuesto vertical, medido

**El alto de referencia del admin no estaba declarado en ningún contrato anterior. Se declara acá.**

| Referencia | Alto de pantalla | Cromo del navegador | Viewport |
|---|---|---|---|
| **Piso soportado** | 1280 × 800 | ~87px (pestañas + barra de direcciones) | **700px** |
| Referencia | 1440 × 900 | ~87px | 810px |

Todos los números de abajo están calculados **contra el piso de 700px**. A 810 sobra siempre.

**El marco fijo, que no depende del contenido:**

| Pieza | Cálculo | Alto |
|---|---|---|
| Cabecera | `p-4` 16 + título 21 + `gap-sm` 8 + apoyo 17 + `p-4` 16 | **78px** |
| `gap-4` de la primitiva | dos separaciones entre los tres hijos flex | **32px** con pie, **16px** sin pie |
| Pie (dos botones de 36px en fila) | 16 + 36 + 16 | **68px** |
| `pb-lg` del cuerpo | | **16px** |

| Panel | Cuerpo disponible a 700px |
|---|---|
| Con pie (apartamento, calendario) | 700 − 78 − 32 − 68 − 16 = **506px** |
| Sin pie (aseadora, aseo) | 700 − 78 − 16 − 16 = **590px** |

**Ancho útil del cuerpo:** 480 − `px-lg` 16 × 2 = **448px**.

#### El panel de apartamento, que es el más cargado

Nueve datos de cuerpo más dos botones. Nombre y estado suben a la cabecera, el cluster va en la línea de apoyo.

| Grupo | Cálculo | Alto |
|---|---|---|
| `UBICACIÓN Y ACCESO` | 25 + dirección 21 + 8 + código **32** (lleva botón `size="sm"`) + 8 + hora 21 | **115px** |
| separador | 16 + 1 + 16 | 33px |
| `A CARGO` | 25 + 21 + 8 + 21 | **75px** |
| separador | | 33px |
| `DINERO` | 25 + 21 + 8 + 21 + 8 + 21 | **104px** |
| separador | | 33px |
| `PRÓXIMO ASEO` | 25 + 21 + 8 + apoyo 17 | **71px** |
| | | **Total 464px** |

**Cabe, con 42px de holgura sobre los 506 disponibles.** A 810 de viewport sobran 152px.

**La palanca, si algún día no cabe:** los tres separadores cuestan 99px, que es más que cualquier grupo salvo el primero. Quitar el `Separator` y bajar la separación a `gap-lg` seco ahorra **51px** sin quitar un solo dato. **Ese es el primer recorte, y solo después se toca el contenido**, que ya lo recortó el dueño una vez.

**La dirección va en una línea truncada, y es una decisión, no un descuido.** Reservarle dos líneas cuesta 21px, que es la mitad de la holgura del panel entero. El texto completo va en `title` y es el nombre accesible del enlace, y quien necesite leerla entera tiene el enlace a Maps justo ahí, que es lo que de verdad se hace con una dirección.

#### El panel de aseo, y el umbral a partir del cual el cuerpo scrollea

| Grupo | Cálculo | Alto |
|---|---|---|
| `EJECUCIÓN` | 25 + a cargo 21 + 8 + checklist 21 + 8 + horas 21 | **104px** |
| separador | | 33px |
| `EVIDENCIA` | 25 + tira de miniaturas 64 | **89px** |
| separador | | 33px |
| `REPORTES` | 25 + n × 21 + (n−1) × 8 | **133px con n = 4** |
| separador | | 33px |
| `DINERO` | 25 + 21 + 8 + 21 + 8 + 21 | **104px** |
| | | **Total 529px con cuatro reportes** |

**Cabe, con 61px de holgura sobre los 590 disponibles.** Cada reporte adicional cuesta **29px**, así que **a partir del sexto reporte el cuerpo desborda y entra el `overflow-y-auto`**.

Seis gastos y daños en un solo aseo es patológico. Que el `overflow-y-auto` esté ahí para ese caso **no es incumplir D8-7**: D8-7 dice literalmente que "sin scroll" es el objetivo que ordena el recorte del contenido, no una restricción técnica dura. El contenido está dimensionado para que el caso normal nunca lo dispare, la cabecera se queda fija cuando se dispara, y el número está escrito acá para que nadie lo descubra en producción.

#### Los otros dos

| Panel | Contenido fijo | Lo que crece | Umbral |
|---|---|---|---|
| **Calendario** | próximo checkout 71 + 33 + encabezado de la lista 25 + 33 + estado del feed 75 = **237px** | Las filas de checkout, 21px + 8 de separación = 29px cada una | (506 − 237) / 29 = **9 filas**. Un mes de un apartamento muy ocupado llega a 15. §8.3 dice qué se hace |
| **Aseadora** | ahora mismo 63 + 33 + 33 + suplente 46 + 33 + periodo 71 = **279px** | Los nombres de los apartamentos, como texto corrido que envuelve | §9.2. Con doce nombres son 88px, y sobran 223px |

---

## 7. Panel: Apartamento

`/apartamentos?apartamento={uuid}`. **Es la ficha de lectura que D8-3 mandó crear y que hoy no existe.**

### 7.1 Anatomía

```
┌──────────────────────────────────────────────┐
│ Bogotá 3                                  ×  │
│ Bogotá · ✓ Activa                            │
├──────────────────────────────────────────────┤
│ UBICACIÓN Y ACCESO                           │
│ Dirección      Calle 100 #15-20, apto 302 ↗  │
│ Código de acceso        ••••••  [ Mostrar ]  │
│ Hora límite                           11:30  │
│ ──────────────────────────────────────────── │
│ A CARGO                                      │
│ Responsable                 María González   │
│ Suplente                      Ana Rodríguez  │
│ ──────────────────────────────────────────── │
│ DINERO                                       │
│ Tarifa al huésped               $ 120.000    │
│ Pago al aseador                  $ 60.000    │
│ Margen                           $ 60.000    │
│ ──────────────────────────────────────────── │
│ PRÓXIMO ASEO                                 │
│ jueves 18 de septiembre       ● Pendiente    │
│ María González                               │
├──────────────────────────────────────────────┤
│                   [ Calendario ]  [ Editar ] │
└──────────────────────────────────────────────┘
```

### 7.2 Contenido, exacto y cerrado

**Lo que no está en esta tabla no se muestra.** D8-4 lo aprobó dato por dato y excluye cuartos, faltantes base, historial y feeds.

| Zona | Dato | Tratamiento |
|---|---|---|
| Cabecera, título | `properties.nombre` | heading 16/600 |
| Cabecera, apoyo | `cluster` · estado | Texto micro 12/400, más el componente `EstadoApartamento` que ya existe (icono + etiqueta, los tres canales de `02-UI-SPEC` §5). **No se reimplementa el `if`**: la derivación vive en `estadoDeApartamento()` |
| Grupo 1 | Dirección | Valor body 14/400 truncado con `title`. Es un `<a>` a `maps_url` con `target="_blank"`, `rel="noopener noreferrer"` e icono `ExternalLink` de 14px. **Sin `maps_url`, es texto plano sin icono.** Sin `direccion`, em dash con `sin definir` |
| Grupo 1 | Código de acceso | §7.3 |
| Grupo 1 | Hora límite | `11:30`, 24h, `tabular-nums`. Sale de `formatHoraLimite()`, que ya existe |
| Grupo 2 | Responsable | Nombre del aseador. Si está desactivado, `(inactivo)` en `--status-idle` detrás del nombre, como en `02-UI-SPEC` §8.3. Vacío en una gestionada: **`Sin asignar` en `--status-warn`**, no em dash, que es la regla de `FilaAseo.tsx` |
| Grupo 2 | Suplente | Igual, pero vacío sí es em dash con `sin definir`: el suplente es opcional |
| Grupo 3 | Tarifa al huésped · Pago al aseador · Margen | `formatCOP()`, `tabular-nums`, alineados a la derecha. **Margen se calcula, no se guarda.** Negativo: `--status-warn` con el signo menos explícito, nunca `--destructive` (`07-UI-SPEC` §4.4) |
| Grupo 4 | Próximo aseo | Fecha larga (`jueves 18 de septiembre`) más el componente `EstadoAseo` que ya existe. Segunda línea micro 12/400 con quién lo hace. **Sin próximo aseo:** una sola línea micro `--muted-foreground`, `No tiene ningún aseo programado.` |
| Pie | `Calendario` · `Editar` | §7.4 |

### 7.2.1 La variante informativa, que no es un caso raro

Cinco de las 39 unidades son `gestion_vivaguest = false`. El panel **cambia de forma**, y no por estilo: `props_assignees_only_when_managed` y `cl_unmanaged_is_inert` lo imponen en la base.

| Grupo | Gestionada | Informativa |
|---|---|---|
| 1 `UBICACIÓN Y ACCESO` | igual | igual |
| 2 `A CARGO` | Responsable + Suplente | **Una sola fila: `Contacto externo`**, con el texto truncado y su `title`. Un grupo de una fila no lleva encabezado (§6.3), así que la fila sube al grupo 1 |
| 3 `DINERO` | Tres filas | **No se renderiza.** En su lugar, una línea micro 12/400 `--muted-foreground`: `Las unidades de gestión externa no llevan tarifas.` Es el copy exacto que `02-UI-SPEC` §8.1 ya fijó para el formulario |
| 4 `PRÓXIMO ASEO` | Fecha + estado + quién | Fecha + `EstadoAseo` en su clave `externa`. Sin quién: em dash con **`no aplica`**, no `sin definir` |
| Pie | `Calendario` · `Editar` | igual. Una informativa puede tener feed |

**Informativa no es un pendiente ni un error.** `02-UI-SPEC` §5 lo dejó escrito y sigue vigente: no se pinta gris, no se marca, no se ofrece "completar".

### 7.3 El código de acceso: se revela con un gesto, no al abrir

**La decisión: `••••••` más un botón `Mostrar`. El código no está en el HTML de la página hasta que alguien lo pide.**

Las razones son medidas, no de criterio:

1. **La dirección del panel es compartible por diseño.** Es el criterio 2 del ROADMAP: el enlace se pega en un chat y abre lo mismo. Si el código se renderiza al abrir, ese enlace entrega el código de la cerradura a quien sea que abra el chat, más a quien pase por detrás de la pantalla, más a cualquier captura.
2. **Hay precedente literal en el repo, en esta misma familia de pantallas y sobre esta misma tabla.** `app/(admin)/apartamentos/[id]/calendario/page.tsx` dice: *"`leerSecretos` devuelve la URL completa, pero lo único que cruza a un componente cliente es su forma ENMASCARADA. Lo que se pasa como prop a un Client Component viaja en la carga de React y queda en el DOM"*. Y `e2e/calendario.spec.ts` comprueba que el secreto no está en el documento antes de pulsar `Mostrar` (T-02-74). **El código de acceso recibe el mismo tratamiento que la URL iCal, porque es el mismo problema y la misma tabla.**
3. **No es lo mismo que el formulario de edición.** Ahí el código sí se pinta en claro, con la razón escrita en `FormularioApartamento.tsx:646`: *"el admin lo está editando y tiene que poder leerlo para comprobarlo"*. Eso es cierto cuando se escribe y falso cuando se consulta. Un formulario se abre para cambiar una unidad; un panel se abre decenas de veces al día sobre una lista.

**Contrato exacto:**

| Estado | Qué se ve |
|---|---|
| **Oculto** (inicial, siempre) | Etiqueta `Código de acceso`, valor `••••••` en `--muted-foreground`, y `Button variant="outline" size="sm"` con icono `Eye` de 14px y label `Mostrar`, con `min-w-boton-mostrar` |
| **En vuelo** | Icono `Loader2` girando y label `Abriendo…`, **conservando el ancho** por el `min-width`. Prohibido deshabilitar sin mostrar el spinner |
| **Revelado** | El código en `font-mono text-body font-semibold tracking-codigo tabular-nums`, dentro de una caja `bg-muted rounded-md px-sm` de `max-w-codigo`, más `Button variant="ghost" size="icon-sm"` con `Copy` y `aria-label="Copiar el código"`. Al copiar, el icono pasa a `Check` por 1,5 s y se anuncia con `aria-live="polite"` |
| **Sin código** | La fila muestra el `tipo_cerradura` y, como valor, em dash con `sin definir`. **Sin botón.** Un botón que abre un vacío es un viaje para nada |
| **Error** | `Alert` de una línea, `--surface-destructive`, dentro del grupo y **no en un toast**: el error pertenece a esa fila y es donde el admin está mirando. Copy en §15 |

**Reglas duras:**

- **El código vive en el estado de React de ese componente y muere con el desmontaje.** Ni almacenamiento local, ni de sesión, ni IndexedDB, ni caché del service worker. Es la misma regla que `CodigoDeAcceso.tsx` impone en el árbol del aseador, por la misma razón.
- **No se auto-oculta y no hay botón `Ocultar`.** Cerrar el panel ya lo desmonta. Un temporizador obligaría a pedirlo otra vez a mitad de una llamada.
- **NO se escribe la línea `Cada vez que lo abres queda registrado.`** En el árbol del aseador esa frase es verdad porque el camino es `reveal_access_code()`, que escribe en la bitácora en la misma transacción. **El camino del admin es `exigirAdmin()` más cliente administrativo, y no audita nada.** Copiar la frase acá sería escribir una mentira en la interfaz.
- La action arranca por **`exigirAdmin()`**, después valida con Zod, y **solo entonces** construye el cliente administrativo. Es el orden obligatorio que la cabecera de `apartamentos/_actions.ts` documenta y que el guardarraíl 7 de `check-service-role.sh` verifica.

### 7.4 Los dos botones del pie

| Botón | Variante | Destino | Nota |
|---|---|---|---|
| `Calendario` | `outline`, con icono `CalendarDays` de 16px | `?apartamento={id}&vista=calendario` | Es una **vista del mismo panel**, no una navegación fuera. Va con `push` para que atrás devuelva a la ficha |
| `Editar` | `default` (el **único relleno primario de la fase**), con icono `Pencil` de 16px | `/apartamentos/{id}` | Es una navegación de verdad: se sale de la lista y se entra al formulario, que sigue siendo página |

`Calendario` a la izquierda, `Editar` a la derecha, `gap-sm`, alineados al extremo derecho. El pie es `flex-row justify-end`, que pisa el `flex-col` de `SheetFooter` (§12.1).

**Ningún botón destructivo, y ninguna mutación.** Activar, desactivar y borrar siguen viviendo en `MenuApartamento` de la lista, que no se toca.

---

## 8. Panel: Calendario del apartamento

`/apartamentos?apartamento={uuid}&vista=calendario`. **Contenido de lectura nuevo** (§0.1, conflicto A). La pantalla de conexión de APTO-12 se queda como página, sin tocar.

### 8.1 Anatomía

```
┌──────────────────────────────────────────────┐
│ ‹ Bogotá 3                                ×  │
│ Calendario · septiembre de 2026               │
├──────────────────────────────────────────────┤
│ PRÓXIMO CHECKOUT                             │
│ jueves 18 de septiembre                      │
│ dentro de 3 días                             │
│ ──────────────────────────────────────────── │
│ CHECKOUTS DE SEPTIEMBRE                      │
│ jue 4                                        │
│ mar 9                                        │
│ jue 18                                       │
│ dom 28                                       │
│ ──────────────────────────────────────────── │
│ CALENDARIO                                   │
│ Estado                          ✓ Conectado  │
│ Última sincronización        hoy, 09:42      │
├──────────────────────────────────────────────┤
│                        [ Cambiar calendario ]│
└──────────────────────────────────────────────┘
```

### 8.2 Contenido

| Zona | Dato | Tratamiento |
|---|---|---|
| Cabecera, título | `‹ {nombre}` | El chevron es un `<Link>` con `ArrowLeft` de 16px a `?apartamento={id}` (sin `vista`), con `aria-label="Volver a la ficha"`. **Se navega con `router.back()` cuando el panel llegó desde la ficha**, porque `Calendario` abrió con `push`. Entrando por URL directa, el enlace hace `replace` a la ficha |
| Cabecera, apoyo | `Calendario · {mes} de {año}` | micro 12/400. El mes es el corriente. **No hay navegación de meses**: D8-4 lo excluye (*"Fuera: histórico de meses pasados"*) |
| Grupo 1 | Próximo checkout | Fecha larga en body 14/600, más segunda línea micro con `dentro de {N} días`, `mañana` o `hoy`. Sale de `calendar_reservations.ends_on` mínimo mayor o igual a `hoyBog()` |
| Grupo 2 | Los checkouts del mes | Una fila por checkout: `jue 18` en body 14/400 `tabular-nums`, alineado a la izquierda. **El checkout de hoy va en 14/600**; los pasados, en `--muted-foreground` |
| Grupo 3 | Estado del feed | `✓ Conectado` con `CircleCheck` en `--status-ok`, o `⚠ {N} fallos seguidos` con `TriangleAlert` en `--status-warn`, o `Sin conectar` con `CalendarX` en `--muted-foreground`. Sale de `calendar_feeds.consecutive_failures` y `is_active` |
| Grupo 3 | Última sincronización | `hoy, 09:42` / `ayer, 21:15` / `4 de septiembre`. De `calendar_feeds.last_success_at`, que es `timestamptz`, así que sí es un instante y se formatea con hora |
| Pie | `Cambiar calendario` o `Conectar calendario` | `outline`, con icono `CalendarCheck` de 16px, a `/apartamentos/{id}/calendario`. **El label cambia según haya feed o no**, que es la misma distinción que `MenuApartamento` ya hace |

**La URL iCal no aparece en este panel, ni siquiera enmascarada.** Es una credencial, su superficie de lectura es la página de conexión que ya la enmascara y que tiene su toggle con action propia, y D8-4 no la lista. Duplicarla acá sería abrir una segunda ruta a la misma credencial con la mitad de las salvaguardas.

### 8.3 Cuando el mes trae más de nueve checkouts

El cuerpo scrollea. Es el único panel de la fase donde eso es esperable y correcto: una lista de fechas es lo menos sorprendente que puede desbordar, y la cabecera se queda fija, así que nunca se pierde de vista **qué apartamento** y **qué mes** se está mirando. **No se pagina, no se corta con un `y N más`, y no se mete en un acordeón:** los checkouts del mes son la razón de existir del panel.

---

## 9. Panel: Aseadora

`/finanzas?aseadora={uuid}`. **Reemplaza `/finanzas/aseadoras/[id]`, que se borra** (§0.1, conflicto B).

### 9.1 Anatomía

```
┌──────────────────────────────────────────────┐
│ (MG) María González                       ×  │
│ Activa                                       │
├──────────────────────────────────────────────┤
│ AHORA MISMO                                  │
│ ▶ Está en Bogotá 3 desde las 09:12.          │
│ ──────────────────────────────────────────── │
│ RESPONSABLE DE (12)                          │
│ Bogotá 1, Bogotá 3, Bogotá 7, Medellín 1,    │
│ Medellín 4, Cartagena 2, Cartagena 5, Cali 1,│
│ Cali 3, Santa Marta 2, Pereira 1, Pereira 4  │
│ ──────────────────────────────────────────── │
│ SUPLENTE EN (3)                              │
│ Bogotá 2, Medellín 2, Cali 6                 │
│ ──────────────────────────────────────────── │
│ EN EL PERIODO ABIERTO                        │
│ Lleva ganado                     $ 540.000   │
│ 8 aseos · $ 60.000 en gastos                 │
└──────────────────────────────────────────────┘
```

### 9.2 Contenido

| Zona | Dato | Tratamiento |
|---|---|---|
| Cabecera, título | `CirculoIniciales` de 28px + nombre | El componente ya existe desde la Fase 7 |
| Cabecera, apoyo | `Activa` / `Desactivada` | micro 12/400. `Desactivada` va con `UserRoundX` de 14px en `--status-warn` |
| Grupo 1 | Ahora mismo | Reutiliza el copy y los tres estados que `07-UI-SPEC` §8.4 ya fijó, palabra por palabra: `Está en {apartamento} desde las {HH:mm}.` · `No tiene ningún aseo en curso.` · `Esta cuenta está desactivada.` Con sus iconos `Play` en `--status-progress`, `Clock` en `--muted-foreground`, `UserRoundX` en `--status-warn` |
| Grupo 2 | Responsable de | §9.3 |
| Grupo 3 | Suplente en | §9.3 |
| Grupo 4 | Lo que lleva ganado | Fila dato-valor: etiqueta `Lleva ganado`, valor `formatCOP()` en body 14/600 `tabular-nums`. Segunda línea micro: `{N} aseos · {$G} en gastos`, o `{N} aseos` sin gastos. Es la misma forma que la fila del bloque 3 de `/finanzas` |

### 9.3 Los apartamentos van como texto corrido, y está medido

**Una fila por apartamento no cabe.** Una persona puede ser responsable de doce unidades. Doce filas de 21px con `gap-sm` cuestan 340px, más 25 de encabezado son 365, y el panel solo tiene 590 para todo. Con los otros tres grupos, el total sería 702px contra 590 disponibles: **no cabe por 112px.**

**Contrato:** los nombres van como **un párrafo de nombres separados por coma**, body 14/400, que envuelve. Doce nombres de ~10 caracteres son ~140 caracteres, que a 14px sobre 448px útiles son **tres líneas: 63px**. Es cuatro veces más denso que las filas y los doce nombres siguen visibles sin ningún gesto, que es todo el punto del panel.

- El encabezado del grupo lleva el conteo: `RESPONSABLE DE (12)`. El conteo es el dato que el admin busca primero.
- **Los nombres son texto plano, no enlaces.** Un enlace ahí llevaría a `/apartamentos?apartamento={id}`, o sea **fuera de Finanzas**, que es exactamente lo que D8-2 dice que no puede costar una consulta. Es la misma disciplina que `SheetDesglosePago.tsx` aplica a sus líneas, por otra razón.
- Orden **alfabético**. No por carga, no por cluster: cualquier otro orden se lee como una clasificación, que es la trampa que `07-UI-SPEC` §6.5.3 ya documentó para este mismo equipo.
- Vacío: **no se renderiza el grupo entero.** `SUPLENTE EN (0)` con un em dash debajo son 46px para decir una ausencia que nadie fue a buscar. Si los dos grupos están vacíos, una sola línea micro: `No es responsable ni suplente de ningún apartamento.`

**Lo que este panel NO muestra, y hay que dejarlo escrito para que nadie lo añada "ya que estamos":** el histórico de aseos, sus pagos mes a mes y sus gastos reportados. D8-4 los saca por nombre y el argumento del dueño es verificable: los tres viven en `/finanzas/aseos?aseador={id}`, en `/finanzas/aseos?aseador={id}&filtro=con-gastos` y en `/finanzas/pagos`.

### 9.4 Lo que se rompe al borrar la página

`e2e/finanzas.spec.ts:589,592` hace clic en el nombre de la fila del bloque 3, espera `waitForURL(/\/finanzas\/aseadoras\//)` y después comprueba **los cuatro bloques por su título**. Cambia así:

| Antes | Después |
|---|---|
| `waitForURL(/\/finanzas\/aseadoras\//)` | `toHaveURL(new RegExp('aseadora='))` |
| `toHaveURL(ancla=…)` | **se conserva tal cual.** El periodo tiene que seguir viajando (§5.1, regla 3) |
| Los cuatro títulos de bloque | Los cuatro encabezados de grupo de §9.1 |

**El `ancla` es la aserción que no se toca.** Es la que comprueba que abrir un panel no cambia el periodo por debajo.

---

## 10. Panel: Aseo

`/operacion?aseo={uuid}`. **Es lo único de la fase que no existe en ninguna forma**, y es la respuesta a *"¿cómo va el 302?"*, que hoy se resuelve por WhatsApp.

### 10.1 Anatomía

```
┌──────────────────────────────────────────────┐
│ Bogotá 3 ↗                                ×  │
│ jueves 18 de septiembre · ▶ En curso         │
├──────────────────────────────────────────────┤
│ EJECUCIÓN                                    │
│ A cargo                     María González   │
│ Checklist                           7/12     │
│ Horas               Empezó 09:12 · sin cerrar│
│ ──────────────────────────────────────────── │
│ EVIDENCIA                                    │
│ ▢ ▢ ▢ ▢ ▢ [+8]                               │
│ ──────────────────────────────────────────── │
│ REPORTES                                     │
│ Gasto · Jabón y trapos            $ 35.000   │
│ Daño · Espejo del baño rajado          —     │
│ ──────────────────────────────────────────── │
│ DINERO                                       │
│ Tarifa al huésped               $ 120.000    │
│ Pago al aseador                  $ 60.000    │
│ Margen                           $ 60.000    │
└──────────────────────────────────────────────┘
```

### 10.2 Contenido

| Zona | Dato | Tratamiento |
|---|---|---|
| Cabecera, título | Nombre del apartamento | heading 16/600, y **es un `<Link>` a `/apartamentos?apartamento={id}`** con `ExternalLink` de 14px. Es el único enlace que sale de la sección, y es deliberado: el admin lo eligió, no le pasó por tocar una fila (§5.3) |
| Cabecera, apoyo | Fecha larga · estado | micro 12/400 más el componente `EstadoAseo`, que ya existe |
| Grupo 1 | A cargo | Nombre del aseador. Vacío: **`Sin asignar` en `--status-warn`**, la regla de `FilaAseo.tsx` |
| Grupo 1 | Checklist | **`7/12`** en body 14/600 `tabular-nums`. **El formato lo escribió el dueño en D8-4 y se respeta literal.** Nombre accesible: `Checklist, 7 de 12 tareas`. Sin checklist todavía: em dash con `sin definir` |
| Grupo 1 | Horas | `Empezó 09:12 · Terminó 10:40` en `tabular-nums`. En curso: `Empezó 09:12 · sin cerrar`. Pendiente: em dash con `sin definir` |
| Grupo 2 | Evidencia | §10.3 |
| Grupo 3 | Reportes | Gastos y daños **en una sola lista**, una línea cada uno: `{Tipo} · {concepto}` a la izquierda, monto a la derecha. Gasto lleva icono `Receipt` de 14px en `--muted-foreground`; daño lleva `Hammer` de 14px en `--status-warn`. **Un daño no tiene monto**: em dash con `no aplica` |
| Grupo 4 | Dinero | `formatCOP()`, `tabular-nums`, derecha. Margen calculado. §10.4 |

**Por qué gastos y daños comparten grupo.** En grupos separados cuestan 25px de encabezado cada uno más su separador de 33: **91px de cromo para, casi siempre, dos líneas de contenido.** En uno solo cuestan 25. Y la distinción no se pierde: va en el prefijo y en el icono, que son dos canales, no uno.

**La línea que `07-UI-SPEC` §6.4 obliga a conservar:** cuando hay al menos un daño, al pie del grupo va una línea micro 12/400 `--muted-foreground`: **`Los daños no se descuentan del pago.`** Es D7-2 hecho visible, y en un panel que muestra el pago justo debajo es donde más falta hace.

### 10.3 Las miniaturas

| Regla | Valor | Razón |
|---|---|---|
| Tamaño | **64px** (`size-miniatura`, token ya declarado) | `object-cover`, `rounded-md`, borde de 1px `--border` |
| Separación | `gap-sm` (8px) | |
| Cuántas caben | **6**. 6 × 64 + 5 × 8 = 424 sobre 448 útiles | Siete no caben: 7 × 64 + 6 × 8 = 496 |
| Con 6 fotos o menos | Las 6 miniaturas | |
| Con más de 6 | **5 miniaturas más una casilla de conteo** en la sexta posición: mismo tamaño, fondo `--muted`, `+{N}` en micro 12/600 `--muted-foreground` | |
| La casilla de conteo **no es un control** | `cursor: default`, sin `hover`, sin foco, `aria-label="{N} fotos más"` | No abre nada. §17.5 lo declara como deuda |
| Al tocar una miniatura | Abre `DialogoFoto`, un `Dialog` de `--container-dialogo` (480px) con la foto a `max-h-recibo-alto` (480px) y `object-contain` | Es el mismo componente que `DialogoRecibo` con otra cabecera: título con el cuarto o el concepto, subtítulo micro con la hora, `alt` descriptivo, y `Cerrar` en `variant="outline"` |
| Sin zoom, sin descarga, sin flechas de navegación | | Misma regla que `DialogoRecibo` |

**Un diálogo dentro de un panel es un patrón que este repo ya tiene en producción.** `SheetDesglosePago` monta `DialogoRecibo` dentro del `Sheet` y funciona. La advertencia de `07-UI-SPEC` §5.3 iba sobre un diálogo dentro de un panel **dentro de una página con cuatro bloques con estado propio**, que no es este caso.

**Las firmas se emiten en el servidor, después de la guarda de admin, y solo para las que se ven.** Seis firmas por apertura, nunca doce. Es la regla literal de `pagos/page.tsx`: *"solo se firman los recibos DEL PAGO QUE SE ESTÁ MIRANDO: firmar los de las ocho filas de cada periodo al cargar la página dejaría decenas de URL vivas en el navegador por si acaso"*. Vida de la firma: `VIDA_DE_LA_FIRMA_SEGUNDOS`, que ya vale 300.

**Los tres estados de ausencia, y ninguno es una imagen rota:**

| Caso | Qué se ve |
|---|---|
| Una foto purgada o con firma fallida | La casilla de 64px con fondo `--muted` y `ImageOff` de 20px en `--muted-foreground`, centrado, `aria-label="Foto no disponible"`. **Ocupa su sitio en la tira**: hacerla desaparecer cambiaría el conteo y haría creer que había menos evidencia |
| El aseo no tiene ninguna foto | El grupo se renderiza con **una línea micro 12/400 `--muted-foreground`** en vez de la tira: `Todavía no hay fotos de este aseo.` o `Este aseo terminó sin fotos.` según el estado. No se usa `EstadoVacio`: §11.2 |
| La firma vence con el diálogo abierto | `onError` sustituye la imagen por `ImageOff` de 32px más `No se pudo mostrar la foto.` / `Vuelve a abrirla.`, que es el copy que `07-UI-SPEC` §12.1 ya fijó para el recibo |

### 10.4 El grupo de dinero y la migración de D8-9

**La tarifa y el margen del aseo están detrás de grants por columna desde la migración 24**, que es la frontera del aseador. Leer un aseo ajeno con su dinero exige una **función definer con guarda de admin como primera sentencia**, igual que las seis de la migración 26.

Consecuencias que son de UI y que el executor tiene que tener delante:

1. **El panel no tiene rama de "sin permiso".** El layout de `(admin)` ya exige admin contra el servidor de autenticación, no contra un claim del token, y la función vuelve a comprobarlo por dentro. Si esa función deniega, es un defecto, no un estado: se va por `error.tsx`. **Escribir un `if (!autorizado) return <SinPermiso/>` sería una tercera copia de la misma regla y un sitio más donde equivocarse.**
2. **Los cuatro grupos salen de una sola lectura**, no de cuatro. El panel se abre y se cierra decenas de veces al día; cuatro viajes por apertura es cuatro veces la latencia.
3. **Ningún componente del árbol del aseador recibe nada de esta función.** Es la regla de `07-UI-SPEC` §10.1 y se verifica leyendo el diff: si un archivo bajo `app/(cleaner)/` aparece en el diff de esta fase, el alcance se rompió (§2.3).

---

## 11. Estados

### 11.1 Carga: el esqueleto es del panel, y la lista NO se atenúa

Abrir un panel es una navegación de servidor: cambia `searchParams`, Next vuelve a renderizar la página y responde con la carga RSC. Durante ese viaje **la lista de detrás se queda visible y sin cambios, porque no ha cambiado**.

**Lo que está prohibido y hay que decirlo por nombre:**

- **Prohibido atenuar la lista** con el patrón de `07-UI-SPEC` §12.2b (`opacity-60` más `pointer-events-none`). Ahí era correcto porque las cifras iban a cambiar; acá la lista es exactamente la misma antes y después. Atenuarla dice que algo pasó donde no pasó nada.
- **Prohibido el spinner centrado**, en la lista o en el panel.
- **Prohibido que el panel aparezca solo cuando llegan los datos.** El clic quedaría sin respuesta durante el viaje y el admin volvería a tocar.

**Lo que se hace:**

1. La condición de apertura sale de `searchParams`, que el servidor tiene **de inmediato**, así que el `Sheet` monta y hace su entrada **en el mismo render**, antes de leer nada.
2. La lectura de datos va dentro de un **`<Suspense>`**, cuyo `fallback` es un **esqueleto con la geometría real del panel**: la cabecera con dos barras de `Skeleton` de 21 y 17px, y los grupos con sus encabezados y el número de filas del caso típico, con las alturas exactas de §6.4. **La única diferencia al llegar los datos es que el gris se convierte en texto.** Es la regla que las Fases 2, 4 y 7 ya establecieron para `loading.tsx`, aplicada dentro del panel.
3. **El pie no se esqueletiza:** los botones son navegación, no dependen del dato, y se pueden renderizar deshabilitados con su label real desde el primer frame.

### 11.2 Vacíos: cuándo `EstadoVacio` y cuándo una línea

**La regla, y es nueva pero se deriva de las dos que ya hay:**

| Situación | Qué se usa |
|---|---|
| **Un grupo vacío dentro de un panel con contenido** | **Una línea micro 12/400 `--muted-foreground` en el sitio de las filas.** Nada más. Es lo mismo que `07-UI-SPEC` §12.1 hace con sus "dos que no son `EstadoVacio` porque viven dentro de otra cosa" |
| **Un grupo vacío que no aporta** (suplente en cero apartamentos) | **El grupo entero no se renderiza.** §9.3 |
| **El panel entero sin contenido** | `EstadoVacio` en su variante **`compacto`**. El panel tiene 448px útiles, muy por encima de los 360 del carril lateral para los que se hizo la variante |

**Está explícitamente prohibido escribir un segundo componente de estado vacío.** `04-UI-SPEC` §15.1 lo prohíbe, `07-UI-SPEC` lo repite, y `EstadoVacio.tsx` ya sirve a ocho superficies con dos variantes.

Los vacíos de esta fase, todos de una línea:

| Panel | Grupo | Copy |
|---|---|---|
| Apartamento | Próximo aseo | `No tiene ningún aseo programado.` |
| Calendario | Checkouts del mes | `No hay checkouts en lo que queda del mes.` |
| Calendario | Todo el panel, sin feed | `EstadoVacio compacto`, icono `CalendarX`. Encabezado `Sin calendario conectado.` · cuerpo `Este apartamento no va a generar aseos automáticos hasta que conectes su calendario.` · acción `Conectar calendario` |
| Aseadora | Responsable de / Suplente en | `No es responsable ni suplente de ningún apartamento.` (una sola línea para los dos) |
| Aseadora | En el periodo abierto | `Todavía no lleva ningún aseo en este periodo.` |
| Aseo | Evidencia | `Todavía no hay fotos de este aseo.` / `Este aseo terminó sin fotos.` |
| Aseo | Reportes | `No reportó gastos ni daños.` |

### 11.3 Errores

| Situación | Dónde | Copy |
|---|---|---|
| Falla la lectura de un panel | **`error.tsx` de la ruta.** No hay rama en el panel | El que ya existe |
| Falla revelar el código | **`Alert` inline en la fila del código**, dentro del grupo. No toast | §15 |
| Falla cargar una foto en el diálogo | Dentro del diálogo | `No se pudo mostrar la foto.` / `Vuelve a abrirla.` |
| Sin permiso (`42501` / `PGRST301`) | No aplica en el panel | §10.4 |

**Todo error de base pasa por `mapDbError()` de `lib/domain/errors.ts`. Nunca se renderiza un string crudo de Postgres.**

**Regla heredada y vigente:** un error dice **qué pasó** y **qué hacer**. Sin `¡Ups!`, sin `Algo salió mal`, sin disculpas, sin signos de admiración.

### 11.4 El panel sobre una fila que ya no existe

**Es el caso de un enlace pegado en un chat hace meses.** `/finanzas/pagos` ya lo resuelve, y se copia palabra por palabra:

1. La página servidor busca el identificador **contra lo que ya leyó**, no contra la base.
2. Si no aparece, la variable de apertura se queda en `null` y **el panel simplemente no se renderiza**.
3. **La pantalla se ve normal.** Sin 404, sin toast de error, sin panel vacío, sin redirección.
4. La dirección se queda con el parámetro huérfano. **No se limpia.**

El comentario que justifica esto está en `pagos/page.tsx` y vale igual acá: *"No es una frontera de seguridad, sino de comportamiento: una dirección escrita a mano tiene que enseñar la pantalla, no un error que nadie sabría explicar."*

**Y hay un matiz que la Fase 9 va a hacer visible:** con retención de seis meses, un enlace a un aseo de hace siete meses va a abrir `/operacion` sin panel y sin decir por qué. Hoy es correcto porque los aseos todavía no se borran. Queda en §17.

---

## 12. Continuidad con los dos paneles que ya existen

`SheetDesglosePago.tsx` y `SheetConfirmar.tsx` llevan meses en producción. **Los cuatro nuevos tienen que verse hermanos de esos dos, no primos.**

### 12.1 Los tres overrides obligatorios de la primitiva

La cabecera de `components/ui/sheet.tsx` documenta tres desviaciones del contrato y **solo la segunda está arreglada dentro de la primitiva**. Las otras dos se arreglan en el sitio de uso, en los cuatro paneles, sin excepción:

```tsx
<SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-sheet">
  <SheetHeader className="gap-sm">
    <SheetTitle className="text-heading font-semibold">{nombre}</SheetTitle>
```

| Override | Por qué |
|---|---|
| `data-[side=right]:sm:max-w-sheet` | La base son 384px (`--container-sheet-base`) y D8-6 pide 480. **La cadena de variantes tiene que repetirse EXACTA**: `tailwind-merge` solo considera en conflicto dos clases del mismo grupo con la misma cadena de variantes, así que un `sm:max-w-sheet` suelto **no desplaza** a `data-[side=right]:sm:max-w-sheet-base` y el ancho pasa a depender del orden del CSS |
| `font-semibold` en `SheetTitle` | La primitiva trae `font-medium`, peso 500, que no existe en el sistema. No se arregla dentro porque quince primitivas lo traen y arreglar solo esta dejaría el `Sheet` en 600 con los diálogos de la misma pantalla en 500 |
| `gap-sm` en `SheetHeader` | La primitiva trae `gap-0.5` (2px), por debajo del mínimo declarado de 4px |

**Si alguien regenera `sheet.tsx` con el CLI, los anchos de la clase base se pierden y `npm run ci:arch` lo atrapa.** Está escrito en la cabecera del archivo.

### 12.2 Lo que se copia de `SheetDesglosePago`

| Patrón | Dónde está |
|---|---|
| El cuerpo scrollea, la cabecera no | `<div className="flex flex-col gap-lg overflow-y-auto px-lg pb-lg">` |
| El encabezado de sección va en mayúscula **en el DOM**, no solo con `uppercase` | Su componente `Seccion` |
| El espacio inicial en `SheetDescription` | Para que una lectura plana no concatene título y apoyo. **Se copia, no se reinventa, y el comentario que lo explica se copia con él** o el siguiente que lo vea lo borra por "limpieza" |
| `key={id}` en el panel desde la página | Sin ella, abrir un segundo panel reutiliza el árbol del primero: no vuelve a hacer su entrada y no recoloca el foco. Se vería el nombre nuevo dentro del panel viejo |
| `router.replace(rutaBase, { scroll: false })` al cerrar | D8-8 |

### 12.3 Lo que NO se copia de `SheetConfirmar`

`SheetConfirmar` es un panel de **mutación encadenada**, calibrado para quince aseos seguidos: congela su tanda al montar, lleva barra de progreso, formulario, `useActionState` y pie con botón primario. **Nada de eso aplica a un panel de lectura.** Lo único que se hereda es la trampa de foco y la tecla de escape, que las da Base UI y **no se reimplementan con un `useEffect` de `keydown`**.

### 12.4 El comportamiento de la primitiva no se desactiva, en ninguno de los cuatro

Atrapa el foco, responde a `Escape` y lo devuelve al elemento que estaba enfocado al abrirse, que es el enlace de la fila. **Ninguno de los tres se toca.**

---

## 13. Accesibilidad

Hereda `02-UI-SPEC` §13 y las ampliaciones de las Fases 4 a 7. Lo que esta fase añade:

### 13.1 El panel

- Cada `Sheet` lleva `SheetTitle` **siempre**, aunque el diseño lo esconda: es el nombre accesible del diálogo y Base UI lo exige.
- El cuerpo scrollable lleva `tabindex={0}` **solo cuando de verdad desborda**, o un usuario de teclado no puede recorrerlo. Con contenido que cabe, un contenedor enfocable es una parada muerta en el orden de tabulación.
- **La fila que abre el panel conserva su `aria-current` o equivalente** mientras el panel está abierto, además del `bg-canvas` de §4.3. Color solo no dice cuál está abierta.

### 13.2 Las filas dato-valor

- Cada grupo es una `<section aria-labelledby>` cuyo encabezado es un `<h3>` visualmente en micro 600. **La jerarquía no se salta:** el `SheetTitle` es el `h2` del panel.
- Las filas van en `<dl>` con `<dt>` para la etiqueta y `<dd>` para el valor. Un par etiqueta-valor **es** una lista de definición, y con `<dl>` el lector anuncia el par; con dos `<span>` anuncia dos textos sueltos.
- **Ningún valor se anuncia solo como glifo.** El em dash lleva siempre su `sr-only` con `sin definir` o `no aplica`.
- `7/12` lleva `aria-label="Checklist, 7 de 12 tareas"`. La barra oblicua se lee mal.

### 13.3 El código de acceso

- El botón `Mostrar` es un `<button>` con texto, no un icono solo.
- Al revelarse, el bloque del código va en una región `aria-live="polite"`, y la confirmación de copiado también.
- El código revelado **no** lleva `aria-hidden`, y **no** se marca como contraseña: es un dato que hay que poder dictar.

### 13.4 Las miniaturas

- La tira es una `<ul>`. Cada miniatura es un `<button>` con `aria-label` descriptivo (`Ver la foto de {cuarto}`), nunca un `<div>` con `onClick`.
- La foto dentro del diálogo lleva `alt` descriptivo, **nunca vacío**.
- La casilla de conteo **no es un `<button>`**: es un `<li>` con texto y `aria-label`.

### 13.5 Contraste, color y movimiento

- **La prueba de escala de grises aplica a toda la fase:** ninguna información depende solo del color. El estado del feed lleva icono y palabra; el margen negativo lleva el signo menos; la foto ausente lleva `ImageOff`.
- Tamaño de icono: **14px dentro de filas, 16px en controles y cabeceras**, `strokeWidth` 2. Los que acompañan texto llevan `aria-hidden="true"`; los que van solos, `aria-label`.
- Movimiento sin cambios: solo `color`, `background-color`, `border-color` y `opacity`, 120ms, `ease-out`, vía la utilidad `transicion`. **La entrada y la salida del `Sheet` son de la primitiva y no se tocan**, que es lo que las mantiene idénticas a los dos paneles que ya existen.
- Con `prefers-reduced-motion: reduce`, duración cero en todo **salvo** el giro del `Loader2` del botón `Mostrar`, que es información de estado. Es la única excepción declarada desde la Fase 2.

---

## 14. Inventario de componentes

### 14.1 shadcn oficial

**Se instalan cero.** Las que esta fase usa ya están en `components/ui/`: `sheet` · `dialog` · `button` · `badge` · `separator` · `skeleton` · `alert` · `tooltip`.

Sigue prohibido crear un átomo que solo re-exporte un componente de shadcn.

### 14.2 Organismos nuevos

`app/(admin)/_components/`:

| Componente | Responsabilidad |
|---|---|
| `PanelLectura` | El armazón de §6.1: `Sheet` con los tres overrides, cabecera, cuerpo scrollable y pie opcional. **Los cuatro paneles lo consumen.** Es lo que hace que se vean hermanos y no primos |
| `GrupoDePanel` | Encabezado en versalita más `<dl>` de filas, con su `Separator` |
| `FilaDeDato` | Una fila dato-valor de §6.2, con su tratamiento de ausencia |
| `EsqueletoDePanel` | El `fallback` de `<Suspense>` de §11.1, con la geometría real |

`app/(admin)/apartamentos/_components/`:

| Componente | Responsabilidad |
|---|---|
| `PanelApartamento` | La ficha de §7, con su variante informativa |
| `PanelCalendario` | La vista de §8 |
| `CodigoDeAccesoAdmin` | Los cinco estados de §7.3. **Nombre distinto a `CodigoDeAcceso` del árbol del aseador a propósito**: no comparten copy (el del aseador afirma auditoría y este no puede), no comparten escala tipográfica y no comparten camino a la base |

`app/(admin)/finanzas/_components/`:

| Componente | Responsabilidad |
|---|---|
| `PanelAseadora` | §9 |

`app/(admin)/operacion/_components/`:

| Componente | Responsabilidad |
|---|---|
| `PanelAseo` | §10 |
| `TiraDeEvidencia` | Las seis casillas de §10.3, con sus tres estados de ausencia |
| `DialogoFoto` | El diálogo de §10.3. **Sale de `DialogoRecibo`**, que resuelve lo mismo |

### 14.3 Componentes que se modifican

| Archivo | Cambio |
|---|---|
| `app/(admin)/apartamentos/page.tsx` | Lee `apartamento` y `vista` de `searchParams` y renderiza el panel bajo `<Suspense>` |
| `app/(admin)/apartamentos/_components/TablaApartamentos.tsx` | El `href` de la celda `NOMBRE` pasa a `?apartamento={id}`. **El `::after`, el `z-10` del menú y el `has-[a:focus-visible]` no se tocan** |
| `app/(admin)/apartamentos/_actions.ts` | Una action nueva, `revelarCodigoDeAcceso`, con el orden obligatorio `exigirAdmin()` → Zod → cliente administrativo. Y el destino del `redirect` de guardado pasa a `/apartamentos?apartamento={id}` (§5.4) |
| `app/(admin)/operacion/page.tsx` | Lee `aseo` de `searchParams`. **Conserva `alertas`** |
| `app/(admin)/operacion/_components/FilaAseo.tsx` | El ancla estirada cambia de destino a `?aseo={id}`; el nombre pasa a texto plano. **Solo eso.** §5.3 |
| `app/(admin)/operacion/_components/MenuAseo.tsx` | Un `href`: el de `Ver apartamento`, a `?apartamento={id}` |
| `app/(admin)/finanzas/page.tsx` | Lee `aseadora` de `searchParams`. **Conserva `rango` y `ancla`** |
| `app/(admin)/finanzas/_components/FilaAseadora.tsx` | El `href` pasa a `?aseadora={id}`, conservando `rango` y `ancla` |
| `app/(admin)/finanzas/_components/TablaAseosFinanciera.tsx` | El `href` de `APARTAMENTO` pasa a `/apartamentos?apartamento={id}` |
| `app/(admin)/finanzas/_components/TablaPagosDelPeriodo.tsx` | **Quitar la prop `replace` del `<Link>` de la línea 135.** §5.2 |
| `app/(admin)/finanzas/aseadoras/[id]/` | **Se borra el directorio entero**, con su `page.tsx` y su `loading.tsx` |
| `app/globals.css` | El token de §2.1 |
| `lib/utils.ts` (`cn()`) | **Nada que registrar**, porque `--container-boton-mostrar` se usa como `min-w`. Si aparece un `max-w-*` nuevo durante la ejecución, el registro **no es opcional** |

### 14.4 Lógica de dominio, fuera de los componentes y con tests

| Módulo | Contenido |
|---|---|
| `lib/domain/checkouts.ts` | `proximoCheckout(reservas, hoy)` y `checkoutsDelMes(reservas, mes)`, sobre cadenas `'YYYY-MM-DD'`. **Prohibido `new Date('2026-09-04')`**: se parsea como UTC y en Bogotá renderiza el día anterior |
| `lib/domain/feeds.ts` | Ya existe. `saludDelFeed()` para los tres estados de §8.2 |
| `lib/data/panel-aseo.ts` | La lectura única de §10.4, contra la función definer nueva |

### 14.5 Iconos lucide, lista cerrada

**Nuevos en esta fase (3), verificados uno por uno contra `lucide-react@1.39.0` instalado el 2026-09-15:**

`MapPin` · `CalendarDays` · `Images`

**Reusados de las listas cerradas de fases anteriores:**

`ExternalLink` · `Eye` · `Copy` · `Check` · `KeyRound` · `CalendarCheck` · `CalendarX` · `CircleCheck` · `TriangleAlert` · `ImageOff` · `Receipt` · `Hammer` · `Play` · `Clock` · `UserRoundX` · `Pencil` · `ArrowLeft` · `ChevronRight` · `Loader2` · `X`

**`EyeOff` no entra**, y es una ausencia deliberada: §7.3 no tiene botón `Ocultar`.

Añadir un icono fuera de estas listas es una modificación de este contrato.

### 14.6 Tres trampas del repo que el executor tiene que tener delante

1. **`revalidatePath` cuelga el navegador en las Server Actions de `(admin)`.** Medido en el plan 04-14, causa raíz no identificada, disparador de tamaño del árbol de cliente. Ninguna action de esta fase lo llama.
2. **El guardarraíl de CI trabaja por expresión regular sobre el código, no sobre el AST.** Un comentario que **mencione literalmente** un nombre prohibido hace fallar la revisión aunque el código esté bien. Ya mordió cuatro veces. **Al comentar por qué algo no se usa, se describe el patrón, no se escribe el token.**
3. **`FilaAseo.tsx` tiene tres reglas de comportamiento escritas en su cabecera con sus razones**, y la fila inerte tiene dos más. El cambio de §5.3 es de `href`. Si el diff toca el `className` del `TableRow`, se salió del contrato.

---

## 15. Contrato de copywriting

Español de Colombia, trato de "tú". **Prohibido el voseo.** **Prohibida la raya larga en el copy en español**: se usa coma, paréntesis o punto seguido. Sin signos de admiración, sin `¡Ups!`, sin `Algo salió mal`, sin disculpas.

> **La raya larga sí aparece, y en un solo sitio:** como **glifo de valor ausente** en las filas dato-valor (§6.2). Es un carácter de dato, no puntuación, y va siempre acompañado de su `sr-only`.

### 15.1 Vocabulario fijo

Hereda `02-UI-SPEC` §15 y `07-UI-SPEC` §15.1 completos. Lo que esta fase añade:

| Concepto | Se dice | Nunca se dice |
|---|---|---|
| La superficie | **`panel`**, y solo en documentación. En la interfaz **no se nombra nunca** | `drawer`, `cajón`, `modal`, `ventana` |
| `calendar_reservations.ends_on` | `checkout` | `salida`, `fin de reserva`, `checkout date` |
| `calendar_feeds.last_success_at` | `última sincronización` | `último sync`, `refresco` |
| `property_secrets.codigo_acceso` | `código de acceso` | `clave`, `contraseña`, `PIN`, `código de la cerradura` |
| `cleaning_photos` | `fotos` · `evidencia` | `adjuntos`, `media`, `galería` |
| `expenses` y `damages` juntos | `reportes` | `incidencias`, `novedades` |

### 15.2 Elementos

| Elemento | Copy |
|---|---|
| **Encabezados de grupo, panel de apartamento** | `UBICACIÓN Y ACCESO` · `A CARGO` · `DINERO` · `PRÓXIMO ASEO` |
| **Encabezados de grupo, panel de calendario** | `PRÓXIMO CHECKOUT` · `CHECKOUTS DE {MES}` · `CALENDARIO` |
| **Encabezados de grupo, panel de aseadora** | `AHORA MISMO` · `RESPONSABLE DE ({N})` · `SUPLENTE EN ({N})` · `EN EL PERIODO ABIERTO` |
| **Encabezados de grupo, panel de aseo** | `EJECUCIÓN` · `EVIDENCIA` · `REPORTES` · `DINERO` |
| Etiquetas del panel de apartamento | `Dirección` · `Código de acceso` · `Hora límite` · `Responsable` · `Suplente` · `Contacto externo` · `Tarifa al huésped` · `Pago al aseador` · `Margen` |
| Etiquetas del panel de aseadora | `Lleva ganado` |
| Etiquetas del panel de calendario | `Estado` · `Última sincronización` |
| Etiquetas del panel de aseo | `A cargo` · `Checklist` · `Horas` |
| **CTA primaria (la única de la fase)** | `Editar` |
| CTA secundarias | `Calendario` · `Cambiar calendario` · `Conectar calendario` · `Mostrar` · `Copiar` · `Cerrar` |
| En vuelo | `Abriendo…` |
| Confirmación de copiado | `Copiado.` |
| Volver a la ficha desde el calendario | `aria-label="Volver a la ficha"` |
| Sin responsable, unidad gestionada | `Sin asignar` |
| Sin tarifas, unidad informativa | `Las unidades de gestión externa no llevan tarifas.` |
| Feed sano | `Conectado` |
| Feed con fallos | `{N} fallos seguidos` |
| Feed ausente | `Sin conectar` |
| Próximo checkout, apoyo | `hoy` · `mañana` · `dentro de {N} días` |
| Aseo en curso | `Empezó {09:12} · sin cerrar` |
| Aseo terminado | `Empezó {09:12} · Terminó {10:40}` |
| Los daños no se descuentan | `Los daños no se descuentan del pago.` |
| **Vacío: próximo aseo** | `No tiene ningún aseo programado.` |
| **Vacío: checkouts del mes** | `No hay checkouts en lo que queda del mes.` |
| **Vacío: sin calendario** | `Sin calendario conectado.` / `Este apartamento no va a generar aseos automáticos hasta que conectes su calendario.` / `Conectar calendario` |
| **Vacío: apartamentos de una aseadora** | `No es responsable ni suplente de ningún apartamento.` |
| **Vacío: periodo abierto** | `Todavía no lleva ningún aseo en este periodo.` |
| **Vacío: evidencia, aseo sin terminar** | `Todavía no hay fotos de este aseo.` |
| **Vacío: evidencia, aseo terminado** | `Este aseo terminó sin fotos.` |
| **Vacío: reportes** | `No reportó gastos ni daños.` |
| **Error: revelar el código** | `No se pudo abrir el código.` / `Vuelve a tocar. Si sigue igual, míralo en la ficha de edición.` |
| **Error: foto que no carga** | `No se pudo mostrar la foto.` / `Vuelve a abrirla.` |
| **Ausencia: foto purgada** | `aria-label="Foto no disponible"` |
| **Conteo de fotos** | `+{N}`, con `aria-label="{N} fotos más"` |

### 15.3 Acciones destructivas e irreversibles

**Cero de las dos.** Los cuatro paneles son de lectura: nada se borra, nada se revoca, nada se cancela, nada queda congelado.

**Por lo tanto: ningún botón `variant="destructive"` y ningún `AlertDialog` en toda la fase.** Si aparece uno en ejecución, algo se salió del contrato.

**La única action de la fase es `revelarCodigoDeAcceso`, y es de lectura.** No muta nada, no llama a ninguna revalidación y no necesita confirmación: lo que revela es un dato que el admin ya puede ver abriendo el formulario de edición. Lo que cambia es que **no viaja al DOM hasta que alguien lo pide**.

---

## 16. Registry Safety

| Registry | Bloques usados | Safety Gate |
|---|---|---|
| shadcn oficial (`@shadcn`) | **ninguno nuevo.** Las 8 primitivas que esta fase consume ya están en `components/ui/` desde fases anteriores | no aplica: **no se ejecuta el CLI en esta fase** |
| Terceros | **ninguno** | no aplica. `components.json` tiene `"registries": {}`, verificado el 2026-09-15 |

**No se declara ningún registry de terceros, así que la compuerta de vetting (`shadcn view` más escaneo de patrones) no se ejecuta porque no hay nada que vetar.**

Y como esta fase **no corre `npx shadcn add`**, tampoco se dispara la compuerta de ancho por primitiva nueva: ninguna clase base con nombre de talla entra al repo por esa vía. La regla de §2.2 sigue aplicando al único token de `--container-*` que esta fase sí declara.

**Si en ejecución alguien quiere añadir un bloque de un registry externo, este documento tiene que reabrirse y correr la compuerta antes.**

---

## 17. Deuda declarada de este contrato

Se documenta acá para que el `gsd-ui-auditor` no lo reporte como hallazgo nuevo.

1. **Abrir y cerrar paneles en cadena acumula entradas de historial idénticas.** Ocho aperturas dejan ocho entradas a la ruta base, así que salir de la sección con el botón atrás cuesta ocho pulsaciones. Es el precio de cumplir el criterio 3 sin romper D8-8 (§5.2). La alternativa limpia es cerrar con `router.back()`, que a cambio se rompe cuando se entró por URL directa: se descartó por eso.
2. **Un enlace a un aseo ya borrado abre la lista sin panel y sin decir por qué.** Es el comportamiento que `/finanzas/pagos` ya tiene y que D8-8 manda copiar. Hoy es inofensivo porque nada se borra. **Con la retención de seis meses de la Fase 9 deja de serlo**, y ese es el momento de reabrirlo, no ahora.
3. **La ficha de aseadora pierde tres bloques y nadie va a saber a dónde se fueron.** Los tres son alcanzables (§0.1, conflicto B), pero el panel no los enlaza: enlazarlos sacaría del panel, que es lo que D8-2 prohíbe. Un admin que hoy usa `/finanzas/aseadoras/[id]` para ver los gastos de alguien va a tener que aprender la ruta nueva sin que nada se la enseñe.
4. **El panel de calendario no navega entre meses.** D8-4 lo excluye explícitamente. Consecuencia: los checkouts que caen los primeros días del mes siguiente no se ven desde acá aunque sean los próximos.
5. **Desde el admin no hay forma de ver más de seis fotos de un aseo.** Se ven cinco más un conteo. La mejora barata es que la casilla de conteo abra el mismo `DialogoFoto` con anterior y siguiente, que son unas veinte líneas. No se hace ahora porque D8-4 cortó el checklist tarea por tarea y recorrer doce fotos de una en una es eso con otro nombre.
6. **El código de acceso del admin no queda auditado.** El camino del aseador (`reveal_access_code()`) sí lo hace, y el del admin no, porque va por cliente administrativo. Revelarlo con un gesto reduce la exposición pero **no crea bitácora**. Si algún día hace falta, es un RPC nuevo, no un cambio de UI, y entonces sí se podría escribir la línea de transparencia que §7.3 hoy prohíbe por falsa.
7. **El piso de alto de viewport de 700px se declara en esta fase y no estaba antes.** Los cuatro paneles caben con holgura medida, pero **ninguna pantalla anterior se comprobó contra ese piso**. Si alguna no cabe, es un hallazgo de esta fase que no se arregla en esta fase.
8. **Ningún panel se refresca solo.** El grupo `AHORA MISMO` de la aseadora y el `EJECUCIÓN` del aseo son datos de cuando se abrió. `/operacion` tiene Realtime; estos paneles no. **A diferencia de `07-UI-SPEC` §8.4, acá no se escribe la línea `Al momento de abrir esta página.`**: en un panel que se abre y se cierra en diez segundos, fecharlo ocupa una línea para decir algo que el gesto ya dice. Si el admin empieza a dejar el panel abierto, se reabre.
9. **Sin modo oscuro**, heredado desde la Fase 2.
10. **El coral sigue siendo placeholder** y `--primary` con `--destructive` siguen siendo los dos rojos, con su mitigación permanente. Heredado de `02-UI-SPEC` §17. En esta fase apenas roza: hay un solo relleno primario y ningún destructivo.

---

## Checker Sign-Off

- [ ] Dimensión 1 Copywriting: PASS
- [ ] Dimensión 2 Visuals: PASS
- [ ] Dimensión 3 Color: PASS
- [ ] Dimensión 4 Typography: PASS
- [ ] Dimensión 5 Spacing: PASS
- [ ] Dimensión 6 Registry Safety: PASS

**Aprobación:** pending
