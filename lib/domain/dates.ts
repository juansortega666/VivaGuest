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
 * Igual que `FECHA_CORTA` pero SIN el dia de la semana: `"8 de septiembre"`.
 *
 * Existe como formateador aparte y no como parametro de `formatFechaBog()` por la
 * regla que ya estaba escrita arriba para el ano: cuando hace falta otra forma, se
 * anade un formateador, no una bandera.
 *
 * Y hace falta por una razon concreta, no por gusto: el `title` de la columna
 * `AVISOS` de `/aseadores` (05-UI-SPEC §5.2) dice literal `Activos desde el
 * {fecha}.`, y `formatFechaBog()` produce `"mar, 8 de septiembre"`, que detras de
 * "el" es agramatical. Mismo ancla de UTC que el resto del archivo: entra y sale un
 * dia calendario, sin conversion de zona.
 */
const FECHA_LARGA = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

/**
 * Formatea una fecha de negocio `'YYYY-MM-DD'` sin dia de la semana:
 * `'2026-09-08'` produce `"8 de septiembre"`.
 *
 * Sin ano, por lo mismo que `formatFechaBog()`.
 */
export function formatFechaLargaBog(iso: string): string {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return FECHA_LARGA.format(new Date(Date.UTC(ano, mes - 1, dia)));
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
 * El dia de negocio de BOGOTA al que pertenece un instante, como `'YYYY-MM-DD'`.
 *
 * Es `hoyBog()` con el instante por parametro en vez de leido del reloj, y usa el
 * MISMO formateador, que es justo la razon por la que vive aqui y no en quien la
 * llama: la unica constante de zona del repo es `TZ_BOGOTA` y este archivo es el
 * unico sitio donde se convierte un instante en un dia calendario.
 *
 * La necesita el historial del apartamento (DASH-06): `damages.created_at` es un
 * `timestamptz` y hay que mezclarlo cronologicamente con `cleanings.scheduled_date`,
 * que es un `date`. El error obvio ahi es `created_at.slice(0, 10)`, que devuelve
 * el dia de UTC: un dano reportado a las 21:00 de Bogota se pintaria en el dia
 * SIGUIENTE, y ademas saltaria por encima del aseo con el que se reporto.
 *
 * Devuelve `null` si la marca es nula o ilegible, misma regla que `tiempoRelativo`:
 * inventar un 1970 pondria la entrada al final de la lista sin que nada lo diga.
 */
export function diaBog(instante: number | string | null | undefined): string | null {
  const ms = aMilisegundos(instante);
  if (ms === null) return null;
  return HOY_BOGOTA.format(new Date(ms));
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

/**
 * Abreviaturas de mes de la fecha corta, en tabla EXPLICITA y no salidas de `Intl`.
 *
 * MEDIDO el 2026-09-03 con el Node de este repo:
 * `new Intl.DateTimeFormat('es-CO', { day:'numeric', month:'short', timeZone:'UTC' })`
 * devuelve `"3 de sept"`, con el literal ` de ` en medio y con `sept` de cuatro letras.
 * El contrato de UI-SPEC §9 pide `3 sep` y ese ancho (176px de carril) no admite ni el
 * `de` ni la cuarta letra.
 *
 * Y hay una segunda razon, mas de fondo: la abreviatura de `Intl` la fija la version de
 * ICU del runtime. Vercel, el CI y el portatil no tienen por que traer la misma, y una
 * fecha que cambia de forma segun donde corra el proceso es exactamente la clase de
 * dependencia oculta que el resto de este archivo existe para evitar.
 */
const MESES_CORTOS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
] as const;

/**
 * Fecha corta de negocio: `'2026-09-03'` produce `"3 sep"`.
 *
 * Es la de las filas de la bandeja "Sin confirmar" (UI-SPEC §9), donde `formatFechaBog()`
 * (`"jue, 3 de septiembre"`) no cabe.
 *
 * PROHIBIDO `new Date('2026-09-03')`, misma regla que el resto del archivo: un string ISO
 * de solo fecha se parsea como medianoche UTC y en Bogota renderiza el dia anterior.
 * Aqui ni siquiera se construye un `Date`: se parte el string y se indexa la tabla de
 * meses, asi que la salida no puede depender de la zona del proceso ni por accidente.
 */
export function formatFechaCortaBog(iso: string): string {
  const [, mes, dia] = iso.split('-').map(Number);
  return `${dia} ${MESES_CORTOS[mes - 1]}`;
}

/**
 * Hora del reloj de Bogota a partir de un instante: `"14:20"`.
 *
 * `hour12: false` en es-CO da el ciclo h23 (medianoche es `00:00`, no `24:00`), medido.
 * Y sin `Intl` no se puede: hace falta la zona, porque aqui SI se convierte un instante.
 */
const HORA_BOGOTA = new Intl.DateTimeFormat('es-CO', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: TZ_BOGOTA,
});

/** Milisegundos de los tres cortes de `tiempoRelativo`. */
const UN_MINUTO = 60_000;
const UNA_HORA = 3_600_000;

/**
 * Tiempo transcurrido desde un instante, en la forma corta de la cabecera de `/operacion`
 * (UI-SPEC §13.1 y §13.2).
 *
 * Escalones, en orden:
 *   - bajo un minuto  -> `hace 40 s`   (§13.2 lo muestra literalmente asi)
 *   - bajo una hora   -> `hace 8 min`
 *   - mismo dia de Bogota -> `hace 3 h`
 *   - dia anterior de Bogota -> `ayer 14:20`
 *   - mas atras -> `1 sep 14:20`
 *
 * EL CORTE DE "AYER" SE DECIDE POR DIA CALENDARIO, NO RESTANDO 24 HORAS. A las 00:30 de
 * Bogota, algo de las 23:30 dista una hora pero es de ayer, y decir "hace 1 h" cuando el
 * admin acaba de cambiar de dia laboral es justo el tipo de mentira silenciosa que D-14
 * existe para evitar. La comparacion se hace con `HOY_BOGOTA`, el mismo formateador con
 * `timeZone: TZ_BOGOTA` que usa `hoyBog()`: se compara la zona, no un offset escrito a
 * mano. Colombia no tiene DST desde 1993, asi que restar cinco horas tambien funcionaria
 * hoy, pero codificar el offset en vez de la zona es exactamente lo que este archivo ya
 * decidio no hacer.
 *
 * AQUI SI SE CONSTRUYE UN `Date`, y es correcto: la entrada es un INSTANTE
 * (`updated_at`, `created_at`), no un dia de negocio. Misma distincion que en
 * `horasDesdeDtstamp`.
 *
 * Devuelve `null` si la marca es nula o ilegible: el consumidor decide si omite la linea
 * o pinta otra cosa. Inventar un valor seria peor que no decir nada.
 */
export function tiempoRelativo(
  instante: number | string | null | undefined,
  ahoraMs: number,
): string | null {
  const ms = aMilisegundos(instante);
  if (ms === null) return null;

  // Un reloj adelantado (o un servidor con la hora corrida) daria negativo. Se trunca a
  // 0, misma regla que `horasDesdeDtstamp`: "hace 0 s" es cierto y "hace -3 h" no
  // significa nada para quien mira la pantalla.
  const transcurrido = Math.max(0, ahoraMs - ms);

  if (transcurrido < UN_MINUTO) {
    return `hace ${Math.floor(transcurrido / 1000)} s`;
  }

  if (transcurrido < UNA_HORA) {
    return `hace ${Math.floor(transcurrido / UN_MINUTO)} min`;
  }

  const diaDelInstante = HOY_BOGOTA.format(new Date(ms));
  const diaDeAhora = HOY_BOGOTA.format(new Date(ahoraMs));

  if (diaDelInstante === diaDeAhora) {
    return `hace ${Math.floor(transcurrido / UNA_HORA)} h`;
  }

  const hora = HORA_BOGOTA.format(new Date(ms));

  if (diaDelInstante === diaAnterior(diaDeAhora)) {
    return `ayer ${hora}`;
  }

  return `${formatFechaCortaBog(diaDelInstante)} ${hora}`;
}

/**
 * Normaliza la marca a milisegundos. Acepta numero (lo natural en tests y en un
 * `Date.now()`) y cadena ISO, que es como PostgREST devuelve un `timestamptz`.
 * Una cadena que `Date` no sabe leer da `NaN`, y eso es `null`, no un 1970.
 */
function aMilisegundos(instante: number | string | null | undefined): number | null {
  if (instante === null || instante === undefined || instante === '') return null;
  const ms = typeof instante === 'number' ? instante : Date.parse(instante);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Dia calendario anterior a un `'YYYY-MM-DD'`, en la misma forma.
 *
 * Se hace con `Date.UTC`, que normaliza el desbordamiento (`dia - 1 = 0` retrocede al
 * ultimo dia del mes anterior, y en enero al 31 de diciembre del ano anterior). No hay
 * conversion de zona: entra y sale un dia calendario, y el `'UTC'` del formateador es el
 * mismo ancla que usa `formatFechaBog`.
 */
const DIA_ISO = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'UTC',
});

function diaAnterior(iso: string): string {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return DIA_ISO.format(new Date(Date.UTC(ano, mes - 1, dia - 1)));
}

/**
 * Suma (o resta) dias a un dia de negocio `'YYYY-MM-DD'`, en la misma forma.
 *
 * AQUI SI SE CONSTRUYE UN INSTANTE, Y ES CORRECTO. Lo que la regla del proyecto
 * prohibe es LEER EL RELOJ para deducir el dia (`new Date()` a secas), porque
 * bajo UTC eso adelanta el dia durante las cinco horas de cada noche en que UTC
 * ya cambio y Bogota todavia no. Esto es otra cosa: aritmetica de calendario
 * sobre componentes que YA vienen resueltos —por `hoyBog()` o por la columna
 * `date` de la base— anclada explicitamente en UTC con `Date.UTC` y devuelta a
 * la misma forma de cadena. No hay ninguna zona implicada y el resultado no
 * depende de cuando corra el proceso.
 *
 * Se hace asi y no restando 86 400 000 milisegundos a mano porque el cruce de
 * mes y el ano bisiesto son exactamente los dos casos donde la resta a pelo
 * falla y donde nadie tiene un test.
 *
 * VIVE AQUI Y NO EN CADA CONSUMIDOR: es el mismo modulo que ya concentra
 * `hoyBog()` y `diaAnterior()`, y tener dos copias de estas cuatro lineas en
 * codigo de aplicacion es como una se queda atras. `lib/test/aseos.ts` conserva
 * la suya a proposito: el arnes de pruebas no importa modulos de aplicacion.
 */
export function sumarDias(fecha: string, dias: number): string {
  const [ano, mes, dia] = fecha.split('-').map(Number);
  return DIA_ISO.format(new Date(Date.UTC(ano, mes - 1, dia + dias)));
}

/**
 * Hora del reloj de Bogota de un INSTANTE: `"14:32"`.
 *
 * Es `HORA_BOGOTA` expuesto, y existe porque la marca de ultima actualizacion
 * (04-UI-SPEC.md §13.1) pinta el absoluto al lado del relativo. Reconstruir el
 * `Intl.DateTimeFormat` en el componente seria convertir un instante a mano fuera
 * de este archivo, que es justo lo que la cabecera prohibe.
 *
 * Devuelve `null` si la marca es nula o ilegible, misma regla que `tiempoRelativo`.
 */
export function formatHoraBog(instante: number | string | null | undefined): string | null {
  const ms = aMilisegundos(instante);
  return ms === null ? null : HORA_BOGOTA.format(new Date(ms));
}

/**
 * Instante completo en hora de Bogota: `"jue, 3 de septiembre, 14:32"`.
 *
 * Va SOLO en atributos `title`, nunca como texto visible: es el absoluto que
 * respalda un tiempo relativo (`hace 8 min`) en la fila del panel de alertas
 * (§11.3). Un relativo sin su absoluto detras obliga a hacer la cuenta a mano.
 *
 * El dia se resuelve con `HOY_BOGOTA` y se formatea con `formatFechaBog`, asi que
 * la conversion instante -> dia calendario pasa por la unica zona del repo y no
 * por una resta de cinco horas escrita a mano.
 */
export function formatInstanteBog(instante: number | string | null | undefined): string | null {
  const ms = aMilisegundos(instante);
  if (ms === null) return null;
  return `${formatFechaBog(HOY_BOGOTA.format(new Date(ms)))}, ${HORA_BOGOTA.format(new Date(ms))}`;
}
