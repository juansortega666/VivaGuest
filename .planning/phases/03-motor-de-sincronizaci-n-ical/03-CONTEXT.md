# Phase 3: Motor de sincronización iCal - Context

**Gathered:** 2026-09-02
**Status:** Ready for research
**Source:** Decisiones acumuladas + el feed real capturado hoy

<domain>
## Phase Boundary

El corazón del producto: lo que convierte un checkout publicado en el calendario en un aseo pendiente. Sin esta fase, VivaGuest es una hoja de cálculo con login.

**Dentro:** el job que corre cada 30 minutos, la ingesta y el diff por feed, la creación y cancelación de aseos, la detección de urgencia y de extensión mal creada, y las alertas de feed caído y de job caído.

**Fuera:** el dashboard que muestra los aseos (Fase 4), la confirmación del admin (Fase 4), la PWA del aseador (Fase 6). Esta fase escribe filas; no las pinta.

**Es la fase donde un error borra trabajo real** en vez de solo verse mal. Un aseo cancelado por equivocación a las 6am deja a una aseadora en la calle.
</domain>

<decisions>
## Implementation Decisions

### Arquitectura, ya fijada
- **`pg_cron` dispara y hace fan-out con `pg_net`, una invocación HTTP por feed.** Aísla feeds caídos por construcción: uno colgado no comparte proceso ni transacción con los otros. Además no depende del cron de Vercel, que en Hobby está capado a una corrida diaria.
- `next_sync_at` solo avanza +30 min cuando el fetch tuvo éxito. Si falla, reintenta en 5 minutos.
- El worker es un Route Handler con `runtime = 'nodejs'`, autenticado por secreto compartido, no por cookie.
- **La alerta de feed muerto se dispara por obsolescencia de `last_success_at`, no por captura de excepción.** Un sistema que solo alerta cuando su propio código corre es ciego a su propia caída.

### Reglas de dominio no negociables
- **El día del aseo es el `DTEND`, sin sumar ni restar.** Es exclusivo en el formato y coincide con el día en que el calendario libera el apartamento.
- **Nunca cancelar un aseo con `started_at`.** El aseador ya fue y hay que pagarle.
- **Nunca cancelar por un feed vacío, inválido o truncado.** Validar `BEGIN:VCALENDAR` y el `Content-Type` antes de diffear, y tratar "cero eventos donde antes había N" como intento fallido, no como cancelación masiva.
- **Los bloqueos del propietario no generan aseos.**
- Máximo un aseo activo por apartamento y fecha; ya lo impone un índice parcial de la Fase 1.
- Los apartamentos con `gestion_vivaguest = false` generan aseo informativo: sin estado, sin asignación, fuera de métricas.

### Privacidad, restricción nueva
El `DESCRIPTION` del feed real trae **los últimos 4 dígitos del teléfono del huésped**. Ningún documento de research lo contemplaba. **No se persiste, no se registra en logs, no se muestra.** Se descarta al normalizar.

### Alcance
Solo Airbnb. Google Calendar y Booking están fuera, decidido y documentado en PROJECT.md.

### Claude's Discretion
- La forma exacta del diff y cómo se representa la identidad de reserva.
- Cómo se estructura el worker y dónde vive la lógica pura.
- El diseño de la tabla de alertas y su consumo.
</decisions>

<canonical_refs>
## Canonical References

- `lib/domain/__fixtures__/ical/airbnb-real-anonimizado.ics` — **el feed real. Su README documenta qué prueba y qué no.**
- `lib/domain/ical-preview.ts` — el escáner de la Fase 2, que lee y cuenta sin escribir nada
- `.planning/research/ARCHITECTURE.md` §iCal Sync Pipeline — el diseño de `pg_cron` + `pg_net`
- `.planning/research/PITFALLS.md` — las trampas de iCal con su severidad
- `.planning/phases/02-*/02-14-SUMMARY.md` — la costura con la Fase 2 y por qué el corte de estado es por `proximoCheckout`, no por número de eventos
- `.planning/phases/01-*/deferred-items.md` — el join `calendar_feeds` → `property_secrets` para llegar a la URL
- `.planning/PROJECT.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`
</canonical_refs>

<specifics>
## Specific Ideas

Lo que el feed real ya resolvió, medido el 2026-09-02:

- Seis propiedades por evento, cero `X-`, cero `RRULE`, cero `VTIMEZONE`.
- `UID` con estructura `<prefijo-del-anuncio>-<sufijo-de-la-reserva>@airbnb.com`, prefijo constante en todo el feed.
- El código de reserva existe, dentro de la URL del `DESCRIPTION`, **partido por el plegado a 75 octetos**.
- El feed **incluye la reserva que termina hoy**.
- Casos reales dentro: un turnover del mismo día el 2026-10-10 y huecos de 13 y 31 días.

Lo que el feed real **no** resuelve y sigue abierto:

- **Cero bloqueos del propietario.** No se puede validar la distinción reserva/bloqueo contra este feed.
- **Si el `UID` sobrevive a un cambio de fecha.** Requiere capturar el mismo feed en dos momentos.
- **Si la reserva que termina hoy desaparece mañana.** Misma medición.
</specifics>

<deferred>
## Deferred Ideas

- Google Calendar y Booking como fuentes → fuera del MVP
- Detección automática de huecos largos → se resuelve con aseo manual de `repaso`
- Alerta de ventana de tiempo insuficiente → descartada explícitamente
</deferred>

---

*Phase: 03-motor-de-sincronizaci-n-ical*
*Context gathered: 2026-09-02*
