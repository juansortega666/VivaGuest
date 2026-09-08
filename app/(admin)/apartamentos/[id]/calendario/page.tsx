import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { leerApartamento } from '@/lib/data/apartamentos';
import { leerFeedDeApartamento } from '@/lib/data/feeds';
import { enmascararUrlIcal } from '@/lib/domain/ical-url.schema';
import { createClient } from '@/lib/supabase/server';

import { leerSecretos } from '../../_actions';
import { ConectarCalendario } from './_components/ConectarCalendario';
import { GuiaAirbnb } from './_components/GuiaAirbnb';

export const metadata: Metadata = {
  title: 'Conectar calendario · VivaGuest',
};

/**
 * `runtime = 'nodejs'` es DOCUMENTACIÓN EJECUTABLE, no una necesidad de hoy.
 *
 * Next 15 ya usa Node por defecto en el App Router, así que esta línea no cambia
 * nada ahora mismo. Está escrita porque la Fase 3 va a traer `node-ical` a esta
 * misma ruta, y `node-ical` no funciona en Edge: sin la declaración, alguien
 * podría mover el segmento a Edge por rendimiento y descubrir el problema en el
 * deploy que menos conviene.
 */
export const runtime = 'nodejs';

/**
 * `maxDuration` DE VERDAD: es la configuración de segmento de la ROUTE, y es la
 * que la plataforma lee. `_actions.ts` lleva una copia junto al `fetch` que la
 * motiva, pero los archivos con `_` delante no son rutas y la suya no aplica.
 *
 * 20 s contra los 10 s del `AbortSignal.timeout`: el margen existe para que un
 * feed lento falle por el timeout CONTROLADO —con su copy de UI-SPEC §10.3— y
 * no por el corte de la plataforma, que no produce ningún mensaje. Vercel Hobby
 * permite 60 s por función, así que cabe de sobra.
 */
export const maxDuration = 20;

/**
 * `/apartamentos/[id]/calendario` — APTO-03 y APTO-12 (UI-SPEC §10).
 *
 * Dos columnas a partir de 1024px: la guía a la izquierda, el campo y el
 * resultado a la derecha. **La guía no es el requisito; la validación en vivo
 * sí**, y por eso la columna derecha es la que no se recorta nunca.
 *
 * ── POR QUÉ LA URL NO BAJA ENTERA A ESTA PÁGINA ─────────────────────────────
 * `leerSecretos` devuelve la URL completa, pero lo único que cruza a un
 * componente cliente es su forma ENMASCARADA. Lo que se pasa como prop a un
 * Client Component viaja en la carga de React y queda en el DOM, así que una
 * URL "escondida detrás de un useState" estaría de todos modos en el HTML. Para
 * verla hay una action explícita (`revelarUrlIcal`) detrás del botón `Mostrar`,
 * y `e2e/calendario.spec.ts` comprueba que el `?s=` no está en el documento
 * antes de pulsarlo (T-02-74).
 *
 * `leerApartamento` devuelve `null` tanto si el id no existe como si la RLS no
 * lo deja ver, y los dos casos dan el mismo 404 a propósito.
 */
export default async function CalendarioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const apartamento = await leerApartamento(supabase, id);
  if (!apartamento) notFound();

  // `calendar_feeds` SÍ es legible con el JWT del admin; `property_secrets` no,
  // y por eso una lectura va por la capa de datos y la otra por una action con
  // su propio guard y el cliente administrativo.
  const [feed, secretos] = await Promise.all([
    leerFeedDeApartamento(supabase, id),
    leerSecretos(id),
  ]);

  const urlEnmascarada = secretos?.ical_url ? enmascararUrlIcal(secretos.ical_url) : null;

  return (
    <div className="flex flex-col gap-xl">
      <div className="flex items-center gap-md">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Volver al apartamento"
          render={
            <Link href={`/apartamentos/${id}`}>
              <ArrowLeft aria-hidden="true" />
            </Link>
          }
        />
        <h1 className="text-display text-foreground">
          Calendario de {apartamento.propiedad.nombre}
        </h1>
      </div>

      <div className="grid grid-cols-1 gap-2xl lg:grid-cols-2">
        <GuiaAirbnb />

        <ConectarCalendario propertyId={id} urlEnmascarada={urlEnmascarada} feed={feed} />
      </div>
    </div>
  );
}
