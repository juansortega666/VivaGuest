import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ListaDePagos } from '@/app/(cleaner)/_components/ListaDePagos';
import { leerMisPagosCerrados } from '@/lib/data/pagos-aseador';
import { hoyBog } from '@/lib/domain/dates';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Mis pagos · VivaGuest',
};

/**
 * `/mis-pagos` — LO QUE EL ASEADOR VE DE SU DINERO, Y ES TODO LO QUE VE
 * (FIN-04, D7-4.3, 07-UI-SPEC §10.3).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * LA REGLA QUE ORDENA ESTA PANTALLA ES CITA LITERAL DEL DUENO:
 *
 *     «El aseador ve lo que le llega y punto.»
 *
 * Sus periodos ya cerrados, cuanto se le paga y de que se compone. Nada de lo
 * que se le cobra a nadie, ninguna diferencia, y ningun pago de otra persona.
 *
 * ── ESTA PANTALLA NO ES LA FRONTERA: ES LA TERCERA CAPA ───────────────────
 *
 * La primera es la funcion de base con sus tres guardas dentro del cuerpo. La
 * segunda es que las tablas del pago no tienen NINGUNA columna de huesped. Esta
 * es la que se puede verificar leyendo el diff, y por eso importa que se lea
 * facil: aqui no se filtra nada en el render. Lo que no llega, no llega.
 *
 * ── EL ANO DE HOY SE RESUELVE AQUI, UNA VEZ, Y BAJA POR PROPS ─────────────
 *
 * Misma disciplina que el instante de lectura del home: una pantalla tiene una
 * sola marca de tiempo. Si cada tarjeta leyera el reloj por su cuenta, dos
 * tarjetas de la misma lista podrian responder distinto a la misma pregunta.
 *
 * ── NO HAY GUARD DE SESION PROPIO, Y ES CORRECTO ──────────────────────────
 *
 * El layout de este arbol ya lo aplica, y la frontera de verdad esta en la
 * funcion de base, que comprueba contra el perfil EN VIVO que la cuenta sigue
 * activa. Una desactivacion surte efecto en la siguiente consulta, no cuando
 * expire el token.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Copy literal del contrato (§15.2). */
const VOLVER = 'Volver a mis aseos';
const TITULO = 'Mis pagos';

export default async function MisPagosPage() {
  const supabase = await createClient();

  const pagos = await leerMisPagosCerrados(supabase);
  const anioDeHoy = hoyBog().slice(0, 4);

  return (
    <>
      {/*
        EL REGRESO VA ARRIBA DEL TITULO Y NO EN UNA BARRA (§10.2). Este arbol no
        tiene navegacion persistente y esta fase no la inventa, asi que el unico
        camino de vuelta es explicito y nombra su destino: «Volver» a secas
        obliga a recordar de donde se venia.
      */}
      <Link
        href="/mis-aseos"
        className="transicion flex min-h-toque items-center gap-xs text-body-movil text-muted-foreground"
      >
        <ArrowLeft size={20} strokeWidth={2} aria-hidden="true" />
        {VOLVER}
      </Link>

      <h1 className="text-display-movil text-foreground">{TITULO}</h1>

      <ListaDePagos pagos={pagos} anioDeHoy={anioDeHoy} />
    </>
  );
}
