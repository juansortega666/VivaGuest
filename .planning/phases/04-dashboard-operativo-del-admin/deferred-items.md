# Diferidos de la Fase 4

Hallazgos fuera del alcance del plan que los encontró. No se arreglan ahí: la regla del proyecto es
que solo se auto-corrige lo que causó el cambio en curso, y estos son anteriores.

## 1. `npm run lint` sale en rojo con 3 errores preexistentes

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

## El clic de una alerta no expande el día colapsado que contiene el aseo (04-13)

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
