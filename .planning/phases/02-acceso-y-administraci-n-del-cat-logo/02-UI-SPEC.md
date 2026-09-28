---
phase: 2
slug: acceso-y-administraci-n-del-cat-logo
status: draft
shadcn_initialized: false
preset: none (se instala en esta fase con `-b base`, sin preset)
created: 2026-09-01
---

# Fase 2 — Contrato de diseño de UI

> Contrato visual y de interacción. Lo produce `gsd-ui-researcher`, lo verifica `gsd-ui-checker`, lo consumen `gsd-planner` y `gsd-executor`.
> Idioma de la interfaz: **español**. Código, tokens, rutas y REQ-IDs quedan como están.

**REQ-IDs cubiertos:** PLAT-01, PLAT-02, PLAT-04, PLAT-07, APTO-01…APTO-12, ASEADOR-01, ASEADOR-02, ASEADOR-03.

---

## 0. Lo que esta fase renderiza de verdad

No es un CRUD genérico. Es el panel con el que una persona monta 39 unidades reales y después lo abre varias veces al día para decidir rápido.

| Hecho | Consecuencia de diseño |
|---|---|
| 39 apartamentos ya sembrados, todos con placeholders | El "estado vacío" del día uno **no** es una tabla sin filas: es una tabla llena de datos falsos. Ver §9.1 (banner de montaje). |
| 34 gestionadas + 5 informativas | El estado `informativa` no es un error ni un pendiente. No entra al conteo de "faltan por completar". |
| El formulario tiene ~12 campos con validación cruzada ya en la base | La UI expone la regla **antes** del submit, con lista de faltantes en vivo. Ver §8.2. |
| Un apartamento nace inactivo (`is_active default false`) | Existe un contrato explícito borrador → activo. "Guardar" y "Guardar y activar" son dos botones distintos. |
| APTO-12 valida el feed en vivo | 7 estados de la pantalla de calendario, con copy distinto por modo de falla. Ver §10. |
| Dinero = COP enteros (`bigint`) | Sin decimales nunca, `$ 120.000`, alineado a la derecha, `tabular-nums`. |
| Las cuentas de aseador las crea el admin | Sin "crear cuenta" en el login. La desactivación revoca acceso al instante y su diálogo muestra consecuencias calculadas, no genéricas. |
| `(cleaner)` es un stub de ruteo | Una pantalla, una columna, un botón. **No se diseña ni se construye la PWA en esta fase.** |

---

## 1. Design System

| Propiedad | Valor |
|---|---|
| Tool | `shadcn` CLI **4.19.1** (verificado en npm el 2026-09-01) |
| Preset | ninguno. Se hace `init -b base` y se aplica encima la capa de tokens de §4.3 |
| Component library | **Base UI** (`@base-ui/react` 1.7.0). No Radix: desde julio 2026 Base UI es el default de shadcn |
| Icon library | `lucide-react` (pin de `research/STACK.md`: `1.37.0`; en npm hay `1.38.0`. Pinear lo que instale el CLI y anotar el drift) |
| Font | **Geist Sans** + **Geist Mono** vía `next/font/google`, ya presentes en `app/layout.tsx`. Self-hosted por `next/font`, coste cero, compatible con free tier |
| Estilos | Tailwind CSS **v4.3.3**, config en CSS con `@theme` / `@theme inline`. **No existe `tailwind.config.js` y no se crea.** |
| Tema | **Solo claro.** No se construye modo oscuro en esta fase (ver §4.5) |
| Toasts | `sonner` 2.0.8 |
| Formularios | `react-hook-form` 7.87.0 + `@hookform/resolvers` 5.9.1 + `zod` 4.5.4, **solo** en el formulario largo de apartamento. El resto va con Server Action + `useActionState` |

### 1.1 Instalación de shadcn — orden obligatorio

`shadcn init` **reescribe `app/globals.css` completo** (~144 líneas) y toca `app/layout.tsx`. El repo hoy tiene un `globals.css` de `create-next-app` con un bloque `@media (prefers-color-scheme: dark)` que hay que perder, así que la reescritura es deseable, pero tiene que quedar aislada en su propio commit para que el diff sea revisable.

```bash
# 1. commit limpio antes de correr nada
# 2. init. -y es default true. NO existe --base-color en 4.19.x (se retiró; el equivalente vive en `shadcn migrate base-color`)
npx shadcn@4.19.1 init -b base --css-variables --no-monorepo --no-rtl --pointer
# 3. commit "chore(ui): shadcn init" SIN nada más
# 4. componentes
npx shadcn@4.19.1 add alert alert-dialog badge button card checkbox command dialog \
  dropdown-menu form input label popover progress select separator skeleton \
  sonner switch table textarea tooltip
# 5. commit "chore(ui): componentes base"
# 6. aplicar la capa de tokens de §4.3 -> commit "feat(ui): tokens VivaGuest"
```

Notas para el executor:
- `--pointer` activa `cursor: pointer` en botones. Es una herramienta interna de escritorio operada con mouse: se quiere.
- `-b base` instala `@base-ui/react`. **Verificar la versión que quede en `package.json` y pinearla exacta**, igual que el resto del stack.
- `@hookform/resolvers` 5.9.1 con Zod 4: el import es `import { zodResolver } from '@hookform/resolvers/zod'`. Si la resolución de tipos falla, es el punto a revisar primero, no el schema.
- Después del init, arreglar dos bugs heredados de `create-next-app` que hoy están en el repo: `app/layout.tsx` tiene `<html lang="en">` (debe ser `"es"`) y `metadata.title = "Create Next App"`.

---

## 2. Escala de espaciado

Todos múltiplos de 4. Se declaran en `@theme` y **se usan por token, nunca en píxeles arbitrarios**.

| Token | Valor | Uso |
|---|---|---|
| `xs` | 4px | Separación icono↔texto, padding inline de badges |
| `sm` | 8px | Padding vertical de celda de tabla, gap dentro de un grupo de botones |
| `md` | 12px | Padding horizontal de celda de tabla, gap entre controles de la toolbar |
| `lg` | 16px | Espaciado por defecto entre campos de formulario, padding de card |
| `xl` | 24px | Padding de página, separación entre secciones del formulario |
| `2xl` | 32px | Separación entre bloques mayores de una pantalla |
| `3xl` | 48px | Espaciado de nivel de página (cabecera ↔ contenido en pantallas vacías) |

**Excepciones declaradas:**

| Excepción | Valor | Razón |
|---|---|---|
| Alto de fila de tabla | **40px** | Densidad. 39 filas tienen que caber sin scroll en 1080p. Es múltiplo de 4 |
| Alto de fila de encabezado | **32px** | Menos peso visual que las filas de datos |
| Alto de la barra superior | **56px** | Estándar de barra de navegación; múltiplo de 4 |
| Barra de acciones fija del formulario | **64px** | Alojar dos botones de 36px con 14px de aire |
| Objetivo de toque en `(cleaner)` | **44px mínimo** | Umbral de Apple HIG. Aplica **solo** dentro de `app/(cleaner)/` |
| Botones de icono solo, en tabla | 28px visual / **40px de área clicable** | El área se logra con padding, no con tamaño visual, para no romper la fila de 40px |

Prohibido: `p-[13px]`, `gap-[7px]` y cualquier valor arbitrario de espaciado en un componente. Si hace falta un valor nuevo, se añade al `@theme`.

---

## 3. Tipografía

Exactamente **4 tamaños** y **2 pesos**. No se añaden más sin modificar este documento.

| Rol | Tamaño | Peso | Line height | Dónde |
|---|---|---|---|---|
| **Display** | 24px (1.5rem) | 600 | 1.2 | Título de página (`Apartamentos`, `Aseadores`), y el número grande del resultado de validación del feed |
| **Heading** | 16px (1rem) | 600 | 1.3 | Títulos de sección del formulario, título de diálogo, nombre del apartamento en su ficha, wordmark de la barra |
| **Body** | 14px (0.875rem) | 400 | 1.5 | Todo el texto corriente: celdas de tabla, inputs, labels, botones, links de navegación |
| **Micro** | 12px (0.75rem) | 400 · 600 | 1.4 | Texto de ayuda y contadores (400). Encabezados de columna en mayúsculas y etiqueta de estado (600) |

**Pesos:** `400` regular y `600` semibold. Nada de 500, 700 ni 800. Geist Sans se carga solo con esos dos.

Reglas ligadas:
- Encabezados de columna: 12px / 600 / `uppercase` / `letter-spacing: 0.04em` / color `--muted-foreground`.
- El nombre del apartamento dentro de la fila va en **14px / 600** (es el ancla de escaneo). El resto de la fila en 400.
- **Cifras:** toda celda de dinero, hora y conteo lleva `tabular-nums` (Geist Sans lo soporta). Sin esto, 39 filas de montos no se alinean y la columna es ilegible. No se usa Geist Mono para dinero.
- **Geist Mono** se usa en un solo sitio: mostrar la URL iCal enmascarada (§10.4). En ningún otro lado.
- Texto en 12px nunca lleva información que no esté también en otro lado o en su `title`/`aria-label`.

---


> ### ACTUALIZACIÓN 2026-09-01 — identidad real recuperada
>
> Se encontró el sitio de VivaGuest de 2018 (web.archive.org, snapshot 2018-08-22) y de ahí
> sale la identidad real. **Esto reemplaza el placeholder** y corrige una de las cuatro razones
> que esta sección daba.
>
> | Token | Valor | Contraste vs blanco | Uso |
> |---|---|---|---|
> | `--brand-identity` | `#ff7469` | 2.64:1 | Coral de marca 2018. **Logo y áreas grandes. Nunca texto ni relleno de control.** |
> | `--brand` | `#d1382c` | 4.87:1 | El mismo tono (hue 4.4) oscurecido a AA. Botones, enlaces, foco |
> | `--brand-hover` | `#bc3228` | 5.79:1 | Estado hover |
> | `--brand-gold` | `#efc14e` | 1.69:1 | Acento dorado 2018. Decorativo y fondos, nunca texto sobre blanco |
>
> **La razón de "marca registrada de Airbnb" queda ANULADA.** El coral de VivaGuest está a
> hue 4.4 y el de Airbnb a 358.2: casi el mismo tono, pero VivaGuest llegó ahí por su cuenta
> en 2018. No hay nada que reclamar. Las otras tres razones siguen en pie, y la de contraste
> empeora: el coral propio da 2.64:1, peor que los 3.05:1 de Airbnb.
>
> **Tipografía: Poppins es la de marca**, cargada con pesos 300/400/500/600/700 vía `next/font`,
> expuesta como `--font-brand` y `--font-heading`.
>
> **Poppins NO se usa para datos.** Los densos (tabla de 39 unidades, formularios, dinero) se
> quedan en Geist (`--font-sans`), que trae numerales tabulares y alinea las columnas de tarifas.
> Poppins es geométrica y ancha, pensada para marketing: en tabla cuesta ancho horizontal y
> pierde legibilidad a 12-14px. Poppins vive en logotipo, pantalla de login y títulos.
>
> Otros valores de 2018 disponibles si hacen falta: texto `#4d4d4d` (8.45:1), fondo `#f5f5f5`,
> borde `#ebebeb`. Logos: `vivaguest-logo-rojo.svg` y `vivaguest-logo-blanco.svg`.

## 4. Color

### 4.1 Advertencia sobre la marca — el coral es un PLACEHOLDER

VivaGuest todavía no tiene identidad. La decisión del usuario fue arrancar con el coral de Airbnb y ajustar después. Se acata, **con tres reservas que quedan escritas aquí para que nadie las reabra por accidente**:

1. **Es marca registrada de Airbnb, y VivaGuest se integra *con* Airbnb.** Enviárselo a un cliente puede leerse como afiliación oficial. Es un placeholder de desarrollo, no la marca.
2. **El coral literal `#FF5A5F` no pasa contraste en ningún uso de texto.** Medido: blanco sobre `#FF5A5F` da **3.05:1**, y `#FF5A5F` sobre blanco da **3.05:1**. WCAG AA pide 4.5:1 para texto normal. Un botón primario de 14px con ese color es inaccesible. **Por eso lo que se implementa es una versión oscurecida, `#D7373F` (4.66:1 con blanco), y el `#FF5A5F` literal no se renderiza en ningún píxel de la app.**
3. **Un coral de croma alto es mal color de trabajo para una tabla densa.** Va como acento único (acción primaria, pestaña activa, anillo de foco). **Nunca** como color de estado ni como tinte de superficie.

### 4.2 Paleta (medida, no estimada)

Todos los ratios calculados con la fórmula WCAG 2.1 contra la superficie donde el token se usa.

| Rol | Hex | OKLCH | Contraste | Uso |
|---|---|---|---|---|
| **Dominante (60%)** `--background` | `#FFFFFF` | `oklch(1 0 0)` | — | Superficie de tabla, de card y de formulario. Es donde vive el trabajo |
| **Secundario (30%)** `--canvas` | `#F6F7F8` | `oklch(0.9757 0.0017 247.84)` | — | Lienzo de página detrás de las cards, fila de encabezado de tabla, hover de fila |
| `--muted` | `#F1F3F5` | `oklch(0.9632 0.0034 247.86)` | — | Fondo de badge neutro, avatar de iniciales, skeleton |
| **Acento (10%)** `--brand` / `--primary` | `#D7373F` | `oklch(0.5837 0.1961 23.31)` | **4.66:1** con blanco | Ver lista cerrada en §4.4 |
| `--brand-hover` | `#B92C33` | `oklch(0.5197 0.1771 23.57)` | 6.05:1 con blanco | Hover y active del botón primario |
| **Destructivo** `--destructive` | `#9F1239` | `oklch(0.4546 0.1713 13.70)` | **8.02:1** con blanco | Solo acciones que revocan o borran. Ver §4.6 |
| `--foreground` | `#111827` | `oklch(0.2101 0.0318 264.66)` | 17.74:1 / 16.54:1 | Todo el texto principal |
| `--muted-foreground` | `#5C6470` | `oklch(0.5006 0.0216 258.37)` | 5.98:1 / 5.57:1 | Texto secundario, encabezados de columna, valores vacíos |
| `--border` | `#E3E6E9` | `oklch(0.9235 0.0052 247.88)` | decorativo | Separadores de fila, bordes de card |
| `--input` | `#858D9A` | `oklch(0.6411 0.0216 260.16)` | **3.35:1** con blanco | Borde de campos de formulario. Más oscuro que `--border` **a propósito**: WCAG 1.4.11 exige 3:1 para el límite de un control, y `--border` da 1.25:1 |
| `--status-ok` | `#15803D` | `oklch(0.5273 0.1371 150.07)` | 5.02:1 | Estado Activa |
| `--status-warn` | `#B45309` | `oklch(0.5553 0.1455 49.00)` | 5.02:1 | Estado Incompleta |
| `--status-idle` | `#475569` | `oklch(0.4455 0.0374 257.28)` | 7.58:1 | Estado Inactiva |
| `--status-info` | `#6B7280` | `oklch(0.5510 0.0234 264.36)` | 4.83:1 | Estado Informativa |
| `--surface-ok` | `#ECFDF3` | `oklch(0.9788 0.0221 160.24)` | texto ok a 4.76:1 | Fondo del panel de éxito de APTO-12 |
| `--surface-warn` | `#FFF8EB` | `oklch(0.9810 0.0187 83.06)` | texto warn a 4.75:1 | Fondo del panel de advertencia |
| `--surface-destructive` | `#FEF2F3` | `oklch(0.9708 0.0130 11.54)` | texto destructivo a 7.33:1 | Fondo del panel de error |

`--radius: 0.375rem` (6px). El default de shadcn es 0.625rem: demasiado redondo para una tabla densa.

### 4.3 Capa de tokens — el swap de marca es de DOS líneas

Esta es la condición dura del brief. Se implementa así, **después** del `init`, dentro de `app/globals.css`:

```css
:root {
  /* ─────────────────────────────────────────────────────────────
     MARCA — PLACEHOLDER. Coral de Airbnb oscurecido a AA.
     Al definir la identidad real de VivaGuest se cambian ESTAS DOS
     LÍNEAS y nada más. Ningún componente conoce el valor literal.
     ───────────────────────────────────────────────────────────── */
  --brand:       oklch(0.5837 0.1961 23.31);  /* #D7373F */
  --brand-hover: oklch(0.5197 0.1771 23.57);  /* #B92C33 */
  --brand-foreground: oklch(1 0 0);

  /* Todo lo que es "de marca" deriva. Nunca al revés. */
  --primary:            var(--brand);
  --primary-foreground: var(--brand-foreground);
  --ring:               var(--brand);
  --sidebar-primary:    var(--brand);
  --sidebar-ring:       var(--brand);

  /* Estados operativos: NO son de marca y NO cambian con el rebrand. */
  --status-ok:   oklch(0.5273 0.1371 150.07);
  --status-warn: oklch(0.5553 0.1455 49.00);
  --status-idle: oklch(0.4455 0.0374 257.28);
  --status-info: oklch(0.5510 0.0234 264.36);
  --surface-ok:   oklch(0.9788 0.0221 160.24);
  --surface-warn: oklch(0.9810 0.0187 83.06);
  --surface-destructive: oklch(0.9708 0.0130 11.54);

  --input: oklch(0.6411 0.0216 260.16);
  --radius: 0.375rem;
}

@theme inline {
  --color-status-ok:   var(--status-ok);
  --color-status-warn: var(--status-warn);
  --color-status-idle: var(--status-idle);
  --color-status-info: var(--status-info);
  --color-surface-ok:   var(--surface-ok);
  --color-surface-warn: var(--surface-warn);
  --color-surface-destructive: var(--surface-destructive);
}
```

> **DEROGADO 2026-09-28 (solo las dos líneas del anillo).** El bloque de arriba se
> conserva como registro, pero las líneas `--ring: var(--brand);` y
> `--sidebar-ring: var(--brand);` ya no describen `app/globals.css`: el anillo de foco
> se mudó al bloque de estados operativos y deriva de `--status-progress`. Motivo
> medido: el anillo salía de `--brand` (#d1382c) y el borde de error sale de
> `--destructive` (#9f1239), **1.65:1 entre sí** (sus anillos, 1.53:1), o sea un solo
> objeto a la vista. El resto del bloque sigue vigente y el swap de marca sigue siendo
> de esas mismas líneas de `--brand`.

**Regla verificable en CI (grep, igual que el guardarraíl de `service_role`):** ningún archivo bajo `app/` o `components/` puede contener un hex literal ni una clase arbitraria de color (`bg-[#`, `text-[#`, `border-[#`, `#FF5A5F`, `#D7373F`). Si el grep encuentra uno, el swap de marca ya dejó de ser de dos líneas.

### 4.4 Lista cerrada de dónde se usa el acento

`--primary` se usa **solo** en:

1. Botón primario de cada pantalla (uno por pantalla, máximo).
2. Subrayado de 2px del link activo de la barra superior.
3. Anillo de foco (`--ring`) de cualquier control.
4. Barra de progreso del banner de montaje (§9.1).
5. Checkbox y switch en estado marcado.

> **DEROGADO 2026-09-28 — el punto 3 sale de esta lista.** El anillo de foco ya no es
> `--primary`: `--ring` deriva de `--status-progress` (azul) desde el rescate
> `260928-lqd`. La razón está medida en el navegador el 2026-09-22: el anillo de marca
> (#d1382c) y el borde de error (`--destructive`, #9f1239) dan **1.65:1 entre sí**, y
> por debajo de 3:1 un campo enfocado y un campo con error son el mismo objeto a la
> vista. El punto se conserva numerado para no mover la numeración de los otros cuatro
> ni las referencias que apuntan a ellos; lo que cambia es que **el acento son cuatro
> usos, no cinco**. Ver la nota de §4.3 y el bloque `FOCO — 2026-09-28` de
> `app/globals.css`.

**Prohibido explícitamente:** como color de estado, como tinte de fila, en badges, en iconos de tabla, en el wordmark, en links de texto, en encabezados. El wordmark "VivaGuest" va en `--foreground`: pintarlo del color placeholder es exactamente lo que haría doloroso el rebrand.

### 4.5 Modo oscuro

No se construye. El bloque `.dark` que genere `shadcn init` **se deja tal cual, sin tocar y sin usar**. `<html lang="es">` sin clase `dark`, sin `ThemeProvider`, sin toggle.

Lo que sí es obligatorio: **eliminar el `@media (prefers-color-scheme: dark)` que hoy tiene `app/globals.css`**. Si sobrevive al init, un admin con el sistema en oscuro ve la app a medio tematizar. Es un bug latente hoy mismo en el repo.

### 4.6 El choque coral ↔ destructivo, y cómo se resuelve

`--primary` es rojo y `--destructive` es rojo. Su contraste entre sí es 1.72:1: a la carrera no se distinguen por luminancia. Esta es la **cuarta** razón por la que el coral es placeholder.

Mitigación, obligatoria mientras el placeholder siga vivo:

- **Nunca un botón primario relleno y un botón destructivo relleno adyacentes.** En todo `AlertDialog` destructivo, "Cancelar" es `variant="outline"` y solo el destructivo va relleno.
- Los disparadores destructivos en la tabla y en los menús van como **texto** `--destructive` sobre fondo neutro, nunca rellenos.
- Todo destructivo lleva icono (`Power`, `Trash2`) además del color.

---

## 5. Vocabulario de estado — nunca color solo

Cuatro estados, derivados de `properties` sin ninguna columna nueva:

| Estado | Derivación desde la fila | Icono lucide | Etiqueta | Color |
|---|---|---|---|---|
| **Activa** | `gestion_vivaguest AND is_active` | `CircleCheck` | `Activa` | `--status-ok` |
| **Incompleta** | `gestion_vivaguest AND NOT is_active AND (tarifa_huesped IS NULL OR pago_aseador IS NULL OR responsable_id IS NULL)` | `TriangleAlert` | `Incompleta` | `--status-warn` |
| **Inactiva** | `gestion_vivaguest AND NOT is_active` y todo lo anterior completo | `CircleMinus` | `Inactiva` | `--status-idle` |
| **Informativa** | `NOT gestion_vivaguest` | `CircleDashed` | `Informativa` | `--status-info` |

Reglas:

- **Nunca color solo.** Cada estado es **icono de forma distinta + etiqueta de texto**, los tres canales a la vez. Con 39 filas, una columna de puntos de colores es ilegible para un admin daltónico y lenta para cualquiera.
- La columna `Estado` mide 112px: icono 14px + etiqueta 12px/600. Cabe de sobra en 1440px.
- **Informativa no es un pendiente.** No cuenta en el banner de montaje, no ofrece "Activar", no muestra tarifas ni responsable (muestra `contacto_externo`), y su fila no lleva menú de acciones de activación. Es coherente con `props_assignees_only_when_managed` y con DASH-07.
- La derivación vive en **una sola función**, `estadoDeApartamento(p: Tables<'properties'>)` en `lib/domain/properties.ts`, y devuelve un discriminante tipado. Duplicar el `if` en dos componentes es cómo se desincroniza la UI de los CHECK.
- Bajo la tabla, una leyenda de una línea en 12px `--muted-foreground` con los cuatro pares icono+etiqueta.

---

## 6. Shell y layout

### 6.1 Barra superior (`app/(admin)/layout.tsx`)

Alto 56px, `position: sticky; top: 0`, fondo `--background`, `border-bottom: 1px solid --border`, `z-index: 40`.

```
┌──────────────────────────────────────────────────────────────┐
│ VivaGuest   Apartamentos  Aseadores                    JO ▾  │
└──────────────────────────────────────────────────────────────┘
```

- **Wordmark:** `VivaGuest`, 16px/600, `--foreground`, link a `/apartamentos`. Sin logo, sin color de marca.
- **Links:** 14px/400, alto 40px, padding-x 12px, gap 4px. Activo: `--foreground` a 600, con `border-bottom: 2px solid --primary` pegado al borde inferior de la barra. Inactivo: `--muted-foreground`, hover `--foreground`. `aria-current="page"` en el activo.
- Solo dos links en esta fase: **Apartamentos**, **Aseadores**. La Fase 4 añade Día / Sin confirmar / Alertas. **No dejar links muertos ni deshabilitados** de fases futuras.
- **Menú de usuario:** iniciales en círculo de 28px con fondo `--muted` y texto 12px/600, nombre 14px, `ChevronDown` 14px. `DropdownMenu` con un único ítem: `Cerrar sesión` (icono `LogOut`, `--destructive` como texto).

### 6.2 Contenido

- Contenedor: `max-width: 1440px`, centrado, `padding-inline: 24px`, `padding-top: 24px`, `padding-bottom: 48px`.
- Cabecera de página: título Display 24/600 a la izquierda, acción primaria a la derecha, en la misma línea, con 24px por debajo.
- Toolbar de filtros: fila propia, gap 12px, 16px por debajo. Buscador 320px con icono `Search` de 16px a la izquierda dentro del campo; `Select` de cluster de 200px.
- Tabla dentro de una card: fondo `--background`, `border: 1px solid --border`, `border-radius: 6px`, `overflow: hidden`.

### 6.3 Responsive

Herramienta de escritorio. **Viewport de referencia 1440px, mínimo soportado 1280px.**

- Entre 1024px y 1280px: la tabla hace scroll horizontal dentro de su card, con la columna `Nombre` fija a la izquierda (`position: sticky; left: 0`).
- Por debajo de 1024px: mismo comportamiento. **No se construye una vista de tarjetas apiladas para móvil en `(admin)`.** Nadie pidió administrar 39 apartamentos desde un teléfono, y construirlo duplica cada pantalla.
- `app/(cleaner)/` sí es mobile-first, mínimo 360px, una columna. Es el stub de §12.

### 6.4 Movimiento

- Transiciones solo de `color`, `background-color`, `border-color` y `opacity`. Duración 120ms, `ease-out`.
- Sin animaciones de layout, sin `transition: all`.
- `@media (prefers-reduced-motion: reduce)`: duración 0 para todo, **salvo** el giro del `Loader2`, que es información de estado, no decoración.

---

## 7. Tabla de apartamentos (APTO-11)

### 7.1 Columnas a 1440px

| # | Columna | Ancho | Alineación | Contenido |
|---|---|---|---|---|
| 1 | `ESTADO` | 112px | izquierda | Icono 14px + etiqueta 12px/600 (§5) |
| 2 | `NOMBRE` | flexible, min 200px | izquierda | 14px/600, es el `<a>` al detalle |
| 3 | `CLUSTER` | 140px | izquierda | 14px/400 `--muted-foreground`. **Texto plano, sin badge**: 39 badges es ruido |
| 4 | `TARIFA` | 120px | derecha | `$ 120.000`, `tabular-nums`. Vacío → `—` |
| 5 | `PAGO` | 120px | derecha | idem |
| 6 | `RESPONSABLE` | 168px | izquierda | Nombre del aseador. En Informativa: `contacto_externo` truncado con `title` completo |
| 7 | `CALENDARIO` | 96px | centro | `CalendarCheck` `--status-ok` conectado / `CalendarX` `--status-warn` sin conectar, con `aria-label` |
| 8 | — | 48px | derecha | `MoreHorizontal`, menú de acciones |

### 7.2 Comportamiento

- Fila: 40px, `border-bottom: 1px solid --border`. Hover: fondo `--canvas`. **Sin zebra striping**: zebra + iconos de color = ruido.
- Encabezado: 32px, `position: sticky; top: 56px`, fondo `--canvas`, texto 12px/600 `uppercase` `--muted-foreground`.
- **La fila no es un `<div>` clicable.** El `<a>` vive en la celda `NOMBRE` y estira su área con `::after { position: absolute; inset: 0 }`; el menú `⋯` va por encima con `z-index` y `stopPropagation`. Así el teclado llega a un link real y no a una fila con `role="button"` falsa. El estilo de foco de la fila se hace con `has-[a:focus-visible]:bg-canvas` más el anillo en el propio link.
- **Sin paginación y sin virtualización.** 39 filas es un solo render de servidor.
- Buscador y filtro de cluster: **filtrado en cliente** sobre las filas ya cargadas. Un round-trip por tecla para 39 filas es peor UX y más carga. El buscador matchea `nombre`, `cluster` y nombre del responsable, insensible a mayúsculas **y a tildes**: `s.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase()`. Escribir `bogota` tiene que encontrar `Bogotá 1`, o el buscador no sirve para este catálogo.
- Pie de tabla, 12px `--muted-foreground`: `39 unidades · 34 gestionadas · 5 informativas`. Con filtro activo: `Mostrando 12 de 39`.

### 7.3 Menú de acciones (`⋯`)

| Ítem | Visible cuando | Estilo |
|---|---|---|
| `Editar` | siempre | normal, icono `Pencil` |
| `Conectar calendario` / `Cambiar calendario` | siempre | normal, icono `CalendarCheck` |
| `Activar` | gestionada, inactiva y completa | normal, icono `Power` |
| `Desactivar` | gestionada y activa | **texto `--destructive`**, icono `Power`, separador arriba |

---

## 8. Formulario de apartamento

### 8.1 Estructura — página única, cinco secciones, sin wizard

**Decisión (discreción de Claude), con su razón:** el admin va a cargar 39 unidades de una sentada. Un wizard multiplica los clics por 39 y, peor, impide volver a tocar un campo suelto tres semanas después. Además pelea con el modelo borrador → activo, que necesita ver el formulario entero para saber qué falta. Página única, `<section>` con heading 16/600 y una regla de 1px `--border` encima, 24px entre secciones.

| # | Sección | Campos | Notas |
|---|---|---|---|
| 1 | **Identificación** | `nombre`*, `cluster`*, `direccion`, `maps_url` | `cluster` es un `Command`/combobox con los 8 clusters existentes más entrada libre (`cluster` es `text not null`, ni enum ni tabla). `maps_url`: campo con botón `ExternalLink` que abre en pestaña nueva cuando hay valor |
| 2 | **Gestión** | `gestion_vivaguest` (Switch) y, condicional, `responsable_id`* + `suplente_id` **o** `contacto_externo`* | Ver §8.3 |
| 3 | **Dinero** | `tarifa_huesped`, `pago_aseador`, `fee_discriminado` (Switch) | **Sección oculta completa cuando `gestion_vivaguest = false`**, reemplazada por una línea 14px `--muted-foreground`: "Las unidades de gestión externa no llevan tarifas." `fee_discriminado` con helper: "Solo informativo. No entra en ningún cálculo." |
| 4 | **Operación** | `hora_limite` (default `11:30`), `tipo_cerradura`, `codigo_acceso`, `notas_acceso` | Los tres últimos van a `property_secrets` con `service_role`. Aviso 12px bajo `codigo_acceso`: "Solo lo ve el aseador asignado a un aseo vigente, y cada consulta queda registrada." |
| 5 | **Cuartos y faltantes** | lista editable de `property_rooms` (tipo + etiqueta) y `missing_item_catalog` del apartamento | Filas con `Plus` para añadir y `X` para quitar. `property_rooms_etiqueta_uniq` es por apartamento: validar duplicado en cliente antes de enviar |

**El calendario NO va en este formulario.** Vive en su propia pantalla, `/apartamentos/[id]/calendario` (§10). Razón dura: validar el feed es una llamada de red asíncrona con siete resultados posibles; meterla dentro de un submit obligaría a guardar todo lo demás para poder probar la URL, y a manejar "el formulario guardó pero el feed falló". Se crea primero el apartamento como borrador, después se conecta el calendario.

### 8.2 Contrato borrador → activo

Este es el punto más importante del formulario. Un apartamento **nace inactivo** (`is_active default false`) y la base ya bloquea la activación incompleta. La UI tiene que decir eso **antes** del submit, no después de un 23514.

Barra de acciones fija al fondo del formulario: alto 64px, `position: sticky; bottom: 0`, fondo `--background`, `border-top: 1px solid --border`, contenido dentro del mismo `max-width` del contenido.

- **Izquierda:** el bloque de faltantes.
- **Derecha:** `Guardar` (`variant="secondary"`) y `Guardar y activar` (`variant="default"`, primario).

Reglas:

1. `Guardar` está habilitado en cuanto haya `nombre` y `cluster`. Guarda incompleto, sin ruido, sin confirmación.
2. `Guardar y activar` está **deshabilitado** hasta que se cumplan los requisitos, y **nunca queda mudo**: al lado va, en 12px, el bloque

   > **Para activar falta:**
   > ☐ Tarifa al huésped
   > ☐ Pago al aseador
   > ☐ Aseador responsable

   Cada ítem es un `<button type="button">` que hace `scrollIntoView` y `focus()` sobre el campo que le corresponde. Los cumplidos pasan a `Check` verde, texto tachado y `--muted-foreground`. La lista se recalcula en vivo con `watch()` de react-hook-form, no en el submit.
3. Encima de los botones, 12px `--muted-foreground`: "Puedes guardar este apartamento incompleto. No se puede activar hasta completar lo que falta."
4. Un `Tooltip` en el botón deshabilitado repite la primera carencia. Un botón deshabilitado sin explicación es un callejón sin salida.
5. Al activar: toast `Apartamento activado.` Al guardar borrador: toast `Cambios guardados.`
6. Para una unidad **informativa** (`gestion_vivaguest = false`) no aplican `props_active_requires_rates` ni `props_active_requires_owner`, así que no se piden tarifas ni responsable. Pero **sí tiene su propia puerta**: `Guardar y activar` está deshabilitado hasta que `contacto_externo` tenga contenido, y el bloque de faltantes se muestra con un solo ítem:

   > **Para activar falta:**
   > ☐ Contacto externo

   Lo exige el criterio de éxito 3 del ROADMAP, que pide responsable cuando `gestion_vivaguest` es true **y contacto externo cuando es false**, y APTO-09. Es el mismo patrón simétrico de la regla 2, no una excepción.

   **Por qué la UI aprieta acá también:** el CHECK `props_active_requires_owner` solo se activa cuando `gestion_vivaguest AND is_active`, así que la base **no** impide activar una unidad informativa con `contacto_externo` vacío. Sin esta regla, una de las 5 unidades externas podría quedar activa sin que nadie sepa a quién llamar, y el dato faltante no se descubriría hasta el primer aseo. Es una puerta de UI sin respaldo en base: el executor no puede asumir que el 23514 la cubre.

**Nota de precisión, que el executor no debe "corregir":** el CHECK `props_active_requires_owner` acepta `responsable_id IS NOT NULL OR contacto_externo IS NOT NULL`. La UI es **más estricta** para unidades gestionadas y exige `responsable_id`, porque eso es lo que piden APTO-08 y el criterio de éxito 3 del ROADMAP. La divergencia es deliberada: la UI aprieta, la base no se toca.

### 8.3 El switch `gestion_vivaguest`

Es el campo que reconfigura medio formulario. Comportamiento exacto:

- **`true`:** se muestran `responsable_id`* y `suplente_id`, y la sección **Dinero** completa. `contacto_externo` oculto.
- **`false`:** se muestra `contacto_externo`* (textarea de 2 filas, texto libre). `responsable_id`, `suplente_id` y **Dinero** ocultos. Lo exige `props_assignees_only_when_managed`.
- `suplente_id`: el `Select` excluye de sus opciones al responsable ya elegido (`props_suplente_distinct`). Si el admin cambia el responsable a alguien que ya era suplente, el suplente se limpia y aparece un aviso 12px ámbar: "Se quitó el suplente: no puede ser la misma persona que el responsable."
- Ambos `Select` listan **solo aseadores activos** (`profiles.role = 'aseador' AND is_active`). Si el responsable actual quedó desactivado, se muestra igual en la lista, marcado `(inactivo)` en `--status-idle`, para no borrar el dato en silencio.
- **Pasar de `true` a `false` con datos escritos abre un `AlertDialog`** (no destructivo, informativo):
  - Título: `Marcar como gestión externa`
  - Cuerpo: `Esto borra el responsable, el suplente y las tarifas de este apartamento. Las unidades de gestión externa solo llevan un contacto de texto libre.`
  - Botones: `Cancelar` (outline, autofocus) · `Marcar como externa` (default)
  - Si se cancela, el switch vuelve solo a `true`.

### 8.4 Formato de dinero, fecha y hora

Helpers únicos, sin duplicar `Intl` por el código.

- **Dinero** — `lib/domain/money.ts`:
  ```ts
  export function formatCOP(n: number | null | undefined): string
  // Intl.NumberFormat('es-CO', { style:'currency', currency:'COP',
  //   minimumFractionDigits: 0, maximumFractionDigits: 0 })  ->  "$ 120.000"
  ```
  `null` → `—`. Nunca decimales: la base es `bigint` de pesos enteros.
- **Input de dinero:** `type="text"` con `inputMode="numeric"`. Sin `type="number"` (arrastra spinners, rueda del mouse y `,`/`.` inconsistente por locale). Adorno `$` fijo dentro del campo a la izquierda. Se separa en miles al `blur`, se envía como entero. Se rechazan `.`, `,` y signo negativo al teclear.
- **Fecha** — `lib/domain/dates.ts`: las fechas de negocio viajan como `'YYYY-MM-DD'`. **Prohibido `new Date('2026-09-04')`**: se parsea como UTC y en Bogotá (UTC-5) muestra el día anterior. `formatFechaBog(iso)` parte el string y formatea con `Intl.DateTimeFormat('es-CO', { weekday:'short', day:'numeric', month:'long' })` → `jue, 4 de septiembre`.
- **Hora:** `hora_limite` llega como `"11:30:00"`. Se muestra `11:30`, formato 24h. Input `type="time" step="60"`.
- **Valor vacío:** em dash `—` en `--muted-foreground`, acompañado de `<span class="sr-only">sin definir</span>`.

---

## 9. Estados vacíos, de carga y de error

### 9.1 El "vacío" real del día uno: banner de montaje

La lista de apartamentos **nunca está vacía** (39 filas sembradas), pero el día uno todas son placeholders. El estado vacío genérico no aplica; lo que aplica es un indicador de progreso del montaje.

Encima de la toolbar de `/apartamentos`, mientras quede al menos una unidad gestionada no activa:

```
┌────────────────────────────────────────────────────────────┐
│ Montaje del catálogo                    Ver solo pendientes│
│ 6 de 34 unidades gestionadas listas                        │
│ ███░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│ Faltan 28 por completar o activar.                         │
└────────────────────────────────────────────────────────────┘
```

- Card sobre `--canvas`, padding 16px, `Progress` de 4px con relleno `--primary`.
- Denominador **34, no 39**: las informativas no se montan.
- `Ver solo pendientes` es un filtro que deja `Incompleta` + `Inactiva`.
- **Al llegar a 34/34 el banner desaparece solo.** No se convierte en un check permanente: cumplió su función y deja de ocupar espacio.

### 9.2 Estados vacíos reales

| Superficie | Encabezado | Cuerpo | Acción |
|---|---|---|---|
| Búsqueda sin resultados | `Ningún apartamento coincide con «casa azul».` | `Revisa la escritura o quita el filtro de cluster.` | `Limpiar búsqueda` |
| Lista de aseadores vacía | `Todavía no hay aseadores.` | `Las cuentas las creas tú: el aseador no puede registrarse por su cuenta.` | `Crear aseador` (primario) |
| Apartamento sin cuartos | `Este apartamento no tiene cuartos definidos.` | `Sin cuartos no se puede armar el checklist del aseo.` | `Agregar cuarto` |
| Apartamento sin calendario | `Sin calendario conectado.` | `Este apartamento no va a generar aseos automáticos hasta que conectes su calendario de Airbnb.` | `Conectar calendario` (primario) |

Formato: icono `lucide` de 32px en `--muted-foreground`, encabezado 16/600, cuerpo 14/400 `--muted-foreground` con `max-width: 44ch`, botón debajo. Bloque centrado, `padding-block: 48px`.

### 9.3 Carga

- **Navegación:** `loading.tsx` por ruta con un **skeleton que reproduce la geometría real** (barra de 32px + 10 filas de 40px, anchos de columna iguales a los de §7.1). Nunca un spinner centrado: en una tabla de 39 filas produce un salto de layout al resolverse.
- **Mutaciones:** `useActionState` + `useFormStatus`. El botón en vuelo cambia icono por `Loader2` girando y label a gerundio (`Guardando…`, `Validando…`, `Creando…`), y **conserva su ancho** con `min-width` para que nada salte.
- **Prohibido** deshabilitar un botón durante el envío sin mostrar a la vez el spinner: es un estado muerto invisible.
- Sin estados optimistas en esta fase. Nada de lo que se muta aquí (activación, alta de usuario, validación de feed) se puede adivinar antes de la respuesta del servidor.

### 9.4 Errores

Enrutamiento, sin excepciones:

| Tipo de error | Dónde se muestra |
|---|---|
| Validación de un campo (Zod, cliente) | Inline bajo el campo, 12px `--destructive`, `aria-describedby` + `aria-invalid` |
| Error de base ligado a un campo (`23505` de nombre duplicado) | Inline bajo ese campo, no en toast |
| Error de la operación completa (RLS, red, `42501`) | Toast destructivo **y el formulario conserva todo lo escrito** |
| Fallo de validación del feed (APTO-12) | Panel en su propio sitio de la pantalla (§10.3), no toast |

**Todo error de base pasa por `mapDbError()` de `lib/domain/errors.ts`. Nunca se renderiza un string crudo de Postgres.** Mensajes ya cubiertos por ese mapa:

| Origen | Mensaje |
|---|---|
| `properties_nombre_uniq` (23505) | `Ya existe un apartamento con ese nombre.` |
| `cl_unmanaged_is_inert` (23514) | `Esa unidad es de gestión externa: no admite estado, aseador, instrucciones ni tarifas.` |
| `42501` / `PGRST301` | `No tienes permiso para esta operación.` |
| CHECK sin mapear (23514) | `Los datos no cumplen una regla de negocio de la base de datos.` |

Ese último mensaje es un síntoma, no un destino: si un usuario lo ve, es que la UI dejó pasar una regla que debía haber bloqueado antes del submit. Los tres CHECK de activación (`props_active_requires_rates`, `props_active_requires_owner`, `props_assignees_only_when_managed`) **no deben poder dispararse nunca desde la UI**; el §8.2 es la red que lo impide.

---

## 10. APTO-12 — Conectar calendario

La pantalla más importante de la fase. Ruta `/apartamentos/[id]/calendario`.

### 10.1 Layout

Dos columnas a partir de 1024px, `grid-template-columns: 1fr 1fr`, gap 32px.

- **Izquierda — la guía.** Cuatro pasos numerados, cada uno con una captura estática en `public/guia-airbnb/`, WebP, 640px de ancho, `loading="lazy"`, `alt` descriptivo. Texto de cada paso en 14/400 bajo la imagen.
- **Derecha — el campo y el resultado.** Es la columna que importa.
- Por debajo de 1024px, la guía colapsa en un `<details>` rotulado `¿Dónde encuentro este link en Airbnb?`, abierto por defecto la primera vez.

Pasos de la guía (copy base, **a verificar contra la UI real de Airbnb antes de publicar**; Airbnb cambia su interfaz y las capturas hay que tomarlas de la cuenta real, no inventarlas):

1. `En Airbnb, entra a Anuncios y abre el anuncio de este apartamento.`
2. `Abre la pestaña Calendario.`
3. `En el panel de la derecha busca Disponibilidad → Sincronizar calendarios.`
4. `Toca Exportar calendario y copia el link que termina en .ics.`

**La guía no es el requisito. La validación en vivo sí.** Si hay que recortar alcance, se recorta la guía a texto sin capturas, nunca la validación.

### 10.2 El campo

- `Input` de ancho completo, `type="url"`, `spellCheck={false}`, `autoComplete="off"`.
- Placeholder: `https://www.airbnb.com/calendar/ical/12345678.ics?s=…`
- Helper 12px `--muted-foreground`: `Pega el link de exportación del calendario de este apartamento. Es secreto: quien lo tenga puede ver toda su ocupación sin iniciar sesión.`
- Botón primario `Validar link`, deshabilitado con el campo vacío.

### 10.3 Los siete estados

| # | Estado | Disparo | Presentación |
|---|---|---|---|
| 1 | **Vacío** | inicial | Solo campo + helper. Botón deshabilitado |
| 2 | **Formato inválido** | Zod en `blur`/`change`, **sin red** | Inline `--destructive`: `Ese link no parece una exportación de calendario de Airbnb. Debe empezar por https://www.airbnb.com/calendar/ical/ y terminar en .ics.` Regla: protocolo `https:`, host que termine en `airbnb.com` o `airbnb.com.co`, path que contenga `/calendar/ical/` y termine en `.ics` |
| 3 | **Validando** | submit | Botón con `Loader2` y `Validando…`, campo `readOnly`. Skeleton de 3 líneas en el panel de resultado. **Timeout duro de 10s** en el fetch de servidor |
| 4 | **Válido con reservas** | 2xx + iCal parseable + ≥1 evento futuro | Panel `--surface-ok`, borde `--status-ok`, icono `CircleCheck`. Contenido en este orden y con estos tamaños: |
| 5 | **Válido, cero reservas** | 2xx + iCal parseable + 0 eventos | Panel `--surface-warn`, icono `TriangleAlert` |
| 6 | **Responde pero no es iCal** | 2xx + cuerpo sin `BEGIN:VCALENDAR` | Panel `--surface-destructive` |
| 7 | **Inalcanzable** | no-2xx, timeout o error de red | Panel `--surface-destructive`, copy por código |

**Estado 4 — el contenido exacto.** El número de reservas y la fecha del próximo checkout son la **verificación humana** de que el link es el del apartamento correcto. Enterrarlos en 14px anula el requisito.

```
✓ El calendario responde correctamente.

  12                          jue, 4 de septiembre
  reservas encontradas        próximo checkout detectado

  El feed se actualizó hace 2 h.          [Guardar y conectar]
```

- `12` y la fecha: **Display 24px/600**, `--foreground`.
- Sus rótulos: 12px/400 `--muted-foreground`, debajo.
- `El feed se actualizó hace 2 h.`: 12px, solo si el `.ics` trae `DTSTAMP`.
- Botón primario: `Guardar y conectar calendario`.

**Estado 5 — cero reservas.** No es un error y no se bloquea:
> **El link responde, pero no trae ninguna reserva ni bloqueo futuro.**
> Puede ser correcto si el apartamento está libre de aquí en adelante, o puede ser el calendario de otro anuncio. Verifica en Airbnb que el anuncio sea este antes de guardar.

Botón: `Guardar de todos modos` (`variant="outline"`, no primario: no se celebra un resultado dudoso).

**Estado 6 — no es iCal:**
> **El link responde, pero no devuelve un calendario.**
> Suele pasar al pegar el link de la página del anuncio en vez del de exportación. Vuelve al paso 4 de la guía.

Botón: `Reintentar`.

**Estado 7 — copy por modo de falla.** Un solo mensaje genérico obliga al admin a adivinar:

| Código | Mensaje |
|---|---|
| 404 / 410 | `Airbnb no reconoce ese link. Lo más probable es que lo hayan regenerado. Vuelve a Airbnb y copia el link otra vez.` |
| 403 / 401 | `Airbnb rechazó la petición. Copia el link completo, sin recortarlo ni quitarle la parte después del signo de interrogación.` |
| timeout / red | `Airbnb no respondió en 10 segundos. Vuelve a intentar; si sigue igual, el problema es de su lado.` |
| 5xx | `Airbnb está devolviendo error. Intenta de nuevo en unos minutos.` |

Botón: `Reintentar`. **Nunca se guarda una URL que no validó** (salvo el estado 5, que sí validó).

### 10.4 Reglas técnicas que la UI impone

1. **La validación corre en el servidor**, dentro de una Server Action. No desde el navegador: CORS lo bloquearía y, peor, dejaría la credencial en el log de red de quien esté mirando la pantalla.
2. **La URL guardada no se vuelve a renderizar completa.** Se muestra enmascarada en Geist Mono 12px: `…/calendar/ical/12345678.ics?s=••••••••`, con un toggle `Mostrar` / `Ocultar` (iconos `Eye` / `EyeOff`) y un botón `Reemplazar link`. Es una credencial en `property_secrets.ical_url`: una captura de pantalla del dashboard la filtraría entera.
3. La escritura va con `service_role` desde `lib/supabase/admin.ts`. La Server Action valida `getUser()` + rol admin **antes** de tocar nada.
4. Con calendario ya conectado, la pantalla entra directo en estado 4 mostrando el último resultado conocido (`calendar_feeds.last_success_at`, `last_event_count`) y un botón `Validar de nuevo`.

---

## 11. Aseadores (ASEADOR-01, 02, 03)

### 11.1 Lista

| Columna | Ancho | Contenido |
|---|---|---|
| `ESTADO` | 96px | `CircleCheck` `--status-ok` `Activo` / `CircleMinus` `--status-idle` `Inactivo` |
| `NOMBRE` | flexible | 14/600 |
| `TELÉFONO` | 140px | `tabular-nums`, `—` si vacío |
| `RESPONSABLE DE` | 200px | `12 apartamentos`, con `Popover` al hacer clic que lista los nombres |
| `SUPLENTE EN` | 160px | idem |
| `⋯` | 48px | menú |

**Un aseador desactivado no desaparece de la lista.** Se queda con estado `Inactivo` y su fila con texto `--muted-foreground`. Desaparecer una fila tras una acción destructiva es cómo el admin pierde la noción de a quién desactivó.

### 11.2 Alta (ASEADOR-01)

`Dialog`, 480px. Campos: `nombre`*, `email`*, `teléfono`, `contraseña temporal`* (con botón `Generar`).

Copy fijo arriba del formulario, 12px `--muted-foreground`:
> `El aseador no puede registrarse por su cuenta. Esta cuenta la creas tú y le entregas la contraseña.`

Al crear con éxito, el diálogo **no se cierra**: cambia a un estado de entrega, porque la contraseña no se puede recuperar después.

```
✓ Cuenta creada para María Gómez

  Email        maria@ejemplo.com          [Copiar]
  Contraseña   Xk4m-92pT-vLq             [Copiar]

  Esta contraseña no se vuelve a mostrar. Entrégasela ahora.

                                          [Listo]
```

Botones `Copiar` con icono `Copy`; al copiar, el icono pasa a `Check` 1.5s y se anuncia por `aria-live="polite"`.

### 11.3 Baja (ASEADOR-02) — la acción consecuente

`AlertDialog` destructivo, con **consecuencias calculadas, no genéricas**:

```
Desactivar a María Gómez

Pierde el acceso de inmediato, aunque tenga la sesión
abierta en el teléfono.

  · Es responsable de 12 apartamentos
  · Es suplente en 3 apartamentos

  ⚠ Esos 12 apartamentos quedan sin responsable. Los aseos
    nuevos no se van a poder confirmar hasta que asignes a
    otra persona.

              [Cancelar]  [Desactivar]
```

- Los conteos se consultan al abrir el diálogo, no se estiman.
- El bloque ámbar (`--surface-warn`, `--status-warn`) solo aparece si es responsable de al menos un apartamento **activo**.
- `Cancelar`: `variant="outline"`, `autoFocus`. `Desactivar`: `variant="destructive"`, icono `Power`. Nunca dos rellenos juntos (§4.6).
- **Sin confirmación por texto tecleado.** Con ~8 aseadores es fricción teatral; lo que hace consecuente la acción es mostrar el daño real, no obligar a escribir un nombre.
- **Sin "Deshacer".** Reactivar es una operación real con auditoría (`profiles.deactivated_at`); esconderla tras un undo de toast falsea el registro. Toast neutro: `María Gómez quedó desactivada.`
- Reactivar es una acción normal, sin confirmación: no revoca nada.

---

## 12. Login y superficie del aseador

### 12.1 `/login` (PLAT-01, PLAT-02)

Card de 400px centrada vertical y horizontalmente sobre `--canvas`. Wordmark `VivaGuest` 24/600 encima, 32px de separación.

Campos: `Email` (`type="email"`, `autoComplete="username"`), `Contraseña` (`type="password"`, `autoComplete="current-password"`, con toggle `Eye`/`EyeOff`). Botón primario ancho completo: `Entrar`.

- **Sin** "Crear cuenta", sin OAuth, sin "Recordarme". No hay auto-registro en este producto (`enable_signup = false`).
- Bajo el botón, 12px `--muted-foreground`: `¿Olvidaste la contraseña? Pídele al administrador que te la restablezca.` **Sin link**: no existe flujo de recuperación en esta fase y un link muerto es peor que ninguno.
- **Error de credenciales:** un único mensaje, siempre el mismo: `Email o contraseña incorrectos.` Nunca "ese email no existe" (enumeración de usuarios).
- **Cuenta desactivada:** `Tu cuenta está desactivada. Contacta al administrador.` Este mensaje sí es específico y es correcto que lo sea: se emite **después** de validar credenciales, así que no enumera nada, y un aseador dado de baja necesita saber por qué no entra.
- El ruteo por rol lo hace el middleware (claim del JWT, barato y no autoritativo). La UI no decide a dónde va nadie.

### 12.2 `app/(cleaner)/` — stub, no PWA

Una columna, `max-width: 480px`, padding 16px, objetivos de toque mínimo 44px.

`/mis-aseos`:
- Título `Mis aseos` 24/600.
- Cuerpo 14/400 `--muted-foreground`: `Todavía no hay nada aquí. La aplicación del aseador llega en una fase siguiente.`
- Botón `Cerrar sesión`, ancho completo, alto 44px, `variant="outline"`.

**Fuera de alcance explícito en esta fase:** manifest, service worker, banner de instalación, navegación inferior, checklist, cámara, cola offline. Todo eso es Fase 5 y Fase 6. Este stub existe **solo** para que PLAT-07 tenga a dónde aterrizar.

---

## 13. Accesibilidad — mínimos exigibles

- **Contraste:** todo texto ≥ 4.5:1 sobre su superficie (medido en §4.2). Bordes de control ≥ 3:1 (`--input`). Ningún par del sistema queda por debajo.
- **Foco:** anillo de 2px `--primary` con `outline-offset: 2px`. Prohibido `outline: none` sin sustituto. Todo elemento interactivo alcanzable por `Tab`.
- **Estado nunca por color solo:** §5. Forma del icono + etiqueta de texto + color, los tres.
- **Formularios:** `<label>` real ligado por `htmlFor`, nunca placeholder como etiqueta. Errores con `aria-invalid` + `aria-describedby`.
- **Iconos:** `aria-hidden="true"` cuando acompañan texto; `aria-label` cuando van solos.
- **`aria-live="polite"`** para: resultado de validación del feed, confirmación de copiado, contador de resultados del buscador.
- **`<html lang="es">`.** Hoy el repo tiene `"en"`.
- **Diálogos:** foco atrapado, `Esc` cierra, foco devuelto al disparador. Lo da Base UI; no reimplementarlo.
- Tamaño de icono estándar: 16px. 14px dentro de celdas de tabla. `strokeWidth={2}`.

---

## 14. Inventario de componentes

### 14.1 shadcn oficial — `components/ui/`

Sin envolver. **Prohibido `components/atoms/Button.tsx` que solo re-exporte** el `Button` de shadcn.

`alert` · `alert-dialog` · `badge` · `button` · `card` · `checkbox` · `command` · `dialog` · `dropdown-menu` · `form` · `input` · `label` · `popover` · `progress` · `select` · `separator` · `skeleton` · `sonner` · `switch` · `table` · `textarea` · `tooltip`

### 14.2 Organismos — `app/(admin)/_components/`

Por superficie, no en un directorio compartido.

| Componente | Responsabilidad | REQ |
|---|---|---|
| `TopNav` | Barra superior, links activos, menú de usuario | PLAT-07 |
| `TablaApartamentos` | Tabla densa, filtrado en cliente, pie de conteo | APTO-01, APTO-11 |
| `EstadoApartamento` | Icono + etiqueta desde `estadoDeApartamento()` | §5, DASH-07 |
| `BannerMontaje` | Progreso 6/34 + filtro de pendientes | §9.1 |
| `FormularioApartamento` | 5 secciones, RHF + Zod, lista de faltantes en vivo | APTO-01…APTO-10 |
| `BarraAccionesFormulario` | Sticky, `Guardar` / `Guardar y activar`, faltantes | §8.2 |
| `CampoMoneda` | Input COP entero con máscara y adorno `$` | §8.4 |
| `EditorCuartos` | Filas de `property_rooms` | APTO-06 |
| `EditorFaltantes` | Filas de `missing_item_catalog` | APTO-07 |
| `ConectarCalendario` | Guía + campo + los 7 estados | APTO-03, APTO-12 |
| `TablaAseadores` | Lista con conteos y popovers | ASEADOR-03 |
| `DialogoDesactivarApartamento` | Confirmación de baja. `Cancelar` outline · `Desactivar` destructive, **nunca dos rellenos rojos** (§4.6) | APTO-01 |
| `DialogoCrearAseador` | Alta + entrega de contraseña de una sola vez | ASEADOR-01 |
| `DialogoDesactivarAseador` | Confirmación con consecuencias calculadas | ASEADOR-02, PLAT-04 |
| `EstadoVacio` | Encabezado + cuerpo + acción | §9.2 |

`app/(cleaner)/_components/`: ninguno en esta fase. El stub es una página plana.

### 14.3 Iconos lucide usados (lista cerrada)

`CircleCheck` · `TriangleAlert` · `CircleMinus` · `CircleDashed` · `Search` · `ChevronDown` · `Plus` · `MoreHorizontal` · `Pencil` · `Power` · `CalendarCheck` · `CalendarX` · `Copy` · `Check` · `Eye` · `EyeOff` · `Loader2` · `ExternalLink` · `X` · `ArrowLeft` · `LogOut` · `Trash2`

Añadir un icono fuera de esta lista es una modificación de este contrato.

---

## 15. Contrato de copywriting

Español de Colombia, trato de "tú", imperativo. Sin signos de admiración. Sin "¡Ups!", "Oops", "Algo salió mal" ni disculpas. Un error dice **qué pasó** y **qué hacer**.

| Elemento | Copy |
|---|---|
| **CTA primaria — Apartamentos** | `Nuevo apartamento` |
| **CTA primaria — Aseadores** | `Crear aseador` |
| **CTA primaria — Formulario** | `Guardar y activar` (secundaria: `Guardar`) |
| **CTA primaria — Calendario** | `Validar link` → `Guardar y conectar calendario` |
| **CTA primaria — Login** | `Entrar` |
| **Vacío: búsqueda** | `Ningún apartamento coincide con «casa azul».` / `Revisa la escritura o quita el filtro de cluster.` |
| **Vacío: aseadores** | `Todavía no hay aseadores.` / `Las cuentas las creas tú: el aseador no puede registrarse por su cuenta.` |
| **Vacío: cuartos** | `Este apartamento no tiene cuartos definidos.` / `Sin cuartos no se puede armar el checklist del aseo.` |
| **Vacío: calendario** | `Sin calendario conectado.` / `Este apartamento no va a generar aseos automáticos hasta que conectes su calendario de Airbnb.` |
| **Error: credenciales** | `Email o contraseña incorrectos.` |
| **Error: cuenta desactivada** | `Tu cuenta está desactivada. Contacta al administrador.` |
| **Error: nombre duplicado** | `Ya existe un apartamento con ese nombre.` (de `mapDbError`) |
| **Error: permiso** | `No tienes permiso para esta operación.` (de `mapDbError`) |
| **Error: genérico** | `No se pudo completar la operación. Intenta de nuevo; si persiste, reporta el problema.` (de `mapDbError`) |
| **Error: feed 404** | `Airbnb no reconoce ese link. Lo más probable es que lo hayan regenerado. Vuelve a Airbnb y copia el link otra vez.` |
| **Error: feed timeout** | `Airbnb no respondió en 10 segundos. Vuelve a intentar; si sigue igual, el problema es de su lado.` |
| **Error: feed no es iCal** | `El link responde, pero no devuelve un calendario. Suele pasar al pegar el link de la página del anuncio en vez del de exportación.` |
| **Bloqueo de activación** | `Puedes guardar este apartamento incompleto. No se puede activar hasta completar lo que falta.` + `Para activar falta:` |
| **Confirmación destructiva: desactivar aseador** | `Desactivar a {nombre}` / `Pierde el acceso de inmediato, aunque tenga la sesión abierta en el teléfono.` / botones `Cancelar` · `Desactivar` |
| **Confirmación: desactivar apartamento** | `Desactivar {nombre}` / `Deja de generar aseos nuevos. Los aseos ya creados no se tocan.` / botones `Cancelar` · `Desactivar` |
| **Confirmación: gestión externa** | `Marcar como gestión externa` / `Esto borra el responsable, el suplente y las tarifas de este apartamento.` / botones `Cancelar` · `Marcar como externa` |
| **Éxito: guardar** | `Cambios guardados.` |
| **Éxito: activar** | `Apartamento activado.` |
| **Éxito: conectar feed** | `Calendario conectado.` |
| **Éxito: crear aseador** | `Cuenta creada para {nombre}.` |
| **Éxito: desactivar aseador** | `{nombre} quedó desactivada.` (concordancia de género desde el nombre no es viable: usar `{nombre} ya no tiene acceso.`) |
| **Aviso: código de acceso** | `Solo lo ve el aseador asignado a un aseo vigente, y cada consulta queda registrada.` |
| **Aviso: link iCal** | `Es secreto: quien lo tenga puede ver toda su ocupación sin iniciar sesión.` |
| **Aviso: contraseña de una sola vez** | `Esta contraseña no se vuelve a mostrar. Entrégasela ahora.` |

Vocabulario fijo (usar siempre el mismo término):

| Concepto | Término | No usar |
|---|---|---|
| `properties` | **apartamento** / **unidad** | propiedad, listing, inmueble |
| `profiles.role = aseador` | **aseador** | limpiador, personal, staff |
| `gestion_vivaguest = false` | **gestión externa** / **informativa** | no gestionada, externa a secas |
| `cluster` | **cluster** | zona, grupo, región |
| `ical_url` | **link de exportación** | URL, feed, enlace |
| `tarifa_huesped` | **tarifa al huésped** | precio, fee |
| `pago_aseador` | **pago al aseador** | costo, salario |

---

## 16. Registry Safety

| Registry | Bloques usados | Safety Gate |
|---|---|---|
| shadcn oficial (`@shadcn`) | los 22 de §14.1 | no aplica — registry oficial |
| Terceros | **ninguno** | no aplica — no se declaró ningún registry de terceros |

No se declaró ningún registry de terceros, así que la compuerta de vetting (`shadcn view` + escaneo de patrones) **no se ejecutó porque no había nada que vetar**. Si en ejecución alguien quiere añadir un bloque de un registry externo, este documento tiene que reabrirse y correr la compuerta antes.

---

## 17. Deuda declarada de este contrato

Se documenta aquí para que el `gsd-ui-auditor` no la reporte como hallazgo nuevo:

1. **El coral es placeholder.** `#D7373F` es el coral de Airbnb oscurecido a AA. Cuando exista la identidad de VivaGuest se cambian `--brand` y `--brand-hover` en `globals.css` y nada más. El grep de hex literales de §4.3 es lo que mantiene viva esa promesa.
2. **`--primary` y `--destructive` son ambos rojos.** Mitigado por §4.6. Se resuelve solo con el rebrand.
3. **Sin modo oscuro.** El bloque `.dark` queda generado y sin usar. Añadirlo después es rellenar ese bloque, no reescribir componentes.
4. **Sin recuperación de contraseña.** No hay REQ que la pida en v1. El login lo dice con texto, sin link muerto.
5. **Sin vista móvil de la tabla de admin.** Decisión deliberada de §6.3.
6. **Las capturas de la guía de Airbnb hay que tomarlas de la cuenta real.** No existen todavía y no se pueden inventar. Si no están listas al ejecutar, la guía se entrega solo con texto: la validación en vivo es el requisito, la guía es el acompañamiento.

---

## Checker Sign-Off

- [ ] Dimensión 1 Copywriting: PASS
- [ ] Dimensión 2 Visuals: PASS
- [ ] Dimensión 3 Color: PASS
- [ ] Dimensión 4 Typography: PASS
- [ ] Dimensión 5 Spacing: PASS
- [ ] Dimensión 6 Registry Safety: PASS

**Aprobación:** pending
