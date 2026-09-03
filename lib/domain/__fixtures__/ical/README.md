# Fixtures de iCal

## `airbnb-real-anonimizado.ics`

Feed **real** de un anuncio de Airbnb de VivaGuest, capturado el 2026-09-02 y anonimizado.
Es la única fixture que refleja lo que Airbnb manda de verdad; las demás son sintéticas o
**derivadas** de esta. Ver §Fixtures derivadas y, sobre todo, la §ADVERTENCIA del final: qué
prueban y qué no.

**Anonimizado:** códigos de reserva, últimos 4 dígitos de teléfono del huésped, UIDs y el id
del anuncio. **Conservado:** las 30 fechas exactas, el plegado a 75 octetos, el orden de las
propiedades y la estructura del `UID`.

### Lo que este feed prueba, medido y no supuesto

- **Seis propiedades y nada más:** `DTSTAMP`, `DTSTART`, `DTEND`, `SUMMARY`, `UID`,
  `DESCRIPTION`. Cero `X-`, cero `RRULE`, cero `VTIMEZONE`.
- **El `UID` tiene estructura:** `<prefijo-del-anuncio>-<sufijo-de-la-reserva>@airbnb.com`.
  El prefijo es constante en todo el feed. Da identidad utilizable sin depender de que el UID
  completo sea estable entre refrescos, que es la afirmación que quedó en disputa entre
  `research/STACK.md` y `research/PITFALLS.md`.
- **El código de reserva existe** y vive dentro de la URL del `DESCRIPTION`, partido por el
  plegado. Un parser que no desdoble lo corta a la mitad.
- **El `DESCRIPTION` trae datos del huésped:** los últimos 4 dígitos de su teléfono. Ningún
  documento de research lo contemplaba; todos afirmaban que Airbnb no manda datos personales
  desde 2019. **Es dato personal y no debe registrarse en logs ni persistirse.**
- **Incluye la reserva que termina HOY.** El `DTEND` más antiguo es la fecha de captura. Reduce
  el riesgo de que un diff destructivo borre el aseo del día, aunque falta medir si desaparece
  al día siguiente.
- **Cero bloqueos del propietario:** los 15 eventos son `Reserved`. Este feed NO sirve para
  validar la distinción entre reserva y bloqueo; para eso hace falta capturar un anuncio con
  fechas bloqueadas a mano.

### Casos reales que contiene

- **Turnover del mismo día** el 2026-10-10: sale una reserva y entra otra. Es el caso `urgente`.
- **Huecos largos:** 13 días desde el 2026-10-18 y **31 días** desde el 2026-11-22. Es el caso
  del aseo de `repaso`.
- **15 checkouts distintos**, que es exactamente el número de aseos que este feed debe generar.

---

## Fixtures derivadas del feed real (plan 03-01)

Seis fixtures se construyen copiando `airbnb-real-anonimizado.ics` y mutando **lo mínimo**.
Ninguna inventa formato: el generador que las produjo verifica primero que desdoblar y volver a
plegar el feed real a 75 octetos lo reproduce **byte a byte**, así que cualquier diferencia
contra el real es exactamente la mutación descrita y nada más.

Los 15 códigos de reserva del feed real, en orden de `DTEND`:

| # | DTSTART | DTEND | Código |
|---|---|---|---|
| 1 | 2026-08-30 | **2026-09-02** (día de la captura) | `HME3F6BX75` |
| 2 | 2026-09-04 | 2026-09-06 | `HMALX5BL36` |
| 3 | 2026-09-11 | 2026-09-13 | `HMKM5XK6UG` |
| 4 | 2026-09-18 | 2026-09-20 | `HM5988NZYQ` |
| 5 | 2026-09-25 | 2026-09-27 | `HMWB84STVF` |
| 6 | 2026-10-03 | 2026-10-06 | `HMNGGVZVXW` |
| 7 | 2026-10-08 | **2026-10-10** (turnover) | `HM6EM4A5K5` |
| 8 | **2026-10-10** (turnover) | 2026-10-12 | `HMUBST2KCZ` |
| 9 | 2026-10-16 | 2026-10-18 | `HMUAPF4QHL` |
| 10 | 2026-10-31 | 2026-11-02 | `HMMRCQT96H` |
| 11 | 2026-11-06 | 2026-11-09 | `HM82YXZDW4` |
| 12 | 2026-11-14 | 2026-11-16 | `HMSRGQ3ZU2` |
| 13 | 2026-11-20 | 2026-11-22 | `HM24FL585C` |
| 14 | 2026-12-23 | 2026-12-27 | `HM5RCG7NBM` |
| 15 | 2026-12-30 | 2027-01-04 | `HMCQXAGF9W` |

### `airbnb-real-crlf.ics`

**Muta:** todos los finales de línea, de `LF` a `CRLF`. Nada más: mismos 15 eventos, mismos
`UID`, mismos códigos, mismas fechas.

**Prueba:** que el desdoblado (line unfolding) aguanta la forma en que Airbnb manda el feed de
verdad. El RFC 5545 §3.1 especifica `CRLF`, y la fixture real llegó normalizada a `LF` por el
proceso de anonimización, así que hoy **ninguna** otra fixture del repo ejerce esa ruta. Si
alguien refactoriza `desdoblar()` y pierde la normalización del retorno de carro, el parser deja
de funcionar contra el feed real y **todos los demás tests siguen verdes**.

**No prueba:** que Airbnb mande `CRLF`. Es lo más probable dado el RFC, pero la captura que
tenemos no lo demuestra. Lo confirma la primera corrida contra el feed en vivo.

### `airbnb-real-movida.ics`

**Muta:** el `DTEND` de la reserva 5 (`HMWB84STVF`), de **2026-09-27 a 2026-09-29**. Conserva su
`UID`, su código y su `DTSTART` (2026-09-25). Los otros 14 eventos quedan intactos.

Se eligió la 5 a propósito: no está en la ventana protegida (no termina el día de la captura ni
cerca) y no participa del turnover del 2026-10-10, así que mover su fin no contamina esos dos
casos. El nuevo fin, 2026-09-29, no choca con el `DTSTART` de la reserva 6 (2026-10-03).

**Prueba:** el caso (a) del diff. El aseo del 2026-09-27 se cancela y aparece uno nuevo el
2026-09-29, salvo que el viejo tenga `started_at`.

**No prueba:** que Airbnb conserve el `UID` cuando de verdad se mueve una reserva. **Es una
fixture construida.** Ver la ADVERTENCIA final.

### `airbnb-real-una-menos.ics`

**Muta:** elimina el primer `VEVENT`, el que termina el **2026-09-02**, que es el día de la
captura. Quedan **14** eventos.

**Prueba:** el caso (b) del diff, la desaparición. Y en particular la ventana protegida: la
reserva que se va es justamente la que termina el día de la captura, que es el caso peligroso
(cancelar el aseo de hoy con la aseadora ya en camino). En la primera corrida solo debe marcarse
`disappeared_at`; la cancelación exige una segunda observación, y aun así no debe tocar la
ventana protegida.

**No prueba:** que Airbnb retire la reserva que termina hoy al día siguiente. Esa pregunta la
contesta la distribución de `disappeared_at` en producción.

### `airbnb-real-uid-rotado.ics`

**Muta:** los **15** `UID`. Mismo prefijo de anuncio (`a1b2c3d4e5f6`), sufijo hexadecimal de 32
caracteres distinto en cada uno. **Los 15 códigos de reserva quedan intactos**, igual que las
fechas y los `SUMMARY`.

**Prueba:** que el nivel 1 de la jerarquía de identidad (el código de reserva) gana sobre el
nivel 2 (el `UID`). Las 15 reservas se **actualizan**, no se recrean: los aseos conservan su
`confirmado_at` y su `aseador_id`, y el contador `uid_rotations` de `feed_sync_runs` sube a 15.

**No prueba:** que Airbnb rote `UID`. **Es una fixture construida.** Ver la ADVERTENCIA final.

### `airbnb-extension-mal-creada.ics`

**Muta dos cosas a la vez:**

1. La reserva 14 (`HM5RCG7NBM`) se **acorta**: su `DTEND` retrocede de **2026-12-27 a
   2026-12-25**.
2. Aparece una reserva **nueva**, código `HMEXT01NEW` y `UID` nuevo, cuyo `DTSTART` es
   exactamente **2026-12-25** y cuyo `DTEND` es **2026-12-27**.

Quedan **16** eventos.

**Prueba:** SYNC-08. Un anfitrión que "extiende" una estadía creando una reserva pegada en vez de
alargar la existente. La firma es el `DTSTART` de la nueva coincidiendo con el `DTEND` nuevo de la
que se acortó, con código distinto. Debe producir `needs_review` y una alerta
`extension_sospechosa`, **no** un aseo el 2026-12-25.

**No prueba:** que este patrón ocurra en producción, ni con qué frecuencia. **Es una fixture
construida.** Su contraparte obligatoria es la aserción de que el turnover **sano** del feed real
(2026-10-10, dos reservas pegadas con huéspedes distintos) **no** dispara
`extension_sospechosa`. Sin esa segunda aserción, un detector que marque todo lo pegado pasaría
esta fixture y rompería el caso legítimo, que es el frecuente.

### `airbnb-desc-mutilado.ics`

**Muta:** la subcadena de la ruta de detalle dentro de la URL del `DESCRIPTION` de los **15**
eventos, de `hosting/reservations/details/` a `hosting/rsrvtns/dtls/`. Los 15 `DESCRIPTION`
**siguen presentes**, con su URL y con los 4 dígitos del teléfono; lo único que se rompe es el
reconocimiento del código de reserva.

**Es la fixture más importante del conjunto.** Llegan 15 eventos, o sea la guarda de colapso por
**conteo de eventos** no salta. Pero cero clasifican como reserva. Sin una guarda separada sobre
**reservas clasificadas**, el reconcile cancelaría los 15 aseos del apartamento de un golpe. Es el
Pitfall 5 del research, literal.

**Cómo se comprueba, y por qué el `grep` obvio miente:** en el feed real la ruta está partida por
el plegado a 75 octetos (`…/reservations/de` + salto de línea + espacio + `tails/HME3F6BX75`), así
que buscar la ruta completa sobre el archivo **crudo** devuelve **0 también para el feed real**.
Un test que use ese grep pasa por vacuidad. La comprobación válida es sobre el texto
**desdoblado**, y con control positivo:

| Archivo | Ocurrencias en crudo | Ocurrencias tras desdoblar |
|---|---|---|
| `airbnb-real-anonimizado.ics` | 0 (el grep crudo miente) | **15** |
| `airbnb-desc-mutilado.ics` | 0 | **0** |

### `airbnb-truncado.ics`

**Muta:** el archivo se corta a mitad del octavo `VEVENT`, justo después de su `DTEND`. No hay
`END:VEVENT` para ese evento ni `END:VCALENDAR` para el calendario.

**Prueba:** que el sniff de la Fase 2 **no basta**. El archivo sí empieza por `BEGIN:VCALENDAR`,
así que la validación de cabecera lo deja pasar; hace falta además una guarda de **cuerpo
incompleto** (el calendario se cierra, el último evento se cierra) antes de llamar al RPC. Un
cuerpo truncado es una respuesta parcial de red, no una cancelación de 7 reservas.

**Forma medida:** 1 × `BEGIN:VCALENDAR`, **0** × `END:VCALENDAR`, 8 × `BEGIN:VEVENT`, 7 ×
`END:VEVENT`.

---

## Fixtures sintéticas nuevas (plan 03-01)

### `airbnb-bloqueos-1dia.ics`

**90** `VEVENT` consecutivos de **un día** (`DTEND = DTSTART + 1`), desde el 2026-09-03,
`SUMMARY: Airbnb (Not available)`, **sin `DESCRIPTION` en absoluto**, `UID` con el mismo prefijo
de anuncio que el feed real.

**Prueba:** dos cosas. Que un bloqueo del propietario produce **cero** aseos (SYNC-03), y la
**magnitud** de lo que la falla cerrada evita: si el clasificador se equivoca, esto no son 90
filas de más, son 90 aseos fantasma en un solo apartamento, con 90 notificaciones y 90 pagos
presupuestados.

**Por qué esta forma:** la ventana de reserva que Airbnb cierra por delante del anuncio se publica
así, día a día, no como un bloque. Cero `DESCRIPTION` es la señal medida en los feeds históricos:
`DESCRIPTION` aparece **solo** en los `Reserved`.

**No prueba** cómo se ve de verdad un bloqueo del propietario en un feed de VivaGuest. El feed real
capturado tiene **cero** bloqueos. Ver la ADVERTENCIA final.

### `airbnb-summary-desconocido.ics`

**3** `VEVENT` con `SUMMARY: Airbnb (Preapproved)`, un valor **jamás visto** en ninguna captura, y
con `DESCRIPTION` presente pero **sin** la URL de detalle de reserva.

**Prueba:** la falla **cerrada**. Un `SUMMARY` desconocido sin código de reserva no clasifica ni
como reserva ni como bloqueo del propietario: clasifica `desconocido`, produce **cero** aseos y
**una** alerta. La alternativa (fallar abierto, tratarlo como reserva) genera aseos fantasma; la
alternativa contraria sin alerta hace que un cambio de formato de Airbnb apague la sincronización
en silencio. Por eso las dos mitades — cero aseos **y** una alerta — son la misma aserción.

Nótese que tiene `DESCRIPTION`: eso lo separa a propósito de la señal del bloqueo del propietario.
Un clasificador que dedujera "sin `DESCRIPTION` ⇒ bloqueo, con `DESCRIPTION` ⇒ reserva" fallaría
aquí, que es exactamente lo que esta fixture existe para atrapar.

---

## `generar.ts` — fixtures con fechas relativas

No es una fixture versionada: es el módulo que las **produce**. Exporta
`feedConCheckoutRelativo(offsets, hoyIso, opciones?)`, que devuelve el texto de un `.ics` cuyos
`DTEND` caen en `hoyIso` más cada offset en días, con `DESCRIPTION` de reserva bien formado,
plegado a 75 octetos y códigos distintos por evento. `codigosDe(offsets)` devuelve esos códigos
sin volver a parsear el feed.

**Por qué existe:** la ventana protegida del reconcile destructivo se define respecto a HOY. Una
fixture con fechas literales que hoy cae dentro de la ventana, mañana cae fuera, y el test que la
usa deja de probar lo que decía probar sin que nada se ponga rojo. Es la regla de fixtures
relativas del plan 02-14.

El día de referencia lo pasa el test; el módulo **no** lee el reloj del sistema. Su propia suite
(`generar.test.ts`) afirma el cruce de fin de mes, fin de año y 29 de febrero, y que el plegado
alcanza **exactamente** 75 octetos: si nunca los alcanzara, el plegado no se estaría ejerciendo y
esa aserción pasaría por vacuidad.

`generar.ts` hace aritmética de días con el tipo temporal de JavaScript, y es la **única**
excepción consentida en todo el pipeline de calendario: no vive bajo `lib/domain/ical*.ts`, no
está en el camino que produce la fecha del aseo, y su salida es siempre una cadena de ocho
dígitos. El guardarraíl 10 de `scripts/ci/check-service-role.sh` no lo alcanza por construcción,
no por una excepción escrita a mano.

---

## ADVERTENCIA: qué NO prueban las fixtures construidas

**Las fixtures `airbnb-real-movida.ics`, `airbnb-real-uid-rotado.ics` y
`airbnb-extension-mal-creada.ics` son construidas.** Prueban que el código se comporta bien bajo
los dos mundos posibles, **no cuál es el mundo real.**

La pregunta de si el `UID` de Airbnb sobrevive a un cambio de fechas **no la contesta ninguna
fixture**: la contesta el contador `uid_rotations` de `feed_sync_runs` en producción, sobre feeds
de verdad y a lo largo de días. Por eso el diseño del diff no apuesta por una respuesta: usa el
código de reserva como identidad de nivel 1 y el `UID` como nivel 2, y es correcto en los dos
casos.

Lo mismo aplica a `airbnb-bloqueos-1dia.ics` y a `solo-bloqueos.ics`: son sintéticas y derivadas
de los mismos documentos que pretenden validar. **Usarlas como evidencia de cómo se ve un bloqueo
del propietario es circular.** El feed real tiene cero bloqueos. Eso solo lo cierra capturar un
anuncio con fechas bloqueadas a mano, que es un checkpoint humano y no una tarea de código.

El verificador de la fase no debe contar ninguna de estas cinco como cobertura de la pregunta
empírica correspondiente.

---

## Resultado del checkpoint 1 del plan 03-10: la captura queda DIFERIDA

**No existe `airbnb-real-bloqueos.ics`, y no se creó ninguno con ese nombre.** El checkpoint humano
que iba a capturar un anuncio con tres fechas bloqueadas a mano se difirió por decisión del usuario:
la prioridad es sacar el MVP.

Consecuencia, escrita aquí porque este es el archivo que un lector consulta antes de elegir una
fixture: **la distinción entre reserva y bloqueo del propietario está en confianza MEDIA y no la
cierra ningún test de este repo.** La suposición A1 del research (que un bloqueo del propietario no
trae la URL de detalle de reserva) sigue **sin verificar contra datos reales**, y el señuelo del
plan 03-02 (invertir el orden de las dos ramas del clasificador) sigue **sin poder atraparse**,
porque los dos discriminadores están correlacionados al 100% en la única muestra real que existe.

Lo que hace aceptable el diferimiento es que equivocarse no es destructivo: el clasificador falla
cerrado, `desconocido` no genera aseo, se emite alerta, y la guarda de colapso sobre reservas
clasificadas atrapa el caso masivo.

El detalle completo, con dueño y con los seis pasos para cerrarlo, está en la entrada 8 de
`.planning/phases/03-motor-de-sincronizaci-n-ical/deferred-items.md`.
