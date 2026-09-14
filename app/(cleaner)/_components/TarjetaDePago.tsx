import { CircleCheck } from 'lucide-react';
import Link from 'next/link';

import type { MiPagoCerrado } from '@/lib/data/pagos-aseador';
import { diaBog, formatFechaLargaBog } from '@/lib/domain/dates';
import { etiquetaDePeriodoDePago } from '@/lib/domain/mes';
import { formatCOP } from '@/lib/domain/money';

/**
 * Una tarjeta de `/mis-pagos` (07-UI-SPEC §10.3).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * TODA LA TARJETA ES EL DESTINO DEL TOQUE, y es un enlace de verdad y no un
 * bloque con manejador: navega a otra direccion, asi que tiene que poder
 * abrirse en otra pestana, anunciarse como enlace y recibir el foco.
 *
 * No hay ningun control DENTRO, misma regla que la tarjeta del home: dos
 * destinos de toque anidados en un area de 44px son un toque equivocado
 * esperando a pasar.
 *
 * ── LAS DOS FECHAS DEL PERIODO, SIEMPRE, Y NUNCA SOLO EL MES (D7-5) ───────
 *
 * El periodo va de cierre a cierre y no coincide con el mes calendario. Un
 * recibo que dice «enero» y cubre del 1 al 30 sin decirlo es una discusion
 * esperando a ocurrir, y la persona que la tendria es la que cobra.
 *
 * ── EL TOTAL ES EL ANCLA VISUAL DE LA PANTALLA ────────────────────────────
 *
 * Es la unica cifra al tamano de titulo de toda la lista. Con numerales
 * tabulares, obligatorio en toda cifra del producto: sin ellos las cifras de
 * dos tarjetas seguidas no se pueden comparar de un vistazo porque los digitos
 * no caen en la misma columna.
 *
 * ── EL ESTADO NO DEPENDE SOLO DEL COLOR ───────────────────────────────────
 *
 * El pagado lleva su icono ademas del verde. Alguien que no distingue el verde
 * del naranja tiene que poder leer la diferencia, y ademas el texto ya la dice.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** El copy es literal del contrato (§15.2). No se parafrasea. */
const PENDIENTE = 'Pendiente de pago';

export function TarjetaDePago({
  pago,
  anioDeHoy,
}: {
  pago: MiPagoCerrado;
  /**
   * El ano del dia de negocio, resuelto UNA vez en la pagina y bajado por props.
   *
   * Decide si el rotulo lleva ano. Saberlo exige leer el reloj, y un componente
   * de presentacion que lo lee es la dependencia oculta que `lib/domain/dates.ts`
   * existe para evitar: dos tarjetas de la misma lista podrian responder distinto
   * a la misma pregunta si la lectura cayera justo en el cambio de ano.
   */
  anioDeHoy: string;
}) {
  // El ano solo aparece cuando el periodo NO es de este ano. La funcion lo
  // escribe igual cuando el periodo cruza el ano, y ahi no es opcional: «Del 30
  // de diciembre al 31 de enero» no es escueto, es falso.
  const rotulo = etiquetaDePeriodoDePago(pago.desde, pago.hasta, pago.hasta.slice(0, 4) !== anioDeHoy);

  // El instante se convierte al dia de Bogota ANTES de formatear. Un
  // `timestamptz` de las 20:00 del 2 de febrero en UTC es todavia el 2 en
  // Bogota, y formatear el instante crudo lo correria un dia.
  const diaDelPago = diaBog(pago.pagadoAt);

  return (
    <Link
      href={`/mis-pagos/${pago.payoutId}`}
      className="transicion flex min-h-toque w-full flex-col gap-xs rounded-md border border-border bg-background p-lg"
    >
      <span className="text-body-movil text-muted-foreground">{rotulo}</span>

      <span className="text-display-movil tabular-nums text-foreground">
        {formatCOP(pago.total)}
      </span>

      {diaDelPago === null ? (
        <span className="text-micro-movil text-status-warn">{PENDIENTE}</span>
      ) : (
        <span className="flex items-center gap-xs text-micro-movil text-status-ok">
          <CircleCheck size={20} strokeWidth={2} aria-hidden="true" />
          {`Te lo pagaron el ${formatFechaLargaBog(diaDelPago)}`}
        </span>
      )}
    </Link>
  );
}
