import { Button } from '@/components/ui/button';

import { IconoInstagram, IconoTikTok } from './IconosRedes';

/**
 * El pie de `/login`: el copyright y los dos iconos de redes deshabilitados.
 * D10-5 y 10-UI-SPEC §8. Componente de servidor: sin estado, sin efectos.
 *
 * TRES COSAS QUE HAY QUE SABER ANTES DE TOCAR ESTE ARCHIVO, y ninguna es opcional.
 *
 * 1. EL ANO LLEGA POR PROP, Y ESTE COMPONENTE NO LEE EL RELOJ. El unico sitio de
 *    la pantalla que lo lee es `page.tsx`, con `hoyBog()` de `lib/domain/dates.ts`
 *    (§8.2). No es preferencia de estilo: `new Date()` aca se equivoca de dos
 *    formas y las dos se ven bien en desarrollo. Una, el proceso corre en UTC en
 *    Vercel y en CI, asi que el 31 de diciembre a las 19:00 de Bogota el pie
 *    adelantaria el ano durante cinco horas, de noche, una vez al ano. Dos,
 *    `/login` era HTML prerenderizado y nunca revalidado, asi que el ano se
 *    congelaria en el del deploy. La consecuencia buena de recibirlo por prop es
 *    que el pie es VERIFICABLE sin intervenir el tiempo: su prueba le pasa 1999.
 *
 * 2. LOS BOTONES VAN `disabled` DE VERDAD, NO `aria-disabled`. Un elemento con
 *    `aria-disabled` y sin `disabled` sigue siendo enfocable, y eso es una trampa
 *    de foco exacta: un control que recibe foco, se anuncia como no disponible y
 *    no hace nada al pulsar Enter (§10.3 regla 2, y seria una infraccion de WCAG
 *    2.1.1). Con `disabled` nativo el motor los saca del orden de tabulacion sin
 *    CSS. Base UI emite ademas `tabindex="0"` por su cuenta: es inocuo, porque un
 *    `<button disabled>` no es enfocable por especificacion, y por eso la prueba
 *    unitaria afirma el atributo y deja la consecuencia al carril E2E de 10-03.
 *    Y NO se escribe `tabIndex` a mano ni se envuelven en algo enfocable.
 *
 * 3. EL CONTRASTE DE LOS ICONOS DESHABILITADOS ES 2.09:1, Y ESTA EXENTO. El gris
 *    de `--muted-foreground` al 50% de opacidad sobre `--canvas` queda por debajo
 *    de 4.5:1, y WCAG 1.4.3 excluye EXPRESAMENTE los componentes inactivos. Es el
 *    UNICO uso de esa exencion en todo el producto (§10.4), y queda escrito aca
 *    para que un auditor no lo reporte como hallazgo nuevo. El estado no se
 *    comunica solo por color: llevan opacidad mas nombre accesible.
 *
 * Dos detalles de forma que tampoco son gratis:
 *   - El padding vertical se anula a partir de `lg:`. Con `lg:h-barra` el alto es
 *     fijo en 56px y el padding va por dentro de la caja: un `py-lg` que sobreviva
 *     dejaria 24px de area de contenido para un boton de 28px.
 *   - El cursor no se toca. `app/globals.css` ya limita `cursor: pointer` a
 *     `button:not(:disabled)`, asi que un deshabilitado conserva el cursor por
 *     defecto sin escribir nada.
 *
 * Y una que es decision, no olvido: sin borde superior y sin fondo propio. D10-5
 * dice "nada mas", y la separacion visual ya la dan el borde inferior de la
 * tarjeta del anuncio y el aire bajo el bloque del login (§8.1).
 */
export function PieDeLogin({ anio }: { anio: string }) {
  return (
    <footer className="flex flex-col items-center gap-sm px-lg py-lg lg:h-barra lg:flex-row lg:justify-between lg:px-xl lg:py-0">
      <p className="text-micro text-muted-foreground">
        © {anio} VivaGuest. Todos los derechos reservados.
      </p>

      <div className="flex items-center gap-xs">
        <Button
          variant="ghost"
          size="icon-sm"
          disabled
          aria-label="Instagram, aún no disponible"
        >
          <IconoInstagram aria-hidden="true" />
        </Button>
        <Button variant="ghost" size="icon-sm" disabled aria-label="TikTok, aún no disponible">
          <IconoTikTok aria-hidden="true" />
        </Button>
      </div>
    </footer>
  );
}
