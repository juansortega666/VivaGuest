---
phase: 06-pwa-del-aseador-offline-first
plan: 03
subsystem: domain
tags: [dominio-puro, checklist, motivos, zod, check-01, d-05, d-07, paridad]

requires:
  - phase: 06-01
    provides: "`cleaning_room_skips`, el enum `motivo_sin_evidencia` y `aseo_sin_evidencia_completa()`, cuya regla este plan espeja"
provides:
  - "`lib/domain/checklist.ts`: armado por cuarto, progreso, evidencia incompleta y primer cuarto incompleto"
  - "`lib/domain/motivos.ts`: las dos listas cerradas, con las del skip ANCLADAS al enum por tipo"
  - "`lib/domain/reporte.schema.ts`: union discriminada que hace imposible un gasto sin monto"
  - "El inventario de emisores de notificaciones ampliado de 14 a 18"
affects: [06-07, 06-08, 06-09, 06-10]

tech-stack:
  added: []
  patterns:
    - "Un Record<EnumGenerado, string> convierte 'falta una etiqueta' en un error de compilacion, en vez de una cadena vacia en pantalla"
    - "Devolver {hechas,total} y no un porcentaje: la cabecera muestra 1/4 literal y el porcentaje solo lo necesita la barra al pintar"
    - "El caso de control vale tanto como el caso positivo: 'cuarto sin foto que TAMPOCO la necesitaba -> no falta evidencia' es lo que distingue 'no tiene' de 'le falta'"
    - "@ts-expect-error solo cubre LA LINEA SIGUIENTE: con un objeto multilinea el error cae en la propiedad ofensora y la directiva queda sin usar"
---

# 06-03: La logica pura de la ejecucion del aseo

## Que se construyo

Tres modulos puros, 47 tests entre ellos, y la ampliacion de un inventario de la Fase 5.

## Lo que el test de la Fase 5 cazo, y funciono exactamente como fue disenado

`lib/push/colapso.test.ts` tiene una asercion que compara el numero de entradas de su inventario con
**el numero de `insert into public.notifications` que hay en disco**. La Fase 5 la escribio para que
el dia que apareciera un emisor nuevo, alguien tuviera que mirar si su clase podia colapsar con la de
otro del mismo aseo.

**Fallo al correr la suite**, con el mensaje que la Fase 5 le escribio: *"aparecio un emisor de
notifications sin clasificar en esta tabla: mira si su `type` puede colapsar con el de otro emisor
del mismo aseo"*. Cuatro emisores nuevos sin clasificar.

Veredicto de la revision que el test forzo: **ninguno colapsa con ninguno.** Los tres tipos de
reporte son clases distintas entre si y distintas de `no_puedo` y de `asignacion`, que es justo el
caso que D-05 existe para evitar. Inventario ampliado a 18 y el conteo de claves de 9 a 12.

**Y un matiz conceptual que el segundo fallo revelo:** el `insert` de la migracion 18 **no es un
emisor nuevo**. Es el MISMO `finish_cleaning` reescrito con `create or replace`. El conteo por lineas
en disco lo ve dos veces porque las dos migraciones quedan en el historial; la clave de colapso lo ve
como uno, que es lo correcto. Queda escrito en el comentario del inventario.

## Dos defectos propios que los tests encontraron

1. **`@ts-expect-error` solo cubre la linea siguiente.** El test de tipos del reporte tenia el objeto
   partido en varias lineas, asi que el error caia en la linea de `monto: 1` y la directiva quedaba
   sin usar. Con el objeto en una sola linea funciona. Queda anotado en el propio test.
2. Nada mas. La logica salio en verde a la primera, lo cual es esperable: es codigo puro con tests
   escritos antes.

## Senuelos corridos en los dos sentidos

| Senuelo | Resultado |
|---|---|
| **CHECK-01:** agrupar por tarea (`fila.id`) en vez de por cuarto | 3 tests en rojo, incluido el que nombra CHECK-01. Revertido: 19 en verde |
| Quitar un valor del `Record` de etiquetas de motivo | 1 error de `tsc` en `motivos.ts`. Revertido: limpio |

## Verificacion

| Puerta | Resultado |
|---|---|
| `test:unit` | **936 tests, 51 archivos, todos en verde** |
| `ci:arch` | los tres scripts en OK |
| `lint` | 0 errores, 2 avisos (la linea base preexistente) |
| `tsc --noEmit` | limpio, con los dos `@ts-expect-error` todavia necesarios |

## La duplicacion declarada, y donde se paga

`sinEvidenciaCompleta()` implementa **la misma regla** que
`public.aseo_sin_evidencia_completa()` de la migracion 18. Esta escrito en la cabecera del modulo con
sus dos razones: la de SQL la consume el dashboard del admin, que lee decenas de aseos agregados; la
de aqui la consume la pantalla del aseador, que ya tiene las filas delante.

**La mitigacion es el test de paridad del plan 06-10.** Este plan deja la deuda escrita, no
escondida.

## Decisiones tomadas al implementar

- **`progresoDeCuarto` devuelve `{hechas, total}` y no un porcentaje.** La cabecera del acordeon
  muestra `1/4` literal; devolver el porcentaje la obligaria a deshacerlo.
- **`cuartoNecesitaFoto` traduce D-05**: `requiere_foto` esta por TAREA en el schema, pero la
  evidencia se recoge por CUARTO. Sin esta funcion, el asistente pediria una foto por tarea, que es
  tres veces el trabajo para la misma prueba.
- **Las etiquetas del `no puedo` NO estan ancladas a un enum**, porque `decline_cleaning` recibe texto
  libre desde la Fase 1 y no se toca. Son dos fuentes distintas a proposito, y la del skip es la
  anclada porque es la que el admin va a contar.
