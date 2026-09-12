import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';
import { BUCKET_EVIDENCIA, rutaDeEvidencia, type TipoDeEvidencia } from '@/lib/fotos/nombres';

/**
 * La subida de evidencia: firmar el permiso y registrar la fila.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * EL CLIENTE LLEGA POR PARAMETRO Y NO SE CONSTRUYE AQUI, misma razon que
 * `lib/data/sync.ts` y `lib/data/aseadores.ts`: asi la misma funcion sirve a
 * una Server Action y a un test de integracion con el JWT que se quiera.
 *
 * `cleaning_photos` tiene `grant select, insert` para `authenticated` y su
 * policy `photos_cleaner_insert` desde la Fase 1, asi que la escritura va
 * directa con el JWT del usuario. **No hace falta RPC ni fabrica
 * administrativa**, y no se usa ninguna de las dos.
 * ════════════════════════════════════════════════════════════════════════════
 */

type Cliente = SupabaseClient<Database>;

/**
 * De que cuelga la foto. **Exactamente UNA de las cuatro.**
 *
 * Es una union y no un objeto con cuatro campos opcionales, y esa es la
 * diferencia que importa: un registro con dos vinculos **no compila**. Misma
 * disciplina que `mil_exactly_one_source` impone en SQL para los faltantes.
 */
export type VinculoDeFoto =
  | { tipo: 'checklist'; checklistItemId: string }
  | { tipo: 'dano'; damageId: string }
  | { tipo: 'gasto'; expenseId: string }
  | { tipo: 'faltante'; missingReportId: string };

export interface PermisoDeSubida {
  /** La ruta que decidio EL SERVIDOR. El cliente no la propone. */
  ruta: string;
  /** El token de subida firmado, valido solo para esa ruta. */
  token: string;
}

/**
 * Pide una URL de subida firmada para una ruta que compone el servidor.
 *
 * La ruta no es negociable por el cliente: en un bucket privado el nombre del
 * archivo **es** una autorizacion, y quien puede elegirlo puede escribir encima
 * de la evidencia de otro aseo.
 */
export async function firmarSubida(
  supabase: Cliente,
  entrada: { cleaningId: string; tipo: TipoDeEvidencia },
): Promise<{ permiso: PermisoDeSubida | null; error: string | null }> {
  const ruta = rutaDeEvidencia(entrada.cleaningId, entrada.tipo);

  const { data, error } = await supabase.storage
    .from(BUCKET_EVIDENCIA)
    .createSignedUploadUrl(ruta);

  if (error || !data) {
    // El mensaje del error de Storage NO se propaga: puede arrastrar la ruta
    // completa y el nombre del bucket. Mismo criterio que el worker de sync con
    // la direccion del feed.
    return { permiso: null, error: 'firma_fallida' };
  }

  return { permiso: { ruta: data.path, token: data.token }, error: null };
}

export type ResultadoDeRegistro =
  | { estado: 'registrada' }
  /**
   * Ya estaba. **Es un exito, no un error**, y conviene entender por que: la
   * idempotencia la da `storage_path unique` (global, de la migracion 04), asi
   * que un reintento del cliente choca con el indice. Tratar ese choque como
   * fallo haria que un reintento por mala senal se viera como foto perdida.
   */
  | { estado: 'ya_registrada' }
  | { estado: 'error'; codigo: string };

/** Los campos que salen de `comprimirFoto()`, sin nada mas. */
export interface MetadatosDeFoto {
  storagePath: string;
  bytes: number;
  width: number;
  height: number;
  mimeType: 'image/jpeg';
}

/**
 * Registra la fila de `cleaning_photos`.
 *
 * ── `captured_lat` Y `captured_lng` SE DEJAN NULAS, Y ES UNA DECISION ────────
 *
 * La migracion 04 las previo ("coordenadas, no dinero: numeric es correcto").
 * Llenarlas exigiria pedirle permiso de ubicacion a la aseadora y guardar donde
 * estuvo cada dia, y **ningun requisito lo pide**. Queda escrito como decision y
 * no como olvido; el objeto del `insert` no las incluye.
 *
 * Es coherente con lo demas: `lib/fotos/comprimir.ts` borra el EXIF justo para
 * que la ubicacion no viaje dentro de la foto. Guardarla en una columna seria
 * deshacer eso por la puerta de al lado.
 */
export async function registrarFoto(
  supabase: Cliente,
  entrada: {
    cleaningId: string;
    vinculo: VinculoDeFoto;
    metadatos: MetadatosDeFoto;
    /**
     * Quien la subio. **Obligatorio, y no por formalismo**: la columna es
     * `not null` sin default, asi que el tipo generado lo exige y `tsc` lo caza.
     * Es lo correcto: una evidencia que no dice quien la aporto no es evidencia.
     */
    uploadedBy: string;
  },
): Promise<ResultadoDeRegistro> {
  const { cleaningId, vinculo, metadatos, uploadedBy } = entrada;

  const fila = {
    cleaning_id: cleaningId,
    kind: vinculo.tipo,
    checklist_item_id: vinculo.tipo === 'checklist' ? vinculo.checklistItemId : null,
    damage_id: vinculo.tipo === 'dano' ? vinculo.damageId : null,
    expense_id: vinculo.tipo === 'gasto' ? vinculo.expenseId : null,
    missing_report_id: vinculo.tipo === 'faltante' ? vinculo.missingReportId : null,
    storage_bucket: BUCKET_EVIDENCIA,
    storage_path: metadatos.storagePath,
    mime_type: metadatos.mimeType,
    bytes: metadatos.bytes,
    width: metadatos.width,
    height: metadatos.height,
    uploaded_by: uploadedBy,
  };

  const { error } = await supabase.from('cleaning_photos').insert(fila);

  if (error) {
    // 23505 sobre `storage_path unique` es el reintento, no un fallo.
    if (error.code === '23505') return { estado: 'ya_registrada' };
    // Union cerrada, nunca el mensaje: puede arrastrar la ruta.
    return { estado: 'error', codigo: `db_${error.code ?? 'desconocido'}` };
  }

  return { estado: 'registrada' };
}
