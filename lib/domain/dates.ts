/**
 * Formato de fechas y horas de negocio. UNICO sitio donde se formatea una fecha para
 * pantalla (UI-SPEC §8.4).
 *
 * REGLA TRANSVERSAL: las fechas de negocio viajan como cadena `'YYYY-MM-DD'`, nunca como
 * `Date`. En la base son `date` y se resuelven con `public.today_bog()`, nunca con
 * `current_date` (la sesion corre en UTC: pasadas las 19:00 de Bogota `current_date` ya
 * es manana). `TZ_BOGOTA` de `lib/domain/constants.ts` es la unica constante de zona del
 * repo, y aqui no hace falta usarla porque no se convierte ningun instante: se formatean
 * los componentes del dia calendario tal como llegan.
 *
 * PROHIBIDO `new Date('2026-09-04')`: un string ISO de solo fecha se parsea como
 * medianoche UTC y en Bogota (UTC-5) renderiza el dia anterior (research Pitfall 10). Por
 * eso abajo se parte el string en numeros y se formatea anclando ida y vuelta a un mismo
 * punto fijo: `Date.UTC` para construir y `timeZone: 'UTC'` para formatear. Ese `'UTC'`
 * no es una zona de negocio (la unica es `TZ_BOGOTA`), es el ancla que hace que la salida
 * no dependa de la zona del servidor: el mismo string entra y sale igual en Vercel, en
 * CI y en el portatil del que programa.
 */

import { TZ_BOGOTA } from './constants';

/**
 * Se construye una vez: instanciar `Intl.DateTimeFormat` por fila es caro, y ademas un
 * formateador sin `timeZone` explicito congelaria la zona del proceso al importar el
 * modulo, que es una dependencia oculta y desagradable de depurar.
 */
const FECHA_CORTA = new Intl.DateTimeFormat('es-CO', {
  weekday: 'short',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

/**
 * Formatea una fecha de negocio `'YYYY-MM-DD'`: `'2026-09-04'` produce
 * `"vie, 4 de septiembre"`.
 *
 * No lleva ano a proposito: todo lo que muestra esta fase es del mes en curso o del
 * siguiente. Si algun dia hace falta el ano, se anade un formateador aparte, no un
 * parametro a este.
 */
export function formatFechaBog(iso: string): string {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return FECHA_CORTA.format(new Date(Date.UTC(ano, mes - 1, dia)));
}

/**
 * Igual que `FECHA_CORTA` pero para leer el dia calendario de Bogota a partir de un
 * instante. `TZ_BOGOTA` es la unica constante de zona del repo y esta es la unica
 * conversion instante -> dia que hace falta en la fase.
 */
const HOY_BOGOTA = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: TZ_BOGOTA,
});

/**
 * El dia de negocio de HOY en Bogota, como `'YYYY-MM-DD'`.
 *
 * Es el equivalente en TypeScript de `public.today_bog()`, y existe por la misma
 * razon: el proceso corre en UTC (Vercel y el CI) y pasadas las 19:00 de Bogota un
 * `new Date().toISOString().slice(0,10)` ya devuelve MANANA. En APTO-12 eso movería
 * el "proximo checkout" un dia entero durante las cinco horas mas tranquilas de la
 * noche, que es cuando nadie lo estaria mirando para descubrirlo.
 *
 * `en-CA` no es una locale de negocio: es el truco estandar para que
 * `Intl.DateTimeFormat` emita ISO `YYYY-MM-DD` directamente. Restarle cinco horas a
 * `Date.now()` a mano tambien funciona hoy —Colombia no tiene DST desde 1993— pero
 * codifica el offset en vez de la zona, y este es el sitio donde no hay que hacerlo.
 */
export function hoyBog(): string {
  return HOY_BOGOTA.format(new Date());
}

/**
 * `DTSTAMP` de un `VCALENDAR` en su forma UTC basica: `20260901T120000Z`.
 * Airbnb lo emite siempre asi. Cualquier otra forma se ignora.
 */
const RE_DTSTAMP_UTC = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/;

/**
 * Horas enteras transcurridas desde el `DTSTAMP` del feed. Alimenta la linea
 * `El feed se actualizo hace 2 h.` del estado 4 (UI-SPEC §10.3).
 *
 * Devuelve `null` si el feed no trae `DTSTAMP` o si viene en una forma que no es
 * la UTC basica: la linea es OPCIONAL y el UI-SPEC ya la condiciona, asi que
 * adivinar un valor seria peor que omitirla.
 *
 * AQUI SI SE CONSTRUYE UN `Date`, y es correcto: `DTSTAMP` es un INSTANTE con su
 * `Z`, no un dia calendario. La prohibicion de `Date` de `ical-preview.ts` aplica
 * a `DTEND`, que es un dia de negocio y donde un `Date` produce el off-by-one.
 * Se usa `Date.UTC` en vez de `new Date(cadena)` porque el formato basico de
 * RFC 5545 (sin guiones ni dos puntos) no es ISO 8601 extendido y su parseo por
 * `Date` no esta especificado.
 */
export function horasDesdeDtstamp(dtstamp: string | null, ahoraMs: number): number | null {
  if (!dtstamp) return null;

  const m = RE_DTSTAMP_UTC.exec(dtstamp.trim());
  if (!m) return null;

  const [, ano, mes, dia, hh, mm, ss] = m.map(Number) as unknown as number[];
  const instante = Date.UTC(ano, mes - 1, dia, hh, mm, ss);

  const horas = Math.floor((ahoraMs - instante) / 3_600_000);

  // Un feed con el reloj adelantado daria negativo. Se trunca a 0: "hace 0 h" es
  // cierto y "hace -3 h" no significa nada para quien mira la pantalla.
  return horas < 0 ? 0 : horas;
}

/**
 * Formatea la `hora_limite` que PostgREST devuelve para una columna `time`:
 * `'11:30:00'` produce `"11:30"`.
 *
 * Es un recorte de string, no un formateo: 24 horas, sin AM/PM y sin locale. Meter `Intl`
 * aqui traeria `a. m.`/`p. m.` en es-CO, que es justo lo que no se quiere en una hora
 * limite operativa.
 */
export function formatHoraLimite(t: string): string {
  const [hh, mm] = t.split(':');
  return `${hh}:${mm}`;
}
