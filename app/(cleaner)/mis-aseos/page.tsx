import type { Metadata } from 'next';

import { cerrarSesion } from '@/app/_actions/sesion';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Mis aseos · VivaGuest',
};

/**
 * `/mis-aseos` — destino de aterrizaje del aseador (PLAT-07, UI-SPEC §12.2).
 *
 * ES UN STUB A PROPOSITO. No lleva, y no se debe anadir aqui: manifest, service
 * worker, banner de instalacion, navegacion inferior, checklist por cuarto,
 * camara ni cola offline. Eso es Fase 5 y Fase 6. Lo unico que esta pantalla
 * tiene que demostrar hoy es que un aseador entra, llega a SU superficie (y no a
 * la del admin) y puede salir.
 */
export default function MisAseosPage() {
  return (
    <>
      <h1 className="text-display text-foreground">Mis aseos</h1>

      <p className="text-body text-muted-foreground">
        Todavía no hay nada aquí. La aplicación del aseador llega en una fase
        siguiente.
      </p>

      {/* Server Action directa en el `action` del form: cerrar sesion no necesita
          ni un gramo de JavaScript de cliente. */}
      <form action={cerrarSesion}>
        <Button type="submit" variant="outline" className="min-h-toque w-full">
          Cerrar sesión
        </Button>
      </form>
    </>
  );
}
