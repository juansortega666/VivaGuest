import { Skeleton } from '@/components/ui/skeleton';

/**
 * Carga de `/finanzas/aseos` (07-UI-SPEC §12.2a).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESQUELETO DE GEOMETRIA REAL, NUNCA UN INDICADOR DE ESPERA CENTRADO.
 *
 * El contrato pide literalmente la fila de encabezado de 32px CON LOS ANCHOS DE
 * COLUMNA EXACTOS de §7.1, mas diez filas de 40px. No es adorno: si el gris no
 * tiene la geometria de la tabla, al llegar los datos las columnas se recolocan y
 * el ojo pierde el sitio justo cuando iba a empezar a comparar.
 *
 * Diez filas y no las que vaya a haber: nadie sabe cuantas son antes de la
 * consulta, y diez es lo que llena la primera pantalla.
 *
 * ── ESTE ES EL CASO A, Y NO SE CONFUNDE CON EL CASO B ────────────────────
 *
 * Esto se ve al LLEGAR a la ruta. **Cambiar un filtro es otra cosa** y no pasa
 * por aqui: las filas viejas se quedan visibles y atenuadas mientras llegan las
 * nuevas, porque lo que el admin esta haciendo es comparar. Lo resuelve la barra
 * de filtros con su transicion, no este archivo.
 *
 * El titulo y el enlace de vuelta se pintan con su texto REAL: no dependen de
 * ningun dato, asi que agrisarlos seria fingir que se esta cargando algo que ya
 * esta. El periodo si va en gris, porque sale de la direccion y se formatea
 * abajo.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Los siete anchos de §7.1, en orden. La primera es la flexible. */
const COLUMNAS = [
  'min-w-col-nombre flex-1',
  'w-col-fecha',
  'w-col-fecha',
  'w-col-acargo',
  'w-col-dinero',
  'w-col-dinero',
  'w-col-dinero',
];

export default function CargandoDetalleDeAseos() {
  return (
    <div className="flex flex-col gap-xl" aria-busy="true" aria-live="polite">
      <div className="flex flex-col gap-md">
        <span className="text-micro text-muted-foreground">Volver al resumen</span>

        <div className="flex flex-wrap items-baseline justify-between gap-lg">
          <h1 className="text-display text-foreground">Aseos del periodo</h1>
          <Skeleton className="h-5 w-48" />
        </div>
      </div>

      {/* El sub-nav: dos enlaces cortos sobre la línea base. */}
      <div className="flex items-stretch gap-xs border-b border-border">
        <Skeleton className="mb-sm h-4 w-20" />
        <Skeleton className="mb-sm h-4 w-16" />
      </div>

      <div className="flex flex-col gap-lg">
        {/* La barra de filtros: combinado, desplegable y segmentado de tres. */}
        <div className="flex flex-wrap items-center gap-md">
          <Skeleton className="h-9 w-64 rounded-md" />
          <Skeleton className="h-9 w-col-acargo rounded-md" />
          <Skeleton className="h-11 w-72 rounded-md" />
        </div>

        <div className="w-full">
          {/* La fila de encabezado, 32px, con los siete anchos reales. */}
          <div className="flex h-fila-encabezado items-center gap-md border-b border-border bg-canvas px-md">
            {COLUMNAS.map((ancho, i) => (
              <Skeleton key={i} className={`${ancho} h-3`} />
            ))}
          </div>

          {Array.from({ length: 10 }, (_, fila) => (
            <div
              key={fila}
              className="flex h-fila items-center gap-md border-b border-border px-md last:border-b-0"
            >
              {COLUMNAS.map((ancho, i) => (
                <Skeleton key={i} className={`${ancho} h-4`} />
              ))}
            </div>
          ))}
        </div>
      </div>

      <span className="sr-only">Cargando los aseos del periodo</span>
    </div>
  );
}
