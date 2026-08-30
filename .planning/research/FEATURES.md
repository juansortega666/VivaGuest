# Feature Research

**Domain:** Coordinación y ejecución de aseos en renta corta (STR housekeeping operations)
**Researched:** 2026-08-30
**Confidence:** MEDIUM-HIGH (features de producto: alta; sentimiento real de operadores: baja, ver Sources)

**Productos benchmarkeados:** Turno (ex TurnoverBnB), Breezeway, Properly, Operto Teams (ex VRScheduler), ResortCleaning, Doinn, Sweeply, módulos de tareas de Hostaway y Guesty, y Hogaru (Colombia, adyacente: aseo doméstico B2B con app propia para aseadoras).

---

## Feature Landscape

### Table Stakes (Users Expect These)

Lo que todo producto de la categoría tiene. Si falta, la operación se rompe o el producto se siente incompleto. La columna **Estado spec** marca si el requisito locked de PROJECT.md lo cubre.

| Feature | Why Expected | Complexity | Estado spec | Notes |
|---------|--------------|------------|-------------|-------|
| Sync iCal multi-canal + generación automática de tarea | Base de toda la categoría: Turno, Breezeway, Doinn, ResortCleaning, Hostaway y Guesty generan tarea desde la reserva | MEDIUM | ✅ Cubierto | El feed iCal no distingue bloqueo manual de reserva real: todo evento se agenda. La decisión de PROJECT.md ("se agenda por fin de bloqueo, no por checkout real") es exactamente la mitigación correcta |
| Actualización de tarea ante cancelación / cambio de fechas | Breezeway cancela el workflow y alerta al asignado; Hostaway auto-tasks "change if the reservation changes"; Turno notifica alteraciones y cancelaciones | HIGH | ✅ Cubierto | El reto real no es cancelar, es reconciliar sin duplicar. Requiere clave estable de evento + diff por corrida |
| Detección de same-day turnover (checkout + checkin mismo día) | Breezeway trata el "turn" como tipo de reserva distinto con reglas propias | LOW | ✅ Cubierto (`urgente`) | Es el caso donde un aseo perdido se vuelve incidente con huésped |
| Asignado por defecto fijo por propiedad + suplente | Breezeway: "choose default field staff"; Turno muestra primary y backup cleaner por propiedad | LOW | ✅ Cubierto | Estándar de la categoría, no una rareza de VivaGuest. El pool es la excepción, no la norma |
| Reasignación puntual sin romper el default | Todo dispatcher lo tiene | LOW | ✅ Cubierto | |
| Tareas manuales fuera de calendario (repaso, emergencia) | Todos: recurring tasks en Hostaway, repeating workflows en Breezeway | LOW | ✅ Cubierto | |
| Lista de trabajos en móvil con detalle de propiedad y acceso | App de aseador de Breezeway, Turno Cleaners, Properly, Operto mobile dashboard | LOW | ✅ Cubierto | |
| Marcar inicio y fin con timestamp | Turno: "I'm cleaning" / "I'm done"; Operto: time tracking | LOW | ✅ Cubierto | Turno recibe crítica explícita: depende de que el aseador abra la app. Sin canal de recordatorio confiable, los timestamps se degradan |
| Checklist ejecutable en móvil | Turno, Properly, Breezeway, Operto, ResortCleaning | MEDIUM | ✅ Cubierto | |
| Evidencia fotográfica obligatoria antes de completar | Turno "Mandatory Checklist Completion"; Properly Photo Checklists exige foto antes de marcar completo | MEDIUM | ✅ Cubierto | Uso real reportado: defensa ante disputa con huésped ("aquí están las fotos"), no control de calidad estético |
| Aceptar / rechazar el trabajo desde el móvil | Turno accept/reject; Operto accept/decline; Guesty tareas sin asignar que un grupo acepta | LOW | ✅ Cubierto ("no puedo") | |
| Reporte de daños / incidencias desde el móvil | Breezeway "report any issues", Properly damage reporting, CiiRUS "evidence of issues" | LOW | ✅ Cubierto | |
| Reporte de faltantes / consumibles | Turno inventory (el aseador reporta niveles en la app), Operto, ResortCleaning, Doinn | MEDIUM | ✅ Cubierto | Turno permite hacerlo requisito para completar; VivaGuest lo deja opcional, decisión razonable |
| Dashboard de despacho por día con carga por persona | Operto Teams: calendario drag-and-drop con workload balancing por región | MEDIUM | ✅ Cubierto | |
| Cálculo de pago al personal | Turno auto-payments, Operto payroll reports, ResortCleaning payroll | MEDIUM | ⚠️ Parcial | Existe el cálculo; falta poder sacarlo del sistema (ver Out of Scope #8) |
| **Notificación multicanal al aseador (push + email y/o SMS)** | Breezeway: "text, email, or the mobile app". Turno: notification center, email y push, e invitación por SMS | MEDIUM | ❌ **No cubierto** | **Ningún competidor depende de un solo canal.** Ver Proposed Addition P1 |
| **Tolerancia a conectividad mala (cola de subida / offline)** | Breezeway tiene apps nativas con offline syncing; Properly declara photo checklists con soporte offline | HIGH | ❌ **No cubierto** | El spec hace la foto bloqueante para terminar sin definir qué pasa si la subida falla. Ver Proposed Addition P2 |
| **Cierre manual del aseo por parte del admin** | Presente en todo dispatcher serio; es el escape hatch cuando el móvil falla | LOW | ❌ **No cubierto** | Ver Proposed Addition P4 |

---

### Differentiators (Competitive Advantage)

Lo que VivaGuest hace distinto y defendible. Ninguno de estos es estándar en la categoría.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Confirmación humana obligatoria con número de huéspedes + instrucciones antes de asignar | Turno, Breezeway y Operto auto-asignan y auto-despachan. VivaGuest inserta un gate humano de un solo paso. En una operación donde el número de huéspedes define ropa de cama y amenities, auto-asignar sin ese dato manda al aseador con la información incompleta | LOW | El valor está en que sea **un solo paso**. Si crece a 3 campos y 2 pantallas se convierte en fricción diaria sobre decenas de aseos |
| Detección de extensión mal creada por código único de reserva + alerta de doble chequeo humano | Es el fallo de iCal peor manejado del mercado: cuando el huésped extiende y el canal emite una reserva nueva en vez de alargar la existente, aparece un checkout fantasma y se despacha un aseo con el huésped adentro. Breezeway resuelve el caso limpio ("cuando la reserva se acorta, el auto-scheduler mueve la fecha"), pero el caso de reserva re-creada es donde los competidores fallan en silencio | HIGH | La decisión de **no** auto-resolverlo y alertar para revisión humana es la correcta: el falso positivo cuesta un aseo perdido, el falso negativo cuesta un aseador entrando a un apartamento ocupado |
| Bandeja persistente "Sin confirmar" como invariante del sistema | Materializa el Core Value ("que ningún aseo se pierda"). Los competidores tienen listas de tareas; nadie tiene una bandeja que grita hasta que el humano actúe | LOW | Barato y de alto valor. Debe ser imposible de ocultar o marcar como leída sin confirmar |
| Alertas de misma jerarquía en un solo lugar (urgente, extensión, "no puedo", daño, faltante, calendario caído, hora límite vencida) | Anti-patrón deliberado contra los dashboards de Breezeway/Operto, donde la señal se reparte entre módulos | MEDIUM | La decisión de no jerarquizar es defendible con 7 tipos y decenas de aseos/día. Se rompe si el volumen se multiplica |
| Rentabilidad por aseo (fee huésped − pago aseador) calculada inline | Los competidores lo dejan en reportes agregados o en el PMS. La literatura del sector es explícita: "muchos operadores no saben que su margen de aseo es negativo hasta que lo calculan" | LOW | Diferenciador barato. El dato ya está en el apartamento y en el aseo |
| Modelo `gestion_vivaguest = false` (aseo informativo, sin estado, sin aseador, fuera de métricas) | Turno, Breezeway y Operto obligan a que una unidad esté dentro del sistema o no exista. VivaGuest modela el portafolio mixto real: 3 de 8 clusters los limpia el propietario o un tercero contratado por él | LOW | Diferenciador genuino para el mercado LatAm de co-hosting, donde el portafolio mixto es la norma, no la excepción |
| PWA sin instalación desde tienda para el aseador | Turno, Breezeway y Properly exigen app nativa. Para aseadoras domésticas en Android de gama baja con almacenamiento y datos limitados, evitar la tienda baja la barrera de adopción. Hogaru (Colombia, ~800 profesionales) resolvió esto entregando smartphone con app preinstalada, un costo que VivaGuest no puede pagar | MEDIUM | **Doble filo:** la PWA elimina la fricción de instalación pero introduce la fricción de "agregar a inicio", que en iOS es requisito duro para recibir push |
| Retención de 6 meses con borrado automático y aviso previo | Control de costo de Storage explícito desde el diseño; ningún competidor low-end lo expone como decisión de producto | LOW | Conflicto con el registro mensual de pagos, ver Dependency Notes |

---

### Anti-Features (Commonly Requested, Often Problematic)

Lo que la categoría construye y VivaGuest hace bien en no construir.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Marketplace / pool con puja (modelo Turno) | "Encuentra aseador cuando el tuyo falla" | Es la solución a un problema que VivaGuest no tiene. Costos reales reportados: varianza de puja absurda (90 y 180 USD por la misma propiedad), no se puede navegar aseadores (el aseador debe aplicar al trabajo), comisión de 8% tarjeta / 5% ACH vs 3.9% / 1.5% con aseador propio, y disputas de pago documentadas en BBB entre plataforma, host y aseador | Responsable fijo + suplente por apartamento. **Ya decidido, correctamente** |
| Ronda de notificación masiva / "primero que acepta" | "Reasigna solo cuando alguien rechaza" | Con 8 aseadores en 8 clusters geográficamente disjuntos, no hay a quién rotarle. Introduce estados intermedios (ofrecido/expirado) que multiplican el modelo | El aseo vuelve a Pendiente y el admin decide. **Ya decidido** |
| Proximidad geográfica / ruteo | "Optimiza desplazamientos" | Requiere ubicación base y ventana laboral del aseador, datos que el spec ya eliminó. Con 1 persona fija en Bogotá para 23 aptos, la ruta la conoce ella mejor que el algoritmo | Ninguna. **Ya decidido** |
| GPS / geofence para fichar entrada y salida | "Verifica que sí fue" | Fricción y desconfianza con la fuerza laboral, consumo de batería, permisos de ubicación en background que iOS PWA no soporta, y falsos negativos en sótanos y edificios. La evidencia fotográfica con timestamp ya prueba presencia | Foto con metadatos + botones Empecé/Terminé. **Ya excluido implícitamente** |
| Editor de checklists por apartamento | Operto permite checklist por task, region, property o unit; Turno y Properly también | Construir el editor, versionarlo, y decidir qué pasa con aseos en curso cuando alguien edita la plantilla, es un módulo entero. Con 39 unidades el admin termina copiando la misma lista 39 veces | Biblioteca global + cuartos configurables por apartamento. **Ya decidido**. Hedge barato: que el catálogo de tipos de cuarto incluya pseudo-cuartos de exterior (terraza, piscina, jardín, BBQ) para cubrir las 2 casas del portafolio sin construir el editor |
| Chat in-app host ↔ aseador | Turno lo tiene y es lo que la gente pide primero | Reconstruye WhatsApp peor. La crítica documentada al propio Turno: la app "no guarda mucho historial de chat con los aseadores". El chat se vuelve el canal informal y la trazabilidad estructurada muere ahí | Reportes estructurados (daño, gasto, faltante) + instrucciones en la confirmación. La conversación libre sigue en WhatsApp, fuera del sistema |
| Mensajería al huésped | Breezeway la vende como módulo core | Fuera del dominio. Arrastra plantillas, horarios, canales y cumplimiento | Fuera de scope, correcto |
| Portal de propietarios completo | Todos lo piden en algún momento | Incluso Breezeway recibe la crítica de que "el owner reporting es flojo". Es un rol nuevo, con RLS nueva, permisos nuevos y expectativa de SLA | **Ya excluido**. Ver evaluación en Out of Scope Assessment #1 |
| Estado de pago por gasto individual | "Quiero saber qué reembolsé" | Convierte el sistema en contabilidad de cuentas por pagar | Reembolso fuera del sistema. **Ya decidido** |
| Estado intermedio "visto / aceptado" entre confirmado y en curso | "Quiero saber si lo vio" | Un quinto estado multiplica transiciones y consultas para responder una pregunta que se responde con un timestamp | **Ya decidido**. Pero la pregunta sigue siendo válida: resolverla con un campo `visto_at`, no con un estado. Ver Proposed Addition P1 |

---

## Feature Dependencies

```
[Ingesta iCal cada 30 min]
    └──requires──> [CRUD apartamento con link iCal + clave estable de evento]
    └──enables───> [Generación de aseo `normal` sin duplicados]
                       └──requires──> [Detección de extensión mal creada por código de reserva]
                       └──enables───> [Bandeja "Sin confirmar"]
                                          └──requires──> [Confirmación humana: huéspedes + instrucciones]
                                                             └──requires──> [`responsable_id` en apartamento]
                                                             └──enables───> [Asignación en firme]
                                                                                └──requires──> [NOTIFICACIÓN AL ASEADOR]
                                                                                                   └──requires──> [PWA instalada + suscripción push activa]

[PWA aseador: lista de aseos]
    └──requires──> [Asignación en firme]
    └──enables───> [Empecé / Terminé con timestamp]
    └──enables───> [Checklist por cuarto]
                       └──requires──> [Cuartos configurables por apartamento + biblioteca global de tareas]
                       └──requires──> [Evidencia fotográfica obligatoria]
                                          └──requires──> [Supabase Storage + RLS + SUBIDA CONFIABLE]
                                          └──blocks────> [Terminé]

[Rentabilidad por aseo]
    └──requires──> [Tarifas en apartamento + tarifa de pago del aseador + aseo completado]
    └──enables───> [Cálculo mensual de pago al cierre]

[Retención 6 meses con borrado automático]
    └──conflicts──> [Cálculo mensual de pago sin exportación]
    └──conflicts──> [Evidencia fotográfica como defensa ante disputa]
    └──conflicts──> [Seguimiento de desempeño de aseadores (backlog)]

[gestion_vivaguest = false]
    └──excludes──> [Asignación, PWA, estados, métricas, notificaciones]
```

### Dependency Notes

- **Asignación en firme requiere notificación entregada:** es la dependencia crítica de todo el producto. La cadena entera (iCal → generación → confirmación → asignación) produce cero valor si el aseador no se entera. Con push como único canal, la cadena termina en el eslabón más frágil del stack. Ver Proposed Addition P1.
- **Evidencia fotográfica obligatoria bloquea "Terminé":** el spec lo define como gate duro, pero no define el comportamiento ante fallo de subida. Sin cola de reintento, un fallo de red convierte un aseo ejecutado en un aseo permanentemente incompleto. Ver Proposed Addition P2.
- **Push en iOS requiere PWA instalada en pantalla de inicio:** no es opcional ni degradable. Safari exige Share → Add to Home Screen; una pestaña abierta no cuenta. No hay prompt automático de instalación en iOS y hay reportes de pérdida de suscripción tras inactividad prolongada. El requisito del spec ("banner persistente y ayuda si no lo activó") ataca el lado del aseador; falta el lado del admin, que hoy no tiene forma de saber quién no tiene push activo.
- **Retención de 6 meses vs cálculo mensual de pago:** hoy el cálculo solo vive en pantalla y los datos que lo sustentan se borran a los 6 meses. Sin exportación, no queda registro auditable del pago de un mes cerrado. Es el conflicto más concreto entre dos decisiones locked.
- **Retención de 6 meses vs valor probatorio de la foto:** el uso real de la evidencia fotográfica en la categoría es defensa ante disputa. 6 meses cubre la ventana práctica de disputa de OTA; el conflicto es aceptable, pero debe ser una decisión consciente, no un efecto colateral.
- **Retención de 6 meses vs desempeño de aseadores (backlog):** el spec difiere el seguimiento de desempeño, pero el borrado automático hace que ese backlog no sea recuperable después. Los timestamps de Empecé/Terminé y los eventos "no puedo" ya se están capturando; si se quiere conservar la opción, hay que decidir si el borrado alcanza también a los agregados o solo al detalle con fotos.
- **Cuartos configurables + biblioteca global:** habilitan el checklist dinámico sin editor. La dependencia es que el catálogo de tipos de cuarto sea completo antes de arrancar. Está listado como abierto de producto y es un bloqueador real de la fase de checklist.

---

## MVP Definition

### Launch With (v1)

Todo el bloque Active de PROJECT.md, agrupado por dependencia. Sin cambios de alcance.

- [ ] **Base de datos**: schema, migraciones, RLS, CRUD de apartamentos y aseadores — todo depende de esto
- [ ] **Motor de calendario**: lectura cada 30 min, generación sin duplicados, cancelación y regeneración, marca de urgente, detección de extensión mal creada, alerta de link caído — es el Core Value
- [ ] **Confirmación y asignación**: bandeja "Sin confirmar", confirmación en un paso, asignación al responsable, reasignación puntual, bloqueo de más de un aseo activo por fecha
- [ ] **PWA aseador**: lista, detalle con código de acceso, Empecé/Terminé, "no puedo", checklist por cuarto con foto obligatoria, reportes de daño / gasto / faltante
- [ ] **Notificación push**: suscripción, banner persistente, ayuda de activación
- [ ] **Dashboard admin**: vista por día, carga diaria por aseador, alertas planas, buscador e historial por apartamento
- [ ] **Financiero**: rentabilidad por aseo, cálculo mensual al cierre
- [ ] **Aseos manuales**: repaso y emergencia, reprogramación
- [ ] **`gestion_vivaguest = false`**: aseo informativo fuera de métricas
- [ ] **Retención**: 6 meses con borrado automático y aviso previo

### Add After Validation (v1.x)

- [ ] **P1 — Visibilidad de entregabilidad de push (propuesta)** — al primer aseo que un aseador no vea a tiempo
- [ ] **P2 — Cola de reintento de subida de fotos (propuesta)** — al primer reporte de "no me deja terminar"
- [ ] **P3 — Compresión de imagen en cliente (propuesta)** — antes del primer mes completo de operación, por costo de Storage y datos móviles
- [ ] **P4 — Cierre manual del aseo por el admin (propuesta)** — al primer aseo ejecutado que queda trabado en el sistema
- [ ] **P5 — Vista imprimible del cálculo mensual (propuesta)** — al primer cierre de mes real
- [ ] **P6 — Edición de huéspedes/instrucciones post-confirmación (propuesta)** — a la primera alteración de reserva después de confirmar
- [ ] Pseudo-cuartos de exterior en el catálogo (terraza, piscina, jardín) — al onboarding de las 2 casas
- [ ] Nota libre del aseador al terminar — cuando aparezca el primer caso que no cabe en daño/gasto/faltante

### Future Consideration (v2+)

- [ ] Canal secundario formal (email o WhatsApp Business API vía BSP) — solo si P1 demuestra que el push no basta
- [ ] Seguimiento de desempeño de aseadores — requiere decidir antes qué sobrevive al borrado de 6 meses
- [ ] Dashboard de propietarios — solo si entran propietarios que hoy no son clientes
- [ ] Exportación real (Excel/CSV/PDF generado) — si la vista imprimible no basta
- [ ] Editor de checklists por apartamento — solo si el portafolio se diversifica más allá de apto/casa
- [ ] Permisos diferenciados entre admins — solo al crecer el equipo administrativo
- [ ] Tiers SaaS e historial extendido — post-PMF

---

## Proposed Additions

**Todas son propuestas, no supuestos.** Ninguna está en el spec locked. Cada una indica el fallo operativo concreto que previene y si respeta o cuestiona una decisión ya tomada.

### P1 — Visibilidad de entregabilidad de push del lado del admin

**Fallo que previene:** un aseo confirmado y asignado que el aseador nunca ve, sin que nadie lo note hasta que el huésped entra a un apartamento sucio. Es el fallo que invierte el Core Value: el aseo no se pierde en el calendario, se pierde en el último metro.

**Por qué es una brecha real:** ningún producto de la categoría depende de un solo canal. Breezeway notifica por "text, email, or the mobile app". Turno usa notification center, email y push, y además invita al aseador por SMS. VivaGuest depende de un canal que en iOS exige que el usuario ejecute manualmente Share → Add to Home Screen (sin prompt automático posible), y que reporta pérdida de suscripción tras inactividad prolongada. La fuerza laboral son aseadoras domésticas en dispositivos mixtos; la tasa de completar la instalación no es controlable por el producto.

**Propuesta mínima, dentro de la decisión locked (no añade canal, no toca WhatsApp):**
1. Estado de suscripción push por aseador visible en el admin, con alerta cuando un aseador activo no tiene suscripción válida.
2. Registro del resultado del envío del push service (rechazo 404/410 = suscripción muerta) y alerta al admin, no solo log silencioso.
3. Campo `visto_at` en el aseo (no un quinto estado, respetando la decisión de 4 estados) + alerta "asignado y no visto en N minutos" en la bandeja de alertas existente.

**Complexity:** LOW-MEDIUM. Los tres puntos son datos que el flujo ya produce; falta exponerlos.
**Dependencies:** requiere el flujo de suscripción push y la bandeja de alertas.
**Decisión que cuestiona:** ninguna. Es compatible con "push es el único canal" y con "4 estados y ya".

**Sobre WhatsApp específicamente:** excluir WhatsApp como canal es defendible (ver Out of Scope Assessment #17). Lo que no es defendible es que push sea simultáneamente el único canal *y* que nadie sepa cuándo falló. P1 resuelve lo segundo sin tocar lo primero. Si tras 4-6 semanas P1 muestra tasa de no-entrega material, ahí sí la conversación de canal secundario se abre con datos.

---

### P2 — Cola de reintento y estado "pendiente de subida" para la evidencia fotográfica

**Fallo que previene:** el aseador termina físicamente el aseo, la subida de fotos falla por red, y el sistema no le permite pulsar "Terminé". El aseo queda en curso indefinidamente, el admin ve una alerta falsa, y el aseador aprende que la app no sirve. Es la vía más rápida a que la operación vuelva a WhatsApp.

**Por qué es una brecha real:** Breezeway envía apps nativas con offline syncing y Properly declara soporte offline en sus photo checklists, precisamente porque el trabajo de campo ocurre en sótanos, parqueaderos y edificios con señal mala. El spec hace la foto un gate duro (`obligatoria antes de poder terminar`) sin definir la ruta de fallo.

**Propuesta mínima:** persistencia local de la foto (IndexedDB) + reintento con backoff + estado visible "pendiente de subida" en la tarjeta del aseo + permitir "Terminé" con fotos encoladas, marcando el aseo como completo-con-evidencia-pendiente hasta que la cola drene.

**Complexity:** MEDIUM-HIGH. Es la propuesta más cara del set.
**Dependencies:** service worker de la PWA, Supabase Storage.
**Decisión que cuestiona:** ninguna. Preserva "foto obligatoria" como regla de negocio y solo desacopla la captura de la transferencia.

---

### P3 — Compresión y límite de tamaño de imagen en cliente

**Fallo que previene:** dos problemas simultáneos. Uno, el aseador quema su plan prepago de datos subiendo fotos de 8 MB y deja de subirlas. Dos, el costo de Storage crece más rápido de lo que la retención de 6 meses puede contener (decenas de aseos/día × varios cuartos × varias fotos).

**Por qué es una brecha real:** no lo documenta el marketing de los competidores porque es implementación, pero es la razón por la que todos usan apps nativas con pipeline de imagen. Con evidencia fotográfica obligatoria por cuarto, el volumen no es marginal.

**Propuesta mínima:** redimensionar a lado mayor ~1600px y comprimir a WebP/JPEG con `canvas` antes de subir.

**Complexity:** LOW. Es la mejor relación valor/costo del set.
**Dependencies:** ninguna más allá del flujo de captura.
**Decisión que cuestiona:** ninguna.

---

### P4 — Cierre y avance manual del aseo por parte del admin

**Fallo que previene:** el aseo se ejecutó pero quedó trabado (celular sin batería, aseador que nunca instaló la PWA, la empresa externa de Bogotá 2 que no usa el sistema). Sin override, el invariante "que ningún aseo se pierda" se convierte en "ningún aseo se puede cerrar", y el dashboard se llena de ruido permanente que entrena al admin a ignorar las alertas.

**Por qué es una brecha real:** todo dispatcher de campo tiene el escape hatch del supervisor. Es lo que hace que el resto del sistema sea confiable.

**Propuesta mínima:** el admin puede marcar un aseo como completado registrando quién lo cerró y por qué, sin exigir checklist ni fotos, y quedando marcado como cierre manual para no contaminar la evidencia.

**Complexity:** LOW.
**Dependencies:** máquina de estados del aseo, historial por apartamento.
**Decisión que cuestiona:** roza el Out of Scope "flujo de no-show del aseador". No es lo mismo: no-show es detectar y gestionar la ausencia; esto es cerrar un registro que la realidad ya cerró. Si se considera que colisiona, es la decisión del usuario, pero el caso de Bogotá 2 (empresa externa contratada por VivaGuest, marcada `gestion_vivaguest = true`) lo vuelve casi seguro desde el día uno.

---

### P5 — Vista imprimible del cálculo mensual de pagos

**Fallo que previene:** llega el cierre de mes, el admin tiene el cálculo en pantalla y ~8 personas a las que hay que pagar y a quienes hay que darles un desglose. Sin salida, alguien vuelve a Excel a mano, que es exactamente el proceso que el producto existe para eliminar. Y a los 6 meses el respaldo del pago desaparece por el borrado automático.

**Por qué es una brecha real:** Turno, Operto y ResortCleaning tratan el payroll como salida, no como pantalla. Es la única función del producto cuyo output final es una transacción con un tercero.

**Propuesta mínima, deliberadamente por debajo de la exclusión locked:** hoja imprimible con `@media print` (el navegador produce el PDF, sin librería ni pipeline de exportación) y/o copiar al portapapeles en TSV, que se pega directo en Excel. Cero dependencias nuevas.

**Complexity:** LOW.
**Dependencies:** cálculo mensual ya existente.
**Decisión que cuestiona:** el Out of Scope dice "Exportación (PDF/Excel) del cálculo mensual — solo visible en pantalla". La propuesta no construye exportación; hace la pantalla imprimible y copiable. Es un punto medio explícito para que el usuario acepte o rechace.

---

### P6 — Edición de huéspedes e instrucciones después de confirmar

**Fallo que previene:** el admin confirma con 2 huéspedes, Airbnb altera la reserva a 4, y el aseador llega con la ropa de cama equivocada. Hoy la única salida sería cancelar y regenerar, lo cual pierde la asignación.

**Por qué es una brecha real:** el spec cubre reasignar y reprogramar, pero no editar el payload que el aseador realmente consume. Las alteraciones de reserva son cotidianas en STR.

**Propuesta mínima:** editar número de huéspedes e instrucciones en un aseo ya confirmado, con notificación push al aseador asignado.

**Complexity:** LOW.
**Dependencies:** confirmación, notificación.
**Decisión que cuestiona:** ninguna. Es probable que ya esté implícito en el CRUD, pero no está escrito y conviene explicitarlo.

---

## Out of Scope Assessment

Cada exclusión de PROJECT.md evaluada. **DEFENDIBLE** = corte correcto para MVP. **RIESGO** = puede romper operación real.

| # | Exclusión | Veredicto | Razonamiento |
|---|-----------|-----------|--------------|
| 1 | Dashboard de propietarios | **DEFENDIBLE** | El propietario no es cliente en este MVP; los clusters que él controla son `gestion_vivaguest = false`. Incluso Breezeway, líder de la categoría, recibe la crítica de que su owner reporting es flojo. No hay regresión: hoy tampoco hay portal |
| 2 | API oficial Airbnb/Booking | **NO ES UN CORTE, ES UN HECHO** | Airbnb no tiene API pública para hosts individuales; iCal es la vía. Confirmado: Airbnb además ya removió nombres de huésped y códigos de reserva de los títulos del iCal exportado y limita el export a fechas futuras. Consecuencia a validar en la fase de calendario: **el "código único de reserva" del que depende la detección de extensiones puede no venir en el feed de Airbnb**. Es la dependencia más frágil del spec |
| 3 | Checklist configurable por apartamento | **DEFENDIBLE con hedge** | Operto, Turno y Properly sí lo tienen, pero construir el editor es un módulo entero. Con 39 unidades el modelo cuartos+biblioteca cubre el caso. Hedge sin costo: incluir pseudo-cuartos de exterior en el catálogo para las 2 casas (Chinauta, Cartagena) |
| 4 | Estados de pago por gasto individual | **DEFENDIBLE** | Coincide con la operación actual. El gasto con foto de recibo ya deja rastro; el reembolso es contabilidad, no operación de aseo |
| 5 | Alerta de ventana de tiempo insuficiente | **DEFENDIBLE** | El 90% del valor lo captura ya la marca de `urgente` en same-day. La alerta fina requeriría hora real de checkout, que el iCal no expone (es precisamente por eso que el spec agenda por fin de bloqueo) |
| 6 | Detección de huecos largos entre reservas | **DEFENDIBLE** | Breezeway y Hostaway lo cubren con repeating/recurring workflows; a 39 unidades el `repaso` manual funciona. Reevaluar si el portafolio pasa de ~100 |
| 7 | Trazabilidad de rechazos de aseadores | **DEFENDIBLE con matiz** | Turno registra accept/reject; sin registro no se puede responder "por qué este aseo rebotó 3 veces". Pero el evento "no puedo" ya notifica al admin en el momento y ya produce una transición de estado que el historial cronológico por apartamento va a mostrar. Mantener actor + timestamp en esa fila cuesta cero y deja la puerta abierta |
| 8 | Exportación del cálculo mensual | **RIESGO OPERATIVO — MEDIO-ALTO** | Es la exclusión que más probablemente duela. La operación hoy corre sobre Excel; el cierre de mes es una transacción real con ~8 contrapartes que van a pedir desglose. Solo-en-pantalla obliga a screenshot o retipeo manual, reintroduciendo el trabajo manual que el producto elimina. Agravante: el borrado automático a 6 meses destruye el respaldo del pago. Ver P5 para un punto medio de costo casi nulo |
| 9 | Permisos diferenciados entre admins | **DEFENDIBLE** | Equipo pequeño, confianza alta. Añadir RBAC ahora es complejidad de RLS sin beneficio |
| 10 | Flujo de no-show del aseador | **DEFENDIBLE, pero deja un hueco adyacente** | No modelar el no-show está bien. Lo que falta no es detectar ausencias sino poder **cerrar** un aseo que la realidad ya resolvió por fuera del sistema. Ver P4 |
| 11 | Multi zona horaria (UTC-5 fijo) | **DEFENDIBLE y correcto** | Los 8 clusters están en Colombia, que no tiene DST. Advertencia técnica separada, no de scope: el iCal de Airbnb emite eventos con fecha sin hora (DATE-valued); interpretarlos como UTC produce corrimiento de un día. La fuente lo confirma como error frecuente: un desfase de una hora manda al aseador a una unidad todavía ocupada |
| 12 | Limpiezas nocturnas | **DEFENDIBLE** | No ocurren en la operación real. Nada que validar |
| 13 | Escalabilidad de reembolsos + desempeño de aseadores | **DEFENDIBLE con una condición** | El scorecard (Breezeway mide on-time completion y duración; ResortCleaning mide performance) es reporting de gestión, no operación. Diferible. Condición: los datos crudos (timestamps de Empecé/Terminé, eventos "no puedo") ya se están capturando; decidir explícitamente si el borrado a 6 meses también los elimina, porque si sí, el backlog deja de ser recuperable |
| 14 | Tiers SaaS e historial premium | **DEFENDIBLE** | Monetización antes de PMF. Correcto diferirlo |
| 15 | Proximidad geográfica y pool global | **DEFENDIBLE — es la mejor decisión del spec** | El marketplace de Turno resuelve "no tengo aseador"; VivaGuest tiene gente fija por cluster. Costos reales del modelo pool: varianza de puja (90 vs 180 USD por la misma propiedad), imposibilidad de navegar aseadores, comisión más alta, y disputas de pago tripartitas documentadas en BBB. El responsable fijo además es lo que hace Breezeway por defecto ("default field staff" por propiedad) |
| 16 | Notificación masiva / rondas / primero que acepta | **DEFENDIBLE** | Consecuencia directa de #15. Guesty tiene el patrón de tarea sin asignar aceptada por un grupo, pero requiere un pool que aquí no existe |
| 17 | WhatsApp como canal | **DEFENDIBLE COMO EXCLUSIÓN DE CANAL — RIESGO ALTO COMO "push es el único canal"** | Hay que separar dos cosas. **(a) Excluir WhatsApp: defendible.** wa.me no deja trazabilidad, y la API oficial vía BSP implica aprobación de plantillas, ventana de sesión de 24h, costo por conversación y flujo de opt-in: alcance real de MVP, no un feature. **(b) Que push sea el único canal: es el riesgo más alto del spec.** Ningún competidor lo hace: Breezeway usa text/email/app, Turno usa notification center/email/push. Y el contexto colombiano amplifica: penetración de WhatsApp de 92-94%, >70-75% de preferencia como canal de comunicación empresarial, contra una tasa de instalación de PWA en pantalla de inicio que no es controlable por el producto y que en iOS es requisito duro (sin prompt automático, con reportes de pérdida de suscripción tras inactividad). El requisito del spec sobre banner y ayuda de activación reconoce el problema pero solo del lado del aseador. **Mitigación recomendada sin abrir el canal: P1** |
| 18 | Estado intermedio entre confirmación y "En curso" | **DEFENDIBLE** | 4 estados es un modelo limpio. Un quinto estado multiplica transiciones. La pregunta legítima que lo motivaría ("¿lo vio?") se resuelve con un timestamp, no con un estado: ver P1 punto 3 |
| 19 | Sugerencia automática de suplente por sobrecarga | **DEFENDIBLE** | Operto tiene workload balancing, pero con 8 aseadores en clusters disjuntos el admin viendo la carga diaria decide mejor y más rápido que cualquier heurística |
| 20 | Cuenta / PWA para `gestion_vivaguest = false` | **DEFENDIBLE** | Consecuencia coherente del diseño informativo. Sin estado no hay flujo, sin flujo no hay app |

**Resumen del assessment:** 17 de 20 exclusiones son cortes limpios y bien razonados. Dos ameritan acción (#8 exportación, #17 canal único), una amerita una decisión explícita de alcance de borrado (#13). Ninguna exclusión es arbitraria.

---

## Feature Prioritization Matrix

Solo las propuestas y los puntos de fricción; el bloque Active locked es P1 por definición.

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| P1 — Visibilidad de entregabilidad de push | HIGH | LOW-MEDIUM | **P1** |
| P3 — Compresión de imagen en cliente | HIGH | LOW | **P1** |
| P4 — Cierre manual del aseo por el admin | HIGH | LOW | **P1** |
| P2 — Cola de reintento de subida de fotos | HIGH | MEDIUM-HIGH | **P1/P2** (P1 si la conectividad se confirma mala en campo) |
| P5 — Vista imprimible del cálculo mensual | MEDIUM-HIGH | LOW | **P2** (P1 si el primer cierre de mes cae dentro del MVP) |
| P6 — Editar huéspedes/instrucciones post-confirmación | MEDIUM | LOW | **P2** |
| Pseudo-cuartos de exterior en el catálogo | MEDIUM | LOW | **P2** |
| Nota libre del aseador al terminar | LOW-MEDIUM | LOW | **P3** |
| Canal secundario formal (email o WhatsApp BSP) | HIGH | HIGH | **P3** — solo con datos de P1 |
| Desempeño de aseadores / scorecard | MEDIUM | MEDIUM | **P3** |
| Dashboard de propietarios | LOW (hoy) | HIGH | **P3** |
| Editor de checklists por apartamento | LOW | HIGH | **P3** |

---

## Competitor Feature Analysis

| Feature | Turno | Breezeway | Operto Teams | Our Approach |
|---------|-------|-----------|--------------|--------------|
| Origen del trabajo | iCal + integraciones OTA, auto-scheduling | iCal + integración Airbnb, workflows por reglas de reserva | Auto-import de reservas vía PMS | iCal cada 30 min, aseo generado por fin de bloqueo |
| Cambios de reserva | Notifica alteraciones y cancelaciones al aseador por SMS/email | Cancela el workflow y alerta al asignado; mueve la fecha si la reserva se acorta | Actualiza el schedule vía integración PMS | Cancela y regenera **sin confirmar**, forzando revisión humana |
| Reserva re-creada en vez de extendida | No documentado | No documentado | No documentado | **Detección por código de reserva + alerta de doble chequeo humano** (diferenciador) |
| Same-day turnover | Soportado | Tipo de reserva distinto ("turn") con reglas propias | Soportado vía reglas | Marca `urgente` en el dashboard |
| Modelo de asignación | Marketplace con puja + primary/backup propio | Default field staff por propiedad | Drag-and-drop con workload balancing por región | **Responsable fijo + suplente, asignación en firme tras confirmación humana** |
| Gate humano previo | No (auto-asigna) | No (auto-asigna) | No (auto-asigna) | **Sí: confirmación con nº de huéspedes + instrucciones** (diferenciador) |
| Canales al aseador | Notification center, email, push (SMS solo para invitación) | Texto, email o app móvil | Notificaciones configurables | **Solo push** ⚠️ |
| App del aseador | Nativa (Turno Cleaners) | Nativa iOS/Android con offline syncing, mapa y direcciones | Mobile dashboard web | **PWA instalable, sin tienda** |
| Checklist | Con fotos y videos guía, completado obligatorio configurable | Checklists por unidad | Por task, region, property o unit | Biblioteca global + cuartos configurables |
| Evidencia fotográfica | Fotos con timestamp, obligatorias para completar | Fotos obligatorias | Imágenes y videos | Obligatoria por cuarto antes de "Terminé" |
| Reporte de incidencias | Sí + host puede anular el pago hasta 5 días después | Sí | Sí, con reporte al manager | Daño (foto+descripción), gasto (recibo), faltante (lista+Otros) |
| Inventario / consumibles | El aseador reporta niveles; puede exigirse antes de completar | Módulo aparte | Reportes de lavandería | Faltantes desde lista base + "Otros" |
| Pagos | Auto-pay por Stripe al completar; 3.9% tarjeta / 1.5% ACH (8% / 5% en marketplace) | **No paga al equipo desde la plataforma** | Reportes de payroll y time tracking | Cálculo mensual en pantalla, pago fuera del sistema |
| Margen por servicio | No inline | En reporting | En reporting/billing a propietarios | **Rentabilidad por aseo inline** (diferenciador) |
| Unidades no gestionadas | No modelado | No modelado | No modelado | **`gestion_vivaguest = false`, aseo informativo** (diferenciador) |
| Portal de propietarios | No | Sí (con crítica de ser flojo) | Facturación a propietarios | No (fuera de scope) |
| Precio de referencia | Gratis con aseadores de marketplace; comisión por pago | Enterprise, por unidad | Por unidad | Interno |

---

## Sources

**Comparativas y análisis de categoría**
- Breezeway — Turno vs Breezeway: https://www.breezeway.io/blog/turno-vs-breezeway (MEDIUM, fuente interesada)
- Breezeway vs Operto Teams: https://www.breezeway.io/blog/breezeway-vs-operto (MEDIUM, fuente interesada)
- PrepBnB — Turno vs Properly vs Breezeway: https://prepbnb.com/guides/turno-vs-properly-vs-breezeway (MEDIUM)
- Hostfully — Best vacation rental cleaning software: https://www.hostfully.com/blog/vacation-rental-cleaning-software/ (MEDIUM)
- StayFi — 10 Best vacation rental cleaning management software: https://stayfi.com/vrm-insider/2026/06/24/best-vacation-rental-cleaning-management-software/ (MEDIUM)
- Capterra Turno vs Breezeway: https://www.capterra.com/compare/166734-186514/Turno-vs-Breezeway (MEDIUM)

**Documentación de producto**
- Breezeway Task Automation: https://www.breezeway.io/task-automation (HIGH para features, vendor)
- Breezeway para aseadores: https://www.breezeway.io/vacation-rental-cleaners (HIGH, vendor — confirma offline syncing)
- Breezeway — Adjust your Automated Workflows: https://help.breezeway.io/en/articles/8224895-adjust-your-automated-workflows (HIGH — same-day turn, cancelaciones, acortamiento de reserva)
- Breezeway Owner Reporting: https://www.breezeway.io/insights-reporting (HIGH, vendor)
- Turno — fees para hosts: https://help.turno.com/en/articles/2142069-what-are-the-fees-for-using-turno-as-a-host (HIGH — comisiones 3.9%/1.5% y 8%/5%)
- Turno — Auto Payments: https://turno.com/features/auto-payments/ (MEDIUM, vía snippet; el dominio bloquea fetch directo)
- Turno — Photo Checklists / Inventory Management / Cleaner Marketplace: turno.com/features/* (MEDIUM, vía snippets; **turno.com devuelve HTTP 403 a fetch directo, no pude leer las páginas completas**)
- Operto Teams: https://operto.com/teams/ y https://operto.com/payroll-staff-time-tracking/ (MEDIUM, vendor)
- ResortCleaning — Scheduling: https://www.resortcleaning.com/feature/scheduling (MEDIUM, vendor)
- Properly — Photo Checklists: https://getproperly.com/features/photo-checklists (MEDIUM, vendor — confirma soporte offline)
- Guesty — Managing tasks: https://help.guesty.com/hc/en-gb/articles/9370553270941-Managing-tasks (HIGH)
- Hostaway — Tasks FAQ / Recurring Tasks: https://support.hostaway.com/hc/en-us/articles/360036505773-Tasks-FAQs (HIGH — auto-tasks cambian con la reserva; limitación de un solo canal por auto-task)
- Doinn: https://www.hostaway.com/marketplace/doinn/ (MEDIUM)

**Reseñas y crítica independiente**
- OptimizeMyBnb — Turno review y tutorial: https://optimizemyairbnb.com/turnoverbnb-turno-review-tutorial/ (MEDIUM — varianza de puja 90/180, no se puede navegar aseadores, dependencia de que el aseador abra la app, historial de chat limitado)
- BBB — quejas sobre Turno: https://www.bbb.org/us/hi/honolulu/profile/cleaning-services/turno-1296-1000077117/complaints (MEDIUM — disputas de pago tripartitas)
- G2 Breezeway reviews: https://www.g2.com/products/breezeway/reviews (LOW, no accedido en detalle)

**iCal y limitaciones técnicas**
- Uplisting — cambios del iCal de Airbnb: https://www.uplisting.io/blog/how-the-airbnb-icalendar-ical-changes-will-affect-you-and-how-to-avoid-disruption (MEDIUM-HIGH — remoción de nombre de huésped y código de reserva del feed)
- Airbnb Help — sincronizar calendario: https://www.airbnb.com/help/article/99 (HIGH)
- Cleanster — integraciones PMS e iCal: https://cleanster.com/powerful-integrations-with-pms-systems-ical/ (MEDIUM — el feed no distingue bloqueo de reserva)
- Royal Cleaning — guía de scheduling: https://royalcleaningnewmexico.com/how-to-schedule-rental-cleanings-property-manager-guide/ (LOW-MEDIUM — DTEND y timezone drift)

**PWA / push**
- MagicBell — PWA iOS limitations y Safari support: https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide (MEDIUM-HIGH)
- Edana — fiabilidad de push en PWA iOS/Android: https://edana.ch/en/2026/03/19/push-notifications-on-web-applications-pwa-is-it-really-reliable-on-ios-and-android/ (MEDIUM — pérdida de suscripción tras inactividad)
- MobiLoud — PWAs en iOS: https://www.mobiloud.com/blog/progressive-web-apps-ios (MEDIUM)

**Contexto Colombia / LatAm**
- Infobae — WhatsApp lidera el 84% de crecimiento en mensajería empresarial en Colombia: https://www.infobae.com/tecno/2026/04/27/whatsapp-lidera-el-crecimiento-del-84-en-la-mensajeria-empresarial-en-colombia/ (MEDIUM)
- Latinpyme — WhatsApp supera el 70% de preferencia: https://latinpyme.com/meta-lidera-la-comunicacion-empresarial-en-colombia-whatsapp-supera-el-70-de-preferencia/ (MEDIUM)
- BossBot — WhatsApp Colombia, datos de mercado: https://bossbot.uk/blog/statistics-co (LOW — cita 92-94% de penetración, no verificado en fuente primaria)
- El Tiempo / El Colombiano / La República sobre Hogaru (app para aseadoras, ~800 profesionales, entrega de smartphone al personal): https://www.eltiempo.com/tecnosfera/novedades-tecnologia/el-trabajo-de-una-empleada-domestica-con-la-aplicacion-de-hogaru-145052 (MEDIUM)

**Financieros / margen**
- Keystone Bookkeepers — cleaning income y expenses en STR: https://keystonebookkeepers.com/blog/how-to-handle-cleaning-income-and-expenses-in-short-term-rental-bookkeeping (MEDIUM)
- Topkey — márgenes de vacation rental: https://topkey.io/blog/boosting-vacation-rental-profit-margins (MEDIUM — "muchos operadores no saben que su margen de aseo es negativo hasta que lo calculan")

### Limitaciones de esta investigación (honestidad sobre confianza)

- **turno.com y help.turno.com devuelven HTTP 403 a fetch directo.** Los detalles de Turno provienen de snippets de búsqueda y de una reseña independiente. Confianza MEDIA, no ALTA.
- **No pude recuperar discusión real de operadores** (Reddit, foros de STR). Las búsquedas devolvieron páginas de comparación SEO y perfiles corporativos. Todo lo que este documento afirma sobre "lo que los operadores reportan" se apoya en quejas de BBB y en una reseña independiente: **confianza BAJA en el sentimiento, ALTA en las features**.
- **No existe un equivalente latinoamericano directo** de esta categoría que haya podido verificar. PropertyCare, SabeeApp y Smoobu aparecen en resultados en español pero son productos europeos localizados. Hogaru es adyacente (aseo doméstico B2B en Colombia con app propia para las aseadoras) y su dato más relevante es operacional, no de producto: entrega smartphone a cada profesional, lo que confirma que la barrera de dispositivo/adopción en este segmento laboral es real y costosa de resolver.
- **No verifiqué en fuente primaria** si el iCal de Airbnb sigue exponiendo un identificador estable de reserva. Es la dependencia crítica del requisito de detección de extensiones y debería confirmarse contra un feed real antes de planear esa fase.

---
*Feature research for: STR housekeeping operations coordination*
*Researched: 2026-08-30*
