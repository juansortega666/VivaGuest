---
phase: 02-acceso-y-administraci-n-del-cat-logo
plan: 10
subsystem: capa-de-datos-del-catalogo
tags: [server-actions, rls, grants, service-role, zod, postgrest, integracion, ci]

# Dependency graph
requires:
  - phase: 02-03
    provides: "esquemaBorrador, esquemaActivar, mapDbError y campoDeConstraint"
  - phase: 02-04
    provides: "clienteConToken(): la consulta emitida con el JWT de un usuario concreto"
  - phase: 02-06
    provides: "exigirAdmin(), NoAutorizado y ResultadoAccion"
  - phase: 02-07
    provides: "lib/data/aseadores.ts: el patrón de recibir el cliente por parámetro"
  - phase: 02-08
    provides: "El patrón guard → Zod → cliente de servicio, y el guardarraíl 7 de CI"
provides:
  - "lib/data/apartamentos.ts: listarApartamentos, leerApartamento, listarClusters, listarAseadoresActivos"
  - "app/(admin)/apartamentos/_actions.ts: guardarApartamento, activarApartamento, desactivarApartamento, leerSecretos"
  - "valoresDesdeFilaGuardada(): la fila de properties en la forma que comen los esquemas"
  - "apartamento.integration.test.ts: las dos fronteras medidas con JWT reales"
  - "Guardarraíl 8 de CI: la tabla de secretos solo se nombra donde se construyó la fábrica"
affects: [02-11, 02-12, 02-13, 02-14, 02-15]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "El reparto de clientes por TABLA se escribe en la cabecera del archivo con su medición: la policy engaña y el grant manda"
    - "Un upsert que omite una columna la deja intacta: es lo que impide borrar la credencial del calendario en cada guardado"
    - "Un helper puro no puede vivir en un archivo con 'use server': solo se exportan funciones async, así que es intestable por construcción"
    - "Un guardarraíl que vigila 'quien construye X' da falso verde por AUSENCIA: quitar X apaga la vigilancia en vez de encenderla"
    - "Un test de ordenación con datos donde las dos ordenaciones coinciden es un falso verde"

key-files:
  created:
    - lib/data/apartamentos.ts
    - lib/data/apartamentos.test.ts
    - app/(admin)/apartamentos/_actions.ts
    - lib/domain/apartamento.integration.test.ts
  modified:
    - lib/domain/apartamento.schema.ts
    - lib/domain/apartamento.schema.test.ts
    - scripts/ci/check-service-role.sh

key-decisions:
  - "Guardarraíl 8 nuevo: se midió que cambiar leerSecretos() al cliente del usuario no lo atrapaba NADA, y el guardarraíl 7 no puede atraparlo porque su vigilancia se apaga al quitar la fábrica"
  - "El upsert de secretos OMITE la columna de la URL de exportación: incluirla en null borraría en cada guardado la credencial que conecta el plan 02-14"
  - "valoresDesdeFilaGuardada se movió a lib/domain/: dentro de un archivo 'use server' era inexportable y por tanto intestable, y sin su .slice(0,5) NINGÚN apartamento se puede activar"
  - "activarApartamento revalida la fila leída con esquemaActivar antes del update: el menú ⋯ no pasa por el formulario y para una unidad informativa no hay 23514 que la respalde"
  - "El primer test de collation de listarClusters era un falso verde: pasaba también con sort() a secas, y se reescribió con mayúsculas y con la tilde en medio"
  - "leerSecretos devuelve null tanto si no existe como si el llamador no es admin: distinguirlos la convertiría en un oráculo de qué ids existen"
  - "Ninguna función nueva en public, y el precio de crearla queda escrito en el archivo con su medición"

patterns-established:
  - "Toda aserción que espere vacío, 0 filas o denegado lleva delante un CONTROL que demuestra que la cosa existía"
  - "Romper la invariante a propósito antes de creerle al verde: ocho señuelos, ocho rojos, cero atrapados por tsc"

requirements-completed: [APTO-01, APTO-02, APTO-04, APTO-05, APTO-08, APTO-09, APTO-10]

# Metrics
duration: 26min
completed: 2026-09-02
---

# Fase 02 Plan 10: La capa de datos del catálogo de apartamentos

**Las lecturas tipadas del catálogo y las cuatro Server Actions de escritura, con cada tabla escrita por el único cliente que la base permite. El hallazgo que sostiene el plan estaba medido de antemano y se confirmó: `property_secrets` devuelve `42501` incluso al admin con su propio JWT, porque la policy `secrets_admin_all` existe y es inalcanzable. El hallazgo NUEVO es que nada del pipeline vigilaba esa frontera: cambiar `leerSecretos()` al cliente del usuario dejó verdes `tsc`, los 197 unitarios, los 41 de integración y los siete guardarraíles.**

## Performance

- **Duración:** 26 min
- **Tareas:** 3 de 3, todas autónomas, ninguna pendiente
- **Commits:** 6
- **Archivos creados/modificados:** 7

## Task Commits

1. **Tarea 1: Lecturas tipadas del catálogo** — `673ca63` (RED) → `eda65e8` (GREEN)
2. **Tarea 2: Server Actions de escritura** — `e06483b`
3. **Tarea 3: Las dos fronteras contra la base real** — `417e587`
4. **Guardarraíl 8 de CI** (desviación, Regla 2) — `507abec`
5. **`valoresDesdeFilaGuardada` a `lib/domain/`** (desviación, Regla 2) — `140d409`

---

## Puertas, con los números reales

Corridas todas de nuevo al cerrar, sobre el código final y sin señuelos:

| Puerta | Resultado | Antes de este plan |
|---|---|---|
| `npm run ci:arch` | **OK**, 8 guardarraíles | 7 guardarraíles |
| `npx tsc --noEmit` | **limpio** (exit 0) | limpio |
| `npm run test:unit` | **202 tests**, 14 archivos | 197, 13 archivos |
| `npm run test:integration` | **41 tests**, 4 archivos | 26, 3 archivos |
| `npx playwright test` | **37 tests** | 37 |
| `npm run build` | **OK** | OK |
| Semilla al terminar | **39 / 8 clusters / 5 informativas** | 39 / 8 / 5 |
| Restos del test en la base | **0 secretos, 0 aseos, 0 usuarios, 0 perfiles** | — |

Ninguna en rojo. Los 15 tests de integración nuevos y los 11 unitarios nuevos son de este plan.

---

## 1. El hallazgo del plan: el guardarraíl 7 tiene un punto ciego por AUSENCIA

El plan 02-08 midió que borrar `exigirAdmin()` de una action no lo atrapaba nada y añadió el guardarraíl 7. El 02-09 lo probó sobre una función nueva y salió rojo. Este plan lo probó dos veces más y también salió rojo las dos:

| Señuelo | `tsc` | `ci:arch` |
|---|---|---|
| Borrar el guard de `guardarApartamento` | limpio | **ROJO**, con el nombre de la función |
| Borrar el guard de `leerSecretos` | limpio | **ROJO**, con el nombre de la función |

`leerSecretos` es la sexta función de nivel superior del archivo y las cinco anteriores tienen guard: exactamente la configuración con la que la primera versión del guardarraíl daba falso verde. Sigue haciendo lo que dice.

**Pero tiene un punto ciego, y es de forma, no de implementación.** El guardarraíl 7 se pregunta *"¿quien construye la fábrica tiene guard antes?"*. Si alguien **quita** la fábrica, la pregunta deja de aplicar y el guardarraíl se calla. Es un falso verde por ausencia, no por orden.

Se midió con el señuelo que importa: `leerSecretos` pasa a usar el cliente del usuario en vez de la fábrica administrativa.

| Comprobación con `leerSecretos` en el cliente equivocado | Resultado |
|---|---|
| `npx tsc --noEmit` | **limpio** |
| `npm run ci:arch` (guardarraíles 1 a 7) | **OK** |
| `npm run test:unit` | **197 passed** |
| `npm run test:integration` | **41 passed** |

Cuatro puertas verdes sobre una función que, en producción, devolvería `null` para siempre y dejaría la sección 4 del formulario permanentemente vacía. Y el error simétrico —alguien "arregla" el `42501` añadiendo un grant en una migración— convertiría una columna hoy inalcanzable por construcción en una columna protegida por una sola policy (T-02-49).

### 1.1 Arreglo (Regla 2): guardarraíl 8

`scripts/ci/check-service-role.sh` gana una octava comprobación: **dentro de una función, la tabla de secretos no se puede nombrar si antes no se construyó la fábrica administrativa**. Es por función y no por archivo, por la misma razón medida en el 02-08: aquí la fábrica de `guardarApartamento` habría tapado la ausencia en `leerSecretos`.

Verificado en los dos sentidos, sobre las dos funciones que tocan la tabla:

| Estado | Guardarraíl 8 |
|---|---|
| Correcto (fábrica antes de la mención, en ambas) | **OK** |
| `leerSecretos` con el cliente del usuario | **rojo**: `_actions.ts:492: leerSecretos() nombra la tabla de secretos sin la fabrica administrativa antes` |
| El upsert de `guardarApartamento` con el cliente del usuario | **rojo**: `_actions.ts:312: guardarApartamento() …` |

**Su límite, escrito para que nadie lo dé por más de lo que es:** comprueba que la fábrica se construyó *antes* de la mención en la misma función, no que la llamada concreta la use. Quien deje la línea de la fábrica y aun así consulte con el otro cliente pasa el guardarraíl. Esa variante falla en ejecución con un `42501` inmediato que `mapDbError` traduce, así que es un fallo ruidoso y cerrado, no una fuga silenciosa. La dirección peligrosa —quitar la fábrica— sí queda cerrada.

Exenciones, las dos de siempre y por la misma razón acotada: `lib/test/`, que siembra con el cliente de servicio, y los `*.test.ts`, donde nombrar la tabla **con el JWT del usuario es justamente la aserción**.

---

## 2. La medición de `property_secrets`, confirmada en sus dos mitades

El plan avisa de que este es el punto donde alguien pierde una hora. Se reprodujo entero contra el stack vivo, y cada mitad tiene su aserción:

| Consulta | Cliente | Resultado |
|---|---|---|
| `select` sobre `property_secrets` | JWT del **admin** | `42501 permission denied for table property_secrets` |
| `upsert` sobre `property_secrets` | JWT del **admin** | `42501` |
| `select` sobre `property_secrets` | JWT del **aseador** | `42501` |
| `select` con embed `properties → property_secrets` | JWT del **admin** | error, `data` es `null` |
| El mismo `select` sobre la misma fila | cliente de **servicio** | la fila entera |
| `upsert` sobre `properties` | JWT del **admin** | OK |

**No es "cero filas": es ausencia de grant**, y la distinción no es cosmética. Un `[]` vendría de una policy que no casa, que es una protección mucho más frágil y que alguien puede aflojar sin darse cuenta. El test lo assertea por código (`42501`) y por mensaje (`permission denied`), no por lista vacía.

El embed se comprobó a propósito: T-02-49 afirma que no hay embed de PostgREST que alcance el código de la cerradura, y un embed es exactamente la ruta por la que una columna "protegida por policy" se escapa cuando el grant sí existe. Es una afirmación comprobable, así que se comprueba.

**La aserción central del criterio 2 lleva sus DOS mitades en el mismo test**: se escribe con el cliente de servicio, se lee entera y se comprueba campo a campo, y acto seguido **el mismo `select`, sobre la misma fila que acabamos de ver llena, con el JWT del admin, da `42501`**. Por separado, la primera mitad solo diría "persistió" y la segunda pasaría igual sobre una tabla vacía.

---

## 3. Los señuelos: ocho roturas deliberadas, ocho rojos, y uno que salió verde

| # | Señuelo | `tsc` | Qué se puso rojo |
|---|---|---|---|
| A | `listarClusters` sin `trim` | limpio | Unitarios: **2 failed** |
| B | `localeCompare('es-CO')` → `sort()` | limpio | **VERDE** ← el test no servía |
| B' | Idem, con el test reescrito | limpio | Unitarios: **1 failed** |
| C | Borrar el guard de `guardarApartamento` | limpio | Guardarraíl 7 |
| D | Borrar el guard de `leerSecretos` | limpio | Guardarraíl 7 |
| E | `leerSecretos` con el cliente del usuario | limpio | **NADA**, antes del guardarraíl 8 |
| F | El upsert de secretos con el cliente del usuario | limpio | Guardarraíl 8 |
| G | `mapDbError` devuelve el mensaje crudo en `23514` | limpio | Integración: **1 failed** |
| H | Quitar el `.slice(0, 5)` de `hora_limite` | limpio | Unitarios: **4 failed** |

`tsc --noEmit` salió **limpio con los ocho**. Van veintiocho señuelos en cinco planes y veintiocho compilaciones limpias.

### 3.1 El señuelo B: mi propio test de ordenación era un falso verde

La primera versión del test de collation usaba `['Zipaquira','Bogota','Bogotá','Armenia']` y esperaba `['Armenia','Bogota','Bogotá','Zipaquira']`. Con `sort()` a secas **da exactamente el mismo resultado**: en ese juego de datos las dos ordenaciones coinciden, porque `'a'` (U+0061) va antes que `'á'` (U+00E1) tanto por punto de código como por collation. El señuelo pasó en verde.

Los dos casos que sí discriminan, y que son los que quedaron en el test:

1. **Mayúsculas.** `sort()` compara code units y toda mayúscula ASCII (65..90) va antes que toda minúscula (97..122): `'Zipaquira'` quedaría antes que `'chapinero'`. El admin teclea el cluster a mano, así que una minúscula inicial es un dato realista.
2. **La tilde en medio.** `'Bogotá 1'` contra `'Bogota 2'`: por code unit gana `'Bogota 2'`; por collation `es-CO` la tilde es una diferencia terciaria y decide el dígito, así que gana `'Bogotá 1'`. **Órdenes opuestos.**

El comentario del test explica por qué está escrito así, para que nadie lo "simplifique" de vuelta.

---

## 4. Lo que ninguna suite cubría: el helper que rompe la activación entera

`activarApartamento` revalida con `esquemaActivar` la fila leída de la base. Para eso hay que convertir la fila al formato de los esquemas, y ahí hay una trampa de una línea:

**`properties.hora_limite` es de tipo `time` y PostgREST la serializa como `'11:30:00'`, con segundos. `RE_HORA` exige `'HH:MM'` exacto** —y es estricta a propósito, porque un `24:00` reventaría en Postgres como error de parseo crudo—. Sin recortar los segundos, la revalidación falla para **todos** los apartamentos del catálogo con el mensaje `La hora debe tener el formato HH:MM`, que no tiene nada que ver con lo que el admin acaba de pulsar. La funcionalidad entera queda rota y el mensaje apunta al sitio equivocado.

El helper estaba dentro de `_actions.ts`, donde **es intestable por construcción**: un archivo con `'use server'` solo puede exportar funciones async, así que un helper puro declarado ahí es inexportable, y `vitest.config.ts` solo recoge `lib/**`. Se movió a `lib/domain/apartamento.schema.ts` como `valoresDesdeFilaGuardada`, que además es su sitio natural: es la operación inversa del esquema.

Cinco tests nuevos, incluido el **CONTROL** de que la misma fila **sin** recortar los segundos **no** pasa, que es lo que demuestra que el test mide el recorte y no otra cosa. Señuelo H: quitar el `.slice(0, 5)` pone 4 en rojo y deja `tsc` limpio.

---

## 5. La divergencia UI ↔ base, escrita como test ejecutable

`apartamento.schema.ts` (plan 02-03) declara que la puerta de `contacto_externo` para unidades informativas es **solo de UI y sin respaldo en base**. Eso era un comentario. Ahora es un test de integración que **activa por API directa una unidad informativa con el contacto vacío y exige que la base la deje**:

```
expect(error).toBeNull();
expect(data?.[0].is_active).toBe(true);
```

Está escrito al revés de lo habitual a propósito: si algún día se pone rojo es porque alguien "arregló" el CHECK, y entonces hay que revisar el esquema de Zod, no borrar la prueba. Mientras siga verde, la única red de esa regla son `esquemaActivar` y la revalidación de `activarApartamento`.

Para el caso gestionado sí hay red de base, y también está medido: activar una gestionada sin tarifas ni responsable da **`23514`**. El test **assertea el SQLSTATE y no el nombre del constraint**: el research midió que dispara `props_active_requires_owner` y no `props_active_requires_rates` aunque las dos condiciones se violan, y Postgres no garantiza el orden de evaluación. La aserción sobre `mapDbError` exige que el mensaje **no** contenga `violates check constraint`, ni `props_active_requires`, ni `new row for relation`, y que **no** sea el genérico, que sería la señal de que falta un mapeo.

---

## 6. Los CONTROLES que impiden el verde vacío

El plan 02-09 midió que una aserción de "0 filas" pasa trivialmente cuando el fixture estaba vacío. Este archivo lleva un control delante de cada aserción negativa:

| Aserción | CONTROL que la precede |
|---|---|
| Admin recibe `42501` sobre `property_secrets` | Con el cliente de servicio la fila **existe** y se lee entera |
| El aseador ve 0 apartamentos | …y **después** de sembrarle un aseo vivo ve **exactamente 1**, y es el suyo, no las 39 |
| El `UPDATE` del aseador afecta **0 filas** sin error | El **mismo** update, con el **mismo** id, emitido por el admin, afecta **1 fila** |
| Desactivar no toca `cleanings` | El conteo **antes** es mayor que 0: hay algo que perder |
| Activar da `23514` | La fila nació con `is_active false` y las tres columnas en `null` |
| `mapDbError` no filtra texto crudo | El mensaje crudo **sí** contiene `violates check constraint` |

El control del `UPDATE` es el que más se paga: sin él, "0 filas" lo daría igual un id inexistente o un nombre de columna mal escrito, y el test seguiría verde con la policy rota.

---

## 7. El upsert que omite una columna, y el bug que evita

`guardarApartamento` escribe `property_secrets` con un payload que **omite deliberadamente la columna de la URL de exportación del calendario**. PostgREST solo actualiza las columnas presentes en el objeto, así que omitirla la deja intacta.

Ponerla en `null` "para completar la fila" borraría, en **cada guardado del formulario**, la credencial que conecta el plan 02-14. El formulario del apartamento no gestiona el calendario (UI-SPEC §8.1: vive en su propia pantalla), así que el admin no tendría forma de saber que acaba de desconectarlo, y el síntoma aparecería un día después en el sync, lejos de la causa.

Hay un test dedicado: se escribe la URL, se hace un segundo upsert con la forma exacta del payload de la action, y se exige que la URL siga ahí y el código nuevo también.

---

## 8. Decisiones de la capa de lectura

- **Tres consultas y cruce en memoria**, no un embed profundo. Son 39 apartamentos y ~8 perfiles. Un embed de `profiles` expondría el resto de sus columnas a la forma de la respuesta, y uno de `calendar_feeds` arrastraría columnas de salud que la tabla no pinta.
- **`calendar_feeds` no lleva la URL y aquí solo se pregunta si existe un feed activo.** La URL es una credencial y vive en la otra tabla.
- **`listarAseadoresActivos` devuelve también los inactivos**, pese al nombre, que es el del contrato del plan. Lo exige UI-SPEC §8.3: si el responsable actual quedó desactivado, el `Select` tiene que seguir mostrándolo marcado `(inactivo)`. Filtrar aquí haría esa regla imposible aguas abajo porque el componente ya no tendría el nombre que pintar.
- **`leerApartamento` devuelve `null` tanto si no existe como si la RLS no lo deja ver.** Distinguirlos le diría a quien pregunta que el id existe. Misma decisión en `leerSecretos`.
- **Ni `unstable_cache` ni la directiva de cache.** Son datos por usuario y una entrada compartida se le sirve a otro.
- **El módulo de lectura no nombra ninguna de las dos columnas de credenciales**, verificado con `grep`. Por eso su cabecera las describe en vez de escribirlas: un comentario que cita el token que un grep vigila hace que el guardarraíl se atrape a sí mismo, y en este repo ya pasó cuatro veces.

---

## 9. Trampas medidas que los planes siguientes van a pisar

**`property_rooms_etiqueta_uniq` NO es un índice parcial.** Es un `unique (property_id, etiqueta)` a secas, así que **un cuarto desactivado sigue reservando su etiqueta aunque no se vea**. `leerApartamento` devuelve solo los cuartos activos, que es lo que el plan pide y lo que el formulario pinta. Si el plan 02-12 valida el duplicado únicamente contra esa lista, re-añadir `Baño social` pasará la validación de cliente y morirá con un `23505` sobre una fila invisible. `mapDbError` lo traduce, pero el admin no va a entender por qué. Queda escrito en el propio archivo.

Por el otro lado, `mic_prop_uniq` tampoco excluye los inactivos, y por eso `leerApartamento` devuelve **todos** los faltantes del apartamento sin filtrar por `is_active`: es lo que permite reactivar un ítem en vez de chocar con su duplicado. Los dos criterios son distintos a propósito y el archivo dice por qué.

**Ser responsable de un apartamento no da acceso de lectura al aseador.** `properties_cleaner_select` acota por `private.my_property_ids()`, que sale de `cleanings` y no de `properties.responsable_id`. El test lo fija como control previo: antes de sembrar el aseo, el aseador ve **0** filas pese a ser el responsable.

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Regla 3 - Bloqueante] El worktree venía con la base equivocada**

- **Encontrado durante:** el arranque. `git merge-base` devolvía el propio HEAD, o sea que el worktree estaba **detrás** del commit base del plan y no traía ninguno de los planes 02-01 a 02-09.
- **Arreglo:** el `git reset --hard` que el propio chequeo de arranque contempla, con el árbol limpio. Es la tercera vez consecutiva (también le pasó al 02-08 y al 02-09).
- **Archivos versionados:** ninguno.

**2. [Regla 1 - Bug] Mi propio test de ordenación era un falso verde**

- **Encontrado durante:** Tarea 1, al correr el señuelo B. Detalle completo en §3.1.
- **Arreglo:** juego de datos con mayúscula inicial y con la tilde en posición media, donde las dos ordenaciones dan órdenes **opuestos**.
- **Archivos:** `lib/data/apartamentos.test.ts`. **Commit:** `eda65e8`.

### Añadidos deliberados sobre el plan

**3. [Regla 2 - Funcionalidad crítica ausente] Guardarraíl 8 de CI**

El registro de amenazas dispone **T-02-49** y **T-02-50** como `mitigate`, y la mitigación efectiva de las dos es *"se toca solo con la fábrica administrativa"*. Se midió que ninguna puerta automática lo comprobaba y que el guardarraíl 7 **no puede** comprobarlo, porque su vigilancia se apaga justo cuando se quita la fábrica. Detalle completo en §1. **Commit:** `507abec`.

**4. [Regla 2] `valoresDesdeFilaGuardada` sale a `lib/domain/` y gana 5 tests**

Una línea sin cobertura que rompe la activación de todo el catálogo, alojada en el único sitio del repo donde es imposible testearla. Detalle completo en §4. **Commit:** `140d409`.

**5. [Regla 2] Validación del id con Zod en las tres actions que lo reciben**

El plan dice *"cada action arranca igual: `exigirAdmin()`, después Zod"*. Para `activarApartamento`, `desactivarApartamento` y `leerSecretos` el único input es el id, y sin validarlo un uuid malformado llega a Postgres y vuelve como `22P02`, que `mapDbError` solo puede traducir al mensaje genérico. Cuesta una línea y hace que la frase del plan sea literalmente cierta en las cuatro.

**6. [Regla 2] Tests de más sobre lo que el plan pedía**

- `apartamento.integration.test.ts` lleva **15** y no las 8 aserciones del plan: el aseador contra `property_secrets`, el embed de PostgREST, el CONTROL de que ser responsable no da lectura, el CONTROL del update por el admin, la divergencia informativa como test ejecutable, y el upsert que no borra la URL.
- `apartamento.test.ts` lleva **6** y no 3: el orden por collation, el cluster de solo espacios y que no mute la lista que recibe.
- `apartamento.schema.test.ts` gana **5**, con su CONTROL.

**7. [Regla 2] `guardarApartamento` escribe `?? null` en vez de omitir la clave**

Si el admin borra la dirección de un apartamento, hay que **escribir** `null`. Omitiendo el campo, el update lo dejaría como estaba y el borrado no tendría efecto sin que nada lo dijera: el formulario mostraría el campo vacío hasta recargar.

**8. [Regla 2] En modo borrador NO se toca `is_active`**

El plan describe los dos modos por su esquema de validación. La consecuencia sobre el estado no está escrita, y la lectura ingenua (escribir `is_active: false` en borrador) haría que guardar un cambio menor sobre un apartamento **activo** lo desactivara en silencio. En borrador la columna no se incluye en el payload.

### Desviaciones menores del texto del plan

**9. `EntradaApartamento` es anidada y no plana**

El plan dice *"recibe los campos del formulario más un modo"*. La entrada quedó como `{ id?, modo, campos, secretos? }`, con los tres campos de la sección 4 en su propia clave. Un objeto plano es más parecido a lo que da un formulario, pero esconde la frontera que este plan existe para fijar: `campos` va a `properties` con el cliente del usuario y `secretos` va a `property_secrets` con el administrativo. Anidado, el reparto se ve en la firma y no hay que recordarlo. Omitir `secretos` significa "no tocar `property_secrets` en absoluto".

**10. El esquema Zod de los secretos vive en `_actions.ts`**

Son tres campos y el espejo de un solo CHECK (`property_secrets_tipo_cerradura_valido`). Sacarlo a `lib/domain/` habría añadido un archivo fuera de los que el plan declara. Su comportamiento queda cubierto por el `23514` que `mapDbError` ya mapea y por el test de persistencia. Si el plan 02-12 necesita validarlo en cliente, ese es el momento de moverlo.

**11. `guardarApartamento` y `property_secrets` no son atómicos, y es deliberado**

Son dos operaciones con dos clientes distintos y no hay transacción común: si la segunda falla, el apartamento queda guardado y los secretos no. Hacerlo atómico exigiría un RPC en `public`, que es justamente lo que esta fase no crea. El precio de crearlo queda escrito en la cabecera del archivo, con las dos líneas de `revoke`/`grant` que serían innegociables y la razón medida (en PG 17.6 `alter default privileges` no puede quitarle `EXECUTE` a PUBLIC).

---

## Threat Model: dispositions aplicadas

| Threat ID | Disposición | Cómo quedó |
|---|---|---|
| T-02-48 | mitigate | `exigirAdmin()` es la primera sentencia de las cuatro actions; dos verificadas por el guardarraíl 7 (señuelos C y D, rojo) y las otras dos protegidas estructuralmente porque el cliente lo devuelve el propio guard. Y la frontera real está medida: el update de un aseador sobre `properties` afecta **0 filas** sin error, con CONTROL de que el mismo update por el admin afecta 1 |
| T-02-49 | mitigate | Medido en cuatro formas: `select` y `upsert` del admin, `select` del aseador y **embed de PostgREST**, los cuatro `42501`. Y ahora también por CI: el guardarraíl 8 impide nombrar la tabla sin la fábrica |
| T-02-50 | mitigate | Guard como primera sentencia, un apartamento por llamada, y `null` indistinguible entre "no existe" y "no autorizado". El señuelo D lo pone rojo |
| T-02-51 | mitigate | La URL no se escribe en ningún log ni en `last_error`: `_actions.ts` no la registra en ningún sitio y `lib/data/apartamentos.ts` ni siquiera la nombra (verificado con `grep`) |
| T-02-52 | mitigate | `import 'server-only'` + `'use server'` + guardarraíles 1, 5, 7 y **8**. `npm run build` lo confirma de facto |
| T-02-53 | mitigate | Doble capa. `esquemaActivar` en la action **y** revalidación de la fila leída en `activarApartamento`, no solo en el formulario. La segunda capa (el `23514`) está probada en integración, y también está probado el único caso donde esa segunda capa **no existe** |
| T-02-54 | mitigate | **Este plan no crea ninguna función en `public`.** La restricción y su razón medida quedan escritas en `_actions.ts` y en `lib/data/apartamentos.ts` |
| T-02-55 | accept | Sin cambios. `properties.cluster` sigue siendo `text not null`. `listarClusters` normaliza por `trim`, descarta el cluster en blanco y ordena por collation; la sugerencia de coincidencias en el combobox le toca al 02-12 |

## Threat Flags

Ninguna superficie de seguridad nueva fuera del registro. Este plan añade **cuatro** Server Actions, las cuatro con guard, y **cero** endpoints de API, rutas de auth, migraciones o cambios de schema.

## Known Stubs

**Ninguno de producto.** Las cuatro lecturas y las cuatro actions están completas y cableadas contra la base real.

Lo que este plan **no** construye, por contrato y no por omisión:
- La escritura de `calendar_feeds`, que es del plan 02-14. `listarApartamentos` ya lee su existencia para la columna `CALENDARIO` de la tabla.
- Las pantallas que consumen todo esto: `/apartamentos` (02-11), el formulario (02-12) y `/apartamentos/[id]/calendario` (02-14). El directorio `app/(admin)/apartamentos/` existe hoy con un solo `_actions.ts` y sin `page.tsx`, así que Next no genera ninguna ruta: el build lo confirma.

## Notas para los planes siguientes

- **02-12 (formulario), lo más importante:**
  - `guardarApartamento` recibe `{ id?, modo, campos, secretos? }`. `campos` son los 12 de `apartamentoBase`; `secretos` son los tres de la sección 4. **Omitir `secretos` no borra nada**: la tabla ni se toca.
  - **El `id` del apartamento nuevo vuelve en `resultado.id`.** Es lo que permite navegar al detalle después de crear.
  - `hora_limite` te llega de la base como `'11:30:00'` y el esquema exige `'HH:MM'`. Usa `valoresDesdeFilaGuardada` para precargar el formulario; no reimplementes el recorte.
  - `property_rooms_etiqueta_uniq` **no** es parcial: un cuarto desactivado sigue reservando su etiqueta. Ver §9.
  - El error vuelve con `campo` cuando `campoDeConstraint` lo reconoce; con `campo` va inline y sin él a toast.
- **Cualquier plan que toque `property_secrets`:** el guardarraíl 8 exige que la fábrica administrativa se construya **antes** de nombrar la tabla, en la misma función. Si tu código necesita otra forma (una función flecha, por ejemplo), el `awk` solo reconoce `function` de nivel superior: **amplíalo, no lo esquives**.
- **02-14 (conectar calendario):** `calendar_feeds` **sí** es escribible con el JWT del admin (medido). La URL va a `property_secrets` con la fábrica, y `guardarApartamento` ya está escrito para no pisártela: su upsert omite esa columna a propósito. Mantén la regla de que la URL nunca entra en un log ni en `last_error`.
- **02-11 (tabla de 39 apartamentos):** `listarApartamentos` te da las columnas de §7.1 más `responsableNombre` y `tieneCalendario`. `listarClusters` es **pura** y sale de las filas ya cargadas: no hagas otra consulta. Sigue en pie que los 34 gestionados de la semilla están **inactivos** y sin tarifas.
- **Cualquier test de integración nuevo:** el `afterAll` borra en este orden y no es negociable: aseos → apartamentos → usuarios. `cleanings.aseador_id` y `properties.responsable_id` son `on delete restrict`, y el stack local es **compartido entre worktrees**.
- **Bloqueante residual heredado de 02-01, 02-04, 02-05, 02-06, 02-07, 02-08 y 02-09:** sigue pendiente un `npx supabase stop && npx supabase start` al cierre de la fase para confirmar en frío que el `config.toml` commiteado reproduce el entorno.
- **El stack local quedó limpio.** Verificado al terminar: 39 apartamentos (los de la semilla, con sus 8 clusters y sus 5 informativas), 0 secretos, 0 aseos, 0 usuarios y 0 perfiles. Ninguna siembra de este plan sobrevive.
- **Los 3 errores de lint de `e2e/fixtures.ts`** siguen ahí y siguen fuera de alcance: son del plan 02-06 y están anotados como ítem 1 de `deferred-items.md`. `npm run build` no lintea `e2e/`.

## Self-Check: PASSED

Los 7 archivos que este resumen declara creados o modificados existen en disco, y los 6 hashes de commit (`673ca63`, `eda65e8`, `e06483b`, `417e587`, `507abec`, `140d409`) resuelven a objetos de tipo `commit` en el historial de la rama. Ni `STATE.md` ni `ROADMAP.md` aparecen en el diff del plan.
