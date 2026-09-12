---
phase: 06-pwa-del-aseador-offline-first
plan: 08
subsystem: ui-aseador
tags: [evidencia, camara, skip, d-05, d-06, check-03, check-04, pwa-07]

requires:
  - phase: 06-04
    provides: "`comprimirFoto`, `firmarSubida`, `registrarFoto` y las tres actions"
  - phase: 06-07
    provides: "la barra fija y el estado compartido del checklist"
provides:
  - "Ruta `/aseos/[id]/evidencia` con sus dos guardas de entrada"
  - "`WizardEvidencia`: un paso por cuarto que pide foto, sin atajos"
  - "`PasoDeFoto`: camara nativa, compresion antes de reservar ruta, fallo recuperable"
  - "`HojaSaltarCuarto` y `HojaChecklistIncompleto`"
  - "`e2e/aseo-evidencia.spec.ts`: 6 comprobaciones en navegador real"
affects: [06-09, 06-10]

tech-stack:
  added: []
  patterns:
    - "Comprimir ANTES de pedir la URL firmada: al reves quedan rutas reservadas sin llenar"
    - "Ruta propia para el asistente, para que el boton de atras del telefono vuelva al checklist"
    - "Fallo de red simulado con `page.route(...).fulfill({status:500})` como senuelo de conservacion"
---

# 06-08: El asistente de evidencia

## Que se construyo

Al tocar `Terminar aseo`, la aseadora entra a un asistente que le pide una foto por cuarto. Cuando no
puede fotografiar uno, lo dice con un motivo de lista cerrada. Nada se pierde por salir, por volver o
por un corte de senal.

## Las dos decisiones donde la fase se desvia del diseno original

**D-05: la foto se pide AL FINAL**, en un asistente, no a mitad del checklist. Por eso
`Terminar aseo` ya no termina nada: abre `/aseos/[id]/evidencia`, y quien cierra el aseo es el ultimo
paso de alli.

**D-06: se puede saltar un cuarto con motivo**, en vez de bloquear el fin del aseo. La razon esta
escrita y es de campo: un bloqueo deja a la aseadora atrapada y **termina en una llamada telefonica**,
que es justo lo que el producto elimina. La contrapartida es que quede marca, y es lo que se construyo.

## Por que aqui SI es asistente por pasos y en el checklist NO

Es el contraste que alguien va a cuestionar, asi que va escrito en el componente:

- El checklist es una **lista de trabajo**. El orden lo pone la realidad, no nosotros. Imponer pasos
  ahi hace que se marque todo de memoria al final.
- Esto es una **secuencia corta con un solo tipo de accion**: tomar una foto, repetida por cuarto. Cada
  pantalla dice que fotografiar y no hay nada mas que decidir.

## Tres reglas que parecen detalles y no lo son

**Comprimir va ANTES de pedir la ruta.** Al reves, un archivo que se resista a bajar de peso deja una
URL firmada emitida y una ruta reservada que nadie va a llenar. El criterio del plan lo mide por numero
de linea, y tenia razon en medirlo: el archivo se reordeno para que el orden de LECTURA espeje el de la
cadena, porque leerlo al reves invita a escribirlo al reves.

**Los cuartos que no piden foto no generan paso.** Una pantalla cuya unica accion posible es pasarla
ensena a tocar `Siguiente` sin mirar, y para cuando llega un cuarto que si importa ya se va en piloto
automatico.

**La ruta es propia, no un estado interno.** Por el boton de atras del telefono, que es el control mas
usado en un movil y el unico que no controlamos. Como estado interno, atras saca de la pantalla del
aseo a mitad de la evidencia. Cuesta un archivo y resuelve un gesto diario.

## Cero rojo al saltar, y el unico rojo autorizado

`HojaSaltarCuarto` no tiene una sola nota de rojo, verificado por grep. La aseadora **no hizo nada
malo**: reporto honestamente que no pudo. Pintarle rojo ensena, en tres semanas, a **no decirlo**: a
fotografiar cualquier cosa con tal de que la pantalla no la regane. Ahi se pierde el dato entero.

El unico rojo del plan es el fallo de subida, que si es un fallo del sistema.

Tambien queda escrita la decision descartada: **no hay minimo de 30 palabras**. Un contador se burla
solo (la gente escribe relleno) y castiga a quien tiene razon legitima pero corta, como *"el cuarto
estaba cerrado"*. Una lista cerrada, ademas, se puede contar.

## El criterio que el plan pedia comprobar a mano, comprobado con un senuelo

El plan decia: *"El ejecutor comprueba a mano que tras un fallo la previsualizacion sigue en pantalla"*.
Se hizo mejor que a mano: el test **provoca** el fallo interceptando la subida a Storage y
respondiendo 500, que es el corte de senal real a voluntad.

| Senuelo | Resultado |
|---|---|
| Descartar la foto al fallar la subida | `si la subida falla, la foto NO se pierde` **en rojo** |

Revertido, los 6 vuelven a verde. Sin ese senuelo, el test podria estar pasando por cualquier razon.

## Verificacion

| Puerta | Resultado |
|---|---|
| `test:unit` | 984 tests, 55 archivos en verde |
| `test:e2e` (`aseo-evidencia.spec.ts`) | **6 de 6**: las dos guardas de entrada, el filtrado de cuartos sin foto, la ausencia de atajos, el motivo obligatorio y la conservacion de la foto |
| `build` | OK, `/aseos/[id]/evidencia` listada (11,3 kB) |
| `ci:arch` | los tres scripts OK |
| `tsc --noEmit` | limpio |

## Dos criterios cuyo numero literal no cuadra, anotados en vez de forzados

1. **`grep -c "MOTIVOS_SKIP"` da 2, no 1.** Import mas uso: es el minimo natural. La mitad sustantiva
   —"los motivos no se escriben a mano en el componente"— se cumple: la lista se recorre, no se
   transcribe.
2. **`grep -c "cuartoNecesitaFoto"` da 2, no 1.** Igual. Se quito la tercera aparicion, que si sobraba
   (era una mencion en un comentario).

Ademas, `HojaChecklistIncompleto` lleva el copy literal de §8.1 **y** una forma singular
(`Te falta 1 tarea por marcar.`). El plan pedia las dos cadenas "sin variaciones"; la del contrato esta
verbatim. La singular se anade porque `Te faltan 1 tareas por marcar.` es una frase rota, y quien la lee
esta de pie frente a una puerta.

## La costura con 06-09

Hoy el ultimo `Continuar` **cierra el aseo**. El plan 06-09 intercala antes el paso de reporte y la
pantalla de cierre. Se dejo asi y no con un hueco a proposito: en este commit el producto esta completo
de punta a punta, y el reporte es OPCIONAL, o sea que este camino —terminar sin reportar nada— sigue
existiendo entero despues de 06-09. La costura esta marcada en `cerrarElAseo()`.
