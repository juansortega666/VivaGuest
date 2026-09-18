---
phase: 8
slug: paneles-laterales-en-el-admin
status: signed-off
nyquist_compliant: true
wave_0_complete: true
created: 2026-09-17
signed_off: 2026-09-18
signed_off_by: "08-14 (la compuerta de la fase)"
---

# Fase 8 — Estrategia de validación

> Contrato de validación de la fase. Sale entero de `## Validation Architecture`
> de `08-RESEARCH.md`, que se midió contra este repo el 2026-09-17.
>
> **La regla que ordena todo este documento:** el criterio 5 dice que ninguna
> aserción de seguridad se debilita para que el panel pase. En esta fase eso no
> es retórica: el research midió que **una aserción se debilita sola** por el
> portal del panel, sin que nadie lo decida. Ver "El peligro propio de esta fase".
>
> **Cerrado el 2026-09-18 por el plan 08-14.** Las columnas de existencia ya no
> tienen ni un hueco, y el sign-off está marcado con lo que de verdad se corrió.
> Lo que quedó fuera está escrito abajo, en "Lo que este sign-off NO afirma".

---

## Infraestructura de pruebas

| Propiedad | Valor |
|---|---|
| **Unitarios** | `vitest` 4.1.11 · `vitest.config.ts` |
| **Integración** | `vitest` con `vitest.integration.config.ts` (base real) |
| **Base de datos** | `supabase test db --local` (pgTAP), 12 archivos en `supabase/tests/` |
| **E2E** | `@playwright/test` 1.62.1 · 22 specs en `e2e/` |
| **Arquitectura** | `npm run ci:arch` (3 scripts encadenados) |
| **Corrida rápida** | `npm run test:unit` |
| **Suite completa** | `npm run ci:arch && npm run test:unit && npm run test:integration && npm run db:test && npm run test:e2e` |

Nada de esto se instala en esta fase: las cuatro capas ya existen y están verdes.

---

## Frecuencia de muestreo

- **Por commit de tarea:** `npm run test:unit && npm run ci:arch`
- **Por cierre de wave:**
  - wave de schema → `npm run db:test`
  - wave de lectura → `npm run test:integration`
  - wave de interfaz → `npx playwright test` de los archivos tocados
- **Compuerta de fase:** las cuatro suites en verde, **más** el diff vacío sobre
  `app/(cleaner)`, **más** los señuelos corridos y anotados en la bitácora de
  `11_financiero.test.sql`
- **Latencia máxima de retroalimentación:** la corrida rápida, por debajo de 60s
  (medido el 2026-09-18: **3,16 s** con 1244 aserciones en 65 archivos)

---

## Criterios del ROADMAP → mapa de pruebas

**Regla de esta tabla, y es lo que la hace auditable:** cada fila apunta a un
comando que corre solo y a un archivo con línea. **Ninguna dice "se verificó a
mano"**, porque esta fase no añadió ningún checkpoint humano.

| Criterio | Comportamiento | Tipo | Comando | Dónde vive | ¿Existe? |
|---|---|---|---|---|---|
| 1 | Abrir el panel conserva scroll y filtro | e2e | `npx playwright test e2e/apartamentos-lista.spec.ts` | `e2e/apartamentos-lista.spec.ts:749` | ✅ 08-12 |
| 1 | Cerrar devuelve al mismo sitio | e2e | idem | `e2e/apartamentos-lista.spec.ts:793` | ✅ 08-12 |
| 2 | Un enlace directo abre el panel (apartamento) | e2e | `npx playwright test e2e/apartamentos-lista.spec.ts` | `:840` y, con los dos parámetros, `:859` | ✅ 08-12 |
| 2 | Un identificador que no existe deja la pantalla normal | e2e | idem | `e2e/apartamentos-lista.spec.ts:881` | ✅ 08-12 |
| 2 | Un enlace a un aseo **fuera de la ventana** que la pantalla lee | e2e | `npx playwright test e2e/operacion.spec.ts` | `e2e/operacion.spec.ts:1274` | ✅ 08-13 |
| 2 | Una aseadora **sin actividad en el rango** abre su panel igual | e2e | `npx playwright test e2e/finanzas.spec.ts` | `e2e/finanzas.spec.ts:790` | ✅ 08-13 |
| 3 | El botón atrás cierra el panel, no la sección | e2e | `npx playwright test e2e/apartamentos-lista.spec.ts` | `:931`, y el chevron en `:959` | ✅ 08-12 |
| 3 | Lo mismo en Operación, y cerrar conserva el filtro | e2e | `npx playwright test e2e/operacion.spec.ts` | `:1323` y `:1357` | ✅ 08-13 |
| 3 | Lo mismo en Finanzas, y cerrar conserva rango y ancla | e2e | `npx playwright test e2e/finanzas.spec.ts` | `:831` y `:859` | ✅ 08-13 |
| 4 | El panel de aseo enseña checklist, evidencia, reportes y el dinero **del aseo** | e2e | `npx playwright test e2e/operacion.spec.ts` | `e2e/operacion.spec.ts:1014` | ✅ 08-13 |
| 4 | Un aseo sin confirmar enseña el checklist ausente, no `0/12` | e2e | idem | `e2e/operacion.spec.ts:1173` | ✅ 08-13 |
| 4 | La fila de gestión externa no abre panel | e2e | idem | `e2e/operacion.spec.ts:1206` | ✅ 08-13 |
| 4 | La lectura compone bien (progreso, ausencias, informativa) | integración | `npm run test:integration` | `lib/data/panel-aseo.integration.test.ts` | ✅ 08-05 |
| **5** | **Una aseadora recibe `42501` de la lectura del detalle** | **pgTAP** | `npm run db:test` | `supabase/tests/11_financiero.test.sql:2489` (aserción **102**) | ✅ 08-01, bloque P |
| **5** | **El admin sí obtiene fila** | **pgTAP** | idem | `:2500` (aserción **103**) | ✅ 08-01, bloque P |
| **5** | El aseo **en curso** entra, que es lo que distingue esta función de `rentabilidad_aseos` | pgTAP | idem | `:2515` (aserción **104**) | ✅ 08-01, bloque P |
| **5** | **FIN-01: la cifra sale del aseo, no del apartamento** | **pgTAP** | idem | `:2550` (aserción **105**) | ✅ 08-01, bloque P |
| 5 | La aseadora sigue leyendo lo que su PWA necesita | pgTAP | idem | aserciones **15 y 16**, `:871` | ✅ **no se tocaron** |
| 5 | El código de acceso no está en el DOM antes de pulsar `Mostrar`, y la credencial del calendario no sale nunca | e2e | `npx playwright test e2e/apartamentos-lista.spec.ts` | `e2e/apartamentos-lista.spec.ts:994` | ✅ 08-12 (T-08-57 y T-08-58) |
| 5 | Ni una palabra de rastreo ni imagen de mapa en el panel de aseadora | e2e | `npx playwright test e2e/finanzas.spec.ts` | `e2e/finanzas.spec.ts:767` y `:770`, acotadas a `getByRole('dialog')` | ✅ **retargeteada** por 08-11 |
| 5 | Ninguna cifra del panel de aseo llega al navegador de una aseadora | e2e | `npx playwright test e2e/operacion.spec.ts` | `e2e/operacion.spec.ts:1505` | ✅ 08-13 |
| 5 | Ninguna cifra del panel de aseadora llega al navegador de una aseadora | e2e | `npx playwright test e2e/finanzas.spec.ts` | `e2e/finanzas.spec.ts:1127` | ✅ 08-13 |
| 6 | La app del aseador no cambió | compuerta de fase | `git diff --name-only $(git merge-base HEAD main)..HEAD -- 'app/(cleaner)'` vacío | corrido por 08-14, salida vacía | ✅ **08-14** |
| 6 | **La frontera sigue cerrada**, que es lo que el diff no puede decir | pgTAP | `npm run db:test` | bloque P y aserciones 15 y 16 | ✅ 08-01 |
| 6 | Las cinco suites del aseador siguen verdes **sin tocarlas** | e2e | `npx playwright test e2e/aseo-*.spec.ts e2e/mis-pagos.spec.ts e2e/push-instalacion.spec.ts` | 23 pasando · 1 saltado · 0 rojos | ✅ existen |
| — | Aritmética de checkouts sin `new Date(iso)` | unit | `npm run test:unit` | `lib/domain/checkouts.test.ts` | ✅ 08-03 |
| — | Los tres estados del feed | unit | `npm run test:unit` | `lib/domain/feeds.test.ts` | ✅ 08-03 |
| — | Ningún `max-w-<talla>` nuevo | arquitectura | `npm run ci:arch` | `scripts/ci/check-max-w-tallas.sh` | ✅ existe |
| — | Sin deriva de tipos tras la migración | tipos | `npm run db:types:check` | `lib/database.types.ts` | ✅ existe, **y esta fase lo disparó** (08-01) |

### El verde que NO cuenta, y hay que decirlo aquí

`scripts/ci/check-escala-movil.sh` sale en **OK** en esta fase y **eso no afirma
el criterio 6**. Lo único que vigila es que ninguna clase tipográfica bajo
`app/(cleaner)/` vaya sin su sufijo `-movil`, porque iOS Safari hace zoom
automático por debajo de 16 px. Si la fase no toca ese árbol, el script recorre
un conjunto que no cambió y **sale verde diciendo exactamente nada**.

Quien lea `ci:arch` en verde y concluya que el árbol del aseador está protegido
está leyendo mal. Lo que protege el criterio 6 son las otras dos compuertas: el
diff vacío, que dice que no se tocó, y **las aserciones pgTAP del bloque P**, que
son las únicas que dicen que la frontera **sigue cerrada**.

---

## El peligro propio de esta fase

`SheetContent` se portalea a `document.body`. Toda aserción E2E acotada por
`locator('main')`, por el `<table>` de la página o por un contenedor de layout
**deja de mirar el panel** y pasa en verde sin haber comprobado nada.

`e2e/finanzas.spec.ts:631` era el caso ya identificado: comprobaba el vocabulario
de rastreo con `locator('main').textContent()`. Con el panel puesto, esa aserción
pasaba mirando un contenedor vacío.

**Esto es exactamente lo que D8-11 declaró innegociable, solo que ocurriendo sin
que nadie lo decida.** No es un test que alguien debilitó: es un test que se
debilitó solo.

**Y se midió en crudo, no se supuso.** El plan 08-11 metió la palabra prohibida
dentro del panel y corrió **la misma aserción sobre el mismo documento cambiando
solo el ámbito**: con `locator('main')` pasó en verde, con `getByRole('dialog')`
se puso roja. La salida está en `08-11-SUMMARY.md`.

---

## Requisitos de la Wave 0

- [x] **Spike de medición del criterio 1** sobre `/apartamentos`. Cerrado por
      **08-02**: el filtro sobrevive, el scroll se pierde, y el culpable es
      `loading.tsx` del segmento. El veredicto está escrito como instrucción en
      `08-02-MEDICION.md` §6
- [x] `supabase/migrations/…_28_*.sql` y su **bloque P** en
      `11_financiero.test.sql`, subiendo `plan(101)` a `plan(105)`. Cerrado por
      **08-01**, con sus cuatro señuelos corridos
- [x] `lib/domain/checkouts.test.ts` y `lib/domain/feeds.test.ts`. Cerrados por
      **08-03**
- [x] `lib/data/panel-aseo.integration.test.ts`. Cerrado por **08-05**
- [x] **Barrido de aserciones acotadas por contenedor** en los seis specs que la
      fase toca, con su contra-prueba en rojo. Inventariado por **08-02** §5.2 y
      §5.3, ejecutado por **08-11** con nueve señuelos, y cruzado fila por fila
      por **08-14**
- [x] Primer uso de `esperarUrlDeCliente()` (`e2e/fixtures.ts:365`), que tenía
      cero consumidores. Estrenado por el spike de **08-02** y con su primer
      consumidor permanente en **08-11**

---

## Verificaciones solo manuales

| Comportamiento | Por qué es manual | Instrucciones |
|---|---|---|
| Ninguna | · | Los seis criterios de la fase tienen verificación automatizada. **Esta fase no añade checkpoints humanos**, a diferencia de la 5, la 6 y la 7 |

El criterio 1 es el que más se parece a algo perceptual, y aun así se mide: el
scroll y el filtro se leen del DOM, no se miran. El plan 08-12 lo lee en cinco
medidas por caso y en los dos sentidos.

**Esto se cumplió.** La tabla de criterios de arriba no tiene ni una celda que
diga "verificado a mano", y ningún plan de los catorce abrió un checkpoint.

---

## Sign-off de validación

- [x] Toda tarea tiene `<automated>` verify o una dependencia declarada de Wave 0
- [x] Continuidad de muestreo: no hay 3 tareas seguidas sin verify automatizado
- [x] La Wave 0 cubre todas las referencias MISSING
- [x] Sin flags de watch-mode
- [x] **Toda aserción retargeteada se corrió en rojo antes de darla por buena**
      (nueve señuelos en 08-11, ocho en 08-12, ocho en 08-13, y los **dos que
      faltaban** los corrió 08-14: ver abajo)
- [x] `nyquist_compliant: true` en el frontmatter

**Aprobación:** dada el 2026-09-18 por el plan 08-14, con las cuatro suites
medidas sobre base reseteada y árbol quieto:

| Capa | Al cerrar la Fase 7 | Al cerrar la Fase 8 |
|---|---|---|
| pgTAP | 376 en 12 archivos | **380** en 12 archivos |
| unitarios | 1201 en 63 archivos | **1244** en 65 archivos |
| integración | 196 en 22 archivos | **205** en 23 archivos |
| E2E | 134 pasando · 1 saltado | **152 pasando · 1 saltado · 1 rojo** |

### Los dos señuelos que 08-14 tuvo que correr

El cruce del inventario destapó que **dos de las cinco filas EN RIESGO de §5.3 no
tenían contra-prueba anotada**. Se corrieron aquí, con su rojo real, y se
revirtieron:

| Fila de §5.3 | Qué se rompió | Qué se puso rojo |
|---|---|---|
| **a** (`:589`, la espera que abre el panel de aseadora) | `FilaAseadora.tsx` compone el destino **sin** `aseadora: fila.aseadoraId` | `La navegación de cliente no dejó la URL en /aseadora=[0-9a-f-]{36}/ tras 15000 ms. Sigue en …/finanzas?rango=dia&ancla=2026-08-03` |
| **i** (`:620-625`, el `toBe(1)` de los tres estados) | `PanelAseadora.tsx` pinta el `<dd>` del estado **dos veces** | `el grupo dice exactamente uno de los tres estados (§8.4)` · `Expected: 1` · `Received: 2` |

### Lo que este sign-off NO afirma

Se escribe aquí para que nadie lo lea de más:

1. **El rojo de `e2e/operacion.spec.ts:390`** (el toast de cancelación) sigue
   ahí. **No es una regresión de esta fase**, y 08-14 lo volvió a medir por su
   cuenta: `--grep-invert "CRITERIO"` corre el archivo **sin ninguno de los casos
   nuevos de la fase** y el rojo sale igual (1 rojo · 8 verdes). Está en
   `deferred-items.md` con el arreglo correcto.
2. **El criterio 1 está afirmado sobre `/apartamentos`**, que es la pantalla que
   el enunciado del ROADMAP nombra. La **generalización** a `/operacion` y
   `/finanzas` no la afirma nadie, y no la pide el criterio.
3. **La rama con cifras del grupo 4 del panel de aseadora** nunca se vio pintada.
   08-13 midió por qué el arreglo barato no sirve. Queda en `deferred-items.md`.
4. **La cobertura que se perdió sin sustituto** (`Al momento de abrir esta
   página.`) no se reemplazó por nada, y no se cuenta como cobertura preservada.
