'use client';

import { Check, ListFilter } from 'lucide-react';
import Link from 'next/link';
import { useOptimistic, useId, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Alerta, ClaveDeAlerta, ConteoDeTipo } from '@/lib/domain/alertas';

import { EstadoVacio } from '../../_components/EstadoVacio';

import { FilaAlerta } from './FilaAlerta';

/**
 * El panel de alertas (DASH-04, DASH-05, 04-UI-SPEC.md §11).
 *
 * Es el criterio 4 del ROADMAP y la parte más difícil del contrato: UN SOLO panel
 * muestra urgentes, extensión mal creada, "no puedo", daños, faltantes,
 * calendario caído y hora límite vencida, **con la misma jerarquía visual**. El
 * anti-patrón que ataja es el clásico: urgentes en rojo grande arriba y
 * "faltantes" como texto gris al final que nadie lee nunca.
 *
 * ── NINGUNA ALERTA SE ESCONDE, Y ESA FRASE NO SE SUAVIZA (D-05) ────────────
 *
 * Lo que lo garantiza no es una promesa, son tres cosas medibles:
 *
 *   1. EL CONTADOR DICE EL TOTAL, NO LO RENDERIZADO. Con treinta alertas dice
 *      treinta aunque en pantalla quepan siete. Es la única forma de que el
 *      scroll interno no sea un escondite.
 *   2. NO SE PAGINA, NO SE VIRTUALIZA Y NO HAY "VER MÁS". De treinta en adelante,
 *      igual: con un admin y decenas de aseos al día, treinta filas es un render
 *      trivial. Un "ver más" cuesta que alguien no lo pulse.
 *   3. NINGUNA TRANSICIÓN DE VOLUMEN CAMBIA EL TAMAÑO NI EL PESO DE UNA FILA.
 *      Que haya treinta no hace que la primera grite más.
 *
 * ── EL ORDEN ES EL CRITERIO 4, NO UNA PREFERENCIA (D-06) ──────────────────
 *
 * Cronológico DESCENDENTE por el instante del hecho, y ya viene resuelto por
 * `mezclarAlertas()`. **ACÁ NO SE REORDENA.** Ordenar el panel por severidad
 * reabre el criterio y el documento de diseño; no es una decisión que se tome en
 * ejecución. Lo único que este componente hace con la lista es FILTRAR por tipo,
 * que es una operación que conserva el orden.
 *
 * ── EL PANEL NO USA `read_at` COMO "LEÍDA" ────────────────────────────────
 *
 * No hay negrita para no leídas ni gris para leídas: cualquier tratamiento de
 * leído contra no leído reintroduce exactamente la jerarquía que el criterio 4
 * prohíbe, y además "leída" no es "resuelta". `read_at` significa ATENDIDA, que
 * es una acción explícita del admin, y una alerta atendida SALE del panel en vez
 * de atenuarse.
 *
 * ── DÓNDE VIVE CADA DECISIÓN ──────────────────────────────────────────────
 *
 * El filtro por tipo es estado de CLIENTE: no toca la base y no debe costar un
 * viaje. El toggle `Ver atendidas` es un parámetro de URL y por lo tanto de
 * SERVIDOR: cambia QUÉ FILAS se leen, y resolverlo en el cliente obligaría a
 * traer siempre las atendidas de siete días para tenerlas por si acaso.
 */

/** El parámetro de URL del toggle. Un solo sitio donde está escrito. */
const PARAM_ATENDIDAS = 'alertas';
const VALOR_ATENDIDAS = 'atendidas';

export const HREF_SIN_ATENDER = '/operacion';
export const HREF_ATENDIDAS = `/operacion?${PARAM_ATENDIDAS}=${VALOR_ATENDIDAS}`;

export function PanelAlertas({
  alertas,
  conteos,
  ahoraMs,
  modo,
}: {
  /**
   * Ya mezcladas y ordenadas por `mezclarAlertas()` en el servidor. La derivación
   * vive en `lib/domain/alertas.ts`: duplicarla en el navegador sería duplicar el
   * dominio, y dos verdades se desincronizan en el primer cambio.
   */
  alertas: Alerta[];
  /** De `conteosPorTipo()`, en el ORDEN FIJO de §11.1 y con los ceros incluidos. */
  conteos: ConteoDeTipo[];
  /** El instante de la lectura, uno solo para toda la pantalla (D-14). */
  ahoraMs: number;
  modo: 'sin_atender' | 'atendidas';
}) {
  const idTitulo = useId();
  const [filtro, setFiltro] = useState<ClaveDeAlerta | null>(null);

  /**
   * LAS FILAS QUE EL ADMIN ACABA DE RESOLVER Y TODAVÍA NO CONFIRMÓ EL SERVIDOR.
   *
   * `useOptimistic` y no un `useState`, y la diferencia importa: el estado
   * optimista se REVIERTE SOLO al terminar la transición, que es justo cuando el
   * `revalidatePath('/operacion')` de la action ya trajo la lista de verdad. Con
   * un `useState` habría que acordarse de limpiar el id a mano en las dos ramas,
   * y la rama que se olvida siempre es la de fallo: la fila se quedaría oculta
   * para siempre pese a que el `UPDATE` no escribió nada.
   *
   * El valor base es la lista vacía a propósito. No acumula nada entre
   * transiciones: cada `resolver()` de una fila la esconde mientras dura su
   * llamada y la realidad decide después.
   */
  const [resueltas, marcarResuelta] = useOptimistic<string[], string>(
    [],
    (previas, id) => [...previas, id],
  );

  const atendidas = modo === 'atendidas';

  // EL TOTAL, y es el número que el contador enseña. No es `visibles.length`:
  // decir "7" con un filtro puesto sobre 30 sería exactamente el escondite que
  // este panel no puede tener.
  const enPanel = alertas.filter((a) => !resueltas.includes(a.id));
  const total = enPanel.length;

  // Filtrar CONSERVA el orden cronológico de `mezclarAlertas()`. Es lo único que
  // este componente hace con la lista.
  const visibles = filtro === null ? enPanel : enPanel.filter((a) => a.clave === filtro);

  const etiquetaDelFiltro = filtro && conteos.find((c) => c.clave === filtro)?.etiqueta;

  return (
    // `min-h-0` es lo que permite que el scroll ocurra DENTRO de la lista en vez
    // de que la card crezca y empuje al `aside` fuera del viewport. `flex-1` es el
    // reparto que el plan 04-09 reservó: la bandeja se lleva `max-h-[40%]` y este
    // panel el resto.
    <section
      aria-labelledby={idTitulo}
      className="flex min-h-0 flex-1 flex-col rounded-md border border-border bg-background"
    >
      {/*
        Cabecera de 40px, FUERA del scrollport. §11.5 la pide `sticky top-0`;
        dejarla fuera del scroll consigue lo mismo por construcción y sin pegado,
        que es el mismo patrón que ya usa la bandeja del plan 04-10.
      */}
      <div className="flex h-fila shrink-0 items-center justify-between gap-sm px-md">
        <h2 id={idTitulo} className="truncate text-heading text-foreground">
          {atendidas ? 'Atendidas' : 'Alertas'}
          {etiquetaDelFiltro && (
            <span className="font-normal text-muted-foreground"> · {etiquetaDelFiltro}</span>
          )}
        </h2>

        <div className="flex shrink-0 items-center gap-sm">
          {/*
            `aria-live="polite"` en el contador (§16.3): cuando entra una alerta
            por Realtime el número cambia sin que nadie haya tocado nada, y quien
            usa lector de pantalla no tiene forma de enterarse.

            `tabular-nums`: sin él el contador baila de ancho al pasar de 9 a 10 y
            arrastra la cabecera entera.
          */}
          {total > 0 && (
            <Badge
              aria-live="polite"
              className="bg-surface-warn text-micro font-semibold tabular-nums text-status-warn"
            >
              {total}
            </Badge>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  aria-label="Filtrar alertas por tipo"
                  className="transicion flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <ListFilter className="size-3.5" strokeWidth={2} aria-hidden="true" />
                </button>
              }
            />

            <DropdownMenuContent align="end">
              {/*
                Arranca en `Todas` (D-07): el panel no nace filtrado, porque un
                panel que nace filtrado es un panel que esconde por defecto.
              */}
              <DropdownMenuItem onClick={() => setFiltro(null)}>Todas ({total})</DropdownMenuItem>

              <DropdownMenuSeparator />

              {/*
                EL ORDEN DE ESTA LISTA ES EL FIJO DE `conteosPorTipo()`, NUNCA POR
                CONTEO, y los ceros van incluidos. Una lista de filtro que se
                reordena sola según los conteos es inusable: la opción que buscas
                cambia de sitio cada vez que entra una alerta, y en un panel que se
                refresca solo por Realtime eso pasa debajo del cursor.
              */}
              {conteos.map((c) => (
                <DropdownMenuItem key={c.clave} onClick={() => setFiltro(c.clave)}>
                  {c.etiqueta} ({c.conteo})
                </DropdownMenuItem>
              ))}

              <DropdownMenuSeparator />

              {/*
                El toggle es un `<Link>` y no un botón con estado: cambia QUÉ FILAS
                lee el servidor, así que vive en la URL. `scroll={false}` para que
                la navegación blanda no mande la página al tope, que con el carril
                lateral pegado sería un salto sin motivo.
              */}
              <DropdownMenuItem
                render={
                  <Link href={atendidas ? HREF_SIN_ATENDER : HREF_ATENDIDAS} scroll={false} />
                }
              >
                {atendidas ? 'Ver sin atender' : 'Ver atendidas'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {total === 0 ? (
        /*
          EL PANEL NO DESAPARECE CUANDO NO HAY NADA (§11.5). Su ausencia haría que
          la bandeja creciera y cambiara la geometría del carril cada vez que entra
          o sale una alerta.

          Variante COMPACTA: esta card vive en un carril de 360px y el bloque de
          48px de la variante normal lo desbordaría (§15.1). `Check` en
          `--status-ok` y no en gris: acá el vacío es un BUEN resultado.
        */
        <EstadoVacio
          compacto
          icono={Check}
          claseIcono="text-status-ok"
          encabezado={atendidas ? 'Nada atendido esta semana.' : 'Sin alertas.'}
          cuerpo={
            atendidas
              ? 'Acá van a aparecer las alertas que cierres, durante siete días.'
              : 'Cuando algo necesite tu atención va a aparecer acá.'
          }
        />
      ) : visibles.length === 0 ? (
        <EstadoVacio
          compacto
          icono={ListFilter}
          encabezado="Ninguna alerta de este tipo."
          cuerpo={`Quita el filtro para ver las ${total} que hay.`}
          accion={
            <Button type="button" variant="outline" onClick={() => setFiltro(null)}>
              Quitar filtro
            </Button>
          }
        />
      ) : (
        /*
          `flex-1` y `min-h-0`: la lista se queda con el alto que sobra y scrollea
          por dentro. Con UNA sola alerta el panel NO se encoge al alto de su
          contenido y la fila queda arriba, porque una card de 100px flotando bajo
          la bandeja se lee como error de layout (§11.5).

          Sin `virtualizer` y sin paginado. Ver la cabecera del archivo.
        */
        <ul className="min-h-0 flex-1 overflow-y-auto border-t border-border">
          {visibles.map((alerta) => (
            <FilaAlerta
              key={alerta.id}
              alerta={alerta}
              ahoraMs={ahoraMs}
              modo={modo}
              onOptimista={marcarResuelta}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
