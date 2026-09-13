'use client';

import { useRouter } from 'next/navigation';

import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { formatFechaCortaBog } from '@/lib/domain/dates';
import { formatCOP } from '@/lib/domain/money';

import { DialogoRecibo, type GastoDelRecibo } from './DialogoRecibo';

/**
 * El desglose de un pago (07-UI-SPEC §9.3).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUÉ ES PANEL Y NO PÁGINA, QUE ES LA PREGUNTA RAZONABLE.
 *
 * El desglose son dos listas de solo lectura que el admin abre, mira y cierra
 * OCHO VECES SEGUIDAS mientras paga, y mientras lo hace quiere conservar la
 * tabla detrás para saber por dónde va. La ficha de aseadora, en cambio, tiene
 * cuatro bloques, uno con su propio estado, y además abre recibos: un diálogo
 * dentro de un panel dentro de una página es donde se pierde el foco y la tecla
 * de escape deja de hacer lo que uno espera. Por eso una es panel y la otra es
 * página (§5.3).
 *
 * ── EL PANEL VIVE EN LA DIRECCIÓN, EN `?pago={id}` ───────────────────────
 *
 * Y no en estado de cliente. Tres razones, y la tercera es la que decide:
 *
 *   1. Es enlazable y sobrevive a un refresco, igual que el filtro de periodo
 *      del Resumen. La mitad del estado de esta sección ya vive en la URL;
 *      poner la otra mitad en el cliente es lo que hace que una pantalla se
 *      comporte distinto según cómo llegaste a ella.
 *   2. Las líneas las renderiza el SERVIDOR, así que el desglose completo de los
 *      ocho pagos de un periodo no viaja al navegador por si acaso.
 *   3. **Y sobre todo: las URL firmadas de los recibos se emiten solo para el
 *      pago que alguien está mirando**, en el momento de mirarlo. Con el panel
 *      en estado de cliente habría que firmar los recibos de todas las filas de
 *      la página al cargarla, y una URL firmada sobrevive al cierre de sesión
 *      hasta que expire. El bucket es privado justamente para que eso no pase.
 *
 * Se navega con `replace` en los dos sentidos (abrir y cerrar): abrir ocho
 * desgloses seguidos dejaría dieciséis entradas de historial y el botón de
 * volver del navegador dejaría de servir para volver a ninguna parte.
 *
 * ── LAS LÍNEAS SON TEXTO CONGELADO, NO UNIONES VIVAS (FIN-04) ────────────
 *
 * Un aseo borrado por antigüedad sigue mostrando su apartamento, su monto y sus
 * dos fechas, porque todo eso está COPIADO en la línea desde el cierre.
 * **Consecuencia directa y visible: no se renderiza ni un solo enlace desde
 * estas líneas.** Apuntarían a filas que pueden no existir.
 *
 * ── LAS DOS FECHAS DE CADA ASEO, SIEMPRE (D7-8) ─────────────────────────
 *
 * `Programado 28 ene · Hecho 2 feb`, y **no se abrevia cuando coinciden**. Si la
 * línea apareciera solo en los casos raros dejaría de ser información y pasaría
 * a ser una señal de alarma: un aseo de enero dentro del recibo de febrero
 * parece un error hasta que se dice cuándo se programó y cuándo se hizo.
 *
 * ── NI UNA CIFRA DE HUÉSPED, NI UN MARGEN ───────────────────────────────
 *
 * No porque el aseador vaya a ver este panel (no lo ve), sino porque el desglose
 * del admin y el del aseador tienen que ser **el mismo documento**: si el admin
 * ve una columna de más, cuando alguien reclame van a estar comparando dos
 * papeles distintos. La función de la base tampoco las devuelve, así que el dato
 * ni siquiera viaja.
 *
 * ── EL COMPORTAMIENTO DE LA PRIMITIVA NO SE DESACTIVA ───────────────────
 *
 * Atrapa el foco, responde a la tecla de escape y lo devuelve al elemento que
 * estaba enfocado al abrirse, que es el enlace del nombre. Ninguno se toca.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Una línea de aseo del desglose. Las dos fechas son obligatorias, no opcionales. */
export type LineaDeAseo = {
  clave: string;
  apartamento: string;
  /** Día de negocio `'YYYY-MM-DD'`. */
  programado: string;
  hecho: string;
  /** Pesos enteros. */
  monto: number;
};

/** Una línea de gasto reembolsado, con su recibo ya firmado por el servidor. */
export type LineaDeGasto = {
  clave: string;
  concepto: string;
  /** Día de negocio `'YYYY-MM-DD'`. */
  fecha: string;
  apartamento: string;
  /** Pesos enteros. */
  monto: number;
  /**
   * Lo que el diálogo del recibo necesita, o `null` si el gasto no tiene ninguna
   * foto registrada (nunca la tuvo, o ya se purgó por antigüedad).
   *
   * Con `null` no se ofrece el botón: un botón que abre un diálogo que dice que
   * no hay nada es un viaje para nada. Se dice en la línea y ya.
   */
  recibo: GastoDelRecibo | null;
};

/** El encabezado de sección: micro 12/600 en versalitas, con su subtotal a la derecha. */
function Seccion({ rotulo, subtotal }: { rotulo: string; subtotal: number }) {
  return (
    <div className="flex items-baseline justify-between gap-md">
      {/*
        El rótulo va escrito EN MAYÚSCULA y no solo con `uppercase`: la clase
        transforma el glifo pero no el texto del DOM, y §15.2 fija `POR ASEOS` y
        `GASTOS REEMBOLSADOS` como copy.
      */}
      <span className="text-micro font-semibold tracking-columna text-muted-foreground uppercase">
        {rotulo}
      </span>
      <span className="text-body font-semibold tabular-nums text-foreground">
        {formatCOP(subtotal)}
      </span>
    </div>
  );
}

export function SheetDesglosePago({
  aseadora,
  etiquetaPeriodo,
  aseos,
  gastos,
  total,
}: {
  aseadora: string;
  /** `Del 1 al 30 de enero de 2026`. Siempre las dos fechas (§11.3). */
  etiquetaPeriodo: string;
  aseos: LineaDeAseo[];
  gastos: LineaDeGasto[];
  /** Pesos enteros, tal como los congeló el cierre. */
  total: number;
}) {
  const router = useRouter();

  const subtotalAseos = aseos.reduce((suma, linea) => suma + linea.monto, 0);
  const subtotalGastos = gastos.reduce((suma, linea) => suma + linea.monto, 0);

  return (
    <Sheet
      open
      onOpenChange={(abierto) => {
        // Cerrar es salir de `?pago=`. `scroll: false` porque la tabla de detrás
        // no se ha movido y devolverla arriba perdería el sitio del admin.
        if (!abierto) router.replace('/finanzas/pagos', { scroll: false });
      }}
    >
      {/*
        El ancho repite la cadena de variantes EXACTA que documenta la cabecera de
        `components/ui/sheet.tsx`. `tailwind-merge` solo considera en conflicto
        dos clases del mismo grupo con la MISMA cadena de variantes: un
        `sm:max-w-sheet` suelto no desplaza a `data-[side=right]:sm:max-w-sheet-base`
        y el ancho pasaría a depender del orden del CSS.
      */}
      <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-sheet">
        <SheetHeader className="gap-sm">
          <SheetTitle className="text-heading font-semibold">{aseadora}</SheetTitle>
          {/*
            Las DOS FECHAS del periodo, también aquí. El panel es lo que alguien
            saca cuando reclama, y un desglose que no dice qué días cubre obliga a
            volver a la tabla para saberlo.
          */}
          <SheetDescription className="text-micro text-muted-foreground">
            {/*
              El espacio inicial es deliberado. El título y esta línea son
              hermanos, así que en cualquier lectura PLANA del panel —copiar y
              pegar, un volcado de texto, una aserción sobre el contenido— los
              dos se concatenan sin separador y sale `Aseador UnoDel 1 al 31…`.
              Un espacio al principio de un bloque no se pinta, así que no cuesta
              nada visualmente y evita que el nombre y el rótulo se peguen.
            */}
            {' '}
            {etiquetaPeriodo}
          </SheetDescription>
        </SheetHeader>

        {/*
          El scroll vive aquí dentro y no en el panel entero: así el título y las
          fechas del periodo se quedan fijos mientras se recorre un desglose de
          veinte líneas, que es lo que hace comparable una línea con su cabecera.
        */}
        <div className="flex flex-col gap-lg overflow-y-auto px-lg pb-lg">
          <Separator />

          <Seccion rotulo="POR ASEOS" subtotal={subtotalAseos} />

          <ul className="flex flex-col gap-md">
            {aseos.map((linea) => (
              <li key={linea.clave} className="flex flex-col gap-xs">
                <div className="flex items-baseline justify-between gap-md">
                  {/* Texto, no enlace: el aseo puede haberse borrado (FIN-04). */}
                  <span className="text-body text-foreground">{linea.apartamento}</span>
                  <span className="shrink-0 text-body tabular-nums text-foreground">
                    {formatCOP(linea.monto)}
                  </span>
                </div>

                {/*
                  D7-8. Las dos fechas SIEMPRE, también cuando coinciden. Es la
                  mitad que se cae sola si alguien «optimiza» el render.
                */}
                <p className="text-micro text-muted-foreground">
                  Programado {formatFechaCortaBog(linea.programado)} · Hecho{' '}
                  {formatFechaCortaBog(linea.hecho)}
                </p>
              </li>
            ))}
          </ul>

          <Separator />

          <Seccion rotulo="GASTOS REEMBOLSADOS" subtotal={subtotalGastos} />

          <ul className="flex flex-col gap-md">
            {gastos.map((linea) => (
              <li key={linea.clave} className="flex flex-col gap-xs">
                <div className="flex items-baseline justify-between gap-md">
                  <span className="text-body text-foreground">{linea.concepto}</span>
                  <span className="shrink-0 text-body tabular-nums text-foreground">
                    {formatCOP(linea.monto)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-md">
                  <p className="text-micro text-muted-foreground">
                    {formatFechaCortaBog(linea.fecha)} · {linea.apartamento}
                  </p>

                  {linea.recibo === null ? (
                    <span className="shrink-0 text-micro text-muted-foreground">
                      Sin recibo disponible
                    </span>
                  ) : (
                    <DialogoRecibo gasto={linea.recibo} />
                  )}
                </div>
              </li>
            ))}
          </ul>

          <Separator />

          {/*
            El total al pie y separado. `TOTAL` va solo en su elemento: es la
            cifra que se compara contra la transferencia.
          */}
          <div className="flex items-baseline justify-between gap-md">
            <span className="text-micro font-semibold tracking-columna text-muted-foreground uppercase">
              TOTAL
            </span>
            <span className="text-body font-semibold tabular-nums text-foreground">
              {formatCOP(total)}
            </span>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
