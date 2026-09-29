import { BellOff } from 'lucide-react';

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
 *
 * ── LA MARCA DE QUIEN SE QUEDO MUDO (D-03, 05-UI-SPEC §11.2) ───────────────
 * Esta es la superficie de vistazo de D-03: es donde el admin decide quien hace
 * que, asi que es donde sirve saber a quien no le va a sonar el telefono.
 *
 *   - Solo `Sin avisos`. `Sin probar` NO se marca aqui: la franja es un vistazo de
 *     diez segundos y dos niveles de advertencia en un chip de 32px la vuelven
 *     ilegible. Ese matiz vive en la columna `AVISOS` de `/aseadores` (§11.1).
 *   - EL CHIP CONSERVA SU FONDO `--muted`. El tinte de aviso esta reservado a
 *     `Sin asignar` (04-UI-SPEC §8.2) y duplicarlo haria que dos hechos distintos
 *     se vean igual. Solo el icono lleva color.
 *   - `Sin asignar` nunca lleva campana: no es una persona.
 */
/**
 * El literal de siempre. Va como DEFAULT de la prop nueva y no como cadena suelta
 * en el JSX, y eso no es estilo: `FranjaCarga.test.ts` afirma `Carga de hoy` en
 * tres casos, y un default distinto los pondria rojos sin que nada del
 * comportamiento hubiera cambiado. Con el default, esas tres unitarias siguen
 * verdes SIN TOCARSE, que es la prueba de que la prop nueva no cambio nada.
 */
const TITULO_POR_DEFECTO = 'Carga de hoy';

export function FranjaCarga({
  chips,
  sinAvisos,
  titulo = TITULO_POR_DEFECTO,
}: {
  chips: ChipDeCarga[];
  sinAvisos: string[];
  /**
   * El encabezado de la franja (plan 10-05).
   *
   * Existe porque la franja dejo de ser siempre "de hoy": con el selector de dia,
   * la carga que se muestra es la del DIA SELECCIONADO, y un encabezado que diga
   * `Carga de hoy` mientras la pantalla esta en el viernes es una mentira pequeña
   * y constante. Quien compone el texto es la pagina, que es la unica que sabe si
   * el dia efectivo es el de negocio.
   */
  titulo?: string;
}) {
  /**
   * ── LA CONDICION DE RENDER ES UNA DISYUNCION, Y NO SE SIMPLIFICA ─────────
   *
   * Antes: si hoy no habia ningun aseo vivo, la franja no se renderizaba, porque
   * ocho chips en cero son ocho cajas diciendo que no pasa nada.
   *
   * Ahora tambien se renderiza cuando hay al menos un aseador activo sin avisos,
   * AUNQUE la carga de hoy sea cero entera. Es contraintuitivo y alguien lo va a
   * querer "limpiar", asi que la razon queda escrita: sin esta segunda rama, el
   * dia que nadie tenga aseos asignados desaparece la unica superficie del
   * dashboard donde se ve quien quedo mudo, Y ESE ES JUSTO EL DIA EN QUE HAY
   * TIEMPO PARA ARREGLARLO (§11.2).
   */
  const hayCarga = chips.some((chip) => chip.conteo > 0);
  const hayMudos = sinAvisos.length > 0;
  if (!hayCarga && !hayMudos) return null;

  return (
    <div className="flex flex-wrap items-center gap-sm">
      <h2 className="mr-md text-micro font-semibold tracking-columna text-muted-foreground uppercase">
        {titulo}
      </h2>

      <ul className="flex flex-wrap items-center gap-sm">
        {chips.map((chip) => {
          const huerfano = chip.aseadorId === null;
          // La comprobacion de id nulo va PRIMERO y escrita sobre `chip.aseadorId`
          // y no sobre `huerfano`: ademas de cerrarle la puerta al chip sin
          // persona —que nunca lleva campana, porque no es una persona—, es lo que
          // estrecha el tipo para `includes()`. Con la variable booleana, `tsc` no
          // lo estrecha.
          const mudo = chip.aseadorId !== null && sinAvisos.includes(chip.aseadorId);

          return (
            <li
              key={chip.aseadorId ?? SIN_ASIGNAR}
              title={
                mudo
                  ? `${chip.nombre} no tiene avisos activos. Si le confirmas un aseo, no le va a sonar el teléfono.`
                  : undefined
              }
              className={cn(
                'flex h-chip items-center gap-sm rounded-md px-md',
                huerfano ? 'bg-surface-warn text-status-warn' : 'bg-muted text-foreground',
              )}
            >
              {/* El icono y el nombre van en su propio grupo con `gap-xs` (4px,
                  §11.2). El `gap-sm` del chip es el que separa el nombre del
                  conteo y no cambia. */}
              <span className="flex items-center gap-xs">
                {mudo && (
                  <BellOff
                    className="size-3 shrink-0 text-status-warn"
                    strokeWidth={2}
                    role="img"
                    aria-label="Sin avisos activos"
                  />
                )}
                <span className="text-micro">{chip.nombre}</span>
              </span>

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
