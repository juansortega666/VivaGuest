# Fase 7 — Hallazgos fuera de alcance

Cosas que aparecieron ejecutando los planes de esta fase y que NO se arreglan
aquí, con lo medido para que el siguiente no tenga que volver a medirlo.

## Flake en `e2e/push-instalacion.spec.ts` (encontrado el 2026-09-13, plan 07-03)

**Qué pasa.** Los casos `E1` y `E2` fallan de forma intermitente, uno distinto en
cada corrida, y pasan solos a la siguiente sin tocar una línea.

**Medido, tres corridas seguidas sobre el mismo árbol y la misma base:**

| Corrida | Resultado |
|---|---|
| 1 (suite completa) | 112 pasando, 1 saltado. `E1` y `E2` en verde |
| 2 (suite completa) | `E1` rojo. 111 pasando |
| 3 (solo el archivo) | `E2` rojo. 4 pasando |
| 4 (solo el archivo) | 5 pasando, 1 saltado. Todo verde |
| 5 (suite completa, 2026-09-13, plan 07-10) | `E3` rojo. 112 pasando |
| 6 (solo el archivo, inmediatamente despues) | 5 pasando, 1 saltado. Todo verde |

**Por qué no es de esta fase.** `push-instalacion.spec.ts` importa de
`e2e/fixtures.ts` únicamente `contextoPersistente`, `emularInstalada`,
`esperarWorkerListo`, `idPorEmail`, `leerCredenciales` y `registroDelWorker`.
El plan 07-03 no tocó ninguna de las seis: añadió funciones nuevas al final del
archivo y tres campos OPCIONALES a `AseoASembrar`, que ese archivo no usa.

**La hipótesis, para quien lo retome.** Los dos casos rojos son justamente los
que dependen de red real: `E1` suscribe contra el servicio de push de Google y
`E2` entrega un aviso por el protocolo de DevTools. `E5` y `E6`, que no salen de
la máquina, nunca fallaron.

**Actualizado el 2026-09-13 (plan 07-10).** El flake alcanza también a `E3`, que
es el tercer caso que depende de la entrega por el protocolo de DevTools. Eso
refuerza la hipótesis y la acota: los tres rojos vistos hasta hoy (`E1`, `E2`,
`E3`) son exactamente los casos que salen de la máquina o dependen del protocolo;
`E5` y `E6`, que no, nunca han fallado. El plan 07-10 no tocó nada de ese camino
(su superficie es `/finanzas`, `TopNav` y ocho tokens de espaciado), y la corrida
siguiente del mismo archivo salió entera en verde.

**Detonante para arreglarlo:** que el rojo aparezca dos corridas seguidas, o que
CI lo vuelva rojo con su `retries: 1`. Antes de eso, el arreglo sería a ciegas.

---

## El pago de una persona asume UNA sola moneda (plan 07-07, migración 25)

**Qué queda pendiente.** `public.cleaner_payouts` tiene una única columna
`moneda` (con `default 'COP'` y su `check` ISO), pero `public.expenses` ganó su
propia `moneda` en la migración 18 «regla 1 del camino a v2». El núcleo del
cierre copia la moneda de CADA gasto a su línea del desglose, que es correcto, y
deja la del pago en su valor por defecto. Si algún día un periodo mezclara
gastos en dos monedas, `monto_gastos` sumaría peras con manzanas y el `check
cp_total_cuadra` no lo vería: solo comprueba que el total sea la suma de las dos
partidas, no que las partidas sean comparables.

**Por qué no es de esta fase.** Hoy no existe ninguna superficie que permita
escribir un gasto en una moneda distinta de `COP`: la columna nació con default
y sin selector en ninguna pantalla. El defecto es latente, no vivo, y el
PROJECT.md declara el multi-moneda como camino a v2, no como MVP.

**Cómo se arregla cuando toque.** Agrupar también por moneda al construir
`personas` en `private.cerrar_periodo_core`, y pasar de «una fila de pago por
persona» a «una por persona y moneda». Es un cambio de clave única en
`cleaner_payouts` (`unique (periodo_desde, aseador_id)` pasaría a incluir
`moneda`), así que **es más barato antes de tener histórico financiero vivo**.

**Detonante:** el día que una pantalla ofrezca elegir moneda al reportar un
gasto, o el día que entre la primera unidad fuera de Colombia.

---

## `/finanzas` no está en la zona del admin del ruteo (plan 07-11)

**Qué se observó.** `ZONA_ADMIN` de `lib/auth/routing.ts` sigue siendo
`['/operacion', '/apartamentos', '/aseadores']`. La sección de finanzas nunca se
añadió. El efecto es que una sesión de aseadora que pide `/finanzas/aseos` **no**
rebota en el middleware: entra, el layout de `(admin)` falla su guard y redirige
a `/login`, y desde ahí el middleware la manda a `/mis-aseos`. El destino final
es correcto y la suite lo afirma (caso T-07-09), pero el camino son dos saltos en
vez de uno.

**El síntoma visible.** En cada uno de esos saltos, el componente de servidor de
la página alcanza a ejecutarse en paralelo con el layout, la función de la base
levanta `42501`, y el proceso escribe un `Error: no_autorizado` en su registro.
Se ve tal cual en la salida del servidor de la corrida E2E. **No es una fuga**:
nada de esa página llega al navegador, porque la redirección gana. Es ruido en el
registro y un salto de más.

**Por qué no se arregló aquí.** `lib/auth/routing.ts` no está en los archivos de
este plan, y la wave 7 tenía tres agentes escribiendo a la vez sobre el mismo
árbol: tocar el ruteo compartido para quitar ruido de un registro no vale el
riesgo de romperles la sesión a los otros dos. Además el defecto ya existía con
`/finanzas` a secas desde el plan 07-10, así que no lo introduce esta pantalla.

**Cómo se arregla.** Añadir `'/finanzas'` al arreglo `ZONA_ADMIN`. Es una línea,
y `routing.test.ts` ya tiene el molde de casos para cubrirla. Con eso el rebote
ocurre en el borde, de un solo salto y sin tocar la base.

**Detonante:** el primer plan que tenga `lib/auth/routing.ts` entre sus archivos,
o la primera vez que ese `no_autorizado` confunda a alguien leyendo registros.

## Los casos 2 y 3 de `e2e/finanzas.spec.ts` (el Resumen) están rojos (2026-09-13, plan 07-12)

**Qué pasa.** Dos casos de la sub-pestaña **Resumen** fallan, y no son de la
pantalla que construyó el 07-12:

| Caso | Línea | Síntoma |
|---|---|---|
| `los cuatro KPIs tienen su etiqueta exacta, su orden fijo…` | 270 | Las cuatro tarjetas devuelven `x = 0`: la página sigue en su esqueleto de carga cuando el caso mide las posiciones |
| `cambiar el rango recalcula los KPIs y los conteos…` | 313 | `waitForURL(/rango=dia/)` agota los 30 s: el `router.push` del filtro de periodo no llega nunca |

**Medido.**

| Corrida | Resultado |
|---|---|
| Suite completa, base recién reseteada | 132 pasando, 1 saltado, estos 2 rojos |
| Solo esos dos casos, `--repeat-each=3` (6 ejecuciones) | **5 rojos, 1 verde** |

Los dos apuntan al mismo sitio: `/finanzas` tarda demasiado o se queda colgada
al cambiar de rango. Los dos casos del Resumen que NO dependen de la transición
del filtro (`el chevron de siguiente…`, `las tres filas del bloque 2…`) siguen
en verde.

**Por qué no es del 07-12.** Este plan no toca `app/(admin)/finanzas/page.tsx`,
ni `FiltroPeriodo.tsx`, ni `TarjetaKPI.tsx`, ni `lib/data/finanzas.ts`. Sus
cuatro casos (11 a 15 en el orden del archivo: los periodos cerrados, el
desglose, marcar pagado, el aislamiento por rol y el vacío) están en verde en la
misma corrida. Y hay una medición que lo fecha: **en las dos primeras corridas
del día, con la pantalla de Pagos ya construida y antes de los commits `dbe3fa7`
y `da34268`, estos dos casos estaban en VERDE.** La ventana está entre esos dos
commits y el final de la wave 7.

**Descartado como causa:** el cambio de `app/sw.ts` de este mismo plan. Los dos
casos ya fallaban ANTES de tocarlo, y ese cambio solo deja pasar de largo lo que
NO es de este origen; las transiciones de `/finanzas` son del mismo origen.

**Por dónde empezar.** El esqueleto que se ve en la captura del caso 2 es el de
`app/(admin)/finanzas/loading.tsx`, no el de la ruta hija: hay DOS fronteras de
suspensión anidadas en `/finanzas/*` y manda la de fuera. Si el Resumen tarda,
cualquier caso que lea el DOM sin esperar mide el gris. Y el cuelgue del caso 3
es del `router.push` del filtro, que es justamente el patrón que el contrato
declara en §12.2b.

**Detonante:** el plan 07-14, o el primero que tenga `app/(admin)/finanzas/page.tsx`
o `FiltroPeriodo.tsx` entre sus archivos.

---

## `FiltroPeriodo` se cuelga en `/finanzas`: la transición nunca termina

**Descubierto:** 2026-09-13, plan 07-14, arreglando los rojos de `finanzas.spec.ts`.
**Estado:** VIVO. Deja dos pruebas E2E en rojo aproximadamente una corrida de cada dos.
**Severidad:** alta en operación real. El filtro de periodo es el control principal
de `/finanzas`, y cuando se cuelga NO SE RECUPERA: hay que recargar la pantalla.

### Qué se observa

Al pulsar `Día`, `Semana`, `Mes` o cualquiera de los dos chevrons de
`app/(admin)/finanzas/_components/FiltroPeriodo.tsx`:

1. El clic llega al botón (verificado con un escucha en fase de captura).
2. `router.push` dentro de `useTransition` arranca: el contenedor de los bloques
   pasa a `aria-busy="true"`.
3. La petición RSC de la navegación sale y **el servidor responde 200**.
4. **La respuesta se aborta acto seguido (`net::ERR_ABORTED`) y la transición no
   se completa jamás.** `aria-busy` se queda en `true`, la URL no cambia, y
   volver a pulsar no cambia nada.

En la otra mitad de las corridas la URL cambia en ~200 ms y todo va bien.

### Qué se descartó, con la medición al lado

| Sospecha | Cómo se descartó |
|---|---|
| El service worker (precedente: 07-12, las fotos de recibo) | Reproducido con `/sw.js` bloqueado en `page.route`, sin worker registrado: 2 fallos de 4 corridas |
| El servidor | La MISMA URL pedida a mano con `fetch(..., { headers: { RSC: '1' } })` desde la propia página devuelve 200 y el cuerpo completo (23 461 bytes) en ~100 ms |
| Falta de hidratación | Se espera a que el nodo tenga su `__reactProps$…onClick` antes de pulsar, y aun así falla |
| El orden de las pruebas | Se reproduce con la prueba aislada |
| La tormenta de prefetch | Reproducido con los prefetch bloqueados |
| ~~`app/(admin)/finanzas/loading.tsx`~~ | **NO se descartó: ES LA CAUSA. Ver abajo.** |
| Un reintento del clic | `expect(...).toPass()` reintentando 30 s NO recupera el estado colgado |

### LA CAUSA, aislada con ocho corridas (2026-09-13)

`app/(admin)/finanzas/loading.tsx`. Separación limpia, sin una sola excepción:

| Estado del archivo | Corridas | Resultado |
|---|---|---|
| **Sin** `loading.tsx` | 4 | **15/15 en verde las cuatro**, y en 16-17 s cada una |
| **Con** `loading.tsx` | 4 | **6 fallos repartidos en las cuatro**, y 32-50 s cada una |

El propio `loading.tsx` lleva escrito el supuesto que lo rompe:

> *«Esto se ve al LLEGAR a la ruta por primera vez. **Cambiar de rango es otra
> cosa y no pasa por aqui**: ahi las cifras viejas se quedan visibles y atenuadas
> mientras llegan las nuevas. Lo resuelve el filtro con su transicion, no este
> archivo.»*

**Ese supuesto es falso en el App Router de Next.** `loading.tsx` es el
`fallback` de Suspense DEL SEGMENTO, y se aplica a toda navegación que entre en
él, incluida una que solo cambia los parámetros de consulta de la misma ruta. Así
que el caso A y el caso B del contrato de diseño (§12.2a y §12.2b) compiten por
el mismo mecanismo, y el resultado no es que se vea el esqueleto donde no
tocaba: es que **la transición se queda colgada y la pantalla deja de responder**.

### El arreglo propuesto, y por qué NO se aplicó aquí

Mover el esqueleto de `loading.tsx` a un `<Suspense>` declarado DENTRO de
`page.tsx`, envolviendo solo la parte que depende de datos:

* Al llegar a la ruta, la cabecera y el filtro se pintan de verdad y los bloques
  muestran el esqueleto. Es el caso A, y encima cumple mejor lo que el propio
  archivo dice que quiere («la cabecera se pinta con su titulo REAL»).
* Al cambiar de rango dentro de una transición, React CONSERVA el contenido ya
  montado en vez de enseñar el `fallback`. Es el caso B, literal.

Obliga a partir `page.tsx` en dos (la cáscara y un componente de servidor
asíncrono con las dos lecturas), y **el mismo patrón está en otras tres rutas**:
`/finanzas/aseos`, `/finanzas/pagos` y `/finanzas/aseadoras/[id]`. Las dos que
además llevan filtro de periodo tienen el mismo defecto latente.

Eso es rehacer la estructura de carga de una sección entera que el dueño ya
aceptó, sobre cuatro rutas, en el plan que CIERRA la fase. La regla 4 de
desviación dice que eso se pregunta, no se adivina, y la regla de alcance dice
que no se arregla desde aquí lo que no rompió este plan. **Queda con la causa
aislada, el arreglo escrito y la medición al lado, para una decisión del dueño.**

### Qué NO se tocó, y por qué

Las dos pruebas se dejan EN ROJO a propósito. Ponerlas en verde sin tocar la
causa exigiría debilitar lo que afirman, y lo que afirman es correcto: pulsar
`Día` tiene que cambiar el periodo. El rojo es del producto.

### Dónde vive el instrumento

`e2e/fixtures.ts`: `esperarControlHidratado`, `esperarUrlDeCliente` y
`pulsarHastaNavegar`, las tres con su medición escrita. Las dos pruebas que lo
destapan son `finanzas.spec.ts` «cambiar el rango recalcula…» y «el chevron de
siguiente se apaga…».

### Un hallazgo lateral, ya resuelto

`page.waitForURL()` y `expect(page).toHaveURL()` **nunca** ven este cambio de URL,
ni con 20 segundos de plazo, ni siquiera en las corridas en las que la navegación
SÍ funciona: su sondeo se ejecuta dentro del documento y se traba con el commit
de la transición de React. Sondeando `page.url()` desde Node aparece en ~200 ms.
Eso era un defecto del instrumento y está arreglado en `esperarUrlDeCliente`.

## El esqueleto de carga de `/finanzas`, retirado el 2026-09-13

**Qué se retiró:** `app/(admin)/finanzas/loading.tsx`, el esqueleto de geometría
real del Resumen.

**Por qué:** con el archivo puesto, **cambiar de rango en el filtro colgaba la
pantalla**. No era un esqueleto de más: la transición no terminaba nunca,
`aria-busy` se quedaba en `true` y volver a pulsar no recuperaba. El filtro es el
control principal de esa pantalla.

La causa es que en el App Router `loading.tsx` es el fallback de Suspense **del
segmento**, y también se aplica cuando solo cambian los parámetros de la consulta.
El comentario del propio archivo afirmaba lo contrario.

**Medición:** ocho corridas, las dos variantes del árbol. Sin el archivo, 15 de 15
casos de `e2e/finanzas.spec.ts` en verde; con él, dos rojos reproducibles.
Descartados con medición: service worker, servidor, hidratación, orden entre
casos, prefetch y reintento.

**Qué se perdió:** el esqueleto de la primera carga de `/finanzas`. Solo de esa
ruta: `/finanzas/aseos`, `/finanzas/pagos` y `/finanzas/aseadoras/[id]` conservan
el suyo y siguen en verde.

**El arreglo fino, para cuando alguien quiera recuperarlo:** envolver únicamente
los bloques de datos en un `Suspense` propio dentro de `page.tsx`, con una `key`
que **no** dependa de los parámetros de la consulta. Así la primera carga muestra
esqueleto y el cambio de rango no lo dispara.

**El detonante para hacerlo:** que alguien note la primera carga en blanco y le
moleste. Mientras tanto, el coste es menor que el defecto que evita.

**Hallazgo lateral que conviene no volver a sufrir:** `page.waitForURL` y
`expect(page).toHaveURL` **nunca** ven esa navegación, ni con 20 s, porque su
sondeo corre dentro del documento y se traba con el commit de React. Desde Node la
URL aparece en ~200 ms.
