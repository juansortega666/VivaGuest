import { Wallet } from 'lucide-react';
import type { Metadata } from 'next';

import {
  leerDetalleDePago,
  leerPagosDelPeriodo,
  leerPeriodoPendienteDeCierre,
  leerPeriodosDePago,
  type LineaDeDesglose,
  type PagoDelPeriodo,
  type PeriodoCerrado,
} from '@/lib/data/pagos';
import { firmarRecibo } from '@/lib/data/recibos';
import { etiquetaDePeriodoDePago } from '@/lib/domain/mes';
import { createClient } from '@/lib/supabase/server';

import { EstadoVacio } from '../../_components/EstadoVacio';
import { AvisoPeriodoSinCerrar } from '../_components/AvisoPeriodoSinCerrar';
import { BloquePeriodoCerrado } from '../_components/BloquePeriodoCerrado';
import {
  SheetDesglosePago,
  type LineaDeAseo,
  type LineaDeGasto,
} from '../_components/SheetDesglosePago';
import { SubNavFinanzas } from '../_components/SubNavFinanzas';

export const metadata: Metadata = {
  title: 'Pagos · Finanzas · VivaGuest',
};

/**
 * `/finanzas/pagos` — el registro de lo que se debe y de lo que se pagó
 * (FIN-03, FIN-04, 07-UI-SPEC §9).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESTA PANTALLA ES LA QUE HACE VERDADERO EL CRITERIO DEL SNAPSHOT CONSULTABLE.
 *
 * FIN-04 dice que el desglose de un pago sigue consultable aunque los aseos que
 * lo sustentan se hayan borrado por antigüedad. El schema lo consiguió copiando
 * texto en vez de punteros, y la lectura lo conserva no uniéndose contra las
 * tablas vivas. Pero **«consultable» implica que alguien pueda consultarlo**, y
 * eso no existía hasta esta ruta.
 *
 * ── LA DIFERENCIA DE CONTRATO CON EL RESUMEN, Y LA PANTALLA TIENE QUE DECIRLA ─
 *
 * El Resumen es una FOTO EN VIVO: se recalcula con el filtro de periodo y se
 * vaciará cuando los aseos viejos se borren. Pagos es el REGISTRO CONGELADO: un
 * periodo cerrado no se recalcula nunca (D7-3), aunque después se corrija una
 * tarifa. Son dos contratos de confianza distintos, y por eso **esta ruta no
 * tiene filtro de periodo**: filtrar un registro contable por un rango
 * arbitrario sugeriría que las cifras se recalculan con él.
 *
 * ── COMPONENTE DE SERVIDOR, Y LA AUTORIZACIÓN NO ESTÁ AQUÍ ──────────────
 *
 * El layout de `(admin)` ya exige admin contra el servidor de autenticación —no
 * contra un claim del token, que es lo único que hace visible una desactivación
 * inmediata— y las cuatro funciones de la base vuelven a comprobar el rol por
 * dentro. Esa es la frontera. Este archivo no añade ninguna comprobación propia:
 * una tercera copia de la misma regla es un sitio más donde equivocarse.
 *
 * El layout declara además render dinámico, así que esta página nunca se cachea.
 *
 * ── LAS LECTURAS SON EN CASCADA POR NECESIDAD, NO POR DESCUIDO ──────────
 *
 * Primero los periodos, porque hasta saber cuáles son no se sabe qué pagos
 * pedir; después los pagos de todos ellos EN PARALELO. Encadenar los pagos entre
 * sí sería sumar tantas latencias como periodos haya.
 *
 * ── DEUDA DECLARADA, HEREDADA DEL CONTRATO (§17.9) ──────────────────────
 *
 * Esto no paginará bien a los dos años: veinticuatro periodos de ocho filas cada
 * uno, todos en el DOM aunque estén colapsados, y una llamada de pagos por cada
 * uno. El detonante es pasar de 18 periodos cerrados. No es un problema hoy y no
 * se resuelve hoy.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Un periodo con sus pagos ya leídos. Es lo que consume cada bloque. */
type PeriodoConPagos = { periodo: PeriodoCerrado; pagos: PagoDelPeriodo[] };

/**
 * Parte el desglose en sus dos secciones y firma los recibos de los gastos.
 *
 * ── LA FIRMA SE EMITE AQUÍ, EN EL SERVIDOR Y DESPUÉS DEL GUARD ──────────
 *
 * El bucket es privado y la ruta del archivo es, por sí sola, una autorización:
 * quien la conoce puede pedir que se la firmen. Por eso la función de la base
 * devuelve bucket y ruta, y lo único que viaja al navegador es la URL ya firmada
 * y con vida corta. Y por eso solo se firman los recibos DEL PAGO QUE SE ESTÁ
 * MIRANDO: firmar los de las ocho filas de cada periodo al cargar la página
 * dejaría decenas de URL vivas en el navegador por si acaso.
 */
async function componerDesglose(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lineas: LineaDeDesglose[],
): Promise<{ aseos: LineaDeAseo[]; gastos: LineaDeGasto[] }> {
  const aseos: LineaDeAseo[] = [];
  const gastos: LineaDeGasto[] = [];

  // El índice es la clave de render: las líneas del snapshot no tienen
  // identificador propio y su orden es el que escribió el cierre, estable entre
  // dos lecturas del mismo recibo. Reordenarlas aquí haría que el mismo
  // documento se leyera distinto en dos visitas.
  for (const [indice, linea] of lineas.entries()) {
    if (linea.tipo === 'aseo') {
      aseos.push({
        clave: String(indice),
        apartamento: linea.apartamento,
        programado: linea.fechaProgramada,
        hecho: linea.fechaEjecucion,
        monto: linea.monto,
      });
      continue;
    }

    const firmado = await firmarRecibo(
      supabase,
      linea.recibo ? { bucket: linea.recibo.bucket, ruta: linea.recibo.ruta } : null,
    );

    gastos.push({
      clave: String(indice),
      // El concepto es `not null` en las líneas de gasto por construcción del
      // cierre. El respaldo existe solo para que un dato corrupto no deje la
      // línea sin nada que leer, no porque se espere.
      concepto: linea.concepto ?? 'Gasto',
      // La fecha que se enseña de un gasto es la de EJECUCIÓN del aseo al que
      // pertenece: el gasto pertenece al periodo de su aseo, no al de su propia
      // fecha de creación, y enseñar otra cosa haría que una línea pareciera de
      // otro mes.
      fecha: linea.fechaEjecucion,
      apartamento: linea.apartamento,
      monto: linea.monto,
      recibo:
        firmado.estado === 'sin_evidencia'
          ? null
          : {
              concepto: linea.concepto ?? 'Gasto',
              fecha: linea.fechaEjecucion,
              apartamento: linea.apartamento,
              monto: linea.monto,
              // `firma_fallida` viaja como ausencia de URL: desde el lado del
              // admin la acción disponible es la misma que con una firma vencida.
              urlFirmada: firmado.estado === 'firmado' ? firmado.url : null,
            },
    });
  }

  return { aseos, gastos };
}

export default async function PagosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parametros = await searchParams;
  const crudoPago = parametros.pago;
  const pagoPedido = typeof crudoPago === 'string' ? crudoPago : null;

  const supabase = await createClient();

  const [periodos, pendiente] = await Promise.all([
    leerPeriodosDePago(supabase),
    leerPeriodoPendienteDeCierre(supabase),
  ]);

  const conPagos: PeriodoConPagos[] = await Promise.all(
    periodos.map(async (periodo) => ({
      periodo,
      pagos: await leerPagosDelPeriodo(supabase, periodo.desde),
    })),
  );

  // El identificador del panel llega de fuera, así que se comprueba contra lo que
  // esta página ya leyó en vez de mandarlo a la base a ver qué pasa. No es una
  // frontera de seguridad —la función de detalle tiene su propia guarda de rol y
  // un admin puede ver todos los pagos— sino de comportamiento: una dirección
  // escrita a mano tiene que enseñar la pantalla, no un error que nadie sabría
  // explicar.
  let abierto: {
    pago: PagoDelPeriodo;
    etiquetaPeriodo: string;
    aseos: LineaDeAseo[];
    gastos: LineaDeGasto[];
  } | null = null;

  if (pagoPedido !== null) {
    for (const { periodo, pagos } of conPagos) {
      const pago = pagos.find((p) => p.pagoId === pagoPedido);
      if (!pago) continue;

      const { aseos, gastos } = await componerDesglose(
        supabase,
        await leerDetalleDePago(supabase, pago.pagoId),
      );

      abierto = {
        pago,
        etiquetaPeriodo: etiquetaDePeriodoDePago(periodo.desde, periodo.hasta),
        aseos,
        gastos,
      };
      break;
    }
  }

  return (
    <div className="flex flex-col gap-xl">
      <h1 className="text-display text-foreground">Finanzas</h1>

      <SubNavFinanzas />

      {/*
        EL AVISO NO EXISTE EN EL DOM EN EL CASO NORMAL. La función de la base
        devuelve cero filas mientras todo esté al día, y esta condición es lo que
        lo mantiene fuera: un botón de «cerrar el mes» siempre visible invita a
        cerrar antes de tiempo, y un periodo cerrado no se vuelve a tocar.
      */}
      {pendiente !== null && (
        <AvisoPeriodoSinCerrar desde={pendiente.desde} hasta={pendiente.hasta} />
      )}

      {conPagos.length === 0 ? (
        /*
          EL VACÍO MÁS IMPORTANTE DE LA FASE (§12.1, fila 5), y por eso su cuerpo
          explica EL MECANISMO en vez de describir la ausencia: sin él, el admin
          mira una pantalla en blanco esperando algo que no sabe que va a llegar
          solo. Decir cuándo ocurre el primer cierre convierte una ausencia en
          una espera con fecha.
        */
        <EstadoVacio
          icono={Wallet}
          encabezado="Todavía no se ha cerrado ningún periodo."
          cuerpo="El primer cierre ocurre el último día hábil del mes. Ahí aparece cuánto se le debe a cada persona."
        />
      ) : (
        <div className="flex flex-col gap-lg">
          {conPagos.map(({ periodo, pagos }, indice) => (
            <BloquePeriodoCerrado
              key={periodo.desde}
              desde={periodo.desde}
              hasta={periodo.hasta}
              personas={periodo.personas}
              montoTotal={periodo.montoTotal}
              faltanPorPagar={periodo.faltanPorPagar}
              pagos={pagos}
              // Solo el más reciente nace abierto. La función de la base ya
              // devuelve del más reciente al más antiguo, así que es el primero.
              expandidoInicial={indice === 0}
            />
          ))}
        </div>
      )}

      {abierto !== null && (
        <SheetDesglosePago
          // La clave por pago desmonta y vuelve a montar el panel al cambiar de
          // persona. Sin ella, abrir un segundo desglose reutilizaría el árbol
          // del primero y el panel no volvería a hacer su entrada ni recolocaría
          // el foco: se vería el nombre nuevo dentro del panel viejo.
          key={abierto.pago.pagoId}
          aseadora={abierto.pago.aseadora}
          etiquetaPeriodo={abierto.etiquetaPeriodo}
          aseos={abierto.aseos}
          gastos={abierto.gastos}
          total={abierto.pago.montoTotal}
        />
      )}
    </div>
  );
}
