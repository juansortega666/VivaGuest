/**
 * Generador de fixtures iCal con fechas RELATIVAS a un día dado.
 *
 * Por qué existe: la ventana protegida del reconcile destructivo se define
 * respecto a HOY. Una fixture con fechas literales que hoy cae dentro de la
 * ventana mañana cae fuera, y el test que la usa deja de probar lo que decía
 * probar sin que nada se ponga rojo. Es la regla de fixtures relativas que fijó
 * el plan 02-14. Las fixtures `.ics` versionadas de este directorio siguen
 * siendo la fuente de verdad del FORMATO; esta función es la fuente de las
 * FECHAS cuando la fecha es lo que se está probando.
 *
 * EXCEPCIÓN DELIBERADA AL GUARDARRAÍL 10 DE CI, y por eso está escrita aquí:
 * este módulo usa `Date.UTC` para la aritmética de días sobre el calendario
 * gregoriano. Es legítimo por tres razones concretas:
 *
 *   1. No vive bajo `lib/domain/ical*.ts`, que es el alcance del guardarraíl.
 *      No es código del parser: es código que fabrica entrada para los tests.
 *   2. No está en el camino que produce la fecha del aseo. Nada de lo que
 *      calcula aquí llega a `cleanings.scheduled_date`.
 *   3. Su salida es una cadena de ocho dígitos, nunca un objeto temporal. El
 *      valor temporal muere dentro de `sumarDias()`; ningún consumidor lo ve.
 *
 * El parser de verdad NO puede hacer esto: convertir un `DTEND;VALUE=DATE` a un
 * objeto temporal lo ancla a medianoche UTC y, formateado al día de Bogotá,
 * retrocede un día. De los ocho dígitos crudos a la forma con guiones se llega
 * con un corte de cadena.
 */

/** Prefijo de anuncio del feed real anonimizado. Se conserva para que la
 *  estructura del `UID` sea la misma: `<prefijo>-<sufijo>@airbnb.com`. */
const PREFIJO_ANUNCIO = 'a1b2c3d4e5f6';

/** Mismo `DTSTAMP` que el feed real capturado el 2026-09-02. */
const DTSTAMP = '20260902T175137Z';

/** Noches de estadía por defecto: el `DTSTART` es el `DTEND` menos esto. */
const NOCHES_POR_DEFECTO = 2;

/** Longitud de línea del feed real, medida: 75 octetos con continuación por
 *  espacio inicial (RFC 5545 §3.1). */
const OCTETOS_POR_LINEA = 75;

function esFechaIso(valor: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor);
}

/**
 * Suma `dias` a una fecha `'YYYY-MM-DD'` y devuelve `'YYYYMMDD'`, la forma
 * cruda del `VALUE=DATE` de un VEVENT.
 */
function sumarDias(fechaIso: string, dias: number): string {
  const anio = Number(fechaIso.slice(0, 4));
  const mes = Number(fechaIso.slice(5, 7));
  const dia = Number(fechaIso.slice(8, 10));
  const ms = Date.UTC(anio, mes - 1, dia) + dias * 86_400_000;
  const d = new Date(ms);
  const y = String(d.getUTCFullYear()).padStart(4, '0');
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${dd}`;
}

/**
 * El día `hoyIso + dias` en las DOS formas que un test necesita: la cruda de
 * ocho dígitos, que es la que lleva el `DTEND` de un VEVENT, y la de negocio con
 * guiones, que es la que guarda `cleanings.scheduled_date`.
 *
 * Se exporta desde AQUÍ y no se reimplementa en el arnés de pruebas a
 * propósito: la aritmética de días con el tipo temporal de JavaScript es la
 * excepción consentida de este módulo (ver la cabecera), y tenerla en un solo
 * sitio es lo que impide que reaparezca por la puerta de atrás en un archivo
 * que sí está en el camino de la fecha del aseo.
 *
 * La forma con guiones sale de un CORTE DE CADENA sobre los ocho dígitos, nunca
 * de formatear un objeto temporal: formatearlo al día de Bogotá devolvería el
 * día anterior.
 */
export function diaRelativo(hoyIso: string, dias: number): { crudo: string; iso: string } {
  if (!esFechaIso(hoyIso)) {
    throw new Error(`hoyIso debe ser 'YYYY-MM-DD', llegó: ${hoyIso}`);
  }
  const crudo = sumarDias(hoyIso, dias);
  return { crudo, iso: `${crudo.slice(0, 4)}-${crudo.slice(4, 6)}-${crudo.slice(6, 8)}` };
}

/** Sufijo hexadecimal de 32 caracteres, determinista a partir del índice. */
function sufijoUid(indice: number): string {
  let h = 0x811c9dc5;
  for (const ch of `vivaguest-fixture-${indice}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const base = h.toString(16).padStart(8, '0');
  return (base + base + base + base).slice(0, 32);
}

/** Código de reserva del estilo de Airbnb: `HM` más ocho alfanuméricos. */
function codigoReserva(indice: number): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let n = (indice + 1) * 2654435761;
  let out = '';
  for (let i = 0; i < 8; i += 1) {
    out += alfabeto[n % alfabeto.length];
    n = Math.floor(n / alfabeto.length) + indice + 7;
  }
  return `HM${out}`;
}

/** Pliega una línea lógica a 75 octetos con continuación por espacio inicial. */
function plegar(linea: string): string[] {
  const bytes = new TextEncoder().encode(linea);
  if (bytes.length <= OCTETOS_POR_LINEA) return [linea];
  const decoder = new TextDecoder();
  const salida = [decoder.decode(bytes.slice(0, OCTETOS_POR_LINEA))];
  let resto = bytes.slice(OCTETOS_POR_LINEA);
  while (resto.length > 0) {
    salida.push(` ${decoder.decode(resto.slice(0, OCTETOS_POR_LINEA - 1))}`);
    resto = resto.slice(OCTETOS_POR_LINEA - 1);
  }
  return salida;
}

export type OpcionesFeedRelativo = {
  /** Noches de cada estadía. Fija la distancia entre `DTSTART` y `DTEND`. */
  noches?: number;
  /** Últimos 4 dígitos que se escriben en el `DESCRIPTION`. El feed real los
   *  trae y el normalizador tiene que descartarlos: la fixture los incluye a
   *  propósito para que el test de privacidad tenga algo que NO encontrar. */
  telefono?: string;
};

/**
 * Construye un feed iCal de Airbnb con un checkout por cada offset.
 *
 * @param offsets Días respecto a `hoyIso` en los que cae cada `DTEND`. Un `0`
 *   produce la reserva que termina HOY, que es el caso de la ventana protegida;
 *   un negativo produce un checkout pasado.
 * @param hoyIso  Día de referencia en `'YYYY-MM-DD'`. Lo aporta el test, nunca
 *   el reloj del sistema: un test que lee el reloj no es determinista.
 * @returns El texto del `.ics`, con finales de línea LF y plegado a 75 octetos.
 */
export function feedConCheckoutRelativo(
  offsets: number[],
  hoyIso: string,
  opciones: OpcionesFeedRelativo = {},
): string {
  if (!esFechaIso(hoyIso)) {
    throw new Error(`hoyIso debe ser 'YYYY-MM-DD', llegó: ${hoyIso}`);
  }
  const noches = opciones.noches ?? NOCHES_POR_DEFECTO;
  if (!Number.isInteger(noches) || noches < 1) {
    throw new Error(`noches debe ser un entero >= 1, llegó: ${String(noches)}`);
  }
  const telefono = opciones.telefono ?? '2370';

  const lineas: string[] = [
    'BEGIN:VCALENDAR',
    'PRODID:-//Airbnb Inc//Hosting Calendar 1.0//EN',
    'CALSCALE:GREGORIAN',
    'VERSION:2.0',
  ];

  offsets.forEach((offset, indice) => {
    const fin = sumarDias(hoyIso, offset);
    const inicio = sumarDias(hoyIso, offset - noches);
    const codigo = codigoReserva(indice);
    lineas.push(
      ...plegar('BEGIN:VEVENT'),
      ...plegar(`DTSTAMP:${DTSTAMP}`),
      ...plegar(`DTSTART;VALUE=DATE:${inicio}`),
      ...plegar(`DTEND;VALUE=DATE:${fin}`),
      ...plegar('SUMMARY:Reserved'),
      ...plegar(`UID:${PREFIJO_ANUNCIO}-${sufijoUid(indice)}@airbnb.com`),
      ...plegar(
        'DESCRIPTION:Reservation URL: https://www.airbnb.com/hosting/' +
          `reservations/details/${codigo}\\nPhone Number (Last 4 Digits): ${telefono}`,
      ),
      ...plegar('END:VEVENT'),
    );
  });

  lineas.push('END:VCALENDAR');
  return `${lineas.join('\n')}\n`;
}

/**
 * Los códigos de reserva que `feedConCheckoutRelativo` va a emitir, en orden.
 * Un test que quiera afirmar "el código X produjo el aseo del día Y" los
 * necesita sin volver a parsear el feed que él mismo generó.
 */
export function codigosDe(offsets: number[]): string[] {
  return offsets.map((_, indice) => codigoReserva(indice));
}
