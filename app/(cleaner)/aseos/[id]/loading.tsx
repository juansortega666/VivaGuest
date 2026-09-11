import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Carga de `/aseos/[id]` (05-UI-SPEC §15.2).
 *
 * ESQUELETO CON LA FORMA EXACTA DE LA CARD, NUNCA UN SPINNER A PANTALLA
 * COMPLETA. La razon no es estetica: un spinner ocupa un punto y no dice nada
 * sobre lo que va a aparecer, asi que al resolverse el contenido salta y el ojo
 * tiene que volver a buscar. Aqui se reproducen las medidas reales —el titulo, el
 * cluster, las tres filas de pares de 44px y el bloque del boton de 56px— para
 * que la unica diferencia al llegar los datos sea que el gris se convierte en
 * texto.
 *
 * Importa: esta pantalla la abre alguien DE PIE FRENTE A UNA PUERTA, tocando un
 * aviso. Medio segundo de incertidumbre sobre si la app hizo algo es lo que
 * produce el segundo toque.
 */
export default function CargandoAseo() {
  return (
    <Card className="gap-lg bg-background p-lg" aria-busy="true" aria-live="polite">
      {/* Cabecera: nombre del apartamento, cluster y el badge de estado. */}
      <div className="flex items-start justify-between gap-lg">
        <div className="flex min-w-0 flex-col gap-xs">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-5 w-24 shrink-0" />
      </div>

      {/* Las tres filas de pares, a su alto real de 44px. */}
      <div className="flex flex-col">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex min-h-toque items-center justify-between gap-lg">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-28" />
          </div>
        ))}
      </div>

      {/*
        El bloque del boton: 56px de accion primaria mas la linea de aviso de
        auditoria que va debajo. No se pinta esqueleto de instrucciones porque esa
        seccion puede no existir, y prometer un bloque que luego no aparece es el
        mismo salto que el esqueleto existe para evitar.
      */}
      <div className="flex flex-col gap-sm">
        <Skeleton className="h-toque-comodo w-full rounded-lg" />
        <Skeleton className="h-4 w-56" />
      </div>

      <span className="sr-only">Cargando el aseo</span>
    </Card>
  );
}
