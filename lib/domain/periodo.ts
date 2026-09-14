/**
 * EL FILTRO DE PERIODO DEL RESUMEN. NO ES EL CALENDARIO DE PAGO.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESTE MÓDULO NO IMPORTA `lib/domain/mes.ts`, Y NO ES UN DESCUIDO.
 *
 * La palabra "mes" significa DOS COSAS DISTINTAS (UI-SPEC §6.2.1):
 *
 *   · En el RESUMEN, `mes` es el MES CALENDARIO: del 1 al 31 de enero. Es una
 *     vista viva que se recalcula cada vez que se abre. Es lo que hace este
 *     archivo.
 *   · En PAGOS, el periodo va de CIERRE A CIERRE (D7-5): el de enero de 2026 va
 *     del 1 al 30 porque el 31 es sábado, y ese 31 pertenece al periodo
 *     siguiente. Eso vive en `lib/domain/mes.ts` y no se toca desde aquí.
 *
 * Los dos son correctos, cada uno en su pantalla. **Unificarlos es el defecto
 * más caro que la pantalla de finanzas puede producir:** el admin transfiriendo
 * plata calculada sobre un mes calendario que no coincide con el periodo que la
 * persona cobró. Y como un periodo cerrado no se recalcula nunca (D7-3), eso no
 * se arregla después.
 *
 * Compartir una función entre los dos es cómo terminan compartiendo error, así
 * que la separación es física: **cero imports de `./mes` en este archivo**, y
 * `periodo.test.ts` fija la diferencia con enero de 2026, que es el mes donde se
 * ve. Lo único que los dos módulos comparten es `lib/domain/dates.ts`, que
 * aporta aritmética del calendario gregoriano y ninguna regla de negocio.
 *
 * ── LA SEMANA ARRANCA EN LUNES ────────────────────────────────────────────
 *
 * Se declara aquí para que no lo decida una librería ni el idioma del navegador.
 * Es lo que espera un calendario colombiano, y el caso que decide si está bien
 * resuelto es el ancla EN DOMINGO: con la semana en base domingo, que es el
 * default de buena parte del ecosistema, ese día ABRE la semana siguiente en vez
 * de cerrar la suya, y el filtro salta siete días hacia adelante sin avisar. El
 * admin vería los números de la semana que todavía no ha ocurrido creyendo que
 * son los de la que acaba de terminar.
 *
 * ── PURO, Y SIN RELOJ ─────────────────────────────────────────────────────
 *
 * El día de referencia y el día de hoy llegan SIEMPRE por argumento, desde
 * `hoyBog()` o desde la base. El proceso corre en tiempo universal y pasadas las
 * 19:00 de Bogotá un reloj leído aquí ya dice mañana.
 * ════════════════════════════════════════════════════════════════════════════
 */

import {
  diaDeLaSemana,
  formatFechaLargaBog,
  nombreDeDiaBog,
  nombreDeMesBog,
  primeroDelMes,
  sumarDias,
  ultimoDiaDelMes,
} from './dates';

/** Los tres rangos del filtro. Viajan en la URL como `?rango=`. */
export type RangoDePeriodo = 'dia' | 'semana' | 'mes';

/** Un rango del filtro, con los dos extremos INCLUIDOS. */
export type RangoDeFechas = { desde: string; hasta: string };

/** Domingo en la numeración de `diaDeLaSemana`, que es la de `Date`. */
const DOMINGO = 0;

/**
 * El lunes de la semana que contiene `ancla`.
 *
 * El desplazamiento es `1 - dia` salvo el domingo, que retrocede seis días en
 * vez de avanzar uno. Dicho de otra forma: un ancla en LUNES se queda donde
 * está (una implementación que reste siete días para "ir al lunes" devolvería la
 * semana anterior) y un ancla en DOMINGO cierra su semana en vez de abrir la
 * siguiente.
 */
function lunesDeLaSemana(ancla: string): string {
  const dia = diaDeLaSemana(ancla);
  return sumarDias(ancla, dia === DOMINGO ? -6 : 1 - dia);
}

/**
 * El rango que contiene el día `ancla`, con los dos extremos incluidos.
 *
 * `dia` devuelve un rango de duración cero (`desde` igual a `hasta`), que es
 * legítimo y el resto del módulo lo trata como cualquier otro.
 *
 * `mes` es el MES CALENDARIO, del primero al último día. No es el periodo de
 * pago, y la cabecera de este archivo explica por qué eso importa.
 */
export function rangoDePeriodo(rango: RangoDePeriodo, ancla: string): RangoDeFechas {
  switch (rango) {
    case 'dia':
      return { desde: ancla, hasta: ancla };

    case 'semana': {
      const lunes = lunesDeLaSemana(ancla);
      return { desde: lunes, hasta: sumarDias(lunes, 6) };
    }

    case 'mes':
      return { desde: primeroDelMes(ancla), hasta: ultimoDiaDelMes(ancla) };
  }
}

/**
 * Las tres etiquetas del filtro, con el copy exacto de UI-SPEC §11.2:
 *
 *   día    → `jueves 10 de septiembre`
 *   semana → `del 7 al 13 de septiembre`
 *   mes    → `septiembre de 2026`
 *
 * LA SEMANA QUE CRUZA EL MES NOMBRA LOS DOS MESES: `del 28 de septiembre al 4 de
 * octubre`. "del 28 al 4 de octubre" no significa nada, y con la semana anclada
 * en lunes ocurre una de cada cuatro semanas, así que no es un caso de borde.
 *
 * El rango de mes lleva año y los otros dos no, y es deliberado: es el rango por
 * defecto de la pantalla y el que alguien puede estar mirando después de navegar
 * varios meses hacia atrás.
 *
 * Los meses van en minúscula, como en el resto del producto. `es-CO` ya los
 * devuelve así; la etiqueta se compone a mano y no se capitaliza nada.
 */
export function etiquetaDeRango(
  rango: RangoDePeriodo,
  desde: string,
  hasta: string,
): string {
  switch (rango) {
    case 'dia':
      // Dos formateadores y no uno: `Intl` con `weekday` y `day` a la vez junta
      // las dos partes con `", "` en es-CO, y el copy del contrato no lleva coma.
      return `${nombreDeDiaBog(desde)} ${formatFechaLargaBog(desde)}`;

    case 'semana': {
      const mismoMes = desde.slice(0, 7) === hasta.slice(0, 7);
      // El día sin cero a la izquierda: `'07'` se escribe `7`.
      const diaDesde = String(Number(desde.slice(8, 10)));

      return mismoMes
        ? `del ${diaDesde} al ${formatFechaLargaBog(hasta)}`
        : `del ${formatFechaLargaBog(desde)} al ${formatFechaLargaBog(hasta)}`;
    }

    case 'mes':
      return `${nombreDeMesBog(desde)} de ${desde.slice(0, 4)}`;
  }
}

/**
 * Si el periodo contiene el día de hoy, con los DOS EXTREMOS incluidos.
 *
 * Gobierna dos cosas de la cabecera: el chevron de "periodo siguiente" va
 * deshabilitado cuando el periodo ya contiene hoy, y el botón de volver a hoy
 * solo se renderiza cuando NO lo contiene. Con una comparación estricta en los
 * extremos, el primer y el último día de cada mes el admin vería un chevron
 * habilitado hacia un futuro que no existe Y un botón de "Hoy" estando en hoy.
 *
 * `hoy` entra POR PARÁMETRO y nunca se lee del reloj, por la razón de siempre en
 * este repo.
 *
 * La comparación es lexicográfica sobre cadenas `'YYYY-MM-DD'`, que para este
 * formato coincide con el orden cronológico. No se construye ningún instante: un
 * cálculo con aritmética de instantes se rompe justo en el rango de `día`, que
 * tiene duración cero.
 */
export function contieneHoy(desde: string, hasta: string, hoy: string): boolean {
  return desde <= hoy && hoy <= hasta;
}
