/**
 * `PanelPublicidad` — la columna 1 de `/login` (10-UI-SPEC.md §3, D10-4).
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
 *
 * DONDE VIVE EL CORTE DE `lg:`, Y POR QUE YA NO ESTA AQUI. Desde el rediseno del
 * 2026-09-26 el breakpoint lo declara el envoltorio `data-slot="columna-anuncio"`
 * de `page.tsx`, no la raiz de este componente, porque el wordmark blanco que va
 * ENCIMA del panel tiene que desaparecer con el: dos declaraciones del mismo
 * corte en dos sitios se desincronizan a la primera. Lo que D10-6 compra sigue
 * intacto: el corte es CSS y no renderizado condicional (§2.4), asi que no hay
 * salto despues de la primera pintura, y con el ancestro en `display: none` la
 * animacion tampoco avanza.
 */
export function PanelPublicidad({ children }: { children?: React.ReactNode }) {
  return (
    // Es un `<div>` y NO un `<aside>` a proposito (10-UI-SPEC §10.1): una
    // landmark `complementary` con `aria-hidden="true"` se anuncia en el indice
    // de regiones y no tiene contenido que ofrecer.
    //
    // Y ojo con este `aria-hidden`: CUALQUIER texto que se meta aqui dentro
    // desaparece del arbol de accesibilidad sin que la pantalla cambie ni un
    // pixel. Por eso el wordmark del panel es HERMANO de este componente en
    // `page.tsx` y no hijo suyo.
    <div aria-hidden="true" className="size-full" data-slot="panel-publicidad">
      {/* DEROGACION 2026-09-26, del dueno con la referencia de Runway medida:
          el slot va A SANGRE COMPLETA. Pegado a los cuatro bordes de su columna,
          al 100% del alto, sin recuadro, sin radio y sin forma propia.

          Lo que se deroga es la CORRECCION 2026-09-19, que metia el placeholder
          en una tarjeta de `aspect-[0.93]` con `max-h-full` y `rounded-2xl`
          centrada por `place-items-center`, copiando la proporcion de la tarjeta
          de GlossGenius. Esa referencia tambien quedo derogada (D10-3). En la
          pantalla de acceso de Runway la imagen esta pegada a los cuatro bordes
          y ocupa el 100% del alto, sin superficie propia.

          Y con la tarjeta cae la razon de §3.2 por la que no se declaraba
          relacion de aspecto: ya no hace falta ninguna, el panel ES la mitad de
          la pantalla. Sin `will-change`: un `background-color` de 20s no necesita
          capa propia y reservaria memoria de video para siempre.

          `overflow-hidden` se queda para el dia que entre un creativo real, y
          `bg-anuncio-1` se queda porque es el estado de movimiento reducido. */}
      <div
        className="size-full overflow-hidden bg-anuncio-1 animate-anuncio"
        data-slot="anuncio"
      >
        {children}
      </div>
    </div>
  );
}
