'use client';

import { CircleCheck, CircleMinus } from 'lucide-react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { AseadorConAsignaciones, AsignacionApartamento } from '@/lib/data/aseadores';
import { apartamentos } from '@/lib/domain/plural';
import { cn } from '@/lib/utils';

import { EstadoAvisosAseador, LeyendaDeAvisos } from '../../_components/EstadoAvisosAseador';
import { MenuAseador } from './MenuAseador';

/**
 * Lista de aseadores (ASEADOR-03, UI-SPEC §11.1).
 *
 * Client Component por el `Popover` que abre la lista de nombres. Los datos
 * llegan ya resueltos desde el RSC: aqui no hay ninguna consulta.
 */

/**
 * Celda de conteo con `Popover` que lista los nombres.
 *
 * Con cero asignaciones se pinta texto plano y NO un boton: un disparador que
 * abre un popover vacio es una promesa incumplida, y ademas mete en el recorrido
 * de teclado un control que no lleva a ningun lado.
 */
function CeldaAsignaciones({
  apartamentosAsignados,
  etiqueta,
}: {
  apartamentosAsignados: AsignacionApartamento[];
  etiqueta: string;
}) {
  const total = apartamentosAsignados.length;
  const texto = apartamentos(total);

  if (total === 0) {
    return <span className="tabular-nums">{texto}</span>;
  }

  return (
    <Popover>
      <PopoverTrigger
        aria-label={`${etiqueta}: ${texto}`}
        className="transicion rounded-sm tabular-nums underline decoration-dotted underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {texto}
      </PopoverTrigger>

      <PopoverContent align="start" className="gap-sm">
        <p className="text-micro font-semibold text-muted-foreground uppercase">{etiqueta}</p>
        <ul className="flex flex-col gap-xs">
          {apartamentosAsignados.map((p) => (
            <li key={p.id} className="text-body text-foreground">
              {p.nombre}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Estado del aseador: LOS TRES CANALES A LA VEZ (UI-SPEC §5 y §13).
 *
 * Forma del icono + etiqueta de texto + color. Una columna de puntos de colores
 * es ilegible para un admin daltonico, y ademas no la puede leer un lector de
 * pantalla ni encontrarla el buscador del navegador.
 */
function EstadoAseador({ activo }: { activo: boolean }) {
  const Icono = activo ? CircleCheck : CircleMinus;

  return (
    <span
      className={cn(
        'flex items-center gap-xs text-micro font-semibold',
        activo ? 'text-status-ok' : 'text-status-idle',
      )}
    >
      <Icono className="size-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
      {activo ? 'Activo' : 'Inactivo'}
    </span>
  );
}

export function TablaAseadores({
  aseadores,
  ahoraMs,
}: {
  aseadores: AseadorConAsignaciones[];
  /**
   * El instante en que el RSC leyo la base. Baja desde `page.tsx`, que lee el
   * reloj UNA vez, igual que `leidoEnMs` en `/operacion`: leerlo por fila daria
   * una marca distinta en cada `title` y otra distinta en servidor y cliente.
   */
  ahoraMs: number;
}) {
  return (
    <div className="flex flex-col gap-lg">
      <div className="overflow-hidden rounded-md border border-border bg-background">
        <Table>
          <TableHeader>
            {/*
              `sticky top-barra` esta puesto porque es lo que pide el contrato, PERO
              hoy no engancha: el componente `Table` de shadcn envuelve la tabla en un
              div con `overflow-x-auto`, y un `overflow-x` distinto de `visible`
              convierte el div en el scrollport del sticky, en vez del viewport. Con
              ~8 aseadores la tabla nunca desborda a lo alto, asi que no se nota.
              DONDE SI VA A MORDER es en la tabla de 39 apartamentos del plan 02-11:
              ahi hay que sacar la tabla del contenedor con overflow o el encabezado
              se va con el scroll.
            */}
            <TableRow className="sticky top-barra z-10 h-fila-encabezado bg-canvas hover:bg-canvas">
              <TableHead className="sticky left-0 w-col-estado bg-canvas px-md text-micro font-semibold tracking-columna text-muted-foreground uppercase">
                Estado
              </TableHead>
              <TableHead className="sticky left-col-estado min-w-col-nombre bg-canvas px-md text-micro font-semibold tracking-columna text-muted-foreground uppercase">
                Nombre
              </TableHead>
              <TableHead className="w-col-telefono px-md text-micro font-semibold tracking-columna text-muted-foreground uppercase">
                Teléfono
              </TableHead>
              {/*
                La columna nueva de D-03 va ENTRE `TELEFONO` y `RESPONSABLE DE`
                (§11.1), y no al final: el telefono y el canal de aviso son la
                misma pregunta —por donde se le llega a esta persona— y separarlos
                con dos columnas de conteos obliga a cruzar la fila con la vista.
                La cuenta de anchos de §2.3 esta hecha: 772px fijos, asi que a
                1280px le quedan 460 a `NOMBRE` contra su minimo de 200.
              */}
              <TableHead className="w-col-avisos px-md text-micro font-semibold tracking-columna text-muted-foreground uppercase">
                Avisos
              </TableHead>
              <TableHead className="w-col-responsable px-md text-micro font-semibold tracking-columna text-muted-foreground uppercase">
                Responsable de
              </TableHead>
              <TableHead className="w-col-suplente px-md text-micro font-semibold tracking-columna text-muted-foreground uppercase">
                Suplente en
              </TableHead>
              <TableHead className="w-col-menu px-md">
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {aseadores.map((aseador) => (
              <TableRow
                key={aseador.id}
                // Sin zebra: zebra + iconos de color es ruido (§7.2). El hover va a
                // `--canvas`, no al `--muted/50` que trae shadcn.
                className={cn(
                  'transicion h-fila border-b border-border hover:bg-canvas',
                  // La fila de un desactivado baja de peso, pero NO desaparece:
                  // desaparecer una fila tras una accion destructiva es como el admin
                  // pierde la noción de a quién desactivó.
                  !aseador.is_active && 'text-muted-foreground',
                )}
              >
                <TableCell className="sticky left-0 w-col-estado bg-inherit px-md">
                  <EstadoAseador activo={aseador.is_active} />
                </TableCell>

                <TableCell className="sticky left-col-estado min-w-col-nombre bg-inherit px-md text-body font-semibold">
                  {aseador.full_name}
                </TableCell>

                <TableCell className="w-col-telefono px-md text-body tabular-nums">
                  {aseador.phone ?? (
                    <>
                      <span aria-hidden="true">—</span>
                      <span className="sr-only">sin definir</span>
                    </>
                  )}
                </TableCell>

                <TableCell className="w-col-avisos px-md text-body">
                  {/*
                    La celda NO tinta la fila, NO le cambia el peso y NO lleva
                    rojo (§4.2 y §11.1). El unico cambio de peso de esta tabla
                    sigue siendo el del aseador desactivado, y se queda como esta:
                    un aseador sin avisos no es un aseador con problemas.
                  */}
                  <EstadoAvisosAseador
                    estado={{ ...aseador.estadoDeAvisos, is_active: aseador.is_active }}
                    ahoraMs={ahoraMs}
                  />
                </TableCell>

                <TableCell className="w-col-responsable px-md text-body">
                  <CeldaAsignaciones
                    apartamentosAsignados={aseador.responsableDe}
                    etiqueta="Responsable de"
                  />
                </TableCell>

                <TableCell className="w-col-suplente px-md text-body">
                  <CeldaAsignaciones
                    apartamentosAsignados={aseador.suplenteEn}
                    etiqueta="Suplente en"
                  />
                </TableCell>

                <TableCell className="w-col-menu px-md">
                  {/*
                    El plan 02-07 dejo este menu montado y VACIO para no mover el
                    ancho de las otras cinco columnas al anadirlo despues. Aqui se
                    cablea: `Desactivar` con su dialogo de consecuencias reales y
                    `Reactivar` directo, segun el estado de la fila.
                  */}
                  <MenuAseador
                    aseador={{
                      id: aseador.id,
                      full_name: aseador.full_name,
                      is_active: aseador.is_active,
                    }}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/*
        Leyenda de §11.1, en 12px y bajo la tabla. Cubre los tres estados de
        avisos y no los dos de `ESTADO`: `Activo` / `Inactivo` se explican solos
        con su etiqueta, y la diferencia entre `Activos` y `Sin probar` no, que
        es justo la que D-02 exige que exista.
      */}
      <LeyendaDeAvisos />
    </div>
  );
}
