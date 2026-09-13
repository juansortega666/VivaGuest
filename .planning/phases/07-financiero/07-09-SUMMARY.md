---
phase: 07-financiero
plan: 09
subsystem: database
tags: [postgres, rls, security-definer, rpc, pgtap, pagos, supabase]

requires:
  - phase: 07-04
    provides: "Las tres tablas del snapshot (payout_periods, cleaner_payouts, cleaner_payout_lines) y el calendario de cierre"
  - phase: 07-05
    provides: "Los grants por columna que cerraron la fuga de la tarifa al huésped, y private.is_active_cleaner como guarda viva"
  - phase: 07-07
    provides: "El cierre que escribe los pagos y sus líneas, y las dos puertas con guarda de admin"
  - phase: 07-08
    provides: "Las seis lecturas financieras del admin y el método de aserción sobre el catálogo en vez de sobre la fila"
provides:
  - "public.periodos_de_pago(): la cabecera colapsable de cada periodo cerrado, con sus dos fechas reales, personas, total, cuántas faltan por pagar y aseos no computados"
  - "public.pagos_del_periodo(date): la tabla interna por persona, con las dos partidas por separado además del total"
  - "public.pagos_de_aseadora(uuid): todos los periodos cerrados de una persona, SIN argumento de rango"
  - "public.detalle_de_pago(uuid): las líneas del pago, leídas del snapshot y sin ninguna unión contra el mundo vivo"
  - "public.marcar_pago_pagado(uuid): la marca irreversible, con bloqueo de fila, rechazo del segundo intento, instante y autor"
  - "public.mis_pagos_cerrados(): los periodos cerrados del aseador que llama, con el filtro por dueño dentro de la función"
  - "public.detalle_de_mi_pago(uuid): su desglose, con verificación de dueño y denegación indistinguible"
  - "El contrato pgTAP de la Fase 7 ENTERO en verde por primera vez: 94 aserciones, cero not ok"
affects: [07-10, 07-11, 07-12, 07-13, 07-14, fase-09-purga]

tech-stack:
  added: []
  patterns:
    - "La frontera del aseador vive en tres capas y la pantalla es la TERCERA: primero la función definer con su guarda, segundo que las tablas de pago no contengan ninguna columna de huésped, tercero la pantalla"
    - "Las dos funciones de desglose declaran EXACTAMENTE la misma firma de salida, y eso se mide comparando count(distinct pg_get_function_result) en el catálogo"
    - "La ausencia de un argumento como mecanismo de producto: pagos_de_aseadora no recibe rango para que nadie pueda pasarle el filtro de la pantalla"
    - "Una denegación indistinguible para los tres casos (no existe, no es tuyo, no está cerrado) en la superficie del aseador, y una denegación que SÍ distingue en la del admin, con el argumento escrito al lado de cada una"

key-files:
  created:
    - supabase/migrations/20260913140000_27_pagos_y_mis_pagos.sql
  modified:
    - supabase/tests/11_financiero.test.sql
    - lib/database.types.ts
    - e2e/fixtures.ts

key-decisions:
  - "El parámetro se llama p_payout y no p_pago: lo citan los planes 07-09, 07-12 y 07-13, y el propio e2e/fixtures.ts declara que el acoplamiento se corrige en la fixture y en ningún otro sitio"
  - "mis_pagos_cerrados devuelve payout_id, que el contrato original no listaba: sin él la pantalla de desglose del aseador sería inalcanzable, porque el aseador no tiene grant sobre la tabla de pagos"
  - "pagos_del_periodo NO devuelve aseador_id: el nombre es texto copiado del snapshot y la clave foránea al perfil es on delete set null, así que un enlace a la ficha apuntaría a un perfil que puede no existir"
  - "El segundo intento de marcar pagado levanta P0001 y no 42501: quien llama sí está autorizado y lo que falla es el estado de la fila, y la pantalla necesita distinguir los dos casos"
  - "La denegación del desglose ajeno es 42501 y no cero filas: pedir el pago de otra persona es un intento de acceso, no una consulta vacía"
  - "El sembrador de finanzas cierra su sesión con scope local y no global: el signOut global revoca TODOS los refresh tokens del admin, incluido el del storageState que comparte toda la suite E2E"

patterns-established:
  - "Bloque M del contrato pgTAP: 17 aserciones nuevas AL FINAL del archivo, para no correr la numeración citada por 07-14"
  - "La ausencia de uniones contra el mundo vivo se mide sobre pg_get_functiondef en el catálogo, no sobre la fila devuelta: el defecto que importa no es «hoy devuelve mal», es «alguien añade un join después»"

requirements-completed: [FIN-03, FIN-04]

coverage:
  - id: D1
    description: "El admin ve, por periodo cerrado, cuánto se le debe a cada persona y si ya se le pagó, con las dos fechas reales del periodo"
    requirement: "FIN-03"
    verification:
      - kind: integration
        ref: "supabase/tests/11_financiero.test.sql aserciones 79, 80, 81 (npm run db:test)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Marcar pagado deja constancia con fecha y autor, y no se puede hacer dos veces; el bloqueo vive en la base"
    requirement: "FIN-03"
    verification:
      - kind: integration
        ref: "supabase/tests/11_financiero.test.sql aserciones 86, 87, 88, 89, 90, 91 (npm run db:test)"
        status: pass
    human_judgment: false
  - id: D3
    description: "El aseador ve sus periodos CERRADOS y solo los suyos, nunca el periodo en curso y nunca el de un compañero"
    requirement: "FIN-03"
    verification:
      - kind: integration
        ref: "supabase/tests/11_financiero.test.sql aserciones 38, 39, 40, 41, 42, 92, 93, 94 (npm run db:test)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Ninguna función del aseador DECLARA una cifra de huésped ni un margen, comprobado sobre su firma en el catálogo y no sobre la fila que devuelve"
    requirement: "FIN-04"
    verification:
      - kind: integration
        ref: "supabase/tests/11_financiero.test.sql aserciones 43, 84 (npm run db:test)"
        status: pass
    human_judgment: false
  - id: D5
    description: "El desglose del admin y el del aseador son el mismo documento, y ninguno se une contra el mundo vivo"
    requirement: "FIN-04"
    verification:
      - kind: integration
        ref: "supabase/tests/11_financiero.test.sql aserciones 82, 83, 84, 92 (npm run db:test)"
        status: pass
    human_judgment: false

duration: 145min
completed: 2026-09-13
status: complete
---

# Fase 7 Plan 09: Los pagos del admin y la frontera del aseador

**La migración 27 cierra la frontera que ordena toda la fase, y el contrato pgTAP de la Fase 7 queda entero en verde por primera vez: 94 aserciones, cero `not ok`, y la suite completa pasa de 352 a 369.**

## Qué se construyó

Siete funciones en un solo archivo, `supabase/migrations/20260913140000_27_pagos_y_mis_pagos.sql`.

**Las cinco de Pagos del admin:**

| Función | Devuelve |
|---|---|
| `public.periodos_de_pago()` | Un renglón por periodo cerrado: las dos fechas, personas, total, cuántas faltan por pagar, aseos no computados, moneda |
| `public.pagos_del_periodo(date)` | Por persona: el identificador del pago, nombre, conteo de aseos, las dos partidas por separado, total, moneda y la marca de pagado |
| `public.pagos_de_aseadora(uuid)` | Todos los periodos cerrados de una persona, **sin argumento de rango** |
| `public.detalle_de_pago(uuid)` | Las nueve columnas de la línea, leídas del snapshot |
| `public.marcar_pago_pagado(uuid)` | Escribe instante y autor, y rechaza el segundo intento |

**Las dos del aseador, que son la frontera:**

| Función | Guarda |
|---|---|
| `public.mis_pagos_cerrados()` | Aseador activo, filtro por dueño dentro del cuerpo, solo periodos con cierre |
| `public.detalle_de_mi_pago(uuid)` | Aseador activo **y** dueño verificado antes de devolver una sola línea |

Las siete con `security definer set search_path = ''`, todo nombre calificado, la guarda de rol como primera sentencia ejecutable, y el par de `revoke all ... from public, anon` + `grant execute ... to authenticated` pegado a cada definición.

## Los cuatro invariantes de la frontera, y dónde vive cada uno

La regla es cita literal del dueño: *"el aseador ve lo que le llega y punto"*.

1. **Solo periodos cerrados.** La unión contra `payout_periods` dentro de `mis_pagos_cerrados`. Hoy es redundante (la clave foránea ya lo garantiza), y se escribió igual: una regla que solo existe como efecto lateral de una clave foránea es una regla que desaparece el día que alguien siembre un pago por otra vía. Aserción 39.
2. **Solo lo suyo, con el filtro DENTRO.** `cp.aseador_id = (select auth.uid())` en el cuerpo, nunca en el `where` de la pantalla. Aserciones 40, 41 y 93.
3. **Cero cifras de huésped en la firma.** Medido sobre `pg_get_function_result` en el catálogo y no sobre la fila: el dato viaja al teléfono aunque la pantalla no lo pinte, y una siembra donde la cifra fuera nula haría pasar una aserción sobre la fila sin demostrar nada. Aserciones 43 y 84.
4. **Desactivación inmediata.** `private.is_active_cleaner()`, que consulta `profiles` en vivo. Nunca un claim del token. Aserciones 42 y 94.

## Las tres decisiones que no estaban escritas en el plan

**`mis_pagos_cerrados` devuelve `payout_id`.** El contrato de nombres de la cabecera del archivo pgTAP no lo listaba. UI-SPEC §10.3 hace la tarjeta navegable a `/mis-pagos/[id]` y §10.4 abre el desglose con ese identificador; el aseador no tiene grant sobre `cleaner_payouts`, así que sin esta columna no hay **ninguna** otra vía de obtenerlo y la pantalla de desglose queda inalcanzable. No es una cifra de huésped ni un margen, así que no toca la frontera. Se actualizó el contrato de nombres en la cabecera del archivo pgTAP para que quede declarado ahí primero, que es lo que ese contrato exige. La aserción 92 lo ejerce recorriendo el circuito completo dentro de la sesión de la aseadora: toma el identificador de su lista y con él abre su desglose, sin tocar la tabla en ningún momento.

**`pagos_del_periodo` NO devuelve `aseador_id`.** El plan enumeraba «identificador del pago, nombre, conteo de aseos, …» y se respetó al pie de la letra, con el argumento escrito en el comentario: el nombre es texto copiado del snapshot (FIN-04) y la clave foránea al perfil es `on delete set null`, así que devolver el identificador vivo invitaría a que la pantalla enlazara a una ficha que puede no existir.

**El parámetro se llama `p_payout`.** Ver desviaciones.

## Deviations from Plan

### 1. [Regla 3 · Bloqueante] El nombre del argumento de `marcar_pago_pagado`

- **Encontrado en:** Tarea 3, al revisar qué código ya nombraba la función.
- **El conflicto:** `e2e/fixtures.ts:1448` llamaba `admin.rpc('marcar_pago_pagado', { p_pago: pago })`. Los planes 07-09, 07-12 y 07-13 citan `p_payout`. PostgREST resuelve los RPC **por nombre de argumento**, así que uno de los dos lados daba `PGRST202` sí o sí.
- **Cómo se resolvió:** se eligió `p_payout` (lo citan tres documentos de planificación frente a una fixture escrita a ciegas en Wave 0, antes de que la función existiera) y se corrigió la fixture. **El propio archivo declara esa regla** en el comentario de `cerrarPeriodo`: *"Los nombres de los argumentos son el ÚNICO acoplamiento de este archivo con la firma de 07-07. Si allá se llaman distinto, se cambia AQUÍ y en ningún otro sitio."* Se aplicó la misma regla y se dejó el comentario equivalente en `marcarPagado`.
- **Archivos:** `e2e/fixtures.ts`.
- **Nota de alcance:** el plan lleva `db_exclusive: true` y `e2e/fixtures.ts` no estaba en `files_modified`. La wave 5 corre sola, así que no había riesgo de conflicto, y sin este cambio el `beforeAll` de `finanzas.spec.ts` habría seguido muriendo por un motivo distinto del que este plan venía a resolver.

### 2. [Regla 1 · Defecto latente destapado] El `signOut()` global del sembrador de finanzas tumbaba 23 specs

- **Encontrado en:** Tarea 3, corriendo la suite E2E completa para comprobar el colateral que el plan anunciaba.
- **El síntoma:** 44 rojos contra una línea base de 24. Los 23 extra estaban repartidos entre `historial.spec.ts` (5), `operacion-alertas.spec.ts` (6), `operacion.spec.ts` (9) y `ruteo.spec.ts` (3), sin ninguna relación aparente con finanzas.
- **El diagnóstico, que lo dio una sola línea del log:** `ruteo.spec.ts:66` esperaba `/operacion` y recibía `http://127.0.0.1:3247/login`. **El admin autenticado rebotaba a login.** A partir de ahí el patrón es inequívoco: fallaba TODO spec posterior a `finanzas.spec.ts` que usara la sesión de admin, y ninguno de los anteriores.
- **La causa:** `sembrarFinanzas()` termina con `await admin.auth.signOut()`. Sin argumento, supabase-js usa `scope: 'global'`, que **revoca todos los refresh tokens del usuario**, no solo el de ese cliente de Node. Y ese admin es el mismo de la semilla cuyo `storageState` comparte toda la suite. El middleware llama `getUser()`, el servidor de Auth dice que la sesión ya no existe, y rebote a `/login`.
- **Por qué aparece justo ahora:** el defecto vive ahí desde el plan 07-03 y estaba **tapado**. Hasta este plan, `marcarPagado` reventaba porque `public.marcar_pago_pagado` no existía, así que el `beforeAll` moría dos líneas antes y esa sentencia nunca se ejecutaba. Arreglar la función es lo que lo destapó. Es Regla 1 de pleno derecho: un defecto directamente causado por el camino que este plan abre.
- **El arreglo:** `await admin.auth.signOut({ scope: 'local' })`, con el comentario que deja escrita la medición para que nadie lo revierta. `local` cierra la sesión de ese cliente y no toca ninguna otra, que es lo único que el sembrador necesita.
- **Archivos:** `e2e/fixtures.ts`.
- **Cómo se demostró que no había nada más roto:** se replicó el método que 07-05 dejó documentado, corriendo la suite **sin** `finanzas.spec.ts` ni `mis-pagos.spec.ts` contra base limpia. Resultado: **112 pasando y 1 saltado, exactamente la línea base**. Nada estructural se había movido.

### 3. [Regla 2 · Verificación crítica ausente] El bloque M del contrato pgTAP

- **Encontrado en:** Tarea 3, al recorrer las 22 filas del mapa de verificación.
- **El hueco:** la fila *"Marcar pagado deja fecha y autor, y no se puede marcar dos veces · E2E + pgTAP · **ambos**"* no tenía **ninguna** aserción pgTAP. Tampoco las tenían las cinco lecturas de Pagos del admin, cuyas acceptance criteria de la Tarea 1 describen comportamientos verificables (guarda ante una aseadora, ausencia de rango en `pagos_de_aseadora`, ausencia de uniones vivas en `detalle_de_pago`, rechazo del segundo marcado).
- **Qué se añadió:** 17 aserciones (78 a 94) **al final del archivo**, siguiendo la regla de la cabecera y el precedente de los bloques K y L. `plan(77)` pasa a `plan(94)`.
- **Las tres que más valen:**
  - **83** mide sobre `pg_get_functiondef` que ninguna de las dos funciones de desglose se une contra la tabla de aseos, la de apartamentos ni la de gastos. Se verificó que el regex **muerde**: da `true` sobre `aseos_de_aseadora` y `gastos_de_aseadora`, que sí se unen, y `false` sobre las dos de desglose. El defecto que importa no es «hoy devuelve mal», es el join que alguien añada dentro de tres meses para enriquecer la fila.
  - **84** compara las firmas de las dos funciones de desglose: `count(distinct pg_get_function_result) = 1` sobre `count(*) = 2`. Es «el mismo documento» convertido en aserción.
  - **89** demuestra que el rechazo del segundo marcado **no movió nada**. Sin ella, un RPC que levantara la excepción después de escribir pasaría la 88 y habría pisado la fecha y el autor del primer registro, que es justo el daño que la guarda existe para evitar.

## Contract Status

| Métrica | Antes (cierre de 07-08) | Después |
|---|---|---|
| Aserciones pgTAP totales | 352 | **369** |
| `not ok` | **6** (38 a 43) | **0** |
| `11_financiero.test.sql` | 77 aserciones, 6 rojas | **94 aserciones, 0 rojas** |
| Tests unitarios | 1111 | 1111 |
| Tests de integración | 190 | 190 |

**El contrato ejecutable de la Fase 7 está entero en verde por primera vez desde que empezó la fase.** Eso es lo que desbloquea los planes de interfaz.

## Mapa de verificación de `07-VALIDATION.md`, fila por fila

Las 22 filas vigentes, con la aserción concreta que las cubre y el comando con el que se corre.

| # | Requirement | Comportamiento | Tipo | Cubierto por | Comando | Estado |
|---|---|---|---|---|---|---|
| 1 | FIN-01 (regresión) | Editar la tarifa del apartamento no mueve la del aseo ya terminal | pgTAP | `01_invariantes.test.sql` (Fase 1) + aserciones 32 y 61 | `npm run db:test` | ✅ |
| 2 | FIN-02 | La rentabilidad da el margen correcto y excluye los informativos | pgTAP | Aserciones 36, 60, 61 | `npm run db:test` | ✅ |
| 3 | FIN-02 | Un aseador que llama a la función de rentabilidad recibe 42501 | pgTAP | Aserción 17 | `npm run db:test` | ✅ |
| 4 | FIN-02 / D7-7 | Un aseador no puede leer `cleanings.tarifa_huesped` por PostgREST | pgTAP | Aserción 13 | `npm run db:test` | ✅ |
| 5 | D7-7 | Un aseador no puede leer las columnas de dinero de `properties` | pgTAP | Aserción 14 | `npm run db:test` | ✅ |
| 6 | FIN-03 / D7-5 | El día de cierre coincide con `generate_series` en 36 meses | pgTAP | Aserción 2 | `npm run db:test` | ✅ |
| 7 | FIN-03 / D7-5 | El gemelo TypeScript del calendario coincide con el SQL | integración | `lib/domain/mes.integration.test.ts`, 4 casos | `npm run test:integration` | ✅ |
| 8 | FIN-03 | El cierre no hace nada en un día que no es el de cierre | integración | Ejecución directa medida en 07-07 (`cerrar_periodo_si_toca()` devuelve 0 hoy) + la guarda de calendario dentro de la función | `npm run test:integration` | ✅ |
| 9 | FIN-03 | Dos corridas del cierre no pagan dos veces | pgTAP | Aserciones 31, 32, 33 | `npm run db:test` | ✅ |
| 10 | FIN-04 | Borrar a mano un aseo del periodo cerrado deja el pago y su desglose intactos | pgTAP | Aserciones 47 a 50 (escritura) **+ 82 y 92 (ahora también desde la LECTURA)** | `npm run db:test` | ✅ |
| 11 | FIN-04 / D7-6 | Borrar el gasto deja su línea con concepto y monto | pgTAP | Aserciones 51, 52 **+ 92** | `npm run db:test` | ✅ |
| 12 | D7-6 | El recibo de un gasto sigue existiendo pasados 30 días | pgTAP | Aserciones 44, 45, 46 | `npm run db:test` | ✅ |
| 13 | FIN-04 / D7-3 | Editar una tarifa después de cerrar no mueve el pago cerrado | integración + pgTAP | Aserción 32 **+ 81, que lo lee desde la ficha** | `npm run db:test` | ✅ |
| 14 | FIN-05 | Un aseo de gestión externa no aparece en ningún total ni conteo | pgTAP | Aserciones 34 a 37 | `npm run db:test` | ✅ |
| 15 | D7-8 | Un aseo completado después del cierre cae en el periodo siguiente, y en uno solo | pgTAP | Aserciones 11, 12 | `npm run db:test` | ✅ |
| 16 | D7-8 | El desglose muestra fecha programada **y** fecha de ejecución | E2E | **Mitad de base cerrada aquí: aserciones 82 y 92.** La mitad de pantalla la cierran 07-12 y 07-13 | `npm run test:e2e` | ⬜ E2E pendiente |
| 17 | D7-4 | La consulta de pagos del aseador no devuelve el periodo en curso | pgTAP | **Aserción 39 ← este plan** | `npm run db:test` | ✅ |
| 18 | D7-4 | Un aseador no ve el pago de otro aseador | pgTAP | **Aserciones 40, 41, 93 ← este plan** | `npm run db:test` | ✅ |
| 19 | D7-4 / D7-7 | Ninguna función del aseador devuelve una cifra de huésped | pgTAP | **Aserciones 43 y 84 ← este plan**, las dos sobre el catálogo | `npm run db:test` | ✅ |
| 20 | D7-1 | La sección de finanzas existe, está en la navegación, y `/operacion` no cambió | E2E | Pendiente del plan 07-10 | `npm run test:e2e` | ⬜ E2E pendiente |
| 21 | D7-2 | El desglose separa aseos de gastos, y el recibo se abre | E2E | **Mitad de base cerrada aquí: aserciones 80, 82 y 92.** La mitad de pantalla la cierra 07-12 | `npm run test:e2e` | ⬜ E2E pendiente |
| 22 | D7-4 | Marcar pagado deja fecha y autor, y no se puede marcar dos veces | E2E **+ pgTAP** | **La mitad de pgTAP se cierra aquí: aserciones 86, 87, 88, 89, 90, 91.** La de E2E la cierra 07-12 | ambos | ✅ pgTAP · ⬜ E2E |

**Resumen:** 18 de las 22 filas quedan cerradas con una aserción automatizada. Las 4 restantes (16, 20, 21 y 22 por su mitad de E2E) son de interfaz y las cierran los planes 07-10 a 07-13, como el propio mapa declaraba desde Wave 0. Ninguna fila de base queda sin cubrir.

## Threat Register

| Threat | Disposición | Dónde vive la mitigación | Aserción |
|---|---|---|---|
| T-07-42 · una aseadora leyendo el pago de otra por identificador | mitigate | Verificación de dueño antes de devolver una línea, con denegación indistinguible de la de un pago inexistente | 41, 93 |
| T-07-43 · una función del aseador que declare una cifra de huésped aunque no la pinte | mitigate | Aserción sobre la firma en el catálogo | 43, 84 |
| T-07-44 · el periodo en curso visible en el teléfono | mitigate | La unión contra la cabecera del periodo dentro de la consulta | 39 |
| T-07-45 · una aseadora desactivada conservando acceso hasta que expire su token | mitigate | `private.is_active_cleaner()`, que consulta el perfil en vivo | 42, 94 |
| T-07-46 · una aseadora marcando su propio pago | mitigate | Cero grants de escritura para `authenticated` sobre las tres tablas, más guarda de admin en el RPC | 85, 86 |
| T-07-47 · marcar pagado dos veces desde dos pestañas | mitigate | `select … for update` antes de leer el estado, más rechazo explícito con P0001 | 88, 89 |
| T-07-48 · un pago marcado sin saber quién lo marcó | mitigate | Instante y autor obligatorios, el autor desde `auth.uid()` y nunca desde un parámetro | 87, 89 |

## Threat Flags

Ninguno. Este plan no introduce superficie de red, de autenticación, de acceso a archivos ni de schema: son siete funciones de lectura sobre tablas que ya existían, más una escritura de una sola columna con guarda, y las siete están detrás de `private.is_admin()` o `private.is_active_cleaner()`.

## Known Stubs

Ninguno.

## Puertas ejecutadas

| Comando | Resultado |
|---|---|
| `npm run db:reset` | OK, 27 migraciones aplicadas |
| `npm run db:types` | Regenerado; los `bigint` llegan como `number`, que confirma que el cast funcionó (un `numeric` habría llegado como `string`) |
| `npm run db:types:check` | Sin diferencia |
| `npx tsc --noEmit` | Limpio |
| `npm run lint` | 0 errores; 2 warnings preexistentes en archivos de test que este plan no toca |
| `npm run ci:arch` | Las tres comprobaciones OK |
| `npm run db:lint` | `No schema errors found` |
| `npm run db:advisors` | `No issues found` |
| `npm run db:test` | **369 aserciones, 12 archivos, cero `not ok`** |
| `npm run test:unit` | 1111 en verde |
| `npm run test:integration` | 190 en verde |
| `npm run test:e2e` (suite completa, puerto 3253) | **113 pasando · 1 saltado · 21 rojos**, y los 21 son los declarados de `finanzas.spec.ts` (15) y `mis-pagos.spec.ts` (6), que construyen 07-10 a 07-13 |
| `npm run test:e2e` (control, sin esos dos archivos) | **112 pasando · 1 saltado**, exactamente la línea base de 07-05 |

### El colateral que este plan venía a eliminar, medido

El plan anunciaba que `operacion.spec.ts:210` y `operacion-alertas.spec.ts:215` estaban rojos por daño colateral, y que tenían que ponerse en verde solos. **Lo hicieron.**

| | Línea base (cierre de 07-08) | Después |
|---|---|---|
| Rojos totales en la suite completa | 24 | **21** |
| `finanzas.spec.ts` | 15 (todos muriendo en el `beforeAll`) | 15 (ahora **cada uno en su propia aserción**: la siembra completa y lo que falta es la pantalla) |
| `mis-pagos.spec.ts` | 7 | **6** · `mis-pagos.spec.ts:295` pasa a verde |
| `operacion.spec.ts:210` | ❌ colateral | **✅** |
| `operacion-alertas.spec.ts:215` | ❌ colateral | **✅** |

El detalle que importa de la segunda fila: antes, los 15 de finanzas fallaban **todos con el mismo error de hook**, porque `marcarPagado` reventaba. Ahora el `beforeAll` completa la siembra entera (dos periodos cerrados, tres pagos, dos de ellos marcados) y cada test falla en **su propia aserción**, contra la pantalla que todavía no existe. Eso es lo que los planes de interfaz necesitan para poder ponerse en verde uno a uno.

## Los dos requisitos, y por qué la tabla de trazabilidad sigue en `In Progress`

`FIN-03` y `FIN-04` están marcados en sus casillas de `REQUIREMENTS.md`, y su fila de la tabla de trazabilidad se deja deliberadamente en **`In Progress`**.

El 2026-09-13 el orquestador bajó `FIN-02` a `FIN-05` de `Complete` a `In Progress` con este argumento, que sigue valiendo: venían del frontmatter `requirements` de planes de Wave 0, que **escriben el contrato y no lo satisfacen**, y dejarlos en `Complete` habría hecho que el verificador de fase diera por buena una fase a medias.

Aquí la mitad de base de los dos queda cerrada y medida. Pero `FIN-04` dice literalmente *"sigue **consultable** aunque los aseos que lo sustentan se borren"*, y consultable implica una pantalla que hoy no existe: la construye 07-12. Subirlos a `Complete` ahora repetiría exactamente el modo de fallo que esa corrección vino a evitar. Los sube el plan que cierre la última pantalla.

## Para quien siga

- **Los planes de interfaz ya tienen sus siete funciones.** El acoplamiento es por nombre de argumento: `p_desde`, `p_aseador`, `p_payout`. `lib/database.types.ts` es la fuente de verdad, y `tsc` atrapa cualquier desalineación en tiempo de build.
- **No existe ningún grant de escritura sobre `payout_periods`, `cleaner_payouts` ni `cleaner_payout_lines`.** Si una pantalla necesita escribir algo nuevo ahí, pasa por un RPC con guarda, no por un grant.
- **`detalle_de_pago` y `detalle_de_mi_pago` tienen que seguir declarando las mismas nueve columnas.** La aserción 84 se pone roja si alguien le añade una a cualquiera de las dos, y eso es lo que se quiere: el día que haga falta una columna más, va en las dos.
- **Las líneas del desglose no llevan enlace.** Apuntarían a filas que pueden no existir. La aserción 83 impide que alguien «arregle» eso añadiendo un join.

## Self-Check: PASSED

| Comprobación | Resultado |
|---|---|
| `supabase/migrations/20260913140000_27_pagos_y_mis_pagos.sql` existe | ✅ 734 líneas (el `min_lines` del plan era 280) |
| Contiene `private.is_active_cleaner` | ✅ 4 ocurrencias |
| Contiene `for update` (el bloqueo de fila de `marcar_pago_pagado`) | ✅ |
| Contiene `auth.uid` (el filtro por dueño y la autoría) | ✅ 8 ocurrencias |
| `supabase/tests/11_financiero.test.sql` modificado | ✅ 2077 líneas, `plan(94)` |
| `lib/database.types.ts` regenerado y sin deriva | ✅ |
| `e2e/fixtures.ts` modificado | ✅ |
| Commit `b975dcf` (migración) | ✅ |
| Commit `f7a59f4` (bloque M) | ✅ |
