import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import {
  listarApartamentos,
  listarAseadoresActivos,
  listarClusters,
} from '@/lib/data/apartamentos';
import { createClient } from '@/lib/supabase/server';

import { FormularioApartamento } from '../_components/FormularioApartamento';

export const metadata: Metadata = {
  title: 'Nuevo apartamento · VivaGuest',
};

/**
 * `/apartamentos/nuevo` — el alta (APTO-01, UI-SPEC §8).
 *
 * RSC que solo carga las dos listas que el formulario necesita para pintar sus
 * selectores y monta el formulario vacío. Toda la escritura pasa por
 * `guardarApartamento`, que trae su propio `exigirAdmin()`: que esta página viva
 * bajo el route group `(admin)` no autoriza nada.
 *
 * ── AQUI NO SE LLAMA A `leerSecretos`, Y NO ES UN OLVIDO ────────────────────
 * Un apartamento que todavía no existe no tiene fila en `property_secrets` que
 * leer, y esa función devuelve el código de una cerradura. Llamarla con un id
 * inventado sería pedirle a una función privilegiada que confirme si ese id
 * existe. La sección 4 arranca vacía, con `inteligente` como tipo por defecto,
 * que es el mismo default de la columna.
 */
export default async function NuevoApartamentoPage() {
  const supabase = await createClient();

  // Los clusters salen de las filas YA cargadas: `listarClusters` es pura y
  // `properties.cluster` es `text not null` sin ninguna tabla que consultar.
  const [filas, aseadores] = await Promise.all([
    listarApartamentos(supabase),
    listarAseadoresActivos(supabase),
  ]);

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
        <h1 className="text-display text-foreground">Nuevo apartamento</h1>
      </div>

      <FormularioApartamento clusters={listarClusters(filas)} aseadores={aseadores} />
    </div>
  );
}
