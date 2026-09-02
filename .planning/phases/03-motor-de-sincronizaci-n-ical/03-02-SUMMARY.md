---
phase: 03-motor-de-sincronizaci-n-ical
plan: 02
subsystem: domain
tags: [ical, parser, privacidad, clasificacion, fail-closed, fechas, sin-dependencias]

requires:
  - phase: 02-acceso-y-administraci-n-del-cat-logo
    provides: "ical-preview.ts con desdoblar() probado contra el feed real, y las fixtures .ics originales"
  - phase: 03-motor-de-sincronizaci-n-ical
    provides: "plan 03-01: guardarraíles 9 y 10 de CI, y las nueve fixtures derivadas y sintéticas"
provides:
  - "lib/domain/ical.ts: parser puro sin dependencias, lista posicional de eventos, pila de componentes, rechazo de DATE-TIME y señal de documento incompleto"
  - "lib/domain/ical-clasificar.ts: clasificación de tres valores con whitelist positiva; desconocido no genera aseo"
  - "lib/domain/ical-normalizar.ts: EventoNormalizado sin ranura para la descripción, y el payloadHash sobre campos normalizados"
  - "desdoblar() vive en un solo sitio: ical-preview.ts lo importa en vez de tener su propia copia"
affects: [03-03, 03-04, 03-05, 03-06, 03-07, 03-08, 03-09, 03-10]

tech-stack:
  added: []
  patterns:
    - "Cero objetos de fecha en el camino que produce la fecha del aseo: corte de cadena y comparación lexicográfica"
    - "El tipo de salida como frontera de privacidad: no hay ranura donde poner el dato personal"
    - "Aserción de ausencia SIEMPRE con control positivo en el mismo test"
    - "Toda aserción sobre texto .ics se hace sobre el texto desdoblado, con control positivo que distinga el archivo real del mutilado"
    - "Señuelo con doble red: el mismo defecto lo atrapan un test y un guardarraíl de CI independientes"

key-files:
  created:
    - lib/domain/ical.ts
    - lib/domain/ical.test.ts
    - lib/domain/ical-clasificar.ts
    - lib/domain/ical-clasificar.test.ts
    - lib/domain/ical-normalizar.ts
    - lib/domain/ical-normalizar.test.ts
  modified:
    - lib/domain/ical-preview.ts

key-decisions:
  - "NO se instala node-ical: la medición del research manda sobre research/STACK.md, y la medición está pegada en el encabezado de lib/domain/ical.ts"
  - "startsOn y endsOn son nulables: un evento no interpretable SIGUE saliendo del normalizador para que el pipeline pueda alertar, en vez de desaparecer en silencio"
  - "El defecto de forma gana sobre la URL de reserva: un DTEND con hora clasifica desconocido aunque traiga el código"
  - "La aserción de privacidad sobre los dígitos pelados excluye los campos hexadecimales: la receta del research es ROJO PERMANENTE contra la fixture real"
  - "El octavo VEVENT de un cuerpo truncado NO se emite a medias: se emiten 7 eventos y el documento se marca incompleto"

requirements-completed: [SYNC-02, SYNC-03]

duration: 32min
completed: 2026-09-02
---

# Fase 3 Plan 02: El dominio puro del iCal — Resumen

**El feed real entra por un lado y salen 15 `EventoNormalizado` con las 15 fechas de checkout exactas, sin una sola traza del teléfono del huésped, con el mismo resultado bajo LF y bajo CRLF y bajo cualquier zona horaria, y sin una sola dependencia npm nueva.**

## Performance

- **Duración:** 32 min
- **Tareas:** 3 de 3
- **Archivos creados:** 6
- **Archivos modificados:** 1
- **Tests nuevos:** 57 (27 + 17 + 13). La suite pasa de 295 a **352**.

## Commits por tarea

| Tarea | Gate | Commit | Mensaje |
|---|---|---|---|
| 1 | RED | `6c9306d` | `test(03-02)`: `ical.test.ts`, los ocho comportamientos del parser |
| 1 | GREEN | `55f02c4` | `feat(03-02)`: `lib/domain/ical.ts` + `ical-preview.ts` importando `desdoblar` |
| 2 | RED | `7aa765e` | `test(03-02)`: `ical-clasificar.test.ts`, los siete comportamientos |
| 2 | GREEN | `e577ed5` | `feat(03-02)`: `ical-clasificar.ts`, tres valores y falla cerrada |
| 3 | RED | `ebdb211` | `test(03-02)`: `ical-normalizar.test.ts`, `endsOn` exacto y privacidad |
| 3 | GREEN | `094de03` | `feat(03-02)`: `ical-normalizar.ts`, el tipo sin ranura |

Sin fase REFACTOR: no hizo falta.

## Los señuelos, uno por uno

El plan pedía cinco. Se corrieron **seis**, cada uno aplicado al código real, medido, y revertido.

| # | Señuelo | Esperado | Medido | Qué lo atrapó |
|---|---|---|---|---|
| 1 | Borrar `replace(/\r\n/g,'\n')` de `desdoblar` | ROJO | **ROJO, 5 tests** | 4 unitarios de `desdoblar` **y** la igualdad completa del documento entre `airbnb-real-crlf.ics` y el feed con LF |
| 2 | Invertir las dos ramas del clasificador (`SUMMARY` antes que `DESCRIPTION`) | **NO se atrapa** | **1 test, y NINGUNO sobre fixture** | Ver abajo: es la debilidad declarada de la fase |
| 3 | Restarle un día al `DTEND` (con el tipo temporal de por medio) | ROJO | **ROJO, 4 tests + guardarraíl 10** | Las 15 fechas una a una, el caso de una noche, el hash de la reserva movida y la invariancia de zona; **y además `npm run ci:arch` en rojo** |
| 4 | Añadir un campo `description` a `EventoNormalizado` y rellenarlo | ROJO | **ROJO, 2 tests** | La aserción sobre el patrón de la etiqueta del teléfono **y** la enumeración estructural de las claves del objeto |
| 5 | Indexar la salida del parser por `UID` (lo que hace `node-ical`) | ROJO | **ROJO, 1 test** | El test que afirma **2** entradas y no 1 |
| 6 | Recorrido plano, sin pila de componentes (extra, no pedido) | ROJO | **ROJO, 1 test** | El `DTSTART` del `VALARM` anidado envenenando la fecha del evento contenedor |

### El señuelo 2, que NO se atrapa, y por qué

**Medido:** invertir el orden de las dos ramas de `clasificar()` no pone en rojo **ni una sola aserción sobre una fixture**. Ni las 15 reservas del feed real, ni los 90 bloqueos, ni los 3 desconocidos, ni los 15 del descriptor mutilado se mueven. Lo único que cae es **un test sintético escrito a mano** para fijar la decisión (`URL de reserva Y SUMMARY de bloqueo a la vez: gana reserva`).

**Por qué:** en las muestras que existen los dos discriminadores están correlacionados al **100%**. No hay ni un evento que traiga a la vez la URL de detalle y un resumen de no disponibilidad, porque **no existe un solo bloqueo real del propietario en el repo**. `airbnb-bloqueos-1dia.ics` y `solo-bloqueos.ics` son sintéticas y derivadas de los mismos documentos que validarían: usarlas como evidencia es circular.

**Esto no lo cierra ningún test que se pueda escribir hoy.** Lo cierra el checkpoint humano del plan **03-10**, que captura un `.ics` real con fechas bloqueadas a mano. La medición y el razonamiento quedan escritos en el JSDoc de `clasificar()`, no solo aquí.

## Hallazgo: la receta de privacidad del research es rojo permanente

**El research §8 propone literalmente `for (const t of telefonos) expect(serializado).not.toContain(t)`. Se escribió tal cual y salió ROJO contra la fixture real, por una razón que no tiene nada que ver con privacidad.**

- El teléfono **`2781`** (evento 6) aparece dentro del **identificador hexadecimal anonimizado** de ese mismo evento: `a1b2c3d4e5f6-c183f327` **`8171`** `b7c6b97c4f91f23e5f20` — la corrida `f3278171` contiene `2781`.
- El `payloadHash` tiene el mismo problema por construcción: son 64 caracteres hexadecimales por evento, 15 eventos, 15 teléfonos. La coincidencia es esperable, no excepcional.

El research avisaba de la trampa (`1000` dentro de `120000`), pero identificó mal la fuente: no son las tarifas en pesos, son **los campos opacos de la propia salida**. Un test rojo por coincidencia acaba borrado por alguien con prisa, que es exactamente lo que el research quería evitar.

**Cómo quedó, y por qué sigue siendo una aserción fuerte:**

1. Sobre la **salida completa serializada**: ausencia del patrón de la etiqueta del teléfono, de `Last 4 Digits`, de `Reservation URL` y de la URL de hosting. Es lo que caería si la descripción se filtrara, porque viaja con su etiqueta pegada. **Señuelo 4 lo confirma.**
2. Sobre los **campos legibles** (`reservationCode`, `summary`, `startsOn`, `endsOn`, `clasificacion`): ausencia de los 15 dígitos, extraídos del propio archivo con su etiqueta delante.
3. Los dos campos opacos quedan cubiertos por otra vía y no por confianza: que el teléfono no entre en el hash lo mide el test de que **el `payloadHash` no cambia cuando solo cambia el teléfono**, y el identificador viene tal cual del feed sin pasar por la descripción.
4. **Enumeración estructural de las claves** del objeto de salida: un campo nuevo, se llame como se llame, cae ahí.
5. **Control positivo en el mismo test**: los 15 códigos SÍ están, y los 15 teléfonos extraídos son 15. Sin eso, un normalizador que devolviera `[]` pasaría todas las aserciones de ausencia.

## El control de fixtures que el plan 03-01 dejó apuntado

`ical-clasificar.test.ts` abre con el control que el plan 03-01 pidió, medido en las dos direcciones:

| Archivo | `reservations/details/` en crudo | tras desdoblar |
|---|---|---|
| `airbnb-real-anonimizado.ics` | **0** (el grep crudo miente) | **15** |
| `airbnb-desc-mutilado.ics` | **0** | **0** |

Sobre el texto crudo el feed real y el mutilado son **indistinguibles**, porque el plegado a 75 octetos parte la ruta en dos líneas. La aserción vive sobre el texto desdoblado y con control positivo, y está escrita como test para que no se pueda volver a olvidar.

## Decisiones tomadas

**1. `startsOn` y `endsOn` son nulables, y el evento no interpretable SIGUE saliendo.** El research los declara `string`. Si se mantuviera así, un evento con `DTEND;TZID=…:20260406T110000` solo podría descartarse en silencio o llevar una fecha adivinada, y las dos son inaceptables: la primera es el modo de fallo que descalificó a `node-ical`, la segunda es el que descalifica a los feeds "que sincronizan pero mal". Nulables, el evento sale, clasifica `desconocido`, el pipeline lo alerta, y el compilador obliga a quien lo consuma a decidir qué hacer con la fecha ausente. **El conjunto de campos del tipo no cambia**, que es lo que el plan fija.

**2. El defecto de forma gana sobre la URL de reserva.** `clasificar()` mira `interpretable` antes que nada. Un evento con hora y zona clasifica `desconocido` aunque traiga el código de reserva. Tiene su test **con control positivo**: el mismo evento sin el defecto sí clasifica `reserva`, así que la aserción no pasa por vacuidad.

**3. El octavo `VEVENT` del cuerpo truncado no se emite a medias.** `airbnb-truncado.ics` tiene 8 `BEGIN:VEVENT` y 7 `END:VEVENT`. `parsearIcs` devuelve **7** eventos y `completo: false`. Un evento a medias es peor que un evento ausente: el diff lo vería como una reserva con fechas incompletas. El test lleva el control de que el sniff de la Fase 2 sí lo deja pasar, que es la razón de existir de la señal.

**4. `desdoblar` se mueve a `ical.ts` y `ical-preview.ts` lo importa y lo reexporta.** El diff de `ical-preview.ts` son exactamente dos bloques: el import con su explicación, y el borrado de la función movida. **Su cabecera, su lógica y su superficie pública no cambian**, así que `ical-preview.test.ts` sigue pasando sin tocarlo. La divergencia deliberada del conteo se conserva; la del desdoblado sería un defecto y por eso es lo único compartido.

**5. Separador del material del hash: los dos primeros caracteres de control, construidos por código.** RFC 5545 §3.1 define el valor de una línea de contenido como texto **sin** caracteres de control salvo el tabulador, así que ninguno puede aparecer dentro de un campo y la concatenación queda libre de ambigüedad. La marca de nulo es un carácter **distinto** del separador para que un campo ausente y un campo vacío no colisionen. Se construyen con `String.fromCharCode` y no con una secuencia de escape literal para que el archivo fuente siga siendo texto puro: escribirla con las herramientas de este entorno metió bytes nulos de verdad en el fuente y `grep` pasó a tratarlo como binario (ver Desviaciones).

**6. Un `SUMMARY: Reserved` suelto NO basta para clasificar reserva.** Tiene test. Si Airbnb cambiara el formato de la descripción, un `Reserved` suelto seguiría generando aseos y el cambio pasaría inadvertido; además el resto del pipeline necesita el código de reserva para identificar. Fallar cerrado exige que el código esté.

## Desviaciones del plan

### Auto-corregidas

**1. [Regla 1 — Bug] La aserción de privacidad del research es rojo permanente contra la fixture real**

- **Encontrado durante:** tarea 3, en la primera corrida GREEN.
- **Problema:** `expect(JSON.stringify(eventos)).not.toContain('2781')` falla porque `2781` está dentro del identificador hexadecimal anonimizado del evento 6. No es una fuga: es una coincidencia entre dígitos decimales y una cadena hexadecimal.
- **Arreglo:** la aserción de dígitos pelados se restringe a los campos legibles; los campos opacos se cubren por la vía del test de estabilidad del hash. La aserción sobre el patrón de la etiqueta del teléfono se mantiene sobre la salida **completa**, y se añade la enumeración estructural de claves.
- **Verificación:** señuelo 4 → ROJO por **dos** tests independientes. La aserción sigue valiendo.
- **Commit:** `094de03`.

**2. [Regla 3 — Bloqueante] Bytes nulos reales dentro del archivo fuente**

- **Encontrado durante:** tarea 3.
- **Problema:** escribir `' '` en el fuente con las utilidades de línea de comandos de este entorno produjo el **byte nulo real**, no la secuencia de escape de seis caracteres. El archivo pasó a detectarse como binario y `grep` dejó de poder inspeccionarlo. Un fuente con bytes nulos es una bomba silenciosa: rompe herramientas que nadie prueba.
- **Arreglo:** las dos constantes se construyen con `String.fromCharCode(0)` y `String.fromCharCode(1)`. Verificado: el archivo se detecta como texto UTF-8.
- **Commit:** `094de03`.

**3. [Regla 2 — Funcionalidad crítica] `startsOn` y `endsOn` nulables**

- Justificación en Decisiones §1. Sin esto, un evento no interpretable se perdía en silencio o llevaba una fecha adivinada.
- **Commit:** `094de03`.

**4. [Regla 2 — Funcionalidad crítica] Tests y controles que el plan no listaba**

- Señuelo 6 (recorrido plano sin pila), no pedido y corrido igual.
- Control positivo del cambio de zona horaria: la mutación de `TZ` se verifica que surte efecto de verdad (una hora que sí cambia), o el test de invariancia compararía dos corridas idénticas y pasaría por vacuidad. Está en `ical.test.ts` y en `ical-normalizar.test.ts`.
- Control de que `airbnb-real-crlf.ics` y el feed con LF **difieren como texto**, para que la igualdad de documentos no sea trivial.
- Control de los 14 hashes intactos en el test de la reserva movida: sin él, un hash que cambiara siempre pasaría la aserción.
- Test de que el desescapado **no se aplica dos veces**, que es el modo de fallo clásico de esa función.
- **Commits:** `6c9306d`, `7aa765e`, `ebdb211`.

### Fuera de alcance, no tocado

`npm run lint` reporta **3 errores preexistentes** en `e2e/fixtures.ts` (`react-hooks/rules-of-hooks`) y **1 warning** preexistente en `lib/domain/aseador.schema.test.ts`. Ninguno viene de este plan y ninguno se tocó. Ningún archivo de este plan produce error ni warning de lint.

## Gates de autenticación

Ninguno. El plan es dominio puro: sin red, sin base, sin rutas autenticadas.

## Verificación

| Comprobación | Resultado |
|---|---|
| `npx vitest run` de los tres archivos nuevos | **57 tests, 3 archivos, verde** |
| `npm run test:unit` completo | **352 tests, 20 archivos, verde** (295 previos + 57) |
| `npx tsc --noEmit` | **OK** |
| `npm run ci:arch` | **OK**, 10 guardarraíles |
| `npm run build` | **OK**, 9 rutas |
| `git diff --stat package.json package-lock.json` | **vacío** — cero dependencias nuevas |
| `git status supabase/` | **limpio** — no se tocó la base ni las migraciones |
| `db reset` ejecutado | **no** |
| `git diff --diff-filter=D` en los 6 commits | **vacío** — ningún commit borra archivos |
| `ical-preview.test.ts` tras el cambio de `desdoblar` | **sigue verde, sin tocarlo** |

## Stubs conocidos

Ninguno. Los tres módulos están completos y ejercidos contra el feed real y contra las nueve fixtures del plan 03-01.

## Lo que este plan NO cierra

Se declara para que el verificador de la fase no lo cuente como cubierto:

1. **Cómo se ve de verdad un bloqueo del propietario.** El feed real tiene cero. El clasificador está probado contra fixtures sintéticas y el señuelo del orden de ramas no lo atrapa nadie. Lo cierra el checkpoint humano del plan **03-10**.
2. **Que Airbnb mande `CRLF`.** `airbnb-real-crlf.ics` prueba que el código lo aguanta, no que Airbnb lo mande.
3. **Que existan `VALARM`, `VTIMEZONE` o valores con hora en un feed de Airbnb.** Hoy no los manda. La pila de componentes y el rechazo del valor con hora son defensa, no observación.
4. **La guarda de colapso sobre reservas clasificadas.** Es la contraparte obligatoria de la falla cerrada y vive en el plan **03-06**. Sin ella, el día que Airbnb cambie el formato de la descripción los 15 eventos caen a `desconocido` y el reconcile cancelaría todos los aseos del apartamento. Está escrito en el encabezado de `ical-clasificar.ts`.

## Threat Flags

Ninguno. El plan no introduce superficie de red, rutas de autenticación, accesos a archivos ni cambios de schema. Cierra las mitigaciones de dominio de **T-03-10** (el tipo sin ranura, con señuelo), **T-03-11** (hash sobre campos normalizados, con test), **T-03-12** (cero objetos de fecha, dos zonas horarias y señuelo con doble red), **T-03-13** (lista posicional, test que afirma 2) y **T-03-14** (pila de componentes, con test). **T-03-15** queda mitigado del lado del dominio; su otra mitad es la guarda del plan 03-06. **T-03-16** sigue aceptado y declarado.

## Notas para las waves siguientes

1. **`normalizarIcs` devuelve TODOS los eventos, incluidos los `desconocido` y los no interpretables.** Filtrar por `clasificacion === 'reserva'` es responsabilidad de quien consume; contar los `desconocido` para alertar también.
2. **`startsOn` y `endsOn` pueden ser nulos.** El compilador lo va a exigir. Un evento con fecha nula nunca clasifica `reserva`.
3. **`parsearIcs` devuelve `completo: false` para un cuerpo truncado.** Esa es la señal que el sniff de `BEGIN:VCALENDAR` no da, y el worker del plan 03-06 la necesita antes de llamar al RPC.
4. **La guarda de colapso debe mirar RESERVAS CLASIFICADAS, no eventos.** `airbnb-desc-mutilado.ics` da 15 eventos y 0 reservas: el conteo de eventos no salta.
5. **`payloadHash` es estable frente a la rotación del teléfono.** Un diff que cambie sin que cambien `uid`, fechas, `summary` o código es un defecto, no un cambio del feed.
6. **No añadir campos a `EventoNormalizado` sin leer el encabezado del archivo.** El test estructural de claves cae, y cae a propósito.

## Self-Check: PASSED

Los 6 archivos declarados existen, los 6 commits existen en el historial, los archivos señuelo están todos revertidos (`git status` limpio salvo este resumen), `package.json` y `package-lock.json` sin cambios, y `supabase/` intacto.
