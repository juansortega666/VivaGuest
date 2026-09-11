import type { Metadata } from 'next';
import Link from 'next/link';

import { TarjetaAseo } from '@/app/(cleaner)/_components/TarjetaAseo';
import { Button } from '@/components/ui/button';
import { leerAseoDelAseador } from '@/lib/data/aseo-aseador';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Aseo · VivaGuest',
};

/**
 * `/aseos/[id]` — LA PANTALLA A LA QUE ATERRIZA EL AVISO (NOTIF-01, criterio 2
 * del ROADMAP, 05-UI-SPEC §9).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUE ESTA RUTA ESTA EN LA FASE 5 Y NO EN LA 6.
 *
 * `notifications.url` vale `'/aseos/' || cleaning_id` DESDE LA MIGRACION 09, y
 * hasta este plan esa ruta no existia. O sea que toda notificacion push del
 * aseador aterrizaba en un 404, y el criterio 2 del ROADMAP —"al tocarla
 * aterriza en ese aseo, donde revela el codigo de acceso"— no se podia cumplir
 * por mucho que el envio funcionara. No estaba en el alcance original; el
 * contrato de UI la metio en la fase justamente por esto.
 *
 * ── EL ALCANCE ES DE SOLO LECTURA, MAS EL CODIGO ──────────────────────────
 *
 * Lo que esta pantalla NO lleva, y que es trabajo de la Fase 6: el checklist por
 * cuarto, la camara, las fotos, la cola de mutaciones sin conexion y los tres
 * botones con los que el aseador mueve el estado del aseo (`Empecé`, `Terminé`
 * y `No puedo`). `05-CONTEXT.md` lo fija literal: *"esta fase entrega el
 * envoltorio instalable, el service worker, el permiso y la pantalla a la que
 * aterriza la notificacion, no el trabajo que se hace dentro"*.
 *
 * Esto queda escrito aqui para que nadie los anada "ya que estamos": el copy del
 * pie de la ficha ES el compromiso con el aseador de que llegan, y anadir medio
 * flujo seria peor que no tener ninguno.
 *
 * ── EL ESTADO VACIO ES EL MISMO PARA LOS CASOS QUE NO SE DEBEN DISTINGUIR ──
 *
 * `leerAseoDelAseador()` devuelve `null` tanto si el identificador no existe,
 * como si el aseo es de otra persona, como si se cancelo, como si el
 * identificador ni siquiera tiene forma de identificador. La pantalla los pinta
 * igual A PROPOSITO: distinguirlos seria un oraculo de enumeracion de aseos
 * ajenos, la misma razon por la que el RPC del codigo lanza un unico `42501`
 * para sus tres denegaciones.
 *
 * Y no es `notFound()`: un 404 del framework es una pantalla del sistema, en
 * ingles de plantilla, sin salida y sin explicacion. Aqui hay algo concreto que
 * decirle al aseador —que probablemente lo cancelaron o lo reasignaron— y un
 * sitio concreto a donde mandarlo.
 *
 * ── LA AUTORIZACION NO ESTA AQUI ──────────────────────────────────────────
 *
 * El arbol ya pasa por el guard de sesion del layout, y la frontera de verdad es
 * la RLS: `cleanings_cleaner_select` acota la consulta a los aseos de quien
 * pregunta. Esta pagina no comprueba nada por su cuenta, que es lo correcto.
 * ════════════════════════════════════════════════════════════════════════════
 */

const VACIO_TITULO = 'Este aseo ya no está disponible.';
const VACIO_CUERPO = 'Puede que lo hayan cancelado o reasignado. Vuelve a Mis aseos.';
const VACIO_CTA = 'Ir a mis aseos';

export default async function AseoDelAseadorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const aseo = await leerAseoDelAseador(supabase, id);

  if (aseo === null) {
    return (
      <div className="flex flex-col gap-lg">
        <h1 className="text-display-movil text-foreground">{VACIO_TITULO}</h1>
        <p className="text-body-movil text-muted-foreground">{VACIO_CUERPO}</p>

        <Button
          // 44px, el piso de todo control de este arbol (§16.1).
          className="min-h-toque w-full text-body-movil"
          render={<Link href="/mis-aseos" />}
        >
          {VACIO_CTA}
        </Button>
      </div>
    );
  }

  return <TarjetaAseo aseo={aseo} />;
}
