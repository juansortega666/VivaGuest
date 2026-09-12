---
phase: 06-pwa-del-aseador-offline-first
plan: 06
subsystem: ui-aseador
tags: [home, pwa-01, pwa-04, pwa-05, d-01, d-02, rls]

requires:
  - phase: 01
    provides: "`start_cleaning` y `decline_cleaning`, construidas desde la migracion 09. Esta fase no crea RPC: faltaba la pantalla"
  - phase: 05
    provides: "El arbol `(cleaner)` con su layout, guard de sesion, banner de avisos y la escala tipografica movil con su guardarrail"
  - phase: 06-03
    provides: "`MOTIVOS_NO_PUEDO`, `ETIQUETAS_NO_PUEDO` y `exigeNota`"
  - phase: 06-05
    provides: "`radio-group` saneada y los tokens de la fase"
provides:
  - "`lib/data/aseos-del-aseador.ts` con `leerAseosDeHoy` y `ordenarParaElHome`, probado"
  - "`/mis-aseos` deja de ser stub: lista los aseos del dia"
  - "La hoja de dos opciones de D-02: comenzar, o reportar que no puede"
  - "`comenzarAseo` y `devolverAseo` en las Server Actions del arbol"
affects: [06-07, 06-08, 06-10]

tech-stack:
  added: []
  patterns:
    - "El orden de producto se hace EN MEMORIA y no con order de PostgREST: 'el en curso primero' no es una columna, y ponerlo en la base lo esconde de los tests"
    - "Un test que afirma que la funcion NO filtra por usuario deja escrito DONDE vive la frontera de autorizacion"
    - "La tarjeta entera es un button y no un div con manejador: area grande, focalizable y anunciable"
---

# 06-06: El home del aseador

## Que se construyo

`/mis-aseos` con contenido real, la tarjeta, la hoja de dos opciones y las dos Server Actions.

## Lo que ya existia y no habia que construir

`start_cleaning` y `decline_cleaning` llevan construidas desde la migracion 09 de la Fase 1, **con su
guarda de pertenencia y su notificacion al admin**. PWA-05 estaba cubierto en la base desde entonces;
lo unico que faltaba era la pantalla. Este plan no crea ningun RPC.

## Las dos decisiones de flujo que se implementaron

**D-01: la lista es en plural.** Una aseadora puede tener tres aseos el mismo dia, y una sola tarjeta
esconderia los otros dos. Los de manana se **cuentan** en una linea al pie pero no entran a la lista:
hoy no son accionables.

**D-02: tocar la tarjeta NO entra al aseo.** Sube una hoja con `Comenzar aseo` y
`Reportar que no puedo`. La razon esta escrita en el componente porque es exactamente lo que alguien
va a querer "simplificar": **el aseador sabe que no puede ANTES de empezar, no a mitad**, y enterrar
esa salida dentro del checklist lo obliga a entrar, buscar y salir.

Y el caso que faltaba definir: **si el aseo ya esta en curso**, la principal dice `Seguir con el aseo`
y la secundaria **desaparece**. Ofrecer devolver un aseo empezado seria ofrecer deshacer trabajo ya
hecho.

## El orden del home es una regla de producto, y por eso se prueba

1. El `en_curso` primero, **aunque su hora limite sea mas tarde**.
2. Despues por hora limite ascendente.
3. Los terminados de hoy al final, **pero no desaparecen**: verlos en verde confirma que quedaron
   hechos.

Se ordena en memoria y no con `order` de PostgREST: "el en curso primero" no es una columna, y
ponerlo en la base lo esconde de los tests.

**Senuelo corrido en los dos sentidos:** ordenar solo por hora limite pone **2 tests en rojo**,
incluido el que dice que el aseo abierto va arriba. Revertido: 11 en verde.

## Un test que documenta donde vive la frontera

La consulta **no filtra por aseador**, y hay un test que lo afirma: con filas ajenas en el doble, la
funcion las devuelve. **Eso es correcto.** La policy `cleanings_cleaner_select` ya lo hace, y un
segundo filtro en TypeScript seria un segundo sitio donde equivocarse.

Escribirlo como asercion es lo que impide que alguien "arregle" el supuesto olvido mas adelante.

## Verificacion

| Puerta | Resultado |
|---|---|
| `test:unit` | **978 tests, 55 archivos en verde** |
| `build` | OK. `/mis-aseos` paso de stub a 11,5 kB |
| `ci:arch` | los tres scripts en OK, incluido el de la escala movil |
| `tsc --noEmit` | limpio |

Criterios del plan, todos en cero donde debian: sin rojo en la tarjeta ni en la lista, sin contador de
pendientes, sin `AlertDialog` en la hoja de no poder, sin `revalidatePath`, sin `exigirAdmin` en el
arbol del aseador.

## Decisiones tomadas al implementar

- **La tarjeta es un `button`, no un `div` con manejador.** El area es grande a proposito y tiene que
  ser focalizable por teclado y anunciable. Y **no hay ningun boton dentro**: dos destinos de toque
  anidados en 44 px son un toque equivocado esperando a pasar.
- **`presentacionDe()` lanza en vez de inventar una etiqueta** cuando el estado es inalcanzable. Misma
  regla que `estadoDeAseo()`: un badge que miente sobre un aseo es peor que una pantalla que se cae.
- **Devolver el aseo va en `outline` y sin dialogo de confirmacion.** No es destructivo: el aseo
  vuelve a la bandeja y el admin lo reasigna. La hoja con motivo obligatorio ya es la confirmacion.
- **El mensaje dice "el administrador ya lo sabe", no "ya le llego".** `decline_cleaning` escribe la
  notificacion en la misma transaccion, asi que el registro es cierto; la entrega no se puede afirmar
  porque el drenaje es asincrono. Es la regla de `05-UI-SPEC.md` §11.4.
