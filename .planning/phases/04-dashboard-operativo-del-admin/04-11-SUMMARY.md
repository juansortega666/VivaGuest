---
phase: 04-dashboard-operativo-del-admin
plan: 11
subsystem: ui
tags: [react19, useActionState, useFormStatus, base-ui, dropdown-menu, alert-dialog, accesibilidad]

requires:
  - phase: 04-05
    provides: las seis RPC del admin, con private.is_admin() dentro y las precondiciones que fijan la visibilidad de cada item del menu
  - phase: 04-08
    provides: las cinco Server Actions de mutacion con firma (prev, formData) y el error de ASEO-07 anclado a campo 'fecha'
  - phase: 04-09
    provides: FilaAseo con su sexta celda ya reservada y con relative z-10, TablaDia y BloqueDia
  - phase: 04-10
    provides: SheetConfirmar (la unica superficie de confirmacion) y el patron de dialogo con useActionState de DialogoCrearAseo
  - phase: 04-07
    provides: la consecuencia medida del desanclado al reprogramar, afirmada con dos corridas reales de sync_feed_apply()
  - phase: 02
    provides: MenuApartamento y DialogoDesactivarApartamento, que fijaron el patron de dialogo fuera del DropdownMenu
provides:
  - MenuAseo, con los items condicionados por las precondiciones REALES de las RPC y no por lo que pareceria razonable
  - Los cuatro dialogos de mutacion que faltaban, con el copy literal del contrato
  - La linea de D-18 fija y visible en la pantalla, no en la documentacion
  - La superficie que apaga needs_review, cerrando la promesa escrita en la migracion 13
  - ContextoDeAcciones, el objeto unico que baja lo que el menu necesita por los tres componentes que no lo usan
affects: [04-13, 04-14]

tech-stack:
  added: []
  patterns:
    - "Dialogo montado SOLO mientras esta abierto: con 30 filas, 5 dialogos siempre montados serian 150 useActionState en reposo"
    - "Un objeto de contexto que atraviesa tres componentes que no lo usan, en vez de tres props sueltas"
    - "El pie del AlertDialog en su propio componente, porque useFormStatus lee el <form> ancestro"
    - "El <form> envuelve SOLO el pie del AlertDialog, para que el contenido conserve su gap-4 de rejilla"

key-files:
  created:
    - "app/(admin)/operacion/_components/MenuAseo.tsx"
    - "app/(admin)/operacion/_components/DialogoReasignar.tsx"
    - "app/(admin)/operacion/_components/DialogoReprogramar.tsx"
    - "app/(admin)/operacion/_components/DialogoCerrarAseo.tsx"
    - "app/(admin)/operacion/_components/DialogoCancelarAseo.tsx"
  modified:
    - "app/(admin)/operacion/_components/FilaAseo.tsx"
    - "app/(admin)/operacion/_components/TablaDia.tsx"
    - "app/(admin)/operacion/_components/BloqueDia.tsx"
    - "app/(admin)/operacion/page.tsx"
    - "app/globals.css"

key-decisions:
  - "Reasignar solo sobre Pendiente, no sobre En curso: reassign_cleaning exige started_at is null y el item sobre En curso ofreceria lo que la base rechaza"
  - "Marcar como revisado se anade al menu aunque el UI-SPEC no lo liste: la migracion 13 promete que solo el admin apaga la marca y no habia ninguna superficie que lo hiciera"
  - "Marcar como revisado va sin dialogo: apagar una marca no destruye nada y el propio sync la vuelve a encender si el hecho se repite"
  - "Solo se monta el dialogo abierto, no los cinco: 30 filas x 5 dialogos serian 150 useActionState y 150 suscripciones al router en reposo"
  - "El aria-label usa formatFechaBog y por tanto dice 'del jue, 3 de septiembre': anadir un cuarto formateador de fecha por una sola etiqueta cuesta mas de lo que arregla"
  - "En DialogoReasignar el aseador actual se preselecciona SOLO si sigue activo: preseleccionar un id que el Select no tiene deja el disparador en blanco sin decir por que"

patterns-established:
  - "Menu de fila con mutaciones: DropdownMenu + estado del padre + el dialogo abierto montado como hermano"
  - "AlertDialog con Server Action: el <form> envuelve solo el pie, y el pie es un componente aparte por useFormStatus"

requirements-completed: [ASEO-04, ASEO-06, ASEO-07, ASEO-08, ASEO-09]

duration: 42min
completed: 2026-09-06
---

# Phase 4 Plan 11: El menú de acciones por fila y los cuatro diálogos de mutación Summary

**`MenuAseo` con los ítems condicionados por las precondiciones reales de las RPC de la migración 15 —no por lo que parecería razonable—, y los cuatro diálogos que faltaban, con la línea de D-18 fija en la pantalla del que reasigna en vez de enterrada en la documentación.**

## Performance

- **Duration:** 42 min
- **Started:** 2026-09-06T13:25:00Z
- **Completed:** 2026-09-06T14:07:00Z
- **Tasks:** 3
- **Files modified:** 10 (5 creados, 5 modificados)

## Accomplishments

- **El criterio 3 del ROADMAP queda completo.** Las cinco mutaciones de aseo tienen superficie: confirmar (04-10), reasignar, reprogramar, cerrar manualmente y cancelar. El menú `⋯` de la fila es el sitio único desde donde se alcanzan las cuatro últimas.
- **La visibilidad de cada ítem coincide con lo que la base acepta**, no con lo que tendría sentido. Las cinco precondiciones de la migración 15 están transcritas en la cabecera de `MenuAseo.tsx` al lado de la condición de visibilidad que producen, para que la próxima persona que toque un `if` vea contra qué se está sincronizando.
- **La línea de D-18 está en la pantalla.** `Cambia quién hace este aseo. No cambia el responsable ni el suplente del apartamento.` sale fija bajo el título, en 12/400, siempre, sin tooltip y sin "solo la primera vez". Es la confusión más fácil de cometer de la fase y su contraparte en la base —que `reassign_cleaning` no menciona `responsable_id` ni `suplente_id`— ya está vigilada por pgTAP y por el señuelo del plan 04-07.
- **La marca de revisión tiene por fin quien la apague.** La migración 13, línea 106, prometía que `needs_review` es pegajoso y que "solo el admin lo apaga, en la Fase 4". El UI-SPEC pintaba la señal `Flag` de §5.2 y no listaba ninguna acción. `Marcar como revisado` es la superficie de `clear_review_flag`, y va sin diálogo.
- **El error de ASEO-07 sale inline al reprogramar**, bajo el campo de fecha, con `aria-describedby` y `aria-invalid`, reutilizando tal cual el `campo: 'fecha'` que la action ya devolvía. Ni `23505` ni texto crudo de Postgres en ninguna ruta.
- **`Confirmar` desde el menú no abre un segundo formulario.** Monta el `SheetConfirmar` de 04-10 con una tanda de uno (`1 de 1`, primario `Confirmar y cerrar`). Un segundo formulario con los mismos dos campos sería el sitio donde las dos validaciones se desincronizan.
- **La fila inerte sigue sin menú.** `MenuAseo` no se renderiza en absoluto sobre `gestión externa`: ni deshabilitado ni atenuado. La celda sigue existiendo con su ancho, como la dejó 04-09.
- **Ningún copy nuevo dice ni sugiere que se le avisó al aseador.** Los tres textos nuevos de pantalla son `Elige a quién le pasa este aseo.`, `Hoy está para el {fecha}.` y `Elige un aseador`. Los mensajes de éxito los compone la action de 04-08 y el test que los recorre buscando `notific|avis|le lleg|push|se le mand` sigue verde.
- **Ninguna baseline bajó.** Ver la tabla de verificación.

## Task Commits

1. **Task 2: `DialogoReasignar` y `DialogoReprogramar`** — `5878104` (feat)
2. **Task 3: `DialogoCerrarAseo` y `DialogoCancelarAseo`** — `b1545a4` (feat)
3. **Task 1: `MenuAseo` y su cableado en `FilaAseo`** — `cfef138` (feat)

## Files Created/Modified

- `app/(admin)/operacion/_components/MenuAseo.tsx` (**creado**, 308 líneas; mínimo del plan: 90)
- `app/(admin)/operacion/_components/DialogoReasignar.tsx` (**creado**, 276 líneas)
- `app/(admin)/operacion/_components/DialogoReprogramar.tsx` (**creado**, 218 líneas)
- `app/(admin)/operacion/_components/DialogoCerrarAseo.tsx` (**creado**, 163 líneas)
- `app/(admin)/operacion/_components/DialogoCancelarAseo.tsx` (**creado**, 181 líneas)
- `app/(admin)/operacion/_components/FilaAseo.tsx` (**modificado**) — la sexta celda monta `MenuAseo` en la variante gestionada; la cabecera deja de decir que el menú "llega en el plan 04-11".
- `app/(admin)/operacion/_components/TablaDia.tsx` (**modificado**) — pasa `acciones` a cada `FilaAseo`.
- `app/(admin)/operacion/_components/BloqueDia.tsx` (**modificado**) — pasa `acciones` a `TablaDia`.
- `app/(admin)/operacion/page.tsx` (**modificado**) — compone `ContextoDeAcciones` con datos que ya estaban leídos.
- `app/globals.css` (**modificado**) — cuatro tokens `--container-boton-*`.

## Decisions Made

1. **`Reasignar` solo sobre `Pendiente`, no sobre `En curso`.** Desviación declarada del UI-SPEC §7.3, detallada abajo.

2. **`Marcar como revisado` se añade al menú aunque §7.3 no lo liste.** Desviación declarada, detallada abajo.

3. **`Marcar como revisado` va sin diálogo de confirmación.** Apagar una marca de revisión no destruye nada y es reversible por el propio motor: si el hecho que la encendió vuelve a ocurrir, `sync_feed_apply()` la vuelve a encender. Un `AlertDialog` acá sería fricción sin nada que proteger. Se invoca la action directo con un `FormData` construido a mano, igual que `MenuApartamento` invoca `activarApartamento`.

4. **Se monta SOLO el diálogo abierto, no los cinco.** Con treinta filas en pantalla, cinco diálogos montados en cada una serían 150 `useActionState` y 150 suscripciones al router en reposo. Y un diálogo que solo existe mientras está abierto no puede arrastrar el estado del intento anterior. Los cinco siguen siendo hermanos del `DropdownMenu` y nunca hijos, que es lo que el patrón de `MenuApartamento.tsx` exige y por la razón que exige: el menú se cierra al pulsar el ítem y desmonta su árbol.

5. **`Cerrar manualmente` y `Cancelar aseo` derivan de la misma constante** (`tieneTrabajoVivo`), porque comparten precondición en la base: `state in ('pendiente','en_curso')`. Dos `if` copiados es exactamente como una de las dos se queda atrás en silencio.

6. **En `DialogoReasignar`, el aseador actual se preselecciona solo si sigue activo.** Si lo desactivaron después de asignarle el aseo, la fila sigue mostrando su nombre en `A CARGO` pero no está en la lista del `Select`, y preseleccionar un id que el `Select` no tiene dejaría el disparador en blanco sin decir por qué. Se arranca sin selección y con el placeholder a la vista, que además es el caso donde reasignar hace más falta.

7. **El `min-width` del primario en vuelo se dimensiona sobre el estado más ancho, que no siempre es el mismo.** `Reasignar` y `Reprogramar` ensanchan **en vuelo** (el gerundio es más largo que el label); `Cerrar aseo` y `Cancelar aseo` ensanchan **en reposo** (llevan icono y su gerundio es más corto). Los cuatro tokens están derivados de `--container-boton-guardar` a ~8.7px por carácter, con la cuenta escrita en `globals.css`.

8. **`DialogoReprogramar` no lleva copy sobre el aseo huérfano**, y esa ausencia es la decisión. El plan lo pedía así y hay dos razones que se sostienen: el aseo que aparece es autoexplicativo **donde aparece** —la bandeja `Sin confirmar` lleva su propia línea permanente sobre él desde 04-10—, y una advertencia sobre el comportamiento interno del motor, en un diálogo de un solo campo, es ruido justo donde el admin está tomando una decisión de calendario. Lo que sí quedó escrito es un bloque de cabecera en el archivo con la medición del plan 04-07 y con **la señal de alarma que hay que buscar en producción**: si el aseo reprogramado apareciera cancelado con `cancel_reason = 'reserva_movida'` minutos después, la RPC dejó de desanclar.

## Deviations from Plan

### Las dos desviaciones del UI-SPEC §7.3, declaradas por el propio plan

Están escritas también en la cabecera de `MenuAseo.tsx`, para que el auditor no las reporte como hallazgo nuevo.

**1. `Reasignar` se restringe a `Pendiente`; §7.3 lo muestra también sobre `En curso`.**
`reassign_cleaning` exige `started_at is null` (decisión del líder sobre el supuesto A2 del research). La condición real es "no hay trabajo hecho todavía": un aseo que ya empezó no se reasigna, y reasignarlo dejaría el `started_at` de una persona sobre el nombre de otra. Para eso está `close_cleaning`, o el `No puedo` del aseador de la Fase 6, que sí limpia `started_at`. Mostrar el ítem sobre `En curso` sería ofrecer una acción que la base rechaza.

**2. Se añade `Marcar como revisado`, que §7.3 no lista.**
La migración 13, línea 106, promete literalmente que `needs_review` es pegajoso y que "solo el admin lo apaga, en la Fase 4", y el UI-SPEC ya renderiza la señal `Flag` de §5.2 sin ninguna acción que la apague. Es la superficie de `clear_review_flag`, cuya Server Action existe desde 04-08 y estaba sin consumidor.

### Divergencias menores, declaradas

**A. El orden de ejecución fue Task 2 → Task 3 → Task 1.** `MenuAseo` importa los cuatro diálogos, así que un commit de Task 1 con los diálogos sin existir no compila. Es el mismo caso que 04-10 documentó con el `Sheet` y su bandeja. Los tres commits están, cada uno con su verificación; solo cambió el orden.

**B. Cinco archivos fuera de `files_modified`, todos aditivos.**

- `TablaDia.tsx`, `BloqueDia.tsx` y `page.tsx`: `MenuAseo` necesita tres datos que la fila no trae —los aseadores activos para el `Select` de reasignar, el responsable fijo del apartamento para el `SheetConfirmar`, y el día de negocio del servidor para el `min` del campo de fecha— y la cadena de renderizado es `page.tsx → BloqueDia → TablaDia → FilaAseo → MenuAseo`. Bajan como **un objeto**, `ContextoDeAcciones`, y no como tres props sueltas, para que añadir un cuarto dato mañana no vuelva a tocar los tres componentes intermedios. **No hay ningún viaje nuevo a la base**: `aseadores` ya alimentaba los chips de carga, `responsables` ya alimentaba la bandeja y `hoy` es el día que la propia consulta usó para su ventana. Se descartó un contexto de React porque habría añadido un proveedor y una capa de indirección para tres valores que ya estaban al alcance en el mismo `page.tsx`.
- `app/globals.css`: cuatro tokens `--container-boton-*`. §15.2 exige `min-width` en el botón en vuelo y §2 prohíbe el valor arbitrario; la única forma de cumplir las dos es un token, y son cuatro porque los labels miden distinto. Mismo criterio y mismo sitio que los dos que añadió 04-10.

**C. El `aria-label` del disparador dice `del jue, 3 de septiembre`.** El ejemplo de §7.3 es `Acciones del aseo de Bogotá 3 del 3 de septiembre`, sin día de la semana. `formatFechaBog()` —el formateador de fecha larga de la fase— emite `jue, 3 de septiembre`, y el único otro que existe, `formatFechaCortaBog()`, emite `3 sep`. Se usó el primero: añadir un cuarto formateador de fecha al repo por una sola etiqueta accesible cuesta más de lo que arregla, y el día de la semana no estorba a la función de la etiqueta, que es distinguir treinta botones entre sí.

**D. Copy nuevo, no fijado por §18.1.** Tres cadenas, todas de campo:
- Validación de cliente del `Select` de reasignar: `Elige a quién le pasa este aseo.`
- Descripción del diálogo de reprogramar, que es donde §12.2 pide "la fecha actual en 14/400": `Hoy está para el {fecha}.`
- Placeholder del `Select` de aseadores: `Elige un aseador`, calcado del `Elige un apartamento` de `DialogoCrearAseo`.

### Auto-fixed Issues

Ninguno. No aparecieron bugs, funcionalidad crítica ausente ni bloqueos durante la ejecución de los tres tasks.

## Deferred Issues

**`npm run lint` sigue con 3 errores en `e2e/fixtures.ts`, y son preexistentes.** `react-hooks/rules-of-hooks` confunde el `use` de las fixtures de Playwright con el hook `use` de React. Origen: commit `814e0cd`, Fase 2, plan 02-06. Ya está en `deferred-items.md` con su corrección y con a quién le toca (04-14). Ninguno de los tres commits de este plan toca `e2e/`. Los diez archivos de este plan pasan `eslint` limpios, verificado individualmente.

**`ci/README.md` sigue untracked.** Preexistente y declarado fuera de alcance por el orquestador. No se tocó.

## Verificación final

| Comando | Resultado | Baseline previa |
|---|---|---|
| `npx tsc --noEmit` | sin errores | idéntica |
| `npm run build` | pasa, `/operacion` 13.8 kB / 241 kB First Load | 10.5 kB / 229 kB (sin el menú ni los cuatro diálogos) |
| `npm run test:unit` | **29 archivos / 548 tests, verde** | 29 / 548 |
| `npm run test:integration` | **15 archivos / 138 tests, verde** | 15 / 138 |
| `npm run db:test` | `Files=7, Tests=153, Result: PASS` | idéntica |
| `npm run ci:arch` | `check-service-role: OK` | idéntica |
| `npm run lint` | 3 errores, **todos preexistentes en `e2e/fixtures.ts`** | idéntica |
| `eslint` sobre los 10 archivos del plan | limpio | — |
| `grep "No cambia el responsable ni el suplente del apartamento" DialogoReasignar.tsx` | **coincide** (verify literal del plan) | — |
| `grep -rn dangerouslySetInnerHTML app/(admin)/operacion/` | sin coincidencias | — |

La verificación funcional de las cinco mutaciones desde la pantalla la cubre el e2e del plan 04-14, como el propio plan declara.

## Known Stubs

Ninguno. Los cinco componentes nuevos invocan Server Actions reales de 04-08 contra las RPC reales de 04-05. No hay lista mock, ni valor vacío cableado, ni componente sin fuente de datos.

Lo que **no** está y no es un stub sino el reparto de la fase: el bloque inferior del `aside` sigue esperando al panel de alertas de 04-13, y el sitio de la marca de última actualización en la cabecera sigue siendo un comentario, también de 04-13. Los dos están declarados así en `page.tsx` desde 04-09.

## Threat Flags

Ninguna superficie de seguridad nueva fuera del `<threat_model>` del plan. Los seis registros se cumplen tal como estaban escritos:

- **T-04-01** (`Select` de aseadores): que liste solo activos es UX. La garantía es `private.is_admin()` más la validación de `role='aseador' and is_active` dentro de `reassign_cleaning`, que levanta `P0001 aseador_invalido`. Escrito en la cabecera de `DialogoReasignar.tsx`, con la nota de que la FK sola no lo impide porque apunta a `profiles`, donde también viven los admins.
- **T-04-03** (`close_cleaning` es el bypass de `finish_cleaning`): el cuerpo del diálogo declara literalmente que queda sin checklist y sin fotos, y la segunda frase acota el uso legítimo. Escrito en la cabecera de `DialogoCerrarAseo.tsx`.
- **T-04-12** (motivo de cancelación): no hay campo de motivo escrito, así que no existe ninguna ruta por la que texto libre del admin llegue a `cancel_reason` y de ahí al `payload` de una notificación. La razón —regla de la migración 13, líneas 119-133— está escrita en la cabecera de `DialogoCancelarAseo.tsx`, junto con las dos alternativas malas que un `textarea` obligaría a elegir.
- **T-04-17** (visibilidad de ítems): `accept`, y queda escrito con las mismas palabras que la Fase 2 en la cabecera de `MenuAseo.tsx`. Ocultar un ítem no autoriza; cada RPC verifica el rol por dentro y cada action arranca por `exigirAdmin()`.
- **T-04-10** (XSS por interpolación de nombres): React escapa por defecto y el grep de `dangerouslySetInnerHTML` sobre `app/(admin)/operacion/` no devuelve nada.
- **T-04-SC**: cero paquetes instalados. `package.json` y `package-lock.json` intactos.

## Next Phase Readiness

- **04-13** (panel de alertas y marca de actualización): el patrón de "acción de fila que invoca una action sin diálogo" queda en `marcarRevisado()` de `MenuAseo.tsx`; el panel lo va a necesitar para `Marcar como atendida`, que además es el único caso optimista de la fase (§15.2). El `aside` le sigue dejando el bloque inferior con el `flex-1` que sobra.
- **04-14** (e2e): la verificación funcional de las cinco mutaciones es suya. Puntos de anclaje estables: el `aria-label` único por fila (`Acciones del aseo de {apartamento} del {fecha}`), los siete labels de ítem del menú, los títulos de los cuatro diálogos, y el botón `Volver` como descarte en los cuatro. Y le sigue tocando el `deferred-items.md` de `eslint` en `e2e/**`.
- **Fase 5** (notificaciones): la costura sigue donde estaba. Las RPC escriben en `notifications` y nadie la drena. Ningún copy de este plan dice ni sugiere lo contrario.
- **Fase 6** (PWA del aseador): el `No puedo` del aseador es lo que va a limpiar `started_at` y devolver un aseo `en_curso` a reasignable. Hasta entonces, el camino para un aseo empezado que hay que reasignar es cerrarlo manualmente y crear uno nuevo, y está dicho en la cabecera de `MenuAseo.tsx`.

---
*Phase: 04-dashboard-operativo-del-admin*
*Completed: 2026-09-06*

## Self-Check: PASSED

Los cinco archivos creados existen en disco y los tres commits de tarea existen en el historial.
