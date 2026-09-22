/**
 * `PanelPublicidad` — la columna 1 de `/login` (10-UI-SPEC.md §3, D10-2/D10-4).
 *
 * COMPONENTE DE SERVIDOR. Sin `'use client'`, sin estado y sin efectos: el
 * ciclo de grises son keyframes de CSS y cuesta CERO kilobytes en una pantalla
 * que se sirve a quien todavia no tiene sesion.
 *
 * POR QUE LA ANIMACION NO ES UN `setInterval`, y la razon no es el rendimiento:
 * el bloque de `prefers-reduced-motion` de `app/globals.css` actua sobre
 * `animation-duration` y `transition-duration`, o sea alcanza a CSS y **no
 * puede alcanzar a un temporizador de JavaScript**. Un `setInterval` le seguiria
 * cambiando el color a quien pidio expresamente que no se lo cambien. Es una
 * regresion de accesibilidad invisible en revision de codigo.
 *
 * POR QUE `bg-anuncio-1` NO ES REDUNDANTE con los keyframes (10-UI-SPEC §7.3,
 * trampa 3 de §11.5): con `animation-duration: 0s` y `animation-fill-mode: none`
 * (el de fabrica) NINGUN keyframe queda aplicado, asi que el elemento se pinta
 * con su propio `background-color`. Quitar `bg-anuncio-1` por "duplicado" deja
 * un rectangulo transparente sobre `--canvas` -- el panel DESAPARECIDO -- justo
 * para el usuario que pidio menos movimiento.
 *
 * El slot es `children` y hoy nadie le pasa nada: eso no es un olvido, es la
 * diferencia entre un slot y un rectangulo, y es lo unico que D10-4 pide
 * preparar. Conteo de impresiones, rotacion de creativos, orden de anunciantes,
 * estado sin anunciante y `<a>` envolvente son la pregunta abierta 2 de
 * `10-CONTEXT.md` y NO se responden aca.
 */
export function PanelPublicidad({ children }: { children?: React.ReactNode }) {
  return (
    // Es un `<div>` y NO un `<aside>` a proposito (10-UI-SPEC §10.1): una
    // landmark `complementary` con `aria-hidden="true"` se anuncia en el indice
    // de regiones y no tiene contenido que ofrecer.
    //
    // `hidden lg:block` y no renderizado condicional (§2.4): conocer el viewport
    // exige cliente, y el panel apareceria despues de la primera pintura con un
    // salto visible. Con `display: none` la animacion tampoco avanza.
    <div
      aria-hidden="true"
      className="hidden place-items-center p-xl lg:grid"
      data-slot="panel-publicidad"
    >
      {/* CORRECCION 2026-09-19, del dueno mirando la pantalla: con `size-full` la
          tarjeta se estiraba a todo el alto de la columna y su forma la decidia
          el viewport, no el diseno -- 483x711, un 0.68 que se lee desproporcionado.
          Medida otra vez la referencia de GlossGenius que D10-3 adopta, su tarjeta
          es 337x363 = **0.93** y ocupa el 82% del alto, con aire arriba y abajo.
          No toca ni el techo ni el piso: tiene forma propia.

          `aspect-[0.93]` la reproduce. `max-h-full` la deja encogerse por alto en
          vez de desbordar cuando la ventana es baja, y el `place-items-center` del
          padre la centra en los dos ejes -- de ahi sale el aire, sin margenes que
          calcular. A 1180px de ancho: 531x571 con 70px de aire arriba y abajo.

          `rounded-2xl` = 10.8px, un escalon por encima del `rounded-xl` de la
          primitiva `Card`, porque es la superficie mas grande del producto y el
          radio de una tarjeta de 400px se pierde en ella. Sin `will-change`: un
          `background-color` de 20s no necesita capa propia y reservaria memoria
          de video para siempre. */}
      <div
        className="aspect-[0.93] max-h-full w-full overflow-hidden rounded-2xl bg-anuncio-1 animate-anuncio"
        data-slot="anuncio"
      >
        {children}
      </div>
    </div>
  );
}
