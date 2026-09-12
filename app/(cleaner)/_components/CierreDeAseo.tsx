'use client';

import Link from 'next/link';

import { Button } from '@/components/ui/button';

/**
 * LA PANTALLA DE CIERRE (§10).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * SIN CONFETI, SIN CELEBRACION, SIN ANIMACION DE ENTRADA.
 *
 * Y no es sobriedad por gusto: el movimiento permitido en este proyecto es
 * color, fondo, borde y opacidad, 120 ms (§12.3). Una pantalla de exito es justo
 * donde alguien va a querer meter una animacion, asi que queda escrito aqui.
 *
 * Hay ademas una razon de oficio: la aseadora acaba de terminar el cuarto aseo
 * del dia y va camino del quinto. Una celebracion de dos segundos, cinco veces
 * al dia, seis dias a la semana, es un obstaculo, no un premio.
 *
 * ── LA LINEA DE CUARTOS SIN FOTO ES HONESTIDAD, NO CASTIGO ────────────────
 *
 * Cuando quedaron cuartos saltados, se le dice **de frente y antes de salir**.
 * El precedente exacto es la nota de "quedo confirmado a mano" del asistente de
 * la Fase 5, y el criterio es el mismo: **decirlo cuesta menos que dejar que lo
 * descubra cuando el admin llame a preguntar**. Una sorpresa por telefono es
 * justo la coordinacion que este producto elimina.
 *
 * Va en ambar, no en rojo. Un aseo con cuartos saltados **no es un fallo**: es
 * un aseo del que sabemos mas, porque ella dijo por que. El rojo de este arbol
 * esta reservado a fallos del sistema (§4.2), y usarlo aqui ensenaria en tres
 * semanas a no reportar.
 * ════════════════════════════════════════════════════════════════════════════
 */

const TITULO = 'Listo.';
const VOLVER = 'Volver a mis aseos';

/** El aviso de §14.1, literal. */
function avisoDeCuartosSinFoto(cuantos: number): string {
  return `Quedaron ${cuantos} cuartos sin foto. Tu administrador los va a ver.`;
}

/** Y su forma en singular, que el contrato no previo y la aseadora si lee. */
function avisoDeUnCuartoSinFoto(): string {
  return 'Quedó 1 cuarto sin foto. Tu administrador lo va a ver.';
}

export function CierreDeAseo({
  apartamento,
  cuartosSinFoto,
}: {
  apartamento: string;
  cuartosSinFoto: number;
}) {
  return (
    <div className="flex flex-col gap-lg">
      {cuartosSinFoto > 0 && (
        <p className="text-micro-movil text-status-warn">
          {cuartosSinFoto === 1 ? avisoDeUnCuartoSinFoto() : avisoDeCuartosSinFoto(cuartosSinFoto)}
        </p>
      )}

      <div className="flex flex-col gap-xs">
        <h1 className="text-display-movil text-foreground">{TITULO}</h1>
        <p className="text-body-movil text-foreground">Terminaste el aseo de {apartamento}.</p>
      </div>

      <Button
        className="min-h-toque-comodo w-full text-body-movil"
        render={<Link href="/mis-aseos" />}
      >
        {VOLVER}
      </Button>
    </div>
  );
}
