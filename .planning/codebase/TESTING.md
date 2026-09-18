# Estrategia de pruebas

**Fecha de análisis:** 2026-09-18

Este documento es la referencia obligatoria para diseñar cualquier prueba nueva en VivaGuest. Consolida trampas de instrumento medidas en fases 7 y 8, dispersas antes en varios SUMMARY, y la disciplina de señuelos que este repo trata como no negociable.

## Las cinco capas

| Capa | Comando | Motor | Contra qué corre |
|---|---|---|---|
| Unitarios | `npm run test:unit` | `vitest run` | Nada externo — Supabase mockeado, sin red |
| Integración | `npm run test:integration` | `vitest run --config vitest.integration.config.ts` | Base de datos real (Supabase local) |
| Base de datos | `npm run db:test` | `supabase test db --local` (pgTAP) | Postgres local, con roles reales |
| E2E | `npm run test:e2e` (alias de `npx playwright test`) | Playwright | `next build && next start` real, Chromium con canal `chromium` (no headless-shell) |
| Arquitectura | `npm run ci:arch` | Bash | Tres scripts encadenados en `scripts/ci/`: `check-service-role.sh`, `check-max-w-tallas.sh`, `check-escala-movil.sh` |

**Cifras medidas en el repo (2026-09-18):**
- **pgTAP:** 13 archivos en `supabase/tests/`, con `plan(N)` declarado por archivo. Suma de los `plan()` actuales: `00_rls_aseos` 16 · `01_invariantes` 11 · `02_guardarrailes` 10 · `03_seed` 5 · `04_storage` 5 · `05_sync` 65 · `06_aseos_admin` 41 · `07_push` 63 · `08_push_jobs` 19 · `09_ejecucion_aseo` 21 · `10_reportes` 19 · `11_financiero` **105** · `12_almacenamiento` 9 → **389 aserciones pgTAP declaradas** hoy en el árbol. La Fase 7/8 documentó una línea base histórica de 380/380 en verde en un punto anterior de la evolución del archivo 11; `11_financiero.test.sql` es el que más creció (nace en el plan 07-01, llega a `plan(105)` tras el bloque P del plan 08-01).
- **Unitarios + integración (Vitest):** 158 archivos que matchean `lib/*/*.test.ts` o `lib/**/*.test.ts` en el glob usado; conteo estricto de `*.test.ts`/`*.test.tsx` bajo `lib/` y `app/`: **88 archivos**, de los cuales **23 son `.integration.test.ts`**.
- **E2E (Playwright):** **20 specs** en `e2e/*.spec.ts`, sumando **9144 líneas**. Última línea base documentada en fase 8 (`08-14`, compuerta de cierre): **134 pasando, 1 saltado** cuando se corren por grupos; en la suite completa de una sola tirada hay un rojo intermitente reproducible (ver sección de rojos conocidos).
- **Arquitectura:** 3 scripts de shell, sin conteo de aserciones — son greps/invariantes estructurales, no un framework de test.

## Cómo correr cada capa

```bash
npm run test:unit                          # Vitest, rápido, sin dependencias externas
npm run test:integration                   # Vitest contra Supabase local — requiere `supabase db start`
npm run db:reset && npm run db:test        # pgTAP — SIEMPRE resetear antes de una corrida que se vaya a citar
PLAYWRIGHT_PORT=3210 npm run test:e2e      # E2E — puerto propio obligatorio, ver trampa 5 abajo
npm run ci:arch                            # invariantes estructurales, rápido
```

`db:reset` antes de una corrida de pgTAP o de E2E no es opcional cuando el resultado se va a documentar como línea base: el estado que dejan corridas previas (aseos sembrados, seeds parciales) produce colisiones contra índices únicos parciales que se leen como defecto del producto y no lo son.

## La disciplina de señuelos (obligatoria, no anecdótica)

**Regla del repo, literal de la cabecera de `supabase/tests/11_financiero.test.sql`:** *"Una suite en verde demuestra que el código pasa los tests. NO demuestra que los tests puedan fallar."*

Ninguna aserción de este repo se da por buena solo porque está en verde. El procedimiento, aplicado sin excepción desde la Fase 7:

1. Se rompe a propósito la línea de producto que la aserción dice proteger (un `where`, una guarda de rol, un `on delete cascade`, un filtro).
2. Se corre la suite y se anota **qué aserción concreta** se puso roja — por su número o su nombre exacto.
3. Se revierte el defecto.
4. Se vuelve a correr en verde.
5. Se deja constancia en una bitácora dentro del propio archivo de test (`BITÁCORA DE SEÑUELOS`), con tabla de `# — QUÉ SE ROMPIÓ — QUÉ SE PUSO ROJO`.

**Por qué existe esta regla y cuánto costó no tenerla antes:** la cabecera del archivo lo dice explícito — el registro de push llevó semanas roto con error `42501` en producción, con todos sus unitarios en verde, porque esos mockean el cliente de Supabase y solo comprueban la forma del objeto, nunca el grant real de Postgres. Toda escritura y todo grant de RLS nacen ahora con su aserción pgTAP, y nacen **antes** del código que los satisface (el archivo "nace en rojo" a propósito en la wave 0 de cada fase).

**Contabilidad de señuelos corridos, medida en fase 7-8:**

| Origen | Señuelos corridos | Hallazgos reales (radio distinto al esperado o cobertura inexistente) |
|---|---|---|
| pgTAP `11_financiero.test.sql` | 4, más una variante (7, 8, 8b, 9, 10) | 2: señuelo 1 (filtro `is_managed` fuera del núcleo, 369/369 seguía en verde) y señuelo 2 (salida temprana del cierre, 99/99 seguía en verde) — los dos exigieron **ampliar el archivo** con un bloque nuevo para poder atraparlos |
| E2E, interfaz | 9 en plan 08-11, 8 en 08-12, 8 en 08-13, 2 más forzados por la compuerta 08-14 tras un cruce de inventario | 2 encontrados por el cruce final: una aserción de navegación y una de duplicado de `<dd>`, ninguno sostenido por una segunda capa que lo disimulara |

**Consecuencia operativa para cualquier plan de pruebas nuevo:** si una aserción de seguridad o de dinero no tiene un señuelo corrido y anotado, cuenta como "promesa sin recibo" — la frase literal del repo — y no se acepta como cerrada.

## Las trampas de instrumento medidas (consolidado de fases 7 y 8)

Cada una de estas costó horas de repo y produce un falso resultado si no se conoce. No se descubren dos veces.

### 1. `SheetContent` se portalea a `document.body`

Todo panel lateral de la app (Base UI `Sheet` → `Dialog.Portal`) renderiza **fuera** de `<main>`. Cualquier aserción E2E acotada por `locator('main')`, por el `<table>` de la página, o por cualquier contenedor de layout, **no ve el contenido del panel**. Con un panel abierto, esa aserción no está midiendo "el panel no muestra X": está midiendo un contenedor vacío que nunca tuvo el panel dentro.

```typescript
// MAL: pasa siempre, mire el panel lo que mire
const pagina = (await paginaAdmin.locator('main').textContent()) ?? '';
await expect(paginaAdmin.locator('main').getByRole('img', { name: /mapa/i })).toHaveCount(0);

// BIEN: acotar al diálogo real
await expect(paginaAdmin.getByRole('dialog').getByRole('img', { name: /mapa/i })).toHaveCount(0);
```

Medido en fase 8 (`08-02-MEDICION.md`): con este defecto de instrumento, una aserción de fuga de datos sensibles (ubicación GPS de la aseadora) seguía en verde con el dato ya presente en el DOM, solo que fuera del contenedor que la prueba miraba. Barrido recomendado sobre cualquier spec nuevo:
```bash
grep -rn "locator('main')\|locator(\"main\")\|locator('table')\|getByRole('table')" e2e/*.spec.ts
```
La línea base de la suite exige que ese grep no aumente entre planes.

### 2. Aserciones negativas con un panel abierto pasan sin mirar

Consecuencia directa de la trampa 1, en su forma más peligrosa: **`toHaveCount(0)`, `not.toMatch`, y cualquier aserción negativa** contra un contenedor vaciado por el portal pasan trivialmente. Una aserción negativa de seguridad (ese dato NO debe aparecer) es la más fácil de escribir mal y la más cara de no notar, porque el test queda verde para siempre.

### 3. `getByRole('alert')` devuelve siempre uno

Next.js monta `<div id="__next-route-announcer__" role="alert">` vacío en cada página para anunciar cambios de ruta a lectores de pantalla. Cualquier aserción que cuente `getByRole('alert')` para verificar "no hay ningún aviso de error" cuenta ese anunciador vacío como si fuera un error real, o falla al esperar un conteo de cero.

```typescript
// MAL: siempre hay 1, sea o no un error de verdad
await expect(pagina.getByRole('alert')).toHaveCount(0);

// BIEN: contar por el componente de UI, no por el rol ARIA
await expect(pagina.locator('[data-slot=alert]')).toHaveCount(0);
```

### 4. `waitForResponse(...).text()` no puede leer el cuerpo de una Server Action

Descubierto en rojo (plan 08-12): el error literal es *"Response body is not available for a redirected response"* o equivalente — el mecanismo de Server Actions de Next no expone el cuerpo de la respuesta por la vía normal de `Response`. Para atrapar lo que devuelve una Server Action:

```typescript
// MAL: falla siempre con Server Actions
const resp = await page.waitForResponse(url);
const body = await resp.text();

// BIEN: interceptar con page.route y desviar a fetch propio
await page.route(url, async (route) => {
  const response = await route.fetch();
  const body = await response.text();
  // ... inspeccionar body aquí
  await route.fulfill({ response });
});
```

### 5. `PLAYWRIGHT_PORT` es obligatorio en cualquier máquina con más de un checkout del repo

`reuseExistingServer: !CI` reutiliza sin avisar cualquier servidor Next.js que ya esté escuchando en el puerto configurado. Medido el 2026-09-12: con el puerto 3000 ocupado por un `next-server` 15.5.18 de otro proyecto (VivaGuest usa 15.5.24), la suite completa corrió contra la app equivocada y salieron **14 rojos falsos** por timeout de 30s en rutas que en la app ajena no existen. El síntoma se lee como "la suite está rota" y es en realidad "estoy mirando otra aplicación".

```bash
PLAYWRIGHT_PORT=3210 npm run test:e2e
```
Con reset y puerto libre, la línea base documentada es 107/107 (medición original) y luego 134/1 saltado (fase 8). El puerto default sigue siendo 3000 para quien corre un solo checkout, pero cualquier máquina con worktrees compartidos (este repo los usa) debe fijar el puerto.

### 6. `npm run db:reset` antes de cualquier corrida completa de E2E o pgTAP

Sin resetear, los aseos que dejan specs anteriores chocan contra el índice único parcial `(property_id, scheduled_date) where estado <> 'cancelado'`, y dos o más aserciones caen por colisión de datos, no por defecto de producto. Se documenta como precondición dura, no como sugerencia.

### 7. La versión de Chromium importa: usar el canal `chromium`, no `chromium-headless-shell`

Playwright, por defecto, lanza `chromium-headless-shell`, una compilación recortada que **no implementa notificaciones**: `Notification.permission` vale `'denied'` incluso con el permiso concedido en el contexto, sin forma de cambiarlo. Sin `channel: 'chromium'` en `playwright.config.ts`, toda la suite `e2e/push-instalacion.spec.ts` es imposible de correr en verde: el banner del aseador queda en estado `negado` y el botón de activar no existe en el DOM.

### 8. `page.waitForURL` no sirve para navegación de cliente en este árbol

Medido el 2026-09-13: con una transición de React (Server Component streaming/navegación de cliente), tanto `page.waitForURL()` como `expect(page).toHaveURL()` se quedan esperando indefinidamente (probado hasta 20s) mientras `page.url()` leído directo ya refleja el cambio a los ~200ms. La causa es dónde se sondea: los dos primeros inyectan un bucle dentro del documento vía `requestAnimationFrame`, que se traba con el propio commit de la transición de React que están esperando. `page.url()` se lee del lado del navegador sin ejecutar nada dentro del documento.

**No es un defecto del producto** — la navegación real tarda ~200ms. Es un defecto de instrumento, y por eso el repo construyó su propio helper (sección siguiente).

## Instrumentos propios del repo

Viven en `e2e/fixtures.ts` y son de uso obligatorio en cualquier spec E2E nuevo que dispare navegación de cliente o interactúe con un control recién hidratado.

### `esperarControlHidratado(control)`

Sondea si React ya adjuntó su manejador `onClick` al nodo DOM, inspeccionando la clave interna `__reactProps$*` del elemento. Necesario porque un `.click()` de Playwright puede disparar sobre un nodo que ya existe en el DOM (SSR/streaming) pero cuyo manejador de React todavía no se montó — el click "funciona" sin hacer nada, y el test falla más adelante por una razón que no tiene que ver con lo que dice medir.

### `esperarUrlDeCliente(pagina, patron, ms = 15000)`

Sondea `pagina.url()` desde Node (fuera del documento) en un bucle de 50ms hasta que matchee el patrón dado, en vez de usar `page.waitForURL()`. Existe exactamente por la trampa 8 de arriba.

### `esperarNavegacionDeCliente(pagina, control, patron)`

Composición de las dos anteriores: espera hidratación, hace click, espera la URL desde Node. Las dos trampas van siempre juntas — hay que esperar el manejador **antes** de pulsar y la URL desde Node **después**.

**Límite conocido de este helper, documentado en el propio archivo:** queda un fallo vivo, medido el 2026-09-13, anotado en `deferred-items.md` — el helper no resuelve el 100% de las navegaciones de cliente en todos los contextos; revisar el comentario en `e2e/fixtures.ts:406-437` antes de asumir que cubre un caso nuevo.

## Rojos intermitentes conocidos (no son regresión si aparecen)

Documentados en los `deferred-items.md` de las fases 3-8. Antes de reportar un rojo como bug nuevo, revisar si ya está en esta lista.

| Rojo | Condición de aparición | Causa medida | Fuente |
|---|---|---|---|
| `e2e/push-instalacion.spec.ts:215` (caso E2) | Solo en la suite E2E **completa** de una sola tirada; nunca corriendo el archivo solo o por grupos de 5 suites del aseador | Estado acumulado del service worker o del canal DevTools tras ~134 casos previos en el mismo perfil de navegador; sospechoso: `registrationId` reactivado tras muchas navegaciones | `.planning/phases/08-paneles-laterales-en-el-admin/deferred-items.md` |
| `e2e/operacion-alertas.spec.ts:341` | Entre medianoche y las 04:01, **todos los días** | El caso asume que `HORA LÍMITE VENCIDA` (hoy 00:01) es siempre más antigua que `CALENDARIO CAÍDO` (ahora − 4h). Antes de las 04:01, `ahora − 4h` cae en el día anterior y se invierte el orden. El producto ordena bien; la expectativa del test está mal — depende del reloj de quien corre la suite | idem |
| `e2e/operacion.spec.ts:390` | Reproducible en la suite completa y en corridas repetidas del archivo sin los casos nuevos de una fase; NO reproducible con `--repeat-each=3` aislado | `esperarToast()` espera 15s un toast que no llega porque la pila de `sonner` deja de renderizar con más de 3 toasts apilados; el flujo previo deja 5 sin drenar. Arreglo correcto: drenar la pila de toasts en el `beforeEach`, no aflojar la aserción | idem |

## Testing por capa: qué se prueba dónde

**Unitarios (`*.test.ts`, Vitest):** lógica de dominio pura — parser iCal contra fixtures `.ics` reales en `lib/domain/__fixtures__/`, reglas de generación/cancelación de aseos, validación Zod (`*.schema.test.ts`), cálculo de rentabilidad. Mockean Supabase; no tocan red. Aquí está, según el propio repo, "el 90% del riesgo lógico del producto".

**Integración (`*.integration.test.ts`, Vitest contra base real):** todo lo que un unitario mockeado no puede probar — RPCs de Postgres invocadas de verdad, RLS respetado por el cliente real, concurrencia (`cierre-concurrente.integration.test.ts` corre `psql` directo para forzar condiciones de carrera). Requiere `supabase db start` local.

**pgTAP (`supabase/tests/*.test.sql`):** el único mecanismo que prueba grants por columna, políticas RLS y triggers ejecutando la escritura real contra Postgres con roles reales (`authenticated` como admin, `authenticated` como aseador, `anon`). Regla de nombres: todo test nuevo cita las funciones/tablas que ejercita en la cabecera del archivo, para que un cambio de firma se detecte ahí primero. Regla de orden: bloques nuevos van siempre al final, subiendo el argumento de `plan()` — insertar en orden alfabético corre la numeración de aserciones ya citadas por número en planes existentes.

**E2E (Playwright):** flujos completos multi-rol — login único por rol con `storageState` persistido (ningún spec que no sea el de login hace login por UI), flujo del aseador (push → abrir aseo → checklist con foto → terminar), flujo del admin (confirmar aseo, cerrar periodo, panel financiero). Corre contra `next build && next start`, nunca `next dev` — en dev las recompilaciones producen flakiness y cookies/middleware no se comportan como en producción.

**Arquitectura (`ci:arch`):** invariantes estructurales que no son responsabilidad de ningún test funcional — por ejemplo que `service_role` no se filtre a código de cliente, o que ninguna talla de Tailwind exceda el máximo permitido. Corre rápido, sin levantar Postgres ni navegador.

## Reglas de escritura de specs, derivadas del repo

- **Un test que depende del orden de otro miente.** `fullyParallel: false, workers: 1` en `playwright.config.ts`, y cada spec siembra y limpia su propio estado.
- **El día sale siempre de la base, nunca del proceso Node.** `public.today_bog()` es la misma función que usan policies, índices y ventanas de lectura; un `new Date()` del proceso Node puede devolver "mañana" durante las ~5 horas en que UTC ya cambió de día y Bogotá no.
- **Orden de borrado de siembra E2E no es negociable:** `cleanings → properties → auth.users`, porque los FKs son `on delete restrict` a propósito; invertir un eslabón da `23503`.
- **`forbidOnly: !!process.env.CI`:** un `test.only` olvidado en un commit local no puede apagar la suite en CI.
- **Locale fijo `es-CO` / `America/Bogota`** en `use` de Playwright — un formateo de fecha dependiente de la locale de quien corre el test se rompe en CI, que es donde debe romperse.

---

*Análisis de pruebas: 2026-09-18*
