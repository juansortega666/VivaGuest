// DIAGNÓSTICO, NO PIPELINE. Solo APTO-12.
//
// COSTURA CON LA FASE 3, explícita y deliberada. Este archivo existe para que la
// pantalla de "Conectar calendario" pueda decirle al admin cuántas reservas trae
// el link que acaba de pegar y cuál es el próximo checkout. Nada más. NO persiste
// reservas, NO crea aseos, NO decide la identidad de una reserva (¿UID estable?
// ¿código de reserva? ¿upsert por clave natural?), que es justo la pregunta que
// bloquea la Fase 3 y que aquí no hace falta responder.
//
// La Fase 3 escribe el parser real (probablemente `node-ical`, contra un `.ics`
// real) y decide si absorbe o borra este archivo. Es UN SOLO archivo que borrar.
//
// NADIE DEBE "ARREGLAR" LA DIVERGENCIA entre lo que cuenta este preview y lo que
// contará el pipeline: el preview es deliberadamente MÁS LAXO. Si la Fase 3
// refina la clasificación, los números pueden diferir, y eso es aceptable.
// Reintroducir aquí la lógica de la Fase 3 es exactamente lo que no se debe hacer.
//
// NO SE CONSTRUYE NI UN SOLO OBJETO `Date` EN ESTE ARCHIVO, a propósito. Ver el
// comentario de `proximoCheckout` más abajo y PITFALLS §2.

/**
 * `DTEND` como fecha pura: `DTEND;VALUE=DATE:20260904` o `DTEND:20260904`.
 * Solo 8 dígitos: una forma con hora no es lo que Airbnb sirve y se ignora.
 */
const RE_DTEND_DATE = /^DTEND(?:;[^:]*)?:(\d{8})\s*$/i;

/** `DTSTAMP` del `VCALENDAR`. Alimenta el "El feed se actualizó hace 2 h." del estado 4. */
const RE_DTSTAMP = /^DTSTAMP(?:;[^:]*)?:(\S+)\s*$/i;

/** La línea de `DESCRIPTION`, ya desdoblada. */
const RE_DESCRIPTION = /^DESCRIPTION(?:;[^:]*)?:/i;

/**
 * La URL de detalle de reserva dentro de la `DESCRIPTION`.
 *
 * WHITELIST POSITIVA, y no clasificación por `SUMMARY`. Evidencia: los 432
 * snapshots de feeds reales de `research/STACK.md` — `DESCRIPTION` con
 * `Reservation URL` aparece en los 1708 eventos `Reserved` y en NINGUNO de los
 * 700 `Airbnb (Not available)`. Contar "todo VEVENT" mezclaría los bloqueos del
 * propietario: un apartamento cerrado 3 meses diría "8 reservas" teniendo 0, y
 * eso rompe la única función del número, que es verificar que el link es el del
 * apartamento correcto.
 */
const RE_RESERVA = /reservations\/details\/[A-Z0-9]+/i;

/**
 * RFC 5545 §3.1: una línea física que empieza por espacio o tabulador es la
 * continuación de la anterior.
 *
 * Sin esto NADA funciona: Airbnb pliega la `DESCRIPTION` a 75 octetos y parte el
 * código de reserva por la mitad, así que `RE_RESERVA` no matchea y el conteo da
 * 0 reservas en un feed lleno. Medido contra `__fixtures__/ical/folded.ics`.
 */
export function desdoblar(texto: string): string {
  return texto.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
}

export type PreviewIcs =
  | { ok: false; motivo: 'no-es-ical' }
  | {
      ok: true;
      totalEventos: number;
      reservas: number;
      bloqueos: number;
      /** `'YYYY-MM-DD'`. El `DTEND` tal cual, sin sumar ni restar un día. */
      proximoCheckout: string | null;
      /** El `DTSTAMP` crudo del `VCALENDAR`, o `null` si el feed no lo trae. */
      dtstamp: string | null;
    };

/** `'20260904'` → `'2026-09-04'`. Puro corte de cadena: ni parseo, ni zona horaria. */
function aIso(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

/**
 * Escanea el cuerpo de un feed iCal y devuelve los cuatro hechos que APTO-12
 * necesita mostrar en pantalla.
 *
 * @param cuerpo Texto crudo traído por el `fetch` del servidor.
 * @param hoyIso Fecha de negocio en formato `'YYYY-MM-DD'`. Se pasa como
 *   parámetro y no se calcula aquí para que la función sea pura y determinista.
 */
export function previsualizarIcs(cuerpo: string, hoyIso: string): PreviewIcs {
  // SNIFF ANTES DE CONTAR. Un feed muerto de Airbnb responde HTTP 200 con una
  // página de error en HTML. Sin este corte, el escáner recorrería el HTML, no
  // encontraría eventos y reportaría "0 reservas": el admin guardaría un link
  // roto creyendo que sirve, y se enteraría días después. Es el modo de falla
  // más peligroso de esta pantalla, y por eso "no es un calendario" y "es un
  // calendario vacío" son DOS estados de UI distintos (UI-SPEC §10.3, 6 vs 5).
  if (!/BEGIN:VCALENDAR/i.test(cuerpo)) return { ok: false, motivo: 'no-es-ical' };

  const lineas = desdoblar(cuerpo).split('\n');

  let totalEventos = 0;
  let reservas = 0;
  let dtstamp: string | null = null;
  let proximoCheckout: string | null = null;

  let dentroDeEvento = false;
  let esReserva = false;
  let dtendEvento: string | null = null;

  for (const cruda of lineas) {
    // El `\r` suelto de un feed con finales de línea mezclados.
    const linea = cruda.replace(/\r$/, '');

    if (/^BEGIN:VEVENT\s*$/i.test(linea)) {
      dentroDeEvento = true;
      esReserva = false;
      dtendEvento = null;
      continue;
    }

    if (/^END:VEVENT\s*$/i.test(linea)) {
      totalEventos += 1;
      if (esReserva) reservas += 1;

      // El próximo checkout considera TODOS los eventos, no solo las reservas:
      // un bloqueo que termina también libera el apartamento.
      //
      // Comparación de CADENAS, no de fechas. Para el formato `'YYYY-MM-DD'` el
      // orden lexicográfico y el cronológico coinciden, así que esto es correcto
      // y además hace imposible el off-by-one de `DTEND`: nunca se construye un
      // `Date`, así que no hay zona horaria que pueda correr la fecha un día.
      //
      // `>=` y no `>`: el checkout de HOY sigue siendo un checkout pendiente.
      if (dtendEvento !== null && dtendEvento >= hoyIso) {
        if (proximoCheckout === null || dtendEvento < proximoCheckout) {
          proximoCheckout = dtendEvento;
        }
      }

      dentroDeEvento = false;
      continue;
    }

    if (dentroDeEvento) {
      const mDtend = RE_DTEND_DATE.exec(linea);
      if (mDtend) {
        // `DTEND` es exclusivo (RFC 5545) y ES el día del aseo: el huésped se va
        // ese día. NO se le suma ni se le resta nada. Una reserva de una noche
        // con DTSTART 20260903 / DTEND 20260904 tiene checkout el 2026-09-04.
        dtendEvento = aIso(mDtend[1]);
        continue;
      }
      if (RE_DESCRIPTION.test(linea) && RE_RESERVA.test(linea)) {
        esReserva = true;
      }
      continue;
    }

    // Fuera de un VEVENT: el DTSTAMP de aquí es el del VCALENDAR. Se queda con el
    // primero, que es el que Airbnb pone en la cabecera.
    if (dtstamp === null) {
      const mStamp = RE_DTSTAMP.exec(linea);
      if (mStamp) dtstamp = mStamp[1];
    }
  }

  return {
    ok: true,
    totalEventos,
    reservas,
    bloqueos: totalEventos - reservas,
    proximoCheckout,
    dtstamp,
  };
}
