# Roadmap: VivaGuest

## Overview

El proyecto se construye de adentro hacia afuera. Primero la base de datos: schema, migraciones, invariantes y RLS, porque `database.types.ts` y la forma de los RPC son el contrato de toda la UI y cambian con cada migración. Sobre esa base se monta el acceso y el catálogo real de la operación (39 unidades, 8 clusters), luego el motor de sincronización iCal que es el Core Value, y enseguida el dashboard del admin, que es lo que hace observable ese motor. Después la superficie del aseador (push primero, PWA después), el financiero, el piloto acotado a Bogotá 1, y de último el borrado automático, que no tiene nada que borrar hasta el mes 7.

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
- [ ] **Fase 8: Piloto en Bogotá 1** - Los 23 apartamentos de personal propio operando dentro del sistema, sin WhatsApp ni Excel
- [ ] **Fase 9: Borrado automático y retención** - El sistema se limpia solo sin destruir evidencia ni historial de pagos

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

**Status**: **INCOMPLETA — 15/17 planes**, mergeada a `main` el 2026-09-12 sin verificación. Faltan **05-12** (`/instalar`: bloqueado esperando las cinco capturas reales; mientras tanto los cuatro enlaces del banner del aseador caen en 404, PWA-02 sin cumplir) y **05-17** (E2E de la fase, las doce puertas y la validación en teléfono físico). No existe `VERIFICATION.md`: los siete criterios de éxito **no se han verificado formalmente**
**Goal**: El aseador instala la PWA y recibe en el teléfono cada aseo que se le asigna; el admin recibe cada evento de campo
**Depends on**: Fase 2
**Requirements**: NOTIF-01, NOTIF-02, NOTIF-03, NOTIF-04, PWA-02, PWA-03
**Success Criteria** (qué debe ser VERDAD):

  1. La PWA se instala en la pantalla de inicio en Android y en iOS y desde ahí recibe notificaciones push en dispositivos físicos reales
  2. Al asignarse un aseo, el aseador recibe push con los detalles del aseo (apartamento, fecha y hora límite) y al tocarla aterriza en ese aseo, donde revela el código de acceso con la auditoría y la ventana temporal intactas. **Corregido 2026-09-10:** el código de acceso NO viaja dentro del payload de push. Desviación deliberada de la redacción original, justificada en `05-CONTEXT.md` D-06: el código solo sale por `reveal_access_code()`, que exige rastro en `access_code_reads` (T-01-48); meterlo en el payload lo pondría en la pantalla de bloqueo, sin auditoría y posiblemente días antes del aseo
  3. El admin recibe push por daño reportado, faltante reportado, "no puedo" y aseo completado
  4. Si el aseador no tiene push activo, ve un banner persistente con instrucciones distintas según si nunca dio el permiso o si ya lo negó
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
- [ ] 05-12-PLAN.md — `/instalar`: el asistente de cuatro pasos con capturas reales y los tres modos de entrada
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

**Plans**: 11/14 plans executed
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
- [ ] 07-12-PLAN.md — Sub-pestaña Pagos: desglose, marcar pagado y aviso de periodo sin cerrar
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

### Phase 8: Piloto en Bogotá 1

**Goal**: Los 23 apartamentos de Bogotá 1, con personal propio, operan dentro del sistema sin WhatsApp ni Excel
**Depends on**: Fases 4, 6 y 7
**Requirements**: Ninguno nuevo (valida en operación real los requisitos ya entregados)
**Success Criteria** (qué debe ser VERDAD):

  1. Existe una ruta `/instalar` que detecta navegador y webview, y una persona ajena al equipo completa la instalación de la PWA siguiéndola, tanto en iOS como en Android
  2. Los 23 apartamentos de Bogotá 1 están cargados con feeds activos, cuartos, lista base de faltantes, tarifas y responsable/suplente
  3. Durante el piloto, cada checkout detectado en calendario termina en un aseo confirmado, asignado y ejecutado con evidencia, con WhatsApp y Excel corriendo en paralelo solo como red de seguridad
  4. El admin ve el estado de onboarding de cada aseador del cluster: instaló la PWA, concedió el permiso de push y completó su primer aseo

**Plans**: TBD
**UI hint**: yes

**Riesgo abierto:** no hay métrica de éxito definida para este piloto. Sin criterio de corte no hay forma de decidir cuándo se apagan WhatsApp y Excel. Está registrado como decisión pendiente, no como tarea de la fase.

### Phase 9: Borrado automático y retención

**Goal**: El sistema se limpia solo, cabe en el free tier y no destruye ni evidencia en disputa ni historial de pagos
**Depends on**: Fase 8
**Requirements**: RET-01, RET-02, RET-04, RET-05, RET-06
**Success Criteria** (qué debe ser VERDAD):

  1. Las fotos de evidencia con más de 30 días se borran solas, y el registro del aseo con su checklist sigue completo y consultable
  2. Los aseos, checklists, gastos y daños con más de 6 meses se borran solos, y el admin recibe aviso 15 días antes de cada borrado
  3. El borrado elimina los archivos en Storage además de las filas, sin dejar objetos huérfanos facturando, verificable comparando el bucket contra la tabla
  4. Un aseo marcado con retención legal nunca se borra, ni por la purga de fotos ni por la de 6 meses
  5. Los agregados de desempeño (timestamps de inicio y fin, eventos "no puedo") sobreviven al borrado del detalle

**Plans**: TBD

**Por qué va de último:** el job de 6 meses no tiene nada que borrar hasta el mes 7 de operación, así que construirlo antes del piloto no se puede validar. Las columnas que sí necesitan existir desde el principio (`legal_hold`, `deleted_at`) están en el alcance de la Fase 1.

## Secuencia de ejecución

Equipo de dos personas, ejecución secuencial estricta:

```
1 Fundación → 2 Catálogo → 3 iCal → 4 Dashboard → 5 Push → 6 PWA → 7 Financiero → 8 Piloto → 9 Borrado
```

**Por qué la 4 antes que la 5 y la 6:** la Fase 3 genera aseos que nadie puede ver hasta que exista el dashboard. Poner el dashboard justo después del motor hace observable el Core Value lo antes posible y permite dogfooding del lado admin mientras se construye la PWA.

**Grafo de paralelización (solo si el equipo crece):** cerrada la Fase 1, son independientes entre sí las fases 2, 3, 5 y 7; y las fases 4 y 6 pueden correr en paralelo porque no comparten componentes, solo `lib/domain`. Camino crítico: 1 → 3 → 4.

**No arrancar UI antes de cerrar la Fase 1.** No es disciplina: `database.types.ts` y la forma de los RPC son el contrato de la UI y cambian con cada migración.

## Research adicional en planning

Fases que necesitan `--research-phase`:

- **Fase 3 (motor iCal):** el comportamiento del iCal de Airbnb no tiene especificación pública y la estabilidad del `UID` está en contradicción directa entre documentos de research
- **Fase 5 (push):** el comportamiento de Web Push en iOS (expiración de suscripciones, `pushsubscriptionchange`) requiere validación en dispositivos físicos
- **Fase 8 (piloto):** no hay patrón estándar de rollout de PWA a una fuerza laboral con dispositivos heterogéneos

Fases con patrón ya documentado en el research (se puede saltar):

- Fase 1 (schema + RLS), Fase 6 (cola offline idempotente), Fase 7 (snapshot), Fase 9 (soft delete y purga de Storage)

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Fundación, schema y RLS | 9/9 | Complete (passed_with_gaps) | 2026-09-01 |
| 2. Acceso y administración del catálogo | 15/15 | Executed — 2 checkpoints humanos abiertos | 2026-09-02 |
| 3. Motor de sincronización iCal | 10/10 | Complete (passed_with_gaps) | 2026-09-03 |
| 4. Dashboard operativo del admin | 14/14 | Complete   | 2026-09-06 |
| 5. Notificaciones push e instalación de la PWA | 15/17 | Executed — 05-12 (wizard `/instalar`) y 05-17 (validación en dispositivo) diferidos por el desarrollador | 2026-09-11 |
| 6. PWA del aseador, offline-first | 10/10 | Executed — checkpoint humano en teléfono real abierto (06-10 tarea 3) | 2026-09-12 |
| 7. Financiero | 11/14 | In Progress|  |
| 8. Piloto en Bogotá 1 | 0/TBD | Not started | - |
| 9. Borrado automático y retención | 0/TBD | Not started | - |

## Cobertura de requisitos

83 de 83 requisitos v1 mapeados, cada uno a exactamente una fase. Sin huérfanos ni duplicados. Ver la tabla de trazabilidad en `.planning/REQUIREMENTS.md`.

---
*Roadmap creado: 2026-08-31. Resecuenciado para equipo de dos, con el job de borrado movido después del piloto. Google Calendar descartado como fuente: es otro suscriptor del mismo `.ics` de Airbnb.*
