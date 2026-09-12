import type { Metadata } from 'next';
import Link from 'next/link';

import { BarraAccionAseo } from '@/app/(cleaner)/_components/BarraAccionAseo';
import {
  ChecklistPorCuarto,
  ProgresoDelAseo,
} from '@/app/(cleaner)/_components/ChecklistPorCuarto';
import { TarjetaAseo } from '@/app/(cleaner)/_components/TarjetaAseo';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
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
 * ── LA FASE 6 LA AMPLIO: AHORA AQUI SE TRABAJA ────────────────────────────
 *
 * La Fase 5 la dejo de SOLO LECTURA a proposito, con un pie que le prometia al
 * aseador que marcar el aseo y subir fotos llegaban despues. Esta fase cumple esa
 * promesa, asi que **el pie se retiro**: era el compromiso, y mantenerlo con el
 * checklist justo debajo lo convertiria en la unica afirmacion falsa de la
 * pantalla. La razon larga esta en `TarjetaAseo.tsx`, que es de donde salio.
 *
 * ── EL ORDEN VERTICAL, Y NO ES ARBITRARIO (§7.1) ──────────────────────────
 *
 *   1. la ficha de la Fase 5, con el codigo de acceso: es lo que el aseador vino
 *      a buscar cuando toco el aviso, de pie frente a una puerta cerrada
 *   2. un separador
 *   3. el checklist por cuarto
 *   4. la barra de accion, FIJA y fuera del flujo de lectura
 *
 * El codigo va arriba y el trabajo abajo porque ese es el orden real: primero se
 * entra, despues se limpia.
 *
 * ── LO QUE TODAVIA NO ESTA, Y DE QUE PLAN ES ──────────────────────────────
 *
 * El asistente de evidencia con la camara (plan 06-08) y el paso de reporte
 * (06-09). Hasta entonces la barra termina el aseo directamente; la costura
 * exacta esta marcada en `BarraAccionAseo.tsx`.
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

  /**
   * EL CHECKLIST SE MARCA SOLO CON EL ASEO EN CURSO.
   *
   * Los otros dos estados se llega a ellos DE VERDAD, tocando un aviso viejo, y
   * hasta esta fase no estaban definidos en ningun sitio:
   *
   *   · `pendiente`  -> el checklist se ve, no se marca, y la barra dice
   *     `Comenzar aseo`. Ver el checklist antes de empezar no es un adorno: es
   *     como la aseadora sabe cuanto trabajo hay y si le alcanza el tiempo.
   *   · `completada` -> el checklist se ve, no se marca, y NO HAY BARRA. No hay
   *     ninguna accion que ofrecer sobre un aseo terminado, y un boton que no
   *     lleva a nada es peor que la ausencia del boton.
   */
  const enCurso = aseo.state === 'en_curso';
  const terminado = aseo.state === 'completada';

  return (
    <ProgresoDelAseo filas={aseo.checklist} skips={aseo.skips} soloLectura={!enCurso}>
      {/*
        EL RELLENO INFERIOR RESERVA EL ALTO DE LA BARRA (§7.4). Sin esto la
        ultima tarea del checklist queda debajo de una barra opaca y literalmente
        nadie la ve: no es que se lea mal, es que no existe en pantalla.
      */}
      <div className={terminado ? 'flex flex-col gap-lg' : 'flex flex-col gap-lg pb-barra-aseo'}>
        <TarjetaAseo aseo={aseo} />

        <Separator />

        <ChecklistPorCuarto />
      </div>

      {!terminado && <BarraAccionAseo aseoId={aseo.id} modo={enCurso ? 'terminar' : 'comenzar'} />}
    </ProgresoDelAseo>
  );
}
