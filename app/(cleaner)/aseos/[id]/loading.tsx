import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
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
 *
 * ── LA FASE 6 LE AÑADIO LA FORMA DEL CHECKLIST ─────────────────────────────
 *
 * Cuatro cabeceras de cuarto de 56px y la barra fija abajo. El numero de cuartos
 * real se sabra al llegar los datos —son los de ESE apartamento, no un catalogo
 * fijo— asi que cuatro es una apuesta, no una promesa: es la mediana de los 34
 * apartamentos gestionados. Prometer doce filas y traer tres seria el mismo salto
 * visual que este esqueleto existe para evitar.
 *
 * La barra SI se dibuja, y a su sitio exacto: es lo unico de la pantalla que no
 * se mueve nunca, y verla desde el primer frame es lo que le dice a la aseadora
 * que hay una salida antes de saber que hay dentro.
 */
function CargandoAseo() {
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

/** Una cabecera de cuarto del acordeon, a su alto real. */
function CabeceraDeCuarto() {
  return (
    <div className="flex min-h-cabecera-cuarto items-center justify-between gap-md border-b border-border">
      <div className="flex items-center gap-xs">
        <Skeleton className="size-5 rounded-md" />
        <Skeleton className="h-5 w-32" />
      </div>
      <Skeleton className="h-4 w-8" />
    </div>
  );
}

export default function CargandoLaPantallaDelAseo() {
  return (
    <>
      <div className="flex flex-col gap-lg pb-barra-aseo">
        <CargandoAseo />

        <Separator />

        <section className="flex flex-col gap-md">
          <div className="flex items-center justify-between gap-md">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-4 w-16" />
          </div>
          <Skeleton className="h-1 w-full rounded-full" />

          <div className="flex flex-col">
            {[0, 1, 2, 3].map((i) => (
              <CabeceraDeCuarto key={i} />
            ))}
          </div>
        </section>
      </div>

      {/*
        La barra, a su sitio exacto y con su area segura, igual que la de verdad.
        Un esqueleto que la dibuja 20px mas arriba produce el salto que todo esto
        existe para evitar.
      */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex min-h-barra-aseo items-center border-t border-border bg-background px-lg pt-sm pb-[calc(var(--spacing-sm)+env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full max-w-aseador">
          <Skeleton className="h-toque-comodo w-full rounded-lg" />
        </div>
      </div>
    </>
  );
}
