'use client';

import { Check, ListFilter } from 'lucide-react';
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
import type { Alerta, ClaveDeAlerta } from '@/lib/domain/alertas';
import { conteosPorTipo } from '@/lib/domain/alertas';

import { EstadoVacio } from './EstadoVacio';
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
 * ── DÓNDE VIVE CADA DECISIÓN, Y EL PLAN 10-05 INVIRTIÓ LA MITAD ──────────
 *
 * El filtro por tipo es estado de CLIENTE: no toca la base y no debe costar un
 * viaje. Eso no cambia.
 *
 * **EL TOGGLE `Ver atendidas` ERA UN PARÁMETRO DE URL Y AHORA ES ESTADO DE
 * CLIENTE, Y ESO INVIERTE UNA REGLA ESCRITA (D-05-9).** La regla de `04-13` dice
 * que lo que cambia QUÉ FILAS lee el servidor vive en la dirección, y este toggle
 * lo cambia. Su premisa, en cambio, era que **el control vive en una página que
 * recibe los parámetros**. Al mudarse el panel a la campana de la barra superior,
 * el control pasó a vivir en el SHELL, y `app/(admin)/layout.tsx` **no recibe
 * `searchParams`**: en App Router no hay forma de que una página rellene una ranura
 * de su layout con un parámetro resuelto. El control se mudó; la premisa se cayó.
 *
 * Coste real, y va escrito: `leerCampana()` trae SIEMPRE las dos listas, o sea las
 * atendidas de siete días aunque el admin no las pida. Es una consulta más sobre
 * `notifications`, con un admin y decenas de filas.
 *
 * ── LO QUE SE FUE CON EL TOGGLE ──────────────────────────────────────────
 *
 * `PARAM_ATENDIDAS`, `HREF_SIN_ATENDER` y `HREF_ATENDIDAS` ya no existen. El día
 * que alguien busque por qué un enlace guardado con `?alertas=atendidas` dejó de
 * filtrar: dejó de ser una dirección compartible, a cambio de que el panel viva
 * donde el admin lo puede abrir desde las cuatro secciones.
 *
 * ── Y LOS CONTEOS DEL FILTRO SE DERIVAN ACÁ, QUE ES EL TERCER CAMBIO ─────
 *
 * Antes llegaban por prop, calculados en el servidor sobre la lista que se estaba
 * mostrando. Con el modo en el cliente, el servidor no sabe qué lista se muestra,
 * así que los conteos se derivan del `enPanel` de abajo llamando al MISMO
 * `conteosPorTipo()` del dominio. No es una copia de la lógica: es la misma función
 * ejecutada donde ahora se conoce la respuesta. Pasar dos juegos de conteos por prop
 * sería tener dos verdades esperando a desincronizarse.
 */

export function PanelAlertas({
  sinAtender,
  atendidas: listaAtendidas,
  ahoraMs,
}: {
  /**
   * Las SIN ATENDER, ya mezcladas y ordenadas por `mezclarAlertas()` en el servidor.
   * La derivación vive en `lib/domain/alertas.ts`: duplicarla en el navegador sería
   * duplicar el dominio, y dos verdades se desincronizan en el primer cambio.
   */
  sinAtender: Alerta[];
  /**
   * Las ATENDIDAS de los últimos siete días, también mezcladas en el servidor.
   *
   * LLEGAN SIEMPRE, se pidan o no, y es el coste de que el toggle sea estado de
   * cliente (D-05-9). Ver la cabecera.
   *
   * **Y NO TRAEN NINGUNA COMPUTADA, a propósito y no por olvido:** urgente, hora
   * límite vencida, calendario caído y almacenamiento lleno no tienen `read_at`, así
   * que no se pueden atender y no pueden estar en la lista de atendidas.
   */
  atendidas: Alerta[];
  /** El instante de la lectura, uno solo para todo el shell (D-14). */
  ahoraMs: number;
}) {
  const idTitulo = useId();
  const [filtro, setFiltro] = useState<ClaveDeAlerta | null>(null);
  const [modo, setModo] = useState<'sin_atender' | 'atendidas'>('sin_atender');

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
  const enPanel = (atendidas ? listaAtendidas : sinAtender).filter(
    (a) => !resueltas.includes(a.id),
  );
  const total = enPanel.length;

  // El MISMO `conteosPorTipo()` del dominio, ejecutado donde ahora se sabe qué lista
  // se muestra. Orden FIJO y ceros incluidos, que es su contrato. Ver la cabecera.
  const conteos = conteosPorTipo(enPanel);

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
      // SIN borde y SIN fondo propios: los pone el popover que lo contiene, y dos
      // bordes concéntricos a 1px de distancia se leen como un error de render. El
      // `min-h-0` y el `flex-1` se quedan, porque son lo que hace que el scroll
      // ocurra DENTRO de la lista en vez de que el contenedor crezca; lo que cambia
      // es quién le cierra la altura, que ahora es el popover y antes era el carril.
      className="flex min-h-0 flex-1 flex-col"
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
              // El gancho del localizador de la asercion del criterio 4. Va como
              // atributo y no se deduce de la clase: una asercion colgada de
              // `bg-surface-warn` se rompe con cualquier retoque de color, y lo que
              // hay que poder medir aqui es EL NUMERO.
              data-slot="contador-alertas"
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
                ── EL TOGGLE ERA UN ENLACE Y AHORA ES UN BOTÓN (D-05-9) ─────────

                Era un `<Link>` porque cambiaba QUÉ FILAS lee el servidor, y eso
                vive en la URL por la regla de `04-13`. Ya no puede: la campana vive
                en el layout y un layout de App Router NO recibe `searchParams`.
                Las dos listas llegan leídas y este botón elige entre ellas.

                Y al alternar, **la dirección de la página no se toca**: el panel no
                se come los parámetros de su anfitrión, que es la misma propiedad que
                defendía el `scroll={false}` de la versión anterior y que ahora
                defiende el caso E2E sobre `?dia`.
              */}
              <DropdownMenuItem
                onClick={() => {
                  setModo(atendidas ? 'sin_atender' : 'atendidas');
                  // El filtro por tipo se limpia al cambiar de lista: un filtro de
                  // `DAÑO` heredado sobre las atendidas deja el panel en su vacío de
                  // filtro y parece que no hay nada atendido.
                  setFiltro(null);
                }}
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
