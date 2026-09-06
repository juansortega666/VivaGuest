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
- [ ] **Fase 6: PWA del aseador, offline-first** - El aseador ejecuta el aseo completo con o sin señal y nada del trabajo de campo se pierde
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
- [ ] 04-06-PLAN.md — `lib/data/operacion.ts`: la consulta única y sus tres proyecciones
- [ ] 04-07-PLAN.md — Reprogramar contra el reconcile, y los diez señuelos de la capa de base
- [ ] 04-08-PLAN.md — Las ocho Server Actions de la pantalla de operación
- [ ] 04-09-PLAN.md — La pantalla `/operacion`: dos carriles, días, fila y franja de carga
- [ ] 04-10-PLAN.md — Bandeja `Sin confirmar`, `Sheet` encadenado y creación manual
- [ ] 04-11-PLAN.md — `MenuAseo` y los cuatro diálogos de mutación
- [ ] 04-12-PLAN.md — Historial del apartamento con los daños (DASH-06, REPORT-04)
- [ ] 04-13-PLAN.md — Panel de alertas, marca de frescura y Realtime con degradación
- [ ] 04-14-PLAN.md — E2E, prueba de escala de grises y puerta de fase
**UI hint**: yes

**Costura conocida:** al confirmar, el aseo queda asignado pero **no se notifica a nadie** hasta que exista la Fase 5. El evento se escribe en la cola de notificaciones y se drena cuando el worker exista. Es intencional, no un olvido.

### Phase 5: Notificaciones push e instalación de la PWA
**Goal**: El aseador instala la PWA y recibe en el teléfono cada aseo que se le asigna; el admin recibe cada evento de campo
**Depends on**: Fase 2
**Requirements**: NOTIF-01, NOTIF-02, NOTIF-03, NOTIF-04, PWA-02, PWA-03
**Success Criteria** (qué debe ser VERDAD):
  1. La PWA se instala en la pantalla de inicio en Android y en iOS y desde ahí recibe notificaciones push en dispositivos físicos reales
  2. Al asignarse un aseo, el aseador recibe push con los detalles y el código de acceso, y al tocarla aterriza en ese aseo
  3. El admin recibe push por daño reportado, faltante reportado, "no puedo" y aseo completado
  4. Si el aseador no tiene push activo, ve un banner persistente con instrucciones distintas según si nunca dio el permiso o si ya lo negó
  5. Cada envío queda registrado, los fallidos se reintentan, y las suscripciones que el navegador reporta como expiradas o revocadas se eliminan solas
**Plans**: TBD
**UI hint**: yes

### Phase 6: PWA del aseador, offline-first
**Goal**: El aseador ejecuta el aseo completo desde el teléfono, con o sin señal, y nada de lo que hizo en campo se pierde
**Depends on**: Fases 2 y 5
**Requirements**: PWA-01, PWA-04, PWA-05, PWA-06, PWA-07, PWA-08, PWA-09, PWA-10, CHECK-01, CHECK-02, CHECK-03, CHECK-04, REPORT-01, REPORT-02, REPORT-03
**Success Criteria** (qué debe ser VERDAD):
  1. El aseador ve la lista de sus aseos asignados y abre el detalle con instrucciones y código de acceso
  2. El aseador marca "Empecé", completa el checklist armado únicamente con los cuartos que ese apartamento tiene, y "Terminé" queda bloqueado mientras falte una tarea o la foto de algún cuarto
  3. Las fotos se comprimen a ~200 KB con lado largo de 1280 px y pierden el EXIF en el dispositivo antes de subirse, conservando solo la corrección de orientación
  4. El aseador completa un aseo entero en modo avión, cierra la app, y al recuperar señal todo sube sin duplicarse ni perderse, con el contador de acciones pendientes visible mientras tanto
  5. El aseador reporta daños con foto y descripción, gastos con foto del recibo y faltantes desde la lista base más "Otros", y pulsa "no puedo" para devolver el aseo a Pendiente sin asignar
**Plans**: TBD
**UI hint**: yes

### Phase 7: Financiero
**Goal**: El admin ve cuánto deja cada aseo y cuánto le debe a cada aseador al cierre de mes
**Depends on**: Fases 1 y 4
**Requirements**: FIN-02, FIN-03, FIN-04, FIN-05, RET-03, RET-07
**Success Criteria** (qué debe ser VERDAD):
  1. El admin ve la rentabilidad de cada aseo (fee al huésped menos pago al aseador) calculada contra las tarifas congeladas en ese aseo, y los aseos informativos quedan fuera de todo cálculo financiero y de toda métrica
  2. Al cierre del último día laboral del mes (excluyendo fines de semana, no festivos) el sistema calcula el pago de cada aseador, lo persiste como snapshot propio y lo muestra en pantalla
  3. Ese snapshot mensual queda escrito de forma que sobreviva al borrado de los aseos que lo sustentan, verificable borrando manualmente un aseo del mes ya cerrado
  4. El admin marca un aseo con retención legal y ese aseo queda excluido de cualquier purga futura
  5. El admin ve cuánto Storage lleva consumido y recibe alerta al superar el 70% del cupo
**Plans**: TBD
**UI hint**: yes

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
| 4. Dashboard operativo del admin | 5/14 | In Progress|  |
| 5. Notificaciones push e instalación de la PWA | 0/TBD | Not started | - |
| 6. PWA del aseador, offline-first | 0/TBD | Not started | - |
| 7. Financiero | 0/TBD | Not started | - |
| 8. Piloto en Bogotá 1 | 0/TBD | Not started | - |
| 9. Borrado automático y retención | 0/TBD | Not started | - |

## Cobertura de requisitos

83 de 83 requisitos v1 mapeados, cada uno a exactamente una fase. Sin huérfanos ni duplicados. Ver la tabla de trazabilidad en `.planning/REQUIREMENTS.md`.

---
*Roadmap creado: 2026-08-31. Resecuenciado para equipo de dos, con el job de borrado movido después del piloto. Google Calendar descartado como fuente: es otro suscriptor del mismo `.ics` de Airbnb.*
