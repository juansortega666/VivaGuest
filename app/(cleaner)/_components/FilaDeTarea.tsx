'use client';

import { Check } from 'lucide-react';
import { useId, useTransition } from 'react';
import { toast } from 'sonner';

import { marcarTarea } from '@/app/(cleaner)/aseos/[id]/_actions';
import { cn } from '@/lib/utils';

/**
 * UNA TAREA DEL CHECKLIST (06-UI-SPEC §7.3 y §12.2).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ES UNA CASILLA NATIVA, Y NO LA PRIMITIVA DE `components/ui/`.
 *
 * `components/ui/checkbox.tsx` envuelve la de Base UI, que renderiza un
 * `<button role="checkbox">`. Funciona, pero §12.2 pide literalmente
 * «`<input type="checkbox">` reales con `<label>` asociada». La diferencia
 * importa aqui y no es purismo: la `<label>` asociada hace que **todo el rotulo
 * sea el destino del toque sin escribir ni un manejador**, que es exactamente lo
 * que §7.3 exige, y lo hace el navegador, no nuestro codigo. Con un boton
 * habria que replicar a mano el area, el estado y el anuncio.
 *
 * ── EL AREA ES LO QUE SE TOCA; EL CUADRO ES LO QUE SE VE ────────────────────
 *
 * La fila mide `--spacing-fila-tarea` (48px) de alto y ocupa el ancho completo.
 * El cuadro verde mide 20px. **Son dos medidas distintas a proposito.**
 *
 * Esto es justo lo que alguien va a querer "simplificar" dejando solo la
 * casilla, asi que queda escrito: con guantes o con las manos mojadas, una
 * casilla de 20px es un toque fallido de cada tres, y el toque fallido cae en la
 * fila de al lado, o sea que marca la tarea equivocada. Un area de 44px de alto
 * a ancho completo no se puede fallar.
 *
 * ── EL MARCADO ES OPTIMISTA, Y ES UNA DECISION DE PRODUCTO ─────────────────
 *
 * La casilla cambia **antes** de que responda el servidor, y se revierte con un
 * aviso si falla (§11.2). La alternativa —esperar la respuesta por casilla— son
 * doce esperas de medio segundo en un aseo normal, y eso no es "un poco mas
 * lento": es una pantalla que la aseadora deja de usar y vuelve a WhatsApp.
 *
 * El estado vive en el PADRE y no aqui, porque el mismo numero se pinta en tres
 * sitios (la cabecera del cuarto, el total de arriba y el contador del asistente
 * de evidencia). Ver la cabecera de `ChecklistPorCuarto.tsx`.
 *
 * ── NO SE PIDE REFRESCO DEL SERVIDOR EN CADA TOQUE ─────────────────────────
 *
 * Seria un viaje de red por casilla que ademas llegaria DESPUES del cambio
 * optimista y lo pisaria hacia atras un instante. El servidor ya tiene el dato
 * —el RPC lo escribio— y la proxima entrada a la pantalla lo lee fresco.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Lo que se muestra cuando el RPC rechaza o la red se cae. */
const AVISO_FALLO = 'No se pudo guardar. Vuelve a tocarlo.';

export function FilaDeTarea({
  itemId,
  etiqueta,
  hecha,
  soloLectura = false,
  onCambio,
}: {
  itemId: string;
  etiqueta: string;
  hecha: boolean;
  /** El aseo no esta en curso: se lee, no se marca. */
  soloLectura?: boolean;
  /** Aplica el cambio en el padre. Se llama dos veces si el servidor falla. */
  onCambio: (itemId: string, hecha: boolean) => void;
}) {
  const inputId = useId();
  const [, empezar] = useTransition();

  function alCambiar() {
    const deseada = !hecha;

    // 1. La pantalla cambia YA.
    onCambio(itemId, deseada);

    // 2. Y solo despues se le cuenta al servidor.
    empezar(async () => {
      const cuerpo = new FormData();
      cuerpo.set('item', itemId);
      cuerpo.set('hecha', String(deseada));

      let fallo = false;
      try {
        const r = await marcarTarea(null, cuerpo);
        fallo = !r.ok;
      } catch {
        // Una red caida y un rechazo del RPC se tratan igual: lo unico que la
        // aseadora puede hacer en los dos casos es volver a tocar.
        fallo = true;
      }

      if (fallo) {
        onCambio(itemId, hecha);
        toast.error(AVISO_FALLO);
      }
    });
  }

  return (
    <label
      htmlFor={inputId}
      className={cn(
        // UN SOLO `min-h-*`: dos clases del mismo grupo se deduplican en `cn()`
        // y ganaria la ultima. Los 48px de la fila ya cubren de sobra el piso de
        // 44px de este arbol.
        'flex min-h-fila-tarea w-full items-center gap-md py-sm',
        // `scroll-mb-*` RESERVA LA BARRA FIJA AL DESPLAZAR, y es un defecto real
        // encontrado por el test de navegador de este plan.
        //
        // El relleno inferior de la pagina evita que la ultima fila NAZCA debajo
        // de la barra, pero no protege del desplazamiento: `scrollIntoView` no
        // sabe que hay 72px opacos anclados al fondo, asi que al tabular hasta
        // una tarea baja el navegador la deja justo debajo y el toque siguiente
        // cae en la barra. Se le ve en el log como `intercepts pointer events`.
        'scroll-mb-barra-aseo',
        soloLectura ? 'cursor-default' : 'cursor-pointer',
      )}
    >
      {/*
        La casilla de verdad. Va oculta a la vista pero NO al arbol de
        accesibilidad ni al foco: se llega con el tabulador, se marca con la barra
        espaciadora y un lector de pantalla la anuncia como casilla. Lo que se
        pinta es el `span` de al lado, que es su `peer`.
      */}
      <input
        id={inputId}
        type="checkbox"
        checked={hecha}
        readOnly={soloLectura}
        onChange={soloLectura ? undefined : alCambiar}
        className="peer sr-only"
      />

      <span
        aria-hidden="true"
        className={cn(
          // `transicion` son 120ms SOLO de color: sin animacion de layout, que
          // en una lista de doce filas es un salto visible en cada toque.
          'transicion flex size-5 shrink-0 items-center justify-center rounded-md border-2',
          // NO ES DECORACION: sin esto, el cuadro TAPA la casilla.
          //
          // La casilla real va reducida a un pixel en el origen del rotulo, y
          // este cuadro se dibuja justo encima. Un toque humano sigue
          // funcionando, porque cae en el rotulo y el navegador lo reenvia, pero
          // un click dirigido AL control —el que hace una herramienta de
          // automatizacion, y el que puede hacer una ayuda tecnica— choca contra
          // este cuadro y no llega. Lo encontro el test de navegador de este
          // plan: `intercepts pointer events`.
          'pointer-events-none',
          'peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50',
          hecha
            ? 'border-status-ok bg-status-ok text-background'
            : 'border-input bg-background text-transparent',
        )}
      >
        <Check size={16} strokeWidth={3} aria-hidden="true" />
      </span>

      {/*
        Hecha: el texto se atenua, y nada mas. Atravesarlo con una raya sugiere
        "esto ya no aplica"; lo que paso es que se hizo, que es lo contrario.
      */}
      <span
        className={cn(
          'transicion text-body-movil',
          hecha ? 'text-muted-foreground' : 'text-foreground',
        )}
      >
        {etiqueta}
      </span>
    </label>
  );
}
