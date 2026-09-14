'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { sumarDias } from '@/lib/domain/dates';
import {
  contieneHoy,
  rangoDePeriodo,
  type RangoDePeriodo,
} from '@/lib/domain/periodo';
import { cn } from '@/lib/utils';

/**
 * EL FILTRO DE PERIODO, QUE MANDA SOBRE TODA LA PANTALLA (07-UI-SPEC §6.2 y §12.2b).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ENVUELVE EL CONTENIDO, Y ESA ES LA DECISION ESTRUCTURAL DEL COMPONENTE.
 *
 * Recibe los tres bloques YA RENDERIZADOS POR EL SERVIDOR como hijos. No es
 * elegancia: es lo unico que permite atenuar las cifras viejas mientras llegan
 * las nuevas sin convertir la pagina entera en cliente. Los bloques siguen
 * siendo componentes de servidor; lo unico que viaja al navegador es la
 * cabecera y el envoltorio que cambia una clase.
 *
 * ── POR QUE NO HAY ESQUELETO AL CAMBIAR DE RANGO ─────────────────────────
 *
 * Cambiar de mes a semana NO ES IR A OTRA PANTALLA: es la misma pantalla con
 * otros numeros. Sustituir las cifras por bloques grises pierde justamente lo
 * que el admin esta haciendo, que es COMPARAR. Por eso las cifras viejas se
 * quedan visibles y legibles, atenuadas, mientras llegan las nuevas.
 *
 * El esqueleto si aplica al llegar a la ruta por primera vez, y eso lo resuelve
 * `loading.tsx`, que es otro caso.
 *
 * ── LAS CUATRO REGLAS DEL ESTADO PENDIENTE, Y LA QUE MAS DUELE ───────────
 *
 *   1. El contenedor de los bloques se marca como ocupado y se atenua, con la
 *      utilidad de transicion del proyecto. La opacidad es una de las cuatro
 *      propiedades que el contrato de movimiento permite.
 *   2. **El control NO se atenua.** Sigue respondiendo, y el rango que se acaba
 *      de tocar ya se ve activo aunque los numeros todavia sean los viejos.
 *   3. **PROHIBIDO inhabilitar los tres botones del segmentado mientras carga.**
 *      Es un estado muerto invisible: el admin toca `Semana`, no pasa nada
 *      visible, y vuelve a tocar. El unico boton que se inhabilita aqui lo hace
 *      por una razon de dominio, no de carga: no hay futuro que mirar.
 *   4. Con la preferencia de movimiento reducido la opacidad cambia sin
 *      transicion, porque la capa base del proyecto anula la duracion. El estado
 *      sigue siendo visible: lo que se quita es el recorrido, no el resultado.
 *
 * Y el quinto, que no es visual: el cambio se anuncia con una region de
 * cortesia. Sin eso, quien usa un lector de pantalla toca `Semana` y no se
 * entera de que algo cambio, porque la pagina no navego de verdad.
 *
 * ── EL CONTRATO DE URL, QUE ES LO QUE HACE EL FILTRO ENLAZABLE ───────────
 *
 * El rango y el ancla viajan como parametros de consulta. Sin parametros, el
 * rango es mes y el ancla es hoy. **El ancla es cualquier dia dentro del
 * periodo y el servidor deriva los dos extremos**, asi que un enlace pegado en
 * un chat abre exactamente la misma pantalla, y un refresco no devuelve al
 * usuario a hoy.
 *
 * ── NINGUNA ACCION DE SERVIDOR DE ESTA SECCION PIDE REVALIDACION DE RUTA ──
 *
 * Este plan no tiene ninguna, pero la regla aplica a toda la seccion y conviene
 * que quede escrita donde vive la navegacion: la utilidad de revalidacion de
 * rutas de Next cuelga el navegador en las acciones de servidor del arbol de
 * admin. Esta medido: la fila se escribe, el servidor responde en cincuenta
 * milisegundos con la carga completa, y el cliente no la aplica nunca. El
 * disparador es el tamano del arbol de cliente, asi que una pantalla nueva y
 * grande vuelve a caer. El refresco se pide desde el cliente.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Los tres rangos, con su copy exacto y en el orden del contrato. */
const RANGOS: { valor: RangoDePeriodo; etiqueta: string }[] = [
  { valor: 'dia', etiqueta: 'Día' },
  { valor: 'semana', etiqueta: 'Semana' },
  { valor: 'mes', etiqueta: 'Mes' },
];

/**
 * El ancla del periodo ANTERIOR o SIGUIENTE.
 *
 * Se calcula saltando UN DIA por fuera del extremo que corresponda, y no
 * restando una unidad de calendario: con `mes`, restar treinta dias desde el 31
 * de marzo cae en marzo otra vez, y desde el 31 de mayo cae en el 1 de mayo, o
 * sea el mismo mes. Saltar un dia antes del primero del periodo aterriza SIEMPRE
 * dentro del periodo anterior, sea cual sea su longitud, y el servidor deriva el
 * resto. Vale igual para los tres rangos, que es lo que hace que no haya tres
 * ramas aqui.
 */
function anclaVecina(
  rango: RangoDePeriodo,
  ancla: string,
  direccion: -1 | 1,
): string {
  const { desde, hasta } = rangoDePeriodo(rango, ancla);
  return direccion === -1 ? sumarDias(desde, -1) : sumarDias(hasta, 1);
}

export function FiltroPeriodo({
  rango,
  ancla,
  desde,
  hasta,
  etiqueta,
  hoy,
  subNav,
  children,
}: {
  rango: RangoDePeriodo;
  /** El dia de referencia, ya normalizado por el servidor. */
  ancla: string;
  desde: string;
  hasta: string;
  /** La etiqueta ya formateada por el dominio. No se compone aquí. */
  etiqueta: string;
  /**
   * Hoy en Bogotá, calculado en el SERVIDOR y pasado por prop.
   *
   * No se lee el reloj en el cliente: el proceso del servidor corre en tiempo
   * universal y el navegador del admin puede estar en otra zona, así que dos
   * relojes distintos decidirían si el botón `Hoy` se ve. Con una sola fuente,
   * el servidor y el cliente pintan lo mismo y no hay desajuste de hidratación.
   */
  hoy: string;
  /**
   * El sub-nav de la seccion, que va entre la cabecera y los bloques.
   *
   * Entra como ranura y NO como hijo por una razon de comportamiento: los hijos
   * se atenuan mientras la transicion esta pendiente, y atenuar la navegacion
   * seria decirle al admin que `Pagos` tampoco responde. Responde: es un enlace
   * a otra ruta y no depende de estas cifras.
   */
  subNav?: ReactNode;
  /** Los tres bloques, ya renderizados por el servidor. */
  children: ReactNode;
}) {
  const router = useRouter();
  const ruta = usePathname();
  const parametros = useSearchParams();
  const [pendiente, empezar] = useTransition();

  /**
   * Navega conservando los parámetros que esta cabecera no gobierna.
   *
   * Se parte de los actuales y se pisan los dos propios: los filtros de
   * `/finanzas/aseos` (apartamento, aseador, tipo) viven en la misma dirección, y
   * construir la URL desde cero los borraría. Cambiar de semana no puede quitar
   * el filtro de apartamento que el admin acaba de poner.
   */
  function ir(siguiente: { rango?: RangoDePeriodo; ancla?: string }) {
    const busqueda = new URLSearchParams(parametros.toString());
    busqueda.set('rango', siguiente.rango ?? rango);
    busqueda.set('ancla', siguiente.ancla ?? ancla);

    empezar(() => {
      // Sin desplazar la página: es la misma pantalla con otros números, y saltar
      // arriba en cada cambio de rango haría perder el sitio al comparar.
      router.push(`${ruta}?${busqueda.toString()}`, { scroll: false });
    });
  }

  const periodoTieneHoy = contieneHoy(desde, hasta, hoy);

  return (
    <div className="flex flex-col gap-xl">
      <div className="flex flex-wrap items-center justify-between gap-lg">
        <h1 className="text-display text-foreground">Finanzas</h1>

        <div className="flex items-center gap-md">
          {/*
            Segmentado y NUNCA un desplegable: tres opciones que se cambian
            decenas de veces por sesión detrás de dos clics es justo el caso que
            un segmentado resuelve. El borde del contenedor es lo que hace que
            los tres se lean como un solo control y no como tres botones sueltos.
          */}
          <div
            role="group"
            aria-label="Rango del periodo"
            className="flex items-center gap-xs rounded-md border border-border p-xs"
          >
            {RANGOS.map(({ valor, etiqueta: texto }) => {
              const activo = valor === rango;

              return (
                <Button
                  key={valor}
                  type="button"
                  variant={activo ? 'secondary' : 'ghost'}
                  aria-pressed={activo}
                  onClick={() => ir({ rango: valor })}
                  className={cn(activo && 'font-semibold')}
                >
                  {texto}
                </Button>
              );
            })}
          </div>

          <div className="flex items-center gap-xs">
            {/*
              Los dos chevrons van con etiqueta accesible y NUNCA ocultos: son
              iconos solos, sin texto al lado que los explique.
            */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Periodo anterior"
              onClick={() => ir({ ancla: anclaVecina(rango, ancla, -1) })}
            >
              <ChevronLeft className="size-4" strokeWidth={2} aria-hidden="true" />
            </Button>

            {/*
              `tabular-nums` porque la etiqueta lleva números y cambia al navegar:
              sin numerales tabulares, `del 1 al 7` y `del 8 al 14` mueven el
              texto de alrededor en cada clic.
            */}
            <span className="min-w-buscador text-center text-body font-semibold tabular-nums text-foreground">
              {etiqueta}
            </span>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Periodo siguiente"
              // No hay futuro que mirar, y un botón que no hace nada es peor que
              // uno apagado. Es una regla de dominio, no de carga: el segmentado
              // sigue habilitado mientras la transición está pendiente.
              disabled={periodoTieneHoy}
              onClick={() => ir({ ancla: anclaVecina(rango, ancla, 1) })}
            >
              <ChevronRight className="size-4" strokeWidth={2} aria-hidden="true" />
            </Button>

            {/*
              Aparecer y desaparecer ES información: si está, es que te fuiste de
              hoy. Renderizarlo siempre y deshabilitarlo dejaría un control muerto
              permanente en el caso normal, que es el 95% de las aperturas.
            */}
            {!periodoTieneHoy && (
              <Button type="button" variant="ghost" onClick={() => ir({ ancla: hoy })}>
                Hoy
              </Button>
            )}
          </div>
        </div>
      </div>

      {subNav}

      {/*
        La región de cortesía. Va fuera del contenedor que se atenúa a propósito:
        su contenido no es información visual, y atenuarla no tendría sentido.
      */}
      <span aria-live="polite" className="sr-only">
        Mostrando {etiqueta}.
      </span>

      {/*
        El contenedor de los bloques. `pointer-events-none` mientras carga evita
        que el admin entre al detalle de una fila cuyos números ya no son los que
        se están calculando, que es cómo se llega a una pantalla que contradice a
        la anterior.
      */}
      <div
        aria-busy={pendiente || undefined}
        className={cn('transicion', pendiente && 'pointer-events-none opacity-60')}
      >
        {children}
      </div>
    </div>
  );
}
