# Fase 8 — Paneles laterales en el admin · Contexto y decisiones

> Decisiones tomadas por el dueño del producto el **2026-09-14** (alcance) y el
> **2026-09-15** (cierre), en conversación directa. Lo que sigue NO es
> interpretación: son sus respuestas, con las consecuencias que cada una tiene
> sobre el alcance.
>
> La definición larga, con la evidencia medida, vive en
> `.planning/DEFINICION-paneles-admin.md`. Este documento es el contrato corto.
>
> **Todas estas decisiones están CERRADAS. No se vuelven a preguntar.**

## D8-1 · La regla que decide qué es panel y qué es página

Cita literal del dueño (2026-09-15): *"El drawer debe ser usado en todos los
momentos en los cuales necesitemos mostrar información adicional sobre algún tipo
de selección."*

**Seleccionas algo → el panel te muestra lo que falta saber de eso. Nada más.**

Esta regla reemplaza la formulación anterior ("abrir una cosa para verla → panel;
cambiar de sección → página"), que decía lo mismo con menos precisión.

**Consecuencia:** un formulario de edición o de creación NO es "información
adicional sobre una selección", y por lo tanto no va en panel. Ver D8-3.

## D8-2 · El objetivo, en una frase

**Consultar algo no te saca de la pantalla donde estás.**

Hoy ver una ficha te saca del sitio y volver es un viaje: la lista se recarga y
se pierde el scroll y el filtro. Con panel, miras el dato, lo cierras, y sigues
donde ibas.

## D8-3 · La ficha de apartamento hay que CREARLA: hoy no existe

La definición del 14-sep decía "la ficha de un apartamento pasa a panel". **Eso
era falso de partida, y la medición lo destapó:** `/apartamentos/[id]` no es una
ficha, es el **formulario de edición** (`FormularioApartamento.tsx`, 724 líneas,
más `SeccionGestion` 369, `EditorCuartos` 290, `EditorFaltantes` 123 y
`HistorialApartamento` 294). No hay ninguna ficha de lectura en el proyecto.

Preguntado al dueño si había que crearla, respondió: **"debe crearse"**.

| | Qué es | Dónde vive |
|---|---|---|
| **Panel** | ficha de **lectura**, nueva, corta | encima de la lista |
| **Página** | editar, tal como está hoy | `/apartamentos/[id]` |

El panel lleva un botón **Editar** que abre la página. Crear apartamento tampoco
cambia: sigue siendo página.

**Consecuencia, y es la que hace viable la fase:** es lo único que permite el
"sin scroll vertical" a 480px. Una ficha de lectura cabe; un formulario de 12
campos con listas dinámicas no cabe nunca.

## D8-4 · Los cuatro paneles y su contenido EXACTO

Criterio del dueño, literal: *"mostremos solo la información importante y el
resto ignorémoslo"*. Las listas de abajo fueron revisadas y aprobadas una por
una. **Lo que no está en la lista, no se muestra.**

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

## D8-5 · El velo se queda como está

`bg-black/10` con `backdrop-blur-xs`, en `components/ui/sheet.tsx:87`.

El dueño pidió primero *"un velo negro sobre la información"*. Se le mostró que
el actual es casi transparente y se le preguntó dos veces si quería subirlo.
Respondió las dos veces que **así está bien**. **No se toca**, y eso además deja
intactos los dos paneles que ya existen y los del árbol del aseador.

## D8-6 · El ancho se queda en 480px

El `--container-sheet` que ya existe en `app/globals.css:408`. Confirmado por el
dueño. **No se toca.**

**Consecuencia:** el presupuesto de espacio es fijo, así que lo que se ajusta es
el contenido (D8-4), no el contenedor.

## D8-7 · Sin scroll vertical

El dueño aclaró que "sin scroll" se refiere a **scroll vertical**.

No es una restricción técnica dura, es el objetivo que ordena D8-4: el contenido
de cada panel se recorta hasta que quepa. Si algo no cabe, se quita, no se
agranda el panel ni se acepta el scroll por defecto.

## D8-8 · El panel vive en la dirección, con el patrón que ya existe

`/finanzas/pagos` ya lo hace y es el precedente a copiar:

- se abre con un parámetro de búsqueda (`?pago=<id>`)
- la **página servidor** lo lee de `searchParams` y renderiza el panel
- cerrar es `router.replace(ruta, { scroll: false })`

El `scroll: false` no es un detalle: sin él, cerrar el panel devuelve la lista
arriba y el admin pierde el sitio. Está documentado en `SheetDesglosePago.tsx`.

**Consecuencia:** el enlace se puede pegar en un chat y abre lo mismo, y el botón
atrás cierra el panel en vez de salirse de la sección.

## D8-9 · El detalle de aseo lleva migración, no es solo interfaz

El admin ve la tarifa y el margen; la aseadora no, y esa frontera está en grants
por columna desde la **migración 24**. Leer un aseo ajeno con su dinero exige una
**función definer con guarda de admin como primera sentencia**, igual que las
seis de la migración 26.

Se le explicó al dueño y lo dio por entendido.

**Consecuencia:** esta fase toca base de datos. No se puede planear como una fase
de solo UI.

## D8-10 · Lo que NO cambia

| Se queda como página | Razón |
|---|---|
| Operación, Apartamentos, Aseadores, Finanzas, Aseos, Pagos | Son secciones, no fichas |
| Crear apartamento | ~12 campos con listas dinámicas. No es "información sobre una selección" |
| Editar apartamento | Igual. El panel lo enlaza con un botón |
| **Toda la app del aseador** | Pantalla pequeña, de pie, con guantes. Descartada explícitamente |

## D8-11 · Lo que se rompe, y está contado

**Seis aserciones E2E** afirman que tocar algo navega a una ruta:

| Archivo | Líneas |
|---|---|
| `e2e/apartamento-crud.spec.ts` | 149, 191, 285 |
| `e2e/apartamento-cuartos.spec.ts` | 146 |
| `e2e/finanzas.spec.ts` | 589, 592 |

Las otras 45 aserciones de navegación del repo son de login, ruteo y app del
aseador: no se tocan.

**Regla innegociable:** cambian de forma, no de fondo. **No se debilita ninguna
aserción de seguridad por comodidad de la prueba.**

Detalle que sale de ahí: `apartamento-crud` espera esa URL **después de crear**
un apartamento. Decisión del dueño: al guardar, **aterriza en la lista con el
panel abierto**.

## Lo que ya existe y no hay que inventar

- `components/ui/sheet.tsx` — la primitiva, con su overlay y su cadena de
  variantes de ancho documentada en la cabecera
- `SheetDesglosePago.tsx` — el patrón de URL completo
- `SheetConfirmar.tsx` — el segundo panel del admin
- `--container-sheet: 480px` en `app/globals.css`
