---
phase: 02-acceso-y-administraci-n-del-cat-logo
plan: 14
subsystem: ui
tags: [ical, airbnb, ssrf, server-actions, zod, playwright, credenciales]

requires:
  - phase: 02-03
    provides: "`previsualizarIcs` y las siete fixtures sintéticas de `.ics`"
  - phase: 02-10
    provides: "`property_secrets` solo por la fábrica administrativa; guardarraíles 7 y 8 de CI"
  - phase: 02-11
    provides: "la lista de apartamentos y el menú que enlaza a esta pantalla"
  - phase: 02-12
    provides: "`PLAYWRIGHT_PORT`, el shell del admin y la ficha del apartamento"
provides:
  - "`/apartamentos/[id]/calendario` con los siete estados de UI-SPEC §10.3"
  - "`esquemaUrlIcal`: allowlist de host anti-SSRF, compartida por cliente y servidor"
  - "`validarFeed`, `revalidarFeedGuardado`, `guardarFeed` y `revelarUrlIcal`"
  - "`lib/data/feeds.ts`: las columnas de salud de `calendar_feeds`, y nada más"
  - "`hoyBog()` y `horasDesdeDtstamp()` en `lib/domain/dates.ts`"
  - "la aserción de conteo que mantiene la costura con la Fase 3"
affects: [03-sincronizacion-ical, 02-15]

tech-stack:
  added: []
  patterns:
    - "Allowlist de host parseando con `URL` y comparando `hostname` con frontera de etiqueta, nunca con regex sobre la cadena"
    - "`redirect: 'manual'` como segunda mitad obligatoria de toda defensa anti-SSRF"
    - "Una credencial guardada no vuelve al navegador: se enmascara en el servidor y se revela con una action propia"
    - "Concesión de testeabilidad con candado de tres vueltas, medido sobre el bundle compilado"
    - "Aserción de 'no se escribió nada' con centinela sembrado y control del contador"

key-files:
  created:
    - lib/domain/ical-url.schema.ts
    - lib/domain/ical-url.schema.test.ts
    - lib/data/feeds.ts
    - app/(admin)/apartamentos/[id]/calendario/page.tsx
    - app/(admin)/apartamentos/[id]/calendario/_actions.ts
    - app/(admin)/apartamentos/[id]/calendario/_components/ConectarCalendario.tsx
    - app/(admin)/apartamentos/[id]/calendario/_components/GuiaAirbnb.tsx
    - lib/domain/feed.integration.test.ts
    - e2e/calendario.spec.ts
  modified:
    - lib/domain/dates.ts
    - lib/domain/dates.test.ts
    - playwright.config.ts

key-decisions:
  - "El corte entre estado 4 y estado 5 es `proximoCheckout === null`, no `totalEventos === 0`: un feed con checkouts solo en el pasado tiene eventos y no tiene nada que mostrar"
  - "`maxDuration` vive en `page.tsx`: Next 15.5 rompe el build ante un `export const` en un archivo `use server`, medido"
  - "La concesión de `127.0.0.1` lleva tres candados porque Next pliega la rama de `NODE_ENV` en el bundle, medido"
  - "`validarFeed` actualiza la salud del feed pero NO la crea: validar un link no guardado no debe marcar el apartamento como conectado"
  - "`Validar de nuevo` es una action que lee la URL en el servidor: la credencial no baja al navegador ni para revalidarla"
  - "`last_event_count` guarda el número de RESERVAS, que es el que el admin verificó contra Airbnb"

patterns-established:
  - "Aserción de ausencia con CENTINELA: sembrar filas antes de medir para que la igualdad no sea 0===0"
  - "CONTROL del contador: demostrar en el mismo test que el contador se mueve cuando de verdad se escribe"
  - "Servidor HTTP local dentro del spec para los fetch que hace el servidor, donde `page.route()` no llega"
  - "Fixtures con fechas relativas a hoy cuando la aserción es sensible al calendario"

requirements-completed: [APTO-03, APTO-12]

duration: 105min
completed: 2026-09-02
---

# Fase 2 Plan 14: Conectar calendario (APTO-03, APTO-12) — Resumen

**Validación en vivo del feed de Airbnb con los siete estados de UI-SPEC §10.3, defensa anti-SSRF en dos mitades, la credencial nunca entera en el DOM, y la costura con la Fase 3 sostenida por una aserción de conteo con centinela.**

## Performance

- **Duración:** ~105 min
- **Tareas:** 3 de 3
- **Archivos creados:** 9 · **modificados:** 3
- **Tests:** 285 unitarios, 52 de integración, 76 de punta a punta. Todo en verde.

## Logros

- **La pantalla contesta la pregunta que una URL de Airbnb no deja contestar.** Al pegar el link, el admin ve si el feed sirve, cuántas reservas trajo y cuál es el próximo checkout, en Display 24/600. Ese número y esa fecha son la verificación humana de que el link es el del apartamento correcto, y el peso tipográfico está afirmado en el e2e porque enterrarlo en 14px anula el requisito.
- **Los estados 5 y 6 son inconfundibles.** Un calendario válido sin nada por delante va en `--surface-warn` con `TriangleAlert` y botón `outline`; un 200 con HTML va en `--surface-destructive` con otro copy y sin ningún botón de guardar. El e2e afirma, para cada uno, que el copy del otro NO está.
- **La costura con la Fase 3 tiene un test que puede fallar.** El conteo antes-después de `calendar_reservations` y `cleanings` corre sobre filas centinela sembradas, y en el mismo test se demuestra que el contador se mueve cuando se escribe de verdad.
- **La credencial no vuelve al navegador.** Ni como prop, ni para revalidar. Verificado buscando el `?s=` en el documento.

## Commits por tarea

1. **Tarea 1: allowlist y Server Actions** — `f979713` (feat)
2. **Tarea 2: la pantalla y los siete estados** — `b613d2c` (feat)
3. **Tarea 3: la aserción de la costura y el e2e** — `5d192b7` (test)

## Archivos creados / modificados

- `lib/domain/ical-url.schema.ts` — allowlist de host, forma de la URL y enmascarado. Lo importan las dos orillas: el navegador para el estado 2 sin red, y el servidor antes del `fetch`.
- `lib/domain/ical-url.schema.test.ts` — 25 casos, incluidas cuatro evasiones de host y los tres candados de la concesión de loopback.
- `lib/data/feeds.ts` — las siete columnas de salud de `calendar_feeds`. **No nombra `calendar_reservations` ni `cleanings`, y no recibe la URL**: la costura y el secreto son estructurales, no una convención.
- `app/(admin)/apartamentos/[id]/calendario/_actions.ts` — `validarFeed`, `revalidarFeedGuardado`, `guardarFeed`, `revelarUrlIcal`.
- `app/(admin)/apartamentos/[id]/calendario/_components/ConectarCalendario.tsx` — el campo y los siete estados.
- `app/(admin)/apartamentos/[id]/calendario/_components/GuiaAirbnb.tsx` — los cuatro pasos, que renderizan completos sin las capturas.
- `app/(admin)/apartamentos/[id]/calendario/page.tsx` — RSC, `runtime = 'nodejs'` y `maxDuration = 20`.
- `lib/domain/feed.integration.test.ts` — 11 tests contra la base real.
- `e2e/calendario.spec.ts` — 7 tests con servidor HTTP local y contador de hits.
- `lib/domain/dates.ts` — `hoyBog()` y `horasDesdeDtstamp()`.
- `playwright.config.ts` — enciende la concesión de loopback en el `webServer`.

## Lo que se midió, y no se supuso

### 1. `export const maxDuration` en un archivo `use server` rompe el build

La primera medición fue un **falso verde**: con el export puesto, `npm run build` pasó. Pasó porque `page.tsx` todavía no existía y **nada importaba el módulo**, así que Next ni lo compiló. En cuanto `ConectarCalendario.tsx` lo importó:

```
Only async functions are allowed to be exported in a "use server" file.
```

El valor vive en `page.tsx`, que además es el único sitio donde la plataforma lo lee: los archivos con `_` delante no son rutas.

### 2. Next pliega la rama de `NODE_ENV` en el bundle, y por eso el candado de `NODE_ENV` no basta

02-RESEARCH §7.3 propone `NODE_ENV !== 'production'` como candado de la concesión de `127.0.0.1`. No puede funcionar solo: `playwright.config.ts` arranca el servidor con `next build && next start`, que corre con `NODE_ENV=production` **exactamente igual que producción**. Inspeccionando la salida del build, la rama entera desaparece — tanto en `.next/server/…/page.js` como en el chunk de cliente queda solo:

```js
"1"===process.env.NEXT_PUBLIC_VIVAGUEST_FEED_LOCAL&&"127.0.0.1"===b.hostname
```

De ahí el candado de tres vueltas: `NODE_ENV`, `VERCEL === '1'` (que cierra la puerta en el único sitio donde hay algo que proteger, incluso si alguien pone la variable en el panel del proyecto) y la variable `NEXT_PUBLIC_` de build.

### 3. `calendar_reservations` no tiene INSERT para `authenticated`

Descubierto atacando el propio test de la costura. Se metió una inserción en `calendar_reservations` **dentro** de `registrarSaludDelFeed` y los 10 tests siguieron en verde: la fila nunca se escribió.

```
42501 permission denied for table calendar_reservations
hint: GRANT INSERT ON public.calendar_reservations TO authenticated;
```

Es una segunda capa que conviene tener escrita, y tiene una consecuencia que sí importa: **un bleed hecho con `createAdminClient()` sí llegaría a la base**, y esa fábrica está a la vista dentro de `guardarFeed`. Por eso el conteo antes-después sigue siendo la aserción que importa, y se verificó con un señuelo por esa vía: la pone en rojo (`2` frente a `1`). El hallazgo quedó como test propio.

## Señuelos: nueve lanzados, nueve atrapados

| # | Señuelo | Qué se rompió | Resultado |
|---|---|---|---|
| 1 | `hostEnAllowlist` compara con `includes` | frontera de etiqueta | rojo: evasiones 2 y 4 |
| 2 | `permiteHostLocal` devuelve siempre `true` | el candado de producción | rojo: candados 1 y 3 |
| 3 | El enmascarado conserva los 2 últimos caracteres del `?s=` | T-02-74 | rojo: los dos tests de enmascarado |
| 4 | `hoyBog` calculado en UTC | el día de negocio | rojo: la ventana 19:00-24:00 |
| 5 | Insert en `calendar_reservations` dentro de `registrarSaludDelFeed`, cliente de usuario | la costura | **verde** — ver abajo |
| 6 | Insert en `calendar_reservations` en el bloque de conectar, cliente de servicio | la costura | rojo: `expected 2 to be 1` |
| 7 | `redirect: 'follow'` | segunda mitad anti-SSRF | rojo: el test del 302 |
| 8 | Corte del estado 5 por `totalEventos === 0` | estado 4 vs 5 | rojo: `tsc` **y** el e2e |
| 9 | La URL entera como prop de la página | T-02-74 | rojo: el test del DOM |
| 10 | `text-display` → `text-body` en la cifra | el peso tipográfico | rojo: el e2e |

**El señuelo 5 sobrevivió, y se declara.** No lo atrapó ningún test: lo atrapó la base, que niega el INSERT con `42501`. La conclusión no es "el test es malo", es que ese señuelo estaba probando la vía equivocada. Se relanzó por la vía privilegiada (señuelo 6) y ahí sí cayó, y el hallazgo se convirtió en el test `SEGUNDA CAPA, MEDIDA`.

El señuelo 8 tuvo un hallazgo lateral: el **tipado** se cayó antes que el test, porque el estado 4 declara `proximoCheckout: string` y no `string | null`. Es una barrera mejor —falla en `tsc`, no en CI a los 30 s— pero no sustituye al test: con un `?? '2026-01-01'` el compilador se calla. Se comprobó también así, y ahí el e2e es el que se pone en rojo.

## Decisiones

- **El corte entre estado 4 y estado 5 es `proximoCheckout === null`, no `totalEventos === 0`.** El plan pedía literalmente lo segundo, pero contradice su propio copy y el disparador de UI-SPEC §10.3 (*"2xx + iCal parseable + ≥1 evento futuro"*) y a 02-RESEARCH §4.5 (*"un apartamento con checkouts solo en el pasado da 0 eventos. Es correcto, no es un fallo del link → estado 5"*). Con el corte por `totalEventos`, `solo-pasado.ics` caería en el estado 4 mostrando "0 reservas" y sin fecha: exactamente la ambigüedad que los dos estados existen para separar. Tiene su e2e propio.
- **`validarFeed` actualiza la salud del feed pero no la crea.** Es un `update`, no un `upsert`. La columna 7 de la lista (§7.1) pinta `CalendarCheck` por la existencia de un feed activo; con un upsert, un apartamento aparecería como conectado solo porque alguien pegó un link y le dio a validar. La fila la crea `guardarFeed`.
- **`Validar de nuevo` es `revalidarFeedGuardado`, no `revelarUrlIcal` + `validarFeed`.** La segunda forma pondría la credencial en el DOM solo para poder revalidarla.
- **`last_event_count` guarda las RESERVAS, no los eventos.** Es el número que la pantalla mostró y que el admin contrastó contra Airbnb, así que el estado 4 al reabrir dice lo mismo que dijo al validar. La Fase 3 puede redefinir la métrica; el preview es diagnóstico y ya está declarado como más laxo.
- **El panel de "ya conectado" muestra el conteo y la fecha de la última validación, no un próximo checkout.** `calendar_feeds` no tiene columna para el checkout y fabricar una fecha ahí sería inventarla. Para una fecha fresca está `Validar de nuevo`.

## Desviaciones del plan

### 1. [Regla 3 - Bloqueo] `maxDuration` no puede vivir en `_actions.ts`

- **Encontrado en:** Tarea 2 (el primer build con la página ya importando las actions)
- **Problema:** Next 15.5 rompe el build con `Only async functions are allowed to be exported in a "use server" file`.
- **Arreglo:** el `export const maxDuration = 20` vive en `page.tsx`, que es la route de verdad. En `_actions.ts` queda la nota con la medición, junto al `fetch` que la motiva. El `grep` de verificación de la tarea 1 sigue pasando.
- **Commit:** `b613d2c`

### 2. [Regla 3 - Bloqueo] El candado de `NODE_ENV` haría imposible el e2e

- **Encontrado en:** Tarea 1 (diseño), confirmado sobre el bundle en la tarea 2
- **Problema:** `next start` corre con `NODE_ENV=production` y Next inlinea el valor, así que el candado que pide 02-RESEARCH §7.3 no distingue Playwright de un despliegue.
- **Arreglo:** candado de tres vueltas (`NODE_ENV`, `VERCEL`, `NEXT_PUBLIC_VIVAGUEST_FEED_LOCAL`), documentado con la medición y con cinco tests que lo cubren. `playwright.config.ts` enciende la variable en su `webServer`.
- **Commit:** `f979713` y `5d192b7`

### 3. [Regla 2 - Funcionalidad crítica] `revelarUrlIcal` y `revalidarFeedGuardado`

- **Encontrado en:** Tarea 2
- **Problema:** el plan lista dos actions, pero el toggle `Mostrar` y el botón `Validar de nuevo` de UI-SPEC §10.4 no son implementables sin sacar la URL del servidor, y bajarla como prop rompe T-02-74.
- **Arreglo:** dos actions más, cada una con su `exigirAdmin()` delante de la fábrica administrativa. `revalidarFeedGuardado` nunca devuelve la URL.
- **Commit:** `b613d2c`

### 4. [Regla 2 - Funcionalidad crítica] Techo de 5 MiB en el cuerpo del feed

- **Encontrado en:** Tarea 1
- **Problema:** T-02-79 nombra "respuesta enorme", y `AbortSignal.timeout` cubre la lentitud pero no el tamaño: `res.text()` acumula el cuerpo entero en memoria.
- **Arreglo:** lectura por el reader del stream con presupuesto de bytes, que corta durante la descarga.
- **Commit:** `f979713`

### 5. [Regla 3 - Bloqueo] Tres archivos fuera de `files_modified`

- `lib/data/feeds.ts` (nuevo): la escritura de salud tenía que ser invocable desde el test de integración, que no puede llamar a una Server Action. Vive en `lib/data/` para que el test ejercite **la misma función** que la action, en vez de reproducirla.
- `lib/domain/dates.ts` / `.test.ts`: `hoyBog()` y `horasDesdeDtstamp()`. No podían ir en `ical-preview.ts`, cuya cabecera declara que ahí no se construye ni un `Date`, ni dentro de un `.tsx`, que `vitest.config.ts` no recoge.
- `playwright.config.ts`: enciende la concesión de loopback.

---

**Total de desviaciones:** 5 auto-corregidas (3 de Regla 3, 2 de Regla 2)
**Impacto:** ninguna amplía el alcance. Cuatro son correcciones a supuestos del plan que la medición desmintió; la quinta es la mitigación de una amenaza que el propio plan lista.

## Problemas encontrados

- **El worktree arrancó seis commits por detrás de la base indicada** (`2a35c53` en vez de `e6bee80`). Se corrigió con `git merge --ff-only`, que es no destructivo porque el HEAD era ancestro del objetivo.
- **`getComputedStyle` serializa los colores como `oklch(1 0 0)` mientras la capa de tokens los declara como `oklch(100% 0 0)`.** Comparar la cadena declarada contra la computada daba un rojo que no significaba nada. La aserción del botón `outline` resuelve los dos tokens con una sonda, así sigue midiendo contra los tokens y no contra un literal, que es lo que sobrevive al rebrand.

## Deuda declarada

- **Las cuatro capturas de `public/guia-airbnb/`.** No existen y no son inventables: salen de la cuenta real de VivaGuest. `GuiaAirbnb` renderiza completo sin ellas y las pinta si aparecen, así que es una carpeta de `public/` lo que falta, no código. Es la deuda 6 del UI-SPEC y el plan 02-15 la recoge.
- **Ninguna fixture demuestra que el `.ics` de Airbnb de 2026 tenga la forma que asumimos.** Es el `checkpoint:human-verify` del plan 02-15: pegar un link real, ver el número y contrastarlo contra el calendario de Airbnb.
- **El copy de los cuatro pasos de la guía está sin verificar contra la UI real de Airbnb**, tal como lo marca el propio UI-SPEC §10.1.

## Configuración del usuario

Ninguna. `NEXT_PUBLIC_VIVAGUEST_FEED_LOCAL` la pone `playwright.config.ts` y **no debe ponerse en ningún despliegue**: es lo que abre la concesión de `127.0.0.1`.

## Listo para lo siguiente

- El criterio 6 del ROADMAP está demostrado contra las fixtures, con los siete estados ejercitados.
- **Para la Fase 3:** `calendar_feeds` ya recibe su fila con la salud poblada y `next_sync_at` en su default, así que el feed entra en la cola del cron sin que este plan sepa nada de esa cola. `property_secrets.ical_url` tiene la URL. `lib/domain/ical-preview.ts` sigue siendo UN SOLO archivo que absorber o borrar, y la divergencia entre su conteo y el del pipeline está declarada como aceptable: no hay que "arreglarla".
- **Aviso para quien toque `guardarFeed`:** el conteo antes-después de `lib/domain/feed.integration.test.ts` es lo único que cubre la vía privilegiada. La base cubre la del usuario con un `42501`, pero `createAdminClient()` está a la vista dentro de esa función.

## Self-Check: PASSED

- Los 9 archivos declarados como creados existen en disco.
- Los 3 commits de tarea (`f979713`, `b613d2c`, `5d192b7`) existen en el historial.
- `npm run ci:arch`, `npx tsc --noEmit`, `test:unit` (285), `test:integration` (52), `playwright test` (76) y `npm run build`: todo verde.
- La semilla del catálogo sigue en 39 unidades, 8 clusters y 5 informativas, verificado por `apartamento.integration.test.ts` y por el `afterAll` de `e2e/calendario.spec.ts`.
- `STATE.md` y `ROADMAP.md` no se tocaron.

---
*Fase: 02-acceso-y-administraci-n-del-cat-logo*
*Completado: 2026-09-02*
