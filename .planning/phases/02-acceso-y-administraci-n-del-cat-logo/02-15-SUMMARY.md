---
phase: 02-acceso-y-administraci-n-del-cat-logo
plan: 15
subsystem: validacion
tags: [cierre-de-fase, ci, sign-off, pgtap, playwright, checkpoint-humano, deuda]

requires:
  - phase: 02-09
    provides: "la prueba central de PLAT-04, con JWT reales y con navegador"
  - phase: 02-12
    provides: "el spec de los criterios 2 y 3 del ROADMAP"
  - phase: 02-13
    provides: "cuartos y faltantes, la sección 5 del formulario"
  - phase: 02-14
    provides: "`GuiaAirbnb` en modo solo texto y los siete estados de APTO-12"
provides:
  - "`02-VALIDATION.md` firmado: Per-Task Verification Map de 45 filas, Wave 0 completo, `nyquist_compliant: true`, `status: passed_with_gaps`"
  - "Las 11 puertas corridas a mano con su salida transcrita"
  - "La demostración de que esta fase no tocó DDL, y por tanto de por qué las 47 aserciones pgTAP siguen siendo 47"
  - "El recuento de los 8 hallazgos de la Fase 1, remedidos contra la base viva"
  - "Los dos hallazgos nuevos de la Fase 2 en su `deferred-items.md`"
affects: [03-sincronizacion-ical, la-fase-que-linkee-los-proyectos-hosted]

tech-stack:
  added: []
  patterns:
    - "Un sign-off donde cada casilla cita el número que la respalda, no lo afirma"
    - "`nyquist_compliant` y `status` miden cosas distintas y pueden divergir: densidad de muestreo contra huecos abiertos"
    - "Antes de aceptar que un conteo de aserciones 'no creció', demostrar con el log que no hubo cambios que lo pudieran hacer crecer"

key-files:
  created:
    - .planning/phases/02-acceso-y-administraci-n-del-cat-logo/02-15-SUMMARY.md
  modified:
    - .planning/phases/02-acceso-y-administraci-n-del-cat-logo/02-VALIDATION.md
    - .planning/phases/02-acceso-y-administraci-n-del-cat-logo/deferred-items.md
    - .planning/phases/01-fundaci-n-schema-y-rls/deferred-items.md

key-decisions:
  - "`nyquist_compliant: true` y `status: passed_with_gaps` a la vez: la densidad de muestreo se cumple (corrida máxima sin automatizar = 1 tarea) y los huecos son otra cosa"
  - "El recuento de señuelos se rehízo desde las tablas de los 14 SUMMARY en vez de heredar el acumulado, que había derivado"
  - "No se levantó un segundo servidor en el 3000: el humano ya tiene la app corriendo desde el checkout principal y esa app ya sirve la ruta del calendario"
  - "No se tocó `GuiaAirbnb.tsx`: ya renderiza completo sin capturas y no hay nada que cambiar hasta que un humano diga si los rótulos de Airbnb cambiaron"

requirements-completed: [PLAT-04]
requirements-pending: [APTO-12]

duration: 38min
completed: 2026-09-02
---

# Fase 2 Plan 15: Cierre de fase — Resumen

**Las 11 puertas corridas a mano y en verde con sus números reales, el contrato de validación firmado en `passed_with_gaps` con 45 filas de trazabilidad, y los dos checkpoints humanos entregados al humano en vez de esquivados.**

## Performance

- **Duración:** ~38 min
- **Tareas:** 1 de 3 ejecutada · **2 detenidas en checkpoint humano**, que es lo que el plan pide
- **Archivos creados:** 1 · **modificados:** 3
- **Puertas:** 11 de 11 en verde. 285 unitarios, 52 de integración, 76 de punta a punta, 47 pgTAP

## Commits por tarea

| Tarea | Qué | Commit |
|---|---|---|
| 1 | Capturas de la guía de Airbnb | **sin commit — `checkpoint:human-action` abierto** |
| 2 | Las 11 puertas a mano y el sign-off | `c1ca339` (docs) |
| 2 | Lo que queda abierto, con dueño y remedido | `d686b25` (docs) |
| 3 | Humo contra un feed real de Airbnb | **sin commit — `checkpoint:human-verify` abierto** |

---

## 1. Las 11 puertas, con los números que salieron

Corridas a mano, en el orden del workflow, con el stack local levantado y
`PLAYWRIGHT_PORT=3117` para no medir el servidor del checkout principal.

| # | Puerta | Salida | Exit |
|---|---|---|---|
| 1 | `npx supabase db start` | `already-running` | 0 |
| 2 | `npm run db:lint` | `No schema errors found` | 0 |
| 3 | `npm run db:advisors` (`--type security --fail-on error`) | `No issues found` | 0 |
| 4 | `npm run db:test` | `Files=5, Tests=47, Result: PASS` | 0 |
| 5 | `npm run db:types:check` | sin diff | 0 |
| 6 | `npm run ci:arch` | `check-service-role: OK` (8 guardarraíles) | 0 |
| 7 | `npx tsc --noEmit` | sin salida | 0 |
| 8 | `npm run test:unit` | `16 passed (16) · 285 passed (285)` | 0 |
| 9 | `npm run build` con el env placeholder de `ci/db.yml` | `✓ Compiled successfully` · 9 rutas | 0 |
| 10 | `npm run test:integration` | `5 passed (5) · 52 passed (52)` | 0 |
| 11 | `PLAYWRIGHT_PORT=3117 npx playwright test` | `76 passed (1.5m)` | 0 |

**Once en verde, cero en rojo.** Lo único que no salió limpio es un *warning* de ESLint en
la puerta 9 (`'_phone' is assigned a value but never used` en
`lib/domain/aseador.schema.test.ts:40`). No pone nada en rojo y queda en `deferred-items.md`.

### 1.1 Las 47 aserciones pgTAP: no se aceptó que "no creció", se demostró

El plan pide comprobar que `db:test` siga en 47 y advierte que un número distinto sería
señal de una migración que no debía existir. Salió 47. Pero 47 == 47 también sale si nadie
mira, así que se buscó la causa en vez de la coincidencia:

```
$ git log --oneline 19c5817..8687a18 -- supabase/
84e3b24 fix(02-01): habilitar el proveedor de email sin abrir el auto-registro

$ git show --stat 84e3b24
 supabase/config.toml | 13 +++++++++++--
```

**Un solo commit de la fase entera tocó `supabase/`, y su diff es `config.toml`.** Cero
migraciones, cero tests pgTAP nuevos, cero DDL. Las 47 de la Fase 1 son las 47 de hoy
porque no había nada que las moviera.

### 1.2 La puerta 9 se corrió con el placeholder, no con el entorno real

`npm run build` se corrió **exactamente** con las dos variables que el plan 02-01 puso en
`ci/db.yml` (`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` y
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_ci_placeholder`), con las del `.env.local`
desactivadas por `env -u`. Correrla con el entorno de desarrollo cargado habría medido otra
cosa: que el build funciona cuando hay un Supabase real detrás, que no es lo que el CI
necesita saber.

---

## 2. El recuento de señuelos: **57 lanzados, 53 rojos, 4 verdes**, y el acumulado había derivado

El brief de esta fase habla de "55 señuelos, 53 rojos, 2 declarados como no atrapados,
`tsc` atrapó cero". Se rehizo la cuenta desde las tablas de los 14 SUMMARY en vez de heredar
el acumulado, y **tres de esas cuatro cifras hay que corregirlas**. Que este sea el plan que
firma la validación es exactamente la razón por la que no se podía dejar pasar.

| Plan | Lanzados | Rojos | Verdes |
|---|---|---|---|
| 02-06 | 1 | 1 | 0 |
| 02-07 | 6 | 6 | 0 |
| 02-08 | 8 | 8 | 0 |
| 02-09 | 6 | 6 | 0 |
| 02-10 | 8 | 6 | **2** (B, E) |
| 02-11 | 5 | 5 | 0 |
| 02-12 | 6 | 6 | 0 |
| 02-13 | 7 | 6 | **1** (D) |
| 02-14 | 10 | 9 | **1** (nº 5) |
| **Total** | **57** | **53** | **4** |

**Los 53 rojos sí cuadran.** Lo que no cuadraba era el denominador.

### 2.1 De dónde salió la deriva

El acumulado se arrastraba de SUMMARY en SUMMARY y se rompió dos veces:

- **02-12** tiene 6 señuelos en su tabla (A–F) y su propio texto dice *"`tsc` salió limpio
  con los seis"*, pero el título de la sección dice "cuatro roturas" y el acumulado pasó de
  33 a **34**, sumando 1 en vez de 6.
- **02-14** tiene 10 filas en su tabla y su título dice "nueve lanzados, nueve atrapados",
  cuando además el propio texto declara que el señuelo 5 sobrevivió: son 10 lanzados y 9
  atrapados por un test.

Cada plan iba heredando el número del anterior sin recontar, así que un error de un plan
viajaba hasta el final. **La lección no es que alguien contó mal: es que un acumulado
heredado no es una medición.**

### 2.2 `tsc` no atrapó cero: atrapó dos de 57

Es poco, y sigue siendo la conclusión importante del ejercicio —el compilador no es una red
de comportamiento—, pero "cero" es falso y está escrito en dos SUMMARY:

- **02-13, señuelo G:** validar el formulario con `esquemaBorrador`/`Activar` sin extender
  con las colecciones. `tsc` da **6 errores**, porque `parseado.data.cuartos` deja de existir
  en el tipo de salida. Es el único del plan con red de compilador.
- **02-14, señuelo 8:** cortar el estado 5 por `totalEventos === 0`. Cae `tsc` **y** el e2e,
  porque el estado 4 declara `proximoCheckout: string` y no `string | null`.

Y el propio 02-14 anota por qué eso no consuela: con un `?? '2026-01-01'` el compilador se
calla y solo queda el e2e. `tsc` atrapa la forma, no el comportamiento.

### 2.3 Los cuatro verdes, y cuáles siguen sin red hoy

**Dos se repararon dentro del mismo plan que los descubrió:**

- **02-10 B** (`localeCompare('es-CO')` → `sort()`): salió verde porque el juego de datos del
  test no discriminaba las dos ordenaciones. **El señuelo destapó que el test era malo, no
  que el código estuviera bien.** Se reescribió con los dos casos que sí discriminan
  (mayúscula inicial y tilde en medio) y el relanzamiento B' se puso en rojo.
- **02-10 E** (`leerSecretos` con el cliente del usuario): no lo atrapó **nada**. De ahí
  salió el **guardarraíl 8**, y se verificó con el señuelo F, que sí cae.

**Dos siguen declarados sin red, y así se quedan:**

- **02-13, señuelo D — `key={indice}` en vez de `key={field.id}`.** El spec estaba montado
  para atraparlo (dos cuartos con tipo y etiqueta distintos, quitando el primero) y **los 9
  tests siguieron en verde**. Con esa composición —un `Input` no controlado registrado por
  nombre más un `Controller` que se re-suscribe por nombre— el cambio no produce síntoma
  observable desde Playwright. La clave se queda en `field.id` **por contrato, no porque
  haya una red debajo**, y está escrito así en la cabecera del componente y del spec.
- **02-14, señuelo 5 — insert en `calendar_reservations` con el cliente del usuario.** No lo
  atrapó ningún test: **lo paró la base**, con `42501 permission denied`. La conclusión que
  02-14 sacó es la correcta: el señuelo estaba probando la vía equivocada. Relanzado por la
  vía privilegiada (señuelo 6, con `createAdminClient()`) sí cae, con `expected 2 to be 1`.
  Pero **el hecho pelado es que la vía del usuario no tiene test propio**, y `createAdminClient()`
  está a la vista dentro de `guardarFeed`.

### 2.4 Y un quinto caso que no es un señuelo pero cuenta lo mismo

**02-06:** la prueba anti-caché original era un test de Playwright que afirmaba `no-store` en
la respuesta del documento. Con el `setAll` roto a la firma de un argumento —el agujero de
fuga de sesión entre usuarios— **los 6 tests siguieron en verde y `tsc` no dijo nada**. La
aserción medía el default de Next para rutas dinámicas, no el trabajo del middleware. El
test se eliminó y se sustituyó por uno unitario que invoca `setAll` con sus dos argumentos.
Es el hallazgo más caro de la fase y no habría aparecido sin romper la invariante a
propósito.

---

## 3. Los 6 criterios del ROADMAP, con el estado honesto de cada uno

| # | Criterio | Estado |
|---|---|---|
| 1 | Login por rol con sesión persistente | ✅ **Verificado.** 5 e2e de login, 10 de ruteo, 4 unitarios de middleware. La aserción de la recarga corre en navegador real |
| 2 | CRUD de apartamentos con los 12 campos | ✅ **Verificado.** 15 de integración contra la base real, 9 e2e de CRUD, 9 e2e de cuartos y faltantes. Los secretos se persisten en `property_secrets` **y** el mismo `select` con el JWT del admin da `42501` |
| 3 | Puertas de activación | ⚠️ **Verificado con un hueco declarado.** Las tarifas y el responsable los sostiene la base con `23514`. **La exigencia de `contacto_externo` es solo de UI y no tiene respaldo en base** |
| 4 | Alta y baja con revocación inmediata | ✅ **Verificado, y con doble red.** 13 de integración con JWT reales (token vivo + desactivación ⇒ 0 filas) y 4 e2e con navegador. Es el único criterio con las dos capas |
| 5 | Buscador y lista de aseadores | ✅ **Verificado.** 14 e2e contra las 39 filas reales, 9 e2e de la lista de aseadores. Los estados se afirman como TEXTO en el DOM, no solo como color |
| 6 | Validación en vivo del feed (APTO-12) | ⚠️ **Verificado contra fixtures sintéticas. Pendiente contra material real.** 7 e2e con los siete estados, 11 de integración con la costura. Pero **la guía va sin capturas** y **el `.ics` real no se ha contrastado** |

### 3.1 El criterio 3 descansa en parte sobre una puerta sin respaldo en base

`props_active_requires_owner` solo se dispara cuando `gestion_vivaguest AND is_active`, así
que **una unidad informativa se puede activar por API directa con el contacto externo vacío
y Postgres la deja pasar**. Está medido desde 02-03 y convertido en test de integración en
02-10: hay un test que **afirma el hueco** en vez de disimularlo. La puerta real vive en
Playwright.

Consecuencia práctica, dicha sin adornos: si alguna vez se escribe por fuera del formulario
—un script de migración, un backfill, un RPC de una fase futura— esa mitad del criterio 3 no
detiene nada. Las otras dos mitades sí.

### 3.2 El criterio 6 está demostrado contra lo sintético y sin contrastar contra lo real

Los siete estados de UI-SPEC §10.3 tienen su e2e, incluido el par 5/6 que es el que impide
que un admin conecte el calendario equivocado. Lo que ninguna fixture puede demostrar es que
el `.ics` que Airbnb genera **hoy, en 2026** tenga la forma que asumimos. Es el supuesto A5
del research: la whitelist positiva por `DESCRIPTION` está respaldada por 432 snapshots
reales, pero van de junio de 2025 a agosto de 2026 y **no son de la cuenta de VivaGuest**.

Ese es el checkpoint de la tarea 3, y sigue abierto.

---

## 4. El CI sigue sin correr solo, y ahora le faltan dos puertas más

`ci/db.yml` **vive en `ci/` y no en `.github/workflows/`.** Mover el archivo requiere un
token con scope `workflow` y `02-CONTEXT.md` lo difiere. Es la misma condición con la que
cerró la Fase 1 y esta fase no la cambió.

Lo que sí cambió, y a peor: **esta fase añadió dos suites que el workflow ni siquiera
menciona.** `ci/db.yml` conoce 9 pasos. Las puertas 10 y 11 —52 aserciones de integración y
76 de punta a punta, **128 en total**— no están escritas en ninguna parte del archivo. El
día que alguien consiga el token y mueva el workflow, esas 128 seguirán sin correr si nadie
añade los pasos.

Y no es un copy-paste: los dos jobs nuevos necesitan el **stack completo** de Supabase, no
solo `db start`. `test:integration` habla con GoTrue en el 54321, así que el truco de
arrancar solo Postgres —que es lo que hace rápido al job `database`— no le sirve. Playwright
además necesita `npx playwright install --with-deps chromium`. Está registrado como hallazgo
4 de `deferred-items.md` con lo que hay que presupuestar.

**En claro: hoy, un PR que rompa cualquiera de las 11 puertas no se pone rojo en GitHub.**
Las corre un humano o no las corre nadie.

---

## 5. Los hallazgos de la Fase 1, remedidos en vez de repetidos

Los 8 hallazgos de `01-.../deferred-items.md` se volvieron a medir contra la base viva, no se
copiaron. **Cuatro siguen abiertos: 2, 5, 7 y 8.**

| # | Estado medido | Evidencia |
|---|---|---|
| 1 | **Cerrado** | `supabase/config.toml:5` → `project_id = "vivaguest"` |
| 2 | **ABIERTO** | `has_table_privilege('anon','storage.objects','TRUNCATE')` → `t` |
| 3 | Cerrado en tablas; su cola de funciones es el hallazgo 5 | migración 07 |
| 4 | **Cerrado** | `calendar_feeds` existe con 16 columnas y **sin `url`**. Ganó el argumento de seguridad y el fixture pgTAP se ajustó |
| 5 | **ABIERTO como regla permanente** | Hoy **cero** funciones de `public` ejecutables por `anon`. Pero eso lo sostiene el revoke explícito de la migración 07, no un default: la primera función nueva sin su par de líneas reabre el agujero |
| 6 | **Cerrado** | `00_rls_aseos.test.sql ...... ok`; el total sigue en `Files=5, Tests=47, PASS` |
| 7 | **ABIERTO** | Sin cambios. Sigue sin ruta de escritura para `damages`/`expenses`/`missing_item_reports`. Dueño: Fase 6 |
| 8 | **ABIERTO** | Sin cambios. Dueño: Fase 9 (RET-06) |

### 5.1 El checkpoint A1 sigue abierto, no es de esta fase, y ahora arrastra tres cosas

Los proyectos de Supabase dev y prod **todavía no existen**. Es el checkpoint A1 de la Fase 1
y **no es de la Fase 2 cerrarlo**. Se reporta como abierto, no se trabaja alrededor. Lo que
sí es nuevo es lo que bloquea, y quedó escrito en un solo sitio:

1. **La configuración del proveedor de email hay que replicarla a mano en el panel.** El plan
   02-01 la arregló en `supabase/config.toml` (`84e3b24`), y **`config.toml` no se aplica al
   proyecto hosted**. El equivalente —Authentication → Providers → Email → Enabled **ON**, y
   Allow new users to sign up **OFF**— está en el research §8.1 como `[ASSUMED]`: nadie lo ha
   visto funcionar en hosted. Si se linkea y se olvida esta mitad, el login del producto
   entero queda apagado con el mismo error que a esta fase le costó un plan desbloquear.
2. **`db advisors --type security` va a decir cosas nuevas** en hosted, como WARN. El umbral
   está en `--fail-on error` a propósito; subirlo es una decisión de la fase que linkee.
3. **El hallazgo 2 solo es ejecutable desde el dashboard.** Si se va a entrar al panel de
   todas formas, es el momento de revocarle el `TRUNCATE` a `anon` sobre `storage.objects`.

---

## 6. La semilla, intacta

- **39 unidades, 8 clusters, 5 informativas**, medido directo contra la base:
  `select count(*), count(distinct cluster), count(*) filter (where not gestion_vivaguest) from public.properties` → `39 | 8 | 5`.
- **Los tres perfiles del orquestador, vivos y activos:** `admin@vivaguest.test` (Juan Ortega,
  admin), `luz@vivaguest.test` y `maria@vivaguest.test` (aseadoras). Ninguno se borró.
- La suite de Playwright se corrió en `PLAYWRIGHT_PORT=3117` precisamente para no tocar el
  servidor del 3000 que el humano tiene abierto.

---

## Desviaciones del plan

### 1. [Regla 3 - Bloqueo] El worktree arrancó siete commits por detrás de su base

- **Encontrado en:** el arranque, antes de la tarea 2.
- **Problema:** `git merge-base HEAD 8687a18` devolvía `2a35c53`, o sea que el worktree estaba
  en el estado de "fase planeada" y no veía ninguno de los 14 planes ejecutados. Correr las
  puertas ahí habría medido un repo sin `app/`, sin `e2e/` y sin la mitad de `lib/`: **once
  puertas en verde sobre el código equivocado.**
- **Arreglo:** `git reset --hard 8687a18`, que es el procedimiento que el propio brief manda
  cuando la base no coincide. Árbol limpio antes y después.
- **Commit:** ninguno — es corrección de estado del worktree, no de contenido.

### 2. [Regla 2 - Funcionalidad crítica] El recuento de señuelos se rehízo en vez de heredarse

- **Encontrado en:** tarea 2, escribiendo el cierre.
- **Problema:** el acumulado que viajaba de SUMMARY en SUMMARY tenía dos errores de suma
  (02-12 sumó 1 donde debía sumar 6; 02-14 declaró 9 lanzados con 10 en su tabla) y dos
  SUMMARY afirman que `tsc` atrapó cero cuando atrapó dos. **Firmar la validación de la fase
  repitiendo esas cifras habría metido el error en el documento que existe para que nadie
  tenga que volver a mirar.**
- **Arreglo:** recuento desde las tablas de los 14 SUMMARY. 57 lanzados, 53 rojos, 4 verdes,
  2 atrapados por `tsc`. Los 53 rojos, que es la cifra que de verdad importa, resultaron
  correctos.
- **Commit:** documentado en este SUMMARY, §2.

### 3. [Regla 3 - Bloqueo] No se levantó un segundo servidor para la tarea 3

- **Encontrado en:** preparando el checkpoint de la tarea 3.
- **Problema:** el plan dice *"levantar la app con `npm run build && npm run start`, dejarla
  corriendo, y pausar"*. Pero el orquestador ya tiene un `next start` en el 3000 desde el
  checkout principal, con el humano usándolo en un navegador. Levantar otro habría chocado en
  el puerto, o —peor— habría dejado dos apps y la duda de en cuál se hizo la prueba.
- **Arreglo:** se comprobó que la app del 3000 **ya sirve la ruta del calendario**
  (`/apartamentos/<id>/calendario` → `307 → /login`, que es la respuesta de una ruta que
  existe sin sesión; una ruta inexistente daría 404). La prueba se hace ahí.
- **Commit:** ninguno.

### 4. [Regla 3 - Bloqueo] Las puertas se corrieron en un puerto propio

- **Problema:** `playwright.config.ts` tiene `reuseExistingServer: !process.env.CI`. Con el
  3000 ocupado por el checkout principal, Playwright lo habría reutilizado **sin decir nada**
  y las 76 aserciones habrían medido el otro código.
- **Arreglo:** `PLAYWRIGHT_PORT=3117`, que es exactamente para lo que el plan 02-04 lo dejó.
- **Commit:** ninguno; queda registrado en `02-VALIDATION.md`.

---

**Total de desviaciones:** 4 auto-corregidas (3 de Regla 3, 1 de Regla 2)
**Impacto:** ninguna amplía el alcance. Tres son de entorno; la cuarta corrige una cifra que
iba a quedar firmada.

---

## Deuda declarada, con dueño

### En `deferred-items.md` de la Fase 2

| # | Qué | Dueño |
|---|---|---|
| 1 | `npx eslint .` da 3 errores en `e2e/fixtures.ts` que ninguna puerta ve | el plan que toque la config de ESLint |
| 2 | Aviso de Vite al cargar los config de Vitest | un plan propio, con las suites como red |
| 3 | **[nuevo]** `npm run build` avisa de `_phone` sin usar | el mismo que el 1 |
| 4 | **[nuevo]** Las puertas 10 y 11 no están escritas en `ci/db.yml`: 128 aserciones | la fase que consiga el token con scope `workflow` |

### Abierto y fuera de esta fase

| Qué | Dueño |
|---|---|
| Los proyectos hosted no existen (checkpoint A1) y lo que arrastra | la fase que linkee |
| `anon` conserva `TRUNCATE` sobre `storage.objects` | pendiente de decisión, ejecutable desde el dashboard |
| Toda función nueva de `public` necesita su propio par de `revoke`/`grant` | toda migración de las Fases 3 a 9 |
| Una foto puede colgar de un `checklist_item` de otro aseo | Fase 6 |
| Objetos de Storage huérfanos | Fase 9 (RET-06) |
| `key={field.id}` se sostiene por contrato, sin test debajo | quien toque los editores de cuartos y faltantes |
| La vía del cliente de usuario contra `calendar_reservations` no tiene test propio | Fase 3, al absorber `ical-preview.ts` |

---

## Checkpoints humanos abiertos

Los dos siguen abiertos y **no se falsearon, ni se saltaron, ni se rodearon**. Están
detallados en el mensaje de checkpoint, con lo que hay que hacer y lo que se verificará al
volver.

### Tarea 1 — Las cuatro capturas de `public/guia-airbnb/`

`public/` ni siquiera existe en el repo. `GuiaAirbnb.tsx` lo resuelve con `existsSync` en el
servidor y **renderiza los cuatro pasos completos sin ninguna captura**, que es lo que
`02-UI-SPEC.md` §10.1 autoriza: *"Si hay que recortar alcance, se recorta la guía a texto sin
capturas, nunca la validación."* Los 76 e2e pasan con la guía en modo texto.

Lo que falta es contenido, no código, y **no es inventable**: sale de la cuenta real de
VivaGuest en Airbnb. Una captura sacada de un blog de 2024 lleva al admin a un menú que ya no
existe, que es peor que no tener captura. **No bloquea el criterio 6 del ROADMAP.**

Va con una segunda mitad: **verificar que el copy de los cuatro pasos coincida con la
interfaz real de Airbnb hoy.** El propio UI-SPEC lo marca como pendiente y el copy está en
`GuiaAirbnb.tsx` esperando confirmación o corrección.

### Tarea 3 — El humo contra un `.ics` real de Airbnb

Es lo único que puede cerrar el supuesto A5 y lo único que valida el criterio 6 de punta a
punta con material real. Tres números que contrastar contra el calendario de Airbnb abierto
al lado: el conteo de reservas, la fecha del próximo checkout y la antigüedad del feed.

**El que más importa es la fecha.** Si sale el día anterior, hay un off-by-one de zona
horaria y es exactamente el bug que todo el diseño de fechas de la Fase 1 intentó hacer
imposible.

---

## Listo para lo siguiente

- **Para la Fase 3:** la costura está sostenida por el conteo antes-después con centinela de
  `lib/domain/feed.integration.test.ts`. `calendar_feeds` recibe su fila con la salud poblada
  y `next_sync_at` en su default, así que el feed entra en la cola del cron sin que esta fase
  sepa nada de esa cola. `lib/domain/ical-preview.ts` sigue siendo **un solo archivo** que
  absorber o borrar, y la divergencia entre su conteo y el del pipeline está declarada como
  aceptable: **no hay que "arreglarla"**.
- **Si el humo de la tarea 3 sale con diferencias**, esos números son información que la Fase
  3 necesita y que no se puede obtener de otra forma. Van a `deferred-items.md` de la Fase 1
  con dueño Fase 3, y A5 queda refutado con evidencia. **No se toca `ical-preview.ts` en este
  plan:** reintroducir aquí la clasificación de la Fase 3 rompe la costura.
- **Para la fase que linkee los proyectos hosted:** los tres puntos del §5.1, en ese orden.
- **Para quien mueva el CI:** hallazgo 4 de `deferred-items.md`. Las puertas 10 y 11 y lo que
  hay que presupuestar para cada una.

---

## Known Stubs

Ninguno nuevo. El único hueco de contenido es `public/guia-airbnb/`, que **no es un stub**:
`GuiaAirbnb.tsx` no renderiza un placeholder ni un texto de "próximamente" — omite la imagen
y deja el paso en texto, que es el estado que el UI-SPEC declara aceptable.

## Threat Flags

Ninguno. Este plan no añadió superficie: no toca red, ni auth, ni acceso a ficheros en
runtime, ni schema. Los tres archivos modificados son documentación de `.planning/`.

Sobre T-02-81 (capturas con la URL de exportación visible): **la mitigación sigue vigente y
sin ejercer**, porque no hay capturas. La instrucción de tapar todo lo que va después del `?`
está en el mensaje de checkpoint, y se verificará antes de commitear cualquier archivo en
`public/guia-airbnb/`.

## Configuración del usuario

Ninguna nueva. Las dos verificaciones humanas están en el mensaje de checkpoint.

---

## Self-Check: PASSED

- `.planning/.../02-VALIDATION.md` existe, con `nyquist_compliant: true`, `status: passed_with_gaps`, `wave_0_complete: true` y **45 filas** en el Per-Task Verification Map (`grep -c '^| 02-'` → 45).
- Los dos commits de este plan existen en el historial: `c1ca339` y `d686b25`.
- Los tres archivos declarados como modificados están en esos dos commits. Ninguno de los dos borró archivos (`git diff --diff-filter=D` vacío).
- Las 11 puertas se corrieron y sus salidas están transcritas arriba y en `02-VALIDATION.md`.
- Semilla verificada contra la base: `39 | 8 | 5`. Los tres perfiles del orquestador, vivos.
- `STATE.md` y `ROADMAP.md` **no se tocaron**.
- Las tareas 1 y 3 quedan **sin commit y declaradas como checkpoint abierto**, que es su estado correcto.

---
*Fase: 02-acceso-y-administraci-n-del-cat-logo*
*Completado parcialmente: 2026-09-02 — 1 de 3 tareas, 2 en checkpoint humano*
