import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Estado vacio del admin (UI-SPEC §9.2, 04-UI-SPEC.md §15.1).
 *
 * Recibe icono, encabezado, cuerpo y accion como props porque lo consumen tres
 * superficies distintas de la fase: la lista de aseadores (este plan), la
 * busqueda sin resultados (plan 02-11) y el apartamento sin cuartos (plan 02-13).
 * Meter el copy dentro del componente obligaria a una variante por pantalla.
 *
 * El icono llega por prop y NO se elige aqui: la lista de iconos de §14.3 es
 * cerrada, y quien monta la pantalla es quien sabe cual de esa lista aplica.
 *
 * La prop `compacto` la anadio la Fase 4. Los tres vacios del carril lateral
 * (bandeja, panel de alertas y filtro de alertas sin resultados) viven dentro de
 * cards de 360px de ancho, y el bloque de 48px de `py-3xl` mas el icono de 32px
 * los desborda. Los dos vacios del carril ancho (dia sin aseos, historial del
 * apartamento) siguen usando la variante normal.
 *
 * NO se escribio un componente aparte: dos estados vacios se desincronizan en el
 * primer cambio de copy, y el 04-UI-SPEC.md §15.1 lo prohibe explicitamente.
 */

/**
 * Las clases de las dos variantes viven en una funcion aparte, y no en un `if`
 * que devuelva dos arboles JSX distintos, por dos razones:
 *
 *   1. La estructura es identica en las dos variantes. Duplicar el JSX es como
 *      se pierde el `aria-hidden` o el `h2` de una de las dos.
 *   2. El entorno de vitest de este repo es `node` y no hay testing-library, asi
 *      que exponer las clases como dato es lo que hace verificable la variante
 *      sin ampliar el stack.
 *
 * Las cadenas de la variante por defecto estan escritas literales, en el mismo
 * orden que tenian en la Fase 2, a proposito: cualquier reordenamiento seria un
 * cambio invisible en tres superficies ya entregadas.
 */
export function clasesDeEstadoVacio(compacto = false) {
  return compacto
    ? {
        contenedor: 'flex flex-col items-center gap-lg py-xl text-center',
        icono: 'size-6 text-muted-foreground',
        // 14/600. `text-body` fija el peso en 400, y `font-semibold` lo pisa:
        // son grupos distintos de utilidad, asi que conviven. Es el mismo par
        // que ya usan la tabla de apartamentos y ConectarCalendario.
        encabezado: 'text-body font-semibold text-foreground',
        // 12/400. `text-micro` no declara peso a proposito (02-UI-SPEC.md §3),
        // asi que el parrafo hereda el 400 del `body`.
        cuerpo: 'max-w-vacio text-micro text-muted-foreground',
      }
    : {
        contenedor: 'flex flex-col items-center gap-lg py-3xl text-center',
        icono: 'size-8 text-muted-foreground',
        encabezado: 'text-heading text-foreground',
        cuerpo: 'max-w-vacio text-body text-muted-foreground',
      };
}

export function EstadoVacio({
  icono: Icono,
  encabezado,
  cuerpo,
  accion,
  compacto = false,
  claseIcono,
}: {
  icono: LucideIcon;
  encabezado: string;
  cuerpo: string;
  accion?: ReactNode;
  /** Variante para cards del carril lateral de 360px. Ver §15.1. */
  compacto?: boolean;
  /**
   * Color del icono, cuando el contrato lo fija distinto del gris por defecto.
   *
   * Lo pide la bandeja vacia (04-UI-SPEC.md §9): `Check` en `--status-ok`,
   * porque ahi el vacio es un BUEN resultado —no queda nada por confirmar— y no
   * la ausencia neutra de datos que representan los otros cuatro vacios. Es
   * `cn()` sobre las clases de la variante, asi que el TAMANO lo sigue fijando
   * `compacto` y quien llama no puede pisarlo por accidente.
   */
  claseIcono?: string;
}) {
  const clases = clasesDeEstadoVacio(compacto);

  return (
    <div className={clases.contenedor}>
      <Icono className={cn(clases.icono, claseIcono)} strokeWidth={2} aria-hidden="true" />

      <div className="flex flex-col gap-sm">
        <h2 className={clases.encabezado}>{encabezado}</h2>

        {/*
          44ch es el limite del contrato, y esta ahi por legibilidad: una linea
          mas larga obliga al ojo a buscar el inicio de la siguiente. Rige en las
          dos variantes: en la compacta el texto es mas pequeno, no mas ancho.
        */}
        <p className={clases.cuerpo}>{cuerpo}</p>
      </div>

      {accion}
    </div>
  );
}
