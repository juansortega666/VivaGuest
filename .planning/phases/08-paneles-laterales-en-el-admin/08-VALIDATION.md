---
phase: 8
slug: paneles-laterales-en-el-admin
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-17
---

# Fase 8 — Estrategia de validación

> Contrato de validación de la fase. Sale entero de `## Validation Architecture`
> de `08-RESEARCH.md`, que se midió contra este repo el 2026-09-17.
>
> **La regla que ordena todo este documento:** el criterio 5 dice que ninguna
> aserción de seguridad se debilita para que el panel pase. En esta fase eso no
> es retórica: el research midió que **una aserción se debilita sola** por el
> portal del panel, sin que nadie lo decida. Ver "El peligro propio de esta fase".

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

---

## Criterios del ROADMAP → mapa de pruebas

| Criterio | Comportamiento | Tipo | Comando | ¿Existe? |
|---|---|---|---|---|
| 1 | Abrir el panel conserva scroll y filtro | e2e | `npx playwright test e2e/apartamentos-lista.spec.ts` | ❌ **Wave 0** (spike) y después caso nuevo |
| 1 | Cerrar devuelve al mismo sitio | e2e | idem | ❌ caso nuevo |
| 2 | Un enlace directo abre el panel | e2e | `goto('/apartamentos?apartamento=<id>')` + `getByRole('dialog')` | ❌ caso nuevo, **uno por panel** |
| 3 | El botón atrás cierra el panel, no la sección | e2e | `page.goBack()` + `expect(dialog).toHaveCount(0)` + URL sigue en la sección | ❌ caso nuevo |
| 4 | El panel de aseo enseña checklist, evidencia y reportes | e2e | `e2e/operacion.spec.ts` | ❌ caso nuevo |
| 4 | La lectura compone bien (progreso, ausencias, informativa) | integración | `lib/data/panel-aseo.integration.test.ts` | ❌ archivo nuevo |
| **5** | **Una aseadora recibe `42501` de la lectura del detalle** | **pgTAP** | `npm run db:test` | ❌ **bloque P** |
| **5** | **El admin sí obtiene fila** | **pgTAP** | idem | ❌ bloque P |
| **5** | **FIN-01: la cifra sale del aseo, no del apartamento** | **pgTAP** | idem | ❌ bloque P |
| 5 | La aseadora sigue leyendo lo que su PWA necesita | pgTAP | ya existe (aserciones 15 y 16) | ✅ **no se toca** |
| 5 | El código de acceso no está en el DOM antes de pulsar `Mostrar` | e2e | `expect(await page.content()).not.toContain(CODIGO)` | ❌ caso nuevo, copiado de `calendario.spec.ts:468` (T-02-74) |
| 5 | Ni una palabra de rastreo en el panel de aseadora | e2e | `e2e/finanzas.spec.ts` | ⚠️ **existe pero se vacía sola**. Hay que retargetearla |
| 6 | La app del aseador no cambió | compuerta de fase | `git diff --name-only <base>..HEAD -- 'app/(cleaner)'` vacío | ❌ **no existe nada** |
| 6 | Las cinco suites del aseador siguen verdes sin tocarlas | e2e | `npx playwright test e2e/aseo-*.spec.ts e2e/mis-pagos.spec.ts e2e/push-instalacion.spec.ts` | ✅ existen |
| — | Aritmética de checkouts sin `new Date(iso)` | unit | `lib/domain/checkouts.test.ts` | ❌ archivo nuevo |
| — | Los tres estados del feed | unit | `lib/domain/feeds.test.ts` | ❌ archivo nuevo |
| — | Ningún `max-w-<talla>` nuevo | arquitectura | `npm run ci:arch` | ✅ existe |
| — | Sin deriva de tipos tras la migración | tipos | `npm run db:types:check` | ✅ existe, **y esta fase lo dispara** |

---

## El peligro propio de esta fase

`SheetContent` se portalea a `document.body`. Toda aserción E2E acotada por
`locator('main')`, por el `<table>` de la página o por un contenedor de layout
**deja de mirar el panel** y pasa en verde sin haber comprobado nada.

`e2e/finanzas.spec.ts:631` es el caso ya identificado: comprueba el vocabulario de
rastreo con `locator('main').textContent()`. Con el panel puesto, esa aserción
pasa mirando un contenedor vacío.

**Esto es exactamente lo que D8-11 declaró innegociable, solo que ocurriendo sin
que nadie lo decida.** No es un test que alguien debilitó: es un test que se
debilitó solo.

**Obligación de la Wave 0:** barrer los seis specs que la fase toca buscando
`locator('main')`, `locator('table')` y `getByRole('table')`, y de cada aserción
retargeteada correr la contra-prueba: meter la cosa prohibida y comprobar que se
pone roja. Una aserción retargeteada que no se probó en rojo no cuenta.

---

## Requisitos de la Wave 0

- [ ] **Spike de medición del criterio 1** sobre `/apartamentos`. No es un test:
      es lo que decide si el filtro hay que moverlo a `searchParams`.
      **Bloquea el diseño de las waves siguientes** (Q1 del research)
- [ ] `supabase/migrations/…_28_*.sql` y su **bloque P** en
      `11_financiero.test.sql`, subiendo `plan(101)` a `plan(105)`
- [ ] `lib/domain/checkouts.test.ts` y `lib/domain/feeds.test.ts` (los dos módulos
      nacen en esta fase)
- [ ] `lib/data/panel-aseo.integration.test.ts`
- [ ] **Barrido de aserciones acotadas por contenedor** en los seis specs que la
      fase toca, con su contra-prueba en rojo
- [ ] Primer uso de `esperarUrlDeCliente()` (`e2e/fixtures.ts:365`), que hoy tiene
      cero consumidores y es el instrumento que esta fase necesita

---

## Verificaciones solo manuales

| Comportamiento | Por qué es manual | Instrucciones |
|---|---|---|
| Ninguna | — | Los seis criterios de la fase tienen verificación automatizada. **Esta fase no añade checkpoints humanos**, a diferencia de la 5, la 6 y la 7 |

El criterio 1 es el que más se parece a algo perceptual, y aun así se mide: el
scroll y el filtro se leen del DOM, no se miran.

---

## Sign-off de validación

- [ ] Toda tarea tiene `<automated>` verify o una dependencia declarada de Wave 0
- [ ] Continuidad de muestreo: no hay 3 tareas seguidas sin verify automatizado
- [ ] La Wave 0 cubre todas las referencias MISSING
- [ ] Sin flags de watch-mode
- [ ] **Toda aserción retargeteada se corrió en rojo antes de darla por buena**
- [ ] `nyquist_compliant: true` en el frontmatter

**Aprobación:** pendiente
