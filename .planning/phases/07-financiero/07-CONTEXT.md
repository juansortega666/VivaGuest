# Fase 7 — Financiero · Contexto y decisiones

> Decisiones tomadas por el dueño del producto el **2026-09-12**, en conversación
> directa. Lo que sigue NO es interpretación: son sus respuestas, con las
> consecuencias que cada una tiene sobre el alcance.

## D7-1 · El dinero vive en su propia sección

**Decidido: una pestaña propia.** No columnas de plata dentro de `/operacion`.

Razón dada: la pantalla operativa es donde se coordinan los aseos del día y el
dinero la ensucia. Y hay una segunda razón que conviene dejar escrita: cualquiera
que abra `/operacion` durante una jornada vería los márgenes, y eso incluye
pantallas compartidas.

**Consecuencia:** ruta nueva en el árbol `(admin)`, con su entrada en la
navegación principal. `/operacion` no cambia.

## D7-2 · Qué entra en el pago de un aseador

**Decidido: la suma de sus aseos MÁS los gastos que reportó.**

Cita literal del dueño: *"ambos pero debe haber desglose con evidencia"*.

Eso convierte el desglose en **requisito, no en adorno**. El número final no
basta: al abrir el pago de una persona hay que poder ver de qué se compone, aseo
por aseo y gasto por gasto, y desde cada gasto llegar a la foto que lo sustenta.

**Lo que NO entra, y es decisión explícita:**

- **Descuentos por daños.** Se ofreció y se dejó fuera. Con personal real, un
  descuento automático sobre el sueldo es una conversación, no un cálculo.
- **Bonos o ajustes manuales.** Fuera del alcance de esta fase.

**Consecuencia:** el snapshot mensual guarda las dos partidas por separado, no un
total plano, o el desglose no sobrevive al borrado de los aseos (FIN-04).

## D7-3 · Un mes cerrado no se vuelve a tocar

**Decidido: se queda quieto.** Si se corrige la tarifa de un apartamento después
de cerrar un mes, el pago de ese mes NO se recalcula.

Razón: es el número que una persona ya cobró. Un histórico que cambia solo es un
histórico en el que nadie puede confiar.

**Consecuencia:** el snapshot es la autoridad del mes cerrado, no una caché de un
cálculo que se pueda repetir. Se descartó también la variante de "ajuste aparte
para el mes siguiente": no se pidió y añade un concepto nuevo.

## D7-4 · Qué se hace con el pago, una vez calculado

**Decidido, tres cosas:**

1. **Verlo en pantalla**, con su desglose (D7-2).
2. **Marcarlo como pagado**, con fecha y quién lo marcó. Sirve para no pagar dos
   veces y para saber qué falta.
3. **Que el aseador vea lo suyo en su propia app.**

**Descartado:** exportar o imprimir. Ya figuraba en el roadmap como algo de la
siguiente versión (`FIN-V2-01`) y se confirma que sigue fuera.

### ⚠ El punto 3 es alcance NUEVO, y hay que decirlo

El ROADMAP define esta fase entera del lado del admin: *"El admin ve cuánto deja
cada aseo y cuánto le debe a cada aseador al cierre de mes"*. Ninguno de sus
cinco criterios de éxito menciona la app del aseador, y ninguno de los requisitos
`FIN-02` a `FIN-05` la toca.

Que cada persona vea su propio pago en el teléfono trae consigo:

- Una pantalla nueva en el árbol `(cleaner)`.
- Reglas de acceso: un aseador ve **lo suyo y nada más**, ni el de un compañero ni
  la rentabilidad del apartamento. Eso es lo que hay que probar contra la base,
  no contra la pantalla.
- **Decidido el 2026-09-12: SOLO MESES YA CERRADOS.** El aseador no ve el mes en
  curso. Razón: el acumulado del mes se mueve, y puede BAJAR (si se cancela un
  aseo ya contado), y un número que baja en el teléfono de quien lo va a cobrar
  genera una conversación que nadie quiere tener. Lo cerrado no cambia nunca
  (D7-3), así que es lo único que se puede enseñar sin ambigüedad.

  Esto simplifica la pantalla del aseador: es una lista de meses liquidados, no
  un contador en vivo.

## Lo que esta fase NO decide

- El margen que se le muestra al aseador: **ninguno**. El aseador ve lo que se le
  paga, nunca lo que se le cobra al huésped.
- La fecha exacta de cierre ya está fijada por el ROADMAP: último día laboral del
  mes, excluyendo fines de semana y **sin** tener en cuenta festivos.
- Los aseos informativos (gestión externa) quedan fuera de todo cálculo y de toda
  métrica (`FIN-05`). No es decisión nueva, es requisito existente.
