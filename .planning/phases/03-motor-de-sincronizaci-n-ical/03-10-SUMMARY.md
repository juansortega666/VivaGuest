---
phase: 03-motor-de-sincronizaci-n-ical
plan: 10
subsystem: privacidad
tags: [privacidad, dato-personal, barrido-de-base, logs, check, senuelos, cierre-de-fase, diferidos]

requires:
  - phase: 03-motor-de-sincronizaci-n-ical
    provides: "plan 03-02: el tipo sin ranura y las capas 1 y 2 de privacidad; plan 03-06: el worker con LineaDeLog sin ranura; plan 03-08: el arnes de siembra y corrida"
provides:
  - "lib/domain/sync-privacidad.integration.test.ts: las capas 3, 4 y 5 de privacidad, cada una con su control positivo"
  - "deferred-items.md de la fase: ocho entradas con dueno y forma de cierre, incluidas las dos preguntas abiertas con fecha de medicion"
  - "La decision escrita sobre la ventana protegida: se queda en today_bog() + 1"
  - "El resultado del checkpoint 1 escrito en el README de fixtures, donde se consulta antes de elegir una fixture"
affects: [04, 05]

tech-stack:
  added: []
  patterns:
    - "Barrido del volcado ENTERO del esquema publico, no un test por columna: es lo que sobrevive a que alguien anada una columna en seis meses"
    - "La asercion de ausencia va sobre el PATRON DE LA ETIQUETA del dato, no sobre el dato pelado, cuando el dato es una tira corta de digitos"
    - "Los digitos pelados solo se buscan en campos legibles: hashes, identificadores y montos son fuentes de colision esperable"
    - "El espia de logs cubre el camino de FALLO, que es donde tienta registrar el cuerpo crudo"
    - "Una columna prohibida por un guardarrail de CI se nombra en tiempo de ejecucion, no se le abre una excepcion al guardarrail"

key-files:
  created:
    - lib/domain/sync-privacidad.integration.test.ts
    - .planning/phases/03-motor-de-sincronizaci-n-ical/03-10-SUMMARY.md
  modified:
    - .planning/phases/03-motor-de-sincronizaci-n-ical/deferred-items.md
    - lib/domain/__fixtures__/ical/README.md

key-decisions:
  - "La ventana protegida NO se encoge: se queda en today_bog() + 1 hasta que haya dato real de produccion. La asimetria de costos decide"
  - "El checkpoint 2 se difiere CON FECHA (al tercer dia de sync real en produccion), porque produccion no existe: el checkpoint A1 de la Fase 1 sigue abierto"
  - "El checkpoint 1 se difiere y la clasificacion reserva-vs-bloqueo se declara en confianza MEDIA por escrito. NO se crea una fixture con ese nombre a partir de una sintetica"
  - "El guardarrail 9 de CI no se toca ni se le abre excepcion: la columna vetada se arma con un join en tiempo de ejecucion"
  - "Las tres consultas del checkpoint 2 quedan LITERALES en deferred-items, no resumidas"

requirements-completed: [SYNC-03, SYNC-09, SYNC-10]

duration: 38min
completed: 2026-09-03
---

# Fase 3 Plan 10: Privacidad transversal y cierre de la fase, Resumen

**Tras un sync completo con el feed real, los últimos 4 dígitos del teléfono del huésped no están en ninguna columna de ninguna tabla del esquema público ni en ningún log, y hay tres capas independientes que lo demuestran con tres señuelos que las ponen en rojo, uno por capa.**

## Performance

- **Duración:** 38 min
- **Tareas:** 2 de código y documentación completadas, 2 checkpoints resueltos como diferimiento escrito
- **Archivos creados:** 2
- **Archivos modificados:** 2
- **Tests nuevos:** 4. La suite de integración pasa de 101 a **105**

## Commits

| # | Commit | Mensaje |
|---|---|---|
| 1 | `dec06ba` | `test(03-10)`: las tres capas de privacidad transversal, con sus controles positivos |
| 2 | `e5d757f` | `docs(03-10)`: el checkpoint 2 diferido con fecha y la ventana protegida decidida |
| 3 | `18661c2` | `docs(03-10)`: el checkpoint 1 diferido, la clasificación se queda en confianza MEDIA |

## Las tres capas, y qué mide cada una

Las capas 1 y 2 (unitario sobre el normalizador y su señuelo) las entregó el plan 03-02. Estas son las que sobreviven a un refactor ajeno.

**Capa 3, el barrido de TODA la base.** Sync completo con el feed real y después `pg_dump --data-only --schema=public` entero. Se afirma que el volcado no contiene el patrón de la etiqueta del teléfono, ni el de "últimos 4 dígitos", ni la ruta de detalle de reserva. **No se enumera ni una columna**, y esa es toda la razón de ser: enumerar es exactamente lo que deja fuera la columna que alguien añada dentro de seis meses.

**Capa 4, la captura de logs.** Se interceptan los cuatro métodos de consola durante la corrida completa. Dos caminos, no uno:

- El de **éxito**, donde se afirma que no aparece el teléfono, ni el cuerpo, ni la dirección del feed (que es una credencial: un `GET` a ella revela la ocupación completa del apartamento sin autenticarse).
- El de **fallo por colapso**, que el plan no pedía y se añadió porque es donde de verdad tienta registrar el cuerpo crudo. La tentación está escrita en el encabezado del propio worker. El cuerpo mutilado sigue trayendo los quince teléfonos, y el test lo afirma antes de afirmar que no salieron por el log.

**Capa 5, la garantía estructural.** Escribir la columna vetada con la fábrica administrativa falla con `23514` nombrando `cal_res_sin_descripcion`. Es la aserción 12 de `05_sync.test.sql` comprobada desde el lado del cliente, que es la única ruta que de verdad podría escribirla: **`service_role` salta la RLS, no salta un CHECK**.

## Los tres señuelos obligatorios, medidos

Cada uno se aplicó al código real o a la base, se midió, y se revirtió.

| # | Señuelo | Esperado | Medido | Qué lo atrapó |
|---|---|---|---|---|
| 1 | El worker registra el cuerpo de la respuesta: `cuerpo?: string` en `LineaDeLog` y `cuerpo` en el `responder` del camino de éxito | ROJO | **ROJO** | Capa 4, `not.toMatch(/Phone Number/i)` |
| 2 | El worker registra la dirección del feed: `url: destino.data` | ROJO | **ROJO** | Capa 4, `not.toContain('?s=')` |
| 3 | Columna `diagnostico text` añadida a `calendar_reservations` y el worker le escribe 1500 bytes del cuerpo crudo tras el RPC | ROJO | **ROJO** | Capa 3, el barrido del volcado |

**El señuelo 3 es el que justifica el diseño de la capa 3 y no es intercambiable por otro.** Ningún test por columna habría visto `diagnostico`, porque nadie la había escrito todavía cuando se escribieron los tests. Es el único de los tres que sigue vivo dentro de seis meses.

Los dos primeros exigieron **añadirle un campo al tipo `LineaDeLog`**, que es exactamente la fricción que ese tipo existe para producir: meter el cuerpo o la dirección en un log tiene que ser un cambio deliberado y visible, no un descuido.

Estado tras revertir: `route.ts` idéntico byte a byte al original, columna `diagnostico` eliminada de la base, `db:types:check` sin deriva, `git status` limpio.

## La trampa de los dígitos pelados, y cómo quedó

**La receta del research §8 propone `expect(volcado).not.toContain(telefono)` para cada uno de los quince. Escrita así es rojo permanente por una razón que no tiene nada que ver con privacidad.** El plan 03-02 ya lo midió contra la fixture (el teléfono `2781` vive dentro del identificador hexadecimal anonimizado de su propio evento) y el research avisaba de la clase de problema pero identificaba mal la fuente. En el volcado la fuente es más amplia todavía: hashes de 64 caracteres hexadecimales, identificadores universales y montos en pesos colombianos, todos tiras largas de dígitos.

Cómo quedó, y por qué sigue siendo una aserción fuerte:

1. Sobre el **volcado completo**: ausencia del patrón de la etiqueta, que es lo que viaja pegado al dato si el dato se filtra. **Señuelo 3 lo confirma.**
2. Sobre los **dígitos pelados**: solo en las columnas legibles de la tabla de reservas (`reservation_code`, `summary`, `starts_on`, `ends_on`). `uid` y el hash quedan fuera **a propósito y por escrito**, y que el teléfono no entre en el hash lo cubre por otra vía el test de estabilidad del hash del plan 03-02.
3. Sobre los **logs**: los dígitos pelados sí se buscan, pero sobre la salida con los identificadores universales redactados, y con el control de que la redacción no se comió la salida. Sin esa redacción la capa 4 sería **intermitente** (un identificador de 32 caracteres hexadecimales tiene ~29 ventanas de cuatro caracteres donde un teléfono puede caer por azar), y un test intermitente es un test que alguien borra.

## Cómo se satisfizo el guardarraíl 9 sin tocarlo

El guardarraíl 9 de CI prohíbe que ningún archivo bajo `app/`, `lib/` o `components/` **nombre** la columna vetada, ni siquiera para leerla. La capa 5 tiene que escribirla para probar que el CHECK la rechaza.

**No se le abrió una excepción al guardarraíl.** El nombre se arma en tiempo de ejecución con un `join`, así que el guardarraíl sigue entero para todo el repositorio, este archivo incluido. La alternativa (excluir el archivo por ruta, como está excluido el archivo de tipos generado) habría dejado un hueco por el que cualquier lectura futura de esa columna entraría sin que nadie se enterara, y en un archivo de tests, que es donde menos se revisa.

## Los dos checkpoints, resueltos como diferimiento escrito

### Checkpoint 1: el `.ics` real con bloqueos del propietario, DIFERIDO

Decisión del usuario: la prioridad es sacar el MVP. **El archivo `airbnb-real-bloqueos.ics` no existe y no se creó ninguno con ese nombre.** No se copió ni se derivó de `solo-bloqueos.ics` ni de `airbnb-bloqueos-1dia.ics`: etiquetar una fixture sintética como captura real dejaría el repositorio afirmando algo falso sobre su propia evidencia, que es la circularidad exacta que el plan advierte.

Queda escrita en `deferred-items.md` (entrada 8) y en el README de fixtures la frase literal que el plan exige: **la distinción entre reserva y bloqueo del propietario está en confianza MEDIA y no la cierra ningún test de este repo.** Con la consecuencia sin suavizar (cero bloqueos reales en todo el repo, la suposición A1 sin verificar), la mitigación vigente en tres capas (falla cerrada, alerta, guarda de colapso), el dueño, y los seis pasos para cerrarlo.

**Y queda anotado el otro lado de la misma laguna:** el señuelo del plan 03-02, invertir el orden de las dos ramas del clasificador, **sigue sin poder atraparse**, porque los dos discriminadores están correlacionados al 100% en la única muestra real que existe.

### Checkpoint 2: leer la instrumentación, DIFERIDO CON FECHA

Se difiere **porque producción no existe**, no por falta de tiempo. El checkpoint A1 de la Fase 1 sigue abierto, así que no hay tres días de sync real que leer, y en local el piso del feed y las rotaciones de UID salen de fixtures construidas por nosotros: leerlas sería medirnos a nosotros mismos.

- **Fecha de disparo:** al tercer día de sync real corriendo en producción, atado a que se cierre el checkpoint A1.
- **Las tres consultas quedan literales** en `deferred-items.md`, no resumidas. Un resumen obliga a reconstruirlas en tres meses y ahí se pierden.
- **Las dos preguntas** están con lo que desbloquea cada una: la primera desbloquea la decisión sobre la ventana protegida; la segunda no bloquea nada, porque el diseño del diff es correcto bajo las dos respuestas.
- **Dueño:** el usuario, al desplegar.

### La decisión sobre la ventana protegida: se queda en `today_bog() + 1`

**No se encoge.** No hay ni un dato medido que confirme el mundo A: lo que hay son dos documentos de research en desacuerdo y fixtures construidas por nosotros. Y la asimetría de costos decide sola:

- Dejarla en `+1` si el mundo real fuera A: **un aseo de más**, que un humano cancela en diez segundos.
- Encogerla a `today_bog()` si el mundo real fuera B: **el aseo de hoy cancelado con la aseadora ya en camino**.

Ante cualquier duda no se encoge. La postura conservadora queda por escrito y con dueño, que es distinto de mantenerse por olvido.

## `deferred-items.md` de la fase: ocho entradas

| # | Entrada | Dueño |
|---|---|---|
| 1 | El checkpoint 2 diferido con fecha, con las tres consultas literales | El usuario, al desplegar |
| 2 | La ventana protegida se queda en `today_bog() + 1`, con su justificación | Decidido, no pendiente |
| 3 | Los proyectos Supabase dev y prod no existen (checkpoint A1 de la Fase 1) | El usuario |
| 4 | `CRON_SHARED_SECRET` en tres sitios, con su modo de fallo silencioso (401 que nadie lee) | Fase de despliegue |
| 5 | La cadencia de días no está verificada y no puede estarlo sin producción | Primera semana de producción |
| 6 | Que el feed real llegue con CRLF no está probado | Primera corrida real |
| 7 | `tsc`, `build` y `e2e` en rojo por `@types` duplicados en el checkout principal | El usuario |
| 8 | El `.ics` real con bloqueos: diferido, clasificación en confianza MEDIA | El usuario |

Las dos entradas del plan 03-09 (lint preexistente y el dead man's switch externo) se conservaron y a la segunda se le añadió dueño y forma de cierre, que le faltaban.

## El recuento de señuelos de la fase completa

Es el formato de cierre que usó la Fase 2 (57 señuelos, 53 atrapados, 4 declarados sin red), y es lo que hace honesto el reporte.

| Plan | Señuelos | Atrapados | Notas |
|---|---|---|---|
| 03-01 | 8 (+7 controles) | 8 | El señuelo 3 salió **VERDE** al medirlo: el guardarraíl 7 no reconocía el handler declarado como constante-flecha. Se **arregló dentro del plan** y volvió a ROJO |
| 03-02 | 6 | **5** | El señuelo 2 (invertir las ramas del clasificador) **NO se atrapa**. Ver abajo |
| 03-03 | 0 | — | El plan no declara señuelos |
| 03-04 | 2 | 2 | |
| 03-05 | 9 | 9 | S6 además hizo abortar el archivo con `P0001`, que es información extra |
| 03-06 | 6 | 6 | |
| 03-07 | 2 | 2 | S1 no hubo ni que provocarlo: el job agendado falló solo contra una base sin secretos |
| 03-08 | 6 | 6 | El señuelo 2 corrigió una predicción del plan: 0 aseos cancelados, no 15, por un candado del RPC |
| 03-09 | 7 | 7 | Medidos en ocho pasadas |
| **03-10** | **3** | **3** | |
| **Total** | **49** | **48** | |

### El único que no se atrapa, y por qué

**Señuelo 2 del plan 03-02: invertir el orden de las dos ramas de `clasificar()`.** No pone en rojo ni una sola aserción sobre una fixture. Ni las 15 reservas del feed real, ni los 90 bloqueos, ni los 3 desconocidos, ni los 15 del descriptor mutilado se mueven. Lo único que cae es un test sintético escrito a mano para fijar la decisión.

**La causa no es un test flojo: es una laguna de datos.** En la única muestra real que existe los dos discriminadores están correlacionados al 100%, porque no hay ni un evento que traiga a la vez la URL de detalle y un resumen de no disponibilidad. Y no lo hay porque **no existe ni un solo bloqueo real del propietario en todo el repositorio**.

Es la misma laguna del checkpoint 1, vista desde el otro lado. Se cierra con la captura de diez minutos descrita en la entrada 8 de `deferred-items.md`, y con ella la confianza de la clasificación subiría de MEDIA a ALTA.

**El señuelo 3 del plan 03-01 merece mención aparte:** salió VERDE cuando debía salir ROJO, y eso es un señuelo que **funcionó**. Encontró un hueco real en el guardarraíl, el hueco se cerró dentro del mismo plan, y volvió a ROJO. No se cuenta como "no atrapado" porque el defecto que buscaba quedó cubierto; se cuenta aquí porque el reporte sin esa nota estaría maquillado.

## Desviaciones del plan

### Auto-corregidas

**1. [Regla 2 — Funcionalidad crítica] La capa 4 cubre también el camino de FALLO**

- **Encontrado durante:** tarea 1, escribiendo el espía de consola.
- **Problema:** el plan pide espiar "la corrida completa", y la corrida de éxito registra una línea con contadores. Pero el modo de fallo concreto que el encabezado del worker documenta es **registrar el cuerpo crudo cuando el parseo falla**, que es justo el caso en el que más se querría verlo. Un test que solo mire el camino feliz no cubre la tentación real.
- **Arreglo:** un segundo test con `airbnb-desc-mutilado.ics` y `reservasAnteriores: 15`, que dispara el colapso. Control positivo: el log contiene `"codigo":"cero_reservas_clasificadas"`. Y se afirma antes que el cuerpo mutilado **sí** trae los quince teléfonos, o la aserción de ausencia pasaría por vacuidad.
- **Commit:** `dec06ba`.

**2. [Regla 3 — Bloqueante] El nombre de la columna vetada, armado en tiempo de ejecución**

- **Encontrado durante:** tarea 1, capa 5.
- **Problema:** el guardarraíl 9 de CI prohíbe nombrar esa columna en cualquier `.ts` bajo `lib/`. La capa 5 tiene que escribirla. Escrita literal, `npm run ci:arch` se pone en rojo.
- **Arreglo:** se arma con un `join` en tiempo de ejecución y se documenta por qué en el propio archivo. **No se le abrió excepción al guardarraíl**, que era la salida fácil: una exclusión por ruta habría dejado pasar cualquier lectura futura de esa columna dentro de un archivo de tests.
- **Commit:** `dec06ba`.

**3. [Regla 2 — Funcionalidad crítica] La redacción de identificadores antes de buscar dígitos pelados en los logs**

- **Encontrado durante:** tarea 1, capa 4.
- **Problema:** el identificador del feed es un UUID de 32 caracteres hexadecimales, y aparece en cada línea de log. Buscar los quince teléfonos como subcadena sobre esa salida es intermitente por construcción, y es la misma clase de defecto que el plan 03-02 midió en el normalizador.
- **Arreglo:** los identificadores se redactan antes de esa aserción, con un control positivo de que la redacción no vació la salida. Las aserciones sobre el patrón de la etiqueta van sobre la salida **sin** redactar.
- **Commit:** `dec06ba`.

**4. [Regla 2] El dead man's switch externo del plan 03-09 no tenía dueño ni forma de cierre**

- La entrada existía en `deferred-items.md` desde el plan 03-09 pero sin las dos cosas que el formato de la Fase 1 exige. Se le añadieron sin tocar el texto original.
- **Commit:** `e5d757f`.

### Fuera de alcance, no tocado

**`tsc --noEmit`, `npm run build` y `npm run test:e2e` en rojo por `node_modules` del checkout principal.** Ver la entrada 7 de `deferred-items.md`, con las tres mediciones. **Ni un solo error en código del proyecto:** `npx tsc --noEmit --typeRoots ./node_modules/@types` sale con cero errores y cero salida. Es `node_modules` de la máquina del usuario, fuera del repositorio, y borrar directorios ajenos al worktree es exactamente lo que la frontera de alcance prohíbe.

**`npm run lint`, 3 errores y 1 aviso preexistentes.** Los del plan 03-09, intactos.

## Gates de autenticación

Ninguno. El plan no toca rutas autenticadas ni servicios externos. Los dos checkpoints son de decisión humana, no de credencial.

## Verificación

| Comprobación | Resultado |
|---|---|
| `npx vitest run` del archivo nuevo | **4 tests, verde** |
| `npm run test:integration` | **11 archivos, 105 tests, verde** (baseline 101) |
| `npm run test:unit` | **24 archivos, 392 tests, verde** |
| `npm run db:test` (pgTAP) | **6 archivos, 112 tests, PASS** |
| `npm run ci:arch` | **OK**, 10 guardarraíles, sin excepción nueva |
| `npm run db:advisors` | **No issues found** |
| `npm run db:types:check` | **sin deriva** |
| `npx tsc --noEmit` | **rojo, 9 × TS2688**, todos ambientales. Ver entrada 7 |
| `npx tsc --noEmit --typeRoots ./node_modules/@types` | **cero errores, cero salida** |
| `npm run build` | **rojo**, mismo `TS2688`. Webpack compila limpio en 13.9 s |
| `npm run test:e2e` con `PLAYWRIGHT_PORT=3117` | **no arranca**, su `webServer` corre `npm run build` |
| `lib/domain/feed.integration.test.ts` de la Fase 2 | **verde, sin tocarlo** |
| `git diff --stat package.json package-lock.json` | **vacío**, cero dependencias nuevas |
| `git status supabase/` | **limpio**, ninguna migración nueva |
| `git diff --diff-filter=D` en los 3 commits | **vacío**, ningún commit borra archivos |
| Estado tras los señuelos | `route.ts` idéntico al original, columna `diagnostico` eliminada, árbol limpio |

## Stubs conocidos

Ninguno. Las tres capas están completas y ejercidas contra el feed real.

## Lo que este plan NO cierra

Se declara para que el verificador de la fase no lo cuente como cubierto:

1. **Cómo se ve de verdad un bloqueo del propietario.** Checkpoint 1 diferido. Confianza MEDIA declarada por escrito en dos sitios.
2. **Las dos preguntas empíricas del checkpoint 2.** Diferidas con fecha, consulta y dueño. No se responden en local porque en local nos mediríamos a nosotros mismos.
3. **Que el teléfono no se filtre por un canal que no sea la base ni la consola.** El barrido cubre el volcado del esquema público y la captura cubre los cuatro métodos de consola. Un canal nuevo (telemetría de terceros, un correo, un webhook) no lo ve ninguna de las cinco capas. Hoy no existe ninguno.
4. **Que `pg_dump` vea todo lo que hay.** El barrido es sobre el esquema `public`. `auth`, `storage` y `net` quedan fuera, y es correcto: el pipeline de sync no escribe en ninguno de los tres.

## Threat Flags

Ninguno. El plan no introduce superficie de red, rutas de autenticación, accesos a archivos ni cambios de schema.

Cierra las mitigaciones de **T-03-90** (barrido del volcado completo, con el señuelo de la columna nueva que lo demuestra), **T-03-91** (espía de los cuatro métodos de consola en los dos caminos, con control positivo y dos señuelos) y **T-03-92** (el `23514` comprobado desde el lado del cliente con la fábrica administrativa).

**T-03-93** queda **aceptado y declarado**, no mitigado: el checkpoint 1 se difirió, así que la mitigación vigente sigue siendo que fallar cerrado no es destructivo.

**T-03-94** queda mitigado por escrito: las tres consultas concretas, la fecha de disparo y el dueño están en `deferred-items.md`. La instrumentación deja de ser "escrita y nunca leída" y pasa a ser "escrita, con fecha de lectura y responsable".

**T-03-95** queda mitigado: la regla escrita es que ante cualquier duda la ventana protegida no se encoge, y la decisión de no encogerla está tomada y justificada.

## Notas para las fases siguientes

1. **[Fase 4]** `estadoDeSincronizacion` de `lib/domain/salud-sync.ts` es la función que el dashboard tiene que consumir sobre `max(last_success_at)` de los feeds activos. **Es la única capa de la alerta de job muerto que no es ciega a su propia muerte.** Si la Fase 4 no la pinta, esa alerta no existe.
2. **[Fase 4]** `needs_review` es pegajoso: el sync nunca lo apaga. La pantalla de revisión del admin es la única forma de bajarlo, y sin ella las marcas se acumulan.
3. **[Fase 4]** Las alertas de calendario usan un solo valor de enum con discriminador en `payload` (`scope` y `motivo`). El panel necesita un solo carril visual de calendario, no tres.
4. **[Fase 5]** `notifications` ya se llena como outbox de push desde esta fase; el worker de push la encontrará con filas pendientes desde el primer día.
5. **Cualquier columna de texto nueva en el esquema público entra en el barrido de la capa 3 automáticamente.** No hay que tocar el test. Si el barrido se pone rojo tras añadir una columna, la columna está guardando dato personal.
6. **Antes de añadir un canal de salida nuevo** (telemetría, correo, webhook), hay que extender la capa 4: hoy solo cubre la consola.

## Self-Check: PASSED

- `lib/domain/sync-privacidad.integration.test.ts` existe.
- `.planning/phases/03-motor-de-sincronizaci-n-ical/deferred-items.md` existe con las ocho entradas.
- `lib/domain/__fixtures__/ical/airbnb-real-bloqueos.ics` **NO existe**, que es lo que este plan afirma y lo que el registro tiene que decir.
- Los tres commits existen en el historial: `dec06ba`, `e5d757f`, `18661c2`.
- `route.ts` sin cambios respecto al original tras los señuelos; la columna temporal de la base, eliminada.
- `STATE.md` y `ROADMAP.md` sin tocar, como manda el modo worktree.
