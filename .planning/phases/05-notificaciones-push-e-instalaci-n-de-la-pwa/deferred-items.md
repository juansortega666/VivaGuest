# Hallazgos fuera de alcance — fase 05

Cosas encontradas mientras se ejecutaba un plan que NO las cubría. No se
arreglaron a propósito (regla de frontera de alcance del ejecutor); quedan acá
para que un plan futuro las recoja.

## 1. Comentario desactualizado en `SheetConfirmar.tsx` (encontrado en 05-15)

`app/(admin)/operacion/_components/SheetConfirmar.tsx`, bloque
`LA TANDA SE CONGELA AL ABRIR`: dice *"`confirmarAseo` llama a
`revalidatePath('/operacion')`"*. Eso dejó de ser cierto en el plan 04-14, que
quitó `revalidatePath` de las nueve actions por el bug medido que cuelga el
navegador. La MISMA frase está en `DialogoReasignar.tsx`
(`alCambiarApertura`) y, según el propio bloque de cabecera de `_actions.ts`,
en `MenuAseo` y en los cinco diálogos.

- **Por qué no se tocó en 05-15:** es preexistente, lo introdujo otra fase y no
  lo causó ningún cambio de este plan. Arreglarlo bien es reescribir la misma
  frase en siete sitios, que es un cambio propio y no una nota al margen de un
  plan de UI.
- **Impacto:** cero en runtime. Es un comentario que miente sobre por qué existe
  el `router.refresh()` de al lado, y el riesgo real es que alguien lea "ya se
  revalida" y quite el refresco del cliente, que es lo único que refresca.

## 2. Las dos líneas de "lo que queda fuera de la ventana" son inalcanzables (encontrado en 05-16)

`agruparPorDia()` expone `masAllaDelHorizonte` (desde la Fase 4) y ahora también
`antesDeLaVentana` (D-08), y `page.tsx` pinta una línea por cada uno:

- `Hay {N} aseos programados después del {fecha}.`
- `Hay {N} aseos sin cerrar de antes del {fecha}. Ábrelos desde la ficha de su apartamento.`

**Las dos son estructuralmente siempre cero en producción.** La consulta acota
con `.gte('scheduled_date', hoy - 7)` y `.lte('scheduled_date', hoy + 6)`, que
son exactamente los mismos dos límites que la proyección usa para decidir qué
cae fuera. Las filas que harían `N > 0` nunca llegan a la proyección, así que
ninguna de las dos líneas puede renderizarse jamás con el cliente real.

- **Por qué no se arregló en 05-16:** el plan pide explícitamente construir la
  línea nueva *"con el mismo patrón que la que ya existe para el horizonte"*, y
  ese patrón es este. Hacerlas de verdad exige un segundo viaje a la base (un
  `select('id', { count: 'exact', head: true })` por cada extremo, o uno solo con
  `.or()`), que es una decisión de arquitectura de la consulta y no un arreglo al
  margen: rompería la propiedad de "una sola ida a la base" que la cabecera de
  `lib/data/operacion.ts` declara. Regla 4 del ejecutor.
- **Impacto:** no hay información incorrecta en pantalla; hay información que no
  aparece. En `masAllaDelHorizonte` el coste es bajo (un aseo dentro de dos
  semanas no exige ninguna decisión hoy). En `antesDeLaVentana` es mayor y es
  justo lo que §12.4 prometía: *"lo que queda más atrás no se esconde"*. Hoy sí
  se esconde. El tope de siete días (T-05-54) sigue cumpliéndose, pero su
  contrapartida no.
- **Dónde está:** los campos y su cómputo en `lib/data/operacion.ts`
  (`agruparPorDia`), las dos líneas en `app/(admin)/operacion/page.tsx`. Los
  tests unitarios de los dos conteos sí pasan porque llaman a la proyección con
  filas armadas a mano, que es el único camino por el que hoy son alcanzables.
