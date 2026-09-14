---
phase: 07-financiero
plan: 05
subsystem: database
tags: [postgres, migracion, grants-por-columna, rls, security-definer, postgrest, supabase]

requires:
  - phase: 01-fundaciones
    provides: "`private.is_admin()`, la matriz de grants de la migración 07, el trigger `tg_cleanings_snapshot()` (FIN-01) y el patrón de revoke/grant pegado a cada definición de función"
  - phase: 05-push
    provides: "La migración 16, que escribió el precedente del grant por columna y la frase normativa de que los grants por columna no discriminan usuarios"
  - phase: 07-financiero
    provides: "`supabase/tests/11_financiero.test.sql` (plan 07-01), bloque D, que es el contrato de esta migración"
provides:
  - "`supabase/migrations/20260913110000_24_frontera_del_aseador.sql` — grants por columna sobre `public.cleanings` (26 de 28) y `public.properties` (16 de 18)"
  - "`public.tarifas_de_apartamentos(uuid[])` — la vía propia del admin para las dos cifras de dinero, con guarda de rol como primera sentencia"
  - "`lib/data/apartamentos.ts` sin ninguna proyección de comodín, con listas de columnas enumeradas"
  - "`fusionarTarifas()` — el cruce puro de cifras por identificador, con test unitario propio"
  - "El inventario de consumidores de las dos tablas, escrito en la cabecera de la migración"
affects: [07-07, 07-08, 07-09, 07-10, 07-11, 07-12, 07-13, 07-14]

tech-stack:
  added: []
  patterns:
    - "Un dato que solo el admin puede ver se saca del grant por columna PARA TODOS y se le devuelve al admin por una función `security definer` con guarda de rol: admin y aseador comparten el rol Postgres `authenticated`, así que 'solo el admin' no existe como categoría de grant"
    - "Con grants por columna vigentes, `select('*')` y el `RETURNING *` de una escritura son dos bombas de relojería distintas: el primero es visible, el segundo es el caso silencioso (la escritura pasa, la lectura de vuelta da 42501)"
    - "Un `is_empty()` de pgTAP sobre una tabla con grants por columna NO puede pedir el comodín: el error ABORTA el archivo entero en vez de dar un `not ok`"
    - "Un comentario no puede citar literalmente el token que un guardarraíl de `grep` prohíbe, o el guardarraíl se atrapa a sí mismo"

key-files:
  created:
    - supabase/migrations/20260913110000_24_frontera_del_aseador.sql
  modified:
    - lib/database.types.ts
    - lib/data/apartamentos.ts
    - lib/data/apartamentos.test.ts
    - app/(admin)/apartamentos/_actions.ts
    - supabase/tests/00_rls_aseos.test.sql
    - lib/domain/apartamento.integration.test.ts

key-decisions:
  - "`cleanings.pago_aseador` también sale del grant, y es decisión de este plan y no del research: leyendo la tabla fila a fila una aseadora podría armarse el acumulado del PERIODO EN CURSO, que es justo lo que D7-4 decidió no enseñarle porque ese número se mueve y puede bajar. Cerrarlo no costó nada: ningún código lo leía por esa vía"
  - "Los grants de ESCRITURA sobre `properties` no se tocan. `properties_admin_all` es `for all` con `private.is_admin()` en el `using` y en el `with check`: el aseador ya no puede escribir. Quitarle escritura por columna no añadiría garantía y sí rompería al admin, que comparte el rol"
  - "El trigger `tg_cleanings_snapshot()` NO se convierte en `security definer`. No hace falta: `authenticated` no tiene ningún DML sobre `cleanings`, así que ninguna inserción llega con ese rol, y las tres rutas reales (RPC definer, `service_role`, `postgres`) conservan su grant de tabla. Comprobado ejecutando, no leyendo"
  - "Las cuatro aserciones de aislamiento de `00_rls_aseos.test.sql` pasan de pedir el comodín a pedir `id`. Lo que miden es aislamiento POR FILA; la denegación POR COLUMNA la miden las aserciones 13 y 14 de `11_financiero.test.sql`, que es donde le corresponde"
  - "`leerTarifasDeApartamentos()` (que lanza) para los RSC, y la llamada directa al RPC dentro de `activarApartamento`: una Server Action tiene que devolver `ResultadoAccion` con el mensaje ya mapeado, y un `Error` envuelto llegaría a `mapDbError` sin su código y se convertiría en el mensaje genérico"
  - "`fusionarTarifas` usa `?? null` y nunca `||`: un `pago_aseador = 0` es una configuración válida, no un campo sin llenar, y convertirlo en null haría que el apartamento dejara de poder activarse"

patterns-established:
  - "Grant por columna enumerado a mano + comentario obligatorio de que toda columna nueva hay que añadirla en los DOS sitios (el grant de la migración y la constante de `lib/data/`), o nacerá invisible para la aplicación"
  - "La guarda de rol va como PRIMERA sentencia ejecutable del cuerpo de toda `security definer`: una definer propiedad del superusuario salta la RLS entera y sin esa línea entrega el catálogo completo"
  - "Un test de integración que necesita la fila entera tras escribir con el JWT del usuario pide solo `id` en la representación de vuelta y relee con el cliente de servicio: el hecho que se mide (el admin escribió) no cambia"

requirements-completed: [FIN-02, FIN-05]

coverage:
  - id: D1
    description: "Un aseador ya no puede leer la tarifa al huésped por la tabla de aseos, por ninguna vía"
    requirement: "FIN-05"
    verification:
      - kind: integration
        ref: "supabase/tests/11_financiero.test.sql aserción 13 — 'D7-7 FUGA: una aseadora NO puede leer cleanings.tarifa_huesped por PostgREST'"
        status: pass
      - kind: integration
        ref: "catálogo `information_schema.column_privileges`: `authenticated` tiene SELECT sobre 26 de las 28 columnas de `cleanings`; las dos que faltan son exactamente `tarifa_huesped` y `pago_aseador`"
        status: pass
    human_judgment: false
  - id: D2
    description: "Un aseador ya no puede leer la tarifa al huésped por la tabla de apartamentos, ni siquiera dentro de su ventana"
    requirement: "FIN-05"
    verification:
      - kind: integration
        ref: "supabase/tests/11_financiero.test.sql aserción 14 — 'D7-7 FUGA: una aseadora NO puede leer properties.tarifa_huesped en su ventana'"
        status: pass
      - kind: integration
        ref: "catálogo `information_schema.column_privileges`: 16 de las 18 columnas de `properties`, las dos que faltan son las de dinero"
        status: pass
    human_judgment: false
  - id: D3
    description: "La aseadora sigue viendo todo lo que necesita para trabajar: su aseo, su apartamento, su hora límite, su número de huéspedes y sus instrucciones"
    requirement: "FIN-05"
    verification:
      - kind: integration
        ref: "supabase/tests/11_financiero.test.sql aserciones 15 y 16 — nombre, cluster y hora límite del apartamento; fecha, estado, huéspedes e instrucciones del aseo"
        status: pass
      - kind: e2e
        ref: "e2e/aseo-ejecucion.spec.ts, e2e/aseo-checklist.spec.ts, e2e/aseo-evidencia.spec.ts (dentro de las 112 pasando con puerto 3290)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Las dos cifras de dinero del apartamento solo salen por una función con guarda explícita de admin"
    requirement: "FIN-02"
    verification:
      - kind: integration
        ref: "supabase/tests/11_financiero.test.sql aserción 19 — una aseadora que llama a `tarifas_de_apartamentos` recibe 42501"
        status: pass
      - kind: integration
        ref: "supabase/tests/11_financiero.test.sql aserción 22 — el admin SÍ obtiene filas de `tarifas_de_apartamentos`"
        status: pass
      - kind: integration
        ref: "catálogo `pg_proc`: `prosecdef = t`, `proconfig = {search_path=}`, y la primera sentencia del cuerpo es la guarda `private.is_admin()`"
        status: pass
    human_judgment: false
  - id: D5
    description: "El congelamiento de tarifas al crear un aseo (FIN-01) sigue funcionando: cerrar la puerta no rompió el trigger que las copia"
    requirement: "FIN-05"
    verification:
      - kind: integration
        ref: "ejecución directa contra la base: `create_manual_cleaning` llamada con rol `authenticated` congela 777000/333000; el insert directo también; y el UPDATE sobre estado terminal las reimpone"
        status: pass
      - kind: integration
        ref: "lib/test/aseos.integration.test.ts (tarifa nula en la informativa, 120000/45000 en la gestionada) y lib/test/aseos-financiero.integration.test.ts — 190/190 en verde"
        status: pass
    human_judgment: false
  - id: D6
    description: "El CRUD del admin sigue leyendo y editando las dos cifras, ahora por la vía nueva, y los tres clientes miran el resultado de la acción"
    requirement: "FIN-02"
    verification:
      - kind: unit
        ref: "lib/data/apartamentos.test.ts — 5 casos de `fusionarTarifas` (cruce por id, fila sin cifras, el cero que no se convierte en null, tarifa huérfana, lista vacía)"
        status: pass
      - kind: e2e
        ref: "e2e/apartamento-crud.spec.ts y e2e/apartamentos-lista.spec.ts — dentro de las 112 pasando"
        status: pass
      - kind: integration
        ref: "lib/domain/apartamento.integration.test.ts — 15/15, incluidas las puertas de activación con JWT reales"
        status: pass
    human_judgment: false

duration: 60min
completed: 2026-09-13
status: complete
---

# Fase 7 Plan 05: La frontera del aseador Summary

**Los 90.000 pesos que una aseadora leía desde su teléfono ya no salen de la base: grants por columna sobre las dos tablas, y el admin recupera las cifras por una función definer con guarda de rol.**

## Performance

- **Duración:** ~60 min
- **Iniciado:** 2026-09-13T18:52Z
- **Completado:** 2026-09-13T19:53Z
- **Tareas:** 3 de 3
- **Archivos modificados:** 6 (1 creado, 5 modificados)

## Accomplishments

- **La fuga está cerrada por las dos vías, y medido de punta a punta.** Impersonando a una aseadora activa con un aseo asignado, las cuatro consultas de dinero devuelven `42501`, y la proyección de comodín sobre `cleanings` también.
- **La casa sigue en pie.** La misma sesión de aseadora lee `Bogotá 1 — Apto 01|Bogotá 1|11:30:00` de su apartamento y `pendiente|2` de su aseo.
- **FIN-01 intacto, comprobado ejecutando.** Un aseo creado por la RPC definer con el rol `authenticated` puesto nace con `777000 / 333000` congelados; el insert directo también; y el UPDATE sobre un estado terminal los reimpone.
- **Cuatro aserciones rojas del bloque D pasan a verde** (13, 14, 19, 22). Las otras dos del bloque que este plan tenía que cubrir (15 y 16) ya estaban verdes y **siguen** verdes: son las que impedían aprobar la seguridad rompiendo el producto.
- **Dos consumidores que el plan no tenía inventariados**, los dos encontrados por la Task 1 y por la regresión, y los dos arreglados aquí.

## Task Commits

1. **Task 1 + Task 2: inventario, grants por columna y la función de tarifas** — `42a0e46` (feat)
2. **Task 3 [BLOCKING]: el CRUD del admin por la vía nueva y la regresión completa** — `73afac0` (feat)

## El inventario de la Task 1, que es lo que pedía su criterio de aceptación

### Columnas actuales, leídas del catálogo y no del archivo de migración

| Tabla | Columnas | Otorgadas | Excluidas |
|---|---|---|---|
| `public.cleanings` | 28 | 26 | `tarifa_huesped`, `pago_aseador` |
| `public.properties` | 18 | 16 | `tarifa_huesped`, `pago_aseador` |

Verificado contra `information_schema.column_privileges` después de aplicar: exactamente dos columnas sin grant por tabla, y son exactamente esas dos.

### Conteo ANTES del refactor, para poder comparar después

```
grep -c "select('*')" lib/data/apartamentos.ts            ->  3   (ahora 0)
grep -c "select('*')" app/(admin)/apartamentos/_actions.ts ->  1   (ahora 0)
grep -rn "tarifa_huesped\|pago_aseador" lib app            -> 141 líneas
```

### Consumidores con la SESIÓN DEL USUARIO (sí pasan por estos grants)

| Archivo:línea | Qué lee | Efecto |
|---|---|---|
| `lib/data/apartamentos.ts:106` | listado: las dos de dinero por nombre | **Rompía.** Ahora por la función |
| `lib/data/apartamentos.ts:158` | ficha: comodín sobre `properties` | **Rompía.** Lista explícita + función |
| `app/(admin)/apartamentos/_actions.ts:665` | activar: comodín sobre `properties` | **Rompía. NO ESTABA EN EL PLAN** |
| `app/(admin)/apartamentos/_actions.ts:479,488,683,726` | escrituras con `select('id')` | No rompen: el RETURNING pide solo `id` |
| `app/(admin)/aseadores/_actions.ts:212` | `properties`, columnas no monetarias | No rompe |
| `lib/data/aseadores.ts:128` | `id, nombre, is_active, responsable_id, suplente_id` | No rompe |
| `lib/data/aseo-aseador.ts:78` | embed: `id, nombre, cluster, hora_limite` | No rompe |
| `lib/data/aseos-del-aseador.ts:25` | embed: `id, nombre, cluster` | No rompe |
| `lib/data/operacion.ts:257` | `cleanings` + embed, sin dinero | No rompe |
| `lib/data/historial.ts:223` | `cleanings`, sin dinero | No rompe |

### Consumidores con el CLIENTE DE SERVICIO (no pasan por estos grants)

`lib/test/aseos.ts` (227, 250, 356, 646, 675, 821, 978, 1021), `lib/test/sync.ts` (150, 416, 597, 605), `e2e/fixtures.ts` (557, 1379), `e2e/apartamentos-lista.spec.ts`, `e2e/aseadores-baja.spec.ts`, `e2e/apartamento-crud.spec.ts`, y el bloque de `property_secrets` de `_actions.ts`. `service_role` conserva su `grant all on all tables` de la migración 07 §2.

### Superficies que no son PostgREST y leen las mismas tablas

- **`public.tg_cleanings_snapshot()`** — el punto ciego. Sección propia abajo.
- **Realtime**: `public.cleanings` está en la publicación `supabase_realtime`. El único consumidor, `SincronizacionEnVivo.tsx`, **no lee el payload**: ante cualquier evento llama `router.refresh()`. Que Realtime recorte columnas por grant no cambia nada suyo.
- **Las policies** de las dos tablas no nombran ninguna columna de dinero (`private.is_admin()`, `private.is_active_cleaner()`, `private.my_property_ids()`), así que la evaluación de RLS no necesita privilegio sobre ellas.
- **Vistas**: `information_schema.views` sobre `public` devuelve cero filas. No hay ninguna.

## El punto ciego: `tg_cleanings_snapshot()`

El trigger hace `select * into strict p from public.properties` y de ahí copia las dos cifras. Un comodín sobre las columnas que esta migración acaba de cerrar.

**No se rompe, y la razón es estructural:** el trigger es `security invoker`, pero `authenticated` **no tiene ningún DML sobre `public.cleanings`** (migración 07 §1.4), así que ninguna inserción de aseo llega jamás con ese rol activo. Las tres rutas reales son (1) las RPC `security definer` propiedad de `postgres`, donde el usuario actual es el dueño, (2) `service_role` y (3) `postgres` directo. Las tres conservan grant de tabla.

**Pero eso es el argumento, no la comprobación.** La comprobación se hizo **ejecutando**, con un apartamento de tarifas `777000 / 333000`:

| Vía | Resultado |
|---|---|
| `create_manual_cleaning(...)` con `role = authenticated` y el claim puesto | `777000 \| 333000 \| is_managed=t \| 11:00:00 \| pendiente` |
| `insert into public.cleanings` directo | `777000 \| 333000 \| is_managed=t` |
| UPDATE que intenta poner `1 / 1` tras pasar a `cancelada` | `777000 \| 333000` (reimposición de FIN-01) |

El trigger **no** se convirtió en `security definer` y **no** se le devolvió el grant a `authenticated`. Si algún día `authenticated` recibiera DML sobre `cleanings`, la salida correcta está escrita en la Parte D de la migración: hacerlo definer, nunca devolver el grant.

## La medición final de la frontera

Con una aseadora activa, responsable de un apartamento gestionado, con un aseo confirmado suyo:

```
cleanings.tarifa_huesped       ERROR:42501
cleanings.pago_aseador         ERROR:42501
properties.tarifa_huesped      ERROR:42501
properties.pago_aseador        ERROR:42501
select * de cleanings          ERROR:42501
tarifas_de_apartamentos()      ERROR:42501
SIGUE LEYENDO su apartamento   [PLACEHOLDER] Bogotá 1 — Apto 01|Bogotá 1|11:30:00
SIGUE LEYENDO su aseo          pendiente|2
```

## Archivos creados / modificados

- `supabase/migrations/20260913110000_24_frontera_del_aseador.sql` (**creado**, 293 líneas) — el inventario en la cabecera, los dos pares de revoke/grant, `public.tarifas_de_apartamentos(uuid[])` con su guarda y su par revoke/grant, y la Parte D que documenta el punto ciego del trigger.
- `lib/database.types.ts` — regenerado. Entra `tarifas_de_apartamentos`.
- `lib/data/apartamentos.ts` — cero proyecciones de comodín (eran 3). Cuatro constantes de columnas enumeradas, `leerTarifasDeApartamentos()`, `fusionarTarifas()` puro, y `listarApartamentos` / `leerApartamento` recompuestos sin cambiar la forma que devuelven.
- `lib/data/apartamentos.test.ts` — 5 casos nuevos para `fusionarTarifas`, con la nota explícita de por qué estos dobles **no** prueban nada sobre grants.
- `app/(admin)/apartamentos/_actions.ts` — `activarApartamento` deja el comodín, lee 16 columnas y trae las dos de dinero por el RPC directo, para que un `42501` llegue a `mapDbError` con su código intacto.
- `supabase/tests/00_rls_aseos.test.sql` — las cuatro `is_empty` y el join de fuga pasan de comodín a `id`.
- `lib/domain/apartamento.integration.test.ts` — el helper `crearApartamento` y el test del borrador dejan de pedir representación de comodín tras escribir.

## Decisiones tomadas

Las seis del bloque `key-decisions` del frontmatter. Las dos que más cuestan de revertir:

1. **`pago_aseador` también sale**, contra lo que el research daba por inocuo. El argumento no es el dato en sí, es el AGREGADO: fila a fila se arma el acumulado del periodo en curso, que D7-4 decidió no enseñar porque se mueve y puede bajar.
2. **Los grants de escritura no se tocan.** Aquí la asimetría es real: la lectura hay que cerrarla por columna porque la RLS no llega hasta la columna; la escritura ya está cerrada por RLS.

## Desviaciones del plan

### Auto-arregladas

**1. [Regla 3 - Bloqueante] `00_rls_aseos.test.sql` abortaba el archivo entero**

- **Encontrado en:** Task 2, en la primera corrida de `npm run db:test` tras aplicar los grants.
- **El problema:** cuatro aserciones usan `is_empty('select * from public.cleanings')` y una usa `select c.*, p.*`. `is_empty` **ejecuta** la consulta; con grants por columna el comodín devuelve `42501`, y un error dentro de `is_empty` no es un `not ok`: **aborta el archivo**. Medido: `Bad plan. You planned 16 tests but ran 3`. O sea, un rojo NUEVO que se llevaba por delante 13 aserciones verdes de la Fase 1. Es exactamente la trampa que la migración 07 §1.2 había dejado anotada por escrito.
- **El arreglo:** las cinco consultas pasan de pedir el comodín a pedir `id`. Lo que esas aserciones miden es aislamiento **por fila**, y `id` lo delata igual; la denegación **por columna** la miden las aserciones 13 y 14 de `11_financiero.test.sql`. El conteo de aserciones del archivo no cambia (16).
- **Verificación:** `npm run db:test` → los once archivos anteriores conservan sus **275** aserciones en verde.
- **Committeado en:** `42a0e46`.

**2. [Regla 1 - Bug] `activarApartamento` pedía comodín sobre `properties` y habría dado 42501 en cada activación**

- **Encontrado en:** Task 1, el inventario. **No estaba en el bloque `<interfaces>` del plan**, que solo mencionaba las escrituras de `_actions.ts`.
- **El problema:** `app/(admin)/apartamentos/_actions.ts:665` hace `select('*')` sobre `properties` con el cliente del usuario, para revalidar la fila con `valoresDesdeFilaGuardada`, que necesita las dos cifras. Con el grant por columna, **ningún apartamento se habría podido activar desde el menú de la tabla**, y el mensaje habría sido un error de permiso genérico.
- **El arreglo:** lista explícita de 16 columnas + el RPC de tarifas llamado directo en la action (no por el helper que lanza), para que el código del error sobreviva hasta `mapDbError`.
- **Verificación:** `npx tsc --noEmit` limpio, `e2e/apartamento-crud.spec.ts` y `e2e/apartamentos-lista.spec.ts` en verde, `lib/domain/apartamento.integration.test.ts` 15/15.
- **Committeado en:** `73afac0`.

**3. [Regla 1 - Bug] La representación de vuelta de un insert: el caso silencioso que la Task 1 fue a buscar**

- **Encontrado en:** Task 3, en la corrida de `npm run test:integration`. **11 tests rojos** en `lib/domain/apartamento.integration.test.ts`.
- **El problema:** el helper `crearApartamento` hacía `.insert(...).select('*')` con el JWT del admin. **El insert pasaba y la lectura de vuelta daba `42501 permission denied for table properties`**: en Postgres el comodín de un `RETURNING` exige privilegio sobre todas las columnas. Es literalmente el punto 4 del inventario que la Task 1 mandaba buscar (*"las escrituras que piden representación de vuelta, que es el caso silencioso"*), y apareció donde no se lo esperaba: en un test.
- **El arreglo:** la escritura se queda con el token del admin y devuelve solo `id`; la fila completa la relee el cliente de servicio. Lo que el helper demuestra —que el admin **puede** escribir `properties` con su propio token— no cambia. Mismo tratamiento en el test del borrador.
- **Verificación:** `npm run test:integration` → **190/190** en verde.
- **Committeado en:** `73afac0`.

**4. [Regla 3 - Bloqueante] Un comentario del código rompía el criterio de aceptación que lo exige**

- **Encontrado en:** Task 3, al verificar el criterio `grep -c "select('\*')" lib/data/apartamentos.ts == 0`.
- **El problema:** dos comentarios nuevos **citaban literalmente** el patrón que el guardarraíl prohíbe, así que el `grep` devolvía 2 en vez de 0. Es la misma lección que `scripts/ci/check-service-role.sh` dejó escrita en la Fase 1: *"ningún comentario puede citar literalmente un token que el propio script prohíbe"*.
- **El arreglo:** los dos comentarios **describen** el patrón ("proyección de comodín", "pedir el asterisco") en vez de escribirlo, y uno de ellos deja anotada la razón para el próximo que lo lea.
- **Verificación:** `grep -c` → `0`.
- **Committeado en:** `73afac0`.

---

**Total de desviaciones:** 4 auto-arregladas (2 bugs, 2 bloqueantes).
**Impacto:** ninguna es scope creep. Las cuatro son el radio de rotura del propio cambio de grants, que es justamente lo que la Task 1 existía para acotar. Las dos que el inventario **no** había previsto (`activarApartamento` y la representación de vuelta del helper de integración) son, las dos, proyecciones de comodín: el patrón que este plan vino a erradicar.

## Regresión: el antes y el después de las cuatro suites

| Suite | Línea base declarada | Después | Veredicto |
|---|---|---|---|
| pgTAP, once archivos anteriores | 275 en verde | **275 en verde** | Igual. `00_rls_aseos` conserva sus 16 |
| pgTAP, `11_financiero.test.sql` | 52 aserciones, **33 rojas** | 52, **29 rojas** | **4 menos**: 13, 14, 19 y 22 pasan a verde |
| Unitarios | 1006 (+ 3 archivos de dominio rojos de la Wave 0) | **1111 / 1111 en verde** | Los rojos de la Wave 0 ya no existen (07-06 aterrizó en paralelo). +5 míos |
| Integración | 169 | **190 / 190 en verde** | Ningún rojo. Los 11 que rompí quedaron arreglados en el mismo commit |
| E2E (puerto 3290, sin los 22 rojos declarados) | 112 pasando + 1 saltado | **112 pasando + 1 saltado** | Idéntico |
| `npm run db:advisors` | 0 | **0** | `No issues found` |
| `npm run db:types:check` | limpio | **limpio** | |
| `npx tsc --noEmit` | limpio | **limpio** | |
| `npm run lint` | 2 warnings previos | **2 warnings previos**, 0 errores | Los dos en archivos que no toqué |
| `npm run ci:arch` | los 3 OK | **los 3 OK** | |

Las seis aserciones del bloque D que le tocaban a este plan quedan **todas en verde**: 13 y 14 (denegación por las dos vías), 15 y 16 (la aseadora sigue leyendo lo suyo), 19 y 22 (la función niega a la aseadora y responde al admin). Las cuatro que siguen rojas del bloque D —17, 18, 20 y 21— son de `rentabilidad_aseos` y `resumen_financiero`, **del plan 07-08**.

## Problemas encontrados

**La suite E2E completa no da 112 limpias, y no es culpa de este plan.** Corrida entera contra base recién reseteada da `5 failed / 1 skipped / 32 did not run / 97 passed`. Desglose:

- 3 de los fallos y ~19 de los "did not run" son los **22 tests rojos declarados de la Wave 0** (`e2e/finanzas.spec.ts` + `e2e/mis-pagos.spec.ts`, verificado: `Total: 22 tests in 2 files`). Dependen de pantallas que llegan en 07-10 a 07-13.
- Los otros 2 fallos (`operacion.spec.ts:210` y `operacion-alertas.spec.ts:215`) son **daño colateral de esos rojos**: los dos specs exigen por diseño que `cleanings` arranque en 0 filas (*"La tabla cleanings arranca con 12 filas y este spec cuenta filas en pantalla"*), y `finanzas.spec.ts`, que corre antes por orden alfabético, muere a mitad y deja sus 12 filas sembradas sin limpiar.
- **Demostrado que no es mío:** corriendo la suite sin esos dos archivos, contra base limpia, el resultado es **112 pasando y 1 saltado, exactamente la línea base**, y ahí dentro van `operacion.spec.ts:210` y `operacion-alertas.spec.ts:215` en verde.

**Para 07-10 / 07-13:** cuando esos specs se pongan en verde el colateral desaparece solo. Si alguno se quedara rojo, hay que darle limpieza de `cleanings` en su `afterAll`, o `operacion*.spec.ts` seguirá cayéndose por contagio.

## User Setup Required

Ninguno. Este plan no añade ninguna variable de entorno ni configuración externa.

## Next Phase Readiness

- **07-08** (`rentabilidad_aseos` y `resumen_financiero`) hereda el patrón ya escrito y probado: definer + guarda como primera sentencia + par revoke/grant pegado. Sus cuatro aserciones del bloque D (17, 18, 20, 21) son lo único que queda rojo ahí.
- **07-09** (`mis_pagos_cerrados`) hereda además la decisión sobre `pago_aseador`: el aseador ya no puede armarse el acumulado del periodo en curso por ninguna vía de tabla, así que esa función es su **única** superficie de dinero.
- **07-10 a 07-14** (las pantallas): cualquier lectura nueva de `properties` o de `cleanings` tiene que enumerar columnas. Una proyección de comodín devuelve `42501`, y si es la representación de vuelta de una escritura, el fallo llega disfrazado de error de escritura.
- **Advertencia permanente:** toda columna nueva de esas dos tablas hay que añadirla al grant de la migración 24 **y** a `COLUMNAS_DE_PROPIEDAD` en `lib/data/apartamentos.ts`. Está escrito en los dos sitios.

---
*Fase: 07-financiero · Plan 05*
*Completado: 2026-09-13*

## Self-Check: PASSED

Los 8 archivos declarados existen en disco. Los 2 commits existen en el historial
(`42a0e46`, `73afac0`). Las cifras citadas, re-verificadas:

- migración 24: **293** líneas (≥180 exigidas), **2** `revoke select`, **2** `grant select (`
- `lib/data/apartamentos.ts`: **0** proyecciones de comodín, **5** menciones de `tarifas_de_apartamentos`
- `supabase/tests/00_rls_aseos.test.sql`: **27** sentencias `select` de nivel superior, con `plan(16)` intacto
