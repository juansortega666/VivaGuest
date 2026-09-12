---
phase: 06-pwa-del-aseador-offline-first
plan: 07
subsystem: ui-aseador
tags: [checklist, acordeon, barra-fija, check-01, check-02, pwa-04, d-03, d-04, a11y]

requires:
  - phase: 05
    provides: "`/aseos/[id]` con su ficha, el codigo de acceso y el esqueleto de carga"
  - phase: 01
    provides: "`toggle_checklist_item` y `start_cleaning`, de la migracion 09; el checklist materializado por `confirm_cleaning`"
  - phase: 06-03
    provides: "`lib/domain/checklist.ts` entero y `ETIQUETAS_SKIP`"
  - phase: 06-04
    provides: "`marcarTarea` y `terminarAseo`"
  - phase: 06-05
    provides: "las primitivas saneadas y los tokens de la fase"
provides:
  - "`ChecklistPorCuarto` + `ProgresoDelAseo`: el acordeon y el unico dueno del estado"
  - "`CuartoAcordeon` y `FilaDeTarea`: la cabecera con contador y la casilla nativa de 48px"
  - "`BarraAccionAseo`: la barra fija que nunca se apaga, con la pregunta de §8.1"
  - "`leerAseoDelAseador()` trae el checklist y los cuartos saltados en el mismo viaje"
  - "`e2e/aseo-checklist.spec.ts`: la pantalla comprobada en un navegador de verdad"
affects: [06-08, 06-09, 06-10]

tech-stack:
  added: []
  patterns:
    - "`viewport-fit=cover` en el layout del arbol: sin el, `env(safe-area-inset-*)` vale CERO y la clase compila sin hacer nada"
    - "`scroll-mb-*` del alto de la barra fija en cada fila: el relleno de pagina no protege del desplazamiento"
    - "`pointer-events-none` en el cuadro decorativo de una casilla reducida a un pixel"
    - "Estado optimista en un proveedor por encima del checklist Y de la barra, no dentro de la fila"
---

# 06-07: El checklist en acordeon y la barra fija

## Que se construyo

`/aseos/[id]` deja de ser de solo lectura. Gana el checklist por cuarto (CHECK-01, CHECK-02) y la
barra de accion fija (D-04), conservando intactas la ficha y el codigo de acceso de la Fase 5.

## Las dos decisiones de flujo, implementadas

**D-03: acordeon y no asistente por pasos.** Se abren varios cuartos a la vez, ninguno se bloquea y se
hacen en cualquier orden. Las dos razones van escritas en el componente porque son justo lo que alguien
va a querer "ordenar": la aseadora **no limpia en orden fijo** (arranca por el bano porque es lo que
esta libre), y **ya hay un asistente por pasos despues**, el de la evidencia. Dos seguidos cansan.

Un cuarto completo **se recoge solo y no desaparece**: la cabecera se queda con el visto verde, que es
la unica confirmacion de que quedo hecho.

**D-04: la barra va fija abajo.** La razon es postural: esto se oprime de pie, con una mano. Un boton
al final de doce tareas obliga a bajar cada vez.

**Y el boton nunca se apaga.** Con el checklist a medias sale la pregunta de §8.1 con cuantas faltan y
dos salidas. La regla, literal: **un boton muerto no explica nada; una pregunta si.** Los toques
repetidos se descartan en el manejador y el rotulo dice que esta trabajando; apagar el control seria
justo lo derogado por D-06 entrando por la puerta de atras.

## La casilla es nativa, y no la primitiva del repo

`components/ui/checkbox.tsx` envuelve la de Base UI, que renderiza un `button` con rol de casilla.
§12.2 pide `input` real con `label` asociada, y la diferencia es practica: **la `label` hace que toda
la fila sea el destino del toque sin escribir un solo manejador**, que es exactamente lo que §7.3
exige, y lo hace el navegador.

Fila de 48px a ancho completo, cuadro visual de 20px. Son dos medidas distintas a proposito: con
guantes, una casilla de 20px es un toque fallido de cada tres, y el fallido cae en la fila de al lado.

## Tres defectos reales que solo aparecieron en el navegador

El test de Playwright de este plan encontro dos, y el tercero salio al pensar el primero. Ninguno lo
podia ver `tsc`, ni los unitarios, ni el build.

**1. El cuadro decorativo tapaba la casilla.** La casilla real va reducida a un pixel y el cuadro se
dibuja encima. Un dedo funciona —cae en el rotulo y el navegador reenvia— pero un click dirigido AL
control choca. Arreglo: `pointer-events-none` en el cuadro, que ademas es lo correcto porque el cuadro
ya esta oculto al arbol de accesibilidad.

**2. Al desplazar, la fila quedaba bajo la barra fija.** El relleno inferior de la pagina evita que la
ultima fila **nazca** debajo, pero no protege del desplazamiento: `scrollIntoView` no sabe que hay
72px opacos anclados al fondo. En el log de Playwright se ve literal como
`intercepts pointer events`. Arreglo: `scroll-mb-barra-aseo` en cada fila.

**3. `env(safe-area-inset-bottom)` valia cero, y el grep no lo veia.** Este es el mas importante
porque es **un verde falso de manual**: el criterio de aceptacion del plan pide
`grep -c "safe-area" >= 1`, y la clase estaba, compilaba y no hacia **nada**. Sin
`viewport-fit=cover` el navegador recorta el viewport al area segura y esa variable vale 0 siempre. El
defecto solo se ve en un iPhone con muesca, donde el boton comparte pixeles con el gesto de cambiar de
app: el toque **no termina el aseo, saca de la aplicacion**.

Se declaro `export const viewport = { viewportFit: 'cover' }` en el layout de este arbol, no en el
raiz: el shell del admin es de escritorio y no tiene ninguna superficie anclada al borde inferior.

## Donde vive el estado, y por que no en la fila

`ProgresoDelAseo` es el unico dueno. Marcar una tarea mueve **tres** contadores a la vez (la cabecera
del cuarto, el total de arriba y, en 06-08, el del asistente), asi que con el estado dentro de
`FilaDeTarea` los otros dos se quedarian atras. Se expone por contexto porque el otro consumidor es la
barra fija, que **no** es hija del checklist: vive fuera del flujo de lectura y la pagina las monta
como hermanas.

El componente **no agrupa, no ordena y no cuenta**: todo sale de `lib/domain/checklist.ts`.

## Dos comprobaciones que se corrieron al reves para saber que miden

| Senuelo | Resultado |
|---|---|
| Quitar `viewport-fit=cover` | el test de navegador **en rojo**, con `Expected substring: viewport-fit=cover` |
| Que la cabecera lea las filas del servidor y no las sobrescritas | el test del contador optimista **en rojo** |
| Quitar el normalizado de los embed nulos | `devuelve arreglos vacios cuando los embed llegan nulos` **en rojo** |

En los tres casos, revertido, todo vuelve a verde.

## El copy de compromiso de la Fase 5 se retiro

La ficha cerraba con una linea que le anunciaba al aseador que marcar el aseo y subir fotos llegaban
despues. **No era relleno**: sin ella, quien aterrizaba desde un aviso buscaba el boton de arranque, no
lo encontraba y concluia que la app estaba rota; la linea convertia un fallo aparente en una espera.
Ahora el trabajo esta justo debajo, asi que esa linea seria la unica afirmacion falsa de la pantalla.
**Se va por la misma razon por la que se puso.**

## Lo que se definio y no estaba en ningun sitio

Se llega de verdad a estos dos estados tocando un aviso viejo:

- **`pendiente`** -> el checklist se ve, no se marca, y la barra dice `Comenzar aseo`. Verlo antes de
  empezar no es adorno: es como la aseadora sabe cuanto trabajo hay y si le alcanza el tiempo.
- **`completada`** -> el checklist se ve, no se marca, y **no hay barra**. No hay ninguna accion que
  ofrecer sobre un aseo terminado.

## La lectura: un solo viaje

`leerAseoDelAseador()` trae el checklist y los cuartos saltados por embed en la misma consulta. Tres
consultas en paralelo serian mas codigo para el mismo resultado y ademas podrian ver estados distintos
de la base si alguien marca algo en medio. Los embed van **calificados** con su clave foranea por el
mismo criterio que el del apartamento: el dia que aparezca una segunda, PostgREST responde `PGRST201`
**en tiempo de ejecucion**, o sea con la pantalla del aseador caida en produccion.

`authenticated` tiene **unicamente** `select` sobre las dos tablas, asi que esta capa no puede escribir
ni por accidente.

## Verificacion

| Puerta | Resultado |
|---|---|
| `test:unit` | **984 tests, 55 archivos en verde** (+6 de los embed nuevos) |
| `test:e2e` (el spec de este plan) | **3 de 3 en verde**, en el build de produccion con sesion de aseadora |
| `build` | OK. `/aseos/[id]` paso de ~3 kB a **11,7 kB** |
| `ci:arch` | los tres scripts OK |
| `tsc --noEmit` | limpio |
| CSS compilado | `72px / 48px / 56px` en los tres tokens, y `padding-bottom:calc(var(--spacing-sm) + env(safe-area-inset-bottom))` emitido |

## Dos criterios del plan cuyo numero literal no se cumple, y por que

Se anotan en vez de forzar el codigo para que el grep cuadre.

1. **`grep -c "armarChecklist" ChecklistPorCuarto.tsx` da 2, no 1.** El minimo natural son dos lineas:
   el `import` y la llamada. Bajarlo a 1 exigiria renombrar el import para esconder la cadena, que es
   trucar el grep. La mitad sustantiva del criterio —"el archivo no contiene ninguna agrupacion propia
   ni conteo manual"— **si se cumple**: no hay un solo `reduce` ni `filter` sobre tareas en ese archivo.
   Ya se quito una tercera llamada que si sobraba (se agrupaba dos veces en el montaje).

2. **`grep -c "CodigoDeAcceso" page.tsx` da 0, no 1.** Nunca estuvo en la pagina: vive dentro de
   `TarjetaAseo.tsx`, que la pagina renderiza. El criterio real —"el contrato del codigo no se toco"—
   se cumple: ese componente no se modifico en su parte funcional.

## Lo que este plan NO trae, y de quien es

El asistente de evidencia con camara (06-08) y el paso de reporte (06-09). Hasta entonces la barra
termina el aseo directamente, y **la costura exacta esta marcada en el comentario de
`BarraAccionAseo.tsx`**: en 06-08 `confirmar()` deja de llamar a la accion de terminar y pasa a abrir
el asistente. Lo que no cambia en ese plan es la pregunta de §8.1 ni que el boton siga sin apagarse.

`e2e/aseo-checklist.spec.ts` se conserva en vez de borrarse: encontro dos defectos reales, y el E2E de
06-10 lo extiende en vez de empezar de cero.
