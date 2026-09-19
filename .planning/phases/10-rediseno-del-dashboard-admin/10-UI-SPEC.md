---
phase: 10
slug: rediseno-del-dashboard-admin
status: draft
shadcn_initialized: true
preset: none (`components.json` ya existe, `style: base-nova`, `registries: {}`, verificado con `npx shadcn info` el 2026-09-18)
created: 2026-09-18
---

# Fase 10 — Contrato de diseño de UI

> Contrato visual y de interacción. Lo consumen `gsd-planner` y `gsd-executor`.
> Idioma de la interfaz: **español de Colombia, trato de "tú"**. Código, tokens, rutas y REQ-IDs quedan como están.

**Alcance de este documento: `/login` y nada más.** `10-CONTEXT.md` cierra hoy solo esa pantalla y deja el resto del dashboard explícitamente abierto ("el resto del dashboard… se definen después"). Este contrato **no dice nada** sobre `/operacion`, `/apartamentos`, `/aseadores`, `/finanzas` ni el árbol del aseador. Si un plan de esta fase toca un archivo fuera de `app/(public)/login/`, `app/globals.css` y `e2e/login.spec.ts`, el alcance se rompió.

**REQ-IDs cubiertos:** ninguno nuevo. `PLAT-01` y `PLAT-02` ya están entregados y esta fase **no cambia su comportamiento**: cambia el marco alrededor del formulario.

**Este documento hereda `02-UI-SPEC.md` completo** (paleta, escala de espaciado, tipografía, movimiento, accesibilidad, vocabulario y §12.1, que es la especificación vigente de `/login`). Hereda también las reglas de ancho de `08-UI-SPEC` §2.2 y la excepción de movimiento del spinner. **No hereda `05-UI-SPEC` §3.1** (la escala `-movil`): esa es exclusiva de `app/(cleaner)/` y `/login` vive en `app/(public)/`.

**Entradas leídas:** `10-CONTEXT.md` (D10-1 a D10-7, todas cerradas), `.planning/ROADMAP.md` §Phase 10, `.planning/STATE.md`, `.planning/REQUIREMENTS.md`, `.planning/codebase/STACK.md`, `02-UI-SPEC.md`, `08-UI-SPEC.md`, `CLAUDE.md`, `app/globals.css` entero (738 líneas), `app/layout.tsx`, `app/(public)/login/page.tsx`, `app/(public)/login/_components/FormularioLogin.tsx`, `lib/utils.ts`, `lib/domain/dates.ts`, `components/ui/{card,button,input,field}.tsx`, `components.json`, `next.config.ts`, `playwright.config.ts`, `e2e/login.spec.ts`, `scripts/ci/check-max-w-tallas.sh`, `scripts/ci/check-service-role.sh` y `.next/prerender-manifest.json` del último build.

---

## 0. Lo que esta fase renderiza de verdad

| Hecho anclado | Consecuencia de diseño |
|---|---|
| **D10-3: publicidad 45% · login 45% · footer full-width.** El 10% que falta no está asignado en ninguna decisión | Se asigna acá, y es **un canal central vacío**, no márgenes exteriores. §2.1 dice por qué, y §2.2 mide qué pasa en cada viewport |
| **D10-4: la publicidad es un placeholder animado entre cuatro grises**, 5s por paso, 600ms de transición, apagada bajo `prefers-reduced-motion` | Son **cuatro tokens de color nuevos** y **una animación de CSS**, cero JavaScript. §6.1 y §7 |
| **Los cuatro grises no pueden salir de la paleta actual.** Medido: `--canvas` contra `--muted` da **1.037:1**, que en un cross-fade de 600ms sobre 600px de ancho no se ve | La fase declara cuatro grises propios con paso adyacente ≥ **1.11:1**. §6.1 |
| **D10-4 exige que el panel siga visible con el movimiento apagado** | El bloque global de `prefers-reduced-motion` de `globals.css` pone `animation-duration: 0s`, y con `animation-fill-mode: none` el elemento cae a **su propio `background-color`**. Por eso `bg-anuncio-1` en la clase base **no es redundante: es el estado de movimiento reducido**. §7.2 |
| **`lucide-react@1.39.0` no exporta ni `Instagram` ni `TikTok`.** Medido: 6143 exports, cero marcas comerciales (`Facebook`, `Twitter`, `Youtube`, `Linkedin`, `Github` tampoco existen) | Los dos iconos del footer son **SVG inline en un componente del proyecto**, con `fill="currentColor"` obligatorio: un `#000000` en un `.tsx` bajo `app/` **rompe el guardarraíl 6** de `check-service-role.sh`. §11.3 |
| **`/login` está prerenderizado como estático.** Medido en `.next/prerender-manifest.json` del último build: la ruta está listada con `initialRevalidateSeconds: false` | `new Date().getFullYear()` en la página **congela el año en el momento del build**. El año sale de `hoyBog().slice(0, 4)` y la página declara `revalidate`. §8.2 |
| **El proceso corre en UTC** (Vercel y CI), y `lib/domain/dates.ts` ya tiene la advertencia escrita | Entre las 19:00 y las 23:59 de Bogotá del 31 de diciembre, UTC ya es el año siguiente: el footer mostraría `2027` cinco horas antes. Es el mismo defecto de clase que `fecha_aseo` como `timestamptz`. §8.2 |
| **D10-6: debajo de 1024px el panel desaparece, no se apila ni se encoge** | `display: none` por variante `lg:`, no renderizado condicional: el servidor no conoce el viewport y un hook de cliente introduce un parpadeo en la primera pintura. §2.4 |
| **D10-7: la identidad no se toca.** `max-w-login` son 400px | Ese 400 es lo que fija el piso del split: `400 + 2 × 24` de padding no cabe en el 45% por debajo de **995.6px** de viewport. El corte en 1024 del dueño queda **28px por encima del piso aritmético**. §2.3 |
| **El formulario no se toca.** `FormularioLogin.tsx` no aparece en ningún diff de esta fase | Sus estados de error y de carga se heredan tal cual, y §9 mide qué le hacen al layout nuevo: **12.5px de desplazamiento**, medidos, aceptados y no reservados |
| **`max-w-<talla>` compila a 4 u 8 píxeles en este repo** (`check-max-w-tallas.sh`, costó dos quicks) | Esta fase **no declara ningún token de contenedor** y no usa ningún `max-w-*` nuevo. La compuerta de registro en `cn()` no se dispara. §4.2 |
| **El guardarraíl 6 prohíbe valores de color literales fuera de `app/globals.css`** | Los cuatro grises se declaran en `globals.css` como tokens. Ningún `bg-[#E2E5E7]` y ningún `style={{ background: … }}` en el panel |

---

## 0.1 Las tres cosas que la medición destapó, y ninguna reabre una decisión

`10-CONTEXT.md` dice que las siete decisiones están cerradas y acá no se reabre ninguna. Lo que sigue son **huecos que las decisiones no cubrían** y que se cierran con medición, no con opinión.

### Hallazgo A. La paleta actual no puede alimentar la animación

D10-4 pide "una animación pero solo se va a ir cambiando entre varios grises". El camino barato es reciclar los grises que ya existen. Medido con la fórmula de contraste de WCAG 2.1 el 2026-09-18:

| Par de grises existentes | Contraste |
|---|---|
| `--canvas` #F6F7F8 ↔ `--muted` #F1F3F5 | **1.037:1** |
| `--muted` #F1F3F5 ↔ `--border` #E3E6E9 | 1.126:1 |
| `--canvas` #F6F7F8 ↔ `--border` #E3E6E9 | 1.168:1 |

La paleta actual solo da **tres** grises, uno de los pasos es 1.037:1, y ese paso es literalmente invisible en un cross-fade de 600ms. Con esos tres tokens la animación existiría en el CSS y no existiría en la pantalla, que es el peor resultado posible: se da por entregada y nadie ve nada. **Por eso hay cuatro tokens nuevos**, y §6.1 publica los contrastes de los cuatro pasos.

### Hallazgo B. La biblioteca de iconos declarada no tiene los dos iconos que pide D10-5

`02-UI-SPEC` §14.3 mantiene una **lista cerrada de iconos lucide** y §13 fija 16px con `strokeWidth={2}`. D10-5 pide Instagram y TikTok. Medido contra el paquete instalado:

```
node -e "const k=Object.keys(require('lucide-react')); console.log(k.length, k.filter(n=>/instagram|tiktok/i.test(n)))"
→ 6143 []
```

Cero. Lucide retiró las marcas comerciales: tampoco hay `Facebook`, `Twitter`, `Youtube`, `Linkedin` ni `Github`. **No es que falten dos iconos: es que esta biblioteca ya no distribuye marcas.** La consecuencia está en §11.3 y trae una trampa de CI adelante: el path oficial de una marca se copia con su color de relleno, y un hexadecimal dentro de un `.tsx` bajo `app/` rompe el guardarraíl 6.

### Hallazgo C. El año del copyright no se puede leer del reloj del proceso

D10-5 dice "el año se calcula, no se escribe a mano". Hay dos formas de calcularlo mal y las dos se ven bien en desarrollo:

1. **`new Date().getFullYear()`** en la página. `/login` está en el manifest de prerenderizado del último build con `initialRevalidateSeconds: false`: es HTML estático generado en el build y **nunca revalidado**. Un deploy de diciembre de 2026 muestra `2026` para siempre.
2. **`new Date()` en UTC.** El proceso corre en UTC en Vercel y en CI. El 31 de diciembre a las 19:00 de Bogotá, UTC ya está en el año siguiente. El footer adelantaría el año **cinco horas**, una vez al año, de noche, que es exactamente cuando nadie lo va a descubrir.

`lib/domain/dates.ts` ya resolvió esto para el resto del producto y su propio comentario nombra el defecto. §8.2 usa ese helper y añade lo único que falta: sacar la página del prerenderizado permanente.

---

## 1. Design System

Sin cambio de herramienta, sin primitivas nuevas y **sin correr el CLI**.

| Propiedad | Valor |
|---|---|
| Tool | `shadcn` CLI **4.19.1**. `style: base-nova`, `baseColor: neutral`, `iconLibrary: lucide`, `registries: {}` (verificado con `npx shadcn info` el 2026-09-18) |
| Preset | `b2fA` (`https://ui.shadcn.com/create?preset=b2fA`). **No se reaplica**: la capa de tokens de VivaGuest pisa al preset por orden de cascada desde la Fase 2 |
| Component library | **Base UI** (`@base-ui/react` **1.7.0**) — no Radix. Ver divergencia 3 de `STACK.md` |
| Icon library | `lucide-react` **1.39.0**, **más dos SVG inline propios** por el hallazgo B |
| Font | Geist Sans / Geist Mono, más Poppins (`--font-brand`) solo en momentos de marca. `/login` **es** uno de los tres momentos de marca |
| Estilos | Tailwind **4.3.3**, `@theme` en `app/globals.css`. No existe `tailwind.config.js` y no se crea |
| Breakpoints | Los de fábrica de Tailwind v4. **No hay ningún `--breakpoint-*` declarado en `globals.css`** (verificado con grep), así que `lg:` son exactamente `64rem` = **1024px**, que es el número de D10-6 sin necesidad de declarar nada |
| Tema | Solo claro |
| Framework | Next **15.5.24**, App Router, build webpack |

### 1.1 Esta fase instala CERO primitivas

Lo que consume, verificado contra `components/ui/`: `card` · `button` · `field` · `input`.

Las cuatro ya están en el repo y las cuatro ya las usa `/login` hoy. **No se corre `npx shadcn add` en ningún plan de esta fase**, así que no entra ninguna clase base con nombre de talla por la vía del CLI y la compuerta de `check-max-w-tallas.sh` no tiene nada nuevo que atrapar.

### 1.2 Alternativas descartadas, con la razón

| Descartado | Razón |
|---|---|
| **`Carousel` de shadcn para el panel** | D10-4 dice placeholder entre grises: no hay contenido, no hay slides, no hay controles y no hay nada que navegar. Instalar un carrusel para animar un `background-color` trae un componente de cliente, sus controles, su ARIA de región en vivo y su dependencia, para pintar un rectángulo |
| **`framer-motion` / `motion`** | Una dependencia nueva de runtime para una interpolación de color que CSS hace nativa, en una pantalla sin sesión donde cada kilobyte se paga antes de que el usuario esté autenticado. Y el contrato de movimiento de `02-UI-SPEC` §6.4 ya vive en CSS: una segunda vía de animación es una segunda vía de desactivarla bajo `prefers-reduced-motion` |
| **`useEffect` + `setInterval` en un componente de cliente** | Es la alternativa real y por eso se argumenta en §7.1: convierte el panel en un componente de cliente, y sobre todo **se salta el bloque global de `prefers-reduced-motion`**, que solo alcanza animaciones y transiciones de CSS. Un temporizador de JS le seguiría cambiando el color a quien pidió que no |
| **Apilar el panel arriba del login en móvil** | Prohibido por D10-6, y la razón del dueño está medida en su propio texto: empuja el campo de correo fuera de la pantalla |
| **`aspect-ratio` fijo para el panel** | Tentador para "preparar" el slot. Medido en §3.2: el panel es un retrato cuyo ratio va de **0.72 a 0.92** entre los viewports soportados. Un `aspect-ratio` fijo dejaría franjas de página muertas arriba o abajo del panel, o lo sacaría de la pantalla en alto |
| **Un `<aside>` para el panel** | `<aside>` es una *landmark* `complementary`. Una landmark con `aria-hidden="true"` es una contradicción: se anuncia en el índice de regiones y no tiene contenido. Va un `<div>` pelado. §10.2 |
| **Capar el footer a `max-w-admin` (1440px)** | D10-2 lo pide full-width. Y con `px-xl` el borde izquierdo del copyright cae **exactamente** sobre el borde izquierdo de la tarjeta del anuncio, que es la única alineación que esta pantalla puede ofrecer gratis. §8.1 |
| **Poner el split en un `app/(public)/layout.tsx`** | Amarraría cualquier página pública futura (recuperación de contraseña, aviso legal) al panel publicitario sin que nadie lo haya decidido. El split es una propiedad **de la pantalla de login**, no del grupo de rutas. Vive en `page.tsx` y sus organismos, en `_components/` |

---

## 2. La geometría: 45 · 10 · 45

### 2.1 El 10% que falta es un canal central, no márgenes

D10-3 cierra dos números y deja el tercero sin asignar. Las tres reparticiones posibles del 10%, y por qué gana una:

| Repartición | Qué se ve | Veredicto |
|---|---|---|
| **10% de canal central** | El panel queda anclado al borde izquierdo de la pantalla (con su propio recuadro de 24px) y el login al derecho; todo el aire sobrante está entre los dos | **ELEGIDA** |
| 5% + 5% de márgenes exteriores, columnas pegadas | El panel flota con 96px de blanco a su izquierda y 24px a su derecha, y el login queda a 96px del borde derecho. El panel deja de leerse anclado y se lee empujado hacia el centro | Descartada: la asimetría de 96 contra 24 alrededor de la misma tarjeta se ve, y un espacio publicitario que algún día se vende ocupa el borde de la pantalla, no el centro |
| 10% de margen derecho | El login pegado al panel y todo el aire al final | Descartada: dejaría el formulario a 24px del panel animado, que es la peor vecindad posible para el único control de la pantalla |

Y hay una razón de mantenimiento, que es la que zanja: con un solo canal la pantalla tiene **dos números** (los 24px del recuadro y el 10% del canal). Con márgenes exteriores tendría tres blancos distintos, de tres anchos distintos, en cada viewport.

**La rejilla se declara como utilidad, no como valor arbitrario en la clase:**

```css
/* ── Fase 10: la rejilla de /login — 10-UI-SPEC.md §2.1 ──────────────────────
   45% publicidad · 10% canal · 45% login (D10-3). Va como @utility y no como
   `grid-cols-[45%_10%_45%]` en el JSX por la misma razon por la que los 120ms
   de movimiento viven en `@utility transicion`: el reparto es el contrato de la
   pantalla y tiene que estar en UN sitio, con su razon al lado.

   Tailwind v4 no tiene namespace de plantilla de rejilla, asi que un token no es
   posible; una utilidad si, y acepta variantes (`lg:rejilla-login`).

   La columna del medio NO lleva elemento: es una pista vacia. El login se
   coloca con `lg:col-start-3`. Un div espaciador seria un nodo en el arbol de
   accesibilidad que no separa nada.                                          */
@utility rejilla-login {
  grid-template-columns: 45% 10% 45%;
}
```

### 2.2 El presupuesto horizontal, medido en los cinco viewports

El alto de viewport sale del método de `08-UI-SPEC` §6.4: alto de pantalla menos ~87px de cromo del navegador. El footer mide 56px a partir de `lg:` (§8.1).

| Viewport | Columna del anuncio (45%) | Tarjeta del anuncio (−48) | Canal (10%) | Columna del login (45%) | Aire a cada lado del formulario |
|---|---|---|---|---|---|
| **1920** | 864.0px | **816.0px** | 192.0px | 864.0px | 232.0px |
| **1440** (referencia) | 648.0px | **600.0px** | 144.0px | 648.0px | 124.0px |
| **1280** (piso soportado) | 576.0px | **528.0px** | 128.0px | 576.0px | 88.0px |
| **1024** (arranque del split) | 460.8px | **412.8px** | 102.4px | 460.8px | **30.4px** |
| **390** | no se renderiza | — | — | ancho completo | 16px (`p-lg`, como hoy) |

**El aire a cada lado no es decoración: es lo que hace que 1024 sea el número correcto.** El formulario mide 400px (`max-w-login`, D10-7) y su columna lleva `p-xl` (24px por lado), así que la columna necesita **448px**. Dividido por 0.45 son **995.6px de viewport**. El corte de D10-6 en 1024 queda 28.4px por encima de ese piso, con 6.4px de holgura sobre el padding a cada lado. **Por debajo de 996px el 45% empezaría a comer el padding del formulario**; el dueño cortó antes, y el número que escogió es correcto por aritmética, no por gusto.

### 2.3 El presupuesto vertical

| Viewport | Pantalla | Viewport | Footer | Región del split | Tarjeta del anuncio | Ratio de la tarjeta |
|---|---|---|---|---|---|---|
| 1920 × 1080 | 1080 | 993 | 56 | 937 | 816 × **889** | 0.918 |
| 1440 × 900 | 900 | 810 | 56 | 754 | 600 × **706** | 0.850 |
| 1280 × 800 | 800 | 700 | 56 | 644 | 528 × **596** | 0.886 |
| 1024 × 768 | 768 | 681 | 56 | 625 | 412.8 × **577** | 0.715 |
| 390 × 844 | 844 | 664 | **85** | 579 | — | — |

**El bloque del login mide 321px y cabe en los cinco.** Medido contra las primitivas instaladas, no estimado:

| Pieza | Cálculo | Alto |
|---|---|---|
| Wordmark `VivaGuest` | `text-display` 24px × 1.2 | **29px** |
| `mb-2xl` bajo el wordmark | | 32px |
| `Card`: `py-(--card-spacing)` | `--spacing(4)` = 16, arriba y abajo | 32px |
| Campo `Email` | label 14 × 1.375 = 19 + `gap-2` 8 + `Input` `h-8` 32 | **59px** |
| `gap-lg` del `<form>` | | 16px |
| Campo `Contraseña` | igual que el anterior; el `div.relative` no añade alto | **59px** |
| `gap-lg` | | 16px |
| Botón `Entrar` | `size="lg"` → `h-9` | **36px** |
| `gap-sm` | | 8px |
| Aviso de contraseña olvidada | `text-micro` 12 × 1.4 = 17, **dos líneas** a 368px de ancho útil | **34px** |
| | | **Total 321px** |

El ancho útil dentro de la `Card` es `400 − 2 × 16` = **368px**. Con eso el aviso de 71 caracteres a 12px no cabe en una línea y ocupa dos: está contado.

**Holgura vertical del bloque del login:** 152px arriba y abajo en el caso más apretado (1024 × 768). No hay ningún viewport soportado donde el login haga scroll.

**La palanca, si algún día no cupiera:** los 32px del `mb-2xl` del wordmark son el primer recorte, no el contenido del formulario.

### 2.4 Debajo de 1024px: el panel desaparece por CSS

```
hidden lg:block
```

**`display: none`, no renderizado condicional, y no es un atajo.** Un renderizado condicional necesita conocer el viewport, y eso solo se sabe en el cliente: o se mete un hook de media query (y el panel aparece después de la primera pintura, con un salto visible justo en el arranque de la pantalla) o se adivina en el servidor. Con `display: none` el panel simplemente no existe en la pantalla del teléfono, y una animación sobre un elemento con `display: none` **no avanza**: no hay coste de pintura.

Lo demás debajo de 1024px es **exactamente la pantalla de hoy**: `p-lg`, `bg-canvas`, `Card` de ancho completo con tope de 400px, centrada. Cero clases nuevas en el árbol del formulario. El único añadido es el footer, que sí se queda (§8.1).

**Y hay una deuda que nace aquí, declarada en §15.3:** cuando el slot cargue una imagen real, `display: none` **no evita la descarga**. Ese día el panel necesita `<picture>` con `media`, o se convierte en frontera de cliente.

---

## 3. El panel: tarjeta insertada, no sangrado completo

### 3.1 La decisión

**Tarjeta insertada.** 24px (`p-xl`) de recuadro en los cuatro lados de su columna, `rounded-2xl`, `overflow-hidden`.

Las tres razones, en orden de peso:

1. **El slot tiene que aceptar cualquier relación de aspecto, y ninguna le va a calzar.** §3.2 lo mide. Un panel a sangre completa obliga a `object-fit: cover`, o sea a **recortar** el creativo, porque dejar franjas contra el borde desnudo del navegador se lee como un defecto de maquetación. Recortar un anuncio es cortarle el logo o el texto: es el único modo de fallo que un anunciante no perdona. Una tarjeta con borde declarado y radio permite `object-fit: contain`, y las franjas caen **sobre la propia superficie de la tarjeta**, que se lee como un marco intencional.
2. **Un gris a sangre completa contra el borde del navegador es indistinguible de un esqueleto de carga.** Hoy el panel es exactamente eso: un gris. Con radio y recuadro dice "acá hay una superficie"; sin ellos dice "esto todavía está cargando", y el admin que entra veinte veces al día no tiene forma de saber que no.
3. **La tarjeta es donde vive el estado "sin anunciante"**, que es la pregunta abierta 2 de `10-CONTEXT.md`. El día que se responda, la respuesta cae dentro de un recuadro que ya existe, sin que la página cambie de forma.

**Radio:** `rounded-2xl` = `--radius-2xl` = `0.375rem × 1.8` = **10.8px**. Un escalón por encima del `rounded-xl` (8.4px) de la primitiva `Card`, porque es la superficie más grande de toda la aplicación (816 × 889 a 1920) y el radio de una tarjeta de 400px se pierde en ella. **Sale de la escala `--radius-*` que ya existe: cero tokens nuevos.**

### 3.2 Por qué ninguna relación de aspecto se puede prometer

De la tabla de §2.3, el ancho partido por el alto de la tarjeta:

| Viewport | Ratio |
|---|---|
| 1024 × 768 | **0.715** |
| 1440 × 900 | 0.850 |
| 1280 × 800 | 0.886 |
| 1920 × 1080 | **0.918** |

Siempre retrato, y con un recorrido de **0.72 a 0.92** entre los viewports soportados: un 28% de variación. Eso cierra dos cosas de una vez:

- **No se declara `aspect-ratio`.** El panel se estira con la región y ya.
- **Cuando haya anunciantes, el contrato con ellos no puede ser "una imagen".** Tiene que ser un creativo que tolere un retrato de ratio variable: `object-contain` centrado sobre la superficie de la tarjeta, o un creativo por rango de ratio. Eso es la pregunta abierta 2 de `10-CONTEXT.md` y **no se responde en esta fase**; lo que esta fase entrega es la tarjeta que hace que la respuesta sea posible sin rehacer la pantalla.

### 3.3 El slot es un `children`, no un componente cerrado

```tsx
// app/(public)/login/_components/PanelPublicidad.tsx
export function PanelPublicidad({ children }: { children?: React.ReactNode })
```

Hoy nadie le pasa `children` y el panel pinta el ciclo de grises. El día que haya un creativo, entra por ahí y el ciclo se convierte en el fondo sobre el que se posa. **La firma con `children` se escribe ahora**, aunque hoy esté sin usar: es la diferencia entre un slot y un rectángulo, y es lo único que D10-4 pide preparar ("lo que se construye es el slot").

Lo que **no** entra hoy, y no es un olvido: conteo de impresiones, rotación de creativos, orden de anunciantes, estado sin anunciante, `<a>` envolvente. Todo eso es la pregunta abierta 2.

---

## 4. Escala de espaciado

Hereda `02-UI-SPEC` §2 sin cambios: `xs` 4 · `sm` 8 · `md` 12 · `lg` 16 · `xl` 24 · `2xl` 32 · `3xl` 48. Sigue **prohibido el valor arbitrario de espaciado**.

### 4.1 Cero tokens de espaciado nuevos

| Necesidad de esta fase | Token existente | Valor |
|---|---|---|
| Recuadro de la tarjeta del anuncio | `--spacing-xl` (`p-xl`) | 24px |
| Padding de la columna del login a partir de `lg:` | `--spacing-xl` (`lg:p-xl`) | 24px |
| Padding de la pantalla debajo de `lg:` | `--spacing-lg` (`p-lg`) | 16px, **como hoy** |
| Separación wordmark ↔ tarjeta | `--spacing-2xl` (`mb-2xl`) | 32px, **como hoy** |
| Alto del footer a partir de `lg:` | `--spacing-barra` (`lg:h-barra`) | **56px** |
| Padding lateral del footer | `--spacing-xl` (`px-xl`) | 24px |
| Separación entre los dos iconos del footer | `--spacing-xs` (`gap-xs`) | 4px |
| Footer apilado debajo de `lg:` | `--spacing-lg` + `--spacing-sm` | `py-lg gap-sm` |

**`--spacing-barra` se reutiliza sin redeclarar.** Su comentario en `globals.css` dice "alto de la barra superior", y el footer del login es la misma clase de cromo: una fila con una línea de texto de 12px y dos controles de 28px. 56px ya es la respuesta medida (28 + 2 × 14) y declarar `--spacing-pie-login: 56px` sería un segundo nombre para el mismo número. Es la misma jugada que `08-UI-SPEC` §2.1 hizo con `--spacing-miniatura`.

### 4.2 La regla del ancho no se dispara, y está comprobado

`scripts/ci/check-max-w-tallas.sh` falla si aparece una clase de ancho con nombre de talla bajo `app/`, `components/` o `lib/`, porque Tailwind v4.3 resuelve `max-w-<nombre>` contra `--spacing-*` antes que contra `--container-*` y la escala de espaciado de este proyecto se llama por tallas.

- **Esta fase no declara ningún `--container-*`.** El único ancho máximo de la pantalla es `max-w-login`, que existe desde la Fase 2 y **ya está registrado** en el grupo `max-w` de `extendTailwindMerge` en `lib/utils.ts` (verificado: línea con `"max-w-login"`).
- **La rejilla va por `@utility`**, no por `grid-cols-[…]`, así que no toca ningún namespace de ancho.
- **Si durante la ejecución apareciera un `max-w-*` nuevo, el registro en `cn()` no es opcional.** Sin él la clase se escribe, el código se lee bien y el ancho no llega al DOM.

### 4.3 El piso de toque no aplica, y el guardarraíl móvil tampoco

| Regla | En esta fase |
|---|---|
| Piso de toque de 44px (`--spacing-toque`) | **NO aplica.** Es exclusivo de `app/(cleaner)/`. Y los dos únicos controles nuevos de la pantalla están **deshabilitados**: un control deshabilitado no tiene área de toque que dimensionar |
| `check-escala-movil.sh` | **NO se dispara.** Su grep mira solo `app/(cleaner)/` y esta fase no toca ningún archivo de ese árbol |
| Escala `-movil` de `05-UI-SPEC` §3.1 | **NO aplica.** `/login` vive en `app/(public)/` y usa la escala del admin |

La consecuencia incómoda de esto está declarada como deuda en §15.4: el aseador entra por esta misma pantalla desde un teléfono, y el `Input` de la primitiva mide 32px de alto. No es defecto de esta fase (el formulario no se toca) pero tampoco es un hecho que convenga dejar sin escribir.

---

## 5. Tipografía

**Cero cambios y cero roles nuevos.** Exactamente los cuatro tamaños y los dos pesos de `02-UI-SPEC` §3.

| Rol | Tamaño | Line height | Alto de una línea | Peso | Dónde, en esta fase |
|---|---|---|---|---|---|
| Display | 24px | 1.2 | **29px** | 600 | El wordmark `VivaGuest`, en `font-brand` (Poppins). Único uso |
| Heading | 16px | 1.3 | 21px | 600 | **En ningún sitio.** Esta pantalla no tiene títulos de sección |
| Body | 14px | 1.5 | 21px | 400 | Labels, inputs, botón `Entrar`, y `FieldError` (la primitiva lo emite a 14px) |
| Micro | 12px | 1.4 | **17px** | 400 | El aviso de contraseña olvidada y **la línea de copyright del footer** |

Reglas ligadas:

- **Poppins solo en el wordmark.** El footer, el formulario y cualquier texto futuro del panel van en `--font-sans` (Geist). `/login` es uno de los tres momentos de marca del producto, y ese momento **es el wordmark**, no la pantalla entera.
- **El wordmark va en `--foreground`.** D10-7, `02-UI-SPEC` §3 (actualización del 2026-09-01) y el comentario que ya está escrito en `page.tsx`. `--brand-identity` da 2.64:1 y no toca texto nunca.
- **Ninguna copia de esta fase usa peso 500.** No existe en el sistema.
- La regla de `02-UI-SPEC` §3 sobre el texto de 12px ("nunca lleva información que no esté también en otro lado") se cumple sin esfuerzo: la línea de copyright no es información sobre la que nadie tenga que actuar.
- **Sin `tabular-nums`.** El año del copyright es la única cifra de la pantalla y no se alinea contra nada.

---

## 6. Color

### 6.1 Cuatro tokens nuevos, y son los cuatro grises del placeholder

Por el hallazgo A, la paleta actual no puede alimentar un cross-fade visible. Los cuatro pasos se diseñaron en oklch sobre el hue de los neutros del proyecto (`--border` está en 247.88, `--muted-foreground` en 258.37) y se midieron con la fórmula de WCAG 2.1 el **2026-09-18**:

```css
/* ── Fase 10: los cuatro grises del slot publicitario — 10-UI-SPEC.md §6.1 ───
   D10-4: el placeholder del anuncio hace cross-fade entre cuatro grises. NO se
   pueden reciclar los neutros que ya existen: --canvas contra --muted da
   1.037:1, un paso que en un fundido de 600ms sobre 600px de ancho no se ve, y
   la paleta actual solo alcanza para tres grises.

   Estos cuatro tienen paso adyacente >= 1.11:1 y los cuatro quedan MAS OSCUROS
   que --canvas (#F6F7F8), que es el fondo de la pagina: el paso mas claro
   conserva 1.181:1 contra ella, asi que el borde de la tarjeta no se disuelve en
   ningun momento del ciclo. De referencia, el borde que hoy separa una tabla de
   la pagina (--canvas contra --border) es 1.168:1: el momento mas tenue del
   panel sigue siendo mas visible que eso.

   NO son de marca, NO cambian con el rebrand, y --brand-identity y --brand-gold
   NO entran aca: un placeholder con el dorado de la identidad se leeria como una
   pieza de diseno terminada, y el dorado da 1.69:1.                           */
:root {
  --anuncio-1: oklch(0.9200 0.0045 250);  /* #E2E5E7 */
  --anuncio-2: oklch(0.8850 0.0060 250);  /* #D6D9DD */
  --anuncio-3: oklch(0.8500 0.0075 250);  /* #CACED3 */
  --anuncio-4: oklch(0.8150 0.0090 250);  /* #BEC3C8 */
}

@theme inline {
  --color-anuncio-1: var(--anuncio-1);
  --color-anuncio-2: var(--anuncio-2);
  --color-anuncio-3: var(--anuncio-3);
  --color-anuncio-4: var(--anuncio-4);
}
```

| Medición | Valor |
|---|---|
| Paso 1 → 2 | **1.115:1** |
| Paso 2 → 3 | **1.119:1** |
| Paso 3 → 4 | **1.123:1** |
| Extremos 1 ↔ 4 | **1.401:1** |
| `--anuncio-1` contra `--canvas` (el fondo de la página) | **1.181:1** |
| `--anuncio-4` contra `--canvas` | 1.654:1 |
| `--foreground` #111827 sobre cada paso | 14.01 · 12.56 · 11.23 · **10.00** |

Esa última fila no es adorno: el día que un creativo lleve texto encima, **los cuatro pasos siguen dando AA de sobra**, así que el ciclo de fondo no puede volver ilegible nada que se ponga en el slot.

**Ningún otro token de color nuevo. Cero.**

### 6.2 La proporción 60/30/10, medida en esta pantalla

Medido a 1440 × 810 (el viewport de referencia), en píxeles cuadrados reales:

| Superficie | Rol | Área | Proporción |
|---|---|---|---|
| `--canvas` #F6F7F8 — fondo de la página y del footer | Dominante | 638,800 px² | **54.77%** |
| Tarjeta del anuncio (`--anuncio-1…4`) | Secundaria | 423,600 px² | **36.32%** |
| `--background` #FFFFFF — la `Card` del login | Dominante | 90,752 px² | **7.78%** |
| `--primary` #d1382c — el botón `Entrar` (368 × 36) | Acento | 13,248 px² | **1.14%** |

Leído por roles: **superficie neutra 62.55% · superficie secundaria 36.32% · acento 1.14%**. Es 60/30/10 con el acento muy por debajo de su techo, que es el lado correcto por el que fallar.

Y conviene decir cuál era el modo de fallo evidente: **teñir el panel de 423,600 px² con un color de marca**. Eso habría puesto el acento en 37% de la pantalla de una sola vez. `02-UI-SPEC` §4.4 ya lo prohíbe y D10-7 lo refuerza; acá queda además el número.

### 6.3 La lista cerrada del acento no se amplía

`--primary` sigue en los cinco usos de `02-UI-SPEC` §4.4. En esta pantalla aparece en **dos**: el botón `Entrar` (uso 1) y el anillo de foco de los controles (uso 3).

**Prohibido explícitamente en esta fase:** `--primary`, `--brand-identity` y `--brand-gold` en el panel del anuncio, en el footer, en los iconos de redes y en el wordmark. El panel es neutro; el footer es neutro; los iconos deshabilitados son neutros.

### 6.4 El resto de la pantalla usa tokens que ya existen

| Necesidad | Token | Valor |
|---|---|---|
| Fondo de la pantalla, en todos los breakpoints | `--canvas` | #F6F7F8 — **igual que hoy**, no se cambia a blanco |
| Superficie de la `Card` del login | `--card` → `--background` | #FFFFFF |
| Wordmark, labels, valor de los inputs | `--foreground` | #111827 — 16.54:1 sobre `--canvas` |
| Copyright del footer e iconos de redes | `--muted-foreground` | #5C6470 — **5.57:1 sobre `--canvas`**, AA |
| Mensajes de error del formulario | `--destructive` | #9F1239 — sin cambios |
| Borde de los inputs | `--input` | sin cambios |

**El fondo se queda en `--canvas` y no pasa a blanco.** Es lo que le da borde visible a la `Card` blanca del login debajo de 1024px, que es literalmente la pantalla de hoy (D10-6), y es lo que hace que los cuatro grises del panel se lean como una superficie más oscura que la página en todo el ciclo (§6.1).

---

## 7. El contrato de la animación

### 7.1 Keyframes de CSS, no JavaScript. Y la razón no es el rendimiento

| | |
|---|---|
| **Qué** | Una `@keyframes` sobre `background-color`, declarada como `--animate-anuncio` en `@theme` |
| **Quién la aplica** | `PanelPublicidad`, que es un **componente de servidor** sin estado, sin efectos y sin `'use client'` |
| **Coste en el cliente** | **Cero kilobytes.** En una pantalla sin sesión, donde todo lo que se descargue se paga antes de que el usuario exista |

La alternativa real era `useEffect` + `setInterval` en un componente de cliente. Se descarta por tres razones, y la segunda es la que decide:

1. Convierte una decoración en un componente de cliente, con su temporizador que hay que limpiar y su re-render cada 5 segundos.
2. **Se salta `prefers-reduced-motion`.** El bloque de `globals.css` que apaga el movimiento actúa sobre `animation-duration` y `transition-duration`: alcanza a CSS y **no puede alcanzar a un temporizador de JS**. Un `setInterval` le seguiría cambiando el color a quien pidió expresamente que no. Es una regresión de accesibilidad invisible en revisión de código y verificable solo con el sistema configurado.
3. `02-UI-SPEC` §6.4 ya restringe el movimiento del producto a `color`, `background-color`, `border-color` y `opacity`. **Animar `background-color` no estrena ninguna clase de propiedad**: es exactamente lo que el contrato de movimiento ya permite, y no es una animación de layout.

### 7.2 La aritmética de los keyframes

D10-4 da dos números: **5 segundos por paso** y **600ms de transición**. Se leen como que los 600ms están *dentro* del paso, no encima: el paso es un periodo de 5s = 4.4s de reposo + 0.6s de fundido. Cuatro pasos → **ciclo de 20s exactos**, y los porcentajes salen enteros:

| Tramo | % del ciclo | Segundos |
|---|---|---|
| Reposo de un paso | 22% | 4.4s |
| Fundido al siguiente | 3% | 0.6s |
| Paso completo | 25% | **5.0s** |
| Ciclo completo | 100% | **20.0s** |

La otra lectura (5s de reposo *más* 600ms de fundido) daría un paso de 5.6s, un ciclo de 22.4s y porcentajes de 89.29%: los mismos segundos de fundido con peores números y sin ninguna ganancia.

```css
/* ── Fase 10: el ciclo del placeholder publicitario — 10-UI-SPEC.md §7 ───────
   D10-4: cuatro grises, 5s por paso, 600ms de transicion. 4 x 5s = 20s de ciclo,
   asi que el reposo de cada paso son 22% (4.4s) y el fundido 3% (0.6s).

   `linear` y no `ease-out`: `ease-out` sobre un fundido de 600ms entre dos grises
   a 1.115:1 arranca de golpe y se lee como un parpadeo. Un cross-fade entre dos
   colores planos es lineal por definicion. El `ease-out` de 120ms del @utility
   `transicion` sigue siendo la regla para TODO lo demas; esto es una animacion,
   no una transicion de estado.

   Se apaga con el bloque de prefers-reduced-motion que ya existe mas abajo en
   este archivo. NO se anade una segunda regla: el sitio donde se apaga el
   movimiento de este producto es uno solo, y el elemento cae a su propio
   `background-color` (ver 10-UI-SPEC.md §7.3).                                */
@theme {
  --animate-anuncio: ciclo-anuncio 20s linear infinite;

  @keyframes ciclo-anuncio {
    0%,  22% { background-color: var(--anuncio-1); }
    25%, 47% { background-color: var(--anuncio-2); }
    50%, 72% { background-color: var(--anuncio-3); }
    75%, 97% { background-color: var(--anuncio-4); }
    100%     { background-color: var(--anuncio-1); }
  }
}
```

Clase resultante: **`animate-anuncio`**. El nombre no colisiona con nada de `tw-animate-css`.

### 7.3 Movimiento reducido: el panel se queda en el gris 1, nunca en blanco

El bloque que ya está al final de `globals.css` hace esto para todo el producto:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-iteration-count: 1 !important;
  }
}
```

Con `animation-duration: 0s` y `animation-fill-mode: none` (el de fábrica), **ningún keyframe queda aplicado**: el elemento se pinta con su propio `background-color`. Por eso:

> **La clase base del panel lleva `bg-anuncio-1`, y eso NO es redundante con los keyframes: es el estado de movimiento reducido.** Quitarlo por "duplicado" deja un rectángulo transparente sobre `--canvas`, o sea el panel desaparecido, para el usuario que pidió menos movimiento.

Clase completa del elemento animado:

```
size-full overflow-hidden rounded-2xl bg-anuncio-1 animate-anuncio
```

**No se escribe una segunda regla de `prefers-reduced-motion` para este panel.** El movimiento de este producto se apaga en un solo sitio; la única excepción declarada en todo el sistema es `.animate-spin`, y está justificada porque un spinner es información de estado. Un placeholder decorativo no lo es.

**El par que hay que tener en la cabeza:** con el movimiento reducido activado, el panel se queda quieto en #E2E5E7 **y el spinner del botón `Entrar` sigue girando**. Es el comportamiento correcto de las dos piezas a la vez, y es la aserción que lo demuestra (§13).

### 7.4 La animación no se pausa, y el panel no reacciona a nada

- **No se pausa mientras el formulario envía.** No compite por atención con nada: el botón cambia de label y saca su spinner, que está a 700px de distancia en el eje horizontal.
- **No responde a hover, ni a foco, ni a clic.** No es interactivo, no tiene cursor propio y no tiene estado.
- **No hay `will-change`.** Un `background-color` de 20s sobre un elemento sin transformaciones no necesita promoción a capa, y `will-change` sobre 816 × 889 píxeles reserva memoria de vídeo para siempre por una animación que corre una vez cada 5 segundos.

---

## 8. El footer

### 8.1 Anatomía

```
┌─────────────────────────────────────────────────────────────────────────┐
│ © 2026 VivaGuest. Todos los derechos reservados.            [ig] [tt]   │
└─────────────────────────────────────────────────────────────────────────┘
```

| | A partir de `lg:` (≥1024px) | Debajo de `lg:` |
|---|---|---|
| Disposición | Una fila, `justify-between`, `items-center` | Columna centrada, `gap-sm` |
| Alto | `lg:h-barra` = **56px** exactos | Automático: `py-lg` + 17 + 8 + 28 = **85px** |
| Padding lateral | `px-xl` = 24px | `px-lg` = 16px |
| Superficie | `--canvas`, la misma de la página. **Sin fondo propio, sin borde superior** | igual |

**Por qué apila debajo de `lg:`, con el número:** a 390px de ancho el footer tiene `390 − 2 × 16` = **358px** útiles. La línea de copyright mide ~288px a 12px, los dos iconos de 28px con su `gap-xs` son 60px, y la separación mínima entre los dos bloques son 16px: **288 + 16 + 60 = 364px**. Se pasa por 6px, así que en una sola fila el texto envolvería y el alto dejaría de ser predecible. Apilado, el footer mide 85px y el bloque del login sigue teniendo 129px de aire a cada lado en un iPhone de 664px de viewport (§2.3).

**Sin borde superior y sin fondo propio, y es una decisión:** D10-5 dice "nada más". Su separación visual ya está dada por el borde inferior de la tarjeta del anuncio, que queda 24px por encima, y por los 152px de aire bajo el bloque del login. Un `border-t` sería una línea que cruza la pantalla entera para separar aire de aire.

**La única alineación que esta pantalla regala:** con `px-xl` (24px), el borde izquierdo del copyright cae **exactamente** sobre el borde izquierdo de la tarjeta del anuncio, que también está a 24px del borde del viewport. Los iconos se alinean con el borde derecho de la pantalla menos los mismos 24px, **no** con el borde del formulario: alinearlos con el formulario exigiría que el footer replicara la aritmética de la columna del login, y eso son tres números más para ganar una alineación que nadie va a notar a 124px de distancia.

### 8.2 El año se calcula en Bogotá, y la página tiene que dejar de ser estática

```tsx
// app/(public)/login/page.tsx
import { hoyBog } from '@/lib/domain/dates';

// `/login` estaba en el manifest de prerenderizado del ultimo build con
// `initialRevalidateSeconds: false`: HTML generado en el build y nunca
// revalidado. Con eso, el ano del footer se congela en el ano del deploy.
// Una hora de ventana es de sobra para un ano en un pie de pagina, y conserva
// el HTML cacheable, que es lo que le importa a un telefono con mala senal.
export const revalidate = 3600;

// ...
<PieDeLogin anio={hoyBog().slice(0, 4)} />
```

**Dos reglas, y ninguna es opcional:**

1. **El año sale de `hoyBog()`, nunca de `new Date().getFullYear()`.** El proceso corre en UTC en Vercel y en CI. El 31 de diciembre a las 19:00 de Bogotá, UTC ya está en el año siguiente, y el footer adelantaría el año durante cinco horas. `hoyBog()` ya existe en `lib/domain/dates.ts`, ya tiene esa advertencia escrita en su propio comentario, ya tiene tests, y es el equivalente en TypeScript de `public.today_bog()`. **No se escribe un formateador nuevo y no se nombra `America/Bogota` en un componente**: `TZ_BOGOTA` es la única constante de zona del repo.
2. **El reloj se lee en la página, no en el footer.** `PieDeLogin` recibe `anio: string` como prop y es una función pura de su prop. Así el único sitio de la pantalla que lee el reloj es uno, y el footer es verificable sin intervenir el tiempo.

### 8.3 Los dos iconos, deshabilitados de verdad

```tsx
<Button variant="ghost" size="icon-sm" disabled aria-label="Instagram, aún no disponible">
  <IconoInstagram aria-hidden="true" />
</Button>
```

| Propiedad | Decisión | Razón |
|---|---|---|
| Elemento | `<button disabled>` (vía `Button`) | Es lo que D10-5 pide: "en disabled". Un `<a>` sin `href` no es un enlace y no se anuncia como nada |
| Variante y tamaño | `variant="ghost"`, `size="icon-sm"` (28px) | Sin fondo, sin borde. `disabled:opacity-50` ya viene en la clase base de la primitiva |
| Foco | **Fuera del orden de tabulación**, que es lo que `disabled` hace por sí solo | §10.3 |
| Nombre accesible | `aria-label` en el botón, `aria-hidden="true"` en el SVG | `02-UI-SPEC` §13: icono solo → `aria-label`; y el svg no se lee dos veces |
| Cursor | No se toca | `globals.css` ya limita `cursor: pointer` a `button:not(:disabled)`. Un deshabilitado conserva el cursor por defecto **sin escribir nada** |
| Contraste | #5C6470 al 50% sobre `--canvas` = **#A9AEB4, 2.09:1** | Por debajo de 4.5:1, y **exento**: WCAG 1.4.3 excluye expresamente los componentes inactivos. §10.4 lo declara como el único uso de esa exención en todo el producto |

---

## 9. El formulario no cambia, y esto es lo que el layout nuevo le hace

**`app/(public)/login/_components/FormularioLogin.tsx` no aparece en ningún diff de esta fase.** Ni una clase. Sus cinco estados se heredan tal cual:

| Estado | Copia | Qué le hace el layout nuevo |
|---|---|---|
| **Reposo** | — | Nada |
| **Carga** | `Entrando…` + `Loader2` girando, botón deshabilitado | Nada. El spinner sigue siendo la única excepción a `prefers-reduced-motion` del producto, y ahora convive con un panel congelado (§7.3) |
| **Error de campo** | El mensaje cuelga del `Input`, con `aria-invalid` y `aria-describedby` | Crece el bloque; ver la medición de abajo |
| **Error general** | `Email o contraseña incorrectos.` / `Tu cuenta está desactivada. Contacta al administrador.`, bajo el botón | Igual |
| **Contraseña visible** | Toggle `Eye`/`EyeOff` con `aria-pressed` | Nada |

### 9.1 El error desplaza el bloque 12.5px, y no se reserva espacio

El bloque del login está centrado vertical en su columna (§2.3). Al aparecer un error general, el `<form>` crece `gap-sm` 8 + una línea de `FieldError` (la primitiva la emite a 14px, altura de línea 17px) = **25px**, y un bloque centrado que crece 25px **se desplaza 12.5px hacia arriba**.

**Medido, los cuatro mensajes posibles caben en una línea** en los 368px útiles de la tarjeta, a 14px:

| Mensaje | Caracteres | Ancho aprox. |
|---|---|---|
| `Email o contraseña incorrectos.` | 31 | ~205px |
| `Tu cuenta está desactivada. Contacta al administrador.` | 53 | ~350px |
| `No tienes permiso para esta operación.` | 38 | ~251px |
| `No se pudo completar la operación. Intenta de nuevo; si persiste, reporta el problema.` | 85 | **dos líneas** |

El último es el genérico de `mapDbError` y en `/login` solo puede salir por un fallo de infraestructura. Con dos líneas el desplazamiento se duplica a 25px.

**Decisión: no se reserva espacio.** Reservar 25px permanentes de vacío bajo el botón para evitar un desplazamiento de 12.5px cuesta más de lo que ahorra: el vacío está ahí el 100% del tiempo y el desplazamiento ocurre en el caso de error. Y un desplazamiento de 12.5px con el ojo puesto en el botón es, además, **señal de que algo cambió**, que es justo lo que se quiere comunicar.

### 9.2 Los seis tests que ya existen no se tocan

`e2e/login.spec.ts` tiene seis pruebas y **ninguna depende del layout**: entran por `getByLabel` y por rol, no por posición. El proyecto de Playwright corre con `devices['Desktop Chrome']`, o sea **1280 × 720**, que está por encima de 1024: a partir de esta fase esas seis pruebas se ejecutan **con el split activo**, y tienen que seguir pasando sin editarlas. Si alguna necesita un cambio, el layout rompió algo que no debía.

---

## 10. Accesibilidad

Hereda `02-UI-SPEC` §13 completo. Lo que esta pantalla añade:

### 10.1 La estructura, y qué es landmark y qué no

```
<div>                          ← contenedor de la pantalla, min-h-svh, flex-col
  <div>                        ← region del split: flex-1, lg:grid lg:rejilla-login
    <div aria-hidden="true">   ← COLUMNA 1: el panel. hidden lg:block. NO es <aside>
      <div />                  ← la tarjeta animada. Sin hijos, sin texto, sin foco
    </div>
                               ← COLUMNA 2: pista vacia de la rejilla. SIN elemento
    <main lg:col-start-3>      ← COLUMNA 3: wordmark + Card + FormularioLogin
  </div>
  <footer>                     ← contentinfo, unico en la pagina
</div>
```

- **El panel es un `<div>`, no un `<aside>`.** Una landmark `complementary` con `aria-hidden="true"` es una contradicción: aparece en el índice de regiones y no tiene contenido que ofrecer.
- **La columna del medio no lleva elemento.** Es una pista vacía de la rejilla. Un div espaciador sería un nodo más en el árbol que no separa nada.
- **`<main>` envuelve solo el login**, que es el contenido principal de la pantalla. **`<footer>`** es la única `contentinfo` de la página.

### 10.2 El panel está oculto al lector de pantalla, y es seguro que lo esté

`aria-hidden="true"` en el contenedor del panel. Es correcto y no infringe nada **porque el panel no tiene ni un solo descendiente enfocable**: es un `<div>` vacío. La regla que se rompería (`aria-hidden` sobre un ancestro de algo enfocable) no tiene con qué dispararse hoy.

Y trae una obligación futura, declarada en §15.2: **el día que el slot lleve un anuncio con enlace, `aria-hidden` deja de ser legal.** Ese día el panel pasa a tener un nombre accesible y el enlace entra al orden de tabulación.

### 10.3 Los iconos deshabilitados no son una trampa de foco

Tres reglas, y las tres son verificables:

1. **`disabled` en un `<button>` real.** Lo saca del orden de tabulación por comportamiento del motor, no por CSS. No queda un anillo de foco sobre un control muerto.
2. **Prohibido `aria-disabled` sin `disabled`.** Un elemento con `aria-disabled="true"` sigue siendo enfocable: sería exactamente la trampa que se quiere evitar, un control que recibe foco, se anuncia como no disponible y no hace nada al pulsar Enter.
3. **Prohibido `tabIndex={0}`** y prohibido envolverlos en algo enfocable.

**No son focables y eso es lo correcto**, no un descuido: WCAG 2.4.3 ordena el foco de lo que es operable, y no exige que un control inactivo sea alcanzable. Lo que sí sería una infracción es lo contrario: un control enfocable que no responde a la activación (2.1.1).

Sí conservan **nombre accesible** (`aria-label`), porque un lector de pantalla que recorra el footer elemento por elemento tiene que poder saber que ahí hay dos redes y que todavía no están disponibles. La copia está en §12.

### 10.4 Contraste, color y movimiento

| Comprobación | Resultado |
|---|---|
| `--foreground` sobre `--canvas` | **16.54:1** |
| `--muted-foreground` sobre `--canvas` (copyright) | **5.57:1**, AA |
| Iconos deshabilitados (#5C6470 al 50% sobre `--canvas`) | **2.09:1** — **exento** por WCAG 1.4.3 (componentes inactivos). **Es el único uso de esa exención en todo el producto**, y está acá para que un auditor no lo reporte como hallazgo nuevo |
| Los cuatro grises del panel | Superficie decorativa sin texto: 1.4.3 no aplica. Pero los cuatro dan ≥ **10:1** con `--foreground`, así que el slot sigue siendo apto para texto el día que lo tenga |
| Anillo de foco | 2px `--primary` con `outline-offset: 2px`, sin cambios. En el panel no hay nada que enfocar |
| Estado nunca por color solo | Los iconos deshabilitados llevan **opacidad + nombre accesible**, no solo color |
| `prefers-reduced-motion` | §7.3. El panel queda quieto en `--anuncio-1`; el spinner sigue girando |
| Zoom al 200% | A 1024px de viewport con zoom 200% el ancho efectivo es 512px: **por debajo de 1024**, así que el panel desaparece y queda el login de una columna. Es decir, la respuesta a D10-6 **es también** la respuesta a WCAG 1.4.4 en esta pantalla, sin trabajo extra |
| `<html lang="es">` | Ya está en `app/layout.tsx` |

---

## 11. Inventario de componentes

### 11.1 shadcn oficial — `components/ui/`

Enumerado con `npx shadcn info` — **26 componentes** — `shadcn@4.19.1` sobre `@base-ui/react@1.7.0` — **2026-09-18**.

`accordion` · `alert-dialog` · `alert` · `badge` · `button` · `card` · `checkbox` · `command` · `dialog` · `dropdown-menu` · `field` · `input-group` · `input` · `label` · `popover` · `progress` · `radio-group` · `select` · `separator` · `sheet` · `skeleton` · `sonner` · `switch` · `table` · `textarea` · `tooltip`

La lista es **el inventario instalado, no una lista blanca cerrada**: si durante la ejecución hiciera falta una primitiva fuera de ella, comprobarla es el camino esperado, no una excepción. Lo que esta fase consume son cuatro:

| Componente | Import | Uso en esta fase |
|---|---|---|
| `Card`, `CardContent` | `@/components/ui/card` | La tarjeta del login. **Sin cambios**, tal como está hoy |
| `Button` | `@/components/ui/button` | Los dos iconos deshabilitados del footer (`variant="ghost" size="icon-sm" disabled`). El botón `Entrar` ya existe |
| `Field`, `FieldLabel`, `FieldError` | `@/components/ui/field` | Dentro de `FormularioLogin`, que no se toca |
| `Input` | `@/components/ui/input` | Igual |

### 11.2 Organismos nuevos — `app/(public)/login/_components/`

Por superficie, junto a la página que los usa, que es la convención del repo.

| Componente | Responsabilidad | Cliente o servidor |
|---|---|---|
| `PanelPublicidad` | La columna 1: contenedor con `p-xl` + tarjeta `rounded-2xl` con `bg-anuncio-1 animate-anuncio`. Acepta `children` como slot futuro (§3.3). `aria-hidden` y `hidden lg:block` | **Servidor.** Sin estado, sin efectos, sin `'use client'` |
| `PieDeLogin` | El footer: copyright con el año recibido por prop + los dos botones deshabilitados. Fila a partir de `lg:`, columna debajo | **Servidor.** Función pura de `anio: string` |
| `IconosRedes` | Exporta `IconoInstagram` e `IconoTikTok` como SVG inline. §11.3 | **Servidor** |

**Archivos modificados:** `app/(public)/login/page.tsx` (la rejilla, el `revalidate`, el `hoyBog()`) y `app/globals.css` (los cuatro grises, la animación, la utilidad de rejilla). **Nada más.**

### 11.3 Los dos iconos de marca, que no salen de lucide

Por el hallazgo B, `lucide-react@1.39.0` no exporta ninguna marca comercial. Reglas del SVG inline, y la primera es de CI:

1. **`fill="currentColor"` o `stroke="currentColor"`. NUNCA un valor de color literal.** El path oficial de una marca se copia con su color de relleno, y un hexadecimal dentro de un `.tsx` bajo `app/` **rompe el guardarraíl 6** de `check-service-role.sh`, que busca justo eso. Es el error más probable de este plan entero.
2. **`viewBox="0 0 24 24"`, tamaño por clase `size-4`** (16px), para igualar la métrica de los iconos lucide del producto.
3. **`aria-hidden="true"` y `focusable="false"`.** El nombre accesible vive en el `aria-label` del botón que los envuelve.
4. **Instagram va como trazo** (`fill="none" stroke="currentColor" strokeWidth={2}`): su marca es un contorno y así iguala el peso visual de los lucide. **TikTok va como relleno** (`fill="currentColor"`), porque su glifo solo existe sólido. **Esa asimetría de peso óptico es inevitable** y no es un defecto que perseguir: son dos marcas ajenas, no dos iconos de un mismo set.
5. **No se envuelven en un componente genérico `Icono`** ni se meten en `components/ui/`: son dos glifos de un footer, no primitivas del sistema.

### 11.4 Iconos lucide: la lista cerrada no crece

Esta pantalla ya usa `Eye`, `EyeOff` y `Loader2`, los tres dentro de `FormularioLogin`, que no se toca. **Esta fase no añade ningún icono lucide.** Los dos glifos de §11.3 son SVG del proyecto y quedan anotados como excepción declarada a la lista cerrada de `02-UI-SPEC` §14.3.

### 11.5 Tres trampas del repo que el executor tiene que tener delante

1. **`bg-[#E2E5E7]` rompe el build de CI.** Guardarraíl 6. Los cuatro grises solo pueden nombrarse en `app/globals.css`.
2. **Un `max-w-*` nuevo sin registrar en `cn()` no llega al DOM.** `lib/utils.ts`. Esta fase no debería necesitar ninguno (§4.2); si aparece, el registro no es opcional.
3. **`animate-anuncio` sin `bg-anuncio-1` deja el panel invisible con movimiento reducido.** §7.3. Es la clase que se borra "por redundante" en la primera limpieza.

---

## 12. Contrato de copywriting

Español de Colombia, trato de "tú". Sin signos de admiración, sin "¡Ups!", sin disculpas. Hereda el vocabulario fijo de `02-UI-SPEC` §15.

| Elemento | Copia | Estado |
|---|---|---|
| **Título del documento** | `Entrar · VivaGuest` | Ya existe, sin cambios |
| **Wordmark** | `VivaGuest` | Ya existe, sin cambios |
| **CTA primaria** | `Entrar` → `Entrando…` en vuelo | Ya existe, sin cambios |
| **Label de correo** | `Email` | Ya existe |
| **Label de contraseña** | `Contraseña` | Ya existe |
| **Toggle de contraseña** | `Mostrar contraseña` / `Ocultar contraseña` (`aria-label`) | Ya existe |
| **Aviso de contraseña olvidada** | `¿Olvidaste la contraseña? Pídele al administrador que te la restablezca.` — **sin enlace** | Ya existe |
| **Error: credenciales** | `Email o contraseña incorrectos.` — el mismo mensaje para email inexistente y para contraseña mala | Ya existe |
| **Error: cuenta desactivada** | `Tu cuenta está desactivada. Contacta al administrador.` | Ya existe |
| **Error: genérico** | `No se pudo completar la operación. Intenta de nuevo; si persiste, reporta el problema.` (de `mapDbError`) | Ya existe |
| **Copyright del footer** | `© {año} VivaGuest. Todos los derechos reservados.` — el año calculado, D10-5 | **NUEVO** |
| **Nombre accesible de Instagram** | `Instagram, aún no disponible` | **NUEVO** |
| **Nombre accesible de TikTok** | `TikTok, aún no disponible` | **NUEVO** |
| **Panel publicitario** | **Cero copia.** §12.1 | **NUEVO** |
| **Vacío del slot publicitario** | **Cero copia**, por decisión. §12.1 | **NUEVO** |
| **Acciones destructivas** | **Ninguna en esta pantalla.** No hay confirmaciones, no hay diálogos y no hay nada que se pueda deshacer | — |

### 12.1 El panel no lleva ni una palabra, y es una decisión

La tentación es rotularlo: `Espacio publicitario`, `Tu anuncio aquí`, `Publicidad`. **Ninguna entra**, por dos razones:

1. El panel es `aria-hidden="true"`. Cualquier texto ahí es texto que existe visualmente y no existe para un lector de pantalla: dos versiones de la misma pantalla.
2. Un rótulo de placeholder es copia que se despliega a producción. El admin que entra todos los días leería `Tu anuncio aquí` en el 36% de su pantalla de acceso, y eso no dice "producto"; dice "obra en construcción". **Un gris que rota no afirma nada**, y eso es exactamente lo que se quiere mientras no haya anunciantes.

Por la misma razón, **el estado "sin anunciante" del futuro tampoco tiene copia asignada hoy**: es la pregunta abierta 2 de `10-CONTEXT.md` y asignarle una frase acá sería decidirla por la puerta de atrás.

### 12.2 "aún no disponible" y no "próximamente"

`próximamente` es una promesa con fecha implícita, y `10-CONTEXT.md` no dice que las cuentas de redes vayan a existir: dice que los iconos van deshabilitados. `aún no disponible` describe el estado sin prometer nada, que es lo único que se puede afirmar hoy.

---

## 13. UI Considerations

Consideraciones de estado aplicables resueltas: **7 cubiertas · 2 con red de seguridad · 0 sin resolver**.

| Categoría | Elemento | Estado | Resolución |
|---|---|---|---|
| empty | Slot publicitario sin anunciante | ✅ covered | El ciclo de cuatro grises **es** el estado vacío del slot; no lleva copia, por §12.1 |
| loading | Botón `Entrar` | ✅ covered | Heredado sin cambios: `disabled` + `Loader2` + `Entrando…` (§9) |
| error | Credenciales, cuenta desactivada, genérico | ✅ covered | Las copias están en §12; el desplazamiento de 12.5px del bloque centrado está medido y aceptado en §9.1 |
| populated | Formulario con los dos campos llenos | ✅ covered | Sin cambio de alto: el `Input` es de alto fijo (`h-8`) y no crece con el contenido |
| long-text | El mensaje de error más largo | ✅ covered | Medido en §9.1: tres de los cuatro mensajes caben en una línea a 14px en 368px; el genérico usa dos y desplaza 25px en vez de 12.5px |
| long-text | Copyright del footer a 390px | ✅ covered | Medido en §8.1: 288 + 16 + 60 = 364px contra 358px disponibles, por eso el footer apila debajo de `lg:` |
| overflow | El panel por debajo de 1024px | ✅ covered | `hidden lg:block`. Y el piso aritmético de 995.6px de §2.2 demuestra que el corte está en el sitio correcto |
| overflow | Alto del bloque del login en el viewport más bajo | ✅ covered | 321px de bloque contra 625px de región a 1024 × 768: 152px de holgura por lado (§2.3) |
| zero-one-many | — | n/a | La pantalla no tiene ninguna colección. Los dos iconos son un par fijo, no una lista |
| partial | — | n/a | No hay datos parciales: la pantalla no lee nada de la base |
| **movimiento reducido** | El panel con `prefers-reduced-motion: reduce` | 🧪 backstop | Playwright con `reducedMotion: 'reduce'`: el `background-color` computado del panel resuelve a `--anuncio-1` y su `animation-duration` es `0s`, **y** el spinner del botón sigue con duración distinta de cero |
| **percepción del fundido** | Que el paso de 1.115:1 se vea de verdad | 🧪 backstop | Ningún test automático puede juzgar si un paso de contraste se percibe. Visto por un humano a 1440px, con el ciclo corriendo 20 segundos completos, antes de aprobar la fase |

---

## 14. Registry Safety

| Registry | Bloques usados | Safety Gate |
|---|---|---|
| shadcn oficial (`@shadcn`) | **ninguno nuevo.** Los 26 componentes ya están instalados desde fases anteriores; esta fase no corre `npx shadcn add` | no aplica — registry oficial y sin instalación |
| Terceros | **ninguno** | no aplica — `registries: {}` en `components.json`, verificado con `npx shadcn info` el 2026-09-18 |

No se declaró ningún registry de terceros, así que la compuerta de vetting (`shadcn view` + escaneo de patrones) **no se ejecutó porque no había nada que vetar**. Si en ejecución alguien quisiera traer un bloque de login de un registry externo, este documento tiene que reabrirse y correr la compuerta antes.

**Nota de procedencia relacionada, que no es de registry pero se parece:** los dos SVG de marca de §11.3 **no vienen de un registry**. Se transcriben a mano desde los recursos oficiales de cada marca, y la única comprobación automática que los cubre es el guardarraíl 6, que atrapa el color literal. El resto (que el path sea el correcto y que el glifo sea legible a 16px) es revisión humana.

---

## 15. Deuda declarada de este contrato

Se documenta acá para que `gsd-ui-auditor` no la reporte como hallazgo nuevo.

1. **El resto del dashboard sigue sin rediseñar.** El objetivo del ROADMAP para la Fase 10 es "que el dashboard del admin deje de verse como shadcn recién instalado". Esta fase entrega **una** pantalla, que es lo único que `10-CONTEXT.md` cerró. `/operacion`, `/apartamentos`, `/aseadores` y `/finanzas` siguen con el tema por defecto y el `baseColor: neutral` que D10-1 identificó como el problema real. **La fase no cierra el objetivo del ROADMAP y no debe declararse como si lo cerrara.**
2. **`aria-hidden` en el panel caduca con el primer anuncio real.** Un anuncio con enlace dentro de un contenedor `aria-hidden` es una infracción de 4.1.2 y un enlace inalcanzable por teclado. Ese día el panel necesita nombre accesible y el enlace entra al orden de tabulación.
3. **`display: none` no evita la descarga de una imagen.** Hoy no importa (no hay imagen). Cuando la haya, el panel necesita `<picture>` con atributo `media`, o pasa a ser frontera de cliente. Un teléfono descargando el creativo de un panel que nunca va a ver es coste directo sobre el plan de datos del aseador.
4. **El formulario tiene controles de 32 y 28px en una pantalla que el aseador usa desde el teléfono.** El `Input` es `h-8` y el toggle de contraseña es `icon-sm`; el piso de 44px de `05-UI-SPEC` es exclusivo de `app/(cleaner)/` y `check-escala-movil.sh` no mira `app/(public)/`. No es alcance de esta fase (el formulario no se toca) pero es un hueco real del contrato de toque, y el `Input` a `text-base` debajo de `md:` es lo único que hoy evita el zoom automático de iOS en esa pantalla.
5. **Dos iconos deshabilitados son mobiliario permanente si las cuentas nunca existen.** D10-5 los pide así y no se discute. Pero si en tres meses no hay Instagram ni TikTok, lo correcto es quitarlos, no dejarlos apagados para siempre.
6. **Marcas ajenas.** Instagram y TikTok tienen guías de marca sobre uso, color y área de respeto de sus glifos. Se dibujan en `currentColor` monocromo a 16px, que es el uso más conservador posible, pero **nadie revisó las guías**. Queda dicho.
7. **`revalidate = 3600` significa que el primer visitante después de medianoche del 1 de enero ve el año anterior.** ISR regenera con la primera petición pasada la ventana: ese visitante recibe el HTML viejo y dispara la regeneración; el siguiente ya ve el año correcto. Es un año en un pie de página, una vez al año, y el precio de la alternativa (`force-dynamic`) es perder el HTML estático en todas las demás visitas.
8. **La pregunta abierta 1 de `10-CONTEXT.md` sigue sin responder:** quien entra por esta pantalla es el admin, no un propietario. Si la publicidad se va a vender dirigida a propietarios, el login es la pantalla equivocada. **Esta fase construye el slot igual**, porque construirlo es reversible y cuesta un `<div>`; lo que no se debe hacer es vender el espacio antes de responder eso.

---

## Checker Sign-Off

- [ ] Dimensión 1 Copywriting: PASS
- [ ] Dimensión 2 Visuals: PASS
- [ ] Dimensión 3 Color: PASS
- [ ] Dimensión 4 Typography: PASS
- [ ] Dimensión 5 Spacing: PASS
- [ ] Dimensión 6 Registry Safety: PASS
- [ ] Dimensión 7 Inventory Provenance: PASS

**Aprobación:** pending
