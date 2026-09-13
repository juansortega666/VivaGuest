---
phase: 7
slug: financiero
status: draft
shadcn_initialized: true
preset: none (`components.json` ya existe, `style: base-nova`, `registries: {}`)
created: 2026-09-13
---

# Fase 7 — Contrato de diseño de UI

> Contrato visual y de interacción. Lo consumen `gsd-planner` y `gsd-executor`.
> Idioma de la interfaz: **español de Colombia, trato de "tú"**. Código, tokens, rutas y REQ-IDs quedan como están.

**REQ-IDs cubiertos:** FIN-02, FIN-03, FIN-04, FIN-05, y la pantalla de pagos del aseador (D7-4.3).

**Este documento hereda `02-UI-SPEC.md`, `04-UI-SPEC.md`, `05-UI-SPEC.md` y `06-UI-SPEC.md` completos.** Paleta, escala de espaciado, tipografía, movimiento, accesibilidad y vocabulario siguen vigentes tal cual. Esta fase **extiende un producto vivo de seis fases entregadas**: no estrena sistema de diseño, estrena una sección.

**Entradas leídas:** `07-DEFINICION.md` (la fuente de verdad, incluida su sección final "La interfaz, cerrada el 2026-09-13"), `07-CONTEXT.md` (D7-1 a D7-9), `07-RESEARCH.md` (Hallazgo 1, Pattern 4, Pitfalls 3 a 5, Security Domain), `07-VALIDATION.md`, `.planning/ROADMAP.md` §Phase 7, `REQUIREMENTS.md`, `CLAUDE.md`, `app/globals.css` entero, `components/ui/`, `app/(admin)/` y `app/(cleaner)/`.

---

## 0. Lo que esta fase renderiza de verdad

| Hecho anclado | Consecuencia de diseño |
|---|---|
| **La regla que ordena todo, cita literal del dueño: "el aseador ve lo que le llega y punto"** | Ninguna cifra de huésped, ningún margen y ningún pago ajeno en ninguna superficie del aseador. §10.1 la convierte en reglas verificables, y la frontera de verdad está en Postgres, no aquí |
| **D7-1: el dinero vive en su propia sección.** `/operacion` no cambia | Pestaña nueva `Finanzas` en `TopNav`, cuarta y última. Cero columnas de plata en la tabla de día |
| **El dispositivo es escritorio y tablet apaisada.** El admin la usa sentado | **El piso de toque de 44 px y el cómodo de 56 px NO aplican aquí**: son de `app/(cleaner)/`. Aquí manda la densidad de información. §2.2 |
| **Sin botón flotante**, descartado con el dueño por lo anterior | Los controles van donde se ven siempre: cabecera de página y cabecera de card |
| **Por persona NO va revenue ni margen** (descartado con argumento en la DEFINICION) | El bloque 3 muestra **lo que cuesta** esa persona. §6.5, y la regla anti ranking de §6.5.3 |
| **No hay GPS y no lo va a haber** | El bloque "qué está haciendo ahora" sale de qué aseo tiene en curso. Prohibido el vocabulario de ubicación y prohibido cualquier mapa. §8.4 |
| **Resumen se calcula al vuelo; Pagos queda congelado** (D7-3) | Son dos superficies con dos contratos de confianza distintos, y la interfaz lo tiene que decir. §5.3 |
| **El periodo de pago va de cierre a cierre, no del 1 al 31** (D7-5) | En Pagos, cada periodo se rotula con **sus dos fechas reales**, nunca solo con el nombre del mes. §11.3 |
| **Un aseo pertenece al periodo en que se completó** (D7-8) | Todo desglose muestra **las dos fechas**: programado y hecho. Sin eso, un aseo de enero en el recibo de febrero parece un error |
| **`revalidatePath` cuelga el navegador en las Server Actions de `(admin)`** (medido, plan 04-14) | Ninguna action de esta fase lo llama. El refresco lo pide `router.refresh()` desde el cliente |
| **`max-w-<talla>` compila a 4 u 8 píxeles** en este repo (medido, costó dos quicks) | Todo ancho nuevo va como `--container-<nombre propio>` y se registra en el grupo `max-w` de `cn()`. §2.4 |
| **Esta es la primera superficie del admin que muestra una foto** | El recibo del gasto exige una URL firmada desde RSC y un estado para cuando la foto ya no exista. §9.4 |

---

## 0.1 Conflictos de alcance, resueltos a favor de la DEFINICION

La DEFINICION dice, literal: *"Si algo del plan técnico contradice este documento, el plan está mal."* Tres cosas de los artefactos anteriores la contradicen. **Este contrato sigue a la DEFINICION y lo deja escrito para que el planner no lo descubra a mitad de camino.**

| Conflicto | Qué decía antes | Qué manda |
|---|---|---|
| **Retención legal (RET-03)** | ROADMAP criterio 4, `REQUIREMENTS.md` y `07-VALIDATION.md` la ponen en esta fase | **DEFINICION §5 la saca**: *"No es dinero. Los aseos pasan a historial y con eso basta hoy"*. **Este contrato no especifica ninguna superficie de retención legal.** El trigger guardián de la base puede construirse igual (es un invariante, no UI), pero no hay pantalla |
| **Alerta de Storage al 70% (RET-07, D7-9)** | D7-9 la resolvió como banner persistente en `/finanzas` y `/operacion` | **DEFINICION §5 la saca**: *"No es dinero. Pertenece a la fase de borrado automático"*. **Este contrato no especifica ningún banner de Storage.** D7-9 queda superseded |
| **Retención del recibo del gasto** | D7-6 dijo 6 meses, alineado con `retention_months` | **DEFINICION §4 dice 5 años**, con el cálculo de volumen hecho (los recibos son el 1,6% del almacenamiento). Es decisión de schema y de la Fase 9, no de UI, pero **§12.1 especifica igual el estado "recibo no disponible"**: los gastos anteriores a este cambio ya perdieron su foto bajo la política de 30 días |

**Acción para el planner, no para el executor:** `07-VALIDATION.md` tiene ocho filas de RET-03 y RET-07 en su mapa de verificación. Si el alcance se recorta según la DEFINICION, esas filas salen del mapa o la fase arranca con Wave 0 cubriendo cosas que nadie va a construir.

---

## 1. Design System

Sin cambio de herramienta y sin primitivas nuevas.

| Propiedad | Valor |
|---|---|
| Tool | `shadcn` CLI. `style: base-nova`, `iconLibrary: lucide`, `registries: {}` |
| Component library | **Base UI** (`@base-ui/react`) |
| Icon library | `lucide-react` **1.39.0** |
| Font | Geist Sans / Geist Mono, más Poppins (`--font-brand`) solo en momentos de marca |
| Estilos | Tailwind v4.3.3, `@theme` en `app/globals.css`. No existe `tailwind.config.js` y no se crea |
| Tema | Solo claro |
| Toasts | `sonner` 2.0.8 |

### 1.1 Esta fase instala CERO primitivas

Las 25 de `components/ui/` alcanzan. Lo que usa esta fase, verificado contra el directorio:

`table` · `card` · `button` · `badge` · `separator` · `sheet` · `dialog` · `alert-dialog` · `select` · `popover` · `command` · `input` · `label` · `skeleton` · `sonner` · `tooltip` · `dropdown-menu`

**Consecuencia directa:** la compuerta de ancho de §2.4 no se dispara por primitivas nuevas. Sigue aplicando a los tokens de `--container-*` que esta fase sí añade.

### 1.2 Alternativas descartadas, con la razón

| Descartado | Razón |
|---|---|
| **Instalar `tabs` para Resumen / Pagos** | `tabs` guarda el estado en el cliente: la sub-pestaña no sería enlazable, no sobreviviría a un refresco y no se podría compartir por chat. Son **dos rutas reales** con un `SubNav` de `<Link>`, que es además el patrón que `TopNav` ya usa (§5.1) |
| **Instalar `avatar`** | No existe `profiles.avatar_url` en el schema (verificado en la migración 03). El "avatar" del bloque 3 es el círculo de iniciales que `TopNav` ya sabe pintar. §14.3 |
| **Instalar `chart` (Recharts)** | Un dashboard financiero pide gráficas por reflejo. Aquí no hay ninguna serie temporal en el alcance: el histórico mes contra mes está declarado como **no definido** en la DEFINICION §6. Meter una librería de gráficas para dibujar barras de proporción es traer 100 KB para pintar un `<div>` |
| **`Progress` para la barra de proporción del bloque 3** | `Progress` significa "avance de una tarea" y su relleno es `--primary`, que está en la lista cerrada del acento. Ni la semántica ni el color aplican. §6.5.2 |
| **Botón flotante para el filtro de periodo** | Descartado con el dueño. Esta pantalla no es de celular |
| **Tabla virtualizada o paginada** | Decenas de aseos por periodo y ocho personas. `04-UI-SPEC` §7.2 ya lo resolvió: es un solo render |

---

## 2. Escala de espaciado

Hereda `02-UI-SPEC` §2 (`xs` 4 · `sm` 8 · `md` 12 · `lg` 16 · `xl` 24 · `2xl` 32 · `3xl` 48). Sigue **prohibido el valor arbitrario** de espaciado: si hace falta un valor nuevo, se declara como token.

### 2.1 Tokens nuevos

Los ocho son múltiplos de 4 y **ninguno de los nombres colisiona con una talla de la escala de espaciado**. La comprobación se hizo nombre por nombre contra la lista completa del repo (`xs`, `sm`, `md`, `lg`, `xl`, `2xl`, `3xl`, `fila`, `fila-encabezado`, `barra`, `barra-acciones`, `toque`, `toque-comodo`, `paso`, `avatar`, `buscador`, `filtro-cluster`, `chip`, `dia-cabecera`, `fila-alerta`, `fila-tarea`, `cabecera-cuarto`, `miniatura`, `barra-aseo`, `col-*`), que es exactamente la verificación que faltó las dos veces que este defecto costó un quick.

```css
@theme {
  /* ── tabla de detalle de aseos (§7.1) ─────────────────────────────────────
     Columnas PROPIAS. No se reutilizan las de /operacion ni las de
     /apartamentos: compartir el token haria que tocar una tabla moviera otra,
     que es la regla que la Fase 4 ya escribio. */
  --spacing-col-fecha:   96px;  /* PROGRAMADO y HECHO: `28 ene` a 14px con aire */

  /* ── tabla de pagos (§9.1) ───────────────────────────────────────────── */
  --spacing-col-conteo:      88px;  /* ASEOS, entero alineado a la derecha */
  --spacing-col-pagado:     140px;  /* PAGADO: `Pagado el 3 sep`, la etiqueta mas larga */
  --spacing-col-accion-pago: 160px; /* la celda del boton `Marcar pagado` */

  /* ── bloques del resumen (§6) ────────────────────────────────────────── */
  --spacing-kpi:            104px;  /* alto FIJO de la card de KPI: 16+17+8+29+17+16 = 103 */
  --spacing-fila-aseador:    56px;  /* fila del desglose: circulo 28 + nombre + barra de 4 */

  /* ── recibo del gasto (§9.4) ─────────────────────────────────────────── */
  --spacing-recibo-alto:    480px;  /* tope de alto de la foto dentro del dialogo */
}

@theme {
  /* NOMBRE PROPIO, NUNCA NOMBRE DE TALLA. Ver §2.4. */
  --container-boton-marcar: 148px;  /* min-width de `Marcar pagado` -> `Marcando…` */
}
```

**Se reutilizan tal cual, sin redeclarar:** `--spacing-fila` (40), `--spacing-fila-encabezado` (32), `--spacing-barra` (56), `--spacing-col-nombre` (200), `--spacing-col-acargo` (176), `--spacing-col-dinero` (120), `--spacing-col-menu` (48), `--spacing-avatar` (28), `--spacing-buscador` (320), `--tracking-columna` (0.04em), `--container-admin` (1440), `--container-vacio` (44ch), `--container-sheet` (480), `--container-dialogo` (480).

### 2.2 Excepciones declaradas, y la que esta fase NO hereda

| Regla | En esta fase |
|---|---|
| Piso de toque de **44px** (`--spacing-toque`) | **NO aplica.** Es exclusivo de `app/(cleaner)/` desde `02-UI-SPEC` §2, y la Fase 4 ya lo declaró así para `(admin)`. Los controles de `/finanzas` usan la altura por defecto del `Button` (36px), igual que `/operacion` |
| Toque cómodo de **56px** (`--spacing-toque-comodo`) | **NO aplica.** Lo impuso la Fase 6 para una aseadora con guantes. El admin usa mouse o trackpad, sentado |
| Piso de toque en `app/(cleaner)/mis-pagos` (§10) | **SÍ aplica, sin excepciones.** Esa pantalla vive en el árbol del aseador y hereda las dos reglas de arriba |
| Alto de fila de tabla | 40px (`--spacing-fila`), igual que las tres tablas que ya existen |
| Alto de fila del desglose por aseadora | **56px** (`--spacing-fila-aseador`), porque lleva círculo de 28px más barra de proporción de 4px. No es un objetivo de toque: es la altura que pide el contenido |

### 2.3 Los dos breakpoints, con las cuentas hechas y no estimadas

Esta fase **baja el piso del admin de 1280px a 1024px**, y solo para `/finanzas`. Es una desviación deliberada de `02-UI-SPEC` §6.3 y de `04-UI-SPEC` §6.4, porque el dueño declaró tablet apaisada como dispositivo de uso.

| Breakpoint | Ancho | Útil (menos `px-xl` a cada lado) | Qué pasa |
|---|---|---|---|
| **Escritorio** (referencia) | 1440px | `max-w-admin` 1440 menos 48 = **1392px** | Layout completo: 4 KPIs en fila, dos bloques abajo |
| **Tablet apaisada** (mínimo soportado) | 1024px | 1024 menos 48 = **976px** | Mismo layout, sin scroll horizontal en ninguna tabla |
| Por debajo de 1024px | — | — | Todo se apila en una columna. **No se diseña vista de celular para `(admin)`** y no se construye |

La utilidad de Tailwind que separa los dos casos es `lg:` (1024px exactos). Base = apilado, `lg:` = el layout de §6.1.

**Las cuentas, para que nadie las rehaga a ojo:**

| Zona | A 1440 | A 1024 | Holgura |
|---|---|---|---|
| Card de KPI (4 en fila, `gap-lg` 16) | (1392 − 48) / 4 = **336px** | (976 − 48) / 4 = **232px** | `$ 12.345.678` a 24/600 tabular mide ~150px. Sobran 82px en el caso apretado |
| Bloque 2 y bloque 3 (2 columnas, `gap-2xl` 32) | (1392 − 32) / 2 = **680px** | (976 − 32) / 2 = **472px** | El desglose por aseadora necesita 28 + 8 + nombre + monto: cabe de sobra en 472 |
| Tabla de `/finanzas/aseos` (§7.1) | fijas 728 → `APARTAMENTO` = **664px** | fijas 728 → `APARTAMENTO` = **248px** | Mínimo de `APARTAMENTO` es 200px. **Cabe sin scroll horizontal a 1024** |
| Tabla de `/finanzas/pagos` (§9.1) | fijas 748 → `ASEADOR` = **644px** | fijas 748 → `ASEADOR` = **228px** | Mismo mínimo de 200px. Cabe |

**Las dos tablas caben a 1024 sin scroll horizontal, y por eso ninguna de las dos lleva `containerClassName="overflow-x-visible max-xl:overflow-x-auto"`.** Ese patrón existe en `TablaDia` y en `TablaApartamentos` porque sus columnas fijas no caben; aquí sí caben, y copiarlo sería arrastrar una complicación sin causa. La forma de que siga siendo cierto es no añadir columnas: §7.1 dice explícitamente dónde van las señales para no gastar una.

### 2.4 La regla del ancho, que esta fase vuelve a activar

`--container-boton-marcar` es el único token de `--container-*` que esta fase añade. Lleva **nombre propio** porque Tailwind v4.3 resuelve las utilidades de ancho con nombre contra el namespace de espaciado **antes** que contra el de contenedores, y la escala de espaciado de este proyecto se llama por tallas. `scripts/ci/check-max-w-tallas.sh`, encadenado en `npm run ci:arch`, falla nombrando archivo y línea si vuelve a aparecer una clase de ancho con nombre de talla.

**La mitad que el CI no cierra:** un token que se use como `max-w-*` tiene que registrarse **además** en el grupo `max-w` de `extendTailwindMerge` en `lib/utils.ts`, en orden alfabético. Sin ese registro, el override del sitio de uso no desplaza al de la primitiva y el ancho pasa a depender del orden del CSS.

- `--container-boton-marcar` se usa como **`min-w-boton-marcar`**, no como `max-w`. **No necesita registro**, por la misma razón por la que `--container-boton-alta`, `--container-boton-guardar` y los cuatro de `/operacion` tampoco lo tienen: no hay ninguna clase de primitiva con la que entre en conflicto.
- `--spacing-recibo-alto` se usa como **`max-h-recibo-alto`**, que sale del namespace de espaciado y tampoco compite con nada.
- **Si durante la ejecución aparece un `max-w-*` nuevo, el registro en `cn()` no es opcional.**

---

## 3. Tipografía

**Cero cambios.** Esta fase usa la escala del admin de `02-UI-SPEC` §3, exactamente cuatro tamaños y exactamente dos pesos:

| Rol | Tamaño | Line height | Peso | Dónde, en esta fase |
|---|---|---|---|---|
| Display | 24px | 1.2 | 600 | `<h1>` de cada página, **y el valor de cada KPI** |
| Heading | 16px | 1.3 | 600 | Título de cada card, título de Sheet y de diálogo, encabezado del estado vacío |
| Body | 14px | 1.5 | 400 | Todo el texto corriente: celdas, nombres, montos de tabla, copy |
| Micro | 12px | 1.4 | 400 y 600 | Encabezados de columna (600, `uppercase`, `tracking-columna`), etiquetas de KPI (600), ayuda y captions (400) |

### 3.1 Los KPIs NO estrenan un quinto tamaño

Es la tentación evidente de un tablero financiero: una cifra de 40px para que "pese". **No se hace.** `--text-display` (24/600) es el techo del sistema y la Fase 2 lo fijó en cuatro roles a propósito. Lo que hace que el KPI destaque no es el tamaño de fuente, es **su card propia de alto fijo (`--spacing-kpi`, 104px), su etiqueta en micro 600 uppercase encima y el aire a su alrededor**. Con cuatro cifras a 24/600 en cuatro cards de 336px, la jerarquía ya está resuelta.

Un quinto tamaño rompería el criterio duro del checker (3 o 4 tamaños), obligaría a declarar `--text-*` nuevo, y a registrarlo en el grupo `font-size` de `cn()` (§2.4), que es el mismo defecto silencioso de siempre: el tamaño se escribe, se lee bien en el código y no llega al DOM.

### 3.2 Reglas ligadas, y una es obligatoria en toda la fase

- **`tabular-nums` obligatorio en todo lo que sea una cifra**, sin excepción: los cuatro KPIs, las tres columnas de dinero de §7.1, las tres de §9.1, los conteos del bloque 2, el monto de cada fila del desglose por aseadora, y todo monto de `app/(cleaner)/mis-pagos`. Geist trae numerales tabulares y es la razón por la que `app/globals.css` deja los datos densos en `--font-sans` y no en Poppins. Sin `tabular-nums`, una columna de montos no alinea sus unidades y la comparación visual, que es el único trabajo de esta pantalla, deja de funcionar.
- **Todo monto va alineado a la derecha** en tablas y en filas de dos extremos. Alineado a la izquierda, los miles no se apilan.
- **Ninguna copia de esta fase usa peso 500.** No existe en el sistema.
- Poppins (`font-brand`) **no aparece en ninguna superficie de esta fase**: no hay momentos de marca aquí.

---

## 4. Color

### 4.1 Esta fase no añade ningún token de color. Cero.

| Necesidad | Token existente | Valor |
|---|---|---|
| Superficie de página | `--canvas` | #F6F7F8 |
| Superficie de card | `--background` | #FFFFFF |
| Texto principal, cifras | `--foreground` | #111827 |
| Etiquetas, captions, encabezados de columna | `--muted-foreground` | #5C6470 |
| Pago ya hecho, aseo completado | `--status-ok` · `--surface-ok` | #15803D · #ECFDF3 |
| Pago pendiente, **margen negativo**, recibo no disponible | `--status-warn` · `--surface-warn` | #B45309 · #FFF8EB |
| Aseo en curso ("qué está haciendo ahora") | `--status-progress` | el azul de la Fase 4 |
| Fallo de una operación | `--destructive` | #9F1239 |
| Pista de la barra de proporción | `--muted` | #F1F3F5 |
| Relleno de la barra de proporción | `--muted-foreground` | #5C6470 |

**Recordatorio del guardarraíl 6 de `scripts/ci/check-service-role.sh`:** ningún archivo de UI puede llevar un valor de color literal fuera de `app/globals.css`. Los hex de esta tabla existen para que el executor sepa qué está pintando, no para que los escriba.

### 4.2 La proporción 60/30/10 en esta sección

| Proporción | Qué la ocupa aquí |
|---|---|
| **60% dominante** | `--canvas` del `<main>` del admin: el fondo sobre el que flotan las cards de KPI y los dos bloques |
| **30% secundario** | `--background` de las cards y de las tablas, más el `--canvas` de las filas de encabezado de tabla |
| **10% acento** | `--primary`, y **solo** en los usos que ya estaban en la lista cerrada |

El color de estado (`--status-ok`, `--status-warn`, `--status-progress`) **no consume el 10% de acento**: es semántico, va siempre con icono o con etiqueta, y no cambia con un rebrand.

### 4.3 La lista cerrada del acento NO se amplía. Sigue en nueve usos

`02-UI-SPEC` §4.4 fijó cinco, la Fase 4 añadió el sexto, la Fase 5 el séptimo, la Fase 6 el octavo y el noveno. **Esta fase no añade ninguno.** Lo que usa de esa lista, sin inventar nada:

1. Botón primario de cada pantalla (uno por pantalla, máximo).
2. Subrayado de 2px del link activo de **la barra superior**, que ahora incluye `Finanzas`.
3. Anillo de foco de cualquier control.

Y tres decisiones que existen precisamente para no ampliarla:

| Tentación | Qué se hace en cambio | Por qué |
|---|---|---|
| Subrayar en `--primary` la sub-pestaña activa (Resumen / Pagos) | **Subrayado de 2px en `--foreground`**, más `font-semibold` | Dos subrayados coral apilados con 40px de separación se leen como dos navegaciones del mismo rango. La jerarquía la da la posición, no un segundo acento |
| Pintar la barra de proporción del bloque 3 en `--primary` | **Relleno `--muted-foreground` sobre pista `--muted`** | §6.5.2. Una barra coral por persona son ocho manchas de acento en un bloque de 472px, y el acento deja de significar nada |
| Pintar el KPI de `Ganancia` en `--status-ok` cuando es positiva | **`--foreground`, siempre** | §4.4 |

### 4.4 La regla dura: un margen negativo no es rojo, y una ganancia positiva no es verde

`--destructive` está reservado, desde `02-UI-SPEC` §4.6, a acciones que **revocan o borran**. Un margen negativo no es ninguna de las dos: es un dato. Pintarlo de rojo lo convierte en una alarma que el admin no puede atender (la tarifa ya está congelada en ese aseo: no hay nada que hacer desde esta pantalla).

- **Margen negativo:** `--status-warn` y el signo menos explícito. La cifra ya dice lo que pasa.
- **Ganancia positiva, que es el caso normal:** `--foreground`. Teñir de verde el 95% de los renders hace que el verde no signifique nada, y hace que el 5% restante parezca un fallo del sistema en vez de un mes flojo.
- **Los tres KPIs de costo** (`Pagado a aseadores`, `Gastos reembolsados`): `--foreground`. Pagarle a la gente no es una pérdida.

### 4.5 Jerarquía visual: qué ancla cada pantalla

Un solo ancla por pantalla, declarado para que el executor no lo adivine.

| Pantalla | Ancla visual primaria | Qué la hace ganar | Segundo nivel |
|---|---|---|---|
| `/finanzas` (Resumen) | **La fila de cuatro KPIs** | Es lo primero bajo el `<h1>`, son las únicas cifras a 24/600 de la pantalla, y cada una tiene una card de 104px solo para ella | El filtro de periodo, inmediatamente encima: es lo que las gobierna |
| `/finanzas/aseos` | **La columna `MARGEN`** | Es la única columna que responde la pregunta de FIN-02, va a la derecha del todo y es el final de la lectura de cada fila | La fila de totales al pie de la tabla |
| `/finanzas/pagos` | **La columna `TOTAL` y el botón `Marcar pagado`** | El total es la cifra que se transfiere; el botón es la única acción de la pantalla y el único relleno primario | La cabecera de cada periodo, con sus fechas y su conteo de pendientes |
| `/finanzas/aseadoras/[id]` | **El total del periodo, en la cabecera de la ficha** | Cifra a 24/600 junto al nombre, antes de los cuatro bloques | El bloque "Ahora mismo", que es lo único que cambia solo |
| `app/(cleaner)/mis-pagos` | **El monto del periodo más reciente ya cerrado** | Es la única cifra a 28/600 y está en la primera tarjeta | Las fechas exactas que cubre |

**Regla derivada, y el executor la tiene que respetar:** en ninguna pantalla de esta fase hay **dos rellenos primarios a la vez**. En `/finanzas` y `/finanzas/aseos` no hay **ninguno**: son pantallas de lectura y no tienen acción primaria que inventar.

---

## 5. Arquitectura de navegación

Responde, en orden: qué es página, qué es panel, qué es diálogo, y cómo se vuelve.

### 5.1 Dónde entra la sección

`TopNav` pasa de tres links a **cuatro**, y `Finanzas` va **último**:

```
VivaGuest   Operación  Apartamentos  Aseadores  Finanzas              JO ▾
```

- Va último porque el orden actual es de frecuencia de uso y la operación del día manda. El dinero se consulta, no se coordina.
- El tratamiento del link no cambia: 14/400, alto de barra completo, activo en 600 con `border-bottom` de 2px en `--primary` y `aria-current="page"`.
- `ruta.startsWith('/finanzas/')` ya hace que el link quede activo en todas las subrutas. **No hay que tocar esa lógica.**
- Sigue en pie la regla de la Fase 2: **no se añaden links de fases futuras.** Un link muerto promete navegación que no existe.

### 5.2 Las cinco superficies

| Ruta | Qué es | Cómo se llega | Cómo se vuelve |
|---|---|---|---|
| `/finanzas` | **Página.** Sub-pestaña Resumen | `TopNav` | — |
| `/finanzas/aseos` | **Página.** El detalle aseo por aseo (FIN-02) | Tocando un conteo del bloque 2 | Link `Volver al resumen` con icono `ArrowLeft`, arriba a la izquierda, encima del `<h1>` |
| `/finanzas/aseadoras/[id]` | **Página.** La ficha de una persona | Tocando una fila del bloque 3 | Igual |
| `/finanzas/pagos` | **Página.** Sub-pestaña Pagos | Sub-nav | — |
| `app/(cleaner)/mis-pagos` y `/mis-pagos/[id]` | **Páginas**, en el árbol del aseador | Link en `/mis-aseos` | `Volver`, §10.2 |

**El sub-nav de Resumen / Pagos** vive dentro del contenido, debajo del `<h1>`, y son dos `<Link>`:

```
Finanzas                                          [ < ] septiembre de 2026 [ > ] [Hoy]
─────────────────────────────────────────────────────────────────────────────────────
 Resumen   Pagos
━━━━━━━━━─────────────────────────────────────────────────────────────────────────────
```

- Alto 40px, `gap-xs` (4px) entre los dos, `px-md` cada uno.
- Activo: `font-semibold` `--foreground` con `border-bottom` de 2px en **`--foreground`** (§4.3). Inactivo: `--muted-foreground`, sin borde, `hover:text-foreground`.
- Línea base de 1px en `--border` a todo el ancho, para que el subrayado se apoye en algo.
- `aria-current="page"` en el activo.
- **`/finanzas/aseos` y `/finanzas/aseadoras/[id]` marcan `Resumen` como activo**: son sus hijas, se llega a ellas desde ahí y se vuelve ahí.

### 5.3 Panel y diálogo: la regla, no el caso

| Superficie | Cuándo se usa | Caso de esta fase |
|---|---|---|
| **Página** | El contenido tiene más de un bloque, o necesita filtros propios, o conviene poder volver con el botón del navegador y compartir la URL | Las cinco de §5.2 |
| **`Sheet` de 480px, lado derecho** | El detalle de **una fila**, de solo lectura, cuando el admin va a abrir varias seguidas y quiere conservar la tabla detrás | **El desglose de un pago** (§9.3) |
| **`Dialog` de 480px** | Un solo objeto que se mira y se cierra | **El recibo del gasto** (§9.4) |
| **`AlertDialog`** | Una decisión que no se puede deshacer desde la interfaz | **`Marcar pagado`** (§9.2) y **`Cerrar el periodo ahora`** (§9.5) |

**El `Sheet` ya tiene su cadena de override resuelta** y no se rediseña: la cabecera de `components/ui/sheet.tsx` documenta que el override en el sitio de uso tiene que repetir `data-[side=right]:sm:max-w-sheet` exacto. Copiarla, no reinventarla.

**Por qué el desglose del pago es Sheet y la ficha de aseadora es página**, que es la pregunta razonable: el desglose son dos listas de solo lectura de una fila que el admin abre, mira y cierra, ocho veces seguidas mientras paga. La ficha tiene cuatro bloques, uno de ellos con su propio estado en vivo, y además abre recibos: un diálogo dentro de un panel dentro de una página es donde se pierde el foco y el `Escape` deja de hacer lo que uno espera.

---

## 6. `/finanzas` — la sub-pestaña Resumen

### 6.1 Anatomía

```
┌─ barra superior 56px, sticky ───────────────────────────────────────────────────────┐
├─────────────────────────────────────────────────────────────────────────────────────┤
│ Finanzas                             [Día][Semana][Mes]  [‹] septiembre de 2026 [›] │
│ ─────────────────────────────────────────────────────────────────────────────────── │
│  Resumen   Pagos                                                                    │
│ ━━━━━━━━━──────────────────────────────────────────────────────────────────────────  │
│                                                                                     │
│ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐             │
│ │ COBRADO       │ │ PAGADO A ASE… │ │ GASTOS REEMB… │ │ GANANCIA      │             │
│ │ $ 4.320.000   │ │ $ 2.160.000   │ │ $ 184.000     │ │ $ 1.976.000   │             │
│ │               │ │               │ │               │ │ Cobrado menos…│             │
│ └───────────────┘ └───────────────┘ └───────────────┘ └───────────────┘             │
│                                                                                     │
│ ┌─────────────────────────────────────┐ ┌─────────────────────────────────────────┐ │
│ │ Aseos del periodo                   │ │ Cuánto cuesta cada aseadora             │ │
│ │ ─────────────────────────────────── │ │ ─────────────────────────────────────── │ │
│ │ Aseos hechos            48      ›   │ │ (MG) María González        $ 540.000    │ │
│ │ $ 1.976.000 de margen               │ │      ██████████████░░░░░░░░░░░░░░░      │ │
│ │ ─────────────────────────────────── │ │ (AR) Ana Rodríguez         $ 480.000    │ │
│ │ Con gastos              12      ›   │ │      ████████████░░░░░░░░░░░░░░░░░      │ │
│ │ $ 184.000 reembolsados              │ │ (LP) Luis Pérez            $ 360.000    │ │
│ │ ─────────────────────────────────── │ │      █████████░░░░░░░░░░░░░░░░░░░      │ │
│ │ Con daños                3      ›   │ │ ...                                     │ │
│ │ Los daños no se descuentan del pago.│ │                                         │ │
│ │ ─────────────────────────────────── │ │                                         │ │
│ │ Margen promedio por aseo  $ 41.167  │ │                                         │ │
│ └─────────────────────────────────────┘ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

- Contenedor: el `<main>` del layout ya aporta `max-w-admin` y `px-xl`. **No se toca `app/(admin)/layout.tsx`.**
- Fila de KPIs: `grid grid-cols-2 lg:grid-cols-4 gap-lg`.
- Dos bloques de abajo: `grid grid-cols-1 lg:grid-cols-2 gap-2xl items-start`.
- **`items-start` es deliberado:** los dos bloques NO se igualan de alto. Igualarlos dejaría 200px de blanco dentro de la card del bloque 2, que es la más corta y la más estable.
- **Ningún bloque tiene scroll interno.** El carril de `/operacion` lo necesita porque es `sticky` y tiene que enseñar dos cosas a la vez; aquí nada es sticky y la página scrollea entera. Si el equipo pasa de 12 personas, el bloque 3 crece y la página crece con él. Es correcto.
- Separación entre la fila de KPIs y los bloques: `gap-2xl` (32px).

### 6.2 El filtro de periodo, que manda sobre toda la pantalla

Vive en la **cabecera de la página**, a la derecha del `<h1>`, encima del sub-nav, porque gobierna todo lo de abajo y tiene que verse sin scroll.

**Contrato de URL, y es lo que hace que el filtro sea enlazable y sobreviva a un refresco:**

```
/finanzas?rango=dia|semana|mes&ancla=YYYY-MM-DD
```

- Por defecto, sin parámetros: `rango=mes`, `ancla=hoyBog()`.
- `ancla` es cualquier día dentro del periodo. El servidor deriva `desde` y `hasta`.
- **La semana arranca en lunes.** Es lo que espera un calendario colombiano, y se declara para que no lo decida la librería.
- **`ancla` viaja a `/finanzas/aseos` y a `/finanzas/aseadoras/[id]` en la URL.** Entrar al detalle no puede cambiar el periodo: sería un cambio de contexto invisible.

**Los controles, tres piezas:**

| Pieza | Forma | Detalle |
|---|---|---|
| Selector de rango | Tres `Button` dentro de un contenedor con `border` de 1px y `rounded-md` | Activo: `variant="secondary"` (fondo `--canvas`), `font-semibold`, `aria-pressed="true"`. Inactivo: `variant="ghost"`, `--muted-foreground`. Altura por defecto del `Button` |
| Navegación | Dos `Button variant="ghost" size="icon"` con `ChevronLeft` y `ChevronRight` | `aria-label` `Periodo anterior` y `Periodo siguiente`. **`Periodo siguiente` va `disabled` cuando el periodo actual ya contiene hoy**: no hay futuro que mirar, y un botón que no hace nada es peor que uno apagado |
| Etiqueta del periodo | Texto `body` 14/600, entre los dos chevrons, `tabular-nums` | Ver §11.2 para el formato exacto de las tres |
| Volver a hoy | `Button variant="ghost"` con label `Hoy` | **Se renderiza solo cuando el periodo NO contiene hoy.** Aparecer y desaparecer es información: si está, es que te fuiste de hoy |

**Prohibido un `Select` para el rango.** Tres opciones que se cambian decenas de veces por sesión detrás de dos clics es exactamente el caso que un segmentado resuelve.

### 6.2.1 La palabra "mes" significa dos cosas distintas, y la interfaz lo tiene que decir

En **Resumen**, `mes` es el mes calendario: del 1 al 30 de septiembre. Es una vista en vivo que se recalcula.

En **Pagos**, el periodo va de **cierre a cierre** (D7-5): puede ser del 1 al 30 porque enero cerró el viernes 30, y el 31 pertenece al periodo siguiente.

**Reglas duras que salen de ahí:**

1. **Ninguna etiqueta, ningún KPI y ningún copy de `/finanzas` (Resumen) usa la palabra `pago`, `periodo de pago`, `cierre` ni `liquidación`.** El bloque 3 dice `Cuánto cuesta cada aseadora`, no `Pago del mes`.
2. **Ninguna cifra del Resumen se presenta como "lo que se le debe" a nadie.** Lo que se debe vive en Pagos y solo existe cuando el periodo se cerró.
3. En Pagos, **cada periodo se rotula con sus dos fechas reales** (§11.3), nunca solo con el nombre del mes.

Si estas tres se rompen, el admin va a transferir plata calculada sobre un mes calendario que no coincide con el periodo que la persona cobró. Es el defecto más caro que esta pantalla puede producir.

### 6.3 Bloque 1: los KPIs

Cuatro cards, alto fijo `--spacing-kpi` (104px), `p-lg` (16px), `border` de 1px, `bg-background`, `rounded-md`. Sin icono, sin color de fondo y sin flecha de tendencia: no hay periodo anterior contra el que comparar dentro del alcance de esta fase (el histórico está declarado como no definido en la DEFINICION §6), y una flecha sin serie es decoración que miente.

| # | Etiqueta (micro 12/600 uppercase `tracking-columna` `--muted-foreground`) | Valor (display 24/600 `tabular-nums` `--foreground`) | Caption (micro 12/400 `--muted-foreground`) |
|---|---|---|---|
| 1 | `COBRADO` | Suma de `tarifa_huesped` de los aseos del periodo | ninguna |
| 2 | `PAGADO A ASEADORES` | Suma de `pago_aseador` | ninguna |
| 3 | `GASTOS REEMBOLSADOS` | Suma de los gastos aprobados del periodo | ninguna |
| 4 | `GANANCIA` | 1 menos 2 menos 3 | `Cobrado menos pagos y gastos` |

- **Solo el cuarto lleva caption**, porque es el único derivado y es la cifra sobre la que el dueño va a tomar decisiones. Los otros tres se explican solos y cuatro captions serían ruido.
- **Los cuatro excluyen los apartamentos de gestión externa** (FIN-05). Eso no se dice en pantalla: la unidad informativa no es negocio propio y anotarlo en cada KPI sería explicar una ausencia.
- Orden fijo, izquierda a derecha, siempre el mismo. Es una lectura de suma y resta: ingreso, costo, costo, resultado.
- Con el filtro en `día` y sin aseos, los cuatro muestran `$ 0`, **no** em dash: cero cobrado es un hecho del día, no un dato ausente. El estado vacío de §12.1 lo cubre en el bloque 2, que es donde tiene sentido.

### 6.4 Bloque 2: los aseos del periodo

Card **operativa, de conteos, no una tabla**. Tres filas navegables de 48px más una línea de cierre.

| Fila | Etiqueta (body 14/400) | Cifra (body 14/600 `tabular-nums`) | Línea de apoyo (micro 12/400 `--muted-foreground`) | Destino |
|---|---|---|---|---|
| 1 | `Aseos hechos` | `{N}` | `{$X} de margen` | `/finanzas/aseos?...&filtro=todos` |
| 2 | `Con gastos` | `{N}` | `{$Y} reembolsados` | `...&filtro=con-gastos` |
| 3 | `Con daños` | `{N}` | `Los daños no se descuentan del pago.` | `...&filtro=con-danos` |

Al pie, separada por un `Separator`, una línea **no navegable**: `Margen promedio por aseo` con su cifra a la derecha.

**Comportamiento de la fila:**

- Toda la fila es navegable, con `ChevronRight` de 16px a la derecha en `--muted-foreground`.
- El `<a>` vive en la celda de la etiqueta y estira su área con `::after { position:absolute; inset:0 }`, que es el patrón que `TablaApartamentos` y `FilaAseo` ya usan. **No se convierte el `<div>` en clicable.**
- `hover:bg-canvas`, `transicion` (la utilidad de 120ms del proyecto).
- Nombre accesible de cada fila: `Aseos hechos, 48. Ver el detalle.`
- **Una fila con cifra 0 sigue navegable y no se oculta.** Ir a una lista vacía con su estado vacío explicado es mejor que preguntarse por qué desapareció una fila que ayer estaba.

**La línea `Los daños no se descuentan del pago.` no es decorativa.** Es D7-2 hecho visible: el dueño decidió explícitamente que un descuento automático sobre el sueldo es una conversación y no un cálculo. Sin esa línea, un conteo de daños al lado de un tablero de pagos se lee como una deducción pendiente.

### 6.5 Bloque 3: cuánto cuesta cada aseadora

Es la pregunta abierta que este contrato tiene que cerrar. Se cierra así.

#### 6.5.1 Números como dato, barra como contexto. Las dos

El dueño pidió barras. Las barras solas **no comunican aquí**, y por una razón concreta: sin una escala común declarada, una barra solo dice "más que el de al lado", que es exactamente la lectura que la DEFINICION ya rechazó para el revenue por persona. Y el número solo tampoco alcanza: `$ 540.000` al lado de `$ 480.000` no deja ver que una persona es el 28% de la nómina del periodo y la otra el 25%.

**Contrato, y es el punto que estaba pendiente:**

| Elemento | Qué es | Regla |
|---|---|---|
| **El número** | El dato primario | `$ 540.000` a body 14/600, `tabular-nums`, alineado a la derecha. Es lo que el admin lee |
| **La barra** | Contexto de proporción, nada más | 4px de alto (`h-xs`), `rounded-full`, debajo de la fila, ancho completo de la card |
| **La escala** | **El denominador es el TOTAL del periodo**, no el máximo del grupo | Es la decisión que hace honesta la barra |

**Por qué el denominador es el total y no el máximo.** Con denominador = máximo, la primera persona llena siempre la barra al 100% y el bloque se convierte en un podio: la forma no depende de los datos, depende de quién quedó primero. Con denominador = total, cada barra dice literalmente **qué porción de la nómina del periodo es esa persona**, y la suma de las ocho barras es el ancho de la card. Eso sí es información nueva que el número no da.

**Consecuencia visual que hay que aceptar:** con ocho personas repartidas parejo, ninguna barra pasa del 20% del ancho. Se ve "vacío" y **está bien**: eso es exactamente lo que significa un equipo con carga repartida. Una barra al 60% en ese bloque es una señal real (alguien está cargando con todo) y se lee de un vistazo.

#### 6.5.2 Color y semántica de la barra

- Pista: `--muted` (#F1F3F5). Relleno: `--muted-foreground` (#5C6470).
- **No es `Progress` y no es `--primary`** (§1.2 y §4.3).
- **`aria-hidden="true"`.** El número está a 8px de distancia y dice lo mismo con más precisión. Anunciarla sería leer la misma cifra dos veces por cada persona.
- Sin transición de ancho. `02-UI-SPEC` §6.4 solo permite transiciones de color, borde y opacidad: animar el ancho es layout.

#### 6.5.3 La regla anti ranking

La DEFINICION descartó el revenue por persona porque *"parece un ranking de desempeño y en realidad es un ranking de a quién le tocaron los apartamentos buenos"*. El costo por persona tiene la misma trampa un nivel más abajo: depende de cuántos aseos le asignaron, no de cómo trabaja. Por eso:

- **Prohibido numerar las filas** (`1.`, `2.`, `3.`).
- **Prohibida cualquier medalla, corona, color de posición o etiqueta `Top`.**
- **Prohibido teñir la fila o la barra según la posición.** Las ocho barras son del mismo color.
- El título de la card es `Cuánto cuesta cada aseadora`, en presente y sin comparativo. **No** `Ranking`, **no** `Más costosas`, **no** `Rendimiento`.

**El orden sí es descendente por total**, y eso no contradice lo anterior: el trabajo de este bloque es "cuánto le estoy pagando a cada quien", y poner los compromisos más grandes arriba es lo útil. Lo que estaba prohibido era **presentarlo** como una clasificación de personas, no ordenar una lista de plata.

#### 6.5.4 Anatomía de la fila (56px, `--spacing-fila-aseador`)

```
┌───────────────────────────────────────────────────────┐
│ (MG)  María González                      $ 540.000   │   ← 14/600 el nombre, 14/600 tabular el monto
│       ████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   │   ← 4px, aria-hidden
└───────────────────────────────────────────────────────┘
```

- Círculo de iniciales de 28px (`size-avatar`), fondo `--muted`, texto micro 12/600 `--foreground`, `aria-hidden="true"`. Es el mismo componente que el menú de usuario de `TopNav` (§14.3).
- Nombre: body 14/600 `--foreground`, truncado con elipsis si no cabe, con `title` para el nombre completo.
- Monto: **pago más gastos reembolsados**, que es lo que D7-2 define como el costo de esa persona. Alineado a la derecha.
- **Una segunda línea, micro 12/400 `--muted-foreground`, solo cuando la persona tiene gastos en el periodo:** `{N} aseos · {$G} en gastos`. Sin gastos: `{N} aseos`.
- Toda la fila navega a `/finanzas/aseadoras/[id]`, con el mismo patrón de `::after` de §6.4.
- `hover:bg-canvas`, `transicion`.
- Separador de 1px `--border` entre filas. **Sin zebra**, igual que las tres tablas existentes.

#### 6.5.5 El buscador

El dueño lo pidió *"para cuando el equipo crezca y la lista deje de caber"*. Con ocho personas no hay nada que buscar y un campo de 320px permanentemente vacío sobre ocho filas es ruido.

**Contrato:** el `Input` de búsqueda (con icono `Search` de 16px a la izquierda, `placeholder` `Buscar aseadora`) **se renderiza solo cuando el bloque tiene más de 8 filas**. Por debajo de ese umbral, la cabecera de la card lleva solo el título.

Es una interpretación de la intención declarada, no una desviación: el dueño ató el buscador al crecimiento del equipo. **Si quiere verlo siempre, es cambiar una constante.** Queda anotado en §17.

Cuando aparece: filtra en cliente por `includes` sin acentos ni mayúsculas, y el resultado vacío usa el copy de §12.1. **La barra de proporción sigue calculándose contra el total del periodo completo, no contra el subconjunto filtrado.** Si la escala cambiara al filtrar, la barra mentiría.

---

## 7. `/finanzas/aseos` — el detalle aseo por aseo (FIN-02)

Es el destino de los tres conteos del bloque 2 y **es donde vive el criterio 2 de la DEFINICION**: filtrar por apartamento y por aseador.

### 7.1 Columnas

Ancho útil: 1392px a 1440, 976px a 1024 (§2.3).

| # | Columna | Ancho | Alineación | Contenido |
|---|---|---|---|---|
| 1 | `APARTAMENTO` | flexible, `min-w-col-nombre` 200px | izquierda | 14/600, `<a>` a `/apartamentos/[id]`. **Las señales van inline aquí**, detrás del nombre |
| 2 | `PROGRAMADO` | `--spacing-col-fecha` 96px | izquierda | `28 ene`, `tabular-nums` |
| 3 | `HECHO` | `--spacing-col-fecha` 96px | izquierda | `2 feb`, `tabular-nums`. **En `--status-warn` cuando cae en un periodo distinto al programado** |
| 4 | `A CARGO` | `--spacing-col-acargo` 176px | izquierda | Nombre del aseador |
| 5 | `COBRADO` | `--spacing-col-dinero` 120px | derecha | `tabular-nums` |
| 6 | `PAGADO` | `--spacing-col-dinero` 120px | derecha | `tabular-nums` |
| 7 | `MARGEN` | `--spacing-col-dinero` 120px | derecha | `tabular-nums`. §4.4 para el negativo |

Fijas: 96 + 96 + 176 + 120 + 120 + 120 = **728px**. `APARTAMENTO` recibe 664px a 1440 y **248px a 1024**, contra su mínimo de 200. Cabe sin scroll horizontal.

**Las señales van inline en la celda 1 y no en una columna propia**, que es el patrón que `04-UI-SPEC` §5.2 ya estableció. Es también lo que hace que la tabla quepa a 1024 (§2.3): una octava columna la rompería.

| Señal | Forma | Cuándo |
|---|---|---|
| Gasto | Icono `Receipt` de 14px en `--muted-foreground` con `aria-label` `Tiene gasto reportado` | El aseo generó al menos un gasto. **Es el disparador del diálogo de recibo** (§9.4) |
| Daño | Icono `Hammer` de 14px en `--status-warn` con `aria-label` `Tiene daño reportado` | El aseo generó al menos un daño |

**Fila de totales al pie de la tabla**, dentro de un `<tfoot>`: `{N} aseos` en la celda 1, y los tres totales alineados bajo sus columnas en 14/600. Es la conciliación contra los KPIs del Resumen y tiene que cuadrar exactamente.

### 7.2 Los filtros de esta pantalla

En una toolbar sobre la tabla, `gap-md`, a la izquierda. El periodo **no se re-declara aquí**: llega heredado en la URL y se muestra como texto en la cabecera, con el link `Volver al resumen` para cambiarlo.

| Control | Forma | URL |
|---|---|---|
| Apartamento | `Popover` + `Command` (combobox con búsqueda). 34 unidades gestionadas, una lista plana es inusable | `&apartamento={id}` |
| Aseador | `Select`, ~8 opciones más `Todos` | `&aseador={id}` |
| Tipo | Tres `Button` segmentados: `Todos` · `Con gastos` · `Con daños` | `&filtro=todos\|con-gastos\|con-danos` |

- **Los tres son links o navegaciones de servidor**, no estado de cliente: cambian **qué filas lee el servidor**, así que viven en la URL. Es la regla que `PanelAlertas` ya dejó escrita.
- Cuando hay algún filtro activo además del periodo, aparece un `Button variant="ghost"` con label `Quitar filtros`.
- **Ninguna unidad de gestión externa aparece en el combobox de apartamento** (FIN-05). No están filtradas de la lista: no existen para esta pantalla.

---

## 8. `/finanzas/aseadoras/[id]` — la ficha

### 8.1 Cabecera

```
‹ Volver al resumen

(MG)  María González                                        $ 540.000
      8 aseos en septiembre de 2026              lo que cuesta en el periodo
```

- Círculo de iniciales de 28px, nombre a display 24/600, total a display 24/600 `tabular-nums` alineado a la derecha.
- Bajo el nombre: micro 12/400 `--muted-foreground` con el conteo y el periodo.
- Bajo el total: micro 12/400 `--muted-foreground` con `lo que cuesta en el periodo`. **Esa etiqueta es obligatoria**: sin ella, una cifra grande junto a una persona se lee como "lo que se le debe", y lo que se debe solo existe en Pagos.

### 8.2 Los cuatro bloques, en este orden

`grid grid-cols-1 lg:grid-cols-2 gap-2xl items-start`. Orden de lectura: primero lo que está pasando, después lo que pasó.

| # | Bloque | Contenido | Vacío |
|---|---|---|---|
| 1 | **Ahora mismo** | §8.4 | §12.1 |
| 2 | **Sus aseos del periodo** | Tabla de 4 columnas: `APARTAMENTO` (flex) · `PROGRAMADO` 96 · `HECHO` 96 · `PAGO` 120 derecha | §12.1 |
| 3 | **Sus pagos mes a mes** | Una fila por periodo cerrado: fechas del periodo, total, y `Pagado el {fecha}` o `Pendiente`. **Sin límite de periodo: esto no lo filtra el selector de arriba** | §12.1 |
| 4 | **Sus gastos reportados** | Una fila por gasto: fecha, apartamento, concepto, monto, y `Ver recibo` | §12.1 |

**El bloque 3 ignora el filtro de periodo a propósito, y hay que decirlo en pantalla.** Su caption es `Todos sus periodos cerrados`. Los pagos son historial; filtrarlos por el rango de arriba dejaría "sus pagos" con una sola fila cuando el filtro está en `día`, que no responde ninguna pregunta.

### 8.3 Los gastos y sus recibos

Cada fila del bloque 4 lleva un `Button variant="ghost" size="sm"` con icono `Receipt` y label `Ver recibo`, que abre el diálogo de §9.4. Cuando la foto ya no existe, el botón **no se renderiza** y en su lugar va micro 12/400 `--status-warn`: `Sin recibo disponible`.

### 8.4 "Ahora mismo", y la regla del GPS

El bloque 1 responde *"¿dónde está cada miembro de mi equipo?"* con lo que el sistema ya sabe: qué aseo tiene en curso.

| Estado | Copy | Color |
|---|---|---|
| Tiene un aseo en curso | `Está en {apartamento} desde las {HH:mm}.` | Icono `Play` de 16px en `--status-progress`. La etiqueta de estado reutiliza `EstadoAseo` |
| No tiene ninguno | `No tiene ningún aseo en curso.` | Icono `Clock` de 16px en `--muted-foreground` |
| Está desactivada | `Esta cuenta está desactivada.` | Icono `UserRoundX` de 16px en `--status-warn` |

**Reglas duras, y no son de estilo:**

- **Prohibido cualquier mapa, pin, coordenada, `Ver ubicación` o la palabra `ubicación` en esta pantalla.** No hay GPS y no lo va a haber. Una interfaz que insinúa rastreo cuando no existe crea una expectativa que nadie va a poder cumplir, y una conversación con el equipo que nadie quiere tener.
- **Prohibido un indicador de "en línea" o "última vez activa".** El sistema no lo mide.
- El nombre del apartamento **no** es un link al aseo en curso: esta es una pantalla de plata, y saltar desde aquí a la operación mezcla las dos cosas que D7-1 separó.
- **No se refresca solo.** Sin Realtime en esta pantalla, el dato es de cuando se cargó. Bajo el bloque, micro 12/400 `--muted-foreground`: `Al momento de abrir esta página.` Un dato operativo que parece vivo y no lo está es peor que uno fechado.

---

## 9. `/finanzas/pagos` — la sub-pestaña Pagos

Es el registro de lo que se debe y de lo que se pagó. **Sobrevive al borrado de los aseos** (FIN-04), y esa es su razón de existir frente al Resumen.

### 9.1 Anatomía

Un bloque colapsable por periodo cerrado, del más reciente al más antiguo. **Solo el más reciente viene abierto**; el resto, cerrados. Reutiliza el patrón de cabecera de `BloqueDia` de `/operacion` (48px, `--spacing-dia-cabecera`, `ChevronDown` / `ChevronRight`).

Cabecera de cada periodo:

```
▼ Del 1 al 30 de enero de 2026          8 personas · $ 3.240.000 · faltan 3 por pagar
```

- Fechas a body 14/600. El resumen de la derecha a micro 12/400 `--muted-foreground`, salvo `faltan {N} por pagar`, que va en `--status-warn` cuando N es mayor que cero, y se sustituye por `Todos pagados` en `--status-ok` cuando N es cero.

Columnas de la tabla interna:

| # | Columna | Ancho | Alineación | Contenido |
|---|---|---|---|---|
| 1 | `ASEADOR` | flexible, `min-w-col-nombre` 200px | izquierda | Círculo de iniciales 28px + nombre 14/600. `<a>` que abre el Sheet de §9.3 |
| 2 | `ASEOS` | `--spacing-col-conteo` 88px | derecha | Entero, `tabular-nums` |
| 3 | `POR ASEOS` | `--spacing-col-dinero` 120px | derecha | `tabular-nums` |
| 4 | `GASTOS` | `--spacing-col-dinero` 120px | derecha | `tabular-nums`. `$ 0` cuando no hubo, no em dash |
| 5 | `TOTAL` | `--spacing-col-dinero` 120px | derecha | `tabular-nums`, **14/600** |
| 6 | `PAGADO` | `--spacing-col-pagado` 140px | izquierda | `Pagado el 3 feb` con `CircleCheck` de 14px en `--status-ok`, o `Pendiente` en `--status-warn` |
| 7 | — | `--spacing-col-accion-pago` 160px | derecha | `Marcar pagado` cuando está pendiente. **Vacía cuando ya se pagó** |

Fijas: 88 + 120 + 120 + 120 + 140 + 160 = **748px**. `ASEADOR` recibe 644px a 1440 y **228px a 1024**. Cabe.

- **Las columnas 3 y 4 separadas, y no un total plano, es D7-2 en la tabla.** El snapshot guarda las dos partidas por separado justamente para esto.
- Encabezados con el mismo tratamiento que las tablas existentes: 12/600 `uppercase` `tracking-columna` `--muted-foreground`, fila de 32px sobre `--canvas`.
- **Sin columna de `⋯`.** Esta pantalla tiene exactamente una acción y esconderla en un menú sería esconder el trabajo de la pantalla.

### 9.2 `Marcar pagado`

`Button variant="outline" size="sm"` con `min-w-boton-marcar` (148px), label `Marcar pagado`. En vuelo: icono `Loader2` girando y label `Marcando…`, **conservando el ancho** por el `min-width`, que es la regla de §15.2 de la Fase 4.

**Es irreversible desde la interfaz y por eso lleva `AlertDialog`:**

| Elemento | Copy |
|---|---|
| Título | `¿Ya le pagaste a María González?` |
| Cuerpo | `Se registra que le pagaste $ 540.000 del periodo del 1 al 30 de enero, con la fecha de hoy y tu nombre. Esto no se puede deshacer desde acá.` |
| Confirmar | `Sí, ya le pagué` |
| Cancelar | `Cancelar` (`variant="outline"`) |

- **No es una acción destructiva**: no borra ni revoca nada. Por eso el botón de confirmar **no** es `variant="destructive"` y **no** lleva icono de peligro. Lleva `AlertDialog` por ser irreversible, que es otra cosa.
- **El monto y el nombre van en el cuerpo del diálogo, literales.** Es la última pantalla antes de una transferencia real.
- Al confirmar: `toast` de `sonner` con `Registrado. María González, $ 540.000.` y la tabla se refresca.
- **La Server Action NO llama `revalidatePath`.** El refresco lo pide `router.refresh()` desde el cliente. Es el defecto medido en el plan 04-14 y el árbol de cliente de esta pantalla es del tamaño que lo dispara.
- **La action arranca con `exigirAdmin()`.** Un Server Action es un endpoint HTTP público; que el botón viva en `(admin)` no autoriza nada.
- Marcar dos veces está bloqueado en la base. Si el error llega igual (dos pestañas abiertas), el toast destructivo lo dice con el copy de §12.3.

### 9.3 El desglose de un pago (Sheet de 480px, lado derecho)

Se abre al tocar el nombre en la columna 1.

```
┌──────────────────────────────────────────────┐
│ María González                            ×  │
│ Del 1 al 30 de enero de 2026                 │
│ ──────────────────────────────────────────── │
│ POR ASEOS                        $ 480.000   │
│                                              │
│ Bogotá 3                          $ 45.000   │
│ Programado 28 ene · Hecho 2 feb              │
│ ──────────────────────────────────────────── │
│ Medellín 1                        $ 45.000   │
│ Programado 29 ene · Hecho 29 ene             │
│ ...                                          │
│ ──────────────────────────────────────────── │
│ GASTOS REEMBOLSADOS               $ 60.000   │
│                                              │
│ Jabón y trapos                    $ 35.000   │
│ 12 ene · Bogotá 3          [ Ver recibo ]    │
│ ──────────────────────────────────────────── │
│ TOTAL                            $ 540.000   │
└──────────────────────────────────────────────┘
```

- Título del Sheet: nombre a heading 16/600. Debajo, las fechas del periodo a micro 12/400 `--muted-foreground`.
- Dos secciones con encabezado micro 12/600 uppercase `tracking-columna` y su subtotal a la derecha en 14/600.
- **Cada aseo muestra las dos fechas en su segunda línea, siempre** (D7-8). `Programado 28 ene · Hecho 2 feb`. **No es opcional y no se abrevia cuando coinciden**: si aparece solo en los casos raros, deja de ser información y pasa a ser una señal de alarma.
- `TOTAL` al pie, separado por `Separator`, a 14/600.
- **Prohibido, y es la frontera de §10.1 aplicada aquí:** este Sheet no muestra `tarifa_huesped`, ni margen, ni ninguna cifra de huésped. No porque el aseador lo vaya a ver (no lo ve), sino porque el desglose del admin y el del aseador tienen que ser **el mismo documento**: si el admin ve una columna de más, cuando alguien reclame van a estar comparando dos papeles distintos.
- Las líneas son **texto snapshoteado**, no joins vivos. Un aseo borrado por antigüedad sigue mostrando su apartamento y sus fechas. **No se renderiza ningún link desde estas líneas**: apuntarían a filas que pueden no existir.

### 9.4 El recibo del gasto (`Dialog` de 480px)

Primera superficie del admin que muestra una foto.

| Elemento | Detalle |
|---|---|
| Título | Heading 16/600: el concepto del gasto |
| Subtítulo | Micro 12/400 `--muted-foreground`: `{fecha} · {apartamento} · {$monto}` |
| Imagen | `w-full`, `max-h-recibo-alto` (480px), `object-contain`, `rounded-md`, borde de 1px `--border` |
| `alt` | `Recibo de {concepto}` |
| Cierre | `Cerrar` en `variant="outline"`, más la `×` del `Dialog` y `Escape` |

- La URL firmada se genera **en el servidor, después del guard de admin**, contra el bucket privado. No viaja ninguna ruta de Storage al cliente sin firmar.
- La vida de la URL es corta. Si el admin deja el diálogo abierto y la firma vence, la imagen falla: el `onError` sustituye la imagen por el estado de §12.1 con `Vuelve a abrir el recibo.`
- **Sin zoom, sin galería y sin descarga.** Es un recibo de 200 KB que se mira una vez.

### 9.5 `Cerrar el periodo ahora` (adición declarada, sujeta a veto)

**Esto no está en la DEFINICION.** Se añade con una razón y se declara para que el dueño pueda quitarlo de un plumazo.

El cierre lo dispara un job agendado. Si ese job falla el último día hábil, no hay pago que mostrar y **el admin no tiene ninguna forma de recuperarse desde la interfaz**. El RPC de admin ya está en el diseño técnico (`07-RESEARCH.md` §Pattern 4) como camino de reintento.

**Contrato mínimo, deliberadamente discreto:**

- Aparece **solo** cuando el periodo esperado ya venció y no tiene snapshot. En el caso normal, esta pieza no existe en el DOM.
- Forma: `Alert` en `--surface-warn` sobre la lista, con `TriangleAlert` de 16px.
- Copy: `El periodo del 1 al 30 de enero no se cerró.` / `El cálculo automático no corrió ese día. Puedes cerrarlo ahora.` más `Button variant="outline"` con label `Cerrar el periodo`.
- Confirmación con `AlertDialog`: `Se calcula el pago de cada aseadora del periodo del 1 al 30 de enero y queda congelado. Después no se recalcula, aunque corrijas una tarifa.` Confirmar: `Cerrar el periodo`.
- **No es un botón permanente.** Un botón de "cerrar mes" siempre visible invita a cerrar antes de tiempo, y un periodo cerrado no se vuelve a tocar (D7-3).

---

## 10. `app/(cleaner)/mis-pagos` — lo que ve el aseador (D7-4.3)

Pantalla nueva en el árbol del aseador. **Hereda entera la escala tipográfica móvil de `05-UI-SPEC` §3.1 y el piso de toque de 44px**, y `scripts/ci/check-escala-movil.sh` lo impone: dentro de `app/(cleaner)/` se usan solo las clases con sufijo `-movil`.

### 10.1 La frontera, convertida en reglas verificables

> *"El aseador ve lo que le llega y punto."*

| Regla | Cómo se cumple |
|---|---|
| **Ninguna cifra de huésped** en ninguna superficie del aseador | Ni `tarifa_huesped`, ni margen, ni total cobrado, ni promedio. **Ni siquiera derivada** |
| **Ningún pago de otra persona** | La consulta filtra por `auth.uid()` **dentro de la función**, no en el `where` de la pantalla |
| **Ningún periodo en curso** (D7-4.3) | Solo periodos con cierre. §10.4 explica por qué, en su copy |
| **La pantalla no es la frontera** | Es la tercera capa. La primera es el `security definer` con su guarda; la segunda, que las tablas de pago no contienen ninguna columna de huésped |

**Consecuencia para el executor, y es la que se puede verificar leyendo el diff:** ningún componente bajo `app/(cleaner)/` recibe por props un objeto que contenga una cifra de huésped. No se filtra en el render: **no llega**. Un `select` que la traiga y una pantalla que no la pinte siguen siendo una fuga, porque el dato viaja al teléfono.

### 10.2 Cómo se llega y cómo se vuelve

No existe navegación persistente en el árbol del aseador y **esta fase no la inventa**: una barra inferior nueva es un cambio de paradigma que le toca a `/mis-aseos`, `/aseos/[id]` y al wizard de evidencia, y ninguno está en el alcance.

- **Entrada:** al pie de `/mis-aseos`, debajo de la lista, una fila navegable de 56px con icono `Wallet` de 20px, label `Mis pagos` y `ChevronRight`. Fondo `--background`, borde de 1px, `rounded-md`.
- **Regreso:** en `/mis-pagos`, arriba del `<h1>`, un link con `ArrowLeft` de 20px y label `Volver a mis aseos`. En `/mis-pagos/[id]`, `Volver a mis pagos`.

### 10.3 `/mis-pagos` — la lista

```
‹ Volver a mis aseos

Mis pagos

┌────────────────────────────────────┐
│ Del 1 al 30 de enero               │   ← body-movil 16/400, --muted-foreground
│ $ 540.000                          │   ← display-movil 28/600, tabular-nums
│ ✓ Te lo pagaron el 3 de febrero    │   ← micro-movil 14/400, --status-ok
└────────────────────────────────────┘
┌────────────────────────────────────┐
│ Del 1 al 31 de diciembre           │
│ $ 495.000                          │
│ Pendiente de pago                  │   ← --status-warn
└────────────────────────────────────┘
```

- Una `Card` por periodo cerrado, de la más reciente a la más antigua, `gap-lg` entre ellas.
- **Las fechas exactas, siempre, y nunca solo el nombre del mes** (D7-5). Un recibo que dice "enero" y cubre del 1 al 30 sin decirlo es una discusión esperando a ocurrir.
- La tarjeta entera es navegable, `min-h-toque` cumplido de sobra por su alto.
- Al pie de la lista, micro-movil 14/400 `--muted-foreground`: `Solo aparecen los periodos ya cerrados.`

### 10.4 `/mis-pagos/[id]` — el desglose

Mismo contenido que el Sheet de §9.3, en una columna de 480px y con la escala móvil:

- Cabecera: `Del 1 al 30 de enero` a body-movil, total a display-movil 28/600.
- Sección `Tus aseos`: una línea por aseo con apartamento, monto, y **las dos fechas** (`Programado 28 ene · Hecho 2 feb`).
- Sección `Gastos que te devuelven`: concepto, fecha, monto, y la foto del recibo si existe.
- `Total` al pie.
- Estado del pago arriba: `Te lo pagaron el 3 de febrero` o `Pendiente de pago`.

**Prohibido el vocabulario del admin en este árbol:** nada de `snapshot`, `periodo de liquidación`, `cierre`, `rentabilidad`, `margen`, `reembolso`. Se dice `Gastos que te devuelven`, no `Gastos reembolsados`.

---

## 11. Formato de dinero, de fecha y de periodo

Un solo formato en todo el producto. **No se crea ningún helper nuevo de dinero: los que hay ya lo resuelven.**

### 11.1 Dinero

`lib/domain/money.ts`, que ya existe y es el **único** sitio del repo donde se construye un `Intl.NumberFormat` de COP.

| Regla | Valor |
|---|---|
| Función | `formatCOP(n)` |
| Salida | `120000` produce `$ 120.000` |
| Separador de miles | Punto (locale `es-CO`) |
| Decimales | **Cero, siempre.** La base es `bigint` de pesos enteros: un decimal en pantalla es un dato que no existe |
| Símbolo | `$` antepuesto, con el espacio que mete `Intl` |
| Negativo | `-$ 12.000`, con el signo pegado al símbolo, en `--status-warn` (§4.4) |
| Ausencia (`null`) | Em dash, **más un `<span class="sr-only">sin definir</span>`**. El guion solo no dice nada en un lector de pantalla |
| Cero | `$ 0`. **No es ausencia:** un periodo sin gastos es un hecho, no un campo sin llenar |
| Alineación | **Derecha, siempre**, en tablas y en filas de dos extremos |
| Numerales | **`tabular-nums` obligatorio** (§3.2) |

**La trampa que el executor tiene que conocer aunque no sea de UI:** `sum()` sobre `bigint` devuelve `numeric` en Postgres, y `supabase-js` entrega `numeric` como **string**. Un total que llega como `"1200000"` se concatena en vez de sumarse y `formatCOP` no delata nada, porque funciona igual sobre string y sobre number. Todo `returns table` que agregue declara `bigint` y castea con `coalesce(sum(x), 0)::bigint`. Si un total aparece con miles de millones donde debería haber cientos de miles, es esto.

### 11.2 Fechas y etiquetas de periodo

`lib/domain/dates.ts`, que ya existe. Las fechas de negocio viajan como `'YYYY-MM-DD'` y **está prohibido `new Date('2026-09-04')`**: se parsea como UTC y en Bogotá muestra el día anterior.

| Contexto | Formato | Ejemplo |
|---|---|---|
| Celda de tabla (`PROGRAMADO`, `HECHO`) | día y mes corto | `28 ene` |
| Etiqueta del filtro, rango `día` | día de la semana, día y mes | `jueves 13 de septiembre` |
| Etiqueta del filtro, rango `semana` | rango explícito | `del 8 al 14 de septiembre` |
| Etiqueta del filtro, rango `mes` | mes y año | `septiembre de 2026` |
| Fecha de pago | día y mes largos | `3 de febrero` |
| Hora ("Ahora mismo") | 24h | `14:32` |

- **La semana arranca en lunes.**
- Todo pasa por `hoyBog()` y `today_bog()`. **`current_date` está prohibido** en migraciones, seeds, índices, policies y jobs, y `scripts/ci/check-service-role.sh` §4 lo verifica.

### 11.3 Etiqueta de un periodo de pago

**Siempre las dos fechas reales**, nunca solo el nombre del mes (D7-5).

| Superficie | Copy |
|---|---|
| Cabecera de periodo en `/finanzas/pagos` | `Del 1 al 30 de enero de 2026` |
| Sheet de desglose | `Del 1 al 30 de enero de 2026` |
| Tarjeta del aseador | `Del 1 al 30 de enero` (sin el año, salvo que el periodo sea de otro año) |

Cuando el periodo sí coincide con el mes calendario completo, **se sigue escribiendo igual**. Un formato que cambia según el caso obliga a leer con atención justo el día en que no coincide.

---

## 12. Estados vacíos, de carga y de error

### 12.1 Vacíos

Los ocho usan `EstadoVacio` de `app/(admin)/_components/`, que ya existe con su variante `compacto`. **Está explícitamente prohibido escribir un segundo estado vacío**: dos se desincronizan en el primer cambio de copy.

| # | Superficie | Icono | Encabezado | Cuerpo | Acción | Variante |
|---|---|---|---|---|---|---|
| 1 | **Periodo sin aseos** (bloque 2, y toda la pantalla de Resumen) | `CalendarX` | `No hubo aseos en este periodo.` | `Prueba con un rango más amplio, o revisa otro mes.` | ninguna | normal |
| 2 | **Equipo sin costo en el periodo** (bloque 3) | `Users` | `Nadie tiene aseos en este periodo.` | `Cuando se haga el primer aseo, acá aparece cuánto cuesta cada persona.` | ninguna | compacto |
| 3 | **Buscador sin resultados** (bloque 3) | `Search` | `Ninguna aseadora coincide con «ana».` | `Revisa la escritura.` | `Limpiar búsqueda` | compacto |
| 4 | **Lista de aseos filtrada sin resultados** (`/finanzas/aseos`) | `ListFilter` | `Ningún aseo coincide con estos filtros.` | `Quita algún filtro, o amplía el periodo.` | `Quitar filtros` | normal |
| 5 | **Equipo sin pagos** (`/finanzas/pagos`) | `Wallet` | `Todavía no se ha cerrado ningún periodo.` | `El primer cierre ocurre el último día hábil del mes. Ahí aparece cuánto se le debe a cada persona.` | ninguna | normal |
| 6 | **Aseadora sin gastos** (ficha, bloque 4) | `Receipt` | `No reportó gastos en este periodo.` | `Acá aparecen las compras que hizo y que se le devuelven.` | ninguna | compacto |
| 7 | **Aseadora sin aseos** (ficha, bloque 2) | `CalendarX` | `No hizo aseos en este periodo.` | `Cambia el periodo arriba para ver otro rango.` | ninguna | compacto |
| 8 | **Aseador sin pagos cerrados** (`/mis-pagos`) | `Wallet` | `Todavía no tienes pagos cerrados.` | `Cuando termine el mes vas a ver acá cuánto se te paga y de qué se compone.` | ninguna | normal (móvil) |

**Más dos que no son `EstadoVacio` porque viven dentro de otra cosa:**

| Superficie | Copy |
|---|---|
| Recibo borrado por antigüedad | Icono `ImageOff` de 32px en `--muted-foreground`, más `Este recibo ya no está disponible.` / `El gasto y su monto siguen registrados.` |
| Recibo que falló al cargar (firma vencida) | Icono `ImageOff` más `No se pudo mostrar el recibo.` / `Vuelve a abrir el recibo.` |

**Los tres que el dueño dejó pendientes son el 1, el 5 y el 6**, y los tres siguen la misma regla que el resto del producto: **decir qué pasó y qué hacer**. El 5 es el más importante porque explica el mecanismo (cuándo ocurre el cierre) en vez de dejar una pantalla en blanco esperando algo que el admin no sabe que va a llegar solo.

### 12.2 Carga

Tres casos distintos y **tres respuestas distintas**.

#### a) Navegación a una ruta nueva

`loading.tsx` por ruta, con **esqueleto de geometría real**, que es lo que la Fase 2 y la Fase 4 ya establecieron: la única diferencia al llegar los datos es que el gris se convierte en texto.

- `/finanzas`: cuatro cards de 104px con sus anchos reales, más dos bloques con cabecera y filas de 48 y 56px.
- `/finanzas/aseos` y `/finanzas/pagos`: la fila de encabezado de 32px con los anchos de columna exactos de §7.1 y §9.1, más 10 filas de 40px.
- **Prohibido el spinner centrado a pantalla completa.** En un layout de cuatro cards ocupa un punto, y al resolverse el contenido salta.

#### b) Recalcular al cambiar el filtro de periodo

Es el caso que el dueño dejó pendiente, y **no se resuelve con esqueleto**. Cambiar de `mes` a `semana` no es ir a otra pantalla: es la misma pantalla con otros números. Sustituir las cifras por bloques grises pierde justamente lo que el admin está haciendo, que es comparar.

**Contrato:**

1. El control de periodo (§6.2) es un Client Component que envuelve el contenido: recibe los tres bloques ya renderizados por el servidor como `children`.
2. Al cambiar de rango o de ancla, navega con `useTransition` y `router.push(href, { scroll: false })`.
3. Mientras `isPending`, el contenedor de los bloques recibe `aria-busy="true"`, `opacity-60` y `pointer-events-none`, con la utilidad `transicion` (120ms, y `opacity` es una de las cuatro propiedades que el contrato de movimiento permite).
4. **Las cifras viejas siguen visibles y legibles** mientras llegan las nuevas. Atenuadas, no borradas.
5. El control **no** se atenúa: sigue respondiendo, y el rango que se acaba de tocar ya se ve activo.
6. Con `prefers-reduced-motion: reduce` la opacidad cambia sin transición. El estado sigue siendo visible.

**Prohibido deshabilitar los tres botones del segmentado mientras carga.** Es un estado muerto invisible: el admin toca `Semana`, no pasa nada, y vuelve a tocar.

#### c) Mutaciones

`Marcar pagado` y `Cerrar el periodo`: `useActionState` más `useFormStatus`. El botón cambia el icono por `Loader2` girando y el label a gerundio, y **conserva su ancho** con `min-w-boton-marcar`. El spinner sigue girando con `prefers-reduced-motion: reduce`: es información de estado, y es la única excepción declarada del contrato de movimiento desde la Fase 2.

### 12.3 Errores

Enrutamiento, sin excepciones, heredado de `02-UI-SPEC` §9.4:

| Situación | Dónde | Copy |
|---|---|---|
| Falla `Marcar pagado` | Toast destructivo, la fila no cambia | El mensaje de `mapDbError()` |
| Ya estaba marcado (dos pestañas) | Toast destructivo | `Ese pago ya estaba marcado. Recarga la página.` |
| Falla `Cerrar el periodo` | `Alert` destructivo en el sitio del banner de §9.5, no toast | `No se pudo cerrar el periodo.` / `Vuelve a intentar. Si sigue fallando, el cálculo automático puede reintentarlo mañana.` |
| Sin permiso (`42501` / `PGRST301`) | Toast destructivo | `No tienes permiso para esta operación.` |
| Falla la carga del recibo | Dentro del diálogo | §12.1 |

**Todo error de base pasa por `mapDbError()` de `lib/domain/errors.ts`. Nunca se renderiza un string crudo de Postgres.**

**Regla heredada y vigente:** un error dice **qué pasó** y **qué hacer**. Sin `¡Ups!`, sin `Algo salió mal`, sin disculpas, sin signos de admiración.

---

## 13. Accesibilidad

Hereda `02-UI-SPEC` §13, `04-UI-SPEC` §16, `05-UI-SPEC` §16 y `06-UI-SPEC` §12. Lo que esta fase añade:

### 13.1 Cifras y tablas

- Cada tabla lleva `<caption class="sr-only">` que la nombra y dice el periodo: `Aseos del periodo del 1 al 30 de septiembre de 2026`.
- Los encabezados son `<th scope="col">` de verdad. La fila de totales va en `<tfoot>` con `<th scope="row">` en la primera celda.
- **Ningún monto se anuncia solo como glifo.** El em dash de ausencia lleva siempre su `sr-only` con `sin definir`.
- La barra de proporción es `aria-hidden="true"` (§6.5.2). El número contiguo ya la dice.

### 13.2 El filtro y el sub-nav

- El segmentado de rango son `<button>` con `aria-pressed`, dentro de un contenedor con `role="group"` y `aria-label="Rango del periodo"`.
- El cambio de periodo anuncia el resultado con una región `aria-live="polite"`: `Mostrando septiembre de 2026.` Sin eso, el usuario de lector de pantalla toca `Semana` y no se entera de que algo cambió, porque la página no navegó de verdad.
- El sub-nav es `<nav aria-label="Secciones de finanzas">` con `aria-current="page"` en el activo.
- Los dos chevrons de navegación llevan `aria-label` (`Periodo anterior`, `Periodo siguiente`), nunca `aria-hidden`, porque van solos.

### 13.3 Panel y diálogo

- El `Sheet` y los dos `Dialog` atrapan el foco, lo devuelven al disparador al cerrarse y responden a `Escape`. Es comportamiento de las primitivas: **no se desactiva ninguno**.
- La imagen del recibo tiene `alt` descriptivo, nunca vacío.

### 13.4 Contraste y color

- **La prueba de escala de grises aplica a toda la fase:** ninguna información depende solo del color. `Pagado` lleva icono `CircleCheck` además del verde; `Pendiente` lleva la palabra; el margen negativo lleva el signo menos.
- Tamaño de icono estándar en `(admin)`: **14px en celdas de tabla, 16px en controles y cabeceras**, `strokeWidth` 2. En `(cleaner)`: 20px.
- Los iconos que acompañan texto llevan `aria-hidden="true"`. Los que van solos llevan `aria-label`.

### 13.5 Movimiento

Sin cambios: solo `color`, `background-color`, `border-color` y `opacity`, 120ms, `ease-out`, vía la utilidad `transicion`. **Sin animaciones de layout y sin `transition: all`.** El colapso de un periodo en `/finanzas/pagos` no se anima: cambia la altura, que es layout.

---

## 14. Inventario de componentes

### 14.1 shadcn oficial

**Se instalan cero.** Las que esta fase usa ya están en `components/ui/`: `table` · `card` · `button` · `badge` · `separator` · `sheet` · `dialog` · `alert-dialog` · `select` · `popover` · `command` · `input` · `label` · `skeleton` · `sonner` · `tooltip` · `dropdown-menu`.

Sigue prohibido crear un átomo que solo re-exporte un componente de shadcn.

### 14.2 Organismos nuevos

`app/(admin)/finanzas/_components/`:

| Componente | Responsabilidad | REQ |
|---|---|---|
| `FiltroPeriodo` | El segmentado, los chevrons, `Hoy`, y el envoltorio con `useTransition` que atenúa a sus `children` (§12.2b) | — |
| `SubNavFinanzas` | Resumen / Pagos | D7-1 |
| `TarjetaKPI` | Una card de 104px: etiqueta, valor, caption opcional | FIN-02 |
| `BloqueAseosDelPeriodo` | Las tres filas navegables más la línea de promedio | FIN-02 |
| `BloqueCostoPorAseadora` | Cabecera, buscador condicional, filas con barra de proporción | — |
| `FilaAseadora` | Círculo, nombre, monto, barra, segunda línea | — |
| `TablaAseosFinanciera` | La tabla de §7.1 con su `tfoot` de totales | FIN-02 |
| `FiltrosDeAseos` | Combobox de apartamento, select de aseador, segmentado de tipo | FIN-02 |
| `FichaAseadora` | La cabecera y los cuatro bloques | — |
| `BloqueAhoraMismo` | Qué aseo tiene en curso, o ninguno | — |
| `TablaPagosDelPeriodo` | La tabla de §9.1 | FIN-03, FIN-04 |
| `BloquePeriodoCerrado` | La cabecera colapsable de cada periodo | FIN-03 |
| `BotonMarcarPagado` | Botón, `AlertDialog`, `useActionState`, `router.refresh()` | D7-4.2 |
| `SheetDesglosePago` | El desglose de §9.3 | D7-2 |
| `DialogoRecibo` | La foto y sus dos estados de ausencia | D7-2 |
| `AvisoPeriodoSinCerrar` | El `Alert` condicional de §9.5 | FIN-03 |

`app/(cleaner)/mis-pagos/_components/`:

| Componente | Responsabilidad |
|---|---|
| `ListaDePagos` | Las tarjetas de periodo cerrado, con su vacío |
| `TarjetaDePago` | Una tarjeta: fechas, total, estado |
| `DesgloseDeMiPago` | Las dos secciones y el total |

`app/(admin)/_components/`:

| Componente | Responsabilidad |
|---|---|
| `CirculoIniciales` | El círculo de 28px con las iniciales. §14.3 |

### 14.3 Componentes que se modifican

| Archivo | Cambio |
|---|---|
| `app/(admin)/_components/TopNav.tsx` | **Un link más** en `ENLACES`: `{ href: '/finanzas', etiqueta: 'Finanzas' }`, al final. Y consume `CirculoIniciales` en vez de pintar el círculo inline |
| `app/(admin)/_components/CirculoIniciales.tsx` | **Nuevo.** Recibe el `iniciales()` que hoy vive exportado en `TopNav.tsx`. Se extrae porque el bloque 3, la ficha y la tabla de pagos lo necesitan, y tres copias del mismo círculo se desincronizan. **`iniciales()` se mueve a `lib/domain/personas.ts`** para que quede testeable sin arrastrar un Client Component |
| `app/(cleaner)/mis-aseos/page.tsx` | La fila de entrada a `Mis pagos` al pie de la lista (§10.2) |
| `app/globals.css` | Los ocho tokens de §2.1 |
| `lib/utils.ts` (`cn()`) | **Nada que registrar en esta fase**, porque `--container-boton-marcar` se usa como `min-w`. Si aparece un `max-w-*` nuevo durante la ejecución, el registro **no es opcional** (§2.4) |

> **Verificación previa antes de tocar `TopNav`:** `iniciales()` se exporta de ese archivo y hoy **no tiene ningún otro consumidor en el repo** (verificado con grep el 2026-09-13). Moverla es seguro.

### 14.4 Lógica de dominio, fuera de los componentes y con tests

| Módulo | Contenido |
|---|---|
| `lib/domain/periodo.ts` | `rangoDePeriodo(rango, ancla)` y `etiquetaDePeriodo(...)`, con la semana arrancando en lunes. **Es presentación, no decide nada de negocio:** quién cierra el mes lo decide Postgres (`07-RESEARCH.md` §Pattern 5) |
| `lib/domain/finanzas.ts` | Tipos del desglose y agregación de presentación: proporción de cada persona sobre el total, margen promedio, conteos |
| `lib/domain/personas.ts` | `iniciales()`, movida desde `TopNav` |

### 14.5 Iconos lucide — lista cerrada

**Nuevos en esta fase (3), verificados uno por uno contra `lucide-react@1.39.0` instalado el 2026-09-13:**

`Wallet` · `Receipt` · `ChevronLeft`

**Reusados de las listas cerradas de fases anteriores:**

`ArrowLeft` · `ChevronRight` · `ChevronDown` · `Search` · `ListFilter` · `Users` · `CalendarX` · `CircleCheck` · `TriangleAlert` · `ImageOff` · `Hammer` · `Play` · `Clock` · `UserRoundX` · `Loader2` · `X`

Añadir un icono fuera de estas listas es una modificación de este contrato.

### 14.6 Dos trampas del repo que el executor tiene que tener delante

1. **`revalidatePath` cuelga el navegador en las Server Actions de `(admin)`.** Causa raíz no identificada, disparador de tamaño del árbol de cliente. Ninguna action de esta fase lo llama; el refresco es `router.refresh()`. Solo se ve con el build de producción y Playwright.
2. **El guardarraíl de CI trabaja por expresión regular sobre el código, no sobre el AST.** Un comentario que **mencione literalmente** un nombre prohibido hace fallar la revisión aunque el código esté bien. Ya mordió cuatro veces en este repo. **Al comentar por qué algo no se usa, se describe el patrón, no se escribe el token.**

---

## 15. Contrato de copywriting

Español de Colombia, trato de "tú". **Prohibido el voseo.** **Prohibida la raya larga en el copy en español**: se usa coma, paréntesis o punto seguido. Sin signos de admiración, sin `¡Ups!`, sin `Algo salió mal`, sin disculpas.

> **La raya larga sí aparece, y en un solo sitio:** como **glifo de valor ausente** en las celdas de dinero y de conteo (§11.1). Es un carácter de dato, no puntuación, y va siempre acompañado de su `sr-only`.

### 15.1 Vocabulario fijo

| Concepto | Se dice | Nunca se dice |
|---|---|---|
| La sección | `Finanzas` | `Financiero`, `Reportes`, `Dashboard` |
| Lo que se le cobra al huésped | `Cobrado` | `Ingreso`, `Revenue`, `Facturado`, `Venta` |
| Lo que se le paga a la persona | `Pagado a aseadores` | `Nómina`, `Costo laboral` |
| Lo que compró y se le devuelve | `Gastos reembolsados` (admin) · `Gastos que te devuelven` (aseador) | `Viáticos`, `Caja menor` |
| El resultado | `Ganancia` | `Utilidad`, `Profit`, `EBITDA`, `Neto` |
| Cobrado menos pagado, por aseo | `Margen` | `Rentabilidad`, `Spread` |
| El periodo que ya se calculó | `periodo cerrado` | `snapshot`, `liquidación`, `corte`, `nómina` |
| El acto de calcularlo | `cerrar el periodo` | `liquidar`, `procesar`, `generar nómina` |
| La persona | `aseadora` / `aseador` | `empleada`, `colaboradora`, `recurso`, `staff` |

**Sobre `aseadora` frente a `aseadores`:** este contrato usa **`aseadores`** en las etiquetas de estructura (el KPI `PAGADO A ASEADORES`, la columna `ASEADOR`), para no divergir de la pestaña `Aseadores` que existe desde la Fase 2 y de toda la copia ya entregada. Usa **`aseadora`** donde el dueño nombró el bloque (`Cuánto cuesta cada aseadora`, `Buscar aseadora`), porque el equipo real son mujeres. Es una inconsistencia consciente y de una sola palabra: **unificarla es una decisión de vocabulario de todo el producto**, no de esta fase. Queda en §17.

### 15.2 Elementos

| Elemento | Copy |
|---|---|
| Link de `TopNav` | `Finanzas` |
| Título de la sección | `Finanzas` |
| Sub-pestañas | `Resumen` · `Pagos` |
| Rangos del filtro | `Día` · `Semana` · `Mes` |
| Volver al periodo actual | `Hoy` |
| `aria-label` de los chevrons | `Periodo anterior` · `Periodo siguiente` |
| Anuncio al cambiar de periodo | `Mostrando septiembre de 2026.` |
| KPI 1 | `COBRADO` |
| KPI 2 | `PAGADO A ASEADORES` |
| KPI 3 | `GASTOS REEMBOLSADOS` |
| KPI 4 | `GANANCIA`, con caption `Cobrado menos pagos y gastos` |
| Título del bloque 2 | `Aseos del periodo` |
| Filas del bloque 2 | `Aseos hechos` · `Con gastos` · `Con daños` |
| Apoyo de la fila 1 | `{$X} de margen` |
| Apoyo de la fila 2 | `{$Y} reembolsados` |
| Apoyo de la fila 3 | `Los daños no se descuentan del pago.` |
| Línea de cierre del bloque 2 | `Margen promedio por aseo` |
| Título del bloque 3 | `Cuánto cuesta cada aseadora` |
| Buscador del bloque 3 | `Buscar aseadora` |
| Segunda línea de la fila de aseadora | `{N} aseos` · `{N} aseos · {$G} en gastos` |
| Volver desde una hija del Resumen | `Volver al resumen` |
| Título de `/finanzas/aseos` | `Aseos del periodo` |
| Columnas de `/finanzas/aseos` | `APARTAMENTO` · `PROGRAMADO` · `HECHO` · `A CARGO` · `COBRADO` · `PAGADO` · `MARGEN` |
| Filtros de `/finanzas/aseos` | `Todos` · `Con gastos` · `Con daños` · `Quitar filtros` |
| Placeholder del combobox | `Todos los apartamentos` |
| Placeholder del select | `Todos los aseadores` |
| Total al pie | `{N} aseos` |
| Cabecera de la ficha | `lo que cuesta en el periodo` |
| Bloques de la ficha | `Ahora mismo` · `Sus aseos del periodo` · `Sus pagos mes a mes` · `Sus gastos reportados` |
| Caption del bloque de pagos | `Todos sus periodos cerrados` |
| Ahora mismo, en curso | `Está en {apartamento} desde las {HH:mm}.` |
| Ahora mismo, libre | `No tiene ningún aseo en curso.` |
| Ahora mismo, desactivada | `Esta cuenta está desactivada.` |
| Fechado del bloque | `Al momento de abrir esta página.` |
| Abrir el recibo | `Ver recibo` |
| Sin recibo | `Sin recibo disponible` |
| Cabecera de periodo en Pagos | `Del 1 al 30 de enero de 2026` |
| Resumen de la cabecera | `{N} personas · {$T} · faltan {M} por pagar` · `Todos pagados` |
| Columnas de Pagos | `ASEADOR` · `ASEOS` · `POR ASEOS` · `GASTOS` · `TOTAL` · `PAGADO` |
| Estado pagado | `Pagado el {3 feb}` |
| Estado pendiente | `Pendiente` |
| **CTA de Pagos** | `Marcar pagado` |
| En vuelo | `Marcando…` |
| Secciones del desglose | `POR ASEOS` · `GASTOS REEMBOLSADOS` · `TOTAL` |
| Las dos fechas del desglose | `Programado {28 ene} · Hecho {2 feb}` |
| Éxito al marcar | `Registrado. {Nombre}, {$monto}.` |
| Aviso de periodo sin cerrar | `El periodo del 1 al 30 de enero no se cerró.` / `El cálculo automático no corrió ese día. Puedes cerrarlo ahora.` |
| CTA del aviso | `Cerrar el periodo` |
| Entrada del aseador | `Mis pagos` |
| Título en el teléfono | `Mis pagos` |
| Nota al pie de la lista | `Solo aparecen los periodos ya cerrados.` |
| Estado en el teléfono, pagado | `Te lo pagaron el {3 de febrero}` |
| Estado en el teléfono, pendiente | `Pendiente de pago` |
| Secciones en el teléfono | `Tus aseos` · `Gastos que te devuelven` · `Total` |
| Volver, en el teléfono | `Volver a mis aseos` · `Volver a mis pagos` |

### 15.3 Acciones irreversibles (esta fase no tiene ninguna destructiva)

**Cero acciones destructivas.** Nada se borra, nada se revoca, nada se cancela. Por lo tanto: **ningún botón `variant="destructive"` en toda la fase.** Si aparece uno en ejecución, algo se salió del contrato.

Dos acciones sí son **irreversibles desde la interfaz**, y por eso llevan `AlertDialog` sin tratamiento rojo:

| Acción | Confirmación |
|---|---|
| `Marcar pagado` | Título: `¿Ya le pagaste a {Nombre}?` · Cuerpo: `Se registra que le pagaste {$monto} del periodo del {fechas}, con la fecha de hoy y tu nombre. Esto no se puede deshacer desde acá.` · Confirmar: `Sí, ya le pagué` · Cancelar: `Cancelar` |
| `Cerrar el periodo` | Título: `¿Cerrar el periodo del {fechas}?` · Cuerpo: `Se calcula el pago de cada aseadora del periodo y queda congelado. Después no se recalcula, aunque corrijas una tarifa.` · Confirmar: `Cerrar el periodo` · Cancelar: `Cancelar` |

En los dos, `Cancelar` va en `variant="outline"` y solo el de confirmar va relleno. Es la mitigación permanente del choque coral contra destructivo de `02-UI-SPEC` §4.6, y aplica aunque aquí el de confirmar no sea destructivo.

---

## 16. Registry Safety

| Registry | Bloques usados | Safety Gate |
|---|---|---|
| shadcn oficial (`@shadcn`) | **ninguno nuevo.** Las 17 primitivas que esta fase consume ya están en `components/ui/` desde fases anteriores | no aplica: no se ejecuta el CLI en esta fase |
| Terceros | **ninguno** | no aplica. `components.json` tiene `"registries": {}`, verificado el 2026-09-13 |

**No se declara ningún registry de terceros, así que la compuerta de vetting no se ejecuta.**

Y como esta fase **no corre `npx shadcn add`**, tampoco se dispara la compuerta de ancho por primitiva nueva: ninguna clase base con nombre de talla entra al repo por esa vía. La regla de §2.4 sigue aplicando al token de `--container-*` que esta fase sí declara.

---

## 17. Deuda declarada de este contrato

1. **El histórico mes contra mes no existe.** La DEFINICION §6 lo deja explícitamente sin definir, así que esta fase no tiene ninguna serie temporal, ninguna comparación con el periodo anterior y ninguna flecha de tendencia. Es la ausencia más visible de un tablero financiero y es deliberada: una flecha sin serie es decoración que miente.
2. **`Ahora mismo` no se refresca solo.** `/operacion` tiene Realtime; esta ficha no. El dato es de cuando se cargó la página y la interfaz lo dice (§8.4). Si el admin lo usa como panel de control del equipo, va a mirar datos viejos.
3. **El umbral del buscador (más de 8 filas) es una interpretación, no una orden.** El dueño pidió buscador; yo decidí cuándo aparece (§6.5.5). Si lo quiere siempre visible, es cambiar una constante.
4. **`aseadora` frente a `aseadores` queda inconsistente en una palabra** (§15.1). Unificarlo toca la pestaña `Aseadores` y toda la copia entregada desde la Fase 2: es una decisión de producto, no de esta fase.
5. **La barra de proporción se ve vacía con el equipo repartido parejo** (§6.5.1). Es la consecuencia aceptada de escalar contra el total y no contra el máximo. Si al dueño le molesta visualmente, la alternativa correcta **no** es cambiar el denominador: es quitar la barra y dejar solo el número.
6. **Sin exportar ni imprimir** (`FIN-V2-01`, confirmado fuera el 2026-09-12). El admin va a copiar las cifras a mano para hacer las transferencias, que es exactamente donde se cometen los errores de dígito. Es la deuda más cara en operación real.
7. **Sin modo oscuro**, heredado desde la Fase 2.
8. **El coral sigue siendo placeholder** y `--primary` con `--destructive` siguen siendo los dos rojos, con su mitigación permanente. Heredado de `02-UI-SPEC` §17.
9. **`/finanzas/pagos` no paginará bien a los dos años.** Veinticuatro periodos de ocho filas cada uno, todos en el DOM aunque colapsados. No es un problema hoy y no se resuelve hoy; el detonante es pasar de 18 periodos cerrados.
10. **RET-03 y RET-07 salieron del alcance por la DEFINICION** (§0.1), pero siguen escritos como criterios de la Fase 7 en el ROADMAP, en `REQUIREMENTS.md` y en el mapa de verificación de `07-VALIDATION.md`. **Alguien tiene que reconciliar esos tres documentos antes de planificar**, o la fase arranca con Wave 0 cubriendo dos requisitos que nadie va a construir.

---

## Checker Sign-Off

- [ ] Dimensión 1 Copywriting: PASS
- [ ] Dimensión 2 Visuals: PASS
- [ ] Dimensión 3 Color: PASS
- [ ] Dimensión 4 Typography: PASS
- [ ] Dimensión 5 Spacing: PASS
- [ ] Dimensión 6 Registry Safety: PASS

**Aprobación:** pending
