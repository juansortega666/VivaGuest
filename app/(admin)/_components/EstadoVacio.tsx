import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Estado vacio del admin (UI-SPEC §9.2).
 *
 * Recibe icono, encabezado, cuerpo y accion como props porque lo consumen tres
 * superficies distintas de la fase: la lista de aseadores (este plan), la
 * busqueda sin resultados (plan 02-11) y el apartamento sin cuartos (plan 02-13).
 * Meter el copy dentro del componente obligaria a una variante por pantalla.
 *
 * El icono llega por prop y NO se elige aqui: la lista de iconos de §14.3 es
 * cerrada, y quien monta la pantalla es quien sabe cual de esa lista aplica.
 */
export function EstadoVacio({
  icono: Icono,
  encabezado,
  cuerpo,
  accion,
}: {
  icono: LucideIcon;
  encabezado: string;
  cuerpo: string;
  accion?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-lg py-3xl text-center">
      <Icono className="size-8 text-muted-foreground" strokeWidth={2} aria-hidden="true" />

      <div className="flex flex-col gap-sm">
        <h2 className="text-heading text-foreground">{encabezado}</h2>

        {/*
          44ch es el limite del contrato, y esta ahi por legibilidad: una linea
          mas larga obliga al ojo a buscar el inicio de la siguiente.
        */}
        <p className="max-w-vacio text-body text-muted-foreground">{cuerpo}</p>
      </div>

      {accion}
    </div>
  );
}
