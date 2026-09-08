---
phase: 02-acceso-y-administraci-n-del-cat-logo
plan: 09
subsystem: baja-y-revocacion-de-acceso
tags: [server-actions, gotrue, ban, rls, service-role, base-ui, playwright, integracion]

# Dependency graph
requires:
  - phase: 02-04
    provides: "clienteConToken(): la consulta emitida con el JWT de un usuario concreto"
  - phase: 02-06
    provides: "exigirAdmin(), ResultadoAccion, el middleware que valida con getUser()"
  - phase: 02-07
    provides: "TablaAseadores con el menú ⋯ montado, contarActivos(), y el 23514 medido"
  - phase: 02-08
    provides: "El patrón guard → Zod → cliente de servicio, y el guardarraíl 7 de CI"
provides:
  - "fijarActivacionAseador(uid, activo): UNA función que hace SIEMPRE las dos operaciones"
  - "consecuenciasDeBaja(uid): los tres conteos reales del diálogo, con el cliente del usuario"
  - "DialogoDesactivarAseador: ASEADOR-02 con consecuencias calculadas de la base"
  - "MenuAseador: el menú ⋯ de la lista, cableado (cierra el stub del 02-07)"
  - "lib/domain/plural.ts: la concordancia de número, una sola vez para §11.1 y §11.3"
  - "revocacion.integration.test.ts: la prueba central de PLAT-04 con JWT reales"
  - "aseadores-baja.spec.ts: el criterio 4 del ROADMAP demostrado con navegador"
affects: [02-10, 02-11, 02-14, 02-15]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Una operación de dominio con DOS mitades obligatorias se escribe como UNA función con un booleano, no como dos funciones"
    - "Un test de revocación sin aserción de CONTROL previa es un verde vacío: 0 filas también lo cumple quien nunca tuvo acceso"
    - "Un spec E2E que banea usuarios usa cuenta PROPIA: el ban mata el storageState compartido del rol"
    - "La afirmación 'esta API no existe con esa firma' se escribe como test, no como comentario"
    - "Los tipos generados no ven los triggers BEFORE INSERT: el cast se acota con `satisfies Partial<Insert>`"

key-files:
  created:
    - app/(admin)/aseadores/_components/DialogoDesactivarAseador.tsx
    - app/(admin)/aseadores/_components/MenuAseador.tsx
    - lib/domain/plural.ts
    - lib/domain/plural.test.ts
    - lib/auth/revocacion.integration.test.ts
    - e2e/aseadores-baja.spec.ts
  modified:
    - app/(admin)/aseadores/_actions.ts
    - app/(admin)/aseadores/_components/TablaAseadores.tsx

key-decisions:
  - "El guardarraíl 7 del plan 02-08 atrapó el borrado de exigirAdmin() sobre código que no escribió: primera prueba real y salió en rojo con el nombre de la función"
  - "El update de profiles lleva .eq('role','aseador'): sin él un uid de admin pasado a mano se banea a sí mismo, y con UN solo admin eso deja el producto sin forma de reactivar a nadie"
  - "El test de integración lleva una aserción de CONTROL antes de la baja, porque sin ella el '0 filas' de después lo cumpliría un aseador que nunca leyó nada"
  - "Los 34 apartamentos gestionados de la semilla están INACTIVOS: el sembrado del test no puede filtrar por is_active, y el bloque ámbar necesita activar uno a mano"
  - "El spec E2E crea su propia cuenta: aplicar ban_duration sobre aseador1 o aseador2 mataría el storageState que comparten los demás specs"
  - "La baja E2E se ejecuta POR LA UI y no por API: desactivar con el cliente de servicio solo probaría el middleware, no la Server Action"
  - "signOut(uid, 'global') se ejerce en un test para que la corrección del research sea ejecutable y no un comentario que alguien borre"

patterns-established:
  - "Romper la invariante a propósito y exigir el rojo antes de creerle al verde. Seis señuelos, seis rojos, cero atrapados por tsc"
  - "Cuando un test pasa a la primera, el trabajo empieza ahí: los 13 de integración y los 4 E2E pasaron a la primera y aun así se auditaron uno por uno"

requirements-completed: [ASEADOR-02, PLAT-04]

# Metrics
duration: 28min
completed: 2026-09-02
---

# Fase 02 Plan 09: Baja de aseador y revocación de acceso inmediata

**El administrador da de baja a un aseador y ese aseador pierde el acceso a los datos en la siguiente sentencia SQL y la sesión en la siguiente navegación, aunque tuviera la aplicación abierta en el teléfono. Se cierran ASEADOR-02 y PLAT-04, y con ellos el criterio 4 del ROADMAP, que es el más duro de la fase. La corrección del research se confirmó de punta a punta: `auth.admin.signOut(id, 'global')` no existe, lo que revoca es `profiles.is_active` más `ban_duration`, y reactivar exige las dos operaciones igual que darlas de baja.**

## Performance

- **Duración:** 28 min
- **Tareas:** 3 de 3, todas autónomas, ninguna pendiente
- **Commits:** 3
- **Archivos creados/modificados:** 8 (+1202 líneas)

## Task Commits

1. **Tarea 1: Una sola función de activación** — `35c50a2`
2. **Tarea 2: Diálogo de baja y menú de la fila** — `7e62b1c`
3. **Tarea 3: La prueba central de PLAT-04** — `e62ea94`

---

## Puertas, con los números reales

Corridas todas de nuevo al cerrar, sobre el código final y sin señuelos:

| Puerta | Resultado | Antes de este plan |
|---|---|---|
| `npm run ci:arch` | **OK**, 7 guardarraíles | 7 guardarraíles |
| `npx tsc --noEmit` | **limpio** (exit 0) | limpio |
| `npm run test:unit` | **191 tests**, 13 archivos | 188, 12 archivos |
| `npm run test:integration` | **26 tests**, 3 archivos | 13, 2 archivos |
| `npx playwright test` | **37 tests** | 33 |
| `npm run build` | **OK**, `/aseadores` sigue dinámica | OK |

Ninguna en rojo. Los 13 tests de integración nuevos y los 4 E2E nuevos son de este plan.

---

## 1. Los señuelos: seis roturas deliberadas, seis rojos

Ninguno de los tests de este plan se dio por bueno por haber pasado a la primera. Los 13 de integración pasaron a la primera y los 4 de Playwright también, que es exactamente la situación que el plan 02-08 describe como peligrosa.

| # | Señuelo | `tsc` | `ci:arch` | Qué se puso rojo |
|---|---|---|---|---|
| A | **Borrar `exigirAdmin()` de `fijarActivacionAseador`** | limpio | **ROJO** | Guardarraíl 7, con el nombre de la función |
| B | La baja no baja `is_active` (solo banea) | limpio | OK | Integración: **3 failed**, incluida la aserción central |
| C | El aseo sembrado no se le asigna al aseador | limpio | OK | Integración: **3 failed**, empezando por el CONTROL |
| D | La baja no aplica `ban_duration` | limpio | OK | Integración: **4 failed** · E2E: **2 failed** (criterio 4 entre ellas) |
| E | La reactivación nunca levanta el ban | limpio | OK | E2E: **1 failed**, en el login real |
| F | El update omite `deactivated_at` | limpio | OK | E2E: **2 failed** · Integración lo fija con el `23514` |

`tsc --noEmit` salió **limpio con los seis**. Van veinte señuelos en cuatro planes y veinte compilaciones limpias.

### 1.1 El guardarraíl 7 funcionó sobre código que no escribió

Esto era lo que quedaba por saber del plan 02-08. Ese plan añadió el guardarraíl 7 después de medir que borrar `exigirAdmin()` de `crearAseador` no lo atrapaba **nada**: ni el compilador, ni 188 unitarios, ni 13 de integración, ni 33 E2E, ni los seis guardarraíles anteriores. Pero lo verificó contra su propia función, que es el caso fácil.

Este plan es su primera prueba sobre una función nueva, escrita por otro agente, en el mismo archivo pero con otra forma: `fijarActivacionAseador` es la **tercera** exportación de `_actions.ts` y las dos anteriores (`generarPassword` y `crearAseador`) sí tienen guard. Es justo la configuración con la que la primera versión del guardarraíl —la que comparaba por archivo— daba un falso verde.

Se borró el bloque del guard entero y se corrió todo:

```
tsc --noEmit                                    → exit 0, limpio
npm run ci:arch                                 → ROJO
  app/(admin)/aseadores/_actions.ts: fijarActivacionAseador()
  construye la fabrica administrativa sin un guard antes
```

**Atrapado, y con el nombre de la función correcta.** El recorrido por `awk` función a función distingue las tres exportaciones y no se conforma con que alguna del archivo tenga guard. El guardarraíl del 02-08 hace lo que dice hacer.

Vale la pena anotar el límite: `consecuenciasDeBaja` **no** construye la fábrica administrativa (usa el cliente del usuario), así que el guardarraíl 7 no la vigila. Ahí la protección es estructural por otra vía: el cliente con el que consulta **lo devuelve `exigirAdmin()`**, así que borrar el guard deja la función sin cliente y no compila. Es una defensa distinta y más fuerte, pero conviene saber que no viene del guardarraíl.

---

## 2. Cómo se verificó el criterio 4, y por qué no se puede pasar con un login nuevo

El criterio es *"el aseador desactivado pierde el acceso de inmediato aunque tuviera la sesión abierta"*. Un test que hiciera login **después** de la baja fallaría aunque la revocación sobre sesiones vivas estuviera completamente rota: probaría el login, no la revocación. Se verificó en dos capas, y en ninguna de las dos hay un login posterior a la baja.

### 2.1 En integración: el mismo `access_token`, guardado antes

`lib/auth/revocacion.integration.test.ts` hace un login **real** contra GoTrue antes de tocar nada y se guarda el `access_token` y el `refresh_token` en variables del módulo. Todas las consultas posteriores se emiten con `clienteConToken(tokenVivo)`, que fija ese JWT en el header `Authorization` y lleva `autoRefreshToken: false`, así que la librería no puede renovarlo por detrás y convertir la prueba en otra cosa.

La secuencia, con la aserción de cada paso:

| Paso | Aserción |
|---|---|
| **CONTROL, antes de la baja** | Con ese token, `properties` devuelve **más de 0 filas**, y `getUser()` responde OK |
| `signOut(uid,'global')` | Devuelve error **y el token sigue sirviendo**: más de 0 filas |
| `update profiles set is_active=false` a secas | `23514`, con `profiles_deactivation_coherent` en el mensaje |
| Baja con las dos columnas | **Con el mismo token: `data` es `[]` y `error` es `null`** |
| Idem sobre `room_types` | `[]` — se cayó la función compartida, no una policy suelta |
| Idem sobre `profiles` | **1 fila**, la propia, con `is_active: false` |
| `ban_duration` aplicado | `getUser(tokenVivo)` → `user_banned`, `data.user` es `null` |
| `refreshSession(refreshVivo)` | `user_banned` |
| `signInWithPassword` | `user_banned` |
| `getClaims(tokenVivo)` | **OK**, con `sub` correcto |

**La aserción de CONTROL no es decorativa y el señuelo C lo demuestra.** Sin ella, "0 filas después de la baja" lo cumpliría igual un aseador que nunca tuvo acceso a nada. Cuando se quitó la asignación del aseo sembrado, la aserción central siguió **verde** (0 filas antes y 0 después) y lo que se puso rojo fue el CONTROL. Ese es exactamente el falso verde que la aserción previa existe para impedir.

Y la distinción entre `[]` y error tampoco es cosmética: un `42501` también sería "no pudo leer", pero por falta de grant, que es una causa que podría aparecer por accidente y dar un verde equivocado. Lo que ocurre de verdad es que `private.is_active_cleaner()` devuelve `false`, la policy deja de casar y PostgREST responde una lista vacía sin error.

### 2.2 En navegador: la pestaña que ya estaba abierta

`e2e/aseadores-baja.spec.ts` mantiene **dos contextos de navegador a la vez**. La aseadora entra por `/login`, aterriza en `/mis-aseos` y se queda ahí. Sin cerrar esa pestaña ni tocar sus cookies, el admin la desactiva **desde la UI** (menú ⋯ → `Desactivar` → botón del diálogo). Después, sobre la pestaña de la aseadora, solo se hace `page.reload()`.

```
await pagina.reload();
await expect(pagina).toHaveURL(/\/login$/);
```

Se desactiva por la UI y no por API a propósito: desactivar con el cliente de servicio probaría el middleware, pero no que la Server Action haga sus dos mitades. Por la UI, el test recorre la cadena entera.

El señuelo D lo confirma: quitando `ban_duration` de la action, este test se pone rojo con el mensaje exacto de que la pestaña se quedó en `/mis-aseos`.

---

## 3. ¿Reactivar con las dos operaciones quedó estructuralmente forzado?

**Sí, dentro de la aplicación. No, a nivel de base de datos.** La distinción importa y conviene que quede escrita.

**Lo que sí está forzado.** No existe ninguna función `reactivarAseador`. Existe `fijarActivacionAseador(uid, activo)`, y las dos operaciones están en su cuerpo, en secuencia, sin ninguna rama que ejecute una y no la otra:

- `update profiles set is_active = <activo>, deactivated_at = <activo ? null : now()>`
- `updateUserById(uid, { ban_duration: activo ? 'none' : '876000h' })`

El booleano gobierna **el valor** de cada operación, nunca **si se ejecuta**. Llamarla a medias no es una disciplina: es imposible sin editar la función. Los dos únicos llamadores (`DialogoDesactivarAseador` con `false` y `MenuAseador` con `true`) pasan por la misma ruta de código.

**Lo que no está forzado.** Nada impide que alguien, en un plan futuro, escriba un `update profiles set is_active = true` suelto contra la base. La coherencia entre `is_active` y `deactivated_at` sí la protege un CHECK (`profiles_deactivation_coherent`, un `23514`), pero **la coherencia entre `profiles` y el ban de GoTrue no la protege nada**: son dos sistemas distintos y no hay constraint que los ate. Es el bug silencioso donde la lista dice `Activo` y la persona no puede entrar.

Contra eso hay dos defensas, y las dos son tests, no estructura:

1. **Integración:** un test reactiva **solo** `profiles.is_active = true` y `deactivated_at = null`, comprueba que el perfil dice `is_active: true`, y después exige que `signInWithPassword` **siga fallando** con `user_banned`. Es la trampa medida y anclada.
2. **E2E:** el test de reactivación no se conforma con que la fila diga `Activo`. Abre un contexto de navegador nuevo y hace un **login real**. El señuelo E (nunca levantar el ban) lo pone rojo justo ahí: la fila decía `Activo`, esa aserción pasó, y el login se quedó colgado esperando `/mis-aseos`.

Es decir: la mitad olvidada es imposible **desde la action**, y si alguien la reintroduce por otra ruta hay dos tests que lo cazan. Lo que no hay es un constraint de base que lo haga imposible, y no lo puede haber: `auth.users.banned_until` y `public.profiles.is_active` viven en esquemas distintos y un trigger que los sincronizara sería una superficie nueva que este plan no está autorizado a abrir.

---

## 4. La corrección del research, confirmada y convertida en test

`research/ARCHITECTURE.md` y `02-CONTEXT.md` documentan la baja como `auth.admin.signOut(id, 'global')`. El research de la fase midió que esa firma no existe. Este plan lo confirmó en las dos direcciones:

- **En el paquete instalado:** `GoTrueAdminApi.signOut(jwt: string, scope?: SignOutScope)`. El primer argumento es un JWT, no un uid.
- **En ejecución:** hay un test que llama a `admin.auth.admin.signOut(uid, 'global')`, exige que devuelva error **y además comprueba que el token del aseador sigue sirviendo** (más de 0 filas). Construir la baja sobre esa llamada dejaría el acceso intacto.

Ese test es la razón por la que la corrección no se queda en un comentario que alguien pueda borrar. Si Supabase añadiera algún día una sobrecarga por uid, el test se pone rojo y sabremos que la nota del código dejó de ser cierta.

El otro hecho que quedó anclado es **por qué el middleware usa `getUser()` y no `getClaims()`**: con el mismo token baneado, `getUser()` da 403 `user_banned` y `getClaims()` responde OK con el `sub` correcto, porque verifica la firma en local y no le pregunta nada al servidor de Auth. El test lo deja escrito al revés de lo habitual: si algún día se pone rojo es una **buena** noticia, porque significaría que `getClaims()` empezó a comprobar la revocación.

---

## 5. Hallazgos del entorno que costaron tiempo

**Los 34 apartamentos gestionados de la semilla están inactivos.** Son placeholders sin tarifas ni responsable, y `props_active_requires_rates` no los deja activar. Dos consecuencias medidas:

- El sembrado del test de integración **no puede filtrar por `is_active`**: el primer intento lo hacía y falló con *"Cannot coerce the result to a single JSON object"*. No hace falta: `properties_cleaner_select` acota por `private.my_property_ids()`, que mira que el **aseo** sea gestionado, no que el apartamento esté activo.
- El **bloque ámbar no aparece nunca con datos de semilla**. El spec E2E tiene que activar un apartamento a mano (poniéndole `tarifa_huesped`, `pago_aseador` y responsable) para ejercer su caso positivo, y lo deja como estaba en el `afterAll`.

**Ser responsable de un apartamento no da acceso de lectura.** La policy del aseador pasa por `my_property_ids()`, que exige un **aseo vivo** (`pendiente`/`en_curso`, gestionado, entre hoy−1 y hoy+7). El test de integración siembra ese aseo, y por eso el CONTROL tiene sentido. El `afterAll` borra el aseo **antes** que al usuario: `cleanings.aseador_id` es `on delete restrict` y con el aseo en pie el borrado del usuario falla, dejando basura en un stack local que es compartido entre worktrees.

**Los tipos generados no ven los triggers `BEFORE INSERT`.** `supabase gen types` sale del DDL, así que marca `hora_limite` e `is_managed` como obligatorias en el `Insert` de `cleanings` aunque `tg_cleanings_snapshot()` las rellene. Pasarlas a mano sería inventar el snapshot que el trigger existe para calcular, y la migración 04 dice literalmente que nacen sin default para que un fallo del trigger no se vuelva un verde accidental. Se resolvió con `satisfies Partial<Insert>` sobre el objeto y un `as Insert` en la llamada: las cuatro claves que sí se pasan siguen comprobadas, y el hueco queda acotado a esas dos.

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Regla 3 - Bloqueante] El worktree venía con la base equivocada**

- **Encontrado durante:** el arranque. `git merge-base` devolvía `2a35c53`, o sea que el worktree estaba **detrás** del commit base del plan y no traía ninguno de los planes 02-01 a 02-08.
- **Arreglo:** el `git reset --hard` que el propio chequeo de arranque contempla, con el árbol limpio. Es la segunda vez consecutiva (también le pasó al 02-08).
- **Archivos versionados:** ninguno.

**2. [Regla 1 - Bug] El sembrado del test filtraba por `is_active` y no encontraba nada**

- **Encontrado durante:** Tarea 3, primera corrida. Detalle completo arriba.
- **Archivos:** `lib/auth/revocacion.integration.test.ts`. **Commit:** `e62ea94`.

**3. [Regla 3 - Bloqueante] `tsc` rechazaba el insert de `cleanings`**

- **Encontrado durante:** Tarea 3. Los tests de integración pasaban en ejecución y el compilador exigía `hora_limite` e `is_managed`. Detalle completo arriba.
- **Archivos:** `lib/auth/revocacion.integration.test.ts`. **Commit:** `e62ea94`.

### Añadidos deliberados sobre el plan

**4. [Regla 2 - Funcionalidad crítica ausente] El update lleva `.eq('role', 'aseador')`**

El registro de amenazas dispone **T-02-46** (*admin que se desactiva a sí mismo*) como `accept`, con el argumento de que el menú solo se renderiza en filas de aseador. El argumento es correcto para la pantalla y no lo es para la action: una Server Action es un endpoint HTTP público y el `uid` es un parámetro.

Lo que cambió la disposición es el **coste de la recuperación**. Hay **un solo admin** en el sistema. Un admin que se banease a sí mismo dejaría el producto sin ninguna forma de reactivar a nadie desde la aplicación: haría falta entrar a la base a mano. El filtro cuesta una línea, convierte ese escenario en 0 filas afectadas **antes** de tocar GoTrue, y la función devuelve `No se encontró el registro solicitado.` sin haber baneado nada. **T-02-46 sube de `accept` a `mitigate`.**

**5. [Regla 2] La aserción de CONTROL antes de la baja**

El plan pide cinco aserciones y ninguna es previa a la baja. Sin una previa, "0 filas después" es un verde que también da un aseador sin acceso a nada. El señuelo C lo midió: quitando el sembrado, la aserción central del plan siguió **verde** y solo el CONTROL se cayó. Es el hallazgo del 02-07 sobre el doble permisivo, en otra forma.

**6. [Regla 2] Tests de más sobre lo que el plan pedía**

- `revocacion.integration.test.ts` lleva **13** y no 6: los dos de CONTROL, el de `signOut(uid,…)` ejecutable, el `23514` de la columna olvidada, el de `room_types` (que la revocación alcanza a **todas** sus policies y no solo a `properties`), y el de que **sí** sigue viendo su propio perfil, que es lo que permite que la UI le explique por qué no ve nada.
- `aseadores-baja.spec.ts` lleva **4** y no 3: se separó el caso negativo del bloque ámbar (sin apartamentos activos, **no** aparece) del positivo, porque un test que solo comprobara su presencia pasaría igual con un bloque que se pinta siempre.

**7. [Regla 2] `lib/domain/plural.ts` con su test unitario**

`TablaAseadores` tenía la concordancia de número como función privada, y el diálogo de §11.3 necesita la misma regla. Dos copias de una regla de copy es como se arregla el "1 apartamentos" en una sola de las dos pantallas. Se extrajo a `lib/domain/` con 3 casos, incluido el cero (que se muestra, no se deja en blanco).

### Desviaciones menores del texto del plan

**8. El ítem `Desactivar` no lleva separador arriba**

El plan y UI-SPEC §7.3 lo piden. En §7.3 tiene sentido porque hay `Editar` y `Conectar calendario` encima. En el menú del aseador no hay **ningún** ítem por encima (el `Editar` de aseador no está en el alcance de la fase), y un separador como primer hijo pinta una raya suelta contra el borde del popup. Se respeta la intención —despegar lo destructivo de lo que no lo es— y el separador entra cuando exista algo de lo que separarlo. Queda escrito en el archivo.

**9. El bloque ámbar muestra el conteo de ACTIVOS, no el total**

UI-SPEC §11.3 dibuja `Esos 12 apartamentos` justo debajo de `Es responsable de 12 apartamentos`, con el mismo número, pero su propia regla dice que el bloque solo aparece si hay al menos un apartamento **activo**. Los dos números solo coinciden cuando todos lo están. Se usa el de activos: un apartamento inactivo no genera aseos, así que no "queda sin responsable" en ningún sentido que le importe al admin, y contarlo inflaría el daño en la única pantalla donde el daño tiene que ser exacto. El test E2E fija el caso: 3 responsable, 1 activo, el bloque dice **1**.

**10. El diálogo tiene estado de carga y estado de error**

El plan pide el estado de carga. Se añadió también el de error: si `consecuenciasDeBaja` falla, el diálogo **no** cae a "0 apartamentos". Un diálogo que dice "esto no afecta a nadie" cuando lo que pasó es que la consulta falló haría que el admin desactivara creyendo que no rompe nada.

---

## Threat Model: dispositions aplicadas

| Threat ID | Disposición | Cómo quedó |
|---|---|---|
| T-02-41 | mitigate | Las dos capas en una sola función. Anclado por la aserción central de integración (mismo token guardado antes de la baja ⇒ `[]`) y por el rebote a `/login` de la pestaña ya abierta en Playwright. Los señuelos B y D ponen en rojo una capa cada uno |
| T-02-42 | mitigate | `fijarActivacionAseador(uid, true)` hace las tres cosas: `is_active`, `deactivated_at` y `ban_duration: 'none'`. El test de integración prueba las dos mitades por separado y el E2E exige un **login real**, no la etiqueta de la lista. Señuelo E: rojo |
| T-02-43 | mitigate | Las dos columnas se escriben siempre juntas. Hay un test que hace el update de una sola y exige `23514` con el nombre del constraint. `mapDbError` lo traduce a `Estado de activación incoherente.` |
| T-02-44 | mitigate | `exigirAdmin()` es lo primero de la función, **verificado por el guardarraíl 7** (señuelo A: rojo). Y la RLS de `profiles` sigue detrás |
| T-02-45 | mitigate | `profiles.deactivated_at` se escribe con `now()` en la baja. **Sin "Deshacer"** en el toast, por contrato: esconder la reactivación tras un undo falsearía el registro |
| T-02-46 | **mitigate** (era `accept`) | Subida de disposición. El `.eq('role','aseador')` del update corta el caso en 0 filas antes de tocar GoTrue. Razón en la desviación 4 |
| T-02-47 | mitigate | El ban invalida las sesiones anteriores y el re-signIn falla mientras está puesto: hay tres tests (`getUser`, `refreshSession`, `signInWithPassword`) que lo fijan sobre el mismo token |

## Threat Flags

Ninguna superficie de seguridad nueva fuera del registro. Este plan añade **dos** Server Actions, las dos con guard —una verificado por CI, la otra estructuralmente imposible de dejar sin guard porque el cliente lo devuelve el propio guard— y **cero** endpoints de API, rutas de auth o cambios de schema.

## Known Stubs

**Ninguno.** El menú `⋯` que el plan 02-07 dejó montado y vacío queda cableado aquí, así que ese stub se cierra. La lista de aseadores no tiene ya ningún control sin handler: `Crear aseador` lo cerró el 02-08 y el menú lo cierra este plan.

## Notas para los planes siguientes

- **02-10 y 02-14 (las demás actions con `service_role`), y sobre todo 02-10 que escribe en ESTE mismo `_actions.ts`:**
  - El archivo tiene ya **cuatro** exportaciones: `generarPassword`, `crearAseador`, `consecuenciasDeBaja` y `fijarActivacionAseador`. El guardarraíl 7 recorre **función a función**, así que añadir una quinta sin guard se atrapa aunque las cuatro anteriores lo tengan. Está medido en este plan, no supuesto.
  - El `awk` del guardarraíl solo reconoce `function` de **nivel superior**. Si tu action necesita otra forma (una función flecha, por ejemplo), **amplía el guardarraíl, no lo esquives**: una action sin guard con la fábrica administrativa detrás es el agujero más caro de la fase.
  - El orden es obligatorio y no estilístico: `exigirAdmin()` → validación → `createAdminClient()`. Invertir 1 y 3 lo atrapa el guardarraíl; invertir 2 y 3 no lo atrapa nadie.
  - Si tu action solo **lee** con el JWT del usuario, no construyas la fábrica administrativa: `consecuenciasDeBaja` toma el cliente que devuelve `exigirAdmin()`. Saltarse la RLS para leer lo que el llamador ya puede leer es privilegio gratis.
  - `ResultadoAccion` de `lib/domain/acciones.ts` es la forma de retorno de toda action de la fase. Con `campo` el error va inline; sin `campo`, a toast.
- **Cualquier plan que escriba sobre `profiles`:** `is_active` y `deactivated_at` se mueven **juntos** o da `23514`. Y si además cambia la activación de una cuenta, tiene que mover el `ban_duration` de GoTrue en la misma operación: nada en la base ata esos dos sistemas.
- **Cualquier spec E2E que banee, desactive o cierre sesión:** usa **cuenta propia**, creada en el `beforeAll` y borrada en el `afterAll`. El ban mata el `storageState` compartido del rol igual que el `signOut()` global que documentó el 02-07, y el síntoma aparece en otro archivo.
- **Cualquier test que necesite que un aseador LEA algo:** ser responsable de un apartamento **no basta**. Hay que sembrarle un aseo vivo, porque `my_property_ids()` sale de `cleanings`. Y el aseo se borra **antes** que el usuario (`on delete restrict`).
- **02-11 (tabla de 39 apartamentos):** los 34 gestionados de la semilla están **inactivos** y no se pueden activar sin tarifas ni responsable. Si tu spec necesita apartamentos activos, tiene que fabricarlos y devolverlos a su estado. Sigue en pie la deuda del `sticky` del encabezado dentro del `overflow-x-auto`.
- **`lib/domain/plural.ts`** es donde vive `apartamentos(n)`. Si otra pantalla necesita la misma concordancia, se importa; no se vuelve a escribir.
- **Bloqueante residual heredado de 02-01, 02-04, 02-05, 02-06, 02-07 y 02-08:** sigue pendiente un `npx supabase stop && npx supabase start` al cierre de la fase para confirmar en frío que el `config.toml` commiteado reproduce el entorno.
- **El stack local quedó limpio.** Se verificó al terminar: 0 perfiles, 0 usuarios en auth, 0 aseos, 0 apartamentos activos y 0 asignaciones. Ninguna de las siembras de este plan sobrevive.

## Self-Check: PASSED

Los 8 archivos que este resumen declara creados o modificados existen en disco, y los 3 hashes de commit (`35c50a2`, `7e62b1c`, `e62ea94`) resuelven a objetos de tipo `commit` en el historial de la rama. Ni `STATE.md` ni `ROADMAP.md` aparecen en el diff del plan.
