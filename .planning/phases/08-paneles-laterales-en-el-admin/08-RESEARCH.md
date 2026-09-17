# Fase 8: Paneles laterales en el admin - Research

**Researched:** 2026-09-17
**Domain:** Estado de UI en la dirección (App Router + `searchParams`), lectura de un aseo detrás de un grant por columna, y reescritura de aserciones E2E sin debilitarlas
**Confidence:** HIGH (todo lo que decide el plan se midió contra este repo; lo único externo son dos afirmaciones de Next, marcadas)

> **Nota de forma:** este documento no usa la raya larga en español, por la regla del
> usuario. El repo sí la usa en su código y en sus contratos; no se propone cambiar nada
> de lo ya escrito.

> **Nota de alcance:** las once decisiones de `08-CONTEXT.md` están cerradas y el
> `08-UI-SPEC.md` está aprobado en las seis dimensiones. Este documento **no reabre
> ninguna**. Lo que hace es tres cosas: decir cómo se implementa lo decidido, medir lo que
> el plan no puede adivinar, y señalar **seis afirmaciones mecánicas** (no decisiones) que
> el código contradice. Cada una lleva su evidencia y su resolución propuesta, en la misma
> clase que §0.1 del UI-SPEC ya estableció con los conflictos A, B y C.

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**D8-1 · La regla que decide qué es panel y qué es página.** Cita literal del dueño
(2026-09-15): *"El drawer debe ser usado en todos los momentos en los cuales necesitemos
mostrar información adicional sobre algún tipo de selección."* **Seleccionas algo → el
panel te muestra lo que falta saber de eso. Nada más.** Consecuencia: un formulario de
edición o de creación NO es "información adicional sobre una selección", y por lo tanto no
va en panel.

**D8-2 · El objetivo, en una frase.** **Consultar algo no te saca de la pantalla donde
estás.** Hoy ver una ficha te saca del sitio y volver es un viaje: la lista se recarga y
se pierde el scroll y el filtro.

**D8-3 · La ficha de apartamento hay que CREARLA: hoy no existe.** `/apartamentos/[id]` no
es una ficha, es el formulario de edición (`FormularioApartamento.tsx`, 724 líneas, más
`SeccionGestion` 369, `EditorCuartos` 290, `EditorFaltantes` 123 y `HistorialApartamento`
294). Preguntado al dueño si había que crearla, respondió: **"debe crearse"**. Panel =
ficha de lectura nueva y corta, encima de la lista. Página = editar, tal como está hoy. El
panel lleva un botón **Editar** que abre la página. Crear apartamento sigue siendo página.

**D8-4 · Los cuatro paneles y su contenido EXACTO.** Criterio del dueño, literal:
*"mostremos solo la información importante y el resto ignorémoslo"*. **Lo que no está en
la lista, no se muestra.**
- *Apartamento:* nombre · cluster · estado · dirección con enlace a Maps · código de
  acceso · hora límite · responsable y suplente · tarifa, pago y margen · próximo aseo.
  Botones: **Editar** · **Calendario**. *Fuera: cuartos, faltantes base, historial, feeds.*
- *Calendario del apartamento:* próximo checkout · los checkouts del mes · estado del feed
  y última sincronización. *Fuera: histórico de meses pasados.*
- *Aseadora:* nombre · activa o no · apartamentos donde es responsable y donde es
  suplente · aseo en curso · lo que lleva ganado en el periodo abierto. *Fuera: el
  histórico de aseos, que ya está en Finanzas.*
- *Aseo:* apartamento · fecha · estado · quién lo hace · checklist como `7/12` · fotos en
  miniatura · gastos y daños reportados · tarifa, pago y margen. *Fuera: el checklist tarea
  por tarea.*

**D8-5 · El velo se queda como está.** `bg-black/10` con `backdrop-blur-xs`, en
`components/ui/sheet.tsx:87`. Se le preguntó dos veces si quería subirlo y respondió las
dos veces que **así está bien**. **No se toca.**

**D8-6 · El ancho se queda en 480px.** El `--container-sheet` que ya existe en
`app/globals.css:408`. **No se toca.** Consecuencia: el presupuesto de espacio es fijo, así
que lo que se ajusta es el contenido, no el contenedor.

**D8-7 · Sin scroll vertical.** No es una restricción técnica dura, es el objetivo que
ordena D8-4: el contenido de cada panel se recorta hasta que quepa. Si algo no cabe, se
quita, no se agranda el panel ni se acepta el scroll por defecto.

**D8-8 · El panel vive en la dirección, con el patrón que ya existe.** `/finanzas/pagos` ya
lo hace y es el precedente a copiar: se abre con un parámetro de búsqueda (`?pago=<id>`),
la **página servidor** lo lee de `searchParams` y renderiza el panel, y cerrar es
`router.replace(ruta, { scroll: false })`.

**D8-9 · El detalle de aseo lleva migración, no es solo interfaz.** El admin ve la tarifa y
el margen; la aseadora no, y esa frontera está en grants por columna desde la **migración
24**. Leer un aseo ajeno con su dinero exige una **función definer con guarda de admin como
primera sentencia**, igual que las seis de la migración 26. **Esta fase toca base de datos.
No se puede planear como una fase de solo UI.**

**D8-10 · Lo que NO cambia.** Se quedan como página: Operación, Apartamentos, Aseadores,
Finanzas, Aseos, Pagos (son secciones); Crear apartamento; Editar apartamento; y **toda la
app del aseador**, descartada explícitamente.

**D8-11 · Lo que se rompe, y está contado.** **Seis aserciones E2E** afirman que tocar algo
navega a una ruta: `e2e/apartamento-crud.spec.ts` 149, 191, 285; `e2e/apartamento-cuartos.spec.ts`
146; `e2e/finanzas.spec.ts` 589, 592. **Regla innegociable: cambian de forma, no de fondo.
No se debilita ninguna aserción de seguridad por comodidad de la prueba.** Detalle que sale
de ahí: al guardar un apartamento nuevo, **aterriza en la lista con el panel abierto**.

### Claude's Discretion

`08-CONTEXT.md` no declara una sección de discreción. Lo que queda abierto sale del
`08-UI-SPEC.md` y es estrictamente de implementación: la forma exacta de la función definer
nueva, el reparto entre función y PostgREST en la lectura del panel de aseo, la forma final
de las seis aserciones E2E, y si el guardarraíl del criterio 6 es un script o una compuerta
de fase. Este documento recomienda una respuesta para cada uno.

### Deferred Ideas (OUT OF SCOPE)

De `08-UI-SPEC.md` §17, deuda declarada que **no se cierra en esta fase**: el historial que
se acumula al abrir y cerrar paneles en cadena; el enlace a un aseo ya borrado (se reabre en
la Fase 9, con la retención de seis meses); los tres bloques que pierde la ficha de aseadora
sin que nada enlace a dónde se fueron; la navegación entre meses del panel de calendario;
ver más de seis fotos de un aseo; la bitácora del código de acceso del admin; el piso de
alto de 700px aplicado a pantallas anteriores; y el refresco automático de los paneles.

</user_constraints>

---

<phase_requirements>

## Phase Requirements

**Ninguno nuevo.** Esta fase cambia la forma de consultar lo ya entregado, y el detalle de
aseo es lectura nueva sobre datos existentes.

| Requisito ya entregado | Qué le hace esta fase | Soporte de este research |
|---|---|---|
| APTO-11 (lista de apartamentos) | La celda `NOMBRE` cambia de destino a `?apartamento={id}` | Hallazgo 3, Patrón 1 |
| APTO-12 (conexión de calendario) | **No se toca.** La página se queda; el panel de calendario es lectura nueva sobre `calendar_reservations` | Hallazgo 8, Patrón 4 |
| FIN-02 (rentabilidad por aseo) | El panel de aseo enseña las tres cifras del aseo, no del apartamento | Hallazgo 1, Patrón 2 |
| D7-7 (frontera del aseador) | **No se debilita.** La migración nueva repite la guarda de admin como primera sentencia | Hallazgo 1, Security Domain |
| DASH-* (operación del día) | La fila de aseo cambia de `href`, no de estructura | Hallazgo 6, Pitfall 5 |
| PLAT-05 (código de acceso) | El admin lo revela con un gesto en vez de al abrir | Hallazgo 7 |

**Los seis criterios de éxito del ROADMAP y dónde se responden en este documento:**

| # | Criterio | Dónde |
|---|---|---|
| 1 | Abrir no pierde la lista; cerrar devuelve con el mismo scroll y el mismo filtro | **Hallazgo 3** (el riesgo que puede tumbar la fase) |
| 2 | El enlace se pega en un chat y abre lo mismo | **Hallazgo 2** (dos de los cuatro paneles no abren hoy con la validación que manda el UI-SPEC) |
| 3 | El botón atrás cierra el panel, no la sección | Patrón 1 (abrir con `push`, cerrar con `replace`) |
| 4 | Desde Operación se ve en qué va un aseo sin salir del día | **Hallazgo 1** (la migración) |
| 5 | Ninguna aserción de seguridad se debilitó | **Hallazgo 4** (una se debilita sola, por el portal) y Security Domain |
| 6 | La app del aseador no cambió en nada | **Hallazgo 6** (hoy no hay nada que lo afirme) |

</phase_requirements>

---

## Summary

Esta fase se planea mal si se lee como "mover markup a un `Sheet`". Medido contra el repo,
el trabajo real son **cuatro lecturas nuevas, una migración, una Server Action, seis
enlaces que cambian de destino, un directorio que se borra y seis aserciones E2E que hay
que reescribir con más cuidado del que su conteo sugiere**. Tres de los cuatro paneles son
superficies que no existen (§0.1, conflicto C), y el cuarto (aseadora) reemplaza una página
de cuatro bloques por un panel de cinco datos, dos de ellos nuevos.

De todo eso, **una sola cosa toca la base de datos, y es exactamente la que D8-9 anticipó**:
la migración 24 sacó `tarifa_huesped` y `pago_aseador` del grant por columna de
`authenticated` sobre `cleanings` y `properties`. Todo lo demás que el panel de aseo
necesita (estado, fechas, aseador, checklist, fotos, gastos, daños) **ya es legible por el
admin vía PostgREST**, porque las policies `cci_admin_all`, `photos_admin_all`,
`expenses_admin_all` y `damages_admin_all` existen desde la migración 08. Y ninguna de las
seis funciones definer de la migración 26 sirve: `rentabilidad_aseos` filtra
`c.state = 'completada'`, que excluye justo los aseos pendientes y en curso, que son la
razón de existir del panel (*"¿cómo va el 302?"*). Hace falta **una** función nueva, y su
forma está enteramente dictada por las siete reglas que la cabecera de la migración 26 ya
escribió.

El riesgo que de verdad puede tumbar la fase no es la migración: es el criterio 1.
`/apartamentos` tiene `loading.tsx` y su tabla es un componente de cliente con **tres piezas
de estado de filtro en `useState`** (`busqueda`, `cluster`, `soloPendientes`), que es
literalmente "el mismo filtro" que el criterio 1 promete conservar. Y este repo ya midió, en
`/finanzas`, que `loading.tsx` más un cambio de parámetros **colgaba la pantalla** y por eso
ese archivo se borró (commit `e12fb1c`). La documentación de Next y su propio fixture de
pruebas dicen que un cambio solo de `searchParams` no debería remontar nada; `/finanzas/pagos`
lo confirma en producción con su `loading.tsx` puesto. Las dos evidencias apuntan a que va a
funcionar, **y ninguna de las dos es una medición sobre `/apartamentos`**. Eso se mide antes
de partir el trabajo, no después.

**Primary recommendation:** ordenar la fase como schema primero (la migración + sus
aserciones pgTAP), después un spike de medición de 30 minutos sobre `/apartamentos` que
responda si el filtro y el scroll sobreviven a abrir un panel, y **solo entonces** los
cuatro paneles. La lectura del panel de aseo se compone de **una función definer nueva
(cabecera + las tres cifras) más cuatro lecturas PostgREST en paralelo**, que es el reparto
que deja el mínimo posible de superficie corriendo con `rolbypassrls`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| Decidir si un panel está abierto | Frontend Server (RSC) | Browser (`<Link>`) | D8-8: la condición sale de `searchParams`, que el servidor tiene de inmediato. El navegador solo cambia la dirección |
| Validar el identificador del panel | Frontend Server (RSC) | Database | La forma se comprueba con `identificadorValido()` antes de tocar la base (T-07-56); la existencia la decide la base |
| Autorizar la lectura | Database (definer + RLS) | Frontend Server (layout) | El layout de `(admin)` ya exige admin contra el servidor de Auth; la función lo vuelve a comprobar. No hay tercera copia (§10.4 regla 1) |
| Las tres cifras de dinero de un aseo | **Database (definer nueva)** | ninguno | Migración 24: están fuera del grant por columna, y los grants no discriminan usuarios |
| Checklist, fotos, gastos, daños | Database (RLS) | Frontend Server | Las cuatro policies `*_admin_all` ya existen. Meterlas en la definer las sacaría de la RLS sin ganar nada |
| Firmar las fotos | Frontend Server | Storage | El bucket es privado; la ruta es una autorización. `firmarRecibo()` ya lo resuelve y se reutiliza |
| Revelar el código de acceso | Frontend Server (Server Action) | Database (cliente administrativo) | `property_secrets` no tiene grant: la única ruta es la fábrica administrativa, y el guard va antes |
| Conservar el scroll y el filtro al abrir | **Browser** | Frontend Server | `scroll={false}` y la persistencia del `useState` viven en el navegador. El servidor no puede arreglarlo |
| Atrapar el foco y responder a Escape | Browser (Base UI) | ninguno | La primitiva lo da. §12.4: no se reimplementa con un `useEffect` de `keydown` |
| Progreso del checklist (`7/12`) | Frontend Server (dominio puro) | ninguno | `progresoTotal()` ya existe en `lib/domain/checklist.ts` y tiene test de paridad con SQL. Contarlo otra vez en la definer sería una tercera verdad |

---

## Standard Stack

### Core

**Esta fase no instala ni un solo paquete.** Lo que consume, verificado contra el
`package.json` instalado el 2026-09-17:

| Library | Version | Purpose | Why Standard |
|---|---|---|---|
| `next` | **15.5.24** | App Router, `searchParams`, `<Link scroll={false}>` | Pineado por CLAUDE.md. Es quien implementa D8-8 `[VERIFIED: package.json]` |
| `react` | 19.2.8 | `<Suspense>` del panel (§11.1) | Requerido por Next 15.5 `[VERIFIED: package.json]` |
| `@base-ui/react` | **1.7.0** | `Dialog` bajo `components/ui/sheet.tsx` y `dialog.tsx` | Es el drawer del proyecto. §1.2 descarta instalar Vaul `[VERIFIED: package.json]` |
| `@supabase/supabase-js` | 2.112.4 | `.rpc()`, `.from()`, `storage.createSignedUrl()` | `[VERIFIED: package.json]` |
| `@supabase/ssr` | 0.12.5 | `createClient()` de servidor con el JWT del admin | `[VERIFIED: package.json]` |
| `lucide-react` | **1.39.0** | Los 3 iconos nuevos y los 20 reusados | Los 26 de §14.5 existen en la versión instalada `[VERIFIED: import en runtime]` |
| `tailwindcss` | 4.3.3 | `@theme` en `app/globals.css` | Sin `tailwind.config.js` `[VERIFIED: package.json]` |
| PostgreSQL | 17 (Supabase) | La función definer nueva | `[VERIFIED: supabase CLI 2.116.0]` |

### Supporting

| Library | Version | Purpose | When to Use |
|---|---|---|---|
| `zod` | 4.5.4 | Validar el id en `revelarCodigoDeAcceso` | Paso 2 del orden obligatorio de `_actions.ts` |
| `@playwright/test` | 1.62.1 | Las seis aserciones reescritas | Es lo único que puede ver un panel abrirse |
| `vitest` | 4.1.11 | `lib/domain/checkouts.ts` y `lib/domain/feeds.ts` nuevos | Módulos puros: es donde va el test barato |
| `supabase` CLI | 2.116.0 | `supabase test db` para las aserciones pgTAP nuevas | Único mecanismo que prueba la guarda dentro de Postgres |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|---|---|---|
| Una definer nueva para el dinero del aseo | `rentabilidad_aseos(desde, hasta, property, …)` acotada a un día | **No sirve.** Filtra `c.state = 'completada'` (migración 26, línea 508). Un aseo en curso, que es el caso de uso del panel, no saldría nunca |
| Una definer nueva | `tarifas_de_apartamentos([property_id])` | **Viola FIN-01.** La regla 5 de la migración 26 dice literal: *"LAS CIFRAS SALEN DEL ASEO, NUNCA DEL APARTAMENTO"*. Con esto, el panel enseñaría otro número que `/finanzas/aseos` en cuanto alguien edite una tarifa |
| Una definer + 4 lecturas PostgREST | Una sola definer que devuelva todo en `jsonb` | Hay precedente de `returns jsonb` (migraciones 12 y 13), pero es de los RPC del worker de sync, no de lectura de UI. Las nueve funciones de lectura del admin usan `returns table`. Y meter fotos, gastos y daños en la definer los saca de la RLS que hoy los protege, sin ganar una sola garantía |
| Contar el checklist en SQL | `count(*) filter (where done_at is not null)` dentro de la definer | Sería la **tercera** implementación de la misma cuenta. La cabecera de `lib/domain/checklist.ts` ya declara una duplicación con su test de paridad y advierte contra añadir otra |
| `progresoTotal()` sobre las filas leídas | Contar en el componente | Cuarta verdad. Prohibido por la misma cabecera |
| `leerSecretos()` como base de la action nueva | Una consulta propia a `property_secrets` | La consulta propia dispara el guardarraíl 8 de `check-service-role.sh`, que exige la fábrica administrativa en el mismo cuerpo. Delegar es más corto y no lo dispara |
| `esperarUrlDeCliente()` en los E2E | `page.waitForURL()` / `expect(page).toHaveURL()` | **Medido en este repo el 2026-09-13:** los dos sondean dentro del documento y se traban con el commit de React. La URL real llega en ~200 ms; el instrumento decía 20 s y rojo |

**Installation:**

```bash
# Ninguna. Cero paquetes nuevos, cero primitivas de shadcn, cero registries de terceros.
```

---

## Package Legitimacy Audit

**No aplica.** Esta fase **no instala ningún paquete**, no ejecuta `npx shadcn add`, y
`components.json` tiene `"registries": {}` (verificado el 2026-09-15 en el UI-SPEC §16 y
confirmado hoy). Las 8 primitivas que consume (`sheet`, `dialog`, `button`, `badge`,
`separator`, `skeleton`, `alert`, `tooltip`) ya están en `components/ui/`.

**Packages removed due to [SLOP] verdict:** ninguno.
**Packages flagged as suspicious [SUS]:** ninguno.

> Si durante la ejecución alguien propone instalar algo (el candidato obvio es `vaul` por
> la palabra "drawer"), este documento y el UI-SPEC §1.2 se reabren antes, y se corre la
> compuerta de vetting.

---

## Los diez hallazgos, ordenados por riesgo

### Hallazgo 1 (ALTO) · Lo único del panel de aseo detrás de un grant es el dinero, y ninguna función existente lo sirve

**Medido.** La migración 24 (`20260913110000_24_frontera_del_aseador.sql`) hace
`revoke select` de tabla y otorga por columna enumerada:

- `public.cleanings`: 26 de 28 columnas. Fuera: `tarifa_huesped`, `pago_aseador`.
- `public.properties`: 16 de 18. Fuera: las mismas dos.

Todo lo demás que el panel de aseo necesita **ya es legible por el admin con su propio JWT**,
por las policies de la migración 08:

| Tabla | Policy de admin | Grant | Lo que da al panel |
|---|---|---|---|
| `public.cleanings` | `cleanings_admin_all` (271) | 26 columnas | estado, fechas, `aseador_id`, `is_managed`, `started_at`, `finished_at` |
| `public.cleaning_checklist_items` | `cci_admin_all` (387) | tabla | `done_at`, `room_label`, `task_label`, `sort_order` → el `7/12` |
| `public.cleaning_photos` | `photos_admin_all` (455) | tabla | `storage_bucket`, `storage_path`, `kind`, `deleted_at` |
| `public.expenses` | `expenses_admin_all` (407) | tabla | concepto, monto, moneda |
| `public.damages` | `damages_admin_all` (397) | tabla | descripción |
| `storage.objects` | `evidencia_admin_all` (mig. 10, línea 76) | n/a | firmar cualquier objeto del bucket |

**Ninguna de las seis definers de la migración 26 sirve, y las dos candidatas fallan por
razones distintas:**

| Candidata | Por qué no |
|---|---|
| `rentabilidad_aseos(date, date, uuid, uuid, text)` | Su `where` incluye `c.state = 'completada'`. El panel existe para responder *"¿cómo va el 302?"*, o sea para un aseo **en curso**. Nunca devolvería esa fila |
| `tarifas_de_apartamentos(uuid[])` | Devuelve `properties.tarifa_huesped`, no `cleanings.tarifa_huesped`. Usarlo rompe FIN-01: el snapshot congelado por `tg_cleanings_snapshot()` y el valor vivo del apartamento divergen en cuanto alguien edita una tarifa, y el panel enseñaría otro número que `/finanzas/aseos` para el mismo aseo |

**Conclusión: hace falta UNA función definer nueva, y solo para el dinero más la cabecera.**
Ver Patrón 2 para su forma exacta y Code Example 1 para el esqueleto.

---

### Hallazgo 2 (ALTO) · "Validar el identificador contra lo que la página ya leyó" solo funciona en dos de los cuatro paneles

`08-UI-SPEC.md` §5.1 regla 4 y §11.4 mandan copiar de `/finanzas/pagos` esto:

> *"La página servidor valida el identificador contra lo que ya leyó, no contra la base."*

Ese patrón funciona en `pagos` **por una propiedad que esa pantalla tiene y otras dos no**:
`pagos/page.tsx` lee TODOS los periodos y TODOS sus pagos antes de mirar `?pago=`. Medido
página por página:

| Panel | Anfitrión | Qué lee el anfitrión | ¿Contiene siempre el id? |
|---|---|---|---|
| Apartamento | `/apartamentos` | `listarApartamentos()` → **las 39 filas**, sin filtro | ✅ **Sí.** El patrón se copia tal cual |
| Pago (precedente) | `/finanzas/pagos` | todos los periodos y todos sus pagos | ✅ Sí |
| **Aseo** | `/operacion` | `leerOperacion()` → `scheduled_date` entre **hoy−7 y hoy+6** (`VENTANA_ATRAS_DIAS = 7`, `HORIZONTE_DIAS = 6`) | ❌ **No.** Un aseo de hace tres semanas es válido, existe, y **no está en la lista** |
| **Aseadora** | `/finanzas` | `costo_por_aseadora(desde, hasta)` → solo personas **con aseos o gastos en el rango filtrado** | ❌ **No.** Con el filtro en `día`, una aseadora que no trabajó ese día no sale |

**Consecuencia medible, y choca de frente con el criterio 2 del ROADMAP** (*"el enlace de
esa ficha se puede pegar en un chat y abre lo mismo"*): en dos de los cuatro paneles, un
enlace perfectamente válido abriría la pantalla **sin panel y sin decir por qué**, y la
causa no sería que el dato no existe sino que la lista de al lado estaba filtrada.

**Resolución propuesta, y conserva los cuatro comportamientos visibles que §11.4 exige:**

- `/apartamentos?apartamento=` y `/finanzas/pagos?pago=` → **contra lo ya leído**, sin cambio.
- `/operacion?aseo=` → contra **la función definer nueva**. Cero filas significa que no
  existe o que no se puede ver, y el panel no se renderiza.
- `/finanzas?aseadora=` → contra **`leerAseadoraDeLaFicha()`**, que ya existe
  (`lib/data/finanzas-detalle.ts:323`), filtra por `role = 'aseador'` y devuelve `null`
  indistintamente para "no existe" y "no lo puedes ver".

Los cuatro puntos de §11.4 se cumplen igual: no hay 404, no hay toast, no hay panel vacío,
no se limpia el parámetro huérfano. Lo único que cambia es **contra qué** se comprueba, y el
argumento del comentario de `pagos/page.tsx` sigue siendo literal: *"No es una frontera de
seguridad, sino de comportamiento"*. El coste es **una consulta extra, y solo cuando el
parámetro está presente**.

> Esto no reabre D8-8. D8-8 fija que el panel vive en la dirección y cómo se cierra. La
> regla 4 de §5.1 es una afirmación mecánica sobre un patrón, y el código la contradice en
> dos de los cuatro casos.

---

### Hallazgo 3 (ALTO) · El criterio 1 depende de dos comportamientos de Next que este repo ya vio romperse una vez

**Este es el hallazgo que decide cómo se parte la fase.**

El criterio 1 promete: *"cerrar devuelve exactamente donde estabas, con el mismo scroll y el
mismo filtro"*. Medido:

1. **`app/(admin)/apartamentos/loading.tsx` existe.** También existe
   `app/(admin)/operacion/loading.tsx` y `app/(admin)/finanzas/pagos/loading.tsx`.
2. **`TablaApartamentos.tsx` es `'use client'` y el filtro vive en `useState`, no en la
   dirección:** `busqueda`, `cluster` y `soloPendientes` (líneas 119 a 121). Ese es
   exactamente "el mismo filtro" del criterio 1.
3. **`app/(admin)/finanzas/page.tsx` NO tiene `loading.tsx`, y lo dice en una cabecera de
   40 líneas:** lo tuvo, y con el archivo puesto *"al cambiar de rango la transición no
   terminaba nunca: `aria-busy` se quedaba en `true` para siempre"*. Aislado con ocho
   corridas: **sin el archivo 15 de 15 casos en verde; con él, dos rojos reproducibles.**
   La cabecera afirma que `loading.tsx` *"también se aplica cuando solo cambian los
   parámetros de la consulta"*.

**Y la evidencia externa dice lo contrario:**

- La doc de `<Link>` de Next 15.4: `scroll` vale `true` por defecto y *"Next.js attempts to
  maintain scroll position or scroll to the top of the first page element if not visible"*;
  `scroll={false}` desactiva ese comportamiento. No distingue navegación de ruta de
  navegación solo de parámetros `[CITED: github.com/vercel/next.js/blob/v15.4.0-canary.82/docs/01-app/05-api-reference/02-components/link.mdx]`.
- El propio repositorio de Next tiene un fixture de pruebas llamado
  `test/e2e/app-dir/searchparams-reuse-loading/` cuyo layout hace
  `<Fragment key={searchParams?.get('q')}>` **precisamente para forzar** que un cambio de
  parámetros remonte el subárbol y dispare el fallback de `loading.tsx`. Si hiciera falta
  forzarlo, por defecto **no ocurre**, y el `useState` del cliente sobrevive
  `[CITED: github.com/vercel/next.js test/e2e/app-dir/searchparams-reuse-loading/app/search/layout.tsx]`.

**Y hay un contraejemplo interno que apunta al mismo lado:** `/finanzas/pagos` tiene
`loading.tsx` **y** el panel `?pago=` funciona en producción desde la Fase 7, con
`BloquePeriodoCerrado` conservando su estado de acordeón detrás.

**Lectura honesta de las tres piezas:** lo más probable es que la diferencia no sea
`loading.tsx` sino **quién navega**. `/finanzas` navega con `router.push` dentro de
`useTransition` (`FiltroPeriodo.ir()`); `/finanzas/pagos` navega con un `<Link>`. Esta fase
usa `<Link>` en los seis enlaces. **Probable no es medido.**

**Qué hacer, y es una tarea del plan, no una nota:** un spike de Wave 0 sobre
`/apartamentos`, con el panel más tonto posible (un `Sheet` que solo pinte el nombre), que
responda las tres preguntas por separado:

```
1. Abrir el panel con <Link scroll={false}>:
   ¿el <Skeleton> de apartamentos/loading.tsx aparece?   (si aparece → el subárbol se remonta)
   ¿la búsqueda escrita en el filtro sigue escrita?      (criterio 1, mitad "filtro")
   ¿la barra de scroll sigue en la fila 28?              (criterio 1, mitad "scroll")
2. Cerrar con router.replace(ruta, { scroll: false }):
   las mismas tres.
3. Lo mismo en /operacion, que también tiene loading.tsx y además tiene Realtime.
```

**Si el filtro se pierde**, hay dos salidas y ninguna reabre una decisión del dueño: mover
el filtro de `TablaApartamentos` a `searchParams` (que además lo haría enlazable, en la
línea de D8-8), o envolver solo la lectura en un `<Suspense>` con una `key` que **no**
dependa de los parámetros, que es literalmente el arreglo que la cabecera de
`/finanzas/page.tsx` dejó anotado. Lo que **no** se puede hacer es descubrirlo en la Wave 3.

---

### Hallazgo 4 (ALTO) · El panel se portalea fuera de `<main>`, y eso vacía sola una aserción de seguridad de la Fase 7

**Medido en `components/ui/sheet.tsx`:** `SheetContent` envuelve su `Popup` en
`<SheetPortal>`, que es `Dialog.Portal` de Base UI. El contenido del panel **no vive dentro
de `<main>`**: sale a `document.body`.

`e2e/finanzas.spec.ts:631` afirma, sobre la ficha de aseadora que esta fase convierte en
panel:

```ts
const pagina = (await paginaAdmin.locator('main').textContent()) ?? '';
expect(pagina, 'ninguna palabra de rastreo en la ficha (§8.4)').not.toMatch(
  /ubicaci[oó]n|coordenad|GPS|en l[ií]nea|última vez activa/i,
);
await expect(paginaAdmin.locator('main').getByRole('img', { name: /mapa/i })).toHaveCount(0);
```

Con el contenido en un portal, `locator('main')` **ya no ve nada del panel**. Las dos
aserciones seguirían en verde **sin mirar lo que dicen que miran**. Eso es exactamente el
"falso verde por vacuidad" que la Fase 2 catalogó y que `check-service-role.sh` documenta en
su guardarraíl 8, y es **debilitar una aserción por comodidad de la prueba**, que es lo que
D8-11 declara innegociable, solo que sin que nadie lo decida.

**Resolución:** las dos aserciones cambian su ámbito al diálogo, no a `main`:

```ts
const panel = paginaAdmin.getByRole('dialog');
const texto = (await panel.textContent()) ?? '';
expect(texto, 'ninguna palabra de rastreo en el panel (§9.2)').not.toMatch(/…/i);
await expect(panel.getByRole('img', { name: /mapa/i })).toHaveCount(0);
```

**Y hay que revisar el resto de la suite con el mismo ojo**, porque este defecto no es de esa
línea sino del cambio de página a portal: cualquier aserción que acote por `main`, por el
`<table>` de la página o por un contenedor del layout deja de ver el panel. El plan necesita
un paso explícito de barrido por `locator('main')` y por contenedores de página en los seis
archivos que toca.

---

### Hallazgo 5 (MEDIO-ALTO) · Las seis aserciones de D8-11 no son seis líneas: dos de ellas afirman cosas que el panel no puede afirmar

D8-11 cuenta bien **dónde** se rompe. Lo que el conteo no dice es **cuánto** hay dentro de
cada una. Leídas:

| Punto | Qué afirma hoy | En qué se convierte, sin perder el fondo |
|---|---|---|
| `apartamento-crud:149` | `waitForURL(/\/apartamentos\/[0-9a-f-]{36}$/)`, después `reload()`, después `heading level 1 = nombre` + `Incompleta` + fila inactiva en base | `esperarUrlDeCliente(p, /\/apartamentos\?apartamento=[0-9a-f-]{36}$/)`, **después `goto('/apartamentos/' + id)`**, y de ahí abajo **sin tocar**. El `h1` de la lista es `Apartamentos`, no el nombre: sin el `goto`, la aserción de persistencia se cae por una razón que no es la suya |
| `apartamento-crud:191` | La misma espera, y después **9 campos de `properties` por `getByLabel` más 3 secretos**, todos del formulario | Igual: espera nueva + `goto` al formulario. **Ninguno de esos 12 campos existe en el panel** (§7.2 muestra 9 datos, ninguno como campo de formulario). Esta es la que más lejos está de ser un cambio de regex |
| `apartamento-crud:285` | La misma espera, y después `Activa` + `is_active` en base + desactivar desde el menú de la tabla | Igual. **Oportunidad:** en vez del `goto`, pulsar el botón `Editar` del panel, que de paso ejerce la única CTA primaria de la fase |
| `apartamento-cuartos:146` | Dentro del helper `crearBorrador()`, que devuelve el id leído de la base | Solo cambia la espera. `idPorNombre` / la consulta de servicio **no se tocan** (regla 2 de §5.4). Es la única de las cuatro que sí es un cambio de una línea |
| `finanzas:589` | `waitForURL(/\/finanzas\/aseadoras\//)` | `esperarUrlDeCliente(p, /aseadora=/)`. **La aserción `toHaveURL(ancla=…)` de la línea siguiente se conserva tal cual**: es la que comprueba que abrir un panel no le cambia el periodo al admin |
| `finanzas:592` | Los cuatro títulos de bloque, **más `lo que cuesta en el periodo`, más `Todos sus periodos cerrados`, más ≥2 rótulos `Del …`, más los tres estados de `Ahora mismo`, más `Al momento de abrir esta página.`, más las dos de no rastreo** | Los cuatro títulos pasan a los cuatro encabezados de §9.1. **Tres aserciones mueren con la página** (la etiqueta de cabecera y las dos del bloque de pagos: §0.1 conflicto B lo decidió). **`Al momento de abrir esta página.` también muere**, porque §17.8 prohíbe esa línea en el panel. Las dos de no rastreo cambian de ámbito (Hallazgo 4) |

**El instrumento correcto ya existe y nadie lo usa.** `e2e/fixtures.ts:365` exporta
`esperarUrlDeCliente(pagina, patron, ms)`, escrita durante el arreglo de la Fase 7, con esta
cabecera medida el 2026-09-13:

> *"Cuando la prueba espera ese cambio con `page.waitForURL()` o con
> `expect(page).toHaveURL()`, LA TRANSICIÓN NO SE COMPLETA NUNCA: medido con un plazo de 20
> segundos, la aserción seguía viendo la URL vieja. […] Sondeando `page.url()` desde Node,
> aparece a los ~200 ms."*

Un `grep` sobre `e2e/*.spec.ts` devuelve **cero usos**. Esta fase es su primer consumidor.
Y la propia cabecera dice cómo se usa: *"Esto NO es la aserción, es la espera. La aserción
sobre la URL se escribe después, y se sigue escribiendo."*

**Pérdida declarada que el plan tiene que reconocer, no esconder:** `Al momento de abrir
esta página.` era la aserción que fijaba D-14 (un dato operativo que parece vivo y no lo
está es peor que uno fechado). §17.8 decide con argumento que en un panel no se escribe.
Borrar esa aserción es correcto **y** es una cobertura que se pierde; queda en la deuda,
no se sustituye por otra cosa.

---

### Hallazgo 6 (MEDIO) · Hoy no existe ningún guardarraíl que pueda afirmar el criterio 6

**Medido.** `scripts/ci/check-escala-movil.sh` **no verifica que la app del aseador no
cambie**. Verifica una invariante distinta: que ninguna clase tipográfica bajo
`app/(cleaner)/` vaya sin el sufijo `-movil`, porque iOS Safari hace zoom automático bajo
16px. Si esta fase no toca ese árbol, el script sale `OK` diciendo exactamente nada.

Los tres guardarraíles encadenados en `npm run ci:arch` son:

| Script | Qué afirma | ¿Sirve al criterio 6? |
|---|---|---|
| `check-service-role.sh` | 10 invariantes de servidor (clave de servicio, guards, `property_secrets`, `raw_description`, fechas) | No |
| `check-max-w-tallas.sh` | Ninguna clase `max-w-<talla>` ni `min-w-<talla>` bajo `app/`, `components/`, `lib/` | No |
| `check-escala-movil.sh` | Escala tipográfica bajo `app/(cleaner)/` | No |

**Resolución propuesta, y no es un script nuevo.** Un guardarraíl permanente para una regla
de alcance de una fase es un archivo que nadie va a poder borrar después. Lo correcto son
**dos compuertas, una barata y una que de verdad protege:**

1. **Compuerta de fase, en la verificación del plan** (no en `ci:arch`):
   ```bash
   git diff --name-only $(git merge-base HEAD main)..HEAD -- 'app/(cleaner)'
   # tiene que salir vacío. Es la comprobación literal que §2.3 del UI-SPEC propone.
   ```
2. **La que de verdad importa, y es la del criterio 5:** las aserciones pgTAP nuevas que
   afirman que una aseadora recibe `42501` de la función definer nueva, y que el admin sí
   obtiene fila. Un diff vacío dice que no se tocó el árbol; solo el pgTAP dice que la
   frontera sigue cerrada. Ver Validation Architecture.

Y una tercera, gratis: las cinco suites del aseador (`aseo-checklist`, `aseo-ejecucion`,
`aseo-evidencia`, `mis-pagos`, `push-instalacion`) tienen que seguir en verde **sin que se
les toque una línea**. Un diff vacío en `e2e/` de esas cinco es evidencia de comportamiento.

---

### Hallazgo 7 (MEDIO) · El código de acceso: §7.3 es correcto, verificado, y tiene una trampa que no está escrita

**La afirmación del UI-SPEC §7.3 queda VERIFICADA contra el código, en sus dos mitades:**

| Afirmación | Evidencia |
|---|---|
| *"El camino del admin es `exigirAdmin()` más cliente administrativo, y no audita nada"* | `app/(admin)/apartamentos/_actions.ts:792` `leerSecretos(id)`: `exigirAdmin()` → Zod → `createAdminClient()` → `select` sobre `property_secrets`. **Ni un `insert`** |
| *"En el árbol del aseador esa frase es verdad porque el camino es `reveal_access_code()`, que escribe en la bitácora en la misma transacción"* | Migración 09, línea 142: `insert into public.access_code_reads (property_id, cleaning_id, read_by)`, **antes** del `return query`, con la razón escrita: *"No puede existir lectura de código sin rastro (T-01-48)"* |
| El único escritor de la bitácora | `grep -rn access_code_reads` sobre `.sql` y `.ts`: el único `insert` del sistema es el de la migración 09. El resto son grants, policies, comentarios, `delete` de limpieza en suites pgTAP y aserciones |

**Por lo tanto: escribir `Cada vez que lo abres queda registrado.` en el panel del admin
sería una mentira literal. §7.3 tiene razón y la prohibición se respeta.**

**La trampa que no está escrita, y muerde en la primera línea de la action nueva:**

`leerSecretos()` devuelve **cuatro** credenciales: `codigo_acceso`, `tipo_cerradura`,
`notas_acceso` **y `ical_url`**. La `ical_url` es la otra credencial de esa tabla, y su
propia cabecera lo dice: *"un GET a esa segunda revela la ocupación completa del apartamento
sin autenticarse"*. Si `revelarCodigoDeAcceso` devuelve lo que `leerSecretos` le da, **la URL
del calendario viaja al navegador en la respuesta de la action**, que es exactamente lo que
§8.2 prohíbe para el panel de calendario (*"La URL iCal no aparece en este panel, ni siquiera
enmascarada"*), conseguido por la puerta de al lado.

**Contrato para la action nueva:**

```
exigirAdmin()  →  Zod sobre el id  →  leerSecretos(id)  →  proyectar a DOS campos
                                                            { codigo_acceso, tipo_cerradura }
```

Y dos consecuencias de guardarraíl, verificadas leyendo el `awk` de los scripts:

- **Guardarraíl 7** (guard antes de la fábrica) recorre funciones que llaman
  `createAdminClient()` en su propio cuerpo. La action nueva **delega** en `leerSecretos()`,
  así que el guardarraíl no ve nada en ella. **Eso no la exime:** una Server Action es un
  endpoint HTTP público y `exigirAdmin()` va igual, como primera sentencia. Es la clase de
  hueco que el propio script llama *"falso verde por AUSENCIA"* en su guardarraíl 8.
- **Guardarraíl 8** (la tabla de secretos solo con la fábrica) busca el literal
  `property_secrets` dentro de cuerpos de función. La action nueva no lo nombra, así que
  tampoco se dispara. **Y si alguien "simplifica" escribiendo la consulta a mano, sí se
  dispara**, que es lo correcto.

**Dato de contexto que conviene tener delante:** hoy el código **ya está en el DOM** de
`/apartamentos/[id]`, en claro, con su razón escrita en `FormularioApartamento.tsx:646`
(*"el admin lo está editando y tiene que poder leerlo para comprobarlo"*). §7.3 no cierra una
fuga existente: evita abrir una **segunda superficie, más expuesta**, porque su dirección es
compartible por diseño.

---

### Hallazgo 8 (MEDIO) · `lib/domain/feeds.ts` no existe, y `saludDelFeed()` tampoco

`08-UI-SPEC.md` §14.4 dice: *"`lib/domain/feeds.ts` — **Ya existe.** `saludDelFeed()` para
los tres estados de §8.2"*. **Medido: es falso.**

- `ls lib/domain/ | grep feed` → solo `feed.integration.test.ts`.
- `grep -rn saludDelFeed` en todo el repo → cero resultados.
- Lo que sí existe es `lib/domain/salud-sync.ts`, con `estadoDeSincronizacion(maxLastSuccessAt, ahoraMs)`,
  que responde **otra pregunta**: si la sincronización **del sistema entero** está caída
  (umbral de 3 horas sobre el `max(last_success_at)` de todos los feeds activos). No dice
  nada de un feed concreto.
- Y `lib/data/feeds.ts` existe, pero es capa de datos: `leerFeedDeApartamento()`,
  `registrarSaludDelFeed()`, `resumirFallo()`. Ninguna deriva los tres estados de §8.2.

**Consecuencia para el plan:** los tres estados del grupo `CALENDARIO` (`✓ Conectado`,
`⚠ {N} fallos seguidos`, `Sin conectar`) son **lógica nueva**, y por la disciplina del repo
van en un módulo puro con test unitario, no en el componente. El módulo es
`lib/domain/feeds.ts`, y nace en esta fase.

La entrada viene de `FeedDeApartamento` (`lib/data/feeds.ts:47`), que ya trae `is_active`,
`consecutive_failures` y `last_success_at`. La derivación es de tres ramas, y el orden
importa por la misma razón que en `estadoDeAseo()`: se mira primero la **ausencia** del feed
(`null`), después los fallos, y solo entonces se dice `Conectado`.

---

### Hallazgo 9 (MEDIO) · El panel de aseadora hereda dos comportamientos de `/finanzas` que nadie diseñó para él

El panel de aseadora vive en `/finanzas`, y en esa página **todo el contenido es hijo de
`FiltroPeriodo`**, que es un componente de cliente que envuelve a los bloques del servidor.
Dos consecuencias medidas:

**(a) El filtro atenúa a sus hijos y les quita los eventos.** La cabecera de
`FiltroPeriodo.tsx` dice: *"El contenedor de los bloques se marca como ocupado y se atenúa"*.
Si el panel se renderiza **dentro** de `children`, entonces cambiar de periodo con el panel
abierto lo deja atenuado y, con `pointer-events-none`, **sin poder cerrarse**. Y §11.1
prohíbe por nombre atenuar durante la apertura del panel. **Resolución: el panel se renderiza
como hermano de `<FiltroPeriodo>`, no como hijo.** El portal de Base UI lo saca del DOM de
todas formas, pero la posición en el árbol de React es la que decide si recibe la clase.

**(b) `FiltroPeriodo.ir()` conserva los parámetros que no gobierna.** Su código parte de
`new URLSearchParams(parametros.toString())` y solo pisa `rango` y `ancla`. Eso es bueno para
la regla 3 de §5.1 (el periodo sobrevive al abrir el panel) **y tiene el efecto espejo que
nadie decidió**: con el panel abierto, cambiar de periodo **deja el panel abierto**. Hay que
decidirlo a propósito. La lectura coherente con D8-1 es que sí se queda: la selección no
cambió, solo el periodo de la pantalla de atrás.

**(c) Y hay una ambigüedad de vocabulario que el plan tiene que cerrar.** §9.2 dice
`EN EL PERIODO ABIERTO` y D8-4 dice *"lo que lleva ganado en el periodo abierto"*. **Eso NO
es el `rango`/`ancla` del filtro.** En este producto "periodo abierto" es el periodo de pago
todavía sin cerrar, y ya tiene su lectura: `leerPeriodoPendienteDeCierre()`
(`lib/data/pagos.ts:251`). Si el panel usara el rango del filtro, con el filtro en `día` diría
"lleva ganado" un número de un día, que no es lo que la etiqueta promete. **Recomendación:**
`leerPeriodoPendienteDeCierre()` para obtener `{desde, hasta}`, y con eso
`leerCostoPorAseadora()`, de donde salen `costo`, `aseos` y `gastos`, que son exactamente los
tres números de §9.2 y los mismos que ya pinta `FilaAseadora`. Caso borde a cubrir: si no hay
ningún periodo abierto, el grupo pinta su línea de vacío.

---

### Hallazgo 10 (BAJO) · Borrar `/finanzas/aseadoras/[id]` cuesta un enlace, y nada estructural depende de él

Barrido completo (`grep -rn "finanzas/aseadoras"`, excluyendo `.next/` y `.planning/`):

| Sitio | Qué es | Qué hay que hacer |
|---|---|---|
| `FilaAseadora.tsx:77` | **El único enlace entrante del producto.** `href={/finanzas/aseadoras/${id}?rango=${rango}&ancla=${ancla}` | Pasa a `?aseadora={id}` conservando `rango` y `ancla`, y gana `scroll={false}` |
| `app/(admin)/finanzas/aseadoras/[id]/page.tsx` + `loading.tsx` | La página y su esqueleto | **Se borra el directorio entero**, los dos archivos |
| `SubNavFinanzas.tsx:33` | Comentario | El predicado de `Resumen` está escrito como **exclusión** (`ruta === '/finanzas' \|\| !ruta.startsWith('/finanzas/pagos')`) precisamente *"para que una ruta nueva del Resumen no nazca sin marcar nada"*. **Sigue funcionando sin tocar una línea de lógica.** Solo el comentario queda desactualizado |
| `TopNav.tsx:41` | Comentario | La activación marca todas las subrutas de `/finanzas`. No se toca |
| `e2e/finanzas.spec.ts:24` | Comentario de cabecera | Se actualiza junto con las aserciones del Hallazgo 5 |

**Lo que se pierde de verdad no es código, es cobertura:** con la página se van
`leerAseosDeAseadora()`, `leerGastosDeAseadora()`, `leerPagosDeAseadora()` y
`costoDeLaFicha()` de `lib/data/finanzas-detalle.ts` como consumidores en producción. Las
funciones de la base (`aseos_de_aseadora`, `gastos_de_aseadora`) **se quedan en el schema sin
ningún llamador**. Decisión para el plan: dejarlas (tienen aserciones pgTAP que las ejercen y
borrarlas es una migración que nadie pidió) y **anotarlo**, o el próximo que audite el schema
va a encontrar dos funciones huérfanas sin razón escrita. Recomendación: dejarlas, con un
comentario en el plan de la fase.

---

## Architecture Patterns

### System Architecture Diagram

```
                    ┌─────────────────────────────────────────────┐
  ENTRADA 1         │  navegador del admin                        │
  clic en una fila  │                                             │
  ────────────────► │  <Link href="?apartamento=X" scroll={false}> │
                    │  <Link href="?aseo=X"        scroll={false}> │
  ENTRADA 2         │  <Link href="?aseadora=X"    scroll={false}> │
  URL pegada        │                                             │
  en un chat        │  cerrar: router.replace(base,{scroll:false}) │
  ────────────────► └───────────────────┬─────────────────────────┘
                                        │ searchParams
                                        ▼
        ┌───────────────────────────────────────────────────────────────┐
        │  PÁGINA SERVIDOR  (RSC, force-dynamic por el layout de admin)  │
        │                                                               │
        │  1. lee los params que ya gobernaba  (alertas · rango · ancla) │
        │  2. lee el param del panel                                    │
        │  3. identificadorValido()  ── forma mala ──► sin panel         │
        └───────────────────┬───────────────────────────────────────────┘
                            │ id con forma válida
                            ▼
        ┌───────────────────────────────────────────────────────────────┐
        │  ¿CONTRA QUÉ SE COMPRUEBA QUE EXISTE?   (Hallazgo 2)           │
        │                                                               │
        │   apartamento ──► contra las 39 filas ya leídas  (sin viaje)   │
        │   pago        ──► contra los pagos ya leídos     (sin viaje)   │
        │   aseo        ──► contra la definer nueva        (1 viaje)     │
        │   aseadora    ──► contra leerAseadoraDeLaFicha() (1 viaje)     │
        └───────────────────┬───────────────────────────────────────────┘
                            │ existe
                            ▼
        ┌───────────────────────────────────────────────────────────────┐
        │  <Suspense fallback={<EsqueletoDePanel/>}>   (§11.1)           │
        │    el Sheet monta en el MISMO render; los datos llegan después │
        └───────────────────┬───────────────────────────────────────────┘
                            │
        ┌───────────────────┴──────────────────────────────────────────┐
        │                        LECTURA                                │
        ▼                                                               ▼
┌────────────────────────┐                        ┌──────────────────────────────┐
│  VÍA RLS (PostgREST)   │                        │  VÍA FUNCIÓN DEFINER          │
│  JWT del admin         │                        │  guarda de admin 1ª sentencia │
│                        │                        │                              │
│  properties            │                        │  detalle_de_aseo(uuid)  NUEVA │
│  calendar_reservations │                        │   └─ cleanings.tarifa_huesped │
│  calendar_feeds        │                        │      cleanings.pago_aseador   │
│  profiles              │                        │      (fuera del grant, mig.24)│
│  cleaning_checklist_…  │                        │                              │
│  cleaning_photos       │                        │  tarifas_de_apartamentos()    │
│  expenses / damages    │                        │  aseo_en_curso_de_aseadora()  │
│                        │                        │  costo_por_aseadora()         │
│  policies *_admin_all  │                        │  periodos_de_pago()           │
└───────────┬────────────┘                        └───────────┬──────────────────┘
            │                                                 │
            │  bucket + ruta, NUNCA una URL                    │
            ▼                                                 │
┌────────────────────────┐                                     │
│  STORAGE (privado)     │                                     │
│  firmarRecibo()        │                                     │
│  createSignedUrl, 300s │                                     │
│  policy evidencia_…    │                                     │
└───────────┬────────────┘                                     │
            └──────────────────┬──────────────────────────────┘
                               ▼
            ┌──────────────────────────────────────────────┐
            │  PanelLectura  →  portal a document.body      │
            │  (NO dentro de <main>. Hallazgo 4)            │
            └──────────────────────────────────────────────┘

  FUERA DE ESTE DIAGRAMA, Y A PROPÓSITO:
  · el código de acceso, que no viaja hasta que alguien pulsa `Mostrar`
    (Server Action → exigirAdmin → Zod → leerSecretos → 2 campos)
  · todo app/(cleaner)/, que no aparece en ninguna flecha (criterio 6)
```

### Recommended Project Structure

```
supabase/
├── migrations/
│   └── 20260917xxxxxx_28_detalle_de_aseo.sql   # la única migración de la fase
└── tests/
    └── 11_financiero.test.sql                  # bloque nuevo AL FINAL, sube plan()

lib/
├── domain/
│   ├── checkouts.ts        # NUEVO · proximoCheckout, checkoutsDelMes (puro + test)
│   ├── feeds.ts            # NUEVO · los 3 estados de §8.2 (Hallazgo 8)
│   └── checklist.ts        # SE REUSA · progresoTotal, sin tocar
└── data/
    ├── panel-aseo.ts       # NUEVO · la definer + las 4 lecturas en paralelo
    ├── panel-apartamento.ts # NUEVO · próximo aseo, checkouts del mes
    ├── panel-aseadora.ts   # NUEVO · asignaciones + periodo abierto
    ├── apartamentos.ts     # SE AMPLÍA · 4 columnas más en COLUMNAS_DE_LISTA
    ├── finanzas-detalle.ts # SE REUSA · leerAseadoraDeLaFicha, leerAhoraMismo, identificadorValido
    ├── pagos.ts            # SE REUSA · leerPeriodoPendienteDeCierre
    └── recibos.ts          # SE REUSA · firmarRecibo, VIDA_DE_LA_FIRMA_SEGUNDOS

app/(admin)/
├── _components/            # PanelLectura · GrupoDePanel · FilaDeDato · EsqueletoDePanel
├── apartamentos/
│   ├── page.tsx            # lee apartamento + vista
│   ├── _actions.ts         # revelarCodigoDeAcceso + destino del redirect
│   └── _components/        # PanelApartamento · PanelCalendario · CodigoDeAccesoAdmin
├── operacion/
│   ├── page.tsx            # lee aseo, CONSERVA alertas
│   └── _components/        # PanelAseo · TiraDeEvidencia · DialogoFoto
└── finanzas/
    ├── page.tsx            # lee aseadora, CONSERVA rango y ancla
    ├── _components/        # PanelAseadora
    └── aseadoras/[id]/     # ◄── SE BORRA EL DIRECTORIO ENTERO
```

### Pattern 1 · El panel en la dirección, con `push` al abrir y `replace` al cerrar

**Qué:** el estado de apertura vive en `searchParams`, lo lee la página servidor, y el
componente de cliente solo sabe cerrar.

**Cuándo:** los cuatro paneles, sin excepción.

**Las cuatro piezas, con la evidencia de cada una:**

1. **Abrir es un `<Link>` sin `replace`.** `TablaPagosDelPeriodo.tsx:135` hoy lleva
   `replace`, y por eso el botón atrás con el panel abierto **saca de la sección**. §5.2 lo
   resolvió: abrir con `push`, o sea quitar esa prop. Es lo que hace verdadero el criterio 3.
2. **Los seis enlaces llevan `scroll={false}`.** La doc de Next confirma que el prop gobierna
   la navegación, no el tipo de navegación
   `[CITED: nextjs docs link.mdx]`. Sin él, abrir manda la lista al tope y **cerrar ya no
   puede recuperar** el sitio que se perdió al abrir.
3. **Cerrar es `router.replace(rutaBase, { scroll: false })`,** literal (D8-8), y
   `rutaBase` tiene que **reconstruirse con los parámetros que el panel no gobierna**, no
   ser una constante. En `/finanzas/pagos` la constante `'/finanzas/pagos'` funciona porque
   esa ruta no tiene más parámetros. En `/operacion` hay `alertas` y en `/finanzas` hay
   `rango` y `ancla`: cerrar con una constante los borra, y la regla 3 de §5.1 lo prohíbe.
4. **`key={id}` en el panel, desde la página.** Ya está documentado en `pagos/page.tsx`:
   sin ella, abrir un segundo panel reutiliza el árbol del primero, no vuelve a hacer su
   entrada y no recoloca el foco.

**El punto 3 es el que se cae solo si se copia `SheetDesglosePago` sin leerlo.** Ver Code
Example 3.

### Pattern 2 · La función definer de lectura, con las siete reglas de la migración 26

**Qué:** una función `security definer` con `set search_path = ''`, guarda de admin como
primera sentencia ejecutable, y su par `revoke`/`grant` pegado a la definición.

**Cuándo:** solo cuando el dato está fuera del grant por columna. En esta fase: **una vez**.

Las siete reglas están escritas en la cabecera de
`20260913130000_26_lecturas_financieras.sql` y aplican sin modificación:

1. `security definer set search_path = ''`, todo nombre calificado por esquema.
2. **La guarda de admin es la PRIMERA sentencia ejecutable del cuerpo**, con `42501`. La
   razón, literal: *"una función definer propiedad de `postgres` corre con `rolbypassrls = t`
   y SALTA LA SEGURIDAD A NIVEL DE FILA ENTERA"*.
3. **Filtro de gestión propia explícito**, sin apoyarse en que los informativos tienen las
   cifras nulas por `cl_unmanaged_is_inert`. *"Un conteo no se salva por un nulo."*
4. **Todos los montos declarados `bigint` y casteados en el cuerpo**, o `supabase-js` los
   entrega como cadena.
5. **Las cifras salen del aseo, nunca del apartamento** (FIN-01).
6. **La pertenencia al periodo sale de `public.dia_bog(finished_at)`**, nunca de una
   conversión sin zona.
7. **Par de `revoke` + `grant` pegado a cada definición**, porque en PG 17
   `alter default privileges` no puede quitarle `EXECUTE` a `PUBLIC`.

**Las tres trampas del mismo archivo, las tres medidas en este repo:**

| Trampa | Qué pasa |
|---|---|
| `coalesce` y `nullif` **NO** se califican con `pg_catalog` | Son construcciones del lenguaje SQL, no funciones. Calificarlas revienta con *"function does not exist"* en un cuerpo con el camino de búsqueda vacío. **Costó un error en la migración 22** |
| Las funciones **de verdad** sí se califican | `pg_catalog.btrim(...)`, tal como lo hace `costo_por_aseadora`. Sin calificar, con `search_path = ''`, no resuelve |
| En un `returns table`, los nombres de salida son variables del cuerpo | **Toda referencia a una columna va calificada con su alias** o plpgsql la rechaza por ambigua. Es la lección literal de la migración 24 |

**Y una cuarta, de `check-service-role.sh` guardarraíl 4:** ninguna migración puede usar la
función de fecha de sesión. `public.today_bog()` es el único helper de fecha permitido.

### Pattern 3 · El reparto entre definer y PostgREST, y por qué no se mete todo en la función

**Qué:** la definer devuelve **solo lo que el grant esconde**, más los escalares que viajan
gratis en la misma fila. Las colecciones se leen por PostgREST, donde la RLS sigue actuando.

**Por qué, y es el argumento del propio repo:** una definer propiedad de `postgres` corre con
`rolbypassrls`. Cada tabla que entra en su cuerpo es una tabla más cuya protección pasa a
depender de una sola línea (`if not private.is_admin()`) en vez de depender de esa línea
**más** su policy. `cleaning_photos`, `expenses`, `damages` y `cleaning_checklist_items` ya
tienen policy de admin funcionando; meterlas en la definer no compra ni una garantía y
amplía el radio de un `where` mal escrito, que es justo el *"corolario incómodo"* que la
migración 09 dejó anotado: *"aquí NO hay red de seguridad. Un `where` mal escrito no da
42501, da los datos."*

**El reparto concreto del panel de aseo, cinco lecturas, todas paralelizables:**

| # | Vía | Qué trae | Grupo del panel |
|---|---|---|---|
| 1 | **definer nueva** | `property_id`, nombre, `is_managed`, `scheduled_date`, `state`, `aseador_id`, nombre del aseador, `started_at`, `finished_at`, **cobrado, pagado, margen** | Cabecera · `EJECUCIÓN` (parcial) · `DINERO` |
| 2 | PostgREST | `cleaning_checklist_items` → `progresoTotal(armarChecklist(filas))` | `EJECUCIÓN` (`7/12`) |
| 3 | PostgREST | `cleaning_photos` donde `deleted_at is null`, ordenadas | `EVIDENCIA` |
| 4 | PostgREST | `expenses` del aseo | `REPORTES` |
| 5 | PostgREST | `damages` del aseo | `REPORTES` |
| +6 | Storage | hasta **6** firmas (`firmarRecibo`), nunca doce | miniaturas |

**§10.4 regla 2 dice "los cuatro grupos salen de una sola lectura, no de cuatro".** Cinco
lecturas **en paralelo** cuestan una latencia, no cinco, y es lo que la regla quiere decir
(su argumento es *"cuatro viajes por apertura es cuatro veces la latencia"*, y eso solo pasa
si se encadenan). Se cumple el espíritu con `Promise.all`.

**La palanca, si la medición dice que no alcanza:** plegar `expenses` y `damages` en una
segunda definer con forma de unión (`tipo`, `concepto`, `monto`, `moneda`), que es
exactamente la forma que `gastos_de_aseadora` ya tiene. No se hace de entrada.

### Pattern 4 · Lectura de calendario sin función nueva

**Qué:** el panel de calendario **no necesita ninguna migración**.

**Evidencia:** `public.calendar_reservations` tiene `grant select … to authenticated`
(migración 07, línea 116) y la policy `calendar_res_admin_select` (migración 08, línea 534)
que la acota a `private.is_admin()`. Y el índice ya está puesto para esta consulta exacta:

```sql
create index cal_res_prop_end_idx on public.calendar_reservations (property_id, ends_on)
  where disappeared_at is null;
```

`ends_on` **es** el checkout, y su comentario en el schema lo fija: *"DTEND del VEVENT de día
completo. Es EXCLUSIVO: coincide con la fecha del aseo. No restar un día."*

**Dos reglas duras:**

1. **La proyección se enumera, nunca comodín**, y `raw_description` **no puede aparecer**.
   El guardarraíl 9 de `check-service-role.sh` hace grep de esa columna sobre todo el código
   de aplicación y rompe el build: trae los últimos cuatro dígitos del teléfono del huésped.
   El mismo guardarraíl aclara que **un comentario que la nombre también rompe**, así que al
   explicar por qué no se lee, se describe el patrón y no se escribe el token.
2. **Se filtra `disappeared_at is null`**, o el panel enseñaría reservas que ya no están en
   el feed. Es lo mismo que hace el índice parcial.

**Y la aritmética de fechas va en `lib/domain/checkouts.ts`, sobre cadenas `'YYYY-MM-DD'`.**
§14.4 lo prohíbe por nombre y tiene razón medida: `new Date('2026-09-04')` se parsea como UTC
y en Bogotá renderiza el día anterior. Es el mismo defecto que CLAUDE.md documenta para
`fecha_aseo`.

### Pattern 5 · El esqueleto dentro del panel, no el `loading.tsx` del segmento

**Qué:** el `Sheet` monta en el mismo render que lee `searchParams`; la lectura va dentro de
un `<Suspense>` cuyo fallback tiene la **geometría real** del panel.

**Por qué importa más de lo que parece aquí:** §11.1 prohíbe por nombre el spinner centrado,
atenuar la lista y que el panel aparezca solo cuando llegan los datos. Pero la razón dura es
el Hallazgo 3: **si el `<Suspense>` lleva una `key` derivada de `searchParams`, se está
reproduciendo a mano el fixture `searchparams-reuse-loading` de Next**, que es precisamente
lo que fuerza el remonte del subárbol. La `key` del panel va sobre **el panel** (§12.2, para
que no se reutilice el árbol del anterior), **no sobre el `<Suspense>` ni sobre nada que
envuelva a la tabla**.

### Anti-Patterns to Avoid

- **Copiar `SheetDesglosePago` con su `router.replace('/ruta/fija')`.** Tres de los cuatro
  anfitriones tienen parámetros propios que hay que conservar (Pattern 1, punto 3).
- **Meter fotos, gastos y daños en la función definer** "ya que estamos". Saca cuatro tablas
  de la RLS sin comprar nada (Pattern 3).
- **Contar el checklist otra vez.** `lib/domain/checklist.ts` ya declara una duplicación con
  su test de paridad y advierte contra una tercera.
- **Renderizar el panel de aseadora dentro de `<FiltroPeriodo>`.** Queda atenuado y sin
  eventos cuando alguien cambia de periodo (Hallazgo 9a).
- **Convertir la fila de aseo en `<div role="button">`.** §5.3 punto 1 lo prohíbe: el cambio
  es de `href`, no de técnica.
- **Anidar dos anclas en la celda `APARTAMENTO`,** o poner un segundo enlace con `z-10`
  encima del `::after`. Dos áreas clicables solapadas en una fila de 40px es cómo se toca la
  equivocada.
- **Escribir `stopPropagation` o `preventDefault` en el menú `⋯`.** El `relative z-10` de su
  celda ya lo resuelve y está en producción desde la Fase 4.
- **Devolver lo que `leerSecretos()` entrega** desde la action nueva. Arrastra la URL iCal
  (Hallazgo 7).
- **Usar `page.waitForURL` o `expect(page).toHaveURL` como espera** de la apertura de un
  panel. Medido: se traba (Hallazgo 5).
- **Acotar una aserción E2E por `locator('main')`** ahora que el contenido se portalea
  (Hallazgo 4).
- **Llamar a `revalidatePath` desde cualquier action de esta fase.** Cuelga el navegador en
  las Server Actions de `(admin)`, medido en el plan 04-14.

---

## Don't Hand-Roll

| Problema | No construir | Usar | Por qué |
|---|---|---|---|
| Trampa de foco, `Escape`, devolver el foco al abrir | Un `useEffect` de `keydown` | `Sheet` (Base UI `Dialog`) | §12.3 lo prohíbe por nombre. La primitiva lo da y los dos paneles en producción lo demuestran |
| Esperar a que la URL cambie en un E2E | `waitForURL`, `toHaveURL`, `waitForTimeout` a ojo | **`esperarUrlDeCliente()`**, `e2e/fixtures.ts:365` | Ya existe, está medido, y tiene cero usos. Esta fase es su primer consumidor |
| Comprobar la forma de un uuid antes de ir a la base | Un regex nuevo en cada página | **`identificadorValido()`**, `lib/data/finanzas-detalle.ts:125` | Evita el `22P02` que la pantalla no sabría explicar (T-07-56) |
| Firmar la URL de una foto | `createSignedUrl` suelto en el componente | **`firmarRecibo()`**, `lib/data/recibos.ts:91` | Distingue `sin_evidencia` de `firma_fallida` y **no propaga el mensaje del almacenamiento**, que arrastra la ruta y el bucket |
| Contar `7/12` | Un `filter(...).length` | **`progresoTotal(armarChecklist(filas))`** | Tercera verdad sobre el mismo dato |
| Derivar el estado visible de un aseo o de un apartamento | Un `switch` sobre `state` | **`estadoDeAseo()` / `estadoDeApartamento()`** | El orden de evaluación es parte de la regla: `is_managed` se mira primero, o la fila externa no tiene rama honesta |
| Un segundo componente de estado vacío | `PanelVacio` | **`EstadoVacio`** con `compacto` | Prohibido desde `04-UI-SPEC` §15.1 y repetido en `07-UI-SPEC` |
| Un diálogo de foto | Uno nuevo | **`DialogoRecibo`** como base | Resuelve lo mismo: bucket privado, firma corta, `onError` explicado |
| Una barra de ancho dinámico, un avatar, un formato de pesos, una fecha larga | Cualquiera de los cuatro | `FilaAseadora`, `CirculoIniciales`, `formatCOP`, `formatFechaLargaBog` | Los cuatro existen y están probados |
| Leer el estado del periodo abierto | `select ... from payout_periods` | **`leerPeriodoPendienteDeCierre()`** | `payout_periods` tiene `revoke all … from authenticated` (migración 23, línea 629). No hay otra ruta |

**Key insight:** en esta fase, casi todo lo que parece "hay que construirlo" ya está
construido, y lo que de verdad hay que escribir es lo que **no** se parece a nada previo:
una función definer, cuatro composiciones de lectura, y dos módulos puros de dominio. La
tentación cara es reimplementar comportamiento de la primitiva o duplicar una derivación de
dominio, y las dos están prohibidas por escrito en el propio repo.

---

## Common Pitfalls

### Pitfall 1 · `loading.tsx` del segmento y el estado de cliente del filtro

**Qué va mal:** al abrir el panel, el esqueleto de `/apartamentos` parpadea, el filtro se
vacía y el scroll vuelve arriba. El criterio 1 queda falso en sus dos mitades.

**Por qué pasa:** si el subárbol se remonta (por el fallback del segmento o por una `key`
que cambie con los parámetros), `TablaApartamentos` pierde sus tres `useState`.

**Cómo evitarlo:** medirlo en Wave 0 (Hallazgo 3), y no poner ninguna `key` derivada de
`searchParams` sobre nada que envuelva la tabla.

**Señales tempranas:** el `<Skeleton>` de `loading.tsx` aparece al abrir el panel; o el
`aria-busy` se queda en `true`, que es el síntoma exacto que `/finanzas` midió.

### Pitfall 2 · Cerrar el panel con una ruta constante borra los filtros del anfitrión

**Qué va mal:** cerrar el panel de aseadora resetea el periodo a mes actual; cerrar el de
aseo pierde `?alertas=atendidas`.

**Por qué pasa:** `SheetDesglosePago` cierra con `router.replace('/finanzas/pagos')`, una
constante, y funciona ahí porque esa ruta no tiene más parámetros. Copiarlo literal en los
otros tres borra lo que sí tienen.

**Cómo evitarlo:** el componente recibe la ruta base **ya compuesta desde el servidor**, con
los parámetros supervivientes, o la compone en el cliente partiendo de `useSearchParams()` y
borrando solo el suyo, que es exactamente lo que `FiltroPeriodo.ir()` hace al revés.

**Señales tempranas:** la aserción `toHaveURL(ancla=…)` de `finanzas.spec.ts` se pone roja.
Esa aserción **se conserva a propósito** para atrapar esto.

### Pitfall 3 · El panel portaleado deja aserciones en verde sin mirar nada

Ver Hallazgo 4. **Señal temprana:** una aserción que pasa la primera vez que se corre,
contra un panel que todavía no renderiza el contenido. Contra-prueba obligatoria: hacerla
fallar a propósito metiendo la palabra prohibida en el panel y comprobar que se pone roja.
Es la disciplina de señuelos que `11_financiero.test.sql` ya documenta.

### Pitfall 4 · Realtime vuelve a disparar la lectura del panel, y con ella las seis firmas

**Medido.** `SincronizacionEnVivo.tsx` llama `startTransition(() => router.refresh())` ante
**cualquier** evento de `cleanings`, y su propia cabecera advierte: *"si se confirman quince
aseos en UNA transacción y llegan quince eventos, es decir quince `router.refresh()`"*.

**Qué va mal:** con el panel de aseo abierto, cada refresco vuelve a ejecutar las cinco
lecturas **y vuelve a emitir hasta seis URLs firmadas**. En una ráfaga de quince, son hasta
90 firmas de 300 segundos de vida.

**Lo que NO va mal, y conviene saberlo:** la misma cabecera afirma que *"`router.refresh()`
CONSERVA EL ESTADO DEL CLIENTE"*, así que el panel no se cierra ni parpadea.

**Cómo evitarlo:** medirlo. Si molesta, la palanca barata **no** es cambiar el contrato de
§10.3 (que fija seis firmas por apertura), sino acotar el disparo del refresco. Queda como
riesgo medido, no como tarea obligatoria.

### Pitfall 5 · La ambigüedad de §5.3 sobre el nombre del apartamento en la fila de aseo

§5.3 dice dos cosas que, leídas literales, no pueden ser las dos verdad:

- punto 1: *"El ancla estirada pasa a ser `<Link href={/operacion?aseo={id}}>`, y sigue
  viviendo en la celda `APARTAMENTO`, sigue siendo un `<a>` real alcanzable por teclado"*.
- punto 2: *"El nombre del apartamento deja de ser enlace en esa celda. Pasa a texto plano"*.

Si el nombre es texto plano y el `<a>` sigue ahí, **ese `<a>` se queda sin nombre accesible**,
que es un control sin nombre, prohibido por §13 y por el propio comentario de
`EnlaceAlApartamento` (*"se pinta el hueco en vez de un link con texto vacío, que sería un
control sin nombre accesible"*).

**Lectura coherente, que es la que recomiendo y respeta el fondo de los dos puntos:** el `<a>`
sigue envolviendo el texto del nombre (por eso conserva nombre accesible y el foco de fila
con `has-[a:focus-visible]`), **cambia de destino** a `?aseo={id}`, y deja de ser enlace *al
apartamento*, que es lo que el punto 2 quiere decir. Como el destino ya no es lo que el texto
dice, lleva `aria-label="Ver el aseo de {nombre}"`. Ir al apartamento sigue a un clic por los
dos sitios que el punto 3 nombra.

**No es reabrir una decisión:** es elegir la única de las dos lecturas que no produce un
defecto de accesibilidad. Si el plan prefiere la otra, necesita inventar dónde vive el nombre
accesible del ancla, y §14.5 no tiene icono para eso.

### Pitfall 6 · `min-w-<nombre propio>` sí funciona; `min-w-<talla>` rompe el build

`check-max-w-tallas.sh` vigila **`max-w-` y también `min-w-`** con nombre de talla
(`PATRON="(^|[^A-Za-z0-9_-])(max|min)-w-(${TALLAS})…"`). `--container-boton-mostrar` no es
un nombre de talla, así que `min-w-boton-mostrar` no lo dispara, y hay precedente en
producción: `min-w-boton-marcar` sobre `--container-boton-marcar: 148px`
(`BotonMarcarPagado.tsx:92`). §2.2 tiene razón.

**Lo que sí hay que vigilar:** si durante la ejecución aparece un `max-w-*` nuevo, el
registro en el grupo `max-w` de `cn()` (`lib/utils.ts:72`) **no es opcional**. Sin él la
clase se escribe, `tsc` pasa verde, y el ancho no llega al DOM.

### Pitfall 7 · La función definer nueva nace ejecutable por `anon`

En PG 17 `alter default privileges` **no** puede quitarle `EXECUTE` a `PUBLIC`. Toda función
nueva de `public` nace invocable por `anon`, que es el rol de la publishable key, que es
pública por diseño. El par va **pegado** a la definición:

```sql
revoke all     on function public.detalle_de_aseo(uuid) from public, anon;
grant  execute on function public.detalle_de_aseo(uuid) to authenticated;
```

El guardarraíl 9 de `supabase/tests/02_guardarrailes.test.sql` verifica la propiedad sobre
**todas** las funciones de `public` y `private`, así que olvidarlo se detecta, pero después.

### Pitfall 8 · El checklist no existe antes de confirmar, y eso no es un error

`cleaning_checklist_items` **se materializa al CONFIRMAR** (`confirm_cleaning`), no al crear
el aseo. Un aseo `pendiente` sin confirmar devuelve **cero filas**, y `progresoTotal` da
`{hechas: 0, total: 0}`. §10.2 ya lo cubrió: *"Sin checklist todavía: em dash con `sin
definir`"*. La rama es `total === 0`, **no** `hechas === 0`, que sería un `0/12` correcto.

### Pitfall 9 · `listarApartamentos()` no trae cuatro de los nueve datos del panel

Medido: `COLUMNAS_DE_LISTA` es `id, nombre, cluster, gestion_vivaguest, is_active,
responsable_id, contacto_externo`. Faltan para §7.2: **`direccion`, `maps_url`,
`hora_limite`, `suplente_id`** y el nombre del suplente.

**La salida barata y correcta:** ampliar `COLUMNAS_DE_LISTA` con esas cuatro y derivar
`suplenteNombre` del **mismo mapa de perfiles que ya se construye** para
`responsableNombre`. **Cero consultas nuevas** para 39 filas. Lo que sí es un viaje nuevo es
el **próximo aseo**, y solo cuando el parámetro está presente.

**Y la advertencia que viaja con eso:** la cabecera de `lib/data/apartamentos.ts` y la
migración 24 dicen las dos que **una columna nueva de `properties` hay que añadirla en los
dos sitios** (el grant de la migración 24 y `COLUMNAS_DE_PROPIEDAD`). Aquí no se añade
ninguna columna a la tabla, solo se piden más de las que ya tienen grant, así que no aplica.
Conviene no confundir las dos cosas al leer el diff.

### Pitfall 10 · El panel de informativa cambia de forma por CHECK, no por estilo

Cinco de las 39 unidades tienen `gestion_vivaguest = false`. `props_assignees_only_when_managed`
y `cl_unmanaged_is_inert` **imponen** que no tengan responsable, suplente, tarifas, aseador,
checklist ni evidencia. §7.2.1 ya lo diseñó. La trampa es pintar em dashes con `sin definir`
donde corresponde `no aplica`: la distinción la fijó `FilaAseo.tsx` y no es estilo.
`sin definir` dice que alguien tiene que ir a llenarlo; `no aplica` dice que la base lo
prohíbe.

---

## Code Examples

### Ejemplo 1 · La función definer nueva, con las siete reglas aplicadas

```sql
-- Fuente del patrón: supabase/migrations/20260913130000_26_lecturas_financieras.sql
-- (las siete reglas de su cabecera) y 20260913110000_24_frontera_del_aseador.sql
-- (la enumeración de columnas que obliga a esta función a existir).

create or replace function public.detalle_de_aseo(p_cleaning uuid)
returns table (
  cleaning_id      uuid,
  property_id      uuid,
  property_nombre  text,
  is_managed       boolean,
  scheduled_date   date,
  state            public.cleaning_state,
  aseador_id       uuid,
  aseador_nombre   text,
  started_at       timestamptz,
  finished_at      timestamptz,
  cobrado          bigint,
  pagado           bigint,
  margen           bigint
)
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  -- ── LA GUARDA. PRIMERA SENTENCIA EJECUTABLE DEL CUERPO (regla 2). ────────
  -- Sin ella, una definer propiedad de `postgres` corre con rolbypassrls = t y
  -- entrega el margen de CUALQUIER aseo a cualquiera que la llame.
  if not (select private.is_admin()) then
    raise exception 'no_autorizado'
      using errcode = '42501',
            hint    = 'El detalle de un aseo con sus cifras es información del negocio: solo lo ve un administrador activo.';
  end if;

  return query
    select c.id,
           c.property_id,
           pr.nombre,
           c.is_managed,
           c.scheduled_date,
           c.state,
           c.aseador_id,
           -- Nulo y no un texto de relleno: la fila A CARGO de un aseo sin
           -- persona pinta su propio vacío (`Sin asignar`), y ese texto es
           -- decisión de la pantalla, no de la consulta.
           pg_catalog.btrim(pf.full_name),
           c.started_at,
           c.finished_at,
           -- Regla 4: `bigint` declarado y casteado, o supabase-js lo entrega
           -- como cadena y la aritmética de TypeScript se rompe en silencio.
           -- Regla 5: SALEN DEL ASEO. `pr.tarifa_huesped` sería el valor VIVO
           -- del apartamento y contradiría a /finanzas/aseos para el mismo aseo.
           coalesce(c.tarifa_huesped, 0)::bigint,
           coalesce(c.pago_aseador,   0)::bigint,
           (coalesce(c.tarifa_huesped, 0) - coalesce(c.pago_aseador, 0))::bigint
      from public.cleanings  c
      join public.properties pr on pr.id = c.property_id
      left join public.profiles pf on pf.id = c.aseador_id
     where c.id = p_cleaning;
     -- SIN filtro de estado, a propósito: el panel existe para responder
     -- «¿cómo va el 302?», o sea para un aseo EN CURSO. Es la razón exacta por
     -- la que `rentabilidad_aseos` no sirve aquí.
     -- SIN filtro de is_managed: una informativa devuelve su fila con las
     -- cifras en cero, y la pantalla decide no pintar el grupo DINERO (§7.2.1).
end
$fn$;

comment on function public.detalle_de_aseo(uuid) is
  'Fase 8, D8-9. La cabecera y las TRES CIFRAS de un aseo, solo para un admin activo. Existe porque la migración 24 sacó tarifa_huesped y pago_aseador del grant por columna y los grants no discriminan usuarios. LAS CIFRAS SALEN DEL ASEO Y NUNCA DEL APARTAMENTO (FIN-01). No filtra por estado, al contrario que rentabilidad_aseos: el panel se abre sobre aseos en curso. No devuelve checklist, ni fotos, ni gastos, ni daños: esas cuatro tablas ya tienen policy de admin y meterlas aquí las sacaría de la RLS sin comprar ninguna garantía. Guarda de admin como primera sentencia.';

-- Regla 7, pegado a la definición: en PG 17 `alter default privileges` no puede
-- quitarle EXECUTE a PUBLIC, así que sin esto la función nace ejecutable por anon.
revoke all     on function public.detalle_de_aseo(uuid) from public, anon;
grant  execute on function public.detalle_de_aseo(uuid) to authenticated;
```

### Ejemplo 2 · La composición de la lectura, cinco viajes y una latencia

```ts
// lib/data/panel-aseo.ts
// Fuente del patrón: app/(admin)/finanzas/aseadoras/[id]/page.tsx (Promise.all de
// cinco lecturas + firmas en paralelo) y lib/data/recibos.ts (la firma).

export async function leerPanelDeAseo(
  supabase: Cliente,
  aseoId: string,
): Promise<PanelDeAseo | null> {
  // 1. La definer PRIMERO y sola: si devuelve cero filas, el aseo no existe o no
  //    se puede ver, y las otras cuatro lecturas sobran. No es una frontera de
  //    seguridad (cada tabla tiene su policy), es no hacer cuatro viajes por nada.
  const { data, error } = await supabase.rpc('detalle_de_aseo', { p_cleaning: aseoId });
  if (error) throw new Error(error.message);

  const cabecera = data?.[0];
  if (!cabecera) return null;

  // 2. Las cuatro colecciones EN PARALELO. Encadenarlas sumaría cuatro latencias
  //    por nada; §10.4 regla 2 pide una lectura y esto cuesta una.
  const [tareas, fotos, gastos, danos] = await Promise.all([
    supabase.from('cleaning_checklist_items')
      .select('id, property_room_id, room_label, task_label, requiere_foto, sort_order, done_at')
      .eq('cleaning_id', aseoId),
    supabase.from('cleaning_photos')
      .select('id, kind, storage_bucket, storage_path, taken_at, created_at')
      .eq('cleaning_id', aseoId)
      .is('deleted_at', null)          // una foto purgada no abre nada (RET-06)
      .order('created_at').order('id'),
    supabase.from('expenses').select('id, concepto, monto, moneda').eq('cleaning_id', aseoId),
    supabase.from('damages').select('id, descripcion').eq('cleaning_id', aseoId),
  ]);

  // 3. El progreso NO se cuenta aquí. `progresoTotal` es la MISMA función que usa
  //    la pantalla del aseador, y su módulo ya declara una duplicación con test de
  //    paridad: una tercera copia se desincroniza en el primer cambio.
  const progreso = progresoTotal(armarChecklist(tareas.data ?? []));

  // 4. SEIS firmas, nunca doce. Es la regla literal de pagos/page.tsx: firmar lo
  //    que nadie va a abrir deja URLs vivas en el navegador por si acaso.
  const visibles = (fotos.data ?? []).slice(0, MINIATURAS_VISIBLES); // 6
  const firmadas = await Promise.all(
    visibles.map((f) =>
      firmarRecibo(supabase, { bucket: f.storage_bucket, ruta: f.storage_path }),
    ),
  );

  return { cabecera, progreso, fotos: firmadas, total: fotos.data?.length ?? 0, gastos, danos };
}
```

### Ejemplo 3 · Cerrar sin borrar los parámetros del anfitrión

```tsx
// La trampa de Pattern 1 punto 3, escrita. SheetDesglosePago cierra con una
// constante y funciona porque /finanzas/pagos no tiene más parámetros. En los
// otros tres anfitriones, esa constante borra el filtro del admin.

// ── EN LA PÁGINA SERVIDOR ─────────────────────────────────────────────────
// La ruta base se compone donde están todos los parámetros ya normalizados.
const rutaAlCerrar = `/finanzas?rango=${rango}&ancla=${ancla}`;

<PanelAseadora key={aseadoraId} {...datos} rutaAlCerrar={rutaAlCerrar} />

// ── EN EL COMPONENTE DE CLIENTE ───────────────────────────────────────────
<Sheet
  open
  onOpenChange={(abierto) => {
    // `scroll: false` porque la pantalla de detrás NO se ha movido: devolverla
    // arriba perdería el sitio del admin, que es la mitad del criterio 1.
    if (!abierto) router.replace(rutaAlCerrar, { scroll: false });
  }}
>
  {/* La cadena de variantes se repite EXACTA. `tailwind-merge` solo considera
      en conflicto dos clases del mismo grupo con la misma cadena: un
      `sm:max-w-sheet` suelto NO desplaza a `data-[side=right]:sm:max-w-sheet-base`
      y el ancho pasaría a depender del orden del CSS. */}
  <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-sheet">
    <SheetHeader className="gap-sm">
      <SheetTitle className="text-heading font-semibold">{nombre}</SheetTitle>
```

### Ejemplo 4 · La espera correcta en un E2E, con la aserción después

```ts
// e2e/finanzas.spec.ts, reescritura de las líneas 589 y 592.
// `esperarUrlDeCliente` ya existe en e2e/fixtures.ts:365 y hasta hoy no la usa
// ningún spec. Su cabecera lo explica: page.waitForURL y expect().toHaveURL
// sondean DENTRO del documento y se traban con el commit de React; medido con
// 20 s de plazo seguían viendo la URL vieja, mientras page.url() desde Node la
// ve en ~200 ms.

await paginaAdmin
  .getByRole('link')
  .filter({ hasText: esc.aseadoraUna.nombre })
  .first()
  .click();

await esperarUrlDeCliente(paginaAdmin, /aseadora=[0-9a-f-]{36}/);

// La aserción SÍ se escribe, y va después de la espera.
await expect(paginaAdmin).toHaveURL(/aseadora=/);

// Y esta se conserva PALABRA POR PALABRA: es la que comprueba que abrir un panel
// no le cambia el periodo al admin por debajo (§5.1 regla 3).
await expect(paginaAdmin).toHaveURL(new RegExp(`ancla=${diaLimpio}`));

// El ámbito pasa al diálogo: el Sheet se portalea a document.body y `main` ya no
// lo ve. Acotar por `main` dejaría las dos aserciones de abajo en verde SIN MIRAR
// NADA, que es debilitarlas sin que nadie lo decida (Hallazgo 4).
const panel = paginaAdmin.getByRole('dialog');

for (const encabezado of ['AHORA MISMO', 'RESPONSABLE DE', 'SUPLENTE EN', 'EN EL PERIODO ABIERTO']) {
  await expect(panel.getByText(encabezado, { exact: false })).toBeVisible();
}

const texto = (await panel.textContent()) ?? '';
expect(texto, 'ninguna palabra de rastreo en el panel').not.toMatch(
  /ubicaci[oó]n|coordenad|GPS|en l[ií]nea|última vez activa/i,
);
await expect(panel.getByRole('img', { name: /mapa/i })).toHaveCount(0);
```

### Ejemplo 5 · Las aserciones pgTAP nuevas, con el arnés que ya existe

```sql
-- supabase/tests/11_financiero.test.sql
-- La regla del archivo, escrita en su cabecera: «todo bloque nuevo va AL FINAL y
-- sube el argumento de plan(). Insertarlo en su sitio alfabético corre los
-- números de todo lo que venga después, y esos números están citados en los
-- planes.» Por tanto: select plan(101) pasa a select plan(105).
--
-- OJO al leer las cifras: este bloque corre DESPUÉS del bloque G, que borra a
-- mano el aseo J2 y el gasto del Detergente. Mismo aviso que ya lleva el bloque L.

-- ═══════════════════════════════════════════════════════════════════════════
-- P. EL DETALLE DE ASEO DEL PANEL (Fase 8, D8-9) — 4 aserciones
-- ═══════════════════════════════════════════════════════════════════════════

-- 102 · La frontera sigue cerrada. Es la mitad del criterio 5 del ROADMAP.
select is(
  pg_temp.intento_como('a7000000-0000-0000-0000-00000000000a',
    $q$select * from public.detalle_de_aseo('f7000000-0000-0000-0000-000000000302')$q$),
  '42501',
  'D8-9 una aseadora que llama a detalle_de_aseo recibe 42501');

-- 103 · Y el admin SÍ obtiene fila. Sin esta, una guarda escrita al revés (que
--       deniegue a todo el mundo) pasaría la 102 y la fase entera «aprobaría».
select is(
  pg_temp.valor_como('ad700000-0000-0000-0000-000000000001',
    $q$select (count(*) = 1)::text
         from public.detalle_de_aseo('f7000000-0000-0000-0000-000000000302')$q$),
  'true',
  'D8-9 el admin SI obtiene exactamente una fila de detalle_de_aseo');

-- 104 · LA QUE DISTINGUE ESTA FUNCIÓN DE rentabilidad_aseos: un aseo EN CURSO
--       devuelve fila. Es literalmente la razón de existir del panel, y sin
--       aserción nadie se enteraría de que alguien «optimizó» añadiendo
--       `and c.state = 'completada'` copiándolo de la función de al lado.
select is(
  pg_temp.valor_como('ad700000-0000-0000-0000-000000000001',
    $q$select (count(*) = 1)::text
         from public.detalle_de_aseo('<el aseo en curso del fixture>')$q$),
  'true',
  'D8-9 detalle_de_aseo SI devuelve un aseo en curso, al contrario que rentabilidad_aseos');

-- 105 · FIN-01: las cifras salen del ASEO. Se edita la tarifa del apartamento y
--       el número del panel NO se mueve. Es el mismo señuelo que el bloque F usa
--       para el cierre, aplicado a esta función.
--       (la edición va con sesión de servicio, y se revierte al final del bloque)
select is(
  pg_temp.valor_como('ad700000-0000-0000-0000-000000000001',
    $q$select cobrado::text from public.detalle_de_aseo('f7000000-0000-0000-0000-000000000302')$q$),
  '<el valor congelado por tg_cleanings_snapshot, no el nuevo>',
  'FIN-01 detalle_de_aseo lee la tarifa del aseo y no la del apartamento');
```

> **Y el señuelo se corre de verdad.** La bitácora de `11_financiero.test.sql` lo exige:
> *"Una suite en verde demuestra que el código pasa los tests. NO demuestra que los tests
> puedan fallar. […] Si amplías el archivo, amplía también esta tabla: una aserción sin
> señuelo corrido es una promesa sin respaldo."*

---

## El presupuesto de consultas, medido

Lo que cada pantalla cuesta hoy y lo que le añade el panel. Todas las adiciones ocurren
**solo cuando el parámetro está presente**.

| Anfitrión | Hoy | El panel añade | Total con panel abierto |
|---|---|---|---|
| `/apartamentos` | **4** (properties · profiles · calendar_feeds · `tarifas_de_apartamentos` sin argumento) | **+1**: el próximo aseo del apartamento abierto. Las 4 columnas nuevas de `properties` y el nombre del suplente **cuestan cero**: van en el select que ya existe y en el mapa de perfiles que ya se construye | **5** |
| `/apartamentos` con `vista=calendario` | 4 | **+2**: `calendar_reservations` del mes y `calendar_feeds` de ese apartamento | **6** |
| `/operacion` | **8** (7 en `Promise.all` más la marca de evidencia dentro de `leerOperacion`) | **+5**, todas en paralelo: la definer, checklist, fotos, gastos, daños. Más **hasta 6 firmas** de Storage | **13** + 6 firmas |
| `/finanzas` | **2** (`resumen_financiero` · `costo_por_aseadora`) | **+4**: perfil, `aseo_en_curso_de_aseadora`, asignaciones, periodo pendiente; y **+1 encadenada**: `costo_por_aseadora` del periodo abierto | **7** (2 latencias) |
| `/finanzas/pagos` | N periodos + 1 | sin cambio (solo se le quita la prop `replace`) | igual |

**Lectura:** `/operacion` es la que más crece, y es la que menos margen tiene (ya hace 8). Es
también la única con Realtime, que puede repetir las cinco lecturas y las seis firmas hasta
quince veces en una ráfaga (Pitfall 4). **Esa es la combinación que hay que medir con el
panel abierto**, no la de `/apartamentos`, que pasa de 4 a 5.

**Lo que NO se puede hacer, y es la trampa obvia:** precargar el panel de las 39 filas, o
firmar las fotos de todos los aseos del día. El comentario de `pagos/page.tsx` lo dice para
su propio caso y aplica igual: *"firmar los de las ocho filas de cada periodo al cargar la
página dejaría decenas de URL vivas en el navegador por si acaso"*.

---

## Runtime State Inventory

> Esta fase no es un rename ni una migración de datos, pero **sí borra una ruta**, así que
> el inventario se hace igual, acotado a eso.

| Categoría | Qué se encontró | Acción |
|---|---|---|
| **Datos almacenados** | Ninguno. La fase no escribe en ninguna tabla: los cuatro paneles son de lectura y la única action (`revelarCodigoDeAcceso`) tampoco muta | Ninguna |
| **Config de servicio en vivo** | Ninguna. No hay feeds, ni workflows, ni cron que nombren `/finanzas/aseadoras/[id]` | Ninguna |
| **Estado registrado en el SO** | Ninguno | Ninguna |
| **Secretos y variables de entorno** | Ninguno nuevo. `revelarCodigoDeAcceso` usa la misma clave de servicio que `leerSecretos`, leída solo en `lib/supabase/admin.ts` | Ninguna |
| **Artefactos de build y rutas** | `.next/types/routes.d.ts` declara hoy `"/finanzas/aseadoras/[id]"` en `AppRoutes`. Al borrar el directorio, **cualquier `href` tipado que apunte ahí deja de compilar**, que es exactamente lo que queremos: el único es `FilaAseadora.tsx:77` y se cambia en el mismo commit. El archivo se regenera solo | Ninguna manual |
| **Enlaces externos** | Un enlace a `/finanzas/aseadoras/{id}` pegado en un chat hace meses **pasa a dar 404**. Nadie lo decidió y probablemente nadie lo tiene, pero conviene que esté escrito | Ninguna. Un redirect de compatibilidad sería una ruta nueva que hay que mantener para siempre |

---

## Environment Availability

| Dependencia | Requerida por | Disponible | Versión | Fallback |
|---|---|---|---|---|
| Node | todo | ✓ | v25.9.0 | — |
| Supabase CLI | migración nueva, `db:reset`, `db:test`, `db:types` | ✓ | 2.116.0 | — |
| Docker | `supabase db start` (la base local donde se mide y se corre pgTAP) | ✓ | corriendo | — |
| Playwright | las seis aserciones reescritas | ✓ | 1.62.1, instalado | — |
| Vitest | `lib/domain/checkouts.ts`, `lib/domain/feeds.ts` | ✓ | 4.1.11 | — |
| `@base-ui/react` | `Sheet`, `Dialog` | ✓ | 1.7.0 | — |
| `lucide-react` | los 26 iconos de §14.5 | ✓ | 1.39.0, **los 26 verificados por import** | — |
| Navegador de 1280×800 | el piso de 700px de viewport que §6.4 declara | no verificable desde aquí | — | Playwright lo puede emular, y es la única forma de comprobar §6.4 |

**Dependencias faltantes sin fallback:** ninguna.
**Dependencias faltantes con fallback:** ninguna.

> Aviso heredado que aplica: `e2e/` contra el puerto 3000 puede correr contra **otro
> proyecto** si hay un `next dev` de otra cosa levantado (Pitfall 9 de `07-RESEARCH`), y en
> disco de iCloud `db:reset` cuesta ~54 s (Pitfall 10). Los dos afectan al ritmo del plan,
> no a su contenido.

---

## Validation Architecture

`workflow.nyquist_validation` está en `true` en `.planning/config.json`.

### Test Framework

| Propiedad | Valor |
|---|---|
| Unitarios | `vitest` 4.1.11 · `vitest.config.ts` |
| Integración | `vitest` con `vitest.integration.config.ts` (base real) |
| Base de datos | `supabase test db --local` (pgTAP), 12 archivos en `supabase/tests/` |
| E2E | `@playwright/test` 1.62.1 · 22 specs en `e2e/` |
| Arquitectura | `npm run ci:arch` (3 scripts encadenados) |
| Corrida rápida | `npm run test:unit` |
| Suite completa | `npm run ci:arch && npm run test:unit && npm run test:integration && npm run db:test && npm run test:e2e` |

### Criterios del ROADMAP → mapa de pruebas

| Criterio | Comportamiento | Tipo | Comando automatizado | ¿Existe? |
|---|---|---|---|---|
| 1 | Abrir el panel conserva scroll y filtro | e2e | `npx playwright test e2e/apartamentos-lista.spec.ts` | ❌ **Wave 0** (spike) y después caso nuevo |
| 1 | Cerrar devuelve al mismo sitio | e2e | idem | ❌ caso nuevo |
| 2 | Un enlace directo abre el panel | e2e | `goto('/apartamentos?apartamento=<id>')` + `getByRole('dialog')` | ❌ caso nuevo, **uno por panel** (Hallazgo 2) |
| 3 | El botón atrás cierra el panel, no la sección | e2e | `page.goBack()` + `expect(dialog).toHaveCount(0)` + URL sigue en la sección | ❌ caso nuevo |
| 4 | El panel de aseo enseña checklist, evidencia y reportes | e2e | `e2e/operacion.spec.ts` | ❌ caso nuevo |
| 4 | La lectura compone bien (progreso, ausencias, informativa) | integración | `lib/data/panel-aseo.integration.test.ts` | ❌ archivo nuevo |
| **5** | **Una aseadora recibe `42501` de `detalle_de_aseo`** | **pgTAP** | `npm run db:test` | ❌ **bloque P, aserción 102** |
| **5** | **El admin sí obtiene fila** | **pgTAP** | idem | ❌ aserción 103 |
| **5** | **FIN-01: la cifra sale del aseo, no del apartamento** | **pgTAP** | idem | ❌ aserción 105 |
| 5 | La aseadora sigue leyendo lo que su PWA necesita | pgTAP | ya existe (aserciones 15 y 16) | ✅ **no se toca** |
| 5 | El código de acceso no está en el DOM antes de pulsar `Mostrar` | e2e | `expect(await page.content()).not.toContain(CODIGO)` | ❌ caso nuevo, **copiado de `calendario.spec.ts:468` (T-02-74)** |
| 5 | Ni una palabra de rastreo en el panel de aseadora | e2e | `e2e/finanzas.spec.ts` | ⚠️ **existe pero se vacía sola** (Hallazgo 4). Hay que retargetearla |
| 6 | La app del aseador no cambió | compuerta de fase | `git diff --name-only <base>..HEAD -- 'app/(cleaner)'` vacío | ❌ **no existe nada** (Hallazgo 6) |
| 6 | Las cinco suites del aseador siguen verdes sin tocarlas | e2e | `npx playwright test e2e/aseo-*.spec.ts e2e/mis-pagos.spec.ts e2e/push-instalacion.spec.ts` | ✅ existen |
| — | Aritmética de checkouts sin `new Date(iso)` | unit | `lib/domain/checkouts.test.ts` | ❌ archivo nuevo |
| — | Los tres estados del feed | unit | `lib/domain/feeds.test.ts` | ❌ archivo nuevo (Hallazgo 8) |
| — | Ningún `max-w-<talla>` nuevo | arquitectura | `npm run ci:arch` | ✅ existe |
| — | Sin deriva de tipos tras la migración | tipos | `npm run db:types:check` | ✅ existe, **y esta fase lo dispara**: la función nueva cambia `lib/database.types.ts` |

### Sampling Rate

- **Por commit de tarea:** `npm run test:unit && npm run ci:arch`
- **Por cierre de wave:** `npm run db:test` (Wave de schema) · `npm run test:integration` (Wave de lectura) · `npx playwright test` de los archivos tocados (Wave de UI)
- **Compuerta de fase:** suite completa en verde, **más** el diff vacío sobre `app/(cleaner)`,
  **más** los señuelos corridos y anotados en la bitácora de `11_financiero.test.sql`.

### Wave 0 Gaps

- [ ] **Spike de medición del criterio 1** sobre `/apartamentos` (Hallazgo 3). No es un test,
      es lo que decide si hace falta mover el filtro a `searchParams`. **Bloquea el diseño de
      las waves siguientes.**
- [ ] `supabase/migrations/…_28_detalle_de_aseo.sql` y su bloque P en
      `11_financiero.test.sql`, con `plan(101)` → `plan(105)`
- [ ] `lib/domain/checkouts.test.ts` y `lib/domain/feeds.test.ts` (los dos módulos nacen en
      esta fase)
- [ ] `lib/data/panel-aseo.integration.test.ts`
- [ ] Barrido de la suite E2E buscando aserciones acotadas por `locator('main')` o por
      contenedores de página, que el portal deja vacías (Hallazgo 4)
- [ ] Primer uso de `esperarUrlDeCliente()` en un spec, que hoy tiene cero consumidores

---

## Security Domain

`security_enforcement` no está desactivado en la configuración, así que aplica.

### Categorías ASVS aplicables

| Categoría ASVS | ¿Aplica? | Control estándar en esta fase |
|---|---|---|
| **V1 Arquitectura** | sí | Frontera declarada: layout de `(admin)` con `getUser()` contra el servidor de Auth, **más** la guarda dentro de la función. §10.4 regla 1 prohíbe una tercera copia |
| **V2 Autenticación** | no directamente | No se toca el login. `exigirAdmin()` se reutiliza sin cambios |
| **V3 Sesiones** | sí | `getUser()` y nunca `getClaims()`: medido en la Fase 2, tras un ban `getClaims()` devuelve OK y `getUser()` da 403. El criterio de revocación inmediata depende de eso |
| **V4 Control de acceso** | **sí, es la categoría central** | Grant por columna (mig. 24) + RLS por policy (mig. 08) + guarda de rol como primera sentencia en la definer nueva. **Tres capas, ninguna redundante:** el grant protege de la columna, la policy de la fila, la guarda de la definer del `rolbypassrls` |
| **V5 Validación de entrada** | sí | `identificadorValido()` sobre los cuatro parámetros antes de que lleguen a Postgres (evita `22P02`), y Zod en la única Server Action |
| **V6 Criptografía** | no | Nada se cifra ni se firma en esta fase salvo las URLs de Storage, que las firma Supabase |
| **V7 Manejo de errores y logs** | sí | `mapDbError()` para todo error de base; **el valor del código de acceso no se registra en ningún log ni viaja a `last_error`** (T-02-51); `firmarRecibo()` no propaga el mensaje del almacenamiento, que arrastra ruta y bucket |
| **V8 Protección de datos** | **sí** | Dos credenciales en juego: el código de acceso (no viaja hasta que alguien lo pide) y la URL iCal (**no viaja nunca**, y el riesgo real es el Hallazgo 7). Coordenadas de foto (`captured_lat`/`captured_lng`) **no entran en ninguna lectura** |
| **V12 Archivos y recursos** | sí | Bucket privado, firma de 300 s, **seis firmas por apertura y no doce**, y la ruta nunca viaja al cliente sin firmar |
| **V13 API y servicios** | sí | Una Server Action es un endpoint HTTP público: el guard va primero, y el orden lo verifica el guardarraíl 7 |

### Patrones de amenaza conocidos para este stack

| Patrón | STRIDE | Mitigación estándar, y dónde está en esta fase |
|---|---|---|
| Definer sin guarda entrega el catálogo entero | Elevation of Privilege | Guarda como primera sentencia + aserción pgTAP 102. **Medido en la Fase 7 (Pitfall 7)** |
| Guarda escrita al revés (deniega a todos) pasa la prueba negativa | Denial of Service | **Aserción 103**, la positiva. Sin ella, la 102 se aprueba rompiendo el producto |
| Función nueva de `public` nace ejecutable por `anon` | Elevation of Privilege | `revoke`/`grant` pegado + guardarraíl 9 de `02_guardarrailes.test.sql` |
| Una credencial viaja al DOM como prop de un componente de cliente | Information Disclosure | Precedente literal en `calendario/page.tsx`; aserción de tipo T-02-74 para el código de acceso |
| **Una segunda credencial se cuela en la respuesta de la action** | Information Disclosure | **Hallazgo 7.** `leerSecretos()` devuelve cuatro campos y solo dos pueden salir |
| URL firmada sobrevive al cierre de sesión | Information Disclosure | Vida de 300 s y firma solo de lo que se ve |
| Dato personal del huésped en una lectura de calendario | Information Disclosure | Guardarraíl 9 de `check-service-role.sh`, que rompe el build si se nombra la columna |
| La prueba pasa sin mirar (falso verde por vacuidad) | Repudiation | **Hallazgo 4** más la bitácora de señuelos obligatoria |
| Un parámetro manipulado en la dirección | Tampering | Solo acota una lectura de admin ya autorizada. `identificadorValido()` evita que llegue mal formado |

**Lo que esta fase NO hace, y hay que dejarlo escrito:** no añade ni un grant, no relaja ni
una policy, no toca `sheet.tsx`, no toca `app/(cleaner)/`, y no crea ningún camino nuevo a
`property_secrets` (delega en el que ya tiene guard).

---

## Project Constraints (from CLAUDE.md)

Directivas accionables que el plan tiene que respetar, extraídas de `./CLAUDE.md`:

| Directiva | Dónde muerde en esta fase |
|---|---|
| **Orden de trabajo: schema + migraciones + RLS antes que UI** | La migración y su bloque pgTAP van en la primera wave, antes de cualquier panel |
| `next` pineado en **15.5.24**, build webpack | No se propone migrar nada. `scroll={false}` se verifica contra esa versión |
| **`getUser()`, nunca `getClaims()`** para proteger rutas | Se hereda del layout; ninguna lectura de esta fase lo cambia |
| **El rol sale de `app_metadata.role`** | Lo resuelve `private.is_admin()` y `exigirAdmin()`. No se replica |
| **`getSession()` nunca para autorizar** | No aparece |
| **Montos en `bigint` de pesos enteros** | Regla 4 de la definer: declarado **y** casteado, o llega como cadena |
| **`numeric`/`float` prohibidos para COP** | No se introduce ninguno |
| **`fecha_aseo` es `date`, no `timestamptz`** | `scheduled_date` y `ends_on` viajan como `'YYYY-MM-DD'`; **prohibido `new Date(iso)`** |
| **UTC-5 fijo, sin DST** | `dia_bog()` en SQL, `hoyBog()` en TS. No se introduce otra conversión |
| **El código de acceso vive en tabla aparte con RPC y auditoría** | Se respeta: el admin va por la fábrica administrativa con guard, y **por eso §7.3 prohíbe escribir que queda auditado** |
| **La autorización nunca se apoya en claims del JWT** | La definer pregunta con `private.is_admin()`, que consulta la base |
| **`revalidatePath` cuelga en las Server Actions de `(admin)`** | Ninguna action de esta fase lo llama |
| **`shadcn` (no `shadcn-ui`), Tailwind v4 con `@theme`** | No se corre el CLI. Un token nuevo, en `app/globals.css` |
| **Retención de 6 meses (Fase 9)** | Se toca de refilón: §17.2 declara que el enlace a un aseo borrado se reabre entonces, no ahora |

---

## State of the Art

| Enfoque anterior en este repo | Enfoque actual | Cuándo cambió | Impacto en esta fase |
|---|---|---|---|
| Ficha = página propia | Ficha = panel en `searchParams` | Fase 7 (`?pago=`), generalizado en la 8 | Es la fase entera |
| Abrir y cerrar los dos con `replace` | **Abrir con `push`, cerrar con `replace`** | §5.2 de esta fase | El criterio 3. Incluye alinear `/finanzas/pagos` |
| `page.waitForURL` para navegación de cliente | **`esperarUrlDeCliente()`** | 2026-09-13, medido | Las seis aserciones |
| `loading.tsx` en toda ruta del admin | **`/finanzas` sin él, a propósito** | commit `e12fb1c` | Hallazgo 3 |
| Lectura financiera por grant de tabla | **Grant por columna + función definer con guarda** | Migración 24 y 26 | El patrón que la migración nueva repite |
| Tarifas leídas de `properties` en la UI | **`tarifas_de_apartamentos()`** y, para un aseo, del propio aseo | Migración 24 | Por qué esa función no sirve aquí |

**Obsoleto o desactualizado en los contratos de esta fase:**

- `08-UI-SPEC.md` §14.4 afirma que `lib/domain/feeds.ts` y `saludDelFeed()` **ya existen**.
  No existen (Hallazgo 8).
- `08-UI-SPEC.md` §5.1 regla 4 generaliza a los cuatro paneles una validación que solo
  funciona en dos (Hallazgo 2).
- `08-UI-SPEC.md` §2.3 dice que el criterio 6 *"se comprueba con `git diff --name-only`"*.
  Es correcto como método y **no está implementado en ninguna parte** (Hallazgo 6).
- `.planning/DEFINICION-paneles-admin.md` conserva en su mitad superior las tres premisas
  que §0.1 ya desmintió (la ficha de apartamento, el calendario y "tocar la fila de un aseo
  no hace nada"). **Manda el UI-SPEC.**

---

## Assumptions Log

| # | Afirmación asumida | Sección | Riesgo si está mal |
|---|---|---|---|
| A1 | Un cambio solo de `searchParams` con `<Link>` **no** remonta el subárbol de `/apartamentos`, así que el filtro en `useState` sobrevive | Hallazgo 3 | **ALTO.** Si está mal, el criterio 1 es falso y hay que mover el filtro a la URL, que es trabajo de otra forma y otro tamaño. **Por eso hay un spike de Wave 0, no una suposición** |
| A2 | `Sheet` (Base UI `Dialog`) restaura la posición de scroll del `body` al cerrarse | Pattern 1 | MEDIO. Mitigado por el precedente en producción de `/finanzas/pagos` sobre una tabla larga, pero no medido sobre una lista de 39 filas con scroll profundo |
| A3 | Las cinco lecturas del panel de aseo en `Promise.all` caben en una latencia percibida aceptable sobre `/operacion`, que ya hace 8 | Presupuesto de consultas | MEDIO. Si no, la palanca es plegar gastos y daños en una segunda definer. **No se decide sin medir** |
| A4 | Dejar `aseos_de_aseadora` y `gastos_de_aseadora` en el schema sin llamador es preferible a borrarlas | Hallazgo 10 | BAJO. Es una decisión de higiene, reversible, y tiene aserciones pgTAP que las ejercen |
| A5 | El "periodo abierto" de D8-4 es el periodo de pago pendiente de cierre, no el rango del filtro | Hallazgo 9c | MEDIO. Si el dueño quería el rango del filtro, el número del panel cambia. **Es una interpretación de vocabulario, y la que hace verdadera la etiqueta `Lleva ganado`** |
| A6 | La lectura de §5.3 en la que el `<a>` envuelve el nombre y gana `aria-label` es la correcta | Pitfall 5 | BAJO. La alternativa produce un control sin nombre accesible, que §13 prohíbe |
| A7 | Un enlace externo a `/finanzas/aseadoras/{id}` no existe en ningún chat y su 404 es aceptable | Runtime State Inventory | BAJO |

---

## Open Questions

### Q1 (BLOQUEA el diseño de las waves) · ¿Sobrevive el filtro de `/apartamentos` a abrir un panel?

- **Lo que sabemos:** `TablaApartamentos` tiene tres `useState`; `/apartamentos` tiene
  `loading.tsx`; `/finanzas/pagos` funciona con las dos cosas; `/finanzas` se colgó con
  `loading.tsx` **y `useTransition`**; la doc de Next y su fixture dicen que por defecto no
  se remonta.
- **Lo que no está claro:** si `/apartamentos` se comporta como `pagos` (porque navega con
  `<Link>`) o como `/finanzas` (porque tiene `loading.tsx`).
- **Recomendación:** spike de Wave 0, 30 minutos, con el panel más tonto posible. No se
  resuelve leyendo: se resuelve abriendo el navegador. **Si el filtro se pierde**, moverlo a
  `searchParams` está alineado con D8-8 y no reabre nada.

### Q2 (BLOQUEA la forma de la lectura) · ¿Los reportes van en la definer o por PostgREST?

- **Lo que sabemos:** las policies de admin sobre `expenses` y `damages` existen y funcionan;
  meterlas en la definer las saca de la RLS; `/operacion` ya hace 8 consultas.
- **Lo que no está claro:** si cinco lecturas en paralelo más seis firmas se sienten
  instantáneas sobre `/operacion` con Realtime activo.
- **Recomendación:** empezar por PostgREST (menos superficie con `rolbypassrls`), medir con
  el panel abierto y una ráfaga de Realtime, y **solo si molesta** plegar reportes en una
  segunda definer con la forma de `gastos_de_aseadora`.

### Q3 (MENOR, pero toca el criterio 5) · ¿Cuántas aserciones E2E más se vacían con el portal?

- **Lo que sabemos:** una está identificada (`finanzas.spec.ts:631`).
- **Lo que no está claro:** cuántas más acotan por `main`, por el `<table>` de la página o
  por un contenedor de layout en los seis archivos que esta fase toca.
- **Recomendación:** un `grep` de `locator('main')`, `locator('table')` y
  `getByRole('table')` sobre los seis specs, y contra-prueba de cada aserción retargeteada
  (meter la cosa prohibida y comprobar que se pone roja). Es barato y es lo único que
  distingue "pasa" de "pasa mirando".

### Q4 (MENOR) · ¿Dónde viven las aserciones pgTAP nuevas?

- **Lo que sabemos:** `11_financiero.test.sql` tiene el arnés (`pg_temp.intento_como`,
  `pg_temp.valor_como`), el fixture de aseadora y admin, y una regla escrita de que todo
  bloque nuevo va al final subiendo `plan()`.
- **Lo que no está claro:** si un archivo `12_paneles.test.sql` propio es preferible por
  aislamiento.
- **Recomendación:** **extender `11`**. Un archivo nuevo duplica ~400 líneas de siembra y el
  arnés. El precio es heredar la mutilación del bloque G (sin el aseo J2 y sin el gasto del
  Detergente), que ya es una advertencia escrita para el bloque L y se repite para el nuevo.

---

## Sources

### Primary (HIGH confidence) · medidas contra este repo el 2026-09-17

- `supabase/migrations/20260913110000_24_frontera_del_aseador.sql` · el grant por columna,
  el inventario de consumidores, y `tarifas_de_apartamentos`
- `supabase/migrations/20260913130000_26_lecturas_financieras.sql` · las siete reglas, las
  tres trampas, y las seis definers con sus filtros
- `supabase/migrations/20260831221405_08_rls_policies.sql` · las 38 policies; las cuatro
  `*_admin_all` que hacen innecesaria una definer para checklist, fotos, gastos y daños
- `supabase/migrations/20260831220805_07_grants.sql` · qué tiene grant y qué no
- `supabase/migrations/20260831223038_09_rpc.sql:113-153` · `reveal_access_code()` y su
  `insert` en `access_code_reads`, el único del sistema
- `supabase/migrations/20260831212658_04_operacion.sql` · schema de `calendar_reservations`,
  `cleaning_checklist_items`, `cleaning_photos`, `damages`
- `supabase/migrations/20260831224030_10_storage.sql:76` · `evidencia_admin_all`
- `supabase/tests/11_financiero.test.sql` · el arnés de impersonación, el bloque D, la regla
  de ampliación y la bitácora de señuelos
- `app/(admin)/finanzas/pagos/page.tsx` y `_components/SheetDesglosePago.tsx` · el patrón de
  panel en la dirección, completo, con sus razones escritas
- `app/(admin)/finanzas/page.tsx` · la cabecera de 40 líneas sobre el `loading.tsx` que
  colgaba el filtro, con su medición de ocho corridas
- `app/(admin)/finanzas/_components/FiltroPeriodo.tsx` · la atenuación de los hijos y la
  preservación de parámetros en `ir()`
- `app/(admin)/apartamentos/_components/TablaApartamentos.tsx:119-121` · los tres `useState`
  del filtro
- `app/(admin)/operacion/page.tsx` y `lib/data/operacion.ts` · las 8 consultas y la ventana
  hoy−7 … hoy+6
- `app/(admin)/operacion/_components/FilaAseo.tsx` · el `::after`, el `z-10` y las tres
  reglas de comportamiento
- `app/(admin)/apartamentos/_actions.ts` · el orden obligatorio, `leerSecretos()` y sus
  cuatro campos
- `components/ui/sheet.tsx` · las tres desviaciones y el `SheetPortal`
- `lib/data/apartamentos.ts`, `finanzas-detalle.ts`, `recibos.ts`, `feeds.ts`, `pagos.ts`
- `lib/domain/checklist.ts` · `progresoTotal` y la duplicación declarada con su test de
  paridad
- `lib/domain/salud-sync.ts` · lo que existe en vez de `saludDelFeed()`
- `lib/utils.ts` · los grupos `max-w` y `font-size` de `cn()`
- `scripts/ci/check-service-role.sh` (guardarraíles 4, 7, 8, 9), `check-max-w-tallas.sh`,
  `check-escala-movil.sh`
- `e2e/fixtures.ts:365` · `esperarUrlDeCliente()` y su medición del 2026-09-13
- `e2e/apartamento-crud.spec.ts`, `apartamento-cuartos.spec.ts`, `finanzas.spec.ts`,
  `calendario.spec.ts` · las seis aserciones y el patrón T-02-74
- `package.json` y `node_modules` · versiones instaladas; los 26 iconos verificados por
  import en runtime

### Secondary (MEDIUM confidence) · documentación oficial vía Context7

- `github.com/vercel/next.js/blob/v15.4.0-canary.82/docs/01-app/05-api-reference/02-components/link.mdx`
  · el prop `scroll`, su valor por defecto, y `{ scroll: false }` en `router.push`/`replace`
- `github.com/vercel/next.js` · fixture `test/e2e/app-dir/searchparams-reuse-loading/` · que
  para disparar el fallback con un cambio de parámetros hay que **forzarlo** con una `key`

> La rama consultada es `v15.4.0-canary.82` porque Context7 no tiene 15.5.24. Las dos
> afirmaciones son de comportamiento estable de App Router, pero **no se verificaron contra
> la versión exacta que este proyecto usa**, y por eso son MEDIUM y por eso el spike de
> Wave 0 existe.

### Tertiary (LOW confidence)

Ninguna. No se usó ninguna afirmación que no esté medida en el repo o citada de
documentación oficial.

---

## Metadata

**Desglose de confianza:**

| Área | Nivel | Razón |
|---|---|---|
| Que hace falta una migración y cuál es su forma | **HIGH** | Los grants, las policies y el filtro de estado de `rentabilidad_aseos` se leyeron línea a línea |
| Qué lecturas se pueden reutilizar y cuáles son nuevas | **HIGH** | Se enumeraron los exports de `lib/data/` y `lib/domain/` y se cruzaron con §7 a §10 del UI-SPEC |
| Que el panel se portalea y eso vacía una aserción | **HIGH** | `SheetPortal` está en el código; la aserción por `main` está en la línea 631 |
| Que el criterio 6 no tiene guardarraíl | **HIGH** | Los tres scripts de `ci:arch` se leyeron completos |
| Que el código del admin no queda auditado | **HIGH** | El único `insert` en `access_code_reads` está en la migración 09 |
| Qué se rompe al borrar `/finanzas/aseadoras/[id]` | **HIGH** | Barrido completo del repo |
| El alcance real de las seis aserciones E2E | **HIGH** | Las seis se leyeron con su contexto |
| **Si el filtro y el scroll sobreviven a abrir un panel** | **MEDIUM** | Doc y fixture de Next + precedente de `/finanzas/pagos` apuntan a que sí; la medición de `/finanzas` apunta a que puede que no. **No se midió sobre `/apartamentos`** |
| El presupuesto de consultas | **MEDIUM** | Los conteos son exactos; la latencia percibida no se midió |
| Que 5 lecturas en paralelo son aceptables con Realtime | **MEDIUM** | Razonado, no medido |

**Research date:** 2026-09-17
**Valid until:** 2026-10-17 para lo medido contra el repo, que solo cambia si alguien cambia
el repo. Las dos afirmaciones de Next se revalidan si se sube de 15.5.24.
