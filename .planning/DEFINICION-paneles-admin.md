# Paneles laterales en el panel del admin — Definición

> Acordado con el dueño el **2026-09-14**, después de ver el tablero de Finanzas
> funcionando. Es la fuente de verdad del alcance. El cómo viene después.

---

## El objetivo

**Que consultar información no cueste perder la pantalla donde estabas.** Hoy, ver
una ficha te saca del sitio y volver es un viaje. Con un panel lateral, miras el
dato, lo cierras, y sigues donde ibas.

En palabras del dueño: *"que se abra un drawer, así va a ser más fácil leer
información"*.

## La regla que ordena todo

> **Abrir una cosa para verla → panel lateral. Cambiar de sección → página.**

No es una preferencia estética: es lo que decide si un enlace tiene que poder
compartirse y si el botón atrás tiene que funcionar.

---

## Lo que pasa a panel

| Qué | Hoy | Por qué gana |
|---|---|---|
| **La ficha de un apartamento** | Página propia | Se consulta desde la lista y desde el día. Salir y volver es el 90% del uso |
| **El calendario de un apartamento** | Página propia | Se mira para comprobar algo puntual, no para quedarse |
| **La ficha de una aseadora** | Página propia | Igual: se abre desde Finanzas para mirar y volver |
| **El detalle de un aseo** | **No existe** | Ver abajo |

### El detalle de un aseo es lo único nuevo

Hoy, en Operación, tocar la fila de un aseo **no hace nada**: las acciones viven
en un menú aparte. El dueño pidió que abra su detalle.

Qué muestra: el apartamento, quién lo hace, en qué va el checklist, las fotos de
evidencia, y los gastos o daños que reportó.

**Para qué sirve de verdad:** es lo que hoy se resuelve preguntando por WhatsApp
*"¿cómo va el 302?"*. Con esto, se mira.

Hay material reutilizable: el árbol del aseador ya tiene su propia pantalla de
aseo (`app/(cleaner)/aseos/[id]`) y su capa de lectura. **Pero el admin ve cosas
distintas** (él sí ve las cifras, y ve aseos que no son suyos), así que la lectura
es nueva aunque la forma se parezca.

---

## Lo que NO cambia, y por qué

| Se queda como página | Razón |
|---|---|
| Operación, Apartamentos, Aseadores, Finanzas, Aseos, Pagos | Son secciones, no fichas. Cambiar de sección es navegar |
| **Crear apartamento** | Son ~12 campos con listas dinámicas (cuartos, faltantes). En un panel de 480px se vuelve un formulario largo y estrecho. Crear no es consultar |
| **Toda la app del aseador** | Pantalla pequeña, de pie, con guantes. Ahí la pantalla completa gana. Se descartó explícitamente |

---

## Lo que hay que cuidar, y no es menor

### Los enlaces tienen que seguir sirviendo

Hoy `/apartamentos/abc` abre esa ficha, y ese enlace se puede pegar en un
WhatsApp. Si el panel se abre sin tocar la dirección, ese enlace desaparece.

**La salida es que el panel viva en la dirección**: abrirlo cambia la URL, y
entrar por esa URL abre el panel sobre la pantalla que corresponda. Así el enlace
sigue funcionando y el botón atrás cierra el panel en vez de salirse de la
sección.

### El botón atrás

Con paneles mal hechos, atrás te saca de la sección entera en vez de cerrar el
panel. Tiene que cerrar el panel.

### Las pruebas

Hay pruebas que afirman que al tocar algo **se navega a una ruta**. Al pasar a
panel, esas afirmaciones cambian de forma pero no de fondo: lo que hay que seguir
probando es que el dato correcto aparece y que nadie ve lo que no debe.

**No se debilita ninguna aserción de seguridad por comodidad de la prueba.**

### El patrón ya existe en el proyecto

El desglose de un pago y la confirmación de un aseo **ya abren en panel**. No hay
que inventar el componente ni decidir anchos: hay precedente que seguir.

---

## Cómo se sabrá que quedó bien

1. Desde la lista de apartamentos, tocar uno abre su ficha sin perder la lista, y
   cerrar devuelve exactamente donde estabas.
2. El enlace de esa ficha se puede pegar en un chat y abre lo mismo.
3. El botón atrás cierra el panel, no la sección.
4. Desde Operación, tocar un aseo muestra en qué va, con sus fotos, sin salir del
   día.
5. Ninguna prueba de seguridad se debilitó para que el panel pasara.
6. La app del aseador no cambió en nada.

---

# Decisiones cerradas — 2026-09-15

Lo de arriba es de qué va la cosa. Esto es lo que se va a construir, decidido con
el dueño y sin huecos abiertos.

## La regla, en las palabras del dueño

> **"El drawer debe ser usado en todos los momentos en los cuales necesitemos
> mostrar información adicional sobre algún tipo de selección."**

Seleccionas algo → el panel te muestra lo que falta saber de eso. Nada más.

## El cambio que corrige la definición original

Arriba decía "la ficha de un apartamento pasa a panel". **Eso era falso de
partida:** `/apartamentos/[id]` no es una ficha, es el **formulario de edición**
(`FormularioApartamento.tsx`, 724 líneas, más cuartos, faltantes e historial).
No hay ninguna ficha de lectura en el proyecto.

Y bajo la regla del dueño, un formulario de edición no es "información adicional
sobre una selección". Así que:

| | Qué es | Dónde vive |
|---|---|---|
| **Panel** | ficha de **lectura**, nueva, corta | encima de la lista |
| **Página** | editar, tal como está hoy | `/apartamentos/[id]` |

El panel lleva un botón **Editar** que abre la página. Crear apartamento tampoco
cambia: sigue siendo página.

Esto además es lo único que hace posible el "sin scroll vertical": una ficha de
lectura cabe en 480px, un formulario de 12 campos con listas dinámicas no cabe
nunca.

## Los cuatro paneles y su contenido exacto

**Lo que no está en estas listas, no se muestra.** El criterio es el del dueño:
*"mostremos solo la información importante y el resto ignorémoslo"*.

### Apartamento
Nombre · cluster · estado · dirección con enlace a Maps · código de acceso ·
hora límite · responsable y suplente · tarifa, pago y margen · próximo aseo
Botones: **Editar** · **Calendario**
*Fuera: cuartos, faltantes base, historial, feeds*

### Calendario del apartamento
Próximo checkout · los checkouts del mes · estado del feed y última sincronización
*Fuera: histórico de meses pasados*

### Aseadora
Nombre · activa o no · apartamentos donde es responsable y donde es suplente ·
aseo en curso · lo que lleva ganado en el periodo abierto
*Fuera: el histórico de aseos, que ya está en Finanzas*

### Aseo
Apartamento · fecha · estado · quién lo hace · checklist como `7/12` · fotos en
miniatura · gastos y daños reportados · tarifa, pago y margen
*Fuera: el checklist tarea por tarea*

## Decisiones de interfaz

| Qué | Decisión |
|---|---|
| Velo sobre el fondo | **se queda como está**: `bg-black/10` con blur, en `components/ui/sheet.tsx:87`. Revisado y aprobado por el dueño |
| Ancho | **480px**, el `--container-sheet` que ya existe. Sin cambios |
| Scroll | **sin scroll vertical** es el objetivo del contenido, y por eso las listas de arriba son cortas |
| Dirección | el panel vive en la URL, con el patrón que ya usa `/finanzas/pagos`: se abre con un parámetro, la página servidor lo lee de `searchParams`, y cerrar es `router.replace(ruta, { scroll: false })` |

El `scroll: false` no es un detalle: sin él, cerrar el panel devuelve la lista
arriba y el admin pierde el sitio. Está documentado en `SheetDesglosePago.tsx`.

## Lo que hay que construir, y no es interfaz

**El detalle de aseo lleva migración.** El admin ve la tarifa y el margen; la
aseadora no, y esa frontera está en grants por columna desde la migración 24.
Leer un aseo ajeno con su dinero exige una **función definer con guarda de admin
como primera sentencia**, igual que las seis de la migración 26.

## Lo que se rompe y hay que arreglar

**Seis aserciones E2E** afirman que tocar algo navega a una ruta. Al pasar a
panel cambian de forma, no de fondo:

| Archivo | Líneas |
|---|---|
| `e2e/apartamento-crud.spec.ts` | 149, 191, 285 |
| `e2e/apartamento-cuartos.spec.ts` | 146 |
| `e2e/finanzas.spec.ts` | 589, 592 |

Las otras 45 aserciones de navegación del repo son de login, ruteo y app del
aseador: no se tocan. **No se debilita ninguna aserción de seguridad.**

## Dónde vive esto en el plan

**Fase 8 del ROADMAP**, que reemplaza al piloto en Bogotá 1, eliminado del
milestone el 2026-09-15 por decisión del dueño: el objetivo es terminar el MVP de
la plataforma limpio de punta a punta, y un piloto es operación, no producto.
