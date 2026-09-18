---
phase: 09-el-producto-probado-de-punta-a-punta
tipo: debug
deuda: D-09-02-A
subsystem: operacion
tags: [toast, sonner, realtime, useActionState, react-19, carrera, defecto-de-producto]
fecha: 2026-09-18
estado: resuelto
sesion: .planning/debug/resolved/toast-perdido-operacion.md
---

# D-09-02-A: el aviso moría con el diálogo que lo iba a publicar

**El admin cancelaba un aseo, la base escribía, y una de cada tres veces no se enteraba. La causa no estaba en sonner ni en el instrumento: el `toast.success()` no se perdía, es que no llegaba a llamarse nunca.**

---

## 1. Las dos cosas que estaban escritas y son falsas

Antes de la causa, lo que hubo que desmontar. Las dos venían de `09-02-SUMMARY.md`, que ya había hecho el trabajo duro de tumbar la hipótesis de la Fase 8, y las dos son hipótesis razonables que la medición no sostiene.

### 1.1. «sonner no le reproduce el backlog a un suscriptor nuevo»

`09-02-SUMMARY.md` lo usa como el mecanismo de la pérdida: si el `<Toaster />` se remonta entre la publicación y el pintado, el aviso se cae por el hueco.

**Es falso en la versión que corre.** `sonner@2.0.8`, `node_modules/sonner/dist/index.mjs:138-149`:

```js
this.subscribe = (subscriber)=>{
    this.subscribers.push(subscriber);
    // A toast can be created before the `Toaster` had a chance to subscribe...
    // Replay whatever is still active so it doesn't get lost.
    this.getActiveToasts().forEach((toast)=>subscriber(toast));
```

El comentario del propio upstream nombra el caso exacto que se sospechaba, y lo resuelve. Un contenedor que se remonta **no pierde nada**.

### 1.2. «`[data-sonner-toaster]` en 0 prueba que el contenedor no está»

Es la observación sobre la que se apoyaba todo el diagnóstico de 09-02. **No prueba eso.** `dist/index.mjs:1153`:

```js
if (!filteredToasts.length) return null;
```

El `<Toaster />` devuelve `null` cuando no hay toasts. `haToaster: 0` es el comportamiento normal de un contenedor perfectamente montado y vacío, no la huella de un desmontaje. El volcado de 09-02 era correcto; la lectura que se le dio, no.

### 1.3. Y dos premisas del encargo que tampoco se sostienen

- **«`DialogoCancelarAseo` y `DialogoReprogramar` NO llaman a `router.refresh()`».** Los dos lo llaman, en `alCambiarApertura` (`DialogoCancelarAseo.tsx:155` y `DialogoReprogramar.tsx:152`). Lo que sí es cierto, y resultó importante, es que **esa función no corre en la rama de éxito**: `MenuAseo` pasa `onAbiertoChange={(a) => !a && setDialogo(null)}`, así que el éxito desmonta el diálogo sin pasar por el `onOpenChange` de Radix.
- **«`_actions.ts` tiene 6 `revalidatePath`».** Tiene 6 **menciones dentro del comentario de cabecera** (líneas 19 a 52) y **cero llamadas**. El comentario documenta un cuelgue medido en el plan 04-14 y explica que `router.refresh()` lo sustituyó. Sigue vivo tal cual está escrito.

---

## 2. La causa raíz

> **El aviso se publicaba desde un `useEffect`, y ese efecto vive dentro de un componente que la propia acción hace desaparecer.**
>
> - `app/(admin)/operacion/_components/DialogoCancelarAseo.tsx:130-145` (antes del arreglo), y su gemelo en `DialogoReprogramar.tsx:129-144`: `toast.success(estado.mensaje)` dentro del `useEffect` que observa el estado de `useActionState`.
> - `app/(admin)/operacion/_components/MenuAseo.tsx:395-402`: el diálogo se monta **condicionalmente** dentro de la fila (`{dialogo === 'cancelar' && <DialogoCancelarAseo … />}`).
> - `app/(admin)/operacion/_components/BloqueDia.tsx:166`: la tabla recibe `verCancelados ? [...visibles, ...cancelados] : visibles`, y `verCancelados` arranca en `false`.
> - `app/(admin)/operacion/_components/BloqueDia.tsx:284-285`: `particionar()` saca de `visibles` **solo** lo que tiene `clave === 'cancelado'`.

La cadena, entonces:

1. El admin pulsa `Cancelar aseo`. La Server Action sale en vuelo.
2. La RPC escribe y Postgres hace commit.
3. Un `router.refresh()` de `SincronizacionEnVivo` (`SincronizacionEnVivo.tsx:111-114`) aterriza en el instante en que la action resuelve.
4. El árbol RSC que trae ese refresco **ya no contiene la fila**: el aseo está `cancelada`, `particionar()` lo manda a `cancelados`, y `TablaDia` solo pinta `visibles`.
5. React desmonta `FilaAseo`, y con ella `MenuAseo` y el diálogo. **Muere el `useActionState`.**
6. El resultado de la action llega a un componente que ya no existe. El efecto no corre. `toast.success()` no se llama.

La fila sí se actualiza y el trabajo no se pierde. Lo único que desaparece es la confirmación.

---

## 3. El registro que lo fija

Andamio temporal con `MONTA` / `DESMONTA` / `EFECTO` / `TOAST` / `SUBMIT` en los dos diálogos, `REFRESH` en `SincronizacionEnVivo` y `RENDER tabla` con el número de filas en `TablaDia`. Reloj en cero al primer evento de la página. Volcado **siempre**, en verde y en rojo: sin el control en verde un registro vacío no prueba nada, que es la lección que dejó 09-02.

### 3.1. El rojo

```
+0ms     RENDER tabla ["dd91"]      la tabla tiene la fila
+47ms    MONTA menu "dd91"
+343ms   MONTA cancelar
+344ms   EFECTO cancelar {"hay":false}
+549ms   SUBMIT cancelar            la action sale en vuelo
+587ms   REFRESH realtime
+760ms   RENDER tabla []            el árbol nuevo llega SIN la fila
+762ms   DESMONTA menu "dd91"
+762ms   DESMONTA cancelar          el diálogo muere
+1119ms  REFRESH realtime
```

**Nunca aparecen `EFECTO cancelar {"ok":true}` ni `TOAST cancelar`.** No es que el aviso se publique y se pierda: es que no se publica.

El `RENDER tabla []` es la pieza que cierra el argumento. Prueba que el desmontaje es **consecuencia del dato** (el árbol llegó sin la fila), y no un reinicio de estado ni una remontada por identidad de clave: `TablaDia.tsx:109` usa `key={fila.id}`, que es estable.

### 3.2. El verde, que es el control

```
+0ms     MONTA cancelar
+0ms     EFECTO cancelar {"hay":false}
+276ms   EFECTO cancelar {"hay":true,"ok":true}
+276ms   TOAST cancelar
+278ms   DESMONTA cancelar
```

El mismo aparato, el mismo caso, y el resultado gana la carrera por **dos milisegundos**. Esa es la anchura real de la ventana, y es lo que produce una tasa del orden de un tercio en vez de un 1 % o un 99 %.

Y reprogramar, que es el otro camino que fallaba, da la misma forma con otros números (`EFECTO ok` a +5012 ms, `TOAST` a +5012 ms, `DESMONTA` a +5013 ms).

### 3.3. El dato que refina el mecanismo

Con un retraso artificial de 2,5 s metido dentro de la función de la action:

```
+426ms   SUBMIT
+495ms   RESULTADO
+548ms   REFRESH realtime
+1045ms  REFRESH realtime
+2997ms  DESPUES DEL RETRASO
+2997ms  TOAST
+3007ms  RENDER tabla n=0
```

Entran dos refrescos a +548 ms y +1045 ms y **el render que vacía la tabla no llega hasta +3007 ms**, o sea hasta después de que la action resuelve. Es decir: **mientras la action está pendiente, React retiene el commit del refresco.**

Eso acota la ventana peligrosa con precisión: no es "durante toda la action", es **el instante exacto en que la action resuelve**, cuando React tiene dos actualizaciones pendientes (el estado del `useActionState` y el refresco retenido) y decide en qué orden aplicarlas. Un `useEffect` corre un commit **después** de ese punto, así que si el desmontaje entra en ese lote, el efecto ya no existe para correr.

---

## 4. El alcance real, medido

El encargo sospechaba que el defecto alcanzaba a los cinco diálogos de `/operacion` más `MenuAseo` y `SheetConfirmar`. **La medición dice otra cosa, y es más útil:** los siete comparten la forma, pero solo dos la detonan, y la condición que los separa está identificada.

Hacen falta **dos condiciones a la vez**:

1. el aviso se publica desde un `useEffect`, **y**
2. la acción **saca la fila del DOM**, que es lo que desmonta al ancestro del diálogo.

| Sitio | Publica desde | ¿La acción saca la fila? | Veredicto |
|---|---|---|---|
| `DialogoCancelarAseo` | `useEffect` | **Sí**, sale de `visibles` y queda plegada | **detonado**, arreglado |
| `DialogoReprogramar` | `useEffect` | **Sí**, se va a otro `BloqueDia` | **detonado**, arreglado |
| `DialogoCerrarAseo` | `useEffect` | No: `terminado` se queda visible | latente |
| `DialogoReasignar` | `useEffect` | No: cambia el aseador, la fila se queda | latente |
| `SheetConfirmar` (vía `MenuAseo`) | `useEffect` | No: pasa a `pendiente`, sigue en `visibles` | latente |
| `DialogoCrearAseo` | `useEffect` | No aplica: vive en `page.tsx:586`, fuera de las filas | no expuesto |
| `MenuAseo.marcarRevisado()` | `await` en función async | irrelevante | **inmune por construcción** |
| `FilaAlerta` | `await` en función async | irrelevante | **inmune por construcción** |

Dos lecturas que salen de esta tabla:

- **La correlación es 1:1 sobre 13 rojos** (los 7 que midió 09-02 más los 6 de esta sesión). Los únicos dos casos que han fallado alguna vez son exactamente los dos cuya fila desaparece. Cerrar y reasignar tienen el **mismo código** y nunca han fallado, porque les falta la segunda condición.
- **El repo ya contenía el patrón correcto.** `marcarRevisado()` y `FilaAlerta` publican con `await` dentro de una función async, y por eso nunca perdieron un aviso. El arreglo no inventa nada: adopta lo que ya estaba en el repo.

---

## 5. El arreglo

Dos archivos de producto, y el diff de código son 24 líneas.

El aviso pasa del `useEffect` a la función que `useActionState` ejecuta:

```ts
const [estado, accion] = useActionState<ResultadoAccion | null, FormData>(
  async (previo, datos) => {
    const resultado = await cancelarAseo(previo, datos);

    if (resultado.ok) toast.success(resultado.mensaje);
    else toast.error(resultado.error);

    return resultado;
  },
  null,
);

const procesado = useRef<ResultadoAccion | null>(null);

useEffect(() => {
  if (!estado || estado === procesado.current) return;
  procesado.current = estado;

  // Solo el efecto de interfaz. El aviso ya se publicó arriba.
  if (estado.ok) onAbiertoChange(false);
}, [estado, onAbiertoChange]);
```

**Por qué funciona, y no es "el closure sobrevive al desmontaje".** Es que se publica antes de que la ventana exista: `RESULTADO` y `TOAST` comparten marca de tiempo en las ocho corridas instrumentadas (+606/+606, +597/+597, +504/+505, +488/+488…). La publicación ocurre en el mismo microtask en que aterriza la respuesta, por delante de cualquier commit de React. Que `toast` sea un singleton de módulo y no un hook es la red de seguridad, no el mecanismo principal.

El `useEffect` se queda con lo único que **sí** debe morir con el diálogo: cerrarlo.

`DialogoReprogramar` conserva su regla de que un error **con** `campo` se pinta inline y no va a toast; solo cambia de sitio.

Las dos cabeceras llevan escrita la medición y una prohibición explícita de devolver esto a un `useEffect`.

### Lo que NO se tocó

- **Ninguna aserción.** `e2e/operacion.spec.ts` está intacto: el diff de la sesión no lo incluye. `esperarToast()` sigue siendo `getByText(texto, { exact: true })` sobre `[data-sonner-toast]` con `timeout: 15_000`. Ningún timeout subió, ningún `exact` se cayó, ningún `toBe` pasó a `toContain`.
- **`app/(cleaner)`**: cero cambios.
- **Contratos**: ninguno. El copy de los avisos, las firmas de las actions y los tipos son los mismos.
- **Los tres latentes**: no se tocaron. Ver la sección 8.

---

## 6. Las contra-pruebas

### 6.1. El caso sigue pudiendo ponerse rojo (señuelo)

Devolver los dos archivos a su código anterior con `git checkout HEAD~1 --`, o sea el defecto presente, y correr la reproducción documentada:

```
npm run db:reset
PLAYWRIGHT_PORT=3210 npx playwright test e2e/operacion.spec.ts --grep-invert "CRITERIO"
```

**3 rojos de 18 corridas**, con el síntoma literal de D-09-02-A:

```
Error: expect(locator).toBeVisible() failed
Locator: locator('[data-sonner-toast]').getByText('El aseo quedó cancelado.', { exact: true })
Error: element(s) not found
```

La aserción no se debilitó y sigue atrapando exactamente el defecto que existe para atrapar.

### 6.2. El refresco cae en la ventana crítica y el aviso sale igual

Con el arreglo puesto y el andamio completo, una corrida en la que el refresco aterriza **entre** el envío y la resolución, que es justo la condición del rojo:

```
+223ms   MONTA
+428ms   SUBMIT
+481ms   REFRESH realtime      ← la condición del rojo
+506ms   RESULTADO
+506ms   TOAST
```

Verde. Con el código anterior, ese mismo reparto de tiempos era el rojo.

---

## 7. La tanda de corridas

Una corrida verde no prueba nada con una tasa de un tercio, así que van las dos ramas medidas con el mismo comando y la misma máquina.

| Rama | Corridas | Rojas | Tasa |
|---|---|---|---|
| **Con el arreglo** | **28** | **0** | **0 %** |
| Con el señuelo (defecto presente) | 18 | 3 | 17 % |
| Árbol anterior, con andamio (diagnóstico) | 8 | 3 | 38 % |
| Árbol anterior (`09-02`, 2026-09-18) | 22 | 7 | 32 % |

**Honestidad sobre el conteo, con los números calculados y no narrados:**

| Comparación | Prueba | p |
|---|---|---|
| 0/28 contra la línea base de 09-02 (7/22) | Fisher exacto, una cola | **0,0017** |
| 0/28 si la tasa siguiera siendo el 32 % medido por 09-02 | binomial | **0,00002** |
| 0/28 contra el señuelo de hoy (3/18) | Fisher exacto, una cola | **0,054** |
| 0/28 si la tasa fuera el 17 % del señuelo de hoy | binomial | **0,0054** |

La comparación contra la línea base histórica es contundente. La comparación contra el señuelo corrido hoy se queda en el margen (0,054), y se anota como lo que es: el señuelo dio 17 % y no 32 %, con 18 corridas, así que el intervalo de esa tasa es ancho y la prueba pareada pierde fuerza. **No es sobre el conteo que descansa el diagnóstico**, y eso importa decirlo: lo que lo demuestra es el registro de la sección 3, donde se ve directamente que el efecto no corre en el rojo y que sí corre en el verde. El conteo confirma que el arreglo se nota en la conducta observable de la suite.

Una señal lateral que ayuda a leerlo: **una corrida roja siempre dura 50 s o más**, porque se come los 15 s del timeout (las tres del señuelo: 50,8 s, 51,2 s y 49,9 s). Las 28 corridas con el arreglo caen todas entre **33,7 s y 36,8 s**, sin un solo valor por encima de 37. Es un segundo indicador, independiente del conteo de rojos, y apunta igual.

### Las cuatro suites y las compuertas, tras el arreglo

| Suite | Medido | Línea base | Veredicto |
|---|---|---|---|
| `npm run test:unit` | **1236 / 1236** en 65 archivos | 1236 | exacta |
| `npm run test:integration` | **205 / 205** en 23 archivos | 205 | exacta |
| `npm run db:test` (pgTAP) | **389 / 389** en 13 archivos | 389 | exacta |
| E2E `operacion.spec.ts` | **9 / 9** en 28 corridas seguidas | sin rojos | **cerrado** |

```
npx tsc --noEmit   → sin salida
npm run lint       → 0 errores, 2 warnings PREEXISTENTES
                     (app/(admin)/operacion/_actions.test.ts:48, lib/domain/aseador.schema.test.ts:40)
npm run build      → OK
npm run ci:arch    → check-service-role OK · check-max-w-tallas OK · check-escala-movil OK
```

---

## 8. Lo que queda declarado

### D-09-18-A · Tres sitios con la misma forma que hoy no la detonan

`DialogoCerrarAseo.tsx:114`, `DialogoReasignar.tsx:152` y `SheetConfirmar.tsx:239` publican su aviso desde un `useEffect` igual que lo hacían los dos arreglados. Hoy no fallan porque su acción no saca la fila del DOM, o sea que les falta la segunda de las dos condiciones.

**No se tocaron, y es una decisión, no un olvido.** El encargo cierra el diff en tres archivos de producto y arreglar los cinco serían cinco. Y arreglar a ciegas un sitio que no tiene reproducción es exactamente lo que este documento existe para no volver a hacer: 09-02 ya gastó una tarde en un arreglo prescrito sin medición que resultó ser un no-op estructural.

**Qué los volvería a poner en riesgo**, que es lo que hay que vigilar:

- que `particionar()` (`BloqueDia.tsx:276`) empiece a apartar `terminado` además de `cancelado`. Hoy la línea 284 solo mira `cancelado`, y el comentario de la línea 31 dice explícitamente que los terminados se quedan porque son el avance del día. Si eso cambia, `DialogoCerrarAseo` se cae al día siguiente.
- que se añada cualquier filtro, paginación o reordenamiento que pueda sacar una fila de la tabla como efecto de su propia acción.

**Dueño propuesto:** el mismo plan que toque cualquiera de los tres por otra razón, aplicando el patrón ya escrito en las dos cabeceras. Coste estimado: tres líneas por archivo.

### Lo que 09-07 hereda de este documento

1. **`D-09-02-A` se cierra.** De los dos rojos conocidos que dejó 09-02 queda uno, `D-09-02-B` (el de `push-instalacion.spec.ts:215`), que no se tocó acá.
2. **`TESTING.md` tiene dos filas que corregir**, y una de ellas se hereda ya desfasada de 09-02: la columna «causa medida» del rojo del toast apuntaba a sonner y a la pila, y las dos lecturas están tumbadas en la sección 1.
3. **La cabecera de `esperarToast()` en `e2e/operacion.spec.ts:92-145` está desactualizada.** Describe el defecto como vivo, nombra como sospechoso el `router.refresh()` del cierre del diálogo (que no es el que lo causaba) y repite las dos afirmaciones falsas de la sección 1. **No se tocó en esta sesión para no meter ruido en el diff de la aserción**, pero debería reescribirse o recortarse a un puntero a este documento.
4. **La línea base de la suite no cambia**: 159 colectados, 158 verdes, 1 saltado.

---

## 9. Los commits

| Commit | Qué |
|---|---|
| `2221fb0` | `fix(09)`: el arreglo, dos archivos de producto |
| (este) | `docs(09)`: este documento |

La sesión de debug completa, con las hipótesis eliminadas y el rastro de evidencia en orden, queda en `.planning/debug/resolved/toast-perdido-operacion.md`.

---

## 10. La lección, que es la misma de 09-02 y conviene no volver a pagar

09-02 escribió: *«la causa escrita por otra fase es una hipótesis, no un dato»*, y esa lección le costó tumbar el diagnóstico de la Fase 8. **Esta sesión tuvo que tumbar el de 09-02**, que estaba mucho mejor medido y aun así se equivocaba en el mecanismo.

Lo que falló las dos veces es lo mismo: **una observación correcta a la que se le dio la lectura equivocada.** `haToaster: 0` era un dato real y verdadero; lo que no era cierto es que significara lo que parecía significar. Lo que lo desbloqueó fue ir a leer el código de la dependencia (`node_modules/sonner/dist/index.mjs`) en vez de razonar sobre lo que se suponía que hacía.

Y en positivo: lo que resolvió el caso en una sola corrida fue un andamio que registraba **los dos lados de la disyuntiva a la vez**. `EFECTO` y `TOAST` juntos distinguen «se publicó y se perdió» de «no se publicó» sin necesidad de decidir de antemano cuál de las dos se está buscando.
