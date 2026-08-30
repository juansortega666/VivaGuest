# Pitfalls Research

**Domain:** Plataforma de operación de aseos para renta corta (STR), dirigida por iCal de Airbnb/Booking
**Stack:** Next.js 15 App Router + TypeScript + Supabase (Postgres/Auth/Storage/RLS) + Vercel + PWA con Web Push (VAPID)
**Researched:** 2026-08-30
**Confidence:** MEDIA-ALTA. Alta en Vercel/Supabase/Next.js/Web Push (docs oficiales). Media en comportamiento de iCal de Airbnb/Booking: no hay especificación pública, la evidencia viene de proveedores de channel manager (Operto Teams, Beds24, BookingAutomation, OwnerRez), del anuncio de cambio de Airbnb del 2019-12-01 y de foros de hosts. Todo lo marcado MEDIA/BAJA debe validarse contra el feed real de un apartamento de VivaGuest antes de codificar.

> **Regla de oro de este documento:** el producto agenda el aseo el día en que el bloqueo TERMINA. Casi todos los pitfalls críticos de abajo son formas distintas de mover ese día un casillero, o de borrarlo. Cualquiera de ellas rompe el Core Value ("que ningún aseo se pierda").

---

## Paso 0 obligatorio antes de codificar el parser

Antes de escribir una sola línea del motor de sincronización hay que **capturar y versionar en repo el `.ics` crudo real** de al menos: 3 apartamentos de Airbnb con reserva futura, 1 con bloqueo del propietario, y 2 de Booking.com. Motivos:

1. Los "samples de Airbnb iCal" que circulan en GitHub y blogs son **falsos**. Ejemplo verificado en esta investigación: [AyoubAchour/airbnb-ical-sample](https://github.com/AyoubAchour/airbnb-ical-sample) se anuncia como "accurately represents the current format" y trae `SUMMARY:Maria Rodriguez (HMRDN4521)` con `EMAIL:` y `PHONE:` completos. Airbnb **eliminó nombre de huésped y código de reserva del SUMMARY el 2019-12-01**. Ese archivo describe un formato que no existe hace 6 años. Si el parser se construye contra él, falla el día uno contra el feed real.
2. Esos `.ics` reales, anonimizados, son los fixtures de los tests de regresión del parser. Sin ellos no hay forma de probar los casos de borde de abajo.

**Formato real esperado hoy (Airbnb, post-2019-12-01) — confirmar contra el feed capturado:**

```
BEGIN:VCALENDAR
PRODID:-//Airbnb Inc//Hosting Calendar 0.8.8//EN
CALSCALE:GREGORIAN
VERSION:2.0
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260403
DTEND;VALUE=DATE:20260406
UID:<opaco>@airbnb.com
SUMMARY:Reserved
DESCRIPTION:Reservation URL: https://www.airbnb.com/hosting/reservations/details/HMXXXXXXXX\nPhone Number (Last 4 Digits): 1234
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260410
DTEND;VALUE=DATE:20260412
UID:<opaco>@airbnb.com
SUMMARY:Airbnb (Not available)
END:VEVENT
END:VCALENDAR
```

---

## Critical Pitfalls

### Pitfall 1: El reconcile destructivo borra el aseo de HOY porque el feed de Airbnb solo trae fechas futuras

**Severidad:** ROMPE EL PRODUCTO
**Confianza:** ALTA (comportamiento documentado por Airbnb y por múltiples channel managers)

**What goes wrong:**
El requisito dice "el sistema cancela aseos automáticamente cuando la reserva desaparece". La implementación natural es: leer el feed, y cancelar todo aseo cuyo evento de origen ya no esté. Eso destruye la operación del día porque:

- **Airbnb no exporta el pasado.** "Past bookings are not imported through the iCal feed" y la exportación es "for future dates only" desde 2019-12-01. Una reserva cuyo `DTEND` es hoy o ayer desaparece del feed. Como el aseo se agenda exactamente en `DTEND`, el aseo de hoy queda huérfano en la corrida de las 06:00 y el reconcile lo cancela **mientras el aseador va camino al apartamento**.
- **Airbnb tampoco exporta más allá de ~365 días.** Una reserva a 400 días entra al feed sola, sin que nadie la haya creado. Simétricamente, nada garantiza que no se salga.
- **Un fetch fallido que devuelve `200` con `BEGIN:VCALENDAR`/`END:VCALENDAR` vacío** (o un cuerpo HTML de error, o un feed truncado) se parsea sin excepción como "cero eventos" y el reconcile cancela **todos** los aseos del apartamento de una sola pasada.

**Why it happens:**
El diff "estado deseado = feed" es el patrón correcto para configuración declarativa y el patrón equivocado para una fuente externa parcial, con ventana móvil, sin garantía de completitud y sin señal de error confiable. El iCal no es la verdad; es una vista recortada de la verdad.

**How to avoid:**
1. **Ventana de reconcile acotada.** Solo se consideran candidatos a cancelación los aseos con fecha `>= hoy + 1 día` (o `>= ahora + N horas`, N ≥ 12). Nada con fecha ≤ hoy se toca jamás por diff automático. Un aseo de hoy solo se cancela por acción explícita del admin.
2. **Guardarraíl de cambio masivo.** Si una corrida propone cancelar más del 20% de los aseos futuros de un apartamento, o cancelar y no crear ninguno, la corrida **no aplica nada**: marca el feed como sospechoso y alerta al admin. Un apartamento que pasa de 8 reservas a 0 es un fallo de red, no una cancelación real.
3. **Validación estructural antes de aplicar.** El fetch es válido solo si: HTTP 200, `Content-Type` compatible, el cuerpo empieza con `BEGIN:VCALENDAR`, cierra con `END:VCALENDAR`, y parsea sin errores. Cuerpo vacío o cero `VEVENT` = "sospechoso", no "cero reservas". Se guarda el hash del cuerpo crudo por corrida.
4. **Persistir el evento, no derivarlo.** Cada `VEVENT` se guarda en una tabla `calendar_events` con su crudo, su `UID`, su hash, `first_seen_at`, `last_seen_at`, `missing_since`. El aseo referencia el evento. Un evento que desaparece marca `missing_since` y solo cancela el aseo después de estar ausente en **2 corridas consecutivas** y estando fuera de la ventana protegida.
5. **Idempotencia real:** el upsert va por clave natural del aseo (`apartamento_id`, `fecha`, `tipo='normal'`), no por `UID`. Combinado con la restricción de "máximo 1 aseo activo por apartamento por fecha", eso ya es un índice único parcial en Postgres.

**Warning signs:**
- El log de sync muestra cancelaciones a primera hora de la mañana.
- Un apartamento acumula pares cancelar/crear del mismo aseo en corridas sucesivas (churn).
- La tabla de aseos cancelados crece más rápido que la de creados.

**Phase to address:** Fase de motor de sincronización iCal (inmediatamente después de schema+RLS).

---

### Pitfall 2: Off-by-one en `DTEND` — el aseo cae un día antes o un día después

**Severidad:** ROMPE EL PRODUCTO
**Confianza:** ALTA (RFC 5545 + comportamiento observado de Airbnb)

**What goes wrong:**
Tres errores distintos que producen el mismo síntoma (aseador en el apartamento el día equivocado):

1. **`DTEND` es exclusivo por RFC 5545.** Para una reserva del 3 al 6 de abril, Airbnb emite `DTSTART;VALUE=DATE:20260403` y `DTEND;VALUE=DATE:20260406`. Las noches ocupadas son 3, 4 y 5. **El día libre, y por tanto el día del aseo, es exactamente `DTEND` = 6 de abril.** El error clásico es "el último día del bloqueo es `DTEND - 1`, luego el aseo es el `DTEND - 1`": eso pone al aseador en el apartamento con el huésped todavía adentro. El error inverso (`DTEND + 1`) llega un día tarde, con el nuevo huésped adentro.
2. **La librería devuelve un `Date` de JavaScript.** `node-ical` e `ical.js` convierten `VALUE=DATE:20260406` a un objeto `Date`. Dependiendo de la versión y del `TZ` del proceso, eso puede ser `2026-04-06T00:00:00Z` o `2026-04-06T00:00:00-05:00`. Si después se hace `.toISOString().slice(0,10)` en un servidor que corre en UTC (Vercel y Supabase corren en UTC por defecto), un valor construido en hora local de Bogotá se convierte a `2026-04-06T05:00:00Z` → sigue siendo día 6, OK. Pero al revés, si se construye en UTC y se formatea con `toLocaleDateString('es-CO', {timeZone:'America/Bogota'})`, `2026-04-06T00:00:00Z` es `2026-04-05` en Bogotá → **un día antes**. Este es el bug documentado transversalmente en las librerías iCal.
3. **Eventos con `DATE-TIME` en vez de `DATE`.** Airbnb usa `VALUE=DATE` (todo el día). Pero no todos los feeds lo hacen: un feed hecho a mano, un Google Calendar intermedio, o un canal que exporte con `TZID` produce `DTEND;TZID=Europe/Madrid:20260406T110000`. Leído como UTC, cruza medianoche y desplaza el día. Está documentado como causa #6 de feeds "que sincronizan pero mal".

**How to avoid:**
1. **Nunca usar `Date` para la fecha del aseo.** El parser extrae la cadena `YYYYMMDD` cruda del `VALUE=DATE` y la convierte a un tipo `date` de Postgres directamente, sin pasar por `Date` ni por ninguna aritmética de zona horaria. La fecha del aseo es `date`, no `timestamptz`.
2. **Regla explícita y única en el código, con nombre:** `fecha_aseo = DTEND` cuando `DTEND` es `VALUE=DATE`. Un solo lugar en el código. Documentada con el comentario del RFC.
3. **Rama separada y explícita para `DATE-TIME`:** si el `VEVENT` trae `DATE-TIME`, se normaliza a `America/Bogota` **primero** y se toma la fecha calendario de ese instante. Nunca la fecha del instante en UTC.
4. **Test de regresión obligatorio con el proceso corriendo en `TZ=UTC`**, no en la máquina del dev en Bogotá. Casos mínimos: reserva de 1 noche, reserva que cruza fin de mes, reserva que cruza fin de año (`20251229`→`20260103`), evento `DATE-TIME` con `TZID` ajeno.
5. **`process.env.TZ = 'UTC'` fijado explícitamente** en el runtime del job, para que el bug se manifieste en CI y no en producción.

**Warning signs:**
- El aseo aparece el mismo día del último checkout en el dashboard (debería ser el día siguiente a la última noche).
- Las fechas se ven correctas en `next dev` en Bogotá y corridas en Vercel.
- Un aseo de una reserva de 1 noche tiene la misma fecha que el check-in.

**Phase to address:** Motor de sincronización iCal. Es criterio de aceptación de la fase, no un detalle.

---

### Pitfall 3: Generar aseos para bloqueos del propietario ("Airbnb (Not available)")

**Severidad:** DEGRADA LA OPERACIÓN (grave; genera trabajo fantasma y desconfianza en el sistema)
**Confianza:** MEDIA-ALTA

**What goes wrong:**
El feed de Airbnb mezcla en el mismo `VCALENDAR` tres cosas: reservas reales, bloqueos manuales del propietario, y bloqueos automáticos del sistema (ventana de reserva, días de preparación entre reservas). Si el parser trata todo `VEVENT` como reserva:

- Se generan aseos para semanas que el propietario bloqueó porque él mismo va a usar el apartamento.
- Se generan aseos al final de cada bloque de "booking window", que puede ser un bloque de 300 días.
- El admin recibe una bandeja "Sin confirmar" llena de basura, deja de mirarla, y el día que aparece un aseo real ahí lo pasa por alto. **Ese es el modo de falla que mata el Core Value: no es que falle una vez, es que entrena al admin a ignorar la señal.**

**Cómo se distinguen (verificar contra los feeds capturados):**

| Canal | Reserva real | Bloqueo |
|---|---|---|
| Airbnb | `SUMMARY:Reserved` + `DESCRIPTION` con `Reservation URL: .../details/HMXXXXXXXX` | `SUMMARY:Airbnb (Not available)` (variantes históricas: `Not available`, `Airbnb (Not Available)`), **sin** `Reservation URL` en `DESCRIPTION` |
| Booking.com | `SUMMARY:Reserved` (o similar), `UID:<id>@booking.com` | Sin marcador dedicado documentado. Operto Teams reporta que Booking.com y VRBO "lack specific block indicators"; clasifican como bloqueo cuando el texto contiene "Not available" o "Blocked" |

**How to avoid:**
1. **Whitelist, no blacklist.** Un evento genera aseo **solo si** cumple una condición positiva de "es reserva". Para Airbnb: presencia de `Reservation URL` en el `DESCRIPTION`. Todo lo demás se persiste como `bloqueo` y no genera nada. Un evento no clasificable se guarda como `desconocido` y **alerta al admin**, no se descarta ni se procesa.
2. **Case-insensitive y tolerante a espacios** en la comparación de `SUMMARY`. Airbnb ha usado "Not available" y "Not Available".
3. **Booking.com necesita heurística explícita y validada con feed real** antes de confiar en ella. Si en los 2 apartamentos de Booking no se puede distinguir bloqueo de reserva, la decisión de producto es: tratar todo Booking como reserva y dejar que el admin descarte en la confirmación (el paso de confirmación humana ya existe y es el amortiguador natural). Esa decisión debe ser consciente, no accidental.
4. **Umbral de duración como señal secundaria, nunca primaria:** un bloque de más de 30 noches es casi con seguridad un bloqueo, no una reserva. Sirve para alertar, no para clasificar en silencio.

**Warning signs:** Aseos generados en apartamentos que el admin sabe cerrados. Bloques de duración absurda (200+ noches) en la bandeja Sin confirmar. Bandeja Sin confirmar con más de ~10 items sin resolver por más de 24h.

**Phase to address:** Motor de sincronización iCal.

---

### Pitfall 4: Apoyar la identidad de la reserva en el `UID` del iCal

**Severidad:** ROMPE EL PRODUCTO (rompe el requisito de detección de extensiones y produce duplicados)
**Confianza:** MEDIA. **La estabilidad del `UID` de Airbnb no está documentada oficialmente en ninguna parte y no pudo verificarse.** Esta es la incertidumbre más grande de esta investigación.

**What goes wrong:**
El requisito "detectar extensiones mal creadas por código único de reserva" empuja a usar un identificador estable. Los dos candidatos fallan de forma distinta:

- **`UID`:** es opaco (`<hash>@airbnb.com`). No se pudo confirmar que Airbnb lo mantenga estable cuando el huésped modifica fechas, cuando el host la altera, o cuando la reserva se cancela y se rehace. Si el `UID` cambia con la modificación, un naive "por `UID`" ve la reserva vieja desaparecer y una nueva aparecer → cancela el aseo confirmado y crea uno sin confirmar. Si el `UID` NO cambia pero las fechas sí, y el código solo compara `UID`, la extensión pasa desapercibida.
- **Código de confirmación (`HMXXXXXXXX`):** **no está en el `SUMMARY`** desde 2019-12-01. Está embebido en la URL del `DESCRIPTION` (`.../hosting/reservations/details/HMXXXXXXXX`). Es decir: existe, pero hay que extraerlo por regex de una URL, que es un contrato no documentado que Airbnb puede cambiar sin avisar (ya lo hizo dos veces: 2019, e incidente de abril 2019 donde el feed perdió datos por 2 días y volvió solo).
- **Booking.com no expone un código de confirmación equivalente.** La misma lógica de "extensión mal creada" no se puede aplicar simétricamente a los dos canales.

**How to avoid:**
1. **Identidad compuesta y jerárquica.** Guardar los tres: `uid`, `codigo_reserva` (extraído del `DESCRIPTION` si existe, nullable), y la clave natural (`apartamento_id` + `dtstart` + `dtend`). El matching entre corridas se hace por prioridad: `codigo_reserva` > `uid` > solapamiento de rango de fechas en el mismo apartamento.
2. **El aseo nunca se identifica por el `UID`.** El aseo se identifica por (`apartamento_id`, `fecha`). Un cambio de `UID` con la misma fecha resultante **no** debe producir cancelar+crear; debe re-vincular el mismo aseo al evento nuevo, preservando el estado y la confirmación del admin. Esto es lo que evita perder confirmaciones del admin por ruido de la fuente.
3. **La detección de "extensión mal creada" se basa en adyacencia, no solo en el código.** Dos eventos del mismo apartamento donde `DTEND` del primero == `DTSTART` del segundo, con códigos de reserva distintos, es exactamente el patrón de "extensión creada como reserva nueva". Alertar y dejar que el humano decida (el requisito ya pide doble chequeo humano). Si además los códigos coinciden, la alerta es de mayor confianza.
4. **Instrumentar la estabilidad del `UID` desde el día uno.** El motor registra cuando un `UID` desaparece y otro aparece con el mismo rango de fechas. A las dos semanas hay datos reales para saber si Airbnb rota `UID`s. No se puede diseñar contra una suposición no verificable.

**Warning signs:** Aseos confirmados que vuelven a "Sin confirmar" sin que nadie los haya tocado. Historial de un apartamento con eventos duplicados del mismo rango.

**Phase to address:** Motor de sincronización iCal (persistencia del evento) + fase de alertas del dashboard.

---

### Pitfall 5: El cron de 30 minutos no es desplegable en Vercel Hobby y muere en silencio en cualquier plan

**Severidad:** ROMPE EL PRODUCTO (bloqueante de despliegue) + ROMPE EL PRODUCTO (fallo silencioso)
**Confianza:** ALTA (docs oficiales de Vercel, actualizadas 2026-07-15)

**What goes wrong:**

1. **Bloqueante duro:** Vercel Hobby limita los cron jobs a **una ejecución por día**, y una expresión como `*/30 * * * *` **falla el deploy** con el error "Hobby accounts are limited to daily cron jobs". El requisito "leer calendarios cada 30 min" es literalmente indesplegable en Hobby. Además, incluso el cron diario de Hobby tiene precisión de ±59 minutos. Consecuencia: **Vercel Pro es un costo obligatorio del proyecto ($20/mes/miembro), o el scheduler no vive en Vercel.**
2. **Fallo silencioso:** el spec alerta cuando un *feed* deja de responder, pero no cuando el *job* deja de correr. Si el cron se cae (deploy roto, función que revienta al inicio, quota agotada, `CRON_SECRET` rotado), **nadie se entera**: los feeds nunca se marcan caídos porque nunca se consultan, y el dashboard simplemente deja de generar aseos nuevos. Esto se descubre cuando un huésped llega a un apartamento sucio. Es el fallo más caro del sistema y el más fácil de prevenir.
3. **Solapamiento:** con 39 feeds secuenciales y un feed lento o colgado, la corrida puede pasarse de los 30 minutos y solapar con la siguiente. Dos corridas concurrentes haciendo reconcile sobre el mismo apartamento producen doble cancelación o doble creación.
4. **Timeout:** el máximo de una Vercel Function es 300s en Hobby, 300s por defecto en Pro (hasta 800s configurable). 39 fetches HTTP secuenciales contra Airbnb, con uno que tarda 30s en hacer timeout, se come el presupuesto rápido.

**How to avoid:**
1. **Decidir el scheduler explícitamente en el roadmap, no por defecto.** Dos opciones válidas:
   - **Vercel Pro + `vercel.json` cron** apuntando a una Route Handler protegida por `CRON_SECRET`. Costo: $20/mes.
   - **Supabase Cron (`pg_cron`)**, que soporta granularidad desde 1 segundo, registra cada ejecución y su estado en `cron.job_run_details`, y puede disparar HTTP a la Route Handler o correr una Edge Function. Límites: máx. 8 jobs concurrentes, recomendado ≤10 min por job. Esta opción **ya viene con historial de corridas**, que es exactamente lo que falta para el punto 2.
2. **Heartbeat / dead man's switch.** Cada corrida escribe en una tabla `sync_runs` (`started_at`, `finished_at`, `feeds_ok`, `feeds_error`, `aseos_creados`, `aseos_cancelados`). Un segundo mecanismo independiente (un check externo tipo cron-monitor, o un job de Supabase que corre cada hora) alerta al admin si **no hay ninguna corrida exitosa en los últimos 90 minutos**. La alerta de "sync muerto" debe estar en el mismo panel de alertas que las demás, con la misma jerarquía.
3. **Lock de ejecución en Postgres:** `pg_try_advisory_lock` al inicio de la corrida. Si no se obtiene, la corrida sale inmediatamente y lo registra. Cero solapamiento, sin infraestructura extra.
4. **Fetch con `AbortController` y timeout duro de 10s por feed**, ejecutados con concurrencia limitada (p.ej. 5 a la vez). 39 feeds con concurrencia 5 y timeout 10s tienen un peor caso acotado de ~80s.
5. **Un feed que falla no aborta la corrida.** Cada feed se procesa en su propio `try/catch` y su resultado se registra individualmente. El fallo de un apartamento no puede impedir la sincronización de los otros 38.
6. **Cold start:** no es crítico a esta escala, pero el job debe ser idempotente y tolerante a reintentos, porque el cron de Vercel no garantiza exactamente-una-vez.

**Warning signs:** `sync_runs` sin filas nuevas. Bandeja "Sin confirmar" sospechosamente vacía. `finished_at` nulo en la última corrida (murió a mitad).

**Phase to address:** Fase de motor de sincronización (lock, timeouts, `sync_runs`) + fase de alertas del dashboard (heartbeat). La decisión Vercel Pro vs Supabase Cron debe tomarse en el roadmap, antes de la primera línea de código del job.

---

### Pitfall 6: Los códigos de acceso de las propiedades leídos por el aseador equivocado

**Severidad:** ROMPE EL PRODUCTO (incidente de seguridad con consecuencia física; 90% de las unidades tienen cerradura inteligente)
**Confianza:** ALTA (docs oficiales de Supabase)

**What goes wrong:**
El código de acceso es el dato más sensible del sistema: da entrada física a un apartamento con huéspedes y pertenencias adentro. Los caminos de fuga son cinco y ninguno es evidente:

1. **RLS habilitado pero sin política = todo vacío**, que se "arregla" desactivando RLS o usando `service_role`. Supabase lo dice explícito: "Once RLS is enabled, no data is accessible through the API when using a publishable key, until you create policies." La tentación de "temporalmente lo hago con service_role" es la vía más común a la fuga.
2. **`service_role` en el bundle del cliente.** Cualquier variable con prefijo `NEXT_PUBLIC_` termina en el JS que se descarga al navegador. Una `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` es una llave maestra que bypassea RLS, publicada. Es un error de una sola letra.
3. **Fuga por join.** Una política correcta en `aseos` no protege `apartamentos`. Si el aseador puede hacer `select('*, apartamento:apartamentos(*)')` y `apartamentos` tiene una política permisiva ("cualquier autenticado puede leer apartamentos"), **el aseador lee el código de acceso de los 39 apartamentos**, incluidos los que nunca le asignaron. La política tiene que vivir en la tabla que contiene el dato sensible.
4. **Aseador desactivado que conserva el JWT.** El requisito exige invalidación inmediata. Marcar `activo = false` en una tabla NO invalida un access token ya emitido: sigue siendo válido hasta que expire (por defecto 1 hora) y el refresh puede seguir funcionando. Hay que hacer las dos cosas: revocar en Auth (`admin.signOut(user_id, 'global')` / borrar sesiones) **y** que toda política RLS incluya la condición de "aseador activo".
5. **La política del código no está separada del resto del apartamento.** El aseador necesita ver dirección, cuartos e instrucciones. No necesita ver tarifas, rentabilidad, ni el código de un apartamento que no le toca hoy.

**How to avoid:**
1. **RLS habilitado en el momento de crear cada tabla, en la misma migración.** No hay ventana en la que una tabla exista sin RLS. Un test automatizado en CI que falle si alguna tabla en `public` tiene `relrowsecurity = false`.
2. **El código de acceso se expone por vista/RPC, nunca por `select` directo a la columna.** Una función `security definer` `get_codigo_acceso(aseo_id)` que devuelve el código **solo si**: el aseo está asignado al `auth.uid()` que llama, el aseador está activo, y el aseo está en un estado y una fecha en los que el acceso tiene sentido (p. ej. el día del aseo). Cada llamada se audita en una tabla `access_code_reads`. Con 8 aseadores y decenas de aseos/día, auditar cada lectura cuesta nada y vale muchísimo en una disputa.
3. **Política escrita con `TO authenticated`** siempre, y con `(select auth.uid())` envuelto en `select` — Supabase documenta que esto dispara un `initPlan` que cachea el resultado por sentencia en vez de evaluarlo por fila.
4. **Índice en toda columna que aparezca en un `USING`.** `aseos(aseador_id)`, `aseos(fecha)`, `apartamentos(responsable_id)`. Sin índice, la política convierte cada lectura en un seq scan.
5. **Evitar recursión (`42P17`).** No escribir políticas de `aseadores` que consulten `aseos` y políticas de `aseos` que consulten `aseadores`. La comprobación de rol y de "activo" se hace con una función `security definer` (o con un custom claim en el JWT), no con un subselect a una tabla con RLS.
6. **Regla dura: `SUPABASE_SERVICE_ROLE_KEY` sin prefijo `NEXT_PUBLIC_`, solo importada desde archivos marcados con `import 'server-only'`.** Un check en CI que haga grep del bundle de `.next` buscando el prefijo de la llave.
7. **Suite de tests de RLS con usuarios reales**, no revisión visual: crear aseador A y aseador B, y afirmar que B recibe 0 filas al pedir el aseo de A y error al pedir su código. Este test se escribe **en la fase de schema**, antes de que exista UI.

**Warning signs:** Cualquier consulta del lado del aseador que use `service_role`. Un `select('*')` sobre `apartamentos` en código del rol aseador. Un `.env.local` con `NEXT_PUBLIC_` y la palabra `service`.

**Phase to address:** Fase 1, schema + migraciones + RLS. El constraint del proyecto ("schema antes que UI") existe precisamente para esto y hay que respetarlo.

---

### Pitfall 7: Push como único canal, sin plan para cuando el push no llega

**Severidad:** ROMPE EL PRODUCTO
**Confianza:** ALTA

**What goes wrong:**
El spec elimina WhatsApp y SMS y deja push como canal único hacia una fuerza laboral de aseadoras domésticas con teléfonos heterogéneos. Los modos de falla del Web Push no son excepciones raras: son el caso base.

| Modo de falla | Detalle verificado | Recuperable en la app |
|---|---|---|
| iOS sin instalar en pantalla de inicio | El `PushManager` **no existe** en una pestaña de Safari. Solo funciona en una web app añadida a la pantalla de inicio | No, requiere que el usuario instale |
| iOS en la UE | Apple removió el soporte de PWA standalone en la UE por el DMA; ahí no hay push. **No aplica a Colombia**, pero sí si alguna aseadora viaja o usa un perfil regional raro | No |
| Permiso denegado | En iOS, si el usuario toca "No permitir", **hay que borrar y volver a añadir la app a la pantalla de inicio**. No hay API para volver a preguntar | **No.** Es terminal |
| Prompt sin gesto de usuario | `Notification.requestPermission()` fuera de un handler de click se ignora o bloquea en silencio | Sí, es un bug de código |
| Suscripción expira sola | Reportes consistentes de endpoints de iOS que mueren a las 1-2 semanas. `pushsubscriptionchange` **no se dispara de forma confiable en iOS** | Solo si la app lo detecta al abrirse |
| Endpoint muerto en el servidor | El push service responde **410 Gone** (suscripción revocada/expirada) o **404 Not Found** (endpoint inválido) | Sí, si el backend los procesa |
| Optimización de batería Android | Xiaomi, Huawei, Oppo, Samsung matan el proceso del navegador. La entrega se retrasa horas o no llega. Chrome puede bloquear si el usuario no ha abierto la PWA recientemente | Parcial |
| Payload demasiado grande | El mínimo garantizado es 4096 bytes; vía puente FCM puede bajar a ~2744 bytes tras base64. `413` si se pasa | Sí |
| Almacenamiento evaporado en iOS | WebKit borra almacenamiento escribible por script tras 7 días **de uso** sin interacción. Las web apps de pantalla de inicio tienen su propio contador, pero no están exentas del mecanismo | Parcial |

**Consecuencia real:** un aseo se asigna en firme, el push no llega, nadie lo sabe, el apartamento queda sucio. El sistema cree que hizo su trabajo.

**How to avoid (sin agregar WhatsApp/SMS):**
1. **La entrega push NUNCA es la fuente de verdad.** El canal real es **la lista de aseos asignados dentro de la PWA**. El push es solo un acelerador. La PWA debe ser útil aunque el push nunca funcione: el aseador abre la app y ve su día. Esto ya está alineado con el requisito "el aseador ve la lista de aseos asignados".
2. **Instalación como paso de onboarding bloqueante y guiado.** Una pantalla `/instalar` que detecta `window.matchMedia('(display-mode: standalone)').matches === false` y muestra instrucciones **con capturas reales** diferenciadas por iOS (Compartir → Añadir a pantalla de inicio) y Android (menú → Instalar app). Sin esto, la mitad de las aseadoras no completa la instalación sola.
3. **Pedir permiso tarde y con contexto, nunca al cargar.** El prompt se dispara desde un botón explícito ("Activar avisos de aseos"), en una pantalla que ya explicó para qué sirve. Como en iOS la negación es irreversible, **un prompt prematuro quema al usuario para siempre**. Regla: no pedir permiso hasta que el aseador haya visto al menos un aseo real en su lista.
4. **Semáforo de salud de notificaciones en el dashboard del admin.** Por cada aseador: instalada sí/no, permiso concedido/denegado/pendiente, suscripción viva, último push entregado, último `open` de la app. Un aseador con asignaciones y sin suscripción viva es una **alerta** en el panel del admin, con la misma jerarquía que las demás. El admin es el mecanismo de recuperación: llama por teléfono. Eso no es "agregar un canal", es reconocer que el teléfono ya existe.
5. **Limpieza de suscripciones en el envío:** ante `404` o `410`, borrar la suscripción de la BD inmediatamente y marcar al aseador como "sin canal". Ante `413`, el payload es demasiado grande: mandar solo un id y que el service worker haga fetch del contenido.
6. **Re-suscripción defensiva en cada arranque de la app.** Como `pushsubscriptionchange` no es confiable en iOS, en cada carga de la PWA se llama `registration.pushManager.getSubscription()`; si es `null` o el endpoint difiere del guardado, se re-suscribe y se hace upsert en el servidor. Esto resuelve la expiración silenciosa sin intervención del usuario.
7. **Confirmación de recepción.** El service worker, al recibir el push, hace un `fetch` de acuse al backend. Un aseo asignado hace >30 min sin acuse ni apertura de app escala a alerta del admin. Esto convierte un fallo invisible en uno visible.
8. **Recuperación del permiso denegado en iOS:** documentar y mostrar en la app el procedimiento exacto (borrar el ícono, volver a añadir desde Safari). Es feo, pero es el único camino y la aseadora no lo va a deducir sola.
9. **`urgency: 'high'`** en los envíos operativos, y `TTL` corto (p. ej. 6 horas) — un aviso de aseo entregado al día siguiente es peor que no entregado.

**Warning signs:** Aseadores con aseos asignados y `push_subscription = null`. Tasa de acuse por debajo de ~90%. Aseos que pasan de asignado a "Empecé" con latencia de horas.

**Phase to address:** Fase de PWA del aseador (instalación, gesto, re-suscripción) + fase de alertas del dashboard (semáforo y escalamiento).

---

### Pitfall 8: La PWA asume conectividad en "Empecé", el checklist y "Terminé"

**Severidad:** ROMPE EL PRODUCTO (en la práctica: el aseador pierde el trabajo de una hora y deja de usar la app)
**Confianza:** ALTA

**What goes wrong:**
Los apartamentos están en edificios; muchos baños, sótanos y parqueaderos no tienen señal. La secuencia típica del fallo:

1. La aseadora pulsa "Empecé" en el ascensor. El POST se cuelga. El botón queda en spinner. Vuelve a pulsar. Cuando hay señal, se registran dos inicios.
2. Marca 12 items del checklist con foto. Cada item hace un POST. Los del baño fallan. La UI no lo dice claramente o lo dice y ella sigue.
3. Pulsa "Terminé". El backend rechaza porque faltan items del checklist que ella sí hizo. **No hay forma de recuperarlos: viven solo en la memoria de la pestaña.** Si el sistema operativo mató la pestaña por memoria (habitual en Android de gama baja con la cámara abierta), el trabajo se perdió.
4. La aseadora concluye que "la app no sirve" y vuelve a WhatsApp. Ese es el fin del proyecto, no un bug.

Agravante: **la Background Sync API no existe en iOS Safari** y no va a existir pronto. No se puede depender de ella.

**Minimum viable offline story (lo que NO se puede recortar):**
1. **Todo lo que el aseador produce se escribe primero en IndexedDB, siempre, incluso con señal.** El estado local es la fuente de verdad de la sesión de trabajo. La red es un efecto secundario.
2. **Cola de mutaciones idempotentes.** Cada acción ("Empecé", "item X completado", "Terminé", "reporte de daño") lleva un `client_event_id` (UUID generado en el cliente) y un timestamp del cliente. El backend hace upsert por `client_event_id`. Reintentar 5 veces es inofensivo. Esto también resuelve el doble tap del punto 1.
3. **Las fotos van a la cola como `Blob` en IndexedDB**, ya comprimidas (ver Pitfall 9), y se suben con reintento y backoff.
4. **La UI nunca bloquea.** Marcar un item es instantáneo y optimista. Un indicador global muestra "N cambios sin enviar" y desaparece al vaciarse la cola.
5. **"Terminé" se valida contra el estado LOCAL, no contra el servidor.** Si el checklist está completo localmente, el aseo se marca terminado localmente y la cola se drena en segundo plano. El servidor recibe el evento cuando pueda. El aseador puede irse del apartamento.
6. **App shell cacheada por el service worker** para que abrir la app sin señal muestre la lista de hoy (precargada) y no un dinosaurio.
7. **Background Sync como mejora progresiva, no como requisito.** Se registra si existe (`'sync' in registration`); si no, se drena la cola en `visibilitychange`, en `online` y con un intervalo mientras la app está en primer plano.

**Qué pasa si se salta:** funciona en la demo con wifi, falla en la primera semana real, y la pérdida de confianza es irreversible porque el trabajo perdido es trabajo físico ya hecho.

**Warning signs:** Aseos en estado "En curso" que nunca cierran. Checklists parcialmente completos. Reportes verbales de "se me borró". Duplicados de "Empecé".

**Phase to address:** Fase de PWA del aseador. **El offline no es una fase posterior**: rehacer un flujo síncrono a uno con cola local es reescribir la capa de datos del cliente entera.

---

### Pitfall 9: Fotos sin comprimir — el problema no es la factura de Supabase, es el plan de datos de la aseadora

**Severidad:** ROMPE EL PRODUCTO (adopción) / ANNOYANCE (costo)
**Confianza:** ALTA en límites y precios (docs oficiales). MEDIA en los supuestos de volumen (son estimaciones, no datos medidos).

**What goes wrong:**
Subir la foto tal cual sale de la cámara. Cuatro consecuencias, ordenadas de peor a menos grave:

1. **El costo de datos móviles del aseador.** Ver cálculo abajo: ~56 MB por aseo sin comprimir. Una aseadora de Bogotá 1 que hace 4 aseos en un día quema **~224 MB de su propio plan prepago, cada día**. Nadie va a decir que no usa la app por eso; simplemente va a dejar de subir fotos, o va a esperar a llegar a casa al wifi, que es lo mismo que no tener evidencia.
2. **El tiempo de subida.** 56 MB sobre un enlace móvil real de ~500 kbps efectivos en un edificio son **~15 minutos**. Con la UI bloqueada, es inaceptable. Con la UI no bloqueada pero la pestaña susceptible de morir, se pierde.
3. **El límite de 4.5 MB del body de Vercel Functions.** Si la foto se sube pasando por una Route Handler de Next.js, una foto de 5 MB devuelve `413 FUNCTION_PAYLOAD_TOO_LARGE`. Es un límite duro de la plataforma.
4. **HEIC.** Chrome no puede decodificar HEIC/HEIF en ninguna plataforma (Google nunca licenció HEVC), y `canvas` no puede renderizarlo. Si un Samsung o Xiaomi configurado en "alta eficiencia" entrega un `.heic`, la compresión del lado del cliente falla en silencio y el admin ve un archivo que su navegador no abre. iOS suele convertir a JPEG al usar `<input type="file" accept="image/*">`, pero no está garantizado.

**Estimación concreta de volumen y costo**

*Supuestos (explícitos, para poder corregirlos con datos reales):*
- Unidades que generan aseo con evidencia (`gestion_vivaguest = true`): 23 + 2 + 7 + 3 + 1 = **36**
- Aseos por unidad por mes: **8** (equivale a estancias promedio de ~3.5 noches con ocupación alta) → **288 aseos/mes**
- Fotos por aseo: **14** (≈5 tipos de cuarto × 2 + generales), más daños/recibos ocasionales
- Foto sin comprimir de Android de gama media: **4 MB**
- Foto comprimida a 1600 px de lado largo, JPEG q≈0.72: **300 KB**
- Retención: **6 meses** (estado estacionario)

| Escenario | Por aseo | Por mes | Estado estacionario (6 meses) | Costo Supabase Storage |
|---|---|---|---|---|
| **Sin comprimir** | 56 MB | **15.8 GB** | **~95 GB** | Free (1 GB): reventado en **~2 días**. Pro (100 GB incluidos): justo en el límite, cualquier desviación cuesta $0.0213/GB |
| **Comprimido** | 4.2 MB | **1.2 GB** | **~7.1 GB** | Dentro de los 100 GB del plan Pro. **$0** de excedente |

Egress: con miniaturas en las listas y original solo en detalle, el consumo del admin queda muy por debajo de los 250 GB incluidos en Pro en ambos escenarios. Sin comprimir revienta los 5 GB de egress del plan Free en la primera semana.

**Conclusión honesta:** el excedente de Storage en Supabase Pro es de **orden de $2/mes** incluso en el peor caso. **El argumento para comprimir no es el costo del bucket; es que 56 MB por aseo hace la app inusable en campo.** Vender la compresión como ahorro de infraestructura lleva a despriorizarla.

**How to avoid:**
1. **Comprimir en el cliente, siempre, antes de encolar.** `createImageBitmap` + `OffscreenCanvas` + `canvas.convertToBlob({type:'image/jpeg', quality:0.72})`, con el lado largo limitado a 1600 px. Si `convertToBlob` falla (HEIC), fallback a `heic2any`/`libheif-js` (WASM) y, si eso también falla, subir el original marcándolo para revisión — nunca perder la evidencia en silencio.
2. **Subir directo a Supabase Storage desde el navegador con signed upload URL.** Nunca a través de una Route Handler de Next.js: evita el límite de 4.5 MB, evita pagar tiempo de función por transferencia, y permite reanudación.
3. **`upload` estándar para archivos <6 MB; TUS resumable por encima.** Supabase recomienda resumable a partir de 6 MB, con chunk fijo de 6 MB, y las URLs de subida valen hasta 24 horas. Con compresión, ninguna foto llega a 6 MB, así que el camino simple basta y el resumable queda como red de seguridad para el original sin comprimir.
4. **Guardar dos derivados:** `thumb` (400 px, ~40 KB) para listas y `full` (1600 px) para el detalle. El admin revisa docenas de fotos al día; servir el original en una grilla es lo que dispara el egress.
5. **Guardar el tamaño en bytes y las dimensiones en la BD.** Sin eso no hay forma de saber si la compresión está funcionando en los teléfonos reales.
6. **Un límite duro por archivo en la política de Storage** (`file_size_limit` del bucket, p. ej. 8 MB) como red de seguridad contra un cliente con la compresión rota.

**Warning signs:** `avg(bytes)` de las fotos por encima de ~500 KB. Fotos con extensión `.heic`. Uso de Storage creciendo más rápido que ~1.5 GB/mes.

**Phase to address:** Fase de evidencia fotográfica. La compresión y la subida directa son parte de la primera versión del flujo, no una optimización.

---

### Pitfall 10: Regla de "aseo En curso no se notifica de la cancelación" — modos de falla

**Severidad:** DEGRADA LA OPERACIÓN
**Confianza:** ALTA (razonamiento sobre el spec, no requiere fuente externa)

**What goes wrong:**
El spec dice: si la reserva desaparece o se mueve y el aseo ya está "En curso", el aseador termina y **no** se le notifica. Es una regla razonable (no interrumpir a alguien que ya está limpiando), pero tiene agujeros:

1. **La ventana de carrera.** El aseo cambia a "En curso" en el mismo instante en que el job lo está cancelando. Sin una transacción y un bloqueo de fila, se puede cancelar un aseo que ya arrancó, o marcar como "En curso" uno ya cancelado. Con 30 minutos entre corridas y aseos que arrancan a cualquier hora, esto **va** a pasar.
2. **El aseo huérfano.** El aseo se completa con checklist y fotos, pero su reserva de origen ya no existe. ¿Cuenta para la rentabilidad? ¿Se le paga al aseador? El requisito de "cálculo de pago mensual" tiene que definir esto explícitamente: la respuesta correcta operativamente es **sí se paga, el trabajo se hizo**, pero si el modelo de datos hace `join` obligatorio con la reserva, el aseo desaparece del cálculo y el aseador cobra de menos. Ese es un error que se descubre en la nómina.
3. **El silencio se propaga al admin.** "No notificar al aseador" no debe leerse como "no notificar a nadie". El admin necesita saber que hubo un aseo ejecutado sobre una reserva cancelada, porque probablemente hay que cobrarlo distinto o hablar con el propietario.
4. **El aseo nuevo generado por el movimiento de fecha se asigna en automático encima del anterior.** Si la reserva se mueve del día 6 al día 8, se genera un aseo nuevo el día 8 sin confirmar. Bien. Pero si se mueve del 6 al 7 y el del 6 estaba En curso, ahora hay dos aseos del mismo apartamento en dos días consecutivos: uno hecho, uno pendiente. El constraint "máximo 1 aseo activo por apartamento por fecha" no lo impide porque son fechas distintas. El admin tiene que ver ese par como una alerta, no como dos filas sueltas.

**How to avoid:**
1. **Toda transición de estado del aseo pasa por una función de Postgres con `SELECT ... FOR UPDATE`** sobre la fila del aseo. El job de sync no hace `UPDATE aseos SET estado='cancelado' WHERE ...` a ciegas; llama a `cancelar_aseo(id, motivo)` que verifica el estado actual dentro de la transacción y no hace nada si es "En curso" o "Terminado".
2. **Máquina de estados explícita con transiciones permitidas declaradas**, y un `CHECK` o un trigger que rechace transiciones inválidas. Con 4 estados esto son ~15 líneas de SQL y elimina toda una clase de bugs.
3. **Estado terminal distinto:** un aseo que terminó sobre una reserva cancelada no es "Terminado" a secas. Marcar `reserva_desapareció_durante_ejecución = true` y mostrarlo como alerta al admin. El pago y la rentabilidad se calculan igual.
4. **Log de auditoría de transiciones** (`aseo_id`, `de`, `a`, `actor`, `motivo`, `at`). Con decenas de aseos al día, esto no pesa nada y es la única forma de reconstruir qué pasó cuando el admin pregunte.

**Warning signs:** Aseos terminados sin reserva asociada. Discrepancias en el cálculo de pago mensual respecto a lo que el aseador dice que hizo.

**Phase to address:** Fase de schema (máquina de estados + auditoría) y fase de motor de sync (llamar a la función, no hacer UPDATE directo).

---

### Pitfall 11: `timestamptz` vs `date` con el servidor en UTC

**Severidad:** ROMPE EL PRODUCTO (es el Pitfall 2 por otra vía)
**Confianza:** ALTA

**What goes wrong:**
Colombia es UTC-5 sin horario de verano desde 1993, lo que hace creer que la zona horaria es un no-problema. Pero Postgres en Supabase y las funciones en Vercel corren en **UTC**, y ahí el offset de 5 horas es suficiente para cruzar la medianoche en todas las operaciones nocturnas y de madrugada:

- `CURRENT_DATE` en el servidor entre las 19:00 y las 23:59 de Bogotá devuelve **mañana**. Un dashboard "aseos de hoy" hecho con `WHERE fecha = CURRENT_DATE` le muestra al admin el día equivocado cada noche.
- Guardar la fecha del aseo como `timestamptz` la ancla a un instante. `2026-04-06T00:00:00-05:00` es `2026-04-06T05:00:00Z`; formatearlo en UTC da día 6, pero cualquier resta o truncamiento intermedio lo mueve.
- La "hora límite" del apartamento (p. ej. 15:00) es una **hora de pared en Bogotá**, no un instante. Guardarla como `timestamptz` es un error de tipo.
- El "cierre de mes = último día laboral del mes" calculado con `now()` en UTC cierra el mes equivocado si el job corre después de las 19:00 del último día.
- `new Date().toISOString().slice(0,10)` en Node es **UTC**, no Bogotá. Es el uno-liner que introduce el bug.

**How to avoid:**
1. **Tipos correctos:** `fecha_aseo` es `date`. `hora_limite` es `time`. `empezo_at`/`termino_at` son `timestamptz` (son instantes reales). No mezclarlos.
2. **Ninguna consulta usa `CURRENT_DATE` o `now()::date` a secas.** Siempre `(now() AT TIME ZONE 'America/Bogota')::date`. Encapsular en una función `hoy_bogota()` y prohibir el uso directo por convención + grep en CI.
3. **En TypeScript, cero `new Date()` para fechas de negocio.** Una única utilidad `fechaBogota(instante): string` que use `Intl.DateTimeFormat` con `timeZone: 'America/Bogota'`, o `date-fns-tz`/`Temporal`. Las fechas de negocio viajan como `'YYYY-MM-DD'` en strings, nunca como `Date`.
4. **`ALTER DATABASE ... SET timezone = 'America/Bogota'` NO es la solución.** Cambia el comportamiento de las sesiones pero no el de PostgREST ni el del runtime de Node, y crea inconsistencias más difíciles de depurar que el problema original. Ser explícito en cada conversión.
5. **CI corre con `TZ=UTC`.** Un test que verifique que a las 23:30 hora Bogotá el "hoy" del sistema sigue siendo el día correcto.

**Warning signs:** El dashboard cambia de día antes de la medianoche. Un aseo aparece en dos días distintos según la pantalla.

**Phase to address:** Fase de schema (tipos + `hoy_bogota()`), y como regla transversal de code review desde el día uno.

---

## Moderate Pitfalls

### Pitfall 12: Middleware de Next.js confundido con frontera de autorización

**Severidad:** DEGRADA / potencialmente ROMPE (seguridad)
**Confianza:** ALTA

El patrón oficial de `@supabase/ssr` pone el refresco de sesión en `middleware.ts`. La trampa es concluir que el middleware es donde vive la autorización. No lo es:

- **CVE-2025-29927** permitió saltarse el middleware entero enviando el header `x-middleware-subrequest`. Afecta 11.1.4 → 15.2.2, corregido en **15.2.3**. Vercel mitigó a nivel de plataforma, pero la lección permanece: el middleware es una capa de conveniencia, no un control de seguridad.
- El middleware no cubre Server Actions invocadas directamente ni Route Handlers excluidos por el `matcher`.

**Prevención:**
- Fijar Next.js **≥ 15.2.3** desde el primer `package.json` y tener Dependabot/renovate activo.
- **La autorización real vive en RLS.** El middleware solo refresca la sesión y redirige por UX. Si RLS está bien, saltarse el middleware no da acceso a datos.
- **Nunca usar `getSession()` para autorizar en el servidor.** La doc de Supabase es explícita: la sesión se lee del almacenamiento sin revalidar contra el servidor de Auth. Usar `getClaims()` (valida la firma del JWT contra las claves públicas) o `getUser()` (hace una llamada al servidor de Auth). `getSession()` hace **cero** llamadas de red; `getUser()` hace exactamente una.
- Verificar rol y "aseador activo" en **cada** Server Action y Route Handler, no solo en el middleware.

**Phase to address:** Fase de auth/layout, y auditoría en la fase de RLS.

---

### Pitfall 13: Cachear datos de un aseador y servírselos a otro

**Severidad:** ROMPE EL PRODUCTO (fuga cruzada de códigos de acceso y asignaciones)
**Confianza:** ALTA

En Next.js 15 `fetch` ya no se cachea por defecto, lo que reduce el riesgo respecto a 14, pero quedan tres caminos vivos:

1. **`unstable_cache` / `'use cache'` envolviendo una consulta por usuario.** La caché es global al deployment; el `userId` tiene que estar en la clave, y aun así se está cacheando dato sensible en una caché compartida. Para este proyecto (39 apartamentos, 8 aseadores, decenas de aseos/día) **no hay ningún problema de rendimiento que justifique cachear datos por usuario.** La regla debe ser: prohibido.
2. **Full Route Cache / prerender.** Una página que no toca `cookies()` ni `headers()` se prerenderiza. Al usar `createServerClient` de `@supabase/ssr` la ruta se vuelve dinámica automáticamente porque lee cookies, pero eso es un efecto secundario en el que no conviene confiar. Marcar explícitamente `export const dynamic = 'force-dynamic'` en los layouts de `/admin` y `/aseador`.
3. **Respuestas cacheadas con `Set-Cookie`.** La doc de Supabase advierte que una respuesta HTTP cacheada que lleve `Set-Cookie` puede filtrar la sesión: si un token refrescado se cachea y se sirve a otro usuario, ese usuario recibe la sesión ajena. Hay que asegurar `Cache-Control: private, no-store` en todo lo autenticado.

**Prevención:** `dynamic = 'force-dynamic'` en los layouts autenticados; regla de lint/review contra `unstable_cache` en código autenticado; un test end-to-end con dos aseadores en sesiones distintas verificando que ninguno ve datos del otro.

**Phase to address:** Fase de layout/auth.

---

### Pitfall 14: Cliente Supabase creado una sola vez en el servidor

**Severidad:** ROMPE EL PRODUCTO (fuga cruzada)
**Confianza:** ALTA (doc oficial)

Un módulo que exporta `export const supabase = createServerClient(...)` a nivel superior queda compartido entre peticiones concurrentes en la misma instancia de función, con las cookies de quien lo instanció primero. La doc de Supabase lo dice de frente: **crear un cliente nuevo en cada petición del servidor**; solo `createBrowserClient` cachea singleton porque ahí solo hay un usuario.

**Prevención:** una función `createClient()` que se invoca dentro de cada Server Component / Route Handler / Server Action. Regla de review: ningún `createServerClient` a nivel de módulo. `auth-helpers-nextjs` está deprecado; el paquete es `@supabase/ssr`.

**Phase to address:** Fase de auth/layout.

---

### Pitfall 15: La alerta de "feed caído" que nunca dispara o dispara todo el tiempo

**Severidad:** DEGRADA
**Confianza:** ALTA

El requisito dice "alertar cuando un link de calendario deja de responder". Dos formas de que sea inútil:

- **No dispara nunca:** porque el fallo real no es un error de red, es un `200` con contenido vacío o un HTML de error (ver Pitfall 1), y el código solo mira `response.ok`. O porque Airbnb rota la URL del feed: la URL contiene un hash único y **resetearla mata la anterior al instante**; la vieja empieza a dar 404 o a devolver un feed de otra cosa.
- **Dispara todo el tiempo:** un timeout aislado en una corrida genera una alerta; a las 39 unidades × 48 corridas/día, el ruido entierra las alertas reales.

**Prevención:**
- Umbral de histéresis: se alerta tras **3 corridas consecutivas fallidas** (≈90 min), no tras la primera. Se resuelve sola al primer éxito.
- La definición de "fallido" incluye: no-2xx, timeout, cuerpo que no parsea, cuerpo sin `END:VCALENDAR`, **y** cero `VEVENT` cuando la corrida anterior tenía eventos.
- Persistir `last_success_at` y `consecutive_failures` por apartamento, y mostrar `last_success_at` en la ficha del apartamento. Es el equivalente al "Last imported" que usan los channel managers como diagnóstico principal.
- Alerta separada y de mayor severidad: **feed cuyo contenido cambió de forma estructural** (cambió el `PRODID`, desaparecieron los `Reservation URL` de todos los eventos). Eso es Airbnb cambiando el formato, y es el escenario del incidente de abril de 2019 donde los datos desaparecieron por dos días y volvieron solos.

**Phase to address:** Fase de motor de sync + fase de alertas.

---

### Pitfall 16: Latencia del feed asumida en 3 horas cuando puede ser mucho peor

**Severidad:** DEGRADA
**Confianza:** MEDIA

El PROJECT.md acepta "~3 horas" de latencia de Airbnb. Los proveedores de channel manager reportan ventanas de 2-4 horas como típico pero también documentan que "AirBnB initiate the inventory update of their calendar, we cannot control how often" y que "can be as slow as once per day". Es decir: la latencia no está acotada por contrato.

Consecuencia concreta para este producto: una reserva de última hora para **mañana** puede no aparecer en el feed hasta después de que ya pasó el momento útil de agendar el aseo. La detección de "urgente" (checkout y checkin el mismo día) depende de ver el checkin, que puede llegar tarde.

**Prevención:**
- Registrar `first_seen_at` de cada evento y la distancia a su `DTSTART`. A las pocas semanas hay una distribución real de latencia por canal, y se puede decidir con datos si hace falta algo más.
- Un aseo cuyo evento se detectó con menos de 24h de anticipación se marca visualmente como "detección tardía" en la bandeja Sin confirmar, para que el admin lo priorice.
- No prometer en la interfaz que el sistema detecta todo: el admin debe conservar la capacidad de crear aseos manuales (ya está en el spec) y saber que es la vía de escape.

**Phase to address:** Fase de motor de sync (instrumentación) + dashboard.

---

### Pitfall 17: Adopción — el día uno alguien no puede instalar la PWA

**Severidad:** ROMPE EL PRODUCTO (en el sentido de que el proyecto no se adopta)
**Confianza:** MEDIA-ALTA (razonamiento operativo)

La instalación de la PWA es requisito duro (en iOS, sin instalar no hay push). El spec no tiene fallback. Escenarios reales del día uno:

- Aseadora con iPhone que usa Chrome: **"Añadir a pantalla de inicio" solo funciona desde Safari** en iOS. Si abre el link desde Chrome o desde el navegador embebido de WhatsApp, no ve la opción.
- El link llega por WhatsApp y abre en el webview de WhatsApp, que no puede instalar.
- Android de gama baja sin espacio, o con el prompt de instalación suprimido.
- Aseadora que toca "No permitir" en el prompt de notificaciones el primer día. En iOS eso es terminal hasta desinstalar y reinstalar.
- Un aseador se cambia de teléfono a los dos meses y nadie se entera de que perdió la suscripción.

**Prevención:**
1. **Ruta `/instalar` con detección de navegador** que, si detecta iOS + no-Safari, muestre "abre este link en Safari" con el link copiable. Detección explícita del webview de WhatsApp/Instagram.
2. **Rollout escalonado por cluster.** Empezar por Bogotá 1 (23 aptos, 1 persona fija) o mejor por un cluster pequeño (Medellín, 1 apto, 1 persona) durante 2 semanas antes de tocar Bogotá 1. WhatsApp y Excel siguen operando en paralelo para los clusters no migrados. **El plan de rollout es parte del roadmap, no un after-thought.**
3. **Definir y documentar el fallback humano:** mientras el semáforo del dashboard muestre a un aseador sin canal, el admin lo llama. Que el spec descarte WhatsApp como *canal del sistema* no significa que la operación no tenga teléfonos. Lo que hay que evitar es que el sistema **crea** que notificó cuando no lo hizo (Pitfall 7, punto 7).
4. **Un checklist de onboarding por aseador visible para el admin**: instalada, permiso, primer push recibido, primer aseo terminado. Cuatro casillas. Sin las cuatro, ese aseador no recibe asignaciones en firme.

**Phase to address:** Fase de PWA del aseador + fase de piloto/rollout (que debería existir como fase explícita en el roadmap).

---

### Pitfall 18: Borrado a 6 meses que destruye evidencia en disputa

**Severidad:** DEGRADA (con potencial legal/financiero)
**Confianza:** ALTA (razonamiento sobre el spec)

El requisito de retención de 6 meses con borrado automático choca con la realidad de las disputas: un propietario o un huésped reclama daños de hace 5 meses y 3 semanas, y el job de borrado se lleva las fotos mientras se discute. El aviso previo al admin no basta si no hay una acción que el admin pueda tomar.

**Lo que el mecanismo debe garantizar, y no solo "avisar":**
1. **Soft delete primero.** El job marca `deleted_at` y mueve los objetos a un prefijo de cuarentena en Storage. El borrado físico ocurre **N días después** (sugerido: 30). El aviso al admin llega antes de la cuarentena, no antes del borrado físico.
2. **Retención legal (`legal_hold`).** Un flag por aseo/apartamento que **excluye incondicionalmente** del borrado. El admin lo activa desde la vista del aseo con un clic cuando hay una disputa abierta. Sin esto, el aviso previo es informativo pero inútil.
3. **El borrado nunca cae en cascada sobre datos financieros.** Los cálculos de rentabilidad y de pago mensual ya cerrados deben sobrevivir al borrado de las fotos. Guardar los agregados mensuales como filas propias, no derivarlos siempre de los aseos. Si el pago de marzo se calcula al vuelo desde los aseos, en septiembre el pago de marzo vale cero.
4. **El aviso debe ser accionable:** "se van a borrar N aseos y M fotos de los apartamentos X, Y, Z el [fecha]" con enlace a la lista y botón de retener. No "pronto se borrará historial".
5. **Verificar que se borra de verdad Storage, no solo las filas.** Borrar la fila de la BD y dejar el objeto en el bucket es el error habitual; el costo de Storage no baja y el dato sensible sigue ahí. Y al revés: borrar el objeto y dejar la fila produce fotos rotas en el historial.
6. **El job de borrado necesita el mismo heartbeat que el de sync** (Pitfall 5). Un job de borrado que corre mal puede borrar de más; uno que no corre no borra nada y el costo crece en silencio.

**Phase to address:** Fase de retención/operación. El flag `legal_hold` y el `deleted_at` deben existir en el **schema inicial** aunque el job se implemente al final; agregarlos después obliga a migrar datos.

---

## Minor Pitfalls

### Pitfall 19: Alertas de la misma jerarquía que se convierten en ruido
El spec pide 7 tipos de alerta "de la misma jerarquía": urgentes, extensión mal creada, "no puedo", daños, faltantes, calendario caído, hora límite vencida. Sin agrupación ni resolución explícita, el panel se llena y deja de mirarse. **Prevención:** toda alerta tiene un estado (`abierta`/`resuelta`) y un responsable de cerrarla; las alertas del mismo tipo y apartamento se agrupan; el panel muestra el conteo de abiertas por tipo. Medir cuántas alertas se cierran en <24h es la métrica de salud del dashboard.

### Pitfall 20: `SUMMARY`/`DESCRIPTION` con line folding del RFC 5545
iCalendar pliega líneas de más de 75 octetos insertando `CRLF` + espacio. Un parser artesanal por `split('\n')` corta la URL de la reserva a la mitad y la extracción del código `HMXXXXXXXX` falla intermitentemente (solo para las URLs largas). **Prevención:** usar `node-ical` o `ical.js`, no regex sobre el texto crudo. Si se usa regex para extraer el código, aplicarla **después** de que la librería desplegó las líneas.

### Pitfall 21: Escapes de iCal en `DESCRIPTION`
`\n`, `\,`, `\;` y `\\` están escapados según RFC 5545. Un `DESCRIPTION` que llega literalmente con la secuencia `\n` de dos caracteres, no un salto de línea. **Prevención:** que la librería lo desescape; no parsear a mano.

### Pitfall 22: Límite de eventos del feed
Operto Teams documenta que rechaza feeds con más de 150 reservas/bloqueos. No es un límite de este sistema, pero indica que los feeds pueden ser grandes: una casa con bloqueos de "booking window" puede traer cientos de `VEVENT`. **Prevención:** no asumir feeds pequeños; procesar en streaming o al menos acotar la memoria; poner un límite superior sano (p. ej. 2000 eventos) por encima del cual se alerta en vez de procesar.

### Pitfall 23: Ejecutar el job de sync con `service_role` sin más
El job necesita bypassear RLS para escribir aseos, y eso está bien. El riesgo es que la misma Route Handler quede accesible sin protección. **Prevención:** la ruta del cron valida `Authorization: Bearer ${CRON_SECRET}` antes de cualquier otra cosa, y el cliente `service_role` se crea dentro del handler, después de validar, en un archivo con `import 'server-only'`.

---

## Technical Debt Patterns

| Atajo | Beneficio inmediato | Costo a largo plazo | ¿Cuándo es aceptable? |
|---|---|---|---|
| Parsear el iCal con regex en vez de librería | Cero dependencias, 20 líneas | Rompe con line folding, escapes, `VTIMEZONE`, `CRLF`; falla intermitente e irreproducible | **Nunca** |
| No persistir el `VEVENT` crudo, solo lo derivado | Schema más simple | Imposible depurar por qué se canceló un aseo; imposible reprocesar tras arreglar un bug del parser | **Nunca**. El crudo cuesta kilobytes |
| Diff destructivo sin ventana protegida | Reconcile trivial | Cancela el aseo del día en curso (Pitfall 1) | **Nunca** |
| Push síncrono sin cola ni acuse | Menos código | Fallos de entrega invisibles, el Core Value se rompe en silencio | Solo en el prototipo interno, nunca con aseadores reales |
| Subir fotos sin comprimir | Menos código de cliente | App inusable en campo, 413 de Vercel, HEIC ilegible | **Nunca** |
| PWA sin cola offline | Ship 1 semana antes | Reescritura completa de la capa de datos del cliente + pérdida de confianza del usuario que es irrecuperable | **Nunca** |
| Cron en Vercel Hobby | $0 | No despliega. No es un atajo, es un muro | N/A |
| Autorizar solo en el middleware, RLS permisivo | Iteración rápida de UI | Fuga de códigos de acceso; auditoría de seguridad completa después | **Nunca** (el constraint del proyecto ya lo prohíbe) |
| `service_role` desde el cliente "temporalmente" | Desbloquea al dev en 30 segundos | Llave maestra en el bundle; rotación + auditoría | **Nunca** |
| Derivar el pago mensual al vuelo desde los aseos | Sin tabla de cierres | El borrado a 6 meses hace que los pagos históricos valgan cero | Aceptable en MVP **solo si** el cierre mensual persiste un snapshot |
| No auditar lecturas del código de acceso | Una tabla menos | Sin defensa en una disputa por robo/daño | Aceptable solo si el código se expone por RPC restringida |
| Checklist global fijo (decisión ya tomada) | Evita construir un editor | Migración cuando un apartamento necesite algo distinto | **Aceptable**, es una decisión consciente del spec. Mitigar guardando un snapshot del checklist en cada aseo ejecutado, para que cambiar la biblioteca no reescriba el historial |

---

## Integration Gotchas

| Integración | Error común | Enfoque correcto |
|---|---|---|
| Airbnb iCal | Asumir que `DTEND - 1` es el día del aseo | El aseo es el día `DTEND` (exclusivo por RFC 5545) |
| Airbnb iCal | Buscar el código de reserva en `SUMMARY` | Está en la URL del `DESCRIPTION` (`.../details/HMXXXXXXXX`) desde 2019-12-01. `SUMMARY` es `Reserved` |
| Airbnb iCal | Tratar todo `VEVENT` como reserva | Whitelist por presencia de `Reservation URL`; `Airbnb (Not available)` es bloqueo |
| Airbnb iCal | Interpretar la ausencia de un evento como cancelación | El feed solo trae futuro y hasta ~365 días; el pasado desaparece por diseño |
| Airbnb iCal | `response.ok` como única validación | Validar `BEGIN/END:VCALENDAR`, parseo, y comparar el conteo de eventos con la corrida anterior |
| Airbnb iCal | Confiar en que la URL del feed no cambia | La URL lleva un hash; resetearla mata la anterior de inmediato. Guardar `last_success_at` por apartamento |
| Booking.com iCal | Aplicarle la lógica de Airbnb | No expone código de confirmación equivalente ni marcador de bloqueo documentado. Validar con feed real y decidir explícitamente |
| Supabase Storage | Subir a través de una Route Handler de Next.js | Límite duro de 4.5 MB en el body de Vercel Functions. Subir directo con signed upload URL |
| Supabase Storage | Bucket público "para que el CDN funcione" | Bucket privado + signed URLs con expiración corta. Público = cualquiera con la URL entra |
| Supabase Storage | Borrar la fila y olvidar el objeto | El borrado de retención debe tocar `storage.objects` y la tabla; verificar ambos |
| Supabase Auth | `getSession()` para autorizar en el servidor | `getClaims()` (valida firma) o `getUser()` (llamada al servidor de Auth). `getSession()` no revalida nada |
| Supabase Auth | `@supabase/auth-helpers-nextjs` | Deprecado. Usar `@supabase/ssr` |
| Supabase Auth | Desactivar aseador = marcar `activo=false` | El JWT emitido sigue vivo. Revocar sesiones en Auth **y** condicionar toda política RLS a `activo = true` |
| Web Push | Ignorar el código de respuesta del push service | `404`/`410` = borrar la suscripción. `413` = payload > ~4 KB (menos vía puente FCM) |
| Web Push | Confiar en `pushsubscriptionchange` | No dispara de forma confiable en iOS. Re-verificar la suscripción en cada arranque de la app |
| Web Push | Pedir permiso al cargar la página | Requiere gesto de usuario; en iOS la negación es irreversible sin reinstalar |
| Vercel Cron | `*/30 * * * *` | Falla el deploy en Hobby (máximo 1/día). Requiere Pro, o mover el scheduler a Supabase Cron |
| Vercel Cron | Asumir ejecución puntual y única | Hobby tiene ±59 min de imprecisión; ninguna plataforma garantiza exactamente-una-vez. Lock + idempotencia |

---

## Performance Traps

A esta escala (39 unidades, ~8 aseadores, decenas de aseos/día) casi nada es un problema de rendimiento. Los que sí:

| Trampa | Síntoma | Prevención | Cuándo se rompe |
|---|---|---|---|
| `auth.uid()` sin envolver en `select` en políticas RLS | Consultas lentas de forma no lineal con el número de filas | `(select auth.uid())` — dispara un `initPlan` que cachea por sentencia | Nunca a esta escala, pero es gratis hacerlo bien |
| Columnas de políticas RLS sin índice | Seq scan en cada lectura | Índice en `aseos(aseador_id)`, `aseos(fecha)`, `apartamentos(responsable_id)` | ~50k filas de aseos ≈ 3-4 años de operación |
| 39 fetches de iCal secuenciales | Corrida cerca del timeout de la función | Concurrencia limitada (5) + `AbortController` con 10s por feed | Con un feed colgado, ya |
| Grilla del admin sirviendo originales de 4 MB | Egress y carga lentísima | Miniaturas de 400 px | Inmediato |
| Historial cronológico por apartamento sin paginación | Página que carga 6 meses de aseos con fotos | Paginación por cursor + carga diferida de fotos | ~200 aseos por apartamento (≈2 años) |
| Fotos en IndexedDB sin límite | Android de gama baja se queda sin espacio; iOS tiene cuota ~50 MB para PWA | Comprimir antes de encolar, purgar de la cola tras subida confirmada | Con fotos sin comprimir, en el primer día |

---

## Security Mistakes

| Error | Riesgo | Prevención |
|---|---|---|
| Código de acceso legible por cualquier aseador autenticado | Entrada física no autorizada a apartamento con huéspedes | RPC `security definer` que valida asignación + aseador activo + ventana temporal; auditar cada lectura |
| Código de acceso legible por un aseador dado de baja | El ex-empleado conserva la entrada a 39 apartamentos | Revocar sesión en Auth al desactivar **y** `activo = true` en toda política RLS |
| `service_role` en el bundle del cliente | Bypass total de RLS; toda la base expuesta | Prohibido `NEXT_PUBLIC_` en llaves de servicio; `import 'server-only'`; grep del bundle en CI |
| Bucket de fotos público | Fotos del interior de las viviendas de clientes accesibles con la URL | Bucket privado + signed URL de vida corta |
| RLS activado sin política | Todo devuelve vacío → el dev "arregla" con `service_role` o desactivando RLS | Migración que crea la tabla, activa RLS y crea la política, todo junto. Test en CI |
| Políticas recursivas (`42P17`) | Todo falla para todos los roles; presión para desactivar RLS | Rol y "activo" vía función `security definer` o custom claim del JWT, no vía subselect a tabla con RLS |
| Fuga por join / foreign table | El aseador pide `aseos` con embed de `apartamentos` y lee las tarifas y los códigos de los 39 | La política vive en la tabla que tiene el dato; probar el embed explícitamente en el test de RLS |
| Ruta de cron sin autenticar | Cualquiera dispara el sync o lo satura | Validar `CRON_SECRET` antes de crear el cliente `service_role` |
| Next.js < 15.2.3 | CVE-2025-29927, bypass del middleware | Pinear ≥ 15.2.3; y no confiar en el middleware como frontera de autorización |
| Rentabilidad y tarifas visibles para el aseador | Fricción laboral; el aseador ve el margen sobre su propio trabajo | Separar las columnas financieras del apartamento en tabla/vista aparte, no solo ocultarlas en la UI |
| Metadatos EXIF/GPS en las fotos | Ubicación exacta de propiedades y patrones de movimiento del aseador | La recompresión por canvas ya elimina EXIF. Verificarlo explícitamente en un test |

---

## UX Pitfalls

| Pitfall | Impacto en el usuario | Mejor enfoque |
|---|---|---|
| Botón "Empecé" con spinner esperando la red | La aseadora toca dos veces, registra dos inicios, o cree que falló | Optimista + cola local; el botón cambia de estado al instante |
| Foto obligatoria por item sin retroalimentación de subida | No sabe si la foto llegó; repite fotos; llena la cola | Miniatura local inmediata + indicador de "pendiente/enviado" por foto |
| "Terminé" bloqueado por el servidor | Se queda en el apartamento esperando señal | Validar contra el estado local; drenar la cola después |
| Prompt de notificaciones al primer arranque | En iOS, si dice que no, es irreversible sin reinstalar | Pedirlo después de que vio su primer aseo, desde un botón con contexto |
| Bandeja "Sin confirmar" llena de bloqueos del propietario | El admin la ignora y se pierde un aseo real | Whitelist en el parser (Pitfall 3) |
| Todas las alertas al mismo nivel sin poder cerrarlas | El panel se satura y deja de mirarse | Estado abierta/resuelta, agrupación, conteo por tipo |
| Mostrar el código de acceso sin más contexto | Se comparte por captura de pantalla | Mostrar solo el día del aseo, con marca de "esta lectura queda registrada" |
| Mensaje de error genérico cuando el push está apagado | No sabe qué hacer | Banner persistente con instrucción específica por plataforma (ya está en el spec: mantenerlo literal, no genérico) |
| Cambiar la biblioteca de checklist y ver el historial reescrito | El admin no puede auditar qué se hizo realmente en marzo | Snapshot del checklist dentro de cada aseo ejecutado |

---

## "Looks Done But Isn't" Checklist

- [ ] **Parser de iCal:** ¿probado contra el `.ics` **real** capturado de un apartamento de VivaGuest, no contra un sample de internet? ¿Con `TZ=UTC` en el proceso?
- [ ] **Cálculo del día del aseo:** ¿hay test para reserva de 1 noche, cruce de mes y cruce de año? ¿Corre en CI con `TZ=UTC`?
- [ ] **Reconcile:** ¿existe la ventana protegida que impide cancelar el aseo de hoy? ¿Existe el guardarraíl de cambio masivo? ¿Probado con un feed vacío simulado?
- [ ] **Job de sync:** ¿hay heartbeat que alerte si el job **no corrió**, además de la alerta de feed caído? ¿Hay advisory lock?
- [ ] **Despliegue del cron:** ¿el plan de Vercel soporta la frecuencia, o el scheduler está en Supabase Cron? Verificado en un deploy real, no en local
- [ ] **RLS:** ¿hay un test automatizado que, con el JWT del aseador B, pida el aseo del aseador A y reciba 0 filas? ¿Y que pida el código de acceso y reciba error?
- [ ] **RLS:** ¿probado el `select` con embed (`aseos` → `apartamentos`) y no solo el `select` plano?
- [ ] **Desactivación de aseador:** ¿probado con una sesión **ya abierta** en un teléfono, no con un login nuevo?
- [ ] **`service_role`:** ¿se hizo grep del bundle de producción buscando la llave?
- [ ] **Push:** ¿probado en un iPhone físico, instalado en pantalla de inicio, con la app cerrada? ¿Y en un Android de gama baja con optimización de batería activa?
- [ ] **Push:** ¿el backend borra la suscripción ante 404/410? ¿La app re-verifica la suscripción en cada arranque?
- [ ] **Push:** ¿existe el semáforo en el dashboard que muestra aseadores con asignaciones y sin canal vivo?
- [ ] **Offline:** ¿probado poniendo el teléfono en modo avión a mitad del checklist y cerrando la app? ¿Se recuperó todo al volver?
- [ ] **Fotos:** ¿medido el tamaño promedio real de las fotos subidas desde los teléfonos de las aseadoras, no desde el del dev?
- [ ] **Fotos:** ¿la subida va directo a Storage o pasa por una Route Handler (413 a los 4.5 MB)?
- [ ] **Fotos:** ¿probado con un archivo `.heic` real?
- [ ] **Fechas:** ¿el dashboard "hoy" es correcto a las 23:30 hora Bogotá? ¿Hay `CURRENT_DATE` suelto en alguna consulta?
- [ ] **Retención:** ¿existe `legal_hold` y `deleted_at` en el schema desde el principio? ¿El borrado toca Storage y BD? ¿El pago mensual histórico sobrevive al borrado?
- [ ] **Máquina de estados:** ¿probada la carrera entre "el aseador pulsa Empecé" y "el job cancela el aseo"?
- [ ] **Onboarding:** ¿alguien que no es del equipo instaló la PWA siguiendo solo las instrucciones de la pantalla `/instalar`, en iPhone y en Android?

---

## Recovery Strategies

| Pitfall | Costo de recuperación | Pasos |
|---|---|---|
| Off-by-one en el día del aseo | **BAJO si se detecta en el piloto, ALTO si se detecta en producción** | Corregir la regla; recalcular la fecha de todos los aseos futuros no confirmados; los confirmados requieren revisión manual del admin apartamento por apartamento |
| Reconcile canceló aseos activos | ALTO | Con el `VEVENT` crudo persistido y el log de auditoría de transiciones, se pueden reconstruir y recrear. **Sin ellos, no hay recuperación posible.** Este es el argumento decisivo para persistir el crudo desde el día uno |
| Aseos generados para bloqueos del propietario | BAJO | Reclasificar por regla, cancelar en lote los aseos derivados de eventos ahora clasificados como bloqueo, disculparse con el admin |
| Push nunca llegó a un aseador | BAJO por incidente, ALTO acumulado | El admin llama. Si es sistemático, el semáforo lo revela. Lo caro es no haber tenido el semáforo |
| Fuga de códigos de acceso | **MUY ALTO** | Rotar el código de acceso de las 39 unidades (implica coordinar con propietarios y huéspedes en curso), revocar todas las sesiones, auditar, notificar. No es recuperable "en software" |
| `service_role` publicada en el bundle | ALTO | Rotar la llave en Supabase, redeploy, auditar los logs de Postgres buscando accesos anómalos, asumir que la base fue leída |
| Fotos sin comprimir ya subidas | MEDIO | Job de recompresión en batch sobre Storage; el original ya consumió los datos móviles del aseador, eso no se recupera |
| Trabajo perdido por falta de offline | **ALTO (irrecuperable)** | Las fotos y checks vivían solo en la pestaña. El aseo hay que rehacerlo o aceptarlo sin evidencia. La pérdida de confianza del aseador es el costo real |
| Evidencia borrada durante una disputa | ALTO | Sin `legal_hold` no hay recuperación. Con soft delete + cuarentena de 30 días, es un restore |
| Cron muerto sin detectar | ALTO | Correr el sync manualmente, revisar los feeds contra los aseos existentes del período muerto, crear manualmente los aseos faltantes. El daño operativo (apartamentos sin limpiar) ya ocurrió |

---

## Pitfall-to-Phase Mapping

Nombres de fase tentativos; ajustar a los del roadmap final.

| Pitfall | Fase de prevención | Verificación |
|---|---|---|
| 1. Reconcile destructivo | Motor de sync | Test: feed vacío simulado no cancela nada; feed que pierde 100% de eventos dispara alerta y no aplica |
| 2. Off-by-one `DTEND` | Motor de sync | Suite de fechas con `TZ=UTC` en CI, incluyendo cruce de año |
| 3. Bloqueos vs reservas | Motor de sync | Fixture con `Airbnb (Not available)` no genera aseo; evento no clasificable alerta |
| 4. Identidad por `UID` | Schema + Motor de sync | Test: cambio de `UID` con mismas fechas no cancela ni duplica el aseo |
| 5. Cron / fallo silencioso | **Decisión de roadmap** + Motor de sync + Alertas | Deploy real con la frecuencia objetivo; matar el job a mano y verificar que dispara la alerta en ≤90 min |
| 6. Códigos de acceso / RLS | **Fase 1: schema + RLS** | Suite de tests de RLS con dos aseadores reales, incluyendo embeds |
| 7. Push como canal único | PWA + Alertas | Prueba en iPhone y Android físicos; semáforo visible en el dashboard; 404/410 limpian la suscripción |
| 8. Offline | PWA (no posterior) | Modo avión a mitad del checklist + cerrar la app + recuperar todo |
| 9. Fotos | Evidencia fotográfica | `avg(bytes)` < 400 KB medido con teléfonos reales; subida directa a Storage |
| 10. Estados / carrera | Schema (máquina de estados) + Motor de sync | Test de concurrencia sobre la transición a "En curso" |
| 11. Timezone | Schema + regla transversal | Test "23:30 en Bogotá"; grep de `CURRENT_DATE` en CI |
| 12. Middleware ≠ autorización | Auth/layout | Next.js ≥ 15.2.3 pineado; autorización probada con el middleware deshabilitado |
| 13. Caché por usuario | Auth/layout | E2E con dos sesiones simultáneas |
| 14. Cliente Supabase singleton | Auth/layout | Regla de review + grep de `createServerClient` a nivel de módulo |
| 15. Alerta de feed | Motor de sync + Alertas | Simular 200-con-cuerpo-vacío y verificar que alerta tras 3 fallos, no tras 1 |
| 16. Latencia del feed | Motor de sync (instrumentación) | `first_seen_at` poblado; distribución revisada a las 2 semanas |
| 17. Adopción / instalación | PWA + Fase de piloto | Instalación completada por alguien externo al equipo en iOS y Android |
| 18. Retención | Schema (flags) + Fase de retención | `legal_hold` excluye del borrado; el pago mensual de un mes borrado sigue siendo consultable |

**Implicación de ordenamiento para el roadmap:**
- La decisión **Vercel Pro vs Supabase Cron** es un bloqueante de despliegue y hay que resolverla antes de escribir el job.
- El **`.ics` real capturado** es un prerequisito de la fase de sync, no una tarea dentro de ella.
- **`legal_hold`, `deleted_at`, la máquina de estados y el log de auditoría de transiciones** tienen que estar en el schema inicial aunque sus features se implementen al final. Agregarlos después obliga a migrar datos operativos.
- El **offline de la PWA** no puede ser una fase posterior a la PWA; es parte de su primera versión.
- Debe existir una **fase explícita de piloto/rollout** con un cluster pequeño antes de tocar Bogotá 1.

---

## Sources

**iCal / Airbnb / Booking.com** (confianza MEDIA — no hay especificación oficial pública; son proveedores de channel manager, anuncios de Airbnb y foros de hosts):
- Operto Teams, "Airbnb changes iCal calendar export feed data, starting December 1st" — https://teams-blog.operto.com/airbnb-changes-ical-calendar-export-feed-data-starting-december-1/
- Operto Teams KB, "How do iCal Feeds import Bookings, Blocks and Guest Information?" (tabla de diferencias por canal, `Airbnb (not available)`, límite de 150 eventos) — https://help-teams.operto.com/article/367-how-do-ical-feeds-import-bookings-blocks-and-guest-information
- Uplisting, "How the Airbnb iCalendar changes will affect you" (`SUMMARY:Reserved`, `Reservation URL`, `Phone Number (Last 4 Digits)`, "future dates only") — https://www.uplisting.io/blog/how-the-airbnb-icalendar-ical-changes-will-affect-you-and-how-to-avoid-disruption
- BookingAutomation Wiki, "Airbnb iCal" (pasado no importado, límite de 365 días, "can be as slow as once per day") — https://www.bookingautomation.com/wiki/Airbnb_iCal
- RentTools, "Airbnb calendar not syncing? 7 reasons your iCal feed goes stale" (reset de URL, 404 silencioso, offset de timezone, "Last imported") — https://renttools.io/blog/airbnb-calendar-not-syncing
- airhostsforum, incidente de abril 2019 con pérdida de datos en el feed y muestra de `VEVENT` con `SUMMARY:Airbnb (...)` — https://airhostsforum.com/t/airbnb-ical-export-system-error-affects-anyone-relying-on-guest-info-within-feed/31295
- RFC 5545 §3.6.1 (`DTEND` no inclusivo). Discusión de bugs de off-by-one en librerías: ical4j #179 — https://github.com/ical4j/ical4j/issues/179
- **Contraejemplo / fuente NO confiable, citada como advertencia:** https://github.com/AyoubAchour/airbnb-ical-sample

**Supabase** (confianza ALTA — docs oficiales):
- RLS: rendimiento, `(select auth.uid())`, índices, `TO`, recursión `42P17`, "no data until you create policies" — https://supabase.com/docs/guides/database/postgres/row-level-security
- Auth SSR en Next.js: `getSession()` no confiable en servidor, `getClaims()`, cliente nuevo por request, fuga de sesión por respuestas cacheadas con `Set-Cookie` — https://supabase.com/docs/guides/auth/server-side/nextjs
- `@supabase/ssr` (vía Context7 `/supabase/ssr`): patrón de middleware, `getSession()` = 0 llamadas de red vs `getUser()` = 1
- Storage access control y buckets públicos — https://supabase.com/docs/guides/storage/security/access-control
- Resumable uploads (umbral 6 MB, chunk fijo 6 MB, URL válida 24 h, 409 en concurrencia) — https://supabase.com/docs/guides/storage/uploads/resumable-uploads
- Precios (Pro: 100 GB Storage incluidos + $0.0213/GB; 250 GB egress + $0.03/GB; Free: 1 GB / 5 GB) — https://supabase.com/pricing
- Supabase Cron / `pg_cron` (granularidad hasta 1 s, `cron.job_run_details`, máx. 8 concurrentes, ≤10 min por job) — https://supabase.com/docs/guides/cron

**Vercel / Next.js** (confianza ALTA — docs oficiales):
- Cron: Hobby = 1/día, precisión ±59 min, deploy falla con expresiones más frecuentes — https://vercel.com/docs/cron-jobs/usage-and-pricing
- Functions: `maxDuration` 300 s Hobby / 800 s Pro, **body máximo 4.5 MB** (`FUNCTION_PAYLOAD_TOO_LARGE`) — https://vercel.com/docs/functions/limitations
- Caching en App Router (`fetch` no cacheado por defecto, `unstable_cache`, `dynamic`) — https://nextjs.org/docs/app/guides/caching
- CVE-2025-29927 (bypass de middleware, corregido en 15.2.3) — https://projectdiscovery.io/blog/nextjs-middleware-authorization-bypass y https://securitylabs.datadoghq.com/articles/nextjs-middleware-auth-bypass/

**Web Push / PWA** (confianza ALTA-MEDIA):
- Pushpad, requisitos específicos de iOS (instalación en pantalla de inicio obligatoria, gesto de usuario, contextos separados) — https://pushpad.xyz/blog/ios-special-requirements-for-web-push-notifications
- Pushpad, errores de Web Push por código HTTP (404 vs 410, 413) — https://pushpad.xyz/blog/web-push-errors-explained-with-http-status-codes
- Apple Developer Forums, expiración de suscripciones en iOS — https://developer.apple.com/forums/thread/727372
- `web-push` (TTL por defecto 4 semanas, `urgency`, `topic`, subject `https:`/`mailto:`) — https://github.com/web-push-libs/web-push
- MagicBell, "PWA iOS Limitations and Safari Support [2026]" (Declarative Web Push en Safari 18.4; iOS 26; sin PWA standalone en la UE por el DMA) — https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide
- Workbox #2516, Background Sync no soportado en iOS — https://github.com/GoogleChrome/workbox/issues/2516
- WebKit Tracking Prevention, cap de 7 días sobre almacenamiento escribible por script; web apps de pantalla de inicio con contador propio — https://webkit.org/tracking-prevention/
- HEIC: Chrome no decodifica HEIF/HEIC, `canvas` no puede renderizarlo; `heic2any` / `libheif-js` vía WASM — https://www.testmuai.com/learning-hub/heif-browser-support/

---
*Pitfalls research for: plataforma de operación de aseos STR dirigida por iCal (VivaGuest)*
*Researched: 2026-08-30*
