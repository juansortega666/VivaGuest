import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Button } from '@/components/ui/button';
import {
  leerApartamento,
  listarApartamentos,
  listarAseadoresActivos,
  listarClusters,
  listarTiposDeCuarto,
} from '@/lib/data/apartamentos';
import { createClient } from '@/lib/supabase/server';

import { leerSecretos } from '../_actions';
import { EstadoApartamento } from '../_components/EstadoApartamento';
import { FormularioApartamento } from '../_components/FormularioApartamento';

export const metadata: Metadata = {
  title: 'Editar apartamento · VivaGuest',
};

/**
 * `/apartamentos/[id]` — la edición (APTO-01 a APTO-10, UI-SPEC §8).
 *
 * ── POR QUE LOS SECRETOS SE PIDEN CON UNA SERVER ACTION Y NO CON UNA LECTURA ─
 * `property_secrets` NO tiene grant de tabla para `authenticated`. Medido en el
 * plan 02-10: un `select` sobre ella devuelve `42501 permission denied` incluso
 * con el JWT de un admin, y también por embed de PostgREST desde `properties`.
 * No es la RLS: la policy `secrets_admin_all` existe y es inalcanzable, porque
 * el grant se evalúa antes.
 *
 * Así que la única ruta para mostrar el código guardado en la sección 4 es
 * `leerSecretos`, que construye el cliente administrativo DESPUES de su propio
 * `exigirAdmin()`. `lib/data/apartamentos.ts` ni siquiera nombra esas columnas, y
 * hay un guardarraíl de CI que lo impone. Sin esta llamada el campo saldría
 * vacío en cada edición y el primer guardado borraría el código.
 *
 * `leerApartamento` devuelve `null` tanto si el id no existe como si la RLS no
 * lo deja ver, y aquí los dos casos dan el mismo 404 a propósito: distinguirlos
 * confirmaría la existencia del apartamento a quien no puede verlo.
 */
export default async function EditarApartamentoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const apartamento = await leerApartamento(supabase, id);
  if (!apartamento) notFound();

  const [filas, aseadores, tipos, secretos] = await Promise.all([
    listarApartamentos(supabase),
    listarAseadoresActivos(supabase),
    listarTiposDeCuarto(supabase),
    leerSecretos(id),
  ]);

  // `leerApartamento` ya trajo las dos colecciones de la sección 5. Los cuartos
  // vienen solo ACTIVOS y los faltantes vienen TODOS: los dos criterios son
  // distintos a propósito y la razón está en el propio `lib/data/apartamentos.ts`.
  const { propiedad, cuartos, faltantes } = apartamento;

  return (
    <div className="flex flex-col gap-xl">
      <div className="flex items-center gap-md">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Volver a apartamentos"
          render={
            <Link href="/apartamentos">
              <ArrowLeft aria-hidden="true" />
            </Link>
          }
        />
        <h1 className="text-display text-foreground">{propiedad.nombre}</h1>
        {/* El estado sale de la MISMA derivación que la tabla
            (`estadoDeApartamento`), no de un `if` sobre `is_active`: un detalle
            que dijera `Inactiva` mientras la fila de la lista dice `Incompleta`
            es peor que no mostrar nada. */}
        <EstadoApartamento fila={propiedad} />
      </div>

      <FormularioApartamento
        clusters={listarClusters(filas)}
        aseadores={aseadores}
        tipos={tipos}
        fila={propiedad}
        secretosGuardados={secretos}
        cuartosGuardados={cuartos}
        faltantesGuardados={faltantes}
      />
    </div>
  );
}
