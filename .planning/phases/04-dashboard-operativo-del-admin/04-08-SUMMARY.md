---
phase: 04-dashboard-operativo-del-admin
plan: 08
subsystem: api
tags: [server-actions, zod, supabase, rls, authz, postgrest, next15]

requires:
  - phase: 04-05
    provides: las seis RPC SECURITY DEFINER del admin, con private.is_admin() por dentro
  - phase: 04-03
    provides: mapDbError, campoDeConstraint con la entrada 'fecha' del indice de ASEO-07, formatFechaBog, hoyBog
  - phase: 02
    provides: exigirAdmin/NoAutorizado y el patron de Server Action de aseadores/_actions.ts
provides:
  - Las nueve Server Actions de /operacion, con el orden guard -> validacion -> RPC
  - El contrato de claves de FormData que van a copiar los dialogos de 04-10, 04-11 y 04-13
  - El mensaje interpolado de ASEO-07 con campo 'fecha', listo para pintarse inline
  - La disciplina de una sola columna sobre notifications, probada contra Postgres real
  - mapDbError leyendo el hint en P0001, que es donde los RPC de este proyecto ponen el español
affects: [04-10, 04-11, 04-13, 04-14, fase-05-notificaciones]

tech-stack:
  added: []
  patterns:
    - "Guard, validacion y base en ese orden, con el orden explicado en la cabecera del archivo"
    - "El nombre del apartamento viaja en el FormData solo para el copy: mapDbError sigue siendo puro"
    - "Un UPDATE de una sola columna sobre una tabla con grant de tabla es disciplina de la action, no de la base"
    - "Sustituir lib/supabase/server en el test de integracion (no el guard) para probar una Server Action con un JWT real"

key-files:
  created:
    - "app/(admin)/operacion/_actions.ts"
    - "app/(admin)/operacion/_actions.test.ts"
    - "lib/domain/aseos-actions.integration.test.ts"
  modified:
    - "lib/domain/errors.ts"
    - "lib/domain/errors.test.ts"

key-decisions:
  - "El texto en español de un P0001 viaja en el hint, no en el message: medido contra PostgREST, y mapDbError se corrigio para leerlo"
  - "sin_responsable es el unico P0001 con copy propio en la action, porque su hint nombra la columna responsable_id y el contrato de pantalla fija otro texto"
  - "Un update de notifications que afecta a cero filas se devuelve como error, no como exito: el panel de 04-13 usa estado optimista"
  - "Sin nombre de apartamento, el 23505 de ASEO-07 pierde la interpolacion pero conserva campo 'fecha', asi que sigue yendo inline"

patterns-established:
  - "guard(): helper que devuelve el contexto o el ResultadoAccion de rechazo, y relanza todo lo que no sea NoAutorizado"
  - "Claves de FormData: aseo_id, aseador_id, aseador_nombre, apartamento_id, apartamento_nombre, fecha, tipo, huespedes, instrucciones"

requirements-completed: [ASEO-02, ASEO-03, ASEO-04, ASEO-05, ASEO-06, ASEO-07, ASEO-08, ASEO-09, DASH-04]

duration: 47min
completed: 2026-09-06
---

# Phase 4 Plan 08: Server Actions de la pantalla de operación Summary

**Las nueve Server Actions de `/operacion` con el orden guard → validación → RPC, el error de ASEO-07 interpolado y anclado al campo `fecha`, y la corrección de `mapDbError` que dejaba escapar el token de máquina de un `P0001` a la pantalla.**

## Performance

- **Duration:** 47 min
- **Started:** 2026-09-06T13:15:00Z
- **Completed:** 2026-09-06T14:02:00Z
- **Tasks:** 3
- **Files modified:** 5 (3 creados, 2 modificados)

## Accomplishments

- **Nueve Server Actions, no ocho.** Las siete de mutación de aseo (`confirmarAseo`, `reasignarAseo`, `crearAseoManual`, `reprogramarAseo`, `cerrarAseo`, `cancelarAseo`, `limpiarMarcaDeRevision`) más las dos del panel de alertas (`marcarAlertaAtendida`, `devolverAlertaAlPanel`). El plan listaba ocho en `artifacts.exports` y describía la novena en el comportamiento de la Task 2.
- **El orden de las tres primeras operaciones está escrito en la cabecera con las mismas palabras que fijó la Fase 2**, y hay un test que lo mide por lo que **no** pasa: con un guard que rechaza, `rpc` y `from` no se llaman ni una vez.
- **Ninguna importa la fábrica administrativa.** `npm run ci:arch` sigue en `check-service-role: OK`, y además hay una aserción unitaria que lee el propio archivo, filtra los comentarios con el mismo criterio del guardarraíl 5, y afirma la ausencia del import en el código.
- **ASEO-07 llega legible.** `crearAseoManual` y `reprogramarAseo` detectan el `23505` del índice parcial antes de delegar y devuelven `Ya hay un aseo activo para {apartamento} el {fecha}. …` con `campo: 'fecha'`. Probado dos veces: con dobles en unitario y contra el índice real en integración.
- **La disciplina de una sola columna sobre `notifications`, medida en la base.** El test de integración lee `title`, `body`, `url`, `payload`, `recipient_id`, `type` y `created_at` antes y después y los compara; solo `read_at` se mueve.
- **Señuelo declarado corrido y rojo.** Con `exigirSesion()` en lugar de `exigirAdmin()`, tres tests de integración se pusieron rojos y el mensaje que llegaba a la UI pasó a ser el de `mapDbError` en vez del del guard. Detalle abajo.

## Task Commits

1. **Task 1 (RED): las nueve actions, en rojo** — `78e6e1f` (test)
2. **Tasks 1 y 2 (GREEN): implementación + corrección de `mapDbError`** — `6debf2d` (feat)
3. **Task 3: contrato de autorización contra Postgres real** — `1c56175` (test)

**Nota sobre la granularidad:** las Tasks 1 y 2 comparten un único artefacto (`_actions.ts`) y se entregaron en un solo commit `feat`. Partirlo habría exigido escribir el archivo dos veces para producir dos commits que tocan el mismo fichero; se prefirió un commit honesto a dos fabricados. El ciclo TDD sí quedó separado: `test` rojo → `feat` verde.

## Files Created/Modified

- `app/(admin)/operacion/_actions.ts` (**creado**, 512 líneas) — las nueve actions, el helper `guard()`, los esquemas de zod y el bloque de copy con su prohibición de producto.
- `app/(admin)/operacion/_actions.test.ts` (**creado**, 40 tests) — orden de operaciones, validación, copy literal, ASEO-07, traducción de errores y la disciplina de una sola columna.
- `lib/domain/aseos-actions.integration.test.ts` (**creado**, 10 tests) — el contrato de autorización contra Postgres real.
- `lib/domain/errors.ts` (**modificado**) — `DbErrorLike` gana `hint`; la rama `P0001` prefiere el `hint` sobre el `message`.
- `lib/domain/errors.test.ts` (**modificado**, +4 tests) — el `hint` manda en `P0001`, y **no** se usa fuera de `P0001`.

## Decisions Made

1. **El `hint` es donde vive el español de un `P0001`, y `mapDbError` lo lee.** Ver la desviación 1: es un hallazgo medido, no una preferencia.
2. **`sin_responsable` tiene copy propio en la action.** Su `hint` dice `El apartamento no tiene responsable_id. Asignale uno antes de confirmar el aseo.` — lenguaje de schema. UI-SPEC §18.1 fija `Este apartamento no tiene responsable. Asígnalo antes de confirmar.` La tabla `COPY_POR_TOKEN` tiene **una sola entrada** a propósito: no es un mapa paralelo al de la base, es la excepción donde los dos contratos difieren.
3. **Cero filas afectadas en `notifications` es un error, no un éxito silencioso.** La policy `notifications_own_update` deja fuera la fila ajena sin levantar error de Postgres. Devolver `ok: true` dejaría al panel de 04-13 con su estado optimista aplicado sobre algo que nunca se escribió. Medido en el test de la notificación de otro destinatario.
4. **Las claves del `FormData` son contrato** y están en la cabecera del archivo para que 04-10, 04-11 y 04-13 las copien en vez de adivinarlas: `aseo_id`, `aseador_id`, `aseador_nombre`, `apartamento_id`, `apartamento_nombre`, `fecha`, `tipo`, `huespedes`, `instrucciones`. Los dos `*_nombre` **no viajan a la base**: solo alimentan el copy.
5. **`confirmarAseo` devuelve `Aseo confirmado.`** El UI-SPEC solo fija el copy de la tanda (`Listo: 15 aseos confirmados.`), que es de 04-10. La action individual necesitaba un mensaje y este no dice ni sugiere que se avisó a nadie.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Un `P0001` pintaba el token de máquina en la cara del admin**

- **Found during:** Task 1
- **Issue:** El plan y el 04-05-SUMMARY dan por hecho que `mapDbError()` traduce los `P0001` de las RPC del admin. No lo hacía. Las RPC de la migración 15 levantan `raise exception 'aseo_no_cerrable' using errcode = 'P0001', hint = '…'`: el token va en el **message** y el español va en el **hint**. `mapDbError` leía `message`. Medido contra PostgREST el 2026-09-06 con un admin real y `close_cleaning` sobre un uuid inexistente:

  ```json
  { "code": "P0001", "details": null,
    "hint": "El aseo no existe, es de gestión externa, o ya está cerrado o cancelado.",
    "message": "aseo_no_cerrable" }
  ```

  Es decir: la pantalla habría mostrado `aseo_no_cerrable`. Rompía el `must_have` "un mensaje en español, no un código de Postgres" y el criterio de éxito de mensajes legibles. Afecta a las **siete** RPC, no solo a una.
- **Fix:** `DbErrorLike` gana `hint?: string`. La rama `P0001` de `mapDbError` devuelve el primer candidato con texto entre `hint` y `message`, y cae al genérico si ninguno lo tiene. El `hint` **no** se usa en ninguna otra rama, y hay un test que lo afirma con un `42501` cuyo hint diría `GRANT SELECT ON public.property_secrets …`: filtrarlo sería justo el oráculo que la asimetría de códigos existe para cerrar.
- **Files modified:** `lib/domain/errors.ts`, `lib/domain/errors.test.ts`
- **Verification:** 4 tests unitarios nuevos + el test de integración `cerrarAseo sobre un aseo ya terminado devuelve el hint en español, no el token`. El test que ya existía (`propaga el mensaje de negocio … P0001`) sigue verde sin tocarlo: sin `hint`, el `message` manda.
- **Committed in:** `6debf2d`

**2. [Rule 2 - Funcionalidad crítica ausente] Cero filas afectadas se devolvía como éxito**

- **Found during:** Task 2
- **Issue:** El plan describe el `UPDATE` directo sobre `notifications` y confía la acotación a la policy, que es correcto. Pero un `update` que no casa ninguna fila **no levanta error en PostgREST**: devuelve `error: null`. Sin comprobación, `marcarAlertaAtendida` sobre la alerta de otro destinatario habría devuelto `{ ok: true }`.
- **Fix:** `.select('id')` sobre el update y `data.length === 0` → `{ ok: false, error: 'No se encontró el registro solicitado.' }`.
- **Files modified:** `app/(admin)/operacion/_actions.ts`
- **Verification:** un test unitario (`cero filas afectadas es un error, no un exito silencioso`) y el de integración de la notificación ajena.
- **Committed in:** `6debf2d`

### Divergencias menores de interpretación, declaradas

**A. El `23505` sin nombre de apartamento va inline, no a toast.** El texto del plan dice *"si no viene, cae al genérico y va a toast"*, pero también dice *"delega en `mapDbError()` y `campoDeConstraint()`"*, y `campoDeConstraint()` mapea `cleanings_one_active_per_property_date` a `'fecha'` desde el plan 04-03. Se siguió la instrucción de código: el mensaje pierde la interpolación, **no** el sitio donde se pinta. Es lo correcto de todas formas — un error de fecha corregible sin cerrar el diálogo — y está anotado en el comentario de `errorDeAseoDuplicado`. Hay un test que lo fija.

**B. La aserción "ninguna usa el cliente de servicio" filtra comentarios antes de buscar.** La primera versión buscaba la cadena `supabase/admin` en el archivo entero y se ponía roja por la **cabecera que explica por qué no se usa**. Se cambió a filtrar comentarios con el mismo criterio (`^\s*(//|/\*|\*)`) que usa el guardarraíl 5 de `check-service-role.sh`: una prohibición explicada no es una violación. Lo que se prohíbe es el código.

**C. `p_instrucciones: null` va con un cast documentado.** `supabase gen types` deriva los argumentos de función de `pg_proc`, donde la nulabilidad de un parámetro no se puede expresar: todo `text` sale tipado `string`. Mandar `''` en vez de `null` guardaría una cadena vacía donde el resto del sistema espera ausencia de dato. El cast lleva el párrafo que lo justifica encima.

---

**Total deviations:** 2 auto-corregidas (1 × Rule 1, 1 × Rule 2) + 3 divergencias menores declaradas.
**Impact on plan:** Las dos correcciones eran necesarias para cumplir los `must_haves` que el propio plan escribió. Cero paquetes instalados, cero migraciones, cero cambios de schema. Sin scope creep.

## El señuelo declarado, corrido

`guard()` se cambió a `exigirSesion()` en lugar de `exigirAdmin()` — literalmente "quitar `exigirAdmin()`" — y se corrió la suite de integración. **Tres tests rojos**, y lo que enseñan es el punto entero del archivo:

```
× las siete de mutación de aseo: mensaje del guard y fila intacta
    Expected: "No tienes permiso para esta operacion."      ← el guard
    Received: "No tienes permiso para esta operación."      ← mapDbError('42501')
× crearAseoManual: rechaza y no deja ningún aseo nuevo       (mismo par de textos)
× marcarAlertaAtendida: rechaza y la alerta sigue sin atender
    Expected: "No tienes permiso para esta operacion."
    Received: "No se encontró el registro solicitado."
```

Dos lecturas, y la segunda no estaba prevista:

1. **En las siete rutas de RPC, el sistema sigue siendo seguro sin el guard**: la frontera es `private.is_admin()` dentro de cada función y el aseador se estrella igual. Lo que se pierde es fallar temprano y el texto correcto. Eso es exactamente lo que "defensa en profundidad" significa, y ahora está medido en vez de afirmado.
2. **En la ruta de `notifications` NO hay segunda capa equivalente.** Sin guard, un aseador llega al `UPDATE`, la policy lo deja en cero filas, y el mensaje que sale es `No se encontró el registro solicitado.` — un texto sobre existencia de recursos donde debería haber uno sobre permisos. La fila ajena sigue intacta (la policy hace su trabajo), pero el mensaje cambia de naturaleza. Es la ruta donde el guard aporta más, y por eso las dos actions del panel lo llevan igual que las siete.

El archivo se restauró byte a byte (`git diff --stat` vacío) y la suite volvió a 10 verdes antes de commitear.

## Issues Encountered

- **`npx tsx` sobre el scratchpad no resuelve `@supabase/supabase-js`.** El script de sondeo tuvo que ejecutarse desde la raíz del repo (`./probe.scratch.mts`, borrado después) para que el resolutor encontrara `node_modules`. Anotado por si otro plan necesita un sondeo rápido contra la base.
- **Ningún problema de iCloud esta vez.** `tsc` en frío tardó ~1 min y con caché calientes segundos; `db:test` 1 s, integración completa 11,6 s, `next build` sin incidencias. No aparecieron duplicados con sufijo numérico en `.next/types/`.

## Verificación final

| Comando | Resultado | Baseline previa |
|---|---|---|
| `npm run test:unit` | **29 archivos / 548 tests, verde** | 28 / 504 |
| `npm run test:integration` | **15 archivos / 138 tests, verde** | 14 / 128 |
| `npm run db:test` | `Files=7, Tests=153, Result: PASS` | idéntica |
| `npm run ci:arch` | `check-service-role: OK` | idéntica |
| `npx tsc --noEmit` | sin errores | idéntica |
| `npm run build` | pasa, `/operacion` 7.16 kB / 125 kB First Load | — |

Ninguna baseline bajó.

## Known Stubs

Ninguno. Las nueve actions invocan RPC o tablas reales y devuelven datos reales; no hay valor vacío cableado ni placeholder.

## Threat Flags

Ninguna superficie de seguridad nueva fuera del `<threat_model>` del plan. Las nueve actions son endpoints HTTP nuevos, pero están **dentro** del registro (T-04-01 a T-04-05, T-04-08, T-04-09) y con `exigirAdmin()` aplicado. No se añadió ninguna ruta de red, ningún acceso a fichero, ningún cambio de schema y ningún grant.

Una nota que no es un flag pero conviene que quede escrita: `mapDbError` ahora puede devolver el `hint` de Postgres cuando el código es `P0001`. Ese `hint` lo escriben **exclusivamente** las migraciones de este repo, en español, y solo para esa rama. Si algún día una función de una extensión de terceros levantara un `P0001` con un `hint` que nombre objetos internos, ese texto llegaría a la UI. El riesgo es idéntico al que ya tenía la rama con `message` y está acotado a un errcode que solo usan las funciones propias.

## Next Phase Readiness

Listo para la wave 6 y las que siguen:

- **04-10** (bandeja + `Sheet` de confirmación): `confirmarAseo(prev, formData)` con `aseo_id`, `huespedes`, `instrucciones`; y `crearAseoManual` con su error de ASEO-07 ya interpolado.
- **04-11** (`MenuAseo` y los cinco diálogos): las cinco actions con la firma `(prev, formData)` que el plan anunciaba, y las precondiciones de las RPC intactas.
- **04-13** (panel de alertas): `marcarAlertaAtendida(id)` y `devolverAlertaAlPanel(id)`, las dos con `ResultadoAccion`. **Ojo con el estado optimista:** las dos devuelven `ok: false` cuando el `UPDATE` afecta a cero filas, así que la fila tiene que volver al panel en ese caso y no solo ante un `error` de Postgres.
- **Fase 5** (notificaciones): la costura sigue exactamente donde estaba. `confirm_cleaning` y `reassign_cleaning` escriben la fila en `notifications` y **nadie la drena**. Ningún copy de esta fase dice ni sugiere lo contrario, y hay un test que recorre los siete mensajes de éxito buscando `notific|avis|le lleg|push|se le mand`.

Sin bloqueos.

---
*Phase: 04-dashboard-operativo-del-admin*
*Completed: 2026-09-06*

## Self-Check: PASSED

Verificado el 2026-09-06 con el árbol en su estado final:

- `app/(admin)/operacion/_actions.ts` — existe, 512 líneas (mínimo del plan: 220)
- `app/(admin)/operacion/_actions.test.ts` — existe
- `lib/domain/aseos-actions.integration.test.ts` — existe
- Commits `78e6e1f`, `6debf2d`, `1c56175` — los tres presentes en el historial
- Los nueve símbolos del contrato (`confirmarAseo`, `reasignarAseo`, `crearAseoManual`, `reprogramarAseo`, `cerrarAseo`, `cancelarAseo`, `limpiarMarcaDeRevision`, `marcarAlertaAtendida`, `devolverAlertaAlPanel`) están exportados y consumidos por las dos suites
