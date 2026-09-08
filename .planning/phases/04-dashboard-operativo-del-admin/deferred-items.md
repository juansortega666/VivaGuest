# Diferidos de la Fase 4

Hallazgos fuera del alcance del plan que los encontró. No se arreglan ahí: la regla del proyecto es
que solo se auto-corrige lo que causó el cambio en curso, y estos son anteriores.

## 1. ~~`npm run lint` sale en rojo con 3 errores preexistentes~~ RESUELTO 2026-09-06

**Encontrado por los planes 04-01 y 04-04 por separado, el 2026-09-03.** El 04-01 lo midió sobre el
árbol limpio **antes de escribir una línea**, así que la preexistencia está probada, no supuesta.
**Origen:** commit `814e0cd` (`feat(02-06)`), Fase 2.

```
e2e/fixtures.ts:104:11  error  React Hook "use" is called in function "paginaAdmin"
e2e/fixtures.ts:110:11  error  React Hook "use" is called in function "paginaAseador"
e2e/fixtures.ts:116:11  error  React Hook "use" is called in function "paginaAseador2"
                               react-hooks/rules-of-hooks

lib/domain/aseador.schema.test.ts:40:20  warning  '_phone' asignado y nunca usado
```

Los tres son un **falso positivo**: `use` es el nombre del argumento de una fixture de Playwright
(`async ({ page }, use) => …`), no el hook `use` de React. `react-hooks/rules-of-hooks` lo reconoce
por el nombre.

**Arreglo:** excluir `e2e/` de esa regla en `eslint.config.mjs`, o renombrar el parámetro. No tocar
el código de las fixtures.

**Por qué no se arregla desde donde se encontró:** `lint` no está en la verificación de ningún plan
de la Fase 4 ni en `ci/db.yml`, así que hoy no bloquea nada. Y cambiar la configuración de ESLint
desde un plan de base de datos es exactamente el cambio que nadie espera encontrar en un diff de
Wave 0.

**A quién le toca:** al primer plan de la Fase 4 que toque `e2e/`, que por el grafo es el 04-14.
Conviene cerrarlo antes de que alguien meta `lint` a CI y descubra que el repo entero está rojo por
tres líneas de fixtures.

**Cerrado el 2026-09-06 por el plan 04-14**, commit `2076f9f`. Se apagó
`react-hooks/rules-of-hooks` para `e2e/**/*.ts` en `eslint.config.mjs`, con el alcance más estrecho
posible: solo esa regla y solo ese directorio. `npm run lint` pasa de 3 errores a 0. Quedan 2
warnings de variables sin usar en tests, que no rompen nada y son de otros planes.

## 2. ~~El checkout principal sigue con ~140 archivos duplicados de iCloud~~ RESUELTO 2026-09-04

No es un diferido del código, es una tarea del usuario.

El worktree de cada ejecutor **nace limpio**, porque los duplicados están untracked y un worktree
hace checkout solo de lo trackeado. La guarda del plan 04-01 pasó ahí por esa razón. Pero
`/Users/juanortega/Documents/VivaGuest` sigue sucio, y `npm run db:reset` sobre el checkout
principal seguirá fallando por migraciones duplicadas hasta que se corra:

```
git clean -fd -e "ci/README.md" -e "supabase/snippets" -e ".claude/worktrees"
```

Importa antes de la verificación de fase, que sí corre en el checkout principal. Causa raíz en
`.planning/phases/03-motor-de-sincronizaci-n-ical/deferred-items.md` entrada 7: el proyecto vive en
una carpeta sincronizada y el renombrado por conflicto va a volver a duplicar.

**Cerrado el 2026-09-04.** Se borraron 139 duplicados, incluidas las 4 migraciones que rompían
`db:reset`. El checkout quedó con 14 migraciones y cero duplicadas. Un archivo del listado NO era
duplicado y se salvó antes de limpiar: `05-RESEARCH.md` de la Fase 5, 97 KB sin commitear, que el
`git clean` se habría llevado. **Revisar el listado antes de correr el comando, no solo contarlo.**
Sigue siendo recurrente: la carpeta sincronizada volverá a duplicar.

## 3. ~~El disco de la máquina se llena y tumba Docker~~ RESUELTO 2026-09-04

**Encontrado en el plan 04-01, que quedó bloqueado por esto.** `/System/Volumes/Data` llegó al 98%
y Docker Desktop dejó de arrancar con:

```
engine linux/virtualization-framework run error:
  write .../Data/log/vm/init.log: no space left on device
```

Con Docker caído no corren `db:reset`, `db:test` ni `test:integration`, que es la mitad de la
verificación de esta fase.

**Contribuye el propio flujo:** cada worktree de ejecutor instala su `node_modules` (~744 MB), y la
Wave 1 tuvo cuatro a la vez, casi 3 GB. Mitigación ya aplicada por el orquestador: mergear y borrar
cada worktree en cuanto su plan cierra, en vez de esperar a la wave completa.

**Referencias de tamaño medidas:** `~/Library/Containers/com.docker.docker/Data` son 11 GB.

**A quién le toca:** al usuario, y es recurrente mientras el margen siga estrecho.

**Cerrado el 2026-09-04.** El volumen bajó del 98% al 68%, con 65 GiB libres, y Docker levantó con
los 8 contenedores. Con eso se cerró la verificación pendiente del plan 04-01.

**Secuela encontrada al recuperar el stack, y no es obvia:** `npm run db:start` levanta SOLO
Postgres. GoTrue, Storage, Realtime y Edge Runtime se quedan abajo, y sin GoTrue el arnés de siembra
falla con `name resolution failed`, que parece un problema de red y no lo es. Encima, si el CLI cree
que el stack ya está arriba, `npx supabase start` NO recrea los contenedores que falten: devuelve OK
y los deja parados. La salida es `npx supabase stop && npx supabase start`.

---

## `npm run lint` falla en `e2e/fixtures.ts`, y es preexistente

**Encontrado durante:** plan 04-10, cuya Task 3 tiene `npm run lint` en su verificación.

**Qué pasa:** tres errores de `react-hooks/rules-of-hooks`, todos en el mismo archivo:

```
e2e/fixtures.ts
  104:11  error  React Hook "use" is called in function "paginaAdmin" …
  110:11  error  React Hook "use" is called in function "paginaAseador" …
  116:11  error  React Hook "use" is called in function "paginaAseador2" …
```

**Por qué es un falso positivo:** el `use` de esas líneas es el `use` de las **fixtures de
Playwright** (`async ({ browser }, use) => { … await use(page) }`), no el hook `use` de React. La
regla lo detecta por el nombre y no por su origen, y el archivo no importa nada de React.

**Por qué NO se arregla en este plan:** el archivo es de la Fase 2 (`814e0cd`, plan 02-06), no lo
toca ninguno de los tres commits de 04-10, y la regla de alcance dice que solo se auto-corrige lo que
causan los cambios del plan en curso. Tocarlo desde acá metería un cambio de configuración de lint en
un commit de UI.

**Qué haría falta:** una entrada en `eslint.config.mjs` que apague `react-hooks/rules-of-hooks` para
`e2e/**`, que es donde `use` significa otra cosa. Un `eslint-disable` por línea también sirve, pero
son tres hoy y una por fixture nueva a partir de mañana.

**A quién le toca:** al plan 04-14, que es el que vuelve a tocar `e2e/`, o a un `gsd-quick` de una
línea.

---

## `Repaso` y `Emergencia` escritos a mano en dos sitios de `/operacion` (04-12)

**Hallado durante:** la tarea 2 del plan 04-12, al necesitar el mismo copy en la línea 2 del
historial.

**Estado:** el plan 04-12 añadió `copyDeTipoDeAseo()` a `lib/domain/cleanings.ts`, junto a los otros
dos mapas de copy del módulo, y el historial lo usa. Los dos sitios que ya existían siguen con la
cadena literal:

- `app/(admin)/operacion/_components/FilaAseo.tsx:80` — el `Badge` de tipo.
- `app/(admin)/operacion/_components/DialogoCrearAseo.tsx:84` — la opción del `Select`.

**Por qué NO se cambiaron desde 04-12:** son archivos de los planes 04-10 y 04-11 y ninguno de los
dos está en el `files_modified` de 04-12. La regla de alcance dice que solo se auto-corrige lo que
causan los cambios del plan en curso.

**Qué haría falta:** sustituir las dos cadenas por `copyDeTipoDeAseo(tipo)`. Es mecánico y la salida
es idéntica; lo que compra es que el día que `Repaso` cambie de nombre no se quede la mitad de la app
diciendo lo viejo.

**A quién le toca:** al plan que vuelva a tocar `app/(admin)/operacion/_components/`, o a un
`gsd-quick`.

---

## ~~El clic de una alerta no expande el día colapsado que contiene el aseo (04-13)~~ RESUELTO 2026-09-06

**Hallado durante:** la tarea 1 del plan 04-13, al construir el destino del clic de `FilaAlerta`.

**Estado:** el plan 04-13 añadió `id="aseo-{id}"` y `scroll-mt-barra` a `FilaAseo`, así que el ancla
`/operacion#aseo-{id}` **existe en el documento y funciona cuando el día ya está expandido**. `Hoy`
nace expandido, que es el caso mayoritario de las alertas.

**Lo que falta:** `Mañana` y `Siguientes` nacen colapsados (§8.1) y `BloqueDia` guarda ese estado en
un `useState` local. Un ancla a una fila que no está en el DOM no lleva a ninguna parte: el navegador
no encuentra el `id` y se queda donde estaba, sin decir nada. El contrato lo pide explícito en §11.3:
«expandiéndolo si estaba colapsado».

**Qué haría falta:** que `BloqueDia` lea el `hash` al montar (y en `hashchange`) y se expanda si
alguna de sus filas coincide. Es un `useEffect` con la lista de ids del bloque.

**Por qué NO se hizo desde 04-13:** `BloqueDia.tsx` es del plan 04-09 y no está en el
`files_modified` de 04-13. La regla de alcance dice que solo se auto-corrige lo que causan los
cambios del plan en curso, y el `id` del ancla sí lo causa; la expansión es una función nueva de otro
componente.

**A quién le toca:** al plan 04-14, o a un `gsd-quick`.

**Cerrado el 2026-09-06 por el plan 04-14**, commit `2871898`. `BloqueDia` monta
`useAnclaDeAlerta()`, que expande el bloque y lleva la fila a pantalla. Lleva TRES disparadores y no
uno, y la razón está medida: el caso mayoritario —el admin ya está en `/operacion` y pulsa una
alerta del carril— **no emite `hashchange`**, porque el `<Link>` del App Router resuelve una
navegación de solo-hash con `history.pushState` y `pushState` no dispara ese evento. Los tres son
el montaje, `hashchange` (atrás/adelante del navegador) y el clic en fase de captura, que es el que
cubre el caso mayoritario. Afirmado en `e2e/operacion.spec.ts`: «pulsar una alerta de un aseo de
mañana ABRE el bloque Mañana y lleva a su fila».

---

## `hora_limite_vencida` solo se computa dentro de la ventana de hoy … hoy+6 (04-13)

**Hallado durante:** la tarea 2 del plan 04-13, al alimentar `alertasComputadas()` con las filas de
`leerOperacion()`.

**Estado:** `alertasComputadas()` **no acota por fecha** el vencimiento de la hora límite, y su
comentario dice literalmente por qué: «un aseo de anteayer sin terminar es justo el que no se puede
perder». Pero su entrada son las filas que ya trajo `leerOperacion()`, y esa consulta arranca en
`hoyBog()`. Resultado: **un aseo de ayer o de antier con la hora límite pasada y sin terminar no
produce alerta**, porque su fila nunca llega al cómputo.

El caso mayoritario sí funciona: un aseo de HOY cuya hora límite ya pasó aparece en el panel, que es
lo que el admin mira durante la jornada.

**Qué haría falta:** o bien una consulta propia del panel que barra hacia atrás los aseos vivos con
`scheduled_date < hoy`, o bien ampliar el límite inferior de la ventana de `leerOperacion()`.

**Por qué NO se hizo desde 04-13:** la segunda opción cambia la ventana que comparten las TRES
superficies de `/operacion` (los días, la bandeja y los chips de carga) y metería aseos vencidos en
el bloque `Hoy`, que es un cambio de comportamiento del carril ancho, no del panel. La primera añade
un cuarto viaje a `cleanings` en cada carga. Las dos son decisiones de alcance, no correcciones.

**A quién le toca:** decisión de producto. Candidato natural: la Fase 5, que es la que drena la cola
de `notifications` y puede escribir el tipo `hora_limite_vencida` de verdad — hoy **ninguna migración
lo escribe**, y por eso es obligatoriamente computado.

---

## ~~⚠️ ALTA — `AlertDialog` y `Tooltip` se renderizan con 4 y 8 píxeles de ancho (04-14)~~ RESUELTO 2026-09-07

**Hallado durante:** la tarea 1 del plan 04-14, midiendo por qué el `Sheet` de confirmación era
inusable en el navegador. **Es un defecto de la Fase 2 y afecta a toda la aplicación, no solo a
`/operacion`.**

**La causa, medida en el CSS del build de producción:**

```
max-w-sm{max-width:var(--spacing-sm)}     ->   8px   (deberían ser 384px)
max-w-xs{max-width:var(--spacing-xs)}     ->   4px   (deberían ser 320px)
```

`max-w-<nombre>` en Tailwind v4.3 resuelve el nombre contra `--spacing-*` **antes** que contra
`--container-*`, y `02-UI-SPEC.md` §2 declara la escala de espaciado con nombres de talla
(`--spacing-xs: 4px`, `--spacing-sm: 8px`, `--spacing-md: 12px`, `--spacing-lg: 16px`). Toda
primitiva de shadcn que use `max-w-xs|sm|md|lg` queda con un ancho de entre 4 y 16 píxeles.

**Qué se cerró en el 04-14 y qué no.** El commit `1e758bc` arregló `cn()` para que
`tailwind-merge` reconozca los `max-w-*` con nombre del proyecto, de modo que el override en el
sitio de uso —el patrón que `components/ui/sheet.tsx` documenta— DESPLACE al `max-w-sm` de la
primitiva. Con eso quedan bien las dos superficies que sí llevan override:

- `Sheet` → `data-[side=right]:sm:max-w-sheet` → 480px. **Medido en `e2e/operacion.spec.ts`.**
- `Dialog` → `sm:max-w-dialogo` → 480px. Son los cinco diálogos de `/operacion` y los de la Fase 2.

**Siguen rotos los que NO llevan override en su sitio de uso:**

- `components/ui/alert-dialog.tsx:55` — `data-[size=default]:max-w-xs` y
  `data-[size=default]:sm:max-w-sm`. Los usan `DialogoCerrarAseo`, `DialogoCancelarAseo`,
  `DialogoDesactivarApartamento` y `DialogoDesactivarAseador`. Medido: la caja del diálogo mide
  ~32px (el `max-width` de 8px más los 16px de padding a cada lado) y el texto se desborda fuera.
- `components/ui/tooltip.tsx:53` — `max-w-xs` → 4px. Afecta al tooltip de la marca de frescura y al
  del botón de confirmar sin responsable.

**Por qué NO se cerró desde el 04-14:** el arreglo correcto es una decisión de sistema de diseño, no
una corrección mecánica, y hay tres caminos con costes muy distintos:

1. Renombrar la escala `--spacing-*` para quitar la colisión. Es lo más correcto y toca cientos de
   usos (`p-md`, `gap-sm`, `px-xl`) en todo el repo.
2. Añadir el override documentado (`className="sm:max-w-dialogo"`) en cada sitio de uso de
   `AlertDialog`, y un token propio para el tooltip. Es pequeño y disperso.
3. Editar las primitivas de `components/ui/`, que el repo declara regenerables a propósito.

Probado y DESCARTADO: declarar `--container-xs/sm/md/lg` a mano en `@theme` **no lo corrige**, el
espaciado gana igual. `@utility max-w-sm { … }` tampoco: Tailwind emite la declaración propia
después de la del usuario dentro de la misma regla.

**A quién le toca:** decisión del dueño del `UI-SPEC`. Es lo primero que hay que mirar de la
Fase 5, porque toda la PWA del aseador se construye sobre las mismas primitivas.

**Cerrado el 2026-09-07 por el quick `260907-703`**, commits `b6dbc4c` y `10e6ed7`. Se eligió la
**opción 3**: editar las dos primitivas, siguiendo el patrón que el propio repo ya usa en `Sheet` y
`Dialog` — un token `--container-<nombre-propio>` usado como `max-w-<nombre-propio>`. Un nombre
propio no colisiona con la escala de espaciado, que es lo que rompía a `max-w-xs|sm|md|lg`.

Se descartó la 1 (renombrar `--spacing-*`) porque toca cientos de usos en todo el repo, y la 2
(override en cada sitio de uso) porque es dispersa y cada nuevo `AlertDialog` volvería a nacer roto.

Tres tokens nuevos en `app/globals.css` — `--container-alerta` (320px), `--container-alerta-ancha`
(384px) y `--container-tooltip` (320px) — registrados también en el grupo `max-w` de `cn()`, como
exige la cabecera de `lib/utils.ts`. Las dos primitivas llevan ahora cabecera propia avisando de
que una regeneración con el CLI de shadcn las devuelve a `max-w-xs`.

**Medido en el CSS del build de producción**, que es la única verificación que ve este defecto:

```
max-w-alerta{max-width:var(--container-alerta)}              ->  320px
max-w-alerta-ancha{max-width:var(--container-alerta-ancha)}  ->  384px
max-w-tooltip{max-width:var(--container-tooltip)}            ->  320px
```

---

## La causa raíz del cuelgue de `revalidatePath` en `/operacion` no está identificada (04-14)

**Hallado durante:** la tarea 1 del plan 04-14. **Rodeado, no resuelto.**

El síntoma y la bisección completa están en la cabecera de
`app/(admin)/operacion/_actions.ts`. Lo que quedó sin explicar es el mecanismo: con la página
reducida a su `<h1>` y una action de dos líneas que solo llama `revalidatePath('/operacion')`, el
cuelgue **aparece y desaparece al añadir o quitar UN client component cualquiera** del árbol —se
probó con un `<span>` trivial—. Es un umbral de tamaño, no de contenido.

Descartados con medición: el motor (la fila se escribe siempre), la red (la respuesta llega entera y
es autoconsistente), Realtime, `searchParams`, la compresión (`compress: false` no cambia nada),
`revalidatePath('/operacion', 'page')`, y cualquier componente concreto de la pantalla.

**Qué haría falta:** un caso mínimo reproducible fuera de este repo y un reporte a Next. Mientras
tanto el rodeo (`router.refresh()` en el cliente) está en su sitio y anclado por dos aserciones
unitarias y por `e2e/operacion.spec.ts`.

**A quién le toca:** a quien actualice Next. Antes de volver a poner `revalidatePath`, reproducir el
caso mínimo con la versión nueva.

---

## El `Select` de tipo de `Crear aseo` muestra el slug crudo `repaso` (04-14)

**Hallado durante:** la tarea 1 del plan 04-14, leyendo el árbol de accesibilidad del diálogo:

```
combobox "Tipo repaso": repaso
```

`DialogoCrearAseo.tsx:317` usa `<SelectValue />` a secas, y la primitiva de Base UI pinta el VALOR,
no la etiqueta del ítem elegido. `DialogoReasignar.tsx:238` hace lo correcto: le pasa una función
(`{(v) => aseadores.find(...)?.full_name ?? 'Elige un aseador'}`).

Es vocabulario de máquina en la pantalla, que es justo lo que T-04-12 prohíbe. No es grave —el menú
desplegado sí dice `Repaso` y `Emergencia`— pero el valor cerrado, que es lo que el admin ve el 95%
del tiempo, dice `repaso`.

**Qué haría falta:** `<SelectValue>{(v) => copyDeTipoDeAseo(String(v))}</SelectValue>`, que además
cierra de paso el diferido de `Repaso` escrito a mano de arriba.

**Por qué NO se hizo desde el 04-14:** `DialogoCrearAseo.tsx` no está en su `files_modified` y el
plan ya acumuló dos correcciones de otros planes que sí eran bloqueantes. Esta no lo es.

**A quién le toca:** al plan que vuelva a tocar `app/(admin)/operacion/_components/`, o a un
`gsd-quick` de una línea junto con el diferido de `copyDeTipoDeAseo()`.

---

## `.env 2.example`, duplicado de iCloud superviviente (04-14)

**Hallado durante:** la tarea 3 del plan 04-14, en la comprobación transversal de "ningún archivo
con sufijo numérico volvió al checkout".

Es el único que quedó, y es **inofensivo**: está en `.gitignore` (`.env*`), así que no puede viajar
por git, y nadie lo lee (el real es `.env.example`). Se reporta y no se borra porque es un archivo
del usuario en su máquina.

**A quién le toca:** al usuario, `rm '.env 2.example'`. Recurrente mientras el proyecto viva en una
carpeta sincronizada.

---

## Tailwind escanea `.planning/**/*.md` y emite CSS muerto desde la prosa (quick 260908-7w0)

**Hallado durante:** la tarea 3 del quick 260908-7w0, al medir la puerta negativa sobre el CSS de
producción.

El detector de fuentes de Tailwind v4 es un extractor de cadenas por regex sobre los bytes del
archivo, sin noción de comentario ni de lenguaje, y escanea todo el proyecto que no esté en
`.gitignore`. Consecuencia medida: `.next/static/css/*.css` contiene **11 reglas**
`max-width:var(--spacing-<talla>)` que **ningún elemento usa**. Salen de la prosa que documenta
este mismo defecto:

- `.data-[size=default]:max-w-xs` sale **solo** de cuatro archivos `.md` de `.planning/`
  (el `alert-dialog.tsx` real ya no la tiene desde el quick 260907-703);
- `.max-w-sm`, `.max-w-xs`, `.max-w-md` y `.max-w-lg` salen de las cabeceras de `lib/utils.ts`,
  `components/ui/*.tsx`, el bloque explicativo de `app/globals.css` y `scripts/ci/check-max-w-tallas.sh`.

**Por qué NO se arregla:** llegar a cero exige borrar la documentación que explica la trampa, que
vale mucho más que los ~500 bytes de CSS muerto. Y el riesgo real ya está cerrado por otra vía:
`npm run ci:arch` impide que esas clases lleguen a un `className`, y está medido que **cero** de
ellas aparecen en `.next/static/chunks` ni en `.next/server`, o sea que ningún elemento las recibe.

**Consecuencia práctica, y es lo importante:** la puerta "cero ocurrencias de
`max-width:var(--spacing-<talla>)` en el CSS" **no es un criterio válido** y no hay que volver a
escribirla en un plan. El criterio correcto es el de dos partes que usó este quick: (a) cero usos en
cadena de clases, que mide `ci:arch`; (b) cero apariciones en el bundle compilado, que mide un grep
sobre `.next/static/chunks` y `.next/server`.

**Opción parcial si algún día molesta el peso:** `@source not "../.planning";` en `app/globals.css`
quita las 5 reglas que salen solo de los `.md`. No quita las otras 6, que salen de comentarios
dentro de archivos que Tailwind sí tiene que escanear.

**A quién le toca:** a nadie con urgencia. Es un apunte para que la Fase 5 no persiga un cero
inalcanzable.
