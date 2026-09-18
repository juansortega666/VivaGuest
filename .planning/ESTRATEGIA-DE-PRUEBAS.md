# Estrategia de pruebas de VivaGuest

> Escrita el **2026-09-18**, después del primer mapeo del codebase, con ocho
> fases construidas y 1236 unitarios, 389 pgTAP, 205 de integración y 160 casos
> E2E en verde.
>
> **No existe para añadir cobertura. Existe porque la cobertura que hay no
> responde la pregunta que el dueño hace.**

---

## El hallazgo que ordena todo este documento

Las cuatro suites están verdes y el dueño dice que la app es inusable. Las dos
cosas son ciertas a la vez, y la razón está medida:

**Los 160 casos E2E están organizados por PANTALLA, no por RECORRIDO.** Hay 20
archivos y cada uno se llama como una pantalla: `apartamentos-lista`,
`operacion`, `finanzas`, `mis-pagos`. Cada uno prueba que su pantalla funciona.

**Ninguno prueba que el producto funciona.**

Y hay una segunda mitad, peor: **todos los casos siembran el aseo con un `insert`
directo en `cleanings`** (`e2e/fixtures.ts:811`). Ni uno solo arranca de un feed
de iCal. La cadena que define el Core Value del proyecto,

> *todo checkout detectado en calendario termina en un aseo confirmado, asignado
> y ejecutado con evidencia*

**no se ha probado nunca de punta a punta.** Está probada en pedazos que nadie
ha unido, y el sitio donde se rompe un producto es justo la junta entre pedazos.

---

## Los cuatro niveles

### Nivel 1 · El recorrido del Core Value

**Un solo caso, el más importante del repo.** Arranca de un `.ics` de fixture y
no de un `insert`, y no termina hasta que el dinero está calculado:

```
feed iCal con un checkout
  → corre la sincronización
  → aparece UN aseo pendiente, en la fecha del DTEND
  → el admin lo ve en /operacion y lo confirma con huéspedes e instrucciones
  → queda asignado a su responsable fija
  → le llega el push
  → la aseadora lo abre, marca el checklist y sube su foto
  → pulsa Terminé
  → el admin lo ve completado, con su evidencia
  → aparece en /finanzas/aseos con su margen
  → entra en el pago del periodo
```

Si ese caso pasa, el producto existe. Si no pasa, da igual cuántos de los otros
160 estén verdes.

**Las juntas que este caso prueba y hoy no prueba nadie:** sync→aseo,
confirmación→asignación, asignación→push, ejecución→evidencia, aseo→dinero.

### Nivel 2 · Los recorridos donde la operación se tuerce

El nivel 1 es el día bueno. Estos son los días reales, y son los que deciden si
el sistema aguanta una operación de verdad. Uno por cada forma conocida de
torcerse:

| Recorrido | Qué prueba | Existe hoy |
|---|---|---|
| La aseadora pulsa **"no puedo"** | el aseo vuelve a pendiente y el admin se entera a tiempo de reasignar | en pedazos |
| **La reserva se mueve** de fecha | el aseo viejo se cancela y nace uno nuevo, salvo que ya haya empezado | solo integración |
| **El feed se cae** | no se cancela ni un aseo y el admin queda avisado | solo integración |
| **Checkout y checkin el mismo día** | el aseo sale urgente y se ve como tal | parcial |
| El apartamento **informativo** (`gestion_vivaguest = false`) | genera aseo sin estado ni asignación, y **ni una cifra de dinero** | parcial |
| **Se va la señal** a mitad del aseo | ⚠ **no se puede probar: la cola offline no existe** (ver abajo) |

### Nivel 3 · La prueba de datos reales

Nada se ha probado con la operación real. Todo corre contra semillas escritas
por nosotros, que por construcción tienen la forma que el código espera.

**Cargar los 39 apartamentos reales, con sus feeds reales de Airbnb**, y medir
qué se rompe. No es un test automatizado: es una corrida de choque contra la
realidad, y produce una lista.

Lo que busca, concretamente:
- apartamentos sin responsable, sin tarifa, o con la hora límite en blanco
- feeds que devuelven 404, tardan más de 20 s, o traen caracteres que el parser
  propio de `lib/domain/ical.ts` no vio en los 830 snapshots del research
- nombres con tildes, comillas o emojis que rompan el buscador sin tildes
- el volumen: 39 feeds cada 30 minutos, y una pantalla de operación con decenas
  de aseos en un día, no con los cuatro de la semilla

### Nivel 4 · Lo que ya existe, y se conserva

Los 160 casos por pantalla, los 389 pgTAP, los 1236 unitarios y los 205 de
integración **no se tocan**. Son buenos y prueban lo que dicen probar. Lo único
que cambia es que dejan de ser la respuesta a *"¿funciona el producto?"* y
vuelven a ser lo que siempre fueron: la respuesta a *"¿funciona esta pantalla?"*.

---

## La disciplina, que no cambia

Heredada de las fases 7 y 8 y escrita en `.planning/codebase/TESTING.md`:

**Ninguna aserción cuenta hasta haberla visto en rojo.** Se mete el defecto a
propósito, se comprueba que la prueba lo atrapa, se anota, y se quita. Esta
estrategia añade recorridos largos, y un recorrido largo es donde más fácil se
cuela una aserción que no mira nada.

Las ocho trampas de instrumento ya medidas (el portal de `SheetContent`, las
aserciones negativas con panel abierto, `PLAYWRIGHT_PORT`, el canal de Chromium,
y las demás) están en `TESTING.md` y aplican enteras.

---

## Lo que esta estrategia NO puede probar, y hay que decirlo

**La cola offline no existe.** `PROJECT.md` la declara como constraint desde el
día uno (*"la PWA es offline-first con cola de mutaciones en IndexedDB"*) y se
difirió el 2026-09-12 para sacar la app del aseador antes, con el riesgo
aceptado por escrito:

> *"si se cae la señal a mitad del aseo se pierde el trabajo de campo, y las
> fotos son justo lo que falla con mala señal"*

El detonante declarado para revisarlo era **"una aseadora que pierda un aseo
completo en el piloto"**, o sea: se corrige después de que ya le falló a alguien.

Con 34 unidades repartidas en 8 clusters de Colombia, eso no es hipotético. **No
es un hueco de pruebas: es un hueco de producto**, y ninguna prueba lo tapa.

---

## Las dos deudas de verificación que siguen abiertas

| Qué | Por qué sigue abierta |
|---|---|
| `05-17` | La Fase 5 se mergeó sin correr su verificación. Los siete criterios nunca se comprobaron formalmente |
| `07-13` | El recorrido de nueve puntos en un iPhone real. **Solo lo puede hacer el dueño**, y ninguna suite de este repo corre en un dispositivo físico |

La Fase 5 ya demostró lo que cuesta ignorar esto: **112 tests en verde convivían
con dos fallos que, cada uno por su cuenta, bastaban para que ningún aseador
recibiera jamás un aviso.** Lo que no se prueba en el dispositivo real, no está
probado.

---

## Orden de construcción

1. **Nivel 1**, el recorrido del Core Value. Un solo caso, y es el que más
   probabilidad tiene de encontrar algo roto
2. **Nivel 2**, los cinco recorridos torcidos que sí se pueden probar
3. **Nivel 3**, la carga de datos reales, que es lo que convierte esto en un
   producto y no en una demo
4. Las dos deudas de verificación, en paralelo y cuando el dueño pueda
