---
phase: 04-dashboard-operativo-del-admin
plan: 10
subsystem: ui
tags: [react19, useActionState, base-ui, sheet, combobox, accesibilidad, aria-live]

requires:
  - phase: 04-08
    provides: confirmarAseo y crearAseoManual, con el error de ASEO-07 ya interpolado y anclado a `campo: 'fecha'`
  - phase: 04-09
    provides: la pantalla /operacion, el aside con su presupuesto de altura y la cabecera con su sitio para el CTA
  - phase: 04-06
    provides: bandejaSinConfirmar(), ya ordenada, y FilaDeOperacion
  - phase: 04-03
    provides: formatFechaCortaBog, formatFechaBog, formatHoraLimite
  - phase: 04-02
    provides: components/ui/sheet.tsx y los tres overrides documentados en su cabecera
  - phase: 02
    provides: EstadoVacio, SelectorCluster como patron de combobox y DialogoCrearAseador como patron de dialogo con useActionState
provides:
  - La bandeja `Sin confirmar` persistente, con contador, CTA y lista completa con scroll interno
  - El `Sheet` de confirmacion encadenada calibrado para quince, con progreso de tanda y `Saltar este`
  - El dialogo de creacion manual de repasos y emergencias, con el 23505 inline bajo el campo fecha
  - La prop `claseIcono` de EstadoVacio, para el vacio que es un buen resultado y no una ausencia
  - Dos tokens de min-width de boton, para que el primario no salte a su gerundio
affects: [04-11, 04-13, 04-14]

tech-stack:
  added: []
  patterns:
    - "Tanda congelada con useState(() => prop): revalidatePath no puede mover la lista bajo el formulario"
    - "key de sesion desde el padre para reiniciar un panel encadenado, en vez de un useEffect de reset"
    - "Marca `procesado` (useRef sobre la identidad del resultado) para que useActionState no reprocese el mismo exito"
    - "Validacion de cliente envolviendo la funcion de useActionState en el `action` del form, sin deshabilitar el boton"

key-files:
  created:
    - "app/(admin)/operacion/_components/BandejaSinConfirmar.tsx"
    - "app/(admin)/operacion/_components/SheetConfirmar.tsx"
    - "app/(admin)/operacion/_components/DialogoCrearAseo.tsx"
  modified:
    - "app/(admin)/operacion/page.tsx"
    - "app/(admin)/_components/EstadoVacio.tsx"
    - "app/globals.css"

key-decisions:
  - "La tanda se congela al montar el Sheet: sin eso, el revalidatePath de confirmarAseo cambia el aseo que el admin esta mirando"
  - "La tanda que abre una fila es de esa fila hacia abajo, no la lista entera: encadenar es seguir, no volver al principio"
  - "`Saltar este` tambien aparece sin responsable, no solo ante un fallo: si no, una unidad sin responsable bloquea las doce que faltan"
  - "El responsable fijo sale de listarApartamentos, no de un embed nuevo en leerOperacion: un aseo sin confirmar todavia no tiene aseador_id"
  - "La cabecera de la bandeja va FUERA del scrollport en vez de `sticky top-0`: consigue lo mismo y respeta el reparto de altura de 04-09"
  - "La bandeja lleva una linea permanente sobre el aseo huerfano que deja reprogramar, medido en 04-07"

patterns-established:
  - "Panel encadenado: tanda congelada + progreso sobre la tanda inicial + un solo toast al cerrar + aria-live por paso"
  - "Combobox de entidad: Popover + Command con filtro por normalizar(), input oculto con el id y otro con el nombre para el copy"

requirements-completed: [ASEO-01, ASEO-02, ASEO-03, ASEO-05, ASEO-07, DASH-02]

duration: 68min
completed: 2026-09-06
---

# Phase 4 Plan 10: El carril de entrada Summary

**La bandeja `Sin confirmar` persistente, el `Sheet` de confirmación encadenada calibrado para quince seguidas —tanda congelada, progreso, `Saltar este`, cero toasts por paso— y el diálogo de creación manual cuyo choque de fecha se lee bajo el campo `Fecha` en vez de en un toast.**

## Performance

- **Duration:** 68 min
- **Started:** 2026-09-06T13:05:00Z
- **Completed:** 2026-09-06T14:13:00Z
- **Tasks:** 3
- **Files modified:** 6 (3 creados, 3 modificados)

## Accomplishments

- **Las tres superficies montadas en `/operacion`**, con el `aside` del plan 04-09 ocupado por la bandeja y la cabecera de página con su `Crear aseo` cableado. El `aside` ya no está vacío.
- **La tanda del `Sheet` se congela al montar**, y eso resuelve un bug que el plan no anticipaba pero que se sigue del código que ya existía: `confirmarAseo` llama a `revalidatePath('/operacion')`, así que en cuanto el primero se confirma Next re-renderiza el árbol de servidor y la bandeja pasa de quince filas a catorce. Sin congelar, `filas.slice(desde)` habría cambiado el aseo que el admin está mirando **debajo del formulario que acaba de rellenar**. Detalle en las desviaciones.
- **El progreso cuenta confirmados de la tanda inicial**, no posición en una lista que se encoge, que es literalmente lo que pide §10. Cerrar en el 3 y reabrir arranca tanda nueva, por la `key` de sesión que pasa la bandeja.
- **Cero toasts por confirmación y un solo toast al cerrar**, con `aria-live="polite"` anunciando `Aseo 3 de 15 confirmado.` en cada paso. La región va siempre en el DOM, también vacía: un `aria-live` que aparece a la vez que su contenido no se anuncia de forma fiable.
- **El error de ASEO-07 llega legible y anclado.** La action ya devolvía `campo: 'fecha'` con el mensaje interpolado desde 04-08; este plan solo lo pinta donde la action lo nombra, con `aria-describedby` y `aria-invalid`. Ni `23505` ni texto crudo de Postgres en ninguna ruta.
- **Ningún copy dice ni sugiere que se le avisó al aseador.** Los textos nuevos son `Queda asignado a {responsable}`, `Listo: N aseos confirmados.`, `Confirmaste C de N. Los demás siguen en la bandeja.` y `Aseo N de M confirmado.` El test de 04-08 que recorre los mensajes buscando `notific|avis|le lleg|push|se le mand` sigue verde.
- **Ninguna baseline bajó.** Ver la tabla de verificación.

## Task Commits

1. **Task 2: el `Sheet` de confirmación encadenada** — `b6f959e` (feat)
2. **Task 1: la bandeja y su montaje en el carril** — `336f782` (feat)
3. **Task 3: `DialogoCrearAseo` y el error de ASEO-07** — `287d3b8` (feat)
4. **Fuera de alcance, declarado** — `3892655` (docs)

## Files Created/Modified

- `app/(admin)/operacion/_components/SheetConfirmar.tsx` (**creado**, 437 líneas; mínimo del plan: 180)
- `app/(admin)/operacion/_components/BandejaSinConfirmar.tsx` (**creado**, 178 líneas; mínimo: 90)
- `app/(admin)/operacion/_components/DialogoCrearAseo.tsx` (**creado**, 355 líneas; mínimo: 90)
- `app/(admin)/operacion/page.tsx` (**modificado**) — tercer viaje a `listarApartamentos`, el mapa de responsables, el filtro de unidades para el combobox, y las dos superficies montadas.
- `app/(admin)/_components/EstadoVacio.tsx` (**modificado**) — prop `claseIcono`.
- `app/globals.css` (**modificado**) — `--container-boton-confirmar` y `--container-boton-crear-aseo`.

## Decisions Made

1. **La tanda que abre una fila va de esa fila hacia abajo.** El contrato dice que el CTA abre en el primero y que cada fila abre "en ese aseo", pero no dice qué es la tanda cuando se entra por el medio. Encadenar significa **seguir**, así que abrir en la fila 5 de 15 da una tanda de 11 y el progreso dice `1 de 11`. La alternativa —tanda de 15 empezando en el 5 y dando la vuelta— convertiría `Confirmar y seguir` en un carrusel, y el admin que entró por una fila concreta no pidió repasar las cuatro de arriba.

2. **`Saltar este` aparece también cuando el apartamento no tiene responsable.** §10 lo pide solo ante un fallo de `confirm_cleaning`. Pero la misma sección deshabilita el botón de confirmar cuando falta el responsable, y sin una salida eso deja la tanda muerta: el admin no puede confirmar ni avanzar, y su única opción es cerrar las doce que faltan. Es el mismo callejón sin salida por el que `Saltar este` existe, con otra causa. Documentado en el sitio.

3. **La cabecera de la bandeja va FUERA de su scrollport, no `sticky top-0`.** El plan pide `sticky` "para que el contador nunca se vaya con el scroll", y el reparto de altura de 04-09 pide "cabecera + CTA fuera del scroll". Sacarla del scrollport consigue el objetivo del `sticky` por construcción y sin pegado, y es lo que el plan 04-09 dejó escrito como acordado. Se respetó el reparto.

4. **El responsable fijo viene de `listarApartamentos()`, no de un embed nuevo.** `FilaDeOperacion.aseador` es el embed de `cleanings.aseador_id`, y un aseo **sin confirmar todavía no tiene aseador**: es `confirm_cleaning` quien lo asigna al responsable del apartamento. El dato vive en `properties.responsable_id`, y el catálogo ya lo resuelve a nombre. Se prefirió un tercer viaje en paralelo (39 filas) sobre ampliar `SELECT_OPERACION` con un embed anidado a `profiles` que habría tocado `lib/data/operacion.ts`, sus siete fixtures y el test de integración de PostgREST, todo fuera de los `files_modified` del plan.

5. **El diálogo trae su propio `DialogTrigger`.** El plan pide el patrón "diálogo fuera del `DropdownMenu`, controlado por estado del padre", y él mismo anota que acá el riesgo no aplica porque el padre es la cabecera de página. `DialogoCrearAseador` de la Fase 2 —el diálogo con `useActionState` cuyo patrón se copia— trae su propio trigger. Se siguió ese, y el patrón del estado del padre queda para los cuatro diálogos de 04-11, que sí cuelgan de un menú.

6. **`Tipo` nace en `Repaso`.** El contrato no fija defecto. Con dos opciones y ninguna preseleccionada haría falta un cuarto camino de error para un campo que se resuelve con un clic. `Repaso` es el caso común; `Emergencia` está a un clic y el `Select` la muestra.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] La tanda del `Sheet` cambiaba bajo el formulario en cuanto se confirmaba el primero**

- **Found during:** Task 2
- **Issue:** El plan describe la bandeja como dueña del estado y el `Sheet` recibiendo la lista. Pero `confirmarAseo` llama a `revalidatePath('/operacion')`, y Next 15 devuelve el árbol de servidor re-renderizado en la respuesta de la Server Action: la bandeja pasa de quince filas a catorce **antes de que el `Sheet` avance**. Con la lista derivada de la prop en cada render (`filas.slice(desde)`), el aseo del índice 1 dejaría de ser el que el admin esperaba, el denominador del `3 de 15` bajaría solo, y el bloque de contexto cambiaría de apartamento con los campos ya tecleados. Es el fallo exacto contra el que existe D-10.
- **Fix:** `const [tanda] = useState(() => filas)` dentro de `SheetConfirmar`, que captura la lista una vez al montar, más una `key` de sesión desde la bandeja para que reabrir monte un panel nuevo con tanda nueva. Es también lo que hace verdadero el "el progreso cuenta confirmados de la tanda inicial" de §10.
- **Files modified:** `app/(admin)/operacion/_components/SheetConfirmar.tsx`, `app/(admin)/operacion/_components/BandejaSinConfirmar.tsx`
- **Commit:** `b6f959e`, `336f782`

**2. [Rule 2 - Funcionalidad crítica ausente] Un apartamento sin responsable dejaba la tanda sin salida**

- **Found during:** Task 2
- **Issue:** §10 deshabilita el botón de confirmar cuando el apartamento no tiene responsable, y ofrece `Saltar este` solo ante un fallo de la base. Combinando las dos reglas literalmente, una unidad sin responsable en la posición 3 de 15 bloquea las doce restantes sin más salida que cerrar la tanda.
- **Fix:** `Saltar este` se muestra ante un fallo **o** ante la carencia de responsable. El saltado se queda en la bandeja, que es exactamente lo que hace el `Saltar este` del contrato.
- **Commit:** `b6f959e`

### Divergencias menores, declaradas

**A. Task 2 se ejecutó y commiteó antes que Task 1.** La bandeja monta el `Sheet`, así que un commit de Task 1 con el `Sheet` sin existir no compila, y uno con el CTA sin cablear pintaría "un botón que no abre nada", que es lo que el propio `FilaAseo.tsx` de 04-09 declara que no se hace. Los dos commits están, con su verificación cada uno; solo cambió el orden.

**B. Tres archivos fuera de `files_modified`, todos aditivos.**
- `app/(admin)/_components/EstadoVacio.tsx`: prop opcional `claseIcono`. §9 pide el `Check` de la bandeja vacía en `--status-ok` y `EstadoVacio` cableaba `text-muted-foreground`. El plan manda usar `EstadoVacio` con `compacto`, y §15.1 prohíbe escribir un componente vacío paralelo. La prop pasa por `cn()`, así que el **tamaño** lo sigue fijando `compacto` y quien llama no puede pisarlo.
- `app/globals.css`: `--container-boton-confirmar` (176px) y `--container-boton-crear-aseo` (124px). §15.2 exige `min-width` en el botón en vuelo y §2 prohíbe el valor arbitrario, así que la única forma de cumplir las dos es un token. El primero se derivó de `--container-boton-activar` (168px para `Guardar y activar`, 17 caracteres) sumándole el carácter de más de `Confirmar y seguir`.
- `app/(admin)/operacion/page.tsx` sí estaba en la lista; se añade el tercer viaje al catálogo, explicado en su cabecera.

**C. La línea del aseo huérfano que deja reprogramar.** No está en el UI-SPEC. El plan 04-07 midió con dos corridas reales de `sync_feed_apply()` que reprogramar desapunta la reserva, así que el siguiente sync crea un aseo nuevo sin confirmar en la fecha del checkout original, **y ese cae en esta bandeja**. Sin decirlo en algún sitio, llega como una fila que el admin jura no haber pedido. Va como una línea de 12/400 al pie de la card, fuera del scrollport y solo cuando hay algo en la lista: `Reprogramar deja acá el aseo de la fecha original, sin confirmar. Si ya no aplica, cancélalo.`

**D. Copy nuevo, no fijado por §18.1.**
- Validación de huéspedes: `Escribe cuántos huéspedes entraron. Es un número entero, mínimo 1.`
- Título del `Alert` de fallo: `No se pudo confirmar este aseo` (el cuerpo es el de `mapDbError()`).
- Descripción del diálogo: `Solo repasos y emergencias. Los aseos normales los crea el calendario al detectar el checkout.`
- Enlace de la carencia de responsable: `Abrir la ficha de {apartamento}`.
- Vacío del combobox: `Ningún apartamento coincide.`
- Los tres cierres de tanda: con 0 confirmados **no sale toast** (abrir y cerrar sin tocar nada no es un resultado que anunciar); con todos, el `Listo: N aseos confirmados.` del contrato, con singular gramatical si N vale 1; con parte, el `Confirmaste C de N…` del contrato, que es también el que sale cuando la tanda termina con saltados.

## Deferred Issues

**`npm run lint` falla con 3 errores en `e2e/fixtures.ts`, y son preexistentes.** `react-hooks/rules-of-hooks` confunde el `use` de las fixtures de Playwright con el hook `use` de React. El archivo es de la Fase 2 (`814e0cd`, plan 02-06) y ninguno de los commits de este plan lo toca. Registrado en `deferred-items.md` con la corrección que hace falta (`eslint.config.mjs`, apagar la regla para `e2e/**`) y a quién le toca. Los seis archivos de este plan pasan `eslint` limpios, verificado individualmente.

## Verificación final

| Comando | Resultado | Baseline previa |
|---|---|---|
| `npx tsc --noEmit` | sin errores | idéntica |
| `npm run build` | pasa, `/operacion` 10.5 kB / 229 kB First Load | 7.17 kB / 125 kB (sin las tres superficies) |
| `npm run test:unit` | **29 archivos / 548 tests, verde** | 29 / 548 |
| `npm run test:integration` | **15 archivos / 138 tests, verde** | 15 / 138 |
| `npm run db:test` | `Files=7, Tests=153, Result: PASS` | idéntica |
| `npm run ci:arch` | `check-service-role: OK` | idéntica |
| `npm run lint` | 3 errores, **todos preexistentes en `e2e/fixtures.ts`** | idéntica (ver Deferred Issues) |
| `grep -rn dangerouslySetInnerHTML app/(admin)/operacion/` | sin coincidencias | — |

La verificación funcional de las tres superficies con quince aseos sembrados la cubre el e2e del plan 04-14, como el propio plan declara.

## Known Stubs

Ninguno. Las tres superficies leen datos reales de `leerOperacion()` y `listarApartamentos()`, y las dos mutaciones invocan las Server Actions de 04-08 contra RPC reales. No hay valor vacío cableado, ni lista mock, ni componente sin fuente de datos.

Lo que **no** está y no es un stub sino el reparto del plan: el bloque inferior del `aside` sigue vacío hasta que el plan 04-13 monte el panel de alertas, y el sitio de la marca de última actualización en la cabecera sigue siendo un comentario, también de 04-13. Los dos están declarados así en `page.tsx` desde el plan 04-09.

## Threat Flags

Ninguna superficie de seguridad nueva fuera del `<threat_model>` del plan. Los cuatro registros se cumplen tal como estaban escritos:

- **T-04-04** (combobox y `min` de fecha): son UX. La autorización es `exigirAdmin()` en la action y `private.is_admin()` más el filtro de `is_managed` dentro de `create_manual_cleaning`. Escrito en la cabecera de `DialogoCrearAseo.tsx`.
- **T-04-11** (código de acceso): no aparece en el `Sheet`, y la razón queda escrita en su cabecera para que nadie lo añada "por comodidad". Además no es alcanzable: la consulta que alimenta la pantalla no toca `property_secrets`, que no tiene ningún grant.
- **T-04-10** (XSS por interpolación): React escapa por defecto y el grep de `dangerouslySetInnerHTML` sobre `app/(admin)/operacion/` no devuelve nada.
- **T-04-07** (error de fecha ocupada): el texto sale ya mapeado de la action. Ni SQLSTATE ni texto crudo de Postgres.
- **T-04-SC**: cero paquetes instalados. `package.json` y `package-lock.json` intactos.

## Next Phase Readiness

- **04-11** (`MenuAseo` y los cinco diálogos): el patrón de combobox de entidad y el de diálogo con `useActionState` quedan en `DialogoCrearAseo.tsx`; `DialogoReprogramar` reutiliza tal cual el pintado inline del error de fecha, porque `reprogramarAseo` devuelve el mismo `campo: 'fecha'`. Ese plan **sí** necesita el patrón "diálogo fuera del `DropdownMenu`, controlado por el padre", que acá no aplicaba.
- **04-13** (panel de alertas): el `aside` le deja el bloque inferior con el `flex-1` que sobra. La bandeja se limita a `xl:max-h-[40%]` del carril, que es el reparto que 04-09 dejó acordado, así que las dos cards caben con quince sin confirmar y treinta alertas sin empujarse fuera de la pantalla.
- **04-14** (e2e): la verificación funcional con quince sembrados es suya. Puntos de anclaje estables: `<section aria-labelledby>` de la bandeja, el `<button>` por fila, el `aria-live` del `Sheet`, y los `role="combobox"` del diálogo. Y le toca decidir sobre el `deferred-items.md` de `eslint` en `e2e/**`, porque es quien vuelve a tocar ese directorio.
- **Fase 5** (notificaciones): la costura sigue donde estaba. `confirm_cleaning` escribe la fila en `notifications` y nadie la drena. Ningún copy de este plan dice ni sugiere lo contrario.

---
*Phase: 04-dashboard-operativo-del-admin*
*Completed: 2026-09-06*

## Self-Check: PASSED

Verificado el 2026-09-06 con el árbol en su estado final:

- Los tres componentes existen, con 178 / 437 / 355 líneas contra mínimos de 90 / 180 / 90.
- Los cuatro commits (`b6f959e`, `336f782`, `287d3b8`, `3892655`) están en el historial.
- `grep -c "aria-live" SheetConfirmar.tsx` → 2 (la región y su comentario), el `grep` de la Task 2 pasa.
- Los tres `key_links` del plan resueltos: `confirmarAseo` en `SheetConfirmar.tsx`, `crearAseoManual` en `DialogoCrearAseo.tsx`, `BandejaSinConfirmar` en `page.tsx`.
