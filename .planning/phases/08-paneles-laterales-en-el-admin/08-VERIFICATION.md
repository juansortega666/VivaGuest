---
phase: 08-paneles-laterales-en-el-admin
verified: 2026-09-18T07:25:00Z
status: passed_with_gaps
score: 6/6 criterios del ROADMAP verificados con evidencia propia
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "Toda deuda de ejecución de la fase queda escrita en deferred-items.md para que la Fase 9 la lea al empezar"
    status: partial
    reason: >
      08-VALIDATION.md, en "Lo que este sign-off NO afirma" punto 3, afirma que
      "la rama con cifras del grupo 4 del panel de aseadora nunca se vio pintada"
      "queda en deferred-items.md". Es falso: deferred-items.md (452 líneas, 16
      encabezados) no contiene ninguna mención a "grupo 4", "Lleva ganado" ni
      "periodo_pendiente_de_cierre". El hallazgo real (con su medición completa
      y la razón de por qué el arreglo barato no sirve) vive únicamente en
      08-13-SUMMARY.md líneas 337-347, un archivo que el propio 08-14 dice que
      la Fase 9 "no va a leer" (§8 de 08-14-SUMMARY.md, sobre por qué el
      contrato de la UI-SPEC no basta y hace falta deferred-items.md). Esto es
      exactamente la clase de fuga que T-08-72 (la amenaza que el propio 08-14
      dice haber cerrado: "deuda de ejecución perdida entre catorce SUMMARY")
      existe para impedir, y una instancia se le escapó a la compuerta.
    artifacts:
      - path: ".planning/phases/08-paneles-laterales-en-el-admin/deferred-items.md"
        issue: "No tiene entrada para el hueco de cobertura del grupo 4 del panel de aseadora, pese a que 08-VALIDATION.md dice que sí la tiene"
      - path: ".planning/phases/08-paneles-laterales-en-el-admin/08-VALIDATION.md"
        issue: "Línea del punto 3 de 'Lo que este sign-off NO afirma' hace una referencia cruzada que no resuelve"
    missing:
      - "Añadir a deferred-items.md una entrada para 'la rama con cifras del grupo 4 del panel de aseadora nunca se vio pintada', con el contenido ya escrito en 08-13-SUMMARY.md líneas 337-347 (el argumento sobre periodo_pendiente_de_cierre, por qué sembrar un periodo vencido sin cerrar no alcanza, y que el arreglo toca sembrarFinanzas() en e2e/fixtures.ts)"
      - "Dueño propuesto: quien toque e2e/fixtures.ts para finanzas (Fase 9 u otro plan de estabilidad de la suite), igual que los demás huecos de fixtures ya listados ahí"
---

# Fase 8: Paneles laterales en el admin — Verificación

**Objetivo de la fase:** Consultar una ficha deja de costar la pantalla donde estabas, y el estado de un aseo se mira en vez de preguntarse por WhatsApp
**Verificado:** 2026-09-18, corriendo las cuatro suites de nuevo con `npm run db:reset` y `PLAYWRIGHT_PORT=3210`, no solo leyendo los catorce SUMMARY.
**Estado:** `passed_with_gaps`
**Re-verificación:** No — verificación inicial.

## Metodología

No se aceptó ninguna cifra del `08-14-SUMMARY.md` sin reproducirla. Se corrió:

1. `git diff --name-only $(git merge-base HEAD main)..HEAD -- 'app/(cleaner)'` — en vivo.
2. `npm run db:reset && npm run db:test` — en vivo.
3. `npm run test:unit` — en vivo.
4. `npm run test:integration` — en vivo.
5. `PLAYWRIGHT_PORT=3210 npx playwright test` (la suite E2E completa, una sola corrida, como manda la restricción del proceso de verificación) — en vivo.
6. `npm run ci:arch` y `npm run db:types:check` — en vivo.
7. Lectura directa de `e2e/finanzas.spec.ts`, `e2e/operacion.spec.ts`, `e2e/apartamentos-lista.spec.ts`, `supabase/tests/11_financiero.test.sql`, `PanelAseadora.tsx`, `FichaAseadora.tsx`, `BloqueAhoraMismo.tsx` para cruzar cada afirmación de línea contra el archivo real.

## Los seis criterios del ROADMAP

| # | Criterio | Verificado cómo | Resultado |
|---|---|---|---|
| 1 | Abrir conserva lista/scroll/filtro; cerrar devuelve al mismo sitio | `e2e/apartamentos-lista.spec.ts` líneas 748-800 leídas: los dos casos `CRITERIO 1` existen, comparan `antes`/`despues` con `medirElSitio()` y `vigilarElRemonte()`. Pasaron en la corrida E2E en vivo | ✓ VERIFICADO |
| 2 | El enlace se pega en un chat y abre lo mismo | Casos `CRITERIO 2` leídos en los tres specs (`apartamentos-lista:840,859,881`, `operacion:1274`, `finanzas:790`); todos usan `goto()` directo a la URL con parámetros y verifican el panel correcto. Pasaron en vivo | ✓ VERIFICADO |
| 3 | El botón atrás cierra el panel, no la sección | Casos `CRITERIO 3` leídos en los tres specs; usan navegación de historial y verifican `toBeHidden()` del panel + URL de sección intacta. Pasaron en vivo | ✓ VERIFICADO |
| 4 | El panel de aseo muestra checklist/evidencia/reportes/dinero del aseo, sin salir del día | Casos `CRITERIO 4` en `operacion.spec.ts:1014,1173,1206` leídos, más `lib/data/panel-aseo.integration.test.ts` (incluido en los 205 casos de integración que corrieron en verde). Pasaron en vivo | ✓ VERIFICADO |
| 5 | Ninguna aserción de seguridad se debilitó | **(a)** pgTAP bloque P, aserciones 102-105, leídas línea por línea en `11_financiero.test.sql:2489-2609`: 102/103 son el par que impide una guarda invertida, 104 distingue de `rentabilidad_aseos`, 105 es FIN-01. Corrieron en el `npm run db:test` en vivo: **380/380 PASS**. **(b)** `locator('main')` en `e2e/finanzas.spec.ts` da **cero** usos de código (solo un comentario explicativo en `:47`); las dos aserciones EN RIESGO están retargeteadas a `getByRole('dialog')` en `:767` y `:770`, con el regex de los cinco términos de rastreo intacto byte a byte: `/ubicaci[oó]n\|coordenad\|GPS\|en l[ií]nea\|última vez activa/i`. **(c)** Las cinco aserciones `toHaveURL(.../ancla=.../)` de finanzas siguen en el archivo (`:435,508,680,828,856`), incluida la de `rango=dia&ancla=`. **(d)** Las seis aserciones MUERE de §5.3 (Sus aseos del periodo / Sus pagos mes a mes / Sus gastos reportados, y las tres restantes) dan **grep -c = 0**: están borradas, no comentadas. **(e)** `grep` de aserciones comentadas (`// expect(`/`// await expect(`) en los cinco specs de la fase: **0 resultados** | ✓ VERIFICADO |
| 6 | La app del aseador no cambió en nada | `git diff --name-only d022c94..HEAD -- 'app/(cleaner)'` corrido en vivo: **salida vacía, 0 archivos**. `npm run db:test` en vivo confirma el bloque P (frontera pgTAP) en verde. Las cinco suites del aseador corrieron dentro de la corrida E2E completa (ver abajo) y las tres líneas que antes se declaraban rojas (`operacion.spec.ts:390`, `push-instalacion.spec.ts:215/248`) pasaron **todas en verde** en esta corrida | ✓ VERIFICADO |

**Los seis criterios cierran en verde con evidencia propia, no solo con la cita del SUMMARY.**

## Reproducción de las cuatro suites (con base reseteada)

| Capa | Declarado por 08-14 | Medido en esta verificación | Coincide |
|---|---|---|---|
| pgTAP | 380 en 12 archivos, `Result: PASS` | **380, `Files=12, Tests=380`, `Result: PASS`** | ✓ |
| Unitarios | 1244 en 65 archivos | **1244 passed, 65 archivos** | ✓ |
| Integración | 205 en 23 archivos | **205 passed, 23 archivos** | ✓ |
| E2E | 152 pasando · 1 saltado · 1 rojo (rotando entre `operacion.spec.ts:390` y `push-instalacion.spec.ts:215`) | **153 pasando · 1 saltado · 0 rojos** (exit code 0) | Total no-saltados coincide: 152+1=153=153+0. El rojo es intermitente, como el propio `deferred-items.md` documenta con evidencia de múltiples corridas con resultados distintos; en esta corrida ninguno de los tres candidatos declarados (`operacion.spec.ts:390`, `operacion-alertas.spec.ts:341`, `push-instalacion.spec.ts:215/248`) falló |

**Sobre el rojo intermitente:** la afirmación de `08-14-SUMMARY.md` de que "el rojo varía entre corridas y siempre cae en uno de los tres declarados" no se puede confirmar ni refutar con una sola corrida (y la instrucción del proceso de verificación prohíbe correr la suite completa más de una vez). Lo que sí se confirma: (a) el total de casos no-saltados coincide exactamente con lo declarado, (b) esta corrida no introdujo ningún rojo nuevo fuera de los tres ya documentados, y (c) `deferred-items.md` ya trae evidencia de campo de múltiples corridas distintas para cada uno de los tres candidatos, con causa raíz medida (pila de toasts sin drenar, estado acumulado del service worker, y una dependencia del reloj de pared para `operacion-alertas.spec.ts:341`), ninguna de las tres originada en código de esta fase.

**Guardarraíles**, corridos en vivo: `npm run ci:arch` → `check-service-role: OK · check-max-w-tallas: OK · check-escala-movil: OK`. `npm run db:types:check` → sin diferencias (sin deriva).

## El peligro propio de la fase (criterio 5, el delicado)

Se verificó específicamente la trampa del portal (`SheetContent` se porta a `document.body`):

- `grep -n "locator('main')" e2e/finanzas.spec.ts` → una sola coincidencia, y es un comentario (`:47`) que explica el hallazgo, no código activo.
- Lo mismo en `e2e/operacion.spec.ts` y `e2e/apartamentos-lista.spec.ts`: cero coincidencias.
- Las dos aserciones EN RIESGO retargeteadas por 08-11 (filas 6 y 7 de §5.2 / k y l de §5.3) están en `e2e/finanzas.spec.ts:767` y `:770`, acotadas a `panel.textContent()` con `panel = paginaAdmin.getByRole('dialog')`.
- Las seis aserciones MUERE de §5.3 (d, e, f, g, h, j) están confirmadas **borradas** con `grep -c` = 0 para las tres cadenas literales (`Sus aseos del periodo`, `Sus pagos mes a mes`, `Sus gastos reportados`), y `grep -rn` de líneas comentadas de `expect(` en los cinco specs de la fase da **cero resultados**: no hay aserciones apagadas con `//`, tal como afirma la compuerta.
- El código huérfano declarado (`FichaAseadora.tsx`, la función `BloqueAhoraMismo`) se confirmó con `grep -rl` en `app`, `lib`, `components`, `e2e`: `FichaAseadora.tsx` no tiene ningún importador fuera de sí mismo, y `PanelAseadora.tsx` solo importa `estadoDeAhoraMismo` de `BloqueAhoraMismo.tsx`, no la función `BloqueAhoraMismo` en sí.

## Criterio 6, la frontera del aseador

```
$ git merge-base HEAD main
d022c94cf90af247734b6ef811d639c6ed29baa6

$ git diff --name-only d022c94..HEAD -- 'app/(cleaner)'

$ git diff --name-only d022c94..HEAD -- 'app/(cleaner)' | wc -l
       0
```

Diff vacío confirmado en vivo. El bloque P de pgTAP (frontera del detalle de aseo) corrió en verde dentro del `db:test` completo (380/380). Adicionalmente se comprobó que ningún archivo tocado por la fase (lista completa de 48 archivos de `app/lib/components/e2e/supabase`, obtenida con `git diff --name-only` sobre esos directorios) introduce `getClaims()`, `getSession()` para autorizar, ni lectura de rol desde `user_metadata` en código de producción (la única coincidencia de `user_metadata` es un fixture de prueba en `e2e/finanzas.spec.ts` que fija ambos campos correctamente, con `app_metadata.role` como el que de verdad importa, documentado en el propio comentario del archivo).

## Anti-patrones

Se buscó `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER` en los archivos de UI/datos de panel tocados por la fase. Único hallazgo: un `TODO` en `_actions.ts:181`, que resultó ser la palabra española "todo" ("Todo error de base sale por aquí"), no un marcador de deuda. **No es un hallazgo real.**

No se encontraron componentes con retorno vacío, handlers stub, ni props hardcodeadas a `[]`/`{}`/`null` en los archivos de panel revisados.

## Requisitos

Los 14 planes declaran `requirements: "—"` a propósito, tal como indica el brief de esta verificación, y el ROADMAP confirma "Ninguno nuevo" para la Fase 8. **No se cuenta como cobertura faltante**, conforme a instrucción explícita.

## El hueco encontrado en esta verificación

**`deferred-items.md` no contiene la entrada que `08-VALIDATION.md` dice que contiene.**

El brief de esta verificación advertía explícitamente: *"Un hueco declarado que NO debe darse por cerrado: la rama con cifras del grupo 4 del panel de aseadora nunca se vio pintada."* Se confirmó que el hueco sigue abierto (correcto, nadie lo cerró de más), pero se encontró algo adicional que el brief no anticipaba: **la promesa de que ese hueco "queda en `deferred-items.md`"** (texto literal del punto 3 de "Lo que este sign-off NO afirma" en `08-VALIDATION.md`) **es falsa**. `deferred-items.md` tiene 452 líneas y 16 encabezados, y ninguno menciona "grupo 4", "Lleva ganado" ni `periodo_pendiente_de_cierre`. El único lugar donde vive la medición completa (por qué sembrar un periodo vencido sin cerrar no alcanza, por qué hay que borrar una cabecera y eso arrastra tres pagos de los que dependen catorce casos) es `08-13-SUMMARY.md:337-347`.

Esto importa porque el propio `08-14-SUMMARY.md` (§8) explica que escribe en `deferred-items.md` y no solo en `08-UI-SPEC.md` **precisamente porque "la Fase 9 no va a leer el contrato de la 8"**. Por la misma lógica, la Fase 9 tampoco va a abrir `08-13-SUMMARY.md` para enterarse de este hueco: solo tiene el hilo si alguien lo transcribe donde el propio proceso de la fase dice que hay que transcribirlo. Es una instancia exacta de la amenaza T-08-72 ("deuda de ejecución perdida entre catorce SUMMARY"), que la compuerta declara cerrada y no lo está del todo.

**No bloquea ninguno de los seis criterios del ROADMAP** (el hueco en sí es de cobertura de un dato financiero secundario del panel de aseadora, ya aceptado como fuera de alcance de esta fase por 08-13, con su razón técnica correcta). Se reporta como gap de proceso, no de producto.

## Lo que NO se tocó ni se cerró en esta verificación

- El checkpoint humano de la Fase 7 (`07-13`, recorrido de nueve puntos en iPhone real) sigue **abierto**. `git grep` en `STATE.md` confirma que sigue marcado como pendiente. Esta verificación no lo cierra ni lo toca.
- `git status --short` al final de esta verificación: **vacío**. No quedó ningún archivo modificado por el proceso de verificación.

## Gaps ya conocidos y correctamente declarados (no reabiertos aquí)

Confirmados presentes y con dueño en `deferred-items.md`, sin necesidad de acción adicional:

1. Cobertura perdida sin sustituto (`Al momento de abrir esta página.`) — confirmado: la línea solo vive dentro de `BloqueAhoraMismo`, función sin ningún consumidor.
2. Los dos señuelos que faltaban — confirmados corridos y revertidos por 08-14 (`git status --short` vacío tras la operación, según el propio SUMMARY; no se puede re-verificar retroactivamente porque ya están revertidos, pero el rastro de commits y la bitácora de pgTAP con el verde falso documentado son consistentes).
3. La ráfaga de Realtime (medida, no arreglada).
4. El enlace externo que pasa a dar 404 (decisión A7 aceptada).
5. Código huérfano (`FichaAseadora.tsx`, `BloqueAhoraMismo`) — confirmado con grep, ver arriba.
6. `push-instalacion.spec.ts:215`, `operacion.spec.ts:390`, `operacion-alertas.spec.ts:341` — los tres documentados con causa raíz y candidato a arreglo, ninguno de esta fase.

## Veredicto

**`passed_with_gaps`.**

Los seis criterios de éxito del ROADMAP están genuinamente logrados y se verificaron con evidencia propia (no solo citando el SUMMARY): comandos corridos en vivo, archivos leídos línea por línea, greps ejecutados de nuevo. El trabajo de fondo — paneles laterales, URL como fuente de verdad, la trampa del portal correctamente encontrada y cerrada, la frontera del aseador intacta — está sólido.

El único gap real que esta verificación añade al inventario es de **proceso, no de producto**: una referencia cruzada de la compuerta (`08-VALIDATION.md`) a `deferred-items.md` que no resuelve. Se debe corregir antes de que la Fase 9 empiece, para que no pierda ese hilo.

### Acción pendiente, con dueño

- **Qué:** añadir a `deferred-items.md` la entrada "la rama con cifras del grupo 4 del panel de aseadora nunca se vio pintada", con el contenido de `08-13-SUMMARY.md:337-347`.
- **Dueño sugerido:** quien abra el siguiente plan que toque `e2e/fixtures.ts` de finanzas (Fase 9, o un plan de estabilidad de la suite E2E, que también hereda `operacion.spec.ts:390` y `operacion-alertas.spec.ts:341`).
- **Costo:** un párrafo de copiar/pegar. No requiere código.

---

_Verificado: 2026-09-18_
_Verificador: Claude (gsd-verifier)_
