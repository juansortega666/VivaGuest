# VivaGuest

## What This Is

Plataforma que automatiza la asignación y ejecución de aseos en propiedades de renta corta (STR). Lee los calendarios de Airbnb/Booking vía iCal, genera el aseo al detectar el fin del bloqueo, pasa por confirmación humana del admin (número de huéspedes + instrucciones), lo asigna en firme al aseador responsable fijo del apartamento, y el aseador lo ejecuta desde una PWA con checklist por cuarto y evidencia fotográfica. Reemplaza la coordinación actual por WhatsApp y Excel sobre 39 unidades reales en 8 clusters de Colombia.

## Core Value

Que ningún aseo se pierda: todo checkout detectado en calendario termina en un aseo confirmado, asignado y ejecutado con evidencia, sin coordinación manual por WhatsApp.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Admin gestiona apartamentos (CRUD) con tarifas, calendario iCal, ubicación, código de acceso, hora límite, cuartos, faltantes base, responsable y suplente
- [ ] Admin gestiona aseadores (alta/baja, sin auto-registro), con invalidación inmediata de acceso al desactivar
- [ ] El sistema lee calendarios cada 30 min y genera aseos tipo `normal` al detectar fin de bloqueo, sin duplicados
- [ ] El sistema cancela aseos automáticamente cuando la reserva desaparece o cambia de fecha, y genera el aseo nuevo sin confirmar
- [ ] El sistema marca urgente el aseo cuando hay checkout y checkin el mismo día
- [ ] El sistema detecta extensiones mal creadas por código único de reserva y alerta para doble chequeo humano
- [ ] El sistema alerta al admin cuando un link de calendario deja de responder
- [ ] Admin confirma el aseo en un solo paso escribiendo número de huéspedes e instrucciones
- [ ] Al confirmar, el aseo se asigna en firme al `responsable_id` del apartamento
- [ ] Admin reasigna cualquier aseo puntual sin tocar responsable/suplente permanentes
- [ ] Admin crea aseos manuales tipo `repaso` y `emergencia`, y reprograma fecha/hora
- [ ] El sistema bloquea más de un aseo activo por apartamento por fecha
- [ ] Aseador ve en la PWA la lista de aseos asignados (no agenda) con detalle y código de acceso
- [ ] Aseador recibe push como único canal de notificación, con banner persistente y ayuda si no lo activó
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
- [ ] El sistema calcula rentabilidad por aseo (fee huésped − pago aseador)
- [ ] El sistema calcula el pago mensual a aseadores al cierre del último día laboral del mes, visible en pantalla
- [ ] Apartamentos con `gestion_vivaguest = false` generan aseo informativo sin estado, sin aseador y fuera de métricas
- [ ] El sistema retiene 6 meses de historial y borra automáticamente, notificando antes al admin

### Out of Scope

- Dashboard de propietarios — el propietario no es rol en el MVP
- API oficial de Airbnb/Booking — no existe API pública, iCal es la única vía
- Checklist configurable por apartamento — biblioteca fija y global en MVP; los cuartos sí son configurables
- Estados de pago por gasto individual — el reembolso se gestiona fuera del sistema
- Alerta de ventana de tiempo insuficiente — descartada explícitamente, se gestiona con el huésped por fuera
- Detección automática de huecos largos entre reservas — se resuelve manual con aseo de `repaso`
- Trazabilidad de rechazos de aseadores — no aporta al MVP
- Exportación (PDF/Excel) del cálculo mensual de pagos — solo visible en pantalla
- Permisos diferenciados entre admins — todos los admins tienen los mismos permisos
- Flujo de no-show del aseador — distinto del botón "no puedo", queda fuera
- Soporte multi zona horaria — todo fijo en UTC-5 (Bogotá)
- Limpiezas en ventanas nocturnas — no ocurren en la operación real
- Escalabilidad del flujo de reembolsos y seguimiento de desempeño de aseadores — backlog
- Tiers de suscripción SaaS e historial extendido premium — fase posterior
- Proximidad geográfica y pool global de aseadores — reemplazado por responsable fijo por apartamento
- Notificación masiva / rondas / "primero que acepta" — el aseo llega asignado en firme
- WhatsApp como canal (ni wa.me ni API oficial) — push es el único canal
- Estado intermedio entre confirmación del admin y "En curso" — 4 estados y ya
- Sugerencia automática de suplente por sobrecarga — el admin decide viendo la carga diaria
- Cuenta de usuario / PWA para apartamentos con `gestion_vivaguest = false` — solo dato informativo

## Context

**Operación real (39 unidades, 8 clusters):**

| Cluster | Unidades | Personal | `gestion_vivaguest` |
|---|---|---|---|
| Bogotá 1 | 23 aptos | 1 fija + 1 ocasional en picos | true |
| Bogotá 2 | 2 aptos | empresa externa contratada por VivaGuest | true* |
| Santa Marta 1 | 7 aptos | 3 personas | true |
| Santa Marta 2 | 1 apto | contratada por la propietaria | false |
| Santa Marta 3 | 1 apto | limpian los propietarios | false |
| Chinauta | 1 casa | limpian los propietarios | false |
| Cartagena | 2 aptos + 1 casa | 1 persona | true |
| Medellín | 1 apto | 1 persona | true |

*Bogotá 2 marcado `true` porque la empresa la contrata VivaGuest, no el propietario. Supuesto sin confirmar.

**Estado actual de la operación:** coordinación por WhatsApp y Excel. No hay métrica de éxito definida todavía, no es prioridad.

**Reglas de dominio no obvias:**
- El aseo se agenda por el fin del bloqueo en el calendario, no por el checkout real del huésped.
- Mínimo 1 noche de reserva → máximo 1 aseo activo por apartamento por fecha.
- Airbnb refresca su iCal cada ~3 horas: latencia conocida y aceptada.
- Cerradura inteligente en ~90% de los casos, llave física en el 10% restante.
- Cierre de mes = último día laboral del mes calendario.

**Abiertos de producto (no bloquean el arranque):** lista real y completa de tipos de cuarto con sus tareas del checklist; plazo de anticipación para la notificación de borrado de historial; enum de tipo de gestión externa; corrección del deck (dice "50+ propiedades", el número real es 39).

## Constraints

- **Tech stack**: Next.js 15 (App Router) + TypeScript + Tailwind + Supabase (Postgres, Auth, Storage, RLS), deploy en Vercel — un solo proyecto sirve dashboard admin y PWA del aseador; RLS resuelve el aislamiento entre roles y Storage la evidencia fotográfica
- **Tech stack**: PWA instalable con Web Push (VAPID) — push es el único canal de notificación al aseador; en iOS exige PWA instalada
- **Integración**: iCal de Airbnb/Booking como única fuente de calendario — no hay API oficial pública
- **Timezone**: UTC-5 (Bogotá) fijo en todo el sistema — sin soporte multi timezone
- **Seguridad**: códigos de acceso a las propiedades viven en la base; el acceso del aseador se invalida de inmediato al desactivarlo
- **Datos**: retención de 6 meses para aseos, checklists, fotos con metadatos, gastos y daños
- **Escala**: 39 unidades, ~8 aseadores, decenas de aseos por día — no es un problema de escala, es de correctitud operativa
- **Orden de trabajo**: schema + migraciones + RLS antes que UI

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Next.js + Supabase en vez de backend propio | Auth, Storage, RLS y Postgres en una sola pieza; menos infra que mantener para un equipo pequeño | — Pending |
| Asignación por responsable fijo por apartamento, sin pool ni proximidad | La operación real ya funciona con personas fijas por cluster; el pool añadía complejidad sin valor | — Pending |
| Confirmación humana obligatoria antes de asignar | El admin es quien sabe número de huéspedes e instrucciones; nada se auto-confirma | — Pending |
| El aseo se agenda por fin de bloqueo del calendario, no por checkout real | El iCal no expone el checkout real; el bloqueo es la única señal confiable | — Pending |
| Push como único canal, sin WhatsApp | Evita depender de API no oficial y mantiene la trazabilidad dentro del sistema | — Pending |
| Checklist global fijo, cuartos configurables por apartamento | Permite armar el checklist dinámicamente sin construir un editor de checklists en el MVP | — Pending |
| `contacto_externo` como texto libre | Supuesto sin confirmar; no hay operación sobre ese dato en el MVP | — Pending |
| Se eliminan `ubicación base` y `ventana laboral` del aseador | Solo existían para el cálculo de proximidad y disponibilidad contra un pool, que ya no existe | — Pending |
| Retención de 6 meses con borrado automático | Controla costo de Storage; el historial extendido queda como feature de tier superior | — Pending |

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
*Last updated: 2026-08-30 after initialization*
