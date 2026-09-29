# Fase 10 · Hallazgos fuera de alcance, encontrados al ejecutar 10-04

Nada de esto lo causó el rediseño de `/login`. El diff completo del plan 10-04 son
nueve archivos y ninguno vive fuera de `app/(public)/login/`, `app/globals.css`,
`e2e/login.spec.ts` y `.planning/`. Se anotan aquí porque la regla de alcance del
ejecutor prohíbe arreglar lo que no causó, y prohíbe también callárselo.

---

## 1. `sync-diff.integration.test.ts` tiene dos fechas literales que caducaron el 2026-09-28

**Estado:** 2 casos rojos de 205 en `npm run test:integration`. Corren verdes el
2026-09-19 (lo reporta `10-03-SUMMARY.md`) y rojos el 2026-09-28.

```
FAIL lib/domain/sync-diff.integration.test.ts > una reserva que cambia de fechas
  > 1: el aseo viejo se cancela y el nuevo nace SIN CONFIRMAR
  > 3: confirmado y asignado pero SIN empezar sí se cancela
AssertionError: expected +0 to be 1
  expect(t1.corrida?.cleanings_cancelled).toBe(1)
```

**Causa, y es la que el propio archivo predijo.** Sus líneas 70 y 71 son

```ts
const FECHA_VIEJA = '2026-09-27';
const FECHA_NUEVA = '2026-09-29';
```

y hoy es **2026-09-28**. `FECHA_VIEJA` cayó al pasado, así que el aseo viejo ya no
está por encima del piso de la corrida y el diff no lo cancela: `cleanings_cancelled`
sale 0 donde el caso espera 1.

La cabecera de ese mismo archivo, líneas 43 a 50, lo advierte literalmente:

> *"LAS FECHAS RELATIVAS NO SON UN LUJO. La ventana protegida se define respecto a
> HOY. Una fixture con fechas literales que hoy cae dentro de la ventana mañana cae
> fuera, y el test que la usa deja de probar lo que decía probar SIN QUE NADA SE
> PONGA ROJO."*

Los tres candados de fecha se escribieron con `feedConCheckoutRelativo`. **Estos dos
casos no**, y es donde la bomba estaba armada.

**Por qué no se arregla aquí.** El arreglo no es cambiar el número: es convertir
`FECHA_VIEJA` y `FECHA_NUEVA` en relativas y regenerar las dos fixtures
(`airbnb-real-anonimizado.ics` y `airbnb-real-movida.ics`) para que sus `DTEND`
también lo sean. Eso es trabajo sobre el dominio de sincronización, que este plan
declara explícitamente fuera de alcance ("NO se toca `_actions.ts`, ni auth, ni el
middleware, ni ninguna ruta distinta de `/login`").

**Consecuencia de segundo orden, y hay que tenerla en cuenta al leer la suite E2E:**
cuando esos dos casos mueren, el `afterAll` de `limpiarSync()` deja filas en
`cleanings`, y `e2e/operacion.spec.ts` es sensible a eso. Su propio guardia lo dice:

```
Error: La tabla cleanings arranca con 12 filas y este spec cuenta filas en pantalla.
Corre `npm run db:reset` antes de la suite E2E.
```

O sea: correr `test:integration` **antes** de la suite E2E sin un `db:reset` entre
medias contamina la corrida de Playwright mientras estos dos casos sigan rojos.

---

## 2. El stack local de Supabase no arranca completo en esta máquina

**Estado:** `npx supabase start` falla con

```
LegacyHealthCheckTimeoutError: supabase_analytics_vivaguest container is not ready:
unhealthy / supabase_vector_vivaguest ... / supabase_realtime_vivaguest ... /
supabase_storage_vivaguest ... / supabase_studio_vivaguest ...
```

**Causa:** memoria. Docker Desktop tiene 4 GB y los comparte con contenedores de
otros dos proyectos del usuario (`tresur-hope-lite-app`, `tresur-hope-lite-db`,
`alfa-mvp-db`), y la máquina ya viene apretada (ver la nota
`maquina-sin-memoria-docker`). `analytics` (logflare) y `vector` son los pesados, y
`realtime`, `storage` y `studio` caen detrás porque dependen de ellos para logging.

**Cómo se levantó para esta corrida**, sin tocar `supabase/config.toml`:

```bash
npx supabase stop
npx supabase start -x vector,logflare,studio,imgproxy,realtime,edge-runtime
```

Eso deja arriba `db`, `auth`, `rest`, `kong`, `storage`, `pg_meta` e `inbucket`, que
es todo lo que la suite necesita. **`storage` sí hace falta**: sin él,
`e2e/mis-pagos.spec.ts` y `e2e/almacenamiento.spec.ts` fallan con
`No se pudieron subir los bytes del recibo: name resolution failed`, que se lee como
un bug del producto y es un contenedor apagado.

**No es alcance de este plan**, pero merece quedar escrito en `COMO-CORRER-PRUEBAS.md`
o en `.planning/codebase/TESTING.md`: es exactamente el tipo de trampa que esa chuleta
existe para documentar, y cuesta media hora de diagnóstico cada vez.

---

## 3. Dos casos E2E rojos con la base reseteada, ninguno en `/login`

> **CERRADO EL 2026-09-29, en la Task 4 del plan 10-05. El desenlace completo, con
> las dos sondas y la causa, está en el punto 7 de este mismo archivo.** En corto:
> el rojo de `e2e/operacion.spec.ts:429` **no era un test frágil, era un defecto de
> producto** (el `router.refresh()` vivía en el `onOpenChange` del diálogo, que no
> dispara en un cierre programático, así que cancelar, reasignar, reprogramar y
> cerrar escribían en la base y la pantalla no se actualizaba hasta recargar a
> mano); y el de `e2e/push-instalacion.spec.ts:97` quedó **verde**, así que pasa de
> rojo fijo a intermitente conocido del `edge-runtime` apagado.
>
> El texto de abajo se conserva sin tocar, como registro de lo que se midió el
> 2026-09-28 y de por qué no se arregló entonces.

**Estado:** con `npm run db:reset` inmediatamente antes, `PLAYWRIGHT_PORT=3210 npx
playwright test` reporta **171 pasados · 2 fallados · 1 saltado** (174 en total).

| Caso | Síntoma |
|---|---|
| `e2e/operacion.spec.ts:429` — *cancelar un aseo, y el descarte del diálogo dice Volver y nunca Cancelar* | `getByRole('button', { name: 'Ver cancelados (1)' })` no aparece. El diálogo, sus dos botones y la cancelación en sí pasan: lo que no cuadra es el contador global de cancelados |
| `e2e/push-instalacion.spec.ts:97` — *E1, con el permiso concedido queda UNA suscripción viva* | `Test timeout of 30000ms exceeded`. En corrida aislada arrastra además a `E3` |

**Por qué no los causó este plan, y no es una opinión:**

1. El diff completo de 10-04 son nueve archivos
   (`git diff --name-only 5f8d6af..HEAD`) y ninguno vive fuera de
   `app/(public)/login/`, `app/globals.css`, `e2e/login.spec.ts` y `.planning/`.
2. El único archivo global tocado es `app/globals.css`, y su **único cambio
   funcional** es `grid-template-columns: 45% 10% 45%` → `50% 50%` dentro de
   `@utility rejilla-login`. Esa utilidad tiene **un solo consumidor en todo el
   repo**: `app/(public)/login/page.tsx`. Ningún token de color, espaciado,
   tipografía o movimiento cambió de valor.
3. Los 171 verdes incluyen las demás pantallas del admin y del aseador, que se
   autentican tecleando en `/login` por `e2e/fixtures.ts`. Si el rediseño hubiera
   roto el camino de autenticación, no caerían dos casos: caería la suite.
4. `push-instalacion` es sensible al `edge-runtime`, que está excluido del stack
   local por el punto 2 de este archivo.

**Los dos son reproducibles, no intermitentes** (se volvieron a correr aislados y
volvieron a caer). Quedan para quien tenga el alcance de `/operacion` y del carril
de push.

---

## 4. El anillo de foco no llega a 3:1 contra el relleno del botón primario (2026-09-28)

**Encontrado al ejecutar el quick `260928-lqd`** (rescate de los tres arreglos de
foco de `/login`). No lo causó ese quick: lo destapó.

**Estado:** deuda abierta, con número. Contra la superficie clara del login el
anillo al 70% da **3.58:1** y cumple WCAG 2.2 SC 2.4.13. Contra el **relleno del
botón `Entrar`** (`--primary`, #d1382c) no lo cumple ninguna opacidad:

| Opacidad del anillo | Contraste contra `--primary` |
|---|---|
| `/50` | **2.04:1** |
| `/70` | **1.36:1** |
| cualquier valor mayor | sigue **bajando** |

Subir la opacidad **empeora** la medida, porque acerca el anillo a su color pleno
y el color pleno de `--ring` (azul) y el de `--primary` (rojo de marca) tienen
luminancias demasiado parecidas. El 3:1 no se alcanza por esta vía en ningún punto
del recorrido.

**Por qué no es un defecto del parche.** El parche local de
`FormularioLogin.tsx` hace lo único que puede hacer sin salirse de su alcance:
subir la opacidad. Lo que falla es un **choque de luminancias entre `--ring` y
`--primary`**, o sea entre dos tokens, y arreglarlo exige mover el valor de un
token de marca.

**Por qué no se arregla aquí.** El quick `260928-lqd` declara los tokens de marca
(`--brand`, `--brand-identity`, `--brand-gold`, `--primary`, `--sidebar-primary`)
explícitamente fuera de alcance, y tiene un gate por diff (`MARCA-INTACTA`) que lo
hace cumplir: el botón `Entrar` sigue rojo y eso es una decisión del dueño, no una
omisión.

**Condición de salida — y no es "subir más la opacidad".** Se cierra cuando
alguien **decida el valor de marca**: o `--primary` se mueve a una luminancia que
deje sitio al anillo azul, o el anillo del botón primario pasa a un token propio
con contraste medido contra su propio relleno. Cualquier intento de cerrarlo
tocando solo la opacidad está descartado con los tres números de la tabla.

---

## 5. Un caso de `lib/data/operacion.test.ts` NO CORRE, y no está saltado (2026-09-28)

**Encontrado al ejecutar la Task 1 de 10-05**, leyendo el bloque `leerOperacion`
para escribir al lado las unitarias de la ventana. No lo causó este plan: lleva
ahí desde D-08.

**Estado:** un caso invisible. No sale rojo, no sale saltado, no sale en la
cuenta. Simplemente no existe para el runner.

`it('D-08: el límite inferior baja SIETE días, no se queda en hoy', …)` está
declarado **DENTRO** del cuerpo del `it` anterior y **DESPUÉS de su `return`**:

```ts
it('acota la ventana al día de negocio de BOGOTÁ, no al del proceso', () => {
  …
  return leerOperacion(comoCliente(supabase)).then((operacion) => { … });

  it('D-08: el límite inferior baja SIETE días, no se queda en hoy', () => { … });
});
```

Código tras un `return` no se ejecuta, así que el `it` nunca se registra.
**Medido:** `npx vitest run lib/data/operacion.test.ts --reporter=verbose` no
imprime ese nombre ni una vez.

**Lo que esto significa, y es lo incómodo:** el caso que defendía el criterio 7
del ROADMAP en la capa de la CONSULTA (que el límite inferior baja siete días y
no se queda en hoy) nunca se ha corrido. Un cierre de llave mal puesto es
exactamente el modo de fallo que el plan 10-05 persigue con sus señuelos: una
aserción que se cree escrita y no está defendiendo nada.

**Por qué no se arregla en la Task 1.** La propiedad SÍ queda defendida por el
bloque nuevo `la ventana ante un dia pedido`, y en concreto por el caso
`LA VENTANA DE LAS ALERTAS NO SE ESTRECHA NUNCA`, que afirma
`desde <= hoy − VENTANA_ATRAS_DIAS` para los seis valores de `?dia`. O sea que el
agujero está tapado por arriba. Lo que queda pendiente es **sacar el `it` de
donde está** (una llave), y eso toca el caso de la zona, que es el único del
archivo que manipula el reloj del sistema con `vi.useFakeTimers()` fuera de un
`describe` propio. Es un arreglo de dos líneas con un riesgo de arrastrar
`useFakeTimers` a otro caso, y no es de este plan: aquí el eje es la pantalla.

**Condición de salida:** mover el `it` a hermano del anterior y comprobar que la
cuenta del archivo SUBE en uno. Si al desanidarlo el caso sale rojo, es un
hallazgo de segundo orden y hay que medirlo antes de tocar la consulta.

---

## 6. `next dev` en el 3100 CORROMPE el build de producción de la suite E2E (2026-09-28)

**Encontrado al ejecutar la Task 2 de 10-05**, tras perder tres corridas enteras de
`e2e/operacion.spec.ts` contra código correcto. No lo causa este plan: lo dispara
cualquier plan que edite código y corra la suite en la misma sesión.

**Síntoma, y se lee como "la suite está rota":** los 28 casos del spec caen a la
vez, y el `[WebServer]` imprime

```
⨯ TypeError: Cannot read properties of undefined (reading 'call')
    at Object.c [as require] (.next/server/webpack-runtime.js:1:143)
  digest: '2600095951'
```

La pantalla responde 500, así que **todo localizador da `element(s) not found`** y
el rojo apunta a la aserción, no a la causa. El mismo caso corrido aislado con
`-g` pasa, que es lo que hace perder la tarde.

**Causa, medida:** `next dev` y `next build` **comparten el directorio `.next`**.
En esta máquina había un servidor de desarrollo vivo:

```
28483 node node_modules/.bin/next dev --port 3100
74080  └─ next-server (v15.5.24)
```

El watcher de `next dev` recompila con cada edición de archivo y reescribe
`.next/`. Cuando eso cae en medio del `npm run build && npm run start` que
`playwright.config.ts` lanza como `webServer`, el servidor de producción queda con
un manifiesto que apunta a chunks que ya no existen, y el runtime de webpack falla
al resolverlos.

**Y `reuseExistingServer: true` lo agrava**, porque es el default fuera de CI: si
queda un `next start` vivo en el puerto de la corrida anterior, Playwright lo
REUSA sin reconstruir y la suite mide el código de antes de la última edición.

**La receta que sí funciona, medida**, antes de cada corrida de Playwright que
venga después de editar código:

```bash
# 1. que no haya ningun `next dev` sobre este checkout
lsof -tiTCP:3100 -sTCP:LISTEN | xargs -r kill
# 2. que no quede un servidor de la corrida anterior
lsof -tiTCP:3210 -sTCP:LISTEN | xargs -r kill
# 3. build limpio, no incremental
rm -rf .next && npm run build
# 4. y ahora si
npm run db:reset && PLAYWRIGHT_PORT=3210 npx playwright test e2e/operacion.spec.ts
```

**El servidor de desarrollo del 3100 quedó APAGADO** al terminar la Task 2 de este
plan, porque no hay forma de correr la suite con él vivo. Se vuelve a levantar con
`npm run dev -- --port 3100`.

**Por qué no se arregla aquí.** El arreglo de verdad es darle a la corrida E2E un
`distDir` propio (algo como `.next-e2e`), y eso se configura en
`next.config.ts`, que este plan no toca y que afecta a todo el repo, no a una
pantalla. Es un cambio de infraestructura de pruebas con su propia medición.

**Condición de salida:** o un `distDir` separado para la corrida E2E, o la receta
de arriba escrita en `COMO-CORRER-PRUEBAS.md`, que es donde el punto 2 de este
mismo archivo ya pide que vivan las trampas del stack local.

---

## 7. CERRADO el punto 3: los dos rojos E2E, y uno era un defecto de producto (2026-09-29)

**Encontrado y cerrado al ejecutar la Task 4 de 10-05.** El punto 3 de este archivo
registraba dos casos rojos con la base reseteada y decía que el primero no tenía la
causa aislada. Ya la tiene, y no era del test.

### `e2e/operacion.spec.ts:429` — el contador `Ver cancelados (1)`

**Era un DEFECTO DE PRODUCTO, no un test frágil**, y el rediseño solo lo destapó
del todo.

`router.refresh()` vivía en `alCambiarApertura`, que es el `onOpenChange` del
diálogo. Ese callback lo dispara la PRIMITIVA cuando el usuario pide cerrar, y
**no lo dispara un cierre programático**, que es justo lo que hace el camino feliz:
la action responde, el efecto llama a `onAbiertoChange(false)` y el diálogo se
cierra por código. Desde que el plan 04-14 quitó los `revalidatePath()` de las
nueve actions no quedaba nadie más que refrescara.

**Medido con dos sondas, el 2026-09-29:**

```
CANCELAR   tras cancelar:  {"tarjetas":1,"botones":[…,"Activar","Crear aseo"]}
           tras recargar:  {"tarjetas":0,"botones":[…,"Ver cancelados (1)",…]}

REASIGNAR  tras reasignar: "Pendiente 10:15 E2E Op Gestionada … Aseadora Ana …"
           esperado:       Aseadora Bea …
```

O sea: el admin actúa, la base escribe, el toast lo dice, **y la pantalla se queda
exactamente igual hasta que alguien recarga a mano**.

**Un bug, CUATRO sitios.** El mismo patrón estaba en `DialogoCancelarAseo`,
`DialogoReasignar`, `DialogoReprogramar` y `DialogoCerrarAseo`. Los cuatro
arreglados moviendo el `router.refresh()` al camino de éxito.

**Por qué el efecto SÍ es seguro para el refresco**, cuando la cabecera de
`DialogoCancelarAseo` prohíbe con medición devolver el TOAST a ese mismo efecto: lo
único que puede desmontar el diálogo es que llegue un árbol nuevo, y si llegó un
árbol nuevo el refresco ya sobra. O el efecto corre y refresca, o no corre porque
alguien ya refrescó. El toast no tiene esa salida, y por eso sigue donde está.

### `e2e/push-instalacion.spec.ts:97` — el timeout de 30 s

Verde en esta corrida, aislado y dentro de la suite completa. **No se tocó nada de
push en este plan**, así que lo que cambió es el entorno: el punto 2 de este archivo
ya avisaba de que ese spec es sensible al `edge-runtime`, que está excluido del
stack local. Queda como intermitente conocido y no como rojo fijo.

### La suite completa, con la base reseteada

| | Al escribir el punto 3 | 2026-09-29 |
|---|---|---|
| E2E | 171 pasados · **2 fallados** · 1 saltado | **199 pasados · 0 fallados** · 1 saltado |

---

## 8. El `scroll={false}` del enlace de la tarjeta NO está defendido por ningún rojo (2026-09-29)

**Encontrado al correr el señuelo 4 de la Task 5 de 10-05.** No lo causa este plan:
la prop lleva ahí desde que la Fase 8 la puso, y lo que este plan hizo fue intentar
verla en rojo y no conseguirlo.

**Estado:** una prop correcta, con su razón escrita, y **sin compuerta**.

El plan predecía que quitar el `scroll={false}` del enlace de apertura de la tarjeta
pondría rojo el caso *"abrir el detalle NO manda la lista del dia al tope"*. Se quitó,
se reconstruyó y se corrió:

```
✓  1 [chromium] › abrir el detalle NO manda la lista del dia al tope, y no le borra
                  el toggle (2.6s)
  1 passed
```

**Verde. El señuelo no mordió.**

**La causa, y sale de una aserción que ya existe.** A partir de `xl` el contenedor de
página tiene altura cerrada y **el documento no scrollea**: lo afirma por nombre el
caso *"con TREINTA tarjetas en el dia la PAGINA no scrollea"*, con
`documentoScrollea === false`. El enrutador de Next, al navegar sin `scroll={false}`,
lleva a la vista el tope del documento; si ya está a la vista, **no hace nada**. O sea
que en esta pantalla, a 1280 y por encima, la prop es un no-op.

**Las dos causas del mismo síntoma no son simétricas, y eso es lo que había que
medir:** la clave por identificador mal puesta SÍ pone rojo el caso
(`Expected: 3144 / Received: 0`), el `scroll={false}` no.

**Por qué no se arregla acá.** El sitio donde la prop sí hace algo es **por debajo de
1280**, donde la pantalla se apila y el documento vuelve a scrollear. Escribir ese caso
pide sembrar el escenario a un viewport de 1279 y medir el recorrido del documento, y
eso es un caso nuevo con su propia siembra, no una línea dentro del que ya existe.

**Condición de salida:** un caso a 1279px que afirme que abrir el detalle no devuelve
el DOCUMENTO al tope. Mientras no exista, el `scroll={false}` de `TarjetaAseo.tsx`
está sostenido por su comentario y no por la suite, **y eso hay que saberlo antes de
borrarlo "por redundante"**.

---

## 9. El `it` invisible de `lib/data/operacion.test.ts` sigue sin correr (2026-09-29)

**Es el punto 5 de este archivo, y se revisa acá para dejar dicho en cuál de las dos
tasks entraba y por qué salió de las dos.**

El caso `D-08: el límite inferior baja SIETE días, no se queda en hoy` está declarado
dentro del cuerpo del `it` anterior y después de su `return`, así que **nunca se ha
registrado en el runner**. La Task 1 del plan 10-05 lo midió y lo anotó.

**Decisión de la Task 6, escrita porque el plan pedía decidirlo:** **no entra ni en la
Task 5 ni en la Task 6, y se queda como el punto 5.** Las razones:

1. **La propiedad que defendía YA ESTÁ defendida**, por el bloque
   `la ventana ante un dia pedido` que escribió la Task 1, y en concreto por
   `LA VENTANA DE LAS ALERTAS NO SE ESTRECHA NUNCA`, que afirma
   `desde <= hoy − VENTANA_ATRAS_DIAS` para los seis valores de `?dia`. El agujero
   está tapado por arriba: el criterio 7 del ROADMAP de la Fase 5 tiene compuerta.
2. **Desanidarlo toca el único caso del archivo que manipula el reloj** con
   `vi.useFakeTimers()` fuera de un `describe` propio, con riesgo real de arrastrar
   los temporizadores falsos a otro caso. Eso es trabajo sobre la capa de datos, y la
   Task 5 es la pantalla y la Task 6 son documentos.
3. **Y la Task 6 no toca código por contrato**: sus cuatro archivos son `.md`. Meter
   ahí un arreglo de `.test.ts` sería exactamente el tipo de cambio fuera de alcance
   que este archivo existe para evitar.

**Condición de salida, sin cambios:** mover el `it` a hermano del anterior y comprobar
que la cuenta del archivo SUBE en uno. Si al desanidarlo sale rojo, es un hallazgo de
segundo orden y hay que medirlo antes de tocar la consulta.
