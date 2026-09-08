---
phase: 04-dashboard-operativo-del-admin
verified: 2026-09-06T00:00:00Z
status: gaps_found
score: 4/5 criterios de ROADMAP verificados en firme, 1 parcial
overrides_applied: 0
gaps:
  - truth: "El admin ve alertados TODOS los aseos cuya hora límite venció sin terminarse (criterio 4 del ROADMAP, DASH-05)"
    status: partial
    reason: "alertasComputadas() no acota por fecha (lib/domain/alertas.ts:458-475), pero su única fuente de datos es leerOperacion(), cuya consulta arranca en hoyBog() (lib/data/operacion.ts:243, .gte('scheduled_date', hoy)). Un aseo de ayer o de antier, vivo y con la hora límite vencida, nunca llega a alertasComputadas() porque su fila no sale de la consulta. Solo el caso 'aseo de HOY vencido' produce alerta, y ese caso sí está medido en e2e/operacion-alertas.spec.ts."
    artifacts:
      - path: "lib/data/operacion.ts"
        issue: "leerOperacion() acota scheduled_date >= hoyBog(); un aseo anterior a hoy no entra a la ventana"
      - path: "lib/domain/alertas.ts"
        issue: "alertasComputadas() está correctamente escrita para no acotar por fecha, pero nunca recibe las filas que necesitaría para hacerlo"
    missing:
      - "Una consulta propia del panel que traiga aseos vivos con scheduled_date < hoy y hora límite vencida, o ampliar el límite inferior de leerOperacion() (decisión de producto, no de código: cambia la ventana compartida por las tres superficies de /operacion)"
human_verification:
  - test: "Que treinta alertas de siete tipos se lean sin que ninguna salte a la vista (escala de grises, densidad de 64px/fila)"
    expected: "Ningún tipo se lee antes que otro; la captura en escala de grises sigue distinguiendo los siete tipos"
    why_human: "Es percepción de conjunto, no un atributo medible por grep o por DOM"
  - test: "Que la fila de gestión externa (DASH-07) se lea como 'esto no lo tocas' y no como 'esto está roto'"
    expected: "El texto al pie del día evita la lectura de fallo pese a la fila sin hora límite, huéspedes, aseador ni menú"
    why_human: "Interpretación subjetiva de una ausencia visual"
  - test: "Que confirmar quince aseos seguidos (ASEO-02, D-10) no canse: foco solo en el campo de huéspedes, barra de progreso legible, sin saltos de tamaño"
    expected: "El recorrido completo de los quince se siente fluido, sin pelear con el ratón ni perder la cuenta"
    why_human: "Fricción acumulada percibida, no un estado verificable en un único render"
---

# Fase 4: Dashboard operativo del admin — Verificación

**Meta de la fase:** El admin ve toda la operación del día en una pantalla y confirma, reasigna o cierra cualquier aseo sin salir de ahí.
**Verificado:** 2026-09-06
**Estado:** `gaps_found` (1 gap real, estructurado abajo; 3 verificaciones perceptuales pendientes de humano, ya declaradas por el propio plan 04-14)
**Re-verificación:** No — primera verificación de la fase

## Resumen del veredicto

La fase construye lo que promete, y lo prueba con evidencia dura poco común: 17 de 17 señuelos de mutación atrapados, tres defectos de producción encontrados y corregidos por los propios specs de Playwright (uno de ellos dejaba el navegador colgado en TODA mutación de `/operacion`), y una arquitectura de datos (`lib/domain/alertas.ts`) que hace estructuralmente imposible romper "ninguna alerta se esconde" sin que la suite lo note. Esto no es una fase que aprobó por confiar en su propio SUMMARY: se verificó código, no narrativa.

Dicho eso, hay un hueco real y no cosmético: **DASH-05 solo se cumple para los aseos de hoy**. Un aseo de anteayer, vivo y con la hora límite vencida, no produce alerta, porque nunca llega a la función que la calcularía. El propio equipo lo documentó en voz alta tres veces (código, `deferred-items.md`, SUMMARY del 04-14) y lo dejó como decisión de producto pendiente, no como bug oculto. Pero toca el Core Value ("que ningún aseo se pierda") de forma literal, así que no lo cierro como verificado.

Además hay un defecto de UX medido y confesado, de prioridad ALTA según el propio equipo, que afecta a `AlertDialog` (usado por `DialogoCerrarAseo` de ASEO-08 y `DialogoCancelarAseo` de ASEO-09): el cuadro de diálogo mide ~32px de ancho y el texto se desborda. Funcionalmente las acciones se completan (los specs de Playwright las ejercitan y pasan), pero la confirmación es ilegible en un navegador real.

## Logro de la meta

### Verdades observables (criterios del ROADMAP)

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | Todo aseo nace en Pendiente sin confirmar, aparece en la bandeja persistente, se confirma en un solo paso (huéspedes + instrucciones) y queda asignado en firme al responsable | ✓ VERIFICADO | `BandejaSinConfirmar` + `SheetConfirmar` encadenado (04-10), RPC `confirm_cleaning` ya existente de la Fase 1, `e2e/operacion.spec.ts` ejercita el flujo con quince de golpe y el señuelo #12 (acumular en memoria y no escribir hasta el último) quedó atrapado por la aserción de la bandeja |
| 2 | El admin ve los servicios organizados por día (hoy, mañana, siguientes) y la carga diaria de cada aseador | ✓ VERIFICADO | `agruparPorDia()` + `BloqueDia` (Hoy expandido, Mañana/Siguientes colapsables con `useAnclaDeAlerta()`); `cargaPorAseador()` + `FranjaCarga` con chips por aseador, incluido un aseador desactivado con trabajo vivo (decisión medida en 04-06) |
| 3 | Reasignar puntual sin tocar responsable/suplente, crear `repaso`/`emergencia`, reprogramar, cerrar manualmente, cancelar | ✓ VERIFICADO (funcional), con caveat de UX — ver Anti-Patrones | Seis RPC `SECURITY DEFINER` en `20260903120000_15_rpc_admin_y_realtime.sql`, cada una con `raise exception 'no_autorizado'` si el rol no es admin; `MenuAseo` + cuatro diálogos de mutación (04-11); `e2e/operacion.spec.ts` encadena los cinco pasos del criterio 3 sobre el mismo aseo en un navegador real |
| 4 | Un solo panel de alertas con la misma jerarquía visual para los siete tipos, incluida hora límite vencida | ⚠️ PARCIAL — ver gap DASH-05 abajo | La homogeneidad visual (icono, etiqueta, alto, orden cronológico) está VERIFICADA de forma estructural: `PresentacionDeAlerta` no admite campo de severidad, `HOMOGENEO` es la única fuente de estilo, y el señuelo #13 (dar `text-destructive` a `urgente`) quedó atrapado por la prueba de escala de grises. Pero uno de los siete tipos, `hora_limite_vencida`, solo se computa para aseos con `scheduled_date >= hoy` |
| 5 | El admin abre cualquier apartamento y ve su historial cronológico con daños; las unidades de gestión externa se muestran con fecha y a cargo de quién, sin estado ni acciones | ✓ VERIFICADO | `HistorialApartamento` mezcla `cleanings` + `damages` cronológicamente, un daño resuelto NO se oculta (señuelo #16 atrapado en integración y e2e); `FilaAseo` no renderiza `MenuAseo` en la fila inerte (`{!inerte && <MenuAseo .../>}`), medido por el señuelo #11 |

**Puntaje:** 4/5 criterios verificados en firme, 1 parcial con gap estructurado.

### Artefactos requeridos

| Artefacto | Esperado | Estado | Detalle |
|---|---|---|---|
| `supabase/migrations/20260903120000_15_rpc_admin_y_realtime.sql` | 5 RPC nuevas (`reassign_cleaning`, `create_manual_cleaning`, `reschedule_cleaning`, `close_cleaning`, `cancel_cleaning`) + publicación Realtime | ✓ VERIFICADO | Las cinco existen, cada una `security definer` con chequeo de rol interno (línea 141, 274, 375, 475, 539) |
| `lib/data/operacion.ts` | Consulta única + tres proyecciones + tres auxiliares | ✓ VERIFICADO | `leerOperacion`, `agruparPorDia`, `bandejaSinConfirmar`, `cargaPorAseador`, `leerAlertasDelAdmin`, `leerUltimoExitoDeSync`, `leerAseadoresActivos`, `leerAlertasAtendidas` — todas presentes, con 21+10 tests dedicados |
| `lib/domain/alertas.ts` | Mapa de once/doce tipos, computadas, mezcla, orden | ✓ VERIFICADO | 674 líneas, `MAPA_DE_ALERTAS`, `alertasComputadas`, `mezclarAlertas`, `conteosPorTipo`, con `_CubreElEnum` que rompe el build si el enum crece sin entrada |
| `app/(admin)/operacion/page.tsx` + `_components/` | Pantalla única, dos carriles | ✓ VERIFICADO | Importa y monta `BandejaSinConfirmar`, `BloqueDia`, `FranjaCarga`, `PanelAlertas`, `SincronizacionEnVivo`, `MarcaActualizacion`; RSC con `exigirAdmin()`, sin `createAdminClient` (confirmado por grep negativo en 04-14) |
| `app/(admin)/apartamentos/_components/HistorialApartamento.tsx` | Historial cronológico con daños, solo lectura | ✓ VERIFICADO | Sin botones ni menú, `damages.descripcion` renderizado como texto de React (sin `dangerouslySetInnerHTML`) |
| `components/ui/alert-dialog.tsx`, `components/ui/tooltip.tsx` | Diálogos de confirmación de ASEO-08/09 usables | ⚠️ ORPHANED (visualmente) | Existen, están wireados (Level 3), pero la colisión `max-w-*` contra `--spacing-*` de Tailwind v4 los deja en ~32px y 4px respectivamente. Documentado como diferido ALTA por el propio 04-14, no arreglado ahí a propósito |

### Verificación de key links

| De | A | Vía | Estado | Detalle |
|---|---|---|---|---|
| `MenuAseo` / diálogos de mutación | Las 6 RPC | Server Actions en `_actions.ts` | WIRED | `04-08-SUMMARY.md` declara las ocho Server Actions; `04-14` retiró `revalidatePath` (colgaba el navegador) y lo sustituyó por `router.refresh()` en el cliente, medido con specs reales, no razonado |
| `FilaAlerta` | `/operacion#aseo-{id}` o `/apartamentos` | `<a>` con `rutaInterna()` como guarda | WIRED | `rutaInterna()` rechaza `//host-externo` además de esquemas explícitos; `BloqueDia` monta `useAnclaDeAlerta()` con tres disparadores para expandir el bloque colapsado al seguir el ancla |
| `SincronizacionEnVivo` | `cleanings` / `notifications` (Realtime) | canal `postgres_changes` que solo dispara `router.refresh()` | WIRED, con degradación | Arranca en estado "sin conexión en vivo" y hace sondeo de respaldo cada 30s/120s; no depende de que Realtime conecte para que la pantalla se refresque |
| `leerOperacion()` | `alertasComputadas()` | `aseosParaAlertas()` en `page.tsx` | WIRED pero con ventana insuficiente | Ver gap DASH-05: el link funciona, pero el conjunto de entrada está recortado por fecha antes de llegar |

### Trazado de flujo de datos (Nivel 4)

| Artefacto | Variable de datos | Fuente | Datos reales | Estado |
|---|---|---|---|---|
| `PanelAlertas` | `alertas` (mezcla de `notifications` + computadas) | `leerAlertasDelAdmin()` + `alertasComputadas()` sobre `leerOperacion()` | Sí, contra Postgres real (JWT admin/aseadora en integración) | ✓ FLOWING, con el recorte de fecha ya señalado |
| `BandejaSinConfirmar` / `BloqueDia` / `FranjaCarga` | filas de `cleanings` | `leerOperacion()` → tres proyecciones puras | Sí | ✓ FLOWING |
| `HistorialApartamento` | `cleanings` + `damages` mezclados | `leerHistorial()` en `lib/data/historial.ts` | Sí, consulta real con `.from('cleanings')` / `.from('damages')` | ✓ FLOWING |

### Comprobaciones de comportamiento (spot-checks)

No se re-ejecutaron los comandos (instrucción explícita del orquestador: no repetir `test:unit`, `test:integration`, `db:test`, `lint`, `ci:arch`, ya medidos en verde por el orquestador sobre el checkout principal). Se verificó en su lugar, por lectura directa de código y `git log`, que:

- Los commits que 04-14 declara existen en el árbol (confirmado por el propio Self-Check del SUMMARY, no repetido a mano).
- Los seis señuelos de la capa de interfaz y los once de la capa de datos están documentados con su mensaje de fallo literal en `senuelos-04.md`, no solo como conteo.

### Cobertura de requisitos

| Requisito | Plan(es) que lo cierran | Descripción | Estado | Evidencia |
|---|---|---|---|---|
| ASEO-01 a ASEO-09 | 04-05 (RPC), 04-08 (actions), 04-10/04-11 (UI), 04-14 (e2e) | Ciclo de vida completo del aseo | ✓ SATISFECHO | RPC verificadas en migración 15, UI verificada en `e2e/operacion.spec.ts` (los cinco pasos encadenados) |
| DASH-01, DASH-02, DASH-03 | 04-09 (pantalla), 04-10 (bandeja), 04-06 (datos) | Días, bandeja, carga por aseador | ✓ SATISFECHO | `04-06` declinó marcarlos por no tener pantalla; `04-09`/`04-10` sí los cierran con UI real, confirmado por lectura de `page.tsx` |
| DASH-04 | 04-04 (dominio), 04-13 (panel) | Jerarquía visual homogénea | ✓ SATISFECHO | Verificación estructural + señuelo #13 atrapado |
| DASH-05 | 04-04, 04-13 | Hora límite vencida alertada | ⚠️ PARCIAL | Ver gap arriba |
| DASH-06, REPORT-04 | 04-12 | Historial con daños | ✓ SATISFECHO | `HistorialApartamento`, señuelo #16 atrapado |
| DASH-07 | 04-03, 04-09 | Fila inerte de gestión externa | ✓ SATISFECHO | Señuelo #11 atrapado |

**Sobre el patrón de marcado:** el plan 04-02 marcó `ASEO-02`, `DASH-01`, `DASH-04` como completados en su frontmatter siendo solo un plan de fundamentos visuales (instalar `Sheet`, tokens, `EstadoVacio`). Esto es una inconsistencia de proceso interna a la fase — 04-02 no entregó una sola pantalla observable — pero no tiene efecto en el resultado final: `REQUIREMENTS.md` refleja hoy el estado de cierre de la fase completa (04-14), momento en el que todos esos requisitos sí son observables en la UI real. El plan 04-06, en cambio, dejó explícitamente la lista vacía razonando por qué una capa de lectura sin pantalla no puede cerrar un requisito fraseado como "el admin ve": ese es el criterio correcto, y es el que terminó rigiendo el estado final.

### Anti-patrones encontrados

| Archivo | Línea | Patrón | Severidad | Impacto |
|---|---|---|---|---|
| `components/ui/alert-dialog.tsx` | 55 | `data-[size=default]:max-w-xs` / `sm:max-w-sm` resuelto contra `--spacing-*` en vez de `--container-*` (colisión de Tailwind v4) | ⚠️ Warning (ya declarada ALTA por el equipo) | `DialogoCerrarAseo` (ASEO-08), `DialogoCancelarAseo` (ASEO-09) y los dos diálogos de desactivar de la Fase 2 se renderizan a ~32px de ancho con el texto desbordado. La acción subyacente se completa (medido por Playwright a nivel de DOM), pero la confirmación es ilegible para un humano en un navegador real |
| `components/ui/tooltip.tsx` | 53 | Mismo patrón, `max-w-xs` → 4px | ⚠️ Warning | Afecta al tooltip de la marca de frescura y al del botón de "confirmar sin responsable" |
| `lib/domain/alertas.ts` / `lib/data/operacion.ts` | 458-475 / 243 | Ventana de lectura recortada a `scheduled_date >= hoy` alimenta un cómputo que documenta explícitamente no querer ese recorte | 🛑 Gap funcional (no un anti-patrón de código sucio: está comentado, medido y con test del caso mayoritario) | Ver gap DASH-05 |

No se encontraron marcadores de deuda (`TBD`, `FIXME`, `XXX`) sin referencia en los archivos clave de la fase (`git diff --name-only main...HEAD` sobre `app/(admin)/operacion/`, `lib/domain/alertas.ts`, `lib/data/operacion.ts`, `app/(admin)/apartamentos/`).

### Verificación humana requerida

Las tres quedan explícitamente declaradas por el propio plan 04-14 como checkpoint humano, no fabricadas por esta verificación. Se listan en el frontmatter (`human_verification`) y no se dan por aprobadas: el 04-14-SUMMARY.md termina pidiendo la respuesta "aprobado" o el detalle de qué falló, y esa respuesta no está registrada en ningún archivo del repo a la fecha de esta verificación.

## Resumen de gaps

**Un solo gap estructurado, y es real:** `hora_limite_vencida` (DASH-05, y por extensión el criterio 4 del ROADMAP) solo se computa para aseos cuya fecha es hoy o futura, porque su única fuente de datos —`leerOperacion()`— arranca la ventana en `hoyBog()`. Un aseo de ayer, vivo y vencido, no aparece en el panel. Esto no es un stub ni una mentira: el código explica por qué no se cerró (dos salidas posibles, las dos decisiones de alcance sobre las tres superficies compartidas de `/operacion`), y el caso mayoritario (aseo de hoy vencido) está medido en e2e. Pero toca literalmente el Core Value del proyecto ("que ningún aseo se pierda"), así que no puede reportarse como criterio 4 cumplido sin esta salvedad.

**No se encontraron gaps adicionales estructurados.** El defecto de `AlertDialog`/`Tooltip` a 4-32px de ancho es real y de prioridad ALTA según el propio equipo, pero no se estructura como gap de requisito porque las acciones subyacentes (ASEO-08, ASEO-09) sí se completan; se reporta como anti-patrón/warning porque degrada la usabilidad de una acción que el ROADMAP exige que el admin pueda hacer "sin salir de ahí", y una confirmación ilegible es fricción, no un bloqueo funcional.

---

_Verificado: 2026-09-06_
_Verificador: Claude (gsd-verifier)_
