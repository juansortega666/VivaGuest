'use client';

import { pedirSubidaDeFoto } from '@/app/(cleaner)/aseos/[id]/_actions';
import type { FotoComprimida } from '@/lib/fotos/comprimir';
import { BUCKET_EVIDENCIA, type TipoDeEvidencia } from '@/lib/fotos/nombres';
import { createClient } from '@/lib/supabase/browser';

/**
 * Los dos pasos del medio de la cadena de la foto: pedir la ruta y subirla.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUE ESTO ES UN MODULO Y NO ESTA DENTRO DE UN COMPONENTE.
 *
 * Lo usan DOS pantallas —la foto del cuarto y la del daño o el recibo— y el
 * paso que comparten es exactamente el que no se puede equivocar: **la ruta la
 * decide el servidor**. En un bucket privado el nombre del archivo es una
 * autorizacion, asi que quien puede elegirlo puede escribir encima de la
 * evidencia de otro aseo. Dos copias de este cableado son dos sitios donde
 * alguien puede "simplificar" mandando la ruta desde el cliente.
 *
 * ── LO QUE DELIBERADAMENTE NO HACE ─────────────────────────────────────────
 *
 * **No comprime.** La compresion se queda en el llamador, y no por comodidad:
 * la pantalla necesita el blob comprimido ANTES de que empiece la subida, para
 * mostrar la previsualizacion mientras se espera. Metiendola aqui, la aseadora
 * miraria un rectangulo vacio durante toda la subida.
 *
 * **No registra la fila.** Cada llamador cuelga la foto de algo distinto —una
 * tarea, un daño, un gasto— y la union de `VinculoDeFoto` impide que quede
 * colgada de dos a la vez. Meter el registro aqui obligaria a pasarle esa union
 * y no ganaria nada.
 * ════════════════════════════════════════════════════════════════════════════
 */

export type ResultadoDeSubida =
  | { ok: true; ruta: string }
  | { ok: false };

export async function subirAlBucket(
  aseoId: string,
  tipo: TipoDeEvidencia,
  foto: FotoComprimida,
): Promise<ResultadoDeSubida> {
  // El cliente manda el aseo y el tipo. NO propone nombre de archivo.
  const pedido = new FormData();
  pedido.set('aseo', aseoId);
  pedido.set('tipo', tipo);

  const permiso = await pedirSubidaDeFoto(null, pedido);
  if (!permiso.ok) return { ok: false };

  const supabase = createClient();
  const { error } = await supabase.storage
    .from(BUCKET_EVIDENCIA)
    .uploadToSignedUrl(permiso.ruta, permiso.token, foto.blob, {
      contentType: foto.mimeType,
    });

  if (error) return { ok: false };

  return { ok: true, ruta: permiso.ruta };
}
