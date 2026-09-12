'use client';

import { useState } from 'react';

import type { AseosDelDia, FilaDeAseoDelAseador } from '@/lib/data/aseos-del-aseador';

import { HojaDeAseo } from './HojaDeAseo';
import { TarjetaDeAseoHome } from './TarjetaDeAseoHome';

/**
 * El home del aseador. D-01, PWA-01.
 *
 * ── LO QUE ESTA PANTALLA NO MUESTRA, Y ES DELIBERADO ────────────────────────
 *
 * No hay contador de acciones pendientes, ni estado de cola, ni indicador de
 * sincronizacion. El modo sin senal esta diferido (D-08), y una interfaz que
 * sugiere que el trabajo se guardo en el telefono **cuando no es cierto** es
 * peor que no tener offline: la aseadora cerraria la app confiada.
 *
 * `06-UI-SPEC.md` §11.4 lo convierte en prohibicion activa.
 */
export function ListaDeAseos({ datos }: { datos: AseosDelDia }) {
  const [abierto, setAbierto] = useState<FilaDeAseoDelAseador | null>(null);

  if (datos.deHoy.length === 0) {
    return (
      <div className="flex flex-col gap-xs">
        <p className="text-body-movil text-foreground">No tienes aseos hoy.</p>
        <p className="text-body-movil text-muted-foreground">
          Cuando te asignen uno, te va a llegar un aviso al teléfono.
        </p>
        {datos.conteoDeManana > 0 && (
          <p className="pt-md text-micro-movil text-muted-foreground">
            Mañana tienes {datos.conteoDeManana}{' '}
            {datos.conteoDeManana === 1 ? 'aseo' : 'aseos'}.
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-lg">
        {datos.deHoy.map((fila) => (
          <li key={fila.id}>
            <TarjetaDeAseoHome
              fila={fila}
              hoy={datos.hoy}
              ahoraMs={datos.leidoEnMs}
              onAbrir={() => setAbierto(fila)}
            />
          </li>
        ))}
      </ul>

      {/* Informacion, no accion: sin expansion y sin destino de toque. */}
      {datos.conteoDeManana > 0 && (
        <p className="text-micro-movil text-muted-foreground">
          Mañana tienes {datos.conteoDeManana}{' '}
          {datos.conteoDeManana === 1 ? 'aseo' : 'aseos'}.
        </p>
      )}

      <HojaDeAseo
        fila={abierto}
        abierta={abierto !== null}
        onCerrar={() => setAbierto(null)}
      />
    </>
  );
}
