import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Las dos formas de decir que un valor no está, y **la distinción no es
 * estilo** (08-UI-SPEC.md §6.2, §13.2).
 *
 * La fijó `FilaAseo.tsx` y vale igual acá:
 *
 * - `sin definir`: el dato todavía no existe y **alguien tiene que ir a
 *   llenarlo**.
 * - `no aplica`: **la base lo prohíbe**, por los CHECK de gestión externa y de
 *   inercia. Decir `sin definir` ahí sugeriría que alguien debería ir a
 *   llenarlo, y no hay nada que llenar.
 */
export type FormaDeAusencia = 'sin definir' | 'no aplica';

type Comun = {
  /** El rótulo de la izquierda. Es rótulo, no dato: micro 12/400 atenuado. */
  etiqueta: string;
  /**
   * Peso 600 en el valor, para la fila que ANCLA el panel (§4.4). Lo decide
   * quien consume, no este componente: una fila no sabe si es el ancla de la
   * pantalla en la que vive.
   */
  ancla?: boolean;
  /**
   * Numerales tabulares. **Obligatorio en toda cifra** (§3.1): montos, hora
   * límite, el progreso del checklist, fechas cortas y el código de acceso.
   */
  cifra?: boolean;
};

type ConValor = Comun & {
  /**
   * El valor, **ya formateado por quien llama**. Ver la cabecera: acá no se
   * formatea dinero, ni fechas, ni se derivan estados.
   */
  valor: NonNullable<ReactNode>;
  ausencia?: never;
  /**
   * El texto completo del valor, cuando el valor se trunca a una línea.
   * Truncar sin dejar el texto completo es esconder el dato (§6.2).
   */
  completo?: string;
};

type SinValor = Comun & {
  /** No hay valor. Entonces la forma de ausencia es obligatoria. */
  valor: null;
  /**
   * Cuál de las dos, y **no tiene valor por defecto a propósito**: obligar a
   * elegir es lo que impide que alguien escriba la que no toca en una fila de
   * gestión externa.
   */
  ausencia: FormaDeAusencia;
  completo?: never;
};

/**
 * Una fila dato-valor del cuerpo del panel (08-UI-SPEC.md §6.2).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * UNA LÍNEA, DOS EXTREMOS. POR QUÉ NO APILADA, Y ESTÁ CONTADO.
 *
 * Una fila apilada (etiqueta arriba, valor abajo) mide **38px en vez de 21**,
 * casi el doble. Con nueve filas son **153px de diferencia**, que es justo a lo
 * que se parece que un panel quepa o no quepa en los 506px de cuerpo que hay a
 * 700 de viewport. Y en 480px de ancho no hace falta apilar: la etiqueta más
 * larga de la fase mide ~102px y el valor más largo ~95px, sobre 448px útiles.
 *
 * **Alineación por línea base, no por centro.** Con dos tamaños distintos,
 * centrar desalinea las bases y la fila se lee torcida.
 *
 * ── UN PAR ETIQUETA-VALOR **ES** UNA LISTA DE DEFINICIÓN (§13.2) ─────────
 *
 * Por eso el término y la definición, y no dos textos sueltos: con la lista de
 * definición el lector de pantalla anuncia el PAR; con dos textos sueltos
 * anuncia dos textos sin relación entre ellos. La lista la abre
 * `GrupoDePanel`; esta fila es uno de sus pares. El envoltorio intermedio es lo
 * que permite la fila de dos extremos y es HTML válido dentro de una lista de
 * definición.
 *
 * ── NINGÚN VALOR SE ANUNCIA SOLO COMO GLIFO (§13.2) ─────────────────────
 *
 * El glifo de ausencia va SIEMPRE acompañado de su texto de solo lectura con
 * una de las dos formas, y el compilador obliga a elegirla: sin valor, el tipo
 * exige la forma.
 *
 * ── LO QUE ESTA FILA NO HACE ────────────────────────────────────────────
 *
 * No formatea dinero, no formatea fechas y no deriva estados. Todo eso llega ya
 * resuelto desde el servidor, con los formateadores de dominio que ya existen.
 * Un componente que formatea es un componente que hay que probar dos veces, y
 * los formateadores de este repo ya tienen sus pruebas.
 * ════════════════════════════════════════════════════════════════════════════
 */
export function FilaDeDato(props: ConValor | SinValor) {
  const { etiqueta, ancla = false, cifra = false } = props;

  return (
    <div className="flex items-baseline justify-between gap-md">
      <dt className="shrink-0 text-micro text-muted-foreground">{etiqueta}</dt>

      {props.valor === null ? (
        <dd className="text-body text-muted-foreground">
          <span aria-hidden="true">—</span>
          <span className="sr-only">{props.ausencia}</span>
        </dd>
      ) : (
        <dd
          title={props.completo}
          className={cn(
            'min-w-0 text-body text-foreground',
            ancla && 'font-semibold',
            cifra && 'tabular-nums',
            props.completo !== undefined && 'truncate'
          )}
        >
          {props.valor}
        </dd>
      )}
    </div>
  );
}
