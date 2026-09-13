# Requirements: VivaGuest

**Defined:** 2026-08-31
**Core Value:** Que ningún aseo se pierda: todo checkout detectado en calendario termina en un aseo confirmado, asignado y ejecutado con evidencia, sin coordinación manual por WhatsApp.

## v1 Requirements

### Plataforma y acceso

- [ ] **PLAT-01**: Admin inicia sesión con email y contraseña, y su sesión persiste entre recargas
- [ ] **PLAT-02**: Aseador inicia sesión con email y contraseña desde la PWA
- [ ] **PLAT-03**: Un aseador solo puede ver los aseos asignados a él y los datos de las propiedades de esos aseos
- [ ] **PLAT-04**: Al desactivar un aseador, su acceso queda invalidado de inmediato aunque tenga sesión abierta
- [ ] **PLAT-05**: El código de acceso de una propiedad solo es visible para el aseador asignado a un aseo vigente, y cada consulta queda auditada
- [ ] **PLAT-06**: Las instrucciones de un aseo solo son visibles para el aseador asignado a ese aseo
- [ ] **PLAT-07**: Un usuario autenticado es enrutado a su superficie según su rol (dashboard admin o PWA aseador)

### Apartamentos

- [ ] **APTO-01**: Admin crea, edita, activa y desactiva apartamentos
- [ ] **APTO-02**: Admin configura tarifa al huésped y pago al aseador, y el sistema impide activar el apartamento sin ambas
- [ ] **APTO-03**: Admin registra el link de exportación iCal de Airbnb del apartamento y el sistema valida que responda al guardar
- [ ] **APTO-04**: Admin registra ubicación de Google Maps y código de acceso del apartamento
- [ ] **APTO-05**: Admin configura la hora límite del aseo por apartamento, con default 11:30
- [ ] **APTO-06**: Admin define la lista de cuartos del apartamento, que determina qué checklist se arma
- [ ] **APTO-07**: Admin configura la lista base de faltantes del apartamento
- [ ] **APTO-08**: Admin marca `gestion_vivaguest` y, cuando es true, asigna aseador responsable y suplente
- [ ] **APTO-09**: Admin registra el contacto externo (nombre + contacto, texto libre) cuando `gestion_vivaguest` es false
- [ ] **APTO-10**: Admin marca si el fee va discriminado o incluido en el precio total (informativo)
- [ ] **APTO-11**: Admin busca apartamentos desde el dashboard
- [ ] **APTO-12**: Al conectar el calendario, el admin ve una guía visual paso a paso de dónde sacar el link de exportación en Airbnb, y al pegarlo el sistema le confirma en pantalla que el feed sirve, cuántas reservas encontró y cuál es el próximo checkout detectado

### Aseadores

- [ ] **ASEADOR-01**: Admin crea cuentas de aseador, sin auto-registro
- [ ] **ASEADOR-02**: Admin desactiva un aseador
- [ ] **ASEADOR-03**: Admin ve la lista de aseadores con su estado y los apartamentos donde es responsable o suplente

### Sincronización de calendario

- [x] **SYNC-01**: El sistema lee cada feed configurado cada 30 minutos, de forma aislada, sin que un feed caído afecte a los demás
- [x] **SYNC-02**: El sistema genera un aseo tipo `normal` en la fecha en que el calendario libera el apartamento, sin crear duplicados en corridas sucesivas
- [x] **SYNC-03**: El sistema distingue reservas reales de bloqueos del propietario y no genera aseos para los bloqueos
- [x] **SYNC-04**: El sistema cancela automáticamente el aseo cuando la reserva desaparece o cambia de fecha, salvo que el aseo ya tenga `started_at`
- [x] **SYNC-05**: Cuando la reserva se mueve y genera un checkout distinto, el sistema crea el aseo nuevo sin confirmar
- [x] **SYNC-06**: El sistema no cancela aseos cuando el feed responde vacío o con contenido inválido, y registra el intento fallido
- [x] **SYNC-07**: El sistema marca urgente el aseo cuando el checkout y el checkin siguiente caen el mismo día
- [x] **SYNC-08**: El sistema detecta reservas que parecen una extensión creada como reserva nueva y alerta al admin para doble chequeo antes de crear el aseo
- [x] **SYNC-09**: El sistema alerta al admin cuando un link de calendario deja de responder
- [x] **SYNC-10**: El sistema alerta al admin cuando el propio job de sincronización deja de correr
- [x] **SYNC-11**: El sistema genera un aseo informativo, sin estado ni asignación, para apartamentos con `gestion_vivaguest = false`

### Ciclo de vida del aseo

- [x] **ASEO-01**: Todo aseo nace en Pendiente sin confirmar y aparece en la bandeja "Sin confirmar"
- [x] **ASEO-02**: Admin confirma el aseo en un solo paso escribiendo número de huéspedes e instrucciones
- [x] **ASEO-03**: Al confirmar, el aseo queda asignado en firme al responsable del apartamento
- [x] **ASEO-04**: Admin reasigna un aseo puntual sin modificar el responsable ni el suplente del apartamento
- [x] **ASEO-05**: Admin crea aseos manuales tipo `repaso` y `emergencia`
- [x] **ASEO-06**: Admin reprograma la fecha de un aseo
- [x] **ASEO-07**: El sistema impide crear un segundo aseo activo para el mismo apartamento y fecha, con mensaje de error explícito
- [x] **ASEO-08**: Admin cierra manualmente un aseo que la realidad ya resolvió
- [x] **ASEO-09**: Admin cancela un aseo

### PWA del aseador

- [ ] **PWA-01**: Aseador ve la lista de sus aseos asignados con el detalle de cada uno
- [ ] **PWA-02**: La PWA es instalable en la pantalla de inicio en Android e iOS
- [ ] **PWA-03**: Si el aseador no tiene push activo, la PWA muestra un banner persistente con ayuda diferenciada para "nunca lo pedí" y "ya lo negué"
- [ ] **PWA-04**: Aseador pulsa "Empecé" y queda registrada la fecha/hora, sin que eso bloquee ninguna otra acción
- [ ] **PWA-05**: Aseador pulsa "no puedo" y el aseo vuelve a Pendiente sin asignar, notificando al admin
- [ ] **PWA-06**: Aseador pulsa "Terminé" y queda registrada la fecha/hora, notificando al admin
- [ ] **PWA-07**: Al terminar, el sistema pide la evidencia cuarto por cuarto. **CORREGIDO 2026-09-12** (`06-CONTEXT.md` D-06): "Terminé" **ya no se bloquea**. El aseador puede saltar un cuarto eligiendo un motivo de una lista cerrada, y el aseo queda marcado **sin evidencia completa**, visible para el admin. Razón: un bloqueo deja al aseador atrapado en campo y termina en una llamada telefónica, que es justo lo que el producto elimina
- [ ] ~~**PWA-08**: Aseador completa el aseo sin conexión y las acciones se encolan localmente~~ → **DIFERIDO a v2 el 2026-09-12** (`06-CONTEXT.md` D-08). Riesgo aceptado en `.planning/BACKLOG.md`
- [ ] ~~**PWA-09**: Las acciones encoladas suben al recuperar conexión sin duplicarse ni perderse~~ → **DIFERIDO a v2 el 2026-09-12** (D-08)
- [ ] ~~**PWA-10**: Aseador ve cuántas acciones tiene pendientes por subir~~ → **DIFERIDO a v2 el 2026-09-12** (D-08). `06-UI-SPEC.md` §11.4 lo convierte en prohibición activa: **ninguna pantalla puede mostrar contador de pendientes**, porque sugerir que se guardó en el dispositivo cuando no es cierto es peor que no tener offline

### Checklist y evidencia

- [ ] **CHECK-01**: El checklist se arma con los cuartos que tiene ese apartamento y no muestra cuartos que no existen
- [ ] **CHECK-02**: Aseador marca las tareas de cada cuarto al final del aseo
- [ ] **CHECK-03**: Aseador adjunta evidencia fotográfica de cada cuarto. **CORREGIDO 2026-09-12** (`06-CONTEXT.md` D-05): **no** en el mismo paso del checklist, sino al final, en un asistente guiado cuarto por cuarto. Se planteó el riesgo (fotografiar desde el pasillo cuando ya salió) y se aceptó a cambio de un flujo más simple
- [ ] **CHECK-04**: Las fotos se comprimen en el dispositivo a ~200 KB con lado largo de 1280 px y se les elimina el EXIF antes de subirse

### Reportes de campo

- [ ] **REPORT-01**: Aseador reporta un daño con foto y descripción libre, y el admin recibe notificación inmediata
- [ ] **REPORT-02**: Aseador reporta un gasto con foto del recibo
- [ ] **REPORT-03**: Aseador reporta faltantes y el admin recibe notificación. **CORREGIDO 2026-09-12** (`06-CONTEXT.md` D-07): **no** desde la lista base del apartamento, sino con un campo libre clasificado como faltante, igual que el daño y el gasto. Un solo formulario con tres categorías en vez de tres formularios distintos
- [x] **REPORT-04**: Los daños reportados quedan en el historial del apartamento

### Notificaciones

- [ ] **NOTIF-01**: Aseador recibe push cuando se le asigna un aseo, con los detalles y el código de acceso
- [ ] **NOTIF-02**: Admin recibe push por daño reportado, faltante reportado, "no puedo" y aseo completado
- [ ] **NOTIF-03**: El sistema reintenta los envíos fallidos y deja registro de cada envío
- [ ] **NOTIF-04**: El sistema elimina las suscripciones push que el navegador reporta como expiradas o revocadas

### Dashboard del admin

- [x] **DASH-01**: Admin ve los servicios organizados por día (hoy, mañana y siguientes)
- [x] **DASH-02**: Admin ve una bandeja persistente con los aseos sin confirmar
- [x] **DASH-03**: Admin ve la carga diaria por aseador para decidir si activa un suplente
- [x] **DASH-04**: Admin ve un panel de alertas con la misma jerarquía visual para: urgentes, extensión mal creada, "no puedo", daños, faltantes y calendario caído
- [x] **DASH-05**: Admin ve alertados los aseos cuya hora límite venció sin terminarse
- [x] **DASH-06**: Admin ve el historial cronológico de un apartamento
- [x] **DASH-07**: Los aseos de apartamentos con `gestion_vivaguest = false` se muestran con su fecha y a cargo de quién, sin estado ni acciones

### Financiero

- [ ] **FIN-01**: Las tarifas del aseo se congelan al momento de generarse y no cambian si después se edita la tarifa del apartamento
- [x] **FIN-02**: Admin ve la rentabilidad de cada aseo (fee al huésped menos pago al aseador)
- [x] **FIN-03**: El sistema calcula el pago del mes por aseador al cierre del último día laboral, excluyendo fines de semana
- [x] **FIN-04**: El cálculo mensual queda persistido como snapshot y sigue consultable aunque los aseos que lo sustentan se borren por retención
- [x] **FIN-05**: Los aseos informativos quedan fuera de todo cálculo financiero y de toda métrica

### Retención de datos

- [ ] **RET-01**: El sistema borra automáticamente aseos, checklists, gastos y daños con más de 6 meses
- [ ] **RET-02**: El sistema avisa al admin 15 días antes de cada borrado
- [ ] **RET-03**: Admin marca un aseo con retención legal y ese aseo no se borra
- [ ] **RET-04**: El borrado elimina los archivos en Storage además de las filas, sin dejar huérfanos facturando
- [ ] **RET-05**: Los agregados de desempeño (timestamps de inicio y fin, eventos "no puedo") sobreviven al borrado del detalle
- [ ] **RET-06**: El sistema borra las fotos de evidencia a los 30 días, conservando el registro del aseo y su checklist
- [ ] **RET-07**: El admin ve el consumo de Storage y recibe alerta al superar el 70% del cupo

## v2 Requirements

### Notificaciones

- **NOTIF-V2-01**: Admin ve qué aseadores tienen push activo y qué envíos rebotaron (semáforo de entregabilidad)

### Financiero

- **FIN-V2-01**: Admin exporta o imprime el cálculo mensual de pagos

### Desempeño

- **PERF-V2-01**: Admin ve un scorecard de desempeño por aseador construido sobre los agregados conservados

### Propietarios

- **OWNER-V2-01**: El propietario accede a un dashboard con el estado de sus unidades

## Out of Scope

| Feature | Reason |
|---------|--------|
| API oficial de Airbnb | No existe API pública; iCal es la única vía |
| Integración con Booking.com | El MVP lee únicamente calendarios de Airbnb; Booking no expone código de reserva en su iCal |
| Google Calendar como fuente | Google es un suscriptor del mismo `.ics` de Airbnb, no una fuente distinta. Añade latencia de polling y regenera los `UID` que necesitamos para detectar reservas movidas |
| API oficial de Airbnb | Cerrada, solo para partners aprobados. La exportación iCal es la única vía disponible |
| Checklist configurable por apartamento | Biblioteca fija y global en el MVP; los cuartos sí son configurables |
| Estados de pago por gasto individual | El reembolso se gestiona fuera del sistema |
| Alerta de ventana de tiempo insuficiente | Descartada explícitamente; se gestiona con el huésped por fuera |
| Detección automática de huecos largos entre reservas | Se resuelve manual con un aseo de `repaso` |
| Trazabilidad de rechazos de aseadores | No aporta al MVP |
| Permisos diferenciados entre admins | Todos los admins tienen los mismos permisos |
| UI de invitación de admins | El superadmin los crea desde backend |
| Flujo de no-show del aseador | Distinto del botón "no puedo" y del cierre manual del admin |
| Soporte multi zona horaria | Todo fijo en UTC-5, sin DST |
| Limpiezas en ventanas nocturnas | No ocurren en la operación real |
| Proximidad geográfica y pool global de aseadores | Reemplazado por responsable fijo por apartamento |
| Notificación masiva / rondas / "primero que acepta" | El aseo llega asignado en firme |
| WhatsApp como canal | Push es el único canal; evita depender de API no oficial |
| Estado intermedio entre confirmación y "En curso" | Cuatro estados y ya |
| Sugerencia automática de suplente por sobrecarga | El admin decide viendo la carga diaria |
| Cuenta o PWA para apartamentos con `gestion_vivaguest = false` | Son solo dato informativo |
| Tercer modo de gestión con responsable externo sin cuenta | Se evaluó para Bogotá 2 y se resolvió marcándolo `false` |
| Tiers de suscripción SaaS e historial extendido premium | Fase posterior |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PLAT-01 | Fase 2 | Pending |
| PLAT-02 | Fase 2 | Pending |
| PLAT-03 | Fase 1 | Pending |
| PLAT-04 | Fase 2 | Pending |
| PLAT-05 | Fase 1 | Pending |
| PLAT-06 | Fase 1 | Pending |
| PLAT-07 | Fase 2 | Pending |
| APTO-01 | Fase 2 | Pending |
| APTO-02 | Fase 2 | Pending |
| APTO-03 | Fase 2 | Pending |
| APTO-04 | Fase 2 | Pending |
| APTO-05 | Fase 2 | Pending |
| APTO-06 | Fase 2 | Pending |
| APTO-07 | Fase 2 | Pending |
| APTO-08 | Fase 2 | Pending |
| APTO-09 | Fase 2 | Pending |
| APTO-10 | Fase 2 | Pending |
| APTO-11 | Fase 2 | Pending |
| APTO-12 | Fase 2 | Pending |
| ASEADOR-01 | Fase 2 | Pending |
| ASEADOR-02 | Fase 2 | Pending |
| ASEADOR-03 | Fase 2 | Pending |
| SYNC-01 | Fase 3 | Complete |
| SYNC-02 | Fase 3 | Complete |
| SYNC-03 | Fase 3 | Complete |
| SYNC-04 | Fase 3 | Complete |
| SYNC-05 | Fase 3 | Complete |
| SYNC-06 | Fase 3 | Complete |
| SYNC-07 | Fase 3 | Complete |
| SYNC-08 | Fase 3 | Complete |
| SYNC-09 | Fase 3 | Complete |
| SYNC-10 | Fase 3 | Complete |
| SYNC-11 | Fase 3 | Complete |
| ASEO-01 | Fase 4 | Complete |
| ASEO-02 | Fase 4 | Complete |
| ASEO-03 | Fase 4 | Complete |
| ASEO-04 | Fase 4 | Complete |
| ASEO-05 | Fase 4 | Complete |
| ASEO-06 | Fase 4 | Complete |
| ASEO-07 | Fase 1 | Complete |
| ASEO-08 | Fase 4 | Complete |
| ASEO-09 | Fase 4 | Complete |
| PWA-01 | Fase 6 | Pending |
| PWA-02 | Fase 5 | Pending |
| PWA-03 | Fase 5 | Pending |
| PWA-04 | Fase 6 | Pending |
| PWA-05 | Fase 6 | Pending |
| PWA-06 | Fase 6 | Pending |
| PWA-07 | Fase 6 | Pending (corregido 2026-09-12) |
| PWA-08 | v2 | Deferred |
| PWA-09 | v2 | Deferred |
| PWA-10 | v2 | Deferred |
| CHECK-01 | Fase 6 | Pending |
| CHECK-02 | Fase 6 | Pending |
| CHECK-03 | Fase 6 | Pending (corregido 2026-09-12) |
| CHECK-04 | Fase 6 | Pending |
| REPORT-01 | Fase 6 | Pending |
| REPORT-02 | Fase 6 | Pending |
| REPORT-03 | Fase 6 | Pending (corregido 2026-09-12) |
| REPORT-04 | Fase 4 | Complete |
| NOTIF-01 | Fase 5 | Pending |
| NOTIF-02 | Fase 5 | Pending |
| NOTIF-03 | Fase 5 | Pending |
| NOTIF-04 | Fase 5 | Pending |
| DASH-01 | Fase 4 | Complete |
| DASH-02 | Fase 4 | Complete |
| DASH-03 | Fase 4 | Complete |
| DASH-04 | Fase 4 | Complete |
| DASH-05 | Fase 4 | Complete |
| DASH-06 | Fase 4 | Complete |
| DASH-07 | Fase 4 | Complete |
| FIN-01 | Fase 1 | Pending |
| FIN-02 | Fase 7 | In Progress |
| FIN-03 | Fase 7 | In Progress |
| FIN-04 | Fase 7 | In Progress |
| FIN-05 | Fase 7 | In Progress |
| RET-01 | Fase 9 | Pending |
| RET-02 | Fase 9 | Pending |
| RET-03 | Fase 9 (movido de la 7 el 2026-09-13, issue #5) | Pending |
| RET-04 | Fase 9 | Pending |
| RET-05 | Fase 9 | Pending |
| RET-06 | Fase 9 | Pending |
| RET-07 | Fase 9 (movido de la 7 el 2026-09-13, issue #6) | Pending |

**Coverage:**

- v1 requirements: 83 total
- Mapped to phases: 83 ✓
- Unmapped: 0

**Por fase:**

| Fase | Requisitos |
|------|------------|
| 1. Fundación, schema y RLS | 5 |
| 2. Acceso y administración del catálogo | 19 |
| 3. Motor de sincronización iCal | 11 |
| 4. Dashboard operativo del admin | 16 |
| 5. Notificaciones push e instalación de la PWA | 6 |
| 6. PWA del aseador, offline-first | 15 |
| 7. Financiero | 6 |
| 8. Piloto en Bogotá 1 | 0 (fase de validación operativa) |
| 9. Borrado automático y retención | 5 |

---
*Requirements defined: 2026-08-31. Actualizado 2026-08-31: alcance a solo Airbnb vía exportación iCal, retención de fotos a 30 días, resecuenciado para equipo de dos.*
