// LA FRONTERA DE PRIVACIDAD DE LA FASE. Aqui muere el telefono del huesped.
//
// El `DESCRIPTION` del feed de Airbnb trae los ultimos cuatro digitos del telefono
// del huesped. Ningun documento de research lo contemplaba: todos afirmaban que
// Airbnb dejo de mandar datos personales en 2019. Se descubrio midiendo el feed real.
//
// LA GARANTIA NO ES UNA CONVENCION NI UN BORRADO: ES EL TIPO. `EventoNormalizado` no
// tiene ranura donde poner la descripcion. No es que se limpie, es que no existe el
// campo. Pasar el telefono hacia adelante tiene que ser un error de compilacion, no
// un descuido de revision. Si algun dia alguien "necesita" la descripcion aguas
// abajo, que se estrelle contra el compilador y venga a leer este comentario.
//
// Tres capas mas, y ninguna sustituye a esta:
//   - la columna homologa de la tabla de reservas se queda NULA para siempre,
//     impuesto por un CHECK en la migracion 11;
//   - el guardarrail 9 de CI prohibe que ningun archivo de aplicacion siquiera
//     NOMBRE esa columna;
//   - el guardarrail 10 prohibe construir objetos de fecha en este archivo.
//
// EN ESTE ARCHIVO NO SE CONSTRUYE NI UN SOLO OBJETO DE FECHA. Los dias de negocio se
// obtienen por corte de cadena sobre los ocho digitos crudos.

import { createHash } from 'node:crypto';

import { clasificar, type Clasificacion } from './ical-clasificar';
import { aIso, parsearIcs } from './ical';

/**
 * Lo que sale hacia la base.
 *
 * NO TIENE CAMPO PARA LA DESCRIPCION, y esa ausencia es la garantia de privacidad de
 * toda la fase. Ver el encabezado del archivo antes de anadir un campo aqui.
 */
export type EventoNormalizado = {
  uid: string | null;
  /** `'HME3F6BX75'`. Solo el identificador de la ruta, NUNCA la URL entera. */
  reservationCode: string | null;
  /** `'Reserved'`, `'Airbnb (Not available)'`… No contiene dato personal. */
  summary: string | null;
  /** `'YYYY-MM-DD'` por corte de cadena. `null` si el evento no es interpretable. */
  startsOn: string | null;
  /**
   * `'YYYY-MM-DD'` por corte de cadena. `null` si el evento no es interpretable.
   *
   * ES EL DIA DEL ASEO, SIN SUMAR NI RESTAR NADA. El fin es exclusivo en el formato
   * y coincide exactamente con el dia en que el calendario libera el apartamento:
   * una reserva de una noche que empieza el 3 y termina el 4 tiene checkout el 4.
   * Es la regla de dominio que mas veces se ha roto en proyectos de este tipo, y
   * correrla un dia significa mandar a la aseadora con el huesped todavia dentro.
   */
  endsOn: string | null;
  clasificacion: Clasificacion;
  /** sha256 sobre los campos de arriba. NUNCA sobre el evento crudo. */
  payloadHash: string;
};

/**
 * El codigo de reserva vive dentro de la URL de la descripcion, y el plegado a 75
 * octetos lo parte por la mitad; para cuando llega aqui ya viene desdoblado.
 *
 * Se captura SOLO el identificador de la ruta. Ni la URL entera ni nada de lo que
 * viene detras, que es justamente donde vive el telefono.
 */
const RE_CODIGO = /reservations\/details\/([A-Z0-9]{6,})/i;

/**
 * Separador y marca de nulo del material del hash: los dos primeros caracteres de
 * control del repertorio.
 *
 * RFC 5545 §3.1 define el valor de una linea de contenido como texto SIN caracteres
 * de control (salvo el tabulador), asi que ninguno de los dos puede aparecer dentro
 * de un campo y la concatenacion queda libre de ambiguedad: dos entradas distintas
 * no pueden producir el mismo material. La marca de nulo es un caracter DISTINTO del
 * separador para que un campo ausente y un campo vacio no colisionen.
 *
 * Se construyen por codigo y no con una secuencia de escape literal para que el
 * archivo fuente siga siendo texto puro y ninguna herramienta lo trate como binario.
 */
const SEP = String.fromCharCode(0);
const NULO = String.fromCharCode(1);

/**
 * `payloadHash` SOBRE LOS CAMPOS NORMALIZADOS, nunca sobre el evento crudo. Dos
 * razones y las dos importan:
 *
 *   1. Un hash del crudo seria un derivado PERSISTIDO del dato personal. Que sha256
 *      no sea reversible no lo convierte en un dato distinto: con cuatro digitos el
 *      espacio de busqueda son 10.000 intentos.
 *   2. Cambiaria cada vez que Airbnb rotara un digito del telefono sin que cambiara
 *      nada relevante, y cada corrida veria un diff donde no hubo cambio.
 */
function hashDe(campos: (string | null)[]): string {
  const material = campos.map((c) => (c === null ? NULO : c)).join(SEP);
  return createHash('sha256').update(material, 'utf8').digest('hex');
}

/**
 * Lee el cuerpo de un feed y devuelve sus eventos ya normalizados y clasificados.
 *
 * Los eventos NO INTERPRETABLES (fecha con hora y zona, o fecha ausente) tambien
 * salen, con las fechas en nulo y clasificados `desconocido`. Descartarlos aqui
 * seria perder un evento en silencio, que es exactamente el modo de fallo contra el
 * que se escribio el parser propio: el pipeline los necesita para alertar.
 */
export function normalizarIcs(cuerpo: string): EventoNormalizado[] {
  const { eventos } = parsearIcs(cuerpo);

  return eventos.map((ev) => {
    // La descripcion se LEE aqui y no sale de esta funcion. Lo unico que la
    // sobrevive es el identificador de la ruta.
    const m = ev.description ? RE_CODIGO.exec(ev.description) : null;
    const reservationCode = m ? m[1] : null;

    const startsOn = ev.interpretable && ev.dtstart ? aIso(ev.dtstart) : null;
    const endsOn = ev.interpretable && ev.dtend ? aIso(ev.dtend) : null;

    return {
      uid: ev.uid,
      reservationCode,
      summary: ev.summary,
      startsOn,
      endsOn,
      clasificacion: clasificar(ev),
      payloadHash: hashDe([ev.uid, startsOn, endsOn, ev.summary, reservationCode]),
    };
  });
}
