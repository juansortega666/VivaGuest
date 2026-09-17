/**
 * ARITMÉTICA DE CHECKOUTS, SOBRE CADENAS `'YYYY-MM-DD'` Y SOLO SOBRE CADENAS.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * QUÉ ES UN CHECKOUT AQUÍ, Y POR QUÉ NO SE LE RESTA UN DÍA.
 *
 * Es `public.calendar_reservations.ends_on`, y su comentario en la migración 04
 * lo dice literal: *"DTEND del VEVENT de día completo. Es EXCLUSIVO: coincide
 * con la fecha del aseo. No restar un día."*
 *
 * El reflejo natural de quien lee un calendario es corregir ese "exclusivo"
 * restando uno, porque en un rango `[inicio, fin)` el último día ocupado es el
 * anterior. **Aquí no se corrige**: la fecha que interesa no es la última noche
 * del huésped, es el día en que se va, que es el día del aseo. Restar un día
 * programa todos los aseos con 24 horas de adelanto.
 *
 * ── POR QUÉ CADENAS Y NO EL TIPO TEMPORAL DEL LENGUAJE ────────────────────
 *
 * `ends_on` es un `date`: un DÍA CALENDARIO DE NEGOCIO, no un instante. Una
 * cadena ISO de solo fecha convertida a instante se fija en medianoche de
 * tiempo universal, y en Bogotá (UTC-5) eso son las 19:00 del día ANTERIOR: el
 * 4 de septiembre se pinta como 3. Es el mismo defecto que CLAUDE.md documenta
 * para `fecha_aseo` y la razón por la que esa columna es `date`.
 *
 * Por eso **en este archivo no se construye un objeto temporal ni una sola
 * vez**, y hay un grep de aceptación que lo comprueba con conteo cero
 * (UI-SPEC §14.4, que lo prohíbe por nombre). El formato se toca con `split`,
 * con `slice` y con comparación de cadenas.
 *
 * ── LA COMPARACIÓN LEXICOGRÁFICA NO ES UN TRUCO ───────────────────────────
 *
 * `'2026-09-04' < '2026-09-18'` es cierto, y lo es por construcción del
 * formato: cuatro dígitos de año, dos de mes y dos de día, todos con cero a la
 * izquierda y en orden de significancia decreciente. Para ESE formato el orden
 * alfabético y el cronológico son el mismo orden, sin excepciones y también
 * cruzando el mes y el año. `lib/domain/mes.ts` ya se apoya en la misma
 * propiedad, con el mismo comentario, en su comparación de extremos de periodo.
 *
 * ── PURO, Y SIN RELOJ ─────────────────────────────────────────────────────
 *
 * Ninguna función de aquí lee el reloj del proceso. El día de hoy llega SIEMPRE
 * por argumento, desde `hoyBog()`. El proceso corre en tiempo universal y
 * pasadas las 19:00 de Bogotá un reloj leído aquí ya dice mañana, que movería
 * el "próximo checkout" un día entero durante las cinco horas más tranquilas de
 * la noche.
 * ════════════════════════════════════════════════════════════════════════════
 */

/**
 * El primer checkout que viene, contando hoy: la fecha MÍNIMA mayor o igual a
 * `hoy`, o `null` si no queda ninguno.
 *
 * MAYOR O IGUAL, no estrictamente mayor. El checkout de hoy es justamente el
 * aseo que el admin está mirando; saltárselo pondría el panel a hablar del de
 * la semana que viene mientras alguien limpia.
 *
 * NO SUPONE QUE LA LISTA VENGA ORDENADA, aunque la lectura traiga su `order
 * by`: si lo supusiera, un `select` al que un día se le caiga el orden daría un
 * panel silenciosamente falso en vez de un error. Es un barrido, no un
 * `sort`, porque ordenar para quedarse con uno es tirar trabajo.
 */
export function proximoCheckout(checkouts: readonly string[], hoy: string): string | null {
  let minimo: string | null = null;

  for (const fecha of checkouts) {
    if (fecha < hoy) continue;
    if (minimo === null || fecha < minimo) minimo = fecha;
  }

  return minimo;
}

/**
 * Los checkouts de un mes calendario, ordenados. El mes llega como `'YYYY-MM'`.
 *
 * El filtro es un PREFIJO (`slice(0, 7)`), no un "está entre el primero y el
 * último del mes": los extremos exigirían saber cuántos días tiene el mes, que
 * es exactamente donde falla febrero, y no aportan nada que el prefijo no dé.
 *
 * Devuelve SIEMPRE una lista, vacía cuando no hay ninguno. Nunca `null`: el
 * componente pinta el vacío de §15.2 con un `length === 0` y no tiene que
 * distinguir "no hay" de "no se sabe".
 *
 * No deduplica. Dos reservas distintas que terminen el mismo día son dos
 * checkouts el mismo día, y esconder uno sería una decisión de producto que
 * nadie tomó.
 */
export function checkoutsDelMes(checkouts: readonly string[], mes: string): string[] {
  return checkouts.filter((fecha) => fecha.slice(0, 7) === mes).sort();
}

/** Los tres rótulos de la línea de apoyo del próximo checkout (UI-SPEC §8.2). */
export type ClaveDeDistancia = 'hoy' | 'manana' | 'en-dias';

/**
 * Cuánto falta para un checkout, en la forma que la pantalla necesita.
 *
 * Lleva la CLAVE y el NÚMERO, nunca el texto. El copy de §15.2 (`hoy`,
 * `mañana`, `dentro de {N} días`) vive en el componente, que es la misma
 * disciplina de `estadoDeAseo()` y `estadoDeApartamento()`: así el módulo se
 * prueba sin arrastrar el contrato de copywriting.
 *
 * `dias` viaja también con `hoy` y con `manana`, aunque el copy de esas dos no
 * lo use: el consumidor no tiene que reconstruirlo para un `title` ni para un
 * `aria-label`.
 */
export type DistanciaHastaCheckout = { clave: ClaveDeDistancia; dias: number };

/** Milisegundos de un día. Solo aparece en la resta de abajo. */
const UN_DIA_MS = 86_400_000;

/**
 * Días de calendario entre dos días de negocio, con los dos extremos anclados
 * en el mismo punto fijo.
 *
 * AQUÍ SÍ SE HACE ARITMÉTICA CON UN INSTANTE, Y ES CORRECTO. Lo que la regla
 * del proyecto prohíbe es convertir la CADENA ENTERA, que se interpreta como
 * medianoche de tiempo universal y desplaza el día en Bogotá. Esto es otra
 * cosa: son componentes YA resueltos (los parte el `split`), anclados
 * explícitamente con `Date.UTC`, que devuelve un NÚMERO y no construye nada.
 * Las dos puntas llevan el mismo ancla, así que la resta es un múltiplo exacto
 * de un día y ninguna zona horaria participa. Es la misma excepción que
 * `sumarDias()` y `diaDeLaSemana()` de `lib/domain/dates.ts` ya declararon.
 *
 * SE HACE ASÍ Y NO RESTANDO LOS NÚMEROS DE DÍA: del 30 de septiembre al 2 de
 * octubre son dos días, y `2 - 30` da veintiocho negativos. El cruce de mes y
 * el año bisiesto son los dos casos donde la resta a pelo falla, y los dos
 * están escritos en el test.
 *
 * NO VIVE EN `lib/domain/dates.ts`: allí las funciones que se mudaron lo
 * hicieron porque DOS módulos las necesitaban (y está escrito en su cabecera).
 * Esta la necesita uno solo. El día que haya un segundo consumidor, se mueve.
 */
function diasDeCalendarioEntre(desde: string, hasta: string): number {
  const [anoDesde, mesDesde, diaDesde] = desde.split('-').map(Number);
  const [anoHasta, mesHasta, diaHasta] = hasta.split('-').map(Number);

  const inicio = Date.UTC(anoDesde, mesDesde - 1, diaDesde);
  const fin = Date.UTC(anoHasta, mesHasta - 1, diaHasta);

  return Math.round((fin - inicio) / UN_DIA_MS);
}

/**
 * La distancia hasta un checkout: la clave del rótulo y los días que faltan.
 *
 * `mañana` tiene clave PROPIA y no es un caso de `dentro de {N} días` con N a
 * uno, porque `dentro de 1 días` es agramatical y `dentro de 1 día` obligaría
 * al componente a concordar el número. La concordancia se resuelve donde se
 * decide el vocabulario, que es el contrato de copy, no aquí.
 *
 * LANZA si el checkout es anterior a hoy. Por construcción no puede llegar
 * uno: lo único que se le pasa es la salida de `proximoCheckout()`, que nunca
 * devuelve una fecha pasada. Se lanza en vez de inventar un rótulo porque
 * `dentro de -2 días` no significa nada para quien mira la pantalla, y un panel
 * que miente sobre una fecha es peor que un panel que se cae: la promesa del
 * producto es que ningún aseo se pierda. Misma decisión que `estadoDeAseo()`
 * con un aseo gestionado sin estado, y lo que hace medible el orden.
 */
export function distanciaHastaCheckout(
  checkout: string,
  hoy: string,
): DistanciaHastaCheckout {
  const dias = diasDeCalendarioEntre(hoy, checkout);

  if (dias < 0) {
    throw new Error(
      `distanciaHastaCheckout: ${checkout} es anterior a hoy (${hoy}) y no tiene rótulo`,
    );
  }

  if (dias === 0) return { clave: 'hoy', dias };
  if (dias === 1) return { clave: 'manana', dias };
  return { clave: 'en-dias', dias };
}
