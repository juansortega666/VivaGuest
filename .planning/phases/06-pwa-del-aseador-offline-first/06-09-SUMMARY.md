---
phase: 06-pwa-del-aseador-offline-first
plan: 09
subsystem: ui-aseador
tags: [reporte, dinero, cierre, report-01, report-02, report-03, d-07, v2-moneda]

requires:
  - phase: 06-02
    provides: "`report_damage`, `report_expense`, `report_missing_items` con su guarda y su notificacion"
  - phase: 06-08
    provides: "el asistente de evidencia, al que este plan le anade dos fases"
provides:
  - "Cuatro actions nuevas: los tres reportes mas la foto del dano o del recibo"
  - "`CampoDeMonto`: el primer campo de dinero que escribe un usuario final"
  - "`PasoDeReporte` con tres categorias en lenguaje de campo y varios reportes"
  - "`FotoDeReporte` y `lib/fotos/subir.ts` (el tramo compartido de la subida)"
  - "`CierreDeAseo`, con el aviso honesto de cuartos sin foto"
  - "`e2e/aseo-recorrido.spec.ts`: el recorrido completo, con asercion contra la base"
affects: [06-10]

tech-stack:
  added: []
  patterns:
    - "Campo de dinero con mascara visible y `input` oculto con el entero: la mascara no puede corromper la cifra"
    - "`lib/fotos/subir.ts`: el tramo donde la ruta la decide el servidor vive en UN sitio"
    - "El recorrido de punta a punta como test, no como comprobacion manual"
---

# 06-09: El reporte y el cierre

## Que se construyo

El ultimo paso del asistente y la pantalla final. La aseadora puede reportar un dano, un gasto con su
monto o lo que faltaba, y despues cerrar. O no reportar nada y cerrar igual.

## La propiedad que no se puede romper

**`Terminar el aseo` no depende en ningun punto del estado del reporte.** Verificado por criterio y
escrito en el componente, porque es facil de romper sin querer: basta con apagar el boton "mientras hay
un reporte a medias", que suena razonable y convierte el paso en obligatorio para quien empezo a
escribir y se arrepintio.

La frase que lo resume: **un paso "opcional" que no deja avanzar es un paso obligatorio con mal copy.**

## El monto, que es el dato con consecuencias

Es el **primer campo de dinero que escribe un usuario final** del producto, y por eso se hizo bien
ahora: hoy es una columna, despues de la Fase 7 seria una migracion con historico financiero vivo.

- Viaja como **entero en la unidad minima**, con la moneda explicita. Regla 1 del camino a v2 de
  `PROJECT.md`: el entero sirve para COP, CLP y PYG, y **no sirve** para MXN, BRL, ARS ni PEN.
- **Tres capas sobre el mismo dato**: el tipo de la union discriminada, el esquema, y el `check` de la
  tabla. Tres aserciones distintas sobre monto invalido (ausente, cero, negativo).
- **La mascara y su inverso son un par.** Al salir del campo se agrupa (`12000` -> `12.000`). Esa
  cadena no puede llegar al esquema: `Number('12.000')` es **12**, o sea el gasto dividido por mil, y
  seria un entero valido que ningun `CHECK` atraparia. Por eso lo que se envia sale de un `input`
  oculto con el entero, no del DOM visible.

## Y el campo que cobra por primera vez una decision de la Fase 5

Hasta esta fase, `app/(cleaner)/` no tenia ni un solo campo que se enfocara. **iOS Safari hace zoom
automatico al enfocar un campo con menos de 16 px**, y es comportamiento del motor. Con la escala de
escritorio (14 px), eso pasaria cada vez que la aseadora toque el monto, y solo se ve en un iPhone real.
La escala movil se fijo meses antes justo para este momento.

## Una desviacion consciente del contrato: `numeric` y no `decimal`

El contrato pedia `inputMode="decimal"`. Se puso **`numeric`**, y la razon es concreta: en pesos
colombianos **no hay subunidad**, y este campo rechaza literalmente el punto y la coma, igual que
`CampoMoneda.tsx` del arbol del admin. `decimal` pintaria una tecla de separador que no hace nada: un
control muerto en un teclado que se usa con guantes. La sustancia del criterio —teclado numerico, nunca
el completo— se cumple. El comentario dice cual es la condicion para cambiarlo: el dia que entre una
moneda con centavos.

## Lenguaje de campo, no de base de datos

`Se dañó algo`, `Tuve que comprar algo`, `Faltaba algo`. Las palabras que usa el esquema por dentro no
aparecen en pantalla: §14 prohibe la jerga en cualquier texto que vea un aseador, y esas tres son jerga
de base de datos. Las etiquetas salen del modulo de dominio con un `Record`, asi que una cuarta
categoria **no compila** sin su frase.

## La foto del dano: obligatoria sin atrapar a nadie

El contrato dice que la foto del dano es obligatoria. Se implemento en el sentido que importa: **se pide
siempre**, y mientras no llegue el reporte queda marcado en ambar con `Falta la foto`. Lo que NO hace es
impedir cerrar el aseo. Un dano sin foto es un dano peor documentado; un aseo que no se puede cerrar es
una llamada telefonica. Mismo criterio que D-06 en todo lo demas de la fase, y la salida se llama por su
nombre: `Seguir sin la foto`.

## Un refactor que el plan no pedia y que evita el peor error posible

El dano y el gasto necesitan la misma cadena de subida que el cuarto. En vez de copiarla, los dos pasos
del medio salieron a `lib/fotos/subir.ts`.

**No es por elegancia**: ese es justo el tramo donde **la ruta la decide el servidor**, y en un bucket
privado el nombre del archivo es una autorizacion. Dos copias de ese cableado son dos sitios donde
alguien puede "simplificar" mandando la ruta desde el cliente. El modulo deliberadamente **no** comprime
(la pantalla necesita el blob antes para mostrar la previsualizacion mientras sube) ni **registra** la
fila (cada llamador cuelga la foto de algo distinto).

Los 9 tests de navegador de 06-07 y 06-08 siguieron en verde tras el refactor.

## El "recorrido manual" del plan, convertido en test

El criterio pedia un recorrido manual anotado en el SUMMARY. Se hizo **como test**
(`e2e/aseo-recorrido.spec.ts`), y la razon es que un recorrido manual se comprueba una vez, el dia que
se escribe, y despues nadie lo repite.

Recorrido completo, en un navegador real contra el build de produccion:

1. tarjeta del home -> hoja -> `Comenzar aseo`
2. marcar una tarea y dejar otras
3. `Terminar aseo` con el checklist a medias -> **informa, no bloquea** -> `Terminar de todos modos`
4. primer cuarto: **subida real de una foto** a Storage local
5. segundo cuarto: `Saltar este cuarto` con motivo `El cuarto estaba cerrado`
6. reporte: gasto `Jabón de manos` por `12000`, y `Seguir sin la foto`
7. `Terminar el aseo` -> `Listo.` con el aviso de cuarto sin foto

**Y las aserciones finales van contra la base, no contra la pantalla**, porque que diga `Listo.` no
prueba nada por si solo:

| Comprobacion | Resultado |
|---|---|
| `cleanings.state` | `completada`, con `finished_at` no nulo |
| `expenses` | `monto = 12000` (entero), `moneda = 'COP'` |
| `cleaning_room_skips` | `motivo = 'cuarto_cerrado'` |
| `cleaning_photos` | al menos una fila, con su ruta y su peso |
| `aseo_sin_evidencia_completa()` | `true`, por la **misma funcion** que consulta el dashboard del admin |

## Un senuelo, y un criterio que se invalidaba solo

| Senuelo | Resultado |
|---|---|
| Que el monto deje de exigir ser positivo | `con monto CERO` y `con monto NEGATIVO` **en rojo** |

Y se encontro un criterio del propio plan que **se invalidaba solo**: pedia
`grep -c "revalidatePath" == 0` sobre un archivo cuya cabecera explicaba, en prosa, que ese helper no se
usa. La mencion ponia el criterio en rojo describiendo justo lo que no se hizo. Se reescribio el
comentario sin el literal, con la nota de por que, igual que se hizo en `CampoMoneda.tsx`. Es la quinta
vez que este defecto muerde en este repo.

## Verificacion

| Puerta | Resultado |
|---|---|
| `test:unit` | **998 tests, 55 archivos** (+14 sobre la linea base: 13 de reportes y 1 de cierre) |
| `test:e2e` | 10 de 10 en los tres specs del aseador |
| `build` | OK, `/aseos/[id]/evidencia` en 13,9 kB |
| `ci:arch` | los tres scripts OK |
| `tsc --noEmit` | limpio |

## Nota de nombres

El plan llamaba a la action `reportarDaño`. Se llamo **`reportarDano`**, sin ene con tilde, por
consistencia con el resto del codigo: el enum de la base usa `dano`, y un identificador con caracter no
ASCII complica los greps de los guardarrailes que este mismo repo usa como puertas.
