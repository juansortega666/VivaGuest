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

---

# DECISIONES DEL 2026-09-13 — las cuatro que bloqueaban el plan

> Salieron de `07-RESEARCH.md` (Q1, Q2, Q4, Q5). Las respondió el dueño en
> conversación directa. **Ninguna es interpretable: si el plan contradice algo de
> aquí, el plan está mal.**

## D7-5 · El periodo termina el día del cierre (respuesta a Q1)

**Decidido: la opción (a).** El periodo de pago va **de cierre a cierre**, no de
día 1 a fin de mes calendario. Si enero cierra el viernes 30, ese periodo es del
1 al 30, y el 31 pertenece al periodo siguiente.

**Consecuencia dura, y hay que respetarla desde la primera migración:** la
cabecera del snapshot necesita **`periodo_desde` y `periodo_hasta`**, dos
columnas de fecha reales. NO basta con un `periodo` tipo `'2026-01'`. El research
lo dice con todas las letras: añadirlas después de haber cerrado meses reales es
caro.

**Lo que el aseador ve:** el periodo NO siempre coincide con el mes calendario, y
la pantalla tiene que decir las fechas exactas que cubre, no solo el nombre del
mes. Un recibo que dice "enero" y cubre del 1 al 30 sin decirlo es una discusión
esperando a ocurrir.

## D7-6 · Los recibos de gasto duran lo mismo que el pago (respuesta a Q2)

**Decidido: 6 meses**, alineados con `retention_months`, en vez de los 30 días
que hoy aplica `photo_retention_days` a todas las fotos por igual.

Razón: D7-2 exige poder llegar desde cada gasto a su foto, y con 30 días ese
enlace ya está roto el mes siguiente. Las fotos de gasto son **~3% del volumen**
(una por gasto, contra ~6 de checklist por aseo), así que el coste en Storage es
marginal.

**Obligación que esta fase NO puede dejar sin escribir:** la decisión va a
`.planning/STATE.md` bajo consecuencias para la **Fase 9**. Si nadie la escribe
allí, la purga automática va a borrar los recibos sin saber que está rompiendo un
requisito de la Fase 7.

## D7-7 · El aseador no sabe nada de lo que se le cobra al huésped (respuesta a Q4)

**Decidido, y es cita literal: _"no, la aseadora no debe saber nada de nuestros
cobros"_.** Se cierran **las dos** superficies medidas en el Hallazgo 1 del
research, no solo la barata:

1. La de `cleanings` (`tarifa_huesped` legible por el aseador vía grant por
   columna). Ningún código la lee: cerrarla es casi gratis.
2. La de `properties` en la ventana -1..+7. Esta **sí** tiene consumidor: el CRUD
   del admin en `lib/data/apartamentos.ts:106`. Cerrarla obliga a rehacer el
   embed `properties(...)` de `lib/data/aseo-aseador.ts`, probablemente moviendo
   la lectura del aseador a una función definer que devuelva solo sus columnas.

Esto **sube el alcance de la fase** respecto a lo que el ROADMAP dice, y es
deliberado: es una fuga de datos de negocio medida contra Postgres, no una
sospecha teórica. Se cierra ahora.

**Cómo se prueba:** pgTAP, impersonando a un aseador, afirmando que la lectura
devuelve NULL o falla. Un test contra la pantalla no sirve: el dato viaja aunque
no se pinte.

## D7-8 · Un aseo pertenece al periodo en que SE COMPLETÓ (respuesta a Q5)

**Decidido:** la pertenencia NO sale de `scheduled_date`. Sale de **cuándo se
completó el aseo**. Un aseo programado el 28 de enero que se termina el 2 de
febrero se paga en el periodo de febrero.

**Por qué esto es coherente y no un parche:** junto con D7-5, **elimina los días
huérfanos por completo**. El periodo va de cierre a cierre y cada aseo cae en el
periodo en el que se terminó, así que no existe ningún aseo que no pertenezca a
ninguno. La recomendación del research (mantener `scheduled_date` y avisar al
admin de los colgados) queda **descartada**: ya no hay colgados que avisar.

**Consecuencia en la pantalla:** el desglose muestra **las dos fechas** —cuándo
estaba programado y cuándo se hizo—. Sin eso, un aseo de enero en el recibo de
febrero parece un error y genera exactamente la discusión que se quiere evitar.

**Consecuencia en el schema:** hay que verificar qué columna marca el completado
(`closed_at`, `terminado_at` o equivalente) y si está poblada en todos los aseos
cerrados hasta hoy. El research debe haberla identificado; si no, es lo primero
que el plan tiene que resolver.

## D7-9 · ~~La alerta del 70% de Storage es un banner~~ · **ANULADA el 2026-09-13**

> **Esta decisión ya no aplica: RET-07 salió de la fase entera.** El dueño sacó
> la alerta de Storage y la retención legal de Finanzas porque no son dinero.
> Están en la Fase 9, como issues #6 y #5. Lo de abajo se conserva solo porque
> el análisis del enum sigue siendo válido para quien recoja ese issue.

### (Texto original, ya no vigente)

Q3 era menor y no se le preguntó. Se aplica la recomendación del research:
**banner persistente** en `/finanzas` y `/operacion`, no push.

Cumple las dos mitades de RET-07 ("ve el consumo" y "recibe alerta") sin tocar el
enum `notification_type` —que tiene once valores por decisión del plan 03-03, y
cuyo doceavo no se puede usar en la misma migración que lo añade—. Y se ve aunque
el push falle, que es justo el escenario en el que uno quiere enterarse.

**Si el dueño prefiere push, es un cambio aditivo:** un valor `storage_alto` en
su propia migración. No hay que rehacer nada de lo anterior.
