import type { FotoDelPanel } from '@/lib/data/panel-aseo';

/**
 * DE QUÉ ES LA FOTO, EN PALABRAS.
 *
 * `lib/data/panel-aseo.ts` ya resolvió la etiqueta contra el checklist, los
 * gastos y los daños que esa misma lectura trajo, así que acá no se cruza nada.
 * Nula cuando la foto no cuelga de nada con nombre, y entonces se dice lo único
 * que se sabe con certeza: que es del aseo.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUÉ ESTA FUNCIÓN VIVE EN SU PROPIO ARCHIVO Y NO DENTRO DE `DialogoFoto`,
 * QUE ES DONDE ESTABA HASTA EL PLAN 08-13.
 *
 * Porque la llaman los DOS lados de la frontera:
 *
 *   · `TiraDeEvidencia` es un componente de SERVIDOR y la usa para el nombre
 *     accesible del botón de cada miniatura (§13.4).
 *   · `DialogoFoto` lleva `'use client'` y la usa para el texto alternativo de
 *     la foto dentro del diálogo (§13.4, nunca vacío).
 *
 * Con la función exportada desde el módulo de cliente, la llamada del servidor
 * no compila un valor: compila una REFERENCIA al otro lado de la frontera, y en
 * cuanto el servidor intenta invocarla el render revienta con
 *
 *     Attempted to call deQueEsLaFoto() from the server but deQueEsLaFoto is on
 *     the client.
 *
 * **Y ese fallo se pasó por alto durante toda la fase por una razón que hay que
 * dejar escrita:** la llamada del servidor solo ocurre en la rama de la foto
 * FIRMADA, y hasta el plan 08-13 ningún escenario de prueba había subido bytes
 * de verdad al bucket. Con las siete fotos sin objeto en el almacenamiento, las
 * siete caían en `firma_fallida`, la tira pintaba seis casillas de ausencia, y
 * esa línea no se ejecutaba nunca. El panel de un aseo con evidencia de verdad
 * daba error de servidor y no había ninguna prueba que lo pudiera ver.
 *
 * Un módulo sin directiva lo puede importar cualquiera de los dos lados, que es
 * exactamente lo que hace falta. Y no puede vivir en `TiraDeEvidencia` porque
 * ese archivo importa a `DialogoFoto`, así que el préstamo sería circular.
 * ════════════════════════════════════════════════════════════════════════════
 */
export function deQueEsLaFoto(foto: FotoDelPanel): string {
  return foto.etiqueta ?? 'el aseo';
}
