# Phase 5: Notificaciones push e instalación de la PWA - Context

**Gathered:** 2026-09-10
**Status:** Ready for UI phase

<domain>
## Phase Boundary

El aseador instala la PWA en la pantalla de inicio y recibe en el teléfono cada aseo que se le
asigna; el admin recibe cada evento de campo. Es la fase que **cierra el lazo**: desde la Fase 3 el
sistema genera aseos y desde la Fase 4 el admin los confirma, pero al confirmarlos no avisa a nadie.
La intención de aviso se escribe en `notifications` y ahí se queda. Esta fase construye al mensajero.

**Entra:** NOTIF-01 a NOTIF-04, PWA-02, PWA-03, más el arreglo de D-08 (ver abajo).

**No entra:**
- **La PWA del aseador de verdad.** El aseador todavía no puede ejecutar un aseo: checklist, fotos,
  cola offline y los botones Empecé / Terminé / No puedo son Fase 6. Esta fase entrega el envoltorio
  instalable, el service worker, el permiso y la pantalla a la que aterriza la notificación, no el
  trabajo que se hace dentro.
- **Los RPC de reporte** (`report_damage`, `report_expense`, `report_missing_items`), diferidos a la
  Fase 6. El criterio 3 del ROADMAP exige push al admin por daño y por faltante: esos dos eventos
  **todavía no tienen quién los emita**. Esta fase construye el transporte y deja el emisor listo
  para engancharse; los dos que sí existen hoy (`no_puedo` y `aseo_completado`) se prueban de punta
  a punta, los otros dos contra fila insertada a mano.
- **Semáforo de entregabilidad de push (NOTIF-V2-01)**, ya diferido a v2 el 2026-08-31. D-03 no es
  el semáforo: es saber quién no tiene suscripción, no medir si los envíos llegan.

</domain>

<decisions>
## Implementation Decisions

### D-01 · Dispositivos: Android primario, iOS construido y validado

**Supuesto explícito, no verificado:** los 8 aseadores usarán Android. El usuario lo dio como
probable ("seguramente van a ser Android"), no como inventario levantado.

Consecuencias, y hay que respetarlas las dos:
- El plan **no** puede tratar iOS como hipotético: se construye completo y se valida, porque hay un
  iPhone físico disponible para pruebas.
- El plan **tampoco** puede tratar el supuesto como dato: levantar marca, modelo y versión de SO de
  los 8 equipos reales es tarea previa al piloto de la Fase 8, y queda escrita como tal. Un iPhone
  con iOS < 16.4 no recibe push por ninguna vía y el canal no tiene respaldo; si aparece uno, es
  decisión de negocio (actualizar, cambiar equipo, o ese aseador queda fuera del sistema).

### D-02 · Instalación asistida, presencial, una vez, con verificación en el acto

El onboarding es presencial: alguien instala la PWA en la pantalla de inicio del teléfono del
aseador y otorga el permiso ahí mismo. **No se delega al aseador.** La razón es asimétrica: en iOS
negar el permiso es irreversible sin desinstalar y reinstalar, y con 8 personas el costo de
hacerlo bien una vez es mucho menor que el de recuperar a uno que dijo que no.

Requisito del usuario, textual: *"tenemos que asegurarnos que tenga los push activados en la
instalación"*. La instalación no termina cuando la app aparece en la pantalla de inicio: termina
cuando **llegó una notificación de prueba a ese teléfono**. El flujo de onboarding tiene que incluir
ese envío de verificación y su confirmación visible.

El banner de PWA-03 se construye completo, con la ayuda diferenciada entre "nunca lo pedí" y "ya lo
negué" que exige el requisito, pero su papel es **red de seguridad**, no camino principal: cubre al
aseador que reinstala, cambia de teléfono o limpia los datos del navegador.

### D-03 · El admin ve quién quedó sin push

Derivado de D-02: si la verificación falla o la suscripción muere después, **al admin le sale**.
Dos superficies:
- En el dashboard, cuáles aseadores no tienen push activo.
- Al confirmar un aseo para un aseador sin push, una advertencia antes de asignar.

El porqué toca el Core Value: sin esto un aseador puede quedarse mudo semanas y nadie lo nota hasta
que se pierde un aseo, que es exactamente lo que el sistema existe para evitar. Esto **no** es el
semáforo de entregabilidad diferido a v2: aquello mide si los envíos llegan, esto solo dice si hay
a dónde enviarlos.

### D-04 · Drenaje: disparo inmediato por trigger, más cron de 60s como red

Objetivo de latencia fijado por el usuario: **segundos**, no minutos. Confirmas un aseo y le suena
el teléfono al aseador.

- **Disparo inmediato:** trigger `AFTER INSERT` sobre `notifications` que hace `net.http_post`
  fire-and-forget hacia el endpoint de drenaje. Va en el trigger y **no** dentro de cada RPC: hay
  6+ RPC que ya escriben notificaciones (`confirm_cleaning`, `finish_cleaning`, `decline_cleaning`,
  `reassign_cleaning`, más las del reconcile y el watchdog de la Fase 3), y ninguno debe editarse.
  Cada RPC futuro queda cubierto por construcción, sin tener que acordarse.
- `pg_net` encola en una tabla y despacha después del commit, así que un rollback del RPC revierte
  también el disparo. Eso conserva la regla escrita en la migración 15: **ninguna llamada HTTP
  síncrona dentro de la transacción de negocio.**
- **Red de seguridad:** `pg_cron` cada 60 segundos, que recoge lo que el disparo no logró enviar y
  ejecuta los reintentos con el backoff de `next_attempt_at`. El disparo inmediato va **encima** del
  cron, nunca en reemplazo: si el trigger falla, el aviso sale con hasta un minuto de retraso, no se
  pierde.

Reusa el patrón completo del dispatcher de la Fase 3 en
`supabase/migrations/20260902235500_14_sync_jobs.sql`: `cron.schedule` (que es UPSERT por
`jobname`), guarda contra corridas solapadas, watchdog y poda de `cron.job_run_details`, que
`pg_cron` no hace sola. **La sintaxis de intervalo de `pg_cron` 1.6.4 solo acepta segundos.**

### D-05 · Ráfagas: `Topic` y `tag` con la misma clave, por clase de evento

Varios eventos pueden caer sobre el mismo aseo. Se usan las dos palancas:
- Cabecera **`Topic`**: colapsa en el servidor de push, que es lo que cubre el caso del teléfono
  apagado (sin ella, el aseador enciende y recibe la ráfaga entera).
- Campo **`tag`**: colapsa en la bandeja del dispositivo.

Ambas con la **misma** clave, y la clave colapsa por **destinatario + aseo + clase de evento**, no
por aseo entero. La razón concreta: colapsar por aseo haría que un daño reportado borre un "no
puedo" del mismo aseo antes de que el admin lo lea. Una asignación reasignada sí debe reemplazar a
la anterior; un evento de otra clase, no.

**Restricción medida:** `dedupe_key` ya existe en `notifications` con formato tipo
`assign:<uuid>:<uuid>` (~80 caracteres), y la cabecera `Topic` está capada a 32 caracteres del
alfabeto base64url. **No se puede usar `dedupe_key` tal cual:** hay que derivar la clave de colapso
con un hash corto. `tag` no tiene ese límite pero usa la misma clave, para que las dos capas
colapsen igual.

### D-06 · El código de acceso NO viaja en el payload de push

Desviación deliberada de la letra del criterio 2 del ROADMAP, que dice *"recibe push con los
detalles y el código de acceso"*.

El código solo sale por `reveal_access_code()`, que **exige** dejar rastro en `access_code_reads`
en la misma transacción (T-01-48: no puede existir lectura de código sin rastro) y solo lo entrega
en la ventana hoy..mañana anclada a un aseo concreto asignado. Un push con el código dentro lo
pondría en la pantalla de bloqueo de un teléfono que se presta o se pierde, lo dejaría persistido en
la bandeja del sistema, saltaría la auditoría entera y podría salir días antes del aseo.

**Lo que sí lleva la push:** apartamento, fecha y hora límite. Al tocarla aterriza en el aseo, y ahí
el aseador revela el código por el RPC, con su auditoría y su ventana intactas. El criterio 2 se
cumple en espíritu ("llega con los detalles y al tocarla aterriza en ese aseo"); la desviación queda
escrita aquí para que dentro de un mes se lea como decisión y no como olvido.

### D-07 · Dos formatos de envío: Declarative Web Push para iPhone, clásico para el resto

El riesgo dominante de esta fase no es de código, es de plataforma: **Safari revoca el permiso si el
service worker recibe un push y no muestra notificación.** Un bug en el handler `push` no produce
"una notificación que no llegó", produce la muerte silenciosa de la suscripción de ese aseador, sin
error visible en ningún lado. Android no hace esto; es una regla de iOS.

La mitigación no es tener cuidado, es estructural: el servidor arma el aviso en **formato
declarativo** cuando el destino lo soporta (iOS 18.4+), donde el sistema operativo pinta la
notificación directamente y el código de la app no puede fallar en mostrarla, y en **formato
clásico** para todo lo demás. Es una sola PWA y un solo código de negocio: cambia el empaquetado del
aviso al salir, y hay que probar los dos caminos.

Decisión del usuario tras aclarar que no son dos apps. El costo aceptado es tiempo de construcción y
de prueba duplicado en la capa de envío, no en la de dominio.

### D-08 · Alcance ampliado: `hora_limite_vencida` para aseos anteriores a hoy

**Esto no está en el ROADMAP y entra por decisión explícita del usuario.**

El defecto: un aseo de ayer, vivo y vencido, no genera alerta. `alertasComputadas()` está bien
escrita y no acota por fecha, pero su entrada viene de `leerOperacion()`, que filtra con
`.gte('scheduled_date', hoy)` en `lib/data/operacion.ts:243`. **Toca el Core Value directamente:**
un aseo se puede perder en silencio, que es justo lo que el producto promete que no pasa.

Se arregla dentro de esta fase, no en un quick aparte. Consecuencia administrativa: hay que
reflejarlo en `.planning/ROADMAP.md` §"Phase 5" antes de planear, porque hoy la fase no lo declara
y un verificador goal-backward lo leería como trabajo fuera de alcance.

Nota de diseño para el planner: ampliar la ventana hacia atrás sin techo haría crecer la consulta
del dashboard sin límite. La ventana hacia atrás necesita un tope explícito y justificado.

### Claude's Discretion

- Estructura de archivos del service worker, del manifest y de `public/`, que hoy no existe.
- Firma y nombre del endpoint de drenaje, y cómo se comparte el guard del secreto con el de la
  Fase 3 (`app/api/cron/sync-feed/_guard.ts` ya existe con su test).
- Algoritmo concreto del hash corto de la clave de colapso, mientras respete los 32 caracteres
  base64url y sea estable entre corridas.
- Política de backoff de `next_attempt_at` y número máximo de intentos antes de dar por muerta una
  notificación.
- Cómo se detecta el soporte de formato declarativo del destino (D-07) y dónde se guarda ese dato.
- Tope concreto de la ventana hacia atrás de D-08 y si el aseo vencido de días anteriores aparece en
  el carril ancho o solo en el panel de alertas.
- Superficie exacta de D-03 dentro del dashboard, sujeta a lo que decida el UI-SPEC.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Antes que nada
- `.planning/phases/05-notificaciones-push-e-instalaci-n-de-la-pwa/.continue-here.md` §"Puntos
  ciegos del research, cerrados" — los 7 puntos del `05-RESEARCH.md` que dependían del repo, ya
  cerrados por lectura de código el 2026-09-08. **No los vuelvas a levantar.**

### Alcance y requisitos
- `.planning/ROADMAP.md` §"Phase 5" — los 5 criterios de éxito literales. Leer junto con D-06, que
  se desvía a propósito de la letra del criterio 2, y con D-08, que amplía el alcance.
- `.planning/REQUIREMENTS.md` — texto literal de NOTIF-01 a 04, PWA-02 y PWA-03.
- `.planning/PROJECT.md` — Core Value y restricciones de producto.

### Schema que esta fase consume, y que NO se modifica
- `supabase/migrations/20260831215109_06_retencion_y_notificaciones.sql` — **`notifications` ya es
  bandeja Y outbox en la misma tabla**, con `push_status`, `push_attempts`, `push_last_error`,
  `next_attempt_at` y `dedupe_key`, más los tres índices que la fase necesita:
  `notifications_outbox_idx on (next_attempt_at) where push_status = 'pendiente'`,
  `notifications_inbox_idx on (recipient_id, created_at desc)` y el único parcial
  `notifications_dedupe_idx on (recipient_id, dedupe_key) where dedupe_key is not null`.
  **`push_subscriptions` ya existe** con `endpoint`, `user_id` y `revoked_at`, más
  `push_subs_user_idx on (user_id) where revoked_at is null`.
  **NO HAY QUE CREAR NINGUNA TABLA.** El `05-RESEARCH.md` recomienda crear una tabla propia de
  entregas "para no tocar lo que lee la Fase 4": es falso, y se escribió sin poder leer el repo.
- `supabase/migrations/20260902235500_14_sync_jobs.sql` — el patrón de dispatcher que D-04 reusa
  entero.
- `supabase/migrations/20260831223038_09_rpc.sql` — los `insert into notifications` de
  `confirm_cleaning`, `finish_cleaning` y `decline_cleaning`, con el formato real de `dedupe_key`
  y el `on conflict ... where dedupe_key is not null` que **no es opcional** (sin el predicado
  Postgres no reconoce el árbitro y falla con 42P10).
- `supabase/migrations/20260903120000_15_rpc_admin_y_realtime.sql` — `reassign_cleaning`, y el
  comentario que explica por qué no hay llamada HTTP dentro de la transacción de negocio.

### Investigación
- `.planning/phases/05-notificaciones-push-e-instalaci-n-de-la-pwa/05-RESEARCH.md` — **solo después
  de lo anterior.** Lo de iOS, Safari, APNs, VAPID, Serwist y códigos de error está verificado
  contra fuente primaria y es donde vive el riesgo real. Lo que depende del repo, no: cualquier
  bloque `PENDIENTE DE ANCLAR` que quede es pregunta abierta, nunca afirmación.

</canonical_refs>

<code_context>
## Existing Code Insights

### Lo que ya existe y se reusa
- **El schema completo de notificaciones y suscripciones.** Ver refs. Nada que crear.
- `app/api/cron/sync-feed/_guard.ts` y su `_guard.test.ts` — el guard del secreto del cron, ya
  escrito y probado. El endpoint de drenaje sigue ese patrón.
- `components/ui/` — 24 primitivas de shadcn, entre ellas `alert`, `dialog`, `sheet`, `badge` y
  `sonner`. Falta lo que pida el UI-SPEC para el banner y las instrucciones de instalación.
- `lib/domain/errors.ts` — `mapDbError()`, que en `P0001` lee el `hint` y no el `message`.
- `@playwright/test` 1.62.1 ya instalado: la capa E2E es configuración, no instalación.

### Lo que NO existe y hay que construir desde cero
- **No hay `public/`.** No hay manifest, no hay iconos, no hay service worker.
- **Serwist no está instalado**, ni `web-push`. Ver el stack fijado en `CLAUDE.md`:
  `@serwist/next@9.5.12` con build **webpack**, no Turbopack (bug abierto serwist#360), y
  `web-push@3.6.7` en runtime **`nodejs`**, nunca Edge.
- **Nadie drena `notifications` todavía.** Es justo lo que construye esta fase.

### Established Patterns
- Un `_actions.ts` por ruta, con Server Actions que arrancan por `getUser()` más verificación de
  rol contra `app_metadata`. El route group no autoriza nada.
- `service_role` solo en `lib/supabase/admin.ts`, con test de arquitectura en CI.
- Interfaz en español.
- Toda mutación de `cleanings` va por RPC.

### Trampas vivas, medidas, no predichas
- **`max-w-<talla>` en primitivas de shadcn.** Tailwind v4.3 resuelve `max-w-<nombre>` contra
  `--spacing-*` antes que contra `--container-*`, y con la escala de 02-UI-SPEC §2 `max-w-sm`
  compila a **8px**. Ya es estructural: `npm run ci:arch` corre `scripts/ci/check-max-w-tallas.sh`
  y falla nombrando archivo y línea. **Esta fase puede correr `npx shadcn add` sin miedo**, pero
  todo token de ancho nuevo va como `--container-<nombre-propio>` y se registra en el grupo `max-w`
  de `cn()`.
- **Verificación de CSS con falso verde en zsh:** usar array `CSS=(.next/static/css/*.css)` y
  `"${CSS[@]}"`, nunca `CSS=$(ls ...)`.
- **Los duplicados de iCloud con sufijo numérico** rompen `npx tsc --noEmit` desde `.next/types/`.
  Se apartan a mano; `next build` los regenera.
- **`npm run db:reset` cuesta 54 s medidos**, y es lo que domina un plan de señuelos que mute
  migraciones. Presupuestarlo.
- **Hay un test que recorre los mensajes de éxito** buscando `notific|avis|le lleg|push|se le mand`
  para que ningún copy sugiera que ya se notifica. **Cuando el drenaje exista, ese test hay que
  revisarlo**: pasa a estar al revés.

### Integration Points
- **Escritura de notificaciones:** ya la hacen 6+ RPC. Esta fase no toca ninguno (D-04).
- **Lectura de la bandeja:** el panel de alertas de la Fase 4 lee de `notifications`
  (`lib/data/operacion.ts`). Cualquier cambio de forma en esa tabla lo rompe; por eso no hay ninguno.
- **`leerOperacion()` en `lib/data/operacion.ts:243`** — el filtro `.gte('scheduled_date', hoy)` que
  D-08 modifica.
- **Enum `notification_type`:** 11 valores, **no se toca** (decisión fijada en el plan 03-03). Ya se
  escriben `asignacion`, `aseo_completado`, `no_puedo`, `aseo_cancelado`, `extension_sospechosa` y
  `calendario_caido`.

</code_context>

<specifics>
## Specific Ideas

- **La instalación no termina cuando la app aparece en la pantalla de inicio; termina cuando llegó
  una notificación de prueba a ese teléfono.** Es la frase que fija D-02 y el planner no debe
  suavizarla a "otorgar el permiso".
- **Un bug en el handler de push en iOS no se ve como un aviso perdido, se ve como un aseador que
  dejó de recibir todo, en silencio.** Es la razón de D-07 y el criterio con el que se juzga
  cualquier atajo en la capa de envío.
- El caso que calibra el diseño del drenaje: **una corrida del sync mete quince aseos sin confirmar
  de golpe**, el admin los confirma en tanda, y salen quince notificaciones seguidas. Todo lo que se
  diseñe para "una o dos" está mal calibrado. D-05 existe para eso.
- La asimetría de costos que guía el proyecto desde la Fase 3 sigue aplicando: un aviso de más lo
  ignora un humano; un aviso de menos deja a la aseadora sin saber que tiene trabajo.

</specifics>

<deferred>
## Deferred Ideas

- **Semáforo de entregabilidad de push (NOTIF-V2-01)** — v2 desde 2026-08-31. Riesgo aceptado y ya
  registrado: push es el único canal, sin respaldo. Si en el piloto de Bogotá un aseo confirmado
  nunca llega al aseador, entra el semáforo.
- **Inventario real de los 8 equipos** — tarea previa al piloto de la Fase 8, no de esta fase
  (D-01).
- **Autoservicio de instalación validado en campo** — la interfaz se construye en esta fase
  (PWA-03), pero el camino probado es el asistido (D-02). El autoservicio se valida cuando entre un
  aseador nuevo sin onboarding presencial.
- **Push por daño y por faltante de punta a punta** — el transporte entra en esta fase, pero los RPC
  que emiten esos dos eventos son de la Fase 6.

</deferred>

---
