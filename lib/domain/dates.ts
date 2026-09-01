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
