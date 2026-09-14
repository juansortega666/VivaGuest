---
phase: 07-financiero
plan: 12
subsystem: ui
tags: [next-app-router, rsc, server-actions, supabase-rpc, storage-signed-url, service-worker, sheet, alert-dialog, accesibilidad]

requires:
  - phase: 07-financiero
    provides: "Migración 27 (plan 07-09): `periodos_de_pago`, `pagos_del_periodo`, `detalle_de_pago` y `marcar_pago_pagado`, las cuatro con guarda de rol como primera sentencia y con el bloqueo de fila que impide marcar dos veces"
  - phase: 07-financiero
    provides: "Migración 25 (plan 07-07): `periodo_pendiente_de_cierre` y `cerrar_periodo`, con su validación de rango y de vencimiento"
  - phase: 07-financiero
    provides: "`lib/domain/mes.ts` (plan 07-06): `etiquetaDePeriodoDePago` con sus tres formas, gemela de la función de Postgres"
  - phase: 07-financiero
    provides: "El chasis del plan 07-10: `SubNavFinanzas`, `DialogoRecibo`, `CirculoIniciales`, `lib/data/recibos.ts` y los ocho tokens de §2.1 con `--container-boton-marcar`"
  - phase: 07-financiero
    provides: "`e2e/finanzas.spec.ts` (plan 07-03), escrito en rojo contra el copy literal del contrato de diseño"
  - phase: 04-dashboard-operativo
    provides: "El patrón de cabecera colapsable de `BloqueDia`, el de Server Action sin revalidación de ruta, y el de botón con ancho mínimo para no saltar en vuelo"
provides:
  - "`app/(admin)/finanzas/pagos/page.tsx` — la sub-pestaña Pagos: periodos cerrados, desglose y marcar pagado. **Es la superficie que hace consultable el snapshot de FIN-04**"
  - "`app/(admin)/finanzas/pagos/_actions.ts` — `marcarPagado` y `cerrarPeriodo`, las dos con guarda de admin como primera operación y sin revalidación de ruta"
  - "`app/(admin)/finanzas/_components/BloquePeriodoCerrado.tsx` — el bloque colapsable con las dos fechas reales en el rótulo"
  - "`app/(admin)/finanzas/_components/TablaPagosDelPeriodo.tsx` — las siete columnas de §9.1 con las dos partidas separadas"
  - "`app/(admin)/finanzas/_components/BotonMarcarPagado.tsx` — la confirmación con el nombre y el monto literales, y el cliente que LEE el resultado"
  - "`app/(admin)/finanzas/_components/SheetDesglosePago.tsx` — el desglose en `?pago={id}`, con las dos fechas de cada aseo siempre"
  - "`app/(admin)/finanzas/_components/AvisoPeriodoSinCerrar.tsx` — la salida del admin cuando el cálculo automático no corrió"
  - "`lib/data/pagos.ts` — la capa de lectura del registro congelado"
  - "`app/sw.ts` con el paso de largo para todo lo que no es de este origen: sin él, NINGUNA foto de recibo carga en producción"
affects: [07-14, 08, 09]

tech-stack:
  added: []
  patterns:
    - "Un panel de solo lectura que se abre desde una tabla vive en la DIRECCIÓN (`?pago={id}`) y no en estado de cliente: así lo renderiza el servidor, las URL firmadas se emiten solo para lo que alguien está mirando, y el panel es enlazable y sobrevive a un refresco"
    - "La etiqueta de un periodo se formatea UNA vez y se deriva de ahí la forma para meterla dentro de una frase (quitarle el `Del `), en vez de formatear dos veces: una segunda ruta de formato es como las dos divergen justo en el periodo que cruza el año"
    - "Un identificador que llega por la dirección se comprueba contra lo que la página YA leyó, no mandándolo a la base a ver qué pasa: una dirección escrita a mano tiene que enseñar la pantalla, no un error que nadie sabría explicar"
    - "Nada de otro origen pasa por el service worker. Ni se cachea (son respuestas por usuario y la caché sobrevive al cierre de sesión) ni se intercepta (reemitir una petición opaca desde el worker la rompe)"
    - "Un `P0001` cuyo `hint` de la base no coincide con el copy del contrato se traduce en la action, por token, antes de delegar en el traductor general"

key-files:
  created:
    - app/(admin)/finanzas/pagos/page.tsx
    - app/(admin)/finanzas/pagos/loading.tsx
    - app/(admin)/finanzas/pagos/_actions.ts
    - app/(admin)/finanzas/_components/BloquePeriodoCerrado.tsx
    - app/(admin)/finanzas/_components/TablaPagosDelPeriodo.tsx
    - app/(admin)/finanzas/_components/BotonMarcarPagado.tsx
    - app/(admin)/finanzas/_components/SheetDesglosePago.tsx
    - app/(admin)/finanzas/_components/AvisoPeriodoSinCerrar.tsx
    - lib/data/pagos.ts
    - lib/data/pagos.test.ts
  modified:
    - app/sw.ts
    - e2e/finanzas.spec.ts
    - e2e/fixtures.ts

key-decisions:
  - "El desglose vive en `?pago={id}` y no en estado de cliente. La razón que decide no es la comodidad: con el panel en el cliente habría que firmar los recibos de las ocho filas de cada periodo al cargar la página, y una URL firmada sobrevive al cierre de sesión hasta que expire"
  - "Se navega con `replace` al abrir y al cerrar el panel: abrir ocho desgloses seguidos dejaría dieciséis entradas de historial y el botón de volver dejaría de servir para volver a ninguna parte"
  - "La tabla no lleva envoltorio de desplazamiento horizontal. Las seis columnas fijas suman 748px, así que ASEADOR recibe 644 a 1440 y 228 a 1024, contra su mínimo de 200"
  - "El aviso de periodo sin cerrar enseña, además del copy fijo del contrato, la razón concreta del fallo ya traducida. Sin ella, un «no tienes permiso» se leería como un fallo pasajero y el admin reintentaría toda la tarde"
  - "Nada de otro origen pasa por el service worker, y la regla es TOTAL en vez de una lista de rutas de Supabase: `next/font/google` descarga las fuentes en el build, así que Supabase es lo único que este producto pide fuera"

patterns-established:
  - "Panel en la dirección: un panel de solo lectura que se abre ocho veces seguidas desde una tabla se resuelve con un enlace real y `searchParams`, no con estado de cliente"
  - "Etiqueta de periodo en dos formas, una sola fuente: `Del 1 al 30 de enero de 2026` para rotular, y la misma sin el `Del ` para meterla dentro de una frase"
  - "Frontera del service worker: lo que no es de este origen no se intercepta ni se cachea"

requirements-completed: [FIN-03, FIN-04]

coverage:
  - id: D1
    description: "El admin ve, por periodo cerrado, cuánto se le debe a cada persona y a quién le falta pagarle, con las dos fechas reales de cada periodo y las dos partidas separadas"
    requirement: FIN-03
    verification:
      - kind: e2e
        ref: "e2e/finanzas.spec.ts#cada periodo cerrado se rotula con sus dos fechas reales, solo el más reciente viene abierto, y las partidas van en columnas separadas"
        status: pass
      - kind: unit
        ref: "lib/data/pagos.test.ts (18 casos)"
        status: pass
    human_judgment: false
  - id: D2
    description: "El desglose de un pago muestra las dos fechas de cada aseo (también cuando coinciden), abre el recibo de cada gasto, y no lleva ninguna cifra de huésped ni ningún margen"
    requirement: FIN-04
    verification:
      - kind: e2e
        ref: "e2e/finanzas.spec.ts#el desglose muestra las dos fechas de cada aseo, también cuando coinciden, y no lleva ninguna cifra de huésped"
        status: pass
    human_judgment: false
  - id: D3
    description: "Marcar pagado deja fecha y autor, pide confirmación con el nombre y el monto literales, y no se puede hacer dos veces"
    requirement: FIN-03
    verification:
      - kind: e2e
        ref: "e2e/finanzas.spec.ts#marcar pagado confirma con el nombre y el monto literales, deja constancia, y no se ofrece dos veces"
        status: pass
    human_judgment: false
  - id: D4
    description: "El vacío de Pagos explica cuándo ocurre el primer cierre, con el copy exacto del contrato"
    requirement: FIN-03
    verification:
      - kind: e2e
        ref: "e2e/finanzas.spec.ts#el vacío explica cuándo ocurre el cierre, con su copy exacto"
        status: pass
    human_judgment: false
  - id: D5
    description: "Ninguna ruta de finanzas, incluida `/finanzas/pagos`, es alcanzable desde una sesión de aseadora"
    requirement: FIN-04
    verification:
      - kind: e2e
        ref: "e2e/finanzas.spec.ts#una sesión de aseadora no alcanza ninguna ruta de finanzas"
        status: pass
    human_judgment: false
  - id: D6
    description: "Si el cálculo automático no corrió, el admin puede cerrar el periodo desde la propia pantalla, con confirmación y con el fallo en el sitio del aviso"
    requirement: FIN-03
    verification: []
    human_judgment: true
    rationale: "No hay caso E2E: el escenario sembrado cierra los dos periodos vencidos, así que `periodo_pendiente_de_cierre()` devuelve cero filas y el aviso no existe en el DOM, que es justamente el comportamiento correcto. Reproducirlo exige dejar un periodo vencido sin cerrar a mano. Se verifica mirando la pantalla"

duration: 135min
completed: 2026-09-13
status: complete
---

# Fase 7 Plan 12: la sub-pestaña Pagos Summary

**El registro de lo que se debe y de lo que se pagó: periodos cerrados rotulados con sus dos fechas reales, desglose congelado que sobrevive al borrado de los aseos, y una marca de pagado irreversible que confirma con el nombre y el monto literales. Y, de paso, el defecto que impedía que cargara NINGUNA foto de recibo en producción.**

## Performance

- **Duración:** ~2h 15m
- **Tareas:** 3 de 3
- **Archivos:** 10 creados, 3 modificados
- **Commits:** 6

## Accomplishments

- **`/finanzas/pagos` completa**, con sus periodos colapsables, su tabla de siete columnas, su desglose y su marca de pagado. **Es la pantalla que hace verdadero el criterio 4 del ROADMAP**: el plan 07-09 dejó anotado que FIN-04 no podía darse por completo hasta que alguien pudiera consultar el snapshot, y esto es ese alguien.
- **Los cuatro casos del plan en verde** (`e2e/finanzas.spec.ts`, casos 11 a 15 en el orden del archivo), corridos con el build de producción, puerto propio y base recién reseteada. Más el caso compartido de aislamiento por rol, que cierra `:796` / T-07-09.
- **Encontrado y cerrado un defecto de producto que la suite no podía ver**: con el service worker puesto, ninguna foto de recibo cargaba. Medido, no supuesto (ver Deviations).
- **1201 unitarios en verde** (18 nuevos), `ci:arch`, `lint` y `tsc` limpios, y **132 E2E pasando con 1 saltado** en la suite completa.

## Task Commits

1. **Task 1 (a): la capa de lectura** — `0c0c239` (feat)
2. **Task 3: las dos acciones de servidor y el botón** — `aaf5777` (feat)
3. **Task 2: el desglose y el aviso de periodo sin cerrar** — `15f5f74` (feat)
4. **Task 1 (b–e): la pantalla, su tabla, su bloque y su esqueleto** — `fb6768e` (feat)
5. **Deviación: el service worker y la foto del recibo** — `05235e3` (fix)
6. **Deviación: tres rojos del spec que ninguna pantalla podía apagar** — `ccc0c51` (fix)

> **El orden de los commits no es el de las tareas, y es a propósito.** Cada commit
> tiene que compilar solo. La tabla de la tarea 1 consume el botón de la tarea 3, y
> la página consume el panel de la tarea 2, así que las hojas van antes que la
> pantalla que las monta. Las tres tareas están completas y cada una tiene su
> commit identificable.

## Files Created/Modified

| Archivo | Qué hace |
|---|---|
| `lib/data/pagos.ts` | Las cuatro lecturas del registro congelado. Forma del dominio campo a campo, cero autorización propia, y toda llamada comprueba su error |
| `lib/data/pagos.test.ts` | 18 casos. Los señuelos son cifras de huésped: una columna nueva de la base no puede propagarse sola hasta el navegador |
| `app/(admin)/finanzas/pagos/page.tsx` | La pantalla. Lee periodos, sus pagos en paralelo, el periodo pendiente, y el desglose solo si `?pago=` casa con algo que ya leyó |
| `app/(admin)/finanzas/pagos/loading.tsx` | Esqueleto con la geometría real: cabecera de 48px, fila de encabezado de 32 con los siete anchos exactos, y diez filas de 40 |
| `app/(admin)/finanzas/pagos/_actions.ts` | `marcarPagado` y `cerrarPeriodo`. Guarda de admin como primera operación, validación, y ninguna pide revalidación de ruta |
| `.../_components/BloquePeriodoCerrado.tsx` | El bloque colapsable. Las dos fechas en el rótulo, el colapso sin animar la altura, solo el más reciente abierto |
| `.../_components/TablaPagosDelPeriodo.tsx` | Las siete columnas con sus anchos de token. Las dos partidas separadas, `$ 0` en gastos, séptima celda vacía cuando ya se pagó |
| `.../_components/BotonMarcarPagado.tsx` | Confirmación con nombre y monto literales, sin variante destructiva, y el cliente LEE el `ok` antes de decir nada |
| `.../_components/SheetDesglosePago.tsx` | El panel de 480 en `?pago={id}`. Dos secciones, las dos fechas de cada aseo siempre, cero enlaces, cero cifras de huésped |
| `.../_components/AvisoPeriodoSinCerrar.tsx` | La salida cuando el cierre automático falló. No existe en el DOM en el caso normal |
| `app/sw.ts` | **Modificado.** Lo que no es de este origen pasa de largo: ni se cachea ni se intercepta |
| `e2e/finanzas.spec.ts` | **Modificado.** Dos localizadores corregidos (ver Deviations) |
| `e2e/fixtures.ts` | **Modificado.** La siembra ahora sube los bytes del recibo, y la limpieza los borra |

## Decisions Made

**1. El desglose vive en la dirección (`?pago={id}`), no en estado de cliente.**
Tres razones, y la tercera es la que decide: (a) es enlazable y sobrevive a un
refresco, igual que el filtro del Resumen; (b) las líneas las renderiza el
servidor, así que el desglose de los ocho pagos no viaja al navegador por si
acaso; (c) **las URL firmadas de los recibos se emiten solo para el pago que
alguien está mirando.** Con el panel en el cliente habría que firmarlos todos al
cargar la página, y una URL firmada sobrevive al cierre de sesión hasta que
expire. Es exactamente lo que un bucket privado existe para que no pase.

**2. Se navega con `replace` en los dos sentidos.** Abrir ocho desgloses
seguidos con `push` deja dieciséis entradas de historial y el botón de volver
del navegador deja de servir para volver a ninguna parte.

**3. La séptima columna no lleva rótulo, ni siquiera para lector de pantalla.**
Es lo que fija §9.1 y lo que la suite afirma sobre las seis primeras. El nombre
accesible de cada botón ya dice lo que hace.

**4. El aviso de fallo al cerrar enseña, además del copy fijo del contrato, la
razón concreta ya traducida.** §12.3 fija `No se pudo cerrar el periodo.` /
`Vuelve a intentar…`, y eso se escribe literal. Se le añade una tercera línea con
el mensaje de `mapDbError()`: sin ella, un «no tienes permiso» se leería como un
fallo pasajero y el admin reintentaría toda la tarde contra una puerta cerrada.
**Es una adición declarada, no una sustitución.**

**5. Se pluraliza `1 persona` / `falta 1 por pagar`.** El contrato escribe las
plantillas en plural (`{N} personas`, `faltan {M} por pagar`). Con N = 1 saldría
`1 personas`, que es visiblemente incorrecto y el dueño lo marcaría. Ninguna
aserción depende de esto.

**6. Copy AÑADIDO para un caso que el contrato no cubre: el periodo cerrado sin
ningún pago.** La función de la base usa `left join` justamente para que un
periodo cerrado sin trabajo no desaparezca de la lista (si desapareciera, el
admin leería la ausencia como «el job falló»). Si al abrirlo no dijera nada, esa
ambigüedad volvería. Usa el componente de vacío que ya existe, en su variante
compacta: `Este periodo se cerró sin ningún pago.` / `No hubo ningún aseo
completado en estas fechas.`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Con el service worker puesto, NINGUNA foto de recibo carga**

- **Encontrado durante:** Task 2, verificando el caso del desglose.
- **El problema.** El caso del desglose fallaba de forma intermitente (2 de 6 al
  principio, 4 de 5 midiéndolo en aislamiento) con el diálogo del recibo diciendo
  `No se pudo mostrar el recibo.` sobre un archivo que el servidor sirve con 200.
  **No es un defecto del test: es el producto.** Una vez que el worker está
  activo, la foto no carga nunca.
- **La medición, con sonda de red delante y cinco corridas por variante:**

  | Variante | Resultado |
  |---|---|
  | Como estaba (`defaultCache` con su regla comodín para otro origen) | 4 de 5 en `net::ERR_FAILED`, sin respuesta. La única que funcionó fue con `fromServiceWorker: false` |
  | Reintentar la imagen una vez en el diálogo | **5 de 6 rojas.** No ayuda: una vez que el worker atiende, falla siempre |
  | Cambiar la estrategia a una que solo va a la red | 4 de 5 rojas. El problema no es qué hace la estrategia |
  | **Que el worker no responda a lo que no es de este origen** | **5 de 5 en verde, todas sin pasar por el worker** |

- **La causa.** Una foto se pide con `<img>`, así que su petición es `no-cors` y
  su respuesta es opaca. Reemitirla desde dentro del worker le quita esa
  condición y el navegador la corta. Por eso el mismo archivo carga sin worker y
  falla con él.
- **La segunda razón, que es la que hace que esto no se revierta.** Lo único que
  este producto pide a otro origen es Supabase: base, autenticación y
  almacenamiento privado. La regla comodín **guardaba esas respuestas una hora en
  una caché del navegador**. Son respuestas por usuario, y esa caché sobrevive al
  cierre de sesión: en un teléfono compartido, la siguiente persona que abra la
  aplicación se podía encontrar el recibo o la lista de la anterior.
- **Fix:** un oyente de `fetch` propio, registrado antes que los de Serwist, que
  corta la propagación para lo que no es de este origen. Sin nadie que responda,
  el navegador hace la petición él mismo.
- **Archivos:** `app/sw.ts`
- **Commit:** `05235e3`
- **Por qué se tocó un archivo que no era de este plan:** es la puerta por la que
  pasa la única evidencia que el admin tiene de un gasto, y el defecto bloqueaba
  un criterio de aceptación de este plan. El propio archivo declara que solo
  cablea, y esto es cableado: no hay lógica nueva, hay una petición que deja de
  interceptarse.

**2. [Rule 1 - Bug] Un localizador insatisfacible en `e2e/finanzas.spec.ts`**

- **Encontrado durante:** Task 1.
- **Issue:** `tabla.getByRole('row').locator('td').nth(5)` aplana las celdas de
  TODAS las filas en una sola lista y `.nth(5)` devuelve UNA. Con un solo texto,
  las dos aserciones siguientes (que haya un `Pendiente` y un `Pagado el`) no
  podían ser ciertas a la vez: **ninguna pantalla podía apagar ese rojo.**
- **Fix:** `tabla.locator('tbody td:nth-child(6)')`, que es la celda `PAGADO` de
  cada fila. La intención escrita en el comentario del caso se conserva entera.
- **Archivos:** `e2e/finanzas.spec.ts`
- **Commit:** `ccc0c51`

**3. [Rule 1 - Bug] La siembra escribía la fila de la foto y ningún byte**

- **Encontrado durante:** Task 2.
- **Issue:** `sembrarFinanzas` insertaba la fila de `cleaning_photos` pero no
  subía nada al bucket. Sin objeto no hay firma, y con firma sobre un objeto que
  no existe la imagen falla igual: la aserción de que el recibo se ve era
  inalcanzable por construcción.
- **Fix:** se sube un JPEG de 1×1 (el bucket solo admite jpeg, png y webp, así
  que no vale un relleno cualquiera) y se borra en la limpieza. El objeto de
  almacenamiento no cuelga de ninguna clave foránea.
- **Archivos:** `e2e/fixtures.ts`
- **Commit:** `ccc0c51`

**4. [Rule 1 - Bug] Una carrera en el caso de marcar pagado**

- **Encontrado durante:** Task 3.
- **Issue:** `allTextContents()` no espera, y `goto` vuelve con el evento `load`,
  que en el App Router llega con el esqueleto pintado y el contenido en camino.
  El caso leía un arreglo vacío cada vez que el servidor tardaba un poco más y
  moría con `undefined.trim()`. Reproducido varias veces.
- **Fix:** se antepone `await expect(fila).toBeVisible()`, que sí espera. Es una
  aserción MÁS, no menos: ahora el caso afirma que la fila existe.
- **Archivos:** `e2e/finanzas.spec.ts`
- **Commit:** `ccc0c51`

---

**Total de deviaciones:** 4, todas Rule 1 (bug), todas medidas antes de tocar
nada. **Impacto:** ninguna amplía el alcance. Tres eran rojos que ninguna
pantalla correcta podía apagar; la cuarta era un defecto de producto que la
suite no veía y que dejaba sin evidencia todos los gastos.

## Issues Encountered

**1. Tres agentes escribiendo sobre el mismo árbol y la misma base.** La wave 7
corrió con `07-11` y `07-13` en el mismo directorio: sus `next build` borraban el
`.next` mientras mi servidor lo servía, y sus `db:reset` y sus corridas E2E
chocaban con la mía en el `globalSetup`, que borra y recrea los usuarios semilla.
Síntomas vistos: `required-server-files.json` inexistente, `Database error
deleting user` (por apartamentos E2E huérfanos de una corrida abortada), y **una
medición falsa**: con periodos de pago sobrantes en la base, la primera tabla de
la pantalla era la de otra corrida y tres casos fallaban por razones que no eran
suyas. Resuelto esperando a que el árbol quedara libre y midiendo siempre sobre
base reseteada.

**2. Los casos 2 y 3 del Resumen (`/finanzas`) están rojos, y no son de este
plan.** 5 de 6 en aislamiento. Este plan no toca `page.tsx` del Resumen, ni
`FiltroPeriodo`, ni `TarjetaKPI`, ni `lib/data/finanzas.ts`, y los dos casos
estaban en verde en las primeras corridas del día. Queda medido y fechado en
`deferred-items.md` con su ventana de commits y por dónde empezar.

## User Setup Required

Ninguno.

## Threat Flags

Ninguno nuevo. El registro STRIDE del plan se cubre entero:

| Amenaza | Cómo queda |
|---|---|
| T-07-58 (acción invocada por HTTP desde una sesión de aseadora) | Guarda de admin como primera operación de las dos acciones, más la guarda de la función de base. Verificado por el caso de aislamiento |
| T-07-59 (marcar dos veces desde dos pestañas) | El bloqueo vive en la base; la interfaz esconde el botón y traduce el rechazo con el copy del contrato |
| T-07-60 (pago sin saber quién ni cuándo) | La base escribe instante y autor; la columna `PAGADO` los muestra |
| T-07-61 (cerrar antes de tiempo) | El aviso solo existe cuando el periodo ya venció sin cerrar, y la base rechaza el rango |
| T-07-62 (cifra de huésped o margen en el desglose) | Ni la función de base las devuelve ni el panel las declara. Afirmado por el caso del desglose sobre las cuatro cifras prohibidas |
| T-07-63 (pantalla colgada por la revalidación de ruta) | `grep -rc "revalidatePath" "app/(admin)/finanzas"` da 0, incluidos los comentarios, y los casos se corren con el build de producción |

**Hallazgo de seguridad no previsto en el registro, y cerrado en este plan:** el
service worker guardaba durante una hora, en una caché del navegador, **toda
respuesta de Supabase**: la base, la autenticación y los recibos firmados. Son
respuestas por usuario y esa caché sobrevive al cierre de sesión. Ver la
deviación 1.

## Known Stubs

Ninguno.

## Verification

| Puerta | Resultado |
|---|---|
| `npx vitest run` | **1201 verdes**, 63 archivos (18 casos nuevos) |
| `npx tsc --noEmit` | limpio |
| `npm run lint` | 0 errores, 2 avisos preexistentes |
| `npm run ci:arch` | los tres checks OK |
| `grep -rc "revalidatePath" "app/(admin)/finanzas"` | **0** en los 25 archivos |
| `grep -c 'variant="destructive"' BotonMarcarPagado.tsx` | **0** |
| E2E de este plan (casos 11 a 15 del archivo) | **5 de 5 en verde**, build de producción, puerto propio, base reseteada |
| Suite E2E completa | **132 pasando, 1 saltado, 2 rojos** ajenos (ver Issues 2) |

## Self-Check: PASSED

Los once archivos declarados existen en disco y los seis commits existen en el
historial. Comprobado con `[ -f ]` y `git log --oneline --all`.
