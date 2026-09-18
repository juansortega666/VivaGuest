# Preocupaciones del codebase

**Fecha de análisis:** 2026-09-18

**Encargo de este documento:** el dueño dijo que la app le parece inusable, sin
decir por qué. Esto está ordenado por impacto en la operación real de un admin
con 34 apartamentos y 8 aseadores, no por severidad técnica. Lo que ya estaba
declarado en `deferred-items.md`, `BACKLOG.md`, `STATE.md` y los `SUMMARY.md` se
consolida aquí, no se repite en detalle: se cita con su fuente para que quien lea
esto no tenga que ir a buscarlo.

---

## 1. La Fase 9 (retención y borrado) no existe, y la decisión "nada se borra
   nunca" del dueño la dejó fuera del roadmap sin que nadie lo haya escrito

**Por qué es lo primero.** `ROADMAP.md` §Phase 9 sigue titulado "Retención y
borrado automático", pero el 2026-09-18 el dueño decidió *"nada se borra nunca:
ni las fotos a los 30 días, ni los aseos a los 6 meses. Cuando el espacio
apriete, se paga Pro"* (`.planning/quick/260918-a33-alerta-de-storage/260918-a33-SUMMARY.md`).
Eso invalida el propósito completo de la Fase 9 tal como está descrita en el
roadmap, y **nadie ha reescrito esa fase todavía**. Un admin real hoy no tiene
manera de purgar nada, y el único mecanismo construido es un contador de bytes
que avisa al 70% del cupo gratuito (`app/(admin)/operacion/_components/MedidorDeAlmacenamiento.tsx`).
Con ~360 MB/mes medidos y 1 GB de free tier, son **~3 meses de operación real**
antes de que el admin tenga que decidir pagar o quedarse sin poder subir fotos.

**Impacto en operación real:** una aseadora de pie en un apartamento sin poder
subir la evidencia y sin poder cerrar el aseo, si nadie atiende la alerta a
tiempo. Es exactamente el escenario que `260918-a33` reconoce como el riesgo que
motivó construir el medidor.

**Fix approach:** reescribir `ROADMAP.md` §Phase 9 contra la decisión real (ya no
es "borrado", es "vigilancia de cupo y upgrade de plan"), y decidir el flujo de
qué hace el admin cuando el medidor llega a 100%: hoy no hay ningún camino en la
UI para eso, solo el número.

---

## 2. El detalle de un aseo, el panel de apartamento y el panel de aseadora
   (la iniciativa de paneles laterales) llevan diez huecos de contrato
   declarados en `08-UI-SPEC.md` §17, y varios pegan directo en cómo el admin
   trabaja el día a día

Fuente: `.planning/phases/08-paneles-laterales-en-el-admin/08-UI-SPEC.md` §17 y
`deferred-items.md`. Los que más importan para uso real, no los diez completos:

- **El panel de calendario de un apartamento no navega entre meses** (§17.4,
  decisión D8-4). Los checkouts que caen en los primeros días del mes siguiente
  **no se ven desde ahí** aunque sean los próximos que hay que atender. Un admin
  que revisa "¿cuándo se desocupa este apartamento?" el día 28 del mes no ve la
  respuesta si cae el 2.
- **No hay forma de ver más de seis fotos de un aseo desde el admin** (§17.5):
  se ven cinco más un contador, sin manera de recorrer las demás. Si el checklist
  tiene doce cuartos con evidencia, el admin ve la mitad.
- **La ficha de aseadora perdió tres bloques sin dejar rastro de a dónde se
  fueron** (§17.3): un admin acostumbrado a `/finanzas/aseadoras/[id]` para ver
  los gastos de alguien tiene que "aprender la ruta nueva sin que nada se la
  enseñe" (cita literal del contrato).
- **`/finanzas/aseadoras/{id}` da 404** a propósito, sin redirect (deferred-items
  Fase 8, punto 4): cualquier enlace de esa ruta compartido antes de la Fase 8 (por
  WhatsApp, que es justo el canal que este producto reemplaza) deja de funcionar
  sin explicación.
- **Ningún panel se refresca solo** (§17.8): si el admin deja el panel de un aseo
  abierto mientras la aseadora avanza el checklist, ve una foto vieja de cuando
  lo abrió. `/operacion` sí tiene Realtime; los paneles, no.
- **Abrir y cerrar paneles en cadena acumula entradas de historial idénticas**
  (§17.1): ocho aperturas de panel cuestan ocho pulsaciones del botón atrás para
  salir de la sección. Esto es fricción directa y diaria, no un edge case.

**Por qué importa más que un `any` suelto:** son las pantallas que el admin usa
para resolver "¿cómo va el 302?", que es la razón de ser explícita de esta fase
(`.planning/DEFINICION-paneles-admin.md`: *"hoy se resuelve preguntando por
WhatsApp"*). Si la respuesta que da el panel está incompleta o desactualizada,
el admin vuelve a WhatsApp, que es el problema que el producto existe para
eliminar.

**Fix approach:** priorizar en este orden por frecuencia de uso esperada: (1)
refresco del panel de aseo (afecta la pregunta más frecuente), (2) navegación de
meses en el calendario, (3) rastro visible de dónde quedaron los tres bloques de
la ficha de aseadora.

---

## 3. `FiltroPeriodo` en `/finanzas` se cuelga en la mitad de las corridas, y
   **no se recupera sin recargar la pantalla**. Es el control principal de la
   sección financiera

Fuente: `.planning/phases/07-financiero/deferred-items.md`, entrada
"`FiltroPeriodo` se cuelga en `/finanzas`". Causa aislada con ocho corridas
(`app/(admin)/finanzas/loading.tsx` interceptaba la transición del filtro de
periodo, un supuesto falso sobre cómo el App Router de Next trata
`loading.tsx` con cambios de query string). El archivo **ya se retiró** el
2026-09-13 (`git log`: `e12fb1c fix(07): el filtro del Resumen se colgaba`), y
con eso las dos pruebas E2E que lo destapaban volvieron a verde. **Verificar que
sigue retirado** es lo primero a comprobar si el dueño reporta que Finanzas se
congela al cambiar Día/Semana/Mes: es el candidato número uno para "la app me
parece inusable", porque el síntoma es literal "pulso el filtro y la pantalla
deja de responder, sin mensaje de error, y hay que recargar".

**Consecuencia colateral pendiente:** el arreglo aplicado quitó el esqueleto de
carga de la primera visita a `/finanzas` (§"El esqueleto de carga de
`/finanzas`, retirado"). Hoy la primera carga de esa pantalla se ve en blanco un
instante en vez de con esqueleto. Las otras tres rutas de finanzas
(`/finanzas/aseos`, `/finanzas/pagos`, `/finanzas/aseadoras/[id]`) tienen el
mismo patrón de riesgo latente y no se ha tocado ninguna.

**Fix approach documentado y no aplicado:** envolver solo los bloques que
dependen de datos en un `<Suspense>` declarado dentro de `page.tsx`, con una
`key` que no dependa de los parámetros de consulta.

---

## 4. Código muerto confirmado, sin consumidores

Consolidado de `.planning/phases/08-paneles-laterales-en-el-admin/deferred-items.md`
(sección "Código huérfano" y "Lo que la Fase 9 tiene que leer", puntos 5 y b):

| Qué | Estado |
|---|---|
| `app/(admin)/finanzas/_components/FichaAseadora.tsx` (archivo entero) | Cero consumidores en `app`, `lib`, `components`, `e2e`. Candidato real a borrado |
| `BloqueAhoraMismo` (función en `BloqueAhoraMismo.tsx`) | Cero consumidores; su único importador era `FichaAseadora`. **Ojo:** ahí vive la única copia de la línea que fechaba el dato "AHORA MISMO" (`Al momento de abrir esta página.`); borrarla sin más cierra la puerta a recuperar esa cobertura |
| `estadoDeAhoraMismo` (misma archivo) | Sigue viva: la consume `PanelAseadora` |
| `lib/data/finanzas-detalle.ts`: `leerAseosDeAseadora`, `leerGastosDeAseadora`, `leerPagosDeAseadora`, `costoDeLaFicha` | Sin consumidor en producción, con tests unitarios vivos |
| `public.aseos_de_aseadora`, `public.gastos_de_aseadora`, `public.pagos_de_aseadora` (funciones de base) | Sin consumidor en producción. **No borrar**: tienen aserciones vivas en `supabase/tests/11_financiero.test.sql` que ejercen grants y forma de retorno |

**Impacto real:** bajo, es deuda de mantenimiento, no de operación. Se incluye
aquí para que no se re-descubra ni se borre a medias (borrar `FichaAseadora`
sin decidir primero qué pasa con la línea de fecha de "AHORA MISMO" pierde
cobertura sin sustituto, ya declarado como defecto en el mismo documento).

**Fix approach:** un plan de limpieza acotado que (a) decida qué pasa con la
línea de fecha antes de borrar `BloqueAhoraMismo`, (b) borre `FichaAseadora.tsx`
entero, (c) deje las tres funciones de base intactas hasta que un plan de
limpieza de schema evalúe también sus tests.

---

## 5. Tres rojos E2E intermitentes, cada uno con causa medida y sin arreglar

| Caso | Síntoma | Medición | Dueño según deferred-items |
|---|---|---|---|
| `e2e/push-instalacion.spec.ts:215` (antes E2, ahora entregas equivalentes) | "El service worker no mostró ninguna notificación" tras 15s, solo en la suite completa | Fase 8: reproducible siempre en suite completa, nunca solo. Quick `260918-h47` (2026-09-18): **se invirtió** — falló en la primera corrida aislada y pasó en la completa. Contradice ambas direcciones previas | Sin dueño de fase; candidato "plan de estabilidad de la suite o Fase 9" |
| `e2e/operacion.spec.ts:390` (toast "El aseo quedó cancelado.") | El toast no aparece pero la mutación sí ocurrió (fila ya dice "Cancelado") | 08-13: falla en suite completa y en el archivo sin los casos nuevos de la fase. Causa: la pila de `sonner` deja de renderizar con más de tres toasts apilados, y el `beforeEach` no la drena | "Un plan que pueda tocar el arnés sin estar escribiendo casos encima" |
| `e2e/operacion-alertas.spec.ts:341` | El orden esperado de dos alertas se invierte entre medianoche y las 04:01 | 08-11/08-13: el caso da por sentado un orden que solo es cierto después de las 04:01; el producto ordena bien, el test asume mal la hora | 08-13 (plan de casos E2E) |

**Por qué importa poco para "la app es inusable":** los tres son defectos de la
suite de pruebas o de acumulación de estado en runs largos de Playwright, no
comportamiento que un admin real vaya a notar (el toast SÍ refleja el estado
real, solo que no aparece visualmente el aviso; el orden de alertas es un caso
de reloj en test). Se listan para que no se confundan con regresiones de
producto si alguien vuelve a verlos en rojo.

---

## 6. `AVISOS` en `/aseadores` nunca llega a "Activos" — aceptado, no bug

Al borrarse el asistente de `/instalar` (`260918-h47`), el permiso de push solo
se puede conceder con un toque dentro de la PWA ya instalada
(`BotonActivarAvisos.tsx`, intacto). El admin ya no tiene ningún flujo para
forzar esa activación a distancia: depende de que el dueño lo pulse él mismo
durante el montaje de cada teléfono, uno por uno, en los 8 equipos reales.
**Con 39 unidades y hasta 8 aseadores**, esto significa que la columna AVISOS
de `/aseadores` queda permanentemente en un estado intermedio para cualquier
aseador cuyo teléfono no se monte a mano con ese paso. No es un defecto de
código: es una dependencia operativa no automatizable que el admin tiene que
ejecutar personalmente y que la UI no le recuerda como una tarea pendiente por
aseador (más allá de la columna misma). Riesgo real: si el dueño olvida el
paso en un teléfono, ese aseador nunca recibe push y nadie más que el admin
puede notarlo mirando la columna.

**Backlog ya declarado, sin owner de fase:** "Enviar una prueba de aviso desde
`/aseadores`" (`BACKLOG.md`, Fase 5 deuda §20.6): *"un aseador puede quedarse en
`Sin probar` para siempre y el admin no tiene cómo forzarle una prueba"*.

---

## 7. Modo oscuro ausente en todo el árbol del aseador — deuda operativa real,
   no cosmética

`BACKLOG.md`: *"El aseador abre la app a las 6 de la mañana con el sistema en
oscuro y recibe una pantalla blanca."* Esto es un problema de uso real y
diario para el usuario que menos tolerancia tiene a fricción (de pie, con
guantes, con el teléfono en modo oscuro por batería o por hora). No tiene fase
asignada.

---

## 8. Cola offline en IndexedDB diferida — riesgo aceptado que contradice
   una constraint del propio `PROJECT.md`

`BACKLOG.md`: la PWA del aseador **no encola mutaciones offline**; se difirió
"para sacar la app del aseador antes" (decisión del dueño, 2026-09-12).
**Riesgo aceptado explícitamente:** *"si se cae la señal a mitad del aseo se
pierde el trabajo de campo, y las fotos son justo lo que falla con mala
señal."* Esto contradice el constraint de `PROJECT.md` ("la PWA es
offline-first con cola de mutaciones en IndexedDB") que se daba por sentado
desde el día uno del proyecto. En operación real con 34 unidades repartidas en
8 clusters de Colombia, es plausible que haya zonas con señal intermitente. El
detonante declarado para revisarlo es "una aseadora que pierda un aseo completo
en el piloto" — es decir, se corrige reactivamente, después de que ya le
falló a alguien en producción.

---

## 9. `/finanzas` fuera de `ZONA_ADMIN` del middleware de ruteo

`lib/auth/routing.ts` no incluye `/finanzas` en su arreglo `ZONA_ADMIN`
(`.planning/phases/07-financiero/deferred-items.md`). Una sesión de aseadora que
pide `/finanzas/aseos` no rebota en el middleware: entra, el layout de `(admin)`
falla su guard y redirige a `/login`, desde ahí a `/mis-aseos`. **El destino
final es correcto y no hay fuga de datos** (nada de la página llega al
navegador), pero son dos saltos en vez de uno y cada salto escribe
`Error: no_autorizado` en el registro del servidor, ruido que puede confundir a
quien lea logs de producción pensando que hay un intento de acceso indebido.
Fix de una línea, sin dueño de fase asignado todavía.

---

## 10. La moneda del pago de un aseador asume monocurrency; latente, no vivo

`cleaner_payouts.moneda` es una sola columna con default `'COP'`, mientras que
`expenses.moneda` ya es por-gasto desde la migración 18 (regla del camino a
v2). Si algún día un periodo mezclara gastos en dos monedas, el cierre sumaría
montos de monedas distintas sin que el CHECK `cp_total_cuadra` lo detecte
(solo compara que el total sea la suma de las partidas, no que sean
comparables). Hoy no hay ninguna pantalla que permita escribir un gasto en
moneda distinta de COP, así que el defecto es latente. Antes de cualquier
expansión fuera de Colombia (ver también `BACKLOG.md` v2 multi-tenant), esto es
más barato de arreglar ahora (3 columnas) que después con histórico financiero
vivo (~15 columnas).

---

## 11. Ausencia total de multi-tenant — fuera de alcance del MVP, documentado
    con seriedad en `BACKLOG.md`

No hay `tenant_id` ni equivalente en las 23 tablas de `public`. La RLS
distingue roles (`is_admin()`, `is_active_cleaner()`), no dueños de datos. Esto
es intencional y correctamente diferido a v2 (ver `BACKLOG.md` sección
completa), pero se incluye aquí porque es la pieza de arquitectura más cara de
retrofit si el negocio decide vender el producto a otro operador antes de
planearlo como milestone propio: "23+ tablas, RLS reescrita y migración con
datos en producción" es la propia estimación del documento.

---

## 12. Archivos grandes que concentran lógica y riesgo de cambio

No son un problema per se en un proyecto con esta disciplina de pruebas, pero
son los puntos de mayor fricción para el próximo cambio:

| Archivo | Líneas |
|---|---|
| `lib/database.types.ts` | 2083 (generado, no tocar a mano) |
| `lib/domain/alertas.test.ts` | 1097 |
| `lib/test/aseos.ts` | 1044 |
| `app/(admin)/apartamentos/_actions.ts` | 975 |
| `lib/domain/alertas.ts` | 849 |
| `app/(admin)/operacion/page.tsx` | 842 |
| `lib/data/operacion.ts` | 808 |
| `app/(admin)/apartamentos/_components/FormularioApartamento.tsx` | 731 |

`lib/domain/alertas.ts` concentra las trece alertas del panel operativo (la
lógica que decide qué ve el admin como "urgente"): cualquier defecto ahí tiene
alcance amplio, y su tamaño hace más caro auditar un cambio nuevo sin tocar de
refilón las alertas existentes. `FormularioApartamento.tsx` (731 líneas) es el
único formulario largo del producto (~12 campos con arrays dinámicos de cuartos
y faltantes); es el candidato más probable a que un admin real reporte
"el formulario de apartamento es confuso" si se le pregunta directamente.

---

## 13. La cobertura de la ráfaga de Realtime estaba sobrestimada un orden de
    magnitud — medido, no es un problema hoy, pero indica que el presupuesto
    original de firmas era una suposición sin medir

`deferred-items.md` Fase 8, punto 3: el comentario de `lib/data/panel-aseo.ts`
calculaba "hasta 90 firmas de 300 segundos" asumiendo 15 refrescos por ráfaga
de eventos Realtime; medido con cuatro corridas reales, son 1-2 refrescos y 6-12
firmas. No es un bug, pero es una señal de que hay comentarios/estimaciones de
capacidad en el código que no se han verificado contra el comportamiento real
del sistema, y conviene no asumir que otros números similares (cuotas, límites,
timeouts) están mejor calibrados sin medirlos también.

---

## 14. Enlace a un aseo purgado, hoy inofensivo, se vuelve engañoso el día que
    algo sí se borre

Hoy `/operacion?aseo={uuid}` con un id que no existe abre la lista normal, sin
aviso (`08-UI-SPEC.md` §17.2, decisión correcta bajo el supuesto "nada se
borra"). Con la decisión del punto 1 de este documento ("nada se borra nunca"),
este caso puede no llegar a materializarse nunca para aseos — pero si en algún
momento se revierte esa decisión (o si se purgan fotos aunque no se purguen
aseos), un admin que sigue un enlace viejo a un aseo/foto ya no distinguirá "se
borró" de "me equivoqué de enlace". Queda contado para que no se pierda si la
política de retención cambia.

---

## Resumen priorizado (para responder "¿por qué se siente inusable?")

1. **Verificar si `/finanzas` sigue congelándose al cambiar de filtro de
   periodo** (punto 3) — es el síntoma más parecido a "inusable": control
   principal sin feedback, sin recuperación, hay que recargar.
2. **Paneles laterales incompletos** (punto 2): datos que no se actualizan
   solos, navegación de calendario cortada, fotos inaccesibles más allá de la
   sexta, rutas que antes funcionaban y ahora dan 404.
3. **Fase 9 sin redefinir tras "nada se borra nunca"** (punto 1): el roadmap
   describe una fase que ya no corresponde a la decisión de negocio vigente.
4. **AVISOS que nunca cierra su ciclo** (punto 6) y **modo oscuro ausente**
   (punto 7): fricción diaria para el aseador, el usuario con menos margen de
   tolerancia.
5. Todo lo demás (código huerfano, monocurrency, multi-tenant, archivos
   grandes, rojos E2E intermitentes) es deuda real pero no explica una queja
   de "la app es inusable" hoy mismo.

---

*Auditoría de preocupaciones: 2026-09-18*
