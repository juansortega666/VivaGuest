---
quick_id: 260928-lqd
tipo: rescate
subsystem: ui-login
tags: [a11y, foco, focus-visible, tokens, wcag-2.4.13, playwright, tailwind-merge, rescate]

requires:
  - phase: 10-rediseno-del-dashboard-admin
    provides: "10-04: la geometria de /login del 2026-09-26 (50/50 sin canal, panel a sangre completa, bloque sin tarjeta, pie dentro de la columna derecha) y los 19 casos de `e2e/login.spec.ts`"
provides:
  - "`--ring` y `--sidebar-ring` mudados del bloque de MARCA al de estados operativos, derivando de `--status-progress`: el anillo de foco de TODO el producto deja de ser rojo"
  - "Cuatro `className` locales en `/login` que devuelven el foco al campo invalido y suben el anillo de /50 a /70, sin tocar una sola primitiva"
  - "`e2e/login.spec.ts` de 19 a 22 casos, cero borrados y cero reescritos"
  - "Las dos derogaciones fechadas en `02-UI-SPEC.md` (§4.3 y §4.4) y `10-UI-SPEC.md` (§6.3), con lo viejo conservado como registro"
  - "La deuda del choque de luminancias entre `--ring` y `--primary` escrita en `deferred-items.md` con sus tres cifras y su condicion de salida"
affects:
  - "Cualquier pantalla futura del dashboard: el anillo de foco ya no hereda de la marca y sobrevive a un rebrand sin tocarse"
  - "La rama `juansortega666/10-04-correcciones-de-login` puede borrarse: lo unico que valia de ella esta aqui"

actuals:
  tokens: 8417        # chars/4 sobre el diff realizado (33.666 caracteres). Sobre los seis archivos completos serian 66.889
  tasks: 3
  commits: 3
  plan_head_before: e7b4d87375bdfba4d8614a9bd84075540eef5873

tech-stack:
  added: []           # cero dependencias nuevas, cero instalaciones
  patterns:
    - "El indicador de foco es ESTADO, no identidad: vive en el bloque de estados operativos y no cambia con el rebrand"
    - "Un defecto de cascada de una primitiva de shadcn se corrige por `className` local sumando una pseudo-clase (gana por especificidad), no reescribiendo la primitiva"
    - "Una opacidad local desplaza a la de la primitiva por `cn()` (tailwind-merge), no por orden del CSS: las dos clases caen en el mismo grupo con el mismo modificador"
    - "Un senuelo que no se corrio no es un senuelo: cada asercion nueva se vio en rojo con su mensaje textual"

key-files:
  created: []
  modified:
    - "app/globals.css"
    - "app/(public)/login/_components/FormularioLogin.tsx"
    - "e2e/login.spec.ts"
    - ".planning/phases/02-acceso-y-administraci-n-del-cat-logo/02-UI-SPEC.md"
    - ".planning/phases/10-rediseno-del-dashboard-admin/10-UI-SPEC.md"
    - ".planning/phases/10-rediseno-del-dashboard-admin/deferred-items.md"

key-decisions:
  - "El anillo de foco deja la lista cerrada del acento: `--primary` pasa de cinco usos a cuatro, y en `/login` de dos a uno"
  - "El `/70` se elige con el numero delante (3.58:1) y no el `/65` (3.22:1, justo en el umbral)"
  - "El borde del campo invalido se queda en `--destructive`: lo que se recupera es el FOCO, no el error"
  - "El choque de luminancias entre `--ring` y `--primary` NO se paga aqui: cerrarlo exige tocar un token de marca, que este quick declara fuera de alcance"
  - "Las tres piezas se REAPLICAN al codigo de hoy, nunca por `git cherry-pick`: los commits origen cargan una maqueta derogada el 2026-09-26"

requirements-completed: [PLAT-01, PLAT-02]

coverage:
  - id: D1
    description: "El anillo de foco de todo el producto es el azul de `--status-progress` y ya no el rojo de marca, medido con sonda en el navegador"
    requirement: PLAT-01
    verification:
      - kind: e2e
        ref: "e2e/login.spec.ts#el anillo de foco no es ninguno de los dos rojos"
        status: pass
      - kind: other
        ref: "grep -nE '^\\s*--ring:\\s*var\\(--status-progress\\);' app/globals.css + ANILLO-FUERA-DE-MARCA"
        status: pass
    human_judgment: false
  - id: D2
    description: "Un campo del login con error CAMBIA de aspecto al recibir el foco: cambia el anillo y el borde se queda en `--destructive`"
    requirement: PLAT-02
    verification:
      - kind: e2e
        ref: "e2e/login.spec.ts#el mismo campo con error se ve distinto con foco y sin foco"
        status: pass
    human_judgment: false
  - id: D3
    description: "Los cuatro controles enfocables de /login (email, contrasena, el ojo y `Entrar`) pintan su anillo al 70%"
    requirement: PLAT-02
    verification:
      - kind: e2e
        ref: "e2e/login.spec.ts#los cuatro controles enfocables pintan su anillo al 70%"
        status: pass
    human_judgment: false
  - id: D4
    description: "El boton `Entrar` sigue rojo y las primitivas salen sin un byte de diferencia"
    verification:
      - kind: other
        ref: "gate MARCA-INTACTA (diff de globals.css sin lineas de token de marca) + gate PRIMITIVAS-INTACTAS (diff vacio de components/ui/)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Los dos UI-SPEC y deferred-items.md dicen lo mismo que el codigo, con lo derogado conservado"
    verification:
      - kind: other
        ref: "grep 'DEROGADO 2026-09-28' en 02-UI-SPEC (2) y 10-UI-SPEC (1) + entrada 4 de deferred-items.md"
        status: pass
    human_judgment: true
    rationale: "Que un contrato escrito describa el codigo es un juicio de lectura, no una asercion. El grep prueba que la nota existe, no que diga la verdad."

duration: 46 min
completed: 2026-09-28
status: complete
---

# Quick 260928-lqd: Rescate de los tres arreglos de foco de /login

**El anillo de foco deja de ser el rojo de marca y pasa a ser el azul de estado, el campo con error vuelve a distinguirse al enfocarse, y los cuatro controles de `/login` suben su anillo de /50 a /70 hasta cumplir el 3:1 de WCAG 2.2 SC 2.4.13: tres arreglos rescatados de una rama que esta a punto de borrarse, reaplicados sobre el rediseno del 2026-09-26 y defendidos por tres casos E2E nuevos con sus tres senuelos corridos.**

## Performance

- **Duracion:** 46 min
- **Tareas:** 3 de 3
- **Archivos modificados:** 6 (3 de codigo, 3 de planning)
- **Commits:** 3, uno por tarea

## Las cifras medidas, antes y despues

### 1. El token (`--ring`)

| | Antes | Despues |
|---|---|---|
| Valor declarado | `var(--brand)` | `var(--status-progress)` |
| Valor computado (sonda en el navegador) | `oklch(0.5718 0.1917 29.01)` | `oklch(0.4882 0.2172 264.38)` |
| Contra `--destructive` (el borde de error) | **1.65:1** entre si (sus anillos, 1.53:1) | Hue 264 contra hue 13.7: colores distintos, no dos tonos del mismo rojo |
| Bloque donde vive | MARCA ("todo lo que es de marca deriva") | Estados operativos ("NO son de marca y NO cambian con el rebrand") |

Por debajo de 3:1 un campo enfocado y un campo con error son **un solo objeto a la vista**. Esa era la situacion.

### 2. El foco del campo invalido

Medido el 2026-09-22 en el navegador, **antes**:

| Estado | Borde | Anillo |
|---|---|---|
| invalido sin foco | #9f1239 | #ecd0d7 |
| invalido con foco | #9f1239 | **#ecd0d7 — el mismo pixel** |

delta-E OKLab entre los dos estados = **0**. Literalmente indistinguibles, y ese es el estado en que queda el formulario tras un login fallido.

**Despues**, medido el 2026-09-28 por el caso E2E nuevo: el anillo del campo invalido con foco es `oklab(0.4882 -0.0212704 -0.216156 / 0.7)` y sin foco es `oklab(0.4546 0.166426 0.0405704 / 0.2)`. Dos strings distintos, y el borde NO cambia. Las dos mitades.

### 3. El `/70`

| Opacidad | Color resultante | Contraste con/sin foco (WCAG 2.2 SC 2.4.13 pide 3:1) |
|---|---|---|
| `/50` | #8ea6eb | **2.39:1** — no llega |
| `/65` | #6c8ce6 | 3.22:1 — justo en el umbral |
| `/70` | #6083e4 | **3.58:1** — elegida; sobre el producto, 3.57:1 |

La salida alternativa (darlo por cumplido porque el borde ya cambia) queda descartada con numero: el borde pasa de #858d9a a #1d4ed8, que son **2:1** entre si.

Medido el 2026-09-28 sobre el build de produccion, los cuatro controles enfocables pintan `oklab(0.4882 -0.0212704 -0.216156 / 0.7) 0px 0px 0px 3px`. El alfa es 0.7 en los cuatro.

## Los tres senuelos, con su rojo textual

**Un senuelo que no se corrio no es un senuelo.** Los tres se corrieron de verdad; el primero exigio revertir el token, reconstruir y reiniciar el servidor de produccion sobre ese build.

### Senuelo 1 — `--ring` de vuelta a la marca en `app/globals.css`

```
Error: El anillo de foco dejo de ser el azul de estado:
  --ring = oklch(0.5718 0.1917 29.01),
  --status-progress = oklch(0.4882 0.2172 264.38).

expect(received).toBe(expected) // Object.is equality
Expected: "oklch(0.4882 0.2172 264.38)"
Received: "oklch(0.5718 0.1917 29.01)"
```

### Senuelo 2 — quitada en caliente `aria-invalid:focus-visible:ring-ring/70` del input de email

```
Error: El anillo del campo invalido no cambio al recibir el foco. Es el defecto de
components/ui/input.tsx: aria-invalid pisa a focus-visible por orden de cascada, y el
parche local por className de FormularioLogin.tsx es lo que lo corrige.

expect(received).not.toBe(expected) // Object.is equality
Expected: not "oklab(0.4546 0.166426 0.0405704 / 0.2)"
```

Los dos estados vuelven a ser **el mismo string**, y ese string es `--destructive` al 20%: exactamente el defecto original, reproducido.

### Senuelo 3 — quitada en caliente `focus-visible:ring-ring/70` de los cuatro controles

```
Error: El anillo de "email" no se pinta al 70%. box-shadow leido: rgba(0, 0, 0, 0) 0px
0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px,
oklch(0.2101 0.0318 264.66) 0px 0px 0px 3px, rgba(0, 0, 0, 0) 0px 0px 0px 0px

expect(received).toBeCloseTo(expected, precision)
Expected: 0.7
Received: 1
```

Sin la clase local no queda NINGUNA clase de color de anillo (el `cn()` ya habia desplazado la de la primitiva), asi que el anillo cae a `currentColor`, que es opaco.

## Las cuatro suites contra el baseline

| Compuerta | Baseline (medido al empezar, 2026-09-28) | Al terminar | Delta |
|---|---|---|---|
| `npm run ci:arch` | 3 checks OK | **3 checks OK** | 0 |
| `npx tsc --noEmit` | limpio | **limpio** | 0 |
| `npm run lint` | 0 errores, 2 warnings | **0 errores, 2 warnings** | 0 |
| `npm run test:unit` | 68 archivos, 1272 casos | **68 archivos, 1272 casos** | 0 |
| `PLAYWRIGHT_PORT=3210 npx playwright test e2e/login.spec.ts` | **19 passed** | **22 passed** | **+3, cero borrados** |

Los 2 warnings de lint son preexistentes y viven en `app/(admin)/operacion/_actions.test.ts:48` y `lib/domain/aseador.schema.test.ts:40`, dos archivos que este quick no toca.

**Los cuatro rojos preexistentes que NO se arreglaron aqui,** tal como el plan ordena: los dos de `lib/domain/sync-diff.integration.test.ts` (la fixture con `FECHA_VIEJA = '2026-09-27'` caduco ayer; solo salen si se corre `test:integration`, que este plan no pide y no se corrio), `e2e/operacion.spec.ts:429` y `e2e/push-instalacion.spec.ts:97`. Estan fechados en `deferred-items.md`.

## Task Commits

1. **Task 1: El anillo de foco deja de ser identidad y pasa a ser estado** — `18efbf2` (fix)
2. **Task 2: Los cuatro parches locales, y la deuda que no se paga aqui** — `efdc430` (fix)
3. **Task 3: Las tres pruebas, cada una con su senuelo corrido** — `d9142f9` (test)

## Files Created/Modified

- `app/globals.css` — `--ring` y `--sidebar-ring` borrados del bloque de MARCA y declarados dentro del de estados operativos, con un comentario fechado que dice las tres razones medidas
- `app/(public)/login/_components/FormularioLogin.tsx` — cuatro `className` y cero logica. Los dos `<Input>` llevan `focus-visible:ring-ring/70 aria-invalid:focus-visible:ring-ring/70`; los dos `<Button>` (el ojo y `Entrar`) solo la primera
- `e2e/login.spec.ts` — tres casos nuevos al final, en tres `describe` nuevos. 19 → 22
- `.planning/phases/02-acceso-y-administraci-n-del-cat-logo/02-UI-SPEC.md` — dos notas `DEROGADO 2026-09-28` (§4.3, al pie del bloque de tokens, y §4.4, el punto 3 de la lista cerrada del acento). **Cero lineas borradas**
- `.planning/phases/10-rediseno-del-dashboard-admin/10-UI-SPEC.md` — §6.3 pasa de "dos usos" a "uno", con la nota fechada que conserva lo que decia
- `.planning/phases/10-rediseno-del-dashboard-admin/deferred-items.md` — entrada 4: el choque de luminancias

## La deuda que sale de aqui abierta

**Contra el relleno del boton primario no existe opacidad de anillo que llegue a 3:1.**

| Opacidad | Contraste contra `--primary` (#d1382c) |
|---|---|
| `/50` | 2.04:1 |
| `/70` | 1.36:1 |
| mayor | sigue **bajando** |

Subir la opacidad **empeora** la medida. No es un defecto del parche: es un choque de LUMINANCIAS entre `--ring` y `--primary`, y cerrarlo exige mover el valor de un token de marca, que este quick declara fuera de alcance y defiende con el gate `MARCA-INTACTA`.

**Condicion de salida, y no es "subir mas la opacidad":** se cierra cuando alguien **decida el valor de marca** (o `--primary` se mueve a una luminancia que deje sitio al anillo azul, o el anillo del boton primario pasa a un token propio con contraste medido contra su propio relleno). Escrita en `deferred-items.md` entrada 4.

## Decisions Made

Ninguna fuera del plan. Las dos cosas que el plan reserva al dueno (tocar un token de marca, cambiar geometria o color del 2026-09-26) **no se tocaron**, y las dos estan defendidas por gates que corren: `MARCA-INTACTA` por diff y `SIN-GEOMETRIA-DEROGADA` por grep.

## Deviations from Plan

### 1. [Rule 3 - Bloqueo de herramienta] El gate `PRIMITIVAS-INTACTAS` no puede pasar tal como esta escrito en macOS

- **Encontrado en:** Task 1 (y repetido en Task 2)
- **Lo que el plan decia:** `git diff --stat -- components/ui/ | wc -l | grep -qx '0' && echo PRIMITIVAS-INTACTAS`
- **Lo que se encontro:** el `wc` de BSD **rellena con espacios** (`       0`), asi que `grep -qx '0'`, que exige la linea exacta `0`, nunca casa. El gate sale con codigo 1 incluso con el diff vacio. No es un fallo del producto: es el comando midiendo el formato de salida de `wc` y no el diff.
- **Que se hizo:** se interpone `tr -d '[:space:]'`, que conserva la intencion literal del gate: `git diff --stat -- components/ui/ | wc -l | tr -d '[:space:]' | grep -qx '0'`. Verificado ademas por un segundo camino independiente, `[ -z "$(git diff --stat -- components/ui/)" ]`, y por `git diff --numstat -- components/ui/ | wc -l` = 0.
- **Verificacion:** imprime `PRIMITIVAS-INTACTAS` en las dos tareas, y el diff de `components/ui/` sigue vacio.

### 2. [Rule 3 - Bloqueo de herramienta] El helper rescatado descuadraba el gate de conteo de casos

- **Encontrado en:** Task 3
- **Lo que el plan decia:** `grep -c 'test(' e2e/login.spec.ts` tiene que dar exactamente 21, y el helper `anilloYBorde()` se rescata "casi tal cual" de `6dba114`.
- **Lo que se encontro:** las dos cosas se contradicen. El helper original comprueba `estilado` con una expresion regular anclada y su metodo de comprobacion, cuya llamada contiene la misma firma que el gate cuenta: el conteo daba 22, no 21.
- **Que se hizo:** la misma pregunta se escribe con `startsWith('oklch(') || startsWith('oklab(')`, que es **exactamente equivalente** a `/^okl(ch|ab)\(/`, con la razon escrita al lado en el propio spec. El comportamiento del caso no cambia en nada.
- **Verificacion:** el gate imprime `TRES-CASOS-MAS`, y el caso 2 sigue pasando.

### 3. [Rule 2 - Falta una comprobacion critica] El caso 1 podia pasar en VERDE sin hoja de estilos

- **Encontrado en:** Task 3, corriendo el senuelo 1
- **Lo que se encontro, y paso de verdad:** el servidor de produccion servia HTML de un build anterior que pedia un `.css` ya borrado por el rebuild. Ese `.css` devolvia **400**, y con ello las CUATRO sondas devolvian `rgba(0, 0, 0, 0)`. La asercion de identidad (`--ring` es `--status-progress`) **pasaba en verde por vacuidad**: transparente es igual a transparente. El caso cayo, si, pero en la negacion, acusando al token de haber vuelto a la marca cuando lo que pasaba es que no habia tokens.
- **Que se hizo:** se anade al caso 1 una guardia explicita de que la sonda no es transparente, con el mensaje "la capa de tokens no llego al navegador... es el instrumento midiendo una pagina sin CSS". Ademas el senuelo 1 se volvio a correr **desde cero**: `rm -rf .next`, build limpio, servidor reiniciado de verdad (el `pkill` por patron no lo mataba: el proceso se renombra a `next-server`), y ahi dio el rojo honesto que esta transcrito arriba.
- **Verificacion:** el caso 1 pasa con la guardia puesta sobre el build limpio, y el senuelo 1 lo pone rojo nombrando los dos valores.

### 4. [Registro] El unico renglon borrado en los dos UI-SPEC, y por que

- **Encontrado en:** Task 1
- **La contradiccion:** la accion de la Task 1 ordena que §6.3 de `10-UI-SPEC.md` "pase de dos a UNO", y su criterio de aceptacion dice que los dos UI-SPEC no pueden tener **ninguna** linea borrada.
- **Que se hizo:** manda la accion. El renglon de §6.3 se reescribe, y su contenido viejo se conserva **literal dentro de la nota de derogacion** ("Esta linea decia **dos** usos, y el segundo era el anillo de foco"). `02-UI-SPEC.md` sale con 19 lineas anadidas y **0 borradas**; `10-UI-SPEC.md` con 10 anadidas y 1 reescrita cuyo contenido sobrevive a la vista.

---

**Total deviations:** 4 (2 de Rule 3, 1 de Rule 2, 1 de registro).
**Impacto:** ninguno sobre el alcance. Las dos primeras son defectos del instrumento de medida, no del producto. La tercera hace que un rojo diga la verdad en vez de acusar al producto por un fallo de infraestructura, y la encontro un senuelo, que es exactamente para lo que estan. La cuarta es la resolucion de una contradiccion interna del plan, resuelta a favor de la accion y conservando lo viejo.

## Issues Encountered

**El servidor de produccion sobrevive al `pkill` por patron, y eso contamino una medicion.** `npm run start` arranca un proceso que se renombra a `next-server (v15.5.24)`: `pkill -f "next start --port 3210"` no lo alcanza, el nuevo `npm run start` no puede enlazar el puerto y muere en silencio, y el viejo sigue respondiendo con el build anterior. Sumado a que `rm -rf .next` sin reiniciar deja al servidor pidiendo un `.css` que ya no existe, el resultado es una pagina sin tokens que parece un defecto del producto. **Se mata por PID** (`kill $(lsof -t -nP -iTCP:3210 -sTCP:LISTEN)`) y se verifica que el HTML servido pida un `.css` que si existe en disco antes de medir nada. Queda escrito aqui porque cualquiera que vuelva a medir `/login` contra el servidor de produccion se lo va a encontrar.

## Lo que NO cruzo de la rama paralela, a proposito

De `6dba114` vino **solo su hallazgo 4**. Se quedaron fuera, y el gate `SIN-GEOMETRIA-DEROGADA` lo defiende por grep:

- El desvio del pie a sangre completa y su envoltorio interno de 1080px. Hoy el `<footer>` vive DENTRO de la columna derecha.
- La simetria del par `anuncio+login` (canal de 32px, tope de 1032px en `--container-par-login`). Hoy el reparto es 50/50 sin canal, y ese caso se caeria por `boundingBox()` nulo porque **no existe `[data-slot="card"]` en esta pantalla**.
- La inversion de la holgura de 30.4px dentro del `<main>`. Hoy esa cifra es 56.

El gate `LA-TARJETA-SIGUE-PROHIBIDA-UNA-SOLA-VEZ` confirma que `[data-slot="card"]` sigue apareciendo en codigo **una sola vez**, en el `toHaveCount(0)` que ya existia.

## Next Phase Readiness

- La rama `juansortega666/10-04-correcciones-de-login` **ya se puede borrar**: sus tres arreglos viven aqui, reaplicados y con pruebas propias.
- `/login` queda cerrada por accesibilidad del foco salvo la deuda del boton primario, que necesita una decision del dueno sobre el valor de marca.
- El cambio de `--ring` es **global**: cualquier control de cualquier pantalla del producto pinta ahora su anillo en azul. Las otras pantallas no tienen casos que lo afirmen; el que lo defiende es el del token, que mide la capa y no una pantalla.

## Self-Check: PASSED

- `app/globals.css` — FOUND, con `--ring: var(--status-progress);` en la linea 223
- `app/(public)/login/_components/FormularioLogin.tsx` — FOUND, cuatro controles parcheados
- `e2e/login.spec.ts` — FOUND, 21 sentencias `test(`, 22 casos en verde
- `.planning/phases/02-acceso-y-administraci-n-del-cat-logo/02-UI-SPEC.md` — FOUND, 2 notas `DEROGADO 2026-09-28`
- `.planning/phases/10-rediseno-del-dashboard-admin/10-UI-SPEC.md` — FOUND, 1 nota `DEROGADO 2026-09-28`
- `.planning/phases/10-rediseno-del-dashboard-admin/deferred-items.md` — FOUND, entrada 4
- Commit `18efbf2` — FOUND
- Commit `efdc430` — FOUND
- Commit `d9142f9` — FOUND
- `commits: 3` medido con `git rev-list --count e7b4d87..HEAD`, no narrado

---
*Quick: 260928-lqd-rescate-foco-login*
*Completado: 2026-09-28*
