// LAS GUARDAS QUE DECIDEN SI HAY ALGO QUE DIFFEAR. LOGICA PURA, SIN RED.
//
// ════════════════════════════════════════════════════════════════════════════
// AQUI VIVE LA DECISION QUE HACE SEGURA TODA LA FASE.
//
// Si el worker llama a `sync_feed_apply()` con una lectura degradada, NINGUN
// candado del RPC sirve: el RPC estaria razonando sobre datos falsos y
// creyendoselos. Sus cuatro candados de cancelacion protegen contra una reserva
// que desaparece; no protegen contra un cuerpo que llego roto y parecio decir
// que no hay ninguna reserva.
//
// Estan aqui y no dentro de `route.ts` por una razon concreta: dentro del route
// handler NO SE PUEDEN MEDIR. Un route handler necesita red, base y secreto para
// ejercitarse, y el senuelo que demuestra que la guarda de colapso mira lo que
// tiene que mirar quedaria sin comprobar. Aqui es una funcion de cadena a
// veredicto y su senuelo se mide en `ical-guardas.test.ts`.
// ════════════════════════════════════════════════════════════════════════════

import { normalizarIcs, type EventoNormalizado } from './ical-normalizar';
import { parsearIcs } from './ical';

/**
 * Por que una lectura NO sirve para diffear. Lista cerrada: acaba en
 * `calendar_feeds.last_error`, que es una columna que el admin ve en pantalla y
 * que nunca puede llevar un trozo del cuerpo del feed (el `DESCRIPTION` trae los
 * ultimos cuatro digitos del telefono del huesped).
 *
 * `lib/data/sync.ts` la importa y la extiende con los codigos de TRANSPORTE, que
 * son suyos porque nacen del `fetch` y no del cuerpo. La direccion de la
 * dependencia es `data -> domain` y nunca al reves.
 */
export type MotivoDeLecturaInutil =
  /** El proveedor respondio 2xx con una pagina de error HTML. */
  | 'content_type_html'
  /** 2xx con un cuerpo que ni siquiera abre calendario. */
  | 'no_es_ical'
  /** Abre calendario pero no cierra: respuesta parcial de red. */
  | 'cuerpo_truncado'
  /** Hubo cuerpo y se clasifico, pero CERO reservas donde antes habia. */
  | 'cero_reservas_clasificadas';

/** Los cuatro contadores de la corrida. Los escribe `feed_sync_runs`. */
export type ConteosDeLectura = {
  event_count: number;
  reservation_count: number;
  block_count: number;
  unknown_count: number;
};

export type Lectura =
  | { usable: true; eventos: EventoNormalizado[]; conteos: ConteosDeLectura }
  | { usable: false; motivo: MotivoDeLecturaInutil; conteos: ConteosDeLectura | null };

/**
 * `Content-Type` de HTML.
 *
 * Un feed muerto de Airbnb responde 200 con su pagina de error, y sin este corte
 * el pipeline reportaria "cero reservas" sobre un link roto. Se compara el tipo
 * base, ignorando parametros como el juego de caracteres.
 */
export function esHtml(contentType: string | null): boolean {
  if (!contentType) return false;
  return contentType.split(';')[0].trim().toLowerCase() === 'text/html';
}

export function contarPorClasificacion(eventos: EventoNormalizado[]): ConteosDeLectura {
  return {
    event_count: eventos.length,
    reservation_count: eventos.filter((e) => e.clasificacion === 'reserva').length,
    block_count: eventos.filter((e) => e.clasificacion === 'bloqueo').length,
    unknown_count: eventos.filter((e) => e.clasificacion === 'desconocido').length,
  };
}

/**
 * LA GUARDA DE COLAPSO. VA SOBRE RESERVAS CLASIFICADAS, NO SOBRE EVENTOS.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESTE ES EL ACOPLAMIENTO MAS IMPORTANTE DEL DISENO DE LA FASE Y NO ESTA EN
 * NINGUN DOCUMENTO DE RESEARCH.
 *
 * `ARCHITECTURE.md` propone `eventos.length === 0 && last_event_count > 0`. Con
 * una clasificacion de tres valores ESO NO BASTA, y no es una hipotesis:
 * `airbnb-desc-mutilado.ics` es la medicion. Si el proveedor cambia la forma de
 * la URL que va dentro del `DESCRIPTION`:
 *
 *   · los quince eventos SIGUEN LLEGANDO;
 *   · `eventos.length` sigue valiendo quince, asi que la guarda por conteo de
 *     eventos NO SALTA;
 *   · los quince caen a `desconocido` porque el discriminador positivo dejo de
 *     casar;
 *   · con cero reservas vivas, el reconcile del plan 03-05 marcaria las quince
 *     ausentes y, dos corridas despues, CANCELARIA LOS QUINCE ASEOS del
 *     apartamento.
 *
 * Sin esta guarda, la decision de fallar cerrado del clasificador es una bomba:
 * el dia que Airbnb cambie una cadena se pierde un mes de trabajo.
 *
 * La comparacion es homogenea porque `calendar_feeds.last_event_count` guarda el
 * numero de RESERVAS, no de eventos, por decision explicita del plan 02-14. Esa
 * columna NO se puede redefinir: es lo que la pantalla de calendario muestra
 * como verificacion humana del link Y es el operando de esta guarda.
 *
 * `> 0` y no `>= 0`: un feed que nunca ha tenido reservas y sigue sin tenerlas
 * no es un colapso, es un apartamento vacio. Solo salta cuando ANTES habia y
 * AHORA no hay.
 * ════════════════════════════════════════════════════════════════════════════
 */
export function hayColapso(conteos: ConteosDeLectura, reservasAnteriores: number): boolean {
  return conteos.reservation_count === 0 && reservasAnteriores > 0;
}

/**
 * El veredicto completo sobre un cuerpo recien descargado.
 *
 * El orden importa y es de mas barato a mas caro, y de mas grosero a mas fino:
 * el tipo de contenido no cuesta nada, el sniff de cabecera cuesta un `indexOf`,
 * la comprobacion de cierre cuesta un parseo, y la de colapso cuesta ademas
 * clasificar. Ademas es el orden que produce el diagnostico mas util: decir
 * `content_type_html` es mas informativo que decir `no_es_ical` sobre lo mismo.
 *
 * `reservasAnteriores` es `calendar_feeds.last_event_count`, que son RESERVAS.
 */
export function evaluarLectura(entrada: {
  contentType: string | null;
  cuerpo: string;
  reservasAnteriores: number;
}): Lectura {
  if (esHtml(entrada.contentType)) {
    return { usable: false, motivo: 'content_type_html', conteos: null };
  }

  const documento = parsearIcs(entrada.cuerpo);

  if (!documento.esCalendario) {
    return { usable: false, motivo: 'no_es_ical', conteos: null };
  }

  // EL SNIFF DE CABECERA NO BASTA, Y ESTA ES LA GUARDA QUE LO DICE. Un cuerpo
  // cortado a mitad del octavo evento SI empieza por la cabecera de calendario,
  // asi que la validacion de la Fase 2 lo deja pasar. Tratarlo como una lectura
  // buena convierte una respuesta parcial de red en la desaparicion de siete
  // reservas.
  if (!documento.completo) {
    return { usable: false, motivo: 'cuerpo_truncado', conteos: null };
  }

  const eventos = normalizarIcs(entrada.cuerpo);
  const conteos = contarPorClasificacion(eventos);

  if (hayColapso(conteos, entrada.reservasAnteriores)) {
    return { usable: false, motivo: 'cero_reservas_clasificadas', conteos };
  }

  return { usable: true, eventos, conteos };
}
