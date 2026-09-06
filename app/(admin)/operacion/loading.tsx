import { Skeleton } from '@/components/ui/skeleton';

/**
 * Carga de `/operacion` (04-UI-SPEC.md §15.2, heredando §9.3 de la Fase 2).
 *
 * ESQUELETO GEOMETRICO, NUNCA UN SPINNER CENTRADO. La razon no es estetica: un
 * spinner ocupa un punto y esta pantalla ocupa dos carriles enteros, asi que al
 * resolverse el contenido salta y el ojo pierde el sitio. Aqui se reproducen las
 * medidas reales —los dos carriles, la franja de chips de 32px, la cabecera de
 * dia de 48px, las filas de 40px con los anchos de columna de §7.1 y las dos
 * cards del lateral— para que la unica diferencia al llegar los datos sea que el
 * gris se convierte en texto.
 */

/** Los mismos anchos que `FilaAseo`, en el mismo orden que §7.1. Suman 532px fijos. */
const COLUMNAS = [
  'w-col-estado-aseo',
  'min-w-col-nombre flex-1',
  'w-col-hora',
  'w-col-acargo',
  'w-col-huespedes',
  'w-col-menu',
] as const;

/** Cabecera de dia de 48px mas su tabla. Se repite para los tres bloques. */
function BloqueDiaEsqueleto({ filas }: { filas: number }) {
  return (
    <div className="rounded-md border border-border bg-background">
      <div className="flex h-dia-cabecera items-center gap-md border-b border-border bg-canvas px-md">
        <Skeleton className="size-4 shrink-0" />
        <Skeleton className="h-4 w-56" />
        <Skeleton className="ml-auto h-3 w-32" />
      </div>

      {filas > 0 && (
        <>
          <div className="flex h-fila-encabezado items-center gap-md border-b border-border bg-canvas px-md">
            {COLUMNAS.map((ancho, i) => (
              <Skeleton key={i} className={`h-3 ${ancho}`} />
            ))}
          </div>

          {Array.from({ length: filas }, (_, i) => (
            <div
              key={i}
              className="flex h-fila items-center gap-md border-b border-border px-md last:border-b-0"
            >
              {COLUMNAS.map((ancho, j) => (
                <Skeleton key={j} className={`h-4 ${ancho}`} />
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/** Card del carril lateral: cabecera de 40px mas N filas del alto que toque. */
function CardLateralEsqueleto({
  filas,
  alto,
  cta = false,
}: {
  filas: number;
  alto: string;
  /** La bandeja lleva su CTA primario de 36px pegado bajo la cabecera (§9). */
  cta?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-background">
      <div className="flex h-fila items-center justify-between gap-md border-b border-border px-md">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-8" />
      </div>

      {cta && (
        <div className="border-b border-border p-md">
          <Skeleton className="h-9 w-full" />
        </div>
      )}

      {Array.from({ length: filas }, (_, i) => (
        <div
          key={i}
          className={`flex ${alto} items-center justify-between gap-md border-b border-border px-md last:border-b-0`}
        >
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-3 w-12 shrink-0" />
        </div>
      ))}
    </div>
  );
}

export default function CargandoOperacion() {
  return (
    <div className="flex flex-col gap-xl" aria-busy="true" aria-live="polite">
      <div className="flex items-center justify-between gap-lg">
        <h1 className="text-display text-foreground">Operación</h1>
        <Skeleton className="h-8 w-32" />
      </div>

      <div className="grid grid-cols-1 gap-2xl xl:grid-cols-[minmax(0,1fr)_var(--container-rail)]">
        <div className="flex min-w-0 flex-col gap-lg">
          {/* Franja de carga: rotulo mas cuatro chips de 32px (§8.2). */}
          <div className="flex flex-wrap items-center gap-sm">
            <Skeleton className="mr-md h-3 w-24" />
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-chip w-28 rounded-md" />
            ))}
          </div>

          {/* Hoy nace expandido; Manana y Siguientes, colapsados (§8.1), asi que
              solo el primero pinta filas. Ocho y no treinta: llenan el alto
              visible y dan la geometria; pintar treinta esqueletos son treinta
              nodos por nada. */}
          <BloqueDiaEsqueleto filas={8} />
          <BloqueDiaEsqueleto filas={0} />
          <BloqueDiaEsqueleto filas={0} />
        </div>

        <aside
          aria-label="Pendientes y alertas"
          className="flex flex-col gap-lg max-xl:order-first"
        >
          {/* Bandeja: cabecera, CTA de ancho completo y cinco filas de 40px. */}
          <CardLateralEsqueleto filas={5} alto="h-fila" cta />

          {/* Panel de alertas: cuatro filas de 64px (§11.3). */}
          <CardLateralEsqueleto filas={4} alto="h-fila-alerta" />
        </aside>
      </div>

      <span className="sr-only">Cargando la operación del día</span>
    </div>
  );
}
