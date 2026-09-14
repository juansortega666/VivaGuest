import { formatCOP } from '@/lib/domain/money';

/**
 * Una card de KPI (07-UI-SPEC §6.3, §3.1 y §4.4).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * LO QUE HACE DESTACAR AL NUMERO NO ES SU TAMANO.
 *
 * La tentacion evidente de un tablero financiero es una cifra de cuarenta
 * pixeles para que "pese". No se hace: el tamano de display es el techo del
 * sistema y la escala tiene exactamente cuatro roles a proposito. Un quinto
 * obligaria ademas a registrarlo en el grupo de tamanos de `cn()`, que es el
 * defecto silencioso de siempre: la clase se escribe, se lee bien en el codigo y
 * no llega al DOM.
 *
 * Lo que hace que el KPI destaque es su card propia de alto fijo, su etiqueta en
 * micro versalitas encima y el aire alrededor. Con cuatro cifras en cuatro cards
 * de 336px, la jerarquia ya esta resuelta.
 *
 * ── SIN ICONO, SIN FONDO DE COLOR Y SIN FLECHA DE TENDENCIA ─────────────────
 *
 * No hay periodo anterior contra el que comparar dentro del alcance de esta
 * fase: el historico mes contra mes esta declarado como no definido. **Una
 * flecha sin serie es decoracion que miente**, y la primera vez que alguien la
 * crea toma una decision sobre una comparacion que nadie calculo.
 *
 * ── NINGUN VALOR SE TINE, Y ES LA REGLA DURA DE LA PANTALLA ────────────────
 *
 * La ganancia positiva va en el color de texto principal, NO en verde: tenir de
 * verde el noventa y cinco por ciento de los renders hace que el verde no
 * signifique nada, y hace que el cinco por ciento restante parezca un fallo del
 * sistema en vez de un mes flojo. Los dos KPIs de costo tampoco: pagarle a la
 * gente no es una perdida.
 *
 * Un margen negativo lleva el signo menos, que ya dice lo que pasa, y el color
 * de aviso vive en la columna de margen del detalle, no aqui. La ganancia del
 * periodo se pinta con el mismo criterio que las demas: es un dato, no una
 * alarma que el admin pueda atender desde esta pantalla.
 * ════════════════════════════════════════════════════════════════════════════
 */
export function TarjetaKPI({
  etiqueta,
  valor,
  leyenda,
}: {
  /** En versalitas, con el copy exacto del contrato. */
  etiqueta: string;
  /** Pesos enteros. Cero es un hecho del periodo, no ausencia. */
  valor: number;
  /**
   * Solo el cuarto la lleva, porque es el unico derivado y es la cifra sobre la
   * que el dueno toma decisiones. Cuatro leyendas serian ruido: los otros tres se
   * explican solos.
   */
  leyenda?: string;
}) {
  return (
    // Alto FIJO y no mínimo: con `min-h`, la card de la leyenda mediría más que
    // las otras tres y la fila dejaría de leerse como una sola lectura de suma y
    // resta. Los 104px salen de la cuenta del contrato: 16+17+8+29+17+16.
    <div className="flex h-kpi flex-col rounded-md border border-border bg-background p-lg">
      <p className="text-micro font-semibold tracking-columna text-muted-foreground uppercase">
        {etiqueta}
      </p>

      {/*
        `tabular-nums` es obligatorio en toda cifra. Sin él, las cuatro cards no
        alinean sus unidades entre sí y la comparación visual, que es el único
        trabajo de esta pantalla, deja de funcionar.
      */}
      <p className="mt-sm text-display tabular-nums text-foreground">{formatCOP(valor)}</p>

      {leyenda && <p className="mt-auto text-micro text-muted-foreground">{leyenda}</p>}
    </div>
  );
}
