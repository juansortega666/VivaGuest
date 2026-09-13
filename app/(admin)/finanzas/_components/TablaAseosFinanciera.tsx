import { Hammer, Receipt } from 'lucide-react';
import Link from 'next/link';

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { AseoDelDetalle, TotalesDelDetalle } from '@/lib/data/finanzas-detalle';
import { formatFechaCortaBog } from '@/lib/domain/dates';
import { periodoDeCierre } from '@/lib/domain/mes';
import { formatCOP } from '@/lib/domain/money';
import { cn } from '@/lib/utils';

/**
 * El detalle aseo por aseo (07-UI-SPEC §7.1). ES FIN-02.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESTA TABLA NO LLEVA ENVOLTORIO DE DESPLAZAMIENTO HORIZONTAL, Y NO ES UN OLVIDO.
 *
 * Las columnas fijas suman 728px (96 + 96 + 176 + 120 + 120 + 120). El ancho util
 * es 1392px a 1440 y 976px a 1024, asi que la columna de apartamento recibe 664px
 * en escritorio y **248px en tablet apaisada**, contra su minimo de 200. Cabe sin
 * desplazamiento lateral en el minimo soportado de esta seccion, que es 1024.
 *
 * La tabla del dia y la de apartamentos SI llevan ese envoltorio porque sus
 * columnas fijas no caben. Copiarlo aqui seria arrastrar una complicacion sin
 * causa, y ademas el envoltorio convierte su propio div en el puerto de
 * desplazamiento de cualquier elemento pegajoso de dentro, que es una trampa ya
 * medida en este repo.
 *
 * **LA FORMA DE QUE SIGA SIENDO CIERTO ES NO ANADIR COLUMNAS.** Por eso las
 * senales de gasto y de dano van EN LINEA dentro de la celda del apartamento y no
 * en una octava columna: una octava columna rompe la cuenta de arriba. Es ademas
 * el patron que la Fase 4 ya establecio.
 *
 * ── LA COLUMNA DE MARGEN ES EL ANCLA DE ESTA PANTALLA (§4.5) ─────────────
 *
 * Es la unica que responde la pregunta de FIN-02, va a la derecha del todo y es
 * el final de la lectura de cada fila. Esta pantalla no tiene accion primaria y
 * por lo tanto no tiene ningun relleno de acento: es de lectura.
 *
 * ── SIN ZEBRA, igual que las tres tablas que ya existen ──────────────────
 *
 * Con filas de 40px y separador de 1px, el rayado no aporta seguimiento de linea
 * y si mete una segunda superficie que compite con el color de estado.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** El tratamiento de encabezado de columna del repo: 32px, `--canvas`, 12/600. */
const TH = 'px-md text-micro font-semibold tracking-columna text-muted-foreground uppercase';

/**
 * La celda de dinero. Derecha y con numerales tabulares, SIN EXCEPCION.
 *
 * Sin `tabular-nums` una columna de montos no alinea sus unidades, y comparar de
 * un vistazo es el unico trabajo de esta pantalla. Es §3.2 y no es negociable.
 */
const TD_DINERO = 'w-col-dinero px-md text-right tabular-nums';

/**
 * Una cifra de dinero, con el negativo tratado como manda §4.4.
 *
 * ── UN MARGEN NEGATIVO NO ES ROJO, Y ESO NO ES ESTILO ────────────────────
 *
 * El color destructivo esta reservado, desde la Fase 2, a acciones que revocan o
 * borran. Un margen negativo no es ninguna de las dos: **es un dato**. Y la tarifa
 * ya esta congelada en ese aseo, asi que no hay absolutamente nada que el admin
 * pueda hacer desde esta pantalla. Pintarlo de rojo lo convierte en una alarma
 * que nadie puede atender, y el dia que haya tres se dejan de mirar todas.
 *
 * Va en el color de aviso, con su signo menos explicito, que es lo que hace que
 * la informacion sobreviva a la prueba de escala de grises (§13.4).
 *
 * **Y una ganancia positiva NO es verde.** Es el caso normal: tenir de verde el
 * noventa y cinco por ciento de los renders hace que el verde no signifique nada
 * y que el cinco por ciento restante parezca un fallo del sistema.
 */
function Dinero({ valor, className }: { valor: number; className?: string }) {
  return (
    <span className={cn(valor < 0 && 'text-status-warn', className)}>
      {formatCOP(valor)}
    </span>
  );
}

/**
 * Si las dos fechas del aseo caen en periodos de pago distintos (D7-8).
 *
 * ── POR QUE SE COMPARA EL PERIODO DE CIERRE Y NO EL MES CALENDARIO ───────
 *
 * Porque lo que la senal explica es EN QUE PAGO entro ese aseo, y el periodo de
 * pago va de cierre a cierre y no del 1 al 31: el de enero de 2026 va del 1 al 30
 * porque el 31 es sabado. Comparando el mes calendario, un aseo programado el 30
 * y hecho el 31 de enero se veria alineado cuando en realidad cayo en el pago de
 * febrero, que es justo el caso que esta senal existe para explicar.
 *
 * Se compara por el dia de apertura del periodo, que lo identifica sin ambiguedad.
 */
function cruzaDePeriodo(programado: string, ejecutado: string): boolean {
  return periodoDeCierre(programado).desde !== periodoDeCierre(ejecutado).desde;
}

/**
 * Las dos senales del aseo, EN LINEA en la celda del apartamento (§7.1).
 *
 * Catorce pixeles, que es el tamano de icono dentro de celda de tabla en el arbol
 * del admin. **Llevan etiqueta accesible porque van solas**, sin texto al lado que
 * las explique: un icono mudo en una tabla densa no es informacion para nadie que
 * no lo vea.
 *
 * NO son disparadores de nada, y eso es deliberado. La funcion de la base devuelve
 * BANDERAS y no gastos: su propio comentario lo dice ("la tabla solo pinta un
 * icono: solo necesita saber si hay o no"), y por eso calcula con existencia en
 * vez de con conteo. Abrir el recibo desde aqui exigiria firmar una URL por cada
 * fila de la pagina, incluidas todas las que nadie va a abrir, y cada firma
 * seguiria viva aunque la sesion se cierre un segundo despues. El recibo se abre
 * desde la ficha de la persona, que es donde la consulta si trae la ruta.
 */
function Senales({ tieneGasto, tieneDano }: { tieneGasto: boolean; tieneDano: boolean }) {
  if (!tieneGasto && !tieneDano) return null;

  return (
    <span className="flex shrink-0 items-center gap-xs">
      {tieneGasto && (
        <Receipt
          className="size-3.5 text-muted-foreground"
          strokeWidth={2}
          role="img"
          aria-label="Tiene gasto reportado"
        />
      )}
      {tieneDano && (
        <Hammer
          className="size-3.5 text-status-warn"
          strokeWidth={2}
          role="img"
          aria-label="Tiene daño reportado"
        />
      )}
    </span>
  );
}

export function TablaAseosFinanciera({
  filas,
  totales,
  etiquetaDelPeriodo,
}: {
  filas: AseoDelDetalle[];
  /**
   * El pie. Llega calculado desde la capa de lectura, sumando ESTAS filas.
   *
   * No se recalcula aqui y tampoco sale de una segunda consulta agregada: el pie
   * cuenta lo que se ve y suma lo que se ve, y por eso no puede contradecir a la
   * tabla. Que ademas cuadre con los KPIs del Resumen lo garantiza la base, que
   * usa el mismo filtro y la misma conversion de fecha en las dos funciones.
   */
  totales: TotalesDelDetalle;
  /** El periodo ya formateado, para la descripcion accesible de la tabla. */
  etiquetaDelPeriodo: string;
}) {
  return (
    <Table>
      {/*
        §13.1: cada tabla se nombra y dice el periodo que esta mostrando. Sin el
        periodo, quien usa un lector de pantalla oye una lista de cifras sin saber
        de cuando son, y el periodo vive en la cabecera, lejos.
      */}
      <TableCaption className="sr-only">
        Aseos del periodo de {etiquetaDelPeriodo}
      </TableCaption>

      <TableHeader>
        <TableRow className="h-fila-encabezado bg-canvas hover:bg-canvas">
          {/*
            Las etiquetas van escritas EN MAYUSCULAS en el texto y no solo con la
            utilidad de caja: el contrato de copy las fija asi (§15.2), y la
            transformacion de CSS no llega al arbol de accesibilidad ni al texto
            que lee una suite. La utilidad se conserva porque es la que da el
            tratamiento del repo.
          */}
          <TableHead scope="col" className={`min-w-col-nombre ${TH}`}>
            APARTAMENTO
          </TableHead>
          <TableHead scope="col" className={`w-col-fecha ${TH}`}>
            PROGRAMADO
          </TableHead>
          <TableHead scope="col" className={`w-col-fecha ${TH}`}>
            HECHO
          </TableHead>
          <TableHead scope="col" className={`w-col-acargo ${TH}`}>
            A CARGO
          </TableHead>
          <TableHead scope="col" className={`w-col-dinero text-right ${TH}`}>
            COBRADO
          </TableHead>
          <TableHead scope="col" className={`w-col-dinero text-right ${TH}`}>
            PAGADO
          </TableHead>
          <TableHead scope="col" className={`w-col-dinero text-right ${TH}`}>
            MARGEN
          </TableHead>
        </TableRow>
      </TableHeader>

      <TableBody>
        {filas.map((fila) => {
          const cruzado = cruzaDePeriodo(fila.programado, fila.ejecutado);

          return (
            <TableRow key={fila.aseoId} className="h-fila">
              <TableCell className="min-w-col-nombre px-md">
                <span className="flex min-w-0 items-center gap-sm">
                  {/*
                    Al apartamento, no al aseo: esta es una pantalla de plata y
                    saltar desde aqui a la operacion mezcla las dos cosas que D7-1
                    separo. `title` porque la celda trunca en tablet apaisada.
                  */}
                  <Link
                    href={`/apartamentos/${fila.apartamentoId}`}
                    title={fila.apartamento}
                    className="transicion truncate rounded-sm font-semibold text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {fila.apartamento}
                  </Link>

                  <Senales tieneGasto={fila.tieneGasto} tieneDano={fila.tieneDano} />
                </span>
              </TableCell>

              <TableCell className="w-col-fecha px-md tabular-nums">
                {formatFechaCortaBog(fila.programado)}
              </TableCell>

              {/*
                LA SENAL DE D7-8. Un aseo programado el 28 de enero y hecho el 2 de
                febrero pertenece al pago de febrero, y sin esta marca el admin
                mira un aseo de enero dentro del recibo de febrero y lo lee como un
                error. La fecha sola no lo dice: hay que senalar cual de las dos
                manda.
              */}
              <TableCell
                className={cn(
                  'w-col-fecha px-md tabular-nums',
                  cruzado && 'text-status-warn',
                )}
                // Va en el atributo y no en un `sr-only` dentro de la celda: el
                // texto de esta celda tiene que seguir siendo SOLO la fecha, o el
                // periodo entra en cualquier lectura de la columna.
                title={cruzado ? 'Se hizo en un periodo distinto al programado' : undefined}
              >
                {formatFechaCortaBog(fila.ejecutado)}
              </TableCell>

              <TableCell className="w-col-acargo truncate px-md">
                {fila.aseador ?? (
                  <>
                    <span aria-hidden="true">—</span>
                    <span className="sr-only">sin definir</span>
                  </>
                )}
              </TableCell>

              <TableCell className={TD_DINERO}>
                <Dinero valor={fila.cobrado} />
              </TableCell>

              <TableCell className={TD_DINERO}>
                <Dinero valor={fila.pagado} />
              </TableCell>

              <TableCell className={TD_DINERO}>
                <Dinero valor={fila.margen} className="font-semibold" />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>

      {/*
        LA FILA DE TOTALES. Es la conciliacion contra los KPIs del Resumen, y tiene
        que cuadrar exactamente: si los dos numeros discrepan, el admin deja de
        creerle a los dos a la vez y vuelve al Excel, que es lo que esta fase
        existe para reemplazar.

        La primera celda es un encabezado de fila DE VERDAD (§13.1), no una celda
        con texto en negrita: es lo que hace que un lector de pantalla anuncie
        "1 aseos" al leer cualquiera de los tres totales de la derecha.
      */}
      {/* `bg-canvas` y no el relleno tenue por defecto de la primitiva: es el
          mismo tratamiento de superficie que la fila de encabezado, y asi el pie
          cierra la tabla con la misma senal con la que la abre. `font-normal`
          porque la primitiva trae peso 500, que no existe en este sistema (§3.2):
          el enfasis del pie lo dan las celdas, en semi negrita. */}
      <TableFooter className="bg-canvas font-normal">
        <TableRow className="h-fila hover:bg-canvas">
          <TableHead scope="row" className="min-w-col-nombre px-md font-semibold">
            {totales.aseos} aseos
          </TableHead>

          {/* Las tres celdas mudas conservan la rejilla: sin ellas, los totales se
              desplazarian bajo las columnas de fecha. */}
          <TableCell className="w-col-fecha px-md" />
          <TableCell className="w-col-fecha px-md" />
          <TableCell className="w-col-acargo px-md" />

          <TableCell className={`${TD_DINERO} font-semibold`}>
            <Dinero valor={totales.cobrado} />
          </TableCell>
          <TableCell className={`${TD_DINERO} font-semibold`}>
            <Dinero valor={totales.pagado} />
          </TableCell>
          <TableCell className={`${TD_DINERO} font-semibold`}>
            <Dinero valor={totales.margen} />
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}
