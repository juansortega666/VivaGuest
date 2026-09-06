import { CircleCheck, CircleDashed, CircleSlash, Clock, Inbox, Play } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import {
  estadoDeAseo,
  type ClaveEstadoAseo,
  type EntradaEstadoAseo,
  type IconoEstadoAseo,
} from '@/lib/domain/cleanings';
import { cn } from '@/lib/utils';

/**
 * Estado de un aseo: LOS TRES CANALES A LA VEZ (04-UI-SPEC.md §5).
 *
 * ── ESTE COMPONENTE NO DECIDE NADA ─────────────────────────────────────────
 * La derivacion vive entera en `estadoDeAseo()` de `lib/domain/cleanings.ts`, que
 * es el espejo de `cl_unmanaged_is_inert` y `cl_managed_has_state`. Duplicar aqui
 * el `if` es exactamente como la UI se desincroniza de la base: el dia que la
 * regla cambie, cambiaria en un sitio y no en el otro, y el sintoma seria una
 * fila que dice `Pendiente` mientras Postgres la tiene cancelada.
 *
 * A diferencia de `EstadoApartamento`, aqui el color y el NOMBRE del icono
 * tambien vienen del dominio, porque esta derivacion tiene cuatro consumidores
 * (fila de la tabla, bandeja, panel de alertas e historial). Lo unico que decide
 * este archivo es la traduccion de ese nombre al componente de lucide, que es lo
 * que el modulo de dominio no puede hacer sin dejar de ser puro.
 *
 * ── POR QUE NUNCA COLOR SOLO ───────────────────────────────────────────────
 * Son decenas de filas. Cada estado lleva icono de FORMA DISTINTA, etiqueta de
 * TEXTO y color, los tres. Las seis siluetas son distinguibles en escala de
 * grises —bandeja, reloj, triangulo relleno, circulo con check, circulo con barra
 * y circulo punteado—, que es el test de verdad: si dos estados solo se
 * diferencian por el color del mismo circulo, el icono no aporta un segundo
 * canal.
 */

/**
 * Los seis iconos de la lista cerrada de §17.3.
 *
 * El `Record` esta indexado por `IconoEstadoAseo`, que es una union de literales:
 * si el dominio anade una septima clave, `tsc` rompe aqui en vez de renderizar
 * `undefined` como componente en el navegador.
 */
const ICONOS: Record<IconoEstadoAseo, LucideIcon> = {
  Inbox,
  Clock,
  Play,
  CircleCheck,
  CircleSlash,
  CircleDashed,
};

export function EstadoAseo({ aseo }: { aseo: EntradaEstadoAseo }) {
  const { clave, icono, etiqueta, clase } = estadoDeAseo(aseo);
  const Icono = ICONOS[icono];

  return (
    <span
      // `data-estado` no es decorativo: permite contar filas por estado sin
      // depender del texto visible, y hace que el DOM diga la clave del dominio y
      // no solo su traduccion.
      data-estado={clave}
      className={cn('flex items-center gap-xs text-micro font-semibold', clase)}
    >
      {/*
        14px dentro de celda de tabla (§13). `aria-hidden` porque va ACOMPANADO de
        la etiqueta: anunciarlo seria leer el estado dos veces.
      */}
      <Icono className="size-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
      {etiqueta}
    </span>
  );
}

/**
 * Entradas minimas que producen cada una de las seis claves.
 *
 * Las etiquetas y los iconos de la leyenda salen de la MISMA derivacion que los
 * de las filas, llamandola con estas entradas, en vez de repetir aqui las seis
 * cadenas. Una leyenda que dijera `Completado` mientras la fila dice `Terminado`
 * es peor que no tener leyenda.
 *
 * El orden es el de §5, que es el del ciclo de vida del aseo, y la unidad de
 * gestion externa al final porque no es un estado del ciclo sino otra cosa.
 */
const MUESTRAS: ReadonlyArray<readonly [ClaveEstadoAseo, EntradaEstadoAseo]> = [
  ['sin_confirmar', { is_managed: true, state: 'pendiente', confirmado_at: null }],
  ['pendiente', { is_managed: true, state: 'pendiente', confirmado_at: '2026-09-03T12:00:00Z' }],
  ['en_curso', { is_managed: true, state: 'en_curso', confirmado_at: '2026-09-03T12:00:00Z' }],
  ['terminado', { is_managed: true, state: 'completada', confirmado_at: '2026-09-03T12:00:00Z' }],
  ['cancelado', { is_managed: true, state: 'cancelada', confirmado_at: null }],
  ['externa', { is_managed: false, state: null, confirmado_at: null }],
];

/**
 * Leyenda de los seis pares icono+etiqueta (§5).
 *
 * Va UNA SOLA VEZ, al pie del carril ancho y despues del bloque `Siguientes`.
 * Repetirla bajo cada uno de los tres dias seria tres veces el mismo parrafo.
 *
 * Es una `<ul>` y no seis `<span>` sueltos para que un lector de pantalla anuncie
 * "lista de 6 elementos" en vez de una tirada de palabras sin estructura.
 */
export function LeyendaDeAseos() {
  return (
    <ul className="flex flex-wrap items-center gap-lg text-micro text-muted-foreground">
      {MUESTRAS.map(([clave, muestra]) => {
        const { icono, etiqueta, clase } = estadoDeAseo(muestra);
        const Icono = ICONOS[icono];

        return (
          <li key={clave} className="flex items-center gap-xs">
            <Icono className={cn('size-3.5 shrink-0', clase)} strokeWidth={2} aria-hidden="true" />
            {etiqueta}
          </li>
        );
      })}
    </ul>
  );
}
