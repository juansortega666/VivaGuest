/**
 * EL CALENDARIO DEL CIERRE. GEMELO DE TRES FUNCIONES DE POSTGRES.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESTE MÓDULO ESTÁ DUPLICADO EN LA BASE, A PROPÓSITO, Y ESO OBLIGA A ALGO.
 *
 * Original en `supabase/migrations/20260913100000_23_calendario_y_snapshot.sql`:
 *
 *   `ultimoDiaHabilDelMes`  ←→  `public.ultimo_dia_habil_del_mes(date)`
 *   `periodoDeCierre`       ←→  `public.periodo_de_cierre(date)`
 *
 * (La tercera de la migración, `public.dia_bog(timestamptz)`, ya tiene su gemelo
 * en `diaBog()` de `lib/domain/dates.ts`. No se reimplementa aquí.)
 *
 * **QUIEN TOQUE UNA TIENE QUE TOCAR LA OTRA.** No es una recomendación: la
 * paridad se MIDE en `mes.integration.test.ts`, que compara las dos
 * implementaciones sobre los 36 meses de 2026 a 2028 y sobre los 36 días
 * siguientes a cada cierre, contra la base real. Una divergencia en cualquiera
 * de esos casos es un fallo, nunca un aviso.
 *
 * ── POR QUÉ SE ACEPTÓ LA DUPLICACIÓN ──────────────────────────────────────
 *
 * Porque **la base decide cuándo cierra y la pantalla dice cuándo cierra**, y
 * son dos sitios con dos necesidades distintas:
 *
 *   · El CIERRE corre dentro de Postgres, agrega decenas de aseos y no tiene sus
 *     filas en memoria.
 *   · La PANTALLA tiene que rotular el periodo ANTES de pedir nada, y no puede
 *     hacer un viaje a la base para escribir una cabecera.
 *
 * La Fase 6 midió una divergencia real el primer día que corrió su test de
 * paridad, y el síntoma fue que el dashboard decía una cosa y el teléfono otra.
 * Aquí sería peor: como un periodo cerrado NO SE RECALCULA NUNCA (D7-3), una
 * divergencia de un solo día se queda en el histórico y le cambia el pago a
 * alguien para siempre.
 *
 * ── LAS TRES REGLAS, COMPLETAS ────────────────────────────────────────────
 *
 *   1. **SIN FESTIVOS.** Solo se retrocede si el último día del mes cae en
 *      sábado o en domingo. Es decisión explícita del ROADMAP ("último día
 *      laboral, sin festivos") y la base hace lo mismo. Una librería de días
 *      hábiles aquí INTRODUCE el defecto en vez de evitarlo: movería la fecha de
 *      cierre respecto a lo que el requisito pide, y esa fecha la ve quien
 *      cobra. `mes.test.ts` lo fija con el 30 de junio de 2025, que es lunes Y
 *      festivo colombiano, y aun así cierra ahí.
 *
 *   2. **EL PERIODO VA DE CIERRE A CIERRE** (D7-5), no del 1 a fin de mes. Un
 *      día POSTERIOR al cierre de su propio mes pertenece al periodo del mes
 *      SIGUIENTE. Esa regla es la mitad del valor de D7-5: sin ella, los días
 *      entre el cierre y el fin del mes calendario no pertenecerían a ningún
 *      periodo, y un aseo terminado ahí no lo pagaría nadie.
 *
 *   3. **LA ETIQUETA LLEVA SIEMPRE LAS DOS FECHAS**, también cuando el periodo
 *      coincide con el mes calendario completo. Un formato que cambia según el
 *      caso obliga a leer con atención justo el día en que no coincide, que es
 *      el día en que alguien reclama (UI-SPEC §11.3).
 *
 * ── ESTE MÓDULO NO ES EL DEL RESUMEN ──────────────────────────────────────
 *
 * La palabra "mes" significa dos cosas distintas (UI-SPEC §6.2.1). En el RESUMEN
 * es el mes calendario, y vive en `lib/domain/periodo.ts`. Aquel módulo NO
 * importa este, y este NO importa aquel. Compartir función es cómo terminan
 * compartiendo error, y el error sería el admin transfiriendo plata calculada
 * sobre un rango que la persona no cobró.
 *
 * ── PURO, Y SIN RELOJ ─────────────────────────────────────────────────────
 *
 * Ninguna función de aquí lee el reloj del proceso. El día de referencia llega
 * SIEMPRE por argumento, desde `hoyBog()` o desde una columna `date` de la base.
 * El proceso corre en tiempo universal, y pasadas las 19:00 de Bogotá un reloj
 * leído aquí ya dice mañana.
 * ════════════════════════════════════════════════════════════════════════════
 */

import {
  diaDeLaSemana,
  formatFechaLargaBog,
  primeroDelMes,
  sumarDias,
  ultimoDiaDelMes,
} from './dates';

/** Domingo y sábado en la numeración de `diaDeLaSemana`, que es la de `Date`. */
const DOMINGO = 0;
const SABADO = 6;

/**
 * El día de cierre del mes al que pertenece `diaISO`: el último día del mes,
 * retrocedido al viernes si cae en sábado o en domingo.
 *
 * Recibe CUALQUIER día del mes, no el primero: el llamante casi nunca lo tiene a
 * mano. Entra y sale `'YYYY-MM-DD'`.
 *
 * El domingo retrocede DOS días, no uno. Una implementación que reste un día
 * fijo cuando el último es fin de semana devuelve el sábado, que tampoco es
 * hábil, y falla en los meses que terminan en domingo sin que nada lo diga.
 *
 * Gemelo de `public.ultimo_dia_habil_del_mes(date)`, que expresa lo mismo con
 * `isodow` (6 sábado, 7 domingo) porque en SQL esa es la numeración calificable
 * por esquema. Aquí se usa la de `Date`, donde domingo es 0.
 */
export function ultimoDiaHabilDelMes(diaISO: string): string {
  const ultimo = ultimoDiaDelMes(diaISO);
  const dia = diaDeLaSemana(ultimo);

  if (dia === SABADO) return sumarDias(ultimo, -1);
  if (dia === DOMINGO) return sumarDias(ultimo, -2);
  return ultimo;
}

/** Un periodo de pago, con los dos extremos INCLUIDOS. */
export type PeriodoDePago = { desde: string; hasta: string };

/**
 * El periodo de pago que CONTIENE `diaISO`, con los dos extremos incluidos.
 *
 * Tres reglas, y la tercera es la que importa:
 *
 *   · `hasta` es el día de cierre del mes del argumento.
 *   · `desde` es el día SIGUIENTE al cierre del mes ANTERIOR.
 *   · Si el día es POSTERIOR al cierre de su propio mes, el periodo que lo
 *     contiene es el del mes SIGUIENTE, y entonces empieza al día siguiente del
 *     cierre de su propio mes.
 *
 * La comparación de los extremos es `<=` y no `<` en los dos lados: el día de
 * cierre pertenece a SU periodo, no al siguiente. Una comparación estricta ahí
 * manda el trabajo del último día al periodo siguiente y una persona cobra de
 * menos, que es justo el caso del aseo terminado a las 23:30 del día del cierre.
 *
 * Consecuencia medida y que da sentido a todo esto: dos periodos consecutivos
 * son CONTIGUOS y NO SE SOLAPAN. Un hueco de un día es trabajo que nadie paga;
 * un día solapado es trabajo que se paga dos veces. Los dos son invisibles en
 * una pantalla y los dos cuestan dinero real.
 *
 * Gemelo de `public.periodo_de_cierre(date)`, con la misma estructura de caso
 * para que las dos se puedan leer en paralelo.
 */
export function periodoDeCierre(diaISO: string): PeriodoDePago {
  const cierrePropio = ultimoDiaHabilDelMes(diaISO);

  // Comparación lexicográfica de cadenas `'YYYY-MM-DD'`, que para este formato
  // coincide con el orden cronológico. No hace falta construir ningún instante.
  if (diaISO <= cierrePropio) {
    const finDelMesAnterior = sumarDias(primeroDelMes(diaISO), -1);
    return {
      desde: sumarDias(ultimoDiaHabilDelMes(finDelMesAnterior), 1),
      hasta: cierrePropio,
    };
  }

  const primeroDelMesSiguiente = sumarDias(ultimoDiaDelMes(diaISO), 1);
  return {
    desde: sumarDias(cierrePropio, 1),
    hasta: ultimoDiaHabilDelMes(primeroDelMesSiguiente),
  };
}

/**
 * La etiqueta de un periodo de pago (UI-SPEC §11.3):
 *
 *   `Del 1 al 30 de enero de 2026`                      mismo mes
 *   `Del 31 de enero al 27 de febrero de 2026`          cruza el mes
 *   `Del 30 de diciembre de 2028 al 31 de enero de 2029` cruza el año
 *
 * SIEMPRE las dos fechas, también cuando el periodo coincide con el mes
 * calendario completo: `Del 1 al 31 de diciembre de 2026`, nunca `diciembre`.
 *
 * El periodo que CRUZA EL MES no es la excepción: con D7-5 ocurre cada vez que
 * el mes anterior termina en fin de semana, que es un tercio de los meses. Por
 * eso la forma de dos meses no es un caso especial de la función, es una de sus
 * tres ramas.
 *
 * `conAnio` por defecto es verdadero, que es la forma del admin. La tarjeta del
 * aseador lo pasa en falso. QUIÉN decide eso es el llamante y no este módulo:
 * saberlo exige conocer el día de hoy, y un módulo de formato que lee el reloj
 * es la dependencia oculta que `lib/domain/dates.ts` existe para evitar.
 *
 * EXCEPCIÓN DECLARADA: cuando el periodo cruza el AÑO, los dos años se escriben
 * aunque `conAnio` venga en falso. `Del 30 de diciembre al 31 de enero` no es
 * escueto, es falso: sitúa los dos meses en el mismo año. Omitir el año es una
 * elección de densidad, y aquí perdería un dato.
 */
export function etiquetaDePeriodoDePago(
  desde: string,
  hasta: string,
  conAnio: boolean = true,
): string {
  const anoDesde = desde.slice(0, 4);
  const anoHasta = hasta.slice(0, 4);
  const cruzaElAno = anoDesde !== anoHasta;
  const mismoMes = desde.slice(0, 7) === hasta.slice(0, 7);

  // El día sin cero a la izquierda: `'01'` se escribe `1`.
  const diaDesde = String(Number(desde.slice(8, 10)));

  if (cruzaElAno) {
    return `Del ${formatFechaLargaBog(desde)} de ${anoDesde} al ${formatFechaLargaBog(hasta)} de ${anoHasta}`;
  }

  // `formatFechaLargaBog` produce `"30 de enero"`, que es la mitad derecha de las
  // dos formas de abajo. Se reutiliza y no se compone a mano: es el único sitio
  // del repo donde se formatea una fecha.
  const cuerpo = mismoMes
    ? `Del ${diaDesde} al ${formatFechaLargaBog(hasta)}`
    : `Del ${formatFechaLargaBog(desde)} al ${formatFechaLargaBog(hasta)}`;

  return conAnio ? `${cuerpo} de ${anoHasta}` : cuerpo;
}
