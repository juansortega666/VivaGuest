import { SIN_ASIGNAR, type ChipDeCarga } from '@/lib/data/operacion';
import { cn } from '@/lib/utils';

/**
 * La franja de carga por aseador de HOY (DASH-03, 04-UI-SPEC.md §8.2).
 *
 * Va JUSTO ENCIMA de la cabecera de `Hoy`, dentro del carril ancho y no en el
 * lateral: es una franja, no una zona (D-04).
 *
 * ── SE LISTAN TODOS LOS ASEADORES ACTIVOS, CEROS INCLUIDOS ─────────────────
 * "Quien esta libre" es la mitad de la decision del suplente, y ocultar los ceros
 * deja solo la otra mitad. El orden lo fija `cargaPorAseador()`: conteo
 * descendente, despues nombre, y `Sin asignar` siempre ultimo sin importar su
 * conteo.
 *
 * ── LOS CHIPS NO SON CLICABLES Y NO FILTRAN NADA ───────────────────────────
 * Sin `cursor: pointer`, sin hover y sin foco. No se construye filtro por aseador
 * en esta fase, y un chip que parece boton y no hace nada es peor que uno que
 * claramente no lo es. Por eso son `<li>` y no `<button>`: la diferencia tiene que
 * estar en el DOM, no solo en la ausencia de un `onClick`.
 *
 * ── NO HAY ESCALA DE COLOR POR CARGA ───────────────────────────────────────
 * No existe un umbral de "sobrecargado" definido en el producto y el scorecard por
 * aseador esta diferido a v2, asi que pintar de rojo el 5 seria inventar una
 * metrica de desempeno donde solo hay un conteo operativo. El unico chip con color
 * es `Sin asignar`, y ahi el color REFUERZA lo que la etiqueta ya dice.
 */
export function FranjaCarga({ chips }: { chips: ChipDeCarga[] }) {
  // Si hoy no hay ningun aseo vivo, la franja no se renderiza: no hay carga que
  // mostrar, y ocho chips en cero son ocho cajas diciendo que no pasa nada.
  const hayCarga = chips.some((chip) => chip.conteo > 0);
  if (!hayCarga) return null;

  return (
    <div className="flex flex-wrap items-center gap-sm">
      <h2 className="mr-md text-micro font-semibold tracking-columna text-muted-foreground uppercase">
        Carga de hoy
      </h2>

      <ul className="flex flex-wrap items-center gap-sm">
        {chips.map((chip) => {
          const huerfano = chip.aseadorId === null;

          return (
            <li
              key={chip.aseadorId ?? SIN_ASIGNAR}
              className={cn(
                'flex h-chip items-center gap-sm rounded-md px-md',
                huerfano ? 'bg-surface-warn text-status-warn' : 'bg-muted text-foreground',
              )}
            >
              <span className="text-micro">{chip.nombre}</span>
              {/* `tabular-nums` (§3): sin el, ocho conteos de ancho variable
                  bailan al actualizarse la pantalla. */}
              <span className="text-micro font-semibold tabular-nums">{chip.conteo}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
