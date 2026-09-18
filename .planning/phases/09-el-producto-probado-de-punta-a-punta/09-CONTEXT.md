# Fase 9 — El producto probado de punta a punta · Contexto y decisiones

> Escrito el **2026-09-18**. A diferencia de las fases anteriores, este contexto
> **no sale de una conversación de áreas grises con el dueño**: sale de lo que el
> mapeo del codebase midió, y de dos decisiones de negocio que el dueño tomó ese
> mismo día.
>
> Lo que sí es textual suyo está citado.

## D9-1 · Por qué esta fase existe, y por qué la de retención no

**Decisión del dueño, 2026-09-18, textual:** *"si no importa, cuando llegue el
momento con Supabase lo solucionaré"*, y *"para ambas cosas"* al preguntarle si
eternamente aplicaba solo a las fotos o también al resto.

**Nada se borra nunca.** Ni las fotos a los 30 días ni los aseos a los 6 meses.
De los siete requisitos de retención quedó RET-07, hecho el mismo día en el quick
`260918-a33`. Los otros seis están en `BACKLOG.md` con su razón.

**Lo que entra en su lugar sale de una medición, no de una intuición.** El primer
mapeo del codebase encontró:

- **160 casos E2E en 20 archivos, todos organizados por PANTALLA.** Los archivos
  se llaman `apartamentos-lista`, `operacion`, `finanzas`, `mis-pagos`. Cada uno
  prueba que su pantalla funciona.
- **Ninguno prueba que el producto funciona.**
- **Los 160 siembran el aseo con un `insert` directo en `cleanings`**
  (`e2e/fixtures.ts:811`). Ni uno arranca de un feed de iCal.

El Core Value del proyecto es *"todo checkout detectado en calendario termina en
un aseo confirmado, asignado y ejecutado con evidencia"*, y **esa cadena nunca se
ha probado entera.** Está probada en pedazos que nadie ha unido, y la junta entre
pedazos es donde se rompen los productos.

## D9-2 · El pedido del dueño que da origen a todo esto

Textual, 2026-09-18: *"realmente la app es inusable y seguramente para allá vamos
a mover nuestros esfuerzos"*.

**Se le preguntó tres veces qué vio y no contestó.** Así que esta fase se diseña
sin esa respuesta, y por eso su primer entregable es el que más probabilidad
tiene de encontrar el problema por su cuenta: el recorrido completo.

**Consecuencia de método:** si durante la fase el dueño dice qué vio, eso manda
sobre este orden. Hasta entonces, el recorrido completo es la mejor apuesta.

## D9-3 · El recorrido del Core Value es UN caso, y es el más importante del repo

Arranca de un `.ics` de fixture, **no de un `insert`**, y no termina hasta que el
dinero está calculado:

```
feed iCal con un checkout
  → corre la sincronización
  → aparece UN aseo pendiente, en la fecha del DTEND
  → el admin lo confirma con huéspedes e instrucciones
  → queda asignado a su responsable fija
  → le llega el push
  → la aseadora marca el checklist y sube su foto
  → pulsa Terminé
  → el admin lo ve completado con su evidencia
  → aparece en /finanzas/aseos con su margen
  → entra en el pago del periodo
```

**Si ese caso pasa, el producto existe. Si no pasa, da igual cuántos de los otros
160 estén verdes.**

Las cinco juntas que prueba y que hoy no prueba nadie: sync→aseo,
confirmación→asignación, asignación→push, ejecución→evidencia, aseo→dinero.

## D9-4 · Los cinco recorridos torcidos

El D9-3 es el día bueno. Estos son los días reales:

| Recorrido | Qué tiene que ser verdad |
|---|---|
| La aseadora pulsa **"no puedo"** | el aseo vuelve a pendiente y el admin se entera a tiempo de reasignar |
| **La reserva se mueve** de fecha | el aseo viejo se cancela y nace uno nuevo, **salvo que ya tenga `started_at`** |
| **El feed se cae** | no se cancela ni un aseo y el admin queda avisado |
| **Checkout y checkin el mismo día** | el aseo sale urgente y se ve como tal |
| El apartamento **informativo** | genera aseo sin estado ni asignación, y **ni una cifra de dinero** |

Los cinco existen hoy en integración o en pedazos de E2E. Lo que falta es
recorrerlos de punta a punta por la interfaz.

## D9-5 · La carga de los 39 apartamentos reales

**Nada se ha probado con datos reales.** Todo corre contra semillas escritas por
nosotros, que por construcción tienen la forma que el código espera.

No es un test automatizado: es una corrida de choque contra la realidad, y
produce una lista de lo que se rompe. Lo que busca:

- apartamentos sin responsable, sin tarifa, o con la hora límite en blanco
- feeds que devuelven 404, tardan más de 20 s, o traen caracteres que el parser
  propio de `lib/domain/ical.ts` no vio en los 830 snapshots del research
- nombres con tildes, comillas o emojis que rompan el buscador sin tildes
- el volumen real: 39 feeds cada 30 minutos y una pantalla de operación con
  decenas de aseos, no con los cuatro de la semilla

**Esta tarea necesita al dueño**: los links de iCal reales no están en el repo y
no pueden estarlo.

## D9-6 · La disciplina de señuelos, que no cambia

Heredada de las fases 7 y 8, en `.planning/codebase/TESTING.md`:

**Ninguna aserción cuenta hasta haberla visto en rojo.** Se mete el defecto a
propósito, se comprueba que la prueba lo atrapa, se anota, y se quita.

Esta fase añade recorridos **largos**, y un recorrido largo es donde más fácil se
cuela una aserción que no mira nada. La Fase 8 ya lo midió con el portal de
`SheetContent`: la misma aserción daba verde con el ámbito viejo y rojo con el
correcto, sobre el mismo documento.

## D9-7 · Lo que esta fase NO puede probar, y no es culpa de las pruebas

**La cola offline no existe.** `PROJECT.md` la declara como constraint desde el
día uno (*"la PWA es offline-first con cola de mutaciones en IndexedDB"*) y se
difirió el 2026-09-12 para sacar la app del aseador antes, con el riesgo aceptado
por escrito:

> *"si se cae la señal a mitad del aseo se pierde el trabajo de campo, y las
> fotos son justo lo que falla con mala señal"*

El detonante declarado para revisarlo era **"una aseadora que pierda un aseo
completo en el piloto"**. Con 34 unidades en 8 clusters de Colombia, eso no es
hipotético.

**Es un hueco de producto, no de pruebas.** El recorrido "se va la señal a mitad
del aseo" queda fuera de alcance **declarado**, no olvidado.

## D9-8 · Las dos deudas de verificación que esta fase hereda

| Qué | Estado |
|---|---|
| `05-17` | La Fase 5 se mergeó sin correr su verificación. Los siete criterios nunca se comprobaron formalmente |
| `07-13` | El recorrido de nueve puntos en un iPhone real. **Solo lo puede hacer el dueño** |

La Fase 5 ya demostró lo que cuesta ignorarlo: **112 tests en verde convivían con
dos fallos que, cada uno por su cuenta, bastaban para que ningún aseador recibiera
jamás un aviso.**

## Lo que ya existe y no hay que inventar

- `e2e/fixtures.ts` con `esperarUrlDeCliente()`, `esperarControlHidratado()` y
  todos los sembradores
- Las ocho trampas de instrumento medidas, en `.planning/codebase/TESTING.md`
- Los fixtures `.ics` reales de la Fase 3
- `PLAYWRIGHT_PORT=3210` obligatorio, y `npm run db:reset` antes de corrida
  completa
