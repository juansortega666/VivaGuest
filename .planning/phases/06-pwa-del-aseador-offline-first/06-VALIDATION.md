---
phase: 06
slug: pwa-del-aseador-offline-first
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-09-12
---

# Phase 06 — Validation Strategy

> Contrato de validacion de la fase. 10 planes, 28 tareas, 7 olas.
> Ejecucion **en serie**: los worktrees estan desactivados (git dentro de iCloud avanza a ~5
> archivos/minuto).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Frameworks** | `vitest@4.1.11` (unit e integracion, dos configuraciones), `supabase test db` (pgTAP), `@playwright/test@1.62.1` (E2E, **solo Chromium**) |
| **Config files** | `vitest.config.ts` · `vitest.integration.config.ts` · `playwright.config.ts` · `supabase/config.toml` |
| **Quick run command** | `npm run test:unit` |
| **Full suite command** | `npm run db:reset && npm run db:test && npm run test:unit && npm run test:integration && npm run ci:arch && npm run build && npm run test:e2e` |
| **Estimated runtime** | `test:unit` ~25 s · `db:reset` **54 s medidos** · `db:test` ~35 s (diez archivos) · `test:integration` ~2 min · `build` ~60 s · `test:e2e` ~4 min |
| **Instalacion nueva** | ninguna capa nueva. La unica dependencia de la fase es `browser-image-compression@2.0.2`, tras compuerta humana en 06-04 |

**Regla del instrumento, heredada y no negociable:** comprobar siempre **cuantos tests corrieron**, no
solo el codigo de salida. `No test files found` es un rojo sin una sola asercion. Para pgTAP, el total
de aserciones tiene que ser igual a la suma de los `plan(N)` de los **diez** archivos.

---

## Sampling Rate

- **Despues de cada commit de tarea:** `npm run test:unit` (~25 s).
- **Despues de cada tarea que toque SQL:** `npm run db:test` (~35 s), ademas del anterior.
- **Al cerrar cada ola:** `npm run ci:arch && npx tsc --noEmit && npm run build`.
- **Al cerrar las olas 2 y 7:** suite completa, incluida la de integracion.
- **Antes de `/gsd-verify-work`:** suite completa en verde, con el conteo anotado.
- **Latencia maxima:** 35 s en el ciclo corto; 54 s cuando la tarea muta migraciones, que es lo que
  domina cualquier plan con SQL.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | PWA-07 | T-06-01, T-06-02 | El contrato de la derogacion de PWA-07 nace **en rojo** antes de la migracion | pgTAP | `npm run db:test` (rojo esperado solo en `09_ejecucion_aseo.test.sql`) | ❌ W0 (lo crea la tarea) | ⬜ pending |
| 06-01-02 | 01 | 1 | PWA-07, CHECK-04 | T-06-03, T-06-04, T-06-06 | La evidencia saltada solo se escribe por RPC; `cleaning_room_skips` sin grant de escritura | source | `grep -c "security definer" supabase/migrations/20260912100000_18_ejecucion_aseo.sql` | ✅ tras 06-01-01 | ⬜ pending |
| 06-01-03 | 01 | 1 | CHECK-03 | T-06-05 | **[BLOCKING]** Schema aplicado de verdad; sin esto todo verde posterior es falso | pgTAP + typegen | `npm run db:reset && npm run db:test && npm run db:types:check && npx tsc --noEmit` | ✅ | ⬜ pending |
| 06-02-01 | 02 | 2 | REPORT-01, REPORT-03 | T-06-09, T-06-12 | Una notificacion **por cada admin activo**, y tres claves de colapso distintas para el mismo aseo | pgTAP | `npm run db:test` (rojo esperado solo en `10_reportes.test.sql`) | ❌ W0 (lo crea la tarea) | ⬜ pending |
| 06-02-02 | 02 | 2 | REPORT-01, REPORT-02, REPORT-03 | T-06-07, T-06-08, T-06-11 | Guarda compartida de pertenencia con `42501` indistinguible; `property_id` resuelto en el RPC | source | `grep -c "security definer" supabase/migrations/20260912110000_19_rpc_reportes.sql` | ✅ tras 06-02-01 | ⬜ pending |
| 06-02-03 | 02 | 2 | PWA-05 | T-06-10 | **[BLOCKING]** Migracion aplicada, y comprobado que un reporte nuevo entra a la cola de push sin que nadie lo empuje | pgTAP + typegen | `npm run db:reset && npm run db:test && npm run db:types:check && npx tsc --noEmit` | ✅ | ⬜ pending |
| 06-03-01 | 03 | 2 | CHECK-01, CHECK-02 | T-06-14, T-06-16 | CHECK-01 medido: el checklist no muestra cuartos que el apartamento no tiene | unit | `npm run test:unit -- lib/domain/checklist` | ❌ W0 (lo crea la tarea) | ⬜ pending |
| 06-03-02 | 03 | 2 | REPORT-01, REPORT-02 | T-06-13, T-06-15 | Un gasto sin monto **no compila** la union discriminada | unit + tipos | `npm run test:unit -- lib/domain/motivos && npm run test:unit -- lib/domain/reporte.schema && npx tsc --noEmit` | ❌ W0 (lo crea la tarea) | ⬜ pending |
| 06-04-01 | 04 | 2 | CHECK-04 | T-06-SC | Ninguna dependencia entra sin confirmacion humana en el registry | checkpoint | — (bloqueante humano) | n/a | ⬜ pending |
| 06-04-02 | 04 | 2 | CHECK-04 | T-06-17, T-06-18, T-06-21 | El EXIF se elimina antes de salir del telefono; la ruta no admite un byte del cliente | unit | `npm run test:unit -- lib/fotos && npx tsc --noEmit` | ❌ W0 (lo crea la tarea) | ⬜ pending |
| 06-04-03 | 04 | 2 | CHECK-03, PWA-06 | T-06-18, T-06-19, T-06-20 | URL firmada sobre ruta del servidor; registro idempotente; ubicacion **no** se guarda | unit + arquitectura | `npm run test:unit -- lib/data/evidencia && npm run ci:arch && npx tsc --noEmit` | ❌ W0 (lo crea la tarea) | ⬜ pending |
| 06-05-01 | 05 | 3 | CHECK-02 | T-06-22, T-06-23, T-06-25 | Las primitivas nuevas no nacen con caja de 4 a 8 px | arquitectura | `npm run ci:arch && npx tsc --noEmit` | ✅ | ⬜ pending |
| 06-05-02 | 05 | 3 | REPORT-01 | T-06-22, T-06-24 | El CSS de **produccion** resuelve los anchos contra `--container-*`, verificado con array de globs | build + CSS | `npm run build && npm run ci:arch` | ✅ | ⬜ pending |
| 06-06-01 | 06 | 4 | PWA-01 | T-06-27 | La RLS es la frontera y no se duplica en TypeScript | unit | `npm run test:unit -- aseos-del-aseador && npx tsc --noEmit` | ❌ W0 (lo crea la tarea) | ⬜ pending |
| 06-06-02 | 06 | 4 | PWA-01 | T-06-30 | Ninguna pantalla muestra contador de pendientes ni estado de cola | build + source | `npm run build && npm run ci:arch` | ✅ | ⬜ pending |
| 06-06-03 | 06 | 4 | PWA-04, PWA-05 | T-06-26, T-06-28, T-06-29 | Tocar la tarjeta no entra al aseo; devolver exige motivo y no es destructivo | unit + build | `npm run test:unit -- "app/(cleaner)/_actions" && npm run build && npm run ci:arch` | ✅ (se amplia) | ⬜ pending |
| 06-07-01 | 07 | 4 | CHECK-02 | T-06-31 | Area de toque de 44 px y marcado optimista que se revierte ante fallo | build + source | `npm run build && npm run ci:arch` | ✅ | ⬜ pending |
| 06-07-02 | 07 | 4 | CHECK-01, CHECK-02 | T-06-32, T-06-33, T-06-34 | La barra nunca se deshabilita y respeta el area segura; el contador sale de un solo sitio | build + source | `npm run build && npm run ci:arch` | ✅ | ⬜ pending |
| 06-07-03 | 07 | 4 | PWA-04 | T-06-35 | La pantalla del aseo conserva el contrato del codigo de acceso de la Fase 5 | build + HTTP | `npm run build && npm run ci:arch` | ✅ | ⬜ pending |
| 06-08-01 | 08 | 5 | CHECK-03, CHECK-04 | T-06-36, T-06-37, T-06-38 | La foto sobrevive a un fallo de subida; comprimir va antes de reservar la ruta | build + source | `npm run build && npm run ci:arch` | ✅ | ⬜ pending |
| 06-08-02 | 08 | 5 | PWA-07 | T-06-36 | No existe ningun atajo que convierta el skip con motivo en skip libre | build + source | `npm run build && npm run ci:arch` | ✅ | ⬜ pending |
| 06-08-03 | 08 | 5 | CHECK-03 | T-06-39, T-06-40 | Guardas de entrada al asistente; ruta propia para que atras vuelva al checklist | build + HTTP | `npm run build && npm run ci:arch` | ✅ | ⬜ pending |
| 06-09-01 | 09 | 6 | REPORT-01, REPORT-02, REPORT-03 | T-06-41, T-06-10, T-06-42 | Un gasto sin monto no llega a la base; terminar **no** revalida el checklist en el cliente | unit | `npm run test:unit -- "app/(cleaner)/aseos" && npm run ci:arch` | ✅ (se amplia) | ⬜ pending |
| 06-09-02 | 09 | 6 | REPORT-02 | T-06-43, T-06-44 | Teclado numerico a 16 px exactos, contra el zoom automatico de iOS | build + source | `npm run build && npm run ci:arch` | ✅ | ⬜ pending |
| 06-09-03 | 09 | 6 | PWA-06 | T-06-45 | El cierre avisa de los cuartos saltados sin celebrar nada | build + manual | `npm run build && npm run ci:arch` | ✅ | ⬜ pending |
| 06-10-01 | 10 | 7 | CHECK-03 | T-06-46, T-06-48 | El admin ve la evidencia incompleta sin abrir el aseo, y el dashboard de la Fase 4 no regresa | unit + build | `npm run test:unit -- lib/data/operacion && npm run build && npm run ci:arch` | ✅ (se amplia) | ⬜ pending |
| 06-10-02 | 10 | 7 | todos los de la fase | T-06-14, T-06-47, T-06-50 | La regla duplicada dice lo mismo en SQL y en TypeScript, **medido** | integracion + e2e | `npm run test:integration -- evidencia-paridad && npm run test:e2e -- aseo-ejecucion` | ❌ W0 (lo crea la tarea) | ⬜ pending |
| 06-10-03 | 10 | 7 | todos los de la fase | T-06-47, T-06-49 | Se usa con una mano, de pie y con guantes, sin zoom y sin fallar la punteria | checkpoint | — (bloqueante humano, doce puertas mas recorrido en telefono) | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

La infraestructura de pruebas **ya existe** desde las Fases 1 a 5: las cuatro capas estan configuradas
y en verde. No hace falta instalar ningun framework.

Lo que si es Wave 0 son los **contratos ejecutables que nacen en rojo antes de su implementacion**, y
cada uno vive dentro de su propio plan para que la ventana de rojo dure una tarea y no una ola:

- [ ] `supabase/tests/09_ejecucion_aseo.test.sql` — el contrato de la **derogacion de PWA-07**. Lo
      escribe **06-01 Task 1 en rojo**, lo pone en verde **06-01 Task 3**. Es el unico sitio donde se
      puede medir que `finish_cleaning` dejo de bloquear.
- [ ] `supabase/tests/10_reportes.test.sql` — el contrato de los tres reportes y de sus notificaciones,
      incluida la asercion de **una notificacion por cada admin activo**. **06-02 Task 1 en rojo**.
- [ ] `lib/domain/checklist.test.ts`, `motivos.test.ts` y `reporte.schema.test.ts` — la logica pura,
      escrita antes de su implementacion en **06-03**.
- [ ] `lib/fotos/comprimir.test.ts` y `nombres.test.ts` — **06-04 Task 2 en rojo**, con el test que
      busca la firma del EXIF en los bytes de salida.
- [ ] `lib/data/evidencia.test.ts` — **06-04 Task 3**.
- [ ] `lib/data/aseos-del-aseador.test.ts` — **06-06 Task 1 en rojo**.
- [ ] `lib/domain/evidencia-paridad.integration.test.ts` — **06-10 Task 2**. Paga la deuda que el plan
      06-03 declaro a proposito.
- [ ] `e2e/aseo-ejecucion.spec.ts` — **06-10 Task 2**.

**Los senuelos son parte del contrato, no un extra.** Once tareas exigen correr un senuelo en los dos
sentidos y anotar las dos salidas en el SUMMARY. Los cuatro mas caros de esta fase:

1. **El EXIF** (06-04): activar la preservacion pone el test en rojo. Es la contradiccion entre
   `CLAUDE.md` §6 y CHECK-04, y hay que verla fallar.
2. **La derogacion de PWA-07** (06-01): el comportamiento viejo pone en rojo el `lives_ok`, que es lo
   que demuestra que el cambio ocurrio de verdad.
3. **CHECK-01** (06-03): agrupar por tarea en vez de por cuarto produce un grupo por tarea.
4. **La paridad SQL/TypeScript** (06-10): cambiar una de las dos implementaciones rompe el escenario
   correspondiente.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Legitimidad de `browser-image-compression` | CHECK-04 | Es la unica dependencia nueva de la fase y el protocolo exige confirmacion humana en el registry | 06-04 Task 1, con cuatro criterios de fallo y una alternativa escrita (`canvas` a mano, ~40 lineas) |
| **La foto sobrevive a un fallo de subida** | CHECK-03 | Requiere provocar un fallo de red real y ver que la previsualizacion se queda | 06-08 Task 1, comprobacion manual anotada en el SUMMARY |
| **Marcar varias casillas seguidas, rapido** | CHECK-02 | El marcado optimista solo se percibe usandolo; ningun test mide "se siente instantaneo" | 06-10 Task 3, paso 4 |
| **Tocar casillas con un dedo y sin mirar** | CHECK-02 | El area de toque de 44 px se valida con el pulgar, no con un selector | 06-10 Task 3, paso 5. Criterio de fallo: si falla la punteria, el area no es de 44 px |
| **El campo del monto no dispara el zoom de iOS** | REPORT-02 | Es comportamiento del motor de Safari y solo se ve en un iPhone | 06-10 Task 3, paso 10. Criterio de fallo explicito |
| **La foto sale derecha** | CHECK-04 | El EXIF se borra, asi que la orientacion depende de la rotacion sobre pixeles. Solo se comprueba mirando | 06-10 Task 3, paso 8 |
| **El boton de la barra fija no queda tapado por la barra de gestos** | PWA-04 | `safe-area-inset-bottom` se valida en un telefono con barra de gestos, no en un navegador de escritorio | 06-10 Task 3, criterio de fallo |
| La tabla de `/operacion` y la senal nueva | CHECK-03 | La senal se ve en el dashboard del admin y hay que confirmar que la fila no cambio de forma | 06-10 Task 3, paso 12 |

**Lo que esta fase NO valida, y no finge validar:** el comportamiento sin senal. Esta diferido (D-08),
la interfaz tiene **prohibido** sugerirlo (`06-UI-SPEC.md` §11.4), y **no se escribe ningun test de
offline**, ni siquiera uno "documental": un test de algo que no existe es ruido. El riesgo esta
registrado en `.planning/BACKLOG.md` con su detonante.

---

## Validation Sign-Off

- [x] Las 28 tareas tienen `<verify><automated>` o una dependencia de Wave 0 declarada
- [x] Continuidad de muestreo: no hay tres tareas seguidas sin verificacion automatizada. Las dos
      unicas sin comando (`06-04-01` y `06-10-03`) son checkpoints humanos y estan separadas por cinco
      olas
- [x] Wave 0 cubre las ocho referencias que faltaban
- [x] Ningun comando lleva bandera de modo observador
- [x] Latencia de realimentacion: 35 s en el ciclo corto, 54 s con migraciones
- [x] Dos tareas `[BLOCKING]` de aplicacion de schema, una por migracion, antes de cualquier verificacion
- [x] `nyquist_compliant: true`

**Approval:** approved 2026-09-12 (`gsd-planner`)
