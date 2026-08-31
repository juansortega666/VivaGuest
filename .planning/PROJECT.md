# VivaGuest

## What This Is

Plataforma que automatiza la asignación y ejecución de aseos en propiedades de renta corta (STR). Lee el calendario de cada apartamento desde la exportación iCal de Airbnb, genera el aseo al detectar el fin del bloqueo, pasa por confirmación humana del admin (número de huéspedes + instrucciones), lo asigna en firme al aseador responsable fijo del apartamento, y el aseador lo ejecuta desde una PWA con checklist por cuarto y evidencia fotográfica. Reemplaza la coordinación actual por WhatsApp y Excel sobre 39 unidades reales en 8 clusters de Colombia, de las cuales 34 se gestionan dentro del sistema y 5 son informativas.

## Core Value

Que ningún aseo se pierda: todo checkout detectado en calendario termina en un aseo confirmado, asignado y ejecutado con evidencia, sin coordinación manual por WhatsApp.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Admin gestiona apartamentos (CRUD) con tarifas, calendario iCal, ubicación, código de acceso, hora límite, cuartos, faltantes base, responsable y suplente
- [ ] Admin gestiona aseadores (alta/baja, sin auto-registro), con invalidación inmediata de acceso al desactivar
- [ ] El sistema lee calendarios cada 30 min y genera aseos tipo `normal` al detectar fin de bloqueo, sin duplicados
- [ ] El sistema distingue reservas reales de bloqueos del propietario y no genera aseos para los bloqueos
- [ ] El sistema cancela aseos automáticamente cuando la reserva desaparece o cambia de fecha, y genera el aseo nuevo sin confirmar
- [ ] El sistema nunca cancela automáticamente un aseo que ya tiene `started_at`
- [ ] El sistema marca urgente el aseo cuando hay checkout y checkin el mismo día
- [ ] El sistema detecta extensiones mal creadas y alerta para doble chequeo humano, por código de reserva y continuidad de UID
- [ ] El sistema alerta al admin cuando un link de calendario deja de responder y cuando el propio job de sincronización deja de correr
- [ ] Admin confirma el aseo en un solo paso escribiendo número de huéspedes e instrucciones
- [ ] Al confirmar, el aseo se asigna en firme al `responsable_id` del apartamento
- [ ] Admin reasigna cualquier aseo puntual sin tocar responsable/suplente permanentes
- [ ] Admin crea aseos manuales tipo `repaso` y `emergencia`, y reprograma fecha/hora
- [ ] Admin cierra manualmente un aseo que la realidad ya resolvió, sin depender del aseador
- [ ] El sistema bloquea más de un aseo activo por apartamento por fecha
- [ ] Aseador ve en la PWA la lista de aseos asignados (no agenda) con detalle y código de acceso
- [ ] Aseador recibe push como único canal de notificación, con banner persistente y ayuda si no lo activó
- [ ] Aseador opera sin señal: completa checklist, toma fotos y termina el aseo con las mutaciones encoladas localmente, y todo sube al recuperar conexión sin duplicarse
- [ ] Aseador marca "Empecé" y "Terminé" con registro de fecha/hora
- [ ] Aseador pulsa "no puedo": el aseo vuelve a Pendiente sin asignar y notifica al admin
- [ ] Aseador completa checklist por cuarto con evidencia fotográfica obligatoria antes de poder terminar
- [ ] Aseador reporta daños (foto + descripción) con notificación inmediata al admin
- [ ] Aseador reporta gastos con foto del recibo
- [ ] Aseador reporta faltantes desde lista base configurable + campo "Otros", con notificación al admin
- [ ] Dashboard admin muestra servicios organizados por día
- [ ] Dashboard admin muestra bandeja persistente "Sin confirmar"
- [ ] Dashboard admin muestra carga diaria por aseador para decidir activación manual de suplente
- [ ] Dashboard admin muestra alertas de misma jerarquía: urgentes, extensión mal creada, "no puedo", daños, faltantes, calendario caído, hora límite vencida
- [ ] Dashboard admin tiene buscador de apartamentos e historial cronológico por apartamento
- [ ] El sistema calcula rentabilidad por aseo con las tarifas congeladas al momento del aseo, no con las tarifas vigentes
- [ ] El sistema calcula el pago mensual a aseadores al cierre del último día laboral del mes y lo persiste como snapshot propio, visible en pantalla
- [ ] Apartamentos con `gestion_vivaguest = false` generan aseo informativo sin estado, sin aseador y fuera de métricas
- [ ] El sistema retiene 6 meses de historial y borra automáticamente, notificando al admin 15 días antes, con retención legal por aseo para casos en disputa
- [ ] El sistema borra las fotos de evidencia a los 30 días, conservando el registro del aseo y su checklist los 6 meses completos
- [ ] El admin ve cuánto Storage lleva consumido y recibe alerta al superar el 70% del cupo

### Out of Scope

- Dashboard de propietarios — el propietario no es rol en el MVP
- API oficial de Airbnb — no existe API pública, iCal es la única vía
- Integración con Booking.com — el MVP lee únicamente calendarios de Airbnb. Booking no expone código de reserva en su iCal, así que la detección de extensión mal creada nunca iba a funcionar igual ahí
- Checklist configurable por apartamento — biblioteca fija y global en MVP; los cuartos sí son configurables
- Estados de pago por gasto individual — el reembolso se gestiona fuera del sistema
- Alerta de ventana de tiempo insuficiente — descartada explícitamente, se gestiona con el huésped por fuera
- Detección automática de huecos largos entre reservas — se resuelve manual con aseo de `repaso`
- Trazabilidad de rechazos de aseadores — no aporta al MVP
- Exportación (PDF/Excel) del cálculo mensual de pagos — solo visible en pantalla. Se evaluó una vista imprimible como punto medio y se descartó para el MVP
- Semáforo de entregabilidad de push en el dashboard — riesgo aceptado conscientemente, ver Riesgos Aceptados
- Permisos diferenciados entre admins — todos los admins tienen los mismos permisos
- Flujo de no-show del aseador — distinto del botón "no puedo" y del cierre manual del admin, queda fuera
- Soporte multi zona horaria — todo fijo en UTC-5 (Bogotá)
- Limpiezas en ventanas nocturnas — no ocurren en la operación real
- Escalabilidad del flujo de reembolsos y seguimiento de desempeño de aseadores — backlog. Los datos crudos sí se conservan más allá de los 6 meses para poder construirlo después
- Tiers de suscripción SaaS e historial extendido premium — fase posterior
- Proximidad geográfica y pool global de aseadores — reemplazado por responsable fijo por apartamento
- Notificación masiva / rondas / "primero que acepta" — el aseo llega asignado en firme
- WhatsApp como canal (ni wa.me ni API oficial) — push es el único canal
- Estado intermedio entre confirmación del admin y "En curso" — 4 estados y ya
- Sugerencia automática de suplente por sobrecarga — el admin decide viendo la carga diaria
- Cuenta de usuario / PWA para apartamentos con `gestion_vivaguest = false` — solo dato informativo
- Tercer modo de gestión (responsable externo con cuenta parcial) — se evaluó para Bogotá 2 y se resolvió marcándolo `false`

## Context

**Operación real (39 unidades, 8 clusters, 34 gestionadas + 5 informativas):**

| Cluster | Unidades | Personal | `gestion_vivaguest` |
|---|---|---|---|
| Bogotá 1 | 23 aptos | 1 fija + 1 ocasional en picos | true |
| Bogotá 2 | 2 aptos | empresa externa contratada por VivaGuest | false |
| Santa Marta 1 | 7 aptos | 3 personas | true |
| Santa Marta 2 | 1 apto | contratada por la propietaria | false |
| Santa Marta 3 | 1 apto | limpian los propietarios | false |
| Chinauta | 1 casa | limpian los propietarios | false |
| Cartagena | 2 aptos + 1 casa | 1 persona | true |
| Medellín | 1 apto | 1 persona | true |

**Estado actual de la operación:** coordinación por WhatsApp y Excel. No hay métrica de éxito definida todavía, no es prioridad.

**Rollout:** arranca por Bogotá (Bogotá 1, 23 aptos, personal propio) y por todo lo que no dependa de terceros. Bogotá 2 no entra al flujo operativo porque es informativo.

**Reglas de dominio no obvias:**
- El aseo se agenda por el fin del bloqueo en el calendario (`DTEND`, que es exclusivo), no por el checkout real del huésped.
- Mínimo 1 noche de reserva → máximo 1 aseo activo por apartamento por fecha.
- Airbnb refresca su iCal cada ~3 horas (los channel managers reportan hasta 1 vez al día en el peor caso): latencia conocida y aceptada.
- Airbnb solo exporta fechas futuras. La reserva que termina hoy desaparece del feed, así que el diff no puede tratar "ya no está" como "cancelada".
- El `SUMMARY` de Airbnb distingue reserva (`Reserved`) de bloqueo del propietario (`Airbnb (Not available)`), y es el único discriminador disponible en ese proveedor.
- El feed de Airbnb trae solo 6 propiedades por evento (`DTSTAMP`, `DTSTART`, `DTEND`, `SUMMARY`, `UID`, `DESCRIPTION`), ninguna `X-`, ningún `RRULE`, ningún `VTIMEZONE`. No trae nombre del huésped (retirado en 2019), ni contacto, ni número de huéspedes.
- El código de reserva vive dentro de la URL del `DESCRIPTION`, no en el `SUMMARY`.
- Que el feed no traiga el número de huéspedes es la razón de existir del paso de confirmación del admin: es el único punto por donde ese dato puede entrar al sistema.
- Cerradura inteligente en ~90% de los casos, llave física en el 10% restante.
- Cierre de mes = último día laboral del mes calendario, excluyendo solo fines de semana (no festivos).

**Catálogo de checklist:** provisional, editable en base de datos sin migración. Cuartos: habitación, baño, cocina, sala/comedor, zona de lavado, balcón/terraza, exterior (jardín/piscina/BBQ para las 2 casas) y un bloque "general" siempre presente. Máximo 3 tareas por tipo. Se reemplaza cuando operaciones entregue la lista real.

**Abiertos de producto (no bloquean el arranque):** lista definitiva de tareas del checklist; enum de tipo de gestión externa; corrección del deck (dice "50+ propiedades", el número real es 39).

**Bloqueante técnico para la fase de sync:** hace falta capturar un `.ics` real de Airbnb de la cuenta de VivaGuest antes de fijar el parser. Las muestras públicas están desactualizadas y la más citada en GitHub es falsa (expone nombre, email y teléfono en el `SUMMARY`, formato que Airbnb retiró en 2019).

## Constraints

- **Tech stack**: Next.js 15 (App Router) + TypeScript + Tailwind + Supabase (Postgres, Auth, Storage, RLS), deploy en Vercel — un solo proyecto sirve dashboard admin y PWA del aseador
- **Tech stack**: PWA instalable con Web Push (VAPID) — push es el único canal de notificación al aseador; en iOS exige PWA instalada en pantalla de inicio y una denegación de permiso es irreversible sin reinstalar
- **Tech stack**: la PWA es offline-first con cola de mutaciones en IndexedDB e idempotencia por `client_event_id` — iOS Safari no tiene Background Sync, así que la cola drena en foreground con contador visible de pendientes
- **Integración**: Airbnb es la única fuente de calendario, vía su exportación iCal (RFC 5545). Es un `GET` a una URL secreta, sin API key ni OAuth: la API oficial de Airbnb es cerrada y de partners, y esta exportación es la única vía disponible
- **Integración**: un feed por apartamento. `calendar_feeds` queda modelada para varios proveedores por si algún día entra otro, pero el MVP no lo usa
- **Integración**: la URL de exportación es la credencial (es secreta e inadivinable), así que vive en `property_secrets` con el mismo tratamiento que el código de acceso — no hay API oficial pública y Booking queda fuera del MVP
- **Scheduler**: `pg_cron` dispara y hace fan-out con `pg_net`, una invocación por feed — aísla feeds caídos por construcción y evita depender del cron de Vercel, que en Hobby está capado a 1 corrida diaria
- **Timezone**: UTC-5 (Bogotá) fijo en todo el sistema, sin DST — `fecha_aseo` se modela como `date`, no `timestamptz`
- **Seguridad**: el código de acceso vive en tabla aparte con RPC y auditoría, no como columna — en Supabase admin y aseador comparten el rol Postgres `authenticated` y los grants por columna no discriminan usuarios
- **Seguridad**: la autorización nunca se apoya en claims del JWT — un token ya emitido sigue siendo válido hasta expirar, y la desactivación de un aseador debe surtir efecto de inmediato
- **Datos**: retención de 6 meses para aseos, checklists, gastos y daños, con aviso 15 días antes y retención legal por aseo. Las fotos de evidencia se borran a los 30 días para caber en el free tier de Storage
- **Datos**: las fotos se comprimen a JPEG en el cliente con objetivo de ~200 KB y lado largo de 1280 px, y se les elimina el EXIF conservando solo la corrección de orientación
- **Datos**: una foto por cuarto, no una ráfaga. El presupuesto de Storage se calcula sobre ~6 fotos por aseo
- **Datos**: montos en pesos colombianos enteros (`bigint`), sin subunidad
- **Infraestructura**: free tier de Vercel y Supabase durante todo el desarrollo. El cron de 30 min vive en `pg_cron`, así que el tope de 1 corrida diaria de Vercel Hobby no aplica. Vercel Hobby prohíbe uso comercial: el piloto en operación real obliga a migrar a plan pago
- **Equipo**: dos personas. El roadmap se ejecuta secuencial, sin aprovechar el grafo de paralelización
- **Escala**: 34 unidades gestionadas, ~8 aseadores, decenas de aseos por día — no es un problema de escala, es de correctitud operativa
- **Orden de trabajo**: schema + migraciones + RLS antes que UI

## Riesgos Aceptados

| Riesgo | Por qué se acepta | Qué lo detonaría |
|---|---|---|
| Push como único canal, sin semáforo de entregabilidad en el dashboard | Mantiene el alcance del MVP cerrado y evita construir observabilidad de notificaciones antes de tener operación real | Un aseo confirmado que nunca llega al aseador no lo detecta nadie hasta que el huésped entra a un apartamento sucio. Si pasa en el piloto de Bogotá, entra el semáforo |
| Sin exportación ni vista imprimible del cierre mensual | El cálculo es visible en pantalla y el snapshot mensual persiste más allá de la retención | El admin vuelve a Excel a mano en cada cierre de mes |
| Latencia de 2 a 4 horas del feed de Airbnb, con reportes de hasta 1 vez al día | Es el techo del canal y no se baja leyendo más seguido; el aseo se agenda para el día del checkout, no para dentro de una hora | Un checkout de último minuto se detecta tarde |
| Evidencia fotográfica solo de 30 días | Es la única forma de que el MVP quepa en el free tier de Storage; el registro del aseo sí dura 6 meses | Una disputa sobre daños de hace 2 meses se queda sin foto |
| Vercel Hobby en uso comercial durante el piloto | El piloto es corto y el costo de migrar es bajo | Suspensión de cuenta por violación de términos |
| Estabilidad del `UID` de Airbnb no verificada contra feeds propios | Se instrumenta desde el primer sync en vez de apostarle a un supuesto | Cancelaciones o duplicados silenciosos de aseos confirmados si el UID no es estable |

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Next.js + Supabase en vez de backend propio | Auth, Storage, RLS y Postgres en una sola pieza; menos infra que mantener para un equipo pequeño | — Pending |
| Asignación por responsable fijo por apartamento, sin pool ni proximidad | La operación real ya funciona con personas fijas por cluster; el pool añadía complejidad sin valor y la evidencia de mercado lo respalda (varianza de puja de 90 vs 180 USD por la misma propiedad en Turno) | — Pending |
| Confirmación humana obligatoria antes de asignar | El admin es quien sabe número de huéspedes e instrucciones; nada se auto-confirma | — Pending |
| El aseo se agenda por fin de bloqueo del calendario, no por checkout real | El iCal no expone el checkout real; el bloqueo es la única señal confiable | — Pending |
| Push como único canal, sin WhatsApp | Evita depender de API no oficial y mantiene la trazabilidad dentro del sistema | — Pending |
| Checklist global fijo, cuartos configurables por apartamento | Permite armar el checklist dinámicamente sin construir un editor de checklists en el MVP | — Pending |
| Airbnb como única fuente, leyendo su `.ics` directo | Google Calendar no es una fuente distinta: es otro suscriptor del mismo archivo que Airbnb publica. Pasar por él suma su propio retraso de polling y regenera los `UID`, que es justo lo que necesitamos para distinguir una reserva movida de una cancelada | — Pending |
| Guía visual y validación en vivo al conectar el calendario | El link de exportación está en un submenú de Airbnb que nadie encuentra a la primera, y es una URL opaca de la que no se puede saber a simple vista si quedó bien pegada | — Pending |
| Free tier durante todo el desarrollo, con retención de fotos a 30 días | Sin recortar la retención de fotos el free tier de Storage revienta en el primer mes de operación real | — Pending |
| El job de borrado se mueve después del piloto | No tiene nada que borrar hasta el mes 7, así que construirlo antes no se puede validar | — Pending |
| Solo Airbnb en el MVP, sin Booking | Booking no expone código de reserva ni distingue bloqueos de reservas, así que obligaba a una segunda ruta de parseo con heurística de menor confianza para una fracción del portafolio | — Pending |
| Bogotá 2 pasa a `gestion_vivaguest = false` | La empresa externa no va a operar la PWA; marcarlo `true` obligaba a inventar un tercer modo de asignación sin responsable ni destinatario de push | — Pending |
| `contacto_externo` como texto libre | No hay operación sobre ese dato en el MVP; las 5 unidades informativas solo muestran fecha y a cargo de quién | — Pending |
| Se eliminan `ubicación base` y `ventana laboral` del aseador | Solo existían para el cálculo de proximidad y disponibilidad contra un pool, que ya no existe | — Pending |
| PWA offline-first con cola de mutaciones desde el día uno | El aseador trabaja en edificios sin cobertura; sin cola, el trabajo de campo se pierde y se quema la confianza en la primera semana | — Pending |
| Cierre manual del aseo por el admin | Sin escape hatch, el invariante "ningún aseo se pierde" se invierte en "ningún aseo se puede cerrar" y el dashboard acumula ruido permanente | — Pending |
| Financiero como snapshot congelado en el aseo, no join vivo contra la tarifa | Cambiar una tarifa reescribiría el margen histórico y el pago de un mes ya cerrado | — Pending |
| `legal_hold` y `deleted_at` en el schema inicial | Agregarlos después obliga a migrar datos operativos; el job de borrado sí puede llegar al final | — Pending |
| El scheduler corre en `pg_cron` + `pg_net`, no en Vercel Cron | Aísla feeds caídos por construcción, da historial de corridas gratis y no exige plan Pro | — Pending |
| Retención de 6 meses con borrado automático, conservando agregados | Controla costo de Storage sin destruir la base del scorecard de desempeño de v2 | — Pending |
| Cierre de mes excluye solo fines de semana, no festivos | El cálculo es visible en pantalla, nadie tiene que estar disponible ese día; evita mantener tabla de festivos con ley de Emiliani | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-08-31 after research, decision gate y reducción de alcance a solo Airbnb*
