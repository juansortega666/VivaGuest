'use client';

import { Hourglass, Users } from 'lucide-react';

import type { FilaDeAseoDelAseador } from '@/lib/data/aseos-del-aseador';
import { formatFechaBog } from '@/lib/domain/dates';
import { cn } from '@/lib/utils';

/**
 * Una tarjeta del home. D-01.
 *
 * ── TODA LA TARJETA ES EL DESTINO DEL TOQUE ─────────────────────────────────
 *
 * Y es un `button` de verdad, no un `div` con manejador: el area es grande a
 * proposito (la aseadora la toca con guantes, de pie, con una mano) y tiene que
 * ser focalizable por teclado y anunciable por un lector de pantalla.
 *
 * No hay ningun boton DENTRO de la tarjeta, porque dos destinos de toque
 * anidados en un area de 44px son un toque equivocado esperando a pasar.
 */

const PRESENTACION = {
  pendiente: { etiqueta: 'Pendiente', color: 'text-status-idle' },
  en_curso: { etiqueta: 'En curso', color: 'text-primary' },
  completada: { etiqueta: 'Terminado', color: 'text-status-ok' },
} as const;

type ClaveDeEstado = keyof typeof PRESENTACION;

/**
 * El estado, sin rama por defecto A PROPOSITO: el dia que la migracion anada un
 * quinto valor de `cleaning_state`, `tsc` rompe aqui. Misma regla que
 * `estadoDeAseo()` en `lib/domain/cleanings.ts`.
 */
function presentacionDe(estado: string | null): (typeof PRESENTACION)[ClaveDeEstado] {
  if (estado === 'pendiente' || estado === 'en_curso' || estado === 'completada') {
    return PRESENTACION[estado];
  }
  // Un badge que miente sobre un aseo es peor que una pantalla que se cae.
  throw new Error(`estado de aseo inalcanzable en el home: ${estado}`);
}

/** La hora limite ya paso y el aseo sigue vivo. Mismo lenguaje que el dashboard. */
function estaVencido(fila: FilaDeAseoDelAseador, hoy: string, ahoraMs: number): boolean {
  if (fila.state === 'completada') return false;
  if (fila.scheduled_date > hoy) return false;
  const [h, m] = fila.hora_limite.split(':').map(Number);
  const limite = new Date(ahoraMs);
  limite.setHours(h, m, 0, 0);
  return ahoraMs > limite.getTime();
}

export function TarjetaDeAseoHome({
  fila,
  hoy,
  ahoraMs,
  onAbrir,
}: {
  fila: FilaDeAseoDelAseador;
  hoy: string;
  ahoraMs: number;
  onAbrir: () => void;
}) {
  const estado = presentacionDe(fila.state);
  const vencido = estaVencido(fila, hoy, ahoraMs);
  const hhmm = fila.hora_limite.slice(0, 5);

  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-label={`${fila.property?.nombre ?? 'Apartamento'}, ${estado.etiqueta}, antes de las ${hhmm}`}
      className="transicion flex w-full flex-col gap-md rounded-md border border-border bg-background p-lg text-left"
    >
      <div className="flex items-start justify-between gap-md">
        <div className="flex min-w-0 flex-col">
          <span className="text-heading-movil text-foreground">
            {fila.property?.nombre ?? 'Apartamento'}
          </span>
          <span className="text-body-movil text-muted-foreground">
            {fila.property?.cluster ?? ''}
          </span>
        </div>
        {/* Nunca color solo: icono, etiqueta y color, los tres. */}
        <span className={cn('shrink-0 text-micro-movil font-semibold', estado.color)}>
          {'●'} {estado.etiqueta}
        </span>
      </div>

      <div className="flex items-center gap-lg">
        <span
          className={cn(
            'flex items-center gap-xs text-body-movil tabular-nums',
            vencido ? 'text-status-warn' : 'text-foreground',
          )}
        >
          <Hourglass
            size={20}
            strokeWidth={2}
            aria-label={vencido ? 'Se venció la hora límite' : undefined}
            aria-hidden={vencido ? undefined : true}
          />
          Antes de las {hhmm}
        </span>

        <span className="flex items-center gap-xs text-body-movil tabular-nums text-foreground">
          <Users size={20} strokeWidth={2} aria-hidden="true" />
          {fila.num_huespedes ?? 0}
        </span>
      </div>

      <span className="sr-only">{formatFechaBog(fila.scheduled_date)}</span>
    </button>
  );
}
