/**
 * LOS MENSAJES DE EXITO DE LA PANTALLA DE OPERACION QUE NO COMPONE LA ACTION.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * LA REGLA QUE ESTE MODULO EXISTE PARA SOSTENER (05-UI-SPEC §11.4)
 *
 * Un copy de exito PUEDE afirmar la AUSENCIA de canal: en el momento de escribir
 * el mensaje se sabe, como hecho, que ese aseador tiene cero suscripciones vivas.
 *
 * Un copy de exito NO PUEDE afirmar la ENTREGA. El drenaje de la cola es
 * asincrono y fire-and-forget: ni la Server Action que confirma el aseo ni este
 * modulo saben —ni pueden saber— si el aviso llego a un telefono. Un mensaje que
 * lo afirme hace que el admin deje de revisar, y el precio de esa confianza mal
 * puesta es una aseadora que no aparece (T-05-51).
 *
 * Hay un test que recorre TODOS los mensajes de exito de la pantalla buscando las
 * formas de afirmar entrega, y que se corrio en rojo y en verde.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── POR QUE ESTE MODULO EXISTE Y NO VIVE DENTRO DE `_actions.ts` ───────────
 *
 * Porque `_actions.ts` es `'use server'` y ahi todo lo exportado tiene que ser
 * una funcion asincrona: un compositor de cadenas no cabe. Y porque DOS de estos
 * tres mensajes los pinta el cliente (el toast de cierre de la tanda vive en el
 * `Sheet`, que es quien sabe cuantos confirmo de verdad) mientras el tercero lo
 * compone la action. Con el copy repartido entre los dos lados, el test de §11.4
 * tendria que recorrer dos sitios y se dejaria uno.
 *
 * ── EL CONTEO LO CALCULA EL LLAMADOR, NO ESTE MODULO ──────────────────────
 *
 * Quien sabe cuantos de la tanda fueron a parar a un aseador mudo es quien tiene
 * el estado de avisos a mano. Este modulo solo interpola.
 */

/**
 * La coletilla de los casos sin canal, o cadena vacia si no hubo ninguno.
 *
 * Va en una sola funcion y no repetida en las dos de abajo para que la unica
 * forma de cambiar esa frase sea tocar este sitio: es la frase que el test de
 * §11.4 tiene que ver pasar por el lado PERMITIDO, y dos redacciones distintas
 * darian dos resultados distintos al mismo test.
 */
function sufijoSinAvisos(sinAvisos: number): string {
  if (sinAvisos <= 0) return '';

  return sinAvisos === 1
    ? ' 1 quedó con un aseador sin avisos.'
    : ` ${sinAvisos} quedaron con un aseador sin avisos.`;
}

/**
 * Tanda terminada entera. `Listo: 15 aseos confirmados.`, mas la coletilla.
 *
 * Con `sinAvisos` en cero el mensaje es EXACTAMENTE el de la Fase 4, sin un
 * espacio de mas: es el caso comun y no tenia por que cambiar.
 */
export function mensajeDeTandaCompleta(confirmados: number, sinAvisos: number): string {
  const sustantivo = confirmados === 1 ? 'aseo confirmado' : 'aseos confirmados';
  return `Listo: ${confirmados} ${sustantivo}.${sufijoSinAvisos(sinAvisos)}`;
}

/**
 * Tanda cerrada a medias. El copy NO cambia el hecho de que lo confirmado esta
 * escrito en la base aseo por aseo (D-10): lo que sigue en la bandeja es lo que
 * nunca se envio.
 */
export function mensajeDeTandaInterrumpida(
  confirmados: number,
  total: number,
  sinAvisos: number,
): string {
  return `Confirmaste ${confirmados} de ${total}. Los demás siguen en la bandeja.${sufijoSinAvisos(sinAvisos)}`;
}

/**
 * El exito de la reasignacion, que SI compone la action porque es ella quien
 * devuelve el `ResultadoAccion` que el dialogo muestra.
 *
 * Sin nombre no se dice nada del canal, y no es un olvido: "No tiene los avisos
 * activos" sin un sujeto delante no se entiende, y el unico caso sin nombre es
 * aquel en el que el dialogo no lo mando. El hecho se pierde en una rama que el
 * camino real no recorre; inventarle un sujeto seria peor.
 */
export function mensajeDeReasignacion(nombre: string | null, sinAvisos: boolean): string {
  if (nombre === null) return 'El aseo quedó reasignado.';

  const base = `El aseo quedó asignado a ${nombre}.`;
  return sinAvisos ? `${base} No tiene los avisos activos: avísale tú.` : base;
}
