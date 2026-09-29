import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { formatFechaCortaBog, sumarDias } from '@/lib/domain/dates';

/**
 * EL SELECTOR DE DÍA DE `/operacion` (D-05-1 del plan 10-05).
 *
 * `‹  Hoy  ›`. El día seleccionado gobierna la pantalla ENTERA: las cuatro
 * métricas del vistazo, la lista de la columna izquierda y la carga por aseador.
 * Antes de este control, el eje de la pantalla era "relativo a hoy" y estaba
 * codificado en la capa de datos (`agruparPorDia`), donde `Mañana` era un bloque.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * TRES ENLACES Y NO TRES BOTONES. La razón es la regla de la Fase 4 (`04-13`):
 * **lo que cambia QUÉ FILAS lee el servidor vive en la dirección**, y lo que solo
 * filtra lo ya traído vive en el cliente. Cambiar de día cambia el rango de la
 * consulta, así que va en la URL, y un enlace es lo que expresa eso sin un gramo
 * de JavaScript: funciona con el bundle todavía sin hidratar, se puede abrir en
 * otra pestaña, y se puede pegar en un chat.
 *
 * **Y hay además una razón medida para no usar botones:** `FiltroPeriodo` de
 * `/finanzas` es el control de parámetro que sí usa `router.push`, y arrastra el
 * fallo vivo del `deferred-items.md` de la Fase 7 (la transición que no se
 * completa nunca y deja el contenedor en `aria-busy` para siempre). Un enlace no
 * tiene ese modo de fallo.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── LOS TRES `href` SE COMPONEN DE LOS PARÁMETROS VIVOS, NUNCA LITERALES ───
 *
 * `parametrosVivos` es la cola de la dirección que la página ya serializó SIN
 * `aseo`, el mismo mecanismo con el que la tarjeta compone su enlace de apertura.
 * Está medido en `08-02-MEDICION.md` §4.3 que un `href` con consulta literal borra
 * los parámetros del anfitrión, así que acá no se escribe ninguno: se parte de lo
 * vivo y se pisa `dia`.
 *
 * ── Y NAVEGAR DE DÍA CIERRA EL DETALLE ABIERTO, A PROPÓSITO ────────────────
 *
 * Se decide acá y se escribe: `aseo` NO viaja en estos tres enlaces. Un detalle
 * abierto de un aseo del martes encima de la lista del viernes es una pantalla que
 * se contradice consigo misma. Sale gratis porque `parametrosVivos` ya viene sin
 * `aseo`; lo que no sale gratis es darse cuenta, y de ahí este párrafo.
 *
 * ── `scroll={false}` EN LOS TRES ──────────────────────────────────────────
 *
 * La razón de §5.2, ya escrita seis veces en este árbol: es la MISMA pantalla con
 * otro día, y mandar el scroll al tope en cada clic hace perder el sitio.
 *
 * ── LOS NOMBRES ACCESIBLES DICEN A QUÉ DÍA LLEVAN ─────────────────────────
 *
 * Un chevron solo no dice nada. Y el del centro respeta WCAG 2.2 SC 2.5.3 (label
 * in name): su nombre accesible CONTIENE su texto visible, porque un
 * `aria-label="Volver a hoy"` sobre un enlace que dice `5 sep` deja al dictado por
 * voz sin forma de nombrarlo.
 */
export function SelectorDeDia({
  dia,
  hoy,
  parametrosVivos,
}: {
  /** El día efectivo de la pantalla, ya validado y ya caído a hoy si hacía falta. */
  dia: string;
  /** El día de negocio de Bogotá, el mismo que usó la ventana de la consulta. */
  hoy: string;
  /** La cola de la dirección sin `aseo`, tal como la compone `page.tsx`. */
  parametrosVivos: string;
}) {
  const anterior = sumarDias(dia, -1);
  const siguiente = sumarDias(dia, 1);
  const esHoy = dia === hoy;

  const cortaDelCentro = esHoy ? 'Hoy' : formatFechaCortaBog(dia);

  return (
    <div
      data-slot="selector-dia"
      // `role="group"` y no `nav`: es un control de la cabecera de la pantalla, no
      // la navegación del sitio. Un segundo landmark de navegación al lado del de
      // la barra superior obliga a quien usa lector de pantalla a distinguir dos
      // cosas que no son la misma.
      role="group"
      aria-label="Día de la operación"
      className="flex items-center gap-xs"
    >
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Ver el día anterior, ${formatFechaCortaBog(anterior)}`}
        render={<Link href={rutaAlDia(parametrosVivos, anterior)} scroll={false} />}
      >
        <ChevronLeft className="size-4" strokeWidth={2} aria-hidden="true" />
      </Button>

      {/*
        `tabular-nums` (§3), por lo mismo que la etiqueta de `FiltroPeriodo`: el
        rótulo lleva números y cambia en cada clic, y sin numerales tabulares
        `5 sep` y `8 sep` no miden igual.

        SIN ancho mínimo, y eso es una concesión escrita, no un olvido: `Hoy` y
        `11 sep` no miden lo mismo, así que el grupo cambia de ancho al salir de
        hoy. Fijarlo pediría un token de ancho nuevo y ninguno de los que hay
        significa esto; y como el grupo está pegado al borde derecho de la
        cabecera, lo que se mueve es su borde izquierdo y no los tres controles
        entre sí. Si molesta al verlo, es un token y una clase.
      */}
      <Button
        variant="ghost"
        aria-label={esHoy ? undefined : `${cortaDelCentro} · volver a hoy`}
        render={<Link href={rutaAlDia(parametrosVivos, hoy)} scroll={false} />}
        className="tabular-nums"
      >
        {cortaDelCentro}
      </Button>

      <Button
        variant="ghost"
        size="icon"
        aria-label={`Ver el día siguiente, ${formatFechaCortaBog(siguiente)}`}
        render={<Link href={rutaAlDia(parametrosVivos, siguiente)} scroll={false} />}
      >
        <ChevronRight className="size-4" strokeWidth={2} aria-hidden="true" />
      </Button>
    </div>
  );
}

/**
 * La dirección de la pantalla para otro día, conservando lo que ya estaba.
 *
 * Se parte de los parámetros vivos y se PISA `dia`. Construirla desde cero
 * borraría cualquier otro parámetro que la pantalla llegue a gobernar, que es
 * exactamente el defecto que `08-02-MEDICION.md` §4.3 midió con el enlace del
 * panel.
 */
function rutaAlDia(parametrosVivos: string, dia: string): string {
  const busqueda = new URLSearchParams(parametrosVivos);
  busqueda.set('dia', dia);
  return `/operacion?${busqueda.toString()}`;
}
