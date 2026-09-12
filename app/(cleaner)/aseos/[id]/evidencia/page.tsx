import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { WizardEvidencia } from '@/app/(cleaner)/_components/WizardEvidencia';
import { Button } from '@/components/ui/button';
import { leerAseoDelAseador } from '@/lib/data/aseo-aseador';
import { armarChecklist } from '@/lib/domain/checklist';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Evidencia · VivaGuest',
};

/**
 * `/aseos/[id]/evidencia` — EL ASISTENTE DE FOTOS (CHECK-03, CHECK-04, D-05).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * RUTA PROPIA, Y NO UN ESTADO DENTRO DE `/aseos/[id]`.
 *
 * La razon es el boton de atras del telefono, que es el control que mas se usa
 * en un movil y el unico que no controlamos. Con el asistente como estado
 * interno del aseo, atras **saca de la pantalla del aseo** a mitad de la
 * evidencia: en la practica, cierra la aplicacion o devuelve al listado. Con una
 * ruta propia, atras hace lo unico que tiene sentido: volver al checklist.
 *
 * Cuesta un archivo y resuelve un gesto que la aseadora va a hacer todos los
 * dias.
 *
 * ── LAS DOS GUARDAS DE ENTRADA, Y POR QUE SON DISTINTAS ───────────────────
 *
 *   · **El aseo no esta en curso** -> redirige a la ficha. No hay evidencia que
 *     recoger de un trabajo que no empezo o que ya se cerro, y aterrizar en un
 *     asistente vacio no le dice eso a nadie. La ficha si: ahi se ve el estado.
 *
 *   · **El aseo es ajeno, no existe o se cancelo** -> el MISMO estado vacio de
 *     la ficha, palabra por palabra. Distinguirlos seria un oraculo de
 *     enumeracion de aseos ajenos, la misma razon por la que el RPC del codigo
 *     lanza un unico `42501` para sus tres denegaciones.
 *
 * Ninguna de las dos es LA frontera. La frontera es la RLS, mas la guarda de
 * pertenencia que cada RPC hace por su cuenta: `skip_room_evidence` y
 * `finish_cleaning` rechazan un aseo ajeno aunque alguien llegue aqui.
 * ════════════════════════════════════════════════════════════════════════════
 */

const VACIO_TITULO = 'Este aseo ya no está disponible.';
const VACIO_CUERPO = 'Puede que lo hayan cancelado o reasignado. Vuelve a Mis aseos.';
const VACIO_CTA = 'Ir a mis aseos';

export default async function EvidenciaDelAseoPage({
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

        <Button className="min-h-toque w-full text-body-movil" render={<Link href="/mis-aseos" />}>
          {VACIO_CTA}
        </Button>
      </div>
    );
  }

  if (aseo.state !== 'en_curso') redirect(`/aseos/${aseo.id}`);

  // El agrupado lo hace la proyeccion pura, igual que en la ficha: el asistente
  // recibe cuartos, no filas sueltas, y no vuelve a ordenar nada por su cuenta.
  const grupos = armarChecklist(aseo.checklist, aseo.skips);

  return <WizardEvidencia aseoId={aseo.id} grupos={grupos} />;
}
