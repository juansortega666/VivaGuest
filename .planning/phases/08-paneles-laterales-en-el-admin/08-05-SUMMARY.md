---
phase: 08-paneles-laterales-en-el-admin
plan: 05
subsystem: data
tags: [supabase, postgrest, rls, security-definer, storage, signed-url, vitest, integracion, checklist]

requires:
  - phase: 08-paneles-laterales-en-el-admin
    provides: "public.detalle_de_aseo(uuid) de la migración 28, con su firma ya en lib/database.types.ts"
  - phase: 07-finanzas
    provides: "lib/data/recibos.ts (firmarRecibo y la vida de 300 segundos), la regla de firmar solo lo que se mira de finanzas/pagos/page.tsx, y el patrón de varias lecturas en paralelo más firmas de la ficha de aseadora"
  - phase: 06-ejecuci-n-del-aseo
    provides: "lib/domain/checklist.ts (armarChecklist y progresoTotal) con su duplicación declarada y la advertencia contra una tercera"
  - phase: 04-operaci-n-diaria
    provides: "lib/test/aseos.ts, el arnés de siembra de aseos de las suites de integración"
provides:
  - "lib/data/panel-aseo.ts: leerPanelDeAseo(), la composición entera del panel de aseo en una latencia"
  - "MINIATURAS_VISIBLES (6), la constante del recorte de firmas, declarada en ese módulo"
  - "lib/data/panel-aseo.integration.test.ts: 9 casos contra Postgres real, con cuatro señuelos corridos"
affects: [08-07, 08-11, 08-12, 08-14]

tech-stack:
  added: []
  patterns:
    - "Reparto asimétrico de lectura: la definer primero y SOLA (cero filas corta las otras cuatro), y las cuatro colecciones después en un solo Promise.all. Cinco viajes que cuestan una latencia, no cinco"
    - "Los nulos de un `returns table` se escriben a mano en el tipo de salida: el generador del CLI declara todas las columnas no nulas y la base no lo es"
    - "El recorte de lo que se firma va ANTES de firmar, y el conteo total se conserva aparte: la lista se lee entera porque el conteo es un dato de pantalla"
    - "La posición viaja con la firma: una foto sin URL ocupa su sitio en la tira en vez de desaparecer del conteo"

key-files:
  created:
    - lib/data/panel-aseo.ts
    - lib/data/panel-aseo.integration.test.ts
  modified: []

key-decisions:
  - "Se reusa `identificadorValido()` de lib/data/finanzas-detalle.ts en vez de escribir una cuarta copia de la expresión regular de forma de identificador. El módulo queda acoplado a uno de finanzas, y se prefirió eso a una copia más"
  - "La etiqueta del diálogo de cada foto (el cuarto, el concepto o la descripción) se resuelve AQUÍ contra las colecciones que la misma lectura ya trajo, no en el componente: es cero viajes extra y le quita una derivación a la pantalla"
  - "No se añade un colador de dinero tipo `enteroDeDinero`: las tres cifras salen casteadas a entero ancho desde el cuerpo de la definer (regla 4 de la migración 26), no hay ninguna agregación que las convierta en cadena, y la aserción 105 del bloque P ya mide sus valores. Importarlo habría exigido exportarlo desde un tercer archivo, fuera de los dos que el plan declara"
  - "Se firman seis incluso cuando hay más de seis, aunque §10.3 solo pinte cinco miniaturas en ese caso: la capa de lectura no tiene que conocer la decisión de maquetación de la casilla de +{N}. La URL de más está declarada por escrito en la constante, con el sitio del recorte señalado"
  - "Los saltos de cuarto NO entran en la lectura: `armarChecklist` los acepta, pero un cuarto saltado no tiene tareas que contar y no mueve ninguno de los dos números del progreso"

patterns-established:
  - "Señuelo por cada garantía del módulo antes de darlo por bueno, con el radio real anotado: cuatro corridas, cada una poniendo en rojo exactamente lo que le tocaba"

requirements-completed: []

coverage:
  - id: D1
    description: "leerPanelDeAseo compone la cabecera, el progreso, la evidencia, los reportes y las tres cifras de un aseo completado"
    verification:
      - kind: integration
        ref: "lib/data/panel-aseo.integration.test.ts › un aseo completado trae cabecera, progreso, evidencia, reportes y las tres cifras"
        status: pass
    human_judgment: false
  - id: D2
    description: "Un aseo EN CURSO devuelve fila con progreso parcial, inicio puesto y fin nulo: lo que rentabilidad_aseos no puede"
    verification:
      - kind: integration
        ref: "lib/data/panel-aseo.integration.test.ts › un aseo EN CURSO devuelve fila, que es lo que rentabilidad_aseos no puede"
        status: pass
    human_judgment: false
  - id: D3
    description: "Un aseo pendiente SIN CONFIRMAR da progreso de cero sobre cero, y la rama que distingue es total igual a cero"
    verification:
      - kind: integration
        ref: "lib/data/panel-aseo.integration.test.ts › un aseo pendiente SIN CONFIRMAR da progreso de cero sobre cero, y no es un error"
        status: pass
    human_judgment: false
  - id: D4
    description: "Un aseo sin fotos devuelve la tira vacía y conteo cero, sin firmar nada"
    verification:
      - kind: integration
        ref: "lib/data/panel-aseo.integration.test.ts › un aseo sin fotos devuelve la tira vacía y conteo cero, sin firmar nada"
        status: pass
    human_judgment: false
  - id: D5
    description: "Una unidad de gestión externa devuelve fila, con la marca de gestión propia en falso y las tres cifras en cero"
    verification:
      - kind: integration
        ref: "lib/data/panel-aseo.integration.test.ts › una unidad de gestión externa devuelve fila, con la marca en falso y las cifras en cero"
        status: pass
    human_judgment: false
  - id: D6
    description: "Con más de seis fotos se firman exactamente seis y el conteo total refleja todas (T-08-19)"
    verification:
      - kind: integration
        ref: "lib/data/panel-aseo.integration.test.ts › con más de seis fotos se firman exactamente seis y el conteo refleja todas"
        status: pass
      - kind: other
        ref: "señuelo 1: MINIATURAS_VISIBLES subida a 8 → solo ese caso en rojo"
        status: pass
    human_judgment: false
  - id: D7
    description: "Con una sesión de aseadora, la lectura del panel no devuelve datos"
    verification:
      - kind: integration
        ref: "lib/data/panel-aseo.integration.test.ts › una aseadora no obtiene datos de un aseo ajeno"
        status: pass
    human_judgment: false
  - id: D8
    description: "El progreso sale de la función del dominio y no de una cuenta nueva (T-08-22)"
    verification:
      - kind: other
        ref: "grep -c 'progresoTotal' → 3 · grep -cE '\\.filter\\(.*done_at' → 0 · señuelo 3: cuenta a mano → tres casos en rojo"
        status: pass
    human_judgment: false
  - id: D9
    description: "Una foto borrada no entra en la tira ni en el conteo, y una sin URL conserva su posición"
    verification:
      - kind: integration
        ref: "lib/data/panel-aseo.integration.test.ts › una foto borrada no entra en la tira ni en el conteo"
        status: pass
      - kind: other
        ref: "señuelo 2: quitado el filtro de borradas → dos casos en rojo"
        status: pass
    human_judgment: false

duration: 38min
completed: 2026-09-17
status: complete
---

# Fase 8 Plan 05: La composición de la lectura del panel de aseo

**Cinco lecturas que cuestan una latencia, seis firmas por apertura y ninguna cuenta duplicada: la definer va primero y sola, y las cuatro colecciones van después en una sola espera, por RLS.**

## Performance

- **Duración:** ~38 min
- **Empezado:** 2026-09-17 20:35 (-05)
- **Terminado:** 2026-09-17 21:13 (-05)
- **Tareas:** 2 de 2
- **Archivos:** 2 creados, 0 modificados

## Lo que quedó hecho

- **`leerPanelDeAseo(supabase, aseoId)`**, en `lib/data/panel-aseo.ts` (443 líneas). Devuelve el panel entero o nulo. La función definer va primero y sola, y si no da fila las otras cuatro lecturas ni se hacen: no es una frontera de seguridad (cada tabla tiene su policy de admin desde la migración 08), es no hacer cuatro viajes por nada. Las cuatro colecciones van en un solo `Promise.all`, así que cuestan una latencia y no cuatro, que es el espíritu de §10.4 regla 2 sin pagar su coste.
- **Las cuatro proyecciones están enumeradas**, ni un comodín. Con grants por columna, un comodín es una bomba que estalla la próxima vez que alguien añada una columna sensible, y esa lección la pagó el plan 07-05.
- **El progreso sale de `progresoTotal(armarChecklist(...))`**, que es la misma función que usa la pantalla del aseador. Contarlo en SQL sería la tercera copia; contarlo en el componente sería la cuarta, y la cabecera de `lib/domain/checklist.ts` advierte por escrito contra la tercera.
- **El recorte va antes de firmar.** La lista de fotos se lee entera porque el conteo total es un dato de pantalla (la casilla de `+{N}`) y no se puede derivar de seis; lo que se recorta es lo que se firma, con la constante `MINIATURAS_VISIBLES` declarada en el módulo y con la geometría de §10.3 escrita en su comentario.
- **La posición viaja con la firma.** Una foto cuyo objeto ya no está no produce URL, pero conserva su sitio en la tira: hacerla desaparecer cambiaría el conteo y haría creer que había menos evidencia.
- **El título del diálogo de cada foto se resuelve aquí**, contra el checklist, los gastos y los daños que la misma lectura ya trajo. Cero viajes extra y una derivación menos para el componente de 08-07.
- **El test de integración**, 556 líneas y **9 casos**, contra Postgres real y con JWT reales. Los seis que el plan pide, más el de la frontera con sesión de aseadora, más el de la foto borrada y el del identificador mal formado.

## Los commits por tarea

1. **Task 1: la composición de la lectura** — `76627da` (feat)
2. **Task 2: el test de integración contra la base real** — `53de2bc` (test)

## Archivos

| Archivo | Qué hace |
|---|---|
| `lib/data/panel-aseo.ts` (443 líneas, nuevo) | La definer más cuatro lecturas en paralelo más hasta seis firmas, con la cabecera que explica el reparto y el presupuesto medido |
| `lib/data/panel-aseo.integration.test.ts` (556 líneas, nuevo) | Los nueve casos, con sus controles y con los cuatro señuelos anotados |

## Los cuatro señuelos, con su resultado real

Ninguno de los nueve casos se escribió sin comprobar que muerde. Cada señuelo se corrió de verdad, con la restauración después.

| # | Qué se rompió | Qué se puso rojo | ¿Aísla lo que debe? |
|---|---|---|---|
| 1 | `MINIATURAS_VISIBLES` subida de 6 a 8 | **Solo** el caso de más de seis fotos (`expected length 6 but got 8`) | Sí, exacto. Es la razón de que el seis vaya **literal además de por la constante**: contra la constante sola, subirla habría seguido pasando |
| 2 | Quitado el filtro de fotos borradas | El caso del aseo completado (`expected 4 to be 3`) **y** el de la foto borrada | Sí, y el radio mayor es correcto: el conteo total del completado también cambia |
| 3 | El progreso contado a mano en vez de con la función del dominio | Los **tres** casos que afirman progreso: completado (4/4 en vez de 3/4), en curso (9/9 en vez de 2/9) y confirmado (3/3 en vez de 0/3) | Sí. Es T-08-22 medido: una cuenta propia se desincroniza y los tres lo dicen |
| 4 | Quitado el corte por fila nula de la definer | El caso del identificador mal formado, con `TypeError: Cannot read properties of undefined` | Sí. Y de paso deja medido que sin ese corte el fallo NO es un nulo limpio: es una excepción de tipo |

El señuelo 4 tiene un dato incómodo que vale la pena dejar escrito: **`npx tsc --noEmit` no lo atrapó**. `detalle?.[0]` se tipa como no indefinido porque el proyecto no tiene activada la comprobación de acceso por índice, así que el compilador dejó pasar la versión rota. Lo atrapó el test, no el tipo.

## Decisiones

**1. Se reusa `identificadorValido()` en vez de escribir una cuarta copia.** El repo ya tiene la misma expresión regular en `lib/data/aseo-aseador.ts` y en `lib/data/finanzas-detalle.ts`. El módulo del panel queda importando de uno de finanzas, que es un acoplamiento raro de leer, y se prefirió eso a una copia más. El identificador llega de la dirección, o sea de fuera, y sin la guarda una cadena arbitraria llega a Postgres como argumento de tipo identificador, responde con error de sintaxis de tipo y la pantalla se cae con un fallo que no sabe explicar.

**2. Sin colador de dinero.** `lib/data/finanzas-detalle.ts` tiene `enteroDeDinero()` para la frontera donde llega la fila cruda, pero es privada de ese archivo. Aquí no hace falta y no se duplica: las tres cifras salen casteadas a entero ancho desde el cuerpo de la definer (regla 4 de la migración 26), no hay ninguna agregación que las convierta en cadena, y la aserción 105 del bloque P ya mide sus valores contra la base. El test de integración además comprueba el tipo del monto del gasto de verdad (`typeof … === 'number'`), que es el único que viene de una tabla y no de la definer.

**3. Los nulos del `returns table` se escriben a mano.** El generador del CLI declara todas las columnas de una función como no nulas, y en la base no lo son: `estado` llega nulo en un informativo (`cl_unmanaged_is_inert`), `aseadorId` y `aseador` en un aseo sin asignar, `iniciadoAt` en uno pendiente y `terminadoAt` en uno en curso. Confiar en el tipo generado habría hecho que el compilador dijera que `estado` siempre está, y la pantalla se habría caído sobre el primer informativo. El caso 5 del test lo mide.

**4. Seis firmas incluso cuando hay más de seis fotos, y está declarado.** §10.3 pinta cinco miniaturas más la casilla de `+{N}` cuando hay más de seis, así que en ese caso **se emite exactamente una URL de más**. Se firma igual, a propósito, para que la capa de lectura no tenga que conocer la decisión de maquetación de la casilla. Está escrito en el comentario de la constante, con el sitio del recorte señalado por si algún día molesta. **No es una desviación del plan**: el plan y el registro de amenazas piden seis y la aserción de conteo exacto es sobre seis.

**5. La etiqueta de cada foto se resuelve en esta capa.** El diálogo de §10.3 lleva por título el cuarto o el concepto. Resolverlo contra el checklist, los gastos y los daños que la misma lectura ya trajo cuesta tres mapas en memoria y cero viajes; dejárselo al componente le habría obligado a cruzar tres listas. Es la parte (e) del plan llevada a su conclusión: que la pantalla no derive nada.

## Desviaciones del plan

Ninguna. El plan se ejecutó tal como está escrito.

Lo único que se añadió por encima de lo pedido son **tres casos de prueba de más** (la foto borrada con su control, el identificador mal formado, y la contraprueba del aseo confirmado dentro del caso 3), y se documenta aquí en vez de como desviación porque no cambia ningún contrato: son aserciones sobre garantías que la Task 1 ya tenía en sus criterios de aceptación y que sin estos casos se habrían quedado sin medir.

## Las aserciones de grep de la Task 1, una por una

| Criterio | Esperado | Real |
|---|---|---|
| `grep -c "select('\*')"` | 0 | **0** |
| `grep -c "progresoTotal"` | ≥ 1 | **3** |
| `grep -cE "\.filter\(.*done_at"` | sin cuenta a mano | **0** |
| `grep -c "properties"` | 0 | **0** |
| `grep -c "42501\|PGRST301"` | 0 | **0** |
| `grep -c "detalle_de_aseo"` | presente | **1** |
| `grep -c "firmarRecibo"` | presente | **3** |
| líneas de `lib/data/panel-aseo.ts` | ≥ 120 | **443** |
| líneas del test | ≥ 120 | **556** |

El único `.length` del módulo es `todasLasFotos.length`, que es el conteo total de la tira. Ninguna tarea del checklist se cuenta a mano.

## Las cuatro suites, antes y después

| Suite | Antes | Después | Delta |
|---|---|---|---|
| `npm run test:integration` | 196 (22 archivos) | **205** (23 archivos) | **+9**, los de este plan |
| `npm run test:unit` | 1229 | **1229** | 0 |
| `npm run db:test` (pgTAP) | 380 | **380** | 0. Este plan no toca la base |
| `npx tsc --noEmit` | limpio | **limpio** | — |

`npm run lint`: **0 errores**, los 2 avisos preexistentes en archivos de test. `npm run ci:arch`: los tres guardarraíles limpios. `git diff --name-only` contra `app/(cleaner)`: **vacío**, criterio 6 del ROADMAP intacto.

## Problemas encontrados

**Las firmas de este arnés son todas `firma_fallida`, y no es un defecto.** El arnés no sube nada a Storage, misma decisión que el escenario financiero de `lib/test/aseos.ts`: lo que hay que producir es la fila que enlaza el aseo con su evidencia, que es lo que la tira recorre. Consecuencia: el almacenamiento no encuentra el objeto y el desenlace es el fallo de firma.

Eso resultó ser **exactamente el caso que §10.3 declara**, no una limitación: una foto purgada no abre nada y tampoco desaparece de la tira. Por eso las aserciones miran la **posición** y la **presencia** del desenlace, y nunca que el desenlace sea `firmado`. Está escrito en la cabecera del archivo de pruebas para que nadie lo "arregle" subiendo objetos de verdad al bucket.

**El arnés no siembra checklist, y hubo que sembrarlo aquí.** No es un olvido suyo: las tareas las materializa `confirm_cleaning` y el arnés inserta los aseos directamente. La siembra de tareas se quedó **acotada a este archivo** y no se subió a `lib/test/aseos.ts`: nadie más la pide todavía, y subirla al arnés sería ampliar una superficie compartida por un solo consumidor. Los cuartos que el checklist exige por clave foránea se crean sobre el apartamento del arnés y se borran **después** de los aseos, porque `cleaning_checklist_items.property_room_id` es `on delete restrict` y no cae por cascada.

## Lo que queda listo para lo que viene

**`08-07` (el panel de aseo) solo tiene que pintar.** Importa:

```ts
import { leerPanelDeAseo, MINIATURAS_VISIBLES } from '@/lib/data/panel-aseo';
```

Y recibe, sin derivar nada:

- `cabecera`: apartamento con su identificador para el enlace de §10.2, marca de gestión propia (**el interruptor para no pintar el grupo de dinero de un informativo**), fecha, estado ya tipado como el enum, persona a cargo, los dos instantes y las tres cifras.
- `progreso`: `{ hechas, total }`. **La rama de ausencia es `total === 0`**, no `hechas === 0`.
- `fotos`: como máximo seis, cada una con `posicion`, `tipo`, `etiqueta` (el título del diálogo, ya resuelto), `tomadaAt`, `creadaAt` y `firma` con sus tres desenlaces.
- `totalDeFotos`: el conteo entero, para la casilla de `+{N}`.
- `gastos` y `danos`, para la lista única del grupo de reportes.

**Lo que 08-07 todavía tiene que poner de su parte:**

1. **El formato.** Esta capa no formatea dinero ni fechas: eso va con los formateadores que ya existen.
2. **El copy de ausencia.** Esta capa devuelve la forma; el texto es de la pantalla.
3. **NO escribir una rama de permiso denegado.** §10.4 regla 1: si la definer deniega es un defecto y se va por el `error.tsx` de la ruta.
4. **La decisión de la casilla de `+{N}`**, que ocupa la sexta posición cuando hay más de seis. La sexta firma llega igual y no se usa en ese caso.
5. **No pintar el grupo de dinero cuando `gestionPropia` es falso.** La lectura devuelve la fila igual, con las cifras en cero.

## Deuda declarada

- **El presupuesto de Realtime no está medido en vivo.** `/operacion` hace hoy 8 consultas y este panel le suma 5 más hasta 6 firmas; ante una ráfaga de quince eventos en una transacción son hasta 90 firmas de 300 segundos. Está escrito en la cabecera del módulo con la palanca nombrada (**acotar el disparo del refresco**, no cambiar el contrato de las seis firmas). Es T-08-21, disposición `accept`. Lo mide `08-11`.
- **La palanca de Q2 sigue sin tirarse, a propósito.** Si la medición dijera que cinco lecturas no alcanzan, se pliegan gastos y daños en una segunda definer con forma de unión. No se hace hoy: la recomendación del research es empezar por PostgREST, que es menos superficie corriendo con salto de la seguridad de fila.
- **Una URL firmada de más por apertura** cuando el aseo tiene más de seis fotos. Declarada en el comentario de `MINIATURAS_VISIBLES`, con el sitio del recorte señalado.

---
*Fase: 08-paneles-laterales-en-el-admin*
*Terminado: 2026-09-17*

## Self-Check: PASSED

- `lib/data/panel-aseo.ts` — FOUND (443 líneas)
- `lib/data/panel-aseo.integration.test.ts` — FOUND (556 líneas)
- `76627da` — FOUND
- `53de2bc` — FOUND
