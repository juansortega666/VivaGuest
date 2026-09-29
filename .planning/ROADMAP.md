# Roadmap: VivaGuest

## Overview

El proyecto se construye de adentro hacia afuera. Primero la base de datos: schema, migraciones, invariantes y RLS, porque `database.types.ts` y la forma de los RPC son el contrato de toda la UI y cambian con cada migración. Sobre esa base se monta el acceso y el catálogo real de la operación (39 unidades, 8 clusters), luego el motor de sincronización iCal que es el Core Value, y enseguida el dashboard del admin, que es lo que hace observable ese motor. Después la superficie del aseador (push primero, PWA después), el financiero, los paneles laterales que dejan la consulta del admin sin costo de navegación, y de último la retención, que no tiene nada que borrar hasta el mes 7.

El equipo son dos personas, así que **las fases corren en secuencia estricta**. El grafo de paralelización que permitía el schema queda documentado abajo por si el equipo crece, pero no se asume.

## Phases

**Numeración de fases:**

- Fases enteras (1, 2, 3): trabajo planeado del milestone
- Fases decimales (2.1, 2.2): inserciones urgentes (marcadas con INSERTED)

- [x] **Fase 1: Fundación, schema y RLS** - La base de datos impone las reglas del negocio y aísla a cada aseador antes de que exista una sola pantalla
- [x] **Fase 2: Acceso y administración del catálogo** - Login por rol y CRUD de apartamentos y aseadores para montar la operación real
- [x] **Fase 3: Motor de sincronización iCal** - Todo checkout publicado en Airbnb se convierte en un aseo pendiente, sin duplicados ni cancelaciones falsas
- [ ] **Fase 4: Dashboard operativo del admin** - Toda la operación del día en una pantalla, con confirmación en un paso y alertas de una sola jerarquía
- [ ] **Fase 5: Notificaciones push e instalación de la PWA** - El aseador instala la PWA y recibe cada asignación en el teléfono; el admin recibe cada evento de campo
- [x] **Fase 6: PWA del aseador, offline-first** - El aseador ejecuta el aseo completo con o sin señal y nada del trabajo de campo se pierde
- [ ] **Fase 7: Financiero** - Rentabilidad por aseo y cierre mensual persistido que sobrevive a la retención
- [x] **Fase 8: Paneles laterales en el admin** - Consultar una ficha deja de costar la pantalla donde estabas, y el estado de un aseo se mira en vez de preguntarse por WhatsApp
- [ ] **Fase 9: El producto probado de punta a punta** - Un checkout de Airbnb llega hasta el pago de la aseadora sin que nadie lo empuje a mano, y los 39 apartamentos reales estan cargados

## Phase Details

### Phase 1: Fundación, schema y RLS

**Status**: Complete 2026-09-01 (`passed_with_gaps`) — 9/9 planes, 47/47 aserciones pgTAP, verificación independiente. PR #1 mergeado. Gaps abiertos: CI sin correr automático, aserción de fuga por embed tautológica (la propiedad sí está cubierta por otras dos), y el checkpoint humano de los proyectos Supabase
**Goal**: La base de datos existe, impone las reglas del negocio por sí sola y ningún aseador puede ver datos ajenos
**Depends on**: Nada (primera fase)
**Requirements**: PLAT-03, PLAT-05, PLAT-06, ASEO-07, FIN-01
**Success Criteria** (qué debe ser VERDAD):

  1. `supabase db reset` levanta el schema completo desde cero en CI, la suite pgTAP pasa en verde incluyendo los casos negativos de RLS, y el seed de los 8 clusters y las 39 unidades reales queda cargado
  2. Un aseador autenticado que consulta la API directamente solo obtiene los aseos asignados a él, y no ve instrucciones ni datos de apartamentos ajenos
  3. El código de acceso de un apartamento solo se obtiene vía RPC, solo para el aseador con un aseo vigente, y cada consulta queda registrada en `access_code_reads`
  4. Intentar crear un segundo aseo activo para el mismo apartamento y la misma fecha falla a nivel de base de datos
  5. Editar la tarifa de un apartamento no altera el margen ya congelado en un aseo generado antes de la edición

**Plans:** 9 plans en 8 waves

Plans:

- [ ] 01-01-PLAN.md — Scaffolding de Next.js sin Turbopack, `supabase init` con `config.toml` endurecido, `lib/domain/errors.ts` (ASEO-07) y las dos puertas de CI de arquitectura
- [ ] 01-02-PLAN.md — Wave 0: la suite pgTAP completa (5 archivos, 45 aserciones) escrita en rojo antes del schema
- [ ] 01-03-PLAN.md — Migraciones 01–03: `today_bog()`, los 6 enums y el catálogo (identidad, apartamentos, secretos, cuartos, faltantes, ajustes)
- [ ] 01-04-PLAN.md — Migración 04: núcleo operativo `cleanings` con sus índices únicos parciales, `legal_hold`/`deleted_at`, checklist, evidencia y reportes
- [ ] 01-05-PLAN.md — Seed: 8 clusters, 39 unidades (34 gestionadas + 5 externas), catálogo provisional de cuartos y tareas
- [ ] 01-06-PLAN.md — Migraciones 05–06: snapshot financiero (FIN-01), máquina de estados con log de auditoría, notificaciones y cola de borrado de Storage
- [ ] 01-07-PLAN.md — Migraciones 07–08: los grants (el hallazgo que rompería la fase), esquema `private`, helpers definer, RLS y todas las policies
- [ ] 01-08-PLAN.md — Migraciones 09–10: RPC de credencial y de transiciones, bucket privado `evidencia` con sus policies
- [ ] 01-09-PLAN.md — Cierre: `database.types.ts`, CI en verde, sign-off de validación y checkpoint humano de link a Supabase dev

**Alcance no capturado por REQ-IDs pero obligatorio en esta fase:**

- `legal_hold` y `deleted_at` en el schema inicial aunque el job de borrado llegue en la Fase 9
- Máquina de estados del aseo y log de auditoría de transiciones
- Helper `today_bog()` y regla transversal `date` vs `timestamptz` (nada de `current_date` en jobs, policies ni índices)
- Bucket `evidencia` privado con sus policies
- Catálogo provisional de cuartos y tareas (máximo 3 por tipo), editable sin migración

### Phase 2: Acceso y administración del catálogo

**Status**: Executed 2026-09-02 — 15/15 planes. 285 unit, 52 integración, 76 E2E, 47 pgTAP, las 11 puertas en verde. Criterios 1, 2, 4 y 5 verificados; el 3 con hueco declarado (puerta solo de UI); el 6 pendiente de verificación humana contra un `.ics` real
**Goal**: El admin monta toda la operación real en el sistema y cada usuario entra a la superficie que le corresponde
**Depends on**: Fase 1
**Requirements**: PLAT-01, PLAT-02, PLAT-04, PLAT-07, APTO-01, APTO-02, APTO-03, APTO-04, APTO-05, APTO-06, APTO-07, APTO-08, APTO-09, APTO-10, APTO-11, APTO-12, ASEADOR-01, ASEADOR-02, ASEADOR-03
**Success Criteria** (qué debe ser VERDAD):

  1. Admin y aseador inician sesión con email y contraseña y aterrizan cada uno en su superficie (dashboard o PWA), con la sesión persistiendo entre recargas
  2. El admin crea, edita, activa y desactiva apartamentos con tarifas, links de calendario validados al guardar, ubicación de Google Maps, código de acceso, hora límite (default 11:30), cuartos, lista base de faltantes y responsable/suplente
  3. El sistema impide activar un apartamento sin tarifa al huésped y pago al aseador, exige responsable cuando `gestion_vivaguest` es true y contacto externo cuando es false
  4. El admin crea y desactiva cuentas de aseador (sin auto-registro) y el aseador desactivado pierde el acceso de inmediato aunque tuviera la sesión abierta
  5. El admin encuentra cualquiera de las 39 unidades desde el buscador y ve la lista de aseadores con su estado y los apartamentos donde es responsable o suplente
  6. Al conectar el calendario, el admin sigue una guía visual de dónde sacar el link de exportación en Airbnb, y al pegarlo ve en pantalla que el feed sirve, cuántas reservas trajo y cuál es el próximo checkout detectado, sin tener que esperar la siguiente corrida del sync

**Plans:** 15 plans en 13 waves

Plans:

- [ ] 02-01-PLAN.md — Desbloqueo: proveedor de email en `config.toml`, `.env.example`, env de build en CI y los guardarraíles 5 y 6 de arquitectura
- [ ] 02-02-PLAN.md — Dominio puro: tabla de ruteo por rol, derivación de estado de apartamento, dinero COP y fechas de negocio
- [ ] 02-03-PLAN.md — Dominio puro: contrato borrador→activo en Zod, `mapDbError` ampliado + `mapAuthError`, y el escáner de iCal con sus fixtures
- [ ] 02-04-PLAN.md — Puerta de legitimidad de paquetes, Vitest de integración con JWT reales y runner de Playwright
- [ ] 02-05-PLAN.md — shadcn 4.19.1 con Base UI (`-p nova`, `field` en vez de `form`), capa de tokens y muerte del boilerplate
- [ ] 02-06-PLAN.md — Los cuatro clientes de Supabase, middleware con `setAll` de dos argumentos, `/login` y stub del aseador
- [ ] 02-07-PLAN.md — Shell del admin con `TopNav` y lista de aseadores con sus asignaciones (ASEADOR-03)
- [ ] 02-08-PLAN.md — Alta de aseadores con contraseña criptográfica de una sola vez (ASEADOR-01)
- [ ] 02-09-PLAN.md — Baja y reactivación con revocación inmediata: `is_active` + `ban_duration` (ASEADOR-02, PLAT-04)
- [ ] 02-10-PLAN.md — Lecturas del catálogo y Server Actions de CRUD, con `property_secrets` por `service_role`
- [ ] 02-11-PLAN.md — Tabla de las 39 unidades, buscador sin tildes, cuatro estados y banner de montaje (APTO-11)
- [ ] 02-12-PLAN.md — Formulario de apartamento, secciones 1–4 y barra de acciones con faltantes en vivo
- [ ] 02-13-PLAN.md — Cuartos y faltantes del apartamento, sección 5 (APTO-06, APTO-07)
- [ ] 02-14-PLAN.md — APTO-12: guía de Airbnb, validación en vivo del feed y los siete estados
- [ ] 02-15-PLAN.md — Cierre: capturas de la guía, las 11 puertas a mano, sign-off de validación y humo con feed real

**UI hint**: yes

### Phase 3: Motor de sincronización iCal

**Status**: Complete 2026-09-03 (`passed_with_gaps`) — 10/10 planes en 9 waves, 105 tests de integración, 112 aserciones pgTAP, 49 señuelos corridos y 48 atrapados. Gaps declarados con dueño: la clasificación reserva-vs-bloqueo en confianza MEDIA (sin `.ics` real de bloqueos, diferido por decisión), el dead man's switch externo, y la lectura de la instrumentación atada a que exista producción
**Goal**: Todo checkout publicado en los calendarios se convierte en un aseo pendiente, sin duplicados y sin cancelaciones falsas
**Depends on**: Fases 1 y 2
**Requirements**: SYNC-01, SYNC-02, SYNC-03, SYNC-04, SYNC-05, SYNC-06, SYNC-07, SYNC-08, SYNC-09, SYNC-10, SYNC-11
**Success Criteria** (qué debe ser VERDAD):

  1. Cada feed configurado se lee cada 30 minutos en una invocación aislada, y un feed caído no impide que los demás corran
  2. El fin de una **reserva** genera exactamente un aseo `normal` en la fecha correcta (su `DTEND`), corridas sucesivas sobre el mismo feed no crean duplicados, y los apartamentos con `gestion_vivaguest = false` generan un aseo informativo sin estado ni asignación
  3. Los **bloqueos del propietario** (fechas que el anfitrión cierra a mano, distintas de una reserva) no generan aseos, y un feed vacío, inválido o truncado no cancela ningún aseo existente y queda registrado como intento fallido
  4. Cuando la reserva se mueve o desaparece, el aseo viejo se cancela y aparece uno nuevo sin confirmar, salvo que el aseo ya tenga `started_at`
  5. El admin queda alertado cuando un link deja de responder, cuando el propio job de sincronización deja de correr, cuando checkout y checkin caen el mismo día, y cuando una reserva parece una extensión creada como reserva nueva

**Aclaración de vocabulario (fijada 2026-09-02):** los criterios 2 y 3 usaban la palabra
"bloqueo" con dos sentidos y se leían como contradictorios. Lectura correcta: el criterio 2
habla del **fin de una reserva**, que es lo que libera el apartamento y genera el aseo. El
criterio 3 habla de los **bloqueos del propietario**, fechas que el anfitrión cierra a mano y
que no traen huésped ni generan aseo. Son cosas distintas.

**Prerequisito humano:** RESUELTO el 2026-09-02. `lib/domain/__fixtures__/ical/airbnb-real-anonimizado.ics` es un feed real de un anuncio propio, con 15 eventos. Queda una laguna: **cero bloqueos del propietario** en esa captura, así que la distinción reserva/bloqueo está en confianza MEDIA y la cierra el checkpoint humano del plan 03-10.

**Plans**: 10 plans

Plans:

- [x] 03-01-PLAN.md — Wave 0: guardarraíles de CI, las nueve fixtures que faltaban y el pgTAP de la fase en rojo
- [x] 03-02-PLAN.md — Dominio puro del iCal: parser sin dependencias, clasificador de tres valores y normalizador donde muere el teléfono
- [x] 03-03-PLAN.md — Migración 11: `pg_cron` y `pg_net`, `feed_sync_runs` como instrumento, y el CHECK de privacidad
- [x] 03-04-PLAN.md — Migración 12: `sync_feed_apply()` en su mitad aditiva, con la urgencia recalculada y la salud dentro de la transacción
- [x] 03-05-PLAN.md — Migración 13: el reconcile destructivo con sus cuatro candados, la extensión sospechosa y las notificaciones
- [x] 03-06-PLAN.md — El worker: secreto compartido en tiempo constante, guardas de transporte y la guarda de colapso sobre reservas clasificadas
- [x] 03-07-PLAN.md — Migración 14: dispatcher con fan-out, watchdog anti-tormenta, poda del historial y el lazo local
- [x] 03-08-PLAN.md — Integración de los criterios 1, 2 y 3 contra el feed real
- [x] 03-09-PLAN.md — Integración de los criterios 4 y 5: el diff entre corridas y las cinco alertas
- [x] 03-10-PLAN.md — Privacidad transversal, los dos checkpoints humanos y el cierre de la fase

### Phase 4: Dashboard operativo del admin

**Goal**: El admin ve toda la operación del día en una pantalla y confirma, reasigna o cierra cualquier aseo sin salir de ahí
**Depends on**: Fases 2 y 3
**Requirements**: ASEO-01, ASEO-02, ASEO-03, ASEO-04, ASEO-05, ASEO-06, ASEO-08, ASEO-09, DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-06, DASH-07, REPORT-04
**Success Criteria** (qué debe ser VERDAD):

  1. Todo aseo nuevo nace en Pendiente sin confirmar y aparece en la bandeja persistente "Sin confirmar"; el admin lo confirma en un solo paso escribiendo número de huéspedes e instrucciones, y queda asignado en firme al responsable del apartamento
  2. El admin ve los servicios organizados por día (hoy, mañana y siguientes) y la carga diaria de cada aseador para decidir si activa al suplente
  3. El admin reasigna un aseo puntual sin tocar responsable ni suplente permanentes, crea aseos `repaso` y `emergencia`, reprograma fechas, cierra manualmente un aseo que la realidad ya resolvió y cancela
  4. Un solo panel de alertas muestra con la misma jerarquía visual: urgentes, extensión mal creada, "no puedo", daños, faltantes, calendario caído y hora límite vencida sin terminar
  5. El admin abre cualquier apartamento y ve su historial cronológico con los daños reportados; los aseos de unidades con `gestion_vivaguest = false` se muestran con fecha y a cargo de quién, sin estado ni acciones

**Plans**: 14 plans en 6 waves
Plans:

- [x] 04-01-PLAN.md — Wave 0: guarda de duplicados, pgTAP de las seis RPC en rojo, helper de siembra
- [x] 04-02-PLAN.md — Fundamentos de UI: `sheet`, tokens de `@theme` y `EstadoVacio compacto`
- [x] 04-03-PLAN.md — `estadoDeAseo()`, fecha corta, tiempo relativo y el campo del error de ASEO-07
- [x] 04-04-PLAN.md — `lib/domain/alertas.ts`: mapa de once tipos, computadas, mezcla y orden
- [x] 04-05-PLAN.md — Migración 15: seis RPC `SECURITY DEFINER` + publicación de Realtime
- [x] 04-06-PLAN.md — `lib/data/operacion.ts`: la consulta única y sus tres proyecciones
- [x] 04-07-PLAN.md — Reprogramar contra el reconcile, y los diez señuelos de la capa de base
- [x] 04-08-PLAN.md — Las ocho Server Actions de la pantalla de operación
- [x] 04-09-PLAN.md — La pantalla `/operacion`: dos carriles, días, fila y franja de carga
- [x] 04-10-PLAN.md — Bandeja `Sin confirmar`, `Sheet` encadenado y creación manual
- [x] 04-11-PLAN.md — `MenuAseo` y los cuatro diálogos de mutación
- [x] 04-12-PLAN.md — Historial del apartamento con los daños (DASH-06, REPORT-04)
- [x] 04-13-PLAN.md — Panel de alertas, marca de frescura y Realtime con degradación
- [x] 04-14-PLAN.md — E2E, prueba de escala de grises y puerta de fase

**UI hint**: yes

**Costura conocida:** al confirmar, el aseo queda asignado pero **no se notifica a nadie** hasta que exista la Fase 5. El evento se escribe en la cola de notificaciones y se drena cuando el worker exista. Es intencional, no un olvido.

### Phase 5: Notificaciones push e instalación de la PWA

**Status**: **INCOMPLETA — 15/16 planes**, mergeada a `main` el 2026-09-12 sin verificación. **05-12 (`/instalar`, el asistente de instalación) está ELIMINADO desde el 2026-09-18** por decisión del dueño (quick `260918-h47`): la instalación pasa a ser manual y presencial, teléfono por teléfono, y con el asistente se fueron los cuatro enlaces del banner que apuntaban a esa ruta. Por eso el denominador baja de 17 a 16. Falta **05-17** (E2E de la fase, las doce puertas y la validación en teléfono físico). No existe `VERIFICATION.md`: los siete criterios de éxito **no se han verificado formalmente**
**Goal**: El aseador instala la PWA y recibe en el teléfono cada aseo que se le asigna; el admin recibe cada evento de campo
**Depends on**: Fase 2
**Requirements**: NOTIF-01, NOTIF-02, NOTIF-03, NOTIF-04, PWA-03 (PWA-02 retirado como requisito de producto el 2026-09-18; la capacidad técnica sigue viva y medida por E5)
**Success Criteria** (qué debe ser VERDAD):

  1. La PWA se instala en la pantalla de inicio en Android y en iOS y desde ahí recibe notificaciones push en dispositivos físicos reales
  2. Al asignarse un aseo, el aseador recibe push con los detalles del aseo (apartamento, fecha y hora límite) y al tocarla aterriza en ese aseo, donde revela el código de acceso con la auditoría y la ventana temporal intactas. **Corregido 2026-09-10:** el código de acceso NO viaja dentro del payload de push. Desviación deliberada de la redacción original, justificada en `05-CONTEXT.md` D-06: el código solo sale por `reveal_access_code()`, que exige rastro en `access_code_reads` (T-01-48); meterlo en el payload lo pondría en la pantalla de bloqueo, sin auditoría y posiblemente días antes del aseo
  3. El admin recibe push por daño reportado, faltante reportado, "no puedo" y aseo completado
  4. Si el aseador no tiene push activo, ve un banner persistente con instrucciones distintas según si nunca dio el permiso o si ya lo negó. **Matizado 2026-09-18** (quick `260918-h47`): el criterio **se sigue cumpliendo** —los dos estados conservan icono, título y cuerpo distintos, y solo uno tiene acción— pero "ya lo negó" **dejó de ramificar por sistema operativo**. Sus dos ramas existían únicamente para enlazar al asistente de instalación, que se eliminó
  5. Cada envío queda registrado, los fallidos se reintentan, y las suscripciones que el navegador reporta como expiradas o revocadas se eliminan solas
  6. El admin ve qué aseadores no tienen push activo, y al confirmar un aseo para uno de ellos recibe una advertencia antes de asignar (`05-CONTEXT.md` D-03)
  7. Un aseo de fecha anterior a hoy, vivo y con la hora límite vencida, genera alerta. **Añadido 2026-09-10** por decisión explícita del usuario (`05-CONTEXT.md` D-08): hoy no la genera, porque `leerOperacion()` filtra con `.gte('scheduled_date', hoy)` en `lib/data/operacion.ts:243`. Toca el Core Value: un aseo se puede perder en silencio

**Plans:** 17 plans en 9 waves
**UI hint**: yes

Plans:

- [x] 05-01-PLAN.md — Compuerta de legitimidad de paquetes, dependencias, par VAPID y contrato de entorno
- [x] 05-02-PLAN.md — Migración 16: columnas de verificación en `push_subscriptions`, grants por columna y la función agregada que ve el admin (cierra la compuerta §20.10 del UI-SPEC)
- [x] 05-03-PLAN.md — Migración 17: dispatcher del outbox, trigger `AFTER INSERT` y cron de 60 s, con la aserción pgTAP de que un rollback revierte el disparo
- [x] 05-04-PLAN.md — `lib/push/errores.ts` y `lib/push/colapso.ts`: la decisión de error y la clave de colapso, con la auditoría emisor por emisor de D-05
- [x] 05-05-PLAN.md — `lib/push/payload.ts` y `lib/push/envio.ts`: las dos envolturas de D-07 y la firma VAPID, sin ranura para el código de acceso (D-06)
- [x] 05-06-PLAN.md — `POST /api/push/drain`: el worker que drena `notifications`, idempotente y con una sola puerta de revocación
- [x] 05-07-PLAN.md — Integración del drenaje contra un push service falso: las siete propiedades de la capa 3
- [x] 05-08-PLAN.md — Serwist, `app/sw.ts`, manifest e iconos. El handler que decide si un aseador conserva su canal, probado fuera del service worker
- [x] 05-09-PLAN.md — Tokens de `@theme`, registro en `cn()`, `lib/domain/avisos.ts` y la detección de plataforma
- [x] 05-10-PLAN.md — Banner de avisos (PWA-03), Server Actions de suscripción con allowlist anti-SSRF y guardarraíl de la escala móvil
- [x] 05-11-PLAN.md — El aviso de prueba: las tres actions del asistente y el paso 4 con sus dos grados (contrato de D-02)
- ~~05-12-PLAN.md — `/instalar`: el asistente de cuatro pasos con capturas reales y los tres modos de entrada~~ → **ELIMINADO el 2026-09-18** por decisión del dueño (quick `260918-h47`). Nunca se ejecutó y el archivo del plan se borró. La instalación es manual y presencial
- [x] 05-13-PLAN.md — `/aseos/[id]`: la pantalla de aterrizaje y el código de acceso auditado
- [x] 05-14-PLAN.md — D-03 en `/aseadores`: columna `AVISOS`, chip de estado y link de instalación
- [x] 05-15-PLAN.md — D-03 en `/operacion`: advertencia antes de asignar, franja del admin y la inversión del test de copy
- [x] 05-16-PLAN.md — D-08: los dos filtros de fecha, el bloque `Atrasados` y la señal de hora límite vencida
- [ ] 05-17-PLAN.md — E2E en Chromium, las doce puertas y los procedimientos manuales en iPhone físico

### Phase 6: PWA del aseador, offline-first

**Status**: Executed 2026-09-12 — 10/10 planes. Doce puertas en verde: pgTAP 269/269 declaradas, 1005 unitarios, 169 de integración, 107 E2E en Chromium. **Abierto:** el checkpoint humano de 06-10 (recorrido en un teléfono real). El criterio 4 quedó diferido por decisión del desarrollador
**Goal**: El aseador ejecuta el aseo completo desde el teléfono y deja evidencia de lo que hizo. **Corregido 2026-09-12:** el "con o sin señal" sale del alcance, ver criterio 4
**Depends on**: Fases 2 y 5
**Requirements**: PWA-01, PWA-04, PWA-05, PWA-06, PWA-07, PWA-08, PWA-09, PWA-10, CHECK-01, CHECK-02, CHECK-03, CHECK-04, REPORT-01, REPORT-02, REPORT-03
**Success Criteria** (qué debe ser VERDAD):

  1. El aseador ve la lista de sus aseos asignados y abre el detalle con instrucciones y código de acceso
  2. El aseador marca "Empecé", completa el checklist armado únicamente con los cuartos que ese apartamento tiene, y al finalizar el sistema le pide la evidencia cuarto por cuarto. **Corregido 2026-09-12** (`06-CONTEXT.md` D-06): "Terminé" **ya no se bloquea** por falta de foto. El aseador puede saltar un cuarto eligiendo un motivo de una lista cerrada, y entonces el aseo queda marcado **sin evidencia completa** y eso le sale al admin. Se evaluó bloquear y se eligió marcar: un bloqueo deja al aseador atrapado en campo, y una lista de motivos además se puede contar
  3. Las fotos se comprimen a ~200 KB con lado largo de 1280 px y pierden el EXIF en el dispositivo antes de subirse, conservando solo la corrección de orientación
  4. ~~El aseador completa un aseo entero en modo avión y todo sube al recuperar señal.~~ **DIFERIDO 2026-09-12** por decisión explícita del desarrollador (`06-CONTEXT.md` D-08). Era ~la mitad del trabajo de la fase. Riesgo aceptado y registrado en `.planning/BACKLOG.md`: si se cae la señal a mitad del aseo se pierde el trabajo de campo, y las fotos son justo lo que falla con mala señal
  5. El aseador reporta con **un solo campo libre clasificado** en daño, gasto o faltante, y **el gasto lleva monto** para que el cierre mensual de la Fase 7 lo pueda sumar (`06-CONTEXT.md` D-07). El "no puedo" **no es un botón dentro del aseo**: es la segunda opción al tocar la tarjeta, antes de empezar, y devuelve el aseo a Pendiente sin asignar avisando al admin (D-02)

**Plans:** 10 plans en 7 waves
**UI hint**: yes

Plans:

- [x] 06-01-PLAN.md — Migración 18: derogar el bloqueo de "Terminé" (D-06), tabla de cuartos saltados con motivo, y moneda en `expenses`
- [x] 06-02-PLAN.md — Migración 19: los tres RPC de reporte, cada uno con su notificación al admin. Cobra la promesa de D-04 de la Fase 5
- [x] 06-03-PLAN.md — Lógica pura: armado del checklist, progreso, evidencia incompleta, motivos y esquema del reporte
- [x] 06-04-PLAN.md — La cadena de la foto: compresión con borrado de EXIF, ruta decidida por el servidor y registro idempotente
- [x] 06-05-PLAN.md — `accordion` y `radio-group` saneadas de la trampa del ancho, más los seis tokens de la fase
- [x] 06-06-PLAN.md — El home con sus tarjetas y la hoja de dos opciones: comenzar o reportar que no puede
- [x] 06-07-PLAN.md — El checklist en acordeón con marcado optimista y la barra fija de acción
- [x] 06-08-PLAN.md — El asistente de evidencia, con cámara nativa y skip con motivo de lista cerrada
- [x] 06-09-PLAN.md — El reporte clasificado con monto, y la pantalla de cierre
- [x] 06-10-PLAN.md — La señal en el dashboard del admin, el test de paridad SQL/TypeScript, el E2E y el recorrido en teléfono real

**Hallazgo de planeación (2026-09-12):** el backend de esta fase **ya existía casi entero**.
`start_cleaning`, `toggle_checklist_item` y `finish_cleaning` están construidos desde la Fase 1, y
`confirm_cleaning` ya materializa el checklist al confirmar. Lo único que estorbaba era que
`finish_cleaning` rechazaba con `P0001 checklist_incompleto`, que es justo lo que D-06 derogó. Por eso
la fase son 10 planes y no 20.

### Phase 7: Financiero

**Goal**: El admin tiene visión total de la plata en un solo tablero (cuánto se cobra, cuánto se paga, la diferencia y los gastos), filtrable por día, semana y mes; y cada aseador ve en su teléfono lo que se le va a pagar, y nada más
**Depends on**: Fases 1 y 4
**Requirements**: FIN-02, FIN-03, FIN-04, FIN-05
**Success Criteria** (qué debe ser VERDAD):

  1. El admin ve la rentabilidad de cada aseo (fee al huésped menos pago al aseador) calculada contra las tarifas congeladas en ese aseo, y los aseos informativos quedan fuera de todo cálculo financiero y de toda métrica
  2. El admin abre una sola pantalla y ve cuánto cobró, cuánto pagó, cuánto reembolsó en gastos y cuánto le quedó, en el rango que elija, con filtro de día, semana y mes que manda sobre toda la pantalla
  3. Al cerrar el periodo, el sistema calcula el pago de cada aseador, lo persiste como snapshot propio y lo muestra en la sub-pestaña de Pagos, donde además se marca a quién ya se le pagó
  4. Ese snapshot queda escrito de forma que sobreviva al borrado de los aseos que lo sustentan, verificable borrando manualmente un aseo de un periodo ya cerrado
  5. El aseador ve en su app lo que se le va a pagar de los periodos ya cerrados, y NO existe ninguna consulta, por ninguna vía, que le devuelva una cifra de huésped o un margen

**Plans**: 12/14 plans executed
**UI hint**: yes

Plans:

- [x] 07-01-PLAN.md — Wave 0: el contrato pgTAP de la fase, en rojo antes del schema
- [x] 07-02-PLAN.md — Wave 0: sembrador de periodo completo y el dominio financiero en rojo
- [x] 07-03-PLAN.md — Wave 0: las specs E2E de las cinco superficies nuevas, en rojo
- [x] 07-04-PLAN.md — Migración 23: calendario de cierre, día de negocio y las tres tablas del snapshot
- [x] 07-05-PLAN.md — Migración 24: cerrar la fuga de la tarifa al huésped, por las dos vías (D7-7)
- [x] 07-06-PLAN.md — El dominio en TypeScript: gemelo del calendario, filtro del Resumen y agregación
- [x] 07-07-PLAN.md — Migración 25: el cierre idempotente, sus dos puertas y el job agendado
- [x] 07-08-PLAN.md — Migración 26: las lecturas del Resumen, del detalle y de la ficha
- [x] 07-09-PLAN.md — Migración 27: Pagos del admin, marcar pagado, y las dos funciones del aseador
- [x] 07-10-PLAN.md — Chasis de la sección y sub-pestaña Resumen
- [x] 07-11-PLAN.md — Detalle aseo por aseo y ficha de aseadora
- [x] 07-12-PLAN.md — Sub-pestaña Pagos: desglose, marcar pagado y aviso de periodo sin cerrar
- [ ] 07-13-PLAN.md — La pantalla del aseador: sus periodos cerrados y su desglose
- [ ] 07-14-PLAN.md — Puerta de fase: cinco señuelos, suite completa y consecuencias para la Fase 9

> **Alcance recortado el 2026-09-13, por decisión del dueño.** `RET-03` (retención
> legal) y `RET-07` (alerta de Storage al 70%) **salieron de esta fase**: no son
> dinero y estaban aquí por acumulación, no por lógica. Mezclarlos hacía difícil
> dar la fase por terminada, porque se podía tener el cálculo perfecto y la fase
> "incompleta" por un banner de almacenamiento.
>
> Los dos pertenecen a la **Fase 9 (borrado automático y retención)**, que es
> donde vive la purga: tiene sentido construir el freno junto al motor. Quedan
> registrados como issues [#5](https://github.com/juansortega666/VivaGuest/issues/5)
> y [#6](https://github.com/juansortega666/VivaGuest/issues/6), con los datos ya
> medidos.
>
> El alcance real de la fase está escrito, en lenguaje de negocio, en
> `.planning/phases/07-financiero/07-DEFINICION.md`. **Ese documento manda sobre
> este resumen.**

### Phase 8: Paneles laterales en el admin

**Status**: Complete 2026-09-18 (`passed_with_gaps`) — 14/14 planes en 7 waves, los 6 criterios verificados con evidencia propia por el verificador de fase. pgTAP 376 → 380, unitarios 1201 → 1244, integración 196 → 205, E2E 134 → 153 pasando. Gap declarado con dueño: la rama con cifras del grupo 4 del panel de aseadora nunca se vio pintada, y el arreglo exige tocar `sembrarFinanzas()` en `e2e/fixtures.ts`, del que dependen tres specs
**Goal**: Consultar una ficha deja de costar la pantalla donde estabas, y el estado de un aseo se mira en vez de preguntarse por WhatsApp
**Depends on**: Fases 4 y 7
**Requirements**: Ninguno nuevo (cambia la forma de consultar lo ya entregado; el detalle de aseo es lectura nueva sobre datos existentes)
**Definición de alcance**: `.planning/DEFINICION-paneles-admin.md`, acordada con el dueño el 2026-09-14
**Success Criteria** (qué debe ser VERDAD):

  1. Desde la lista de apartamentos, tocar uno abre su ficha sin perder la lista, y cerrar devuelve exactamente donde estabas, con el mismo scroll y el mismo filtro
  2. El enlace de esa ficha se puede pegar en un chat y abre lo mismo: el panel vive en la dirección
  3. El botón atrás cierra el panel, no la sección
  4. Desde Operación, tocar un aseo muestra en qué va: checklist, evidencia y los gastos o daños reportados, sin salir del día
  5. Ninguna aserción de seguridad se debilitó para que el panel pasara: el admin sigue viendo cifras que el aseador no, y nadie ve lo que no debe
  6. La app del aseador no cambió en nada

**Alcance, pantalla por pantalla:**

| Pasa a panel | Hoy es |
|---|---|
| Ficha de apartamento | `app/(admin)/apartamentos/[id]/page.tsx` |
| Calendario del apartamento | `app/(admin)/apartamentos/[id]/calendario/page.tsx` |
| Ficha de aseadora | `app/(admin)/finanzas/aseadoras/[id]/page.tsx` |
| **Detalle de un aseo** | **no existe**: hoy tocar la fila en Operación no hace nada |

**Se queda como página, y no es negociable:** Operación, Apartamentos, Aseadores, Finanzas, Aseos y Pagos son secciones, no fichas. Crear apartamento son ~12 campos con listas dinámicas y no cabe en 480px. Toda la app del aseador se descartó explícitamente: pantalla pequeña, de pie, con guantes.

**El patrón ya existe en el repo:** `SheetDesglosePago.tsx` y `SheetConfirmar.tsx` ya abren así. No hay que inventar el componente ni decidir anchos.

**Plans**: 14 plans, en 7 waves

Plans:

- [x] 08-01-PLAN.md — Wave 0: la migración 28 (el detalle de aseo con guarda de admin) y el bloque P de pgTAP, con sus cuatro señuelos
- [x] 08-02-PLAN.md — Wave 0: el spike que mide si el filtro y el scroll sobreviven a abrir un panel, y el barrido de aserciones que el portal deja vacías
- [x] 08-03-PLAN.md — Wave 0: los dos módulos de dominio que el UI-SPEC daba por existentes y no existen (checkouts y salud del feed)
- [x] 08-04-PLAN.md — Wave 1: el armazón de panel y el único token nuevo, con los tres overrides obligatorios de la primitiva
- [x] 08-05-PLAN.md — Wave 1: la lectura del panel de aseo, cinco viajes y una latencia, con su test de integración
- [x] 08-06-PLAN.md — Wave 2: la ficha de apartamento, que D8-3 mandó crear porque no existía
- [x] 08-07-PLAN.md — Wave 2: el panel de aseo, la tira de evidencia y el diálogo de foto
- [x] 08-08-PLAN.md — Wave 2: el panel de aseadora, y el borrado de la única página que la fase se lleva
- [x] 08-09-PLAN.md — Wave 3: el código de acceso con un gesto, y la credencial del calendario que no puede viajar con él
- [x] 08-10-PLAN.md — Wave 3: la vista de calendario del panel, sin tocar la pantalla de conexión
- [x] 08-11-PLAN.md — Wave 4: las seis aserciones de D8-11, el retargeteo al diálogo con contra-prueba en rojo, y el quinto panel alineado
- [x] 08-12-PLAN.md — Wave 4: los criterios 1, 2 y 3 en `/apartamentos`, y el secreto fuera del documento
- [x] 08-13-PLAN.md — Wave 5: el criterio 4 entero, y los criterios 2 y 3 en Operación y Finanzas
- [x] 08-14-PLAN.md — Wave 6: la compuerta de la fase, la auditoría de señuelos y la deuda declarada

**UI hint**: yes

**Riesgo abierto:** hay specs E2E que afirman que tocar algo **navega a una ruta**. Al pasar a panel esas aserciones cambian de forma. Lo que se sigue probando es que el dato correcto aparece y que nadie ve lo que no debe.

**Y un riesgo que el research destapó midiendo, que el conteo de D8-11 no cubría:** el contenido del panel se portalea fuera del contenedor principal de la página, así que una aserción de seguridad acotada por ese contenedor **pasa en verde sin mirar nada**. Se debilita sola, sin que nadie lo decida. El plan 08-02 la inventaría y el 08-11 la retargetea con contra-prueba en rojo.

### Phase 9: El producto probado de punta a punta

**Status**: **PARADA A PROPOSITO el 2026-09-18 en 3/7 planes**, por decision del dueno: *"dejemos hasta el plan 4 y ahi cerramos porque vamos a empezar a hacer cosas mas cool"*. Lo construido esta completo y en verde, y no deja nada a medias. Ejecutados: `09-01` (el arnes), `09-02` (los rojos intermitentes en cero) y `09-04` (**el recorrido del Core Value entero, que es el criterio 1**), mas un desvio de diagnostico que arreglo un defecto de producto. Pendientes: `09-05`, `09-06`, `09-07` y `09-03`, que es checkpoint humano
**Goal**: Un checkout publicado en Airbnb llega hasta el pago de la aseadora sin que nadie lo empuje a mano, y eso queda probado con los 39 apartamentos reales cargados
**Depends on**: Fase 8
**Requirements**: Ninguno nuevo (prueba de punta a punta lo ya entregado)
**Estrategia**: `.planning/ESTRATEGIA-DE-PRUEBAS.md`, escrita el 2026-09-15 tras el primer mapeo del codebase
**Success Criteria** (qué debe ser VERDAD):

  1. Existe **un** caso que arranca de un `.ics` de fixture y no termina hasta que el aseo aparece en el pago del periodo, pasando por sincronización, confirmación, asignación, push, checklist, evidencia y margen. Si ese caso pasa, el producto existe
  2. Los cinco recorridos donde la operación se tuerce están probados de punta a punta: "no puedo", la reserva que se mueve, el feed caído, checkout y checkin el mismo día, y el apartamento informativo sin una sola cifra de dinero
  3. Los 39 apartamentos reales están cargados con sus feeds reales, y lo que se rompió al cargarlos está arreglado o declarado con dueño
  4. Ninguna aserción de los recorridos nuevos se dio por buena sin verla en rojo primero
  5. Las cuatro suites que ya existen siguen en su línea base, sin una aserción debilitada para que un recorrido pase

**Por qué esta fase y no la de retención:** la de retención se disolvió el
2026-09-18. El dueño decidió que nada se borra nunca y resolvió el espacio
pagando Supabase Pro, así que de sus siete requisitos quedó uno, RET-07, que se
hizo ese mismo día en el quick `260918-a33`. RET-01, RET-02, RET-05 y RET-06
pasan al backlog como post-MVP; RET-03 y RET-04 quedan sin función mientras no
exista purga.

**Lo que la reemplaza sale de una medición, no de una intuición:** el mapeo del
codebase encontró 160 casos E2E organizados por pantalla y **ninguno por
recorrido**, y los 160 siembran el aseo con un `insert` directo en `cleanings`.
El Core Value del proyecto nunca se ha probado entero.

**Riesgo abierto, y es de producto y no de pruebas:** la cola offline en
IndexedDB no existe, aunque `PROJECT.md` la declara como constraint desde el día
uno. El recorrido "se va la señal a mitad del aseo" **no se puede probar** hasta
que se construya. Está en `.planning/ESTRATEGIA-DE-PRUEBAS.md` con su cita.

**Plans**: 7 plans, en 4 waves

Plans:

- [ ] 09-01-PLAN.md — Wave 1: el arnés del recorrido (proveedor `.ics` local, sembrador y worker por HTTP) y el tramo del `.ics` al aseo visible en `/operacion`
- [ ] 09-02-PLAN.md — Wave 1: los dos rojos del instrumento que ya traen su arreglo escrito, para que el criterio 5 sea medible
- [ ] 09-03-PLAN.md — Wave 1: la carga de los 39 apartamentos reales, con su auditor de catálogo y su checkpoint del dueño
- [ ] 09-04-PLAN.md — Wave 2: el recorrido del Core Value entero, del `.ics` al pago de la aseadora, en un solo caso
- [ ] 09-05-PLAN.md — Wave 3: los tres recorridos torcidos del calendario (la reserva que se mueve, el feed caído, el turnover urgente)
- [ ] 09-06-PLAN.md — Wave 3: los dos recorridos torcidos del campo (el "no puedo" y el apartamento informativo)
- [ ] 09-07-PLAN.md — Wave 4: la compuerta, con el cruce de señuelos y la auditoría de que ninguna aserción se debilitó

**UI hint**: no

## Secuencia de ejecución

Equipo de dos personas, ejecución secuencial estricta:

```
1 Fundación → 2 Catálogo → 3 iCal → 4 Dashboard → 5 Push → 6 PWA → 7 Financiero → 8 Paneles → 9 Producto probado
```

**Por qué la 4 antes que la 5 y la 6:** la Fase 3 genera aseos que nadie puede ver hasta que exista el dashboard. Poner el dashboard justo después del motor hace observable el Core Value lo antes posible y permite dogfooding del lado admin mientras se construye la PWA.

**Grafo de paralelización (solo si el equipo crece):** cerrada la Fase 1, son independientes entre sí las fases 2, 3, 5 y 7; y las fases 4 y 6 pueden correr en paralelo porque no comparten componentes, solo `lib/domain`. Camino crítico: 1 → 3 → 4.

**No arrancar UI antes de cerrar la Fase 1.** No es disciplina: `database.types.ts` y la forma de los RPC son el contrato de la UI y cambian con cada migración.

## Research adicional en planning

Fases que necesitan `--research-phase`:

- **Fase 3 (motor iCal):** el comportamiento del iCal de Airbnb no tiene especificación pública y la estabilidad del `UID` está en contradicción directa entre documentos de research
- **Fase 5 (push):** el comportamiento de Web Push en iOS (expiración de suscripciones, `pushsubscriptionchange`) requiere validación en dispositivos físicos

Fases con patrón ya documentado en el research (se puede saltar):

- Fase 1 (schema + RLS), Fase 6 (cola offline idempotente), Fase 7 (snapshot), Fase 8 (el patrón de panel ya está en el repo), Fase 9 (soft delete y purga de Storage)

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Fundación, schema y RLS | 9/9 | Complete (passed_with_gaps) | 2026-09-01 |
| 2. Acceso y administración del catálogo | 15/15 | Executed — 2 checkpoints humanos abiertos | 2026-09-02 |
| 3. Motor de sincronización iCal | 10/10 | Complete (passed_with_gaps) | 2026-09-03 |
| 4. Dashboard operativo del admin | 14/14 | Complete   | 2026-09-06 |
| 5. Notificaciones push e instalación de la PWA | 15/16 | Executed — 05-12 (asistente `/instalar`) ELIMINADO el 2026-09-18 (quick `260918-h47`); 05-17 (validación en dispositivo) sigue diferido por el desarrollador | 2026-09-11 |
| 6. PWA del aseador, offline-first | 10/10 | Executed — checkpoint humano en teléfono real abierto (06-10 tarea 3) | 2026-09-12 |
| 7. Financiero | 12/14 | In Progress|  |
| 8. Paneles laterales en el admin | 0/14 | Planned — 14 planes en 7 waves | - |
| 9. El producto probado de punta a punta | 0/7 | Planned — 7 planes en 4 waves | - |

## Cobertura de requisitos

83 de 83 requisitos v1 mapeados, cada uno a exactamente una fase. Sin huérfanos ni duplicados. Ver la tabla de trazabilidad en `.planning/REQUIREMENTS.md`.

### Phase 10: Rediseño del dashboard admin

**Goal:** Que el dashboard del admin deje de verse como shadcn recién instalado y se vuelva un producto. El primer entregable, y el único alcance cerrado hoy, es `/login`: pantalla partida **50/50** sin canal entre las columnas, con el slot publicitario **a sangre completa** en la mitad izquierda (placeholder animado entre cuatro grises, pegado a los cuatro bordes, con el wordmark en blanco arriba a la izquierda) y el bloque de login **sin tarjeta** centrado en la mitad derecha, con el pie **dentro de esa misma columna**: copyright de año dinámico e iconos de Instagram y TikTok en disabled. Debajo de 1024px el panel de publicidad desaparece y queda el login centrado actual con el pie apilado. Se conservan el wordmark Poppins, los 400px del formulario y los tokens del UI-SPEC vigente. Referencia: la pantalla de acceso de Runway, escogida por el dueño el 2026-09-26, que **deroga D10-2 y D10-3** (el 45/45 con canal del 10% y el footer full-width, con GlossGenius como referencia).
**Requirements**: — (ninguno nuevo; PLAT-01 y PLAT-02 ya están entregados y esta fase no cambia su comportamiento)
**Depends on:** Phase 9
**Plans:** 4/5 plans executed

Plans:
**Wave 1**

- [x] 10-01-PLAN.md — El trazador: la rejilla 45/10/45, el panel publicitario y su ciclo de cuatro grises (wave 1)
- [x] 10-02-PLAN.md — El pie de página y sus dos glifos de marca, probados sin navegador (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 10-03-PLAN.md — El año de Bogotá, el pie cableado, y la suite completa como regresión (wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 10-04-PLAN.md — El rediseño contra la referencia de Runway: 50/50, panel a sangre completa, login sin tarjeta, dos wordmarks y el pie dentro de la columna. Deroga D10-2 y D10-3 (wave 3)

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 10-05-PLAN.md — El rediseño de `/operacion`: selector de día, vistazo de cuatro métricas, dos columnas al 30 y al 70 con la lista del día y el detalle inline, el sin confirmar como estado de la tarjeta y las alertas mudadas a una campana de la barra superior (wave 4)

**Cross-cutting constraints:**

- Las aserciones nuevas se vieron en rojo con un señuelo antes de darse por buenas

---
*Roadmap creado: 2026-08-31. Resecuenciado para equipo de dos, con el job de borrado movido después del piloto. Google Calendar descartado como fuente: es otro suscriptor del mismo `.ics` de Airbnb.*

*Actualizado 2026-09-15: el **piloto en Bogotá 1 se elimina del milestone** por decisión del dueño. El objetivo pasa a ser terminar el MVP de la plataforma limpio de punta a punta, y un piloto es operación, no producto. No huérfana ningún requisito: la fase no tenía REQ-IDs propios. En su lugar entra la Fase 8 (paneles laterales), y la retención conserva la Fase 9 con los siete RET completos, incluidos RET-03 y RET-07, que se le habían movido desde la Fase 7 el 2026-09-13 (issues #5 y #6) y que el texto de esta sección todavía no reflejaba.*
