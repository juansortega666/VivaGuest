import { Skeleton } from '@/components/ui/skeleton';

/**
 * Carga de `/apartamentos` (UI-SPEC §9.3).
 *
 * SKELETON GEOMETRICO, NUNCA UN SPINNER CENTRADO. La razon no es estetica: un
 * spinner ocupa un punto de la pantalla y la tabla ocupa la pantalla entera, asi
 * que al resolverse el contenido salta y el ojo pierde el sitio. Este esqueleto
 * reproduce las medidas reales —encabezado de 32px, filas de 40px y los mismos
 * anchos de columna de §7.1—, asi que la unica diferencia al llegar los datos es
 * que el gris se convierte en texto.
 *
 * Diez filas y no 39: son suficientes para llenar el alto visible y dar la
 * geometria correcta. Pintar 39 esqueletos cuesta 39 nodos por nada.
 */

/** Los mismos anchos que `TablaApartamentos`, en el mismo orden que §7.1. */
const COLUMNAS = [
  'w-col-estado-apto',
  'min-w-col-nombre flex-1',
  'w-col-cluster',
  'w-col-dinero',
  'w-col-dinero',
  'w-col-responsable-apto',
  'w-col-calendario',
  'w-col-menu',
] as const;

export default function CargandoApartamentos() {
  return (
    <div className="flex flex-col gap-xl" aria-busy="true" aria-live="polite">
      <div className="flex items-center justify-between gap-lg">
        <h1 className="text-display text-foreground">Apartamentos</h1>
        <Skeleton className="h-8 w-40" />
      </div>

      <div className="flex flex-col gap-lg">
        {/* Banner de montaje: card sobre `--canvas`, con su barra de progreso. */}
        <div className="flex flex-col gap-sm rounded-md bg-canvas p-lg">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-64" />
          <Skeleton className="h-1 w-full" />
        </div>

        {/* Toolbar: buscador de 320px y filtro de cluster de 200px. */}
        <div className="flex items-center gap-md">
          <Skeleton className="h-8 w-buscador" />
          <Skeleton className="h-8 w-filtro-cluster" />
        </div>

        <div className="rounded-md border border-border bg-background">
          <div className="flex h-fila-encabezado items-center gap-md border-b border-border bg-canvas px-md">
            {COLUMNAS.map((ancho, i) => (
              <Skeleton key={i} className={`h-3 ${ancho}`} />
            ))}
          </div>

          {Array.from({ length: 10 }, (_, i) => (
            <div
              key={i}
              className="flex h-fila items-center gap-md border-b border-border px-md last:border-b-0"
            >
              {COLUMNAS.map((ancho, j) => (
                <Skeleton key={j} className={`h-4 ${ancho}`} />
              ))}
            </div>
          ))}
        </div>
      </div>

      <span className="sr-only">Cargando apartamentos</span>
    </div>
  );
}
