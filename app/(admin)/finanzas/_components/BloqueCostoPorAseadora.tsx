'use client';

import { Search, Users } from 'lucide-react';
import { useId, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  costoPorAseadora,
  type AseadoraDelPeriodo,
  type OrdenDelBloque,
} from '@/lib/domain/finanzas';

import { EstadoVacio } from '../../_components/EstadoVacio';
import { FilaAseadora } from './FilaAseadora';

/**
 * El bloque 3 del Resumen: cuanto cuesta cada aseadora (07-UI-SPEC §6.5).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * EL ORDEN POR DEFECTO ES ALFABETICO, Y NO ES UNA PREFERENCIA DE ESTILO.
 *
 * Una lista de PERSONAS ordenada de mayor a menor **se lee como un podio aunque
 * no lleve numeros ni medallas**, y este tema ya demostro ser sensible: fue
 * exactamente la razon por la que el dueno descarto el revenue por persona.
 * Prohibir la numeracion y dejar el orden descendente seria cerrar la puerta y
 * dejar la ventana abierta.
 *
 * Alfabetico por defecto elimina esa lectura sin perder nada: quien necesite ver
 * los compromisos grandes primero toca el selector y lo cambia. La diferencia es
 * que entonces **es una pregunta que alguien hizo**, no una jerarquia que la
 * pantalla afirma sola.
 *
 * **La eleccion no se persiste entre sesiones.** Cada vez que se abre la
 * seccion, la lista vuelve a alfabetico. Persistirla convertiria una consulta
 * puntual en el estado permanente de la pantalla, que es justo lo que se quiere
 * evitar. Por eso el orden vive en estado de cliente y no en la direccion de la
 * pagina: si viajara en la URL, un enlace compartido llevaria el podio puesto.
 *
 * ── EL BUSCADOR SOLO EXISTE CUANDO HAY ALGO QUE BUSCAR ───────────────────
 *
 * El dueno lo pidio "para cuando el equipo crezca y la lista deje de caber". Con
 * ocho personas no hay nada que buscar, y un campo de 320px permanentemente
 * vacio sobre ocho filas es ruido. Se renderiza por encima de ese umbral. Si
 * algun dia se quiere siempre, es cambiar una constante.
 *
 * **Y el denominador de la barra sigue siendo el total del periodo completo**
 * aunque se filtre. Esa regla la sostiene el dominio, que calcula la proporcion
 * ANTES de filtrar: si la escala cambiara al buscar, buscar a una persona la
 * dejaria al cien por cien del ancho por el mero hecho de haberla buscado, y la
 * barra mentiria.
 *
 * ── POR QUE ES COMPONENTE DE CLIENTE ─────────────────────────────────────
 *
 * Por el orden y la busqueda, que son dos preguntas del momento sobre datos ya
 * cargados. Ir al servidor por ellas seria un viaje de red para reordenar ocho
 * filas que ya estan en la pantalla.
 * ════════════════════════════════════════════════════════════════════════════
 */

/**
 * A partir de cuantas filas aparece el buscador.
 *
 * Ocho es el tamano del equipo real: con el equipo de hoy, el campo no existe.
 */
const FILAS_PARA_BUSCADOR = 8;

/** Las dos opciones, con el copy exacto del contrato. */
const ORDENES: { valor: OrdenDelBloque; etiqueta: string }[] = [
  { valor: 'nombre', etiqueta: 'Por nombre' },
  { valor: 'monto', etiqueta: 'Por monto, de mayor a menor' },
];

export function BloqueCostoPorAseadora({
  aseadoras,
  rango,
  ancla,
}: {
  aseadoras: AseadoraDelPeriodo[];
  rango: string;
  ancla: string;
}) {
  const [orden, setOrden] = useState<OrdenDelBloque>('nombre');
  const [busqueda, setBusqueda] = useState('');
  const idBuscador = useId();

  // El dominio calcula la proporción contra la lista completa, filtra y ordena,
  // en ese orden. La secuencia no es de estilo: hacerla al revés es el defecto
  // que convierte el bloque en un podio.
  const filas = useMemo(
    () => costoPorAseadora(aseadoras, { orden, busqueda }),
    [aseadoras, orden, busqueda],
  );

  const hayBuscador = aseadoras.length > FILAS_PARA_BUSCADOR;

  return (
    <div className="rounded-md border border-border bg-background">
      <div className="flex flex-wrap items-center justify-between gap-md border-b border-border px-lg py-md">
        {/*
          El título va en presente y sin comparativo. No `Ranking`, no `Más
          costosas`, no `Rendimiento`: el encabezado es la primera cosa que fija
          cómo se lee todo lo de abajo.
        */}
        <h2 className="text-heading text-foreground">Cuánto cuesta cada aseadora</h2>

        {aseadoras.length > 0 && (
          <Select
            value={orden}
            onValueChange={(valor) =>
              setOrden(valor === 'monto' ? 'monto' : 'nombre')
            }
          >
            <SelectTrigger aria-label="Orden de la lista" className="w-filtro-cluster">
              <SelectValue>
                {(valor: string) =>
                  ORDENES.find((o) => o.valor === valor)?.etiqueta ?? 'Por nombre'
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ORDENES.map(({ valor, etiqueta }) => (
                <SelectItem key={valor} value={valor}>
                  {etiqueta}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {hayBuscador && (
        <div className="border-b border-border px-lg py-md">
          <div className="relative">
            {/*
              El icono va dentro del campo y el input se aparta con padding.
              `pointer-events-none` para que un clic sobre el icono llegue al
              input en vez de morir en un svg.
            */}
            <Search
              className="pointer-events-none absolute top-1/2 left-sm size-4 -translate-y-1/2 text-muted-foreground"
              strokeWidth={2}
              aria-hidden="true"
            />
            {/* Etiqueta real y no el placeholder como etiqueta. */}
            <label htmlFor={idBuscador} className="sr-only">
              Buscar aseadora
            </label>
            <Input
              id={idBuscador}
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar aseadora"
              className="w-buscador pl-2xl"
            />
          </div>
        </div>
      )}

      {aseadoras.length === 0 ? (
        <EstadoVacio
          compacto
          icono={Users}
          encabezado="Nadie tiene aseos en este periodo."
          cuerpo="Cuando se haga el primer aseo, acá aparece cuánto cuesta cada persona."
        />
      ) : filas.length === 0 ? (
        <EstadoVacio
          compacto
          icono={Search}
          // Comillas angulares incluidas: es el copy literal del contrato.
          encabezado={`Ninguna aseadora coincide con «${busqueda.trim()}».`}
          cuerpo="Revisa la escritura."
          accion={
            <Button type="button" variant="outline" onClick={() => setBusqueda('')}>
              Limpiar búsqueda
            </Button>
          }
        />
      ) : (
        filas.map((fila, i) => (
          <div key={fila.aseadoraId}>
            {/* Separador entre filas y SIN zebra, igual que las tres tablas que
                ya existen: zebra más barras de proporción es ruido. */}
            {i > 0 && <Separator />}
            <FilaAseadora fila={fila} rango={rango} ancla={ancla} />
          </div>
        ))
      )}
    </div>
  );
}
