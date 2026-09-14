import { Wallet } from 'lucide-react';

import { EstadoVacio } from '@/app/(admin)/_components/EstadoVacio';
import type { MiPagoCerrado } from '@/lib/data/pagos-aseador';

import { TarjetaDePago } from './TarjetaDePago';

/**
 * La lista de `/mis-pagos` (07-UI-SPEC §10.3 y §12.1 fila 8).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * LA NOTA AL PIE NO ES DECORACION: ES LO QUE EXPLICA UNA AUSENCIA.
 *
 * Esta pantalla no muestra el periodo en curso (D7-4.3), y esa ausencia es
 * visible: quien abra la app un 20 de septiembre no va a ver septiembre. Sin la
 * nota, la pregunta llega igual, solo que por WhatsApp y a deshora.
 *
 * El motivo de la ausencia, para quien lea esto y quiera «arreglarla»: el
 * acumulado del periodo en curso se mueve y puede BAJAR, porque si se cancela un
 * aseo ya contado el numero baja. Un numero que baja en el telefono de quien lo
 * va a cobrar es una discusion garantizada. Lo cerrado no cambia nunca (D7-3),
 * asi que es lo unico que se puede ensenar sin ambiguedad.
 *
 * ── EL VACIO NO ES UN COMPONENTE NUEVO ────────────────────────────────────
 *
 * Es el octavo vacio del producto y usa el mismo `EstadoVacio` que los otros
 * siete, con su variante de escala del telefono. `04-UI-SPEC.md` §15.1 prohibe
 * explicitamente escribir un segundo: dos se desincronizan en el primer cambio
 * de copy. Su cuerpo explica el MECANISMO —cuando va a aparecer el primero— en
 * vez de dejar una pantalla en blanco esperando algo que nadie sabe que llega
 * solo.
 *
 * ── ORDEN ──────────────────────────────────────────────────────────────────
 *
 * De la mas reciente a la mas antigua, y lo fija la funcion de base. Aqui no se
 * reordena: un segundo sitio donde el orden puede estar mal.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Copy literal del contrato (§15.2 y §12.1 fila 8). No se parafrasea. */
const NOTA_AL_PIE = 'Solo aparecen los periodos ya cerrados.';
const VACIO_ENCABEZADO = 'Todavía no tienes pagos cerrados.';
const VACIO_CUERPO =
  'Cuando termine el mes vas a ver acá cuánto se te paga y de qué se compone.';

export function ListaDePagos({
  pagos,
  anioDeHoy,
}: {
  pagos: MiPagoCerrado[];
  anioDeHoy: string;
}) {
  if (pagos.length === 0) {
    // Sin la nota al pie: el cuerpo del vacio ya dice lo mismo y mejor, y
    // repetirlo debajo seria decirlo dos veces en una pantalla de seis lineas.
    return (
      <EstadoVacio movil icono={Wallet} encabezado={VACIO_ENCABEZADO} cuerpo={VACIO_CUERPO} />
    );
  }

  return (
    <div className="flex flex-col gap-lg">
      <ul className="flex flex-col gap-lg">
        {pagos.map((pago) => (
          <li key={pago.payoutId}>
            <TarjetaDePago pago={pago} anioDeHoy={anioDeHoy} />
          </li>
        ))}
      </ul>

      <p className="text-micro-movil text-muted-foreground">{NOTA_AL_PIE}</p>
    </div>
  );
}
