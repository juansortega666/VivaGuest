---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 07
current_phase_name: financiero
status: planning
stopped_at: Completado 07-04-PLAN.md (migracion 23)
last_updated: "2026-09-13T19:01:36.040Z"
last_activity: 2026-09-13
last_activity_desc: "Wave 0 ejecutada: el contrato de la fase existe como aserciones ROJAS antes del schema"
progress:
  total_phases: 9
  completed_phases: 5
  total_plans: 89
  completed_plans: 77
  percent: 56
---

# Project State

## Project Reference

Ver: .planning/PROJECT.md (actualizado 2026-08-31)

**Core value:** Que ningún aseo se pierda: todo checkout detectado en calendario termina en un aseo confirmado, asignado y ejecutado con evidencia, sin coordinación manual por WhatsApp.
**Current focus:** Fase 5, notificaciones push e instalacion de la PWA. `discuss-phase 5` cerrado el 2026-09-10 con `05-CONTEXT.md`; siguiente paso `ui-phase 5`. Pendiente aparte y sin bloquear: el visto bueno humano sobre las tres verificaciones perceptuales del plan 04-14.

## Current Position

Phase: 07 (financiero) — EN EJECUCION
Plan: 4 of 14. Wave 0 cerrada (07-01, 07-02, 07-03) y Wave 1 cerrada (07-04)
Status: `07-04` ejecutado (migracion 23: calendario de cierre, `dia_bog`, `periodo_de_cierre`,
`foto_vencida` y las tres tablas del snapshot). Siguiente: Wave 2 con `07-05` (migracion 24,
cerrar la fuga de la tarifa al huesped por las dos vias)
Last activity: 2026-09-13 - 07-04 ejecutado: el schema financiero existe y 14 aserciones pasaron de rojo a verde

**La suite esta ROJA a proposito y lo va a estar durante ocho waves.** Es el diseño
de `07-VALIDATION.md`: los tests se escriben antes del codigo que los satisface.
El estado medido, wave a wave:

| Capa | Al cerrar la Wave 0 | Al cerrar la Wave 1 (07-04) |
|---|---|---|
| pgTAP | 275 verdes + **47 rojas de 52** en `11_financiero.test.sql` | 275 verdes + **33 rojas de 52**. 14 nuevas verdes, cero regresiones |
| Unitarios | 1006 verdes + **83 rojos** en tres archivos de `lib/domain/` | sin cambio: 1006 verdes + 3 archivos rojos |
| Integracion | **186 verdes** (169 + 17 del sembrador nuevo) + 1 archivo rojo | sin cambio: 186 verdes + 1 archivo rojo |
| E2E | 112 pasando y 1 saltado + **22 specs rojos** en dos archivos nuevos | no re-corrido: 07-04 no toca interfaz |

Lo que `07-04` cerro, bloque por bloque (el detalle esta en `07-04-SUMMARY.md`):
**B (calendario del cierre) 6/6** y **J (el recibo dura cinco anos) 3/3**, mas las
dos aserciones de `dia_bog` del bloque C y la del tipo `bigint` del bloque E. Las
aserciones 47 y 51 (borrar un aseo y un gasto NO falla) siguen verdes, y ahora por
**ausencia de cascada** y no por ausencia de tablas, que era el riesgo que 07-01
habia senalado. **Ojo:** las aserciones 11 y 34 estan verdes **por vacuidad** (las
tablas existen y estan vacias); solo miden algo cuando 07-07 escriba lineas.

Cada plan de migracion tiene una tarea que anota, bloque por bloque, que paso de
rojo a verde y que sigue rojo con su plan responsable. Un rojo NUEVO no se puede
esconder entre los declarados.

**Lo que la Wave 0 ya demostro, y es el hallazgo mas incomodo de la fase:** la
fuga de la tarifa al huesped no es teorica. La asercion 13 la imprime:

```
# Failed test 13: "D7-7 FUGA: una aseadora NO puede leer cleanings.tarifa_huesped"
#         have: 90000
#         want: ERROR:42501
```

Eso es la tarifa real de un apartamento, leida desde una sesion de aseadora. La
cierra `07-05` en la Wave 2, por las dos vias.

Las 8 decisiones de la Fase 5, en una linea cada una (el detalle y el porque estan en `05-CONTEXT.md`):

- D-01 Android es SUPUESTO, no inventario. iOS se construye y se valida (hay iPhone fisico). Levantar
  los 8 equipos reales es tarea previa al piloto de la Fase 8.

- D-02 Instalacion asistida presencial, una vez. NO termina cuando la app aparece en la pantalla de
  inicio: termina cuando llego una notificacion de prueba a ese telefono.

- D-03 El admin ve quien no tiene push activo, y recibe advertencia al confirmar un aseo para uno de
  ellos. No es el semaforo de entregabilidad (ese sigue diferido a v2).

- D-04 Drenaje: trigger AFTER INSERT en `notifications` con `net.http_post` fire-and-forget, MAS
  `pg_cron` cada 60s de red y reintentos. NO se toca ninguno de los 6+ RPC que ya escriben.

- D-05 Colapso de rafagas con `Topic` + `tag` a la misma clave, por destinatario + aseo + CLASE de
  evento. `dedupe_key` (~80 chars) no cabe en `Topic` (32 base64url): hay que derivar un hash corto.

- D-06 El codigo de acceso NO viaja en el payload de push. Desviacion deliberada de la letra del
  criterio 2; el codigo solo sale por `reveal_access_code()` con su auditoria (T-01-48).

- D-07 Dos formatos de envio: declarativo para iOS 18.4+ (el sistema pinta la notificacion y el
  codigo no puede fallar) y clasico para el resto. Mitiga la revocacion silenciosa de Safari.

- D-08 ALCANCE AMPLIADO por decision del usuario: `hora_limite_vencida` para aseos anteriores a hoy
  entra en esta fase, no en un quick aparte. Ya reflejado en el ROADMAP como criterio 7.

De la Fase 4, que queda cerrada en disco y mergeada a `main` (PR #2), con tres checkpoints humanos
pendientes que NO bloquean la Fase 5:

Del plan 04-14, que cierra la fase:

Los tres specs de Playwright encontraron que `/operacion` NO FUNCIONABA en el build de produccion, y
ninguna de las otras tres capas de prueba podia verlo. Dos defectos bloqueantes, los dos corregidos y
medidos:

1. Toda mutacion colgaba el navegador. Con `revalidatePath('/operacion')` en cualquiera de las nueve
   Server Actions, la fila se escribia en la base, el servidor respondia 200 con la carga util
   completa en ~50 ms, y el cliente no la aplicaba NUNCA: el boton se quedaba en `Cancelando…` para
   siempre, sin toast y sin cerrar el dialogo. Se quito la llamada de las nueve; el refresco lo pide
   `router.refresh()` en el cliente, que los cinco dialogos ya llamaban. La causa raiz NO esta
   identificada y el disparador es de TAMANO del arbol de cliente, no de contenido.

2. El `Sheet` de confirmacion encadenada media OCHO PIXELES de ancho. `max-w-<nombre>` en Tailwind
   v4.3 resuelve contra `--spacing-*` antes que contra `--container-*`, y la escala de espaciado de
   02-UI-SPEC §2 usa nombres de talla: `max-w-sm` compilaba a `var(--spacing-sm)` = 8px. Ademas
   `tailwind-merge` no reconocia `max-w-sheet`, asi que el override del sitio de uso no desplazaba al
   de la primitiva. Corregido en `cn()`; el Sheet mide sus 480px y el spec lo MIDE.

CERRADO EL 2026-09-07 por el quick `260907-703`: `AlertDialog` y `Tooltip` ya no llevan `max-w-xs`
ni `sm:max-w-sm`, sino `--container-alerta` (320px), `--container-alerta-ancha` (384px) y
`--container-tooltip` (320px), tokens con nombre propio que no colisionan con la escala de
espaciado. Medido en el CSS del build de produccion, que es la unica capa donde ese defecto se ve.
Lo que NO se cerro es la colision de fondo: `max-w-xs|sm|md|lg` siguen valiendo 4, 8, 12 y 16 px, y
una primitiva nueva que los use nace rota. La regla derivada esta escrita en `app/globals.css`.

NO SE CERRO, Y TOCA EL CORE VALUE: `hora_limite_vencida` sigue sin computarse para aseos anteriores a
hoy, porque la ventana de `leerOperacion()` arranca en `hoyBog()`. Un aseo de ayer vencido y sin
terminar no produce alerta. Candidato: Fase 5.

Suites: pgTAP 7/153 PASS, unit 31/568, integration 16/145, e2e 16/96, `ci:arch` OK, `lint` 0 errores
(eran 3), `tsc` OK, `db:types:check` sin diferencias, `build` verde. Senuelos de la fase: 17 de 17.
con `exigirAdmin()` como PRIMERA operacion de las nueve y un test que lo mide por lo que NO llega a
la base. El error de ASEO-07 sale interpolado con el nombre del apartamento y con `campo: 'fecha'`,
asi que puede ir inline bajo el input. `marcarAlertaAtendida` escribe UNICAMENTE `read_at`, afirmado
contra Postgres real leyendo `title`, `body`, `url` y `payload` antes y despues. Se corrio el senuelo
declarado (cambiar `exigirAdmin()` por `exigirSesion()`) y salieron tres tests rojos: el mensaje que
llega a la UI pasa del texto del guard al de `mapDbError`, y en la ruta de `notifications` pasa a
"No se encontro el registro solicitado.", que habla de existencia de recursos donde deberia hablar de
permisos. Suites: unit 29/548, integration 15/138, pgTAP 7/153 PASS, `ci:arch` OK, `next build` verde.

HALLAZGO QUE AFECTA A TODA LA UI DEL ADMIN: los RPC de este proyecto levantan `P0001` con un TOKEN de
maquina en el `message` y el español en el `hint`. `mapDbError()` leia el `message`, asi que la
pantalla habria mostrado `aseo_no_cerrable`. Corregido en `lib/domain/errors.ts`: en `P0001` manda el
`hint`. Afecta a las siete RPC, no a una.

Del plan 04-09, que sigue vigente:
`/operacion` renderiza los tres bloques de dia con datos reales sobre la rejilla de dos carriles
(1000px de carril ancho a 1440, 840 a 1280, contra 532px de columnas fijas), la fila de 40px con su
variante inerte de gestion externa (sin hover, sin area de clic completa, con "no aplica" en vez de
"sin definir") y la franja de carga con todos los aseadores activos, ceros incluidos. `/operacion`
es ahora la RAIZ del admin y el destino del wordmark; `TopNav` tiene tres links. El carril lateral
queda con su presupuesto de altura cerrado, listo para la bandeja (04-10) y el panel (04-13).
Render medido con el build de produccion levantado y cookie de admin real: 200, y 11 de 13 marcas
del HTML ciertas (las dos falsas son del arnes de siembra, no de la UI). Suites: unit 28/504,
integration 14/128, pgTAP 7/153 PASS.

Del plan 04-07, que sigue vigente: `reschedule_cleaning` sobrevive a una corrida completa de
`sync_feed_apply()` sobre el mismo feed sin cambios, medido con dos corridas encadenadas, y el aseo
repuesto en la fecha del checkout real esta AFIRMADO en la prueba.

Del plan 04-06, que sigue vigente: una sola
consulta a `cleanings` con los dos embeds calificados por nombre de clave foranea alimenta el carril
ancho, la bandeja y los chips con un unico instante de lectura, mas las tres consultas auxiliares del
panel de alertas. 21 unitarios y 10 de integracion nuevos; los tres señuelos del plan corridos y
rojos. Suites: unit 28/502, integration 13/125, pgTAP 7/153 PASS.

DECISION DE EJECUCION 2026-09-06: worktrees DESACTIVADOS para el resto de la fase. Medido por el
ejecutor del 04-05: git dentro de iCloud avanza a ~5 archivos/minuto, y el reset inicial del
worktree consumio 35 de sus 62 minutos, con dos timeouts y un index.lock huerfano. Con 9 planes
restantes serian ~5 horas de puro arranque. Los planes ahora corren en el checkout principal, en
serie. Se pierde paralelismo solo en las waves 4 y 6.

OJO, CAMBIO DE SIGNO: a partir de la migracion 15, un `not ok` en 06_aseos_admin.test.sql YA NO es
esperado, es una regresion. Mismo caso que 05_sync.test.sql tras la Fase 3.

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 04 | 1 medido (P06) | 158min | 158min |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Se actualiza al completar cada plan*

| Plan | Duracion | Tareas | Archivos |
|------|----------|--------|----------|
| Phase 04 P06 | 158min | 2 tasks | 3 files |
| Phase 04 P07 | 39min | 2 tasks | 2 files |
| Phase 04 P09 | 66min | 3 tasks | 10 files |
| Phase 04 P08 | 47min | 3 tasks | 5 files |
| Phase 04 P10 | 68min | 3 tasks | 6 files |
| Phase 04 P11 | 42min | 3 tasks | 10 files |
| Phase 04 P12 | 20min | 2 tasks | 8 files |
| Phase 04 P13 | 35min | 3 tasks | 8 files |
| Phase 04 P14 | 3h 40m | 3 tasks | 14 files |
| Quick 260907-703 | 1h 25m | 3 tasks | 5 files |
| Phase 07 P01 | 62min | 2 tasks | 1 files |
| Phase 07 P02 | 21min | 3 tasks | 9 files |
| Phase 07 P03 | 68min | 2 tasks | 4 files |
| Phase 07 P04 | 25min | 3 tasks | 2 files |

## Accumulated Context

### Decisions

Las decisiones se registran en la tabla Key Decisions de PROJECT.md. Las que más pesan sobre el trabajo actual:

- Schema + migraciones + RLS antes que UI: `database.types.ts` y la forma de los RPC son el contrato de toda la UI
- `legal_hold` y `deleted_at` van en el schema inicial (Fase 1) aunque el job de borrado llegue en la Fase 9
- El código de acceso vive en tabla aparte con RPC y auditoría, no como columna
- La autorización nunca se apoya en claims del JWT (la desactivación de un aseador debe surtir efecto inmediato)
- PWA offline-first desde el día uno, con cola de mutaciones en IndexedDB e idempotencia por `client_event_id`
- El scheduler corre en `pg_cron` + `pg_net` con fan-out por feed, no en Vercel Cron
- [Fase 4] Todo embed de PostgREST hacia una tabla con mas de una clave foranea va calificado por nombre de FK (`profiles!cleanings_aseador_id_fkey`): sin el, PGRST201 en tiempo de ejecucion, y `tsc` no lo ve
- [Fase 4] El carril ancho llega hasta hoy+6 y lo que queda mas lejos solo se cuenta: cinco dias es el horizonte con el que se decide un suplente
- [Fase 4] Los aseos cancelados se traen en la consulta y se filtran en memoria, porque la cabecera del dia lleva el toggle `Ver cancelados (N)` y necesita el conteo
- [Fase 4] La prueba de una decision de schema que solo se manifiesta ENTRE corridas del sync vive en integracion, no en pgTAP: que reschedule_cleaning sobreviva al reconcile exige ejecutar sync_feed_apply() entero
- [Fase 4] Un efecto aceptado se AFIRMA en la prueba: reprogramar deja un aseo sin confirmar en la fecha del checkout real, y eso esta en una asercion, no en un comentario
- [Phase 04]: 04-09: /operacion es la raiz del admin (RAIZ.admin), y TopNav pasa a tres links con Operacion primero y el wordmark apuntando ahi
- [Phase 04]: 04-09: el carril lateral reserva su presupuesto de altura cerrado ANTES de que existan sus dos cards, porque D-02 no se puede improvisar en 04-13
- [Phase 04]: 04-08: el español de un P0001 viaja en el hint de Postgres, no en el message; mapDbError lo lee o la UI pinta el token de maquina (medido contra PostgREST)
- [Phase 04]: 04-08: un UPDATE que afecta a cero filas por RLS no levanta error, asi que devolverlo como exito rompe el estado optimista del panel de alertas
- [Phase 04]: 04-10: la tanda del Sheet se congela al montar; el revalidatePath de confirmarAseo no puede cambiar el aseo que el admin esta mirando
- [Phase 04]: 04-10: Saltar este tambien ante un apartamento sin responsable, no solo ante un fallo de la base: si no, la tanda queda sin salida
- [Phase 04]: 04-10: el responsable fijo del Sheet sale de listarApartamentos y no de un embed nuevo, porque un aseo sin confirmar todavia no tiene aseador_id
- [Phase 04]: 04-11: Reasignar solo sobre Pendiente, no sobre En curso — reassign_cleaning exige started_at is null
- [Phase 04]: 04-11: Marcar como revisado se anade al menu (fuera del UI-SPEC §7.3): la migracion 13 prometia que solo el admin apaga needs_review y no habia superficie
- [Phase 04]: 04-11: se monta solo el dialogo abierto, no los cinco — con 30 filas serian 150 useActionState en reposo
- [Phase 04]: 04-12: el historial vive dentro de la ficha del apartamento (D-22), es de solo lectura (D-23) y NO filtra los danos resueltos. damages_open_idx es parcial sobre los no resueltos y copiar ese predicado esconde justo el dato que hace util el historial; senuelo corrido y rojo en las dos suites.
- [Phase 04]: 04-12: el 'Ver 30 mas' del historial va por query string (?historial=) y no por useState, asi la seccion sigue siendo un RSC. El parametro pasa por limiteDeHistorial(), que lo redondea al bloque de 30 y le pone techo de 300: acaba en el limit de dos consultas a Postgres.
- [Phase 04]: 04-13: el contador del panel de alertas muestra el TOTAL, nunca lo renderizado ni lo que queda tras el filtro. Es la unica garantia medible de que el scroll interno no es un escondite (criterio 4 del ROADMAP).
- [Phase 04]: 04-13: el toggle Ver atendidas va en la URL (?alertas=atendidas) y el filtro por tipo en useState. La regla: lo que cambia QUE FILAS lee el servidor vive en la URL; lo que solo filtra lo ya traido vive en el cliente.
- [Phase 04]: 04-13: la suscripcion de Realtime es un DISPARADOR y no una fuente de datos: llama router.refresh() y no lee el payload. Evita duplicar lib/domain/, el N+1 de los embeds sin resolver y REPLICA IDENTITY FULL, y conserva el estado del cliente.
- [Phase 04]: 04-13: el estado inicial del canal es DEGRADADO, no en vivo. Antes del primer SUBSCRIBED no hay conexion, y arrancar en verde para bajar a ambar es la mentira silenciosa que D-14 existe para evitar.
- [Phase 04]: 04-13: el sondeo de respaldo (120s en vivo, 30s caido, pausado con la pestana oculta) se construye SIEMPRE. Es lo que deja a Realtime como una capa que se puede quitar sin romper la pantalla, que es el escenario de hoy con el checkpoint A1 abierto.
- [Phase 04]: 04-13: el estado optimista de Marcar como atendida usa useOptimistic con base vacia, no useState. Revierte solo al terminar la transicion, y eso cubre el ok:false por CERO FILAS AFECTADAS sin restaurar el id a mano en la rama de fallo.
- [Phase ?]: 04-14: las nueve Server Actions de /operacion NO llaman revalidatePath; colgaba el navegador y el refresco lo pide router.refresh() en el cliente
- [Phase ?]: 04-14: cn() usa extendTailwindMerge con los max-w-* del proyecto; sin eso el Sheet de confirmacion medía 8px
- [Quick 260907-703]: los anchos de las primitivas de shadcn van en tokens `--container-<nombre-propio>`, nunca con nombre de talla: `max-w-<nombre>` resuelve contra `--spacing-*` antes que contra `--container-*`, y todo token nuevo se registra ademas en el grupo `max-w` de cn()
- [Phase 07]: El contrato pgTAP de la Fase 7 nace en rojo y fija el contrato de NOMBRES del schema financiero en la cabecera del test, no en una migracion — Es Wave 0: tres planes de waves distintas (07-04, 07-07, 07-09) escriben contra esos nombres sin verse entre si. Si un nombre cambia, cambia primero en 11_financiero.test.sql
- [Phase 07]: La fuga del Hallazgo 1 queda MEDIDA en vivo: una aseadora autenticada lee 90000 pesos de tarifa al huesped desde cleanings y desde properties — Los dos grants de la migracion 07 son de TABLA y en Supabase admin y aseadora comparten el rol authenticated: la policy acota filas, no columnas. Las aserciones 13 y 14 de 11_financiero.test.sql lo imprimen en el have del TAP. Las cierra 07-05
- [Fase 7] 07-02: el sembrador financiero acepta el periodo por parametro para que el autoritativo sea el de Postgres, no el ancla local del arnes
- [Fase 7] 07-02: el rojo de una Wave 0 se produce por resolucion de modulo, no por una asercion que falla: es inconfundible y no se puede leer como un defecto real
- [Fase 7] 07-02: el contrato de un modulo que aun no existe se declara en un `.d.ts` SIN `.ts`; tsc queda verde y vitest sigue rojo, y ningun bundle puede importar un stub
- [Fase 7] 07-02: las fechas de una fixture se anclan 45 dias atras y nunca en literales de calendario, o la suite falla sola al ano siguiente y deja fechas en el futuro los dias 1 y 2 de cada mes
- [Phase 7]: El cierre de un periodo se siembra en E2E invocando cerrar_periodo con una sesion de admin real, no escribiendo el snapshot con la clave de servicio: un periodo cerrado que la funcion nunca produjo haria que las specs afirmaran sobre datos que el sistema no sabe generar
- [Phase 7]: Toda asercion de no-divulgacion en E2E lleva su control de metodo: si ninguna carga de red trae un dato que el usuario SI puede ver, el interceptor no miro nada y la ausencia del dato prohibido no prueba nada
- [Phase 7]: 07-04: tres tablas y no dos en el snapshot financiero. payout_periods existe para que un periodo sin ninguna aseadora con aseos deje rastro, y para que la idempotencia de D7-3 sea por PERIODO y no por persona
- [Phase 7]: 07-04: los punteros de cleaner_payout_lines al mundo vivo (cleaning_id, expense_id, property_id) van SIN clave foranea, ni siquiera debil. Con cascada la purga de la Fase 9 borraria el desglose de un pago ya cobrado; con FK restrictiva la purga fallaria con 23503 y no borraria nunca nada
- [Phase 7]: 07-04 CONSECUENCIA PARA LA FASE 9: el recibo de gasto dura 1825 dias (app_settings.expense_photo_retention_days) y public.foto_vencida(kind, created_at) es el unico punto que decide si una foto vencio. Purgar por photo_retention_days a secas borra los recibos y rompe D7-2

### Pending Todos

Ninguno.

### Blockers/Concerns

- **[Fase 3] Bloqueante humano parcialmente cerrado:** el `.ics` real de Airbnb ya se capturo y anonimizo (fixture `airbnb-real-anonimizado.ics`). Queda pendiente para el plan 03-10 un `.ics` con **bloqueos del propietario hechos a mano**; sin el, la clasificacion reserva-vs-bloqueo se queda en confianza MEDIA
- **[Fase 3, resuelto por diseño]** La contradiccion sobre la estabilidad del `UID` de Airbnb dejo de ser bloqueante: la identidad del aseo es `(property_id, scheduled_date)`, no la reserva. La instrumentacion (`feed_sync_runs.uid_rotations` y `min_ends_on`) quedo escrita y se lee al tercer dia de sync en produccion, ver `deferred-items.md` de la Fase 3
- **[Fase 1] Abierto de producto:** la lista definitiva de tareas del checklist bloquea el seed del catálogo, no el schema. Se arranca con el catálogo provisional (máximo 3 tareas por tipo de cuarto), editable sin migración
- **[Fase 5] Riesgo aceptado:** push como único canal, sin semáforo de entregabilidad. Si en el piloto de Bogotá un aseo confirmado nunca llega al aseador, entra el semáforo (NOTIF-V2-01)
- ~~ALTA (04-14): AlertDialog (~32px) y Tooltip (4px) colapsados~~ **RESUELTO 2026-09-07** por el quick `260907-703`. Tokens `--container-alerta` (320px), `--container-alerta-ancha` (384px) y `--container-tooltip` (320px) dentro de las dos primitivas, medidos en el CSS de produccion. La colision de fondo `--spacing-*` vs `--container-*` SIGUE viva: cualquier primitiva nueva con `max-w-md`/`max-w-lg` nace rota, y la regla queda escrita en `app/globals.css`
- ~~STATE.md en current_phase 05~~ **RESUELTO el 2026-09-13 por el orquestador**, al cerrar la Wave 0. La seccion Current Position ya refleja la Fase 7 con sus 14 planes y el estado rojo declarado de las cuatro suites. Lo anotaron 07-01 y 07-02 y era correcto: un ejecutor de plan no podia arreglarlo con tres planes corriendo sobre el mismo arbol.
- ~~FIN-02 a FIN-05 marcados `Complete` en REQUIREMENTS.md~~ **RESUELTO el 2026-09-13 por el orquestador**: pasan a `In Progress`. Venian del frontmatter `requirements` de planes de Wave 0, que escriben el CONTRATO y no lo satisfacen. Dejarlos en `Complete` habria hecho que el verificador de fase diera por buena una fase a medias, que es exactamente el modo de fallo que esta fase esta tratando de evitar en todos los demas frentes.
- **[Fase 7] Requisitos marcados Complete antes de tiempo:** FIN-03, FIN-04 y FIN-05 quedaron en `Complete` en REQUIREMENTS.md porque figuran en el frontmatter `requirements` de los planes de la Wave 0, y la Wave 0 solo escribe CONTRATOS: sus 87 casos estan en rojo hasta que 07-04 y 07-06 los pongan en verde. No se revierte desde un ejecutor de plan (tres planes corren en paralelo sobre el mismo arbol); lo reconcilia el verificador de fase

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260907-703 | `AlertDialog` y `Tooltip` median 4 y 32 px: tokens `--container-*` con nombre propio en las dos primitivas | 2026-09-07 | dbf8a98 | [260907-703-max-w-primitivas-rotas](./quick/260907-703-max-w-primitivas-rotas/) |
| 260908-7w0 | `Dialog` y `Sheet` dejaban de nacer con caja de 8px; `ci:arch` ahora atrapa las clases de ancho con nombre de talla | 2026-09-08 | 628720d | [260908-7w0-purgar-los-max-w-con-nombre-de-talla-de-](./quick/260908-7w0-purgar-los-max-w-con-nombre-de-talla-de-/) |

## Consecuencias de la Fase 1 para fases posteriores

Registradas por `gsd-plan-checker` el 2026-08-31 al verificar los planes. Los planners de esas fases deben leer esto.

- **[Fase 3] `calendar_feeds` no tiene columna `url`.** La URL de exportación iCal es una credencial y vive en `property_secrets.ical_url`. El worker de sync corre como `service_role`, que sí tiene `grant all` sobre `property_secrets`, y resuelve la URL por el join `calendar_feeds.property_id = property_secrets.property_id`. Esto se desvía a propósito de `research/ARCHITECTURE.md` §Calendarios.
- **[Fase 4] Toda mutación de `cleanings` necesita RPC nueva, incluida la del admin.** `cleanings` queda con `grant select` puro para `authenticated`, y admin y aseador comparten ese rol de Postgres, así que "solo el admin" no existe como categoría de grant. La Fase 1 entrega 6 RPC (`reveal_access_code`, `confirm_cleaning`, `start_cleaning`, `finish_cleaning`, `decline_cleaning`, `toggle_checklist_item`). La Fase 4 tendrá que crear al menos: `reassign_cleaning` (ASEO-04), creación manual de aseo (ASEO-05), `reschedule_cleaning` (ASEO-06), `close_cleaning` (ASEO-08) y `cancel_cleaning` (ASEO-09). No es un vacío de diseño, es el patrón deliberado, pero hay que presupuestarlo.
- **[Fase 6] Los RPC de reporte** (`report_damage`, `report_expense`, `report_missing_items`) se difirieron a esa fase. Sus tablas, grants y policies ya quedan listos en la Fase 1.
- **[Fase 1, deuda menor]** La aserción 6 de `00_rls_aseos.test.sql` (fuga por embed) se ejecuta con un aseador que ya tiene cero aseos propios, así que el join da cero filas por construcción y no probaría un hueco real en la policy de `properties`. La protección de `properties` sí queda probada, sola, por la aserción 5. Debilidad heredada del research, no del plan.

## Restricciones nuevas (2026-08-31)

- **Free tier de Vercel y Supabase durante todo el desarrollo.** Obliga a retención de fotos de 30 días (no 6 meses), compresión a ~200 KB con lado largo de 1280 px y una foto por cuarto. El cron de 30 min vive en `pg_cron`, así que el tope de 1 corrida diaria de Vercel Hobby no aplica
- **Vercel Hobby prohíbe uso comercial.** El piloto de la Fase 8 en operación real cruza esa línea y obliga a migrar a plan pago
- **Equipo de dos personas.** Ejecución secuencial estricta; el grafo de paralelización queda documentado en ROADMAP.md pero no se asume
- **Airbnb es la única fuente de calendario**, vía su exportación iCal: un `GET` a una URL secreta, sin API key ni OAuth. La API oficial de Airbnb es cerrada y de partners. Google Calendar quedó descartado porque es otro suscriptor del mismo archivo, con retraso de polling propio
- **La URL de exportación es la credencial** (secreta e inadivinable), así que vive en `property_secrets` igual que el código de acceso
- **El feed no trae número de huéspedes ni nombre**, solo 6 campos. Por eso el paso de confirmación del admin es el único punto por donde entra ese dato
- **[Fase 4] Costura conocida:** confirmar un aseo lo asigna pero no notifica a nadie hasta que exista la Fase 5. El evento se encola y se drena después

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Notificaciones | Semáforo de entregabilidad de push (NOTIF-V2-01) | v2 | 2026-08-31 |
| Financiero | Exportación/impresión del cierre mensual (FIN-V2-01) | v2 | 2026-08-31 |
| Desempeño | Scorecard por aseador (PERF-V2-01) | v2 | 2026-08-31 |
| Propietarios | Dashboard de propietarios (OWNER-V2-01) | v2 | 2026-08-31 |
| Calendario | Integración con Booking.com | Fuera de MVP | 2026-08-31 |
| Calendario | Google Calendar como fuente (es suscriptor del mismo .ics) | Descartado | 2026-08-31 |
| Piloto | Métrica de éxito del piloto sin definir | Abierto | 2026-08-31 |

## Session Continuity

Last session: 2026-09-13T19:01:36.032Z
Stopped at: Completado 07-04-PLAN.md (migracion 23)

**Abierto (unico):** el checkpoint humano de 06-10 tarea 3, el recorrido en un telefono real. Los cinco criterios de fallo estan escritos en `06-10-SUMMARY.md`. Nada mas bloquea la fase.

**Diferidos por decision del desarrollador:** 05-12 (wizard `/instalar` con sus 5 capturas), 05-17 (validacion en dispositivo fisico) y el criterio 4 de la Fase 6 (offline, D-08, registrado en `.planning/BACKLOG.md`).

**Tres cosas que esta fase encontro y conviene no olvidar:**

  a. **El test de paridad SQL/TypeScript encontro una divergencia real el primer dia que corrio**: `armarChecklist()` descartaba el salto de un cuarto sin tareas, asi que el dashboard del admin marcaba el aseo y la pantalla de la aseadora decia que estaba completo. Arreglado del lado de TypeScript, con cuatro tests unitarios que lo fijan.

  b. **`env(safe-area-inset-bottom)` valia CERO** hasta que se declaro `viewport-fit=cover` en el layout de `app/(cleaner)/`. La clase estaba, compilaba y no hacia nada: un verde falso que solo se ve en un iPhone con muesca.

  c. **Tres aserciones de `e2e/operacion.spec.ts` llevaban rojas desde la Fase 5** sin que nadie lo viera: los toast de confirmar y reasignar ganaron la coletilla de 'aseador sin avisos' y los tests comparaban la cadena exacta de la Fase 4. Ahora comparan por prefijo.

**Sin bloqueos activos.** El stack local de Supabase esta arriba y sano (12 contenedores), la
migracion 15 esta aplicada y las tres suites estan en verde: `test:unit` **29 archivos / 548 tests**,
`test:integration` **15 archivos / 138 tests**, `db:test` `Files=7, Tests=153, Result: PASS`.

**Lo que hay que saber antes de tocar nada:**

1. **Worktrees DESACTIVADOS** para el resto de la fase (decision del 2026-09-06, arriba). Los planes
   corren en el checkout principal, en serie.

2. **CAMBIO DE SIGNO vigente:** un `not ok` en `06_aseos_admin.test.sql` YA NO es esperado, es una
   regresion.

3. **El I/O de iCloud domina el reloj de las herramientas de build, y esta medido** (04-06): `tsc` en
   frio tardo 6 min 39 s consumiendo 6 s de CPU; `eslint` llego a 53 minutos con 4,4 s de CPU. Con las
   caches calientes bajan a 3 s y a segundos respectivamente. Recomendacion: correr `npx tsc --noEmit`
   una vez al empezar la sesion, y NO dar por colgado un proceso a 0 % de CPU sin mirar antes su tiempo
   acumulado con `ps -o time`.

4. **Los duplicados de iCloud con sufijo numerico siguen apareciendo.** En el 04-06 rompieron
   `npx tsc --noEmit` con 11 errores desde `.next/types/cache-life.d 2.ts` y `routes.d 2.ts`. Se
   apartaron a mano (no se borraron); `.next/` esta en `.gitignore` y `next build` lo regenera.

5. **`npm run db:reset` cuesta 54 s medidos, y es lo que domina un plan de senuelos.** El 04-07 hizo
   veintitres (uno por aplicar cada senuelo y otro por revertirlo): ~20 de sus 39 minutos. No hay
   atajo honesto: aplicar el senuelo con un `create or replace` suelto prueba la funcion pero no la
   migracion. Presupuestarlo si un plan futuro vuelve a mutar migraciones.

6. **El resto del reloj YA NO lo domina iCloud** con las caches calientes: en el 04-07, `tsc` tardo
   segundos, `db:test` 2,3 s y la integracion completa 9,7 s.

Siguiente: cerrar el checkpoint humano de la Fase 6 en un telefono real, o arrancar la Fase 7 (Financiero), que es la que consume el `monto` entero que esta fase empezo a capturar.
Resume file: None
