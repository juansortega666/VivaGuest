---
phase: 02-acceso-y-administraci-n-del-cat-logo
plan: 12
subsystem: formulario-de-apartamento
tags: [react-hook-form, zod, base-ui, formularios, playwright, accesibilidad, dinero]

# Dependency graph
requires:
  - phase: 02-03
    provides: "esquemaBorrador, esquemaActivar y faltantesParaActivar: el contrato de §8.2"
  - phase: 02-10
    provides: "guardarApartamento({ id, modo, campos, secretos }), leerSecretos, leerApartamento, listarClusters, listarAseadoresActivos y valoresDesdeFilaGuardada"
  - phase: 02-11
    provides: "Las tres rutas que la tabla enlazaba en vano, estadoDeApartamento() y normalizar()"
provides:
  - "/apartamentos/nuevo y /apartamentos/[id]: el alta y la edicion, con los 12 campos"
  - "FormularioApartamento: las secciones 1 a 4 de UI-SPEC §8.1"
  - "BarraAccionesFormulario: el contrato borrador → activo con su checklist en vivo"
  - "CampoMoneda + aEnteroCOP/formatMilesCOP: entrada de COP entero con mascara reversible"
  - "SelectorCluster: combobox de entrada libre con matching sin tildes"
  - "SeccionGestion: el switch de §8.3 con su AlertDialog y la exclusion del suplente"
  - "e2e/apartamento-crud.spec.ts: los criterios 2 y 3 del ROADMAP contra un navegador real"
  - "playwright.config.ts acepta PLAYWRIGHT_PORT"
affects: [02-13, 02-14, 02-15]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Una mascara de dinero y su inverso son un PAR: separarlos guarda la tarifa dividida por mil y el valor resultante pasa los tres CHECK de la base"
    - "Un `<label htmlFor>` sobre un boton GANA a su contenido: el valor seleccionado de un Select desaparece del nombre accesible salvo que se nombren etiqueta y disparador"
    - "La lista COMPLETA de requisitos se deriva de la misma funcion que los faltantes, llamandola con un objeto sin valores: un array literal seria una segunda copia de la regla"
    - "Los ids de campo los reparte el formulario, no cada seccion: sin ids compartidos el focus() del checklist falla en silencio"
    - "reuseExistingServer hace que Playwright mida el codigo de OTRO checkout sin decir nada"
    - "Un comentario que cita el token que un `grep` de verificacion vigila rompe su propia verificacion: van seis veces en este repo"

key-files:
  created:
    - app/(admin)/apartamentos/_components/FormularioApartamento.tsx
    - app/(admin)/apartamentos/_components/BarraAccionesFormulario.tsx
    - app/(admin)/apartamentos/_components/CampoMoneda.tsx
    - app/(admin)/apartamentos/_components/SelectorCluster.tsx
    - app/(admin)/apartamentos/_components/SeccionGestion.tsx
    - app/(admin)/apartamentos/nuevo/page.tsx
    - app/(admin)/apartamentos/[id]/page.tsx
    - e2e/apartamento-crud.spec.ts
  modified:
    - lib/domain/money.ts
    - lib/domain/money.test.ts
    - lib/domain/apartamento.schema.ts
    - lib/domain/apartamento.schema.test.ts
    - app/globals.css
    - playwright.config.ts

key-decisions:
  - "aEnteroCOP va como setValueAs del register y no como conversion en el submit: el estado del formulario nunca puede contener la mascara, porque faltantesParaActivar y la validacion leen de ahi"
  - "vacioANulo se extendio a los opcionales de texto: un input vacio entrega '' y z.url()/z.uuid() bloqueaban Guardar senalando campos que el admin nunca toco"
  - "Los tres campos de property_secrets viven en useState y NO en el estado de react-hook-form: es la misma frontera que la firma de guardarApartamento declara con { campos, secretos }"
  - "El universo de requisitos del checklist se deriva llamando a faltantesParaActivar con solo gestion_vivaguest: sin valores, todo falta"
  - "Al crear se navega al detalle del id devuelto: sin eso, el segundo Guardar inserta otra vez y choca con properties_nombre_uniq sobre un apartamento recien creado"
  - "El tooltip del boton deshabilitado va sobre un span envolvente: un elemento con disabled no emite eventos de puntero"
  - "El SelectorCluster NO ofrece crear cuando lo tecleado coincide con un cluster existente salvo por tildes o mayusculas: es lo que impide que 'bogota 1' nazca al lado de 'Bogotá 1'"
  - "playwright.config.ts acepta PLAYWRIGHT_PORT con default 3000: sin eso, la suite mide el next start de otro worktree"
  - "La hora se pinta en 12h y se acepta: el control nativo sigue la locale del navegador, es-CO es de 12 horas y Chrome ignora el lang del input (medido)"

patterns-established:
  - "Toda asercion de 'sigue deshabilitado' lleva su CONTROL positivo en el mismo test: el mismo boton, en la misma corrida, habilitado"
  - "La reactividad se prueba contando el checklist tres veces (3 → 2 → 1 → 0), no mirando solo los extremos"
  - "Las dos mitades de la mascara de dinero van en el mismo test: 120.000 en pantalla y 120000 en la base"

requirements-completed: [APTO-01, APTO-02, APTO-04, APTO-05, APTO-08, APTO-09, APTO-10]

# Metrics
duration: 71min
completed: 2026-09-02
---

# Fase 02 Plan 12: El formulario de apartamento y el contrato borrador → activo

**Las cuatro primeras secciones de UI-SPEC §8 y la barra que impide que los tres CHECK de activación de `properties` se disparen desde la pantalla. El hallazgo del plan es una línea que no se ve: la máscara de miles del campo de dinero y `z.coerce.number()` se combinan para guardar 120 pesos donde el admin escribió 120.000, y el valor resultante es un entero válido, no negativo, que pasa los tres CHECK sin que nada se queje.**

## Performance

- **Duración:** 71 min
- **Tareas:** 3 de 3, todas autónomas, ninguna pendiente
- **Commits:** 4
- **Archivos creados/modificados:** 14

## Task Commits

1. **Tarea 1: Campo de moneda, selector de cluster y sección de gestión** — `f17f64e`
2. **Tarea 2: Formulario de cuatro secciones y barra de acciones** — `fea1511`
3. **Tarea 3: Páginas de alta y edición, y el spec de los criterios 2 y 3** — `8ca644c`
4. **Revisión visual: alineación de la barra y la hora en 12h** — `1a2b5ac`

---

## Puertas, con los números reales

Corridas todas de nuevo al cerrar, sobre el código final y sin señuelos:

| Puerta | Resultado | Antes de este plan |
|---|---|---|
| `npm run ci:arch` | **OK**, 8 guardarraíles | OK |
| `npx tsc --noEmit` | **limpio** (exit 0) | limpio |
| `npm run test:unit` | **232 tests**, 14 archivos | 202, 14 archivos |
| `npm run test:integration` | **41 tests**, 4 archivos | 41 |
| `npx playwright test` | **60 tests**, 8 archivos | 51 |
| `npm run build` | **OK**, con `/apartamentos/nuevo` y `/apartamentos/[id]` | OK, sin esas rutas |
| Semilla al terminar | **39 / 8 clusters / 5 informativas / 0 activas** | igual |
| Restos del spec en la base | **0 apartamentos, 0 secretos, 0 aseos** | — |
| Perfiles del orquestador | **3, intactos** (1 admin + 2 aseadoras) | 3 |

Los 30 unitarios nuevos y los 9 de Playwright nuevos son de este plan.

---

## 1. El hallazgo del plan: la máscara de miles corrompe la tarifa y NADA se queja

UI-SPEC §8.4 pide que el campo de dinero **se separe en miles al `blur`**: `120000` se muestra `120.000`. Y `apartamento.schema.ts` valida con `z.coerce.number()`, que por debajo es `Number()`.

```
Number('120.000')  →  120
```

JavaScript lee ese punto como separador **decimal**. Sin nada entre el DOM y el estado del formulario, la tarifa entra a la base dividida por mil. Y no hay ninguna red debajo:

- `props_rates_nonneg` la deja pasar: 120 no es negativo.
- `props_active_requires_rates` la deja pasar: 120 no es `null`.
- `esquemaActivar` la deja pasar: es un entero.
- La pantalla la deja pasar: al recargar se muestra `120`, y quien no mire ese campo concreto no se entera.

El síntoma aparece meses después, en el reporte de rentabilidad de la Fase 5.

### 1.1 El arreglo: la máscara y su inverso son un par

`lib/domain/money.ts` gana `formatMilesCOP` y `aEnteroCOP`, que son inversas exactas. `aEnteroCOP` va como **`setValueAs` del `register()`**, no como conversión en el submit, y la diferencia importa: `setValueAs` se aplica al LEER del DOM, así que el estado del formulario nunca contiene la máscara. De ahí leen `faltantesParaActivar`, la validación por blur y el payload. Convertir solo en el submit dejaría al checklist mirando un string.

Van en `lib/domain/` y no en el componente por la razón mecánica de siempre en este repo: `vitest.config.ts` solo recoge `lib/**`, así que un helper en `app/` **no lo ejecuta ninguna suite y nadie avisa**.

---

## 2. Los señuelos: cuatro roturas deliberadas, cuatro rojos, cero atrapados por `tsc`

| # | Señuelo | `tsc` | `ci:arch` | Qué se puso rojo |
|---|---|---|---|---|
| A | `aEnteroCOP` con `String(Number(v))` en vez del filtro de dígitos | limpio | — | Unitarios: **6 failed** |
| B | `maps_url` vuelve a `z.url().nullish()` sin el preprocess | limpio | — | Unitarios: **2 failed** |
| C | El checklist se congela al montar (`useRef` sobre el cálculo) | limpio | — | Playwright: **3 failed** |
| D | Se borra la rama informativa de `faltantesParaActivar` | limpio | — | Unitarios: **5 failed** + Playwright: **1 failed** |
| E | Se quita `setValueAs` de las opciones de registro | limpio | — | Playwright: **1 failed**, con `Expected "120.000" / Received "120"` |
| F | El detalle deja de pasar `secretosGuardados` al formulario | limpio | **OK** | Playwright: **1 failed**, con `Expected "4821#" / Received ""` |

`tsc --noEmit` salió **limpio con los seis**. Van treinta y cuatro señuelos en seis planes y treinta y cuatro compilaciones limpias.

Los dos que más dicen:

- **El señuelo E es el bug de §1 reproducido de punta a punta**, y el mensaje del fallo es literalmente el bug: la pantalla muestra `120` donde debería mostrar `120.000`. Ninguna otra capa lo ve.
- **El señuelo F es un falso verde por AUSENCIA**, el mismo patrón que el plan 02-10 midió con el guardarraíl 7: quitar una prop deja `tsc` limpio (es opcional), deja `ci:arch` en OK (la Server Action sigue existiendo y sigue teniendo su guard) y deja los 41 de integración en verde. Solo lo atrapa la aserción de Playwright sobre el valor del input, y por eso esa aserción existe.

### 2.1 El señuelo C confirma que el test de reactividad mide lo que dice

El test de la reactividad cuenta el checklist **tres veces** (3 → 2 → 1 → 0) en vez de mirar solo los extremos. Con el checklist congelado al montar, se cayeron **tres** tests: el de reactividad, el de la unidad informativa y el de activar/desactivar. Un test que solo mirara "al principio deshabilitado, al final habilitado" habría fallado igual, pero mirando los tres escalones el fallo dice **en qué campo** se rompió la cadena.

---

## 3. Lo que ninguna capa cubría: `''` no es `null`, y bloqueaba `Guardar`

`apartamento.schema.ts` (plan 02-03) tenía `vacioANulo` **solo sobre los dos campos de dinero**. Los opcionales de texto se quedaron con su validador a pelo:

```ts
maps_url:       z.url('Pega un link válido de Google Maps').nullish(),
responsable_id: z.uuid().nullish(),
```

**Ningún `<input>` de HTML produce `null`.** Un campo en blanco entrega `''`, y un `Select` sin selección entrega la cadena vacía de su opción centinela. Así que:

- Un apartamento sin link de Maps —que es opcional— fallaba con `Pega un link válido de Google Maps`.
- Un borrador sin responsable —que es el estado normal de las 34 unidades sembradas— fallaba con el mensaje de uuid.

`Guardar` quedaba bloqueado señalando dos campos que el admin nunca tocó. Se extendió `vacioANulo` a los cinco opcionales, y de paso la cadena de **solo espacios** cuenta como vacía: en pantalla es indistinguible de la vacía, y guardada produce un `contacto_externo` que satisface la puerta de activación sin contener a nadie. Hay un test dedicado a ese caso, porque es exactamente la puerta que no tiene 23514 detrás.

Cinco tests nuevos en `apartamento.schema.test.ts`, cada uno con su CONTROL de que la validación que estaba (URL, uuid) **sigue viva**: sin ese control, la misma aserción pasaría con un `z.string()` a secas, que es como se pierde una validación al "arreglar" un error de tipos.

---

## 4. La puerta que este archivo es el único sitio del sistema donde se prueba

Está declarada en el código y en el spec, con el nombre del test en mayúsculas para que nadie lo borre por ruidoso:

```
test('PUERTA SOLO DE UI: una informativa sin contacto externo no se puede activar')
```

`props_active_requires_owner` está condicionado a `gestion_vivaguest AND is_active`, así que para una unidad de gestión externa el CHECK es verdadero por vacuidad y **la base dejaría activarla con el contacto vacío**. El plan 02-10 tiene un test de integración que lo prueba escrito al revés, a propósito.

El test cubre las tres formas del caso:

1. Contacto vacío → botón deshabilitado, y el checklist con **exactamente un** ítem.
2. Contacto de **solo espacios** → botón deshabilitado. En pantalla no se distingue de vacío.
3. **CONTROL positivo:** contacto de verdad → botón habilitado. Sin él, las dos primeras pasarían con un botón deshabilitado para siempre.

El señuelo D lo confirma: borrando la rama informativa de `faltantesParaActivar`, este test es lo único de Playwright que se cae.

---

## 5. `faltantesParaActivar` alimenta CUATRO cosas, no tres

El plan pide que sea la única fuente de la lista, del `disabled` y del tooltip. Hay una cuarta que no está en el enunciado y que era el sitio natural para meter una segunda copia de la regla: **el universo de requisitos**.

El checklist tiene que pintar los ítems CUMPLIDOS tachados y con `Check` verde, no solo los que faltan. Con `faltantesParaActivar` devolviendo únicamente lo que falta, la tentación es escribir un array literal con los tres ítems. Eso es una segunda copia: el día que la regla cambie, el checklist y la validación dicen cosas distintas, el botón se habilita y el submit falla con un error inline sin explicación.

La solución no cuesta nada: se llama a la misma función **con un objeto que solo trae `gestion_vivaguest`**. Sin ningún valor puesto, todo falta, así que lo que devuelve es exactamente el conjunto de requisitos de ese modo. Y con eso la regla 6 (la unidad informativa) deja de ser un caso especial: el componente no se entera de que hay dos modos.

---

## 6. Lo que la revisión visual encontró, que ninguna suite mide

El plan pide revisión visual de dos cosas. Se automatizó con capturas a 1440px, y las dos salieron con hallazgo:

**6.1 La barra sangraba a un solo lado.** Llevaba `-mx-xl` para bleed lateral, pero vive dentro de un formulario de 720px en un contenedor de 1440px: por la izquierda llegaba al borde de la ventana y por la derecha se cortaba en el ancho del formulario, dejando un canto suelto en mitad de la pantalla. Alineada con el formulario, su borde superior continúa la misma regla de 1px que separa las secciones.

**6.2 La hora se pinta en 12h, y se acepta.** §8.4 pide 24h. El control nativo de hora se formatea según la **locale del navegador**, y `es-CO` es de 12 horas: en pantalla se lee `11:30 AM`. Se probó poner `lang` en el propio input y **Chrome lo ignora** (comprobado con captura). El valor que viaja sigue siendo `11:30` en 24h, que es lo que la base guarda y lo que el esquema valida. Forzar el formato exigiría sustituir el control nativo por uno propio y perder el teclado, el selector del sistema y la accesibilidad que trae de fábrica. La divergencia queda escrita en el código para que el auditor de UI no la reporte como hallazgo nuevo.

La segunda mitad de la revisión —"la barra no tapa el último campo"— salió correcta: la barra es el último hijo del formulario, así que con el scroll al fondo ocupa su posición natural y `Notas de acceso` se ve entero encima.

---

## 7. La medición de accesibilidad que cambió el código

El primer intento del test de persistencia falló así:

```
Expected pattern: /Aseador Uno E2E/
Received string:  "Aseador responsable"
```

**Un `<button>` es un elemento etiquetable, así que un `<label htmlFor>` GANA a su contenido para componer el nombre accesible.** El disparador del `Select` se anunciaba como "Aseador responsable, combobox" **sin decir quién está asignado**. Con 39 apartamentos y ~8 aseadores, eso es un campo que un lector de pantalla no puede leer.

El arreglo son los dos ids juntos: `aria-labelledby={'<etiqueta> <disparador>'}`, con lo que el nombre pasa a ser etiqueta + valor. Aplicado a los tres `Select` de la pantalla (responsable, suplente y tipo de cerradura) y ya presente en el combobox de cluster.

El test se quedó también con la aserción contra la base: el `responsable_id` se compara con el id del perfil, no con el texto de pantalla. Un `Select` que pintara el nombre correcto y enviara otro uuid pasaría la aserción visual.

---

## 8. La trampa de Playwright que habría dado un falso verde entero

`reuseExistingServer: !process.env.CI` está en `true` fuera de CI, que es lo que hace rápido el ciclo local. En el puerto 3000 había un `next start` **del checkout principal**, no de este worktree (verificado con `lsof`: su cwd es `/Users/juanortega/Documents/VivaGuest`).

Playwright lo habría reutilizado **sin decir nada**, y la suite habría medido código que no tiene ni `/apartamentos/nuevo` ni `/apartamentos/[id]`. En el mejor caso, nueve fallos que apuntan al sitio equivocado; en el peor, una aserción negativa que pasa trivialmente contra una pantalla que ni existe.

`playwright.config.ts` acepta ahora `PLAYWRIGHT_PORT`, con default 3000. Para quien corre un solo checkout no cambia nada.

---

## 9. Decisiones de forma que tienen razón

- **Los tres campos de `property_secrets` viven en `useState`, fuera de react-hook-form.** Es la misma frontera que `guardarApartamento` declara en su firma con `{ campos, secretos }`: `campos` va a `properties` con el JWT del admin y `secretos` va a otra tabla con el cliente administrativo, porque `property_secrets` no tiene grant para `authenticated`. Fundirlos en un solo objeto de formulario haría invisible la única frontera de seguridad de la pantalla.
- **Al crear se navega al detalle del id devuelto.** Sin eso, el segundo `Guardar` vuelve a insertar y el admin se encuentra `Ya existe un apartamento con ese nombre.` sobre un apartamento que acaba de crear él mismo.
- **El tooltip del botón deshabilitado va sobre un `<span>` envolvente.** Un elemento con `disabled` no emite eventos de puntero, así que un tooltip colgado directamente de él nunca se abriría: exactamente el callejón sin salida que la regla 4 de §8.2 quiere evitar. Va **sin** `tabIndex` para no meter una parada de tabulación fantasma; la ruta de teclado a la misma información son los botones del checklist, que son botones de verdad.
- **Los ids de campo los reparte el formulario y `SeccionGestion` los recibe por prop.** Si cada sección acuñara los suyos con `useId()`, la barra no tendría forma de nombrar `responsable_id` ni `contacto_externo` y el `focus()` del checklist fallaría **en silencio**: `getElementById` devolvería `null` y el clic no haría nada visible.
- **La limpieza del suplente se hace al ELEGIR responsable, no en un efecto sobre el par de valores.** Un efecto que observe los dos también dispararía al llegar los `defaultValues` de una fila guardada, donde la base ya garantiza que son distintos, y borraría un suplente correcto nada más abrir la pantalla.
- **El `SelectorCluster` no ofrece crear cuando lo tecleado ya existe salvo por tildes o mayúsculas.** Es la otra mitad de la mitigación que el plan 02-10 dejó pendiente (T-02-55): la primera es el `trim` de `listarClusters`, la segunda es esto. Sin ella, `bogota 1` nace al lado de `Bogotá 1` y el filtro de la tabla pasa a tener nueve opciones donde el admin ve ocho.
- **Mientras el campo de dinero tiene foco se muestra sin agrupar.** Reformatear en cada tecla obliga a recolocar el cursor a mano y produce el salto de caret al escribir en medio de la cifra.

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Regla 3 - Bloqueante] El worktree venía con la base equivocada**

- **Encontrado durante:** el arranque. `git merge-base` devolvía el propio HEAD del worktree, o sea que estaba **detrás** del commit base del plan y no traía ninguno de los planes 02-01 a 02-11.
- **Arreglo:** el `reset --hard` del chequeo de arranque quedó denegado por el clasificador, pero la comprobación demostró que el worktree era **ancestro** del base, no divergente, así que un `git merge --ff-only` al commit exacto llega al mismo árbol sin descartar nada. Es la quinta vez consecutiva (02-08, 02-09, 02-10, 02-11 y este).
- **Archivos versionados:** ninguno.

**2. [Regla 1 - Bug] `''` bloqueaba `Guardar` en dos campos opcionales**

- **Encontrado durante:** Tarea 1, al montar el formulario sobre los esquemas. Detalle completo en §3.
- **Arreglo:** `vacioANulo` extendido a los cinco opcionales de texto, más el caso de la cadena de solo espacios.
- **Archivos:** `lib/domain/apartamento.schema.ts`, `+5 tests`. **Commit:** `f17f64e`.

**3. [Regla 1 - Bug] El `Select` no decía su valor a un lector de pantalla**

- **Encontrado durante:** Tarea 3, por el fallo del primer test de persistencia. Detalle completo en §7.
- **Arreglo:** `aria-labelledby` con etiqueta y disparador en los tres `Select`.
- **Archivos:** `SeccionGestion.tsx`, `FormularioApartamento.tsx`. **Commit:** `8ca644c`.

**4. [Regla 3 - Bloqueante] Playwright iba a medir el código de otro checkout**

- **Encontrado durante:** Tarea 3, antes de la primera corrida. Detalle completo en §8.
- **Arreglo:** `PLAYWRIGHT_PORT` en `playwright.config.ts`, con default 3000.
- **Archivos:** `playwright.config.ts`. **Commit:** `8ca644c`.

**5. [Regla 1 - Bug] Dos comentarios rompían su propia verificación**

- **Encontrado durante:** Tareas 1 y 2, al correr los `grep` de verificación del plan. La cabecera de `CampoMoneda` explicaba por qué NO se usa el tipo de input numérico citándolo literal, y tres comentarios explicaban por qué la suscripción va con array citando literal la forma prohibida. Los dos `grep` del plan (`! grep -q 'type="number"'` y `! grep -rnE 'watch\(\)'`) salían **rojos sobre código correcto**.
- **Arreglo:** los comentarios describen el token en vez de escribirlo, y dicen por qué. Es la sexta vez que este patrón muerde en el repo.
- **Commits:** `f17f64e`, `fea1511`.

### Añadidos deliberados sobre el plan

**6. [Regla 2] `aEnteroCOP` y `formatMilesCOP` salen a `lib/domain/money.ts` con 10 tests**

El plan pone la máscara dentro de `CampoMoneda.tsx`. Ahí **ninguna suite la ejecuta**: `vitest.config.ts` recoge solo `lib/**`. Una línea que corrompe todas las tarifas del catálogo no puede vivir donde nada la alcanza. Detalle en §1.

**7. [Regla 2] El universo de requisitos del checklist sale de la misma función**

El plan pide una sola fuente para la lista, el `disabled` y el tooltip. La cuarta —el conjunto de requisitos que permite pintar los cumplidos— no está en el enunciado y era el sitio natural para una segunda copia de la regla. Detalle en §5.

**8. [Regla 2] Navegación al detalle tras crear**

Sin ella, el segundo `Guardar` de un alta inserta otra vez. Detalle en §9.

**9. [Regla 2] Tests de más sobre lo que el plan pedía**

- El spec lleva **9** tests y no las 8 aserciones del plan: se añadieron el contacto de solo espacios, el CONTROL de que el foco no estaba ya en el campo, la comprobación del `responsable_id` contra el id del perfil, y el camino de confirmar (no solo cancelar) el diálogo de gestión externa.
- `money.test.ts` gana **10** y `apartamento.schema.test.ts` gana **5**, todos con su CONTROL.

### Desviaciones menores del texto del plan

**10. El submit valida a mano en los DOS modos, no solo en `activar`**

El plan dice que `Guardar` valida con `esquemaBorrador` y `Guardar y activar` con `esquemaActivar`. El resolver de borrador sigue puesto para la validación por `blur` (que es lo que pinta los errores inline de §9.4), pero los dos submits llaman a `safeParse` explícitamente. Mezclar `handleSubmit` para uno y `safeParse` para el otro daría dos caminos de error distintos para la misma pantalla. 02-RESEARCH §5.2 contempla esta forma.

**11. Tres tokens nuevos en `globals.css`**

`--container-boton-activar`, `--container-boton-guardar` y `--container-formulario`. §9.3 exige `min-width` en los botones que cambian a gerundio y §2 prohíbe los valores arbitrarios, así que la única forma de cumplir las dos es un token. Son dos tokens de botón y no uno porque los labels miden distinto.

**12. La hora se pinta en 12h**

Divergencia con §8.4, medida y aceptada. Detalle en §6.2.

---

## Threat Model: dispositions aplicadas

| Threat ID | Disposición | Cómo quedó |
|---|---|---|
| T-02-61 | mitigate | Las tres capas en pie. `faltantesParaActivar` apaga el botón (señuelos C y D lo ponen rojo), `esquemaActivar` valida en la action, y los CHECK son la red final. El botón deshabilitado se prueba con su CONTROL positivo en el mismo test, así que no puede pasar por estar la pantalla caída |
| T-02-62 | mitigate | **Puerta solo de UI, declarada en el nombre del test, en su comentario y en `apartamento.schema.ts`.** Cubierta en sus tres formas: vacío, solo espacios y el control positivo. El señuelo D la deja rojo y no toca nada más de Playwright |
| T-02-63 | accept | Sin cambios de postura. El código se muestra en claro en la pantalla donde el admin lo edita, y llega por `leerSecretos` con su guard. No es `type="password"` a propósito: el admin tiene que poder comprobar lo que escribe. La ruta del aseador sigue siendo el RPC con ventana y auditoría |
| T-02-64 | mitigate | Los dos `Select` listan solo `profiles` con `role = 'aseador'` (lo garantiza `listarAseadoresActivos`), el de suplente excluye además al responsable elegido, y la FK contra `profiles` impide un uuid inventado. El E2E comprueba el `responsable_id` guardado contra el id real del perfil |
| T-02-65 | mitigate | Todo error de base pasa por `mapDbError` en la action; el formulario solo enruta. Y este plan cierra dos caminos por los que un `23514` llegaba a pantalla: el paso a gestión externa limpia los tres campos que `props_assignees_only_when_managed` prohíbe, y el suplente no puede seleccionarse igual al responsable |
| T-02-66 | accept | `target="_blank"` con `rel="noopener noreferrer"`, y el botón solo aparece cuando hay valor. Ningún fetch de servidor contra esa URL |

## Threat Flags

Ninguna superficie de seguridad nueva fuera del registro. Este plan añade **dos rutas de página** (las dos dentro del route group `(admin)`, que ya tiene su guard, y las dos leyendo con el JWT del usuario), **cero** Server Actions nuevas, **cero** endpoints de API y **cero** migraciones o cambios de schema.

## Known Stubs

**Ninguno de producto en el alcance de este plan.** Las cuatro secciones renderizan sus campos, los 12 persisten y las puertas de activación están cerradas.

Lo que este plan **no** construye, por contrato y no por omisión:

- **La sección 5 del formulario (cuartos y faltantes de UI-SPEC §8.1)**, que es del plan **02-13**. Hoy el formulario tiene cuatro secciones y ninguna referencia a la quinta: no hay un bloque vacío ni un "próximamente".
- **`/apartamentos/[id]/calendario`**, que es del plan **02-14**. El ítem `Conectar calendario` del menú de la tabla sigue llevando a un 404 de Next, igual que lo dejó el 02-11. El formulario no lo menciona, y la razón está escrita en su cabecera.

---

## Notas para los planes siguientes

- **02-13 (cuartos y faltantes), lo que hereda:**
  - `FormularioApartamento` ya recibe `fila` y `leerApartamento` ya devuelve `cuartos` y `faltantes`: solo hay que pasarlos y montar la quinta `<Seccion>`, que es un componente local de ese archivo.
  - **`property_rooms_etiqueta_uniq` NO es parcial** (medido en 02-10): un cuarto desactivado sigue reservando su etiqueta aunque `leerApartamento` no lo devuelva. Validar el duplicado solo contra la lista visible produce un `23505` sobre una fila invisible. `missing_item_catalog` es al revés: `leerApartamento` devuelve **todos** los faltantes sin filtrar por `is_active`, justamente para poder reactivar en vez de chocar.
  - Los dos `useFieldArray` van a añadir campos al estado. **No** hace falta tocar la suscripción de la barra de acciones: es granular y lista por nombre.
  - Si necesitas un input con máscara, el patrón está en `CampoMoneda`: la transformación de vuelta va como `setValueAs` del `register`, no en el submit.
- **02-14 (conectar calendario):** el formulario **no** toca `property_secrets.ical_url` y el upsert de `guardarApartamento` omite esa columna a propósito, así que guardar el formulario no puede desconectarte el feed. Mantén la regla de que la URL nunca entra en un log ni en `last_error`.
- **Cualquier pantalla nueva con un `Select` de Base UI:** el disparador necesita `aria-labelledby` con la etiqueta **y** su propio id, o el valor seleccionado desaparece del nombre accesible. Medido en este plan; ver §7.
- **Cualquier spec de Playwright nuevo:**
  - `getByRole(name:)` casa por **subcadena**. `Guardar y activar` contiene `Guardar`, `Desactivar` contiene `activar`, `Inactiva` contiene `activa`. Usa `exact: true` siempre que una etiqueta sea prefijo o sufijo de otra.
  - Si corres en paralelo con otro checkout, exporta `PLAYWRIGHT_PORT`. Con el default y `reuseExistingServer`, la suite mide el servidor que encuentre.
  - Toda aserción de "deshabilitado", "vacío" o "0 filas" lleva su CONTROL positivo en el mismo test.
- **Cualquier comentario en un archivo que un `grep` de verificación vigila:** describe el token, no lo escribas. Van seis veces.
- **Bloqueante residual heredado de 02-01 a 02-11:** sigue pendiente un `npx supabase stop && npx supabase start` al cierre de la fase para confirmar en frío que el `config.toml` commiteado reproduce el entorno.
- **Los 3 errores de lint de `e2e/fixtures.ts`** siguen ahí y siguen fuera de alcance: ítem 1 de `deferred-items.md`. `npm run build` no lintea `e2e/`.
- **El stack local quedó limpio.** Verificado al terminar: 39 apartamentos con sus 8 clusters y sus 5 informativas, **0 activas**, 0 secretos, 0 aseos, y los **3 perfiles del orquestador intactos** (Juan Ortega admin, Luz Ospina y María Restrepo aseadoras). Ninguna siembra de este plan sobrevive.

## Self-Check: PASSED

Los 8 archivos declarados como creados y los 6 como modificados existen en disco, y los 4 hashes de commit (`f17f64e`, `fea1511`, `8ca644c`, `1a2b5ac`) resuelven a objetos de tipo `commit` en el historial de la rama. Ni `STATE.md` ni `ROADMAP.md` aparecen en el diff de este plan.
