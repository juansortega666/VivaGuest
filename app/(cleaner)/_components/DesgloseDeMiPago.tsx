import { CircleCheck, ImageOff } from 'lucide-react';

import type { MiAseoDelPago, MiPagoCerrado } from '@/lib/data/pagos-aseador';
import { diaBog, formatFechaCortaBog, formatFechaLargaBog } from '@/lib/domain/dates';
import { etiquetaDePeriodoDePago } from '@/lib/domain/mes';
import { formatCOP } from '@/lib/domain/money';

/**
 * El desglose de `/mis-pagos/[id]` (07-UI-SPEC §10.4).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ES EL MISMO DOCUMENTO QUE EL DESGLOSE DEL ADMIN, CON OTRO VOCABULARIO.
 *
 * Las dos superficies leen funciones de base con la MISMA firma de nueve
 * columnas, y hay una asercion en el catalogo que se pone roja si alguien le
 * anade una a una sola de las dos. Aqui cambia como se dice, no lo que dice.
 *
 * ── LO QUE ESTA PANTALLA NO MUESTRA, Y ES LA MITAD DE SU VALOR ────────────
 *
 * Ninguna cifra de huesped y ninguna de la que se pueda despejar una. Ni
 * siquiera derivada: una resta entre dos numeros que si se pueden ver seria la
 * misma fuga con otro nombre. Y no se filtra aqui: la funcion de base no la
 * devuelve y el tipo de la capa de lectura no la declara, asi que el dato no
 * viaja al telefono. Este componente no recibe por props ningun objeto que la
 * contenga.
 *
 * Tampoco entra el vocabulario del admin. Se dice `Gastos que te devuelven`, con
 * las palabras de la persona que hizo la compra, y no las de contabilidad.
 *
 * Tampoco hay ningun contador de acciones pendientes de cola, que sigue siendo
 * prohibicion activa en todo este arbol desde la Fase 6.
 *
 * ── LAS DOS FECHAS POR ASEO, SIEMPRE, TAMBIEN CUANDO COINCIDEN (D7-8) ─────
 *
 * Un aseo pertenece al periodo en que se COMPLETO, no a aquel para el que
 * estaba programado. Sin las dos fechas, un aseo programado en enero que
 * aparece en el recibo de febrero parece un error, y el reclamo llega igual.
 *
 * Abreviar la linea cuando las dos coinciden seria peor que redundante: haria
 * que la version larga pareciera la excepcion, justo el dia en que hay que
 * leerla con atencion.
 *
 * ── EL RECIBO LLEGA FIRMADO, NUNCA SU RUTA ───────────────────────────────
 *
 * En un bucket privado la ruta es, por si sola, una autorizacion. La pagina
 * firma en el servidor y a este componente le baja la URL ya firmada, con vida
 * corta, o nada.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Copy literal del contrato (§15.2 y §12.1). No se parafrasea. */
const SECCION_ASEOS = 'Tus aseos';
const SECCION_GASTOS = 'Gastos que te devuelven';
const TOTAL = 'Total';
const PENDIENTE = 'Pendiente de pago';
const SIN_RECIBO_TITULO = 'Este recibo ya no está disponible.';
const SIN_RECIBO_CUERPO = 'El gasto y su monto siguen registrados.';

/** Fallbacks de seccion vacia. Una cabecera sola sobre nada no dice nada. */
const SIN_ASEOS = 'No hay ningún aseo en este periodo.';
const SIN_GASTOS = 'No reportaste ninguna compra en este periodo.';

/** Un gasto con su foto YA RESUELTA por el servidor. Nunca con su ruta. */
export interface GastoConRecibo {
  concepto: string;
  fecha: string;
  monto: number;
  /**
   * La URL firmada, o nulo cuando no hay foto que ensenar.
   *
   * ── LOS DOS «SIN FOTO» SE VEN IGUAL AQUI, Y EN EL ADMIN NO ───────────────
   *
   * La ficha del admin distingue «la foto ya no existe» de «la firma fallo»,
   * porque el admin puede volver a intentarlo y le sirve saber cual es. A quien
   * hizo la compra no: en los dos casos no hay imagen, en los dos casos su
   * dinero sigue registrado, y en los dos casos no hay nada que pueda hacer. Una
   * distincion sin consecuencia es ruido en una pantalla de telefono.
   */
  urlDelRecibo: string | null;
}

export function DesgloseDeMiPago({
  pago,
  aseos,
  gastos,
  anioDeHoy,
}: {
  pago: MiPagoCerrado;
  aseos: MiAseoDelPago[];
  gastos: GastoConRecibo[];
  /** El ano del dia de negocio, resuelto una vez en la pagina. */
  anioDeHoy: string;
}) {
  const rotulo = etiquetaDePeriodoDePago(
    pago.desde,
    pago.hasta,
    pago.hasta.slice(0, 4) !== anioDeHoy,
  );
  const diaDelPago = diaBog(pago.pagadoAt);

  return (
    <div className="flex flex-col gap-xl">
      <header className="flex flex-col gap-xs">
        <span className="text-body-movil text-muted-foreground">{rotulo}</span>

        <span className="text-display-movil tabular-nums text-foreground">
          {formatCOP(pago.total)}
        </span>

        {/* El estado va ARRIBA: es lo primero que se viene a mirar. */}
        {diaDelPago === null ? (
          <span className="text-micro-movil text-status-warn">{PENDIENTE}</span>
        ) : (
          <span className="flex items-center gap-xs text-micro-movil text-status-ok">
            <CircleCheck size={20} strokeWidth={2} aria-hidden="true" />
            {`Te lo pagaron el ${formatFechaLargaBog(diaDelPago)}`}
          </span>
        )}
      </header>

      <section className="flex flex-col gap-md">
        <h2 className="text-heading-movil text-foreground">{SECCION_ASEOS}</h2>

        {aseos.length === 0 ? (
          <p className="text-body-movil text-muted-foreground">{SIN_ASEOS}</p>
        ) : (
          <ul className="flex flex-col gap-md">
            {aseos.map((aseo, i) => (
              <LineaDeAseo key={`${aseo.apartamento}-${aseo.hecho}-${i}`} aseo={aseo} />
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-md">
        <h2 className="text-heading-movil text-foreground">{SECCION_GASTOS}</h2>

        {gastos.length === 0 ? (
          <p className="text-body-movil text-muted-foreground">{SIN_GASTOS}</p>
        ) : (
          <ul className="flex flex-col gap-lg">
            {gastos.map((gasto, i) => (
              <LineaDeGasto key={`${gasto.concepto}-${gasto.fecha}-${i}`} gasto={gasto} />
            ))}
          </ul>
        )}
      </section>

      <div className="flex items-baseline justify-between gap-md border-t border-border pt-lg">
        <span className="text-heading-movil text-foreground">{TOTAL}</span>
        <span className="text-heading-movil tabular-nums text-foreground">
          {formatCOP(pago.total)}
        </span>
      </div>
    </div>
  );
}

/**
 * Una linea de aseo: apartamento, sus dos fechas, y lo que se le paga por el.
 *
 * La linea de las dos fechas se compone en UNA cadena y no en tres nodos de
 * texto: asi lo que se lee y lo que se afirma en la suite son literalmente la
 * misma cosa, y un espacio de mas en el JSX no puede cambiarla en silencio.
 */
function LineaDeAseo({ aseo }: { aseo: MiAseoDelPago }) {
  return (
    <li className="flex items-start justify-between gap-md">
      <span className="flex min-w-0 flex-col">
        <span className="text-body-movil text-foreground">{aseo.apartamento}</span>
        <span className="text-micro-movil text-muted-foreground">
          {`Programado ${formatFechaCortaBog(aseo.programado)} · Hecho ${formatFechaCortaBog(aseo.hecho)}`}
        </span>
      </span>

      <span className="shrink-0 text-body-movil tabular-nums text-foreground">
        {formatCOP(aseo.monto)}
      </span>
    </li>
  );
}

/** Una compra: concepto, dia, monto, y su foto o la explicacion de su ausencia. */
function LineaDeGasto({ gasto }: { gasto: GastoConRecibo }) {
  return (
    <li className="flex flex-col gap-sm">
      <span className="flex items-start justify-between gap-md">
        <span className="flex min-w-0 flex-col">
          <span className="text-body-movil text-foreground">{gasto.concepto}</span>
          <span className="text-micro-movil text-muted-foreground">
            {formatFechaLargaBog(gasto.fecha)}
          </span>
        </span>

        <span className="shrink-0 text-body-movil tabular-nums text-foreground">
          {formatCOP(gasto.monto)}
        </span>
      </span>

      {gasto.urlDelRecibo === null ? (
        <div className="flex flex-col items-center gap-sm rounded-md border border-border p-lg text-center">
          <ImageOff size={32} strokeWidth={2} className="text-muted-foreground" aria-hidden="true" />
          <span className="text-micro-movil text-foreground">{SIN_RECIBO_TITULO}</span>
          <span className="text-micro-movil text-muted-foreground">{SIN_RECIBO_CUERPO}</span>
        </div>
      ) : (
        /*
          Etiqueta nativa y no el componente de imagen del framework: la URL
          firmada es de un dominio externo, con parametros de consulta y vida de
          cinco minutos. Optimizarla obligaria a declarar el host como remoto y
          dejaria una copia del recibo en la cache del optimizador, que es
          exactamente lo que un bucket privado existe para que no pase.

          `object-contain` y no `cover`: un recibo recortado pierde el total, que
          es lo unico que se viene a mirar.
        */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={gasto.urlDelRecibo}
          alt={`Recibo de ${gasto.concepto}`}
          className="max-h-recibo-alto w-full rounded-md border border-border object-contain"
        />
      )}
    </li>
  );
}
