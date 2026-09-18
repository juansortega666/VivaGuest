---
status: resolved
trigger: "El admin se queda sin su toast de confirmacion ~32% de las veces en /operacion, aunque la accion si se ejecuta. D-09-02-A."
created: 2026-09-18T00:00:00-05:00
updated: 2026-09-18T00:00:00-05:00
---

## Current Focus

bug_class: Heisenbug (carrera entre dos round-trips: la Server Action contra el refresh de Realtime)

reasoning_checkpoint:
  hypothesis: "El `useEffect` que publica el toast NUNCA CORRE. Un `router.refresh()` de `SincronizacionEnVivo` aterriza mientras la Server Action esta en vuelo; el arbol RSC nuevo ya no trae la fila (cancelada -> plegada por BloqueDia.tsx:166; reprogramada -> otro dia); React desmonta FilaAseo -> MenuAseo -> el dialogo, y con el muere el useActionState. El resultado llega a un componente que ya no existe."
  confirming_evidence:
    - "ROJO medido (run8): +549 SUBMIT / +587 REFRESH realtime / +760 RENDER tabla [] / +762 DESMONTA menu+dialogo. NUNCA aparece `EFECTO ok` ni `TOAST`."
    - "VERDE de control (run3): +276 EFECTO ok / +276 TOAST / +278 DESMONTA. El resultado gana la carrera por 2 ms."
    - "`RENDER tabla []` prueba que el arbol RSC que llego ya NO trae la fila: el desmontaje es consecuencia del dato, no de un reset de estado."
    - "Correlacion 1:1 sobre 10 rojos (7 de 09-02 + 3 mios): los UNICOS dos que fallan (Cancelar, Reprogramar) son exactamente los dos cuya fila SALE del DOM."
  falsification_test: "si en un rojo apareciera `EFECTO ok` o `TOAST` sin toast en el DOM, la causa seria de sonner y no del desmontaje. No aparecio en ninguno de los 3 rojos capturados."
  fix_rationale: "publicar el toast DENTRO de la funcion que `useActionState` ejecuta, no en un `useEffect` posterior. Esa funcion es un closure en vuelo: sobrevive al desmontaje porque `toast` es un singleton de modulo. Medido que el SUBMIT (+549) precede al DESMONTA (+762), asi que la funcion ya arranco cuando el componente muere."
  blind_spots: "no mido el origen exacto del evento de Realtime que dispara ese refresh concreto; es irrelevante para la causa (cualquier refresh en la ventana la detona). No mido los 3 dialogos latentes con una carrera forzada."
  candidate_causes:
    - "codigo: el toast se publica desde un efecto atado al ciclo de vida de un componente que la propia accion destruye"
    - "datos/arquitectura: la fila sale de `visibles` al cancelarse (BloqueDia.tsx:166), que es lo que hace desaparecer al ancestro del dialogo"
    - "entorno/timing: Realtime + debounce de 400 ms deciden quien gana la carrera; sin Realtime el defecto no se manifiesta"
  and_gate: "SI. Hacen falta DOS condiciones a la vez: (1) que la accion saque la fila del DOM y (2) que el refresh aterrice antes que la respuesta de la action. Por eso Cerrar y Reasignar, que tienen el MISMO codigo, no fallan: les falta la condicion (1)."

test: "aplicar el arreglo y correr una tanda de 12+ corridas; contra-prueba con el andamio puesto, esperando ver SUBMIT -> DESMONTA -> TOAST (el toast publicado DESPUES del desmontaje)"
expecting: "0 rojos en la tanda, y el andamio mostrando el toast publicado tras la muerte del componente"
next_action: "restaurar los originales y aplicar el arreglo en DialogoCancelarAseo.tsx y DialogoReprogramar.tsx"

## Symptoms

expected: tras cancelar o reprogramar un aseo, aparece `[data-sonner-toast]` con el texto exacto
actual: ~32% de las veces no aparece ningun toast, ni contenedor
errors: "expect(locator).toBeVisible() failed / element(s) not found" tras 15s
reproduction: "npm run db:reset && PLAYWRIGHT_PORT=3210 npx playwright test e2e/operacion.spec.ts --grep-invert CRITERIO" repetido
started: medido en 09-02 (2026-09-18), 7 de 22 corridas

## Eliminated

- hypothesis: "la pila de sonner llena impide renderizar nuevos toasts"
  evidence: "09-02 midio 0 toasts en el DOM en el instante del rojo, y `paginaAdmin` es fixture de ambito de test (no hay pila que drenar)"
  timestamp: 2026-09-18 (heredado)

- hypothesis: "`_actions.ts` llama a revalidatePath y eso compite con el toast"
  evidence: "grep sobre app/(admin)/operacion/_actions.ts: las 6 apariciones de `revalidatePath` son TODAS menciones dentro del comentario de cabecera (lineas 19-52). Cero llamadas reales. El comentario dice explicitamente que fue sustituido por router.refresh() por un cuelgue medido en 04-14."
  timestamp: 2026-09-18

## Evidence

- timestamp: 2026-09-18 lectura 1
  checked: "app/(admin)/operacion/_components/DialogoCancelarAseo.tsx y DialogoReprogramar.tsx"
  found: "AMBOS SI tienen router.refresh(), dentro de `alCambiarApertura` (lineas 155 y 152). La premisa de partida de que no lo tienen es falsa."
  implication: "pero `alCambiarApertura` es el onOpenChange del AlertDialog/Dialog de Radix, no el callback que se llama en la rama de exito"

- timestamp: 2026-09-18 lectura 2
  checked: "app/(admin)/operacion/_components/MenuAseo.tsx, montaje de los dialogos"
  found: "los 5 dialogos se montan CONDICIONALMENTE: `{dialogo === 'cancelar' && <DialogoCancelarAseo ... onAbiertoChange={(a) => !a && setDialogo(null)} />}`. En la rama de exito, `onAbiertoChange(false)` hace `setDialogo(null)` y DESMONTA el dialogo. `alCambiarApertura` NO corre en esa ruta, asi que el router.refresh() del dialogo tampoco."
  implication: "el camino de exito NO dispara router.refresh() desde el dialogo. La carrera, si existe, es con otro refresh (Realtime) o con el desmontaje del propio MenuAseo."

- timestamp: 2026-09-18 lectura 3
  checked: "app/layout.tsx"
  found: "el <Toaster /> vive en el ROOT layout (linea 73), hermano de <TooltipProvider>{children}</TooltipProvider>. No esta dentro del arbol de /operacion."
  implication: "un router.refresh() de /operacion no deberia desmontarlo: la posicion en el arbol no cambia. Hay que comprobar si sonner devuelve null sin toasts, porque entonces `haToaster: 0` NO prueba desmontaje."

- timestamp: 2026-09-18 experimento 1 (andamio, 8 corridas)
  checked: "instrumentacion de MONTA/DESMONTA/EFECTO/TOAST/SUBMIT/REFRESH/RENDER en los dos dialogos, MenuAseo, TablaDia y SincronizacionEnVivo"
  found: |
    ROJO (run8):  +0 RENDER tabla ["dd91"] / +47 MONTA menu / +343 MONTA cancelar /
                  +549 SUBMIT / +587 REFRESH realtime / +760 RENDER tabla [] /
                  +762 DESMONTA menu / +762 DESMONTA cancelar.  SIN `EFECTO ok`, SIN `TOAST`.
    VERDE (run3): +276 EFECTO ok / +276 TOAST / +278 DESMONTA.
    3 rojos de 8 corridas, todos en `cancelar`, todos con la misma forma.
  implication: "el toast nunca se publica. No es que sonner lo pierda: es que `toast.success()` no se llama."

- timestamp: 2026-09-18 lectura 4
  checked: "sonner 2.0.8 en node_modules"
  found: "el store SI reproduce el backlog a un suscriptor nuevo (`subscribe` llama `getActiveToasts().forEach(subscriber)`, dist/index.mjs:140-149). Y el Toaster devuelve `null` cuando no hay toasts (dist/index.mjs:1153)."
  implication: "DOS correcciones a 09-02: (1) la teoria de que sonner no reproduce el backlog es falsa para esta version; (2) `haToaster: 0` NO probaba desmontaje del contenedor, es el comportamiento normal sin toasts."

- timestamp: 2026-09-18 alcance
  checked: "particionar() en BloqueDia.tsx:276-293, el montaje de los 5 dialogos, MenuAseo.marcarRevisado y FilaAlerta"
  found: |
    Sacan la fila del DOM: Cancelar (sale de `visibles`) y Reprogramar (se va a otro BloqueDia).
    NO la sacan: Cerrar (terminado se queda visible), Reasignar, Confirmar. Crear vive en page.tsx, fuera de las filas.
    INMUNES por construccion: MenuAseo.marcarRevisado y FilaAlerta, que publican el toast con
    `await` dentro de una funcion async, NO desde un useEffect.
  implication: "el repo YA contiene el patron correcto en dos sitios. El arreglo lo adopta, no lo inventa. Alcance: 2 detonados + 3 latentes con la misma forma."

## Resolution

root_cause: |
  El aviso se publicaba desde un `useEffect` que vive dentro de un componente que la
  propia accion hace desaparecer.
    - DialogoCancelarAseo.tsx:130-145 y DialogoReprogramar.tsx:129-144 (antes del arreglo):
      `toast.success(estado.mensaje)` dentro del efecto que observa `useActionState`.
    - MenuAseo.tsx:395-402: el dialogo se monta CONDICIONALMENTE dentro de la fila.
    - BloqueDia.tsx:166 + particionar() en :284: la tabla pinta solo `visibles`, y un aseo
      cancelado sale de ahi.
  Cuando un `router.refresh()` de SincronizacionEnVivo.tsx:111-114 aterriza en el instante en
  que la Server Action resuelve, el arbol RSC nuevo llega sin la fila, React desmonta
  FilaAseo -> MenuAseo -> el dialogo, muere el useActionState, y el efecto no corre nunca.
  AND-gate: hacen falta DOS condiciones (publicar desde un efecto Y que la accion saque la
  fila del DOM). Por eso Cerrar y Reasignar, con el mismo codigo, nunca fallaron.

fix: |
  El aviso pasa del `useEffect` a la funcion que `useActionState` ejecuta, que se publica en
  el mismo microtask en que aterriza la respuesta, por delante de cualquier commit de React.
  El efecto se queda solo con cerrar el dialogo. Es el patron que MenuAseo.marcarRevisado()
  y FilaAlerta ya usaban.

verification: |
  guardrail_verdict: accepted
  - señal 1 (el caso sigue pudiendo ponerse rojo): SEÑUELO con `git checkout HEAD~1 --` sobre
    los dos archivos -> 3 rojos de 18 corridas, con el sintoma literal de D-09-02-A. PASS
  - señal 2 (el defecto se fue): 28 corridas seguidas de la reproduccion, 0 rojos.
    Fisher una cola contra la linea base 7/22 de 09-02: p = 0.0017. Binomial contra p=0.32:
    2.0e-05. Contra el señuelo de hoy (3/18): p = 0.054, declarado como marginal. PASS
  - señal 3 (mecanismo, no solo conteo): con el arreglo + andamio, una corrida con el REFRESH
    aterrizando ENTRE el submit y la resolucion (+428 SUBMIT / +481 REFRESH / +506 TOAST)
    sale verde; ese mismo reparto de tiempos era el rojo. PASS
  - señal 4 (segundo indicador independiente): una corrida roja dura >=50s (se come el
    timeout de 15s). Las 28 con el arreglo caen entre 33.7s y 36.8s, ninguna por encima. PASS
  - señal 5 (sin regresion): unit 1236/1236, integracion 205/205, pgTAP 389/389, tsc sin
    salida, lint 0 errores + los 2 warnings preexistentes, build OK, ci:arch OK. PASS
  - aserciones: e2e/operacion.spec.ts NO esta en el diff. Ningun timeout subio, ningun
    `exact: true` se cayo. PASS

files_changed:
  - app/(admin)/operacion/_components/DialogoCancelarAseo.tsx
  - app/(admin)/operacion/_components/DialogoReprogramar.tsx
