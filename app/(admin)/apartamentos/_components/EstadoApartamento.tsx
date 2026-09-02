import { CircleCheck, CircleDashed, CircleMinus, TriangleAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import {
  estadoDeApartamento,
  type ClaveEstadoApartamento,
  type EntradaEstadoApartamento,
} from '@/lib/domain/properties';
import { cn } from '@/lib/utils';

/**
 * Estado de un apartamento: LOS TRES CANALES A LA VEZ (UI-SPEC §5 y §13).
 *
 * ── ESTE COMPONENTE NO DECIDE NADA ─────────────────────────────────────────
 * La derivacion vive entera en `estadoDeApartamento()` de `lib/domain/properties.ts`,
 * que es la unica del repo y el espejo de los tres CHECK de `properties`
 * (`props_active_requires_rates`, `props_active_requires_owner`,
 * `props_assignees_only_when_managed`). Reescribir aqui el `if` es exactamente
 * como la UI se desincroniza de la base: el dia que la regla cambie, cambiaria en
 * un sitio y no en el otro, y el sintoma seria una fila que dice `Inactiva`
 * mientras Postgres la rechaza por incompleta.
 *
 * Lo que SI decide este archivo es la PRESENTACION: que icono, que color. El
 * modulo de dominio es puro y no importa React ni lucide a proposito.
 *
 * ── POR QUE NUNCA COLOR SOLO ───────────────────────────────────────────────
 * Son 39 filas. Una columna de puntos de colores es ilegible para un admin
 * daltonico, no la lee un lector de pantalla, no la encuentra el buscador del
 * navegador y obliga a cualquiera a recordar la leyenda. Por eso cada estado
 * lleva icono de FORMA DISTINTA (circulo con check, triangulo, circulo con
 * menos, circulo punteado), etiqueta de TEXTO y color, los tres.
 *
 * Las cuatro formas son distinguibles en monocromo, que es el test de verdad:
 * si dos estados solo se diferencian por el color del mismo circulo, el icono no
 * esta aportando un segundo canal.
 */

/** Icono y color por estado. Las etiquetas vienen del dominio, no de aqui. */
const PRESENTACION: Record<ClaveEstadoApartamento, { Icono: LucideIcon; color: string }> = {
  activa: { Icono: CircleCheck, color: 'text-status-ok' },
  incompleta: { Icono: TriangleAlert, color: 'text-status-warn' },
  inactiva: { Icono: CircleMinus, color: 'text-status-idle' },
  informativa: { Icono: CircleDashed, color: 'text-status-info' },
};

export function EstadoApartamento({ fila }: { fila: EntradaEstadoApartamento }) {
  const { clave, etiqueta } = estadoDeApartamento(fila);
  const { Icono, color } = PRESENTACION[clave];

  return (
    <span
      // `data-estado` no es decorativo: es lo que permite contar filas por estado
      // sin depender del texto visible, y hace que el DOM diga la clave del
      // dominio y no solo su traduccion.
      data-estado={clave}
      className={cn('flex items-center gap-xs text-micro font-semibold', color)}
    >
      {/*
        14px dentro de celda de tabla (§13). `aria-hidden` porque va ACOMPANADO
        de la etiqueta: anunciarlo seria leer el estado dos veces.
      */}
      <Icono className="size-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
      {etiqueta}
    </span>
  );
}

/**
 * Leyenda de una linea con los cuatro pares icono+etiqueta (UI-SPEC §5).
 *
 * Va DEBAJO de la tabla y no encima: quien ya sabe leer los iconos no tiene que
 * saltarsela cada vez que entra.
 *
 * Es una `<ul>` y no cuatro `<span>` sueltos para que un lector de pantalla
 * anuncie "lista de 4 elementos" en vez de una tirada de palabras sin estructura.
 */
export function LeyendaDeEstados() {
  return (
    <ul className="flex flex-wrap items-center gap-lg text-micro text-muted-foreground">
      {(Object.keys(PRESENTACION) as ClaveEstadoApartamento[]).map((clave) => {
        const { Icono, color } = PRESENTACION[clave];
        return (
          <li key={clave} className="flex items-center gap-xs">
            <Icono className={cn('size-3.5 shrink-0', color)} strokeWidth={2} aria-hidden="true" />
            {ETIQUETAS_LEYENDA[clave]}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Las etiquetas de la leyenda salen de la MISMA derivacion que las de las filas,
 * llamandola con una entrada minima por estado, en vez de repetir las cuatro
 * cadenas aqui. Una leyenda que dijera `Pausada` mientras la fila dice `Inactiva`
 * es peor que no tener leyenda.
 */
const ETIQUETAS_LEYENDA: Record<ClaveEstadoApartamento, string> = {
  activa: estadoDeApartamento({
    gestion_vivaguest: true,
    is_active: true,
    tarifa_huesped: 1,
    pago_aseador: 1,
    responsable_id: 'x',
  }).etiqueta,
  incompleta: estadoDeApartamento({
    gestion_vivaguest: true,
    is_active: false,
    tarifa_huesped: null,
    pago_aseador: null,
    responsable_id: null,
  }).etiqueta,
  inactiva: estadoDeApartamento({
    gestion_vivaguest: true,
    is_active: false,
    tarifa_huesped: 1,
    pago_aseador: 1,
    responsable_id: 'x',
  }).etiqueta,
  informativa: estadoDeApartamento({
    gestion_vivaguest: false,
    is_active: false,
    tarifa_huesped: null,
    pago_aseador: null,
    responsable_id: null,
  }).etiqueta,
};
