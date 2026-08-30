# Project Research Summary

**Project:** VivaGuest
**Domain:** Plataforma de operación de housekeeping para renta corta (STR), sincronizada por iCal, con dashboard admin y PWA de campo para aseadores
**Researched:** 2026-08-30
**Confidence:** MEDIA-ALTA (stack y schema/RLS: ALTA verificada contra docs oficiales y `.d.ts`; comportamiento del iCal de Airbnb/Booking: MEDIA, sin especificación pública; sentimiento real de operadores de la categoría: BAJA)

## Executive Summary

VivaGuest es un dispatcher de aseos para 39 unidades en 8 clusters, construido sobre Next.js 15 (App Router) + Supabase (Postgres/Auth/Storage/RLS) + Vercel + PWA con Web Push. Es una categoría con productos de referencia claros (Turno, Breezeway, Operto Teams) que resuelven el mismo problema base: leer el calendario del canal, generar la tarea de aseo, despacharla a personal fijo y capturar evidencia. VivaGuest se diferencia en tres puntos defendibles: confirmación humana obligatoria antes de asignar, detección de extensiones mal creadas por código de reserva, y un modelo de portafolio mixto (`gestion_vivaguest`) que ningún competidor modela. Las tres decisiones "de espina dorsal" del research (schema-first, RLS con funciones `SECURITY DEFINER`, y snapshot financiero congelado en el aseo) están verificadas contra documentación oficial y son de riesgo técnico bajo.

El riesgo real del proyecto no es de escala (decenas de aseos/día, 8 aseadores) sino de correctitud sobre una fuente de datos ajena y no documentada: el iCal de Airbnb y Booking.com. Los cuatro documentos de investigación coinciden en que el motor de sincronización concentra la mayoría de los pitfalls que "rompen el producto": el off-by-one en `DTEND`, el reconcile destructivo que cancela aseos del día en curso cuando el feed devuelve vacío, la clasificación de bloqueos del propietario como reservas, y la fiabilidad del `UID` como identificador estable. El segundo riesgo mayor, de producto y no técnico, es que push sea el único canal de notificación al aseador: ningún competidor de la categoría depende de un solo canal, y en iOS la instalación de la PWA en pantalla de inicio es un requisito duro sin prompt automático. Ninguno de los dos riesgos se resuelve con más ingeniería de UI; se resuelven con ventanas de protección en el diff, validación estructural del feed, y un semáforo de entregabilidad visible para el admin como mecanismo de recuperación humana.

La recomendación de este research es: schema + RLS antes que cualquier UI (ya es un constraint del proyecto y el research lo confirma como la decisión correcta), capturar `.ics` reales de la operación de VivaGuest antes de escribir el parser, tratar el offline de la PWA del aseador como parte de su primera versión y no como mejora posterior, y construir el motor de sync con ventanas de reconcile acotadas e idempotencia por índice único parcial en Postgres. Los cuatro documentos entran en desacuerdo en varios puntos de implementación que si se pasan por alto rompen la operación real; están todos documentados en la sección de conflictos, con una recomendación explícita para cada uno.

## Key Findings

### Recommended Stack

Next.js 15.5.24 pineado (build webpack, no Turbopack: hay un bug abierto de Serwist en Turbopack+Vercel), `@supabase/ssr` como único cliente de auth server-side, `node-ical` para el parseo de iCal (verificado contra 830 VEVENTs reales de Airbnb y Booking.com), `web-push` en runtime Node para VAPID, `@serwist/next` para el service worker, y `bigint` en Postgres para dinero en COP (sin subunidades en circulación). El scheduler de 30 minutos es el punto de mayor divergencia entre documentos — ver Conflictos.

**Core technologies:**
- `next@15.5.24` + `react@19`: framework, pineado en la línea 15 para evitar el bug de Serwist+Turbopack en Vercel
- `@supabase/ssr@0.12.5`: único paquete soportado para auth SSR; `setAll` con dos argumentos es obligatorio en Vercel o hay fuga de sesión entre usuarios
- `node-ical@0.27.1`: parser iCal activo, con unfolding correcto de líneas y flag `dateOnly` explícito para eventos `VALUE=DATE`
- `web-push@3.6.7`: única opción con tracción real para VAPID; runtime Node, nunca Edge
- Postgres `bigint`: dinero en pesos enteros; `numeric` se descarta explícitamente porque `supabase-js` lo devuelve como string y rompe la aritmética en TypeScript

### Expected Features

**Must have (table stakes), ya cubiertos por el spec:** sync iCal con generación automática de tarea, reconciliación ante cancelación/cambio de fecha, marca de same-day turnover, responsable fijo + suplente, reasignación puntual, tareas manuales, checklist con foto obligatoria, reporte de daño/gasto/faltante, dashboard con carga diaria y alertas.

**Table stakes NO cubiertos por el spec actual (brecha real frente a la categoría):**
- Notificación multicanal — VivaGuest depende de un solo canal (push); ningún competidor lo hace
- Tolerancia a conectividad mala (cola de subida offline) — el spec hace la foto un gate duro sin definir la ruta de fallo
- Cierre manual del aseo por el admin — todo dispatcher serio tiene este escape hatch

**Should have (diferenciadores defendibles):** confirmación humana de un solo paso, detección de extensión mal creada por código de reserva, bandeja persistente "Sin confirmar", rentabilidad inline, modelo `gestion_vivaguest = false`, PWA sin tienda.

**Defer (v2+):** canal secundario formal, seguimiento de desempeño de aseadores, dashboard de propietarios, exportación real, editor de checklists por apartamento, tiers SaaS.

### Architecture Approach

Todo el estado operativo vive en Postgres; los workers de Vercel son *stateless*. `pg_cron` es el reloj único del sistema (sync, notificaciones, watchdog, retención); las transiciones de estado del aseo pasan siempre por RPC `SECURITY DEFINER` (nunca `UPDATE` directo), porque los invariantes son multi-fila y transaccionales (ej. "terminar" exige checklist completo con foto, "no puedo" limpia el aseador y encola notificación atómicamente). El aislamiento admin/aseador se resuelve enteramente con RLS por fila, con funciones `private.*` que rompen la recursión de policies; los códigos de acceso viven en una tabla separada (`property_secrets`) porque los privilegios de columna son por rol de base, no por usuario, y RLS es la única herramienta real de aislamiento por fila.

**Major components:**
1. **Postgres schema + RLS** — verdad operativa, invariantes de dominio (1 aseo activo por apartamento/fecha vía índice único parcial), snapshot financiero congelado al completar/cancelar
2. **Motor de sync iCal** (`pg_cron` fan-out vía `pg_net` → Route Handler Node, un feed por invocación) — fetch, validación estructural, diff transaccional con ventana de protección
3. **Outbox de notificaciones** (tabla `notifications` + despachador cada minuto) — unifica los tres orígenes de evento (Server Action, trigger, cron) en un solo camino reintentable
4. **PWA del aseador** (RSC + Server Actions → RPC, cola local en IndexedDB) — lista de aseos, checklist, evidencia, reportes
5. **Dashboard admin** (RSC + Server Actions) — confirmación, bandeja, alertas derivadas de una vista (`v_admin_alerts`), historial

### Critical Pitfalls

1. **Reconcile destructivo** — el feed de Airbnb no exporta el pasado; un diff ingenuo que interpreta "ausente en el feed = cancelado" cancela el aseo de hoy mientras el aseador va camino al apartamento. *Mitigación:* ventana de reconcile acotada (`>= hoy + 1`), guardarraíl de cambio masivo, validación estructural del cuerpo antes de diffear.
2. **Off-by-one en `DTEND`** — `DTEND` es exclusivo por RFC 5545; el aseo es exactamente ese día. Manejarlo como `Date`/`timestamptz` en vez de string `date` desplaza el aseo un día. *Mitigación:* fecha de negocio como `date` de Postgres y string `YYYY-MM-DD`, nunca `new Date()`; tests con `TZ=UTC` en CI.
3. **Bloqueos del propietario tratados como reservas** — llena la bandeja "Sin confirmar" de basura y entrena al admin a ignorarla, que es el modo de falla que mata el Core Value. *Mitigación:* whitelist positiva (`Reservation URL` en `DESCRIPTION`), nunca blacklist.
4. **Push como único canal sin plan de recuperación** — la entrega nunca es la fuente de verdad; debe existir un semáforo de salud de notificaciones visible para el admin, que es el mecanismo de recuperación humana real.
5. **Offline asumido como fase posterior en la PWA** — reescribir un flujo síncrono a uno con cola local es reescribir la capa de datos entera; debe construirse desde la primera versión.

## Implications for Roadmap

Estructura de fases sugerida, basada en el `Build Order` de ARCHITECTURE.md, ajustada con los hallazgos de FEATURES.md y PITFALLS.md, y con las resoluciones de conflicto de este documento ya incorporadas:

### Fase 1: Fundación + Schema núcleo + RLS
**Rationale:** constraint ya fijado en PROJECT.md ("schema + migraciones + RLS antes que UI"); el research lo confirma como la decisión correcta porque los tipos generados y la forma de los RPC son el contrato de toda la UI posterior, y porque el pitfall de seguridad más severo (fuga de códigos de acceso) sólo se previene con RLS + auditoría desde el día uno.
**Delivers:** enums, `today_bog()`, `profiles`, `properties` con sus CHECKs, `property_secrets` (tabla separada), catálogo de cuartos/checklist, `calendar_feeds`/`calendar_reservations`/`cleanings` con los dos índices únicos parciales, esquema `private` con helpers `SECURITY DEFINER`, RPCs de transición de estado, bucket `evidencia` con policies, suite pgTAP con casos negativos.
**Avoids:** Pitfall 6 (códigos de acceso fugados), Pitfall 12-14 (middleware confundido con autorización, caché cruzada, cliente singleton).

### Fase 2: Motor de sincronización iCal
**Rationale:** es el Core Value del producto y concentra los pitfalls de mayor severidad. Requiere como prerequisito capturar y versionar `.ics` reales de la operación de VivaGuest (Airbnb y Booking.com) — no se codifica contra samples de internet.
**Delivers:** `dispatch_feed_syncs()` (pg_cron + pg_net, un feed por invocación), Route Handler `sync-feed` con validación estructural, diff transaccional con ventana de protección, detección de urgencia y extensión sospechosa, watchdog de feed muerto, `sync_runs` con heartbeat.
**Avoids:** Pitfalls 1, 2, 3, 4, 5, 15, 16 (reconcile destructivo, off-by-one, bloqueos-como-reservas, identidad por UID, cron muerto en silencio, alertas de feed inútiles, latencia asumida).
**Bloqueante previo:** re-verificar la estabilidad del `UID` de Airbnb/Booking contra los feeds reales de VivaGuest (ver Conflictos #2).

### Fase 3: Notificaciones push
**Rationale:** segundo riesgo mayor del producto, no técnico sino de adopción; depende de que la Fase 1 tenga la tabla `push_subscriptions` y de que la Fase 2 produzca eventos que notificar.
**Delivers:** VAPID, manifest, service worker (push + notificationclick), outbox de notificaciones con despachador cada minuto, manejo de 404/410, re-suscripción defensiva en cada arranque, banner de permiso con gesto de usuario tardío.
**Avoids:** Pitfall 7 (push sin plan de recuperación), Pitfall 17 (adopción/instalación).

### Fase 4: PWA del aseador, offline-first desde el día uno
**Rationale:** PITFALLS es explícito: el offline no es una fase posterior, es parte de la primera versión, porque reescribirlo después es reescribir la capa de datos del cliente entera y la pérdida de confianza del aseador tras perder trabajo físico ya hecho es irrecuperable.
**Delivers:** lista de aseos con app shell cacheado, detalle con código de acceso vía RPC auditado, cola de mutaciones idempotentes en IndexedDB (`client_event_id`), checklist con foto obligatoria comprimida en cliente antes de encolar, "Empecé"/"Terminé"/"no puedo" validados contra estado local, indicador de "N cambios sin enviar".
**Avoids:** Pitfall 8 (offline asumido), Pitfall 9 (fotos sin comprimir).

### Fase 5: Dashboard admin
**Rationale:** depende de que existan aseos que confirmar (Fase 2) y de que la asignación notifique (Fase 3); es donde se materializan los diferenciadores de producto (bandeja persistente, alertas de una sola jerarquía).
**Delivers:** vista por día, bandeja "Sin confirmar", confirmación en un paso, reasignación, aseos manuales, `v_admin_alerts`, buscador e historial cronológico, semáforo de salud de push por aseador.
**Avoids:** Pitfall 19 (alertas convertidas en ruido).

### Fase 6: Financiero
**Rationale:** sólo depende del schema de Fase 1 (columnas snapshot); puede adelantarse en paralelo si hay capacidad, pero como entrega de producto tiene sentido después de que el dashboard exista.
**Delivers:** `v_cleaning_margin`, `v_carga_diaria`, cierre de mes, snapshot persistido del pago mensual (no derivado en vivo).
**Avoids:** el conflicto retención-vs-histórico de pagos (ver Conflictos y Decisiones).

### Fase 7: Retención
**Rationale:** de menor riesgo técnico pero con implicación legal/operativa (evidencia de disputas); el flag `legal_hold` y `deleted_at` deben existir en el schema de Fase 1 aunque el job se construya al final, para no migrar datos operativos después.
**Delivers:** soft delete + cuarentena, `notify_retention()`, `purge_expired()`, worker de borrado en Storage API con cola independiente.
**Avoids:** Pitfall 18 (borrado que destruye evidencia en disputa).

### Fase 8: Piloto y rollout escalonado
**Rationale:** ninguno de los cuatro documentos lo tenía como fase explícita del spec, pero PITFALLS lo señala como una fase que "debería existir" — el requisito duro de instalación de PWA en iOS hace que un rollout de los 39 apartamentos de una sola vez sea el escenario de mayor riesgo de adopción del proyecto.
**Delivers:** ruta `/instalar` con detección de navegador/webview, arranque por un cluster pequeño (ej. Medellín, 1 apartamento) con WhatsApp/Excel en paralelo, checklist de onboarding por aseador visible para el admin.
**Avoids:** Pitfall 17 (adopción).

### Phase Ordering Rationale

- El camino crítico es Fase 1 → Fase 2 → Fase 3 → Fase 5: todo el valor central del producto ("que ningún aseo se pierda") vive ahí. La Fase 4 (PWA aseador) sin la Fase 2 no tiene aseos que mostrar.
- Fases 2, 3, 6 y 7 son paralelizables entre sí una vez cerrada la Fase 1, según ARCHITECTURE.md — útil si hay más de una persona construyendo.
- Fases 4 y 5 son paralelas entre sí (comparten solo lógica de dominio, no componentes de UI) — es la división natural si el equipo se separa en "superficie admin" y "superficie aseador".
- No arrancar ninguna UI antes de que la Fase 1 esté cerrada: los tipos generados y la forma de los RPC son el contrato, y construir pantallas antes garantiza reescribirlas.

### Research Flags

Necesitan research adicional durante el planning (`--research-phase`):
- **Fase 2 (motor de sync):** el comportamiento exacto del iCal de Airbnb/Booking no tiene especificación pública; toda la investigación existente es MEDIA confianza. Además hay que resolver la contradicción de estabilidad del `UID` (ver Conflictos #2) contra los feeds reales de VivaGuest antes de fijar el diseño del differ.
- **Fase 3 (push):** el comportamiento de Web Push en iOS (expiración de suscripciones, `pushsubscriptionchange` poco confiable) requiere validación en dispositivos físicos reales, no solo documentación.
- **Fase 8 (piloto):** no hay patrón estándar de la industria para el rollout de una PWA a una fuerza laboral con dispositivos heterogéneos; es específico del contexto operativo de VivaGuest.

Fases con patrones ya bien documentados en este research (se puede saltar research-phase):
- **Fase 1 (schema + RLS):** verificado extensamente contra `.d.ts` y docs oficiales de Supabase; el schema completo con CHECKs, índices e invariantes ya está propuesto en ARCHITECTURE.md.
- **Fase 4 (PWA offline):** el patrón de cola idempotente con `client_event_id` + IndexedDB está completamente especificado en PITFALLS.md.
- **Fase 6 (financiero) y Fase 7 (retención):** patrones estándar de snapshot y soft-delete, sin incertidumbre de dominio.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | ALTA | Versiones verificadas contra npm registry el 2026-08-30; `.d.ts` de `@supabase/ssr` leídos directamente; formato iCal verificado contra feeds reales (830 VEVENTs) |
| Features | MEDIA-ALTA | Comparativa de features de la categoría es sólida (documentación de producto de vendors); el sentimiento real de operadores es BAJA confianza (turno.com bloquea fetch directo, sin acceso a foros de operadores reales) |
| Architecture | ALTA en schema/RLS/Storage/cron (docs oficiales de Supabase/Postgres/Next.js); MEDIA en el formato exacto del iCal (Airbnb no publica spec) |
| Pitfalls | MEDIA-ALTA | ALTA en Vercel/Supabase/Next.js/Web Push (docs oficiales); MEDIA en comportamiento de iCal (sin spec pública, evidencia de channel managers y foros) |

**Overall confidence:** MEDIA-ALTA. La incertidumbre no está en el stack ni en el schema (verificados de sobra) sino en el comportamiento exacto de una fuente de datos que ni Airbnb ni Booking.com documentan públicamente, y en un punto de contradicción directa entre los propios documentos de investigación (ver Conflictos #2).

### Gaps to Address

- **Captura de `.ics` reales de VivaGuest.** Es un prerequisito explícito de la Fase 2, no una tarea dentro de ella (ver "Paso 0 obligatorio" en PITFALLS.md). Sin esto no hay fixtures de test ni forma de validar el conflicto de estabilidad del `UID`.
- **Estabilidad del `UID` de Airbnb/Booking.** Contradicción directa entre documentos (ver Conflictos #2); debe resolverse empíricamente contra los feeds propios, con instrumentación desde el primer sync en producción (no se puede diseñar contra una suposición no verificable).
- **Comportamiento del scheduler en un deploy real.** La decisión de `pg_cron` + `pg_net` fan-out (ver Conflictos #1) debe probarse en staging con Vercel antes de comprometerse en el roadmap, incluyendo el comportamiento de `cron.job_run_details` como heartbeat.
- **Volumen real de fotos y latencia de subida en campo.** Las estimaciones de PITFALLS.md (56 MB/aseo sin comprimir, ~4 MB/aseo comprimido) son supuestos explícitos, no datos medidos; deben validarse en el piloto.

## Conflictos entre documentos

Los cuatro documentos de investigación se escribieron en paralelo y no se leyeron entre sí. Divergen en varios puntos que son decisiones de arquitectura reales, no matices de estilo. Cada uno se resuelve abajo con una recomendación explícita.

### 1. Dónde corre el scheduler de sincronización cada 30 minutos

**El desacuerdo:**
- **STACK.md** recomienda Vercel Cron en plan Pro (`vercel.json` con `*/30 * * * *`) apuntando a un Route Handler que procesa los 39 feeds con concurrencia limitada dentro de una sola invocación. Reserva `pg_cron` solo para la purga de retención.
- **ARCHITECTURE.md** recomienda `pg_cron` disparando cada 5 minutos, con fan-out vía `pg_net` de **una invocación HTTP por feed** hacia el mismo Route Handler de Next.js. `next_sync_at` solo avanza +30 min tras éxito; un fallo transitorio se reintenta en el siguiente tick de 5 min sin esperar media hora completa.
- **PITFALLS.md** no toma partido de forma definitiva: confirma que `*/30 * * * *` falla el deploy en Vercel Hobby, presenta las dos opciones como "válidas" y deja la decisión explícitamente para el roadmap, señalando que Supabase Cron "ya viene con historial de corridas" (`cron.job_run_details`), que es justo lo que hace falta para detectar un job muerto.

**Recomendación: construir el diseño de ARCHITECTURE.md — `pg_cron` cada 5 min + `pg_net` fan-out, una invocación por feed.**

Razones concretas:
1. **Aislamiento por construcción.** Con una invocación por feed, un feed colgado no puede consumir el `maxDuration` de los otros 38 (el escenario que STACK.md mismo advierte como riesgo del cron directo con 39 fetches secuenciales). `pg_net` es fire-and-forget, así que el dispatcher nunca se bloquea esperando.
2. **La objeción de STACK.md contra `pg_cron` no aplica aquí.** STACK.md rechaza `pg_cron` argumentando que obligaría a duplicar el parser de `node-ical` en una Edge Function Deno. Eso es cierto solo si el parseo corre *dentro* de Postgres/Deno. El diseño de ARCHITECTURE.md no hace eso: `pg_cron` solo dispara un `net.http_post` hacia el mismo Route Handler Node.js de Next.js que STACK.md ya propone. El parser sigue viviendo en un solo lugar, en TypeScript, con los mismos tipos y el mismo Zod.
3. **Elimina la dependencia de Vercel Pro para este job.** Como el disparo es un `net.http_post` ordinario hacia una URL pública (no una `vercel.json` cron job), la restricción de Vercel Hobby ("cron jobs limitados a 1x/día") no aplica: esa restricción es específica del *feature* de Vercel Cron, no de recibir HTTP requests. Esto es un ahorro de costo real ($20/mes/miembro) que ningún documento señaló explícitamente al comparar las opciones.
4. **`cron.job_run_details` da el heartbeat gratis.** PITFALLS.md identifica el fallo silencioso del cron (nadie se entera de que el job dejó de correr) como uno de los pitfalls más caros del sistema. Con Supabase Cron, ese historial de ejecuciones ya existe sin construir nada adicional; con Vercel Cron puro habría que construirlo a mano (tabla `sync_runs` + segundo mecanismo de vigilancia).

**Lo que se descarta de STACK.md:** el requisito de Vercel Pro como "costo obligatorio del proyecto" para este job específico. Puede seguir siendo deseable por otras razones (límites de `maxDuration`, ancho de banda), pero no es un bloqueante del scheduler.

---

### 2. Estabilidad del `UID` de Airbnb — contradicción directa, sin resolver

**El desacuerdo, textual:**
- **STACK.md** afirma verificación empírica contra 432 snapshots de un feed real de Airbnb (14 meses de historial versionado) y cita un caso concreto: un evento `Reserved` cuyo `DTEND` pasó de `20260830` a `20260902` **conservando el mismo `UID`**, presentado como evidencia directa de que "el `UID` ES ESTABLE ante cambios de fecha".
- **PITFALLS.md** dice, con esas palabras: *"La estabilidad del `UID` de Airbnb no está documentada oficialmente en ninguna parte y no pudo verificarse. Esta es la incertidumbre más grande de esta investigación."*
- **ARCHITECTURE.md** coincide con PITFALLS.md: no confía en el `UID` como identificador único y propone una identidad compuesta y jerárquica (`codigo_reserva` > `uid` > solapamiento de fechas) precisamente porque no puede darse por sentado que el `UID` sea estable.

Esto no es un matiz: son afirmaciones opuestas sobre el mismo hecho técnico, y el requisito de negocio "detectar extensiones mal creadas" depende directamente de la respuesta correcta.

**Resolución recomendada — sea cual sea el documento con la razón, el diseño no puede apostar a una sola fuente:**

1. **No usar el `UID` como identificador único del aseo, en ningún caso.** Esto ya es lo que recomiendan ARCHITECTURE.md y PITFALLS.md, y es la postura segura incluso si STACK.md tiene razón: el aseo se identifica por (`apartamento_id`, `fecha`), no por `UID`. Un cambio de `UID` con el mismo rango de fechas debe re-vincular el aseo existente, nunca cancelar+crear.
2. **Instrumentar la estabilidad del `UID` desde el primer sync en producción**, exactamente como propone PITFALLS.md: registrar cuándo un `UID` desaparece y otro aparece con el mismo rango de fechas en el mismo apartamento. En 2-4 semanas de operación real hay datos propios, no una muestra de terceros.
3. **Tratar la evidencia de STACK.md como una señal fuerte, no como un hecho cerrado.** El caso citado (432 snapshots, 4 de 75 UIDs mutando fechas con UID preservado) es evidencia real, pero de **un solo feed de un solo host**, no necesariamente representativo de las 39 propiedades de VivaGuest ni de si Airbnb aplica la misma política de forma consistente entre cuentas.
4. **Esto es una instrucción explícita del research, no solo una recomendación de diseño:** antes de programar la Fase 2 (motor de sync), hay que capturar `.ics` reales de varios apartamentos de VivaGuest y verificar directamente si el `UID` se mantiene estable ante cambios de fecha en la propia operación. Ningún documento de investigación —tampoco STACK.md, pese a su evidencia— sustituye la verificación contra los feeds reales del negocio.

---

### 3. Ubicación del código de confirmación de reserva

**No hay conflicto — los tres documentos coinciden, y es un punto de consenso fuerte que vale la pena registrar como tal:**

- Airbnb eliminó el nombre del huésped y el código de reserva del `SUMMARY` el 2019-12-01. Hoy el código (`HMXXXXXXXX`) vive únicamente dentro de la URL del campo `DESCRIPTION` (`Reservation URL: https://www.airbnb.com/hosting/reservations/details/HMXXXXXXXX`), y solo en eventos `Reserved` (los bloqueos del propietario no traen `DESCRIPTION`). Los tres documentos (STACK, ARCHITECTURE, PITFALLS) verifican esto de forma independiente y coinciden en el mismo patrón de extracción.
- **Booking.com no expone ningún código de confirmación equivalente.** El feed de Booking.com nunca trae `DESCRIPTION`. Los tres documentos coinciden en que la detección de "extensión mal creada por código único de reserva" es **implementable solo para Airbnb**; para Booking.com hay que degradar a una heurística de adyacencia de fechas + `UID`, de menor confianza, y aceptarlo como una limitación consciente de producto.
- **Único punto pendiente de verificación (no de desacuerdo):** ninguno de los tres documentos verificó este comportamiento contra un feed real de Booking.com de la operación de VivaGuest. STACK.md sí lo hizo contra un feed real de Booking (398 snapshots, cero `DESCRIPTION` en 1071 eventos), lo cual es evidencia fuerte, pero de un tercero, no de VivaGuest.

---

### 4. Metadatos EXIF en las fotos — conflicto de seguridad no resuelto

**El desacuerdo:**
- **STACK.md** recomienda explícitamente `preserveExif: true` en `browser-image-compression`, con el argumento de que el pipeline de canvas destruye el EXIF por defecto (incluida la orientación, que sin preservarse produce fotos rotadas). STACK.md sí marca esto como "decisión de producto pendiente", pero su código de referencia trae `preserveExif: true` activado.
- **PITFALLS.md**, en la tabla de "Security Mistakes", lista explícitamente **"Metadatos EXIF/GPS en las fotos"** como un riesgo de seguridad ("ubicación exacta de propiedades y patrones de movimiento del aseador") y da como prevención: *"La recompresión por canvas ya elimina EXIF. Verificarlo explícitamente en un test."* — es decir, da por hecho y por deseable que el EXIF se elimine.
- **ARCHITECTURE.md** no toma postura explícita sobre EXIF, pero su schema de `cleaning_photos` ya modela `taken_at`, `captured_lat`, `captured_lng` como **columnas propias**, lo que sugiere que los metadatos relevantes para el negocio (cuándo, dónde) se capturan como datos de aplicación, no dependiendo del EXIF de la imagen.

**Recomendación: NO preservar el EXIF. Recomprimir y descartarlo, siguiendo la postura de seguridad de PITFALLS.md.**

Razones:
1. El schema de ARCHITECTURE.md ya resuelve "fotos con metadatos" (el requisito del PROJECT.md) con columnas de aplicación (`taken_at`, `captured_lat/lng`, `uploaded_by`), no con EXIF de la imagen. No hace falta preservar EXIF para cumplir ese requisito.
2. El EXIF trae GPS de precisión de metro, que expone la ubicación exacta de las 39 propiedades y los patrones de movimiento de las aseadoras — un riesgo de seguridad físico, dado que el sistema ya maneja códigos de acceso a las mismas propiedades.
3. Sí hay que resolver el problema real que motivó `preserveExif: true` en STACK.md — la **orientación** de la foto. Eso se resuelve leyendo la orientación EXIF *antes* de comprimir (la propia librería expone `getExifOrientation()`) y aplicándola al canvas, sin necesidad de preservar el bloque EXIF completo en el archivo final.

**Punto secundario de inconsistencia (menor):** STACK.md y PITFALLS.md recomiendan salida JPEG para las fotos comprimidas; ARCHITECTURE.md, en la sección de Scaling Considerations, menciona WebP. El bucket de Storage en ARCHITECTURE.md ya permite ambos (`allowed_mime_types` incluye `image/jpeg` y `image/webp`), así que no es bloqueante, pero conviene fijar un solo formato de salida antes de la Fase 4 para no tener que soportar dos rutas de decodificación en el dashboard admin.

---

### 5. Estrategia offline de la PWA del aseador — desacuerdo sobre si es del MVP

**El desacuerdo:**
- **STACK.md** presenta el offline como una decisión de alcance con dos caminos: "Opción A (recomendado para el MVP)" — `NetworkFirst` de Serwist, solo lectura cacheada — y "Opción B (si A no alcanza)" — TanStack Query con cola de mutaciones sobre IndexedDB. STACK.md mismo marca su confianza aquí como MEDIA-ALTA porque "depende de qué tan estricto sea el requisito offline, que el PROJECT.md no cuantifica."
- **ARCHITECTURE.md** va en la dirección contraria a nivel de tooling: descarta explícitamente Serwist ("No hace falta Serwist... Serwist sólo aporta si se necesita caching offline, que está fuera de alcance. Añadirlo ahora es complejidad de build sin retorno") y propone un service worker escrito a mano solo para push.
- **PITFALLS.md** resuelve la ambigüedad que STACK.md deja abierta, con el pitfall de mayor severidad de adopción del documento (Pitfall 8, confianza ALTA): el offline **no es opcional ni diferible**. Describe en detalle el escenario de falla (aseadora en un ascensor/sótano sin señal, trabajo físico perdido porque vivía solo en memoria de la pestaña, "la app no sirve", vuelta a WhatsApp) y especifica una arquitectura completa obligatoria: escritura primero en IndexedDB siempre, cola de mutaciones idempotentes con `client_event_id`, UI nunca bloqueante, validación de "Terminé" contra estado local.

**Recomendación: construir la Opción B de STACK.md (cola de mutaciones + IndexedDB) como parte de la primera versión de la PWA, siguiendo el diseño detallado de PITFALLS.md — no la Opción A, y no diferirlo.**

Razones:
1. PITFALLS.md resuelve exactamente la incertidumbre que STACK.md señala como pendiente ("qué tan estricto es el requisito offline"): los apartamentos de VivaGuest están en edificios con sótanos, parqueaderos y ascensores sin señal, y el checklist con foto obligatoria por cuarto es precisamente el flujo largo que se pierde si el offline no existe. La condición de STACK.md para pasar a la Opción B ("si A no alcanza") ya se cumple por el propio contexto operativo descrito en PROJECT.md.
2. La postura de ARCHITECTURE.md de descartar Serwist por completo es la que hay que corregir, no la de mantener el offline fuera de alcance. Serwist sigue siendo útil para precachear el *app shell* de Next.js (assets con hash de build) tal como propone STACK.md; lo que hace falta además, y que ninguno de los dos documentos combina, es la cola de mutaciones con `idb` (ya recomendada en STACK.md como librería) siguiendo el diseño de PITFALLS.md. No son alternativas: el precache de Serwist resuelve "abrir la app sin señal", la cola de IndexedDB resuelve "trabajar sin señal".
3. El costo de construirlo bien desde el inicio es menor que el costo de reescritura que PITFALLS.md describe: pasar de un flujo síncrono a uno con cola local implica rehacer la capa de datos completa del cliente, y el trabajo de campo perdido durante la transición es lo que PITFALLS.md marca como **irrecuperable** en su tabla de estrategias de recuperación.

---

### 6. Tipo de dato para dinero: `bigint` vs `numeric(12,2)`

**El desacuerdo:** STACK.md dedica una sección completa a justificar `bigint` para todos los montos en COP, con una entrada explícita en "What NOT to Use": *"`numeric`/`float` para COP — `numeric` llega como string desde supabase-js; `float` redondea mal."* Sin embargo, el schema de referencia de ARCHITECTURE.md usa `numeric(12,2)` en `properties.tarifa_huesped`, `properties.pago_aseador`, `cleanings.tarifa_huesped`, `cleanings.pago_aseador` y `expenses.monto` — exactamente el tipo que STACK.md marca como prohibido.

**Recomendación: usar `bigint` (pesos enteros), siguiendo STACK.md, y ajustar el schema de ARCHITECTURE.md al implementarlo.**

El argumento de STACK.md es correcto y más específico sobre una consecuencia concreta en este stack: `supabase-js` devuelve columnas `numeric` como **string** en JavaScript (para no perder precisión), lo que rompe silenciosamente cualquier suma o resta en el cliente si el código asume `number`. El peso colombiano no tiene subunidad en circulación, así que no hay ninguna razón de dominio para pagar el costo de `numeric` (decimales que nunca se usan, y el riesgo de tipo en TypeScript). Este ajuste debe entrar en la Fase 1 (schema núcleo), antes de que exista cualquier consulta financiera.

## Decisiones que requieren al usuario

Lista numerada y deduplicada de las decisiones abiertas encontradas en los cuatro documentos. Cada una lista la decisión, las opciones, el default recomendado por este research, y qué se rompe si se decide mal.

1. **Metadatos EXIF en las fotos: ¿preservar o eliminar?**
   Opciones: preservar EXIF completo (incluye GPS) vs. recomprimir y descartarlo, conservando solo la corrección de orientación.
   Default recomendado: eliminarlo (ver Conflictos #4).
   Riesgo si se decide mal: preservarlo expone la ubicación GPS exacta de las 39 propiedades y los patrones de movimiento de las aseadoras en un sistema que ya maneja códigos de acceso físico.

2. **Naturaleza de `contacto_externo` (caso Bogotá 2, empresa externa contratada por VivaGuest).**
   Opciones: texto libre sin operación asociada (como está hoy en el CRUD) vs. crear un usuario real con notificaciones para la empresa externa.
   Default recomendado: mantener texto libre para el MVP, pero decidirlo explícitamente — ARCHITECTURE.md lo marca como "el hueco más grande del modelo": si `responsable_id` es null y solo hay `contacto_externo`, un aseo confirmado en Bogotá 2 no tiene a quién asignarse ni a quién notificar por push.
   Riesgo si se decide mal: aseos de Bogotá 2 confirmados que nunca llegan a nadie, silenciosamente.

3. **Biblioteca completa de tipos de cuarto y sus tareas de checklist.**
   Ya está marcado como abierto en PROJECT.md. Bloquea el seed de la Fase 1, no el schema en sí.
   Default recomendado: incluir pseudo-cuartos de exterior (terraza, piscina, jardín, BBQ) para cubrir las 2 casas del portafolio sin construir un editor.
   Riesgo si se decide mal: el checklist dinámico no cubre el 100% de las unidades y aparece como excepción manual desde el primer aseo real de una casa.

4. **Plazo de aviso antes del borrado automático por retención (`retention_notice_days`).**
   Ya marcado como abierto en PROJECT.md. Modelado en ARCHITECTURE.md como `app_settings`, default propuesto 15 días.
   Riesgo si se decide mal: un aviso demasiado corto no da tiempo al admin de activar `legal_hold` (ver decisión #5) antes de que el historial cruce el corte.

5. **Retención de 6 meses vs. valor probatorio en disputas: ¿construir `legal_hold` + cuarentena de 30 días, o aceptar el riesgo tal como está descrito en PROJECT.md?**
   Opciones: soft-delete con cuarentena y flag de retención legal por aseo (propuesta de PITFALLS.md) vs. borrado directo a los 6 meses sin excepción.
   Default recomendado: construir `legal_hold` y `deleted_at` en el schema inicial (Fase 1), aunque el job de borrado se implemente en la Fase 7 — agregarlos después obliga a migrar datos operativos.
   Riesgo si se decide mal: una disputa de huésped o propietario sobre daños de hace 5 meses pierde su evidencia fotográfica mientras se está discutiendo.

6. **Retención de 6 meses vs. historial de pagos: ¿el cálculo mensual se persiste como snapshot propio, o se deriva en vivo de los aseos?**
   Default recomendado: persistir un snapshot propio del cierre mensual (tabla separada), para que sobreviva al borrado de los aseos que lo sustentan.
   Riesgo si se decide mal: el pago de un mes cerrado deja de ser consultable a los 6 meses, exactamente cuando podría necesitarse para una auditoría o un reclamo de un aseador.

7. **Retención de 6 meses vs. backlog de desempeño de aseadores: ¿se conservan agregados (timestamps de Empecé/Terminé, eventos "no puedo") más allá de la ventana de 6 meses?**
   Default recomendado: decidirlo explícitamente ahora aunque el feature esté en backlog — los datos crudos ya se están capturando y el borrado automático los hace irrecuperables si nadie decide preservarlos.
   Riesgo si se decide mal: cuando se priorice el scorecard de desempeño (v2+), no habrá datos históricos con los que construirlo.

8. **Detección de extensión mal creada en Booking.com: ¿aceptar heurística de baja confianza, o excluir la detección para ese canal?**
   Opciones: aplicar la misma lógica de Airbnb (no funciona, Booking no expone código) vs. heurística de adyacencia de fechas + `UID` (menor confianza, con alerta explícita de "revisar") vs. no intentar la detección en Booking.
   Default recomendado: heurística de menor confianza con alerta explícita, dejando que la confirmación humana ya existente actúe como amortiguador.
   Riesgo si se decide mal: si se asume que funciona igual que en Airbnb, un aseador puede terminar entrando a un apartamento con el huésped todavía adentro por una extensión no detectada.

9. **Verificación de estabilidad del `UID` de Airbnb/Booking contra los feeds reales de VivaGuest.**
   No es una decisión de producto sino un bloqueante técnico: los documentos de investigación se contradicen entre sí (ver Conflictos #2) y ninguno verificó contra los feeds propios de VivaGuest.
   Default recomendado: instrumentar la estabilidad del `UID` desde el primer sync en producción y no apostar el diseño a ninguna de las dos afirmaciones sin datos propios.
   Riesgo si se decide mal: el motor de sync se diseña sobre un supuesto falso y produce cancelaciones o duplicados silenciosos de aseos confirmados.

10. **Cierre manual del aseo por el admin (P4 de FEATURES.md): ¿se construye, pese a rozar la exclusión "flujo de no-show del aseador"?**
    Default recomendado: construirlo — es un caso distinto (cerrar un registro que la realidad ya resolvió, no detectar una ausencia) y el caso de Bogotá 2 (empresa externa que no usa el sistema) lo hace casi seguro desde el primer mes.
    Riesgo si se decide mal: sin este escape hatch, el invariante "ningún aseo se pierde" se convierte en "ningún aseo se puede cerrar", y el dashboard se llena de ruido permanente.

11. **Vista imprimible/copiable del cálculo mensual (P5 de FEATURES.md): ¿se acepta pese a la exclusión "solo visible en pantalla"?**
    Default recomendado: sí, como hoja `@media print` o copiado en TSV — cero dependencias nuevas, no es exportación real, y evita que el admin vuelva a Excel a mano en cada cierre de mes.
    Riesgo si se decide mal: sin esto, el cierre de mes reintroduce el trabajo manual que el producto existe para eliminar, y el respaldo del pago desaparece a los 6 meses sin haber salido nunca del sistema.

12. **Semáforo de entregabilidad de push del lado del admin (P1 de FEATURES.md): ¿se construye en el MVP o se difiere?**
    Default recomendado: construirlo en la Fase 3/5 — es el mecanismo de recuperación humana ante el riesgo más alto del spec (push como único canal); sin él, un aseo confirmado que nunca llega al aseador no lo detecta nadie hasta que el huésped llega a un apartamento sucio.
    Riesgo si se decide mal: se difiere el semáforo y el primer fallo de entrega grave ocurre sin que nadie tenga forma de anticiparlo.

13. **Nivel de inversión en offline-first para la PWA del aseador desde el día uno.**
    Ya resuelto como recomendación en Conflictos #5, pero requiere aceptación explícita del usuario porque implica más trabajo de la Fase 4 de lo que un MVP mínimo sugeriría.
    Riesgo si se decide mal: construir la versión simple primero (solo lectura cacheada) y descubrir en la primera semana real que el trabajo de campo se pierde por falta de cola offline, con la consecuente pérdida de confianza del aseador.

14. **Plan de Vercel: ¿Hobby o Pro?**
    Con el scheduler resuelto vía `pg_cron` + `pg_net` (Conflictos #1), la restricción de cadencia de cron de Vercel Hobby deja de ser un bloqueante. Queda pendiente confirmar si Pro sigue siendo necesario por otras razones (límites de `maxDuration` para subida de fotos, ancho de banda).
    Default recomendado: arrancar evaluando Hobby dado que el scheduler ya no lo requiere; confirmar límites de función para el resto de los flujos antes de comprometerse.
    Riesgo si se decide mal: pagar Pro sin necesidad, o subestimar un límite de Hobby que sí afecta a otro flujo (ej. subida de fotos, que STACK.md ya resuelve evitando pasar por Route Handlers, mitigando este riesgo).

15. **"Último día laboral del mes" ¿excluye festivos colombianos, o solo fines de semana?**
    La función `last_business_day()` propuesta en ARCHITECTURE.md hoy solo excluye sábado/domingo.
    Default recomendado: confirmar con el negocio; si se necesitan festivos, requiere una tabla `holidays` adicional en la Fase 6.
    Riesgo si se decide mal: el cierre de mes cae en un día que la operación real no considera laboral, y el cálculo de pago se dispara en la fecha equivocada.

16. **Fase de piloto/rollout explícita: ¿arrancar por un cluster pequeño antes de Bogotá 1?**
    Default recomendado: sí — empezar por un cluster de 1 unidad (Medellín o Cartagena) con WhatsApp/Excel operando en paralelo durante 2 semanas, antes de tocar los 23 apartamentos de Bogotá 1.
    Riesgo si se decide mal: un fallo de adopción (instalación de PWA, permiso de push denegado de forma irreversible en iOS) golpea de una sola vez al cluster más grande y más crítico de la operación.

17. **Formato de imagen de salida para las fotos comprimidas: JPEG o WebP.**
    Punto menor de inconsistencia entre documentos (ver Conflictos #4); el bucket ya soporta ambos formatos.
    Default recomendado: JPEG, siguiendo la mayoría de las fuentes (STACK.md y PITFALLS.md) y por compatibilidad más amplia con dispositivos Android de gama baja.
    Riesgo si se decide mal: soportar dos rutas de decodificación distintas en el dashboard admin sin necesidad real.

## Sources

### Primary (HIGH confidence)
- `.planning/research/STACK.md` — versiones npm verificadas 2026-08-30, `.d.ts` de `@supabase/ssr` leídos directamente, 830 VEVENTs reales de Airbnb/Booking.com analizados
- `.planning/research/ARCHITECTURE.md` — schema, RLS, Storage, cron verificados contra docs oficiales de Supabase/Postgres/Next.js
- Supabase docs oficiales (RLS, auth server-side, Storage, Cron/pg_net) — citadas en los tres documentos técnicos
- Vercel docs oficiales (límites de Cron y Functions) — citadas en STACK.md y PITFALLS.md

### Secondary (MEDIUM confidence)
- `.planning/research/FEATURES.md` — comparativa de producto contra Turno, Breezeway, Operto Teams (documentación de vendor)
- `.planning/research/PITFALLS.md` — comportamiento de iCal de Airbnb/Booking (channel managers, anuncios de Airbnb, foros de hosts, sin spec pública)

### Tertiary (LOW confidence)
- Sentimiento real de operadores de la categoría (FEATURES.md) — solo BBB y una reseña independiente, sin acceso a foros de STR
- Muestra pública de iCal de Airbnb (`AyoubAchour/airbnb-ical-sample`) — verificada como **desactualizada/falsa** por los tres documentos técnicos, citada solo como advertencia de qué no usar como fixture

---
*Research completed: 2026-08-30*
*Ready for roadmap: yes, con los bloqueantes de la sección "Gaps to Address" resueltos antes de programar la Fase 2*
