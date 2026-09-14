import { ArrowLeft, CalendarX, Receipt, Wallet } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type {
  AseadoraDeLaFicha,
  AhoraMismo,
  AseoDeLaFicha,
  GastoDeLaFicha,
  PagoDeLaFicha,
} from '@/lib/data/finanzas-detalle';
import { diaBog, formatFechaCortaBog } from '@/lib/domain/dates';
import { etiquetaDePeriodoDePago } from '@/lib/domain/mes';
import { formatCOP } from '@/lib/domain/money';

import { CirculoIniciales } from '../../_components/CirculoIniciales';
import { EstadoVacio } from '../../_components/EstadoVacio';
import { BloqueAhoraMismo } from './BloqueAhoraMismo';
import { DialogoRecibo } from './DialogoRecibo';

/**
 * LA FICHA DE UNA PERSONA (07-UI-SPEC §8).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * RESPONDE CUATRO PREGUNTAS DEL DUENO SOBRE UNA PERSONA, Y EN ESTE ORDEN.
 *
 * Primero **lo que esta pasando** y despues **lo que paso**: que esta haciendo
 * ahora, que aseos hizo en el periodo, que se le ha pagado, y que gastos reporto.
 * El orden no es alfabetico ni de importancia: es el de una conversacion real
 * sobre alguien de tu equipo.
 *
 * ── LO QUE ESTA PANTALLA NO MUESTRA, Y ES LA REGLA MAS DURA DE LA FASE ───
 *
 * **Por persona se muestra lo que CUESTA, nunca revenue y nunca margen.** El
 * dueno lo descarto con argumento: un revenue por persona «parece un ranking de
 * desempeno y en realidad es un ranking de a quien le tocaron los apartamentos
 * buenos». El margen sale del apartamento, no de quien limpio.
 *
 * Y el bloque de sus aseos NO lleva columna de cobrado ni de margen, aunque esta
 * pantalla sea del admin y la aseadora no la pueda abrir. La razon es otra y es
 * mas importante: **el desglose que ve el admin y el que ve la aseadora en sus
 * pagos tienen que ser EL MISMO DOCUMENTO.** Si el admin ve una columna de mas,
 * el dia que alguien reclame van a estar comparando dos papeles distintos, y esa
 * conversacion se gana o se pierde antes de empezar.
 *
 * ── LOS BLOQUES NO SE IGUALAN DE ALTO ────────────────────────────────────
 *
 * `items-start` es deliberado. Igualarlos dejaria doscientos pixeles de blanco
 * dentro del bloque mas corto, que ademas es el mas estable. Y ninguno tiene
 * desplazamiento interno: nada es fijo aqui y la pagina se desplaza entera.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** El tratamiento de encabezado de columna del repo: 32px, `--canvas`, 12/600. */
const TH = 'px-md text-micro font-semibold tracking-columna text-muted-foreground uppercase';

/**
 * El envoltorio de un bloque: cabecera con titulo, leyenda opcional, y cuerpo.
 *
 * Uno solo para los tres bloques de datos, con el copy por parametro. Tres cards
 * con la misma geometria escritas tres veces se desincronizan en el primer
 * retoque, que es la misma razon por la que el contrato prohibe un segundo estado
 * vacio.
 */
function Bloque({
  titulo,
  leyenda,
  children,
}: {
  titulo: string;
  /** La linea de micro bajo el titulo. Solo el bloque de pagos la necesita. */
  leyenda?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-md border border-border bg-background">
      <div className="flex flex-col gap-xs border-b border-border px-lg py-md">
        <h2 className="text-heading text-foreground">{titulo}</h2>
        {leyenda && <p className="text-micro text-muted-foreground">{leyenda}</p>}
      </div>

      {children}
    </section>
  );
}

/** Las dos fechas de una fila, que son obligatorias en TODO desglose (D7-8). */
function CeldasDeFecha({ programado, ejecutado }: { programado: string; ejecutado: string }) {
  return (
    <>
      <TableCell className="w-col-fecha px-md tabular-nums">
        {formatFechaCortaBog(programado)}
      </TableCell>
      <TableCell className="w-col-fecha px-md tabular-nums">
        {formatFechaCortaBog(ejecutado)}
      </TableCell>
    </>
  );
}

/**
 * Bloque 2: sus aseos del periodo. CUATRO columnas y ni una mas.
 *
 * Las dos fechas van en columnas propias porque un aseo programado en enero y
 * hecho en febrero pertenece al pago de febrero, y sin las dos fechas esa fila
 * dentro del recibo de febrero parece un error.
 */
function BloqueAseos({
  aseos,
  etiquetaDelPeriodo,
}: {
  aseos: AseoDeLaFicha[];
  etiquetaDelPeriodo: string;
}) {
  return (
    <Bloque titulo="Sus aseos del periodo">
      {aseos.length === 0 ? (
        <EstadoVacio
          compacto
          icono={CalendarX}
          encabezado="No hizo aseos en este periodo."
          cuerpo="Cambia el periodo arriba para ver otro rango."
        />
      ) : (
        <Table>
          <TableCaption className="sr-only">
            Sus aseos del periodo de {etiquetaDelPeriodo}
          </TableCaption>

          <TableHeader>
            <TableRow className="h-fila-encabezado bg-canvas hover:bg-canvas">
              <TableHead scope="col" className={`min-w-col-nombre ${TH}`}>
                APARTAMENTO
              </TableHead>
              <TableHead scope="col" className={`w-col-fecha ${TH}`}>
                PROGRAMADO
              </TableHead>
              <TableHead scope="col" className={`w-col-fecha ${TH}`}>
                HECHO
              </TableHead>
              {/* Y AQUI SE ACABA. Sin COBRADO y sin MARGEN: ver la cabecera. */}
              <TableHead scope="col" className={`w-col-dinero text-right ${TH}`}>
                PAGO
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {aseos.map((aseo) => (
              <TableRow key={aseo.aseoId} className="h-fila">
                <TableCell className="min-w-col-nombre truncate px-md" title={aseo.apartamento}>
                  {aseo.apartamento}
                </TableCell>

                <CeldasDeFecha programado={aseo.programado} ejecutado={aseo.ejecutado} />

                <TableCell className="w-col-dinero px-md text-right tabular-nums">
                  {formatCOP(aseo.pago)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Bloque>
  );
}

/**
 * Bloque 3: sus pagos mes a mes.
 *
 * ── ESTE BLOQUE IGNORA EL FILTRO DE PERIODO A PROPOSITO, Y LO DICE ───────
 *
 * Los pagos son HISTORIAL. Filtrarlos por el rango de arriba dejaria «sus pagos»
 * con una sola fila cuando el filtro esta puesto en dia, y una fila no responde
 * ninguna pregunta. La funcion de la base ni siquiera acepta rango, asi que nadie
 * puede «arreglarlo» pasandoselo, y la leyenda esta en pantalla para que el admin
 * no crea que el bloque se le quedo atras.
 *
 * ── CADA PERIODO CON SUS DOS FECHAS REALES (D7-5) ───────────────────────
 *
 * Nunca solo con el nombre del mes: el periodo va de cierre a cierre, y el de
 * enero de 2026 va del 1 al 30 porque el 31 es sabado. Quien cobra tiene derecho
 * a saber que dias le pagaron.
 */
function BloquePagos({ pagos }: { pagos: PagoDeLaFicha[] }) {
  return (
    <Bloque titulo="Sus pagos mes a mes" leyenda="Todos sus periodos cerrados">
      {pagos.length === 0 ? (
        <EstadoVacio
          compacto
          icono={Wallet}
          encabezado="Todavía no se ha cerrado ningún periodo."
          cuerpo="El primer cierre ocurre el último día hábil del mes. Ahí aparece cuánto se le debe a cada persona."
        />
      ) : (
        <ul>
          {pagos.map((pago) => {
            /*
              El día en que se pagó sale de `diaBog` y NUNCA de recortar los diez
              primeros caracteres del instante. Es la trampa clásica de este
              repo: la marca viaja en tiempo universal, así que un pago
              registrado a las 20:00 de Bogotá diría el día siguiente. Recortar
              la cadena parece inofensivo y falla una de cada cinco veces.
            */
            const diaDelPago = diaBog(pago.pagadoAt);

            return (
              <li
                key={pago.pagoId}
                className="flex items-center gap-md border-b border-border px-lg py-md last:border-b-0"
              >
                <div className="flex min-w-0 flex-col gap-xs">
                  <span className="truncate text-body text-foreground">
                    {etiquetaDePeriodoDePago(pago.desde, pago.hasta)}
                  </span>

                  {/*
                    El estado lleva la PALABRA además del color, siempre: es lo
                    que hace que la información sobreviva a la prueba de escala
                    de grises (§13.4).
                  */}
                  {diaDelPago ? (
                    <span className="text-micro text-status-ok">
                      Pagado el {formatFechaCortaBog(diaDelPago)}
                    </span>
                  ) : (
                    <span className="text-micro text-status-warn">Pendiente</span>
                  )}
                </div>

                <span className="ml-auto shrink-0 text-body font-semibold tabular-nums text-foreground">
                  {formatCOP(pago.total)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Bloque>
  );
}

/**
 * Bloque 4: sus gastos reportados, con el recibo.
 *
 * ── CUANDO LA FOTO YA NO EXISTE, EL BOTON NO SE RENDERIZA ────────────────
 *
 * En su lugar va la leyenda en el color de aviso. **NO se pinta un boton muerto
 * ni un enlace roto**: una ausencia explicada es informacion, una ausencia
 * silenciosa es un defecto percibido. El gasto y su monto siguen ahi, que es lo
 * que hay que reembolsar.
 *
 * El dialogo de recibo NO se escribe aqui: ya existe, compartido con el desglose
 * de un pago, y recibe la URL YA FIRMADA. La firma se genera en el servidor,
 * despues del guard de admin; este arbol no conoce ni el bucket ni la ruta y no
 * podria firmar aunque quisiera.
 */
function BloqueGastos({
  gastos,
  urlPorGasto,
}: {
  gastos: GastoDeLaFicha[];
  /** La URL firmada de cada gasto que todavia tiene foto. */
  urlPorGasto: Map<string, string>;
}) {
  return (
    <Bloque titulo="Sus gastos reportados">
      {gastos.length === 0 ? (
        <EstadoVacio
          compacto
          icono={Receipt}
          encabezado="No reportó gastos en este periodo."
          cuerpo="Acá aparecen las compras que hizo y que se le devuelven."
        />
      ) : (
        <ul>
          {gastos.map((gasto) => {
            const url = urlPorGasto.get(gasto.gastoId) ?? null;

            return (
              <li
                key={gasto.gastoId}
                className="flex items-center gap-md border-b border-border px-lg py-md last:border-b-0"
              >
                <div className="flex min-w-0 flex-col gap-xs">
                  <span className="truncate text-body text-foreground">{gasto.concepto}</span>
                  <span className="truncate text-micro text-muted-foreground">
                    {formatFechaCortaBog(gasto.fecha)} · {gasto.apartamento}
                  </span>
                </div>

                <span className="ml-auto shrink-0 text-body font-semibold tabular-nums text-foreground">
                  {formatCOP(gasto.monto)}
                </span>

                {url === null ? (
                  <span className="shrink-0 text-micro text-status-warn">
                    Sin recibo disponible
                  </span>
                ) : (
                  <DialogoRecibo
                    gasto={{
                      concepto: gasto.concepto,
                      fecha: gasto.fecha,
                      apartamento: gasto.apartamento,
                      monto: gasto.monto,
                      urlFirmada: url,
                    }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Bloque>
  );
}

export function FichaAseadora({
  aseadora,
  ahora,
  aseos,
  pagos,
  gastos,
  urlPorGasto,
  costo,
  etiquetaDelPeriodo,
  volver,
  subNav,
}: {
  aseadora: AseadoraDeLaFicha;
  ahora: AhoraMismo;
  aseos: AseoDeLaFicha[];
  pagos: PagoDeLaFicha[];
  gastos: GastoDeLaFicha[];
  urlPorGasto: Map<string, string>;
  /** Lo que cuesta esa persona en el periodo: sus pagos mas sus gastos. */
  costo: number;
  etiquetaDelPeriodo: string;
  /** La direccion del resumen CON el periodo, para no cambiarle el contexto. */
  volver: string;
  /**
   * El sub-nav de la seccion, entre la cabecera y los cuatro bloques.
   *
   * Entra como ranura y no como hijo por la misma razon que en el Resumen: su
   * sitio en la jerarquia es justo bajo el titulo de la pagina, y componerlo
   * desde la ruta deja este archivo sin saber nada de navegacion de seccion.
   */
  subNav?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-xl">
      <div className="flex flex-col gap-md">
        <Link
          href={volver}
          className="transicion flex w-fit items-center gap-xs rounded-sm text-micro text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <ArrowLeft className="size-4" strokeWidth={2} aria-hidden="true" />
          Volver al resumen
        </Link>

        <div className="flex flex-wrap items-center justify-between gap-lg">
          <div className="flex items-center gap-sm">
            <CirculoIniciales nombre={aseadora.nombre} />

            <div className="flex flex-col">
              <h1 className="text-display text-foreground">{aseadora.nombre}</h1>
              <span className="text-micro text-muted-foreground">
                {aseos.length} {aseos.length === 1 ? 'aseo' : 'aseos'} en{' '}
                {etiquetaDelPeriodo}
              </span>
            </div>
          </div>

          <div className="flex flex-col items-end">
            <span className="text-display tabular-nums text-foreground">
              {formatCOP(costo)}
            </span>

            {/*
              ESTA ETIQUETA ES OBLIGATORIA, y no es decorativa. Sin ella, una
              cifra grande junto a una persona se lee como «lo que se le debe», y
              lo que se debe solo existe en Pagos: acá esto es lo que costó, ya
              esté pagado o no.
            */}
            <span className="text-micro text-muted-foreground">
              lo que cuesta en el periodo
            </span>
          </div>
        </div>
      </div>

      {subNav}

      {/*
        Los cuatro bloques. Una columna de base y dos desde tablet apaisada, que
        es el mínimo soportado de esta sección. `items-start` porque NO se igualan
        de alto: ver la cabecera del archivo.
      */}
      <div className="grid grid-cols-1 items-start gap-2xl lg:grid-cols-2">
        <BloqueAhoraMismo ahora={ahora} />
        <BloqueAseos aseos={aseos} etiquetaDelPeriodo={etiquetaDelPeriodo} />
        <BloquePagos pagos={pagos} />
        <BloqueGastos gastos={gastos} urlPorGasto={urlPorGasto} />
      </div>
    </div>
  );
}
