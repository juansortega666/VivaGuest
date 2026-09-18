---
phase: 08-paneles-laterales-en-el-admin
plan: 01
subsystem: database
tags: [postgres, plpgsql, security-definer, rls, pgtap, supabase, fin-01]

requires:
  - phase: 07-finanzas
    provides: "la migración 24 (el grant por columna que sacó tarifa_huesped y pago_aseador), la 26 (las siete reglas de las definer financieras) y el fixture entero de 11_financiero.test.sql"
  - phase: 02-acceso-y-administracion-del-catalogo
    provides: "private.is_admin(), la guarda de rol contra profiles en vivo"
provides:
  - "public.detalle_de_aseo(uuid): la única lectura de base de datos que la Fase 8 necesita, con las tres cifras congeladas del aseo"
  - "El bloque P de 11_financiero.test.sql: aserciones 102 a 105, con sus cuatro señuelos corridos y anotados"
  - "La firma de la función en lib/database.types.ts, sin deriva"
affects: [08-02, 08-03, 08-04, panel-lateral-de-aseo, finanzas]

tech-stack:
  added: []
  patterns:
    - "Una definer de lectura por identificador, sin agregación y por tanto sin filtro de gestión propia, con la marca is_managed viajando en la salida para que la pantalla decida"
    - "Restauración de fixture desde el valor capturado con \\gset y pg_catalog.format, en vez de un literal adivinado"

key-files:
  created:
    - supabase/migrations/20260917100000_28_detalle_de_aseo.sql
  modified:
    - supabase/tests/11_financiero.test.sql
    - lib/database.types.ts

key-decisions:
  - "La función no filtra por estado del aseo, y está escrito por su nombre en el cuerpo: ese filtro es justo lo que descalifica a rentabilidad_aseos para un panel que se abre sobre aseos vivos"
  - "La función no filtra por gestión propia: no hay agregación que contaminar, y el informativo devuelve su fila con las cifras en cero para que la pantalla lea is_managed y decida no pintar el grupo de dinero"
  - "Checklist, fotos, gastos y daños se quedan fuera de la definer: ya los cubren las cuatro policies de admin de la migración 08, y meterlos aquí los sacaría de la RLS sin comprar ninguna garantía"
  - "El estado sale como el enum public.cleaning_state y no como text, para que el archivo de tipos le entregue a TypeScript la unión de los cuatro valores en vez de un string cualquiera"
  - "La restauración de la tarifa en la aserción 105 se hace desde el valor capturado, no desde el literal 200000: si el bloque F cambia sus cifras, el bloque P sigue siendo correcto sin que nadie lo toque"

patterns-established:
  - "Par de señuelos para toda guarda de rol: uno que la quita (aísla la aserción negativa) y otro que deniega a todo el mundo (aísla la positiva). Las dos formas de «guarda al revés» no son la misma y solo la de denegar aísla la positiva"

requirements-completed: []

coverage:
  - id: D1
    description: "public.detalle_de_aseo(uuid) devuelve la cabecera del panel y las tres cifras, y solo a un admin activo"
    verification:
      - kind: integration
        ref: "supabase/tests/11_financiero.test.sql#102 una aseadora recibe 42501"
        status: pass
      - kind: integration
        ref: "supabase/tests/11_financiero.test.sql#103 el admin obtiene exactamente una fila"
        status: pass
    human_judgment: false
  - id: D2
    description: "La lectura responde sobre un aseo EN CURSO, que es lo que rentabilidad_aseos no puede"
    verification:
      - kind: integration
        ref: "supabase/tests/11_financiero.test.sql#104 el aseo en_curso devuelve fila"
        status: pass
    human_judgment: false
  - id: D3
    description: "FIN-01 desde esta función: mover la tarifa viva del apartamento no mueve ninguna de las tres cifras del aseo"
    verification:
      - kind: integration
        ref: "supabase/tests/11_financiero.test.sql#105 cobrado sigue en 90000 con el apartamento en 777000"
        status: pass
    human_judgment: false
  - id: D4
    description: "Los cuatro señuelos corridos de verdad, cada uno poniendo en rojo lo que le toca, y anotados en la bitácora de la cabecera"
    verification:
      - kind: other
        ref: "cuatro corridas de npm run db:reset + npm run db:test con la migración 28 rota a propósito"
        status: pass
    human_judgment: false
  - id: D5
    description: "La compuerta de schema: tipos regenerados sin deriva y las cuatro suites en su línea base"
    verification:
      - kind: other
        ref: "npm run db:types:check && npx tsc --noEmit && npm run ci:arch && npm run test:unit && npm run test:integration"
        status: pass
    human_judgment: false

duration: 34min
completed: 2026-09-17
status: complete
---

# Fase 8 Plan 01: La migración 28, el detalle de aseo del panel lateral

**Una lectura definer nueva para las dos únicas columnas que la migración 24 le cerró al panel, con la guarda de admin como primera sentencia y sin el filtro de estado que volvería inútil a la función sobre un aseo vivo.**

## Performance

- **Duración:** 34 min
- **Empezó:** 2026-09-17T10:20:00Z
- **Terminó:** 2026-09-17T10:54:00Z
- **Tareas:** 3 de 3
- **Archivos modificados:** 3

## Lo que se hizo

- **`public.detalle_de_aseo(uuid)`**, una fila por identificador con apartamento, marca de gestión propia, fecha programada, estado, persona a cargo, los dos instantes de ejecución y las tres cifras (cobrado, pagado, margen). Definer con camino de búsqueda vacío, guarda de admin como primera sentencia ejecutable, y el par de `revoke` más `grant` pegado a la definición.
- **El bloque P de `11_financiero.test.sql`**, cuatro aserciones nuevas (102 a 105), `plan(101)` subido a `plan(105)`, y ni un número anterior movido de sitio.
- **Los cuatro señuelos corridos de verdad**, cada uno con `db:reset` antes y la reversión después, y los cuatro pusieron algo en rojo a la primera. Dos de ellos con un radio distinto al que el plan predijo, y las dos correcciones quedaron escritas en la bitácora del archivo.
- **La compuerta de schema completa** en su orden: `db:reset`, `db:types`, `db:types:check`, `db:test`, más `tsc`, las dos suites de Vitest y `ci:arch`.

## Los commits por tarea

1. **Task 1: la función de lectura del detalle** — `0c21063` (feat)
2. **Task 2: el bloque P y los cuatro señuelos** — `2ede1cd` (test)
3. **Task 3 [BLOCKING]: la compuerta de schema** — `bb7c6b9` (chore)

## Archivos

- `supabase/migrations/20260917100000_28_detalle_de_aseo.sql` (nuevo, 186 líneas) — la única migración de la fase.
- `supabase/tests/11_financiero.test.sql` — el bloque P al final, el plan subido a 105, la bitácora de señuelos ampliada con cinco filas y el índice de «qué bloque lo pone en verde» con su línea de P.
- `lib/database.types.ts` — la firma de la función nueva, 18 líneas generadas.

## Los cuatro señuelos, con su resultado real

| # | Qué se rompió | Qué se puso rojo | ¿Coincide con lo que el plan predijo? |
|---|---|---|---|
| 7 | La guarda FUERA del cuerpo | **Solo la 102** | Sí, exacto |
| 8 | La guarda cambiada por una que **deniega a todo el mundo** (`if true`) | **103, 104 y 105. La 102 verde** | Sí, y es el punto entero del par |
| 8b | **Variante medida:** quitarle el `not` a la guarda en vez de negarla entera | **Las cuatro, la 102 incluida** | **No.** El plan decía «invertir la condición, y la 102 seguiría verde». Falso: quitar el `not` no deniega a todo el mundo, **deja pasar a cualquiera**, así que la 102 también cae |
| 9 | `and c.state = 'completada'` añadido al `where` | **103, 104 y 105** | **No exactamente.** Se esperaba solo la 104. El radio real es mayor porque los dos aseos que el bloque usa están vivos (`pendiente` y `en_curso`) y ninguno pasa ese filtro |
| 10 | Las tres cifras leídas del apartamento en vez del aseo | **Solo la 105** | Sí, exacto |

Ninguno de los cuatro se quedó sin poner nada en rojo, así que **no hubo hallazgos del tipo de los señuelos 1 y 2 de la Fase 7**. La razón es estructural y vale la pena dejarla escrita: aquí no hay una segunda capa sosteniendo ninguna de las cuatro garantías, porque la función es nueva y no existe ningún CHECK ni ningún índice que la respalde por detrás. Es lo contrario del caso de FIN-05, donde `cl_unmanaged_is_inert` tapaba al filtro `is_managed`.

Las dos correcciones (8b y 9) están anotadas en la bitácora del propio archivo de pruebas, no solo aquí: quien toque este bloque dentro de un año va a leer el radio real, no la predicción.

## Las cuatro suites, antes y después

| Suite | Antes | Después | Delta |
|---|---|---|---|
| `npm run db:test` (pgTAP, 12 archivos) | 376 | **380** | +4, las del bloque P |
| `npm run test:unit` | 1201 | **1201** | 0 |
| `npm run test:integration` | 196 | **196** | 0 |
| `npx tsc --noEmit` | limpio | **limpio** | — |

`npm run db:lint`, `npm run db:advisors` (con `--fail-on error`) y `npm run ci:arch` (los tres guardarraíles, incluido el 4) salieron limpios. `npm run db:types:check` limpio **después** de regenerar, que es el orden que importa.

## Decisiones

- **El estado sale como el enum `public.cleaning_state`, no como `text`.** El archivo de tipos generado le entrega a TypeScript `Database["public"]["Enums"]["cleaning_state"]`, o sea la unión de los cuatro valores, en vez de un `string` que el panel tendría que validar a mano. No estaba especificado en el plan, que solo decía «el estado».
- **La restauración de la tarifa en la 105 va desde el valor capturado con `\gset`, no desde el literal `200000`.** El bloque F deja el Apto 7A en 200000/99000 hoy; si algún día cambia esas cifras, un literal en el bloque P dejaría el fixture contaminado en silencio. Con `pg_catalog.format` y `split_part` sobre lo capturado, la restauración sigue siendo correcta sin que nadie la toque.
- **`is_managed` viaja en la salida.** Es lo que le permite a la pantalla decidir no pintar el grupo de dinero de un informativo, que es la contrapartida de no meter el filtro de gestión propia en la consulta.

## Desviaciones del plan

### Ajustes automáticos

**1. [Regla 3 - Bloqueante] Dos comentarios de la migración disparaban los greps de guardarraíl del propio plan**

- **Encontrado en:** Task 1
- **Problema:** los criterios de aceptación exigen que `grep -c "pr.tarifa_huesped\|pr.pago_aseador"` y `grep -c "state = 'completada'"` devuelvan **0** sobre el archivo de la migración. Mis comentarios nombraban las dos cosas prohibidas literalmente («JAMÁS `pr.tarifa_huesped`», «es exactamente el `c.state = 'completada'` que descalifica a `rentabilidad_aseos`»), así que los dos greps devolvían 1 y 2.
- **Arreglo:** reescribí los tres comentarios para decir lo mismo en prosa («la tarifa del apartamento por su alias», «el filtro de aseo completado»). El grep vuelve a ser un guardarraíl usable en vez de un detector de comentarios.
- **Archivos:** `supabase/migrations/20260917100000_28_detalle_de_aseo.sql`
- **Verificación:** los cuatro greps de aceptación de la Task 1, corridos uno por uno.
- **Commiteado en:** `0c21063`

**2. [Regla 1 - Corrección] El señuelo 2 del plan estaba mal especificado**

- **Encontrado en:** Task 2
- **Problema:** el plan pide «invertir la condición de la guarda» y predice que eso pondría roja **solo la 103**, con la 102 quedándose verde. Medido: invertir la condición (quitarle el `not`) hace que la guarda **deje pasar a cualquiera**, así que la aseadora también entra y la **102 cae con las otras tres**. La predicción del plan solo se cumple con una guarda que **deniegue a todo el mundo**.
- **Arreglo:** corrí las dos variantes. La de denegar (`if true then raise`) aísla la 103 tal como el plan quería, y esa es la que quedó anotada como señuelo 8. La variante del plan quedó anotada como 8b con su resultado real y la explicación de por qué las dos no son la misma cosa.
- **Archivos:** `supabase/tests/11_financiero.test.sql` (bitácora de la cabecera)
- **Verificación:** dos corridas completas de `db:reset` más `db:test`, una por variante.
- **Commiteado en:** `2ede1cd`

---

**Total de desviaciones:** 2 arregladas automáticamente (1 de Regla 3, 1 de Regla 1).
**Impacto:** ninguno sobre el alcance. La primera es cosmética con consecuencia real (el guardarraíl vuelve a funcionar); la segunda corrige una afirmación falsa del plan y deja la corrección escrita donde se va a leer.

## Problemas encontrados

Ninguno que bloqueara. Se verificó ejecutando (no suponiendo) que los dos aseos que el bloque P usa sobreviven al borrado del bloque G: el 302 (`pendiente`, hoy, Apto 7A, 90000/40000) y el 401 (`en_curso`, mañana, Apto 7B, 150000/55000). Los dos devuelven fila.

## Configuración manual requerida

Ninguna. No hay proyecto Supabase enlazado en este repo (`linked_project: null`), así que la migración 28 vive solo en la base local hasta que alguien enlace un proyecto. No aplica ningún `db push`.

## Lo que queda listo para lo que viene

- `public.detalle_de_aseo(uuid)` está disponible para el panel de aseo de los planes siguientes de la Fase 8, con su firma ya en `lib/database.types.ts`.
- **Lo que el panel NO debe pedirle a esta función:** checklist, fotos, gastos y daños. Esos se leen por RLS con las policies de admin de la migración 08. Está escrito en el comentario de la función para que nadie lo "arregle" ampliándola.
- **La marca `is_managed` de la salida es el interruptor del grupo de dinero.** Un apartamento informativo devuelve fila con las tres cifras en cero; la pantalla decide no pintarlas. La función no filtra por eso a propósito.
- Ningún archivo bajo `app/(cleaner)` se movió: el diff de este plan son exactamente tres archivos.

---
*Fase: 08-paneles-laterales-en-el-admin*
*Terminado: 2026-09-17*

## Self-Check: PASSED

Los tres archivos del diff existen en disco, los tres hashes de commit existen en el historial, y la migración tiene 186 líneas (el plan exigía al menos 90).
