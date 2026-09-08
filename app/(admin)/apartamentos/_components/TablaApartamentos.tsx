'use client';

import { CalendarCheck, CalendarX, Search } from 'lucide-react';
import Link from 'next/link';
import { useId, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ApartamentoDeLista } from '@/lib/data/apartamentos';
import { formatCOP } from '@/lib/domain/money';
import {
  estadoDeApartamento,
  filtrarApartamentos,
  resumenDelCatalogo,
} from '@/lib/domain/properties';

import { EstadoVacio } from '../../_components/EstadoVacio';
import { BannerMontaje } from './BannerMontaje';
import { EstadoApartamento, LeyendaDeEstados } from './EstadoApartamento';
import { MenuApartamento } from './MenuApartamento';

/**
 * Tabla del catalogo de apartamentos (APTO-01, APTO-11, UI-SPEC §7).
 *
 * ── CLIENT COMPONENT, Y EL FILTRADO VIVE AQUI ───────────────────────────────
 * Son 39 filas ya cargadas por el RSC. Un round-trip al servidor por tecla es
 * peor UX y mas carga que recorrer 39 objetos en memoria. Sin paginacion y sin
 * virtualizacion: 39 filas de 40px caben en un solo render y en una pantalla de
 * 1080p, asi que virtualizar solo anadiria una libreria y un bug de scroll.
 *
 * La logica del filtro NO esta en este archivo: vive en `filtrarApartamentos()`
 * de `lib/domain/properties.ts`, que es pura y tiene tests. Dentro de un
 * `useMemo` seria intestable sin levantar un navegador.
 *
 * ── EL BANNER Y LA TOOLBAR VIVEN AQUI, NO EN `page.tsx` ─────────────────────
 * El plan describe la toolbar como parte de la pagina, pero los tres controles
 * (buscador, cluster y `Ver solo pendientes`) son estado de cliente y el tercero
 * esta DENTRO del banner. Repartirlos entre el RSC y este componente obligaria a
 * subir el estado a un tercer Client Component que envolviera a los dos, que es
 * este mismo con otro nombre. La cabecera de pagina (titulo + accion primaria)
 * si se queda en el RSC, porque no depende de ningun filtro.
 */

/**
 * Sentinela del `Select` para "sin filtro de cluster".
 *
 * Es la cadena vacia y no `null` ni un `__todos__` inventado: `listarClusters()`
 * descarta los clusters en blanco, asi que la cadena vacia no puede colisionar
 * con ninguna opcion real, y evita el string magico que alguien acabaria
 * escribiendo tambien en el otro lado de la comparacion.
 */
const SIN_CLUSTER = '';

/** Celda de dinero. El vacio es un em dash, y el em dash solo no dice nada. */
function CeldaDinero({ valor }: { valor: number | null }) {
  if (valor == null) {
    return (
      <span className="text-muted-foreground">
        <span aria-hidden="true">—</span>
        <span className="sr-only">sin definir</span>
      </span>
    );
  }

  return <>{formatCOP(valor)}</>;
}

/**
 * Columna RESPONSABLE.
 *
 * En una unidad INFORMATIVA no hay responsable —`props_assignees_only_when_managed`
 * lo prohibe en la base— y lo que se pinta es el contacto externo, truncado, con
 * el texto completo en `title`. Truncar sin `title` es esconder el dato.
 */
function CeldaResponsable({ fila }: { fila: ApartamentoDeLista }) {
  const texto = fila.gestion_vivaguest ? fila.responsableNombre : fila.contacto_externo;

  if (!texto) {
    return (
      <span className="text-muted-foreground">
        <span aria-hidden="true">—</span>
        <span className="sr-only">sin definir</span>
      </span>
    );
  }

  return (
    <span className="block truncate" title={texto}>
      {texto}
    </span>
  );
}

export function TablaApartamentos({
  filas,
  clusters,
}: {
  filas: ApartamentoDeLista[];
  clusters: string[];
}) {
  const idBuscador = useId();
  const idPendientes = useId();

  const [busqueda, setBusqueda] = useState('');
  const [cluster, setCluster] = useState<string>(SIN_CLUSTER);
  const [soloPendientes, setSoloPendientes] = useState(false);

  // Los conteos del pie y del banner salen de la lista COMPLETA. Derivarlos de
  // la filtrada haria que el denominador del montaje cambiara al teclear.
  const resumen = useMemo(() => resumenDelCatalogo(filas), [filas]);

  const visibles = useMemo(
    () =>
      filtrarApartamentos(filas, {
        busqueda,
        cluster: cluster === SIN_CLUSTER ? null : cluster,
        soloPendientes,
      }),
    [filas, busqueda, cluster, soloPendientes],
  );

  const hayFiltro = busqueda.trim().length > 0 || cluster !== SIN_CLUSTER || soloPendientes;

  function limpiarFiltros() {
    setBusqueda('');
    setCluster(SIN_CLUSTER);
    setSoloPendientes(false);
  }

  return (
    <div className="flex flex-col gap-lg">
      <BannerMontaje
        gestionadas={resumen.gestionadas}
        listas={resumen.listas}
        soloPendientes={soloPendientes}
        onSoloPendientesChange={setSoloPendientes}
        idInterruptor={idPendientes}
      />

      {/* Toolbar de §6.2: fila propia, gap 12px. */}
      <div className="flex flex-wrap items-center gap-md">
        <div className="relative">
          {/*
            El icono va DENTRO del campo, a la izquierda, y el input se aparta con
            padding. `pointer-events-none` para que un clic sobre el icono llegue
            al input en vez de morir en un svg.
          */}
          <Search
            className="pointer-events-none absolute top-1/2 left-sm size-4 -translate-y-1/2 text-muted-foreground"
            strokeWidth={2}
            aria-hidden="true"
          />
          {/*
            `<label>` real y no un placeholder como etiqueta (§13). Va en
            `sr-only` porque la toolbar no tiene sitio para una etiqueta visible y
            el icono ya dice de que se trata a quien ve la pantalla.
          */}
          <label htmlFor={idBuscador} className="sr-only">
            Buscar apartamento
          </label>
          <Input
            id={idBuscador}
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, cluster o responsable"
            className="w-buscador pl-2xl"
          />
        </div>

        <Select
          value={cluster}
          onValueChange={(valor) => setCluster(typeof valor === 'string' ? valor : SIN_CLUSTER)}
        >
          <SelectTrigger aria-label="Filtrar por cluster" className="w-filtro-cluster">
            <SelectValue>
              {(valor: string) => (valor === SIN_CLUSTER ? 'Todos los clusters' : valor)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SIN_CLUSTER}>Todos los clusters</SelectItem>
            {clusters.map((nombre) => (
              <SelectItem key={nombre} value={nombre}>
                {nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {visibles.length === 0 ? (
        <EstadoVacio
          icono={Search}
          // Copy literal de §9.2, comillas angulares incluidas. El termino
          // entrecomillado es lo que el admin escribio; si no escribio nada y solo
          // filtro por cluster, se entrecomilla el cluster, que es igual de cierto
          // y evita pintar unas comillas vacias.
          encabezado={`Ningún apartamento coincide con «${busqueda.trim() || cluster}».`}
          cuerpo="Revisa la escritura o quita el filtro de cluster."
          accion={
            <Button type="button" variant="outline" onClick={limpiarFiltros}>
              Limpiar búsqueda
            </Button>
          }
        />
      ) : (
        <div className="rounded-md border border-border bg-background">
          {/*
            ── EL ARREGLO DE LA DEUDA DEL PLAN 02-07 ──────────────────────────
            El `Table` de shadcn envuelve la tabla en un div con `overflow-x-auto`.
            Un `overflow-x` distinto de `visible` convierte ESE div en el
            scrollport de cualquier `position: sticky` de dentro, en vez del
            viewport, asi que el encabezado sticky de §7.2 no engancha. Con los 8
            aseadores del 02-07 no se notaba; con 39 filas el encabezado se va con
            el scroll y la tabla queda sin nombres de columna.

            La salida NO es anadir clases al encabezado: es devolverle el
            scrollport al viewport. Las 8 columnas suman 1004px, asi que a partir
            de 1280px (el minimo soportado de §6.3) no hace falta scroll
            horizontal ninguno y el contenedor puede ser `overflow-x: visible`.

            Por debajo de 1280px si hace falta, y ahi §6.3 pide justamente lo
            contrario: scroll horizontal dentro de la card con NOMBRE fija. Los dos
            comportamientos son incompatibles por construccion —el sticky vertical
            necesita el viewport y el sticky horizontal necesita el contenedor— asi
            que cada uno vive en su rango. `max-xl` es `width < 1280px`.

            Y por eso esta card NO lleva `overflow-hidden`: seria otro scrollport.
            Las esquinas superiores se redondean en las celdas del encabezado.
          */}
          <Table containerClassName="overflow-x-visible max-xl:overflow-x-auto max-xl:rounded-md">
            <TableHeader>
              <TableRow className="sticky top-barra z-20 h-fila-encabezado bg-canvas hover:bg-canvas">
                <TableHead className="w-col-estado-apto rounded-tl-md bg-canvas px-md text-micro font-semibold tracking-columna text-muted-foreground uppercase max-xl:sticky max-xl:left-0">
                  Estado
                </TableHead>
                <TableHead className="min-w-col-nombre bg-canvas px-md text-micro font-semibold tracking-columna text-muted-foreground uppercase max-xl:sticky max-xl:left-col-estado-apto">
                  Nombre
                </TableHead>
                <TableHead className="w-col-cluster px-md text-micro font-semibold tracking-columna text-muted-foreground uppercase">
                  Cluster
                </TableHead>
                <TableHead className="w-col-dinero px-md text-right text-micro font-semibold tracking-columna text-muted-foreground uppercase">
                  Tarifa
                </TableHead>
                <TableHead className="w-col-dinero px-md text-right text-micro font-semibold tracking-columna text-muted-foreground uppercase">
                  Pago
                </TableHead>
                <TableHead className="w-col-responsable-apto px-md text-micro font-semibold tracking-columna text-muted-foreground uppercase">
                  Responsable
                </TableHead>
                <TableHead className="w-col-calendario px-md text-center text-micro font-semibold tracking-columna text-muted-foreground uppercase">
                  Calendario
                </TableHead>
                <TableHead className="w-col-menu rounded-tr-md px-md">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {visibles.map((fila) => {
                const { clave } = estadoDeApartamento(fila);
                const esInformativa = clave === 'informativa';

                return (
                  <TableRow
                    key={fila.id}
                    // `relative` para que el `::after` del ancla del nombre tenga
                    // esta fila como bloque contenedor y cubra toda su anchura.
                    //
                    // Sin zebra (§7.2): zebra + iconos de color es ruido. El hover
                    // va a `--canvas`, no al `--muted/50` de shadcn. Y el foco de
                    // fila se pinta desde el link real con `has-[a:focus-visible]`,
                    // no con un `role="button"` falso sobre la fila.
                    className="transicion relative h-fila border-b border-border bg-background hover:bg-canvas has-[a:focus-visible]:bg-canvas"
                  >
                    <TableCell className="w-col-estado-apto bg-inherit px-md max-xl:sticky max-xl:left-0">
                      <EstadoApartamento fila={fila} />
                    </TableCell>

                    <TableCell className="min-w-col-nombre bg-inherit px-md text-body font-semibold max-xl:sticky max-xl:left-col-estado-apto">
                      {/*
                        EL ANCLA ES EL ELEMENTO FOCALIZABLE, no la fila (§7.2). El
                        `::after` estira su area de clic sobre toda la fila sin
                        sacar del recorrido de teclado un `<a>` de verdad, que es
                        lo que pasa cuando se pone `onClick` en el `<tr>`.
                      */}
                      <Link
                        href={`/apartamentos/${fila.id}`}
                        className="transicion rounded-sm after:absolute after:inset-0 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        {fila.nombre}
                      </Link>
                    </TableCell>

                    {/* Texto plano, sin badge: 39 badges es ruido (§7.1). */}
                    <TableCell className="w-col-cluster px-md text-body text-muted-foreground">
                      {fila.cluster}
                    </TableCell>

                    {/*
                      `tabular-nums` en las dos columnas de dinero (§3): sin el, 39
                      montos de ancho variable no alinean y la columna es ilegible.
                      Una unidad informativa no tiene tarifas por CHECK
                      (`cl_unmanaged_is_inert`), asi que ahi el em dash no es un
                      dato que falte: es que no aplica.
                    */}
                    <TableCell className="w-col-dinero px-md text-right text-body tabular-nums">
                      <CeldaDinero valor={esInformativa ? null : fila.tarifa_huesped} />
                    </TableCell>

                    <TableCell className="w-col-dinero px-md text-right text-body tabular-nums">
                      <CeldaDinero valor={esInformativa ? null : fila.pago_aseador} />
                    </TableCell>

                    <TableCell className="w-col-responsable-apto max-w-col-responsable-apto px-md text-body">
                      <CeldaResponsable fila={fila} />
                    </TableCell>

                    {/*
                      Es la EXISTENCIA del feed, nunca su URL: la URL es una
                      credencial y vive en `property_secrets`, sin grant. El icono
                      va SOLO, asi que lleva `aria-label` y no `aria-hidden`.
                    */}
                    <TableCell className="w-col-calendario px-md text-center">
                      {fila.tieneCalendario ? (
                        <CalendarCheck
                          className="mx-auto size-3.5 text-status-ok"
                          strokeWidth={2}
                          aria-label="Calendario conectado"
                        />
                      ) : (
                        <CalendarX
                          className="mx-auto size-3.5 text-status-warn"
                          strokeWidth={2}
                          aria-label="Sin calendario conectado"
                        />
                      )}
                    </TableCell>

                    {/*
                      `relative z-10` para que el menu quede POR ENCIMA del
                      `::after` del ancla. Sin esto, el clic en el `⋯` cae en el
                      link y navega al detalle en vez de abrir el menu.
                    */}
                    <TableCell className="relative z-10 w-col-menu px-md">
                      <MenuApartamento fila={fila} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex flex-col gap-sm">
        {/*
          El contador se anuncia con `aria-live="polite"` (§13): quien no ve la
          tabla necesita saber que su busqueda dejo 12 filas, y el numero cambia
          sin que nada mas lo diga.
        */}
        <p className="text-micro tabular-nums text-muted-foreground" aria-live="polite">
          {hayFiltro
            ? `Mostrando ${visibles.length} de ${resumen.total}`
            : `${resumen.total} ${resumen.total === 1 ? 'unidad' : 'unidades'} · ${resumen.gestionadas} ${resumen.gestionadas === 1 ? 'gestionada' : 'gestionadas'} · ${resumen.informativas} ${resumen.informativas === 1 ? 'informativa' : 'informativas'}`}
        </p>

        <LeyendaDeEstados />
      </div>
    </div>
  );
}
