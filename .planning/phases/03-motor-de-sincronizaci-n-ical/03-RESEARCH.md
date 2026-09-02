# Fase 3: Motor de sincronización iCal - Research

**Researched:** 2026-09-02
**Domain:** ingesta iCal de Airbnb, scheduler en Postgres (`pg_cron` + `pg_net`), diff idempotente y no destructivo sobre `cleanings`
**Confidence:** ALTA en scheduler y parseo (medido hoy contra el stack local y contra el feed real). MEDIA en la distinción reserva/bloqueo (cero bloqueos en el feed real). BAJA, y declarada como tal, en la estabilidad del `UID` y en la ventana temporal del feed (requieren una segunda captura).

---

<user_constraints>
## User Constraints (de 03-CONTEXT.md)

### Decisiones bloqueadas

**Arquitectura, ya fijada**
- `pg_cron` dispara y hace fan-out con `pg_net`, una invocación HTTP por feed. Aísla feeds caídos por construcción: uno colgado no comparte proceso ni transacción con los otros. Además no depende del cron de Vercel, que en Hobby está capado a una corrida diaria.
- `next_sync_at` solo avanza +30 min cuando el fetch tuvo éxito. Si falla, reintenta en 5 minutos.
- El worker es un Route Handler con `runtime = 'nodejs'`, autenticado por secreto compartido, no por cookie.
- La alerta de feed muerto se dispara por obsolescencia de `last_success_at`, no por captura de excepción. Un sistema que solo alerta cuando su propio código corre es ciego a su propia caída.

**Reglas de dominio no negociables**
- El día del aseo es el `DTEND`, sin sumar ni restar. Es exclusivo en el formato y coincide con el día en que el calendario libera el apartamento.
- Nunca cancelar un aseo con `started_at`. El aseador ya fue y hay que pagarle.
- Nunca cancelar por un feed vacío, inválido o truncado. Validar `BEGIN:VCALENDAR` y el `Content-Type` antes de diffear, y tratar "cero eventos donde antes había N" como intento fallido, no como cancelación masiva.
- Los bloqueos del propietario no generan aseos.
- Máximo un aseo activo por apartamento y fecha; ya lo impone un índice parcial de la Fase 1.
- Los apartamentos con `gestion_vivaguest = false` generan aseo informativo: sin estado, sin asignación, fuera de métricas.

**Privacidad, restricción nueva**
El `DESCRIPTION` del feed real trae los últimos 4 dígitos del teléfono del huésped. Ningún documento de research lo contemplaba. No se persiste, no se registra en logs, no se muestra. Se descarta al normalizar.

**Alcance**
Solo Airbnb. Google Calendar y Booking están fuera, decidido y documentado en PROJECT.md.

### Claude's Discretion
- La forma exacta del diff y cómo se representa la identidad de reserva.
- Cómo se estructura el worker y dónde vive la lógica pura.
- El diseño de la tabla de alertas y su consumo.

### Deferred Ideas (FUERA DE ALCANCE)
- Google Calendar y Booking como fuentes, fuera del MVP.
- Detección automática de huecos largos, se resuelve con aseo manual de `repaso`.
- Alerta de ventana de tiempo insuficiente, descartada explícitamente.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Descripción | Qué de este research lo habilita |
|----|-------------|----------------------------------|
| SYNC-01 | Lee cada feed cada 30 min, aislado, sin que uno caído afecte a los demás | §Scheduler: `dispatch_feed_syncs()` verificada localmente, `pg_net` fire-and-forget, lease por feed. §Pitfall 4: el tick de 5 min no da 30 min reales |
| SYNC-02 | Genera aseo `normal` en la fecha en que el calendario libera el apartamento, sin duplicados | §Identidad: la identidad del aseo es `(property_id, scheduled_date)`, no la reserva. Los dos índices únicos parciales de la Fase 1 hacen la idempotencia estructural |
| SYNC-03 | Distingue reservas de bloqueos y no genera aseos para los bloqueos | §Clasificación de tres valores: whitelist positiva sobre `DESCRIPTION`, `desconocido` falla cerrado y alerta. Riesgo declarado: cero bloqueos en el feed real |
| SYNC-04 | Cancela el aseo cuando la reserva desaparece o cambia de fecha, salvo `started_at` | §El diff, caso (a) y (b): regla de 2 corridas válidas + ventana protegida + piso del feed |
| SYNC-05 | Cuando la reserva se mueve, crea el aseo nuevo sin confirmar | §El diff, caso (a). Trampa medida: `cleanings_one_live_per_reservation` prohíbe dos aseos vivos por reserva |
| SYNC-06 | No cancela con feed vacío o inválido, y registra el intento fallido | §Guardas de transporte y §La guarda que hace segura la falla cerrada: la guarda se generaliza de "eventos" a "reservas clasificadas" |
| SYNC-07 | Marca urgente cuando checkout y checkin caen el mismo día | §Alertas: `is_urgent` se recalcula cada pasada, nunca se acumula. Caso real en el feed: 2026-10-10. Trampa: `cl_unmanaged_is_inert` exige `is_urgent = false` |
| SYNC-08 | Detecta extensión creada como reserva nueva y alerta antes de crear el aseo | §El diff, caso (c): dos reglas de detección, `needs_review` pegajoso, nunca auto-resuelve |
| SYNC-09 | Alerta cuando un link deja de responder | §Alertas: watchdog por obsolescencia de `last_success_at`, no por excepción |
| SYNC-10 | Alerta cuando el propio job deja de correr | §Alertas: el discriminador `todos los feeds obsoletos` vs `algunos`, y por qué la alerta completa se computa al LEER en la Fase 4 |
| SYNC-11 | Genera aseo informativo para `gestion_vivaguest = false` | §Costuras con la Fase 1: lo hace `tg_cleanings_snapshot()` solo. El pipeline no debe saber nada de esto, salvo no tocar `is_urgent` |

</phase_requirements>

---

## Summary

Tres cosas cambiaron el estado del problema respecto a lo que decían `research/ARCHITECTURE.md`, `research/PITFALLS.md` y `research/STACK.md`, y las tres se midieron hoy.

**Primera: el feed real trae el código de reserva en los 15 de 15 eventos.** `PITFALLS.md` §4 modelaba `codigo_reserva` como opcional y ponía el `UID` opaco como identidad principal, con solapamiento de fechas como tercer recurso. Medido: los 15 `DESCRIPTION` traen `reservations/details/HM…` con un código de 10 caracteres, y además el `UID` tiene estructura (`<prefijo-del-anuncio>-<sufijo-de-la-reserva>@airbnb.com`, prefijo constante). La identidad de reserva deja de ser el problema abierto que bloqueaba la fase: hay dos identificadores independientes, y el diseño correcto es una jerarquía de dos niveles, `reservation_code` primero, `uid` después, y **nada más**. El solapamiento de fechas se descarta explícitamente como mecanismo de identidad y se conserva solo como señal de la heurística de extensión.

**Segunda: `node-ical` es activamente peligroso para este feed, y ahora está medido.** Instalado 0.27.1 y corrido contra `airbnb-real-anonimizado.ics`: convierte `DTEND;VALUE=DATE:20260902` en un `Date` cuyo instante absoluto depende de `process.env.TZ`, y bajo `TZ=UTC` (Vercel, y el propio `vitest.config.ts` de este repo) formatearlo al día de Bogotá da **2026-09-01**, el aseo un día antes con el huésped todavía adentro. Peor: `node-ical` indexa su resultado por `UID`, así que dos `VEVENT` con el mismo `UID` colapsan en uno, en silencio, ganando el último. Para un pipeline cuyo único trabajo es no perder un checkout, un parser que puede tragarse un evento sin decir nada está descalificado. La recomendación es no añadir la dependencia y promover `lib/domain/ical-preview.ts`, que ya lee este feed correctamente sin construir un solo `Date`.

**Tercera: todo el lazo `pg_cron` + `pg_net` es ejecutable y observable en el stack local, verificado hoy de punta a punta.** Ambas extensiones están disponibles (`pg_cron` 1.6.4, `pg_net` 0.20.4), `supabase_vault` 0.3.1 ya está instalada, el worker de `pg_net` está vivo y alcanza el host por `host.docker.internal` (200 medido), `cron.job` guarda el comando **en texto plano** (medido, y por eso el secreto va en Vault), y `pg_cron` **no solapa un job consigo mismo** (medido: un job cada 5 s que tarda 12 s corre en serie, nunca en paralelo). Eso último corrige a `ARCHITECTURE.md`: el lease no protege contra ticks solapados, protege contra un worker que sobrevive a su propio intervalo. Con `cron.schedule(..., '10 seconds', ...)` la fase entera se prueba en local sin esperar 30 minutos y sin que existan los proyectos Supabase dev y prod.

**Primary recommendation:** parser propio de ~120 líneas sin dependencias, normalización en Node que borra el teléfono por construcción de tipos, y **un solo RPC transaccional** `public.sync_feed_apply(feed_id, events jsonb)` que hace el diff completo. supabase-js no tiene transacciones: cualquier diff hecho a base de varios `.from().upsert()` deja estado parcial cuando el paso 4 de 5 falla, que es exactamente el fallo que cancela aseos sin crear los nuevos.

---

## Architectural Responsibility Map

| Capacidad | Tier primario | Tier secundario | Razón |
|-----------|---------------|-----------------|-------|
| Cadencia y fan-out | Database (`pg_cron`) | — | Vercel Hobby capa el cron a 1/día. `pg_cron` viene gratis y con historial de corridas |
| Despacho HTTP por feed | Database (`pg_net`) | — | Fire-and-forget: el dispatcher no se bloquea con un feed colgado |
| Custodia del secreto compartido | Database (Vault) | — | `cron.job.command` es texto plano, medido. El secreto no puede vivir en la definición del job |
| Custodia de la URL del feed | Database (`property_secrets`) | — | Es credencial. Decisión bloqueada de la Fase 1, vigilada por el guardarraíl 8 de CI |
| Fetch HTTP del `.ics` | API / Route Handler (nodejs) | — | Necesita timeout, `redirect: 'manual'`, allowlist anti-SSRF y presupuesto de bytes. Nada de eso existe en `pg_net` |
| Parseo y desplegado del iCal | Dominio puro (`lib/domain/`) | — | Función pura, testeable sin red ni base. Ya existe la mitad |
| Normalización y borrado del teléfono | Dominio puro (`lib/domain/`) | — | El dato personal muere antes de cruzar a la base. Se impone por el tipo de salida, no por convención |
| Diff, upsert y reconcile | Database (RPC transaccional) | — | Es multifila y transaccional. supabase-js no tiene transacciones |
| Invariantes del aseo | Database (índices parciales + triggers) | — | Ya impuestos por la Fase 1. `service_role` salta RLS, no salta triggers |
| Alerta de feed muerto | Database (`pg_cron` watchdog) | — | Por obsolescencia, no por excepción |
| Alerta de job muerto | Frontend Server (Fase 4, al leer) | Database (watchdog) | Solo la que se computa al leer no es ciega a su propia muerte |

---

## Standard Stack

### Núcleo

| Componente | Versión | Propósito | Por qué es el estándar aquí |
|-----------|---------|-----------|------------------------------|
| `pg_cron` | 1.6.4 | Scheduler | Disponible en el stack local, ya en `shared_preload_libraries`, `cron.database_name = postgres`. Granularidad de segundos, historial en `cron.job_run_details` [VERIFIED: stack local] |
| `pg_net` | 0.20.4 | Fan-out HTTP asíncrono | Disponible, worker vivo, alcanza el host por `host.docker.internal` [VERIFIED: stack local] |
| `supabase_vault` | 0.3.1 | Custodia del secreto compartido | **Ya instalada** en el stack local. `vault.create_secret()` + vista `vault.decrypted_secrets` [VERIFIED: stack local] |
| Next.js Route Handler | 15.5.24 (ya en el repo) | Worker por feed | `runtime = 'nodejs'`, `maxDuration` hasta 300 s en Hobby [CITED: vercel.com/docs/functions/configuring-functions/duration] |
| Parser iCal propio | — | Parseo y desplegado | Ver §Don't Hand-Roll y §node-ical: la dependencia añade superficie y dos bugs medidos |
| `zod` | 4.5.4 (ya en el repo) | Validación del payload del worker | Ya es el estándar del repo |

### Soporte

| Componente | Uso |
|-----------|-----|
| `node:crypto` (`createHash`, `timingSafeEqual`) | Comparación de secreto en tiempo constante y `payload_hash` |
| `lib/domain/ical-url.schema.ts` (Fase 2) | Allowlist de host anti-SSRF, se reutiliza tal cual |
| `lib/supabase/admin.ts` (Fase 1) | Única fábrica autorizada de cliente `service_role` |
| `vitest` + `vitest.integration.config.ts` | Unitarios puros e integración contra el stack local |
| `pgTAP` (`supabase test db`) | Invariantes del RPC de diff |

### Alternativas consideradas

| En vez de | Se podría usar | Tradeoff |
|-----------|----------------|----------|
| Parser propio | `node-ical` 0.27.1 | Ver §node-ical. Dos bugs medidos contra el feed real, `engines: node >= 22`, 2 deps transitivas. Solo aportaría el desplegado, que ya existe |
| Parser propio | `ical.js` 2.2.1 | Más rigurosa con el RFC, pero devuelve `ICAL.Time` y sigue siendo una capa de objetos temporales sobre un formato de 6 propiedades |
| RPC transaccional | Varias llamadas `.from()` desde supabase-js | supabase-js no tiene transacciones. Un fallo a mitad deja aseos cancelados sin sus reemplazos |
| Vault | Variable de entorno de Postgres (`ALTER DATABASE ... SET`) | Visible en `pg_settings` para cualquier rol con conexión, y no se puede rotar sin `ALTER DATABASE` |
| Vault | El secreto literal en `cron.job.command` | Medido: `cron.job.command` es texto plano. Descartado |
| Watchdog en `pg_cron` para "job muerto" | Cálculo al leer en la Fase 4 | Se usan **los dos**: el watchdog cubre el caso "el job corre pero todo falla"; solo el cálculo al leer cubre "el scheduler murió" |

**Instalación:** cero paquetes npm nuevos. Todo lo de base es DDL.

```sql
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net  with schema extensions;
```

**Verificación de versiones (ejecutada hoy contra el stack local):**

```
name           | default_version | installed_version
pg_cron        | 1.6.4           |
pg_net         | 0.20.4          | 
supabase_vault | 0.3.1           | 0.3.1
server_version | 17.6
shared_preload_libraries incluye: pg_cron, pg_net, pgsodium, supabase_vault
cron.database_name = postgres
```

Ambas se crean y se revierten dentro de una transacción sin error, medido. `pg_cron` cae en `pg_catalog` y `pg_net` en `extensions`, que es lo que el advisor de seguridad espera (nada en `public`).

---

## Package Legitimacy Audit

Esta fase **no instala ningún paquete de npm**. La recomendación explícita es no añadir `node-ical` (ver §node-ical vs parser propio). No hay superficie de instalación que auditar.

| Paquete | Registro | Edad | Descargas | Repo | slopcheck | Disposición |
|---------|----------|------|-----------|------|-----------|-------------|
| `node-ical` | npm | 0.27.1, publicada 2026-07-21 | 308.154/semana | jens-maus/node-ical | no ejecutado | **NO SE INSTALA.** Evaluado y rechazado por dos defectos medidos, no por sospecha de legitimidad |
| `ical.js` | npm | 2.2.1, publicada 2025-08-08 | 479.643/semana | kewisch/ical.js | no ejecutado | **NO SE INSTALA.** Alternativa considerada y descartada |

**Paquetes eliminados por veredicto `[SLOP]`:** ninguno.
**Paquetes marcados `[SUS]`:** ninguno.

`slopcheck` no se ejecutó porque no hay instalación que verificar. Si el planner decide reintroducir `node-ical` en contra de la recomendación, ese cambio **debe** llevar delante un `checkpoint:human-verify` y una ejecución de `slopcheck install node-ical`.

---

## Lo que el feed real ya resolvió, remedido

Medido hoy sobre `lib/domain/__fixtures__/ical/airbnb-real-anonimizado.ics`. Todo `[VERIFIED: fixture real]`.

| Hecho | Medición |
|---|---|
| Eventos | 15 `VEVENT`, 15 `DTEND` distintos, 15 checkouts, 15 aseos esperados |
| Propiedades por evento | exactamente `DTSTAMP`, `DTSTART`, `DTEND`, `SUMMARY`, `UID`, `DESCRIPTION`. Cero `X-`, cero `RRULE`, cero `VTIMEZONE`, cero `VALARM` |
| Plegado | exactamente **75 octetos**. Las 15 líneas más largas del archivo miden 75 y todas son `DESCRIPTION` |
| `UID` | prefijo único en todo el feed (`a1b2c3d4e5f6`, el id del anuncio, anonimizado), sufijo de **32 caracteres hex** |
| Código de reserva | presente en **15 de 15**, longitud **10**, forma `HM[A-Z0-9]{8}` |
| Teléfono | presente en **15 de 15**, 4 dígitos, en la misma `DESCRIPTION`, separado por un `\n` escapado del RFC |
| Clasificación | **15 de 15 son reserva** por las dos vías: `SUMMARY:Reserved` **y** `Reservation URL` en `DESCRIPTION`. Los dos discriminadores están 100% correlacionados en la única muestra real que hay |
| Turnover del mismo día | exactamente uno: `DTEND=20261010` coincide con `DTSTART=20261010` |
| Escáner de la Fase 2 sobre este feed | `{totalEventos: 15, reservas: 15, bloqueos: 0, proximoCheckout: '2026-09-02'}`. Correcto |

### Lo que la fixture NO prueba, y nadie lo ha dicho todavía

**El archivo tiene finales de línea LF, no CRLF.** Medido con `od -c`: `BEGIN:VCALENDAR\n`, sin `\r`. RFC 5545 §3.1 exige CRLF y Airbnb lo emite así; la anonimización normalizó los finales de línea. Las siete fixtures sintéticas de la Fase 2 también son LF. **Conclusión: hoy no hay ni un solo test en el repo que demuestre que el desplegado funciona con CRLF**, que es la forma en que llega el feed de verdad. `desdoblar()` sí lo maneja (`replace(/\r\n/g,'\n')` antes de unir), pero la propiedad no está afirmada. Es una fixture nueva de una línea de trabajo y una aserción.

**El feed real no lo usa ningún test.** `grep -rn 'airbnb-real' lib e2e` devuelve solo el `README.md`. La fixture que desbloqueó la fase aterrizó hoy y nada la ejercita.

---

## Architecture Patterns

### Diagrama del sistema

```
                    ┌──────────────────────── POSTGRES ────────────────────────┐
                    │                                                          │
  cada 1 min ──────▶│  cron.schedule('dispatch-feed-syncs')                    │
                    │            │                                             │
                    │            ▼                                             │
                    │  dispatch_feed_syncs()                                   │
                    │   ├─ lee app_base_url + cron_shared_secret de VAULT       │
                    │   ├─ select ... where is_active                          │
                    │   │        and next_sync_at <= now()                      │
                    │   │        and lease libre                                │
                    │   │     FOR UPDATE SKIP LOCKED  ── el lease               │
                    │   ├─ update claimed_at = now()                            │
                    │   └─ net.http_post(...)  ── fire and forget, 1 por feed   │
                    │            │                                             │
                    └────────────┼─────────────────────────────────────────────┘
                                 │  HTTP POST {feed_id}, header x-cron-secret
                                 ▼
                    ┌──────── VERCEL / next start ────────┐
                    │  POST /api/cron/sync-feed           │
                    │   1. exigirSecretoCron()            │  ◀── timingSafeEqual sobre sha256
                    │   2. createAdminClient()            │      (orden obligado por el guardarraíl 7)
                    │   3. join calendar_feeds            │
                    │        → property_secrets.ical_url  │  ◀── el guardarraíl 8 obliga
                    │   4. fetch(15s, manual, 5MiB, ETag) │      a que la fábrica vaya antes
                    │            │                        │
                    │      ┌─────┴─────┐                  │
                    │   304│           │200                │
                    │   éxito         ▼                    │
                    │   0 trabajo   GUARDAS DE TRANSPORTE  │
                    │               ├─ ¿BEGIN:VCALENDAR?   │
                    │               ├─ ¿Content-Type html? │
                    │               └─ ¿mismo payload_hash?│
                    │                     │                │
                    │                     ▼                │
                    │               PARSEO (puro, sin Date)│
                    │                     │                │
                    │                     ▼                │
                    │               CLASIFICACIÓN 3 valores│
                    │               reserva|bloqueo|desconocido
                    │                     │                │
                    │                     ▼                │
                    │               NORMALIZACIÓN          │
                    │               ── aquí muere el teléfono
                    │                     │                │
                    │                     ▼                │
                    │               GUARDA DE COLAPSO      │
                    │               reservas==0 && antes>0 │
                    │                     │                │
                    └─────────────────────┼────────────────┘
                                          │ UNA llamada RPC
                                          ▼
                    ┌──────────────── POSTGRES ────────────────┐
                    │  sync_feed_apply(feed_id, events, run_at) │
                    │  ── UNA transacción ──                    │
                    │   a. upsert calendar_reservations         │
                    │   b. marcar disappeared_at (nunca DELETE) │
                    │   c. CREAR aseos faltantes  (aditivo)     │
                    │   d. RE-APUNTAR reservation_id            │
                    │   e. CANCELAR, con 4 candados             │
                    │   f. recalcular is_urgent                 │
                    │   g. marcar needs_review (pegajoso)       │
                    │   h. encolar notifications (dedupe_key)   │
                    │   i. escribir salud del feed + feed_sync_runs
                    └───────────────────────────────────────────┘
                                          │
                    ┌─────────────────────┴────────────────────┐
                    │  cron.schedule('feed-health-watchdog')    │  cada hora
                    │   alerta por OBSOLESCENCIA, no por error  │
                    │   todos obsoletos → 1 alerta de JOB       │
                    │   algunos obsoletos → 1 alerta por FEED   │
                    └───────────────────────────────────────────┘
```

### Estructura de archivos recomendada

```
app/api/cron/sync-feed/
└── route.ts                    # POST. runtime nodejs. IO + orquestación. Nada de dominio
lib/domain/
├── ical.ts                     # parser puro: desdoblar, desescapar, componentes, campos crudos
├── ical.test.ts
├── ical-clasificar.ts          # reserva | bloqueo | desconocido. Whitelist positiva
├── ical-clasificar.test.ts
├── ical-normalizar.ts          # VEVENT crudo -> EventoNormalizado. AQUÍ MUERE EL TELÉFONO
├── ical-normalizar.test.ts
├── ical-preview.ts             # se CONSERVA. Diagnóstico de la Fase 2, deliberadamente más laxo
└── __fixtures__/ical/
    ├── airbnb-real-anonimizado.ics
    ├── airbnb-real-crlf.ics             # NUEVA: el mismo feed con CRLF
    ├── airbnb-real-movida.ics           # NUEVA: t1 con una reserva desplazada
    ├── airbnb-real-una-menos.ics        # NUEVA: t1 sin la primera reserva
    ├── airbnb-extension-mal-creada.ics  # NUEVA: código nuevo empezando en el DTEND viejo
    ├── airbnb-bloqueos-1dia.ics         # NUEVA: 90 bloqueos de 1 día, ventana de reserva
    ├── airbnb-summary-desconocido.ics   # NUEVA: SUMMARY jamás visto
    └── (las 7 sintéticas de la Fase 2, intactas)
lib/data/
└── sync.ts                     # la llamada al RPC y la escritura de salud. Testeable sin HTTP
supabase/migrations/
├── 11_sync_extensiones.sql     # pg_cron + pg_net + feed_sync_runs + columnas nuevas
├── 12_sync_rpc.sql             # sync_feed_apply() y sus revoke/grant
└── 13_sync_jobs.sql            # dispatch_feed_syncs(), watchdog, cron.schedule, poda
supabase/tests/
└── 05_sync.test.sql            # pgTAP del diff: los 4 casos y los 4 candados
scripts/dev/
└── sync-local.sh               # agenda el dispatcher a '10 seconds' contra host.docker.internal
```

### Patrón 1: la identidad del aseo NO es la reserva

**Qué:** el aseo se identifica por `(property_id, scheduled_date)`. La reserva es un **puntero**, no una identidad.

**Por qué:** ya está impuesto por el schema de la Fase 1, y no por convención.

```sql
-- supabase/migrations/20260831212658_04_operacion.sql
create unique index cleanings_one_active_per_property_date
  on public.cleanings (property_id, scheduled_date)
  where state is distinct from 'cancelada';

create unique index cleanings_one_live_per_reservation
  on public.cleanings (reservation_id)
  where reservation_id is not null and state is distinct from 'cancelada';

-- cleanings.reservation_id ... on delete set null
```

La consecuencia práctica, que es la que resuelve el problema de PITFALLS §4: si Airbnb cancela una reserva y la rehace con `UID` y código nuevos para las mismas fechas, **el aseo no se toca**. Solo se re-apunta `reservation_id`. La confirmación del admin, el aseador asignado, el número de huéspedes y las instrucciones sobreviven al ruido de la fuente. Esto vale exactamente igual si el `UID` de Airbnb resulta ser estable y si resulta que rota: la pregunta abierta deja de ser bloqueante.

**Corolario que hay que escribir en el código:** `cleanings_one_live_per_reservation` prohíbe dos aseos vivos apuntando a la misma reserva. Cualquier flujo que quiera crear el aseo nuevo antes de cerrar el viejo choca con un `23505`. Ver el caso (a) del diff.

### Patrón 2: una transacción, un RPC

**Qué:** el worker hace IO y CPU; la base hace el diff completo en una sola llamada.

**Cuándo:** siempre. No hay ninguna variante de este pipeline en la que valga la pena partir el diff.

```ts
// app/api/cron/sync-feed/route.ts (fragmento)
const { data, error } = await admin.rpc('sync_feed_apply', {
  p_feed_id: feedId,
  p_events: eventosNormalizados,   // jsonb: SIN description, SIN teléfono
  p_fetched_at: new Date().toISOString(),
  p_etag: etag,
  p_payload_hash: hash,
});
```

**Por qué:** `supabase-js` no expone transacciones. Un diff hecho con cuatro `.from().upsert()` deja, cuando el tercero falla, aseos cancelados sin sus reemplazos creados. Es literalmente el peor estado posible del sistema.

Además resuelve la pregunta del fallo parcial: si el RPC lanza, **nada** se escribió, ni siquiera la salud del feed. El worker entonces hace una segunda llamada, corta, para registrar el fallo. Y si *esa* también falla, el feed se queda con `claimed_at` puesto y el lease de 10 minutos lo devuelve a la cola solo. **El sistema converge sin lógica compensatoria.**

### Patrón 3: aditivo primero, destructivo al final y con candados

El orden de los pasos dentro del RPC no es estético, es la diferencia entre "sobra un aseo" y "falta un aseo":

```
a. upsert de observaciones   (nunca destructivo)
b. marcar ausencias           (marca, no borra)
c. CREAR aseos que faltan     (aditivo)
d. re-apuntar reservation_id  (preserva confirmación)
e. CANCELAR                   (último, y solo si pasa los 4 candados)
```

Si el paso (e) falla, la transacción entera se revierte y no queda nada a medias. Si (e) se salta por los candados, el sistema queda con un aseo de más y una alerta, que es el lado correcto en el que equivocarse.

### Anti-patrones a evitar

- **"Estado deseado = feed".** El iCal no es la verdad, es una vista recortada con ventana móvil, sin garantía de completitud y sin señal de error confiable. `PITFALLS.md` §1 lo dice y el feed real lo confirma: no exporta el pasado.
- **Emparejar reservas por solapamiento de fechas.** Es lo que propone `PITFALLS.md` §4 como tercer nivel. Se rechaza: no puede distinguir "la reserva se movió" de "es otra reserva", y el único desenlace de equivocarse es re-apuntar un aseo a una reserva que no es la suya, en silencio.
- **`console.log(cuerpo)` o `console.log(url)` en el worker.** El cuerpo trae el teléfono, la URL es una credencial.
- **Guardar el `DESCRIPTION` crudo en `calendar_reservations.raw_description`.** Ver §Privacidad.
- **Tocar aseos con `origin = 'manual'`.** El reconcile solo considera `origin = 'ical'`. Un `repaso` o una `emergencia` creados por el admin no son del sync y cancelarlos sería destruir trabajo humano. No está dicho en ningún documento de research y es una línea de `where`.
- **Recalcular `is_urgent` sobre filas informativas.** `cl_unmanaged_is_inert` exige `is_urgent is false` cuando `is_managed = false`. Un `update ... set is_urgent = ...` sin filtrar por `is_managed` revienta con `23514`.
- **Interpretar un `304 Not Modified` como una corrida de diff.** No lo es: no se observó ninguna reserva, así que no se puede concluir ausencia de nada. Ver §El diff, caso (b).

---

## 1. Identidad de reserva y el diff

### La jerarquía de identidad, en dos niveles y ninguno más

```ts
// lib/domain/ical-normalizar.ts
type ClaveDeReserva =
  | { por: 'codigo'; valor: string }   // 'HME3F6BX75'
  | { por: 'uid';    valor: string };  // 'a1b2c3d4e5f6-ad43…@airbnb.com'
```

**Nivel 1, `reservation_code`.** Es el identificador de negocio de Airbnb, el que el admin ve en el panel de Airbnb y el que aparece en cualquier disputa. Medido presente en 15 de 15 eventos del feed real. `PITFALLS.md` §4 lo modelaba como opcional; la medición dice que en la práctica siempre está.

**Nivel 2, `uid`.** Es la clave única del schema (`calendar_reservations_feed_uid_uniq (feed_id, uid)`) y el fallback cuando el código no se pudo extraer. Su estructura recién descubierta (`<anuncio>-<reserva>@airbnb.com`) es útil para **validar**, no para identificar: si el prefijo de un evento no coincide con el prefijo mayoritario del feed, el feed está mezclando anuncios y eso es una anomalía que merece alerta.

**Nivel 3: no existe.** El solapamiento de fechas queda fuera de la identidad, por decisión explícita.

**Cómo conviven los dos niveles con el `unique (feed_id, uid)` del schema:** el `uid` sigue siendo la clave física de la fila. El `reservation_code` es la clave *lógica* con la que se decide si un `uid` nuevo es "la misma reserva de antes". El emparejamiento es:

```
para cada evento normalizado E del feed:
  si existe R en calendar_reservations con feed_id = F y reservation_code = E.codigo:
      → MISMA reserva. Si R.uid <> E.uid, el UID rotó: se actualiza R.uid.
        (Y se registra el hecho: es el instrumento que resuelve la pregunta abierta.)
  si no, si existe R con feed_id = F y uid = E.uid:
      → MISMA reserva. Se actualizan las fechas.
  si no:
      → reserva NUEVA.
```

El primer caso es el que instrumenta la estabilidad del `UID`: **cada vez que un código de reserva conocido llega con un `uid` distinto, el sistema lo cuenta.** A los pocos días eso responde la pregunta que lleva dos documentos de research en disputa, sin depender de capturar el feed dos veces a mano.

Nota de implementación: el `update` de `R.uid` puede chocar con `calendar_reservations_feed_uid_uniq` si el `uid` nuevo ya lo tiene otra fila del mismo feed. Ese choque solo puede pasar si dos códigos distintos comparten `uid`, que sería una anomalía dura de Airbnb. Se captura con `exception when unique_violation` y se convierte en `desconocido` + alerta, no en una excepción que aborte la corrida.

### Los cuatro casos

#### (a) La reserva se movió: mismas identidad, otras fechas

**Qué hace el diff:**
1. `update calendar_reservations set starts_on, ends_on, payload_hash, last_seen_at = now(), disappeared_at = null`.
2. El aseo que apuntaba a esa reserva ahora tiene `scheduled_date <> ends_on`. Se separa en dos ramas por el estado:

| Estado del aseo viejo | Qué hace | Qué NO hace |
|---|---|---|
| `pendiente` y `started_at is null` y fuera de la ventana protegida | cancela (`cancelled_at`, `cancel_reason = 'reserva_movida'`), crea el nuevo en `ends_on` con `confirmado_at = null` y `reservation_id` re-apuntado | — |
| `pendiente` y `started_at is null` pero **dentro de la ventana protegida** | **no cancela**. Marca `needs_review`, notifica, y crea igual el aseo nuevo con `reservation_id = null` | no cancela nada dentro de la ventana |
| `started_at is not null`, o `state in ('en_curso','completada')` | **no cancela**, marca `needs_review = true` con `review_reason`, notifica, y crea el aseo nuevo con `reservation_id = null` | no toca el puntero del aseo que ya tiene trabajo dentro |

**La trampa medida:** `cleanings_one_live_per_reservation` es `unique (reservation_id) where reservation_id is not null and state is distinct from 'cancelada'`. Si el aseo viejo no se puede cancelar y el nuevo se crea apuntando a la misma reserva, el `insert` revienta con `23505`. Hay dos salidas:
- **Desapuntar el viejo** (`reservation_id = null`) y apuntar el nuevo. Se descarta: modificar el puntero de un aseo que ya tiene trabajo dentro borra el vínculo que un pago o una disputa necesitan.
- **Crear el nuevo con `reservation_id = null`** y `needs_review = true`. **Es la recomendación.** El aseo viejo conserva su historia intacta; el nuevo nace huérfano y marcado para que un humano decida. Un aseo con `reservation_id = null` es válido en el schema (la columna es nullable) y ya es el caso de los `manual`.

Nota de dominio, y es la que evita una discusión en la revisión: **"la reserva se movió" y "la reserva se acortó o alargó" son el mismo caso para este sistema.** Lo único que importa es `ends_on`. Un cambio de `starts_on` sin cambio de `ends_on` no genera ningún trabajo de reconcile; solo puede cambiar `is_urgent` de *otro* aseo.

#### (b) La reserva se canceló: desaparece del feed

Nunca se concluye "cancelada" de una sola ausencia. Se exige **todo** lo siguiente:

1. La corrida fue **una corrida de diff válida**: pasó `BEGIN:VCALENDAR`, `Content-Type` no HTML, y la guarda de colapso. Un `304`, un error de red o una corrida abortada **no cuentan**, ni a favor ni en contra.
2. La reserva estuvo ausente en **dos corridas de diff consecutivas**. En la primera se pone `disappeared_at`; en la segunda se actúa. A 30 min de cadencia son ≤ 1 h de retraso, operativamente invisible, y elimina de raíz toda la clase de "una lectura mala canceló los aseos".
3. El aseo está en `state = 'pendiente'` **y** `started_at is null`.
4. El aseo está **fuera de la ventana protegida y por encima del piso del feed** (ver §2).

Si (3) o (4) no se cumplen: `needs_review = true`, notificación, y el aseo sobrevive.

Sobre (1), el detalle que se pasa por alto: un `304 Not Modified` significa "el feed no cambió", no "no vi la reserva". Contar un 304 como "ausencia" cancelaría aseos exactamente cuando Airbnb está más estable. El contador de ausencias tiene que vivir en `calendar_reservations.disappeared_at` y solo lo puede tocar `sync_feed_apply()`, que solo se llama cuando de verdad hubo un cuerpo que diffear.

#### (c) La reserva se recreó como nueva: la extensión mal creada

`uid` nuevo **y** código nuevo, empezando exactamente donde terminaba otra.

El sistema **sí** crea la reserva y **sí** crea el aseo del nuevo `ends_on`, porque es un checkout real. Lo que hace además es marcar el aseo de la **fecha de unión** (el `ends_on` viejo, que es el `starts_on` nuevo) con `needs_review = true` y notificar `extension_sospechosa`.

Dos reglas de detección, en OR:

```sql
-- R1: el código ya se vio en este apartamento con otras fechas
exists (select 1 from public.calendar_reservations r
         where r.property_id = nueva.property_id
           and r.reservation_code = nueva.reservation_code
           and r.id <> nueva.id
           and (r.starts_on, r.ends_on) is distinct from (nueva.starts_on, nueva.ends_on))

-- R2: otra reserva se acortó o desapareció EN ESTA MISMA CORRIDA y la nueva
--     empieza exactamente en su ends_on, con código distinto
exists (select 1 from public.calendar_reservations r
         where r.property_id = nueva.property_id
           and r.ends_on = nueva.starts_on
           and r.reservation_code is distinct from nueva.reservation_code
           and (r.disappeared_at is not null or r.ends_on <> r.ends_on_anterior))
```

**La distinción que ningún documento hace, y que importa:** una reserva nueva que empieza en el `ends_on` de otra reserva **viva y sin cambios** no es una extensión sospechosa, es un **turnover del mismo día**, que es SYNC-07 (`is_urgent`) y no SYNC-08 (`needs_review`). El feed real trae exactamente ese caso el 2026-10-10 con dos reservas sanas. Confundirlos convertiría cada turnover, que es el caso más común y más importante del negocio, en una falsa alarma. **Lo que separa los dos casos es si la reserva anterior se movió o desapareció en la misma corrida.**

`needs_review` es **pegajoso**: el sync nunca lo apaga. Solo el admin, en la Fase 4. Apagarlo automáticamente haría desaparecer la alerta antes de que nadie la atendiera.

**Qué se niega a hacer:** no borra el aseo de la fecha de unión, no fusiona las dos reservas, no auto-resuelve. Si de verdad era una extensión, el costo es un viaje de más y una alerta; si no lo era, el costo de no crear el aseo es un huésped entrando a un apartamento sucio. La asimetría decide sola.

#### (d) Dos reservas que solo se parecen

`uid` distinto **y** código distinto: son dos reservas distintas, siempre, sin excepción, aunque las fechas sean idénticas.

Qué hace el diff: nada especial. La vieja desaparece (por la regla de dos corridas), la nueva aparece. Y como la identidad del aseo es `(property_id, scheduled_date)` y no la reserva, **el aseo es la misma fila**: solo se re-apunta `reservation_id`. La confirmación del admin, el aseador y las instrucciones sobreviven.

Qué se niega a hacer: fusionarlas, tratar una como el movimiento de la otra, reutilizar la fila de `calendar_reservations`, o emparejarlas por fechas.

### La lista completa de lo que el diff se niega a hacer

1. Cancelar un aseo con `started_at is not null`.
2. Cancelar desde una corrida que no pasó las guardas de transporte.
3. Cancelar en la primera ausencia.
4. Cancelar dentro de la ventana protegida o por debajo del piso del feed.
5. Cancelar un aseo con `origin = 'manual'`.
6. Cancelar un aseo `en_curso` o `completada` (además, `tg_cleanings_snapshot()` lo rechaza con `P0001`: `completada` y `cancelada` son terminales).
7. Emparejar reservas por solapamiento de fechas.
8. Borrar filas de `calendar_reservations`. Solo `disappeared_at`.
9. Escribir `raw_description`.
10. Modificar `is_managed` (el trigger lo reimpone de todas formas).
11. Poner `is_urgent = true` en una fila con `is_managed = false` (`23514`).
12. Contar un `304` como corrida de diff.
13. Apagar `needs_review`.

---

## 2. La guarda del reconcile destructivo, concreta

### El hecho medido y lo que sigue abierto

El feed capturado el 2026-09-02 a las 17:51 UTC (12:51 de Bogotá) trae `DTEND;VALUE=DATE:20260902`, es decir la reserva que termina **hoy**. Lo que no se puede saber con una sola captura es cuándo se va.

Dos mundos posibles, y no son equivalentes:

- **Mundo A:** Airbnb suelta el evento cuando `DTEND < hoy`, o sea al día siguiente del checkout. Riesgo: un aseo del día D que todavía esté `pendiente` en algún momento del día D+1 (retrasado, reprogramado, sin confirmar) se queda sin reserva y el reconcile lo cancela.
- **Mundo B:** Airbnb lo suelta en cuanto `DTEND <= hoy`, o sea durante el propio día del checkout. Riesgo: el aseo de HOY se cancela mientras la aseadora va camino al apartamento. Es la catástrofe de `PITFALLS.md` §1.

La captura de mediodía en Bogotá lo descarta *a esa hora*, no descarta que se vaya a las 19:00 de Bogotá, que es exactamente medianoche UTC y el borde que este repo ya conoce y que motivó `today_bog()`.

### El diseño que es seguro bajo los dos mundos

**Tres candados independientes. Cancelar exige pasar los tres.**

**Candado 1: la ventana protegida.** Un aseo es inmune a la cancelación automática si

```sql
scheduled_date <= public.today_bog() + 1
```

Es decir: hoy, mañana, y todo el pasado. Razón: cualquier aseo con fecha de hoy o anterior o está pasando ahora o ya viene tarde. No existe ningún motivo legítimo para que el sync lo cancele por su cuenta. Si la reserva de verdad desapareció, eso lo tiene que ver una persona. El `+1` compra 24 h de margen contra un borde que todavía no está medido y contra la diferencia UTC/Bogotá.

**Candado 2: el piso del feed.** En cada corrida válida se calcula

```sql
v_piso := min(ends_on) filter (where clasificacion = 'reserva') over la corrida
```

y **no se cancela ningún aseo con `scheduled_date < v_piso`**. Razón: si la ventana de observación de Airbnb se movió hacia adelante, todo lo que quedó por detrás no está "cancelado", está **fuera de la ventana**. Este candado se deriva de la propia corrida y por eso es correcto bajo el mundo A, bajo el mundo B, y bajo la variante "Airbnb tampoco exporta más allá de ~365 días" que `PITFALLS.md` §1 también menciona. **Es el candado más fuerte de los tres y es el que hace innecesario adivinar dónde está el borde.**

**Candado 3: dos corridas de diff consecutivas** (ver caso (b)).

Consolidado:

```sql
-- dentro de sync_feed_apply(), paso (e)
update public.cleanings c
   set state = 'cancelada', cancelled_at = now(),
       cancel_reason = 'reserva_desaparecida'
 where c.id = any (v_candidatos)
   and c.origin = 'ical'
   and c.state = 'pendiente'
   and c.started_at is null
   and c.scheduled_date >= greatest(public.today_bog() + 1, v_piso)
   and c.scheduled_date > public.today_bog() + 1;   -- estrictamente fuera de la ventana
```

Todo aseo candidato que **no** pase los candados recibe `needs_review = true`, `review_reason` y una notificación. Nunca se pierde en silencio.

### La instrumentación que resuelve la pregunta empíricamente

Dos mecanismos, y solo uno necesita schema nuevo.

**Mecanismo 1: `feed_sync_runs`, una fila por corrida de diff.** Tabla nueva, mínima:

```sql
create table public.feed_sync_runs (
  id                bigserial primary key,
  feed_id           uuid not null references public.calendar_feeds(id) on delete cascade,
  started_at        timestamptz not null default now(),
  finished_at       timestamptz,
  outcome           text not null,        -- 'ok' | 'no_modificado' | 'sin_cambios' | 'transporte' | 'colapso' | 'error'
  http_status       int,
  event_count       int,
  reservation_count int,
  block_count       int,
  unknown_count     int,
  min_ends_on       date,                 -- EL PISO DEL FEED. Es la instrumentación
  max_ends_on       date,                 -- la ventana futura de Airbnb
  cleanings_created int not null default 0,
  cleanings_cancelled int not null default 0,
  reviews_flagged   int not null default 0,
  uid_rotations     int not null default 0  -- código conocido con uid nuevo
);
```

Con eso, la pregunta se contesta con una consulta a los dos días:

```sql
select date_trunc('hour', started_at at time zone 'America/Bogota') as hora_bog,
       min(min_ends_on), max(min_ends_on)
  from public.feed_sync_runs
 where feed_id = :id and outcome = 'ok'
 group by 1 order by 1;
```

Si `min_ends_on` salta de D a D+1 **durante el día D**, es el mundo B y la hora de Bogotá en que salta dice qué zona horaria usa Airbnb. Si salta al empezar D+1, es el mundo A. Si nunca salta antes de D+1, la ventana protegida puede encogerse a `today_bog()`.

**Mecanismo 2: `calendar_reservations.disappeared_at`, que ya existe.** Con la regla de dos corridas, la distribución sale sola:

```sql
select ends_on,
       disappeared_at at time zone 'America/Bogota' as se_fue_bog,
       (disappeared_at at time zone 'America/Bogota')::date - ends_on as dias_despues
  from public.calendar_reservations
 where disappeared_at is not null
 order by ends_on;
```

Con 34 feeds y ~15 reservas por feed, en una semana hay muestra de sobra, y la **hora del día** de la columna `se_fue_bog` responde la pregunta de la zona horaria.

**Tarea de plan que hay que crear:** un `checkpoint:human-verify` al tercer día de producción que corra las dos consultas, escriba la respuesta en `deferred-items.md` y decida si la ventana protegida se encoge. Sin ese checkpoint la instrumentación se escribe y nadie la lee.

**Y el mecanismo 3, que no cuesta nada:** guardar el `min_ends_on` de la corrida anterior en `calendar_feeds` y **alertar cuando salte más de un día en una sola corrida**. Un salto de 1 día es el borde normal; un salto de 13 días significa que Airbnb tiró un bloque de historia, o que la URL del feed cambió de anuncio. Es la alerta de "cambio estructural" que `PITFALLS.md` §11 pide y que nadie había aterrizado en una métrica concreta.

---

## 3. Distinguir reservas de bloqueos: hoy no es verificable

### Qué tan seguros podemos estar, honestamente

| Evidencia | Fuente | Confianza |
|---|---|---|
| Los 15 eventos del feed real son reserva, por `SUMMARY:Reserved` y por `Reservation URL`, correlacionados al 100% | fixture real, medido hoy | ALTA, pero **solo prueba el lado positivo**. Cero bloqueos en la muestra |
| `Reservation URL` aparece en 1708/1708 `Reserved` y en 0/700 `Airbnb (Not available)` sobre 432 snapshots | `research/STACK.md`, citado por `PITFALLS.md` §3 | MEDIA. Es la evidencia más fuerte que hay y es de segunda mano, no reproducible desde este repo |
| Los bloqueos llevan `SUMMARY: Airbnb (Not available)`, con variantes históricas `Not available` y `Airbnb (Not Available)` | `PITFALLS.md` §3 + Duve, Uplisting, Hostfully | MEDIA |
| Los bloqueos por **ventana de reserva** se emiten como eventos **individuales de 1 día** | foro de MotoPress | MEDIA, y es el hecho que fija la magnitud del fallo |

**Conclusión honesta:** el discriminador `DESCRIPTION contiene "Reservation URL"` es MEDIA-ALTA. El discriminador `SUMMARY == 'Airbnb (Not available)'` es MEDIA. Ninguno es ALTA, porque no existe un solo bloqueo real en el repo. La fixture `solo-bloqueos.ics` es sintética y la escribió la Fase 2 a partir de estos mismos documentos: **usarla como evidencia sería circular.**

### Cómo se ve un bloqueo, según la mejor evidencia disponible

```ics
BEGIN:VEVENT
DTSTAMP:20260902T175137Z
DTSTART;VALUE=DATE:20261115
DTEND;VALUE=DATE:20261116
SUMMARY:Airbnb (Not available)
UID:a1b2c3d4e5f6-<opaco>@airbnb.com
END:VEVENT
```

Cuatro rasgos: `SUMMARY` distinto, **sin `DESCRIPTION` en absoluto**, sin código de reserva, y con frecuencia de duración 1 día cuando viene de la ventana de reserva.

### Qué hacer con un `SUMMARY` nunca visto: la recomendación es fallar CERRADO

Clasificación de **tres** valores, no de dos:

```ts
// lib/domain/ical-clasificar.ts
const RE_RESERVA = /reservations\/details\/[A-Z0-9]{6,}/i;
const RE_BLOQUEO = /\b(not\s*available|unavailable|blocked)\b/i;

export type Clasificacion = 'reserva' | 'bloqueo' | 'desconocido';

export function clasificar(ev: VEventoCrudo): Clasificacion {
  // WHITELIST POSITIVA, y sobre DESCRIPTION, no sobre SUMMARY.
  if (ev.description && RE_RESERVA.test(ev.description)) return 'reserva';
  if (ev.summary && RE_BLOQUEO.test(ev.summary)) return 'bloqueo';
  return 'desconocido';
}
```

`desconocido` se persiste como evento, **no genera aseo**, y alerta.

**El razonamiento de por qué cerrado y no abierto:**

1. **La cola de fallar abierto no tiene techo.** Los bloqueos de ventana de reserva son eventos de 1 día. Un apartamento cerrado tres meses produce ~90 `VEVENT` de un día, y tratados como reserva son **90 aseos fantasma en una sola corrida, en un solo apartamento**. Con 34 apartamentos eso no es ruido, es un dashboard inutilizable y una jornada perdida limpiando la base. La cola de fallar cerrado, en cambio, está acotada por el número de eventos que no clasifican.
2. **El caso esperado no cuesta nada.** 15 de 15 eventos del feed real clasifican como reserva por la whitelist. Fallar cerrado tiene coste cero hoy.
3. **Hay salida humana en una dirección y no en la otra.** Si el sistema no crea un aseo, el admin lo crea a mano: la Fase 4 ya tiene `repaso` y `emergencia`, y el pipeline emite una alerta por cada evento no clasificado. Si el sistema crea 90 aseos fantasma, no hay ninguna acción de un solo paso que los deshaga.
4. **La asimetría del dominio apunta al otro lado, y por eso hace falta la guarda de abajo.** "Un aseo de más" es barato; "un aseo de menos" deja a un huésped en un apartamento sucio. Ese argumento, solo, empujaría a fallar abierto. Lo que lo invierte es que el modo de fallo de fallar cerrado **no es silencioso**: cada evento `desconocido` alerta, y el colapso masivo lo atrapa la guarda siguiente.

### La guarda que hace segura la falla cerrada, y sin la cual es una bomba

`ARCHITECTURE.md` paso 7 dice: `if (eventos.length === 0 && feed.last_event_count > 0) → fallo`. **Eso no basta con clasificación de tres valores.** Si Airbnb cambia el formato del `DESCRIPTION`, los eventos siguen llegando, `eventos.length` sigue siendo 15, la guarda no salta, todos se clasifican `desconocido`, cero reservas vivas, y el reconcile cancela todos los aseos del apartamento.

**La guarda hay que generalizarla de "eventos" a "reservas clasificadas":**

```
si reservas_clasificadas === 0 && feed.last_event_count > 0:
    → NO se llama al RPC. outcome = 'colapso'. Se registra el intento fallido,
      se alerta, y NO se cancela absolutamente nada.
```

Recordatorio de la costura con la Fase 2: `calendar_feeds.last_event_count` **guarda el número de RESERVAS**, no de eventos, por decisión explícita del plan 02-14 ("`last_event_count` guarda las RESERVAS, no los eventos"). Así que la comparación ya es homogénea. **No renombrar ni redefinir esa columna**, o se rompe el panel de "ya conectado" de la pantalla de calendario.

Este acoplamiento (clasificación de tres valores ⟷ guarda sobre reservas clasificadas) es el más importante del diseño y no está en ningún documento de research. Sin él, fallar cerrado cancela todo el día que Airbnb cambie una cadena.

### Ambigüedad del ROADMAP que hay que resolver antes de planear

El criterio 2 dice literalmente: *"Un **fin de bloqueo** genera exactamente un aseo `normal` en la fecha correcta"*. El criterio 3 dice: *"Los **bloqueos** del propietario no generan aseos"*. Leídos con el mismo sentido de "bloqueo", se contradicen.

Lectura recomendada, y la que respaldan SYNC-02 y SYNC-03: en el criterio 2 "bloqueo" significa **el periodo de ocupación de una reserva** (en el feed de Airbnb una reserva *es* un bloque de fechas), y su fin es el checkout. En el criterio 3 "bloqueo" significa **bloqueo del propietario** (`Airbnb (Not available)`). SYNC-02 no usa la palabra "bloqueo" en absoluto: dice *"en la fecha en que el calendario libera el apartamento"*. **El planner debe fijar esta lectura por escrito en el plan**, o el verificador de la fase tendrá dos criterios que no puede satisfacer a la vez.

---

## 4. `pg_cron` + `pg_net`, en detalle de funcionamiento

Todo lo de esta sección está `[VERIFIED: stack local, 2026-09-02]` salvo donde se diga lo contrario.

### Instalación

```sql
-- supabase/migrations/11_sync_extensiones.sql
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net  with schema extensions;
```

Medido: ambas se crean dentro de una transacción y se revierten con `rollback` sin error. `pg_cron` queda en `pg_catalog` y `pg_net` en `extensions`, ninguna en `public`, así que el `db advisors --type security` del CI no debería reportar `extension_in_public`. **Verificarlo en el plan igual**, porque el umbral está en `--fail-on error` y un WARN nuevo cambiaría la conversación.

### El secreto compartido viaja por Vault, no por la definición del job

Medido, y es la razón entera de esta decisión:

```
select jobid, schedule, command, jobname from cron.job;
 jobid |  schedule   | command  |    jobname
     1 | */5 * * * * | select 1 | prueba-secreto
```

`cron.job.command` es **texto plano**. Cualquiera que pueda leer `cron.job` lee el secreto. Vault, en cambio (medido):

```
select id, name, secret from vault.secrets where name='vg_test_secret';
 ... | vg_test_secret | gshs8RzwbGtx2Kcg8jN/jOJVVWKtdxs8JnT6BSaYaiJuKbvVYvtzxfVearx2+Z993Fnv
select name, decrypted_secret from vault.decrypted_secrets where name='vg_test_secret';
 vg_test_secret | valor-de-prueba-123
```

ACL medido: `vault.decrypted_secrets` tiene `{supabase_admin=arwdDxtm, postgres=r*d*D*x*, service_role=rd}`. `authenticated` y `anon` no aparecen. PostgREST no expone el esquema `vault`, así que no es alcanzable por API. La superficie real es la función `security definer` del dispatcher, que corre como `postgres`.

**Los secretos son datos, no schema.** No pueden ir en una migración porque el valor quedaría en git. La creación es un paso operativo por entorno:

```sql
-- una vez por entorno, por psql o por el SQL editor. NO en una migración.
select vault.create_secret('https://vivaguest.vercel.app', 'app_base_url',      'Base del worker de sync');
select vault.create_secret('<32+ bytes aleatorios>',       'cron_shared_secret','Secreto compartido del worker');
```

Modo de fallo si alguien olvida crearlos: `dispatch_feed_syncs()` no encuentra el secreto, lanza, `cron.job_run_details.status = 'failed'` con el mensaje, y el watchdog de job muerto alerta. **Es el modo de fallo correcto: ruidoso y visible.** El plan debe afirmarlo con un test, no solo declararlo.

### El dispatcher

```sql
create or replace function public.dispatch_feed_syncs()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r        record;
  n        int := 0;
  v_base   text;
  v_secret text;
begin
  select decrypted_secret into v_base
    from vault.decrypted_secrets where name = 'app_base_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'cron_shared_secret';

  if v_base is null or v_secret is null then
    raise exception 'faltan secretos de sync en vault: app_base_url / cron_shared_secret';
  end if;

  for r in
    select f.id
      from public.calendar_feeds f
     where f.is_active
       and f.next_sync_at <= now()
       -- EL LEASE. Un feed reclamado hace menos de 10 min no se vuelve a despachar.
       and (f.claimed_at is null or f.claimed_at < now() - interval '10 minutes')
     order by f.next_sync_at
     limit 60
     for update skip locked
  loop
    update public.calendar_feeds
       set claimed_at = now(), last_attempt_at = now()
     where id = r.id;

    -- Firma medida: net.http_post(url, body, params, headers, timeout_milliseconds).
    -- Se usan argumentos NOMBRADOS a propósito: el orden posicional pone `body`
    -- en segundo lugar, que es donde la intuición pone `headers`.
    perform net.http_post(
      url                  := v_base || '/api/cron/sync-feed',
      body                 := jsonb_build_object('feed_id', r.id),
      headers              := jsonb_build_object(
                                'Content-Type', 'application/json',
                                'x-cron-secret', v_secret),
      timeout_milliseconds := 30000
    );
    n := n + 1;
  end loop;

  return n;
end $$;

revoke all     on function public.dispatch_feed_syncs() from public, anon, authenticated;
grant  execute on function public.dispatch_feed_syncs() to postgres;
```

Los dos últimos renglones no son decorativos: el hallazgo 5 de `deferred-items.md` mide que `alter default privileges` **no** le quita `EXECUTE` a `PUBLIC` sobre funciones futuras en PG 17.6, y el guardarraíl 10 de `02_guardarrailes.test.sql` verifica que ninguna función de `public` sea ejecutable por `anon`. Sin ese par de líneas, la fase entra en rojo en CI.

### La cadencia, y por qué `*/5` no da 30 minutos

```sql
select cron.schedule('dispatch-feed-syncs', '1 minute',
                     $$select public.dispatch_feed_syncs()$$);
```

`ARCHITECTURE.md` propone `*/5 * * * *`. Con tick de 5 min y `next_sync_at = now() + 30 min`, la cadencia efectiva es de 30 a 35 minutos, y el criterio 1 dice "cada 30 minutos". Con tick de 1 minuto la cadencia efectiva es de 30 a 31 min. El coste del dispatcher es una consulta indexada sobre `cal_feeds_due_idx` con 34 filas: gratis.

**Pero el tick de 1 minuto tiene un precio que ningún documento menciona: `cron.job_run_details` crece sin límite y `pg_cron` no lo poda solo.** 1440 filas/día por este job, más de medio millón al año en el free tier. Hace falta un job de poda, y va en la misma migración:

```sql
select cron.schedule('purge-cron-history', '17 4 * * *', $$
  delete from cron.job_run_details where end_time < now() - interval '7 days'
$$);
```

7 días es de sobra: el watchdog mira las últimas horas y el diagnóstico humano nunca va más atrás de una semana.

### El backoff de `next_sync_at`

`03-CONTEXT.md` fija "si falla, reintenta en 5 minutos". `ARCHITECTURE.md` propone backoff exponencial con techo de 60. Se combinan con un piso:

```sql
-- éxito
next_sync_at         = now() + interval '30 minutes',
consecutive_failures = 0,
last_success_at      = now(),
claimed_at           = null

-- fallo
consecutive_failures = consecutive_failures + 1,
next_sync_at = now() + greatest(5, least(power(2, consecutive_failures)::int, 60))
                       * interval '1 minute',
claimed_at   = null
```

`greatest(5, ...)` honra la decisión bloqueada; `least(..., 60)` evita que un feed muerto se consulte cada 30 s durante días. Los primeros reintentos caen a los 5, 5, 8, 16, 32 y 60 minutos.

**`claimed_at = null` en las dos ramas.** Es lo que devuelve el feed a la cola. Si el worker muere antes de escribirlo, el lease de 10 minutos lo hace igual.

### Solapamiento: qué protege el lease, medido

`ARCHITECTURE.md` dice que el lease "garantiza como máximo un sync en vuelo por feed aunque dos ticks se solapen". **Los ticks no se pueden solapar.** Medido: un job agendado cada 5 segundos cuyo cuerpo tarda 12 segundos produce

```
 runid |  status   |          start_time           |           end_time
     1 | succeeded | 18:08:36.294 | 18:08:48.315
     2 | succeeded | 18:08:48.352 | 18:09:00.374
     3 | running   | 18:09:00.408 |
```

Las corridas van en serie, nunca en paralelo: `pg_cron` **no lanza un job consigo mismo mientras el anterior sigue vivo**. Por tanto:

- El **dispatcher** no puede solaparse consigo mismo por construcción, y además es fire-and-forget: `net.http_post` encola y vuelve.
- Lo que el lease protege de verdad es **el worker sobreviviendo a su propio intervalo**: si el fetch del feed X tarda 3 minutos y el tick siguiente llega a los 60 s, sin lease se despacharía una segunda invocación para el mismo feed. Con `claimed_at` puesto y `next_sync_at` todavía vencido, el `where` lo salta.
- El `for update skip locked` protege un caso distinto y también real: dos conexiones cualesquiera llamando a `dispatch_feed_syncs()` a la vez (un humano en el SQL editor durante una depuración, o un `sync-local.sh` corriendo mientras el cron está activo).

Y la última red, la que ya está en la base: aunque las dos capas fallaran, `calendar_reservations_feed_uid_uniq` y los dos índices únicos parciales de `cleanings` hacen que una doble invocación sea idempotente en vez de duplicadora.

### `cron.job_run_details` como latido, y qué distingue JOB muerto de FEED muerto

Columnas medidas: `jobid, runid, job_pid, database, username, command, status, return_message, start_time, end_time`. `status` toma `'running'`, `'succeeded'`, `'failed'`. En un fallo, `return_message` trae el texto del error (medido: `ERROR:  division by zero`).

Con eso hay **dos** condiciones distintas, y confundirlas es lo que produce tormentas de alertas:

| Condición | Cómo se detecta | Alerta |
|---|---|---|
| El job corre y falla | `status = 'failed'` en las últimas N corridas de `dispatch-feed-syncs` | 1 alerta de job |
| El job no corre en absoluto | `max(start_time)` del jobid del dispatcher es más viejo que 15 min | 1 alerta de job |
| Un feed concreto no responde | `last_success_at` obsoleto en **algunos** feeds mientras otros están frescos | 1 alerta **por feed** |
| Todos los feeds obsoletos a la vez | `count(obsoletos) = count(activos)` | **1 alerta de job, y se suprimen las 34 de feed** |

Esa última fila es el diseño anti-tormenta y no está en ningún documento: sin ella, el día que el scheduler muera el admin recibe 34 notificaciones de "calendario caído" y ninguna que diga la verdad.

### El límite honesto: ningún watchdog dentro de la base ve su propia muerte

Si `pg_cron` deja de correr, el watchdog agendado en `pg_cron` tampoco corre. Es la trampa que la pregunta 7 nombra, y no tiene solución dentro de la base.

**Recomendación, en dos capas:**

1. **La que cierra el agujero, y es gratis: la alerta de "sync caído" se computa AL LEER, en el dashboard de la Fase 4.** Una consulta de una línea sobre datos que ya existen:

   ```sql
   select max(last_success_at) from public.calendar_feeds where is_active;
   ```

   Si el más reciente de TODOS los feeds tiene más de 3 h, el panel pinta "sincronización caída" con la misma jerarquía que las demás alertas. **Esto se dispara aunque no corra absolutamente nada dentro de la base**, porque lo calcula la página que el admin abre de todas formas. Cero infraestructura, cero coste, y es imposible que sea ciega a su propia caída porque no depende de ejecutarse periódicamente.

   El único hueco que le queda es "el admin no abre el dashboard". Para un producto que el admin mira varias veces al día, es aceptable, y hay que decirlo en el plan en vez de fingir que está cubierto.

2. **La complementaria, opcional y fuera del MVP:** un dead man's switch externo (healthchecks.io tiene free tier) al que `dispatch_feed_syncs()` hace ping con `pg_net` al final de cada corrida. Cubre el hueco de (1). Se registra como idea diferida, no como tarea de esta fase.

El watchdog dentro de `pg_cron` se mantiene igual, porque cubre bien el caso que sí puede cubrir: el job corre, los feeds fallan.

### Todo esto se prueba en local, medido

- `host.docker.internal` resuelve desde el contenedor de la base a `192.168.65.254`.
- `pg_net` alcanza el host: `net.http_get('http://host.docker.internal:54321/rest/v1/')` devolvió `status_code = 200`, `timed_out = f`, `error_msg` vacío, y la respuesta quedó en `net._http_response`.
- `pg_cron` con granularidad de segundos: `cron.schedule('x','5 seconds', ...)` produjo 2 corridas `succeeded` en 14 s.

Por tanto, `scripts/dev/sync-local.sh` puede agendar el dispatcher a `'10 seconds'` apuntando a `http://host.docker.internal:3000/api/cron/sync-feed` y la fase entera se ejercita en minutos, sin que existan los proyectos Supabase dev ni prod, que es el constraint declarado.

**Dos avisos operativos para ese script:**
- `net._http_response` se purga sola a las 6 h (`pg_net.ttl = 6 hours`, medido). Cualquier diagnóstico de "¿llegó el POST?" hay que hacerlo dentro de esa ventana.
- El puerto 3000 es compartido entre worktrees (lección del plan 02-14 con `PLAYWRIGHT_PORT`). El script debe aceptar el puerto por parámetro y **nunca** dejar un job agendado al terminar: `cron.unschedule` en el `trap EXIT`.

---

## 5. El worker

### Forma del Route Handler

```ts
// app/api/cron/sync-feed/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;   // Hobby permite hasta 300 [CITED: vercel docs]

export async function POST(req: Request): Promise<Response> {
  // 1. GUARD PRIMERO. Antes de la fábrica administrativa, por dominio y por CI.
  if (!esSecretoValido(req.headers.get('x-cron-secret'))) {
    return new Response(null, { status: 401 });
  }
  // 2. LA FÁBRICA. El guardarraíl 8 exige que vaya ANTES de nombrar property_secrets.
  const admin = createAdminClient();
  // 3. ... el resto
}
```

Sin `GET`. Un endpoint que muta y responde a `GET` es alcanzable por un prefetch, un crawler o el propio `<link rel=prefetch>` de Next.

### Comparación del secreto en tiempo constante, con el detalle que se pasa por alto

`crypto.timingSafeEqual` **lanza** si los buffers tienen longitudes distintas, y esa excepción es en sí misma un canal lateral de longitud. La forma correcta es normalizar a 32 bytes con un hash antes de comparar:

```ts
// app/api/cron/sync-feed/_guard.ts
import { createHash, timingSafeEqual } from 'node:crypto';

const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest();

export function esSecretoValido(recibido: string | null): boolean {
  if (recibido === null) return false;
  const esperado = process.env.CRON_SHARED_SECRET;
  if (!esperado) return false;                 // sin secreto configurado, se niega
  return timingSafeEqual(sha(recibido), sha(esperado));  // ambos 32 bytes, siempre
}
```

Nombre de la variable: `CRON_SHARED_SECRET`. No lleva prefijo `NEXT_PUBLIC_` y `readServerSecret()` de `lib/env.ts` ya rechaza por runtime cualquier nombre que lo lleve. Hay que añadirla a `.env.example` con el bloque explicativo, que es el contrato del repo.

### BLOQUEANTE MEDIDO: el guardarraíl 7 de CI rompe este worker tal como está diseñado

`scripts/ci/check-service-role.sh`, guardarraíl 7, recorre **toda función de nivel superior que construye la fábrica administrativa** y exige que antes aparezca `exigirAdmin(` o `exigirSesion(`:

```awk
if ($0 ~ /(^|[^A-Za-z0-9_])(exigirAdmin|exigirSesion)[[:space:]]*\(/ && !fabrica) guard = 1
if ($0 ~ /(^|[^A-Za-z0-9_])createAdminClient[[:space:]]*\(/) fabrica = 1
```

Sus únicas exclusiones de archivo son `lib/test/*`. **`app/api/*` NO está excluido** (esa excepción existe solo en el guardarraíl 5). Un Route Handler de cron que construye la fábrica sin llamar a un guard de sesión **pone el job `arquitectura` de CI en rojo**.

Y no se arregla llamando a `exigirAdmin()`, porque el worker no tiene sesión: se autentica por secreto compartido, que es una decisión bloqueada de `03-CONTEXT.md`.

**Arreglo recomendado:** ampliar el regex del guardarraíl 7 a `exigirAdmin|exigirSesion|exigirSecretoCron` y documentar en el propio script por qué el tercero es un guard legítimo. Mantiene la propiedad que el guardarraíl protege ("ninguna función construye la fábrica sin comprobar antes quién pregunta") en vez de abrir un agujero por directorio. Es una tarea de plan, no un detalle.

**Dos condiciones más del mismo script, medidas leyendo el `awk`:**
- El guardarraíl 7 solo reconoce `^(export )?(async )?function <nombre>`. El handler tiene que ser `export async function POST(...)`, **no** `export const POST = async () => {}`, o el recorrido no ve la función y el guard pasa por vacuidad.
- El guardarraíl 8 exige que `createAdminClient()` aparezca **antes** que `property_secrets` dentro de la misma función. Junto con el 7, el orden obligado dentro del cuerpo es: **guard → fábrica → `property_secrets`**. Los tres invariantes se satisfacen a la vez y no hay conflicto, pero el orden no es opcional.

### Fetch: timeouts y las tres protecciones que ya existen

```ts
const res = await fetch(url, {
  signal: AbortSignal.timeout(15_000),
  redirect: 'manual',                       // 2ª mitad anti-SSRF (plan 02-14)
  headers: etag ? { 'If-None-Match': etag } : {},
  cache: 'no-store',
});
```

- **15 s**, con `maxDuration = 60`. Deja margen para el RPC y para el registro de salud.
- **`redirect: 'manual'`** es obligatorio: sin él, la allowlist de host se evade con un 302. El plan 02-14 lo midió y tiene test.
- **Reutilizar `esquemaUrlIcal` de `lib/domain/ical-url.schema.ts`** para revalidar la URL leída de la base. Viene de la base y la escribió un admin, pero revalidar cuesta cero y cierra el caso "alguien editó la fila por SQL".
- **Presupuesto de 5 MiB leyendo por el reader del stream**, no `res.text()`. Ya existe del plan 02-14 (desviación 4): `AbortSignal` cubre la lentitud, no el tamaño.

### Qué escribe de vuelta para que la corrida siguiente pueda razonar

En `calendar_feeds`, todo dentro del RPC:

| Columna | Para qué la lee la corrida siguiente |
|---|---|
| `last_etag` | condicional `If-None-Match`, ahorra el cuerpo entero |
| `last_payload_hash` | corta antes de parsear cuando Airbnb reemite igual (~cada 3 h) |
| `last_event_count` | **número de RESERVAS** (decisión del plan 02-14). Es el operando de la guarda de colapso |
| `last_http_status`, `last_error` | diagnóstico del admin. `last_error` guarda un **código**, no el cuerpo |
| `last_attempt_at` / `last_success_at` | el watchdog alerta por obsolescencia del segundo |
| `consecutive_failures` | el backoff |
| `next_sync_at`, `claimed_at` | la cola y el lease |

Y en `feed_sync_runs`, una fila por corrida con `min_ends_on` (el piso) y los contadores. Esa tabla es la que responde las preguntas abiertas de §2.

### Fallo parcial a mitad de transacción

Cuatro escenarios y qué pasa en cada uno:

| Momento del fallo | Estado resultante | Cómo se recupera |
|---|---|---|
| Antes del RPC (fetch, parseo, guardas) | nada escrito | el worker hace la llamada corta de fallo: `consecutive_failures++`, backoff, `claimed_at = null` |
| Dentro del RPC | **nada escrito**, ni siquiera la salud: una transacción | el `claimed_at` queda puesto; el lease de 10 min devuelve el feed a la cola |
| Después del commit del RPC, antes de responder HTTP | **todo escrito y consistente**, incluida la salud, porque la salud va dentro del RPC | nada que hacer. El 500 hacia `pg_net` es cosmético: es fire-and-forget y nadie lee la respuesta |
| El worker muere entero (OOM, timeout de Vercel) | según arriba | el lease |

La decisión que hace que la tercera fila diga "nada que hacer": **la escritura de salud del éxito va DENTRO del RPC**, no en una llamada aparte. Si estuviera fuera, un worker que muere entre el commit del diff y la escritura de salud dejaría el feed diffeado pero con `last_success_at` viejo, y el watchdog alertaría de un feed sano. Solo la escritura de salud del **fallo** vive fuera, y no puede vivir dentro por definición: la transacción que falló se revirtió.

---

## 6. `node-ical` vs parser propio

### Recomendación: no añadir la dependencia

Cinco argumentos, los tres primeros medidos hoy contra el feed real.

**1. Devuelve un `Date` cuyo instante depende de `process.env.TZ`, y bajo `TZ=UTC` el aseo cae un día antes.**

```
$ TZ=UTC node t.mjs
end: 2026-09-02T00:00:00.000Z   dateOnly= true
end.toLocaleDateString('en-CA',{timeZone:'America/Bogota'}) = 2026-09-01   ← UN DÍA ANTES

$ TZ=America/Bogota node t.mjs
end: 2026-09-02T05:00:00.000Z   dateOnly= true
end.toLocaleDateString('en-CA',{timeZone:'America/Bogota'}) = 2026-09-02
```

`TZ=UTC` es lo que corre Vercel, lo que corre el CI, y lo que el propio `vitest.config.ts` de este repo fija a propósito (*"si algún cálculo de fecha depende de la zona local, tiene que romperse aquí y no en producción a las 19:00 de Bogotá"*). Es el bug de `PITFALLS.md` §2, ahora medido sobre el feed real. Y es exactamente contra lo que se escribió `ical-preview.ts`: *"NO SE CONSTRUYE NI UN SOLO OBJETO `Date` EN ESTE ARCHIVO, a propósito"*.

Sí, `node-ical` marca `dateOnly: true` en el objeto, así que una implementación cuidadosa puede protegerse. Pero eso convierte la librería en una fuente de peligro que hay que recordar neutralizar en cada punto de uso, en un repo cuya disciplina de fechas está construida sobre no tener nunca un `Date` de día de negocio.

**2. Indexa el resultado por `UID` y colapsa duplicados en silencio.** Medido con dos `VEVENT` de fechas distintas y el mismo `UID`:

```
VEVENT en el texto: 2 | eventos devueltos: 1 | ends: ['2026-10-06']
```

Gana el último y el primero desaparece sin aviso. La guarda de colapso no salta (el conteo no es cero), el diff ve una reserva menos, y esa reserva pierde su aseo. Para un pipeline cuyo único trabajo es *no perder un checkout*, un parser que puede tragarse un evento sin decir nada está descalificado.

**3. La complejidad que justifica la librería no existe en este feed.** Seis propiedades, cero `RRULE`, cero `VTIMEZONE`, cero `VALARM`, cero `DATE-TIME`. La expansión de recurrencias y la resolución de zonas horarias, que son el 90% del valor de `node-ical`, no se usan.

**4. Superficie de suministro.** `node-ical@0.27.1` trae `rrule-temporal` y `temporal-polyfill`, y declara `engines: { node: '>=22' }`. No es enorme, pero es distinto de cero para un formato que ya se parsea en 60 líneas.

**5. La mitad del trabajo ya está hecha y probada contra el feed real.** `previsualizarIcs` da `{totalEventos: 15, reservas: 15, bloqueos: 0, proximoCheckout: '2026-09-02'}`, correcto, sin dependencias y sin `Date`.

### Lo que sí hay que implementar, exactamente

Lo que se ganaría de `node-ical` y que hay que escribir. La lista es corta y es la especificación del parser:

| Comportamiento | Estado hoy | Trabajo |
|---|---|---|
| Desplegado RFC 5545 §3.1 (`\n` + espacio o tab) | **hecho** en `desdoblar()` | conservar. **Falta la fixture CRLF**: el feed real llegó normalizado a LF y ninguna fixture del repo tiene CRLF |
| Desescapado de valores de texto (`\n`, `\,`, `\;`, `\\`) | falta | ~6 líneas. Hace falta para separar la URL del teléfono en el `DESCRIPTION` |
| Tolerancia a parámetros (`DTEND;VALUE=DATE:` y `DTEND:`) | hecho | conservar |
| Nombres de propiedad case-insensitive | hecho | conservar |
| **Anidamiento `BEGIN`/`END`** para que un `VALARM` o `VTIMEZONE` dentro de un `VEVENT` no filtre su `DTSTART` | **falta**, el escáner de la Fase 2 es plano | ~10 líneas con una pila de componentes. Airbnb no los manda hoy; un `DTSTART` anidado envenenaría una fecha en silencio |
| **Rechazar `DATE-TIME`** en vez de adivinar (`DTEND;TZID=Europe/Madrid:20260406T110000`) | ignora, no escala | escalar a `desconocido` + alerta. Adivinar la zona es el fallo documentado nº 6 de "feeds que sincronizan pero mal" |
| Devolver los campos **como cadena cruda**, nunca como `Date` | hecho | invariante del archivo. Que sea grep-able en CI |

**Si aun así se elige `node-ical`**, las mitigaciones obligatorias son dos y hay que escribirlas en el plan: (a) **jamás** tocar `.start` ni `.end`, re-extraer el `YYYYMMDD` del texto fuente con regex; (b) **jamás** iterar `Object.values(parsed)`, recorrer los bloques `VEVENT` del texto fuente para no perder duplicados de `UID`. Con esas dos, `node-ical` aporta el desplegado y el desescapado, o sea ~20 líneas, con dos deps y `node >= 22`. El cálculo no da.

### Qué pasa con `ical-preview.ts`

**Se conserva tal cual.** Su cabecera dice que la divergencia entre su conteo y el del pipeline es deliberada y aceptable, y que nadie debe "arreglarla". La Fase 3 escribe `lib/domain/ical.ts` al lado. El único cambio permitido es extraer `desdoblar()` a un módulo compartido para que las dos orillas no tengan dos copias del desplegado, que es la única función donde una divergencia sí sería un defecto.

---

## 7. Alertas

### Las cinco condiciones del criterio 5, y dónde se computa cada una

| # | Alerta | Requisito | Dónde | Por qué ahí |
|---|---|---|---|---|
| 1 | Un link deja de responder | SYNC-09 | `pg_cron`: `feed_health_watchdog()`, cada hora, por obsolescencia de `last_success_at` | Un feed muerto devuelve 200 con HTML: no hay excepción que capturar. Solo la obsolescencia lo ve |
| 2 | El propio job deja de correr | SYNC-10 | **Doble**: (a) el mismo watchdog cuando `count(obsoletos) = count(activos)`; (b) **el dashboard de la Fase 4, al leer** | Solo (b) no es ciega a su propia muerte. Ver §4 |
| 3 | Checkout y checkin el mismo día | SYNC-07 | dentro de `sync_feed_apply()`, **recalculado en cada pasada** | Es un hecho derivado del feed, no un evento. Si la reserva se mueve, `is_urgent` tiene que apagarse solo |
| 4 | Extensión creada como reserva nueva | SYNC-08 | dentro de `sync_feed_apply()`, sobre `needs_review` | Necesita ver la corrida anterior y la nueva en la misma transacción |
| 5 | Feed vacío, inválido o truncado | SYNC-06 | **en el worker**, antes del RPC | Es un hecho del transporte, no del dominio. Si llega al RPC ya es tarde |

### `is_urgent`: recalcular, no acumular, y la trampa del `CHECK`

```sql
update public.cleanings c
   set is_urgent = exists (
         select 1 from public.calendar_reservations r
          where r.property_id = c.property_id
            and r.disappeared_at is null
            and r.starts_on = c.scheduled_date)
 where c.property_id = v_property
   and c.origin = 'ical'
   and c.state is distinct from 'cancelada'
   and c.is_managed              -- ← SIN ESTO, 23514
   and c.scheduled_date >= public.today_bog();
```

`cl_unmanaged_is_inert` exige `is_urgent is false` cuando `is_managed = false`. Un update sin ese filtro revienta con `23514` en el primer apartamento de gestión externa, y hay cinco en la semilla. No está dicho en ningún documento de research.

Caso real que este cálculo tiene que producir: el feed trae `DTEND=20261010` de una reserva y `DTSTART=20261010` de otra. El aseo del 2026-10-10 nace `is_urgent = true`.

### La alerta de "el job está muerto" y su trampa

La trampa que nombra la pregunta: una alerta computada dentro del job solo dispara cuando el job corre. Y subirla un nivel (un segundo job de `pg_cron` que vigila al primero) no la resuelve: si `pg_cron` muere, mueren los dos.

**No hay solución dentro de la base.** La honestidad aquí vale más que una arquitectura que finge cobertura. Las dos capas recomendadas:

1. **El dashboard de la Fase 4 la computa al leer.** `max(last_success_at)` sobre feeds activos, umbral 3 h. Se dispara aunque no corra nada dentro de la base. Coste: una consulta en una página que el admin abre igual. **Es la que cierra el agujero.**
2. El watchdog en `pg_cron` se mantiene, porque cubre bien lo que sí puede cubrir: el job corre y todos los feeds fallan.

Hueco residual, y hay que escribirlo en el plan en vez de taparlo: si el admin no abre el dashboard, nadie se entera. Un dead man's switch externo (healthchecks.io free tier) pingado por `pg_net` lo cierra, y se registra como idea diferida.

### El anti-tormenta

```sql
-- dentro de feed_health_watchdog()
select count(*) filter (where obsoleto), count(*) into v_obsoletos, v_activos
  from ...;

if v_obsoletos = v_activos and v_activos > 1 then
  -- UNA alerta de job. Ninguna de feed.
else
  -- una alerta POR FEED obsoleto.
end if;
```

Sin esto, el día que el scheduler muera el admin recibe 34 notificaciones de "calendario caído" y ninguna que diga la verdad. `PITFALLS.md` §11 nombra el problema ("dispara todo el tiempo... el ruido entierra las alertas reales") y no lo aterriza; esta es la regla concreta.

### La tabla de alertas: no hace falta una nueva

`public.notifications` de la Fase 1 ya tiene todo: `recipient_id`, `type`, `title`, `body`, `url`, `cleaning_id`, `property_id`, `payload jsonb`, `dedupe_key`, y el índice único parcial `notifications_dedupe_idx (recipient_id, dedupe_key) where dedupe_key is not null`. Y ya es outbox de push para la Fase 5.

Los `notification_type` que existen y sirven: `calendario_caido`, `extension_sospechosa`, `aseo_cancelado`.

Los que faltan: "formato desconocido" y "job muerto".

**Medición que cambia la respuesta.** El comentario de `20260831205736_02_enums.sql` dice que `alter type ... add value` "NO corre dentro de una transacción". Sobre PG 17.6 en este stack, eso es de una versión anterior de Postgres:

```
begin; alter type public.notification_type add value 'formato_desconocido'; -> ALTER TYPE, rollback OK
begin; alter type ...; select 'formato_desconocido'::public.notification_type;
  -> ERROR: unsafe use of new value "formato_desconocido" of enum type notification_type
     HINT: New enum values must be committed before they can be used.
```

O sea: **el `ALTER TYPE` sí corre en transacción; lo que no se puede es usar el valor nuevo en esa misma transacción.** En la práctica, añadir un valor exige **su propia migración**, separada de cualquier migración que lo use. Es una restricción real, más suave que la que dice el comentario, y hay que corregir ese comentario en la fase que toque el enum.

**Recomendación: no tocar el enum.** Usar `calendario_caido` con un discriminador en `payload`:

```jsonc
{ "scope": "feed", "feed_id": "…", "motivo": "sin_respuesta" }
{ "scope": "job",  "motivo": "todos_los_feeds_obsoletos" }
{ "scope": "feed", "feed_id": "…", "motivo": "formato_desconocido", "eventos": 15 }
```

Razones: evita dos migraciones y su orden; la Fase 4 necesita un solo carril visual de "calendario" en el panel de una sola jerarquía; y `payload` ya existe con `default '{}'::jsonb`. Si el planner prefiere el enum, es viable con dos archivos de migración y hay que decirlo explícitamente.

### `dedupe_key`, y su otra trampa

El patrón de `ARCHITECTURE.md` es `'feed_dead:' || id || ':' || to_char(date_trunc('hour', now()),'YYYYMMDDHH24')`. El cubo horario es lo que permite que la alerta **se repita**: sin él, un feed caído alertaría una vez y nunca más, y el admin que la marcó como leída no vuelve a saber. Con él, y combinado con `dead_alert_sent_at < now() - interval '6 hours'`, la cadencia efectiva es una alerta por feed cada 6 h. Es lo correcto, pero hay que entender que **el cubo es lo que produce repetición, no lo que la evita**, que es como se lee a primera vista.

Claves recomendadas:

| Alerta | `dedupe_key` |
|---|---|
| Feed caído | `feed_dead:<feed_id>:<YYYYMMDDHH>` con `dead_alert_sent_at` de 6 h |
| Job caído | `job_dead:<YYYYMMDDHH>` (sin `feed_id`: una sola, no 34) |
| Extensión sospechosa | `ext:<cleaning_id>` **sin cubo horario**: es un hecho puntual sobre un aseo concreto y repetirlo cada hora es acoso |
| Aseo cancelado por el sync | `cancel:<cleaning_id>` sin cubo, misma razón |
| Formato desconocido | `fmt:<feed_id>:<YYYYMMDD>` cubo diario: es un problema de formato, no urgente por hora |

Fan-out: `notifications.recipient_id` es `not null` y referencia `profiles`. Cada alerta se inserta una vez por admin activo (`cross join profiles where role = 'admin' and is_active`).

---

## 8. Privacidad

### Dónde muere el teléfono: en la normalización, y por el tipo

El dato personal no debe llegar a la frontera de la base. La forma de garantizarlo no es una convención ni un `delete obj.description`: es que **el tipo de salida del normalizador no tenga dónde ponerlo**.

```ts
// lib/domain/ical-normalizar.ts

/** Lo que el parser saca del texto. Contiene dato personal. NO CRUZA ESTE MÓDULO. */
type VEventoCrudo = {
  uid: string;
  summary: string | null;
  dtstart: string;       // 'YYYYMMDD' crudo, nunca Date
  dtend: string;         // 'YYYYMMDD' crudo, nunca Date
  description: string | null;   // ← trae los 4 dígitos del teléfono
};

/**
 * Lo que sale hacia la base. NO TIENE CAMPO PARA LA DESCRIPCIÓN.
 * No es que se limpie: es que no existe la ranura. Pasar el teléfono
 * hacia adelante es un error de compilación, no un descuido de revisión.
 */
export type EventoNormalizado = {
  uid: string;
  reservationCode: string | null;   // 'HME3F6BX75', regex sobre la URL
  summary: string | null;           // 'Reserved' | 'Airbnb (Not available)' | …
  startsOn: string;                 // 'YYYY-MM-DD', corte de cadena
  endsOn: string;                   // 'YYYY-MM-DD', corte de cadena
  clasificacion: 'reserva' | 'bloqueo' | 'desconocido';
  payloadHash: string;              // sha256 sobre uid|starts|ends|summary|code
};
```

Detalle que importa: **`payloadHash` se calcula sobre los campos normalizados, no sobre el `VEVENT` crudo.** Un hash del crudo incluiría el teléfono, y aunque un sha256 no sea reversible, sería un derivado del dato personal persistido, y además haría que el hash cambiara cuando Airbnb rotara un dígito sin que cambiara nada relevante, disparando diffs vacíos.

### Consecuencia sobre el schema: `raw_description` se queda en NULL, con `CHECK`

`calendar_reservations.raw_description` existe desde la migración 04. La decisión bloqueada es que no se persiste. Un comentario no lo garantiza y una convención se olvida en el tercer refactor:

```sql
-- migración 11
alter table public.calendar_reservations
  add constraint cal_res_sin_descripcion check (raw_description is null);

comment on column public.calendar_reservations.raw_description is
  'SIEMPRE NULL, impuesto por CHECK. El DESCRIPTION del feed de Airbnb trae los últimos 4 dígitos del teléfono del huésped: es dato personal y no se persiste (03-CONTEXT.md).';
```

Se prefiere el `CHECK` a `drop column` porque el `drop` cambia `lib/database.types.ts` y la puerta `typegen drift` sin ganar nada que el `CHECK` no dé. Y la columna que sí queda para diagnosticar un cambio de formato es `summary`, que no contiene dato personal.

`last_error` de `calendar_feeds` es una columna que el admin ve en pantalla. **Guarda un código, nunca un mensaje libre ni un trozo del cuerpo:** `'http_500'`, `'no_es_ical'`, `'content_type_html'`, `'timeout'`, `'cuerpo_excede_5mib'`, `'cero_reservas_clasificadas'`, `'redirect_bloqueado'`. Enumerado, no interpolado.

### Logs

El worker solo registra `feed_id`, contadores, `http_status` y un código de error. Nunca el cuerpo, nunca el `DESCRIPTION`, y **nunca la URL**, que es una credencial (Fase 2, T-02-74).

### Los tests que lo demuestran

Cinco capas, de la más barata a la más definitiva.

**1. Unitario sobre el normalizador, contra la fixture real.**

```ts
it('el teléfono del huésped no sale del normalizador', () => {
  const crudo = fixture('airbnb-real-anonimizado.ics');
  const eventos = normalizarIcs(crudo);
  const serializado = JSON.stringify(eventos);

  // Los 15 teléfonos reales de la fixture, extraídos del propio archivo:
  // así el test no envejece cuando la fixture cambie.
  const telefonos = [...crudo.matchAll(/Phone Number \(Last 4 Digits\): (\d{4})/g)]
    .map((m) => m[1]);
  expect(telefonos).toHaveLength(15);          // el test se prueba a sí mismo

  expect(serializado).not.toMatch(/Phone Number/i);
  expect(serializado).not.toMatch(/Last 4 Digits/i);
  for (const t of telefonos) expect(serializado).not.toContain(t);

  // CONTROL: los códigos SÍ tienen que estar, o el test pasaría con salida vacía
  expect(eventos.filter((e) => e.reservationCode !== null)).toHaveLength(15);
});
```

La última aserción es el control que impide el verde por vacuidad: sin ella, un normalizador que devuelve `[]` pasa el test.

**2. Señuelo obligatorio.** Una variante que conserve `description` en `EventoNormalizado` tiene que poner el test en rojo. Es la práctica que la Fase 2 ya usa (57 señuelos, 53 atrapados) y sin la cual la aserción de ausencia no vale nada.

**3. Integración: barrido de TODA la base.** Es la que sobrevive a que alguien añada una columna dentro de seis meses.

```ts
// tras correr el sync completo contra el stack local con la fixture real
const { stdout } = await exec(
  `docker exec supabase_db_vivaguest pg_dump -U postgres -d postgres --data-only --schema=public`
);
expect(stdout).not.toMatch(/Phone Number/i);
expect(stdout).not.toMatch(/Last 4 Digits/i);
```

**Trampa a evitar, y es real:** no buscar los 4 dígitos sueltos. `'1000'` es uno de los teléfonos de la fixture y también aparece dentro de cualquier tarifa en COP (`120000`, `100000`). La aserción va sobre el **patrón de la línea del teléfono**, no sobre los dígitos pelados. Un test que busque `'1000'` en el dump es rojo permanente por una razón que no tiene nada que ver con privacidad, y acabará borrado.

**4. Captura de logs.** Espiar `console.log/info/warn/error` durante la corrida de integración, unir todo, y afirmar que no aparece `Phone Number`, ni ningún teléfono, ni el `?s=` de la URL del feed.

**5. Guardarraíl estructural en CI.** Añadir a `scripts/ci/check-service-role.sh`: ningún archivo bajo `app/` ni `lib/` puede nombrar `raw_description` fuera de una migración. Grep de tres líneas, permanente, y atrapa la reintroducción antes de que exista un test que la cubra.

---

## Don't Hand-Roll

| Problema | No construir | Usar | Por qué |
|---|---|---|---|
| Cadencia y reintentos | un `setInterval` en un proceso, o un cron externo | `pg_cron` + `next_sync_at` | El scheduler ya existe, está en `shared_preload_libraries` y trae historial de corridas gratis |
| "Máximo un aseo por apartamento y fecha" | un `select ... if exists ... insert` | `cleanings_one_active_per_property_date` + `on conflict do nothing` | La comprobación en dos pasos tiene carrera. El índice no |
| "Un aseo vivo por reserva" | conteo en la aplicación | `cleanings_one_live_per_reservation` | Igual, y ya está |
| Transiciones legales del aseo | un `switch` en TypeScript | `tg_cleanings_snapshot()` | Ya rechaza con `P0001`. `service_role` salta RLS, no salta triggers |
| Snapshot financiero y `is_managed` | copiar campos en el `insert` | el mismo trigger | Ya lo hace, y lo reimpone en `update` |
| Deduplicar notificaciones | comprobar antes de insertar | `dedupe_key` + `notifications_dedupe_idx` | Ya está |
| Día calendario de Bogotá en SQL | `current_date`, `now()::date` | `public.today_bog()` | Prohibido por el guardarraíl 4 de CI. A las 19:00 de Bogotá el día UTC ya es otro |
| Día calendario de Bogotá en TS | `new Date(iso)`, `toISOString().slice(0,10)` | `hoyBog()` de `lib/domain/dates.ts`, y comparar cadenas `'YYYY-MM-DD'` | El orden lexicográfico coincide con el cronológico y hace imposible el off-by-one |
| Desplegado y parseo de iCal | `node-ical` | `desdoblar()` extendido | Ver §6: dos bugs medidos, y la complejidad que lo justifica no está en este feed |
| Custodia del secreto del cron | variable de sesión o literal en el job | Vault | `cron.job.command` es texto plano, medido |
| Allowlist anti-SSRF | un regex sobre la URL | `esquemaUrlIcal` de la Fase 2 | Ya parsea con `URL` y compara con frontera de etiqueta, con 25 tests |
| Comparación del secreto | `a === b` | `timingSafeEqual` sobre `sha256` de ambos | `===` es cortocircuito; `timingSafeEqual` a pelo lanza con longitudes distintas |
| Diff transaccional | varios `.from().upsert()` | un RPC | supabase-js no tiene transacciones |

**Idea de fondo:** el 70% de los invariantes de esta fase ya los impone la Fase 1. El trabajo de la Fase 3 no es reimplementarlos, es **no romperlos** y traducir sus códigos de error a decisiones (`23505` sobre `cleanings_one_active_per_property_date` es un choque legítimo con un aseo manual, no un bug).

---

## Common Pitfalls

### Pitfall 1: el reconcile cancela el aseo de hoy

**Qué pasa:** el feed de Airbnb no exporta el pasado. Un `DTEND` que ya pasó sale del feed, el diff ingenuo concluye "cancelada" y cancela el aseo mientras la aseadora va camino al apartamento.
**Por qué:** el patrón "estado deseado = feed" es correcto para configuración declarativa y equivocado para una fuente externa parcial con ventana móvil.
**Cómo evitarlo:** los tres candados de §2. El más fuerte es el **piso del feed**, porque se deriva de la propia corrida y funciona sin saber dónde está el borde.
**Señales tempranas:** `feed_sync_runs.cleanings_cancelled > 0` con `min_ends_on` que saltó en la misma corrida.

### Pitfall 2: el off-by-one del `DTEND`

**Qué pasa:** el aseo cae el día antes (huésped adentro) o el día después (huésped nuevo adentro).
**Por qué:** `DTEND` de un evento de día completo es exclusivo y **es** el día del aseo, sin restar. Y cualquier `Date` de por medio mueve el día según `TZ`.
**Cómo evitarlo:** nunca construir un `Date` para un día de negocio. `'20260902'` a `'2026-09-02'` es un corte de cadena. Comparar cadenas: para `YYYY-MM-DD` el orden lexicográfico es el cronológico.
**Señales tempranas:** cualquier `new Date(` en `lib/domain/ical*.ts`. Merece un grep en CI.

### Pitfall 3: aseos fantasma por bloqueos del propietario

**Qué pasa:** un apartamento cerrado tres meses genera ~90 aseos, uno por cada bloqueo de 1 día de la ventana de reserva.
**Cómo evitarlo:** whitelist positiva sobre `DESCRIPTION`, clasificación de tres valores, y `desconocido` no genera aseo.
**Señales tempranas:** `feed_sync_runs.block_count` alto con `cleanings_created` alto en el mismo apartamento.

### Pitfall 4: el tick del cron no es la cadencia

**Qué pasa:** con `*/5 * * * *` y `next_sync_at = +30 min`, la cadencia real es 30 a 35 min. El criterio 1 dice 30.
**Cómo evitarlo:** tick de `'1 minute'`, y un job de poda de `cron.job_run_details`, que `pg_cron` no limpia solo.
**Señales tempranas:** `pg_total_relation_size('cron.job_run_details')` creciendo.

### Pitfall 5: la guarda de colapso mira los eventos, no las reservas

**Qué pasa:** Airbnb cambia el formato del `DESCRIPTION`, los 15 eventos siguen llegando, todos se clasifican `desconocido`, la guarda `eventos.length === 0` no salta y el reconcile cancela todo.
**Cómo evitarlo:** la guarda va sobre **reservas clasificadas**, no sobre eventos. Es el acoplamiento que hace segura la falla cerrada.
**Señales tempranas:** `unknown_count > 0` en `feed_sync_runs`.

### Pitfall 6: `is_urgent` sobre una fila informativa revienta

**Qué pasa:** `23514` en `cl_unmanaged_is_inert` al recalcular urgencia sobre un apartamento con `gestion_vivaguest = false`. Hay cinco en la semilla.
**Cómo evitarlo:** `and c.is_managed` en el `where` del recálculo.

### Pitfall 7: dos aseos vivos apuntando a la misma reserva

**Qué pasa:** `23505` en `cleanings_one_live_per_reservation` al crear el aseo nuevo de una reserva movida cuyo aseo viejo no se pudo cancelar.
**Cómo evitarlo:** el aseo nuevo nace con `reservation_id = null` y `needs_review = true` cuando el viejo sobrevive. Ver §1 caso (a).

### Pitfall 8: contar un `304` como corrida de diff

**Qué pasa:** el contador de ausencias avanza sin que se haya observado nada, y cancela justo cuando Airbnb está más estable.
**Cómo evitarlo:** `disappeared_at` solo lo toca `sync_feed_apply()`, y solo se llama cuando hubo cuerpo que diffear.

### Pitfall 9: el guardarraíl 7 de CI rompe el worker

**Qué pasa:** `arquitectura` en rojo porque un Route Handler construye la fábrica administrativa sin `exigirAdmin(` ni `exigirSesion(` delante, y `app/api/*` no está exceptuado en ese guardarraíl.
**Cómo evitarlo:** ampliar el regex a `exigirSecretoCron` y documentarlo. Y el handler tiene que ser `export async function POST`, no `export const POST =`.

### Pitfall 10: se olvida el `revoke/grant` de las funciones nuevas

**Qué pasa:** `dispatch_feed_syncs()`, `sync_feed_apply()` y `feed_health_watchdog()` nacen ejecutables por `anon`. `alter default privileges` **no** lo arregla en PG 17.6, medido en el hallazgo 5 de `deferred-items.md`.
**Cómo evitarlo:** el par `revoke all ... from public, anon` + `grant execute ... to <rol>` al lado de cada definición. El guardarraíl 10 de pgTAP lo verifica.

### Pitfall 11: los secretos de Vault no existen en el entorno nuevo

**Qué pasa:** se hace `db push` a un proyecto Supabase recién creado, el dispatcher no encuentra `cron_shared_secret` y todo el sync está muerto sin que nada lo diga.
**Cómo evitarlo:** el `raise exception` explícito hace que `cron.job_run_details.status = 'failed'`, y el watchdog alerta. Y un checkpoint en el plan de despliegue.

### Pitfall 12: el CRLF que ninguna fixture prueba

**Qué pasa:** el feed real llega con CRLF y ninguna fixture del repo lo tiene. Si `desdoblar()` se refactoriza y pierde el `replace(/\r\n/g,'\n')`, el desplegado deja de funcionar contra el feed de verdad y **todos los tests siguen verdes**.
**Cómo evitarlo:** una fixture CRLF nueva y una aserción.

---

## Code Examples

### Desplegado y parseo sin `Date` (extiende lo que ya existe)

```ts
// lib/domain/ical.ts
// Fuente del desplegado: RFC 5545 §3.1, ya implementado en ical-preview.ts

/** RFC 5545 §3.1: línea física que empieza por espacio o tab continúa la anterior. */
export function desdoblar(texto: string): string {
  return texto.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
}

/** RFC 5545 §3.3.11: valores TEXT escapan \n \, \; \\ */
export function desescapar(valor: string): string {
  return valor.replace(/\\([nN,;\\])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c));
}

/** '20260904' -> '2026-09-04'. Corte de cadena. Ni parseo, ni zona horaria, ni Date. */
export function aIso(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}
```

### El guard del worker

```ts
// app/api/cron/sync-feed/_guard.ts
import { createHash, timingSafeEqual } from 'node:crypto';

const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest();

/**
 * timingSafeEqual LANZA si los buffers difieren en longitud, y esa excepción
 * es en sí misma un canal lateral. Se normaliza a 32 bytes con sha256 antes.
 */
export function exigirSecretoCron(recibido: string | null): void {
  const esperado = process.env.CRON_SHARED_SECRET;
  if (!recibido || !esperado) throw new RespuestaNoAutorizada();
  if (!timingSafeEqual(sha(recibido), sha(esperado))) throw new RespuestaNoAutorizada();
}
```

### Watchdog con el discriminador job/feed

```sql
-- Fuente: adaptado de .planning/research/ARCHITECTURE.md §Watchdog,
-- con el discriminador de tormenta añadido.
create or replace function public.feed_health_watchdog()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_activos    int;
  v_obsoletos  int;
begin
  select count(*),
         count(*) filter (where f.last_success_at is null
                             or f.last_success_at < now() - interval '3 hours')
    into v_activos, v_obsoletos
    from public.calendar_feeds f
   where f.is_active;

  if v_activos = 0 then
    return;
  end if;

  if v_obsoletos = v_activos and v_activos > 1 then
    -- TODOS obsoletos: es el JOB, no los feeds. UNA alerta, no v_activos.
    insert into public.notifications
      (recipient_id, type, title, body, payload, dedupe_key)
    select p.id, 'calendario_caido',
           'Sincronización de calendarios caída',
           format('Ninguno de los %s calendarios ha sincronizado en más de 3 horas.', v_activos),
           jsonb_build_object('scope','job','motivo','todos_los_feeds_obsoletos'),
           'job_dead:' || to_char(date_trunc('hour', now()), 'YYYYMMDDHH24')
      from public.profiles p
     where p.role = 'admin' and p.is_active
    on conflict do nothing;
    return;
  end if;

  -- ... rama por feed, con dead_alert_sent_at de 6 h
end $$;

revoke all     on function public.feed_health_watchdog() from public, anon, authenticated;
grant  execute on function public.feed_health_watchdog() to postgres;
```

---

## State of the Art

| Enfoque viejo | Enfoque actual | Cuándo cambió | Impacto |
|---|---|---|---|
| `SUMMARY` con nombre de huésped y código de reserva | `SUMMARY:Reserved`, código dentro de la URL del `DESCRIPTION` | 2019-12-01 | Todo sample de GitHub anterior a esa fecha describe un formato que no existe. `PITFALLS.md` documenta uno verificado como falso |
| "Airbnb no manda datos personales desde 2019" | manda los **últimos 4 dígitos del teléfono** en el `DESCRIPTION` | medido hoy | Restricción de privacidad nueva. Ningún documento de research lo contemplaba |
| `alter type ... add value` no corre en transacción | **sí corre**; lo que no se puede es usar el valor en la misma transacción | PG 12+ | El comentario de la migración 02 refleja el comportamiento anterior. Añadir un valor exige su propia migración, no un `psql` a mano |
| `node-ical` con `rrule` + `moment-timezone` | 0.27.1 con `rrule-temporal` + `temporal-polyfill`, `engines: node>=22` | 2026 | Superficie menor de la que suponía `STACK.md`, pero los dos defectos medidos no dependen de las deps |
| Vercel Hobby con `maxDuration` de 10 s | Hobby: default **300 s**, máximo 300 s | fluid compute | `maxDuration = 60` sobra para el worker |

**Obsoleto o corregido en este documento:**
- `ARCHITECTURE.md` §iCal Sync Pipeline: el lease no protege contra ticks solapados, `pg_cron` no solapa un job consigo mismo. Medido.
- `ARCHITECTURE.md` paso 7: la guarda de colapso tiene que ir sobre reservas clasificadas, no sobre eventos.
- `ARCHITECTURE.md` `*/5 * * * *`: da cadencia de 30 a 35 min, y no incluye poda de `cron.job_run_details`.
- `PITFALLS.md` §4: `codigo_reserva` no es "nullable en la práctica", está en 15 de 15. Y el solapamiento de fechas se descarta como identidad.
- `STACK.md`: `node-ical` deja de ser la recomendación.

---

## Costuras con las fases 1 y 2

| Artefacto | Qué garantiza | Qué NO hacer |
|---|---|---|
| `cleanings_one_active_per_property_date` | idempotencia por día | no renombrarlo: `lib/domain/errors.ts` discrimina por el nombre exacto |
| `cleanings_one_live_per_reservation` | idempotencia por reserva | ver Pitfall 7 |
| `tg_cleanings_snapshot()` | `is_managed`, `hora_limite`, tarifas y la máquina de estados | no reimplementar nada de eso en el RPC. `pendiente -> cancelada` ya es legal y el comentario lo atribuye "al sync de la Fase 3" |
| `cleaning_state_transitions.actor_id` | `NULL` cuando escribe el sync | es información, no carencia: distingue "lo canceló el sync" de "lo canceló el admin" |
| `property_secrets.ical_url` | la URL vive fuera de `calendar_feeds` | el guardarraíl 8 obliga a nombrarla solo tras `createAdminClient()` |
| `calendar_feeds.last_event_count` | guarda **RESERVAS**, no eventos (plan 02-14) | no redefinir: rompe el panel de "ya conectado" |
| `lib/domain/ical-preview.ts` | diagnóstico de la Fase 2, deliberadamente más laxo | no "arreglar" la divergencia con el pipeline. Solo compartir `desdoblar()` |
| `lib/domain/ical-url.schema.ts` | allowlist de host y `redirect: 'manual'` | reutilizar tal cual |
| `lib/domain/feed.integration.test.ts` | conteo antes/después con centinela: la Fase 2 no escribe reservas ni aseos | ese test tiene que **seguir en verde** después de la Fase 3. Es la aserción de que la costura no se movió |

---

## Runtime State Inventory

No aplica: la Fase 3 es greenfield sobre schema existente. No hay renombrado, refactor ni migración de datos.

Lo único que se acerca, y por eso se declara explícitamente:

| Categoría | Encontrado | Acción |
|---|---|---|
| Datos almacenados | Ninguno. `calendar_reservations` y `cleanings` con `origin='ical'` están vacías: verificado por el conteo con centinela del plan 02-14 | ninguna |
| Config de servicio vivo | Ninguna. Los proyectos Supabase dev y prod **no existen** (checkpoint A1, abierto desde la Fase 1) | los secretos de Vault son un paso operativo del despliegue, no una migración |
| Estado registrado en el SO | Ninguno | ninguna |
| Secretos y variables | `CRON_SHARED_SECRET` es nueva: va en `.env.example`, en Vercel, y como secreto de Vault. Tres sitios, tres valores que deben coincidir | tarea de plan explícita |
| Artefactos de build | Ninguno | ninguna |

---

## Validation Architecture

### Marco de pruebas

| Propiedad | Valor |
|---|---|
| Unitarios | `vitest` 4.1.11, `vitest.config.ts`, `include: lib/**/*.test.ts`, `env: { TZ: 'UTC' }` |
| Integración | `vitest.integration.config.ts`, `include: lib/**/*.integration.test.ts`, contra el stack local, `fileParallelism: false` |
| Base de datos | `pgTAP` vía `supabase test db --local`. Hoy `Files=5, Tests=47, PASS` |
| Estructural | `bash scripts/ci/check-service-role.sh` (8 guardarraíles) |
| E2E | `playwright`, con `PLAYWRIGHT_PORT` obligatorio en worktree |
| Comando rápido | `npm run test:unit` |
| Comando completo | `npm run ci:arch && npx tsc --noEmit && npm run test:unit && npm run test:integration && npm run db:test` |

### Los 5 criterios del ROADMAP, mecánicamente

#### Criterio 1: cada feed se lee cada 30 min en invocación aislada, y un feed caído no impide los demás

| Aserción | Test | Herramienta | Fixture |
|---|---|---|---|
| `pg_cron` y `pg_net` existen y quedan fuera de `public` | `05_sync.test.sql`: `has_extension`, y `extnamespace` no es `public` | pgTAP | — |
| El job `dispatch-feed-syncs` está agendado y activo | `results_eq` sobre `cron.job` | pgTAP | — |
| `dispatch_feed_syncs()` **no** es ejecutable por `anon` | guardarraíl 10 ya existente, sobre todas las funciones | pgTAP | — |
| Un feed vencido produce exactamente una fila en `net.http_request_queue` | integración: sembrar 3 feeds, uno vencido, llamar a la función, contar | vitest integración | — |
| Tres feeds vencidos producen **tres** POST, uno por feed | ídem, contar 3 | vitest integración | — |
| **El feed A caído no impide el B**: dos feeds, uno apuntando a un puerto muerto | integración: correr el worker de A (falla) y el de B (éxito); afirmar que B avanzó `next_sync_at` +30 y A entró en backoff | vitest integración | sintética |
| El lease impide el doble despacho del mismo feed | integración: llamar dos veces seguidas, afirmar **una** sola petición | vitest integración | — |
| La cadencia efectiva es 30 a 31 min | aritmética sobre `next_sync_at`, no reloj real | vitest unitario | — |

**Lo que NO se puede verificar sin producción:** que el job de verdad corre cada minuto durante días. Se aproxima en local con `cron.schedule('...','10 seconds', ...)` y `cron.job_run_details`, medido hoy que funciona.

#### Criterio 2: un checkout genera exactamente un aseo `normal` en la fecha correcta, sin duplicados, e informativo si `gestion_vivaguest = false`

| Aserción | Test | Fixture |
|---|---|---|
| El feed real genera **exactamente 15** aseos, con las 15 fechas `DTEND` exactas | integración de punta a punta | **real** |
| El día del aseo es el `DTEND` sin restar: la reserva `20260830→20260902` da aseo el `2026-09-02` | unitario del normalizador + integración | **real** |
| Correr el mismo feed **tres veces** deja 15 aseos, no 45 | integración | **real** |
| `is_managed = false` produce fila con `state`, `aseador_id` y `tarifa` en NULL | integración con un apartamento externo de la semilla | sintética |
| Un aseo manual preexistente en una fecha de checkout produce `23505` sobre `cleanings_one_active_per_property_date`, se registra y **no** duplica | pgTAP | — |
| **Bajo `TZ=UTC` la fecha no se mueve** | `vitest.config.ts` ya fija `TZ: 'UTC'`; el mismo test bajo `TZ=America/Bogota` da lo mismo | **real** |

Señuelo obligatorio: restar un día al `DTEND` tiene que poner en rojo la aserción de las 15 fechas.

#### Criterio 3: los bloqueos no generan aseos; un feed vacío, inválido o truncado no cancela nada y queda registrado

| Aserción | Test | Fixture |
|---|---|---|
| `solo-bloqueos.ics` produce **0** aseos | unitario del clasificador + integración | sintética (la real no sirve: cero bloqueos) |
| 90 bloqueos de 1 día producen **0** aseos | unitario | **nueva**: `airbnb-bloqueos-1dia.ics` |
| Un `SUMMARY` nunca visto sin `Reservation URL` da `desconocido`, **0** aseos y **1** alerta | unitario + integración | **nueva**: `airbnb-summary-desconocido.ics` |
| `vacio.ics` con `last_event_count = 15` **no** llama al RPC y registra `outcome='colapso'` | integración | sintética |
| `html-200.html` (200 con HTML) **no** llama al RPC | integración | sintética |
| Cuerpo truncado a mitad de un `VEVENT` **no** llama al RPC | unitario + integración | **nueva** |
| **La guarda sobre reservas clasificadas**: 15 eventos que todos clasifican `desconocido` **no** cancelan nada | integración | **nueva**: el feed real con `Reservation URL` mutilado |
| Tras cualquiera de los anteriores, `count(cleanings where cancelled_at is not null)` **no cambió** | integración con centinela sembrado, patrón del plan 02-14 | — |
| Redirección 302 hacia otro host: bloqueada | ya cubierto por la Fase 2 | — |

La última fila de aserciones necesita el patrón de **centinela + control** del plan 02-14: sembrar aseos antes de medir para que la igualdad no sea `0 === 0`, y demostrar en el mismo test que el contador **sí** se mueve cuando de verdad se cancela.

#### Criterio 4: la reserva se mueve o desaparece y el aseo viejo se cancela y aparece uno nuevo, salvo `started_at`

| Aserción | Test | Fixture |
|---|---|---|
| t0 real → t1 con una reserva desplazada: el aseo de la fecha vieja queda `cancelada`, aparece uno nuevo `pendiente` sin `confirmado_at` | integración de dos pasadas | **nueva**: `airbnb-real-movida.ics` |
| Con `started_at` puesto, el aseo **no** se cancela, queda `needs_review = true` y notifica | integración | ídem |
| Con `state = 'completada'`, **no** se cancela: `tg_cleanings_snapshot()` lanza `P0001` | pgTAP `throws_ok` | — |
| Desaparición: en la **primera** corrida solo se marca `disappeared_at`; en la **segunda** se cancela | integración de tres pasadas | **nueva**: `airbnb-real-una-menos.ics` |
| Un `304` entre medias **no** cuenta como corrida de diff | integración con `If-None-Match` | ídem |
| **Ventana protegida**: una reserva con `ends_on = hoy` que desaparece dos veces **no** cancela el aseo, solo `needs_review` | integración con fixture de fechas relativas a hoy | **nueva**, fechas relativas |
| **Piso del feed**: un feed cuyo `min_ends_on` saltó no cancela nada por debajo de ese piso | integración | ídem |
| Cancelar+recrear el mismo día es legal en la base | pgTAP, ya afirmado en la Fase 1 | — |
| `origin = 'manual'` nunca lo toca el reconcile | integración: sembrar un `repaso`, correr el sync, afirmar intacto | — |
| Rotación de `UID` con el mismo código: la reserva se actualiza, el aseo **conserva** `confirmado_at` y `aseador_id` | integración | **nueva**: el feed real con los `UID` reescritos |
| Código nuevo, mismas fechas: **el mismo aseo**, solo se re-apunta `reservation_id` | integración | ídem |
| `cleaning_state_transitions` registra la cancelación con `actor_id = NULL` | pgTAP | — |

#### Criterio 5: las cinco alertas

| Aserción | Test | Fixture |
|---|---|---|
| **Link caído**: `last_success_at` a 4 h atrás en **un** feed produce **una** notificación `calendario_caido` con `scope='feed'` | pgTAP sobre `feed_health_watchdog()` | — |
| **No repite** dentro de 6 h (`dead_alert_sent_at`) | pgTAP, dos llamadas seguidas | — |
| **Job caído**: **todos** los feeds obsoletos producen **una** notificación con `scope='job'` y **ninguna** de feed | pgTAP | — |
| El dashboard computa la alerta al leer: `max(last_success_at)` obsoleto produce el estado | unitario sobre la función pura de umbral (la pantalla es Fase 4) | — |
| **Urgente**: el turnover del 2026-10-10 produce `is_urgent = true` en ese aseo y **solo** en ese | integración | **real** |
| `is_urgent` se **apaga** cuando la reserva entrante se mueve | integración de dos pasadas | **nueva** |
| El recálculo no revienta con `23514` en unidades externas | integración con un apartamento externo de la semilla | — |
| **Extensión**: código nuevo empezando en el `ends_on` de otra que se acortó produce `needs_review` y `extension_sospechosa` | integración | **nueva**: `airbnb-extension-mal-creada.ics` |
| **El turnover sano del feed real NO produce `extension_sospechosa`** | integración | **real**. Es la aserción que separa SYNC-07 de SYNC-08 |
| `needs_review` es pegajoso: una segunda pasada no lo apaga | integración | ídem |
| `dedupe_key` impide la segunda notificación idéntica | pgTAP sobre `notifications_dedupe_idx` | — |

### Privacidad (transversal a los 5)

| Aserción | Test | Fixture |
|---|---|---|
| El normalizador no emite `Phone Number`, ni `Last 4 Digits`, ni ninguno de los 15 teléfonos | unitario, con control positivo de los 15 códigos | **real** |
| `pg_dump --data-only --schema=public` tras el sync completo no contiene el patrón del teléfono | integración | **real** |
| `raw_description` es NULL por `CHECK` | pgTAP `throws_ok` al intentar escribirlo | — |
| Los logs capturados no contienen el patrón ni el `?s=` de la URL | integración con espía de `console.*` | **real** |
| Ningún archivo de `app/` ni `lib/` nombra `raw_description` | guardarraíl nuevo en `check-service-role.sh` | — |

### Estructural

| Aserción | Test |
|---|---|
| El worker pasa los guardarraíles 5, 7 y 8 (orden guard → fábrica → `property_secrets`) | `npm run ci:arch` |
| Ninguna función nueva de `public` es ejecutable por `anon` | guardarraíl 10 de pgTAP, ya existente |
| Ninguna migración usa la función de fecha prohibida | guardarraíl 4 de CI, ya existente |
| `database.types.ts` sincronizado tras las migraciones nuevas | puerta `typegen drift` de `ci/db.yml` |
| `db advisors --type security --fail-on error` sigue en verde con las extensiones nuevas | `ci/db.yml` |
| Ningún `new Date(` en `lib/domain/ical*.ts` | grep nuevo en `check-service-role.sh` |
| **CRLF**: el desplegado funciona con `\r\n` | unitario | **nueva**: `airbnb-real-crlf.ics` |

### Frecuencia de muestreo

- **Por commit de tarea:** `npm run test:unit` (~285 tests hoy, segundos).
- **Por merge de wave:** `npm run ci:arch && npx tsc --noEmit && npm run test:unit && npm run test:integration && npm run db:test`.
- **Puerta de fase:** lo anterior más `npm run test:e2e` con `PLAYWRIGHT_PORT`, y `npm run build`.

### Wave 0: lo que hay que escribir antes de implementar

- [ ] `supabase/tests/05_sync.test.sql` con el `select plan(N)` en rojo. Cubre SYNC-02, 03, 04, 09, 10.
- [ ] `lib/domain/__fixtures__/ical/airbnb-real-crlf.ics` (misma fuente, `\r\n`).
- [ ] `lib/domain/__fixtures__/ical/airbnb-real-movida.ics` (una reserva con `DTEND` desplazado).
- [ ] `lib/domain/__fixtures__/ical/airbnb-real-una-menos.ics` (sin la primera reserva).
- [ ] `lib/domain/__fixtures__/ical/airbnb-real-uid-rotado.ics` (mismos códigos, otros `UID`).
- [ ] `lib/domain/__fixtures__/ical/airbnb-extension-mal-creada.ics`.
- [ ] `lib/domain/__fixtures__/ical/airbnb-bloqueos-1dia.ics` (90 bloqueos de 1 día).
- [ ] `lib/domain/__fixtures__/ical/airbnb-summary-desconocido.ics`.
- [ ] `lib/domain/__fixtures__/ical/airbnb-desc-mutilado.ics` (15 eventos sin `Reservation URL`).
- [ ] Fixture de fechas relativas a hoy para la ventana protegida (generada, no versionada literal).
- [ ] Ampliación del guardarraíl 7 de `check-service-role.sh` a `exigirSecretoCron`.
- [ ] `scripts/dev/sync-local.sh` con `trap EXIT` que hace `cron.unschedule`.

### Lo que NO se puede verificar sin una segunda captura del mismo feed

Se declara aquí para que el verificador de la fase no lo cuente como cubierto:

1. **Si el `UID` de Airbnb sobrevive a un cambio de fechas.** Las fixtures `airbnb-real-movida.ics` y `airbnb-real-uid-rotado.ics` son construidas: prueban que el **código** se comporta bien en los dos mundos, no cuál es el mundo real. Lo resuelve el contador `uid_rotations` de `feed_sync_runs` en producción.
2. **Si la reserva que termina hoy desaparece mañana, y a qué hora.** Ninguna fixture puede probarlo. Lo resuelve la serie de `min_ends_on` de `feed_sync_runs` y la distribución de `disappeared_at`.
3. **Cómo se ve de verdad un bloqueo del propietario.** Cero bloqueos en el feed real. `solo-bloqueos.ics` es sintética y derivada de los mismos documentos que valida: usarla como evidencia es circular. Solo lo cierra capturar un anuncio con fechas bloqueadas a mano, que es un **checkpoint humano** y no una tarea de código.
4. **Que el feed real llega con CRLF.** La fixture llegó normalizada a LF. `airbnb-real-crlf.ics` prueba que el código lo aguanta, no que Airbnb lo manda así. Se confirma con la primera corrida real.
5. **Que Airbnb no manda `RRULE`, `VTIMEZONE` ni `DATE-TIME` en ningún anuncio.** Una captura de un anuncio es evidencia de un anuncio. Por eso el parser **rechaza** esas formas en vez de ignorarlas: `desconocido` + alerta.

---

## Security Domain

### Categorías ASVS aplicables

| Categoría | Aplica | Control |
|---|---|---|
| V2 Autenticación | sí | Secreto compartido en header, `timingSafeEqual` sobre `sha256`. Ninguna cookie, ningún JWT |
| V3 Sesiones | no | El worker no tiene sesión, por decisión bloqueada |
| V4 Control de acceso | sí | `service_role` solo en `lib/supabase/admin.ts`; guardarraíles 1, 5, 7 y 8; RPC con `revoke/grant` explícito |
| V5 Validación de entrada | sí | `zod` sobre el body; `esquemaUrlIcal` sobre la URL; sniff de `BEGIN:VCALENDAR`; `Content-Type`; techo de 5 MiB |
| V6 Criptografía | sí | `node:crypto` para hash y comparación. Vault para el secreto. Nada a mano |
| V7 Errores y logging | sí | `last_error` enumerado, no interpolado. Cero cuerpo y cero URL en logs |
| V8 Protección de datos | sí | El teléfono muere en la normalización, por construcción de tipos. `raw_description` NULL por `CHECK` |
| V12 Comunicación / SSRF | sí | Allowlist de host, `redirect: 'manual'`, `AbortSignal.timeout` |

### Amenazas y mitigaciones

| Amenaza | STRIDE | Mitigación |
|---|---|---|
| El endpoint del cron es público en internet | Spoofing | Secreto compartido en tiempo constante; sin `GET`; 401 sin cuerpo |
| Timing attack sobre el secreto | Information disclosure | `sha256` de ambos lados antes de `timingSafeEqual`. Longitud no observable |
| El secreto en `cron.job.command`, legible | Information disclosure | Vault. `cron.job.command` es texto plano, medido |
| SSRF por la URL del feed | Tampering | Allowlist de host de la Fase 2 + `redirect: 'manual'` |
| Respuesta enorme que agota memoria | DoS | Presupuesto de 5 MiB leyendo el stream |
| Feed lento que agota el `maxDuration` | DoS | `AbortSignal.timeout(15_000)`, y una invocación por feed |
| La URL del feed en un log o en el DOM | Information disclosure | Nunca se registra. Ya cubierto por la Fase 2 (T-02-74) |
| El teléfono del huésped en base o logs | Information disclosure | §8: tipo sin ranura, `CHECK`, barrido de `pg_dump`, guardarraíl de grep |
| Función nueva ejecutable por `anon` | Elevation of privilege | `revoke/grant` explícito por función + guardarraíl 10 |
| Un feed cancela aseos ajenos | Tampering | El RPC filtra por `feed_id` y `property_id` de la fila del feed, nunca por un id del body |
| `service_role` fuera de `admin.ts` | Elevation of privilege | Guardarraíles 1, 3, 5 y 7 de CI |
| Cancelación masiva por feed degradado | Tampering / DoS de negocio | Los tres candados de §2 + la guarda de colapso sobre reservas clasificadas |

---

## Assumptions Log

| # | Afirmación | Sección | Riesgo si es falsa |
|---|---|---|---|
| A1 | Los bloqueos del propietario llevan `SUMMARY: Airbnb (Not available)` y **no** llevan `Reservation URL` | §3 | Si un bloqueo trajera `Reservation URL`, se generarían aseos fantasma. Mitigado por la whitelist y por el alerta de `desconocido`, no eliminado |
| A2 | Los bloqueos de ventana de reserva se emiten como eventos de 1 día | §3 | Solo cambia la **magnitud** del argumento de fallar cerrado, no su dirección |
| A3 | El `reservation_code` de Airbnb es estable a lo largo de la vida de la reserva | §1 | Si rota, el nivel 1 de identidad se degrada al nivel 2 (`uid`) y el sistema sigue funcionando, con más `needs_review`. Se instrumenta con `uid_rotations` |
| A4 | Airbnb no emite `RRULE`, `VTIMEZONE`, `VALARM` ni `DATE-TIME` en ningún anuncio | §6 | El parser **rechaza** esas formas en vez de ignorarlas, así que el fallo es ruidoso: `desconocido` + alerta |
| A5 | El feed real llega con CRLF (la fixture está normalizada a LF) | §Lo que la fixture no prueba | Si llegara con LF, `desdoblar()` funciona igual. Riesgo cero, se declara por honestidad |
| A6 | Vercel Hobby permite `maxDuration = 60` en un Route Handler de App Router | §5 | Documentado como default 300 s. Si se equivocara, el fetch de 15 s cabe en cualquier techo |
| A7 | El `db advisors --type security` sigue en verde con `pg_cron` en `pg_catalog` y `pg_net` en `extensions` | §4 | Si emitiera un ERROR, la puerta de CI se pone roja. Verificable en la primera tarea de la fase, coste minutos |
| A8 | El admin abre el dashboard con frecuencia suficiente para que la alerta de "job muerto" computada al leer sirva | §7 | Si no lo abre, el job muerto pasa desapercibido. Es el hueco residual declarado; lo cierra un dead man's switch externo, diferido |
| A9 | El feed anonimizado conserva la estructura del `UID` del original (prefijo del anuncio + sufijo de reserva) | §1 | Lo afirma el `README.md` de la fixture. Si el prefijo fuera un artefacto de la anonimización, la validación "todos los eventos comparten prefijo" daría falsos positivos. Es una validación blanda (alerta), no un rechazo |

---

## Open Questions

1. **¿La reserva que termina hoy desaparece mañana, o hoy mismo?**
   - Se sabe: a las 12:51 de Bogotá del día del checkout, sigue presente.
   - No se sabe: cuándo se va, ni con qué zona horaria decide Airbnb.
   - Recomendación: ventana protegida `<= today_bog() + 1` y piso del feed. **Los dos candados juntos son correctos bajo cualquier respuesta.** Se resuelve empíricamente con `feed_sync_runs.min_ends_on` en 2 días, y hay un `checkpoint:human-verify` para leerlo.

2. **¿El `UID` de Airbnb sobrevive a un cambio de fechas?**
   - Se sabe: tiene estructura, prefijo constante por anuncio, sufijo de 32 hex. Búsqueda web hoy: no está documentado en ninguna parte.
   - Recomendación: **la pregunta deja de ser bloqueante.** El código de reserva es el nivel 1 de identidad y está en 15 de 15. Y la identidad del aseo no es la reserva. Se instrumenta con `uid_rotations`.

3. **¿Cómo se ve de verdad un bloqueo del propietario en un anuncio de VivaGuest?**
   - Se sabe: cero bloqueos en el único feed real que hay.
   - Recomendación: **checkpoint humano en la fase**, no tarea de código: bloquear tres fechas a mano en un anuncio real, capturar el `.ics`, versionarlo. Cuesta 10 minutos y convierte la parte más frágil del diseño de MEDIA a ALTA. Mientras no exista, la whitelist positiva + `desconocido` + la guarda de colapso hacen que equivocarse no sea destructivo.

4. **Contradicción entre los criterios 2 y 3 del ROADMAP.**
   - El criterio 2 dice "un fin de bloqueo genera un aseo"; el criterio 3 dice "los bloqueos no generan aseos".
   - Recomendación: el planner fija por escrito que "bloqueo" en el criterio 2 es el periodo de ocupación de una reserva, y en el criterio 3 es el bloqueo del propietario. SYNC-02 y SYNC-03 lo respaldan. Sin fijarlo, el verificador tiene dos criterios incompatibles.

5. **¿Enum nuevo o discriminador en `payload` para las alertas de job y de formato?**
   - Medido: `alter type add value` **sí** corre en transacción en PG 17.6, pero el valor no se puede usar en la misma. Dos migraciones.
   - Recomendación: `payload` con `scope`. Evita el orden de migraciones y la Fase 4 quiere un solo carril de "calendario". Decisión del planner.

---

## Environment Availability

Medido hoy contra el stack local corriendo (`supabase_db_vivaguest`, 27 h de uptime).

| Dependencia | Requerida por | Disponible | Versión | Fallback |
|---|---|---|---|---|
| Postgres | todo | sí | 17.6 | — |
| `pg_cron` | scheduler | sí, en `shared_preload_libraries`, sin instalar | 1.6.4 | — |
| `pg_net` | fan-out HTTP | sí, en `shared_preload_libraries`, sin instalar | 0.20.4 | — |
| `supabase_vault` | secreto compartido | sí, **ya instalada** | 0.3.1 | — |
| `pgtap` | tests de base | sí | 1.3.3 | — |
| DNS `host.docker.internal` desde la base | pruebas locales del lazo | sí, `192.168.65.254` | — | — |
| Worker de `pg_net` alcanzando el host | ídem | sí, `status_code = 200` medido | — | — |
| Node | worker y tests | sí | v25.6.1 local, 22 en CI | — |
| Docker | stack local | sí, 12 contenedores sanos | — | — |
| Proyecto Supabase dev | despliegue | **no existe** | — | **todo corre en local**. Es el constraint declarado y el checkpoint A1 |
| Proyecto Supabase prod | despliegue | **no existe** | — | ídem |
| Cuenta de Vercel con el proyecto desplegado | URL base del worker | no verificado | — | en local, `host.docker.internal:3000` |
| Feed real de un anuncio con bloqueos | validar SYNC-03 | **no existe** | — | sin fallback. Checkpoint humano |

**Faltantes sin fallback:** el `.ics` real con bloqueos del propietario. Es la única laguna de datos que ninguna decisión de ingeniería cierra.

**Faltantes con fallback:** los proyectos Supabase dev y prod, y el despliegue en Vercel. El lazo completo se ejercita en local, verificado hoy.

---

## Project Constraints (de ./CLAUDE.md y de los guardarraíles de CI)

Directivas accionables que el planner tiene que respetar. Las que están vigiladas por CI llevan el número de guardarraíl.

1. **La clave de servicio solo se nombra en `lib/supabase/admin.ts`.** (guardarraíl 1)
2. **Ninguna clave secreta con prefijo `NEXT_PUBLIC_`.** (guardarraíl 2, y `readServerSecret()` en runtime)
3. **`lib/supabase/admin.ts` declara `import 'server-only'`.** (guardarraíl 3)
4. **Prohibida la función de fecha de sesión en migraciones y seeds. Usar `public.today_bog()`.** (guardarraíl 4)
5. **La fábrica administrativa solo se importa desde Server Actions, `app/api/` o `lib/test/`.** (guardarraíl 5)
6. **Ningún valor de color literal fuera de `app/globals.css`.** (guardarraíl 6) No aplica a esta fase.
7. **Un guard de sesión va ANTES de construir la fábrica administrativa, por función.** (guardarraíl 7) **Colisiona con el worker: ver Pitfall 9.**
8. **`property_secrets` solo se nombra donde ya se construyó la fábrica, por función.** (guardarraíl 8)
9. **Toda función `SECURITY DEFINER` fija `set search_path = ''` y califica todo por esquema.** (guardarraíl 6 de pgTAP)
10. **Toda función nueva de `public` lleva su par `revoke all ... from public, anon` + `grant execute ... to <rol>`. No se hereda.** (hallazgo 5 de `deferred-items.md`, guardarraíl 10 de pgTAP)
11. **Toda tabla nueva de `public` habilita RLS y tiene al menos una policy, y revoca privilegios de `anon` y `authenticated`.** (guardarraíles 1, 2, 4 y 4b de pgTAP)
12. **Toda columna monetaria es `bigint` de pesos enteros.** (guardarraíl 7 de pgTAP) No aplica a esta fase.
13. **`state is distinct from 'cancelada'`, nunca `<>`.** Con `<>` sale `Seq Scan` y la unicidad de las filas informativas se pierde en silencio.
14. **`lib/database.types.ts` se regenera y se commitea tras cada migración.** (puerta `typegen drift`)
15. **Ningún comentario cita literalmente un token que un guardarraíl por grep prohíbe.** Pasó dos veces en la Fase 1.
16. **En worktree, `PLAYWRIGHT_PORT` es obligatorio**, y el `project_id` de Supabase es compartido: `db reset` desde un worktree recrea la base que otro está usando.
17. **Fixtures con fechas relativas a hoy** cuando la aserción es sensible al calendario. (patrón del plan 02-14)
18. **Aserción de ausencia con centinela y control.** Sembrar filas antes de medir para que la igualdad no sea `0 === 0`, y demostrar en el mismo test que el contador se mueve cuando de verdad se escribe.

---

## Sources

### Primarias (confianza ALTA)

- **Stack local de Supabase**, medido el 2026-09-02 contra `supabase_db_vivaguest` (PG 17.6): disponibilidad y versiones de `pg_cron` 1.6.4, `pg_net` 0.20.4, `supabase_vault` 0.3.1; `shared_preload_libraries`; creación y reversión de ambas extensiones en transacción; `cron.job.command` en texto plano; `cron.job_run_details` (columnas, `succeeded`/`failed`, `return_message`); **no solapamiento de un job consigo mismo**; firma de `net.http_post`; `net._http_response` y `pg_net.ttl = 6 hours`; `vault.create_secret` / `vault.decrypted_secrets` y sus ACL; `ALTER TYPE ... ADD VALUE` en transacción y su límite; resolución de `host.docker.internal` y `status_code = 200` desde el contenedor de la base al host.
- **`lib/domain/__fixtures__/ical/airbnb-real-anonimizado.ics`**, medido: 15 eventos, 15 `DTEND` distintos, plegado a 75 octetos exactos, `UID` de prefijo único y sufijo de 32 hex, 15/15 códigos de 10 caracteres, 15/15 teléfonos, 15/15 clasifican como reserva por las dos vías, un turnover el 2026-10-10, finales de línea LF.
- **`node-ical@0.27.1`**, instalado y ejecutado contra esa fixture: dependencia de `TZ` en el instante de un `VALUE=DATE`, `2026-09-01` bajo `TZ=UTC` al formatear a Bogotá, colapso silencioso de `VEVENT` con `UID` repetido, `engines: node >= 22`, deps `rrule-temporal` y `temporal-polyfill`.
- **Migraciones de la Fase 1** (`supabase/migrations/01`–`10`): schema, índices únicos parciales, triggers, máquina de estados, grants y policies.
- **`scripts/ci/check-service-role.sh`**, leído línea a línea: los 8 guardarraíles, sus regex y sus exclusiones exactas.
- **`.planning/phases/01-*/deferred-items.md`**: hallazgo 5 (`alter default privileges` no quita `EXECUTE` a `PUBLIC`), hallazgo 4 (`calendar_feeds` sin `url`), y el checkpoint A1 abierto.
- **`.planning/phases/02-*/02-14-SUMMARY.md`**: la costura, el corte por `proximoCheckout`, `last_event_count` = reservas, `redirect: 'manual'`, techo de 5 MiB, `maxDuration` fuera de `use server`.
- [vercel.com/docs/functions/configuring-functions/duration](https://vercel.com/docs/functions/configuring-functions/duration): Hobby default 300 s, máximo 300 s.

### Secundarias (confianza MEDIA)

- `.planning/research/PITFALLS.md` §1 a §5 y §11. Sus §1, §2 y §3 se confirman; su §4 se corrige con la medición del código de reserva.
- `.planning/research/ARCHITECTURE.md` §iCal Sync Pipeline. Se toma como base y se corrige en tres puntos (solapamiento, guarda de colapso, cadencia).
- [helpcenter.duve.com – Airbnb iCal Calendar Blocks](https://helpcenter.duve.com/hc/en-us/articles/10853391656861-Airbnb-iCal-Calendar-Blocks): estructura del `DESCRIPTION` de reservas vs bloqueos.
- [uplisting.io – How the Airbnb iCalendar (iCal) changes will affect you](https://www.uplisting.io/blog/how-the-airbnb-icalendar-ical-changes-will-affect-you-and-how-to-avoid-disruption): cambio de 2019 y qué dejó de venir en el feed.
- [motopress.com – Airbnb iCal ICS sync issue](https://motopress.com/forums/topic/airbnb-ical-ics-sync-issue/): los bloqueos de ventana de reserva como eventos de 1 día.
- [help.hostfully.com – Synchronize using iCals](https://help.hostfully.com/en/articles/3032151-synchronize-using-icals): comportamiento general de los feeds de canal.

### Terciarias (confianza BAJA, marcadas para validación)

- Búsqueda sobre estabilidad del `UID` de Airbnb ante un cambio de fechas: **sin resultado**. Ni la ayuda de Airbnb ni los foros de OwnerRez lo documentan. Confirma que la incertidumbre de `PITFALLS.md` §4 sigue abierta y que hay que diseñar sin depender de la respuesta.

---

## Metadata

**Desglose de confianza:**
- Scheduler (`pg_cron`, `pg_net`, Vault): **ALTA**. Todo medido hoy contra el stack local, incluido el lazo HTTP completo.
- Parseo y formato del feed: **ALTA**. Medido contra el feed real. Único hueco declarado: CRLF.
- Identidad de reserva y forma del diff: **ALTA** en el diseño, **MEDIA** en el comportamiento de la fuente. El diseño es correcto bajo las dos respuestas de la pregunta abierta.
- Guarda del reconcile destructivo: **ALTA** en el diseño (el piso del feed no depende de saber dónde está el borde), **BAJA** en el hecho subyacente. Resuelto por instrumentación, no por investigación.
- Distinción reserva/bloqueo: **MEDIA**. Cero bloqueos en el feed real; la evidencia fuerte es de segunda mano. Es la parte más frágil de la fase y la mitigación es no ser destructivo al equivocarse.
- Alertas: **ALTA** en el mecanismo, con un hueco residual **declarado** (la alerta de job muerto computada al leer depende de que el admin abra el dashboard).
- Privacidad: **ALTA**. La garantía es de tipos y de `CHECK`, no de convención, y hay cinco capas de test.

**Research date:** 2026-09-02
**Valid until:** 2026-10-02 para lo medido en el stack local y en la fixture. **7 días** para todo lo que dependa del comportamiento de Airbnb: es una fuente sin contrato, sin documentación y con dos cambios unilaterales en su historia.
