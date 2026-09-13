/**
 * DECLARACIÓN DE CONTRATO DE LA WAVE 0. **NO TIENE RUNTIME, Y ES DELIBERADO.**
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESTE ARCHIVO SE BORRA EN EL PLAN 07-06, cuando exista `lib/domain/periodo.ts`
 * de verdad. La razón completa está en `lib/domain/finanzas.d.ts`.
 *
 * ── ESTE MÓDULO ES EL DEL RESUMEN, Y NO ES EL CALENDARIO DE CIERRE ────────
 *
 * La palabra "mes" significa dos cosas distintas (UI-SPEC §6.2.1). En el
 * RESUMEN, `mes` es el mes calendario y es una vista viva. En PAGOS, el periodo
 * va de cierre a cierre (D7-5) y vive en `lib/domain/mes.ts`.
 *
 * Mezclarlos es el defecto más caro que la pantalla de finanzas puede producir:
 * el admin transfiriendo plata calculada sobre un mes calendario que no coincide
 * con el periodo que la persona cobró. **Este módulo no importa el otro.**
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Los tres rangos del filtro. Viajan en la URL como `?rango=`. */
export type RangoDePeriodo = 'dia' | 'semana' | 'mes';

/**
 * El rango que contiene el día `ancla`, con los dos extremos incluidos.
 *
 * **La semana arranca en LUNES** y termina en domingo. Se declara aquí para que
 * no lo decida una librería: un ancla en domingo tiene que CERRAR su semana, no
 * abrir la siguiente.
 *
 * El rango de mes es el MES CALENDARIO, del primero al último día. No es el
 * periodo de pago.
 */
export declare function rangoDePeriodo(
  rango: RangoDePeriodo,
  ancla: string,
): { desde: string; hasta: string };

/**
 * Las tres etiquetas de UI-SPEC §11.2, con su copy exacto:
 *
 *   día    → `jueves 10 de septiembre`
 *   semana → `del 7 al 13 de septiembre`
 *   mes    → `septiembre de 2026`
 *
 * La semana que cruza el mes nombra los dos meses: `del 28 de septiembre al 4
 * de octubre`. "del 28 al 4 de octubre" no significa nada.
 */
export declare function etiquetaDeRango(
  rango: RangoDePeriodo,
  desde: string,
  hasta: string,
): string;

/**
 * Si el periodo contiene el día de hoy, con los DOS EXTREMOS incluidos.
 *
 * Gobierna dos cosas: el chevron de "periodo siguiente" va deshabilitado cuando
 * el periodo ya contiene hoy, y el botón de volver a hoy solo se renderiza
 * cuando NO lo contiene.
 *
 * `hoy` entra POR PARÁMETRO y nunca se lee del reloj: el proceso corre en tiempo
 * universal y pasadas las 19:00 de Bogotá un reloj leído aquí ya dice mañana.
 */
export declare function contieneHoy(desde: string, hasta: string, hoy: string): boolean;
