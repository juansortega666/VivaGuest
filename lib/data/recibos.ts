import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';

/**
 * LA FIRMA DEL RECIBO DE UN GASTO (07-UI-SPEC §9.4).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ES LA PRIMERA SUPERFICIE DEL ADMIN QUE MUESTRA UNA FOTO, Y POR ESO TIENE
 * CONTRATO PROPIO.
 *
 * El bucket es privado. En un bucket privado la RUTA del archivo es, por si
 * sola, una autorizacion: quien la conoce puede pedir que se la firmen. Por eso
 * la firma se genera EN EL SERVIDOR, despues del guard de admin, y lo unico que
 * viaja al navegador es la URL ya firmada y con vida corta.
 *
 * **Ninguna ruta de almacenamiento viaja al cliente sin firmar.** Las funciones
 * de la base devuelven la ruta y el bucket porque el servidor los necesita para
 * firmar; el componente de dialogo recibe la URL resuelta y nunca la ruta.
 *
 * ── LA VIDA DE LA FIRMA ES CORTA, Y ESO TIENE UNA CONSECUENCIA VISIBLE ────
 *
 * Un recibo se mira una vez y se cierra. Cinco minutos cubren de sobra ese gesto
 * y acotan la ventana en la que un enlace copiado de las herramientas del
 * navegador sigue sirviendo. La contrapartida es que el admin puede dejar el
 * dialogo abierto y que la firma venza con el delante: eso NO es un fallo que
 * haya que evitar alargando la vida, es un estado que la interfaz declara y
 * resuelve pidiendo que vuelva a abrir el recibo.
 *
 * ── EL CLIENTE LLEGA POR PARAMETRO ────────────────────────────────────────
 *
 * Misma regla que el resto de `lib/data/`. Y aqui importa doble: la firma se
 * emite con los privilegios de quien llama, asi que un cliente construido aqui
 * dentro decidiria por su cuenta con que identidad se firma.
 * ════════════════════════════════════════════════════════════════════════════
 */

type Cliente = SupabaseClient<Database>;

/**
 * Cinco minutos. Lo que dura mirar un recibo, no lo que dura una sesion.
 *
 * En segundos, que es lo que espera la API de almacenamiento.
 */
export const VIDA_DE_LA_FIRMA_SEGUNDOS = 300;

/**
 * Lo que el gasto guarda sobre su foto. Las dos columnas salen de
 * `gastos_de_aseadora` (migracion 26) y NUNCA se pintan.
 */
export type UbicacionDeRecibo = {
  bucket: string;
  ruta: string;
};

/**
 * El resultado de firmar. La ausencia de URL NO es un fallo de esta capa.
 *
 * ── LOS DOS "SIN RECIBO" SON DISTINTOS Y LA PANTALLA LOS DISTINGUE ────────
 *
 *   · `sin_evidencia`: el gasto nunca tuvo foto, o la foto ya se purgo por
 *     antiguedad. Es informacion: el gasto y su monto siguen registrados, y lo
 *     unico que se perdio es la imagen. La ficha ni siquiera ofrece el boton.
 *   · `firma_fallida`: el almacenamiento rechazo la firma. Es un fallo real,
 *     pero se le presenta al admin igual de explicado, porque desde su lado la
 *     accion disponible es la misma.
 *
 * Se devuelven como dato y no se lanza: un gasto cuya foto se purgo sigue siendo
 * un gasto que hay que reembolsar, y hacer caer la ficha entera por eso seria
 * perder de vista el dinero por culpa de una imagen.
 */
export type ReciboFirmado =
  | { estado: 'firmado'; url: string }
  | { estado: 'sin_evidencia' }
  | { estado: 'firma_fallida' };

/**
 * Firma la URL de lectura de un recibo, o explica por que no hay ninguna.
 *
 * `ubicacion` nula significa que el gasto no tiene evidencia registrada, que es
 * exactamente lo que devuelve el `left join lateral` de `gastos_de_aseadora`
 * cuando la foto ya se purgo. Se acepta como argumento en vez de obligar a quien
 * llama a ramificar antes: asi el sitio donde se decide que pintar es uno solo.
 *
 * ── EL MENSAJE DE ERROR DEL ALMACENAMIENTO NO SE PROPAGA ──────────────────
 *
 * Puede arrastrar la ruta completa y el nombre del bucket, que es justo lo que
 * esta capa existe para no dejar salir. Mismo criterio que `firmarSubida()` con
 * la ruta de evidencia y que el worker de sync con la direccion del feed.
 */
export async function firmarRecibo(
  supabase: Cliente,
  ubicacion: UbicacionDeRecibo | null,
): Promise<ReciboFirmado> {
  if (!ubicacion || ubicacion.ruta === '') return { estado: 'sin_evidencia' };

  const { data, error } = await supabase.storage
    .from(ubicacion.bucket)
    .createSignedUrl(ubicacion.ruta, VIDA_DE_LA_FIRMA_SEGUNDOS);

  if (error || !data?.signedUrl) return { estado: 'firma_fallida' };

  return { estado: 'firmado', url: data.signedUrl };
}
