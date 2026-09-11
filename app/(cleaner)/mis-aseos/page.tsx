import type { Metadata } from 'next';

import { cerrarSesion } from '@/app/_actions/sesion';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Mis aseos · VivaGuest',
};

/**
 * `/mis-aseos` — destino de aterrizaje del aseador (PLAT-07, UI-SPEC §12.2).
 *
 * SIGUE SIENDO UN STUB. No lleva, y no se debe anadir aqui: navegacion inferior,
 * checklist por cuarto, camara ni cola offline. Eso es Fase 6. Lo unico que esta
 * pantalla tiene que demostrar hoy es que un aseador entra, llega a SU
 * superficie (y no a la del admin) y puede salir.
 *
 * EL COPY DEL VACIO CAMBIO EN LA FASE 5 (§15.1), y no es cosmetico: el texto
 * viejo aplazaba la aplicacion del aseador a mas adelante, y a partir de esta
 * fase **el aviso si llega al telefono**. Dejarlo seria la unica mentira de la
 * pantalla. La frase que decia no se reproduce aqui: el criterio que vigila el
 * cambio es un grep sin filtro de comentarios.
 *
 * La escala tipografica es la movil de `05-UI-SPEC` §3.1, con sufijo, igual que
 * todo lo que viva bajo este arbol.
 */
export default function MisAseosPage() {
  return (
    <>
      <h1 className="text-display-movil text-foreground">Mis aseos</h1>

      <div className="flex flex-col gap-sm">
        <p className="text-body-movil text-foreground">Todavía no tienes aseos asignados.</p>
        <p className="text-body-movil text-muted-foreground">
          Cuando te asignen uno, te va a llegar un aviso al teléfono.
        </p>
      </div>

      {/* Server Action directa en el `action` del form: cerrar sesion no necesita
          ni un gramo de JavaScript de cliente. */}
      <form action={cerrarSesion}>
        <Button type="submit" variant="outline" className="min-h-toque w-full text-body-movil">
          Cerrar sesión
        </Button>
      </form>
    </>
  );
}
