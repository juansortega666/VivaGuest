# Fixtures de iCal

## `airbnb-real-anonimizado.ics`

Feed **real** de un anuncio de Airbnb de VivaGuest, capturado el 2026-09-02 y anonimizado.
Es la única fixture que refleja lo que Airbnb manda de verdad; las demás son sintéticas.

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
