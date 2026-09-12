---
phase: 05
slug: notificaciones-push-e-instalaci-n-de-la-pwa
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-09-11
updated: 2026-09-11
---

# Phase 05 — Validation Strategy

> Contrato de validacion de la fase, para el muestreo de realimentacion durante la ejecucion.
> 17 planes, 46 tareas, 9 olas. Ejecucion **en serie**: los worktrees estan desactivados
> (`workflow.use_worktrees=false`) porque git dentro de iCloud avanza a ~5 archivos/minuto.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Frameworks** | `vitest@4.1.11` (unit e integracion, dos configuraciones), `supabase test db` (pgTAP), `@playwright/test@1.62.1` (E2E, **solo Chromium**) |
| **Config files** | `vitest.config.ts` · `vitest.integration.config.ts` · `playwright.config.ts` · `supabase/config.toml` |
| **Quick run command** | `npm run test:unit` |
| **Full suite command** | `npm run db:reset && npm run db:test && npm run test:unit && npm run test:integration && npm run ci:arch && npm run build && npm run test:e2e` |
| **Estimated runtime** | `test:unit` ~20 s · `db:reset` **54 s medidos** · `db:test` ~30 s · `test:integration` ~2 min (JWT reales, `fileParallelism: false`) · `build` ~60 s · `test:e2e` ~3 min (incluye `build` + `start`) |
| **Instalacion nueva** | ninguna. Las tres capas ya existen desde las Fases 1 a 4. El plan 05-01 solo anade dependencias de producto |

**Regla del instrumento, heredada y no negociable:** comprobar siempre **cuantos tests corrieron**,
no solo el codigo de salida. `No test files found` es un rojo sin una sola asercion, y un TAP leido
sin contar `ok` dice "mal" sin haber medido nada. Para pgTAP, el total de aserciones tiene que ser
igual a la suma de los `plan(N)` de los ocho archivos.

---

## Sampling Rate

- **Despues de cada commit de tarea:** `npm run test:unit` (~20 s).
- **Despues de cada tarea que toque SQL:** `npm run db:test` (~30 s), ademas del anterior.
- **Al cerrar cada ola:** `npm run ci:arch && npx tsc --noEmit && npm run build`.
- **Al cerrar las olas 5 y 9:** suite completa, incluida la de integracion.
- **Antes de `/gsd-verify-work`:** suite completa en verde, con el conteo anotado.
- **Latencia maxima de realimentacion:** 30 s en el ciclo corto; 54 s cuando la tarea muta
  migraciones, que es lo que domina cualquier plan con SQL y hay que presupuestarlo.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | NOTIF-01 | T-05-SC | Ningun paquete entra sin confirmacion humana contra el registry | checkpoint | — (bloqueante humano) | n/a | ⬜ pending |
| 05-01-02 | 01 | 1 | NOTIF-01 | T-05-09, T-05-11 | Un secreto con prefijo publico se rechaza en runtime | unit | `npm run test:unit -- lib/env` | ❌ W0 (lo crea la tarea) | ⬜ pending |
| 05-01-03 | 01 | 1 | NOTIF-02 | — | El arbol sigue verde con Serwist instalado y sin enganchar | build | `npx tsc --noEmit && npm run ci:arch && npm run build` | ✅ | ⬜ pending |
| 05-02-01 | 02 | 2 | NOTIF-04 | T-05-13, T-05-07 | El contrato del schema de avisos existe **en rojo** antes de la migracion | pgTAP | `npm run db:test` (rojo esperado solo en `07_push.test.sql`) | ❌ W0 (lo crea la tarea) | ⬜ pending |
| 05-02-02 | 02 | 2 | NOTIF-04 | T-05-13, T-05-06 | La evidencia de verificacion queda fuera del grant por columna | source | `grep -c "security definer" supabase/migrations/20260911120000_16_push_avisos.sql` | ✅ tras 05-02-01 | ⬜ pending |
| 05-02-03 | 02 | 2 | NOTIF-01 | T-05-15 | **[BLOCKING]** El schema aplicado de verdad; sin esto todo verde posterior es falso | pgTAP + typegen | `npm run db:reset && npm run db:test && npm run db:types:check && npx tsc --noEmit` | ✅ | ⬜ pending |
| 05-03-01 | 03 | 3 | NOTIF-03 | T-05-17, T-05-18 | El rollback revierte el disparo: propiedad **medida**, no citada | pgTAP | `npm run db:test` (rojo esperado solo en `08_push_jobs.test.sql`) | ❌ W0 (lo crea la tarea) | ⬜ pending |
| 05-03-02 | 03 | 3 | NOTIF-03 | T-05-16, T-05-17 | El trigger nunca lanza; el secreto no viaja en la definicion del job | source | `grep -c "after insert on public.notifications" supabase/migrations/20260911121000_17_push_jobs.sql` | ✅ tras 05-03-01 | ⬜ pending |
| 05-03-03 | 03 | 3 | NOTIF-01 | T-05-06 | **[BLOCKING]** Migracion 17 aplicada y los 4 jobs visibles | pgTAP + typegen | `npm run db:reset && npm run db:test && npm run db:types:check && npx tsc --noEmit` | ✅ | ⬜ pending |
| 05-04-01 | 04 | 2 | NOTIF-03 | T-05-05, T-05-21 | Un 403 de configuracion nunca desactiva una suscripcion | unit | `npm run test:unit -- lib/push/errores` | ❌ W0 (lo crea la tarea) | ⬜ pending |
| 05-04-02 | 04 | 2 | NOTIF-04 | T-05-20 | Dos clases de evento nunca comparten clave de colapso | unit | `npm run test:unit -- lib/push/colapso` | ❌ W0 (lo crea la tarea) | ⬜ pending |
| 05-05-01 | 05 | 2 | NOTIF-01 | T-05-03 | El codigo de acceso no cabe en el tipo del payload | unit + tipos | `npm run test:unit -- lib/push/payload && npx tsc --noEmit` | ❌ W0 (lo crea la tarea) | ⬜ pending |
| 05-05-02 | 05 | 2 | NOTIF-02 | T-05-09, T-05-23 | `enviar()` nunca lanza y no devuelve credenciales | unit | `npm run test:unit -- lib/push/envio && npm run ci:arch` | ❌ W0 (lo crea la tarea) | ⬜ pending |
| 05-06-01 | 06 | 4 | NOTIF-03 | T-05-01 | El guard no se duplica: identidad referencial con el de la Fase 3 | unit | `npm run test:unit -- app/api/push/drain` | ❌ W0 (lo crea la tarea) | ⬜ pending |
| 05-06-02 | 06 | 4 | NOTIF-04 | T-05-04, T-05-18 | El reclamo es idempotente y la revocacion tiene una sola puerta | unit | `npm run test:unit -- lib/data/push && npx tsc --noEmit` | ❌ W0 (lo crea la tarea) | ⬜ pending |
| 05-06-03 | 06 | 4 | NOTIF-01, NOTIF-02 | T-05-01, T-05-25, T-05-26 | Guard antes de la fabrica; sin `GET`; sin destino deja rastro | arquitectura + build | `npm run ci:arch && npx tsc --noEmit && npm run build` | ✅ | ⬜ pending |
| 05-07-01 | 07 | 5 | NOTIF-03 | T-05-27, T-05-29 | El arnes no desactiva la verificacion global de TLS | tipos + arquitectura | `npx tsc --noEmit && npm run ci:arch` | ❌ W0 (lo crea la tarea) | ⬜ pending |
| 05-07-02 | 07 | 5 | NOTIF-01, NOTIF-04 | T-05-05 | Un 403 masivo deja **cero** suscripciones revocadas | integracion | `npm run test:integration -- push-drenaje` | ❌ W0 (lo crea la tarea) | ⬜ pending |
| 05-08-01 | 08 | 4 | PWA-02 | T-05-31, T-05-32, T-05-34 | El service worker se genera, no se versiona y se sirve sin cache | build | `npm run build && test -f public/sw.js && npx tsc --noEmit` | ✅ | ⬜ pending |
| 05-08-02 | 08 | 4 | NOTIF-01 | T-05-30, T-05-33 | Un payload ilegible **igual** muestra notificacion | unit | `npm run test:unit -- lib/push/sw-handlers` | ❌ W0 (lo crea la tarea) | ⬜ pending |
| 05-08-03 | 08 | 4 | PWA-02 | — | `display: standalone`, requisito duro de iOS para push | build + CLI | `node scripts/dev/generar-iconos.mjs && npm run build && npx tsc --noEmit` | ✅ | ⬜ pending |
| 05-09-01 | 09 | 5 | PWA-03 | T-05-38 | Los dos anchos nuevos no pueden compilar a 8 px | build + CSS | `npm run build && npm run ci:arch` | ✅ | ⬜ pending |
| 05-09-02 | 09 | 5 | PWA-03 | T-05-36 | Una verificacion a mano no cuenta como `Activos` | unit | `npm run test:unit -- lib/domain/avisos && npx tsc --noEmit` | ❌ W0 (lo crea la tarea) | ⬜ pending |
| 05-09-03 | 09 | 5 | PWA-03 | T-05-35, T-05-37 | El hook no pide permiso en ningun sitio | unit | `npm run test:unit -- lib/push/plataforma && npx tsc --noEmit` | ❌ W0 (lo crea la tarea) | ⬜ pending |
| 05-10-01 | 10 | 6 | PWA-03 | T-05-02, T-05-39, T-05-40 | El endpoint del cliente se valida contra una allowlist de hosts | unit | `npm run test:unit -- suscripcion.schema && npm run ci:arch` | ❌ W0 (lo crea la tarea) | ⬜ pending |
| 05-10-02 | 10 | 6 | PWA-03, NOTIF-01 | T-05-35 | El permiso solo se pide desde el `onClick`, con suscripcion en el mismo handler | build + source | `npm run build && npx tsc --noEmit` | ✅ | ⬜ pending |
| 05-10-03 | 10 | 6 | PWA-03 | — | La escala movil queda impuesta por CI, probada con senuelo | arquitectura | `npm run ci:arch && npm run build` | ❌ W0 (crea `scripts/ci/check-escala-movil.sh`) | ⬜ pending |
| 05-11-01 | 11 | 7 | PWA-03 | T-05-08, T-05-14, T-05-39 | El tope de tres lo cuenta la base **antes** de enviar | unit | `npm run test:unit -- "app/(cleaner)/instalar" && npm run ci:arch` | ❌ W0 (lo crea la tarea) | ⬜ pending |
| 05-11-02 | 11 | 7 | PWA-02 | T-05-36 | `Ya sonó` solo existe mientras se espera, y no da grado bueno | arquitectura + build | `npm run ci:arch && npm run build` | ✅ | ⬜ pending |
| 05-12-01 | 12 | 8 | PWA-02 | T-05-41 | Las cinco capturas son reales, recortadas y sin datos personales | checkpoint | — (bloqueante humano) | n/a | ⬜ pending |
| 05-12-02 | 12 | 8 | PWA-02 | — | Una captura no puede quedarse muda: el tipo exige el texto alternativo | tipos + arquitectura | `npm run ci:arch && npx tsc --noEmit` | ✅ | ⬜ pending |
| 05-12-03 | 12 | 8 | PWA-02, PWA-03 | T-05-36, T-05-42 | No hay atajo a la pantalla de cierre sin pasar por la prueba | build + HTTP | `npm run build && npm run ci:arch` | ✅ | ⬜ pending |
| 05-13-01 | 13 | 6 | NOTIF-01 | T-05-45, T-05-46, T-05-47, T-05-48 | Revelar deja rastro; fuera de ventana no entrega; los tres errores son uno | integracion | `npm run test:unit -- aseo-aseador && npm run test:integration -- codigo-acceso` | ❌ W0 (lo crea la tarea) | ⬜ pending |
| 05-13-02 | 13 | 6 | NOTIF-01 | T-05-44 | El codigo no se persiste en ninguna capa del cliente | arquitectura + source | `npm run ci:arch && npx tsc --noEmit` | ✅ | ⬜ pending |
| 05-13-03 | 13 | 6 | NOTIF-01 | — | La ruta existe: toda push del aseador deja de caer en un 404 | build + HTTP | `npm run build && npm run ci:arch` | ✅ | ⬜ pending |
| 05-14-01 | 14 | 6 | NOTIF-02, NOTIF-04 | T-05-07 | El admin obtiene el estado sin recibir una sola credencial | unit | `npm run test:unit -- lib/data/aseadores && npx tsc --noEmit` | ❌ W0 (crea `lib/data/avisos.test.ts`) | ⬜ pending |
| 05-14-02 | 14 | 6 | NOTIF-04 | T-05-50 | La fila del aseador sin avisos no se tinta ni se pinta de rojo | build + source | `npm run build && npm run ci:arch` | ✅ | ⬜ pending |
| 05-14-03 | 14 | 6 | NOTIF-02 | T-05-49 | El copy no promete un canal de mensajeria que el producto no tiene | build + source | `npm run build && npm run ci:arch` | ✅ | ⬜ pending |
| 05-15-01 | 15 | 7 | NOTIF-02 | T-05-52 | La advertencia avisa sin bloquear la tanda de quince | build + source | `npm run build && npm run ci:arch` | ✅ | ⬜ pending |
| 05-15-02 | 15 | 7 | NOTIF-04 | T-05-35, T-05-53 | La franja aparece tambien el dia sin carga si alguien quedo mudo | build + source | `npm run build && npm run ci:arch` | ✅ | ⬜ pending |
| 05-15-03 | 15 | 7 | NOTIF-02 | T-05-51 | Un copy de exito nunca afirma entrega | unit | `npm run test:unit -- "app/(admin)/operacion/_actions"` | ✅ (existe desde la Fase 4; se **invierte**) | ⬜ pending |
| 05-16-01 | 16 | 8 | DASH-05 | T-05-54 | Se cambian **los dos** filtros de fecha, no solo la consulta | unit | `npm run test:unit -- lib/data/operacion && npx tsc --noEmit` | ✅ (se amplia) | ⬜ pending |
| 05-16-02 | 16 | 8 | DASH-05 | T-05-56 | El panel no gana tipo nuevo: solo cambia el texto del titulo | unit | `npm run test:unit -- lib/domain/alertas && npx tsc --noEmit` | ✅ (se amplia) | ⬜ pending |
| 05-16-03 | 16 | 8 | DASH-01 | T-05-55 | La alerta de dia anterior **tiene donde aterrizar** | build + manual | `npm run build && npm run ci:arch` (+ comprobacion manual del ancla) | ✅ | ⬜ pending |
| 05-17-01 | 17 | 9 | NOTIF-01, PWA-02 | T-05-30, T-05-57 | Un push entregado de verdad produce notificacion, tambien si es ilegible | e2e | `npm run test:e2e -- push-instalacion` | ❌ W0 (lo crea la tarea) | ⬜ pending |
| 05-17-02 | 17 | 9 | NOTIF-03, NOTIF-04 | — | Las doce puertas en verde con su conteo anotado | suite completa | `npm run db:test && npm run test:unit && npm run test:integration && npm run ci:arch && npm run build` | ✅ | ⬜ pending |
| 05-17-03 | 17 | 9 | PWA-02, PWA-03, NOTIF-01 | T-05-03, T-05-35, T-05-57 | El aviso llega a un iPhone y a un Android reales **sin** el codigo de acceso dentro | checkpoint | — (bloqueante humano, M1/M2 en las dos plataformas) | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

La infraestructura de pruebas **ya existe** desde las Fases 1 a 4: las cuatro capas (`vitest` unit,
`vitest` integracion, pgTAP y Playwright) estan configuradas y en verde. No hace falta instalar
ningun framework.

Lo que si es Wave 0 son los **contratos ejecutables que nacen en rojo antes de su implementacion**, y
cada uno vive dentro de su propio plan para que la ventana de rojo dure una tarea y no una ola:

- [ ] `supabase/tests/07_push.test.sql` — el contrato del schema de avisos. Lo escribe **05-02 Task 1
      en rojo**, lo pone en verde **05-02 Task 3**. Cubre NOTIF-04 y las amenazas T-05-07 y T-05-13.
- [ ] `supabase/tests/08_push_jobs.test.sql` — el contrato del transporte, incluida **la asercion de
      que un rollback revierte el disparo**, que hasta hoy era una afirmacion del research sin medir
      en este repo. Lo escribe **05-03 Task 1 en rojo**, verde en **05-03 Task 3**. Cubre NOTIF-03.
- [ ] `lib/test/push.ts` — el push service falso con contador de peticiones y respuesta programable.
      Es **infraestructura de la capa 3** y va antes que cualquiera de sus siete casos (**05-07 Task
      1**).
- [ ] `scripts/ci/check-escala-movil.sh` — el guardarrail que impide la escala de escritorio bajo el
      arbol del aseador. Se escribe y se encadena en `ci:arch` en **05-10 Task 3**, y **no antes**:
      hasta ese plan los dos archivos existentes del arbol usan la escala vieja y el script romperia
      el build desde el primer dia.
- [ ] Utilidades de permiso y de sesion de CDP en `e2e/fixtures.ts` — **05-17 Task 1**.

**Los senuelos son parte del contrato, no un extra.** Trece tareas exigen correr un senuelo en los
dos sentidos y anotar las dos salidas en el SUMMARY. Un test que nadie vio rojo no prueba nada, y los
tres mas caros de esta fase son: la rama de desalineacion de clave VAPID (la que borraria las ocho
suscripciones), el segundo filtro de fecha de D-08 (el que deja el bloque vacio con sensacion de
arreglado), y el `try/catch` del handler `push` (el que revoca el permiso en iOS sin ruido).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Legitimidad de `web-push`, `serwist` y `@serwist/next` | NOTIF-01 | `slopcheck` no esta disponible en este entorno; los tres quedaron `[ASSUMED]` en el research | 05-01 Task 1: verificar los tres en `npmjs.com` antes de instalar |
| Las cinco capturas de instalacion | PWA-02 | No hay forma de tomar una captura real de iOS desde CI, y un icono que imite el glifo ensena mal | 05-12 Task 1: recortes a 2x desde el iPhone fisico, sin datos personales, anotando version y fecha |
| **M1 — instalacion y permiso, camino feliz** | PWA-02, PWA-03 | Playwright no ejecuta service workers en WebKit; el simulador de iOS no es fiable para el permiso | 05-17 Task 3, procedimiento M1. Paso critico: tocar la salida sin compromiso y comprobar que **no** sale ningun dialogo del sistema |
| **M2 — entrega de punta a punta con la pantalla bloqueada** | NOTIF-01 | La entrega real pasa por APNs contra un dispositivo real; no hay forma de emularla | 05-17 Task 3, procedimiento M2. Criterio de fallo de seguridad: si aparece el codigo de acceso o el nombre del huesped en el aviso |
| M3 — modo avion y cola de la plataforma | NOTIF-03 | Depende del comportamiento de APNs con el dispositivo desconectado | 05-17 Task 3, procedimiento M3 |
| M4 — denegacion y recuperacion en iOS | PWA-03 | La irreversibilidad de la denegacion no esta documentada por Apple y hay que medirla | 05-17 Task 3, procedimiento M4. **En dispositivo de pruebas, nunca en el de un aseador real** |
| M5 — revocacion por push silencioso | NOTIF-04 | Mide el numero real de fallos tolerados, que ninguna documentacion oficial da | 05-17 Task 3, procedimiento M5. **Destructivo y opcional**, solo en staging |
| **M6 — una prueba por plataforma** | PWA-02 | Ni Chromium automatizado ni el simulador cubren la entrega real; hay que verla en un aparato | 05-17 Task 3. **Un iPhone y un Android, no una matriz por persona** (decision del 2026-09-11, corrige a D-01: el numero de aseadores es variable). El equipo incompatible lo detecta el banner S0 en el onboarding |
| La tabla de `/aseadores` a 1280px sin scroll horizontal | NOTIF-04 | La cuenta de §2.3 esta hecha; medirla es lo que la convierte en un hecho | 05-14 Task 2, contra el build de produccion |
| El clic de una alerta atrasada aterriza en su fila | DASH-01 | Es el ancla de una alerta de un bloque nuevo; verlo es lo que prueba que existe | 05-16 Task 3, con un aseo vivo y vencido de ayer sembrado |
| El escenario "cero carga hoy y un aseador sin avisos" | NOTIF-04 | Es el dia concreto en que la franja tiene que aparecer y hoy no aparece | 05-15 Task 2, contra el build de produccion |

**El bloqueante sin fallback, declarado desde `.continue-here.md`:** el iPhone fisico. Sin uno con la
version de iOS que usan los aseadores, esta fase **se puede escribir pero no validar**, y eso se
anota tal cual en vez de darla por buena.

---

## Validation Sign-Off

- [x] Las 46 tareas tienen `<verify><automated>` o una dependencia de Wave 0 declarada
- [x] Continuidad de muestreo: no hay tres tareas seguidas sin verificacion automatizada. Las tres
      unicas tareas sin comando (`05-01-01`, `05-12-01`, `05-17-03`) son checkpoints humanos y estan
      separadas entre si por olas enteras
- [x] Wave 0 cubre las cinco referencias que faltaban: los dos archivos pgTAP, el push service falso,
      el guardarrail de la escala movil y las utilidades de CDP
- [x] Ningun comando lleva bandera de modo observador
- [x] Latencia de realimentacion: 30 s en el ciclo corto, 54 s cuando la tarea muta migraciones
- [x] `nyquist_compliant: true`

**Approval:** approved 2026-09-11 (`gsd-planner`)
