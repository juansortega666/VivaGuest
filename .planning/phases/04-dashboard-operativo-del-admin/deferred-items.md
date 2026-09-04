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
