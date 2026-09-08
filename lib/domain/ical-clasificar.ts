// CLASIFICACION DE TRES VALORES, Y FALLA CERRADA.
//
// Un evento del feed es una reserva, un bloqueo del propietario, o NO SE SABE. El
// tercer valor no es una comodidad: es la decision de diseno mas discutible de la
// fase, y quien la lea dentro de seis meses tiene que encontrar aqui el razonamiento
// y no solo la conclusion.
//
// LO QUE HACE `desconocido`: se persiste como evento, NO GENERA ASEO, y alerta.
//
// LOS CUATRO ARGUMENTOS DE POR QUE CERRADO Y NO ABIERTO:
//
//   1. La cola de fallar abierto no tiene techo. Los bloqueos que Airbnb emite por
//      la ventana de reserva salen como eventos de UN DIA. Un apartamento cerrado
//      tres meses son ~90 eventos, y tratados como reserva son 90 ASEOS FANTASMA en
//      una sola corrida y en un solo apartamento, con sus 90 notificaciones y sus 90
//      pagos presupuestados. Con 34 apartamentos eso no es ruido: es un dashboard
//      inutilizable. La cola de fallar cerrado, en cambio, esta acotada por el
//      numero de eventos que no clasifican.
//
//   2. El caso esperado no cuesta nada. Los 15 eventos del feed real capturado
//      clasifican `reserva` por la whitelist positiva. Fallar cerrado cuesta CERO hoy.
//
//   3. Hay salida humana en una direccion y no en la otra. Si falta un aseo, el
//      admin lo crea a mano (la Fase 4 tiene `repaso` y `emergencia`) y ademas cada
//      evento `desconocido` alerta. Si sobran 90 aseos fantasma, no existe ninguna
//      accion de un solo paso que los deshaga.
//
//   4. La asimetria del dominio apunta al otro lado: "un aseo de menos" deja a un
//      huesped en un apartamento sucio, y ese argumento solo empujaria a fallar
//      abierto. Lo que lo invierte es que el modo de fallo de fallar cerrado NO ES
//      SILENCIOSO —cada `desconocido` alerta— y que el colapso masivo lo atrapa la
//      guarda del plan 03-06 sobre RESERVAS CLASIFICADAS, no sobre eventos. Sin esa
//      guarda esta decision es una bomba: el dia que Airbnb cambie una cadena, los
//      eventos siguen llegando, el conteo no es cero, todos caen a `desconocido` y
//      el reconcile cancelaria todos los aseos del apartamento.
//
// ESTADO DE LA EVIDENCIA, y es lo que hay que releer antes de tocar estos dos regex:
//
//   - Discriminador por URL de detalle de reserva en la descripcion: MEDIA-ALTA.
//     432 snapshots de feeds reales: aparece en 1708/1708 eventos reservados y en
//     0/700 bloqueos. Es la evidencia mas fuerte que hay y es de SEGUNDA MANO, no
//     reproducible desde este repo.
//   - Discriminador por el resumen de no disponibilidad: MEDIA. Variantes historicas
//     documentadas por tres integradores distintos.
//   - NINGUNO ES ALTA, porque NO EXISTE UN SOLO BLOQUEO REAL DEL PROPIETARIO EN EL
//     REPO. El feed real capturado tiene cero. `solo-bloqueos.ics` y
//     `airbnb-bloqueos-1dia.ics` son sinteticas y se escribieron a partir de los
//     mismos documentos que validarian: usarlas como evidencia seria CIRCULAR.
//
//   Eso lo cierra el checkpoint humano del plan 03-10, que captura un `.ics` real con
//   fechas bloqueadas a mano y sustituye la fixture sintetica. No lo cierra ningun
//   test que se pueda escribir hoy.

import type { VEventoCrudo } from './ical';

export type Clasificacion = 'reserva' | 'bloqueo' | 'desconocido';

/**
 * La ruta de detalle de reserva dentro de la descripcion, ya desdoblada y
 * desescapada. Es la whitelist POSITIVA: se pide que algo ESTE, no que algo falte.
 */
const RE_RESERVA = /reservations\/details\/[A-Z0-9]{6,}/i;

/**
 * El resumen de no disponibilidad, con sus tres variantes historicas documentadas:
 * la forma entre parentesis del proveedor, la forma suelta, y la forma corta.
 */
const RE_BLOQUEO = /\b(not\s*available|unavailable|blocked)\b/i;

/**
 * Clasifica un evento crudo en uno de los tres valores.
 *
 * ORDEN DE LAS RAMAS, y no es arbitrario: primero la descripcion, despues el
 * resumen.
 *
 * MEDIDO (senuelo del plan 03-02): invertir las dos ramas NO pone en rojo NI UNA
 * asercion sobre una fixture. Ni las 15 reservas del feed real, ni los 90 bloqueos,
 * ni los 3 desconocidos, ni los 15 del descriptor mutilado se mueven, porque en las
 * muestras que existen los dos discriminadores estan correlacionados al 100%: ningun
 * evento trae a la vez la URL de reserva y el resumen de no disponibilidad. Lo unico
 * que cae es un test SINTETICO, escrito a mano para fijar esta decision. Esa es la
 * debilidad declarada de esta clasificacion, y la cierra la captura humana del plan
 * 03-10, no un test.
 *
 * Se deja el orden que respalda la mejor evidencia: la descripcion, que ademas es de
 * donde sale el codigo de reserva que el resto del pipeline necesita para identificar.
 */
export function clasificar(ev: VEventoCrudo): Clasificacion {
  // EL DEFECTO DE FORMA GANA. Un evento cuya fecha no es un dia completo no tiene
  // fecha de aseo que no sea adivinada, y adivinar la zona horaria es el modo de
  // fallo documentado de los feeds "que sincronizan pero mal". Va antes que todo lo
  // demas, aunque el evento traiga la URL de reserva.
  if (!ev.interpretable) return 'desconocido';

  if (ev.description && RE_RESERVA.test(ev.description)) return 'reserva';
  if (ev.summary && RE_BLOQUEO.test(ev.summary)) return 'bloqueo';

  return 'desconocido';
}
