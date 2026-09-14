import { CircleCheck } from 'lucide-react';
import Link from 'next/link';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { PagoDelPeriodo } from '@/lib/data/pagos';
import { diaBog, formatFechaCortaBog } from '@/lib/domain/dates';
import { formatCOP } from '@/lib/domain/money';

import { CirculoIniciales } from '../../_components/CirculoIniciales';
import { BotonMarcarPagado } from './BotonMarcarPagado';

/**
 * La tabla interna de un periodo cerrado (07-UI-SPEC §9.1).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * SIETE COLUMNAS, Y LAS DOS PARTIDAS VAN SEPARADAS PORQUE ESO ES D7-2.
 *
 * `POR ASEOS` y `GASTOS` en columnas distintas, no un total plano. El snapshot
 * guarda las dos partidas por separado justamente para esto: con un total plano
 * no hay forma de decirle a una persona cuanto de lo que recibe es su trabajo y
 * cuanto es el reembolso de lo que puso de su bolsillo, y esa es la pregunta que
 * hace siempre.
 *
 * ── SIN ENVOLTORIO DE DESPLAZAMIENTO, Y LA CUENTA ESTA HECHA ─────────────
 *
 * Las seis columnas fijas suman 748px (88 + 120 + 120 + 120 + 140 + 160), asi
 * que `ASEADOR` recibe 644px a 1440 y 228px a 1024, contra su minimo de 200.
 * Cabe sin desplazamiento horizontal en los dos breakpoints soportados, y por
 * eso esta tabla NO lleva el `overflow-x-auto` que si tienen la de apartamentos
 * y la del dia.
 *
 * ── SIN COLUMNA DE MENU ──────────────────────────────────────────────────
 *
 * Esta pantalla tiene exactamente UNA accion y esconderla en un menu de tres
 * puntos seria esconder el trabajo de la pantalla.
 *
 * ── LA PRIMERA CELDA ES UN ENLACE A UNA DIRECCION, NO UN DISPARADOR SUELTO ─
 *
 * El desglose vive en `?pago={id}` (ver la cabecera de `SheetDesglosePago`).
 * Por eso aqui hay un `<a>` de verdad y no un boton que abre un panel con estado
 * de cliente: asi el panel es enlazable, sobrevive a un refresco, y sobre todo
 * **el detalle y las firmas de sus recibos se piden al servidor solo cuando
 * alguien abre ese pago**, no para las ocho filas de cada periodo por si acaso.
 *
 * El enlace es al PAGO y nunca a la persona: `pagos_del_periodo` no devuelve
 * `aseador_id` a proposito, porque la clave foranea al perfil es
 * `on delete set null` y un enlace a la ficha apuntaria a alguien que puede ya
 * no existir. `payout_id` si es estable.
 *
 * ── LA SEPTIMA CELDA QUEDA VACIA CUANDO YA SE PAGO ───────────────────────
 *
 * No lleva un boton deshabilitado ni un guion. Marcar pagado es irreversible:
 * una vez hecho, ahi no hay nada que ofrecer.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** El tratamiento de encabezado de columna de §9.1: 32px, `--canvas`, 12/600. */
const TH = 'px-md text-micro font-semibold tracking-columna text-muted-foreground uppercase';

/** Las celdas de dinero: derecha y numerales tabulares, sin excepcion (§11.1). */
const TD_DINERO = 'px-md text-body tabular-nums text-right';

export function TablaPagosDelPeriodo({
  pagos,
  etiquetaPeriodo,
  fechasPeriodo,
}: {
  pagos: PagoDelPeriodo[];
  /** `Del 1 al 30 de enero de 2026`. Solo para la descripcion accesible. */
  etiquetaPeriodo: string;
  /**
   * La misma etiqueta SIN su `Del ` inicial, para interpolarla dentro de una
   * frase: el cuerpo del dialogo de confirmacion dice `del periodo del {fechas}`
   * (§15.3) y con la etiqueta entera saldria `del periodo Del 1 al 30…`.
   */
  fechasPeriodo: string;
}) {
  return (
    // `overflow-x-visible` y no el defecto de la primitiva: ver la cabecera. El
    // encabezado NO es sticky, igual que en la tabla del dia: en esta pantalla
    // hay varias tablas apiladas y varios encabezados pegados al mismo `top` se
    // solapan entre ellos.
    <Table
      containerClassName="overflow-x-visible"
      aria-label={`Pagos del periodo ${etiquetaPeriodo}`}
    >
      <TableHeader>
        <TableRow className="h-fila-encabezado bg-canvas hover:bg-canvas">
          {/*
            Los rotulos van escritos EN MAYUSCULA, no solo con `uppercase`. La
            clase transforma el glifo pero no el texto del DOM, y el contrato de
            copy (§15.2) fija `ASEADOR · ASEOS · POR ASEOS · GASTOS · TOTAL ·
            PAGADO`: es lo que lee un lector de pantalla y lo que afirma la suite.
          */}
          <TableHead className={`min-w-col-nombre ${TH}`}>ASEADOR</TableHead>
          <TableHead className={`w-col-conteo text-right ${TH}`}>ASEOS</TableHead>
          <TableHead className={`w-col-dinero text-right ${TH}`}>POR ASEOS</TableHead>
          <TableHead className={`w-col-dinero text-right ${TH}`}>GASTOS</TableHead>
          <TableHead className={`w-col-dinero text-right ${TH}`}>TOTAL</TableHead>
          <TableHead className={`w-col-pagado ${TH}`}>PAGADO</TableHead>
          {/*
            La septima NO lleva rotulo, y es decision del contrato: la columna de
            la accion no nombra un dato. Se deja sin texto —tampoco `sr-only`—
            porque el nombre accesible de cada boton ya dice lo que hace.
          */}
          <TableHead className="w-col-accion-pago px-md" />
        </TableRow>
      </TableHeader>

      <TableBody>
        {pagos.map((pago) => {
          // `pagado_at` es un instante; el dia que se enseña es el de Bogota.
          // Formatearlo desde el instante crudo mostraria el dia universal, y
          // pasadas las 19:00 de Bogota eso es mañana.
          const diaDePago = diaBog(pago.pagadoAt);

          return (
            <TableRow key={pago.pagoId} className="h-fila">
              <TableCell className="px-md">
                {/*
                  El circulo es decorativo y va oculto: el nombre completo esta
                  al lado, y anunciarlo haria que un lector de pantalla dijera
                  «eme ge, María González» en cada fila.
                */}
                <Link
                  href={`/finanzas/pagos?pago=${pago.pagoId}`}
                  scroll={false}
                  replace
                  className="transicion flex items-center gap-sm rounded-sm text-body font-semibold text-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <CirculoIniciales nombre={pago.aseadora} />
                  {pago.aseadora}
                </Link>
              </TableCell>

              <TableCell className="px-md text-right text-body tabular-nums">
                {pago.aseos}
              </TableCell>

              <TableCell className={TD_DINERO}>{formatCOP(pago.montoAseos)}</TableCell>

              {/*
                `$ 0` cuando no hubo gastos, NUNCA la raya de ausencia: un periodo
                sin gastos es un hecho, no un campo sin llenar (§11.1).
              */}
              <TableCell className={TD_DINERO}>{formatCOP(pago.montoGastos)}</TableCell>

              <TableCell className={`${TD_DINERO} font-semibold`}>
                {formatCOP(pago.montoTotal)}
              </TableCell>

              <TableCell className="px-md">
                {/*
                  LA INFORMACION NO DEPENDE SOLO DEL COLOR (§13.4): el pagado
                  lleva icono ademas del verde, y el pendiente lleva la palabra.
                  Con daltonismo rojo-verde, el color solo no distingue nada.
                */}
                {diaDePago === null ? (
                  <span className="text-body text-status-warn">Pendiente</span>
                ) : (
                  <span className="flex items-center gap-xs text-body text-status-ok">
                    <CircleCheck
                      className="size-3.5 shrink-0"
                      strokeWidth={2}
                      aria-hidden="true"
                    />
                    Pagado el {formatFechaCortaBog(diaDePago)}
                  </span>
                )}
              </TableCell>

              <TableCell className="px-md text-right">
                {pago.pagadoAt === null && (
                  <BotonMarcarPagado
                    pagoId={pago.pagoId}
                    aseadora={pago.aseadora}
                    monto={pago.montoTotal}
                    fechasPeriodo={fechasPeriodo}
                  />
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
