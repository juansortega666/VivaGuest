# Roadmap: VivaGuest

## Overview

El proyecto se construye de adentro hacia afuera. Primero la base de datos: schema, migraciones, invariantes y RLS, porque `database.types.ts` y la forma de los RPC son el contrato de toda la UI y cambian con cada migración. Sobre esa base se monta el acceso y el catálogo real de la operación (39 unidades, 8 clusters), y de ahí se abren cuatro frentes paralelos: el motor de sincronización iCal (que es el Core Value), las notificaciones push, la superficie del aseador y la superficie del admin. Cierra con el financiero y la retención, que solo dependen del schema, y con un piloto acotado a Bogotá 1 para validar la adopción antes de tocar el resto de clusters.

## Phases

**Numeración de fases:**
- Fases enteras (1, 2, 3): trabajo planeado del milestone
- Fases decimales (2.1, 2.2): inserciones urgentes (marcadas con INSERTED)

- [ ] **Fase 1: Fundación, schema y RLS** - La base de datos impone las reglas del negocio y aísla a cada aseador antes de que exista una sola pantalla
- [ ] **Fase 2: Acceso y administración del catálogo** - Login por rol y CRUD de apartamentos y aseadores para montar la operación real
- [ ] **Fase 3: Motor de sincronización iCal** - Todo checkout publicado en Airbnb/Booking se convierte en un aseo pendiente, sin duplicados ni cancelaciones falsas
- [ ] **Fase 4: Notificaciones push e instalación de la PWA** - El aseador instala la PWA y recibe cada asignación en el teléfono; el admin recibe cada evento de campo
- [ ] **Fase 5: PWA del aseador, offline-first** - El aseador ejecuta el aseo completo con o sin señal y nada del trabajo de campo se pierde
- [ ] **Fase 6: Dashboard operativo del admin** - Toda la operación del día en una pantalla, con confirmación en un paso y alertas de una sola jerarquía
- [ ] **Fase 7: Financiero y retención** - Rentabilidad por aseo, cierre mensual persistido y borrado automático que no destruye evidencia
- [ ] **Fase 8: Piloto en Bogotá 1** - Los 23 apartamentos de personal propio operando dentro del sistema, sin WhatsApp ni Excel

## Phase Details

### Phase 1: Fundación, schema y RLS
**Goal**: La base de datos existe, impone las reglas del negocio por sí sola y ningún aseador puede ver datos ajenos
**Depends on**: Nada (primera fase)
**Requirements**: PLAT-03, PLAT-05, PLAT-06, ASEO-07, FIN-01
**Success Criteria** (qué debe ser VERDAD):
  1. `supabase db reset` levanta el schema completo desde cero en CI, la suite pgTAP pasa en verde incluyendo los casos negativos de RLS, y el seed de los 8 clusters y las 39 unidades reales queda cargado
  2. Un aseador autenticado que consulta la API directamente solo obtiene los aseos asignados a él, y no ve instrucciones ni datos de apartamentos ajenos
  3. El código de acceso de un apartamento solo se obtiene vía RPC, solo para el aseador con un aseo vigente, y cada consulta queda registrada en `access_code_reads`
  4. Intentar crear un segundo aseo activo para el mismo apartamento y la misma fecha falla a nivel de base de datos
  5. Editar la tarifa de un apartamento no altera el margen ya congelado en un aseo generado antes de la edición
**Plans**: TBD

**Alcance no capturado por REQ-IDs pero obligatorio en esta fase:**
- `legal_hold` y `deleted_at` en el schema inicial aunque el job de borrado llegue en la Fase 7
- Máquina de estados del aseo y log de auditoría de transiciones
- Helper `today_bog()` y regla transversal `date` vs `timestamptz` (nada de `current_date` en jobs, policies ni índices)
- Bucket `evidencia` privado con sus policies
- Catálogo provisional de cuartos y tareas (máximo 3 por tipo), editable sin migración

### Phase 2: Acceso y administración del catálogo
**Goal**: El admin monta toda la operación real en el sistema y cada usuario entra a la superficie que le corresponde
**Depends on**: Fase 1
**Requirements**: PLAT-01, PLAT-02, PLAT-04, PLAT-07, APTO-01, APTO-02, APTO-03, APTO-04, APTO-05, APTO-06, APTO-07, APTO-08, APTO-09, APTO-10, APTO-11, ASEADOR-01, ASEADOR-02, ASEADOR-03
**Success Criteria** (qué debe ser VERDAD):
  1. Admin y aseador inician sesión con email y contraseña y aterrizan cada uno en su superficie (dashboard o PWA), con la sesión persistiendo entre recargas
  2. El admin crea, edita, activa y desactiva apartamentos con tarifas, links de calendario validados al guardar, ubicación de Google Maps, código de acceso, hora límite (default 11:30), cuartos, lista base de faltantes y responsable/suplente
  3. El sistema impide activar un apartamento sin tarifa al huésped y pago al aseador, exige responsable cuando `gestion_vivaguest` es true y contacto externo cuando es false
  4. El admin crea y desactiva cuentas de aseador (sin auto-registro) y el aseador desactivado pierde el acceso de inmediato aunque tuviera la sesión abierta
  5. El admin encuentra cualquiera de las 39 unidades desde el buscador y ve la lista de aseadores con su estado y los apartamentos donde es responsable o suplente
**Plans**: TBD
**UI hint**: yes

### Phase 3: Motor de sincronización iCal
**Goal**: Todo checkout publicado en los calendarios se convierte en un aseo pendiente, sin duplicados y sin cancelaciones falsas
**Depends on**: Fase 1 (paralelizable con las Fases 2, 4 y 7)
**Requirements**: SYNC-01, SYNC-02, SYNC-03, SYNC-04, SYNC-05, SYNC-06, SYNC-07, SYNC-08, SYNC-09, SYNC-10, SYNC-11
**Success Criteria** (qué debe ser VERDAD):
  1. Cada feed configurado se lee cada 30 minutos en una invocación aislada, y un feed caído no impide que los demás corran
  2. Un fin de bloqueo genera exactamente un aseo `normal` en la fecha correcta, corridas sucesivas sobre el mismo feed no crean duplicados, y los apartamentos con `gestion_vivaguest = false` generan un aseo informativo sin estado ni asignación
  3. Los bloqueos del propietario no generan aseos, y un feed vacío, inválido o truncado no cancela ningún aseo existente y queda registrado como intento fallido
  4. Cuando la reserva se mueve o desaparece, el aseo viejo se cancela y aparece uno nuevo sin confirmar, salvo que el aseo ya tenga `started_at`
  5. El admin queda alertado cuando un link deja de responder, cuando el propio job de sincronización deja de correr, cuando checkout y checkin caen el mismo día, y cuando una reserva parece una extensión creada como reserva nueva
**Plans**: TBD

**Prerequisito humano (bloqueante, no es una tarea de la fase):** hay que capturar y versionar un `.ics` real de Airbnb y uno de Booking de la cuenta propia de VivaGuest antes de planear esta fase. Las muestras públicas están desactualizadas y la más citada en GitHub es falsa. Sin esos archivos no hay fixtures de test ni forma de resolver empíricamente la estabilidad del `UID`.

### Phase 4: Notificaciones push e instalación de la PWA
**Goal**: El aseador instala la PWA y recibe en el teléfono cada aseo que se le asigna; el admin recibe cada evento de campo
**Depends on**: Fase 1 (paralelizable con las Fases 2, 3 y 7)
**Requirements**: NOTIF-01, NOTIF-02, NOTIF-03, NOTIF-04, PWA-02, PWA-03
**Success Criteria** (qué debe ser VERDAD):
  1. La PWA se instala en la pantalla de inicio en Android y en iOS y desde ahí recibe notificaciones push en dispositivos físicos reales
  2. Al asignarse un aseo, el aseador recibe push con los detalles y el código de acceso, y al tocarla aterriza en ese aseo
  3. El admin recibe push por daño reportado, faltante reportado, "no puedo" y aseo completado
  4. Si el aseador no tiene push activo, ve un banner persistente con instrucciones distintas según si nunca dio el permiso o si ya lo negó
  5. Cada envío queda registrado, los fallidos se reintentan, y las suscripciones que el navegador reporta como expiradas o revocadas se eliminan solas
**Plans**: TBD
**UI hint**: yes

### Phase 5: PWA del aseador, offline-first
**Goal**: El aseador ejecuta el aseo completo desde el teléfono, con o sin señal, y nada de lo que hizo en campo se pierde
**Depends on**: Fases 2 y 4
**Requirements**: PWA-01, PWA-04, PWA-05, PWA-06, PWA-07, PWA-08, PWA-09, PWA-10, CHECK-01, CHECK-02, CHECK-03, CHECK-04, REPORT-01, REPORT-02, REPORT-03
**Success Criteria** (qué debe ser VERDAD):
  1. El aseador ve la lista de sus aseos asignados y abre el detalle con instrucciones y código de acceso
  2. El aseador marca "Empecé", completa el checklist armado únicamente con los cuartos que ese apartamento tiene, y "Terminé" queda bloqueado mientras falte una tarea o la foto de algún cuarto
  3. Las fotos se comprimen y pierden el EXIF en el dispositivo antes de subirse, conservando solo la corrección de orientación
  4. El aseador completa un aseo entero en modo avión, cierra la app, y al recuperar señal todo sube sin duplicarse ni perderse, con el contador de acciones pendientes visible mientras tanto
  5. El aseador reporta daños con foto y descripción, gastos con foto del recibo y faltantes desde la lista base más "Otros", y pulsa "no puedo" para devolver el aseo a Pendiente sin asignar
**Plans**: TBD
**UI hint**: yes

### Phase 6: Dashboard operativo del admin
**Goal**: El admin ve toda la operación del día en una pantalla y confirma, reasigna o cierra cualquier aseo sin salir de ahí
**Depends on**: Fases 2, 3 y 4 (paralelizable con la Fase 5)
**Requirements**: ASEO-01, ASEO-02, ASEO-03, ASEO-04, ASEO-05, ASEO-06, ASEO-08, ASEO-09, DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-06, DASH-07, REPORT-04
**Success Criteria** (qué debe ser VERDAD):
  1. Todo aseo nuevo nace en Pendiente sin confirmar y aparece en la bandeja persistente "Sin confirmar"; el admin lo confirma en un solo paso escribiendo número de huéspedes e instrucciones, y queda asignado en firme al responsable del apartamento
  2. El admin ve los servicios organizados por día (hoy, mañana y siguientes) y la carga diaria de cada aseador para decidir si activa al suplente
  3. El admin reasigna un aseo puntual sin tocar responsable ni suplente permanentes, crea aseos `repaso` y `emergencia`, reprograma fechas, cierra manualmente un aseo que la realidad ya resolvió y cancela
  4. Un solo panel de alertas muestra con la misma jerarquía visual: urgentes, extensión mal creada, "no puedo", daños, faltantes, calendario caído y hora límite vencida sin terminar
  5. El admin abre cualquier apartamento y ve su historial cronológico con los daños reportados; los aseos de unidades con `gestion_vivaguest = false` se muestran con fecha y a cargo de quién, sin estado ni acciones
**Plans**: TBD
**UI hint**: yes

### Phase 7: Financiero y retención
**Goal**: El admin ve cuánto deja cada aseo y cuánto le debe a cada aseador al cierre de mes, y el sistema se limpia solo sin destruir evidencia
**Depends on**: Fase 1 (paralelizable con las Fases 3 y 4; la pantalla de cierre se consume desde el dashboard de la Fase 6)
**Requirements**: FIN-02, FIN-03, FIN-04, FIN-05, RET-01, RET-02, RET-03, RET-04, RET-05
**Success Criteria** (qué debe ser VERDAD):
  1. El admin ve la rentabilidad de cada aseo (fee al huésped menos pago al aseador) calculada contra las tarifas congeladas en ese aseo, y los aseos informativos quedan fuera de todo cálculo financiero y de toda métrica
  2. Al cierre del último día laboral del mes (excluyendo fines de semana, no festivos) el sistema calcula el pago de cada aseador, lo persiste como snapshot propio y lo muestra en pantalla
  3. Ese snapshot mensual sigue consultable aunque los aseos que lo sustentan ya se hayan borrado por retención
  4. Los aseos, checklists, fotos, gastos y daños con más de 6 meses se borran solos incluyendo los archivos en Storage (sin objetos huérfanos facturando), y el admin recibe aviso 15 días antes de cada borrado
  5. Un aseo marcado con retención legal nunca se borra, y los agregados de desempeño (timestamps de inicio y fin, eventos "no puedo") sobreviven al borrado del detalle
**Plans**: TBD
**UI hint**: yes

### Phase 8: Piloto en Bogotá 1
**Goal**: Los 23 apartamentos de Bogotá 1, con personal propio, operan dentro del sistema sin WhatsApp ni Excel
**Depends on**: Fases 5, 6 y 7
**Requirements**: Ninguno nuevo (valida en operación real los requisitos ya entregados)
**Success Criteria** (qué debe ser VERDAD):
  1. Existe una ruta `/instalar` que detecta navegador y webview, y una persona ajena al equipo completa la instalación de la PWA siguiéndola, tanto en iOS como en Android
  2. Los 23 apartamentos de Bogotá 1 están cargados con feeds activos, cuartos, lista base de faltantes, tarifas y responsable/suplente
  3. Durante el piloto, cada checkout detectado en calendario termina en un aseo confirmado, asignado y ejecutado con evidencia, con WhatsApp y Excel corriendo en paralelo solo como red de seguridad
  4. El admin ve el estado de onboarding de cada aseador del cluster: instaló la PWA, concedió el permiso de push y completó su primer aseo
**Plans**: TBD
**UI hint**: yes

## Paralelización

Con `parallelization: true` en config, una vez cerrada la Fase 1 se abren cuatro frentes independientes:

```
Fase 1 (Fundación, schema, RLS)  ← estrictamente secuencial, bloquea todo
   │
   ├─► Fase 2 (Acceso y catálogo)
   ├─► Fase 3 (Motor iCal)          ← camino crítico
   ├─► Fase 4 (Push + PWA shell)
   └─► Fase 7 (Financiero + retención)
              │
        ┌─────┴─────┐
        ▼           ▼
   Fase 5        Fase 6
   (PWA aseador) (Dashboard admin)   ← paralelas entre sí, cero componentes compartidos
        └─────┬─────┘
              ▼
          Fase 8 (Piloto Bogotá 1)
```

**Camino crítico:** Fase 1 → Fase 3 → Fase 6. Todo el Core Value ("que ningún aseo se pierda") vive ahí. La Fase 5 sin la Fase 3 no tiene aseos que mostrar.

**No arrancar UI antes de cerrar la Fase 1.** No es disciplina: `database.types.ts` y la forma de los RPC son el contrato de la UI y cambian con cada migración.

## Research adicional en planning

Fases que necesitan `--research-phase`:
- **Fase 3 (motor iCal):** el comportamiento del iCal de Airbnb/Booking no tiene especificación pública y la estabilidad del `UID` está en contradicción directa entre documentos de research
- **Fase 4 (push):** el comportamiento de Web Push en iOS (expiración de suscripciones, `pushsubscriptionchange`) requiere validación en dispositivos físicos
- **Fase 8 (piloto):** no hay patrón estándar de rollout de PWA a una fuerza laboral con dispositivos heterogéneos

Fases con patrón ya documentado en el research (se puede saltar):
- Fase 1 (schema + RLS), Fase 5 (cola offline idempotente), Fase 7 (snapshot y soft delete)

## Progress

**Orden de ejecución:** las fases corren en orden numérico: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 (respetando la paralelización descrita arriba cuando haya capacidad).

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Fundación, schema y RLS | 0/TBD | Not started | - |
| 2. Acceso y administración del catálogo | 0/TBD | Not started | - |
| 3. Motor de sincronización iCal | 0/TBD | Not started | - |
| 4. Notificaciones push e instalación de la PWA | 0/TBD | Not started | - |
| 5. PWA del aseador, offline-first | 0/TBD | Not started | - |
| 6. Dashboard operativo del admin | 0/TBD | Not started | - |
| 7. Financiero y retención | 0/TBD | Not started | - |
| 8. Piloto en Bogotá 1 | 0/TBD | Not started | - |

## Cobertura de requisitos

80 de 80 requisitos v1 mapeados, cada uno a exactamente una fase. Sin huérfanos ni duplicados. Ver la tabla de trazabilidad en `.planning/REQUIREMENTS.md`.

---
*Roadmap creado: 2026-08-31*
