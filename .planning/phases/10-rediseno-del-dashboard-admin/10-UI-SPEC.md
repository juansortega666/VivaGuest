---
phase: 10
slug: rediseno-del-dashboard-admin
status: draft
shadcn_initialized: true
preset: none (`components.json` ya existe, `style: base-nova`, `registries: {}`, verificado con `npx shadcn info` el 2026-09-18)
created: 2026-09-18
---

# Fase 10 — Contrato de diseño de UI

## DEROGACIÓN 2026-09-26

> **Léelo antes que nada.** Este documento se escribió el 2026-09-18 y los planes 10-01, 10-02 y
> 10-03 lo ejecutaron al pie de la letra. El 2026-09-26 el dueño miró la pantalla entregada y la
> **rechazó**. No fue un defecto de implementación: fue un cambio de decisión, y el plan 10-04 lo
> implementó. Las secciones §2, §3, §7.3, §8.1, §10.1, §10.4, §11.5, §13 y §15 están actualizadas
> contra el diseño nuevo, y conservan lo derogado como registro.

**Referencia nueva:** la pantalla de acceso de **Runway** (refero.design, página
`96ea87d0-db62-4b18-8b39-46a960461f51`, "Runway Log In UI"). Las seis medidas se tomaron sobre la
captura de 2732x1536 en esa sesión, no de memoria:

| Propiedad | Medida en la referencia |
|---|---|
| Corte del split | **50.3%** del ancho. Dos columnas, sin canal vacío entre ellas |
| Panel izquierdo | Imagen **a sangre completa**: pegada a los cuatro bordes, 100% del alto, sin padding, sin radio, sin tarjeta |
| Wordmark del panel | `runway` en blanco, DENTRO del panel, arriba a la izquierda, a ~32px de los dos bordes |
| Columna derecha | Fondo blanco, el bloque del formulario centrado en los dos ejes, ~330px de ancho a 1366px de viewport |
| Superficie del formulario | **Ninguna**: sin borde, sin sombra, sin tarjeta. Solo los `Input` llevan borde propio y ~10px de radio |
| Orden vertical | Título centrado, luego los campos, luego el botón primario a ancho completo |

**Qué queda derogado, y qué sobrevive de cada decisión:**

| Decisión | Decía | Queda derogado | Sobrevive |
|---|---|---|---|
| **D10-2** | "publicidad 45% izquierda · login 45% derecha · footer full-width" | el reparto y la posición del pie | qué va en cada lado: publicidad izquierda, login derecha, pie abajo |
| **D10-3** | "la proporción es 45/45, NO 75/25", con GlossGenius como referencia | el número y la referencia | **su razón de fondo, que es la que hace admisible el 50%:** un formulario de login necesita de 360 a 440px para no verse apretado, y a 1280px el 50% son 640px. El techo del 51% medido en el corpus de ~1.300 logins (Wealthsimple) tampoco se rompe |

**Lo que NO se deroga:** D10-1 (no se cambia de biblioteca), D10-4 (el placeholder animado entre
grises), D10-5 (el pie con el año calculado y las redes en disabled), D10-6 (debajo de 1024px el
panel desaparece) y D10-7 (la identidad no se toca). Las cinco siguen cerradas.

**La referencia del 2026-09-18 (GlossGenius, refero.design/pages/767d341f-df17-46d2-b246-8b8771686900)
no se borra de este documento.** Un contrato de diseño que se reescribe en silencio es un contrato
que nadie puede auditar, y esta fase lleva tres planes ejecutados contra el texto viejo.

---

> Contrato visual y de interacción. Lo consumen `gsd-planner` y `gsd-executor`.
> Idioma de la interfaz: **español de Colombia, trato de "tú"**. Código, tokens, rutas y REQ-IDs quedan como están.

**Alcance de este documento: `/login` y nada más.** `10-CONTEXT.md` cierra hoy solo esa pantalla y deja el resto del dashboard explícitamente abierto ("el resto del dashboard… se definen después"). Este contrato **no dice nada** sobre `/operacion`, `/apartamentos`, `/aseadores`, `/finanzas` ni el árbol del aseador. Si un plan de esta fase toca un archivo fuera de `app/(public)/login/`, `app/globals.css` y `e2e/login.spec.ts`, el alcance se rompió.

**REQ-IDs cubiertos:** ninguno nuevo. `PLAT-01` y `PLAT-02` ya están entregados y esta fase **no cambia su comportamiento**: cambia el marco alrededor del formulario.

**Este documento hereda `02-UI-SPEC.md` completo** (paleta, escala de espaciado, tipografía, movimiento, accesibilidad, vocabulario y §12.1, que es la especificación vigente de `/login`). Hereda también las reglas de ancho de `08-UI-SPEC` §2.2 y la excepción de movimiento del spinner. **No hereda `05-UI-SPEC` §3.1** (la escala `-movil`): esa es exclusiva de `app/(cleaner)/` y `/login` vive en `app/(public)/`.

**Entradas leídas:** `10-CONTEXT.md` (D10-1 a D10-7, todas cerradas), `.planning/ROADMAP.md` §Phase 10, `.planning/STATE.md`, `.planning/REQUIREMENTS.md`, `.planning/codebase/STACK.md`, `02-UI-SPEC.md`, `08-UI-SPEC.md`, `CLAUDE.md`, `app/globals.css` entero (738 líneas), `app/layout.tsx`, `app/(public)/login/page.tsx`, `app/(public)/login/_components/FormularioLogin.tsx`, `lib/utils.ts`, `lib/domain/dates.ts`, `components/ui/{card,button,input,field}.tsx`, `components.json`, `next.config.ts`, `playwright.config.ts`, `e2e/login.spec.ts`, `scripts/ci/check-max-w-tallas.sh`, `scripts/ci/check-service-role.sh` y `.next/prerender-manifest.json` del último build.

---

## 0. Lo que esta fase renderiza de verdad

> **ACTUALIZADO EL 2026-09-29.** Hasta el plan 10-04 esta sección hablaba de UNA sola pantalla,
> `/login`. **La fase renderiza DOS**: `/login` y `/operacion`, la pantalla de trabajo del admin,
> cuyo rediseño decidió el dueño el 2026-09-28. Su contrato entero vive en **§16**, y las filas de
> abajo marcadas `/operacion` son sus hechos anclados. Lo que sigue sin cambiar es que **la fase
> NO cierra el objetivo del ROADMAP**: ver la deuda 1 de §15.

### Hechos anclados de `/operacion` (2026-09-29)

| Hecho anclado | Consecuencia de diseño |
|---|---|
| **El dueño describió la pantalla como genérica e ilegible el 2026-09-28**, y nombró el defecto concreto: el estado del día no se entiende de un vistazo | El eje de la pantalla pasa de "relativo a hoy" a **un selector de día**, y arriba va un vistazo de cuatro métricas que se lee en cinco segundos. §16.3 |
| **`agruparPorDia()` codificaba `Atrasados / Hoy / Mañana / Siguientes` dentro de la CAPA DE DATOS.** Con un selector de día, `Mañana` deja de tener significado | La función muere y con ella sus tres bloques y su estado de colapso. Se deroga `04-UI-SPEC` §8.1 en la parte de la agrupación, no en la del día vacío. §16.1 |
| **`--container-rail` son 360px fijos y tenía UN consumidor de aplicación en todo el repo** (medido con `grep -rn` sobre `app/`, `components/`, `lib/` y `e2e/`) | Se **retira** el token, no se le cambia el valor, y el reparto pasa a `@utility rejilla-operacion` con dos pistas `fr`. A 1280 el 30% da los mismos 360px. §16.2 |
| **`TopNav` lo renderiza `app/(admin)/layout.tsx`, y un layout de App Router NO recibe `searchParams`** | Al mudar el panel de alertas a una campana de la barra superior, el toggle `Ver atendidas` **se invierte a estado de cliente**, y eso invierte la regla de 04-13 con su razón escrita. §16.5 |
| **`is_urgent` solo se mantiene para `scheduled_date >= public.today_bog()`** (el `where` de los RPC de sincronización) | En un día pasado la métrica `Urgentes` dice el guion con `no aplica`, no una cifra congelada. Recalcularla al leer sería una segunda verdad sobre el mismo dato. §16.3 |
| **`expenses` solo tiene `created_at`: no tiene día de negocio.** El proyecto ya decidió en tres migraciones que un gasto pertenece al día en que el aseo se CERRÓ | La decisión del dueño para esta pantalla (el día en que el aseo estaba PROGRAMADO) **diverge a propósito**, y la frase entera viaja en el `title` de la métrica. Las dos cifras pueden no coincidir y no es un defecto. §16.3 |
| **`SheetContent` se portaleaba a `document.body`, y al pasar el detalle a inline ese ámbito desaparece.** `08-11` midió dos aserciones de seguridad en verde con la palabra prohibida presente | El detalle gana localizador propio (`[data-slot="detalle-aseo"]`) y el control de alcance de 08-11 **se vuelve a correr en los dos sentidos**. Medido el 2026-09-29. §16.8 |
| **`02-UI-SPEC` §4.6 ya declara el choque de hues entre `--primary` (29) y `--destructive` (13.7)** | La señal de calendario caído sale en `--status-warn` y no en el rojo que el dueño pidió, porque un tercer rojo pondría tres rojos en una pantalla. **Desviación declarada, y el dueño la revisa en el checkpoint.** §16.6 |
| **La barra de ambiente de pruebas mide 48px y la suite E2E corre justo donde se pinta** | Toda medida vertical se toma contra el contenedor de página, y su resta va dentro del `calc()` de la altura cerrada. 10-04 pagó esta misma trampa en `/login`. §11.5 punto 5 |

### Hechos anclados de `/login` (2026-09-26)

| Hecho anclado | Consecuencia de diseño |
|---|---|
| **Reparto 50/50 sin canal, decidido el 2026-09-26** (deroga D10-2 y D10-3, que pedían 45% · 10% de canal · 45%) | Dos pistas del 50% y ninguna pista vacía que repartir. El login se coloca en la columna 2. §2.1 dice por qué, y §2.2 mide qué pasa en cada viewport |
| **El pie vive dentro de la columna del login, no a ancho completo** (deroga la otra mitad de D10-2) | La región del split queda como único hijo del contenedor, así que el panel se lleva el alto entero. §8.1 |
| **D10-4: la publicidad es un placeholder animado entre cuatro grises**, 5s por paso, 600ms de transición, apagada bajo `prefers-reduced-motion` | Son **cuatro tokens de color nuevos** y **una animación de CSS**, cero JavaScript. §6.1 y §7 |
| **Los cuatro grises no pueden salir de la paleta actual.** Medido: `--canvas` contra `--muted` da **1.037:1**, que en un cross-fade de 600ms sobre 600px de ancho no se ve | La fase declara cuatro grises propios con paso adyacente ≥ **1.11:1**. §6.1 |
| **D10-4 exige que el panel siga visible con el movimiento apagado** | El bloque global de `prefers-reduced-motion` de `globals.css` pone `animation-duration: 0s`, y con `animation-fill-mode: none` el elemento cae a **su propio `background-color`**. Por eso `bg-anuncio-1` en la clase base **no es redundante: es el estado de movimiento reducido**. §7.2 |
| **`lucide-react@1.39.0` no exporta ni `Instagram` ni `TikTok`.** Medido: 6143 exports, cero marcas comerciales (`Facebook`, `Twitter`, `Youtube`, `Linkedin`, `Github` tampoco existen) | Los dos iconos del footer son **SVG inline en un componente del proyecto**, con `fill="currentColor"` obligatorio: un `#000000` en un `.tsx` bajo `app/` **rompe el guardarraíl 6** de `check-service-role.sh`. §11.3 |
| **`/login` está prerenderizado como estático.** Medido en `.next/prerender-manifest.json` del último build: la ruta está listada con `initialRevalidateSeconds: false` | `new Date().getFullYear()` en la página **congela el año en el momento del build**. El año sale de `hoyBog().slice(0, 4)` y la página declara `revalidate`. §8.2 |
| **El proceso corre en UTC** (Vercel y CI), y `lib/domain/dates.ts` ya tiene la advertencia escrita | Entre las 19:00 y las 23:59 de Bogotá del 31 de diciembre, UTC ya es el año siguiente: el footer mostraría `2027` cinco horas antes. Es el mismo defecto de clase que `fecha_aseo` como `timestamptz`. §8.2 |
| **D10-6: debajo de 1024px el panel desaparece, no se apila ni se encoge** | `display: none` por variante `lg:`, no renderizado condicional: el servidor no conoce el viewport y un hook de cliente introduce un parpadeo en la primera pintura. §2.4 |
| **D10-7: la identidad no se toca.** `max-w-login` son 400px | Ese 400 es lo que fija el piso del split: `400 + 2 × 24` de padding no cabe en el 50% por debajo de **896px** de viewport. El corte en 1024 del dueño queda **128px por encima del piso aritmético**. Con el 45% derogado el piso estaba en 995.6px y la holgura era de 28.4px. §2.2 |
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
| **`aspect-ratio` fijo para el panel** | Tentador para "preparar" el slot, y desde el 2026-09-26 además imposible: el panel ES la mitad de la pantalla y no tiene forma que prometer (§3.2). Medido con el señuelo 2b de 10-04: devolverle `aspect-[0.93] max-h-full` a 1280x720 empuja el contenedor de 672 a 744px y la pantalla se pone a hacer scroll, con el botón `Entrar` por debajo del pliegue |
| **Un `<aside>` para el panel** | `<aside>` es una *landmark* `complementary`. Una landmark con `aria-hidden="true"` es una contradicción: se anuncia en el índice de regiones y no tiene contenido. Va un `<div>` pelado. §10.2 |
| **Capar el footer a `max-w-admin` (1440px)** | Ya no hay nada que capar: **desde el 2026-09-26 el pie vive dentro de la columna del login y su ancho lo decide esa columna** (§8.1). La razón derogada era que D10-2 lo pedía full-width, con la alineación gratis del copyright contra el borde de la tarjeta del anuncio; esa tarjeta desapareció con el sangrado completo |
| **Poner el split en un `app/(public)/layout.tsx`** | Amarraría cualquier página pública futura (recuperación de contraseña, aviso legal) al panel publicitario sin que nadie lo haya decidido. El split es una propiedad **de la pantalla de login**, no del grupo de rutas. Vive en `page.tsx` y sus organismos, en `_components/` |

---

## 2. La geometría: 50 · 50

> **DEROGADA 2026-09-26 la versión anterior de esta sección**, que titulaba "45 · 10 · 45" y
> repartía un canal central vacío del 10%. Lo que sigue es el reparto vigente. La tabla de las tres
> reparticiones posibles de aquel 10% se conserva abajo como registro de lo que se decidió el
> 2026-09-18, porque explica por qué el panel quedó anclado al borde izquierdo (y eso sí sobrevive).

### 2.1 Dos pistas, sin canal

`grid-template-columns: 50% 50%`. No hay tercera pista, no hay hueco entre las columnas y el borde
derecho del panel es el mismo píxel que el borde izquierdo de la columna del login. **El login se
coloca con `lg:col-start-2`**, no con `lg:col-start-3`.

Medido en la referencia de Runway, el corte está en el **50.3%** del ancho y las dos columnas se
tocan. El 50% queda justo debajo del techo del 51% que se midió en el corpus de ~1.300 logins.

**Registro de lo derogado.** El 2026-09-18 D10-3 cerraba dos números (45 y 45) y dejaba el tercero
sin asignar. Las tres reparticiones posibles de aquel 10%, con el veredicto de entonces:

| Repartición | Qué se veía | Veredicto de 2026-09-18 |
|---|---|---|
| **10% de canal central** | El panel anclado al borde izquierdo de la pantalla (con su propio recuadro de 24px) y el login al derecho; todo el aire sobrante entre los dos | ELEGIDA entonces, **derogada el 2026-09-26** |
| 5% + 5% de márgenes exteriores | El panel flotando con 96px de blanco a su izquierda y 24px a su derecha | Descartada: un espacio publicitario que algún día se vende ocupa el borde de la pantalla, no el centro |
| 10% de margen derecho | El login pegado al panel y todo el aire al final | Descartada: dejaría el formulario a 24px del panel animado |

**Lo que sobrevive de ese razonamiento y sigue vigente:** el espacio publicitario ocupa el borde de
la pantalla. Con el 50/50 a sangre completa eso se cumple de la forma más literal posible, y sin
ningún blanco que repartir: la pantalla pasa de tener dos números (los 24px del recuadro y el 10%
del canal) a tener **cero**.

**La rejilla se declara como utilidad, no como valor arbitrario en la clase:**

```css
/* ── Fase 10: la rejilla de /login — 10-UI-SPEC.md §2 ────────────────────────
   50% publicidad · 50% login, sin canal entre las dos.

   DEROGACION 2026-09-26, decidida por el dueno contra una referencia medida: la
   pantalla de acceso de Runway, cuyo corte del split es el **50.3%** del ancho y
   cuyas dos columnas se tocan, sin hueco. Eso DEROGA D10-2 (el reparto y el pie
   full-width) y D10-3 (el 45/45 con GlossGenius como referencia). [...]

   YA NO HAY PISTA VACIA: el login se coloca en la columna 2, con
   `lg:col-start-2`. La version derogada ponia un canal del 10% en el medio y
   mandaba el login a la tercera pista.                                        */
@utility rejilla-login {
  grid-template-columns: 50% 50%;
}
```

Va como `@utility` y no como `grid-cols-[50%_50%]` en el JSX por la misma razón por la que los 120ms
de movimiento viven en `@utility transicion`: el reparto es el contrato de la pantalla y tiene que
estar en UN sitio, con su razón al lado. Tailwind v4 no tiene namespace de plantilla de rejilla, así
que un token no es posible; una utilidad sí, y acepta variantes (`lg:rejilla-login`).

### 2.2 El presupuesto horizontal, medido en los cinco viewports

El bloque del login sigue midiendo 400px (`max-w-login`) y su columna sigue llevando `lg:p-xl`
(24px por lado). El pie mide 56px a partir de `lg:` y vive **dentro de la columna del login** (§8.1).

| Viewport | Columna del panel (50%) | Columna del login (50%) | Aire a cada lado del bloque | Pie (x, ancho) |
|---|---|---|---|---|
| **1920** | 960 | 960 | 280 | 960, 960 |
| **1440** (referencia) | 720 | 720 | 160 | 720, 720 |
| **1280** (el del proyecto) | **640** | **640** | **120** | **640, 640** |
| **1024** (arranque del split) | **512** | **512** | **56** | **512, 512** |
| 1023 | no se renderiza | ancho completo | como hoy | ancho completo |
| **390** | no se renderiza | ancho completo | 16 (`p-lg`, como hoy) | ancho completo, apilado |

**El piso aritmético baja, y eso es un resultado del cambio de reparto, no un detalle.** El bloque
mide 400px y su columna lleva 24px de padding por lado, así que la columna necesita **448px**:

```
448 / 0.50 = 896px de viewport
```

**Por debajo de 896px el 50% empezaría a comerse el padding del bloque.** Con el 45% derogado ese
piso estaba en `448 / 0.45 = 995.6px` y el corte de D10-6 en 1024 quedaba con **28.4px** de holgura;
con el 50/50 la holgura sube a **128px**. El corte que el dueño escogió sigue siendo correcto por
aritmética, y ahora con margen de sobra.

Y el aire a cada lado del bloque a 1024 pasa de 30.4 a **56px**: la columna mide 512, el bloque 400,
y `(512 − 400) / 2 = 56`, muy por encima de los 24 de `lg:p-xl`. Esa es la cifra que hace visible el
modo de fallo, y es la razón de medirla en el viewport más apretado y no en el más cómodo. Está
afirmada en `e2e/login.spec.ts`.

### 2.3 El presupuesto vertical

**Con el pie mudado a la columna del login, la región del split es el ÚNICO hijo del contenedor de
la pantalla y se queda con todo su alto.** El panel va del borde superior al inferior de ese
contenedor: ya no hay 56px de pie restándole altura, y no hay tarjeta con forma propia que recorte
nada. El panel es, literalmente, la mitad izquierda entera.

| Viewport | Pantalla | Viewport útil | Panel (a sangre completa) |
|---|---|---|---|
| 1920 × 1080 | 1080 | 993 | 960 × **993** |
| 1440 × 900 | 900 | 810 | 720 × **810** |
| 1280 × 800 | 800 | 700 | 640 × **700** |
| 1024 × 768 | 768 | 681 | 512 × **681** |
| 390 × 844 | 844 | 664 | no se renderiza |

A 1280 × 720 con la barra de ambiente de pruebas puesta (48px), el panel mide **640 × 672**. Esa es
la geometría que mide la suite E2E, y la razón de que el sangrado se afirme contra
`[data-slot="pantalla-login"]` y nunca contra el viewport (§11.5, trampa 4).

**El bloque del login mide 321px y cabe en los cinco.** Medido contra las primitivas instaladas, no
estimado. La única fila que cambia respecto de la versión derogada es la de la `Card`, que ya no
existe: el bloque perdió sus 32px de `py-(--card-spacing)`.

| Pieza | Cálculo | Alto |
|---|---|---|
| Wordmark `VivaGuest` | `text-display` 24px × 1.2 | **29px** |
| `mb-2xl` bajo el wordmark | | 32px |
| ~~`Card`: `py-(--card-spacing)`~~ | derogada el 2026-09-26: el bloque no tiene superficie | ~~32px~~ **0** |
| Campo `Email` | label 14 × 1.375 = 19 + `gap-2` 8 + `Input` `h-8` 32 | **59px** |
| `gap-lg` del `<form>` | | 16px |
| Campo `Contraseña` | igual que el anterior | **59px** |
| `gap-lg` | | 16px |
| Botón `Entrar` | `size="lg"` → `h-9` | **36px** |
| `gap-sm` | | 8px |
| Aviso de contraseña olvidada | `text-micro` 12 × 1.4 = 17, **dos líneas** | **34px** |
| | | **Total 289px** |

**Sin la tarjeta el ancho útil del bloque pasa de 368 a 400px**, así que el aviso de 71 caracteres a
12px tiene 32px más de sitio. Se sigue contando a dos líneas por prudencia: si cupiera en una, el
bloque sería aún más bajo y la holgura vertical solo crece.

**Holgura vertical:** el caso más apretado sigue siendo 1024 × 768, y ahí el bloque comparte columna
con el pie de 56px. El caso `a 1024x768 el login no queda debajo del pliegue` de `e2e/login.spec.ts`
lo defiende y **no se editó** en el rediseño: mide la misma propiedad y siguió verde por sí solo.

### 2.4 Debajo de 1024px: el panel desaparece por CSS

```
hidden lg:block
```

**`display: none`, no renderizado condicional, y no es un atajo.** Un renderizado condicional
necesita conocer el viewport, y eso solo se sabe en el cliente: o se mete un hook de media query (y
el panel aparece después de la primera pintura, con un salto visible justo en el arranque de la
pantalla) o se adivina en el servidor. Con `display: none` el panel simplemente no existe en la
pantalla del teléfono, y una animación sobre un elemento con `display: none` **no avanza**: no hay
coste de pintura.

**Lo único que cambia con el rediseño es DÓNDE se declara el corte.** Ya no está en la raíz de
`PanelPublicidad` sino en su envoltorio, `data-slot="columna-anuncio"`, porque el wordmark blanco
tiene que desaparecer con el panel: dos declaraciones del mismo breakpoint en dos sitios se
desincronizan a la primera. La propiedad que D10-6 compra no cambia ni un ápice.

Lo demás debajo de 1024px es **exactamente la pantalla de hoy**: `p-lg`, `bg-canvas`, bloque de
ancho completo con tope de 400px, centrado, y el pie apilado abajo ocupando la pantalla entera
(debajo de `lg:` la columna del login ES la pantalla).

**Y hay una deuda que nace aquí, declarada en §15.3:** cuando el slot cargue una imagen real,
`display: none` **no evita la descarga**.

---

## 3. El panel: sangrado completo, no tarjeta insertada

> **INVERTIDA EL 2026-09-26.** Esta sección decía exactamente lo contrario (tarjeta insertada con
> `p-xl`, `rounded-2xl` y forma propia) y así se construyó en 10-01 y se corrigió el 2026-09-19. El
> dueño la derogó al escoger Runway como referencia. Las tres razones de entonces se conservan
> abajo, con lo que implica cada una hoy: dos se convierten en deuda o en pregunta, y una se
> resuelve sola.

### 3.1 La decisión

**Sangrado completo.** El slot ocupa los cuatro bordes de su columna, al 100% del alto, sin
recuadro, sin radio, sin relación de aspecto y sin superficie propia. Medido en la referencia de
Runway: la imagen está pegada a los cuatro bordes y ocupa el alto entero.

Clase del elemento animado: `size-full overflow-hidden bg-anuncio-1 animate-anuncio`.
`overflow-hidden` se queda para el día que entre un creativo real; `bg-anuncio-1` se queda porque es
el estado de movimiento reducido (§7.3) y **no es redundante con los keyframes**.

**Las tres razones de la decisión derogada, y qué implica cada una ahora:**

1. **"El slot tiene que aceptar cualquier relación de aspecto, y ninguna le va a calzar."** Seguía
   siendo cierto, y a sangre completa se convierte en **deuda declarada** (§15.9): un creativo real
   se recorta con `object-fit: cover` o deja franjas contra el borde del navegador, y recortar un
   anuncio es cortarle el logo. La tarjeta permitía `object-contain` con las franjas cayendo sobre
   una superficie que se leía como marco intencional. Eso se perdió a cambio del diseño que el dueño
   escogió, y queda escrito para que nadie lo redescubra cuando llegue el primer anunciante.
2. **"Un gris a sangre completa contra el borde del navegador es indistinguible de un esqueleto de
   carga."** Esta razón **no se puede resolver calculando**: es percepción. Pasa a ser una pregunta
   explícita del juicio humano del plan 10-04 (§13, fila de la percepción del fundido), y es la
   pregunta nueva que el rediseño abre.
3. **"La tarjeta es donde vive el estado sin anunciante."** Se resuelve sola: ese estado vive ahora
   dentro del panel entero. Sigue siendo la pregunta abierta 2 de `10-CONTEXT.md` y sigue sin
   responderse en esta fase.

**Radio:** ninguno. El `rounded-2xl` (10.8px) de la versión derogada desaparece, y `e2e/login.spec.ts`
afirma que el `border-radius` computado del elemento animado es `0px`.

### 3.2 Ya no se promete ninguna relación de aspecto, y ahora la razón es otra

La versión derogada medía el ratio de la tarjeta en los cuatro viewports (de 0.715 a 0.918, un 28%
de variación) para concluir que **no se puede declarar `aspect-ratio`**. La conclusión sobrevive,
pero su razón cambia por completo: no es que el ratio varíe demasiado, es que **el panel ES la mitad
de la pantalla** y no tiene forma que prometer. Se estira con la región y ya.

Lo que no cambia: **cuando haya anunciantes, el contrato con ellos no puede ser "una imagen".** Tiene
que ser un creativo que tolere un retrato de ratio variable, y ahora además a sangre completa, con
el recorte que eso implica. Es la pregunta abierta 2 de `10-CONTEXT.md` y **no se responde en esta
fase**.

### 3.3 El slot es un `children`, no un componente cerrado

```tsx
// app/(public)/login/_components/PanelPublicidad.tsx
export function PanelPublicidad({ children }: { children?: React.ReactNode })
```

**Sin cambios.** Hoy nadie le pasa `children` y el panel pinta el ciclo de grises. El día que haya un
creativo, entra por ahí y el ciclo se convierte en el fondo sobre el que se posa. La firma con
`children` se escribió en 10-01 aunque hoy esté sin usar: es la diferencia entre un slot y un
rectángulo, y es lo único que D10-4 pide preparar.

Lo que **no** entra hoy, y no es un olvido: conteo de impresiones, rotación de creativos, orden de
anunciantes, estado sin anunciante, `<a>` envolvente. Todo eso es la pregunta abierta 2.

### 3.4 El wordmark del panel

Desde el 2026-09-26 hay **dos wordmarks** en la pantalla: el de siempre, centrado encima del
formulario y dentro del `<main>`, que sigue siendo el único `<h1>` de la página; y uno nuevo sobre el
panel, arriba a la izquierda, a 32px (`2xl`) de los dos bordes, en **blanco**, como en la referencia.

**No vive dentro de `PanelPublicidad`, y eso no es cosmético.** La raíz del panel lleva
`aria-hidden="true"`, así que un texto renderizado ahí dentro desaparece del árbol de accesibilidad
**sin que la pantalla cambie ni un píxel**. El wordmark es hermano del panel dentro del envoltorio
`data-slot="columna-anuncio"`, que lleva el `relative` que lo ancla. El E2E lo defiende con
`closest('[aria-hidden="true"]') === null` y no con un localizador de texto: los localizadores de
texto de Playwright no filtran subárboles `aria-hidden` y darían verde con el defecto puesto
(medido: con el wordmark dentro del panel, `getByText('VivaGuest')` encuentra 3 elementos).

**El `<h1>` no se muda al panel**, y la alternativa se descartó con razones: dejaría al `<main>` sin
encabezado y pondría el único encabezado de nivel 1 de la página flotando sobre una región
decorativa. El wordmark del panel es un `<p>` y **no lleva `aria-hidden`**: un lector de pantalla lee
la marca dos veces, que es redundancia y no barrera (§15.11).

**El color es blanco y su contraste es una infracción conocida y aceptada. Ver §10.4.**

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

`--primary` sigue en los cinco usos de `02-UI-SPEC` §4.4. En esta pantalla aparece en **uno**: el botón `Entrar` (uso 1).

> **DEROGADO 2026-09-28.** Esta línea decía **dos** usos, y el segundo era el anillo de
> foco de los controles (uso 3 de la lista cerrada). Ya no: `--ring` dejó de derivar de
> `--brand` y ahora deriva de `--status-progress`, que es azul y no es de marca. Motivo
> medido el 2026-09-22 en el navegador: el anillo de marca (#d1382c) y el borde de error
> (`--destructive`, #9f1239) dan **1.65:1 entre sí**, o sea que un campo enfocado y un
> campo con error eran indistinguibles. Consecuencia sobre §6.2: el acento de esta
> pantalla se queda en el botón `Entrar` y su proporción no sube. Ver la derogación
> gemela en `02-UI-SPEC` §4.3 y §4.4.

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

Clase completa del elemento animado, actualizada al sangrado completo del 2026-09-26 (la versión
derogada llevaba además `aspect-[0.93] max-h-full` y `rounded-2xl`):

```
size-full overflow-hidden bg-anuncio-1 animate-anuncio
```

**No se escribe una segunda regla de `prefers-reduced-motion` para este panel.** El movimiento de este producto se apaga en un solo sitio; la única excepción declarada en todo el sistema es `.animate-spin`, y está justificada porque un spinner es información de estado. Un placeholder decorativo no lo es.

**El par que hay que tener en la cabeza:** con el movimiento reducido activado, el panel se queda quieto en #E2E5E7 **y el spinner del botón `Entrar` sigue girando**. Es el comportamiento correcto de las dos piezas a la vez, y es la aserción que lo demuestra (§13).

### 7.4 La animación no se pausa, y el panel no reacciona a nada

- **No se pausa mientras el formulario envía.** No compite por atención con nada: el botón cambia de label y saca su spinner, que a 1280px está a ~760px de distancia en el eje horizontal (el centro del bloque del login menos el centro del panel).
- **No responde a hover, ni a foco, ni a clic.** No es interactivo, no tiene cursor propio y no tiene estado.
- **No hay `will-change`.** Un `background-color` de 20s sobre un elemento sin transformaciones no necesita promoción a capa, y `will-change` sobre 960 × 993 píxeles (el panel a sangre completa a 1920) reserva memoria de vídeo para siempre por una animación que corre una vez cada 5 segundos.

---

## 8. El footer

### 8.1 Anatomía

> **DEROGADA 2026-09-26 la mitad de D10-2 que pedía el pie a ancho completo.** El pie vive ahora
> **dentro de la columna del login**, como último hijo de `data-slot="columna-login"` y hermano del
> `<main>`. Ni un píxel suyo cruza a la mitad izquierda, y por eso el panel llega hasta abajo.

```
┌────────────────────────────┬────────────────────────────────────────────────┐
│                            │                                                │
│   panel a sangre completa  │              bloque del login                  │
│                            │                                                │
│                            ├────────────────────────────────────────────────┤
│                            │ © 2026 VivaGuest. Todos los…       [ig] [tt]   │
└────────────────────────────┴────────────────────────────────────────────────┘
```

| | A partir de `lg:` (≥1024px) | Debajo de `lg:` |
|---|---|---|
| Ancho | **el de su columna** (640 a 1280, 512 a 1024). No el de la pantalla | el de la pantalla, porque debajo de `lg:` la columna del login ES la pantalla |
| Disposición | Una fila, `justify-between`, `items-center` | Columna centrada, `gap-sm` |
| Alto | `lg:h-barra` = **56px** exactos | Automático: `py-lg` + 17 + 8 + 28 = **85px** |
| Padding lateral | `px-xl` = 24px, **desde el borde de su columna** | `px-lg` = 16px |
| Superficie | `--canvas`, la misma de la página. **Sin fondo propio, sin borde superior** | igual |

**La `className` de `PieDeLogin` NO cambió con la mudanza, y es byte a byte la misma.** Como hijo
flex de la columna el pie se estira solo. `PieDeLogin.test.ts` afirma la cadena literal y sus 12
casos siguen verdes: es lo que demuestra que un cambio de sitio no se convirtió en un cambio de
markup.

**Por qué apila debajo de `lg:`, con el número, y el cálculo NO cambia:** a 390px de ancho el pie
tiene `390 − 2 × 16` = **358px** útiles. La línea de copyright mide ~288px a 12px, los dos iconos de
28px con su `gap-xs` son 60px, y la separación mínima entre los dos bloques son 16px:
**288 + 16 + 60 = 364px**. Se pasa por 6px, así que en una sola fila el texto envolvería. Apilado,
el pie mide 85px. Debajo de `lg:` la columna del login es la pantalla entera, así que meter el pie
dentro de la columna no le quitó nada al teléfono, y el E2E lo afirma midiendo que a 390 el pie
arranca en 0 y mide 390.

**Sin borde superior y sin fondo propio, y sigue siendo una decisión:** D10-5 dice "nada más". Su
separación visual la dan el aire bajo el bloque del login y **el cambio de superficie contra el panel
de la izquierda**. Hasta el 2026-09-26 también la daba el borde inferior de la tarjeta del anuncio;
esa tarjeta dejó de existir con el sangrado completo (§3).

**LA ALINEACIÓN QUE ESTA PANTALLA REGALABA YA NO SE REGALA, y conviene saber por qué.** Con el
diseño derogado, `px-xl` (24px) hacía que el borde izquierdo del copyright cayera exactamente sobre
el borde izquierdo de la tarjeta del anuncio, que también estaba a 24px del viewport. Esa
coincidencia murió con la tarjeta: el panel a sangre completa arranca en 0. La alineación que queda
es la del copyright con el padding del `<main>` **de su propia columna**, y se afirma así en el E2E
(`copyright.x − columna.x === 24`), no contra el número 24 a secas medido desde el viewport.

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

Árbol vigente desde el 2026-09-26, con los cinco `data-slot` que el E2E necesita:

```
<div data-slot="pantalla-login">            ← min-h svh menos la barra de pruebas, flex-col, bg-canvas
  <div>                                     ← region del split: flex-1, lg:grid lg:rejilla-login
    <div data-slot="columna-anuncio">       ← COLUMNA 1. relative, hidden lg:block
      <div aria-hidden="true"               ← el panel. NO es <aside>. size-full
           data-slot="panel-publicidad">
        <div data-slot="anuncio" />         ← el elemento animado, a sangre completa. Sin hijos
      </div>
      <p data-slot="wordmark-panel" />      ← HERMANO del panel, absolute a 32px. FUERA del aria-hidden
    </div>
    <div data-slot="columna-login">         ← COLUMNA 2. lg:col-start-2, flex-col
      <main>                                ← wordmark <h1> + bloque del login
        <h1 />                              ← el UNICO <h1> de la pagina
        <div data-slot="bloque-login" />    ← 400px, max-w-login. SIN tarjeta
      </main>
      <footer>                              ← contentinfo, unico. HERMANO del <main>, no hijo
    </div>
  </div>
</div>
```

- **El panel es un `<div>`, no un `<aside>`.** Una landmark `complementary` con `aria-hidden="true"`
  es una contradicción: aparece en el índice de regiones y no tiene contenido que ofrecer.
- **Ya no hay columna del medio.** La pista vacía del reparto derogado desapareció con el canal.
- **`<main>` envuelve solo el login**, que es el contenido principal de la pantalla.
- **Hay exactamente UN `<h1>`** y vive dentro del `<main>`. El wordmark del panel es un `<p>`.

**LAS DOS REGLAS DE ESTE ÁRBOL, Y LAS DOS ESTÁN MEDIDAS, NO RAZONADAS:**

1. **Un texto dentro del subárbol `aria-hidden` del panel desaparece del árbol de accesibilidad sin
   que la pantalla cambie ni un píxel.** Por eso el wordmark es hermano del panel y no hijo, y por
   eso el `relative` vive en el envoltorio. La compuerta es
   `closest('[aria-hidden="true"]') === null` en `e2e/login.spec.ts`, y **no** un localizador de
   texto: medido con el defecto puesto, `getByText('VivaGuest')` encuentra 3 elementos y daría
   verde. Es el mismo hallazgo de clase que el `toBeDisabled()` de 10-03.
2. **Un `<footer>` descendiente de `<main>` deja de mapear al rol `contentinfo`.** Medido en 10-03
   (señuelo 4) y vuelto a medir en 10-04 (señuelo 2): el rol solo aplica cuando el `footer` está al
   alcance del `body`. El elemento sigue existiendo, sigue pintando la copia, y **desaparece del
   índice de regiones del lector de pantalla**. Es el modo de fallo silencioso perfecto: la pantalla
   se ve idéntica. Por eso el pie es hermano del `<main>` y no hijo, y la mudanza a la columna del
   2026-09-26 **no derogó esta regla**. Las dos aserciones que la defienden (el conteo de
   `contentinfo` y el de `main footer`) tienen dientes independientes, confirmado por aislamiento.

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
| Iconos deshabilitados (#5C6470 al 50% sobre `--canvas`) | **2.09:1** — **EXENCIÓN LEGÍTIMA** por WCAG 1.4.3, que excluye expresamente los componentes inactivos. **Es el único uso de esa exención en todo el producto**, y está acá para que un auditor no lo reporte como hallazgo nuevo |
| Wordmark blanco sobre el panel | **1.27:1** sobre `--anuncio-1` — **INFRACCIÓN CONOCIDA Y ACEPTADA, no exención.** Ver el bloque de abajo, y no confundir las dos etiquetas |
| Los cuatro grises del panel | Superficie decorativa sin texto: 1.4.3 no aplica. Pero los cuatro dan ≥ **10:1** con `--foreground`, así que el slot sigue siendo apto para texto el día que lo tenga |
| Anillo de foco | 2px `--primary` con `outline-offset: 2px`, sin cambios. En el panel no hay nada que enfocar |
| Estado nunca por color solo | Los iconos deshabilitados llevan **opacidad + nombre accesible**, no solo color |
| `prefers-reduced-motion` | §7.3. El panel queda quieto en `--anuncio-1`; el spinner sigue girando |
| Zoom al 200% | A 1024px de viewport con zoom 200% el ancho efectivo es 512px: **por debajo de 1024**, así que el panel desaparece y queda el login de una columna. Es decir, la respuesta a D10-6 **es también** la respuesta a WCAG 1.4.4 en esta pantalla, sin trabajo extra |
| `<html lang="es">` | Ya está en `app/layout.tsx` |

#### El wordmark blanco del panel: infracción aceptada, NO exención, y la diferencia importa

**Decidido por el dueño el 2026-09-26, con las cifras medidas sobre la mesa.** Se le presentó la
medición y respondió, literal: *"no importa que ahorita no pase contraste por que es placeholder"*.
El wordmark del panel va en **blanco**. No se vuelve a preguntar.

Las cifras, con la fórmula de WCAG 2.1 sobre los cuatro grises de §6.1:

| Gris del ciclo | Hex | Blanco encima | `--foreground` (#111827) encima |
|---|---|---|---|
| `--anuncio-1` (el más claro) | #E2E5E7 | **1.27:1** | 14.0:1 |
| `--anuncio-4` (el más oscuro) | #BEC3C8 | **1.77:1** | 10.0:1 |

El wordmark es `text-display` (24px, peso 600), o sea texto grande para WCAG 1.4.3, cuyo umbral es
**3:1**. El contraste real de hoy es **1.27:1** en el gris más claro, que es la parte baja del ciclo.

**Por qué se registra como infracción y no como exención, y por qué no da lo mismo.** La entrada de
los iconos inactivos de arriba **sí** es una exención legítima: la norma los excluye expresamente.
Acá **no hay exclusión que aplique**. El wordmark no es un componente inactivo: es texto sobre una
superficie decorativa, y ninguna cláusula de la norma lo exime. Llamarlo "exención" sería falsificar
el registro, y distinguir las dos cosas es justo lo que un auditor tiene que poder hacer.

**Por qué se acepta, y la premisa es correcta:** los cuatro grises de D10-4 **no son el fondo final**.
Son el marcador de posición de un creativo que todavía no existe. El blanco es lo correcto contra la
referencia de Runway y contra la imagen que algún día ocupe ese espacio; lo que no es correcto es el
fondo de hoy.

**CONDICIÓN DE SALIDA, y es una obligación con dueño, no una nota suelta.** El día que entre el
primer creativo real en el slot **hay que volver a medir el wordmark contra ESE fondo**. Si el
creativo es claro, el wordmark necesita velo o cambia de color. Esa obligación está escrita como
carga de **quien cierre la pregunta abierta 2 de `10-CONTEXT.md`** (el formato del slot cuando haya
anunciantes reales), y ese archivo la enuncia por su lado: quien responda esa pregunta responde
también esta.

**Lo que NO se hace hoy, y es deliberado:** no se oscurecen los cuatro grises de §6.1 y no se le mete
un velo al panel. Las dos cosas son parches contra un fondo provisional, y las dos volverían a abrir
el juicio del fundido. **Quien quiera cambiar el color del wordmark tiene que borrar antes esta
entrada, no al revés.**

---

## 11. Inventario de componentes

### 11.1 shadcn oficial — `components/ui/`

Enumerado con `npx shadcn info` — **26 componentes** — `shadcn@4.19.1` sobre `@base-ui/react@1.7.0` — **2026-09-18**.

`accordion` · `alert-dialog` · `alert` · `badge` · `button` · `card` · `checkbox` · `command` · `dialog` · `dropdown-menu` · `field` · `input-group` · `input` · `label` · `popover` · `progress` · `radio-group` · `select` · `separator` · `sheet` · `skeleton` · `sonner` · `switch` · `table` · `textarea` · `tooltip`

La lista es **el inventario instalado, no una lista blanca cerrada**: si durante la ejecución hiciera falta una primitiva fuera de ella, comprobarla es el camino esperado, no una excepción. Lo que esta fase consume son cuatro:

| Componente | Import | Uso en esta fase |
|---|---|---|
| ~~`Card`, `CardContent`~~ | ~~`@/components/ui/card`~~ | **DEROGADO 2026-09-26: el bloque del login ya no vive dentro de una tarjeta.** Las primitivas siguen instaladas y las usan otras pantallas; lo que desapareció es su uso en `/login`, y con él el `data-slot="card"` de esta pantalla. `page.contrato.test.ts` se pone rojo si vuelve |
| `Button` | `@/components/ui/button` | Los dos iconos deshabilitados del footer (`variant="ghost" size="icon-sm" disabled`). El botón `Entrar` ya existe |
| `Field`, `FieldLabel`, `FieldError` | `@/components/ui/field` | Dentro de `FormularioLogin`, que no se toca |
| `Input` | `@/components/ui/input` | Igual |

### 11.2 Organismos nuevos — `app/(public)/login/_components/`

Por superficie, junto a la página que los usa, que es la convención del repo.

| Componente | Responsabilidad | Cliente o servidor |
|---|---|---|
| `PanelPublicidad` | La columna 1 **a sangre completa**: `size-full` con un elemento animado `size-full overflow-hidden bg-anuncio-1 animate-anuncio`, sin recuadro, sin radio y sin forma propia. Acepta `children` como slot futuro (§3.3). Lleva `aria-hidden`; el corte de `lg:` **ya no vive aquí** sino en su envoltorio `columna-anuncio` (§2.4) | **Servidor.** Sin estado, sin efectos, sin `'use client'` |
| `PieDeLogin` | El pie: copyright con el año recibido por prop + los dos botones deshabilitados. Fila a partir de `lg:`, columna debajo. **Vive dentro de la columna del login desde el 2026-09-26, y su `className` no cambió con la mudanza** (§8.1) | **Servidor.** Función pura de `anio: string` |
| `IconosRedes` | Exporta `IconoInstagram` e `IconoTikTok` como SVG inline. §11.3 | **Servidor** |

**Archivos modificados:** `app/(public)/login/page.tsx` (la rejilla, los cinco `data-slot`, el wordmark del panel, el `revalidate`, el `hoyBog()`) y `app/globals.css` (los cuatro grises, la animación, la utilidad de rejilla). **Nada más.** `FormularioLogin.tsx` no aparece en ningún diff de esta fase, y hay una compuerta que compara su blob.

### 11.3 Los dos iconos de marca, que no salen de lucide

Por el hallazgo B, `lucide-react@1.39.0` no exporta ninguna marca comercial. Reglas del SVG inline, y la primera es de CI:

1. **`fill="currentColor"` o `stroke="currentColor"`. NUNCA un valor de color literal.** El path oficial de una marca se copia con su color de relleno, y un hexadecimal dentro de un `.tsx` bajo `app/` **rompe el guardarraíl 6** de `check-service-role.sh`, que busca justo eso. Es el error más probable de este plan entero.
2. **`viewBox="0 0 24 24"`, tamaño por clase `size-4`** (16px), para igualar la métrica de los iconos lucide del producto.
3. **`aria-hidden="true"` y `focusable="false"`.** El nombre accesible vive en el `aria-label` del botón que los envuelve.
4. **Instagram va como trazo** (`fill="none" stroke="currentColor" strokeWidth={2}`): su marca es un contorno y así iguala el peso visual de los lucide. **TikTok va como relleno** (`fill="currentColor"`), porque su glifo solo existe sólido. **Esa asimetría de peso óptico es inevitable** y no es un defecto que perseguir: son dos marcas ajenas, no dos iconos de un mismo set.
5. **No se envuelven en un componente genérico `Icono`** ni se meten en `components/ui/`: son dos glifos de un footer, no primitivas del sistema.

### 11.4 Iconos lucide: la lista cerrada no crece

Esta pantalla ya usa `Eye`, `EyeOff` y `Loader2`, los tres dentro de `FormularioLogin`, que no se toca. **Esta fase no añade ningún icono lucide.** Los dos glifos de §11.3 son SVG del proyecto y quedan anotados como excepción declarada a la lista cerrada de `02-UI-SPEC` §14.3.

> **ACTUALIZADO EL 2026-09-29.** Esa frase valía cuando la fase entregaba solo `/login`. **`/operacion` sí añade un icono lucide**, y va como **ampliación declarada** y no como excepción silenciosa:
>
> | Icono | Dónde | Por qué entra |
> |---|---|---|
> | `CalendarCheck` | `SenalDeCalendario.tsx`, la rama SANA de la señal de estado del calendario | La rama CAÍDA usa `CalendarX`, que **ya está** en la lista con ese mismo significado en el panel de alertas. Hacían falta **dos siluetas distintas** y no dos colores del mismo punto, porque `04-UI-SPEC` §5 prohíbe el color como único canal |
>
> Precedentes del mismo trato: `HardDrive` (quick `260918-a33`, 2026-09-18) y `Bell`. **La regla que no se toca no es "la lista no crece nunca", es "la lista no crece en silencio".** El detalle está en §16.7.

### 11.5 Cinco trampas del repo que el executor tiene que tener delante

> **La quinta se añadió el 2026-09-29, con `/operacion`.** Es la misma trampa de la barra de ambiente de pruebas del punto 4, aplicada a una medida VERTICAL en vez de a un sangrado.

1. **`bg-[#E2E5E7]` rompe el build de CI.** Guardarraíl 6. Los cuatro grises solo pueden nombrarse en `app/globals.css`.
2. **Un `max-w-*` nuevo sin registrar en `cn()` no llega al DOM.** `lib/utils.ts`. Esta fase no debería necesitar ninguno (§4.2); si aparece, el registro no es opcional.
3. **`animate-anuncio` sin `bg-anuncio-1` deja el panel invisible con movimiento reducido.** §7.3. Es la clase que se borra "por redundante" en la primera limpieza. Medido con el señuelo 5 de 10-04: el `background-color` computado pasa de `oklch(0.92 0.0045 250)` a `rgba(0, 0, 0, 0)`, o sea el panel literalmente transparente.
4. **Medir el sangrado contra el viewport en vez de contra `[data-slot="pantalla-login"]` da un rojo contra el código correcto.** `app/layout.tsx` pinta una barra de ambiente de pruebas de **48px** en todo entorno cuyo `NEXT_PUBLIC_VIVAGUEST_ENTORNO` no sea `produccion`, y la suite E2E corre justamente ahí. El contenedor de `/login` es `min-h-[calc(100svh-var(--alto-barra-pruebas,0px))]`, así que en la corrida de Playwright empieza en `y = 48`. Una aserción escrita como `expect(panel.y).toBe(0)` sale ROJA contra el producto correcto, y es el peor tipo de rojo: el que hace que alguien "arregle" el producto para complacer al instrumento.
5. **Una ALTURA escrita sin restar la barra de ambiente de pruebas desborda 48px exactos en la corrida de Playwright.** Es el punto 4 aplicado al otro eje, y `/operacion` lo paga entero: su contenedor de página tiene altura cerrada de `xl:` para arriba, y una aserción de *"la página no scrollea"* con treinta tarjetas sale **ROJA contra el código correcto** si el `calc()` no lleva `var(--alto-barra-pruebas, 0px)`. Los cuatro sustraendos reales son esa barra, `--spacing-barra` (la barra superior), `--spacing-xl` (el `pt-xl` del `<main>`) y `--spacing-3xl` (su `pb-3xl`). El fallback `0px` cubre producción, donde la barra no se pinta. Y va `100svh` y no `100vh`: en un navegador con barra retráctil `vh` cuenta el viewport grande y la última tarjeta queda debajo del cromo.

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

Consideraciones de estado aplicables resueltas: **7 cubiertas · 3 con red de seguridad · 0 sin resolver**, sobre 17 candidatas que levantó el probe de estados (2026-09-19), revisadas una a una contra la geometría del 2026-09-26. Las cinco que no aparecen arriba están declaradas `n/a` abajo, con su razón: una categoría descartada en silencio es indistinguible de una olvidada. **Ninguna de las cinco `n/a` cambia con el rediseño**, y la fila `error` del panel sigue siendo la primera que se reabre el día que entre un anunciante real.

| Categoría | Elemento | Estado | Resolución |
|---|---|---|---|
| empty | Slot publicitario sin anunciante | ✅ covered | El ciclo de cuatro grises **es** el estado vacío del slot; no lleva copia, por §12.1. Con el sangrado completo ocupa la mitad izquierda entera en vez de una tarjeta insertada, y el estado vacío no cambia de naturaleza |
| loading | Botón `Entrar` | ✅ covered | Heredado sin cambios: `disabled` + `Loader2` + `Entrando…` (§9) |
| error | Credenciales, cuenta desactivada, genérico | ✅ covered | Las copias están en §12, intactas; el desplazamiento de 12.5px del bloque centrado está medido y sigue aceptado en §9.1 |
| populated | Formulario con los dos campos llenos | ✅ covered | Sin cambio de alto: el `Input` es de alto fijo (`h-8`) y no crece con el contenido |
| long-text | El mensaje de error más largo | ✅ covered | Medido en §9.1: tres de los cuatro mensajes caben en una línea a 14px en 368px; el genérico usa dos y desplaza 25px en vez de 12.5px |
| long-text | Copyright del footer a 390px | ✅ covered | Medido en §8.1: 288 + 16 + 60 = 364px contra 358px disponibles, por eso el pie apila debajo de `lg:`. **El cálculo NO cambia con la mudanza a la columna**: debajo de `lg:` la columna del login es la pantalla entera |
| overflow | El panel por debajo de 1024px | ✅ covered | `hidden lg:block`, declarado ahora en el envoltorio `columna-anuncio` para que el wordmark desaparezca con el panel. Y el piso aritmético baja de 995.6 a **896px** con el 50/50 (§2.2), así que el corte de 1024 queda con **128px** de holgura en vez de 28.4 |
| overflow | Alto del bloque del login en el viewport más bajo | ✅ covered | El bloque baja de 321 a **289px** al perder la tarjeta, y ahora comparte columna con el pie de 56px. A 1024 × 768 sigue sin scroll, y lo defiende el caso del pliegue de `e2e/login.spec.ts`, que **no se editó** en el rediseño y siguió verde por sí solo (§2.3) |
| zero-one-many | — | n/a | La pantalla no tiene ninguna colección. Los dos iconos son un par fijo, no una lista |
| partial | — | n/a | No hay datos parciales: la pantalla no lee nada de la base |
| loading | El panel publicitario | n/a | No carga nada. Los cuatro grises son `background-color` en keyframes de CSS, no imágenes con petición de red que pueda quedar pendiente |
| error | El panel publicitario | n/a | Sin petición, no hay fallo posible. Cuando entre un anunciante real esta fila deja de ser `n/a` y es la primera que hay que reabrir |
| error | El footer | n/a | El año lo calcula el servidor al renderizar la página. Si `hoyBog()` fallara, falla la página entera, no el footer: no existe un estado de error propio de esta franja |
| overflow / long-text | Los dos wordmarks `VivaGuest` | n/a | Cadena fija de nueve caracteres escrita en el código, en los dos sitios. No la teclea nadie y no viene de la base |
| **movimiento reducido** | El panel con `prefers-reduced-motion: reduce` | 🧪 backstop · cubierto en automático | Playwright con `contextOptions: { reducedMotion: 'reduce' }` (**corregido en ejecución 10-01**: `test.use({ reducedMotion })` no compila en `@playwright/test@1.62.1`, la opción vive en `BrowserContextOptions`, no en `PlaywrightTestOptions`): el `background-color` computado del panel resuelve a `--anuncio-1` y su `animation-duration` es `0s`, **y** el spinner del botón sigue con duración distinta de cero |
| **contraste del wordmark blanco** | Si se distingue sobre los cuatro grises mientras el fondo siga siendo el placeholder | 🧪 backstop · **EMITIDO Y APROBADO 2026-09-28** | El contraste está **calculado** (1.27:1 sobre el gris más claro) y la infracción está aceptada y registrada en §10.4 con su condición de salida. Lo que ningún instrumento puede decir es si la palabra se LEE durante los cuatro pasos del ciclo. **Mirado el 2026-09-28: el dueño no pidió velo, así que la entrada de §10.4 se queda exactamente como está y no entró ninguna capa al panel.** La condición de salida sigue viva: el juicio se emitió sobre el placeholder, no sobre un creativo real |
| **percepción del fundido** | Que el paso de 1.115:1 se vea de verdad, ahora a sangre completa | 🧪 backstop · **EMITIDO Y APROBADO 2026-09-28** | Ningún test automático puede juzgar si un paso de contraste se percibe. El juicio que 10-03 dejó pendiente queda **superado**: la superficie cambió de forma y de tamaño (casi el doble que la tarjeta que reemplaza), así que se vuelve a tomar contra la pantalla nueva en el checkpoint de 10-04. **Tomado el 2026-09-28: el dueño aprobó la pantalla, literal *"listo mejoro bastante"*, y no pidió separar más los cuatro grises, así que §6.1 no se tocó.** La pregunta nueva que el sangrado abrió (si la mitad izquierda se lee como superficie o como algo cargando, §3.1 razón 2) fue al mismo checkpoint y quedó sin objeción |

---

## 14. Registry Safety

| Registry | Bloques usados | Safety Gate |
|---|---|---|
| shadcn oficial (`@shadcn`) | **ninguno nuevo.** Los 26 componentes ya están instalados desde fases anteriores; esta fase no corre `npx shadcn add` | no aplica — registry oficial y sin instalación |
| Terceros | **ninguno** | no aplica — `registries: {}` en `components.json`, verificado con `npx shadcn info` el 2026-09-18 |

No se declaró ningún registry de terceros, así que la compuerta de vetting (`shadcn view` + escaneo de patrones) **no se ejecutó porque no había nada que vetar**. Si en ejecución alguien quisiera traer un bloque de login de un registry externo, este documento tiene que reabrirse y correr la compuerta antes.

**Nota de procedencia relacionada, que no es de registry pero se parece:** los dos SVG de marca de §11.3 **no vienen de un registry**. Se transcriben a mano desde los recursos oficiales de cada marca, y la única comprobación automática que los cubre es el guardarraíl 6, que atrapa el color literal. El resto (que el path sea el correcto y que el glifo sea legible a 16px) es revisión humana.

---

## 16. /operacion: el contrato de la pantalla de trabajo del admin

> **Escrita el 2026-09-29, con el plan 10-05.** El rediseño de esta pantalla lo decidió el dueño
> el **2026-09-28**, en conversación directa, después de describirla como genérica e ilegible. El
> defecto concreto que nombró: **el estado del día no se entiende de un vistazo.**
>
> **VA NUMERADA 16 Y COLOCADA ANTES DE LA 15 A PROPÓSITO.** La 15 es la deuda declarada y tiene
> que seguir siendo lo último del cuerpo, porque es lo que `gsd-ui-auditor` lee al final.
> Renumerar las quince secciones anteriores rompería las referencias cruzadas de tres planes.
>
> **Esta sección NO deroga nada de `/login`.** Las siete decisiones de `10-CONTEXT.md` deciden
> `/login` y esta pantalla no es `/login`. La única que la toca es **D10-1**: no se cambia de
> biblioteca, se trabaja sobre los 26 componentes que ya están en el repo.

### 16.1 Qué deroga de los tres contratos previos, y qué sobrevive de cada uno

Esta pantalla lleva **tres contratos escritos encima** (Fases 4, 5 y 8). Ninguno se edita: son
registro de fases cerradas. Lo que se deroga se dice acá, por número de sección, con lo que
sobrevive al lado.

| Contrato | Qué se DEROGA | Qué SOBREVIVE |
|---|---|---|
| `04-UI-SPEC` §8.1 | La agrupación en tres bloques relativos a hoy (`Atrasados / Hoy / Mañana / Siguientes`) y su estado de colapso. Con un selector de día, `Mañana` deja de tener significado | **La regla de que un día sin aseos se pinta igual**, porque que no haya nada es información y no ausencia de información |
| `04-UI-SPEC` §9 | La bandeja `Sin confirmar` como **card del carril**. Deja de ser una sección independiente | **Su contrato de orden entero y su prohibición de paginar.** El predicado del sin confirmar no cambia: sigue siendo el del índice parcial `cleanings_unconfirmed_idx` |
| `04-UI-SPEC` §11 | El **carril lateral fijo** de 360px donde vivía el panel de alertas | **Las cuatro garantías del panel**, intactas: contador del total, orden cronológico, sin severidad y sin jerarquía visual entre tipos |
| `05-UI-SPEC` §12 | El **bloque de atrasados** como agrupación propia | **§12.5 palabra por palabra**, ver 16.4. Y la tercera señal inline (`Hourglass` de hora límite vencida) sigue apareciendo en cualquier día, no solo en los pasados |
| `08-UI-SPEC` §10 | Que el detalle del aseo sea un **panel deslizante** en esta pantalla | **Todo su contenido y todo su contrato de direcciones**: los cuatro grupos, las formas de §6.4, el parámetro `?aseo`, el enlace a un aseo fuera de la ventana, el botón atrás y la ruta al cerrar con los parámetros vivos |

**Lo que NO se deroga y hay que decirlo porque se pierde fácil:** `08-UI-SPEC` §10 sigue
gobernando el detalle en **las otras pantallas**. `PanelLectura.tsx` es el armazón compartido de
cuatro paneles de lectura del admin y este plan **no lo toca ni lo dobla**: construye un armazón
inline al lado (`DetalleDelAseo.tsx`). Un quinto consumidor con un modo inline lo habría
convertido en dos componentes disfrazados de uno.

### 16.2 La geometría

El `<main>` del layout aporta `max-w-admin` (1440px) y `px-xl` (24px por lado). Sobre eso,
`@utility rejilla-operacion` son dos pistas `minmax(0, 30fr)` y `minmax(0, 70fr)` con `gap-2xl`
(32px).

| Viewport | Útiles | Lista del día (30%) | Detalle (70%) |
|---|---|---|---|
| 1920 y 1440 | 1392 | **408** | **952** |
| **1280** (el mínimo del proyecto) | 1232 | **360** | **840** |
| 1279 y por debajo | apilado | ancho completo | ancho completo, debajo |

**A 1280 la pantalla nueva son las mismas dos medidas de hoy, intercambiadas de lado:** el 30%
da 360px, que es el valor exacto del token `--container-rail` que se retira, y el 70% da 840px,
que es el ancho exacto del carril ancho de la pantalla vieja. **Nada se estrechó.**

**El reparto vive ENTERO en `@utility rejilla-operacion` y la página no escribe ni un
porcentaje**, igual que `rejilla-login` de 10-04. `minmax(0, Nfr)` y no `Nfr` a secas: el mínimo
implícito de una pista es `auto`, así que una tarjeta con un nombre largo ensancharía su pista y
empujaría la otra fuera del viewport en vez de truncar dentro.

**`--container-rail` se RETIRA, no se le cambia el valor.** Tenía un solo consumidor de
aplicación en todo el repo, así que no era un token compartido aunque el comentario de la Fase 5
dijera que lo reutilizaba tal cual. Cambiarle el valor a un token aparentemente compartido es
exactamente lo que este contrato prohíbe por nombre.

**El corte es `xl:` (1280) y no `lg:` (1024).** A 1024 los útiles son 976, menos el hueco 944, y
el 30% da 283px: por debajo de los 360px que la bandeja demostró que hacen falta para una fila
legible con estado, nombre y hora. Apilado, **primero la lista del día y después el detalle**: lo
que se opera va antes de lo que se consulta.

**El presupuesto de altura NO se calcula restando alturas de cabecera.** El contenedor de la
página es una columna flex con altura cerrada de `xl:` para arriba, y la región de las dos
columnas se lleva `min-h-0 flex-1`: lo que sobre tras la cabecera y el vistazo, sin aritmética.
Un `calc()` que restara la altura de la cabecera y del vistazo se rompe el día que la copia de
una métrica pase a dos líneas, y el síntoma sería la columna derecha desbordando por abajo.

La altura cerrada del contenedor sí es aritmética, y sale entera de tokens: `100svh` menos
`--alto-barra-pruebas` menos `--spacing-barra` menos `--spacing-xl` menos `--spacing-3xl`, que
son los cuatro sustraendos reales (la barra de ambiente de pruebas, la barra superior, el `pt-xl`
del `<main>` y su `pb-3xl`). Ver la trampa 5 de §11.5.

### 16.3 El vistazo: cuatro métricas del día seleccionado

**Las cuatro salen del día del selector, sin excepción**: cambiar de día cambia las cuatro.

| Rótulo (copia exacta) | Cifra | Leyenda / `title` |
|---|---|---|
| `Aseos activos` | el conteo del día | ninguna |
| `Sin confirmar` | el conteo del día | `+N en otros días`, en micro y **solo con desbordamiento** |
| `Urgentes` | el conteo, o el guion en un día pasado | `Entra huésped el mismo día.` / la frase del `no aplica` |
| `Gastos del día` | conteo y total abreviado (`4 · $ 180K`) | la cifra exacta y la frase de la divergencia con la sección financiera |

**Las tres decisiones que hay que poder auditar:**

1. **`Urgentes` en un día anterior a hoy dice el guion con `no aplica`, y no una cifra
   congelada.** El `where` del update de urgencia de los RPC de sincronización solo mantiene
   `scheduled_date >= public.today_bog()`, así que en un día pasado `is_urgent` es un valor
   congelado. Recalcularlo al leer es posible y **se descartó**: sería una segunda verdad sobre la
   urgencia, con un predicado parecido pero no idéntico al del SQL. La métrica sigue la regla que
   el propio dominio ya tomó: `alertasComputadas()` acota la alerta de urgencia a
   `scheduled_date >= hoy` porque su significado es "entra huésped el mismo día" y pasada la fecha
   ya no hay nada que apurar. Nulo y cero son cosas distintas y se pintan distinto, igual que
   `SinDato` de la fila de aseo.
2. **Los gastos del día son los de los aseos PROGRAMADOS ese día, y eso diverge de la sección
   financiera a propósito.** `expenses` solo tiene `created_at`, así que no tiene día de negocio.
   El proyecto ya decidió en tres migraciones que un gasto pertenece a
   `public.dia_bog(cleanings.finished_at)`, o sea al día en que el aseo se CERRÓ. La decisión del
   dueño para esta pantalla es la contraria, porque pidió que las cuatro métricas salgan de la
   fecha del selector sin excepción. **Las dos cifras pueden no coincidir y eso NO es un
   defecto**, así que la frase entera viaja en el `title` de la métrica. Sin esa frase, esto
   vuelve como reporte de bug en un mes.
3. **El vistazo NO lleva cromo de tarjeta, y eso lo separa de `/finanzas` a propósito.**
   `TarjetaKPI` de la Fase 7 es `rounded-md border border-border bg-background p-lg` con alto fijo
   `h-kpi`, y su cabecera explica que lo que hace destacar al número es justamente su card propia.
   El principio de data ink que enunció el dueño dice lo contrario: ni bordes ni decoración que no
   comunique. Acá el vistazo son cuatro pares de rótulo en micro versalitas y cifra en display,
   separados por aire. **`TarjetaKPI` no se reutiliza y no se dobla:** formatea dinero por dentro
   y tres de estas cuatro métricas no son dinero. **Las dos pantallas van a verse distintas, es
   declarado y no accidental, y el dueño lo juzga en el checkpoint de este plan.**

**Y la cifra de desbordamiento es lo que salva el criterio 1 del ROADMAP de la Fase 4.** Hasta
este rediseño la bandeja contaba TODOS los sin confirmar de la ventana de catorce días: uno de
dentro de tres días se veía hoy, sin navegar. Con la pantalla por día eso se perdería, y perderlo
es una regresión contra *"que ningún aseo se pierda"*, que es el core value del producto y no una
preferencia de diseño. El `+N` se calcula con el MISMO `bandejaSinConfirmar()` sobre la ventana
entera menos el día seleccionado, así que no hay predicado nuevo.

### 16.4 La tarjeta

Hereda de la fila de la tabla vieja, sin perder nada:

- **Las cuatro señales inline** (`Zap` urgente, `Flag` por revisar, `Hourglass` hora límite
  vencida, `ImageOff` sin evidencia), con sus mismos iconos y sus mismos nombres accesibles.
- **Los dos vacíos con su distinción intacta:** `Sin asignar` en color de aviso para una
  gestionada sin aseador (es trabajo que nadie tiene), y `no aplica` para una unidad de gestión
  externa (la base lo prohíbe por `cl_unmanaged_is_inert`).
- **El badge de tipo** y **el ancla `#aseo-{id}`**, que es el destino de las alertas de la
  campana. `scroll-mt-barra` compensa la barra superior fija de 56px.
- **`aria-current` sobre la tarjeta cuyo detalle está abierto** (§13.1).

**El `Sin confirmar` es un ESTADO VISUAL de la tarjeta, no una sección aparte.** Se dice con un
borde izquierdo de 2px en `--status-warn`, que **sustituye** al borde neutro de ese lado y no se
suma (dos bordes pegados de 1 y 2px se leen como un error de render). Es color de ESTADO, no
decoración: significa exactamente lo que el icono `Inbox` y el `text-status-warn` que
`estadoDeAseo()` ya le daba a esa clave.

**INVERSIÓN DECLARADA DEL CONTRATO DE ORDEN.** `TablaDia.tsx` afirmaba por escrito que los sin
confirmar **NO flotan arriba**, y su razón era que su superficie propia era la bandeja del
carril. Al matar la bandeja, esa razón desaparece, **y aun así siguen sin flotar**: lo que los
distingue ahora es el estado visual dentro del mismo orden por hora límite. Se dice acá en vez de
cambiarlo en silencio.

**Y §12.5 de `05-UI-SPEC` SOBREVIVE PALABRA POR PALABRA, al pasar de `TableRow` a tarjeta:**

> **Ninguna fila de `Atrasados` se tinta, ni cambia de peso, ni de alto.**

Ninguna tarjeta atrasada se tinta, ni cambia de peso, ni de alto. Lo que distingue un atrasado es
**el selector de día**, que es un canal de mucho más ancho de banda que un tinte, exactamente
igual que antes lo era el bloque `Atrasados`. La prohibición no caduca al cambiar de primitiva.

### 16.5 La campana

El panel de alertas sale del carril lateral y pasa a **una campana de la barra superior**,
decisión del dueño del 2026-09-28. **Las cuatro garantías de `04-UI-SPEC` §11 quedan intactas:**

1. **El contador dice el TOTAL**, nunca lo renderizado ni lo que queda tras el filtro. Es la
   única garantía medible de que el scroll interno no es un escondite (criterio 4 del ROADMAP de
   la Fase 4). **Un popover es más pequeño que un carril, así que la tentación de paginar es
   mayor:** la prohibición de paginar, de virtualizar y de ofrecer "ver más" queda escrita en el
   componente mudado.
2. **El orden sigue siendo cronológico.** Ni severidad, ni orden por gravedad, ni color por tipo.
   `PresentacionDeAlerta` sigue sin campo de severidad.
3. **El clic de una alerta sigue aterrizando en la fila de su aseo**, y ahora es **más fuerte que
   antes**: el destino lleva el día dentro (`/operacion?dia={scheduled_date}#aseo-{id}`), así que
   ya no depende de que un bloque exista ni de que esté abierto.
4. **No se duplican en la campana los conteos que el vistazo ya da.**

**LA INVERSIÓN DEL TOGGLE `Ver atendidas` A ESTADO DE CLIENTE, CON SU RAZÓN ENTERA.** `TopNav` lo
renderiza `app/(admin)/layout.tsx`, y **un layout de App Router NO recibe `searchParams`**. Así
que `?alertas=atendidas`, que era un parámetro de servidor leído por `page.tsx`, deja de ser
resoluble donde la campana vive. La salida es leer las dos listas en el layout y filtrar en el
cliente con el toggle.

Eso **INVIERTE la regla que el plan 04-13 dejó escrita** (lo que cambia qué filas lee el servidor
vive en la URL; lo que solo filtra lo ya traído vive en el cliente), y la inversión es legítima
porque **la premisa de la regla era que el control vive en una página que recibe los parámetros**,
y este control ya no vive ahí. Dos consecuencias que van escritas: se fueron las constantes
`PARAM_ATENDIDAS`, `HREF_SIN_ATENDER` y `HREF_ATENDIDAS`, y **un enlace guardado con ese filtro
puesto dejó de funcionar**. El parámetro que ahora tiene que sobrevivir a abrir y cerrar el
detalle es `?dia`, y hay un caso E2E que lo afirma.

### 16.6 Color

**El color solo significa estado o alerta. Nunca decoración.** Ninguna superficie nueva de esta
pantalla lleva fondo de color, borde de color ni texto de color que no signifique un estado.
**La lista cerrada del acento de `02-UI-SPEC` §4.4 no se amplía**, y el vistazo no lleva cromo de
tarjeta (16.3).

**DESVIACIÓN DECLARADA: el dueño pidió ROJO para la señal de calendario caído y salió en
`--status-warn` (ámbar).** La razón está medida y no es preferencia:

- `--status-warn` es el token con el que ya están pintadas **todas** las señales de aviso de esta
  pantalla: `Zap`, `Flag`, `Hourglass`, `ImageOff`, `Sin asignar`, los dos badges y el contador.
- `--destructive` está reservado a acciones destructivas y al borde de error.
- `02-UI-SPEC` §4.6 ya declara el **choque de hues** entre `--primary` (29) y `--destructive`
  (13.7). Meter un tercer rojo de estado pondría **tres rojos** en una pantalla.

**El dueño la revisa en el checkpoint del plan 10-05.** Si dice que no grita bastante, es un
cambio de una línea en `SenalDeCalendario.tsx`, **y ese día hay que escribir acá la nota del
tercer rojo en pantalla con el choque de hues al lado**, para que quien audite el color después
sepa que es una decisión y no un descuido. Los tokens de marca no se tocan en ningún caso.

### 16.7 Iconos

**`CalendarCheck` es una ampliación declarada de la lista cerrada de `04-UI-SPEC` §17.3.** Los
precedentes son `HardDrive` (quick `260918-a33`, 2026-09-18) y `Bell`: la regla que no se toca no
es "la lista no crece nunca", es "la lista no crece en silencio".

**La señal de calendario son DOS ICONOS DISTINTOS, no dos colores del mismo punto.** `04-UI-SPEC`
§5 prohíbe el color como único canal, y un punto neutro contra un punto rojo se diferencian solo
por el color. Sano: `CalendarCheck`. Caído: `CalendarX`, que es el **mismo** icono que la alerta
`calendario_caido` ya usa en `MAPA_DE_ALERTAS`, así que el admin lo aprende una vez. Las dos
llevan nombre accesible, que es el segundo canal para quien no ve el color.

### 16.8 Trampas

Las tres de esta pantalla. La cuarta (la barra de ambiente de pruebas aplicada a una medida
vertical) está en §11.5 punto 5, porque es una trampa del repo y no de esta ruta.

1. **La barra de ambiente de pruebas mide 48px y la suite E2E corre justo donde se pinta.** Toda
   medida vertical se toma contra el contenedor de la página y nunca contra el viewport, y la
   resta de la barra va dentro del `calc()`. Ver §11.5 punto 5.
2. **Los gastos no tienen día de negocio**, y esta pantalla se desvía de la sección financiera a
   propósito. La divergencia va escrita EN PANTALLA, en el `title` de la métrica. Ver 16.3 punto 2.
3. **Al pasar el detalle de `Sheet` a inline vuelve el problema de alcance que `08-11` midió.**
   `SheetContent` se portaleaba a `document.body`, así que `getByRole('dialog')` acotaba el panel
   limpiamente. **Inline, ese ámbito desaparece** y el riesgo vuelve entero: la lista del día
   pinta el mismo nombre de apartamento que el detalle. La salida es un localizador propio
   (`[data-slot="detalle-aseo"]`) y **volver a correr el control de 08-11 en los dos sentidos**,
   con la palabra prohibida sembrada FUERA del detalle. Medido el 2026-09-29: acotada al detalle
   sigue en verde, sin acotar se pone roja (`Expected: false / Received: true`). Sin ese control,
   las aserciones negativas del criterio 5 son verdaderas por accidente.
   **Y hay un hallazgo de forma al lado:** la colisión de ámbito de esta pantalla viaja por el
   TEXTO y no por el nombre accesible, porque el enlace de la tarjeta lleva
   `aria-label="Ver el aseo de {nombre}"` y no se llama como el apartamento.

**Y una compuerta de forma, que no es trampa sino invariante:** con el detalle abierto, el conteo
de elementos con rol de diálogo en la pantalla es **cero**. El detalle inline no es modal a
propósito: no atrapa el foco, no cierra con la tecla de escape y no tapa la lista, porque la
lista de al lado sigue viva y operable.

### 16.9 Consideraciones de interfaz

| Categoría | Cómo se resuelve en esta pantalla |
|---|---|
| **Vacío: un día sin aseos** | Se pinta igual, con su mensaje. Que no haya nada es información, y es lo que sobrevive de `04-UI-SPEC` §8.1 |
| **Vacío: la columna derecha sin selección** | **No puede existir.** Sin nada seleccionado lleva la información general del día: la carga por aseador, el desglose por estado, lo que queda más allá del horizonte y la leyenda. Una columna del 70% esperando a que alguien pulse algo ocupa el sitio más grande de la pantalla y no dice nada, así que el admin aprende a no mirarla |
| **Volumen: treinta tarjetas en un día** | La lista scrollea **por dentro** (`min-h-0` + `flex-1` + `overflow-y-auto`) y la página no scrollea. Medido con seis activos más veinticuatro cancelados y el toggle puesto |
| **Texto largo: un nombre de apartamento a 360px** | `min-w-0` + `truncate` dentro de la tarjeta, con el nombre completo en el `title`. La pista es `minmax(0, 30fr)` justamente para que trunque dentro en vez de ensanchar la columna |
| **Carga** | **No se reintroduce `loading.tsx` en esta ruta.** Está medido en `08-02-MEDICION.md` §3 que el fallback del segmento se activa al cambiar los parámetros de la MISMA ruta y manda el scroll a cero, y el selector de día es exactamente eso. El único esqueleto es el de la barrera de suspensión del detalle, con la geometría real |
| **Error** | Por el `error.tsx` de la ruta, sin cambios. Un aseo que no existe o que no se puede ver **no** es un error: se cae a la información del día y el parámetro huérfano se queda en la dirección, porque limpiarlo reescribiría un enlace que alguien pegó en un chat |
| **Movimiento reducido** | `n/a` para esta pantalla, **con su razón**: no introduce ninguna animación propia. Lo único que se mueve son las transiciones de hover y foco que el bloque global de `prefers-reduced-motion` de `globals.css` ya apaga |
| **Foco y teclado** | El detalle inline **no** atrapa el foco y **no** reimplementa nada de lo que Base UI daba en el `Sheet`, porque no es modal. Su control de cerrar es un enlace, así que se puede abrir en otra pestaña |
| **Estado persistente** | El toggle de cancelados y el recorrido de la lista **sobreviven a abrir el detalle**, y hay un caso que lo afirma. La clave por identificador va sobre el detalle y sobre nada más (INSTRUCCIÓN 3 del veredicto de 08-02) |

---

## 15. Deuda declarada de este contrato

Se documenta acá para que `gsd-ui-auditor` no la reporte como hallazgo nuevo.

1. **El resto del dashboard sigue sin rediseñar, y sigue siendo la deuda más importante de las catorce.** El objetivo del ROADMAP para la Fase 10 es "que el dashboard del admin deje de verse como shadcn recién instalado". **CORREGIDA A MEDIAS EL 2026-09-29:** la fase entrega **DOS pantallas**, `/login` y `/operacion` (§16), y no una. Lo que **no** cambió es lo importante: `/apartamentos`, `/aseadores` y `/finanzas` siguen con el tema por defecto y el `baseColor: neutral` que D10-1 identificó como el problema real. **La fase no cierra el objetivo del ROADMAP y no debe declararse como si lo cerrara.** Esa frase sigue siendo verdad con dos pantallas igual que lo era con una, y por eso se conserva literal.
2. **`aria-hidden` en el panel caduca con el primer anuncio real.** Un anuncio con enlace dentro de un contenedor `aria-hidden` es una infracción de 4.1.2 y un enlace inalcanzable por teclado. Ese día el panel necesita nombre accesible y el enlace entra al orden de tabulación.
3. **`display: none` no evita la descarga de una imagen.** Hoy no importa (no hay imagen). Cuando la haya, el panel necesita `<picture>` con atributo `media`, o pasa a ser frontera de cliente. Un teléfono descargando el creativo de un panel que nunca va a ver es coste directo sobre el plan de datos del aseador.
4. **El formulario tiene controles de 32 y 28px en una pantalla que el aseador usa desde el teléfono.** El `Input` es `h-8` y el toggle de contraseña es `icon-sm`; el piso de 44px de `05-UI-SPEC` es exclusivo de `app/(cleaner)/` y `check-escala-movil.sh` no mira `app/(public)/`. No es alcance de esta fase (el formulario no se toca) pero es un hueco real del contrato de toque, y el `Input` a `text-base` debajo de `md:` es lo único que hoy evita el zoom automático de iOS en esa pantalla.
5. **Dos iconos deshabilitados son mobiliario permanente si las cuentas nunca existen.** D10-5 los pide así y no se discute. Pero si en tres meses no hay Instagram ni TikTok, lo correcto es quitarlos, no dejarlos apagados para siempre.
6. **Marcas ajenas.** Instagram y TikTok tienen guías de marca sobre uso, color y área de respeto de sus glifos. Se dibujan en `currentColor` monocromo a 16px, que es el uso más conservador posible, pero **nadie revisó las guías**. Queda dicho.
7. **`revalidate = 3600` significa que el primer visitante después de medianoche del 1 de enero ve el año anterior.** ISR regenera con la primera petición pasada la ventana: ese visitante recibe el HTML viejo y dispara la regeneración; el siguiente ya ve el año correcto. Es un año en un pie de página, una vez al año, y el precio de la alternativa (`force-dynamic`) es perder el HTML estático en todas las demás visitas.
8. **La pregunta abierta 1 de `10-CONTEXT.md` sigue sin responder:** quien entra por esta pantalla es el admin, no un propietario. Si la publicidad se va a vender dirigida a propietarios, el login es la pantalla equivocada. **Esta fase construye el slot igual**, porque construirlo es reversible y cuesta un `<div>`; lo que no se debe hacer es vender el espacio antes de responder eso.
9. **El recorte del creativo a sangre completa.** Era la razón 1 de la §3.1 derogada, y al invertirse la decisión pasa a ser deuda: un creativo real en un panel pegado a los cuatro bordes se recorta con `object-fit: cover` (y cortarle el logo a un anunciante es el único modo de fallo que no perdona) o deja franjas contra el borde desnudo del navegador, que se lee como defecto de maquetación. La tarjeta derogada permitía `object-contain` con las franjas sobre una superficie que se leía como marco. Se perdió a cambio del diseño que el dueño escogió el 2026-09-26, y queda escrito para que nadie lo redescubra cuando llegue el primer anunciante.
10. **El color del wordmark del panel es blanco por decisión del dueño, con 1.27:1 sobre el gris más claro.** La entrada completa, con su etiqueta correcta (infracción aceptada, no exención) y su condición de salida, vive en **§10.4**. Esta deuda **remite ahí y no la repite a propósito**: una infracción registrada en dos sitios se cierra en uno solo y sobrevive en el otro.
11. **El wordmark se anuncia dos veces al lector de pantalla.** El `<h1>` del formulario y el `<p>` del panel dicen los dos "VivaGuest". Es **redundancia aceptada, no barrera**: la alternativa (ponerle `aria-hidden` al del panel) volvería inútil todo el trabajo de sacarlo del subárbol `aria-hidden` del panel, que es exactamente lo que este contrato defiende en §10.1.

> **DEUDAS 12, 13 Y 14: añadidas el 2026-09-29 con `/operacion` (§16).**

12. **La métrica `Urgentes` SUBCUENTA los aseos creados a mano, y la causa está en el dominio de sincronización.** El update que mantiene `is_urgent` solo toca filas con `origin = 'ical'`, así que **un `repaso` o una `emergencia` creados a mano nunca se marcan urgentes**, aunque entre huésped el mismo día. La métrica del vistazo hereda esa subcuenta porque lee la columna en vez de recalcular, que es lo correcto: recalcular sería una segunda verdad sobre la urgencia. **Condición de salida:** ampliar el `where` del update en los RPC de sincronización, que es una decisión del dominio de sincronización y no de una pantalla. Hasta entonces, la cifra es un piso y no un total.
13. **Los gastos del día divergen de los de la sección financiera, y las dos cifras pueden no coincidir.** `/operacion` agrupa por `scheduled_date` del aseo (el día del selector, decisión del dueño del 2026-09-28) y `/finanzas` por `public.dia_bog(cleanings.finished_at)` (el día en que el aseo se cerró, decidido en tres migraciones). Un aseo programado el 28 y cerrado a las 00:20 pone su gasto el 29 allá y el 28 acá. **Hoy se mitiga con la frase entera en el `title` de la métrica**, que es lo que impide que esto vuelva como reporte de bug. **Condición de salida:** que el dueño decida cuál de las dos agrupaciones es la del producto, y que la otra la cite en vez de calcular la suya.
14. **La campana le impuso una consulta más a CADA página del admin.** La lectura de alertas vivía en `app/(admin)/operacion/page.tsx` y ahora vive en `app/(admin)/layout.tsx`, porque la campana vive en la barra superior y un layout no recibe `searchParams`. Coste real medido en forma, no en tiempo: una consulta sobre `notifications`, con un admin y decenas de filas, en las cuatro secciones. **Y hay una consecuencia de fiabilidad que importa más que el coste:** un fallo en esa lectura deja de tumbar una pantalla y pasa a tumbar las cuatro. **Condición de salida:** si el volumen de `notifications` crece, la lectura pasa a ser diferida con su propia barrera de suspensión dentro de la campana, en vez de bloquear el layout.

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
