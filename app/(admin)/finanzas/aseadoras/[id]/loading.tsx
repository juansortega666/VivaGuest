import { Skeleton } from '@/components/ui/skeleton';

/**
 * Carga de `/finanzas/aseadoras/[id]` (07-UI-SPEC §12.2a).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * LA GEOMETRIA REAL DE LA CABECERA Y DE LOS CUATRO BLOQUES.
 *
 * El circulo de 28px, el nombre a display con su linea de apoyo, el total a la
 * derecha con su leyenda, y despues la rejilla de cuatro bloques en su orden. La
 * unica diferencia al llegar los datos tiene que ser que el gris se convierte en
 * texto: si el esqueleto no reproduce la rejilla, los cuatro bloques se recolocan
 * de golpe y el ojo pierde el sitio.
 *
 * **Prohibido el indicador de espera centrado.** En un layout de cuatro cards
 * ocupa un punto, y al resolverse el contenido salta.
 *
 * El enlace de vuelta se pinta con su texto REAL: no depende de ningun dato.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Un bloque: cabecera de 40px más N filas del alto que toque. */
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

export default function CargandoFichaDeAseadora() {
  return (
    <div className="flex flex-col gap-xl" aria-busy="true" aria-live="polite">
      <div className="flex flex-col gap-md">
        <span className="text-micro text-muted-foreground">Volver al resumen</span>

        <div className="flex flex-wrap items-center justify-between gap-lg">
          <div className="flex items-center gap-sm">
            <Skeleton className="size-avatar shrink-0 rounded-full" />
            <div className="flex flex-col gap-xs">
              <Skeleton className="h-6 w-56" />
              <Skeleton className="h-3 w-40" />
            </div>
          </div>

          <div className="flex flex-col items-end gap-xs">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-3 w-40" />
          </div>
        </div>
      </div>

      {/* El sub-nav: dos enlaces cortos sobre la línea base. */}
      <div className="flex items-stretch gap-xs border-b border-border">
        <Skeleton className="mb-sm h-4 w-20" />
        <Skeleton className="mb-sm h-4 w-16" />
      </div>

      <div className="grid grid-cols-1 items-start gap-2xl lg:grid-cols-2">
        {/* 1. Ahora mismo: una frase, la etiqueta de estado y el fechado. */}
        <BloqueEsqueleto filas={2} alto="h-fila" />

        {/* 2. Sus aseos: encabezado de tabla más cinco filas de 40px. Cinco y no
            diez porque este bloque comparte rejilla con otros tres, y diez nodos
            en gris por cada uno son cuarenta por nada. */}
        <BloqueEsqueleto filas={5} alto="h-fila" />

        {/* 3. Sus pagos: dos periodos cerrados es lo normal en el primer año. */}
        <BloqueEsqueleto filas={3} alto="h-fila-aseador" />

        {/* 4. Sus gastos: fila con concepto, monto y el botón del recibo. */}
        <BloqueEsqueleto filas={3} alto="h-fila-aseador" />
      </div>

      <span className="sr-only">Cargando la ficha de la aseadora</span>
    </div>
  );
}
