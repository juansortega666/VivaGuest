---
phase: 04-dashboard-operativo-del-admin
plan: 14
subsystem: testing
tags: [playwright, e2e, tailwind, next-server-actions, supabase, gotrue]

requires:
  - phase: 04-07
    provides: la bitácora de señuelos y el arnés de siembra de dos corridas de sync
  - phase: 04-10
    provides: la bandeja y el Sheet de confirmación encadenada
  - phase: 04-11
    provides: MenuAseo y los cuatro diálogos de mutación
  - phase: 04-12
    provides: el historial del apartamento
  - phase: 04-13
    provides: el panel de alertas y la marca de frescura
provides:
  - Tres specs de Playwright que ejercen /operacion y el historial en un navegador real (20 pruebas)
  - Siembra de escenarios de operación en e2e/fixtures.ts, sin estado de módulo
  - La prueba de escala de grises con su captura como artefacto
  - Tres defectos de producto encontrados y corregidos, dos de ellos bloqueantes de fase
  - La bitácora de señuelos de la capa de interfaz, 6 de 6 atrapados
affects: [05-notificaciones-push, 06-pwa-del-aseador]

tech-stack:
  added: []
  patterns:
    - "Siembra e2e sin estado de módulo: sembrar devuelve todos los ids y limpiar borra exactamente esos"
    - "cn() con extendTailwindMerge declarando los max-w-* con nombre del proyecto"
    - "Las Server Actions de /operacion no revalidan: el refresco lo pide el cliente"

key-files:
  created:
    - e2e/operacion.spec.ts
    - e2e/operacion-alertas.spec.ts
    - e2e/historial.spec.ts
  modified:
    - e2e/fixtures.ts
    - e2e/ruteo.spec.ts
    - e2e/login.spec.ts
    - lib/utils.ts
    - eslint.config.mjs
    - supabase/seeds/070_perfiles_dev.sql
    - app/(admin)/operacion/_actions.ts
    - app/(admin)/operacion/_actions.test.ts
    - app/(admin)/operacion/_components/BloqueDia.tsx
    - app/(admin)/operacion/_components/FilaAlerta.tsx

key-decisions:
  - "Quitar revalidatePath de las nueve Server Actions de /operacion: colgaba el navegador. El refresco lo hace router.refresh() en el cliente"
  - "Arreglar cn() en vez de las primitivas de components/ui: el repo declara esas primitivas regenerables y el patrón documentado es el override en el sitio de uso"
  - "NO arreglar la colisión --spacing-*/--container-* que deja AlertDialog y Tooltip colapsados: es una decisión de sistema de diseño, queda reportada como diferido de alta prioridad"
  - "NO cerrar hora_limite_vencida fuera de la ventana de hoy: cambia la ventana que comparten las tres superficies de /operacion y es una decisión de producto"

patterns-established:
  - "Toda aserción de ausencia lleva su control: sin la mitad positiva, una negativa pasa sobre una pantalla que no renderizó nada"
  - "Las alertas y los daños que ninguna migración produce se siembran a mano Y el nombre del spec lo dice"
  - "La geometría se afirma con boundingBox cuando el DOM correcto no basta"

requirements-completed: [ASEO-01, ASEO-02, ASEO-03, ASEO-04, ASEO-05, ASEO-06, ASEO-07, ASEO-08, ASEO-09, DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-06, DASH-07, REPORT-04]

duration: 3h 40m
completed: 2026-09-06
---

# Fase 4 Plan 14: cierre de fase en un navegador real

**Los tres specs de Playwright del cierre de fase encontraron que `/operacion` no funcionaba en producción: toda mutación dejaba el diálogo colgado para siempre y el `Sheet` de confirmación medía ocho píxeles de ancho. Los dos están corregidos y medidos; la suite pasa de 13 a 16 archivos y de 76 a 96 pruebas E2E.**

## Performance

- **Duración:** 3 h 40 m
- **Tareas:** 2 de 3 (la 3 es el checkpoint humano de abajo)
- **Archivos creados:** 3 · **modificados:** 11

## Lo que se construyó

### Los tres specs

| Archivo | Pruebas | Qué cubre |
|---|---|---|
| `e2e/operacion.spec.ts` | 9 | Aterrizaje en `/operacion`; los cinco pasos del criterio 3 encadenados sobre el mismo aseo; cancelar con `Volver`; ASEO-07 bajo el campo de fecha; el `Sheet` con quince; la fila inerte; los chips de carga; el ancla de una alerta |
| `e2e/operacion-alertas.spec.ts` | 6 | Escala de grises con los siete tipos, contador con treinta, orden cronológico, atender y devolver, las computadas sin botón, y el filtro |
| `e2e/historial.spec.ts` | 5 | Mezcla cronológica de aseos y daños, el daño resuelto, cero acciones, estado vacío, y la unidad de gestión externa |

La siembra vive en `e2e/fixtures.ts` y **no tiene estado a nivel de módulo**: con `workers: 1`
Playwright reutiliza el proceso entre archivos, así que un registro global sobreviviría de un spec al
siguiente y el `afterAll` de uno borraría lo del otro. `sembrarOperacion()` devuelve todos los ids
que creó y `limpiarOperacion()` borra exactamente esos, en orden de FK.

### La prueba de escala de grises

Lo automatizable de §16.2 son dos cosas y las dos están afirmadas: que las siete etiquetas de texto
están presentes y son distintas, y que los siete iconos comparten **el mismo color computado y el
mismo tamaño**. El señuelo 13 lo demuestra: dar `text-destructive` a `urgente` pone la segunda en
rojo con `Expected: 1 / Received: 2`. La captura queda en
`test-results/panel-alertas-escala-de-grises.png`.

---

## Los tres defectos de producto que este plan encontró

Ninguno de los tres era visible desde las suites unitaria, de integración o pgTAP. Los tres
necesitaban un navegador con el build de producción, que es exactamente lo que este plan existe para
hacer.

### 1. Toda mutación de `/operacion` colgaba el navegador — **BLOQUEANTE, corregido**

Con `revalidatePath('/operacion')` dentro de cualquiera de las nueve Server Actions: la mutación se
escribía en la base, el servidor respondía **200 con la carga útil completa en ~50 ms**, y el cliente
no la aplicaba nunca. Lo que veía el admin era el botón del diálogo en `Cancelando…` para siempre,
sin toast, sin cierre y con la fila intacta. La única salida era recargar a mano.

Acotado por bisección, con medición en cada paso:

| Descartado | Cómo |
|---|---|
| El motor | La fila queda `cancelada` en Postgres en todos los casos |
| La red | La respuesta llega entera (36 KB) y todas las filas del payload de flight están definidas y son autoconsistentes; el valor de retorno de la action viaja dentro, correcto |
| Realtime | Con el WebSocket cerrado a la fuerza, igual |
| `searchParams`, el carril lateral, `SincronizacionEnVivo`, la capa de datos | Se quitaron uno a uno; el cuelgue seguía |
| La compresión | `compress: false` no cambia nada |
| El tipo de revalidación | `revalidatePath('/operacion', 'page')` tampoco |

**El disparador es de TAMAÑO, no de contenido:** partiendo de una página mínima que funciona, añadir
UN client component más —se probó con un `<span>` trivial— la vuelve a colgar.

**Corrección:** se quitó la llamada de las nueve. Lo sustituye el `router.refresh()` que los cinco
diálogos, `MenuAseo` y `SheetConfirmar` ya llamaban desde los planes 04-10 y 04-11; `FilaAlerta` era
el único que no lo tenía y se le añadió. No se pierde nada: `(admin)/layout.tsx` es `force-dynamic`,
así que esta ruta no tiene caché de ruta completa que invalidar. La ausencia queda anclada por dos
aserciones unitarias invertidas y por una tercera sobre el archivo, que atrapa a la décima action que
alguien escriba copiando el patrón de otra pantalla.

**La causa raíz NO está identificada** y va como diferido. Antes de volver a poner `revalidatePath`
hay que reproducir el caso mínimo con la versión de Next de ese momento.

### 2. El `Sheet` de confirmación medía 8 píxeles — **BLOQUEANTE, corregido**

Medido en el navegador: `width: 8px`, `max-width: 8px`. El panel donde se confirman quince aseos
seguidos —la superficie central de ASEO-02 y de D-10— era inusable.

La causa es una colisión de espacios de nombres de Tailwind v4, y afecta a toda la aplicación:

```
max-w-sm{max-width:var(--spacing-sm)}     ->   8px   (deberían ser 384px)
max-w-xs{max-width:var(--spacing-xs)}     ->   4px   (deberían ser 320px)
```

`max-w-<nombre>` resuelve el nombre contra `--spacing-*` **antes** que contra `--container-*`, y
`02-UI-SPEC.md` §2 declara la escala de espaciado con nombres de talla. Encima, `tailwind-merge` no
clasifica `max-w-sheet` ni `max-w-dialogo` en el grupo `max-w`, así que el override del sitio de uso
—el patrón que `components/ui/sheet.tsx` documenta desde el 04-10— **no desplazaba** al `max-w-sm` de
la primitiva: sobrevivían los dos y ganaba el orden del CSS.

**Corrección:** `cn()` se construye con `extendTailwindMerge` declarando los nueve `max-w-*` con
nombre del proyecto. Con eso el `Sheet` mide sus 480px de D-09 y los `Dialog` los suyos, y el spec lo
**mide con `boundingBox()`**, no lo supone.

**Lo que sigue roto y queda reportado como diferido de ALTA prioridad:** `AlertDialog` (~32px) y
`Tooltip` (4px), que no llevan override en su sitio de uso. Se descartaron con medición dos arreglos
que parecían obvios: declarar `--container-xs/sm/md/lg` a mano en `@theme` no corrige nada, y
`@utility max-w-sm { … }` tampoco, porque Tailwind emite su propia declaración después.

### 3. El seed de perfiles dev rompía la suite E2E entera — corregido

`confirmation_token`, `recovery_token`, `email_change_token_new` y `email_change` son las únicas
cuatro columnas de texto de `auth.users` **sin DEFAULT**. El seed las omitía, GoTrue las escanea a un
`string` de Go y devolvía 500 en `GET /admin/users`. Como `e2e/global-setup.ts` pagina `listUsers()`
antes de la primera prueba, **ninguna prueba E2E podía arrancar**, con el mensaje
`Database error finding users`, que no menciona ni la tabla ni el seed.

El propio archivo declaraba que su camino de creación desde cero no se había ejercitado nunca. Se
ejercitó y salió rojo.

---

## Los tres inherited que este plan cerró

1. **`npm run lint` en rojo con 3 errores preexistentes** (desde `814e0cd`, Fase 2). Se apagó
   `react-hooks/rules-of-hooks` para `e2e/**/*.ts`: `use` ahí es el argumento de una fixture de
   Playwright, no el hook de React. De 3 errores a 0.
2. **`/operacion` es la raíz del admin, no `/apartamentos`.** `ruteo.spec.ts` y `login.spec.ts`
   afirmaban la ruta vieja; actualizados los cuatro tests.
3. **El clic de una alerta no expandía el día colapsado.** `BloqueDia` monta ahora
   `useAnclaDeAlerta()`. Lleva **tres** disparadores y no uno, y la razón está medida: el caso
   mayoritario —el admin ya está en `/operacion` y pulsa una alerta— **no emite `hashchange`**,
   porque el `<Link>` del App Router resuelve una navegación de solo-hash con `history.pushState`.
   Los tres son el montaje, `hashchange` y el clic en fase de captura.

## ⚠️ Lo que este plan NO cerró, y hay que decirlo en voz alta

**`hora_limite_vencida` sigue sin computarse para los aseos anteriores a hoy.** Es el diferido que el
plan 04-13 dejó abierto y **toca el Core Value**: «que ningún aseo se pierda».

`alertasComputadas()` deliberadamente NO acota por fecha el vencimiento —su comentario dice que un
aseo de anteayer sin terminar es justo el que no se puede perder— pero su entrada son las filas de
`leerOperacion()`, cuya ventana arranca en `hoyBog()`. **Un aseo de ayer con la hora límite pasada y
sin terminar no produce alerta.** El caso mayoritario (un aseo de HOY vencido) sí funciona, y está
cubierto por `e2e/operacion-alertas.spec.ts`.

No se cerró porque las dos salidas son decisiones de alcance, no correcciones:

- Ampliar el límite inferior de `leerOperacion()` cambia la ventana que comparten las **tres**
  superficies de `/operacion` (los días, la bandeja y los chips de carga), y metería aseos vencidos
  dentro del bloque `Hoy`. Es un cambio de comportamiento del carril ancho, no del panel.
- Una consulta propia del panel añade un cuarto viaje a `cleanings` en cada carga.

**Candidato natural:** la Fase 5, que es la que drena la cola de `notifications` y puede escribir el
tipo `hora_limite_vencida` de verdad — hoy **ninguna migración lo escribe**.

---

## Verificación automática de la Task 3

Las diez comprobaciones, en el orden del plan, sobre el checkout principal el 2026-09-06:

| Comprobación | Resultado | Línea base | Veredicto |
|---|---|---|---|
| `npm run db:reset` | OK | — | — |
| `npm run db:test` | `Files=7, Tests=153, Result: PASS` | 112 aserciones / 153 | **igual** |
| `npm run test:unit` | `31 archivos, 568 pruebas` | 392 / 567 | **+1** |
| `npm run test:integration` | `16 archivos, 145 pruebas` | 105 / 145 | **igual** |
| `npx tsc --noEmit` | OK | — | — |
| `npm run ci:arch` | `check-service-role: OK` | 10 guardarraíles | **igual** |
| `npm run db:types:check` | sin diferencias | — | — |
| `npm run lint` | **0 errores**, 2 warnings | 3 errores | **mejora** |
| `npm run build` | `✓ Compiled successfully` | — | — |
| `npm run test:e2e` | **96 pruebas en 16 archivos** | 13 archivos / 76 | **+3 archivos, +20 pruebas** |

**Ningún conteo por debajo de la línea base.**

### Las tres reglas transversales, verificadas con grep

| Regla | Resultado |
|---|---|
| `dangerouslySetInnerHTML` no aparece en `app/` | **cero en código.** La única ocurrencia está en un comentario de `HistorialApartamento.tsx` que explica por qué no se usa (T-04-10 cerrado para toda la fase) |
| `createAdminClient` no aparece en `app/(admin)/operacion/` ni en `lib/data/` | **cero en código.** La única ocurrencia es la aserción de `_actions.test.ts` que comprueba su ausencia (T-04-06) |
| Ningún archivo con sufijo numérico volvió al checkout | **uno:** `.env 2.example`, ignorado por git y sin ningún lector. Reportado como diferido; es del usuario |

### Señuelos

Seis corridos en este plan, **6 de 6 atrapados**. Con los once de la capa de base de datos del plan
04-07, la fase va en **17 de 17**; el acumulado del proyecto, en **65 de 66**. El detalle, con el
mensaje exacto de cada aserción roja, está en `senuelos-04.md`.

---

# ✋ CHECKPOINT HUMANO — las tres verificaciones perceptuales

Todo lo automatizable está en verde. Lo que queda son tres cosas que un test **no** puede medir,
porque son de percepción de conjunto y no de atributos. Están declaradas como manuales en
`04-VALIDATION.md` desde antes de escribir el código.

## Antes de empezar

El stack tiene que estar arriba y la aplicación construida:

```
npx supabase status          # los 12 contenedores
npm run build && npm run start
```

Y hay que **sembrar el escenario**, porque la base está limpia. La forma más corta es dejar que lo
haga la propia suite y quedarse con lo sembrado:

```
npm run test:e2e -- e2e/operacion-alertas.spec.ts -g "treinta"
```

Ese comando deja treinta alertas del escenario en la base. **Ojo:** su `afterAll` limpia al
terminar, así que para mirarlas con calma hay que sembrarlas a mano con el mismo helper, o repetir el
comando y abrir la pantalla mientras corre. Si prefieres sembrar sin correr tests, el arnés está en
`e2e/fixtures.ts` (`sembrarOperacion`, `sembrarAlertas`, `sembrarAseos`).

---

## 1. Que treinta alertas de siete tipos se lean sin que ninguna salte

**Requisito:** DASH-04, criterio 4 del ROADMAP.

1. Abre `http://127.0.0.1:3000/operacion` con sesión de admin.
2. Mira **solo** el panel lateral inferior, el que dice `Alertas` con el contador.
3. Abre también, al lado, la captura que dejó el spec:
   `test-results/panel-alertas-escala-de-grises.png`.

**Qué hay que confirmar:** que al recorrer el panel de arriba abajo **ningún tipo salta antes que
otro**. Si el ojo va primero a uno de los siete, algo está cargando jerarquía.

**Qué contaría como fallo:**
- Un tipo que se lea antes que los demás por color, peso, tamaño o fondo.
- Que en la captura en grises dos tipos se vuelvan indistinguibles entre sí.
- Que la captura en grises deje de ser legible.

**Y una pregunta aparte, que no es un fallo sino una decisión:** ¿el panel es legible con esa
densidad, o 64 px por fila se siente apretado?

---

## 2. Que la fila inerte lea «esto no lo tocas» y no «esto está roto»

**Requisito:** DASH-07, D-20.

1. Siembra un día con al menos una unidad de `gestion_vivaguest = false` junto a aseos normales. Lo
   deja hecho `npm run test:e2e -- e2e/operacion.spec.ts -g "gestión externa"`.
2. Abre `/operacion` y mira el bloque `Hoy`.
3. Localiza la fila de la unidad externa: la que dice `Gestión externa` en la columna de estado.

**Qué hay que confirmar:** que al ver esa fila **sin hora límite, sin huéspedes, sin aseador y sin
menú de tres puntos**, tu primera lectura NO es «acá está fallando algo».

La línea al pie del día es lo que debería evitarlo:

> Las unidades de gestión externa aparecen para que el día quede completo. VivaGuest no las opera.

**Dinos si funciona o si la fila igual se lee como un error.** Si se lee como error, la salida NO es
pintarla gris (eso la haría leer como deshabilitada por fallo) ni sacarla a otra vista (eso rompería
el panorama del día): habría que trabajar el copy o la posición de esa línea.

---

## 3. Que quince confirmaciones seguidas no cansen

**Requisito:** ASEO-02, D-10. **Es fricción acumulada, no un estado: hay que hacer los quince, no
tres.**

1. Siembra quince sin confirmar: `npm run test:e2e -- e2e/operacion.spec.ts -g "quince"` los deja
   creados (aunque el test confirma tres y limpia al final; para el recorrido completo conviene
   sembrarlos a mano con `sembrarAseos()`).
2. En `/operacion`, pulsa el botón rojo `Confirmar 15 aseos` de la bandeja.
3. Recórrelos **completos**, escribiendo el número de huéspedes en cada uno y pulsando
   `Confirmar y seguir` hasta llegar al quince.

**Qué hay que confirmar:**
- Que el foco cae **solo** en el campo de huéspedes en cada paso, sin tocar el ratón ni el tabulador.
- Que la barra de progreso y el `N de 15` te dicen dónde vas en todo momento.
- Que llegar al quince no se siente como pelear con la herramienta.

**Qué contaría como fallo:** tener que buscar el campo con el ratón, perder de vista cuántos faltan,
o que el panel salte o cambie de tamaño entre uno y otro.

---

**Responde «aprobado», o describe qué falló en cada uno de los tres puntos.**
