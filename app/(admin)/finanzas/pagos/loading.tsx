import { Skeleton } from '@/components/ui/skeleton';

/**
 * Carga de `/finanzas/pagos` (07-UI-SPEC §12.2a).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESQUELETO DE GEOMETRIA REAL, NUNCA UN INDICADOR DE ESPERA CENTRADO.
 *
 * La razon no es estetica: un indicador centrado sobre una tabla de siete
 * columnas ocupa un punto, y al resolverse el contenido salta de golpe y el ojo
 * pierde el sitio. Aqui se reproducen las medidas reales —la cabecera de periodo
 * de 48px, la fila de encabezado de 32px con los anchos de columna EXACTOS de
 * §9.1, y diez filas de 40px— para que la unica diferencia al llegar los datos
 * sea que el gris se convierte en texto.
 *
 * ── LOS ANCHOS SON LOS DE VERDAD, Y ESO ES EL PUNTO ─────────────────────
 *
 * Diez filas de bloques grises de cualquier ancho tambien tapan el hueco, pero
 * entonces las columnas se recolocan al llegar los datos y el salto vuelve. Se
 * usan los mismos tokens que la tabla (`w-col-conteo`, `w-col-dinero`,
 * `w-col-pagado`, `w-col-accion-pago`, `min-w-col-nombre`) para que si alguien
 * cambia un ancho, cambien los dos a la vez.
 *
 * ── UN SOLO BLOQUE EN GRIS, Y NO LOS DOS O LOS VEINTE ───────────────────
 *
 * Solo el periodo mas reciente nace abierto, asi que solo uno tiene tabla que
 * enseñar. Cuantos periodos cerrados hay es justo lo que todavia no se sabe:
 * pintar tres cabeceras en gris seria afirmar un dato que no ha llegado.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** El tratamiento comun de cada celda del esqueleto: alto de texto, ancho de columna. */
function Celda({ ancho, clase }: { ancho: string; clase?: string }) {
  return (
    <div className={`${ancho} px-md ${clase ?? ''}`}>
      <Skeleton className="h-4 w-full" />
    </div>
  );
}

/** Una fila de la tabla, con los siete anchos exactos de §9.1. */
function FilaEsqueleto({ alto }: { alto: string }) {
  return (
    <div className={`flex ${alto} items-center border-b border-border last:border-b-0`}>
      <Celda ancho="min-w-col-nombre flex-1" />
      <Celda ancho="w-col-conteo" />
      <Celda ancho="w-col-dinero" />
      <Celda ancho="w-col-dinero" />
      <Celda ancho="w-col-dinero" />
      <Celda ancho="w-col-pagado" />
      <Celda ancho="w-col-accion-pago" />
    </div>
  );
}

export default function CargandoPagos() {
  return (
    <div className="flex flex-col gap-xl" aria-busy="true" aria-live="polite">
      {/*
        El titulo se pinta con su texto REAL y no en gris: `Finanzas` no depende
        de ningun dato, asi que agrisarlo seria fingir que se esta cargando algo
        que ya esta.
      */}
      <h1 className="text-display text-foreground">Finanzas</h1>

      {/* El sub-nav: dos enlaces cortos sobre la linea base. */}
      <div className="flex items-stretch gap-xs border-b border-border">
        <Skeleton className="mb-sm h-4 w-20" />
        <Skeleton className="mb-sm h-4 w-16" />
      </div>

      <div className="rounded-md border border-border bg-background">
        {/* La cabecera colapsable del periodo: 48px, sobre el lienzo. */}
        <div className="flex h-dia-cabecera items-center justify-between gap-md rounded-t-md border-b border-border bg-canvas px-md">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-3 w-64" />
        </div>

        <div className="bg-canvas">
          <FilaEsqueleto alto="h-fila-encabezado" />
        </div>

        {Array.from({ length: 10 }, (_, i) => (
          <FilaEsqueleto key={i} alto="h-fila" />
        ))}
      </div>

      <span className="sr-only">Cargando los pagos por periodo</span>
    </div>
  );
}
