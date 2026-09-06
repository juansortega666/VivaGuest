import { CalendarX } from 'lucide-react';

import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { FilaDeOperacion } from '@/lib/data/operacion';

import { EstadoVacio } from '../../_components/EstadoVacio';
import { FilaAseo } from './FilaAseo';
import type { ContextoDeAcciones } from './MenuAseo';

/**
 * La tabla densa de UN dia (04-UI-SPEC.md §7 y §8.1).
 *
 * Sin paginacion y sin virtualizacion: decenas de filas de 40px son un solo
 * render y caben en una pantalla de 1080p, asi que virtualizar solo anadiria una
 * libreria y un bug de scroll.
 *
 * ── TRAMPA HEREDADA DEL PLAN 02-07, NO SE REDISENA ──────────────────────────
 * El `Table` de shadcn envuelve la tabla en un div con `overflow-x-auto`, y un
 * `overflow-x` distinto de `visible` convierte ESE div en el scrollport de
 * cualquier `position: sticky` de dentro, en vez del viewport. La salida ya esta
 * escrita en `TablaApartamentos.tsx:246` y aqui se copia tal cual: por encima de
 * 1280px las seis columnas caben y el contenedor puede ser visible; por debajo si
 * hace falta scroll horizontal dentro de la card.
 *
 * El encabezado de esta tabla NO es sticky, a diferencia del de la tabla de
 * apartamentos, y es deliberado: en esta pantalla hay tres o mas tablas apiladas,
 * y tres encabezados pegados al mismo `top` se solapan entre ellos.
 */

/**
 * Orden dentro de un dia: `hora_limite` ascendente y despues nombre del
 * apartamento (§7.2).
 *
 * LOS SIN CONFIRMAR NO FLOTAN ARRIBA. Su superficie es la bandeja del carril
 * lateral, y duplicarlos arriba del dia los listaria dos veces en la misma
 * pantalla.
 *
 * La consulta ya viene ordenada por `scheduled_date` y `hora_limite`, pero el
 * desempate por nombre no lo puede dar PostgREST: el nombre vive en el embed. Se
 * hace aqui, sobre una copia, porque `filas` es la misma lista que alimenta la
 * bandeja y los chips y reordenarla por debajo cambiaria la pantalla entera.
 *
 * `localeCompare('es-CO')` y no `<`: un `sort()` a secas compara puntos de codigo
 * UTF-16 y manda 'Alamos' despues de 'Zipaquira'.
 */
function ordenarFilasDelDia(filas: FilaDeOperacion[]): FilaDeOperacion[] {
  return [...filas].sort((a, b) => {
    if (a.hora_limite !== b.hora_limite) return a.hora_limite < b.hora_limite ? -1 : 1;
    return (a.property?.nombre ?? '').localeCompare(b.property?.nombre ?? '', 'es-CO');
  });
}

/** El tratamiento de encabezado de columna de §7.2: 32px, `--canvas`, 12/600. */
const TH = 'px-md text-micro font-semibold tracking-columna text-muted-foreground uppercase';

export function TablaDia({
  filas,
  acciones,
}: {
  filas: FilaDeOperacion[];
  /**
   * Lo que el menu de cada fila necesita y la fila no trae. Atraviesa este
   * componente sin usarse: `TablaDia` no monta el menu, lo monta `FilaAseo`.
   */
  acciones: ContextoDeAcciones;
}) {
  if (filas.length === 0) {
    return (
      <EstadoVacio
        icono={CalendarX}
        encabezado="Ningún aseo para este día."
        cuerpo="Si esperabas alguno, revisa que el calendario del apartamento esté conectado."
      />
    );
  }

  const ordenadas = ordenarFilasDelDia(filas);
  const hayInertes = ordenadas.some((fila) => !fila.is_managed);

  return (
    <>
      <Table containerClassName="overflow-x-visible max-xl:overflow-x-auto">
        <TableHeader>
          <TableRow className="h-fila-encabezado bg-canvas hover:bg-canvas">
            <TableHead className={`w-col-estado-aseo ${TH}`}>Estado</TableHead>
            <TableHead className={`min-w-col-nombre ${TH}`}>Apartamento</TableHead>
            <TableHead className={`w-col-hora text-right ${TH}`}>Hora límite</TableHead>
            {/*
              `A CARGO` y no `ASEADOR`: es la unica columna que sirve a la vez al
              aseador de una fila gestionada y al contacto externo de una inerte.
              Dos encabezados distintos exigirian dos tablas (§7.1).
            */}
            <TableHead className={`w-col-acargo ${TH}`}>A cargo</TableHead>
            <TableHead className={`w-col-huespedes text-right ${TH}`}>Huéspedes</TableHead>
            <TableHead className="w-col-menu px-md">
              <span className="sr-only">Acciones</span>
            </TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {ordenadas.map((fila) => (
            <FilaAseo key={fila.id} fila={fila} acciones={acciones} />
          ))}
        </TableBody>
      </Table>

      {/*
        ESTA FRASE ES LO QUE MATA DE RAIZ LA LECTURA "¿esto esta roto?" (§7.4).
        Sin ella, la primera vez que el admin vea una fila sin estado y sin menu la
        va a reportar como bug. Solo aparece si el dia tiene al menos una fila
        inerte: en un dia sin ninguna, explicaria algo que no esta en pantalla.
      */}
      {hayInertes && (
        <p className="border-t border-border px-md py-sm text-micro text-muted-foreground">
          Las unidades de gestión externa aparecen para que el día quede completo. VivaGuest no
          las opera.
        </p>
      )}
    </>
  );
}
