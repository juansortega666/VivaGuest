import { Skeleton } from '@/components/ui/skeleton';

/**
 * Carga de `/aseadores` (UI-SPEC §9.3).
 *
 * Skeleton GEOMETRICO, nunca un spinner centrado: el spinner ocupa un punto y la
 * tabla ocupa la pantalla entera, asi que al resolverse el contenido salta. Este
 * esqueleto reproduce las medidas reales (encabezado de 32px, filas de 40px y los
 * mismos anchos de columna), asi que la unica diferencia al llegar los datos es
 * que el gris se convierte en texto.
 */

/** Los mismos anchos que `TablaAseadores`, en el mismo orden. */
const COLUMNAS = [
  'w-col-estado',
  'min-w-col-nombre flex-1',
  'w-col-telefono',
  'w-col-responsable',
  'w-col-suplente',
  'w-col-menu',
] as const;

export default function CargandoAseadores() {
  return (
    <div className="flex flex-col gap-xl" aria-busy="true" aria-live="polite">
      <div className="flex items-center justify-between gap-lg">
        <h1 className="text-display text-foreground">Aseadores</h1>
        <Skeleton className="h-9 w-32" />
      </div>

      <div className="overflow-hidden rounded-md border border-border bg-background">
        <div className="flex h-fila-encabezado items-center gap-md border-b border-border bg-canvas px-md">
          {COLUMNAS.map((ancho) => (
            <Skeleton key={ancho} className={`h-3 ${ancho}`} />
          ))}
        </div>

        {/* Ocho filas: el orden de magnitud real del equipo de aseo. Pintar
            diez o veinte prometeria una lista mas larga de la que va a llegar. */}
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className="flex h-fila items-center gap-md border-b border-border px-md last:border-b-0"
          >
            {COLUMNAS.map((ancho) => (
              <Skeleton key={ancho} className={`h-4 ${ancho}`} />
            ))}
          </div>
        ))}
      </div>

      <span className="sr-only">Cargando aseadores</span>
    </div>
  );
}
