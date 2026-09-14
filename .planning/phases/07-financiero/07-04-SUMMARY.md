---
phase: 07-financiero
plan: 04
subsystem: database
tags: [postgres, migracion, rls, timezone, snapshot-contable, retencion, bigint]

requires:
  - phase: 01-fundaciones
    provides: "`public.today_bog()`, `public.app_settings`, `private.is_admin()`, el patrón de revoke/grant al lado de cada función y el precedente de `access_code_reads.cleaning_id` sin cascada"
  - phase: 07-financiero
    provides: "`supabase/tests/11_financiero.test.sql` (plan 07-01), que es el contrato de nombres normativo de esta migración"
provides:
  - "`public.ultimo_dia_habil_del_mes(date)` — el día de cierre de cualquier mes, sin festivos, verificado contra fuerza bruta en 36 meses"
  - "`public.dia_bog(timestamptz)` — la conversión a día de negocio de Bogotá que decide a qué periodo pertenece un aseo"
  - "`public.periodo_de_cierre(date)` — el periodo de cierre a cierre, sin días huérfanos"
  - "`public.foto_vencida(text, timestamptz)` + `app_settings.expense_photo_retention_days` — el recibo de gasto dura cinco años"
  - "`public.payout_periods`, `public.cleaner_payouts`, `public.cleaner_payout_lines` — el snapshot financiero sin una sola cascada hacia el mundo vivo"
  - "`lib/database.types.ts` regenerado desde la base"
affects: [07-05, 07-06, 07-07, 07-08, 07-09, 07-10, 07-11, 07-12, 07-13, 07-14]

tech-stack:
  added: []
  patterns:
    - "Puntero de conveniencia SIN clave foránea, para que un documento contable sobreviva a la purga del mundo vivo que lo originó"
    - "Tabla con RLS y policy pero SIN grant para `authenticated`: la frontera es la ausencia de privilegio, la policy existe para que el día que alguien añada el grant la restricción ya esté puesta"
    - "Clave de configuración sembrada desde la MIGRACIÓN y no desde `supabase/seeds/`, porque los seeds no se aplican en producción"
    - "`pg_catalog.date_part('isodow', …)` en vez de la sintaxis de extracción, que no se puede calificar por esquema"

key-files:
  created:
    - supabase/migrations/20260913100000_23_calendario_y_snapshot.sql
  modified:
    - lib/database.types.ts

key-decisions:
  - "Tres tablas y no dos (desviación declarada del research): `payout_periods` existe para que un periodo sin ninguna aseadora con aseos deje rastro, para que la idempotencia de D7-3 sea por PERIODO y no por persona, y porque el contador de aseos no computados pertenece al periodo"
  - "Los tres punteros al mundo vivo van SIN clave foránea, no con borrado débil: con cascada la purga de la Fase 9 borraría el desglose de un pago cobrado, y con FK restrictiva la purga fallaría con 23503 y no borraría nunca nada"
  - "`fecha_programada` y `fecha_ejecucion` son NOT NULL en las dos clases de línea, también en las de gasto: un gasto siempre cuelga de un aseo (`expenses.cleaning_id` es not null), así que las dos fechas siempre se pueden derivar y D7-8 queda impuesto por el schema y no por el código que lo escribe"
  - "`check (monto_total = monto_aseos + monto_gastos)`: el total no es un campo libre, es la suma de las dos partidas, y la base lo impone en vez de confiar en que `cerrar_periodo` lo haga bien"
  - "La clave de retención del recibo se siembra en la migración, no en `supabase/seeds/`: los seeds no se aplican en producción y una clave que existe en local pero no en la nube quedaría tapada por el respaldo del `coalesce`, sin que nadie supiera que el valor de producción no se puede ajustar desde la UI"
  - "`expense_photo_retention_days = 1825` días (5 × 365) y no un intervalo literal: mantiene la familia `*_retention_days` homogénea y editable por el admin"
  - "Los respaldos del `coalesce` en `foto_vencida` no son decorativos: una purga que lee un nulo y lo interpreta como cero días borra TODO"

patterns-established:
  - "Un documento contable en este repo se escribe con el texto COPIADO (nombre, concepto, monto, fechas) y con punteros sin FK al mundo vivo: los identificadores solos dejarían punteros rotos donde D7-2 pedía desglose"
  - "El día de negocio de un instante se resuelve con `public.dia_bog`, nunca tomando la fecha del `timestamptz`: `public.today_bog()` contesta otra pregunta y no sustituye a esta"

requirements-completed: [FIN-03, FIN-04, FIN-05]

coverage:
  - id: D1
    description: "El día de cierre de cualquier mes se calcula en la base, sin festivos, y coincide con el cálculo por fuerza bruta en los 36 meses de 2026 a 2028"
    requirement: "FIN-03"
    verification:
      - kind: integration
        ref: "supabase/tests/11_financiero.test.sql aserción 2 — '36/36'"
        status: pass
    human_judgment: false
  - id: D2
    description: "La pertenencia de un aseo a un periodo se decide por su hora de Bogotá y no por la hora de la sesión"
    requirement: "FIN-03"
    verification:
      - kind: integration
        ref: "supabase/tests/11_financiero.test.sql aserciones 8 y 9 — las 23:30 del día del cierre y las 00:30 del día siguiente"
        status: pass
      - kind: integration
        ref: "supabase/tests/11_financiero.test.sql aserciones 10 y 12 — el aseo cae en el periodo correcto del snapshot"
        status: fail
    human_judgment: false
    rationale: "10 y 12 leen el snapshot que escribe `cerrar_periodo`, de la migración 25 (plan 07-07). La función que decide el día ya está verificada por 8 y 9."
  - id: D3
    description: "El periodo de pago va de cierre a cierre, con dos fechas reales en la cabecera, desde la primera migración"
    requirement: "FIN-03"
    verification:
      - kind: integration
        ref: "supabase/tests/11_financiero.test.sql aserciones 3 a 7 — julio del 1 al 31, junio empieza el 30 de mayo, contigüidad por los dos lados, y el día posterior al cierre cae en el periodo siguiente"
        status: pass
      - kind: integration
        ref: "catálogo: `payout_periods.periodo_desde` y `.periodo_hasta` son `date`, no texto de mes"
        status: pass
    human_judgment: false
  - id: D4
    description: "El desglose del pago está escrito de forma que sobrevive al borrado del aseo y del gasto que lo originaron"
    requirement: "FIN-04"
    verification:
      - kind: integration
        ref: "supabase/tests/11_financiero.test.sql aserciones 47 y 51 — borrar a mano un aseo y un gasto NO falla, ahora con las tablas puestas"
        status: pass
      - kind: integration
        ref: "catálogo `pg_constraint`: la ÚNICA FK de `cleaner_payout_lines` es `payout_id -> cleaner_payouts(id) on delete cascade`. `cleaning_id`, `expense_id` y `property_id` no tienen ninguna"
        status: pass
      - kind: integration
        ref: "supabase/tests/11_financiero.test.sql aserciones 48 a 50 y 52 — el desglose sigue legible tras el borrado"
        status: fail
    human_judgment: false
    rationale: "48-50 y 52 necesitan que `cerrar_periodo` (07-07) haya escrito líneas. La propiedad de schema que las hace posibles ya está verificada contra el catálogo."
  - id: D5
    description: "El recibo de un gasto tiene una política de retención propia, de cinco años, distinta de la de las fotos de checklist"
    requirement: "FIN-04"
    verification:
      - kind: integration
        ref: "supabase/tests/11_financiero.test.sql aserciones 44, 45 y 46 — checklist de 31 días vencida, recibo de 31 días vivo, recibo de 5 años y 1 día vencido"
        status: pass
    human_judgment: false
  - id: D6
    description: "Ninguna cifra de huésped puede aparecer en una tabla que un aseador podría llegar a leer"
    requirement: "FIN-05"
    verification:
      - kind: integration
        ref: "catálogo `pg_attribute`: cero columnas que casen con `(huesped|margen|cobrado|tarifa)` en las tres tablas"
        status: pass
      - kind: integration
        ref: "catálogo `information_schema.role_table_grants`: cero privilegios para `anon` y `authenticated` sobre las tres tablas"
        status: pass
    human_judgment: false
  - id: D7
    description: "Todos los montos son enteros anchos, no un tipo que llegue a TypeScript como cadena"
    requirement: "FIN-03"
    verification:
      - kind: integration
        ref: "supabase/tests/11_financiero.test.sql aserción 30 — 'bigint,bigint,bigint' sobre `pg_attribute`"
        status: pass
    human_judgment: false
  - id: D8
    description: "El schema está aplicado de verdad contra Postgres y los tipos lo reflejan"
    requirement: "FIN-03"
    verification:
      - kind: unit
        ref: "npm run db:types:check — sin diferencia; npx tsc --noEmit — cero errores"
        status: pass
      - kind: unit
        ref: "npm run db:lint y npm run db:advisors — cero"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-09-13
status: complete
---

# Fase 7 Plan 04: El calendario del cierre, el día de negocio y el snapshot financiero

**La base ya sabe qué día cierra cada mes, a qué día de negocio de Bogotá pertenece un instante, y tiene dónde guardar un pago de forma que ni la purga de la Fase 9 ni una corrección de tarifa lo puedan mover.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-09-13T18:33:00Z
- **Completed:** 2026-09-13T18:58:00Z
- **Tasks:** 3 de 3
- **Files modified:** 2 (1 creado, 1 regenerado)

## Accomplishments

- **Las 6 aserciones del bloque B (el calendario del cierre) pasan de rojo a verde, y con ellas D7-5 entero.** La comparación es contra el cálculo por fuerza bruta en los 36 meses de 2026 a 2028: `36/36`. No contra una lista de fechas copiadas a mano.
- **Las 3 aserciones del bloque J (el recibo dura cinco años) pasan a verde.** La excepción a `photo_retention_days` existe con su clave en `app_settings`, y `public.foto_vencida` lleva escrito en su comentario que existe **para la purga de la Fase 9**: sin ella, quien escriba esa purga borraría los recibos sin saber que rompe D7-2.
- **`public.dia_bog` con la zona explícita, y las dos aserciones que la miden por los dos lados de la medianoche están en verde.** Es el artefacto que impide el defecto más caro de la fase: sin la conversión, todo aseo terminado entre las 19:00 y la medianoche de Bogotá cae en el día siguiente, y al cruzar un cierre se paga en el periodo equivocado de forma permanente.
- **La aserción 30 (los montos son `bigint` y no `numeric`) queda verde, contra el catálogo de tipos.** Es la que impide que `'132000' + 1` dé `'1320001'` en TypeScript.
- **Las aserciones 47 y 51 siguen verdes, y ahora por la razón correcta.** Estaban verdes por ausencia de tablas; siguen verdes por **ausencia de cascada**. El catálogo lo confirma: la única FK de `cleaner_payout_lines` es la que apunta al pago, dentro del propio snapshot.
- **Cero grants para `authenticated` sobre las tres tablas, verificado contra `information_schema.role_table_grants`.** Y cero columnas cuyo nombre case con `huesped|margen|cobrado|tarifa`: el margen no se protege con una policy, es que no está.
- **El schema está aplicado de verdad.** `db:reset` + `db:types` + `db:types:check` sin diferencia + `tsc --noEmit` limpio. Sin ese paso la verificación habría dado un falso verde contra tipos viejos.

## Movimiento medido del contrato pgTAP

Línea base antes de esta migración: **327 aserciones, 47 rojas**, todas en `11_financiero.test.sql`.
Después: **327 aserciones, 33 rojas**. **14 nuevas verdes**, cero regresiones.

| Bloque | Qué mide | Antes | Ahora | Quién cierra el resto |
|---|---|---|---|---|
| A (1) | la siembra | 1/1 | 1/1 | — |
| **B (2-7)** | **el calendario del cierre** | 0/6 | **6/6 ✅** | **cerrado por este plan** |
| C (8-12) | pertenencia en hora de Bogotá | 0/5 | 3/5 | 10 y 12 → **07-07** (migración 25) |
| D (13-22) | la frontera del aseador | 0/10 | 0/10 | 13-14 → **07-05**; 17-22 → **07-08** |
| E (23-30) | el cierre calcula lo que debe | 0/8 | 1/8 | 23-29 → **07-07** |
| F (31-33) | idempotencia del cierre | 0/3 | 0/3 | **07-07** |
| H (34-37) | informativos fuera de todo | 0/4 | 1/4 | 35-37 → **07-07** y **07-08** |
| I (38-43) | lo que ve el aseador | 0/6 | 0/6 | **07-09** (migración 27) |
| **J (44-46)** | **el recibo dura cinco años** | 0/3 | **3/3 ✅** | **cerrado por este plan** |
| G (47-52) | supervivencia al borrado | 2/6 | 2/6 | 48-50 y 52 → **07-07** |

**Los once archivos pgTAP anteriores conservan sus 275 aserciones en verde.** El informe de `pg_prove` solo lista `11_financiero.test.sql` como fallido (`Files=12, Tests=327`).

**Honestidad sobre dos de las catorce verdes nuevas.** Las aserciones **11** (*"ese aseo NO aparece también en el periodo siguiente"*) y **34** (*"el aseo de gestión externa no aparece en NINGUNA línea"*) esperan `0` y ahora devuelven `0` porque las tablas existen y están **vacías**: están verdes **por vacuidad**. Solo empiezan a medir algo el día que 07-07 escriba líneas de verdad. Se anotan aquí porque contarlas como avance real sería exactamente el autoengaño que la Wave 0 existe para evitar.

## Task Commits

1. **Task 1 + Task 2: la migración 23 completa** — `427447a` (feat)
2. **Task 3 [BLOCKING]: tipos regenerados desde la base** — `bafed90` (chore)

_Nota: las tareas 1 y 2 del plan escriben el MISMO archivo (`files_modified` lo declara así en las dos). Commitearlas por separado habría exigido una migración a medias que ni siquiera aplica —las tablas del bloque (e)-(g) y las funciones del bloque (a)-(d) van en el mismo archivo y `db:reset` lo aplica entero— así que van en un solo commit. No es una desviación del contenido, es que el artefacto es uno._

## Files Created/Modified

- `supabase/migrations/20260913100000_23_calendario_y_snapshot.sql` (635 líneas) — las cuatro funciones con su par de revoke/grant pegado a cada definición, la clave de retención del recibo, las tres tablas del snapshot con sus comentarios, cuatro índices (dos de acceso, uno parcial de pendientes, más el único que sirve de prefijo), RLS con una policy de admin por tabla y `grant all` solo a `service_role`.
- `lib/database.types.ts` — `payout_periods`, `cleaner_payouts`, `cleaner_payout_lines`, `dia_bog`, `ultimo_dia_habil_del_mes`, `periodo_de_cierre` y `foto_vencida`.

## Decisions Made

**1. Tres tablas y no dos. Desviación declarada del research, escrita en la cabecera de la migración.**
El research proponía cabecera de pago + líneas. Se añade `payout_periods` por encima: (a) un periodo se puede cerrar sin ninguna aseadora con aseos, y con dos tablas ese periodo no dejaría rastro y el aviso de "no se cerró" quedaría encendido para siempre; (b) la idempotencia de D7-3 queda a nivel de **periodo** —la clave primaria por `periodo_desde`—, y no de persona, que es lo que permitiría que una segunda corrida con una aseadora nueva cerrara a medias un periodo ya cerrado; (c) el contador de aseos no computados y la autoría del cierre pertenecen al periodo.

**2. Los tres punteros al mundo vivo van sin clave foránea. Ni una débil.**
El comentario de columna lo deja escrito citando el precedente exacto del repo (`access_code_reads.cleaning_id`, migración 04) y **las dos direcciones del error**: con cascada, la purga borra el desglose de un pago cobrado; con FK restrictiva, la purga falla con 23503 y **no borra nunca nada**, así que la retención de seis meses no se cumple jamás. El comentario de tabla se dirige explícitamente a quien dentro de un año quiera "arreglar" el schema añadiéndolas.

**3. `check (monto_total = monto_aseos + monto_gastos)`.**
El total no es un campo libre. Poner la suma en la base en vez de confiar en que `cerrar_periodo` la haga bien convierte un error aritmético del plan 07-07 en un fallo inmediato y no en un pago mal calculado que nadie mira. Es la contraparte de D7-2: si las dos partidas van separadas para poder reconstruir el desglose, el total tiene que cuadrar con ellas.

**4. Las dos fechas son `NOT NULL` también en las líneas de gasto.**
El plan decía "las dos fechas, siempre las dos", refiriéndose a la línea de aseo. Se extiende a las de gasto porque es satisfacible y más fuerte: `expenses.cleaning_id` es `not null`, así que todo gasto cuelga de un aseo y las dos fechas siempre se pueden derivar. Con esto, D7-8 lo impone el schema y no el código que escribe las líneas.

**5. La clave de retención se siembra en la migración, no en `supabase/seeds/`.**
Los archivos de seed no se aplican en producción, solo las migraciones. Una clave que existe en local y no en la nube quedaría tapada por el respaldo del `coalesce` y nadie sabría que el valor de producción no se puede ajustar desde la UI del admin. Va con `on conflict (key) do nothing`, igual que el seed, para no pisar un valor ya ajustado.

**6. `expense_photo_retention_days = 1825` (días), y no un intervalo ni "5 years".**
Mantiene homogénea la familia `photo_retention_days` / `retention_notice_days` y la deja editable como número desde la UI. La aserción 46 lo ejerce con `now() - interval '5 years 1 day'` (≈1827 días), que es lo que la separa de "el recibo es eterno".

**7. RLS + policy en las tres tablas aunque no tengan grant.**
La policy no protege nada hoy: sin grant, las tablas son inalcanzables desde `authenticated` con o sin ella. Existe por el guardarraíl 2 y por lo que ese guardarraíl protege: una tabla con RLS y sin policy devuelve todo vacío **en silencio**, y ese silencio es lo que empuja a alguien a "arreglarlo" desactivando la RLS o metiendo la clave de servicio en el cliente. Con la policy escrita, el día que alguien añada el grant la restricción correcta ya está puesta.

**8. Claves primarias `uuid` y no `bigserial`.**
No es una preferencia estética: `bigserial` crea una secuencia, y el guardarraíl 4b del repo existe porque `information_schema.role_table_grants` no lista secuencias y una tabla nueva con `bigserial` reintroduce el hueco de privilegios de forma invisible para la suite. Con `uuid` el problema no se plantea. Verificado: cero secuencias con `payout` en el nombre.

**9. `pg_catalog.date_part('isodow', …)` en vez de la sintaxis de extracción.**
La sintaxis `EXTRACT(campo FROM …)` no se puede calificar por esquema, y la regla del repo es que todo nombre vaya calificado en un cuerpo con el camino de búsqueda vacío. `date_part` es una función normal y sí se califica.

## Deviations from Plan

### Ajustes automáticos

**1. [Regla 2 - Funcionalidad crítica faltante] El plan no pedía el `check` que hace cuadrar el total**

- **Encontrado durante:** Task 2, escribiendo `cleaner_payouts`
- **Problema:** el plan pedía "las dos partidas por separado, más el total" sin decir nada sobre su relación. Un `monto_total` que no cuadre con las partidas es un pago mal calculado que además hace mentir al desglose, que es justo lo que D7-2 existe para impedir.
- **Arreglo:** `constraint cp_total_cuadra check (monto_total = monto_aseos + monto_gastos)`, más `cp_montos_ok` (no negativos), `cp_cantidades_ok`, `cp_nombre_no_vacio` y `cp_pagado_coherente` (no hay autor de pago sin marca de pago).
- **Archivos:** `supabase/migrations/20260913100000_23_calendario_y_snapshot.sql`
- **Verificación:** `db:reset` aplica sin error; las aserciones 25 y 26 del test esperan `aseos=120000 gastos=12000 total=132000`, que satisface el check.
- **Commit:** `427447a`

**2. [Regla 2 - Funcionalidad crítica faltante] Los respaldos del `coalesce` en `foto_vencida`**

- **Encontrado durante:** Task 1
- **Problema:** el plan decía que la función lee la clave de `app_settings`. Si la clave falta (una base sin seed, una restauración parcial), el `select` devuelve nulo, el intervalo sale nulo y la comparación devuelve nulo. Una purga que interprete ese nulo como "cero días" **borra todo**.
- **Arreglo:** `coalesce(…, 1825)` y `coalesce(…, 30)`, con el porqué escrito en el comentario del bloque.
- **Archivos:** `supabase/migrations/20260913100000_23_calendario_y_snapshot.sql`
- **Commit:** `427447a`

**3. [Regla 2 - Funcionalidad crítica faltante] Índice parcial de pagos pendientes**

- **Encontrado durante:** Task 2
- **Problema:** el plan enumeraba tres índices. La lista de trabajo de D7-4.2 ("qué falta por pagar") es una consulta recurrente del admin y no estaba cubierta.
- **Arreglo:** `cp_pendientes_idx on cleaner_payouts (periodo_desde) where pagado_at is null`. Parcial porque las filas ya pagadas ni interesan ni ocupan.
- **Commit:** `427447a`

### Fusión de tareas

Las tareas 1 y 2 del plan declaran el mismo `files_modified` y producen un único archivo de migración indivisible. Se commitearon juntas. Ver la nota bajo *Task Commits*.

## Threat Flags

Ninguna. Las seis amenazas del registro del plan (T-07-13 a T-07-18) quedan mitigadas y verificadas contra el catálogo, no leyendo el archivo:

| Amenaza | Verificación |
|---|---|
| T-07-13 cifra de huésped en una tabla de pago | cero columnas `~* '(huesped\|margen\|cobrado\|tarifa)'` y cero grants para `anon`/`authenticated` |
| T-07-14 purga borrando el desglose por cascada | única FK de `cleaner_payout_lines`: `payout_id -> cleaner_payouts(id)` |
| T-07-15 purga atascada por FK restrictiva | aserciones 47 y 51 en verde con las tablas puestas |
| T-07-16 aseo en el periodo equivocado por la zona | aserciones 8 y 9 en verde; `America/Bogota` en el cuerpo de `dia_bog` |
| T-07-17 monto que llega como cadena | aserción 30: `bigint,bigint,bigint` |
| T-07-18 periodo sin aseos sin rastro | `payout_periods` es tabla propia, con clave primaria por `periodo_desde` |

## Known Stubs

Ninguno. Esta migración no produce interfaz ni datos placeholder.

## Verification

| Comprobación | Resultado |
|---|---|
| `npm run db:reset` | sin error |
| `npm run db:lint` | `No schema errors found` |
| `npm run db:advisors` | `No issues found` |
| `npm run db:types:check` | sin diferencia |
| `npx tsc --noEmit` | cero errores |
| `bash scripts/ci/check-service-role.sh` | `check-service-role: OK` |
| `npm run db:test` | 327 aserciones, 33 rojas (eran 47). Los 11 archivos anteriores conservan sus 275 verdes |
| `npm run test:unit` | 1006 pasando, 3 archivos rojos (los declarados de la Wave 0) |
| `npm run test:integration` | 186 pasando, 1 archivo rojo (el declarado de la Wave 0) |

E2E no se volvió a correr: esta migración no toca ninguna superficie de interfaz y la línea base (112 pasando, 1 saltado, 22 specs rojas declaradas) depende de pantallas que llegan en 07-10 a 07-13.

## Notes for Next Phase

- **07-07 (migración 25) es quien pone en verde casi todo lo que queda.** Necesita: usar `public.dia_bog(finished_at)` para decidir la pertenencia (nunca `scheduled_date`), escribir la cabecera de periodo **aunque no haya ningún pago**, copiar el texto legible en cada línea en vez de dejar identificadores, y contar los aseos no computados **con el filtro de gestión propia explícito** (el informativo `JX` del fixture está dentro del rango y sin completar: sin el filtro, el contador daría 2 en vez de 1).
- **El `check` de la cabecera de pago exige `monto_total = monto_aseos + monto_gastos`.** Si 07-07 calcula el total por separado, se va a estrellar contra el check en vez de producir un número mal. Es a propósito.
- **`fecha_programada` y `fecha_ejecucion` son `NOT NULL` también en las líneas de gasto.** 07-07 tiene que derivarlas del aseo al que cuelga el gasto.
- **Fase 9 (purga):** `public.foto_vencida(kind, created_at)` es el único punto que decide si una foto venció. Usarla. Borrar por `photo_retention_days` a secas rompe D7-2 y el enlace del desglose al recibo.
- **Fase 9 (purga):** los tres punteros de `cleaner_payout_lines` no tienen FK a propósito. No "arreglarlos".

## Self-Check: PASSED

- `supabase/migrations/20260913100000_23_calendario_y_snapshot.sql` — FOUND (635 líneas)
- `lib/database.types.ts` — FOUND (contiene `cleaner_payouts`, `payout_periods`, `cleaner_payout_lines`, `dia_bog`, `foto_vencida`, `periodo_de_cierre`, `ultimo_dia_habil_del_mes`)
- Commit `427447a` — FOUND
- Commit `bafed90` — FOUND
