'use client';

import { Button } from '@/components/ui/button';

/**
 * LA PREGUNTA DE §8.1: EL CHECKLIST A MEDIAS INFORMA, NO BLOQUEA.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESTO ES LA DEROGACION DE PWA-07 HECHA PANTALLA.
 *
 * El requisito original bloqueaba terminar un aseo con el checklist incompleto.
 * D-06 lo derogo, la migracion 18 lo saco de `finish_cleaning`, y esta hoja es
 * lo que ocupa su lugar. El criterio del contrato es una frase:
 * **no se bloquea, se marca.**
 *
 * La razon es de campo y no de interfaz: una aseadora atrapada en una pantalla
 * que no la deja salir **llama por telefono**, y la coordinacion telefonica es
 * exactamente lo que este producto existe para eliminar. Un bloqueo no produce
 * checklists mas completos; produce llamadas.
 *
 * Lo que si produce el dato es la marca: el admin ve cuales quedaron
 * pendientes, y eso se cuenta. Un bloqueo no se cuenta, porque no llega a
 * ocurrir.
 *
 * ── POR QUE UNA HOJA Y NO UN DIALOGO DE ALERTA ─────────────────────────────
 *
 * §14.2 lo reserva para lo destructivo, y terminar un aseo no destruye nada.
 * Ademas la hoja sube desde abajo, donde esta el pulgar que acaba de tocar la
 * barra; un dialogo centrado obliga a subir la mano.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** El copy literal de §8.1. La segunda linea no cambia nunca. */
const CUERPO =
  'Puedes terminar igual, pero el administrador va a ver cuáles quedaron pendientes.';

/**
 * El titulo, en las dos formas.
 *
 * La del plural es la literal del contrato. La del singular existe porque
 * `Te faltan 1 tareas por marcar.` es una frase rota, y quien la lee esta de pie
 * frente a una puerta: cada frase rota es un segundo de duda sobre si la
 * aplicacion sabe lo que dice.
 */
function titulo(faltan: number): string {
  if (faltan === 1) return 'Te falta 1 tarea por marcar.';
  return `Te faltan ${faltan} tareas por marcar.`;
}

const PRIMARIA = 'Terminar de todos modos';
const SECUNDARIA = 'Volver al checklist';

export function HojaChecklistIncompleto({
  faltan,
  onSeguir,
  onVolver,
}: {
  faltan: number;
  onSeguir: () => void;
  onVolver: () => void;
}) {
  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-col gap-xs">
        <h2 className="text-heading-movil text-foreground">{titulo(faltan)}</h2>
        <p className="text-body-movil text-muted-foreground">{CUERPO}</p>
      </div>

      <div className="flex flex-col gap-sm">
        <Button
          type="button"
          onClick={onSeguir}
          className="min-h-toque-comodo w-full text-body-movil"
        >
          {PRIMARIA}
        </Button>

        {/*
          La salida que devuelve al trabajo va DEBAJO: quien abrio esta hoja ya
          decidio terminar. La secundaria esta para quien se arrepiente, no para
          dirigir.
        */}
        <Button
          type="button"
          variant="ghost"
          onClick={onVolver}
          className="min-h-toque w-full text-body-movil"
        >
          {SECUNDARIA}
        </Button>
      </div>
    </div>
  );
}
