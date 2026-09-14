import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import {
  DesgloseDeMiPago,
  type GastoConRecibo,
} from '@/app/(cleaner)/_components/DesgloseDeMiPago';
import { Button } from '@/components/ui/button';
import { leerMiDesglose } from '@/lib/data/pagos-aseador';
import { firmarRecibo } from '@/lib/data/recibos';
import { hoyBog } from '@/lib/domain/dates';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Mi pago · VivaGuest',
};

/**
 * `/mis-pagos/[id]` — DE QUE SE COMPONE LO QUE LE LLEGA (FIN-04, §10.4).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * EL IDENTIFICADOR VIENE DEL SEGMENTO DINAMICO, O SEA DE FUERA.
 *
 * `leerMiDesglose()` comprueba su forma ANTES de consultar, como ya hace la
 * ficha del aseo: sin esa guarda la base responde con un error de sintaxis y la
 * pantalla se cae con un error de servidor en vez de con su estado de ausencia.
 *
 * ── LOS CASOS DE DENEGACION SE TRATAN TODOS IGUAL, Y ES DELIBERADO ────────
 *
 * No existe, no es tuyo, o su periodo no esta cerrado: **se ven identicos**.
 * Distinguirlos convertiria esta direccion en un oraculo de enumeracion de
 * pagos ajenos —quien probara identificadores al azar aprenderia cuales
 * existen—, que es la misma razon por la que el RPC del codigo de acceso lanza
 * una sola denegacion para sus tres casos.
 *
 * Y no es un 404 del framework: eso es una pantalla del sistema, en ingles de
 * plantilla, sin salida y sin explicacion. Aqui hay algo concreto que decir y un
 * sitio concreto a donde volver.
 *
 * ── LA FIRMA DEL RECIBO OCURRE AQUI, EN EL SERVIDOR ──────────────────────
 *
 * La capa de lectura devuelve el bucket y la ruta porque el servidor los
 * necesita para firmar. **Al telefono solo baja la URL ya firmada**, con vida de
 * cinco minutos. En un bucket privado la ruta es, por si sola, una
 * autorizacion: quien la conoce puede pedir que se la firmen.
 *
 * Cuando la foto ya no existe, la firma no se emite y la pantalla lo explica en
 * vez de dejar una imagen rota. Es el punto que solo se puede comprobar en un
 * telefono de verdad, con un recibo ya purgado.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Copy literal del contrato (§15.2). */
const VOLVER = 'Volver a mis pagos';

/** La ausencia unica. Ni confirma ni niega que el identificador exista. */
const AUSENTE_TITULO = 'Este pago no está disponible.';
const AUSENTE_CUERPO = 'Vuelve a Mis pagos y ábrelo desde la lista.';
const AUSENTE_CTA = 'Ir a mis pagos';

export default async function MiPagoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const desglose = await leerMiDesglose(supabase, id);

  if (desglose === null) {
    return (
      <div className="flex flex-col gap-lg">
        <h1 className="text-display-movil text-foreground">{AUSENTE_TITULO}</h1>
        <p className="text-body-movil text-muted-foreground">{AUSENTE_CUERPO}</p>

        <Button className="min-h-toque w-full text-body-movil" render={<Link href="/mis-pagos" />}>
          {AUSENTE_CTA}
        </Button>
      </div>
    );
  }

  /**
   * Las firmas se piden EN PARALELO y no en serie: son llamadas de red
   * independientes, y encadenarlas sumaria su latencia en la unica pantalla de
   * esta fase que se abre con datos moviles.
   */
  const gastos: GastoConRecibo[] = await Promise.all(
    desglose.gastos.map(async (gasto) => {
      const firmado = await firmarRecibo(supabase, gasto.recibo);

      return {
        concepto: gasto.concepto,
        fecha: gasto.fecha,
        monto: gasto.monto,
        // La ruta se queda aqui. Lo que cruza la frontera es la URL o nada.
        urlDelRecibo: firmado.estado === 'firmado' ? firmado.url : null,
      };
    }),
  );

  return (
    <>
      <Link
        href="/mis-pagos"
        className="transicion flex min-h-toque items-center gap-xs text-body-movil text-muted-foreground"
      >
        <ArrowLeft size={20} strokeWidth={2} aria-hidden="true" />
        {VOLVER}
      </Link>

      <DesgloseDeMiPago
        pago={desglose.pago}
        aseos={desglose.aseos}
        gastos={gastos}
        anioDeHoy={hoyBog().slice(0, 4)}
      />
    </>
  );
}
