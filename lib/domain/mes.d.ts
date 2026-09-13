/**
 * DECLARACIÓN DE CONTRATO DE LA WAVE 0. **NO TIENE RUNTIME, Y ES DELIBERADO.**
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESTE ARCHIVO SE BORRA EN EL PLAN 07-06, cuando exista `lib/domain/mes.ts` de
 * verdad. Es una obligación: un `.d.ts` que sobreviva a su implementación queda
 * como un contrato paralelo que nadie mira y que no falla al desincronizarse.
 *
 * La razón completa está escrita una sola vez, en `lib/domain/finanzas.d.ts`.
 * En corto: sin la declaración, `tsc` se llena de errores en cascada y deja de
 * servir como puerta durante toda la wave; con ella, el único rojo es el de
 * vitest, que es la señal que la Wave 0 quiere producir. Y como un `.d.ts` no
 * existe en tiempo de ejecución, vitest sigue fallando con "no encuentro el
 * módulo" y ningún código de aplicación puede importarlo por accidente.
 *
 * ── EL CALENDARIO DE CIERRE, EN DOS FRASES ────────────────────────────────
 *
 * El mes cierra el último día hábil: si el último día cae en sábado o domingo se
 * retrocede al viernes, SIN FESTIVOS, por decisión explícita del ROADMAP. El
 * periodo va de cierre a cierre (D7-5), así que no existe ningún día huérfano.
 *
 * Estas funciones son el GEMELO de `public.ultimo_dia_habil_del_mes` y
 * `public.periodo_de_cierre`. Que las dos digan lo mismo no se supone: lo mide
 * `mes.integration.test.ts` sobre los 36 meses de 2026 a 2028.
 * ════════════════════════════════════════════════════════════════════════════
 */

/**
 * El día de cierre del mes al que pertenece `diaISO`.
 *
 * Recibe CUALQUIER día del mes, no el primero: el llamante casi nunca lo tiene
 * a mano. Entra y sale `'YYYY-MM-DD'`.
 */
export declare function ultimoDiaHabilDelMes(diaISO: string): string;

/**
 * El periodo de pago que CONTIENE `diaISO`, con los dos extremos incluidos.
 *
 * Un día posterior al cierre de su propio mes pertenece al periodo del mes
 * SIGUIENTE. Es lo que elimina los días huérfanos, y es la mitad del valor de
 * D7-5.
 */
export declare function periodoDeCierre(diaISO: string): { desde: string; hasta: string };

/**
 * `Del 1 al 30 de enero de 2026` (UI-SPEC §11.3).
 *
 * SIEMPRE las dos fechas, también cuando el periodo coincide con el mes
 * calendario completo: un formato que cambia según el caso obliga a leer con
 * atención justo el día en que no coincide.
 *
 * `conAnio` por defecto es verdadero, que es la forma del admin. La tarjeta del
 * aseador lo pasa en falso. Quién decide eso es el llamante: saberlo exige
 * conocer el día de hoy, y un módulo de formato que lee el reloj es una
 * dependencia oculta.
 */
export declare function etiquetaDePeriodoDePago(
  desde: string,
  hasta: string,
  conAnio?: boolean,
): string;
