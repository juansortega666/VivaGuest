import { Skeleton } from '@/components/ui/skeleton';

/**
 * Carga de `/finanzas` (07-UI-SPEC §12.2a).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESQUELETO DE GEOMETRIA REAL, NUNCA UN INDICADOR DE ESPERA CENTRADO.
 *
 * La razon no es estetica: en un layout de cuatro cards de 104px mas dos bloques
 * anchos, un indicador centrado ocupa un punto, y al resolverse el contenido
 * salta de golpe y el ojo pierde el sitio. Aqui se reproducen las medidas reales
 * —las cuatro cards con su alto fijo, las cabeceras de bloque, las tres filas de
 * conteo y las de 56px del bloque por aseadora— para que la unica diferencia al
 * llegar los datos sea que el gris se convierte en texto.
 *
 * ── ESTE ES EL CASO A, Y NO SE CONFUNDE CON EL CASO B ────────────────────
 *
 * Esto se ve al LLEGAR a la ruta por primera vez. **Cambiar de rango es otra
 * cosa** y no pasa por aqui: ahi las cifras viejas se quedan visibles y
 * atenuadas mientras llegan las nuevas, porque lo que el admin esta haciendo es
 * comparar y unos bloques grises le quitan justo eso. Lo resuelve el filtro con
 * su transicion, no este archivo.
 *
 * La cabecera se pinta con su titulo REAL y no en gris: el texto `Finanzas` no
 * depende de ningun dato, asi que agrisarlo seria fingir que se esta cargando
 * algo que ya esta.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Una card de KPI: etiqueta corta arriba, cifra ancha debajo, alto fijo. */
function CardKPIEsqueleto() {
  return (
    <div className="flex h-kpi flex-col gap-sm rounded-md border border-border bg-background p-lg">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="h-6 w-32" />
    </div>
  );
}

/** Cabecera de bloque de 40px mas N filas del alto que toque. */
function BloqueEsqueleto({ filas, alto }: { filas: number; alto: string }) {
  return (
    <div className="rounded-md border border-border bg-background">
      <div className="flex h-fila items-center border-b border-border px-lg">
        <Skeleton className="h-4 w-48" />
      </div>

      {Array.from({ length: filas }, (_, i) => (
        <div
          key={i}
          className={`flex ${alto} items-center justify-between gap-md border-b border-border px-lg last:border-b-0`}
        >
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-20 shrink-0" />
        </div>
      ))}
    </div>
  );
}

export default function CargandoFinanzas() {
  return (
    <div className="flex flex-col gap-xl" aria-busy="true" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-lg">
        <h1 className="text-display text-foreground">Finanzas</h1>

        {/* El segmentado de 3 botones y los chevrons con su etiqueta. */}
        <div className="flex items-center gap-md">
          <Skeleton className="h-10 w-52 rounded-md" />
          <Skeleton className="h-8 w-72" />
        </div>
      </div>

      {/* El sub-nav: dos enlaces cortos sobre la línea base. */}
      <div className="flex items-stretch gap-xs border-b border-border">
        <Skeleton className="mb-sm h-4 w-20" />
        <Skeleton className="mb-sm h-4 w-16" />
      </div>

      <div className="flex flex-col gap-2xl">
        <div className="grid grid-cols-2 gap-lg lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <CardKPIEsqueleto key={i} />
          ))}
        </div>

        <div className="grid grid-cols-1 items-start gap-2xl lg:grid-cols-2">
          {/* Bloque 2: tres filas de conteo más la línea de cierre. */}
          <BloqueEsqueleto filas={4} alto="h-dia-cabecera" />

          {/* Bloque 3: seis filas de 56px. Seis y no ocho porque lo que da la
              geometría es el alto de fila, y pintar el equipo entero en gris son
              ocho nodos por nada. */}
          <BloqueEsqueleto filas={6} alto="h-fila-aseador" />
        </div>
      </div>

      <span className="sr-only">Cargando las finanzas del periodo</span>
    </div>
  );
}
