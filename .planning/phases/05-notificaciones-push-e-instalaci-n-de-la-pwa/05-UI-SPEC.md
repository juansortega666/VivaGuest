---
phase: 5
slug: notificaciones-push-e-instalaci-n-de-la-pwa
status: draft
shadcn_initialized: true
preset: none (`components.json` ya existe, `style: base-nova`, `registries: {}`)
created: 2026-09-10
---

# Fase 5 — Contrato de diseño de UI

> Contrato visual y de interacción. Lo produce `gsd-ui-researcher`, lo verifica `gsd-ui-checker`, lo consumen `gsd-planner` y `gsd-executor`.
> Idioma de la interfaz: **español de Colombia, trato de "tú"**. Código, tokens, rutas, slugs de base y REQ-IDs quedan como están.

**REQ-IDs cubiertos:** PWA-02, PWA-03, NOTIF-01, NOTIF-02 (superficie), NOTIF-03 (superficie de error), NOTIF-04 (consecuencia visible). Más los criterios 6 y 7 del ROADMAP, que salieron de `05-CONTEXT.md` D-03 y D-08.

**Este documento hereda `02-UI-SPEC.md` y `04-UI-SPEC.md` completos.** Espaciado, paleta, movimiento, accesibilidad, vocabulario y contrato de copy siguen vigentes tal cual. Aquí solo se escribe lo que **cambia** o lo que **se añade**. Las supersesiones explícitas están marcadas con **SUPERSEDE**, son dos, y son las únicas.

**Entradas leídas para escribir esto:** `05-CONTEXT.md` (D-01…D-08), `.continue-here.md` (§"Puntos ciegos del research, cerrados" y §"Critical Anti-Patterns"), `.planning/ROADMAP.md` §Phase 5 (**siete** criterios), `REQUIREMENTS.md`, `02-UI-SPEC.md`, `04-UI-SPEC.md`, `app/globals.css`, `lib/utils.ts`, `components.json`, `app/(cleaner)/`, `supabase/migrations/06`, `09` y `15`.

---

## 0. Lo que esta fase renderiza de verdad

| Hecho anclado en el repo o en fuente primaria | Consecuencia de diseño |
|---|---|
| **Es la primera superficie del aseador de verdad.** Todo lo construido hasta hoy es `(admin)`, escritorio, densidad de mouse. `app/(cleaner)/` existe como stub de una página plana. | El árbol `(cleaner)` estrena escala tipográfica propia (§3), objetivo de toque de 44px como piso y 56px para las acciones del asistente (§2). Nada de `(admin)` se reusa tal cual. |
| **En iOS negar el permiso es irreversible sin desinstalar** (`05-RESEARCH.md`, confianza ALTA en la conclusión operativa). Son 8 aseadores, canal único, sin respaldo. | El banner de PWA-03 **es** la pantalla de priming: lleva el porqué y una salida `Ahora no` que no toca el navegador. `Notification.requestPermission()` solo se llama desde el `onClick` de un botón, nunca en montaje ni en `useEffect`. §7. |
| **D-02: la instalación no termina cuando la app aparece en la pantalla de inicio; termina cuando llegó una notificación de prueba a ese teléfono.** | El asistente tiene un **paso 4 de verificación con estado confirmado / no llegó**, y el paso 4 es el que decide si la instalación cuenta. No se suaviza a "otorgar el permiso". §8. |
| **En iOS no existe `beforeinstallprompt` y en el navegador embebido de WhatsApp no hay "Añadir a inicio" utilizable.** | Las instrucciones se enseñan con **capturas reales recortadas**, no con iconos genéricos, y el estado "estás dentro de otra app" tiene copy propio. §8.3, §8.5. |
| **D-06: el código de acceso NO viaja en el payload de push.** Solo sale por `reveal_access_code()`, con rastro en `access_code_reads` y ventana hoy..mañana. | La push aterriza en `/aseos/[id]`, y esa pantalla existe en esta fase, de solo lectura, con el código detrás de un botón. §9. **Ningún píxel de esta fase renderiza el código dentro de una notificación.** |
| **`notifications.title` y `body` ya vienen redactados en español desde las migraciones 09/13/15**, y D-04 prohíbe tocar los 6+ RPC que los escriben. | El push **renderiza `title` y `body` verbatim**, exactamente igual que el panel de alertas de la Fase 4. Esta fase no reescribe ese copy. §10.1. Los dos defectos encontrados en ese copy quedan como deuda declarada, no como tarea. §20.3. |
| **D-05: `Topic` y `tag` colapsan por destinatario + aseo + clase de evento.** Un aviso colapsado **borra** al anterior en la bandeja del teléfono. | Toda notificación tiene que leerse **sola**. Prohibido cualquier copy que solo tenga sentido como continuación. §10.2. |
| **`FranjaCarga` ya lista a todos los aseadores activos, ceros incluidos** (`04-UI-SPEC` §8.2). | D-03 no necesita panel nuevo ni tipo de alerta nuevo: la marca de "sin avisos" entra **dentro del chip que ya existe**, donde el admin decide quién hace qué. §11.2. |
| **`04-UI-SPEC` §11.1 cerró en SIETE los tipos de alerta**, y el criterio 4 de la Fase 4 prohíbe jerarquía visual entre ellos. | **No se añade un octavo tipo.** "Aseador sin avisos" es un estado persistente, no un evento fechado: en un panel cronológico se quedaría arriba para siempre. §11.5 explica el descarte. |
| **`04-UI-SPEC` §11.3: la fila de alerta ancla a `#aseo-{id}` dentro de su día, expandiéndolo.** Hoy `leerOperacion()` filtra `.gte('scheduled_date', hoy)` (`lib/data/operacion.ts:243`). | Si D-08 mete alertas de aseos anteriores a hoy sin que esos aseos se rendericen en el carril ancho, **el clic de esas alertas no tiene dónde aterrizar**. Por eso el bloque `Atrasados` no es opcional. §12. |
| **`max-w-<talla>` compila a 4–16 px en este repo** (Tailwind v4.3 resuelve contra `--spacing-*` antes que contra `--container-*`). Costó dos quicks. | Los dos anchos nuevos de esta fase llevan **nombre propio** (`--container-captura`, `--container-codigo`) y **se registran en el grupo `max-w` de `cn()`**. §2.3. `npm run ci:arch` lo atrapa si alguien lo olvida. |
| **`web-push` y `@serwist/next` no están instalados y no existe `public/`.** No hay manifest, ni iconos, ni service worker. | El juego de iconos es un **entregable de diseño con prerequisito humano**, con fallback definido para no bloquear la fase. §14.2. |

---

## 1. Design System

Sin cambios de herramienta. `components.json` ya existe.

| Propiedad | Valor |
|---|---|
| Tool | `shadcn` CLI. `components.json`: `style: base-nova`, `iconLibrary: lucide`, `registries: {}` |
| Component library | **Base UI** (`@base-ui/react`) |
| Icon library | `lucide-react` **1.39.0** (pin de `package.json`, verificado el 2026-09-10) |
| Font | Geist Sans / Geist Mono (`--font-sans`, `--font-mono`) + Poppins (`--font-brand`) |
| Estilos | Tailwind v4.3.3, `@theme` en `app/globals.css`. **No existe `tailwind.config.js` y no se crea** |
| Tema | Solo claro, también en `(cleaner)` |
| Toasts | `sonner` 2.0.8 |

### 1.1 Esta fase NO instala ninguna primitiva de shadcn

Se revisó superficie por superficie y las 24 primitivas ya instaladas alcanzan:

| Superficie | Primitivas |
|---|---|
| Banner de avisos (§7) | `alert`, `button` |
| Asistente de instalación (§8) | `button`, `progress`, `separator` |
| Prueba de aviso (§8.6) | `button`, `alert` |
| Pantalla de aterrizaje y código (§9) | `button`, `card`, `alert`, `separator` |
| Columna `AVISOS` de `/aseadores` (§11.1) | `table`, `tooltip` |
| Advertencia inline en `Sheet` y `Dialog` (§11.3) | ninguna nueva |
| Franja del admin (§13) | `alert`, `button` |
| Confirmaciones | `sonner` |

**Consecuencia para §19:** la compuerta de vetting de registries no se ejecuta porque no hay nada que vetar.

Y una nota para el executor: **si aun así decides instalar una primitiva nueva**, sigue viva la regla de `.continue-here.md`: toda primitiva del CLI nace con `max-w-xs` / `sm:max-w-sm` en su clase base, que en este repo compilan a 4 y 8 px. `npm run ci:arch` (`scripts/ci/check-max-w-tallas.sh`) falla nombrando archivo y línea. El arreglo es un token `--container-<nombre-propio>` registrado también en `cn()`.

### 1.2 Alternativas de UI descartadas, con la razón

| Descartado | Razón |
|---|---|
| `tabs` o `accordion` para las instrucciones por plataforma | La plataforma se **detecta**; solo se renderiza un juego. El cambio manual son dos `Button variant="ghost"` (`iPhone` / `Android`). Instalar una primitiva para dos opciones excluyentes es coste sin beneficio. |
| Un icono de lucide que imite el glifo de Compartir de iOS o el menú ⋮ de Chrome | Un glifo de sistema aproximado enseña mal. La ilustración de cada paso es una **captura real recortada** (§8.4). Efecto secundario deseable: la lista cerrada de iconos nuevos baja a siete nombres, todos de bajo riesgo. |
| `dialog` de priming antes de pedir el permiso | El banner **ya es** el priming: lleva el porqué y la salida `Ahora no`. Meter un diálogo en medio añade un paso y arriesga el gesto de usuario que Apple exige (*"call the push subscription method immediately from the gesture's event handler code"*). |
| Un octavo tipo de alerta `aseador_sin_avisos` en el panel de la Fase 4 | Ver §11.5. |
| Barra de navegación inferior en `(cleaner)` | Fase 6. Esta fase entrega dos rutas del aseador y ninguna necesita navegación persistente. |

---

## 2. Escala de espaciado

La escala de `02-UI-SPEC` §2 (`xs` 4 · `sm` 8 · `md` 12 · `lg` 16 · `xl` 24 · `2xl` 32 · `3xl` 48) sigue igual y sigue prohibido el valor arbitrario (`p-[13px]`, `gap-[7px]`).

### 2.1 Tokens nuevos

```css
@theme {
  /* ── app/(cleaner)/ ──────────────────────────────────────────────────────
     `--spacing-toque` (44px, Apple HIG) ya existe y sigue siendo el PISO de
     todo control del arbol del aseador. Este token es el de las acciones que
     deciden la fase, que se tocan con guantes o con las manos mojadas. */
  --spacing-toque-comodo: 56px;  /* accion primaria del banner y del asistente */
  --spacing-paso:         32px;  /* circulo con el numero de paso del asistente */

  /* ── columna nueva de /aseadores (§11.1) ─────────────────────────────── */
  --spacing-col-avisos:  128px;  /* icono 14px + "Sin avisos", la etiqueta mas larga */

  /* ── anchos: NOMBRE PROPIO, NUNCA NOMBRE DE TALLA ────────────────────────
     Regla escrita en app/globals.css e impuesta por scripts/ci/check-max-w-tallas.sh:
     ningun token de --container-* puede llamarse con un nombre de talla mientras
     exista un --spacing-* homonimo. `captura` y `codigo` no colisionan con ningun
     nombre de la escala de espaciado; se verifico uno por uno el 2026-09-10. */
  --container-captura: 280px;  /* captura recortada de las instrucciones (§8.4) */
  --container-codigo:  240px;  /* caja del codigo de acceso (§9.3) */

  /* ── tracking del codigo de acceso (§9.3) ─────────────────────────────── */
  --tracking-codigo: 0.12em;
}
```

`--spacing-toque` (44px), `--spacing-fila` (40px), `--spacing-barra` (56px), `--container-aseador` (480px), `--container-sheet` (480px), `--container-dialogo` (480px) y `--container-rail` (360px) **ya existen** y se reutilizan tal cual.

### 2.2 Excepciones declaradas de esta fase

| Excepción | Valor | Razón |
|---|---|---|
| Piso de toque en `app/(cleaner)/` | **44px** | Ya declarado en `02-UI-SPEC` §2. Aplica a **todo** control del árbol, sin excepción: botones, links, el botón de copiar el código, los toggles `iPhone`/`Android`. |
| Acción primaria del banner y de cada paso del asistente | **56px** (`--spacing-toque-comodo`) | El aseador toca `Activar los avisos` una sola vez en su vida y esa vez decide el canal. 56px es el mismo múltiplo de 4 y baja el fallo de puntería con guantes. |
| Círculo del número de paso | **32px** (`--spacing-paso`) | Decorativo, no interactivo. No aplica el piso de 44px. |
| Alto de fila de `/aseadores` con la columna nueva | **40px, sin cambio** | La columna `AVISOS` es icono 14px + etiqueta 12/600, exactamente el mismo tratamiento que la columna `ESTADO` que ya cabe. No crece la fila. |
| Separación entre pasos del asistente | **32px** (`2xl`) | Un paso es un bloque mayor de la pantalla. |

### 2.3 La cuenta de la tabla de aseadores, hecha y no estimada

`/aseadores` a 1440px: contenedor `--container-admin` 1440 con `px-xl` (24px por lado) = **1392 útiles**.

| Columna | Ancho |
|---|---|
| `ESTADO` `--spacing-col-estado` | 96px |
| `NOMBRE` `--spacing-col-nombre` (flexible, mínimo) | 200px |
| `TELÉFONO` `--spacing-col-telefono` | 140px |
| **`AVISOS` `--spacing-col-avisos` (nueva)** | **128px** |
| `RESPONSABLE DE` `--spacing-col-responsable` | 200px |
| `SUPLENTE EN` `--spacing-col-suplente` | 160px |
| menú `--spacing-col-menu` | 48px |

Fijas = 96 + 140 + 128 + 200 + 160 + 48 = **772px**. A 1440 le quedan 620px a `NOMBRE` contra su mínimo de 200. A 1280 (mínimo soportado, 1232 útiles) le quedan **460px**. Cabe sin apretar en los dos y **no hace falta scroll horizontal nuevo**.

### 2.4 Layout del árbol del aseador

`app/(cleaner)/layout.tsx` ya existe con `max-w-aseador` (480px), `p-lg` (16px) y `gap-lg`. **No se cambia.**

- Referencia de diseño: **390px** (iPhone 14/15/16 base). Mínimo soportado: **360px**.
- A 360px con `p-lg`: **328px de contenido**. Toda medida de esta fase cabe ahí, y `--container-captura` (280px) deja 48px de aire.
- El banner (§7) es el **primer hijo de `<main>`**, encima del `<h1>` de la página. No es sticky, no es modal, no flota.

---

## 3. Tipografía

### 3.1 SUPERSEDE 1 de 2 — el árbol `(cleaner)` tiene su propia escala

`02-UI-SPEC` §3 declara cuatro tamaños (24 / 16 / 14 / 12) y dos pesos (400 / 600) para toda la app. Eso se escribió cuando la única superficie era escritorio con mouse. **Los cuatro roles siguen siendo cuatro y los dos pesos siguen siendo dos; lo que cambia son los valores dentro de `app/(cleaner)/`.**

| Rol | `(admin)` | `(cleaner)` | Line height | Peso |
|---|---|---|---|---|
| Display | 24px | **28px** | 1.2 | 600 |
| Heading | 16px | **20px** | 1.3 | 600 |
| Body | 14px | **16px** | 1.5 | 400 |
| Micro | 12px | **14px** | 1.4 | 400 · 600 |

```css
@theme {
  --text-display-movil: 1.75rem;   /* 28px */
  --text-display-movil--line-height: 1.2;
  --text-display-movil--font-weight: 600;

  --text-heading-movil: 1.25rem;   /* 20px */
  --text-heading-movil--line-height: 1.3;
  --text-heading-movil--font-weight: 600;

  --text-body-movil: 1rem;         /* 16px */
  --text-body-movil--line-height: 1.5;
  --text-body-movil--font-weight: 400;

  --text-micro-movil: 0.875rem;    /* 14px */
  --text-micro-movil--line-height: 1.4;
}
```

**Las tres razones, en orden de peso:**

1. **iOS Safari hace zoom automático al enfocar un `<input>` con `font-size` menor a 16px.** Es comportamiento del motor, no una preferencia. Con `text-body` a 14px, cualquier campo del árbol del aseador dispara un zoom que descoloca el layout y que el usuario tiene que deshacer a mano. Con 16px no pasa. Esta fase todavía no tiene campos en `(cleaner)`, pero la Fase 6 sí (checklist, reportes), y la escala se fija ahora.
2. **Distancia de lectura y condición de uso.** El admin lee a 60cm con el brazo apoyado; el aseador lee a distancia de brazo, de pie, a veces con el sol encima y con la pantalla mojada.
3. **No es "más grande porque sí": es un salto de un escalón en los cuatro roles a la vez.** La jerarquía relativa es idéntica, así que ningún componente cambia de forma; solo de tamaño.

**Regla de uso, y es greppable:** dentro de `app/(cleaner)/` se usan **solo** las clases con sufijo `-movil`. Un `text-body` sin sufijo bajo ese árbol es un defecto. Guardarraíl recomendado (advisory, no bloqueante): añadir a `scripts/ci/` un grep que falle si aparece `text-display|text-heading|text-body|text-micro` sin `-movil` bajo `app/(cleaner)/`. Es el mismo patrón que `check-max-w-tallas.sh` y cuesta cinco líneas.

### 3.2 Reglas ligadas

- **`tabular-nums` obligatorio** en: la hora límite y la fecha de la pantalla de aterrizaje (§9), el número de huéspedes, y el contador de intentos de la prueba de aviso.
- **Geist Mono (`font-mono`) gana un segundo uso, y es el único.** El código de acceso (§9.3). Hasta hoy `02-UI-SPEC` §3 lo reservaba a la URL iCal enmascarada. Razón: un código de acceso se lee una vez y se teclea en un teclado numérico de puerta, con guantes; la ambigüedad `0`/`O` y `1`/`l` en una sans es un modo de fallo real, no una preocupación estética. Va en `text-display-movil` (28px) con `tracking-codigo` (0.12em) y peso 600.
- **El código de acceso NO estrena tamaño propio.** Se usa `display-movil`, que ya existe. La escala del árbol del aseador sigue teniendo cuatro tamaños.
- Ninguna copia de esta fase usa peso 500. `SheetTitle` y compañía ya están corregidos desde la Fase 4.

---

## 4. Color

### 4.1 Esta fase no añade ningún token de color. Cero.

Se revisó estado por estado y la paleta existente cubre todo:

| Necesidad | Token existente |
|---|---|
| Avisos activos y verificados | `--status-ok` #15803D · `--surface-ok` #ECFDF3 |
| Sin permiso, permiso negado, sin suscripción, aseador sin avisos | `--status-warn` #B45309 · `--surface-warn` #FFF8EB |
| Suscripción viva pero prueba sin confirmar | `--status-idle` #475569 |
| Espera de la notificación de prueba | `--muted` #F1F3F5 + `--muted-foreground` #5C6470 + `Loader2` |
| Plataforma no soportada | `--muted-foreground` sobre `--muted` |
| Fallo del RPC del código de acceso | `--destructive` #9F1239 · `--surface-destructive` #FEF2F3 |

Que no haga falta un color nuevo es el resultado esperado de un sistema que ya cerró su paleta en la Fase 2 y la amplió una sola vez en la Fase 4. Si en ejecución aparece la tentación de un token nuevo, es señal de que el estado se está codificando por color, que es justo lo que §4.3 prohíbe.

### 4.2 La regla dura de esta fase: "ya lo negué" NO es rojo

`--destructive` está reservado, desde `02-UI-SPEC` §4.6, a acciones que **revocan o borran**. El banner de permiso denegado no es ninguna de las dos.

**Prohibido explícitamente:** `--destructive`, `--surface-destructive` o cualquier rojo en el banner de PWA-03, en la columna `AVISOS` de `/aseadores`, en el chip de `FranjaCarga` o en la advertencia del `Sheet`. Dos razones, y la segunda es de producto:

1. El aseador con el permiso negado **no hizo nada malo**: o nunca se lo preguntaron, o tocó "No permitir" en un diálogo del sistema que dura dos segundos. Pintarle una pantalla roja lo trata como un error.
2. Rojo en la fila de un aseador dentro de `/aseadores` se leería como "esta persona tiene un problema", y el problema es del teléfono.

### 4.3 Cómo se diferencian entonces los dos estados que PWA-03 exige diferenciar

PWA-03 pide **ayuda diferenciada** entre "nunca lo pedí" y "ya lo negué". Las dos comparten color (`--status-warn` sobre `--surface-warn`) y se diferencian por **los tres canales que sí cargan significado**:

| | Nunca lo pedí | Ya lo negué |
|---|---|---|
| Icono | `Bell` (campana entera) | `BellOff` (campana tachada) |
| Título | `Activa los avisos de aseo` | `Los avisos están bloqueados en este teléfono` |
| Cuerpo | por qué + qué gana | **cómo se desbloquea, distinto por plataforma** |
| Acción primaria | `Activar los avisos` → dispara el navegador | `Ver los pasos` → navega, **no dispara nada del navegador** |
| Acción secundaria | `Ahora no` | ninguna |

Es la misma disciplina de `02-UI-SPEC` §5 ("nunca color solo") aplicada a un caso donde el color **tiene** que ser el mismo.

### 4.4 Ampliación de la lista cerrada del acento

`02-UI-SPEC` §4.4 fija cinco usos de `--primary`; `04-UI-SPEC` §4.2 añadió el sexto. Esta fase añade el séptimo:

7. **Barra de progreso del asistente de instalación** (§8.2). Mismo caso que los usos 4 y 6: avance de una tarea larga.

Los botones primarios del banner y de cada paso del asistente caen dentro del uso 1 ya existente ("botón primario de cada pantalla, uno por pantalla, máximo"), y en el asistente ese único primario es el del paso **activo**; los pasos ya cumplidos no llevan botón y los futuros están inertes (§8.2).

Sigue prohibido `--primary` como color de estado, como tinte de fila, en badges, en iconos de tabla y en el panel de alertas.

---

## 5. Vocabulario de estado de los avisos

Dos vocabularios, uno por audiencia. Los dos derivan de datos que ya existen (`push_subscriptions.revoked_at`, `Notification.permission`, `display-mode`) más un dato nuevo de verificación (§8.6).

### 5.1 Estado en el cliente (lo que ve el aseador) — seis casos

La derivación vive en **una sola función**, `estadoDeAvisos()` en `lib/domain/avisos.ts`, y devuelve un discriminante tipado. Duplicar el `if` en dos componentes es cómo se desincroniza el banner de la realidad.

| # | Estado | Derivación | Banner |
|---|---|---|---|
| S0 | `no_soportado` | `!('serviceWorker' in navigator)` o `!('PushManager' in window)` con la app **ya instalada** | §7.6 |
| S1 | `sin_instalar` | No está en `standalone` **y** `!('Notification' in window)` (feature detect exacto de iOS en pestaña, sin sniffing de user agent) | §7.2 |
| S2 | `nunca_pedido` | `Notification.permission === 'default'` | §7.3 |
| S3 | `negado` | `Notification.permission === 'denied'` | §7.4 |
| S4 | `roto` | `permission === 'granted'` pero no hay `PushSubscription`, o su `endpoint` no coincide con el registrado, y la **reparación silenciosa ya falló** | §7.5 |
| S5 | `activo` | `granted` + suscripción viva y coincidente | **no se renderiza banner** |

Detección de instalada, que es la que funciona en todas las plataformas:

```ts
const instalada =
  window.matchMedia('(display-mode: standalone)').matches ||
  (window.navigator as unknown as { standalone?: boolean }).standalone === true
```

**Reglas del estado:**

- **S4 nunca se muestra de entrada.** Al montar la ruta del aseador, la app intenta `unsubscribe()` + `subscribe()` + re-registrar en silencio (es el sustituto de `pushsubscriptionchange`, que **no existe en iOS**). El banner S4 aparece solo si esa reparación falló. Un banner que sale y desaparece solo, sin que nadie lo toque, enseña a ignorar los banners.
- **El estado se recalcula al volver a foreground** (`visibilitychange`), no solo al montar: el aseador puede haber cambiado el permiso en Ajustes y volver a la app.
- **S1 y S0 se distinguen por si la app está instalada.** En una pestaña de Safari iOS, `window.Notification` es `undefined` porque falta la instalación (S1), no porque el iPhone no pueda (S0). Confundirlos manda a alguien a hablar con el administrador cuando lo único que falta es añadir un icono.

### 5.2 Estado en el admin (lo que ve sobre cada aseador) — tres casos

`estadoDeAvisosDeAseador()` en el mismo módulo. Nunca color solo: icono de forma distinta + etiqueta + color, los tres.

| Estado | Derivación | Icono lucide | Etiqueta | Color |
|---|---|---|---|---|
| **Activos** | ≥1 `push_subscriptions` con `revoked_at is null` **y** verificación confirmada por toque (§8.6) | `BellRing` | `Activos` | `--status-ok` |
| **Sin probar** | Suscripción viva, pero la prueba nunca se confirmó, o se confirmó a mano | `Bell` | `Sin probar` | `--status-idle` |
| **Sin avisos** | Cero suscripciones vivas | `BellOff` | `Sin avisos` | `--status-warn` |

- Un aseador **inactivo** no muestra estado: la celda va con `—` en `--muted-foreground`. Su teléfono ya no importa.
- **`Sin probar` no es un error y no se pinta como uno.** Es "hay a dónde enviar, pero nadie comprobó que llegue". Por eso `--status-idle` y no `--status-warn`. La diferencia con `Activos` es exactamente la que D-02 exige que exista.
- El `title` de la celda lleva el detalle: `Activos desde el 8 de septiembre. Última vez que abrió la app: hace 3 días.` / `Se registró el teléfono el 8 de septiembre, pero la prueba nunca llegó.` / `No hay ningún teléfono registrado.`

### 5.3 Vocabulario fijo

Hereda `02-UI-SPEC` §15 y `04-UI-SPEC` §18.4, y añade:

| Concepto | Término | No usar |
|---|---|---|
| Web Push, la notificación al teléfono | **aviso** | notificación, push, alerta, mensaje |
| `push_subscriptions` viva | **avisos activos** | suscripción, suscrito, registrado |
| El acto de instalar la PWA | **instalar la app** | añadir a inicio (esa es la instrucción literal de iOS, no el concepto), agregar acceso directo |
| La app instalada | **la app** | la PWA, la aplicación web, el sitio |
| `notifications` en el panel del admin | **alerta** (sin cambio) | — |
| La notificación de verificación de §8.6 | **aviso de prueba** | test, ping, notificación de prueba |

**`aviso` vs `alerta` es una distinción real y hay que sostenerla:** *alerta* es la fila del panel del admin (`04-UI-SPEC` §18.4 ya lo fijó); *aviso* es lo que suena en un teléfono. Un mismo hecho puede producir los dos.

---

## 6. Mapa de superficies

| # | Superficie | Ruta | Audiencia | REQ / criterio | §|
|---|---|---|---|---|---|
| 1 | Banner de avisos, persistente, 6 estados | todas las de `(cleaner)` | aseador | PWA-03, criterio 4 | §7 |
| 2 | Asistente de instalación con verificación | `/instalar` | aseador | PWA-02, D-02, criterio 1 | §8 |
| 3 | Pantalla de aterrizaje del aseo + código | `/aseos/[id]` | aseador | NOTIF-01, criterio 2, D-06 | §9 |
| 4 | El aviso push en sí | — | los dos | NOTIF-01, NOTIF-02, D-05, D-06 | §10 |
| 5 | Columna `AVISOS` de aseadores | `/aseadores` | admin | D-03, criterio 6 | §11.1 |
| 6 | Marca en el chip de `FranjaCarga` | `/operacion` | admin | D-03, criterio 6 | §11.2 |
| 7 | Advertencia antes de asignar | `Sheet` de confirmar + `Dialog` de reasignar | admin | D-03, criterio 6 | §11.3 |
| 8 | Bloque `Atrasados` | `/operacion` | admin | D-08, criterio 7 | §12 |
| 9 | Franja de permiso del admin | `/operacion` | admin | NOTIF-02, criterio 3 | §13 |
| 10 | Manifest, iconos, `apple-touch-icon` | — | los dos | PWA-02 | §14 |

Todo lo que no está en esta tabla no es de esta fase. En particular: checklist, cámara, cola offline, botones Empecé / Terminé / No puedo, y el semáforo de entregabilidad (NOTIF-V2-01, diferido a v2 desde 2026-08-31).

---

## 7. El banner de avisos (PWA-03, criterio 4)

Vive en `app/(cleaner)/layout.tsx` como primer hijo de `<main>`, encima del `<h1>` de cada página. `role="region"`, `aria-label="Estado de los avisos"`.

### 7.1 Anatomía común a los cinco estados visibles

```
┌────────────────────────────────────────────┐
│ 🔔  Activa los avisos de aseo              │  ← icono 20px + titulo heading-movil
│     Te avisamos apenas te asignen un       │  ← body-movil
│     aseo. Sin esto no te enteras.          │
│                                            │
│  ┌──────────────────────────────────────┐  │
│  │        Activar los avisos            │  │  ← 56px, ancho completo, primario
│  └──────────────────────────────────────┘  │
│              Ahora no                      │  ← 44px, ghost, centrado
└────────────────────────────────────────────┘
```

- `Alert` de shadcn, fondo `--surface-warn`, `border: 1px solid --border`, radio 6px, `p-lg` (16px), `gap-md` (12px).
- Icono 20px alineado a la primera línea del título, color `--status-warn`, `aria-hidden="true"` (el título ya dice lo mismo).
- Título `text-heading-movil` (20/600) `--foreground`. Cuerpo `text-body-movil` (16/400) `--foreground`. **No `--muted-foreground`:** este texto es la instrucción, no un apoyo.
- Acción primaria: ancho completo, `--spacing-toque-comodo` (56px), `--primary`.
- Acción secundaria cuando existe: `variant="ghost"`, ancho completo, `--spacing-toque` (44px), texto `--muted-foreground`.
- **Sin animación de entrada.** `02-UI-SPEC` §6.4: solo transiciones de color / fondo / borde / opacidad, 120ms, `ease-out`.
- **El banner no roba el foco al montar.** Es una región, no un diálogo.
- Al cambiar de estado, el contenido nuevo se anuncia por `aria-live="polite"` (§16).

### 7.2 S1 — `sin_instalar`

| | |
|---|---|
| Icono | `Smartphone` |
| Título | `Instala VivaGuest en tu teléfono` |
| Cuerpo | `Desde el navegador no te llegan los avisos de aseo. Instalarla toma un minuto y después la abres desde el icono.` |
| Primaria | `Ver cómo se instala` → `/instalar` |
| Secundaria | ninguna |

### 7.3 S2 — `nunca_pedido`. **Este banner ES la pantalla de priming.**

| | |
|---|---|
| Icono | `Bell` |
| Título | `Activa los avisos de aseo` |
| Cuerpo | `Te avisamos apenas te asignen un aseo. Sin esto no te enteras.` |
| Primaria | `Activar los avisos` |
| Secundaria | `Ahora no` |

**Las tres reglas de implementación, no negociables (`05-RESEARCH.md`, y Apple lo pide literal):**

1. `Notification.requestPermission()` se llama **dentro del `onClick`** de `Activar los avisos`. Nunca en montaje, nunca en `useEffect`, nunca detrás de un temporizador.
2. Acto seguido, **en el mismo handler y sin un `await` a nuestra API en medio**, `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`. El registro en el servidor va después.
3. `Ahora no` **no toca absolutamente nada del navegador**. Solo oculta el banner. Es la puerta por la que sale el que iba a denegar, y en iOS esa puerta le salva su única oportunidad.

**`Ahora no` oculta el banner hasta el próximo arranque de la app, no para siempre.** PWA-03 dice *persistente*, y una descarga permanente en `localStorage` lo incumpliría. Se guarda en memoria del cliente, no en disco.

Durante la petición: el botón pasa a `disabled` con `Loader2` y el texto `Esperando al teléfono…`.

### 7.4 S3 — `negado`. Dos copys distintos, por plataforma.

Icono: `BellOff`. Título, en las dos: `Los avisos están bloqueados en este teléfono`.

**iOS (la denegación es irreversible sin reinstalar):**

> `En iPhone la única forma de volver a activarlos es borrar el icono de VivaGuest de la pantalla de inicio y volver a instalarlo. No pierdes nada: tus aseos siguen en el sistema.`
>
> Primaria: `Ver los pasos` → `/instalar?volver=1`
> Debajo, `text-micro-movil` `--muted-foreground`: `Mientras tanto, avísale a tu administrador para que te escriba cuando tengas un aseo.`

**Android (se arregla en Ajustes):**

> `Ábrelos desde los ajustes del teléfono: Ajustes → Aplicaciones → VivaGuest → Notificaciones, y actívalas.`
>
> Primaria: `Ver los pasos` → `/instalar?permiso=1`

**Las tres cosas que este banner NO hace, y cada una tiene su razón:**

- **No vuelve a llamar `requestPermission()`.** En `denied` devuelve `denied` de inmediato, sin diálogo. Un botón que no produce nada visible se lee como app rota.
- **No dice "haz clic aquí para activar".** No hay ningún clic que active nada desde dentro de la app.
- **No es rojo** (§4.2).

La línea de "avísale a tu administrador" no es relleno: push es el **único canal, sin respaldo** (riesgo aceptado y registrado en `STATE.md` desde 2026-08-31). Un aseador bloqueado necesita saber que hay una salida humana.

### 7.5 S4 — `roto`

| | |
|---|---|
| Icono | `TriangleAlert` (no `BellOff`: es una falla, no un estado de permiso) |
| Título | `Los avisos dejaron de funcionar` |
| Cuerpo | `Este teléfono ya no está recibiendo los aseos. Tócalo para volver a conectarlo.` |
| Primaria | `Reconectar los avisos` |
| Secundaria | ninguna |

Si la reconexión falla otra vez: el banner se queda, y debajo del botón, `text-micro-movil` `--muted-foreground`: `No se pudo. Vuelve a intentarlo o avísale a tu administrador.` Sin toast: el banner ya es la superficie de estado y un toast duplicaría la información.

### 7.6 S0 — `no_soportado`

Icono `CircleAlert`, color `--muted-foreground`, fondo `--muted` (no `--surface-warn`: no hay nada que el aseador pueda hacer, y ámbar promete una acción que no existe). **Sin botón primario.**

| Sub-caso | Cuerpo |
|---|---|
| iPhone con iOS < 16.4 | `Tu iPhone necesita iOS 16.4 o más nuevo para recibir avisos. Habla con tu administrador.` |
| Navegador embebido (WhatsApp, Instagram, Facebook) | `Estás viendo VivaGuest dentro de otra aplicación. Toca el menú de arriba y elige "Abrir en Safari" para poder instalarla.` (en Android: `"Abrir en Chrome"`) |
| Cualquier otro | `Este teléfono no puede recibir avisos. Habla con tu administrador.` |

El caso del navegador embebido **sí** lleva primaria: `Cómo abrirlo en Safari` → `/instalar?navegador=1`. Es el único de los tres donde hay algo que hacer, y es el caso más probable de todos, porque el link del onboarding se manda por WhatsApp.

---

## 8. `/instalar` — el asistente de instalación (PWA-02, D-02, criterio 1)

Ruta nueva dentro de `app/(cleaner)/instalar/`. Es la pantalla más aburrida de la fase y la que decide si el producto funciona.

### 8.1 El contrato que no se puede suavizar

> **La instalación no termina cuando la app aparece en la pantalla de inicio. Termina cuando llegó un aviso de prueba a ese teléfono.** (D-02, textual del usuario.)

Consecuencias visuales, las cuatro:

1. El asistente tiene **cuatro** pasos, y el cuarto es la prueba.
2. La pantalla de cierre (`Listo`) **solo** se alcanza desde el paso 4 confirmado. No hay atajo, no hay `Saltar`, no hay `Terminar` en el paso 3.
3. El paso 4 tiene tres estados visibles y distintos: **esperando**, **llegó**, **no llegó**. No es un botón que se pone verde.
4. La confirmación tiene **dos grados** y el admin ve cuál fue (§8.6, §11.1).

Y una nota de encuadre que el planner debe respetar: D-02 dice que el camino principal es la **instalación asistida presencial**. Esta pantalla es la herramienta que usa quien acompaña, y a la vez la red de seguridad del que reinstala o cambia de teléfono. Está diseñada para funcionar con alguien al lado **y** sola; no se optimiza para el segundo caso a costa del primero.

### 8.2 Anatomía

```
┌──────────────────────────────────────────┐
│ Instalar VivaGuest                       │  ← display-movil 28/600
│ ████████████░░░░░░░░░░░░░░░░  2 de 4     │  ← Progress 4px --primary + micro-movil
├──────────────────────────────────────────┤
│  ✓  1. Instala la app                    │  ← cumplido: CircleCheck --status-ok
├──────────────────────────────────────────┤
│ ┌──┐                                     │
│ │2 │  Ábrela desde el icono              │  ← activo: heading-movil
│ └──┘                                     │
│      Cierra el navegador y abre          │  ← body-movil
│      VivaGuest desde el icono nuevo.     │
│      [ captura recortada 280px ]         │
│      ┌────────────────────────────────┐  │
│      │  (accion del paso, si tiene)   │  │  ← 56px
│      └────────────────────────────────┘  │
├──────────────────────────────────────────┤
│  3   Activa los avisos                   │  ← futuro: inerte, --muted-foreground
├──────────────────────────────────────────┤
│  4   Prueba que sí llega                 │
└──────────────────────────────────────────┘
```

- **Un solo paso está expandido a la vez**, el activo. Los cumplidos colapsan a una línea con `CircleCheck` 20px `--status-ok`. Los futuros colapsan a una línea inerte: círculo `--spacing-paso` (32px) con borde `--border` y número en `--muted-foreground`, título en `--muted-foreground`, **sin `cursor: pointer`, sin hover, sin foco**. Un paso futuro no es un acordeón: no se puede abrir porque el anterior no está hecho.
- **Un paso cumplido SÍ se puede reabrir**, tocando su línea. `aria-expanded`, `aria-controls`. Sirve para releer las instrucciones sin repetir la prueba.
- `Progress` de 4px con relleno `--primary` (uso 7 del acento, §4.4) más `2 de 4` en `text-micro-movil` `tabular-nums` `--muted-foreground`.
- Separador `--border` entre pasos. `gap-2xl` (32px) entre el bloque del paso activo y sus vecinos.
- **El progreso no se persiste en `localStorage`.** Cada arranque recalcula el paso activo desde el estado real del teléfono (§5.1). Un progreso guardado puede mentir: el aseador desinstaló y el asistente diría "3 de 4".

### 8.3 Los pasos, por plataforma

Se detecta la plataforma y se renderiza un solo juego. Debajo del asistente, dos toggles `Button variant="ghost"` de 44px: `iPhone` · `Android`, con el detectado marcado (`aria-pressed`). Copy de encuadre en `text-micro-movil` `--muted-foreground`: `¿Tienes otro teléfono?`

**iPhone (Safari):**

| Paso | Título | Instrucciones | Cómo se verifica |
|---|---|---|---|
| 1 | `Instala la app` | `1. Toca el botón Compartir, abajo en el centro de la pantalla.`<br>`2. Desliza hacia abajo y toca "Añadir a inicio".`<br>`3. Toca "Añadir", arriba a la derecha.` | `display-mode: standalone`. Mientras no: `Todavía no está instalada.` en `--muted-foreground` |
| 2 | `Ábrela desde el icono` | `Cierra Safari y abre VivaGuest desde el icono nuevo de tu pantalla de inicio.`<br>`El iPhone no deja activar los avisos si la abres desde el navegador.` | `display-mode: standalone` en esta sesión |
| 3 | `Activa los avisos` | `Te avisamos apenas te asignen un aseo. Sin esto no te enteras.`<br>Botón `Activar los avisos`.<br>**Advertencia**, `text-micro-movil` `--status-warn`: `El teléfono te lo pregunta una sola vez. Toca "Permitir".` | `Notification.permission === 'granted'` **y** hay `PushSubscription` |
| 4 | `Prueba que sí llega` | §8.6 | §8.6 |

Los pasos 1 y 2 son **el mismo hecho técnico** (`standalone`) medido en dos momentos, y están separados a propósito: el error más común de iOS es instalar y seguir usando la pestaña de Safari, donde `Notification` es `undefined` y el paso 3 no se puede ni intentar. Fundirlos esconde justo ese error.

**Android (Chrome):**

| Paso | Título | Instrucciones |
|---|---|---|
| 1 | `Instala la app` | **Con prompt disponible:** botón `Instalar la app` (dispara el `beforeinstallprompt` guardado).<br>**Sin prompt:** `Toca el menú de tres puntos, arriba a la derecha, y elige "Instalar aplicación".` |
| 2 | `Ábrela desde el icono` | `Abre VivaGuest desde el icono nuevo, no desde Chrome.` |
| 3 | `Activa los avisos` | Igual que iPhone, **sin** la advertencia de una sola oportunidad: en Android el permiso se puede volver a pedir desde Ajustes. |
| 4 | `Prueba que sí llega` | §8.6 |

`beforeinstallprompt` se usa **solo** en Android, y como camino secundario: la instrucción escrita del menú ⋮ se muestra siempre debajo, porque el evento no dispara si Chrome decide que ya lo mostró. Next.js recomienda no depender de él en absoluto (*"we do not recommend this as it is not cross browser and platform"*); acá se usa porque en Android es gratis y en iOS simplemente no existe.

### 8.4 Las capturas

**Regla:** cada paso que describe un gesto del sistema operativo lleva una **captura real recortada**, no un icono de lucide que imite el glifo (§1.2).

| Archivo | Contenido | Paso |
|---|---|---|
| `public/instalar/ios-1-compartir.png` | Recorte de la **barra inferior de Safari**, con el botón Compartir señalado | iPhone 1 |
| `public/instalar/ios-2-anadir-inicio.png` | Recorte de la **fila "Añadir a inicio"** dentro de la hoja de Compartir | iPhone 1 |
| `public/instalar/ios-3-anadir.png` | Recorte de la **esquina superior derecha** con el botón "Añadir" | iPhone 1 |
| `public/instalar/android-1-menu.png` | Recorte del **menú ⋮** de Chrome | Android 1 |
| `public/instalar/android-2-instalar.png` | Recorte de la fila **"Instalar aplicación"** | Android 1 |

- Ancho de render **`--container-captura` (280px)**, centrado. Fuente a **2x (560px)**, PNG.
- **Recortadas, no pantallas completas.** Una captura de iPhone entera a 280px de ancho deja el botón de Compartir en 12 píxeles: no enseña nada. El recorte es lo que convierte la instrucción en utilizable.
- Señalización: un rectángulo de 2px `--brand-identity` (#ff7469) alrededor del control. Es exactamente el uso que `02-UI-SPEC` autoriza para ese token (*"logo y áreas grandes, nunca texto ni relleno de control"*): acá es una marca gráfica sobre una imagen, no texto.
- `alt` **obligatorio y descriptivo, repitiendo la instrucción en palabras**: `alt="Barra inferior de Safari. El botón Compartir es el cuadrado con la flecha hacia arriba, en el centro."` Si la imagen no carga, o si el aseador usa lector de pantalla, el paso sigue siendo ejecutable.
- `next/image` con `width` / `height` explícitos: sin ellos hay salto de layout, y `02-UI-SPEC` §6.4 prohíbe animaciones de layout.
- Debajo del bloque de capturas de cada plataforma, `text-micro-movil` `--muted-foreground`: `Capturas tomadas en iOS {versión} el {fecha}.` **Las capturas caducan** cuando Apple mueve un botón, y sin la fecha nadie sabe cuándo revisarlas.
- **Origen:** hay un iPhone físico disponible (D-01). Las capturas se toman de ahí, no se dibujan.

### 8.5 Los tres modos de entrada que no son "abrí `/instalar` en Safari"

| Query | Origen | Qué cambia |
|---|---|---|
| `?navegador=1` | Banner S0, navegador embebido | Antes del paso 1 aparece un **paso 0** expandido: `Ábrelo en Safari` / `Estás dentro de WhatsApp. Toca el menú de arriba a la derecha y elige "Abrir en Safari". Sin eso no se puede instalar.` Los pasos 1 a 4 quedan inertes. |
| `?permiso=1` | Banner S3, Android | Se salta a un bloque único: `Desbloquear los avisos` con la ruta de Ajustes, y debajo `Cuando vuelvas, toca "Volver a probar"`. |
| `?volver=1` | Banner S3, iOS | Bloque único: `Volver a instalar VivaGuest` con los tres pasos: `1. Mantén tocado el icono de VivaGuest y elige "Eliminar app".` `2. Vuelve a abrir vivaguest.app en Safari.` `3. Repite la instalación desde el paso 1.` Copy de tranquilidad: `No pierdes nada. Tus aseos, tus fotos y tu historial siguen en el sistema.` |

### 8.6 Paso 4 — la prueba. Es el contrato de D-02.

```
┌──┐
│4 │  Prueba que sí llega
└──┘
      Te mandamos un aviso de prueba a este
      teléfono. La instalación no está lista
      hasta que llegue.
      ┌────────────────────────────────────┐
      │      Enviar aviso de prueba        │
      └────────────────────────────────────┘
```

**Los tres estados, y son visualmente distintos:**

| Estado | Presentación | Copy |
|---|---|---|
| **Esperando** | Fondo `--muted`, `Loader2` 20px `--muted-foreground` girando, botón primario `disabled` | `Enviado. Espera a que suene el teléfono…`<br>`text-micro-movil`: `Puede tardar unos segundos. Si no llega en un minuto, vuelve a enviarlo.` |
| **Llegó** | Fondo `--surface-ok`, `CircleCheck` 20px `--status-ok` | `Llegó. Este teléfono ya recibe los avisos.` |
| **No llegó** | Fondo `--surface-warn`, `TriangleAlert` 20px `--status-warn`, botón `Enviar de nuevo` | `No ha llegado.`<br>`text-micro-movil`: `Vuelve a enviarlo. Si a la tercera no llega, este teléfono no puede recibir avisos: avísale a tu administrador.` |

**Los dos grados de confirmación, y por qué existen los dos:**

1. **Confirmación por toque (la buena).** El aviso de prueba lleva `navigate` / `url` hacia `/instalar?prueba={token}`. Al tocar el aviso, la app se abre en esa URL y el servidor marca la verificación como **confirmada por toque**. Eso es una prueba de verdad: el aviso se pintó en la pantalla, el aseador lo vio, y era tocable. Es la única evidencia que no depende de que nadie diga nada.
2. **Confirmación a mano (la floja).** Botón secundario, `variant="ghost"` 44px, visible solo en el estado *esperando*: `Ya sonó, no alcancé a tocarlo`. Marca la verificación como **confirmada a mano**. Existe porque el caso real es alguien acompañando el onboarding, y el aviso se puede descartar sin querer.

**Y la consecuencia, que es lo que hace que la distinción sirva de algo:** el admin ve los dos grados distintos. `Activos` (§5.2) exige confirmación **por toque**. Una confirmación a mano deja al aseador en **`Sin probar`**. Si no se distinguieran, "Ya sonó" sería un botón para saltarse la única verificación de la fase.

Tras la confirmación (de cualquier grado), pantalla de cierre:

> `Listo.` (display-movil)
> `Este teléfono ya recibe los aseos. Cuando te asignen uno, te va a sonar.` (body-movil)
> Primaria 56px: `Ir a mis aseos` → `/mis-aseos`

Cuando el grado fue a mano, se añade encima, `text-micro-movil` `--status-warn`: `Quedó confirmado a mano. Tu administrador va a ver que la prueba no se comprobó tocando el aviso.` Es honesto y evita la sorpresa cuando el admin llame a repetirlo.

### 8.7 Límite de reintentos

Tres envíos de prueba por sesión. Al cuarto, el botón se deshabilita y el bloque pasa a:

> `Este teléfono no está recibiendo avisos.` (`--status-warn`)
> `Probamos 3 veces y no llegó ninguno. Avísale a tu administrador: puede ser el teléfono, la versión del sistema o la conexión.`

Contador visible mientras tanto: `Intento 2 de 3` en `text-micro-movil` `tabular-nums` `--muted-foreground`. Ocultar el contador y luego cortar de golpe es la forma de que el aseador crea que la app se congeló.

---

## 9. `/aseos/[id]` — la pantalla de aterrizaje (NOTIF-01, criterio 2, D-06)

`notifications.url` ya vale `'/aseos/' || cleaning_id` desde la migración 09. Esa ruta **no existe todavía**. Sin ella, el criterio 2 ("al tocarla aterriza en ese aseo, donde revela el código de acceso") no se cumple y toda push del aseador cae en un 404.

### 9.1 Alcance: solo lectura, más el código

**Lo que renderiza:** apartamento, cluster, fecha, hora límite, número de huéspedes, instrucciones del admin, y el código de acceso detrás de un botón.

**Lo que NO renderiza, y es Fase 6:** checklist por cuarto, cámara, fotos, cola offline, y los botones `Empecé` / `Terminé` / `No puedo`. `05-CONTEXT.md` §domain lo dice literal: *"Esta fase entrega el envoltorio instalable, el service worker, el permiso y la pantalla a la que aterriza la notificación, no el trabajo que se hace dentro."*

**Copy del pie, `text-micro-movil` `--muted-foreground`, y es un compromiso, no un relleno:**
> `Marcar el aseo como empezado y subir las fotos llega en la próxima versión de la app.`

Sin esa línea, un aseador que aterriza desde un aviso busca el botón de empezar, no lo encuentra, y concluye que la app está rota.

### 9.2 Anatomía

```
┌────────────────────────────────────────┐
│ Bogotá 3                               │  ← display-movil 28/600
│ Chapinero                              │  ← body-movil --muted-foreground
├────────────────────────────────────────┤
│ Fecha            viernes 12 de sep.    │  ← body-movil, tabular-nums
│ Hora límite      11:30                 │
│ Huéspedes        4                     │
├────────────────────────────────────────┤
│ Instrucciones                          │  ← heading-movil
│ Dejar el aire encendido. La llave      │  ← body-movil
│ del clóset está en la cocina.          │
├────────────────────────────────────────┤
│  ┌──────────────────────────────────┐  │
│  │      Ver el código de acceso     │  │  ← 56px, primario
│  └──────────────────────────────────┘  │
│   Cada vez que lo abres queda          │  ← micro-movil --muted-foreground
│   registrado.                          │
└────────────────────────────────────────┘
```

- `Card` sobre `--background` dentro del `--canvas` del layout. `p-lg` (16px), `gap-lg`.
- Los tres datos van en pares etiqueta/valor: etiqueta `text-micro-movil` `--muted-foreground`, valor `text-body-movil` `--foreground` alineado a la derecha, `tabular-nums`. Filas de 44px: son datos, pero a 44px el pulgar no se equivoca al hacer scroll.
- **Fecha:** `formatFechaBog()` (`viernes 12 de septiembre`). Prohibido `new Date('2026-09-12')`, que se parsea como UTC y en Bogotá muestra el día anterior. Regla heredada, ya escrita en `lib/domain/dates.ts`.
- **Sin instrucciones:** la sección no se renderiza. Un `Instrucciones` seguido de "ninguna" es ruido.
- **Aseo cancelado o de otra persona:** RLS ya lo bloquea. La pantalla muestra el estado vacío de §15.
- **El estado del aseo se muestra** con `EstadoAseo` (§5 de `04-UI-SPEC`), en la esquina superior derecha, con la escala móvil. Un aseo que ya se canceló entre el envío del aviso y el toque tiene que decirlo.

### 9.3 El código de acceso — contrato completo

Es la única superficie de este proyecto que muestra un secreto auditado, y por eso su contrato es explícito.

**Antes de revelar:**
- Botón `Ver el código de acceso`, primario, 56px, ancho completo, icono `KeyRound` 20px.
- Debajo, `text-micro-movil` `--muted-foreground`: `Cada vez que lo abres queda registrado.` No es una amenaza: es transparencia, y es cierta (`access_code_reads`, T-01-48).

**Después de revelar:**

```
┌──────────────────────────────────┐
│  A C C E S O                     │  ← micro-movil 600 uppercase muted
│  ┌────────────────────────────┐  │
│  │      4 8 2 9 1 7           │  │  ← mono, display-movil 28/600, tracking-codigo
│  └────────────────────────────┘  │
│  [ Copiar ]                      │  ← 44px, outline, icono Copy
└──────────────────────────────────┘
```

- Caja `--container-codigo` (240px), fondo `--muted`, radio 6px, `p-lg`, centrada.
- Código en `font-mono`, `text-display-movil` (28px), peso 600, `tracking-codigo` (0.12em), color `--foreground`. Ver §3.2 para la razón del mono.
- **Texto seleccionable.** Nunca imagen, nunca canvas, nunca `user-select: none`.
- Botón `Copiar` con `aria-live="polite"` que confirma: `Copiado.` (patrón ya usado en `ConectarCalendario` de la Fase 2).
- Anuncio para lector de pantalla al revelar: el código dictado dígito a dígito con espacios, en un `aria-live="polite"`.
- **Una vez revelado, se queda visible mientras dure la sesión de la pantalla.** No se auto-oculta tras N segundos. El aseador está de pie frente a una puerta; que el código desaparezca solo lo obligaría a pedirlo de nuevo, y cada petición es otra fila de auditoría.
- **Y NUNCA se persiste en el cliente.** Ni `localStorage`, ni IndexedDB, ni caché del service worker, ni `revalidate` de Next. Vive en estado de React y muere con el desmontaje. La regla se escribe en el componente. Es la contrapartida de D-06: no tendría sentido sacarlo del payload de push para dejarlo cacheado en el teléfono.

**Fuera de la ventana temporal** (`reveal_access_code()` solo entrega en hoy..mañana anclado al aseo): el botón **no se renderiza**. En su lugar, `text-body-movil` `--muted-foreground` con icono `Hourglass` 20px:

> `El código se puede ver el día del aseo y el día antes.`

Un botón deshabilitado que no explica el porqué es peor que ningún botón, y el porqué acá es una regla temporal, no un permiso faltante.

**Si el RPC falla:** `Alert` destructivo dentro de la card, encima del botón, con el mensaje de `mapDbError()`. Recordatorio anclado en el repo: en `P0001` el español viaja en el **`hint`** de Postgres, no en el `message`; `lib/domain/errors.ts` ya lo lee así desde el plan 04-08. El botón se queda y ofrece `Reintentar`.

**Sin conexión:** `Sin conexión. El código no se puede mostrar ahora.` / `Conéctate y vuelve a tocar.` El código **no se cachea para offline** ni siquiera "para el aseo de hoy". Que la PWA sea offline-first (Fase 6) no cambia esta regla; el código es la excepción declarada.

---

## 10. El aviso push en sí (NOTIF-01, NOTIF-02, D-05, D-06)

### 10.1 El copy NO se escribe en esta fase: se renderiza

`notifications.title` y `notifications.body` ya vienen redactados en español desde las migraciones 09, 13 y 15. D-04 prohíbe tocar los RPC que los escriben. **Por lo tanto la regla es la misma que la del panel de alertas de la Fase 4 (`04-UI-SPEC` §0): el push renderiza `title` y `body` verbatim y no los reescribe.**

Lo que sale hoy de la base, leído de las migraciones el 2026-09-10 — esto es **tabla de verificación, no propuesta**:

| `type` | Destinatario | `title` | `body` | Origen |
|---|---|---|---|---|
| `asignacion` | aseador | `Nuevo aseo asignado` | `Tienes un aseo asignado en {apto} para el {DD/MM} antes de las {HH:MM}.` | `confirm_cleaning`, `reassign_cleaning` |
| `aseo_completado` | admin | `Aseo completado` | `Se completo el aseo de {apto}.` | `finish_cleaning` |
| `no_puedo` | admin | `Una aseadora no puede tomar un aseo` | `{Nombre} no puede hacer el aseo de {apto}. Motivo: {motivo}` | `decline_cleaning` |
| `aseo_cancelado`, `extension_sospechosa`, `calendario_caido` | admin | ya escritos | ya escritos | migraciones 13 y 14 |
| `dano_reportado`, `faltantes_reportados` | admin | **todavía no los escribe nadie** | — | RPC de reporte, **Fase 6** |

Los dos últimos se prueban en esta fase **contra fila insertada a mano**, tal como fija `05-CONTEXT.md` §domain. Su copy lo escribirá el UI-SPEC de la Fase 6, cuando exista el emisor.

**Lo único que esta fase decide del aviso**, porque no está en la base:

| Campo | Valor | Razón |
|---|---|---|
| `lang` | `es-CO` | La app es `<html lang="es">` |
| `dir` | `ltr` | — |
| `icon` | `/icon-192.png` | §14 |
| `badge` | `/badge-72.png`, monocromo | Android lo pinta en la barra de estado; sin él pone un cuadrado gris genérico |
| `navigate` / `data.url` | `notifications.url`, que ya vale `/aseos/{id}` | §9 |
| `silent` | `false` | Un aviso silencioso viola `userVisibleOnly` en Safari y cuesta la suscripción |
| `requireInteraction` | **no se usa** | En iOS no aplica, y en Android deja el aviso pegado hasta que se toque. Con quince asignaciones en tanda eso es una pantalla bloqueada |
| `Urgency` | `high` para `asignacion`, `normal` para el resto | El aseador tiene que enterarse ya; el admin puede esperar |
| `TTL` | horas, no días | `05-RESEARCH.md`: un aviso de "te asignaron el aseo de mañana" que llega tres días tarde es ruido |

**Aviso de prueba (§8.6), que sí es copy nuevo de esta fase:**

| | |
|---|---|
| `title` | `Prueba de VivaGuest` |
| `body` | `Si ves esto, tu teléfono ya recibe los avisos. Tócalo para terminar.` |
| `navigate` | `/instalar?prueba={token}` |

`Tócalo para terminar` no es decorativo: es lo que produce la confirmación por toque, que es el grado bueno.

### 10.2 El colapso, y su consecuencia visible (D-05)

`Topic` (colapsa en el servidor de push) y `tag` (colapsa en la bandeja del teléfono) llevan **la misma clave**, derivada de **destinatario + aseo + clase de evento**.

**La consecuencia visual, dicha sin rodeos: un aviso colapsado BORRA al anterior. El texto viejo no vuelve.**

De ahí salen tres reglas de copy, y son verificables:

1. **Toda notificación tiene que leerse sola.** Prohibido: `otro aseo más`, `recuerda que`, `van 3`, `como te decíamos`, ordinales (`el segundo`), y cualquier referencia a un aviso anterior.
2. **Nada de contadores acumulados** (`Tienes 3 aseos`). Un contador dentro de un aviso colapsable miente en cuanto llega el siguiente. La cuenta correcta la da la app al abrirla.
3. **El copy actual de la base cumple las dos.** Verificado el 2026-09-10 contra los cuatro `title`/`body` de la tabla de §10.1: todos son autocontenidos. Es un hecho afortunado, no un diseño; queda escrito acá para que el UI-SPEC de la Fase 6 lo herede a propósito.

**Qué colapsa con qué, en concreto:**

| Caso | ¿Colapsa? | Por qué |
|---|---|---|
| `asignacion` y luego `asignacion` del mismo aseo al mismo aseador (reasignación de vuelta) | **Sí** | Es la misma clase sobre el mismo aseo. La versión nueva reemplaza a la vieja: es lo correcto. |
| `no_puedo` y `dano_reportado` del mismo aseo, al mismo admin | **No** | Clases distintas. Colapsar haría que un daño borre un "no puedo" antes de que el admin lo lea. Ese es literalmente el ejemplo que D-05 da para justificar la clave. |
| `asignacion` de dos aseos distintos al mismo aseador | **No** | Aseos distintos. La tanda de quince produce quince avisos, y así debe ser. |

**Y la divergencia entre capas, que es deliberada:** el colapso vive **solo** en la capa de push. Las filas de `notifications` **no** se colapsan, así que el panel de alertas de la Fase 4 sigue mostrando cada hecho por separado. Es correcto: el panel es el rastro auditable, el aviso es la alarma. Que dos capas cuenten distinto es un defecto solo si nadie lo declaró; queda declarado.

---

## 11. Lo que ve el admin sobre quién quedó sin avisos (D-03, criterio 6)

Tres superficies, todas **extensiones de componentes que ya existen**. Ninguna pantalla nueva.

### 11.1 Columna `AVISOS` en `/aseadores`

Se inserta entre `TELÉFONO` y `RESPONSABLE DE`. Ancho `--spacing-col-avisos` (128px), la cuenta está hecha en §2.3.

```
ESTADO    NOMBRE          TELÉFONO      AVISOS         RESPONSABLE DE   SUPLENTE EN   ⋯
● Activa  María Gómez     300 123 4567  🔔 Activos     5 apartamentos   2             ⋯
● Activa  Ana Peña        300 765 4321  🔕 Sin avisos  4 apartamentos   1             ⋯
● Activa  Luis Rojas      300 555 1212  🔔 Sin probar  3 apartamentos   0             ⋯
```

- Tratamiento idéntico al de la columna `ESTADO`: icono 14px + etiqueta `text-micro` (12px) peso 600, color según §5.2. Es una tabla de `(admin)`, así que **escala de escritorio**, no la móvil de §3.
- La fila **no** cambia de alto (40px), no se tinta, no cambia de peso. Un aseador sin avisos no es un aseador con problemas.
- `Tooltip` en la celda con el detalle de §5.2.
- Aseador inactivo: `—` en `--muted-foreground`, sin icono.
- Leyenda: la línea de 12px bajo la tabla suma los tres pares icono+etiqueta nuevos.

**Nuevo ítem en `MenuAseador` (⋯):** `Copiar el link de instalación`, icono `Copy`. Copia `https://{dominio}/instalar` al portapapeles. Toast: `Link copiado. Mándaselo por donde ya te hablas con {nombre}.`

Ese "por donde ya te hablas" es deliberado: el producto **no tiene canal de mensajería** y no lo va a inventar acá. Prometer "enviar el link" cuando no hay a dónde enviarlo sería una acción que miente. El ítem **no** aparece para aseadores inactivos.

### 11.2 Marca en el chip de `FranjaCarga` (`/operacion`)

`FranjaCarga` ya lista **a todos los aseadores activos, ceros incluidos** (`04-UI-SPEC` §8.2). Es donde el admin decide quién hace qué, así que es donde la marca sirve.

```
CARGA DE HOY  [ María G. 5 ]  [ 🔕 Ana P. 4 ]  [ Luis R. 3 ]  [ Sin asignar 3 ]
```

- Icono `BellOff` **12px** en `--status-warn`, antes del nombre, `gap-xs` (4px). `aria-label="Sin avisos activos"` y `title="Ana Peña no tiene avisos activos. Si le confirmas un aseo, no le va a sonar el teléfono."`
- **El chip conserva su fondo `--muted`.** El tinte `--surface-warn` está reservado a `Sin asignar` (`04-UI-SPEC` §8.2) y duplicarlo haría que dos hechos distintos se vean igual. Solo el icono lleva color.
- El chip de `Sin asignar` **nunca** lleva campana: no es una persona.
- Los chips siguen sin ser clicables y sin filtrar nada (regla de la Fase 4, intacta).
- **`Sin probar` no se marca en la franja.** Solo `Sin avisos`. La franja es un vistazo de diez segundos; meter dos niveles de advertencia en un chip de 32px lo vuelve ilegible. El matiz vive en `/aseadores` (§11.1).

**Se cambia la condición de render**, y es la única modificación de comportamiento de `FranjaCarga`:

> Hoy: `Si hoy no hay ningún aseo asignado, la franja no se renderiza.`
> **Nuevo:** la franja se renderiza si hay al menos un aseo asignado hoy **o** si al menos un aseador activo está en `Sin avisos`.

Sin esto, el día que nadie tenga aseos asignados desaparece la única superficie del dashboard donde se ve quién quedó mudo, que es justo el día en que hay tiempo para arreglarlo.

### 11.3 La advertencia antes de asignar

Dos sitios, misma línea, mismo componente (`AvisoAseadorSinPush`).

**En el `Sheet` de confirmación encadenada (§10 de `04-UI-SPEC`)**, dentro del bloque de contexto, justo debajo de `Queda asignado a {responsable}`:

> `BellOff` 14px `--status-warn` + `text-body` (14/400) `--status-warn`:
> `{Nombre} no tiene los avisos activos. Confirmar lo asigna igual, pero no le va a sonar el teléfono.`

**Y lo que esa advertencia NO hace, porque el `Sheet` está calibrado para quince seguidas:**

- **No deshabilita el botón.** El caso "sin responsable" sí lo deshabilita (`04-UI-SPEC` §10) porque sin responsable la RPC falla. Acá la RPC funciona: el aseo queda asignado y correcto, solo que el aviso no sale. Bloquear la confirmación castigaría al admin por un problema del teléfono ajeno.
- **No abre un diálogo de confirmación.** Quince diálogos encadenados dentro de un `Sheet` encadenado es una pila de tres y hace inusable la tanda.
- **No cambia el copy del botón.** `Confirmar y seguir` sigue igual.

**En `DialogoReasignar`**, debajo del `Select` de destino, y aparece **al elegir** al aseador, no antes. Misma línea, mismo componente.

**Los toasts, que es donde el hecho no se pierde:**

| Situación | Copy |
|---|---|
| Tanda completa, con N sin avisos | `Listo: 15 aseos confirmados. 3 quedaron con un aseador sin avisos.` |
| Tanda interrumpida, con N sin avisos | `Confirmaste 3 de 15. Los demás siguen en la bandeja. 1 quedó con un aseador sin avisos.` |
| Tanda sin ningún caso | `Listo: 15 aseos confirmados.` (sin cambio) |
| Reasignar a alguien sin avisos | `El aseo quedó asignado a {nombre}. No tiene los avisos activos: avísale tú.` |

### 11.4 SUPERSEDE 2 de 2 — el test que prohibía hablar de avisos se invierte

`04-UI-SPEC` §18.1 fija: *"ningún copy de esta fase puede decir ni sugerir que se le avisó al aseador"*, y `.continue-here.md` registra que hay **un test que recorre los mensajes de éxito buscando `notific|avis|le lleg|push|se le mand`**. Cuando exista el drenaje, ese test queda al revés.

**La regla nueva, que es casi tan estricta y sigue siendo testeable:**

> Un copy de éxito **puede** afirmar la **ausencia** de canal, porque es un hecho conocido en el momento de escribir (cero suscripciones vivas). **No puede** afirmar la **entrega**, porque el drenaje es asíncrono y fire-and-forget: la Server Action que confirma el aseo no sabe, y no puede saber, si el aviso llegó.

| Permitido | Prohibido |
|---|---|
| `no tiene los avisos activos` | `se le notificó a María` |
| `no le va a sonar el teléfono` | `ya fue avisado` |
| `avísale tú` | `le llegó la asignación` |
| `quedaron con un aseador sin avisos` | `se le mandó el aviso` |
| | `María ya sabe` |

**Cómo se ajusta el test:** el patrón deja de buscar la palabra `avis` a secas y pasa a buscar las formas de afirmar entrega. Propuesta concreta de regex, para que el planner no la invente: `/(se le (notific|mand|avis)|ya fue avisad|le lleg[oó]|ya sabe)/i`. Ese patrón sigue rojo con el copy prohibido y verde con el permitido, y hay que correr los dos lados para probarlo.

### 11.5 Por qué NO hay un octavo tipo de alerta

Es la decisión más tentadora y hay que dejarla cerrada, porque `05-CONTEXT.md` deja la superficie exacta de D-03 a discreción del UI-SPEC.

1. **El panel de alertas ordena cronológicamente** por el instante del hecho (`04-UI-SPEC` §11.4, D-06 de la Fase 4). "Aseador sin avisos" no tiene instante: es un estado que dura semanas. O se queda clavado arriba para siempre, o se le inventa una fecha falsa.
2. **No se puede atender.** `04-UI-SPEC` §11.4: las alertas computadas no llevan botón de atender porque desaparecen solas cuando el hecho se resuelve. Esta sí desaparecería sola, pero mientras tanto ocupa una de las siete filas visibles del carril con algo que el admin ya sabe.
3. **El criterio 4 de la Fase 4 cerró los siete tipos** y prohíbe jerarquía visual entre ellos. Meter un octavo obliga a reabrir la prueba de escala de grises (`04-UI-SPEC` §16.2) y a verificar que ocho siluetas siguen siendo distinguibles, para ganar cero información nueva.
4. **El sitio correcto de un estado persistente es donde se toma la decisión**, y esa decisión es "a quién le doy este aseo": la franja de carga y el `Sheet` de confirmación. Ahí es donde entra (§11.2, §11.3).

---

## 12. `Atrasados` — el bloque nuevo del carril ancho (D-08, criterio 7)

### 12.1 Por qué este bloque no es opcional

`04-UI-SPEC` §11.3: *"Toda la fila [de alerta] es el destino del clic: `<a>` al aseo (ancla `#aseo-{id}` dentro del día correspondiente, expandiéndolo si estaba colapsado)."*

D-08 hace que `hora_limite_vencida` empiece a generar alertas para aseos **anteriores a hoy**. Si esos aseos no se renderizan en ningún bloque de día, **el clic de esas alertas no tiene ancla a la que saltar**. El resultado sería una alerta que se ve, se puede tocar, y no lleva a ninguna parte: el peor modo de fallo posible para el panel cuyo criterio de éxito es "ninguna alerta se esconde".

### 12.2 Contrato del bloque

Se añade un **cuarto bloque de día**, con el mismo `BloqueDia` y la misma `TablaDia` que ya existen. Cero componentes nuevos.

| Propiedad | Valor | Razón |
|---|---|---|
| Posición | **Primero**, encima de `Hoy` | Es lo único de la pantalla que ya salió mal |
| Por defecto | **Expandido** | `Mañana` y `Siguientes` nacen colapsados porque son planeación. Esto es una falla, y una falla colapsada es una falla escondida |
| Se renderiza | **Solo si tiene contenido** | Ver §12.3 |
| Agrupación interna | **Por día**, igual que `Siguientes` | El bloque abarca varios días; una lista corrida perdería la fecha, que es el dato que dice cuán viejo es |
| Ventana hacia atrás | **7 días** | Ver §12.4 |
| Contenido | Aseos gestionados con `scheduled_date < hoy` y `state in ('pendiente','en_curso')` | Un aseo terminado o cancelado de ayer no está atrasado: está cerrado |

Cabecera, `--spacing-dia-cabecera` (48px), fondo `--canvas`, igual que las otras tres:

```
▼  Atrasados                            3 aseos · el más viejo del 4 de septiembre
```

- `Atrasados` en 16/600, sin fecha relativa detrás (no es un día).
- Conteos a la derecha en 12/400 `tabular-nums` `--muted-foreground`. `el más viejo del {fecha}` es lo que convierte "3 aseos" en una decisión: tres de ayer y tres de hace una semana son problemas distintos.

### 12.3 Por qué este bloque sí desaparece cuando está vacío, y los días no

`04-UI-SPEC` §8.1 dice que un día sin aseos **se renderiza igual**, con `0 aseos`, porque *"que hoy no haya nada es información"*. Acá la regla es la contraria, y la asimetría tiene razón:

- **`Hoy` es un hecho del calendario.** Que esté vacío es un dato que el admin necesita confirmar.
- **`Atrasados` es un filtro sobre una falla.** Estar vacío es el estado normal y esperado. Un `Atrasados · 0 aseos` visible todos los días entrena al admin a saltárselo con la vista, y el día que diga `3` no lo va a ver.

### 12.4 El tope de la ventana, y qué pasa con lo que queda afuera

**7 días.** Tres razones, la tercera es la que decide:

1. Sin tope, la consulta del dashboard crece sin límite: la retención del producto es de 6 meses y un aseo huérfano de marzo seguiría cargándose todos los días.
2. Un aseo sin cerrar de hace más de una semana ya no es una alerta operativa: es higiene de datos. Nadie va a mandar a alguien a limpiar un checkout de hace diez días.
3. **7 días ya es una ventana de este producto:** el toggle `Ver atendidas` del panel de alertas muestra las de los últimos 7 días (`04-UI-SPEC` §11.4). Reusar el número en vez de inventar otro evita que dos partes de la misma pantalla midan "reciente" distinto.

**Lo que queda más atrás no se esconde.** Al final del bloque, una línea `text-micro` (12/400) `--muted-foreground`, sin expansión, con el mismo patrón que `Hay 12 aseos programados después del 9 de septiembre.` de `04-UI-SPEC` §8.1:

> `Hay {N} aseos sin cerrar de antes del {fecha}. Ábrelos desde la ficha de su apartamento.`

Apunta al historial del apartamento (`04-UI-SPEC` §14), que existe y es de solo lectura. Es un destino real, no un callejón.

### 12.5 La fila: sin tratamiento visual nuevo

- **Ninguna fila de `Atrasados` se tinta, ni cambia de peso, ni de alto.** `04-UI-SPEC` prohíbe el tinte de fila y esta fase no lo reabre. La fila atrasada se distingue porque está **en el bloque `Atrasados`**, que es el canal de mayor ancho de banda que existe.
- El estado sigue saliendo de `EstadoAseo` sin cambios: un aseo atrasado sigue siendo `Pendiente` o `En curso`.

**Una señal inline nueva, y es una extensión del patrón que ya existe:** `04-UI-SPEC` §5.2 tiene dos señales inline en la fila (`Zap` para urgente, `Flag` para por revisar). Se añade la tercera:

| Señal | Condición | Icono | `aria-label` |
|---|---|---|---|
| Hora límite vencida | `state in ('pendiente','en_curso')` **y** `scheduled_date + hora_limite < ahora en Bogotá` | `Hourglass` 14px `--status-warn` | `Se venció la hora límite` |

- `Hourglass` **ya está** en la lista cerrada de iconos de la Fase 4 (§17.3), con exactamente este significado en el panel de alertas. El admin lo aprende una vez.
- La señal aparece en **cualquier** bloque, no solo en `Atrasados`. Un aseo de hoy con la hora límite vencida a las 11:30 es igual de tarde, y hasta hoy la fila no lo decía. Dentro de `Atrasados` es redundante por construcción y **se muestra igual**: una fila que cambia de vocabulario según el bloque en que vive es una fila que hay que aprender dos veces.

### 12.6 Y en el panel de alertas: nada cambia

Pregunta explícita del encargo: ¿una alerta `hora_limite_vencida` de un día anterior necesita distinguirse visualmente de una del mismo día?

**No, y meterle una distinción sería un defecto.** Tres razones:

1. **La información ya está y es más precisa que un color.** El tiempo relativo de la línea 1 (`04-UI-SPEC` §11.3) dice `hace 2 días` contra `hace 40 min`. Es un dato exacto, no una categoría.
2. **El instante de orden ya lo resuelve.** Para `hora_limite_vencida` el instante cronológico es `scheduled_date + hora_limite`, o sea el momento en que venció. Una de anteayer cae naturalmente más abajo en el orden descendente. El orden **es** la distinción.
3. **El criterio 4 de la Fase 4 prohíbe jerarquía visual dentro del panel**, y aunque su letra habla de jerarquía *entre tipos*, su espíritu es que ninguna alerta grite más que otra. Pintar de otro color las viejas es exactamente eso.

**Sí cambia el copy**, y ahí es donde vive la diferencia. El `title` de una `hora_limite_vencida` computada se interpola con la fecha:

| Caso | Título |
|---|---|
| Vencida hoy | `Se venció la hora límite de las {HH:mm} y el aseo sigue sin terminar.` |
| Vencida en un día anterior | `Se venció la hora límite del {DD de mes} y el aseo sigue sin terminar.` |

Un solo cambio, en la función que compone la alerta computada. Cero cambios visuales.

---

## 13. El permiso del admin (NOTIF-02, criterio 3)

El criterio 3 exige que **el admin** reciba push. Para eso el admin también tiene que conceder permiso y suscribirse, y eso necesita superficie.

### 13.1 Es deliberadamente más liviana que la del aseador

| | Aseador | Admin |
|---|---|---|
| Persistencia | **Persistente** (PWA-03 lo exige literal) | Descartable por sesión |
| Superficie | Banner de card, 6 estados | Franja de una línea, 3 estados |
| Instalación previa | Obligatoria (iOS no da push en pestaña) | **Ninguna**: en escritorio el push funciona en pestaña normal |
| Si no lo activa | Se pierde trabajo | Sigue teniendo el panel de alertas y el tiempo real |

La asimetría es la correcta y está anclada en el requisito: PWA-03 dice *"Si el **aseador** no tiene push activo…"*. Para el admin, push es una comodidad; para el aseador es el canal.

### 13.2 La franja

Va en `/operacion`, **debajo de la cabecera de página** (`Operación` + marca de actualización + `Crear aseo`), encima de la franja de carga. Ancho completo del contenedor, alto `--spacing-fila` (40px), fondo `--surface-warn`, radio 6px, `px-md`, `gap-md`, `text-body` (14/400).

| Estado | Contenido |
|---|---|
| `default` | `Bell` 16px `--status-warn` · `Activa los avisos en este computador para enterarte de los reportes de campo.` · `Activar` (`variant="outline"` 32px) · `X` de descarte (32px de área, `aria-label="Ocultar"`) |
| `denied` | `BellOff` 16px `--status-warn` · `Los avisos están bloqueados en este navegador. Ábrelos desde el candado de la barra de direcciones.` · sin botón de activar · `X` de descarte |
| `granted` + suscrito | **la franja no se renderiza** |

- El descarte vive en memoria del cliente y dura la sesión de la pestaña. No es `localStorage`: si el admin cierra y vuelve mañana, la franja vuelve. Es una comodidad, no una alarma, pero tampoco desaparece para siempre.
- **No es sticky, no es modal, no empuja el layout del carril lateral.** Aparece encima de la franja de carga y el carril lateral sigue con su presupuesto de altura cerrado (`04-UI-SPEC` §6.2), porque el carril es `sticky top: var(--spacing-barra)` y la franja va dentro del flujo del carril ancho.
- Mismas tres reglas de §7.3: `requestPermission()` dentro del `onClick`, `subscribe()` en el mismo handler, y nada en montaje.
- **No hay paso de prueba para el admin.** D-02 exige la verificación para el aseador, cuyo canal es único. El admin verifica solo con el primer reporte real, y si falla, tiene el panel.

---

## 14. Manifest, iconos y `apple-touch-icon` (PWA-02)

### 14.1 Manifest

`app/manifest.ts` (`MetadataRoute.Manifest`). Los valores que este contrato fija:

| Clave | Valor | Razón |
|---|---|---|
| `name` | `VivaGuest` | — |
| `short_name` | `VivaGuest` | 9 caracteres. El corte de la pantalla de inicio de iOS ronda los 12; cabe sin elipsis |
| `description` | `Tus aseos asignados, en el teléfono.` | Se muestra en el prompt de instalación de Android. **No promete checklist ni fotos**, que son Fase 6 |
| `id` | `/` | Identidad estable de la app. Sin él, cambiar `start_url` en el futuro crea una instalación duplicada en Android |
| `start_url` | `/` | La raíz rutea por rol. Un admin también puede instalarla |
| `scope` | `/` | — |
| `display` | **`standalone`** | **Requisito duro de iOS para push.** MDN BCD: *"The app's manifest must have a non-default display value."* Con `browser` no hay `Notification` y toda la fase se cae |
| `background_color` | `#FFFFFF` | `--background`. Es lo que pinta la pantalla de arranque |
| `theme_color` | `#FFFFFF` | Tiñe la barra de estado en Android. La app es solo clara y su barra superior es `--background`; un `#000000` daría una banda negra que no existe en ninguna pantalla |
| `lang` | `es-CO` | — |
| `dir` | `ltr` | — |
| `categories` | `['productivity', 'business']` | — |
| `orientation` | **no se declara** | Bloquear a `portrait` no aporta nada y le quita al aseador la opción de apoyar el teléfono de lado |

### 14.2 Los iconos — hay un prerequisito humano, con salida

**El repo no tiene ningún asset de marca.** `02-UI-SPEC` §4 registra que existen `vivaguest-logo-rojo.svg` y `vivaguest-logo-blanco.svg` recuperados del sitio de 2018 (web.archive.org, snapshot 2018-08-22), pero **no están en el repositorio**: verificado el 2026-09-10, no hay `public/` ni ningún `.svg`.

| Archivo | Tamaño | Reglas |
|---|---|---|
| `public/icon-192.png` | 192×192 | Tile lleno, sin transparencia |
| `public/icon-512.png` | 512×512 | Igual |
| `public/icon-maskable-512.png` | 512×512, `purpose: 'maskable'` | La marca entera dentro del **círculo central de 410px** (zona segura del 80%). Fuera de ahí, Android recorta |
| `public/apple-touch-icon.png` | 180×180 | **Sin transparencia y sin esquinas redondeadas.** iOS aplica su propia máscara; un icono pre-redondeado sale con doble redondeo |
| `public/badge-72.png` | 72×72 | **Monocromo, silueta sólida sobre transparente.** Android lo pinta como máscara en la barra de estado; un icono a color sale como un cuadrado gris |

**Diseño del tile:** fondo sólido `--brand-identity` **#ff7469** (coral 2018), marca en blanco centrada. Es exactamente el uso que `02-UI-SPEC` §4 autoriza para ese token (*"logo y áreas grandes; nunca texto ni relleno de control"*). Un tile de color es mucho más rápido de encontrar entre 40 iconos que uno blanco con marca roja.

**Fallback definido, para que esto no bloquee la fase:** si los SVG de 2018 no aparecen a tiempo, se generan los cinco archivos desde un SVG propio: tile coral #ff7469 con las letras **`VG`** en **Poppins 600** (`--font-brand`, ya cargada) en blanco, centradas, ocupando el 55% del ancho. Blanco sobre #ff7469 da **2.64:1**, por debajo de AA — y aquí **está bien**: es un logotipo, y WCAG 1.4.3 exime explícitamente al texto que forma parte de un logotipo. Queda anotado para que el auditor no lo reporte como hallazgo.

**Y en `app/layout.tsx` raíz:** `<link rel="apple-touch-icon" href="/apple-touch-icon.png" />`. iOS 16.4+ ya lee los iconos del manifest, pero el `apple-touch-icon` sigue siendo el camino más predecible.

---

## 15. Estados vacíos, de carga y de error

### 15.1 Vacíos

| Superficie | Copy |
|---|---|
| `/mis-aseos` sin aseos (sigue siendo stub en esta fase) | `Todavía no tienes aseos asignados.` / `Cuando te asignen uno, te va a llegar un aviso al teléfono.` **Se actualiza el copy del stub**: hoy dice `La aplicación del aseador llega en una fase siguiente.` y a partir de esta fase el aviso sí llega |
| `/aseos/[id]` con id inexistente, cancelado o de otra persona | `Este aseo ya no está disponible.` / `Puede que lo hayan cancelado o reasignado. Vuelve a Mis aseos.` + botón `Ir a mis aseos` |
| `/aseadores`, columna `AVISOS`, aseador inactivo | `—` |
| `Atrasados` vacío | El bloque no se renderiza (§12.3) |
| Franja de carga sin aseadores sin avisos y sin aseos hoy | La franja no se renderiza (§11.2) |

### 15.2 Carga

- `/aseos/[id]` es un RSC: la carga inicial la resuelve el servidor. El `loading.tsx` es un `Skeleton` con la forma exacta de la card (§9.2): título, tres filas de pares, bloque de botón. **Prohibido un spinner centrado a pantalla completa**, que no dice nada sobre lo que va a aparecer.
- El botón `Ver el código de acceso` en vuelo: `disabled` + `Loader2` 20px + texto `Abriendo…`.
- El envío del aviso de prueba: §8.6, estado *esperando*.
- El banner **no** tiene estado de carga propio. Mientras `estadoDeAvisos()` no sepa (primer render del cliente), **no se renderiza nada**. Un banner que aparece medio segundo después de cargar y a veces se cae solo es peor que un banner que aparece un poco tarde.

### 15.3 Errores

Heredan `02-UI-SPEC` §9.4 y `04-UI-SPEC` §15.3. Los nuevos de esta fase:

| Situación | Copy | Dónde |
|---|---|---|
| `requestPermission()` devuelve `denied` en el acto | El banner cambia a S3 (§7.4). **Sin toast.** El banner es la superficie de estado; un toast encima duplicaría | Banner |
| `subscribe()` falla con el permiso ya concedido | `No se pudo conectar este teléfono.` / `Vuelve a intentarlo. Si sigue sin funcionar, avísale a tu administrador.` | Banner S4 |
| El registro de la suscripción en el servidor falla | Igual que el anterior: el estado del cliente es "granted sin suscripción registrada", que es S4 por definición | Banner S4 |
| `reveal_access_code()` falla | `Alert` destructivo con el mensaje de `mapDbError()` (que en `P0001` lee el **`hint`**) + `Reintentar` | §9.3 |
| Sin conexión al revelar el código | `Sin conexión. El código no se puede mostrar ahora.` / `Conéctate y vuelve a tocar.` | §9.3 |
| El aviso de prueba no llega a la tercera | §8.7 | §8.6 |
| El service worker no registra | `La app no quedó bien instalada.` / `Ciérrala y ábrela otra vez desde el icono. Si sigue igual, avísale a tu administrador.` | `/instalar`, paso 1 |

**Regla heredada y vigente:** un error dice **qué pasó** y **qué hacer**. Sin `¡Ups!`, sin `Algo salió mal`, sin disculpas, sin signos de admiración.

---

## 16. Accesibilidad

Todo lo de `02-UI-SPEC` §13 y `04-UI-SPEC` §16 sigue vigente. Lo que esta fase añade:

### 16.1 Toque

- **44px es el piso de todo control** bajo `app/(cleaner)/`, sin excepción: botones, links, el `Copiar` del código, los toggles `iPhone`/`Android`, las líneas de paso reabribles.
- **56px** para la acción primaria del banner y de cada paso del asistente (§2.2).
- **Separación mínima de 8px (`sm`) entre dos controles adyacentes.** Dos botones de 44px pegados producen toques equivocados con guantes tan seguro como un botón de 30px.

### 16.2 Contrastes, medidos

Los cuatro pares nuevos, calculados con la fórmula WCAG 2.1 el **2026-09-10**, misma rutina con la que se reprodujeron los valores de `02-UI-SPEC` §4.2:

| Par | Ratio | Mínimo |
|---|---|---|
| `--foreground` #111827 sobre `--surface-warn` #FFF8EB (cuerpo del banner) | **16.89:1** | 4.5:1 ✓ |
| `--muted-foreground` #5C6470 sobre `--surface-warn` (líneas de apoyo del banner) | **5.66:1** | 4.5:1 ✓ |
| `--foreground` sobre `--surface-ok` #ECFDF3 (paso 4 confirmado) | **16.92:1** | 4.5:1 ✓ |
| `--muted-foreground` sobre `--surface-ok` | **5.67:1** | 4.5:1 ✓ |

Los ya medidos que esta fase reutiliza sin cambio: `--status-warn` sobre `--background` 5.02:1, `--status-warn` sobre `--surface-warn` 4.75:1, `--status-ok` sobre `--surface-ok` 4.76:1, `--status-idle` sobre `--background` 7.58:1, `--muted-foreground` sobre `--background` 5.98:1.

**Excepción declarada, la única:** las letras `VG` del icono de fallback dan 2.64:1 sobre el coral. Es un logotipo y WCAG 1.4.3 lo exime (§14.2). Ningún otro par baja de AA.

### 16.3 Anuncios y semántica

- `aria-live="polite"` en: el cambio de estado del banner, el resultado de verificación de cada paso del asistente, la llegada del aviso de prueba, la revelación del código de acceso, y la confirmación de `Copiado.`
- **El código de acceso se anuncia dígito a dígito con espacios** (`4 8 2 9 1 7`). Un lector de pantalla leyendo `482917` dice "cuatrocientos ochenta y dos mil novecientos diecisiete", que es inutilizable frente a una cerradura.
- El asistente es una `<ol>` con un `<li>` por paso. El paso activo lleva `aria-current="step"`. Los futuros llevan `aria-disabled="true"` y **no son focalizables**.
- La `Progress` del asistente lleva `aria-valuenow` / `aria-valuemin` / `aria-valuemax` y un `aria-label="Progreso de la instalación"`.
- El banner es `role="region"` con `aria-label="Estado de los avisos"`, y **no roba el foco** al montar ni al cambiar de estado.
- Los iconos que acompañan texto llevan `aria-hidden="true"`. Los que van solos (`BellOff` del chip de carga, `Hourglass` de la fila) llevan `aria-label`.
- Foco: anillo de 2px `--primary` con `outline-offset: 2px`. En `(cleaner)`, con fondos claros, se mantiene igual.
- Las capturas llevan `alt` que **repite la instrucción en palabras** (§8.4). No `alt=""`, no `alt="captura"`.
- Tamaño de icono estándar en `(cleaner)`: **20px** (contra los 16px de `(admin)`), `strokeWidth={2}`. En celdas de tabla de `(admin)` sigue siendo 14px.

### 16.4 Movimiento

Heredado sin cambios de `02-UI-SPEC` §6.4: solo `color`, `background-color`, `border-color` y `opacity`, 120ms, `ease-out`, sin animaciones de layout, sin `transition: all`.

- **El cambio de paso del asistente no se anima.** El paso que colapsa y el que se expande cambian de altura, que es layout.
- `Loader2` del estado *esperando* sigue girando con `prefers-reduced-motion: reduce`: es información de estado, no decoración. Excepción ya declarada en la Fase 2.

---

## 17. Inventario de componentes

### 17.1 shadcn oficial

Las **24 primitivas ya instaladas**, sin añadir ninguna (§1.1). Las que esta fase usa: `alert` · `button` · `card` · `progress` · `separator` · `sonner` · `table` · `tooltip`.

Sigue prohibido crear un átomo que solo re-exporte un componente de shadcn.

### 17.2 Organismos nuevos

`app/(cleaner)/_components/` — hoy vacío, esta fase lo estrena:

| Componente | Responsabilidad | REQ |
|---|---|---|
| `BannerAvisos` | Banner persistente, los 6 estados de §5.1 | PWA-03 |
| `BotonActivarAvisos` | `requestPermission()` + `subscribe()` **en el mismo handler de click** | PWA-03, NOTIF-01 |
| `AsistenteInstalacion` | Los 4 pasos, el progreso, cuál está activo | PWA-02, D-02 |
| `PasoInstalacion` | Un paso: número/check, título, instrucciones, capturas, acción, estado | PWA-02 |
| `PruebaDeAviso` | Paso 4: envío, espera, llegó / no llegó, los dos grados, límite de 3 | **D-02** |
| `InstruccionesPorPlataforma` | Elige el juego de pasos y los toggles `iPhone`/`Android` | PWA-02 |
| `TarjetaAseo` | Ficha de solo lectura del aseo de aterrizaje | NOTIF-01, criterio 2 |
| `CodigoDeAcceso` | Revelar, mono, copiar, ventana temporal, error del RPC | criterio 2, D-06 |

`app/(admin)/_components/` y `app/(admin)/operacion/_components/`:

| Componente | Responsabilidad | REQ |
|---|---|---|
| `EstadoAvisosAseador` | Icono + etiqueta desde `estadoDeAvisosDeAseador()`, los 3 casos | D-03, criterio 6 |
| `AvisoAseadorSinPush` | La línea inline de advertencia. **Una sola**, reusada en `SheetConfirmar` y `DialogoReasignar` | D-03, criterio 6 |
| `TiraAvisosAdmin` | Franja de 40px de permiso del admin, 3 estados | criterio 3 |

### 17.3 Componentes que se modifican

| Componente | Cambio | § |
|---|---|---|
| `app/(cleaner)/layout.tsx` | Monta `BannerAvisos` como primer hijo de `<main>` | §7 |
| `app/(cleaner)/mis-aseos/page.tsx` | Cambia el copy del stub: los avisos ya llegan | §15.1 |
| `TablaAseadores` | Columna `AVISOS` entre `TELÉFONO` y `RESPONSABLE DE` | §11.1 |
| `MenuAseador` | Ítem `Copiar el link de instalación` | §11.1 |
| `FranjaCarga` | `BellOff` dentro del chip + condición de render ampliada | §11.2 |
| `SheetConfirmar` | `AvisoAseadorSinPush` en el bloque de contexto + toasts con sufijo | §11.3 |
| `DialogoReasignar` | `AvisoAseadorSinPush` bajo el `Select` + toast | §11.3 |
| `BloqueDia` / `TablaDia` | Bloque `Atrasados`, primero y expandido, agrupado por día | §12 |
| `FilaAseo` | Tercera señal inline: `Hourglass` de hora límite vencida | §12.5 |
| `app/layout.tsx` | `<link rel="apple-touch-icon">` | §14.2 |
| `app/globals.css` | Tokens de §2.1 y §3.1 | §2, §3 |
| `lib/utils.ts` (`cn()`) | **`max-w-captura` y `max-w-codigo` al grupo `max-w`** | §2.1 |

> ⚠️ La última fila **no es opcional**. Sin registrar los dos anchos nuevos en `extendTailwindMerge`, un override en el sitio de uso no desplaza al de la primitiva y el ancho depende del orden del CSS. Es el defecto que costó dos quicks (`260907-703` y `260908-7w0`).

### 17.4 Lógica de dominio, fuera de los componentes y con tests

| Módulo | Contenido |
|---|---|
| `lib/domain/avisos.ts` | `estadoDeAvisos()` (6 casos, §5.1) y `estadoDeAvisosDeAseador()` (3 casos, §5.2). **Discriminantes tipados**, mismo patrón que `estadoDeApartamento()` y `estadoDeAseo()` |
| `lib/push/plataforma.ts` | Detección de instalada, de navegador embebido y de soporte, **por feature detect**, no por user agent, salvo donde no haya alternativa |
| `hooks/usarEstadoDeAvisos.ts` | Cliente. Lee `Notification.permission`, `display-mode` y `getSubscription()`. Recalcula en `visibilitychange` |
| `lib/domain/alertas.ts` | **Se modifica**: el `title` de `hora_limite_vencida` se interpola con la fecha cuando el aseo es de un día anterior (§12.6) |

### 17.5 Iconos lucide — lista cerrada

**Nuevos en esta fase (7):**
`Bell` · `BellRing` · `BellOff` · `Smartphone` · `CircleAlert` · `KeyRound` · `Send`

**Reusados de las listas cerradas de las Fases 2 y 4:**
`Check` · `CircleCheck` · `TriangleAlert` · `Hourglass` · `Copy` · `Loader2` · `X` · `ChevronRight` · `ExternalLink`

Añadir un icono fuera de estas listas es una modificación de este contrato.

> **Verificación obligatoria antes de escribir código:** `node_modules/` no está instalado en el checkout, así que los siete nombres nuevos **no se pudieron comprobar contra el paquete**. Se declaran contra `lucide-react@1.39.0` (pin de `package.json`). Primera tarea del executor: `npm i` y confirmar los siete exports. El de mayor riesgo es `KeyRound`; alternativa equivalente si no existe: `Key`.

---

## 18. Contrato de copywriting

Español de Colombia, trato de "tú", imperativo. **Prohibido el voseo.** Sin signos de admiración, sin `¡Ups!`, sin `Algo salió mal`, sin disculpas. Un error dice **qué pasó** y **qué hacer**.

Y una regla propia de esta fase, que sale de tener 8 usuarias reales en operación: **el copy del árbol del aseador se escribe para leerse de pie, con una mano, sin contexto previo.** Frases cortas, verbo primero, cero jerga técnica. Está prohibido decir `PWA`, `service worker`, `suscripción`, `push`, `notificación del sistema` o `permiso del navegador` en cualquier texto que vea un aseador.

### 18.1 Elementos

| Elemento | Copy |
|---|---|
| **CTA primaria — banner S2** | `Activar los avisos` |
| CTA secundaria — banner S2 | `Ahora no` |
| CTA — banner S1 | `Ver cómo se instala` |
| CTA — banner S3 | `Ver los pasos` |
| CTA — banner S4 | `Reconectar los avisos` |
| CTA — banner S0 (navegador embebido) | `Cómo abrirlo en Safari` |
| **CTA primaria — `/instalar`, paso 3** | `Activar los avisos` |
| **CTA primaria — `/instalar`, paso 4** | `Enviar aviso de prueba` → tras fallo: `Enviar de nuevo` |
| CTA secundaria — paso 4 | `Ya sonó, no alcancé a tocarlo` |
| CTA — cierre del asistente | `Ir a mis aseos` |
| CTA — Android, paso 1 con prompt | `Instalar la app` |
| **CTA primaria — `/aseos/[id]`** | `Ver el código de acceso` |
| CTA secundaria — código revelado | `Copiar` |
| CTA — franja del admin | `Activar` |
| Ítem de menú — `/aseadores` | `Copiar el link de instalación` |
| Título banner S1 | `Instala VivaGuest en tu teléfono` |
| Título banner S2 | `Activa los avisos de aseo` |
| Título banner S3 | `Los avisos están bloqueados en este teléfono` |
| Título banner S4 | `Los avisos dejaron de funcionar` |
| Cuerpo banner S2 | `Te avisamos apenas te asignen un aseo. Sin esto no te enteras.` |
| Cuerpo banner S3 iOS | `En iPhone la única forma de volver a activarlos es borrar el icono de VivaGuest de la pantalla de inicio y volver a instalarlo. No pierdes nada: tus aseos siguen en el sistema.` |
| Apoyo banner S3 iOS | `Mientras tanto, avísale a tu administrador para que te escriba cuando tengas un aseo.` |
| Cuerpo banner S3 Android | `Ábrelos desde los ajustes del teléfono: Ajustes → Aplicaciones → VivaGuest → Notificaciones, y actívalas.` |
| Advertencia iOS, paso 3 | `El teléfono te lo pregunta una sola vez. Toca "Permitir".` |
| Encabezado paso 4 | `Te mandamos un aviso de prueba a este teléfono. La instalación no está lista hasta que llegue.` |
| Paso 4 esperando | `Enviado. Espera a que suene el teléfono…` / `Puede tardar unos segundos. Si no llega en un minuto, vuelve a enviarlo.` |
| Paso 4 llegó | `Llegó. Este teléfono ya recibe los avisos.` |
| Paso 4 no llegó | `No ha llegado.` / `Vuelve a enviarlo. Si a la tercera no llega, este teléfono no puede recibir avisos: avísale a tu administrador.` |
| Paso 4 agotado | `Este teléfono no está recibiendo avisos.` / `Probamos 3 veces y no llegó ninguno. Avísale a tu administrador: puede ser el teléfono, la versión del sistema o la conexión.` |
| Cierre del asistente | `Listo.` / `Este teléfono ya recibe los aseos. Cuando te asignen uno, te va a sonar.` |
| Nota de confirmación a mano | `Quedó confirmado a mano. Tu administrador va a ver que la prueba no se comprobó tocando el aviso.` |
| Aviso de auditoría del código | `Cada vez que lo abres queda registrado.` |
| Código fuera de ventana | `El código se puede ver el día del aseo y el día antes.` |
| Pie de `/aseos/[id]` | `Marcar el aseo como empezado y subir las fotos llega en la próxima versión de la app.` |
| **Advertencia de asignación (D-03)** | `{Nombre} no tiene los avisos activos. Confirmar lo asigna igual, pero no le va a sonar el teléfono.` |
| Éxito: tanda con casos sin avisos | `Listo: 15 aseos confirmados. 3 quedaron con un aseador sin avisos.` |
| Éxito: tanda interrumpida con casos | `Confirmaste 3 de 15. Los demás siguen en la bandeja. 1 quedó con un aseador sin avisos.` |
| Éxito: reasignar a alguien sin avisos | `El aseo quedó asignado a {nombre}. No tiene los avisos activos: avísale tú.` |
| Éxito: link copiado | `Link copiado. Mándaselo por donde ya te hablas con {nombre}.` |
| Éxito: código copiado | `Copiado.` |
| Cabecera `Atrasados` | `Atrasados` · `{N} aseos · el más viejo del {fecha}` |
| Corte de la ventana de `Atrasados` | `Hay {N} aseos sin cerrar de antes del {fecha}. Ábrelos desde la ficha de su apartamento.` |
| Alerta hora límite vencida, día anterior | `Se venció la hora límite del {DD de mes} y el aseo sigue sin terminar.` |
| Alerta hora límite vencida, hoy | `Se venció la hora límite de las {HH:mm} y el aseo sigue sin terminar.` |
| Franja del admin, `default` | `Activa los avisos en este computador para enterarte de los reportes de campo.` |
| Franja del admin, `denied` | `Los avisos están bloqueados en este navegador. Ábrelos desde el candado de la barra de direcciones.` |
| Vacío: `/mis-aseos` | `Todavía no tienes aseos asignados.` / `Cuando te asignen uno, te va a llegar un aviso al teléfono.` |
| Vacío: `/aseos/[id]` inválido | `Este aseo ya no está disponible.` / `Puede que lo hayan cancelado o reasignado. Vuelve a Mis aseos.` |
| Error: `subscribe()` falla | `No se pudo conectar este teléfono.` / `Vuelve a intentarlo. Si sigue sin funcionar, avísale a tu administrador.` |
| Error: sin conexión al revelar | `Sin conexión. El código no se puede mostrar ahora.` / `Conéctate y vuelve a tocar.` |
| Error: service worker no registra | `La app no quedó bien instalada.` / `Ciérrala y ábrela otra vez desde el icono. Si sigue igual, avísale a tu administrador.` |
| Anuncio (aria-live) del código | El código dictado dígito a dígito, con espacios |

### 18.2 Acciones destructivas

**Esta fase no tiene ninguna.** Ni borra, ni revoca, ni cancela nada que el usuario haya creado.

Los dos casos que se le podrían parecer, y por qué no lo son:

| Caso | Por qué no es destructivo |
|---|---|
| NOTIF-04: el sistema elimina suscripciones que el navegador reporta como expiradas o revocadas | Es automático, del servidor, sin superficie de usuario. Su consecuencia visible es que el aseador ve el banner S4 y toca `Reconectar`. **No hay diálogo de confirmación porque no hay acción de usuario que confirmar** |
| Volver a instalar en iOS tras negar el permiso (§8.5, `?volver=1`) | El aseador borra un icono de **su** pantalla de inicio; es una acción del sistema operativo, fuera de la app. El copy `No pierdes nada. Tus aseos, tus fotos y tu historial siguen en el sistema.` existe justo para que no se lea como destructiva |

Por lo tanto: **cero `AlertDialog` en esta fase.** Si aparece uno en ejecución, algo se salió del contrato.

### 18.3 El copy de la base NO se reescribe acá

Repetido a propósito, porque es la tentación más fácil de esta fase: `notifications.title` y `notifications.body` los escriben las RPC (migraciones 09, 13, 15), D-04 prohíbe tocarlas, y el push los renderiza verbatim. Los dos defectos encontrados en ese copy están en §20.3 como deuda, **no** como tarea de esta fase.

---

## 19. Registry Safety

| Registry | Bloques usados | Safety Gate |
|---|---|---|
| shadcn oficial (`@shadcn`) | **ninguno nuevo.** Las 24 primitivas ya instaladas | no aplica — no se añade nada |
| Terceros | **ninguno** | no aplica — `components.json` tiene `"registries": {}` |

**La compuerta de vetting no se ejecutó porque no hay nada de terceros que vetar, y tampoco nada oficial que instalar.** El inventario de §1.1 se hizo superficie por superficie precisamente para poder afirmarlo: las 24 primitivas existentes cubren las diez superficies de §6.

Si en ejecución alguien decide instalar un bloque nuevo:

1. Este documento se reabre y se corre la compuerta antes (`npx shadcn view {bloque}`, buscando `fetch`, `XMLHttpRequest`, `sendBeacon`, `process.env`, `eval`, `new Function`, imports dinámicos desde URL externa y nombres ofuscados).
2. Y se aplica el arreglo de ancho: la primitiva nace con `max-w-xs` / `sm:max-w-sm`, que en este repo compilan a 4 y 8 px. `npm run ci:arch` lo atrapa nombrando archivo y línea.

**Dependencias runtime nuevas de esta fase** (`web-push@3.6.7`, `@serwist/next@9.5.12` + `serwist@9.5.12`, en las versiones exactas que fija `CLAUDE.md`) no son bloques de registry y no pasan por esta compuerta: su auditoría de legitimidad está en `05-RESEARCH.md` §"Package Legitimacy Audit".

---

## 20. Deuda declarada de este contrato

Para que `gsd-ui-auditor` no la reporte como hallazgo nuevo.

1. **El coral sigue siendo placeholder** y `--primary` / `--destructive` siguen siendo los dos rojos. Heredado de `02-UI-SPEC` §17. Esta fase no lo empeora: no usa `--destructive` en ninguna superficie nueva salvo el `Alert` de fallo del RPC del código.
2. **Sin modo oscuro, y ahora duele más.** `(cleaner)` es solo claro, y un teléfono con el sistema en oscuro va a mostrar una app blanca a las 6 de la mañana. Heredado y deliberado; queda anotado porque la Fase 6 vive entera en ese árbol.
3. **Dos defectos en el copy que ya está en la base, y que ahora se ven en pantallas de bloqueo.** Leídos de las migraciones el 2026-09-10:
   - `finish_cleaning` escribe `'Se completo el aseo de {apto}.'` — **sin tilde en "completó"**. Y su `title` es `Aseo completado`, cuando `04-UI-SPEC` §18.4 fija el término **terminado** para `state = 'completada'`.
   - `decline_cleaning` escribe `'Una aseadora no puede tomar un aseo'` — **género femenino fijo**, cuando el vocabulario del proyecto es **aseador** y el equipo no es homogéneo.

   **No se arregla en esta fase.** D-04 fija que no se toca ninguno de los RPC que escriben notificaciones, y aunque un `create or replace` que cambie solo literales es de bajo riesgo, la decisión no es del UI-SPEC. **Recomendación al planner:** si se decide arreglarlo, va en una migración propia, aditiva, de solo cadenas, con su prueba de no regresión sobre el panel de alertas de la Fase 4, que lee esos mismos campos. Y la regla de renderizado (§10.1: verbatim) no cambia en ninguno de los dos escenarios.
4. **La escala tipográfica del árbol del aseador no tiene guardarraíl de CI.** §3.1 recomienda el grep, pero lo deja como advisory. Mientras no exista, un `text-body` sin sufijo bajo `app/(cleaner)/` pasa silencioso y produce zoom automático en iOS al enfocar un campo. La Fase 6 es la que va a tener campos.
5. **Las capturas de instalación caducan.** Cuando Apple mueva el botón de Compartir o Google renombre "Instalar aplicación", las instrucciones enseñan mal y nada lo detecta. Mitigación parcial: la línea `Capturas tomadas en iOS {versión} el {fecha}` (§8.4). No hay prueba automática posible.
6. **`Sin probar` puede quedarse pegado para siempre.** Si un aseador se instala la app, concede el permiso y nunca corre el paso 4, queda en `Sin probar` indefinidamente y el admin no tiene desde la UI cómo forzarle una prueba. **Enviar una prueba desde `/aseadores` se dejó fuera a propósito** para no ampliar alcance; es candidato claro de la Fase 6 o de un quick.
7. **No hay medición de entrega, y sigue siendo el riesgo aceptado del proyecto.** `Activos` significa "hay a dónde enviar y una vez llegó", no "los avisos están llegando". El semáforo de entregabilidad (NOTIF-V2-01) está diferido a v2 desde 2026-08-31. Si el piloto de Bogotá pierde un aseo confirmado, entra.
8. **El icono de fallback (`VG` sobre coral) da 2.64:1.** Exención de logotipo de WCAG 1.4.3, declarada en §14.2. Si algún día se usa esa marca como texto de interfaz, deja de estar exenta.
9. **`Atrasados` no persiste su estado de colapso**, igual que los otros tres bloques (`04-UI-SPEC` §20.6). Cada carga lo abre. Aquí es deseado: es el bloque que no se debe poder esconder entre sesiones.
10. **El grado de confirmación de la prueba (por toque / a mano) necesita una columna donde vivir.** Este contrato lo exige visualmente (§8.6, §5.2, §11.1) pero **no diseña el schema**: eso es del planner, sobre `push_subscriptions` o donde corresponda. Si el planner decide que no cabe, la distinción `Activos` / `Sin probar` colapsa a dos estados y **§5.2 y §8.6 se reabren**, no se implementan a medias.

---

## Checker Sign-Off

- [ ] Dimensión 1 Copywriting: PASS
- [ ] Dimensión 2 Visuals: PASS
- [ ] Dimensión 3 Color: PASS
- [ ] Dimensión 4 Typography: PASS
- [ ] Dimensión 5 Spacing: PASS
- [ ] Dimensión 6 Registry Safety: PASS

**Aprobación:** pending
