import type { Enums } from '@/lib/database.types';

/**
 * La ruta de un archivo de evidencia dentro del bucket privado.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * LA RUTA LA DECIDE EL SERVIDOR. SIEMPRE.
 *
 * En un bucket privado, **el nombre del archivo es una autorización**: quien
 * puede elegir la ruta puede escribir encima de la evidencia de otro aseo. Por
 * eso esta función se llama desde una Server Action y **ningún byte que venga
 * del cliente entra en el resultado**: ni el nombre del archivo original, ni la
 * etiqueta del cuarto, ni nada que alguien haya escrito.
 *
 * Los tres segmentos salen de: el identificador del aseo (que el servidor ya
 * validó), el tipo (una unión cerrada derivada del CHECK de la tabla), y un
 * identificador aleatorio.
 * ════════════════════════════════════════════════════════════════════════════
 */

/**
 * Los cuatro tipos del `check` de `cleaning_photos.kind`.
 *
 * Se declara aquí y no se importa de los tipos generados porque `kind` es una
 * columna `text` con `CHECK`, no un enum de Postgres, así que el generador no
 * produce una unión para ella. **Si algún día pasa a enum, esta línea se
 * reemplaza por `Enums<'...'>` y el compilador dirá dónde.**
 */
export type TipoDeEvidencia = 'checklist' | 'dano' | 'gasto' | 'faltante';

/** Marcador de que este módulo conoce los tipos generados, para el día del cambio. */
export type TiposGenerados = Enums<'cleaning_state'>;

/** El bucket, creado por la migración 10. Privado. */
export const BUCKET_EVIDENCIA = 'evidencia';

/**
 * `{cleaning_id}/{kind}/{uuid}.jpg`
 *
 * Tres segmentos, ninguno con dato del cliente. La extensión es fija porque la
 * salida de la compresión es JPEG (ver `lib/fotos/politica.ts` y la decisión de
 * no usar WebP, medida el 2026-09-12: Safari no puede **codificar** WebP en
 * canvas, así que en iPhone no hay forma de producirlo).
 */
export function rutaDeEvidencia(cleaningId: string, tipo: TipoDeEvidencia): string {
  return `${cleaningId}/${tipo}/${crypto.randomUUID()}.jpg`;
}
