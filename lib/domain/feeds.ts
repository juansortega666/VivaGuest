import type { FeedDeApartamento } from '@/lib/data/feeds';

/**
 * LOS TRES ESTADOS DEL FEED DE UN APARTAMENTO, DERIVADOS UNA SOLA VEZ.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESTE MÓDULO NACE EN LA FASE 8, AUNQUE EL CONTRATO DIJERA QUE YA EXISTÍA.
 *
 * `08-UI-SPEC.md` §14.4 afirmaba que este archivo y esta función ya estaban.
 * Era falso, y el Hallazgo 8 de `08-RESEARCH.md` lo midió: un `grep` del nombre
 * sobre el repo entero devolvía cero. Lo que sí existía era otra cosa, y
 * conviene saber cuál para no volver a confundirlas:
 *
 *   · `lib/domain/salud-sync.ts` responde **si la sincronización del sistema
 *     entero está caída**, con un umbral de tres horas sobre el éxito más
 *     reciente de TODOS los feeds activos. No sabe nada de un feed concreto y
 *     no puede decir de cuál se trata, porque no es de ninguno.
 *   · `lib/data/feeds.ts` es capa de DATOS: lee la fila, escribe las siete
 *     columnas de salud y resume un fallo en texto de diagnóstico. No deriva
 *     ningún estado de pantalla.
 *
 * Este módulo responde la tercera pregunta, que es la del panel: **qué le pasa
 * al calendario de ESTE apartamento** (UI-SPEC §8.2).
 *
 * ── EL NOMBRE DEL TIPO DE RETORNO, Y POR QUÉ NO ES EL OBVIO ───────────────
 *
 * El obvio ya está tomado. `lib/data/feeds.ts`, en su línea 68, exporta una
 * interfaz que se llama EXACTAMENTE como esta función pero con la inicial en
 * mayúscula, y significa otra cosa: es la forma de ESCRITURA, las siete
 * columnas tal como quedan tras un intento de validación. Si el tipo de aquí se
 * llamara igual, cualquier archivo que importara los dos tendría que renombrar
 * uno en el `import`, y esa fricción se paga para siempre. De ahí
 * `EstadoDeFeed`, que además dice mejor lo que es: un estado de presentación,
 * no una fila.
 *
 * ── PURO, Y SIN COPY ──────────────────────────────────────────────────────
 *
 * Devuelve la CLAVE del estado y el número de fallos, nunca la etiqueta. Las
 * tres etiquetas de §15.2 viven en el componente, que es la disciplina que ya
 * siguen `estadoDeAseo()` y `estadoDeApartamento()`: así el módulo se prueba
 * con un unitario sin arrastrar el contrato de copywriting, y el día que el
 * dueño cambie una palabra no se toca el dominio.
 *
 * Lo único que entra de fuera es un TIPO (`FeedDeApartamento`), que se borra al
 * compilar. En tiempo de ejecución este archivo no importa nada.
 * ════════════════════════════════════════════════════════════════════════════
 */

/**
 * Las tres claves de §8.2:
 *
 *   · `ausente`    no hay feed, o lo hay pero está apagado
 *   · `con-fallos` el feed arrastra intentos fallidos seguidos
 *   · `sano`       el resto
 *
 * `sano` y no la palabra de pantalla, por lo mismo que `salud-sync.ts` usa
 * `'sana' | 'caida'`: la clave es vocabulario de dominio y la etiqueta es
 * vocabulario de producto, y mezclarlos es como una acaba dependiendo de la
 * otra.
 */
export type ClaveDeEstadoDeFeed = 'ausente' | 'con-fallos' | 'sano';

/**
 * El estado del calendario de un apartamento, listo para pintar.
 *
 * `fallos` viaja en las tres ramas, también donde el copy no lo usa: el
 * consumidor no tiene que volver a la fila del feed para poner el número en un
 * `title`.
 */
export type EstadoDeFeed = { clave: ClaveDeEstadoDeFeed; fallos: number };

/**
 * Deriva el estado del calendario de un apartamento.
 *
 * Acepta `null` porque `leerFeedDeApartamento()` lo devuelve en DOS casos
 * distintos: el apartamento no tiene calendario, y la seguridad a nivel de fila
 * no deja verlo. La pantalla trata los dos igual, así que aquí tampoco se
 * separan.
 *
 * EL ORDEN DE EVALUACIÓN ES PARTE DE LA REGLA, igual que en `estadoDeAseo()`,
 * y hay un test que lo fija con un feed apagado que además arrastra fallos.
 */
export function saludDelFeed(feed: FeedDeApartamento | null): EstadoDeFeed {
  // Sin fila no hay nada que contar. Es el único sitio donde el cero es una
  // decisión y no un dato leído.
  const fallos = feed?.consecutive_failures ?? 0;

  // 1. LA AUSENCIA, PRIMERO. Un feed apagado no lo despacha el cron, así que el
  //    calendario no está trayendo nada y el apartamento no va a generar aseos
  //    solo: eso es lo mismo que no tenerlo, y es lo que el admin necesita
  //    leer. Mirarlo DESPUÉS de los fallos haría que un feed que alguien apagó
  //    justamente porque fallaba se anunciara como "falla", que invita a
  //    esperar a que se arregle solo, y no se va a arreglar.
  if (feed === null || !feed.is_active) return { clave: 'ausente', fallos };

  // 2. LOS FALLOS, DESPUÉS, y el umbral es UNO. El contador vuelve a cero en
  //    cuanto una sincronización sale bien, así que un valor positivo significa
  //    que el feed está fallando AHORA y no que falló alguna vez.
  if (fallos > 0) return { clave: 'con-fallos', fallos };

  // 3. EL RESTO. No se exige haber sincronizado nunca: un calendario que se
  //    acaba de enlazar tiene el éxito en nulo durante su primera media hora,
  //    y pintarlo como problema ahí sería una falsa alarma en cada alta.
  return { clave: 'sano', fallos };
}
